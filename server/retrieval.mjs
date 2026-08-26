import { createHash } from "node:crypto";
import { isClimateDailyMeanQuery } from "./climate.mjs";
import { isEelisEmajogiPublicWatercourseQuery, isEelisNaturaSiteQuery } from "./eelis.mjs";
import {
  enqueueOfficialDiscoveryDocuments,
  normalizeSearchFilters,
  searchCorpus,
} from "./corpus.mjs";
import { searchOfficialSites } from "./integrations.mjs";
import {
  FOREST_BALANCE_EUROSTAT_API_URL,
  isForestHarvestBalanceQuery,
  isLatestPublishedHydrologyQuery,
  loadStructuredIndicatorDocuments,
  validatedForestBalanceProjection,
} from "./indicators.mjs";
import {
  analyzePublicSearchQuery,
  assessSearchQuery,
  buildDiscoveryQueries,
  canonicalizePublicSearchQuery,
  containsPrivatePersonLookup,
  containsUnsafeInstruction,
  directDirectoryDocumentIds,
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
import {
  sourceCanSupportPublicCitation,
  sourceEvidenceEligibility,
  sourceSupportsRouteClass,
} from "./source-registry.mjs";
import {
  classifyForestryGeographyScope,
  hasUnresolvedForestryAreaEntity,
  requestsUnsupportedForestAreaBreakdown,
  requestsUnsupportedForestAreaTimeSeries,
  requestsUnsupportedForestAreaUnit,
} from "./municipalities.mjs";
import {
  isStatisticsHazardousWasteQuery,
  isStatisticsTotalWasteRecoveryQuery,
  isStatisticsWastewaterBht7Query,
  isStatisticsWaterAbstractionQuery,
} from "./statistics.mjs";

const PUBLIC_ITEM_FIELDS = [
  "id", "title", "url", "summary", "locator", "organization", "type", "published", "topics", "sourceTier",
];
const PUBLIC_FILTER_SOURCES = new Set(["all", "trusted", "official", "reviewed", "supplementary", "other"]);
const PUBLIC_FILTER_SORTS = new Set(["relevance", "newest"]);
const CADASTRE_PATTERN = /\b\d{5}:\d{3}:\d{4}\b/u;
const CADASTRE_SERVICE_IDS = new Set(["official-cadastre-wfs", "official-forest-register-wfs"]);
const LEGACY_ANSWER_FIXTURE_IDS = new Set(["forest-overview", "forest-inventory-publication"]);
const VOLATILE_RESULT_ID = /^(?:corpus-|kkp-|vp-)/u;
const EXPLICIT_ANSWER_EVIDENCE_POLICIES = new Set(["claim-specific", "timestamped", "versioned"]);
const NAVIGATION_PRIORITY_ROUTE_CLASSES = new Set([
  "official_live_weather",
  "official_live_air",
  "official_live_water",
  "official_data_or_api",
  "official_spatial_or_register",
  "official_guidance",
  "official_legal_context",
  "official_environmental_assessment",
]);

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
    // Ordinary page anchors are display state and should deduplicate. A PDF
    // page fragment identifies the exact cited evidence location, however;
    // collapsing page 22 and page 35 lets one page's body inherit the other
    // page's public URL during merge/cache binding.
    const pdfPage = pdfPageNumber(url);
    url.hash = pdfPage === null ? "" : `#page=${pdfPage}`;
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

function pdfPageNumber(value) {
  try {
    const url = value instanceof URL ? value : new URL(value);
    if (!/\.pdf$/iu.test(url.pathname)) return null;
    const match = url.hash.slice(1).match(/(?:^|[&?])page=(\d{1,5})(?=&|$)/iu);
    if (!match) return null;
    const page = Number(match[1]);
    return Number.isInteger(page) && page > 0 ? page : null;
  } catch {
    return null;
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

function distinctPdfPageLocations(left, right) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    const leftPage = pdfPageNumber(leftUrl);
    const rightPage = pdfPageNumber(rightUrl);
    if (leftPage === null || rightPage === null || leftPage === rightPage) return false;
    leftUrl.hash = "";
    rightUrl.hash = "";
    return canonicalResultUrl(leftUrl.toString()) === canonicalResultUrl(rightUrl.toString());
  } catch {
    return false;
  }
}

function nearDuplicateTitle(left, right) {
  // Two citations to different pages of one PDF are distinct evidence
  // locations even when their titles and publication dates are identical.
  if (distinctPdfPageLocations(left.url, right.url)) return false;
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

function hasIndependentEvidenceCapability(document) {
  return document?._answerEvidenceEligible === true
    && EXPLICIT_ANSWER_EVIDENCE_POLICIES.has(clean(document.evidencePolicy))
    && sourceEvidenceEligibility(document).eligible;
}

function isExplicitNavigationAlias(document) {
  return clean(document?.evidencePolicy) === "route-only"
    && document?._answerEvidenceEligible === false;
}

function hasValidatedForestBalanceProjection(document) {
  const contentHash = clean(document?._contentHash);
  const exactDataset = [document?.url, document?.locator]
    .some((value) => canonicalResultUrl(value) === canonicalResultUrl(FOREST_BALANCE_EUROSTAT_API_URL));
  return document?.id === "forest-balance-eurostat"
    && ["official-eurostat-json", "reviewed-official-eurostat-snapshot"].includes(clean(document?.retrieval))
    && hasIndependentEvidenceCapability(document)
    && exactDataset
    && /^[a-f0-9]{64}$/u.test(contentHash)
    && contentHash === clean(document?._evidenceVersion)
    && Boolean(validatedForestBalanceProjection(document));
}

const ADAPTER_BOUND_PROJECTION_FIELDS = new Map([
  ["statistics-water-abstraction-2024", "_statisticsWaterAbstraction"],
  ["statistics-wastewater-bht7-2024", "_statisticsWastewaterBht7"],
  ["statistics-hazardous-waste-2024", "_statisticsHazardousWaste"],
  ["statistics-total-waste-recovery", "_statisticsTotalWasteRecovery"],
]);

function hasAdapterBoundStructuredProjection(document) {
  const projectionField = ADAPTER_BOUND_PROJECTION_FIELDS.get(document?.id);
  return Boolean(projectionField)
    && clean(document?.retrieval) === "official-structured-statistics-pxweb"
    && hasIndependentEvidenceCapability(document)
    && document?.[projectionField]
    && typeof document[projectionField] === "object"
    && !Array.isArray(document[projectionField])
    && /^[a-f0-9]{64}$/u.test(clean(document?._contentHash));
}

function retainedForestBalanceFields(document) {
  const projection = hasValidatedForestBalanceProjection(document)
    ? validatedForestBalanceProjection(document)
    : null;
  return {
    _forestBalance: projection ? structuredClone(projection) : undefined,
    _forestBalanceHash: projection ? document._forestBalanceHash : undefined,
  };
}

function mergeDuplicate(current, candidate) {
  const currentPriority = Number(current?._ranking?.servicePriority) || 0;
  const candidatePriority = Number(candidate?._ranking?.servicePriority) || 0;
  const currentAnswerEligible = hasIndependentEvidenceCapability(current);
  const candidateAnswerEligible = hasIndependentEvidenceCapability(candidate);
  const structuredCandidates = [current, candidate].filter((document) => (
    hasValidatedForestBalanceProjection(document) || hasAdapterBoundStructuredProjection(document)
  ));
  const structuredPreferred = structuredCandidates.length === 1 ? structuredCandidates[0] : null;
  // Prefer the richer display identity. Evidence eligibility is merged
  // separately and fail-closed below, so a route-only alias can never be
  // upgraded merely because the same landing URL arrived through discovery.
  const preferred = structuredPreferred || (currentAnswerEligible !== candidateAnswerEligible
    ? currentAnswerEligible ? current : candidate
    : candidatePriority !== currentPriority
      ? candidatePriority > currentPriority ? candidate : current
      : identityQuality(candidate) > identityQuality(current) ? candidate : current);
  const fallback = preferred === candidate ? current : candidate;
  const sameCanonicalUrl = canonicalResultUrl(current.url) === canonicalResultUrl(candidate.url);
  // A similar title is a display-level duplicate, not proof that both records
  // have the same provenance. Keep the winning URL, summary and evidence text
  // atomic so content from page B can never be cited as page A. Field-level
  // enrichment is allowed only for true canonical-URL aliases.
  if (!sameCanonicalUrl) {
    return {
      ...preferred,
      ...retainedForestBalanceFields(preferred),
      _relevance: Math.max(Number(preferred._relevance) || 0, Number(fallback._relevance) || 0),
    };
  }
  const evidenceBodyLength = (document) => [document.summary, document.excerpt, document.content, document.answer]
    .reduce((total, value) => total + clean(value).length, 0);
  // Only an alias that independently passes the evidence boundary may supply
  // the retained answer body. Otherwise a rich missing-policy search card
  // could borrow a thin alias's capability at the same canonical URL.
  const capableEvidence = [current, candidate].filter(hasIndependentEvidenceCapability);
  const evidenceCandidates = structuredCandidates.length
    ? structuredCandidates
    : capableEvidence.length ? capableEvidence : [current, candidate];
  const richerEvidence = evidenceCandidates.reduce((best, document) => (
    evidenceBodyLength(document) > evidenceBodyLength(best) ? document : best
  ), evidenceCandidates.includes(preferred) ? preferred : evidenceCandidates[0]);
  // Every alias must independently be eligible. Missing, unknown, stale or
  // route-only provenance makes the merged canonical result navigation-only.
  const evidencePolicies = [
    currentAnswerEligible ? clean(current.evidencePolicy) : "route-only",
    candidateAnswerEligible ? clean(candidate.evidencePolicy) : "route-only",
  ];
  const onlyNavigationAliasesAreIneligible = [current, candidate]
    .every((document) => hasIndependentEvidenceCapability(document) || isExplicitNavigationAlias(document));
  const preserveValidatedEvidence = capableEvidence.length > 0 && onlyNavigationAliasesAreIneligible;
  const mergedEvidencePolicy = preserveValidatedEvidence
    ? clean(richerEvidence.evidencePolicy)
    : evidencePolicies.includes("route-only")
    ? "route-only"
    : evidencePolicies.includes("timestamped")
      ? "timestamped"
      : evidencePolicies.includes("versioned")
        ? "versioned"
        : evidencePolicies[0];
  return {
    ...fallback,
    ...preferred,
    // Evidence text and its timestamp/version provenance must come from the
    // same record. Mixing a richer old body with a fresh alias timestamp can
    // otherwise make stale content appear current after deduplication.
    summary: richerEvidence.summary,
    excerpt: richerEvidence.excerpt,
    content: richerEvidence.content,
    answer: richerEvidence.answer,
    locator: richerEvidence.locator || preferred.locator || fallback.locator,
    published: richerEvidence.published,
    _publishedAt: richerEvidence._publishedAt,
    _contentHash: richerEvidence._contentHash,
    _evidenceObservedAt: richerEvidence._evidenceObservedAt,
    _evidenceValidFrom: richerEvidence._evidenceValidFrom,
    _evidenceValidUntil: richerEvidence._evidenceValidUntil,
    _evidenceVersion: richerEvidence._evidenceVersion,
    _evidenceStatusAt: richerEvidence._evidenceStatusAt,
    freshness: richerEvidence.freshness,
    // Retrieval and delivery are evidence-policy inputs too. Assign them
    // atomically with the retained body: an absent delivery field on a vetted
    // structured source must clear a federated-discovery alias value inherited
    // through the fallback spread above.
    retrieval: richerEvidence.retrieval,
    delivery: richerEvidence.delivery,
    // Spreads above can inherit an invalid structured projection from either
    // alias. Assign this field explicitly so a failed version/schema check
    // removes it instead of letting another alias confer eligibility on it.
    ...retainedForestBalanceFields(richerEvidence),
    evidencePolicy: mergedEvidencePolicy,
    _answerEvidenceEligible: preserveValidatedEvidence
      || (currentAnswerEligible
        && candidateAnswerEligible
        && mergedEvidencePolicy !== "route-only"),
    // If an explicitly route-only card shares this URL, it may remain useful
    // for discovery but none of its title/body/tag vocabulary may become
    // answer evidence. The independently validated record stays atomic.
    topics: preserveValidatedEvidence
      ? [...new Set(richerEvidence.topics || richerEvidence.tags || [])].slice(0, 12)
      : [...new Set([...(preferred.topics || preferred.tags || []), ...(fallback.topics || fallback.tags || [])])].slice(0, 12),
    tags: preserveValidatedEvidence
      ? [...new Set(richerEvidence.tags || richerEvidence.topics || [])].slice(0, 12)
      : [...new Set([...(preferred.tags || preferred.topics || []), ...(fallback.tags || fallback.topics || [])])].slice(0, 12),
    sourceTier: preferred.sourceTier === "official" || fallback.sourceTier === "official" ? "official" : preferred.sourceTier,
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

function measurementPassagesContainRequestedYear(passages = [], year = "") {
  return !year || passages.some((passage) => containsEvidenceYear(passage, year));
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

function forestDepletionEvidence(document) {
  const passages = evidenceSourcePassages(document);
  const statusPassage = passages.find((passage) => {
    const text = normalize(passage);
    const hasForestStock = /\b(?:kasvava\s+metsa\s+tagavara|metsa\s+tagavara|metsavaru)\w*/u.test(text);
    const hasMeasuredDirection = /\b(?:stabiil\w*|pusi\w*|suuren\w*|vahen\w*|kahan\w*|lang\w*)\b/u.test(text);
    return hasForestStock && hasMeasuredDirection;
  });
  const area = forestAreaEvidence(document);
  const contextPassage = passages.find((passage) => {
    const text = normalize(passage);
    const dimensions = [
      /\bpindala\w*/u,
      /\btagavara\w*/u,
      /\bvanus\w*|vanuselis\w*/u,
      /\bkahjust\w*/u,
      /\belurikk\w*/u,
      /\bkaits\w*/u,
      /\bkliima\w*|risk\w*/u,
    ].filter((pattern) => pattern.test(text)).length;
    return /\bmets\w*/u.test(text) && dimensions >= 3;
  });
  const roles = [
    statusPassage ? "status" : null,
    area.satisfies ? "area" : null,
    contextPassage ? "context" : null,
  ].filter(Boolean);
  return {
    satisfies: roles.length > 0,
    score: (statusPassage ? 100 : 0)
      + (area.satisfies ? 70 : 0)
      + (contextPassage ? 55 : 0),
    passages: uniquePassages([
      statusPassage,
      ...(area.passages || []),
      contextPassage,
    ].filter(Boolean), 3),
    roles,
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

function genericForestryEvidence(intent, document) {
  const requiredIds = new Set(intent?.serviceDocumentIds || []);
  const groups = Array.isArray(intent?.evidenceGroups) ? intent.evidenceGroups : [];
  if (!requiredIds.has(document?.id) || !groups.length) {
    return { satisfies: false, score: 0, passages: [], roles: [], matchedGroupIndexes: [] };
  }
  const passages = evidenceSourcePassages(document);
  const normalizedGroups = groups.map((group) => (group || []).map(normalize).filter(Boolean));
  const passageMatches = passages.map((passage) => {
    const text = normalize(passage);
    const matchedGroupIndexes = normalizedGroups
      .map((alternatives, index) => alternatives.some((alternative) => text.includes(alternative)) ? index : -1)
      .filter((index) => index >= 0);
    return { passage, matchedGroupIndexes };
  });
  const matchedGroupIndexes = [...new Set(passageMatches.flatMap((item) => item.matchedGroupIndexes))];
  const uncoveredGroups = new Set(matchedGroupIndexes);
  const selectedMatches = [];
  // The increment explanation has several short, separately verifiable
  // method steps. Preserve them instead of stopping after the first four
  // passages and silently omitting how the two methods differ.
  const maximumSelectedPassages = intent?.kind === "increment-method" ? 7 : 4;
  while (uncoveredGroups.size && selectedMatches.length < maximumSelectedPassages) {
    const next = passageMatches
      .map((item, index) => ({
        item,
        index,
        adds: item.matchedGroupIndexes.filter((groupIndex) => uncoveredGroups.has(groupIndex)).length,
      }))
      .filter((candidate) => candidate.adds > 0 && !selectedMatches.includes(candidate.item))
      .sort((left, right) => right.adds - left.adds
        || right.item.matchedGroupIndexes.length - left.item.matchedGroupIndexes.length
        || left.index - right.index)[0];
    if (!next) break;
    selectedMatches.push(next.item);
    for (const groupIndex of next.item.matchedGroupIndexes) uncoveredGroups.delete(groupIndex);
  }
  // Greedy coverage chooses the smallest useful passage set, but the public
  // explanation must still read in the order used by the reviewed source.
  const selectedPassages = selectedMatches
    .sort((left, right) => passageMatches.indexOf(left) - passageMatches.indexOf(right))
    .map((item) => item.passage);
  const coverage = matchedGroupIndexes.length / Math.max(1, normalizedGroups.length);
  return {
    satisfies: matchedGroupIndexes.length === normalizedGroups.length,
    score: matchedGroupIndexes.length * 32 + coverage * 40 + (matchedGroupIndexes.length ? 18 : 0),
    passages: selectedPassages,
    roles: [],
    matchedGroupIndexes,
  };
}

function intentEvidenceForDocument(intent, document) {
  if (intent?.kind === "forest-area") return forestAreaEvidence(document);
  if (intent?.kind === "forest-depletion") return forestDepletionEvidence(document);
  if (intent?.kind === "forest-data-sources") return forestDataSourcesEvidence(document);
  return genericForestryEvidence(intent, document);
}

// This is deliberately a semantic contract rather than a prewritten answer:
// an answer is eligible only when one current result itself contains the
// quantity or both forestry data sources needed by the user’s question.
export function selectAnswerEvidence(query, documents = []) {
  // Privacy is normally enforced before retrieval. Recheck it here so a
  // future caller cannot obtain claim-bearing evidence for a named person's
  // property or ownership association by invoking the planner directly.
  if (containsPrivatePersonLookup(query)) return null;
  const intent = forestEvidenceIntent(query);
  if (!intent) return null;
  const numericForestAreaIntent = ["forest-area", "forest-covered-area"].includes(intent.kind);
  const geographyScope = classifyForestryGeographyScope(query);
  const unresolvedAreaEntity = hasUnresolvedForestryAreaEntity(query);
  const unsupportedAreaBreakdown = numericForestAreaIntent
    && requestsUnsupportedForestAreaBreakdown(query);
  const unsupportedAreaTimeSeries = numericForestAreaIntent
    && requestsUnsupportedForestAreaTimeSeries(query);
  const unsupportedAreaUnit = numericForestAreaIntent
    && requestsUnsupportedForestAreaUnit(query);
  const queryBoundGeography = [
    "reviewed-municipality",
    "unknown-locality",
    "estonian-region",
    "foreign-or-other-region",
  ].includes(geographyScope.kind) || unresolvedAreaEntity;
  // Defense in depth: routing should mark every local/regional request as
  // query-bound, but evidence selection independently recomputes geography.
  // Thus a future routing regression still cannot bind Estonia-wide SMI prose
  // to a county, municipality, foreign country or unresolved locality.
  if (intent.requiresQueryBoundObservation
    || queryBoundGeography
    || unsupportedAreaBreakdown
    || unsupportedAreaTimeSeries
    || unsupportedAreaUnit) {
    const unsupportedClaimScope = unsupportedAreaBreakdown
      || unsupportedAreaTimeSeries
      || unsupportedAreaUnit;
    const navigationDocumentIds = unsupportedClaimScope
      ? []
      : (documents || [])
        .filter((document) => intent.serviceDocumentIds.includes(document?.id))
        .map((document) => document.id);
    const municipalGeography = ["reviewed-municipality", "unknown-locality"].includes(geographyScope.kind)
      || intent.kind === "municipality-forest-area";
    return {
      kind: intent.kind,
      strong: false,
      evidenceGroups: intent.evidenceGroups.map((group) => [...group]),
      directDocumentId: null,
      passages: [],
      supportingDocumentIds: [],
      passagesByDocument: {},
      navigationDocumentIds: [...new Set(navigationDocumentIds)],
      evidenceRoles: null,
      reason: unsupportedAreaBreakdown
        ? "requested-breakdown-required"
        : unsupportedAreaTimeSeries
          ? "requested-time-series-required"
          : unsupportedAreaUnit
            ? "requested-unit-conversion-required"
        : municipalGeography
          ? "local-observation-required"
          : "regional-observation-required",
      missingEvidenceGroups: [],
      missingEvidenceRequirements: [unsupportedAreaBreakdown
        ? "query-bound-category-year-unit-value"
        : unsupportedAreaTimeSeries
          ? "query-bound-time-series-year-unit-value"
          : unsupportedAreaUnit
            ? "validated-unit-conversion"
        : municipalGeography
          ? "query-bound-locality-year-unit-value"
          : "query-bound-geography-year-unit-value"],
    };
  }
  if (!["forest-area", "forest-covered-area", "forest-depletion", "forest-data-sources"].includes(intent.kind)) {
    const candidates = (documents || [])
      .map((document, index) => ({ document, index, ...genericForestryEvidence(intent, document) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const requiredGroupCount = intent.evidenceGroups?.length || 0;
    const uncovered = new Set(Array.from({ length: requiredGroupCount }, (_value, index) => index));
    const supporting = [];
    while (uncovered.size) {
      const next = candidates
        .filter((candidate) => !supporting.includes(candidate))
        .map((candidate) => ({
          candidate,
          adds: candidate.matchedGroupIndexes.filter((index) => uncovered.has(index)).length,
        }))
        .sort((left, right) => right.adds - left.adds
          || right.candidate.score - left.candidate.score
          || left.candidate.index - right.candidate.index)[0];
      if (!next?.adds) break;
      supporting.push(next.candidate);
      for (const index of next.candidate.matchedGroupIndexes) uncovered.delete(index);
    }
    const minimumSupportingDocuments = Math.max(1, Number(intent.minimumSupportingDocuments) || 1);
    for (const candidate of candidates) {
      if (supporting.length >= minimumSupportingDocuments) break;
      if (!supporting.includes(candidate)) supporting.push(candidate);
    }
    const strong = !intent.requiresQueryBoundObservation
      && requiredGroupCount > 0
      && uncovered.size === 0
      && supporting.length >= minimumSupportingDocuments;
    const direct = supporting[0] || candidates[0] || null;
    return {
      kind: intent.kind,
      strong,
      evidenceGroups: intent.evidenceGroups.map((group) => [...group]),
      directDocumentId: direct?.document?.id || null,
      passages: direct?.passages || [],
      supportingDocumentIds: supporting.map((candidate) => candidate.document.id),
      passagesByDocument: Object.fromEntries(supporting.map((candidate) => [
        candidate.document.id,
        candidate.passages,
      ])),
      evidenceRoles: null,
      missingEvidenceGroups: [...uncovered],
      missingEvidenceRequirements: intent.requiresQueryBoundObservation
        ? ["query-bound-locality-year-unit"]
        : [],
    };
  }
  const queryYear = requestedQueryYear(query);
  const candidates = (documents || [])
    .map((document, index) => {
      const evidence = intentEvidenceForDocument(intent, document);
      return {
        document,
        index,
        publishedAt: Number(document?._ranking?.publishedAt) || resultPublishedAt(document) || 0,
        ...evidence,
        requestedYearMatch: numericForestAreaIntent
          ? requestedEvidenceYearMatch(document, queryYear, evidence.passages)
          : 0,
        requestedYearClaimMatch: numericForestAreaIntent
          ? measurementPassagesContainRequestedYear(evidence.passages, queryYear)
          : true,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => (numericForestAreaIntent
      ? (queryYear
        ? Number(right.requestedYearMatch > 0) - Number(left.requestedYearMatch > 0)
          || right.requestedYearMatch - left.requestedYearMatch
          || right.score - left.score
          || right.publishedAt - left.publishedAt
        : right.publishedAt - left.publishedAt || right.score - left.score)
      : right.score - left.score || right.publishedAt - left.publishedAt)
      || left.index - right.index);
  const depletionStatusId = intent.kind === "forest-depletion"
    ? candidates.find((candidate) => candidate.roles?.includes("status"))?.document?.id || null
    : null;
  const depletionAreaId = intent.kind === "forest-depletion"
    ? candidates.find((candidate) => candidate.roles?.includes("area"))?.document?.id || null
    : null;
  const depletionContextId = intent.kind === "forest-depletion"
    ? candidates.find((candidate) => candidate.roles?.includes("context")
      && ![depletionStatusId, depletionAreaId].includes(candidate.document.id))?.document?.id || null
    : null;
  const evidenceRoles = intent.kind === "forest-depletion" ? {
    status: depletionStatusId,
    area: depletionAreaId,
    context: depletionContextId,
  } : null;
  const direct = intent.kind === "forest-depletion"
    ? candidates.find((candidate) => candidate.document.id === evidenceRoles.status)
    : candidates.find((candidate) => candidate.satisfies
      && (!numericForestAreaIntent || candidate.requestedYearClaimMatch));
  const strong = intent.kind === "forest-depletion"
    ? Boolean(direct
      && evidenceRoles.area
      && evidenceRoles.context
      && new Set(Object.values(evidenceRoles).filter(Boolean)).size >= 2)
    : Boolean(direct);
  const supportingDocumentIds = intent.kind === "forest-depletion"
    ? [...new Set(Object.values(evidenceRoles).filter(Boolean))]
    : candidates
      .filter((candidate) => candidate.satisfies
        && (!numericForestAreaIntent || candidate.requestedYearClaimMatch))
      .slice(0, 3)
      .map((candidate) => candidate.document.id);
  return {
    kind: intent.kind,
    strong,
    directDocumentId: direct?.document?.id || null,
    passages: direct?.passages || [],
    supportingDocumentIds,
    passagesByDocument: Object.fromEntries(supportingDocumentIds.map((documentId) => [
      documentId,
      candidates.find((candidate) => candidate.document.id === documentId)?.passages || [],
    ])),
    evidenceRoles,
    reason: numericForestAreaIntent && queryYear && !direct
      ? "requested-year-evidence-required"
      : undefined,
    missingEvidenceRequirements: numericForestAreaIntent && queryYear && !direct
      ? ["query-bound-year-unit-value"]
      : [],
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

function liveServiceIntentScore(query, roots, document, analysis = analyzePublicSearchQuery(query)) {
  if (analysis.candidateRouteClasses.includes("official_live_weather")
    && ["weather-forecast", "weather-warnings", "current-weather-observations"].includes(document.id)) {
    return 60;
  }
  if (analysis.candidateRouteClasses.includes("official_live_weather") && document.id === "kaia-service") {
    return 18;
  }
  if (analysis.candidateRouteClasses.includes("official_live_air") && document.id === "air-quality-live") {
    return 60;
  }
  if (analysis.candidateRouteClasses.includes("official_live_water")) {
    if (roots.includes("suplusvesi")) return document.id === "bathing-water-quality" ? 60 : 0;
    if (roots.includes("jaaolud")) {
      const combinedMarineObservation = roots.some((root) => ["temperatuur", "seire", "mootmine"].includes(root));
      if (combinedMarineObservation && document.id === "marine-observations") return 60;
      if (document.id === "marine-ice-map") return combinedMarineObservation ? 50 : 60;
      return 0;
    }
    if (roots.includes("meri") || roots.includes("laanemeri")) {
      return document.id === "marine-observations" ? 60 : 0;
    }
    if (roots.some((root) => ["vesi", "jogi", "jarv", "emajogi", "mootmine"].includes(root))) {
      return document.id === "current-hydrology-observations" ? 60 : 0;
    }
  }
  return 0;
}

function isElectricVehicleImpactIntent(roots) {
  return roots.includes("elektriauto")
    && roots.some((root) => ["keskkonnamoju", "jalajalg", "aku", "elutsukkel"].includes(root));
}

function isMiningWaterImpactIntent(roots) {
  return roots.includes("kaevandus")
    && roots.some((root) => ["keskkonnamoju", "mojutab"].includes(root))
    && roots.some((root) => ["vesi", "pohjavesi", "puurkaev", "joogivesi", "polevkivi"].includes(root));
}

function serviceIntentPriority(query, roots, document, analysis = analyzePublicSearchQuery(query)) {
  const liveScore = liveServiceIntentScore(query, roots, document, analysis);
  const normalizedQuery = normalize(query);
  const latestPublishedHydrology = isLatestPublishedHydrologyQuery(query);
  const eelisEmajogiPublicWatercourse = isEelisEmajogiPublicWatercourseQuery(query);
  const eelisNaturaSite = isEelisNaturaSiteQuery(query);
  const statisticsWaterAbstraction = isStatisticsWaterAbstractionQuery(query);
  const statisticsWastewaterBht7 = isStatisticsWastewaterBht7Query(query);
  const statisticsHazardousWaste = isStatisticsHazardousWasteQuery(query);
  const statisticsTotalWasteRecovery = isStatisticsTotalWasteRecoveryQuery(query);
  const climateDailyMean = isClimateDailyMeanQuery(query);
  const requestsHistoricalYear = /\b(?:19|20)\d{2}\b/u.test(normalizedQuery);
  const requestsHistoricalObservations = requestsHistoricalYear
    || /\b(?:ajalool\w*|varasem\w*|arhiiv\w*|vanad?|endisaeg\w*|eelmisel|mullu|moodunud)\b/u.test(normalizedQuery);
  const requestsForestSpatialData = roots.includes("mets")
    && roots.includes("kaart")
    && roots.includes("ruumikiht");
  const namedForestRegisterOverview = roots.includes("metsaregister")
    && !roots.some((root) => [
      "smi", "kataster", "kinnistu", "metsateatis", "raie", "juurdekasv", "vordlus",
      "wms", "wfs", "geojson", "ruumikiht",
    ].includes(root));
  if (isForestHarvestBalanceQuery(query)) {
    if (document.id === "forest-balance-eurostat") return 6;
    if (document.id === "forest-balance-eurostat-handbook") return 5.5;
    if (document.id === "forest-balance-kaur-methodology") return 5;
    if (document.id === "forest-balance-kaur-five-year") return 4;
  }
  if (latestPublishedHydrology) {
    if (document.id === "latest-published-hydrology") return 7;
    // The generic current-observation view is useful for genuinely live water
    // questions, but it must not displace the exact, timestamp-bound dataset.
    if (document.id === "current-hydrology-observations") return 0;
  }
  if (eelisEmajogiPublicWatercourse) {
    if (document.id === "eelis-emajogi-public-watercourse") return 7;
    if (document.id === "official-geoserver") return 5;
  }
  if (eelisNaturaSite) {
    if (document.id === "eelis-natura-site") return 7;
    if (["environment-register", "official-geoserver"].includes(document.id)) return 5;
  }
  if (statisticsWaterAbstraction) {
    if (document.id === "statistics-water-abstraction-2024") return 7;
    if (document.id === "statistics-pxweb") return 5;
    if (["current-hydrology-observations", "historical-hydrology-data"].includes(document.id)) return 0;
  }
  if (statisticsWastewaterBht7) {
    if (document.id === "statistics-wastewater-bht7-2024") return 7;
    if (document.id === "statistics-pxweb") return 5;
    if (["current-hydrology-observations", "historical-hydrology-data"].includes(document.id)) return 0;
  }
  if (statisticsHazardousWaste) {
    if (document.id === "statistics-hazardous-waste-2024") return 7;
    if (document.id === "statistics-pxweb") return 5;
    if (["waste-reporting-data", "municipal-waste-recycling-page"].includes(document.id)) return 0;
  }
  if (statisticsTotalWasteRecovery) {
    if (document.id === "statistics-total-waste-recovery") return 7;
    if (document.id === "statistics-pxweb") return 5;
    if (["municipal-waste-recycling", "municipal-waste-recycling-page", "waste-reporting-data"].includes(document.id)) return 0;
  }
  if (roots.includes("pusielupaik") && roots.includes("kaart")) {
    if (document.id === "environment-register") return 7;
    if (document.id === "official-geoserver") return 5;
    if (["waste-facilities-map", "tallinn-noise-map", "tartu-noise-map"].includes(document.id)) return 0;
  }
  if (roots.includes("kinnistu") && roots.includes("piirang")) {
    if (document.id === "environment-register") return 7;
    if (document.id === "official-geoserver") return 5;
    if (document.id === "protected-nature-guidance") return 4;
  }
  if (/\bmaa[ -]?ameti\s+kaart\b/u.test(normalizedQuery)) {
    if (document.id === "environment-register") return 7;
    if (document.id === "official-geoserver") return 5;
    if (["waste-facilities-map", "tallinn-noise-map", "tartu-noise-map"].includes(document.id)) return 0;
  }
  if (roots.includes("metsateatis")) {
    if (document.id === "forest-notice-guidance") return 7;
    if (["forest-register-workflow", "metsaregister"].includes(document.id)) return 5;
  }
  if (namedForestRegisterOverview) {
    if (document.id === "metsaregister") return 7;
    if (document.id === "forest-register-workflow") return 6;
    if (document.id === "official-geoserver") return 5;
    if (["forest-overview", "forest-catalogue", "smi-metsaregister"].includes(document.id)) return 0;
  }
  if (roots.includes("eutrofeerumine") && roots.includes("jarv")) {
    if (document.id === "bathing-water-quality") return 6;
    if (document.id === "water-monitoring") return 5;
    if (document.id === "marine-strategy-status") return 0;
  }
  if (climateDailyMean) {
    if (document.id === "climate-station-daily-mean") return 7;
    if (["historical-weather-data", "official-data-services"].includes(document.id)) return 5;
    if (["current-weather-observations", "weather-forecast"].includes(document.id)) return 0;
  }
  if (document.id === "weather-forecast"
    && /\bkas\b/u.test(normalizedQuery)
    && /\b(?:homme|homn\w*|ulehomme)\b/u.test(normalizedQuery)
    && /\b(?:torm\w*|saj\w*|aike\w*|lumi\w*|vihm\w*|tuul\w*)\b/u.test(normalizedQuery)) return 4;
  if (document.id === "forest-inventory-publication"
    && roots.includes("mets")
    && roots.includes("statistika")
    && /\b(?:valim\w*|proovitukk\w*|metood\w*|kuidas[\s\S]{0,40}toot\w*)\b/u.test(normalizedQuery)) return 4;
  if (CADASTRE_PATTERN.test(query) && CADASTRE_SERVICE_IDS.has(document.id)) return 4;
  if (liveScore >= 60) return 3;
  if (liveScore > 0) return 2;
  if (analysis.primaryRouteClass === "official_live_water"
    && sourceSupportsRouteClass(document, "official_live_water")) return 0;
  if (analysis.primaryRouteClass === "official_live_water"
    && document.id === "historical-hydrology-data"
    && roots.some((root) => ["vesi", "jogi", "jarv", "emajogi", "mootmine"].includes(root))) return 1;
  if (roots.includes("suplusvesi") && document.id === "bathing-water-quality") return 5;
  if (roots.includes("joogivesi") && document.id === "drinking-water-guidance") return 5;
  if (roots.includes("mura") && roots.includes("tartu") && document.id === "tartu-noise-map") return 5;
  if (roots.includes("reovesi")
    && roots.includes("kohtkaitlus")
    && document.id === "wastewater-local-treatment") return 5;
  if (roots.includes("meri")
    && roots.includes("mereprugi")
    && document.id === "baltic-sea-litter") return 5;
  if (roots.includes("asbest") && document.id === "hazardous-waste-asbestos") return 5;
  if (roots.includes("pais") && roots.includes("kala") && document.id === "river-dams-fish") return 5;
  if (roots.includes("rohevorgustik") && document.id === "green-network-planning-guide") return 5;
  if (roots.includes("voorliik") && document.id === "invasive-species-guidance") return 5;
  if (isElectricVehicleImpactIntent(roots) && document.id === "electric-vehicle-lifecycle") return 6;
  if (roots.includes("jalajalg")
    && !roots.includes("elektriauto")
    && document.id === "organizational-footprint") return 5;
  if (isMiningWaterImpactIntent(roots) && document.id === "mining-impact-guidance") return 6;
  if (roots.includes("margala")
    && roots.includes("taastamine")
    && document.id === "wetland-restoration") return 5;
  if (roots.includes("pestitsiid")
    && roots.includes("pohjavesi")
    && document.id === "groundwater-pesticide-monitoring") return 5;
  if (roots.includes("paikesepaneel")
    && roots.includes("jaat")
    && document.id === "solar-panel-end-of-life") return 5;
  if (roots.includes("uleujutusrisk") && document.id === "flood-risk-management") return 5;
  if (roots.includes("uluk") && document.id === "wildlife-status-2025") return 5;
  if (requestsForestSpatialData && document.id === "forest-spatial-data") return 6;
  if (roots.includes("loodusvaatlus") && document.id === "nature-observations") return 6;
  if ((roots.includes("meri") || roots.includes("laanemeri"))
    && roots.includes("eutrofeerumine")
    && document.id === "marine-strategy-status") return 6;
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
  if (roots.includes("jaat")
    && roots.includes("avaandmed")
    && /\baastaaru(?:and|ann)\w*/u.test(normalizedQuery)
    && document.id === "waste-reporting-data") return 4;
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
  if (roots.some((root) => ["vesi", "emajogi", "jogi", "jarv"].includes(root))
    && roots.some((root) => ["seire", "mootmine", "temperatuur"].includes(root))
    && document.id === "current-hydrology-observations") return requestsHistoricalObservations ? 2 : 3;
  if (roots.includes("keskkonnamoju") && roots.includes("tuulepark")
    && document.id === "wind-farm-assessment-guide") return 3;
  if (roots.includes("keskkonnamoju") && roots.includes("kaevandus")
    && document.id === "mining-impact-guidance") return 3;
  if (roots.includes("keskkonnamoju") && document.id === "environmental-assessment") return 2;
  if (roots.includes("kasvuhoonegaas")
    && document.id === "greenhouse-gas-inventory"
    && !requestsHistoricalYear) return 3;
  if (roots.includes("ringlussevott")
    && ["municipal-waste-recycling", "municipal-waste-recycling-page"].includes(document.id)) return 3;
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

export function scoreSearchCandidate(query, document, sourceRank = 0, now = Date.now(), analysis = analyzePublicSearchQuery(query)) {
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
  const coherentCoverage = Math.max(titleCoverage, summaryCoverage, passageCoverage);
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
  const liveService = liveServiceIntentScore(query, roots, document, analysis);
  const cadastreService = CADASTRE_PATTERN.test(query) && CADASTRE_SERVICE_IDS.has(document.id);
  const inferredRouteMatches = analysis.candidateRouteClasses
    .filter((routeClass) => sourceSupportsRouteClass(document, routeClass));
  const hasLexicalRouteAnchor = semantic > 0 || coveredRoots > 0 || sqlSignal > 0 || liveService > 0;
  const primaryRoutePriority = NAVIGATION_PRIORITY_ROUTE_CLASSES.has(analysis.primaryRouteClass);
  const routeSubtypeMatched = analysis.primaryRouteClass !== "official_live_water" || liveService > 0;
  const routePriority = inferredRouteMatches.length && hasLexicalRouteAnchor && primaryRoutePriority && routeSubtypeMatched
    ? inferredRouteMatches.includes(analysis.primaryRouteClass) ? 2 : 1
    : 0;
  const servicePriority = Math.max(serviceIntentPriority(query, roots, document, analysis), routePriority);
  const routeClassScore = inferredRouteMatches.length && hasLexicalRouteAnchor && primaryRoutePriority && routeSubtypeMatched
    ? inferredRouteMatches.includes(analysis.primaryRouteClass)
      ? Math.min(9, 5 + inferredRouteMatches.length)
      : 2
    : 0;
  const directMatch = servicePriority > 0
    || liveService > 0
    || cadastreService
    || (coreCoverage === 1
      && (roots.length <= 1 || coherentCoverage >= 0.6));
  const offIntentDirectoryPenalty = document.id === "organizational-footprint"
    && (!roots.includes("jalajalg") || isElectricVehicleImpactIntent(roots))
    ? 24
    : document.id === "well-register"
      && isMiningWaterImpactIntent(roots)
      && !roots.some((root) => ["register", "andmed"].includes(root))
      ? 24
      : 0;
  const broadGatewayPenalty = document.id === "climate-policy-data-gateway"
    && roots.includes("kasvuhoonegaas")
    && !/\b(?:ets|hks|jjm|prognoos\w*|eesmark\w*|kliimapoliitik\w*)\b/u.test(normalize(query))
    ? 24
    : 0;
  const forestryIntent = forestEvidenceIntent(query);
  const intentEvidence = intentEvidenceForDocument(forestryIntent, document);
  const forestMethodQuestion = roots.includes("mets")
    && roots.includes("mootmine")
    && /\b(?:kuidas|metood\w*|moot\w*|mõõt\w*|hinnat\w*)\b/iu.test(String(query || ""));
  const methodPassages = forestMethodQuestion ? normalizedPassages(document) : [];
  const directlyExplainsForestMethod = forestMethodQuestion
    && methodPassages.some((passage) => /\b(?:smi|statistilis\w*\s+metsainvent\w*)\b/iu.test(passage))
    && methodPassages.some((passage) => /\b(?:valim\w*|proovit(?:ukk|ükk)\w*|moot\w*|mõõt\w*|metood\w*)\b/iu.test(passage));
  const restrictedForestryKinds = Array.isArray(document?._forestryIntentKinds)
    ? document._forestryIntentKinds
    : [];
  const forestryRestrictionMatched = !restrictedForestryKinds.length
    || restrictedForestryKinds.includes(forestryIntent?.kind)
    || (document.id === "forest-spatial-data"
      && roots.includes("mets")
      && roots.includes("kaart")
      && roots.includes("ruumikiht"));
  // Prefer the environmental object over routing context such as “permit”
  // or “property”. A reviewed route class may bridge missing generic wording,
  // but it must not make a mining-permit guide relevant to a pond or well.
  const primarySubjectTopic = analysis.domainRoots.find((root) => ![
    "kinnistu", "keskkonnaluba", "menetlus", "piirang", "lubatavus", "taotlemine",
  ].includes(root));
  const primaryTopic = primarySubjectTopic || analysis.domainRoots[0] || assessSearchQuery(query).topic;
  const primaryIntentMatched = !primaryTopic
    || fieldHasRoot(searchableText, primaryTopic)
    || liveService > 0
    || servicePriority >= 3
    || (!primarySubjectTopic && routePriority > 0);
  const semanticIntentMatched = forestryIntent?.kind !== "forest-depletion" || intentEvidence.score > 0;
  const specializedDirectoryIntentMatched = document.id !== "organizational-footprint"
    || roots.includes("jalajalg");
  const score = semantic
    + coverageScore
    + ageIntentScore(document, roots, now)
    + liveService
    + routeClassScore
    + (cadastreService ? 48 : 0)
    + authorityScore(document.sourceTier)
    + freshness
    + yearMatch
    + completeness
    + upstreamSignal
    + sqlSignal
    + intentEvidence.score
    + (directMatch ? 4 : 0)
    - conflictingTitleYear
    - roundupPenalty
    - offIntentDirectoryPenalty
    - broadGatewayPenalty
    - (futureDated ? 0.6 : 0);
  return {
    score,
    matched: forestryRestrictionMatched
      && primaryIntentMatched
      && semanticIntentMatched
      && specializedDirectoryIntentMatched
      && (semantic > 0 || coveredRoots > 0 || sqlSignal > 0 || liveService > 0 || cadastreService),
    servicePriority,
    directMatch,
    coreCoverage,
    coherentCoverage,
    matchedRoots,
    missingRoots: roots.filter((root) => !matchedRoots.includes(root)),
    // A merely related passage must not outrank a complete direct
    // measurement. Composite forestry plans still receive every required
    // directory source in ensureForestryIntentCandidates below.
    answerEvidencePriority: directlyExplainsForestMethod ? 7 : intentEvidence.satisfies ? 6 : 0,
    relevanceBucket: Math.floor(Math.max(score, 0) / 6),
    publishedAt: publishedAt || 0,
    futureDated,
    intentEvidence: intentEvidence.score,
    yearMatch,
  };
}

export function rankSearchCandidates(query, documents = [], { sort = "relevance", now = Date.now() } = {}) {
  const analysis = analyzePublicSearchQuery(query);
  return documents
    .map((document, index) => ({
      ...document,
      _ranking: scoreSearchCandidate(query, document, index, now, analysis),
    }))
    // A reviewed, intent-specific service route is itself a deterministic
    // match signal. Do not discard it merely because a terse directory card
    // has too little lexical overlap to clear the generic numeric score.
    .filter((document) => document._ranking.matched
      && (document._ranking.score > 0 || document._ranking.servicePriority > 0))
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
  // Intent recognition may succeed on a synonym or a one-edit typo that the
  // lexical ranker gives no score. Keep the reviewed required records
  // reachable from the complete directory, then let passage-level evidence
  // validation decide whether they may support an answer.
  const byId = new Map([...available, ...rankedAvailable, ...ranked].map((document) => [document.id, document]));
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
  const methodQuestion = queryTerms(query).includes("mootmine")
    && /\b(?:kuidas|metood\w*|moot\w*|mõõt\w*|hinnat\w*)\b/iu.test(String(query || ""));
  const officialLead = methodQuestion
    ? ranked[0]
    : ranked.find((document) => document.id === officialPlan?.directDocumentId
      && document.sourceTier === "official");
  const seen = new Set();
  return [officialLead, ...required, ...ranked].filter(Boolean).filter((document) => {
    const key = canonicalResultUrl(document.url) || document.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensureDirectDirectoryCandidates(query, ranked = [], available = []) {
  const preferredIds = directDirectoryDocumentIds(query);
  if (!preferredIds.length) return ranked;
  const byId = new Map([...available, ...ranked].map((document) => [document.id, document]));
  const preferred = preferredIds
    .map((id) => byId.get(id))
    .filter(Boolean);
  if (!preferred.length) return ranked;
  const seen = new Set();
  return [...preferred, ...ranked].filter((document) => {
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
  return ensureDirectDirectoryCandidates(
    query,
    ensureForestryIntentCandidates(
      query,
      rankAndDeduplicate(query, documents, rankingOptions),
      intentDocuments,
    ),
    [...intentDocuments, ...documents],
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
    if (distinctPdfPageLocations(current.url, document.url)) {
      distinct.push(document);
      continue;
    }
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

function throwIfRetrievalClosed(signal, deadlineAt) {
  if (!signal?.aborted && (!Number.isFinite(deadlineAt) || Date.now() < deadlineAt)) return;
  throw signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The retrieval window closed", "AbortError");
}

export function shouldUseLiveDiscovery(page) {
  return parseBoundedSearchInteger(page, 1, 500, { rejectInvalid: true }) !== null;
}

export function parseBoundedSearchInteger(value, fallback, maximum, { rejectInvalid = false } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > maximum) {
    return rejectInvalid ? null : fallback;
  }
  return numeric;
}

export async function prepareRankedSearchResults(query, {
  page = 1,
  pageSize = 12,
  filters = {},
  deadlineAt,
  signal,
  clientKey = "unknown",
} = {}) {
  const appliedFilters = normalizeSearchFilters(filters);
  const safePage = parseBoundedSearchInteger(page, 1, 500);
  const safePageSize = parseBoundedSearchInteger(pageSize, 12, 50);
  const offset = (safePage - 1) * safePageSize;
  const canonicalInput = canonicalizePublicSearchQuery(query);
  const acceptedQuery = canonicalInput.ok ? canonicalInput.query : "";
  const assessment = assessSearchQuery(canonicalInput.ok ? acceptedQuery : query);
  const privatePersonLookup = canonicalInput.ok && containsPrivatePersonLookup(acceptedQuery);
  // Do not send private-person, injection, or other explicitly out-of-scope
  // queries to PostgreSQL or any external discovery provider. This guard is
  // deliberately inside retrieval so every current and future route inherits
  // it even if a caller forgets to classify first. Keep the direct privacy
  // predicate independent from the broader assessment result so an allowlist
  // regression cannot silently reopen retrieval.
  if (!canonicalInput.ok || privatePersonLookup || assessment.kind === "out-of-scope") {
    return {
      status: "empty",
      mode: "blocked-before-retrieval",
      total: 0,
      page: safePage,
      pageSize: safePageSize,
      pageCount: 0,
      hasMore: false,
      items: [],
      facets: { sources: [], categories: [], years: [] },
      appliedFilters,
      updatedAt: new Date().toISOString(),
    };
  }
  throwIfRetrievalClosed(signal, deadlineAt);
  const prefixLocalLimit = 50;
  const discoveryQueries = buildDiscoveryQueries(acceptedQuery, 3);
  const discoveryTimeout = Math.max(250, Math.min(2_200, remaining(deadlineAt, 12_000)));
  // Structured official datasets are compact and high-value evidence. The
  // hydrology PostgREST endpoint currently responds in roughly four seconds,
  // so keep a bounded 5.5 s slice while preserving nine seconds for ranking
  // and answer composition under the normal 15 s request deadline.
  const structuredTimeout = Math.max(250, Math.min(5_500, remaining(deadlineAt, 9_000)));
  const liveDiscovery = shouldUseLiveDiscovery(safePage)
    ? discoveryQueries.map((discoveryQuery) => searchOfficialSites(discoveryQuery, 6, {
      timeoutMs: discoveryTimeout,
      signal,
    }))
    : [];
  const [localResult, structuredResult, ...officialResults] = await Promise.allSettled([
    searchCorpus(acceptedQuery, {
      page: 1,
      pageSize: prefixLocalLimit,
      includeContent: true,
      preferSnapshot: false,
      filters: appliedFilters,
      signal,
      deadlineAt,
    }),
    loadStructuredIndicatorDocuments(acceptedQuery, {
      timeoutMs: structuredTimeout,
      signal,
    }),
    ...liveDiscovery,
  ]);
  throwIfRetrievalClosed(signal, deadlineAt);
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
  enqueueOfficialDiscoveryDocuments(filteredLive, { signal, clientKey });
  const rankedPrefix = rankPublicSearchCandidates(acceptedQuery, [...(local.items || []), ...filteredStructured, ...filteredLive, ...directory], {
    sort: appliedFilters.sort,
    intentDocuments: directory,
  });
  const localUrls = new Set((local.items || []).map((document) => canonicalResultUrl(document.url)));
  const facetExtras = rankAndDeduplicate(acceptedQuery, [...filteredStructured, ...filteredLive, ...directory])
    .filter((document) => !localUrls.has(canonicalResultUrl(document.url)));
  let selected = rankedPrefix.slice(offset, offset + safePageSize);
  const missing = safePageSize - selected.length;
  if (missing > 0) {
    throwIfRetrievalClosed(signal, deadlineAt);
    const tailOffset = Math.max(0, offset - rankedPrefix.length);
    const tail = await searchCorpus(acceptedQuery, {
      page: 1,
      pageSize: missing,
      includeContent: true,
      preferSnapshot: false,
      filters: appliedFilters,
      resultOffset: tailOffset,
      excludeUrls: rankedPrefix.map((document) => canonicalResultUrl(document.url)),
      signal,
      deadlineAt,
    });
    throwIfRetrievalClosed(signal, deadlineAt);
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

export function evidenceDocumentsFromListing(listing = {}, options = {}) {
  return (listing.items || [])
    .filter((item) => ["official", "reviewed"].includes(item.sourceTier)
      && !LEGACY_ANSWER_FIXTURE_IDS.has(item.id)
      && item.retrieval !== "official-federated-search"
      && sourceCanSupportPublicCitation(item, options).eligible)
    .map((item) => ({
      ...item,
      tags: item.topics || item.tags || [],
      retrieval: item.retrieval === "approved-page-hydration"
        ? "approved-page-hydration"
        : "ranked-search-result",
    }));
}

export function contextualRetrievalQuery(rootQuery, question, previousQuestions = []) {
  const safeFragment = (value) => {
    const input = canonicalizePublicSearchQuery(value);
    const fragment = input.ok ? input.query : "";
    return fragment && !contextAssessmentIsBlocked(assessSearchQuery(fragment)) ? fragment : "";
  };
  if (blockedFollowUpAssessment(rootQuery, question, previousQuestions)) return "";
  const root = safeFragment(rootQuery);
  const followUp = safeFragment(question);
  const previous = (Array.isArray(previousQuestions) ? previousQuestions : [])
    .map(safeFragment)
    .filter(Boolean)
    .slice(-3);
  if (followUp && assessSearchQuery(followUp).kind === "answerable") return followUp;
  let retrievalQuery = "";
  for (const fragment of [followUp, previous.at(-1), root].filter(Boolean)) {
    const candidate = canonicalizePublicSearchQuery([retrievalQuery, fragment].filter(Boolean).join(" "));
    if (candidate.ok) retrievalQuery = candidate.query;
  }
  return retrievalQuery;
}

function contextAssessmentIsBlocked(assessment) {
  return assessment?.kind === "out-of-scope"
    && ["unsafe-instruction", "personal-data-lookup"].includes(assessment.reason);
}

export function isSafeEllipticalFollowUp(value) {
  const input = canonicalizePublicSearchQuery(value, { maximumLength: 120 });
  const text = input.ok ? input.query : "";
  if (!text || containsUnsafeInstruction(text)
    || /\b(?:aadress\w*|elab|elukoht\w*|kodu\w*|kontakt\w*|omanik\w*|kellele\s+kuulub|isiku\w*|inimese\w*)\b/iu.test(text)) {
    return false;
  }
  const normalized = text.toLocaleLowerCase("et").replace(/[^0-9a-zõäöüšž]+/giu, " ").trim();
  if (/^(?:aga\s+)?(?:miks|kuidas|millal|kus|mis\s+aastal)$/u.test(normalized)) return true;
  // A year-only comparison is a common continuation of a dated indicator
  // answer. Admit it only inside an already accepted conversation, where the
  // root supplies the indicator and subject.
  if (/^(?:aga\s+)?kas\s+(?:19|20)\d{2}\s+aastal$/u.test(normalized)) return true;
  // Ellipsis is a narrow full-string grammar, not a trusted prefix. Every
  // residual token must be consumed here; otherwise an unrelated suffix could
  // inherit an accepted environmental root and bypass the direct scope gate.
  const pronoun = "(?:see|seda|selle|sellest|need|neid|nende)";
  const bounded = normalized.split(" ").length <= 12;
  if (!bounded) return false;
  return new RegExp(`^(?:aga\\s+)?(?:mida|mis)\\s+${pronoun}\\s+(?:tähendab|näitab)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?kui\\s+suur\\s+${pronoun}\\s+(?:on|oli)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?kuidas\\s+${pronoun}\\s+(?:arvutatakse|hinnatakse|mõõdetakse|võrreldakse|saadi)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?kas\\s+${pronoun}\\s+(?:on|oli|kehtib|muutus|suurenes|vähenes|kasvas)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?(?:mida|mis)\\s+${pronoun}\\s+(?:(?:viimase|eelneva)\\s+(?:[1-9]|10|ühe|kahe|kolme|nelja|viie|kuue|seitsme|kaheksa|üheksa|kümne)\\s+aasta\\s+jooksul|(?:19|20)\\d{2}\\s+aastaga\\s+võrreldes)\\s+(?:tähendab|näitab)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?millise\\s+aja(?:vahemiku|perioodi)(?:ga)?\\s+${pronoun}(?:\\s+muutusi)?\\s+(?:võrreldakse|hõlmab|katab)$`, "u").test(normalized);
}

export function blockedFollowUpAssessment(rootQuery, question, previousQuestions = []) {
  const fragments = [
    { value: rootQuery, allowEllipsis: false },
    ...(Array.isArray(previousQuestions)
      ? previousQuestions.map((value) => ({ value, allowEllipsis: true }))
      : []),
    { value: question, allowEllipsis: true },
  ];
  for (const { value, allowEllipsis } of fragments) {
    const input = canonicalizePublicSearchQuery(value);
    if (input.reason === "empty") continue;
    if (!input.ok) return assessSearchQuery(value);
    const fragment = input.query;
    if (containsPrivatePersonLookup(fragment)) {
      return {
        kind: "out-of-scope",
        topic: null,
        reason: "personal-data-lookup",
        clarification: "Ma ei aita tuvastada eraisiku elukohta, vara ega muid isikuga seostatavaid registriandmeid.",
      };
    }
    const assessment = assessSearchQuery(fragment);
    if (assessment.kind === "out-of-scope"
      && (!allowEllipsis || !isSafeEllipticalFollowUp(fragment))) return assessment;
  }
  return null;
}

export function conversationContext(rootQuery, previousQuestions = []) {
  const keepSafeContext = (value, allowEllipsis = false) => {
    const input = canonicalizePublicSearchQuery(value);
    const cleaned = input.ok ? input.query : "";
    if (!cleaned) return "";
    const assessment = assessSearchQuery(cleaned);
    return assessment.kind !== "out-of-scope" || (allowEllipsis && isSafeEllipticalFollowUp(cleaned))
      ? cleaned
      : "";
  };
  const root = keepSafeContext(rootQuery);
  const previous = (Array.isArray(previousQuestions) ? previousQuestions : [])
    .map((value) => keepSafeContext(value, true))
    .filter(Boolean)
    .slice(-3);
  // Retrieval itself remains short and bounded, but the answer model can use
  // more safe context to resolve a real follow-up. It is never evidence.
  return [root, ...previous].filter(Boolean).join(" → ").slice(0, 1_400);
}

export function queryHasEnvironmentContext(query) {
  return queryTerms(query).length > 0;
}
