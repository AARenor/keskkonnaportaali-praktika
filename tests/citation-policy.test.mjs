import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import {
  officialCitationUrlEligibility,
} from "../server/citation-policy.mjs";
import {
  SEARCH_CACHE_MAX_RESPONSE_BYTES,
  restoreCachedResponse,
  sanitizeCachedResponse,
} from "../server/database.mjs";
import { publicResponse } from "../server/pipeline.mjs";
import { evidenceDocumentsFromListing } from "../server/retrieval.mjs";
import { sourceCanSupportPublicCitation } from "../server/source-registry.mjs";
import { sourceResourceKey, sourceWitnessKey, sameSourceResource } from "../server/source-identity.mjs";
import { officialServiceCatalogueDocuments } from "../server/search.mjs";
import { smiStructuredDocument } from "../server/smi-tables.mjs";
import { buildEvidencePack } from "../server/evidence-pack.mjs";
import { currentWeatherObservationFromXml } from "../server/indicators.mjs";

function source(overrides = {}) {
  return {
    id: "official-source",
    citation: 1,
    title: "Ametlik allikas",
    organization: "Keskkonnaagentuur",
    type: "Andmed",
    url: "https://keskkonnaandmed.envir.ee/f_kliima_paev?jaam_kood=eq.AJVORU01#result",
    sourceTier: "official",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    summary: "Kontrollitud ametlik lähteandmestik.",
    ...overrides,
  };
}

function citedDraft(sources) {
  return {
    query: "kontrollitud küsimus",
    total: sources.length,
    answer: {
      eyebrow: "Kontrollitud vastus",
      title: "Kontrollitud fakt",
      intro: "Fakt pärineb ametlikust allikast.",
      introCitations: [1],
      parts: [],
      note: "Kontrolli algallikat.",
    },
    sources,
    evidence: { kind: "test", answerable: true },
  };
}

test("citation policy accepts dynamic official queries and reviewed PDF fragments", () => {
  const urls = [
    "https://keskkonnaandmed.envir.ee/f_rahvalad?nimi=eq.Lahemaa%20loodusala&limit=2",
    "https://keskkonnaandmed.envir.ee/f_kliima_paev?jaam_kood=eq.AJVORU01&aasta=eq.2025",
    "https://andmed.stat.ee/et/stat/keskkond__surve-keskkonnaseisundile__jaatmete-teke/KK610",
    "https://keskkonnaportaal.ee/sites/default/files/2026-01/SMI%20arendamine.pdf#page=22",
  ];
  for (const url of urls) assert.equal(officialCitationUrlEligibility(url).eligible, true, url);
});

test("citation policy rejects unsafe schemes, credentials, private and unapproved origins", () => {
  const urls = [
    "javascript:alert(1)",
    "http://keskkonnaportaal.ee/andmed",
    "https://user:pass@keskkonnaportaal.ee/andmed",
    "https://keskkonnaportaal.ee.evil.example/andmed",
    "https://evil.example/andmed",
    "https://127.0.0.1/andmed",
    "https://[::1]/andmed",
    "https://keskkonnaportaal.ee:8443/andmed",
    "not a URL",
    `https://keskkonnaportaal.ee/${"x".repeat(2_001)}`,
  ];
  for (const url of urls) assert.equal(officialCitationUrlEligibility(url).eligible, false, url);
});

test("public evidence excludes an otherwise eligible record from an unapproved origin", () => {
  const forged = source({ url: "https://evil.example/forged" });
  assert.equal(sourceCanSupportPublicCitation(forged).eligible, false);
  assert.deepEqual(evidenceDocumentsFromListing({ items: [forged] }), []);
  assert.equal(evidenceDocumentsFromListing({ items: [source()] }).length, 1);
});

test("public response fails closed for an invalid cited URL and drops invalid uncited URLs", () => {
  const forged = source({ url: "javascript:alert(1)" });
  const failed = publicResponse(citedDraft([forged]));
  assert.equal(failed.answer.title, "Allikaviiteid ei saanud kontrollida");
  assert.deepEqual(failed.sources, []);

  const valid = source();
  const uncitedForged = source({ id: "uncited-forged", citation: 2, url: "https://evil.example/phish" });
  const response = publicResponse(citedDraft([valid, uncitedForged]));
  assert.deepEqual(response.sources.map((item) => item.id), [valid.id]);
  assert.deepEqual(response.answer.introCitations, [1]);
});

