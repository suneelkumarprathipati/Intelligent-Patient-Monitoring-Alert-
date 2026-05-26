# Intelligent Patient Monitoring & Alert System (IPMAS)

A real-time hospital ICU monitoring platform that simulates physiological sensor streams, detects clinical threshold breaches, and raises automated alerts — built to showcase Suneel Kumar Prathipati's full-stack engineering skills.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/patient-monitor run dev` — run the React frontend (port 22233)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite, TanStack Query, Recharts, shadcn/ui, wouter, Tailwind CSS
- Backend: Express 5, WebSocket (ws library), Drizzle ORM
- DB: PostgreSQL (Drizzle schema + migrations)
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Real-time: WebSocket server on /ws path — shared port with HTTP
- Build: esbuild (CJS bundle for API server)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle ORM table definitions (patients, vitals, alerts, sensors)
- `artifacts/api-server/src/` — Express routes, WebSocket server, sensor simulator, seed data
  - `routes/patients.ts` — patient CRUD
  - `routes/vitals.ts` — vital readings (latest + history)
  - `routes/alerts.ts` — alert lifecycle (acknowledge / resolve)
  - `routes/sensors.ts` — sensor device registry
  - `routes/dashboard.ts` — aggregate stats
  - `simulator.ts` — real-time physiological signal generator + WebSocket broadcaster
  - `seed.ts` — demo patient + sensor seeding
- `artifacts/patient-monitor/src/` — React frontend
  - `pages/` — Dashboard, Patients, PatientDetail, Alerts, Sensors
  - `contexts/WebSocketContext.tsx` — real-time data subscription
  - `hooks/useWebSocket.ts` — WebSocket connection with reconnect

## Architecture decisions

- **WebSocket on the same port as HTTP** — the ws library intercepts HTTP upgrade events before Express sees them; no extra ports needed. In production on AWS, replace with API Gateway WebSocket API.
- **Sensor simulator via setInterval** — fires every 2 seconds per patient × sensor. Production replacement: SQS consumer reading from AWS IoT Core message queue.
- **DISTINCT ON for latest vitals** — raw SQL in the vitals endpoint uses PostgreSQL's DISTINCT ON to retrieve one row per sensor type without a subquery, for clean O(n) performance.
- **Promise.allSettled for parallel sensor writes** — each tick runs all patient × sensor insertions concurrently; failures are isolated per task and logged rather than aborting the full tick.
- **Idempotent seeding** — seedDatabase() checks for existing patients before inserting, safe to call on every restart.
- **OpenAPI-first contract** — the spec in lib/api-spec/openapi.yaml gates both Zod server-side validation schemas and React Query client hooks via Orval codegen.

## Product

- **Dashboard** — live KPI tiles (patients, alerts, sensors, system status), severity breakdown, condition pie
- **Patients** — admit/discharge patients with ward/bed assignment; search and condition filters
- **Patient Detail** — 6-panel live Recharts vitals (heart rate, SpO2, BP systolic/diastolic, temperature, respiration) with real-time WebSocket updates and pulsing live indicator
- **Alert Center** — full alert table with severity badges, acknowledge/resolve actions, status filter
- **Sensor Registry** — 30+ sensor devices showing device ID, patient assignment, last ping, active status

## User preferences

- All code must include professional comments explaining purpose, design decisions, and production deployment notes
- Project is for portfolio/showcase — Suneel Kumar Prathipati's resume project

## Gotchas

- After any OpenAPI spec change, run codegen before starting the server or frontend
- The sensor simulator only runs for non-discharged patients (uses `ne(condition, 'discharged')`)
- The WebSocket path `/ws` must be listed in the artifact.toml paths if you change routing

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Clinical threshold ranges are defined in `artifacts/api-server/src/simulator.ts` — adjust per clinical specs
