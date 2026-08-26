import assert from "node:assert/strict";
import test from "node:test";
import { loadStructuredIndicatorDocuments } from "../server/indicators.mjs";
import { searchEnvironmentLive, searchTimeoutFallback } from "../server/pipeline.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";
import {
  composeStatisticsHazardousWasteResponse,
  composeStatisticsTotalWasteRecoveryResponse,
  composeStatisticsWastewaterBht7Response,
  composeStatisticsWaterAbstractionResponse,
  isStatisticsHazardousWasteQuery,
  isStatisticsTotalWasteRecoveryQuery,
  isStatisticsWastewaterBht7Query,
  isStatisticsWaterAbstractionQuery,
  STATISTICS_HAZARDOUS_WASTE_API_URL,
  STATISTICS_HAZARDOUS_WASTE_TABLE_URL,
  STATISTICS_TOTAL_WASTE_RECOVERY_API_URL,
  STATISTICS_TOTAL_WASTE_RECOVERY_TABLE_URL,
  STATISTICS_WATER_ABSTRACTION_API_URL,
  STATISTICS_WATER_ABSTRACTION_TABLE_URL,
  STATISTICS_WASTEWATER_BHT7_API_URL,
  STATISTICS_WASTEWATER_BHT7_TABLE_URL,
  statisticsHazardousWasteFromJson,
  statisticsHazardousWasteRequest,
  statisticsTotalWasteRecoveryFromJson,
  statisticsTotalWasteRecoveryRequest,
  statisticsWastewaterBht7FromJson,
  statisticsWastewaterBht7Request,
  statisticsWaterAbstractionFromJson,
  statisticsWaterAbstractionRequest,
} from "../server/statistics.mjs";

const NOW = Date.parse("2026-08-22T00:20:00Z");
const FETCHED_AT = Date.parse("2026-08-22T00:19:30Z");

function statisticsFixture(overrides = {}) {
  const payload = {
    class: "dataset",
    label: "KK048: VEEVÕTT | Aasta, Maakond, Tegevusala (EMTAK 2008) ning Vee liik",
    source: "Statistikaamet",
    updated: "2016-10-18T06:00:00Z",
    id: ["Aasta", "Maakond", "Tegevusala (EMTAK 2008)", "Vee liik"],
    size: [1, 1, 1, 1],
    dimension: {
      Aasta: {
        extension: { show: "value" },
        label: "Aasta",
        category: { index: { 2024: 0 }, label: { 2024: "2024" } },
      },
      Maakond: {
        extension: { show: "value" },
        label: "Maakond",
        category: { index: { 1: 0 }, label: { 1: "Kogu Eesti" } },
      },
      "Tegevusala (EMTAK 2008)": {
        extension: { show: "value" },
        label: "Tegevusala (EMTAK 2008)",
        category: { index: { 1: 0 }, label: { 1: "Tegevusalad kokku" } },
      },
      "Vee liik": {
        extension: { show: "value" },
        label: "Vee liik",
        category: { index: { 1: 0 }, label: { 1: "Vesi kokku" } },
      },
    },
    value: [654301],
    role: { time: ["Aasta"] },
    version: "2.0",
    extension: { px: { tableid: "KK048", decimals: 0 } },
  };
  return JSON.stringify({ ...payload, ...overrides });
}

function bht7Fixture(overrides = {}) {
  const payload = {
    class: "dataset",
    label: "KK25: PINNAVEEKOGUDESSE JUHITUD HEITVEE REOSTUSKOORMUS | Maakond, Aasta ning Reostuskoormuse näitaja",
    source: "Statistikaamet",
    updated: "2018-10-16T05:00:00Z",
    id: ["Maakond", "Aasta", "Reostuskoormuse näitaja"],
    size: [1, 1, 1],
    dimension: {
      Maakond: {
        extension: { show: "value" },
        label: "Maakond",
        category: { index: { 1: 0 }, label: { 1: "Kogu Eesti" } },
      },
      Aasta: {
        extension: { show: "value" },
        label: "Aasta",
        category: { index: { 2024: 0 }, label: { 2024: "2024" } },
      },
      "Reostuskoormuse näitaja": {
        extension: { show: "value" },
        label: "Reostuskoormuse näitaja",
        category: { index: { 1: 0 }, label: { 1: "Bioloogiline hapnikutarve (BHT7)" } },
      },
    },
    value: [868],
    role: { time: ["Aasta"] },
    version: "2.0",
    extension: { px: { tableid: "KK25", decimals: 0 } },
  };
  return JSON.stringify({ ...payload, ...overrides });
}

function hazardousWasteFixture(overrides = {}) {
  const payload = {
    class: "dataset",
    label: "KK068: JÄÄTMETEKE | Aasta, Jäätmeliik ning Tegevusala (EMTAK 2008)",
    source: "Statistikaamet",
    updated: "2012-10-23T05:00:00Z",
    id: ["Aasta", "Jäätmeliik", "Tegevusala (EMTAK 2008)"],
    size: [1, 1, 1],
    dimension: {
      Aasta: {
        extension: { show: "value" },
        label: "Aasta",
        category: { index: { 2024: 0 }, label: { 2024: "2024" } },
      },
      Jäätmeliik: {
        extension: { show: "value" },
        label: "Jäätmeliik",
        category: { index: { 41: 0 }, label: { 41: "Ohtlikud jäätmed kokku" } },
      },
      "Tegevusala (EMTAK 2008)": {
        extension: { show: "value" },
        label: "Tegevusala (EMTAK 2008)",
        category: { index: { 1: 0 }, label: { 1: "Tegevusalad kokku" } },
      },
    },
    value: [1469565],
    role: { time: ["Aasta"] },
    version: "2.0",
    extension: { px: { tableid: "KK068", decimals: 0 } },
  };
  return JSON.stringify({ ...payload, ...overrides });
}

