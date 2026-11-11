import assert from "node:assert/strict";
import test from "node:test";

import { streamListingThenAnswer } from "../server/http-stream.mjs";
import { answerDeadline, progressiveListingBudgetMs, searchDeadline } from "../server/request-budget.mjs";
import { createSearchJobRun } from "../server/search_job_runner.mjs";
import { JOB_BOUNDS, createSearchJobStore } from "../server/search_jobs.mjs";
import { publicSearchListing } from "../server/retrieval.mjs";
import { SOURCE_POLICY_PRODUCT, observeSourcePolicy } from "../server/source_policy.mjs";

// Behaviour of the detached job run with every collaborator injected: no
// database, no model, no socket and no clock dependency beyond the real budget
// helpers. These tests exist because the job runner is where the reader-visible
// ordering is decided, and a helper call that is missing there cannot be caught
// by the registry's own tests.

const FILTERS = Object.freeze({
  source: "all",
  category: "",
  year: null,
  sort: "relevance",
});

const SCOPE = Object.freeze({
  question: "metsateatis",
  retrievalQuery: "metsateatis",
  page: 1,
  pageSize: 12,
  filters: FILTERS,
  blockedAssessment: null,
});

const LISTING = Object.freeze({
  total: 1,
  page: 1,
  pageSize: 12,
  pageCount: 1,
  hasMore: false,
  items: [{ id: "source-1", title: "Metsateatis" }],
});

const FINAL_ANSWER = Object.freeze({ answer: "lõplik vastus", sources: ["source-1"] });
const DRAFT_ANSWER = Object.freeze({ answer: "mustand vastus", sources: ["source-1"] });

function harness({ kind = "search", answerSearch, answerFollowUp, listing, publishListing } = {}) {
  const emitted = [];
  const releases = [];
  const calls = { listing: 0, search: 0, followUp: 0 };
  const run = createSearchJobRun({
    kind,
    scope: { ...SCOPE },
    clientKey: "client-1",
    acquireSlot: async () => {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        releases.push(emitted.map((entry) => entry.type));
      };
    },
    listing: async (options) => {
      calls.listing += 1;
      return listing ? listing(options) : { ...LISTING };
    },
    answerSearch: async (options) => {
      calls.search += 1;
      calls.searchOptions = options;
      return answerSearch ? answerSearch(options) : { ...FINAL_ANSWER };
    },
    answerFollowUp: async (options) => {
      calls.followUp += 1;
      calls.followUpOptions = options;
      return answerFollowUp ? answerFollowUp(options) : { ...FINAL_ANSWER };
    },
    fallbackAnswer: ({ reason }) => ({ answer: `varuvastus:${reason}`, sources: [] }),
    blockedPayload: () => ({ searchResults: { total: 0, items: [] }, answer: "ulatus" }),
    publishListing: publishListing ?? ((value) => ({ ...value, published: true })),
    emptyListing: () => ({ total: 0, page: 1, pageSize: 12, pageCount: 0, hasMore: false, items: [] }),
    flow: streamListingThenAnswer,
    listingDeadline: (startedAt) => searchDeadline(startedAt),
    listingWindow: ({ remainingMs }) => progressiveListingBudgetMs({ remainingMs }),
    answerDeadline: (nowMs) => answerDeadline(nowMs),
    transportReserveMs: 250,
  });
  const emit = (type, payload) => {
    emitted.push({ type, payload });
  };
  return { run, emit, emitted, releases, calls };
}

function types(emitted) {
  return emitted.map((entry) => entry.type);
}

function signalOf() {
  return new AbortController().signal;
}

