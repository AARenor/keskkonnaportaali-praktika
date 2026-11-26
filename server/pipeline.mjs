import { forestLawVersionStamp } from "./law-texts.mjs";
import { asksOnlyForestAmount, withForestContextChart } from "./forest-series.mjs";
import { composeHarvestShareResponse } from "./harvest-share.mjs";
import { withLandUseShareChart } from "./land-use-share.mjs";
import { readSearchCache, recordSearch } from "./database.mjs";
import { answerCadastreQuestion } from "./cadastre.mjs";
import { composeClimateDailyMeanResponse } from "./climate.mjs";
import {
  hydrateOfficialDocuments,
} from "./integrations.mjs";
import { generateGroundedAnswer } from "./llm.mjs";
import { assertAnswerAddressesQuery } from "./llm_answer_validation.mjs";
import { buildEvidencePack } from "./evidence-pack.mjs";
import { deliveredOutcome } from "./delivered-outcome.mjs";
import { sameSourceResource, sourceEvidenceBinding, sourceWitnessKey } from "./source-identity.mjs";
import { composeEelisEmajogiPublicWatercourseResponse, composeEelisNaturaSiteResponse } from "./eelis.mjs";
import {
  composeStatisticsHazardousWasteResponse,
  composeStatisticsTotalWasteRecoveryResponse,
  composeStatisticsWastewaterBht7Response,
  composeStatisticsWaterAbstractionResponse,
} from "./statistics.mjs";
import {
  composeCurrentWeatherObservationResponse,
  composeForestHarvestBalanceAnswer,
  composeForestSeriesResponse,
  composeLatestPublishedHydrologyResponse,
  composeMunicipalWasteRecyclingResponse,
  composeMetsandusteatmikResponse,
  composeNationalWeatherForecastResponse,
  composeSmiIncrementResponse,
  isCurrentWeatherObservationQuery,
} from "./indicators.mjs";
import {
  isContextAnchoredFollowUp,
  isContinuationFollowUp,
  isSafeEllipticalFollowUp,
} from "./retrieval_context.mjs";
import {
  evidenceDocumentsFromListing,
  resultMatchesFilters,
  stablePublicResultId,
} from "./retrieval_listing.mjs";
import {
  currentListingEvidencePlan,
  selectSmiDefinitionEvidence,
} from "./retrieval_evidence.mjs";
import {
  rankPublicSearchCandidates,
  selectAnswerEvidence,
} from "./retrieval_ranking.mjs";
import { resultPublishedAt } from "./retrieval_deduplication.mjs";
import { prepareRankedSearchResults } from "./retrieval.mjs";
import { answersAskedConcept, extractAnswersQuery, givesAskedAmount, isForestNoticeFilingPassage, isNonAnswerText, namesAskedAgeClass, namesAskedClearcut, namesDefinitionTerm, noticeAnswerWithoutNoticeIntent, rawLawLeadAnswersQuery } from "./answer_coverage.mjs";
import { canonicalizePublicSearchQuery } from "./search_query_canonicalization.mjs";
import {
  assessSearchQuery,
  isForestRelatedQuery,
} from "./search_query_assessment.mjs";
import {
  composeNoAnswerResponse,
  NO_ANSWER_EYEBROW,
  NO_ANSWER_INTRO,
  composeOfficialServiceNavigationResponse,
  composeAmbiguousDomainGuidanceResponse,
  composeScopeResponse,
  composeSearchResponse,
  composeTopicDataOverviewResponse,
  composeWasteFacilitiesNavigationResponse,
} from "./search_response.mjs";
import {
  directPortalOverviewSource,
  directPortalReportSource,
  forestryIntentServiceDocumentIds,
} from "./search_selectors.mjs";
import {
  isAllEnvironmentSearchEnabled,
  normalize,
  queryTerms,
  textHasQueryRoot,
} from "./search_query_terms.mjs";
import { asksForImpact, assessEvidence, multiSourceSynthesisDocuments, rankedSetCoversSubject } from "./search_evidence.mjs";
import { projectSourceCopy, SOURCE_EVIDENCE_COPY_CHARS, sourceCanSupportPublicCitation } from "./source-registry.mjs";
import { queryNeedsFreshness } from "./corpus_query.mjs";
import { configuredAnswerBudgetMs } from "./request-budget.mjs";
import { analyzeQueryIntent, isNoticeReviewDurationQuestion } from "./query_intent.mjs";
import { buildIntentAnswer } from "./answer_templates.mjs";
import { readSearchAnswerCache, createSearchAnswerCacheRevision, prepareSearchAnswerCacheResponse, writeSearchAnswerCache } from "./search_cache_stage.mjs";
import { searchUsageTelemetry } from "./search_usage_projection.mjs";
import {
  answerClaimsHaveVisibleWitnesses,
  answerEvidenceDocuments,
  attachEvidenceExcerpts,
  cardAnswersQueryWords,
  comparisonAnswersQuery,
  claimHasVisibleWitness,
  composeForestDataSourcesFallback,
  composeForestDepletionFallback,
  composeGenericForestOverviewFallback,
  composeOfficialForestryEvidenceFallback,
  composeSourceClaimPairs,
  directEvidenceExtract,
  finalizeVisibleAnswerWitnesses,
  modelStartingDraft,
  rebindAnswerCitationsToVisibleWitnesses,
  repeatsOffTargetLead,
  sourceCitation,
  withNoticeScopeCaveat,
  withoutOffTargetFallback,
} from "./search_answer_evidence.mjs";
import {
  ANSWER_SOURCE_EXPIRY,
  attemptCheckCode,
  publicationCopyExpiry,
  publicResponse,
} from "./search_public_response.mjs";
import {
  cachedSourcesBelongToListing,
  draftMatchesListingAndFilters,
  draftSourcesBelongToListing,
  searchListingRevision,
} from "./search_listing_stage.mjs";

const CONCEPT_INTENTS = new Set(["definition", "criteria"]);
const TEMPLATE_INTENTS = new Set(["definition", "criteria", "conditions", "procedure"]);
const PERMISSION_ONLY_DEFINITION = /(?:^|[^\p{L}])(?:lubat\p{L}*|tohib|võib|võivad|võin|võid|võime|võite|võiks\p{L}*|tingimus\p{L}*)(?=$|[^\p{L}])/iu;


function hasDefaultSearchFilters(filters = {}) {
  const category = typeof filters.category === "string" ? filters.category.trim() : "";
  const year = filters.year === undefined || filters.year === null || String(filters.year).trim() === "";
  return String(filters.source || "all") === "all"
    && !category
    && year
    && String(filters.sort || "relevance") === "relevance";
}
function isPermissionFocusedLawCandidate(source, intent) {
  return CONCEPT_INTENTS.has(intent)
    && Boolean(source?._focusedLawTerm)
    && PERMISSION_ONLY_DEFINITION.test(String(source._lawDefinition || ""));
}

const FANOUT_SUBQUERY_MAX = 24;
const FANOUT_CANDIDATE_MAX = 10_000;

function boundedFanoutCount(value, maximum) {
  return Number.isInteger(value) && value >= 0 && value <= maximum ? value : 0;
}

// Retrieval exposes only counts. Persistence keeps a bounded copy and never
// receives subquery text.
function fanoutCountsFromListing(searchResults) {
  const fanout = searchResults?.fanout && typeof searchResults.fanout === "object"
    && !Array.isArray(searchResults.fanout) ? searchResults.fanout : {};
  return {
    subqueryCount: boundedFanoutCount(fanout.subqueryCount, FANOUT_SUBQUERY_MAX),
    mergedCandidates: boundedFanoutCount(fanout.mergedCandidates, FANOUT_CANDIDATE_MAX),
    missingSubquestions: 0,
  };
}

// Increment whenever the public response/citation contract changes so rows
// written under an older policy cannot be served without regeneration.
export const SEARCH_RESPONSE_REVISION = "answer-v117-notice-paraphrase";

// Cards that only quote a source passage, as opposed to a structured figure or
// a reviewed law card. Only these are withdrawn after an intent rejection.
const SOURCE_EXTRACT_EYEBROWS = new Set(["Allikapõhine kokkuvõte", "Allikapõhine vastus"]);
// Check codes that say the answer did not answer what was asked, as opposed to
// citation, wording or grounding failures.
const INTENT_REJECTION = /does-not-(?:answer-the-requested-intent|give-the-amount|give-the-hectares|speak-about-the-place)|says-its-sources-do-not-answer|^asked-concept-missing$|^definition-lead-missing$/u;
const REVIEWED_RETRIEVAL_PATTERN = /^(?:official-service-directory|reviewed-)/u;
const QUERY_BOUND_ADAPTER_RETRIEVALS = new Set([
  "official-structured-climate-daily",
  "official-structured-eelis-natura",
  "official-structured-eelis-wfs",
  "official-structured-forecast-xml",
  "official-structured-hydrology-postgrest",
  "official-structured-statistics-pxweb",
  "official-structured-weather-xml",
  "official-tableau-csv",
]);

function conventionalEvidenceDocumentsFromListing(listing) {
  // Typed adapter rows are valid only for the exact query that their composer
  // revalidates. If that composer declines the row, do not recycle it as
  // ordinary lexical evidence for a neighboring legal, temporal or geographic
  // question. Forestry's multi-source structured comparison has its own
  // retrieval class and remains available to its dedicated planner below.
  const conventionalListing = {
    ...(listing || {}),
    items: (listing?.evidenceCandidates || listing?.items || [])
      .filter((document) => !QUERY_BOUND_ADAPTER_RETRIEVALS.has(document.retrieval)),
  };
  return evidenceDocumentsFromListing(conventionalListing);
}

