/**
 * Per-account login lockout.
 *
 * Strategy: N consecutive failed attempts (LOCKOUT_MAX_ATTEMPTS) lock the
 * account for D minutes (LOCKOUT_DURATION_MIN). The counter resets on a
 * successful login. Recorded both on the `users` row (fast read) and the
 * `login_attempts` table (full audit history for the security team).
 */

const env = require("../config");
const { query } = require("../db/pool");

async function recordAttempt({ username, ip, outcome, reason }) {
  await query(
    `INSERT INTO login_attempts (username, ip_address, outcome, reason)
     VALUES ($1, $2, $3, $4)`,
    [username || "unknown", ip || null, outcome, reason || null]
  );
}

async function checkLockout(username) {
  if (!username) return { locked: false };
  const result = await query(
    `SELECT failed_login_attempts, locked_until
     FROM users WHERE username = $1`,
    [username]
  );
  const row = result.rows[0];
  if (!row) return { locked: false };
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    return {
      locked: true,
      until: row.locked_until,
      retryAfterSec: Math.max(1, Math.ceil((new Date(row.locked_until) - new Date()) / 1000)),
    };
  }
  return { locked: false };
}

async function registerFailure(username) {
  if (!username) return { locked: false };
  const max = env.LOCKOUT_MAX_ATTEMPTS;
  const durationMin = env.LOCKOUT_DURATION_MIN;

  const result = await query(
    `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts + 1 >= $2
             THEN NOW() + ($3 || ' minutes')::interval
             ELSE locked_until
           END,
           updated_at = NOW()
     WHERE username = $1
     RETURNING failed_login_attempts, locked_until`,
    [username, max, String(durationMin)]
  );
  return {
    locked: !!(result.rows[0]?.locked_until && new Date(result.rows[0].locked_until) > new Date()),
    until: result.rows[0]?.locked_until,
  };
}

async function registerSuccess(username) {
  if (!username) return;
  await query(
    `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login_at = NOW(),
           updated_at = NOW()
     WHERE username = $1`,
    [username]
  );
}

module.exports = { recordAttempt, checkLockout, registerFailure, registerSuccess };
