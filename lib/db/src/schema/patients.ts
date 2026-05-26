/**
 * patients.ts — Drizzle ORM schema for the patients table.
 *
 * Each patient record represents a single hospital admission.
 * Physiological readings and alerts are linked via patientId.
 */
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Table Definition ──────────────────────────────────────────────────────────
export const patientsTable = pgTable("patients", {
  id: serial("id").primaryKey(),

  /** Full legal name displayed on the dashboard */
  name: text("name").notNull(),

  /** Age in years */
  age: integer("age").notNull(),

  /** Biological sex — used to contextualise some vital thresholds */
  gender: text("gender").notNull(), // 'male' | 'female' | 'other'

  /** Hospital ward where the patient is currently admitted */
  ward: text("ward").notNull(),

  /** Specific bed identifier within the ward (e.g. "4B-12") */
  bed: text("bed").notNull(),

  /** Clinical condition label used for triage colour-coding */
  condition: text("condition").notNull(), // 'stable' | 'critical' | 'observation' | 'discharged'

  /** Primary diagnosis or presenting complaint — optional at admission */
  diagnosis: text("diagnosis"),

  /** ISO-8601 timestamp of when the patient was admitted */
  admittedAt: timestamp("admitted_at").notNull().defaultNow(),

  /** ISO-8601 timestamp of the last record update */
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Zod Schemas (used for request validation in Express routes) ───────────────
export const insertPatientSchema = createInsertSchema(patientsTable).omit({
  id: true,
  admittedAt: true,
  updatedAt: true,
});

/** Shape accepted by POST /patients */
export type InsertPatient = z.infer<typeof insertPatientSchema>;

/** Shape returned by GET /patients/:id */
export type Patient = typeof patientsTable.$inferSelect;