function rankPortalDocuments(query, documents, options = {}) {
  return rankPublicSearchCandidates(query, documents, { ...options, intentDocuments: documents }).map((document) => ({
    ...document,
    score: document._ranking?.score || 0,
  }));
}


export function reassociateHydratedDocuments(candidates = [], hydratedDocuments = []) {
  const hydratedByUrl = new Map(hydratedDocuments
    .map((document) => [sourceWitnessKey(document), document])
    .filter(([key]) => key));
  return candidates.map((document) => {
    const key = sourceWitnessKey(document);
    return (key && hydratedByUrl.get(key)) || document;
  });
}



function remainingBudget(deadlineAt, reserveMs = 0) {
  return Math.max(0, deadlineAt - Date.now() - reserveMs);
}

function throwIfRequestAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

export function isSearchCacheEnabled(value = process.env.SEARCH_CACHE_ENABLED) {
  return String(value ?? "true").toLocaleLowerCase("et") !== "false";
}

export function requestCanStillPersist({ signal, deadlineAt, now = Date.now() } = {}) {
  return !signal?.aborted && (!Number.isFinite(deadlineAt) || now < deadlineAt);
}

export function retainSearchPersistence(operation, onBackgroundCleanup) {
  const cleanup = Promise.resolve(operation).catch(() => undefined);
  if (typeof onBackgroundCleanup === "function") {
    try {
      // Registration is synchronous: the HTTP owner retains its search slot
      // before this operation can return a response. The response itself does
      // not wait for optional telemetry/cache persistence.
      onBackgroundCleanup(cleanup);
      return Promise.resolve();
    } catch {
      // A caller without a working lease must wait for the bounded operation;
      // optional database work is never allowed to become detached.
    }
  }
  return cleanup;
}

export function shouldGenerateGroundedAnswer(draft) {
  return Boolean(
    draft?.evidence?.intentTemplate !== true
    && draft?.sources?.length
    && ["ranked-search-results", "reviewed-official-source", "broad-grounded-answer"].includes(draft?.evidence?.kind)
    && draft?.evidence?.answerable === true,
  );
}

function reviewedRelatedQuestions(reviewed = [], limit = 6) {
  const seen = new Set();
  return reviewed
    .map((value) => String(value || "").replace(/\s+/gu, " ").trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase("et").replace(/[^0-9a-zõäöüšž]+/giu, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 6, 6)));
}
// A retrieval plan can omit a source required by a reviewed template. Admit only candidates that template cites.
function selectIntentTemplateDocuments(query, classification, documents = []) {
  if (!TEMPLATE_INTENTS.has(classification?.intent)) return [];
  const previewSources = documents.map((source, index) => ({ ...source, citation: index + 1 }));
  const preview = buildIntentAnswer({
    query,
    intent: classification.intent,
    topic: classification.topic,
    sources: previewSources,
  });
  if (!preview) return [];
  const citations = new Set([
    ...(Array.isArray(preview.introCitations) ? preview.introCitations : []),
    ...(Array.isArray(preview.parts) ? preview.parts.flatMap((part) => part?.citations || []) : []),
  ].filter((citation) => Number.isInteger(citation) && citation > 0));
  return documents.filter((_, index) => citations.has(index + 1));
}