test("a search job publishes a grounded draft after the listing and before the final answer", async () => {
  let draftHook = null;
  let clientKeySeen = null;
  const { run, emit, emitted, calls } = harness({
    answerSearch: async ({ onDraft, llmClientKey }) => {
      clientKeySeen = llmClientKey;
      draftHook = typeof onDraft === "function" ? onDraft : null;
      if (draftHook) draftHook({ ...DRAFT_ANSWER });
      // A slow model must not delay the draft it already grounded.
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { ...FINAL_ANSWER };
    },
  });

  await run({ signal: signalOf(), emit });

  assert.equal(calls.listing, 1, "the listing must be retrieved exactly once");
  assert.equal(clientKeySeen, "client-1", "the answer must receive the client key the registry never returns");
  assert.equal(
    typeof draftHook,
    "function",
    "a search job must hand the grounded draft to the reader instead of dropping it",
  );
  assert.deepEqual(
    types(emitted),
    ["results", "draft", "answer"],
    `a job must emit the listing, then the draft, then the answer, got ${JSON.stringify(types(emitted))}`,
  );

  const results = emitted[0].payload.searchResults;
  assert.equal(results.published, true, "the listing event must carry the published listing");
  const draft = emitted[1].payload.result;
  assert.equal(draft.answer, DRAFT_ANSWER.answer, "the draft event must carry the grounded draft");
  assert.deepEqual(draft.searchResults, results, "the draft must reference the same published source set as the listing");
  const answer = emitted[2].payload.result;
  assert.equal(answer.answer, FINAL_ANSWER.answer, "the answer event must carry the final answer");
  assert.deepEqual(answer.searchResults, results, "the answer must reference the same published source set as the listing");
});

