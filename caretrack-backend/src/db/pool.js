const { Pool } = require("pg");
const env = require("../config");

function buildSslConfig() {
  // DATABASE_URL path: providers like Supabase/Azure use a public TLS chain.
  // Default to strict verification; allow opting into the relaxed mode for
  // local/dev or providers whose CA you can't easily ship.
  if (env.DATABASE_URL) {
    return { rejectUnauthorized: env.DB_SSL_STRICT === "true" };
  }
  // Discrete DB_* path: only enable SSL if DB_SSL=true.
  if (env.DB_SSL !== "true") return false;
  return { rejectUnauthorized: env.DB_SSL_STRICT !== "false" };
}

const baseConfig = env.DATABASE_URL
  ? { connectionString: env.DATABASE_URL }
  : {
      host: env.DB_HOST,
      port: env.DB_PORT || 5432,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    };

const pool = new Pool({
  ...baseConfig,
  ssl: buildSslConfig(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  family: 4,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (env.NODE_ENV === "development") {
      const duration = Date.now() - start;
      console.log(`[DB] ${duration}ms | rows: ${res.rowCount} | ${text.slice(0, 80)}`);
    }
    return res;
  } catch (err) {
    console.error("[DB ERROR]", { text: text.slice(0, 200), error: err.message });
    throw err;
  }
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function ping() {
  const res = await pool.query("SELECT 1 AS ok");
  return res.rows[0]?.ok === 1;
}

async function shutdown() {
  await pool.end();
}

module.exports = { query, withTransaction, ping, shutdown };
