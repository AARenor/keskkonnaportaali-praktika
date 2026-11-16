import {
  requestApprovedPublicHttpsText,
  validateApprovedPublicHttpsUrl,
} from "./public-https.mjs";
import {
  boundedText,
  canonicalUrl,
  corpusOriginsForUrl,
  CORPUS_HTTPS_ORIGINS,
  MAX_PORTAL_CATALOG_PAGES,
  MAX_PORTAL_CATALOG_TOTAL,
  MAX_ROBOTS_BYTES,
  normalizeDocument,
  parseOfficialSitemapDocument,
  parsePortalSearchPage,
  parsePortalSitemapPage,
  parseRobotsTxt,
  placeholderTitle,
  robotsAllowsUrl,
  SITEMAP_PAGE_SIZE,
  PORTAL_BASE,
  PORTAL_PAGE_SIZE,
} from "./corpus_document_parsing.mjs";
import { throwIfCorpusAborted } from "./corpus_storage.mjs";
import { summarizeUrlOccurrences } from "./corpus_query.mjs";

const PORTAL_SEARCH = `${PORTAL_BASE}/et/search`;
const PORTAL_SITEMAP = `${PORTAL_BASE}/et/sitemap.xml`;
export const MAX_FETCH_BYTES = 4_000_000;
const MAX_SITEMAP_PAGES = 20;
// Scrapeable public sources. Every root is fetched through the same
// robots-aware HTTPS boundary as hydration; a publisher that blocks the
// crawler or returns no sitemap is skipped without failing the whole run.
export const OFFICIAL_SITEMAP_SOURCES = Object.freeze([
  { url: "https://keskkonnaagentuur.ee/sitemap.xml", sourceKey: "official-sitemap" },
  { url: "https://keskkonnaamet.ee/sitemap.xml", sourceKey: "official-sitemap" },
  { url: "https://kliimaministeerium.ee/sitemap.xml", sourceKey: "official-sitemap" },
  { url: "https://rmk.ee/wp-sitemap.xml", sourceKey: "official-sitemap" },
  { url: "https://www.ilmateenistus.ee/sitemap_index.xml", sourceKey: "official-sitemap" },
  { url: "https://terviseamet.ee/sitemap.xml", sourceKey: "official-sitemap" },
  { url: "https://keskkonnaharidus.ee/et/sitemap", sourceKey: "official-sitemap" },
  { url: "https://kik.ee/sitemap.xml", sourceKey: "official-sitemap" },
]);
const MAX_OFFICIAL_SITEMAP_DOCUMENTS = 50_000;
const MAX_OFFICIAL_SITEMAP_PAGES = 80;
const ROBOTS_CACHE_MS = 60 * 60 * 1_000;
const WIKIPEDIA_TITLES = [
  "Mets",
  "Eesti metsad",
  "Metsandus",
  "Metsa inventeerimine",
  "Looduskaitse",
  "Elurikkus",
  "Kliimamuutus",
  "Keskkond",
];
const hostRobotsCache = new Map();
// A publisher may repeat a header instead of listing every directive in one
// value, and each instance carries its own crawler scope, so the transport
// hands every instance on in the shape it arrived in. Bounding happens once, in
// the policy reader, which fails closed rather than dropping a directive that
// arrived after a cut.
function transportHeaderValues(headers, name) {
  if (!headers) return [];
  if (typeof headers.get === "function") {
    const value = headers.get(name);
    return value === undefined || value === null ? [] : [String(value)];
  }
  const value = headers[name] ?? headers[String(name).toLocaleLowerCase("en-US")];
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? ""));
  return value === undefined || value === null ? [] : [String(value)];
}

function transportHeaderValue(headers, name) {
  const values = transportHeaderValues(headers, name);
  return values.length ? values[0] : "";
}