test("public response rejects cited sources without an eligible evidence policy", () => {
  const ineligibleSources = [
    source({ evidencePolicy: "route-only", _answerEvidenceEligible: false }),
    source({ evidencePolicy: undefined, _answerEvidenceEligible: true }),
    source({ evidencePolicy: "trusted", _answerEvidenceEligible: true }),
  ];
  for (const ineligible of ineligibleSources) {
    assert.equal(sourceCanSupportPublicCitation(ineligible).eligible, false);
    assert.deepEqual(evidenceDocumentsFromListing({ items: [ineligible] }), []);
    const response = publicResponse(citedDraft([ineligible]));
    assert.equal(response.answer.title, "Allikaviiteid ei saanud kontrollida");
    assert.deepEqual(response.sources, []);
  }

  const valid = publicResponse(citedDraft([source()]));
  assert.equal(valid.answer.title, "Kontrollitud fakt");
  assert.equal(valid.sources.length, 1);

  const uncitedRouteOnly = source({
    id: "route-only-discovery",
    citation: 2,
    evidencePolicy: "route-only",
    _answerEvidenceEligible: false,
  });
  const withDiscovery = publicResponse(citedDraft([source(), uncitedRouteOnly]));
  assert.equal(withDiscovery.answer.title, "Kontrollitud fakt");
  assert.deepEqual(withDiscovery.sources.map((item) => item.citation), [1]);
});

test("public response requires citation identifiers to be actual positive JSON integers", () => {
  for (const malformed of ["1", " 1 ", ["1"], 1.5, 0, -1, null, true]) {
    const draft = citedDraft([source()]);
    draft.answer.introCitations = [malformed];
    const response = publicResponse(draft);
    assert.equal(response.answer.title, "Allikaviiteid ei saanud kontrollida", JSON.stringify(malformed));
    assert.deepEqual(response.sources, []);
  }

  const malformedSource = citedDraft([source({ citation: "1" })]);
  const response = publicResponse(malformedSource);
  assert.equal(response.answer.title, "Allikaviiteid ei saanud kontrollida");
  assert.deepEqual(response.sources, []);
});

test("privacy-safe cache round trips retain citation policy privately and revalidate freshness", () => {
  const query = "roostiku ülevaade";
  const now = Date.parse("2026-08-23T12:00:00Z");
  const candidates = [
    source(),
    source({
      evidencePolicy: "timestamped",
      retrieval: "official-structured-weather-xml",
      freshness: { class: "live", basis: "source-observed-at", maxAgeMs: 15 * 60_000, requiresSourceTimestamp: true },
      _evidenceObservedAt: "2026-08-23T11:55:00Z",
    }),
    source({
      evidencePolicy: "versioned",
      retrieval: "official-service-directory",
      freshness: { class: "reviewed", basis: "reviewed-at", maxAgeMs: 31 * 24 * 60 * 60_000, requiresSourceTimestamp: true },
      _evidenceVersion: "reviewed-v1",
      _evidenceStatusAt: "2026-08-23T00:00:00Z",
    }),
  ];

  for (const candidate of candidates) {
    const safe = sanitizeCachedResponse(citedDraft([candidate]), query);
    assert.ok(safe);
    const restored = restoreCachedResponse(safe, query);
    assert.equal(sourceCanSupportPublicCitation(restored.sources[0], { now }).eligible, true);
    const publicCached = publicResponse(restored, { now });
    assert.equal(publicCached.answer.title, "Kontrollitud fakt");
    assert.equal(publicCached.sources.length, 1);
    for (const hidden of [
      "evidencePolicy", "_answerEvidenceEligible", "freshness", "retrieval", "delivery",
      "_evidenceObservedAt", "_evidenceValidFrom", "_evidenceValidUntil", "_evidenceVersion",
      "_evidenceStatusAt", "_publishedAt",
    ]) assert.equal(hidden in publicCached.sources[0], false, hidden);
  }

  const timestamped = candidates[1];
  const stale = restoreCachedResponse(sanitizeCachedResponse(citedDraft([timestamped]), query), query);
  assert.equal(sourceCanSupportPublicCitation(stale.sources[0], { now: now + 20 * 60_000 }).eligible, false);
  assert.equal(
    publicResponse(stale, { now: now + 20 * 60_000 }).answer.title,
    "Allikaviiteid ei saanud kontrollida",
  );

  const federated = source({
    evidencePolicy: "claim-specific",
    retrieval: "official-federated-search",
    delivery: "federated-discovery",
  });
  const restoredFederated = restoreCachedResponse(
    sanitizeCachedResponse(citedDraft([federated]), query),
    query,
  );
  assert.equal(sourceCanSupportPublicCitation(restoredFederated.sources[0], { now }).eligible, false);
});

