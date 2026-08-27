import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import { load } from "cheerio";
import {
  createByteBoundedLruCache,
  readBoundedResponseText as readBoundedText,
} from "./upstream.mjs";
import {
  requestApprovedPublicHttpsJsonPost,
  requestApprovedPublicHttpsText,
  validateApprovedPublicHttpsUrl,
} from "./public-https.mjs";
import { createFairSearchAdmission } from "./request-budget.mjs";
import {
  assessSearchQuery,
  canonicalizePublicSearchQuery,
  minimizePublicProviderQuery,
} from "./search.mjs";
import { sourceEvidenceEligibility } from "./source-registry.mjs";

const PORTAL_BASE = "https://keskkonnaportaal.ee";
const VPORTAL_SEARCH_BASE = "https://search.service.eu-live.vportal.ee/v1/search";
const OFFICIAL_HOSTS = new Set([
  "keskkonnaportaal.ee",
  "www.keskkonnaportaal.ee",
  "keskkonnaagentuur.ee",
  "www.keskkonnaagentuur.ee",
  "keskkonnaamet.ee",
  "www.keskkonnaamet.ee",
  "kliimaministeerium.ee",
  "www.kliimaministeerium.ee",
  "keskkonnaandmed.envir.ee",
  "avaandmed.keskkonnaportaal.ee",
  "gsavalik.envir.ee",
  "andmed.stat.ee",
  "ohuseire.ee",
  "www.ohuseire.ee",
  "airviro.klab.ee",
  "ilmateenistus.ee",
  "www.ilmateenistus.ee",
  "register.keskkonnaportaal.ee",
  "tallinn.ee",
  "www.tallinn.ee",
  "tartu.ee",
  "www.tartu.ee",
  "terviseamet.ee",
  "www.terviseamet.ee",
  "rmk.ee",
  "www.rmk.ee",
  "tableau.envir.ee",
  "ec.europa.eu",
  "foresteurope.org",
  "www.foresteurope.org",
  "eea.europa.eu",
  "www.eea.europa.eu",
  "search.service.eu-live.vportal.ee",
]);
const OFFICIAL_ORIGINS = new Set([...OFFICIAL_HOSTS].map((hostname) => `https://${hostname}`));
const VPORTAL_SITES = [
  {
    index: "keskkonnaamet",
    origin: "https://keskkonnaamet.ee",
    baseUrl: "https://keskkonnaamet.ee",
    organization: "Keskkonnaamet",
  },
  {
    index: "keskkonnaagentuur",
    origin: "https://keskkonnaagentuur.ee",
    baseUrl: "https://keskkonnaagentuur.ee",
    organization: "Keskkonnaagentuur",
  },
  {
    index: "kliimamin",
    origin: "https://kliimaministeerium.ee",
    baseUrl: "https://kliimaministeerium.ee",
    organization: "Kliimaministeerium",
  },
];
// The upstream currently omits its Let's Encrypt intermediate certificate.
// This official public chain completes verification without disabling TLS.
const VPORTAL_CA = [
  ...rootCertificates,
  readFileSync(new URL("./certs/vportal-chain.pem", import.meta.url), "utf8"),
];
const MAX_CACHE_ENTRIES = 250;
const MAX_CACHE_BYTES = 8_000_000;
const MAX_UPSTREAM_BYTES = 2_000_000;
const APPROVED_PAGE_EVIDENCE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_CONCURRENT_OFFICIAL_DISCOVERIES = 2;
const MAX_CONCURRENT_HYDRATIONS = 4;
const MAX_CONCURRENT_SUGGESTIONS = 2;
const MAX_SUGGESTION_RESPONSE_BYTES = 32_000;
const MAX_SUGGESTION_UPSTREAM_ITEMS = 40;
const MAX_SUGGESTION_VALUE_CHARS = 160;
const MAX_SUGGESTION_VALUE_BYTES = 512;
const MAX_SUGGESTION_LABEL_BYTES = 1_024;
const MAX_SUGGESTION_PROJECTION_BYTES = 4_096;
const MAX_DISCOVERY_DOCUMENT_TEXT = 7_500;
const MAX_DISCOVERY_MARKUP = 48_000;
const VPORTAL_PROJECTION_SCHEMA = 1;
const MAX_VPORTAL_DOCUMENTS = 6;
const MAX_VPORTAL_CONTENT_FRAGMENTS = 12;
const MAX_VPORTAL_DOCUMENT_MARKUP_BYTES = 48_000;
const MAX_VPORTAL_RESPONSE_MARKUP_BYTES = 192_000;
const MAX_VPORTAL_URI_BYTES = 2_000;
const MAX_VPORTAL_TITLE_BYTES = 2_000;
const MAX_VPORTAL_METADATA_BYTES = 640;
const responseCache = createByteBoundedLruCache({
  maximumEntries: MAX_CACHE_ENTRIES,
  maximumBytes: MAX_CACHE_BYTES,
  sizeOf: (entry) => Number(entry?.bytes) || 0,
});

