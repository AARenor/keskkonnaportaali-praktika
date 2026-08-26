import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createPublicResponseBudget,
  resolvePublicResponseBudget,
} from "../server/response-budget.mjs";

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.writableEnded = false;
    this.writableFinished = false;
    this.headers = new Map();
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), value);
  }

  setTimeout(milliseconds, callback) {
    this.idleTimeout = { milliseconds, callback };
  }

  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  }

  finish(body) {
    this.body = body;
    this.writableEnded = true;
    this.writableFinished = true;
    this.emit("finish");
    return this;
  }

  json(body) {
    return this.finish(body);
  }

  send(body) {
    return this.finish(body);
  }

  destroy() {
    if (this.destroyed) return;
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

test("public response budget destroys idle and absolutely expired responses", () => {
  const timers = controlledTimers();
  const budget = createPublicResponseBudget({
    keyForRequest: (request) => request.client,
    idleTimeoutMs: 5_000,
    absoluteTimeoutMs: 12_000,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  const idleResponse = new FakeResponse();
  let nextCalls = 0;
  budget({ client: "a", path: "/asset.js" }, idleResponse, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(idleResponse.idleTimeout.milliseconds, 5_000);
  assert.equal([...timers.active][0].milliseconds, 12_000);
  idleResponse.idleTimeout.callback();
  assert.equal(idleResponse.destroyed, true);
  assert.equal(timers.active.size, 0);
  assert.equal(budget.stats().active, 0);

  const absoluteResponse = new FakeResponse();
  budget({ client: "b", path: "/large.css" }, absoluteResponse, () => { nextCalls += 1; });
  const [absoluteTimer] = timers.active;
  absoluteResponse.writableEnded = true;
  absoluteTimer.callback();
  assert.equal(absoluteResponse.destroyed, true);
  assert.equal(timers.active.size, 0);
  assert.equal(nextCalls, 2);
});

test("public response budget preserves health capacity and releases every admission", () => {
  const timers = controlledTimers();
  const budget = createPublicResponseBudget({
    keyForRequest: (request) => request.client,
    isReservedRequest: (request) => request.path.startsWith("/api/health"),
    maximumActive: 2,
    maximumGeneral: 1,
    maximumPerClient: 2,
    maximumGeneralPerClient: 1,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  const staticResponse = new FakeResponse();
  const healthResponse = new FakeResponse();
  budget({ client: "static-client", path: "/large.js" }, staticResponse, () => undefined);
  budget({ client: "health-client", path: "/api/health" }, healthResponse, () => undefined);
  assert.deepEqual(budget.stats(), {
    active: 2,
    generalActive: 1,
    clients: 2,
    maximumActive: 2,
    maximumGeneral: 1,
  });

  const rejected = new FakeResponse();
  budget({ client: "other-client", path: "/index.html" }, rejected, () => assert.fail("must reject"));
  assert.equal(rejected.statusCode, 503);
  assert.equal(rejected.headers.get("connection"), "close");
  assert.equal(rejected.headers.get("retry-after"), "2");

  staticResponse.finish("done");
  healthResponse.finish({ status: "ok" });
  assert.equal(budget.stats().active, 0);
  assert.equal(timers.active.size, 0);
});

test("public response configuration keeps finite connection and response limits", () => {
  assert.deepEqual(resolvePublicResponseBudget({}), {
    maximumConnections: 256,
    maximumActive: 224,
    maximumGeneral: 192,
    maximumPerClient: 16,
    maximumGeneralPerClient: 12,
    idleTimeoutMs: 20_000,
    absoluteTimeoutMs: 60_000,
  });
  const bounded = resolvePublicResponseBudget({
    MAX_HTTP_CONNECTIONS: "999999",
    MAX_ACTIVE_PUBLIC_RESPONSES: "999999",
    MAX_ACTIVE_GENERAL_RESPONSES: "999999",
    PUBLIC_RESPONSE_IDLE_TIMEOUT_MS: "999999",
    PUBLIC_RESPONSE_ABSOLUTE_TIMEOUT_MS: "999999",
  });
  assert.equal(bounded.maximumConnections, 2_048);
  assert.equal(bounded.maximumActive, 2_040);
  assert.equal(bounded.maximumGeneral, 2_039);
  assert.equal(bounded.idleTimeoutMs, 30_000);
  assert.equal(bounded.absoluteTimeoutMs, 120_000);
});
