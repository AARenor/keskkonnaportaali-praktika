import assert from "node:assert/strict";
import test from "node:test";
import { createSearchJobStore } from "../server/search_jobs.mjs";

// A hand-driven clock keeps every bound in the store deterministic: no test
// waits 285 seconds, and no test can pass because a real timer fired early.
function createFakeClock(start = 1_760_000_000_000) {
  let current = start;
  let nextHandle = 1;
  const timers = new Map();

  const schedule = (callback, milliseconds, interval) => {
    const id = nextHandle;
    nextHandle += 1;
    const handle = {
      id,
      unref() {
        return handle;
      },
      ref() {
        return handle;
      },
      hasRef() {
        return true;
      },
      [Symbol.toPrimitive]() {
        return id;
      },
    };
    timers.set(id, {
      handle,
      callback,
      interval,
      time: current + Math.max(0, Math.trunc(Number(milliseconds) || 0)),
    });
    return handle;
  };

  const clear = (handle) => {
    if (!handle || typeof handle !== "object") return;
    timers.delete(handle.id);
  };

  return {
    now: () => current,
    setTimer: (callback, milliseconds) => schedule(callback, milliseconds, null),
    clearTimer: clear,
    setInterval: (callback, milliseconds) => schedule(
      callback,
      milliseconds,
      Math.max(1, Math.trunc(Number(milliseconds) || 1)),
    ),
    clearInterval: clear,
    pendingTimers: () => timers.size,
    advance(milliseconds) {
      const target = current + Math.max(0, Math.trunc(Number(milliseconds) || 0));
      for (let steps = 0; ; steps += 1) {
        if (steps > 100_000) throw new Error("the fake clock ran away");
        let next = null;
        for (const entry of timers.values()) {
          if (entry.time > target) continue;
          if (!next || entry.time < next.time) next = entry;
        }
        if (!next) break;
        current = Math.max(current, next.time);
        if (next.interval === null) timers.delete(next.handle.id);
        else next.time = current + next.interval;
        next.callback();
      }
      current = target;
    },
  };
}

