import { databaseConfiguration, readSearchCache, recordSearch } from "./database.mjs";
import {
  INTEGRATION_ENDPOINTS,
  searchKeskkonnaportaal,
  searchTerrapointProperty,
  terrapointSourceDocuments,
} from "./integrations.mjs";
import { generateGroundedAnswer, llmConfiguration } from "./llm.mjs";
import { qdrantConfiguration, rerankWithQdrant } from "./qdrant.mjs";
import {
  SEARCH_DOCUMENTS,
  composeSearchResponse,
  rankDocuments,
  scoreDocument,
} from "./search.mjs";

function deduplicate(documents) {
  const seen = new Map();
  for (const document of documents) {
    const key = String(document.url || document.id).replace(/\/+$/, "").toLocaleLowerCase("et");
    if (!seen.has(key)) seen.set(key, document);
  }
  return [...seen.values()];
}

function providerStatus(result, readyStatus = "live") {
  if (result.status === "fulfilled") return readyStatus;
  return "degraded";
}

export async function searchEnvironmentLive(query, limit = 7) {
  const startedAt = Date.now();
  const cleanQuery = String(query ?? "").trim().slice(0, 180);
  if (!cleanQuery) return composeSearchResponse("", [], { limit: 3, total: 0 });

  if (String(process.env.SEARCH_CACHE_ENABLED || "true").toLowerCase() !== "false") {
    const cached = await readSearchCache(cleanQuery);
    if (cached) {
      return {
        ...cached,
        meta: {
          ...cached.meta,
          cache: "postgres-hit",
          durationMs: Date.now() - startedAt,
        },
      };
    }
  }

  const [portalResult, propertyResult] = await Promise.allSettled([
    searchKeskkonnaportaal(cleanQuery, 14),
    searchTerrapointProperty(cleanQuery),
  ]);

  const portal = portalResult.status === "fulfilled" ? portalResult.value : { documents: [], total: 0, cache: null };
  const property = propertyResult.status === "fulfilled" ? propertyResult.value : { documents: [], status: "degraded" };
  const candidates = deduplicate([
    ...property.documents,
    ...portal.documents,
    ...terrapointSourceDocuments(),
    ...(portal.documents.length ? [] : SEARCH_DOCUMENTS),
  ]);

  const ranked = rankDocuments(cleanQuery, candidates)
    .map((document) => ({
      ...document,
      score:
        scoreDocument(document, cleanQuery)
        + (document.retrieval === "live-property-api" ? 30 : 0)
        + (document.retrieval === "live-search" ? 5 : 0)
        + (document.retrieval === "source-register" ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "et"));

  const vectorResult = await rerankWithQdrant(cleanQuery, ranked.slice(0, 30), limit);
  const response = composeSearchResponse(cleanQuery, vectorResult.documents, {
    limit,
    total: portal.total || ranked.length,
    mode: "live-retrieval-grounded-answer",
    meta: {
      answerProvider: llmConfiguration().provider,
      cache: "miss",
      providers: [
        {
          id: "keskkonnaportaal",
          label: "Keskkonnaportaal",
          kind: "ametlik reaalaja otsing",
          status: providerStatus(portalResult),
          endpoint: INTEGRATION_ENDPOINTS.portalSearch,
          resultCount: portal.documents.length,
        },
        {
          id: "terrapoint",
          label: "Terrapoint",
          kind: property.status === "live" ? "kinnistu avalik API" : "andmeallikaregister",
          status: propertyResult.status === "rejected" ? "degraded" : property.status === "live" ? "live" : "ready",
          endpoint: INTEGRATION_ENDPOINTS.terrapoint,
          resultCount: property.documents.length,
        },
      ],
      vectorStore: {
        provider: "Qdrant",
        status: vectorResult.status,
        collection: vectorResult.collection || qdrantConfiguration().collection,
      },
      database: {
        provider: "PostgreSQL",
        status: databaseConfiguration().enabled ? "configured" : "disabled",
      },
      durationMs: 0,
    },
  });

  const llmResult = await generateGroundedAnswer(cleanQuery, response.sources);
  if (llmResult.answer) response.answer = llmResult.answer;
  if (llmResult.related?.length) response.related = llmResult.related;
  response.meta.answerProvider = llmResult.provider;
  response.meta.llmStatus = llmResult.status;
  response.meta.durationMs = Date.now() - startedAt;

  const databaseResult = await recordSearch({
    query: cleanQuery,
    response,
    durationMs: response.meta.durationMs,
  });
  response.meta.database.status = databaseResult.status;
  return response;
}
