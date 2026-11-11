// Behaviour tests for the source-use delivery boundary.
//
// A publisher decision is observed on one response and stored with that body.
// These tests follow the same record out of the retrieval layer into the three
// surfaces a reader or a model can actually see:
//   * the public search listing (snippet),
//   * the model evidence pack (copied text handed to the provider),
//   * the deterministic answer cache (a retained copy replayed later).
//
// Every case is synthetic and clock-injected: no network, no database, no third
// party text. A numeric publisher max-snippet is asserted as a bound on the
// total copied characters of one publisher result, not per field.

import assert from "node:assert/strict";
import test from "node:test";
import { observeSourcePolicy, sourcePolicyBinding, sourcePolicyWitness } from "../server/source_policy.mjs";
import { publicSearchItem } from "../server/corpus.mjs";
import {
  ANSWER_SOURCE_EXPIRY,
  publicResponse,
  publicationCopyExpiry,
  searchEnvironmentLive,
  searchTimeoutFallback,
  withholdPublicationCopy,
} from "../server/pipeline.mjs";
import { validateGroundedAnswer } from "../server/llm.mjs";
import { deduplicateResults, evidenceDocumentsFromListing, publicSearchListing } from "../server/retrieval.mjs";
import { buildEvidencePack, evidencePackMatchesSources, isEvidencePack } from "../server/evidence-pack.mjs";
import { sourceCanSupportPublicCitation } from "../server/source-registry.mjs";
import {
  restoreCachedResponse,
  sanitizeCachedResponse,
} from "../server/database.mjs";

const PORTAL = "https://www.keskkonnaportaal.ee";
const FOREST_URL = `${PORTAL}/et/teemad/mets/metsastatistika`;
const OTHER_URL = `${PORTAL}/et/teemad/mets/metsaseire`;
const OBSERVED_AT = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
const RAW_BODY_HASH = "a".repeat(64);
const EXTRACTED_HASH = "b".repeat(64);
const QUERY = "roostiku ülevaade";
const APPROVED_TEXT = "Kinnitatud keha sisaldab pindala naitajat.";
const RESTRICTED_TEXT = "Piiratud keha sisaldab kuupmeetri naitajat.";

function policyFor({
  html = "<main><p>Kinnitatud keha sisaldab pindala naitajat.</p></main>",
  headerInstances = [],
  finalUrl = FOREST_URL,
  robotsStatus = "allowed",
  artifactHash = EXTRACTED_HASH,
} = {}) {
  return observeSourcePolicy({
    requestedUrl: finalUrl,
    finalUrl,
    observedAt: OBSERVED_AT,
    contentKind: "fetched-html",
    bodyHash: RAW_BODY_HASH,
    artifactHash,
    robotsObservation: {
      status: robotsStatus,
      origin: new URL(finalUrl).origin,
      checkedAt: OBSERVED_AT,
    },
    html,
    headerInstances,
  });
}

function nosnippetPolicy() {
  return policyFor({
    html: "<main><p>Kinnitatud keha sisaldab pindala naitajat.</p></main>"
      + '<meta name="robots" content="nosnippet">',
  });
}

function noarchivePolicy() {
  return policyFor({
    html: "<main><p>Kinnitatud keha sisaldab pindala naitajat.</p></main>"
      + '<meta name="robots" content="noarchive">',
  });
}

function maxSnippetPolicy(limit) {
  return policyFor({
    html: "<main><p>Kinnitatud keha sisaldab pindala naitajat.</p></main>"
      + `<meta name="robots" content="max-snippet:${limit}">`,
  });
}

function expiredPolicy() {
  return policyFor({
    html: "<main><p>Kinnitatud keha sisaldab pindala naitajat.</p></main>"
      + '<meta name="robots" content="unavailable-after: 2026-01-01">',
  });
}

// One already hydrated publisher page: the same field set publicSearchItem
// emits, so every consumer below sees a real record rather than a bare string.
function fetchedRecord({
  witness = policyFor(),
  summary = APPROVED_TEXT,
  content = `${APPROVED_TEXT} Lisalause pindala kohta.`,
  url = FOREST_URL,
  citation = 1,
  binding,
  contentHash = EXTRACTED_HASH,
  overrides = {},
} = {}) {
  return {
    id: "corpus-41",
    citation,
    title: "Metsastatistika",
    url,
    organization: "Keskkonnaagentuur",
    type: "Statistika",
    published: "15.12.2021",
    sourceTier: "official",
    retrieval: "approved-page-hydration",
    delivery: "catalog-and-bounded-hydration",
    evidencePolicy: "versioned",
    _answerEvidenceEligible: true,
    _evidenceVersion: "c".repeat(64),
    _evidenceStatusAt: OBSERVED_AT,
    freshness: {
      class: "cached-official-page",
      basis: "retrieved-at",
      maxAgeMs: 30 * 24 * 60 * 60 * 1_000,
      requiresSourceTimestamp: true,
    },
    summary,
    content,
    _contentHash: contentHash,
    ...(witness ? { _sourcePolicy: witness } : {}),
    ...(witness ? { _sourcePolicyBinding: binding ?? sourcePolicyBinding(witness) } : {}),
    ...overrides,
  };
}

function citedDraft(source, { cited = true } = {}) {
  return {
    query: QUERY,
    total: 1,
    answer: {
      eyebrow: "Kontrollitud vastus",
      title: "Kontrollitud fakt",
      intro: "Fakt parineb ametlikust allikast.",
      introCitations: cited ? [source.citation] : [],
      parts: [],
      note: "Kontrolli algallikat.",
    },
    sources: [source],
    evidence: { kind: "test", answerable: true },
  };
}

function listedSummary(record) {
  const listing = publicSearchListing({ items: [record] });
  return listing.items[0]?.summary ?? "";
}

function packedText(record, query = QUERY) {
  const pack = buildEvidencePack({ sources: [record], query });
  return {
    pack,
    content: pack.entries.map((entry) => entry.content).join("\n"),
  };
}

function cachedSource(record, options = {}) {
  const safe = sanitizeCachedResponse(citedDraft(record, options), QUERY);
  return safe?.sources?.[0] ?? null;
}

function copiedChars(source) {
  return ["summary", "content", "excerpt", "answer", "evidenceExcerpt"]
    .reduce((total, field) => total + String(source?.[field] ?? "").length, 0);
}