function createHarness(options = {}) {
  const clock = createFakeClock();
  const store = createSearchJobStore({
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...options,
  });
  return { clock, store };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

// Let the scheduled runner start and any already-resolved promise settle.
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

// A job whose runner ignores its abort never settles, so shutdown can only be
// observed by letting the bounded grace timer fire on the fake clock.
async function closeStore(store, clock) {
  const closing = store.close();
  clock.advance(5_000);
  await closing;
}

const ID = "11111111-2222-3333-4444-555555555555";
const KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OTHER_KEY = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

function job(overrides = {}) {
  return {
    id: ID,
    key: KEY,
    kind: "search",
    payload: { query: "mets", page: 1, page_size: 12 },
    clientKey: "10.0.0.1",
    run: async () => undefined,
    ...overrides,
  };
}

test("a created job runs once and publishes the listing before the answer", async () => {
  const { store } = createHarness();
  const calls = [];
  const run = async ({ signal, emit }) => {
    calls.push(signal);
    emit("results", { searchResults: { total: 1, items: ["link"] } });
    emit("answer", { result: { answer: "Vastus" } });
  };

  const created = store.start(job({ run }));
  assert.equal(created.status, 201);
  assert.equal(created.body.job_id, ID);
  assert.equal(created.body.state, "running");
  assert.equal(created.body.retry_after_ms, 2000);
  assert.deepEqual(created.body.events, []);
  assert.equal(created.body.deadline_at, new Date(1_760_000_000_000 + 285_000).toISOString());

  await flush();
  assert.equal(calls.length, 1);

  const polled = store.poll({ id: ID, key: KEY, after: 0 });
  assert.equal(polled.status, 200);
  assert.equal(polled.body.state, "complete");
  assert.equal(polled.body.retry_after_ms, 0);
  assert.deepEqual(polled.body.events.map((entry) => entry.seq), [1, 2]);
  assert.deepEqual(polled.body.events[0].event, { searchResults: { total: 1, items: ["link"] }, type: "results" });
  assert.deepEqual(polled.body.events[1].event, { result: { answer: "Vastus" }, type: "answer" });
  // Repeated reads are stable and never start more work.
  assert.deepEqual(store.poll({ id: ID, key: KEY, after: 0 }).body, polled.body);
  assert.equal(calls.length, 1);
  await store.close();
});

test("the job key owns access and a wrong key is indistinguishable from an unknown job", async () => {
  const { store } = createHarness();
  const gate = deferred();
  const start = store.start(job({ run: ({ signal }) => new Promise((resolve) => {
    signal.addEventListener("abort", resolve);
    gate.resolve = resolve;
  }) }));
  assert.equal(start.status, 201);
  await flush();

  const unknown = store.poll({ id: "99999999-2222-3333-4444-555555555555", key: KEY, after: 0 });
  const wrongKey = store.poll({ id: ID, key: OTHER_KEY, after: 0 });
  assert.equal(unknown.status, 404);
  assert.equal(wrongKey.status, 404);
  assert.deepEqual(wrongKey.body, unknown.body);
  assert.equal(JSON.stringify(wrongKey.body), JSON.stringify(unknown.body));
  // A key that shares the whole prefix must be refused exactly like any other.
  const nearKey = `${KEY.slice(0, -1)}B`;
  assert.equal(store.poll({ id: ID, key: nearKey, after: 0 }).status, 404);
  assert.equal(store.poll({ id: ID, key: KEY.slice(0, 10), after: 0 }).status, 400);

  const wrongCancel = store.cancel({ id: ID, key: OTHER_KEY, clientKey: "10.0.9.9" });
  assert.equal(wrongCancel.status, 404);
  assert.deepEqual(wrongCancel.body, unknown.body);
  assert.equal(store.poll({ id: ID, key: KEY, after: 0 }).body.state, "running");
  assert.equal(store.stats().running, 1);

  // The store still answers its owner, so the wrong key changed nothing.
  const owned = store.cancel({ id: ID, key: KEY, clientKey: "10.0.0.1" });
  assert.equal(owned.status, 200);
  assert.equal(owned.body.state, "cancelled");
  await flush();
  await store.close();
});

test("a cancel in the same tick stops the runner before it ever starts", async () => {
  const { store } = createHarness();
  let runs = 0;
  assert.equal(store.start(job({
    run: async () => {
      runs += 1;
    },
  })).status, 201);
  assert.equal(store.cancel({ id: ID, key: KEY, clientKey: "10.0.0.1" }).body.state, "cancelled");
  await flush();
  assert.equal(runs, 0);
  assert.equal(store.stats().charged, 0);
  assert.equal(store.stats().pendingRuns, 0);
  await store.close();
});

test("the total byte budget fails a job before it can exhaust the process", async () => {
  const { clock, store } = createHarness({ totalBytes: 3_000, jobBytes: 100_000 });
  const payload = { searchResults: { total: 1, items: ["x".repeat(1_400)] } };
  let secondEmit;
  assert.equal(store.start(job({
    id: "bytes-job-0001",
    clientKey: "10.0.2.1",
    run: async ({ emit }) => {
      emit("results", payload);
      return new Promise(() => undefined);
    },
  })).status, 201);
  assert.equal(store.start(job({
    id: "bytes-job-0002",
    clientKey: "10.0.2.2",
    run: async ({ emit }) => {
      secondEmit = emit;
      return new Promise(() => undefined);
    },
  })).status, 201);
  await flush();
  assert.equal(store.poll({ id: "bytes-job-0001", key: KEY, after: 0 }).body.events.length, 1);

  assert.throws(() => secondEmit("results", payload), { code: "JOB_BYTES" });
  const failed = store.poll({ id: "bytes-job-0002", key: KEY, after: 0 }).body;
  assert.equal(failed.state, "failed");
  assert.deepEqual(failed.events, []);
  // The first job keeps exactly what it already published.
  const kept = store.poll({ id: "bytes-job-0001", key: KEY, after: 0 }).body;
  assert.equal(kept.events.length, 1);
  assert.ok(store.stats().totalBytes <= 3_000);
  await closeStore(store, clock);
});

test("the record budget refuses a new job while nothing can be evicted", async () => {
  const { clock, store } = createHarness({ records: 2 });
  const gate = deferred();
  const run = () => gate.promise;
  assert.equal(store.start(job({ id: "rec-job-0001", clientKey: "10.0.3.1", run })).status, 201);
  assert.equal(store.start(job({ id: "rec-job-0002", clientKey: "10.0.3.2", run })).status, 201);
  // Both records still hold accounting, so a third record is refused instead of
  // dropping a job mid-flight.
  assert.equal(store.start(job({ id: "rec-job-0003", clientKey: "10.0.3.3", run })).status, 429);

  gate.resolve();
  await flush();
  assert.equal(store.stats().records, 2);
  // Settling does not shorten a dedupe promise: both records still answer a
  // retried create for ten minutes, so admission is refused rather than paying
  // for the new job with somebody else's idempotency record.
  assert.equal(store.start(job({ id: "rec-job-0003", clientKey: "10.0.3.3", run })).status, 429);

  // Only expiry makes a record reclaimable, and then the store serves again.
  clock.advance(600_000);
  assert.equal(store.stats().records, 0);
  assert.equal(store.start(job({ id: "rec-job-0003", clientKey: "10.0.3.3", run })).status, 201);
  assert.equal(store.stats().records, 1);
  await store.close();
});

test("record pressure never evicts an unexpired idempotency record", async () => {
  const { store } = createHarness({ records: 2 });
  let runs = 0;
  const run = async ({ emit }) => {
    runs += 1;
    emit("results", { searchResults: { total: 0, items: [] } });
  };
  assert.equal(store.start(job({ id: "dedupe-job-001", clientKey: "10.0.4.1", run })).status, 201);
  await flush();
  assert.equal(runs, 1);

  // The first unknown-id cancel fits next to the completed job.
  assert.equal(store.cancel({ id: "absent-job-001", key: OTHER_KEY, clientKey: "10.0.4.7" }).status, 200);
  assert.equal(store.stats().records, 2);

  // The next one would need a slot that only the completed job's 10 minute
  // dedupe record or the first tombstone could free. Neither is evicted, and
  // the cancel says so instead of promising protection it cannot keep.
  const refusedCancel = store.cancel({ id: "absent-job-002", key: OTHER_KEY, clientKey: "10.0.4.8" });
  assert.equal(refusedCancel.status, 429);
  assert.equal(refusedCancel.body.code, "JOB_CAPACITY");
  // New admission is refused for the same reason, never paid for by evicting a
  // record whose dedupe promise is still running.
  assert.equal(store.start(job({ id: "other-job-0001", clientKey: "10.0.4.2", run })).status, 429);

  // The retried create still replays the same job instead of generating twice.
  const replay = store.start(job({ id: "dedupe-job-001", clientKey: "10.0.4.1", run }));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.state, "complete");
  await flush();
  assert.equal(runs, 1);
  await store.close();
});

test("a cancel of an unknown id is not acknowledged when no tombstone can be kept", async () => {
  const { store } = createHarness({ records: 1 });
  const gate = deferred();
  assert.equal(store.start(job({ id: "only-job-0001", clientKey: "10.0.5.1", run: () => gate.promise })).status, 201);
  await flush();

  // One record slot cannot hold a cancellation reservation and still leave room
  // for a real job, so the cancellation cannot be recorded. Saying 200 would
  // promise a protection the store cannot keep.
  const unrecorded = store.cancel({ id: "absent-job-001", key: OTHER_KEY, clientKey: "10.0.5.7" });
  assert.equal(unrecorded.status, 429);
  assert.equal(unrecorded.body.code, "JOB_CAPACITY");
  assert.equal(store.poll({ id: "absent-job-001", key: OTHER_KEY, after: 0 }).status, 404);

  gate.resolve();
  await flush();
  await store.close();
});

test("close clears the stored answer even when the runner keeps its emit closure", async () => {
  const { clock, store } = createHarness();
  const wedged = deferred();
  let captured;
  const run = ({ emit }) => {
    captured = emit;
    emit("answer", { result: { answer: "x".repeat(50_000) } });
    return wedged.promise;
  };
  assert.equal(store.start(job({ run })).status, 201);
  await flush();
  assert.ok(store.stats().eventBytes > 40_000);

  const closing = store.close();
  clock.advance(5_000);
  await closing;
  // The runner is still alive and still holds its emit closure, but the answer
  // text it published must not outlive the job it belonged to.
  assert.equal(store.stats().events, 0);
  assert.equal(store.stats().eventBytes, 0);
  captured("answer", { result: { answer: "late" } });
  assert.equal(store.stats().eventBytes, 0);

  wedged.resolve();
  await flush();
  await store.close();
});

