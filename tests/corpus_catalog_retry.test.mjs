import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const PORTAL_ORIGIN = "https://keskkonnaportaal.ee";
const PORTAL_SEARCH_URL = `${PORTAL_ORIGIN}/et/search`;
const PORTAL_ROBOTS_URL = `${PORTAL_ORIGIN}/robots.txt`;
const CORPUS_FETCH_MODULE_URL = new URL("../server/corpus_fetch.mjs", import.meta.url).href;

function portalSearchPage({ total, cardUrl, title, summary }) {
  return "<!doctype html><html lang=\"et\"><head><title>Otsing</title></head><body><main>"
    + `<p>Tulemused otsingule (${total})</p>`
    + "<div class=\"search-results__item-wrap\"><div class=\"search-results__item\">"
    + `<a href="${cardUrl}">${title}</a>`
    + `<span class="search-results__title">${title}</span>`
    + "<span class=\"search-results__category\">Uudis</span>"
    + "<span class=\"search-results__date\">01.10.2026</span>"
    + `<p class="search-results__text">${summary}</p>`
    + "<span class=\"search-results__author\">Keskkonnaagentuur</span>"
    + "</div></div></main></body></html>";
}

function installSyntheticPortalTransport() {
  const httpsModule = require("node:https");
  const originalRequest = httpsModule.request;
  const routes = [];
  const requestedUrls = [];
  const unroutedUrls = [];
  const notFound = Object.freeze({
    status: 404,
    contentType: "text/html; charset=utf-8",
    body: "<html><body><p>Puudub</p></body></html>",
  });
  httpsModule.request = (target, _options, callback) => {
    const href = String(target);
    requestedUrls.push(href);
    const route = routes.find((candidate) => candidate.matches(href));
    if (!route) unroutedUrls.push(href);
    const spec = route?.spec || notFound;
    const request = new EventEmitter();
    request.destroy = (error) => {
      if (error) request.emit("error", error);
    };
    request.end = () => {
      setImmediate(() => {
        const incoming = new EventEmitter();
        incoming.statusCode = spec.status;
        incoming.headers = {
          "content-type": spec.contentType,
          ...(spec.location ? { location: spec.location } : {}),
        };
        incoming.destroy = () => incoming.emit("close");
        callback(incoming);
        setImmediate(() => {
          incoming.emit("data", Buffer.from(spec.body || "", "utf8"));
          incoming.emit("end");
        });
      });
    };
    return request;
  };
  return {
    requestedUrls,
    unroutedUrls,
    route(matches, spec) {
      routes.push({ matches, spec });
    },
    reset() {
      routes.length = 0;
      requestedUrls.length = 0;
      unroutedUrls.length = 0;
    },
    restore() {
      httpsModule.request = originalRequest;
    },
  };
}

test("portal catalog retries one inconsistent result page and then fails closed", { timeout: 60_000 }, async () => {
  const transport = installSyntheticPortalTransport();
  try {
    const { crawlPortalSearch } = await import(CORPUS_FETCH_MODULE_URL);
    const query = "Metsa seire taastamine";
    const cardUrl = `${PORTAL_ORIGIN}/et/metsa-seire`;
    const validPage = portalSearchPage({
      total: 1,
      cardUrl,
      title: "Metsa seire",
      summary: "Ametlik kokkuvõte metsade seisundist.",
    });
    const inconsistentPage = portalSearchPage({
      total: 0,
      cardUrl,
      title: "Metsa seire",
      summary: "Ametlik kokkuvõte metsade seisundist.",
    });
    let searchReads = 0;
    transport.route((href) => href === PORTAL_ROBOTS_URL, {
      status: 200,
      contentType: "text/plain",
      body: "User-agent: *\nAllow: /\n",
    });
    transport.route((href) => href.startsWith(`${PORTAL_SEARCH_URL}?`) && ++searchReads === 1, {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: inconsistentPage,
    });
    transport.route((href) => href.startsWith(`${PORTAL_SEARCH_URL}?`), {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: validPage,
    });
    const documents = [];
    const result = await crawlPortalSearch(query, async (pageDocuments) => {
      documents.push(...pageDocuments);
    }, { retryDelayMs: 0 });
    assert.equal(searchReads, 2, JSON.stringify({ requestedUrls: transport.requestedUrls, unroutedUrls: transport.unroutedUrls }));
    assert.equal(result.total, 1);
    assert.equal(documents.length, 1);
    assert.equal(documents[0].url, cardUrl);

    transport.reset();
    searchReads = 0;
    transport.route((href) => href.startsWith(`${PORTAL_SEARCH_URL}?`) && ++searchReads >= 1, {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: inconsistentPage,
    });
    await assert.rejects(
      crawlPortalSearch(query, async () => {}, { retryDelayMs: 0 }),
      (error) => error?.code === "CORPUS_PORTAL_SEARCH_UNAVAILABLE",
    );
    assert.equal(searchReads, 2);
  } finally {
    transport.restore();
  }
});

test("portal discovery treats only source availability failures as recoverable", async () => {
  const { isRecoverablePortalSearchError } = await import(CORPUS_FETCH_MODULE_URL);
  assert.equal(typeof isRecoverablePortalSearchError, "function");
  const coded = (code) => Object.assign(new Error("fixture"), { code });
  assert.equal(isRecoverablePortalSearchError(coded("CORPUS_PORTAL_SEARCH_UNAVAILABLE")), true);
  assert.equal(isRecoverablePortalSearchError(coded("CORPUS_ROBOTS_DISALLOWED")), true);
  assert.equal(isRecoverablePortalSearchError(new Error("Corpus source returned 503")), true);
  assert.equal(isRecoverablePortalSearchError(new Error("Portal search returned an inconsistent result count")), false);
  assert.equal(isRecoverablePortalSearchError(new Error("socket timeout")), false);
});

