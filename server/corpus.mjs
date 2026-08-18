import { createHash } from "node:crypto";
import { load } from "cheerio";
import {
  databaseEnabled,
  databaseQuery,
  withDatabaseClient,
} from "./database.mjs";

const PORTAL_BASE = "https://keskkonnaportaal.ee";
const PORTAL_SEARCH = `${PORTAL_BASE}/et/search`;
const PORTAL_SITEMAP = `${PORTAL_BASE}/et/sitemap.xml`;
const PORTAL_ROBOTS = `${PORTAL_BASE}/robots.txt`;
const CRAWLER_PRODUCT = "keskkonnaportaali-praktika-corpus";
const MAX_FETCH_BYTES = 4_000_000;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const PORTAL_PAGE_SIZE = 50;
const SITEMAP_PAGE_SIZE = 5_000;
const MAX_SITEMAP_PAGES = 20;
const ROBOTS_CACHE_MS = 60 * 60 * 1_000;
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
  "kik.ee",
  "www.kik.ee",
  "loodusveeb.ee",
  "www.loodusveeb.ee",
  "envir.ee",
  "www.envir.ee",
]);
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
  "täna", "tana", "homme", "homne", "ülehomme", "ulehomme", "reaalajas", "see",
  "seda", "selle", "siis", "suur", "suured", "suurus", "uusim", "uusimad", "värske", "värsked", "või", "ule", "üle", "uks", "üks",
]);
const SEARCH_FILTER_SOURCES = new Set(["all", "trusted", "official", "reviewed", "supplementary", "other"]);
let corpusSchemaPromise;
let backgroundSyncPromise;
let portalRobotsPromise;
let portalRobotsFetchedAt = 0;

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
  return cleanText(value).normalize("NFKC").toLocaleLowerCase("et").slice(0, 180);
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
  try {
    const url = new URL(value, base);
    if (url.protocol === "http:" && ["keskkonnaportaal.ee", "www.keskkonnaportaal.ee"].includes(url.hostname)) {
      url.protocol = "https:";
    }
    if (url.protocol !== "https:") return null;
    if (url.hostname === "www.keskkonnaportaal.ee") url.hostname = "keskkonnaportaal.ee";
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

function robotsPatternRegex(pattern) {
  const endAnchored = pattern.endsWith("$");
  const body = (endAnchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/gu, "\\$&")
    .replace(/\*/gu, ".*");
  return new RegExp(`^${body}${endAnchored ? "$" : ""}`, "u");
}

export function parseRobotsTxt(value = "", product = CRAWLER_PRODUCT) {
  const groups = [];
  let group;
  for (const rawLine of String(value).split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase("en");
    const directive = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!group || group.hasDirectives) {
        group = { agents: [], rules: [], hasDirectives: false };
        groups.push(group);
      }
      group.agents.push(directive.toLocaleLowerCase("en"));
      continue;
    }
    if (!group || !["allow", "disallow"].includes(key)) continue;
    group.hasDirectives = true;
    if (directive || key === "allow") {
      group.rules.push({ type: key, pattern: directive });
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
  const matches = rules
    .filter(({ pattern }) => pattern && robotsPatternRegex(pattern).test(target))
    .sort((left, right) => right.pattern.replace(/[\*$]/gu, "").length - left.pattern.replace(/[\*$]/gu, "").length
      || Number(right.type === "allow") - Number(left.type === "allow"));
  return matches.length === 0 || matches[0].type === "allow";
}

export function isApprovedCorpusRedirect(requestedValue, candidateValue) {
  try {
    const requested = new URL(requestedValue);
    const candidate = new URL(candidateValue, requested);
    const allowedHosts = new Set([requested.hostname]);
    if (["keskkonnaportaal.ee", "www.keskkonnaportaal.ee"].includes(requested.hostname)) {
      allowedHosts.add("keskkonnaportaal.ee");
      allowedHosts.add("www.keskkonnaportaal.ee");
    }
    return candidate.protocol === "https:" && allowedHosts.has(candidate.hostname);
  } catch {
    return false;
  }
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
  return `${match[3]}-${match[2]}-${match[1]}`;
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
    publishedAt: document.publishedAt || null,
    publishedLabel: boundedText(document.publishedLabel || document.publishedAt, 80),
    modifiedAt: document.modifiedAt || null,
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

export function parsePortalSearchPage(html, baseUrl = PORTAL_BASE) {
  const $ = load(String(html || ""));
  const mainText = cleanText($("main").text());
  const total = Number(mainText.match(/Tulemused otsingule\s*\((\d+)\)/iu)?.[1]
    || mainText.match(/(\d+)\s+tulemust/iu)?.[1]
    || 0);
  const documents = $(".search-results__item-wrap").map((_, element) => {
    const card = $(element);
    const link = card.find(".search-results__item > a[href]").first();
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

export function parsePortalSitemap(xml) {
  const $ = load(String(xml || ""), { xmlMode: true });
  return $("url").map((_, element) => {
    const url = canonicalUrl($(element).find("loc").text());
    if (!url) return null;
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
      return true;
    }).catch((error) => {
      corpusSchemaPromise = undefined;
      throw error;
    });
  }
  return corpusSchemaPromise;
}

async function upsertDocuments(client, rawDocuments, runId) {
  const documents = deduplicateCorpusDocuments(rawDocuments);
  let indexed = 0;
  for (let offset = 0; offset < documents.length; offset += 250) {
    const batch = documents.slice(offset, offset + 250);
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
        external_id = CASE WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.external_id ELSE current.external_id END,
        source_key = CASE WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.source_key ELSE current.source_key END,
        title = CASE WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.title ELSE current.title END,
        summary = CASE WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.summary <> '' THEN EXCLUDED.summary ELSE current.summary END,
        content = CASE WHEN EXCLUDED.content <> '' THEN EXCLUDED.content ELSE current.content END,
        category = CASE WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.category <> '' THEN EXCLUDED.category ELSE current.category END,
        organization = CASE WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.organization <> '' THEN EXCLUDED.organization ELSE current.organization END,
        published_at = CASE WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN COALESCE(EXCLUDED.published_at, current.published_at) ELSE current.published_at END,
        published_label = CASE WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.published_label <> '' THEN EXCLUDED.published_label ELSE current.published_label END,
        modified_at = GREATEST(current.modified_at, EXCLUDED.modified_at),
        topics = CASE WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND cardinality(EXCLUDED.topics) > 0 THEN EXCLUDED.topics ELSE current.topics END,
        source_tier = CASE
          WHEN current.source_tier = 'reviewed' OR EXCLUDED.source_tier = 'reviewed' THEN 'reviewed'
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.source_tier
          ELSE current.source_tier
        END,
        language = CASE WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.language ELSE current.language END,
        metadata_quality = GREATEST(current.metadata_quality, EXCLUDED.metadata_quality),
        metadata = current.metadata || EXCLUDED.metadata,
        content_hash = CASE WHEN EXCLUDED.metadata_quality >= current.metadata_quality OR EXCLUDED.content <> '' THEN EXCLUDED.content_hash ELSE current.content_hash END,
        fetched_at = CASE WHEN EXCLUDED.content <> '' THEN NOW() ELSE current.fetched_at END,
        last_seen_at = NOW(),
        last_seen_run = EXCLUDED.last_seen_run,
        is_available = TRUE
      RETURNING id
    `, [JSON.stringify(batch.map((document) => ({
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
    indexed += result.rowCount;
  }
  return indexed;
}

export async function indexOfficialDiscoveryDocuments(rawDocuments = []) {
  if (!databaseEnabled()) return { status: "disabled", indexed: 0 };
  const documents = rawDocuments.flatMap((document) => {
    let url;
    try {
      url = new URL(document.url);
    } catch {
      return [];
    }
    if (url.protocol !== "https:" || !OFFICIAL_HOSTS.has(url.hostname)) return [];
    return [{
      sourceKey: "official-live-search",
      externalId: hash(url.toString()).slice(0, 24),
      url: url.toString(),
      title: document.title,
      summary: document.summary,
      content: document.content,
      category: document.type,
      organization: document.organization,
      publishedAt: parsePortalDate(document.published),
      publishedLabel: document.published,
      topics: document.tags || document.topics || [],
      sourceTier: "official",
      quality: 4,
      metadata: { source_kind: "official-live-search", placeholder: false },
    }];
  });
  if (!documents.length) return { status: "empty", indexed: 0 };
  try {
    const indexed = await withDatabaseClient((client) => upsertDocuments(client, documents, null));
    return { status: "ready", indexed: Number(indexed || 0) };
  } catch {
    return { status: "degraded", indexed: 0 };
  }
}

async function fetchText(url, { timeoutMs = 15_000, retries = 2, accept = "text/html,application/xhtml+xml,application/xml,text/xml" } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let currentUrl = new URL(url).toString();
      let response;
      for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
        response = await fetch(currentUrl, {
          headers: {
            Accept: accept,
            "User-Agent": "Keskkonnaportaali-praktika-corpus/1.0 (+https://praktika.arleserver.cfd)",
          },
          redirect: "manual",
          signal: controller.signal,
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        const nextUrl = location ? new URL(location, currentUrl).toString() : "";
        if (!nextUrl || !isApprovedCorpusRedirect(url, nextUrl)) {
          throw new Error("Corpus source redirected outside its approved host");
        }
        if (redirectCount === 5) throw new Error("Corpus source redirected too many times");
        currentUrl = nextUrl;
      }
      if (!response.ok) throw new Error(`Corpus source returned ${response.status}`);
      if (!isApprovedCorpusRedirect(url, currentUrl)) {
        throw new Error("Corpus source redirected outside its approved host");
      }
      const size = Number(response.headers.get("content-length") || 0);
      if (size > MAX_FETCH_BYTES) throw new Error("Corpus source is too large");
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.byteLength > MAX_FETCH_BYTES) throw new Error("Corpus source is too large");
      return {
        text: new TextDecoder().decode(buffer),
        contentType: String(response.headers.get("content-type") || ""),
        robotsTag: String(response.headers.get("x-robots-tag") || ""),
        finalUrl: currentUrl,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function assertPortalRobotsAllowed(url) {
  if (!portalRobotsPromise || Date.now() - portalRobotsFetchedAt >= ROBOTS_CACHE_MS) {
    portalRobotsPromise = fetchText(PORTAL_ROBOTS, {
      accept: "text/plain",
      retries: 1,
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
  const response = await fetchText(url);
  return parsePortalSearchPage(response.text, response.finalUrl);
}

async function crawlPortalSearch(query, onDocuments, { concurrency = 2, delayMs = 120 } = {}) {
  const first = await fetchPortalSearchPage(query, 0);
  if ((!query && first.total === 0) || (first.total > 0 && first.documents.length === 0)) {
    throw new Error("Portal search returned an incomplete first page");
  }
  await onDocuments(first.documents, 0);
  const orderedUrls = first.documents.map((document) => document.url);
  const pages = Math.max(1, Math.ceil(first.total / PORTAL_PAGE_SIZE));
  const remaining = Array.from({ length: Math.max(0, pages - 1) }, (_, index) => index + 1);
  for (let offset = 0; offset < remaining.length; offset += concurrency) {
    const pageNumbers = remaining.slice(offset, offset + concurrency);
    const results = await Promise.all(pageNumbers.map((page) => fetchPortalSearchPage(query, page)));
    for (const [index, result] of results.entries()) {
      if (pageNumbers[index] * PORTAL_PAGE_SIZE < first.total && result.documents.length === 0) {
        throw new Error("Portal search returned an incomplete result page");
      }
      await onDocuments(result.documents, pageNumbers[index]);
      orderedUrls.push(...result.documents.map((document) => document.url));
    }
    if (offset + concurrency < remaining.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  const summary = summarizeUrlOccurrences(orderedUrls);
  return {
    total: first.total,
    pages,
    orderedUrls: summary.occurrences,
    distinctUrls: summary.distinctUrls,
  };
}

async function crawlPortalSitemap({ delayMs = 120 } = {}) {
  const documents = [];
  let pages = 0;
  for (let page = 1; page <= MAX_SITEMAP_PAGES; page += 1) {
    const url = `${PORTAL_SITEMAP}?page=${page}`;
    await assertPortalRobotsAllowed(url);
    const response = await fetchText(url);
    const pageDocuments = parsePortalSitemap(response.text);
    if (pageDocuments.length === 0) {
      throw new Error("Portal sitemap returned an empty or unparseable page");
    }
    documents.push(...pageDocuments);
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
    const response = await fetchText(url.toString(), { accept: "application/json", retries: 1 });
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
  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    const batch = candidates.slice(offset, offset + concurrency);
    const results = await Promise.allSettled(batch.map(async (url) => {
      await assertPortalRobotsAllowed(url);
      const response = await fetchText(url, { retries: 1 });
      if (!response.contentType.includes("text/html")) return false;
      const robots = pageRobotsPolicy(response.text, response.robotsTag);
      if (robots.noindex) {
        await client.query(`
          UPDATE practice_corpus_documents
          SET content = '', content_hash = $2, is_available = FALSE, fetched_at = NOW(),
              metadata = metadata || $3::JSONB
          WHERE canonical_url = $1
        `, [url, hash(JSON.stringify([url, "robots-noindex"])), JSON.stringify({ robots_noindex: true })]);
        return false;
      }
      const extracted = extractReadablePage(response.text, url);
      if (extracted.content.length < 80) return false;
      await client.query(`
        UPDATE practice_corpus_documents
        SET title = CASE WHEN metadata_quality <= 1 AND $2 <> '' THEN $2 ELSE title END,
            content = $3,
            content_hash = $4,
            metadata = (metadata - 'robots_noindex') || $5::JSONB,
            metadata_quality = GREATEST(metadata_quality, 3),
            fetched_at = NOW(),
            last_seen_at = NOW(),
            last_seen_run = $6,
            is_available = TRUE
        WHERE canonical_url = $1
      `, [url, extracted.title, extracted.content, hash(extracted.content), JSON.stringify({ hydrated: true }), runId]);
      return true;
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
    const totals = { discovered: 0, indexed: 0, hydrated: 0, skipped: 0, errors: 0 };
    const details = {
      sitemapPages: 0,
      catalogTotal: 0,
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
      totals.indexed += await upsertDocuments(client, sitemapDocuments, runId);
      onProgress?.({ stage: "sitemap", discovered: sitemapDocuments.length, indexed: totals.indexed });

      let catalogUrls = [];
      if (includeCatalog) {
        const catalog = await crawlPortalSearch("", async (documents, page) => {
          totals.discovered += documents.length;
          totals.indexed += await upsertDocuments(client, documents, runId);
          onProgress?.({ stage: "catalog", page: page + 1, discovered: totals.discovered, indexed: totals.indexed });
        });
        details.catalogTotal = catalog.total;
        catalogUrls = catalog.orderedUrls;
      }

      const hydrationCandidates = [];
      for (const rawQuery of seedQueries) {
        const query = normalizeCorpusQuery(rawQuery);
        if (!query) continue;
        const snapshot = await crawlPortalSearch(query, async (documents, page) => {
          totals.discovered += documents.length;
          totals.indexed += await upsertDocuments(client, documents, runId);
          onProgress?.({ stage: "seed-query", query, page: page + 1, indexed: totals.indexed });
        });
        details.seedQueries[query] = {
          total: snapshot.total,
          pages: snapshot.pages,
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
          totals.indexed += await upsertDocuments(client, wikipedia, runId);
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
      if (includeCatalog) {
        const retired = await client.query(`
          UPDATE practice_corpus_documents
          SET is_available = FALSE
          WHERE source_key IN ('portal-sitemap', 'portal-catalog')
            AND (
              canonical_url LIKE 'https://keskkonnaportaal.ee/%'
              OR canonical_url LIKE 'https://www.keskkonnaportaal.ee/%'
            )
            AND last_seen_run IS DISTINCT FROM $1
            AND is_available = TRUE
        `, [runId]);
        details.unavailableMarked = retired.rowCount;
      }

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

function formatPublished(row) {
  if (row.published_label) return row.published_label;
  if (!row.published_at) return "";
  const date = new Date(row.published_at);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("et-EE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date)
    : "";
}

function publicSearchItem(row, includeContent = false) {
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
  };
  if (includeContent) item.content = boundedText(row.content, 15_000);
  return item;
}

async function snapshotResults(query, page, pageSize, includeContent) {
  const snapshot = await databaseQuery(`
    SELECT upstream_total, stored_occurrence_count, distinct_url_count,
           document_urls, captured_at
    FROM practice_corpus_query_snapshots
    WHERE query_hash = $1 AND captured_at > NOW() - INTERVAL '72 hours'
  `, [hash(normalizeCorpusQuery(query))]);
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
    SELECT id, canonical_url, title, summary, content, organization, category,
           published_at, published_label, topics, source_tier
    FROM practice_corpus_documents
    WHERE canonical_url = ANY($1::TEXT[]) AND is_available = TRUE
      AND COALESCE(metadata->>'robots_noindex', 'false') <> 'true'
  `, [selected]);
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
    await ensureCorpusSchema();
    const hasFilters = appliedFilters.source !== "all" || appliedFilters.category || appliedFilters.year || appliedFilters.sort !== "relevance";
    if (preferSnapshot && !hasFilters) {
      const snapshot = await snapshotResults(normalized, safePage, safePageSize, includeContent);
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
    const [result, facetResult] = await Promise.all([databaseQuery(`
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
      SELECT id, canonical_url, title, summary, content, organization, category,
             published_at, published_label, topics, source_tier, relevance,
             COUNT(*) OVER()::INTEGER AS full_count
      FROM bucketed
      ORDER BY ${orderClause}
      LIMIT $8 OFFSET $9
    `, parameters), databaseQuery(`
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
    `, [normalized, prefixQuery])]);
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
  } catch {
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
        retrieval: "local-corpus",
      })),
  };
}

export async function livePortalSearchResults(query, { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const safePage = Math.max(1, Math.min(Number(page) || 1, 200));
  const safePageSize = [10, 25, 50].includes(Number(pageSize)) ? Number(pageSize) : 10;
  try {
    const parsed = await fetchPortalSearchPage(normalizeCorpusQuery(query), safePage - 1, safePageSize);
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

export async function corpusStats() {
  if (!databaseEnabled()) return { enabled: false, status: "disabled", documents: 0, hydrated: 0 };
  try {
    await ensureCorpusSchema();
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
    `);
    const lastRun = await databaseQuery(`
      SELECT status, finished_at, details
      FROM practice_corpus_runs
      ORDER BY started_at DESC
      LIMIT 1
    `);
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
    if (recent?.rowCount) return { status: "fresh" };
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