test("unknown-id cancellations are bounded by their own reservation pool", async () => {
  const { clock, store } = createHarness({ unknownCancelReservations: 3 });
  // The reservation pool is keyed by a server-derived identity, so a cancel that
  // arrives without one cannot be attributed or bounded.
  assert.equal(store.cancel({ id: "absent-job-006", key: OTHER_KEY }).status, 400);

  assert.equal(store.cancel({ id: "absent-job-001", key: OTHER_KEY, clientKey: "10.1.0.1" }).status, 200);
  assert.equal(store.cancel({ id: "absent-job-002", key: OTHER_KEY, clientKey: "10.1.0.2" }).status, 200);
  assert.equal(store.cancel({ id: "absent-job-003", key: OTHER_KEY, clientKey: "10.1.0.3" }).status, 200);
  const refused = store.cancel({ id: "absent-job-004", key: OTHER_KEY, clientKey: "10.1.0.4" });
  assert.equal(refused.status, 429);
  assert.equal(refused.body.code, "JOB_CAPACITY");
  // A refusal claims nothing, so the id stays free for its real creator.
  assert.equal(store.poll({ id: "absent-job-004", key: OTHER_KEY, after: 0 }).status, 404);

  // A spent reservation pool never blocks a real read.
  assert.equal(store.start(job({ id: "real-job-0001", clientKey: "10.1.0.9", run: async () => undefined })).status, 201);
  await flush();

  // The pool is a lifetime, not a counter: expiry returns the reservation.
  clock.advance(600_000);
  assert.equal(store.cancel({ id: "absent-job-005", key: OTHER_KEY, clientKey: "10.1.0.5" }).status, 200);
  await store.close();
});

test("one client cannot spend more than its share of unknown-id cancellations", async () => {
  const { store } = createHarness();
  assert.equal(store.cancel({ id: "absent-job-011", key: OTHER_KEY, clientKey: "10.1.1.1" }).status, 200);
  assert.equal(store.cancel({ id: "absent-job-012", key: OTHER_KEY, clientKey: "10.1.1.1" }).status, 200);
  const third = store.cancel({ id: "absent-job-013", key: OTHER_KEY, clientKey: "10.1.1.1" });
  assert.equal(third.status, 429);
  assert.equal(third.body.code, "JOB_CAPACITY");
  // Another client still has its own share of the same pool.
  assert.equal(store.cancel({ id: "absent-job-014", key: OTHER_KEY, clientKey: "10.1.1.2" }).status, 200);
  await store.close();
});

test("unknown-id cancels cannot fill the record budget and block real work", async () => {
  const { store } = createHarness({ records: 4, unknownCancelReservations: 2 });
  assert.equal(store.cancel({ id: "absent-job-021", key: OTHER_KEY, clientKey: "10.1.2.1" }).status, 200);
  assert.equal(store.cancel({ id: "absent-job-022", key: OTHER_KEY, clientKey: "10.1.2.2" }).status, 200);
  // The pool refuses before the record budget is touched, so the remaining
  // record slots stay available for real reads.
  assert.equal(store.cancel({ id: "absent-job-023", key: OTHER_KEY, clientKey: "10.1.2.3" }).status, 429);
  assert.equal(store.start(job({ id: "real-job-0021", clientKey: "10.1.2.9", run: async () => undefined })).status, 201);
  await flush();
  assert.equal(store.start(job({ id: "real-job-0022", clientKey: "10.1.2.8", run: async () => undefined })).status, 201);
  await flush();
  assert.equal(store.stats().records, 4);
  await store.close();
});

test("an unknown-id cancel never takes the last record slot a real read needs", async () => {
  const { store } = createHarness({ records: 1 });
  // One record slot cannot hold a reservation and still leave room for a real
  // job, so the allowance is zero and the cancellation is refused rather than
  // blocking every create the deployment could otherwise serve.
  const refused = store.cancel({ id: "absent-job-031", key: OTHER_KEY, clientKey: "10.2.0.1" });
  assert.equal(refused.status, 429);
  assert.equal(refused.body.code, "JOB_CAPACITY");
  assert.equal(store.start(job({
    id: "real-job-0031",
    clientKey: "10.2.0.9",
    run: async () => undefined,
  })).status, 201);
  await flush();
  await store.close();
});

test("unknown-id cancels cannot spend the last bytes a real read needs", async () => {
  const { store } = createHarness({ totalBytes: 2_048 });
  let accepted = 0;
  for (let index = 0; index < 4; index += 1) {
    const cancelled = store.cancel({
      id: `absent-job-04${index}-x`,
      key: OTHER_KEY,
      clientKey: `10.2.1.${index}`,
    });
    if (cancelled.status === 200) {
      accepted += 1;
      continue;
    }
    assert.equal(cancelled.status, 429);
    assert.equal(cancelled.body.code, "JOB_CAPACITY");
  }
  // Four reservations would exactly fill the smallest accepted byte budget and
  // leave nothing for a job record, so only three may fit.
  assert.equal(accepted, 3);
  assert.equal(store.start(job({
    id: "real-job-0041",
    clientKey: "10.2.1.9",
    run: async () => undefined,
  })).status, 201);
  await flush();
  await store.close();
});

test("a cancel of an absent id cannot preclaim it with the wrong secret", async () => {
  const { store } = createHarness();
  let runs = 0;
  const run = async () => {
    runs += 1;
  };
  assert.equal(store.cancel({ id: ID, key: OTHER_KEY, clientKey: "10.0.9.9" }).status, 200);

  // The real creator never saw that preclaim and keeps its own secret, so the
  // create is a normal new job rather than a refusal or a fake cancellation.
  const created = store.start(job({ run }));
  assert.equal(created.status, 201);
  assert.equal(created.body.state, "running");
  await flush();
  assert.equal(runs, 1);

  // The preclaiming secret still has no authority over the real job.
  assert.equal(store.poll({ id: ID, key: OTHER_KEY, after: 0 }).status, 404);
  assert.equal(store.cancel({ id: ID, key: OTHER_KEY, clientKey: "10.0.9.9" }).status, 404);
  assert.equal(store.poll({ id: ID, key: KEY, after: 0 }).body.state, "complete");
  await store.close();
});

