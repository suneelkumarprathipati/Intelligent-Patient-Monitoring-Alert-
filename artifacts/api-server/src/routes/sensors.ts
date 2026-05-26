/**
 * sensors.ts — Express router for sensor device registry endpoints.
 *
 * Routes:
 *   GET /api/sensors — list all registered sensor devices and their state
 *
 * In a production AWS deployment, sensor registration would be handled by
 * AWS IoT Core's device provisioning API.  Here, sensors are pre-seeded in
 * the database and updated by the simulator heartbeat loop.
 */
import { Router } from "express";
import { db, sensorsTable } from "@workspace/db";
import { asc } from "drizzle-orm";

const router = Router();

// ─── GET /sensors ─────────────────────────────────────────────────────────────
router.get("/sensors", async (req, res) => {
  try {
    // Return all sensors ordered by device ID — predictable ordering for the UI
    const sensors = await db
      .select()
      .from(sensorsTable)
      .orderBy(asc(sensorsTable.deviceId));

    return res.json(sensors);
  } catch (err) {
    req.log.error({ err }, "Failed to list sensors");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
