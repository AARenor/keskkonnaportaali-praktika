// Publisher policy on the live answer path.
//
// The background corpus (server/corpus.mjs) checks a publisher's robots.txt and
// the page's own robots policy (HTML meta and X-Robots-Tag) before it keeps any
// text. The live answer path (server/integrations.mjs sharedHydration ->
// fetchCached -> hydrateOfficialDocuments) reads the same approved pages again,
// caches their body and can promote an eligible catalogue entry to fresh
// versioned answer evidence. These tests lock the same publisher policy on that
// live path: a robots.txt disallowed page is not requested, and an excluded
// response is not cached, not cited and not promoted to model evidence.
//
// The noindex expectations are this application's own decision, not a general
// robots contract: a noindex page is often readable and quotable, and we elect
// not to use it as answer evidence. A noindex response therefore has to leave
// the response cache untouched, because a cached copy is what a later answer
// would cite.
//
// An X-Robots-Tag is addressed to a crawler, so its scope is part of the
// directive. A directive written for another crawler says nothing about this
// reader, while a directive that names no crawler applies to every reader and
// one that names this reader applies to it. Reading the header as a bag of
// words loses that distinction and turns someone else's exclusion into ours.
// This reader announces one product token in its User-Agent header, so the
// scoped cases below take the token from that header instead of pinning it.
//
// The robots.txt answer itself is read before any page. Only 404 and 410 state
// that the origin has no policy file. Every other non 2xx answer, 400, 401,
// 403, 407, 429, 451 and 5xx included, leaves the policy unestablished, so the
// page is not read at all. When the policy cannot be established, page text
// that an earlier answer read from the page is demoted to a route only card,
// while catalogue text that a reviewed producer wrote is kept, because robots
// governs fetching a page and not our own review of the publisher.
//
// The policy must also come from the origin that was asked. An answer that
// arrives from a different host, even another approved publisher, is not this
// publisher's policy, so the page stays unread and the entry is treated as an
// unknown policy rather than as a publisher exclusion. That binding is checked
// before the status is interpreted, so a 404 or 410 delivered by another origin
// never reads as this origin having no policy file.
//
// Everything here is synthetic: stub transport, harmless HTML, no network. The
// robots policy must be resolved through the injected transport option
// (requestText), which is how every other upstream read in this project is
// stubbed.

import assert from "node:assert/strict";
import test from "node:test";
import { hydrateOfficialDocuments, officialHydrationStats } from "../server/integrations.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";

const FORBIDDEN_TEXT = "FORBIDDEN_PAGE_TEXT";
const ALLOWED_TEXT = "ALLOWED_PAGE_TEXT";
const PAGE_READ_TEXT = "PAGE_READ_TEXT varem loetud lehesisu";
const REVIEWED_TEXT = "REVIEWED_TEXT kataloogis ule vaadatud tekst";
const CURATED_TEXT = "CURATED_TEXT kureeritud kataloogitekst";
const FILLER = "kontrollitud ametlik lehesisu ".repeat(12);
const DAY_MS = 24 * 60 * 60 * 1_000;

function pageBody(sentinel, { robotsMeta = "" } = {}) {
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    `<title>Ametlik leht ${sentinel}</title>`,
    robotsMeta,
    "</head><body><main><article>",
    `<p>${sentinel} ${FILLER}</p>`,
    "</article></main></body></html>",
  ].join("");
}

// A catalogue entry that an adapter already validated, but whose citable body
// only exists once the live answer path reads the page. This is the shape that
// takes the promotion branch inside hydrateOfficialDocuments.
function eligibleCatalogueDocument(url, index) {
  return {
    id: `policy-source-${index}`,
    title: `Ametlik kataloogiallikas ${index}`,
    organization: "Keskkonnaagentuur",
    url,
    sourceTier: "official",
    retrieval: "catalogue-directory",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    freshness: { requiresSourceTimestamp: false },
  };
}

// A corpus row whose body was read from the page by an earlier answer and is
// still inside its evidence window. The body is short on purpose, because a
// body of 120 characters or more is reused directly and never re-read, so the
// short shape is the one that reaches a second policy read.
function pageReadDocument(url, index) {
  const version = "a".repeat(64);
  return {
    id: `policy-page-read-${index}`,
    title: `Varem loetud ametlik leht ${index}`,
    organization: "Keskkonnaagentuur",
    url,
    sourceTier: "official",
    retrieval: "approved-page-hydration",
    delivery: "catalog-and-bounded-hydration",
    evidencePolicy: "versioned",
    _answerEvidenceEligible: true,
    content: PAGE_READ_TEXT,
    _contentHash: version,
    _evidenceVersion: version,
    _evidenceStatusAt: new Date().toISOString(),
    freshness: {
      class: "cached-official-page",
      basis: "retrieved-at",
      maxAgeMs: 7 * DAY_MS,
      requiresSourceTimestamp: true,
    },
  };
}

