import { readSearchCache, recordSearch } from "./database.mjs";
import { answerCadastreQuestion } from "./cadastre.mjs";
import {
  hydrateOfficialDocuments,
} from "./integrations.mjs";
import { generateGroundedAnswer } from "./llm.mjs";
import {
  canonicalResultUrl,
  evidenceDocumentsFromListing,
  prepareRankedSearchResults,
  rankSearchCandidates,
} from "./retrieval.mjs";
import {
  assessEvidence,
  assessSearchQuery,
  composeScopeResponse,
  composeSearchResponse,
  hasCompleteSentenceEnding,
  normalize,
  queryTerms,
  splitTextPassages,
  textHasQueryRoot,
} from "./search.mjs";

export const SEARCH_RESPONSE_REVISION = "answer-v11-ranked-live-sources";
const DEFAULT_SEARCH_DEADLINE_MS = 15_000;

function rankPortalDocuments(query, documents) {
  return rankSearchCandidates(query, documents).map((document) => ({
    ...document,
    score: document._ranking.score,
  }));
}

function passageQueryCoverage(query, passage) {
  const roots = queryTerms(query);
  if (!roots.length) return 0;
  return roots.filter((root) => textHasQueryRoot(passage, root)).length / roots.length;
}

function passageDirectness(query, passage) {
  const roots = queryTerms(query);
  const text = normalize(passage);
  const years = normalize(query).match(/\b(?:19|20)\d{2}\b/gu) || [];
  const yearScore = years.length ? (years.every((year) => text.includes(year)) ? 20 : -20) : 0;
  if (roots.includes("keskkonnamoju")) {
    const subjectRoots = roots.filter((root) => !["keskkonnamoju", "ida", "virumaa"].includes(root));
    const hasSubject = subjectRoots.some((root) => textHasQueryRoot(text, root));
    const hasImpact = textHasQueryRoot(text, "keskkonnamoju");
    const concreteImpact = /\b(?:pohjave|pinnave|joogive|mura|lohket|tolm|hairing|leevend|enneta|taaskasut|aherain|eluslood|maastik|kahju)\w*/u.test(text);
    const procedureOnly = /\b(?:nousolek|komisjon|vallavalits|ministeerium|avalik rahvakoosolek)\w*/u.test(text)
      && !concreteImpact;
    return yearScore
      + (hasSubject && hasImpact ? 20 : 0)
      + (concreteImpact ? 12 : 0)
      - (procedureOnly ? 18 : 0);
  }
  if (roots.some((root) => ["muutus", "kasv"].includes(root))
    && roots.some((root) => ["noor", "vanus"].includes(root))) {
    const hasForestAge = text.includes("mets") && /\b(?:noor|vanus|vana)\w*/u.test(text);
    const hasDirection = /\b(?:suuren|vahen|lang|kahan|pusi)\w*/u.test(text);
    return yearScore + (hasForestAge && hasDirection ? 20 : 0);
  }
  return yearScore;
}

