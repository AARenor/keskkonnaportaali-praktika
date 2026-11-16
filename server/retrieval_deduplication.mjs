import { sameSourceResource, sourceComparisonWitnessKey, sourceResourceKey, sourceWitnessKey } from "./source-identity.mjs";
import { FOREST_BALANCE_EUROSTAT_API_URL, validatedForestBalanceProjection } from "./indicators.mjs";
import { normalize } from "./search_query_terms.mjs";
import { sourceEvidenceEligibility } from "./source-registry.mjs";
const EXPLICIT_ANSWER_EVIDENCE_POLICIES = new Set(["claim-specific", "timestamped", "versioned"]);
export function clean(value = "") {
  return String(value || "").replace(/\s+/gu, " ").trim();
}
export function finiteMetric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

export function hasIndependentEvidenceCapability(document) {
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

export function hasValidatedForestBalanceProjection(document) {
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
  const merged = {
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
  // The source use policy is part of the retained body, like its timestamp. The
  // spreads above may have carried an alias's witness across, so the witness is
  // taken from the record the copy came from, and an inherited one is removed
  // when that record has none.
  if (richerEvidence._sourcePolicy === undefined) {
    delete merged._sourcePolicy;
    delete merged._sourcePolicyBinding;
  } else {
    merged._sourcePolicy = richerEvidence._sourcePolicy;
    merged._sourcePolicyBinding = richerEvidence._sourcePolicyBinding;
  }
  return merged;
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

function nearDuplicateSignature(document) {
  const titleKey = normalizedTitleKey(document.title);
  const years = [...titleKey.matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => match[0]).join(",");
  const tokens = new Set(titleKey.split(/\s+/u).filter((token) => token.length >= 3));
  return {
    key: `${resultHost(document.url)}|${years}`,
    size: tokens.size,
  };
}

function nearDuplicateSizeRange(size) {
  return {
    minimum: Math.max(0, Math.ceil(size * 0.85)),
    maximum: Math.floor(size / 0.85),
  };
}

export function deduplicateResults(documents = []) {
  const byUrl = new Map();
  const byResource = new Map();
  const remember = (key, resource, document) => {
    byUrl.set(key, document);
    if (!resource) return;
    const bucket = byResource.get(resource);
    if (bucket) bucket.add(key);
    else byResource.set(resource, new Set([key]));
  };
  const forget = (key, resource) => {
    byUrl.delete(key);
    if (!resource) return;
    const bucket = byResource.get(resource);
    if (!bucket) return;
    bucket.delete(key);
    if (!bucket.size) byResource.delete(resource);
  };
  for (const document of documents) {
    if (!document?.url || !document?.title) continue;
    const key = sourceComparisonWitnessKey(document);
    if (!key) {
      byUrl.set(document, document);
      continue;
    }
    const resource = sourceResourceKey(document.url);
    let current = byUrl.get(key);
    let matchedKey = key;
    if (!current && resource) {
      // Only a document that shares this very resource can be the same display
      // witness under a different key, so the search stays inside one bucket.
      for (const storedKey of byResource.get(resource) || []) {
        const stored = byUrl.get(storedKey);
        if (!stored || !sameDisplayWitness(stored, document)) continue;
        current = stored;
        matchedKey = storedKey;
        break;
      }
    }
    if (!current) {
      remember(key, resource, document);
      continue;
    }
    forget(matchedKey, sourceResourceKey(current.url));
    remember(key, resource, mergeDuplicate(current, document));
  }
  const byTitle = new Map();
  const distinct = [];
  // Near-duplicate index: host + year signature + token-set size bucket.
  const nearBuckets = new Map();
  const bucketKeyOf = (signature) => `${signature.key}|${signature.size}`;
  const nearCandidates = (document) => {
    const signature = nearDuplicateSignature(document);
    const { minimum, maximum } = nearDuplicateSizeRange(signature.size);
    const found = [];
    for (let size = minimum; size <= maximum; size += 1) {
      const bucket = nearBuckets.get(`${signature.key}|${size}`);
      if (bucket) found.push(...bucket);
    }
    return found;
  };
  const removeFromNearBuckets = (document, index) => {
    const bucket = nearBuckets.get(bucketKeyOf(nearDuplicateSignature(document)));
    if (!bucket) return;
    bucket.delete(index);
    if (!bucket.size) nearBuckets.delete(bucketKeyOf(nearDuplicateSignature(document)));
  };
  const addToNearBuckets = (document, index) => {
    if (normalizedTitleKey(document.title).length < 20) return;
    const signature = nearDuplicateSignature(document);
    if (signature.size < 5) return;
    const key = bucketKeyOf(signature);
    const bucket = nearBuckets.get(key);
    if (bucket) bucket.add(index);
    else nearBuckets.set(key, new Set([index]));
  };
  for (const document of byUrl.values()) {
    const titleKey = normalizedTitleKey(document.title);
    if (titleKey.length < 20) {
      distinct.push(document);
      continue;
    }
    let nearDuplicateIndex = -1;
    for (const index of nearCandidates(document)) {
      if (distinct[index] && nearDuplicateTitle(distinct[index], document)) {
        nearDuplicateIndex = index;
        break;
      }
    }
    if (nearDuplicateIndex >= 0) {
      const previous = distinct[nearDuplicateIndex];
      const merged = mergeDuplicate(previous, document);
      distinct[nearDuplicateIndex] = merged;
      removeFromNearBuckets(previous, nearDuplicateIndex);
      addToNearBuckets(merged, nearDuplicateIndex);
      continue;
    }
    const currentIndex = byTitle.get(titleKey);
    if (currentIndex === undefined) {
      byTitle.set(titleKey, distinct.length);
      addToNearBuckets(document, distinct.length);
      distinct.push(document);
      continue;
    }
    const current = distinct[currentIndex];
    if (distinctPdfPageLocations(current.url, document.url)) {
      addToNearBuckets(document, distinct.length);
      distinct.push(document);
      continue;
    }
    if (sameSourceResource(current.url, document.url)
      && sourceComparisonWitnessKey(current) !== sourceComparisonWitnessKey(document)) {
      addToNearBuckets(document, distinct.length);
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