import assert from "node:assert/strict";
import test from "node:test";
import { createOfficialDiscoveryIndexQueue } from "../server/live-index-queue.mjs";

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function document(url, content = "") {
  return { url, title: url.split("/").at(-1), content };
}

test("official discovery indexing coalesces URLs and bounds pending batches and active writers", async () => {
  let releaseFirst;
  let active = 0;
  let maximumActive = 0;
  const batches = [];
  const firstBatch = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const queue = createOfficialDiscoveryIndexQueue({
    keyOf: (item) => new URL(item.url).toString(),
    maximumPending: 5,
    batchSize: 2,
    concurrency: 1,
    writeBatch: async (documents) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      batches.push(documents.map((item) => item.url));
      if (batches.length === 1) await firstBatch;
      active -= 1;
      return { status: "ready", indexed: documents.length };
    },
  });

  const accepted = queue.enqueue([
    document("https://example.test/a", "short"),
    document("https://example.test/a", "a much richer body"),
    document("https://example.test/b"),
    document("https://example.test/c"),
    document("https://example.test/d"),
    document("https://example.test/e"),
    document("https://example.test/f"),
  ]);
  assert.deepEqual(accepted, { accepted: 5, coalesced: 1, dropped: 1, closed: false });
  await nextTurn();
  assert.equal(queue.stats().active, 1);
  assert.equal(queue.stats().pending, 3);
  assert.ok(queue.stats().inflight <= 2);

  const duplicateInFlight = queue.enqueue([document("https://example.test/a", "newer")]);
  assert.equal(duplicateInFlight.coalesced, 1);
  releaseFirst();
  await queue.idle();

  assert.equal(maximumActive, 1);
  assert.ok(batches.every((batch) => batch.length <= 2));
  assert.equal(queue.stats().pending, 0);
  assert.equal(queue.stats().inflight, 0);
  assert.equal(queue.stats().active, 0);
});

test("official discovery indexing never queues a duplicate behind an in-flight URL", async () => {
  let releaseWrite;
  let writes = 0;
  const blocked = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const queue = createOfficialDiscoveryIndexQueue({
    keyOf: (item) => item.url,
    successTtlMs: 60_000,
    retryBackoffMs: 60_000,
    writeBatch: async () => {
      writes += 1;
      await blocked;
      return { status: "ready" };
    },
  });
  const item = document("https://example.test/one-write");
  assert.equal(queue.enqueue([item]).accepted, 1);
  await nextTurn();
  for (let index = 0; index < 100; index += 1) {
    assert.equal(queue.enqueue([item]).coalesced, 1);
  }
  assert.equal(queue.stats().pending, 0);
  releaseWrite();
  await queue.idle();
  assert.equal(writes, 1);
  assert.equal(queue.enqueue([item]).coalesced, 1);
});

test("official discovery indexing keeps richer pending evidence when a shorter duplicate arrives", async () => {
  let written;
  const queue = createOfficialDiscoveryIndexQueue({
    keyOf: (item) => item.url,
    maximumPending: 2.9,
    batchSize: 1.9,
    concurrency: 1.9,
    writeBatch: async (documents) => {
      [written] = documents;
      return { status: "ready" };
    },
  });
  const richBody = {
    ...document("https://example.test/rich", "A complete verified evidence body with material detail."),
    summary: "short",
  };
  const richSummary = {
    ...document("https://example.test/rich", "tiny"),
    summary: "A complete and useful summary that is longer than the first one.",
  };
  assert.deepEqual(queue.enqueue([richBody, richSummary]), {
    accepted: 1,
    coalesced: 1,
    dropped: 0,
    closed: false,
  });
  assert.deepEqual(queue.stats(), {
    active: 0,
    pending: 1,
    inflight: 0,
    recent: 0,
    retries: 0,
    acceptedInWindow: 1,
    clientsInWindow: 1,
    maximumPending: 2,
    acceptanceWindowMs: 7 * 24 * 60 * 60_000,
    maximumAcceptedPerWindow: 10_000,
    maximumAcceptedPerClient: 500,
    suppressionHistoryLimit: 10_000,
    batchSize: 1,
    concurrency: 1,
    closed: false,
  });
  await queue.idle();
  assert.equal(written.content, richBody.content);
  assert.equal(written.summary, richSummary.summary);
});

test("official discovery keeps every accepted URL suppressed through the success TTL", async () => {
  let currentTime = 100_000;
  let writes = 0;
  const queue = createOfficialDiscoveryIndexQueue({
    keyOf: (item) => item.url,
    maximumPending: 2_000,
    batchSize: 100,
    successTtlMs: 60_000,
    retryBackoffMs: 60_000,
    acceptanceWindowMs: 60_000,
    maximumAcceptedPerWindow: 5_000,
    maximumAcceptedPerClient: 5_000,
    clientScopeSecret: Buffer.alloc(32, 9),
    now: () => currentTime,
    writeBatch: async (documents) => {
      writes += documents.length;
      return { status: "ready", indexed: documents.length };
    },
  });
  const documents = Array.from({ length: 4_001 }, (_, index) => (
    document(`https://example.test/history-${index}`)
  ));

  assert.equal(queue.enqueue(documents.slice(0, 2_000), { clientKey: "client-a" }).accepted, 2_000);
  await queue.idle();
  assert.equal(queue.enqueue(documents.slice(2_000, 4_000), { clientKey: "client-a" }).accepted, 2_000);
  await queue.idle();
  assert.equal(queue.enqueue(documents.slice(4_000), { clientKey: "client-a" }).accepted, 1);
  await queue.idle();

  assert.equal(writes, 4_001);
  assert.equal(queue.stats().recent, 4_001);
  assert.deepEqual(queue.enqueue([documents[0]], { clientKey: "client-a" }), {
    accepted: 0,
    coalesced: 1,
    dropped: 0,
    closed: false,
  });
  await queue.idle();
  assert.equal(writes, 4_001);
  currentTime += 60_001;
  assert.equal(queue.enqueue([documents[0]], { clientKey: "client-a" }).accepted, 1);
  await queue.idle();
  assert.equal(writes, 4_002);
});