test("privacy-safe cache envelope has a total UTF-8 byte ceiling", () => {
  const oversized = citedDraft(Array.from({ length: 10 }, (_value, index) => source({
    id: `source-${index}`,
    citation: index + 1,
    title: "🌊".repeat(500),
    summary: "🌲".repeat(2_000),
    evidenceExcerpt: "🌧️".repeat(4_000),
    url: `https://keskkonnaportaal.ee/et/source-${index}`,
  })));
  oversized.answer.introCitations = [];
  oversized.answer.parts = [];
  assert.ok(Buffer.byteLength(JSON.stringify(oversized), "utf8") > SEARCH_CACHE_MAX_RESPONSE_BYTES);
  assert.equal(sanitizeCachedResponse(oversized, "roostiku ülevaade"), null);
});

test("an invalid optional action URL is omitted without suppressing a valid citation", () => {
  const response = publicResponse(citedDraft([source({
    actionUrl: "https://evil.example/action",
    actionLabel: "Ava tegevus",
  })]));
  assert.equal(response.answer.title, "Kontrollitud fakt");
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].actionUrl, undefined);
  assert.equal(response.sources[0].actionLabel, undefined);
});

function chartFor(citation) {
  return {
    kind: "line",
    title: "Test",
    unit: "%",
    series: [{ id: "a", label: "A", points: [{ x: 2020, y: 1 }, { x: 2021, y: 2 }] }],
    citation,
  };
}

test("publicResponse keeps a valid chart, remaps its citation and drops an invalid one", () => {
  const uncited = source({ id: "uncited", citation: 1, url: "https://keskkonnaportaal.ee/et/uncited" });
  const cited = source({ id: "cited", citation: 2, url: "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI%20tulemused%202025/SMI%202025%20tulemused.xlsx" });
  const draft = {
    ...citedDraft([uncited, cited]),
    answer: { ...citedDraft([]).answer, introCitations: [2] },
    chart: chartFor(2),
  };
  const response = publicResponse(draft);
  assert.deepEqual(response.sources.map((item) => item.id), ["cited"]);
  assert.equal(response.chart.citation, 1);
  assert.equal(response.chart.series[0].points.length, 2);

  const chartOnly = publicResponse({ ...citedDraft([uncited, cited]), answer: { ...citedDraft([]).answer, introCitations: [1] }, chart: chartFor(2) });
  assert.deepEqual(chartOnly.sources.map((item) => item.id).sort(), ["cited", "uncited"]);
  assert.equal(chartOnly.chart.citation, chartOnly.sources.find((item) => item.id === "cited").citation);

  const invalid = publicResponse({ ...citedDraft([source()]), chart: { ...chartFor(1), kind: "pie" } });
  assert.equal(invalid.chart, undefined);
  assert.equal(invalid.answer.title, "Kontrollitud fakt");

  const unresolved = publicResponse({ ...citedDraft([source()]), chart: chartFor(9) });
  assert.equal(unresolved.chart, undefined);
});

test("publicResponse drops a chart whose source cannot support a public citation without failing the answer", () => {
  const eligible = source({ id: "eligible", citation: 1 });
  const ineligible = source({
    id: "ineligible",
    citation: 2,
    evidencePolicy: "route-only",
    _answerEvidenceEligible: false,
  });
  const draft = {
    ...citedDraft([eligible, ineligible]),
    answer: { ...citedDraft([]).answer, introCitations: [1] },
    chart: chartFor(2),
  };
  const response = publicResponse(draft);
  assert.equal(response.answer.title, "Kontrollitud fakt");
  assert.equal(response.chart, undefined);
  assert.deepEqual(response.sources.map((item) => item.id), ["eligible"]);

  const supported = publicResponse({ ...draft, chart: chartFor(1) });
  assert.equal(supported.answer.title, "Kontrollitud fakt");
  assert.equal(supported.chart.citation, 1);
});

