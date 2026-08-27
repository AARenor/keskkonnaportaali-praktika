import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { purgeExpiredSearchData } from "./database.mjs";
import {
  closeCorpusStatsBackendAdmission,
  corpusStats,
  scheduleOfficialDiscoveryMaintenance,
  startCorpusSyncIfStale,
  stopOfficialDiscoveryIndexing,
} from "./corpus.mjs";
import { createGracefulShutdown } from "./graceful-shutdown.mjs";
import { createBoundedNdjsonWriter } from "./http-stream.mjs";
import { getKeskkonnaportaalSuggestions } from "./integrations.mjs";
import { requiresExtendedStructuredListingBudget } from "./indicators.mjs";
import {
  createDeadlineCleanupLease,
  searchEnvironmentLive,
  searchTimeoutFallback,
  settleWithinDeadline,
} from "./pipeline.mjs";
import {
  blockedFollowUpAssessment,
  contextualRetrievalQuery,
  conversationContext,
  parsePublicSearchFilters,
  parseBoundedSearchInteger,
  prepareRankedSearchResults,
  publicSearchListing,
} from "./retrieval.mjs";
import {
  assessSameOriginBrowserRequest,
  assessSameOriginJsonRequest,
  bindRequestAbort,
  canonicalApiRoutePath,
  canonicalHttpOrigin,
  createFixedWindowRateLimiter,
  requestRateLimitAddress,
  requestFromTrustedProxy,
  resolveIpv6ClientPrefixBits,
  resolveProxyConfiguration,
} from "./security.mjs";
import {
  createFairSearchAdmission,
  configuredSearchConcurrency,
  JSON_SEARCH_DEADLINE_CEILING_MS,
  progressiveListingBudgetMs,
  searchDeadline,
} from "./request-budget.mjs";
import {
  createPublicResponseBudget,
  createPublicSocketBudget,
  isHealthRequestPath,
  isReservedHealthRequest,
  resolvePublicResponseBudget,
} from "./response-budget.mjs";
import {
  createByteBoundedLruCache,
} from "./upstream.mjs";
import {
  validateTerrapointPayload,
  validateTerrapointUrl,
} from "./terrapoint.mjs";
import { requestApprovedPublicHttpsText } from "./public-https.mjs";
import { publicDeploymentRevision } from "./version.mjs";
import {
  getReviewedSearchSuggestions,
  isReviewedSearchSuggestionAlias,
} from "./suggestions.mjs";
import {
  assessSearchQuery,
  canonicalizePublicSearchQuery,
  composeScopeResponse,
} from "./search.mjs";

const app = express();
const port = Number(process.env.PORT || 3000);
const terrapointBase = validateTerrapointUrl(
  process.env.TERRAPOINT_API_URL || "https://terrapoint.ee",
  { base: true },
).toString().replace(/\/$/u, "");
const proxyConfiguration = resolveProxyConfiguration({ port });
const publicOrigin = proxyConfiguration.publicOrigin;
const browserOriginSet = new Set(proxyConfiguration.browserOrigins);
const ipv6ClientPrefixBits = resolveIpv6ClientPrefixBits();
const publicResponseConfiguration = resolvePublicResponseBudget(process.env);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(root, "dist", "client");
const proxyInflight = new Map();
const requestWindows = new Map();
const MAX_RATE_LIMIT_KEYS = 2_000;
const MAX_PROXY_CACHE_ENTRIES = 250;
const MAX_PROXY_CACHE_BYTES = 8_000_000;
const MAX_TERRAPOINT_RESPONSE_BYTES = 2_000_000;
const MAX_CONCURRENT_TERRAPOINT_REQUESTS = 3;
const MAX_CONCURRENT_TERRAPOINT_REQUESTS_PER_CLIENT = 2;
const MAX_QUEUED_TERRAPOINT_REQUESTS_PER_CLIENT = 4;
const MAX_TERRAPOINT_QUEUE_WAIT_MS = 1_800;
const SEARCH_TRANSPORT_RESERVE_MS = 250;
const TERRAPOINT_OUTBOUND_ORIGINS = new Set(["https://terrapoint.ee"]);
const MAX_ACTIVE_SEARCHES = configuredSearchConcurrency();
const searchAdmission = createFairSearchAdmission({ maximumActive: MAX_ACTIVE_SEARCHES });
const corpusStatsAdmission = createFairSearchAdmission({
  maximumActive: 2,
  maximumActivePerClient: 1,
  maximumQueue: 8,
  maximumQueuedPerClient: 1,
  maximumWaitMs: 500,
  capacityCode: "CORPUS_CAPACITY",
  capacityLabel: "Corpus statistics admission",
});
const cache = createByteBoundedLruCache({
  maximumEntries: MAX_PROXY_CACHE_ENTRIES,
  maximumBytes: MAX_PROXY_CACHE_BYTES,
  sizeOf: (entry) => Number(entry?.bytes) || 0,
});
const terrapointAdmission = createFairSearchAdmission({
  maximumActive: MAX_CONCURRENT_TERRAPOINT_REQUESTS,
  maximumActivePerClient: MAX_CONCURRENT_TERRAPOINT_REQUESTS_PER_CLIENT,
  maximumQueue: 24,
  maximumQueuedPerClient: MAX_QUEUED_TERRAPOINT_REQUESTS_PER_CLIENT,
  maximumWaitMs: MAX_TERRAPOINT_QUEUE_WAIT_MS,
  capacityCode: "UPSTREAM_CAPACITY",
  capacityLabel: "Terrapoint admission",
});
const publicResponseBudget = createPublicResponseBudget({
  ...publicResponseConfiguration,
  keyForRequest: (request) => requestRateLimitAddress(
    request,
    proxyConfiguration.trustedProxyCidrs,
    { ipv6PrefixBits: ipv6ClientPrefixBits },
  ),
  isReservedRequest: isReservedHealthRequest,
});
const publicSocketBudget = createPublicSocketBudget({
  maximumActive: publicResponseConfiguration.maximumConnections,
  maximumGeneral: process.env.MAX_GENERAL_HTTP_SOCKETS,
  maximumPerPeer: process.env.MAX_HTTP_SOCKETS_PER_PEER,
  keyForSocket: (socket) => requestRateLimitAddress({ socket }, "", {
    ipv6PrefixBits: ipv6ClientPrefixBits,
  }),
  isReservedSocket: (socket) => {
    const address = String(socket?.remoteAddress || "").split("%", 1)[0].toLocaleLowerCase("en");
    return address === "::1"
      || address === "127.0.0.1"
      || address === "::ffff:127.0.0.1";
  },
  isTrustedIngressSocket: (socket) => requestFromTrustedProxy(
    { socket },
    proxyConfiguration.trustedProxyCidrs,
  ),
});
let containerReadiness = "ready";
let officialDiscoveryMaintenanceTimer;
let corpusRefreshTimeout;
let corpusRefreshInterval;

