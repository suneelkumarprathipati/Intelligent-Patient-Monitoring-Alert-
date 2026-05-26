/**
 * schema/index.ts — Barrel export for all Drizzle ORM table definitions.
 *
 * Import from "@workspace/db" in application code — never import individual
 * schema files directly to avoid circular dependencies.
 */
export * from "./patients";
export * from "./vitals";
export * from "./alerts";
export * from "./sensors";