// Catalogue text written by a reviewed producer, not copied from the page, so
// its standing does not depend on the publisher's robots.txt.
function reviewedCatalogueDocument(url, index) {
  const version = "b".repeat(64);
  return {
    id: `policy-reviewed-${index}`,
    title: `Kataloogis ule vaadatud allikas ${index}`,
    organization: "Keskkonnaagentuur",
    url,
    sourceTier: "official",
    retrieval: "reviewed-catalogue-source",
    delivery: "reviewed-catalogue",
    evidencePolicy: "versioned",
    _answerEvidenceEligible: true,
    content: REVIEWED_TEXT,
    _contentHash: version,
    _evidenceVersion: version,
    _evidenceStatusAt: new Date().toISOString(),
    freshness: {
      class: "reviewed-catalogue",
      basis: "reviewed-at",
      maxAgeMs: 366 * DAY_MS,
      requiresSourceTimestamp: true,
    },
  };
}

// A curated catalogue entry: our own maintained description of an official
// page. It also says basis "retrieved-at", so it must not be mistaken for page
// text when the publisher policy is unknown.
function curatedCatalogueDocument(url, index) {
  return {
    id: `policy-curated-${index}`,
    title: `Kureeritud kataloogikirje ${index}`,
    organization: "Terviseamet",
    url,
    sourceTier: "official",
    retrieval: "catalogue-directory",
    delivery: "catalog-and-bounded-hydration",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    content: CURATED_TEXT,
    freshness: {
      class: "maintained",
      basis: "retrieved-at",
      maxAgeMs: 7 * DAY_MS,
      requiresSourceTimestamp: false,
    },
  };
}

function createStubTransport({ robots = "", robotsStatus = 200, robotsFinalUrl, pages = {} } = {}) {
  const requested = [];
  const robotsRequests = () => requested.filter((href) => new URL(href).pathname === "/robots.txt");
  const requestText = async (value) => {
    const url = new URL(String(value));
    const href = url.toString();
    requested.push(href);
    if (url.pathname === "/robots.txt") {
      return {
        status: robotsStatus,
        body: robots,
        headers: { "content-type": "text/plain" },
        // The transport reports the URL it ended on, so a stub can describe a
        // redirect that left the requested origin.
        url: robotsFinalUrl || href,
      };
    }
    const page = pages[href];
    assert.ok(page, `unexpected upstream page request: ${href}`);
    return {
      status: page.status ?? 200,
      body: page.body ?? "",
      headers: page.headers ?? { "content-type": "text/html; charset=utf-8" },
      url: href,
    };
  };
  return {
    requestText,
    requested,
    robotsRequests,
    pageRequests() {
      return requested.filter((href) => new URL(href).pathname !== "/robots.txt");
    },
  };
}

function visibleText(document) {
  return [document?.content, document?.summary, document?.excerpt]
    .map((value) => String(value || ""))
    .join("\n");
}

function assertNotCited(document, label) {
  assert.doesNotMatch(
    visibleText(document),
    new RegExp(FORBIDDEN_TEXT, "u"),
    `${label}: text from a page the publisher excluded must never be cited`,
  );
}

function assertNotPromoted(document, label) {
  assert.notEqual(
    document?.retrieval,
    "approved-page-hydration",
    `${label}: an excluded page must not become fresh page evidence`,
  );
  assert.notEqual(
    document?.evidencePolicy,
    "versioned",
    `${label}: an excluded page must not be marked as versioned answer evidence`,
  );
  assert.equal(
    document?._evidenceVersion,
    undefined,
    `${label}: an excluded page must not receive an evidence version`,
  );
  assert.equal(
    document?._evidenceStatusAt,
    undefined,
    `${label}: an excluded page must not receive an evidence timestamp`,
  );
}

// Page text stands on a policy read that did not happen, so the body may no
// longer support a citation. Reviewed catalogue text is untouched by this.
function assertDemoted(document, label) {
  assert.equal(
    document?.evidencePolicy,
    "route-only",
    `${label}: page text without an established policy must fall back to a route only card`,
  );
  assert.equal(
    document?._answerEvidenceEligible,
    false,
    `${label}: page text without an established policy must not stay answer eligible`,
  );
  assert.doesNotMatch(
    String(document?.content || ""),
    new RegExp(PAGE_READ_TEXT, "u"),
    `${label}: the body read earlier must not remain a citable passage`,
  );
  assert.equal(
    document?._evidenceVersion,
    undefined,
    `${label}: the earlier evidence version must not survive without a policy`,
  );
  assert.equal(
    document?._evidenceStatusAt,
    undefined,
    `${label}: the earlier evidence timestamp must not survive without a policy`,
  );
  assert.equal(
    sourceEvidenceEligibility(document || {}).eligible,
    false,
    `${label}: the demoted entry must not be eligible for model evidence`,
  );
}

