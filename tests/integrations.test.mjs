import assert from "node:assert/strict";
import test from "node:test";
import {
  articleText,
  createAbortableConcurrencyGate,
  fetchOfficialJsonDataset,
  getKeskkonnaportaalSuggestions,
  hydrationResourceMatches,
  hydrateOfficialDocuments,
  officialHydrationStats,
  officialSuggestionStats,
  readBoundedResponseText,
  validatedOfficialUrl,
} from "../server/integrations.mjs";
import {
  validateTerrapointPayload,
  validateTerrapointUrl,
} from "../server/terrapoint.mjs";
import { createByteBoundedLruCache } from "../server/upstream.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";

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

  const boundedGate = createAbortableConcurrencyGate(1, { maximumQueue: 1 });
  let releaseBounded;
  const activeTask = boundedGate.run(() => new Promise((resolve) => { releaseBounded = resolve; }));
  const waiting = boundedGate.run(() => "queued");
  await assert.rejects(boundedGate.run(() => "overflow"), (error) => error?.code === "UPSTREAM_CAPACITY");
  releaseBounded("active");
  assert.equal(await activeTask, "active");
  assert.equal(await waiting, "queued");
});

test("official hydration globally bounds concurrency and coalesces duplicate URLs", async () => {
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const requestText = async (_url, options = {}) => {
    calls += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 12);
        options.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted", "AbortError"));
        }, { once: true });
      });
      return {
        status: 200,
        body: `<main><p>${"Ametliku keskkonnaseire kontrollitud sisu. ".repeat(8)}</p></main>`,
      };
    } finally {
      active -= 1;
    }
  };
  const nonce = Date.now();
    const documents = Array.from({ length: 20 }, (_, index) => ({
      id: `hydrate-${index}`,
      title: `Allikas ${index}`,
      url: `https://ec.europa.eu/environment/hydration-${nonce}-${index}`,
    }));
    const hydrated = await Promise.all(Array.from({ length: 4 }, (_value, batch) => (
      hydrateOfficialDocuments(documents.slice(batch * 5, batch * 5 + 5), 5, {
        timeoutMs: 1_000,
        requestText,
      })
    )));
    assert.equal(hydrated.flat().every((document) => document.content?.length >= 120), true);
    assert.ok(maximumActive <= 4, `maximum hydration concurrency was ${maximumActive}`);
    assert.deepEqual(officialHydrationStats(), { active: 0, queued: 0, limit: 4, inflight: 0 });

    const duplicateUrl = `https://ec.europa.eu/environment/hydration-${nonce}-duplicate`;
    const beforeDuplicate = calls;
    await Promise.all([
      hydrateOfficialDocuments([{ id: "duplicate-a", title: "A", url: duplicateUrl }], 1, {
        timeoutMs: 1_000,
        requestText,
      }),
      hydrateOfficialDocuments([{ id: "duplicate-b", title: "B", url: duplicateUrl }], 1, {
        timeoutMs: 1_000,
        requestText,
      }),
    ]);
    assert.equal(calls - beforeDuplicate, 1);
    assert.deepEqual(officialHydrationStats(), { active: 0, queued: 0, limit: 4, inflight: 0 });
});

