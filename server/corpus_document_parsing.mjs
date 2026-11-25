import { createHash } from "node:crypto";
import { load } from "cheerio";
import { validateApprovedPublicHttpsUrl } from "./public-https.mjs";
import { SOURCE_IDENTITY_VERSION, sourceResourceKey, sameSourceResource } from "./source-identity.mjs";
import { extractSourceText } from "./source_policy.mjs";

export const PORTAL_BASE = "https://keskkonnaportaal.ee";
const CRAWLER_PRODUCT = "keskkonnaportaali-praktika-corpus";
export const MAX_ROBOTS_BYTES = 64_000;
const MAX_ROBOTS_LINES = 2_000;
const MAX_ROBOTS_GROUPS = 32;
const MAX_ROBOTS_RULES = 256;
const MAX_ROBOTS_LINE_BYTES = 512;
const MAX_ROBOTS_PATTERN_LENGTH = 256;
const MAX_ROBOTS_WILDCARDS = 8;
const MAX_ROBOTS_TARGET_LENGTH = 2_048;
export const PORTAL_PAGE_SIZE = 50;
export const MAX_PORTAL_CATALOG_TOTAL = 20_000;
export const MAX_PORTAL_CATALOG_PAGES = Math.ceil(MAX_PORTAL_CATALOG_TOTAL / PORTAL_PAGE_SIZE);
export const SITEMAP_PAGE_SIZE = 5_000;
export const OFFICIAL_HOSTS = new Set([
  "keskkonnaportaal.ee",
  "www.keskkonnaportaal.ee",
  "register.keskkonnaportaal.ee",
  "avaandmed.keskkonnaportaal.ee",
  "kliimaatlas.keskkonnaportaal.ee",
  "keskkonnaagentuur.ee",
  "www.keskkonnaagentuur.ee",
  "keskkonnaamet.ee",
  "www.keskkonnaamet.ee",
  "kliimaministeerium.ee",
  "www.kliimaministeerium.ee",
  "riigiteataja.ee",
  "www.riigiteataja.ee",
  "stat.ee",
  "www.stat.ee",
  "andmed.stat.ee",
  "rmk.ee",
  "www.rmk.ee",
  "ilmateenistus.ee",
  "www.ilmateenistus.ee",
  "ohuseire.ee",
  "www.ohuseire.ee",
  "kaitsealad.ee",
  "www.kaitsealad.ee",
  "keskkonnaharidus.ee",
  "www.keskkonnaharidus.ee",
  "eelis.ee",
  "www.eelis.ee",
  "tartu.ee",
  "www.tartu.ee",
  "tallinn.ee",
  "www.tallinn.ee",
  "terviseamet.ee",
  "www.terviseamet.ee",
  "kik.ee",
  "www.kik.ee",
  "loodusveeb.ee",
  "www.loodusveeb.ee",
  "envir.ee",
  "www.envir.ee",
  "keskkonnaandmed.envir.ee",
  "gsavalik.envir.ee",
  "kotkas.envir.ee",
  "kese.envir.ee",
  "pakis.envir.ee",
  "proto.envir.ee",
  "maaamet.ee",
  "www.maaamet.ee",
  "geoportaal.maaamet.ee",
]);
export const CORPUS_HTTPS_ORIGINS = new Set(
  [...OFFICIAL_HOSTS, "et.wikipedia.org"].map((hostname) => `https://${hostname}`),
);

export function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

export function boundedText(value, length) {
  return cleanText(value).slice(0, length);
}