test("cache sanitizer retains a valid chart and drops an invalid one", () => {
  // Uses a query distinct from the fixed answer title (as the other
  // sanitizeCachedResponse tests above do): the default citedDraft() query
  // "kontrollitud küsimus" shares the word "kontrollitud" with the fixed
  // answer title "Kontrollitud fakt", which trips the pre-existing
  // conservative retained-query-fragment privacy filter and makes the
  // sanitizer fail closed for reasons unrelated to the chart contract.
  const query = "roostiku ülevaade";
  const draft = { ...citedDraft([source()]), query, chart: chartFor(1) };
  const safe = sanitizeCachedResponse(draft, query);
  assert.deepEqual(safe.chart, chartFor(1));
  const restored = restoreCachedResponse(safe, query);
  assert.deepEqual(restored.chart, chartFor(1));
  const invalid = sanitizeCachedResponse({ ...draft, chart: { ...chartFor(1), citation: 7 } }, query);
  assert.equal(invalid.chart, undefined);
});

test("PDF citation witnesses remain page-bound while resource comparison grants no new origin permission", () => {
  const reviewed = officialServiceCatalogueDocuments().find((item) => item.id === "forest-area");
  assert.ok(reviewed);
  const pdf = reviewed.url.split("#")[0];
  const page22 = { ...reviewed, url: `${pdf}#page=022`, locator: "" };
  const page35 = { ...reviewed, url: `${pdf}#page=35`, locator: "" };
  assert.equal(sameSourceResource(page22.url, page35.url), true);
  assert.notEqual(sourceWitnessKey(page22), sourceWitnessKey(page35));
  assert.equal(sourceWitnessKey(page22), sourceWitnessKey({ ...page22, url: `${pdf}#page=22` }));
  assert.equal(sourceWitnessKey({ ...page22, retrieval: "official-structured-invented",
    _contentHash: "f".repeat(64), resourceKey: sourceResourceKey(pdf) }), null);
  assert.equal(sourceWitnessKey({ ...page22, evidencePolicy: "route-only" }), null);
  const foreign = { ...page22, url: "https://www.rmk.ee/report.pdf#page=22" };
  assert.equal(sourceWitnessKey(foreign), null);
  assert.equal(officialCitationUrlEligibility(foreign.url).eligible, false);
  assert.equal(sameSourceResource("https://www.rmk.ee/report.pdf", "https://rmk.ee/report.pdf"), false);
  assert.equal(sameSourceResource("https://www.tartu.ee/et/report", "https://tartu.ee/et/report"), false);
  assert.equal(sameSourceResource("https://www.keskkonnaportaal.ee/et/report?b=2&a=1&utm_source=x",
    "https://keskkonnaportaal.ee/report?a=1&b=2"), true);
  assert.equal(sameSourceResource("https://keskkonnaamet.ee/et/report", "https://keskkonnaamet.ee/report"), false);
  assert.equal(sourceResourceKey("not a URL"), null);
});

test("snapshot identity cannot invent a semantic source version or authorize an unversioned legal claim", () => {
  const now = Date.now();
  const query = "Mis on praegune temperatuur Tallinnas?";
  const xml = `<observations timestamp="${Math.floor(now / 1_000)}"><station>
    <name>Tallinn-Harku</name><wmocode>26038</wmocode>
    <longitude>24.6028916666</longitude><latitude>59.3981222223</latitude>
    <phenomenon>Clear</phenomenon><visibility>35.0</visibility>
    <precipitations>0</precipitations><airpressure>1008.4</airpressure>
    <relativehumidity>85</relativehumidity><airtemperature>14.2</airtemperature>
    <winddirection>180</winddirection><windspeed>2.5</windspeed><windspeedmax>4.1</windspeedmax>
  </station></observations>`;
  const [weather] = currentWeatherObservationFromXml(query, xml, { now });
  assert.ok(weather, "the actual typed XML consumer must validate the fixture");
  const catalogue = officialServiceCatalogueDocuments();
  const measurement = catalogue.find((item) => item.id === "forest-smi-2025-tables");
  const annual = smiStructuredDocument({
    id: measurement.id, title: measurement.title, summary: measurement.summary,
    content: measurement.content, locator: measurement.locator, topics: measurement.topics,
  });
  for (const actual of [weather, annual]) {
    assert.equal(actual._evidenceVersion, undefined);
    const snapshot = { ...actual, citation: 1, _contentHash: undefined };
    const first = buildEvidencePack({ sources: [snapshot], query });
    const second = buildEvidencePack({ sources: [snapshot], query });
    assert.equal(first.complete, true);
    assert.equal(first.entries[0].version, null);
    assert.equal(second.entries[0].version, null);
    assert.match(first.bindings[1].version, /^snapshot-sha256:[a-f0-9]{64}$/u);
    assert.deepEqual(first.bindings[1], second.bindings[1]);
  }
  const legal = { ...catalogue.find((item) => item.id === "forest-law"), citation: 1 };
  assert.equal(sourceCanSupportPublicCitation(legal, { now }).eligible, true);
  const unversioned = { ...legal, _evidenceVersion: undefined, _contentHash: "f".repeat(64) };
  // A fresh status and hash are not a producer-validated legal version.
  assert.ok(unversioned._evidenceStatusAt);
  assert.equal(sourceCanSupportPublicCitation(unversioned, { now }).eligible, false);
  assert.equal(buildEvidencePack({ sources: [unversioned], query: "Millal on sanitaarraie lubatud?" }).complete, false);
  const publicClaim = publicResponse({
    ...citedDraft([unversioned]),
    answer: { ...citedDraft([]).answer, intro: "Metsaseaduse järgi tehakse sanitaarraiet metsa sanitaarse seisundi parandamiseks.", introCitations: [1] },
  }, { now });
  assert.deepEqual(publicClaim.answer.introCitations, []);
  assert.deepEqual(publicClaim.sources, []);
});