void purgeExpiredSearchData();
const searchDataMaintenance = setInterval(() => void purgeExpiredSearchData(), 60_000);
searchDataMaintenance.unref();

app.disable("x-powered-by");
app.set("trust proxy", proxyConfiguration.trust);
app.use(publicResponseBudget);
// Only the exact bodyless GET/HEAD probes may consume the health reserve.
// Reject method or framing variants before generic API rate limiting and JSON
// buffering so they cannot turn the reserved pool into an anonymous bypass.
app.use((request, response, next) => {
  if (!isHealthRequestPath(request) || isReservedHealthRequest(request)) return next();
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Connection", "close");
  response.setHeader("Allow", "GET, HEAD");
  const methodAllowed = ["GET", "HEAD"].includes(String(request.method || "").toLocaleUpperCase("en-US"));
  return response.status(methodAllowed ? 400 : 405).json({
    error: methodAllowed
      ? "Tervisekontrolli päringul ei tohi olla keha."
      : "Tervisekontroll toetab ainult GET- ja HEAD-päringuid.",
  });
});
app.use((request, response, next) => {
  const trustedProxy = requestFromTrustedProxy(request, proxyConfiguration.trustedProxyCidrs);
  if (publicOrigin && trustedProxy && !request.secure) {
    return response.redirect(308, `${publicOrigin}${request.originalUrl}`);
  }
  return next();
});
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

const EXPENSIVE_JSON_ROUTES = new Set([
  "/api/search",
  "/api/search/stream",
  "/api/search/results",
  "/api/search/follow-up",
  "/api/suggestions",
]);

function isTerrapointBrowserGetRoute(routePath) {
  return routePath === "/api/terrapoint/address"
    || /^\/api\/terrapoint\/parcel\/[^/]+$/u.test(routePath);
}

function configuredRequestOrigin(request) {
  const host = String(request.get("host") || "").trim();
  if (!host) return "";
  const candidate = canonicalHttpOrigin(`${request.protocol}://${host}`, { requestHeader: true });
  return browserOriginSet.has(candidate) ? candidate : "";
}

// Reject cross-origin browser work before rate limiting, JSON buffering,
// search admission, upstream retrieval and model-budget reservation. A
// server-to-server client may omit browser headers, but it must still send
// the non-simple application/json media type.
app.use((request, response, next) => {
  const routePath = canonicalApiRoutePath(request.path);
  const browserContext = {
    expectedOrigins: proxyConfiguration.browserOrigins,
    requestOrigin: configuredRequestOrigin(request),
    fetchSite: request.get("sec-fetch-site"),
    origin: request.get("origin"),
  };
  let assessment;
  if (request.method === "POST" && EXPENSIVE_JSON_ROUTES.has(routePath)) {
    assessment = assessSameOriginJsonRequest({
      ...browserContext,
      contentType: request.get("content-type"),
    });
  } else if (["GET", "HEAD"].includes(request.method) && isTerrapointBrowserGetRoute(routePath)) {
    assessment = assessSameOriginBrowserRequest(browserContext);
  } else {
    return next();
  }
  if (assessment.ok) return next();
  return response.status(assessment.status).json({
    error: assessment.status === 415
      ? "Päring peab kasutama JSON-vormingut."
      : "Ristdomeeni otsingupäring ei ole lubatud.",
  });
});

