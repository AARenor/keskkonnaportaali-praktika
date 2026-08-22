import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createBoundedNdjsonWriter } from "../server/http-stream.mjs";

class FakeResponse extends EventEmitter {
  constructor({ backpressure = false, closeOnEnd = false } = {}) {
    super();
    this.backpressure = backpressure;
    this.closeOnEnd = closeOnEnd;
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
  }

  write(value) {
    this.lines.push(value);
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
