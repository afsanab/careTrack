const env = require("./config");

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const routes = require("./routes");
const { auditMiddleware } = require("./middleware/audit");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { shutdown: dbShutdown } = require("./db/pool");
const { startScheduledJobs, stopScheduledJobs } = require("./services/scheduler");

const app = express();

if (env.NODE_ENV === "production") app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// ── CORS ──────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      // No Origin: curl, health probes, and typing the API URL in a browser.
      if (!origin) return cb(null, true);
      if (env.ALLOWED_ORIGINS_LIST.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    exposedHeaders: ["Retry-After", "X-CSRF-Token"],
    credentials: true,
  })
);

// ── Rate limiting ─────────────────────────────────────
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/invite-info", authLimiter);
app.use("/api", limiter);

// ── Parsers ───────────────────────────────────────────
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ── Logging ───────────────────────────────────────────
if (env.NODE_ENV !== "test") {
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
}

// ── Audit ─────────────────────────────────────────────
app.use(auditMiddleware);

app.disable("x-powered-by");

// ── Routes ────────────────────────────────────────────
app.use("/api", routes);
app.use(notFound);
app.use(errorHandler);

let server;
let stopped = false;

async function gracefulShutdown(signal) {
  if (stopped) return;
  stopped = true;
  console.log(`\n${signal} received. Shutting down…`);
  try {
    stopScheduledJobs();
  } catch (err) {
    console.error("Scheduler shutdown error:", err.message);
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    await dbShutdown();
  } catch (err) {
    console.error("DB shutdown error:", err.message);
  }
  process.exit(0);
}

if (require.main === module) {
  server = app.listen(env.PORT, () => {
    console.log(`
╔══════════════════════════════════════════════╗
║          CareTrack API Server                ║
║  Port    : ${String(env.PORT).padEnd(34)}║
║  Env     : ${env.NODE_ENV.padEnd(34)}║
╚══════════════════════════════════════════════╝
`);
  });

  if (env.SCHEDULER_ENABLED === "true") {
    startScheduledJobs();
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

module.exports = app;
