import { randomUUID } from "node:crypto";
import { sourceResourceKey, sourceWitnessKey } from "./source-identity.mjs";
import { enqueueOfficialDiscoveryDocuments } from "./corpus_ingestion.mjs";
import { normalizeSearchFilters } from "./corpus_query.mjs";
import { searchCorpus, validateRetainedCorpusWindow } from "./corpus_runtime.mjs";
import { searchOfficialSites } from "./integrations.mjs";
import { loadStructuredIndicatorDocuments } from "./indicators.mjs";
import { buildDiscoveryQueries } from "./search.mjs";
import { canonicalizePublicSearchQuery } from "./search_query_canonicalization.mjs";
import {
  assessSearchQuery,
  isForestRelatedQuery,
} from "./search_query_assessment.mjs";
import { containsPrivatePersonLookup } from "./search_query_privacy.mjs";
import { officialServiceCatalogueDocuments } from "./search_catalogue.mjs";
import { forestEvidenceIntent } from "./search_query_terms.mjs";
import {
  createListingWindowCache,
  getBoundListingWindow,
  LISTING_WINDOW_CANDIDATE_LIMIT,
  pageListingWindow,
} from "./listing_window.mjs";
import { deduplicateResults } from "./retrieval_deduplication.mjs";
import { rankPublicSearchCandidates, rankAndDeduplicate } from "./retrieval_ranking.mjs";
import { currentListingEvidencePlan, retainOverviewPlan } from "./retrieval_evidence.mjs";
import { resultMatchesFilters, mergedFacets, officialDocument, shouldUseLiveDiscovery, parseBoundedSearchInteger } from "./retrieval_listing.mjs";

const retrievalListingWindows = createListingWindowCache();

function remaining(deadlineAt, reserve = 0) {
  return Number.isFinite(deadlineAt) ? Math.max(0, deadlineAt - Date.now() - reserve) : 2_500;
}
function rankedWindowRevision(local, query, generation) {
  if (typeof local?.queryRevision === "string" && local.queryRevision) return local.queryRevision;
  return isForestRelatedQuery(query) ? `forest-ranked:${generation}` : null;
}

function throwIfRetrievalClosed(signal, deadlineAt) {
  if (!signal?.aborted && (!Number.isFinite(deadlineAt) || Date.now() < deadlineAt)) return;
  throw signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The retrieval window closed", "AbortError");
}


function expiredListingWindow({ page, pageSize, filters, queryRevision }) {
  return {
    status: "window-expired",
    mode: "local-index",
    total: 0,
    totalRelation: "gte",
    truncated: true,
    page,
    pageSize,
    pageCount: 0,
    hasMore: false,
    queryRevision: queryRevision || null,
    windowId: null,
    windowExpired: true,
    items: [],
    facets: { sources: [], categories: [], years: [] },
    appliedFilters: filters,
    updatedAt: new Date().toISOString(),
  };
}

