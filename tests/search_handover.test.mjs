import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createBoundedNdjsonWriter,
  createPaddedJsonWriter,
  streamListingThenAnswer,
} from "../server/http-stream.mjs";
import {
  answerDeadline,
  configuredAnswerBudgetMs,
  configuredSearchBudgetMs,
  DEFAULT_ANSWER_DEADLINE_MS,
  DEFAULT_SEARCH_DEADLINE_MS,
  JSON_SEARCH_DEADLINE_CEILING_MS,
  searchTransportWindowMs,
  validateSearchTransportBudget,
} from "../server/request-budget.mjs";
import { resolvePublicResponseBudget } from "../server/response-budget.mjs";
import { searchTimeoutFallback } from "../server/pipeline.mjs";
import { publicSearchListing } from "../server/retrieval.mjs";
import { readSearchStream, searchWaitingMessage } from "../src/search-stream.js";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const FILTERS = { source: "all", category: "", year: null, sort: "relevance" };

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.writableEnded = false;
    this.headersSent = false;
    this.chunks = [];
    this.headers = new Map();
  }

  // Express refuses a header once the body has started, so the fake does the
  // same: a writer that pads before setting its content type fails here.
  setHeader(name, value) {
    if (this.headersSent) throw new Error("Cannot set headers after they are sent to the client");
    this.headers.set(String(name).toLocaleLowerCase("en"), value);
  }

  setTimeout() {}

  write(value) {
    this.headersSent = true;
    this.chunks.push(String(value));
    return true;
  }

  // Node's ServerResponse.end(chunk) writes the final chunk before ending. The
  // one-shot JSON route relies on exactly that, so the fake must model it.
  end(chunk) {
    this.headersSent = true;
    if (chunk !== undefined && chunk !== null) this.chunks.push(String(chunk));
    this.writableEnded = true;
    queueMicrotask(() => this.emit("close"));
  }

  destroy(error) {
    this.destroyError = error;
    this.destroyed = true;
    this.emit("close");
  }

  text() {
    return this.chunks.join("");
  }

  lines() {
    return this.text().split("\n");
  }
}

function searchableListing() {
  return publicSearchListing({
    total: 1,
    page: 1,
    pageSize: 12,
    pageCount: 1,
    hasMore: false,
    appliedFilters: FILTERS,
    facets: { sources: [], categories: [], years: [] },
    updatedAt: new Date(NOW).toISOString(),
    items: [{
      id: "keskkonnaportaal-mets",
      title: "Metsandus — Keskkonnaportaal",
      url: "https://keskkonnaportaal.ee/et/mets",
      organization: "Keskkonnaportaal",
      type: "Teemaleht",
      sourceTier: "official",
      summary: "Metsanduse teemaleht koondab ametlikud metsaandmed.",
    }],
  });
}

function manualIntervals() {
  const started = [];
  const stopped = [];
  return {
    started,
    stopped,
    setInterval(callback, milliseconds) {
      const entry = { callback, milliseconds, unref() {} };
      started.push(entry);
      return entry;
    },
    clearInterval(entry) {
      stopped.push(entry);
    },
  };
}

// The browser half of the stream contract. Every ordering claim below is
// asserted through this parser, so the test fails if the real client would not
// see the ordinary listing first.
async function browserEvents(text) {
  const events = [];
  await readSearchStream(new Response(text, { status: 200 }), (event) => events.push(event));
  return events;
}