test("a duplicate create replays the same job and never starts a second runner", async () => {
  const { store } = createHarness();
  let runs = 0;
  const run = async ({ emit }) => {
    runs += 1;
    emit("results", { searchResults: { total: 0, items: [] } });
  };
  const first = store.start(job({ run }));
  const second = store.start(job({ run }));
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.job_id, first.body.job_id);

  const differentPayload = store.start(job({ run, payload: { query: "kuusk" } }));
  assert.equal(differentPayload.status, 409);
  assert.equal(differentPayload.body.code, "JOB_CONFLICT");
  const differentKind = store.start(job({ run, kind: "follow-up" }));
  assert.equal(differentKind.status, 409);
  // An existing id with the wrong key is never a replay and never a conflict.
  assert.equal(store.start(job({ run, key: OTHER_KEY })).status, 404);

  await flush();
  assert.equal(runs, 1);
  assert.equal(store.poll({ id: ID, key: KEY, after: 0 }).body.events.length, 1);
  await store.close();
});

test("admission is bounded per client and in total", async () => {
  const { store } = createHarness({ liveJobsPerClient: 2 });
  const gate = deferred();
  const run = () => gate.promise;

  assert.equal(store.start(job({ run })).status, 201);
  assert.equal(store.start(job({ id: "job-two-0001", run })).status, 201);
  const third = store.start(job({ id: "job-three-001", run }));
  assert.equal(third.status, 429);
  assert.equal(third.body.code, "JOB_CAPACITY");
  assert.equal(third.body.retry_after_ms, 2000);
  // Another client still fits: the per-client bound is not a global one.
  assert.equal(store.start(job({ id: "job-other-001", clientKey: "10.0.0.2", run })).status, 201);

  for (let client = 3; client <= 20; client += 1) {
    for (const slot of [1, 2]) {
      const created = store.start(job({
        id: `job-${String(client).padStart(2, "0")}-${slot}-0001`,
        clientKey: `10.0.0.${client}`,
        run,
      }));
      assert.equal(created.status, 201);
    }
  }
  assert.equal(store.stats().charged, 39);
  assert.equal(store.start(job({ id: "job-other-002", clientKey: "10.0.0.2", run })).status, 201);
  assert.equal(store.stats().charged, 40);
  const overflow = store.start(job({ id: "job-overflow-1", clientKey: "10.0.0.99", run }));
  assert.equal(overflow.status, 429);
  assert.equal(overflow.body.code, "JOB_CAPACITY");

  gate.resolve();
  await flush();
  await store.close();
});

test("the default store admits ten live jobs for one address and refuses the eleventh", async (t) => {
  const { store } = createHarness();
  const gate = deferred();
  t.after(async () => {
    gate.resolve();
    await flush();
    await store.close();
  });
  const run = () => gate.promise;

  for (let slot = 1; slot <= 10; slot += 1) {
    const created = store.start(job({
      id: `job-solo-${String(slot).padStart(2, "0")}-0001`,
      run,
    }));
    assert.equal(created.status, 201, `live job ${slot} for one address should be admitted`);
  }
  assert.equal(store.stats().charged, 10);

  const eleventh = store.start(job({ id: "job-solo-11-0001", run }));
  assert.equal(eleventh.status, 429);
  assert.equal(eleventh.body.code, "JOB_CAPACITY");
  assert.equal(store.stats().charged, 10);

  // The per-address allowance does not open the global one: another address
  // still fits, and the store refuses at the global limit of 40 live jobs.
  assert.equal(store.start(job({ id: "job-other-0001", clientKey: "10.0.0.2", run })).status, 201);
  for (let filler = 0; filler < 29; filler += 1) {
    const created = store.start(job({
      id: `job-fill-${String(filler).padStart(2, "0")}-0001`,
      clientKey: `10.0.1.${filler}`,
      run,
    }));
    assert.equal(created.status, 201);
  }
  assert.equal(store.stats().charged, 40);
  const overflow = store.start(job({ id: "job-overflow-1", clientKey: "10.0.2.1", run }));
  assert.equal(overflow.status, 429);
  assert.equal(overflow.body.code, "JOB_CAPACITY");
  assert.equal(store.stats().charged, 40);
});

test("a cancelled job keeps holding its slot until the runner really settles", async () => {
  const { store } = createHarness({ liveJobsPerClient: 2 });
  const gates = [deferred(), deferred()];
  const runs = [
    () => gates[0].promise,
    () => gates[1].promise,
  ];
  assert.equal(store.start(job({ id: "held-job-0001", run: runs[0] })).status, 201);
  assert.equal(store.start(job({ id: "held-job-0002", run: runs[1] })).status, 201);
  await flush();

  assert.equal(store.cancel({ id: "held-job-0001", key: KEY, clientKey: "10.0.0.1" }).body.state, "cancelled");
  assert.equal(store.cancel({ id: "held-job-0002", key: KEY, clientKey: "10.0.0.1" }).body.state, "cancelled");
  assert.equal(store.stats().held, 2);
  // The HTTP exchange is over, but the process is not free: the client slot
  // stays charged until the aborted runners settle.
  assert.equal(store.start(job({ id: "held-job-0003" })).status, 429);

  gates[0].resolve();
  await flush();
  assert.equal(store.stats().held, 1);
  assert.equal(store.stats().charged, 1);
  // Exactly one slot came free, so a new job fits again, but the second
  // cancelled job still holds the other slot until its runner settles.
  assert.equal(store.start(job({ id: "held-job-0003" })).status, 201);
  assert.equal(store.start(job({ id: "held-job-0004" })).status, 429);

  gates[1].resolve();
  await flush();
  assert.equal(store.stats().held, 0);
  assert.equal(store.start(job({ id: "held-job-0004" })).status, 201);
  await store.close();
});

