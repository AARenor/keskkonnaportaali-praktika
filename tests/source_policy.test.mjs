import assert from "node:assert/strict";
import test from "node:test";
import { parseRobotsTxt as corpusParseRobotsTxt } from "../server/corpus.mjs";
import {
  SOURCE_POLICY_PRODUCT,
  SOURCE_POLICY_VERSION,
  extractSourceText,
  observeSourcePolicy,
  pageRobotsPolicy,
  parseRobotsTxt,
  projectSourceText,
  robotsAllowsUrl,
  sourcePolicyBinding,
} from "../server/source_policy.mjs";

// The portal announces one product token on its own requests. Every scoped
// header, meta tag and robots.txt group below is written from this constant, so
// a rename of the announced identity stays one edit and never turns a scope test
// into a silently skipped case.
const PRODUCT = SOURCE_POLICY_PRODUCT;
const HIDDEN = "SALAJANE-VAHETEKST";
const VISIBLE = "Metsamaa pindala oli 2,3 miljonit hektarit.";
const PAGE_URL = "https://www.keskkonnaportaal.ee/et/teemad/mets/metsastatistika";
const OBSERVED_AT = "2026-11-11T06:00:00.000Z";
const NOW = new Date("2026-11-11T12:00:00.000Z");

function syntheticPage({ body = `<p>${VISIBLE}</p>`, head = "" } = {}) {
  return `<!doctype html><html lang="et"><head><title>Mets</title>${head}</head>`
    + `<body><main><h1>Mets</h1>${body}</main></body></html>`;
}

function allowedRobots(overrides = {}) {
  return {
    status: "allowed",
    origin: "https://www.keskkonnaportaal.ee",
    checkedAt: OBSERVED_AT,
    ...overrides,
  };
}

function observe(overrides = {}) {
  return observeSourcePolicy({
    requestedUrl: PAGE_URL,
    finalUrl: PAGE_URL,
    product: PRODUCT,
    observedAt: OBSERVED_AT,
    contentKind: "fetched-html",
    bodyHash: "a".repeat(64),
    artifactHash: "b".repeat(64),
    robotsObservation: allowedRobots(),
    html: syntheticPage(),
    headerInstances: [],
    ...overrides,
  });
}

function catalogueDocument(policy, overrides = {}) {
  return {
    url: PAGE_URL,
    title: "Metsastatistika",
    organization: "Keskkonnaagentuur",
    publishedAt: "2026-10-01",
    updatedAt: "2026-11-02",
    summary: VISIBLE,
    content: `${VISIBLE} ${"lause ".repeat(120)}`,
    excerpt: VISIBLE,
    evidenceExcerpt: VISIBLE,
    answer: `${VISIBLE} Kokkuvõte.`,
    metadata: { source_policy: policy },
    ...overrides,
  };
}

test("robots.txt selects the group that names this reader, not every matching group", () => {
  const rules = parseRobotsTxt([
    "User-agent: *",
    "Disallow: /",
    "",
    `User-agent: ${PRODUCT}`,
    "Disallow: /et/keelatud",
    "Allow: /et/keelatud/avalik",
    "",
  ].join("\n"), PRODUCT);
  assert.equal(robotsAllowsUrl("https://www.keskkonnaportaal.ee/et/lubatud", rules), true);
  assert.equal(robotsAllowsUrl("https://www.keskkonnaportaal.ee/et/keelatud", rules), false);
  assert.equal(robotsAllowsUrl("https://www.keskkonnaportaal.ee/et/keelatud/avalik/leht", rules), true);
});

