/**
 * Centralized environment validation and config.
 *
 * Imported FIRST from server.js. Throws on boot if a required variable is
 * missing or obviously wrong, so the process fails fast instead of silently
 * signing JWTs with `undefined` or connecting to no database.
 */

require("dotenv").config();
const { z } = require("zod");

const isTest = process.env.NODE_ENV === "test";

// In test mode we provide fallbacks so unit tests don't need a full .env.
const FALLBACK = isTest
  ? {
      JWT_SECRET: "test-jwt-secret-not-for-production-only-for-vitest-suite",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      ALLOWED_ORIGINS: "http://localhost:5173",
      APP_PUBLIC_URL: "http://localhost:5173",
    }
  : {};

const Schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3001),

  // ── Database ──
  DATABASE_URL: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().min(1).optional()
  ),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().positive().optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_SSL: z.enum(["true", "false"]).default("false"),
  DB_SSL_STRICT: z.enum(["true", "false"]).default("false"),

  // ── Auth ──
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // ── Cookies / CSRF ──
  COOKIE_NAME: z.string().default("caretrack_session"),
  CSRF_COOKIE_NAME: z.string().default("caretrack_csrf"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),

  // ── Lockout ──
  LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOCKOUT_DURATION_MIN: z.coerce.number().int().positive().default(15),

  // ── CORS ──
  ALLOWED_ORIGINS: z.string().min(1),

  // ── Rate limiting ──
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // ── Invites / Public URL ──
  APP_PUBLIC_URL: z.string().url().optional(),
  INVITE_PATH: z.string().default("/?invite="),
  INVITE_EXPIRES_DAYS: z.coerce.number().int().positive().default(7),

  // ── Email (optional) ──
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // ── Audit log shipping (optional) ──
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_AUDIT_CONTAINER: z.string().default("caretrack-audit-logs"),
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

  // ── Scheduled jobs ──
  TASK_SCHEDULER_CRON: z.string().default("0 5 * * *"), // daily 05:00
  SCHEDULER_ENABLED: z.enum(["true", "false"]).default("true"),
});

const parsed = Schema.safeParse({ ...FALLBACK, ...process.env });

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  console.error(
    `\nFATAL: invalid environment configuration:\n${issues}\n` +
      `Check your .env file or App Service settings.\n`
  );
  process.exit(1);
}

const env = parsed.data;

// Cross-field validation: must have either DATABASE_URL or all DB_* fields.
if (!env.DATABASE_URL) {
  const missing = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].filter(
    (k) => !env[k]
  );
  if (missing.length) {
    console.error(
      `FATAL: provide DATABASE_URL or all of DB_HOST/DB_NAME/DB_USER/DB_PASSWORD. Missing: ${missing.join(", ")}.`
    );
    process.exit(1);
  }
}

// In production, refuse to start with development-grade secrets or no SSL.
if (env.NODE_ENV === "production") {
  if (env.JWT_SECRET.length < 64) {
    console.error("FATAL: JWT_SECRET must be at least 64 chars in production.");
    process.exit(1);
  }
  if (!env.APP_PUBLIC_URL) {
    console.error("FATAL: APP_PUBLIC_URL is required in production.");
    process.exit(1);
  }
  if (env.DATABASE_URL && !/sslmode=require|ssl=true/.test(env.DATABASE_URL) && env.DB_SSL !== "true") {
    console.error("FATAL: production DB connection must use SSL (sslmode=require or DB_SSL=true).");
    process.exit(1);
  }
}

env.ALLOWED_ORIGINS_LIST = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

module.exports = env;