test("a wedged runner keeps its slot past the owner lease and past the record tombstone", async () => {
  const { clock, store } = createHarness({ liveJobsPerClient: 2 });
  const gate = deferred();
  const run = () => gate.promise;
  assert.equal(store.start(job({ id: "wedged-job-001", run })).status, 201);
  assert.equal(store.start(job({ id: "wedged-job-002", run })).status, 201);
  await flush();
  assert.equal(store.cancel({ id: "wedged-job-001", key: KEY, clientKey: "10.0.0.1" }).body.state, "cancelled");
  assert.equal(store.stats().charged, 2);

  // The owner lease expiring changes nothing: a hung provider may not be
  // replaced, because a replacement would spend tokens the process cannot
  // account for. The slot stays charged until the runner really settles.
  clock.advance(29_000);
  assert.equal(store.stats().charged, 2);
  assert.equal(store.stats().abandoned, 0);
  clock.advance(1_000);
  assert.equal(store.stats().charged, 2);
  // The lease marks the cancelled job abandoned and raises its signal again; it
  // still does not free the slot.
  assert.equal(store.stats().abandoned, 1);
  assert.equal(store.start(job({ id: "wedged-job-003" })).status, 429);

  // The retention window does not free it either: the record must stay while
  // its runner is unsettled, and the accounting certainly does not move.
  clock.advance(600_000);
  const retained = store.poll({ id: "wedged-job-001", key: KEY, after: 0 });
  assert.equal(retained.status, 200);
  assert.equal(retained.body.state, "cancelled");
  assert.deepEqual(retained.body.events, []);
  assert.equal(store.stats().charged, 2);
  assert.equal(store.stats().abandoned, 2);
  assert.equal(store.start(job({ id: "wedged-job-003" })).status, 429);

  // Only the runner settling frees the slot, and only once.
  gate.resolve();
  await flush();
  assert.equal(store.stats().charged, 0);
  assert.equal(store.stats().abandoned, 0);
  assert.equal(store.start(job({ id: "wedged-job-003" })).status, 201);
  await closeStore(store, clock);
});

test("a finished id keeps its identity while its runner is still unfinished", async () => {
  const { clock, store } = createHarness();
  const gate = deferred();
  let runs = 0;
  const run = () => {
    runs += 1;
    return gate.promise;
  };
  assert.equal(store.start(job({ run })).status, 201);
  await flush();
  assert.equal(runs, 1);
  assert.equal(store.cancel({ id: ID, key: KEY, clientKey: "10.0.0.1" }).body.state, "cancelled");
  assert.equal(store.stats().held, 1);

  // The record's own retention window elapses while the runner is still
  // pending. The record stays with its payload already trimmed, because its
  // identity, its terminal state and its conflict answer are still needed.
  clock.advance(600_000);
  const expired = store.poll({ id: ID, key: KEY, after: 0 });
  assert.equal(expired.status, 200);
  assert.equal(expired.body.state, "cancelled");
  assert.deepEqual(expired.body.events, []);

  // A foreign cancel cannot plant a competing identity for the id either.
  assert.equal(store.cancel({ id: ID, key: OTHER_KEY, clientKey: "10.0.0.2" }).status, 404);
  assert.equal(store.poll({ id: ID, key: OTHER_KEY, after: 0 }).status, 404);

  // The identical request must not start the same work a second time.
  const retry = store.start(job({ run }));
  assert.equal(retry.status, 200);
  assert.equal(retry.body.state, "cancelled");
  await flush();
  assert.equal(runs, 1);

  // Nor may another secret take the identity over while that runner is alive.
  const foreign = store.start(job({ run, key: OTHER_KEY, clientKey: "10.0.0.2" }));
  assert.equal(foreign.status, 404);
  // And the owner cannot quietly turn the identity into a different request.
  assert.equal(store.start(job({ run, payload: { query: "kuusk" } })).status, 409);
  await flush();
  assert.equal(runs, 1);
  assert.equal(store.stats().charged, 1);

  gate.resolve();
  await flush();
  assert.equal(store.stats().charged, 0);
  await store.close();
});

test("record pressure cannot evict an identity whose runner is still active", async () => {
  const { clock, store } = createHarness({ records: 1 });
  const gate = deferred();
  assert.equal(store.start(job({ id: "kept-job-0001", run: () => gate.promise })).status, 201);
  await flush();
  assert.equal(store.cancel({ id: "kept-job-0001", key: KEY, clientKey: "10.0.0.1" }).body.state, "cancelled");
  clock.advance(600_000);

  // The only record slot is past its retention window but still the active
  // identity, so pressure is refused instead of paying for the new job with it.
  assert.equal(store.start(job({
    id: "kept-job-0002",
    clientKey: "10.0.0.2",
    run: async () => undefined,
  })).status, 429);
  assert.equal(store.poll({ id: "kept-job-0001", key: KEY, after: 0 }).body.state, "cancelled");

  // Settlement ends the identity, and the expired record is reclaimed.
  gate.resolve();
  await flush();
  clock.advance(1_000);
  assert.equal(store.stats().records, 0);
  assert.equal(store.stats().charged, 0);
  assert.equal(store.start(job({
    id: "kept-job-0002",
    clientKey: "10.0.0.2",
    run: async () => undefined,
  })).status, 201);
  await store.close();
});

test("the hard deadline fails the job, aborts the runner and drops late events", async () => {
  const { clock, store } = createHarness();
  let captured;
  const run = ({ signal, emit }) => {
    captured = { signal, emit };
    emit("results", { searchResults: { total: 0, items: [] } });
    return new Promise(() => undefined);
  };
  assert.equal(store.start(job({ run })).status, 201);
  await flush();
  assert.equal(captured.signal.aborted, false);
  assert.equal(store.poll({ id: ID, key: KEY, after: 0 }).body.events.length, 1);

  clock.advance(284_999);
  assert.equal(store.poll({ id: ID, key: KEY, after: 0 }).body.state, "running");
  clock.advance(1);
  const expired = store.poll({ id: ID, key: KEY, after: 0 });
  assert.equal(expired.body.state, "failed");
  assert.equal(expired.body.retry_after_ms, 0);
  assert.equal(captured.signal.aborted, true);

  captured.emit("answer", { result: { answer: "liiga hilja" } });
  assert.equal(store.poll({ id: ID, key: KEY, after: 0 }).body.events.length, 1);
  await closeStore(store, clock);
});

