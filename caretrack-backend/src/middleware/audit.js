/**
 * HIPAA Audit Logger.
 *
 * Every PHI access / modification gets a row written to the `audit_log`
 * table (primary trail) and a JSONL line written to local disk (operator
 * convenience). In production, if AZURE_STORAGE_CONNECTION_STRING is set,
 * each event is also appended to an Azure Append Blob for tamper-resistant
 * 7-year retention.
 *
 * Writes are fire-and-forget so they never block a request, but errors are
 * logged so they can be alerted on.
 */

const fs = require("fs");
const path = require("path");
const winston = require("winston");
const env = require("../config");
const { query } = require("../db/pool");

const logDir = path.join(__dirname, "../../logs");
let canWriteFiles = false;
try {
  fs.mkdirSync(logDir, { recursive: true });
  canWriteFiles = true;
} catch (err) {
  console.error("[audit] local log directory unavailable:", err.message);
}

const transports = [];
if (canWriteFiles) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, "audit.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 90,
      tailable: true,
    })
  );
}

if (env.NODE_ENV !== "test") {
  transports.push(
    new winston.transports.Console({
      format:
        env.NODE_ENV === "production"
          ? winston.format.combine(winston.format.timestamp(), winston.format.json())
          : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    })
  );
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports,
});

// ── Optional Azure Blob append-only audit shipping ──
let appendBlobClient = null;
async function getAzureClient() {
  if (appendBlobClient !== null) return appendBlobClient || null;
  if (!env.AZURE_STORAGE_CONNECTION_STRING) {
    appendBlobClient = false;
    return null;
  }
  try {
    const { BlobServiceClient } = require("@azure/storage-blob");
    const svc = BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);
    const container = svc.getContainerClient(env.AZURE_AUDIT_CONTAINER);
    await container.createIfNotExists();
    const today = new Date().toISOString().slice(0, 10);
    const blob = container.getAppendBlobClient(`audit-${today}.jsonl`);
    await blob.createIfNotExists();
    appendBlobClient = blob;
    return blob;
  } catch (err) {
    console.error("[audit] Azure Blob init failed:", err.message);
    appendBlobClient = false;
    return null;
  }
}

async function shipToAzure(line) {
  const client = await getAzureClient();
  if (!client) return;
  try {
    await client.appendBlock(line, Buffer.byteLength(line));
  } catch (err) {
    console.error("[audit] Azure Blob append failed:", err.message);
  }
}

function persistToDb(event) {
  // Fire-and-forget; never block the request.
  query(
    `INSERT INTO audit_log
       (action, user_id, username, role, patient_id, ip_address, outcome, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      String(event.action || "UNKNOWN").slice(0, 80),
      isUuid(event.userId) ? event.userId : null,
      event.username ? String(event.username).slice(0, 80) : null,
      event.role ? String(event.role).slice(0, 20) : null,
      isUuid(event.patientId) ? event.patientId : null,
      event.ip ? String(event.ip).slice(0, 45) : null,
      String(event.outcome || "SUCCESS").slice(0, 20),
      JSON.stringify(event.details ?? {}),
    ]
  ).catch((err) => {
    console.error("[audit] DB write failed:", err.message);
  });
}

function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function auditLog(event) {
  const enriched = {
    type: "AUDIT",
    timestamp: new Date().toISOString(),
    outcome: event.outcome || "SUCCESS",
    ...event,
  };

  logger.info(enriched);
  persistToDb(enriched);

  if (env.NODE_ENV === "production" && env.AZURE_STORAGE_CONNECTION_STRING) {
    shipToAzure(JSON.stringify(enriched) + "\n");
  }
}

function auditMiddleware(req, _res, next) {
  req.audit = (action, details = {}) => {
    auditLog({
      action,
      userId: req.user?.id || null,
      username: req.user?.username || null,
      role: req.user?.role || null,
      ip: req.ip || req.connection?.remoteAddress,
      patientId: details.patientId || null,
      details,
    });
  };
  next();
}

module.exports = { auditLog, auditMiddleware };
