import { definesLawTerm, focusedLawSection, topicalLawSection } from "./law-texts.mjs";
import { analyzeQueryIntent } from "./query_intent.mjs";
import { publicSourceAllowed } from "./citation-policy.mjs";
import { sameSourceResource, sourceEvidenceBinding, sourceResourceKey, sourceWitnessKey } from "./source-identity.mjs";
import { isClimateDailyMeanQuery } from "./climate.mjs";
import { isEelisEmajogiPublicWatercourseQuery, isEelisNaturaSiteQuery } from "./eelis.mjs";
import { isForestHarvestBalanceQuery, isLatestPublishedHydrologyQuery } from "./indicators.mjs";
import { resolveForestSeriesIntent, validatedForestSeriesProjection } from "./forest-series.mjs";
import { forestrySourcePreference } from "./forestry-source-policy.mjs";
import { harvestShareIntent, validatedHarvestShareProjection } from "./harvest-share.mjs";
import { landUseShareIntent, validatedLandUseShareProjection, validatedSmiLandCategoryDocument } from "./land-use-share.mjs";
import {
  analyzePublicSearchQuery,
  assessSearchQuery,
} from "./search_query_assessment.mjs";
import { containsPrivatePersonLookup } from "./search_query_privacy.mjs";
import {
  directDirectoryDocumentIds,
  forestryIntentServiceDocumentIds,
} from "./search_selectors.mjs";
import { FOREST_OVERVIEW_URL } from "./search_catalogue.mjs";
import {
  isReviewedGenericProtectedAreaConsentQuery,
  isReviewedPublicOrganizationProtectedBuildingContactQuery,
} from "./search_privacy_public_exceptions.mjs";
import { forestEvidenceIntent, normalize, queryTerms, textHasQueryRoot } from "./search_query_terms.mjs";
import { scoreDocument, splitTextPassages } from "./search_evidence.mjs";
import { sourceCanSupportPublicCitation, sourceSupportsRouteClass } from "./source-registry.mjs";
import { classifyForestryGeographyScope, isReviewedEstonianCountyIdentity, requestsUnsupportedForestAreaBreakdown, requestsUnsupportedForestAreaTimeSeries, requestsUnsupportedForestAreaUnit, statisticalReferenceDimensions } from "./municipalities.mjs";
import { isStatisticsHazardousWasteQuery, isStatisticsTotalWasteRecoveryQuery, isStatisticsWastewaterBht7Query, isStatisticsWaterAbstractionQuery } from "./statistics.mjs";
import { clean, finiteMetric, hasIndependentEvidenceCapability, resultPublishedAt, deduplicateResults } from "./retrieval_deduplication.mjs";
import { currentListingEvidencePlan, retainOverviewPlan, selectSmiDefinitionEvidence, FOREST_OVERVIEW_ROLES, measurementEdition, forestAreaOnlyEvidence, forestComparisonRolesEvidence, hasForestRegisterRole, smiNationalEvidence, overviewEvidenceForDocument, factCheckEvidence, requestedQueryYear, requestedPeriodQuery, measurementPassagesContainRequestedYear, containsEvidenceYear, compareForestryFacts, genericForestryEvidence, beetlePassageMatchesYear, intentEvidenceForDocument, forestBalanceClaimEvidence, uniquePassages } from "./retrieval_evidence.mjs";
const CADASTRE_PATTERN = /\b\d{5}:\d{3}:\d{4}\b/u;
const CADASTRE_SERVICE_IDS = new Set(["official-cadastre-wfs", "official-forest-register-wfs"]);
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
    // "Kust näen oma maatüki puistuandmeid?" asks where the stand inventory
    // lives, so the register that holds it answers the question. The notice
    // procedure names the register and its parcel data in one sentence and the
    // register manual repeats the same vocabulary, so group coverage alone can
    // let a procedure page become the direct witness. For this intent the
    // reviewed register source leads instead: forestRegisterEvidence already
    // proves the document is the register itself (identity, contents and parcel
    // scope), not a page that only names it.
    const registerWitness = intent.kind === "property-forest-data"
      ? candidates.find((candidate) => candidate.matchedGroupIndexes.length
        && hasForestRegisterRole(candidate.document))
      : null;
    if (registerWitness) {
      const position = supporting.indexOf(registerWitness);
      if (position === -1) supporting.unshift(registerWitness);
      else if (position > 0) supporting.unshift(...supporting.splice(position, 1));
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

// Keskkonnaagentuur published one article that pairs each circulating
// forestry allegation with its own correction. It is the only evidence shape
// that can answer "which claims about the forest are false": the pairs must be
// quoted from that page, never paraphrased, so the page itself has to enter the
// answer candidate set even when a broad question's wording ranks it below the
// generic statistics pages.
const REVIEWED_FOREST_FACT_CHECK_URLS = Object.freeze([
  "https://keskkonnaagentuur.ee/uudised/keskkonnaagentuur-lukkab-umber-metsastatistika-kohta-kaivad-valevaited",
  "https://keskkonnaportaal.ee/et/uudised/keskkonnaagentuur-lukkab-umber-metsastatistika-kohta-kaivad-valevaited",
]);

function isReviewedForestFactCheckSource(document) {
  return REVIEWED_FOREST_FACT_CHECK_URLS.some((url) => sameSourceResource(document?.url, url));
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
  if (forestEvidenceIntent(query)?.kind === "forest-fact-check") {
    if (isReviewedForestFactCheckSource(document)) return 7;
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
    // The SMI 2025 workbook extract answers the same question from the primary
    // publisher, so it leads; Eurostat removals stay as the documented
    // fallback and the methodological qualifier.
    if (document.id === "forest-balance-smi2025") return 7;
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
    // A named hazardous subject has its own reviewed card; the generic
    // household-sorting procedure must not bury it ("asbestijäätmed kuhu viia").
    && !roots.some((root) => ["asbest", "ohtlikud"].includes(root))
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
  // "keskkonnaandmete API" normalizes to the compound root
  // "keskkonnaandmed", so the data-API intent must accept both spellings;
  // matching only "andmed" silently dropped the reviewed service card.
  if (roots.includes("api") && roots.some((root) => ["andmed", "keskkonnaandmed"].includes(root))) {
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

const CRITERIA_FRAME_ROOTS = new Set(["loetakse", "arvatakse", "peetakse"]);

function rankingQueryAnalysis(query) {
  const analysis = analyzePublicSearchQuery(query);
  const intent = analyzeQueryIntent(query);
  if (intent.authoritySubjectTerms.length) {
    const roots = [...new Set(intent.terms.map(normalize).filter(Boolean))];
    const domainRoots = [...new Set(intent.authoritySubjectTerms.map(normalize).filter(Boolean))];
    return { ...analysis, roots, domainRoots };
  }
  if (!["clearcut", "forest"].includes(intent.topic)
    || !["definition", "criteria", "conditions"].includes(intent.intent)
    || !intent.terms.length) return analysis;

  const roots = new Set(analysis.roots || []);
  if (intent.intent === "criteria") {
    for (const root of CRITERIA_FRAME_ROOTS) roots.delete(root);
  }
  const canonicalTerms = new Set(intent.terms);
  const clearcutSubjectIsCanonical = intent.topic === "clearcut"
    && canonicalTerms.has("lageraie")
    && !canonicalTerms.has("raie");
  if (clearcutSubjectIsCanonical) roots.delete("raie");
  for (const term of canonicalTerms) roots.add(term);

  const domainRoots = (analysis.domainRoots || []).map((root) => (
    clearcutSubjectIsCanonical && root === "raie" ? "lageraie" : root
  ));
  return { ...analysis, roots: [...roots], domainRoots };
}

export function scoreSearchCandidate(query, document, sourceRank = 0, now = Date.now(), analysis = rankingQueryAnalysis(query), context = {}) {
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
  // A property stand-data question ("kust näen oma maatüki puistuandmeid") is
  // answered by the register that holds the data. A procedure page that names
  // the register can cover the same evidence groups, so coverage cannot
  // separate the two. Coverage is compared after this slot, which makes it the
  // place to score the reviewed register role for this one intent. Outside the
  // intent the value stays the plain satisfied/not-satisfied marker, and a
  // document outside the intent's own service list keeps its 0 whether or not
  // it happens to describe the register.
  const propertyDataIntent = forestryIntent?.kind === "property-forest-data" && !balanceIntent;
  const propertyDataSatisfaction = propertyDataIntent
    && (forestryIntent?.serviceDocumentIds || []).includes(document.id)
    ? (hasForestRegisterRole(document) ? 1 : intentEvidence.satisfies ? 0.5 : 0)
    : Number(intentEvidence.satisfies === true);
  const prefix = [Number(scopeMatch),
    claimEligible ? propertyDataSatisfaction : 0,
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

// Scoring one catalogue document costs a few milliseconds of synchronous regex
// work, and one search ranks the same document set two or three times. A
// request-scoped cache keyed by the document's own identity and the measurement
// edition keeps every decision identical while removing the repeats.
function measurementEditionKey(edition) {
  if (!edition) return "none";
  return `${edition.year}|${edition.dataYear}|${edition.revised ? "revised" : ""}|${edition.artifactSha256 || edition.resourceKey || ""}`;
}

function rankingCacheKey(query, document, index, now, edition, positionSensitive) {
  // Freshness scoring reads `now`, so the key carries a minute bucket; the two
  // rankings inside one request then share every score. A forestry query has no
  // upstream position bonus, so its scores travel across document orders.
  return [
    String(query),
    positionSensitive ? index : "",
    document?.id || "",
    document?._contentHash || "",
    measurementEditionKey(edition),
    Math.floor(now / 60_000),
  ].join("\u0000");
}

export function rankSearchCandidates(query, documents = [], { sort = "relevance", now = Date.now(), reuseRankings, scoreCache } = {}) {
  const analysis = rankingQueryAnalysis(query);
  const edition = measurementEdition(query, documents, now);
  const positionSensitive = !forestEvidenceIntent(query);
  return documents
    .map((document, index) => {
      let ranking;
      const cacheKey = scoreCache instanceof Map
        ? rankingCacheKey(query, document, index, now, edition, positionSensitive)
        : null;
      const cached = cacheKey === null ? undefined : scoreCache.get(cacheKey);
      if (cached !== undefined) ranking = cached;
      else if (reuseRankings?.has(document)) ranking = document._ranking;
      else ranking = scoreSearchCandidate(query, document, index, now, analysis, { edition });
      if (cacheKey !== null && cached === undefined && ranking) scoreCache.set(cacheKey, ranking);
      return { ...document, _ranking: ranking };
    })
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

export function rankAndDeduplicate(query, documents, options = {}) {
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
  // The documents in `ranked` already carry their ranking from the pass that
  // produced them, and forestry scoring has no upstream position bonus, so only
  // the intent documents that were not in the set need a score. Re-scoring the
  // whole catalogue here cost seconds of blocking CPU on every forest query.
  const combined = missing.length
    ? rankAndDeduplicate(query, [...ranked, ...missing], { ...options, reuseRankings: new Set(ranked) })
    : ranked;
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
// serviceIntentPriority hands a reviewed route a small tie-breaking value
// (1..7) that orders comparable candidates. A value above that band is not a
// tie-breaker: the reviewed card answers this exact question from its own
// evidence, so nothing generic may be placed in front of it.
const DECISIVE_SERVICE_PRIORITY = 8;

function hasDecisiveServiceRanking(document) {
  return Number(document?._ranking?.servicePriority) >= DECISIVE_SERVICE_PRIORITY;
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
  // A directory pin guarantees that a broad navigation card stays visible; it
  // is not a relevance claim. It therefore never stands in front of a reviewed
  // card that answers this very question. Otherwise a generic overview or an
  // application route root buries the specific source the question asked for
  // (a climate-impact indicator behind a weather archive, a monitoring dataset
  // behind its application root).
  const decisive = ranked.filter(hasDecisiveServiceRanking);
  const ordinary = decisive.length
    ? ranked.filter((document) => !hasDecisiveServiceRanking(document))
    : ranked;
  const seen = new Set();
  return [...decisive, ...preferred, ...ordinary].filter((document) => {
    const key = sourceWitnessKey(document) || document.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function rankPublicSearchCandidates(query, documents = [], {
  intentDocuments = [],
  ...rankingOptions
} = {}) {
  const available = [...intentDocuments, ...documents];
  const forestry = ensureForestryIntentCandidates(query, rankAndDeduplicate(query, documents, rankingOptions), intentDocuments, rankingOptions);
  const result = ensureForestSeriesCandidates(
    query,
    ensureDirectDirectoryCandidates(query, forestry.ranked, available),
    Number.isFinite(Number(rankingOptions.now)) ? Number(rankingOptions.now) : Date.now(),
  ).filter(publicSourceAllowed);
  retainOverviewPlan(result, query, forestry.plan, rankingOptions.sort || "relevance");
  return withFocusedLawSection(query, result, available);
}

// Keskkonnaagentuur and the reviewed pages stay first: the law only leads when
// no other page in the results defines the term itself.
export function withFocusedLawSection(query, ranked, available) {
  // Only a reviewed page or a Keskkonnaagentuur page can stand in for the law. A
  // news item saying "X on ..." is not something the answer may rest on.
  const canLead = (document) => !document._lawSection
    && sourceCanSupportPublicCitation(document).eligible
    && (document.retrieval === "official-service-directory"
      || (forestrySourcePreference(document) >= 0.5 && !/\/uudis|\buudis\b/iu.test(`${document.url || ""} ${document.title || ""}`)));
  const alreadyDefined = ranked.slice(0, 12).some((document) => canLead(document)
    && definesLawTerm(query, `${document.summary || ""} ${document.content || ""}`));
  const focused = alreadyDefined ? null : focusedLawSection(query, available);
  if (focused) {
    const reordered = [focused, ...ranked.filter((document) => document.id !== focused.id)];
    for (const key of Object.keys(ranked)) {
      if (!/^\d+$/u.test(key)) reordered[key] = ranked[key];
    }
    return reordered;
  }
  if (alreadyDefined || forestEvidenceIntent(query)) return ranked;
  const topical = topicalLawSection(query, available);
  if (!topical || ranked.some((document) => document.id === topical.id)) return ranked;
  const reordered = [...ranked];
  const firstReviewed = reordered.findIndex(canLead);
  reordered.splice(firstReviewed < 0 ? 0 : firstReviewed + 1, 0, topical);
  for (const key of Object.keys(ranked)) {
    if (!/^\d+$/u.test(key)) reordered[key] = ranked[key];
  }
  return reordered;
}