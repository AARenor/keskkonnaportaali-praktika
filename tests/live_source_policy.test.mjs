// Publisher use policy on the live answer path.
//
// A publisher can keep a page in the index and still refuse to let a reader
// quote it. X-Robots-Tag `nosnippet` and `max-snippet` are the published way to
// say "link to this page, do not hand its prose to a reader", `noarchive` says
// "do not keep a copy", and a `data-nosnippet` section marks text that must not
// appear in a snippet. The live reader (sharedHydration -> fetchCached ->
// hydrateOfficialDocuments) hands fetched page text to the result list and, for
// an eligible catalogue entry, to the model. So the same directives have to be
// settled there, before the body is cached, before a summary is derived from it
// and before the entry can become answer evidence.
//
// Honouring these directives is this application's own choice. `nosnippet` and
// `max-snippet` are written for search engines, and a technical directive is
// not a licence, a permission or a legal conclusion of any kind: the recorded
// policy keeps `rightsReview` at "unreviewed" and nothing here may manufacture
// consent. What is tested is only what this code does with a copy: it withdraws
// it, caps it, or keeps it out of the cache.
//
// An X-Robots-Tag is addressed to a crawler, so its scope decides who it
// applies to. A value written for Googlebot, for a sibling crawler of this
// project or for any other robot says nothing about this reader, and a value
// for this reader says nothing about them. The announced product token is read
// from the outgoing User-Agent header, never pinned, so a renamed identity does
// not silently invalidate these cases.
//
// The expectations are written against behaviour a caller can see: the text the
// entry carries, the standing the evidence policy grants, what a second read
// does, and what the shared policy leaf can project out of the returned
// document. They do not pin the private shape of the reader's own fields.
//
// Everything here is synthetic: a stub transport, harmless HTML, no network.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { hydrateOfficialDocuments } from "../server/integrations.mjs";
import { evidenceDocumentsFromListing } from "../server/retrieval.mjs";
import {
  SOURCE_POLICY_VERSION,
  observeSourcePolicy,
  projectSourceText,
  sourcePolicyBinding,
} from "../server/source_policy.mjs";
import { sourceCopyWitness, sourceEvidenceEligibility } from "../server/source-registry.mjs";

const FILLER = "kontrollitud ametlik lehesisu ".repeat(8);
const VISIBLE_TEXT = "NAHTAV_LEHESISU";
const LATE_TEXT = "HILINE_LEHESISU";

function pageBody(sections) {
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>Ametlik leht</title></head>",
    "<body><main><article>",
    ...sections,
    "</article></main></body></html>",
  ].join("");
}

function copiedText(document) {
  return [document?.content, document?.summary, document?.excerpt, document?.evidenceExcerpt]
    .map((value) => String(value ?? ""))
    .join("\n");
}

// What the shared policy leaf can make of a returned document: the same call
// the delivery and evidence layers make, so a policy that never travelled with
// the body shows up here as a refusal instead of as a silent permission.
function projectionOf(document, purpose = "snippet") {
  return projectSourceText(document, { purpose, now: new Date() });
}