export function directEvidenceExtract(query, document) {
  const passages = [document?.summary, document?.content]
    .filter(Boolean)
    .flatMap(splitTextPassages)
    .map((value) => value.replace(/\s+/gu, " ").trim())
    .filter((value) => value.length >= 35 && value.length <= 520 && hasCompleteSentenceEnding(value));
  return passages
    .map((passage, index) => ({
      passage: passage.replace(/^[„“”"']+|[„“”"']+$/gu, "").trim(),
      score: passageQueryCoverage(query, passage) * 20 + passageDirectness(query, passage) - index * 0.001,
    }))
    .sort((left, right) => right.score - left.score)[0]?.passage?.slice(0, 520) || "";
}

export function publicResponse(draft) {
  const { evidence: _evidence, ...response } = draft;
  return {
    ...response,
    sources: (response.sources || []).map((source) => Object.fromEntries([
      "id", "citation", "title", "organization", "type", "published", "url", "summary", "locator", "tags", "sourceTier",
    ].filter((key) => source[key] !== undefined).map((key) => [key, source[key]]))),
  };
}

function remainingBudget(deadlineAt, reserveMs = 0) {
  return Math.max(0, deadlineAt - Date.now() - reserveMs);
}

export function isSearchCacheEnabled(value = process.env.SEARCH_CACHE_ENABLED) {
  return String(value ?? "true").toLocaleLowerCase("et") !== "false";
}

export function shouldGenerateGroundedAnswer(draft) {
  return Boolean(
    draft?.sources?.length
    && ["ranked-search-results", "reviewed-official-source"].includes(draft?.evidence?.kind)
    && draft?.evidence?.answerable === true,
  );
}

export function mergeRelatedQuestions(generated = [], reviewed = [], limit = 6) {
  const seen = new Set();
  return [...generated, ...reviewed]
    .map((value) => String(value || "").replace(/\s+/gu, " ").trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase("et").replace(/[^0-9a-zõäöüšž]+/giu, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 6, 6)));
}

export async function createPortalDraft(query, {
  deadlineAt,
  signal,
  retrievalQuery = query,
  searchResults,
} = {}) {
  const listing = searchResults || await prepareRankedSearchResults(retrievalQuery, {
    page: 1,
    pageSize: 12,
    deadlineAt,
    signal,
  });
  const candidates = evidenceDocumentsFromListing(listing);
  const ranked = rankPortalDocuments(retrievalQuery, candidates);
  const hydrationBudget = remainingBudget(deadlineAt, 7_000);
  const hydrated = hydrationBudget >= 500
    ? await hydrateOfficialDocuments(ranked.slice(0, 8), 8, {
      timeoutMs: Math.min(2_000, hydrationBudget),
      signal,
    })
    : ranked.slice(0, 8);
  const reranked = rankPortalDocuments(retrievalQuery, hydrated);
  const quality = assessEvidence(retrievalQuery, reranked);
  const direct = quality.strong
    ? reranked.find((document) => document.id === quality.directDocumentId)
    : null;
  const directCitation = direct
    ? reranked.findIndex((document) => document.id === direct.id) + 1
    : 0;
  const draft = composeSearchResponse(query, reranked, {
    answerable: quality.strong,
    clarification: quality.strong
      ? null
      : "Leitud allikad ei kata küsimust piisavalt täpselt. Lisa konkreetne objekt, näitaja, piirkond või aasta.",
    evidenceKind: quality.strong ? "ranked-search-results" : "insufficient-evidence",
    limit: 8,
    quality,
    total: Number(listing.total || reranked.length),
  });
  const directExtract = direct ? directEvidenceExtract(retrievalQuery, direct) : "";
  if (directExtract) {
    draft.answer.eyebrow = "Allikapõhine kokkuvõte";
    draft.answer.intro = directExtract;
    draft.answer.introCitations = [directCitation];
  }
  return draft;
}

function cachedSourcesBelongToListing(cached, listing) {
  if (!listing?.items?.length || !cached?.sources?.length) return true;
  const urls = new Set(listing.items.map((item) => canonicalResultUrl(item.url)));
  return cached.sources.every((source) => urls.has(canonicalResultUrl(source.url)));
}

function draftSourcesBelongToListing(draft, listing) {
  if (!draft?.sources?.length) return true;
  const urls = new Set((listing?.items || []).map((item) => canonicalResultUrl(item.url)));
  return draft.sources.every((source) => urls.has(canonicalResultUrl(source.url)));
}

async function searchWithinBudget(cleanQuery, {
  startedAt,
  deadlineAt,
  signal,
  assessmentQuery = cleanQuery,
  retrievalQuery = cleanQuery,
  searchResults,
  filters = {},
  conversationContext = "",
  useCache = true,
}) {
  const defaultFilters = !filters?.category && !filters?.year
    && [undefined, "", "all"].includes(filters?.source)
    && [undefined, "", "relevance"].includes(filters?.sort);
  const cacheEnabled = useCache && defaultFilters && isSearchCacheEnabled();
  if (cacheEnabled) {
    const cached = await readSearchCache(cleanQuery, SEARCH_RESPONSE_REVISION);
    if (cached && cachedSourcesBelongToListing(cached, searchResults)) return cached;
  }

  const assessment = assessSearchQuery(assessmentQuery);
  let draft;
  if (assessment.kind !== "answerable") {
    draft = composeScopeResponse(cleanQuery, assessment);
    if (searchResults && !draftSourcesBelongToListing(draft, searchResults)) {
      const filteredDocuments = rankPortalDocuments(retrievalQuery, evidenceDocumentsFromListing(searchResults));
      draft = composeSearchResponse(cleanQuery, filteredDocuments, {
        answerable: false,
        clarification: defaultFilters
          ? "Selle küsimuse jaoks vajalikku reaalaja- või registriallikat ei leitud nähtavast tulemusehulgast. Täpsusta päringut või proovi uuesti."
          : "Valitud filtrid välistavad selle küsimuse jaoks vajaliku reaalaja- või registriallika. Lähtesta filter või vali sobiv ametlik sisutüüp.",
        evidenceKind: "filtered-scope-exclusion",
        limit: 6,
        total: Number(searchResults.total || filteredDocuments.length),
      });
    }
  } else {
    const cadastreDraft = await answerCadastreQuestion(cleanQuery);
    draft = cadastreDraft || await createPortalDraft(cleanQuery, {
      deadlineAt,
      signal,
      retrievalQuery,
      searchResults,
    });
  }
  const canGenerate = shouldGenerateGroundedAnswer(draft);
  const llmBudget = remainingBudget(deadlineAt, 300);
  const llmResult = canGenerate && llmBudget >= 500
    ? await generateGroundedAnswer(cleanQuery, draft, {
      timeoutMs: llmBudget,
      signal,
      conversationContext,
    })
    : { answer: null, status: "not-applicable", provider: "deterministic-current-evidence" };

  if (llmResult.answer) draft.answer = llmResult.answer;
  if (llmResult.related?.length) draft.related = mergeRelatedQuestions(llmResult.related, draft.related, 6);
  draft.generatedAt = new Date().toISOString();
  const response = publicResponse(draft);
  const durationMs = Date.now() - startedAt;
  const evidenceKind = draft.evidence?.kind;
  const spatialDegraded = evidenceKind === "official-spatial-snapshot"
    && Object.values(draft.evidence?.states || {}).some((state) => state === "unavailable");
  const cacheResponse = llmResult.status === "ready"
    || evidenceKind === "safe-abstention"
    || evidenceKind === "needs-clarification"
    || evidenceKind === "official-live-routing"
    || (evidenceKind === "official-spatial-snapshot" && !spatialDegraded);
  const ttlMinutes = evidenceKind === "official-live-routing" ? 5 : 20;

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

export function searchTimeoutFallback(cleanQuery, {
  assessmentQuery = cleanQuery,
  searchResults,
  reason = "deadline",
} = {}) {
  const assessment = assessSearchQuery(assessmentQuery);
  if (assessment.kind !== "answerable") return publicResponse(composeScopeResponse(cleanQuery, assessment));
  const sourceUnavailable = reason === "source-error";
  const capacityLimited = reason === "capacity";
  const ranked = searchResults?.items?.length
    ? rankPortalDocuments(assessmentQuery, evidenceDocumentsFromListing(searchResults))
    : [];
  const quality = assessEvidence(cleanQuery, ranked);
  const draft = composeSearchResponse(cleanQuery, ranked, {
    answerable: false,
    clarification: capacityLimited
      ? "Otsing teenindab praegu mitut päringut korraga. Proovi paari sekundi pärast uuesti."
      : sourceUnavailable
        ? "Osa värskeid allikaid ei vastanud. Proovi uuesti või lisa täpsem objekt, näitaja, piirkond või aasta."
        : "Värskete allikate laadimine võttis liiga kaua. Proovi uuesti või lisa täpsem objekt, näitaja, piirkond või aasta.",
    evidenceKind: capacityLimited
      ? "capacity-fallback"
      : sourceUnavailable ? "source-unavailable-fallback" : "deadline-fallback",
    limit: 6,
    quality,
  });
  draft.answer.eyebrow = capacityLimited
    ? "Otsing on praegu koormatud"
    : sourceUnavailable ? "Osa allikaid ei vastanud" : "Otsing võttis liiga kaua";
  draft.answer.intro = capacityLimited
    ? "Otsing teenindab praegu mitut päringut korraga ning uut faktivastust ei koostatud. See ei tähenda, et otsitud andmeid ei ole."
    : sourceUnavailable
      ? "Osa värskeid allikaid ei vastanud ning uut faktivastust ei koostatud. See ei tähenda, et otsitud andmeid ei ole."
      : "Värskete allikate laadimine ei jõudnud vastuse ajapiiri sisse. See ei tähenda, et otsitud andmeid ei ole.";
  draft.answer.introCitations = [];
  draft.answer.parts = [];
  draft.answer.note = ranked.length
    ? capacityLimited
      ? "Proovi otsingut paari sekundi pärast uuesti."
      : sourceUnavailable
      ? "Juba leitud ametlikud allikad on kuvatud allpool, kuid ajutise vea järel neist uut faktivastust ei koostatud. Proovi otsingut uuesti."
      : "Juba leitud ametlikud allikad on kuvatud allpool, kuid neist ei koostatud ajapiiri järel uut faktivastust. Proovi otsingut uuesti."
    : capacityLimited
      ? "Proovi otsingut paari sekundi pärast uuesti."
      : "Proovi otsingut uuesti või lisa täpsem objekt, näitaja, piirkond või aasta.";
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

export async function searchEnvironmentLive(query, options = {}) {
  const startedAt = Number(options.startedAt) || Date.now();
  const cleanQuery = String(query ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!cleanQuery) return composeSearchResponse("", [], { limit: 3, total: 0 });

  const configuredDeadlineMs = Math.max(1_000, Math.min(Number(process.env.SEARCH_DEADLINE_MS) || DEFAULT_SEARCH_DEADLINE_MS, 15_000));
  const absoluteDeadline = Number(options.deadlineAt) || startedAt + configuredDeadlineMs;
  const deadlineMs = Math.max(250, Math.min(configuredDeadlineMs, absoluteDeadline - Date.now()));
  const controller = new AbortController();
  const signal = options.signal && typeof AbortSignal.any === "function"
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  const operation = searchWithinBudget(cleanQuery, {
    startedAt,
    deadlineAt: absoluteDeadline,
    signal,
    assessmentQuery: options.assessmentQuery || cleanQuery,
    retrievalQuery: options.retrievalQuery || cleanQuery,
    searchResults: options.searchResults,
    filters: options.filters || {},
    conversationContext: options.conversationContext || "",
    useCache: options.useCache !== false,
  }).catch(() => searchTimeoutFallback(cleanQuery, { ...options, reason: "source-error" }));
  return settleWithinDeadline(operation, deadlineMs, () => searchTimeoutFallback(cleanQuery, options), controller);
}
