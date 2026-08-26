import { createHmac } from "node:crypto";
import pg from "pg";
import { canonicalizePublicSearchQuery } from "./search.mjs";

const { Pool } = pg;
const databaseUrl = String(process.env.DATABASE_URL || "");
const searchHashSecret = String(process.env.SEARCH_HASH_SECRET || "");
export const SEARCH_HASH_VERSION = "hmac-sha256-v3";
export const SEARCH_CACHE_RESPONSE_SCHEMA = "privacy-safe-v6";
export const SEARCH_CACHE_MAX_RESPONSE_BYTES = 128 * 1_024;
function boundedPersistenceInteger(value, fallback, minimum, maximum) {
  return Math.max(minimum, Math.min(Math.trunc(Number(value) || fallback), maximum));
}

export const SEARCH_CACHE_MAX_ROWS = boundedPersistenceInteger(
  process.env.SEARCH_CACHE_MAX_ROWS,
  5_000,
  100,
  10_000,
);
export const SEARCH_RUN_MAX_ROWS = boundedPersistenceInteger(
  process.env.SEARCH_RUN_MAX_ROWS,
  50_000,
  1_000,
  100_000,
);
export const SEARCH_RETENTION_BATCH_SIZE = boundedPersistenceInteger(
  process.env.SEARCH_RETENTION_BATCH_SIZE,
  250,
  10,
  500,
);
// A database-scoped transaction lock keeps hard row ceilings atomic across
// replicas. Persistence is optional, so contention fails closed without
// delaying the public answer or consuming every pool connection.
export const SEARCH_PERSISTENCE_ADVISORY_LOCK = 1_838_461_027;
let pool;
let schemaPromise;
let searchDataMaintenancePromise;

export function assertSafeDatabaseUrl(value) {
  if (!value) return true;
  let name = "";
  try {
    const parsed = new URL(value);
    name = decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).toLocaleLowerCase("et");
    const conflictingConnectionKeys = [
      "ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslpassword",
      "sslnegotiation", "uselibpqcompat",
      // node-postgres permits query parameters to override URL authority
      // fields. Reject those aliases so TLS locality and credential-
      // independence checks inspect the same endpoint and password Pool uses.
      "host", "hostaddr", "port", "user", "username", "password", "dbname", "database",
    ];
    if (conflictingConnectionKeys.some((key) => parsed.searchParams.has(key))) {
      throw new Error("DATABASE_URL must not override explicit connection or TLS fields");
    }
  } catch {
    throw new Error("DATABASE_URL is not valid or overrides explicit connection or TLS policy");
  }
  if (!name || name.includes("chatwoot")) {
    throw new Error("Practice search requires a dedicated non-Chatwoot PostgreSQL database");
  }
  return true;
}

assertSafeDatabaseUrl(databaseUrl);

export function assertSearchHashSecret({ databaseUrl: url = databaseUrl, secret = searchHashSecret } = {}) {
  if (!url) return true;
  const value = String(secret || "");
  if (/^(?:change[-_ ]?me|replace[-_ ]?me|example|password|secret|development|test)+$/iu.test(value)) {
    throw new Error("SEARCH_HASH_SECRET must not use a documented or predictable placeholder");
  }
  let databasePassword = "";
  try {
    databasePassword = decodeURIComponent(new URL(url).password || "");
  } catch {
    // assertSafeDatabaseUrl owns URL validation; retain a fail-closed comparison here.
  }
  if (value === String(url) || (databasePassword && value === databasePassword)) {
    throw new Error("SEARCH_HASH_SECRET must be independent from database credentials");
  }
  const standardCandidate = /^[A-Za-z0-9+/]+={0,2}$/u.test(value) && value.length % 4 === 0;
  const urlCandidate = /^[A-Za-z0-9_-]+$/u.test(value);
  let decoded = Buffer.alloc(0);
  let canonicalEncoding = false;
  if (standardCandidate) {
    decoded = Buffer.from(value, "base64");
    canonicalEncoding = decoded.toString("base64") === value;
  }
  if (!canonicalEncoding && urlCandidate) {
    decoded = Buffer.from(value, "base64url");
    canonicalEncoding = decoded.toString("base64url") === value;
  }
  if (!canonicalEncoding || decoded.length < 32) {
    throw new Error("SEARCH_HASH_SECRET must be canonical Base64/Base64URL for at least 32 random bytes");
  }
  const byteCounts = new Map();
  for (const byte of decoded) byteCounts.set(byte, (byteCounts.get(byte) || 0) + 1);
  const maximumFrequency = Math.max(...byteCounts.values());
  const empiricalEntropy = [...byteCounts.values()].reduce((total, count) => {
    const probability = count / decoded.length;
    return total - probability * Math.log2(probability);
  }, 0);
  const minimumDistinctBytes = Math.min(24, Math.ceil(decoded.length * 0.75));
  const repeatsShortPeriod = Array.from(
    { length: Math.min(16, Math.floor(decoded.length / 2)) },
    (_value, index) => index + 1,
  ).some((period) => decoded.length % period === 0
    && decoded.every((byte, index) => byte === decoded[index % period]));
  if (byteCounts.size < minimumDistinctBytes || empiricalEntropy < 4.5
    || maximumFrequency > Math.ceil(decoded.length / 4) || repeatsShortPeriod) {
    throw new Error("SEARCH_HASH_SECRET must contain high-diversity cryptographic random bytes");
  }
  return true;
}

