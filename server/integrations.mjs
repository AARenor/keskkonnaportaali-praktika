import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { rootCertificates } from "node:tls";
import { load } from "cheerio";

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
  "tableau.envir.ee",
  "ec.europa.eu",
  "foresteurope.org",
  "www.foresteurope.org",
  "eea.europa.eu",
  "www.eea.europa.eu",
]);
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
const responseCache = new Map();
const MAX_CACHE_ENTRIES = 250;
const MAX_UPSTREAM_BYTES = 2_000_000;
const MAX_CONCURRENT_OFFICIAL_DISCOVERIES = 2;
const MAX_DISCOVERY_DOCUMENT_TEXT = 7_500;
const MAX_DISCOVERY_MARKUP = 48_000;

export function createAbortableConcurrencyGate(maximum = 1) {
  const limit = Math.max(1, Math.min(Number(maximum) || 1, 20));
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

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/([.!?])(?=[A-ZÕÄÖÜŠŽ„“])/gu, "$1 ")
    .trim();
}

function sourceId(prefix, value) {
  return `${prefix}-${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

function cacheResponse(url, body) {
  if (responseCache.has(url)) responseCache.delete(url);
  responseCache.set(url, { body, savedAt: Date.now() });
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    responseCache.delete(responseCache.keys().next().value);
  }
}

export function validatedOfficialUrl(value, base) {
  const url = new URL(value, base);
  if (url.protocol !== "https:" || !OFFICIAL_HOSTS.has(url.hostname)) {
    throw new Error("Upstream URL is outside the official allowlist");
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  return url;
}

async function fetchOfficial(url, options = {}, maximumRedirects = 3) {
  let current = validatedOfficialUrl(url);
  for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
    const response = await fetch(current, { ...options, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location || redirects === maximumRedirects) throw new Error("Too many or invalid upstream redirects");
    current = validatedOfficialUrl(location, current);
  }
  throw new Error("Too many upstream redirects");
}

export async function readBoundedResponseText(response, maximumBytes = MAX_UPSTREAM_BYTES) {
  const limit = Math.max(1, Math.min(Number(maximumBytes) || MAX_UPSTREAM_BYTES, MAX_UPSTREAM_BYTES));
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > limit) throw new Error("Upstream response is too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Upstream response is too large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function throwIfRequestAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

async function fetchCached(url, {
  accept,
  ttlMs = 5 * 60_000,
  staleMs = 24 * 60 * 60_000,
  timeoutMs = 7_000,
  signal: externalSignal,
} = {}) {
  throwIfRequestAborted(externalSignal);
  const now = Date.now();
  const cached = responseCache.get(url);
  if (cached && now - cached.savedAt < ttlMs) return { body: cached.body, cache: "hit", stale: false };

  const controller = new AbortController();
  const boundedTimeoutMs = Math.max(250, Math.min(Number(timeoutMs) || 7_000, 15_000));
  const timeout = setTimeout(() => controller.abort(), boundedTimeoutMs);
  const signal = externalSignal && typeof AbortSignal.any === "function"
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  try {
    const response = await fetchOfficial(url, {
      headers: {
        Accept: accept || "text/html,application/xhtml+xml",
        "User-Agent": "Keskkonnaportaali-praktika/3.0 (+https://praktika.arleserver.cfd)",
      },
      signal,
    });
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    const body = await readBoundedResponseText(response);
    cacheResponse(url, body);
    return { body, cache: "miss", stale: false };
  } catch (error) {
    throwIfRequestAborted(externalSignal);
    if (cached && now - cached.savedAt < staleMs) return { body: cached.body, cache: "stale", stale: true };
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

function boundedVportalContent(fragments = []) {
  let content = "";
  for (const fragment of fragments) {
    if (content.length >= MAX_DISCOVERY_DOCUMENT_TEXT) break;
    const remaining = MAX_DISCOVERY_DOCUMENT_TEXT - content.length;
    // Kuna lõppvastusse jõuab niigi kõige rohkem 7500 puhast tähemärki,
    // ei tohi üks ametliku otsingu ebatavaliselt suur HTML-väli kogu event
    // loop'i enne seda piiri ära kasutada.
    const rawLimit = Math.max(4_000, Math.min(MAX_DISCOVERY_MARKUP, remaining * 6));
    const cleaned = stripMarkup(fragment, rawLimit).slice(0, remaining);
    if (!cleaned) continue;
    content = `${content}${content ? "\n" : ""}${cleaned}`.slice(0, MAX_DISCOVERY_DOCUMENT_TEXT);
  }
  return content;
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

async function fetchVportalJson(url, origin, {
  ttlMs = 5 * 60_000,
  staleMs = 24 * 60 * 60_000,
  timeoutMs = 4_500,
  signal: externalSignal,
} = {}) {
  throwIfRequestAborted(externalSignal);
  const cacheKey = `vportal:${url}`;
  const now = Date.now();
  const cached = responseCache.get(cacheKey);
  if (cached && now - cached.savedAt < ttlMs) {
    return { payload: JSON.parse(cached.body), cache: "hit", stale: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, Math.min(Number(timeoutMs) || 4_500, 10_000)));
  const signal = externalSignal && typeof AbortSignal.any === "function"
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  try {
    const body = await new Promise((resolve, reject) => {
      const request = httpsRequest(url, {
        ca: VPORTAL_CA,
        // The official search host advertises IPv6, but Coolify's bridge
        // network is IPv4-only. Node does not reliably fall back here, so an
        // otherwise healthy upstream would consume the entire search budget.
        family: 4,
        headers: {
          Accept: "application/json",
          Origin: origin,
          "User-Agent": "Keskkonnaportaali-praktika/4.0 (+https://praktika.arleserver.cfd)",
        },
        method: "GET",
        signal,
      }, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Official search returned ${response.statusCode}`));
          return;
        }
        const declaredSize = Number(response.headers["content-length"] || 0);
        if (declaredSize > MAX_UPSTREAM_BYTES) {
          response.destroy(new Error("Official search response is too large"));
          return;
        }
        let size = 0;
        const chunks = [];
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_UPSTREAM_BYTES) {
            response.destroy(new Error("Official search response is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        response.on("error", reject);
      });
      request.on("error", reject);
      request.end();
    });
    const payload = JSON.parse(body);
    if (!payload?.response || !Array.isArray(payload.response.docs)) {
      throw new Error("Official search returned an invalid payload");
    }
    cacheResponse(cacheKey, body);
    return { payload, cache: "miss", stale: false };
  } catch (error) {
    throwIfRequestAborted(externalSignal);
    if (cached && now - cached.savedAt < staleMs) {
      return { payload: JSON.parse(cached.body), cache: "stale", stale: true };
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
      sourceUrl = new URL(item.uri, site.baseUrl);
    } catch {
      continue;
    }
    if (sourceUrl.protocol !== "https:" || !OFFICIAL_HOSTS.has(sourceUrl.hostname)) continue;
    sourceUrl.hash = "";
    const highlighted = stripMarkup(item.highlighted, 12_000).slice(0, 900);
    const lead = stripMarkup(item.lead_text, 12_000).slice(0, 900);
    const fullContent = boundedVportalContent(Array.isArray(item.content) ? item.content : []);
    const firstContent = fullContent.slice(0, 900);
    const summary = cleanText([lead, highlighted].filter(Boolean).join(" ")).slice(0, 1_200)
      || firstContent
      || `${item.title} – ${site.organization} ametlik otsingutulemus.`;
    const title = cleanText(item.title);
    if (!title || !summary) continue;
    documents.push({
      id: sourceId(`vp-${site.index}`, sourceUrl.toString()),
      title,
      organization: site.organization,
      type: cleanText(item.content_type) || "Ametlik veebileht",
      published: officialDate(item.created),
      url: sourceUrl.toString(),
      tags: [cleanText(item.content_type), site.organization, "ametlik allikas"].filter(Boolean),
      summary,
      content: fullContent || undefined,
      excerpt: highlighted || lead,
      sourceSystem: `${site.organization} otsing`,
      retrieval: "official-federated-search",
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
  return officialDiscoveryGate.run(async () => {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 5, 6));
    const results = await Promise.allSettled(
      VPORTAL_SITES.map((site) => searchVportalSite(site, query, boundedLimit, options)),
    );
    const available = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    return {
      documents: available.flatMap((result) => result.documents),
      total: available.reduce((sum, result) => sum + result.total, 0),
      services: available.map((result) => ({ service: result.service, cache: result.cache, stale: result.stale })),
    };
  }, { signal: options.signal });
}

