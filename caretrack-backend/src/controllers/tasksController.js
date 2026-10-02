const { query } = require("../db/pool");
const { v4: uuidv4 } = require("uuid");

async function listTasks(req, res, next) {
  try {
    const { patientId } = req.params;

    const patient = await query(
      "SELECT id, physician_username FROM patients WHERE id = $1 AND discharged_at IS NULL",
      [patientId]
    );
    if (!patient.rows[0]) return res.status(404).json({ error: "Patient not found." });
    if (req.user.role === "physician" && (patient.rows[0].physician_username || "").toLowerCase() !== req.user.username.toLowerCase()) {
      return res.status(403).json({ error: "Access denied." });
    }

    const result = await query(
      `SELECT id, patient_id, task_key, task_label, cycle,
              due_at, appears_at, status,
              assigned_at, assigned_by,
              completed_at, completed_by,
              note, created_at, updated_at
       FROM tasks
       WHERE patient_id = $1 AND status != 'cancelled'
       ORDER BY due_at ASC`,
      [patientId]
    );

    req.audit("LIST_TASKS", { patientId, count: result.rowCount });
    res.json({ tasks: result.rows });
  } catch (err) {
    next(err);
  }
}

async function upsertTask(req, res, next) {
  try {
    const { patientId } = req.params;
    const { taskKey, taskLabel, cycle, dueAt, appearsAt } = req.body;

    const result = await query(
      `INSERT INTO tasks (id, patient_id, task_key, task_label, cycle, due_at, appears_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       ON CONFLICT (patient_id, task_key, cycle) DO UPDATE
         SET task_label = EXCLUDED.task_label,
             due_at = EXCLUDED.due_at,
             updated_at = NOW()
       RETURNING *`,
      [uuidv4(), patientId, taskKey, taskLabel, cycle, dueAt, appearsAt]
    );

    res.status(201).json({ task: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function assignTask(req, res, next) {
  try {
    const { patientId, taskId } = req.params;
    const { unassign, note } = req.body;

    const existing = await query(
      "SELECT * FROM tasks WHERE id = $1 AND patient_id = $2 AND status NOT IN ('completed','cancelled')",
      [taskId, patientId]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Task not found or not editable." });
    }

    const result = await query(
      `UPDATE tasks SET
         assigned_at = $1,
         assigned_by = $2,
         note = COALESCE($3, note),
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        unassign ? null : new Date(),
        unassign ? null : req.user.username,
        note ?? null,
        taskId,
      ]
    );

    req.audit(unassign ? "UNASSIGN_TASK" : "ASSIGN_TASK", {
      patientId,
      details: { taskId, taskKey: existing.rows[0].task_key },
    });

    res.json({ task: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function completeTask(req, res, next) {
  try {
    const { patientId, taskId } = req.params;

    const existing = await query(
      `SELECT t.*, p.physician_username
       FROM tasks t
       JOIN patients p ON p.id = t.patient_id
       WHERE t.id = $1 AND t.patient_id = $2 AND t.status NOT IN ('completed','cancelled')`,
      [taskId, patientId]
    );

    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Task not found or already completed." });
    }

    if ((existing.rows[0].physician_username || "").toLowerCase() !== req.user.username.toLowerCase()) {
      return res.status(403).json({ error: "Access denied." });
    }
    if (!existing.rows[0].assigned_at) {
      return res
        .status(400)
        .json({ error: "Task must be assigned before it can be marked complete." });
    }

    const result = await query(
      `UPDATE tasks SET
         status = 'completed',
         completed_at = NOW(),
         completed_by = $1,
         updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [req.user.username, taskId]
    );

    req.audit("COMPLETE_TASK", {
      patientId,
      details: { taskId, taskKey: existing.rows[0].task_key },
    });

    res.json({ task: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function updateTaskNote(req, res, next) {
  try {
    const { patientId, taskId } = req.params;
    const { note } = req.body;

    const result = await query(
      `UPDATE tasks SET note = $1, updated_at = NOW()
       WHERE id = $2 AND patient_id = $3 AND status NOT IN ('cancelled')
       RETURNING *`,
      [note, taskId, patientId]
    );

    if (!result.rows[0]) return res.status(404).json({ error: "Task not found." });

    req.audit("UPDATE_TASK_NOTE", { patientId, details: { taskId } });
    res.json({ task: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { listTasks, upsertTask, assignTask, completeTask, updateTaskNote };