export function resolveDatabaseTls({
  mode = process.env.DATABASE_SSL_MODE ?? process.env.DATABASE_SSL,
  ca = process.env.DATABASE_SSL_CA,
  url = databaseUrl,
  plaintextHosts = process.env.DATABASE_PLAINTEXT_HOSTS,
} = {}) {
  const selected = String(mode || "").trim().toLocaleLowerCase("en");
  if (!selected) throw new Error("DATABASE_SSL_MODE must be explicitly set to disable or verify-full");
  if (["disable", "disabled", "false", "off"].includes(selected)) {
    let hostname = "";
    try {
      hostname = new URL(String(url || "")).hostname.replace(/^\[|\]$/gu, "").toLocaleLowerCase("en");
    } catch {
      throw new Error("DATABASE_SSL_MODE=disable requires a recognized local database URL");
    }
    const configuredHosts = String(plaintextHosts || "")
      .split(",")
      .map((value) => value.trim().toLocaleLowerCase("en"))
      .filter(Boolean);
    if (configuredHosts.some((value) => {
      const labels = value.split(".");
      return value.length > 253
        || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label));
    })) {
      throw new Error("DATABASE_PLAINTEXT_HOSTS must contain exact canonical hostnames without ports or wildcards");
    }
    const allowedPlaintextHosts = new Set([
      "postgres", "localhost", "127.0.0.1", "::1", ...configuredHosts,
    ]);
    if (!allowedPlaintextHosts.has(hostname)) {
      throw new Error("DATABASE_SSL_MODE=disable is allowed only for an explicit local database host");
    }
    return undefined;
  }
  if (!["verify-full", "true"].includes(selected)) {
    throw new Error("DATABASE_SSL_MODE must be disable or verify-full");
  }
  const trustedCa = String(ca || "").trim();
  return {
    rejectUnauthorized: true,
    ...(trustedCa ? { ca: trustedCa } : {}),
  };
}

const databaseTlsConfiguration = databaseUrl ? resolveDatabaseTls({ url: databaseUrl }) : undefined;
assertSearchHashSecret({ databaseUrl, secret: searchHashSecret });
const DATABASE_QUERY_TIMEOUT_MS = Math.max(
  500,
  Math.min(Number(process.env.DATABASE_QUERY_TIMEOUT_MS) || 4_000, 10_000),
);

export function queryFingerprint(query, revision = "legacy", secret = searchHashSecret) {
  if (!secret) throw new Error("SEARCH_HASH_SECRET is required when search data is persisted");
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok) throw new Error("Search query must pass the canonical public-query boundary");
  return createHmac("sha256", String(secret))
    .update(String(revision))
    .update("\0")
    .update(canonicalInput.query.toLocaleLowerCase("et"))
    .digest("hex");
}

function boundedText(value, maximum) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, maximum) : "";
}

function boundedCitations(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((citation) => (
        typeof citation === "number" && Number.isInteger(citation) && citation > 0 && citation <= 20
      )))].slice(0, 10)
    : [];
}

function canonicalPrivateText(value) {
  return boundedText(value, 20_000)
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .toLocaleLowerCase("et");
}

function decodeHtmlPrivateText(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
  return String(value).replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|apos|gt|lt|quot));/giu, (match, decimal, hexadecimal, name) => {
    const codePoint = decimal ? Number(decimal) : hexadecimal ? Number.parseInt(hexadecimal, 16) : null;
    if (Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    return named[String(name || "").toLocaleLowerCase("en")] || match;
  });
}