// The real corpus producer: a hydrated row whose stored policy allows 120
// characters. Using it here is what makes a case end to end rather than a
// hand-built record that already looks the way a test wants it to look.
function producedItem({ content, summary = "", policy = maxSnippetPolicy(120) } = {}) {
  return publicSearchItem({
    id: 41,
    title: "Metsastatistika",
    canonical_url: FOREST_URL,
    source_key: "official-page-hydration",
    source_tier: "official",
    category: "Statistika",
    organization: "Keskkonnaagentuur",
    published_at: "2021-12-15",
    // The row digest is the extracted body the policy observed, so the witness
    // and the record name the same bytes.
    content_hash: EXTRACTED_HASH,
    fetched_at: OBSERVED_AT,
    content,
    summary,
    metadata: {
      hydrated: true,
      source_kind: "official-page-hydration",
      source_updated_at: "2026-10-01",
      source_policy: policy,
    },
  }, true);
}

// ---------------------------------------------------------------------------
// 1. Approved: one bounded copy reaches every surface, links always survive
// ---------------------------------------------------------------------------

test("an approved fetched body is listed, packed and restored from the cache", () => {
  const record = fetchedRecord();
  assert.equal(listedSummary(record), APPROVED_TEXT);

  assert.equal(evidenceDocumentsFromListing({ items: [record] }).length, 1);
  const packed = packedText(record);
  assert.equal(packed.pack.complete, true);
  assert.match(packed.content, /Kinnitatud keha/u);

  const safe = cachedSource(record);
  assert.ok(safe, "an approved source is cacheable");
  assert.equal(safe.title, "Metsastatistika");
  assert.equal(safe.url, FOREST_URL);
  assert.equal(safe.summary, APPROVED_TEXT);

  // The saved answer replays the same bounded copy, not a second derivation.
  const restored = restoreCachedResponse(sanitizeCachedResponse(citedDraft(record), QUERY), QUERY);
  assert.equal(restored.sources[0].summary, APPROVED_TEXT);
  assert.equal(restored.sources[0].url, FOREST_URL);
  assert.equal(restored.answer.title, "Kontrollitud fakt");
});

// ---------------------------------------------------------------------------
// 2. nosnippet: no copied text anywhere, ordinary link metadata stays
// ---------------------------------------------------------------------------

test("a nosnippet body never reaches the listing, the pack or the cache", () => {
  const record = fetchedRecord({ witness: nosnippetPolicy(), summary: APPROVED_TEXT, content: APPROVED_TEXT });

  const listing = publicSearchListing({ items: [record] });
  assert.equal(listing.items[0].summary, "");
  assert.equal(listing.items[0].title, "Metsastatistika");
  assert.equal(listing.items[0].url, FOREST_URL);
  assert.equal(listing.items[0].organization, "Keskkonnaagentuur");
  assert.equal(listing.items[0].published, "15.12.2021");
  assert.equal(listing.items[0].type, "Statistika");

  assert.deepEqual(evidenceDocumentsFromListing({ items: [record] }), []);
  const packed = packedText(record);
  assert.equal(packed.pack.complete, false);
  assert.doesNotMatch(packed.content, /Kinnitatud keha/u);

  // A cited source that may not be quoted cannot be replayed from a saved
  // answer, so the whole response is not cached.
  assert.equal(sanitizeCachedResponse(citedDraft(record), QUERY), null);
  // An uncited navigation card keeps its links and loses only the copy.
  const safe = cachedSource(record, { cited: false });
  assert.ok(safe, "uncited link metadata still caches");
  assert.equal(safe.url, FOREST_URL);
  assert.equal(safe.summary, "");
  assert.equal(safe.evidenceExcerpt, "");
});

// ---------------------------------------------------------------------------
// 3. max-snippet bounds the total copy of one publisher result
// ---------------------------------------------------------------------------

test("a numeric max-snippet bounds the total copied text of one publisher result", () => {
  const first = "Pindala naitaja on avaldatud esimeses lauses ja jargneb veel sonu.";
  const record = fetchedRecord({
    witness: maxSnippetPolicy(120),
    summary: `${first} ${first}`,
    content: `${first} ${RESTRICTED_TEXT} ${first} ${first}`,
  });

  const listing = publicSearchListing({ items: [record] });
  assert.ok(listing.items[0].summary.length <= 120, `listing summary was ${listing.items[0].summary.length}`);
  assert.ok(/^Pindala naitaja/u.test(listing.items[0].summary));

  const packed = packedText(record);
  const copied = packed.content.length;
  assert.ok(copied <= 120, `packed copy was ${copied} characters`);

  // The candidate keeps the whole body for later ranking, but the field this
  // application publishes stays inside the publisher limit.
  const evidence = evidenceDocumentsFromListing({ items: [record] });
  assert.ok(evidence[0].summary.length <= 120, `candidate summary was ${evidence[0].summary.length}`);

  const safe = cachedSource(record, { cited: false });
  assert.ok(copiedChars(safe) <= 120, `cached copy was ${copiedChars(safe)} characters`);
});

test("a numeric max-snippet bounds the copy after normalization as well", () => {
  // U+FB03 is one code point and three characters under NFKC, so a source can
  // stay inside a code-point count and still hand a reader three times the
  // publisher's limit once the surfaces normalize it.
  const LIGATURE = "\uFB03";
  const record = fetchedRecord({
    witness: maxSnippetPolicy(120),
    summary: LIGATURE.repeat(120),
    content: LIGATURE.repeat(400),
  });

  const listing = publicSearchListing({ items: [record] });
  assert.ok(listing.items[0].summary.length <= 120, `listing summary was ${listing.items[0].summary.length}`);

  const packed = packedText(record).content;
  assert.ok(packed.length <= 120, `packed copy was ${packed.length} characters`);

  const safe = cachedSource(record, { cited: false });
  assert.ok(copiedChars(safe) <= 120, `cached copy was ${copiedChars(safe)} characters`);
});

// ---------------------------------------------------------------------------
// 4. noarchive: the public snippet stays, the retained copy does not
// ---------------------------------------------------------------------------

test("a noarchive body is shown once but never retained in the answer cache", () => {
  const record = fetchedRecord({ witness: noarchivePolicy() });
  assert.equal(listedSummary(record), APPROVED_TEXT);
  assert.equal(sanitizeCachedResponse(citedDraft(record), QUERY), null);

  const safe = cachedSource(record, { cited: false });
  assert.equal(safe.url, FOREST_URL);
  assert.equal(safe.summary, "");
  assert.equal(safe.evidenceExcerpt, "");
});

