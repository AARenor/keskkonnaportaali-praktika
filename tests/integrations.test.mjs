import assert from "node:assert/strict";
import test from "node:test";
import {
  articleText,
  createAbortableConcurrencyGate,
  fetchOfficialJsonDataset,
  readBoundedResponseText,
  validatedOfficialUrl,
} from "../server/integrations.mjs";

test("official discovery concurrency gate limits work and removes an aborted queued request", async () => {
  const gate = createAbortableConcurrencyGate(2);
  let active = 0;
  let maximumActive = 0;
  const completed = [];
  const tasks = Array.from({ length: 5 }, (_, index) => gate.run(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 8));
    completed.push(index);
    active -= 1;
    return index;
  }));
  assert.deepEqual(await Promise.all(tasks), [0, 1, 2, 3, 4]);
  assert.equal(maximumActive, 2);
  assert.deepEqual(gate.stats(), { active: 0, queued: 0, limit: 2 });

  const abortGate = createAbortableConcurrencyGate(1);
  let release;
  const blocker = abortGate.run(() => new Promise((resolve) => {
    release = resolve;
  }));
  const controller = new AbortController();
  const queued = abortGate.run(() => "must not run", { signal: controller.signal });
  controller.abort();
  await assert.rejects(queued, (error) => error?.name === "AbortError");
  assert.deepEqual(abortGate.stats(), { active: 1, queued: 0, limit: 1 });
  release("done");
  assert.equal(await blocker, "done");
});

test("an already aborted official request never returns a fresh or stale cache entry", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options = {}) => {
    calls += 1;
    if (options.signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
    return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const url = `https://ec.europa.eu/eurostat/api/cache-abort-test-${Date.now()}`;
    await fetchOfficialJsonDataset(url, { ttlMs: 60_000 });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      fetchOfficialJsonDataset(url, { ttlMs: 60_000, signal: controller.signal }),
      (error) => error?.name === "AbortError",
    );
    assert.equal(calls, 1);

    const staleUrl = `${url}-stale`;
    await fetchOfficialJsonDataset(staleUrl, { ttlMs: 0, staleMs: 60_000 });
    await assert.rejects(
      fetchOfficialJsonDataset(staleUrl, { ttlMs: 0, staleMs: 60_000, signal: controller.signal }),
      (error) => error?.name === "AbortError",
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("official fetch targets reject non-HTTPS and off-list redirect destinations", () => {
  assert.equal(
    validatedOfficialUrl("/et/mets", "https://keskkonnaportaal.ee/").toString(),
    "https://keskkonnaportaal.ee/et/mets",
  );
  assert.equal(
    validatedOfficialUrl("https://tableau.envir.ee/views/indicator.csv?:showVizHome=no").hostname,
    "tableau.envir.ee",
  );
  assert.throws(() => validatedOfficialUrl("http://keskkonnaportaal.ee/et/mets"), /allowlist/u);
  assert.throws(() => validatedOfficialUrl("https://example.com/collect"), /allowlist/u);
  for (const unsafe of [
    "https://localhost/private",
    "https://127.0.0.1/private",
    "https://[::1]/private",
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.1/private",
    "https://172.16.0.1/private",
    "https://192.168.1.1/private",
  ]) {
    assert.throws(() => validatedOfficialUrl(unsafe), /allowlist/u);
  }
});

test("chunked upstream bodies are stopped at the byte limit", async () => {
  const accepted = new Response("õhk", { headers: { "content-type": "text/plain" } });
  assert.equal(await readBoundedResponseText(accepted, 8), "õhk");

  const oversized = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("123"));
      controller.enqueue(new TextEncoder().encode("456"));
      controller.close();
    },
  }));
  await assert.rejects(readBoundedResponseText(oversized, 5), /too large/u);

  const declaredOversized = new Response("ok", { headers: { "content-length": "99" } });
  await assert.rejects(readBoundedResponseText(declaredOversized, 5), /too large/u);
});

test("hydrated article text restores spacing between adjacent styled sentences", () => {
  const text = articleText(`
    <main><article><p><span>Esimene lause.</span><strong>Teine lause!</strong><span>„Kolmas lause.”</span></p></article></main>
  `);
  assert.equal(text, "Esimene lause. Teine lause! „Kolmas lause.”");
});