/** Internal draft builder. Its source admission metadata remains private. */
export async function createPortalDraft(query, {
  deadlineAt,
  signal,
  retrievalQuery = query,
  searchResults,
  sort = searchResults?.appliedFilters?.sort || "relevance",
  clientKey = "unknown",
} = {}) {
  throwIfRequestAborted(signal);
  const listing = searchResults || await prepareRankedSearchResults(retrievalQuery, {
    page: 1,
    pageSize: 12,
    deadlineAt,
    signal,
    clientKey,
    filters: { sort },
  });
  const intentClassification = analyzeQueryIntent(query);
  const candidates = conventionalEvidenceDocumentsFromListing(listing)
    .filter((document) => !isPermissionFocusedLawCandidate(document, intentClassification.intent));
  // Route-only federated cards stay visible as discovery results but cannot
  // become answer evidence. Hydrate only independently eligible sources so a
  // search never spends six page requests on cards discarded immediately.
  const rankingOptions = { sort, now: Date.now() };
  const retainedPlan = currentListingEvidencePlan(listing, retrievalQuery, candidates, sort);
  const focusedLawCandidate = candidates.find((document) => document._focusedLawTerm);
  const topicalLawCandidate = focusedLawCandidate ? null : candidates.find((document) => document._focusedLawTopic);
  const portalRanked = retainedPlan ? candidates : rankPortalDocuments(retrievalQuery, candidates, rankingOptions);
  // Keep the named rule section beside its reviewed lead instead of letting
  // ranking bury the only paragraph that answers the rule question.
  const topicalLawAt = Math.max(0, Math.min(1, portalRanked.indexOf(topicalLawCandidate)));
  const withoutTopicalLaw = topicalLawCandidate
    ? portalRanked.filter((document) => document.id !== topicalLawCandidate.id)
    : portalRanked;
  const ranked = focusedLawCandidate
    ? [focusedLawCandidate, ...portalRanked.filter((document) => document.id !== focusedLawCandidate.id)]
    : topicalLawCandidate
      ? [...withoutTopicalLaw.slice(0, topicalLawAt), topicalLawCandidate, ...withoutTopicalLaw.slice(topicalLawAt)]
      : portalRanked;
  const hydrationBudget = remainingBudget(deadlineAt, 7_000);
  const answerCandidates = retainedPlan
    ? ranked.filter((source) => retainedPlan.supportingDocumentIds.includes(source.id))
    : ranked.slice(0, 10);
  const hydratedTop = retainedPlan ? answerCandidates : hydrationBudget >= 500
    ? await hydrateOfficialDocuments(ranked.slice(0, 6), 6, {
      timeoutMs: Math.min(2_000, hydrationBudget),
      signal,
    })
    : answerCandidates.slice(0, 6);
  throwIfRequestAborted(signal);
  // IDs describe logical catalogue entries, not transport identity. A typed
  // dataset and its human landing page may deliberately have related IDs, and
  // a future malformed duplicate must never replace evidence from another URL.
  // Re-associate hydration only with the same canonical HTTPS resource.
  const hydrated = reassociateHydratedDocuments(answerCandidates, hydratedTop);
  const eligibleHydrated = evidenceDocumentsFromListing({ items: hydrated });
  const currentPlan = retainedPlan && currentListingEvidencePlan(listing, retrievalQuery, eligibleHydrated, sort);
  const reranked = currentPlan ? eligibleHydrated : rankPortalDocuments(retrievalQuery, eligibleHydrated, rankingOptions);
  const forestBalance = composeForestHarvestBalanceAnswer(retrievalQuery, reranked, query);
  const conventionalQuality = currentPlan ? {} : assessEvidence(retrievalQuery, reranked);
  const plannedEvidence = currentPlan || selectAnswerEvidence(retrievalQuery, reranked, { ...rankingOptions, preRanked: true });
  const directOverview = (() => {
    const source = directPortalOverviewSource(retrievalQuery) || directPortalReportSource(retrievalQuery);
    if (!source) return null;
    return reranked.find((document) => document.id === source.id
      || sameSourceResource(document.url, source.url)) || null;
  })();
  const mandateTerms = queryTerms(query);
  const mandateOrganizationQuery = /^mida\s+teeb\s+/u.test(normalize(query))
    && mandateTerms.length === 1
    && ["keskkonnaamet", "keskkonnaagentuur", "kliimaministeerium", "rmk"].includes(mandateTerms[0]);
  const plannedMandateOk = !mandateOrganizationQuery
    || (plannedEvidence?.passages || []).some((passage) => textHasQueryRoot(passage, mandateTerms[0])
      && /\b(?:teeb|tegevus\w*|ulesanne\w*|ülesanne\w*|haldab|korraldab|vastutab|pakub)\b/u.test(normalize(passage)));
  const focusedLawDocument = reranked.find((document) => document._focusedLawTerm || document._focusedLawTopic) || null;
  const quality = directOverview
    ? {
      ...conventionalQuality,
      strong: true,
      answerable: true,
      directDocumentId: directOverview.id,
      answerIntent: "portal-overview",
      supportingDocumentIds: [directOverview.id],
    }
    : plannedEvidence?.strong && plannedMandateOk
    ? {
      ...conventionalQuality,
      strong: true,
      answerable: true,
      directDocumentId: plannedEvidence.directDocumentId,
      answerIntent: plannedEvidence.kind,
      supportingDocumentIds: plannedEvidence.supportingDocumentIds,
    }
    : ["forest-area-method", "forest-overview"].includes(plannedEvidence?.kind) || plannedEvidence?.requiresStrictScopeEvidence
      ? {
        ...conventionalQuality,
        strong: false,
        directDocumentId: null,
        answerIntent: plannedEvidence.kind,
        supportingDocumentIds: [],
      }
    : focusedLawDocument
      ? {
        ...conventionalQuality,
        answerable: true,
        broad: true,
        directDocumentId: focusedLawDocument.id,
        broadDocumentId: focusedLawDocument.id,
      }
    : conventionalQuality;

  if (mandateOrganizationQuery && !plannedMandateOk) {
    quality.strong = false;
    quality.answerable = false;
    quality.directDocumentId = null;
    quality.supportingDocumentIds = [];
  }

  // A qualitative question with several on-topic official documents may be
  // answered by a cited synthesis even when no single passage answers it
  // alone. Quantity and year questions keep the strict single-passage path,
  // and a reviewed intent template or a focused law section still wins.
  const directAnswerDocument = quality.directDocumentId
    ? reranked.find((document) => document.id === quality.directDocumentId) || null
    : null;
  const lawOnlyAnswer = Boolean(directAnswerDocument?._lawSection
    || /riigiteataja\.ee/iu.test(String(directAnswerDocument?.url || "")));
  const synthesisDocuments = !forestBalance
    && (quality.answerable !== true || (lawOnlyAnswer && asksForImpact(retrievalQuery)))
    ? multiSourceSynthesisDocuments(retrievalQuery, reranked) || []
    : [];
  if (synthesisDocuments.length) {
    quality.strong = false;
    quality.answerable = true;
    quality.synthesis = true;
    quality.broad = true;
    quality.directDocumentId = synthesisDocuments[0].id;
    quality.broadDocumentId = synthesisDocuments[0].id;
    quality.supportingDocumentIds = synthesisDocuments.map((document) => document.id);
    quality.answerIntent = "multi-source-synthesis";
  }

  // Does the ranked set actually carry the question's subject? This decides
  // whether the answer may claim to have found "related official results" or
  // must report that no suitable official evidence exists at all. The visible
  // listing counts too: it is the set the user can open.
  const subjectCovered = Boolean(forestBalance)
    || quality.answerable
    || rankedSetCoversSubject(query, [
      ...reranked,
      ...conventionalEvidenceDocumentsFromListing(listing),
    ]);
  const intentTemplateDocuments = selectIntentTemplateDocuments(query, intentClassification, reranked);
  const allPlannedAnswerDocuments = answerEvidenceDocuments(reranked, plannedEvidence, forestBalance);
  const compositeRequiredIds = plannedEvidence?.kind === "forest-area-method"
    && !plannedEvidence.strong
    ? new Set(forestryIntentServiceDocumentIds(retrievalQuery))
    : null;
  const plannedAnswerDocuments = plannedEvidence?.requiresStrictScopeEvidence && !plannedEvidence.strong
    ? []
    : compositeRequiredIds
    ? allPlannedAnswerDocuments.filter((document) => compositeRequiredIds.has(document?.id))
    : allPlannedAnswerDocuments;
  const compositeNavigationDocuments = plannedEvidence?.kind === "forest-area-method"
    && !plannedEvidence.strong
    ? (listing?.items || []).filter((document) => document?.id === "forest-overview").slice(0, 1)
    : [];
  const seenAnswerDocuments = new Set();
  const evidenceAnswerDocuments = synthesisDocuments.length ? synthesisDocuments : plannedAnswerDocuments;
  const answerDocuments = [...compositeNavigationDocuments, ...evidenceAnswerDocuments, ...intentTemplateDocuments]
    .filter((document) => {
      const key = sourceWitnessKey(document) || document?.id;
      if (!key || seenAnswerDocuments.has(key)) return false;
      seenAnswerDocuments.add(key);
      return true;
    });
  const direct = quality.strong
    ? answerDocuments.find((document) => document.id === quality.directDocumentId)
    : null;
  const directCitation = direct
    ? answerDocuments.findIndex((document) => document.id === direct.id) + 1
    : 0;
  const draft = composeSearchResponse(query, answerDocuments, {
    answerable: Boolean(forestBalance) || quality.answerable,
    // "Seotud ametlikud tulemused" is a claim about the question's subject:
    // incidental matches on filler words never qualify (see
    // rankedSetCoversSubject).
    hasRelevantResults: subjectCovered,
    clarification: forestBalance || quality.answerable
      ? null
      : subjectCovered
        ? plannedEvidence?.reason === "national-area-method-evidence-required"
          ? "Leitud allikad ei kata korraga Eesti metsamaa pindala ja selle statistilist mõõtmismeetodit. Seetõttu ei esita ma osalist arvvastust; ava ametlik ülevaade või proovi uuesti."
          : "Leitud allikad ei kata küsimust piisavalt täpselt. Lisa konkreetne objekt, näitaja, piirkond või aasta."
        : undefined,
    evidenceKind: forestBalance
      ? "structured-forest-balance"
      : quality.strong
        ? "ranked-search-results"
        : quality.answerable ? "broad-grounded-answer" : "insufficient-evidence",
    limit: 10,
    quality,
    total: Number(listing.total || reranked.length),
  });
  if (quality.broad && !forestBalance) {
    // A qualitative answer must still say something verifiable when the model
    // is unavailable. Use the most query-relevant passage from the same
    // document that passed the broad eligibility check.
    const broadDocument = answerDocuments.find((document) => document.id === quality.broadDocumentId);
    // A focused law section already holds only the sentences about the term.
    const extract = broadDocument?._focusedLawTerm
      ? broadDocument._lawDefinition || String(broadDocument.content).split(/(?<=[.;])\s/u)[0].replace(/^\(\d+[^)]*\)\s*/u, "")
      : broadDocument ? directEvidenceExtract(retrievalQuery, broadDocument, null, { requireSubject: true }) : "";
    const broadCitation = broadDocument
      ? answerDocuments.findIndex((document) => document.id === broadDocument.id) + 1
      : 0;
    if (extract && isNonAnswerText(extract)) {
      draft.answer = { ...draft.answer, eyebrow: NO_ANSWER_EYEBROW, intro: NO_ANSWER_INTRO };
      draft.clarification = null;
    } else if (extract && broadCitation > 0) {
      draft.answer = {
        eyebrow: "Allikapõhine vastus",
        title: draft.answer.title,
        intro: extract,
        introCitations: [broadCitation],
        parts: [],
        note: "",
      };
      draft.clarification = null;
      // The law's own definition, word for word, needs no rewording by the model.
      if (broadDocument?._lawDefinition) draft.evidence.lawDefinitionIntro = extract;
      // A broad match shares a word with the question ("RMK", "metsamaa"), not
      // necessarily its subject: an RMK area figure for a Christmas tree price.
      // Without every content word of the question it is not shown as the
      // answer; the model may still answer from the same document.
      else if (!broadDocument?._focusedLawTerm && !cardAnswersQueryWords(retrievalQuery, extract)) {
        draft.evidence.offTargetIntro = extract;
      }
    }
  }
  if (forestBalance) {
    draft.answer = forestBalance.answer;
    draft.related = forestBalance.related;
    if (forestBalance.chart) draft.chart = forestBalance.chart;
    draft.evidence.answerable = true;
  }
  if (plannedEvidence?.reason === "national-area-method-evidence-required") {
    draft.answer.eyebrow = "Mõõtmismeetodi tõend puudub";
    draft.answer.intro = "Leitud ametlikud allikad ei kata korraga nii Eesti metsamaa pindala kui ka seda, kuidas riiklik hinnang saadakse. Ma ei esita ainult üht poolt vastusest ega lisa kontrollimata metoodikat.";
    draft.answer.introCitations = [];
    draft.answer.parts = [];
  }
  const forestDataSourcesFallback = !forestBalance
    ? composeForestDataSourcesFallback(query, plannedEvidence, draft.sources, draft.answer)
    : null;
  const forestDepletionFallback = !forestBalance && !forestDataSourcesFallback
    ? composeForestDepletionFallback(query, plannedEvidence, draft.sources, draft.answer)
    : null;
  const genericForestOverviewFallback = !forestBalance && !forestDataSourcesFallback && !forestDepletionFallback
    ? composeGenericForestOverviewFallback(query, plannedEvidence, draft.sources, draft.answer)
    : null;
  const officialForestryFallback = !forestBalance && !forestDataSourcesFallback && !forestDepletionFallback && !genericForestOverviewFallback
    ? composeOfficialForestryEvidenceFallback(query, plannedEvidence, draft.sources, draft.answer)
    : null;
  const directExtract = !forestBalance && direct
    ? directEvidenceExtract(retrievalQuery, direct, plannedEvidence)
    : "";
  const directMissesQuery = Boolean(directExtract) && !extractAnswersQuery(retrievalQuery, directExtract);
  // Reviewed catalogue pages may embed one forest-notice sentence beside the
  // data the user actually asks for. A passage that fails the query check must
  // not be published just because its source was reviewed.
  const unrelatedNoticePassage = directMissesQuery
    && isForestNoticeFilingPassage(directExtract)
    && intentClassification.topic !== "forest_notice"
    && !/\b(?:metsateatis|raieteatis)\w*/iu.test(retrievalQuery);
  const sourceClaimPairs = !forestBalance
    ? composeSourceClaimPairs(query, plannedEvidence, draft.sources)
    : null;
  if (plannedEvidence?.kind === "forest-fact-check") {
    // The source already provides the claim and its response. Preserve that
    // distinction deterministically instead of asking a model to restate an
    // allegation as a fact or silently remove the historical qualification.
    if (sourceClaimPairs) {
      draft.answer = sourceClaimPairs;
      draft.evidence.kind = "structured-source-fact-check";
    } else {
      draft.evidence.answerable = false;
    }
  } else if (forestDataSourcesFallback) {
    draft.answer = forestDataSourcesFallback;
    // The fallback is a terse rendering of raw visible evidence, not a new
    // source. Do not feed it back to Luna as if it were independently
    // reviewed evidence; Luna must ground any replacement in the sources.
    draft.evidence.syntheticFallback = "forest-data-sources";
  } else if (forestDepletionFallback) {
    draft.answer = forestDepletionFallback;
    draft.evidence.syntheticFallback = "forest-depletion";
  } else if (genericForestOverviewFallback) {
    draft.answer = genericForestOverviewFallback;
    draft.evidence.syntheticFallback = "forest-overview";
  } else if (officialForestryFallback) {
    draft.answer = officialForestryFallback;
    draft.evidence.syntheticFallback = "official-forestry-evidence";
    // Keep this marker aligned with final card validation. A narrower lexical
    // check can withdraw an answer the final gate already accepts.
    if (!answerCardAnswersQuery(draft, retrievalQuery)) {
      draft.evidence.offTargetIntro = officialForestryFallback.intro;
    }
  } else if (directMissesQuery && !plannedEvidence?.strong
    && (!REVIEWED_RETRIEVAL_PATTERN.test(direct.retrieval || "") || unrelatedNoticePassage)) {
    // The model may still answer from these sources. Without it, say there is
    // no answer rather than presenting a passage that does not answer.
    draft.answer.eyebrow = NO_ANSWER_EYEBROW;
    draft.answer.intro = NO_ANSWER_INTRO;
    draft.answer.introCitations = [];
  } else if (directExtract) {
    draft.answer.eyebrow = "Allikapõhine kokkuvõte";
    draft.answer.intro = directExtract;
    draft.answer.introCitations = [directCitation];
  }
  // A reviewed fallback can pass the final card check even when an earlier
  // lexical witness marked its lead as off target. Release that marker before
  // any blanking, because a blank card short circuits the same check.
  releaseAcceptedOffTargetIntro(draft, retrievalQuery);
  // Every route above can fill the card, so this rule check runs after all of
  // them. The model may still answer from the same sources.
  if (!answerCardAnswersQuery(draft, retrievalQuery)) {
    draft.answer = { ...draft.answer, eyebrow: NO_ANSWER_EYEBROW, intro: NO_ANSWER_INTRO, introCitations: [], parts: [] };
    draft.clarification = null;
  }
  const definitionRoots = queryTerms(retrievalQuery);
  let packPlan = plannedEvidence;
  if (draft.evidence.answerable && draft.sources.length === 1
    && definitionRoots.length && definitionRoots.every((root) => root === "smi")) {
    const source = draft.sources[0];
    const definition = selectSmiDefinitionEvidence(source);
    if (definition.satisfies) {
      // Select actual definition and scope passages once; a summary synonym
      // must not become a second definition in the single-source model pack.
      packPlan = {
        requiredRoles: ["definition"],
        roleWitnesses: { definition: {
          documentId: source.id, ...sourceEvidenceBinding(source), passages: definition.passages,
        } },
        requiredOnly: true,
      };
      draft.answer = {
        ...draft.answer,
        eyebrow: "Allikapõhine kokkuvõte",
        intro: definition.passages.slice(0, 2).join(" "),
        introCitations: [sourceCitation(source)],
        parts: [],
      };
    }
  }
  const intentNormalized = normalize(query);
  const firePreventionIntent = /(?:metsa)?poleng|tulekahju|tuleoht/u.test(intentNormalized)
    && /(?:hoida|valtida|ennetada|kaitsta|ennetus|torje)/u.test(intentNormalized);
  const fellingProcedureIntent = /eraldis/u.test(intentNormalized)
    && /(?:taotle|taotlus|taotlemine)/u.test(intentNormalized);
  const intentAnswer = normalize(draft.answer?.intro || "");
  const radonRiskIntent = /radoon/u.test(intentNormalized)
    && /(?:ohtlik|tervis|risk|piirnorm)/u.test(intentNormalized);
  const intentCovered = !firePreventionIntent && !fellingProcedureIntent && !radonRiskIntent
    || (firePreventionIntent && /(?:poleng|tulekahju|tuleoht)/u.test(intentAnswer))
    || (fellingProcedureIntent && /(?:eraldis|raie|metsateatis)/u.test(intentAnswer) && /taotl/u.test(intentAnswer))
    || (radonRiskIntent && /(?:tervis|ohtlik|risk|piirnorm|radoonioht)/u.test(intentAnswer)
      && !/(?:seminar|konverents|koolitus|toimub|korraldab|registreeru|külasta)/u.test(intentAnswer));
  if (!intentCovered) {
    draft.answer = {
      eyebrow: "Vajan täpsustust",
      title: draft.answer?.title || query,
      intro: "Leitud allikad ei kata küsimuse konkreetset tegevust piisavalt täpselt. Ma ei esita sama teema üldist statistikat vastusena.",
      introCitations: [],
      parts: [],
      note: "",
    };
    draft.clarification = "Täpsusta tegevust või objekti; praegused allikad kirjeldavad teist teemat.";
    draft.evidence.answerable = false;
  }
  const intentTemplateAnswer = buildIntentAnswer({
    query,
    intent: intentClassification.intent,
    topic: intentClassification.topic,
    sources: draft.sources,
  });
  if (intentTemplateAnswer) {
    // A supported template replaces the answer that set this marker.
    delete draft.evidence.offTargetIntro;
    draft.answer = intentTemplateAnswer;
    draft.evidence = {
      ...draft.evidence,
      answerable: true,
      answerIntent: intentClassification.intent,
      intentTemplate: true,
    };
    draft.clarification = null;
  }
  const evidencePack = buildEvidencePack({ sources: draft.sources, query: retrievalQuery, plan: packPlan });
  draft.evidence.sourceEvidencePack = evidencePack;
  const finalized = draft.evidence?.answerable === true
    ? finalizeVisibleAnswerWitnesses(draft, retrievalQuery, evidencePack)
    : attachEvidenceExcerpts(draft, retrievalQuery, evidencePack);
  // A verified official timing excerpt does not need another model pass.
  if (isNoticeReviewDurationQuestion(retrievalQuery)
      && finalized.evidence?.answerable === true
      && evidencePack.complete === true
      && finalized.answer?.intro
      && finalized.answer.eyebrow !== NO_ANSWER_EYEBROW
      && finalized.answer.introCitations?.length === 1
      && !finalized.answer.parts?.length
      && finalized.sources?.[finalized.answer.introCitations[0] - 1]?.id === "forest-notice-guidance"
      && !citesRawLawSection(finalized)
      && answerCardAnswersQuery(finalized, retrievalQuery)) {
    finalized.evidence.intentTemplate = true;
  }
  return finalized;
}