// ---------------------------------------------------------------------------
// 5. A stale observation, another resource and another body are all refused
// ---------------------------------------------------------------------------

test("an expired policy withdraws copied text from every consumer", () => {
  const record = fetchedRecord({ witness: expiredPolicy() });
  assert.equal(listedSummary(record), "");
  assert.equal(evidenceDocumentsFromListing({ items: [record] }).length, 0);
  assert.doesNotMatch(packedText(record).content, /Kinnitatud keha/u);
  assert.equal(sanitizeCachedResponse(citedDraft(record), QUERY), null);
});

test("a policy observed for another resource is refused for this record", () => {
  const record = fetchedRecord({ witness: policyFor({ finalUrl: OTHER_URL }) });
  assert.equal(listedSummary(record), "");
  assert.equal(evidenceDocumentsFromListing({ items: [record] }).length, 0);
  assert.doesNotMatch(packedText(record).content, /Kinnitatud keha/u);
});

test("a policy whose observed body is not this body is refused", () => {
  const record = fetchedRecord({ contentHash: "d".repeat(64) });
  assert.equal(listedSummary(record), "");
  assert.equal(evidenceDocumentsFromListing({ items: [record] }).length, 0);
});

test("a tampered policy binding is refused", () => {
  const witness = policyFor();
  const record = fetchedRecord({
    witness,
    binding: `source-policy-v1:${"0".repeat(64)}`,
  });
  assert.equal(listedSummary(record), "");
  assert.equal(evidenceDocumentsFromListing({ items: [record] }).length, 0);
  assert.equal(sanitizeCachedResponse(citedDraft(record), QUERY), null);
});

// ---------------------------------------------------------------------------
// 6. Deduplication cannot move a body under another alias's permission
// ---------------------------------------------------------------------------

test("a richer restricted body does not borrow an approved alias's permission", () => {
  const restricted = fetchedRecord({
    witness: nosnippetPolicy(),
    summary: "",
    content: `${RESTRICTED_TEXT} ${RESTRICTED_TEXT} ${RESTRICTED_TEXT}`,
    overrides: { id: "corpus-41-restricted" },
  });
  const approved = fetchedRecord({
    witness: policyFor(),
    summary: APPROVED_TEXT,
    content: APPROVED_TEXT,
    overrides: { id: "corpus-41-approved" },
  });
  const merged = deduplicateResults([approved, restricted]);
  assert.equal(merged.length, 1, "the two aliases describe one resource");
  const visible = publicSearchListing({ items: merged });
  assert.doesNotMatch(visible.items[0].summary, /Piiratud keha/u);
  assert.equal(visible.items[0].summary, "", "the retained body is the restricted one");
  assert.doesNotMatch(packedText(merged[0]).content, /Piiratud keha/u);
  assert.equal(packedText(merged[0]).pack.complete, false);
});

test("an approved body stays deliverable when a restricted alias shares its URL", () => {
  const restricted = fetchedRecord({
    witness: nosnippetPolicy(),
    summary: "",
    content: RESTRICTED_TEXT,
    overrides: { id: "corpus-41-restricted" },
  });
  const approved = fetchedRecord({
    witness: policyFor(),
    summary: APPROVED_TEXT,
    content: `${APPROVED_TEXT} ${APPROVED_TEXT} ${APPROVED_TEXT} ${APPROVED_TEXT}`,
    overrides: { id: "corpus-41-approved" },
  });
  for (const order of [[approved, restricted], [restricted, approved]]) {
    const merged = deduplicateResults(order);
    assert.equal(merged.length, 1);
    const visible = publicSearchListing({ items: merged });
    assert.equal(visible.items[0].summary, APPROVED_TEXT);
    assert.doesNotMatch(visible.items[0].summary, /Piiratud keha/u);
    const packed = packedText(merged[0]).content;
    assert.match(packed, /Kinnitatud keha/u);
    assert.doesNotMatch(packed, /Piiratud keha/u);
  }
});

// ---------------------------------------------------------------------------
// 7. Legacy bodies stay navigation only; reviewed provenance still counts
// ---------------------------------------------------------------------------

test("a legacy fetched body without a policy is navigation only", () => {
  const record = fetchedRecord({ witness: null });
  assert.equal(listedSummary(record), "");
  assert.equal(evidenceDocumentsFromListing({ items: [record] }).length, 0);
  assert.equal(packedText(record).pack.complete, false);
  assert.equal(sanitizeCachedResponse(citedDraft(record), QUERY), null);
  const listing = publicSearchListing({ items: [record] });
  assert.equal(listing.items[0].url, FOREST_URL);
  assert.equal(listing.items[0].title, "Metsastatistika");
});

test("a reviewed extract without a fetch observation keeps its reviewed facts", () => {
  const record = fetchedRecord({
    witness: null,
    overrides: {
      retrieval: "reviewed-catalogue-source",
      delivery: "reviewed-catalogue",
      _evidenceVersion: "e".repeat(64),
    },
  });
  assert.equal(listedSummary(record), APPROVED_TEXT);
  assert.equal(evidenceDocumentsFromListing({ items: [record] }).length, 1);
  assert.match(packedText(record).content, /Kinnitatud keha/u);
});

// ---------------------------------------------------------------------------
// 8. An older cache row cannot revive copied text
// ---------------------------------------------------------------------------

test("a saved answer survives serialization and replays the same bounded copy", () => {
  const record = fetchedRecord();
  const safe = sanitizeCachedResponse(citedDraft(record), QUERY);
  // The row crosses JSON in PostgreSQL, so the witness has to survive encoding.
  const stored = JSON.parse(JSON.stringify(safe));
  const restored = restoreCachedResponse(stored, QUERY);
  assert.equal(restored.sources[0].summary, APPROVED_TEXT);
  assert.equal(restored.sources[0].url, FOREST_URL);
  assert.equal(restored.answer.title, "Kontrollitud fakt");
  // An older row for the same source, written before any observation existed,
  // is a retained publisher body with nothing to verify it.
  const withoutWitness = {
    ...stored,
    sources: stored.sources.map((source) => {
      const { _sourcePolicy: _policy, _sourcePolicyBinding: _binding, ...rest } = source;
      return { ...rest, summary: APPROVED_TEXT, evidenceExcerpt: APPROVED_TEXT };
    }),
  };
  assert.equal(restoreCachedResponse(withoutWitness, QUERY), null);
});

