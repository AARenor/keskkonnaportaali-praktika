// Regression: public source discovery settles robots.txt for the URL it was
// given, then hands the read to the HTTPS transport, which may follow a redirect
// to the publisher's www host. server/corpus.mjs installs the redirect robots gate
// for page hydration only (hydrateUrls passes assertRedirectAllowed into
// fetchCorpusText), so the discovery readers (fetchPortalSearchPage at
// server/corpus.mjs:1983, crawlPortalSitemap at :2097, crawlOfficialSitemap at
// :2060) request a redirect destination before that destination's own robots.txt
// has been read. A destination the destination origin disallows is therefore
// fetched, parsed and offered as a portal search result.
//
// Harness. No database, no container, no network: node:https.request is replaced
// by a synthetic transport before server/corpus.mjs is imported, so every robots
// read, search read and redirect hop runs through the real
// requestApprovedPublicHttpsText redirect loop, the real origin allowlist and the
// real fetchCorpusText retry, byte and robots-cache policy. Routes are matched by
// predicate, so no test depends on the exact query parameters production builds.
// The consumer under test is livePortalSearchResults, the exported portal search
// reader that shares fetchPortalSearchPage with catalog discovery
// (crawlPortalSearch). The sibling sitemap readers carry the same missing gate at
// their own fetchCorpusText calls, but they are reachable only through
// syncPortalCorpus, which needs the database, so this file pins the shared portal
// search reader and the gate contract every discovery read has to satisfy.
//
// Phase one: the search endpoint answers 302 to a www page that the www origin's
// own robots.txt disallows. The discovery reader must read that policy and refuse
// before the transport connects to the disallowed destination.
//
// Phase two: the same 302 shape to a page the very same policy allows is still
// read and still yields its card, so the fix may not replace the missing gate
// with a blanket refusal of every redirect.
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const PORTAL_ORIGIN = "https://keskkonnaportaal.ee";
const PORTAL_WWW_ORIGIN = "https://www.keskkonnaportaal.ee";
const PORTAL_SEARCH_URL = `${PORTAL_ORIGIN}/et/search`;
const PORTAL_ROBOTS_URL = `${PORTAL_ORIGIN}/robots.txt`;
const DESTINATION_ROBOTS_URL = `${PORTAL_WWW_ORIGIN}/robots.txt`;
const DENIED_DESTINATION_URL = `${PORTAL_WWW_ORIGIN}/et/keelatud-sihtkoht/tulemused`;
const DENIED_DESTINATION_CARD_URL = `${DENIED_DESTINATION_URL}/leht`;
const ALLOWED_DESTINATION_URL = `${PORTAL_WWW_ORIGIN}/et/lubatud-sihtkoht/tulemused`;
const ALLOWED_DESTINATION_CARD_URL = `${ALLOWED_DESTINATION_URL}/leht`;
const DESTINATION_ROBOTS_BODY = "User-agent: *\nDisallow: /et/keelatud-sihtkoht\n";
const PORTAL_ROBOTS_BODY = "User-agent: *\nAllow: /\n";
// A reviewed public query that minimizePublicProviderQuery returns unchanged
// (tests/public-search.test.mjs asserts that identity), so this file never
// depends on the provider minimizer accepting a query of its own invention.
const DISCOVERY_QUERY = "Metsamaa pindala Eestis omanike kaupa";
const CORPUS_MODULE_URL = new URL("../server/corpus.mjs", import.meta.url).href;

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