// A catalogue entry whose citable body only exists once the live answer path
// reads the page: this is the shape that takes the promotion branch.
function catalogueDocument(url, index) {
  return {
    id: `live-policy-source-${index}`,
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

// A federated discovery card: the summary is the publisher's own search blurb,
// so it is copied text as well, while title, URL and organization are the
// ordinary link metadata that survives any body decision.
function federatedCard(url, index) {
  return {
    id: `live-policy-card-${index}`,
    title: `Ametlik otsingukaart ${index}`,
    organization: "Keskkonnaamet",
    url,
    sourceTier: "official",
    retrieval: "official-federated-search",
    delivery: "federated-discovery",
    evidencePolicy: "route-only",
    _answerEvidenceEligible: false,
    summary: "Otsingukaardi kokkuvõte",
  };
}

// The stub answers one robots.txt per origin and resolves every page from the
// map. The product token is taken from the request's own User-Agent header, so
// the scoped cases follow the identity this reader actually announces.
function createStubTransport({ robots = "User-agent: *\nAllow: /\n", robotsStatus = 200, pages = {} } = {}) {
  const requested = [];
  const products = [];
  const requestText = async (value, options = {}) => {
    const href = new URL(String(value)).toString();
    const pathname = new URL(href).pathname;
    requested.push(href);
    const headers = options?.headers || {};
    const userAgent = String(headers["User-Agent"] ?? headers["user-agent"] ?? "");
    const product = userAgent.trim().split(/[\/\s(]/u)[0] || "";
    if (pathname === "/robots.txt") {
      products.push(product);
      return {
        status: robotsStatus,
        body: robots,
        headers: { "content-type": "text/plain" },
        url: href,
      };
    }
    const page = pages[href];
    assert.ok(page, `unexpected upstream page request: ${href}`);
    return {
      status: page.status ?? 200,
      body: typeof page.body === "function" ? page.body(product) : (page.body ?? ""),
      // A publisher writes a directive for the identity it receives, so a case
      // may build its headers from the announced product token as well.
      headers: typeof page.headers === "function"
        ? page.headers(product)
        : (page.headers ?? { "content-type": "text/html; charset=utf-8" }),
      url: href,
    };
  };
  return {
    requestText,
    requested,
    product() {
      assert.ok(products.length > 0, "the publisher policy must be read through the injected transport");
      const distinct = [...new Set(products)];
      assert.equal(distinct.length, 1, `one announced identity per policy read, saw ${JSON.stringify(distinct)}`);
      assert.notEqual(distinct[0], "", "the live reader must announce a product token");
      return distinct[0];
    },
    pageRequests() {
      return requested.filter((href) => new URL(href).pathname !== "/robots.txt");
    },
  };
}

// Link only: the address, title and publisher survive, no copied prose does,
// and no layer downstream can project the withdrawn text back out of the entry.
function assertLinkOnly(document, label) {
  assert.equal(copiedText(document).trim(), "", `${label}: no copied publisher text may survive`);
  assert.equal(document?.evidencePolicy, "route-only", `${label}: the entry must fall back to a route only card`);
  assert.equal(document?._answerEvidenceEligible, false, `${label}: the entry must not stay answer eligible`);
  assert.equal(sourceEvidenceEligibility(document || {}).eligible, false, `${label}: the entry must not be cited`);
  assert.equal(projectionOf(document).permitted, false, `${label}: no policy may be projected out of the entry`);
  assert.equal(typeof document?.url, "string", `${label}: the ordinary link metadata survives`);
  assert.equal(typeof document?.title, "string", `${label}: the title survives`);
}

test("a data-nosnippet section and hidden markup never become copied page text", async () => {
  const origin = "https://keskkonnaamet.ee";
  const nonce = Date.now();
  const url = `${origin}/et/nosnippet-osa-${nonce}`;
  const cardUrl = `${origin}/et/nosnippet-kaart-${nonce}`;
  const page = pageBody([
    `<p>${VISIBLE_TEXT} ${FILLER}</p>`,
    `<p data-nosnippet>PEIDETUD_OSA_SENTINEL ${FILLER}</p>`,
    `<div data-nosnippet><p>PEIDETUD_LOIK_SENTINEL ${FILLER}</p></div>`,
    `<p hidden>PEIDETUD_ATRIBUUT_SENTINEL ${FILLER}</p>`,
  ]);
  const transport = createStubTransport({
    pages: { [url]: { body: page }, [cardUrl]: { body: page } },
  });

  const [document, card] = await hydrateOfficialDocuments(
    [catalogueDocument(url, 1), federatedCard(cardUrl, 2)],
    2,
    { requestText: transport.requestText },
  );

  assert.match(String(document.content || ""), new RegExp(VISIBLE_TEXT, "u"), "the visible prose is still read");
  assert.doesNotMatch(copiedText(document), /PEIDETUD_OSA_SENTINEL/u, "a data-nosnippet section must not be copied");
  assert.doesNotMatch(copiedText(document), /PEIDETUD_LOIK_SENTINEL/u, "a marked container must not be copied");
  assert.doesNotMatch(copiedText(document), /PEIDETUD_ATRIBUUT_SENTINEL/u, "hidden markup must not be copied");

  // The discovery card's summary is derived from the same body, so it is the
  // public summary and the model facing excerpt that must stay clean as well.
  assert.match(String(card.summary || ""), new RegExp(VISIBLE_TEXT, "u"));
  assert.doesNotMatch(copiedText(card), /PEIDETUD_/u, "a summary derived from the body must stay clean too");

  const projection = projectionOf(document);
  assert.equal(projection.permitted, true, "an undirected page still yields copied text");
  assert.equal(projection.policy.version, SOURCE_POLICY_VERSION);
  assert.equal(
    projection.policy.rightsReview.status,
    "unreviewed",
    "a technical policy never manufactures a rights decision",
  );
  assert.doesNotMatch(
    String(projectionOf(card, "evidence").text || ""),
    /PEIDETUD_/u,
    "the model facing projection must not contain an excluded section",
  );
});

test("an X-Robots-Tag nosnippet withdraws the copied text and the cached body", async () => {
  const origin = "https://www.kliimaministeerium.ee";
  const url = `${origin}/et/nosnippet-leht-${Date.now()}`;
  const excludedTransport = createStubTransport({
    pages: {
      [url]: {
        body: pageBody([`<p>KEELATUD_SNIPPET_SENTINEL ${FILLER}</p>`]),
        headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "nosnippet" },
      },
    },
  });
  const [withheld] = await hydrateOfficialDocuments([catalogueDocument(url, 1)], 1, {
    requestText: excludedTransport.requestText,
  });
  assertLinkOnly(withheld, "X-Robots-Tag nosnippet");
  assert.equal(excludedTransport.pageRequests().length, 1, "the page is read once so its own policy can be seen");

  // The withdrawn body was never cached, so the same URL read again through a
  // now permitted answer is read from the publisher instead of from the cache.
  const permittedTransport = createStubTransport({
    pages: { [url]: { body: pageBody([`<p>${VISIBLE_TEXT} ${FILLER}</p>`]) } },
  });
  const [permitted] = await hydrateOfficialDocuments([catalogueDocument(url, 2)], 1, {
    requestText: permittedTransport.requestText,
  });
  assert.equal(permittedTransport.pageRequests().length, 1, "the withdrawn body must not be left in the cache");
  assert.match(String(permitted.content || ""), new RegExp(VISIBLE_TEXT, "u"), "an undirected page still works");
  assert.doesNotMatch(copiedText(permitted), /KEELATUD_SNIPPET_SENTINEL/u, "the old body is gone");
});

test("max-snippet:0 is the same link only decision as nosnippet", async () => {
  const origin = "https://gsavalik.envir.ee";
  const url = `${origin}/et/null-piir-${Date.now()}`;
  const transport = createStubTransport({
    pages: {
      [url]: {
        body: pageBody([`<p>NULL_PIIR_SENTINEL ${FILLER}</p>`]),
        headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "max-snippet: 0" },
      },
    },
  });
  const [document] = await hydrateOfficialDocuments([catalogueDocument(url, 1)], 1, {
    requestText: transport.requestText,
  });
  assertLinkOnly(document, "X-Robots-Tag max-snippet:0");
});

test("a finite max-snippet caps the copied body for display and for evidence", async () => {
  const origin = "https://avaandmed.keskkonnaportaal.ee";
  const url = `${origin}/et/piiratud-loiend-${Date.now()}`;
  const transport = createStubTransport({
    pages: {
      [url]: {
        body: pageBody([
          `<p>${VISIBLE_TEXT} ${FILLER}</p>`,
          `<p>${LATE_TEXT} ${FILLER}</p>`,
        ]),
        headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "max-snippet: 200" },
      },
    },
  });
  const [first] = await hydrateOfficialDocuments([catalogueDocument(url, 1)], 1, {
    requestText: transport.requestText,
  });
  const firstContent = String(first.content || "");
  assert.ok(firstContent.length > 0, "a finite limit still permits a bounded excerpt");
  assert.ok(firstContent.length <= 200, `the publisher cap was exceeded: ${firstContent.length} characters`);
  assert.doesNotMatch(firstContent, new RegExp(LATE_TEXT, "u"), "text beyond the cap must not be copied");
  const firstSnippet = projectionOf(first);
  assert.equal(firstSnippet.permitted, true);
  const firstEvidence = projectionOf(first, "evidence");
  assert.ok(
    String(firstEvidence.text || "").length <= 200,
    "an evidence projection cannot widen the copied text past the publisher cap",
  );

  // The same decision must come back with a cached body: a cached copy that
  // lost its witness would let a later answer quote past the cap.
  const [second] = await hydrateOfficialDocuments([catalogueDocument(url, 2)], 1, {
    requestText: transport.requestText,
  });
  assert.equal(transport.pageRequests().length, 1, "the second read reused the cached body");
  const secondContent = String(second.content || "");
  assert.ok(secondContent.length > 0 && secondContent.length <= 200, "a cached body is capped the same way");
  assert.equal(
    projectionOf(second).binding,
    firstSnippet.binding,
    "the cached body keeps the policy it was observed under",
  );
});