test("a Googlebot robot group is another crawler's and never selects for this reader", () => {
  const googlebotOnly = parseRobotsTxt([
    "User-agent: Googlebot",
    "Disallow: /",
  ].join("\n"), PRODUCT);
  assert.deepEqual(googlebotOnly, []);
  assert.equal(robotsAllowsUrl(PAGE_URL, googlebotOnly), true);

  const wildcard = parseRobotsTxt([
    "User-agent: Googlebot",
    "Allow: /",
    "",
    "User-agent: *",
    "Disallow: /",
  ].join("\n"), PRODUCT);
  assert.equal(robotsAllowsUrl(PAGE_URL, wildcard), false);

  const named = parseRobotsTxt([
    "User-agent: Googlebot",
    "Disallow: /",
    "",
    `User-agent: ${PRODUCT}`,
    "Allow: /",
  ].join("\n"), PRODUCT);
  assert.equal(robotsAllowsUrl(PAGE_URL, named), true);
});

test("robots.txt reading fails closed on unreadable input", () => {
  const rules = parseRobotsTxt("User-agent: *\nDisallow: /privaatne\n", PRODUCT);
  assert.equal(robotsAllowsUrl("mitte-url", rules), false);
  assert.equal(robotsAllowsUrl("https://www.keskkonnaportaal.ee/privaatne", rules), false);
  assert.equal(robotsAllowsUrl(PAGE_URL, [{ type: "allow", pattern: "/", specificity: 1 }]), true);
  assert.equal(
    robotsAllowsUrl(PAGE_URL, new Array(300).fill({ type: "allow", pattern: "/", specificity: 1 })),
    false,
  );
  assert.throws(() => parseRobotsTxt("Disallow: /".padEnd(70_000, "a"), PRODUCT), /robots\.txt/u);
});

test("repeated X-Robots-Tag values keep their own crawler scope", () => {
  const policy = pageRobotsPolicy(syntheticPage(), [
    "muu-korjelaine-robot: noindex, nosnippet, noarchive",
    "index, follow, max-snippet:-1",
  ], PRODUCT);
  assert.equal(policy.noindex, false);
  assert.equal(policy.nosnippet, false);
  assert.equal(policy.noarchive, false);
  assert.equal(policy.maxSnippetChars, null);
  assert.deepEqual(policy.observations.otherScopes, ["muu-korjelaine-robot"]);
});

test("a Googlebot-scoped header does not change this reader's use", () => {
  // The transport reports repeated header values as separate instances, so this
  // is the shape a real response arrives in and the scope is unambiguous.
  const policy = pageRobotsPolicy(syntheticPage(), ["googlebot: noindex, nosnippet, noarchive"], PRODUCT);
  assert.equal(policy.noindex, false);
  assert.equal(policy.nosnippet, false);
  assert.equal(policy.noarchive, false);
  assert.deepEqual(policy.observations.otherScopes, ["googlebot"]);
});

test("the product's own X-Robots-Tag scope applies to its reader", () => {
  const policy = pageRobotsPolicy(syntheticPage(), `${PRODUCT}: nosnippet, noarchive`, PRODUCT);
  assert.equal(policy.noindex, false);
  assert.equal(policy.nosnippet, true);
  assert.equal(policy.noarchive, true);
});

test("a value without a crawler scope applies to every reader", () => {
  const policy = pageRobotsPolicy(syntheticPage(), ["noindex, nosnippet, noarchive"], PRODUCT);
  assert.equal(policy.noindex, true);
  assert.equal(policy.nosnippet, true);
  assert.equal(policy.noarchive, true);
});

test("max-snippet numbers are read, spaced values included, and the tightest cap wins", () => {
  assert.equal(pageRobotsPolicy(syntheticPage(), ["max-snippet: 120"], PRODUCT).maxSnippetChars, 120);
  assert.equal(
    pageRobotsPolicy(syntheticPage(), ["max-snippet:400", "max-snippet:120"], PRODUCT).maxSnippetChars,
    120,
  );
  assert.equal(pageRobotsPolicy(syntheticPage(), ["max-snippet:-1"], PRODUCT).maxSnippetChars, null);
  assert.equal(pageRobotsPolicy(syntheticPage(), ["max-snippet:0"], PRODUCT).maxSnippetChars, 0);
  const unreadable = pageRobotsPolicy(syntheticPage(), ["max-snippet:palju"], PRODUCT);
  assert.equal(unreadable.maxSnippetChars, 0);
  assert.equal(unreadable.ambiguous, true);
});