test("a robots.txt disallowed page is never requested, cached, cited or promoted", async () => {
  const nonce = Date.now();
  const origin = "https://keskkonnaagentuur.ee";
  const allowedUrl = `${origin}/et/lubatud-leht-${nonce}`;
  const blockedUrl = `${origin}/et/keelatud-leht-${nonce}`;
  const transport = createStubTransport({
    robots: "User-agent: *\nDisallow: /et/keelatud-\n",
    pages: {
      [allowedUrl]: { body: pageBody(ALLOWED_TEXT) },
      [blockedUrl]: { body: pageBody(FORBIDDEN_TEXT) },
    },
  });

  // Control: the same origin and the same stub still hydrate a permitted page,
  // so a denial below can only come from the publisher policy.
  const [allowed] = await hydrateOfficialDocuments([eligibleCatalogueDocument(allowedUrl, 1)], 1, {
    requestText: transport.requestText,
  });
  assert.equal(allowed.retrieval, "approved-page-hydration");
  assert.match(visibleText(allowed), new RegExp(ALLOWED_TEXT, "u"));

  const [blocked] = await hydrateOfficialDocuments([eligibleCatalogueDocument(blockedUrl, 2)], 1, {
    requestText: transport.requestText,
  });
  assert.equal(
    transport.requested.some((href) => href.includes("/et/keelatud-")),
    false,
    "a robots.txt disallowed page must not be requested at all",
  );
  assert.equal(
    transport.requested.some((href) => href === `${origin}/robots.txt`),
    true,
    "the publisher robots.txt must be consulted through the injected transport",
  );
  assertNotCited(blocked, "robots.txt denial");
  assertNotPromoted(blocked, "robots.txt denial");
});

test("an HTML robots noindex page never becomes citable hydration evidence", async () => {
  const nonce = Date.now();
  const url = `https://keskkonnaamet.ee/et/noindex-leht-${nonce}`;
  // A noindex directive is often compatible with reading and quoting a page.
  // This application still elects not to use such a page as answer evidence,
  // so the body must not be held for a later answer to cite.
  const robots = "User-agent: *\nAllow: /\n";
  const noindexTransport = createStubTransport({
    robots,
    pages: {
      [url]: {
        body: pageBody(FORBIDDEN_TEXT, { robotsMeta: "<meta name=\"robots\" content=\"noindex, follow\">" }),
      },
    },
  });
  const [denied] = await hydrateOfficialDocuments([eligibleCatalogueDocument(url, 1)], 1, {
    requestText: noindexTransport.requestText,
  });
  assert.equal(
    noindexTransport.pageRequests().length,
    1,
    "the page is read once so that its own robots policy can be inspected",
  );
  assertNotCited(denied, "HTML noindex");
  assertNotPromoted(denied, "HTML noindex");

  // The same URL later serves a permitted page. A noindex body must not have
  // been left in the response cache where a later answer could pick it up.
  const cleanTransport = createStubTransport({
    robots,
    pages: { [url]: { body: pageBody(ALLOWED_TEXT) } },
  });
  const [later] = await hydrateOfficialDocuments([eligibleCatalogueDocument(url, 1)], 1, {
    requestText: cleanTransport.requestText,
  });
  assertNotCited(later, "cached HTML noindex response");
});

test("an X-Robots-Tag noindex response never becomes citable hydration evidence", async () => {
  const nonce = Date.now();
  const url = `https://rmk.ee/et/paise-noindex-${nonce}`;
  const robots = "User-agent: *\nAllow: /\n";
  const noindexTransport = createStubTransport({
    robots,
    pages: {
      [url]: {
        body: pageBody(FORBIDDEN_TEXT),
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-robots-tag": "noindex",
        },
      },
    },
  });
  const [denied] = await hydrateOfficialDocuments([eligibleCatalogueDocument(url, 1)], 1, {
    requestText: noindexTransport.requestText,
  });
  assertNotCited(denied, "X-Robots-Tag noindex");
  assertNotPromoted(denied, "X-Robots-Tag noindex");

  const cleanTransport = createStubTransport({
    robots,
    pages: { [url]: { body: pageBody(ALLOWED_TEXT) } },
  });
  const [later] = await hydrateOfficialDocuments([eligibleCatalogueDocument(url, 1)], 1, {
    requestText: cleanTransport.requestText,
  });
  assertNotCited(later, "cached X-Robots-Tag noindex response");
});

test("a permitted page still hydrates, stays answer eligible and stays cached", async () => {
  const nonce = Date.now();
  const url = `https://kliimaministeerium.ee/et/lubatud-leht-${nonce}`;
  const transport = createStubTransport({
    robots: "User-agent: *\nAllow: /\n",
    pages: { [url]: { body: pageBody(ALLOWED_TEXT) } },
  });
  const [hydrated] = await hydrateOfficialDocuments([eligibleCatalogueDocument(url, 1)], 1, {
    requestText: transport.requestText,
  });
  assert.equal(hydrated.retrieval, "approved-page-hydration");
  assert.equal(hydrated.evidencePolicy, "versioned");
  assert.equal(hydrated._answerEvidenceEligible, true);
  assert.equal(hydrated._evidenceVersion, hydrated._contentHash);
  assert.match(hydrated.content, new RegExp(ALLOWED_TEXT, "u"));

  const requestsAfterFirstAnswer = transport.pageRequests().length;
  const [cached] = await hydrateOfficialDocuments([eligibleCatalogueDocument(url, 1)], 1, {
    requestText: transport.requestText,
  });
  assert.equal(
    transport.pageRequests().length,
    requestsAfterFirstAnswer,
    "a permitted page stays cached between answer requests",
  );
  assert.equal(cached._contentHash, hydrated._contentHash);
  assert.equal(cached._answerEvidenceEligible, true);
  assert.match(cached.content, new RegExp(ALLOWED_TEXT, "u"));
  assert.deepEqual(officialHydrationStats(), { active: 0, queued: 0, limit: 4, inflight: 0 });
});