test("the terminal payload expires but the idempotency tombstone keeps the state", async () => {
  const { clock, store } = createHarness();
  assert.equal(store.start(job({
    run: async ({ emit }) => {
      emit("results", { searchResults: { total: 1, items: ["a"] } });
      emit("answer", { result: { answer: "Vastus" } });
    },
  })).status, 201);
  await flush();
  assert.equal(store.poll({ id: ID, key: KEY, after: 0 }).body.events.length, 2);

  clock.advance(59_999);
  assert.equal(store.poll({ id: ID, key: KEY, after: 0 }).body.events.length, 2);
  clock.advance(1);
  const trimmed = store.poll({ id: ID, key: KEY, after: 0 });
  assert.equal(trimmed.body.state, "complete");
  assert.deepEqual(trimmed.body.events, []);

  clock.advance(540_000);
  assert.equal(store.poll({ id: ID, key: KEY, after: 0 }).status, 404);
  await store.close();
});

test("a cancel that arrives before the create blocks the late create", async () => {
  const { store } = createHarness();
  let runs = 0;
  const run = async () => {
    runs += 1;
  };

  const tombstoned = store.cancel({ id: ID, key: KEY, clientKey: "10.0.0.1" });
  assert.equal(tombstoned.status, 200);
  assert.equal(tombstoned.body.state, "cancelled");
  assert.equal(tombstoned.body.deadline_at, null);

  const late = store.start(job({ run }));
  assert.equal(late.status, 200);
  assert.equal(late.body.state, "cancelled");
  await flush();
  assert.equal(runs, 0);
  assert.equal(store.stats().records, 1);
  assert.equal(store.stats().running, 0);
  // The tombstone never becomes a second job even when the payload is retried.
  assert.equal(store.start(job({ run, payload: { query: "mänd" } })).body.state, "cancelled");
  await flush();
  assert.equal(runs, 0);
  await store.close();
});

test("cancelling during generation aborts once and refuses every later event", async () => {
  const { store } = createHarness();
  const gate = deferred();
  let captured;
  const run = ({ signal, emit }) => {
    captured = { signal, emit };
    emit("results", { searchResults: { total: 1, items: ["a"] } });
    return gate.promise;
  };
  assert.equal(store.start(job({ run })).status, 201);
  await flush();

  const cancelled = store.cancel({ id: ID, key: KEY, clientKey: "10.0.0.1" });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.state, "cancelled");
  assert.equal(cancelled.body.events.length, 1);
  assert.equal(captured.signal.aborted, true);
  assert.equal(captured.signal.reason.code, "JOB_CANCELLED");

  captured.emit("draft", { result: { answer: "must not land" } });
  captured.emit("answer", { result: { answer: "must not land" } });
  const after = store.poll({ id: ID, key: KEY, after: 0 });
  assert.equal(after.body.state, "cancelled");
  assert.deepEqual(after.body.events.map((entry) => entry.seq), [1]);
  // Cancelling twice is idempotent and still tells the truth.
  const twice = store.cancel({ id: ID, key: KEY, clientKey: "10.0.0.1" });
  assert.equal(twice.status, 200);
  assert.deepEqual(twice.body, after.body);
  gate.resolve();
  await flush();
  await store.close();
});

test("poll replays only events after the caller's cursor", async () => {
  const { store } = createHarness();
  assert.equal(store.start(job({
    run: async ({ emit }) => {
      emit("results", { searchResults: { total: 0, items: [] } });
      emit("draft", { result: { answer: "poolik" } });
      emit("answer", { result: { answer: "valmis" } });
    },
  })).status, 201);
  await flush();

  const seqs = (after) => store.poll({ id: ID, key: KEY, after }).body.events.map((entry) => entry.seq);
  assert.deepEqual(seqs(0), [1, 2, 3]);
  assert.deepEqual(seqs(1), [2, 3]);
  assert.deepEqual(seqs(3), []);
  assert.deepEqual(seqs(99), []);
  // An unreadable cursor replays everything instead of losing events.
  assert.deepEqual(seqs(undefined), [1, 2, 3]);
  assert.deepEqual(seqs(-5), [1, 2, 3]);
  assert.deepEqual(seqs("nonsense"), [1, 2, 3]);
  const events = store.poll({ id: ID, key: KEY, after: 0 }).body.events;
  assert.equal(Object.isFrozen(events[0].event), true);
  assert.throws(() => {
    events[0].event.searchResults.items.push("mutated");
  }, TypeError);
  assert.deepEqual(store.poll({ id: ID, key: KEY, after: 0 }).body.events[0].event.searchResults.items, []);
  await store.close();
});

test("a copied field is withdrawn at its expiry without changing the event sequence", async () => {
  const { clock, store } = createHarness();
  const copied = {
    searchResults: {
      total: 1,
      items: [{ title: "Kaitseala", url: "https://example.test/a", summary: "Kopeeritud kokkuvõte" }],
    },
  };
  const safe = {
    searchResults: {
      total: 1,
      items: [{ title: "Kaitseala", url: "https://example.test/a" }],
      copiedFieldWithdrawn: true,
    },
  };
  assert.equal(store.start(job({
    run: async ({ emit }) => {
      emit("results", copied, { expiresAt: 1_760_000_030_000, fallback: safe });
      emit("answer", { result: { answer: "Vastus" } });
    },
  })).status, 201);
  await flush();

  const before = store.poll({ id: ID, key: KEY, after: 0 });
  assert.equal(before.body.state, "complete");
  assert.deepEqual(before.body.events.map((entry) => entry.seq), [1, 2]);
  assert.equal(before.body.events[0].event.searchResults.items[0].summary, "Kopeeritud kokkuvõte");

  // The source's copy window closes while the job is still inside its replay
  // window, so the very same sequence number now carries the safe payload.
  clock.advance(30_000);
  const after = store.poll({ id: ID, key: KEY, after: 0 });
  assert.equal(after.body.state, "complete");
  assert.deepEqual(after.body.events.map((entry) => entry.seq), [1, 2]);
  assert.deepEqual(after.body.events[0].event, { searchResults: safe.searchResults, type: "results" });
  // The event without a copy window is served untouched.
  assert.deepEqual(after.body.events[1].event, { result: { answer: "Vastus" }, type: "answer" });
  // The bound itself is internal: it never appears in a public body.
  assert.equal(JSON.stringify(after.body).includes("Kopeeritud kokkuvõte"), false);
  assert.equal(JSON.stringify(after.body).includes("expiresAt"), false);
  assert.equal(JSON.stringify(after.body).includes("copiedFieldWithdrawn"), true);
  await store.close();
});