export function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function canonicalUrl(value, base = PORTAL_BASE) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue || /^(?:null|undefined)$/iu.test(rawValue)) return null;
  try {
    const url = new URL(rawValue, base);
    if (url.protocol === "http:" && ["keskkonnaportaal.ee", "www.keskkonnaportaal.ee"].includes(url.hostname)) {
      url.protocol = "https:";
    }
    if (url.protocol !== "https:") return null;
    const terminalPathSegment = url.pathname.split("/").filter(Boolean).at(-1) || "";
    let decodedTerminalPathSegment = terminalPathSegment;
    try {
      decodedTerminalPathSegment = decodeURIComponent(terminalPathSegment);
    } catch {
      // Keep the encoded segment; malformed encodings remain ordinary URLs
      // and will be rejected by the downstream HTTPS fetch if unusable.
    }
    if (/^(?:null|undefined)$/iu.test(decodedTerminalPathSegment.normalize("NFKC"))) return null;
    if (!/\.pdf$/iu.test(url.pathname)) url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

// Catalogue entries and the crawl can disagree only by a trailing slash on a
// non-root path (`/juhised` vs `/juhised/`). They are the same public resource:
// stripping the slash here keeps one row per source instead of creating a
// near-duplicate that later aborts the reviewed-catalogue insert.
export function canonicalCatalogueUrl(value) {
  const canonical = canonicalUrl(value);
  if (!canonical) return null;
  const url = new URL(canonical);
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString();
}

export function hydrationResourceMatches(requestedValue, finalValue) {
  const approvedTarget = canonicalUrl(requestedValue);
  const approvedFinal = canonicalUrl(finalValue);
  const transportKey = (value) => {
    if (!value) return null;
    const url = new URL(value);
    url.hash = "";
    if (url.hostname === "www.keskkonnaportaal.ee") url.hostname = "keskkonnaportaal.ee";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid)/iu.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString();
  };
  return Boolean(approvedTarget && approvedFinal
    && transportKey(approvedTarget) === transportKey(approvedFinal)
    && sameSourceResource(approvedTarget, approvedFinal));
}

function robotsPatternMatches(pattern, target) {
  const endAnchored = pattern.endsWith("$");
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  if (!body.includes("*")) return endAnchored ? target === body : target.startsWith(body);

  const segments = body.split("*");
  let position = 0;
  if (!body.startsWith("*")) {
    const first = segments.shift() || "";
    if (!target.startsWith(first)) return false;
    position = first.length;
  }

  let endLimit = target.length;
  if (endAnchored && !body.endsWith("*")) {
    const last = segments.pop() || "";
    if (!target.endsWith(last)) return false;
    endLimit = target.length - last.length;
  }

  for (const segment of segments) {
    if (!segment) continue;
    const found = target.indexOf(segment, position);
    if (found < 0 || found + segment.length > endLimit) return false;
    position = found + segment.length;
  }
  return position <= endLimit;
}

export function parseRobotsTxt(value = "", product = CRAWLER_PRODUCT) {
  const input = String(value);
  if (Buffer.byteLength(input, "utf8") > MAX_ROBOTS_BYTES) {
    throw new Error("robots.txt exceeds the configured byte limit");
  }
  const lines = input.split(/\r?\n/u);
  if (lines.length > MAX_ROBOTS_LINES) throw new Error("robots.txt has too many lines");
  const groups = [];
  let group;
  let ruleCount = 0;
  for (const rawLine of lines) {
    if (Buffer.byteLength(rawLine, "utf8") > MAX_ROBOTS_LINE_BYTES) {
      throw new Error("robots.txt contains an oversized line");
    }
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase("en");
    const directive = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!group || group.hasDirectives) {
        if (groups.length >= MAX_ROBOTS_GROUPS) throw new Error("robots.txt has too many groups");
        group = { agents: [], rules: [], hasDirectives: false };
        groups.push(group);
      }
      // A reader can be named anywhere in its group, so a fixed short list
      // would silently drop the ninth name and miss that reader's rules. The
      // list is bounded and overflow fails closed instead.
      if (group.agents.length >= 64) {
        throw new Error("robots.txt has too many user agents in one group");
      }
      group.agents.push(directive.slice(0, 120).toLocaleLowerCase("en"));
      continue;
    }
    if (!group || !["allow", "disallow"].includes(key)) continue;
    group.hasDirectives = true;
    if (directive || key === "allow") {
      if (directive.length > MAX_ROBOTS_PATTERN_LENGTH
        || (directive.match(/\*/gu) || []).length > MAX_ROBOTS_WILDCARDS) {
        throw new Error("robots.txt contains an over-complex rule");
      }
      ruleCount += 1;
      if (ruleCount > MAX_ROBOTS_RULES) throw new Error("robots.txt has too many rules");
      group.rules.push({
        type: key,
        pattern: directive,
        specificity: directive.replace(/[\*$]/gu, "").length,
      });
    }
  }
  const normalizedProduct = String(product).toLocaleLowerCase("en");
  // The published robots specification selects the group whose user-agent
  // match is the most specific: a token that names this reader whole beats a
  // shorter token that merely appears inside the name, and only groups matching
  // at that same specificity are merged. The wildcard group is a fallback for
  // when no group names this reader at all, never an addition to one that does.
  const namedMatches = groups
    .map((group) => ({
      group,
      specificity: group.agents.reduce((longest, agent) => (
        agent && agent !== "*" && normalizedProduct.includes(agent)
          ? Math.max(longest, agent.length)
          : longest
      ), 0),
    }))
    .filter(({ specificity }) => specificity > 0);
  const maximumSpecificity = namedMatches
    .reduce((maximum, { specificity }) => Math.max(maximum, specificity), 0);
  const selected = maximumSpecificity > 0
    ? namedMatches
      .filter(({ specificity }) => specificity === maximumSpecificity)
      .map(({ group }) => group)
    : groups.filter(({ agents }) => agents.includes("*"));
  return selected.flatMap(({ rules }) => rules);
}