function totalWasteRecoveryFixture(year = 2024, overrides = {}) {
  const yearKey = String(year);
  const payload = {
    class: "dataset",
    label: "KK610: JÄÄTMEBILANSS | Aasta, Jäätmeliik ning Näitaja",
    source: "Statistikaamet",
    updated: "2009-10-13T06:00:00Z",
    id: ["Aasta", "Jäätmeliik", "Näitaja"],
    size: [1, 1, 1],
    dimension: {
      Aasta: {
        extension: { show: "value" },
        label: "Aasta",
        category: { index: { [yearKey]: 0 }, label: { [yearKey]: yearKey } },
      },
      Jäätmeliik: {
        extension: { show: "value" },
        label: "Jäätmeliik",
        category: { index: { 1: 0 }, label: { 1: "Jäätmed kokku" } },
      },
      Näitaja: {
        extension: { show: "value" },
        label: "Näitaja",
        category: { index: { 7: 0 }, label: { 7: "....taaskasutamine" } },
      },
    },
    value: [17667652],
    role: { time: ["Aasta"] },
    version: "2.0",
    extension: { px: { tableid: "KK610", decimals: 0 } },
  };
  return JSON.stringify({ ...payload, ...overrides });
}

test("PXWeb metadata-only GET bodies cannot become numeric evidence", () => {
  const metadataOnly = JSON.stringify({
    title: "PXWeb table metadata",
    variables: [{ code: "Aasta", values: ["2024"] }],
  });
  assert.deepEqual(statisticsWaterAbstractionFromJson(
    "Kui palju vett võeti Eestis kokku 2024. aastal?",
    metadataOnly,
    { now: NOW, fetchedAt: FETCHED_AT },
  ), []);
  assert.deepEqual(statisticsWastewaterBht7FromJson(
    "Kui suur oli Eestis 2024. aastal pinnaveekogudesse juhitud heitvee BHT7 reostuskoormus?",
    metadataOnly,
    { now: NOW, fetchedAt: FETCHED_AT },
  ), []);
  assert.deepEqual(statisticsHazardousWasteFromJson(
    "Kui palju ohtlikke jäätmeid tekkis Eestis 2024. aastal?",
    metadataOnly,
    { now: NOW, fetchedAt: FETCHED_AT },
  ), []);
});

test("KK048 request and adapter bind one exact 2024 national total", () => {
  const query = "Kui palju vett võeti Eestis kokku 2024. aastal?";
  assert.equal(isStatisticsWaterAbstractionQuery(query), true);
  assert.deepEqual(statisticsWaterAbstractionRequest(), {
    query: [
      { code: "Aasta", selection: { filter: "item", values: ["2024"] } },
      { code: "Maakond", selection: { filter: "item", values: ["1"] } },
      { code: "Tegevusala (EMTAK 2008)", selection: { filter: "item", values: ["1"] } },
      { code: "Vee liik", selection: { filter: "item", values: ["1"] } },
    ],
    response: { format: "json-stat2" },
  });

  const [document] = statisticsWaterAbstractionFromJson(query, statisticsFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.ok(document);
  assert.equal(document.url, STATISTICS_WATER_ABSTRACTION_TABLE_URL);
  assert.match(document.locator, /KK048\.PX[\s\S]*Aasta=2024[\s\S]*Maakond=1[\s\S]*Vee liik=1[\s\S]*levitamispõhimõtted/u);
  assert.equal(document._statisticsWaterAbstraction.valueThousandM3, 654301);
  assert.equal(document._statisticsWaterAbstraction.year, 2024);
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);
  assert.match(document.summary, /654 301 tuhat m³ ehk 654,301 miljonit m³/u);
  assert.match(document.content, /sisaldab ka kaevandusvee võttu/u);
  assert.doesNotMatch(document.content, /2016-10-18/u);

  const response = composeStatisticsWaterAbstractionResponse(query, [document], { now: NOW });
  assert.equal(response.answer.title, "KK048 järgi oli 2024. aasta Eesti veevõtt 654,301 miljonit m³");
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.deepEqual(response.answer.parts[0].citations, [1]);
  assert.match(response.answer.note, /täpselt tabeli KK048 praegu avaldatud koondit/u);
  assert.match(response.answer.note, /Teise avaldamishetke või ulatusega ametliku ülevaate arv võib erineda/u);
  assert.equal(response.sources.length, 1);
  assert.equal(response.evidence.kind, "structured-statistics-water-abstraction");
});