test("a withdrawn event does not change the job identity or its idempotency", async () => {
  const { clock, store } = createHarness();
  let runs = 0;
  const run = async ({ emit }) => {
    runs += 1;
    emit("results", {
      searchResults: { total: 1, items: [{ url: "https://example.test/a", summary: "Kokkuvõte" }] },
    }, {
      expiresAt: 1_760_000_010_000,
      fallback: { searchResults: { total: 1, items: [{ url: "https://example.test/a" }] } },
    });
  };
  assert.equal(store.start(job({ run })).status, 201);
  await flush();
  clock.advance(10_000);

  // The retried create replays the same job and the same withdrawn payload: a
  // copy window expiring is not a new generation and not a new identity.
  const replay = store.start(job({ run }));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.job_id, ID);
  assert.equal(replay.body.state, "complete");
  assert.equal(replay.body.events.length, 1);
  assert.equal(JSON.stringify(replay.body).includes("Kokkuvõte"), false);
  assert.equal(runs, 1);
  await store.close();
});

test("a copy window without a safe replacement is refused at emit", async () => {
  const { store } = createHarness();
  assert.equal(store.start(job({
    run: async ({ emit }) => {
      emit("results", { searchResults: { total: 0, items: [] } }, { expiresAt: 1_760_000_010_000 });
    },
  })).status, 201);
  await flush();
  const body = store.poll({ id: ID, key: KEY, after: 0 }).body;
  assert.equal(body.state, "failed");
  assert.deepEqual(body.events, []);
  await store.close();
});

test("a replacement that cannot fit beside its event is stored alone", async () => {
  const { store } = createHarness({ jobBytes: 4_000 });
  const sizeOf = (payload) => Buffer.byteLength(JSON.stringify({ ...payload, type: "results" }), "utf8");
  const link = `https://example.test/${"p".repeat(520)}`;
  const copied = {
    searchResults: { total: 1, items: [{ title: "A", url: link, summary: "x".repeat(3_200) }] },
  };
  const safe = { searchResults: { total: 1, items: [{ title: "A", url: link }] } };
  assert.ok(sizeOf(copied) <= 4_000, "the original alone fits");
  assert.ok(sizeOf(safe) <= 4_000, "the replacement alone fits");
  assert.ok(sizeOf(copied) + sizeOf(safe) > 4_000, "the pair does not fit");

  assert.equal(store.start(job({
    run: async ({ emit }) => {
      emit("results", copied, { expiresAt: 1_760_000_030_000, fallback: safe });
    },
  })).status, 201);
  await flush();

  const body = store.poll({ id: ID, key: KEY, after: 0 }).body;
  // The job still completes, the sequence is unchanged, and the reader gets the
  // safe replacement from the first read: the copied text was never stored.
  assert.equal(body.state, "complete");
  assert.deepEqual(body.events.map((entry) => entry.seq), [1]);
  assert.deepEqual(body.events[0].event, { searchResults: safe.searchResults, type: "results" });
  assert.equal(body.events[0].event.searchResults.items[0].summary, undefined);
  assert.equal(JSON.stringify(body).includes("x".repeat(64)), false);
  assert.ok(store.stats().eventBytes <= 4_000);
  await store.close();
});

test("a replacement is stored alone when only the global budget is short", async () => {
  const { store } = createHarness({ totalBytes: 2_048 });
  const sizeOf = (payload) => Buffer.byteLength(JSON.stringify({ ...payload, type: "results" }), "utf8");
  const link = `https://example.test/${"p".repeat(400)}`;
  const copied = { searchResults: { total: 1, items: [{ url: link, summary: "x".repeat(9_000) }] } };
  const safe = { searchResults: { total: 1, items: [{ url: link }] } };
  assert.ok(sizeOf(safe) <= 2_048, "the replacement alone fits the global budget");
  assert.ok(sizeOf(copied) > 2_048, "the original cannot fit the global budget at all");

  assert.equal(store.start(job({
    run: async ({ emit }) => {
      emit("results", copied, { expiresAt: 1_760_000_030_000, fallback: safe });
    },
  })).status, 201);
  await flush();

  const body = store.poll({ id: ID, key: KEY, after: 0 }).body;
  assert.equal(body.state, "complete");
  assert.deepEqual(body.events[0].event, { searchResults: safe.searchResults, type: "results" });
  assert.equal(JSON.stringify(body).includes("x".repeat(64)), false);
  await store.close();
});

test("a replacement that cannot fit at all still fails the job", async () => {
  const { store } = createHarness({ jobBytes: 4_000 });
  const sizeOf = (payload) => Buffer.byteLength(JSON.stringify({ ...payload, type: "results" }), "utf8");
  const first = { searchResults: { total: 0, items: ["y".repeat(2_900)] } };
  const copied = { searchResults: { total: 0, items: ["z".repeat(400)] } };
  const safe = { searchResults: { total: 0, items: ["w".repeat(1_150)] } };
  assert.ok(sizeOf(first) + sizeOf(safe) > 4_000, "the replacement cannot fit the remaining job budget");
  assert.ok(sizeOf(safe) <= 4_000, "and it is not individually too large");

  assert.equal(store.start(job({
    run: async ({ emit }) => {
      emit("results", first);
      emit("results", copied, { expiresAt: 1_760_000_030_000, fallback: safe });
    },
  })).status, 201);
  await flush();

  const body = store.poll({ id: ID, key: KEY, after: 0 }).body;
  assert.equal(body.state, "failed");
  assert.deepEqual(body.events.map((entry) => entry.seq), [1]);
  await store.close();
});

