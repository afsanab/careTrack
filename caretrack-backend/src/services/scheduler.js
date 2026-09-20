/**
 * Server-side scheduled jobs.
 *
 * Jobs registered here:
 *   1. taskGenerator      — daily creation of clinical tasks for in-house
 *                           patients. Removes the previous bug where new
 *                           60-day cycles only appeared if a user opened
 *                           the patient.
 *   2. auditRetentionPurge — daily delete of audit_log rows older than the
 *                            configured retention window. The Azure Blob
 *                            copy holds the long-term HIPAA record.
 *   3. loginAttemptsPurge — keeps the brute-force tracking table bounded.
 */

const cron = require("node-cron");
const env = require("../config");
const { query } = require("../db/pool");
const { auditLog } = require("../middleware/audit");

const jobs = [];

async function runTaskGeneration() {
  // Compute due/appears dates inline so the worker doesn't need to share
  // logic with the SPA. Mirrors admissions-app/src/taskLogic.js.
  const result = await query(
    `SELECT id, admit_ts FROM patients
     WHERE status = 'inhouse' AND discharged_at IS NULL AND admit_ts IS NOT NULL`
  );
  const now = Date.now();
  let upserts = 0;

  for (const p of result.rows) {
    const admitMs = new Date(p.admit_ts).getTime();
    const days = Math.floor((now - admitMs) / 86_400_000);
    const tasks = [];

    tasks.push({
      key: "hp",
      label: "H & P",
      cycle: 0,
      appearsMs: admitMs,
      dueMs: admitMs + 48 * 3_600_000,
    });

    if (days >= 21) {
      tasks.push({
        key: "30day",
        label: "30-Day",
        cycle: 0,
        appearsMs: admitMs + 21 * 86_400_000,
        dueMs: admitMs + 30 * 86_400_000,
      });
    }

    let cycle = 1;
    while (true) {
      const dueDay = 60 * cycle;
      const appearsDay = dueDay - 9;
      if (appearsDay > days) break;
      tasks.push({
        key: "60day",
        label: cycle === 1 ? "60-Day" : `60-Day #${cycle}`,
        cycle,
        appearsMs: admitMs + appearsDay * 86_400_000,
        dueMs: admitMs + dueDay * 86_400_000,
      });
      cycle++;
      if (cycle > 50) break;
    }

    for (const t of tasks) {
      await query(
        `INSERT INTO tasks (patient_id, task_key, task_label, cycle, due_at, appears_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         ON CONFLICT (patient_id, task_key, cycle) DO NOTHING`,
        [
          p.id,
          t.key,
          t.label,
          t.cycle,
          new Date(t.dueMs).toISOString(),
          new Date(t.appearsMs).toISOString(),
        ]
      );
      upserts += 1;
    }
  }

  auditLog({
    action: "JOB_TASK_GENERATION",
    outcome: "SUCCESS",
    details: { patients: result.rowCount, considered: upserts },
  });
}

async function runAuditRetentionPurge() {
  const days = env.AUDIT_LOG_RETENTION_DAYS;
  const result = await query(
    `DELETE FROM audit_log
     WHERE created_at < NOW() - ($1 || ' days')::interval
     RETURNING id`,
    [String(days)]
  );
  auditLog({
    action: "JOB_AUDIT_PURGE",
    outcome: "SUCCESS",
    details: { deleted: result.rowCount, retentionDays: days },
  });
}

async function runLoginAttemptsPurge() {
  const result = await query(
    `DELETE FROM login_attempts
     WHERE attempted_at < NOW() - INTERVAL '30 days'
     RETURNING id`
  );
  if (result.rowCount > 0) {
    auditLog({
      action: "JOB_LOGIN_ATTEMPTS_PURGE",
      outcome: "SUCCESS",
      details: { deleted: result.rowCount },
    });
  }
}

function registerJob(name, cronSpec, fn) {
  if (!cron.validate(cronSpec)) {
    console.warn(`[scheduler] invalid cron expression for ${name}: '${cronSpec}'`);
    return;
  }
  const task = cron.schedule(cronSpec, async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[scheduler] ${name} failed:`, err);
      auditLog({
        action: `JOB_${name.toUpperCase()}_FAILURE`,
        outcome: "FAILURE",
        details: { message: err.message },
      });
    }
  });
  jobs.push({ name, task });
  console.log(`[scheduler] registered ${name} (${cronSpec})`);
}

function startScheduledJobs() {
  registerJob("task-generation", env.TASK_SCHEDULER_CRON, runTaskGeneration);
  registerJob("audit-purge", "30 3 * * *", runAuditRetentionPurge);
  registerJob("login-attempts-purge", "0 4 * * *", runLoginAttemptsPurge);
}

function stopScheduledJobs() {
  for (const { task } of jobs) {
    try {
      task.stop();
    } catch {
      // ignore
    }
  }
  jobs.length = 0;
}

module.exports = { startScheduledJobs, stopScheduledJobs };