test("approved page fetch replaces index prose but cannot self-promote a federated card", async () => {
  const indexSentinel = "INDEX_ONLY_SECRET";
  const pageSentinel = "FETCHED_PAGE_EVIDENCE";
  const federated = {
    id: "federated-promotion",
    title: "Ametlik otsingukaart",
    url: `https://ec.europa.eu/environment/promotion-${Date.now()}`,
    summary: `${indexSentinel} otsingu kokkuvõte`,
    excerpt: `${indexSentinel} esiletõste`,
    content: `${indexSentinel} ${"indekseeritud tekst ".repeat(20)}`,
    sourceTier: "official",
    retrieval: "official-federated-search",
    delivery: "federated-discovery",
    evidencePolicy: "route-only",
    _answerEvidenceEligible: false,
  };
  const [hydratedCard] = await hydrateOfficialDocuments([federated], 1, {
    requestText: async () => ({
      status: 200,
      body: `<main><article><p>${pageSentinel} ${"kontrollitud lehesisu ".repeat(20)}</p></article></main>`,
    }),
  });
  assert.equal(hydratedCard.retrieval, "official-federated-search");
  assert.equal(hydratedCard.evidencePolicy, "route-only");
  assert.equal(hydratedCard._answerEvidenceEligible, false);
  assert.equal(hydratedCard._pageHydrated, true);
  assert.equal(sourceEvidenceEligibility(hydratedCard).eligible, false);
  assert.match(hydratedCard.content, new RegExp(pageSentinel, "u"));
  assert.match(hydratedCard.summary, new RegExp(pageSentinel, "u"));
  assert.doesNotMatch(`${hydratedCard.summary} ${hydratedCard.excerpt || ""} ${hydratedCard.content}`, new RegExp(indexSentinel, "u"));
  assert.match(hydratedCard._contentHash, /^[a-f0-9]{64}$/u);

  const knownRouteOnly = {
    ...federated,
    id: "known-directory",
    retrieval: "catalogue-directory",
    content: "",
  };
  const [stillRouteOnly] = await hydrateOfficialDocuments([knownRouteOnly], 1, {
    requestText: async () => ({
      status: 200,
      body: `<main><p>${pageSentinel} ${"kontrollitud lehesisu ".repeat(20)}</p></main>`,
    }),
  });
  assert.equal(stillRouteOnly.evidencePolicy, "route-only");
  assert.equal(stillRouteOnly._answerEvidenceEligible, false);
  assert.equal(stillRouteOnly._pageHydrated, undefined);
});

