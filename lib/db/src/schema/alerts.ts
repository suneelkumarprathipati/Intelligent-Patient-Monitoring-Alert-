/**
 * alerts.ts — Drizzle ORM schema for the alerts table.
 *
 * An alert is created automatically by the sensor-simulator whenever a
 * vital reading crosses a clinical threshold.  The lifecycle is:
 *
 *   active  →  acknowledged  →  resolved
 *
 * Clinicians acknowledge alerts to indicate they are aware, and resolve
 * them once the situation has been managed.
 */
import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";

// ─── Table Definition ──────────────────────────────────────────────────────────
export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),

  /** Foreign key — the patient this alert is raised for */
  patientId: integer("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),

  /** Denormalised patient name so alerts remain readable after discharge */
  patientName: text("patient_name").notNull(),

  /** Which sensor triggered the alert (e.g. 'heart_rate', 'spo2') */
  sensorType: text("sensor_type").notNull(),

  /** Human-readable description of the threshold breach */
  message: text("message").notNull(),

  /**
   * Clinical severity:
   *   low      — mild deviation, monitor closely
   *   medium   — significant deviation, evaluate soon
   *   high     — severe deviation, urgent attention needed
   *   critical — life-threatening, immediate intervention required
   */
  severity: text("severity").notNull(), // 'low' | 'medium' | 'high' | 'critical'

  /** Current lifecycle state of the alert */
  status: text("status").notNull().default("active"), // 'active' | 'acknowledged' | 'resolved'

  /** When the threshold was first breached */
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),

  /** When a clinician acknowledged awareness of this alert */
  acknowledgedAt: timestamp("acknowledged_at"),

  /** When the situation was resolved and the alert closed */
  resolvedAt: timestamp("resolved_at"),
});

/** Shape returned by GET /alerts */
export type Alert = typeof alertsTable.$inferSelect;
