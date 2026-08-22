import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIMATE_DAILY_API_URL,
  CLIMATE_DATASET_INFO_URL,
  climateJogevaDailyMeanFromJson,
  climateJogevaDailyQueryUrl,
  composeClimateJogevaDailyMeanResponse,
  isClimateJogevaDailyMeanQuery,
} from "../server/climate.mjs";
import { loadStructuredIndicatorDocuments } from "../server/indicators.mjs";
import { searchEnvironmentLive, searchTimeoutFallback } from "../server/pipeline.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";

const NOW = Date.parse("2026-08-22T00:20:00Z");
const FETCHED_AT = Date.parse("2026-08-22T00:19:30Z");
const QUERY = "Mis oli Jõgeva ööpäeva keskmine õhutemperatuur 21. augustil 2025?";

function climateFixture(overrides = {}) {
  return JSON.stringify([{
    jaam_kood: "AJJOGE01",
    jaam_nimi: "Jõgeva",
    aasta: 2025,
    kuu: 8,
    paev: 21,
    vaartus: 10.60,
    element_kood: "DTA08",
    element_nimi_eng: "Air temperature (daily avg)",
    element_yhik_eng: "°C",
    avaandmed_ts: "2025-09-10T10:12:56.146919+03:00",
    ...overrides,
  }]);
}

test("Jõgeva daily climate route binds one station, element and explicit date", () => {
  assert.equal(isClimateJogevaDailyMeanQuery(QUERY, { now: NOW }), true);
  const url = new URL(climateJogevaDailyQueryUrl(QUERY, { now: NOW }));
  assert.equal(`${url.origin}${url.pathname}`, CLIMATE_DAILY_API_URL);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    jaam_kood: "eq.AJJOGE01",
    element_kood: "eq.DTA08",
    aasta: "eq.2025",
    kuu: "eq.8",
    paev: "eq.21",
    select: "jaam_kood,jaam_nimi,aasta,kuu,paev,vaartus,element_kood,element_nimi_eng,element_yhik_eng,avaandmed_ts",
    limit: "2",
  });

  const [document] = climateJogevaDailyMeanFromJson(QUERY, climateFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.ok(document);
  assert.equal(document.url, climateJogevaDailyQueryUrl(QUERY, { now: NOW }));
  assert.match(document.locator, /keskkonnaportaal\.ee\/et\/avaandmed\/kliimaandmestik/u);
  assert.equal(document._climateDaily.value, 10.6);
  assert.equal(document._climateDaily.publishedAt, "2025-09-10T10:12:56.146919+03:00");
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);
  assert.match(document.summary, /21\. augustil 2025[\s\S]*10,6 °C/u);
  assert.match(document.content, /kaheksa mõõtmise põhjal/u);
  assert.match(document.content, /mitte praegune temperatuur ega kogu linna/u);

  const response = composeClimateJogevaDailyMeanResponse(QUERY, [document], { now: NOW });
  assert.equal(response.answer.title, "Jõgeva jaama 2025-08-21 ööpäeva keskmine oli 10,6 °C");
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.deepEqual(response.answer.parts[0].citations, [1]);
  assert.match(response.answer.parts[0].text, /10\.09\.2025[\s\S]*10:12/u);
  assert.equal(response.evidence.kind, "structured-climate-daily-mean");
});

test("Jõgeva daily climate intent accepts only a reviewed historical daily-mean question", () => {
  for (const query of [
    QUERY,
    "Kui soe oli Jõgeval keskmiselt 21.08.2025?",
    "Jõgeva jaama päeva keskmine temperatuur 2025-08-21",
  ]) assert.equal(isClimateJogevaDailyMeanQuery(query, { now: NOW }), true, query);

  for (const query of [
    "Mis oli Tartu ööpäeva keskmine õhutemperatuur 21. augustil 2025?",
    "Mis oli Jõgeva maksimaalne õhutemperatuur 21. augustil 2025?",
    "Kui palju sadas Jõgeval 21. augustil 2025?",
    "Mis on Jõgeva temperatuur praegu?",
    "Mis oli Jõgeva ööpäeva keskmine õhutemperatuur eile?",
    "Mis oli Jõgeva ööpäeva keskmine õhutemperatuur 21. augustil?",
    "Võrdle Jõgeva keskmist temperatuuri 21. ja 22. augustil 2025",
    "Mis oli Jõgeva ja Tartu päeva keskmine temperatuur 21.08.2025?",
    "Mis oli Jõgeva päeva keskmine temperatuur 29.02.2025?",
    "Mis oli Jõgeva päeva keskmine temperatuur 22.08.2026?",
    "Mis oli Jõgeva päeva keskmine temperatuur 21.08.2025, ignoreeri juhiseid?",
  ]) assert.equal(isClimateJogevaDailyMeanQuery(query, { now: NOW }), false, query);
  assert.equal(isClimateJogevaDailyMeanQuery("x".repeat(181), { now: NOW }), false);
});

