import assert from "node:assert/strict";
import test from "node:test";
import {
  articleText,
  createAbortableConcurrencyGate,
  fetchOfficialGeoJsonDataset,
  fetchOfficialJsonDataset,
  fetchOfficialPostgrestDataset,
  fetchOfficialPxwebDataset,
  fetchOfficialXmlDataset,
  getKeskkonnaportaalSuggestions,
  hydrationResourceMatches,
  hydrateOfficialDocuments,
  officialHydrationStats,
  officialSuggestionStats,
  parseVportalProjectionBody,
  projectVportalPayload,
  readBoundedResponseText,
  validatedOfficialUrl,
  vportalDocumentText,
} from "../server/integrations.mjs";
import {
  validateTerrapointPayload,
  validateTerrapointUrl,
} from "../server/terrapoint.mjs";
import { createByteBoundedLruCache } from "../server/upstream.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";

function vportalDocument(overrides = {}) {
  return {
    uri: "https://keskkonnaamet.ee/et/keskkonnaseire",
    title: "Keskkonnaseire",
    content_type: "Ametlik veebileht",
    created: "2026-08-25T00:00:00Z",
    lead_text: "<p>Juhtlõik</p>",
    highlighted: "<mark>Esiletõste</mark>",
    content: ["<p>Kontrollitud sisu</p>"],
    ignored_secret: "must-not-reach-cache",
    ...overrides,
  };
}

test("Vportal discovery validates and caches only a bounded versioned projection", () => {
  const projected = projectVportalPayload({
    response: { docs: [vportalDocument()], numFound: 1 },
    ignored_root: "must-not-reach-cache",
  });
  const serialized = JSON.stringify(projected);
  assert.equal(projected._schema, 1);
  assert.equal(projected.response.docs.length, 1);
  assert.deepEqual(Object.keys(projected.response.docs[0]).sort(), [
    "content_type",
    "created",
    "markup",
    "title",
    "uri",
  ]);
  assert.doesNotMatch(serialized, /ignored_secret|ignored_root|must-not-reach-cache/u);
  assert.doesNotMatch(serialized, /"content"|"lead_text"|"highlighted"/u);
  assert.match(projected.response.docs[0].markup, /Juhtlõik[\s\S]*Esiletõste[\s\S]*Kontrollitud sisu/u);
  assert.deepEqual(parseVportalProjectionBody(serialized), projected);
  assert.throws(
    () => parseVportalProjectionBody(JSON.stringify({ response: { docs: [] } })),
    /cache is invalid/u,
  );
});

test("Vportal discovery rejects excess documents and drops excess fragments before parsing", () => {
  assert.throws(() => projectVportalPayload({
    response: { docs: Array.from({ length: 7 }, () => vportalDocument()), numFound: 7 },
  }), /invalid payload/u);
  const capped = projectVportalPayload({
    response: {
      docs: [vportalDocument({
        content: [...Array.from({ length: 12 }, () => "<i>accepted</i>"), "DROPPED_FRAGMENT"],
      })],
      numFound: 1,
    },
  });
  assert.doesNotMatch(capped.response.docs[0].markup, /DROPPED_FRAGMENT/u);
  assert.throws(() => projectVportalPayload({
    response: { docs: [vportalDocument({ content: ["safe", { markup: "unsafe" }] })], numFound: 1 },
  }), /invalid document content/u);
});

test("Vportal projection caps cumulative UTF-8 markup and parses once per selected document", () => {
  const projected = projectVportalPayload({
    response: {
      docs: Array.from({ length: 6 }, (_value, index) => vportalDocument({
        uri: `https://keskkonnaamet.ee/et/keskkonnaseire-${index}`,
        lead_text: "",
        highlighted: "",
        content: Array.from({ length: 12 }, () => "🌲".repeat(20_000)),
      })),
      numFound: 6,
    },
  });
  const byteLengths = projected.response.docs.map((document) => Buffer.byteLength(document.markup, "utf8"));
  assert.equal(byteLengths.every((bytes) => bytes <= 48_000), true);
  assert.ok(byteLengths.reduce((sum, bytes) => sum + bytes, 0) <= 192_000);

  let parserCalls = 0;
  const text = vportalDocumentText(projected.response.docs[0], (markup, limit) => {
    parserCalls += 1;
    assert.ok(Buffer.byteLength(markup, "utf8") <= 48_000);
    assert.equal(limit, 48_000);
    return "kontrollitud tekst";
  });
  assert.equal(text, "kontrollitud tekst");
  assert.equal(parserCalls, 1);
});