const SMI_FIGURE_PATTERN = /Eesti metsamaa pindala \d/u;

function answerCardText(draft) {
  return [draft.answer?.intro, ...(draft.answer?.parts || []).map((part) => part?.text)].filter(Boolean).join(" ");
}
function answerCardAnswersQuery(draft, query, { deterministicEvidence = true } = {}) {
  if (!draft.answer?.intro || draft.answer.eyebrow === NO_ANSWER_EYEBROW) return true;
  const intro = String(draft.answer.intro);
  const text = answerCardText(draft);
  const eurostatLead = draft.evidence?.kind === "structured-forest-balance"
    && draft.answer.introCitations?.some((citation) => draft.sources?.[citation - 1]?.id === "forest-balance-eurostat");
  const comparisonEvidenceKind = deterministicEvidence
    ? eurostatLead
      ? "structured-forest-balance-net"
      : ["structured-forest-balance", "structured-source-fact-check"].includes(draft.evidence?.kind)
        ? draft.evidence.kind
        : String(draft.evidence?.quality?.answerIntent || "")
    : "";
  // Revalidate the original tuple and its exact visible statement, rather than
  // treating the evidence label as proof that a geographic comparison exists.
  const municipal = deterministicEvidence && draft.evidence?.kind === "structured-municipal-waste-recycling"
    ? composeMunicipalWasteRecyclingResponse(query, draft.sources, { now: Date.parse(draft.generatedAt) })
    : null;
  const municipalComparison = municipal
    && municipal.sources[0]._municipalWasteRecycling.euRate !== null
    && intro === municipal.answer.intro
    && draft.answer.introCitations?.length === 1
    && draft.answer.introCitations[0] === 1;
  // A copied source passage has no model check behind it, so it must at least
  // give the amount asked and speak of stand age when asked. The general
  // forest notice guide comes up for every clear-cut condition question; its
  // passage answers one only when it names the clear-cut.
  const sourceExtract = deterministicEvidence && SOURCE_EXTRACT_EYEBROWS.has(draft.answer.eyebrow);
  const fromNoticeGuide = (draft.answer.introCitations || []).some((citation) => draft.sources?.[citation - 1]?.id === "forest-notice-guidance");
  if (sourceExtract && (!givesAskedAmount(query, text) || !namesAskedAgeClass(query, text)
    || (fromNoticeGuide && !namesAskedClearcut(query, text)))) return false;
  const broadDataNavigation = draft.answer.eyebrow === "Ametlik andmeteenus";
  const metsainfoHarvestMismatch = (draft.sources || []).some((source) => source?.id === "metsainfo-hetkeseis")
    && /raie|raiut/u.test(normalize(query)) && !/raie|raiut/u.test(normalize(text));
  if ((sourceExtract || broadDataNavigation) && metsainfoHarvestMismatch) return false;
  return answersAskedConcept(query, text)
    && namesDefinitionTerm(query, intro)
    && rawLawLeadAnswersQuery(query, intro)
    && (municipalComparison || comparisonAnswersQuery(query, text, comparisonEvidenceKind));
}

export function releaseAcceptedOffTargetIntro(draft, query) {
  if (draft?.evidence?.offTargetIntro && answerCardAnswersQuery(draft, query)) {
    delete draft.evidence.offTargetIntro;
  }
  return draft;
}


function withoutOffTargetAnswer(draft, query) {
  if (!draft.answer?.intro || draft.answer.eyebrow === NO_ANSWER_EYEBROW) return draft;
  const isValidatedWeatherAnswer = draft.evidence?.kind === "structured-current-weather"
    && draft.evidence.answerable === true
    && draft.evidence.documentIds?.includes("current-weather-observations")
    && draft.sources?.some((source) => source?.id === "current-weather-observations");
  if (isValidatedWeatherAnswer) return draft;
  const statesSmiFigure = SMI_FIGURE_PATTERN.test(draft.answer.intro);
  // An area figure does not answer a question about the growing stock.
  const wrongSmiFigure = statesSmiFigure && /tagavara|üldvaru/iu.test(query) && !/tagavara|üldvaru|\bm3\b|m³|tihumeet/iu.test(answerCardText(draft));
  if (answerCardAnswersQuery(draft, query) && !wrongSmiFigure
    && (!statesSmiFigure || asksOnlyForestAmount(query))) return draft;
  return {
    ...draft,
    answer: { ...draft.answer, eyebrow: NO_ANSWER_EYEBROW, intro: NO_ANSWER_INTRO, introCitations: [], parts: [] },
    clarification: null,
  };
}