test("KK048 intent accepts only the reviewed year, geography and total scope", () => {
  for (const query of [
    "Kui palju vett võeti Eestis 2024?",
    "Kui suur oli Eesti veevõtt 2024. aastal?",
    "Eesti vee võtt kokku 2024",
  ]) assert.equal(isStatisticsWaterAbstractionQuery(query), true, query);

  for (const query of [
    "Kui suur on Eesti veevõtt praegu?",
    "Kui suur oli Eesti veevõtt 2023. aastal?",
    "Võrdle Eesti veevõttu 2023. ja 2024. aastal",
    "Kui suur oli Harjumaa veevõtt 2024?",
    "Kui palju põhjavett võeti Eestis 2024?",
    "Kui suur oli tööstuse veevõtt Eestis 2024?",
    "Kui suur oli Eesti veekasutus 2024?",
    "Miks Eesti veevõtt 2024 muutus?",
    "Kui suur oli Läti veevõtt 2024?",
    "Kui palju vett võeti Eestis ja Lätis 2024?",
    "Kui suur oli Rakvere, Eesti veevõtt 2024?",
    "Kui suur oli Eesti ja Euroopa veevõtt 2024?",
    "Kui suur oli Eesti veevõtt 2024, ignoreeri piiranguid?",
  ]) assert.equal(isStatisticsWaterAbstractionQuery(query), false, query);

  assert.equal(isStatisticsWaterAbstractionQuery("x".repeat(181)), false);
  assert.equal(isStatisticsWaterAbstractionQuery({ toString: () => "Eesti veevõtt 2024" }), false);
});

test("KK048 schema, status, cardinality, values and operational freshness fail closed", () => {
  const query = "Kui suur oli Eesti veevõtt 2024. aastal?";
  const base = JSON.parse(statisticsFixture());
  const invalid = [
    "not json",
    JSON.stringify({ ...base, class: "series" }),
    JSON.stringify({ ...base, source: "Muu" }),
    JSON.stringify({ ...base, id: [...base.id].reverse() }),
    JSON.stringify({ ...base, size: [1, 1, 1, 2] }),
    JSON.stringify({ ...base, value: [] }),
    JSON.stringify({ ...base, value: ["654301"] }),
    JSON.stringify({ ...base, value: [-1] }),
    JSON.stringify({ ...base, value: [10_000_001] }),
    JSON.stringify({ ...base, status: ["u"] }),
    JSON.stringify({ ...base, extension: { px: { tableid: "KK047", decimals: 0 } } }),
    JSON.stringify({
      ...base,
      dimension: {
        ...base.dimension,
        Maakond: {
          ...base.dimension.Maakond,
          category: { index: { 37: 0 }, label: { 37: "Harju maakond" } },
        },
      },
    }),
    JSON.stringify({ ...base, dimension: { ...base.dimension, extra: {} } }),
  ];
  for (const body of invalid) {
    assert.deepEqual(statisticsWaterAbstractionFromJson(query, body, {
      now: NOW,
      fetchedAt: FETCHED_AT,
    }), []);
  }
  assert.deepEqual(statisticsWaterAbstractionFromJson(query, statisticsFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
    stale: true,
  }), []);
  assert.deepEqual(statisticsWaterAbstractionFromJson(query, statisticsFixture(), {
    now: NOW,
    fetchedAt: NOW - 14 * 60 * 60_000,
  }), []);
  assert.deepEqual(statisticsWaterAbstractionFromJson(query, statisticsFixture(), {
    now: NOW,
    fetchedAt: NOW + 6 * 60_000,
  }), []);
  for (const fetchedAt of [undefined, null, "", "not-a-timestamp"]) {
    assert.deepEqual(statisticsWaterAbstractionFromJson(query, statisticsFixture(), {
      now: NOW,
      fetchedAt,
    }), []);
  }
  assert.deepEqual(statisticsWaterAbstractionFromJson(
    query,
    "x".repeat(256_001),
    { now: NOW, fetchedAt: FETCHED_AT },
  ), []);
});