function decodeSlashPrivateText(value) {
  return String(value)
    .replace(/\\u\{([0-9a-f]{1,6})\}/giu, (match, hexadecimal) => {
      const codePoint = Number.parseInt(hexadecimal, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    })
    .replace(/\\u([0-9a-f]{4})/giu, (_match, hexadecimal) => String.fromCharCode(Number.parseInt(hexadecimal, 16)))
    .replace(/\\x([0-9a-f]{2})/giu, (_match, hexadecimal) => String.fromCharCode(Number.parseInt(hexadecimal, 16)))
    .replace(/\\(["'\\/])/gu, "$1");
}

function privateTextForms(value) {
  const initial = boundedText(value, 20_000);
  const forms = new Set(initial ? [initial] : []);
  let frontier = initial ? [initial] : [];
  const maximumForms = 48;
  const maximumRounds = 12;
  for (let depth = 0; depth < maximumRounds && frontier.length; depth += 1) {
    const next = [];
    for (const candidate of frontier) {
      const decoded = [decodeHtmlPrivateText(candidate), decodeSlashPrivateText(candidate)];
      try {
        decoded.push(decodeURIComponent(candidate.replace(/\+/gu, " ")));
      } catch {
        // Invalid percent encoding stays in its original, bounded form.
      }
      for (const transformed of decoded) {
        const bounded = boundedText(transformed, 20_000);
        if (bounded && !forms.has(bounded)) {
          if (forms.size >= maximumForms) return { converged: false, forms: [] };
          forms.add(bounded);
          next.push(bounded);
        }
      }
    }
    frontier = next;
  }
  if (frontier.length) return { converged: false, forms: [] };
  return {
    converged: true,
    forms: [...forms].map(canonicalPrivateText).filter(Boolean),
  };
}

function retainedStrings(value, seen = new Set()) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.flatMap((child) => retainedStrings(child, seen));
}

function containsPrivacySensitiveQuerySegment(value) {
  const text = boundedText(value, 180);
  if (!text) return false;
  if (/\b[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}.-]{1,253}\.[\p{L}]{2,63}\b/iu.test(text)) return true;
  if (/\b[1-8]\d{10}\b/u.test(text)) return true;
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu.test(text)) return true;
  if (/\b\d{5}:\d{3}:\d{4}\b/u.test(text)) return true;
  const phoneLike = text.match(/(?:\+?\d[\d ().-]{5,}\d)/gu) || [];
  if (phoneLike.some((candidate) => {
    const compact = candidate.trim();
    const digits = candidate.replace(/\D/gu, "");
    if (compact.startsWith("+")) return digits.length >= 8 && digits.length <= 15;
    if (/^372\d{7,8}$/u.test(digits)) return true;
    if (/^\d{7,8}$/u.test(compact)) return true;
    return digits.length >= 7 && digits.length <= 8 && /[ ()]/u.test(compact);
  })) return true;
  return (text.match(/[\p{L}\p{N}_-]{16,}/gu) || [])
    .some((token) => /\p{L}/u.test(token) && /\p{N}/u.test(token));
}

const PRIVATE_QUERY_GRAMMAR_WORDS = new Set([
  "aga", "anna", "kas", "kes", "kui", "kuidas", "kuhu", "kus", "kust", "millal", "miks", "mille",
  "mis", "mulle", "ning", "näita", "oli", "oleks", "otsin", "palun", "saab", "selle", "tahan", "tuleb",
  "või",
]);

function privateMaterialTokens(value) {
  return (String(value || "").normalize("NFKC").toLocaleLowerCase("et").match(/[\p{L}][\p{L}\p{N}_-]{1,}/gu) || [])
    .filter((token) => token.length >= 3 && !PRIVATE_QUERY_GRAMMAR_WORDS.has(token));
}

function privateTokensMayShareInflection(left, right) {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5) return false;
  // Privacy filtering is deliberately more conservative than relevance
  // stemming: a four-letter shared start catches ordinary Estonian case
  // variation while a false positive merely skips a cache write.
  return left.slice(0, 4) === right.slice(0, 4);
}

function retainedQueryFragment(safe, queryForms) {
  const queryTokens = [...new Set(queryForms.flatMap(privateMaterialTokens))];
  if (!queryTokens.length) return false;
  for (const retainedValue of retainedStrings(safe)) {
    const retained = privateTextForms(retainedValue);
    if (!retained.converged) return true;
    const retainedTokens = [...new Set(retained.forms.flatMap(privateMaterialTokens))];
    if (queryTokens.some((queryToken) => retainedTokens.some((token) => (
      privateTokensMayShareInflection(queryToken, token)
    )))) return true;
  }
  return false;
}

