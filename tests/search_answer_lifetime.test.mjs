import assert from "node:assert/strict";
import test from "node:test";
import { configuredSearchBudgetMs, searchDeadline } from "../server/request-budget.mjs";
import { resolvePublicResponseBudget } from "../server/response-budget.mjs";
import { searchTimeoutFallback } from "../server/pipeline.mjs";
import { smiIncrementDocument } from "../server/indicators.mjs";
import { ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS } from "../server/forestry-public.mjs";
import { publicSearchListing } from "../server/retrieval.mjs";
import { SOURCE_POLICY_PRODUCT, observeSourcePolicy } from "../server/source_policy.mjs";
import { streamListingThenAnswer } from "../server/http-stream.mjs";

// This file uses only the interfaces that already existed at fa45efc, so a
// failure here is the old user-visible behaviour and not a missing import:
// a 60 s search ceiling, a 150 s absolute transport and a timeout that discards
// the deterministic forestry answer the reader would otherwise get.

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const FILTERS = { source: "all", category: "", year: null, sort: "relevance" };

test("the configured search ceiling leaves room for a listing and a long answer", () => {
  assert.ok(
    configuredSearchBudgetMs(undefined) >= 90_000,
    `search ceiling is ${configuredSearchBudgetMs(undefined)} ms, the reader loses the answer before a listing plus a 195 s answer can fit`,
  );
  assert.ok(searchDeadline(0) >= 90_000);
  assert.ok(configuredSearchBudgetMs("999999") >= 90_000, "an operator may raise, never silently shorten");
});

test("the public transport ceiling covers a bounded listing plus a long answer", () => {
  const budget = resolvePublicResponseBudget({});
  assert.ok(
    budget.absoluteTimeoutMs >= 300_000,
    `absolute response ceiling is ${budget.absoluteTimeoutMs} ms`,
  );
  assert.ok(
    budget.idleTimeoutMs >= 100_000,
    `idle response ceiling is ${budget.idleTimeoutMs} ms; a silent one-shot search is cut before it can answer`,
  );
});

test("an SMI timeout keeps the deterministic SMI answer instead of a generic timeout card", () => {
  const query = "kui palju puitu juurde kasvab Eestis";
  const result = searchTimeoutFallback(query, {
    assessmentQuery: query,
    searchResults: { items: [smiIncrementDocument()], total: 1 },
    filters: FILTERS,
    startedAt: NOW,
  });

  assert.match(result.answer.eyebrow, /SMI/u, `timeout eyebrow was "${result.answer.eyebrow}"`);
  assert.match(result.answer.title, /Juurdekasv SMI/u);
  assert.deepEqual(result.answer.introCitations, [1]);
  assert.ok(result.answer.parts.length >= 1);
});

test("a handbook question keeps its bibliographic answer on timeout", () => {
  const document = ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS.find((entry) => entry.id === "metsandusteatmik");
  const query = "mis on metsandusteatmik";
  const result = searchTimeoutFallback(query, {
    assessmentQuery: query,
    searchResults: {
      items: [{
        ...document,
        sourceTier: "official",
        retrieval: "official-service-directory",
        evidencePolicy: "versioned",
        _answerEvidenceEligible: true,
        _evidenceVersion: "handover",
        _evidenceStatusAt: new Date(NOW).toISOString(),
        freshness: { class: "reviewed-catalogue-extract", basis: "reviewed-at", maxAgeMs: 366 * 24 * 60 * 60 * 1_000, requiresSourceTimestamp: true },
      }],
      total: 1,
    },
    filters: FILTERS,
    startedAt: NOW,
  });

  assert.equal(result.answer.eyebrow, "Metsanduse teatmik", `timeout eyebrow was "${result.answer.eyebrow}"`);
  assert.match(result.answer.title, /Metsandusteatmik/u);
});