test("a refused robots.txt stops the live answer path before it reads or cites the page", async () => {
  const nonce = Date.now();
  const origin = "https://terviseamet.ee";
  const url = `${origin}/et/keeldumine-${nonce}`;
  // A 403 on robots.txt is a refusal of automated access, not a missing file,
  // so the page behind it is not ours to read.
  const transport = createStubTransport({
    robots: "Access denied",
    robotsStatus: 403,
    pages: { [url]: { body: pageBody(FORBIDDEN_TEXT) } },
  });
  const [denied] = await hydrateOfficialDocuments([eligibleCatalogueDocument(url, 1)], 1, {
    requestText: transport.requestText,
  });
  assert.equal(
    transport.robotsRequests().length > 0,
    true,
    "the publisher robots.txt must be consulted through the injected transport",
  );
  assert.deepEqual(
    transport.pageRequests(),
    [],
    "a refused robots.txt must stop the page read instead of being read as no rules",
  );
  assertNotCited(denied, "robots.txt refusal");
  assertNotPromoted(denied, "robots.txt refusal");
});

test("a missing robots.txt leaves the policy open, so a valid page still hydrates and stays citable", async () => {
  const nonce = Date.now();
  const origin = "https://www.ilmateenistus.ee";
  const url = `${origin}/et/puuduv-robots-${nonce}`;
  const transport = createStubTransport({
    robots: "Not found",
    robotsStatus: 404,
    pages: { [url]: { body: pageBody(ALLOWED_TEXT) } },
  });
  const [hydrated] = await hydrateOfficialDocuments([eligibleCatalogueDocument(url, 1)], 1, {
    requestText: transport.requestText,
  });
  assert.equal(
    transport.robotsRequests().length > 0,
    true,
    "an absent robots.txt is still a policy read",
  );
  assert.equal(
    transport.pageRequests().length,
    1,
    "an absent robots.txt states that the origin has no policy file, so the page stays readable",
  );
  assert.equal(hydrated.retrieval, "approved-page-hydration");
  assert.equal(hydrated.evidencePolicy, "versioned");
  assert.equal(hydrated._answerEvidenceEligible, true);
  assert.equal(hydrated._evidenceVersion, hydrated._contentHash);
  assert.match(hydrated.content, new RegExp(ALLOWED_TEXT, "u"));
  assert.equal(sourceEvidenceEligibility(hydrated).eligible, true);
});

test("an unestablished robots policy demotes earlier page text but keeps reviewed catalogue text", async () => {
  const nonce = Date.now();
  const origin = "https://www.keskkonnaagentuur.ee";
  const pageUrl = `${origin}/et/varem-loetud-${nonce}`;
  const reviewedUrl = `${origin}/et/ule-vaadatud-${nonce}`;
  const curatedUrl = `${origin}/et/kureeritud-${nonce}`;
  const transport = createStubTransport({
    robots: "Upstream error",
    robotsStatus: 500,
    pages: {
      [pageUrl]: { body: pageBody(ALLOWED_TEXT) },
      [reviewedUrl]: { body: pageBody(ALLOWED_TEXT) },
      [curatedUrl]: { body: pageBody(ALLOWED_TEXT) },
    },
  });
  const pageDocument = pageReadDocument(pageUrl, 1);
  const reviewedDocument = reviewedCatalogueDocument(reviewedUrl, 2);
  const curatedDocument = curatedCatalogueDocument(curatedUrl, 3);
  for (const document of [pageDocument, reviewedDocument, curatedDocument]) {
    assert.equal(
      sourceEvidenceEligibility(document).eligible,
      true,
      `${document.id}: the entry is citable before the policy failure`,
    );
  }

  const [demoted, retained, curated] = await hydrateOfficialDocuments(
    [pageDocument, reviewedDocument, curatedDocument],
    3,
    { requestText: transport.requestText },
  );
  assert.equal(
    transport.robotsRequests().length > 0,
    true,
    "the publisher robots.txt must be consulted through the injected transport",
  );
  assert.deepEqual(
    transport.pageRequests(),
    [],
    "an unestablished policy must not read any of the pages",
  );
  assertDemoted(demoted, "unestablished policy, earlier page text");
  assert.equal(
    retained.evidencePolicy,
    "versioned",
    "reviewed catalogue text does not depend on the publisher robots.txt",
  );
  assert.equal(
    retained._answerEvidenceEligible,
    true,
    "reviewed catalogue text keeps its evidence standing",
  );
  assert.equal(retained._evidenceStatusAt, reviewedDocument._evidenceStatusAt);
  assert.match(String(retained.content || ""), new RegExp(REVIEWED_TEXT, "u"));
  assert.equal(sourceEvidenceEligibility(retained).eligible, true);

  // A curated entry carries basis "retrieved-at" as well, and it is still our
  // own text, so it must not be swept up by the page provenance demotion.
  assert.equal(
    curated.evidencePolicy,
    "claim-specific",
    "a curated catalogue entry is not page text",
  );
  assert.equal(curated._answerEvidenceEligible, true);
  assert.match(String(curated.content || ""), new RegExp(CURATED_TEXT, "u"));
  assert.equal(sourceEvidenceEligibility(curated).eligible, true);
});