// Raw statutory sections are shown through an admitted local intent template
// or an answer that exactly matches a verified definition passage. Model text
// that only cites a law section stays blank unless it passes the answer checks.
const LAW_SECTION_URL = /riigiteataja\.ee\/.*#para/u;

function citesRawLawSection(draft) {
  const answer = draft.answer || {};
  const cited = [...(answer.introCitations || []), ...(answer.parts || []).flatMap((part) => part?.citations || [])];
  return cited.some((citation) => LAW_SECTION_URL.test(draft.sources?.[Number(citation) - 1]?.url || ""));
}

function withoutRawLawSection(draft) {
  if (!draft.answer?.intro || !citesRawLawSection(draft)) return draft;
  if (draft.evidence?.intentTemplate === true) return draft;
  if (draft.evidence?.lawDefinitionIntro && draft.answer.intro === draft.evidence.lawDefinitionIntro) return draft;
  return {
    ...draft,
    answer: { ...draft.answer, eyebrow: NO_ANSWER_EYEBROW, intro: NO_ANSWER_INTRO, introCitations: [], parts: [] },
    clarification: null,
  };
}


async function searchWithinBudget(cleanQuery, {
  startedAt,
  deadlineAt,
  signal,
  assessmentQuery = cleanQuery,
  retrievalQuery = cleanQuery,
  searchResults,
  filters = {},
  conversationContext = "",
  llmClientKey = "unknown",
  useCache = true,
  onDraft,
  onPrivateDraft,
  onModelStart,
  onModelUsage,
  onBackgroundCleanup,
  generateAnswer = generateGroundedAnswer,
  persistSearch = recordSearch,
  readCache = readSearchCache,
}) {
  throwIfRequestAborted(signal);
  const assessment = assessSearchQuery(assessmentQuery);
  // Out-of-scope and private-person requests are never cache keys, database
  // telemetry, or model/retrieval inputs. Keep this defensive boundary before
  // even a cache read so legacy rows cannot bypass the current classifier.
  if (assessment.kind === "out-of-scope") {
    return publicResponse(composeScopeResponse(cleanQuery, assessment), { now: startedAt });
  }
  const cacheFilters = {
    ...(searchResults?.appliedFilters || {}),
    ...(filters || {}),
  };
  const cacheEnabled = useCache && !String(conversationContext || "").trim()
    && isSearchCacheEnabled() && !isCurrentWeatherObservationQuery(cleanQuery);
  const cacheRevision = createSearchAnswerCacheRevision({
    responseRevision: SEARCH_RESPONSE_REVISION,
    lawRevision: forestLawVersionStamp(),
    listingRevision: searchListingRevision(searchResults),
    queryRevision: searchResults?.queryRevision,
    windowId: searchResults?.windowId,
    filters: cacheFilters,
  });
  const listingBackedCache = cacheEnabled && Boolean(searchResults?.items?.length);
  if (listingBackedCache) {
    const cached = await readSearchAnswerCache({
      query: cleanQuery,
      revision: cacheRevision,
      listing: searchResults,
      filters: cacheFilters,
      enabled: listingBackedCache,
      readCache,
      validate: cachedSourcesBelongToListing,
      signal,
      deadlineAt,
    });
    throwIfRequestAborted(signal);
    if (cached) {
      // Cache hits cross the public serializer with explicit zero new usage.
      return publicResponse(cached, { now: startedAt });
    }
  }

  let draft;
  const structuredIndicatorCandidate = composeCurrentWeatherObservationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeNationalWeatherForecastResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeLatestPublishedHydrologyResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeEelisEmajogiPublicWatercourseResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeEelisNaturaSiteResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeHarvestShareResponse(retrievalQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeMetsandusteatmikResponse(retrievalQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeSmiIncrementResponse(retrievalQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeForestSeriesResponse(retrievalQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeStatisticsWaterAbstractionResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeStatisticsHazardousWasteResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeStatisticsTotalWasteRecoveryResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeStatisticsWastewaterBht7Response(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeClimateDailyMeanResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeMunicipalWasteRecyclingResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeWasteFacilitiesNavigationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeTopicDataOverviewResponse(retrievalQuery, searchResults?.items, {
    total: searchResults?.total,
    publicQuery: cleanQuery,
  }) || composeOfficialServiceNavigationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeAmbiguousDomainGuidanceResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  });
  // A topic overview must not answer "what is X" over the law section defining X.
  const broadNavigationRejected = structuredIndicatorCandidate?.answer?.eyebrow === "Ametlik andmeteenus"
    && !answerCardAnswersQuery(structuredIndicatorCandidate, cleanQuery);
  const structuredIndicatorDraft = !searchResults?.items?.[0]?._focusedLawTerm
    && !broadNavigationRejected
    && draftMatchesListingAndFilters(structuredIndicatorCandidate, searchResults, filters)
    ? structuredIndicatorCandidate : null;
  if (structuredIndicatorDraft) {
    draft = structuredIndicatorDraft;
  } else if (assessment.kind !== "answerable") {
    draft = composeScopeResponse(cleanQuery, assessment);
    if (searchResults && !draftSourcesBelongToListing(draft, searchResults)) {
      const filteredDocuments = rankPortalDocuments(
        retrievalQuery,
        conventionalEvidenceDocumentsFromListing(searchResults),
        { sort: filters.sort, now: startedAt },
      );
      draft = composeSearchResponse(cleanQuery, filteredDocuments, {
        answerable: false,
        hasRelevantResults: Boolean(searchResults?.items?.length),
        clarification: hasDefaultSearchFilters(filters)
          ? "Selle küsimuse jaoks vajalikku reaalaja- või registriallikat ei leitud nähtavast tulemusehulgast. Täpsusta päringut või proovi uuesti."
          : "Valitud filtrid välistavad selle küsimuse jaoks vajaliku reaalaja- või registriallika. Lähtesta filter või vali sobiv ametlik sisutüüp.",
        evidenceKind: "filtered-scope-exclusion",
        limit: 6,
        total: Number(searchResults.total || filteredDocuments.length),
      });
    }
  } else {
    const cadastreCandidate = await answerCadastreQuestion(cleanQuery, { signal, deadlineAt });
    const cadastreDraft = draftMatchesListingAndFilters(cadastreCandidate, searchResults, filters)
      ? cadastreCandidate
      : null;
    draft = cadastreDraft || await createPortalDraft(cleanQuery, {
      deadlineAt,
      signal,
      retrievalQuery,
      searchResults,
      clientKey: llmClientKey,
      sort: filters.sort || "relevance",
    });
  }
  if (!draftMatchesListingAndFilters(draft, searchResults, filters)) {
    const filteredDocuments = rankPortalDocuments(
      retrievalQuery,
      conventionalEvidenceDocumentsFromListing(searchResults)
        .filter((document) => resultMatchesFilters(document, filters)),
      { sort: filters.sort, now: startedAt },
    );
    draft = composeSearchResponse(cleanQuery, filteredDocuments, {
      answerable: false,
      hasRelevantResults: Boolean(searchResults?.items?.length),
      clarification: "Valitud filtrid välistavad vastuse jaoks vajaliku tõendi või see puudub nähtavast tulemusehulgast. Lähtesta filter või täpsusta päringut.",
      evidenceKind: "filtered-source-exclusion",
      limit: 6,
      total: Number(searchResults?.total || filteredDocuments.length),
    });
  }
  throwIfRequestAborted(signal);
  // Every composer crosses the same one-pack boundary, including reviewed
  // navigation and typed adapters that do not use createPortalDraft.
  if (!draft.evidence?.sourceEvidencePack) {
    draft.evidence = {
      ...draft.evidence,
      sourceEvidencePack: buildEvidencePack({ sources: draft.sources, query: retrievalQuery }),
    };
    draft = draft.evidence.answerable === true
      ? finalizeVisibleAnswerWitnesses(draft, retrievalQuery, draft.evidence.sourceEvidencePack)
      : attachEvidenceExcerpts(draft, retrievalQuery, draft.evidence.sourceEvidencePack);
  }
  draft = withoutOffTargetAnswer(draft, retrievalQuery);
  draft.generatedAt = new Date().toISOString();
  const evidencePack = draft.evidence?.sourceEvidencePack;
  const canGenerate = shouldGenerateGroundedAnswer(draft) && evidencePack?.complete === true
    && !(draft.evidence?.lawDefinitionIntro && draft.answer?.intro === draft.evidence.lawDefinitionIntro);
  const llmBudget = remainingBudget(deadlineAt, 300);
  if (canGenerate && llmBudget >= 500 && (typeof onDraft === "function" || typeof onPrivateDraft === "function") && !citesRawLawSection(draft)) {
    throwIfRequestAborted(signal);
    const streamedDraft = withForestContextChart(withLandUseShareChart(withoutOffTargetFallback(draft), retrievalQuery, searchResults?.items, { now: startedAt }), retrievalQuery, searchResults?.items, { now: startedAt });
    // A fallback that replays a public snapshot can no longer ask the publisher
    // decision behind its copied text, because the projection that produced it
    // removed the private witness. Keep the admitted draft itself for that
    // replay, and serialize it on the clock that actually writes the answer.
    if (typeof onPrivateDraft === "function") onPrivateDraft(structuredClone(streamedDraft));
    if (typeof onDraft === "function") onDraft(publicResponse(streamedDraft, { now: startedAt }));
  }
  // Keep the accepted deterministic result detached from both the provider
  // input and any streamed consumer. A ready model answer must rebind its
  // visible citation witnesses before it can replace this snapshot.
  // The off-target card is still the model's starting card. A model answer
  // that only repeats it is the same wrong answer, so it is rejected.
  const deterministicDraft = withoutOffTargetFallback(structuredClone(draft));
  // Keep opaque source admission on our snapshot, never on provider copies.
  // Cloning a descriptor cannot recreate its private constructor binding.
  deterministicDraft.sources = deterministicDraft.sources.map((source, index) => ({
    ...source,
    ...(draft.sources[index]._visibleServiceWitness
      ? { _visibleServiceWitness: draft.sources[index]._visibleServiceWitness } : {}),
  }));
  deterministicDraft.evidence.sourceEvidencePack = evidencePack;
  // Never hand the model the full remaining budget: its attempt timers
  // would then run into the shared deadline, and the resulting abort
  // converts a ready cited draft into a timeout message. Keep a tail margin
  // for rebinding, serialization and transport so the deterministic draft
  // is always still deliverable; skip the attempt when even that margin
  // does not fit.
  const LLM_TAIL_MARGIN_MS = 1_500;
  const llmAttemptCeilingMs = llmBudget - LLM_TAIL_MARGIN_MS;
  const modelStarted = canGenerate
    && llmAttemptCeilingMs >= 500
    && !citesRawLawSection(draft);
  if (modelStarted && typeof onModelStart === "function") onModelStart();
  const llmResult = modelStarted
    ? await generateAnswer(cleanQuery, modelStartingDraft(draft), {
      timeoutMs: llmAttemptCeilingMs,
      signal,
      retrievalQuery,
      clientKey: llmClientKey,
      evidencePack,
    })
    : { answer: null, acceptedClaims: [], attempt: {
      provider: "deterministic-current-evidence",
      status: shouldGenerateGroundedAnswer(draft) ? "degraded" : "not-applicable",
      reason: !shouldGenerateGroundedAnswer(draft) ? "not-applicable"
        : !evidencePack?.complete ? "evidence-insufficient" : "budget",
    } };
  if (modelStarted && typeof onModelUsage === "function") {
    onModelUsage(searchUsageTelemetry(llmResult, { modelStarted: true }));
  }
  throwIfRequestAborted(signal);

  let visibleCheck = "";
  let visibleRejected = false;
  if (llmResult.answer) {
    const modelDraft = rebindAnswerCitationsToVisibleWitnesses(attachEvidenceExcerpts({
      ...structuredClone(deterministicDraft),
      sources: deterministicDraft.sources,
      evidence: deterministicDraft.evidence,
      answer: structuredClone(llmResult.answer),
    }, retrievalQuery, evidencePack));
    // Validation proves that a model claim is grounded in the internal
    // evidence pack. This second boundary proves that the same claim is also
    // supported by the bounded excerpt a reader can actually inspect.
    visibleCheck = !answerClaimsHaveVisibleWitnesses(modelDraft) ? "visible-witness-missing"
      : !answerCardAnswersQuery(modelDraft, retrievalQuery, { deterministicEvidence: false }) ? "asked-concept-missing"
        : noticeAnswerWithoutNoticeIntent(cleanQuery, answerCardText(modelDraft)) ? "unrelated-notice-in-answer"
          : repeatsOffTargetLead(draft, answerCardText(modelDraft)) ? "repeats-off-target-lead" : "";
    visibleRejected = Boolean(visibleCheck);
    draft = visibleRejected ? withoutRawLawSection(deterministicDraft) : modelDraft;
  } else {
    draft = withoutRawLawSection(deterministicDraft);
  }
  if (noticeAnswerWithoutNoticeIntent(cleanQuery, answerCardText(draft))) {
    draft = { ...draft, answer: { ...draft.answer, eyebrow: NO_ANSWER_EYEBROW, intro: NO_ANSWER_INTRO, introCitations: [], parts: [], note: "" }, clarification: null };
  }
  // The model's answer was turned down because it did not answer the question
  // (no amount, wrong place, other intent). The source card shown instead must
  // then pass the same test itself: round 15 showed "Küll aga … RMK ei ole ühtki
  // vääriselupaika raiunud" for "kui palju on vääriselupaiku". A card that does
  // answer (a reviewed figure) stays; structured figure and law cards stay.
  if (SOURCE_EXTRACT_EYEBROWS.has(draft.answer?.eyebrow)
    && INTENT_REJECTION.test((!llmResult.answer || visibleRejected) ? attemptCheckCode(visibleCheck, llmResult.attempt) || "" : "")) {
    let cardAnswers = true;
    try {
      assertAnswerAddressesQuery([draft.answer.intro, ...(draft.answer.parts || []).map((part) => part.text)].join(" "), retrievalQuery);
    } catch {
      cardAnswers = false;
    }
    if (!cardAnswers) {
      draft = { ...draft, answer: { ...draft.answer, eyebrow: NO_ANSWER_EYEBROW, intro: NO_ANSWER_INTRO, introCitations: [], parts: [], note: "" }, clarification: null };
    }
  }
  draft.usage_telemetry = searchUsageTelemetry(llmResult, { modelStarted });
  // The caveat scopes an excerpt the card shows. A no-answer card shows none,
  // so it never gains the note, whether the blanking happened above or the
  // model itself returned the no-answer card.
  if (draft.answer?.eyebrow !== NO_ANSWER_EYEBROW) {
    const noticeCaveat = withNoticeScopeCaveat(draft.answer?.note, cleanQuery, draft.evidence?.answerIntent);
    if (noticeCaveat !== draft.answer?.note) draft.answer = { ...draft.answer, note: noticeCaveat };
  }
  // Related navigation is reviewed local product copy, never provider output.
  draft.related = reviewedRelatedQuestions(draft.related, 6);
  draft.generatedAt = new Date().toISOString();
  draft = withForestContextChart(withLandUseShareChart(draft, retrievalQuery, searchResults?.items, { now: startedAt }), retrievalQuery, searchResults?.items, { now: startedAt });
  const publishedResponse = publicResponse(draft, { now: startedAt });
  const deterministicResponse = publicResponse(deterministicDraft, { now: startedAt });
  const durationMs = Date.now() - startedAt;
  const evidenceKind = draft.evidence?.kind;
  const spatialDegraded = evidenceKind === "official-spatial-snapshot"
    && Object.values(draft.evidence?.states || {}).some((state) => state === "unavailable");
  const structuredStale = evidenceKind === "structured-forest-balance"
    && draft.sources.some((source) => source._stale === true);
  const cacheEligible = (
    evidenceKind === "safe-abstention"
    || evidenceKind === "needs-clarification"
    || evidenceKind === "official-live-routing"
    || evidenceKind === "structured-national-weather-forecast"
    || evidenceKind === "structured-source-fact-check"
    || (evidenceKind === "structured-forest-balance" && !structuredStale)
    || (evidenceKind === "official-spatial-snapshot" && !spatialDegraded)
  );
  const ttlMinutes = [
    "official-live-routing",
    "structured-national-weather-forecast",
    "structured-forest-balance",
  ].includes(evidenceKind) ? 5 : 20;
  const publishedBindings = Object.fromEntries((publishedResponse.sources || []).map((source) => {
    const originals = draft.sources.filter((candidate) => (
      stablePublicResultId(candidate) === source.id
      && candidate.url === source.url && candidate.locator === source.locator
      && Number.isInteger(candidate.citation) && candidate.citation > 0
    ));
    if (originals.length !== 1) return [source.citation, undefined];
    const original = originals[0];
    const binding = evidencePack?.bindings[original.citation];
    const retained = sourceEvidenceBinding(original);
    const packed = evidencePack?.entries.filter((entry) => entry.citation === original.citation);
    return [source.citation, binding && packed?.length === 1
      && retained.witnessKey !== null && retained.witnessKey === binding.witnessKey
      && retained.version === binding.version && retained.snapshotHash === binding.snapshotHash ? binding : undefined];
  }));
  const outcome = deliveredOutcome({
    publishedResponse, deterministicResponse, deterministicCacheValue: deterministicDraft, acceptedClaims: llmResult.acceptedClaims,
    attempt: visibleRejected && llmResult.attempt
      ? { ...llmResult.attempt, reason: "visible-rejected" } : llmResult.attempt,
    evidenceKind, cacheEligible, publishedBindings,
  });
  // Status words only, never question or provider text: why the model did or
  // did not contribute is otherwise visible only inside the database. A local
  // rejection records the rejected sentence and the source sentence it was
  // compared with, and that text stays in the private attempt record, so the
  // public card carries the codes alone.
  const response = outcome.attempt
    ? {
      ...outcome.response,
      answerAttempt: {
        status: outcome.attempt.status,
        reason: outcome.attempt.reason,
        ...(attemptCheckCode(visibleCheck, llmResult.attempt) ? { check: attemptCheckCode(visibleCheck, llmResult.attempt) } : {}),
      },
    }
    : outcome.response;
  const acceptedModelAnswer = outcome.answerProvider !== "deterministic-current-evidence"
    && outcome.answerStatus === "ready"
    && !visibleRejected
    && Array.isArray(llmResult.acceptedClaims)
    && llmResult.acceptedClaims.length > 0;
  const cacheableResponse = listingBackedCache
    && Boolean(response.answer)
    && (outcome.cacheResponse || acceptedModelAnswer || draft.evidence?.intentTemplate === true);
  if (cacheableResponse && requestCanStillPersist({ signal, deadlineAt })) {
    const cacheResponse = prepareSearchAnswerCacheResponse(response, draft.sources, { now: Date.now() });
    if (cacheResponse) {
      const copyExpiry = publicationCopyExpiry(publishedResponse);
      writeSearchAnswerCache({
        query: cleanQuery,
        revision: cacheRevision,
        response: cacheResponse,
        expiresAt: Math.min(
          Date.now() + ttlMinutes * 60_000,
          copyExpiry ?? Number.POSITIVE_INFINITY,
        ),
      });
    }
  }

  const fanoutCounts = fanoutCountsFromListing(searchResults);
  if (requestCanStillPersist({ signal, deadlineAt })) {
    await retainSearchPersistence(persistSearch({
      query: cleanQuery,
      response,
      cacheValue: deterministicDraft,
      cacheOutcome: outcome,
      revision: cacheRevision,
      answerProvider: outcome.answerProvider,
      answerStatus: outcome.answerStatus,
      attempt: outcome.attempt,
      ...(fanoutCounts.subqueryCount > 0 ? { fanout: fanoutCounts } : {}),
      documentIds: draft.evidence?.documentIds || [],
      durationMs,
      ttlMinutes,
      cacheResponse: listingBackedCache && outcome.cacheResponse,
      signal,
      deadlineAt,
    }), onBackgroundCleanup);
  }
  return response;
}

export function searchTimeoutFallback(cleanQuery, {
  assessmentQuery = cleanQuery,
  searchResults,
  filters = {},
  reason = "deadline",
  startedAt = Date.now(),
} = {}) {
  const assessment = assessSearchQuery(assessmentQuery);
  const structuredCandidate = composeCurrentWeatherObservationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeNationalWeatherForecastResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeLatestPublishedHydrologyResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeEelisEmajogiPublicWatercourseResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeEelisNaturaSiteResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeHarvestShareResponse(assessmentQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeMetsandusteatmikResponse(assessmentQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeSmiIncrementResponse(assessmentQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeForestSeriesResponse(assessmentQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeStatisticsWaterAbstractionResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeStatisticsHazardousWasteResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeStatisticsTotalWasteRecoveryResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeStatisticsWastewaterBht7Response(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeClimateDailyMeanResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeMunicipalWasteRecyclingResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeWasteFacilitiesNavigationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeTopicDataOverviewResponse(assessmentQuery, searchResults?.items, {
    total: searchResults?.total,
    publicQuery: cleanQuery,
  }) || composeOfficialServiceNavigationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeAmbiguousDomainGuidanceResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  });
  const structuredIndicator = draftMatchesListingAndFilters(
    structuredCandidate,
    searchResults,
    filters,
  ) ? structuredCandidate : null;
  if (structuredIndicator) return publicResponse(withoutOffTargetAnswer(structuredIndicator, cleanQuery), { now: startedAt });
  if (assessment.kind !== "answerable") {
    const scopeDraft = composeScopeResponse(cleanQuery, assessment);
    if (draftMatchesListingAndFilters(scopeDraft, searchResults, filters)) {
      return publicResponse(scopeDraft, { now: startedAt });
    }
    const visible = rankPortalDocuments(
      assessmentQuery,
      conventionalEvidenceDocumentsFromListing(searchResults)
        .filter((document) => resultMatchesFilters(document, filters)),
      { sort: filters.sort, now: startedAt },
    );
    return publicResponse(composeSearchResponse(cleanQuery, visible, {
      answerable: false,
      hasRelevantResults: Boolean(searchResults?.items?.length),
      clarification: "Valitud filtrid välistavad selle küsimuse jaoks vajaliku reaalaja- või registriallika või see puudub nähtavast tulemusehulgast. Lähtesta filter või täpsusta päringut.",
      evidenceKind: "filtered-scope-exclusion",
      limit: 6,
      total: Number(searchResults?.total || visible.length),
    }), { now: startedAt });
  }
  const sourceUnavailable = reason === "source-error";
  const capacityLimited = reason === "capacity";
  const ranked = searchResults?.items?.length
    ? rankPortalDocuments(
      assessmentQuery,
      conventionalEvidenceDocumentsFromListing(searchResults)
        .filter((document) => resultMatchesFilters(document, filters)),
      { sort: filters.sort, now: startedAt },
    )
    : [];
  const quality = assessEvidence(cleanQuery, ranked);
  const draft = composeSearchResponse(cleanQuery, ranked, {
    answerable: false,
    clarification: capacityLimited
      ? "Otsing teenindab praegu mitut päringut korraga. Proovi paari sekundi pärast uuesti."
      : sourceUnavailable
        ? "Osa värskeid allikaid ei vastanud. Proovi uuesti või lisa täpsem objekt, näitaja, piirkond või aasta."
        : "Värskete allikate laadimine võttis liiga kaua. Proovi uuesti või lisa täpsem objekt, näitaja, piirkond või aasta.",
    evidenceKind: capacityLimited
      ? "capacity-fallback"
      : sourceUnavailable ? "source-unavailable-fallback" : "deadline-fallback",
    limit: 6,
    quality,
  });
  // A timeout or an unavailable source must not leave the reader with an empty
  // answer card above the result list. When one already ranked official page
  // carries the answer as its own sentence, show that sentence with its
  // citation and say plainly that the model wording did not arrive. The result
  // list stays below the card either way.
  // A single sentence from one document only answers a single-value question.
  // A query about the present ("tänavu", "praegu", "viimati") needs a current
  // document, and a query that compares, aggregates or tracks change over time
  // needs the comparison itself, so both fall back to the honest timeout card
  // instead of lifting one unrelated observation into the answer slot.
  const freshnessSensitive = queryNeedsFreshness(cleanQuery);
  const multiObservationQuery = /(?:^|[^\p{L}])(?:v[oõ]rdl\w*|erinevu\w*|muutu\w*|trend\w*|keskmis\w*|ajalug\w*|areng\w*|summa\w*|k[oõ]rgem\w*|madalam\w*|suurem\w*|v[aä]iksem\w*|k[uü]mnend\w*|aastat(?:e|el|eil)\w*|aastan[ui]|aastas\w*|saadik\w*|alguse\w*|periood\w*|vahemik\w*|viimase\w*|viimast\w*|p[aä]rast\w*|t[äa]navu\w*|t[äa]na\w*|praegu\w*|praegus\w*|hetke\w*|j[äa]rgmis\w*|eelmis\w*|mullu\w*|m[öo]ödunud\w*|üleeelmis\w*|üleeel\w*|k[aä]esolev\w*|tuleval?\w*)\b/iu.test(cleanQuery);
  const requestedYear = new Date(startedAt).getFullYear();
  const extractDocument = !multiObservationQuery
    ? ranked.find((document) => {
      if (!sourceCanSupportPublicCitation(document, { now: startedAt }).eligible) return false;
      if (LAW_SECTION_URL.test(document.url || "")) return false;
      if (!freshnessSensitive) return true;
      const publishedAt = resultPublishedAt(document);
      return publishedAt !== null && new Date(publishedAt).getFullYear() >= requestedYear;
    })
    : null;
  // The visible witness is copied text, so it crosses the same publisher
  // decision as the model evidence. The document is projected for the evidence
  // purpose, the extract is chosen from that projected body, and the published
  // excerpt is that same text, so the fallback can never publish more than the
  // publisher allowed.
  const extractCopy = extractDocument
    ? projectSourceCopy(extractDocument, {
      purpose: "evidence",
      query: cleanQuery,
      limit: SOURCE_EVIDENCE_COPY_CHARS,
    })
    : null;
  const extractFields = extractCopy?.permitted ? extractCopy.fields : null;
  const extractText = extractFields
    ? String(extractFields.content ?? extractFields.summary ?? "")
    : "";
  const citedExtract = extractText
    ? directEvidenceExtract(
      cleanQuery,
      { ...extractDocument, summary: String(extractFields.summary ?? ""), content: extractText },
      null,
      { requireSubject: true },
    )
    : "";
  const citedExtractCitation = citedExtract
    ? sourceCitation(draft.sources.find((source) => source.id === extractDocument.id))
    : 0;
  if (citedExtract && citedExtractCitation) {
    draft.sources = draft.sources.map((source) => (source.id === extractDocument.id
      ? { ...source, evidenceExcerpt: extractText }
      : source));
    // The extract is the visible witness the reader can open; the citation is
    // kept only if that witness really contains it.
    if (claimHasVisibleWitness(citedExtract, extractText, citedExtract, cleanQuery)) {
      draft.answer.eyebrow = "Allika viidatud väljavõte";
      draft.answer.intro = citedExtract;
      draft.answer.introCitations = [citedExtractCitation];
      draft.answer.parts = [];
      draft.answer.aiUnavailable = true;
      draft.answer.note = `Allika enda sõnastus, mitte mudeli koondvastus.${capacityLimited ? " Otsing teenindas samal ajal mitut päringut." : sourceUnavailable ? " Osa värskeid allikaid ei vastanud." : ""}`;
      draft.answer.aiUnavailableExtract = true;
      const admittedExtract = withoutOffTargetAnswer(draft, cleanQuery);
      if (admittedExtract.answer?.eyebrow !== NO_ANSWER_EYEBROW) return publicResponse(admittedExtract, { now: startedAt });
    }
  }
  draft.answer.eyebrow = capacityLimited
    ? "Otsing on praegu koormatud"
    : sourceUnavailable ? "Osa allikaid ei vastanud" : "Otsing võttis liiga kaua";
  draft.answer.intro = capacityLimited
    ? "Otsing teenindab praegu mitut päringut korraga ning uut faktivastust ei koostatud. See ei tähenda, et otsitud andmeid ei ole."
    : sourceUnavailable
      ? "Osa värskeid allikaid ei vastanud ning uut faktivastust ei koostatud. See ei tähenda, et otsitud andmeid ei ole."
      : "Värskete allikate laadimine ei jõudnud vastuse ajapiiri sisse. See ei tähenda, et otsitud andmeid ei ole.";
  draft.answer.introCitations = [];
  draft.answer.parts = [];
  draft.answer.aiUnavailable = true;
  draft.answer.note = ranked.length
    ? capacityLimited
      ? "Proovi otsingut paari sekundi pärast uuesti."
      : sourceUnavailable
      ? "Juba leitud ametlikud allikad on kuvatud tulemuste loendis, kuid ajutise vea järel neist uut faktivastust ei koostatud. Proovi otsingut uuesti."
      : "Juba leitud ametlikud allikad on kuvatud tulemuste loendis, kuid neist ei koostatud ajapiiri järel uut faktivastust. Proovi otsingut uuesti."
    : capacityLimited
      ? "Proovi otsingut paari sekundi pärast uuesti."
      : "Proovi otsingut uuesti või lisa täpsem objekt, näitaja, piirkond või aasta.";
  return publicResponse(draft, { now: startedAt });
}

export function createDeadlineCleanupLease(finalize = () => undefined) {
  const pending = new Set();
  let finished = false;
  let finalized = false;
  const maybeFinalize = () => {
    if (finalized || !finished || pending.size) return;
    finalized = true;
    finalize();
  };
  const track = (operation) => {
    if (!operation) return Promise.resolve();
    const cleanup = Promise.resolve(operation).catch(() => undefined);
    pending.add(cleanup);
    cleanup.then(() => {
      pending.delete(cleanup);
      maybeFinalize();
    });
    return cleanup;
  };
  return {
    track,
    finish() {
      finished = true;
      maybeFinalize();
    },
    pendingCount() {
      return pending.size;
    },
  };
}

export async function settleWithinDeadline(
  operation,
  timeoutMs,
  fallback,
  controller = new AbortController(),
  { onBackgroundCleanup } = {},
) {
  let timer;
  let timedOut = false;
  const operationPromise = Promise.resolve(operation);
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("The search deadline expired", "AbortError"));
      resolve(undefined);
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([operationPromise, timeout]);
    if (!timedOut) return result;
    const cleanup = operationPromise.then(() => undefined, () => undefined);
    // Return the bounded response immediately. HTTP owners pass this cleanup
    // promise to a lease which retains their admission slot until the losing
    // database/upstream operation has actually released its resources.
    // Optional telemetry must never break the bounded timeout response: a
    // synchronously throwing callback would otherwise bypass the fallback.
    if (typeof onBackgroundCleanup === "function") {
      try {
        onBackgroundCleanup(cleanup);
      } catch {
        // Fall through to the fallback response below.
      }
    }
    return typeof fallback === "function" ? fallback() : fallback;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the finalized public envelope. Do not call publicResponse again:
 * public source projection removes the private admission metadata it validates.
 */
export async function searchEnvironmentLive(query, options = {}) {
  const startedAt = Number(options.startedAt) || Date.now();
  const queryInput = canonicalizePublicSearchQuery(query);
  if (queryInput.reason === "empty") return composeSearchResponse("", [], { limit: 3, total: 0 });
  const directAssessment = assessSearchQuery(query);
  if (!queryInput.ok) {
    return publicResponse(composeScopeResponse(queryInput.ok ? queryInput.query : "", directAssessment), { now: startedAt });
  }
  const cleanQuery = queryInput.query;
  const assessmentInput = canonicalizePublicSearchQuery(options.assessmentQuery ?? cleanQuery);
  const retrievalInput = canonicalizePublicSearchQuery(options.retrievalQuery ?? cleanQuery);
  if (!assessmentInput.ok || !retrievalInput.ok) {
    const rejectedValue = !assessmentInput.ok ? options.assessmentQuery : options.retrievalQuery;
    return publicResponse(composeScopeResponse("", assessSearchQuery(rejectedValue)), { now: startedAt });
  }
  const contextualAssessment = assessSearchQuery(assessmentInput.query);
  if (!isAllEnvironmentSearchEnabled()
    && (directAssessment.kind !== "out-of-scope" || ["outside-environment-domain", "personal-data-lookup"].includes(directAssessment.reason))
    && !isForestRelatedQuery(cleanQuery)
    && !(options.allowSafeEllipticalFollowUp === true
      && isContinuationFollowUp(cleanQuery)
      && isForestRelatedQuery(assessmentInput.query))) {
    return publicResponse(composeNoAnswerResponse(cleanQuery), { now: startedAt });
  }
  const validatedEllipticalFollowUp = options.allowSafeEllipticalFollowUp === true
    && directAssessment.kind === "out-of-scope"
    && (isSafeEllipticalFollowUp(cleanQuery)
      // A follow-up whose own tokens name no new subject inherits the accepted
      // root's scope: every added token must be neutral, acronym, or
      // root-derived (see isContextAnchoredFollowUp). Hard scope, privacy and
      // language refusals are unaffected.
      || isContextAnchoredFollowUp(cleanQuery, options.rootContext || options.conversationContext || ""))
    // A period-only follow-up on a dated indicator assesses as
    // "requested-time-series-required" in context; the structured series
    // adapter answers it first, and otherwise the clarification stands.
    && ["answerable", "needs-clarification"].includes(contextualAssessment.kind);
  if (directAssessment.kind === "out-of-scope" && !validatedEllipticalFollowUp) {
    return publicResponse(composeScopeResponse(cleanQuery, directAssessment), { now: startedAt });
  }
  const contextInput = canonicalizePublicSearchQuery(options.conversationContext || "", {
    maximumLength: 1_400,
  });
  const safeConversationContext = contextInput.ok ? contextInput.query : "";
  const canonicalFallbackOptions = {
    ...options,
    assessmentQuery: assessmentInput.query,
    retrievalQuery: retrievalInput.query,
    conversationContext: safeConversationContext,
  };
  let acceptedGroundedDraft = null;
  let admittedGroundedDraft = null;
  let modelAttemptStarted = false;
  let modelUsageTelemetry = null;
  // A clone drops every symbol, and this one decides when the copied text may
  // still be shown, so it is re-attached after the clone and never serialized.
  const carryCopyBound = (copy, bound) => {
    if (typeof bound !== "number" || !Number.isFinite(bound)) return copy;
    Object.defineProperty(copy, ANSWER_SOURCE_EXPIRY, {
      value: bound,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    return copy;
  };
  const captureGroundedDraft = (draft) => {
    // publicResponse intentionally shares nested answer objects with the
    // internal draft. Detach the accepted deterministic result before the
    // provider sees that draft, and give stream consumers their own copy too.
    // A timeout or provider failure can then never expose partially mutated
    // answer text without its original citations.
    const copyBound = draft?.[ANSWER_SOURCE_EXPIRY];
    acceptedGroundedDraft = carryCopyBound(structuredClone(draft), copyBound);
    if (typeof options.onDraft === "function") {
      options.onDraft(carryCopyBound(structuredClone(acceptedGroundedDraft), copyBound));
    }
  };
  const capturePrivateDraft = (draft) => {
    // The public snapshot above has already lost the private publisher
    // witness, so a replay after the wait could not ask whether the copied
    // text is still releasable. Keep the admitted draft for that replay and
    // project it when the fallback is actually written.
    admittedGroundedDraft = draft;
  };
  const bestAvailableFallback = (reason) => {
    const fallback = (admittedGroundedDraft
      ? publicResponse(admittedGroundedDraft, { now: Date.now() })
      : acceptedGroundedDraft)
      || searchTimeoutFallback(cleanQuery, { ...canonicalFallbackOptions, reason });
    return fallback
      ? {
        ...fallback,
        usage_telemetry: modelUsageTelemetry
          || searchUsageTelemetry(null, { modelStarted: modelAttemptStarted }),
      }
      : fallback;
  };

  // The answer clock is its own contract: the listing no longer shares this
  // window, so a slow retrieval cannot shorten the model phase and a long
  // answer is bounded by the coordinated answer budget, not by an old 60 s
  // clamp in this module.
  const configuredDeadlineMs = configuredAnswerBudgetMs();
  const absoluteDeadline = Number(options.deadlineAt) || startedAt + configuredDeadlineMs;
  if (absoluteDeadline <= Date.now()) {
    return searchTimeoutFallback(cleanQuery, canonicalFallbackOptions);
  }
  const deadlineMs = Math.max(1, Math.min(configuredDeadlineMs, absoluteDeadline - Date.now()));
  const controller = new AbortController();
  const signal = options.signal && typeof AbortSignal.any === "function"
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  const operation = searchWithinBudget(cleanQuery, {
    startedAt,
    deadlineAt: absoluteDeadline,
    signal,
    assessmentQuery: assessmentInput.query,
    retrievalQuery: retrievalInput.query,
    searchResults: options.searchResults,
    filters: options.filters || {},
    conversationContext: safeConversationContext,
    llmClientKey: options.llmClientKey || "unknown",
    useCache: options.useCache !== false,
    onDraft: captureGroundedDraft,
    onPrivateDraft: capturePrivateDraft,
    onModelStart: () => {
      modelAttemptStarted = true;
    },
    onModelUsage: (usage) => {
      modelUsageTelemetry = usage;
    },
    readCache: typeof options.readCache === "function" ? options.readCache : readSearchCache,
    onBackgroundCleanup: options.onBackgroundCleanup,
    generateAnswer: typeof options.generateAnswer === "function"
      ? options.generateAnswer
      : generateGroundedAnswer,
    persistSearch: typeof options.recordSearch === "function" ? options.recordSearch : recordSearch,
  }).catch((error) => {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error ? options.signal.reason : error;
    }
    return bestAvailableFallback("source-error");
  });
  return settleWithinDeadline(
    operation,
    deadlineMs,
    () => bestAvailableFallback("deadline"),
    controller,
    { onBackgroundCleanup: options.onBackgroundCleanup },
  );
}
