import { createHash } from "node:crypto";
import { load } from "cheerio";
import {
  databaseEnabled,
  databaseQuery,
  withDatabaseClient,
} from "./database.mjs";
import { createOfficialDiscoveryIndexQueue } from "./live-index-queue.mjs";
import {
  requestApprovedPublicHttpsText,
  validateApprovedPublicHttpsUrl,
} from "./public-https.mjs";
import { createFairSearchAdmission } from "./request-budget.mjs";
import { canonicalizePublicSearchQuery, minimizePublicProviderQuery } from "./search.mjs";

const PORTAL_BASE = "https://keskkonnaportaal.ee";
const PORTAL_SEARCH = `${PORTAL_BASE}/et/search`;
const PORTAL_SITEMAP = `${PORTAL_BASE}/et/sitemap.xml`;
const PORTAL_ROBOTS = `${PORTAL_BASE}/robots.txt`;
const CRAWLER_PRODUCT = "keskkonnaportaali-praktika-corpus";
const MAX_FETCH_BYTES = 4_000_000;
const MAX_ROBOTS_BYTES = 64_000;
const MAX_ROBOTS_LINES = 2_000;
const MAX_ROBOTS_GROUPS = 32;
const MAX_ROBOTS_RULES = 256;
const MAX_ROBOTS_LINE_BYTES = 512;
const MAX_ROBOTS_PATTERN_LENGTH = 256;
const MAX_ROBOTS_WILDCARDS = 8;
const MAX_ROBOTS_TARGET_LENGTH = 2_048;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const PORTAL_PAGE_SIZE = 50;
const MAX_PORTAL_CATALOG_TOTAL = 20_000;
const MAX_PORTAL_CATALOG_PAGES = Math.ceil(MAX_PORTAL_CATALOG_TOTAL / PORTAL_PAGE_SIZE);
const SITEMAP_PAGE_SIZE = 5_000;
const MAX_SITEMAP_PAGES = 20;
const ROBOTS_CACHE_MS = 60 * 60 * 1_000;
const OFFICIAL_DISCOVERY_RETENTION_HOURS = Math.max(
  24,
  Math.min(Number(process.env.OFFICIAL_DISCOVERY_RETENTION_HOURS) || 168, 720),
);
const APPROVED_PAGE_EVIDENCE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const OFFICIAL_DISCOVERY_MAX_ROWS = Math.max(
  1_000,
  Math.min(Math.trunc(Number(process.env.OFFICIAL_DISCOVERY_MAX_ROWS) || 20_000), 100_000),
);
const PORTAL_UNAVAILABLE_RETENTION_HOURS = Math.max(
  24,
  Math.min(Math.trunc(Number(process.env.PORTAL_UNAVAILABLE_RETENTION_HOURS) || 720), 8_760),
);
const CORPUS_MAX_ROWS = Math.max(
  20_000,
  Math.min(Math.trunc(Number(process.env.CORPUS_MAX_ROWS) || 150_000), 250_000),
);
const CORPUS_MAX_BYTES = Math.max(
  256_000_000,
  Math.min(Math.trunc(Number(process.env.CORPUS_MAX_BYTES) || 2_000_000_000), 12_000_000_000),
);
const CORPUS_RUN_MAX_ROWS = 1_000;
const CORPUS_RETENTION_DELETE_BATCH = 10_000;
const CORPUS_RETENTION_MAX_BATCHES = 20;
const OFFICIAL_DISCOVERY_PROCESS_URL_BUDGET = Math.max(
  100,
  Math.min(
    Math.trunc(Number(process.env.OFFICIAL_DISCOVERY_PROCESS_URL_BUDGET) || 10_000),
    OFFICIAL_DISCOVERY_MAX_ROWS,
  ),
);
const OFFICIAL_DISCOVERY_CLIENT_URL_BUDGET = Math.max(
  25,
  Math.min(
    Math.trunc(Number(process.env.OFFICIAL_DISCOVERY_CLIENT_URL_BUDGET) || 500),
    OFFICIAL_DISCOVERY_PROCESS_URL_BUDGET,
  ),
);
const corpusStatsBackendAdmission = createFairSearchAdmission({
  maximumActive: 2,
  maximumActivePerClient: 1,
  maximumQueue: 8,
  maximumQueuedPerClient: 1,
  maximumWaitMs: 500,
  capacityCode: "CORPUS_CAPACITY",
  capacityLabel: "Corpus statistics backend work",
});
const OFFICIAL_HOSTS = new Set([
  "keskkonnaportaal.ee",
  "www.keskkonnaportaal.ee",
  "keskkonnaagentuur.ee",
  "www.keskkonnaagentuur.ee",
  "keskkonnaamet.ee",
  "www.keskkonnaamet.ee",
  "kliimaministeerium.ee",
  "www.kliimaministeerium.ee",
  "riigiteataja.ee",
  "www.riigiteataja.ee",
  "stat.ee",
  "www.stat.ee",
  "andmed.stat.ee",
  "rmk.ee",
  "www.rmk.ee",
  "tartu.ee",
  "www.tartu.ee",
  "terviseamet.ee",
  "www.terviseamet.ee",
  "kik.ee",
  "www.kik.ee",
  "loodusveeb.ee",
  "www.loodusveeb.ee",
  "envir.ee",
  "www.envir.ee",
]);
const CORPUS_HTTPS_ORIGINS = new Set(
  [...OFFICIAL_HOSTS, "et.wikipedia.org"].map((hostname) => `https://${hostname}`),
);
const WIKIPEDIA_TITLES = [
  "Mets",
  "Eesti metsad",
  "Metsandus",
  "Metsa inventeerimine",
  "Looduskaitse",
  "Elurikkus",
  "Kliimamuutus",
  "Keskkond",
];
const QUERY_STOPWORDS = new Set([
  "aga", "ei", "eesti", "eestis", "ehk", "et", "ja", "kas", "kui", "kuidas", "kus", "meie",
  "miks", "mis", "mida", "millal", "milline", "ning", "on", "oma", "palun", "praegu", "praegune", "praegused", "hetke", "hetkel",
  "selgita", "selgitage", "sooviksin", "teada", "mind", "huvitab",
  "täna", "tana", "homme", "homne", "ülehomme", "ulehomme", "reaalajas", "see",
  "seda", "selle", "siis", "suur", "suured", "suurus", "uusim", "uusimad", "värske", "värsked", "või", "ule", "üle", "uks", "üks",
]);
const SEARCH_FILTER_SOURCES = new Set(["all", "trusted", "official", "reviewed", "supplementary", "other"]);
let corpusSchemaPromise;
let backgroundSyncPromise;
let portalRobotsPromise;
let portalRobotsFetchedAt = 0;

export const OFFICIAL_DISCOVERY_RETIRE_SQL = `
  UPDATE practice_corpus_documents
  SET is_available = FALSE,
      metadata = metadata || '{"retired_reason":"official-live-search-ttl"}'::JSONB
  WHERE source_key = 'official-live-search'
    AND is_available = TRUE
    AND last_seen_at < NOW() - make_interval(hours => $1)
`;

export const OFFICIAL_DISCOVERY_DELETE_SQL = `
  DELETE FROM practice_corpus_documents
  WHERE source_key = 'official-live-search'
    AND last_seen_at < NOW() - make_interval(hours => $1)
`;

export const PORTAL_UNAVAILABLE_DELETE_SQL = `
  WITH stale AS (
    SELECT id
    FROM practice_corpus_documents
    WHERE is_available = FALSE
      AND source_key IN ('portal-sitemap', 'portal-catalog', 'official-page-hydration')
      AND last_seen_at < NOW() - make_interval(hours => $1)
    ORDER BY last_seen_at ASC, id ASC
    LIMIT $2
  )
  DELETE FROM practice_corpus_documents document
  USING stale
  WHERE document.id = stale.id
`;

export const CORPUS_OVERFLOW_DELETE_SQL = `
  WITH totals AS (
    SELECT
      GREATEST(COUNT(*) - $1, 0)::BIGINT AS excess_rows,
      GREATEST(COALESCE(SUM(pg_column_size(document)), 0) - $2, 0)::BIGINT AS excess_bytes
    FROM practice_corpus_documents document
  ), ordered AS (
    SELECT
      document.id,
      pg_column_size(document)::BIGINT AS row_bytes,
      ROW_NUMBER() OVER (ORDER BY document.last_seen_at ASC, document.id ASC) AS row_position,
      COALESCE(SUM(pg_column_size(document)) OVER (
        ORDER BY document.last_seen_at ASC, document.id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0)::BIGINT AS bytes_before
    FROM practice_corpus_documents document
    WHERE document.is_available = FALSE
  ), victims AS (
    SELECT ordered.id
    FROM ordered CROSS JOIN totals
    WHERE ordered.row_position <= totals.excess_rows
       OR ordered.bytes_before < totals.excess_bytes
    ORDER BY ordered.row_position
    LIMIT $3
  )
  DELETE FROM practice_corpus_documents document
  USING victims
  WHERE document.id = victims.id
`;

export function canonicalOfficialDiscoveryUrl(value = "") {
  try {
    const url = new URL(typeof value === "object" ? value?.url : value);
    if (url.protocol !== "https:" || !OFFICIAL_HOSTS.has(url.hostname)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid)/iu.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return "";
  }
}

function officialDiscoveryQueueKey(document = {}) {
  return canonicalOfficialDiscoveryUrl(document?.url);
}

const officialDiscoveryIndexQueue = createOfficialDiscoveryIndexQueue({
  keyOf: officialDiscoveryQueueKey,
  acceptanceWindowMs: OFFICIAL_DISCOVERY_RETENTION_HOURS * 60 * 60_000,
  maximumAcceptedPerWindow: OFFICIAL_DISCOVERY_PROCESS_URL_BUDGET,
  maximumAcceptedPerClient: OFFICIAL_DISCOVERY_CLIENT_URL_BUDGET,
  writeBatch: (documents, { signal, maintenance }) => indexOfficialDiscoveryDocuments(documents, {
    signal,
    retireStale: maintenance,
  }),
});

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function boundedText(value, length) {
  return cleanText(value).slice(0, length);
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function normalizeCorpusQuery(value = "") {
  const canonicalInput = canonicalizePublicSearchQuery(value);
  return canonicalInput.ok ? canonicalInput.query.toLocaleLowerCase("et") : "";
}

function corpusTermRoot(term) {
  if (/^kasvuhoonegaas/iu.test(term)) return "kasvuhoonegaas";
  if (/^mets/iu.test(term)) return "mets";
  if (/^(?:rai|raie|raium|raiemaht)/iu.test(term)) return "rai";
  if (/^noor/iu.test(term)) return "noor";
  if (/^(?:vana|vanus|vanem)/iu.test(term)) return "vanus";
  if (/^muut/iu.test(term)) return "muut";
  if (/^tulevik/iu.test(term)) return "tulevik";
  if (/^kasv/iu.test(term)) return "kasv";
  if (/^põhjave/iu.test(term)) return "põhjave";
  if (/^läänemer/iu.test(term)) return "läänemer";
  if (/^mer/iu.test(term)) return "mer";
  if (/^hei[dt]/iu.test(term)) return "heide";
  if (/^ringmajand/iu.test(term)) return "ringmajandus";
  if (/^ringlussevõt/iu.test(term)) return "ringlussevõt";
  if (/^(?:tohib|lubat|keelat)$/iu.test(term)) return "lubatav";
  if (/^võib$/iu.test(term)) return "lubatav";
  if (/^autorehv/iu.test(term)) return "rehv";
  if (/^elutsük/iu.test(term)) return "elutsük";
  if (/^sadem/iu.test(term)) return "sadem";
  if (/^ajalool/iu.test(term)) return "ajalool";
  if (/^emajõ/iu.test(term)) return "emajõ";
  if (/^keskkonnalo/iu.test(term)) return "keskkonnalo";
  if (/^(?:taotl|taotle)/iu.test(term)) return "taotl";
  if (/^ettevõt/iu.test(term)) return "ettevõt";
  if (/^ehit/iu.test(term)) return "ehit";
  if (/^(?:liik|liig)/iu.test(term)) return "liik";
  if (/^(?:elupaik|elupaig)/iu.test(term)) return "elupaik";
  if (/^lang/iu.test(term)) return "lang";
  if (/^vähen/iu.test(term)) return "vähen";
  if (/^suuren/iu.test(term)) return "suuren";
  if (/^seir/iu.test(term)) return "seir";
  if (/^mõõt/iu.test(term)) return "mõõt";
  if (/^kait/iu.test(term)) return "kait";
  if (/maal$/iu.test(term) && term.length >= 7) return term.slice(0, -1);
  return term;
}

export function corpusRankingTerms(value = "") {
  return [...new Set((normalizeCorpusQuery(value).match(/[0-9a-zõäöüšž]+/giu) || [])
    .filter((term) => term.length >= 2 && !QUERY_STOPWORDS.has(term))
    .flatMap((term) => /^metsastat/iu.test(term)
      ? [corpusTermRoot(term), "statist"]
      : [corpusTermRoot(term)]))]
    .slice(0, 10);
}

function corpusTermVariants(term) {
  if (term === "noor") return [term, "vanus"];
  if (term === "vanus") return [term, "noor", "vana"];
  if (term === "muut") return [term, "trend"];
  if (term === "rai") return [term, "raiemaht", "raiuda"];
  if (term === "kasv") return [term, "suuren"];
  if (term === "heide") return ["heit", "heid"];
  if (term === "lubatav") return ["tohi", "lubat", "keelat"];
  if (term === "rehv") return ["rehv", "autorehv"];
  if (term === "sadem") return ["sadem", "saju"];
  if (term === "emajõ") return ["emajõ", "emajõe"];
  if (term === "mõõt") return ["mõõt", "tulemus"];
  if (term === "liik") return ["liik", "liig"];
  if (term === "elupaik") return ["elupaik", "elupaig"];
  if (["lang", "vähen"].includes(term)) return [term, "vähen", "kahan"];
  return [term];
}

export function corpusQueryTerms(value = "") {
  const terms = corpusRankingTerms(value);
  const expanded = terms.flatMap(corpusTermVariants);
  return [...new Set(expanded)].slice(0, 14);
}

export function buildPrefixTsQuery(value = "") {
  return corpusRankingTerms(value).map((term) => {
    const group = corpusTermVariants(term).map((variant) => `${variant}:*`);
    return group.length === 1 ? group[0] : `(${group.join(" | ")})`;
  }).join(" & ");
}

export function normalizeSearchFilters(value = {}) {
  const source = SEARCH_FILTER_SOURCES.has(String(value.source || "all")) ? String(value.source || "all") : "all";
  const category = cleanText(value.category).slice(0, 120);
  const requestedYear = Number(value.year);
  const maximumYear = new Date().getUTCFullYear() + 1;
  const year = Number.isInteger(requestedYear) && requestedYear >= 1990 && requestedYear <= maximumYear
    ? requestedYear
    : null;
  const sort = value.sort === "newest" ? "newest" : "relevance";
  return { source, category, year, sort };
}

export function sourceTiersForFilter(source = "all") {
  if (source === "trusted") return ["official", "reviewed"];
  if (["official", "reviewed", "supplementary", "other"].includes(source)) return [source];
  return [];
}

export function queryNeedsFreshness(value = "") {
  const query = normalizeCorpusQuery(value);
  return /\b(?:praeg\w*|hetke\w*|uusim\w*|viimati|värske\w*|tänavu|tulevik\w*|trend\w*|muutu\w*|20(?:2[5-9]|[3-9]\d))\b/iu.test(query);
}

export function summarizeUrlOccurrences(values = []) {
  const occurrences = values.map((value) => String(value || "").trim()).filter(Boolean);
  const distinctUrls = [...new Set(occurrences)];
  return {
    occurrences,
    distinctUrls,
    occurrenceCount: occurrences.length,
    distinctCount: distinctUrls.length,
  };
}

function canonicalUrl(value, base = PORTAL_BASE) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue || /^(?:null|undefined)$/iu.test(rawValue)) return null;
  try {
    const url = new URL(rawValue, base);
    if (url.protocol === "http:" && ["keskkonnaportaal.ee", "www.keskkonnaportaal.ee"].includes(url.hostname)) {
      url.protocol = "https:";
    }
    if (url.protocol !== "https:") return null;
    if (url.hostname === "www.keskkonnaportaal.ee") url.hostname = "keskkonnaportaal.ee";
    const terminalPathSegment = url.pathname.split("/").filter(Boolean).at(-1) || "";
    let decodedTerminalPathSegment = terminalPathSegment;
    try {
      decodedTerminalPathSegment = decodeURIComponent(terminalPathSegment);
    } catch {
      // Keep the encoded segment; malformed encodings remain ordinary URLs
      // and will be rejected by the downstream HTTPS fetch if unusable.
    }
    if (/^(?:null|undefined)$/iu.test(decodedTerminalPathSegment.normalize("NFKC"))) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid)/iu.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function hydrationResourceMatches(requestedValue, finalValue) {
  const requested = canonicalUrl(requestedValue);
  const finalResource = canonicalUrl(finalValue);
  return Boolean(requested && finalResource && requested === finalResource);
}

