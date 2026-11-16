import { clientSearchFilters } from "./search_request.js";

const SEARCH_HISTORY_VERSION = 1;
const SEARCH_HISTORY_TTL_MS = 15 * 60 * 1_000;
const SEARCH_HISTORY_MAX_ENTRIES = 20;
export const SEARCH_HISTORY_MAX_PAGES = 2;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 12;
const DEFAULT_POLICY_VERSION = "search-policy-v1";

function boundedInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1
    ? Math.min(Math.floor(number), maximum)
    : fallback;
}

function revision(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function searchHistoryCacheKey(value = {}) {
  const listing = value.listing || value.previewListing || value.result?.searchResults || {};
  const result = value.result || {};
  const answer = result.answer || {};
  return JSON.stringify({
    version: SEARCH_HISTORY_VERSION,
    query: String(value.query || "").trim(),
    filters: clientSearchFilters(value.filters || listing.appliedFilters),
    page: boundedInteger(value.page ?? listing.page, 1, SEARCH_HISTORY_MAX_PAGES),
    pageSize: boundedInteger(value.pageSize ?? listing.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    queryRevision: revision(value.queryRevision ?? listing.queryRevision ?? result.queryRevision),
    windowId: revision(value.windowId ?? listing.windowId ?? result.windowId),
    sourceRevision: revision(value.sourceRevision ?? listing.sourceRevision ?? result.sourceRevision),
    indexRevision: revision(value.indexRevision ?? listing.indexRevision ?? result.indexRevision),
    policyVersion: revision(value.policyVersion ?? answer.policyVersion ?? result.policyVersion ?? listing.policyVersion)
      || DEFAULT_POLICY_VERSION,
  });
}

function publicSnapshot(value = {}) {
  const sourceResult = value.result && typeof value.result === "object" ? value.result : null;
  let result = null;
  if (sourceResult) {
    const { searchResults: _searchResults, ...answerResult } = sourceResult;
    result = answerResult;
  }
  const listing = value.listing || value.previewListing || sourceResult?.searchResults || null;
  return {
    query: String(value.query || "").trim(),
    filters: clientSearchFilters(value.filters || listing?.appliedFilters),
    page: boundedInteger(value.page ?? listing?.page, 1, SEARCH_HISTORY_MAX_PAGES),
    pageSize: boundedInteger(value.pageSize ?? listing?.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    queryRevision: value.queryRevision ?? listing?.queryRevision ?? sourceResult?.queryRevision,
    windowId: value.windowId ?? listing?.windowId ?? sourceResult?.windowId,
    sourceRevision: value.sourceRevision ?? listing?.sourceRevision ?? sourceResult?.sourceRevision,
    indexRevision: value.indexRevision ?? listing?.indexRevision ?? sourceResult?.indexRevision,
    policyVersion: value.policyVersion ?? sourceResult?.answer?.policyVersion ?? sourceResult?.policyVersion ?? listing?.policyVersion,
    listing,
    result,
    listingUnavailable: value.listingUnavailable === true,
    error: typeof value.error === "string" ? value.error.slice(0, 500) : "",
    listingNotice: typeof value.listingNotice === "string" ? value.listingNotice.slice(0, 500) : "",
    scrollY: Math.max(0, Number(value.scrollY) || 0),
  };
}

export function createSearchHistory({
  now = () => Date.now(),
  ttlMs = SEARCH_HISTORY_TTL_MS,
  maxEntries = SEARCH_HISTORY_MAX_ENTRIES,
} = {}) {
  const ttl = Math.max(1, Number(ttlMs) || SEARCH_HISTORY_TTL_MS);
  const limit = Math.max(1, Math.min(100, Math.floor(Number(maxEntries) || SEARCH_HISTORY_MAX_ENTRIES)));
  const cache = new Map();
  const navigation = new Map();
  let counter = 0;

  const prune = () => {
    const currentTime = now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= currentTime) cache.delete(key);
    }
    for (const [id, entry] of navigation) {
      if (entry.expiresAt <= currentTime || !cache.has(entry.key)) navigation.delete(id);
    }
  };

  const trim = () => {
    while (cache.size > limit) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
      for (const [id, entry] of navigation) {
        if (entry.key === oldestKey) navigation.delete(id);
      }
    }
  };

  return {
    createId() {
      counter += 1;
      return `${Number(now()).toString(36)}-${counter.toString(36)}`;
    },

    create(id, value) {
      const navigationId = String(id || "");
      if (!navigationId) return null;
      prune();
      if (navigation.has(navigationId)) return null;
      const snapshot = publicSnapshot(value);
      const key = searchHistoryCacheKey(snapshot);
      const storageKey = `${key}\u0000${navigationId}`;
      const expiresAt = now() + ttl;
      cache.delete(storageKey);
      cache.set(storageKey, { snapshot, expiresAt });
      navigation.set(navigationId, { key: storageKey, expiresAt });
      trim();
      return key;
    },

    update(id, value) {
      const navigationId = String(id || "");
      if (!navigationId) return null;
      prune();
      const previous = navigation.get(navigationId);
      if (!previous) return null;
      const cached = cache.get(previous.key);
      if (!cached) {
        navigation.delete(navigationId);
        return null;
      }
      const expiresAt = Math.min(previous.expiresAt, cached.expiresAt);
      if (expiresAt <= now()) {
        cache.delete(previous.key);
        navigation.delete(navigationId);
        return null;
      }
      const snapshotInput = { ...cached.snapshot, ...value };
      if (value?.scrollY === undefined) snapshotInput.scrollY = cached.snapshot.scrollY;
      const snapshot = publicSnapshot(snapshotInput);
      const key = searchHistoryCacheKey(snapshot);
      const storageKey = `${key}\u0000${navigationId}`;
      cache.delete(previous.key);
      cache.delete(storageKey);
      cache.set(storageKey, { snapshot, expiresAt });
      navigation.delete(navigationId);
      navigation.set(navigationId, { key: storageKey, expiresAt });
      trim();
      return key;
    },

    restore(id) {
      prune();
      const entry = navigation.get(String(id || ""));
      if (!entry) return null;
      const cached = cache.get(entry.key);
      if (!cached) {
        navigation.delete(String(id));
        return null;
      }
      cache.delete(entry.key);
      cache.set(entry.key, cached);
      navigation.delete(String(id));
      navigation.set(String(id), entry);
      return { ...cached.snapshot };
    },

    updateScroll(id, scrollY) {
      prune();
      const navigationId = String(id || "");
      const reference = navigation.get(navigationId);
      const cached = reference ? cache.get(reference.key) : null;
      if (!cached) return false;
      const snapshot = { ...cached.snapshot, scrollY: Math.max(0, Number(scrollY) || 0) };
      cache.delete(reference.key);
      cache.set(reference.key, { ...cached, snapshot });
      navigation.delete(navigationId);
      navigation.set(navigationId, reference);
      return true;
    },

    get size() {
      prune();
      return cache.size;
    },
  };
}

export const searchHistory = createSearchHistory();
