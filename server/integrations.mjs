import { createHash } from "node:crypto";
import { load } from "cheerio";

const PORTAL_BASE = "https://keskkonnaportaal.ee";
const PORTAL_HOSTS = new Set(["keskkonnaportaal.ee", "www.keskkonnaportaal.ee", "keskkonnaagentuur.ee", "www.keskkonnaagentuur.ee"]);
const responseCache = new Map();
const MAX_CACHE_ENTRIES = 250;
const MAX_UPSTREAM_BYTES = 2_000_000;

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
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

async function fetchCached(url, {
  accept,
  ttlMs = 5 * 60_000,
  staleMs = 24 * 60 * 60_000,
  timeoutMs = 7_000,
  signal: externalSignal,
} = {}) {
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
    const response = await fetch(url, {
      headers: {
        Accept: accept || "text/html,application/xhtml+xml",
        "User-Agent": "Keskkonnaportaali-praktika/3.0 (+https://praktika.arleserver.cfd)",
      },
      redirect: "follow",
      signal,
    });
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    const finalUrl = new URL(response.url);
    if (!PORTAL_HOSTS.has(finalUrl.hostname)) throw new Error("Upstream redirected outside the official allowlist");
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_UPSTREAM_BYTES) throw new Error("Upstream response is too large");
    const body = (await response.text()).slice(0, MAX_UPSTREAM_BYTES);
    cacheResponse(url, body);
    return { body, cache: "miss", stale: false };
  } catch (error) {
    if (cached && now - cached.savedAt < staleMs) return { body: cached.body, cache: "stale", stale: true };
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function officialPortalUrl(value) {
  try {
    const url = new URL(value, PORTAL_BASE);
    if (url.protocol !== "https:" || !PORTAL_HOSTS.has(url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
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

function articleText(body) {
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

export async function hydrateKeskkonnaportaalDocuments(documents, limit = 5, options = {}) {
  const selected = (documents || []).slice(0, Math.max(1, Math.min(Number(limit) || 5, 5)));
  return Promise.all(selected.map(async (document) => {
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
};