test("an older cache row cannot revive a publisher body it cannot verify", () => {
  const record = fetchedRecord();
  const safe = sanitizeCachedResponse(citedDraft(record), QUERY);
  const strippedSources = safe.sources.map((source) => {
    const { _sourcePolicy: _policy, _sourcePolicyBinding: _binding, ...rest } = source;
    return { ...rest, summary: APPROVED_TEXT, evidenceExcerpt: APPROVED_TEXT };
  });
  // The answer was written from that source, so the row cannot be replayed.
  assert.equal(restoreCachedResponse({ ...safe, sources: strippedSources }, QUERY), null);

  // A row that cites nothing keeps its links and loses only the copy.
  const uncited = sanitizeCachedResponse(citedDraft(record, { cited: false }), QUERY);
  const restored = restoreCachedResponse({
    ...uncited,
    sources: strippedSources.map((source) => ({ ...source, citation: uncited.sources[0].citation })),
  }, QUERY);
  assert.equal(restored.sources[0].summary, "");
  assert.equal(restored.sources[0].evidenceExcerpt, "");
  assert.equal(restored.sources[0].url, FOREST_URL);
  assert.equal(restored.sources[0].title, "Metsastatistika");
});

// ---------------------------------------------------------------------------
// 9. A permitted source keeps the answer wherever the publisher put it
// ---------------------------------------------------------------------------

test("a permitted source whose answer lies past the first copy window still supports it", () => {
  const filler = "Sademete andmed on jaamas avaldatud. ";
  const answer = "Metsamaa pindala oli 2,3 miljonit hektarit.";
  const content = `${filler.repeat(160)}${answer}`;
  assert.ok(content.indexOf(answer) > 4_000,
    `the answer must sit past the first 4000 characters, saw ${content.indexOf(answer)}`);

  const record = fetchedRecord({ summary: "", content });
  const { pack } = packedText(record, "Metsamaa pindala");
  assert.equal(pack.complete, true, `missing: ${pack.missingEvidenceRequirements.join(",")}`);
  const copy = pack.entries[0]?.content ?? "";
  assert.match(copy, /2,3 miljonit hektarit/u, "the late answer must reach the model");
  assert.ok(copy.length <= 4_000, `packed copy was ${copy.length} characters`);
});

test("a finite max-snippet keeps the relevant passage rather than the page prefix", () => {
  const filler = "Sademete andmed on jaamas avaldatud. ";
  const answer = "Metsamaa pindala oli 2,3 miljonit hektarit.";
  const content = `${filler.repeat(160)}${answer}`;
  assert.ok(content.indexOf(answer) > 4_000,
    `the answer must sit past the first 4000 characters, saw ${content.indexOf(answer)}`);

  // The publisher allows 120 characters of this page to be copied. Those
  // characters have to answer the question, so the selection cannot be the
  // first 120 characters of the body.
  //
  // This is a direct gate call on a permitted body. It is not the live path: the
  // corpus and live producers project a finite max-snippet to a prefix before
  // the pack sees the record, so late selection under a finite cap is not end to
  // end yet.
  const record = fetchedRecord({ summary: "", content, witness: maxSnippetPolicy(120) });
  const { pack } = packedText(record, "Metsamaa pindala");
  const copy = pack.entries[0]?.content ?? "";
  assert.match(copy, /2,3 miljonit hektarit/u, "the capped copy must carry the relevant passage");
  assert.match(copy, /metsamaa|pindala/iu, "the capped copy must relate to the query");
  assert.ok(copy.length <= 120, `copied text was ${copy.length} characters`);
});

// ---------------------------------------------------------------------------
// 10. The timeout fallback and a real producer cannot publish past the cap
// ---------------------------------------------------------------------------

const FALLBACK_QUERY = "kui suur on metsamaa pindala";
// Exactly 42 characters, and the sentence a forest-area answer needs.
const FOREST_FACT = "Metsamaa pindala on 2,3 miljonit hektarit.";
const FILLER = "Sademete andmed on jaamas avaldatud. ";

function fallbackCitedSource(record) {
  const response = searchTimeoutFallback(FALLBACK_QUERY, {
    assessmentQuery: FALLBACK_QUERY,
    searchResults: { items: [record], total: 1 },
  });
  assert.deepEqual(response.answer.introCitations, [1],
    `the fallback must lead with the cited extract, saw ${JSON.stringify(response.answer.introCitations)}`);
  const source = response.sources.find((candidate) => candidate.citation === 1);
  assert.ok(source, "the cited source must be published");
  return source;
}

test("a timed-out answer never publishes more than the publisher allowed", () => {
  assert.equal(FOREST_FACT.length, 42, "the fixture sentence must be the 42 character one");
  const record = fetchedRecord({
    witness: maxSnippetPolicy(120),
    summary: "",
    content: `${FOREST_FACT}${FILLER.repeat(40)}`,
  });
  // The public payload carries link metadata and the excerpt, not the private
  // provenance, so the eligibility check belongs to the record the fallback
  // actually consumed.
  const candidates = evidenceDocumentsFromListing({ items: [record] });
  assert.equal(candidates.length, 1);
  assert.equal(sourceCanSupportPublicCitation(candidates[0], { now: Date.now() }).eligible, true,
    "the fallback may only quote an eligible source");

  const source = fallbackCitedSource(record);
  const excerpt = String(source.evidenceExcerpt ?? "");
  assert.match(excerpt, /2,3 miljonit hektarit/u, "the visible witness must still carry the measurement");
  assert.ok(excerpt.length <= 120, `published excerpt was ${excerpt.length} characters`);
});

