import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createBoundedNdjsonWriter } from "../server/http-stream.mjs";

class FakeResponse extends EventEmitter {
  constructor({ backpressure = false, closeOnEnd = false, clock = null } = {}) {
    super();
    this.backpressure = backpressure;
    this.closeOnEnd = closeOnEnd;
    this.clock = clock;
    this.destroyed = false;
    this.writableEnded = false;
    this.headers = new Map();
    this.lines = [];
  }

  setHeader(name, value) {
    this.headers.set(name.toLocaleLowerCase("en"), value);
  }

  setTimeout(milliseconds, callback) {
    this.idleTimeout = { milliseconds, callback };
    this.restartIdleDeadline();
  }

  // A real socket inactivity deadline restarts with every byte written, so the
  // fake does the same. Without it a progressing stream and a silent one look
  // identical to the clock, which would test the wrong semantics.
  restartIdleDeadline() {
    if (!this.clock || !this.idleTimeout) return;
    this.clock.clearTimer(this.idleTimer);
    this.idleTimer = this.clock.setTimer(this.idleTimeout.callback, this.idleTimeout.milliseconds);
  }

  write(value) {
    this.lines.push(value);
    this.restartIdleDeadline();
    return !this.backpressure;
  }

  end() {
    this.writableEnded = true;
    if (this.closeOnEnd) queueMicrotask(() => this.emit("close"));
  }

  destroy(error) {
    this.destroyError = error;
    this.destroyed = true;
    this.emit("close");
  }
}

function controlledTimers() {
  const active = new Set();
  return {
    active,
    setTimer(callback, milliseconds) {
      const timer = { callback, milliseconds, unref() {} };
      active.add(timer);
      return timer;
    },
    clearTimer(timer) {
      active.delete(timer);
    },
  };
}

// Deterministic clock: an idle setting of a minute or more cannot be exercised
// with real waits, so simulated time moves the socket inactivity deadline the
// fake response installs and any deadline the writer installs itself.
function fakeClock() {
  const timers = new Set();
  let currentMs = 0;
  const install = (callback, milliseconds) => {
    const timer = {
      callback,
      dueAtMs: currentMs + (Number(milliseconds) || 0),
      unref() {},
      ref() {},
    };
    timers.add(timer);
    return timer;
  };
  return {
    setTimer: install,
    clearTimer(timer) {
      if (timer) timers.delete(timer);
    },
    advance(milliseconds) {
      const targetMs = currentMs + milliseconds;
      for (;;) {
        const due = [...timers]
          .filter((timer) => timer.dueAtMs <= targetMs)
          .sort((left, right) => left.dueAtMs - right.dueAtMs)[0];
        if (!due) break;
        timers.delete(due);
        currentMs = due.dueAtMs;
        due.callback();
      }
      currentMs = targetMs;
    },
  };
}