export function robotsAllowsUrl(url, rules = []) {
  let target;
  try {
    const parsed = new URL(url);
    target = `${parsed.pathname}${parsed.search}`;
  } catch {
    return false;
  }
  if (target.length > MAX_ROBOTS_TARGET_LENGTH || rules.length > MAX_ROBOTS_RULES) return false;
  const matches = rules
    .filter(({ pattern }) => pattern && robotsPatternMatches(pattern, target))
    .sort((left, right) => (right.specificity ?? right.pattern.replace(/[\*$]/gu, "").length)
      - (left.specificity ?? left.pattern.replace(/[\*$]/gu, "").length)
      || Number(right.type === "allow") - Number(left.type === "allow"));
  return matches.length === 0 || matches[0].type === "allow";
}

export function isApprovedCorpusRedirect(requestedValue, candidateValue) {
  try {
    const requested = validateApprovedPublicHttpsUrl(requestedValue, CORPUS_HTTPS_ORIGINS);
    validateApprovedPublicHttpsUrl(new URL(candidateValue, requested), corpusOriginsForUrl(requested));
    return true;
  } catch {
    return false;
  }
}

export function corpusOriginsForUrl(value) {
  const requested = validateApprovedPublicHttpsUrl(value, CORPUS_HTTPS_ORIGINS);
  const origins = new Set([requested.origin]);
  const hostname = requested.hostname.startsWith("www.")
    ? requested.hostname.slice(4)
    : requested.hostname;
  for (const counterpart of [`https://${hostname}`, `https://www.${hostname}`]) {
    if (CORPUS_HTTPS_ORIGINS.has(counterpart)) origins.add(counterpart);
  }
  return origins;
}

function sourceTierForUrl(value) {
  try {
    const host = new URL(value).hostname.toLocaleLowerCase("en");
    if (host === "et.wikipedia.org") return "supplementary";
    if (OFFICIAL_HOSTS.has(host) || host.endsWith(".envir.ee")) return "official";
  } catch {
    return "other";
  }
  return "other";
}

export function externalId(url) {
  return hash(url).slice(0, 24);
}

export function parsePortalDate(value) {
  const match = cleanText(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/u);
  if (!match) return null;
  return canonicalIsoDate(`${match[3]}-${match[2]}-${match[1]}`);
}

export function canonicalIsoDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
    ? text
    : null;
}

export function canonicalIsoTimestamp(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 64) return null;
  const dateOnly = canonicalIsoDate(text);
  if (dateOnly) return `${dateOnly}T00:00:00.000Z`;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):(\d{2}))$/u);
  if (!match || !canonicalIsoDate(match[1])) return null;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] || 0) > 59) return null;
  if (match[5] !== "Z" && (Number(match[6]) > 23 || Number(match[7]) > 59)) return null;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function placeholderTitle(url) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1) || "Keskkonnaportaal");
    return boundedText(last.replace(/[-_]+/gu, " ").replace(/^./u, (letter) => letter.toLocaleUpperCase("et")), 240);
  } catch {
    return "Keskkonnaportaali leht";
  }
}