test("a publisher summary and a late answer share the same budget", () => {
  const summary = "Metsamaa pindala kokkuvote. ".repeat(5).slice(0, 120);
  assert.equal(summary.length, 120, "the fixture summary must spend the whole publisher budget");
  const record = fetchedRecord({
    witness: maxSnippetPolicy(120),
    summary,
    content: `${FILLER.repeat(48)}${FOREST_FACT}`,
  });

  // The summary already spends the publisher budget, so there is nothing left to
  // quote from the body. The card may then be the plain result list; what it may
  // never do is publish the summary and a body excerpt as two separate copies.
  const candidates = evidenceDocumentsFromListing({ items: [record] });
  assert.equal(sourceCanSupportPublicCitation(candidates[0], { now: Date.now() }).eligible, true,
    "the fallback may only quote an eligible source");
  const response = searchTimeoutFallback(FALLBACK_QUERY, {
    assessmentQuery: FALLBACK_QUERY,
    searchResults: { items: [record], total: 1 },
  });
  const source = response.sources.find((candidate) => candidate.citation === 1);
  assert.ok(source, "the source must still be published as a link");
  const published = String(source.summary ?? "").length + String(source.evidenceExcerpt ?? "").length;
  assert.ok(published <= 120, `published copy was ${published} characters`);
});

test("a producer-capped page reaches the model with only its permitted text", () => {
  const item = producedItem({ content: `${FOREST_FACT}${FILLER.repeat(40)}` });
  assert.ok(item.content.length <= 120, `producer copy was ${item.content.length} characters`);
  assert.match(item.content, /2,3 miljonit hektarit/u);

  const candidates = evidenceDocumentsFromListing({ items: [{ ...item, citation: 1 }] });
  assert.equal(candidates.length, 1);
  const pack = buildEvidencePack({ sources: candidates, query: FALLBACK_QUERY });
  assert.equal(pack.complete, true, `missing: ${pack.missingEvidenceRequirements.join(",")}`);
  const copy = pack.entries[0]?.content ?? "";
  assert.ok(copy.length <= 120, `model copy was ${copy.length} characters`);
  assert.match(copy, /2,3 miljonit hektarit/u);
  // Nothing the producer withheld may reach the model: every delivered line is
  // part of the body the publisher permitted.
  const permitted = `${item.content}\n${item.summary}`.normalize("NFKC");
  for (const line of copy.split("\n").filter(Boolean)) {
    assert.ok(permitted.includes(line), `model input outside the permitted body: ${line}`);
  }
});

test("a producer-capped page does not deliver what its own projection left out", () => {
  const item = producedItem({ content: `${FILLER.repeat(48)}${FOREST_FACT}` });
  // The producer projects a finite max-snippet to the start of the body, so the
  // answer is absent from what it published. A snippet limit is a budget, not a
  // rule that the first characters are the right ones, so this is a limit of the
  // current projection, not an obligation of the directive.
  assert.equal(item.content.includes(FOREST_FACT), false,
    "the producer's own projection stops before the answer");

  const candidates = evidenceDocumentsFromListing({ items: [{ ...item, citation: 1 }] });
  const copy = buildEvidencePack({ sources: candidates, query: FALLBACK_QUERY }).entries[0]?.content ?? "";
  assert.ok(copy.length <= 120, `model copy was ${copy.length} characters`);
  assert.doesNotMatch(copy, /2,3 miljonit hektarit/u, "the model cannot receive what the projection left out");
});

// ---------------------------------------------------------------------------
// 11. An admitted pack stops matching when its publisher witness changes
// ---------------------------------------------------------------------------
// The pack's own binding names the body it was built from. These cases ask
// whether the same binding also answers "is this publisher decision still the
// current one", at the two points the check actually runs: before the model is
// asked, and after its answer comes back. Everything here uses the real corpus
// producer and real policy observations.

function admittedPack() {
  const item = producedItem({ content: `${FOREST_FACT}${FILLER.repeat(40)}` });
  const sources = evidenceDocumentsFromListing({ items: [{ ...item, citation: 1 }] });
  const pack = buildEvidencePack({ sources, query: FALLBACK_QUERY });
  assert.equal(isEvidencePack(pack), true, "the fixture pack must be admitted");
  assert.equal(pack.bindings[1].policyBinding !== undefined, true,
    "the admitted pack must record the publisher decision next to the body");
  return { item, sources, pack };
}

function withoutWitness(sources) {
  return sources.map(({ _sourcePolicy: _policy, _sourcePolicyBinding: _binding, ...source }) => source);
}

test("an admitted pack matches the producer record it was built from", () => {
  const { sources, pack } = admittedPack();
  assert.equal(evidencePackMatchesSources(pack, sources), true);
});

test("a pack stops matching when the publisher witness is gone", () => {
  const { sources, pack } = admittedPack();
  assert.equal(evidencePackMatchesSources(pack, withoutWitness(sources)), false,
    "a record with no current observation must not authenticate an admitted pack");
});

test("a pack stops matching when a later observation withdraws copying", () => {
  const { sources, pack } = admittedPack();
  // A second, real observation of the same resource that withdraws snippets.
  const withdrawn = sourcePolicyWitness(nosnippetPolicy());
  assert.ok(withdrawn, "the withdrawal must be a real observation");
  const changed = sources.map((source) => ({
    ...source,
    _sourcePolicy: withdrawn,
    _sourcePolicyBinding: sourcePolicyBinding(withdrawn),
  }));
  assert.equal(sourceCanSupportPublicCitation(changed[0], { now: Date.now() }).eligible, true,
    "the record is still an eligible citation, so only the copy decision changed");
  assert.equal(evidencePackMatchesSources(pack, changed), false);
});

test("a pack stops matching once its observation expires", () => {
  const admittedAt = Date.now();
  const policy = policyFor({
    html: "<main><p>Kinnitatud keha sisaldab pindala naitajat.</p></main>"
      + `<meta name="robots" content="unavailable-after: ${new Date(admittedAt + 60_000).toISOString()}">`,
  });
  const item = producedItem({ content: `${FOREST_FACT}${FILLER.repeat(40)}`, policy });
  const sources = evidenceDocumentsFromListing({ items: [{ ...item, citation: 1 }] });
  // Both clocks are injected, so the case does not depend on how long the test
  // takes to run. Production callers pass neither and default to now.
  const pack = buildEvidencePack({ sources, query: FALLBACK_QUERY, now: admittedAt });
  assert.equal(isEvidencePack(pack), true, "the pack is admitted inside the observation window");
  assert.equal(evidencePackMatchesSources(pack, sources, { now: admittedAt }), true,
    "the same instant still authenticates the pack");
  assert.equal(evidencePackMatchesSources(pack, sources, { now: admittedAt + 120_000 }), false,
    "past unavailable-after the witness no longer authenticates the pack");
});

