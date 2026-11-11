import assert from "node:assert/strict";
import test from "node:test";
import { publicSearchItem } from "../server/corpus.mjs";
import { observeSourcePolicy } from "../server/source_policy.mjs";

// Source use policy at the corpus boundary. A hydrated row may publish copied
// text only when the policy observed for that exact response still permits it,
// and a row whose body predates the policy never confers permission. Link
// metadata is the part that always survives.

const URL_ = "https://www.keskkonnaportaal.ee/et/teemad/mets/metsastatistika";
const FETCHED_AT = "2026-11-11T10:00:00.000Z";
const POLICY_AT = "2026-11-11T10:00:00.000Z";
const BODY = "Metsamaa pindala oli 2,3 miljonit hektarit. Raiemaht oli 8,5 miljonit kuupmeetrit. "
  + "Uuendusraie moodustas sellest veidi üle poole ja looduslik uuendus ülejäänud osa.";

function policyFor({
  html = "<main><p>Metsamaa pindala oli 2,3 miljonit hektarit.</p></main>",
  headerInstances = [],
  observedAt = POLICY_AT,
  contentKind = "fetched-html",
  robotsStatus = "allowed",
} = {}) {
  return observeSourcePolicy({
    requestedUrl: URL_,
    finalUrl: URL_,
    observedAt,
    contentKind,
    bodyHash: "a".repeat(64),
    artifactHash: "b".repeat(64),
    robotsObservation: {
      status: robotsStatus,
      origin: "https://www.keskkonnaportaal.ee",
      checkedAt: observedAt,
    },
    html,
    headerInstances,
  });
}

function hydratedRow({
  policy,
  content = BODY,
  summary = BODY.slice(0, 120),
  fetchedAt = FETCHED_AT,
  metadata = {},
  sourceKind = "official-page-hydration",
  contentHash = policy?.artifactHash || "c".repeat(64),
} = {}) {
  return {
    id: 41,
    title: "Metsastatistika",
    canonical_url: URL_,
    source_key: "official-page-hydration",
    source_tier: "official",
    category: "Statistika",
    organization: "Keskkonnaagentuur",
    published_at: "2021-12-15",
    content_hash: contentHash,
    fetched_at: fetchedAt,
    content,
    summary,
    metadata: {
      hydrated: true,
      source_kind: sourceKind,
      source_updated_at: "2026-10-01",
      ...(policy ? { source_policy: policy, sourceResourceKey: policy.resourceKey } : {}),
      ...metadata,
    },
  };
}

test("a hydrated body carries the policy observed for that response", () => {
  const item = publicSearchItem(hydratedRow({ policy: policyFor() }), true);
  assert.equal(item._sourcePolicy?.version, "source-policy-v1");
  assert.equal(item._sourcePolicy?.contentKind, "fetched-html");
  assert.match(String(item._sourcePolicyBinding || ""), /^source-policy-v1:[a-f0-9]{64}$/u);
  assert.equal(item.evidencePolicy, "versioned");
  assert.equal(item._answerEvidenceEligible, true);
});

test("a nosnippet response publishes safe link metadata and no copied text", () => {
  const policy = policyFor({ html: '<main><p>Nähtav.</p></main><meta name="robots" content="nosnippet">' });
  const item = publicSearchItem(hydratedRow({ policy }), true);
  assert.equal(item.content, "");
  assert.equal(item.summary, "");
  assert.equal(item.title, "Metsastatistika");
  assert.equal(item.url, URL_);
  assert.equal(item.organization, "Keskkonnaagentuur");
  assert.equal(item.published, "15.12.2021");
  assert.equal(item._answerEvidenceEligible, false);
  assert.equal(item.evidencePolicy, "route-only");
});

test("a finite max-snippet caps the published copy at the publisher limit", () => {
  const policy = policyFor({ html: '<main><p>Nähtav.</p></main><meta name="robots" content="max-snippet:120">' });
  const item = publicSearchItem(hydratedRow({ policy }), true);
  assert.equal(item._sourcePolicy?.directives?.maxSnippetChars, 120);
  assert.ok(item.content.length <= 120, `content was ${item.content.length} characters`);
  assert.ok(item.summary.length <= 120, `summary was ${item.summary.length} characters`);
  assert.equal(item._answerEvidenceEligible, true);
  assert.equal(item.evidencePolicy, "versioned");
});

test("noarchive keeps the display decision and denies retention", () => {
  const policy = policyFor({ html: '<main><p>Nähtav.</p></main><meta name="robots" content="noarchive">' });
  const item = publicSearchItem(hydratedRow({ policy }), true);
  assert.equal(item._sourcePolicy?.use?.retainBody, false);
  assert.equal(item._sourcePolicy?.use?.displaySnippet, true);
  assert.ok(item.content.length > 0, "a noarchive source may still be shown");
});