// A permitted fetched source can close its copied-text window while the answer
// is still being generated. The listing streamed first stays valid for that
// moment, but every later event republishes a listing, and that republication
// must be decided against the current clock: link metadata survives, the copied
// excerpt does not, and no policy witness or query text reaches the reader.
const EXPIRY_PAGE_URL = "https://www.keskkonnaportaal.ee/et/teemad/mets/metsastatistika";
const EXPIRY_VISIBLE_TEXT = "Metsamaa pindala oli 2,3 miljonit hektarit.";
const EXPIRY_OBSERVED_AT = "2026-11-11T06:00:00.000Z";

function expiryPage(head = "") {
  return `<!doctype html><html lang="et"><head><title>Mets</title>${head}</head>`
    + `<body><main><h1>Mets</h1><p>${EXPIRY_VISIBLE_TEXT}</p></main></body></html>`;
}

function expiringFetchedSource(unavailableAfter) {
  return observeSourcePolicy({
    requestedUrl: EXPIRY_PAGE_URL,
    finalUrl: EXPIRY_PAGE_URL,
    product: SOURCE_POLICY_PRODUCT,
    observedAt: EXPIRY_OBSERVED_AT,
    contentKind: "fetched-html",
    bodyHash: "a".repeat(64),
    artifactHash: "b".repeat(64),
    robotsObservation: {
      status: "allowed",
      origin: "https://www.keskkonnaportaal.ee",
      checkedAt: EXPIRY_OBSERVED_AT,
    },
    html: expiryPage(`<meta name="robots" content="unavailable_after: ${unavailableAfter}">`),
    headerInstances: [],
  });
}

function expiryListing(policy) {
  return {
    total: 1,
    page: 1,
    pageSize: 12,
    pageCount: 1,
    hasMore: false,
    items: [{
      id: "corpus-metsastatistika-1",
      url: EXPIRY_PAGE_URL,
      title: "Metsastatistika",
      organization: "Keskkonnaagentuur",
      type: "statistics",
      sourceTier: "official",
      published: "2026-10-01",
      summary: EXPIRY_VISIBLE_TEXT,
      metadata: { source_policy: policy },
      _contentHash: "b".repeat(64),
    }],
    appliedFilters: { source: "all", category: "", year: null, sort: "relevance" },
    facets: { sources: [], categories: [], years: [] },
  };
}

test("a listing republished after a source expires keeps the link and drops the excerpt", async () => {
  const clock = { now: Date.parse("2026-11-11T12:00:00.000Z") };
  const listing = expiryListing(expiringFetchedSource("2026-11-11T12:30:00Z"));
  const writes = [];
  const stream = {
    write: async (type, payload) => {
      writes.push({ type, payload });
    },
    heartbeat: () => undefined,
    finish: async () => undefined,
  };

  await streamListingThenAnswer({
    stream,
    heartbeatMs: 0,
    listing: async () => listing,
    answer: async () => {
      // Generation outlives the publisher's copy window.
      clock.now = Date.parse("2026-11-11T13:00:00.000Z");
      return { answer: "Vastus", sources: [] };
    },
    fallbackAnswer: () => ({ answer: "varuvastus", sources: [] }),
    publicListing: (value) => publicSearchListing(value, { now: clock.now }),
    now: () => clock.now,
  });

  assert.deepEqual(writes.map((entry) => entry.type), ["results", "answer"]);
  const published = writes[0].payload.searchResults.items[0];
  assert.equal(published.summary, EXPIRY_VISIBLE_TEXT, "the excerpt was permitted when the listing was published");
  assert.equal(published.url, EXPIRY_PAGE_URL);

  const republished = writes[1].payload.result.searchResults.items[0];
  assert.equal(
    republished.summary,
    "",
    "an excerpt whose publisher window closed must not be republished with the answer",
  );
  assert.equal(republished.url, EXPIRY_PAGE_URL, "the normal source link must survive the expired excerpt");
  assert.equal(republished.title, "Metsastatistika");
  assert.equal(republished.organization, "Keskkonnaagentuur");
  const answerJson = JSON.stringify(writes[1].payload);
  assert.doesNotMatch(answerJson, /unavailable|_sourcePolicy|source_policy|_contentHash/u, "no policy witness may reach the reader");
});