test("the answer validator refuses a changed witness before publication", () => {
  const { sources, pack } = admittedPack();
  const draft = { ...citedDraft(sources[0]), query: FALLBACK_QUERY, sources };
  const payload = { intro: FOREST_FACT, intro_citations: [1], parts: [] };
  const unchanged = validateGroundedAnswer(payload, draft, FALLBACK_QUERY, pack);
  assert.notEqual(unchanged.rejectionReason, "evidence-insufficient",
    "an unchanged record must still reach claim validation");

  const changed = validateGroundedAnswer(payload, { ...draft, sources: withoutWitness(sources) }, FALLBACK_QUERY, pack);
  assert.equal(changed.answer, null);
  assert.equal(changed.rejectionReason, "evidence-insufficient");
});

test("a producer record without a witness is not replayed from the cache", () => {
  const { item } = admittedPack();
  const source = { ...item, citation: 1 };
  const safe = sanitizeCachedResponse(citedDraft(source), QUERY);
  assert.ok(safe, "the witnessed producer record is cacheable");
  const stripped = {
    ...safe,
    sources: safe.sources.map((cached) => {
      const { _sourcePolicy: _policy, _sourcePolicyBinding: _binding, ...rest } = cached;
      return rest;
    }),
  };
  assert.equal(restoreCachedResponse(stripped, QUERY), null);
});

// ---------------------------------------------------------------------------
// 12. A source that expires during generation is not republished
// ---------------------------------------------------------------------------
// The pipeline attaches the pack excerpt to the pre-model draft and then waits
// for the model. The observation ends during that wait, so text that was legal
// when the pack was built is no longer legal when the response is written. The
// clock is mocked rather than slept: the provider stub advances it by the width
// of the model call while the request deadline stays far away. The last case
// cuts the request with its own shortened answer deadline and replays the
// snapshot taken before the wait. The first case is a control, so a red case
// cannot pass by never publishing copied text at all.

const NULL_ANSWER = {
  answer: null,
  acceptedClaims: [],
  attempt: { provider: "stub", status: "degraded", reason: "timeout" },
};

function expiringProducerRecord({ expiresInMs }) {
  const startedAt = Date.now();
  const policy = policyFor({
    html: "<main><p>Kinnitatud keha sisaldab pindala naitajat.</p></main>"
      + `<meta name="robots" content="unavailable-after: ${new Date(startedAt + expiresInMs).toISOString()}">`,
  });
  const item = producedItem({
    content: `${FOREST_FACT}${FILLER.repeat(40)}`,
    // The row snippet is the copied text that reaches the reader, so the fixture
    // must carry one for the publication boundary to have something to withhold.
    summary: `${FOREST_FACT}${FILLER.repeat(4)}`,
    policy,
  });
  return { startedAt, item, expiresAt: startedAt + expiresInMs };
}

async function liveWithAdvancingClock({ startedAt, item, advanceMs = 2_000, answerWith }) {
  const originalNow = Date.now;
  let current = startedAt;
  let providerCalls = 0;
  Date.now = () => current;
  try {
    const response = await searchEnvironmentLive(FALLBACK_QUERY, {
      startedAt,
      deadlineAt: startedAt + 5_000,
      useCache: false,
      searchResults: { items: [{ ...item, citation: 1 }], total: 1 },
      recordSearch: async () => ({ status: "disabled" }),
      generateAnswer: async (query) => {
        providerCalls += 1;
        current += advanceMs;
        return answerWith(query);
      },
    });
    return { response, providerCalls, endedAt: current };
  } finally {
    Date.now = originalNow;
  }
}

test("a slow answer publishes the snippet while the observation is live", async () => {
  const { startedAt, item } = expiringProducerRecord({ expiresInMs: 60 * 60 * 1_000 });
  const { response, providerCalls } = await liveWithAdvancingClock({
    startedAt,
    item,
    answerWith: async () => NULL_ANSWER,
  });
  assert.equal(providerCalls, 1, "the model phase must run for this case to mean anything");
  const source = response.sources.find((candidate) => candidate.url === FOREST_URL);
  assert.ok(source, "the source must be published as a link");
  assert.match(String(source.summary ?? source.evidenceExcerpt ?? ""), /2,3 miljonit hektarit/u,
    "the live control proves this fixture reaches published copied text");
});

test("an observation that ends during generation is not republished", async () => {
  const { startedAt, item, expiresAt } = expiringProducerRecord({ expiresInMs: 1_000 });
  const { response, providerCalls, endedAt } = await liveWithAdvancingClock({
    startedAt,
    item,
    answerWith: async () => NULL_ANSWER,
  });
  assert.equal(providerCalls, 1, "the model phase must run for this race to be real");
  assert.ok(endedAt > expiresAt, "the response must be written after the observation ended");

  const source = response.sources.find((candidate) => candidate.url === FOREST_URL);
  assert.ok(source, "link navigation must remain");
  assert.equal(source.title, "Metsastatistika");
  assert.equal(source.organization, "Keskkonnaagentuur");
  assert.equal(String(source.evidenceExcerpt ?? ""), "", "an expired observation publishes no excerpt");
  assert.equal(String(source.summary ?? ""), "", "an expired observation publishes no summary");
  assert.doesNotMatch(JSON.stringify(response.answer ?? {}), /2,3 miljonit hektarit/u,
    "no claim copied from the expired source may stand in the answer");
});

