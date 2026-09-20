const jwt = require("jsonwebtoken");
const env = require("../config");

/**
 * Read the session JWT from either the httpOnly session cookie (production)
 * or the Authorization: Bearer header (backwards compatible / API tools).
 */
function extractToken(req) {
  const cookieToken = req.cookies?.[env.COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const header = req.headers["authorization"];
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/**
 * Verify session token and attach decoded payload to req.user.
 */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  try {
    req.user = jwt.verify(token, env.JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    return res.status(401).json({ error: "Invalid session." });
  }
}

/**
 * Restrict a route to one or more roles. Use AFTER requireAuth.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }
    next();
  };
}

/**
 * CSRF protection for cookie-authenticated state-changing requests.
 * Implements the double-submit cookie pattern: the server sets a
 * non-httpOnly CSRF cookie on login; the SPA reads it and echoes the value
 * back in the `X-CSRF-Token` header on every non-idempotent request. Cross-
 * origin attackers can't read the cookie, so they can't forge the header.
 *
 * Bearer-token clients (API tools, server-to-server) bypass CSRF because
 * they don't carry the session cookie at all.
 */
function csrfProtect(req, res, next) {
  const SAFE = ["GET", "HEAD", "OPTIONS"];
  if (SAFE.includes(req.method)) return next();

  const sessionCookie = req.cookies?.[env.COOKIE_NAME];
  if (!sessionCookie) return next(); // Bearer flow

  const csrfCookie = req.cookies?.[env.CSRF_COOKIE_NAME];
  const csrfHeader = req.get("x-csrf-token");
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: "CSRF check failed." });
  }
  next();
}

module.exports = { requireAuth, requireRole, csrfProtect };
