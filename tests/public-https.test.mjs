import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import test from "node:test";
import {
  createPublicOnlyLookup,
  isPublicIpAddress,
  requestApprovedPublicHttpsJsonPost,
  requestApprovedPublicHttpsText,
  validateApprovedPublicHttpsUrl,
} from "../server/public-https.mjs";
import { hydrateOfficialDocuments } from "../server/integrations.mjs";
import { sourceCanSupportPublicCitation } from "../server/source-registry.mjs";
import { AUDIT_CITATION_ORIGINS } from "../scripts/audit-citation-policy.mjs";
import { officialServiceCatalogueDocuments } from "../server/search.mjs";
import { REVIEWED_NAVIGATION_CITATION_URL_VALUES } from "../server/citation-policy.mjs";

function mockHttpsRequest(responses, calls) {
  return (url, options, callback) => {
    const request = new EventEmitter();
    let response;
    request.end = (body) => queueMicrotask(() => {
      const spec = responses.shift();
      calls.push({ url: url.toString(), options, body });
      response = spec.stream || Readable.from(spec.chunks || [spec.body || ""]);
      response.statusCode = spec.status;
      // A real IncomingMessage joins repeated header instances into one comma
      // separated value on headers and keeps the separate values on
      // headersDistinct, so a fixture for a repeated header sets both.
      response.headers = spec.headers || {};
      response.headersDistinct = spec.headersDistinct || {};
      callback(response);
    });
    request.destroy = (error) => {
      response?.destroy();
      queueMicrotask(() => request.emit("error", error));
    };
    return request;
  };
}

// Live hydration reads a publisher page through the same transport, and the
// transport may follow an approved same-resource redirect from a publisher's
// bare host to its www host. robots.txt is read for the URL that was asked for,
// so the destination origin's own policy has to be settled before that redirect
// is followed: a page the destination disallows must never be downloaded,
// cached, promoted or cited, while a page it allows has to hydrate exactly as
// before. Everything below is synthetic and answered by the mocked transport
// above; no request leaves this process.
const LIVE_PAGE_FILLER = "kontrollitud ametlik lehesisu ".repeat(12);
const REDIRECT_DENIED_TEXT = "KEELATUD_SIHTKOHA_LEHESEISU";
const REDIRECT_ALLOWED_TEXT = "LUBATUD_SIHTKOHA_LEHESEISU";
const REPEATED_HEADER_DENIED_TEXT = "KORDUVA_PARINGU_KEELATUD_LEHESEISU";
const REPEATED_HEADER_ALLOWED_TEXT = "KORDUVA_PARINGU_LUBATUD_LEHESEISU";
const SCOPED_HEADER_DENIED_TEXT = "TEISE_LUGEJA_KEELATUD_LEHESEISU";
const SCOPED_HEADER_ALLOWED_TEXT = "TEISE_LUGEJA_LUBATUD_LEHESEISU";

function livePageBody(sentinel) {
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    `<title>Ametlik leht ${sentinel}</title>`,
    "</head><body><main><article>",
    `<p>${sentinel} ${LIVE_PAGE_FILLER}</p>`,
    "</article></main></body></html>",
  ].join("");
}

// A publisher can repeat X-Robots-Tag instead of listing every directive in one
// value. A real response reports that as one comma separated string on headers
// and as the separate instances on headersDistinct, and only headersDistinct
// keeps the instance boundaries, so both are set exactly as Node delivers them.
function repeatedRobotsTag(instances) {
  return {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": instances.join(", "),
    },
    headersDistinct: { "x-robots-tag": [...instances] },
  };
}