export function normalizeDocument(document) {
  const url = canonicalUrl(document.url);
  if (!url) return null;
  const title = boundedText(document.title || placeholderTitle(url), 500);
  if (!title) return null;
  const summary = boundedText(document.summary, 4_000);
  const content = boundedText(document.content, 80_000);
  const topics = [...new Set((document.topics || []).map((topic) => boundedText(topic, 100)).filter(Boolean))].slice(0, 20);
  const sourceTier = ["official", "reviewed", "supplementary", "other"].includes(document.sourceTier)
    ? document.sourceTier
    : sourceTierForUrl(url);
  const normalized = {
    externalId: document.externalId || externalId(url),
    sourceKey: boundedText(document.sourceKey || "keskkonnaportaal", 80),
    url,
    title,
    summary,
    content,
    category: boundedText(document.category, 200),
    organization: boundedText(document.organization, 200),
    publishedAt: canonicalIsoDate(document.publishedAt),
    publishedLabel: boundedText(document.publishedLabel || document.publishedAt, 80),
    modifiedAt: canonicalIsoTimestamp(document.modifiedAt),
    topics,
    sourceTier,
    language: boundedText(document.language || "et", 12),
    quality: Math.max(1, Math.min(Number(document.quality) || 1, 5)),
    metadata: {
      ...(document.metadata && typeof document.metadata === "object" && !Array.isArray(document.metadata)
        ? document.metadata : {}),
      sourceResourceKey: sourceResourceKey(url),
      sourceIdentityVersion: SOURCE_IDENTITY_VERSION,
    },
  };
  normalized.contentHash = hash(JSON.stringify([
    normalized.title,
    normalized.summary,
    normalized.content,
    normalized.category,
    normalized.organization,
    normalized.publishedAt,
    normalized.topics,
  ]));
  return normalized;
}

export function deduplicateCorpusDocuments(rawDocuments = []) {
  const byUrl = new Map();
  for (const rawDocument of rawDocuments) {
    const document = normalizeDocument(rawDocument);
    if (!document) continue;
    const current = byUrl.get(document.url);
    if (!current) {
      byUrl.set(document.url, document);
      continue;
    }
    const currentIsFederated = current.sourceKey === "official-live-search";
    const documentIsFederated = document.sourceKey === "official-live-search";
    if (currentIsFederated !== documentIsFederated) {
      // Search-index snippets are discovery metadata, not a hydrated page body.
      // Keep the non-live record's identity, body, hash and provenance atomic in
      // either input order; only harmless topic coverage and tier quality merge.
      const authoritative = currentIsFederated ? document : current;
      const discovery = currentIsFederated ? current : document;
      const merged = {
        ...discovery,
        ...authoritative,
        metadata: { ...authoritative.metadata },
      };
      merged.contentHash = hash(JSON.stringify([
        merged.title,
        merged.summary,
        merged.content,
        merged.category,
        merged.organization,
        merged.publishedAt,
        merged.topics,
      ]));
      byUrl.set(document.url, merged);
      continue;
    }
    const preferred = document.quality >= current.quality ? document : current;
    const fallback = preferred === document ? current : document;
    const merged = {
      ...fallback,
      ...preferred,
      summary: preferred.summary || fallback.summary,
      content: preferred.content.length >= fallback.content.length ? preferred.content : fallback.content,
      topics: [...new Set([...current.topics, ...document.topics])].slice(0, 20),
      metadata: { ...current.metadata, ...document.metadata },
      sourceTier: current.sourceTier === "reviewed" || document.sourceTier === "reviewed"
        ? "reviewed"
        : preferred.sourceTier,
      quality: Math.max(current.quality, document.quality),
    };
    merged.contentHash = hash(JSON.stringify([
      merged.title,
      merged.summary,
      merged.content,
      merged.category,
      merged.organization,
      merged.publishedAt,
      merged.topics,
    ]));
    byUrl.set(document.url, merged);
  }
  const byIdentity = new Map();
  for (const document of byUrl.values()) {
    const key = `${document.sourceKey}\u0000${document.externalId}`;
    const current = byIdentity.get(key);
    if (!current) {
      byIdentity.set(key, document);
      continue;
    }
    const preferred = document.quality >= current.quality ? document : current;
    const fallback = preferred === document ? current : document;
    byIdentity.set(key, {
      ...fallback,
      ...preferred,
      content: preferred.content.length >= fallback.content.length ? preferred.content : fallback.content,
      topics: [...new Set([...current.topics, ...document.topics])].slice(0, 20),
      metadata: { ...current.metadata, ...document.metadata },
      quality: Math.max(current.quality, document.quality),
    });
  }
  return [...byIdentity.values()];
}

export function parsePortalReportedTotal(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  if (!/^\d{1,6}$/u.test(raw)) throw new Error("Portal search returned an invalid result count");
  const total = Number(raw);
  if (!Number.isSafeInteger(total) || total < 0 || total > MAX_PORTAL_CATALOG_TOTAL) {
    throw new Error("Portal search exceeds the configured result limit");
  }
  return total;
}

