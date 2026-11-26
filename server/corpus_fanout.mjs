import { searchCorpus } from "./corpus_runtime.mjs";

import { resultMatchesFilters, stablePublicResultId } from "./retrieval_listing.mjs";
import { assessSearchQuery, isForestRelatedQuery, isPlainDefinitionQuery } from "./search_query_assessment.mjs";
import { canonicalizePublicSearchQuery } from "./search_query_canonicalization.mjs";
import { FOREIGN_SCRIPT_PATTERN, isAllEnvironmentSearchEnabled } from "./search_query_terms.mjs";
import { normalizeCorpusQuery } from "./corpus_query.mjs";
import { buildDiscoveryQueries } from "./search.mjs";


const MAX_SUBQUERIES = 3;

function boundedLimit(limit) {
  const value = Number(limit);
  if (!Number.isFinite(value)) return MAX_SUBQUERIES;
  return Math.max(0, Math.min(Math.trunc(value), MAX_SUBQUERIES));
}

export function buildCorpusFanoutQueries(query, { limit = 3 } = {}) {
  const cap = boundedLimit(limit);
  if (cap === 0) return [];

  const rawQuery = typeof query === "string" ? query : "";
  if (FOREIGN_SCRIPT_PATTERN.test(rawQuery)) return [];
  if (!isForestRelatedQuery(rawQuery) && !isAllEnvironmentSearchEnabled()) return [];
  if (assessSearchQuery(rawQuery).kind !== "answerable") return [];
  // A plain definition ("mis on kliimamuutus") reduces to a bare topic
  // ("kliimamuutus"), which is broad on its own. The definition frame keeps
  // the request answerable, so its subquery must still reach the corpus.
  const definitionRoot = isPlainDefinitionQuery(rawQuery);


  const subqueries = [];
  const seen = new Set();
  for (const candidate of buildDiscoveryQueries(rawQuery, cap)) {
    const canonical = canonicalizePublicSearchQuery(candidate);
    if (!canonical.ok) continue;
    const normalized = normalizeCorpusQuery(canonical.query);
    if (!normalized || seen.has(normalized) || FOREIGN_SCRIPT_PATTERN.test(normalized)) continue;
    const candidateAssessment = assessSearchQuery(canonical.query);
    if (candidateAssessment.kind !== "answerable"
      && !(definitionRoot && candidateAssessment.reason === "broad-topic")) continue;
    seen.add(normalized);
    subqueries.push(normalized);
    if (subqueries.length >= cap) break;
  }
  return subqueries;
}

function isFanoutClosed(signal, deadlineAt) {
  return Boolean(signal?.aborted || (Number.isFinite(deadlineAt) && Date.now() >= deadlineAt));
}

function documentKey(document) {
  if (!document || typeof document !== "object") return null;
  const id = stablePublicResultId(document);
  return id ? String(id) : null;
}


export async function searchCorpusFanout(query, {
  filters,
  deadlineAt,
  signal,
  searchCorpusImpl = searchCorpus,
} = {}) {
  const subqueries = buildCorpusFanoutQueries(query);
  const documents = [];
  const statuses = [];
  const seen = new Set();
  let closed = false;

  for (const [index, subquery] of subqueries.entries()) {
    if (closed || isFanoutClosed(signal, deadlineAt)) {
      statuses.push({ index, status: "skipped" });
      continue;
    }
    try {
      const result = await searchCorpusImpl(subquery, {
        page: 1,
        pageSize: 50,
        includeContent: true,
        preferSnapshot: false,
        returnRankedWindow: true,
        filters,
        signal,
        deadlineAt,
      });
      const candidates = Array.isArray(result?.rankedWindow)
        ? result.rankedWindow
        : (Array.isArray(result?.items) ? result.items : []);
      const appliedFilters = result?.appliedFilters ?? filters;
      for (const document of candidates) {
        if (!resultMatchesFilters(document, appliedFilters)) continue;
        const key = documentKey(document);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        documents.push(document);
      }
      statuses.push({ index, status: result?.status || "ready" });
    } catch (error) {
      const aborted = isFanoutClosed(signal, deadlineAt) || error?.name === "AbortError";
      statuses.push({
        index,
        status: aborted ? "aborted" : "error",
        ...(aborted ? {} : { error: error?.name || "Error" }),
      });
      if (aborted) closed = true;
    }
  }

  return { subqueries, documents, statuses };
}
