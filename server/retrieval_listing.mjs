import { createHash } from "node:crypto";
import { normalizeSearchFilters } from "./corpus_query.mjs";
import { sourceWitnessKey } from "./source-identity.mjs";
import { publicSourceAllowed } from "./citation-policy.mjs";
import { resultPublishedAt } from "./retrieval_deduplication.mjs";
import { sourceCanSupportPublicCitation, projectSourceCopy, SOURCE_EVIDENCE_BODY_CHARS } from "./source-registry.mjs";
import { clean } from "./retrieval_deduplication.mjs";

const PUBLIC_ITEM_FIELDS = [
  "id", "title", "url", "summary", "locator", "organization", "type", "published", "updated", "dataYear", "dataAsOf", "topics", "sourceTier",
];
const PUBLIC_FILTER_SOURCES = new Set(["all", "trusted", "official", "reviewed", "supplementary", "other"]);
const PUBLIC_FILTER_SORTS = new Set(["relevance", "newest"]);
const LEGACY_ANSWER_FIXTURE_IDS = new Set(["forest-overview", "forest-inventory-publication"]);
const VOLATILE_RESULT_ID = /^(?:corpus-|kkp-|vp-)/u;
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
export function publicSearchListing(listing = {}, options = {}) {
  const now = options?.now ?? Date.now();
  return {
    total: Number(listing.total || 0),
    totalRelation: listing.totalRelation === "gte" ? "gte" : "eq",
    truncated: Boolean(listing.truncated),
    queryRevision: listing.queryRevision || undefined,
    windowId: listing.windowId || undefined,
    page: Number(listing.page || 1),
    pageSize: Number(listing.pageSize || 12),
    pageCount: Number(listing.pageCount || 0),
    hasMore: Boolean(listing.hasMore),
    ...(listing.windowExpired === true ? { windowExpired: true } : {}),
    appliedFilters: normalizeSearchFilters(listing.appliedFilters),
    facets: {
      sources: Array.isArray(listing.facets?.sources) ? listing.facets.sources.slice(0, 6) : [],
      categories: Array.isArray(listing.facets?.categories) ? listing.facets.categories.slice(0, 18) : [],
      years: Array.isArray(listing.facets?.years) ? listing.facets.years.slice(0, 12) : [],
    },
    items: (listing.items || []).map((item) => {
      // The listing publishes one copied field, and only the publisher decision
      // on this exact record releases it. Title, URL, publisher and dates are
      // link metadata and survive a withheld body unchanged.
      const copy = projectSourceCopy(item, { purpose: "snippet", now, limit: 500 });
      const fields = Object.fromEntries(PUBLIC_ITEM_FIELDS
        .filter((field) => item[field] !== undefined)
        .map((field) => [field, item[field]]));
      return {
        ...fields,
        id: stablePublicResultId(item),
        ...(item.summary === undefined
          ? {}
          : { summary: copy.permitted ? String(copy.fields.summary ?? "") : "" }),
      };
    }),
  };
}

export function evidenceDocumentsFromListing(listing = {}, options = {}) {
  const now = options?.now ?? Date.now();
  return (listing.items || [])
    .filter((item) => ["official", "reviewed"].includes(item.sourceTier)
      && !LEGACY_ANSWER_FIXTURE_IDS.has(item.id)
      && item.retrieval !== "official-federated-search"
      && sourceCanSupportPublicCitation(item, options).eligible)
    .map((item) => ({
      item,
      // Candidates carry the body the publisher permitted, never more: the
      // publisher limit is applied here too, so no later consumer can inherit
      // an over-limit field. Ranking inside that permission happens where the
      // delivery budget is known, not here.
      copy: projectSourceCopy(item, { purpose: "evidence", now, limit: SOURCE_EVIDENCE_BODY_CHARS }),
    }))
    // A source whose copy is withheld cannot become evidence: the pack would
    // otherwise carry a citation with nothing behind it. Link metadata still
    // reaches the reader through the listing.
    .filter((entry) => entry.copy.permitted)
    .map(({ item, copy }) => {
      const projected = { ...item, tags: item.topics || item.tags || [] };
      // A field the publisher decision does not release leaves the record; a
      // field it does release carries the bounded copy, and the fields together
      // stay inside the one budget.
      for (const field of ["summary", "excerpt", "content", "answer", "evidenceExcerpt"]) {
        const value = copy.fields[field];
        if (value === undefined) delete projected[field];
        else projected[field] = value;
      }
      return projected;
    });
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

export function mergedFacets(localFacets = {}, liveDocuments = []) {
  return {
    sources: mergeFacetValues(localFacets.sources, liveDocuments, (document) => document.sourceTier).slice(0, 6),
    categories: mergeFacetValues(localFacets.categories, liveDocuments, (document) => document.type).slice(0, 18),
    years: mergeFacetValues(localFacets.years, liveDocuments.filter((document) => {
      const timestamp = resultPublishedAt(document);
      return timestamp !== null && timestamp <= Date.now();
    }), documentYear).sort((left, right) => Number(right.value) - Number(left.value)).slice(0, 12),
  };
}

export function officialDocument(document) {
  return {
    ...document,
    topics: document.tags || [],
    sourceTier: "official",
  };
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