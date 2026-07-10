/**
 * Seed script — creates demo users and sample patients for development.
 * DO NOT run this against a production database.
 *
 * Usage: node migrations/seed.js
 *
 * Requires SEED_DEMO_PASSWORD (≥12 chars) in .env — never commit .env.
 */

require("dotenv").config();
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

const pool = new Pool(
  connectionString
    ? {
      connectionString,
      ssl: { rejectUnauthorized: false }, // required for Supabase
    }
    : {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432"),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    }
);

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "12");

async function seed() {
  if (process.env.NODE_ENV === "production") {
    console.error("Seed script must not be run in production.");
    process.exit(1);
  }

  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (!demoPassword || demoPassword.length < 12) {
    console.error(
      "Set SEED_DEMO_PASSWORD in .env (at least 12 characters) before running seed.\n" +
      "Use a unique value for each environment; never reuse production credentials."
    );
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    console.log("Seeding users...");

    const users = [
      { username: "dr.smith", fullName: "Dr. James Smith", role: "physician" },
      { username: "dr.patel", fullName: "Dr. Priya Patel", role: "physician" },
      { username: "admin", fullName: "Admin User", role: "admin" },
      { username: "j.garcia", fullName: "Julia Garcia", role: "admin" },
    ].map((u) => ({ ...u, password: demoPassword }));

    const userIds = {};
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, ROUNDS);
      const id = uuidv4();
      await client.query(
        `INSERT INTO users (id, username, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               full_name = EXCLUDED.full_name`,
        [id, u.username, hash, u.fullName, u.role]
      );
      userIds[u.username] = id;
      console.log(`  * ${u.role.padEnd(10)} ${u.username}`);
    }

    console.log("\nSeeding patients...");

    const NOW = Date.now();
    const ADMIT_25_DAYS_AGO = new Date(NOW - 25 * 86400000);
    const ADMIT_2_DAYS_AGO = new Date(NOW - 2 * 86400000);
    const ADMIT_3_DAYS_AGO = new Date(NOW - 3 * 86400000);

    const adminId = (await client.query("SELECT id FROM users WHERE username = 'admin' LIMIT 1")).rows[0]?.id;

    const patients = [
      {
        id: uuidv4(), firstName: "Margaret", lastName: "Johnson",
        dob: "1942-03-18", room: "214-A",
        arrivalAt: new Date("2026-03-04T14:00:00"),
        diagnosis: "Hip fracture post-ORIF",
        notes: "Allergic to penicillin. Family contact: daughter (Sara) 555-2819.",
        status: "pending", admitTs: null,
        physician: "dr.smith", location: "Sunrise Care Center",
      },
      {
        id: uuidv4(), firstName: "Carlos", lastName: "Rivera",
        dob: "1938-11-05", room: "108-B",
        arrivalAt: new Date("2026-03-04T10:30:00"),
        diagnosis: "CVA with left hemiplegia",
        notes: "Speech therapy consult needed. Wife is healthcare proxy.",
        status: "inhouse", admitTs: ADMIT_25_DAYS_AGO,
        physician: "dr.smith", location: "Sunrise Care Center",
      },
      {
        id: uuidv4(), firstName: "Dorothy", lastName: "Williams",
        dob: "1951-07-22", room: null,
        arrivalAt: new Date("2026-03-04T16:30:00"),
        diagnosis: "COPD exacerbation",
        notes: "Home O2 dependent. Current PCP Dr. Patel. Full code.",
        status: "pending", admitTs: null,
        physician: "dr.patel", location: "Maplewood Nursing Home",
      },
      {
        id: uuidv4(), firstName: "Robert", lastName: "Thompson",
        dob: "1945-08-12", room: "302-C",
        arrivalAt: new Date("2026-03-03T09:00:00"),
        diagnosis: "CHF exacerbation",
        notes: "On diuretics. Fluid restriction 1.5L/day.",
        status: "inhouse", admitTs: ADMIT_2_DAYS_AGO,
        physician: "dr.smith", location: "Maplewood Nursing Home",
      },
      {
        id: uuidv4(), firstName: "Elena", lastName: "Garcia",
        dob: "1952-04-30", room: "110-A",
        arrivalAt: new Date("2026-03-02T11:00:00"),
        diagnosis: "Pneumonia",
        notes: "On IV antibiotics. Isolation precautions.",
        status: "inhouse", admitTs: ADMIT_3_DAYS_AGO,
        physician: "dr.patel", location: "Harbor View SNF",
      },
    ];

    const patientIds = {};
    for (const p of patients) {
      await client.query(
        `INSERT INTO patients
           (id, first_name, last_name, dob, room, arrival_at, diagnosis, notes,
            status, admit_ts, physician_username, location, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT DO NOTHING`,
        [p.id, p.firstName, p.lastName, p.dob, p.room, p.arrivalAt,
        p.diagnosis, p.notes, p.status, p.admitTs, p.physician, p.location, adminId]
      );
      patientIds[`${p.lastName}`] = p.id;
      console.log(`  * ${p.status.padEnd(10)} ${p.lastName}, ${p.firstName}`);
    }

    console.log("\nSeeding tasks for in-house patients...");

    // Rivera (25 days in-house): H&P + 30-day visible
    const riveraId = patientIds["Rivera"];
    if (riveraId) {
      await client.query(
        `INSERT INTO tasks (id, patient_id, task_key, task_label, cycle, due_at, appears_at, status, assigned_at, assigned_by, note)
         VALUES ($1,$2,'hp','H & P',0,$3,$4,'pending',$5,'j.garcia','Please complete H&P within 48hrs of admit.')
         ON CONFLICT (patient_id, task_key, cycle) DO NOTHING`,
        [uuidv4(), riveraId,
        new Date(ADMIT_25_DAYS_AGO.getTime() + 48 * 3600000),
          ADMIT_25_DAYS_AGO,
        new Date(ADMIT_25_DAYS_AGO.getTime() + 3600000)]
      );
      await client.query(
        `INSERT INTO tasks (id, patient_id, task_key, task_label, cycle, due_at, appears_at, status)
         VALUES ($1,$2,'30day','30-Day',0,$3,$4,'pending')
         ON CONFLICT (patient_id, task_key, cycle) DO NOTHING`,
        [uuidv4(), riveraId,
        new Date(ADMIT_25_DAYS_AGO.getTime() + 30 * 86400000),
        new Date(ADMIT_25_DAYS_AGO.getTime() + 21 * 86400000)]
      );
      console.log("  * Rivera tasks seeded");
    }

    // Thompson (2 days): H&P completed
    const thompsonId = patientIds["Thompson"];
    if (thompsonId) {
      await client.query(
        `INSERT INTO tasks (id, patient_id, task_key, task_label, cycle, due_at, appears_at, status, assigned_at, assigned_by, completed_at, completed_by, note)
         VALUES ($1,$2,'hp','H & P',0,$3,$4,'completed',$5,'j.garcia',$6,'dr.smith','H&P completed on admission.')
         ON CONFLICT (patient_id, task_key, cycle) DO NOTHING`,
        [uuidv4(), thompsonId,
        new Date(ADMIT_2_DAYS_AGO.getTime() + 48 * 3600000),
          ADMIT_2_DAYS_AGO,
        new Date(ADMIT_2_DAYS_AGO.getTime() + 3600000),
        new Date(ADMIT_2_DAYS_AGO.getTime() + 86400000)]
      );
      console.log("  * Thompson tasks seeded");
    }

    // Garcia (3 days): H&P assigned, pending
    const garciaId = patientIds["Garcia"];
    if (garciaId) {
      await client.query(
        `INSERT INTO tasks (id, patient_id, task_key, task_label, cycle, due_at, appears_at, status, assigned_at, assigned_by, note)
         VALUES ($1,$2,'hp','H & P',0,$3,$4,'pending',$5,'j.garcia','Please review isolation protocol.')
         ON CONFLICT (patient_id, task_key, cycle) DO NOTHING`,
        [uuidv4(), garciaId,
        new Date(ADMIT_3_DAYS_AGO.getTime() + 48 * 3600000),
          ADMIT_3_DAYS_AGO,
        new Date(ADMIT_3_DAYS_AGO.getTime() + 3600000)]
      );
      console.log("  * Garcia tasks seeded");
    }

    console.log("\nSeed complete!\n");
    console.log("Demo users: dr.smith, dr.patel, admin, j.garcia — password is SEED_DEMO_PASSWORD from .env (not echoed here).");

  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error("Seed error:", err);
  process.exit(1);
});