function runFlow({
  listing = async () => searchableListing(),
  answer,
  answerStartBy = Number.MAX_SAFE_INTEGER,
  isAborted = () => false,
  heartbeatMs = 10_000,
  intervals = manualIntervals(),
  fallbackAnswer = ({ reason, searchResults }) => searchTimeoutFallback("kui palju puitu juurde kasvab Eestis", {
    assessmentQuery: "kui palju puitu juurde kasvab Eestis",
    ...(searchResults ? { searchResults } : {}),
    filters: FILTERS,
    reason,
    startedAt: NOW,
  }),
  onListingSettled = () => undefined,
} = {}) {
  const response = new FakeResponse();
  const writer = createBoundedNdjsonWriter(response, { idleTimeoutMs: 120_000 });
  const outcome = streamListingThenAnswer({
    stream: writer,
    listing,
    answer,
    fallbackAnswer,
    publicListing: publicSearchListing,
    emptyListing: () => publicSearchListing({ total: 0, page: 1, pageSize: 12, pageCount: 0, hasMore: false, appliedFilters: FILTERS, items: [] }),
    answerStartBy,
    heartbeatMs,
    now: () => NOW,
    setInterval: intervals.setInterval,
    clearInterval: intervals.clearInterval,
    isAborted,
    onListingSettled,
  });
  return { response, writer, outcome, intervals };
}