export function createAbortableConcurrencyGate(maximum = 1, { maximumQueue = 64 } = {}) {
  const limit = Math.max(1, Math.min(Number(maximum) || 1, 20));
  const queueLimit = Math.max(1, Math.min(Number(maximumQueue) || 64, 1_000));
  const queued = [];
  let active = 0;

  const abortError = (signal) => signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");

  const drain = () => {
    while (active < limit && queued.length) {
      const entry = queued.shift();
      if (entry.signal?.aborted) {
        entry.detachAbort();
        entry.reject(abortError(entry.signal));
        continue;
      }
      active += 1;
      entry.detachAbort();
      Promise.resolve()
        .then(entry.operation)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };

  return {
    run(operation, { signal } = {}) {
      if (typeof operation !== "function") {
        return Promise.reject(new TypeError("A concurrency-gated operation must be a function"));
      }
      if (signal?.aborted) return Promise.reject(abortError(signal));
      if (active >= limit && queued.length >= queueLimit) {
        const error = new Error("The upstream work queue is full");
        error.code = "UPSTREAM_CAPACITY";
        return Promise.reject(error);
      }
      return new Promise((resolve, reject) => {
        const entry = {
          operation,
          signal,
          resolve,
          reject,
          detachAbort: () => undefined,
        };
        const onAbort = () => {
          const index = queued.indexOf(entry);
          if (index < 0) return;
          queued.splice(index, 1);
          entry.detachAbort();
          reject(abortError(signal));
        };
        entry.detachAbort = () => signal?.removeEventListener("abort", onAbort);
        signal?.addEventListener("abort", onAbort, { once: true });
        queued.push(entry);
        drain();
      });
    },
    stats() {
      return { active, queued: queued.length, limit };
    },
  };
}

// Kaheksa kasutajaotsingut võivad muidu korraga käivitada kuni 72 ametliku
// indeksi päringut. Kaks samaaegset otsingulaiendust hoiavad väliste päringute,
// JSON-i ja HTML-i puhastamise töö piisavalt väikese, et tervise- ja staatilised
// lehed ei jääks koormuspiigi ajal Node'i event loop'i taha ootama.
const officialDiscoveryGate = createAbortableConcurrencyGate(MAX_CONCURRENT_OFFICIAL_DISCOVERIES);
const officialHydrationGate = createAbortableConcurrencyGate(MAX_CONCURRENT_HYDRATIONS, { maximumQueue: 48 });
const officialSuggestionAdmission = createFairSearchAdmission({
  maximumActive: MAX_CONCURRENT_SUGGESTIONS,
  maximumActivePerClient: 1,
  maximumQueue: 16,
  maximumQueuedPerClient: 2,
  maximumWaitMs: 1_200,
  capacityCode: "SUGGESTION_CAPACITY",
  capacityLabel: "Official suggestion admission",
});
const hydrationInflight = new Map();
const suggestionInflight = new Map();

function waitForSharedRequest(entry, signal, disconnectedMessage) {
  throwIfRequestAborted(signal);
  entry.waiters += 1;
  return new Promise((resolve, reject) => {
    let complete = false;
    const finish = (callback, value) => {
      if (complete) return;
      complete = true;
      signal?.removeEventListener("abort", onAbort);
      entry.waiters = Math.max(0, entry.waiters - 1);
      if (!entry.waiters && !entry.settled && !entry.controller.signal.aborted) {
        entry.controller.abort(new DOMException(disconnectedMessage, "AbortError"));
      }
      callback(value);
    };
    const onAbort = () => finish(reject, signal.reason instanceof Error
      ? signal.reason
      : new DOMException("The operation was aborted", "AbortError"));
    signal?.addEventListener("abort", onAbort, { once: true });
    entry.promise.then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

async function sharedHydration(url, { timeoutMs, signal, requestText } = {}) {
  const canonicalUrl = validatedOfficialUrl(url).toString();
  let entry = hydrationInflight.get(canonicalUrl);
  if (!entry) {
    const controller = new AbortController();
    entry = { controller, promise: null, settled: false, waiters: 0 };
    entry.promise = officialHydrationGate.run(async () => {
      const { body, finalUrl, fetchedAt, stale } = await fetchCached(canonicalUrl, {
        ttlMs: 30 * 60_000,
        timeoutMs: timeoutMs || 4_500,
        signal: controller.signal,
        requestText,
        requireSameResource: true,
      });
      const content = articleText(body);
      await yieldToEventLoop();
      return { content, finalUrl, fetchedAt, stale };
    }, { signal: controller.signal });
    hydrationInflight.set(canonicalUrl, entry);
    void entry.promise.finally(() => {
      entry.settled = true;
      if (hydrationInflight.get(canonicalUrl) === entry) hydrationInflight.delete(canonicalUrl);
    }).catch(() => undefined);
  }
  return waitForSharedRequest(entry, signal, "All hydration clients disconnected");
}

export function officialHydrationStats() {
  return { ...officialHydrationGate.stats(), inflight: hydrationInflight.size };
}

export function officialSuggestionStats() {
  return {
    ...officialSuggestionAdmission.stats(),
    inflight: suggestionInflight.size,
    cache: responseCache.stats(),
  };
}

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/([.!?])(?=[A-ZÕÄÖÜŠŽ„“])/gu, "$1 ")
    .trim();
}

function boundedSuggestionValue(value) {
  if (typeof value !== "string"
    || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)
    || /[<>]/u.test(value)
    || Buffer.byteLength(value, "utf8") > MAX_SUGGESTION_VALUE_BYTES) {
    throw new Error("Official autocomplete returned an invalid suggestion value");
  }
  const canonical = canonicalizePublicSearchQuery(cleanText(value), {
    maximumLength: MAX_SUGGESTION_VALUE_CHARS,
  });
  if (!canonical.ok
    || Buffer.byteLength(canonical.query, "utf8") > MAX_SUGGESTION_VALUE_BYTES) {
    throw new Error("Official autocomplete returned an invalid suggestion value");
  }
  return canonical.query;
}

function boundedSuggestionCount(label) {
  if (label === undefined || label === null || label === "") return 0;
  if (typeof label !== "string"
    || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(label)
    || Buffer.byteLength(label, "utf8") > MAX_SUGGESTION_LABEL_BYTES) {
    throw new Error("Official autocomplete returned an invalid suggestion label");
  }
  const match = label.match(/results-count[^>]*>\s*(\d{1,10})/u);
  if (!match) return 0;
  const count = Number(match[1]);
  if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000_000) {
    throw new Error("Official autocomplete returned an invalid suggestion count");
  }
  return count;
}