test("a timed-out answer does not replay a copy whose observation ended", async () => {
  const { startedAt, item, expiresAt } = expiringProducerRecord({ expiresInMs: 2_000 });
  const previousAnswerBudget = process.env.ANSWER_DEADLINE_MS;
  const previousNow = Date.now;
  let current = startedAt;
  let advanced = false;
  process.env.ANSWER_DEADLINE_MS = "1000";
  // The clock advances while the model call is outstanding, and the request is
  // still cut by its own answer deadline, so the replay really is a timeout. The
  // advance does not race the setup: the mocked clock stands still until the
  // timer fires, however long the machine takes to reach it.
  const advance = setTimeout(() => {
    current = startedAt + 10_000;
    advanced = true;
  }, 250);
  Date.now = () => current;
  let providerCalls = 0;
  let response;
  try {
    response = await searchEnvironmentLive(FALLBACK_QUERY, {
      startedAt,
      deadlineAt: startedAt + 60_000,
      useCache: false,
      searchResults: { items: [{ ...item, citation: 1 }], total: 1 },
      recordSearch: async () => ({ status: "disabled" }),
      // The model never answers, so the snapshot taken before the wait is replayed.
      generateAnswer: () => {
        providerCalls += 1;
        return new Promise(() => {});
      },
    });
  } finally {
    clearTimeout(advance);
    Date.now = previousNow;
    if (previousAnswerBudget === undefined) delete process.env.ANSWER_DEADLINE_MS;
    else process.env.ANSWER_DEADLINE_MS = previousAnswerBudget;
  }
  assert.equal(providerCalls, 1, "the model phase must run so the replay is the thing under test");
  assert.equal(advanced, true, "the clock must have advanced before the replay");
  assert.ok(current > expiresAt, "the replay must happen after the observation ended");
  assert.equal(response.answerAttempt, undefined, "the deadline fallback is a replay, not the pipeline's own answer");

  const source = response.sources.find((candidate) => candidate.url === FOREST_URL);
  assert.ok(source, "link navigation must remain after the replay");
  assert.equal(source.title, "Metsastatistika");
  assert.equal(source.organization, "Keskkonnaagentuur");
  assert.equal(String(source.evidenceExcerpt ?? ""), "", "a replayed snapshot publishes no expired excerpt");
  assert.equal(String(source.summary ?? ""), "", "a replayed snapshot publishes no expired summary");
  assert.doesNotMatch(JSON.stringify(response.answer ?? {}), /2,3 miljonit hektarit/u,
    "an expired observation cannot support an answer");
});

// ---------------------------------------------------------------------------
// 13. The links-only replacement is a projection, not a deletion
// ---------------------------------------------------------------------------
// A raw draft still holds bodies, witnesses, digests and metadata, and an answer
// event can embed the listing. A marker planted in every private field must not
// survive the replacement, and the bound that decides when to use it must travel
// beside the payload instead of inside it.

const LEAK_MARKER = "KONFIDENTSIAALNE-MARKER-71";

function rawDraftWithMarkers(policy) {
  const record = fetchedRecord({ witness: policy });
  return {
    query: QUERY,
    total: 1,
    generatedAt: new Date().toISOString(),
    answer: {
      eyebrow: "Kontrollitud vastus",
      title: `Kontrollitud ${LEAK_MARKER}`,
      intro: `Kinnitatud keha ${LEAK_MARKER}`,
      introCitations: [1],
      parts: [{ title: "Osa", text: LEAK_MARKER, citations: [1] }],
      note: LEAK_MARKER,
    },
    sources: [{
      ...record,
      content: LEAK_MARKER,
      answer: LEAK_MARKER,
      metadata: { note: LEAK_MARKER, source_policy: policy },
      _contentHash: "d".repeat(64),
      _sourcePolicy: policy,
      _sourcePolicyBinding: sourcePolicyBinding(policy),
    }],
    chart: {
      citation: 1,
      kind: "series",
      title: LEAK_MARKER,
      series: [{ label: LEAK_MARKER, points: [{ x: 2023, y: 1 }] }],
    },
    related: ["Metsamaa pindala"],
    clarification: LEAK_MARKER,
    searchResults: {
      total: 1,
      items: [{ ...record, summary: LEAK_MARKER, content: LEAK_MARKER, metadata: { note: LEAK_MARKER } }],
    },
  };
}

test("the withheld replacement carries no private field, no witness and no marker", () => {
  const policy = policyFor();
  const draft = rawDraftWithMarkers(policy);
  const fallback = withholdPublicationCopy(draft);
  const serialized = JSON.stringify(fallback);

  assert.doesNotMatch(serialized, new RegExp(LEAK_MARKER, "u"), "no private marker may survive the replacement");
  assert.doesNotMatch(serialized, /_sourcePolicy|source_policy|_contentHash|_sourcePolicyBinding|metadata/u);
  assert.doesNotMatch(serialized, new RegExp(sourcePolicyBinding(policy), "u"), "the witness must not travel");
  assert.equal(fallback.chart, undefined, "the chart goes with the expired claim");
  assert.equal(fallback.answer.introCitations.length, 0);
  assert.equal(fallback.answer.parts.length, 0);
  assert.equal(fallback.answer.note, "");
  assert.equal(fallback.answer.eyebrow, "Allikas ei ole enam avaldatav");
  assert.ok(fallback.answer.intro.length > 20, "the card still says what happened");
  assert.equal(fallback.sources.length, 1, "the reader keeps the navigation");
  assert.equal(fallback.sources[0].url, draft.sources[0].url);
  assert.equal(fallback.sources[0].title, "Metsastatistika");
  assert.equal(fallback.sources[0].evidenceExcerpt, undefined);
  assert.equal(fallback.sources[0].summary, undefined);
  assert.equal(fallback.searchResults.items.length, 1);
  assert.equal(fallback.searchResults.items[0].url, draft.sources[0].url);
  assert.equal(fallback.searchResults.items[0].summary, undefined, "the embedded listing keeps links only");
});

test("the internal expiry bound travels beside the payload and never inside it", () => {
  const policy = policyFor();
  const draft = citedDraft(fetchedRecord({ witness: policy }));
  const response = publicResponse(draft, { now: Date.now() });
  const bound = response[ANSWER_SOURCE_EXPIRY];

  assert.equal(typeof bound, "number", "a windowed source must yield a finite bound");
  assert.equal(Number.isFinite(bound), true);
  const spread = { ...response };
  assert.equal(spread[ANSWER_SOURCE_EXPIRY], bound, "a spread keeps the bound for an emitter");
  assert.equal(publicationCopyExpiry(response), bound, "the helper agrees with the attached bound");
  assert.equal(JSON.stringify(response).includes(String(bound)), false, "the instant never enters a payload");
  assert.equal(JSON.stringify(response).includes("answer-source-expiry"), false);
  assert.equal(Object.keys(response).includes("_sourceExpiryAt"), false, "no string key may carry the instant");
});

// ---------------------------------------------------------------------------
// 14. The copy decision belongs to the source, and a claim needs a live window
// ---------------------------------------------------------------------------
// These records carry no citation, which is exactly how a producer emits them:
// the citation is assigned when the answer is composed. A decision keyed by the
// citation would be one shared key for every uncited source, so the first
// source's answer would be reused for the rest. The claim case is separate: a
// body that shows no excerpt and no summary still cannot back a claim after the
// publisher window closed.