test("structured loader posts only the fixed KK048 request for the exact intent", async () => {
  const query = "Kui palju vett võeti Eestis 2024?";
  let calls = 0;
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async (url, payload) => {
      calls += 1;
      assert.equal(url, STATISTICS_WATER_ABSTRACTION_API_URL);
      assert.deepEqual(payload, statisticsWaterAbstractionRequest());
      return { body: statisticsFixture(), fetchedAt: FETCHED_AT, stale: false };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(documents.map((document) => document.id), ["statistics-water-abstraction-2024"]);

  const rejected = await loadStructuredIndicatorDocuments("Kui palju põhjavett võeti Eestis 2024?", {
    now: NOW,
    fetchPxwebDataset: async () => {
      throw new Error("must not fetch");
    },
  });
  assert.deepEqual(rejected, []);
});

test("the timeout pipeline publishes KK048 only from the visible filtered listing", () => {
  const now = Date.now();
  const query = "Kui suur oli Eesti veevõtt 2024. aastal?";
  const [document] = statisticsWaterAbstractionFromJson(query, statisticsFixture(), {
    now,
    fetchedAt: now,
  });
  const response = searchTimeoutFallback(query, {
    searchResults: { items: [document], total: 1 },
    filters: {},
  });
  assert.deepEqual(response.sources.map((source) => source.id), [document.id]);
  assert.match(response.answer.title, /2024\. aasta Eesti veevõtt 654,301 miljonit m³/u);

  const excluded = searchTimeoutFallback(query, {
    searchResults: { items: [document], total: 1 },
    filters: { category: "Muu sisutüüp" },
  });
  assert.doesNotMatch(excluded.answer.title, /654,301/u);
  assert.doesNotMatch(excluded.answer.intro, /654 301/u);
});

test("the production pipeline answers the exact KK048 question from its visible source", async () => {
  const now = Date.now();
  const query = "Kui palju vett võeti Eestis 2024?";
  const [document] = statisticsWaterAbstractionFromJson(query, statisticsFixture(), {
    now,
    fetchedAt: now,
  });
  const response = await searchEnvironmentLive(query, {
    startedAt: now,
    deadlineAt: now + 1_000,
    useCache: false,
    searchResults: { items: [document], total: 1 },
  });
  assert.equal(response.answer.title, "KK048 järgi oli 2024. aasta Eesti veevõtt 654,301 miljonit m³");
  assert.deepEqual(response.sources.map((source) => source.id), [document.id]);
  assert.equal(response.sources[0].url, STATISTICS_WATER_ABSTRACTION_TABLE_URL);
  assert.doesNotMatch(response.sources[0].url, /\.PX$/u);
});

test("KK25 request and adapter bind one exact 2024 national BHT7 total", () => {
  const query = "Kui suur oli Eestis 2024. aastal pinnaveekogudesse juhitud heitvee BHT7 reostuskoormus?";
  assert.equal(isStatisticsWastewaterBht7Query(query), true);
  assert.deepEqual(statisticsWastewaterBht7Request(), {
    query: [
      { code: "Maakond", selection: { filter: "item", values: ["1"] } },
      { code: "Aasta", selection: { filter: "item", values: ["2024"] } },
      { code: "Reostuskoormuse näitaja", selection: { filter: "item", values: ["1"] } },
    ],
    response: { format: "json-stat2" },
  });

  const [document] = statisticsWastewaterBht7FromJson(query, bht7Fixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.ok(document);
  assert.equal(document.url, STATISTICS_WASTEWATER_BHT7_TABLE_URL);
  assert.match(document.locator, /KK25\.PX[\s\S]*Maakond=1[\s\S]*Aasta=2024[\s\S]*Reostuskoormuse näitaja=1[\s\S]*levitamispõhimõtted/u);
  assert.equal(document._statisticsWastewaterBht7.valueTonnes, 868);
  assert.equal(document._statisticsWastewaterBht7.year, 2024);
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);
  assert.match(document.summary, /BHT7\) järgi 868 tonni/u);
  assert.match(document.content, /mitte ohtlike jäätmete kogus/u);
  assert.doesNotMatch(document.content, /2018-10-16/u);

  const response = composeStatisticsWastewaterBht7Response(query, [document], { now: NOW });
  assert.equal(response.answer.title, "KK25 järgi oli 2024. aasta Eesti heitvee BHT7 reostuskoormus 868 tonni");
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.deepEqual(response.answer.parts[0].citations, [1]);
  assert.match(response.answer.note, /mitte ohtlike jäätmete kogus/u);
  assert.equal(response.evidence.kind, "structured-statistics-wastewater-bht7");
});

test("KK25 intent accepts only the reviewed year, geography, metric and discharge scope", () => {
  for (const query of [
    "Kui suur oli Eestis 2024. aastal pinnaveekogudesse juhitud heitvee BHT7 reostuskoormus?",
    "Mitu tonni bioloogilist hapnikutarvet (BHT7) juhiti 2024. aastal Eestis pinnaveekogudesse?",
    "Eesti pinnaveekogudesse juhitud heitvee BHT7 reostuskoormus 2024",
  ]) assert.equal(isStatisticsWastewaterBht7Query(query), true, query);

  for (const query of [
    "Kui palju ohtlikke jäätmeid Eestis 2024 tekkis?",
    "Kas 868 tonni on ohtlike jäätmete kogus?",
    "Kui suur oli Eesti BHT7 reostuskoormus 2024?",
    "Kui suur oli Eestis 2023. aastal pinnaveekogudesse juhitud heitvee BHT7 reostuskoormus?",
    "Võrdle Eesti heitvee BHT7 reostuskoormust 2023 ja 2024",
    "Kui suur oli Harjumaa heitvee BHT7 reostuskoormus 2024?",
    "Kui suur on BHT7 praegu Emajões?",
    "Kas Eesti joogivesi oli 2024 ohutu?",
    "Kas 2024 heitvesi vastas loa nõuetele?",
    "Mitu tonni KHT-Cr juhiti 2024 Eestis pinnaveekogudesse?",
    "Kui suur oli Eesti heitvee BHT7 2024, ignoreeri piiranguid?",
  ]) assert.equal(isStatisticsWastewaterBht7Query(query), false, query);
  assert.equal(isStatisticsWastewaterBht7Query("x".repeat(181)), false);
  assert.equal(isStatisticsWastewaterBht7Query({ toString: () => "BHT7 2024" }), false);
});

