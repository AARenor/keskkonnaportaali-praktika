import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { purgeExpiredSearchData } from "./database.mjs";
import {
  corpusStats,
  startCorpusSyncIfStale,
} from "./corpus.mjs";
import { getForestrySuggestions } from "./forestry.mjs";
import { getKeskkonnaportaalSuggestions } from "./integrations.mjs";
import {
  searchEnvironmentLive,
  searchTimeoutFallback,
  settleWithinDeadline,
} from "./pipeline.mjs";
import {
  contextualRetrievalQuery,
  conversationContext,
  parsePublicSearchFilters,
  prepareRankedSearchResults,
  publicSearchListing,
} from "./retrieval.mjs";

const app = express();
const port = Number(process.env.PORT || 3000);
const terrapointBase = String(process.env.TERRAPOINT_API_URL || "https://terrapoint.ee").replace(/\/$/, "");
const publicOrigin = String(process.env.PUBLIC_ORIGIN || "").replace(/\/+$/, "");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(root, "dist", "client");
const cache = new Map();
const requestWindows = new Map();
const MAX_RATE_LIMIT_KEYS = 2_000;
const MAX_PROXY_CACHE_ENTRIES = 250;
const MAX_ACTIVE_SEARCHES = Math.max(1, Math.min(Number(process.env.SEARCH_MAX_CONCURRENCY) || 12, 20));
let activeSearches = 0;

void purgeExpiredSearchData();
const searchDataMaintenance = setInterval(() => void purgeExpiredSearchData(), 60_000);
searchDataMaintenance.unref();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((request, response, next) => {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  let cloudflareProto = "";
  try {
    cloudflareProto = String(JSON.parse(String(request.headers["cf-visitor"] || "{}"))?.scheme || "")
      .trim()
      .toLowerCase();
  } catch {
    cloudflareProto = "";
  }
  if (publicOrigin && (forwardedProto === "http" || cloudflareProto === "http")) {
    return response.redirect(308, `${publicOrigin}${request.originalUrl}`);
  }
  return next();
});
app.use(express.json({ limit: "32kb" }));
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self' https://www.openstreetmap.org https://terrapoint.ee; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
  );
  next();
});

function rateLimit(maxRequests) {
  return (request, response, next) => {
  const now = Date.now();
  const key = `${request.ip || "unknown"}:${request.path}`;
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt > 60_000) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    if (requestWindows.size > MAX_RATE_LIMIT_KEYS) {
      for (const [entryKey, entry] of requestWindows) {
        if (now - entry.startedAt > 60_000 || requestWindows.size > MAX_RATE_LIMIT_KEYS) requestWindows.delete(entryKey);
      }
    }
    return next();
  }
  current.count += 1;
  if (current.count > maxRequests) {
    response.setHeader("Retry-After", "60");
    return response.status(429).json({ error: "Liiga palju päringuid. Proovi minuti pärast uuesti." });
  }
  return next();
  };
}

app.use("/api", rateLimit(120));
app.use("/api/search", rateLimit(20));

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "keskkonnaportaali-praktika",
    timestamp: new Date().toISOString(),
  });
});

function searchFilters(request) {
  return parsePublicSearchFilters({
    source: String(request.query?.source || request.body?.filters?.source || "all"),
    category: String(request.query?.category || request.body?.filters?.category || ""),
    year: request.query?.year || request.body?.filters?.year || null,
    sort: String(request.query?.sort || request.body?.filters?.sort || "relevance"),
  });
}

function searchQuery(request) {
  return String(request.body?.q ?? request.query?.q ?? "").trim();
}

function searchPage(request, name, fallback, maximum) {
  return Math.max(1, Math.min(Number(request.body?.[name] ?? request.query?.[name]) || fallback, maximum));
}

function searchDeadline(startedAt) {
  const configured = Math.max(1_000, Math.min(Number(process.env.SEARCH_DEADLINE_MS) || 15_000, 15_000));
  return startedAt + configured;
}

function emptySearchListing(filters, page = 1, pageSize = 12) {
  return publicSearchListing({
    total: 0,
    page,
    pageSize,
    pageCount: 0,
    hasMore: false,
    items: [],
    facets: { sources: [], categories: [], years: [] },
    appliedFilters: filters,
    updatedAt: new Date().toISOString(),
  });
}

