import { databaseEnabled, databaseQuery } from "./database.mjs";
import { minimizePublicProviderQuery } from "./search_query_privacy.mjs";
import {
  boundedText,
  canonicalIsoDate,
  canonicalIsoTimestamp,
  hash,
  externalId,
} from "./corpus_document_parsing.mjs";
import { SOURCE_IDENTITY_VERSION, sourceResourceKey } from "./source-identity.mjs";
import {
  projectSourceText,
  sourcePolicyBinding,
  sourcePolicyWitness,
} from "./source_policy.mjs";
import { buildCorpusCandidateQuery, CORPUS_SEARCH_QUERY_VERSION } from "./corpus_search.mjs";
import {
  LISTING_WINDOW_CANDIDATE_LIMIT,
  listingWindowKey,
  pageListingWindow,
} from "./listing_window.mjs";
import { corpusListingWindows } from "./corpus_listing_state.mjs";
import {
  APPROVED_PAGE_EVIDENCE_MAX_AGE_MS,
  CORPUS_VECTOR_LAYOUT,
  OFFICIAL_DISCOVERY_RETENTION_HOURS,
  REVIEWED_CATALOGUE_MAX_AGE_MS,
  REVIEWED_CATALOGUE_SOURCE_KEY,
  corpusIndexPolicySql,
  ensureCorpusSchema,
} from "./corpus_storage.mjs";
import {
  buildAnyPrefixTsQuery,
  buildPrefixTsQuery,
  corpusRankingTerms,
  normalizeCorpusQuery,
  normalizeSearchFilters,
  queryNeedsFreshness,
  sourceTiersForFilter,
  summarizeUrlOccurrences,
} from "./corpus_query.mjs";
import { fetchPortalSearchPage } from "./corpus_fetch.mjs";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