export function projectKeskkonnaportaalSuggestionBody(body) {
  if (typeof body !== "string"
    || Buffer.byteLength(body, "utf8") > MAX_SUGGESTION_RESPONSE_BYTES) {
    throw new Error("Official autocomplete response is too large");
  }
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Official autocomplete returned invalid JSON");
  }
  if (!Array.isArray(payload) || payload.length > MAX_SUGGESTION_UPSTREAM_ITEMS) {
    throw new Error("Official autocomplete returned an invalid result set");
  }
  const suggestions = [];
  let retainedBytes = 0;
  for (const item of payload) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Official autocomplete returned an invalid result");
    }
    const value = boundedSuggestionValue(item.value);
    const count = boundedSuggestionCount(item.label);
    retainedBytes += Buffer.byteLength(value, "utf8") + 16;
    if (retainedBytes > MAX_SUGGESTION_PROJECTION_BYTES) {
      throw new Error("Official autocomplete projection is too large");
    }
    // An approved index is still untrusted input. Never retain or return a
    // suggestion that crosses the same public-query privacy/safety boundary
    // enforced by the eventual search request.
    if (assessSearchQuery(value, { maximumLength: MAX_SUGGESTION_VALUE_CHARS }).kind === "out-of-scope") {
      continue;
    }
    if (suggestions.length < 5) suggestions.push({ value, count });
  }
  return JSON.stringify(suggestions);
}

function sourceId(prefix, value) {
  return `${prefix}-${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

function cacheResponse(url, body, finalUrl = url, headers = {}) {
  const bytes = Buffer.byteLength(String(body), "utf8");
  const savedAt = Date.now();
  responseCache.set(url, {
    body,
    finalUrl,
    bytes,
    savedAt,
    contentType: String(headers?.["content-type"] || "").slice(0, 240),
    contentProfile: String(headers?.["content-profile"] || "").slice(0, 120),
  });
  return savedAt;
}

export function validatedOfficialUrl(value, base) {
  try {
    return validateApprovedPublicHttpsUrl(new URL(value, base), OFFICIAL_ORIGINS);
  } catch {
    throw new Error("Upstream URL is outside the official allowlist");
  }
}

function canonicalHydrationResource(value) {
  const url = validatedOfficialUrl(value);
  const hostname = url.hostname.replace(/^www\./u, "");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/u, "") : url.pathname;
  return `${url.protocol}//${hostname}${pathname}${url.search}`;
}

export function hydrationResourceMatches(requestedValue, finalValue) {
  try {
    return canonicalHydrationResource(requestedValue) === canonicalHydrationResource(finalValue);
  } catch {
    return false;
  }
}

export async function readBoundedResponseText(response, maximumBytes = MAX_UPSTREAM_BYTES) {
  const limit = Math.max(1, Math.min(Number(maximumBytes) || MAX_UPSTREAM_BYTES, MAX_UPSTREAM_BYTES));
  return readBoundedText(response, limit, "Upstream response");
}

function throwIfRequestAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

