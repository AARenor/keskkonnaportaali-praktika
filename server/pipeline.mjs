import { readSearchCache, recordSearch } from "./database.mjs";
import { answerCadastreQuestion } from "./cadastre.mjs";
import {
  answerForestryQuestion,
  FORESTRY_KB_REVISION,
} from "./forestry.mjs";
import {
  hydrateKeskkonnaportaalDocuments,
  searchKeskkonnaportaal,
} from "./integrations.mjs";
import { generateGroundedAnswer } from "./llm.mjs";
import {
  SEARCH_DOCUMENTS,
  composeSearchResponse,
  rankDocuments,
  scoreDocument,
} from "./search.mjs";

export const SEARCH_RESPONSE_REVISION = `answer-v3-${FORESTRY_KB_REVISION}`;
const DEFAULT_SEARCH_DEADLINE_MS = 12_000;

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
        + (document.retrieval === "curated-guide" ? 8 : 0)
        + (document.retrieval === "live-discovery" ? 2 : 0),
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

export function isSearchCacheEnabled(value = process.env.SEARCH_CACHE_ENABLED) {
  return String(value ?? "true").toLocaleLowerCase("et") !== "false";
}

async function createPortalDraft(query, { deadlineAt, signal }) {
  let portal;
  try {
    portal = await searchKeskkonnaportaal(query, 12, {
      timeoutMs: Math.max(250, Math.min(5_000, remainingBudget(deadlineAt, 5_500))),
      signal,
    });
  } catch {
    portal = { documents: [], total: 0 };
  }

  const candidates = deduplicate([
    ...portal.documents,
    ...SEARCH_DOCUMENTS.map((document) => ({ ...document, retrieval: "curated-guide" })),
  ]);
  const ranked = rankPortalDocuments(query, candidates);
  const hydrationBudget = remainingBudget(deadlineAt, 2_500);
  const hydrated = hydrationBudget >= 500
    ? await hydrateKeskkonnaportaalDocuments(ranked.slice(0, 5), 5, {
      timeoutMs: Math.min(3_500, hydrationBudget),
      signal,
    })
    : ranked.slice(0, 5);
  const reranked = rankPortalDocuments(query, hydrated);
  return composeSearchResponse(query, reranked, {
    limit: 6,
    total: portal.total || reranked.length,
  });
}

async function searchWithinBudget(cleanQuery, { startedAt, deadlineAt, signal }) {
  const cacheEnabled = isSearchCacheEnabled();
  if (cacheEnabled) {
    const cached = await readSearchCache(cleanQuery, SEARCH_RESPONSE_REVISION);
    if (cached) return cached;
  }

  const cadastreDraft = await answerCadastreQuestion(cleanQuery);
  const forestryDraft = cadastreDraft ? null : answerForestryQuestion(cleanQuery);
  const draft = cadastreDraft || forestryDraft || await createPortalDraft(cleanQuery, { deadlineAt, signal });
  const canGenerate = draft.sources?.length && draft.evidence?.kind === "portal-discovery";
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
    || (evidenceKind === "official-spatial-snapshot" && !spatialDegraded);

  void recordSearch({
    query: cleanQuery,
    response,
    revision: SEARCH_RESPONSE_REVISION,
    answerProvider: llmResult.provider,
    answerStatus: llmResult.status,
    documentIds: draft.evidence?.documentIds || [],
    durationMs,
    cacheResponse: cacheEnabled && cacheResponse,
  }).catch(() => undefined);
  return response;
}

function timeoutFallback(cleanQuery) {
  const draft = composeSearchResponse(cleanQuery, rankDocuments(cleanQuery, SEARCH_DOCUMENTS), { limit: 6 });
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
