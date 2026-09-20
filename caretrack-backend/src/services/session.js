/**
 * Session cookie + CSRF token helpers.
 *
 * `setSessionCookies` writes:
 *   - an httpOnly Secure SameSite session cookie carrying the JWT
 *   - a non-httpOnly CSRF cookie the SPA reads and echoes back in
 *     `X-CSRF-Token` on state-changing requests (double-submit pattern)
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config");

function signSessionJwt(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name || user.fullName || null,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

function parseExpiresInMs(spec) {
  // Coarse parser sufficient for our defaults like "8h", "7d", "30m".
  if (typeof spec === "number") return spec * 1000;
  const m = String(spec).match(/^(\d+)([smhd])$/);
  if (!m) return 8 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const mult = { s: 1000, m: 60000, h: 3_600_000, d: 86_400_000 }[m[2]];
  return n * mult;
}

function setSessionCookies(res, user) {
  const token = signSessionJwt(user);
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const maxAge = parseExpiresInMs(env.JWT_EXPIRES_IN);

  const isProd = env.NODE_ENV === "production";
  const baseOptions = {
    sameSite: env.COOKIE_SAMESITE,
    secure: isProd || env.COOKIE_SAMESITE === "none",
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/",
    maxAge,
  };

  res.cookie(env.COOKIE_NAME, token, { ...baseOptions, httpOnly: true });
  res.cookie(env.CSRF_COOKIE_NAME, csrfToken, { ...baseOptions, httpOnly: false });

  return { token, csrfToken, expiresIn: env.JWT_EXPIRES_IN };
}

function clearSessionCookies(res) {
  const opts = { path: "/", domain: env.COOKIE_DOMAIN || undefined };
  res.clearCookie(env.COOKIE_NAME, opts);
  res.clearCookie(env.CSRF_COOKIE_NAME, opts);
}

module.exports = { setSessionCookies, clearSessionCookies };