test("noarchive is served for the current answer but never retained", async () => {
  const origin = "https://airviro.klab.ee";
  const url = `${origin}/et/arhiivikeeld-${Date.now()}`;
  let served = 0;
  const requestText = async (value) => {
    const href = new URL(String(value)).toString();
    if (new URL(href).pathname === "/robots.txt") {
      return { status: 200, body: "User-agent: *\nAllow: /\n", headers: { "content-type": "text/plain" }, url: href };
    }
    served += 1;
    return {
      status: 200,
      body: pageBody([`<p>${VISIBLE_TEXT} ${served} ${FILLER}</p>`]),
      headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noarchive" },
      url: href,
    };
  };
  const [first] = await hydrateOfficialDocuments([catalogueDocument(url, 1)], 1, { requestText });
  assert.match(String(first.content || ""), new RegExp(VISIBLE_TEXT, "u"), "the current answer may still read it");
  assert.match(String(first.content || ""), /NAHTAV_LEHESISU 1 /u, "the first read is the one that was served");

  const [second] = await hydrateOfficialDocuments([catalogueDocument(url, 2)], 1, { requestText });
  assert.equal(served, 2, "a noarchive body must not be retained for the next answer");
  assert.match(String(second.content || ""), /NAHTAV_LEHESISU 2 /u, "the second answer is a fresh read");
});