// Lenient practice mode admits a fresh official live-search page as answer
// evidence even though the reviewed catalogue never listed it. The predicate
// is pure so the guarantee can be tested without a database or a network
// fetch: official tier, a policy that binds the body, enough copied text for a
// grounded claim, a real content hash, and never a reviewed route-only card.
export function isLenientOfficialEvidenceRow({
  lenient, federated, sourceTier, policyApplies, reviewedPolicy, copiedLength, contentHash,
} = {}) {
  return lenient === true
    && federated === true
    && sourceTier === "official"
    && policyApplies === true
    && reviewedPolicy !== "route-only"
    && Number(copiedLength) >= 400
    && /^[a-f0-9]{64}$/u.test(String(contentHash || ""));
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
  const fetchedAt = row.fetched_at && Number.isFinite(new Date(row.fetched_at).getTime())
    ? new Date(row.fetched_at).toISOString()
    : null;
  const attemptedAt = canonicalIsoTimestamp(hydrationMetadata.hydration_attempted_at);
  // Failed/skipped hydration records an attempt, not a successfully refreshed
  // body. Existing syncs set fetched_at at that attempt too: never renew stale
  // evidence until a later successful hydration replaces it atomically.
  const successfullyRefreshed = fetchedAt && (hydrationMetadata.hydration_attempted_at === undefined
    || (attemptedAt && Date.parse(attemptedAt) < Date.parse(fetchedAt)));
  // Old parser versions admitted share/comment controls and related-card
  // text. Keep the URL discoverable, but never rank or cite that scaffold as
  // the page's own claims while awaiting a clean refresh.
  const containsPageScaffold = /^(?:Jaga\s)|Kommenteeri või avalda arvamust|Muud sündmused\s+Vaata kõiki/u.test(String(row.content || ""));
  // The source use policy is the witness that this body was read under a
  // recorded decision. It belongs to one response: an older policy no longer
  // matches the row's fetched_at, which is exactly what a failed refresh leaves
  // behind, and a body without a policy grants nothing at all.
  const storedPolicy = hydrationMetadata.source_policy;
  // The delivered witness carries every field the binding hashes, so a consumer
  // can rehash it, compare the resource and body hash with the record it holds
  // and project text without the stored row.
  const sourcePolicy = storedPolicy ? sourcePolicyWitness(storedPolicy) : null;
  const policyBinding = sourcePolicy ? sourcePolicyBinding(sourcePolicy) : null;
  const policyObservedAt = canonicalIsoTimestamp(sourcePolicy?.observedAt);
  const policyIsCurrent = Boolean(sourcePolicy && fetchedAt && policyObservedAt
    && Date.parse(policyObservedAt) === Date.parse(fetchedAt));
  // The witness belongs to one stored body version. A policy recorded for another
  // body, or for a body whose hash is no longer the row's, authorises nothing
  // here even when its time still matches the row; only a fresh successful read
  // can replace it.
  const policyBindsBody = Boolean(sourcePolicy && sourcePolicy.artifactHash
    && sourcePolicy.artifactHash === String(row.content_hash || ""));
  const policyApplies = policyIsCurrent && policyBindsBody;
  // Availability is decided at the moment this row is read, never at the moment
  // it was fetched: a policy can expire while the stored row is untouched.
  const policyNow = new Date().toISOString();
  // Copied text is published only through the projection for its purpose, so a
  // nosnippet, max-snippet or noindex decision caps or withdraws it here.
  const bodyProjection = policyApplies
    ? projectSourceText({
      url: row.canonical_url,
      _sourcePolicy: storedPolicy,
      content: row.content,
    }, {
      purpose: "evidence",
      now: policyNow,
      limit: 15_000,
    })
    : null;
  const summaryProjection = policyApplies
    ? projectSourceText({
      url: row.canonical_url,
      _sourcePolicy: storedPolicy,
      summary: row.summary || boundedText(row.content, 500),
    }, { purpose: "snippet", now: policyNow, limit: 500 })
    : null;
  const copiedContent = bodyProjection?.permitted ? String(bodyProjection.text ?? "") : "";
  const copiedSummary = summaryProjection?.permitted ? String(summaryProjection.text ?? "") : "";
  const isValidatedPageHydration = row.source_key === "official-page-hydration"
    && !containsPageScaffold
    && successfullyRefreshed
    && hydrationMetadata.hydrated === true
    // A PDF read is the same kind of bounded hydration; its byte binding and
    // page locators travel in metadata.pdf and metadata.page_locators.
    && (hydrationMetadata.source_kind === "official-page-hydration"
      || hydrationMetadata.source_kind === "official-pdf-hydration")
    && policyApplies
    && sourcePolicy?.use?.answerEvidence === true
    && copiedContent.length >= 80
    && /^[a-f0-9]{64}$/u.test(String(row.content_hash || ""));
  const reviewedCataloguePolicy = hydrationMetadata.evidence_policy || "versioned";
  const isReviewedCatalogueRow = row.source_key === REVIEWED_CATALOGUE_SOURCE_KEY
    && !containsPageScaffold
    && hydrationMetadata.hydrated === true
    && hydrationMetadata.source_kind === "reviewed-catalogue"
    && boundedText(row.content, 80_000).length >= 40
    && /^[a-f0-9]{64}$/u.test(String(row.content_hash || ""));
  const isReviewedCatalogueSource = isReviewedCatalogueRow && reviewedCataloguePolicy !== "route-only";
  const isReviewedCatalogueRoute = isReviewedCatalogueRow && reviewedCataloguePolicy === "route-only";
  // Lenient practice mode: an official live-search page whose body carries a
  // current evidence policy may be cited even though it was never catalogued.
  const isLenientOfficialEvidence = isLenientOfficialEvidenceRow({
    lenient: process.env.ANSWER_EVIDENCE_LENIENT === "true",
    federated: isFederatedDiscovery,
    sourceTier: row.source_tier,
    policyApplies,
    reviewedPolicy: hydrationMetadata.evidence_policy,
    copiedLength: copiedContent.length,
    contentHash: row.content_hash,
  });
  // A reviewed catalogue row is a reviewed extract, not a fetched publisher
  // page, so its reviewed content and evidence facts are kept as they are.
  const reviewedContent = isReviewedCatalogueRow && !containsPageScaffold
    ? boundedText(row.content, 15_000)
    : "";
  const reviewedSummary = isReviewedCatalogueRow && !containsPageScaffold
    ? boundedText(row.summary || row.content, 500)
    : "";
  const publishedSummary = isReviewedCatalogueRow ? reviewedSummary : copiedSummary;
  const publishedContent = isReviewedCatalogueRow ? reviewedContent : copiedContent;
  const sourcePolicyView = sourcePolicy;
  const pdfMetadata = hydrationMetadata.pdf && typeof hydrationMetadata.pdf === "object"
    ? hydrationMetadata.pdf
    : null;
  const pdfPageCount = Number(pdfMetadata?.pageCount);
  const pdfIndexedPages = Number(pdfMetadata?.indexedPages);
  const pdfIndex = pdfPageCount > 0
    ? Object.freeze({
      pageCount: Math.trunc(pdfPageCount),
      indexedPages: Number.isInteger(pdfIndexedPages) && pdfIndexedPages > 0 ? pdfIndexedPages : 0,
      // Only an extraction recorded as complete may claim it. A partial read
      // stays visible as partial.
      complete: pdfMetadata?.complete === true,
    })
    : null;
  // Page locators address the stored body by character offset, so a later
  // citation can name the page it came from. They are published only while the
  // body they address is published.
  const storedLocators = Array.isArray(hydrationMetadata.page_locators)
    ? hydrationMetadata.page_locators
      .filter((entry) => entry && Number.isInteger(entry.pageNumber)
        && Number.isInteger(entry.start) && Number.isInteger(entry.end)
        && entry.start >= 0 && entry.end >= entry.start)
      .map((entry) => Object.freeze({
        pageNumber: entry.pageNumber,
        start: entry.start,
        end: entry.end,
      }))
    : [];
  const publishedLocators = publishedContent ? storedLocators : [];
  const item = {
    id: `corpus-${row.id}`,
    title: row.title,
    url: row.canonical_url,
    summary: publishedSummary,
    organization: row.organization || (row.source_tier === "supplementary" ? "Vikipeedia" : "Keskkonnaportaal"),
    type: row.category || "Veebileht",
    published: formatPublished(row),
    ...(canonicalIsoDate(hydrationMetadata.source_updated_at)
      ? { updated: formatPublished({ published_at: hydrationMetadata.source_updated_at }) }
      : {}),
    topics: row.topics || [],
    sourceTier: row.source_tier,
    _publishedAt: row.published_at ? new Date(row.published_at).toISOString().slice(0, 10) : null,
    _relevance: Number(row.relevance || 0),
    ...(sourcePolicyView ? { _sourcePolicy: sourcePolicyView, _sourcePolicyBinding: policyBinding } : {}),
    ...(pdfIndex ? { _pdfIndex: pdfIndex } : {}),
    ...(publishedLocators.length ? { _pageLocators: Object.freeze(publishedLocators) } : {}),
    ...(isReviewedCatalogueSource ? {
      retrieval: "reviewed-catalogue-source",
      delivery: "reviewed-catalogue",
      evidencePolicy: reviewedCataloguePolicy,
      _answerEvidenceEligible: true,
      _evidenceVersion: row.content_hash,
      _evidenceStatusAt: hydrationMetadata.reviewed_at || fetchedAt,
      freshness: {
        class: "reviewed-catalogue",
        basis: "reviewed-at",
        maxAgeMs: REVIEWED_CATALOGUE_MAX_AGE_MS,
        requiresSourceTimestamp: true,
      },
    } : isReviewedCatalogueRoute ? {
      retrieval: "reviewed-catalogue-route",
      delivery: "reviewed-catalogue",
      evidencePolicy: "route-only",
      _answerEvidenceEligible: false,
    } : isValidatedPageHydration ? {
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
    } : isLenientOfficialEvidence ? {
      retrieval: "official-federated-search",
      delivery: "federated-discovery",
      evidencePolicy: "versioned",
      _answerEvidenceEligible: true,
      _evidenceVersion: row.content_hash,
      _evidenceStatusAt: fetchedAt,
      freshness: {
        class: "cached-official-page",
        basis: "retrieved-at",
        maxAgeMs: APPROVED_PAGE_EVIDENCE_MAX_AGE_MS,
        requiresSourceTimestamp: false,
      },
    } : {
      retrieval: isFederatedDiscovery ? "official-federated-search" : "catalogue-directory",
      delivery: isFederatedDiscovery ? "federated-discovery" : "catalog-and-bounded-hydration",
      evidencePolicy: "route-only",
      _answerEvidenceEligible: false,
    }),
  };
  if (includeContent) {
    item.content = publishedContent;
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
async function currentCorpusQueryRevision(queryOptions, generation) {
  const result = await databaseQuery(`
    SELECT id::TEXT AS id, status
    FROM practice_corpus_runs
    ORDER BY id DESC
    LIMIT 1
  `, [], queryOptions);
  const run = result?.rows?.[0] || {};
  return [
    CORPUS_SEARCH_QUERY_VERSION,
    CORPUS_VECTOR_LAYOUT,
    SOURCE_IDENTITY_VERSION,
    run.id || "0",
    run.status || "none",
    generation,
  ].join(":");
}

async function loadCorpusWindowRows(ids, filters, excludedUrls, queryOptions) {
  if (!ids.length) return [];
  const result = await databaseQuery(`
    SELECT id, source_key, canonical_url, title, summary, content, organization, category,
           published_at, published_label, topics, source_tier, content_hash, fetched_at, metadata,
           ${corpusIndexPolicySql("document")} AS index_allowed
    FROM practice_corpus_documents AS document
    WHERE id = ANY($1::BIGINT[])
      AND is_available = TRUE
      AND COALESCE(metadata->>'robots_noindex', 'false') <> 'true'
      AND (
        source_key <> 'official-live-search'
        OR last_seen_at >= NOW() - make_interval(hours => ${OFFICIAL_DISCOVERY_RETENTION_HOURS})
      )
      AND (cardinality($2::TEXT[]) = 0 OR source_tier = ANY($2::TEXT[]))
      AND ($3::TEXT IS NULL OR category = $3::TEXT)
      AND ($4::INTEGER IS NULL OR EXTRACT(YEAR FROM published_at)::INTEGER = $4::INTEGER)
      AND (
        cardinality($5::TEXT[]) = 0
        OR COALESCE(CASE
          WHEN metadata->>'sourceIdentityVersion' = $6
            THEN metadata->>'sourceResourceKey'
        END, '') <> ALL($5::TEXT[])
      )
    ORDER BY array_position($1::BIGINT[], id)
  `, [
    ids,
    sourceTiersForFilter(filters.source),
    filters.category || null,
    filters.year,
    excludedUrls,
    SOURCE_IDENTITY_VERSION,
  ], queryOptions);
  return result?.rows || [];
}
export async function validateRetainedCorpusWindow(window, filters, { signal, deadlineAt, items = [] } = {}) {
  if (!databaseEnabled() || !Array.isArray(window?.ids) || !Array.isArray(window?.indexAllowed)
    || window.ids.length !== window.indexAllowed.length) return false;
  try {
    const rows = await loadCorpusWindowRows(window.ids, normalizeSearchFilters(filters), [], { signal, deadlineAt });
    throwIfCorpusSearchClosed(signal, deadlineAt);
    const permissions = new Map(window.ids.map((id, index) => [String(id), Boolean(window.indexAllowed[index])]));
    const originals = new Map(items.map((item) => [item.id, item]));
    const valid = rows.length === window.ids.length && rows.every((row) => {
      if (permissions.get(String(row.id)) && !row.index_allowed) return false;
      const original = originals.get(`corpus-${row.id}`);
      if (!original) return true;
      const currentPolicy = row.metadata?.source_policy;
      if (!original._sourcePolicy && !currentPolicy) return true;
      return [["summary", "snippet"], ["content", "evidence"]].every(([field, purpose]) => {
        if (!original[field]) return true;
        if (original._sourcePolicy) {
          const oldProjection = projectSourceText({
            url: original.url, _sourcePolicy: original._sourcePolicy, [field]: original[field],
          }, { purpose, limit: field === "summary" ? 500 : 15_000 });
          if (!oldProjection.permitted || oldProjection.text !== original[field]) return false;
        }
        const currentProjection = projectSourceText({
          url: original.url, _sourcePolicy: currentPolicy, [field]: original[field],
        }, { purpose, limit: field === "summary" ? 500 : 15_000 });
        return currentProjection.permitted && currentProjection.text === original[field];
      });
    });
    if (!valid) corpusListingWindows.clear();
    return valid;
  } catch (error) {
    if (signal?.aborted || (Number.isFinite(deadlineAt) && Date.now() >= deadlineAt)
      || error?.name === "AbortError") throw error;
    corpusListingWindows.clear();
    return false;
  }
}


function corpusWindowResult({
  rows,
  window,
  page,
  pageSize,
  offset,
  includeContent,
  returnRankedWindow,
  queryRevision,
  windowId,
  appliedFilters,
}) {
  const pageWindow = pageListingWindow(window.ids, {
    page,
    pageSize,
    offset,
    total: window.total,
    totalRelation: window.totalRelation,
  });
  const pageCount = windowId ? pageWindow.pageCount : Math.min(1, pageWindow.pageCount);
  const hasMore = Boolean(windowId) && pageWindow.hasMore;
  const rowsById = new Map(rows.map((row) => [String(row.id), row]));
  const mapItem = (id) => {
    const row = rowsById.get(String(id));
    return row ? publicSearchItem(row, includeContent) : null;
  };
  return {
    status: "ready",
    mode: "local-index",
    total: window.total,
    totalRelation: window.totalRelation,
    truncated: pageWindow.truncated,
    queryRevision,
    windowId,
    page,
    pageSize,
    pageCount,
    hasMore,
    items: pageWindow.items.map(mapItem).filter(Boolean),
    ...(returnRankedWindow
      ? { rankedWindow: window.ids.map(mapItem).filter(Boolean), _corpusWindow: window }
      : {}),
    facets: window.facets,
    appliedFilters,
    updatedAt: new Date().toISOString(),
  };
}

function corpusListingWindowId(key) {
  return hash(key).slice(0, 24);
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
  returnRankedWindow = false,
  signal,
  deadlineAt,
} = {}) {
  const normalized = normalizeCorpusQuery(query);
  const safePage = Math.max(1, Math.min(Number(page) || 1, 500));
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
  const parsedOffset = resultOffset === null || resultOffset === undefined || resultOffset === ""
    ? Number.NaN
    : Number(resultOffset);
  const safeOffset = Number.isFinite(parsedOffset)
    ? Math.max(0, Math.min(parsedOffset, 1_000_000))
    : (safePage - 1) * safePageSize;
  const safeExcludedUrls = [...new Set((Array.isArray(excludeUrls) ? excludeUrls : [])
    .map(sourceResourceKey)
    .filter(Boolean))]
    .slice(0, 100);
  const appliedFilters = normalizeSearchFilters(filters);
  if (!normalized || !databaseEnabled()) {
    return {
      status: databaseEnabled() ? "empty" : "disabled",
      mode: "local-index",
      total: 0,
      totalRelation: normalized ? "gte" : "eq",
      truncated: Boolean(normalized),
      pageCount: 0,
      hasMore: false,
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
    if (preferSnapshot && !hasFilters && safePage <= 2) {
      const snapshot = await snapshotResults(normalized, safePage, safePageSize, includeContent, queryOptions);
      if (snapshot) {
        const pageableTotal = snapshot.distinctTotal || snapshot.total;
        return {
          ...snapshot,
          totalRelation: "eq",
          truncated: pageableTotal > safePageSize * 2,
          queryRevision: `snapshot:${snapshot.updatedAt || "unknown"}`,
          windowId: hash(JSON.stringify([normalized, appliedFilters, snapshot.updatedAt])).slice(0, 24),
          pageCount: Math.min(2, Math.ceil(pageableTotal / safePageSize)),
          hasMore: safePage < Math.min(2, Math.ceil(pageableTotal / safePageSize)),
          facets: { sources: [], categories: [], years: [] },
          appliedFilters,
        };
      }
    }
    const prefixQuery = buildPrefixTsQuery(normalized);
    const anyPrefixQuery = buildAnyPrefixTsQuery(normalized);
    if (!prefixQuery || !anyPrefixQuery) return {
      status: "empty",
      mode: "local-index",
      total: 0,
      totalRelation: "eq",
      truncated: false,
      pageCount: 0,
      hasMore: false,
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
    const candidateLimit = LISTING_WINDOW_CANDIDATE_LIMIT;
    const parameters = [
      normalized,
      prefixQuery,
      rankTerms,
      sourceTiers,
      appliedFilters.category || null,
      appliedFilters.year,
      freshnessIntent,
      candidateLimit,
      safeExcludedUrls,
      SOURCE_IDENTITY_VERSION,
      anyPrefixQuery,
    ];
    let cacheGeneration = corpusListingWindows.generation();
    let cacheFreshness = corpusListingWindows.freshness();
    let queryRevision = await currentCorpusQueryRevision(queryOptions, cacheGeneration);
    const makeCacheKey = (revision) => listingWindowKey({
      query: normalized,
      filters: appliedFilters,
      revision,
      includeContent,
      excludeUrls: safeExcludedUrls,
    });
    let cacheKey = makeCacheKey(queryRevision);
    let windowId = corpusListingWindowId(cacheKey);
    const cachedWindow = corpusListingWindows.get(cacheKey);
    if (cachedWindow) {
      const cachedPage = pageListingWindow(cachedWindow.ids, {
        page: safePage,
        pageSize: safePageSize,
        offset: safeOffset,
        total: cachedWindow.total,
        totalRelation: cachedWindow.totalRelation,
      });
      const requestedIds = returnRankedWindow ? cachedWindow.ids : cachedPage.items;
      const loadedRows = await loadCorpusWindowRows(requestedIds, appliedFilters, safeExcludedUrls, queryOptions);
      throwIfCorpusSearchClosed(signal, deadlineAt);
      const indexStatusKnown = Array.isArray(cachedWindow.indexAllowed)
        && cachedWindow.indexAllowed.length === cachedWindow.ids.length;
      const indexAllowedById = new Map(indexStatusKnown
        ? cachedWindow.ids.map((id, index) => [String(id), Boolean(cachedWindow.indexAllowed[index])])
        : []);
      const indexPermissionChanged = !indexStatusKnown || loadedRows.some((row) => (
        indexAllowedById.get(String(row.id)) !== Boolean(row.index_allowed)
      ));
      if (loadedRows.length === requestedIds.length && !indexPermissionChanged) {
        const relevanceById = new Map(cachedWindow.ids.map((id, index) => [
          String(id),
          cachedWindow.relevance[index],
        ]));
        const rows = loadedRows.map((row) => ({
          ...row,
          relevance: Number(relevanceById.get(String(row.id))) || 0,
        }));
        return corpusWindowResult({
          rows,
          window: cachedWindow,
          page: safePage,
          pageSize: safePageSize,
          offset: safeOffset,
          includeContent,
          returnRankedWindow,
          queryRevision,
          windowId,
          appliedFilters,
        });
      }
      // Permissions can change by write or by clock expiry. Rebuild sibling
      // windows too, so retrieval cannot reuse an older full source object.
      cacheGeneration = corpusListingWindows.clear();
      cacheFreshness = corpusListingWindows.freshness();
      queryRevision = await currentCorpusQueryRevision(queryOptions, cacheGeneration);
      cacheKey = makeCacheKey(queryRevision);
      windowId = corpusListingWindowId(cacheKey);
    }
    const candidateSql = buildCorpusCandidateQuery({
      vectorLayout: CORPUS_VECTOR_LAYOUT,
      officialDiscoveryRetentionHours: OFFICIAL_DISCOVERY_RETENTION_HOURS,
      indexAllowedSql: corpusIndexPolicySql("document"),
      orderClause,
    });
    const [resultState, facetState] = await Promise.allSettled([
      databaseQuery(candidateSql, parameters, queryOptions),
      databaseQuery(`
      WITH parameters AS (
        SELECT
          websearch_to_tsquery('simple', public.unaccent($1)) AS web_query,
          to_tsquery('simple', public.unaccent($2)) AS prefix_query,
          to_tsquery('simple', public.unaccent($3)) AS any_prefix_query,
          lower($1) AS raw_query
      ), matched AS MATERIALIZED (
        -- Count and facet work carries only metadata fields, never full document bodies.
        -- The exact total is one aggregate row; ranking has its separate 128 ID cap.
        SELECT document.source_tier, document.category, document.published_at, document.metadata
        FROM practice_corpus_documents document, parameters
        WHERE document.is_available = TRUE
          AND COALESCE(document.metadata->>'robots_noindex', 'false') <> 'true'
          AND (
            document.source_key <> 'official-live-search'
            OR document.last_seen_at >= NOW() - make_interval(hours => ${OFFICIAL_DISCOVERY_RETENTION_HOURS})
          )
          AND (
            -- The safe navigation vector is readable for any migrated row. A row
            -- that has not been migrated yet is matched by its title only, so its
            -- old mixed vector can never affect matching; the copied-text vector
            -- is read only while the permission that produced it still holds.
            ((document.search_vector_policy = '${CORPUS_VECTOR_LAYOUT}')
              AND (
                document.search_vector @@ parameters.any_prefix_query
                OR document.search_vector @@ parameters.web_query
                OR (${corpusIndexPolicySql("document")}
                  AND (
                    document.search_vector_body @@ parameters.any_prefix_query
                    OR document.search_vector_body @@ parameters.web_query
                  ))
              ))
            OR lower(document.title) % parameters.raw_query
            OR lower(document.title) LIKE '%' || parameters.raw_query || '%'
          )
      )
      SELECT
        -- Exact totals cover every filtered match but return only one aggregate value.
        (SELECT COUNT(*)::INTEGER
         FROM matched
         WHERE (cardinality($4::TEXT[]) = 0 OR source_tier = ANY($4::TEXT[]))
           AND ($5::TEXT IS NULL OR category = $5::TEXT)
           AND ($6::INTEGER IS NULL OR EXTRACT(YEAR FROM published_at)::INTEGER = $6::INTEGER)
           AND (
             cardinality($7::TEXT[]) = 0
             OR COALESCE(CASE
               WHEN metadata->>'sourceIdentityVersion' = $8
                 THEN metadata->>'sourceResourceKey'
             END, '') <> ALL($7::TEXT[])
           )) AS total,
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
    `, [normalized, prefixQuery, anyPrefixQuery, sourceTiers, appliedFilters.category || null, appliedFilters.year, safeExcludedUrls, SOURCE_IDENTITY_VERSION], queryOptions)]);
    // Join both parallel database operations before the request-owned corpus
    // work can settle and release its admission slot.
    throwIfCorpusSearchClosed(signal, deadlineAt);
    if (resultState.status === "rejected") throw resultState.reason;
    if (facetState.status === "rejected") throw facetState.reason;
    const result = resultState.value;
    const facetResult = facetState.value;
    const candidateRows = result?.rows || [];
    const facetRow = facetResult?.rows?.[0] || {};
    const countedTotal = Number(facetRow.total || 0);
    const total = Math.max(countedTotal, candidateRows.length);
    const totalRelation = countedTotal >= candidateRows.length ? "eq" : "gte";
    const facets = {
      sources: Array.isArray(facetRow.sources) ? facetRow.sources : [],
      categories: Array.isArray(facetRow.categories) ? facetRow.categories : [],
      years: Array.isArray(facetRow.years) ? facetRow.years : [],
    };
    const window = {
      ids: candidateRows.map((row) => String(row.id)),
      relevance: candidateRows.map((row) => Number(row.relevance || 0)),
      indexAllowed: candidateRows.map((row) => Boolean(row.index_allowed)),
      total,
      totalRelation,
      facets,
    };
    // Exact totals come from the existing narrow aggregate query. Search rows
    // remain capped separately and are never hydrated into JavaScript in bulk.
    const storedWindow = corpusListingWindows.set(cacheKey, window, {
      expectedGeneration: cacheGeneration,
      expectedFreshness: cacheFreshness,
    });
    return corpusWindowResult({
      rows: candidateRows,
      window,
      page: safePage,
      pageSize: safePageSize,
      offset: safeOffset,
      includeContent,
      returnRankedWindow,
      queryRevision,
      windowId: storedWindow ? windowId : null,
      appliedFilters,
    });
  } catch (error) {
    if (signal?.aborted || (Number.isFinite(deadlineAt) && Date.now() >= deadlineAt)
      || error?.name === "AbortError") throw error;
    return {
      status: "degraded",
      mode: "local-index",
      total: 0,
      totalRelation: "gte",
      truncated: true,
      page: safePage,
      pageSize: safePageSize,
      pageCount: 0,
      hasMore: false,
      queryRevision: null,
      windowId: null,
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
