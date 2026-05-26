/**
 * vitals.ts — Drizzle ORM schema for the vital_readings table.
 *
 * Each row is one physiological measurement emitted by a simulated sensor.
 * The table is append-only: readings are never updated, only inserted.
 * This mirrors the write pattern of real-world IoT medical devices.
 *
 * Sensor types supported:
 *   heart_rate       — beats per minute (BPM)
 *   spo2             — peripheral oxygen saturation (%)
 *   systolic_bp      — systolic blood pressure (mmHg)
 *   diastolic_bp     — diastolic blood pressure (mmHg)
 *   temperature      — body temperature (°C)
 *   respiration_rate — breaths per minute
 */
import { pgTable, serial, integer, text, real, timestamp } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";

// ─── Table Definition ──────────────────────────────────────────────────────────
export const vitalReadingsTable = pgTable("vital_readings", {
  id: serial("id").primaryKey(),

  /** Foreign key — the patient this reading belongs to */
  patientId: integer("patient_id")
    .notNull()
    .references(() => patientsTable.id, { onDelete: "cascade" }),

  /**
   * Which physiological signal this reading represents.
   * Using a text discriminator keeps the schema flexible for future sensor types.
   */
  sensorType: text("sensor_type").notNull(),

  /** The raw numeric measurement value */
  value: real("value").notNull(),

  /** SI/clinical unit for the measurement (bpm, %, mmHg, °C) */
  unit: text("unit").notNull(),

  /**
   * Alert classification computed at ingestion time:
   *   normal   — within healthy reference range
   *   warning  — outside range but not immediately life-threatening
   *   critical — requires immediate clinical intervention
   */
  status: text("status").notNull().default("normal"),

  /** Wall-clock time of the measurement — used for charting */
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

/** Shape returned by GET /patients/:id/vitals */
export type VitalReading = typeof vitalReadingsTable.$inferSelect;