test("directives scoped to another crawler leave this reader's snippet untouched", async () => {
  const origin = "https://rmk.ee";
  const nonce = Date.now();
  const googlebotUrl = `${origin}/et/teise-roboti-${nonce}`;
  const siblingUrl = `${origin}/et/teise-tuote-${nonce}`;
  const oursUrl = `${origin}/et/meie-${nonce}`;
  const transport = createStubTransport({
    pages: {
      // Written for Googlebot: not ours to obey, and it must not shorten ours.
      [googlebotUrl]: {
        body: pageBody([`<p>GOOGLEBOT_ULETUS ${FILLER}</p>`]),
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-robots-tag": ["googlebot: nosnippet, max-snippet:0", "index, follow"],
        },
      },
      // Written for the background corpus crawler of this same project. The
      // sibling announces its own token, so it is a different reader.
      [siblingUrl]: {
        body: pageBody([`<p>${VISIBLE_TEXT} ${FILLER}</p>`]),
        headers: (product) => ({
          "content-type": "text/html; charset=utf-8",
          "x-robots-tag": `${product}-corpus: nosnippet`,
        }),
      },
      // Written for the token this reader announces, and repeated after a
      // generic instance that says index: the second value is still ours, so
      // the instance boundary must not lose it.
      [oursUrl]: {
        body: pageBody([`<p>MEIE_SENTINEL ${FILLER}</p>`]),
        headers: (product) => ({
          "content-type": "text/html; charset=utf-8",
          "x-robots-tag": ["index, follow", `${product}: nosnippet`],
        }),
      },
    },
  });
  const [googlebot, sibling, ours] = await hydrateOfficialDocuments(
    [catalogueDocument(googlebotUrl, 1), catalogueDocument(siblingUrl, 2), catalogueDocument(oursUrl, 3)],
    3,
    { requestText: transport.requestText },
  );
  const announced = transport.product();

  assert.match(
    String(googlebot.content || ""),
    /GOOGLEBOT_ULETUS/u,
    "a directive addressed to Googlebot says nothing about this reader",
  );
  assert.equal(sourceEvidenceEligibility(googlebot).eligible, true, "the Googlebot scoped page stays citable");
  assert.match(
    String(sibling.content || ""),
    new RegExp(VISIBLE_TEXT, "u"),
    `a directive addressed to ${announced}-corpus is another reader's`,
  );
  assert.equal(
    sourceEvidenceEligibility(sibling).eligible,
    true,
    `a directive addressed to ${announced}-corpus cannot withdraw our evidence`,
  );
  assertLinkOnly(ours, `a directive addressed to ${announced}`);
});

