import { readSearchCache, recordSearch } from "./database.mjs";
import { answerCadastreQuestion } from "./cadastre.mjs";
import {
  answerForestryQuestion,
  FORESTRY_KB_REVISION,
} from "./forestry.mjs";
import {
  hydrateOfficialDocuments,
  searchOfficialSites,
  searchKeskkonnaportaal,
} from "./integrations.mjs";
import { generateGroundedAnswer } from "./llm.mjs";
import {
  SEARCH_DOCUMENTS,
  assessEvidence,
  assessSearchQuery,
  buildDiscoveryQuery,
  composeScopeResponse,
  composeSearchResponse,
  rankDocuments,
  scoreDocument,
} from "./search.mjs";

export const SEARCH_RESPONSE_REVISION = `answer-v4-${FORESTRY_KB_REVISION}`;
const DEFAULT_SEARCH_DEADLINE_MS = 15_000;

function deduplicate(documents) {
  const seen = new Map();
  for (const document of documents) {
    const key = String(document.url || document.id).replace(/\/+$/, "").toLocaleLowerCase("et");
    if (!seen.has(key)) seen.set(key, document);
  }
  return [...seen.values()];
}

function rankPortalDocuments(query, documents) {
  return rankDocuments(query, documents)
    .map((document) => ({
      ...document,
      score: scoreDocument(document, query)
        + (document.retrieval === "curated-guide" ? 2 : 0)
        + (document.retrieval === "live-discovery" ? 3 : 0)
        + (document.retrieval === "official-federated-search" ? 4 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "et"));
}

export function publicResponse(draft) {
  const { evidence: _evidence, ...response } = draft;
  return {
    ...response,
    sources: (response.sources || []).map((source) => Object.fromEntries([
      "id", "citation", "title", "organization", "type", "published", "url", "summary", "locator", "tags",
    ].filter((key) => source[key] !== undefined).map((key) => [key, source[key]]))),
  };
}

function remainingBudget(deadlineAt, reserveMs = 0) {
  return Math.max(0, deadlineAt - Date.now() - reserveMs);
}

function reviewedSourceDraft(query, ordered, quality) {
  const draft = composeSearchResponse(query, ordered, {
    answerable: true,
    evidenceKind: "reviewed-official-source",
    limit: 6,
    quality,
    total: ordered.length,
  });
  const directSource = draft.sources.find((source) => source.id === quality.directDocumentId);
  if (!directSource?.answer) return draft;
  draft.answer = {
    eyebrow: "Kontrollitud koondvastus",
    title: draft.answer.title,
    intro: directSource.answer,
    introCitations: [directSource.citation],
    parts: [],
    note: "Vastus põhineb kuvatud ametlikul allikal. Õigusliku või asukohapõhise otsuse puhul kontrolli alati algallikat.",
  };
  return draft;
}

export function isSearchCacheEnabled(value = process.env.SEARCH_CACHE_ENABLED) {
  return String(value ?? "true").toLocaleLowerCase("et") !== "false";
}

export function shouldGenerateGroundedAnswer(draft) {
  return Boolean(
    draft?.sources?.length
    && ["portal-discovery", "reviewed-official-source"].includes(draft?.evidence?.kind)
    && draft?.evidence?.answerable === true,
  );
}

export async function createPortalDraft(query, { deadlineAt, signal }) {
  const reviewed = rankPortalDocuments(
    query,
    SEARCH_DOCUMENTS.map((document) => ({ ...document, retrieval: "curated-guide" })),
  );
  const reviewedQuality = assessEvidence(query, reviewed);
  if (reviewedQuality.strong) {
    const direct = reviewed.find((document) => document.id === reviewedQuality.directDocumentId);
    const ordered = direct ? [direct] : reviewed;
    return reviewedSourceDraft(query, ordered, reviewedQuality);
  }

  const discoveryQuery = buildDiscoveryQuery(query) || query;
  const discoveryTimeout = Math.max(250, Math.min(3_000, remainingBudget(deadlineAt, 8_000)));
  const [portalResult, officialResult] = await Promise.allSettled([
    searchKeskkonnaportaal(discoveryQuery, 10, { timeoutMs: discoveryTimeout, signal }),
    searchOfficialSites(discoveryQuery, 5, { timeoutMs: discoveryTimeout, signal }),
  ]);
  const portal = portalResult.status === "fulfilled"
    ? portalResult.value
    : { documents: [], total: 0 };
  const official = officialResult.status === "fulfilled"
    ? officialResult.value
    : { documents: [], total: 0, services: [] };

  const candidates = deduplicate([
    ...portal.documents,
    ...official.documents,
    ...SEARCH_DOCUMENTS.map((document) => ({ ...document, retrieval: "curated-guide" })),
  ]);
  const ranked = rankPortalDocuments(query, candidates);
  const hydrationBudget = remainingBudget(deadlineAt, 7_000);
  const hydrated = hydrationBudget >= 500
    ? await hydrateOfficialDocuments(ranked.slice(0, 4), 4, {
      timeoutMs: Math.min(2_000, hydrationBudget),
      signal,
    })
    : ranked.slice(0, 4);
  const reranked = rankPortalDocuments(query, hydrated);
  const quality = assessEvidence(query, reranked);
  const direct = quality.strong
    ? reranked.find((document) => document.id === quality.directDocumentId)
    : null;
  const responseDocuments = direct
    ? [direct, ...reranked.filter((document) => document.id !== direct.id)]
    : reviewed;
  return composeSearchResponse(query, responseDocuments, {
    answerable: quality.strong,
    clarification: quality.strong
      ? null
      : "Leitud allikad ei kata küsimust piisavalt täpselt. Lisa konkreetne objekt, näitaja, piirkond või aasta.",
    evidenceKind: quality.strong ? "portal-discovery" : "insufficient-evidence",
    limit: 6,
    quality,
    total: portal.total + official.total || reranked.length,
  });
}

async function searchWithinBudget(cleanQuery, { startedAt, deadlineAt, signal }) {
  const cacheEnabled = isSearchCacheEnabled();
  if (cacheEnabled) {
    const cached = await readSearchCache(cleanQuery, SEARCH_RESPONSE_REVISION);
    if (cached) return cached;
  }

  const assessment = assessSearchQuery(cleanQuery);
  let draft;
  if (assessment.kind !== "answerable") {
    draft = composeScopeResponse(cleanQuery, assessment);
  } else {
    const cadastreDraft = await answerCadastreQuestion(cleanQuery);
    const forestryDraft = cadastreDraft ? null : answerForestryQuestion(cleanQuery);
    draft = cadastreDraft || forestryDraft || await createPortalDraft(cleanQuery, { deadlineAt, signal });
  }
  const canGenerate = shouldGenerateGroundedAnswer(draft);
  const llmBudget = remainingBudget(deadlineAt, 300);
  const llmResult = canGenerate && llmBudget >= 500
    ? await generateGroundedAnswer(cleanQuery, draft, { timeoutMs: llmBudget, signal })
    : { answer: null, status: "not-applicable", provider: "reviewed-knowledge" };

  if (llmResult.answer) draft.answer = llmResult.answer;
  draft.generatedAt = new Date().toISOString();
  const response = publicResponse(draft);
  const durationMs = Date.now() - startedAt;
  const evidenceKind = draft.evidence?.kind;
  const spatialDegraded = evidenceKind === "official-spatial-snapshot"
    && Object.values(draft.evidence?.states || {}).some((state) => state === "unavailable");
  const cacheResponse = llmResult.status === "ready"
    || evidenceKind === "reviewed-forestry-knowledge"
    || evidenceKind === "safe-abstention"
    || evidenceKind === "needs-clarification"
    || evidenceKind === "official-live-routing"
    || (evidenceKind === "official-spatial-snapshot" && !spatialDegraded);
  const ttlMinutes = evidenceKind === "official-live-routing" ? 5 : 60;

  void recordSearch({
    query: cleanQuery,
    response,
    revision: SEARCH_RESPONSE_REVISION,
    answerProvider: llmResult.provider,
    answerStatus: llmResult.status,
    documentIds: draft.evidence?.documentIds || [],
    durationMs,
    ttlMinutes,
    cacheResponse: cacheEnabled && cacheResponse,
  }).catch(() => undefined);
  return response;
}

function timeoutFallback(cleanQuery) {
  const assessment = assessSearchQuery(cleanQuery);
  if (assessment.kind !== "answerable") return publicResponse(composeScopeResponse(cleanQuery, assessment));
  const ranked = rankDocuments(cleanQuery, SEARCH_DOCUMENTS);
  const quality = assessEvidence(cleanQuery, ranked);
  const draft = composeSearchResponse(cleanQuery, ranked, {
    answerable: false,
    clarification: "Värskete allikate laadimine võttis liiga kaua. Proovi uuesti või lisa täpsem objekt, näitaja, piirkond või aasta.",
    evidenceKind: "deadline-fallback",
    limit: 6,
    quality,
  });
  draft.answer.note = "Värskete allikate laadimine ei jõudnud vastuse ajapiiri sisse. Kuvatud koond põhineb kontrollitud põhiallikatel; täpsema tulemuse saamiseks proovi otsingut uuesti.";
  return publicResponse(draft);
}

export async function settleWithinDeadline(operation, timeoutMs, fallback, controller = new AbortController()) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(typeof fallback === "function" ? fallback() : fallback);
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve(operation), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function searchEnvironmentLive(query) {
  const startedAt = Date.now();
  const cleanQuery = String(query ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!cleanQuery) return composeSearchResponse("", [], { limit: 3, total: 0 });

  const deadlineMs = Math.max(1_000, Math.min(Number(process.env.SEARCH_DEADLINE_MS) || DEFAULT_SEARCH_DEADLINE_MS, 15_000));
  const controller = new AbortController();
  const operation = searchWithinBudget(cleanQuery, {
    startedAt,
    deadlineAt: startedAt + deadlineMs,
    signal: controller.signal,
  }).catch(() => timeoutFallback(cleanQuery));
  return settleWithinDeadline(operation, deadlineMs, () => timeoutFallback(cleanQuery), controller);
}