async function fetchCached(url, {
  accept,
  requestHeaders = {},
  requiredContentProfile = "",
  requiredContentTypePrefixes = [],
  ttlMs = 5 * 60_000,
  staleMs = 24 * 60 * 60_000,
  timeoutMs = 7_000,
  signal: externalSignal,
  requestText = requestApprovedPublicHttpsText,
  requestBody = "",
  cacheDiscriminator = "",
  maximumBytes = MAX_UPSTREAM_BYTES,
  maximumRedirects = 3,
  requireSameResource = false,
  projectBody,
} = {}) {
  throwIfRequestAborted(externalSignal);
  const canonicalUrl = validatedOfficialUrl(url).toString();
  const cacheKey = cacheDiscriminator
    ? `${canonicalUrl}::${String(cacheDiscriminator).slice(0, 160)}`
    : canonicalUrl;
  const now = Date.now();
  const cached = responseCache.get(cacheKey);
  const cachedFinalUrl = cached?.finalUrl || canonicalUrl;
  const cachedResourceMatches = !requireSameResource || hydrationResourceMatches(canonicalUrl, cachedFinalUrl);
  const requiredTypes = [...new Set((requiredContentTypePrefixes || [])
    .map((value) => String(value || "").trim().toLocaleLowerCase("en-US"))
    .filter(Boolean))];
  const contentTypeMatches = (value) => !requiredTypes.length || requiredTypes
    .some((prefix) => String(value || "").toLocaleLowerCase("en-US").startsWith(prefix));
  const profileContentTypeMatches = (value) => !requiredContentProfile
    || String(value || "").toLocaleLowerCase("en-US").startsWith("application/json");
  const cachedContractMatches = contentTypeMatches(cached?.contentType)
    && profileContentTypeMatches(cached?.contentType)
    && (!requiredContentProfile || cached?.contentProfile === requiredContentProfile);
  const cachedMatches = cachedResourceMatches && cachedContractMatches;
  if (cached && cachedMatches && now - cached.savedAt < ttlMs) {
    return {
      body: cached.body,
      finalUrl: cachedFinalUrl,
      fetchedAt: cached.savedAt,
      cache: "hit",
      stale: false,
    };
  }

  const controller = new AbortController();
  const boundedTimeoutMs = Math.max(250, Math.min(Number(timeoutMs) || 7_000, 15_000));
  const timeout = setTimeout(() => controller.abort(), boundedTimeoutMs);
  const signal = externalSignal && typeof AbortSignal.any === "function"
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  try {
    const upstream = await requestText(canonicalUrl, {
      approvedOrigins: OFFICIAL_ORIGINS,
      headers: {
        Accept: accept || "text/html,application/xhtml+xml",
        "Accept-Encoding": "identity",
        "User-Agent": "Keskkonnaportaali-praktika/3.0 (+https://praktika.arleserver.cfd)",
        ...requestHeaders,
      },
      signal,
      body: requestBody,
      maximumBytes: Math.max(1, Math.min(Number(maximumBytes) || MAX_UPSTREAM_BYTES, MAX_UPSTREAM_BYTES)),
      maximumRedirects: Math.max(0, Math.min(Number(maximumRedirects) || 0, 5)),
    });
    if (upstream.status < 200 || upstream.status >= 300) throw new Error(`Upstream returned ${upstream.status}`);
    if (requiredTypes.length || requiredContentProfile) {
      const contentType = String(upstream.headers?.["content-type"] || "").toLocaleLowerCase("en-US");
      const contentProfile = String(upstream.headers?.["content-profile"] || "").trim();
      if (!contentTypeMatches(contentType) || !profileContentTypeMatches(contentType)
        || (requiredContentProfile && contentProfile !== requiredContentProfile)) {
        throw new Error("Official API returned an unexpected content contract");
      }
    }
    const upstreamBody = String(upstream.body || "");
    const body = typeof projectBody === "function" ? projectBody(upstreamBody) : upstreamBody;
    const finalUrl = validatedOfficialUrl(upstream.url || canonicalUrl).toString();
    if (requireSameResource && !hydrationResourceMatches(canonicalUrl, finalUrl)) {
      throw new Error("Official hydration redirected to a different resource");
    }
    const fetchedAt = cacheResponse(cacheKey, body, finalUrl, upstream.headers);
    return { body, finalUrl, fetchedAt, cache: "miss", stale: false };
  } catch (error) {
    throwIfRequestAborted(externalSignal);
    if (cached && cachedMatches && now - cached.savedAt < staleMs) {
      return {
        body: cached.body,
        finalUrl: cachedFinalUrl,
        fetchedAt: cached.savedAt,
        cache: "stale",
        stale: true,
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchOfficialDataset(url, options = {}) {
  return fetchCached(url, {
    ...options,
    accept: "text/csv,text/plain;q=0.9",
    ttlMs: options.ttlMs ?? 15 * 60_000,
    staleMs: options.staleMs ?? 24 * 60 * 60_000,
  });
}

export async function fetchOfficialJsonDataset(url, options = {}) {
  return fetchCached(url, {
    ...options,
    accept: "application/json",
    ttlMs: options.ttlMs ?? 15 * 60_000,
    staleMs: options.staleMs ?? 24 * 60 * 60_000,
  });
}

export async function fetchOfficialGeoJsonDataset(url, options = {}) {
  return fetchCached(url, {
    ...options,
    accept: "application/geo+json,application/json;q=0.9",
    requiredContentTypePrefixes: ["application/geo+json", "application/json"],
    requireSameResource: true,
    ttlMs: options.ttlMs ?? 60 * 60_000,
    staleMs: options.staleMs ?? 2 * 60 * 60_000,
  });
}

export async function fetchOfficialXmlDataset(url, options = {}) {
  return fetchCached(url, {
    ...options,
    accept: "application/xml,text/xml;q=0.9",
    ttlMs: options.ttlMs ?? 5 * 60_000,
    staleMs: options.staleMs ?? 30 * 60_000,
  });
}

export async function fetchOfficialPostgrestDataset(url, options = {}) {
  const profile = "apijahiala";
  return fetchCached(url, {
    ...options,
    accept: "application/json",
    requestHeaders: { "Accept-Profile": profile },
    requiredContentProfile: profile,
    requireSameResource: true,
    ttlMs: options.ttlMs ?? 5 * 60_000,
    staleMs: options.staleMs ?? 40 * 60 * 60_000,
  });
}

export async function fetchOfficialPxwebDataset(url, payload, options = {}) {
  const requestBody = JSON.stringify(payload);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || Buffer.byteLength(requestBody, "utf8") > 16_000) {
    throw new Error("PXWeb request contract is invalid");
  }
  const fingerprint = createHash("sha256").update(requestBody).digest("hex");
  return fetchCached(url, {
    ...options,
    accept: "application/json",
    requestText: options.requestText || requestApprovedPublicHttpsJsonPost,
    requestBody,
    cacheDiscriminator: `pxweb-post-${fingerprint}`,
    requiredContentTypePrefixes: ["application/json"],
    requireSameResource: true,
    maximumBytes: options.maximumBytes ?? 256_000,
    maximumRedirects: 0,
    ttlMs: options.ttlMs ?? 12 * 60 * 60_000,
    staleMs: options.staleMs ?? 24 * 60 * 60_000,
  });
}

function officialPortalUrl(value) {
  try {
    const url = new URL(value, PORTAL_BASE);
    if (url.protocol !== "https:" || !OFFICIAL_HOSTS.has(url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function stripMarkup(value = "", maximumInputChars = MAX_DISCOVERY_MARKUP) {
  const input = String(value || "").slice(0, Math.max(1, Number(maximumInputChars) || MAX_DISCOVERY_MARKUP));
  if (!input) return "";
  const $ = load(`<main>${input}</main>`);
  $("script, style, noscript").remove();
  return cleanText($("main").text());
}

function boundedUtf8Prefix(value, maximumBytes) {
  const input = String(value || "");
  const limit = Math.max(0, Math.trunc(Number(maximumBytes) || 0));
  if (!limit || !input) return "";
  const encoded = Buffer.from(input, "utf8");
  if (encoded.length <= limit) return input;
  let end = limit;
  // Buffer#toString replaces a truncated UTF-8 sequence. Back up by at most
  // four bytes so the cache projection always stays inside its byte budget.
  while (end > Math.max(0, limit - 4)) {
    const candidate = encoded.subarray(0, end).toString("utf8");
    if (!candidate.endsWith("\uFFFD")) return candidate;
    end -= 1;
  }
  return encoded.subarray(0, end).toString("utf8").replace(/\uFFFD+$/u, "");
}

function boundedVportalMarkup(parts, maximumBytes) {
  const limit = Math.max(0, Math.trunc(Number(maximumBytes) || 0));
  let markup = "";
  let bytes = 0;
  for (const part of parts) {
    if (!part) continue;
    const separator = markup ? "\n" : "";
    const separatorBytes = Buffer.byteLength(separator, "utf8");
    const remaining = limit - bytes - separatorBytes;
    if (remaining <= 0) break;
    const accepted = boundedUtf8Prefix(part, remaining);
    if (!accepted) continue;
    markup += `${separator}${accepted}`;
    bytes += separatorBytes + Buffer.byteLength(accepted, "utf8");
  }
  return markup;
}

function boundedVportalField(value, maximumBytes, label, { optional = false } = {}) {
  if ((value === null || value === undefined || value === "") && optional) return "";
  if (typeof value !== "string" || !value || Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw new Error(`Official search returned an invalid ${label}`);
  }
  return value;
}

function vportalDocumentProjection(item, maximumMarkupBytes) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("Official search returned an invalid document");
  }
  if (!Array.isArray(item.content)) {
    throw new Error("Official search returned invalid document content");
  }
  // Some valid Drupal pages expose dozens of field fragments. Only the first
  // bounded window can enter the projection; the remainder is neither walked,
  // cached nor parsed.
  const content = item.content.slice(0, MAX_VPORTAL_CONTENT_FRAGMENTS);
  if (content.some((fragment) => typeof fragment !== "string")) {
    throw new Error("Official search returned invalid document content");
  }
  const lead = boundedVportalField(item.lead_text, MAX_VPORTAL_DOCUMENT_MARKUP_BYTES, "lead", { optional: true });
  const highlighted = boundedVportalField(
    item.highlighted,
    MAX_VPORTAL_DOCUMENT_MARKUP_BYTES,
    "highlight",
    { optional: true },
  );
  return {
    uri: boundedVportalField(item.uri, MAX_VPORTAL_URI_BYTES, "document URL"),
    title: boundedVportalField(item.title, MAX_VPORTAL_TITLE_BYTES, "document title"),
    content_type: boundedVportalField(
      item.content_type,
      MAX_VPORTAL_METADATA_BYTES,
      "content type",
      { optional: true },
    ),
    created: boundedVportalField(item.created, MAX_VPORTAL_METADATA_BYTES, "date", { optional: true }),
    markup: boundedVportalMarkup(
      [lead, highlighted, ...content],
      Math.min(MAX_VPORTAL_DOCUMENT_MARKUP_BYTES, maximumMarkupBytes),
    ),
  };
}

export function projectVportalPayload(payload) {
  if (!payload?.response || !Array.isArray(payload.response.docs)
    || payload.response.docs.length > MAX_VPORTAL_DOCUMENTS) {
    throw new Error("Official search returned an invalid payload");
  }
  let remainingMarkupBytes = MAX_VPORTAL_RESPONSE_MARKUP_BYTES;
  const docs = payload.response.docs.map((item) => {
    const projected = vportalDocumentProjection(item, remainingMarkupBytes);
    remainingMarkupBytes -= Buffer.byteLength(projected.markup, "utf8");
    return projected;
  });
  const numFound = Number(payload.response.numFound);
  return {
    _schema: VPORTAL_PROJECTION_SCHEMA,
    response: {
      docs,
      numFound: Number.isSafeInteger(numFound) && numFound >= 0 ? numFound : docs.length,
    },
  };
}

export function parseVportalProjectionBody(body) {
  let payload;
  try {
    payload = JSON.parse(String(body));
  } catch {
    throw new Error("Official search cache is invalid");
  }
  if (payload?._schema !== VPORTAL_PROJECTION_SCHEMA
    || !payload.response
    || !Array.isArray(payload.response.docs)
    || payload.response.docs.length > MAX_VPORTAL_DOCUMENTS) {
    throw new Error("Official search cache is invalid");
  }
  let totalMarkupBytes = 0;
  const docs = payload.response.docs.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)
      || typeof item.markup !== "string"
      || Buffer.byteLength(item.markup, "utf8") > MAX_VPORTAL_DOCUMENT_MARKUP_BYTES) {
      throw new Error("Official search cache is invalid");
    }
    totalMarkupBytes += Buffer.byteLength(item.markup, "utf8");
    if (totalMarkupBytes > MAX_VPORTAL_RESPONSE_MARKUP_BYTES) {
      throw new Error("Official search cache is invalid");
    }
    return {
      uri: boundedVportalField(item.uri, MAX_VPORTAL_URI_BYTES, "cached document URL"),
      title: boundedVportalField(item.title, MAX_VPORTAL_TITLE_BYTES, "cached document title"),
      content_type: boundedVportalField(
        item.content_type,
        MAX_VPORTAL_METADATA_BYTES,
        "cached content type",
        { optional: true },
      ),
      created: boundedVportalField(item.created, MAX_VPORTAL_METADATA_BYTES, "cached date", { optional: true }),
      markup: item.markup,
    };
  });
  const numFound = Number(payload.response.numFound);
  if (!Number.isSafeInteger(numFound) || numFound < 0) {
    throw new Error("Official search cache is invalid");
  }
  return { _schema: VPORTAL_PROJECTION_SCHEMA, response: { docs, numFound } };
}

export function vportalDocumentText(item, strip = stripMarkup) {
  if (!item || typeof item.markup !== "string"
    || Buffer.byteLength(item.markup, "utf8") > MAX_VPORTAL_DOCUMENT_MARKUP_BYTES) {
    throw new Error("Official search document projection is invalid");
  }
  return strip(item.markup, MAX_DISCOVERY_MARKUP).slice(0, MAX_DISCOVERY_DOCUMENT_TEXT);
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function officialDate(value) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return "jooksev";
  return new Intl.DateTimeFormat("et-EE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export async function fetchVportalJson(url, origin, {
  ttlMs = 5 * 60_000,
  staleMs = 24 * 60 * 60_000,
  timeoutMs = 4_500,
  signal: externalSignal,
  requestText = requestApprovedPublicHttpsText,
} = {}) {
  throwIfRequestAborted(externalSignal);
  const cacheKey = `vportal:${url}`;
  const now = Date.now();
  const cached = responseCache.get(cacheKey);
  if (cached && now - cached.savedAt < ttlMs) {
    try {
      return { payload: parseVportalProjectionBody(cached.body), cache: "hit", stale: false };
    } catch {
      responseCache.delete(cacheKey);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, Math.min(Number(timeoutMs) || 4_500, 10_000)));
  const signal = externalSignal && typeof AbortSignal.any === "function"
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  try {
    const upstream = await requestText(url, {
      approvedOrigins: OFFICIAL_ORIGINS,
      headers: {
        Accept: "application/json",
        Origin: origin,
        "User-Agent": "Keskkonnaportaali-praktika/4.0 (+https://praktika.arleserver.cfd)",
      },
      signal,
      maximumBytes: MAX_UPSTREAM_BYTES,
      maximumRedirects: 0,
      ca: VPORTAL_CA,
      // The official search host advertises IPv6, but Coolify's bridge
      // network is IPv4-only. Keep IPv4 selection inside the public-only DNS
      // lookup rather than bypassing the peer-validation transport.
      family: 4,
    });
    if (upstream.status !== 200) throw new Error(`Official search returned ${upstream.status}`);
    const payload = projectVportalPayload(JSON.parse(upstream.body));
    cacheResponse(cacheKey, JSON.stringify(payload));
    return { payload, cache: "miss", stale: false };
  } catch (error) {
    throwIfRequestAborted(externalSignal);
    if (cached && now - cached.savedAt < staleMs) {
      try {
        return { payload: parseVportalProjectionBody(cached.body), cache: "stale", stale: true };
      } catch {
        responseCache.delete(cacheKey);
      }
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function searchVportalSite(site, query, limit, options) {
  const url = new URL(`${VPORTAL_SEARCH_BASE}/${site.index}`);
  url.searchParams.set("query", query);
  url.searchParams.set("sort_by", "score");
  url.searchParams.set("page", "1");
  url.searchParams.set("langcode", "et");
  url.searchParams.set("limit", String(limit));
  const { payload, cache, stale } = await fetchVportalJson(url, site.origin, options);
  const documents = [];
  const items = payload.response.docs.slice(0, Math.max(1, Math.min(Number(limit) || 5, 6)));
  for (const item of items) {
    throwIfRequestAborted(options.signal);
    let sourceUrl;
    try {
      sourceUrl = validatedOfficialUrl(item.uri, site.baseUrl);
    } catch {
      continue;
    }
    if (sourceUrl.toString().length > 2_000) continue;
    const fullContent = vportalDocumentText(item);
    const firstContent = fullContent.slice(0, 900);
    const summary = firstContent
      || `${item.title} – ${site.organization} ametlik otsingutulemus.`;
    const title = cleanText(item.title).slice(0, 500);
    if (!title || !summary) continue;
    const contentType = cleanText(item.content_type).slice(0, 160);
    documents.push({
      id: sourceId(`vp-${site.index}`, sourceUrl.toString()),
      title,
      organization: site.organization,
      type: contentType || "Ametlik veebileht",
      published: officialDate(item.created),
      url: sourceUrl.toString(),
      tags: [contentType, site.organization.slice(0, 240), "ametlik allikas"].filter(Boolean),
      summary,
      content: fullContent || undefined,
      excerpt: firstContent,
      sourceSystem: `${site.organization} otsing`,
      retrieval: "official-federated-search",
      delivery: "federated-discovery",
      evidencePolicy: "route-only",
      _answerEvidenceEligible: false,
      stale,
    });
    // Cheerio puhastab HTML-i sünkroonselt. Väljastame kontrolli iga dokumendi
    // järel, et avaleht ja tervisekontroll ei jääks korraga saabunud
    // ametlike otsinguvastuste taha ootama.
    await yieldToEventLoop();
  }
  return {
    documents,
    total: Number(payload.response.numFound || documents.length),
    cache,
    stale,
    service: site.index,
  };
}

export async function searchOfficialSites(query, limit = 5, options = {}) {
  const providerQuery = minimizePublicProviderQuery(query);
  if (!providerQuery) {
    return { documents: [], total: 0, services: [] };
  }
  return officialDiscoveryGate.run(async () => {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 5, 6));
    const results = await Promise.allSettled(
      VPORTAL_SITES.map((site) => searchVportalSite(site, providerQuery, boundedLimit, options)),
    );
    throwIfRequestAborted(options.signal);
    const available = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    return {
      documents: available.flatMap((result) => result.documents),
      total: available.reduce((sum, result) => sum + result.total, 0),
      services: available.map((result) => ({ service: result.service, cache: result.cache, stale: result.stale })),
    };
  }, { signal: options.signal });
}

export async function searchKeskkonnaportaal(query, limit = 10, options = {}) {
  const providerQuery = minimizePublicProviderQuery(query);
  if (!providerQuery) return { documents: [], total: 0, cache: "rejected", stale: false };
  const url = new URL("/et/search", PORTAL_BASE);
  url.searchParams.set("search_api_fulltext", providerQuery);
  const { body, cache, stale } = await fetchCached(url.toString(), {
    ttlMs: 5 * 60_000,
    timeoutMs: options.timeoutMs || 7_000,
    signal: options.signal,
    requestText: options.requestText,
  });
  const $ = load(body);
  const heading = cleanText($(".news__title").first().text());
  const total = Number(heading.match(/\((\d+)\)/)?.[1] || 0);
  const documents = [];

  $(".search-results__item").slice(0, Math.max(1, Math.min(Number(limit) || 10, 20))).each((_index, element) => {
    const item = $(element);
    const titleElement = item.find(".search-results__title").first();
    const title = cleanText(titleElement.text());
    const href = titleElement.closest("a").attr("href") || item.find("a").first().attr("href");
    const sourceUrl = officialPortalUrl(href);
    if (!title || !sourceUrl) return;

    const category = cleanText(item.find(".search-results__category").first().text()) || "Otsingutulemus";
    const tags = item
      .find(".search-results__topic .field__item")
      .map((_tagIndex, tag) => cleanText($(tag).text()))
      .get()
      .filter(Boolean);
    const summary = cleanText(item.find(".search-results__text").first().text()).slice(0, 900);
    const organization = cleanText(item.find(".search-results__author").first().text()) || "Keskkonnaportaal";
    const published = cleanText(item.find(".search-results__date").first().text()) || "jooksev";

    documents.push({
      id: sourceId("kkp", sourceUrl),
      title,
      organization,
      type: category.split(">").map(cleanText).filter(Boolean).at(-1) || category,
      published,
      url: sourceUrl,
      tags: tags.length ? tags : [category],
      summary: summary || `${title} – Keskkonnaportaali ametlik otsingutulemus.`,
      excerpt: summary,
      sourceSystem: "Keskkonnaportaal",
      retrieval: "live-discovery",
      delivery: "federated-discovery",
      evidencePolicy: "route-only",
      _answerEvidenceEligible: false,
    });
  });

  return { documents, total: total || documents.length, cache, stale, url: url.toString() };
}

export function articleText(body) {
  const $ = load(body);
  $("script, style, noscript, nav, header, footer, form, aside, .cookie-consent, .breadcrumb").remove();
  const main = $("main article, main .field--name-body, main .node__content, main").first();
  const paragraphs = main
    .find("p, h2, h3, li")
    .map((_index, element) => cleanText($(element).text()))
    .get()
    .filter((value) => value.length >= 35 && value.length <= 1_200);
  return [...new Set(paragraphs)].join("\n").slice(0, 7_500);
}

export async function hydrateOfficialDocuments(documents, limit = 5, options = {}) {
  const selected = (documents || []).slice(0, Math.max(1, Math.min(Number(limit) || 5, 10)));
  return Promise.all(selected.map(async (document) => {
    if (document.retrieval !== "official-federated-search"
      && String(document.content || "").length >= 120) return document;
    try {
      const { content, finalUrl, fetchedAt, stale } = await sharedHydration(document.url, {
        timeoutMs: options.timeoutMs || 4_500,
        signal: options.signal,
        requestText: options.requestText,
      });
      if (!hydrationResourceMatches(document.url, finalUrl)) return document;
      if (content.length < 120) return document;
      // A stale fallback may remain useful for navigation, but it must never
      // become a fresh claim-evidence body after the official page failed.
      if (stale) return { ...document, stale: true };
      const page = {
        ...document,
        content,
        stale,
        _contentHash: createHash("sha256").update(content).digest("hex"),
      };
      if (document.retrieval !== "official-federated-search") {
        if (!sourceEvidenceEligibility(document).eligible) {
          return {
            ...page,
            evidencePolicy: "route-only",
            _answerEvidenceEligible: false,
          };
        }
        const observedAt = new Date(fetchedAt).toISOString();
        return {
          ...page,
          retrieval: "approved-page-hydration",
          evidencePolicy: "versioned",
          _answerEvidenceEligible: true,
          _evidenceVersion: page._contentHash,
          _evidenceStatusAt: observedAt,
          freshness: {
            class: "cached-official-page",
            basis: "retrieved-at",
            maxAgeMs: APPROVED_PAGE_EVIDENCE_MAX_AGE_MS,
            requiresSourceTimestamp: true,
          },
        };
      }
      // Federated results are untrusted discovery cards. Fetching their page
      // replaces index prose for display, but does not itself confer an
      // evidence capability. Vetted catalogue/corpus producers issue that
      // capability explicitly at their own ingestion boundary.
      return {
        ...page,
        summary: cleanText(content).slice(0, 900),
        excerpt: undefined,
        evidencePolicy: "route-only",
        _answerEvidenceEligible: false,
        _pageHydrated: true,
      };
    } catch (error) {
      throwIfRequestAborted(options.signal);
      return document;
    }
  }));
}

export const hydrateKeskkonnaportaalDocuments = hydrateOfficialDocuments;

export async function getKeskkonnaportaalSuggestions(query, limit = 5, options = {}) {
  throwIfRequestAborted(options.signal);
  const canonicalInput = canonicalizePublicSearchQuery(query, { maximumLength: 80 });
  if (!canonicalInput.ok) return { suggestions: [], cache: "rejected" };
  const providerQuery = minimizePublicProviderQuery(query, { maximumLength: 80 });
  if (!providerQuery) return { suggestions: [], cache: "rejected" };
  const url = new URL("/et/search_api_autocomplete/kem_kkp_search", PORTAL_BASE);
  url.searchParams.set("q", providerQuery.toLocaleLowerCase("et"));
  const cacheKey = url.toString();
  let entry = suggestionInflight.get(cacheKey);
  if (!entry) {
    const controller = new AbortController();
    entry = { controller, promise: null, settled: false, waiters: 0 };
    entry.promise = (async () => {
      const release = await officialSuggestionAdmission.acquire(options.clientKey, {
        signal: controller.signal,
        maximumWaitMs: 1_200,
      });
      try {
        const fetched = await fetchCached(cacheKey, {
          accept: "application/json",
          ttlMs: 10 * 60_000,
          timeoutMs: 4_500,
          signal: controller.signal,
          requestText: options.requestText,
          maximumBytes: MAX_SUGGESTION_RESPONSE_BYTES,
          cacheDiscriminator: "autocomplete-projection-v1",
          projectBody: projectKeskkonnaportaalSuggestionBody,
        });
        const suggestions = JSON.parse(fetched.body);
        return { suggestions, cache: fetched.cache };
      } finally {
        release();
      }
    })();
    suggestionInflight.set(cacheKey, entry);
    void entry.promise.finally(() => {
      entry.settled = true;
      if (suggestionInflight.get(cacheKey) === entry) suggestionInflight.delete(cacheKey);
    }).catch(() => undefined);
  }
  const projected = await waitForSharedRequest(
    entry,
    options.signal,
    "All autocomplete clients disconnected",
  );
  return {
    suggestions: projected.suggestions.slice(0, Math.max(1, Math.min(Number(limit) || 5, 5))),
    cache: projected.cache,
  };
}

export const INTEGRATION_ENDPOINTS = {
  portalSearch: `${PORTAL_BASE}/et/search`,
  portalSuggestions: `${PORTAL_BASE}/et/search_api_autocomplete/kem_kkp_search`,
  portalSitemap: `${PORTAL_BASE}/sitemap.xml`,
  officialGeoServer: "https://gsavalik.envir.ee/geoserver",
  officialDataApi: "https://keskkonnaandmed.envir.ee/",
  officialSiteSearch: VPORTAL_SITES.map((site) => `${VPORTAL_SEARCH_BASE}/${site.index}`),
  statisticsApi: "https://andmed.stat.ee/api/v1/et/stat",
};

export { VPORTAL_SITES };