export function parsePortalSearchPage(html, baseUrl = PORTAL_BASE) {
  const $ = load(String(html || ""));
  const mainText = cleanText($("main").text());
  const total = parsePortalReportedTotal(mainText.match(/Tulemused otsingule\s*\((\d+)\)/iu)?.[1]
    || mainText.match(/(?<!\d)(\d+)\s+tulemost/iu)?.[1]
    || "");
  const resultCards = $(".search-results__item-wrap");
  if (resultCards.length > PORTAL_PAGE_SIZE) throw new Error("Portal search returned too many result cards");
  const documents = resultCards.map((_, element) => {
    const card = $(element);
    const link = card.find([
      ".search-results__item > a[href]",
      ".search-results__item .search-results__title a[href]",
    ].join(", ")).first();
    const url = canonicalUrl(link.attr("href"), baseUrl);
    if (!url) return null;
    const category = boundedText(card.find(".search-results__category").first().text(), 200);
    const publishedLabel = boundedText(card.find(".search-results__date").first().text(), 80);
    return normalizeDocument({
      sourceKey: "portal-catalog",
      url,
      title: card.find(".search-results__title").first().text(),
      summary: card.find(".search-results__text").first().text(),
      category,
      organization: card.find(".search-results__author").first().text(),
      publishedAt: parsePortalDate(publishedLabel),
      publishedLabel,
      topics: card.find(".search-results__topic a").map((__, topic) => $(topic).text()).get(),
      sourceTier: sourceTierForUrl(url),
      quality: 3,
      metadata: { source_kind: "portal-search-card", placeholder: false },
    });
  }).get().filter(Boolean);
  return { total, documents };
}

export function parsePortalSitemapPage(xml) {
  const $ = load(String(xml || ""), { xmlMode: true });
  const entries = $("url");
  if (entries.length > SITEMAP_PAGE_SIZE) throw new Error("Portal sitemap returned too many URL entries");
  const documents = entries.map((_, element) => {
    const url = canonicalUrl($(element).find("loc").text());
    if (!url) return null;
    try {
      if (new URL(url).hostname !== "keskkonnaportaal.ee") return null;
    } catch {
      return null;
    }
    return normalizeDocument({
      sourceKey: "portal-sitemap",
      url,
      title: placeholderTitle(url),
      modifiedAt: cleanText($(element).find("lastmod").text()) || null,
      sourceTier: "official",
      quality: 1,
      metadata: { source_kind: "portal-sitemap", placeholder: true },
    });
  }).get().filter(Boolean);
  return { documents, entryCount: entries.length, rejectedCount: entries.length - documents.length };
}

export function parsePortalSitemap(xml) {
  return parsePortalSitemapPage(xml).documents;
}