export function isPersistentResponseCacheProvider(value) {
  // Provider-generated prose is never written to the shared PostgreSQL cache.
  // The cache remains available only for deterministic, controlled response
  // templates and official source records.
  return String(value || "") === "deterministic-current-evidence";
}

export function sanitizeCachedResponse(response, query) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const queryValue = query ?? response.query;
  const queryWasProvided = queryValue !== undefined && queryValue !== null;
  const canonicalInput = queryWasProvided ? canonicalizePublicSearchQuery(queryValue) : null;
  if (canonicalInput && !canonicalInput.ok) return null;
  const rawQuery = canonicalInput?.query || "";
  const existingEnvelope = response.cacheSchema === SEARCH_CACHE_RESPONSE_SCHEMA;
  if (!rawQuery && !existingEnvelope) return null;
  // Model prose can repeat only one private fragment rather than the entire
  // question. Queries containing identifiers that are unsafe to persist are
  // therefore never response-cached; the HMAC-only technical run record may
  // still be written by the surrounding transaction.
  if (rawQuery && containsPrivacySensitiveQuerySegment(rawQuery)) return null;

  const rawAnswer = response.answer && typeof response.answer === "object" && !Array.isArray(response.answer)
    ? response.answer
    : {};
  const rawTitle = boundedText(rawAnswer.title, 180);
  const titleMode = rawAnswer.titleMode === "query"
    || (rawQuery && canonicalPrivateText(rawTitle) === canonicalPrivateText(rawQuery))
    ? "query"
    : "fixed";
  if (titleMode === "fixed" && !rawTitle) return null;

  const safe = {
    cacheSchema: SEARCH_CACHE_RESPONSE_SCHEMA,
    total: Math.max(0, Math.min(Number(response.total) || 0, 1_000_000)),
    generatedAt: boundedText(response.generatedAt, 40),
    answer: {
      eyebrow: boundedText(rawAnswer.eyebrow, 120),
      titleMode,
      ...(titleMode === "fixed" ? { title: rawTitle } : {}),
      intro: boundedText(rawAnswer.intro, 4_000),
      introCitations: boundedCitations(rawAnswer.introCitations),
      parts: (Array.isArray(rawAnswer.parts) ? rawAnswer.parts : []).slice(0, 6).map((part) => ({
        title: boundedText(part?.title, 180),
        text: boundedText(part?.text, 4_000),
        citations: boundedCitations(part?.citations),
      })).filter((part) => part.title && part.text),
      note: boundedText(rawAnswer.note, 1_000),
    },
    sources: (Array.isArray(response.sources) ? response.sources : []).slice(0, 10).map((source) => ({
      id: boundedText(source?.id, 180),
      citation: typeof source?.citation === "number"
        && Number.isInteger(source.citation)
        && source.citation > 0
        && source.citation <= 20
        ? source.citation
        : 0,
      title: boundedText(source?.title, 500),
      organization: boundedText(source?.organization, 240),
      type: boundedText(source?.type, 160),
      published: boundedText(source?.published, 80),
      url: boundedText(source?.url, 2_000),
      summary: boundedText(source?.summary, 2_000),
      evidenceExcerpt: boundedText(source?.evidenceExcerpt, 4_000),
      locator: boundedText(source?.locator, 1_000),
      ...(source?.actionUrl ? { actionUrl: boundedText(source.actionUrl, 2_000) } : {}),
      ...(source?.actionLabel ? { actionLabel: boundedText(source.actionLabel, 180) } : {}),
      tags: (Array.isArray(source?.tags) ? source.tags : []).map((tag) => boundedText(tag, 120)).filter(Boolean).slice(0, 5),
      sourceTier: boundedText(source?.sourceTier, 40),
      // A cache hit must cross the same current evidence-policy boundary as a
      // fresh response. Retain only the bounded provenance fields that the
      // validator needs; publicResponse's allowlist never exposes them.
      evidencePolicy: ["claim-specific", "route-only", "timestamped", "versioned"]
        .includes(source?.evidencePolicy) ? source.evidencePolicy : "invalid",
      ...([true, false].includes(source?._answerEvidenceEligible)
        ? { _answerEvidenceEligible: source._answerEvidenceEligible }
        : {}),
      retrieval: boundedText(source?.retrieval, 120),
      delivery: boundedText(source?.delivery, 120),
      ...(source?.freshness && typeof source.freshness === "object" && !Array.isArray(source.freshness)
        ? {
            freshness: {
              class: boundedText(source.freshness.class, 80),
              basis: boundedText(source.freshness.basis, 80),
              maxAgeMs: Number.isFinite(Number(source.freshness.maxAgeMs))
                && Number(source.freshness.maxAgeMs) > 0
                && Number(source.freshness.maxAgeMs) <= 10 * 366 * 24 * 60 * 60 * 1_000
                ? Number(source.freshness.maxAgeMs)
                : 0,
              requiresSourceTimestamp: source.freshness.requiresSourceTimestamp === true,
            },
          }
        : {}),
      _evidenceObservedAt: boundedText(source?._evidenceObservedAt, 40),
      _evidenceValidFrom: boundedText(source?._evidenceValidFrom, 40),
      _evidenceValidUntil: boundedText(source?._evidenceValidUntil, 40),
      _evidenceVersion: boundedText(source?._evidenceVersion, 120),
      _evidenceStatusAt: boundedText(source?._evidenceStatusAt, 40),
      _publishedAt: boundedText(source?._publishedAt, 40),
    })).filter((source) => source.id && source.title && source.url && source.citation > 0),
    related: (Array.isArray(response.related) ? response.related : []).map((item) => boundedText(item, 180)).filter(Boolean).slice(0, 6),
    clarification: response.clarification === null ? null : boundedText(response.clarification, 700),
  };

  if (Buffer.byteLength(JSON.stringify(safe), "utf8") > SEARCH_CACHE_MAX_RESPONSE_BYTES) return null;
  if (rawQuery) {
    const queryForms = privateTextForms(rawQuery);
    if (!queryForms.converged) return null;
    const privateNeedles = queryForms.forms;
    const retainsPrivateQuery = retainedStrings(safe).some((value) => {
      const retained = privateTextForms(value);
      if (!retained.converged) return true;
      return retained.forms.some((form) => privateNeedles.some((needle) => form.includes(needle)));
    });
    if (retainsPrivateQuery) return null;
    if (retainedQueryFragment(safe, queryForms.forms)) return null;
  }
  return safe;
}

