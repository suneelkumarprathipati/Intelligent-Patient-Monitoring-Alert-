/**
 * sensors.ts — Drizzle ORM schema for the sensors table.
 *
 * A sensor record represents a physical (or simulated) IoT device that
 * continuously streams one type of physiological signal.  In a production
 * deployment this table would be populated by a device-registration service;
 * here it is seeded once at startup for the simulation.
 */
import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";

// ─── Table Definition ──────────────────────────────────────────────────────────
export const sensorsTable = pgTable("sensors", {
  id: serial("id").primaryKey(),

  /**
   * Unique device identifier — in a real deployment this would be the
   * hardware serial number or AWS IoT thing name.
   */
  deviceId: text("device_id").notNull().unique(),

  /** The physiological signal this sensor measures */
  sensorType: text("sensor_type").notNull(),

  /**
   * The patient currently wearing / assigned to this sensor.
   * Null when the sensor is available in the equipment pool.
   */
  patientId: integer("patient_id").references(() => patientsTable.id, {
    onDelete: "set null",
  }),

  /** Whether the sensor is currently transmitting data */
  isActive: boolean("is_active").notNull().default(true),

  /** Last time the simulator sent a heartbeat for this sensor */
  lastPing: timestamp("last_ping").notNull().defaultNow(),
});

/** Shape returned by GET /sensors */
export type Sensor = typeof sensorsTable.$inferSelect;