test("official hydration never attributes or caches a redirected resource under the requested URL", async () => {
  const nonce = Date.now();
  const requestedUrl = `https://ec.europa.eu/environment/requested-${nonce}`;
  const otherUrl = `https://ec.europa.eu/environment/other-${nonce}`;
  const wrongSentinel = "WRONG_REDIRECT_RESOURCE";
  const rightSentinel = "MATCHED_RESOURCE_BODY";
  const document = {
    id: "redirect-attribution",
    title: "Requested identity",
    url: requestedUrl,
    sourceTier: "official",
    retrieval: "official-federated-search",
    delivery: "federated-discovery",
    evidencePolicy: "route-only",
    _answerEvidenceEligible: false,
  };
  assert.equal(hydrationResourceMatches(`${requestedUrl}/`, requestedUrl), true);
  assert.equal(hydrationResourceMatches(requestedUrl, otherUrl), false);

  let calls = 0;
  const [rejected] = await hydrateOfficialDocuments([document], 1, {
    requestText: async () => {
      calls += 1;
      return {
        status: 200,
        url: otherUrl,
        body: `<main><p>${`${wrongSentinel} `.repeat(20)}</p></main>`,
      };
    },
  });
  assert.equal(rejected._pageHydrated, undefined);
  assert.doesNotMatch(String(rejected.content || ""), new RegExp(wrongSentinel, "u"));

  const [hydrated] = await hydrateOfficialDocuments([document], 1, {
    requestText: async () => {
      calls += 1;
      return {
        status: 200,
        url: requestedUrl,
        body: `<main><p>${`${rightSentinel} `.repeat(20)}</p></main>`,
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(hydrated._pageHydrated, true);
  assert.match(hydrated.content, new RegExp(rightSentinel, "u"));
  assert.doesNotMatch(hydrated.content, new RegExp(wrongSentinel, "u"));
});

test("an eligible exact-resource page replacement is rebound to a fresh content version", async () => {
  const url = `https://ec.europa.eu/environment/versioned-hydration-${Date.now()}`;
  const before = Date.now();
  const [hydrated] = await hydrateOfficialDocuments([{
    id: "eligible-page",
    title: "Eligible official page",
    url,
    sourceTier: "official",
    retrieval: "catalogue-directory",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    freshness: { requiresSourceTimestamp: false },
  }], 1, {
    requestText: async () => ({
      status: 200,
      url,
      body: `<main><p>${"Verified exact official page body. ".repeat(12)}</p></main>`,
    }),
  });
  assert.equal(hydrated.retrieval, "approved-page-hydration");
  assert.equal(hydrated.evidencePolicy, "versioned");
  assert.equal(hydrated._answerEvidenceEligible, true);
  assert.equal(hydrated._evidenceVersion, hydrated._contentHash);
  assert.match(hydrated._evidenceStatusAt, /^\d{4}-\d{2}-\d{2}T/u);
  const observedAt = Date.parse(hydrated._evidenceStatusAt);
  assert.ok(observedAt >= before && observedAt <= Date.now());
  assert.equal(sourceEvidenceEligibility(hydrated, { now: observedAt }).eligible, true);
  assert.equal(sourceEvidenceEligibility(hydrated, {
    now: observedAt + 8 * 24 * 60 * 60 * 1_000,
  }).eligible, false);
});

test("approved page cache hits retain the original fetch observation time", async () => {
  const originalNow = Date.now;
  let now = 1_800_000_000_000;
  Date.now = () => now;
  const url = `https://ec.europa.eu/environment/cache-observation-${originalNow()}`;
  const document = {
    id: "eligible-cached-page",
    title: "Eligible cached official page",
    url,
    sourceTier: "official",
    retrieval: "catalogue-directory",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    freshness: { requiresSourceTimestamp: false },
  };
  let calls = 0;
  const requestText = async () => {
    calls += 1;
    return {
      status: 200,
      url,
      body: `<main><p>${"Verified cached official page body. ".repeat(12)}</p></main>`,
    };
  };
  try {
    const [first] = await hydrateOfficialDocuments([document], 1, { requestText });
    now += 20 * 60 * 1_000;
    const [second] = await hydrateOfficialDocuments([document], 1, { requestText });
    assert.equal(calls, 1);
    assert.equal(second._evidenceStatusAt, first._evidenceStatusAt);
    assert.equal(Date.parse(first._evidenceStatusAt), 1_800_000_000_000);
  } finally {
    Date.now = originalNow;
  }
});

test("stale hydration fallback remains navigation-only and never becomes answer evidence", async () => {
  const originalNow = Date.now;
  let now = 1_800_000_000_000;
  Date.now = () => now;
  const url = `https://ec.europa.eu/environment/stale-hydration-${originalNow()}`;
  const document = {
    id: "stale-card",
    title: "Ametlik otsingukaart",
    url,
    summary: "Otsingukaardi tekst",
    sourceTier: "official",
    retrieval: "official-federated-search",
    delivery: "federated-discovery",
    evidencePolicy: "route-only",
    _answerEvidenceEligible: false,
  };
  let available = true;
  const requestText = async () => {
    if (!available) throw new Error("upstream unavailable");
    return { status: 200, body: `<main><p>${"Kontrollitud värske lehesisu. ".repeat(12)}</p></main>` };
  };
  try {
    const [fresh] = await hydrateOfficialDocuments([document], 1, { requestText });
    assert.equal(fresh._pageHydrated, true);
    assert.equal(fresh.stale, false);
    assert.equal(sourceEvidenceEligibility(fresh).eligible, false);

    available = false;
    now += 31 * 60_000;
    const [stale] = await hydrateOfficialDocuments([document], 1, { requestText });
    assert.equal(stale.stale, true);
    assert.equal(stale._pageHydrated, undefined);
    assert.equal(stale.evidencePolicy, "route-only");
    assert.equal(stale._answerEvidenceEligible, false);
    assert.equal(sourceEvidenceEligibility(stale).eligible, false);

    now += 24 * 60 * 60_000;
    const [expired] = await hydrateOfficialDocuments([document], 1, { requestText });
    assert.equal(expired._pageHydrated, undefined);
    assert.equal(sourceEvidenceEligibility(expired).eligible, false);
  } finally {
    Date.now = originalNow;
  }
});

test("an already aborted official request never returns a fresh or stale cache entry", async () => {
  let calls = 0;
  const requestText = async (_url, options = {}) => {
    calls += 1;
    if (options.signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
    return { status: 200, body: '{"ok":true}' };
  };
  const url = `https://ec.europa.eu/eurostat/api/cache-abort-test-${Date.now()}`;
    await fetchOfficialJsonDataset(url, { ttlMs: 60_000, requestText });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      fetchOfficialJsonDataset(url, { ttlMs: 60_000, signal: controller.signal, requestText }),
      (error) => error?.name === "AbortError",
    );
    assert.equal(calls, 1);

    const staleUrl = `${url}-stale`;
    await fetchOfficialJsonDataset(staleUrl, { ttlMs: 0, staleMs: 60_000, requestText });
    await assert.rejects(
      fetchOfficialJsonDataset(staleUrl, {
        ttlMs: 0,
        staleMs: 60_000,
        signal: controller.signal,
        requestText,
      }),
      (error) => error?.name === "AbortError",
    );
    assert.equal(calls, 2);
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
  assert.throws(() => validatedOfficialUrl("https://ec.europa.eu:444/private"), /allowlist/u);
  assert.throws(() => validatedOfficialUrl("https://user:secret@ec.europa.eu/private"), /allowlist/u);
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

  let produced = 0;
  let cancelled = false;
  const deceptive = new Response(new ReadableStream({
    pull(controller) {
      produced += 1;
      controller.enqueue(new TextEncoder().encode("123"));
      if (produced >= 10) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  }), { headers: { "content-length": "1" } });
  await assert.rejects(readBoundedResponseText(deceptive, 5), /too large/u);
  assert.equal(cancelled, true);
  assert.ok(produced < 10);
});

test("byte-bounded caches evict by aggregate retained size", () => {
  const cache = createByteBoundedLruCache({
    maximumEntries: 10,
    maximumBytes: 10,
    sizeOf: (value) => Buffer.byteLength(value),
  });
  assert.equal(cache.set("a", "123456"), true);
  assert.equal(cache.set("b", "abcdef"), true);
  assert.equal(cache.has("a"), false);
  assert.deepEqual(cache.stats(), {
    entries: 1,
    retainedBytes: 6,
    maximumEntries: 10,
    maximumBytes: 10,
  });
  assert.equal(cache.set("oversized", "x".repeat(11)), false);
  assert.ok(cache.stats().retainedBytes <= 10);
});

test("autocomplete coalesces identical work, bounds concurrency and aborts its last waiter", async () => {
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  let aborted = 0;
  const requestText = async (_url, options = {}) => {
    calls += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 15);
        options.signal?.addEventListener("abort", () => {
          aborted += 1;
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted", "AbortError"));
        }, { once: true });
      });
      return {
        status: 200,
        body: '[{"value":"Metsa seire","label":"<span class=results-count>3</span>"}]',
      };
    } finally {
      active -= 1;
    }
  };
  const nonce = `${Date.now()}-${Math.random()}`;
    const duplicate = `mets-${nonce}`;
    const beforeDuplicate = calls;
    const [left, right] = await Promise.all([
      getKeskkonnaportaalSuggestions(duplicate, 5, { requestText }),
      getKeskkonnaportaalSuggestions(duplicate, 5, { requestText }),
    ]);
    assert.equal(calls - beforeDuplicate, 1);
    assert.deepEqual(left.suggestions, right.suggestions);

    await Promise.all(Array.from({ length: 5 }, (_value, index) => (
      getKeskkonnaportaalSuggestions(`ohk-${nonce}-${index}`, 5, { requestText })
    )));
    assert.ok(maximumActive <= 2, `maximum autocomplete concurrency was ${maximumActive}`);

    const controller = new AbortController();
    const disconnected = getKeskkonnaportaalSuggestions(`disconnect-${nonce}`, 5, {
      signal: controller.signal,
      requestText,
    });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    await assert.rejects(disconnected, (error) => error?.name === "AbortError");
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(aborted >= 1);
    assert.equal(officialSuggestionStats().inflight, 0);
    assert.ok(officialSuggestionStats().cache.retainedBytes <= officialSuggestionStats().cache.maximumBytes);
});

test("autocomplete uses the canonical bounded query and rejects NFKC expansion", async () => {
  let calls = 0;
  let requestedQuery = "";
  const requestText = async (url) => {
    calls += 1;
    requestedQuery = new URL(url).searchParams.get("q") || "";
    return { status: 200, body: "[]" };
  };
  const nonce = `${Date.now()}-${Math.random()}`;
  await getKeskkonnaportaalSuggestions(`Ｍｅｔｓ-${nonce}`, 5, { requestText });
  assert.equal(requestedQuery, `mets-${nonce}`);

  const expanding = `${"ﬃ".repeat(75)} x`;
  assert.equal(expanding.length, 77);
  const rejected = await getKeskkonnaportaalSuggestions(expanding, 5, { requestText });
  assert.deepEqual(rejected, { suggestions: [], cache: "rejected" });
  assert.equal(calls, 1);
});

test("Terrapoint payloads have endpoint-specific schema and cardinality limits", () => {
  const address = validateTerrapointPayload({ results: [{
    katastri_nr: "12345:678:9012",
    aadress: "  Pärnu   mnt 10 ",
    asula: "Tallinn",
    unknown: "must not cross the proxy",
  }] }, "address");
  assert.deepEqual(address, { results: [{
    katastri_nr: "12345:678:9012",
    aadress: "Pärnu mnt 10",
    asula: "Tallinn",
    vald: "",
    maakond: "",
  }] });
  assert.throws(
    () => validateTerrapointPayload({ results: Array.from({ length: 51 }, () => ({
      katastri_nr: "12345:678:9012",
      aadress: "Pärnu mnt 10",
    })) }, "address"),
    /invalid address result set/u,
  );
  const parcel = validateTerrapointPayload({
    kataster: {
      number: "12345:678:9012",
      l_aadress: "Pärnu mnt 10",
      pindala_ha: "12,5",
      mets_pindala_ha: 2,
      centroid: { longitude: "24.75", latitude: 59.43 },
      ignored: { private: "field" },
    },
    spatial_status: {
      natura_2000: { intersects: false, ignored: true },
      kaitseala: { intersects: true },
    },
    ignored: "top-level",
  }, "parcel", { expectedNumber: "12345:678:9012" });
  assert.deepEqual(parcel, {
    kataster: {
      number: "12345:678:9012",
      l_aadress: "Pärnu mnt 10",
      pindala_ha: 12.5,
      sihtotstarve: "",
      mets_pindala_ha: 2,
      omvorm: "",
      centroid: { longitude: 24.75, latitude: 59.43 },
    },
    spatial_status: {
      natura_2000: { intersects: false },
      kaitseala: { intersects: true },
    },
  });
  assert.throws(
    () => validateTerrapointPayload({ kataster: { number: "99999:999:9999" } }, "parcel", {
      expectedNumber: "12345:678:9012",
    }),
    /does not match/u,
  );
  assert.throws(() => validateTerrapointPayload({ kataster: {} }, "parcel"), /invalid parcel/u);
  assert.throws(
    () => validateTerrapointPayload({ kataster: {
      number: "12345:678:9012",
      l_aadress: { rendered: "unsafe" },
    } }, "parcel"),
    /invalid parcel address/u,
  );
  assert.throws(
    () => validateTerrapointPayload({
      kataster: { number: "12345:678:9012" },
      spatial_status: { natura_2000: { intersects: "false" } },
    }, "parcel"),
    /invalid Natura 2000 intersection/u,
  );
  for (const centroid of [
    { longitude: 181, latitude: 59 },
    { longitude: 24, latitude: -91 },
    { longitude: "Infinity", latitude: 59 },
  ]) {
    assert.throws(
      () => validateTerrapointPayload({
        kataster: { number: "12345:678:9012", centroid },
      }, "parcel"),
      /invalid parcel (?:longitude|latitude)/u,
    );
  }
});

test("Terrapoint base stays on its approved HTTPS origin", () => {
  assert.equal(
    validateTerrapointUrl("https://terrapoint.ee/custom/", { base: true }).toString(),
    "https://terrapoint.ee/custom",
  );
  for (const unsafe of [
    "http://terrapoint.ee",
    "https://user:secret@terrapoint.ee",
    "https://www.terrapoint.ee",
    "https://terrapoint.ee.evil.test",
    "https://127.0.0.1",
  ]) {
    assert.throws(() => validateTerrapointUrl(unsafe), /Terrapoint|TERRAPOINT/u);
  }
  assert.throws(
    () => validateTerrapointUrl("https://terrapoint.ee/base?target=other", { base: true }),
    /query parameters/u,
  );

});

test("hydrated article text restores spacing between adjacent styled sentences", () => {
  const text = articleText(`
    <main><article><p><span>Esimene lause.</span><strong>Teine lause!</strong><span>„Kolmas lause.”</span></p></article></main>
  `);
  assert.equal(text, "Esimene lause. Teine lause! „Kolmas lause.”");
});