export function restoreCachedResponse(response, query) {
  const cached = sanitizeCachedResponse(response);
  if (!cached) return null;
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok) return null;
  const cleanQuery = canonicalInput.query;
  const { cacheSchema: _cacheSchema, ...publicCached } = cached;
  const { titleMode, ...cachedAnswer } = publicCached.answer;
  const title = titleMode === "query"
    ? `${cleanQuery.charAt(0).toLocaleUpperCase("et")}${cleanQuery.slice(1)}`
    : cachedAnswer.title;
  return { ...publicCached, query: cleanQuery, answer: { ...cachedAnswer, title } };
}

export const SEARCH_CACHE_READ_SQL = `
  SELECT response
  FROM practice_search_cache
  WHERE query_hash = $1
    AND key_version = 'hmac-sha256-v3'
    AND response_schema = 'privacy-safe-v6'
    AND expires_at > NOW()
`;

export const SEARCH_DATA_PURGE_SQL = `
  WITH expired_cache_victims AS (
    SELECT query_hash
    FROM practice_search_cache
    WHERE expires_at <= NOW()
      OR key_version <> 'hmac-sha256-v3'
      OR response_schema <> 'privacy-safe-v6'
    ORDER BY expires_at ASC, query_hash ASC
    LIMIT $1
    FOR UPDATE
  ), deleted_cache AS (
    DELETE FROM practice_search_cache AS cache
    USING expired_cache_victims AS victims
    WHERE cache.query_hash = victims.query_hash
    RETURNING 1
  ), expired_run_victims AS (
    SELECT id
    FROM practice_search_runs
    WHERE created_at < NOW() - INTERVAL '30 days'
      OR COALESCE(provenance->>'hashVersion', '') <> 'hmac-sha256-v3'
    ORDER BY created_at ASC, id ASC
    LIMIT $1
    FOR UPDATE
  ), deleted_runs AS (
    DELETE FROM practice_search_runs AS runs
    USING expired_run_victims AS victims
    WHERE runs.id = victims.id
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*)::INTEGER FROM deleted_cache) AS deleted_cache,
    (SELECT COUNT(*)::INTEGER FROM deleted_runs) AS deleted_runs
`;

export const SEARCH_CACHE_CAPACITY_SQL = `
  SELECT query_hash AS victim
  FROM practice_search_cache
  ORDER BY created_at DESC, query_hash DESC
  LIMIT $2 OFFSET $1
  FOR UPDATE
`;

export const SEARCH_RUN_CAPACITY_SQL = `
  SELECT id AS victim
  FROM practice_search_runs
  ORDER BY created_at DESC, id DESC
  LIMIT $2 OFFSET $1
  FOR UPDATE
`;

