import { createHmac } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = String(process.env.DATABASE_URL || "");
const searchHashSecret = String(process.env.SEARCH_HASH_SECRET || databaseUrl || "");
export const SEARCH_HASH_VERSION = "hmac-sha256-v1";
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

export function queryFingerprint(query, revision = "legacy", secret = searchHashSecret) {
  if (!secret) throw new Error("SEARCH_HASH_SECRET is required when search data is persisted");
  return createHmac("sha256", String(secret))
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

export const SEARCH_CACHE_READ_SQL = `
  WITH expired AS (
    DELETE FROM practice_search_cache
    WHERE expires_at <= NOW()
  )
  SELECT response
  FROM practice_search_cache
  WHERE query_hash = $1 AND key_version = 'hmac-sha256-v1' AND expires_at > NOW()
`;

export const SEARCH_DATA_PURGE_SQL = `
  WITH deleted_cache AS (
    DELETE FROM practice_search_cache
    WHERE expires_at <= NOW()
    RETURNING 1
  ), deleted_runs AS (
    DELETE FROM practice_search_runs
    WHERE created_at < NOW() - INTERVAL '30 days'
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*)::INTEGER FROM deleted_cache) AS deleted_cache,
    (SELECT COUNT(*)::INTEGER FROM deleted_runs) AS deleted_runs
`;

function getPool() {
  if (!databaseUrl) return null;
  if (!pool) {
    const poolMax = Math.max(4, Math.min(Number(process.env.DATABASE_POOL_MAX) || 12, 20));
    pool = new Pool({
      connectionString: databaseUrl,
      max: poolMax,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 20_000,
      ssl: String(process.env.DATABASE_SSL || "").toLowerCase() === "true" ? { rejectUnauthorized: false } : undefined,
    });
    pool.on("error", () => undefined);
  }
  return pool;
}

export function databaseEnabled() {
  return Boolean(databaseUrl);
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
        key_version TEXT NOT NULL DEFAULT 'hmac-sha256-v1',
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
      ALTER TABLE practice_search_cache
        ADD COLUMN IF NOT EXISTS key_version TEXT NOT NULL DEFAULT 'plain-sha256-v0';
      DELETE FROM practice_search_cache
        WHERE key_version <> 'hmac-sha256-v1';
      DELETE FROM practice_search_runs
        WHERE COALESCE(provenance->>'hashVersion', '') <> 'hmac-sha256-v1';
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

export async function withDatabaseClient(operation) {
  const poolInstance = getPool();
  if (!poolInstance) return null;
  await ensureSchema();
  const client = await poolInstance.connect();
  try {
    return await operation(client);
  } finally {
    client.release();
  }
}

export async function databaseQuery(text, parameters = []) {
  const poolInstance = getPool();
  if (!poolInstance) return null;
  await ensureSchema();
  return poolInstance.query(text, parameters);
}

export async function readSearchCache(query, revision) {
  if (!getPool()) return null;
  try {
    await ensureSchema();
    const result = await pool.query(SEARCH_CACHE_READ_SQL, [queryFingerprint(query, revision)]);
    const cached = sanitizeCachedResponse(result.rows[0]?.response);
    return cached ? { ...cached, query: String(query || "").replace(/\s+/gu, " ").trim().slice(0, 180) } : null;
  } catch {
    return null;
  }
}

export async function purgeExpiredSearchData() {
  const poolInstance = getPool();
  if (!poolInstance) return { status: "disabled", deletedCache: 0, deletedRuns: 0 };
  try {
    await ensureSchema();
    const result = await poolInstance.query(SEARCH_DATA_PURGE_SQL);
    return {
      status: "ready",
      deletedCache: Number(result.rows[0]?.deleted_cache || 0),
      deletedRuns: Number(result.rows[0]?.deleted_runs || 0),
    };
  } catch {
    return { status: "degraded", deletedCache: 0, deletedRuns: 0 };
  }
}

export function persistenceWindowOpen({ signal, deadlineAt, now = Date.now(), reserveMs = 0 } = {}) {
  return !signal?.aborted
    && (!Number.isFinite(deadlineAt) || now + Math.max(0, Number(reserveMs) || 0) < deadlineAt);
}

function requirePersistenceWindow(options, reserveMs = 0) {
  if (persistenceWindowOpen({ ...options, reserveMs })) return;
  const error = new Error("Search persistence deadline expired");
  error.name = "AbortError";
  throw error;
}

export async function runSearchPersistenceTransaction(client, {
  hash,
  safeResponse,
  cacheResponse,
  ttlMinutes,
  answerProvider,
  response,
  durationMs,
  provenance,
  signal,
  deadlineAt,
}) {
  await client.query("BEGIN");
  try {
    if (Number.isFinite(deadlineAt)) {
      const statementBudget = Math.max(1, deadlineAt - Date.now() - 120);
      await client.query("SELECT set_config('statement_timeout', $1, TRUE)", [`${statementBudget}ms`]);
    }
    requirePersistenceWindow({ signal, deadlineAt }, 100);
    if (cacheResponse && safeResponse) {
      await client.query(
        `INSERT INTO practice_search_cache (query_hash, query_text, response, expires_at, key_version)
         VALUES ($1, '[cache-key]', $2::jsonb, NOW() + ($3 * INTERVAL '1 minute'), 'hmac-sha256-v1')
         ON CONFLICT (query_hash) DO UPDATE SET
           query_text = '[cache-key]',
           response = EXCLUDED.response,
           key_version = EXCLUDED.key_version,
           created_at = NOW(),
           expires_at = EXCLUDED.expires_at`,
        [hash, JSON.stringify(safeResponse), Math.max(1, Math.min(Number(ttlMinutes) || 60, 24 * 60))],
      );
      requirePersistenceWindow({ signal, deadlineAt }, 100);
    }
    await client.query(
      `INSERT INTO practice_search_runs
        (query_hash, query_text, answer_provider, source_count, duration_ms, provenance)
       VALUES ($1, '[redacted]', $2, $3, $4, $5::jsonb)`,
      [hash, answerProvider, response?.sources?.length || 0, Math.round(durationMs), JSON.stringify(provenance)],
    );
    requirePersistenceWindow({ signal, deadlineAt }, 100);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function recordSearch({
  query,
  response,
  revision,
  answerProvider = "deterministic-current-evidence",
  answerStatus = "ready",
  documentIds = [],
  durationMs,
  ttlMinutes = 60,
  cacheResponse = true,
  signal,
  deadlineAt,
}) {
  const poolInstance = getPool();
  if (!poolInstance) return { status: "disabled" };
  if (!persistenceWindowOpen({ signal, deadlineAt, reserveMs: 150 })) return { status: "cancelled" };
  let client;
  try {
    await ensureSchema();
    requirePersistenceWindow({ signal, deadlineAt }, 150);
    client = await poolInstance.connect();
    requirePersistenceWindow({ signal, deadlineAt }, 150);
    const hash = queryFingerprint(query, revision);
    const provenance = {
      revision,
      hashVersion: SEARCH_HASH_VERSION,
      answerStatus,
      documentIds: (documentIds || []).map(String).slice(0, 12),
    };
    const safeResponse = sanitizeCachedResponse(response);
    await runSearchPersistenceTransaction(client, {
      hash,
      safeResponse,
      cacheResponse,
      ttlMinutes,
      answerProvider,
      response,
      durationMs,
      provenance,
      signal,
      deadlineAt,
    });
    return { status: "ready" };
  } catch (error) {
    return error?.name === "AbortError"
      ? { status: "cancelled" }
      : { status: "degraded", error: error.message };
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