test("unbounded reference-period freshness is not converted into an invalid zero-age cache contract", () => {
  const candidate = {
    ...smiStructuredDocument({
      id: "smi-reference-period", title: "SMI 2025 metsamaa pindala",
      summary: "Eesti metsamaa pindala 2025. aasta SMI väljaandes.",
      content: "SMI 2025 tabeli 1.1 järgi oli Eesti metsamaa pindala 2 360,2 tuhat hektarit.",
      locator: "Tabel 1.1", topics: ["metsamaa"],
    }),
    citation: 1,
  };
  const restored = restoreCachedResponse(sanitizeCachedResponse(citedDraft([candidate]), "roostiku ülevaade"),
    "roostiku ülevaade");
  assert.equal(restored.sources[0].freshness.maxAgeMs, null);
  assert.equal(sourceCanSupportPublicCitation(restored.sources[0]).eligible, true);
  const invalid = { ...candidate, evidencePolicy: "timestamped",
    _evidenceObservedAt: new Date().toISOString(),
    freshness: { ...candidate.freshness, requiresSourceTimestamp: true, maxAgeMs: 0 } };
  assert.equal(sourceCanSupportPublicCitation(invalid).eligible, false);
});

function databaseConsumer(code) {
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://practice:test-password@127.0.0.1/practice",
      DATABASE_SSL_MODE: "disable",
      DATABASE_SSL: "",
      SEARCH_HASH_SECRET: Buffer.from(Array.from({ length: 48 }, (_, index) => (index * 73 + 19) % 256)).toString("base64"),
    },
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
}