test("concurrent permitted pages share one robots.txt read for their origin", async () => {
  const nonce = Date.now();
  const origin = "https://tartu.ee";
  const urls = [1, 2, 3, 4].map((slot) => `${origin}/et/korraga-${nonce}-${slot}`);
  const requested = [];
  let robotsReads = 0;
  const requestText = async (value) => {
    const url = new URL(String(value));
    const href = url.toString();
    requested.push(href);
    if (url.pathname === "/robots.txt") {
      robotsReads += 1;
      // A slow policy answer keeps the first read in flight long enough for
      // every other page of the same origin to ask for it.
      await new Promise((resolve) => { setTimeout(resolve, 40); });
      return {
        status: 200,
        body: "User-agent: *\nAllow: /\n",
        headers: { "content-type": "text/plain" },
        url: href,
      };
    }
    return {
      status: 200,
      body: pageBody(ALLOWED_TEXT),
      headers: { "content-type": "text/html; charset=utf-8" },
      url: href,
    };
  };

  const hydrated = await hydrateOfficialDocuments(
    urls.map((url, index) => eligibleCatalogueDocument(url, index + 1)),
    4,
    { requestText },
  );

  assert.equal(
    robotsReads,
    1,
    `one origin must be read once while the policy answer is in flight, saw ${robotsReads} reads`,
  );
  assert.deepEqual(
    requested.filter((href) => new URL(href).pathname !== "/robots.txt").sort(),
    [...urls].sort(),
    "every permitted page is still read exactly once",
  );
  for (const document of hydrated) {
    assert.equal(document.retrieval, "approved-page-hydration");
    assert.equal(document._answerEvidenceEligible, true);
    assert.match(String(document.content || ""), new RegExp(ALLOWED_TEXT, "u"));
  }
});

test("a robots.txt answer from another approved origin cannot authorize the page", async () => {
  const nonce = Date.now();
  // Both hosts are on the approved list, so only the origin binding can stop
  // one publisher's policy from standing in for another publisher's policy.
  const pageOrigin = "https://ohuseire.ee";
  const foreignOrigin = "https://www.ohuseire.ee";
  const foreignRules = "User-agent: *\nAllow: /\n";
  const pageUrl = `${pageOrigin}/et/robots-redirect-${nonce}`;
  const controlUrl = `${foreignOrigin}/et/robots-redirect-${nonce}`;

  // Control: the other approved origin answers its own robots.txt with the
  // same permissive rules, so its own page is cleared and hydrates. The rules
  // are identical to the redirect case, so only the origin binding decides.
  const ownTransport = createStubTransport({
    robots: foreignRules,
    pages: { [controlUrl]: { body: pageBody(ALLOWED_TEXT) } },
  });
  const [control] = await hydrateOfficialDocuments([eligibleCatalogueDocument(controlUrl, 1)], 1, {
    requestText: ownTransport.requestText,
  });
  assert.equal(
    control.retrieval,
    "approved-page-hydration",
    "a same origin policy read still clears its own page",
  );
  assert.match(String(control.content || ""), new RegExp(ALLOWED_TEXT, "u"));

  // The requested origin is answered by the other approved origin. Its rules
  // are permissive, so accepting them would silently read the page.
  const foreignTransport = createStubTransport({
    robots: foreignRules,
    robotsFinalUrl: `${foreignOrigin}/robots.txt`,
    pages: { [pageUrl]: { body: pageBody(FORBIDDEN_TEXT) } },
  });
  const [denied] = await hydrateOfficialDocuments([eligibleCatalogueDocument(pageUrl, 2)], 1, {
    requestText: foreignTransport.requestText,
  });
  assert.equal(
    foreignTransport.robotsRequests().length,
    1,
    "the requested origin's robots.txt is asked for once",
  );
  assert.deepEqual(
    foreignTransport.pageRequests(),
    [],
    "a policy answered by another origin must leave the page unread",
  );
  assertNotCited(denied, "robots.txt answered by another approved origin");
  assertNotPromoted(denied, "robots.txt answered by another approved origin");
  // An answer from the wrong origin says nothing about this one, so the entry
  // is left as an unknown policy, not treated as a publisher exclusion.
  assert.equal(
    denied.evidencePolicy,
    "claim-specific",
    "another origin's answer must not be recorded as this origin's publisher decision",
  );

  // The failed foreign read is not cached as this origin's policy, so a real
  // same origin answer still clears the page afterwards.
  const retryTransport = createStubTransport({
    robots: foreignRules,
    pages: { [pageUrl]: { body: pageBody(ALLOWED_TEXT) } },
  });
  const [retried] = await hydrateOfficialDocuments([eligibleCatalogueDocument(pageUrl, 3)], 1, {
    requestText: retryTransport.requestText,
  });
  assert.equal(
    retried.retrieval,
    "approved-page-hydration",
    "a foreign answer must not poison this origin's policy cache",
  );
  assert.match(String(retried.content || ""), new RegExp(ALLOWED_TEXT, "u"));
});

