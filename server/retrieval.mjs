import { createHash } from "node:crypto";
import {
  indexOfficialDiscoveryDocuments,
  normalizeSearchFilters,
  searchCorpus,
} from "./corpus.mjs";
import { searchOfficialSites } from "./integrations.mjs";
import { isForestHarvestBalanceQuery, loadStructuredIndicatorDocuments } from "./indicators.mjs";
import {
  assessSearchQuery,
  buildDiscoveryQueries,
  containsUnsafeInstruction,
  forestEvidenceIntent,
  forestryIntentServiceDocumentIds,
  normalize,
  officialServiceCatalogueDocuments,
  queryRootVariants,
  queryTerms,
  scoreDocument,
  splitTextPassages,
  textHasQueryRoot,
} from "./search.mjs";

const PUBLIC_ITEM_FIELDS = [
  "id", "title", "url", "summary", "organization", "type", "published", "topics", "sourceTier",
];
const LIVE_INDEX_TTL_MS = 15 * 60 * 1_000;
const MAX_LIVE_INDEX_KEYS = 2_000;
const recentlyIndexedLiveUrls = new Map();
const PUBLIC_FILTER_SOURCES = new Set(["all", "trusted", "official", "reviewed", "supplementary", "other"]);
const PUBLIC_FILTER_SORTS = new Set(["relevance", "newest"]);
const CADASTRE_PATTERN = /\b\d{5}:\d{3}:\d{4}\b/u;
const CADASTRE_SERVICE_IDS = new Set(["official-cadastre-wfs", "official-forest-register-wfs"]);
const LEGACY_ANSWER_FIXTURE_IDS = new Set(["forest-overview", "forest-inventory-publication"]);
const VOLATILE_RESULT_ID = /^(?:corpus-|kkp-|vp-)/u;

function clean(value = "") {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

export function stablePublicResultId(document = {}) {
  const id = clean(document.id);
  const canonicalUrl = canonicalResultUrl(document.url);
  if (!VOLATILE_RESULT_ID.test(id) || !canonicalUrl) return id;
  return `official-${createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 16)}`;
}

export function parsePublicSearchFilters(value = {}, currentYear = new Date().getUTCFullYear()) {
  const source = clean(value.source || "all");
  const sort = clean(value.sort || "relevance");
  const category = clean(value.category || "");
  const rawYear = value.year;
  if (!PUBLIC_FILTER_SOURCES.has(source)) {
    return { ok: false, error: "Tundmatu allikafilter." };
  }
  if (!PUBLIC_FILTER_SORTS.has(sort)) {
    return { ok: false, error: "Tundmatu järjestus." };
  }
  if (category.length > 120) {
    return { ok: false, error: "Sisutüübi filter on liiga pikk." };
  }
  if (rawYear !== null && rawYear !== undefined && String(rawYear).trim() !== "") {
    const year = Number(rawYear);
    if (!Number.isInteger(year) || year < 1990 || year > currentYear + 1) {
      return { ok: false, error: `Aasta peab olema vahemikus 1990–${currentYear + 1}.` };
    }
  }
  return {
    ok: true,
    filters: normalizeSearchFilters({ source, category, year: rawYear, sort }),
  };
}

export function canonicalResultUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.hostname.startsWith("www.")) url.hostname = url.hostname.slice(4);
    if (url.hostname === "keskkonnaportaal.ee") {
      if (url.pathname === "/et") url.pathname = "/";
      else if (url.pathname.startsWith("/et/")) url.pathname = url.pathname.slice(3);
    }
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid)/iu.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString();
  } catch {
    return clean(value).toLocaleLowerCase("et");
  }
}

function normalizedTitleKey(value) {
  return normalize(value).replace(/\s+\d+$/u, "").trim();
}

function resultHost(value) {
  try {
    return new URL(canonicalResultUrl(value)).hostname;
  } catch {
    return "";
  }
}

function nearDuplicateTitle(left, right) {
  if (resultHost(left.url) !== resultHost(right.url)) return false;
  const leftTitle = normalizedTitleKey(left.title);
  const rightTitle = normalizedTitleKey(right.title);
  const leftYears = [...leftTitle.matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => match[0]);
  const rightYears = [...rightTitle.matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => match[0]);
  if (leftYears.join(",") !== rightYears.join(",")) return false;
  const leftTokens = new Set(leftTitle.split(/\s+/u).filter((token) => token.length >= 3));
  const rightTokens = new Set(rightTitle.split(/\s+/u).filter((token) => token.length >= 3));
  if (Math.min(leftTokens.size, rightTokens.size) < 5) return false;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.max(leftTokens.size, rightTokens.size) >= 0.85;
}

function identityQuality(document) {
  let score = resultPublishedAt(document) === null ? 0 : 2;
  try {
    const host = new URL(document.url).hostname.replace(/^www\./u, "");
    if (["keskkonnaagentuur.ee", "keskkonnaamet.ee", "kliimaministeerium.ee"].includes(host)) score += 4;
    else if (host === "keskkonnaportaal.ee") score += 2;
  } catch {
    // Invalid URLs are discarded before duplicate merging.
  }
  if (clean(document.summary).length >= 100) score += 1;
  return score;
}

function mergeDuplicate(current, candidate) {
  const currentPriority = Number(current?._ranking?.servicePriority) || 0;
  const candidatePriority = Number(candidate?._ranking?.servicePriority) || 0;
  const currentAnswerEligible = current?._answerEvidenceEligible !== false;
  const candidateAnswerEligible = candidate?._answerEvidenceEligible !== false;
  // A navigation-only duplicate must not displace a richer, answer-eligible
  // official directory extract for the same public URL.
  const preferred = currentAnswerEligible !== candidateAnswerEligible
    ? currentAnswerEligible ? current : candidate
    : candidatePriority !== currentPriority
      ? candidatePriority > currentPriority ? candidate : current
      : identityQuality(candidate) > identityQuality(current) ? candidate : current;
  const fallback = preferred === candidate ? current : candidate;
  const richerContent = clean(candidate.content).length > clean(current.content).length ? candidate : current;
  return {
    ...fallback,
    ...preferred,
    summary: preferred.summary || fallback.summary,
    locator: preferred.locator || fallback.locator,
    content: richerContent.content || preferred.content || fallback.content,
    _contentHash: richerContent._contentHash || preferred._contentHash || fallback._contentHash,
    _answerEvidenceEligible: preferred._answerEvidenceEligible !== false
      || fallback._answerEvidenceEligible !== false,
    topics: [...new Set([...(preferred.topics || preferred.tags || []), ...(fallback.topics || fallback.tags || [])])].slice(0, 12),
    sourceTier: preferred.sourceTier === "official" || fallback.sourceTier === "official" ? "official" : preferred.sourceTier,
    _publishedAt: preferred._publishedAt || fallback._publishedAt,
    _relevance: Math.max(Number(preferred._relevance) || 0, Number(fallback._relevance) || 0),
  };
}

