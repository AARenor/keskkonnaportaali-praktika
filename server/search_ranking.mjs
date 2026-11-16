import { documentRoots, scoreDocument } from "./search_evidence.mjs";
import { queryTerms } from "./search_query_terms.mjs";
import { assessSearchQuery } from "./search_query_assessment.mjs";
import { directDirectoryDocumentIds } from "./search_selectors.mjs";
import { SEARCH_DOCUMENTS } from "./search_catalogue.mjs";
const FRESHNESS_TIE_CACHE = new WeakMap();

// Lexical ties (exact equal score) must prefer the fresher reviewed source so
// a decade-old manual page cannot beat an equally relevant current guide.
function rankDocumentsFreshness(document) {
  const cached = FRESHNESS_TIE_CACHE.get(document);
  if (cached !== undefined) return cached;
  const internal = String(document?._publishedAt || "").trim();
  let timestamp = null;
  if (/^\d{4}-\d{2}-\d{2}$/u.test(internal)) timestamp = Date.parse(`${internal}T00:00:00Z`);
  if (timestamp === null || !Number.isFinite(timestamp)) {
    const label = String(document?.published || "").trim();
    const estonianDate = label.match(/^(\d{2})\.(\d{2})\.(\d{4})$/u);
    timestamp = estonianDate
      ? Date.UTC(Number(estonianDate[3]), Number(estonianDate[2]) - 1, Number(estonianDate[1]))
      : /^(?:19|20)\d{2}$/u.test(label) ? Date.UTC(Number(label), 0, 1) : null;
  }
  const value = Number.isFinite(timestamp) ? timestamp : 0;
  FRESHNESS_TIE_CACHE.set(document, value);
  return value;
}

export function rankDocuments(query, documents = SEARCH_DOCUMENTS, { russianRoots = [] } = {}) {
  const primaryTopic = assessSearchQuery(query).topic;
  const preferred = new Map(directDirectoryDocumentIds(query).map((id, index) => [id, index]));
  // Cyrillic tokens are folded/stripped by canonicalSecurityText, so the
  // canonical queryTerms may contain only folded fragments ('coptipovka').
  // The bridge must REPLACE, not merge, those fragments — otherwise the
  // primary-topic gate and scoring see junk roots the documents never match.
  const canonicalRoots = new Set(queryTerms(query));
  const bridgeRoots = new Set(russianRoots?.length ? [...russianRoots] : [...canonicalRoots]);
  return documents
    .map((document) => ({ ...document, score: scoreDocument(document, query, { bridgeRoots }) }))
    .filter((document) => document.score > 0
      && (!primaryTopic || documentRoots(document).has(primaryTopic) || [...bridgeRoots].some((root) => documentRoots(document).has(root))))
    .sort((a, b) => {
      const aPreference = preferred.get(a.id) ?? Number.POSITIVE_INFINITY;
      const bPreference = preferred.get(b.id) ?? Number.POSITIVE_INFINITY;
      return aPreference - bPreference
        || b.score - a.score
        || rankDocumentsFreshness(b) - rankDocumentsFreshness(a)
        || a.title.localeCompare(b.title, "et");
    });
}