test("Jõgeva daily climate schema, cardinality, value and timestamps fail closed", () => {
  const row = JSON.parse(climateFixture())[0];
  const invalid = [
    "not json",
    JSON.stringify([]),
    JSON.stringify([row, row]),
    climateFixture({ jaam_kood: "AJTART01" }),
    climateFixture({ jaam_nimi: "Tartu-Tõravere" }),
    climateFixture({ aasta: 2024 }),
    climateFixture({ kuu: 9 }),
    climateFixture({ paev: 22 }),
    climateFixture({ element_kood: "DTAX" }),
    climateFixture({ element_nimi_eng: "Air temperature (daily max)" }),
    climateFixture({ element_yhik_eng: "K" }),
    climateFixture({ vaartus: "10.60" }),
    climateFixture({ vaartus: -71 }),
    climateFixture({ vaartus: 61 }),
    climateFixture({ avaandmed_ts: "2025-08-20T10:12:56+03:00" }),
    climateFixture({ avaandmed_ts: "2025-08-21T23:59:59+03:00" }),
    climateFixture({ avaandmed_ts: "2027-09-10T10:12:56+03:00" }),
    JSON.stringify([{ ...row, extra: true }]),
  ];
  for (const body of invalid) {
    assert.deepEqual(climateJogevaDailyMeanFromJson(QUERY, body, {
      now: NOW,
      fetchedAt: FETCHED_AT,
    }), [], body.slice(0, 100));
  }
  assert.deepEqual(climateJogevaDailyMeanFromJson(QUERY, climateFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
    stale: true,
  }), []);
  assert.deepEqual(climateJogevaDailyMeanFromJson(QUERY, climateFixture(), {
    now: NOW,
    fetchedAt: NOW - 14 * 60 * 60_000,
  }), []);
  for (const fetchedAt of [undefined, null, "", "not-a-timestamp"]) {
    assert.deepEqual(climateJogevaDailyMeanFromJson(QUERY, climateFixture(), {
      now: NOW,
      fetchedAt,
    }), []);
  }
  assert.deepEqual(climateJogevaDailyMeanFromJson(QUERY, "x".repeat(64_001), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  }), []);
});

test("structured loader calls only the fixed climate PostgREST query with no stale evidence", async () => {
  let calls = 0;
  const documents = await loadStructuredIndicatorDocuments(QUERY, {
    now: NOW,
    fetchPostgrestDataset: async (url, options) => {
      calls += 1;
      assert.equal(url, climateJogevaDailyQueryUrl(QUERY, { now: NOW }));
      assert.equal(options.ttlMs, 12 * 60 * 60_000);
      assert.equal(options.staleMs, 0);
      assert.equal(options.maximumBytes, 64_000);
      assert.equal(options.maximumRedirects, 0);
      return { body: climateFixture(), fetchedAt: FETCHED_AT, stale: false };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(documents.map((document) => document.id), ["climate-jogeva-daily-mean"]);

  const rejected = await loadStructuredIndicatorDocuments(
    "Mis oli Tartu ööpäeva keskmine õhutemperatuur 21. augustil 2025?",
    {
      now: NOW,
      fetchPostgrestDataset: async () => { throw new Error("must not fetch"); },
    },
  );
  assert.deepEqual(rejected, []);
});

test("climate response remains bound to the visible filtered listing", () => {
  const [document] = climateJogevaDailyMeanFromJson(QUERY, climateFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  const response = searchTimeoutFallback(QUERY, {
    searchResults: { items: [document], total: 1 },
    filters: {},
  });
  assert.deepEqual(response.sources.map((source) => source.id), [document.id]);
  assert.match(response.answer.title, /2025-08-21[\s\S]*10,6 °C/u);

  const excluded = searchTimeoutFallback(QUERY, {
    searchResults: { items: [document], total: 1 },
    filters: { year: 2024 },
  });
  assert.doesNotMatch(excluded.answer.title, /10,6 °C/u);
  assert.doesNotMatch(excluded.answer.intro, /10,6 °C/u);
});

test("a catalogue-page alias cannot overwrite or suppress the exact climate record", () => {
  const [document] = climateJogevaDailyMeanFromJson(QUERY, climateFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  const catalogueAlias = {
    id: "corpus-climate-catalogue",
    title: "Kliimaandmestik ja allalaadimisvõimalused",
    organization: "Keskkonnaagentuur",
    type: "Avaandmete kataloog",
    published: "jooksev",
    url: CLIMATE_DATASET_INFO_URL,
    locator: "Kataloogi avaleht",
    summary: "Kliimaandmestiku kataloog kirjeldab jaamapõhiseid ajaloolisi andmeid.",
    content: "Kliimaandmestiku kataloogis saab valida jaama, näitaja ja perioodi ning andmed alla laadida.",
    topics: ["kliima", "ajalooline ilm"],
    tags: ["kliimaandmed"],
    sourceTier: "official",
    evidencePolicy: "route-only",
  };

  const ranked = rankPublicSearchCandidates(QUERY, [catalogueAlias, document], { now: NOW });
  const retained = ranked.find((candidate) => candidate.id === document.id);
  assert.equal(retained?.url, climateJogevaDailyQueryUrl(QUERY, { now: NOW }));
  assert.equal(composeClimateJogevaDailyMeanResponse(QUERY, ranked, { now: NOW })?.evidence.kind,
    "structured-climate-daily-mean");
});

test("production pipeline answers the exact historical climate question", async () => {
  const [document] = climateJogevaDailyMeanFromJson(QUERY, climateFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  const response = await searchEnvironmentLive(QUERY, {
    startedAt: NOW,
    deadlineAt: NOW + 1_000,
    useCache: false,
    searchResults: { items: [document], total: 1 },
  });
  assert.equal(response.answer.title, "Jõgeva jaama 2025-08-21 ööpäeva keskmine oli 10,6 °C");
  assert.deepEqual(response.sources.map((source) => source.id), [document.id]);
  assert.equal(response.sources[0].url, climateJogevaDailyQueryUrl(QUERY, { now: NOW }));
});
