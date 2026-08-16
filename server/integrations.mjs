import { createHash } from "node:crypto";
import { load } from "cheerio";

const PORTAL_BASE = "https://keskkonnaportaal.ee";
const TERRAPOINT_BASE = String(process.env.TERRAPOINT_API_URL || "https://terrapoint.ee").replace(/\/+$/, "");
const responseCache = new Map();

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function sourceId(prefix, value) {
  return `${prefix}-${createHash("sha256").update(String(value)).digest("hex").slice(0, 16)}`;
}

async function fetchCached(url, { accept, ttlMs = 5 * 60_000, timeoutMs = 10_000 } = {}) {
  const now = Date.now();
  const cached = responseCache.get(url);
  if (cached && now - cached.savedAt < ttlMs) {
    return { body: cached.body, cache: "hit" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: accept || "text/html,application/xhtml+xml",
        "User-Agent": "Keskkonnaportaali-praktika/2.0 (+https://praktika.arleserver.cfd)",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    const body = await response.text();
    responseCache.set(url, { body, savedAt: now });
    return { body, cache: "miss" };
  } finally {
    clearTimeout(timeout);
  }
}

function absolutePortalUrl(value) {
  try {
    return new URL(value, PORTAL_BASE).toString();
  } catch {
    return PORTAL_BASE;
  }
}

export async function searchKeskkonnaportaal(query, limit = 10) {
  const url = new URL("/et/search", PORTAL_BASE);
  url.searchParams.set("search_api_fulltext", query);
  const { body, cache } = await fetchCached(url.toString(), { ttlMs: 5 * 60_000, timeoutMs: 12_000 });
  const $ = load(body);
  const heading = cleanText($(".news__title").first().text());
  const total = Number(heading.match(/\((\d+)\)/)?.[1] || 0);
  const documents = [];

  $(".search-results__item").slice(0, Math.max(1, Math.min(Number(limit) || 10, 20))).each((_index, element) => {
    const item = $(element);
    const titleElement = item.find(".search-results__title").first();
    const title = cleanText(titleElement.text());
    const href = titleElement.closest("a").attr("href") || item.find("a").first().attr("href");
    if (!title || !href) return;

    const category = cleanText(item.find(".search-results__category").first().text()) || "Otsingutulemus";
    const tags = item
      .find(".search-results__topic .field__item")
      .map((_tagIndex, tag) => cleanText($(tag).text()))
      .get()
      .filter(Boolean);
    const summary = cleanText(item.find(".search-results__text").first().text()).slice(0, 720);
    const organization = cleanText(item.find(".search-results__author").first().text()) || "Keskkonnaportaal";
    const published = cleanText(item.find(".search-results__date").first().text()) || "jooksev";
    const sourceUrl = absolutePortalUrl(href);

    documents.push({
      id: sourceId("kkp", sourceUrl),
      title,
      organization,
      type: category.split(">").map(cleanText).filter(Boolean).at(-1) || category,
      published,
      url: sourceUrl,
      tags: tags.length ? tags : [category],
      summary: summary || `${title} – Keskkonnaportaali ametlik otsingutulemus.`,
      answer: summary || `${title} on Keskkonnaportaali ametlik otsingutulemus.`,
      sourceSystem: "Keskkonnaportaal",
      retrieval: "live-search",
    });
  });

  return { documents, total: total || documents.length, cache, url: url.toString() };
}

export async function getKeskkonnaportaalSuggestions(query, limit = 7) {
  const url = new URL("/et/search_api_autocomplete/kem_kkp_search", PORTAL_BASE);
  url.searchParams.set("q", query);
  const { body, cache } = await fetchCached(url.toString(), {
    accept: "application/json",
    ttlMs: 10 * 60_000,
    timeoutMs: 8_000,
  });
  const payload = JSON.parse(body);
  const suggestions = (Array.isArray(payload) ? payload : [])
    .filter((item) => cleanText(item?.value))
    .slice(0, Math.max(1, Math.min(Number(limit) || 7, 10)))
    .map((item) => ({
      value: cleanText(item.value),
      count: Number(String(item.label || "").match(/results-count[^>]*>\s*(\d+)/)?.[1] || 0),
    }));
  return { suggestions, cache };
}

const TERRAPOINT_SOURCE_DOCUMENTS = [
  {
    id: "terrapoint-maaamet-cadastre",
    title: "Katastriüksuse andmed ja ruumiandmed",
    organization: "Maa- ja Ruumiamet",
    type: "Terrapointi andmeallikas",
    published: "jooksev",
    url: "https://geoportaal.maaamet.ee/",
    tags: ["katastritunnus", "kinnistu", "katastriüksus", "pindala", "sihtotstarve", "kaart"],
    summary: "Terrapoint kasutab Maa- ja Ruumiameti avalikke teenuseid katastriüksuse põhi- ja ruumiandmete leidmiseks.",
    answer: "Katastriüksuse ametlikud põhi- ja ruumiandmed pärinevad Maa- ja Ruumiameti avalikest teenustest; tulemuse juures tuleb arvestada allika uuendamise ajaga.",
    sourceSystem: "Terrapoint",
    retrieval: "source-register",
  },
  {
    id: "terrapoint-metsaregister",
    title: "Metsaregister ja metsa inventeerimisandmed",
    organization: "Keskkonnaagentuur",
    type: "Terrapointi andmeallikas",
    published: "jooksev",
    url: "https://register.metsad.ee/",
    tags: ["mets", "metsaregister", "eraldis", "inventeerimine", "puistu", "tagavara"],
    summary: "Terrapoint koondab Metsaregistri avalikke metsaeraldiste ja inventeerimise andmeid kinnistupõhisesse vaatesse.",
    answer: "Kinnistupõhised metsaeraldiste ja inventeerimise näitajad koondatakse Metsaregistri avalikest andmetest ning neid tuleb kontrollida registri enda vaatest.",
    sourceSystem: "Terrapoint",
    retrieval: "source-register",
  },
  {
    id: "terrapoint-eelis",
    title: "EELIS ja looduskaitselised ruumikihid",
    organization: "Keskkonnaagentuur",
    type: "Terrapointi andmeallikas",
    published: "jooksev",
    url: "https://register.keskkonnaportaal.ee/register",
    tags: ["EELIS", "looduskaitse", "Natura 2000", "kaitseala", "piirang", "elupaik"],
    summary: "Terrapoint võrdleb kinnistu geomeetriat EELISe ja teiste avalike looduskaitseliste ruumikihtidega.",
    answer: "Looduskaitselise kattuvuse kontroll tugineb avalikele ruumikihtidele; puuduv vaste ei tõenda piirangu puudumist ja otsus tuleb kontrollida ametlikus registris.",
    sourceSystem: "Terrapoint",
    retrieval: "source-register",
  },
];

export function terrapointSourceDocuments() {
  return TERRAPOINT_SOURCE_DOCUMENTS.map((document) => ({ ...document, tags: [...document.tags] }));
}

function cadastralNumber(query) {
  return String(query).match(/\b\d{5}:\d{3}:\d{4}\b/)?.[0] || null;
}

export async function searchTerrapointProperty(query) {
  const number = cadastralNumber(query);
  if (!number) return { documents: [], status: "not-applicable" };

  const url = `${TERRAPOINT_BASE}/api/search/${encodeURIComponent(number)}?include_map_layers=false`;
  const { body, cache } = await fetchCached(url, {
    accept: "application/json",
    ttlMs: 30 * 60_000,
    timeoutMs: 18_000,
  });
  const payload = JSON.parse(body);
  const cadastre = payload?.kataster || payload?.cadastre || {};
  const address = cleanText(cadastre.l_aadress || cadastre.address || "");
  const area = cadastre.pindala_ha ?? cadastre.area_ha;
  const forestArea = cadastre.mets_pindala_ha ?? cadastre.forest_area_ha;
  const details = [
    area != null ? `pindala ${area} ha` : null,
    forestArea != null ? `metsamaa ${forestArea} ha` : null,
    cleanText(cadastre.sihtotstarve || cadastre.purpose || "") || null,
  ].filter(Boolean);
  const title = address ? `${address} (${number})` : `Katastriüksus ${number}`;
  const summary = details.length
    ? `Terrapointi avalik kinnistuotsing tagastas: ${details.join(", ")}.`
    : "Terrapointi avalik kinnistuotsing leidis katastriüksuse koondvaate.";

  return {
    status: "live",
    cache,
    documents: [{
      id: sourceId("terrapoint-property", number),
      title,
      organization: "Terrapoint",
      type: "Kinnistu koondvaade",
      published: "reaalajas",
      url: "https://terrapoint.ee/",
      tags: ["katastritunnus", "kinnistu", "mets", number],
      summary,
      answer: `${summary} Õigusliku või looduskaitselise otsuse puhul tuleb kontrollida ka algregistrit.`,
      sourceSystem: "Terrapoint",
      retrieval: "live-property-api",
    }],
  };
}

export const INTEGRATION_ENDPOINTS = {
  portalSearch: `${PORTAL_BASE}/et/search`,
  portalSuggestions: `${PORTAL_BASE}/et/search_api_autocomplete/kem_kkp_search`,
  terrapoint: TERRAPOINT_BASE,
};