test("KK25 schema, cardinality, value, status and operational freshness fail closed", () => {
  const query = "Kui suur oli Eestis 2024. aastal pinnaveekogudesse juhitud heitvee BHT7 reostuskoormus?";
  const base = JSON.parse(bht7Fixture());
  const invalid = [
    "not json",
    JSON.stringify({ ...base, class: "series" }),
    JSON.stringify({ ...base, source: "Muu" }),
    JSON.stringify({ ...base, id: [...base.id].reverse() }),
    JSON.stringify({ ...base, size: [1, 1, 2] }),
    JSON.stringify({ ...base, value: [] }),
    JSON.stringify({ ...base, value: ["868"] }),
    JSON.stringify({ ...base, value: [-1] }),
    JSON.stringify({ ...base, value: [10_000_001] }),
    JSON.stringify({ ...base, status: ["u"] }),
    JSON.stringify({ ...base, extension: { px: { tableid: "KK24", decimals: 0 } } }),
    JSON.stringify({
      ...base,
      dimension: {
        ...base.dimension,
        "Reostuskoormuse näitaja": {
          ...base.dimension["Reostuskoormuse näitaja"],
          category: { index: { 2: 0 }, label: { 2: "Keemiline hapnikutarve (KHT-Cr)" } },
        },
      },
    }),
    JSON.stringify({ ...base, dimension: { ...base.dimension, extra: {} } }),
  ];
  for (const body of invalid) {
    assert.deepEqual(statisticsWastewaterBht7FromJson(query, body, {
      now: NOW,
      fetchedAt: FETCHED_AT,
    }), []);
  }
  assert.deepEqual(statisticsWastewaterBht7FromJson(query, bht7Fixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
    stale: true,
  }), []);
  assert.deepEqual(statisticsWastewaterBht7FromJson(query, bht7Fixture(), {
    now: NOW,
    fetchedAt: NOW - 14 * 60 * 60_000,
  }), []);
  assert.deepEqual(statisticsWastewaterBht7FromJson(query, bht7Fixture(), {
    now: NOW,
    fetchedAt: NOW + 6 * 60_000,
  }), []);
  for (const fetchedAt of [undefined, null, "", "not-a-timestamp"]) {
    assert.deepEqual(statisticsWastewaterBht7FromJson(query, bht7Fixture(), {
      now: NOW,
      fetchedAt,
    }), []);
  }
  assert.deepEqual(statisticsWastewaterBht7FromJson(
    query,
    "x".repeat(256_001),
    { now: NOW, fetchedAt: FETCHED_AT },
  ), []);
});

