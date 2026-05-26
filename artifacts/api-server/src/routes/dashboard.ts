/**
 * dashboard.ts — Express router for aggregate dashboard statistics.
 *
 * Routes:
 *   GET /api/dashboard/stats — returns a single summary object used by the
 *                              top-level monitoring dashboard to display KPI tiles.
 *
 * This endpoint runs several COUNT queries in parallel (Promise.all) to keep
 * latency low.  In a high-traffic production system these counts would be
 * cached in Redis with a short TTL to avoid repeated full-table scans.
 */
import { Router } from "express";
import { eq, count, sql } from "drizzle-orm";
import { db, patientsTable, alertsTable, sensorsTable } from "@workspace/db";

const router = Router();

// ─── GET /dashboard/stats ─────────────────────────────────────────────────────
router.get("/dashboard/stats", async (req, res) => {
  try {
    /**
     * Execute all aggregate queries concurrently — each is an independent
     * read, so running them in parallel cuts response time significantly
     * compared to sequential awaits.
     */
    const [
      patientCounts,
      alertCounts,
      sensorCounts,
      alertSeverityCounts,
    ] = await Promise.all([
      // Patient breakdown by condition
      db
        .select({ condition: patientsTable.condition, cnt: count() })
        .from(patientsTable)
        .groupBy(patientsTable.condition),

      // Alert breakdown by status
      db
        .select({ status: alertsTable.status, cnt: count() })
        .from(alertsTable)
        .groupBy(alertsTable.status),

      // Sensor counts — total and currently active
      db
        .select({ isActive: sensorsTable.isActive, cnt: count() })
        .from(sensorsTable)
        .groupBy(sensorsTable.isActive),

      // Active alert breakdown by severity (for the severity badges)
      db
        .select({ severity: alertsTable.severity, cnt: count() })
        .from(alertsTable)
        .where(eq(alertsTable.status, "active"))
        .groupBy(alertsTable.severity),
    ]);

    // ── Aggregate patient counts ────────────────────────────────────────────
    const conditionMap = Object.fromEntries(
      patientCounts.map((r) => [r.condition, Number(r.cnt)])
    );
    const totalPatients = (Object.values(conditionMap) as number[]).reduce((s, v) => s + v, 0);

    // ── Aggregate alert counts ──────────────────────────────────────────────
    const alertStatusMap = Object.fromEntries(
      alertCounts.map((r) => [r.status, Number(r.cnt)])
    );

    // ── Aggregate sensor counts ─────────────────────────────────────────────
    let totalSensors = 0;
    let activeSensors = 0;
    for (const row of sensorCounts) {
      totalSensors += Number(row.cnt);
      if (row.isActive) activeSensors += Number(row.cnt);
    }

    // ── Aggregate severity breakdown ─────────────────────────────────────────
    const severityMap = Object.fromEntries(
      alertSeverityCounts.map((r) => [r.severity, Number(r.cnt)])
    );

    return res.json({
      totalPatients,
      criticalPatients: conditionMap["critical"] ?? 0,
      stablePatients: conditionMap["stable"] ?? 0,
      observationPatients: conditionMap["observation"] ?? 0,
      activeAlerts: alertStatusMap["active"] ?? 0,
      acknowledgedAlerts: alertStatusMap["acknowledged"] ?? 0,
      totalSensors,
      activeSensors,
      alertsBySeverity: {
        critical: severityMap["critical"] ?? 0,
        high: severityMap["high"] ?? 0,
        medium: severityMap["medium"] ?? 0,
        low: severityMap["low"] ?? 0,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard stats");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