test("an unattributable policy witness is never promoted to evidence", async () => {
  const origin = "https://tableau.envir.ee";
  const url = `${origin}/et/liiga-pikk-poliitika-${Date.now()}`;
  const transport = createStubTransport({
    pages: {
      [url]: {
        body: pageBody([`<p>PIKKA_POLIITIKA_SENTINEL ${FILLER}</p>`]),
        headers: {
          "content-type": "text/html; charset=utf-8",
          // More instances than this reader will attribute, so an exclusion
          // could be sitting past the cut. The block fails closed.
          "x-robots-tag": Array.from({ length: 66 }, () => "index"),
        },
      },
    },
  });
  const [document] = await hydrateOfficialDocuments([catalogueDocument(url, 1)], 1, {
    requestText: transport.requestText,
  });
  assertLinkOnly(document, "unattributable X-Robots-Tag block");
});

test("ordinary approved content still hydrates, keeps its policy and stays citable", async () => {
  const origin = "https://www.ilmateenistus.ee";
  const url = `${origin}/et/tavaline-leht-${Date.now()}`;
  const transport = createStubTransport({
    pages: { [url]: { body: pageBody([`<p>${VISIBLE_TEXT} ${FILLER}</p>`]) } },
  });
  const [document] = await hydrateOfficialDocuments([catalogueDocument(url, 1)], 1, {
    requestText: transport.requestText,
  });
  assert.match(String(document.content || ""), new RegExp(VISIBLE_TEXT, "u"));
  assert.equal(document.retrieval, "approved-page-hydration");
  assert.equal(document.evidencePolicy, "versioned");
  assert.equal(document._answerEvidenceEligible, true);
  assert.equal(document._evidenceVersion, document._contentHash);
  assert.equal(sourceEvidenceEligibility(document).eligible, true);

  const projection = projectionOf(document);
  assert.equal(projection.permitted, true);
  assert.equal(projection.policy.version, SOURCE_POLICY_VERSION);
  assert.equal(projection.policy.contentKind, "fetched-html");
  assert.equal(projection.policy.robots.status, "allowed", "an allowing robots.txt is recorded as such");
  assert.deepEqual(
    { ...projection.policy.directives },
    { noindex: false, nosnippet: false, noarchive: false, maxSnippetChars: null },
    "an undirected page keeps every copied form available",
  );
  assert.deepEqual(
    { ...projection.policy.use },
    { retainBody: true, indexBody: true, displaySnippet: true, answerEvidence: true },
    "ordinary content keeps every capability",
  );
  assert.equal(typeof projection.binding, "string", "the decision is bound to the exact body");
  assert.equal(
    projection.policy.rightsReview.status,
    "unreviewed",
    "a technical policy never manufactures a rights decision",
  );
});

test("an origin without a policy file still clears the page, and a card keeps a capped summary", async () => {
  // A 404 or 410 says this origin has no policy file, so there is no rule to
  // obey and the page stays readable.
  const origin = "https://ilmateenistus.ee";
  const url = `${origin}/et/poliitikafailita-${Date.now()}`;
  const transport = createStubTransport({
    robots: "No policy file",
    robotsStatus: 404,
    pages: { [url]: { body: pageBody([`<p>${VISIBLE_TEXT} ${FILLER}</p>`]) } },
  });
  const [card] = await hydrateOfficialDocuments([federatedCard(url, 1)], 1, {
    requestText: transport.requestText,
  });
  assert.equal(card._pageHydrated, true, "the card shows the page it was hydrated from");
  assert.equal(card.evidencePolicy, "route-only", "a discovery card is not answer evidence");
  assert.match(String(card.summary || ""), new RegExp(VISIBLE_TEXT, "u"));
  assert.doesNotMatch(String(card.summary || ""), /Otsingukaardi kokkuvõte/u, "index prose is replaced by the page");
  assert.equal(projectionOf(card).policy.robots.status, "absent", "an absent policy file is recorded as absent");
});