function robotsPatternMatches(pattern, target) {
  const endAnchored = pattern.endsWith("$");
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  if (!body.includes("*")) return endAnchored ? target === body : target.startsWith(body);

  const segments = body.split("*");
  let position = 0;
  if (!body.startsWith("*")) {
    const first = segments.shift() || "";
    if (!target.startsWith(first)) return false;
    position = first.length;
  }

  let endLimit = target.length;
  if (endAnchored && !body.endsWith("*")) {
    const last = segments.pop() || "";
    if (!target.endsWith(last)) return false;
    endLimit = target.length - last.length;
  }

  for (const segment of segments) {
    if (!segment) continue;
    const found = target.indexOf(segment, position);
    if (found < 0 || found + segment.length > endLimit) return false;
    position = found + segment.length;
  }
  return position <= endLimit;
}

export function parseRobotsTxt(value = "", product = CRAWLER_PRODUCT) {
  const input = String(value);
  if (Buffer.byteLength(input, "utf8") > MAX_ROBOTS_BYTES) {
    throw new Error("robots.txt exceeds the configured byte limit");
  }
  const lines = input.split(/\r?\n/u);
  if (lines.length > MAX_ROBOTS_LINES) throw new Error("robots.txt has too many lines");
  const groups = [];
  let group;
  let ruleCount = 0;
  for (const rawLine of lines) {
    if (Buffer.byteLength(rawLine, "utf8") > MAX_ROBOTS_LINE_BYTES) {
      throw new Error("robots.txt contains an oversized line");
    }
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase("en");
    const directive = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!group || group.hasDirectives) {
        if (groups.length >= MAX_ROBOTS_GROUPS) throw new Error("robots.txt has too many groups");
        group = { agents: [], rules: [], hasDirectives: false };
        groups.push(group);
      }
      if (group.agents.length < 8) group.agents.push(directive.slice(0, 120).toLocaleLowerCase("en"));
      continue;
    }
    if (!group || !["allow", "disallow"].includes(key)) continue;
    group.hasDirectives = true;
    if (directive || key === "allow") {
      if (directive.length > MAX_ROBOTS_PATTERN_LENGTH
        || (directive.match(/\*/gu) || []).length > MAX_ROBOTS_WILDCARDS) {
        throw new Error("robots.txt contains an over-complex rule");
      }
      ruleCount += 1;
      if (ruleCount > MAX_ROBOTS_RULES) throw new Error("robots.txt has too many rules");
      group.rules.push({
        type: key,
        pattern: directive,
        specificity: directive.replace(/[\*$]/gu, "").length,
      });
    }
  }
  const normalizedProduct = String(product).toLocaleLowerCase("en");
  const exact = groups.filter(({ agents }) => agents.some((agent) => agent !== "*" && normalizedProduct.includes(agent)));
  const selected = exact.length ? exact : groups.filter(({ agents }) => agents.includes("*"));
  return selected.flatMap(({ rules }) => rules);
}

export function robotsAllowsUrl(url, rules = []) {
  let target;
  try {
    const parsed = new URL(url);
    target = `${parsed.pathname}${parsed.search}`;
  } catch {
    return false;
  }
  if (target.length > MAX_ROBOTS_TARGET_LENGTH || rules.length > MAX_ROBOTS_RULES) return false;
  const matches = rules
    .filter(({ pattern }) => pattern && robotsPatternMatches(pattern, target))
    .sort((left, right) => (right.specificity ?? right.pattern.replace(/[\*$]/gu, "").length)
      - (left.specificity ?? left.pattern.replace(/[\*$]/gu, "").length)
      || Number(right.type === "allow") - Number(left.type === "allow"));
  return matches.length === 0 || matches[0].type === "allow";
}

export function isApprovedCorpusRedirect(requestedValue, candidateValue) {
  try {
    const requested = validateApprovedPublicHttpsUrl(requestedValue, CORPUS_HTTPS_ORIGINS);
    validateApprovedPublicHttpsUrl(new URL(candidateValue, requested), corpusOriginsForUrl(requested));
    return true;
  } catch {
    return false;
  }
}

function corpusOriginsForUrl(value) {
  const requested = validateApprovedPublicHttpsUrl(value, CORPUS_HTTPS_ORIGINS);
  const origins = new Set([requested.origin]);
  const hostname = requested.hostname.startsWith("www.")
    ? requested.hostname.slice(4)
    : requested.hostname;
  for (const counterpart of [`https://${hostname}`, `https://www.${hostname}`]) {
    if (CORPUS_HTTPS_ORIGINS.has(counterpart)) origins.add(counterpart);
  }
  return origins;
}

function sourceTierForUrl(value) {
  try {
    const host = new URL(value).hostname.toLocaleLowerCase("en");
    if (host === "et.wikipedia.org") return "supplementary";
    if (OFFICIAL_HOSTS.has(host) || host.endsWith(".envir.ee")) return "official";
  } catch {
    return "other";
  }
  return "other";
}

function externalId(url) {
  return hash(url).slice(0, 24);
}

function parsePortalDate(value) {
  const match = cleanText(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/u);
  if (!match) return null;
  return canonicalIsoDate(`${match[3]}-${match[2]}-${match[1]}`);
}

function canonicalIsoDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
    ? text
    : null;
}

function canonicalIsoTimestamp(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 64) return null;
  const dateOnly = canonicalIsoDate(text);
  if (dateOnly) return `${dateOnly}T00:00:00.000Z`;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):(\d{2}))$/u);
  if (!match || !canonicalIsoDate(match[1])) return null;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] || 0) > 59) return null;
  if (match[5] !== "Z" && (Number(match[6]) > 23 || Number(match[7]) > 59)) return null;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function placeholderTitle(url) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) || "Keskkonnaportaal");
    return boundedText(last.replace(/[-_]+/gu, " ").replace(/^./u, (letter) => letter.toLocaleUpperCase("et")), 240);
  } catch {
    return "Keskkonnaportaali leht";
  }
}

function normalizeDocument(document) {
  const url = canonicalUrl(document.url);
  if (!url) return null;
  const title = boundedText(document.title || placeholderTitle(url), 500);
  if (!title) return null;
  const summary = boundedText(document.summary, 4_000);
  const content = boundedText(document.content, 80_000);
  const topics = [...new Set((document.topics || []).map((topic) => boundedText(topic, 100)).filter(Boolean))].slice(0, 20);
  const sourceTier = ["official", "reviewed", "supplementary", "other"].includes(document.sourceTier)
    ? document.sourceTier
    : sourceTierForUrl(url);
  const normalized = {
    externalId: document.externalId || externalId(url),
    sourceKey: boundedText(document.sourceKey || "keskkonnaportaal", 80),
    url,
    title,
    summary,
    content,
    category: boundedText(document.category, 200),
    organization: boundedText(document.organization, 200),
    publishedAt: canonicalIsoDate(document.publishedAt),
    publishedLabel: boundedText(document.publishedLabel || document.publishedAt, 80),
    modifiedAt: canonicalIsoTimestamp(document.modifiedAt),
    topics,
    sourceTier,
    language: boundedText(document.language || "et", 12),
    quality: Math.max(1, Math.min(Number(document.quality) || 1, 5)),
    metadata: document.metadata && typeof document.metadata === "object" ? document.metadata : {},
  };
  normalized.contentHash = hash(JSON.stringify([
    normalized.title,
    normalized.summary,
    normalized.content,
    normalized.category,
    normalized.organization,
    normalized.publishedAt,
    normalized.topics,
  ]));
  return normalized;
}

export function deduplicateCorpusDocuments(rawDocuments = []) {
  const byUrl = new Map();
  for (const rawDocument of rawDocuments) {
    const document = normalizeDocument(rawDocument);
    if (!document) continue;
    const current = byUrl.get(document.url);
    if (!current) {
      byUrl.set(document.url, document);
      continue;
    }
    const currentIsFederated = current.sourceKey === "official-live-search";
    const documentIsFederated = document.sourceKey === "official-live-search";
    if (currentIsFederated !== documentIsFederated) {
      // Search-index snippets are discovery metadata, not a hydrated page body.
      // Keep the non-live record's identity, body, hash and provenance atomic in
      // either input order; only harmless topic coverage and tier quality merge.
      const authoritative = currentIsFederated ? document : current;
      const discovery = currentIsFederated ? current : document;
      const merged = {
        ...discovery,
        ...authoritative,
        metadata: { ...authoritative.metadata },
      };
      merged.contentHash = hash(JSON.stringify([
        merged.title,
        merged.summary,
        merged.content,
        merged.category,
        merged.organization,
        merged.publishedAt,
        merged.topics,
      ]));
      byUrl.set(document.url, merged);
      continue;
    }
    const preferred = document.quality >= current.quality ? document : current;
    const fallback = preferred === document ? current : document;
    const merged = {
      ...fallback,
      ...preferred,
      summary: preferred.summary || fallback.summary,
      content: preferred.content.length >= fallback.content.length ? preferred.content : fallback.content,
      topics: [...new Set([...current.topics, ...document.topics])].slice(0, 20),
      metadata: { ...current.metadata, ...document.metadata },
      sourceTier: current.sourceTier === "reviewed" || document.sourceTier === "reviewed"
        ? "reviewed"
        : preferred.sourceTier,
      quality: Math.max(current.quality, document.quality),
    };
    merged.contentHash = hash(JSON.stringify([
      merged.title,
      merged.summary,
      merged.content,
      merged.category,
      merged.organization,
      merged.publishedAt,
      merged.topics,
    ]));
    byUrl.set(document.url, merged);
  }
  return [...byUrl.values()];
}

export function parsePortalReportedTotal(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  if (!/^\d{1,6}$/u.test(raw)) throw new Error("Portal search returned an invalid result count");
  const total = Number(raw);
  if (!Number.isSafeInteger(total) || total < 0 || total > MAX_PORTAL_CATALOG_TOTAL) {
    throw new Error("Portal search exceeds the configured result limit");
  }
  return total;
}

