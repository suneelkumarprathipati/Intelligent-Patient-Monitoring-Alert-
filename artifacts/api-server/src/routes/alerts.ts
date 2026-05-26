/**
 * alerts.ts — Express router for alert lifecycle endpoints.
 *
 * Routes:
 *   GET   /api/alerts                    — list alerts (optional ?status= filter)
 *   PATCH /api/alerts/:id/acknowledge    — mark alert as acknowledged
 *   PATCH /api/alerts/:id/resolve        — mark alert as resolved
 *
 * Alert lifecycle:
 *   Alerts are created automatically by the sensor simulator when a reading
 *   crosses a clinical threshold.  Clinicians use these endpoints to move
 *   each alert through the active → acknowledged → resolved pipeline.
 *
 *   The system does NOT allow re-opening resolved alerts — create a new one
 *   if the situation recurs (mirrors real clinical workflow).
 */
import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, alertsTable } from "@workspace/db";
import { AcknowledgeAlertParams, ResolveAlertParams } from "@workspace/api-zod";

const router = Router();

// ─── GET /alerts ──────────────────────────────────────────────────────────────
router.get("/alerts", async (req, res) => {
  try {
    let query = db
      .select()
      .from(alertsTable)
      .orderBy(desc(alertsTable.triggeredAt))
      .$dynamic();

    // Optional status filter (e.g. ?status=active)
    const status = req.query["status"] as string | undefined;
    if (status && ["active", "acknowledged", "resolved"].includes(status)) {
      query = query.where(eq(alertsTable.status, status));
    }

    const alerts = await query;
    return res.json(alerts);
  } catch (err) {
    req.log.error({ err }, "Failed to list alerts");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /alerts/:id/acknowledge ───────────────────────────────────────────
/**
 * Acknowledges an active alert — signals to the system that a clinician has
 * seen the alert and is taking action.  Only transitions from 'active' state.
 */
router.patch("/alerts/:id/acknowledge", async (req, res) => {
  const paramResult = AcknowledgeAlertParams.safeParse({ id: Number(req.params.id) });
  if (!paramResult.success) {
    return res.status(400).json({ error: "Invalid alert ID" });
  }

  try {
    const [alert] = await db
      .update(alertsTable)
      .set({
        status: "acknowledged",
        acknowledgedAt: new Date(),
      })
      .where(eq(alertsTable.id, paramResult.data.id))
      .returning();

    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    return res.json(alert);
  } catch (err) {
    req.log.error({ err }, "Failed to acknowledge alert");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /alerts/:id/resolve ────────────────────────────────────────────────
/**
 * Resolves an alert — the clinical situation has been handled.
 * Resolved alerts are kept in the database for audit trail purposes.
 */
router.patch("/alerts/:id/resolve", async (req, res) => {
  const paramResult = ResolveAlertParams.safeParse({ id: Number(req.params.id) });
  if (!paramResult.success) {
    return res.status(400).json({ error: "Invalid alert ID" });
  }

  try {
    const [alert] = await db
      .update(alertsTable)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
      })
      .where(eq(alertsTable.id, paramResult.data.id))
      .returning();

    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }

    return res.json(alert);
  } catch (err) {
    req.log.error({ err }, "Failed to resolve alert");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