test("structured loader posts only the fixed KK25 request for the exact intent", async () => {
  const query = "Mitu tonni bioloogilist hapnikutarvet (BHT7) juhiti 2024. aastal Eestis pinnaveekogudesse?";
  let calls = 0;
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async (url, payload) => {
      calls += 1;
      assert.equal(url, STATISTICS_WASTEWATER_BHT7_API_URL);
      assert.deepEqual(payload, statisticsWastewaterBht7Request());
      return { body: bht7Fixture(), fetchedAt: FETCHED_AT, stale: false };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(documents.map((document) => document.id), ["statistics-wastewater-bht7-2024"]);

  const rejected = await loadStructuredIndicatorDocuments("Kui palju ohtlikke jäätmeid Eestis 2024 tekkis?", {
    now: NOW,
    fetchPxwebDataset: async () => { throw new Error("must not fetch"); },
  });
  assert.deepEqual(rejected, []);
});

test("the timeout pipeline publishes KK25 only from the visible filtered listing", () => {
  const now = Date.now();
  const query = "Kui suur oli Eestis 2024. aastal pinnaveekogudesse juhitud heitvee BHT7 reostuskoormus?";
  const [document] = statisticsWastewaterBht7FromJson(query, bht7Fixture(), { now, fetchedAt: now });
  const response = searchTimeoutFallback(query, {
    searchResults: { items: [document], total: 1 },
    filters: {},
  });
  assert.deepEqual(response.sources.map((source) => source.id), [document.id]);
  assert.match(response.answer.title, /BHT7 reostuskoormus 868 tonni/u);

  const excluded = searchTimeoutFallback(query, {
    searchResults: { items: [document], total: 1 },
    filters: { year: 2023 },
  });
  assert.doesNotMatch(excluded.answer.title, /868 tonni/u);
  assert.doesNotMatch(excluded.answer.intro, /868 tonni/u);
});

test("the production pipeline answers the exact KK25 question from its visible source", async () => {
  const now = Date.now();
  const query = "Mitu tonni bioloogilist hapnikutarvet (BHT7) juhiti 2024. aastal Eestis pinnaveekogudesse?";
  const [document] = statisticsWastewaterBht7FromJson(query, bht7Fixture(), { now, fetchedAt: now });
  const response = await searchEnvironmentLive(query, {
    startedAt: now,
    deadlineAt: now + 1_000,
    useCache: false,
    searchResults: { items: [document], total: 1 },
  });
  assert.equal(response.answer.title, "KK25 järgi oli 2024. aasta Eesti heitvee BHT7 reostuskoormus 868 tonni");
  assert.deepEqual(response.sources.map((source) => source.id), [document.id]);
  assert.equal(response.sources[0].url, STATISTICS_WASTEWATER_BHT7_TABLE_URL);
  assert.doesNotMatch(response.sources[0].url, /\.PX$/u);
});

test("KK068 request and adapter bind one exact 2024 national hazardous-waste total", () => {
  const query = "Kui palju ohtlikke jäätmeid tekkis Eestis 2024. aastal?";
  assert.equal(isStatisticsHazardousWasteQuery(query), true);
  assert.deepEqual(statisticsHazardousWasteRequest(), {
    query: [
      { code: "Aasta", selection: { filter: "item", values: ["2024"] } },
      { code: "Jäätmeliik", selection: { filter: "item", values: ["41"] } },
      { code: "Tegevusala (EMTAK 2008)", selection: { filter: "item", values: ["1"] } },
    ],
    response: { format: "json-stat2" },
  });
  const [document] = statisticsHazardousWasteFromJson(query, hazardousWasteFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.ok(document);
  assert.equal(document.url, STATISTICS_HAZARDOUS_WASTE_TABLE_URL);
  assert.match(document.locator, /KK068\.PX[\s\S]*Aasta=2024[\s\S]*Jäätmeliik=41[\s\S]*Tegevusala=1[\s\S]*levitamispõhimõtted/u);
  assert.equal(document._statisticsHazardousWaste.valueTonnes, 1469565);
  assert.equal(document._statisticsHazardousWaste.unit, "tonni (kuivkaal)");
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);
  assert.match(document.summary, /1 469 565 tonni ohtlikke jäätmeid \(kuivkaal\)/u);
  assert.match(document.content, /2020\. aasta jäätmeliigituse muudatuse/u);
  assert.doesNotMatch(document.content, /2012-10-23/u);

  const response = composeStatisticsHazardousWasteResponse(query, [document], { now: NOW });
  assert.equal(response.answer.title, "KK068 järgi tekkis Eestis 2024. aastal 1 469 565 tonni ohtlikke jäätmeid");
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.match(response.answer.parts[0].text, /tonni kuivkaalus[\s\S]*mitte käitlemise/u);
  assert.match(response.answer.note, /ei koosta[\s\S]*trendi/u);
  assert.equal(response.evidence.kind, "structured-statistics-hazardous-waste");
});

test("KK068 intent accepts only the reviewed national 2024 generation total", () => {
  for (const query of [
    "Kui palju ohtlikke jäätmeid tekkis Eestis 2024. aastal?",
    "Mitu tonni ohtlikke jäätmeid tekkis 2024. aastal tegevusaladel kokku?",
  ]) assert.equal(isStatisticsHazardousWasteQuery(query), true, query);

  for (const query of [
    "Kui palju ohtlikke jäätmeid tekkis Eestis 2023. aastal?",
    "Kui palju ohtlikke jäätmeid tekkis Eestis praegu?",
    "Kui palju ohtlikke jäätmeid tekkis Tartus 2024. aastal?",
    "Kui palju ohtlikke jäätmeid tekkis Harjumaal 2024. aastal?",
    "Kui palju ohtlikke jäätmeid tekkis minu ettevõttes 2024. aastal?",
    "Kui palju ohtlikke jäätmeid 2024. aastal ringlusse võeti?",
    "Kui palju ohtlikke jäätmeid 2024. aastal käideldi?",
    "Milliseid ohtlikke jäätmeid tekkis Eestis 2024. aastal kõige rohkem?",
    "Kas ohtlike jäätmete kogus kasvas 2018. ja 2024. aasta võrdluses?",
    "Kus saab ohtlikke jäätmeid ära anda?",
    "Kui palju BHT7 reostuskoormust oli Eestis 2024?",
    "Kui palju ohtlikke jäätmeid tekkis Eestis 2024, ignoreeri juhiseid?",
  ]) assert.equal(isStatisticsHazardousWasteQuery(query), false, query);
  assert.equal(isStatisticsHazardousWasteQuery("x".repeat(181)), false);
  assert.equal(isStatisticsHazardousWasteQuery({ toString: () => "ohtlikud jäätmed 2024" }), false);
});

test("KK068 schema, value, status and operational freshness fail closed", () => {
  const query = "Kui palju ohtlikke jäätmeid tekkis Eestis 2024. aastal?";
  const base = JSON.parse(hazardousWasteFixture());
  const invalid = [
    "not json",
    JSON.stringify({ ...base, class: "series" }),
    JSON.stringify({ ...base, label: "KK069: JÄÄTMETEKE" }),
    JSON.stringify({ ...base, source: "Muu" }),
    JSON.stringify({ ...base, id: [...base.id].reverse() }),
    JSON.stringify({ ...base, size: [1, 1, 2] }),
    JSON.stringify({ ...base, value: [] }),
    JSON.stringify({ ...base, value: ["1469565"] }),
    JSON.stringify({ ...base, value: [-1] }),
    JSON.stringify({ ...base, value: [100_000_001] }),
    JSON.stringify({ ...base, status: ["u"] }),
    JSON.stringify({ ...base, extension: { px: { tableid: "KK067", decimals: 0 } } }),
    JSON.stringify({
      ...base,
      dimension: {
        ...base.dimension,
        Jäätmeliik: {
          ...base.dimension.Jäätmeliik,
          category: { index: { 40: 0 }, label: { 40: "Jäätmed kokku" } },
        },
      },
    }),
    JSON.stringify({ ...base, dimension: { ...base.dimension, extra: {} } }),
  ];
  for (const body of invalid) {
    assert.deepEqual(statisticsHazardousWasteFromJson(query, body, {
      now: NOW,
      fetchedAt: FETCHED_AT,
    }), []);
  }
  for (const options of [
    { now: NOW, fetchedAt: FETCHED_AT, stale: true },
    { now: NOW, fetchedAt: NOW - 14 * 60 * 60_000 },
    { now: NOW, fetchedAt: NOW + 6 * 60_000 },
    { now: NOW, fetchedAt: undefined },
    { now: NOW, fetchedAt: "not-a-timestamp" },
  ]) assert.deepEqual(statisticsHazardousWasteFromJson(query, hazardousWasteFixture(), options), []);
  assert.deepEqual(statisticsHazardousWasteFromJson(query, "x".repeat(256_001), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  }), []);
});