test("a cross origin robots.txt 404 or 410 does not mean the requested origin has no policy", async () => {
  const nonce = Date.now();
  const cases = [
    { status: 404, pageOrigin: "https://eea.europa.eu", foreignOrigin: "https://foresteurope.org" },
    { status: 410, pageOrigin: "https://airviro.klab.ee", foreignOrigin: "https://gsavalik.envir.ee" },
  ];
  for (const item of cases) {
    const pageUrl = `${item.pageOrigin}/et/robots-absent-${item.status}-${nonce}`;
    // The requested origin is answered by another approved origin which then
    // says the file is gone. Read as a status first, that would clear the page.
    const transport = createStubTransport({
      robots: "No policy file",
      robotsStatus: item.status,
      robotsFinalUrl: `${item.foreignOrigin}/robots.txt`,
      pages: { [pageUrl]: { body: pageBody(FORBIDDEN_TEXT) } },
    });
    const [denied] = await hydrateOfficialDocuments(
      [eligibleCatalogueDocument(pageUrl, item.status)],
      1,
      { requestText: transport.requestText },
    );
    assert.equal(
      transport.robotsRequests().length,
      1,
      `${item.status}: the requested origin's robots.txt is asked for once`,
    );
    assert.deepEqual(
      transport.pageRequests(),
      [],
      `${item.status}: another origin's answer says nothing about this origin, so the page stays unread`,
    );
    assertNotCited(denied, `foreign robots ${item.status}`);
    assertNotPromoted(denied, `foreign robots ${item.status}`);
    assert.equal(
      denied.evidencePolicy,
      "claim-specific",
      `${item.status}: an answer from another origin must not be recorded as this origin's decision`,
    );
  }

  // The same status from the origin itself still states that this origin has no
  // policy file, so the page stays readable. The origin binding must preserve
  // that, and the failed reads above must not be left in the cache.
  const ownOrigin = cases[0].pageOrigin;
  const controlUrl = `${ownOrigin}/et/robots-absent-own-${nonce}`;
  const controlTransport = createStubTransport({
    robots: "No policy file",
    robotsStatus: 404,
    pages: { [controlUrl]: { body: pageBody(ALLOWED_TEXT) } },
  });
  const [control] = await hydrateOfficialDocuments([eligibleCatalogueDocument(controlUrl, 3)], 1, {
    requestText: controlTransport.requestText,
  });
  assert.equal(
    control.retrieval,
    "approved-page-hydration",
    "a 404 from the origin itself still leaves its page readable",
  );
  assert.match(String(control.content || ""), new RegExp(ALLOWED_TEXT, "u"));
});