// Official publishers other than the portal expose ordinary Drupal or
// WordPress sitemap indexes. Parsing them separately keeps the portal's host
// policy intact while letting the corpus cover the same public pages the
// reviewed source catalogue already cites.
export function parseOfficialSitemapDocument(xml) {
  const source = String(xml || "");
  if (!/<(?:urlset|sitemapindex)\b/iu.test(source)) {
    const $ = load(source);
    const links = $("a[href]").map((_, element) => {
      const value = $(element).attr("href");
      try {
        const url = canonicalCatalogueUrl(new URL(value, "https://keskkonnaharidus.ee/").toString());
        if (!url) return null;
        const parsedUrl = new URL(url);
        if (!OFFICIAL_HOSTS.has(parsedUrl.hostname)) return null;
        if (/^\/(?:en|ru|sv|fi|de|lv|lt)\//u.test(parsedUrl.pathname)) return null;
        return { url, lastmod: null };
      } catch {
        return null;
      }
    }).get().filter(Boolean);
    const entries = [...new Map(links.map((entry) => [entry.url, entry])).values()];
    return { indexUrls: [], entries, entryCount: links.length, rejectedCount: links.length - entries.length };
  }
  const $ = load(source, { xmlMode: true });
  const sitemapEntries = $("sitemap");
  const indexUrls = sitemapEntries.map((_, element) => {
    const value = cleanText($(element).find("loc").text());
    try {
      const url = new URL(value);
      return url.protocol === "https:" && OFFICIAL_HOSTS.has(url.hostname) ? url.toString() : null;
    } catch {
      return null;
    }
  }).get().filter(Boolean);
  const urlEntries = $("url");
  const entries = urlEntries.map((_, element) => {
    const value = cleanText($(element).find("loc").text());
    try {
      const url = canonicalCatalogueUrl(value);
      if (!url) return null;
      const parsedUrl = new URL(url);
      if (!OFFICIAL_HOSTS.has(parsedUrl.hostname)) return null;
      // Public search is Estonian-only. Other language trees are still
      // scrapeable, but indexing them would only add unreachable duplicates.
      if (/^\/(?:en|ru|sv|fi|de|lv|lt)\//u.test(parsedUrl.pathname)) return null;
      return { url, lastmod: cleanText($(element).find("lastmod").text()) || null };
    } catch {
      return null;
    }
  }).get().filter(Boolean);
  return {
    indexUrls,
    entries,
    entryCount: urlEntries.length,
    rejectedCount: urlEntries.length - entries.length,
  };
}

export function extractReadablePage(html, url) {
  const $ = load(String(html || ""));
  const root = $("main").first().length ? $("main").first().clone() : $("body").first().clone();
  // Only the publisher's metadata block is a date witness. Dates in article
  // prose, sitemap lastmod and our fetch clock are not page update dates.
  const dates = cleanText(root.find(".publication-date-author .card-item__date").first().text());
  const publishedAt = parsePortalDate(dates.match(/Avaldatud:\s*(\d{2}\.\d{2}\.\d{4})/iu)?.[1]);
  const updatedAt = parsePortalDate(dates.match(/Uuendatud:\s*(\d{2}\.\d{2}\.\d{4})/iu)?.[1]);
  const organization = boundedText(root.find(".publication-date-author .card-item__author a").first().text(), 200);
  // News can contain only a link to an external original. Comment controls
  // and nested related-news cards are not the missing article's evidence.
  root.find(".card-column-front,.kem-news--kem-content-page-block,.rating-card-section,.form-wrap,.kem-news__field-kem-topic,.card-item__info-wrapper").remove();
  root.find("script,style,noscript,svg,nav,header,footer,form,button,input,select,textarea,.breadcrumb,.pager,.eu-cookie-compliance-banner,.share_socials,.publication-date-author,.card-item__label--type,.kem-page__field-kem-topic").remove();
  const title = boundedText(root.find("h1").first().text() || $("title").text(), 500);
  root.find("h1").remove();
  const focused = root.find([
    ".field--name-body",
    ".field--name-field-kem-introduction",
    ".field--name-field-kem-content",
    ".layout-content",
    "article",
  ].join(","));
  const topLevel = focused.filter((_, element) => !$(element).parents().is(focused));
  // The selected nodes are serialised and read through the shared source text
  // extractor. It removes a `data-nosnippet` section, a hidden node, a script
  // body and the other non prose nodes there, so text the publisher excluded
  // from snippets can never become the copied body that snippets and model
  // evidence are built from.
  const contentHtml = (topLevel.length ? topLevel : root)
    .map((_, element) => $.html(element))
    .get()
    .join(" ");
  const content = boundedText(extractSourceText(contentHtml), 80_000);
  return { title: title || placeholderTitle(url), content, publishedAt, updatedAt, organization };
}

// An X-Robots-Tag is addressed to a crawler, and the published semantics scope a
// whole field value: "otherbot: noindex, nofollow" is otherbot's exclusion from
// end to end, while a value with no crawler prefix applies to every reader and a
// separate generic value keeps its own meaning. Reading the header as a bag of
// words turns another crawler's exclusion into ours.
const ROBOTS_HEADER_INSTANCE_LIMIT = 64;
const ROBOTS_HEADER_TEXT_LIMIT = 8_192;
const ROBOTS_SCOPE_PATTERN = /^([a-z0-9][a-z0-9._+-]{0,63})\s*:/u;
// A directive name before a colon is not a crawler name, so that value is read
// as generic directives. Treating an unreadable scope as someone else's would
// let a page through on a value nobody could attribute.
const ROBOTS_DIRECTIVE_NAMES = new Set([
  "all",
  "follow",
  "index",
  "indexifembedded",
  "max-image-preview",
  "max-snippet",
  "max-video-preview",
  "noarchive",
  "nofollow",
  "noimageindex",
  "noindex",
  "none",
  "nosnippet",
  "notranslate",
  "unavailable_after",
]);
const GENERIC_ROBOTS_SCOPES = new Set(["robots"]);

// The instances arrive as an array when the transport reported them separately,
// and as one string when a caller or a joined Headers object supplied them. A
// joined string cannot be split back into instances, so it is marked as such and
// read conservatively.
function robotsHeaderInstances(headerValue) {
  if (headerValue === undefined || headerValue === null || headerValue === "") {
    return { instances: [], joined: false };
  }
  if (Array.isArray(headerValue)) {
    return { instances: headerValue.map((value) => String(value ?? "")), joined: false };
  }
  if (typeof headerValue === "string") return { instances: [headerValue], joined: true };
  if (typeof headerValue?.get === "function") {
    const value = headerValue.get("x-robots-tag");
    return value === undefined || value === null
      ? { instances: [], joined: false }
      : { instances: [String(value)], joined: true };
  }
  if (typeof headerValue === "object") {
    return robotsHeaderInstances(headerValue["x-robots-tag"] ?? headerValue["X-Robots-Tag"]);
  }
  return { instances: [String(headerValue)], joined: true };
}

function robotsScopeOf(value, productName) {
  const text = cleanText(value).toLocaleLowerCase("en");
  const scoped = text.match(ROBOTS_SCOPE_PATTERN);
  if (!scoped) return { scope: "generic", directives: text };
  const name = scoped[1];
  const directives = text.slice(scoped[0].length);
  if (GENERIC_ROBOTS_SCOPES.has(name) || ROBOTS_DIRECTIVE_NAMES.has(name)) {
    // The prefix belongs to the directive grammar, not to a crawler, so the
    // whole value keeps its meaning for every reader.
    return { scope: "generic", directives: text };
  }
  if (productName && name === productName) return { scope: "product", directives };
  return { scope: "other", directives: "" };
}

function robotsDirectiveTokens(text) {
  return String(text || "").split(/[\s,;]+/u).filter(Boolean);
}

export function pageRobotsPolicy(html = "", headerValue = "", product = CRAWLER_PRODUCT) {
  const $ = load(String(html || ""));
  // A page can direct a directive at one reader by naming that reader's product
  // token in the meta tag, so the caller states which reader it is. The generic
  // "robots" name always applies, and the corpus keeps its own token by default.
  const productName = cleanText(product).toLocaleLowerCase("en");
  const { instances, joined } = robotsHeaderInstances(headerValue);
  const directives = [];
  let overflowed = false;
  let ambiguous = false;
  let scanned = 0;
  for (const [index, instance] of instances.entries()) {
    if (index >= ROBOTS_HEADER_INSTANCE_LIMIT || scanned + instance.length > ROBOTS_HEADER_TEXT_LIMIT) {
      // The header block outgrew what this reader will scan. Dropping the rest
      // would let an exclusion that arrived later pass unread, so the page is
      // treated as excluded instead of guessed at.
      overflowed = true;
      break;
    }
    scanned += instance.length;
    const { scope, directives: valueDirectives } = robotsScopeOf(instance, productName);
    if (scope !== "other") {
      directives.push(...robotsDirectiveTokens(valueDirectives));
      continue;
    }
    // The value is another crawler's. When the instances arrived separately that
    // is the whole answer: the exclusion is not ours to obey, and a directive
    // immediately after the scope belongs to that crawler. A joined string may
    // have merged a later generic value into this one, so an exclusion in a
    // later comma segment leaves the value ambiguous and the page excluded.
    if (joined && robotsDirectiveTokens(String(instance).split(",").slice(1).join(" "))
      .some((directive) => directive === "noindex" || directive === "none")) {
      ambiguous = true;
    }
  }
  directives.push(...$("meta[name]").map((_, element) => {
    const name = cleanText($(element).attr("name")).toLocaleLowerCase("en");
    return name === "robots" || (productName && name === productName)
      ? robotsDirectiveTokens(cleanText($(element).attr("content")).toLocaleLowerCase("en"))
      : [];
  }).get().flat());
  return {
    noindex: overflowed || ambiguous
      || directives.includes("noindex")
      || directives.includes("none"),
    directives: [...new Set(directives)],
    ...(overflowed ? { truncated: true } : {}),
    ...(ambiguous ? { ambiguous: true } : {}),
  };
}
