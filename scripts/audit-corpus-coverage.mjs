// Read-only corpus coverage audit. Prints one JSON object to stdout and exits
// non-zero only when the database connection or a query fails.
import pg from "pg";

const { Pool } = pg;

function connectionFailure(message) {
  const error = new Error(message);
  error.auditFailure = true;
  return error;
}

function isPrivateHostname(hostname) {
  if (["postgres", "localhost", "::1"].includes(hostname)) return true;
  if (hostname.startsWith("127.")) return true;
  if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) return true;
  const [first, second] = hostname.split(".").map(Number);
  return first === 172 && second >= 16 && second <= 31;
}

// server/database.mjs requires SEARCH_HASH_SECRET for unrelated search
// persistence, so this audit uses the same pg driver directly while keeping
// the explicit TLS policy. A plaintext connection is accepted only for the
// same local hosts the server allows, plus private RFC 1918 addresses used by
// local Docker/Postgres test setups.
function resolveDatabaseSsl(url) {
  const selected = String(process.env.DATABASE_SSL_MODE ?? process.env.DATABASE_SSL ?? "")
    .trim()
    .toLocaleLowerCase("en");
  if (!selected) {
    throw connectionFailure("DATABASE_SSL_MODE must be explicitly set to disable or verify-full");
  }
  if (["disable", "disabled", "false", "off"].includes(selected)) {
    let hostname = "";
    try {
      hostname = new URL(url).hostname.replace(/^\[|\]$/gu, "").toLocaleLowerCase("en");
    } catch {
      throw connectionFailure("DATABASE_SSL_MODE=disable requires a recognized local database URL");
    }
    const configuredHosts = String(process.env.DATABASE_PLAINTEXT_HOSTS || "")
      .split(",")
      .map((value) => value.trim().toLocaleLowerCase("en"))
      .filter(Boolean);
    const allowedHosts = new Set(["postgres", "localhost", "127.0.0.1", "::1", ...configuredHosts]);
    if (!allowedHosts.has(hostname) && !isPrivateHostname(hostname)) {
      throw connectionFailure("DATABASE_SSL_MODE=disable is allowed only for an explicit local database host");
    }
    return undefined;
  }
  if (!["verify-full", "true"].includes(selected)) {
    throw connectionFailure("DATABASE_SSL_MODE must be disable or verify-full");
  }
  const ca = String(process.env.DATABASE_SSL_CA || "").trim();
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

function count(value) {
  return Number(value || 0);
}

function coveragePercent(hydrated, total) {
  if (!total) return 0;
  return Math.round((hydrated / total) * 1_000) / 10;
}

// Hosts are grouped without a port; the scheme/userinfo prefix is not part of
// the host, and an invalid URL falls back to the trimmed authority.
const HOST_EXPRESSION = `
  COALESCE(
    NULLIF(
      regexp_replace(
        lower(split_part(split_part(canonical_url, '://', 2), '/', 1)),
        ':[0-9]+$',
        ''
      ),
      ''
    ),
    'unknown'
  )
`;

async function collectCoverage(client) {
  const totals = await client.query(`
    SELECT
      COUNT(*)::BIGINT AS total,
      COUNT(*) FILTER (WHERE is_available)::BIGINT AS available,
      COUNT(*) FILTER (WHERE content <> '')::BIGINT AS hydrated,
      COUNT(*) FILTER (WHERE content = '')::BIGINT AS empty,
      COUNT(*) FILTER (WHERE source_key = 'official-sitemap' AND content = '')::BIGINT
        AS official_sitemap_missing_content
    FROM practice_corpus_documents
  `);

  const bySourceKey = await client.query(`
    SELECT
      source_key,
      COUNT(*)::BIGINT AS total,
      COUNT(*) FILTER (WHERE is_available)::BIGINT AS available,
      COUNT(*) FILTER (WHERE content <> '')::BIGINT AS hydrated,
      COUNT(*) FILTER (WHERE content = '')::BIGINT AS empty
    FROM practice_corpus_documents
    GROUP BY source_key
    ORDER BY total DESC, source_key ASC
  `);

  const byHost = await client.query(`
    SELECT
      ${HOST_EXPRESSION} AS host,
      COUNT(*)::BIGINT AS total,
      COUNT(*) FILTER (WHERE is_available)::BIGINT AS available,
      COUNT(*) FILTER (WHERE content <> '')::BIGINT AS hydrated,
      COUNT(*) FILTER (WHERE content = '')::BIGINT AS empty
    FROM practice_corpus_documents
    GROUP BY host
    ORDER BY total DESC, host ASC
    LIMIT 20
  `);

  const bySourceTier = await client.query(`
    SELECT
      source_tier,
      COUNT(*)::BIGINT AS total,
      COUNT(*) FILTER (WHERE content <> '')::BIGINT AS hydrated
    FROM practice_corpus_documents
    GROUP BY source_tier
    ORDER BY total DESC, source_tier ASC
  `);

  const latestRun = await client.query(`
    SELECT
      id,
      mode,
      status,
      discovered_count,
      indexed_count,
      hydrated_count,
      error_count,
      started_at,
      finished_at
    FROM practice_corpus_runs
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  `);

  const documents = totals.rows[0] || {};
  const total = count(documents.total);
  const hydrated = count(documents.hydrated);
  const run = latestRun.rows[0];

  return {
    documents: {
      total,
      available: count(documents.available),
      hydrated,
      empty: count(documents.empty),
    },
    hydrationCoveragePercent: coveragePercent(hydrated, total),
    officialSitemapMissingContent: count(documents.official_sitemap_missing_content),
    bySourceKey: bySourceKey.rows.map((row) => ({
      sourceKey: row.source_key,
      total: count(row.total),
      available: count(row.available),
      hydrated: count(row.hydrated),
      empty: count(row.empty),
    })),
    byHost: byHost.rows.map((row) => ({
      host: row.host,
      total: count(row.total),
      available: count(row.available),
      hydrated: count(row.hydrated),
      empty: count(row.empty),
    })),
    bySourceTier: bySourceTier.rows.map((row) => ({
      sourceTier: row.source_tier,
      total: count(row.total),
      hydrated: count(row.hydrated),
    })),
    latestCorpusRun: run
      ? {
          id: count(run.id),
          mode: run.mode,
          status: run.status,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          discoveredCount: count(run.discovered_count),
          indexedCount: count(run.indexed_count),
          hydratedCount: count(run.hydrated_count),
          errorCount: count(run.error_count),
        }
      : null,
  };
}

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw connectionFailure("DATABASE_URL is required");

  const ssl = resolveDatabaseSsl(databaseUrl);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    ssl,
  });
  pool.on("error", () => undefined);

  let client;
  try {
    client = await pool.connect();
    // Read-only transaction: the audit cannot modify corpus state even by
    // accident, and the statement timeout bounds a stuck snapshot.
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const coverage = await collectCoverage(client);
    await client.query("COMMIT");
    process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), ...coverage }, null, 2)}\n`);
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
    await pool.end().catch(() => undefined);
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    error: {
      code: error?.code || "audit-failed",
      message: error?.message || "Corpus coverage audit failed",
    },
  }, null, 2)}\n`);
  process.exitCode = 1;
});