test("official discovery indexing enforces rolling process and client URL budgets", async () => {
  let currentTime = 10_000;
  const written = [];
  const queue = createOfficialDiscoveryIndexQueue({
    keyOf: (item) => item.url,
    acceptanceWindowMs: 2_000,
    maximumAcceptedPerWindow: 3,
    maximumAcceptedPerClient: 2,
    successTtlMs: 1_000,
    retryBackoffMs: 1_000,
    clientScopeSecret: Buffer.alloc(32, 7),
    now: () => currentTime,
    writeBatch: async (documents) => {
      written.push(...documents.map((item) => item.url));
      return { status: "ready" };
    },
  });

  assert.equal(queue.enqueue([
    document("https://example.test/a"),
    document("https://example.test/b"),
  ], { clientKey: "client-a" }).accepted, 2);
  assert.deepEqual(queue.enqueue([document("https://example.test/c")], { clientKey: "client-a" }), {
    accepted: 0,
    coalesced: 0,
    dropped: 1,
    closed: false,
  });
  assert.equal(queue.enqueue([document("https://example.test/c")], { clientKey: "client-b" }).accepted, 1);
  assert.equal(queue.enqueue([document("https://example.test/d")], { clientKey: "client-b" }).dropped, 1);
  await queue.idle();
  assert.deepEqual(new Set(written), new Set([
    "https://example.test/a",
    "https://example.test/b",
    "https://example.test/c",
  ]));
  assert.equal(queue.stats().acceptedInWindow, 3);
  assert.equal(queue.stats().clientsInWindow, 2);

  // Refreshing an already-counted URL does not consume another new-URL slot.
  currentTime += 1_001;
  assert.equal(queue.enqueue([document("https://example.test/a")], { clientKey: "client-b" }).accepted, 1);
  await queue.idle();
  assert.equal(queue.stats().acceptedInWindow, 3);

  // Once the retention-aligned window expires, both quotas are released.
  currentTime += 1_000;
  assert.equal(queue.enqueue([document("https://example.test/d")], { clientKey: "client-a" }).accepted, 1);
  await queue.idle();
  assert.equal(queue.stats().acceptedInWindow, 1);
  assert.equal(queue.stats().clientsInWindow, 1);
});

test("official discovery indexing records success TTL only after a completed write", async () => {
  let currentTime = 10_000;
  let writes = 0;
  const queue = createOfficialDiscoveryIndexQueue({
    keyOf: (item) => item.url,
    now: () => currentTime,
    successTtlMs: 1_000,
    retryBackoffMs: 1_000,
    writeBatch: async () => {
      writes += 1;
      return { status: writes === 1 ? "degraded" : "ready" };
    },
  });
  const item = document("https://example.test/retry");

  assert.equal(queue.enqueue([item]).accepted, 1);
  await queue.idle();
  assert.equal(writes, 1);
  assert.equal(queue.enqueue([item]).coalesced, 1);
  currentTime += 1_001;
  assert.equal(queue.enqueue([item]).accepted, 1);
  await queue.idle();
  assert.equal(writes, 2);
  assert.equal(queue.enqueue([item]).coalesced, 1);
  currentTime += 1_001;
  assert.equal(queue.enqueue([item]).accepted, 1);
  await queue.idle();
  assert.equal(writes, 3);
});

test("official discovery maintenance is coalesced into the same writer queue", async () => {
  let maintenanceRuns = 0;
  const queue = createOfficialDiscoveryIndexQueue({
    keyOf: (item) => item.url,
    writeBatch: async (documents, options) => {
      assert.deepEqual(documents, []);
      if (options.maintenance) maintenanceRuns += 1;
      return { status: "empty" };
    },
  });
  assert.equal(queue.scheduleMaintenance(), true);
  assert.equal(queue.scheduleMaintenance(), false);
  await queue.idle();
  assert.equal(maintenanceRuns, 1);
  assert.equal(queue.scheduleMaintenance(), false);
});

test("official discovery shutdown aborts the writer, drops pending work and refuses new jobs", async () => {
  let observedSignal;
  const queue = createOfficialDiscoveryIndexQueue({
    keyOf: (item) => item.url,
    batchSize: 1,
    writeBatch: (_documents, { signal }) => new Promise((resolve, reject) => {
      observedSignal = signal;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  });
  queue.enqueue([
    document("https://example.test/active"),
    document("https://example.test/pending"),
  ]);
  await nextTurn();
  assert.equal(queue.stats().active, 1);
  assert.equal(queue.stats().pending, 1);

  assert.equal(queue.stop(new DOMException("shutdown", "AbortError")), true);
  assert.equal(observedSignal.aborted, true);
  await queue.idle();
  assert.deepEqual(queue.enqueue([document("https://example.test/late")]), {
    accepted: 0,
    coalesced: 0,
    dropped: 1,
    closed: true,
  });
  assert.equal(queue.stats().active, 0);
  assert.equal(queue.stats().pending, 0);
  assert.equal(queue.stats().closed, true);
});
