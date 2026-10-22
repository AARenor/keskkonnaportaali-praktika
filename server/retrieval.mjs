import { createHash } from "node:crypto";
import { publicSourceAllowed } from "./citation-policy.mjs";
import { sameSourceResource, sourceComparisonWitnessKey, sourceEvidenceBinding, sourceResourceKey, sourceWitnessKey } from "./source-identity.mjs";
import { SMI_2025_EDITION, SMI_2025_TABLES_URL } from "./smi-tables.mjs";
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
import { resolveForestSeriesIntent, validatedForestSeriesProjection } from "./forest-series.mjs";
import { forestrySourcePreference } from "./forestry-source-policy.mjs";
import { harvestShareIntent, validatedHarvestShareProjection } from "./harvest-share.mjs";
import { landUseShareIntent, validatedLandUseShareProjection, validatedSmiLandCategoryDocument } from "./land-use-share.mjs";
import {
  analyzePublicSearchQuery,
  assessSearchQuery,
  buildDiscoveryQueries,
  canonicalizePublicSearchQuery,
  containsPrivatePersonLookup,
  containsUnsafeInstruction,
  directDirectoryDocumentIds,
  FOREST_OVERVIEW_URL,
  forestEvidenceIntent,
  forestryIntentServiceDocumentIds,
  isReviewedGenericProtectedAreaConsentQuery,
  isReviewedPublicOrganizationProtectedBuildingContactQuery,
  isNeutralElaborationToken,
  normalize,
  officialServiceCatalogueDocuments,
  passageContainsEvidenceDisclaimer,
  passageDisclaimsEvidence,
  queryRootVariants,
  queryTerms,
  sanitizeLlmEvidenceText,
  russianKeywordRoots,
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
  isReviewedEstonianCountyIdentity,
  requestsUnsupportedForestAreaBreakdown,
  requestsUnsupportedForestAreaTimeSeries,
  requestsUnsupportedForestAreaUnit,
  statisticalReferenceDimensions,
} from "./municipalities.mjs";
import {
  isStatisticsHazardousWasteQuery,
  isStatisticsTotalWasteRecoveryQuery,
  isStatisticsWastewaterBht7Query,
  isStatisticsWaterAbstractionQuery,
} from "./statistics.mjs";

const PUBLIC_ITEM_FIELDS = [
  "id", "title", "url", "summary", "locator", "organization", "type", "published", "updated", "dataYear", "dataAsOf", "topics", "sourceTier",
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
  const witnessKey = sourceWitnessKey(document);
  if (!VOLATILE_RESULT_ID.test(id) || !witnessKey) return id;
  return `official-${createHash("sha256").update(witnessKey).digest("hex").slice(0, 16)}`;
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
    return new URL(sourceResourceKey(value)).hostname;
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
    return sameSourceResource(leftUrl.toString(), rightUrl.toString());
  } catch {
    return false;
  }
}