function orderedProducerPair() {
  const allowed = producedItem({
    content: `${APPROVED_TEXT} Lisalause pindala kohta.`,
    summary: `${APPROVED_TEXT} Lisalause pindala kohta.`,
    policy: maxSnippetPolicy(120),
  });
  const restricted = {
    ...producedItem({
      content: `${RESTRICTED_TEXT} Lisalause kuupmeetri kohta.`,
      summary: `${RESTRICTED_TEXT} Lisalause kuupmeetri kohta.`,
      policy: policyFor({
        finalUrl: OTHER_URL,
        html: "<main><p>Piiratud keha sisaldab kuupmeetri naitajat.</p></main>"
          + '<meta name="robots" content="nosnippet">',
      }),
    }),
    url: OTHER_URL,
  };
  return { allowed, restricted };
}

function uncitedDraft(sources) {
  return {
    query: QUERY,
    total: sources.length,
    answer: {
      eyebrow: "Kontrollitud vastus",
      title: "Kontrollitud fakt",
      intro: "Fakt parineb ametlikest allikatest.",
      introCitations: [],
      parts: [],
      note: "Kontrolli algallikat.",
    },
    sources,
  };
}

const publishedCopiedText = (source) => String(source?.summary ?? source?.evidenceExcerpt ?? "");

test("two uncited sources keep their own copy decisions", () => {
  const { allowed, restricted } = orderedProducerPair();
  const response = publicResponse(uncitedDraft([allowed, restricted]), { now: Date.now() });

  assert.equal(response.sources.length, 2, "both links stay published");
  assert.match(publishedCopiedText(response.sources[0]), /Kinnitatud keha/u,
    "the allowed source keeps its copied text");
  assert.equal(publishedCopiedText(response.sources[1]), "",
    "the nosnippet source publishes no copied text, whatever the first source allows");
});

test("the copy decision follows the source, not its position", () => {
  const { allowed, restricted } = orderedProducerPair();
  const response = publicResponse(uncitedDraft([restricted, allowed]), { now: Date.now() });

  assert.equal(response.sources.length, 2, "both links stay published");
  assert.equal(publishedCopiedText(response.sources[0]), "",
    "the nosnippet source publishes no copied text");
  assert.match(publishedCopiedText(response.sources[1]), /Kinnitatud keha/u,
    "the allowed source still keeps its copied text when it comes second");
});

test("a closed publisher window withholds a claim that shows no copied field", () => {
  const closedAt = Date.now() - 1_000;
  const requestBegan = closedAt - 60_000;
  const fact = "Sanitaarraiet tehakse metsa sanitaarse seisundi parandamiseks.";
  const policy = policyFor({
    html: `<meta name="robots" content="unavailable-after: ${new Date(closedAt).toISOString()}">`
      + `<main><p>${fact}</p></main>`,
  });
  // Neither an excerpt nor a summary: the claim is the only copy of the body in
  // the response, so the decision can only come from the stored policy.
  const record = fetchedRecord({ witness: policy, summary: "", content: fact });
  const draft = citedDraft(record);
  draft.answer.intro = fact;

  const response = publicResponse(draft, { now: requestBegan });

  assert.ok(response.sources[0], "the link stays published");
  assert.equal(String(response.sources[0].summary ?? ""), "", "no copied field to show");
  assert.doesNotMatch(JSON.stringify(response.answer ?? {}), /Sanitaarraiet tehakse/u,
    "a closed publisher window cannot support a claim that shows no copied field");
});

// A policy may release the snippet and withhold the model evidence. The
// observer never produces that pair on its own, but the schema allows it and
// `validateSourcePolicy` only forbids the opposite direction
// (`answerEvidence` without `displaySnippet`), so a stored row can.
function snippetOnlyPolicy() {
  const observed = policyFor();
  return { ...observed, use: { ...observed.use, answerEvidence: false } };
}

test("a snippet-only policy may show its snippet but cannot support a claim", () => {
  const policy = snippetOnlyPolicy();
  const record = fetchedRecord({
    witness: policy,
    summary: APPROVED_TEXT,
    content: `${APPROVED_TEXT} Lisalause pindala kohta.`,
  });
  const draft = citedDraft(record);

  const response = publicResponse(draft, { now: Date.now() });

  assert.ok(response.sources[0], "the link stays published");
  assert.equal(response.sources[0].summary, APPROVED_TEXT, "the permitted snippet still shows");
  assert.equal(response.sources[0].evidenceExcerpt, undefined,
    "an excerpt needs the evidence permission, which this policy withholds");
  assert.doesNotMatch(JSON.stringify(response.answer ?? {}), /Fakt parineb ametlikust allikast/u,
    "a source without answer-evidence permission cannot support a claim");
});

// The draft event is a structuredClone of the projected draft, and a clone
// drops every symbol, including the copy bound. Without it an emitter that
// stores the draft can replay its copied prose past the publisher window, and a
// synthesis-only source need not appear in the raw listing at all.
test("the draft event carries its copy bound across the clone", async () => {
  const { startedAt, item, expiresAt } = expiringProducerRecord({ expiresInMs: 60_000 });
  const forwarded = [];
  await searchEnvironmentLive(FALLBACK_QUERY, {
    startedAt,
    deadlineAt: startedAt + 5_000,
    useCache: false,
    searchResults: { items: [{ ...item, citation: 1 }], total: 1 },
    recordSearch: async () => ({ status: "disabled" }),
    onDraft: (draft) => forwarded.push(draft),
    generateAnswer: async () => NULL_ANSWER,
  });

  assert.equal(forwarded.length, 1, "the draft event must be emitted once");
  const bound = forwarded[0][ANSWER_SOURCE_EXPIRY];
  assert.equal(typeof bound, "number", "the draft event must carry a finite copy bound");
  assert.equal(Number.isFinite(bound), true);
  assert.equal(bound <= expiresAt, true, "the bound cannot outlive the publisher window");
  assert.equal(bound >= expiresAt - 5_000, true, "the bound must come from that window");
  const json = JSON.stringify(forwarded[0]);
  assert.equal(json.includes(String(bound)), false, "the instant stays out of the payload");
  assert.equal(json.includes("answer-source-expiry"), false);
});