test("official PostgREST retrieval pins and verifies the live API profile", async () => {
  let requestHeaders;
  const accepted = await fetchOfficialPostgrestDataset(
    "https://keskkonnaandmed.envir.ee/f_hydroseire?jaam_kood=eq.41025&limit=1&test=profile-ok",
    {
      requestText: async (_url, options) => {
        requestHeaders = options.headers;
        return {
          status: 200,
          body: "[]",
          url: _url,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "content-profile": "apijahiala",
          },
        };
      },
    },
  );
  assert.equal(accepted.body, "[]");
  assert.equal(requestHeaders.Accept, "application/json");
  assert.equal(requestHeaders["Accept-Profile"], "apijahiala");

  for (const [suffix, headers] of [
    ["wrong-profile", { "content-type": "application/json", "content-profile": "apijahialad" }],
    ["wrong-type", { "content-type": "text/html", "content-profile": "apijahiala" }],
  ]) {
    await assert.rejects(fetchOfficialPostgrestDataset(
      `https://keskkonnaandmed.envir.ee/f_hydroseire?jaam_kood=eq.41025&limit=1&test=${suffix}`,
      { requestText: async (url) => ({ status: 200, body: "[]", url, headers }) },
    ), /unexpected content contract/u);
  }

  const sharedUrl = "https://keskkonnaandmed.envir.ee/f_hydroseire?jaam_kood=eq.41025&limit=1&test=cache-contract";
  await fetchOfficialJsonDataset(sharedUrl, {
    requestText: async (url) => ({
      status: 200,
      body: '[{"unprofiled":true}]',
      url,
      headers: { "content-type": "application/json" },
    }),
  });
  let profiledCalls = 0;
  const profiled = await fetchOfficialPostgrestDataset(sharedUrl, {
    requestText: async (url) => {
      profiledCalls += 1;
      return {
        status: 200,
        body: "[]",
        url,
        headers: { "content-type": "application/json", "content-profile": "apijahiala" },
      };
    },
  });
  assert.equal(profiledCalls, 1);
  assert.equal(profiled.body, "[]");
});

test("official GeoJSON retrieval pins content type and exact WFS resource", async () => {
  const base = `https://gsavalik.envir.ee/geoserver/eelis/ows?service=WFS&request=GetFeature&test=${Date.now()}`;
  let accept;
  const accepted = await fetchOfficialGeoJsonDataset(base, {
    requestText: async (url, options) => {
      accept = options.headers.Accept;
      return {
        status: 200,
        body: '{"type":"FeatureCollection","features":[]}',
        url,
        headers: { "content-type": "application/json;charset=UTF-8" },
      };
    },
  });
  assert.match(accept, /application\/geo\+json/u);
  assert.match(accepted.body, /FeatureCollection/u);

  await assert.rejects(fetchOfficialGeoJsonDataset(`${base}-html`, {
    requestText: async (url) => ({
      status: 200,
      body: "<html></html>",
      url,
      headers: { "content-type": "text/html" },
    }),
  }), /unexpected content contract/u);
  await assert.rejects(fetchOfficialGeoJsonDataset(`${base}-redirect`, {
    requestText: async (url) => ({
      status: 200,
      body: '{"type":"FeatureCollection","features":[]}',
      url: `${url}&different=1`,
      headers: { "content-type": "application/geo+json" },
    }),
  }), /different resource/u);
});

test("official PXWeb retrieval posts a fingerprinted fixed JSON contract", async () => {
  const url = `https://andmed.stat.ee/api/v1/et/stat/KK048.PX?transport-test=${Date.now()}`;
  const payload = {
    query: [{ code: "Aasta", selection: { filter: "item", values: ["2024"] } }],
    response: { format: "json-stat2" },
  };
  let observed;
  const accepted = await fetchOfficialPxwebDataset(url, payload, {
    requestText: async (requestedUrl, options) => {
      observed = { requestedUrl, options };
      return {
        status: 200,
        url: requestedUrl,
        body: '{"class":"dataset","value":[654301]}',
        headers: { "content-type": "application/json; charset=utf-8" },
      };
    },
  });
  assert.match(accepted.body, /654301/u);
  assert.equal(observed.requestedUrl, url);
  assert.deepEqual(JSON.parse(observed.options.body), payload);
  assert.equal(observed.options.maximumBytes, 256_000);
  assert.equal(observed.options.maximumRedirects, 0);

  await assert.rejects(fetchOfficialPxwebDataset(`${url}-html`, payload, {
    requestText: async (requestedUrl) => ({
      status: 200,
      url: requestedUrl,
      body: "<html></html>",
      headers: { "content-type": "text/html" },
    }),
  }), /unexpected content contract/u);
  await assert.rejects(fetchOfficialPxwebDataset(`${url}-redirect`, payload, {
    requestText: async (requestedUrl) => ({
      status: 200,
      url: `${requestedUrl}&different=1`,
      body: '{"class":"dataset"}',
      headers: { "content-type": "application/json" },
    }),
  }), /different resource/u);
});

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