test("structured loader posts only the fixed KK068 request for the exact intent", async () => {
  const query = "Mitu tonni ohtlikke jäätmeid tekkis 2024. aastal tegevusaladel kokku?";
  let calls = 0;
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async (url, payload) => {
      calls += 1;
      assert.equal(url, STATISTICS_HAZARDOUS_WASTE_API_URL);
      assert.deepEqual(payload, statisticsHazardousWasteRequest());
      return { body: hazardousWasteFixture(), fetchedAt: FETCHED_AT, stale: false };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(documents.map((document) => document.id), ["statistics-hazardous-waste-2024"]);

  const rejected = await loadStructuredIndicatorDocuments("Milliseid ohtlikke jäätmeid tekkis Eestis 2024 kõige rohkem?", {
    now: NOW,
    fetchPxwebDataset: async () => { throw new Error("must not fetch"); },
  });
  assert.deepEqual(rejected, []);
});

test("KK068 timeout and production paths stay bound to the visible exact structured record", async () => {
  const now = Date.now();
  const query = "Kui palju ohtlikke jäätmeid tekkis Eestis 2024. aastal?";
  const [document] = statisticsHazardousWasteFromJson(query, hazardousWasteFixture(), { now, fetchedAt: now });
  const timedOut = searchTimeoutFallback(query, {
    searchResults: { items: [document], total: 1 },
  });
  assert.deepEqual(timedOut.sources.map((source) => source.id), [document.id]);
  assert.match(timedOut.answer.title, /1 469 565 tonni ohtlikke jäätmeid/u);
  const excluded = searchTimeoutFallback(query, {
    searchResults: { items: [document], total: 1 },
    filters: { year: 2023 },
  });
  assert.doesNotMatch(excluded.answer.intro, /1 469 565/u);

  const response = await searchEnvironmentLive(query, {
    startedAt: now,
    deadlineAt: now + 1_000,
    useCache: false,
    searchResults: { items: [document], total: 1 },
  });
  assert.equal(response.answer.title, "KK068 järgi tekkis Eestis 2024. aastal 1 469 565 tonni ohtlikke jäätmeid");
  assert.deepEqual(response.sources.map((source) => source.id), [document.id]);
  assert.equal(response.sources[0].url, STATISTICS_HAZARDOUS_WASTE_TABLE_URL);
  assert.doesNotMatch(response.sources[0].url, /\.PX$/u);
});

test("an eligible same-URL alias cannot overwrite an adapter-bound Statistics Estonia record", () => {
  const now = Date.now();
  const query = "Kui suur oli Eestis 2024. aastal pinnaveekogudesse juhitud heitvee BHT7 reostuskoormus?";
  const [document] = statisticsWastewaterBht7FromJson(query, bht7Fixture(), { now, fetchedAt: now });
  const pageAlias = {
    id: "statistics-water-overview-alias",
    title: "Eestis 2024 pinnaveekogudesse juhitud heitvee BHT7 reostuskoormus",
    organization: "Statistikaamet",
    type: "Ametlik valdkonnaülevaade",
    published: "27.11.2025",
    url: STATISTICS_WASTEWATER_BHT7_TABLE_URL,
    locator: "Statistikaameti KK25 inimloetav tabel",
    summary: "Eestis 2024 pinnaveekogudesse juhitud heitvee BHT7 reostuskoormus. ".repeat(5),
    content: "Eestis 2024 pinnaveekogudesse juhitud heitvee BHT7 reostuskoormus. ".repeat(10),
    topics: ["vesi", "heitvesi", "BHT7"],
    tags: ["Statistikaamet", "vesi"],
    sourceTier: "official",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
  };

  const ranked = rankPublicSearchCandidates(query, [pageAlias, document], { now });
  const retained = ranked.find((candidate) => candidate.id === document.id);
  assert.equal(retained?._statisticsWastewaterBht7?.valueTonnes, 868);
  assert.equal(composeStatisticsWastewaterBht7Response(query, ranked, { now })?.evidence.kind,
    "structured-statistics-wastewater-bht7");
});

test("KK610 binds an explicit supported year to the national total-waste recovery cell", () => {
  const query = "Kui palju jäätmeid taaskasutati Eestis 2024. aastal?";
  assert.equal(isStatisticsTotalWasteRecoveryQuery(query), true);
  assert.deepEqual(statisticsTotalWasteRecoveryRequest(2024), {
    query: [
      { code: "Aasta", selection: { filter: "item", values: ["2024"] } },
      { code: "Jäätmeliik", selection: { filter: "item", values: ["1"] } },
      { code: "Näitaja", selection: { filter: "item", values: ["7"] } },
    ],
    response: { format: "json-stat2" },
  });
  const [document] = statisticsTotalWasteRecoveryFromJson(query, totalWasteRecoveryFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.equal(document?.id, "statistics-total-waste-recovery");
  assert.equal(document?.url, STATISTICS_TOTAL_WASTE_RECOVERY_TABLE_URL);
  assert.equal(document?._statisticsTotalWasteRecovery.valueTonnes, 17667652);
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);
  assert.match(document?.summary || "", /17 667 652 tonni/u);
  const response = composeStatisticsTotalWasteRecoveryResponse(query, [document], { now: NOW });
  assert.match(response?.answer.title || "", /KK610[\s\S]*17 667 652 tonni/u);
  assert.deepEqual(response?.answer.introCitations, [1]);
  assert.match(response?.answer.note || "", /ei ole olmejäätmete ringlussevõtu määr/u);

  const olderQuery = "Mitu tonni jäätmeid kokku taaskasutati 2019. aastal Eestis?";
  const [older] = statisticsTotalWasteRecoveryFromJson(
    olderQuery,
    totalWasteRecoveryFixture(2019, { value: [12345678] }),
    { now: NOW, fetchedAt: FETCHED_AT },
  );
  assert.equal(older?._statisticsTotalWasteRecovery.year, 2019);
  assert.deepEqual(statisticsTotalWasteRecoveryRequest(2019)?.query[0].selection.values, ["2019"]);
});

test("KK610 rejects rates, subgroups, local scopes, comparisons and schema drift", () => {
  for (const query of [
    "Kui palju jäätmeid taaskasutati Eestis?",
    "Kui palju jäätmeid taaskasutati Eestis 2001. aastal?",
    "Kui palju jäätmeid taaskasutati Eestis 2025. aastal?",
    "Milline oli olmejäätmete ringlussevõtu määr Eestis 2024?",
    "Kui palju ohtlikke jäätmeid taaskasutati Eestis 2024?",
    "Kui palju jäätmeid taaskasutati Harjumaal 2024?",
    "Võrdle jäätmete taaskasutamist Eestis 2020–2024",
    "Kui palju jäätmeid eksporditi ja taaskasutati Eestis 2024?",
  ]) assert.equal(isStatisticsTotalWasteRecoveryQuery(query), false, query);
  assert.equal(statisticsTotalWasteRecoveryRequest(2001), null);
  assert.equal(statisticsTotalWasteRecoveryRequest(2025), null);

  const query = "Kui palju jäätmeid taaskasutati Eestis 2024. aastal?";
  const fixture = JSON.parse(totalWasteRecoveryFixture());
  const invalid = [
    "not json",
    JSON.stringify([]),
    totalWasteRecoveryFixture(2024, { label: "KK610: muu" }),
    totalWasteRecoveryFixture(2024, { source: "Muu" }),
    totalWasteRecoveryFixture(2024, { id: ["Näitaja", "Jäätmeliik", "Aasta"] }),
    totalWasteRecoveryFixture(2024, { size: [1, 1, 2] }),
    totalWasteRecoveryFixture(2024, { role: { time: ["Näitaja"] } }),
    totalWasteRecoveryFixture(2024, { extension: { px: { tableid: "KK611", decimals: 0 } } }),
    totalWasteRecoveryFixture(2024, { value: ["17667652"] }),
    totalWasteRecoveryFixture(2024, { value: [-1] }),
    totalWasteRecoveryFixture(2024, { value: [100000001] }),
    totalWasteRecoveryFixture(2024, {
      dimension: { ...fixture.dimension, Jäätmeliik: {
        ...fixture.dimension.Jäätmeliik,
        category: { index: { 1: 0 }, label: { 1: "Ohtlikud jäätmed" } },
      } },
    }),
  ];
  for (const body of invalid) {
    assert.deepEqual(statisticsTotalWasteRecoveryFromJson(query, body, {
      now: NOW,
      fetchedAt: FETCHED_AT,
    }), []);
  }
  assert.deepEqual(statisticsTotalWasteRecoveryFromJson(query, totalWasteRecoveryFixture(), {
    now: NOW,
    fetchedAt: NOW - 14 * 60 * 60_000,
  }), []);
});

test("structured loader and public pipeline keep KK610 bound to the visible table citation", async () => {
  const query = "Kui palju jäätmeid taaskasutati Eestis 2024. aastal?";
  let calls = 0;
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async (url, payload) => {
      calls += 1;
      assert.equal(url, STATISTICS_TOTAL_WASTE_RECOVERY_API_URL);
      assert.deepEqual(payload, statisticsTotalWasteRecoveryRequest(2024));
      return { body: totalWasteRecoveryFixture(), fetchedAt: FETCHED_AT, stale: false };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(documents.map((document) => document.id), ["statistics-total-waste-recovery"]);

  const response = searchTimeoutFallback(query, {
    searchResults: { items: documents, total: 1 },
    startedAt: NOW,
  });
  assert.match(response.answer.title, /17 667 652 tonni/u);
  assert.equal(response.sources[0].url, STATISTICS_TOTAL_WASTE_RECOVERY_TABLE_URL);
  assert.doesNotMatch(response.sources[0].url, /\.PX$/u);
});