export async function fetchCorpusText(url, {
  timeoutMs = 15_000,
  retries = 2,
  accept = "text/html,application/xhtml+xml,application/xml,text/xml",
  maximumBytes = MAX_FETCH_BYTES,
  requestText = requestApprovedPublicHttpsText,
  lookupImpl,
  requestImpl,
  assertRedirectAllowed,
  // The robots gate has to tell a policy file that does not exist from one it was
  // not allowed to read, and only the status and the address that answered can
  // do that. Everything else keeps the plain failure it already had.
  reportFailureStatus = false,
} = {}) {
  const requestedUrl = validateApprovedPublicHttpsUrl(url, CORPUS_HTTPS_ORIGINS).toString();
  const approvedOrigins = corpusOriginsForUrl(requestedUrl);
  const byteLimit = Math.max(1_024, Math.min(
    Math.trunc(Number(maximumBytes) || MAX_FETCH_BYTES),
    MAX_FETCH_BYTES,
  ));
  const maximumRetries = Math.max(0, Math.min(Number.isFinite(Number(retries)) ? Math.trunc(Number(retries)) : 2, 3));
  let lastError;
  for (let attempt = 0; attempt <= maximumRetries; attempt += 1) {
    const controller = new AbortController();
    const boundedTimeoutMs = Math.max(250, Math.min(Number(timeoutMs) || 15_000, 30_000));
    const timer = setTimeout(() => controller.abort(), boundedTimeoutMs);
    try {
      const response = await requestText(requestedUrl, {
        approvedOrigins,
        headers: {
          Accept: accept,
          "Accept-Encoding": "identity",
          "User-Agent": "Keskkonnaportaali-praktika-corpus/1.0 (+https://praktika.arle.top)",
        },
        signal: controller.signal,
        maximumBytes: byteLimit,
        maximumRedirects: 3,
        lookupImpl,
        requestImpl,
        assertRedirectAllowed,
      });
      if (response.status < 200 || response.status >= 300) {
        const error = new Error(`Corpus source returned ${response.status}`);
        // The message stays the same for every caller; the annotated fields are
        // read only where a status is itself an answer.
        if (reportFailureStatus) {
          error.status = response.status;
          error.finalUrl = String(response.url || requestedUrl);
        }
        throw error;
      }
      const finalUrl = validateApprovedPublicHttpsUrl(
        response.url || requestedUrl,
        approvedOrigins,
      ).toString();
      const body = String(response.body || "");
      if (Buffer.byteLength(body, "utf8") > byteLimit) {
        throw new Error("Corpus source response is too large");
      }
      const robotsTags = transportHeaderValues(response.headers, "x-robots-tag");
      return {
        text: body,
        contentType: transportHeaderValue(response.headers, "content-type").slice(0, 240),
        // The first instance keeps the scalar shape older callers read; the
        // policy reader takes every instance.
        robotsTag: robotsTags.length ? robotsTags[0] : "",
        robotsTags,
        finalUrl,
      };
    } catch (error) {
      lastError = error;
      // A publisher's refusal is an answer, not a transient transport failure,
      // so asking again would only knock on the same closed door.
      if (error?.code === "CORPUS_ROBOTS_DISALLOWED") break;
      if (attempt < maximumRetries) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function robotsDisallowedCorpusError() {
  const error = new Error("Corpus source is disallowed by robots.txt");
  error.code = "CORPUS_ROBOTS_DISALLOWED";
  return error;
}

// Only an answer carried by the origin itself can say that this origin has no
// policy file, so the address is settled before the status is read: another
// origin's 404 or 410, a refusal, a rate limit or a server error all leave the
// policy unestablished, and a page whose policy is unknown is not read.
function reportsAbsentRobotsPolicy(error, origin) {
  let answeredOrigin = "";
  try {
    answeredOrigin = new URL(String(error?.finalUrl || "")).origin;
  } catch {
    answeredOrigin = "";
  }
  if (!answeredOrigin || answeredOrigin !== origin) return false;
  const status = Number(error?.status) || 0;
  return status === 404 || status === 410;
}

export async function assertPortalRobotsAllowed(url, {
  signal,
  requestText,
  lookupImpl,
  requestImpl,
} = {}) {
  throwIfCorpusAborted(signal);
  const target = new URL(url);
  const robotsUrl = `${target.origin}/robots.txt`;
  const cached = hostRobotsCache.get(target.origin);
  if (!cached || Date.now() - cached.fetchedAt >= ROBOTS_CACHE_MS) {
    const entry = { promise: null, fetchedAt: 0 };
    // The policy file decides which pages may be requested, so its own read
    // carries no redirect gate: gating it would recurse into the answer it is
    // meant to establish. The shared entry carries no caller abort signal
    // either, because one caller that disconnects must not fail the answer every
    // other caller waits on; each waiter rechecks its own signal below.
    entry.promise = fetchCorpusText(robotsUrl, {
      accept: "text/plain",
      retries: 1,
      maximumBytes: MAX_ROBOTS_BYTES,
      requestText,
      lookupImpl,
      requestImpl,
      reportFailureStatus: true,
    }).then((response) => {
      // The transport approves the www counterpart of an origin, so a publisher
      // can answer through its other host name. Those rules belong to whoever
      // answered, not to the origin asked about, so bind the answer to the
      // queried origin before parsing or caching anything.
      const finalOrigin = new URL(response.finalUrl).origin;
      if (finalOrigin !== target.origin) {
        throw new Error("Robots answer is not bound to the requested origin");
      }
      entry.fetchedAt = Date.now();
      return parseRobotsTxt(response.text);
    }, (error) => {
      // A policy file that the origin itself reports as absent states that there
      // is no rule to obey, so the pages behind it stay readable, exactly as a
      // served empty policy leaves them. That verdict is cached like a served
      // answer because it is equally true for the next page on this origin;
      // every other answer still refuses the page and evicts the entry below.
      if (!reportsAbsentRobotsPolicy(error, target.origin)) throw error;
      entry.fetchedAt = Date.now();
      return [];
    }).catch((error) => {
      hostRobotsCache.delete(target.origin);
      throw error;
    });
    hostRobotsCache.set(target.origin, entry);
  }
  const rules = await hostRobotsCache.get(target.origin).promise;
  throwIfCorpusAborted(signal);
  if (!robotsAllowsUrl(url, rules)) {
    throw robotsDisallowedCorpusError();
  }
}

// Every robot-checked read hands the transport the same problem: it may follow an
// approved same-resource redirect from the publisher's bare host to its www
// counterpart, and the destination origin's own policy decides whether that
// address may be read. The gate settles that policy before the destination is
// requested. Robots reads never carry this gate themselves, so the check cannot
// recurse into the answer it is meant to establish.
export const portalRobotsRedirectGate = (destination, context) => assertPortalRobotsAllowed(destination, {
  signal: context?.signal,
});

function portalSearchUrl(query, page, pageSize = PORTAL_PAGE_SIZE) {
  const url = new URL(PORTAL_SEARCH);
  if (query) url.searchParams.set("search_api_fulltext", query);
  url.searchParams.set("items_per_page", String(pageSize));
  if (page > 0) url.searchParams.set("page", String(page));
  return url.toString();
}

export async function fetchPortalSearchPage(query, page, pageSize = PORTAL_PAGE_SIZE) {
  const url = portalSearchUrl(query, page, pageSize);
  await assertPortalRobotsAllowed(url);
  const response = await fetchCorpusText(url, { assertRedirectAllowed: portalRobotsRedirectGate });
  return parsePortalSearchPage(response.text, response.finalUrl);
}

export async function crawlPortalSearch(query, onDocuments, { concurrency = 2, delayMs = 120 } = {}) {
  const first = await fetchPortalSearchPage(query, 0);
  if ((!query && first.total === 0) || (first.total > 0 && first.documents.length === 0)) {
    throw new Error("Portal search returned an incomplete first page");
  }
  if ((first.total === 0 && first.documents.length > 0) || first.documents.length > first.total) {
    throw new Error("Portal search returned an inconsistent result count");
  }
  await onDocuments(first.documents, 0);
  const orderedUrls = first.documents.map((document) => document.url);
  const seenUrls = new Set(orderedUrls);
  const pages = Math.max(1, Math.ceil(first.total / PORTAL_PAGE_SIZE));
  if (pages > MAX_PORTAL_CATALOG_PAGES) {
    throw new Error("Portal search exceeds the configured page limit");
  }
  const boundedConcurrency = Math.max(1, Math.min(Number(concurrency) || 2, 4));
  let repeatedPages = 0;
  for (let offset = 1; offset < pages; offset += boundedConcurrency) {
    const pageNumbers = [];
    for (let page = offset; page < Math.min(pages, offset + boundedConcurrency); page += 1) {
      pageNumbers.push(page);
    }
    const results = await Promise.all(pageNumbers.map((page) => fetchPortalSearchPage(query, page)));
    let stopPaging = false;
    for (const [index, result] of results.entries()) {
      if (pageNumbers[index] * PORTAL_PAGE_SIZE < first.total && result.documents.length === 0) {
        throw new Error("Portal search returned an incomplete result page");
      }
      if (orderedUrls.length + result.documents.length > MAX_PORTAL_CATALOG_TOTAL) {
        throw new Error("Portal search exceeds the configured document limit");
      }
      const pageUrls = result.documents.map((document) => document.url);
      if (pageUrls.length && pageUrls.every((url) => seenUrls.has(url))) {
        // The portal repeats result pages once it runs out of fresh content
        // (observed on the empty-query catalogue crawl). Treat the first
        // fully repeated page as end-of-results instead of failing the whole
        // sync and discarding the refresh; further pages would only repeat.
        repeatedPages += 1;
        stopPaging = true;
        break;
      }
      await onDocuments(result.documents, pageNumbers[index]);
      orderedUrls.push(...pageUrls);
      for (const url of pageUrls) seenUrls.add(url);
    }
    if (stopPaging) break;
    if (offset + boundedConcurrency < pages && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  const summary = summarizeUrlOccurrences(orderedUrls);
  return {
    total: first.total,
    pages,
    repeatedPages,
    orderedUrls: summary.occurrences,
    distinctUrls: summary.distinctUrls,
  };
}

export async function crawlOfficialSitemap({ url, sourceKey, delayMs = 120 } = {}) {
  const documents = [];
  const seenUrls = new Set();
  const seenSitemaps = new Set();
  const queue = [url];
  let pages = 0;
  while (queue.length) {
    if (pages >= MAX_OFFICIAL_SITEMAP_PAGES) throw new Error("Official sitemap exceeds the configured page limit");
    if (documents.length >= MAX_OFFICIAL_SITEMAP_DOCUMENTS) throw new Error("Official sitemap exceeds the configured document limit");
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);
    await assertPortalRobotsAllowed(sitemapUrl);
    const response = await fetchCorpusText(sitemapUrl, {
      accept: "application/xml, text/xml",
      assertRedirectAllowed: portalRobotsRedirectGate,
    });
    const parsed = parseOfficialSitemapDocument(response.text);
    pages += 1;
    if (parsed.indexUrls.length) {
      queue.push(...parsed.indexUrls.filter((child) => !seenSitemaps.has(child)).slice(0, MAX_OFFICIAL_SITEMAP_PAGES));
      continue;
    }
    if (!parsed.entries.length) {
      if (pages === 1) throw new Error("Official sitemap returned no usable URLs");
      continue;
    }
    for (const entry of parsed.entries) {
      if (seenUrls.has(entry.url)) continue;
      seenUrls.add(entry.url);
      if (documents.length >= MAX_OFFICIAL_SITEMAP_DOCUMENTS) break;
      documents.push(normalizeDocument({
        sourceKey,
        url: entry.url,
        title: placeholderTitle(entry.url),
        modifiedAt: entry.lastmod,
        sourceTier: "official",
        quality: 1,
        metadata: { source_kind: "official-sitemap", placeholder: true },
      }));
    }
    if (delayMs > 0 && queue.length) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { documents, pages, sitemaps: seenSitemaps.size };
}

export async function crawlPortalSitemap({ delayMs = 120 } = {}) {
  const documents = [];
  const seenUrls = new Set();
  let pages = 0;
  for (let page = 1; page <= MAX_SITEMAP_PAGES; page += 1) {
    const url = `${PORTAL_SITEMAP}?page=${page}`;
    await assertPortalRobotsAllowed(url);
    const response = await fetchCorpusText(url, { assertRedirectAllowed: portalRobotsRedirectGate });
    const parsedPage = parsePortalSitemapPage(response.text);
    const pageDocuments = parsedPage.documents;
    if (parsedPage.rejectedCount > 0) {
      throw new Error("Portal sitemap contains a URL outside its approved host policy");
    }
    if (pageDocuments.length === 0) {
      throw new Error("Portal sitemap returned an empty or unparseable page");
    }
    if (pageDocuments.every((document) => seenUrls.has(document.url))) {
      throw new Error("Portal sitemap repeated a complete page");
    }
    if (documents.length + pageDocuments.length > MAX_SITEMAP_PAGES * SITEMAP_PAGE_SIZE) {
      throw new Error("Portal sitemap exceeds the configured document limit");
    }
    documents.push(...pageDocuments);
    for (const document of pageDocuments) seenUrls.add(document.url);
    pages = page;
    if (pageDocuments.length < SITEMAP_PAGE_SIZE) break;
    if (page === MAX_SITEMAP_PAGES) {
      throw new Error("Portal sitemap exceeds the configured safety page limit");
    }
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { documents, pages };
}

export async function wikipediaDocuments() {
  // MediaWiki limits whole-article extracts to one page per request even when
  // several titles are supplied. Fetch the small curated set separately so a
  // continuation token cannot silently drop seven of the eight references.
  const responses = await Promise.allSettled(WIKIPEDIA_TITLES.map(async (title) => {
    const url = new URL("https://et.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("prop", "extracts|info");
    url.searchParams.set("explaintext", "1");
    url.searchParams.set("exsectionformat", "plain");
    url.searchParams.set("inprop", "url");
    url.searchParams.set("redirects", "1");
    url.searchParams.set("titles", title);
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("format", "json");
    const response = await fetchCorpusText(url.toString(), { accept: "application/json", retries: 1 });
    const page = JSON.parse(response.text)?.query?.pages?.[0];
    const pageUrl = canonicalUrl(page?.fullurl || `https://et.wikipedia.org/wiki/${encodeURIComponent(page?.title || title)}`);
    if (!page || page.missing || !pageUrl || !page.extract) return null;
    return normalizeDocument({
      sourceKey: "wikipedia-et",
      externalId: String(page.pageid),
      url: pageUrl,
      title: page.title,
      summary: boundedText(page.extract, 700),
      content: boundedText(page.extract, 50_000),
      category: "Taustteadmine",
      organization: "Vikipeedia",
      topics: ["taustallikas"],
      sourceTier: "supplementary",
      quality: 2,
      metadata: { source_kind: "mediawiki-api", page_id: page.pageid },
    });
  }));
  return responses.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
}