test("cache reads propagate request cancellation during pool borrowing and database work, preventing later writes", () => {
  databaseConsumer(`
    import assert from "node:assert/strict";
    import pg from "pg";
    let clock = Date.now();
    Date.now = () => clock;
    const operations = [];
    let borrowed = 0;
    let released = 0;
    let onBorrow = () => {};
    let onRead = () => {};
    let failRead = false;
    const client = {
      async query(statement) {
        const sql = typeof statement === "string" ? statement : statement.text;
        operations.push(sql);
        if (sql.includes("SELECT response")) {
          onRead();
          if (failRead) throw new Error("ordinary database read failure");
          return { rows: [] };
        }
        return { rows: [] };
      },
      release() { released += 1; },
    };
    pg.Pool.prototype.query = async function(statement) {
      if (String(statement).includes("SELECT response")) {
        onRead();
        if (failRead) throw new Error("ordinary database read failure");
      }
      return { rows: [] };
    };
    pg.Pool.prototype.connect = async function() {
      borrowed += 1;
      onBorrow();
      return client;
    };
    const { readSearchCache, recordSearch } = await import("./server/database.mjs");
    const query = "roostiku ülevaade";
    failRead = true;
    assert.equal(await readSearchCache(query, "test-revision"), null);
    failRead = false;
    const preAborted = new AbortController();
    preAborted.abort(new DOMException("client gone", "AbortError"));
    await assert.rejects(readSearchCache(query, "test-revision", { signal: preAborted.signal }), { name: "AbortError" });
    await assert.rejects(readSearchCache(query, "test-revision", { deadlineAt: clock - 1 }), { name: "TimeoutError" });
    assert.equal(borrowed, 0);
    const queued = new AbortController();
    onBorrow = () => queued.abort(new DOMException("queued client gone", "AbortError"));
    await assert.rejects(readSearchCache(query, "test-revision", { signal: queued.signal }), { name: "AbortError" });
    assert.equal(released, 1);
    assert.equal(operations.length, 0);
    onBorrow = () => {};
    const running = new AbortController();
    onRead = () => running.abort(new DOMException("running client gone", "AbortError"));
    await assert.rejects(readSearchCache(query, "test-revision", { signal: running.signal }), { name: "AbortError" });
    assert.equal(operations.at(-1), "ROLLBACK");
    assert.equal(released, 2);
    onRead = () => { clock += 51; };
    await assert.rejects(readSearchCache(query, "test-revision", { deadlineAt: clock + 50 }), { name: "TimeoutError" });
    assert.equal(operations.at(-1), "ROLLBACK");
    assert.equal(released, 3);
    const before = operations.length;
    const cancelled = await recordSearch({ query, response: { sources: [] }, revision: "test-revision",
      signal: running.signal, deadlineAt: clock + 1000, durationMs: 1 });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(operations.length, before);
    assert.equal(borrowed, 3);
    onBorrow = () => { clock += 1001; };
    const expiredBorrow = await recordSearch({ query, response: { sources: [] }, revision: "test-revision",
      deadlineAt: clock + 1000, durationMs: 1 });
    assert.equal(expiredBorrow.status, "cancelled");
    assert.equal(operations.length, before);
    assert.equal(borrowed, 4);
    assert.equal(released, 4);
  `);
});

test("persisted provenance uses delivered origin plus one bounded private attempt without evidence or output prose", () => {
  databaseConsumer(`
    import assert from "node:assert/strict";
    import pg from "pg";
    const inserted = [];
    const client = {
      async query(statement, values = []) {
        const sql = typeof statement === "string" ? statement : statement.text;
        if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: true }] };
        if (sql.includes("INSERT INTO practice_search_runs")) {
          inserted.push(values);
          return { rows: [{ id: inserted.length }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    pg.Pool.prototype.query = async () => ({ rows: [] });
    pg.Pool.prototype.connect = async () => client;
    const { recordSearch } = await import("./server/database.mjs");
    const base = {
      query: "roostiku ülevaade", revision: "test-revision", durationMs: 20,
      answerProvider: "deterministic-current-evidence", answerStatus: "degraded", cacheResponse: false,
      response: { sources: [], answer: { title: "PRIVATE_MODEL_OUTPUT", intro: "PRIVATE_MODEL_OUTPUT" },
        evidence: { sourceEvidencePack: { entries: [{ content: "PRIVATE_SOURCE_PROSE" }] } },
        acceptedClaims: [{ textHash: "PRIVATE_CLAIM_HASH" }] },
    };
    await recordSearch({ ...base, attempt: {
      provider: "luna".repeat(100), status: "degraded".repeat(20), reason: "visible-rejected",
      error: "PRIVATE_RAW_ERROR", query: base.query, output: "PRIVATE_MODEL_OUTPUT", tokens: 99,
    } });
    assert.equal(inserted[0][1], "deterministic-current-evidence");
    const provenance = JSON.parse(inserted[0][4]);
    assert.equal(provenance.answerStatus, "degraded");
    assert.equal(provenance.attempt.reason, "visible-rejected");
    assert.equal(provenance.attempt.provider.length, 160);
    assert.equal(provenance.attempt.status.length, 40);
    assert.deepEqual(Object.keys(provenance.attempt).sort(), ["provider", "reason", "status"]);
    assert.doesNotMatch(JSON.stringify(inserted), /roostiku|PRIVATE_|sourceEvidencePack|acceptedClaims|tokens/u);
    await recordSearch({ ...base, attempt: { provider: "luna", status: "degraded", reason: "PRIVATE_RAW_ERROR" } });
    assert.equal("attempt" in JSON.parse(inserted[1][4]), false);
    await recordSearch(base);
    assert.equal("attempt" in JSON.parse(inserted[2][4]), false);
  `);
});
