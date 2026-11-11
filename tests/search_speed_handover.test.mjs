// Behaviour tests for the structured source loader in the search request path.
//
// A search question that needs two different official sources should not pay
// their latency one after another. This file pins the four properties that make
// overlapping those two independent reads safe:
//
//   1. Both sources are requested and they overlap in time, so wall clock is
//      the slower source, not the sum of both.
//   2. The documents the caller receives keep the admission order of the
//      loader, whatever order the sources answer in, and their content is byte
//      identical to a run where every source answers instantly.
//   3. Cancellation still wins: an aborted request rejects with AbortError and
//      every started read sees an aborted signal.
//   4. Overlapping must not add traffic: one request per admitted source, one
//      source failing leaves the other, and a single intent question still
//      issues exactly one request.
//
// Every transport here is a local stub with synthetic fixture bodies. No live
// endpoint is called and no real observation data is used.

import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_WEATHER_OBSERVATIONS_XML_URL,
  LATEST_HYDROLOGY_API_URL,
  currentWeatherObservationFromXml,
  latestPublishedHydrologyFromJson,
  loadStructuredIndicatorDocuments,
} from "../server/indicators.mjs";

const NOW = Date.parse("2026-08-21T22:30:00Z");
// One question, two independent official sources: the last published hourly
// discharge of the Kloostrimetsa gauge and the current air temperature of the
// Tartu station. Both adapters are admitted for this text, and nothing else is.
const COMPOUND_QUERY = "Mis oli Kloostrimetsa jaamas viimati avaldatud vooluhulk ja mis on Tartu temperatuur?";

function hydrologyFixture() {
  const row = (timestamp, value) => ({
    jaam_kood: 41157,
    jaam_nimi: "Kloostrimetsa",
    jaam_taisnimi: "Kloostrimetsa hüdromeetriajaam",
    veekogu_nimi: "Pirita j.",
    valgala_nimi: "Pirita jõgi",
    jaam_laiuskraad: 59.466291,
    jaam_pikkuskraad: 24.879519,
    timeline_ts_utc: timestamp,
    aegrida_nimi: "Äravool avg",
    vaartus: value,
  });
  return JSON.stringify([
    row("2026-08-20T20:00:00", 29.592),
    row("2026-08-20T19:00:00", 30.1),
  ]);
}

function weatherFixture() {
  const timestamp = Math.floor((NOW - 60_000) / 1_000);
  return `<?xml version="1.0" encoding="UTF-8"?><observations timestamp="${timestamp}">
    <station>
      <name>Tartu</name><wmocode>26242</wmocode>
      <longitude>26.726181</longitude><latitude>58.380022</latitude>
      <phenomenon>Clear</phenomenon><visibility>35.0</visibility>
      <precipitations>0</precipitations><airpressure>1008.4</airpressure>
      <relativehumidity>85</relativehumidity><airtemperature>14.2</airtemperature>
      <winddirection>180</winddirection><windspeed>2.5</windspeed><windspeedmax>4.1</windspeedmax>
      <waterlevel></waterlevel><waterlevel_eh2000></waterlevel_eh2000><watertemperature></watertemperature>
      <uvindex></uvindex><sunshineduration></sunshineduration><globalradiation></globalradiation>
    </station>
  </observations>`;
}

function abortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// A promise that settles only when the given delay elapses or the caller
// aborts, whichever happens first.
function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// One instrumented source read. It records when the read started and finished
// so the test can read the real timing from the loader, not a claim.
function timedFetcher({ log, label, delayMs, body, failure = null }) {
  return async (url, options = {}) => {
    const startedAt = performance.now();
    log.starts.push({ label, url, startedAt, signal: options.signal });
    if (failure) throw failure;
    await abortableSleep(delayMs, options.signal);
    log.ends.push({ label, url, endedAt: performance.now() });
    return { body, stale: false, fetchedAt: NOW };
  };
}

function writingFetcher({ log, label, delayMs, body, failure = null }) {
  let calls = 0;
  const fetch = timedFetcher({ log, label, delayMs, body, failure });
  return {
    fetch: async (url, options) => {
      calls += 1;
      return fetch(url, options);
    },
    count: () => calls,
  };
}

function newLog() {
  return { starts: [], ends: [] };
}

// The documents the loader is expected to return for the compound question:
// hydrology first, weather second, produced by the same adapters from the same
// fixture bodies.
function expectedDocuments() {
  return [
    ...latestPublishedHydrologyFromJson(COMPOUND_QUERY, hydrologyFixture(), { now: NOW }),
    ...currentWeatherObservationFromXml(COMPOUND_QUERY, weatherFixture(), { now: NOW }),
  ];
}

