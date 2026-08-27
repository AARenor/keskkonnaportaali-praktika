import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createPublicResponseBudget,
  createPublicSocketBudget,
  isReservedHealthRequest,
  resolvePublicResponseBudget,
} from "../server/response-budget.mjs";

class FakeSocket extends EventEmitter {
  constructor(remoteAddress) {
    super();
    this.remoteAddress = remoteAddress;
    this.destroyed = false;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit("close");
  }
}

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
    isReservedRequest: isReservedHealthRequest,
    maximumActive: 2,
    maximumGeneral: 1,
    maximumPerClient: 2,
    maximumGeneralPerClient: 1,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  const staticResponse = new FakeResponse();
  const healthResponse = new FakeResponse();
  budget({ client: "static-client", method: "GET", path: "/large.js" }, staticResponse, () => undefined);
  budget({ client: "health-client", method: "GET", path: "/api/health", headers: {} }, healthResponse, () => undefined);
  assert.deepEqual(budget.stats(), {
    active: 2,
    generalActive: 1,
    clients: 2,
    maximumActive: 2,
    maximumGeneral: 1,
  });

  const rejected = new FakeResponse();
  budget({ client: "other-client", method: "GET", path: "/index.html" }, rejected, () => assert.fail("must reject"));
  assert.equal(rejected.statusCode, 503);
  assert.equal(rejected.headers.get("connection"), "close");
  assert.equal(rejected.headers.get("retry-after"), "2");

  staticResponse.finish("done");
  healthResponse.finish({ status: "ok" });
  assert.equal(budget.stats().active, 0);
  assert.equal(timers.active.size, 0);
});

test("pre-header socket budget caps direct peers and preserves a readiness reserve", () => {
  const budget = createPublicSocketBudget({
    maximumActive: 16,
    maximumGeneral: 8,
    maximumPerPeer: 2,
    keyForSocket: (socket) => socket.remoteAddress,
    isReservedSocket: (socket) => socket.remoteAddress === "127.0.0.1",
    isTrustedIngressSocket: (socket) => socket.remoteAddress === "10.0.0.10",
  });

  const direct = [new FakeSocket("203.0.113.1"), new FakeSocket("203.0.113.1")];
  assert.equal(budget(direct[0]), true);
  assert.equal(budget(direct[1]), true);
  const rejectedDirect = new FakeSocket("203.0.113.1");
  assert.equal(budget(rejectedDirect), false);
  assert.equal(rejectedDirect.destroyed, true);

  const trusted = Array.from({ length: 6 }, () => new FakeSocket("10.0.0.10"));
  for (const socket of trusted) assert.equal(budget(socket), true);
  const rejectedGeneral = new FakeSocket("198.51.100.2");
  assert.equal(budget(rejectedGeneral), false);

  const readiness = new FakeSocket("127.0.0.1");
  assert.equal(budget(readiness), true);
  assert.equal(readiness.destroyed, false);
  assert.deepEqual(budget.stats(), {
    active: 9,
    generalActive: 8,
    peers: 3,
    maximumActive: 16,
    maximumGeneral: 8,
    maximumPerPeer: 2,
  });

  direct[0].destroy();
  trusted[0].emit("error", new Error("closed"));
  // A later close event must not double-release an errored socket.
  trusted[0].destroy();
  assert.equal(budget.stats().active, 7);
  assert.equal(budget(new FakeSocket("198.51.100.2")), true);
});

test("only exact bodyless GET and HEAD probes receive reserved health capacity", () => {
  for (const request of [
    { method: "GET", path: "/api/health", headers: {} },
    { method: "HEAD", path: "/api/health/container-readiness", headers: { "content-length": "0" } },
  ]) assert.equal(isReservedHealthRequest(request), true);

  for (const request of [
    { method: "POST", path: "/api/health", headers: {} },
    { method: "GET", path: "/api/health/extra", headers: {} },
    { method: "GET", path: "/api/health", headers: { "content-length": "2" } },
    { method: "HEAD", path: "/api/health", headers: { "transfer-encoding": "chunked" } },
  ]) assert.equal(isReservedHealthRequest(request), false);

  const timers = controlledTimers();
  const budget = createPublicResponseBudget({
    keyForRequest: (request) => request.client,
    isReservedRequest: isReservedHealthRequest,
    maximumActive: 2,
    maximumGeneral: 1,
    maximumPerClient: 2,
    maximumGeneralPerClient: 1,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  const ordinary = new FakeResponse();
  budget({ client: "ordinary", method: "GET", path: "/asset.js", headers: {} }, ordinary, () => undefined);

  const rejectedPost = new FakeResponse();
  budget({ client: "attacker", method: "POST", path: "/api/health", headers: { "content-length": "2" } }, rejectedPost, () => assert.fail("must reject"));
  assert.equal(rejectedPost.statusCode, 503);

  const health = new FakeResponse();
  let healthAdmitted = false;
  budget({ client: "probe", method: "GET", path: "/api/health", headers: {} }, health, () => { healthAdmitted = true; });
  assert.equal(healthAdmitted, true);
  ordinary.finish("done");
  health.finish({ status: "ok" });
  assert.equal(budget.stats().active, 0);
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
