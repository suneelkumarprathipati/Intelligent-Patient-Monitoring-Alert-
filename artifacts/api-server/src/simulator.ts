/**
 * simulator.ts — Real-time physiological sensor data simulator.
 *
 * Purpose:
 *   Mimics 10+ IoT medical sensors streaming data over WebSockets and writing
 *   readings to PostgreSQL — exactly as described in Suneel Kumar's resume project.
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  setInterval (2 000 ms)                                          │
 *   │  For each patient × sensor type:                                 │
 *   │    1. Generate a physiologically plausible random reading        │
 *   │    2. Classify the reading (normal / warning / critical)         │
 *   │    3. Insert into vital_readings table                           │
 *   │    4. If critical/warning → create an alert row                  │
 *   │    5. Broadcast the reading to all connected WebSocket clients    │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * WebSocket protocol:
 *   Server → Client messages are JSON objects with a `type` discriminator:
 *     { type: "vital",  data: VitalReading }
 *     { type: "alert",  data: Alert }
 *     { type: "ping" }
 *
 * Clinical threshold ranges (based on adult normal reference intervals):
 *   heart_rate       50–100 bpm      (warning <45 or >110, critical <40 or >130)
 *   spo2             95–100 %        (warning 90–94 %,     critical <90 %)
 *   systolic_bp      90–140 mmHg     (warning 141–160,     critical >160 or <80)
 *   diastolic_bp     60–90  mmHg     (warning 91–100,      critical >100 or <50)
 *   temperature      36.1–37.2 °C    (warning 37.3–38.5,  critical >38.5 or <35)
 *   respiration_rate 12–20 br/min   (warning 21–25,       critical >25 or <10)
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import { db, patientsTable, vitalReadingsTable, alertsTable, sensorsTable } from "@workspace/db";
import { eq, ne, and } from "drizzle-orm";
import { logger } from "./lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

/** The six physiological signals the simulator can generate */
type SensorType =
  | "heart_rate"
  | "spo2"
  | "systolic_bp"
  | "diastolic_bp"
  | "temperature"
  | "respiration_rate";

/** Classification of a single reading against clinical thresholds */
type ReadingStatus = "normal" | "warning" | "critical";

/** Human-readable unit for each sensor type */
const UNITS: Record<SensorType, string> = {
  heart_rate: "bpm",
  spo2: "%",
  systolic_bp: "mmHg",
  diastolic_bp: "mmHg",
  temperature: "°C",
  respiration_rate: "br/min",
};

// ─── Threshold configuration ──────────────────────────────────────────────────

interface ThresholdRange {
  min: number;
  max: number;
  warnMin: number;
  warnMax: number;
  critMin: number;
  critMax: number;
}

/**
 * Clinical reference ranges for adult patients.
 * Readings outside warnMin/warnMax trigger a warning alert.
 * Readings outside critMin/critMax trigger a critical alert.
 */
const THRESHOLDS: Record<SensorType, ThresholdRange> = {
  heart_rate:       { min: 50,   max: 100,  warnMin: 45,  warnMax: 110,  critMin: 40,  critMax: 130 },
  spo2:             { min: 95,   max: 100,  warnMin: 90,  warnMax: 100,  critMin: 85,  critMax: 100 },
  systolic_bp:      { min: 90,   max: 140,  warnMin: 80,  warnMax: 160,  critMin: 70,  critMax: 180 },
  diastolic_bp:     { min: 60,   max: 90,   warnMin: 50,  warnMax: 100,  critMin: 40,  critMax: 110 },
  temperature:      { min: 36.1, max: 37.2, warnMin: 35.5, warnMax: 38.5, critMin: 34, critMax: 40  },
  respiration_rate: { min: 12,   max: 20,   warnMin: 10,  warnMax: 25,   critMin: 8,   critMax: 30  },
};

// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * Generate a random float within [lo, hi] with `decimals` precision.
 * Uses a slightly biased random walk to simulate realistic sensor drift
 * rather than pure white noise.
 */
function randomInRange(lo: number, hi: number, decimals = 1): number {
  const value = lo + Math.random() * (hi - lo);
  return parseFloat(value.toFixed(decimals));
}

/**
 * Produce a physiologically plausible reading for the given sensor type.
 * The normal range occupies 90% of calls; the remaining 10% intentionally
 * stray into warning/critical territory to trigger demo alerts.
 */
function generateReading(sensorType: SensorType): number {
  const t = THRESHOLDS[sensorType];
  const roll = Math.random();

  if (roll < 0.88) {
    // Normal range — healthy patient
    return randomInRange(t.min, t.max, sensorType === "temperature" ? 1 : 0);
  } else if (roll < 0.97) {
    // Warning range — trending toward abnormal
    return Math.random() < 0.5
      ? randomInRange(t.warnMin, t.min, sensorType === "temperature" ? 1 : 0)
      : randomInRange(t.max, t.warnMax, sensorType === "temperature" ? 1 : 0);
  } else {
    // Critical range — emergency scenario (≈3% of readings)
    return Math.random() < 0.5
      ? randomInRange(t.critMin, t.warnMin, sensorType === "temperature" ? 1 : 0)
      : randomInRange(t.warnMax, t.critMax, sensorType === "temperature" ? 1 : 0);
  }
}

