/**
 * routes/index.ts — Central router that mounts all sub-routers under /api.
 *
 * Adding a new feature:
 *   1. Create a new router file in this directory (e.g. reports.ts)
 *   2. Import it here and call router.use(newRouter)
 *   3. Add the paths to lib/api-spec/openapi.yaml and re-run codegen
 */
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import patientsRouter from "./patients";
import vitalsRouter from "./vitals";
import alertsRouter from "./alerts";
import sensorsRouter from "./sensors";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

// ── Health check (no auth required — used by load balancers / uptime monitors) ──
router.use(healthRouter);

// ── Core domain routers ────────────────────────────────────────────────────────
router.use(patientsRouter);
router.use(vitalsRouter);
router.use(alertsRouter);
router.use(sensorsRouter);
router.use(dashboardRouter);

export default router;