test("the ordinary listing is published before a delayed answer and stays while the model works", async () => {
  let releaseAnswer;
  const answerGate = new Promise((resolve) => { releaseAnswer = resolve; });
  const intervals = manualIntervals();
  let answerCalls = 0;
  let listingSettled = 0;
  const { response, writer, outcome } = runFlow({
    intervals,
    onListingSettled: () => { listingSettled += 1; },
    answer: async () => {
      answerCalls += 1;
      // Two keepalive ticks are due while the provider is still working. A
      // blank NDJSON line keeps proxies and the socket idle timer alive and is
      // already ignored by the browser parser.
      intervals.started[0].callback();
      intervals.started[0].callback();
      await answerGate;
      return {
        answer: { eyebrow: "AI koondvastus", title: "Koondvastus", intro: "Tekst.", parts: [], introCitations: [] },
        sources: [],
      };
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const early = response.text();
  assert.match(early, /"type":"results"/u, "the listing must reach the browser before the answer");
  assert.doesNotMatch(early, /"type":"answer"/u, "the answer is deliberately still pending");
  assert.ok(early.includes("\n\n"), "a keepalive blank line must be written while the answer is pending");
  assert.equal(listingSettled, 1, "retrieval admission is released once the listing settles");

  releaseAnswer();
  assert.equal(await outcome, "complete");
  await writer.finish();

  const events = await browserEvents(response.text());
  assert.deepEqual(events.map((event) => event.type), ["results", "answer"]);
  assert.equal(events[0].searchResults.items[0].id, "keskkonnaportaal-mets");
  assert.deepEqual(
    events[1].result.searchResults.items.map((item) => item.id),
    events[0].searchResults.items.map((item) => item.id),
    "the answer must carry the same filtered listing the reader already sees",
  );
  assert.equal(answerCalls, 1);
  assert.deepEqual(intervals.stopped, [intervals.started[0]], "the keepalive timer stops on completion");
});

test("a failed answer keeps the completed listing and says the wording is unavailable", async () => {
  const intervals = manualIntervals();
  const { response, writer, outcome } = runFlow({
    intervals,
    answer: async () => {
      throw new Error("provider refused the request");
    },
  });

  assert.equal(await outcome, "answer-fallback");
  await writer.finish();

  const events = await browserEvents(response.text());
  assert.deepEqual(events.map((event) => event.type), ["results", "answer"]);
  assert.equal(events[0].searchResults.items.length, 1);
  assert.equal(events[1].result.answer.aiUnavailable, true);
  assert.equal(events[1].result.searchResults.items[0].id, events[0].searchResults.items[0].id);
  assert.deepEqual(intervals.stopped, [intervals.started[0]]);
});

test("a listing that outlives the answer window still publishes its items without a doomed model call", async () => {
  const intervals = manualIntervals();
  let answerCalls = 0;
  const { response, writer, outcome } = runFlow({
    intervals,
    answerStartBy: NOW - 1,
    answer: async () => {
      answerCalls += 1;
      throw new Error("must not start");
    },
  });

  assert.equal(await outcome, "answer-skipped");
  await writer.finish();

  const events = await browserEvents(response.text());
  assert.deepEqual(events.map((event) => event.type), ["results", "answer"]);
  assert.equal(events[0].searchResults.items[0].id, "keskkonnaportaal-mets");
  assert.equal(events[1].result.answer.aiUnavailable, true);
  assert.equal(answerCalls, 0, "a model call that cannot finish inside the reserve is not started");
});

test("a failed listing is reported as unavailable instead of as an empty result set", async () => {
  const { response, writer, outcome } = runFlow({
    listing: async () => {
      throw new Error("retrieval upstream failed");
    },
    answer: async () => {
      throw new Error("must not start");
    },
  });

  assert.equal(await outcome, "listing-unavailable");
  await writer.finish();

  const events = await browserEvents(response.text());
  assert.deepEqual(events.map((event) => event.type), ["results", "answer"]);
  assert.equal(events[0].listingUnavailable, true, "the browser must be able to tell a failure from zero hits");
  assert.equal(events[0].searchResults.items.length, 0);
  assert.equal(events[1].result.answer.aiUnavailable, true);
});

test("cancellation keeps the published listing and stops both the answer and the keepalive", async () => {
  const intervals = manualIntervals();
  const controller = new AbortController();
  const { response, outcome, writer } = runFlow({
    intervals,
    isAborted: () => controller.signal.aborted,
    answer: async () => {
      controller.abort(new DOMException("The client disconnected", "AbortError"));
      throw controller.signal.reason;
    },
  });

  assert.equal(await outcome, "aborted");
  assert.match(response.text(), /"type":"results"/u);
  assert.doesNotMatch(response.text(), /"type":"answer"/u, "a cancelled answer must not invent a final event");
  assert.deepEqual(intervals.stopped, [intervals.started[0]]);
  assert.equal(intervals.started.length, 1);
  await writer.finish();
});

test("cancellation before the listing writes no misleading empty result", async () => {
  const intervals = manualIntervals();
  const controller = new AbortController();
  const { response, outcome } = runFlow({
    intervals,
    listing: async () => {
      controller.abort(new DOMException("The client disconnected", "AbortError"));
      throw controller.signal.reason;
    },
    isAborted: () => controller.signal.aborted,
    answer: async () => {
      throw new Error("must not start");
    },
  });

  assert.equal(await outcome, "aborted");
  assert.equal(response.text(), "");
  assert.deepEqual(intervals.stopped, [intervals.started[0]]);
});

test("the listing and the answer keep separate clocks inside one bounded transport window", () => {
  assert.equal(configuredSearchBudgetMs("999999"), DEFAULT_SEARCH_DEADLINE_MS, "an operator value cannot escape the ceiling");
  assert.equal(configuredAnswerBudgetMs("999999"), DEFAULT_ANSWER_DEADLINE_MS, "an operator value cannot escape the answer ceiling");
  assert.ok(DEFAULT_ANSWER_DEADLINE_MS > DEFAULT_SEARCH_DEADLINE_MS, "the answer clock is independent of the listing clock");

  // The answer clock starts when the listing is ready, not when the request arrived.
  assert.equal(answerDeadline(50_000) - 50_000, DEFAULT_ANSWER_DEADLINE_MS, "the listing start is the answer clock's zero");
  assert.equal(answerDeadline(50_000, DEFAULT_ANSWER_DEADLINE_MS, "30000"), 80_000, "a smaller operator value still bounds the clock");

  const window = searchTransportWindowMs();
  assert.ok(window.listingWindowMs > 0 && window.listingWindowMs < DEFAULT_SEARCH_DEADLINE_MS,
    "the listing window leaves part of the search clock for the answer phase");
  assert.ok(window.absoluteRequiredMs >= 300_000 - 20_000, "listing, answer and reserve must fit the transport");
  assert.equal(window.absoluteRequiredMs, window.listingWindowMs + window.answerWindowMs + window.reserveMs);
});

test("the public transport ceiling is validated against the coordinated search budget", () => {
  const budget = resolvePublicResponseBudget({});
  assert.ok(
    budget.idleTimeoutMs > JSON_SEARCH_DEADLINE_CEILING_MS,
    "a silent one-shot search must not be cut by the socket idle timer",
  );
  assert.ok(budget.absoluteTimeoutMs >= 300_000, "the transport must cover a 195 s answer after a slow listing");
  assert.ok(budget.idleTimeoutMs >= 100_000);
  const supported = validateSearchTransportBudget({
    absoluteTimeoutMs: budget.absoluteTimeoutMs,
    idleTimeoutMs: budget.idleTimeoutMs,
  });
  assert.equal(supported.ok, true);
  assert.ok(supported.absoluteRequiredMs <= budget.absoluteTimeoutMs);

  const shortAbsolute = validateSearchTransportBudget({ absoluteTimeoutMs: 60_000, idleTimeoutMs: budget.idleTimeoutMs });
  assert.equal(shortAbsolute.ok, false);
  assert.match(shortAbsolute.reason, /absolute/u);
  const shortIdle = validateSearchTransportBudget({ absoluteTimeoutMs: budget.absoluteTimeoutMs, idleTimeoutMs: 60_000 });
  assert.equal(shortIdle.ok, false);
  assert.match(shortIdle.reason, /idle/u);
});

test("the loading copy tells the reader to keep waiting instead of restarting", () => {
  assert.match(searchWaitingMessage({ elapsedMs: 0 }), /Otsin asjakohaseid/u);
  assert.match(searchWaitingMessage({ elapsedMs: 60_000 }), /kauem aega/u);
  assert.match(searchWaitingMessage({ elapsedMs: 0, listingReady: true }), /Tulemused on valmis/u);
  assert.match(searchWaitingMessage({ elapsedMs: 60_000, listingReady: true }), /kauem aega/u);
});

test("blank keepalive lines are transparent to the browser stream parser", async () => {
  const text = [
    '{"type":"results","searchResults":{"items":[{"id":"one"}],"total":1}}',
    "",
    "",
    '{"type":"draft","result":{"answer":{"title":"Vahepealne"}}}',
    "",
    '{"type":"answer","result":{"answer":{"title":"Lõplik"}}}',
    "",
  ].join("\n");
  const events = await browserEvents(text);
  assert.deepEqual(events.map((event) => event.type), ["results", "draft", "answer"]);
});

test("a one-shot JSON route stays open for the answer without going silent", async () => {
  const response = new FakeResponse();
  const intervals = manualIntervals();
  const payload = { answer: { title: "Jätkuvastus", intro: "Tekst." }, searchResults: { items: [{ id: "a" }] } };
  const body = createPaddedJsonWriter(response, {
    intervalMs: 10_000,
    setInterval: intervals.setInterval,
    clearInterval: intervals.clearInterval,
  });
  intervals.started[0].callback();
  intervals.started[0].callback();
  assert.equal(body.send(payload), true);
  // A tick that fires after the body must not append anything.
  intervals.started[0].callback();
  const text = response.text();
  assert.ok(text.startsWith("\n\n"), "padding keeps the socket and every intermediate proxy alive");
  // The browser reads this with Response.json(); JSON parsers ignore the padding.
  assert.deepEqual(await new Response(text).json(), payload);
  assert.deepEqual(intervals.stopped, [intervals.started[0]]);
  assert.equal(response.writableEnded, true);
});

test("padding stops on client disconnect and never writes a body for a gone reader", () => {
  const response = new FakeResponse();
  const intervals = manualIntervals();
  const controller = new AbortController();
  const body = createPaddedJsonWriter(response, {
    intervalMs: 10_000,
    signal: controller.signal,
    setInterval: intervals.setInterval,
    clearInterval: intervals.clearInterval,
  });
  controller.abort(new DOMException("The client disconnected", "AbortError"));
  intervals.started[0].callback();
  assert.equal(response.text(), "");
  assert.equal(body.send({ answer: { title: "hilinenud" } }), false);
  assert.equal(response.text(), "");
  assert.equal(response.writableEnded, false);
  assert.deepEqual(intervals.stopped, [intervals.started[0]]);
});
