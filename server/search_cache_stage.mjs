import { createHash } from "node:crypto";
import { createByteBoundedLruCache } from "./upstream.mjs";
import { buildIntentAnswer } from "./answer_templates.mjs";
import { analyzeQueryIntent } from "./query_intent.mjs";
import { cacheHitUsageTelemetry } from "./search_usage_projection.mjs";
import { projectSourceCacheCopy, SOURCE_EVIDENCE_COPY_CHARS } from "./source-registry.mjs";
import { publicSourceWitnessKey } from "./source-identity.mjs";

function answerWithCurrentIntentMetadata(cached, query) {
  if (!cached?.answer || typeof cached.answer !== "object") return cached;
  const classification = analyzeQueryIntent(query);
  const template = buildIntentAnswer({
    query,
    intent: classification.intent,
    topic: classification.topic,
    sources: cached.sources || [],
  });
  const format = template?.format || classification.intent;
  const parts = (Array.isArray(cached.answer.parts) ? cached.answer.parts : []).map((part, index) => (
    classification.intent === "procedure"
      ? { ...part, role: part?.role || "step", step: Number.isInteger(part?.step) ? part.step : index + 1 }
      : part
  ));
  return {
    ...cached,
    answer: { ...cached.answer, format, parts },
  };
}

const MAX_ANSWER_CACHE_AGE_MS = 15 * 60 * 1000;
const answerCache = createByteBoundedLruCache({
  maximumEntries: 96,
  maximumBytes: 6_000_000,
});

function answerCacheKey(query, revision) {
  return createHash("sha256")
    .update(`${String(query || "").trim()}\u0000${String(revision || "")}`)
    .digest("hex");
}

function requestStillOpen(signal, deadlineAt) {
  if (signal?.aborted) throw signal.reason || new DOMException("The search request was aborted", "AbortError");
  if (Number.isFinite(deadlineAt) && Date.now() >= deadlineAt) {
    throw new DOMException("The search deadline expired", "AbortError");
  }
}

function validCacheEntry(entry, listing, filters, validate, now) {
  return Boolean(entry?.response)
    && (!Number.isFinite(entry.expiresAt) || now < entry.expiresAt)
    && typeof validate === "function"
    && validate(entry.response, listing, filters);
}
function cacheHitResponse(response, query) {
  return {
    ...answerWithCurrentIntentMetadata(response, query),
    usage_telemetry: cacheHitUsageTelemetry(),
  };
}

export function writeSearchAnswerCache({
  query,
  revision,
  response,
  expiresAt,
  now = Date.now(),
} = {}) {
  if (!query || !revision || !response || typeof response !== "object") return false;
  const boundedExpiry = Math.min(
    Number.isFinite(expiresAt) ? expiresAt : now + MAX_ANSWER_CACHE_AGE_MS,
    now + MAX_ANSWER_CACHE_AGE_MS,
  );
  if (boundedExpiry <= now) return false;
  return answerCache.set(answerCacheKey(query, revision), {
    response: structuredClone(response),
    expiresAt: boundedExpiry,
  });
}

function filterIdentity(filters = {}) {
  return {
    source: String(filters.source ?? "all"),
    category: String(filters.category ?? ""),
    year: filters.year === undefined || filters.year === null || filters.year === ""
      ? null
      : String(filters.year),
    sort: String(filters.sort ?? "relevance"),
  };
}

const CACHEABLE_EVIDENCE_POLICIES = new Set(["claim-specific", "route-only", "timestamped", "versioned"]);
const MAX_CACHED_FRESHNESS_AGE_MS = 10 * 366 * 24 * 60 * 60 * 1_000;

function boundedText(value, limit) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function sourceCitation(source, index) {
  return Number.isInteger(source?.citation) && source.citation > 0 ? source.citation : index + 1;
}

function cachedSourcePolicyMetadata(source, copy) {
  const freshness = source?.freshness && typeof source.freshness === "object" && !Array.isArray(source.freshness)
    ? source.freshness
    : null;
  const maxAgeMs = freshness?.maxAgeMs === null
    ? null
    : Number.isFinite(Number(freshness?.maxAgeMs)) && Number(freshness.maxAgeMs) > 0
      && Number(freshness.maxAgeMs) <= MAX_CACHED_FRESHNESS_AGE_MS
      ? Number(freshness.maxAgeMs)
      : 0;
  return {
    sourceTier: boundedText(source?.sourceTier, 40),
    evidencePolicy: CACHEABLE_EVIDENCE_POLICIES.has(source?.evidencePolicy)
      ? source.evidencePolicy
      : "invalid",
    ...(typeof source?._answerEvidenceEligible === "boolean"
      ? { _answerEvidenceEligible: source._answerEvidenceEligible }
      : {}),
    retrieval: boundedText(source?.retrieval, 120),
    delivery: boundedText(source?.delivery, 120),
    ...(copy.policy ? { _sourcePolicy: copy.policy, _sourcePolicyBinding: copy.binding } : {}),
    ...(freshness ? {
      freshness: {
        class: boundedText(freshness.class, 80),
        basis: boundedText(freshness.basis, 80),
        maxAgeMs,
        requiresSourceTimestamp: freshness.requiresSourceTimestamp === true,
      },
    } : {}),
    _evidenceObservedAt: boundedText(source?._evidenceObservedAt, 40),
    _evidenceValidFrom: boundedText(source?._evidenceValidFrom, 40),
    _evidenceValidUntil: boundedText(source?._evidenceValidUntil, 40),
    _evidenceVersion: boundedText(source?._evidenceVersion, 120),
    _evidenceStatusAt: boundedText(source?._evidenceStatusAt, 40),
    _publishedAt: boundedText(source?._publishedAt, 40),
  };
}

