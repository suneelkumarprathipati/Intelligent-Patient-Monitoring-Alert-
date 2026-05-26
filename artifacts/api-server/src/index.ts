/**
 * index.ts — API server entry point.
 *
 * Responsibilities:
 *   1. Start the Express HTTP server on the port assigned by Replit
 *   2. Attach the WebSocket server (same port, path /ws)
 *   3. Start the real-time sensor simulation loop
 *   4. Seed initial data (patients + sensors) on first launch
 *
 * The WebSocket server and HTTP server share a single port — this is the
 * standard pattern for Express + ws: the HTTP upgrade event is intercepted
 * by the ws library before Express sees it.
 *
 * AWS deployment note:
 *   In a production setup on AWS, replace startSimulator() with an SQS consumer
 *   that reads from an IoT Core message queue.  The WebSocket broadcast logic
 *   would fan out through an API Gateway WebSocket API or Redis pub/sub.
 */

import app from "./app";
import { logger } from "./lib/logger";
import { attachWebSocketServer, startSimulator } from "./simulator";
import { seedDatabase } from "./seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// app.listen returns a Node.js http.Server which we pass to ws
const httpServer = app.listen(port, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "API server listening");

  // Attach WebSocket server on same port, path /ws
  attachWebSocketServer(httpServer);

  // Seed initial demo data (idempotent — safe to call on every restart)
  await seedDatabase();

  // Start physiological sensor simulation loop
  startSimulator();
});

export default httpServer;