async function handleSearch(request, response) {
  const query = searchQuery(request);
  if (!query) return response.status(400).json({ error: "Sisesta otsingusõna." });
  if (query.length > 180) return response.status(400).json({ error: "Otsing on liiga pikk." });
  const page = searchPage(request, "page", 1, 500);
  const pageSize = searchPage(request, "page_size", 12, 50);
  const parsedFilters = searchFilters(request);
  if (!parsedFilters.ok) return response.status(400).json({ error: parsedFilters.error });
  const filters = parsedFilters.filters;
  if (activeSearches >= MAX_ACTIVE_SEARCHES) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Retry-After", "2");
    return response.status(200).json({
      ...searchTimeoutFallback(query, { assessmentQuery: query, reason: "capacity" }),
      searchResults: emptySearchListing(filters, page, pageSize),
    });
  }
  activeSearches += 1;
  try {
    const startedAt = Date.now();
    const deadlineAt = searchDeadline(startedAt);
    const controller = new AbortController();
    const payload = await settleWithinDeadline((async () => {
      const searchResults = await prepareRankedSearchResults(query, {
        page,
        pageSize,
        filters,
        deadlineAt,
        signal: controller.signal,
      });
      const result = await searchEnvironmentLive(query, {
        startedAt,
        deadlineAt,
        searchResults,
        filters,
        signal: controller.signal,
      });
      return { ...result, searchResults: publicSearchListing(searchResults) };
    })(), Math.max(250, deadlineAt - Date.now()), () => ({
      ...searchTimeoutFallback(query, { assessmentQuery: query }),
      searchResults: emptySearchListing(filters, page, pageSize),
    }), controller);
    response.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
    return response.json(payload);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "search-degraded",
      errorName: String(error?.name || "Error").slice(0, 80),
      errorCode: String(error?.code || "unknown").slice(0, 80),
    }));
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({
      ...searchTimeoutFallback(query, { assessmentQuery: query, reason: "source-error" }),
      searchResults: emptySearchListing(filters, page, pageSize),
    });
  } finally {
    activeSearches = Math.max(0, activeSearches - 1);
  }
}

app.get("/api/search", handleSearch);
app.post("/api/search", handleSearch);

async function handleSearchResults(request, response) {
  const query = searchQuery(request);
  if (!query) return response.status(400).json({ error: "Sisesta otsingusõna." });
  if (query.length > 180) return response.status(400).json({ error: "Otsing on liiga pikk." });
  try {
    const page = searchPage(request, "page", 1, 500);
    const pageSize = searchPage(request, "page_size", 12, 50);
    const startedAt = Date.now();
    const deadlineAt = searchDeadline(startedAt);
    const parsedFilters = searchFilters(request);
    if (!parsedFilters.ok) return response.status(400).json({ error: parsedFilters.error });
    const filters = parsedFilters.filters;
    const controller = new AbortController();
    const results = await settleWithinDeadline(prepareRankedSearchResults(query, {
      page,
      pageSize,
      filters,
      deadlineAt,
      signal: controller.signal,
    }), Math.max(250, deadlineAt - Date.now()), null, controller);
    if (!results) {
      return response.status(503).json({
        error: "Otsingutulemuste laadimine võttis liiga kaua. Proovi uuesti.",
        retryable: true,
      });
    }
    response.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
    return response.json(publicSearchListing(results));
  } catch {
    return response.status(502).json({
      error: "Otsingutulemuste allikad ei vastanud. Proovi hetke pärast uuesti.",
      retryable: true,
    });
  }
}

app.get("/api/search/results", handleSearchResults);
app.post("/api/search/results", handleSearchResults);

app.post("/api/search/follow-up", async (request, response) => {
  const rootQuery = String(request.body?.root_query || "").replace(/\s+/gu, " ").trim();
  const question = String(request.body?.question || "").replace(/\s+/gu, " ").trim();
  const previousQuestions = Array.isArray(request.body?.previous_questions)
    ? request.body.previous_questions.map((value) => String(value || "").replace(/\s+/gu, " ").trim()).filter(Boolean)
    : [];
  if (!rootQuery || !question) return response.status(400).json({ error: "Sisesta jätkuküsimus." });
  if (rootQuery.length > 180 || question.length > 180 || previousQuestions.length > 4
    || previousQuestions.some((value) => value.length > 180)) {
    return response.status(400).json({ error: "Jätkuküsimuse kontekst on liiga pikk." });
  }
  const startedAt = Date.now();
  const deadlineAt = searchDeadline(startedAt);
  const parsedFilters = searchFilters(request);
  if (!parsedFilters.ok) return response.status(400).json({ error: parsedFilters.error });
  const filters = parsedFilters.filters;
  const retrievalQuery = contextualRetrievalQuery(rootQuery, question, previousQuestions);
  try {
    const controller = new AbortController();
    const payload = await settleWithinDeadline((async () => {
      const searchResults = await prepareRankedSearchResults(retrievalQuery, {
        page: 1,
        pageSize: 12,
        filters,
        deadlineAt,
        signal: controller.signal,
      });
      const result = await searchEnvironmentLive(question, {
        startedAt,
        deadlineAt,
        assessmentQuery: retrievalQuery,
        retrievalQuery,
        conversationContext: conversationContext(rootQuery, previousQuestions),
        searchResults,
        filters,
        useCache: false,
        signal: controller.signal,
      });
      return { ...result, searchResults: publicSearchListing(searchResults) };
    })(), Math.max(250, deadlineAt - Date.now()), () => ({
      ...searchTimeoutFallback(question, { assessmentQuery: retrievalQuery }),
      searchResults: emptySearchListing(filters),
    }), controller);
    response.setHeader("Cache-Control", "no-store");
    return response.json(payload);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "follow-up-search-degraded",
      errorName: String(error?.name || "Error").slice(0, 80),
      errorCode: String(error?.code || "unknown").slice(0, 80),
    }));
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({
      ...searchTimeoutFallback(question, { assessmentQuery: retrievalQuery, reason: "source-error" }),
      searchResults: emptySearchListing(filters),
    });
  }
});