export function parsePortalSearchPage(html, baseUrl = PORTAL_BASE) {
  const $ = load(String(html || ""));
  const mainText = cleanText($("main").text());
  const total = parsePortalReportedTotal(mainText.match(/Tulemused otsingule\s*\((\d+)\)/iu)?.[1]
    || mainText.match(/(\d+)\s+tulemust/iu)?.[1]
    || "");
  const resultCards = $(".search-results__item-wrap");
  if (resultCards.length > PORTAL_PAGE_SIZE) throw new Error("Portal search returned too many result cards");
  const documents = resultCards.map((_, element) => {
    const card = $(element);
    const link = card.find([
      ".search-results__item > a[href]",
      ".search-results__item .search-results__title a[href]",
    ].join(", ")).first();
    const url = canonicalUrl(link.attr("href"), baseUrl);
    if (!url) return null;
    const category = boundedText(card.find(".search-results__category").first().text(), 200);
    const publishedLabel = boundedText(card.find(".search-results__date").first().text(), 80);
    return normalizeDocument({
      sourceKey: "portal-catalog",
      url,
      title: card.find(".search-results__title").first().text(),
      summary: card.find(".search-results__text").first().text(),
      category,
      organization: card.find(".search-results__author").first().text(),
      publishedAt: parsePortalDate(publishedLabel),
      publishedLabel,
      topics: card.find(".search-results__topic a").map((__, topic) => $(topic).text()).get(),
      sourceTier: sourceTierForUrl(url),
      quality: 3,
      metadata: { source_kind: "portal-search-card", placeholder: false },
    });
  }).get().filter(Boolean);
  return { total, documents };
}

export function parsePortalSitemapPage(xml) {
  const $ = load(String(xml || ""), { xmlMode: true });
  const entries = $("url");
  if (entries.length > SITEMAP_PAGE_SIZE) throw new Error("Portal sitemap returned too many URL entries");
  const documents = entries.map((_, element) => {
    const url = canonicalUrl($(element).find("loc").text());
    if (!url) return null;
    try {
      if (new URL(url).hostname !== "keskkonnaportaal.ee") return null;
    } catch {
      return null;
    }
    return normalizeDocument({
      sourceKey: "portal-sitemap",
      url,
      title: placeholderTitle(url),
      modifiedAt: cleanText($(element).find("lastmod").text()) || null,
      sourceTier: "official",
      quality: 1,
      metadata: { source_kind: "portal-sitemap", placeholder: true },
    });
  }).get().filter(Boolean);
  return { documents, entryCount: entries.length, rejectedCount: entries.length - documents.length };
}

export function parsePortalSitemap(xml) {
  return parsePortalSitemapPage(xml).documents;
}

export function extractReadablePage(html, url) {
  const $ = load(String(html || ""));
  const root = $("main").first().length ? $("main").first().clone() : $("body").first().clone();
  root.find("script,style,noscript,svg,nav,header,footer,form,.breadcrumb,.pager,.eu-cookie-compliance-banner").remove();
  const title = boundedText(root.find("h1").first().text() || $("title").text(), 500);
  const focused = root.find([
    ".field--name-body",
    ".field--name-field-kem-introduction",
    ".field--name-field-kem-content",
    ".layout-content",
    "article",
  ].join(","));
  const content = boundedText((focused.length ? focused : root).text(), 80_000);
  return { title: title || placeholderTitle(url), content };
}

export function pageRobotsPolicy(html = "", headerValue = "") {
  const $ = load(String(html || ""));
  const directives = [
    headerValue,
    ...$("meta[name]").map((_, element) => {
      const name = cleanText($(element).attr("name")).toLocaleLowerCase("en");
      return ["robots", CRAWLER_PRODUCT].includes(name) ? $(element).attr("content") : "";
    }).get(),
  ]
    .flatMap((value) => cleanText(value).toLocaleLowerCase("en").split(/[\s,;]+/u))
    .filter(Boolean);
  return {
    noindex: directives.includes("noindex") || directives.includes("none"),
    directives: [...new Set(directives)],
  };
}

