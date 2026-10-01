/**
 * Session cookie + CSRF token helpers.
 *
 * `setSessionCookies` writes:
 *   - an httpOnly Secure session cookie carrying the JWT
 *   - a non-httpOnly CSRF cookie, also returned in JSON and `X-CSRF-Token`
 *     so a cross-origin SPA can echo it on state-changing requests
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

function cookieBaseOptions() {
  const isProd = env.NODE_ENV === "production";
  return {
    sameSite: env.COOKIE_SAMESITE,
    secure: isProd || env.COOKIE_SAMESITE === "none",
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/",
  };
}

function attachCsrfHeader(res, csrfToken) {
  res.set("X-CSRF-Token", csrfToken);
  return csrfToken;
}

function setSessionCookies(res, user) {
  const token = signSessionJwt(user);
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const baseOptions = {
    ...cookieBaseOptions(),
    maxAge: parseExpiresInMs(env.JWT_EXPIRES_IN),
  };

  res.cookie(env.COOKIE_NAME, token, { ...baseOptions, httpOnly: true });
  res.cookie(env.CSRF_COOKIE_NAME, csrfToken, { ...baseOptions, httpOnly: false });
  attachCsrfHeader(res, csrfToken);

  return { token, csrfToken, expiresIn: env.JWT_EXPIRES_IN };
}

/**
 * SPA hosts on a different site (e.g. Azure Static Web Apps) cannot read
 * the CSRF cookie via document.cookie. Return the existing cookie value, or
 * mint one if the session cookie survived without it.
 */
function readOrIssueCsrf(req, res) {
  let csrfToken = req.cookies?.[env.CSRF_COOKIE_NAME];
  if (!csrfToken) {
    csrfToken = crypto.randomBytes(32).toString("hex");
    res.cookie(env.CSRF_COOKIE_NAME, csrfToken, {
      ...cookieBaseOptions(),
      httpOnly: false,
      maxAge: parseExpiresInMs(env.JWT_EXPIRES_IN),
    });
  }
  return attachCsrfHeader(res, csrfToken);
}

function clearSessionCookies(res) {
  const opts = cookieBaseOptions();
  res.clearCookie(env.COOKIE_NAME, opts);
  res.clearCookie(env.CSRF_COOKIE_NAME, opts);
}

module.exports = { setSessionCookies, readOrIssueCsrf, clearSessionCookies };