test("official XML datasets use a bounded XML-only retrieval profile", async () => {
  const url = `https://www.ilmateenistus.ee/ilma_andmed/xml/test-${Date.now()}.php`;
  let observed;
  const result = await fetchOfficialXmlDataset(url, {
    requestText: async (requestedUrl, options) => {
      observed = { requestedUrl, options };
      return {
        status: 200,
        url: requestedUrl,
        body: '<?xml version="1.0"?><observations timestamp="1787351000"></observations>',
      };
    },
  });
  assert.match(observed.options.headers.Accept, /^application\/xml,text\/xml/u);
  assert.equal(observed.options.headers["Accept-Encoding"], "identity");
  assert.equal(observed.options.maximumBytes, 2_000_000);
  assert.equal(observed.options.maximumRedirects, 3);
  assert.match(result.body, /<observations/u);
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
      getKeskkonnaportaalSuggestions(duplicate, 5, { requestText, clientKey: "client-a" }),
      getKeskkonnaportaalSuggestions(duplicate, 5, { requestText, clientKey: "client-b" }),
    ]);
    assert.equal(calls - beforeDuplicate, 1);
    assert.deepEqual(left.suggestions, right.suggestions);

    await Promise.all(Array.from({ length: 5 }, (_value, index) => (
      getKeskkonnaportaalSuggestions(`ohk-${nonce}-${index}`, 5, {
        requestText,
        clientKey: `load-client-${index}`,
      })
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

test("autocomplete reserves capacity for another client and bounds one client's queue", async () => {
  const nonce = `${Date.now()}-${Math.random()}`;
  const pending = new Map();
  const started = [];
  const requestText = (url, options = {}) => {
    const query = new URL(url).searchParams.get("q");
    started.push(query);
    return new Promise((resolve, reject) => {
      const finish = () => resolve({
        status: 200,
        body: `[{"value":"${query}","label":"<span class=results-count>1</span>"}]`,
      });
      pending.set(query, finish);
      options.signal?.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    });
  };
  const waitFor = async (predicate) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.fail("autocomplete fairness condition did not become true");
  };
  const names = {
    a1: `a1-${nonce}`,
    a2: `a2-${nonce}`,
    a3: `a3-${nonce}`,
    a4: `a4-${nonce}`,
    b1: `b1-${nonce}`,
  };
  const a1 = getKeskkonnaportaalSuggestions(names.a1, 5, { requestText, clientKey: "client-a" });
  await waitFor(() => pending.has(names.a1));
  const a2 = getKeskkonnaportaalSuggestions(names.a2, 5, { requestText, clientKey: "client-a" });
  const a3 = getKeskkonnaportaalSuggestions(names.a3, 5, { requestText, clientKey: "client-a" });
  await waitFor(() => officialSuggestionStats().queued >= 2);
  await assert.rejects(
    getKeskkonnaportaalSuggestions(names.a4, 5, { requestText, clientKey: "client-a" }),
    (error) => error?.code === "SUGGESTION_CAPACITY",
  );

  const b1 = getKeskkonnaportaalSuggestions(names.b1, 5, { requestText, clientKey: "client-b" });
  await waitFor(() => pending.has(names.b1));
  assert.equal(started.includes(names.a2), false);
  assert.equal(started.includes(names.a3), false);
  pending.get(names.b1)();
  assert.equal((await b1).suggestions[0].value, names.b1);

  pending.get(names.a1)();
  await a1;
  await waitFor(() => pending.has(names.a2) || pending.has(names.a3));
  const next = pending.has(names.a2) ? names.a2 : names.a3;
  pending.get(next)();
  await (next === names.a2 ? a2 : a3);
  const last = next === names.a2 ? names.a3 : names.a2;
  await waitFor(() => pending.has(last));
  pending.get(last)();
  await (last === names.a2 ? a2 : a3);
  await waitFor(() => officialSuggestionStats().active === 0 && officialSuggestionStats().queued === 0);
  assert.equal(officialSuggestionStats().active, 0);
  assert.equal(officialSuggestionStats().queued, 0);
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