app.use("/api", createFixedWindowRateLimiter({
  maxRequests: 240,
  scope: "api",
  store: requestWindows,
  maxKeys: MAX_RATE_LIMIT_KEYS,
  trustedProxyCidrs: proxyConfiguration.trustedProxyCidrs,
  ipv6PrefixBits: ipv6ClientPrefixBits,
}));
app.use("/api/search", createFixedWindowRateLimiter({
  maxRequests: 20,
  scope: "search",
  store: requestWindows,
  maxKeys: MAX_RATE_LIMIT_KEYS,
  trustedProxyCidrs: proxyConfiguration.trustedProxyCidrs,
  ipv6PrefixBits: ipv6ClientPrefixBits,
}));
app.use("/api/suggestions", createFixedWindowRateLimiter({
  maxRequests: 30,
  scope: "suggestions",
  store: requestWindows,
  maxKeys: MAX_RATE_LIMIT_KEYS,
  trustedProxyCidrs: proxyConfiguration.trustedProxyCidrs,
  ipv6PrefixBits: ipv6ClientPrefixBits,
}));
app.use("/api/corpus", createFixedWindowRateLimiter({
  maxRequests: 20,
  scope: "corpus",
  store: requestWindows,
  maxKeys: MAX_RATE_LIMIT_KEYS,
  trustedProxyCidrs: proxyConfiguration.trustedProxyCidrs,
  ipv6PrefixBits: ipv6ClientPrefixBits,
}));
app.use("/api/terrapoint", createFixedWindowRateLimiter({
  maxRequests: 30,
  scope: "terrapoint",
  store: requestWindows,
  maxKeys: MAX_RATE_LIMIT_KEYS,
  trustedProxyCidrs: proxyConfiguration.trustedProxyCidrs,
  ipv6PrefixBits: ipv6ClientPrefixBits,
}));
// Admission control must run before Express buffers attacker-controlled JSON,
// and non-API paths must never pay the allocation/parsing cost at all.
app.use("/api", express.json({ limit: "32kb", strict: true, inflate: false }));

app.get("/api/health/container-readiness", (_request, response) => {
  if (containerReadiness !== "ready") {
    return response.status(503).json({
      status: "draining",
      service: "keskkonnaportaali-praktika",
      revision: publicDeploymentRevision(),
    });
  }
  return response.json({
    status: "ok",
    service: "keskkonnaportaali-praktika",
    revision: publicDeploymentRevision(),
  });
});

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "keskkonnaportaali-praktika",
    revision: publicDeploymentRevision(),
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

function searchQuery(request, maximumLength = 180) {
  return canonicalizePublicSearchQuery(
    request.body?.q ?? "",
    { maximumLength },
  );
}