test("two independently needed sources load in overlap and keep the admission order", async () => {
  const log = newLog();
  const hydrology = writingFetcher({
    log,
    label: "hydrology",
    delayMs: 300,
    body: hydrologyFixture(),
  });
  const weather = writingFetcher({
    log,
    label: "weather",
    delayMs: 200,
    body: weatherFixture(),
  });
  const startedAt = performance.now();
  const documents = await loadStructuredIndicatorDocuments(COMPOUND_QUERY, {
    now: NOW,
    fetchPostgrestDataset: hydrology.fetch,
    fetchXmlDataset: weather.fetch,
  });
  const elapsed = performance.now() - startedAt;

  assert.equal(hydrology.count(), 1, "the hydrology source is read exactly once");
  assert.equal(weather.count(), 1, "the weather source is read exactly once");
  assert.equal(log.starts.length, 2, "no source beyond the two admitted ones is read");

  const hydrologyStart = log.starts.find((entry) => entry.label === "hydrology");
  const weatherStart = log.starts.find((entry) => entry.label === "weather");
  const hydrologyEnd = log.ends.find((entry) => entry.label === "hydrology");
  const weatherEnd = log.ends.find((entry) => entry.label === "weather");
  assert.ok(hydrologyStart && weatherStart && hydrologyEnd && weatherEnd, "both reads settled");

  // The second independent read starts while the first one is still running.
  assert.ok(
    weatherStart.startedAt < hydrologyEnd.endedAt,
    `the weather read starts at ${Math.round(weatherStart.startedAt)} and the hydrology read ends at ${Math.round(hydrologyEnd.endedAt)}`,
  );
  assert.ok(
    hydrologyStart.startedAt < weatherEnd.endedAt,
    "the hydrology read is still running when the weather read ends",
  );

  // Measured wall clock: one source plus scheduling, never both delays in sum.
  assert.ok(elapsed >= 290, `elapsed ${Math.round(elapsed)} ms is at least the slower source`);
  assert.ok(elapsed < 420, `elapsed ${Math.round(elapsed)} ms stays below the ${300 + 200} ms serial sum`);

  // Admission order, not completion order: the weather read finishes first and
  // still ranks second.
  assert.deepEqual(
    documents.map((document) => document.id),
    ["latest-published-hydrology", "current-weather-observations"],
  );
  assert.deepEqual(documents, expectedDocuments());
});

test("the same documents come back when every source answers instantly", async () => {
  const log = newLog();
  const instant = await loadStructuredIndicatorDocuments(COMPOUND_QUERY, {
    now: NOW,
    fetchPostgrestDataset: timedFetcher({ log, label: "hydrology", delayMs: 0, body: hydrologyFixture() }),
    fetchXmlDataset: timedFetcher({ log, label: "weather", delayMs: 0, body: weatherFixture() }),
  });
  const slowLog = newLog();
  const slow = await loadStructuredIndicatorDocuments(COMPOUND_QUERY, {
    now: NOW,
    fetchPostgrestDataset: timedFetcher({ log: slowLog, label: "hydrology", delayMs: 120, body: hydrologyFixture() }),
    fetchXmlDataset: timedFetcher({ log: slowLog, label: "weather", delayMs: 60, body: weatherFixture() }),
  });

  assert.deepEqual(instant, expectedDocuments());
  assert.deepEqual(slow, instant, "timing never changes the returned content or its order");
  assert.equal(instant.length, 2);
});

test("an aborted request rejects and every started read is aborted", async () => {
  const log = newLog();
  const controller = new AbortController();
  const pending = loadStructuredIndicatorDocuments(COMPOUND_QUERY, {
    now: NOW,
    signal: controller.signal,
    fetchPostgrestDataset: timedFetcher({ log, label: "hydrology", delayMs: 400, body: hydrologyFixture() }),
    fetchXmlDataset: timedFetcher({ log, label: "weather", delayMs: 400, body: weatherFixture() }),
  });
  await sleep(50);
  controller.abort();
  await assert.rejects(pending, (error) => error?.name === "AbortError");
  assert.ok(log.starts.length >= 1, "at least one read had started");
  for (const entry of log.starts) {
    assert.equal(entry.signal?.aborted, true, `the ${entry.label} read saw an aborted signal`);
  }
  assert.deepEqual(log.ends, [], "no read completed after the abort");
});

test("one failing source leaves the other source in place", async () => {
  const log = newLog();
  const hydrology = writingFetcher({
    log,
    label: "hydrology",
    delayMs: 40,
    body: hydrologyFixture(),
    failure: new Error("upstream unavailable"),
  });
  const weather = writingFetcher({ log, label: "weather", delayMs: 40, body: weatherFixture() });
  const documents = await loadStructuredIndicatorDocuments(COMPOUND_QUERY, {
    now: NOW,
    fetchPostgrestDataset: hydrology.fetch,
    fetchXmlDataset: weather.fetch,
  });

  assert.equal(hydrology.count(), 1);
  assert.equal(weather.count(), 1);
  assert.deepEqual(documents.map((document) => document.id), ["current-weather-observations"]);
});

test("a single intent question still issues exactly one request", async () => {
  const log = newLog();
  const postgrest = writingFetcher({ log, label: "postgrest", delayMs: 0, body: "[]" });
  const weather = writingFetcher({ log, label: "weather", delayMs: 0, body: weatherFixture() });
  const documents = await loadStructuredIndicatorDocuments("praegune õhurõhk Tartus", {
    now: NOW,
    fetchPostgrestDataset: postgrest.fetch,
    fetchXmlDataset: weather.fetch,
  });

  assert.equal(postgrest.count(), 0, "no unrelated source is read");
  assert.equal(weather.count(), 1);
  assert.deepEqual(log.starts.map((entry) => entry.url), [CURRENT_WEATHER_OBSERVATIONS_XML_URL]);
  assert.notEqual(log.starts[0]?.url, LATEST_HYDROLOGY_API_URL);
  assert.deepEqual(documents.map((document) => document.id), ["current-weather-observations"]);
});
