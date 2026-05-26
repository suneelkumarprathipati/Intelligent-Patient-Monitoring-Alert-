/**
 * seed.ts — Database seeding for the patient monitoring demo.
 *
 * Populates:
 *   - 5 realistic patients across different clinical conditions
 *   - 6 sensors per patient (one per physiological signal type)
 *
 * This function is idempotent: it checks whether patients already exist
 * and skips seeding if they do, so it is safe to call on every server restart.
 *
 * In a production system:
 *   - Patients are admitted via the POST /patients REST endpoint
 *   - Sensors are registered via AWS IoT Core device provisioning
 *   - This seed file would only exist in the staging/dev environment
 */

import { db, patientsTable, sensorsTable } from "@workspace/db";
import { logger } from "./lib/logger";

/** All six sensor types — one device per patient per signal */
const SENSOR_TYPES = [
  "heart_rate",
  "spo2",
  "systolic_bp",
  "diastolic_bp",
  "temperature",
  "respiration_rate",
] as const;

/** Demo patient records that cover the full spectrum of clinical conditions */
const DEMO_PATIENTS = [
  {
    name: "Eleanor Whitfield",
    age: 68,
    gender: "female" as const,
    ward: "Cardiology",
    bed: "4A-01",
    condition: "critical" as const,
    diagnosis: "Acute Myocardial Infarction",
  },
  {
    name: "Marcus Chen",
    age: 45,
    gender: "male" as const,
    ward: "General",
    bed: "2B-07",
    condition: "stable" as const,
    diagnosis: "Post-operative recovery — appendectomy",
  },
  {
    name: "Sophia Alvarez",
    age: 32,
    gender: "female" as const,
    ward: "Neurology",
    bed: "6C-03",
    condition: "observation" as const,
    diagnosis: "Suspected TIA — under observation",
  },
  {
    name: "James O'Brien",
    age: 77,
    gender: "male" as const,
    ward: "ICU",
    bed: "ICU-02",
    condition: "critical" as const,
    diagnosis: "Severe sepsis — multi-organ dysfunction",
  },
  {
    name: "Priya Sharma",
    age: 54,
    gender: "female" as const,
    ward: "Respiratory",
    bed: "3D-11",
    condition: "stable" as const,
    diagnosis: "Chronic obstructive pulmonary disease (COPD) exacerbation",
  },
];

/**
 * Seed the database with demo patients and their associated sensor devices.
 * Skips seeding if any patients already exist in the database.
 */
export async function seedDatabase(): Promise<void> {
  try {
    // Check if already seeded
    const existing = await db.select().from(patientsTable).limit(1);
    if (existing.length > 0) {
      logger.info("Database already seeded — skipping");
      return;
    }

    logger.info("Seeding database with demo patients and sensors…");

    // Insert patients and collect their auto-generated IDs
    const insertedPatients = await db
      .insert(patientsTable)
      .values(DEMO_PATIENTS)
      .returning();

    // For each patient, register one sensor per signal type
    const sensorRows = insertedPatients.flatMap((patient: { id: number }, patientIdx: number) =>
      SENSOR_TYPES.map((sensorType: string, sensorIdx: number) => ({
        // Device ID mirrors what AWS IoT Core would assign: arn:aws:iot:…:thing/SENSOR-001
        deviceId: `SENSOR-${String(patientIdx * SENSOR_TYPES.length + sensorIdx + 1).padStart(3, "0")}`,
        sensorType,
        patientId: patient.id,
        isActive: true,
        lastPing: new Date(),
      }))
    );

    await db.insert(sensorsTable).values(sensorRows);

    logger.info(
      {
        patientsCount: insertedPatients.length,
        sensorsCount: sensorRows.length,
      },
      "Database seeded successfully"
    );
  } catch (err) {
    logger.error({ err }, "Database seeding failed");
    // Non-fatal — the application can still run without demo data
  }
}
