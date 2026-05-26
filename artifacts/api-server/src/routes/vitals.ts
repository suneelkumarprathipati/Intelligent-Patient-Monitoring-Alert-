/**
 * vitals.ts — Express router for vital-reading endpoints.
 *
 * Routes:
 *   GET /api/patients/:id/vitals         — latest reading per sensor type
 *   GET /api/patients/:id/vitals/history — last 60 readings (time-series chart data)
 *
 * Design notes:
 *   - The "latest vitals" endpoint returns one row per sensor type so the
 *     dashboard can display the current state of all 6 signals simultaneously.
 *   - The "history" endpoint returns raw time-ordered rows used to render
 *     the Recharts line chart on the patient detail page.
 *   - Both endpoints are read-only (GET) — data is written exclusively by
 *     the sensor simulator via insertReading() in simulator.ts.
 */
import { Router } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, vitalReadingsTable } from "@workspace/db";

const router = Router();

// ─── GET /patients/:id/vitals ─────────────────────────────────────────────────
/**
 * Returns the single most recent reading for each sensor type attached to
 * this patient.  Uses a DISTINCT ON (sensor_type) query ordered by
 * recorded_at DESC so Postgres picks the latest row per group efficiently.
 */
router.get("/patients/:id/vitals", async (req, res) => {
  const patientId = Number(req.params.id);
  if (isNaN(patientId)) {
    return res.status(400).json({ error: "Invalid patient ID" });
  }

  try {
    // Raw SQL for DISTINCT ON — Drizzle does not yet expose DISTINCT ON natively
    const rows = await db.execute(
      sql`
        SELECT DISTINCT ON (sensor_type)
          id, patient_id AS "patientId", sensor_type AS "sensorType",
          value, unit, status, recorded_at AS "recordedAt"
        FROM vital_readings
        WHERE patient_id = ${patientId}
        ORDER BY sensor_type, recorded_at DESC
      `
    );

    return res.json(rows.rows);
  } catch (err) {
    req.log.error({ err }, "Failed to get latest vitals");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /patients/:id/vitals/history ─────────────────────────────────────────
/**
 * Returns up to 300 most recent readings (50 per sensor × 6 sensors) so the
 * frontend can build multi-line time-series charts without overwhelming the
 * browser with thousands of rows.
 */
router.get("/patients/:id/vitals/history", async (req, res) => {
  const patientId = Number(req.params.id);
  if (isNaN(patientId)) {
    return res.status(400).json({ error: "Invalid patient ID" });
  }

  try {
    // Fetch up to 300 most recent readings, return in chronological order
    // so Recharts can plot them left-to-right on the time axis.
    const rows = await db
      .select()
      .from(vitalReadingsTable)
      .where(eq(vitalReadingsTable.patientId, patientId))
      .orderBy(desc(vitalReadingsTable.recordedAt))
      .limit(300);

    // Reverse so the array is oldest-first for the chart
    return res.json(rows.reverse());
  } catch (err) {
    req.log.error({ err }, "Failed to get vitals history");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