test("an unknown directive is preserved as an observation and decides nothing", () => {
  const policy = pageRobotsPolicy(syntheticPage(), ["noai, noimageai"], PRODUCT);
  assert.deepEqual([...policy.observations.unknown].sort(), ["noai", "noimageai"]);
  assert.equal(policy.noindex, false);
  assert.equal(policy.nosnippet, false);
  assert.equal(policy.noarchive, false);
  assert.equal(policy.maxSnippetChars, null);
});

test("an X-Robots-Tag block beyond the scan bound fails closed", () => {
  const policy = pageRobotsPolicy(syntheticPage(), new Array(70).fill("noarchive"), PRODUCT);
  assert.equal(policy.truncated, true);
  assert.equal(policy.noindex, true);
  assert.equal(policy.nosnippet, true);
  assert.equal(policy.noarchive, true);
  assert.equal(policy.maxSnippetChars, 0);
});

test("a joined header value that mixes another crawler with an exclusion is ambiguous", () => {
  const policy = pageRobotsPolicy(syntheticPage(), "muu-robot: noindex, nosnippet", PRODUCT);
  assert.equal(policy.ambiguous, true);
  assert.equal(policy.noindex, true);
  assert.equal(policy.nosnippet, true);
});

test("meta robots and the product's own meta apply, another product's meta does not", () => {
  const html = syntheticPage({
    head: [
      '<meta name="robots" content="noarchive">',
      '<meta name="googlebot" content="noindex, nosnippet">',
      `<meta name="${PRODUCT}" content="max-snippet:0">`,
    ].join(""),
  });
  const policy = pageRobotsPolicy(html, [], PRODUCT);
  assert.equal(policy.noindex, false);
  assert.equal(policy.nosnippet, false);
  assert.equal(policy.noarchive, true);
  assert.equal(policy.maxSnippetChars, 0);
});

test("an empty header witness with no page is unreadable, not permissive", () => {
  const witness = pageRobotsPolicy("", [], PRODUCT);
  assert.equal(witness.readable, true);
  assert.equal(witness.noindex, false);
  const missing = pageRobotsPolicy(undefined, undefined, PRODUCT);
  assert.equal(missing.readable, false);
  assert.equal(missing.noindex, true);
  assert.equal(missing.nosnippet, true);
  assert.equal(missing.maxSnippetChars, 0);
});

test("a data-nosnippet section is removed before text extraction", () => {
  const html = syntheticPage({
    body: `<p>${VISIBLE}</p><div data-nosnippet><p>${HIDDEN}</p><span>${HIDDEN}</span></div>`,
  });
  const text = extractSourceText(html);
  assert.match(text, /Metsamaa pindala/u);
  assert.equal(text.includes(HIDDEN), false);
});

test("nodes a reader never renders are not copied", () => {
  const html = syntheticPage({
    body: `<p>${VISIBLE}</p><script>var ${HIDDEN} = 1;</script>`
      + `<style>.${HIDDEN} { color: red }</style><noscript>${HIDDEN}</noscript>`
      + `<template>${HIDDEN}</template><p hidden>${HIDDEN}</p>`,
  });
  assert.equal(extractSourceText(html).includes(HIDDEN), false);
});

test("an old or unknown copied body fails closed", () => {
  for (const contentKind of ["legacy-unknown", "midagi-muud", undefined]) {
    const policy = observe({ contentKind });
    assert.equal(policy.contentKind, "legacy-unknown");
    assert.deepEqual(policy.use, {
      retainBody: false,
      indexBody: false,
      displaySnippet: false,
      answerEvidence: false,
    });
    assert.deepEqual(policy.rightsReview, { status: "unreviewed", reference: null });
    assert.equal(policy.version, SOURCE_POLICY_VERSION);
  }
});