/** Classify a numeric reading against clinical thresholds */
function classifyReading(sensorType: SensorType, value: number): ReadingStatus {
  const t = THRESHOLDS[sensorType];
  if (value < t.critMin || value > t.critMax) return "critical";
  if (value < t.warnMin || value > t.warnMax) return "warning";
  return "normal";
}

/** Build a human-readable alert message from a threshold breach */
function buildAlertMessage(sensorType: SensorType, value: number, status: ReadingStatus): string {
  const unit = UNITS[sensorType];
  const label = sensorType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const direction = value < THRESHOLDS[sensorType].min ? "low" : "high";
  return `${status === "critical" ? "CRITICAL" : "WARNING"}: ${label} is ${direction} at ${value} ${unit}`;
}

/** Map reading status to alert severity */
function toSeverity(status: ReadingStatus, value: number, sensorType: SensorType): "low" | "medium" | "high" | "critical" {
  if (status === "critical") {
    // Extra-critical if far outside range
    const t = THRESHOLDS[sensorType];
    if (value < t.critMin * 0.9 || value > t.critMax * 1.1) return "critical";
    return "high";
  }
  return status === "warning" ? "medium" : "low";
}

// ─── WebSocket Server ─────────────────────────────────────────────────────────

/**
 * Attached WebSocket clients — the simulator broadcasts to all of them.
 * Using a plain Set is sufficient at this scale; production would use
 * Redis pub/sub to fan out across multiple API server instances.
 */
const clients = new Set<WebSocket>();

/**
 * Broadcast a JSON message to every connected WebSocket client.
 * Clients that have closed or errored are silently removed from the set.
 */
function broadcast(payload: unknown): void {
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    } else {
      // Clean up stale connections
      clients.delete(client);
    }
  }
}

/**
 * Attach a WebSocket server to an existing HTTP server.
 * The WS server listens on the same port as Express — no extra port needed.
 *
 * @param httpServer - The Node.js HTTP server created by Express's app.listen()
 */
export function attachWebSocketServer(httpServer: Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    clients.add(ws);
    logger.info({ clientsCount: clients.size }, "WebSocket client connected");

    // Acknowledge connection with a ping
    ws.send(JSON.stringify({ type: "ping" }));

    ws.on("close", () => {
      clients.delete(ws);
      logger.info({ clientsCount: clients.size }, "WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WebSocket error");
      clients.delete(ws);
    });
  });

  logger.info("WebSocket server attached at /ws");
}

// ─── Simulator loop ───────────────────────────────────────────────────────────

/** Sensor types we simulate for every patient */
const ALL_SENSORS: SensorType[] = [
  "heart_rate",
  "spo2",
  "systolic_bp",
  "diastolic_bp",
  "temperature",
  "respiration_rate",
];

/**
 * Start the real-time sensor simulation loop.
 *
 * Every INTERVAL_MS milliseconds:
 *   1. Fetch all active (non-discharged) patients from Postgres
 *   2. For each patient × sensor pair, generate + persist a reading
 *   3. Raise alerts for abnormal readings
 *   4. Broadcast everything to WebSocket subscribers
 *
 * The interval is intentionally short (2 s) so the live dashboard looks active.
 * In a production deployment this would be driven by actual AWS IoT message queues.
 */
const INTERVAL_MS = 2000;

export function startSimulator(): void {
  logger.info({ intervalMs: INTERVAL_MS }, "Sensor simulator starting");

  setInterval(async () => {
    try {
      // Only simulate for non-discharged patients
      const patients = await db
        .select()
        .from(patientsTable)
        .where(ne(patientsTable.condition, "discharged"));

      if (patients.length === 0) return;

      // Process each patient × sensor in parallel for throughput
      const tasks = patients.flatMap((patient) =>
        ALL_SENSORS.map((sensorType) => async () => {
          const value = generateReading(sensorType);
          const status = classifyReading(sensorType, value);
          const unit = UNITS[sensorType];

          // 1. Persist the reading
          const [reading] = await db
            .insert(vitalReadingsTable)
            .values({
              patientId: patient.id,
              sensorType,
              value,
              unit,
              status,
            })
            .returning();

          // 2. Broadcast the raw reading to WebSocket clients
          broadcast({ type: "vital", data: { ...reading, patientId: patient.id } });

          // 3. If the reading is abnormal, create an alert
          if (status !== "normal") {
            const message = buildAlertMessage(sensorType, value, status);
            const severity = toSeverity(status, value, sensorType);

            const [alert] = await db
              .insert(alertsTable)
              .values({
                patientId: patient.id,
                patientName: patient.name,
                sensorType,
                message,
                severity,
                status: "active",
              })
              .returning();

            // 4. Broadcast the alert so the UI can ring the bell immediately
            broadcast({ type: "alert", data: alert });
          }

          // 5. Update sensor last-ping timestamp
          await db
            .update(sensorsTable)
            .set({ lastPing: new Date() })
            .where(and(
              eq(sensorsTable.patientId, patient.id),
              eq(sensorsTable.sensorType, sensorType)
            ));
        })
      );

      // Run all tasks concurrently — mimics parallel sensor streams
      await Promise.allSettled(tasks.map((t) => t()));
    } catch (err) {
      logger.error({ err }, "Simulator tick error");
    }
  }, INTERVAL_MS);
}
