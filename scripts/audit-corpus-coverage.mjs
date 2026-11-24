// Read-only corpus coverage audit. Prints one JSON object to stdout. Exit 1
// means the database connection or a query failed. With --compare-public the
// report also answers, per approved public sitemap, whether every advertised
// URL is in the database and carries body text; --fail-on-gap turns a missing
// URL, a missing body or an uncrawlable source into exit code 2.
import { pathToFileURL } from "node:url";
import pg from "pg";
import { sourceResourceKey } from "../server/source-identity.mjs";
import { sourcePolicyWitness } from "../server/source_policy.mjs";

const { Pool } = pg;
export const EXIT_COVERAGE_GAP = 2;
export const DEFAULT_STALE_AFTER_HOURS = 24;
export const DEFAULT_SAMPLE_LIMIT = 10;

export const DEFAULT_AUDIT_DEADLINE_MS = 120_000;
const STATEMENT_TIMEOUT_MS = 15_000;

function deadlineError() {
  const error = new Error("Corpus coverage audit deadline exceeded");
  error.code = "AUDIT_DEADLINE_EXCEEDED";
  return error;
}

function createAuditDeadline(deadlineMs = DEFAULT_AUDIT_DEADLINE_MS) {
  const duration = Number.isFinite(deadlineMs) && deadlineMs > 0
    ? Math.max(1, Math.min(Math.trunc(deadlineMs), 2_147_483_647))
    : DEFAULT_AUDIT_DEADLINE_MS;
  const expiresAt = performance.now() + duration;
  const remainingMs = () => Math.max(0, expiresAt - performance.now());
  const check = () => {
    if (remainingMs() <= 0) throw deadlineError();
  };
  const run = async (operation) => {
    check();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(deadlineError()), remainingMs());
    });
    try {
      return await Promise.race([Promise.resolve().then(operation), timeout]);
    } finally {
      clearTimeout(timer);
    }
  };
  const query = (client, sql, params) => run(() => client.query(sql, params));
  return { remainingMs, run, query };
}

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

// ---------------------------------------------------------------------------
// Approved public sitemap comparison (--compare-public)
//
// The sitemap crawl is the authority for what each approved source currently
// advertises; the database is only asked whether it holds that URL. A row is
// attributed to a source for the databaseOnly count when it carries the source
// key the crawler writes and lives on the sitemap's own host, so a stale row is
// reported by the source that would have refreshed it.

const PORTAL_SOURCE = Object.freeze({
  id: "portal-sitemap",
  kind: "portal-sitemap",
  sitemapUrl: null,
  approvedEmptyUrls: false,
  sourceKeys: Object.freeze(["portal-sitemap", "portal-catalog", "official-page-hydration"]),
  hosts: Object.freeze(["keskkonnaportaal.ee", "www.keskkonnaportaal.ee"]),
});

const PRESENCE_SQL = `
  SELECT canonical_url,
         is_available,
         COALESCE(metadata->>'robots_noindex', 'false') = 'true' AS robots_noindex,
         metadata->'source_policy' AS source_policy,
         metadata->>'sourceResourceKey' AS source_resource_key,
         fetched_at,
         content_hash,
         metadata->'retained' AS retained,
         (content <> '') AS has_content,
         last_seen_at
  FROM practice_corpus_documents
  WHERE canonical_url = ANY($1::TEXT[])
`;

const DATABASE_ONLY_SQL = `
  WITH attributable AS (
    SELECT DISTINCT canonical_url
    FROM practice_corpus_documents
    WHERE source_key = ANY($1::TEXT[])
      AND ${HOST_EXPRESSION} = ANY($2::TEXT[])
  ), database_only AS (
    SELECT canonical_url
    FROM attributable
    WHERE canonical_url <> ALL($3::TEXT[])
  )
  SELECT
    COUNT(*)::BIGINT AS total,
    COALESCE(
      (SELECT jsonb_agg(sample.canonical_url ORDER BY sample.canonical_url)
       FROM (SELECT canonical_url FROM database_only ORDER BY canonical_url LIMIT $4) sample),
      '[]'::JSONB
    ) AS sample
  FROM database_only
`;

const PRESENCE_CHUNK = 2_000;
const ERROR_MESSAGE_LIMIT = 500;

// server/corpus_fetch.mjs reaches server/database.mjs, which validates
// SEARCH_HASH_SECRET for unrelated search persistence at import time. The
// database-only audit runs in environments that hold no search secret, so the
// crawler module is loaded on demand: only when --compare-public runs and the
// caller supplied no crawler. The approved source list comes from that same
// module, so there is still exactly one definition of it.
let publicCrawlerModule = null;

