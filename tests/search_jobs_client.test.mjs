import assert from "node:assert/strict";
import test from "node:test";

import {
  SEARCH_JOB_CANCEL_PATH,
  SEARCH_JOB_CREATE_PATH,
  SEARCH_JOB_MAX_CONSECUTIVE_FAILURES,
  SEARCH_JOB_POLL_MS,
  SEARCH_JOB_POLL_PATH,
  SEARCH_JOB_REQUEST_TIMEOUT_MS,
  SearchJobError,
  readSearchJob,
} from "../src/search_jobs.js";

const UUID = "5f0f4f3a-1e6b-4f43-9d1b-8d5a3c2b7a10";
const KEY_BYTES = new Uint8Array(32).fill(0x2a);
const JOB_KEY = Buffer.from(KEY_BYTES).toString("base64url");
const START_AT = Date.UTC(2026, 10, 11, 9, 0, 0);
const DEADLINE_AT = new Date(START_AT + 285_000).toISOString();
const REQUEST_PAYLOAD = { q: "mets", filters: { source: "all" }, page: 1, page_size: 12 };

function resultsEvent() {
  return { type: "results", searchResults: { sources: [{ id: "s1", title: "Keskkonnaagentuur" }], total: 1 } };
}

function draftEvent() {
  return { type: "draft", result: { intro: "Esialgne vastus", parts: [{ text: "Metsamaa pindala" }] } };
}

function answerEvent() {
  return { type: "answer", result: { intro: "Lõplik vastus", parts: [{ text: "Metsamaa pindala 2,3 miljonit ha" }] } };
}

function response(status, body) {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const headers = new Map([
    ["content-type", "application/json; charset=utf-8"],
    ["cache-control", "no-store"],
    ["x-app-build", "test-build"],
  ]);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers.get(String(name).toLowerCase()) ?? null },
    text: async () => text,
  };
}

