const { query, withTransaction } = require("../db/pool");
const { v4: uuidv4 } = require("uuid");

/**
 * GET /api/patients
 * Physicians scoped to their own patients server-side.
 * Admins can use ?physician= and ?location= filters.
 */
async function listPatients(req, res, next) {
  try {
    const { status, physician, location, page, pageSize } = req.query;
    const isPhysician = req.user.role === "physician";

    const conditions = ["p.discharged_at IS NULL"];
    const params = [];
    let idx = 1;

    if (isPhysician) {
      conditions.push(`LOWER(p.physician_username) = LOWER($${idx++})`);
      params.push(req.user.username);
    } else if (physician) {
      conditions.push(`LOWER(p.physician_username) = LOWER($${idx++})`);
      params.push(physician);
    }
    if (status) {
      conditions.push(`p.status = $${idx++}`);
      params.push(status);
    }
    if (location) {
      conditions.push(`LOWER(p.location) = LOWER($${idx++})`);
      params.push(location);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    const sql = `
      SELECT
        p.id, p.first_name, p.last_name, p.dob, p.room,
        p.arrival_at, p.diagnosis, p.notes, p.status,
        p.admit_ts, p.physician_username, p.location,
        p.created_at, p.updated_at,
        COUNT(*) OVER() AS total_count
      FROM patients p
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(limit, offset);

    const result = await query(sql, params);
    const total = result.rows[0]?.total_count ? Number(result.rows[0].total_count) : 0;
    const patients = result.rows.map(({ total_count: _t, ...rest }) => rest);

    req.audit("LIST_PATIENTS", {
      count: patients.length,
      filters: { status, physician, location },
    });

    res.json({
      patients,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (err) {
    next(err);
  }
}

async function getPatient(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT p.id, p.first_name, p.last_name, p.dob, p.room,
              p.arrival_at, p.diagnosis, p.notes, p.status,
              p.admit_ts, p.physician_username, p.location,
              p.created_at, p.updated_at
       FROM patients p
       WHERE p.id = $1 AND p.discharged_at IS NULL`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Patient not found." });

    const patient = result.rows[0];
    if (req.user.role === "physician" && (patient.physician_username || "").toLowerCase() !== req.user.username.toLowerCase()) {
      return res.status(403).json({ error: "Access denied." });
    }
    req.audit("READ_PATIENT", { patientId: id });
    res.json({ patient });
  } catch (err) {
    next(err);
  }
}

async function createPatient(req, res, next) {
  try {
    const {
      firstName, lastName, dob, room, arrivalAt,
      diagnosis, notes, status, physicianUsername, location,
    } = req.body;

    const id = uuidv4();
    const admitTs = status === "inhouse" ? new Date() : null;

    const result = await query(
      `INSERT INTO patients
         (id, first_name, last_name, dob, room, arrival_at, diagnosis, notes,
          status, admit_ts, physician_username, location, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [id, firstName, lastName, dob, room, arrivalAt, diagnosis, notes,
       status, admitTs, physicianUsername, location, req.user.id]
    );

    req.audit("CREATE_PATIENT", { patientId: id });
    res.status(201).json({ patient: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function updatePatient(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await query(
      "SELECT * FROM patients WHERE id = $1 AND discharged_at IS NULL",
      [id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: "Patient not found." });

    const p = existing.rows[0];
    const b = req.body;

    const nextStatus = b.status ?? p.status;
    let admitTs = p.admit_ts;
    if (p.status !== "inhouse" && nextStatus === "inhouse" && !admitTs) {
      admitTs = new Date();
    }

    const result = await query(
      `UPDATE patients SET
         first_name = $1, last_name = $2, dob = $3, room = $4,
         arrival_at = $5, diagnosis = $6, notes = $7, status = $8,
         admit_ts = $9, physician_username = $10, location = $11,
         updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        b.firstName ?? p.first_name,
        b.lastName ?? p.last_name,
        b.dob ?? p.dob,
        b.room ?? p.room,
        b.arrivalAt ?? p.arrival_at,
        b.diagnosis ?? p.diagnosis,
        b.notes ?? p.notes,
        nextStatus,
        admitTs,
        b.physicianUsername ?? p.physician_username,
        b.location ?? p.location,
        id,
      ]
    );

    req.audit("UPDATE_PATIENT", { patientId: id });
    res.json({ patient: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function admitPatient(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE patients
         SET status = 'inhouse', admit_ts = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'pending' AND discharged_at IS NULL
       RETURNING *`,
      [id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "Patient not found or already admitted." });
    }
    req.audit("ADMIT_PATIENT", { patientId: id });
    res.json({ patient: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function dischargePatient(req, res, next) {
  try {
    const { id } = req.params;
    await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE patients
           SET status = 'discharged', discharged_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND discharged_at IS NULL
         RETURNING id`,
        [id]
      );
      if (!result.rows[0]) {
        const err = new Error("Patient not found or already discharged.");
        err.status = 404;
        throw err;
      }
      await client.query(
        `UPDATE tasks
           SET status = 'cancelled', updated_at = NOW()
         WHERE patient_id = $1 AND status NOT IN ('completed', 'cancelled')`,
        [id]
      );
    });
    req.audit("DISCHARGE_PATIENT", { patientId: id });
    res.json({ message: "Patient discharged and open tasks cancelled." });
  } catch (err) {
    next(err);
  }
}

async function deletePatient(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      "DELETE FROM patients WHERE id = $1 AND status = 'pending' RETURNING id",
      [id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({
        error: "Patient not found or cannot be deleted (use discharge for admitted patients).",
      });
    }
    req.audit("DELETE_PATIENT", { patientId: id });
    res.json({ message: "Pending patient removed." });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPatients, getPatient, createPatient,
  updatePatient, admitPatient, dischargePatient, deletePatient,
};