function searchPage(request, name, fallback, maximum) {
  return parseBoundedSearchInteger(
    request.body?.[name] ?? request.query?.[name],
    fallback,
    maximum,
    { rejectInvalid: true },
  );
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

function blockedSearchAssessment(query) {
  const assessment = assessSearchQuery(query);
  return assessment.kind === "out-of-scope" ? assessment : null;
}

function blockedSearchPayload(query, assessment, filters, page, pageSize) {
  const searchResults = emptySearchListing(filters, page, pageSize);
  return {
    ...composeScopeResponse(query, assessment),
    searchResults,
  };
}

async function writeBlockedSearchStream(response, query, assessment, filters, page, pageSize) {
  const payload = blockedSearchPayload(query, assessment, filters, page, pageSize);
  response.status(200);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("X-Accel-Buffering", "no");
  const stream = createBoundedNdjsonWriter(response);
  response.flushHeaders?.();
  try {
    await stream.write("results", { searchResults: payload.searchResults });
    await stream.write("answer", { result: payload });
    await stream.finish();
  } catch (error) {
    if (!response.destroyed) response.destroy(error);
  }
  return undefined;
}

function searchCapacityError(message = "Search execution budget expired before admission") {
  const error = new Error(message);
  error.code = "SEARCH_CAPACITY";
  return error;
}

async function acquireSearchSlot(request, controller, deadlineAt) {
  const maximumWaitMs = deadlineAt - Date.now() - SEARCH_TRANSPORT_RESERVE_MS;
  if (maximumWaitMs <= 0) throw searchCapacityError();
  const release = await searchAdmission.acquire(
    requestRateLimitAddress(request, proxyConfiguration.trustedProxyCidrs, {
      ipv6PrefixBits: ipv6ClientPrefixBits,
    }),
    { signal: controller.signal, maximumWaitMs },
  );
  if (deadlineAt - Date.now() <= SEARCH_TRANSPORT_RESERVE_MS) {
    release();
    throw searchCapacityError();
  }
  return release;
}

async function handleSearch(request, response) {
  const queryInput = searchQuery(request);
  const query = queryInput.query;
  const llmClientKey = requestRateLimitAddress(request, proxyConfiguration.trustedProxyCidrs, {
    ipv6PrefixBits: ipv6ClientPrefixBits,
  });
  if (queryInput.reason === "empty") return response.status(400).json({ error: "Sisesta otsingusõna." });
  if (!queryInput.ok) return response.status(400).json({ error: "Otsing on liiga pikk." });
  const page = searchPage(request, "page", 1, 500);
  const pageSize = searchPage(request, "page_size", 12, 50);
  if (page === null || pageSize === null) return response.status(400).json({ error: "Lehekülg ja lehe suurus peavad olema lubatud täisarvud." });
  const parsedFilters = searchFilters(request);
  if (!parsedFilters.ok) return response.status(400).json({ error: parsedFilters.error });
  const filters = parsedFilters.filters;
  const blockedAssessment = blockedSearchAssessment(query);
  if (blockedAssessment) {
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json(
      blockedSearchPayload(query, blockedAssessment, filters, page, pageSize),
    );
  }
  const startedAt = Date.now();
  const deadlineAt = searchDeadline(startedAt, JSON_SEARCH_DEADLINE_CEILING_MS);
  const lifecycle = bindRequestAbort(request, response);
  const { controller } = lifecycle;
  let releaseSearch = () => undefined;
  const cleanupLease = createDeadlineCleanupLease(() => {
    releaseSearch();
    lifecycle.cleanup();
  });
  try {
    try {
      releaseSearch = await acquireSearchSlot(request, controller, deadlineAt);
    } catch (error) {
      if (controller.signal.aborted || response.destroyed) return undefined;
      if (error?.code !== "SEARCH_CAPACITY") throw error;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Retry-After", "2");
      return response.status(200).json({
        ...searchTimeoutFallback(query, { assessmentQuery: query, reason: "capacity" }),
        searchResults: emptySearchListing(filters, page, pageSize),
      });
    }
    // The legacy all-at-once JSON route must leave enough transport margin for
    // clients and reverse proxies. The browser uses the progressive stream,
    // which keeps the full configured answer budget and emits results first.
    const payload = await settleWithinDeadline((async () => {
      const searchResults = await prepareRankedSearchResults(query, {
        page,
        pageSize,
        filters,
        deadlineAt,
        signal: controller.signal,
        clientKey: llmClientKey,
      });
      const result = await searchEnvironmentLive(query, {
        startedAt,
        deadlineAt,
        searchResults,
        filters,
        signal: controller.signal,
        llmClientKey,
        onBackgroundCleanup: cleanupLease.track,
      });
      return { ...result, searchResults: publicSearchListing(searchResults) };
    })(), deadlineAt - Date.now(), () => ({
      ...searchTimeoutFallback(query, { assessmentQuery: query }),
      searchResults: emptySearchListing(filters, page, pageSize),
    }), controller, { onBackgroundCleanup: cleanupLease.track });
    // The response echoes the query for rendering. Keep it out of the browser's
    // persistent HTTP cache; the server-side hash-keyed cache remains available.
    response.setHeader("Cache-Control", "no-store");
    return response.json(payload);
  } catch (error) {
    if (controller.signal.aborted || response.destroyed) return undefined;
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
    cleanupLease.finish();
  }
}

app.post("/api/search", handleSearch);

app.post("/api/search/stream", async (request, response) => {
  const queryInput = searchQuery(request);
  const query = queryInput.query;
  const llmClientKey = requestRateLimitAddress(request, proxyConfiguration.trustedProxyCidrs, {
    ipv6PrefixBits: ipv6ClientPrefixBits,
  });
  if (queryInput.reason === "empty") return response.status(400).json({ error: "Sisesta otsingusõna." });
  if (!queryInput.ok) return response.status(400).json({ error: "Otsing on liiga pikk." });
  const page = searchPage(request, "page", 1, 500);
  const pageSize = searchPage(request, "page_size", 12, 50);
  if (page === null || pageSize === null) return response.status(400).json({ error: "Lehekülg ja lehe suurus peavad olema lubatud täisarvud." });
  const parsedFilters = searchFilters(request);
  if (!parsedFilters.ok) return response.status(400).json({ error: parsedFilters.error });
  const filters = parsedFilters.filters;
  const blockedAssessment = blockedSearchAssessment(query);
  if (blockedAssessment) {
    return writeBlockedSearchStream(
      response,
      query,
      blockedAssessment,
      filters,
      page,
      pageSize,
    );
  }

  const startedAt = Date.now();
  const deadlineAt = searchDeadline(startedAt);
  const lifecycle = bindRequestAbort(request, response);
  const { controller } = lifecycle;
  let releaseSearch = () => undefined;
  const cleanupLease = createDeadlineCleanupLease(() => {
    releaseSearch();
    lifecycle.cleanup();
  });
  try {
    releaseSearch = await acquireSearchSlot(request, controller, deadlineAt);
  } catch (error) {
    if (controller.signal.aborted || response.destroyed) {
      cleanupLease.finish();
      return undefined;
    }
    response.status(503);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Retry-After", "2");
    cleanupLease.finish();
    return response.json({
      error: "Otsing on hetkel koormatud. Proovi mõne hetke pärast uuesti.",
      code: "SEARCH_CAPACITY",
    });
  }

  response.status(200);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("X-Accel-Buffering", "no");
  const stream = createBoundedNdjsonWriter(response, {
    onFailure: (error) => {
      if (!controller.signal.aborted) controller.abort(error);
    },
  });
  response.flushHeaders?.();

  let publicListing = emptySearchListing(filters, page, pageSize);
  let resultsWritten = false;
  try {
    // Most searches keep the fast progressive-listing target. Exact typed
    // PostgREST, WFS and PXWeb queries may need their full bounded structured
    // fetch window on a cold connection, without extending the overall limit.
    // Pass the overall deadline into retrieval so its own 5.5 s upstream cap
    // is not accidentally collapsed by this outer streaming phase.
    const listingBudgetMs = progressiveListingBudgetMs({
      remainingMs: deadlineAt - Date.now(),
      slowStructured: requiresExtendedStructuredListingBudget(query),
    });
    const searchResults = await settleWithinDeadline(prepareRankedSearchResults(query, {
      page,
      pageSize,
      filters,
      deadlineAt,
      signal: controller.signal,
      clientKey: llmClientKey,
    }), listingBudgetMs, null, controller, {
      onBackgroundCleanup: cleanupLease.track,
    });
    if (!searchResults) {
      await stream.write("results", { searchResults: publicListing });
      resultsWritten = true;
      await stream.write("answer", {
        result: {
          ...searchTimeoutFallback(query, { assessmentQuery: query }),
          searchResults: publicListing,
        },
      });
      return undefined;
    }
    publicListing = publicSearchListing(searchResults);
    await stream.write("results", { searchResults: publicListing });
    resultsWritten = true;
    const result = await searchEnvironmentLive(query, {
      startedAt,
      deadlineAt,
      searchResults,
      filters,
      signal: controller.signal,
      llmClientKey,
      onBackgroundCleanup: cleanupLease.track,
      onDraft: (draft) => stream.enqueue("draft", {
        result: { ...draft, searchResults: publicListing },
      }),
    });
    await stream.write("answer", {
      result: { ...result, searchResults: publicListing },
    });
  } catch (error) {
    if (!controller.signal.aborted && !response.destroyed) {
      if (!resultsWritten) {
        await stream.write("results", { searchResults: publicListing });
        resultsWritten = true;
      }
      await stream.write("answer", {
        result: {
          ...searchTimeoutFallback(query, {
            assessmentQuery: query,
            searchResults: { items: publicListing.items || [] },
            filters,
            reason: "source-error",
          }),
          searchResults: publicListing,
        },
      });
    }
    if (!controller.signal.aborted) {
      console.warn(JSON.stringify({
        event: "search-stream-degraded",
        errorName: String(error?.name || "Error").slice(0, 80),
        errorCode: String(error?.code || "unknown").slice(0, 80),
      }));
    }
  } finally {
    try {
      await stream.finish();
    } catch (error) {
      if (!response.destroyed) response.destroy(error);
    }
    // Hold global/per-client search admission through transport close (or its
    // bounded destruction), not merely through model/retrieval completion.
    cleanupLease.finish();
  }
  return undefined;
});

async function handleSearchResults(request, response) {
  const queryInput = searchQuery(request);
  const query = queryInput.query;
  const discoveryClientKey = requestRateLimitAddress(request, proxyConfiguration.trustedProxyCidrs, {
    ipv6PrefixBits: ipv6ClientPrefixBits,
  });
  if (queryInput.reason === "empty") return response.status(400).json({ error: "Sisesta otsingusõna." });
  if (!queryInput.ok) return response.status(400).json({ error: "Otsing on liiga pikk." });
  const page = searchPage(request, "page", 1, 500);
  const pageSize = searchPage(request, "page_size", 12, 50);
  if (page === null || pageSize === null) return response.status(400).json({ error: "Lehekülg ja lehe suurus peavad olema lubatud täisarvud." });
  const parsedFilters = searchFilters(request);
  if (!parsedFilters.ok) return response.status(400).json({ error: parsedFilters.error });
  const filters = parsedFilters.filters;
  if (blockedSearchAssessment(query)) {
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json(emptySearchListing(filters, page, pageSize));
  }
  const startedAt = Date.now();
  const deadlineAt = searchDeadline(startedAt);
  const lifecycle = bindRequestAbort(request, response);
  const { controller } = lifecycle;
  let releaseSearch = () => undefined;
  const cleanupLease = createDeadlineCleanupLease(() => {
    releaseSearch();
    lifecycle.cleanup();
  });
  try {
    try {
      releaseSearch = await acquireSearchSlot(request, controller, deadlineAt);
    } catch (error) {
      if (controller.signal.aborted || response.destroyed) return undefined;
      if (error?.code !== "SEARCH_CAPACITY") throw error;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Retry-After", "2");
      return response.status(429).json({
        error: "Otsing teenindab praegu mitut päringut korraga. Proovi paari sekundi pärast uuesti.",
        retryable: true,
      });
    }
    const results = await settleWithinDeadline(prepareRankedSearchResults(query, {
      page,
      pageSize,
      filters,
      deadlineAt,
      signal: controller.signal,
      clientKey: discoveryClientKey,
    }), deadlineAt - Date.now(), null, controller, {
      onBackgroundCleanup: cleanupLease.track,
    });
    if (!results) {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Retry-After", "2");
      return response.status(503).json({
        error: "Otsingutulemuste laadimine võttis liiga kaua. Proovi uuesti.",
        retryable: true,
      });
    }
    response.setHeader("Cache-Control", "no-store");
    return response.json(publicSearchListing(results));
  } catch {
    if (controller.signal.aborted || response.destroyed) return undefined;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Retry-After", "2");
    return response.status(502).json({
      error: "Otsingutulemuste allikad ei vastanud. Proovi hetke pärast uuesti.",
      retryable: true,
    });
  } finally {
    cleanupLease.finish();
  }
}

app.post("/api/search/results", handleSearchResults);

app.post("/api/search/follow-up", async (request, response) => {
  const rootInput = canonicalizePublicSearchQuery(request.body?.root_query || "");
  const questionInput = canonicalizePublicSearchQuery(request.body?.question || "");
  const previousQuestionValues = Array.isArray(request.body?.previous_questions)
    ? request.body.previous_questions
    : [];
  const previousInputs = previousQuestionValues.length <= 4
    ? previousQuestionValues.map((value) => canonicalizePublicSearchQuery(value))
    : [];
  const rootQuery = rootInput.query;
  const question = questionInput.query;
  const previousQuestions = previousInputs.filter((input) => input.ok).map((input) => input.query);
  const llmClientKey = requestRateLimitAddress(request, proxyConfiguration.trustedProxyCidrs, {
    ipv6PrefixBits: ipv6ClientPrefixBits,
  });
  if (rootInput.reason === "empty" || questionInput.reason === "empty") {
    return response.status(400).json({ error: "Sisesta jätkuküsimus." });
  }
  if (!rootInput.ok || !questionInput.ok || previousQuestionValues.length > 4
    || previousInputs.some((input) => input.reason === "too-long")) {
    return response.status(400).json({ error: "Jätkuküsimuse kontekst on liiga pikk." });
  }
  const blockedAssessment = blockedFollowUpAssessment(rootQuery, question, previousQuestions);
  if (blockedAssessment) {
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({
      ...composeScopeResponse(question, blockedAssessment),
      searchResults: emptySearchListing(),
    });
  }
  const startedAt = Date.now();
  const deadlineAt = searchDeadline(startedAt);
  const parsedFilters = searchFilters(request);
  if (!parsedFilters.ok) return response.status(400).json({ error: parsedFilters.error });
  const filters = parsedFilters.filters;
  const retrievalQuery = contextualRetrievalQuery(rootQuery, question, previousQuestions);
  const lifecycle = bindRequestAbort(request, response);
  const { controller } = lifecycle;
  let releaseSearch = () => undefined;
  const cleanupLease = createDeadlineCleanupLease(() => {
    releaseSearch();
    lifecycle.cleanup();
  });
  try {
    try {
      releaseSearch = await acquireSearchSlot(request, controller, deadlineAt);
    } catch (error) {
      if (controller.signal.aborted || response.destroyed) return undefined;
      if (error?.code !== "SEARCH_CAPACITY") throw error;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Retry-After", "2");
      return response.status(200).json({
        ...searchTimeoutFallback(question, { assessmentQuery: retrievalQuery, reason: "capacity" }),
        searchResults: emptySearchListing(filters),
      });
    }
    const payload = await settleWithinDeadline((async () => {
      const searchResults = await prepareRankedSearchResults(retrievalQuery, {
        page: 1,
        pageSize: 12,
        filters,
        deadlineAt,
        signal: controller.signal,
        clientKey: llmClientKey,
      });
      const result = await searchEnvironmentLive(question, {
        startedAt,
        deadlineAt,
        assessmentQuery: retrievalQuery,
        retrievalQuery,
        conversationContext: conversationContext(rootQuery, previousQuestions),
        allowSafeEllipticalFollowUp: true,
        searchResults,
        filters,
        useCache: false,
        signal: controller.signal,
        llmClientKey,
        onBackgroundCleanup: cleanupLease.track,
      });
      return { ...result, searchResults: publicSearchListing(searchResults) };
    })(), deadlineAt - Date.now(), () => ({
      ...searchTimeoutFallback(question, { assessmentQuery: retrievalQuery }),
      searchResults: emptySearchListing(filters),
    }), controller, { onBackgroundCleanup: cleanupLease.track });
    response.setHeader("Cache-Control", "no-store");
    return response.json(payload);
  } catch (error) {
    if (controller.signal.aborted || response.destroyed) return undefined;
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
  } finally {
    cleanupLease.finish();
  }
});

app.get("/api/corpus", async (request, response) => {
  const lifecycle = bindRequestAbort(request, response);
  const deadlineAt = Date.now() + 1_500;
  const clientKey = requestRateLimitAddress(request, proxyConfiguration.trustedProxyCidrs, {
    ipv6PrefixBits: ipv6ClientPrefixBits,
  });
  let release = () => undefined;
  try {
    release = await corpusStatsAdmission.acquire(
      clientKey,
      { signal: lifecycle.controller.signal, maximumWaitMs: 500 },
    );
    const stats = await corpusStats({
      signal: lifecycle.controller.signal,
      deadlineAt,
      clientKey,
    });
    if (lifecycle.controller.signal.aborted || response.destroyed) return undefined;
    response.setHeader(
      "Cache-Control",
      stats.status === "degraded" ? "no-store" : "public, max-age=60, stale-while-revalidate=300",
    );
    return response.json(stats);
  } catch (error) {
    if (response.destroyed) return undefined;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Retry-After", "1");
    return response.status(error?.code === "CORPUS_CAPACITY" ? 429 : 503).json({
      enabled: true,
      status: "degraded",
      documents: 0,
      hydrated: 0,
    });
  } finally {
    release();
    lifecycle.cleanup();
  }
});

async function handleSuggestions(request, response) {
  response.setHeader("Cache-Control", "private, no-store");
  const queryInput = searchQuery(request, 80);
  const query = queryInput.query;
  if (queryInput.reason === "too-long") return response.status(400).json({ error: "Otsing on liiga pikk." });
  if (query.length < 2) return response.json({ suggestions: [] });
  const assessment = assessSearchQuery(query);
  const reviewedAlias = isReviewedSearchSuggestionAlias(query);
  const curated = getReviewedSearchSuggestions(query, 5).map((value) => ({ value, count: null }));
  // Exact reviewed aliases never need to leave the process. An out-of-scope
  // query gets no upstream autocomplete call even if a future classifier or
  // normalizer change makes it resemble one of those local aliases.
  if (reviewedAlias || assessment.kind === "out-of-scope") {
    return response.json({ suggestions: reviewedAlias ? curated.slice(0, 5) : [] });
  }
  const lifecycle = bindRequestAbort(request, response);
  try {
    const result = await getKeskkonnaportaalSuggestions(query, 5, {
      signal: lifecycle.controller.signal,
      clientKey: requestRateLimitAddress(request, proxyConfiguration.trustedProxyCidrs, {
        ipv6PrefixBits: ipv6ClientPrefixBits,
      }),
    });
    const seen = new Set();
    const suggestions = [...curated, ...result.suggestions]
      .filter((item) => {
        const key = String(item.value || "").toLocaleLowerCase("et");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
    return response.json({ suggestions });
  } catch {
    if (response.destroyed) return undefined;
    return response.json({ suggestions: curated.slice(0, 5) });
  } finally {
    lifecycle.cleanup();
  }
}

app.post("/api/suggestions", handleSuggestions);

function safePathSegment(value, maxLength = 180) {
  const clean = String(value || "").trim();
  if (!clean || clean.length > maxLength) return null;
  return encodeURIComponent(clean);
}

function requestAbortError(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

function waitForSharedProxyRequest(entry, signal) {
  if (signal?.aborted) return Promise.reject(requestAbortError(signal));
  entry.waiters += 1;
  return new Promise((resolve, reject) => {
    let complete = false;
    const finish = (callback, value) => {
      if (complete) return;
      complete = true;
      signal?.removeEventListener("abort", onAbort);
      entry.waiters = Math.max(0, entry.waiters - 1);
      if (!entry.waiters && !entry.settled && !entry.controller.signal.aborted) {
        entry.controller.abort(new DOMException("All proxy clients disconnected", "AbortError"));
      }
      callback(value);
    };
    const onAbort = () => finish(reject, requestAbortError(signal));
    signal?.addEventListener("abort", onAbort, { once: true });
    entry.promise.then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

async function fetchTerrapointJson(url, ttlMs, externalSignal, kind, expectedNumber) {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && now - cached.savedAt < ttlMs) {
    return { data: cached.data, cache: "hit", stale: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9_000);
  const signal = externalSignal && typeof AbortSignal.any === "function"
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  try {
    const upstream = await requestApprovedPublicHttpsText(url, {
      approvedOrigins: TERRAPOINT_OUTBOUND_ORIGINS,
      headers: { Accept: "application/json", "User-Agent": "Keskkonnaportaali-praktika/1.0" },
      signal,
      maximumBytes: MAX_TERRAPOINT_RESPONSE_BYTES,
      maximumRedirects: 3,
    });
    if (upstream.status < 200 || upstream.status >= 300) {
      const error = new Error(`Terrapoint vastas staatusega ${upstream.status}`);
      error.upstreamStatus = upstream.status;
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(upstream.body);
    } catch {
      throw new Error("Terrapoint returned invalid JSON");
    }
    const data = validateTerrapointPayload(parsed, kind, { expectedNumber });
    const bytes = Buffer.byteLength(JSON.stringify(data), "utf8");
    cache.set(url, { savedAt: now, data, bytes });
    return { data, cache: "miss", stale: false };
  } catch (error) {
    if (externalSignal?.aborted) throw requestAbortError(externalSignal);
    if (cached && now - cached.savedAt < 24 * 60 * 60 * 1000) {
      return { data: cached.data, cache: "stale", stale: true };
    }
    error.isTimeout = error.name === "AbortError";
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function cachedJson(url, ttlMs, {
  signal,
  kind,
  expectedNumber,
  clientKey = "unknown",
} = {}) {
  if (signal?.aborted) throw requestAbortError(signal);
  const cached = cache.get(url);
  if (cached && Date.now() - cached.savedAt < ttlMs) {
    return { data: cached.data, cache: "hit", stale: false };
  }

  let entry = proxyInflight.get(url);
  if (!entry) {
    const controller = new AbortController();
    entry = { controller, promise: null, settled: false, waiters: 0 };
    entry.promise = (async () => {
      const release = await terrapointAdmission.acquire(clientKey, {
        signal: controller.signal,
        maximumWaitMs: MAX_TERRAPOINT_QUEUE_WAIT_MS,
      });
      try {
        return await fetchTerrapointJson(url, ttlMs, controller.signal, kind, expectedNumber);
      } finally {
        release();
      }
    })();
    proxyInflight.set(url, entry);
    void entry.promise.finally(() => {
      entry.settled = true;
      if (proxyInflight.get(url) === entry) proxyInflight.delete(url);
    }).catch(() => undefined);
  }
  return waitForSharedProxyRequest(entry, signal);
}

function terrapointError(response, error) {
  const timeout = Boolean(error.isTimeout);
  const capacity = error.code === "UPSTREAM_CAPACITY";
  return response.status(timeout ? 504 : capacity ? 503 : 502).json({
    code: timeout ? "TERRAPOINT_TIMEOUT" : capacity ? "TERRAPOINT_CAPACITY" : "TERRAPOINT_UNAVAILABLE",
    error: timeout
      ? "Terrapointi päring võttis liiga kaua. Proovi uuesti; ülejäänud portaal töötab edasi."
      : capacity
        ? "Terrapointi päringuid on praegu palju. Proovi hetke pärast uuesti."
      : "Terrapointi andmeallikas ei vastanud. Proovi hetke pärast uuesti.",
    retryable: true,
  });
}

app.get("/api/terrapoint/address", async (request, response) => {
  const query = safePathSegment(request.query.q, 120);
  if (!query) return response.status(400).json({ error: "Sisesta aadress või kohanimi." });
  const lifecycle = bindRequestAbort(request, response);
  try {
    const result = await cachedJson(`${terrapointBase}/api/address/${query}`, 10 * 60 * 1000, {
      signal: lifecycle.controller.signal,
      kind: "address",
      clientKey: requestRateLimitAddress(request, proxyConfiguration.trustedProxyCidrs, {
        ipv6PrefixBits: ipv6ClientPrefixBits,
      }),
    });
    response.setHeader("Cache-Control", "private, no-store");
    return response.json(result.data);
  } catch (error) {
    if (response.destroyed) return undefined;
    return terrapointError(response, error);
  } finally {
    lifecycle.cleanup();
  }
});

app.get("/api/terrapoint/parcel/:number", async (request, response) => {
  const number = String(request.params.number || "").trim();
  if (!/^\d{5}:\d{3}:\d{4}$/.test(number)) {
    return response.status(400).json({ error: "Katastritunnus peab olema kujul 12345:678:9012." });
  }
  const lifecycle = bindRequestAbort(request, response);
  try {
    const encoded = encodeURIComponent(number);
    const result = await cachedJson(
      `${terrapointBase}/api/search/${encoded}?include_map_layers=false`,
      30 * 60 * 1000,
      {
        signal: lifecycle.controller.signal,
        kind: "parcel",
        expectedNumber: number,
        clientKey: requestRateLimitAddress(request, proxyConfiguration.trustedProxyCidrs, {
          ipv6PrefixBits: ipv6ClientPrefixBits,
        }),
      },
    );
    response.setHeader("Cache-Control", "private, no-store");
    return response.json(result.data);
  } catch (error) {
    if (response.destroyed) return undefined;
    return terrapointError(response, error);
  } finally {
    lifecycle.cleanup();
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

const server = createServer({ maxHeaderSize: 16 * 1024 }, app);
server.on("connection", publicSocketBudget);
server.headersTimeout = 5_000;
server.requestTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;
server.maxConnections = publicResponseConfiguration.maximumConnections;
server.setTimeout(publicResponseConfiguration.idleTimeoutMs, (socket) => socket.destroy());
server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Keskkonnaportaali praktika listening on ${port}\n`);
  const refreshCorpus = () => {
    void startCorpusSyncIfStale().catch(() => undefined);
  };
  corpusRefreshTimeout = setTimeout(refreshCorpus, 1_000);
  corpusRefreshTimeout.unref();
  corpusRefreshInterval = setInterval(refreshCorpus, 60 * 60 * 1_000);
  corpusRefreshInterval.unref();
  scheduleOfficialDiscoveryMaintenance();
  officialDiscoveryMaintenanceTimer = setInterval(
    () => scheduleOfficialDiscoveryMaintenance(),
    60 * 60 * 1_000,
  );
  officialDiscoveryMaintenanceTimer.unref();
});

const gracefulShutdown = createGracefulShutdown(server, {
  onDrainStart: () => {
    containerReadiness = "draining";
    searchAdmission.close();
    corpusStatsAdmission.close();
    closeCorpusStatsBackendAdmission(new DOMException("Server is shutting down", "AbortError"));
    terrapointAdmission.close();
    if (corpusRefreshTimeout) clearTimeout(corpusRefreshTimeout);
    if (corpusRefreshInterval) clearInterval(corpusRefreshInterval);
    if (officialDiscoveryMaintenanceTimer) clearInterval(officialDiscoveryMaintenanceTimer);
    stopOfficialDiscoveryIndexing(new DOMException("Server is shutting down", "AbortError"));
  },
});
process.once("SIGTERM", () => gracefulShutdown.shutdown("SIGTERM"));
process.once("SIGINT", () => gracefulShutdown.shutdown("SIGINT"));