async function loadPublicCrawlers() {
  if (!publicCrawlerModule) publicCrawlerModule = await import("../server/corpus_fetch.mjs");
  return {
    crawlers: {
      crawlPortalSitemap: publicCrawlerModule.crawlPortalSitemap,
      crawlOfficialSitemap: publicCrawlerModule.crawlOfficialSitemap,
    },
    officialSources: publicCrawlerModule.OFFICIAL_SITEMAP_SOURCES,
  };
}

// Sitemap documents are canonical already; this only makes the stored form and
// the trailing-slash catalogue form comparable to a row in either shape.
function canonicalMatchKey(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return raw.replace(/\/+$/u, "");
  }
}

function presenceVariants(value) {
  const variants = new Set([value]);
  try {
    const url = new URL(value);
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
      variants.add(url.toString());
    } else if (!url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname}/`;
      variants.add(url.toString());
    }
  } catch {
    // Keep only the canonical form; an unparsable URL cannot match a row.
  }
  return [...variants];
}

function describeOfficialSource(source) {
  const url = new URL(String(source?.url || ""));
  const host = url.hostname.toLocaleLowerCase("en");
  const sourceKey = String(source?.sourceKey || "official-sitemap");
  const hosts = host.startsWith("www.") ? [host, host.slice(4)] : [host, `www.${host}`];
  return {
    id: `${sourceKey}:${host}`,
    kind: "official-sitemap",
    sourceKey,
    sitemapUrl: url.toString(),
    approvedEmptyUrls: source?.emptyUrlPolicy === "approved",
    sourceKeys: [sourceKey, "official-page-hydration"],
    hosts,
  };
}

function boundedErrorMessage(error) {
  const message = typeof error?.message === "string" ? error.message : String(error);
  return message.slice(0, ERROR_MESSAGE_LIMIT);
}

function boundedSample(values, limit) {
  return [...new Set(values)].sort().slice(0, limit);
}

function emptySamples() {
  return {
    missingFromDatabase: [],
    missingContent: [],
    policyExcludedContent: [],
    staleLastSeen: [],
    databaseOnly: [],
  };
}

// The crawl runs before the read-only transaction opens: a slow publisher must
// not hold a snapshot, and a publisher that fails is one reported source, never
// a failed audit.
//
// Only the deduplicated URL strings are kept. A full official sitemap may carry
// tens of thousands of normalized documents, and the audit has no use for their
// titles or metadata once the URL set is known.
export async function crawlPublicSources({ crawlers, officialSources, deadline } = {}) {
  if (!crawlers || !officialSources) {
    throw new Error("crawlPublicSources requires crawlers and the approved official source list");
  }
  const budget = deadline ?? createAuditDeadline();
  const descriptors = [PORTAL_SOURCE, ...officialSources.map(describeOfficialSource)];
  const crawled = [];
  for (const descriptor of descriptors) {
    let urls = [];
    let pages = null;
    let error = null;
    try {
      const result = await budget.run(() => (
        descriptor.kind === "portal-sitemap"
          ? crawlers.crawlPortalSitemap()
          : crawlers.crawlOfficialSitemap({
              url: descriptor.sitemapUrl,
              sourceKey: descriptor.sourceKey,
            })
      ));
      if (!result || !Array.isArray(result.documents)) {
        throw new Error("sitemap crawler returned no documents");
      }
      const seen = new Map();
      for (const document of result.documents) {
        const raw = typeof document?.url === "string" ? document.url.trim() : "";
        if (!raw) continue;
        const key = canonicalMatchKey(raw);
        if (key && !seen.has(key)) seen.set(key, raw);
      }
      urls = [...seen.values()];
      pages = Number.isFinite(result.pages) ? result.pages : null;
      if (!urls.length && descriptor.approvedEmptyUrls !== true) {
        error = "Sitemap crawl succeeded but discovered no URLs";
      }
    } catch (caught) {
      error = boundedErrorMessage(caught);
    }
    crawled.push({ descriptor, urls, pages, error });
  }
  return crawled;
}

async function loadPresentDocuments(client, urls) {
  const present = new Map();
  const variants = new Set();
  for (const url of urls) {
    for (const variant of presenceVariants(url)) variants.add(variant);
  }
  const list = [...variants];
  for (let offset = 0; offset < list.length; offset += PRESENCE_CHUNK) {
    const result = await client.query(PRESENCE_SQL, [list.slice(offset, offset + PRESENCE_CHUNK)]);
    for (const row of result.rows) {
      const key = canonicalMatchKey(row.canonical_url);
      if (key && !present.has(key)) present.set(key, row);
    }
  }
  return present;
}

function isStale(lastSeenAt, cutoff) {
  const observed = lastSeenAt instanceof Date ? lastSeenAt.getTime() : Date.parse(String(lastSeenAt ?? ""));
  return !Number.isFinite(observed) || observed < cutoff;
}

// Availability records whether the corpus still lists a row, not whether the
// publisher forbids a body. A policy exemption must belong to this exact row:
// the same resource and the same observed fetch. Noarchive also needs the row's
// explicit marker that no body was retained. A retired advertised row remains a
// separate gap even when its old body is still present.
function policyBoundToRow(policy, row) {
  const resource = sourceResourceKey(row.canonical_url);
  if (!resource || row.source_resource_key !== resource || policy.resourceKey !== resource) return false;
  const fetchedAt = row.fetched_at instanceof Date ? row.fetched_at : new Date(row.fetched_at);
  return Number.isFinite(fetchedAt.getTime()) && fetchedAt.toISOString() === policy.observedAt;
}

function bodyForbiddenByPolicy(row) {
  if (row.robots_noindex === true) return true;
  const policy = sourcePolicyWitness(row.source_policy);
  if (!policy || !policyBoundToRow(policy, row)) return false;
  return policy.directives.noindex
    || (policy.directives.noarchive && row.retained === false && !policy.use.retainBody)
    || policy.robots.status === "disallowed";
}

async function compareCrawledSource({ client, entry, cutoff, limit }) {
  const { descriptor } = entry;
  const report = {
    id: descriptor.id,
    kind: descriptor.kind,
    sitemapUrl: descriptor.sitemapUrl ?? null,
    sourceKeys: [...descriptor.sourceKeys],
    hosts: [...descriptor.hosts],
    pages: Number.isFinite(entry.pages) ? entry.pages : null,
    discovered: 0,
    present: 0,
    missingFromDatabase: 0,
    missingContent: 0,
    policyExcludedContent: 0,
    staleLastSeen: 0,
    databaseOnly: 0,
    errors: [],
    samples: emptySamples(),
  };
  // A source that did not answer proves nothing about its rows, so its
  // databaseOnly figure stays zero instead of listing every stored URL.
  if (entry.error) return { ...report, errors: [entry.error] };

  const urls = new Map();
  for (const raw of entry.urls) {
    const key = canonicalMatchKey(raw);
    if (key && !urls.has(key)) urls.set(key, raw);
  }
  report.discovered = urls.size;

  const present = await loadPresentDocuments(client, [...urls.values()]);
  const missing = [];
  const withoutContent = [];
  const policyExcluded = [];
  const stale = [];
  for (const [key, url] of urls) {
    const row = present.get(key);
    if (!row) {
      missing.push(url);
      continue;
    }
    report.present += 1;
    const policyExcludedBody = !row.has_content && bodyForbiddenByPolicy(row);
    if (policyExcludedBody) policyExcluded.push(url);
    if ((!row.has_content && !policyExcludedBody) || row.is_available === false) withoutContent.push(url);
    if (isStale(row.last_seen_at, cutoff)) stale.push(url);
  }
  report.missingFromDatabase = missing.length;
  report.missingContent = withoutContent.length;
  report.policyExcludedContent = policyExcluded.length;
  report.staleLastSeen = stale.length;

  const advertisedVariants = [...new Set([...urls.values()].flatMap(presenceVariants))];
  const attributable = await client.query(DATABASE_ONLY_SQL, [
    descriptor.sourceKeys,
    descriptor.hosts,
    advertisedVariants,
    limit,
  ]);
  const databaseOnly = attributable.rows[0] || {};
  report.databaseOnly = count(databaseOnly.total);
  report.samples = {
    missingFromDatabase: boundedSample(missing, limit),
    missingContent: boundedSample(withoutContent, limit),
    policyExcludedContent: boundedSample(policyExcluded, limit),
    staleLastSeen: boundedSample(stale, limit),
    databaseOnly: boundedSample(Array.isArray(databaseOnly.sample) ? databaseOnly.sample : [], limit),
  };
  return report;
}

export async function compareCrawledSources({
  client,
  crawled,
  now = new Date(),
  staleAfterHours = DEFAULT_STALE_AFTER_HOURS,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
} = {}) {
  const hours = Number.isFinite(staleAfterHours) && staleAfterHours > 0
    ? staleAfterHours
    : DEFAULT_STALE_AFTER_HOURS;
  const limit = Number.isFinite(sampleLimit) && sampleLimit > 0
    ? Math.trunc(sampleLimit)
    : DEFAULT_SAMPLE_LIMIT;
  const cutoff = now.getTime() - hours * 3_600_000;

  const sources = [];
  for (const entry of crawled) {
    sources.push(await compareCrawledSource({ client, entry, cutoff, limit }));
  }

  const totals = {
    sources: sources.length,
    sourcesWithErrors: 0,
    discovered: 0,
    present: 0,
    missingFromDatabase: 0,
    missingContent: 0,
    policyExcludedContent: 0,
    staleLastSeen: 0,
    databaseOnly: 0,
  };
  for (const source of sources) {
    if (source.errors.length) totals.sourcesWithErrors += 1;
    for (const field of [
      "discovered", "present", "missingFromDatabase", "missingContent",
      "policyExcludedContent", "staleLastSeen", "databaseOnly",
    ]) {
      totals[field] += source[field];
    }
  }
  const gap = {
    missingFromDatabase: totals.missingFromDatabase,
    missingContent: totals.missingContent,
    sourcesWithErrors: totals.sourcesWithErrors,
    // A stale last_seen_at is reported but never gated: an idle ingestion week
    // is not proof that a URL vanished. A validated publisher policy can exempt
    // an empty body, but a row the corpus retired still contradicts a sitemap
    // that advertises it. Missing rows, real body gaps and an uncrawlable source
    // are the proof obligations this audit gates.
    exceeded: totals.missingFromDatabase > 0 || totals.missingContent > 0 || totals.sourcesWithErrors > 0,
  };

  return { staleAfterHours: hours, sampleLimit: limit, totals, gap, sources };
}

export function parseAuditArgs(argv = []) {
  const options = { comparePublic: false, failOnGap: false, staleAfterHours: DEFAULT_STALE_AFTER_HOURS };
  const args = Array.isArray(argv) ? argv : [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = String(args[index]);
    if (argument === "--compare-public") {
      options.comparePublic = true;
      continue;
    }
    if (argument === "--fail-on-gap") {
      options.failOnGap = true;
      continue;
    }
    let value = null;
    if (argument === "--stale-hours") {
      value = args[index + 1];
      index += 1;
    } else if (argument.startsWith("--stale-hours=")) {
      value = argument.slice("--stale-hours=".length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const hours = Number(value);
    if (!Number.isInteger(hours) || hours < 1 || hours > 8_760) {
      throw new Error("--stale-hours must be an integer between 1 and 8760");
    }
    options.staleAfterHours = hours;
  }
  if (options.failOnGap && !options.comparePublic) {
    throw new Error("--fail-on-gap requires --compare-public");
  }
  return options;
}

export async function runDatabaseAudit({
  client,
  argv = [],
  now = new Date(),
  crawlers,
  officialSources,
  deadlineMs = DEFAULT_AUDIT_DEADLINE_MS,
} = {}) {
  const options = parseAuditArgs(argv);
  const deadline = createAuditDeadline(deadlineMs);
  const boundedClient = {
    query: (sql, params) => deadline.query(client, sql, params),
  };
  let crawled = null;
  if (options.comparePublic) {
    // Injection keeps tests and side-by-side tooling offline; otherwise the
    // crawler module is imported here, after the flags said compare mode needs
    // it, never for a database-only run.
    const loaded = (!crawlers || !officialSources) ? await deadline.run(loadPublicCrawlers) : null;
    crawled = await crawlPublicSources({
      crawlers: crawlers ?? loaded.crawlers,
      officialSources: officialSources ?? loaded.officialSources,
      deadline,
    });
  }

  // Read-only transaction: the audit cannot modify corpus state even by
  // accident. The statement timeout bounds one stuck query, while the shared
  // deadline bounds the whole crawl and every query together.
  try {
    await boundedClient.query("BEGIN TRANSACTION READ ONLY");
    const statementTimeoutMs = Math.max(1, Math.min(STATEMENT_TIMEOUT_MS, Math.ceil(deadline.remainingMs())));
    await boundedClient.query(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
    const report = await collectCoverage(boundedClient);
    if (crawled) {
      report.publicSitemapCoverage = await compareCrawledSources({
        client: boundedClient,
        crawled,
        now,
        staleAfterHours: options.staleAfterHours,
      });
    }
    await boundedClient.query("COMMIT");
    const gapExceeded = Boolean(report.publicSitemapCoverage?.gap?.exceeded);
    return { report, exitCode: options.failOnGap && gapExceeded ? EXIT_COVERAGE_GAP : 0 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function main(argv = process.argv.slice(2)) {
  // Validate the flags before opening a connection.
  parseAuditArgs(argv);
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
    const { report, exitCode } = await runDatabaseAudit({ client, argv });
    process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2)}\n`);
    process.exitCode = exitCode;
  } finally {
    // runDatabaseAudit owns COMMIT and ROLLBACK; a failure before BEGIN leaves
    // nothing to unwind here.
    client?.release();
    await pool.end().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      error: {
        code: error?.code || "audit-failed",
        message: error?.message || "Corpus coverage audit failed",
      },
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
