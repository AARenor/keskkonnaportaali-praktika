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

function queryHash(query, revision = "legacy") {
  return createHash("sha256")
    .update(String(revision))
    .update("\0")
    .update(String(query).trim().toLocaleLowerCase("et"))
    .digest("hex");
}

export function sanitizeCachedResponse(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const { query: _query, ...safeResponse } = response;
  return safeResponse;
}

function getPool() {
  if (!databaseUrl) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 20_000,
      ssl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true" ? { rejectUnauthorized: false } : undefined,
    });
    pool.on("error", () => undefined);
  }
  return pool;
}

async function ensureSchema() {
  const poolInstance = getPool();
  if (!poolInstance) return false;
  if (!schemaPromise) {
    schemaPromise = poolInstance.query(`
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
      UPDATE practice_search_cache
        SET query_text = '[cache-key]', response = response - 'query'
        WHERE query_text <> '[cache-key]' OR response ? 'query';
      UPDATE practice_search_runs
        SET query_text = '[redacted]'
        WHERE query_text <> '[redacted]';
      DELETE FROM practice_search_cache WHERE expires_at <= NOW();
      DELETE FROM practice_search_runs WHERE created_at < NOW() - INTERVAL '30 days';
    `).then(() => true).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

export async function readSearchCache(query, revision) {
  if (!getPool()) return null;
  try {
    await ensureSchema();
    const result = await pool.query(
      "SELECT response FROM practice_search_cache WHERE query_hash = $1 AND expires_at > NOW()",
      [queryHash(query, revision)],
    );
    const cached = sanitizeCachedResponse(result.rows[0]?.response);
    return cached ? { ...cached, query: String(query || "").replace(/\s+/gu, " ").trim().slice(0, 180) } : null;
  } catch {
    return null;
  }
}

export async function recordSearch({
  query,
  response,
  revision,
  answerProvider = "reviewed-knowledge",
  answerStatus = "ready",
  documentIds = [],
  durationMs,
  ttlMinutes = 60,
  cacheResponse = true,
}) {
  const poolInstance = getPool();
  if (!poolInstance) return { status: "disabled" };
  let client;
  try {
    await ensureSchema();
    client = await poolInstance.connect();
    const hash = queryHash(query, revision);
    const provenance = {
      revision,
      answerStatus,
      documentIds: (documentIds || []).map(String).slice(0, 12),
    };
    const safeResponse = sanitizeCachedResponse(response);
    await client.query("BEGIN");
    try {
      if (cacheResponse && safeResponse) {
        await client.query(
          `INSERT INTO practice_search_cache (query_hash, query_text, response, expires_at)
           VALUES ($1, '[cache-key]', $2::jsonb, NOW() + ($3 * INTERVAL '1 minute'))
           ON CONFLICT (query_hash) DO UPDATE SET
             query_text = '[cache-key]',
             response = EXCLUDED.response,
             created_at = NOW(),
             expires_at = EXCLUDED.expires_at`,
          [hash, JSON.stringify(safeResponse), Math.max(1, Math.min(Number(ttlMinutes) || 60, 24 * 60))],
        );
      }
      await client.query(
        `INSERT INTO practice_search_runs
          (query_hash, query_text, answer_provider, source_count, duration_ms, provenance)
         VALUES ($1, '[redacted]', $2, $3, $4, $5::jsonb)`,
        [hash, answerProvider, response?.sources?.length || 0, Math.round(durationMs), JSON.stringify(provenance)],
      );
      await client.query(
        "DELETE FROM practice_search_runs WHERE created_at < NOW() - INTERVAL '30 days'",
      );
      await client.query(
        "DELETE FROM practice_search_cache WHERE expires_at <= NOW()",
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    return { status: "ready" };
  } catch (error) {
    return { status: "degraded", error: error.message };
  } finally {
    client?.release();
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