test("a fetched page without a robots witness fails closed", () => {
  const policy = observe({ robotsObservation: null });
  assert.equal(policy.robots.status, "unreadable");
  assert.deepEqual(policy.use, {
    retainBody: false,
    indexBody: false,
    displaySnippet: false,
    answerEvidence: false,
  });
  assert.ok(policy.resourceKey, "the link identity survives a withheld body");
});

test("a robots.txt disallow withholds copied text and keeps the link identity", () => {
  const policy = observe({ robotsObservation: allowedRobots({ status: "disallowed" }) });
  assert.deepEqual(policy.use, {
    retainBody: false,
    indexBody: false,
    displaySnippet: false,
    answerEvidence: false,
  });
  const projected = projectSourceText(catalogueDocument(policy), { purpose: "snippet", now: NOW });
  assert.equal(projected.permitted, false);
  assert.equal(projected.reason, "robots-disallowed");
  assert.equal(projected.text, null);
  assert.equal(projected.link.url, PAGE_URL);
});

test("noindex stops indexing, copied snippets, model evidence and retention", () => {
  const policy = observe({
    html: syntheticPage({ head: '<meta name="robots" content="noindex">' }),
  });
  assert.equal(policy.directives.noindex, true);
  assert.deepEqual(policy.use, {
    retainBody: false,
    indexBody: false,
    displaySnippet: false,
    answerEvidence: false,
  });
});

test("nosnippet stops copied snippets and model evidence but keeps indexing and retention", () => {
  const policy = observe({
    html: syntheticPage({ head: '<meta name="robots" content="nosnippet">' }),
  });
  assert.deepEqual(policy.use, {
    retainBody: true,
    indexBody: true,
    displaySnippet: false,
    answerEvidence: false,
  });
});

test("max-snippet:0 behaves like nosnippet and a finite cap keeps both uses", () => {
  const zero = observe({
    html: syntheticPage({ head: '<meta name="robots" content="max-snippet:0">' }),
  });
  assert.equal(zero.directives.maxSnippetChars, 0);
  assert.deepEqual(zero.use, {
    retainBody: true,
    indexBody: true,
    displaySnippet: false,
    answerEvidence: false,
  });
  const finite = observe({
    html: syntheticPage({ head: '<meta name="robots" content="max-snippet:50">' }),
  });
  assert.equal(finite.directives.maxSnippetChars, 50);
  assert.deepEqual(finite.use, {
    retainBody: true,
    indexBody: true,
    displaySnippet: true,
    answerEvidence: true,
  });
});

test("noarchive disables retention without touching display", () => {
  const policy = observe({
    html: syntheticPage({ head: '<meta name="robots" content="noarchive">' }),
  });
  assert.deepEqual(policy.use, {
    retainBody: false,
    indexBody: true,
    displaySnippet: true,
    answerEvidence: true,
  });
});

test("a public URL and a permissive robots witness never fill in a licence", () => {
  const policy = observe({ licence: "public", license: "open", permission: "granted" });
  assert.deepEqual(policy.rightsReview, { status: "unreviewed", reference: null });
  assert.deepEqual([...policy.observations.ignoredClaims].sort(), ["licence", "license", "permission"]);
  const reviewed = observe({ rightsReview: { status: "reviewed", reference: "oigusosakond-2026-11-11" } });
  assert.deepEqual(reviewed.rightsReview, { status: "reviewed", reference: "oigusosakond-2026-11-11" });
});

test("a permitted snippet keeps link metadata separate from the capped copy", () => {
  const policy = observe();
  const document = catalogueDocument(policy);
  const before = structuredClone(document);
  const projected = projectSourceText(document, { purpose: "snippet", now: NOW });
  assert.equal(projected.permitted, true);
  assert.equal(projected.textField, "summary");
  assert.ok(projected.text.length <= 320);
  assert.equal(projected.link.url, PAGE_URL);
  assert.equal(projected.link.title, "Metsastatistika");
  assert.equal(projected.link.organization, "Keskkonnaagentuur");
  assert.equal(projected.document.content, undefined, "a snippet purpose must not keep the copied body");
  assert.equal(projected.document.evidenceExcerpt, undefined);
  assert.equal(projected.document._sourcePolicy, undefined);
  assert.deepEqual(document, before, "the catalogue record is not mutated");
});

