import { createHash } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = String(process.env.DATABASE_URL || "");
let pool;
let schemaPromise;

export function assertSafeDatabaseUrl(value) {
  if (!value) return true;
  let name = "";
  try {
    name = decodeURIComponent(new URL(value).pathname.replace(/^\/+/, "")).toLocaleLowerCase("et");
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL");
  }
  if (!name || name.includes("chatwoot")) {
    throw new Error("Practice search requires a dedicated non-Chatwoot PostgreSQL database");
  }
  return true;
}

assertSafeDatabaseUrl(databaseUrl);

function queryHash(query) {
  return createHash("sha256").update(String(query).trim().toLocaleLowerCase("et")).digest("hex");
}

function getPool() {
  if (!databaseUrl) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 3,
      connectionTimeoutMillis: 4_000,
      idleTimeoutMillis: 20_000,
      ssl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true" ? { rejectUnauthorized: false } : undefined,
    });
    pool.on("error", () => undefined);
  }
  return pool;
}

async function ensureSchema() {
  const client = getPool();
  if (!client) return false;
  if (!schemaPromise) {
    schemaPromise = client.query(`
      CREATE TABLE IF NOT EXISTS practice_search_cache (
        query_hash TEXT PRIMARY KEY,
        query_text TEXT NOT NULL,
        response JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS practice_search_runs (
        id BIGSERIAL PRIMARY KEY,
        query_hash TEXT NOT NULL,
        query_text TEXT NOT NULL,
        answer_provider TEXT NOT NULL,
        source_count INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        provenance JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS practice_search_runs_created_at_idx
        ON practice_search_runs (created_at DESC);
    `).then(() => true).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

export async function readSearchCache(query) {
  if (!getPool()) return null;
  try {
    await ensureSchema();
    const result = await pool.query(
      "SELECT response FROM practice_search_cache WHERE query_hash = $1 AND expires_at > NOW()",
      [queryHash(query)],
    );
    return result.rows[0]?.response || null;
  } catch {
    return null;
  }
}

export async function recordSearch({ query, response, durationMs, ttlMinutes = 10 }) {
  if (!getPool()) return { status: "disabled" };
  try {
    await ensureSchema();
    const hash = queryHash(query);
    const provenance = response?.meta?.providers || [];
    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO practice_search_cache (query_hash, query_text, response, expires_at)
         VALUES ($1, $2, $3::jsonb, NOW() + ($4 * INTERVAL '1 minute'))
         ON CONFLICT (query_hash) DO UPDATE SET
           query_text = EXCLUDED.query_text,
           response = EXCLUDED.response,
           created_at = NOW(),
           expires_at = EXCLUDED.expires_at`,
        [hash, query, JSON.stringify(response), ttlMinutes],
      );
      await pool.query(
        `INSERT INTO practice_search_runs
          (query_hash, query_text, answer_provider, source_count, duration_ms, provenance)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [hash, query, response?.meta?.answerProvider || "fallback", response?.sources?.length || 0, Math.round(durationMs), JSON.stringify(provenance)],
      );
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
    return { status: "ready" };
  } catch (error) {
    return { status: "degraded", error: error.message };
  }
}

export async function databaseHealth() {
  if (!getPool()) return { enabled: false, status: "disabled" };
  try {
    await ensureSchema();
    await pool.query("SELECT 1");
    return { enabled: true, status: "ready" };
  } catch {
    return { enabled: true, status: "degraded" };
  }
}

export function databaseConfiguration() {
  return { enabled: Boolean(databaseUrl), driver: "postgresql" };
}