// A catalogue entry that an adapter already validated, whose citable body only
// exists once the live answer path reads the page. This is the shape that takes
// the promotion branch inside hydrateOfficialDocuments.
function liveCatalogueDocument(url, index) {
  return {
    id: `live-policy-${index}`,
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

// Every outbound read is answered from a canned publisher reply and the exact
// URL is recorded, so a destination that must not be read shows up as a missing
// request instead of as a missing body. The read still runs through the real
// requestApprovedPublicHttpsText redirect loop with its approved-origin check
// and byte bound; only the socket and the DNS answer are injected.
function createPublisherTransport(replies) {
  const requested = [];
  const unexpected = [];
  const calls = [];
  const isRobotsRead = (href) => new URL(href).pathname === "/robots.txt";
  const requestImpl = (url, options, callback) => {
    const target = url.toString();
    requested.push(target);
    const reply = replies[target];
    if (!reply) {
      unexpected.push(target);
      return mockHttpsRequest([{ status: 418, body: "" }], calls)(url, options, callback);
    }
    return mockHttpsRequest([reply], calls)(url, options, callback);
  };
  return {
    requested,
    unexpected,
    pageRequests: () => requested.filter((href) => !isRobotsRead(href)),
    robotsRequests: () => requested.filter(isRobotsRead),
    requestText: (url, options = {}) => requestApprovedPublicHttpsText(url, {
      ...options,
      requestImpl,
      lookupImpl: (_hostname, _options, callback) => callback(null, [{ address: "8.8.8.8", family: 4 }]),
    }),
  };
}

test("public HTTPS policy rejects local, private, reserved and non-global addresses", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.1",
    "::", "::1", "::ffff:127.0.0.1", "64:ff9b::1", "fc00::1", "fe80::1", "2001:db8::1",
    "2001:2::1", "2001:10::1", "2001:20::1", "2002:7f00:1::1", "3fff::1",
  ]) assert.equal(isPublicIpAddress(address), false, address);
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);

  const origins = new Set(["https://public.example"]);
  assert.equal(
    validateApprovedPublicHttpsUrl("https://public.example/source", origins).toString(),
    "https://public.example/source",
  );
  for (const unsafe of [
    "http://public.example/source",
    "https://user:secret@public.example/source",
    "https://public.example.evil.test/source",
    "https://127.0.0.1/source",
    "https://public.example/source#fragment",
  ]) assert.throws(() => validateApprovedPublicHttpsUrl(unsafe, origins), /Outbound URL/u);
});

test("public-only DNS lookup fails closed when any answer is non-public", async () => {
  const mixedLookup = createPublicOnlyLookup((_hostname, _options, callback) => callback(null, [
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ]));
  await assert.rejects(new Promise((resolve, reject) => mixedLookup("public.example", {}, (error, address) => (
    error ? reject(error) : resolve(address)
  ))), /non-public DNS answer/u);

  const publicLookup = createPublicOnlyLookup((_hostname, _options, callback) => callback(null, [
    { address: "8.8.8.8", family: 4 },
  ]));
  assert.equal(await new Promise((resolve, reject) => publicLookup("public.example", {}, (error, address) => (
    error ? reject(error) : resolve(address)
  ))), "8.8.8.8");
  assert.deepEqual(await new Promise((resolve, reject) => publicLookup("public.example", { all: true }, (error, addresses) => (
    error ? reject(error) : resolve(addresses)
  ))), [{ address: "8.8.8.8", family: 4 }]);
});

test("public HTTPS transport validates every redirect and bounds streamed bytes", async () => {
  const origins = new Set(["https://public.example"]);
  const calls = [];
  const safe = await requestApprovedPublicHttpsText("https://public.example/start", {
    approvedOrigins: origins,
    maximumBytes: 32,
    requestImpl: mockHttpsRequest([
      { status: 302, headers: { location: "/next" } },
      { status: 200, body: "safe evidence", headers: { "content-profile": "apijahiala" } },
    ], calls),
  });
  assert.equal(safe.body, "safe evidence");
  assert.equal(safe.headers["content-profile"], "apijahiala");
  assert.deepEqual(calls.map((call) => call.url), [
    "https://public.example/start",
    "https://public.example/next",
  ]);
  assert.ok(calls.every((call) => call.options.headers["Accept-Encoding"] === "identity"));

  const unsafeCalls = [];
  await assert.rejects(requestApprovedPublicHttpsText("https://public.example/start", {
    approvedOrigins: origins,
    requestImpl: mockHttpsRequest([
      { status: 302, headers: { location: "https://127.0.0.1/private" } },
    ], unsafeCalls),
  }), /approved HTTPS origins/u);
  assert.equal(unsafeCalls.length, 1);

  await assert.rejects(requestApprovedPublicHttpsText("https://public.example/large", {
    approvedOrigins: origins,
    maximumBytes: 8,
    requestImpl: mockHttpsRequest([
      { status: 200, chunks: ["123456", "789"] },
    ], []),
  }), /too large/u);
});