test("a finite max-snippet cap also caps model evidence", () => {
  const policy = observe({
    html: syntheticPage({ head: '<meta name="robots" content="max-snippet:50">' }),
  });
  const document = catalogueDocument(policy, {
    summary: "x".repeat(400),
    content: "y".repeat(4_000),
    excerpt: "z".repeat(400),
    evidenceExcerpt: "e".repeat(400),
  });
  const snippet = projectSourceText(document, { purpose: "snippet", now: NOW });
  const evidence = projectSourceText(document, { purpose: "evidence", now: NOW });
  assert.ok(snippet.text.length <= 50);
  assert.ok(evidence.text.length <= 50);
  assert.equal(evidence.permitted, true);
  assert.equal(evidence.textLimit, 50);
});

test("nosnippet withholds every copied field and the link metadata survives", () => {
  const policy = observe({
    html: syntheticPage({ head: '<meta name="robots" content="nosnippet, noarchive">' }),
  });
  const projected = projectSourceText(catalogueDocument(policy), { purpose: "snippet", now: NOW });
  assert.equal(projected.permitted, false);
  assert.equal(projected.text, null);
  assert.equal(projected.reason, "nosnippet");
  assert.equal(projected.link.url, PAGE_URL);
  assert.equal(projected.link.title, "Metsastatistika");
  assert.deepEqual(
    [...projected.withheld.map((entry) => entry.field)].sort(),
    ["answer", "content", "evidenceExcerpt", "excerpt", "summary"],
  );
});

test("a missing or unknown stored policy fails closed", () => {
  const document = { url: PAGE_URL, title: "Mets", summary: VISIBLE, content: VISIBLE };
  const missing = projectSourceText(document, { purpose: "snippet", now: NOW });
  assert.equal(missing.permitted, false);
  assert.equal(missing.reason, "source-policy-missing");
  assert.equal(missing.link.url, PAGE_URL);
  const unknown = projectSourceText({
    ...document,
    metadata: {
      source_policy: {
        version: "source-policy-v0",
        use: { retainBody: true, indexBody: true, displaySnippet: true, answerEvidence: true },
      },
    },
  }, { purpose: "snippet", now: NOW });
  assert.equal(unknown.permitted, false);
  assert.equal(unknown.reason, "source-policy-invalid");
  assert.equal(unknown.binding, null);
});

test("the internal projection decides over a stored copy that promised more", () => {
  const permitting = observe();
  const denying = observe({
    html: syntheticPage({ head: '<meta name="robots" content="nosnippet">' }),
  });
  const document = catalogueDocument(permitting, { _sourcePolicy: denying });
  const projected = projectSourceText(document, { purpose: "snippet", now: NOW });
  assert.equal(projected.permitted, false);
  assert.equal(projected.reason, "nosnippet");
});

test("noarchive denies retention and leaves the display decision alone", () => {
  const policy = observe({
    html: syntheticPage({ head: '<meta name="robots" content="noarchive">' }),
  });
  const document = catalogueDocument(policy);
  const cache = projectSourceText(document, { purpose: "cache", now: NOW });
  assert.equal(cache.permitted, false);
  assert.equal(cache.reason, "noarchive");
  assert.equal(projectSourceText(document, { purpose: "snippet", now: NOW }).permitted, true);
});

test("a hidden section inside a copied field never becomes a snippet or model evidence", () => {
  const policy = observe();
  const document = catalogueDocument(policy, {
    summary: "",
    excerpt: "",
    evidenceExcerpt: "",
    content: `<p>${VISIBLE}</p><div data-nosnippet><p>${HIDDEN}</p></div>`,
  });
  for (const purpose of ["snippet", "evidence"]) {
    const projected = projectSourceText(document, { purpose, now: NOW });
    assert.equal(projected.permitted, true, `${purpose} stays available`);
    assert.equal(projected.text.includes(HIDDEN), false, `${purpose} must not carry hidden text`);
    assert.match(projected.text, /Metsamaa pindala/u);
  }
});

