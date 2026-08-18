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
  const handler = createGracefulShutdown(server, {
    drainDelayMs: 10,
    forceExitMs: 250,
    idleSweepMs: 5,
    exit: (code) => exitCodes.push(code),
    log: (event) => events.push(event),
  });

  assert.equal(handler.shutdown("SIGTERM"), true);
  assert.equal(handler.shutdown("SIGTERM"), false);
  const response = await request;
  assert.equal(await response.text(), "ready");
  await wait(20);

  assert.deepEqual(exitCodes, [0]);
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