// The corpus transport uses node:https directly. Replacing that function keeps
// every robots.txt, search page and redirect hop in memory: an unrouted URL gets
// a 404 and is recorded, so a harness drift cannot hide behind a silent failure.
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
  const resolveRoute = (href) => {
    for (const route of routes) {
      if (route.matches(href)) return route.spec;
    }
    unroutedUrls.push(href);
    return notFound;
  };
  httpsModule.request = (target, _options, callback) => {
    const href = String(target);
    requestedUrls.push(href);
    const request = new EventEmitter();
    request.destroy = (error) => {
      if (error) request.emit("error", error);
    };
    request.end = () => {
      const spec = resolveRoute(href);
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

test("portal search discovery reads the redirect destination's own robots.txt before the destination is requested", { timeout: 60_000 }, async (t) => {
  const transport = installSyntheticPortalTransport();
  try {
    const corpus = await import(CORPUS_MODULE_URL);

    // Phase one: a disallowed redirect destination.
    transport.route((href) => href === PORTAL_ROBOTS_URL, {
      status: 200,
      contentType: "text/plain",
      body: PORTAL_ROBOTS_BODY,
    });
    transport.route((href) => href === DESTINATION_ROBOTS_URL, {
      status: 200,
      contentType: "text/plain",
      body: DESTINATION_ROBOTS_BODY,
    });
    transport.route((href) => href.startsWith(`${PORTAL_SEARCH_URL}?`), {
      status: 302,
      location: DENIED_DESTINATION_URL,
    });
    transport.route((href) => href === DENIED_DESTINATION_URL, {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: portalSearchPage({
        total: 1,
        cardUrl: DENIED_DESTINATION_CARD_URL,
        title: "Keelatud sihtkoha tulemus",
        summary: "See lehekülg asub aadressil, mille enda robots.txt keelab selle lugemise, seega ei tohi seda pärida ega tulemusena näidata.",
      }),
    });

    const denied = await corpus.livePortalSearchResults(DISCOVERY_QUERY);
    const firstPass = [...transport.requestedUrls];
    t.diagnostic(`phase one requests: ${firstPass.join(" | ")}`);

    const searchIndex = firstPass.findIndex((href) => href.startsWith(`${PORTAL_SEARCH_URL}?`));
    assert.ok(searchIndex >= 0, "the portal search endpoint itself is requested, so this phase exercises the discovery reader");
    assert.ok(
      firstPass.indexOf(PORTAL_ROBOTS_URL) >= 0 && firstPass.indexOf(PORTAL_ROBOTS_URL) < searchIndex,
      "the search endpoint's own origin policy is read before the search endpoint",
    );
    assert.deepEqual(transport.unroutedUrls, [], "every synthetic request is served by a stated route, so no 404 stands in for the regression");
    assert.ok(
      !firstPass.includes(DENIED_DESTINATION_URL),
      "a redirect destination its own robots.txt disallows must never be requested: fetchPortalSearchPage must pass assertRedirectAllowed into fetchCorpusText, as hydrateUrls already does",
    );
    assert.ok(
      firstPass.includes(DESTINATION_ROBOTS_URL),
      "the destination origin's own robots.txt is read before the redirect is followed",
    );
    assert.deepEqual(
      firstPass.filter((href) => href.startsWith(`${PORTAL_WWW_ORIGIN}/`) && href !== DESTINATION_ROBOTS_URL),
      [],
      "no www destination is requested while that origin's policy is still unknown",
    );
    assert.ok(
      denied.status !== "degraded" || denied.items.length === 0,
      "a search whose redirect destination is disallowed yields no portal result set",
    );
    assert.equal(denied.total, 0, "the refused search reports no results");
    assert.deepEqual(denied.items.map((item) => item.url), [], "the disallowed destination never becomes a public search result");

    // Phase two: the same redirect shape, to a destination the same policy
    // allows. The refusal above must not be a blanket refusal of redirects.
    transport.reset();
    transport.route((href) => href === PORTAL_ROBOTS_URL, {
      status: 200,
      contentType: "text/plain",
      body: PORTAL_ROBOTS_BODY,
    });
    transport.route((href) => href === DESTINATION_ROBOTS_URL, {
      status: 200,
      contentType: "text/plain",
      body: DESTINATION_ROBOTS_BODY,
    });
    transport.route((href) => href.startsWith(`${PORTAL_SEARCH_URL}?`), {
      status: 301,
      location: ALLOWED_DESTINATION_URL,
    });
    transport.route((href) => href === ALLOWED_DESTINATION_URL, {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: portalSearchPage({
        total: 1,
        cardUrl: ALLOWED_DESTINATION_CARD_URL,
        title: "Lubatud sihtkoha tulemus",
        summary: "See lehekülg asub aadressil, mille enda robots.txt lubab selle lugemise, seega võib seda pärida ja tulemusena näidata.",
      }),
    });

    const allowed = await corpus.livePortalSearchResults(DISCOVERY_QUERY);
    const secondPass = [...transport.requestedUrls];
    t.diagnostic(`phase two requests: ${secondPass.join(" | ")}`);

    assert.deepEqual(transport.unroutedUrls, [], "the control phase is served entirely by stated routes");
    assert.ok(
      secondPass.includes(ALLOWED_DESTINATION_URL),
      "an approved redirect to a destination its own robots.txt allows is still followed",
    );
    assert.ok(!secondPass.includes(DENIED_DESTINATION_URL), "the control phase never contacts the disallowed destination");
    assert.equal(allowed.status, "degraded", "the allowed redirect still yields the live portal result set");
    assert.equal(allowed.total, 1, "the allowed destination's result count is reported");
    assert.deepEqual(
      allowed.items.map((item) => item.url),
      [ALLOWED_DESTINATION_CARD_URL],
      "the allowed destination's card is still offered as a public search result",
    );
  } finally {
    transport.restore();
  }
});