async function acquireSearchPersistenceLock(client) {
  const result = await client.query(
    "SELECT pg_try_advisory_xact_lock($1::integer) AS acquired",
    [SEARCH_PERSISTENCE_ADVISORY_LOCK],
  );
  // Lightweight test clients may omit the synthetic lock row. Production
  // PostgreSQL always returns it; only an explicit false means contention.
  return result.rows?.[0]?.acquired !== false;
}

async function deleteVictims(client, kind, victims) {
  if (!victims.length) return 0;
  const result = kind === "cache"
    ? await client.query(
      "DELETE FROM practice_search_cache WHERE query_hash = ANY($1::text[])",
      [victims.map(String)],
    )
    : await client.query(
      "DELETE FROM practice_search_runs WHERE id = ANY($1::bigint[])",
      [victims.map((value) => String(value))],
    );
  return Number(result.rowCount ?? victims.length);
}

async function trimSearchPersistenceCapacity(client, kind, { upcomingRows = 0 } = {}) {
  const maximumRows = kind === "cache" ? SEARCH_CACHE_MAX_ROWS : SEARCH_RUN_MAX_ROWS;
  const offset = Math.max(0, maximumRows - Math.max(0, Math.trunc(upcomingRows)));
  const result = await client.query(
    kind === "cache" ? SEARCH_CACHE_CAPACITY_SQL : SEARCH_RUN_CAPACITY_SQL,
    [offset, SEARCH_RETENTION_BATCH_SIZE + 1],
  );
  const candidates = (result.rows || []).map((row) => row.victim).filter((value) => value !== undefined);
  const victims = candidates.slice(0, SEARCH_RETENTION_BATCH_SIZE);
  const deleted = await deleteVictims(client, kind, victims);
  return {
    deleted,
    // The extra sentinel row proves that bounded cleanup could not yet make
    // room. Skip optional persistence until a later maintenance pass.
    canInsert: candidates.length <= SEARCH_RETENTION_BATCH_SIZE,
  };
}

async function purgeExpiredSearchDataBatch(client) {
  const result = await client.query(SEARCH_DATA_PURGE_SQL, [SEARCH_RETENTION_BATCH_SIZE]);
  return {
    deletedCache: Number(result.rows?.[0]?.deleted_cache || 0),
    deletedRuns: Number(result.rows?.[0]?.deleted_runs || 0),
  };
}