async function ensureCorpusSchema() {
  if (!databaseEnabled()) return false;
  if (!corpusSchemaPromise) {
    corpusSchemaPromise = withDatabaseClient(async (client) => {
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
        CREATE EXTENSION IF NOT EXISTS unaccent;

        CREATE TABLE IF NOT EXISTS practice_corpus_documents (
          id BIGSERIAL PRIMARY KEY,
          external_id TEXT NOT NULL,
          source_key TEXT NOT NULL,
          canonical_url TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          organization TEXT NOT NULL DEFAULT '',
          published_at DATE,
          published_label TEXT NOT NULL DEFAULT '',
          modified_at TIMESTAMPTZ,
          topics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          source_tier TEXT NOT NULL DEFAULT 'other'
            CHECK (source_tier IN ('official', 'reviewed', 'supplementary', 'other')),
          language TEXT NOT NULL DEFAULT 'et',
          metadata_quality SMALLINT NOT NULL DEFAULT 1,
          metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
          content_hash TEXT NOT NULL,
          search_vector TSVECTOR NOT NULL DEFAULT ''::TSVECTOR,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_run BIGINT,
          is_available BOOLEAN NOT NULL DEFAULT TRUE,
          UNIQUE (source_key, external_id)
        );

        -- An earlier importer converted a missing JS value into the literal
        -- string "null". Keep this idempotent migration beside the schema so
        -- every existing Coolify database is repaired on first new startup.
        UPDATE practice_corpus_documents
        SET published_label = ''
        WHERE lower(trim(published_label)) = 'null';

        -- The first prototype copied its reviewed forestry answer corpus into
        -- the general search index with a privileged tier. Keep the official
        -- URLs discoverable, but remove the prewritten answer text and the
        -- ranking privilege; fresh portal/live metadata can now replace it.
        UPDATE practice_corpus_documents
        SET source_key = 'legacy-official-url',
            content = '',
            source_tier = 'official',
            metadata_quality = 1,
            metadata = jsonb_build_object('source_kind', 'legacy-official-url'),
            content_hash = md5(canonical_url)
        WHERE source_key = 'reviewed-forestry';

        CREATE OR REPLACE FUNCTION practice_corpus_vector_update()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          NEW.search_vector :=
            setweight(to_tsvector('simple', public.unaccent(COALESCE(NEW.title, ''))), 'A') ||
            setweight(to_tsvector('simple', public.unaccent(COALESCE(NEW.category, '') || ' ' || COALESCE(NEW.organization, '') || ' ' || array_to_string(COALESCE(NEW.topics, ARRAY[]::TEXT[]), ' '))), 'B') ||
            setweight(to_tsvector('simple', public.unaccent(COALESCE(NEW.summary, ''))), 'C') ||
            setweight(to_tsvector('simple', public.unaccent(COALESCE(NEW.content, ''))), 'D');
          RETURN NEW;
        END
        $$;

        DROP TRIGGER IF EXISTS practice_corpus_vector_trigger ON practice_corpus_documents;
        CREATE TRIGGER practice_corpus_vector_trigger
          BEFORE INSERT OR UPDATE OF title, summary, content, category, organization, topics
          ON practice_corpus_documents
          FOR EACH ROW EXECUTE FUNCTION practice_corpus_vector_update();

        CREATE INDEX IF NOT EXISTS practice_corpus_search_vector_idx
          ON practice_corpus_documents USING GIN (search_vector);
        CREATE INDEX IF NOT EXISTS practice_corpus_title_trgm_idx
          ON practice_corpus_documents USING GIN (lower(title) gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS practice_corpus_published_idx
          ON practice_corpus_documents (published_at DESC NULLS LAST);
        CREATE INDEX IF NOT EXISTS practice_corpus_tier_idx
          ON practice_corpus_documents (source_tier, is_available);
        CREATE INDEX IF NOT EXISTS practice_corpus_available_source_idx
          ON practice_corpus_documents (source_key, last_seen_at DESC)
          WHERE is_available = TRUE;
        CREATE INDEX IF NOT EXISTS practice_corpus_live_seen_idx
          ON practice_corpus_documents (last_seen_at)
          WHERE source_key = 'official-live-search';

        UPDATE practice_corpus_documents
        SET is_available = FALSE,
            metadata = metadata || '{"retired_reason":"official-live-search-ttl"}'::JSONB
        WHERE source_key = 'official-live-search'
          AND is_available = TRUE
          AND last_seen_at < NOW() - make_interval(hours => ${OFFICIAL_DISCOVERY_RETENTION_HOURS});
        DELETE FROM practice_corpus_documents
        WHERE source_key = 'official-live-search'
          AND last_seen_at < NOW() - make_interval(hours => ${OFFICIAL_DISCOVERY_RETENTION_HOURS * 2});

        CREATE TABLE IF NOT EXISTS practice_corpus_runs (
          id BIGSERIAL PRIMARY KEY,
          mode TEXT NOT NULL,
          status TEXT NOT NULL,
          discovered_count INTEGER NOT NULL DEFAULT 0,
          indexed_count INTEGER NOT NULL DEFAULT 0,
          hydrated_count INTEGER NOT NULL DEFAULT 0,
          error_count INTEGER NOT NULL DEFAULT 0,
          details JSONB NOT NULL DEFAULT '{}'::JSONB,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS practice_corpus_runs_finished_idx
          ON practice_corpus_runs (finished_at DESC);

        CREATE TABLE IF NOT EXISTS practice_corpus_query_snapshots (
          query_hash TEXT PRIMARY KEY,
          normalized_query TEXT NOT NULL,
          query_source TEXT NOT NULL DEFAULT 'configured-seed',
          upstream_total INTEGER NOT NULL,
          page_count INTEGER NOT NULL DEFAULT 0,
          page_size INTEGER NOT NULL DEFAULT ${PORTAL_PAGE_SIZE},
          sort_order TEXT NOT NULL DEFAULT 'portal-default',
          stored_occurrence_count INTEGER NOT NULL DEFAULT 0,
          distinct_url_count INTEGER NOT NULL DEFAULT 0,
          document_urls JSONB NOT NULL,
          captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE practice_corpus_query_snapshots
          ADD COLUMN IF NOT EXISTS query_source TEXT NOT NULL DEFAULT 'configured-seed',
          ADD COLUMN IF NOT EXISTS page_count INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS page_size INTEGER NOT NULL DEFAULT ${PORTAL_PAGE_SIZE},
          ADD COLUMN IF NOT EXISTS sort_order TEXT NOT NULL DEFAULT 'portal-default',
          ADD COLUMN IF NOT EXISTS stored_occurrence_count INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS distinct_url_count INTEGER NOT NULL DEFAULT 0;
        UPDATE practice_corpus_query_snapshots
        SET page_count = CASE
              WHEN page_count > 0 THEN page_count
              ELSE CEIL(upstream_total::NUMERIC / NULLIF(page_size, 0))::INTEGER
            END,
            stored_occurrence_count = CASE
              WHEN stored_occurrence_count > 0 THEN stored_occurrence_count
              ELSE jsonb_array_length(document_urls)
            END,
            distinct_url_count = CASE
              WHEN distinct_url_count > 0 THEN distinct_url_count
              ELSE (SELECT COUNT(DISTINCT value) FROM jsonb_array_elements_text(document_urls))
            END;
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'practice_corpus_query_source_check'
          ) THEN
            ALTER TABLE practice_corpus_query_snapshots
              ADD CONSTRAINT practice_corpus_query_source_check
              CHECK (query_source = 'configured-seed');
          END IF;
        END
        $$;
      `);
      await enforceCorpusRetention(client);
      return true;
    }).catch((error) => {
      corpusSchemaPromise = undefined;
      throw error;
    });
  }
  return corpusSchemaPromise;
}

function throwIfCorpusAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Corpus indexing was aborted", "AbortError");
}

async function enforceCorpusRetention(client, { signal } = {}) {
  throwIfCorpusAborted(signal);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    // Every replica and both ingestion paths share one database-scoped lock,
    // so retention and cumulative capacity decisions cannot race each other.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('practice-corpus-retention-capacity'))");
    let unavailableDeleted = 0;
    for (let batch = 0; batch < CORPUS_RETENTION_MAX_BATCHES; batch += 1) {
      throwIfCorpusAborted(signal);
      const deleted = await client.query(PORTAL_UNAVAILABLE_DELETE_SQL, [
        PORTAL_UNAVAILABLE_RETENTION_HOURS,
        CORPUS_RETENTION_DELETE_BATCH,
      ]);
      unavailableDeleted += Number(deleted.rowCount || 0);
      if (Number(deleted.rowCount || 0) < CORPUS_RETENTION_DELETE_BATCH) break;
    }

    let overflowDeleted = 0;
    for (let batch = 0; batch < CORPUS_RETENTION_MAX_BATCHES; batch += 1) {
      throwIfCorpusAborted(signal);
      const deleted = await client.query(CORPUS_OVERFLOW_DELETE_SQL, [
        CORPUS_MAX_ROWS,
        CORPUS_MAX_BYTES,
        CORPUS_RETENTION_DELETE_BATCH,
      ]);
      overflowDeleted += Number(deleted.rowCount || 0);
      if (Number(deleted.rowCount || 0) < CORPUS_RETENTION_DELETE_BATCH) break;
    }

    const runsDeleted = await client.query(`
      WITH old_runs AS (
        SELECT id
        FROM practice_corpus_runs
        WHERE status <> 'running'
        ORDER BY id DESC
        OFFSET $1
      )
      DELETE FROM practice_corpus_runs run
      USING old_runs
      WHERE run.id = old_runs.id
    `, [CORPUS_RUN_MAX_ROWS]);
    await client.query("COMMIT");
    return {
      unavailableDeleted,
      overflowDeleted,
      runsDeleted: Number(runsDeleted.rowCount || 0),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function estimatedCorpusDocumentBytes(document) {
  try {
    // The JSON representation includes every variable-width field. Eight KiB
    // of tuple/index overhead makes this deliberately larger than the stored
    // row estimate used by the aggregate cap.
    return Buffer.byteLength(JSON.stringify(document) || "", "utf8") + 8_192;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function limitCorpusDocumentsByAggregateCapacity(
  documents = [],
  existingDocuments = [],
  currentRowCount = 0,
  currentBytes = 0,
  maximumRows = CORPUS_MAX_ROWS,
  maximumBytes = CORPUS_MAX_BYTES,
) {
  return planCorpusDocumentAdmission(
    documents,
    existingDocuments,
    currentRowCount,
    currentBytes,
    maximumRows,
    maximumBytes,
  ).admittedDocuments;
}

export function planCorpusDocumentAdmission(
  documents = [],
  existingDocuments = [],
  currentRowCount = 0,
  currentBytes = 0,
  maximumRows = CORPUS_MAX_ROWS,
  maximumBytes = CORPUS_MAX_BYTES,
) {
  const existing = new Map();
  for (const value of existingDocuments) {
    const isDescriptor = value && typeof value === "object";
    const url = String(isDescriptor ? value.canonical_url || value.url || "" : value || "");
    if (!url) continue;
    const rawBytes = isDescriptor
      ? value.existing_bytes ?? value.existingBytes ?? value.stored_bytes ?? value.storedBytes
      : undefined;
    const parsedBytes = Number(rawBytes);
    existing.set(url, Number.isFinite(parsedBytes) && parsedBytes >= 0
      ? Math.trunc(parsedBytes)
      : undefined);
  }
  const safeMaximumRows = Math.max(0, Math.trunc(Number(maximumRows) || 0));
  const safeMaximumBytes = Math.max(0, Math.trunc(Number(maximumBytes) || 0));
  let newRowSlots = Math.max(0, safeMaximumRows - Math.max(0, Math.trunc(Number(currentRowCount) || 0)));
  let remainingBytes = Math.max(0, safeMaximumBytes - Math.max(0, Math.trunc(Number(currentBytes) || 0)));
  const admittedDocuments = [];
  const livenessOnlyUrls = [];
  for (const document of documents) {
    const url = String(document?.url || "");
    const isExisting = existing.has(url);
    const estimatedBytes = estimatedCorpusDocumentBytes(document);
    const existingBytes = existing.get(url);
    const additionalBytes = isExisting && existingBytes !== undefined
      ? Math.max(0, estimatedBytes - existingBytes)
      : estimatedBytes;
    if (additionalBytes > remainingBytes || (!isExisting && newRowSlots <= 0)) {
      if (isExisting) livenessOnlyUrls.push(url);
      continue;
    }
    remainingBytes -= additionalBytes;
    if (!isExisting) newRowSlots -= 1;
    admittedDocuments.push(document);
  }
  return {
    admittedDocuments,
    livenessOnlyUrls,
    capacityDropped: documents.length - admittedDocuments.length,
  };
}

async function upsertDocuments(
  client,
  rawDocuments,
  runId,
  { signal, discoveryOnly = false, inTransaction = false } = {},
) {
  const documents = deduplicateCorpusDocuments(rawDocuments);
  let indexed = 0;
  let capacityDropped = 0;
  for (let offset = 0; offset < documents.length; offset += 250) {
    throwIfCorpusAborted(signal);
    const batch = documents.slice(offset, offset + 250);
    const ownsTransaction = !inTransaction;
    if (ownsTransaction) await client.query("BEGIN");
    try {
      if (ownsTransaction) await client.query("SET LOCAL statement_timeout = '10000ms'");
      // Full sync, live discovery and retention all take this transaction lock.
      // Aggregate admission therefore observes a stable capacity snapshot and
      // no replica can insert between the count and the write.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('practice-corpus-retention-capacity'))");
      const capacityResult = await client.query(`
        SELECT COUNT(*)::BIGINT AS total_rows,
               COALESCE(SUM(pg_column_size(document)), 0)::BIGINT AS total_bytes
        FROM practice_corpus_documents AS document
      `);
      const existingResult = await client.query(`
        SELECT canonical_url,
               pg_column_size(document)::BIGINT AS existing_bytes
        FROM practice_corpus_documents AS document
        WHERE canonical_url = ANY($1::TEXT[])
      `, [batch.map((document) => document.url)]);
      throwIfCorpusAborted(signal);
      const admission = planCorpusDocumentAdmission(
        batch,
        existingResult.rows,
        capacityResult.rows[0]?.total_rows,
        capacityResult.rows[0]?.total_bytes,
        CORPUS_MAX_ROWS,
        CORPUS_MAX_BYTES,
      );
      const admittedBatch = admission.admittedDocuments;
      capacityDropped += admission.capacityDropped;
      if (admission.livenessOnlyUrls.length) {
        await client.query(`
          UPDATE practice_corpus_documents
          SET last_seen_at = NOW(),
              last_seen_run = COALESCE($2::BIGINT, last_seen_run),
              is_available = TRUE
          WHERE canonical_url = ANY($1::TEXT[])
          ${discoveryOnly ? "AND source_key = 'official-live-search'" : ""}
        `, [admission.livenessOnlyUrls, runId]);
        throwIfCorpusAborted(signal);
      }
      if (!admittedBatch.length) {
        if (ownsTransaction) await client.query("COMMIT");
        continue;
      }
      const result = await client.query(`
      INSERT INTO practice_corpus_documents AS current (
        external_id, source_key, canonical_url, title, summary, content, category,
        organization, published_at, published_label, modified_at, topics, source_tier,
        language, metadata_quality, metadata, content_hash, last_seen_run
      )
      SELECT
        item.external_id,
        item.source_key,
        item.canonical_url,
        item.title,
        item.summary,
        item.content,
        item.category,
        item.organization,
        NULLIF(item.published_at, '')::DATE,
        item.published_label,
        NULLIF(item.modified_at, '')::TIMESTAMPTZ,
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(item.topics)), ARRAY[]::TEXT[]),
        item.source_tier,
        item.language,
        item.metadata_quality,
        item.metadata,
        item.content_hash,
        $2
      FROM jsonb_to_recordset($1::JSONB) AS item(
        external_id TEXT,
        source_key TEXT,
        canonical_url TEXT,
        title TEXT,
        summary TEXT,
        content TEXT,
        category TEXT,
        organization TEXT,
        published_at TEXT,
        published_label TEXT,
        modified_at TEXT,
        topics JSONB,
        source_tier TEXT,
        language TEXT,
        metadata_quality SMALLINT,
        metadata JSONB,
        content_hash TEXT
      )
      ON CONFLICT (canonical_url) DO UPDATE SET
        external_id = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search'
            THEN current.external_id
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search'
            THEN EXCLUDED.external_id
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.external_id
          ELSE current.external_id
        END,
        source_key = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search'
            THEN current.source_key
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search'
            THEN EXCLUDED.source_key
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.source_key
          ELSE current.source_key
        END,
        title = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.title
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.title
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.title ELSE current.title END,
        summary = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.summary
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.summary
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.summary <> '' THEN EXCLUDED.summary ELSE current.summary END,
        content = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.content
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.content
          WHEN EXCLUDED.content <> '' THEN EXCLUDED.content ELSE current.content END,
        category = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.category
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.category
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.category <> '' THEN EXCLUDED.category ELSE current.category END,
        organization = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.organization
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.organization
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.organization <> '' THEN EXCLUDED.organization ELSE current.organization END,
        published_at = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.published_at
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.published_at
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN COALESCE(EXCLUDED.published_at, current.published_at) ELSE current.published_at END,
        published_label = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.published_label
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.published_label
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.published_label <> '' THEN EXCLUDED.published_label ELSE current.published_label END,
        modified_at = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.modified_at
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.modified_at
          ELSE GREATEST(current.modified_at, EXCLUDED.modified_at) END,
        topics = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.topics
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.topics
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND cardinality(EXCLUDED.topics) > 0 THEN EXCLUDED.topics ELSE current.topics END,
        source_tier = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.source_tier
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.source_tier
          WHEN current.source_tier = 'reviewed' OR EXCLUDED.source_tier = 'reviewed' THEN 'reviewed'
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.source_tier
          ELSE current.source_tier
        END,
        language = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.language
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.language
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.language ELSE current.language END,
        metadata_quality = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.metadata_quality
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.metadata_quality
          ELSE GREATEST(current.metadata_quality, EXCLUDED.metadata_quality) END,
        metadata = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search'
            THEN current.metadata
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search'
            THEN EXCLUDED.metadata
          WHEN EXCLUDED.source_key = 'official-live-search'
            THEN (current.metadata - 'retired_reason') || EXCLUDED.metadata
          ELSE current.metadata || EXCLUDED.metadata
        END,
        content_hash = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.content_hash
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.content_hash
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality OR EXCLUDED.content <> '' THEN EXCLUDED.content_hash ELSE current.content_hash END,
        fetched_at = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.fetched_at
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN NOW()
          WHEN EXCLUDED.content <> '' THEN NOW() ELSE current.fetched_at END,
        last_seen_at = NOW(),
        last_seen_run = EXCLUDED.last_seen_run,
        is_available = TRUE
      ${discoveryOnly ? "WHERE current.source_key = 'official-live-search'" : ""}
      RETURNING id
    `, [JSON.stringify(admittedBatch.map((document) => ({
      external_id: document.externalId,
      source_key: document.sourceKey,
      canonical_url: document.url,
      title: document.title,
      summary: document.summary,
      content: document.content,
      category: document.category,
      organization: document.organization,
      published_at: document.publishedAt || "",
      published_label: document.publishedLabel,
      modified_at: document.modifiedAt || "",
      topics: document.topics,
      source_tier: document.sourceTier,
      language: document.language,
      metadata_quality: document.quality,
      metadata: document.metadata,
      content_hash: document.contentHash,
    }))), runId]);
      throwIfCorpusAborted(signal);
      indexed += result.rowCount;
      if (ownsTransaction) await client.query("COMMIT");
    } catch (error) {
      if (ownsTransaction) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
  return { indexed, capacityDropped };
}

async function retireStaleOfficialDiscoveryDocuments(client, signal) {
  throwIfCorpusAborted(signal);
  const retired = await client.query(OFFICIAL_DISCOVERY_RETIRE_SQL, [OFFICIAL_DISCOVERY_RETENTION_HOURS]);
  throwIfCorpusAborted(signal);
  const deleted = await client.query(OFFICIAL_DISCOVERY_DELETE_SQL, [OFFICIAL_DISCOVERY_RETENTION_HOURS * 2]);
  throwIfCorpusAborted(signal);
  return { retired: Number(retired.rowCount || 0), deleted: Number(deleted.rowCount || 0) };
}

export function limitOfficialDiscoveryDocuments(
  documents = [],
  existingUrls = [],
  currentRowCount = 0,
  maximumRows = OFFICIAL_DISCOVERY_MAX_ROWS,
) {
  const existing = new Set(existingUrls.map((value) => String(value || "")));
  const safeMaximum = Math.max(0, Math.trunc(Number(maximumRows) || 0));
  let newSlots = Math.max(0, safeMaximum - Math.max(0, Math.trunc(Number(currentRowCount) || 0)));
  return documents.filter((document) => {
    if (existing.has(String(document?.url || ""))) return true;
    if (newSlots <= 0) return false;
    newSlots -= 1;
    return true;
  });
}

export function normalizeOfficialDiscoveryDocuments(rawDocuments = []) {
  return deduplicateCorpusDocuments(rawDocuments.flatMap((document) => {
    const url = canonicalOfficialDiscoveryUrl(document?.url);
    if (!url) return [];
    return [{
      sourceKey: "official-live-search",
      externalId: hash(url).slice(0, 24),
      url,
      title: document?.title,
      summary: document?.summary,
      content: document?.content,
      category: document?.type,
      organization: document?.organization,
      publishedAt: parsePortalDate(document?.published),
      publishedLabel: document?.published,
      topics: document?.tags || document?.topics || [],
      sourceTier: "official",
      quality: 4,
      metadata: { source_kind: "official-live-search", placeholder: false },
    }];
  }));
}

export async function indexOfficialDiscoveryDocuments(rawDocuments = [], { signal, retireStale = false } = {}) {
  if (!databaseEnabled()) return { status: "disabled", indexed: 0 };
  throwIfCorpusAborted(signal);
  const documents = normalizeOfficialDiscoveryDocuments(rawDocuments);
  if (!documents.length && !retireStale) return { status: "empty", indexed: 0 };
  try {
    await ensureCorpusSchema();
    const result = await withDatabaseClient(async (client) => {
      throwIfCorpusAborted(signal);
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL statement_timeout = '2000ms'");
        // Aggregate capacity is always locked first, then the narrower live
        // ceiling. This order is shared across replicas and prevents deadlocks.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('practice-corpus-retention-capacity'))");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('practice-official-discovery-capacity'))");
        const maintenance = retireStale || documents.length
          ? await retireStaleOfficialDiscoveryDocuments(client, signal)
          : { retired: 0, deleted: 0 };
        let admittedDocuments = documents;
        if (documents.length) {
          const countResult = await client.query(`
            SELECT COUNT(*)::INTEGER AS total
            FROM practice_corpus_documents
            WHERE source_key = 'official-live-search'
          `);
          const existingResult = await client.query(`
            SELECT canonical_url
            FROM practice_corpus_documents
            WHERE source_key = 'official-live-search'
              AND canonical_url = ANY($1::TEXT[])
          `, [documents.map((document) => document.url)]);
          throwIfCorpusAborted(signal);
          admittedDocuments = limitOfficialDiscoveryDocuments(
            documents,
            existingResult.rows.map((row) => row.canonical_url),
            countResult.rows[0]?.total,
            OFFICIAL_DISCOVERY_MAX_ROWS,
          );
        }
        const upsert = admittedDocuments.length
          ? await upsertDocuments(client, admittedDocuments, null, {
            signal,
            discoveryOnly: true,
            inTransaction: true,
          })
          : { indexed: 0, capacityDropped: 0 };
        throwIfCorpusAborted(signal);
        await client.query("COMMIT");
        return {
          indexed: upsert.indexed,
          capacityDropped: Math.max(0, documents.length - admittedDocuments.length)
            + upsert.capacityDropped,
          ...maintenance,
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });
    return {
      status: documents.length ? "ready" : "empty",
      indexed: Number(result?.indexed || 0),
      retired: Number(result?.retired || 0),
      deleted: Number(result?.deleted || 0),
      capacityDropped: Number(result?.capacityDropped || 0),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: "degraded", indexed: 0 };
  }
}

export function enqueueOfficialDiscoveryDocuments(documents = [], options = {}) {
  return officialDiscoveryIndexQueue.enqueue(documents, options);
}

export function scheduleOfficialDiscoveryMaintenance(options = {}) {
  return officialDiscoveryIndexQueue.scheduleMaintenance(options);
}

export function stopOfficialDiscoveryIndexing(reason) {
  return officialDiscoveryIndexQueue.stop(reason);
}

export function officialDiscoveryIndexStats() {
  return officialDiscoveryIndexQueue.stats();
}

function boundedTransportHeader(headers, name) {
  const value = typeof headers?.get === "function" ? headers.get(name) : headers?.[name];
  return String(Array.isArray(value) ? value[0] : value || "").slice(0, 240);
}

export async function fetchCorpusText(url, {
  timeoutMs = 15_000,
  retries = 2,
  accept = "text/html,application/xhtml+xml,application/xml,text/xml",
  maximumBytes = MAX_FETCH_BYTES,
  requestText = requestApprovedPublicHttpsText,
  lookupImpl,
  requestImpl,
} = {}) {
  const requestedUrl = validateApprovedPublicHttpsUrl(url, CORPUS_HTTPS_ORIGINS).toString();
  const approvedOrigins = corpusOriginsForUrl(requestedUrl);
  const byteLimit = Math.max(1_024, Math.min(
    Math.trunc(Number(maximumBytes) || MAX_FETCH_BYTES),
    MAX_FETCH_BYTES,
  ));
  const maximumRetries = Math.max(0, Math.min(Number.isFinite(Number(retries)) ? Math.trunc(Number(retries)) : 2, 3));
  let lastError;
  for (let attempt = 0; attempt <= maximumRetries; attempt += 1) {
    const controller = new AbortController();
    const boundedTimeoutMs = Math.max(250, Math.min(Number(timeoutMs) || 15_000, 30_000));
    const timer = setTimeout(() => controller.abort(), boundedTimeoutMs);
    try {
      const response = await requestText(requestedUrl, {
        approvedOrigins,
        headers: {
          Accept: accept,
          "Accept-Encoding": "identity",
          "User-Agent": "Keskkonnaportaali-praktika-corpus/1.0 (+https://praktika.arleserver.cfd)",
        },
        signal: controller.signal,
        maximumBytes: byteLimit,
        maximumRedirects: 3,
        lookupImpl,
        requestImpl,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Corpus source returned ${response.status}`);
      }
      const finalUrl = validateApprovedPublicHttpsUrl(
        response.url || requestedUrl,
        approvedOrigins,
      ).toString();
      const body = String(response.body || "");
      if (Buffer.byteLength(body, "utf8") > byteLimit) {
        throw new Error("Corpus source response is too large");
      }
      return {
        text: body,
        contentType: boundedTransportHeader(response.headers, "content-type"),
        robotsTag: boundedTransportHeader(response.headers, "x-robots-tag"),
        finalUrl,
      };
    } catch (error) {
      lastError = error;
      if (attempt < maximumRetries) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function assertPortalRobotsAllowed(url) {
  if (!portalRobotsPromise || Date.now() - portalRobotsFetchedAt >= ROBOTS_CACHE_MS) {
    portalRobotsPromise = fetchCorpusText(PORTAL_ROBOTS, {
      accept: "text/plain",
      retries: 1,
      maximumBytes: MAX_ROBOTS_BYTES,
    }).then((response) => {
      portalRobotsFetchedAt = Date.now();
      return parseRobotsTxt(response.text);
    }).catch((error) => {
      portalRobotsPromise = undefined;
      portalRobotsFetchedAt = 0;
      throw error;
    });
  }
  const rules = await portalRobotsPromise;
  if (!robotsAllowsUrl(url, rules)) {
    throw new Error("Corpus source is disallowed by robots.txt");
  }
}

function portalSearchUrl(query, page, pageSize = PORTAL_PAGE_SIZE) {
  const url = new URL(PORTAL_SEARCH);
  if (query) url.searchParams.set("search_api_fulltext", query);
  url.searchParams.set("items_per_page", String(pageSize));
  if (page > 0) url.searchParams.set("page", String(page));
  return url.toString();
}

async function fetchPortalSearchPage(query, page, pageSize = PORTAL_PAGE_SIZE) {
  const url = portalSearchUrl(query, page, pageSize);
  await assertPortalRobotsAllowed(url);
  const response = await fetchCorpusText(url);
  return parsePortalSearchPage(response.text, response.finalUrl);
}

async function crawlPortalSearch(query, onDocuments, { concurrency = 2, delayMs = 120 } = {}) {
  const first = await fetchPortalSearchPage(query, 0);
  if ((!query && first.total === 0) || (first.total > 0 && first.documents.length === 0)) {
    throw new Error("Portal search returned an incomplete first page");
  }
  if ((first.total === 0 && first.documents.length > 0) || first.documents.length > first.total) {
    throw new Error("Portal search returned an inconsistent result count");
  }
  await onDocuments(first.documents, 0);
  const orderedUrls = first.documents.map((document) => document.url);
  const seenUrls = new Set(orderedUrls);
  const pages = Math.max(1, Math.ceil(first.total / PORTAL_PAGE_SIZE));
  if (pages > MAX_PORTAL_CATALOG_PAGES) {
    throw new Error("Portal search exceeds the configured page limit");
  }
  const boundedConcurrency = Math.max(1, Math.min(Number(concurrency) || 2, 4));
  let repeatedPages = 0;
  for (let offset = 1; offset < pages; offset += boundedConcurrency) {
    const pageNumbers = [];
    for (let page = offset; page < Math.min(pages, offset + boundedConcurrency); page += 1) {
      pageNumbers.push(page);
    }
    const results = await Promise.all(pageNumbers.map((page) => fetchPortalSearchPage(query, page)));
    let stopPaging = false;
    for (const [index, result] of results.entries()) {
      if (pageNumbers[index] * PORTAL_PAGE_SIZE < first.total && result.documents.length === 0) {
        throw new Error("Portal search returned an incomplete result page");
      }
      if (orderedUrls.length + result.documents.length > MAX_PORTAL_CATALOG_TOTAL) {
        throw new Error("Portal search exceeds the configured document limit");
      }
      const pageUrls = result.documents.map((document) => document.url);
      if (pageUrls.length && pageUrls.every((url) => seenUrls.has(url))) {
        // The portal repeats result pages once it runs out of fresh content
        // (observed on the empty-query catalogue crawl). Treat the first
        // fully repeated page as end-of-results instead of failing the whole
        // sync and discarding the refresh; further pages would only repeat.
        repeatedPages += 1;
        stopPaging = true;
        break;
      }
      await onDocuments(result.documents, pageNumbers[index]);
      orderedUrls.push(...pageUrls);
      for (const url of pageUrls) seenUrls.add(url);
    }
    if (stopPaging) break;
    if (offset + boundedConcurrency < pages && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  const summary = summarizeUrlOccurrences(orderedUrls);
  return {
    total: first.total,
    pages,
    repeatedPages,
    orderedUrls: summary.occurrences,
    distinctUrls: summary.distinctUrls,
  };
}

async function crawlPortalSitemap({ delayMs = 120 } = {}) {
  const documents = [];
  const seenUrls = new Set();
  let pages = 0;
  for (let page = 1; page <= MAX_SITEMAP_PAGES; page += 1) {
    const url = `${PORTAL_SITEMAP}?page=${page}`;
    await assertPortalRobotsAllowed(url);
    const response = await fetchCorpusText(url);
    const parsedPage = parsePortalSitemapPage(response.text);
    const pageDocuments = parsedPage.documents;
    if (parsedPage.rejectedCount > 0) {
      throw new Error("Portal sitemap contains a URL outside its approved host policy");
    }
    if (pageDocuments.length === 0) {
      throw new Error("Portal sitemap returned an empty or unparseable page");
    }
    if (pageDocuments.every((document) => seenUrls.has(document.url))) {
      throw new Error("Portal sitemap repeated a complete page");
    }
    if (documents.length + pageDocuments.length > MAX_SITEMAP_PAGES * SITEMAP_PAGE_SIZE) {
      throw new Error("Portal sitemap exceeds the configured document limit");
    }
    documents.push(...pageDocuments);
    for (const document of pageDocuments) seenUrls.add(document.url);
    pages = page;
    if (pageDocuments.length < SITEMAP_PAGE_SIZE) break;
    if (page === MAX_SITEMAP_PAGES) {
      throw new Error("Portal sitemap exceeds the configured safety page limit");
    }
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { documents, pages };
}

async function wikipediaDocuments() {
  // MediaWiki limits whole-article extracts to one page per request even when
  // several titles are supplied. Fetch the small curated set separately so a
  // continuation token cannot silently drop seven of the eight references.
  const responses = await Promise.allSettled(WIKIPEDIA_TITLES.map(async (title) => {
    const url = new URL("https://et.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("prop", "extracts|info");
    url.searchParams.set("explaintext", "1");
    url.searchParams.set("exsectionformat", "plain");
    url.searchParams.set("inprop", "url");
    url.searchParams.set("redirects", "1");
    url.searchParams.set("titles", title);
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("format", "json");
    const response = await fetchCorpusText(url.toString(), { accept: "application/json", retries: 1 });
    const page = JSON.parse(response.text)?.query?.pages?.[0];
    const pageUrl = canonicalUrl(page?.fullurl || `https://et.wikipedia.org/wiki/${encodeURIComponent(page?.title || title)}`);
    if (!page || page.missing || !pageUrl || !page.extract) return null;
    return normalizeDocument({
      sourceKey: "wikipedia-et",
      externalId: String(page.pageid),
      url: pageUrl,
      title: page.title,
      summary: boundedText(page.extract, 700),
      content: boundedText(page.extract, 50_000),
      category: "Taustteadmine",
      organization: "Vikipeedia",
      topics: ["taustallikas"],
      sourceTier: "supplementary",
      quality: 2,
      metadata: { source_kind: "mediawiki-api", page_id: page.pageid },
    });
  }));
  return responses.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
}

export async function persistHydratedCorpusDocument(
  client,
  { url, title, content, contentHash, metadata, runId },
  { signal, maximumBytes = CORPUS_MAX_BYTES } = {},
) {
  const byteCeiling = Math.max(0, Math.trunc(Number(maximumBytes) || 0));
  throwIfCorpusAborted(signal);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('practice-corpus-retention-capacity'))");
    const updated = await client.query(`
      UPDATE practice_corpus_documents
      SET title = CASE WHEN $2 <> '' THEN $2 ELSE title END,
          source_key = 'official-page-hydration',
          summary = LEFT($3, 500),
          content = $3,
          topics = ARRAY[]::TEXT[],
          content_hash = $4,
          metadata = (metadata - 'robots_noindex') || $5::JSONB,
          metadata_quality = GREATEST(metadata_quality, 3),
          fetched_at = NOW(),
          last_seen_at = NOW(),
          last_seen_run = COALESCE($6::BIGINT, last_seen_run),
          is_available = TRUE
      WHERE canonical_url = $1
      RETURNING id
    `, [url, title, content, contentHash, metadata, runId]);
    throwIfCorpusAborted(signal);
    if (!updated.rowCount) {
      await client.query("COMMIT");
      return false;
    }
    // Measure the actual replacement, including the generated search vector,
    // while the shared capacity lock excludes every insert and hydration in
    // every replica. Rollback makes an over-cap update completely invisible.
    const aggregate = await client.query(`
      SELECT COALESCE(SUM(pg_column_size(document)), 0)::BIGINT AS total_bytes
      FROM practice_corpus_documents AS document
    `);
    throwIfCorpusAborted(signal);
    if (Math.max(0, Number(aggregate.rows[0]?.total_bytes) || 0) > byteCeiling) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function hydrateUrls(client, urls, runId, { limit = 0, concurrency = 3, delayMs = 100, onProgress } = {}) {
  const rawCandidates = [...new Set(urls)].filter((url) => {
    try {
      const parsed = new URL(url);
      return ["keskkonnaportaal.ee", "www.keskkonnaportaal.ee"].includes(parsed.hostname)
        && !/\.(?:pdf|xlsx?|docx?|zip|csv)$/iu.test(parsed.pathname);
    } catch {
      return false;
    }
  });
  const safeLimit = Math.max(0, Number(limit) || 0);
  if (!safeLimit || !rawCandidates.length) return { hydrated: 0, skipped: 0, errors: 0 };
  const prioritized = await client.query(`
    WITH candidates AS (
      SELECT canonical_url, position
      FROM unnest($1::TEXT[]) WITH ORDINALITY AS candidate(canonical_url, position)
    )
    SELECT document.canonical_url
    FROM practice_corpus_documents document
    JOIN candidates USING (canonical_url)
    WHERE document.is_available = TRUE OR document.metadata->>'robots_noindex' = 'true'
    ORDER BY
      CASE
        WHEN document.content = '' AND NOT (document.metadata ? 'hydration_attempted_at') THEN 0
        WHEN document.content = '' THEN 1
        ELSE 2
      END,
      CASE
        WHEN document.content = '' AND NOT (document.metadata ? 'hydration_attempted_at')
          THEN candidates.position
      END ASC NULLS LAST,
      document.fetched_at ASC,
      candidates.position ASC
    LIMIT $2
  `, [rawCandidates, safeLimit]);
  const candidates = prioritized.rows.map((row) => row.canonical_url);
  let hydrated = 0;
  let skipped = 0;
  let errors = 0;
  let databaseMutationQueue = Promise.resolve();
  const serializeDatabaseMutation = (operation) => {
    const queued = databaseMutationQueue.then(operation, operation);
    databaseMutationQueue = queued.catch(() => undefined);
    return queued;
  };
  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    const batch = candidates.slice(offset, offset + concurrency);
    const results = await Promise.allSettled(batch.map(async (url) => {
      await assertPortalRobotsAllowed(url);
      const response = await fetchCorpusText(url, { retries: 1 });
      if (!response.contentType.includes("text/html")) return false;
      // The transport may follow only approved HTTPS origins, but a same-origin
      // redirect can still name a different resource. Never promote that body
      // under the pre-redirect row's title, organization, category, or URL.
      if (!hydrationResourceMatches(url, response.finalUrl)) return false;
      const robots = pageRobotsPolicy(response.text, response.robotsTag);
      if (robots.noindex) {
        await serializeDatabaseMutation(() => client.query(`
          UPDATE practice_corpus_documents
          SET content = '', content_hash = $2, is_available = FALSE, fetched_at = NOW(),
              metadata = metadata || $3::JSONB
          WHERE canonical_url = $1
        `, [url, hash(JSON.stringify([url, "robots-noindex"])), JSON.stringify({ robots_noindex: true })]));
        return false;
      }
      const extracted = extractReadablePage(response.text, url);
      if (extracted.content.length < 80) return false;
      return serializeDatabaseMutation(() => persistHydratedCorpusDocument(client, {
        url,
        title: extracted.title,
        content: extracted.content,
        contentHash: hash(extracted.content),
        metadata: JSON.stringify({
          hydrated: true,
          source_kind: "official-page-hydration",
        }),
        runId,
      }));
    }));
    hydrated += results.filter((result) => result.status === "fulfilled" && result.value).length;
    skipped += results.filter((result) => result.status === "fulfilled" && !result.value).length;
    errors += results.filter((result) => result.status === "rejected").length;
    const notHydrated = results.flatMap((result, index) => (
      result.status === "fulfilled" && result.value ? [] : [batch[index]]
    ));
    if (notHydrated.length) {
      await client.query(`
        UPDATE practice_corpus_documents
        SET fetched_at = NOW(),
            metadata = metadata || jsonb_build_object('hydration_attempted_at', NOW())
        WHERE canonical_url = ANY($1::TEXT[])
      `, [notHydrated]);
    }
    onProgress?.({ stage: "hydrate", completed: Math.min(offset + batch.length, candidates.length), total: candidates.length, hydrated, skipped, errors });
    if (offset + concurrency < candidates.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { hydrated, skipped, errors };
}

async function saveQuerySnapshot(client, query, total, urls, {
  pageCount = Math.ceil(total / PORTAL_PAGE_SIZE),
  pageSize = PORTAL_PAGE_SIZE,
  sortOrder = "portal-default",
  querySource = "configured-seed",
} = {}) {
  const normalized = normalizeCorpusQuery(query);
  const summary = summarizeUrlOccurrences(urls);
  await client.query(`
    INSERT INTO practice_corpus_query_snapshots
      (query_hash, normalized_query, query_source, upstream_total, page_count,
       page_size, sort_order, stored_occurrence_count, distinct_url_count,
       document_urls, captured_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB, NOW())
    ON CONFLICT (query_hash) DO UPDATE SET
      normalized_query = EXCLUDED.normalized_query,
      query_source = EXCLUDED.query_source,
      upstream_total = EXCLUDED.upstream_total,
      page_count = EXCLUDED.page_count,
      page_size = EXCLUDED.page_size,
      sort_order = EXCLUDED.sort_order,
      stored_occurrence_count = EXCLUDED.stored_occurrence_count,
      distinct_url_count = EXCLUDED.distinct_url_count,
      document_urls = EXCLUDED.document_urls,
      captured_at = NOW()
  `, [
    hash(normalized),
    normalized,
    querySource,
    total,
    pageCount,
    pageSize,
    sortOrder,
    summary.occurrenceCount,
    summary.distinctCount,
    JSON.stringify(summary.occurrences),
  ]);
}

export async function syncPortalCorpus({
  mode = "full",
  hydrateLimit = 0,
  seedQueries = ["mets"],
  includeCatalog = true,
  includeWikipedia = true,
  onProgress,
} = {}) {
  await ensureCorpusSchema();
  if (!databaseEnabled()) return { status: "disabled", indexed: 0, discovered: 0, hydrated: 0, skipped: 0, errors: 0 };
  return withDatabaseClient(async (client) => {
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('practice-corpus-sync')) AS locked");
    if (!lock.rows[0]?.locked) return { status: "busy", indexed: 0, discovered: 0, hydrated: 0, skipped: 0, errors: 0 };
    let runId;
    const totals = {
      discovered: 0,
      indexed: 0,
      capacityDropped: 0,
      hydrated: 0,
      skipped: 0,
      errors: 0,
    };
    const details = {
      sitemapPages: 0,
      catalogTotal: 0,
      authoritativeCapacityDropped: 0,
      seedQueries: {},
      wikipedia: 0,
      unavailableMarked: 0,
    };
    try {
      const run = await client.query(
        "INSERT INTO practice_corpus_runs (mode, status) VALUES ($1, 'running') RETURNING id",
        [mode],
      );
      runId = run.rows[0].id;

      const sitemap = await crawlPortalSitemap();
      const sitemapDocuments = sitemap.documents;
      details.sitemapPages = sitemap.pages;
      totals.discovered += sitemapDocuments.length;
      const sitemapUpsert = await upsertDocuments(client, sitemapDocuments, runId);
      totals.indexed += sitemapUpsert.indexed;
      totals.capacityDropped += sitemapUpsert.capacityDropped;
      details.authoritativeCapacityDropped += sitemapUpsert.capacityDropped;
      onProgress?.({ stage: "sitemap", discovered: sitemapDocuments.length, indexed: totals.indexed });

      let catalogUrls = [];
      if (includeCatalog) {
        const catalog = await crawlPortalSearch("", async (documents, page) => {
          totals.discovered += documents.length;
          const catalogUpsert = await upsertDocuments(client, documents, runId);
          totals.indexed += catalogUpsert.indexed;
          totals.capacityDropped += catalogUpsert.capacityDropped;
          details.authoritativeCapacityDropped += catalogUpsert.capacityDropped;
          onProgress?.({ stage: "catalog", page: page + 1, discovered: totals.discovered, indexed: totals.indexed });
        });
        details.catalogTotal = catalog.total;
        details.catalogRepeatedPages = catalog.repeatedPages || 0;
        catalogUrls = catalog.orderedUrls;
      }

      const hydrationCandidates = [];
      for (const rawQuery of seedQueries) {
        const query = normalizeCorpusQuery(rawQuery);
        if (!query) continue;
        const snapshot = await crawlPortalSearch(query, async (documents, page) => {
          totals.discovered += documents.length;
          const seedUpsert = await upsertDocuments(client, documents, runId);
          totals.indexed += seedUpsert.indexed;
          totals.capacityDropped += seedUpsert.capacityDropped;
          onProgress?.({ stage: "seed-query", query, page: page + 1, indexed: totals.indexed });
        });
        details.seedQueries[query] = {
          total: snapshot.total,
          pages: snapshot.pages,
          repeatedPages: snapshot.repeatedPages || 0,
          storedOccurrences: snapshot.orderedUrls.length,
          distinctUrls: snapshot.distinctUrls.length,
        };
        await saveQuerySnapshot(client, query, snapshot.total, snapshot.orderedUrls, {
          pageCount: snapshot.pages,
          pageSize: PORTAL_PAGE_SIZE,
          sortOrder: "portal-default",
          querySource: "configured-seed",
        });
        hydrationCandidates.push(...snapshot.distinctUrls);
      }
      // Seed-query pages are intentionally first: the initial bounded hydration
      // immediately improves the user's primary topics, then fills from the
      // wider portal catalogue on larger/manual runs.
      hydrationCandidates.push(...catalogUrls);

      if (includeWikipedia) {
        try {
          const wikipedia = await wikipediaDocuments();
          details.wikipedia = wikipedia.length;
          totals.discovered += wikipedia.length;
          const wikipediaUpsert = await upsertDocuments(client, wikipedia, runId);
          totals.indexed += wikipediaUpsert.indexed;
          totals.capacityDropped += wikipediaUpsert.capacityDropped;
        } catch {
          totals.errors += 1;
        }
      }

      const hydration = await hydrateUrls(client, hydrationCandidates, runId, {
        limit: hydrateLimit,
        onProgress,
      });
      totals.hydrated += hydration.hydrated;
      totals.skipped += hydration.skipped;
      totals.errors += hydration.errors;
      details.hydrationSkipped = totals.skipped;

      // Only a fully completed catalogue run is authoritative enough to retire
      // disappeared portal records. Failed/partial runs never hide old data.
      if (shouldRetirePortalCatalog({
        includeCatalog,
        authoritativeCapacityDropped: details.authoritativeCapacityDropped,
      })) {
        const retired = await client.query(`
          UPDATE practice_corpus_documents
          SET is_available = FALSE
          WHERE source_key IN ('portal-sitemap', 'portal-catalog', 'official-page-hydration')
            AND (
              canonical_url LIKE 'https://keskkonnaportaal.ee/%'
              OR canonical_url LIKE 'https://www.keskkonnaportaal.ee/%'
            )
            AND last_seen_run IS DISTINCT FROM $1
            AND is_available = TRUE
        `, [runId]);
        details.unavailableMarked = retired.rowCount;
      }

      details.retention = await enforceCorpusRetention(client);

      await client.query(`
        UPDATE practice_corpus_runs
        SET status = 'ready', discovered_count = $2, indexed_count = $3,
            hydrated_count = $4, error_count = $5, details = $6::JSONB, finished_at = NOW()
        WHERE id = $1
      `, [runId, totals.discovered, totals.indexed, totals.hydrated, totals.errors, JSON.stringify(details)]);
      return { status: "ready", ...totals, details };
    } catch (error) {
      if (runId) {
        await client.query(`
          UPDATE practice_corpus_runs
          SET status = 'failed', discovered_count = $2, indexed_count = $3,
              hydrated_count = $4, error_count = $5, details = $6::JSONB, finished_at = NOW()
          WHERE id = $1
        `, [runId, totals.discovered, totals.indexed, totals.hydrated, totals.errors + 1, JSON.stringify({ ...details, error: error.message })]).catch(() => undefined);
      }
      throw error;
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('practice-corpus-sync'))").catch(() => undefined);
    }
  });
}

export function shouldRetirePortalCatalog({
  includeCatalog = false,
  authoritativeCapacityDropped = 0,
} = {}) {
  return Boolean(includeCatalog)
    && Math.max(0, Math.trunc(Number(authoritativeCapacityDropped) || 0)) === 0;
}

function formatPublished(row) {
  if (row.published_label) return row.published_label;
  if (!row.published_at) return "";
  const date = new Date(row.published_at);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("et-EE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date)
    : "";
}

export function publicSearchItem(row, includeContent = false) {
  const isFederatedDiscovery = row.source_key === "official-live-search";
  const hydrationMetadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata
    : {};
  const isValidatedPageHydration = row.source_key === "official-page-hydration"
    && hydrationMetadata.hydrated === true
    && hydrationMetadata.source_kind === "official-page-hydration"
    && boundedText(row.content, 80_000).length >= 80
    && /^[a-f0-9]{64}$/u.test(String(row.content_hash || ""));
  const fetchedAt = row.fetched_at && Number.isFinite(new Date(row.fetched_at).getTime())
    ? new Date(row.fetched_at).toISOString()
    : null;
  const item = {
    id: `corpus-${row.id}`,
    title: row.title,
    url: row.canonical_url,
    summary: row.summary || boundedText(row.content, 500),
    organization: row.organization || (row.source_tier === "supplementary" ? "Vikipeedia" : "Keskkonnaportaal"),
    type: row.category || "Veebileht",
    published: formatPublished(row),
    topics: row.topics || [],
    sourceTier: row.source_tier,
    _publishedAt: row.published_at ? new Date(row.published_at).toISOString().slice(0, 10) : null,
    _relevance: Number(row.relevance || 0),
    ...(isValidatedPageHydration ? {
      retrieval: "approved-page-hydration",
      delivery: "catalog-and-bounded-hydration",
      evidencePolicy: "versioned",
      _answerEvidenceEligible: true,
      _evidenceVersion: row.content_hash,
      _evidenceStatusAt: fetchedAt,
      freshness: {
        class: "cached-official-page",
        basis: "retrieved-at",
        maxAgeMs: APPROVED_PAGE_EVIDENCE_MAX_AGE_MS,
        requiresSourceTimestamp: true,
      },
    } : {
      retrieval: isFederatedDiscovery ? "official-federated-search" : "catalogue-directory",
      delivery: isFederatedDiscovery ? "federated-discovery" : "catalog-and-bounded-hydration",
      evidencePolicy: "route-only",
      _answerEvidenceEligible: false,
    }),
  };
  if (includeContent) {
    item.content = boundedText(row.content, 15_000);
    item._contentHash = row.content_hash || "";
  }
  return item;
}

function throwIfCorpusSearchClosed(signal, deadlineAt) {
  if (!signal?.aborted && (!Number.isFinite(deadlineAt) || Date.now() < deadlineAt)) return;
  throw signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The corpus search window closed", "AbortError");
}

async function snapshotResults(query, page, pageSize, includeContent, queryOptions) {
  throwIfCorpusSearchClosed(queryOptions?.signal, queryOptions?.deadlineAt);
  const snapshot = await databaseQuery(`
    SELECT upstream_total, stored_occurrence_count, distinct_url_count,
           document_urls, captured_at
    FROM practice_corpus_query_snapshots
    WHERE query_hash = $1 AND captured_at > NOW() - INTERVAL '72 hours'
  `, [hash(normalizeCorpusQuery(query))], queryOptions);
  throwIfCorpusSearchClosed(queryOptions?.signal, queryOptions?.deadlineAt);
  if (!snapshot?.rows[0]) return null;
  const summary = summarizeUrlOccurrences(
    Array.isArray(snapshot.rows[0].document_urls) ? snapshot.rows[0].document_urls : [],
  );
  const urls = summary.distinctUrls;
  const distinctTotal = Number(snapshot.rows[0].distinct_url_count) || urls.length;
  const selected = urls.slice((page - 1) * pageSize, page * pageSize);
  if (!selected.length) {
    return {
      status: "ready",
      mode: "portal-snapshot",
      total: Number(snapshot.rows[0].upstream_total) || urls.length,
      distinctTotal,
      page,
      pageSize,
      items: [],
      updatedAt: snapshot.rows[0].captured_at,
    };
  }
  const rows = await databaseQuery(`
    SELECT id, source_key, canonical_url, title, summary, content, organization, category,
           published_at, published_label, topics, source_tier, content_hash, fetched_at, metadata
    FROM practice_corpus_documents
    WHERE canonical_url = ANY($1::TEXT[]) AND is_available = TRUE
      AND COALESCE(metadata->>'robots_noindex', 'false') <> 'true'
      AND (
        source_key <> 'official-live-search'
        OR last_seen_at >= NOW() - make_interval(hours => ${OFFICIAL_DISCOVERY_RETENTION_HOURS})
      )
  `, [selected], queryOptions);
  throwIfCorpusSearchClosed(queryOptions?.signal, queryOptions?.deadlineAt);
  const byUrl = new Map((rows?.rows || []).map((row) => [row.canonical_url, row]));
  return {
    status: "ready",
    mode: "portal-snapshot",
    total: Number(snapshot.rows[0].upstream_total) || urls.length,
    distinctTotal,
    page,
    pageSize,
    items: selected.map((url, index) => {
      const row = byUrl.get(url);
      if (!row) return null;
      const item = publicSearchItem(row, includeContent);
      return { ...item, id: `${item.id}-snapshot-${(page - 1) * pageSize + index + 1}` };
    }).filter(Boolean),
    updatedAt: snapshot.rows[0].captured_at,
  };
}

export async function searchCorpus(query, {
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  includeContent = false,
  preferSnapshot = true,
  filters = {},
  resultOffset = null,
  excludeUrls = [],
  signal,
  deadlineAt,
} = {}) {
  const normalized = normalizeCorpusQuery(query);
  const safePage = Math.max(1, Math.min(Number(page) || 1, 500));
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
  const safeOffset = Number.isFinite(Number(resultOffset))
    ? Math.max(0, Math.min(Number(resultOffset), 1_000_000))
    : (safePage - 1) * safePageSize;
  const safeExcludedUrls = [...new Set((Array.isArray(excludeUrls) ? excludeUrls : [])
    .map((value) => String(value || "").trim())
    .filter((value) => /^https:\/\//u.test(value)))]
    .slice(0, 100);
  const appliedFilters = normalizeSearchFilters(filters);
  if (!normalized || !databaseEnabled()) {
    return {
      status: databaseEnabled() ? "empty" : "disabled",
      mode: "local-index",
      total: 0,
      page: safePage,
      pageSize: safePageSize,
      items: [],
      facets: { sources: [], categories: [], years: [] },
      appliedFilters,
    };
  }
  try {
    throwIfCorpusSearchClosed(signal, deadlineAt);
    await ensureCorpusSchema();
    throwIfCorpusSearchClosed(signal, deadlineAt);
    const queryOptions = { signal, deadlineAt };
    const hasFilters = appliedFilters.source !== "all" || appliedFilters.category || appliedFilters.year || appliedFilters.sort !== "relevance";
    if (preferSnapshot && !hasFilters) {
      const snapshot = await snapshotResults(normalized, safePage, safePageSize, includeContent, queryOptions);
      if (snapshot) {
        const pageableTotal = snapshot.distinctTotal || snapshot.total;
        return {
          ...snapshot,
          pageCount: Math.ceil(pageableTotal / safePageSize),
          hasMore: safePage * safePageSize < pageableTotal,
          facets: { sources: [], categories: [], years: [] },
          appliedFilters,
        };
      }
    }
    const prefixQuery = buildPrefixTsQuery(normalized);
    if (!prefixQuery) return {
      status: "empty",
      mode: "local-index",
      total: 0,
      page: safePage,
      pageSize: safePageSize,
      items: [],
      facets: { sources: [], categories: [], years: [] },
      appliedFilters,
    };
    const rankTerms = corpusRankingTerms(normalized);
    const sourceTiers = sourceTiersForFilter(appliedFilters.source);
    const freshnessIntent = queryNeedsFreshness(normalized);
    const orderClause = appliedFilters.sort === "newest"
      ? "relevance_bucket DESC, published_at DESC NULLS LAST, relevance DESC, id ASC"
      : "relevance DESC, published_at DESC NULLS LAST, id ASC";
    const parameters = [
      normalized,
      prefixQuery,
      rankTerms,
      sourceTiers,
      appliedFilters.category || null,
      appliedFilters.year,
      freshnessIntent,
      safePageSize,
      safeOffset,
      safeExcludedUrls,
    ];
    const [resultState, facetState] = await Promise.allSettled([databaseQuery(`
      WITH parameters AS (
        SELECT
          websearch_to_tsquery('simple', public.unaccent($1)) AS web_query,
          to_tsquery('simple', public.unaccent($2)) AS prefix_query,
          lower($1) AS raw_query,
          $3::TEXT[] AS rank_terms,
          $7::BOOLEAN AS freshness_intent
      ), ranked AS (
        SELECT document.*,
          (
            ts_rank_cd(ARRAY[0.08, 0.2, 0.6, 1.0], document.search_vector, parameters.prefix_query, 32) * 6.0
            + ts_rank_cd(ARRAY[0.08, 0.2, 0.6, 1.0], document.search_vector, parameters.web_query, 32) * 2.0
            + GREATEST(
                similarity(public.unaccent(lower(document.title)), public.unaccent(parameters.raw_query)),
                word_similarity(public.unaccent(parameters.raw_query), public.unaccent(lower(document.title)))
              ) * 4.0
            + CASE WHEN public.unaccent(lower(document.title)) LIKE '%' || public.unaccent(parameters.raw_query) || '%' THEN 3.0 ELSE 0 END
            + COALESCE((
                SELECT COUNT(*)::DOUBLE PRECISION * 2.4
                FROM unnest(parameters.rank_terms) AS term
                WHERE public.unaccent(lower(document.title)) LIKE '%' || public.unaccent(term) || '%'
              ), 0)
            + COALESCE((
                SELECT COUNT(*)::DOUBLE PRECISION * 0.9
                FROM unnest(parameters.rank_terms) AS term
                WHERE public.unaccent(lower(document.summary)) LIKE '%' || public.unaccent(term) || '%'
              ), 0)
            + CASE document.source_tier WHEN 'official' THEN 0.45 WHEN 'reviewed' THEN 0.3 WHEN 'supplementary' THEN 0.05 ELSE 0 END
            + CASE WHEN document.content <> '' THEN 0.3 ELSE 0 END
            + CASE WHEN COALESCE(document.metadata->>'placeholder', 'false') = 'true' THEN -0.75 ELSE 0 END
            + CASE
                WHEN document.published_at > CURRENT_DATE THEN -0.5
                WHEN document.published_at IS NULL THEN 0
                WHEN parameters.freshness_intent THEN GREATEST(0, 1.0 - ((CURRENT_DATE - document.published_at)::DOUBLE PRECISION / 2190.0)) * 1.6
                ELSE GREATEST(0, 1.0 - ((CURRENT_DATE - document.published_at)::DOUBLE PRECISION / 3650.0)) * 0.35
              END
          ) AS relevance
        FROM practice_corpus_documents document, parameters
        WHERE document.is_available = TRUE
          AND COALESCE(document.metadata->>'robots_noindex', 'false') <> 'true'
          AND (
            document.source_key <> 'official-live-search'
            OR document.last_seen_at >= NOW() - make_interval(hours => ${OFFICIAL_DISCOVERY_RETENTION_HOURS})
          )
          AND (cardinality($4::TEXT[]) = 0 OR document.source_tier = ANY($4::TEXT[]))
          AND ($5::TEXT IS NULL OR document.category = $5::TEXT)
          AND ($6::INTEGER IS NULL OR EXTRACT(YEAR FROM document.published_at)::INTEGER = $6::INTEGER)
          AND (
            cardinality($10::TEXT[]) = 0
            OR regexp_replace(
              regexp_replace(document.canonical_url, '^https://www[.]', 'https://'),
              '^https://keskkonnaportaal[.]ee/et(/|$)',
              'https://keskkonnaportaal.ee/'
            ) <> ALL($10::TEXT[])
          )
          AND (
            document.search_vector @@ parameters.prefix_query
            OR document.search_vector @@ parameters.web_query
            OR lower(document.title) % parameters.raw_query
            OR lower(document.title) LIKE '%' || parameters.raw_query || '%'
          )
      ), bucketed AS (
        SELECT ranked.*, FLOOR(GREATEST(relevance, 0) / 5.0) AS relevance_bucket
        FROM ranked
      )
      SELECT id, source_key, canonical_url, title, summary, content, organization, category,
             published_at, published_label, topics, source_tier, content_hash, fetched_at, metadata, relevance,
             COUNT(*) OVER()::INTEGER AS full_count
      FROM bucketed
      ORDER BY ${orderClause}
      LIMIT $8 OFFSET $9
    `, parameters, queryOptions), databaseQuery(`
      WITH parameters AS (
        SELECT
          websearch_to_tsquery('simple', public.unaccent($1)) AS web_query,
          to_tsquery('simple', public.unaccent($2)) AS prefix_query,
          lower($1) AS raw_query
      ), matched AS (
        SELECT document.source_tier, document.category, document.published_at
        FROM practice_corpus_documents document, parameters
        WHERE document.is_available = TRUE
          AND COALESCE(document.metadata->>'robots_noindex', 'false') <> 'true'
          AND (
            document.source_key <> 'official-live-search'
            OR document.last_seen_at >= NOW() - make_interval(hours => ${OFFICIAL_DISCOVERY_RETENTION_HOURS})
          )
          AND (
            document.search_vector @@ parameters.prefix_query
            OR document.search_vector @@ parameters.web_query
            OR lower(document.title) % parameters.raw_query
            OR lower(document.title) LIKE '%' || parameters.raw_query || '%'
          )
      )
      SELECT
        COALESCE((SELECT jsonb_agg(to_jsonb(item)) FROM (
          SELECT source_tier AS value, COUNT(*)::INTEGER AS count
          FROM matched GROUP BY source_tier ORDER BY count DESC, source_tier ASC
        ) item), '[]'::JSONB) AS sources,
        COALESCE((SELECT jsonb_agg(to_jsonb(item)) FROM (
          SELECT category AS value, COUNT(*)::INTEGER AS count
          FROM matched WHERE category <> '' GROUP BY category ORDER BY count DESC, category ASC LIMIT 18
        ) item), '[]'::JSONB) AS categories,
        COALESCE((SELECT jsonb_agg(to_jsonb(item)) FROM (
          SELECT EXTRACT(YEAR FROM published_at)::INTEGER AS value, COUNT(*)::INTEGER AS count
          FROM matched
          WHERE published_at IS NOT NULL AND published_at <= CURRENT_DATE
          GROUP BY EXTRACT(YEAR FROM published_at) ORDER BY value DESC LIMIT 12
        ) item), '[]'::JSONB) AS years
    `, [normalized, prefixQuery], queryOptions)]);
    // Join both parallel database operations before the request-owned corpus
    // work can settle and release its admission slot.
    throwIfCorpusSearchClosed(signal, deadlineAt);
    if (resultState.status === "rejected") throw resultState.reason;
    if (facetState.status === "rejected") throw facetState.reason;
    const result = resultState.value;
    const facetResult = facetState.value;
    const rows = result?.rows || [];
    const total = Number(rows[0]?.full_count || 0);
    const facetRow = facetResult?.rows?.[0] || {};
    return {
      status: "ready",
      mode: "local-index",
      total,
      page: safePage,
      pageSize: safePageSize,
      pageCount: Math.ceil(total / safePageSize),
      hasMore: safePage * safePageSize < total,
      items: rows.map((row) => publicSearchItem(row, includeContent)),
      facets: {
        sources: Array.isArray(facetRow.sources) ? facetRow.sources : [],
        categories: Array.isArray(facetRow.categories) ? facetRow.categories : [],
        years: Array.isArray(facetRow.years) ? facetRow.years : [],
      },
      appliedFilters,
    };
  } catch (error) {
    if (signal?.aborted || (Number.isFinite(deadlineAt) && Date.now() >= deadlineAt)
      || error?.name === "AbortError") throw error;
    return {
      status: "degraded",
      mode: "local-index",
      total: 0,
      page: safePage,
      pageSize: safePageSize,
      items: [],
      facets: { sources: [], categories: [], years: [] },
      appliedFilters,
    };
  }
}

export async function searchCorpusEvidence(query, limit = 12, { filters = {} } = {}) {
  const result = await searchCorpus(query, {
    page: 1,
    pageSize: Math.max(1, Math.min(Number(limit) || 12, 20)),
    includeContent: true,
    preferSnapshot: false,
    filters,
  });
  return {
    status: result.status,
    total: result.total,
    documents: result.items
      .filter((item) => ["official", "reviewed"].includes(item.sourceTier))
      .map((item) => ({
        ...item,
        tags: item.topics,
        retrieval: item.retrieval || "local-corpus",
      })),
  };
}

export async function livePortalSearchResults(query, { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const safePage = Math.max(1, Math.min(Number(page) || 1, 200));
  const safePageSize = [10, 25, 50].includes(Number(pageSize)) ? Number(pageSize) : 10;
  try {
    const providerQuery = minimizePublicProviderQuery(query);
    if (!providerQuery) throw new Error("Portal fallback query was rejected");
    const parsed = await fetchPortalSearchPage(normalizeCorpusQuery(providerQuery), safePage - 1, safePageSize);
    return {
      status: "degraded",
      mode: "portal-live-fallback",
      total: parsed.total,
      page: safePage,
      pageSize: safePageSize,
      pageCount: Math.ceil(parsed.total / safePageSize),
      hasMore: safePage * safePageSize < parsed.total,
      items: parsed.documents.map((document, index) => ({
        id: `live-${externalId(document.url)}-${index}`,
        title: document.title,
        url: document.url,
        summary: document.summary,
        organization: document.organization || "Keskkonnaportaal",
        type: document.category || "Veebileht",
        published: document.publishedLabel,
        topics: document.topics,
        sourceTier: document.sourceTier,
      })),
    };
  } catch {
    return { status: "unavailable", mode: "portal-live-fallback", total: 0, page: safePage, pageSize: safePageSize, pageCount: 0, hasMore: false, items: [] };
  }
}

export async function broadSearchResults(query, options = {}) {
  const local = await searchCorpus(query, options);
  if (local.status === "ready" && (local.total > 0 || local.page > 1)) return local;
  return livePortalSearchResults(query, options);
}

function snapshotAbortError(signal, message = "The corpus statistics request was aborted") {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException(message, "AbortError");
}

export function createCoalescedTtlSnapshot({
  load,
  acquireWork,
  ttlMs = 60_000,
  timeoutMs = 1_500,
  shouldCache = () => true,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof load !== "function") throw new TypeError("A snapshot loader is required");
  const safeTtlMs = Math.max(100, Math.min(Number(ttlMs) || 60_000, 5 * 60_000));
  const safeTimeoutMs = Math.max(100, Math.min(Number(timeoutMs) || 1_500, 5_000));
  let snapshot = null;
  let inflight = null;

  function startRefresh(startOptions = {}) {
    const controller = new AbortController();
    const deadlineAt = now() + safeTimeoutMs;
    const entry = {
      controller,
      deadlineAt,
      promise: null,
      settled: false,
      waiters: 0,
      timer: null,
    };
    entry.timer = setTimer(() => {
      controller.abort(new DOMException("Corpus statistics refresh timed out", "TimeoutError"));
    }, safeTimeoutMs);
    entry.timer?.unref?.();
    const loaderPromise = Promise.resolve()
      .then(async () => {
        const releaseWork = typeof acquireWork === "function"
          ? await acquireWork({
            clientKey: startOptions.clientKey,
            signal: controller.signal,
            deadlineAt,
          })
          : () => undefined;
        try {
          return await load({ signal: controller.signal, deadlineAt });
        } finally {
          releaseWork();
        }
      });
    let detachInternalAbort = () => undefined;
    const internalAbort = new Promise((_resolve, reject) => {
      const onAbort = () => reject(snapshotAbortError(
        controller.signal,
        "Corpus statistics refresh was aborted",
      ));
      detachInternalAbort = () => controller.signal.removeEventListener("abort", onAbort);
      if (controller.signal.aborted) onAbort();
      else controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    // An abort must retire the shared entry even if an underlying driver has
    // not observed the signal yet. Promise.race installs a rejection handler
    // on the loader, so a late failure remains consumed after the entry is
    // detached and a later request can create a fresh bounded attempt.
    entry.promise = Promise.race([loaderPromise, internalAbort])
      .then((value) => {
        if (!controller.signal.aborted && shouldCache(value)) {
          snapshot = { value, expiresAt: now() + safeTtlMs };
        }
        return value;
      })
      .finally(() => {
        detachInternalAbort();
        entry.settled = true;
        if (entry.timer) clearTimer(entry.timer);
        if (inflight === entry) inflight = null;
      });
    // A caller always attaches synchronously below, but retain a rejection
    // handler so a final-waiter abort cannot create an unhandled rejection.
    void entry.promise.catch(() => undefined);
    inflight = entry;
    return entry;
  }

  function waitForRefresh(entry, { signal, deadlineAt } = {}) {
    if (signal?.aborted) return Promise.reject(snapshotAbortError(signal));
    entry.waiters += 1;
    return new Promise((resolve, reject) => {
      let complete = false;
      let deadlineTimer;
      const finish = (callback, value) => {
        if (complete) return;
        complete = true;
        if (deadlineTimer) clearTimer(deadlineTimer);
        signal?.removeEventListener("abort", onAbort);
        entry.waiters = Math.max(0, entry.waiters - 1);
        if (!entry.waiters && !entry.settled && !entry.controller.signal.aborted) {
          entry.controller.abort(new DOMException("All corpus statistics clients disconnected", "AbortError"));
        }
        callback(value);
      };
      const onAbort = () => finish(reject, snapshotAbortError(signal));
      signal?.addEventListener("abort", onAbort, { once: true });
      if (Number.isFinite(deadlineAt)) {
        const remainingMs = Math.max(0, Number(deadlineAt) - now());
        if (!remainingMs) {
          finish(reject, new DOMException("Corpus statistics deadline expired", "TimeoutError"));
          return;
        }
        deadlineTimer = setTimer(
          () => finish(reject, new DOMException("Corpus statistics deadline expired", "TimeoutError")),
          remainingMs,
        );
        deadlineTimer?.unref?.();
      }
      entry.promise.then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error),
      );
    });
  }

  return {
    get(options = {}) {
      if (options.signal?.aborted) return Promise.reject(snapshotAbortError(options.signal));
      if (snapshot && snapshot.expiresAt > now()) return Promise.resolve(snapshot.value);
      return waitForRefresh(inflight || startRefresh(options), options);
    },
    clear() {
      snapshot = null;
      if (inflight && !inflight.controller.signal.aborted) {
        inflight.controller.abort(new DOMException("Corpus statistics snapshot cleared", "AbortError"));
      }
    },
    stats: () => ({
      cached: Boolean(snapshot && snapshot.expiresAt > now()),
      inflight: Boolean(inflight),
      waiters: inflight?.waiters || 0,
    }),
  };
}

async function readCorpusStats({ signal, deadlineAt } = {}) {
  if (!databaseEnabled()) return { enabled: false, status: "disabled", documents: 0, hydrated: 0 };
  try {
    if (signal?.aborted) throw snapshotAbortError(signal);
    // A public status request must never initiate DDL or migrations. Startup,
    // synchronization and indexing own corpus schema creation; if that has not
    // completed yet, the read-only queries below degrade within their deadline.
    const queryOptions = { signal, deadlineAt, ensureSearchSchema: false };
    const result = await databaseQuery(`
      SELECT
        COUNT(*)::INTEGER AS documents,
        COUNT(*) FILTER (WHERE content <> '')::INTEGER AS hydrated,
        COUNT(*) FILTER (WHERE content = '')::INTEGER AS metadata_only,
        COUNT(DISTINCT content_hash) FILTER (WHERE content <> '')::INTEGER AS distinct_content,
        COUNT(*) FILTER (WHERE metadata->>'robots_noindex' = 'true')::INTEGER AS robots_excluded,
        COUNT(*) FILTER (WHERE source_tier = 'reviewed')::INTEGER AS reviewed,
        COUNT(*) FILTER (WHERE source_tier = 'official')::INTEGER AS official,
        COUNT(*) FILTER (WHERE source_tier = 'supplementary')::INTEGER AS supplementary,
        COUNT(*) FILTER (WHERE source_tier = 'other')::INTEGER AS other,
        MAX(last_seen_at) AS indexed_at
      FROM practice_corpus_documents
      WHERE is_available = TRUE
        AND (
          source_key <> 'official-live-search'
          OR last_seen_at >= NOW() - make_interval(hours => ${OFFICIAL_DISCOVERY_RETENTION_HOURS})
        )
    `, [], queryOptions);
    const lastRun = await databaseQuery(`
      SELECT status, finished_at, details
      FROM practice_corpus_runs
      ORDER BY started_at DESC
      LIMIT 1
    `, [], queryOptions);
    const row = result.rows[0];
    return {
      enabled: true,
      status: "ready",
      documents: Number(row.documents),
      hydrated: Number(row.hydrated),
      metadataOnly: Number(row.metadata_only),
      distinctContent: Number(row.distinct_content),
      robotsExcluded: Number(row.robots_excluded),
      reviewed: Number(row.reviewed),
      official: Number(row.official),
      supplementary: Number(row.supplementary),
      other: Number(row.other),
      indexedAt: row.indexed_at,
      lastSync: lastRun.rows[0] ? {
        status: lastRun.rows[0].status,
        finishedAt: lastRun.rows[0].finished_at,
        catalogTotal: Number(lastRun.rows[0].details?.catalogTotal || 0),
        sitemapPages: Number(lastRun.rows[0].details?.sitemapPages || 0),
      } : null,
    };
  } catch {
    return { enabled: true, status: "degraded", documents: 0, hydrated: 0 };
  }
}

const corpusStatsSnapshot = createCoalescedTtlSnapshot({
  load: readCorpusStats,
  acquireWork: ({ clientKey, signal }) => corpusStatsBackendAdmission.acquire(
    clientKey,
    { signal, maximumWaitMs: 500 },
  ),
  ttlMs: 60_000,
  timeoutMs: 1_500,
  shouldCache: (value) => value?.status === "ready",
});

export async function corpusStats(options = {}) {
  if (!databaseEnabled()) return { enabled: false, status: "disabled", documents: 0, hydrated: 0 };
  try {
    return await corpusStatsSnapshot.get(options);
  } catch (error) {
    if (error?.code === "CORPUS_CAPACITY") throw error;
    return { enabled: true, status: "degraded", documents: 0, hydrated: 0 };
  }
}

export function closeCorpusStatsBackendAdmission(reason) {
  corpusStatsSnapshot.clear();
  return corpusStatsBackendAdmission.close(reason);
}

export function corpusBackfillHydrateLimit(value = process.env.CORPUS_BACKFILL_HYDRATE_LIMIT) {
  const parsed = Number(value);
  return Math.max(0, Math.min(Number.isFinite(parsed) && String(value ?? "").trim() !== "" ? parsed : 300, 1_000));
}

// Hydrates portal rows that have never been fetched, news and topic pages
// first. It records no run: persistence keeps each row's last_seen_run, so the
// next full sync's retirement pass and freshness check are unaffected.
export async function hydrateCorpusBacklog({ limit = 300 } = {}) {
  await ensureCorpusSchema();
  const safeLimit = Math.max(0, Math.trunc(Number(limit) || 0));
  if (!databaseEnabled() || !safeLimit) return { status: "disabled", hydrated: 0, skipped: 0, errors: 0 };
  return withDatabaseClient(async (client) => {
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('practice-corpus-sync')) AS locked");
    if (!lock.rows[0]?.locked) return { status: "busy", hydrated: 0, skipped: 0, errors: 0 };
    try {
      const backlog = await client.query(`
        SELECT canonical_url
        FROM practice_corpus_documents
        WHERE content = ''
          AND is_available = TRUE
          AND NOT (metadata ? 'hydration_attempted_at')
          AND source_key IN ('portal-sitemap', 'portal-catalog')
          AND (
            canonical_url LIKE 'https://keskkonnaportaal.ee/%'
            OR canonical_url LIKE 'https://www.keskkonnaportaal.ee/%'
          )
        ORDER BY
          CASE WHEN canonical_url ~ '/(uudised|teemad)/' THEN 0 ELSE 1 END,
          published_at DESC NULLS LAST,
          id DESC
        LIMIT $1
      `, [safeLimit]);
      const urls = backlog.rows.map((row) => row.canonical_url);
      const result = await hydrateUrls(client, urls, null, { limit: safeLimit });
      return { status: "ready", remainingChecked: urls.length, ...result };
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('practice-corpus-sync'))").catch(() => undefined);
    }
  });
}

export async function startCorpusSyncIfStale() {
  if (!databaseEnabled() || String(process.env.CORPUS_SYNC_ON_START ?? "true").toLocaleLowerCase("en") === "false") {
    return { status: "disabled" };
  }
  if (backgroundSyncPromise) return backgroundSyncPromise;
  backgroundSyncPromise = (async () => {
    await ensureCorpusSchema();
    const hours = Math.max(1, Math.min(Number(process.env.CORPUS_SYNC_INTERVAL_HOURS) || 24, 168));
    const recent = await databaseQuery(`
      SELECT 1 FROM practice_corpus_runs
      WHERE status = 'ready' AND finished_at > NOW() - ($1 * INTERVAL '1 hour')
      LIMIT 1
    `, [hours]);
    if (recent?.rowCount) {
      // Between full syncs, keep filling page bodies. A title-only row cannot
      // rank for words that appear only in the page text, nor serve as evidence.
      const backfill = await hydrateCorpusBacklog({ limit: corpusBackfillHydrateLimit() });
      return { status: "fresh", backfill };
    }
    const seedQueries = String(process.env.CORPUS_SEED_QUERIES || "mets")
      .split(",").map(normalizeCorpusQuery).filter(Boolean).slice(0, 5);
    return syncPortalCorpus({
      mode: "startup-incremental",
      hydrateLimit: Math.max(0, Math.min(Number(process.env.CORPUS_STARTUP_HYDRATE_LIMIT) || 200, 500)),
      seedQueries,
    });
  })().finally(() => {
    backgroundSyncPromise = undefined;
  });
  return backgroundSyncPromise;
}