function responseCitations(response) {
  const citations = new Set();
  const collect = (values) => {
    if (Array.isArray(values)) {
      values.forEach((value) => {
        if (Number.isInteger(value) && value > 0) citations.add(value);
      });
    }
  };
  collect(response?.answer?.introCitations);
  (Array.isArray(response?.answer?.parts) ? response.answer.parts : [])
    .forEach((part) => collect(part?.citations));
  if (Number.isInteger(response?.chart?.citation) && response.chart.citation > 0) citations.add(response.chart.citation);
  return citations;
}

export function prepareSearchAnswerCacheResponse(response, privateSources, { now = Date.now() } = {}) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const visibleSources = Array.isArray(response.sources) ? response.sources : [];
  const sourceRecords = Array.isArray(privateSources) ? privateSources : [];
  const citations = responseCitations(response);
  const sources = [];

  for (const [index, visibleSource] of visibleSources.entries()) {
    const citation = sourceCitation(visibleSource, index);
    const witnessKey = publicSourceWitnessKey(visibleSource);
    if (!witnessKey) return null;
    const privateSource = sourceRecords.find((candidate, candidateIndex) => (
      sourceCitation(candidate, candidateIndex) === citation
      && publicSourceWitnessKey(candidate) === witnessKey
    )) || sourceRecords.find((candidate) => publicSourceWitnessKey(candidate) === witnessKey);
    if (!privateSource) return null;
    const copy = projectSourceCacheCopy(privateSource, { now, limit: SOURCE_EVIDENCE_COPY_CHARS });
    if (!copy.permitted) return null;
    const requiredExcerpt = typeof visibleSource.evidenceExcerpt === "string"
      ? visibleSource.evidenceExcerpt.trim()
      : "";
    if (requiredExcerpt && String(copy.fields.evidenceExcerpt || "").trim() !== requiredExcerpt) return null;
    const metadata = cachedSourcePolicyMetadata(privateSource, copy);
    if (citations.has(citation)
      && (metadata.evidencePolicy === "invalid" || metadata._answerEvidenceEligible !== true)) return null;
    sources.push({
      ...visibleSource,
      citation,
      summary: boundedText(copy.fields.summary, SOURCE_EVIDENCE_COPY_CHARS),
      evidenceExcerpt: boundedText(copy.fields.evidenceExcerpt, SOURCE_EVIDENCE_COPY_CHARS),
      ...metadata,
    });
  }

  if ([...citations].some((citation) => !sources.some((source) => source.citation === citation))) return null;
  return { ...response, sources };
}

export function createSearchAnswerCacheRevision({
  responseRevision,
  lawRevision,
  listingRevision,
  queryRevision,
  windowId,
  filters,
} = {}) {
  const identity = {
    responseRevision: String(responseRevision || ""),
    lawRevision: String(lawRevision || ""),
    listingRevision: String(queryRevision || (windowId ? `window:${windowId}` : listingRevision || "unversioned")),
    windowId: String(windowId || ""),
    filters: filterIdentity(filters),
  };
  const digest = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  return `${identity.responseRevision}:${identity.lawRevision}:${digest}`;
}

export async function readSearchAnswerCache({
  query,
  revision,
  listing,
  filters,
  enabled,
  readCache,
  validate,
  signal,
  deadlineAt,
} = {}) {
  if (!enabled || !listing?.items?.length) return null;
  requestStillOpen(signal, deadlineAt);
  const key = answerCacheKey(query, revision);
  const now = Date.now();
  const local = answerCache.get(key);
  if (validCacheEntry(local, listing, filters, validate, now)) {
    return cacheHitResponse(local.response, query);
  }
  if (local) answerCache.delete(key);
  if (typeof readCache !== "function") return null;
  const cached = await readCache(query, revision, { signal, deadlineAt });
  requestStillOpen(signal, deadlineAt);
  if (!cached || typeof validate !== "function" || !validate(cached, listing, filters)) return null;
  answerCache.set(key, {
    response: structuredClone(cached),
    expiresAt: now + MAX_ANSWER_CACHE_AGE_MS,
  });
  return cacheHitResponse(cached, query);
}