test("bounded NDJSON writes serialize events and hold completion until transport close", async () => {
  const response = new FakeResponse();
  const timers = controlledTimers();
  const writer = createBoundedNdjsonWriter(response, timers);

  await writer.write("results", { searchResults: { items: [] } });
  writer.enqueue("draft", { result: { answer: "kontrollitud" } });
  await writer.write("answer", { result: { answer: "valmis" } });
  assert.equal(response.headers.get("connection"), "close");
  assert.deepEqual(response.lines.map((line) => JSON.parse(line).type), ["results", "draft", "answer"]);

  let finished = false;
  const completion = writer.finish().then(() => { finished = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(response.writableEnded, true);
  assert.equal(finished, false, "admission may not release before the connection closes");
  response.emit("close");
  await completion;
  assert.equal(finished, true);
  assert.equal(timers.active.size, 0);
});

test("bounded NDJSON writes wait for drain and destroy a slow reader on deadline", async () => {
  const response = new FakeResponse({ backpressure: true });
  const timers = controlledTimers();
  const failures = [];
  const writer = createBoundedNdjsonWriter(response, {
    ...timers,
    drainTimeoutMs: 250,
    onFailure: (error) => failures.push(error.code),
  });

  const pending = writer.write("results", { searchResults: { items: [] } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.active.size, 1);
  const [timer] = timers.active;
  timer.callback();
  await assert.rejects(pending, (error) => error?.code === "STREAM_DRAIN_TIMEOUT");
  assert.equal(response.destroyed, true);
  assert.deepEqual(failures, ["STREAM_DRAIN_TIMEOUT"]);
  assert.equal(timers.active.size, 0);
});

test("bounded NDJSON writes cap serialized response bytes", async () => {
  const response = new FakeResponse({ closeOnEnd: true });
  const writer = createBoundedNdjsonWriter(response, { maximumBytes: 1_024 });
  await assert.rejects(
    writer.write("answer", { result: { answer: "x".repeat(2_000) } }),
    (error) => error?.code === "STREAM_TOO_LARGE",
  );
  assert.equal(response.destroyed, true);
});

test("a configured 60 s idle deadline ends a stream that stays silent from its first line", async () => {
  const clock = fakeClock();
  const response = new FakeResponse({ clock });
  const failures = [];
  const writer = createBoundedNdjsonWriter(response, {
    ...clock,
    idleTimeoutMs: 60_000,
    onFailure: (error) => failures.push(error.code),
  });

  await writer.write("results", { searchResults: { items: [] } });
  clock.advance(59_999);
  assert.equal(response.destroyed, false, "a reader is allowed the whole configured silence");
  assert.deepEqual(failures, []);

  clock.advance(1);
  assert.equal(response.destroyed, true, "the configured idle deadline still ends a silent stream");
  assert.deepEqual(failures, ["STREAM_IDLE_TIMEOUT"]);
  await assert.rejects(
    writer.write("answer", { result: { answer: "hilinenud" } }),
    (error) => error?.code === "STREAM_IDLE_TIMEOUT",
  );
});

test("a delivered line restarts the configured idle deadline, so a progressing answer stays open", async () => {
  const clock = fakeClock();
  const response = new FakeResponse({ clock });
  const failures = [];
  const writer = createBoundedNdjsonWriter(response, {
    ...clock,
    idleTimeoutMs: 60_000,
    onFailure: (error) => failures.push(error.code),
  });

  await writer.write("results", { searchResults: { items: [] } });
  clock.advance(31_000);
  assert.equal(response.destroyed, false, "a progress line arrives before the idle window closes");
  await writer.write("draft", { result: { answer: "kogun" } });

  clock.advance(29_000);
  assert.equal(response.destroyed, false, "the deadline moved with the delivered line, not the stream start");
  assert.deepEqual(failures, []);

  clock.advance(30_999);
  assert.equal(response.destroyed, false, "the restarted deadline is the one that counts");
  assert.deepEqual(failures, []);

  clock.advance(1);
  assert.equal(response.destroyed, true, "a stream that falls silent after progress is still closed");
  assert.deepEqual(failures, ["STREAM_IDLE_TIMEOUT"]);
  await assert.rejects(
    writer.write("answer", { result: { answer: "hilinenud" } }),
    (error) => error?.code === "STREAM_IDLE_TIMEOUT",
  );
});

test("a long idle budget leaves the drain deadline and byte ceiling untouched", async () => {
  const clock = fakeClock();
  const slowReader = new FakeResponse({ backpressure: true, clock });
  const failures = [];
  const writer = createBoundedNdjsonWriter(slowReader, {
    ...clock,
    idleTimeoutMs: 120_000,
    drainTimeoutMs: 250,
    onFailure: (error) => failures.push(error.code),
  });

  const pending = writer.write("results", { searchResults: { items: [] } });
  await new Promise((resolve) => setImmediate(resolve));
  clock.advance(249);
  assert.equal(slowReader.destroyed, false, "a slow reader is still inside its drain budget");
  clock.advance(1);
  await assert.rejects(pending, (error) => error?.code === "STREAM_DRAIN_TIMEOUT");
  assert.equal(slowReader.destroyed, true, "backpressure still closes a stalled reader long before the idle deadline");
  assert.deepEqual(failures, ["STREAM_DRAIN_TIMEOUT"]);

  const oversized = new FakeResponse();
  const oversizedWriter = createBoundedNdjsonWriter(oversized, { idleTimeoutMs: 120_000, maximumBytes: 1_024 });
  await assert.rejects(
    oversizedWriter.write("answer", { result: { answer: "x".repeat(2_000) } }),
    (error) => error?.code === "STREAM_TOO_LARGE",
  );
  assert.equal(oversized.destroyed, true, "the byte ceiling still holds under a long idle budget");
});