function nearDuplicateTitle(left, right) {
  // Two citations to different pages of one PDF are distinct evidence
  // locations even when their titles and publication dates are identical.
  if (distinctPdfPageLocations(left.url, right.url)) return false;
  if (sameSourceResource(left.url, right.url)
    && !sameDisplayWitness(left, right)) return false;
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

function sameDisplayWitness(left, right) {
  const key = sourceComparisonWitnessKey(left);
  if (key !== null && key === sourceComparisonWitnessKey(right)) return true;
  if (!sameSourceResource(left.url, right.url) || distinctPdfPageLocations(left.url, right.url)) return false;
  // A known disabled, locationless navigation card may be coalesced with a
  // validated witness. Its body and capabilities are never transferred.
  const locationlessNavigation = (source) => isExplicitNavigationAlias(source)
    && sourceComparisonWitnessKey(source) === sourceResourceKey(source.url);
  return (locationlessNavigation(left) && sourceWitnessKey(right) !== null)
    || (locationlessNavigation(right) && sourceWitnessKey(left) !== null);
}

function hasValidatedForestBalanceProjection(document) {
  const contentHash = clean(document?._contentHash);
  const exactDataset = [document?.url, document?.locator]
    .some((value) => sameSourceResource(value, FOREST_BALANCE_EUROSTAT_API_URL));
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
  const sameWitness = sameDisplayWitness(current, candidate);
  // A similar title is a display-level duplicate, not proof that both records
  // have the same provenance. Keep the winning URL, summary and evidence text
  // atomic so content from page B can never be cited as page A. Field-level
  // enrichment is allowed only for true canonical-URL aliases.
  if (!sameWitness) {
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
    locator: richerEvidence.locator,
    fetchUrl: richerEvidence.fetchUrl,
    citationUrl: richerEvidence.citationUrl,
    published: richerEvidence.published,
    _publishedAt: richerEvidence._publishedAt,
    updated: richerEvidence.updated,
    dataYear: richerEvidence.dataYear,
    dataAsOf: richerEvidence.dataAsOf,
    checkedAt: richerEvidence.checkedAt,
    _catalogueReviewedAt: richerEvidence._catalogueReviewedAt,
    _smiEdition: richerEvidence._smiEdition,
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
    routeClasses: richerEvidence.routeClasses,
    organization: richerEvidence.organization,
    _forestrySourceClass: richerEvidence._forestrySourceClass,
    _forestSeries: richerEvidence._forestSeries,
    _landUseShare: richerEvidence._landUseShare,
    _harvestShare: richerEvidence._harvestShare,
    ...Object.fromEntries([...ADAPTER_BOUND_PROJECTION_FIELDS.values()].map((field) => [field, richerEvidence[field]])),
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
    sourceTier: richerEvidence.sourceTier,
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

// Gentle decay so a ~15-year-old document no longer beats equally lexical
// current sources on generic queries. Bounded well below a single title-tag
// hit (7), so a genuinely strong older source still wins the direct match.
function staleSourcePenalty(ageYears) {
  if (ageYears === null || !Number.isFinite(ageYears) || ageYears <= 10) return 0;
  return Math.min(6, (ageYears - 10) / 2.5);
}

const AUXILIARY_QUERY_ROOTS = new Set([
  "muutus", "tulevik", "noor", "vanus", "tallinn", "tartu", "parnu", "parnumaa", "narva", "ida", "virumaa",
  "viljandi", "rakvere", "voru", "kuressaare", "haapsalu", "johvi",
]);

function evidenceSourcePassages(document = {}) {
  const seen = new Set();
  // Evidence is raw source prose only; search-engine excerpts and discovery
  // metadata never become claim-bearing passages.
  return [document.content, document.summary, document.answer]
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

function claimBearingEvidenceSourcePassages(document = {}) {
  return evidenceSourcePassages(document)
    .filter((passage) => !passageDisclaimsEvidence(passage));
}

// Fact-check planning: keep a disputed statement together with the source's
// own correction. The windows stay raw source prose so the evidence pack's
// exact-window admission (evidence-pack.mjs rawWindows) accepts them; nothing
// here rewrites or paraphrases the article, and the disputed claim is never
// promoted as fact by itself.
const FACT_CHECK_CLAIM_START = /^\d{1,2}[.)]\s*\p{Lu}/u;
const FACT_CHECK_NUMBERED_MARKER = /^\d{1,2}[.)]$/u;
const FACT_CHECK_CORRECTION_MARKER = /\b(?:vale|valeks|ei\s+vasta\s+toele|tegelikult|tegelikkuses|lukkab\s+umber|lukatakse\s+umber|on\s+vale|ei\s+ole\b|ei\s+oleks\b|korrektsed|korrektne|oige\s+on|ei\s+tohi\s+uletada|alahindamine|erinevused\s+tulenevad|klapivad)\b/u;
const FACT_CHECK_ALLEGATION_MARKER = /\b(?:valevait\w*|valeandm\w*|valeinfo\w*|vaidetakse|hinnangul|ulerai\w*|otsas)\b/u;
const FACT_CHECK_DOCUMENT_FRAMING = /\b(?:valevait\w*|valeinfo\w*|valeandm\w*|desinformatsioon\w*|lukkab\s+umber|lukatakse\s+umber|umber\s+luk\w*|tosi\s+voi\s+vale|ei\s+vasta\s+toele|on\s+vale|muut|muudi|muuti)\b/u;
const FACT_CHECK_INTENT_TERMS = new Set([
  "levinud", "valevaited", "valevait", "valeandmed", "valeandm", "valeinfo",
  "muut", "muudi", "muuti", "umber", "lukkab", "lukatakse", "kaivad", "tosi",
]);

function factCheckSubjectTerms(query) {
  return queryTerms(query).filter((term) => term.length >= 4 && !FACT_CHECK_INTENT_TERMS.has(term));
}

// A numbered claim may arrive either as "1. Claim sentence." or as a lone
// "1." window followed by the claim sentence, depending on how the source
// body was split. Both shapes identify the same source structure.
function factCheckNumberedStart(windows, index) {
  const window = windows[index];
  if (FACT_CHECK_CLAIM_START.test(window)) return { claimIndex: index, claim: window };
  if (FACT_CHECK_NUMBERED_MARKER.test(window) && index + 1 < windows.length) {
    return { claimIndex: index + 1, claim: windows[index + 1] };
  }
  return null;
}

function factCheckEvidence(document = {}, query = "") {
  const windows = [...new Set(claimBearingEvidenceSourcePassages(document))];
  if (!windows.length) return null;
  // The correction framing may live in the title, summary or body: a document
  // that never presents itself as a correction is not fact-check evidence.
  const framingText = normalize([document.title, document.summary, document.content, document.answer]
    .filter(Boolean).join(" "));
  if (!FACT_CHECK_DOCUMENT_FRAMING.test(framingText)) return null;
  const subjects = factCheckSubjectTerms(query);
  const hasSubject = (value) => subjects.length === 0
    || subjects.some((subject) => textHasQueryRoot(value, subject));
  const pairs = [];
  for (let index = 0; index < windows.length && pairs.length < 4; index += 1) {
    const start = factCheckNumberedStart(windows, index);
    if (!start) continue;
    // A bare numbered topic label ("4. Netojuurdekasvu mõiste.") names a
    // subject but states no allegation; a real claim needs a full sentence or
    // an explicit allegation marker.
    if (start.claim.length < 25 && !FACT_CHECK_ALLEGATION_MARKER.test(normalize(start.claim))) continue;
    const block = [];
    for (let next = start.claimIndex + 1; next < windows.length; next += 1) {
      if (factCheckNumberedStart(windows, next)) break;
      block.push(windows[next]);
    }
    // Find the actual response before retaining nearby explanatory context.
    // Never treat the allegation's continuation or a link to another page as
    // the response; keep anaphoric conclusions with their numeric antecedents.
    const position = block.findIndex((window) => FACT_CHECK_CORRECTION_MARKER.test(normalize(window)));
    if (position < 0) continue;
    const response = block[position];
    const isNavigation = (passage) => /\b(?:blogi|loe\s+lahemalt|tapsemalt\s+on\s+teemat)\w*/u.test(normalize(passage));
    const safeContext = (passage) => !FACT_CHECK_ALLEGATION_MARKER.test(normalize(passage)) && !isNavigation(passage);
    const context = /^(?:need|see|selle)\b/u.test(normalize(response))
      ? block.slice(Math.max(0, position - 2), position).filter(safeContext)
      : [];
    const following = block[position + 1];
    const corrections = [
      ...context,
      response,
      ...(following && !context.length && safeContext(following) ? [following] : []),
    ];
    const pairText = [start.claim, ...corrections].join(" ");
    if (!hasSubject(pairText)) continue;
    pairs.push({ index: pairs.length + 1, claim: start.claim, corrections });
  }
  if (!pairs.length) {
    // Unnumbered correction prose: an allegation sentence followed directly by
    // the source's correction. Both sides stay verbatim.
    for (let index = 1; index < windows.length && pairs.length < 2; index += 1) {
      const correction = windows[index];
      const claim = windows[index - 1];
      if (factCheckNumberedStart(windows, index)) continue;
      if (!FACT_CHECK_CORRECTION_MARKER.test(normalize(correction))) continue;
      if (!FACT_CHECK_ALLEGATION_MARKER.test(normalize(claim))) continue;
      if (!hasSubject(`${claim} ${correction}`)) continue;
      pairs.push({ index: pairs.length + 1, claim, corrections: [correction] });
    }
  }
  if (!pairs.length) return null;
  return { pairs, passages: pairs.flatMap((pair) => [pair.claim, ...pair.corrections]) };
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
  return normalize(requestedPeriodQuery(query)).match(/\b((?:19|20)\d{2})\b/u)?.[1] || "";
}

function requestsSmi2025HistoricalRow(query) {
  const dimensions = statisticalReferenceDimensions(query);
  return /\bsmi\b/iu.test(String(query))
    && dimensions?.editionYear === SMI_2025_EDITION.year
    && dimensions.referenceYear === SMI_2025_EDITION.historicalReferenceYear;
}

// A reviewed edition is not a second reference period.
function requestedPeriodQuery(query) {
  return statisticalReferenceDimensions(query)?.periodQuery ?? query;
}

function containsEvidenceYear(value, year) {
  if (!year) return false;
  return new RegExp(`\\b${year}\\b`, "u").test(normalize(value));
}


function measurementPassagesContainRequestedYear(passages = [], year = "") {
  return !year || passages.some((passage) => containsEvidenceYear(passage, year));
}

function areaMeasurementKey(value = "") {
  const match = String(value || "").match(/\b(\d{1,3}(?:[\s\u00A0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(%|protsent(?:i|ides|ides?)?|ha\b|hektar(?:it|i)?|miljonit?\s+hektarit?|tuhat\s+(?:ha\b|hektarit?))/iu);
  return match ? `${match[1].replace(/[\s\u00A0]/gu, "").replace(",", ".")}:${normalize(match[2])}` : "";
}

function forestAreaEvidence(document, year = "") {
  const matches = claimBearingEvidenceSourcePassages(document)
    .map((passage, index) => ({ passage, index, ...forestAreaPassageEvidence(passage) }))
    .filter((candidate) => candidate.score > 0)
    .filter((candidate) => !year || (candidate.satisfies && containsEvidenceYear(candidate.passage, year)))
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

function forestAreaOnlyEvidence(document, year = "") {
  const matches = claimBearingEvidenceSourcePassages(document)
    .map((passage, index) => ({ passage, index, ...forestAreaPassageEvidence(passage) }))
    .filter((candidate) => candidate.satisfies)
    .filter((candidate) => measurementPassagesContainRequestedYear([candidate.passage], year))
    // A composite area-and-method answer must not inherit a neighboring stock
    // or harvest observation merely because it appears in the same source.
    .filter((candidate) => !/\b(?:tagavara\w*|raiemaht\w*|m[³3]\b|tihumeet\w*|kuupmeet\w*)/iu
      .test(candidate.passage))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = matches[0] || null;
  return {
    satisfies: Boolean(best),
    score: best?.score || 0,
    passages: best ? [best.passage] : [],
  };
}

function forestMeasurementMethodEvidence(document) {
  const passages = claimBearingEvidenceSourcePassages(document);
  const matches = passages
    .map((passage, index) => {
      const text = normalize(passage);
      const hasSmi = /\b(?:smi|statistiline\s+metsainvent\w*)\b/u.test(text);
      const hasSampleStudy = /\bvalikuuring\w*\b/u.test(text);
      const hasSamplePlots = /\bproovitukk\w*\b/u.test(text);
      const hasNationalGeneralization = /\b(?:kogu\s+eesti\w*|uleriigil\w*|uldistat\w*)\b/u.test(text);
      const explainsGeneralization = /\b(?:kogu\s+eesti\w*|uldistat\w*)\b/u.test(text);
      const satisfies = hasSmi && hasSampleStudy && hasSamplePlots && hasNationalGeneralization
        && !/\b(?:smi|statistiline\s+metsainvent\w*)\b[\s\S]{0,120}\b(?:ei\s+ole|pole)\b/u.test(text);
      return {
        passage,
        index,
        satisfies,
        score: (satisfies ? 100 : 0)
          + (hasSmi ? 12 : 0)
          + (hasSampleStudy ? 18 : 0)
          + (hasSamplePlots ? 18 : 0)
          + (hasNationalGeneralization ? 18 : 0)
          + (explainsGeneralization ? 12 : 0),
      };
    })
    .filter((candidate) => candidate.satisfies)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = matches[0] || null;
  const generalization = passages.find((passage) => {
    const text = normalize(passage);
    return /\bstatistili\w*/u.test(text) && /\b(?:kogu\s+eesti|uleriigil\w*)\b/u.test(text)
      && /\buldistat\w*\s+hinnang\w*/u.test(text)
      && !/\bei\s+(?:koostata|anna|uldistata)\w*\b/u.test(text);
  });
  return {
    satisfies: Boolean(best && generalization),
    score: best && generalization ? best.score : 0,
    passages: best && generalization ? uniquePassages([best.passage, generalization]) : [],
  };
}

function forestDepletionEvidence(document) {
  const passages = claimBearingEvidenceSourcePassages(document);
  const statusPassage = passages.find((passage) => {
    const text = normalize(passage);
    const hasForestStock = /\b(?:kasvava\s+metsa\s+tagavara|metsa\s+(?:kogu)?tagavara|metsatagavara|metsavaru)\w*/u.test(text);
    const hasMeasuredDirection = /\b(?:stabiil\w*|pusi\w*|suuren\w*|vahen\w*|kahan\w*|lang\w*)\b/u.test(text);
    return hasForestStock && hasMeasuredDirection;
  });
  const area = forestAreaEvidence(document);
  const context = overviewConditionEvidence(document);
  const roles = [
    statusPassage ? "status" : null,
    area.satisfies ? "area" : null,
    context.satisfies ? "context" : null,
  ].filter(Boolean);
  return {
    satisfies: roles.length > 0,
    score: (statusPassage ? 100 : 0)
      + (area.satisfies ? 70 : 0)
      + (context.satisfies ? 55 : 0),
    passages: uniquePassages([
      statusPassage,
      ...(area.passages || []),
      ...context.passages,
    ].filter(Boolean), 6),
    roles,
  };
}

function comparisonSourcePassages(source = {}) {
  return [source.summary, source.answer, source.content].filter(Boolean)
    .flatMap((value) => splitTextPassages(sanitizeLlmEvidenceText(value)));
}

function forestComparisonEvidence(source) {
  const passages = comparisonSourcePassages(source);
  const excludes = (value) => {
    const passage = normalize(value);
    return /\b(?:metsa|metsandus|metsainventeerimis)andm\w*/u.test(passage)
      && /\b(?:smi|statistilise\s+metsainvent|metsaregis\w*)/u.test(passage)
      && /\b(?:ei\s+kuulu|pole\s+osa|ei\s+ole\s+(?:osa|allik\w*)|pole\s+(?:osa|allik\w*))/u.test(passage);
  };
  const denies = (value) => /\b(?:ei\s+(?:utle|kinnita|naita)|ei\s+tahenda)\b[\s\S]{0,180}\b(?:smi|statistilise\s+metsainvent|metsaregis\w*)\b[\s\S]{0,180}\b(?:kuulub|on\s+neist|on\s+uks)/u.test(normalize(value))
    || /\b(?:uksnes|ainult)\s+loetleb\b[\s\S]{0,180}\bmarkson\w*/u.test(normalize(value));
  if (passages.some(excludes) || passages.some(denies)) return { satisfies: false, passages: [] };
  const umbrella = passages.find((value) => {
    const text = normalize(value);
    return /\b(?:metsa|metsandus)andm\w*/u.test(text)
      && /\b(?:kogutakse|kogumine)\b/u.test(text) && /\bmitmel\s+viisil\b/u.test(text)
      && !/\bei\s+koguta\b/u.test(text);
  });
  const nationalSummary = passages.find((value) => {
    const text = normalize(value);
    return /\bstatistili\w*\b/u.test(text) && /\b(?:kokkuvot\w*|hinnang\w*)\b/u.test(text)
      && /\beesti\s+mets\w*/u.test(text) && /\bmuutus\w*/u.test(text)
      && !/\bei\s+(?:koosta|anna|kirjelda)\w*\b/u.test(text);
  });
  const smi = passages.find((value) => /\bstatistili\w*\s+metsainvent\w*/u.test(normalize(value))
    && /\bsmi\b/u.test(normalize(value)));
  const propertyRegistry = passages.find((value) => {
    const text = normalize(value);
    return /\bkinnistu\w*\b/u.test(text) && /\binventeerimis\w*|metsainventeerimis\w*/u.test(text)
      && /\b(?:metsaregis\w*|metsaressursi\s+arvestuse\s+riiklik\w*\s+registr\w*)/u.test(text)
      && /\b(?:registreeritud|koondatakse|sisaldab)\b/u.test(text)
      && !/\bei\s+(?:ole\s+registreeritud|koondat\w*|sisalda)\b/u.test(text);
  });
  const satisfies = Boolean(umbrella && nationalSummary && smi && propertyRegistry);
  return { satisfies, passages: satisfies ? uniquePassages([umbrella, nationalSummary, smi, propertyRegistry], 4) : [] };
}

export function hasForestryComparisonRole(source) {
  return forestComparisonEvidence(source).satisfies;
}

function forestRegisterEvidence(source) {
  // These are necessary body concepts, not authority/role admission. Avoid
  // sanitizing every unrelated catalogue article for a registry role it cannot
  // satisfy; a possible match still crosses the complete sanitizer and guards.
  const raw = normalize([source.summary, source.answer, source.content].filter(Boolean).join(" ").normalize("NFKC"));
  if (!/\bmetsaregis\w*/u.test(raw)
    || !/\b(?:metsainventeerimis|inventeerimis)\w*/u.test(raw)
    || !/\bkinnistu\w*/u.test(raw)
    || !/\b(?:metsaeraldis|eraldis)\w*/u.test(raw)) return { satisfies: false, passages: [] };
  const passages = comparisonSourcePassages(source);
  const registry = "(?:metsaregis\\w*|registri\\s+andmestik)";
  const affirmative = (value) => {
    const passage = normalize(value);
    return new RegExp(`\\b(?:${registry}|register)\\b[\\s\\S]{0,160}\\b(?:sisaldab|koondab|koondatakse|kuuluvad|sobib)\\b`, "u").test(passage)
      && !new RegExp(`\\b(?:${registry}|register)\\b[\\s\\S]{0,160}\\b(?:ei\\s+sisalda|pole\\s+(?:osa|allik))\\b`, "u").test(passage);
  };
  const identity = passages.find((value) => /\bmetsaregis\w*\b/u.test(normalize(value))
    && /\b(?:riiklik\s+andmekogu|metsaressursi\s+arvestuse\s+riiklik\w*\s+registr\w*)/u.test(normalize(value)));
  const contents = passages.find((value) => affirmative(value) && /\b(?:metsainventeerimis|inventeerimis)\w*/u.test(normalize(value))
    && /\bmetsateatis\w*/u.test(normalize(value)));
  const scope = passages.find((value) => {
    const text = normalize(value);
    return /\bkinnistu\w*/u.test(text) && /\b(?:metsaeraldis\w*|eraldis\w*)/u.test(text)
      && (affirmative(value) || /\basukohakirjeldus\b/u.test(text))
      && !/\bei\s+(?:sisalda|kirjelda|sobi)\b/u.test(text);
  });
  const satisfies = Boolean(identity && contents && scope);
  return { satisfies, passages: satisfies ? uniquePassages([identity, contents, scope]) : [] };
}

export function hasForestRegisterRole(source) {
  return forestRegisterEvidence(source).satisfies;
}


const FOREST_OVERVIEW_ROLES = Object.freeze(["measurement", "method", "condition", "registry"]);
const SMI_2024_PDF_URL = "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI2024/SMI_2024.pdf";
const retainedOverviewPlans = new WeakMap();

function retainOverviewPlan(value, query, plan, sort = "relevance") {
  if (plan?.kind !== "forest-overview" || !plan.strong || !plan.edition?.latestVerified) return;
  for (const witness of Object.values(plan.roleWitnesses)) {
    Object.freeze(witness.passages);
    Object.freeze(witness);
  }
  Object.freeze(plan.roleWitnesses);
  Object.freeze(plan.requiredRoles);
  Object.freeze(plan.edition);
  Object.freeze(plan);
  retainedOverviewPlans.set(value, { query, sort, plan });
}

// This is computation reuse, not a new evidence capability. A copied listing
// has no retained plan, and changed body/policy/date/locator/edition or expired
// eligibility forces the ordinary planner to run again.
export function currentListingEvidencePlan(value, query, documents = value?.items || [], sort = "relevance") {
  const retained = retainedOverviewPlans.get(value);
  if (!retained || retained.query !== query || retained.sort !== sort) return null;
  const plan = retained.plan;
  if (!FOREST_OVERVIEW_ROLES.every((role) => {
    const witness = plan.roleWitnesses[role];
    const matches = documents.filter((source) => source.id === witness.documentId);
    if (matches.length !== 1 || !sourceCanSupportPublicCitation(matches[0]).eligible) return false;
    const source = matches[0];
    if (role === "measurement" && !verifiedSmi2025Edition(source)) return false;
    const binding = sourceEvidenceBinding(source);
    return binding.witnessKey === witness.witnessKey && binding.version === witness.version
      && binding.snapshotHash === witness.snapshotHash;
  })) return null;
  return plan;
}

function smiNationalEvidence(source) {
  const passages = claimBearingEvidenceSourcePassages(source);
  const smiName = "(?:smi|statistilise\\s+metsainvent)";
  if (passages.some((raw) => new RegExp(`\\b${smiName}\\w*\\s+(?:ei\\s+ole|pole|ei\\s+sobi|ei\\s+anna|ei\\s+kirjelda|ei\\s+hinda)\\b`, "u")
    .test(normalize(raw)))) return { satisfies: false, passages: [] };
  const method = forestMeasurementMethodEvidence(source);
  const scope = passages.find((raw) => {
    const passage = normalize(raw);
    const generalized = /\b(?:koostatakse|annab|kirjeldab|hindab|sobib)\b/u.test(passage)
      && /\b(?:kogu\s+eesti|riigi\s+mets\w*)/u.test(passage)
      && (/\buldistat\w*\s+hinnang\w*/u.test(passage)
        || (/\bseisundi\w*/u.test(passage) && /\bmuutus\w*/u.test(passage)));
    return generalized && !/\bei\s+(?:koostata|sobi|anna|kirjelda|hinda)\w*\b/u.test(passage);
  });
  const satisfies = method.satisfies && Boolean(scope);
  return { satisfies, score: satisfies ? method.score : 0, passages: satisfies ? uniquePassages([...method.passages, scope]) : [] };
}

export function hasSmiNationalRole(source) {
  return smiNationalEvidence(source).satisfies;
}

function forestComparisonRolesEvidence(document) {
  const roleEvidence = {
    comparison: forestComparisonEvidence(document),
    method: smiNationalEvidence(document),
    registry: forestRegisterEvidence(document),
  };
  const roles = Object.keys(roleEvidence).filter((role) => roleEvidence[role].satisfies);
  return { satisfies: roles.length > 0, score: roles.length * 100, roles, roleEvidence,
    passages: uniquePassages(roles.flatMap((role) => roleEvidence[role].passages), 6) };
}

function isSmiDefinitionPassage(passage) {
  const text = normalize(passage);
  return /\bstatistiline\s+metsainvent\w*\b/u.test(text) && /\bsmi\b/u.test(text)
    && /\bvalikuuring\w*\b/u.test(text) && /\bproovitukk\w*\b/u.test(text)
    && !/\b(?:ei\s+ole|pole)\b/u.test(text);
}

export function selectSmiDefinitionEvidence(source) {
  const passages = claimBearingEvidenceSourcePassages(source);
  const definition = passages.find(isSmiDefinitionPassage);
  const national = smiNationalEvidence(source);
  const scope = national.passages.find((passage) => !isSmiDefinitionPassage(passage));
  const uncertainty = passages.find((passage) => /\bstatistili\w*\b/u.test(normalize(passage))
    && /\bviga\b/u.test(normalize(passage)) && /\b(?:smi|hinnang\w*|naitaj\w*)\b/u.test(normalize(passage)));
  return { satisfies: Boolean(definition && national.satisfies),
    passages: uniquePassages([definition, scope, uncertainty].filter(Boolean), 3) };
}

function overviewMethodEvidence(document) {
  const definition = selectSmiDefinitionEvidence(document);
  const measurementMethod = forestMeasurementMethodEvidence(document);
  const satisfies = definition.satisfies && measurementMethod.satisfies;
  return { satisfies, passages: satisfies ? definition.passages : [] };
}

function overviewConditionEvidence(document) {
  const passages = claimBearingEvidenceSourcePassages(document);
  const dimensions = [/\bpindala\w*|metsamaa\w*/u, /\b(?:metsa)?tagavara\w*/u,
    /\bvanus\w*|vanuselis\w*/u, /\bkahjust\w*/u, /\belurikk\w*|okoloogili\w*/u,
    /\bkaits\w*/u, /\bkliima\w*|risk\w*/u];
  const measuredStock = passages.find((raw) => {
    const text = normalize(raw);
    return /\b(?:19|20)\d{2}\b/u.test(text) && /\bmetsamaa\s+pindala\b/u.test(text)
      && /\d[\s\S]{0,60}\bhektar\w*/u.test(text)
      && /\d[\s\S]{0,40}\b(?:m3|tihumeet\w*)[\s\S]{0,30}\bpuit\w*/u.test(text);
  });
  const stockChange = passages.find((raw) => {
    const text = normalize(raw);
    return /\b(?:kogu|hektari)?tagavara\w*/u.test(text)
      && /\b(?:vahen\w*|suuren\w*|stabiil\w*|muutusi\s+pole\s+olnud)\b/u.test(text);
  });
  const composition = passages.find((raw) => {
    const text = normalize(raw);
    return /\b(?:puist\w*|mets\w*)/u.test(text)
      && /\bliigili\w*\s+mitmekesis\w*/u.test(text)
      && /\b(?:suuren\w*|vahen\w*)/u.test(text)
      && !/\bei\s+(?:suurene|vahene)\w*/u.test(text);
  });
  const age = passages.find((raw) => {
    const text = normalize(raw);
    return /\bnoor\w*/u.test(text) && /\bvan\w*/u.test(text) && /\bmets\w*/u.test(text)
      && /\bpindala\w*/u.test(text) && /\b(?:suuren\w*|vahen\w*)/u.test(text)
      && !/\bei\s+(?:suurene|vahene)\w*/u.test(text);
  });
  if (measuredStock && stockChange && composition && age) {
    return { satisfies: true, passages: uniquePassages([measuredStock, stockChange, composition, age], 4) };
  }
  const measured = passages.find((raw) => {
    const text = normalize(raw);
    return /\b(?:metsa)?tagavara\w*/u.test(text) && /\b(?:vahen\w*|kasvan\w*|suuren\w*)\b/u.test(text)
      && /\d/u.test(text) && !/\bei\s+(?:vahen|kasva|suuren)\w*\b/u.test(text);
  });
  const ecology = passages.find((raw) => {
    const text = normalize(raw);
    return /\bokoloogili\w*\s+seisund\w*/u.test(text) && /\b(?:looduslik\w*|elurikk\w*)/u.test(text)
      && /\b(?:majanduslik\w*|okosusteem\w*)/u.test(text)
      && !/\bei\s+(?:naita|kirjelda)\w*\b/u.test(text);
  });
  const pressures = passages.find((raw) => {
    const text = normalize(raw);
    return /\bmets\w*/u.test(text) && /\b(?:kliima\w*|kahjust\w*|poud\w*)/u.test(text)
      && /\b(?:vanuselis\w*|liigilis\w*)/u.test(text) && /\b(?:vahen\w*|mojut\w*|muutu\w*)/u.test(text)
      && !/\bei\s+(?:vahen|mojuta|muutu)\w*\b/u.test(text);
  });
  const witnesses = [measured, ecology, pressures].filter(Boolean);
  const text = normalize(witnesses.join(" "));
  const satisfies = witnesses.length === 3 && dimensions.filter((pattern) => pattern.test(text)).length >= 3;
  return { satisfies, passages: satisfies ? uniquePassages(witnesses) : [] };
}

function overviewRegistryEvidence(document) {
  const register = forestRegisterEvidence(document);
  if (!register.satisfies) return { satisfies: false, passages: [] };
  const passages = claimBearingEvidenceSourcePassages(document);
  const intention = passages.find((raw) => {
    const text = normalize(raw);
    return /\bmetsateatis\w*\b/u.test(text)
      && /\b(?:ei\s+ole\s+koiki|ei\s+ole[\s\S]{0,60}realiseer\w*|ei\s+toenda[\s\S]{0,60}(?:tehtud|toimun\w*)|kavandatav\w*)\b/u.test(text);
  });
  const distribution = passages.find((raw) => {
    const text = normalize(raw);
    return /\bmetsaregis\w*/u.test(text) && /\b(?:metsaportaal\w*|geoserver\w*|wms|wfs)\b/u.test(text);
  });
  return { satisfies: true,
    passages: uniquePassages([...register.passages, intention, distribution].filter(Boolean), 5) };
}

function verifiedSmi2025Edition(document) {
  return sameSourceResource(document?.url, SMI_2025_TABLES_URL)
    && document?._smiEdition?.artifactSha256 === SMI_2025_EDITION.artifactSha256
    && document?._smiEdition?.verifiedAt === SMI_2025_EDITION.verifiedAt
    && clean(document?.dataAsOf) === "18.08.2026"
    && hasIndependentEvidenceCapability(document) && sourceWitnessKey(document) !== null;
}

function measurementEdition(query, documents, now = Date.now()) {
  const year = requestedQueryYear(query);
  const revised = requestsSmi2025HistoricalRow(query);
  const workbook = documents.find((document) => verifiedSmi2025Edition(document)
    && resultPublishedAt(document) <= now
    && forestAreaOnlyEvidence(document, revised ? "2024" : "2025").satisfies);
  if (workbook && (!year || year === "2025" || revised)) return {
    year: 2025, dataYear: revised ? 2024 : 2025, revised,
    publishedAt: SMI_2025_EDITION.publishedAt, dataAsOf: SMI_2025_EDITION.dataAsOf,
    latestVerified: !year && !revised, artifactSha256: SMI_2025_EDITION.artifactSha256,
    locator: revised ? SMI_2025_EDITION.historicalLocator : SMI_2025_EDITION.measurementLocator,
    revisionReason: null, resourceKey: sourceResourceKey(workbook.url),
  };
  const historical = documents.find((document) => sameSourceResource(document?.url, SMI_2024_PDF_URL)
    && hasIndependentEvidenceCapability(document) && forestAreaOnlyEvidence(document).satisfies);
  if (historical && (!year || year === "2024") && !revised) return {
    year: 2024, dataYear: 2024, revised: false, latestVerified: false,
    publishedAt: clean(historical.published), dataAsOf: clean(historical.dataAsOf) || null,
    locator: historical.locator || null, resourceKey: sourceResourceKey(historical.url),
  };
  return null;
}

function overviewEvidenceForDocument(document, edition = null) {
  const measurement = forestAreaOnlyEvidence(document, edition ? String(edition.dataYear) : "");
  const measurementPassage = measurement.passages.find((passage) => {
    const text = normalize(passage);
    return /\beesti\w*\b/u.test(text) && /\bmetsamaa\w*\b/u.test(text)
      && /\b(?:19|20)\d{2}\b/u.test(text)
      && (!edition || (sameSourceResource(document.url, edition.resourceKey)
        && containsEvidenceYear(passage, String(edition.dataYear))))
      && (/\b(?:kogu\s+eesti|eesti)[\s\S]{0,100}\bpindala\w*\b/u.test(text)
        || (edition?.revised && /\bmetsamaa\s+pindala\b/u.test(text)));
  });
  const roleEvidence = {
    measurement: { satisfies: Boolean(measurementPassage), passages: measurementPassage ? [measurementPassage] : [] },
    method: overviewMethodEvidence(document),
    condition: overviewConditionEvidence(document),
    registry: overviewRegistryEvidence(document),
  };
  const roles = FOREST_OVERVIEW_ROLES.filter((role) => roleEvidence[role].satisfies);
  return { satisfies: roles.length > 0, score: roles.length * 100, roles, roleEvidence,
    passages: uniquePassages(roles.flatMap((role) => roleEvidence[role].passages), 8) };
}

function evidenceVersion(document) {
  return sourceEvidenceBinding(document).version;
}

function finiteMetric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function compareForestryFacts(left, right, sort = "relevance") {
  const leftTuple = sort === "newest" ? left._ranking.factNewestTuple : left._ranking.factTuple;
  const rightTuple = sort === "newest" ? right._ranking.factNewestTuple : right._ranking.factTuple;
  for (let index = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] !== rightTuple[index]) return rightTuple[index] > leftTuple[index] ? 1 : -1;
  }
  return clean(left.title).normalize("NFKC").localeCompare(clean(right.title).normalize("NFKC"), "et")
    || clean(left.id).localeCompare(clean(right.id), "et")
    || clean(sourceWitnessKey(left)).localeCompare(clean(sourceWitnessKey(right)), "et")
    || clean(evidenceVersion(left)).localeCompare(clean(evidenceVersion(right)), "et");
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
    const disclaimerOnly = passageDisclaimsEvidence(passage);
    const matchedGroupIndexes = normalizedGroups
      .map((alternatives, index) => {
        const requiresDisclaimer = alternatives.some((alternative) => passageContainsEvidenceDisclaimer(alternative));
        return (!disclaimerOnly || requiresDisclaimer)
          && alternatives.some((alternative) => text.includes(alternative))
          ? index
          : -1;
      })
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

function beetlePassageMatchesYear(passage, year) {
  // A year attached to the query word still constrains the observation. In
  // evidence it must be a whole year in a factual monitoring/data sentence,
  // not part of a site ID or an explicit statement that the data is absent.
  const yearPattern = new RegExp(`(?<!\\d)${year}(?!\\d)`, "u");
  const identifierPattern = new RegExp(`\\b(?:kood\\w*|tunnus\\w*|id)(?:\\s+\\w+){0,2}\\s*[:=]?\\s*${year}(?!\\d)`, "u");
  return String(passage || "").split(/[!?]\s+|(?<!\d)\.\s+|\.\s+(?=\p{Lu}|(?:19|20)\d{2})/u).some((sentence) => {
    const text = normalize(sentence);
    return yearPattern.test(text) && !identifierPattern.test(text)
      && /\b(?:seir\w*|andm\w*|tulemus\w*|puunis\w*)\b/u.test(text)
      && /\b(?:alates|seisuga|loendat\w*|puut\w*|seirati|registreerit\w*|moodet\w*|tuvastat\w*|leiti|kogut\w*|arv\w*|keskmis\w*|andmestik\w*)\b/u.test(text)
      && !passageDisclaimsEvidence(sentence)
      && !/\b(?:tutvuda\s+siin|vaata\s+siit|leiab\s+siit|link\w*)\b/u.test(text)
      && !/\bei\s+(?:esita\w*|sisald\w*|ole\w*|kajasta\w*|leidu\w*|teht\w*)\b/u.test(text);
  });
}

function intentEvidenceForDocument(intent, document, edition = null, year = "") {
  if (intent?.kind === "smi-definition") {
    const definition = selectSmiDefinitionEvidence(document);
    return { ...definition, score: definition.satisfies ? 100 : 0, roles: definition.satisfies ? ["method"] : [] };
  }
  if (intent?.kind === "forest-overview") return overviewEvidenceForDocument(document, edition);
  if (intent?.kind === "forest-area") return forestAreaEvidence(document, year || (edition ? String(edition.dataYear) : ""));
  if (intent?.kind === "forest-area-method") {
    const area = forestAreaOnlyEvidence(document);
    const method = smiNationalEvidence(document);
    const roles = [area.satisfies ? "measurement" : null, method.satisfies ? "method" : null].filter(Boolean);
    return { satisfies: roles.length > 0, score: area.score + method.score, roles,
      passages: uniquePassages([...area.passages, ...method.passages], 4) };
  }
  if (intent?.kind === "forest-depletion") return forestDepletionEvidence(document);
  if (intent?.kind === "forest-data-sources") return forestComparisonRolesEvidence(document);
  return genericForestryEvidence(intent, document);
}

function forestBalanceClaimEvidence(query, document) {
  const projection = hasValidatedForestBalanceProjection(document) ? validatedForestBalanceProjection(document) : null;
  if (projection) {
    const year = requestedQueryYear(query);
    const count = /\b(?:viimase\s+(?:5|viie)|5\s+aasta|viie\s+aasta|viis\s+aastat)\b/iu.test(String(query)) ? 5 : 1;
    const cohort = year ? projection.observations.filter((item) => item.year === Number(year))
      : projection.observations.slice(-count);
    const complete = cohort.length === (year ? 1 : count)
      && cohort.every((item) => item.increment !== null && item.removals !== null);
    return {
      satisfies: true, score: 0, roles: complete ? ["measurement", "cohort"] : ["availability"],
      passages: claimBearingEvidenceSourcePassages(document),
    };
  }
  const passages = claimBearingEvidenceSourcePassages(document);
  const method = passages.find((value) => {
    const text = normalize(value);
    return /\bnetojuurdekasv\w*/u.test(text) && /\b(?:maha|lahutat\w*|arvat\w*)\b/u.test(text)
      && /\bsuremus\w*|suremis\w*/u.test(text);
  });
  const definition = passages.find((value) => {
    const text = normalize(value);
    return /\bremovals\b/u.test(text) && /\belusa\w*/u.test(text) && /\bsurnud\b/u.test(text)
      && /\bkoorega\b/u.test(text)
      && !/\b(?:ei\s+sisalda|ei\s+holma|pole)\b/u.test(text);
  });
  const qualifier = passages.find((value) => {
    const text = normalize(value);
    return /\bremovals\b/u.test(text) && /\bsmi\b/u.test(text)
      && /\b(?:ei\s+ole|ei\s+vordu)\b/u.test(text);
  });
  const witnesses = uniquePassages([method, ...(definition && qualifier ? [definition, qualifier] : [])].filter(Boolean));
  return { satisfies: witnesses.length > 0, score: 0, roles: witnesses.length ? ["method"] : [], passages: witnesses };
}

// This is deliberately a semantic contract rather than a prewritten answer:
// an answer is eligible only when one current result itself contains the
// quantity or both forestry data sources needed by the user’s question.
export function selectAnswerEvidence(query, documents = [], rankingOptions = {}) {
  // Privacy is normally enforced before retrieval. Recheck it here so a
  // future caller cannot obtain claim-bearing evidence for a named person's
  // property or ownership association by invoking the planner directly.
  if (containsPrivatePersonLookup(query)) return null;
  const intent = forestEvidenceIntent(query);
  if (!intent) return null;
  if (intent.kind === "forest-fact-check") {
    const selected = (documents || [])
      .filter((document) => document && sourceCanSupportPublicCitation(document).eligible)
      .map((document) => ({ document, factCheck: factCheckEvidence(document, query) }))
      .find((candidate) => candidate.factCheck);
    if (!selected) {
      // A fact-check question is not answered by a generic amount, area or
      // volume overview. Without a body assertion paired with the source's own
      // correction, the honest outcome is that this evidence is missing.
      return {
        kind: intent.kind,
        strong: false,
        requiresStrictScopeEvidence: true,
        evidenceGroups: [],
        directDocumentId: null,
        passages: [],
        supportingDocumentIds: [],
        passagesByDocument: {},
        requiredRoles: [],
        roleWitnesses: {},
        evidenceRoles: null,
        reason: "fact-check-pair-required",
        missingEvidenceRequirements: [],
      };
    }
    const { document, factCheck } = selected;
    return {
      kind: intent.kind,
      strong: true,
      directDocumentId: document.id,
      passages: [...factCheck.passages],
      supportingDocumentIds: [document.id],
      passagesByDocument: { [document.id]: [...factCheck.passages] },
      requiredRoles: ["claims"],
      roleWitnesses: {
        claims: {
          documentId: document.id,
          ...sourceEvidenceBinding(document),
          passages: [...factCheck.passages],
        },
      },
      requiredOnly: true,
      evidenceGroups: [],
      evidenceRoles: { claims: document.id },
      claimPairs: factCheck.pairs.map((pair) => ({
        index: pair.index,
        claim: pair.claim,
        corrections: [...pair.corrections],
      })),
      missingEvidenceRequirements: [],
    };
  }
  const hasBeetleSubject = queryTerms(query).some((root) => ["urask", "feromoon", "puunispuu"].includes(root));
  const beetleYears = hasBeetleSubject ? normalize(query).match(/(?<!\d)(?:19|20)\d{2}(?!\d)/gu) || [] : [];
  const beetleCountyCase = hasBeetleSubject && normalize(query).split(/\s+/u).some((word) =>
    /maa(?:le|lt|l|s|st|ga)$/u.test(word)
      && isReviewedEstonianCountyIdentity(word.replace(/(?:le|lt|st|ga|l|s)$/u, "")));
  const numericForestAreaIntent = ["forest-area", "forest-covered-area", "forest-area-method", "forest-overview"]
    .includes(intent.kind);
  const geographyScope = classifyForestryGeographyScope(query);
  const unsupportedAreaBreakdown = numericForestAreaIntent
    && requestsUnsupportedForestAreaBreakdown(query);
  const unsupportedAreaTimeSeries = numericForestAreaIntent
    && requestsUnsupportedForestAreaTimeSeries(requestedPeriodQuery(query));
  const unsupportedAreaUnit = numericForestAreaIntent
    && requestsUnsupportedForestAreaUnit(query);
  const queryBoundGeography = [
    "reviewed-municipality",
    "unknown-locality",
    "estonian-region",
    "foreign-or-other-region",
  ].includes(geographyScope.kind) || beetleCountyCase;
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
      requiresStrictScopeEvidence: hasBeetleSubject,
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
  const queryYear = requestedQueryYear(query);
  const eligibleDocuments = (documents || []).filter((document) => sourceCanSupportPublicCitation(document).eligible);
  const edition = measurementEdition(query, eligibleDocuments, rankingOptions.now);
  const dimensions = statisticalReferenceDimensions(query);
  if (numericForestAreaIntent && dimensions && /\bsmi\b/iu.test(String(query))
    && (!edition || edition.year !== dimensions.editionYear || edition.dataYear !== dimensions.referenceYear)) {
    return {
      kind: intent.kind, strong: false, requiresStrictScopeEvidence: true,
      directDocumentId: null, supportingDocumentIds: [], passages: [], passagesByDocument: {},
      evidenceGroups: [], evidenceRoles: null,
      reason: "source-edition-evidence-required",
      missingEvidenceRequirements: ["verified-source-edition-reference-row"],
    };
  }
  const rankedDocuments = rankingOptions.preRanked === true && eligibleDocuments.every((document) => document._ranking)
    ? eligibleDocuments
    : rankSearchCandidates(query, eligibleDocuments, rankingOptions);
  if (intent.kind === "smi-definition") {
    const direct = rankedDocuments.find((document) => selectSmiDefinitionEvidence(document).satisfies);
    const passages = direct ? selectSmiDefinitionEvidence(direct).passages : [];
    return {
      kind: intent.kind, strong: Boolean(direct), evidenceGroups: [],
      requiredRoles: ["method"], requiredOnly: true,
      roleWitnesses: direct ? { method: { documentId: direct.id, ...sourceEvidenceBinding(direct), passages } } : {},
      directDocumentId: direct?.id || null, supportingDocumentIds: direct ? [direct.id] : [],
      passages, passagesByDocument: direct ? { [direct.id]: passages } : {},
      missingEvidenceRequirements: direct ? [] : ["method"],
    };
  }
  if (intent.kind === "forest-data-sources") {
    const candidates = rankedDocuments.map((document) => ({
      document, evidence: forestComparisonRolesEvidence(document),
    }));
    const definitions = {};
    const usedResources = new Set();
    const usedWitnesses = new Set();
    for (const role of ["comparison", "method", "registry"]) {
      const candidate = candidates.find(({ document, evidence }) => evidence.roleEvidence[role].satisfies
        && !usedResources.has(sourceResourceKey(document.url))
        && !usedWitnesses.has(sourceWitnessKey(document)));
      if (!candidate) continue;
      definitions[role] = { document: candidate.document, passages: candidate.evidence.roleEvidence[role].passages };
      usedResources.add(sourceResourceKey(candidate.document.url));
      usedWitnesses.add(sourceWitnessKey(candidate.document));
    }
    const comparison = definitions.comparison?.document;
    const requiredRoles = ["comparison", "method", "registry"];
    const roleWitnesses = Object.fromEntries(requiredRoles.filter((role) => definitions[role]).map((role) => {
      const { document, passages } = definitions[role];
      return [role, { documentId: document.id, ...sourceEvidenceBinding(document), passages }];
    }));
    const missingEvidenceRequirements = requiredRoles.filter((role) => !roleWitnesses[role]);
    const supportingDocumentIds = [...new Set(Object.values(roleWitnesses).map((witness) => witness.documentId))];
    return {
      kind: intent.kind, strong: missingEvidenceRequirements.length === 0, requiresStrictScopeEvidence: true,
      requiredRoles, roleWitnesses, missingEvidenceRequirements,
      directDocumentId: comparison?.id || null, supportingDocumentIds,
      passages: definitions.comparison?.passages || [],
      passagesByDocument: Object.fromEntries(supportingDocumentIds.map((id) => [id,
        uniquePassages(Object.values(roleWitnesses).filter((witness) => witness.documentId === id).flatMap((witness) => witness.passages), 10)])),
      evidenceRoles: Object.fromEntries(requiredRoles.map((role) => [role, roleWitnesses[role]?.documentId || null])),
    };
  }
  if (intent.kind === "forest-overview") {
    const candidates = rankedDocuments.filter((document) => hasIndependentEvidenceCapability(document)
      && sourceWitnessKey(document) !== null)
      .map((document) => ({ document, evidence: overviewEvidenceForDocument(document, edition) }));
    const roleWitnesses = {};
    for (const role of FOREST_OVERVIEW_ROLES) {
      const candidate = candidates.find((candidate) => candidate.evidence.roleEvidence[role].satisfies
        && (role !== "measurement" || edition !== null));
      if (!candidate) continue;
      roleWitnesses[role] = { documentId: candidate.document.id,
        ...sourceEvidenceBinding(candidate.document),
        passages: candidate.evidence.roleEvidence[role].passages };
    }
    const missingEvidenceRequirements = FOREST_OVERVIEW_ROLES.filter((role) => !roleWitnesses[role]);
    const supportingDocumentIds = [...new Set(Object.values(roleWitnesses).map((witness) => witness.documentId))];
    const passagesByDocument = Object.fromEntries(supportingDocumentIds.map((id) => [
      id, uniquePassages(Object.values(roleWitnesses).filter((witness) => witness.documentId === id)
        .flatMap((witness) => witness.passages), 10),
    ]));
    return { kind: intent.kind, strong: missingEvidenceRequirements.length === 0,
      requiredRoles: [...FOREST_OVERVIEW_ROLES], roleWitnesses, numericSourceRole: "measurement", edition,
      directDocumentId: roleWitnesses.measurement?.documentId || null,
      passages: roleWitnesses.measurement?.passages || [], supportingDocumentIds, passagesByDocument,
      evidenceGroups: [], evidenceRoles: null, missingEvidenceRequirements,
      reason: missingEvidenceRequirements.length ? "forest-overview-roles-required" : undefined };
  }
  if (intent.kind === "forest-area-method") {
    const requiredIds = new Set(intent.serviceDocumentIds || []);
    const candidates = rankedDocuments
      .filter((document) => requiredIds.has(document?.id))
      .map((document, index) => ({
        document,
        index,
        publishedAt: Number(document?._ranking?.publishedAt) || resultPublishedAt(document) || 0,
        area: forestAreaOnlyEvidence(document, queryYear || (edition ? String(edition.dataYear) : "")),
        method: smiNationalEvidence(document),
      }));
    const area = candidates
      .filter((candidate) => candidate.area.satisfies
        && measurementPassagesContainRequestedYear(candidate.area.passages, queryYear))
      .sort((left, right) => compareForestryFacts(left.document, right.document, rankingOptions.sort))[0] || null;
    const method = candidates
      .filter((candidate) => candidate.document.id !== area?.document?.id
        && candidate.method.satisfies)
      .sort((left, right) => compareForestryFacts(left.document, right.document, rankingOptions.sort))[0] || null;
    const strong = Boolean(area && method);
    const supportingDocumentIds = strong
      ? [area.document.id, method.document.id]
      : [];
    const missingEvidenceRequirements = [
      !area ? "national-area-year-unit-value" : null,
      !method ? "national-smi-measurement-method" : null,
    ].filter(Boolean);
    return {
      kind: intent.kind,
      strong,
      edition,
      requiredRoles: ["measurement", "method"],
      requiredOnly: true,
      roleWitnesses: {
        ...(area ? { measurement: { documentId: area.document.id, ...sourceEvidenceBinding(area.document), passages: area.area.passages } } : {}),
        ...(method ? { method: { documentId: method.document.id, ...sourceEvidenceBinding(method.document), passages: method.method.passages } } : {}),
      },
      numericSourceRole: "measurement",
      evidenceGroups: [],
      directDocumentId: strong ? area.document.id : null,
      passages: strong ? area.area.passages : [],
      supportingDocumentIds,
      passagesByDocument: strong ? {
        [area.document.id]: area.area.passages,
        [method.document.id]: method.method.passages,
      } : {},
      navigationDocumentIds: (documents || [])
        .filter((document) => document?.id === "forest-overview")
        .map((document) => document.id),
      evidenceRoles: strong ? {
        area: area.document.id,
        method: method.document.id,
      } : null,
      reason: strong ? undefined : "national-area-method-evidence-required",
      missingEvidenceRequirements,
    };
  }
  if (!["forest-area", "forest-covered-area", "forest-depletion", "forest-data-sources"].includes(intent.kind)) {
    const candidates = rankedDocuments
      .map((document, index) => ({ document, index, ...genericForestryEvidence(intent, document) }))
      .filter((candidate) => candidate.score > 0
        && (!candidate.document.dataYear || beetleYears.every((year) => year === String(candidate.document.dataYear)))
        && beetleYears.every((year) => candidate.passages.some((passage) => beetlePassageMatchesYear(passage, year))))
      .sort((left, right) => compareForestryFacts(left.document, right.document, rankingOptions.sort));
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
      ...(intent.kind === "protected-forest-share" && strong && supporting.length === 1 ? {
        requiredRoles: ["protection-measure-and-scope"],
        roleWitnesses: {
          "protection-measure-and-scope": {
            documentId: direct.document.id,
            ...sourceEvidenceBinding(direct.document),
            passages: direct.passages,
          },
        },
      } : {}),
      evidenceGroups: intent.evidenceGroups.map((group) => [...group]),
      requiresStrictScopeEvidence: intent.kind === "protected-forest-share" || beetleYears.length > 0,
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
  const candidates = rankedDocuments
    .map((document, index) => {
      const evidence = intentEvidenceForDocument(intent, document, edition, queryYear);
      return {
        document,
        index,
        publishedAt: Number(document?._ranking?.publishedAt) || resultPublishedAt(document) || 0,
        ...evidence,
        requestedYearClaimMatch: numericForestAreaIntent
          ? measurementPassagesContainRequestedYear(evidence.passages, queryYear)
            && document._ranking.factTuple[0] === 1
          : true,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => compareForestryFacts(left.document, right.document, rankingOptions.sort));
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
    edition: numericForestAreaIntent ? edition : null,
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

const normalizedDocumentFieldsCache = new WeakMap();
const normalizedPassagesCache = new WeakMap();
const primaryPassagesCache = new WeakMap();

function normalizedDocumentFields(document) {
  const cached = normalizedDocumentFieldsCache.get(document);
  if (cached) return cached;
  const fields = {
    title: normalize(document.title),
    summary: normalize(document.summary),
    content: normalize(document.content),
    tags: normalize([...(document.tags || []), ...(document.topics || [])].join(" ")),
  };
  if (document && typeof document === "object") normalizedDocumentFieldsCache.set(document, fields);
  return fields;
}

function normalizedPassages(document) {
  const cached = normalizedPassagesCache.get(document);
  if (cached) return cached;
  const passages = [document.summary, document.excerpt, document.content]
    .filter(Boolean)
    .flatMap(splitTextPassages)
    .map(normalize)
    .filter(Boolean);
  if (document && typeof document === "object") normalizedPassagesCache.set(document, passages);
  return passages;
}

function primaryPassages(document) {
  const cached = primaryPassagesCache.get(document);
  if (cached) return cached;
  const passages = [document.summary, document.excerpt]
    .filter(Boolean)
    .flatMap(splitTextPassages)
    .map(normalize)
    .filter(Boolean);
  if (document && typeof document === "object") primaryPassagesCache.set(document, passages);
  return passages;
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
  if (["veetase", "water level"].includes(analysis.normalized)
    && document.id === "current-hydrology-observations") return 60;
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

function isForestOverviewDocument(document) {
  return document?.id === "forest-overview"
    || sameSourceResource(document?.url, FOREST_OVERVIEW_URL);
}

function serviceIntentPriority(query, roots, document, analysis = analyzePublicSearchQuery(query)) {
  const liveScore = liveServiceIntentScore(query, roots, document, analysis);
  const normalizedQuery = normalize(query);
  const reviewedProtectedAreaConsent = isReviewedGenericProtectedAreaConsentQuery(query)
    || isReviewedPublicOrganizationProtectedBuildingContactQuery(query);
  const latestPublishedHydrology = isLatestPublishedHydrologyQuery(query);
  const eelisEmajogiPublicWatercourse = isEelisEmajogiPublicWatercourseQuery(query);
  const eelisNaturaSite = isEelisNaturaSiteQuery(query);
  const statisticsWaterAbstraction = isStatisticsWaterAbstractionQuery(query);
  const statisticsWastewaterBht7 = isStatisticsWastewaterBht7Query(query);
  const statisticsHazardousWaste = isStatisticsHazardousWasteQuery(query);
  const statisticsTotalWasteRecovery = isStatisticsTotalWasteRecoveryQuery(query);
  if (reviewedProtectedAreaConsent) {
    if (document.id === "protected-area-construction") return 7;
    if (document.id === "protected-nature-guidance") return 3;
  }
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
  if (roots.includes("uvkiirgus") && document.id === "solar-uv-guidance") return 6;
  if (roots.includes("mura")
    && roots.includes("tervisemoju")
    && document.id === "environmental-noise-health") return 5;
  if (roots.includes("mura") && roots.includes("tartu") && document.id === "tartu-noise-map") return 5;
  if (roots.includes("reovesi")
    && roots.includes("kohtkaitlus")
    && document.id === "wastewater-local-treatment") return 5;
  if (roots.includes("meri") && roots.includes("mereprugi")) {
    if (roots.includes("uuring") && document.id === "marine-microplastic-research") return 6;
    if (document.id === "baltic-sea-litter") return roots.includes("uuring") ? 0 : 5;
  }
  if (roots.includes("asbest") && document.id === "hazardous-waste-asbestos") return 5;
  if (roots.includes("pais") && roots.includes("kala") && document.id === "river-dams-fish") return 5;
  if (roots.includes("rohevorgustik") && document.id === "green-network-planning-guide") return 5;
  if (roots.includes("voorliik") && document.id === "invasive-species-guidance") return 5;
  if (roots.includes("tolmeldaja") && document.id === "pollinator-monitoring-methodology") return 5;
  if (roots.includes("kutus")
    && roots.includes("seisund")
    && document.id === "fuel-quality-monitoring") return 5;
  if (roots.includes("kliima")
    && roots.includes("kohanemine")
    && roots.includes("arengukava")
    && document.id === "climate-adaptation") return 5;
  if (roots.includes("margala")
    && roots.includes("pindala")
    && /\b2013\b/u.test(normalizedQuery)
    && document.id === "bogs-overview") return 5;
  if (isElectricVehicleImpactIntent(roots) && document.id === "electric-vehicle-lifecycle") return 50;
  if (roots.includes("jalajalg")
    && !roots.includes("elektriauto")
    && document.id === "organizational-footprint") return 5;
  if (isMiningWaterImpactIntent(roots) && document.id === "mining-impact-guidance") return 50;
  if (roots.includes("margala")
    && roots.includes("taastamine")
    && document.id === "wetland-restoration") return 5;
  if (roots.includes("pestitsiid")
    && roots.some((root) => ["vesi", "pohjavesi"].includes(root))
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
  if (document.id === "waste-sorting-guidance"
    && roots.some((root) => ["jaat", "klaas", "suurjaatmed", "kulmkapp", "rehv"].includes(root))
    && !roots.includes("polet")
    && !/\b(?:rakvere|tallinn|tartu|parnu|narva|kohtla|viljandi|voru|kuressaare|haapsalu|johvi|paide|valga|polva|jogeva|sillamae|kivioli|keila|maardu|elva|rapla|kardla|lahedal|jaamas|vastuvot)\w*/u.test(normalize(query))
    && /\b(?:kuhu|mida\s+teha|sorteer|visata|viia|panna|k\w*idelda)\b/u.test(normalize(query))) return 50;
  if (roots.includes("kaart")
    && roots.some((root) => ["natura", "kaitseala"].includes(root))
    && document.id === "environment-register") return 4;
  if (roots.includes("mets") && roots.includes("mootmine") && isForestOverviewDocument(document)) return 4;
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
  // Sorting-intent queries name the household-waste theme catalogue, not a
  // data table: the waste guide is the only reviewed catalogue card whose
  // tags name the sorting procedure ('jäätmete liigiti kogumine'). The
  // priority is deliberately modest (below the 4-point reviewed overrides)
  // so it only breaks ties among same-bucket waste candidates.
  if (roots.includes("sorteerimine") && document.id === "waste") return 2;
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
    if (/\bkliimamuut|sademet\w*\s+muut|m\w*ju\s+sademet/u.test(normalize(query))) return 50;
    return requestsClimateMap ? 2 : 3;
  }
  if (roots.includes("kliima") && roots.includes("sademed") && document.id === "climate-atlas") return 2;
  if (roots.includes("kotkas")
    && roots.some((root) => ["keskkonnaluba", "menetluse", "menetlus", "staatus"].includes(root))
    && document.id === "environmental-permits") return 3;
  if (roots.includes("kese") && roots.includes("seire") && document.id === "kese-monitoring") return 50;
  if (roots.includes("maahoive") && document.id === "soil-land-take") return 5;
  if (roots.includes("jaakreostus") && document.id === "residual-pollution") return 5;
  if (roots.includes("muld") && document.id === "soil-monitoring-results") {
    return roots.some((root) => ["maahoive", "jaakreostus"].includes(root)) ? 0 : 3;
  }
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
  const timestamp = resultPublishedAt({ published: document?.published });
  return timestamp === null ? null : new Date(timestamp).getUTCFullYear();
}

export function resultMatchesFilters(document, rawFilters = {}) {
  if (!publicSourceAllowed(document)) return false;
  const filters = normalizeSearchFilters(rawFilters);
  if (filters.source === "trusted" && !["official", "reviewed"].includes(document.sourceTier)) return false;
  if (!["all", "trusted"].includes(filters.source) && document.sourceTier !== filters.source) return false;
  if (filters.category && clean(document.type) !== filters.category) return false;
  if (filters.year && documentYear(document) !== filters.year) return false;
  return true;
}

export function scoreSearchCandidate(query, document, sourceRank = 0, now = Date.now(), analysis = analyzePublicSearchQuery(query), context = {}) {
  if (!publicSourceAllowed(document)) return { score: -Infinity, eligible: false };
  const forestryIntent = forestEvidenceIntent(query);
  const balanceIntent = isForestHarvestBalanceQuery(query);
  const forestryFact = Boolean(forestryIntent || balanceIntent);
  const prepared = {
    ...document,
    tags: document.tags || document.topics || [],
  };
  // analysis.roots already merges the Russian keyword bridge over the raw
  // query; reuse it so Cyrillic queries score on domain roots instead of
  // homoglyph-folded fragments. Fall back to plain queryTerms for direct
  // callers that pass no analysis.
  const semantic = scoreDocument(prepared, query);
  const roots = Array.isArray(analysis?.roots) && analysis.roots.length
    ? [...analysis.roots]
    : queryTerms(query);
  const fields = normalizedDocumentFields(document);
  const titleText = fields.title;
  const summaryText = fields.summary;
  const bodyText = fields.content;
  const tagText = fields.tags;
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
  const upstreamSignal = Math.max(0, 1.2 - (forestryFact ? 0 : sourceRank) * 0.04);
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
  const intentEvidence = balanceIntent ? forestBalanceClaimEvidence(query, document)
    : intentEvidenceForDocument(forestryIntent, document, context.edition || null, queryYear);
  const forestryHierarchy = forestryIntent || isForestHarvestBalanceQuery(query)
    ? forestrySourcePreference(document)
    : 0;
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
  const lexicalPrimaryIntentMatched = !primaryTopic
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
    + servicePriority
    + routeClassScore
    + (cadastreService ? 48 : 0)
    + (forestryFact ? 0 : authorityScore(document.sourceTier))
    + freshness
    + yearMatch
    + completeness
    + upstreamSignal
    // A decade-old document must not outrank an equally strong current one on
    // a generic query. Explicit year requests (yearMatch) are exempt, so
    // historical lookups keep their intentional old-source promotion.
    - (queryYear || forestryFact ? 0 : staleSourcePenalty(ageYears))
    + sqlSignal
    + intentEvidence.score
    + (directMatch ? 4 : 0)
    - conflictingTitleYear
    - roundupPenalty
    - offIntentDirectoryPenalty
    - broadGatewayPenalty
    - (futureDated ? 0.6 : 0)
    + (Number(document._cataloguePriority) || 0) * 2;
  const claimEligible = sourceCanSupportPublicCitation(document).eligible;
  const geographicScope = classifyForestryGeographyScope(query);
  const numericIntent = ["forest-area", "forest-area-method", "forest-covered-area", "forest-overview"].includes(forestryIntent?.kind);
  const area = numericIntent ? forestAreaOnlyEvidence(document, queryYear || (context.edition ? String(context.edition.dataYear) : "")) : null;
  const measurementCandidate = numericIntent && forestAreaOnlyEvidence(document).satisfies;
  const beetleSubject = roots.some((root) => ["urask", "feromoon", "puunispuu"].includes(root));
  const explicitPeriodMatch = beetleSubject
    ? (!queryYear || ((!document.dataYear || String(document.dataYear) === queryYear)
      && intentEvidence.passages.some((passage) => beetlePassageMatchesYear(passage, queryYear))))
    : !numericIntent || !measurementCandidate || (
      measurementPassagesContainRequestedYear(area.passages, queryYear)
      && (!context.edition || (sameSourceResource(document.url, context.edition.resourceKey)
        && area.passages.some((passage) => containsEvidenceYear(passage, String(context.edition.dataYear)))))
    );
  const scopeMatch = claimEligible && forestryRestrictionMatched
    && !forestryIntent?.requiresQueryBoundObservation
    && !["reviewed-municipality", "unknown-locality", "estonian-region", "foreign-or-other-region"].includes(geographicScope.kind)
    && (!numericIntent || (!requestsUnsupportedForestAreaBreakdown(query)
      && !requestsUnsupportedForestAreaTimeSeries(requestedPeriodQuery(query))
      && !requestsUnsupportedForestAreaUnit(query))) && explicitPeriodMatch
    && (!balanceIntent || intentEvidence.satisfies);
  // Scoped claim-bearing role/group proof is itself a retrieval match.
  // Catalogue membership alone cannot bypass eligibility or scope guards.
  const provenIntentMatch = Boolean((forestryIntent || balanceIntent) && scopeMatch
    && (intentEvidence.satisfies || intentEvidence.roles?.length
      || intentEvidence.matchedGroupIndexes?.length));
  const primaryIntentMatched = lexicalPrimaryIntentMatched || provenIntentMatch;
  const roleCount = forestryIntent?.kind === "forest-overview" ? FOREST_OVERVIEW_ROLES.length
    : forestryIntent?.kind === "forest-area-method" ? 2
      : balanceIntent || ["forest-depletion", "forest-data-sources"].includes(forestryIntent?.kind)
        ? 3 : Math.max(1, forestryIntent?.evidenceGroups?.length || 1);
  const roleCoverage = intentEvidence.roles?.length
    || intentEvidence.matchedGroupIndexes?.length || (intentEvidence.satisfies ? 1 : 0);
  const prefix = [Number(scopeMatch),
    Number(claimEligible && intentEvidence.satisfies === true),
    claimEligible ? Math.min(1, finiteMetric(roleCoverage / roleCount)) : 0,
    Math.max(0, Math.min(1, finiteMetric(coherentCoverage))),
    Math.max(0, Math.min(1, finiteMetric(coreCoverage))),
    finiteMetric(forestryHierarchy), Number(!futureDated)];
  const baseRelevance = finiteMetric(score);
  const strictPublishedAt = finiteMetric(publishedAt);
  return {
    score,
    forestryFact,
    factTuple: [...prefix, baseRelevance, strictPublishedAt],
    factNewestTuple: [...prefix, strictPublishedAt, baseRelevance],
    matched: forestryRestrictionMatched
      && primaryIntentMatched
      && semanticIntentMatched
      && specializedDirectoryIntentMatched
      && (provenIntentMatch || semantic > 0 || coveredRoots > 0 || sqlSignal > 0 || liveService > 0 || cadastreService),
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
    cataloguePriority: Number(document._cataloguePriority) || 0,
    intentEvidence: intentEvidence.score,
    forestrySourcePriority: forestryHierarchy,
    yearMatch,
  };
}

export function rankSearchCandidates(query, documents = [], { sort = "relevance", now = Date.now(), reuseRankings } = {}) {
  const analysis = analyzePublicSearchQuery(query);
  const edition = measurementEdition(query, documents, now);
  return documents
    .map((document, index) => ({
      ...document,
      _ranking: reuseRankings?.has(document) ? document._ranking
        : scoreSearchCandidate(query, document, index, now, analysis, { edition }),
    }))
    // A reviewed, intent-specific service route is itself a deterministic
    // match signal. Do not discard it merely because a terse directory card
    // has too little lexical overlap to clear the generic numeric score.
    .filter((document) => document._ranking.matched
      && (document._ranking.score > 0 || document._ranking.servicePriority > 0))
    .sort((left, right) => {
      if (left._ranking.forestryFact && right._ranking.forestryFact) return compareForestryFacts(left, right, sort);
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
  const now = options.now ?? Date.now();
  const ranked = rankSearchCandidates(query, documents, { ...options, now });
  const deduplicated = deduplicateResults(ranked);
  const forestry = Boolean(forestEvidenceIntent(query));
  if (forestry && deduplicated.length === ranked.length && deduplicated.every((source, index) => source === ranked[index])) return ranked;
  // Forestry scoring has no upstream position bonus. Unchanged source objects
  // keep their score; only an actual merged body needs another semantic pass.
  const sameEdition = JSON.stringify(measurementEdition(query, ranked, now))
    === JSON.stringify(measurementEdition(query, deduplicated, now));
  const reuseRankings = forestry && sameEdition ? new Set(ranked) : undefined;
  return rankSearchCandidates(query, deduplicated, { ...options, now, reuseRankings });
}

function ensureForestryIntentCandidates(query, ranked = [], available = [], options = {}) {
  const requiredIds = forestryIntentServiceDocumentIds(query);
  if (!requiredIds.length) return { ranked, plan: null };
  const byId = new Map([...available, ...ranked].map((document) => [document.id, document]));
  const required = requiredIds.map((id) => byId.get(id)).filter(Boolean);
  const missing = required.filter((source) => !ranked.includes(source));
  const combined = missing.length ? rankAndDeduplicate(query, [...ranked, ...missing], options) : ranked;
  const plan = currentListingEvidencePlan(options.previouslyRanked, query, combined, options.sort || "relevance")
    || selectAnswerEvidence(query, combined.filter((document) => document.sourceTier === "official"), { ...options, preRanked: true });
  const lead = combined.find((document) => document.id === plan?.directDocumentId) || combined[0];
  const roleIds = new Set(plan?.supportingDocumentIds || []);
  const witnesses = combined.filter((document) => roleIds.has(document.id));
  const seen = new Set();
  const visible = [lead, ...witnesses, ...combined, ...required].filter(Boolean).filter((document) => {
    const key = sourceWitnessKey(document) || document.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ranked: visible, plan };
}

function ensureDirectDirectoryCandidates(query, ranked = [], available = []) {
  if (forestEvidenceIntent(query) || isForestHarvestBalanceQuery(query)) return ranked;
  const preferredIds = directDirectoryDocumentIds(query);
  if (!preferredIds.length) return ranked;
  const byId = new Map([...available, ...ranked].map((document) => [document.id, document]));
  const preferred = preferredIds
    .map((id) => byId.get(id))
    .filter(Boolean);
  if (!preferred.length) return ranked;
  const seen = new Set();
  return [...preferred, ...ranked].filter((document) => {
    const key = sourceWitnessKey(document) || document.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The result list and answer draft both start here: relevance rank, canonical
// deduplication, a second rank with merged text, then the narrowly scoped
// official-forestry visibility guarantee.
// A typed chart document (a year series or the land-use split) is fetched
// only because the question named that indicator, so it is direct evidence
// for the question. Lexical scoring can still leave it below the first page
// behind broader portal pages; keep it within the first visible results
// without displacing the best portal lead.
const FOREST_SERIES_VISIBLE_RANK = 5;

function isTypedChartCandidate(query, document, now) {
  return Boolean(
    (document?._forestSeries && validatedForestSeriesProjection(query, document, now))
    || (document?._landUseShare && validatedLandUseShareProjection(query, document, now))
    || validatedSmiLandCategoryDocument(query, document, now)
    || (document?._harvestShare && validatedHarvestShareProjection(query, document, now)),
  );
}

function ensureForestSeriesCandidates(query, ranked = [], now = Date.now()) {
  if (!resolveForestSeriesIntent(query) && !landUseShareIntent(query) && !harvestShareIntent(query)) return ranked;
  const wanted = ranked.filter((document) => isTypedChartCandidate(query, document, now));
  if (!wanted.length) return ranked;
  const next = ranked.filter((document) => !wanted.includes(document));
  let position = FOREST_SERIES_VISIBLE_RANK;
  for (const document of wanted) {
    const at = Math.min(ranked.indexOf(document), position, next.length);
    next.splice(at, 0, document);
    position = at + 1;
  }
  return next;
}

export function rankPublicSearchCandidates(query, documents = [], {
  intentDocuments = [],
  ...rankingOptions
} = {}) {
  const forestry = ensureForestryIntentCandidates(query, rankAndDeduplicate(query, documents, rankingOptions), intentDocuments, rankingOptions);
  const result = ensureForestSeriesCandidates(
    query,
    ensureDirectDirectoryCandidates(
      query,
      forestry.ranked,
      [...intentDocuments, ...documents],
    ),
    Number.isFinite(Number(rankingOptions.now)) ? Number(rankingOptions.now) : Date.now(),
  ).filter(publicSourceAllowed);
  retainOverviewPlan(result, query, forestry.plan, rankingOptions.sort || "relevance");
  return result;
}

export function deduplicateResults(documents = []) {
  const byUrl = new Map();
  for (const document of documents) {
    if (!document?.url || !document?.title) continue;
    const key = sourceComparisonWitnessKey(document);
    if (!key) {
      byUrl.set(document, document);
      continue;
    }
    let current = byUrl.get(key);
    if (!current) {
      for (const [storedKey, stored] of byUrl) {
        if (!sameDisplayWitness(stored, document)) continue;
        current = stored;
        byUrl.delete(storedKey);
        break;
      }
    }
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
    if (sameSourceResource(current.url, document.url)
      && sourceComparisonWitnessKey(current) !== sourceComparisonWitnessKey(document)) {
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
  const assessment = assessSearchQuery(query);
  const privatePersonLookup = canonicalInput.ok
    && (containsPrivatePersonLookup(query) || containsPrivatePersonLookup(acceptedQuery));
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
  const directory = shouldUseLiveDiscovery(safePage)
    ? officialServiceCatalogueDocuments().filter((document) => resultMatchesFilters(document, appliedFilters))
    : [];
  const localRequest = searchCorpus(acceptedQuery, {
    page: 1, pageSize: prefixLocalLimit, includeContent: true,
    preferSnapshot: false, filters: appliedFilters, signal, deadlineAt,
  });
  const reviewedDirectory = forestEvidenceIntent(query)?.kind === "forest-overview"
    ? rankPublicSearchCandidates(query, directory, { sort: appliedFilters.sort, intentDocuments: directory })
    : null;
  const reviewedPlan = currentListingEvidencePlan(reviewedDirectory, query, reviewedDirectory || [], appliedFilters.sort);
  let reviewedRankedPrefix = null;
  if (reviewedPlan) {
    const local = await localRequest.catch(() => null);
    throwIfRetrievalClosed(signal, deadlineAt);
    const ranked = local?.items?.length
      ? rankPublicSearchCandidates(query, [...local.items, ...directory], {
          sort: appliedFilters.sort, intentDocuments: directory, previouslyRanked: reviewedDirectory,
        })
      : reviewedDirectory;
    // Reuse only the unchanged actual role set. A changed required snapshot
    // runs the ordinary planner and retains normal retrieval even if it passes.
    if (currentListingEvidencePlan(ranked, query, ranked.slice(0, safePageSize), appliedFilters.sort) === reviewedPlan) {
      reviewedRankedPrefix = ranked;
    }
  }
  const reviewedOverviewReady = reviewedRankedPrefix !== null;
  // Discovery providers reject foreign-script queries outright, so build
  // discovery terms from the raw query: the Russian bridge and dictionary
  // roots translate Cyrillic intent into searchable Estonian/English terms.
  const discoveryQueries = buildDiscoveryQueries(query, 3);
  const discoveryTimeout = Math.max(250, Math.min(2_200, remaining(deadlineAt, 12_000)));
  // Structured official datasets are compact and high-value evidence. The
  // hydrology PostgREST endpoint can take roughly four seconds, so keep each
  // structured fetch bounded at 5.5 s inside the stream's 7.5 s listing half.
  const structuredTimeout = Math.max(250, Math.min(5_500, remaining(deadlineAt, 9_000)));
  const liveDiscovery = !reviewedOverviewReady && shouldUseLiveDiscovery(safePage)
    ? discoveryQueries.map((discoveryQuery) => searchOfficialSites(discoveryQuery, 6, {
      timeoutMs: discoveryTimeout,
      signal,
    }))
    : [];
  const [localResult, structuredResult, ...officialResults] = await Promise.allSettled([
    localRequest,
    reviewedOverviewReady ? Promise.resolve([]) : loadStructuredIndicatorDocuments(acceptedQuery, {
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
  enqueueOfficialDiscoveryDocuments(filteredLive, { signal, clientKey });
  // acceptedQuery is homoglyph-folded: Cyrillic queries lose their script
  // here ('сортировка мусора' -> 'coptиpoвka муcopa'), so ranking must use
  // the raw query whose analysis merges the Russian keyword bridge.
  const rankedPrefix = reviewedRankedPrefix || rankPublicSearchCandidates(query, [...(local.items || []), ...filteredStructured, ...filteredLive, ...directory], {
    sort: appliedFilters.sort,
    intentDocuments: directory,
  });
  const localUrls = new Set((local.items || []).map((document) => sourceWitnessKey(document)));
  const facetExtras = (reviewedRankedPrefix || rankAndDeduplicate(acceptedQuery, [...filteredStructured, ...filteredLive, ...directory]))
    .filter((document) => !localUrls.has(sourceWitnessKey(document)));
  let selected = rankedPrefix.slice(offset, offset + safePageSize);
  const missing = safePageSize - selected.length;
  if (missing > 0) {
    throwIfRetrievalClosed(signal, deadlineAt);
    const tailOffset = Math.max(0, offset - rankedPrefix.length);
    // The initial corpus call above is settled; this fallback runs on a
    // degraded path, so a corpus failure must degrade to the ranked prefix
    // instead of throwing the whole retrieval away.
    const tail = await searchCorpus(acceptedQuery, {
      page: 1,
      pageSize: missing,
      includeContent: true,
      preferSnapshot: false,
      filters: appliedFilters,
      resultOffset: tailOffset,
      excludeUrls: rankedPrefix.map((document) => sourceResourceKey(document.url)).filter(Boolean),
      signal,
      deadlineAt,
    }).catch(() => null);
    throwIfRetrievalClosed(signal, deadlineAt);
    selected = deduplicateResults([...selected, ...((tail && tail.items) || [])]).slice(0, safePageSize);
  }
  const total = Math.max(Number(local.total || 0), rankedPrefix.length);
  const listing = {
    status: rankedPrefix.length || selected.length ? "ready" : local.status,
    mode: live.length ? "current-hybrid" : local.mode || "local-index",
    total,
    page: safePage,
    pageSize: safePageSize,
    pageCount: Math.ceil(total / safePageSize),
    hasMore: safePage * safePageSize < total,
    items: selected,
    // The visible page is deliberately compact, but answer evidence may use
    // the same ranked prefix beyond it: the first page often contains
    // navigation cards, while the citable official page ranks just below.
    // Public serialization strips this field.
    evidenceCandidates: rankedPrefix.slice(0, 50),
    facets: mergedFacets(local.facets, facetExtras),
    appliedFilters,
    updatedAt: new Date().toISOString(),
  };
  const plan = currentListingEvidencePlan(reviewedRankedPrefix, query, selected, appliedFilters.sort);
  retainOverviewPlan(listing, query, plan, appliedFilters.sort);
  return listing;
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
  // A bare period request ("näita 2000-2025", "alates 2000", "viimase 20
  // aasta jooksul") widens a dated answer's window. The root supplies the
  // indicator; nothing else may ride along in the string.
  const year = "(?:19|20)\\d{2}";
  const period = `(?:${year}\\s+(?:kuni\\s+)?${year}|alates\\s+${year}|viimas\\w*\\s+(?:\\d{1,2}|[a-zõäöüšž]+)\\s+aasta\\w*(?:\\s+jooksul)?|pikem\\w*\\s+perio\\w*|aastate\\s+l[oõ]ikes)`;
  if (new RegExp(`^(?:aga\\s+)?(?:n[aä]ita\\s+)?${period}$`, "u").test(normalized)) return true;
  // Ellipsis is a narrow full-string grammar, not a trusted prefix. Every
  // residual token must be consumed here; otherwise an unrelated suffix could
  // inherit an accepted environmental root and bypass the direct scope gate.
  const pronoun = "(?:see|seda|selle|sellest|need|neid|nende)";
  const bounded = normalized.split(" ").length <= 12;
  if (!bounded) return false;
  return new RegExp(`^(?:aga\\s+)?(?:mida|mis)\\s+${pronoun}\\s+(?:tähendab|näitab)$`, "u").test(normalized)
    || /^(?:aga\s+)?(?:mida|mis)\s+(?:need|nende)\s+(?:andmed|andmestikud)\s+(?:t[aä]hendavad|n[aä]itavad)$/u.test(normalized)
    || /^(?:aga\s+)?(?:millised?|mis)\s+(?:andmed|andmestikud)\s+(?:on\s+)?(?:k[aä]ttesaadavad|olemas)$/u.test(normalized)
    || /^(?:aga\s+)?kust\s+(?:neid|need|nende)\s+(?:andmeid|andmed|andmestikke|andmestikud)\s+(?:n[aä]eb|leiab)$/u.test(normalized)
    || new RegExp(`^(?:aga\\s+)?kui\\s+suur\\s+${pronoun}\\s+(?:on|oli)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?kuidas\\s+${pronoun}\\s+(?:(?:arvutatakse|hinnatakse|mõõdetakse|võrreldakse|saadi)|(?:on|oli)\\s+(?:muutunud|arenenud))$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?(?:selgita|seleta)\\s+(?:${pronoun}|täpsemalt|rohkem|veel|üksikasjalikult)(?:\\s+(?:täpsemalt|rohkem|veel|üksikasjalikult))?$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?millal\\s+${pronoun}\\s+(?:muutus|hakkas\\s+kehtima|kehtima\\s+hakkas|hakkas\\s+kehtima)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?kas\\s+${pronoun}\\s+(?:on|oli|kehtib|muutus|suurenes|vähenes|kasvas)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?(?:mida|mis)\\s+${pronoun}\\s+(?:(?:viimase|eelneva)\\s+(?:[1-9]|10|ühe|kahe|kolme|nelja|viie|kuue|seitsme|kaheksa|üheksa|kümne)\\s+aasta\\s+jooksul|(?:19|20)\\d{2}\\s+aastaga\\s+võrreldes)\\s+(?:tähendab|näitab)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?millise\\s+aja(?:vahemiku|perioodi)(?:ga)?\\s+${pronoun}(?:\\s+muutusi)?\\s+(?:võrreldakse|hõlmab|katab)$`, "u").test(normalized);
}

// A follow-up that carries no environment vocabulary of its own still inherits
// the accepted root's scope, but only while every content token is a neutral
// A follow-up that carries no environment vocabulary of its own still inherits
// the accepted root's scope, but only while every content token is a neutral
// elaboration word, a number, a reviewed acronym the conversation defines, or
// an inflected form of a token the conversation already contains. The
// conversation root must itself stay inside the environment domain and the
// follow-up must have failed the direct scope gate only for missing domain
// vocabulary, so foreign-language, unsafe and private-person questions keep
// their hard refusals below.
// Reviewed shorthand a follow-up may use for a subject the conversation has
// already established. The expansion words must also appear in the context, so
// an acronym nobody defined ("XYZ") cannot inherit the conversation's scope.
const CONTEXT_ACRONYM_EXPANSIONS = Object.freeze({
  kih: ["keskkonnamoju", "hindamist"],
});

// A follow-up token matches a context token only as one of its inflections:
// either one word is the beginning of the other ("mõjusid" of "mõju"), or they
// share a stem clearly longer than a coincidental prefix. Four shared letters
// are not enough — "piirivalve" must not ride in on "piirangud".
function contextTokenMatches(token, contextToken) {
  const followUp = normalize(token);
  const root = normalize(contextToken);
  if (!followUp || !root) return false;
  if (followUp === root) return true;
  const [shorter, longer] = followUp.length < root.length ? [followUp, root] : [root, followUp];
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
  let shared = 0;
  while (shared < shorter.length && followUp[shared] === root[shared]) shared += 1;
  return shared >= 6;
}

export function isContextAnchoredFollowUp(question, contextQuery = "") {
  const input = canonicalizePublicSearchQuery(question, { maximumLength: 120 });
  const text = input.ok ? input.query : "";
  if (!text || text.split(" ").length > 12) return false;
  if (containsUnsafeInstruction(text)) return false;
  const contextInput = canonicalizePublicSearchQuery(contextQuery, { maximumLength: 1_400 });
  const context = contextInput.ok ? contextInput.query : "";
  if (!context) return false;
  const contextAssessment = assessSearchQuery(context);
  if (contextAssessment.kind === "out-of-scope") return false;
  const assessment = assessSearchQuery(text);
  if (assessment.kind !== "out-of-scope" || assessment.reason !== "outside-environment-domain") return false;
  // Normalize both sides: the follow-up keeps its diacritics while context
  // words fold them away, so "mõjusid" must still match "mõju".
  const contextTokens = normalize(context).split(" ").filter(Boolean);
  const acronymTokens = new Set((String(question).match(/[\p{Lu}]{2,}/gu) || [])
    .map((token) => token.toLocaleLowerCase("et")));
  return text.split(" ").filter(Boolean).every((token) => {
    if (isNeutralElaborationToken(token)) return true;
    if (/\d/u.test(token)) return true;
    const normalizedToken = normalize(token);
    const acronym = token.toLocaleLowerCase("et");
    if (acronymTokens.has(acronym)) {
      // An acronym counts only when the conversation already uses it, or when
      // the reviewed expansion's words appear in the context.
      if (contextTokens.includes(acronym)) return true;
      const expansion = CONTEXT_ACRONYM_EXPANSIONS[acronym];
      return Boolean(expansion && expansion.every((word) => contextTokens.includes(word)));
    }
    return contextTokens.includes(normalizedToken)
      || contextTokens.some((root) => contextTokenMatches(normalizedToken, root));
  });
}

export function blockedFollowUpAssessment(rootQuery, question, previousQuestions = []) {
  const fragments = [
    { value: rootQuery, allowEllipsis: false },
    ...(Array.isArray(previousQuestions)
      ? previousQuestions.map((value) => ({ value, allowEllipsis: true }))
      : []),
    { value: question, allowEllipsis: true },
  ];
  for (const [index, { value, allowEllipsis }] of fragments.entries()) {
    const input = canonicalizePublicSearchQuery(value);
    if (input.reason === "empty") continue;
    if (!input.ok) return assessSearchQuery(value);
    const fragment = input.query;
    if (containsPrivatePersonLookup(value) || containsPrivatePersonLookup(fragment)) {
      return {
        kind: "out-of-scope",
        topic: null,
        reason: "personal-data-lookup",
        clarification: "Ma ei aita tuvastada eraisiku elukohta, vara ega muid isikuga seotatud registriandmeid.",
      };
    }
    const assessment = assessSearchQuery(fragment);
    // A missing-vocabulary follow-up stays scoped by the accepted conversation
    // only when every token it adds is neutral, acronym, or root-derived; the
    // anchor context deliberately excludes the fragment itself so a token can
    // never anchor to itself.
    const anchorContext = fragments
      .filter((_fragment, otherIndex) => otherIndex !== index)
      .map((fragment) => fragment.value)
      .join(" → ");
    if (assessment.kind === "out-of-scope"
      && (!allowEllipsis
        || !(isSafeEllipticalFollowUp(fragment) || isContextAnchoredFollowUp(fragment, anchorContext)))) {
      return assessment;
    }
  }
  return null;
}

export function conversationContext(rootQuery, previousQuestions = []) {
  const keepSafeContext = (value, allowEllipsis = false) => {
    const input = canonicalizePublicSearchQuery(value);
    const cleaned = input.ok ? input.query : "";
    if (!cleaned) return "";
    const assessment = assessSearchQuery(value);
    return !containsPrivatePersonLookup(value)
      && (assessment.kind !== "out-of-scope" || (allowEllipsis && isSafeEllipticalFollowUp(cleaned)))
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