app.get("/api/corpus", async (_request, response) => {
  const stats = await corpusStats();
  response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return response.json(stats);
});

async function handleSuggestions(request, response) {
  const query = searchQuery(request);
  if (query.length < 2) return response.json({ suggestions: [] });
  if (query.length > 80) return response.status(400).json({ error: "Otsing on liiga pikk." });
  const curated = getForestrySuggestions(query, 5).map((value) => ({ value, count: null }));
  try {
    const result = await getKeskkonnaportaalSuggestions(query, 5);
    const seen = new Set();
    const suggestions = [...curated, ...result.suggestions]
      .filter((item) => {
        const key = String(item.value || "").toLocaleLowerCase("et");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
    response.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
    return response.json({ suggestions });
  } catch {
    return response.json({ suggestions: curated.slice(0, 5) });
  }
}

app.get("/api/suggestions", handleSuggestions);
app.post("/api/suggestions", handleSuggestions);

function safePathSegment(value, maxLength = 180) {
  const clean = String(value || "").trim();
  if (!clean || clean.length > maxLength) return null;
  return encodeURIComponent(clean);
}

async function cachedJson(url, ttlMs) {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && now - cached.savedAt < ttlMs) {
    return { data: cached.data, cache: "hit", stale: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9_000);
  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Keskkonnaportaali-praktika/1.0" },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      const error = new Error(`Terrapoint vastas staatusega ${upstream.status}`);
      error.upstreamStatus = upstream.status;
      throw error;
    }
    const data = await upstream.json();
    if (cache.has(url)) cache.delete(url);
    cache.set(url, { savedAt: now, data });
    while (cache.size > MAX_PROXY_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    return { data, cache: "miss", stale: false };
  } catch (error) {
    if (cached && now - cached.savedAt < 24 * 60 * 60 * 1000) {
      return { data: cached.data, cache: "stale", stale: true };
    }
    error.isTimeout = error.name === "AbortError";
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function terrapointError(response, error) {
  const timeout = Boolean(error.isTimeout);
  return response.status(timeout ? 504 : 502).json({
    code: timeout ? "TERRAPOINT_TIMEOUT" : "TERRAPOINT_UNAVAILABLE",
    error: timeout
      ? "Terrapointi päring võttis liiga kaua. Proovi uuesti; ülejäänud portaal töötab edasi."
      : "Terrapointi andmeallikas ei vastanud. Proovi hetke pärast uuesti.",
    retryable: true,
  });
}

app.get("/api/terrapoint/address", async (request, response) => {
  const query = safePathSegment(request.query.q, 120);
  if (!query) return response.status(400).json({ error: "Sisesta aadress või kohanimi." });
  try {
    const result = await cachedJson(`${terrapointBase}/api/address/${query}`, 10 * 60 * 1000);
    response.setHeader("Cache-Control", "public, max-age=300");
    return response.json({ ...result.data, proxy: { cache: result.cache, stale: result.stale } });
  } catch (error) {
    return terrapointError(response, error);
  }
});

app.get("/api/terrapoint/parcel/:number", async (request, response) => {
  const number = String(request.params.number || "").trim();
  if (!/^\d{5}:\d{3}:\d{4}$/.test(number)) {
    return response.status(400).json({ error: "Katastritunnus peab olema kujul 12345:678:9012." });
  }
  try {
    const encoded = encodeURIComponent(number);
    const result = await cachedJson(
      `${terrapointBase}/api/search/${encoded}?include_map_layers=false`,
      30 * 60 * 1000,
    );
    response.setHeader("Cache-Control", "public, max-age=600");
    return response.json({ ...result.data, proxy: { cache: result.cache, stale: result.stale } });
  } catch (error) {
    return terrapointError(response, error);
  }
});

app.use(
  express.static(clientRoot, {
    etag: true,
    index: false,
    maxAge: "7d",
    setHeaders(response, filePath) {
      if (filePath.endsWith("index.html")) response.setHeader("Cache-Control", "no-cache");
    },
  }),
);

app.use((request, response, next) => {
  if (request.path === "/api" || request.path.startsWith("/api/")) return next();
  if (!["GET", "HEAD"].includes(request.method) || !request.accepts("html")) return next();
  response.setHeader("Cache-Control", "no-cache");
  return response.sendFile(path.join(clientRoot, "index.html"));
});

app.use((_request, response) => response.status(404).json({ error: "Lehte ei leitud." }));

app.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Keskkonnaportaali praktika listening on ${port}\n`);
  const refreshCorpus = () => {
    void startCorpusSyncIfStale().catch(() => undefined);
  };
  setTimeout(refreshCorpus, 1_000).unref();
  setInterval(refreshCorpus, 60 * 60 * 1_000).unref();
});
