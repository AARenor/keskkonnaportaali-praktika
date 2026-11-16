// 128 candidate IDs cover two maximum 50 item pages and leave 28 for reranking.
export const LISTING_WINDOW_CANDIDATE_LIMIT = 128;
const LISTING_WINDOW_MAX_PAGES = 2;
// Retain through a 285 second answer job plus ten minutes to read.
export const LISTING_WINDOW_TTL_MS = 900_000;

// Corpus cache clears invalidate sibling result windows.
let listingWindowInvalidationEpoch = 0;

function normalizedFilters(filters = {}) {
  const requestedYear = filters.year === null || filters.year === undefined || filters.year === ""
    ? null
    : Number(filters.year);
  return {
    source: String(filters.source || "all"),
    category: String(filters.category || ""),
    year: Number.isInteger(requestedYear) ? requestedYear : null,
    sort: String(filters.sort || "relevance"),
  };
}

export function listingWindowKey({
  query,
  filters,
  revision,
  includeContent = false,
  excludeUrls = [],
} = {}) {
  const excluded = [...new Set((Array.isArray(excludeUrls) ? excludeUrls : [])
    .map((value) => String(value || ""))
    .filter(Boolean))]
    .sort();
  return JSON.stringify([
    String(query || ""),
    normalizedFilters(filters),
    String(revision || ""),
    Boolean(includeContent),
    excluded,
  ]);
}

export function getBoundListingWindow(cache, options = {}) {
  const expectedWindowId = typeof options.windowId === "string" ? options.windowId : "";
  if (!expectedWindowId || typeof cache?.get !== "function") return null;
  const window = cache.get(listingWindowKey(options));
  return window?.windowId === expectedWindowId ? window : null;
}

export function createListingWindowCache({
  ttlMs = LISTING_WINDOW_TTL_MS,
  maxEntries = 8,
  now = Date.now,
} = {}) {
  const lifetime = Math.max(1, Math.trunc(Number(ttlMs) || LISTING_WINDOW_TTL_MS));
  const capacity = Math.max(1, Math.trunc(Number(maxEntries) || 8));
  const entries = new Map();
  let observedEpoch = listingWindowInvalidationEpoch;
  const synchronizeInvalidation = () => {
    if (observedEpoch !== listingWindowInvalidationEpoch) {
      entries.clear();
      observedEpoch = listingWindowInvalidationEpoch;
    }
    return observedEpoch;
  };

  return {
    generation() {
      return synchronizeInvalidation();
    },
    get(key) {
      synchronizeInvalidation();
      const entry = entries.get(String(key));
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(String(key));
        return null;
      }
      entries.delete(String(key));
      entries.set(String(key), entry);
      return entry.value;
    },
    set(key, value, options = {}) {
      const generation = synchronizeInvalidation();
      if ((options.expectedGeneration ?? generation) !== generation) return false;
      const cacheKey = String(key);
      entries.delete(cacheKey);
      entries.set(cacheKey, { value, expiresAt: now() + lifetime });
      while (entries.size > capacity) entries.delete(entries.keys().next().value);
      return true;
    },
    delete(key) {
      synchronizeInvalidation();
      return entries.delete(String(key));
    },
    clear() {
      listingWindowInvalidationEpoch += 1;
      return synchronizeInvalidation();
    },
    get size() {
      synchronizeInvalidation();
      return entries.size;
    },
  };
}

export function pageListingWindow(items, {
  page = 1,
  pageSize = 12,
  offset = null,
  total = 0,
  totalRelation = "eq",
} = {}) {
  const safePage = Math.max(1, Math.trunc(Number(page) || 1));
  const safePageSize = Math.max(1, Math.min(50, Math.trunc(Number(pageSize) || 12)));
  const candidates = Array.isArray(items) ? items : [];
  const accessibleCount = Math.min(candidates.length, safePageSize * LISTING_WINDOW_MAX_PAGES);
  const accessibleItems = candidates.slice(0, accessibleCount);
  const pageCount = Math.min(LISTING_WINDOW_MAX_PAGES, Math.ceil(accessibleCount / safePageSize));
  const safeOffset = offset === null || offset === undefined || offset === ""
    ? (safePage - 1) * safePageSize
    : Math.max(0, Math.trunc(Number(offset) || 0));
  const offsetPage = Math.floor(safeOffset / safePageSize) + 1;
  return {
    items: offsetPage <= LISTING_WINDOW_MAX_PAGES
      ? accessibleItems.slice(safeOffset, safeOffset + safePageSize)
      : [],
    pageCount,
    hasMore: offsetPage < pageCount,
    totalRelation: totalRelation === "gte" ? "gte" : "eq",
    truncated: totalRelation === "gte"
      || candidates.length > accessibleCount
      || Number(total) > accessibleCount,
  };
}