test("an over-large answer fails the job instead of buffering it", async () => {
  const { store } = createHarness();
  let captured;
  const run = ({ signal, emit }) => {
    captured = { signal, emit };
    emit("results", { searchResults: { total: 0, items: [] } });
    emit("answer", { result: { answer: "x".repeat(2_100_000) } });
  };
  assert.equal(store.start(job({ run })).status, 201);
  await flush();

  const body = store.poll({ id: ID, key: KEY, after: 0 }).body;
  assert.equal(body.state, "failed");
  assert.deepEqual(body.events.map((entry) => entry.seq), [1]);
  assert.equal(captured.signal.aborted, true);
  assert.ok(store.stats().totalBytes < 2_000_000);
  await store.close();
});

test("an invalid event stops the runner and marks the job failed", async () => {
  const { store } = createHarness();
  const run = ({ emit }) => {
    emit("unknown-type", { result: {} });
  };
  assert.equal(store.start(job({ run })).status, 201);
  await flush();
  const body = store.poll({ id: ID, key: KEY, after: 0 }).body;
  assert.equal(body.state, "failed");
  assert.deepEqual(body.events, []);
  await store.close();
});

test("an invalid request is refused before anything is stored", async () => {
  const { store } = createHarness();
  const cyclic = { query: "mets" };
  cyclic.self = cyclic;
  const cases = [
    job({ id: "short" }),
    job({ id: "bad id with spaces" }),
    job({ key: "too-short" }),
    job({ kind: "other" }),
    job({ clientKey: "" }),
    job({ run: null }),
    job({ payload: cyclic }),
    job({ payload: { query: "x".repeat(40_000) } }),
  ];
  for (const input of cases) {
    const created = store.start(input);
    assert.equal(created.status, 400);
    assert.equal(created.body.code, "JOB_INVALID");
  }
  assert.equal(store.stats().records, 0);
  assert.equal(store.poll({ id: ID, key: "too-short", after: 0 }).status, 400);
  assert.equal(store.cancel({ id: "short", key: KEY, clientKey: "10.0.0.1" }).status, 400);
  await store.close();
});

test("close aborts every job, drains the runners it can and refuses new work", async () => {
  const { clock, store } = createHarness();
  const aborted = [];
  let emitAfterClose;
  const polite = ({ signal, emit }) => new Promise((resolve) => {
    emitAfterClose = emit;
    emit("results", { searchResults: { total: 1, items: ["a"] } });
    signal.addEventListener("abort", () => {
      aborted.push("polite");
      emit("answer", { result: { answer: "after shutdown" } });
      resolve();
    });
  });
  const wedged = deferred();
  assert.equal(store.start(job({ id: "close-job-0001", run: polite })).status, 201);
  assert.equal(store.start(job({ id: "close-job-0002", run: () => wedged.promise })).status, 201);
  await flush();

  const closing = store.close();
  clock.advance(5_000);
  await closing;
  assert.deepEqual(aborted, ["polite"]);
  // Records and answer text are gone, but the counts stay truthful: one runner
  // ignored its abort and is still unsettled, so it is still charged.
  assert.equal(store.stats().records, 0);
  assert.equal(store.stats().events, 0);
  assert.equal(store.stats().charged, 1);
  assert.equal(store.stats().held, 1);
  assert.equal(store.stats().pendingRuns, 1);
  // A closed store never starts work again.
  assert.equal(store.start(job({ id: "close-job-0003" })).status, 503);
  assert.equal(store.poll({ id: "close-job-0001", key: KEY, after: 0 }).status, 503);
  assert.equal(store.cancel({ id: "close-job-0001", key: KEY, clientKey: "10.0.0.1" }).status, 503);
  emitAfterClose("answer", { result: { answer: "after shutdown" } });
  await store.close();
  assert.equal(clock.pendingTimers(), 0);

  // The wedged runner settles after shutdown, and only then does its accounting
  // leave the books.
  wedged.resolve();
  await flush();
  assert.equal(store.stats().charged, 0);
  assert.equal(store.stats().held, 0);
  assert.equal(store.stats().pendingRuns, 0);
});

test("close waits for the runners it aborted instead of cutting them off", async () => {
  const { store } = createHarness();
  let settled = false;
  assert.equal(store.start(job({
    run: ({ signal }) => new Promise((resolve) => {
      signal.addEventListener("abort", () => {
        setImmediate(() => {
          settled = true;
          resolve();
        });
      });
    }),
  })).status, 201);
  await flush();
  await store.close();
  assert.equal(settled, true);
});

test("the store keeps no key material and logs nothing", async (t) => {
  const logged = ["log", "warn", "error", "info", "debug"].map((name) => t.mock.method(console, name, () => undefined));
  const { store } = createHarness();
  const input = job({
    run: async ({ emit }) => {
      emit("results", { searchResults: { total: 0, items: [] } });
      throw new Error("runner exploded");
    },
  });
  store.start(input);
  // The store must not alias the caller's object: the key and the payload it
  // was given stay exactly as they were when the job was admitted.
  input.key = OTHER_KEY;
  input.payload.query = "muudetud";
  await flush();

  const body = store.poll({ id: ID, key: KEY, after: 0 }).body;
  assert.equal(body.state, "failed");
  assert.equal(store.poll({ id: ID, key: OTHER_KEY, after: 0 }).status, 404);
  assert.equal(store.start(job({ run: async () => undefined })).status, 200);

  const serialized = JSON.stringify({
    stats: store.stats(),
    body,
    replay: store.start(job({ run: async () => undefined })).body,
  });
  assert.equal(serialized.includes(KEY), false);
  assert.equal(serialized.includes("mets"), false);
  assert.equal(serialized.includes("10.0.0.1"), false);
  for (const spy of logged) assert.equal(spy.mock.callCount(), 0);
  await store.close();
});

test("stats never exposes job identifiers or secrets", async () => {
  const { store } = createHarness();
  assert.equal(store.start(job({ run: async () => undefined })).status, 201);
  await flush();
  const stats = store.stats();
  assert.deepEqual(Object.keys(stats).sort(), [
    "abandoned",
    "charged",
    "closed",
    "eventBytes",
    "events",
    "held",
    "pendingRuns",
    "records",
    "reservations",
    "running",
    "totalBytes",
  ]);
  assert.equal(JSON.stringify(stats).includes(ID), false);
  assert.equal(JSON.stringify(stats).includes(KEY), false);
  await store.close();
});