export function resultPublishedAt(document) {
  const internal = clean(document?._publishedAt);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(internal)) {
    const timestamp = Date.parse(`${internal}T00:00:00Z`);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const label = clean(document?.published);
  const estonianDate = label.match(/^(\d{2})\.(\d{2})\.(\d{4})$/u);
  if (estonianDate) {
    const timestamp = Date.UTC(Number(estonianDate[3]), Number(estonianDate[2]) - 1, Number(estonianDate[1]));
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (/^(?:19|20)\d{2}$/u.test(label)) return Date.UTC(Number(label), 0, 1);
  return null;
}

function freshnessIntent(query) {
  return /\b(?:praeg\w*|hetke\w*|tana|homme|homne|ulehomme|reaalajas|uusim\w*|viimati|värske\w*|tänavu|tulevik\w*|trend\w*|muutu\w*|20(?:2[5-9]|[3-9]\d))\b/iu.test(normalize(query));
}

function authorityScore(sourceTier) {
  if (sourceTier === "official") return 1.4;
  if (sourceTier === "reviewed") return 0.9;
  if (sourceTier === "supplementary") return 0.1;
  return 0;
}

const AUXILIARY_QUERY_ROOTS = new Set([
  "muutus", "tulevik", "noor", "vanus", "tallinn", "tartu", "parnu", "parnumaa", "narva", "ida", "virumaa",
  "viljandi", "rakvere", "voru", "kuressaare", "haapsalu", "johvi",
]);

function evidenceSourceText(document = {}) {
  return [
    document.title,
    document.summary,
    document.excerpt,
    document.content,
    document.answer,
    ...(document.tags || []),
    ...(document.topics || []),
  ].filter(Boolean).join("\n");
}

function evidenceSourcePassages(document = {}) {
  const seen = new Set();
  // Prefer full text over a search-engine excerpt. The latter can begin in
  // the middle of a sentence and would make a literal deterministic fallback
  // misleading even though the complete official passage is available.
  return [document.content, document.summary, document.excerpt, document.answer]
    .filter(Boolean)
    .flatMap(splitTextPassages)
    .map(clean)
    .filter((passage) => {
      const key = normalize(passage);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function forestAreaPassageEvidence(passage = "") {
  const raw = String(passage || "");
  const text = normalize(raw);
  const measurementValue = "(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)";
  const hasForestArea = /\b(?:metsamaa\w*|metsaga\s+kaetud|metsasus\w*|metsa\s+pindala|metsade\s+pindala)\b/iu.test(raw);
  const hasMetsamaaArea = /\b(?:metsamaa\w*|metsa\s+pindala|metsade\s+pindala)\b/iu.test(raw);
  const hasMeasurement = new RegExp(`\\b${measurementValue}\\s*(?:%|protsent(?:i|ides|ides?)?|ha\\b|hektar(?:it|i)?|miljonit?\\s+hektarit?|tuhat\\s+(?:ha\\b|hektarit?))`, "iu").test(raw);
  const hasHectares = new RegExp(`\\b${measurementValue}\\s*(?:ha\\b|hektar(?:it|i)?|miljonit?\\s+hektarit?|tuhat\\s+(?:ha\\b|hektarit?))`, "iu").test(raw);
  const subsetMetric = /\b(?:elaniku\s+kohta|metsamaast|kaitse\s+all|rangelt\s+kait|mittemajandatav|majanduspiirang|okaspuu|lehtpuu|puistute\s+pindala)\b/iu.test(raw);
  const hasSmi = /\b(?:smi|statistilise\s+metsainvent)/iu.test(raw);
  const hasEstonia = /\beesti\w*\b/iu.test(text);
  return {
    satisfies: hasForestArea && hasMeasurement && !subsetMetric,
    score: (hasForestArea ? 16 : 0)
      + (hasMeasurement ? 20 : 0)
      + (hasMetsamaaArea ? 6 : 0)
      + (hasHectares ? 4 : 0)
      + (hasSmi ? 8 : 0)
      + (hasEstonia ? 4 : 0)
      - (subsetMetric ? 40 : 0),
  };
}

function uniquePassages(values = [], limit = 3) {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function requestedQueryYear(query) {
  return normalize(query).match(/\b((?:19|20)\d{2})\b/u)?.[1] || "";
}

function containsEvidenceYear(value, year) {
  if (!year) return false;
  return new RegExp(`\\b${year}\\b`, "u").test(normalize(value));
}

// Publication date is not necessarily the data year. Prefer an explicit year
// in the titled/summarised measurement or its direct passage, while retaining
// the rank-time signal when this selector receives already ranked documents.
function requestedEvidenceYearMatch(document, year, passages = []) {
  if (!year) return 0;
  const titleMatch = containsEvidenceYear(document?.title, year);
  const summaryMatch = containsEvidenceYear(document?.summary, year);
  const passageMatch = passages.some((passage) => containsEvidenceYear(passage, year));
  const contentMatch = containsEvidenceYear(document?.content, year);
  const rankingMatch = Math.max(0, Number(document?._ranking?.yearMatch) || 0);
  return Math.max(
    rankingMatch,
    (titleMatch ? 60 : 0)
      + (summaryMatch ? 40 : 0)
      + (passageMatch ? 30 : 0)
      + (contentMatch ? 8 : 0),
  );
}

function areaMeasurementKey(value = "") {
  const match = String(value || "").match(/\b(\d{1,3}(?:[\s\u00A0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(%|protsent(?:i|ides|ides?)?|ha\b|hektar(?:it|i)?|miljonit?\s+hektarit?|tuhat\s+(?:ha\b|hektarit?))/iu);
  return match ? `${match[1].replace(/[\s\u00A0]/gu, "").replace(",", ".")}:${normalize(match[2])}` : "";
}

function forestAreaEvidence(document) {
  const matches = evidenceSourcePassages(document)
    .map((passage, index) => ({ passage, index, ...forestAreaPassageEvidence(passage) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = matches[0];
  if (!best) return { satisfies: false, score: 0, passages: [] };
  const measurementKeys = new Set();
  const measurements = matches.filter((candidate) => {
    if (!candidate.satisfies) return false;
    const key = areaMeasurementKey(candidate.passage);
    if (key && measurementKeys.has(key)) return false;
    if (key) measurementKeys.add(key);
    return true;
  });
  return {
    satisfies: best.satisfies,
    score: best.score,
    passages: uniquePassages([
      ...measurements.map((candidate) => candidate.passage),
      ...matches.map((candidate) => candidate.passage),
    ], 2),
  };
}

function forestDataSourcesEvidence(document) {
  const text = evidenceSourceText(document);
  const hasSmi = /\b(?:smi|statistilise\s+metsainvent\w*)/iu.test(text);
  const hasRegister = /\bmetsaregis\w*|metsaressursi\s+arvestuse\s+riiklik/iu.test(text);
  const hasData = /\b(?:metsa|metsandus|metsainventeerimis)andm\w*|inventeerimisandm\w*/iu.test(text);
  const hasSmiRole = /\b(?:valikuuring\w*|proovitükk\w*|statistilis\w*|üleriigil\w*|riiklik\s+(?:statistiline|hinnang)|metsade\s+seisund)/iu.test(text);
  const hasRegisterRole = /\b(?:kinnistu\w*|metsaeraldis\w*|eraldis\w*|inventeerimisandm\w*|registrisse\s+koond|metsateatis\w*)/iu.test(text);
  const hasMultipleSources = /\b(?:mitmel\s+viisil|eri(?:nevate)?\s+andmeallik\w*|eri\s+allik\w*|metsaandmed\s+on\s+(?:mitme|eri))/iu.test(text);
  const accessOnlyContext = /\b(?:juurdep[aä]äsupiirang\w*|koordinaat\w*|kährik\w*|kaitstud\s+(?:liik|objekt)|salastatud\w*)/iu.test(text);
  const passages = evidenceSourcePassages(document);
  const smiPassage = passages.find((passage) => /\b(?:smi|statistilise\s+metsainvent\w*)/iu.test(passage)
    && /\b(?:valikuuring\w*|proovitükk\w*|statistilis\w*|üleriigil\w*|metsade\s+seisund)/iu.test(passage))
    || passages.find((passage) => /\b(?:smi|statistilise\s+metsainvent\w*)/iu.test(passage));
  const registerPassage = passages.find((passage) => /\bmetsaregis\w*|metsaressursi\s+arvestuse\s+riiklik/iu.test(passage)
    && /\b(?:kinnistu\w*|eraldis\w*|inventeerimisandm\w*|metsateatis\w*)/iu.test(passage))
    || passages.find((passage) => /\bmetsaregis\w*|metsaressursi\s+arvestuse\s+riiklik/iu.test(passage));
  const dataPassage = passages.find((passage) => /\b(?:mitmel\s+viisil|eri(?:nevate)?\s+andmeallik\w*|eri\s+allik\w*|metsaandmed\s+on\s+(?:mitme|eri))/iu.test(passage))
    || passages.find((passage) => /\b(?:metsa|metsandus|metsainventeerimis)andm\w*|inventeerimisandm\w*/iu.test(passage));
  const satisfies = hasSmi && hasRegister && (hasMultipleSources || (hasSmiRole && hasRegisterRole)) && !accessOnlyContext;
  return {
    satisfies,
    score: (satisfies ? 70 : 0)
      + (hasData ? 8 : 0)
      + (hasSmiRole ? 14 : 0)
      + (hasRegisterRole ? 14 : 0)
      + (hasMultipleSources ? 18 : 0)
      - (accessOnlyContext ? 80 : 0)
      + (!satisfies && hasSmi && hasData ? 4 : 0),
    passages: uniquePassages([dataPassage, smiPassage, registerPassage], 3),
  };
}

function intentEvidenceForDocument(intent, document) {
  if (intent?.kind === "forest-area") return forestAreaEvidence(document);
  if (intent?.kind === "forest-data-sources") return forestDataSourcesEvidence(document);
  return { satisfies: false, score: 0, passages: [] };
}

// This is deliberately a semantic contract rather than a prewritten answer:
// an answer is eligible only when one current result itself contains the
// quantity or both forestry data sources needed by the user’s question.
export function selectAnswerEvidence(query, documents = []) {
  const intent = forestEvidenceIntent(query);
  if (!intent) return null;
  const queryYear = requestedQueryYear(query);
  const candidates = (documents || [])
    .map((document, index) => {
      const evidence = intentEvidenceForDocument(intent, document);
      return {
        document,
        index,
        publishedAt: Number(document?._ranking?.publishedAt) || resultPublishedAt(document) || 0,
        ...evidence,
        requestedYearMatch: intent.kind === "forest-area"
          ? requestedEvidenceYearMatch(document, queryYear, evidence.passages)
          : 0,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => (intent.kind === "forest-area"
      ? (queryYear
        ? Number(right.requestedYearMatch > 0) - Number(left.requestedYearMatch > 0)
          || right.requestedYearMatch - left.requestedYearMatch
          || right.score - left.score
          || right.publishedAt - left.publishedAt
        : right.publishedAt - left.publishedAt || right.score - left.score)
      : right.score - left.score || right.publishedAt - left.publishedAt)
      || left.index - right.index);
  const direct = candidates.find((candidate) => candidate.satisfies);
  return {
    kind: intent.kind,
    strong: Boolean(direct),
    directDocumentId: direct?.document?.id || null,
    passages: direct?.passages || [],
    supportingDocumentIds: candidates
      .filter((candidate) => candidate.satisfies)
      .slice(0, 3)
      .map((candidate) => candidate.document.id),
  };
}

function fieldHasRoot(field, root) {
  return textHasQueryRoot(field, root);
}

function rootCoverage(field, roots) {
  if (!roots.length) return 0;
  return roots.filter((root) => fieldHasRoot(field, root)).length / roots.length;
}

function normalizedPassages(document) {
  return [document.summary, document.excerpt, document.content]
    .filter(Boolean)
    .flatMap(splitTextPassages)
    .map(normalize)
    .filter(Boolean);
}

function primaryPassages(document) {
  return [document.summary, document.excerpt]
    .filter(Boolean)
    .flatMap(splitTextPassages)
    .map(normalize)
    .filter(Boolean);
}

function bestPassageCoverage(document, roots) {
  const passages = normalizedPassages(document);
  return passages.reduce((best, passage) => Math.max(best, rootCoverage(passage, roots)), 0);
}

function ageIntentScore(document, roots, now) {
  if (!roots.includes("mets") || !roots.some((root) => ["noor", "vanus"].includes(root))) return 0;
  const passages = normalizedPassages(document);
  const visiblePassages = primaryPassages(document);
  const trendAsked = roots.includes("muutus") || roots.includes("kasv");
  const agePassages = passages.filter((passage) => /mets/iu.test(passage)
    && /(?:noor|vanus|vanuse|vanem)/iu.test(passage));
  const visibleAgePassages = visiblePassages.filter((passage) => /mets/iu.test(passage)
    && /(?:noor|vanus|vanuse|vanem)/iu.test(passage));
  if (!agePassages.length) return -10;
  if (!trendAsked) return visibleAgePassages.length ? 10 : 4;
  const qualifiesAsTrendEvidence = (passage) => {
    const trend = /\b(?:muut\w*|trend\w*|suuren\w*|vahen\w*|kahan\w*|lang(?:us|en|ema)\w*)\b/iu.test(passage);
    const statistical = /\b(?:osakaal\w*|pindala\w*|jaotus\w*|andm\w*|smi\w*|statist\w*|aasta(?:tel|kumn)\w*|struktuur\w*)\b/iu.test(passage);
    const directObservedChange = /\bnoor\w*\b/iu.test(passage)
      && /\b(?:suuren\w*|vahen\w*|kahan\w*|langen\w*)\b/iu.test(passage);
    return trend && (statistical || directObservedChange);
  };
  const visibleTrendEvidence = visibleAgePassages.find(qualifiesAsTrendEvidence);
  const trendEvidence = visibleTrendEvidence || agePassages.find(qualifiesAsTrendEvidence);
  if (!trendEvidence) return -14;
  const publishedAt = resultPublishedAt(document);
  const directYoungTrend = agePassages.some((passage) => /\bnoor\w*\b/iu.test(passage)
    && /\b(?:suuren\w*|vahen\w*|kahan\w*|langen\w*)\b/iu.test(passage));
  const ageYears = publishedAt !== null && publishedAt <= now
    ? (now - publishedAt) / (365.25 * 24 * 60 * 60 * 1000)
    : null;
  const recencyCeiling = directYoungTrend ? 14 : 10;
  const recency = ageYears === null ? 0 : Math.max(0, 1 - ageYears / 3) * recencyCeiling;
  return (directYoungTrend ? 24 : visibleTrendEvidence ? 16 : 8) + recency;
}

function liveServiceIntentScore(query, roots, document) {
  const current = /\b(?:praeg\w*|hetke\w*|tana|homn\w*|homm\w*|homs\w*|ulehomme|reaalajas|prognoos\w*|\w*hoiatus\w*)\b/iu
    .test(normalize(query));
  if (!current) return 0;
  if (document.id === "weather-forecast" && roots.some((root) => ["ilm", "prognoos", "hoiatus"].includes(root))) {
    return 60;
  }
  if (document.id === "kaia-service" && roots.some((root) => ["ilm", "prognoos", "hoiatus"].includes(root))) {
    return 18;
  }
  if (document.id === "air-quality-live" && roots.some((root) => ["ohk", "ohukvaliteet", "saaste"].includes(root))) {
    return 60;
  }
  return 0;
}

function serviceIntentPriority(query, roots, document) {
  const liveScore = liveServiceIntentScore(query, roots, document);
  const normalizedQuery = normalize(query);
  const requestsHistoricalYear = /\b(?:19|20)\d{2}\b/u.test(normalizedQuery);
  const requestsHistoricalObservations = requestsHistoricalYear
    || /\b(?:ajalool\w*|varasem\w*|arhiiv\w*|vanad?|endisaeg\w*)\b/u.test(normalizedQuery);
  if (isForestHarvestBalanceQuery(query)) {
    if (document.id === "forest-balance-eurostat") return 6;
    if (document.id === "forest-balance-eurostat-handbook") return 5.5;
    if (document.id === "forest-balance-kaur-methodology") return 5;
    if (document.id === "forest-balance-kaur-five-year") return 4;
  }
  if (CADASTRE_PATTERN.test(query) && CADASTRE_SERVICE_IDS.has(document.id)) return 4;
  if (liveScore >= 60) return 3;
  if (liveScore > 0) return 2;
  const requestsForestCatalogue = roots.includes("mets")
    && roots.includes("kaart")
    && roots.some((root) => root.startsWith("andmestik") || root.startsWith("valjaand"));
  if (requestsForestCatalogue && document.id === "forest-catalogue") return 4;
  if (roots.includes("jaatmekaitluskoht") && document.id === "waste-facilities-map") return 3;
  if (roots.includes("kaart")
    && roots.some((root) => ["natura", "kaitseala"].includes(root))
    && document.id === "environment-register") return 4;
  if (roots.includes("mets") && roots.includes("mootmine") && document.id === "forest-overview") return 4;
  if (roots.includes("vesi") && roots.includes("seisund") && roots.includes("seire")
    && document.id === "water-monitoring") return 4;
  if (roots.includes("kiirgus") && roots.includes("automaatjaam")
    && document.id === "radiation-monitoring") return 4;
  if (roots.includes("pm25") && roots.includes("ohukvaliteet")
    && document.id === "air-quality-live") return 4;
  if (roots.includes("kaitseala") && roots.includes("ehitamine")
    && document.id === "protected-area-construction") return 4;
  if (roots.includes("liik") && roots.some((root) => ["pusielupaik", "tegevuspiirang", "kaitstav"].includes(root))
    && document.id === "protected-nature-guidance") return 4;
  if (roots.includes("kmh") && roots.includes("ksh") && document.id === "environmental-assessment") return 4;
  if (roots.includes("kaevandus") && roots.includes("korrastamine")
    && document.id === "mined-land-restoration") return 4;
  if (roots.includes("pxweb") && document.id === "statistics-pxweb") return 4;
  if (roots.some((root) => ["wfs", "wms", "geojson", "ruumikiht"].includes(root))
    && document.id === "official-geoserver") return 4;
  if (roots.includes("avaandmed") && roots.includes("kasutusjuhend")
    && document.id === "open-data-downloader") return 4;
  if (roots.includes("avaandmed") && document.id === "open-data") return 3;
  if (roots.includes("avaandmed") && roots.includes("allalaadimine")
    && document.id === "open-data-downloader") return 2;
  if (roots.includes("api") && roots.includes("andmed")) {
    if (document.id === "official-data-services" && !roots.includes("pxweb")) return 3;
    if (["open-data", "open-data-downloader"].includes(document.id)) return 2;
  }
  if (roots.includes("keskkonnaluba") && roots.includes("taotlemine") && document.id === "environmental-permits") return 3;
  if (roots.includes("puurkaev")
    && roots.some((root) => ["register", "andmed", "pohjavesi"].includes(root))
    && document.id === "well-register") return 4;
  if (roots.includes("rehv") && roots.includes("polet") && document.id === "waste-burning-guidance") return 3;
  const requestsClimateMap = roots.includes("kliima")
    && roots.some((root) => ["kaart", "stsenaarium"].includes(root));
  if (requestsClimateMap && document.id === "climate-atlas") return 4;
  if (roots.includes("kliima") && roots.includes("sademed") && document.id === "precipitation-change") {
    return requestsClimateMap ? 2 : 3;
  }
  if (roots.includes("kliima") && roots.includes("sademed") && document.id === "climate-atlas") return 2;
  if (roots.includes("elektriauto") && roots.includes("keskkonnamoju") && document.id === "electric-vehicle-lifecycle") return 3;
  if (roots.includes("kotkas")
    && roots.some((root) => ["keskkonnaluba", "menetluse", "menetlus", "staatus"].includes(root))
    && document.id === "environmental-permits") return 3;
  if (roots.includes("kese") && roots.includes("seire") && document.id === "kese-monitoring") return 3;
  if (roots.includes("muld") && document.id === "soil-monitoring-results") return 3;
  if (roots.includes("kiirgus") && document.id === "radiation-monitoring") return 3;
  if (roots.includes("ajalooline") && roots.includes("temperatuur") && document.id === "historical-weather-data") return 3;
  if (roots.some((root) => ["vesi", "emajogi", "jogi"].includes(root))
    && roots.some((root) => ["seire", "mootmine"].includes(root))
    && requestsHistoricalObservations
    && document.id === "historical-hydrology-data") return 3;
  if (roots.includes("keskkonnamoju") && roots.includes("tuulepark")
    && document.id === "wind-farm-assessment-guide") return 3;
  if (roots.includes("keskkonnamoju") && roots.includes("kaevandus")
    && document.id === "mining-impact-guidance") return 3;
  if (roots.includes("keskkonnamoju") && document.id === "environmental-assessment") return 2;
  if (roots.includes("kasvuhoonegaas")
    && document.id === "greenhouse-gas-inventory"
    && !requestsHistoricalYear) return 3;
  if (roots.includes("ringlussevott") && document.id === "municipal-waste-recycling") return 3;
  if (roots.includes("natura") && roots.includes("ehitamine") && document.id === "protected-area-construction") return 3;
  const requestsIdaViruOilShaleGroundwater = roots.includes("pohjavesi")
    && roots.includes("ida")
    && (roots.includes("viru") || roots.includes("virumaa"))
    && roots.includes("polevkivi");
  if (requestsIdaViruOilShaleGroundwater && document.id === "ida-viru-groundwater") return 4;
  if (roots.includes("pohjavesi") && roots.includes("seisund") && document.id === "groundwater-status") {
    return requestsIdaViruOilShaleGroundwater ? 2 : 3;
  }
  if ((roots.includes("meri") || roots.includes("laanemeri"))
    && roots.includes("seisund")
    && document.id === "marine-strategy-status") return 3;
  if ((roots.includes("meri") || roots.includes("laanemeri"))
    && roots.some((root) => ["seire", "mootmine", "temperatuur", "jaaolud"].includes(root))
    && document.id === "marine-observations") return 4;
  if ((roots.includes("meri") || roots.includes("laanemeri"))
    && roots.includes("jaaolud")
    && document.id === "marine-ice-map") {
    return roots.some((root) => ["seire", "mootmine", "temperatuur"].includes(root)) ? 3 : 4;
  }
  if (roots.length === 1) {
    const primaryByTopic = {
      mets: ["forest-overview", "forest-catalogue"],
      ilm: ["weather-forecast", "weather-overview"],
      vesi: ["water-monitoring", "water-catalogue"],
      ohk: ["air-quality-live", "air-catalogue"],
      ohukvaliteet: ["air-quality-live", "air-catalogue"],
      jaat: ["waste", "waste-reporting-data"],
      prugi: ["waste", "waste-facilities-map"],
      looduskaitse: ["protected-nature-guidance", "biodiversity"],
      elurikkus: ["biodiversity", "protected-nature-guidance"],
    };
    const preferred = primaryByTopic[roots[0]] || [];
    const index = preferred.indexOf(document.id);
    if (index >= 0) return index === 0 ? 3 : 2;
  }
  return 0;
}

function documentYear(document) {
  const timestamp = resultPublishedAt(document);
  return timestamp === null ? null : new Date(timestamp).getUTCFullYear();
}

export function resultMatchesFilters(document, rawFilters = {}) {
  const filters = normalizeSearchFilters(rawFilters);
  if (filters.source === "trusted" && !["official", "reviewed"].includes(document.sourceTier)) return false;
  if (!["all", "trusted"].includes(filters.source) && document.sourceTier !== filters.source) return false;
  if (filters.category && clean(document.type) !== filters.category) return false;
  if (filters.year && documentYear(document) !== filters.year) return false;
  return true;
}

export function scoreSearchCandidate(query, document, sourceRank = 0, now = Date.now()) {
  const prepared = {
    ...document,
    tags: document.tags || document.topics || [],
  };
  const semantic = scoreDocument(prepared, query);
  const roots = queryTerms(query);
  const titleText = normalize(document.title);
  const summaryText = normalize(document.summary);
  const bodyText = normalize(document.content);
  const tagText = normalize([...(document.tags || []), ...(document.topics || [])].join(" "));
  const searchableText = `${titleText} ${summaryText} ${bodyText} ${tagText}`;
  const titleMatches = roots.filter((root) => fieldHasRoot(titleText, root)).length;
  const coveredRoots = roots.filter((root) => fieldHasRoot(searchableText, root)).length;
  const matchedRoots = roots.filter((root) => fieldHasRoot(searchableText, root));
  const coreRoots = roots.filter((root) => !AUXILIARY_QUERY_ROOTS.has(root));
  const matchedCoreRoots = coreRoots.filter((root) => matchedRoots.includes(root));
  const coreCoverage = coreRoots.length ? matchedCoreRoots.length / coreRoots.length : 1;
  const coverage = roots.length ? coveredRoots / roots.length : 0;
  const titleCoverage = rootCoverage(titleText, roots);
  const summaryCoverage = rootCoverage(summaryText, roots);
  const passageCoverage = bestPassageCoverage(document, roots);
  const specificRoots = roots.filter((root) => !["mets", "keskkond", "andmed", "muutus"].includes(root));
  const titleHasSpecificIntent = specificRoots.length === 0
    || specificRoots.some((root) => fieldHasRoot(titleText, root));
  const titleIntent = roots.length >= 2 && titleCoverage === 1
    ? 14
    : titleCoverage >= 0.66 && titleHasSpecificIntent ? 7 : 0;
  const passageIntent = roots.length >= 2 && passageCoverage === 1
    ? 15
    : passageCoverage >= 0.66 ? 3 : 0;
  const scatteredMatchPenalty = roots.length >= 2
    && titleCoverage < 0.66
    && summaryCoverage < 0.66
    && passageCoverage < 0.66
    ? 6
    : 0;
  const coverageScore = coverage * 8
    + titleMatches * 3
    + titleIntent
    + summaryCoverage * 4
    + passageIntent
    - scatteredMatchPenalty
    - (roots.length >= 2 && coverage < 0.6 ? 4 : 0)
    + (coreRoots.length >= 2 && coreCoverage === 1 ? 10 : 0)
    - (coreRoots.length >= 2 ? (1 - coreCoverage) * 10 : 0);
  const publishedAt = resultPublishedAt(document);
  const futureDated = publishedAt !== null && publishedAt > now;
  const ageYears = publishedAt === null || futureDated ? null : Math.max(0, (now - publishedAt) / (365.25 * 24 * 60 * 60 * 1000));
  const freshness = ageYears === null
    ? 0
    : Math.max(0, 1 - ageYears / (freshnessIntent(query) ? 6 : 10)) * (freshnessIntent(query) ? 1.8 : 0.4);
  const queryYear = requestedQueryYear(query);
  const titleYears = [...titleText.matchAll(/\b((?:19|20)\d{2})\b/gu)].map((match) => match[1]);
  const yearInTitle = queryYear && titleText.includes(queryYear);
  const yearInSummary = queryYear && summaryText.includes(queryYear);
  const yearInBody = queryYear && bodyText.includes(queryYear);
  const yearMatch = queryYear
    ? (yearInTitle ? 18 : 0) + (yearInSummary ? 14 : 0) + (yearInBody ? 4 : 0)
    : 0;
  const conflictingTitleYear = queryYear && titleYears.length > 0 && !titleYears.includes(queryYear) ? 12 : 0;
  const roundupPenalty = titleCoverage < 0.5 && /\b(?:nadala eelinfo|uudiskiri)\b/u.test(titleText) ? 18 : 0;
  const completeness = clean(document.content).length >= 180 ? 0.7 : clean(document.summary).length >= 100 ? 0.3 : 0;
  const upstreamSignal = Math.max(0, 1.2 - sourceRank * 0.04);
  const sqlSignal = Math.max(0, Math.min(Number(document._relevance) || 0, 8)) * 0.22;
  const liveService = liveServiceIntentScore(query, roots, document);
  const cadastreService = CADASTRE_PATTERN.test(query) && CADASTRE_SERVICE_IDS.has(document.id);
  const servicePriority = serviceIntentPriority(query, roots, document);
  const intentEvidence = intentEvidenceForDocument(forestEvidenceIntent(query), document);
  const primaryTopic = assessSearchQuery(query).topic;
  const primaryIntentMatched = !primaryTopic
    || fieldHasRoot(searchableText, primaryTopic)
    || liveService > 0;
  const score = semantic
    + coverageScore
    + ageIntentScore(document, roots, now)
    + liveService
    + (cadastreService ? 48 : 0)
    + authorityScore(document.sourceTier)
    + freshness
    + yearMatch
    + completeness
    + upstreamSignal
    + sqlSignal
    + intentEvidence.score
    - conflictingTitleYear
    - roundupPenalty
    - (futureDated ? 0.6 : 0);
  return {
    score,
    matched: primaryIntentMatched && (semantic > 0 || coveredRoots > 0 || sqlSignal > 0 || liveService > 0 || cadastreService),
    servicePriority,
    answerEvidencePriority: intentEvidence.satisfies ? 6 : 0,
    relevanceBucket: Math.floor(Math.max(score, 0) / 6),
    publishedAt: publishedAt || 0,
    futureDated,
    intentEvidence: intentEvidence.score,
    yearMatch,
  };
}

export function rankSearchCandidates(query, documents = [], { sort = "relevance", now = Date.now() } = {}) {
  return documents
    .map((document, index) => ({
      ...document,
      _ranking: scoreSearchCandidate(query, document, index, now),
    }))
    .filter((document) => document._ranking.matched && document._ranking.score > 0)
    .sort((left, right) => {
      if (sort === "newest") {
        return right._ranking.answerEvidencePriority - left._ranking.answerEvidencePriority
          || right._ranking.servicePriority - left._ranking.servicePriority
          || right._ranking.relevanceBucket - left._ranking.relevanceBucket
          || Number(left._ranking.futureDated) - Number(right._ranking.futureDated)
          || right._ranking.publishedAt - left._ranking.publishedAt
          || right._ranking.score - left._ranking.score
          || left.title.localeCompare(right.title, "et");
      }
      return right._ranking.answerEvidencePriority - left._ranking.answerEvidencePriority
        || right._ranking.servicePriority - left._ranking.servicePriority
        || right._ranking.score - left._ranking.score
        || Number(left._ranking.futureDated) - Number(right._ranking.futureDated)
        || right._ranking.publishedAt - left._ranking.publishedAt
        || left.title.localeCompare(right.title, "et");
    });
}

function rankAndDeduplicate(query, documents, options = {}) {
  const ranked = rankSearchCandidates(query, documents, options);
  return rankSearchCandidates(query, deduplicateResults(ranked), options);
}

function ensureForestryIntentCandidates(query, ranked = [], available = []) {
  const requiredIds = forestryIntentServiceDocumentIds(query);
  if (!requiredIds.length) return ranked;
  const rankedAvailable = rankSearchCandidates(query, available);
  const byId = new Map([...ranked, ...rankedAvailable].map((document) => [document.id, document]));
  const required = requiredIds.map((id) => byId.get(id)).filter(Boolean);
  if (!required.length) return ranked;

  // Lead with the single best *official* semantic proof, not merely the
  // highest general relevance score. For an unqualified forest-area question
  // selectAnswerEvidence already prefers the newest dated direct measurement;
  // for the SMI/Metsaregister comparison it prefers the strongest role-aware
  // comparison. Supplementary broad matches cannot displace that lead.
  const officialPlan = selectAnswerEvidence(
    query,
    ranked.filter((document) => document.sourceTier === "official"),
  );
  const officialLead = ranked.find((document) => document.id === officialPlan?.directDocumentId
    && document.sourceTier === "official");
  const seen = new Set();
  return [officialLead, ...required, ...ranked].filter(Boolean).filter((document) => {
    const key = canonicalResultUrl(document.url) || document.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The result list and answer draft both start here: relevance rank, canonical
// deduplication, a second rank with merged text, then the narrowly scoped
// official-forestry visibility guarantee.
export function rankPublicSearchCandidates(query, documents = [], {
  intentDocuments = [],
  ...rankingOptions
} = {}) {
  return ensureForestryIntentCandidates(
    query,
    rankAndDeduplicate(query, documents, rankingOptions),
    intentDocuments,
  );
}

export function deduplicateResults(documents = []) {
  const byUrl = new Map();
  for (const document of documents) {
    if (!document?.url || !document?.title) continue;
    const key = canonicalResultUrl(document.url);
    const current = byUrl.get(key);
    if (!current) {
      byUrl.set(key, document);
      continue;
    }
    byUrl.set(key, mergeDuplicate(current, document));
  }
  const byTitle = new Map();
  const distinct = [];
  for (const document of byUrl.values()) {
    const titleKey = normalizedTitleKey(document.title);
    if (titleKey.length < 20) {
      distinct.push(document);
      continue;
    }
    const nearDuplicateIndex = distinct.findIndex((candidate) => nearDuplicateTitle(candidate, document));
    if (nearDuplicateIndex >= 0) {
      distinct[nearDuplicateIndex] = mergeDuplicate(distinct[nearDuplicateIndex], document);
      continue;
    }
    const currentIndex = byTitle.get(titleKey);
    if (currentIndex === undefined) {
      byTitle.set(titleKey, distinct.length);
      distinct.push(document);
      continue;
    }
    const current = distinct[currentIndex];
    const currentDate = resultPublishedAt(current);
    const candidateDate = resultPublishedAt(document);
    if (currentDate !== null && candidateDate !== null && currentDate !== candidateDate) {
      distinct.push(document);
      continue;
    }
    distinct[currentIndex] = mergeDuplicate(current, document);
  }
  return distinct;
}

function mergeFacetValues(primary = [], documents = [], field) {
  const counts = new Map(primary.map((item) => [String(item.value), Number(item.count || 0)]));
  for (const document of documents) {
    const value = field(document);
    if (value === null || value === undefined || value === "") continue;
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value: /^\d{4}$/u.test(value) ? Number(value) : value, count }))
    .sort((left, right) => Number(right.count) - Number(left.count) || String(left.value).localeCompare(String(right.value), "et"));
}

function mergedFacets(localFacets = {}, liveDocuments = []) {
  return {
    sources: mergeFacetValues(localFacets.sources, liveDocuments, (document) => document.sourceTier).slice(0, 6),
    categories: mergeFacetValues(localFacets.categories, liveDocuments, (document) => document.type).slice(0, 18),
    years: mergeFacetValues(localFacets.years, liveDocuments.filter((document) => {
      const timestamp = resultPublishedAt(document);
      return timestamp !== null && timestamp <= Date.now();
    }), documentYear).sort((left, right) => Number(right.value) - Number(left.value)).slice(0, 12),
  };
}

function officialDocument(document) {
  return {
    ...document,
    topics: document.tags || [],
    sourceTier: "official",
  };
}

function remaining(deadlineAt, reserve = 0) {
  return Number.isFinite(deadlineAt) ? Math.max(0, deadlineAt - Date.now() - reserve) : 2_500;
}

function queueLiveDocumentsForIndex(documents = [], now = Date.now()) {
  for (const [url, indexedAt] of recentlyIndexedLiveUrls) {
    if (now - indexedAt >= LIVE_INDEX_TTL_MS || recentlyIndexedLiveUrls.size > MAX_LIVE_INDEX_KEYS) {
      recentlyIndexedLiveUrls.delete(url);
    }
  }
  const pending = documents.filter((document) => {
    const key = canonicalResultUrl(document.url);
    if (!key || now - Number(recentlyIndexedLiveUrls.get(key) || 0) < LIVE_INDEX_TTL_MS) return false;
    recentlyIndexedLiveUrls.set(key, now);
    return true;
  });
  if (!pending.length) return;
  void indexOfficialDiscoveryDocuments(pending).then((result) => {
    if (result?.status === "degraded") {
      for (const document of pending) recentlyIndexedLiveUrls.delete(canonicalResultUrl(document.url));
    }
  }).catch(() => {
    for (const document of pending) recentlyIndexedLiveUrls.delete(canonicalResultUrl(document.url));
  });
}

export function shouldUseLiveDiscovery(page) {
  const safePage = Math.max(1, Number(page) || 1);
  return safePage <= 500;
}

export async function prepareRankedSearchResults(query, {
  page = 1,
  pageSize = 12,
  filters = {},
  deadlineAt,
  signal,
} = {}) {
  const appliedFilters = normalizeSearchFilters(filters);
  const safePage = Math.max(1, Math.min(Number(page) || 1, 500));
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 12, 50));
  const offset = (safePage - 1) * safePageSize;
  const prefixLocalLimit = 50;
  const discoveryQueries = buildDiscoveryQueries(query, 3);
  const discoveryTimeout = Math.max(250, Math.min(2_200, remaining(deadlineAt, 12_000)));
  // Structured official datasets are compact and high-value evidence. Give them
  // a separate bounded slice: the live-site discovery reserve can intentionally
  // collapse to 250 ms under the normal 12 s end-to-end production deadline.
  const structuredTimeout = Math.max(250, Math.min(2_000, remaining(deadlineAt, 9_000)));
  const liveDiscovery = shouldUseLiveDiscovery(safePage)
    ? discoveryQueries.map((discoveryQuery) => searchOfficialSites(discoveryQuery, 6, {
      timeoutMs: discoveryTimeout,
      signal,
    }))
    : [];
  const [localResult, structuredResult, ...officialResults] = await Promise.allSettled([
    searchCorpus(query, {
      page: 1,
      pageSize: prefixLocalLimit,
      includeContent: true,
      preferSnapshot: false,
      filters: appliedFilters,
    }),
    loadStructuredIndicatorDocuments(query, {
      timeoutMs: structuredTimeout,
      signal,
    }),
    ...liveDiscovery,
  ]);
  const local = localResult.status === "fulfilled"
    ? localResult.value
    : { status: "degraded", total: 0, items: [], facets: {} };
  const live = officialResults
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value.documents || [])
    .map(officialDocument);
  const structured = structuredResult.status === "fulfilled" ? structuredResult.value : [];
  const filteredLive = live.filter((document) => resultMatchesFilters(document, appliedFilters));
  const filteredStructured = structured.filter((document) => resultMatchesFilters(document, appliedFilters));
  const directory = shouldUseLiveDiscovery(safePage)
    ? officialServiceCatalogueDocuments().filter((document) => resultMatchesFilters(document, appliedFilters))
    : [];
  queueLiveDocumentsForIndex(filteredLive);
  const rankedPrefix = rankPublicSearchCandidates(query, [...(local.items || []), ...filteredStructured, ...filteredLive, ...directory], {
    sort: appliedFilters.sort,
    intentDocuments: directory,
  });
  const localUrls = new Set((local.items || []).map((document) => canonicalResultUrl(document.url)));
  const facetExtras = rankAndDeduplicate(query, [...filteredStructured, ...filteredLive, ...directory])
    .filter((document) => !localUrls.has(canonicalResultUrl(document.url)));
  let selected = rankedPrefix.slice(offset, offset + safePageSize);
  const missing = safePageSize - selected.length;
  if (missing > 0) {
    const tailOffset = Math.max(0, offset - rankedPrefix.length);
    const tail = await searchCorpus(query, {
      page: 1,
      pageSize: missing,
      includeContent: true,
      preferSnapshot: false,
      filters: appliedFilters,
      resultOffset: tailOffset,
      excludeUrls: rankedPrefix.map((document) => canonicalResultUrl(document.url)),
    });
    selected = deduplicateResults([...selected, ...(tail.items || [])]).slice(0, safePageSize);
  }
  const total = Math.max(Number(local.total || 0), rankedPrefix.length);
  return {
    status: rankedPrefix.length || selected.length ? "ready" : local.status,
    mode: live.length ? "current-hybrid" : local.mode || "local-index",
    total,
    page: safePage,
    pageSize: safePageSize,
    pageCount: Math.ceil(total / safePageSize),
    hasMore: safePage * safePageSize < total,
    items: selected,
    facets: mergedFacets(local.facets, facetExtras),
    appliedFilters,
    updatedAt: new Date().toISOString(),
  };
}

export function publicSearchListing(listing = {}) {
  return {
    total: Number(listing.total || 0),
    page: Number(listing.page || 1),
    pageSize: Number(listing.pageSize || 12),
    pageCount: Number(listing.pageCount || 0),
    hasMore: Boolean(listing.hasMore),
    updatedAt: listing.updatedAt || undefined,
    appliedFilters: normalizeSearchFilters(listing.appliedFilters),
    facets: {
      sources: Array.isArray(listing.facets?.sources) ? listing.facets.sources.slice(0, 6) : [],
      categories: Array.isArray(listing.facets?.categories) ? listing.facets.categories.slice(0, 18) : [],
      years: Array.isArray(listing.facets?.years) ? listing.facets.years.slice(0, 12) : [],
    },
    items: (listing.items || []).map((item) => ({
      ...Object.fromEntries(PUBLIC_ITEM_FIELDS
        .filter((field) => item[field] !== undefined)
        .map((field) => [field, item[field]])),
      id: stablePublicResultId(item),
    })),
  };
}

export function evidenceDocumentsFromListing(listing = {}) {
  return (listing.items || [])
    .filter((item) => ["official", "reviewed"].includes(item.sourceTier)
      && !LEGACY_ANSWER_FIXTURE_IDS.has(item.id)
      && item._answerEvidenceEligible !== false)
    .map((item) => ({
      ...item,
      tags: item.topics || item.tags || [],
      retrieval: "ranked-search-result",
    }));
}

export function contextualRetrievalQuery(rootQuery, question, previousQuestions = []) {
  const safeFragment = (value) => {
    const fragment = clean(value).slice(0, 180);
    return fragment && !containsUnsafeInstruction(fragment) ? fragment : "";
  };
  const root = safeFragment(rootQuery);
  const followUp = safeFragment(question);
  const previous = (Array.isArray(previousQuestions) ? previousQuestions : [])
    .map(safeFragment)
    .filter(Boolean)
    .slice(-3);
  if (followUp && assessSearchQuery(followUp).kind === "answerable") return followUp;
  return [followUp, previous.at(-1), root].filter(Boolean).join(" ").slice(0, 520);
}

export function conversationContext(rootQuery, previousQuestions = []) {
  const keepSafeContext = (value) => {
    const cleaned = clean(value).slice(0, 180);
    return cleaned && assessSearchQuery(cleaned).reason !== "unsafe-instruction" ? cleaned : "";
  };
  const root = keepSafeContext(rootQuery);
  const previous = (Array.isArray(previousQuestions) ? previousQuestions : [])
    .map(keepSafeContext)
    .filter(Boolean)
    .slice(-3);
  // Retrieval itself remains short and bounded, but the answer model can use
  // more safe context to resolve a real follow-up. It is never evidence.
  return [root, ...previous].filter(Boolean).join(" → ").slice(0, 1_400);
}

export function queryHasEnvironmentContext(query) {
  return queryTerms(query).length > 0;
}