function getPool() {
  if (!databaseUrl) return null;
  if (!pool) {
    const poolMax = Math.max(4, Math.min(Number(process.env.DATABASE_POOL_MAX) || 12, 20));
    pool = new Pool({
      connectionString: databaseUrl,
      max: poolMax,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 20_000,
      query_timeout: DATABASE_QUERY_TIMEOUT_MS,
      statement_timeout: DATABASE_QUERY_TIMEOUT_MS,
      ssl: databaseTlsConfiguration,
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
      SELECT pg_advisory_xact_lock(1838461028);
      CREATE TABLE IF NOT EXISTS practice_search_cache (
        query_hash TEXT PRIMARY KEY,
        response JSONB NOT NULL,
        key_version TEXT NOT NULL DEFAULT 'hmac-sha256-v3',
        response_schema TEXT NOT NULL DEFAULT 'privacy-safe-v6',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS practice_search_runs (
        id BIGSERIAL PRIMARY KEY,
        query_hash TEXT NOT NULL,
        answer_provider TEXT NOT NULL,
        source_count INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        provenance JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS practice_search_runs_created_at_idx
        ON practice_search_runs (created_at DESC);
      CREATE INDEX IF NOT EXISTS practice_search_cache_expires_at_hash_idx
        ON practice_search_cache (expires_at ASC, query_hash ASC);
      CREATE INDEX IF NOT EXISTS practice_search_cache_created_at_hash_idx
        ON practice_search_cache (created_at ASC, query_hash ASC);
      CREATE INDEX IF NOT EXISTS practice_search_runs_created_at_id_idx
        ON practice_search_runs (created_at ASC, id ASC);
      ALTER TABLE practice_search_cache
        ADD COLUMN IF NOT EXISTS key_version TEXT NOT NULL DEFAULT 'plain-sha256-v0';
      ALTER TABLE practice_search_cache
        ADD COLUMN IF NOT EXISTS response_schema TEXT NOT NULL DEFAULT 'legacy-v0';
      DO $privacy_migration$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'practice_search_cache'
            AND column_name = 'query_text'
        ) OR EXISTS (
          SELECT 1
          FROM practice_search_cache
          WHERE key_version <> 'hmac-sha256-v3'
             OR response_schema <> 'privacy-safe-v6'
             OR COALESCE(response->>'cacheSchema', '') <> 'privacy-safe-v6'
          LIMIT 1
        ) THEN
          -- The cache is optional. A metadata-level reset removes every legacy
          -- response before readiness without an unbounded row-by-row delete.
          TRUNCATE TABLE practice_search_cache;
        END IF;
      END
      $privacy_migration$;
      ALTER TABLE practice_search_cache
        DROP COLUMN IF EXISTS query_text;
      ALTER TABLE practice_search_runs
        DROP COLUMN IF EXISTS query_text;
      ALTER TABLE practice_search_cache
        ALTER COLUMN key_version SET DEFAULT 'hmac-sha256-v3';
      ALTER TABLE practice_search_cache
        ALTER COLUMN response_schema SET DEFAULT 'privacy-safe-v6';
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

export async function databaseQuery(text, parameters = [], options = {}) {
  const poolInstance = getPool();
  if (!poolInstance) return null;
  if (options?.ensureSearchSchema !== false) await ensureSchema();
  const signal = options?.signal;
  const deadlineAt = Number(options?.deadlineAt);
  const requestScoped = Boolean(signal) || Number.isFinite(deadlineAt);
  if (!requestScoped) return poolInstance.query(text, parameters);

  const throwIfClosed = () => {
    if (!signal?.aborted && (!Number.isFinite(deadlineAt) || Date.now() < deadlineAt)) return;
    throw signal?.reason instanceof Error
      ? signal.reason
      : new DOMException("The database query window closed", "AbortError");
  };
  const remainingTimeout = () => Number.isFinite(deadlineAt)
    ? Math.max(0, Math.min(DATABASE_QUERY_TIMEOUT_MS, deadlineAt - Date.now()))
    : DATABASE_QUERY_TIMEOUT_MS;

  throwIfClosed();
  const client = await poolInstance.connect();
  let transactionOpen = false;
  try {
    throwIfClosed();
    await client.query("BEGIN");
    transactionOpen = true;
    const statementTimeoutMs = remainingTimeout();
    if (statementTimeoutMs <= 0) throwIfClosed();
    await client.query("SELECT set_config('statement_timeout', $1, true)", [`${Math.ceil(statementTimeoutMs)}ms`]);
    throwIfClosed();
    const result = await client.query({
      text,
      values: parameters,
      // Let PostgreSQL's shorter statement timeout cancel server work first;
      // this client-side guard only bounds a broken transport afterward.
      query_timeout: Math.ceil(statementTimeoutMs) + 250,
    });
    throwIfClosed();
    await client.query("COMMIT");
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    throwIfClosed();
    throw error;
  } finally {
    client.release();
  }
}

export async function readSearchCache(query, revision) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok) return null;
  if (!getPool()) return null;
  try {
    await ensureSchema();
    const result = await pool.query(SEARCH_CACHE_READ_SQL, [queryFingerprint(canonicalInput.query, revision)]);
    return restoreCachedResponse(result.rows[0]?.response, canonicalInput.query);
  } catch {
    return null;
  }
}

export function purgeExpiredSearchData() {
  if (searchDataMaintenancePromise) return searchDataMaintenancePromise;
  searchDataMaintenancePromise = (async () => {
    const poolInstance = getPool();
    if (!poolInstance) return { status: "disabled", deletedCache: 0, deletedRuns: 0 };
    let client;
    let transactionOpen = false;
    try {
      await ensureSchema();
      client = await poolInstance.connect();
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query("SELECT set_config('statement_timeout', $1, TRUE)", ["3000ms"]);
      if (!await acquireSearchPersistenceLock(client)) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return { status: "limited", deletedCache: 0, deletedRuns: 0 };
      }
      const expired = await purgeExpiredSearchDataBatch(client);
      const cacheCapacity = await trimSearchPersistenceCapacity(client, "cache");
      const runCapacity = await trimSearchPersistenceCapacity(client, "run");
      await client.query("COMMIT");
      transactionOpen = false;
      return {
        status: "ready",
        deletedCache: expired.deletedCache + cacheCapacity.deleted,
        deletedRuns: expired.deletedRuns + runCapacity.deleted,
      };
    } catch {
      if (transactionOpen) await client?.query("ROLLBACK").catch(() => undefined);
      return { status: "degraded", deletedCache: 0, deletedRuns: 0 };
    } finally {
      client?.release();
    }
  })().finally(() => {
    searchDataMaintenancePromise = undefined;
  });
  return searchDataMaintenancePromise;
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
    if (!await acquireSearchPersistenceLock(client)) {
      await client.query("ROLLBACK");
      return { cacheStored: false, runStored: false, limited: true };
    }
    await purgeExpiredSearchDataBatch(client);
    requirePersistenceWindow({ signal, deadlineAt }, 100);
    let cacheStored = false;
    let runStored = false;
    let limited = false;
    if (cacheResponse && safeResponse && isPersistentResponseCacheProvider(answerProvider)) {
      const updated = await client.query(
        `UPDATE practice_search_cache
         SET response = $2::jsonb,
             key_version = 'hmac-sha256-v3',
             response_schema = 'privacy-safe-v6',
             created_at = NOW(),
             expires_at = NOW() + ($3 * INTERVAL '1 minute')
         WHERE query_hash = $1
         RETURNING query_hash`,
        [hash, JSON.stringify(safeResponse), Math.max(1, Math.min(Number(ttlMinutes) || 60, 24 * 60))],
      );
      requirePersistenceWindow({ signal, deadlineAt }, 100);
      cacheStored = Number(updated.rowCount || 0) > 0;
      if (!cacheStored) {
        const capacity = await trimSearchPersistenceCapacity(client, "cache", { upcomingRows: 1 });
        requirePersistenceWindow({ signal, deadlineAt }, 100);
        if (capacity.canInsert) {
          const inserted = await client.query(
            `INSERT INTO practice_search_cache (query_hash, response, expires_at, key_version, response_schema)
             VALUES ($1, $2::jsonb, NOW() + ($3 * INTERVAL '1 minute'), 'hmac-sha256-v3', 'privacy-safe-v6')
             ON CONFLICT (query_hash) DO UPDATE SET
               response = EXCLUDED.response,
               key_version = EXCLUDED.key_version,
               response_schema = EXCLUDED.response_schema,
               created_at = NOW(),
               expires_at = EXCLUDED.expires_at
             RETURNING query_hash`,
            [hash, JSON.stringify(safeResponse), Math.max(1, Math.min(Number(ttlMinutes) || 60, 24 * 60))],
          );
          cacheStored = Number(inserted.rowCount ?? 1) > 0;
        } else {
          limited = true;
        }
      }
    }
    const runCapacity = await trimSearchPersistenceCapacity(client, "run", { upcomingRows: 1 });
    requirePersistenceWindow({ signal, deadlineAt }, 100);
    if (runCapacity.canInsert) {
      const inserted = await client.query(
        `INSERT INTO practice_search_runs
          (query_hash, answer_provider, source_count, duration_ms, provenance)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id`,
        [hash, answerProvider, response?.sources?.length || 0, Math.round(durationMs), JSON.stringify(provenance)],
      );
      runStored = Number(inserted.rowCount ?? 1) > 0;
    } else {
      limited = true;
    }
    requirePersistenceWindow({ signal, deadlineAt }, 100);
    await client.query("COMMIT");
    return { cacheStored, runStored, limited };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function recordSearch({
  query,
  response,
  cacheValue = response,
  revision,
  answerProvider = "unknown",
  answerStatus = "ready",
  documentIds = [],
  durationMs,
  ttlMinutes = 60,
  cacheResponse = true,
  signal,
  deadlineAt,
}) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok) return { status: "rejected" };
  const acceptedQuery = canonicalInput.query;
  const poolInstance = getPool();
  if (!poolInstance) return { status: "disabled" };
  if (!persistenceWindowOpen({ signal, deadlineAt, reserveMs: 150 })) return { status: "cancelled" };
  let client;
  try {
    await ensureSchema();
    requirePersistenceWindow({ signal, deadlineAt }, 150);
    client = await poolInstance.connect();
    requirePersistenceWindow({ signal, deadlineAt }, 150);
    const hash = queryFingerprint(acceptedQuery, revision);
    const provenance = {
      revision,
      hashVersion: SEARCH_HASH_VERSION,
      answerStatus,
      documentIds: (documentIds || []).map(String).slice(0, 12),
    };
    const safeResponse = sanitizeCachedResponse(cacheValue, acceptedQuery);
    const persistence = await runSearchPersistenceTransaction(client, {
      hash,
      safeResponse,
      cacheResponse: cacheResponse && isPersistentResponseCacheProvider(answerProvider),
      ttlMinutes,
      answerProvider,
      response,
      durationMs,
      provenance,
      signal,
      deadlineAt,
    });
    return { status: persistence.limited ? "limited" : "ready", ...persistence };
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