export async function searchKeskkonnaportaal(query, limit = 10, options = {}) {
  const url = new URL("/et/search", PORTAL_BASE);
  url.searchParams.set("search_api_fulltext", query);
  const { body, cache, stale } = await fetchCached(url.toString(), {
    ttlMs: 5 * 60_000,
    timeoutMs: options.timeoutMs || 7_000,
    signal: options.signal,
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
    if (String(document.content || "").length >= 120) return document;
    try {
      const { body, stale } = await fetchCached(document.url, {
        ttlMs: 30 * 60_000,
        timeoutMs: options.timeoutMs || 4_500,
        signal: options.signal,
      });
      const content = articleText(body);
      return content.length >= 120 ? { ...document, content, stale } : document;
    } catch {
      return document;
    }
  }));
}

export const hydrateKeskkonnaportaalDocuments = hydrateOfficialDocuments;

export async function getKeskkonnaportaalSuggestions(query, limit = 5) {
  const url = new URL("/et/search_api_autocomplete/kem_kkp_search", PORTAL_BASE);
  url.searchParams.set("q", query);
  const { body, cache } = await fetchCached(url.toString(), {
    accept: "application/json",
    ttlMs: 10 * 60_000,
    timeoutMs: 4_500,
  });
  const payload = JSON.parse(body);
  const suggestions = (Array.isArray(payload) ? payload : [])
    .filter((item) => cleanText(item?.value))
    .slice(0, Math.max(1, Math.min(Number(limit) || 5, 5)))
    .map((item) => ({
      value: cleanText(item.value),
      count: Number(String(item.label || "").match(/results-count[^>]*>\s*(\d+)/)?.[1] || 0),
    }));
  return { suggestions, cache };
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