function abortFailure() {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

// A request the fake server never answers, exactly like a stalled edge: only
// an abort ends it, so a client without a per-request deadline hangs here.
function stalledRequest(init) {
  return new Promise((resolve, reject) => {
    const signal = init?.signal;
    if (!signal) return;
    if (signal.aborted) {
      reject(abortFailure());
      return;
    }
    signal.addEventListener("abort", () => reject(abortFailure()), { once: true });
  });
}

// Virtual time: every scheduled delay fires on the next macrotask and moves the
// clock forward by the delay it asked for, so a 126 second wait costs no real
// seconds and the test still sees the cadence the browser would produce.
function virtualClock(startAt = START_AT) {
  let current = startAt;
  const fired = [];
  return {
    now: () => current,
    fired,
    setTimer(callback, milliseconds) {
      const handle = { milliseconds, cancelled: false };
      handle.token = setTimeout(() => {
        if (handle.cancelled) return;
        current += Math.max(0, milliseconds);
        fired.push(milliseconds);
        callback();
      }, 0);
      return handle;
    },
    clearTimer(handle) {
      if (!handle) return;
      handle.cancelled = true;
      clearTimeout(handle.token);
    },
  };
}

function jobReply(call, { state = "running", events = [], deadlineAt = DEADLINE_AT, retryAfterMs, error, status } = {}) {
  const body = { job_id: call.body.job_id, state, deadline_at: deadlineAt, events };
  body.retry_after_ms = Number.isFinite(retryAfterMs) ? retryAfterMs : state === "running" ? SEARCH_JOB_POLL_MS : 0;
  if (error) body.error = error;
  return response(status ?? 200, body);
}

function harness(handler) {
  const clock = virtualClock();
  const calls = [];
  const fetchImpl = (url, init = {}) => {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    const call = { url: String(url), init, body };
    calls.push(call);
    if (init.signal?.aborted) return Promise.reject(abortFailure());
    return Promise.resolve().then(() => handler(call));
  };
  const cryptoImpl = {
    uuidCalls: 0,
    getRandomValuesCalls: 0,
    randomUUID() {
      cryptoImpl.uuidCalls += 1;
      return UUID;
    },
    getRandomValues(target) {
      cryptoImpl.getRandomValuesCalls += 1;
      target.set(KEY_BYTES);
      return target;
    },
  };
  const run = (options = {}) => readSearchJob({
    kind: "search",
    payload: REQUEST_PAYLOAD,
    fetchImpl,
    cryptoImpl,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...options,
  });
  return {
    clock,
    calls,
    cryptoImpl,
    run,
    creates: () => calls.filter((call) => call.url === SEARCH_JOB_CREATE_PATH),
    polls: () => calls.filter((call) => call.url === SEARCH_JOB_POLL_PATH),
    cancels: () => calls.filter((call) => call.url === SEARCH_JOB_CANCEL_PATH),
  };
}

// A broken client would leave the suite waiting forever instead of reporting a
// failure, so every scenario has a real-time ceiling.
function withDeadline(promise, milliseconds = 5_000, label = "search job") {
  let timer = null;
  const ceiling = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${milliseconds} ms`)), milliseconds);
  });
  return Promise.race([promise, ceiling]).finally(() => clearTimeout(timer));
}

test("short polls deliver the listing, the draft and the answer in order", async () => {
  let pollIndex = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running", status: 201 });
    pollIndex += 1;
    if (pollIndex === 1) return jobReply(call, { state: "running", events: [{ seq: 1, event: resultsEvent() }] });
    return jobReply(call, {
      state: "complete",
      events: [{ seq: 2, event: draftEvent() }, { seq: 3, event: answerEvent() }],
    });
  });

  const delivered = [];
  const responses = [];
  const answer = await withDeadline(h.run({
    onEvent: (event) => delivered.push(event),
    onResponse: (response) => responses.push(response),
  }));

  assert.deepEqual(delivered.map((event) => event.type), ["results", "draft", "answer"]);
  assert.equal(answer.type, "answer");
  assert.equal(h.creates().length, 1);
  assert.equal(h.cancels().length, 0);
  assert.deepEqual(h.polls().map((call) => call.body.after), [0, 1]);
  assert.equal(h.polls()[1].body.job_id, UUID);
  assert.equal(h.polls()[1].body.job_key, JOB_KEY);
  assert.equal(h.creates()[0].body.kind, "search");
  assert.equal(h.creates()[0].body.job_key, JOB_KEY);
  assert.deepEqual(h.creates()[0].body.request, REQUEST_PAYLOAD);
  assert.deepEqual(responses.map((response) => response.status), [201, 200, 200]);
  // onResponse hands the caller the raw response, so the build header stays readable.
  assert.equal(responses[0].headers.get("x-app-build"), "test-build");
  assert.equal(responses[2].headers.get("x-app-build"), "test-build");
  assert.equal(responses[0].headers.get("cache-control"), "no-store");
  // One 2 second cadence between the two polls, nothing else was waited on.
  assert.deepEqual(h.clock.fired, [SEARCH_JOB_POLL_MS]);
  assert.equal(h.clock.now() - START_AT, SEARCH_JOB_POLL_MS);
});

test("a follow-up job carries its own kind and payload", async () => {
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    return jobReply(call, { state: "complete", events: [{ seq: 1, event: resultsEvent() }, { seq: 2, event: answerEvent() }] });
  });
  const payload = { root_query: "mets", question: "Kui palju on metsamaad?", filters: { source: "all" } };
  await withDeadline(h.run({ kind: "follow-up", payload }));
  assert.equal(h.creates()[0].body.kind, "follow-up");
  assert.deepEqual(h.creates()[0].body.request, payload);
});

test("a lost create acknowledgement polls the same credentials and never starts a second job", async () => {
  let pollIndex = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) throw new TypeError("Failed to fetch");
    pollIndex += 1;
    if (pollIndex === 1) return response(404, { code: "JOB_NOT_FOUND" });
    if (pollIndex === 2) return jobReply(call, { state: "running", events: [{ seq: 1, event: resultsEvent() }] });
    return jobReply(call, { state: "complete", events: [{ seq: 2, event: answerEvent() }] });
  });

  const delivered = [];
  const answer = await withDeadline(h.run({ onEvent: (event) => delivered.push(event) }));

  assert.equal(answer.type, "answer");
  assert.deepEqual(delivered.map((event) => event.type), ["results", "answer"]);
  assert.equal(h.creates().length, 1);
  assert.equal(h.cryptoImpl.uuidCalls, 1);
  assert.equal(h.polls().length, 3);
  for (const call of h.polls()) {
    assert.equal(call.body.job_id, UUID);
    assert.equal(call.body.job_key, JOB_KEY);
  }
  assert.equal(h.cancels().length, 0);
});

test("a create answered 502 with an HTML body polls the same credentials instead of failing", async () => {
  let pollIndex = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return response(502, "<html><body>502 Bad gateway</body></html>");
    pollIndex += 1;
    if (pollIndex === 1) return jobReply(call, { state: "running", events: [{ seq: 1, event: resultsEvent() }] });
    return jobReply(call, { state: "complete", events: [{ seq: 2, event: answerEvent() }] });
  });

  const delivered = [];
  const answer = await withDeadline(h.run({ onEvent: (event) => delivered.push(event) }));

  assert.equal(answer.type, "answer");
  assert.deepEqual(delivered.map((event) => event.type), ["results", "answer"]);
  assert.equal(h.creates().length, 1);
  assert.equal(h.cryptoImpl.uuidCalls, 1);
  assert.equal(h.polls().length, 2);
  for (const call of h.polls()) {
    assert.equal(call.body.job_id, UUID);
    assert.equal(call.body.job_key, JOB_KEY);
  }
  assert.equal(h.cancels().length, 0);
});

test("an unknown job after a confirmed create fails without starting a replacement", async () => {
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    return response(404, { code: "JOB_NOT_FOUND" });
  });

  await assert.rejects(withDeadline(h.run()), (error) => {
    assert.ok(error instanceof SearchJobError);
    assert.equal(error.code, "job_lost");
    return true;
  });
  assert.equal(h.creates().length, 1);
  assert.equal(h.cryptoImpl.uuidCalls, 1);
  assert.equal(h.polls().length, 1);
  assert.equal(h.cancels().length, 0);
});

test("wrong job id and wrong job key are reported identically", async () => {
  const replies = [
    response(404, { code: "JOB_NOT_FOUND" }),
    response(404, { code: "JOB_NOT_FOUND" }),
  ];
  const codes = [];
  for (const reply of replies) {
    const h = harness((call) => {
      if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
      return reply;
    });
    await assert.rejects(withDeadline(h.run()), (error) => {
      codes.push(`${error.code}|${error.message}`);
      assert.equal(error.status, 404);
      return true;
    });
  }
  assert.equal(codes[0], codes[1]);
});

test("replayed events are delivered once and the sequence never runs backwards", async () => {
  const polls = [
    [{ seq: 1, event: resultsEvent() }],
    [{ seq: 1, event: resultsEvent() }, { seq: 2, event: draftEvent() }],
    [{ seq: 2, event: draftEvent() }, { seq: 3, event: answerEvent() }],
  ];
  let index = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    const events = polls[index] ?? [];
    index += 1;
    return jobReply(call, { state: index === polls.length ? "complete" : "running", events });
  });

  const delivered = [];
  const answer = await withDeadline(h.run({ onEvent: (event) => delivered.push(event) }));

  assert.equal(answer.type, "answer");
  assert.deepEqual(delivered.map((event) => event.type), ["results", "draft", "answer"]);
  assert.deepEqual(h.polls().map((call) => call.body.after), [0, 1, 2]);
});

test("the create response may replay events a poll would repeat later", async () => {
  let pollIndex = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) {
      return jobReply(call, { state: "running", events: [{ seq: 1, event: resultsEvent() }] });
    }
    pollIndex += 1;
    if (pollIndex === 1) return jobReply(call, { state: "running", events: [{ seq: 1, event: resultsEvent() }] });
    return jobReply(call, { state: "complete", events: [{ seq: 2, event: answerEvent() }] });
  });

  const delivered = [];
  await withDeadline(h.run({ onEvent: (event) => delivered.push(event) }));

  assert.deepEqual(delivered.map((event) => event.type), ["results", "answer"]);
  assert.equal(h.polls()[0].body.after, 1);
});

test("out of order events are rejected before anything is shown", async (t) => {
  const cases = [
    { name: "answer before the listing", events: [answerEvent()], message: /vales järjekorras/ },
    { name: "draft before the listing", events: [draftEvent(), resultsEvent()], message: /vales järjekorras/ },
    { name: "a second listing after the listing", events: [resultsEvent(), resultsEvent()], message: /vales järjekorras/ },
    { name: "an unknown event type", events: [{ type: "progress", result: {} }], message: /tundmatu vahetulemuse/ },
  ];

  for (const [index, scenario] of cases.entries()) {
    await t.test(scenario.name, async () => {
      const h = harness((call) => {
        if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
        return jobReply(call, {
          state: "complete",
          events: scenario.events.map((event, position) => ({ seq: position + 1, event })),
        });
      });
      const delivered = [];
      await assert.rejects(withDeadline(h.run({ onEvent: (event) => delivered.push(event) }), 5_000, scenario.name), (error) => {
        assert.equal(error.code, "invalid_response");
        assert.match(error.message, scenario.message);
        return true;
      });
      assert.deepEqual(delivered, [], `nothing is shown for case ${index}`);
      // The job is still generating a result nobody will read, so it is cancelled.
      assert.equal(h.cancels().length, 1);
    });
  }
});

test("a sequence gap is an integrity failure, not a silently shorter answer", async () => {
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    return jobReply(call, {
      state: "complete",
      events: [{ seq: 1, event: resultsEvent() }, { seq: 3, event: answerEvent() }],
    });
  });

  await assert.rejects(withDeadline(h.run()), (error) => {
    assert.equal(error.code, "invalid_response");
    return true;
  });
});

test("a response the client cannot trust cancels the job instead of leaving it generating", async () => {
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    if (call.url === SEARCH_JOB_CANCEL_PATH) {
      return response(200, { job_id: UUID, state: "cancelled", deadline_at: null, retry_after_ms: 0, events: [] });
    }
    // An answer before the listing: the client refuses it and abandons the job.
    return jobReply(call, { state: "running", events: [{ seq: 1, event: answerEvent() }] });
  });

  await assert.rejects(withDeadline(h.run()), { code: "invalid_response" });

  assert.equal(h.creates().length, 1);
  assert.equal(h.polls().length, 1);
  assert.equal(h.cancels().length, 1);
  assert.deepEqual(h.cancels()[0].body, { job_id: UUID, job_key: JOB_KEY });
  assert.equal(h.cancels()[0].init.keepalive, true);
});

test("aborting while the create is in flight cancels the same credentials and starts no second job", async () => {
  let noteCreate;
  const createArrived = new Promise((resolve) => { noteCreate = resolve; });
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) {
      noteCreate();
      return stalledRequest(call.init);
    }
    return response(200, { job_id: UUID, state: "cancelled", deadline_at: null, retry_after_ms: 0, events: [] });
  });

  const controller = new AbortController();
  const promise = h.run({ signal: controller.signal });
  await createArrived;
  controller.abort();

  await assert.rejects(withDeadline(promise), { name: "AbortError" });

  assert.equal(h.creates().length, 1);
  assert.equal(h.cryptoImpl.uuidCalls, 1);
  assert.equal(h.polls().length, 0);
  assert.equal(h.cancels().length, 1);
  const cancel = h.cancels()[0];
  assert.deepEqual(cancel.body, { job_id: UUID, job_key: JOB_KEY });
  assert.equal(cancel.init.method, "POST");
  assert.equal(cancel.init.keepalive, true);
  assert.equal(cancel.init.signal.aborted, false);
});

test("aborting after the create cancels the running job with one keepalive request", async () => {
  let notePoll;
  const pollArrived = new Promise((resolve) => { notePoll = resolve; });
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    if (call.url === SEARCH_JOB_POLL_PATH) {
      notePoll();
      return stalledRequest(call.init);
    }
    return response(200, { job_id: UUID, state: "cancelled", deadline_at: DEADLINE_AT, retry_after_ms: 0, events: [] });
  });

  const controller = new AbortController();
  const promise = h.run({ signal: controller.signal });
  await pollArrived;
  controller.abort();

  await assert.rejects(withDeadline(promise), { name: "AbortError" });

  assert.equal(h.polls().length, 1);
  assert.equal(h.cancels().length, 1);
  assert.deepEqual(h.cancels()[0].body, { job_id: UUID, job_key: JOB_KEY });
  assert.equal(h.cancels()[0].init.keepalive, true);
  assert.equal(h.creates().length, 1);
});

test("an already aborted signal never creates a job", async () => {
  const h = harness(() => jobReply({ body: { job_id: UUID } }, { state: "running" }));
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(withDeadline(h.run({ signal: controller.signal })), { name: "AbortError" });
  assert.equal(h.calls.length, 0);
});

test("leaving the page cancels the job through a keepalive request", async () => {
  const pagehideTarget = new EventTarget();
  let notePoll;
  const pollArrived = new Promise((resolve) => { notePoll = resolve; });
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    if (call.url === SEARCH_JOB_POLL_PATH) {
      notePoll();
      return stalledRequest(call.init);
    }
    return response(200, { job_id: UUID, state: "cancelled", deadline_at: DEADLINE_AT, retry_after_ms: 0, events: [] });
  });

  const promise = h.run({ pagehideTarget });
  await pollArrived;
  pagehideTarget.dispatchEvent(new Event("pagehide"));

  await assert.rejects(withDeadline(promise), { name: "AbortError" });
  assert.equal(h.cancels().length, 1);
  assert.equal(h.cancels()[0].init.keepalive, true);
});

test("a poll that exceeds its own request timeout is retried with the same credentials", async () => {
  let pollIndex = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    pollIndex += 1;
    if (pollIndex === 1) return stalledRequest(call.init);
    return jobReply(call, {
      state: "complete",
      events: [{ seq: 1, event: resultsEvent() }, { seq: 2, event: answerEvent() }],
    });
  });

  const delivered = [];
  const answer = await withDeadline(h.run({ onEvent: (event) => delivered.push(event) }), 10_000);

  assert.equal(answer.type, "answer");
  assert.deepEqual(delivered.map((event) => event.type), ["results", "answer"]);
  assert.equal(h.polls().length, 2);
  assert.equal(h.creates().length, 1);
  assert.equal(h.cancels().length, 0);
  assert.deepEqual(h.polls()[1].body, h.polls()[0].body);
  assert.ok(h.clock.now() - START_AT >= SEARCH_JOB_REQUEST_TIMEOUT_MS);
});

test("a create that times out is followed by polls of the same credentials, never a second create", async () => {
  let pollIndex = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return stalledRequest(call.init);
    pollIndex += 1;
    if (pollIndex === 1) return response(404, { code: "JOB_NOT_FOUND" });
    return jobReply(call, {
      state: "complete",
      events: [{ seq: 1, event: resultsEvent() }, { seq: 2, event: answerEvent() }],
    });
  });

  await assert.doesNotReject(withDeadline(h.run()));
  assert.equal(h.creates().length, 1);
  assert.equal(h.cryptoImpl.uuidCalls, 1);
  assert.ok(h.clock.now() - START_AT >= SEARCH_JOB_REQUEST_TIMEOUT_MS);
});

test("a poll retried after a server error keeps the previously delivered listing", async () => {
  let pollIndex = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    pollIndex += 1;
    if (pollIndex === 1) return jobReply(call, { state: "running", events: [{ seq: 1, event: resultsEvent() }] });
    if (pollIndex === 2) return response(503, { code: "JOB_CLOSED" });
    return jobReply(call, { state: "complete", events: [{ seq: 2, event: answerEvent() }] });
  });

  const delivered = [];
  await withDeadline(h.run({ onEvent: (event) => delivered.push(event) }), 10_000);

  assert.deepEqual(delivered.map((event) => event.type), ["results", "answer"]);
  assert.equal(h.polls().length, 3);
  assert.equal(h.polls()[2].body.after, 1);
});

test("a poll answered 504 with an HTML body is retried and keeps the listing", async () => {
  let pollIndex = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    pollIndex += 1;
    if (pollIndex === 1) return jobReply(call, { state: "running", events: [{ seq: 1, event: resultsEvent() }] });
    if (pollIndex === 2) return response(504, "<html><body>504 Gateway timeout</body></html>");
    return jobReply(call, { state: "complete", events: [{ seq: 2, event: answerEvent() }] });
  });

  const delivered = [];
  await withDeadline(h.run({ onEvent: (event) => delivered.push(event) }));

  assert.deepEqual(delivered.map((event) => event.type), ["results", "answer"]);
  assert.equal(h.polls().length, 3);
  assert.equal(h.polls()[2].body.after, 1);
  assert.equal(h.creates().length, 1);
  assert.equal(h.cancels().length, 0);
});

test("waiting past the 125 second stream limit keeps one job and finishes the answer", async () => {
  const totalPolls = 70;
  let pollIndex = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    pollIndex += 1;
    if (pollIndex === 1) return jobReply(call, { state: "running", events: [{ seq: 1, event: resultsEvent() }] });
    if (pollIndex < totalPolls) return jobReply(call, { state: "running" });
    return jobReply(call, { state: "complete", events: [{ seq: 2, event: answerEvent() }] });
  });

  const delivered = [];
  const answer = await withDeadline(h.run({ onEvent: (event) => delivered.push(event) }), 30_000);

  const elapsed = h.clock.now() - START_AT;
  assert.ok(elapsed >= 125_000, `simulated wait was ${elapsed} ms`);
  assert.equal(h.creates().length, 1);
  assert.equal(h.cryptoImpl.uuidCalls, 1);
  assert.equal(h.polls().length, totalPolls);
  assert.equal(answer.type, "answer");
  assert.deepEqual(delivered.map((event) => event.type), ["results", "answer"]);
  assert.equal(h.cancels().length, 0);
});

test("a dead connection stops after a few failed requests instead of polling for minutes", async () => {
  const h = harness(() => {
    throw new TypeError("Failed to fetch");
  });

  await assert.rejects(withDeadline(h.run(), 10_000), (error) => {
    assert.equal(error.code, "transport");
    return true;
  });

  assert.equal(h.creates().length, 1);
  assert.equal(h.cryptoImpl.uuidCalls, 1);
  assert.equal(h.polls().length, SEARCH_JOB_MAX_CONSECUTIVE_FAILURES - 1);
  // A job nobody can read any more is aborted, not left to burn its budget.
  assert.equal(h.cancels().length, 1);
  assert.deepEqual(h.cancels()[0].body, { job_id: UUID, job_key: JOB_KEY });
  assert.ok(h.clock.now() - START_AT < 60_000, "gives up in seconds, not minutes");
});

test("a create answered 503 with an HTML body polls the same credentials instead of giving up", async () => {
  let pollIndex = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return response(503, "<html><body>503 Service Unavailable</body></html>");
    if (call.url === SEARCH_JOB_CANCEL_PATH) {
      return response(200, { job_id: UUID, state: "cancelled", deadline_at: null, retry_after_ms: 0, events: [] });
    }
    pollIndex += 1;
    if (pollIndex === 1) return jobReply(call, { state: "running", events: [{ seq: 1, event: resultsEvent() }] });
    return jobReply(call, { state: "complete", events: [{ seq: 2, event: answerEvent() }] });
  });

  const delivered = [];
  const answer = await withDeadline(h.run({ onEvent: (event) => delivered.push(event) }));

  assert.equal(answer.type, "answer");
  assert.deepEqual(delivered.map((event) => event.type), ["results", "answer"]);
  assert.equal(h.creates().length, 1);
  assert.equal(h.cryptoImpl.uuidCalls, 1);
  assert.equal(h.polls().length, 2);
  assert.equal(h.cancels().length, 0);
});

test("a create answered 503 JOB_CLOSED is a refusal, not a hidden job", async () => {
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return response(503, { code: "JOB_CLOSED" });
    return response(200, { job_id: UUID, state: "cancelled", deadline_at: null, retry_after_ms: 0, events: [] });
  });

  await assert.rejects(withDeadline(h.run()), (error) => {
    assert.equal(error.code, "job_closed");
    assert.equal(error.status, 503);
    return true;
  });

  assert.equal(h.creates().length, 1);
  assert.equal(h.polls().length, 0);
  assert.equal(h.cancels().length, 0);
});

test("a 503 streak with no trustworthy store answer still cancels at the end", async () => {
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    if (call.url === SEARCH_JOB_CANCEL_PATH) {
      return response(200, { job_id: UUID, state: "cancelled", deadline_at: null, retry_after_ms: 0, events: [] });
    }
    return response(503, "<html><body>503 Service Unavailable</body></html>");
  });

  await assert.rejects(withDeadline(h.run(), 20_000), (error) => {
    assert.equal(error.code, "transport");
    assert.equal(error.status, 503);
    return true;
  });

  assert.equal(h.polls().length, SEARCH_JOB_MAX_CONSECUTIVE_FAILURES);
  // A proxy page proves nothing about the job, so it may still be generating.
  assert.equal(h.cancels().length, 1);
  assert.deepEqual(h.cancels()[0].body, { job_id: UUID, job_key: JOB_KEY });
});

test("five consecutive 503 polls end the read instead of retrying forever", async () => {
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) {
      return jobReply(call, { state: "running", events: [{ seq: 1, event: resultsEvent() }] });
    }
    if (call.url === SEARCH_JOB_CANCEL_PATH) {
      return response(200, { job_id: UUID, state: "cancelled", deadline_at: null, retry_after_ms: 0, events: [] });
    }
    return response(503, { code: "JOB_CLOSED" });
  });

  const delivered = [];
  await assert.rejects(withDeadline(h.run({ onEvent: (event) => delivered.push(event) }), 20_000), (error) => {
    assert.equal(error.code, "job_closed");
    assert.equal(error.status, 503);
    assert.equal(error.listingReady, true);
    return true;
  });

  assert.equal(h.creates().length, 1);
  assert.equal(h.polls().length, SEARCH_JOB_MAX_CONSECUTIVE_FAILURES);
  assert.deepEqual(delivered.map((event) => event.type), ["results"]);
  // Nothing live is left behind a closed store, so a cancel would only cost a slot.
  assert.equal(h.cancels().length, 0);
});

test("a failed job keeps the delivered listing and reports the server failure", async () => {
  let pollIndex = 0;
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    pollIndex += 1;
    if (pollIndex === 1) return jobReply(call, { state: "running", events: [{ seq: 1, event: resultsEvent() }] });
    return jobReply(call, { state: "failed", error: "Koondvastuse koostamine ebaõnnestus." });
  });

  const delivered = [];
  await assert.rejects(withDeadline(h.run({ onEvent: (event) => delivered.push(event) })), (error) => {
    assert.equal(error.code, "job_failed");
    assert.match(error.message, /Koondvastuse koostamine ebaõnnestus/);
    return true;
  });
  assert.deepEqual(delivered.map((event) => event.type), ["results"]);
  assert.equal(h.cancels().length, 0);
});

test("a cancelled job stops the wait with a cancellation message", async () => {
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    return jobReply(call, { state: "cancelled" });
  });

  await assert.rejects(withDeadline(h.run()), (error) => {
    assert.equal(error.code, "job_cancelled");
    return true;
  });
});

test("a complete job without an answer is reported, not presented as a finished answer", async () => {
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
    return jobReply(call, { state: "complete", events: [{ seq: 1, event: resultsEvent() }] });
  });

  await assert.rejects(withDeadline(h.run()), (error) => {
    assert.equal(error.code, "answer_missing");
    assert.match(error.message, /Tulemused/);
    return true;
  });
});

test("capacity and invalid responses surface as their own codes", async (t) => {
  await t.test("create capacity", async () => {
    const h = harness(() => response(429, { code: "JOB_CAPACITY", retry_after_ms: 2_000 }));
    await assert.rejects(withDeadline(h.run()), (error) => {
      assert.equal(error.code, "job_capacity");
      return true;
    });
    assert.equal(h.creates().length, 1);
    assert.equal(h.polls().length, 0);
  });

  await t.test("create invalid", async () => {
    const h = harness(() => response(400, { code: "JOB_INVALID" }));
    await assert.rejects(withDeadline(h.run()), (error) => {
      assert.equal(error.code, "invalid_response");
      return true;
    });
  });

  await t.test("poll body that is not a job", async () => {
    const h = harness((call) => {
      if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
      return response(200, { state: "running" });
    });
    await assert.rejects(withDeadline(h.run()), (error) => {
      assert.equal(error.code, "invalid_response");
      return true;
    });
  });

  await t.test("poll body for another job id", async () => {
    const h = harness((call) => {
      if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
      return response(200, { job_id: "another-job", state: "running", events: [] });
    });
    await assert.rejects(withDeadline(h.run()), (error) => {
      assert.equal(error.code, "invalid_response");
      return true;
    });
  });
});

test("the transport refuses to start without a usable kind, payload or secret source", async () => {
  let calls = 0;
  const fetchImpl = () => {
    calls += 1;
    return Promise.resolve(response(200, {}));
  };

  await assert.rejects(readSearchJob({ kind: "chat", payload: REQUEST_PAYLOAD, fetchImpl }), { code: "invalid_request" });
  await assert.rejects(readSearchJob({ kind: "search", payload: null, fetchImpl }), { code: "invalid_request" });
  await assert.rejects(readSearchJob({ kind: "search", payload: [], fetchImpl }), { code: "invalid_request" });
  await assert.rejects(readSearchJob({ kind: "search", payload: REQUEST_PAYLOAD, fetchImpl, cryptoImpl: {} }), {
    code: "invalid_request",
  });
  assert.equal(calls, 0);
});

test("credentials stay out of URLs, caches and logs", async () => {
  const logged = [];
  const originalConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const capture = (...args) => logged.push(args.map((value) => String(value)).join(" "));
  console.log = capture;
  console.warn = capture;
  console.error = capture;
  console.info = capture;

  try {
    const h = harness((call) => {
      if (call.url === SEARCH_JOB_CREATE_PATH) return jobReply(call, { state: "running" });
      return jobReply(call, { state: "complete", events: [{ seq: 1, event: resultsEvent() }, { seq: 2, event: answerEvent() }] });
    });
    await withDeadline(h.run());

    const allowed = new Set([SEARCH_JOB_CREATE_PATH, SEARCH_JOB_POLL_PATH, SEARCH_JOB_CANCEL_PATH]);
    for (const call of h.calls) {
      assert.ok(allowed.has(call.url), `unexpected URL ${call.url}`);
      assert.equal(call.init.method, "POST");
      assert.equal(call.init.cache, "no-store");
      assert.equal(call.init.credentials, "same-origin");
      assert.equal(call.init.headers["content-type"], "application/json");
      assert.equal(call.init.keepalive, false);
    }
    const urls = JSON.stringify(h.calls.map((call) => call.url));
    assert.ok(!urls.includes(JOB_KEY), "job key must never reach a URL");
    assert.ok(!urls.includes(UUID), "job id must never reach a URL");
    assert.ok(!JSON.stringify(logged).includes(JOB_KEY), "job key must never reach a log");
  } finally {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
  }
});

test("a server that never finishes stops at the hard deadline instead of polling forever", async () => {
  const h = harness((call) => {
    if (call.url === SEARCH_JOB_CREATE_PATH) {
      return jobReply(call, { state: "running", deadlineAt: new Date(START_AT + 10_000).toISOString() });
    }
    return jobReply(call, { state: "running", deadlineAt: new Date(START_AT + 10_000).toISOString() });
  });

  await assert.rejects(withDeadline(h.run(), 10_000), (error) => {
    assert.equal(error.code, "job_expired");
    return true;
  });
  assert.ok(h.polls().length >= 4);
  assert.equal(h.creates().length, 1);
  assert.equal(h.cancels().length, 0);
});