// A publisher policy is written for a crawler identity, so it decides anything
// only if it is read against the product this reader actually announces. The
// two cases below build their upstream answer from the User-Agent header of the
// request they receive (the product token is the part before the first "/"),
// never from a constant, so the check follows whatever identity is sent next.
function createIdentityTransport({ robotsFor, pages = {} }) {
  const requested = [];
  const policyProducts = [];
  const requestText = async (value, options = {}) => {
    const url = new URL(String(value));
    const href = url.toString();
    requested.push(href);
    const headers = options?.headers || {};
    const userAgent = String(headers["User-Agent"] ?? headers["user-agent"] ?? "");
    const product = userAgent.trim().split(/[\/\s(]/u)[0] || "";
    if (url.pathname === "/robots.txt") {
      policyProducts.push(product);
      return {
        status: 200,
        body: robotsFor(product),
        headers: { "content-type": "text/plain" },
        url: href,
      };
    }
    const page = pages[href];
    assert.ok(page, `unexpected upstream page request: ${href}`);
    return {
      status: page.status ?? 200,
      body: typeof page.body === "function" ? page.body(product) : (page.body ?? ""),
      headers: page.headers ?? { "content-type": "text/html; charset=utf-8" },
      url: href,
    };
  };
  return {
    requestText,
    requested,
    product() {
      assert.ok(policyProducts.length > 0, "the publisher robots.txt must be read through the injected transport");
      const products = [...new Set(policyProducts)];
      assert.equal(products.length, 1, `one announced identity per policy read, saw ${JSON.stringify(products)}`);
      assert.notEqual(products[0], "", "the live reader must announce a product token in its User-Agent");
      return products[0];
    },
  };
}

// The product token announced today is a prefix of the corpus crawler name, so
// a group that extends it is a different crawler's group. The wildcard group is
// then the one that applies to us, and it disallows the requested path.
test("robots.txt rules are read for the announced product, not for another product that extends its name", async () => {
  const nonce = Date.now();
  const origin = "https://www.tallinn.ee";
  const blockedUrl = `${origin}/et/meie-keelatud-${nonce}`;
  const controlUrl = `${origin}/et/lubatud-${nonce}`;
  const transport = createIdentityTransport({
    robotsFor: (product) => [
      "# Synthetic policy: one product is granted everything, everyone else is",
      "# denied one path. Only the group written for us may decide for us.",
      `User-agent: ${product}-corpus`,
      "Allow: /",
      "",
      "User-agent: *",
      "Disallow: /et/meie-keelatud-",
      "",
    ].join("\n"),
    pages: {
      [blockedUrl]: { body: pageBody(FORBIDDEN_TEXT) },
      [controlUrl]: { body: pageBody(ALLOWED_TEXT) },
    },
  });

  const [blocked, control] = await hydrateOfficialDocuments(
    [eligibleCatalogueDocument(blockedUrl, 1), eligibleCatalogueDocument(controlUrl, 2)],
    2,
    { requestText: transport.requestText },
  );
  const product = transport.product();

  assert.equal(
    transport.requested.some((href) => href.startsWith(`${origin}/et/meie-keelatud-`)),
    false,
    `a path disallowed by the wildcard group that applies to ${product} must not be requested`,
  );
  assertNotCited(blocked, `wildcard robots denial for ${product}`);
  assertNotPromoted(blocked, `wildcard robots denial for ${product}`);

  // Control: the same origin through the same transport still hydrates its
  // permitted page, so the denial above is the policy and not a blanket one.
  assert.equal(
    control.retrieval,
    "approved-page-hydration",
    "a permitted page beside the denied one stays readable",
  );
  assert.match(String(control.content || ""), new RegExp(ALLOWED_TEXT, "u"));
});

test("a meta noindex addressed to the announced product keeps the page out of evidence and out of the cache", async () => {
  const nonce = Date.now();
  const origin = "https://register.keskkonnaportaal.ee";
  const noindexUrl = `${origin}/et/meie-noindex-${nonce}`;
  const controlUrl = `${origin}/et/teise-toote-noindex-${nonce}`;
  const transport = createIdentityTransport({
    robotsFor: () => "User-agent: *\nAllow: /\n",
    pages: {
      // The publisher names the crawler it excludes, using the identity that
      // crawler sends in its own header.
      [noindexUrl]: {
        body: (product) => pageBody(FORBIDDEN_TEXT, {
          robotsMeta: `<meta name="${product}" content="noindex, follow">`,
        }),
      },
      // The same directive addressed to another crawler says nothing about us.
      [controlUrl]: {
        body: () => pageBody(ALLOWED_TEXT, {
          robotsMeta: "<meta name=\"muu-korjelaine-robot\" content=\"noindex, follow\">",
        }),
      },
    },
  });

  const [noindexed, control] = await hydrateOfficialDocuments(
    [eligibleCatalogueDocument(noindexUrl, 1), eligibleCatalogueDocument(controlUrl, 2)],
    2,
    { requestText: transport.requestText },
  );
  const product = transport.product();

  assert.equal(
    transport.requested.includes(noindexUrl),
    true,
    "the page is read once so that its own robots policy can be inspected",
  );
  assertNotCited(noindexed, `meta noindex for ${product}`);
  assertNotPromoted(noindexed, `meta noindex for ${product}`);
  assert.equal(
    noindexed.evidencePolicy,
    "route-only",
    `a noindex directive addressed to ${product} must leave a route only card`,
  );
  assert.equal(String(noindexed.content || ""), "", "no excluded body may be handed back for display");

  assert.equal(
    control.retrieval,
    "approved-page-hydration",
    "a directive addressed to another crawler leaves our page citable",
  );
  assert.match(String(control.content || ""), new RegExp(ALLOWED_TEXT, "u"));

  // The same URL later serves a permitted page, so the excluded body must not
  // have been left in the response cache for a later answer to pick up.
  const cleanTransport = createIdentityTransport({
    robotsFor: () => "User-agent: *\nAllow: /\n",
    pages: { [noindexUrl]: { body: pageBody(ALLOWED_TEXT) } },
  });
  const [later] = await hydrateOfficialDocuments([eligibleCatalogueDocument(noindexUrl, 1)], 1, {
    requestText: cleanTransport.requestText,
  });
  assertNotCited(later, "cached meta noindex response");
});

// An X-Robots-Tag directive carries the crawler it is meant for, so the cases
// below need the identity this reader actually announces and must not pin its
// spelling. One control hydration has the page echo the identity of the request
// that asked for it, so the token comes from the outgoing User-Agent header and
// every scoped case reuses it, even if the identity is renamed later.
let announcedProductPromise;
function announcedProductToken() {
  announcedProductPromise ||= (async () => {
    const url = `https://avaandmed.keskkonnaportaal.ee/et/robots-identiteet-${Date.now()}`;
    const transport = createIdentityTransport({
      robotsFor: () => "User-agent: *\nAllow: /\n",
      pages: { [url]: { body: (product) => pageBody(`${ALLOWED_TEXT} ${product}`) } },
    });
    const [control] = await hydrateOfficialDocuments([eligibleCatalogueDocument(url, 91)], 1, {
      requestText: transport.requestText,
    });
    // Sensitivity control for the scoped cases: this origin, this transport and
    // this body hydrate while no directive stands in the way.
    assert.equal(
      control.retrieval,
      "approved-page-hydration",
      "the identity control page must hydrate before a scoped directive is read",
    );
    const content = String(control.content || "");
    assert.match(content, new RegExp(ALLOWED_TEXT, "u"));
    const token = content.match(new RegExp(`${ALLOWED_TEXT} (\\S+)`, "u"))?.[1];
    assert.ok(token, "the live reader must announce a product token on the page request");
    return token;
  })();
  return announcedProductPromise;
}

test("an X-Robots-Tag noindex addressed to another crawler leaves the page citable", async () => {
  const nonce = Date.now();
  const url = `https://keskkonnaandmed.envir.ee/et/teine-korjelaine-${nonce}`;
  const transport = createStubTransport({
    robots: "User-agent: *\nAllow: /\n",
    pages: {
      [url]: {
        body: pageBody(ALLOWED_TEXT),
        headers: {
          "content-type": "text/html; charset=utf-8",
          // The directive names a crawler that is not this reader, so its
          // exclusion is not ours to obey.
          "x-robots-tag": "muu-korjelaine-robot: noindex, nofollow",
        },
      },
    },
  });
  const [hydrated] = await hydrateOfficialDocuments([eligibleCatalogueDocument(url, 1)], 1, {
    requestText: transport.requestText,
  });
  assert.equal(
    hydrated.retrieval,
    "approved-page-hydration",
    "a noindex scoped to another crawler must not withdraw a permitted page",
  );
  assert.equal(hydrated.evidencePolicy, "versioned", "the permitted page keeps its evidence standing");
  assert.equal(hydrated._answerEvidenceEligible, true);
  assert.equal(sourceEvidenceEligibility(hydrated).eligible, true);
  assert.match(String(hydrated.content || ""), new RegExp(ALLOWED_TEXT, "u"));
});

test("an X-Robots-Tag noindex for every reader or for the announced product still excludes the page", async () => {
  const product = await announcedProductToken();
  const nonce = Date.now();
  const origin = "https://andmed.stat.ee";
  const genericUrl = `${origin}/et/uldine-noindex-${nonce}`;
  const scopedUrl = `${origin}/et/meie-noindex-${nonce}`;
  const transport = createStubTransport({
    robots: "User-agent: *\nAllow: /\n",
    pages: {
      // No crawler is named, so the directive is addressed to every reader.
      [genericUrl]: {
        body: pageBody(FORBIDDEN_TEXT),
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-robots-tag": "noindex",
        },
      },
      // The publisher names the crawler it excludes, and this one is ours.
      [scopedUrl]: {
        body: pageBody(FORBIDDEN_TEXT),
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-robots-tag": `${product}: noindex, nofollow`,
        },
      },
    },
  });
  const [generic, scoped] = await hydrateOfficialDocuments(
    [eligibleCatalogueDocument(genericUrl, 1), eligibleCatalogueDocument(scopedUrl, 2)],
    2,
    { requestText: transport.requestText },
  );
  for (const [label, document] of [["for every reader", generic], [`scoped to ${product}`, scoped]]) {
    assertNotCited(document, `X-Robots-Tag noindex ${label}`);
    assertNotPromoted(document, `X-Robots-Tag noindex ${label}`);
    assert.equal(
      document.evidencePolicy,
      "route-only",
      `an X-Robots-Tag noindex ${label} must leave a route only card`,
    );
    assert.equal(String(document.content || ""), "", "no excluded body may be handed back for display");
    assert.equal(sourceEvidenceEligibility(document).eligible, false);
  }
});