test("a search job keeps its runner slot until a detached cleanup settles", async () => {
  let cleanupHook = null;
  let resolveCleanup = null;
  let cleanupSettled = false;
  const { run, emit, emitted, releases } = harness({
    answerSearch: async ({ onBackgroundCleanup }) => {
      cleanupHook = typeof onBackgroundCleanup === "function" ? onBackgroundCleanup : null;
      if (cleanupHook) {
        cleanupHook(new Promise((resolve) => {
          resolveCleanup = () => {
            cleanupSettled = true;
            resolve();
          };
        }));
      }
      return { ...FINAL_ANSWER };
    },
  });

  let runSettled = false;
  const running = run({ signal: signalOf(), emit }).then(() => {
    runSettled = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.ok(
    types(emitted).includes("answer"),
    `the reader must get the answer without waiting for the cleanup, got ${JSON.stringify(types(emitted))}`,
  );
  assert.equal(
    typeof cleanupHook,
    "function",
    "the job runner must collect background cleanup through onBackgroundCleanup",
  );
  assert.equal(
    runSettled,
    false,
    "the runner must not settle while the cleanup it detached is still pending",
  );
  assert.equal(cleanupSettled, false, "the test has not released the cleanup yet");
  // Retrieval capacity is released exactly when retrieval settles, which the
  // shared flow reports before it publishes anything, exactly like the
  // streaming route. What a stalled cleanup keeps is the job slot, which is the
  // run's own settlement asserted above, not this admission.
  assert.equal(releases.length, 1, `admission must be released exactly once, got ${JSON.stringify(releases)}`);
  assert.equal(releases[0].length, 0, `admission is released with retrieval, before publication, got ${JSON.stringify(releases[0])}`);

  resolveCleanup();
  await running;

  assert.equal(runSettled, true, "the runner must settle once the cleanup settled");
  assert.equal(releases.length, 1, "a late cleanup must not release admission a second time");
});

test("a follow-up job also collects and waits for its detached cleanup", async () => {
  let cleanupHook = null;
  let resolveCleanup = null;
  let clientKeySeen = null;
  const { run, emit, emitted } = harness({
    kind: "follow-up",
    answerFollowUp: async (options) => {
      clientKeySeen = options.llmClientKey;
      cleanupHook = typeof options.onBackgroundCleanup === "function" ? options.onBackgroundCleanup : null;
      if (cleanupHook) cleanupHook(new Promise((resolve) => { resolveCleanup = resolve; }));
      return { ...FINAL_ANSWER };
    },
  });

  let runSettled = false;
  const running = run({ signal: signalOf(), emit }).then(() => {
    runSettled = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(
    types(emitted),
    ["results", "answer"],
    `a follow-up job must not invent a draft, got ${JSON.stringify(types(emitted))}`,
  );
  assert.equal(clientKeySeen, "client-1", "the follow-up answer must receive the client key");
  assert.equal(
    typeof cleanupHook,
    "function",
    "a follow-up job runner must collect background cleanup through onBackgroundCleanup",
  );
  assert.equal(runSettled, false, "the follow-up runner must not settle while its cleanup is pending");

  resolveCleanup();
  await running;
  assert.equal(runSettled, true, "the follow-up runner must settle once the cleanup settled");
});

test("a cancelled search job still holds its slot until the detached cleanup settles", async () => {
  const controller = new AbortController();
  let cleanupHook = null;
  let resolveCleanup = null;
  const { run, emit, emitted } = harness({
    answerSearch: async ({ onBackgroundCleanup }) => {
      cleanupHook = typeof onBackgroundCleanup === "function" ? onBackgroundCleanup : null;
      if (cleanupHook) {
        cleanupHook(new Promise((resolve) => {
          resolveCleanup = resolve;
        }));
      }
      // The reader navigated away while the answer was still being generated.
      controller.abort();
      throw new DOMException("Search cancelled", "AbortError");
    },
  });

  let runSettled = false;
  const running = run({ signal: controller.signal, emit }).then(() => {
    runSettled = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.ok(types(emitted).includes("results"), "the listing must survive a cancelled answer");
  assert.equal(types(emitted).includes("answer"), false, "an aborted answer must not publish a final answer");
  assert.equal(
    typeof cleanupHook,
    "function",
    "a cancelled job must still collect the cleanup it detaches",
  );
  assert.equal(
    runSettled,
    false,
    "cancellation must not free the job slot while the aborted work is still draining",
  );

  resolveCleanup();
  await running;
  assert.equal(runSettled, true, "the cancelled job must settle once its cleanup settled");
});

// The job store replays retained public events, so a listing projection made at
// creation time can be served again after a permitted source closed its copied
// text window. Every event that carries a listing must therefore be projected
// against the clock at the moment it is emitted, not reused from an earlier one.
const EXPIRY_PAGE_URL = "https://www.keskkonnaportaal.ee/et/teemad/mets/metsastatistika";
const EXPIRY_TEXT = "Metsamaa pindala oli 2,3 miljonit hektarit.";
const EXPIRY_OBSERVED_AT = "2026-11-11T06:00:00.000Z";

// A publisher decision is bound to the URL it was observed on, so a fixture that
// reuses one policy for several URLs silently withholds their excerpts.
function expiringPolicyFor(url, unavailableAfter) {
  return observeSourcePolicy({
    requestedUrl: url,
    finalUrl: url,
    product: SOURCE_POLICY_PRODUCT,
    observedAt: EXPIRY_OBSERVED_AT,
    contentKind: "fetched-html",
    bodyHash: "a".repeat(64),
    artifactHash: "b".repeat(64),
    robotsObservation: { status: "allowed", origin: "https://www.keskkonnaportaal.ee", checkedAt: EXPIRY_OBSERVED_AT },
    html: `<!doctype html><html lang="et"><head><title>Mets</title>`
      + `<meta name="robots" content="unavailable_after: ${unavailableAfter}">`
      + `</head><body><main><h1>Mets</h1><p>${EXPIRY_TEXT}</p></main></body></html>`,
    headerInstances: [],
  });
}

function expiringListing(unavailableAfter) {
  const policy = expiringPolicyFor(EXPIRY_PAGE_URL, unavailableAfter);
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
      summary: EXPIRY_TEXT,
      metadata: { source_policy: policy },
      _contentHash: "b".repeat(64),
    }],
    appliedFilters: { source: "all", category: "", year: null, sort: "relevance" },
    facets: { sources: [], categories: [], years: [] },
  };
}

test("a job re-projects every event so an expired excerpt never reaches a replay", async () => {
  const clock = { now: Date.parse("2026-11-11T12:00:00.000Z") };
  const listing = expiringListing("2026-11-11T12:30:00Z");
  const { run, emit, emitted } = harness({
    listing: async () => listing,
    publishListing: (value) => publicSearchListing(value, { now: clock.now }),
    answerSearch: async ({ onDraft }) => {
      // The model takes its time and the copy window closes meanwhile.
      clock.now = Date.parse("2026-11-11T13:00:00.000Z");
      if (typeof onDraft === "function") onDraft({ answer: "mustand", sources: [] });
      return { ...FINAL_ANSWER };
    },
  });

  await run({ signal: signalOf(), emit });

  assert.deepEqual(types(emitted), ["results", "draft", "answer"]);
  const results = emitted[0].payload.searchResults.items[0];
  assert.equal(results.summary, EXPIRY_TEXT, "the excerpt was permitted when the listing was published");
  assert.equal(results.url, EXPIRY_PAGE_URL);

  const draft = emitted[1].payload.result.searchResults.items[0];
  assert.equal(draft.summary, "", "a draft emitted after the window closed must not carry the excerpt");
  assert.equal(draft.url, EXPIRY_PAGE_URL, "the draft keeps the normal source link");

  const answer = emitted[2].payload.result.searchResults.items[0];
  assert.equal(answer.summary, "", "an answer emitted after the window closed must not carry the excerpt");
  assert.equal(answer.url, EXPIRY_PAGE_URL, "the answer keeps the normal source link");
  assert.equal(answer.title, "Metsastatistika");

  const publicJson = JSON.stringify(emitted.map((entry) => entry.payload));
  assert.doesNotMatch(publicJson, /unavailable|_sourcePolicy|source_policy|_contentHash/u, "no policy witness may reach the reader");
  assert.doesNotMatch(publicJson, /metsateadis/u, "the reader's query text must not travel in the published listing");
});

// --- event expiry, end to end through the real store -------------------------
//
// A public event that carried a permitted excerpt can be served again later, at
// which point the publisher's copy window may have closed. The public item has
// no policy field, so the event itself must carry one internal minimum bound and
// one safe replacement; the store substitutes by its own clock and never exposes
// either. These tests use the real store, the real runner and the real
// projection, with an injected store clock, so the substitution is deterministic
// and nothing is fetched.

const EXPIRY_T0 = Date.parse("2026-11-11T12:00:00.000Z");

// The answer stage reports the earliest copied-text window it committed to as an
// enumerable symbol, so the flow's `{...result}` spread carries it while JSON
// serialization cannot. Registered, so producer and consumer agree without an
// import cycle; EvidenceBinding exports the same registry symbol.
const ANSWER_SOURCE_EXPIRY = Symbol.for("keskkonnaportaal.answer-source-expiry");

function storeHarness({
  now,
  answerSearch,
  listing,
  kind = "search",
  listingWindow,
  fallbackAnswer,
  scope,
  blockedPayload,
  jobBytes,
}) {
  const store = createSearchJobStore({ now, ...(jobBytes ? { jobBytes } : {}) });
  const emitted = [];
  const run = createSearchJobRun({
    kind,
    scope: scope ? { ...SCOPE, ...scope } : { ...SCOPE },
    clientKey: "client-1",
    acquireSlot: async () => () => undefined,
    listing: listing ?? (async () => ({ ...LISTING })),
    answerSearch: async (options) => {
      emitted.push(options);
      return answerSearch ? answerSearch(options) : { ...FINAL_ANSWER };
    },
    answerFollowUp: async () => ({ ...FINAL_ANSWER }),
    fallbackAnswer: fallbackAnswer
      ?? (({ reason }) => ({ answer: `varuvastus:${reason}`, sources: [] })),
    blockedPayload: blockedPayload
      ?? (() => ({ searchResults: { total: 0, items: [] }, answer: "ulatus" })),
    publishListing: (value) => publicSearchListing(value, { now: now() }),
    emptyListing: () => ({ total: 0, page: 1, pageSize: 12, pageCount: 0, hasMore: false, items: [] }),
    flow: streamListingThenAnswer,
    listingDeadline: (startedAt) => searchDeadline(startedAt),
    listingWindow: listingWindow ?? (({ remainingMs }) => progressiveListingBudgetMs({ remainingMs })),
    answerDeadline: (nowMs) => answerDeadline(nowMs),
    transportReserveMs: 250,
  });
  return { store, run, emitted };
}

async function settleJob(store, id, key) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const outcome = store.poll({ id, key, after: 0 });
    assert.equal(outcome.status, 200, `poll failed with ${outcome.status}`);
    if (outcome.body.state !== "running") return outcome.body;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("the job did not settle");
}

function jobId(value) {
  return { id: value, key: `${value}-key-0000000001` };
}

test("a stored results event is replaced by links only once its source window closes", async () => {
  const clock = { now: EXPIRY_T0 };
  const { store, run } = storeHarness({
    now: () => clock.now,
    listing: async () => expiringListing("2026-11-11T12:30:00Z"),
  });
  const { id, key } = jobId("job-window-listing");
  try {
    const start = store.start({ ...{ id, key }, kind: "search", payload: { q: "mets" }, clientKey: "client-1", run });
    assert.equal(start.status, 201, `creation failed with ${start.status}`);

    const fresh = await settleJob(store, id, key);
    const freshResults = fresh.events.find((entry) => entry.event.type === "results");
    assert.ok(freshResults, "the listing event must be stored");
    assert.equal(freshResults.event.searchResults.items[0].summary, EXPIRY_TEXT, "the excerpt was permitted at emit time");

    clock.now = Date.parse("2026-11-11T13:00:00.000Z");
    const replay = store.poll({ id, key, after: 0 }).body;
    const replayResults = replay.events.find((entry) => entry.event.type === "results");
    assert.equal(replayResults.seq, freshResults.seq, "the replacement must keep the stored sequence number");
    assert.equal(replay.state, fresh.state, "a substitution must not change the job state");

    assert.equal(
      JSON.stringify(replay).includes(EXPIRY_TEXT),
      false,
      "no copied text may survive anywhere in a replayed payload",
    );
    const item = replayResults.event.searchResults.items[0];
    assert.equal(item.summary, "", "an expired excerpt must not be served on a replay");
    assert.equal(item.url, EXPIRY_PAGE_URL, "the source link must survive the replacement");
    assert.equal(item.title, "Metsastatistika");

    const replayJson = JSON.stringify(replay);
    assert.doesNotMatch(replayJson, /expiresAt|fallback|unavailable|_sourcePolicy|source_policy|_contentHash/u,
      "neither the bound nor a policy witness may reach the reader");
    assert.doesNotMatch(replayJson, /metsateadis/u, "the query text must not travel in a replay");
  } finally {
    await store.close();
  }
});

test("an answer that cited a source first seen during synthesis is replaced by links only", async () => {
  const clock = { now: EXPIRY_T0 };
  const synthesisUrl = "https://www.keskkonnaportaal.ee/et/teemad/mets/raievolume";
  const synthesisBound = Date.parse("2026-11-11T12:30:00.000Z");
  const { store, run } = storeHarness({
    now: () => clock.now,
    // The listing itself carries no windowed source: the expiring source is
    // introduced by the answer stage, so the bound cannot come from the results.
    listing: async () => ({ ...LISTING }),
    answerSearch: async () => ({
      answer: "Raievolume oli 12 miljonit tihumeetrit.",
      chart: { series: [{ label: "2025", value: 12_000_000 }] },
      sources: [{
        id: "synthesis-source-1",
        url: synthesisUrl,
        title: "Raievolume",
        organization: "Keskkonnaagentuur",
        summary: "Raievolume oli 12 miljonit tihumeetrit.",
      }],
      [ANSWER_SOURCE_EXPIRY]: synthesisBound,
    }),
  });
  const { id, key } = jobId("job-window-answer");
  try {
    const start = store.start({ ...{ id, key }, kind: "search", payload: { q: "mets" }, clientKey: "client-1", run });
    assert.equal(start.status, 201, `creation failed with ${start.status}`);

    // The private channel itself: an enumerable symbol survives the flow's
    // spread, and serialization cannot carry it.
    const spread = { ...{ answer: "x", [ANSWER_SOURCE_EXPIRY]: synthesisBound }, searchResults: { items: [] } };
    assert.equal(spread[ANSWER_SOURCE_EXPIRY], synthesisBound, "the internal bound must survive a spread");
    assert.equal(
      JSON.stringify(spread).includes(String(synthesisBound)),
      false,
      "the internal bound must never be serializable",
    );
    assert.equal(
      Object.keys(spread).sort().join(","),
      "answer,searchResults",
      "the internal bound must not become a public string key",
    );

    const fresh = await settleJob(store, id, key);
    const freshAnswer = fresh.events.find((entry) => entry.event.type === "answer");
    assert.ok(freshAnswer, "the answer event must be stored");
    assert.equal(freshAnswer.event.result.answer, "Raievolume oli 12 miljonit tihumeetrit.");
    assert.deepEqual(
      Object.keys(freshAnswer.event.result).sort(),
      ["answer", "chart", "searchResults", "sources"],
      "the stored answer must expose exactly its public keys, with no internal expiry field",
    );
    assert.equal(
      JSON.stringify(fresh).includes("expiry"),
      false,
      "no expiry field, symbol or string, may reach a public body",
    );

    clock.now = Date.parse("2026-11-11T13:00:00.000Z");
    const replay = store.poll({ id, key, after: 0 }).body;
    const replayAnswer = replay.events.find((entry) => entry.event.type === "answer");
    assert.equal(replayAnswer.seq, freshAnswer.seq, "the replacement must keep the stored sequence number");

    assert.equal(
      JSON.stringify(replay).includes("12 miljonit"),
      false,
      "no expired claim may survive anywhere in a replayed payload",
    );
    const replaced = replayAnswer.event.result;
    assert.equal(Boolean(replaced.chart), false, "a chart derived from an expired source must not be served");
    assert.deepEqual(replaced.answer?.parts ?? [], [], "the replacement shows no claim parts");
    const source = (replaced.sources ?? [])[0];
    assert.ok(source, "the source links must survive the replacement");
    assert.equal(source.url, synthesisUrl, "the cited source link must survive");
    assert.equal(source.summary ?? "", "", "no copied excerpt may survive the replacement");

    const results = replay.events.find((entry) => entry.event.type === "results");
    assert.deepEqual(
      results.event,
      fresh.events.find((entry) => entry.event.type === "results").event,
      "an event with no windowed source must be served unchanged",
    );
    assert.doesNotMatch(
      JSON.stringify(replay),
      /expiresAt|expiry|fallback|unavailable|_sourcePolicy|_contentHash/u,
      "neither the bound nor a witness may reach the reader",
    );
  } finally {
    await store.close();
  }
});

test("a draft whose supporting source window closes is replaced by links only", async () => {
  const clock = { now: EXPIRY_T0 };
  const draftUrl = "https://www.keskkonnaportaal.ee/et/teemad/mets/kasvamine";
  const { store, run } = storeHarness({
    now: () => clock.now,
    listing: async () => expiringListing("2026-11-11T12:20:00Z"),
    answerSearch: async ({ onDraft }) => {
      // A draft is not a bare listing: it carries its own prose, a chart and a
      // cited source excerpt, all of which must go if a supporting window closes.
      if (typeof onDraft === "function") {
        onDraft({
          answer: "Juurdekasv oli 4,8 miljonit tihumeetrit.",
          chart: { series: [{ label: "2025", value: 4_800_000 }] },
          sources: [{
            id: "draft-source-1",
            url: draftUrl,
            title: "Juurdekasv",
            organization: "Keskkonnaagentuur",
            summary: "Juurdekasv oli 4,8 miljonit tihumeetrit.",
          }],
        });
      }
      return { ...FINAL_ANSWER };
    },
  });
  const { id, key } = jobId("job-window-draft");
  try {
    store.start({ ...{ id, key }, kind: "search", payload: { q: "mets" }, clientKey: "client-1", run });
    const fresh = await settleJob(store, id, key);
    const freshDraft = fresh.events.find((entry) => entry.event.type === "draft");
    assert.ok(freshDraft, "the draft event must be stored");
    assert.equal(freshDraft.event.result.answer, "Juurdekasv oli 4,8 miljonit tihumeetrit.");

    clock.now = Date.parse("2026-11-11T13:00:00.000Z");
    const replay = store.poll({ id, key, after: 0 }).body;
    const replacedDraft = replay.events.find((entry) => entry.event.type === "draft");
    assert.equal(replacedDraft.seq, freshDraft.seq, "the draft replacement must keep its sequence number");
    assert.equal(
      JSON.stringify(replay).includes("4,8 miljonit"),
      false,
      "a draft's own prose must not outlive its source window, anywhere in the payload",
    );
    const replaced = replacedDraft.event.result;
    assert.equal(Boolean(replaced.chart), false, "a draft chart derived from an expired source must not be served");
    assert.deepEqual(replaced.answer?.parts ?? [], [], "the replacement shows no draft claim parts");
    const source = (replaced.sources ?? [])[0];
    assert.ok(source, "the draft's source links must survive");
    assert.equal(source.url, draftUrl, "the draft source link must survive");
    assert.equal(source.summary ?? "", "", "no draft source excerpt may survive");
    const embedded = replaced.searchResults?.items?.[0];
    assert.ok(embedded, "the draft must keep its embedded listing links");
    assert.equal(!embedded.summary, true, "the embedded listing excerpt must be withheld too, in any spelling");
    assert.equal(embedded.url, EXPIRY_PAGE_URL);
    assert.doesNotMatch(
      JSON.stringify(replay),
      /expiresAt|expiry|fallback|unavailable|_sourcePolicy|_contentHash/u,
      "no expiry metadata or witness may reach the reader",
    );
  } finally {
    await store.close();
  }
});

test("a deadline-skipped answer carrying sourced copy is replaced by links only", async () => {
  const clock = { now: EXPIRY_T0 };
  const deadlineSourceUrl = "https://www.keskkonnaportaal.ee/et/teemad/mets/uuendatud";
  const { store, run } = storeHarness({
    now: () => clock.now,
    listing: async () => expiringListing("2026-11-11T12:10:00Z"),
    // The listing window is already spent, so the flow publishes the listing and
    // the deterministic card instead of starting an answer.
    listingWindow: () => 0,
    fallbackAnswer: () => ({
      answer: "Vastust ei jõutud koostada, allikad on loetletud.",
      sources: [{
        id: "deadline-source-1",
        url: deadlineSourceUrl,
        title: "Metsastatistika uuendus",
        organization: "Keskkonnaagentuur",
        summary: EXPIRY_TEXT,
      }],
    }),
  });
  const { id, key } = jobId("job-window-deadline");
  try {
    store.start({ ...{ id, key }, kind: "search", payload: { q: "mets" }, clientKey: "client-1", run });
    const fresh = await settleJob(store, id, key);
    assert.deepEqual(
      fresh.events.map((entry) => entry.event.type),
      ["results", "answer"],
      "a spent listing window publishes the listing and the deterministic card",
    );

    clock.now = Date.parse("2026-11-11T13:00:00.000Z");
    const replay = store.poll({ id, key, after: 0 }).body;
    const replacedAnswer = replay.events.find((entry) => entry.event.type === "answer").event.result;
    assert.equal(
      JSON.stringify(replay).includes("Vastust ei jõutud"),
      false,
      "the deadline card's prose must not outlive the source window, anywhere in the payload",
    );
    const source = (replacedAnswer.sources ?? [])[0];
    assert.equal(source?.url, deadlineSourceUrl, "the deadline card's source link must survive");
    assert.equal(source?.summary ?? "", "", "the deadline card's excerpt must be withheld");
    assert.doesNotMatch(
      JSON.stringify(replay),
      /expiresAt|expiry|fallback|unavailable|_sourcePolicy|_contentHash/u,
      "no expiry metadata or witness may reach the reader",
    );
  } finally {
    await store.close();
  }
});

test("a blocked request stores no copied text and needs no expiry bound", async () => {
  const clock = { now: EXPIRY_T0 };
  const { store, run } = storeHarness({
    now: () => clock.now,
    scope: { blockedAssessment: { kind: "out-of-scope", reason: "personal-data-lookup" } },
    blockedPayload: () => ({
      searchResults: { total: 0, page: 1, pageSize: 12, pageCount: 0, hasMore: false, items: [] },
      answer: "See küsimus on väljaspool portaali ulatust.",
    }),
  });
  const { id, key } = jobId("job-blocked-replay");
  try {
    store.start({ ...{ id, key }, kind: "search", payload: { q: "mets" }, clientKey: "client-1", run });
    const fresh = await settleJob(store, id, key);
    assert.deepEqual(fresh.events.map((entry) => entry.event.type), ["results", "answer"]);
    assert.equal(
      JSON.stringify(fresh).includes("\"summary\""),
      false,
      "a blocked answer copies nothing, so no expiry can be needed",
    );

    clock.now = Date.parse("2027-11-11T13:00:00.000Z");
    const replay = store.poll({ id, key, after: 0 }).body;
    assert.deepEqual(replay.events, fresh.events, "an event with no copied text must never be substituted");
    assert.doesNotMatch(
      JSON.stringify(replay),
      /expiresAt|expiry|fallback|unavailable|_sourcePolicy|_contentHash/u,
      "no expiry metadata may reach the reader",
    );
  } finally {
    await store.close();
  }
});

test("a listing whose events cannot fit beside their replacement keeps every link", async () => {
  // The store charges an event and its replacement to the same per-job budget.
  // When the pair does not fit the remaining budget it stores the links-only
  // replacement, so an expired excerpt is never replayed and every link stays.
  // A lowered per-job budget makes the case reachable without megabyte fixtures.
  const clock = { now: EXPIRY_T0 };
  // 4012 B original, 2012 B replacement, so a 5200 B job budget leaves a wide
  // margin on both sides of the decision while the pair cannot fit.
  const budget = 5_200;
  const bulkyListing = () => {
    const base = expiringListing("2026-11-11T12:30:00Z");
    const items = Array.from({ length: 5 }, (_, index) => {
      const url = `https://www.keskkonnaportaal.ee/et/teemad/mets/${index}`;
      return {
        ...base.items[0],
        id: `corpus-bulk-${index}`,
        url,
        title: `Metsastatistika ${index} ${"t".repeat(120)}`,
        summary: "s".repeat(400),
        metadata: { source_policy: expiringPolicyFor(url, "2026-11-11T12:30:00Z") },
      };
    });
    return { ...base, total: items.length, items };
  };
  const publishedBulky = publicSearchListing(bulkyListing(), { now: clock.now });
  const originalBytes = Buffer.byteLength(JSON.stringify({ searchResults: publishedBulky }), "utf8");
  const linksOnlyBytes = Buffer.byteLength(JSON.stringify({
    searchResults: {
      ...publishedBulky,
      items: publishedBulky.items.map((item) => ({ ...item, summary: "" })),
    },
  }), "utf8");
  assert.ok(originalBytes < budget, `each payload alone must be accepted, the listing is ${originalBytes} bytes`);
  assert.ok(linksOnlyBytes < budget, `the replacement alone must be accepted, it is ${linksOnlyBytes} bytes`);
  assert.ok(
    originalBytes + linksOnlyBytes > budget,
    `the pair must really not fit, got ${originalBytes + linksOnlyBytes} bytes for a ${budget} byte budget`,
  );

  const { store, run } = storeHarness({ now: () => clock.now, listing: async () => bulkyListing(), jobBytes: budget });
  const { id, key } = jobId("job-budget-pair");
  try {
    store.start({ ...{ id, key }, kind: "search", payload: { q: "mets" }, clientKey: "client-1", run });
    const fresh = await settleJob(store, id, key);
    assert.equal(fresh.state, "complete", "a budget pair must not fail the job for the reader");

    const results = fresh.events.find((entry) => entry.event.type === "results");
    assert.ok(results, "the listing must always be stored");
    assert.equal(results.event.searchResults.items.length, 5, "every link must be published");
    assert.equal(
      results.event.searchResults.items.every((item) => !item.summary),
      true,
      "an unaffordable pair must publish no copied text at all",
    );
    assert.equal(
      results.event.searchResults.items.every((item) => item.url && item.title && item.organization),
      true,
      "link metadata must survive the substitution",
    );

    clock.now = Date.parse("2026-11-11T13:00:00.000Z");
    const replay = store.poll({ id, key, after: 0 }).body;
    assert.equal(replay.events.find((entry) => entry.event.type === "results").event.searchResults.items.length, 5);
    assert.deepEqual(replay.events, fresh.events, "a links-only event has nothing to expire, so a replay is byte-identical");
    assert.doesNotMatch(
      JSON.stringify(replay),
      /expiresAt|expiry|fallback|unavailable|_sourcePolicy|_contentHash/u,
      "no expiry metadata or witness may reach the reader",
    );
  } finally {
    await store.close();
  }
});
