import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createGracefulShutdown } from "../server/graceful-shutdown.mjs";

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test("graceful shutdown lets an in-flight response finish before exiting", async () => {
  const server = createServer((_request, response) => {
    setTimeout(() => response.end("ready"), 35);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const request = fetch(`http://127.0.0.1:${address.port}/`);
  await wait(5);
  const exitCodes = [];
  const events = [];
  const drainSignals = [];
  const handler = createGracefulShutdown(server, {
    drainDelayMs: 10,
    forceExitMs: 250,
    idleSweepMs: 5,
    exit: (code) => exitCodes.push(code),
    log: (event) => events.push(event),
    onDrainStart: (signal) => drainSignals.push(signal),
  });

  assert.equal(handler.shutdown("SIGTERM"), true);
  assert.equal(handler.shutdown("SIGTERM"), false);
  const response = await request;
  assert.equal(await response.text(), "ready");
  await wait(20);

  assert.deepEqual(exitCodes, [0]);
  assert.deepEqual(drainSignals, ["SIGTERM"]);
  assert.deepEqual(events.map((event) => event.event), [
    "graceful-shutdown-started",
    "graceful-shutdown-finished",
  ]);
  assert.equal(handler.state(), "finished");
});

test("graceful shutdown force-closes a server that exceeds the stop budget", async () => {
  const exitCodes = [];
  const events = [];
  let closeCalls = 0;
  let forceCalls = 0;
  const server = {
    close() { closeCalls += 1; },
    closeAllConnections() { forceCalls += 1; },
  };
  const handler = createGracefulShutdown(server, {
    drainDelayMs: 0,
    forceExitMs: 100,
    exit: (code) => exitCodes.push(code),
    log: (event) => events.push(event),
  });

  handler.shutdown("SIGTERM");
  await wait(140);

  assert.equal(closeCalls, 1);
  assert.equal(forceCalls, 1);
  assert.deepEqual(exitCodes, [1]);
  assert.deepEqual(events.map((event) => event.event), [
    "graceful-shutdown-started",
    "graceful-shutdown-forced",
  ]);
  assert.equal(handler.state(), "forced");
});

// A container handover budget can be longer than half a minute while a grounded
// forest answer streams. Both tests below move a simulated clock, because a real
// 45 to 90 second stop budget cannot be waited out inside a test run.
test("graceful shutdown keeps an in-flight response alive across a stop budget longer than 29 s", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const exitCodes = [];
  const events = [];
  let closeCalls = 0;
  let forceCalls = 0;
  let onClosed = null;
  const server = {
    close(callback) { closeCalls += 1; onClosed = callback; },
    closeAllConnections() { forceCalls += 1; },
    closeIdleConnections() {},
  };
  const handler = createGracefulShutdown(server, {
    drainDelayMs: 1_000,
    forceExitMs: 45_000,
    exit: (code) => exitCodes.push(code),
    log: (event) => events.push(event),
  });

  handler.shutdown("SIGTERM");
  t.mock.timers.tick(1_000);
  assert.equal(closeCalls, 1, "draining starts on the configured drain delay");
  assert.equal(forceCalls, 0);
  assert.deepEqual(exitCodes, []);

  t.mock.timers.tick(28_000);
  assert.deepEqual(exitCodes, [], "no force exit at the old 29 s ceiling");
  assert.equal(forceCalls, 0, "no connection is force-closed before the configured deadline");
  assert.equal(handler.state(), "draining");

  t.mock.timers.tick(6_000);
  assert.deepEqual(exitCodes, [], "the in-flight response is still streaming inside the stop budget");
  assert.equal(forceCalls, 0);
  assert.equal(handler.state(), "draining");

  onClosed(null);
  assert.deepEqual(exitCodes, [0], "cleanup finishes normally and exits cleanly");
  assert.equal(handler.state(), "finished");
  assert.equal(forceCalls, 0);
  assert.deepEqual(events.map((event) => event.event), [
    "graceful-shutdown-started",
    "graceful-shutdown-finished",
  ]);
});

test("graceful shutdown still force-exits a stuck cleanup at the configured later deadline", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const exitCodes = [];
  const events = [];
  let forceCalls = 0;
  let onClosed = null;
  const server = {
    close(callback) { onClosed = callback; },
    closeAllConnections() { forceCalls += 1; },
    closeIdleConnections() {},
  };
  const handler = createGracefulShutdown(server, {
    drainDelayMs: 1_000,
    forceExitMs: 45_000,
    exit: (code) => exitCodes.push(code),
    log: (event) => events.push(event),
  });

  handler.shutdown("SIGTERM");
  t.mock.timers.tick(1_000);
  t.mock.timers.tick(43_000);
  assert.deepEqual(exitCodes, [], "a stuck cleanup is not cut short inside its budget");
  assert.equal(forceCalls, 0);
  assert.equal(handler.state(), "draining");

  t.mock.timers.tick(1_000);
  assert.deepEqual(exitCodes, [1], "a cleanup that never finishes still forces an exit at its deadline");
  assert.equal(forceCalls, 1);
  assert.equal(handler.state(), "forced");
  assert.deepEqual(events.map((event) => event.event), [
    "graceful-shutdown-started",
    "graceful-shutdown-forced",
  ]);

  onClosed(new Error("kinni jäänud"));
  assert.deepEqual(exitCodes, [1], "a late cleanup callback cannot exit twice");
});