test("separate X-Robots-Tag values keep their own scope", async () => {
  const product = await announcedProductToken();
  const nonce = Date.now();
  const origin = "https://www.tartu.ee";
  const otherCrawlerUrl = `${origin}/et/eraldi-teine-${nonce}`;
  const ourCrawlerUrl = `${origin}/et/eraldi-meie-${nonce}`;
  const transport = createStubTransport({
    robots: "User-agent: *\nAllow: /\n",
    pages: {
      // The values arrive separately, so the first one's exclusion stays with
      // the crawler it names, and the value that names no crawler clears us.
      [otherCrawlerUrl]: {
        body: pageBody(ALLOWED_TEXT),
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-robots-tag": ["muu-korjelaine-robot: noindex, nofollow", "index, follow"],
        },
      },
      // The reverse: a value that names no crawler says nothing against us,
      // and the value that names this reader excludes the page.
      [ourCrawlerUrl]: {
        body: pageBody(FORBIDDEN_TEXT),
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-robots-tag": ["index, follow", `${product}: noindex`],
        },
      },
    },
  });
  const [otherCrawler, ourCrawler] = await hydrateOfficialDocuments(
    [eligibleCatalogueDocument(otherCrawlerUrl, 1), eligibleCatalogueDocument(ourCrawlerUrl, 2)],
    2,
    { requestText: transport.requestText },
  );
  assert.equal(
    otherCrawler.retrieval,
    "approved-page-hydration",
    "one value's scope must not be applied to a value that names no crawler",
  );
  assert.equal(otherCrawler._answerEvidenceEligible, true);
  assert.match(String(otherCrawler.content || ""), new RegExp(ALLOWED_TEXT, "u"));

  assertNotCited(ourCrawler, `separate value scoped to ${product}`);
  assertNotPromoted(ourCrawler, `separate value scoped to ${product}`);
  assert.equal(
    ourCrawler.evidencePolicy,
    "route-only",
    `a value scoped to ${product} must still exclude the page when the values arrive separately`,
  );
});
