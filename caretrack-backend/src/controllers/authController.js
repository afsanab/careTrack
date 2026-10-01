const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const env = require("../config");
const { query, withTransaction } = require("../db/pool");
const { auditLog } = require("../middleware/audit");
const { hashToken } = require("./invitationsController");
const {
  setSessionCookies,
  readOrIssueCsrf,
  clearSessionCookies,
} = require("../services/session");
const {
  recordAttempt,
  checkLockout,
  registerFailure,
  registerSuccess,
} = require("../services/lockout");

const DUMMY_HASH =
  "$2b$12$invalidhashfortimingattackprevention.padding000000000000";

/**
 * POST /api/auth/login
 * Body: { username, password }
 * On success sets httpOnly session cookie + CSRF cookie, returns user shape.
 */
async function login(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress;
  const { username, password } = req.body;

  try {
    const lockout = await checkLockout(username);
    if (lockout.locked) {
      auditLog({
        action: "LOGIN_BLOCKED",
        username,
        ip,
        outcome: "FAILURE",
        details: { reason: "account_locked", until: lockout.until },
      });
      await recordAttempt({ username, ip, outcome: "FAILURE", reason: "locked" });
      res.set("Retry-After", String(lockout.retryAfterSec));
      return res.status(423).json({
        error: "Account temporarily locked. Try again later.",
        retryAfterSec: lockout.retryAfterSec,
      });
    }

    const result = await query(
      `SELECT id, username, password_hash, role, is_active, full_name, must_change_password
       FROM users WHERE username = $1`,
      [username]
    );
    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(
      password,
      user ? user.password_hash : DUMMY_HASH
    );

    if (!user || !passwordMatch) {
      if (user) {
        const failure = await registerFailure(user.username);
        if (failure.locked) {
          auditLog({
            action: "ACCOUNT_LOCKED",
            userId: user.id,
            username: user.username,
            role: user.role,
            ip,
            outcome: "FAILURE",
            details: { until: failure.until },
          });
        }
      }
      auditLog({
        action: "LOGIN_FAILURE",
        userId: user?.id || null,
        username,
        role: user?.role || null,
        ip,
        outcome: "FAILURE",
        details: { reason: !user ? "user_not_found" : "wrong_password" },
      });
      await recordAttempt({
        username,
        ip,
        outcome: "FAILURE",
        reason: !user ? "user_not_found" : "wrong_password",
      });
      return res.status(401).json({ error: "Invalid username or password." });
    }

    if (!user.is_active) {
      auditLog({
        action: "LOGIN_FAILURE",
        userId: user.id,
        username: user.username,
        role: user.role,
        ip,
        outcome: "FAILURE",
        details: { reason: "account_disabled" },
      });
      await recordAttempt({ username, ip, outcome: "FAILURE", reason: "disabled" });
      return res
        .status(403)
        .json({ error: "Account is disabled. Contact your administrator." });
    }

    await registerSuccess(user.username);
    await recordAttempt({ username, ip, outcome: "SUCCESS" });

    const { expiresIn, csrfToken } = setSessionCookies(res, user);

    auditLog({
      action: "LOGIN_SUCCESS",
      userId: user.id,
      username: user.username,
      role: user.role,
      ip,
      outcome: "SUCCESS",
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        mustChangePassword: user.must_change_password === true,
      },
      expiresIn,
      csrfToken,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Clears session cookies and records the event.
 */
async function logout(req, res) {
  if (req.user) {
    auditLog({
      action: "LOGOUT",
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      ip: req.ip,
      outcome: "SUCCESS",
    });
  }
  clearSessionCookies(res);
  res.json({ message: "Logged out successfully." });
}

/**
 * GET /api/auth/me
 */
async function me(req, res, next) {
  try {
    const result = await query(
      `SELECT id, username, full_name, role, last_login_at, must_change_password
       FROM users WHERE id = $1 AND is_active = true`,
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(401).json({ error: "User not found or disabled." });
    }
    const row = result.rows[0];
    const csrfToken = readOrIssueCsrf(req, res);
    res.json({
      user: {
        id: row.id,
        username: row.username,
        fullName: row.full_name,
        role: row.role,
        lastLoginAt: row.last_login_at,
        mustChangePassword: row.must_change_password === true,
      },
      csrfToken,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/change-password
 */
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    const result = await query("SELECT password_hash FROM users WHERE id = $1", [
      req.user.id,
    ]);
    const user = result.rows[0];
    const match = user ? await bcrypt.compare(currentPassword, user.password_hash) : false;

    if (!match) {
      auditLog({
        action: "CHANGE_PASSWORD_FAILURE",
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        ip: req.ip,
        outcome: "FAILURE",
      });
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    const newHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
    await query(
      `UPDATE users SET password_hash = $1, must_change_password = FALSE,
                        updated_at = NOW()
       WHERE id = $2`,
      [newHash, req.user.id]
    );

    auditLog({
      action: "CHANGE_PASSWORD_SUCCESS",
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      ip: req.ip,
      outcome: "SUCCESS",
    });

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/register
 * Body: { token, password, fullName? }
 */
async function registerWithInvite(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress;

  try {
    const { token, password, fullName } = req.body;
    const tokenHash = hashToken(token.trim());

    const userRow = await withTransaction(async (client) => {
      const invRes = await client.query(
        `SELECT id, username, role, expires_at
         FROM invitations
         WHERE token_hash = $1 AND used_at IS NULL
         FOR UPDATE`,
        [tokenHash]
      );
      const inv = invRes.rows[0];
      if (!inv) return null;
      if (new Date(inv.expires_at) <= new Date()) return { expired: true };

      const exists = await client.query("SELECT 1 FROM users WHERE username = $1", [inv.username]);
      if (exists.rows[0]) return { usernameTaken: true, username: inv.username };

      const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
      const id = uuidv4();
      await client.query(
        `INSERT INTO users (id, username, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, inv.username, passwordHash, fullName?.trim() || null, inv.role]
      );
      await client.query("UPDATE invitations SET used_at = NOW() WHERE id = $1", [inv.id]);

      const u = await client.query(
        "SELECT id, username, full_name, role FROM users WHERE id = $1",
        [id]
      );
      return { user: u.rows[0] };
    });

    if (!userRow) {
      auditLog({
        action: "REGISTER_INVITE_FAILURE",
        ip,
        outcome: "FAILURE",
        details: { reason: "invalid_or_used_token" },
      });
      return res.status(400).json({ error: "Invalid or expired invitation." });
    }
    if (userRow.expired) {
      return res.status(410).json({ error: "This invitation has expired." });
    }
    if (userRow.usernameTaken) {
      return res.status(409).json({
        error: `The username "${userRow.username}" is already registered.`,
      });
    }

    const user = userRow.user;
    const { expiresIn, csrfToken } = setSessionCookies(res, user);

    auditLog({
      action: "REGISTER_INVITE_SUCCESS",
      userId: user.id,
      username: user.username,
      role: user.role,
      ip,
      outcome: "SUCCESS",
    });

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        mustChangePassword: false,
      },
      expiresIn,
      csrfToken,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me, changePassword, registerWithInvite };