export async function prepareRankedSearchResults(query, {
  page = 1,
  pageSize = 12,
  filters = {},
  deadlineAt,
  signal,
  clientKey = "unknown",
  windowId: requestedWindowId,
} = {}) {
  const appliedFilters = normalizeSearchFilters(filters);
  const safePage = Math.min(parseBoundedSearchInteger(page, 1, 500), 2);
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
      totalRelation: "eq",
      truncated: false,
      page: safePage,
      pageSize: safePageSize,
      pageCount: 0,
      hasMore: false,
      queryRevision: null,
      windowId: null,
      items: [],
      facets: { sources: [], categories: [], years: [] },
      appliedFilters,
      updatedAt: new Date().toISOString(),
    };
  }
  throwIfRetrievalClosed(signal, deadlineAt);
  const prefixLocalLimit = 50;
  const retrievalWindowGeneration = retrievalListingWindows.generation();
  const localRequest = searchCorpus(acceptedQuery, {
    page: 1, pageSize: prefixLocalLimit, includeContent: true,
    preferSnapshot: false, filters: appliedFilters, returnRankedWindow: true, signal, deadlineAt,
  });
  if (safePage === 2) {
    const local = await localRequest.catch(() => null);
    throwIfRetrievalClosed(signal, deadlineAt);
    const queryRevision = rankedWindowRevision(local, query, retrievalWindowGeneration);
    const cached = getBoundListingWindow(retrievalListingWindows, {
      query: acceptedQuery,
      filters: appliedFilters,
      includeContent: true,
      windowId: requestedWindowId,
    });
    const corpusValid = cached && local && local.status !== "degraded"
      && (cached.corpusWindow
        ? await validateRetainedCorpusWindow(cached.corpusWindow, appliedFilters, {
          signal, deadlineAt, items: cached.corpusItems,
        })
        : cached.corpusStatus === "disabled" && local.status === "disabled");
    if (!cached || !corpusValid || retrievalListingWindows.generation() !== retrievalWindowGeneration
      || getBoundListingWindow(retrievalListingWindows, {
        query: acceptedQuery, filters: appliedFilters, includeContent: true, windowId: requestedWindowId,
      }) !== cached) {
      console.info("Search result window expired:", JSON.stringify({
        cacheHit: Boolean(cached),
        corpusStatus: local?.status || "unavailable",
        retainedStatus: cached?.corpusStatus || "missing",
        retainedCorpus: Boolean(cached?.corpusWindow),
        corpusValid: Boolean(corpusValid),
        generationChanged: retrievalListingWindows.generation() !== retrievalWindowGeneration,
      }));
      return expiredListingWindow({
        page: safePage,
        pageSize: safePageSize,
        filters: appliedFilters,
        queryRevision,
      });
    }
    const pageWindow = pageListingWindow(cached.rankedPrefix, {
      page: safePage,
      pageSize: safePageSize,
      total: cached.total,
      totalRelation: cached.totalRelation,
    });
    const listing = {
      ...cached.listing,
      totalRelation: pageWindow.totalRelation,
      truncated: pageWindow.truncated,
      queryRevision: cached.queryRevision,
      windowId: cached.windowId,
      page: safePage,
      pageSize: safePageSize,
      pageCount: pageWindow.pageCount,
      hasMore: pageWindow.hasMore,
      items: pageWindow.items,
      evidenceCandidates: cached.rankedPrefix.slice(0, 50),
      appliedFilters,
    };
    retainOverviewPlan(
      listing,
      query,
      currentListingEvidencePlan(cached.listing, query, cached.rankedPrefix, appliedFilters.sort),
      appliedFilters.sort,
    );
    return listing;
  }
  // One request ranks the same catalogue documents two or three times; share
  // one score cache so only the first pass pays for scoring.
  const scoreCache = new Map();
  const directory = shouldUseLiveDiscovery(safePage)
    ? officialServiceCatalogueDocuments().filter((document) => resultMatchesFilters(document, appliedFilters))
    : [];
  const reviewedDirectory = forestEvidenceIntent(query)?.kind === "forest-overview"
    ? rankPublicSearchCandidates(query, directory, { sort: appliedFilters.sort, intentDocuments: directory, scoreCache })
    : null;
  const reviewedPlan = currentListingEvidencePlan(reviewedDirectory, query, reviewedDirectory || [], appliedFilters.sort);
  let reviewedRankedPrefix = null;
  if (reviewedPlan) {
    const local = await localRequest.catch(() => null);
    throwIfRetrievalClosed(signal, deadlineAt);
    const localCandidates = local?.rankedWindow || local?.items || [];
    const ranked = localCandidates.length
      ? rankPublicSearchCandidates(query, [...localCandidates, ...directory], {
          sort: appliedFilters.sort,
          intentDocuments: directory,
          previouslyRanked: reviewedDirectory,
          reuseRankings: new Set(reviewedDirectory),
          scoreCache,
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
  const localCandidates = local.rankedWindow || local.items || [];
  const rankedPrefix = (reviewedRankedPrefix || rankPublicSearchCandidates(query, [...localCandidates, ...filteredStructured, ...filteredLive, ...directory], {
    sort: appliedFilters.sort,
    intentDocuments: directory,
    scoreCache,
  })).slice(0, LISTING_WINDOW_CANDIDATE_LIMIT);
  const localUrls = new Set(localCandidates.map((document) => sourceWitnessKey(document)));
  // Facet counts are computed from the ranked set itself. Re-ranking the same
  // documents a second time only to count their sources, categories and years
  // doubled the blocking CPU of every search; the retained-plan path keeps its
  // own ranking because its prefix is a filtered subset.
  const facetExtras = (reviewedRankedPrefix
    ? rankAndDeduplicate(acceptedQuery, [...filteredStructured, ...filteredLive, ...directory])
    : rankedPrefix)
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
  const totalRelation = local.totalRelation === "eq" && facetExtras.length === 0 ? "eq" : "gte";
  const queryRevision = rankedWindowRevision(local, query, retrievalWindowGeneration);
  const windowId = queryRevision ? randomUUID() : null;
  const pageWindow = pageListingWindow(rankedPrefix, {
    page: safePage,
    pageSize: safePageSize,
    total,
    totalRelation,
  });
  const pageCount = windowId ? pageWindow.pageCount : Math.min(1, pageWindow.pageCount);
  const listing = {
    status: rankedPrefix.length || selected.length ? "ready" : local.status,
    mode: live.length ? "current-hybrid" : local.mode || "local-index",
    total,
    totalRelation,
    truncated: Boolean(local.truncated || pageWindow.truncated),
    queryRevision,
    windowId,
    page: safePage,
    pageSize: safePageSize,
    pageCount,
    hasMore: Boolean(windowId) && pageWindow.hasMore,
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
  if (windowId && listing.queryRevision) {
    const storedWindow = retrievalListingWindows.setWindow({
      query: acceptedQuery,
      filters: appliedFilters,
      revision: listing.queryRevision,
      includeContent: true,
    }, {
      windowId,
      queryRevision: listing.queryRevision,
      total,
      corpusWindow: local._corpusWindow || null,
      corpusItems: local.rankedWindow || [],
      corpusStatus: local.status,
      totalRelation,
      rankedPrefix,
      listing,
    }, { expectedGeneration: retrievalWindowGeneration });
    if (!storedWindow) {
      listing.windowId = null;
      listing.pageCount = Math.min(1, pageWindow.pageCount);
      listing.hasMore = false;
      listing.truncated = true;
    }
  }
  return listing;
}