test("unavailable_after stops every copied use once its date has passed", () => {
  const policy = observe({
    html: syntheticPage({
      head: '<meta name="robots" content="unavailable_after: 01 Jan 2026 00:00:00 UTC">',
    }),
  });
  assert.equal(policy.directives.unavailableAfter, "2026-01-01T00:00:00.000Z");
  const projected = projectSourceText(catalogueDocument(policy), { purpose: "snippet", now: NOW });
  assert.equal(projected.permitted, false);
  assert.equal(projected.reason, "unavailable-after");
  assert.equal(projected.text, null);
});

test("model answer text follows the evidence decision", () => {
  const denied = observe({
    html: syntheticPage({ head: '<meta name="robots" content="nosnippet">' }),
  });
  const deniedProjection = projectSourceText(catalogueDocument(denied), {
    purpose: "evidence",
    now: NOW,
  });
  assert.equal(deniedProjection.permitted, false);
  assert.equal(deniedProjection.document.answer, undefined);
  const allowedProjection = projectSourceText(catalogueDocument(observe()), {
    purpose: "evidence",
    now: NOW,
  });
  assert.equal(allowedProjection.permitted, true);
  assert.equal(typeof allowedProjection.document.answer, "string");
  assert.ok(allowedProjection.document.answer.length <= 1_200);
});

test("the source policy binding is versioned, stable and changes with the decision", () => {
  const allowing = observe();
  const denying = observe({
    html: syntheticPage({ head: '<meta name="robots" content="nosnippet">' }),
  });
  const first = sourcePolicyBinding(allowing);
  assert.match(first, new RegExp(`^${SOURCE_POLICY_VERSION}:[a-f0-9]{64}$`, "u"));
  assert.equal(sourcePolicyBinding(allowing), first);
  assert.notEqual(sourcePolicyBinding(denying), first);
  assert.equal(sourcePolicyBinding(null), null);
  assert.equal(sourcePolicyBinding({ version: SOURCE_POLICY_VERSION }), null);
});

test("an unknown projection purpose is a programming error, not a silent allow", () => {
  assert.throws(
    () => projectSourceText(catalogueDocument(observe()), { purpose: "avalik", now: NOW }),
    TypeError,
  );
});

// Boundary regressions from independent review. Each test is synthetic and uses
// no live source. Both robots.txt parsers are exercised where both still exist.

test("a ninth User-agent line in one group is never dropped by either parser", () => {
  const agents = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", PRODUCT];
  const text = [...agents.map((agent) => `User-agent: ${agent}`), "Disallow: /privaatne"].join("\n");
  for (const [label, parser] of [["source policy", parseRobotsTxt], ["corpus", corpusParseRobotsTxt]]) {
    const rules = parser(text, PRODUCT);
    assert.equal(
      rules.length,
      1,
      `${label} must read the rule of a group whose reader is named on the ninth line`,
    );
    assert.equal(
      robotsAllowsUrl("https://www.keskkonnaportaal.ee/privaatne", rules),
      false,
      `${label} must obey a disallow stated after eight other user agents`,
    );
  }
});

test("repeated unavailable_after keeps the earliest date", () => {
  const policy = pageRobotsPolicy(syntheticPage(), [
    "unavailable_after: 01 Jan 2026 00:00:00 UTC",
    "unavailable_after: 01 Jun 2026 00:00:00 UTC",
  ], PRODUCT);
  assert.equal(policy.observations.unavailableAfter, "2026-01-01T00:00:00.000Z");
});