// An earlier read of the same page left its own observation on the record. The
// observation is permitted and verifies against the binding it published, so a
// failure below cannot come from the fixture itself: it can only come from the
// refresh inheriting a binding that belongs to the body it replaced.
const EARLIER_PRODUCT = "Keskkonnaportaali-praktika";
const EARLIER_TEXT = "VAREM_LOETUD_POLIITIKA lühike varasem lehesisu";

function digestOf(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function earlierPermittedRecord(url, index) {
  const observedAt = new Date(Date.now() - 3 * 60 * 60 * 1_000).toISOString();
  const policy = observeSourcePolicy({
    requestedUrl: url,
    finalUrl: url,
    product: EARLIER_PRODUCT,
    observedAt,
    contentKind: "fetched-html",
    bodyHash: digestOf(`<html><body>${EARLIER_TEXT}</body></html>`),
    robotsObservation: { status: "allowed", checkedAt: observedAt },
    html: `<html><body><main><p>${EARLIER_TEXT}</p></main></body></html>`,
  });
  return {
    ...catalogueDocument(url, index),
    // Shorter than the reader's 120 character floor, so the refresh is actually
    // attempted instead of reusing the stored body.
    content: EARLIER_TEXT,
    _contentHash: digestOf(EARLIER_TEXT),
    _sourcePolicy: policy,
    _sourcePolicyBinding: sourcePolicyBinding(policy),
  };
}

test("a refreshed page witness replaces the binding it inherited from the earlier record", async () => {
  const origin = "https://www.keskkonnaagentuur.ee";
  const url = `${origin}/et/varske-tunnistus-${Date.now()}`;
  const earlier = earlierPermittedRecord(url, 1);
  const transport = createStubTransport({
    pages: { [url]: { body: pageBody([`<p>${VISIBLE_TEXT} ${FILLER}</p>`]) } },
  });

  // Sensitivity control: the earlier record's own witness verifies, so it is a
  // permitted existing witness and not a record that was already refused.
  const earlierWitness = sourceCopyWitness(earlier);
  assert.equal(earlierWitness.reason, null, `the earlier witness must verify, got ${earlierWitness.reason}`);
  assert.equal(earlierWitness.binding, earlier._sourcePolicyBinding);

  const [refreshed] = await hydrateOfficialDocuments([earlier], 1, { requestText: transport.requestText });
  assert.equal(transport.pageRequests().length, 1, "the short earlier body is refreshed from the publisher");
  assert.match(String(refreshed.content || ""), new RegExp(VISIBLE_TEXT, "u"), "the refreshed body is the new one");
  assert.doesNotMatch(String(refreshed.content || ""), new RegExp(EARLIER_TEXT, "u"), "the replaced body is gone");

  const witness = sourceCopyWitness(refreshed);
  assert.equal(
    witness.reason,
    null,
    `a refreshed permitted body must carry a witness that verifies, got ${witness.reason}`,
  );
  assert.equal(typeof witness.binding, "string");
  assert.notEqual(
    witness.binding,
    earlier._sourcePolicyBinding,
    "the refresh observed its own decision, so its binding cannot stay the earlier one",
  );
  assert.equal(sourceEvidenceEligibility(refreshed).eligible, true);

  // The consumer path the answer actually uses: a record whose witness does not
  // verify is dropped before it can reach the model, so this is the boundary
  // that a stale binding breaks.
  const evidence = evidenceDocumentsFromListing({ items: [refreshed] });
  assert.equal(evidence.length, 1, "the refreshed record must still reach the model as evidence");
  assert.match(String(evidence[0].content || ""), new RegExp(VISIBLE_TEXT, "u"), "the copied evidence is the new body");

  // Control: the same fresh policy beside the inherited binding is refused, so
  // the check above is the mismatch and not a blanket pass.
  const inheritedBinding = { ...refreshed, _sourcePolicyBinding: earlier._sourcePolicyBinding };
  assert.equal(
    sourceCopyWitness(inheritedBinding).reason,
    "source-policy-mismatch",
    "a binding that does not match the policy must never verify",
  );
  assert.deepEqual(
    evidenceDocumentsFromListing({ items: [inheritedBinding] }),
    [],
    "a record with a mismatched binding is not offered to the model",
  );
});