test("public HTTPS transport destroys redirect bodies instead of draining them", async () => {
  let reads = 0;
  let destroyed = false;
  const redirectBody = new Readable({
    read() {
      reads += 1;
      this.push(Buffer.alloc(64 * 1024));
    },
    destroy(error, callback) {
      destroyed = true;
      callback(error);
    },
  });
  const result = await requestApprovedPublicHttpsText("https://public.example/start", {
    approvedOrigins: new Set(["https://public.example"]),
    maximumBytes: 8,
    requestImpl: mockHttpsRequest([
      { status: 302, headers: { location: "/final" }, stream: redirectBody },
      { status: 200, body: "ok" },
    ], []),
  });
  assert.equal(result.body, "ok");
  assert.equal(destroyed, true);
  assert.equal(reads, 0);
});

// A publisher policy hook can abort the read it belongs to and answer with its
// own failure in the same turn. The caller must see the abort promptly, and the
// hook's promise must never be left unobserved: under Node's strict unhandled
// rejection mode such a leftover kills the process that was only meant to report
// a refused page. The child below runs the real transport with strict rejections
// and a synthetic socket, so the failure mode is deterministic and independent
// of this process's own rejection settings.
test("an aborted policy hook leaves no unobserved rejection behind", async () => {
  const transportUrl = new URL("../server/public-https.mjs", import.meta.url).href;
  const script = `
const { requestApprovedPublicHttpsText } = await import(${JSON.stringify(transportUrl)});

// Only the socket is synthetic: the real redirect loop, approved-origin check
// and policy hook all run, and nothing here can reach a network.
function redirectRequest(_url, _options, callback) {
  return {
    once: () => undefined,
    destroy: () => undefined,
    end: () => queueMicrotask(() => callback({
      statusCode: 302,
      headers: { location: "https://public.example/next" },
      once: () => undefined,
      on: () => undefined,
      destroy: () => undefined,
    })),
  };
}

const controller = new AbortController();
let outcome = "resolved";
try {
  await requestApprovedPublicHttpsText("https://public.example/start", {
    approvedOrigins: new Set(["https://public.example"]),
    signal: controller.signal,
    requestImpl: redirectRequest,
    assertRedirectAllowed: () => {
      controller.abort();
      return Promise.reject(new Error("synthetic policy failure"));
    },
  });
} catch (error) {
  outcome = String(error?.name || "Error");
}
process.stdout.write(outcome);
`;
  const child = spawnSync(process.execPath, [
    "--unhandled-rejections=strict",
    "--input-type=module",
    "--eval",
    script,
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(child.stdout, "AbortError", `the abort must reach the caller: ${child.stderr}`);
  assert.equal(child.status, 0, `an observed rejection must leave the strict child clean: ${child.stderr}`);
  assert.doesNotMatch(String(child.stderr || ""), /unhandled/iu);

  // Sensitivity control: a hook that fails without aborting must still reach the
  // caller as its own error, so observing the promise cannot become swallowing it.
  await assert.rejects(requestApprovedPublicHttpsText("https://public.example/start", {
    approvedOrigins: new Set(["https://public.example"]),
    requestImpl: mockHttpsRequest([
      { status: 302, headers: { location: "/next" } },
    ], []),
    assertRedirectAllowed: () => Promise.reject(new Error("synthetic policy failure")),
  }), /synthetic policy failure/u);
});

test("live hydration settles the redirect destination origin robots before following the redirect", async () => {
  const requestedUrl = "https://keskkonnaagentuur.ee/uudis/sihtkoha-piir";
  const destinationUrl = "https://www.keskkonnaagentuur.ee/uudis/sihtkoha-piir";
  const requestedRobotsUrl = "https://keskkonnaagentuur.ee/robots.txt";
  const destinationRobotsUrl = "https://www.keskkonnaagentuur.ee/robots.txt";
  const transport = createPublisherTransport({
    [requestedRobotsUrl]: { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /otsing\n" },
    [requestedUrl]: { status: 302, headers: { location: destinationUrl } },
    [destinationRobotsUrl]: { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /uudis/\n" },
    [destinationUrl]: { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: livePageBody(REDIRECT_DENIED_TEXT) },
  });
  const document = liveCatalogueDocument(requestedUrl, 1);
  const [refused] = await hydrateOfficialDocuments([document], 1, { requestText: transport.requestText });

  assert.deepEqual(transport.unexpected, [], "every outbound read must be a canned publisher reply");
  assert.equal(transport.requested[0], requestedRobotsUrl, "the requested origin policy is settled before any page is requested");
  assert.equal(transport.robotsRequests().includes(destinationRobotsUrl), true, "the destination origin policy is read");
  assert.equal(transport.pageRequests().includes(requestedUrl), true, "the requested page is consulted to learn its destination");
  assert.equal(
    transport.pageRequests().includes(destinationUrl),
    false,
    "the page the destination disallows is never requested",
  );
  assert.equal(refused.content, "", "nothing read from the disallowed destination becomes page text");
  assert.equal(refused.evidencePolicy, "route-only", "a page its destination denies keeps its place but no evidence policy");
  assert.equal(refused._answerEvidenceEligible, false, "the disallowed page is never answer evidence");
  assert.equal(sourceCanSupportPublicCitation(refused).eligible, false, "the disallowed page cannot be cited");
  assert.equal(
    JSON.stringify(refused).includes(REDIRECT_DENIED_TEXT),
    false,
    "no byte of the disallowed destination survives in the result",
  );

  // A repeated answer must not reach the body through the read cache either:
  // the destination still denies the page, so it is still never requested.
  const [refusedAgain] = await hydrateOfficialDocuments([document], 1, { requestText: transport.requestText });
  assert.equal(
    transport.pageRequests().includes(destinationUrl),
    false,
    "the disallowed page stays unread on a repeated answer",
  );
  assert.equal(refusedAgain.content, "", "a cached body may not promote the disallowed page later");
  assert.equal(refusedAgain._answerEvidenceEligible, false, "a cached body may not cite the disallowed page later");
});

test("live hydration still follows a redirect to a destination origin that allows the page", async () => {
  const requestedUrl = "https://kliimaministeerium.ee/et/uudis/lubatud-sihtkoht";
  const destinationUrl = "https://www.kliimaministeerium.ee/et/uudis/lubatud-sihtkoht";
  const requestedRobotsUrl = "https://kliimaministeerium.ee/robots.txt";
  const destinationRobotsUrl = "https://www.kliimaministeerium.ee/robots.txt";
  const transport = createPublisherTransport({
    [requestedRobotsUrl]: { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /otsing\n" },
    [requestedUrl]: { status: 301, headers: { location: destinationUrl } },
    [destinationRobotsUrl]: { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /keelatud\n" },
    [destinationUrl]: { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: livePageBody(REDIRECT_ALLOWED_TEXT) },
  });
  const [hydrated] = await hydrateOfficialDocuments([liveCatalogueDocument(requestedUrl, 2)], 1, {
    requestText: transport.requestText,
  });

  assert.deepEqual(transport.unexpected, [], "every outbound read must be a canned publisher reply");
  assert.equal(transport.requested[0], requestedRobotsUrl, "publisher policy is settled before any page is requested");
  assert.equal(transport.robotsRequests().includes(destinationRobotsUrl), true, "the destination origin policy is read");
  assert.equal(transport.pageRequests().includes(requestedUrl), true, "the requested page is consulted to learn its destination");
  assert.equal(transport.pageRequests().includes(destinationUrl), true, "the allowed page is read at its destination");
  assert.equal(hydrated.content.includes(REDIRECT_ALLOWED_TEXT), true, "the allowed page's own text becomes the body");
  assert.equal(hydrated.retrieval, "approved-page-hydration", "the allowed page is promoted as an approved read");
  assert.equal(hydrated.evidencePolicy, "versioned", "the allowed page becomes versioned evidence");
  assert.equal(hydrated._answerEvidenceEligible, true, "the allowed page is answer evidence");
  assert.equal(sourceCanSupportPublicCitation(hydrated).eligible, true, "the allowed page can be cited");
});

test("the transport keeps every repeated X-Robots-Tag instance for its consumer", async () => {
  // A reader that keeps only the first instance, or that bounds the joined
  // value and loses what follows, silently drops a later exclusion. A noindex
  // in any instance must still exclude the page, and the same shape without
  // that directive must still hydrate, so the length alone is never the reason.
  const robotsUrl = "https://ohuseire.ee/robots.txt";
  const longPreamble = "noarchive ".repeat(30);
  const deniedUrl = "https://ohuseire.ee/uudised/korduv-paring-keelatud";
  const allowedUrl = "https://ohuseire.ee/uudised/korduv-paring-lubatud";
  const transport = createPublisherTransport({
    [robotsUrl]: { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /otsing\n" },
    [deniedUrl]: {
      status: 200,
      ...repeatedRobotsTag([longPreamble, "noindex"]),
      body: livePageBody(REPEATED_HEADER_DENIED_TEXT),
    },
    [allowedUrl]: {
      status: 200,
      ...repeatedRobotsTag([longPreamble, "max-snippet:-1"]),
      body: livePageBody(REPEATED_HEADER_ALLOWED_TEXT),
    },
  });
  const [refused, allowed] = await hydrateOfficialDocuments([
    liveCatalogueDocument(deniedUrl, 3),
    liveCatalogueDocument(allowedUrl, 4),
  ], 2, { requestText: transport.requestText });

  assert.deepEqual(transport.unexpected, [], "every outbound read must be a canned publisher reply");
  assert.deepEqual(
    transport.pageRequests().sort(),
    [deniedUrl, allowedUrl].sort(),
    "each page is read exactly once, so no refusal comes from a retry",
  );
  assert.equal(refused.content, "", "a noindex instance after the first one still excludes the page");
  assert.equal(refused.evidencePolicy, "route-only", "the excluded page keeps no evidence policy");
  assert.equal(refused._answerEvidenceEligible, false, "the excluded page is never answer evidence");
  assert.equal(
    JSON.stringify(refused).includes(REPEATED_HEADER_DENIED_TEXT),
    false,
    "no byte of the excluded page survives in the result",
  );
  assert.equal(allowed.content.includes(REPEATED_HEADER_ALLOWED_TEXT), true, "a page without a noindex instance still becomes a body");
  assert.equal(allowed.retrieval, "approved-page-hydration", "the allowed page is promoted as an approved read");
  assert.equal(allowed._answerEvidenceEligible, true, "the allowed page is answer evidence");
});

test("a repeated X-Robots-Tag keeps another crawler's scope out of this reader", async () => {
  // A scoped instance names the crawler it speaks to, so otherbot: noindex says
  // nothing about this reader. The generic instance alone decides for us: it
  // excludes the page when it says noindex, and it lets the page hydrate when it
  // says index. Both values arrive joined on headers, so only the separate
  // instances keep the scope from leaking into this reader's decision.
  const deniedUrl = "https://ohuseire.ee/uudised/teise-lugeja-keeld";
  const allowedUrl = "https://ohuseire.ee/uudised/teise-lugeja-luba";
  const transport = createPublisherTransport({
    "https://ohuseire.ee/robots.txt": { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nDisallow: /otsing\n" },
    [deniedUrl]: {
      status: 200,
      ...repeatedRobotsTag(["otherbot: noindex", "noindex"]),
      body: livePageBody(SCOPED_HEADER_DENIED_TEXT),
    },
    [allowedUrl]: {
      status: 200,
      ...repeatedRobotsTag(["otherbot: noindex", "index"]),
      body: livePageBody(SCOPED_HEADER_ALLOWED_TEXT),
    },
  });
  const [refused, allowed] = await hydrateOfficialDocuments([
    liveCatalogueDocument(deniedUrl, 5),
    liveCatalogueDocument(allowedUrl, 6),
  ], 2, { requestText: transport.requestText });

  assert.deepEqual(transport.unexpected, [], "every outbound read must be a canned publisher reply");
  assert.deepEqual(
    transport.pageRequests().sort(),
    [deniedUrl, allowedUrl].sort(),
    "each page is read exactly once, so no refusal comes from a retry",
  );
  assert.equal(
    refused.content,
    "",
    "the generic noindex instance excludes the page even beside an instance scoped to another crawler",
  );
  assert.equal(refused.evidencePolicy, "route-only", "the excluded page keeps no evidence policy");
  assert.equal(refused._answerEvidenceEligible, false, "the excluded page is never answer evidence");
  assert.equal(
    JSON.stringify(refused).includes(SCOPED_HEADER_DENIED_TEXT),
    false,
    "no byte of the excluded page survives in the result",
  );
  assert.equal(
    allowed.content.includes(SCOPED_HEADER_ALLOWED_TEXT),
    true,
    "a noindex scoped to another crawler does not exclude this reader",
  );
  assert.equal(allowed.retrieval, "approved-page-hydration", "the generic index instance lets the page hydrate");
  assert.equal(allowed._answerEvidenceEligible, true, "the allowed page is answer evidence");
});

test("public HTTPS JSON POST pins method, body contract and forbids redirects", async () => {
  const origins = new Set(["https://public.example"]);
  const body = JSON.stringify({ query: [{ code: "Aasta", values: ["2024"] }] });
  const calls = [];
  const result = await requestApprovedPublicHttpsJsonPost("https://public.example/stat", {
    approvedOrigins: origins,
    body,
    headers: {
      Authorization: "Bearer test-only",
      Host: "attacker.invalid",
      "X-Stainless-Retry-Count": "0",
    },
    maximumBytes: 64,
    maximumRequestBytes: 128,
    ca: "test-ca",
    family: 4,
    requestImpl: mockHttpsRequest([
      { status: 200, body: '{"value":[654301]}' },
    ], calls),
  });
  assert.equal(result.body, '{"value":[654301]}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Accept, "application/json");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.headers["Content-Length"], String(Buffer.byteLength(body)));
  assert.equal(calls[0].options.headers.authorization, "Bearer test-only");
  assert.equal(calls[0].options.headers["x-stainless-retry-count"], "0");
  assert.equal(calls[0].options.headers.host, undefined);
  assert.equal(calls[0].options.ca, "test-ca");
  assert.equal(calls[0].options.family, 4);
  assert.equal(typeof calls[0].options.lookup, "function");
  assert.equal(calls[0].body, body);

  await assert.rejects(requestApprovedPublicHttpsJsonPost("https://public.example/stat", {
    approvedOrigins: origins,
    body,
    requestImpl: mockHttpsRequest([
      { status: 307, headers: { location: "/other" } },
    ], []),
  }), /redirects are not allowed/u);
  await assert.rejects(requestApprovedPublicHttpsJsonPost("https://public.example/stat", {
    approvedOrigins: origins,
    body: "not json",
    requestImpl: mockHttpsRequest([], []),
  }), /invalid/u);
  await assert.rejects(requestApprovedPublicHttpsJsonPost("https://public.example/stat", {
    approvedOrigins: origins,
    body,
    maximumRequestBytes: Buffer.byteLength(body, "utf8") - 1,
    requestImpl: mockHttpsRequest([], []),
  }), /too large/u);
});

test("grounding audit approves every HTTPS locator in the official source catalogue", () => {
  assert.equal(AUDIT_CITATION_ORIGINS.has("https://tableau.envir.ee"), true);
  assert.equal(AUDIT_CITATION_ORIGINS.has("https://ec.europa.eu"), true);
  const reviewedNavigationUrls = new Set(REVIEWED_NAVIGATION_CITATION_URL_VALUES);
  for (const source of officialServiceCatalogueDocuments()) {
    for (const field of ["url", "locator"]) {
      const value = source[field];
      if (!value) continue;
      let url;
      try {
        url = new URL(value);
      } catch {
        continue;
      }
      if (url.protocol !== "https:") continue;
      // A reviewed navigation route is a page the reader may open, never a body
      // the audit fetches for evidence: citation-policy.mjs approves those exact
      // URLs and keeps their origin out of every allowlist on purpose. Only that
      // exact URL, and only while the entry stays route-only and ineligible as
      // answer evidence, is exempt. Every fetchable or citable locator, and the
      // route-only entries that are not reviewed navigation routes, keep the
      // invariant.
      if (reviewedNavigationUrls.has(value)
        && source.evidencePolicy === "route-only"
        && source._answerEvidenceEligible === false) continue;
      assert.equal(
        AUDIT_CITATION_ORIGINS.has(url.origin),
        true,
        `${source.id}.${field} uses an unapproved audit origin: ${url.origin}`,
      );
    }
  }
});