test("a snippet projection never publishes summary and answer beyond one cap", () => {
  const policy = observe();
  const document = catalogueDocument(policy, {
    summary: "s".repeat(2_000),
    content: "",
    excerpt: "",
    evidenceExcerpt: "",
    answer: "a".repeat(2_000),
  });
  const snippet = projectSourceText(document, { purpose: "snippet", now: NOW });
  assert.equal(snippet.permitted, true);
  assert.equal(snippet.document.answer, undefined, "a snippet carries no model answer");
  const evidence = projectSourceText(document, { purpose: "evidence", now: NOW });
  const published = String(evidence.text ?? "").length
    + String(evidence.document.answer ?? "").length;
  assert.ok(
    published <= evidence.textLimit,
    `published copied text was ${published} characters against a ${evidence.textLimit} cap`,
  );
});

test("a permissive use flag cannot override a nosnippet or noarchive directive", () => {
  const base = observe({
    html: syntheticPage({ head: '<meta name="robots" content="nosnippet, noarchive">' }),
  });
  const contradictory = {
    ...base,
    use: { retainBody: true, indexBody: true, displaySnippet: true, answerEvidence: true },
  };
  for (const purpose of ["snippet", "evidence", "cache"]) {
    const projected = projectSourceText(catalogueDocument(contradictory), { purpose, now: NOW });
    assert.equal(projected.permitted, false, `${purpose} must not be granted`);
    assert.equal(projected.reason, "source-policy-invalid", `${purpose} reason`);
  }
  assert.equal(sourcePolicyBinding(contradictory), null, "a contradictory policy has no binding");
});

test("unknown content kinds, robots statuses and unparseable dates fail closed", () => {
  const base = observe();
  const cases = [
    ["content kind", { ...base, contentKind: "hull" }],
    ["robots status", { ...base, robots: { ...base.robots, status: "maybe" } }],
    ["observed date", { ...base, observedAt: "11.11.2026" }],
    ["unavailable date", { ...base, directives: { ...base.directives, unavailableAfter: "pole-kuupaev" } }],
    ["body hash", { ...base, bodyHash: "not-a-hash" }],
  ];
  for (const [label, policy] of cases) {
    const projected = projectSourceText(catalogueDocument(policy), { purpose: "snippet", now: NOW });
    assert.equal(projected.permitted, false, `${label} must fail closed`);
    assert.equal(projected.reason, "source-policy-invalid", `${label} reason`);
    assert.equal(sourcePolicyBinding(policy), null, `${label} has no binding`);
  }
});

test("a policy is never applied to a different resource", () => {
  const policy = observe();
  const otherUrl = "https://www.keskkonnaportaal.ee/et/teine-allikas";
  const projected = projectSourceText(catalogueDocument(policy, { url: otherUrl }), {
    purpose: "snippet",
    now: NOW,
  });
  assert.equal(projected.permitted, false);
  assert.equal(projected.reason, "source-policy-mismatch");
  assert.equal(projected.link.url, otherUrl, "the document URL is not rewritten");
});

test("a fetched policy needs a body hash and a canonical timestamp", () => {
  const base = observe();
  assert.equal(sourcePolicyBinding({ ...base, bodyHash: null }), null);
  assert.equal(sourcePolicyBinding({ ...base, observedAt: "2026-11-11" }), null);
  const authored = observe({ contentKind: "authored-metadata", bodyHash: "", artifactHash: "" });
  assert.equal(authored.observations.bodyHashPresent, false);
  assert.notEqual(
    sourcePolicyBinding(authored),
    null,
    "authored metadata needs no publisher body hash",
  );
});

test("the binding covers directives.readable", () => {
  const base = observe();
  const conservative = {
    ...base,
    use: { retainBody: false, indexBody: false, displaySnippet: false, answerEvidence: false },
  };
  const withoutWitness = {
    ...conservative,
    directives: { ...conservative.directives, readable: false },
  };
  assert.ok(sourcePolicyBinding(conservative));
  assert.ok(sourcePolicyBinding(withoutWitness));
  assert.notEqual(sourcePolicyBinding(withoutWitness), sourcePolicyBinding(conservative));
});