test("noindex withdraws every copied use", () => {
  const policy = policyFor({ html: '<main><p>Nähtav.</p></main><meta name="robots" content="noindex">' });
  const item = publicSearchItem(hydratedRow({ policy }), true);
  assert.equal(item.content, "");
  assert.equal(item.summary, "");
  assert.equal(item._answerEvidenceEligible, false);
  assert.equal(item.evidencePolicy, "route-only");
  assert.equal(item.url, URL_);
});

test("an unclassified legacy body confers no permission", () => {
  const item = publicSearchItem(hydratedRow({ policy: null }), true);
  assert.equal(item.evidencePolicy, "route-only");
  assert.equal(item._answerEvidenceEligible, false);
  assert.equal(item.content, "");
  assert.equal(item.summary, "");
  assert.equal(item.title, "Metsastatistika");
  assert.equal(item.url, URL_);
  assert.equal(item.published, "15.12.2021");
});

test("a failed refresh drops the evidence standing of the older body", () => {
  // The failed attempt moved fetched_at forward while the stored policy still
  // belongs to the earlier successful read, so the two no longer match.
  const policy = policyFor({ observedAt: "2026-11-01T10:00:00.000Z" });
  const item = publicSearchItem(hydratedRow({ policy }), true);
  assert.equal(item.evidencePolicy, "route-only");
  assert.equal(item._answerEvidenceEligible, false);
  assert.equal(item.content, "");
  assert.equal(item.summary, "");
  assert.equal(item.url, URL_);
});

test("a stored reviewed catalogue row keeps its reviewed evidence facts", () => {
  const row = {
    id: 7,
    title: "Metsaseadus",
    canonical_url: "https://www.riigiteataja.ee/akt/MS",
    source_key: "reviewed-catalogue-source",
    source_tier: "official",
    content_hash: "d".repeat(64),
    fetched_at: FETCHED_AT,
    content: "Metsaseadus sätestab metsa majandamise alused ja metsa kaitse nõuded.",
    summary: "Metsaseadus sätestab metsa majandamise alused.",
    metadata: {
      hydrated: true,
      source_kind: "reviewed-catalogue",
      evidence_policy: "versioned",
      reviewed_at: "2026-09-01T00:00:00.000Z",
    },
  };
  const item = publicSearchItem(row, true);
  assert.equal(item.evidencePolicy, "versioned");
  assert.equal(item._answerEvidenceEligible, true);
  assert.ok(item.content.length > 0, "a reviewed legal fact is not erased by the source policy");
});

test("a policy that expires after the fetch stops copied output at read time", () => {
  // The reviewer's timeline: fetched at 10:00 with the body allowed, availability
  // ends at 11:00, the row is read at 12:00 and nothing wrote it in between.
  const nowMs = Date.now();
  const fetchedAt = new Date(nowMs - 2 * 60 * 60 * 1_000).toISOString();
  const base = policyFor({ observedAt: fetchedAt });
  const expired = {
    ...base,
    directives: {
      ...base.directives,
      unavailableAfter: new Date(nowMs - 60 * 60 * 1_000).toISOString(),
    },
  };
  const item = publicSearchItem(hydratedRow({ policy: expired, fetchedAt }), true);
  assert.equal(item.content, "", "an expired body is not published as copied text");
  assert.equal(item.summary, "");
  assert.equal(item._answerEvidenceEligible, false);
  assert.equal(item.evidencePolicy, "route-only");
  // Link metadata is not copied text and survives the expiry.
  assert.equal(item.title, "Metsastatistika");
  assert.equal(item.url, URL_);
  assert.equal(item.organization, "Keskkonnaagentuur");
  assert.equal(item.published, "15.12.2021");
});

test("a witness bound to another resource does not publish this body", () => {
  const policy = { ...policyFor(), resourceKey: "https://www.keskkonnaportaal.ee/et/teemad/muu-teema" };
  const item = publicSearchItem(hydratedRow({ policy }), true);
  assert.equal(item.content, "", "a witness for another resource authorises no copied text here");
  assert.equal(item.summary, "");
  assert.equal(item._answerEvidenceEligible, false);
  assert.equal(item.evidencePolicy, "route-only");
  assert.equal(item.title, "Metsastatistika");
  assert.equal(item.url, URL_);
});

test("a witness for another body version does not publish this body", () => {
  const policy = policyFor();
  const item = publicSearchItem(hydratedRow({ policy, contentHash: "d".repeat(64) }), true);
  assert.equal(item.content, "", "a witness whose artifact hash is not this body authorises no copied text");
  assert.equal(item.summary, "");
  assert.equal(item._answerEvidenceEligible, false);
  assert.equal(item.evidencePolicy, "route-only");
});

test("a witness bound to this row does publish the body", () => {
  const policy = policyFor();
  const item = publicSearchItem(hydratedRow({ policy, contentHash: policy.artifactHash }), true);
  assert.ok(item.content.length > 0);
  assert.equal(item._answerEvidenceEligible, true);
  assert.equal(item.evidencePolicy, "versioned");
});
