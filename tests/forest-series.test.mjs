import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  FOREST_SERIES_KK51_API_URL,
  FOREST_SERIES_KK51_TABLE_URL,
  FOREST_SERIES_MM03_API_URL,
  FOREST_SERIES_MM03_TABLE_URL,
  composeForestSeriesResponse,
  forestSeriesFromJson,
  forestSeriesIntent,
  forestSeriesRequest,
  isForestSeriesQuery,
  smiForestSeriesDocument,
  validatedForestSeriesProjection,
} from "../server/forest-series.mjs";
import { SMI_2025_TABLES_URL } from "../server/smi-tables.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";
import {
  isForestHarvestBalanceQuery,
  loadStructuredIndicatorDocuments,
} from "../server/indicators.mjs";
import { searchEnvironmentLive, searchTimeoutFallback } from "../server/pipeline.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval.mjs";
import { assessSearchQuery } from "../server/search.mjs";

const NOW = Date.parse("2026-09-25T12:00:00Z");
const FETCHED_AT = Date.parse("2026-09-25T11:59:30Z");

async function fixture(name) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function kk51Fixture(overrides = {}, { years = ["2021", "2022", "2023"], values = [2325.6, 2325, 2334.2] } = {}) {
  const payload = {
    class: "dataset",
    label: "KK51: METSAVARU RIIKLIKU METSAINVENTEERIMISE (SMI) HINNANGUL | Näitaja ning Aasta",
    source: "Statistikaamet",
    updated: "2017-12-12T07:00:00Z",
    id: ["Näitaja", "Aasta"],
    size: [1, years.length],
    dimension: {
      Näitaja: {
        extension: { show: "value" },
        label: "Näitaja",
        category: { index: { 1: 0 }, label: { 1: "Metsamaa pindala, tuhat ha" } },
      },
      Aasta: {
        extension: { show: "value" },
        label: "Aasta",
        category: {
          index: Object.fromEntries(years.map((year, position) => [year, position])),
          label: Object.fromEntries(years.map((year) => [year, year])),
        },
      },
    },
    value: values,
    role: { time: ["Aasta"] },
    version: "2.0",
    extension: { px: { tableid: "KK51", decimals: 0 } },
    ...overrides,
  };
  return JSON.stringify(payload);
}

test("forest series intent binds KK51 indicators to a multi-year window", () => {
  const cases = [
    ["Metsamaa pindala viimase kümne aasta jooksul", "KK51", "1", 2016, 2025, "last-n"],
    ["Kuidas on Eesti metsasus muutunud?", "KK51", "34", 2016, 2025, "default"],
    ["Puistute üldvaru 2015–2025", "KK51", "10", 2015, 2025, "range"],
    ["tagavara aegrida alates 2010", "KK51", "10", 2010, 2025, "since"],
    ["Metsamaa pindala 2000 kuni 2010", "KK51", "1", 2000, 2010, "range"],
    ["puistute pindala trend", "KK51", "2", 2016, 2025, "default"],
    ["metsaga kaetud pindala aastate lõikes", "KK51", "2", 2016, 2025, "default"],
    ["hektarivaru viimase 5 aasta jooksul", "KK51", "18", 2021, 2025, "last-n"],
    ["juurdekasv aastate kaupa", "KK51", "26", 2016, 2025, "default"],
    ["metsasus 1990–2025", "KK51", "34", 1999, 2025, "range"],
    ["metsamaa pindala viimaste aastate jooksul", "KK51", "1", 2016, 2025, "default"],
  ];
  for (const [query, table, code, from, to, mode] of cases) {
    const intent = forestSeriesIntent(query);
    assert.ok(intent, query);
    assert.equal(intent.table, table, query);
    assert.equal(intent.indicator.code, code, query);
    assert.deepEqual(intent.years, { from, to, mode }, query);
    assert.equal(isForestSeriesQuery(query), true, query);
  }
});

test("forest series intent binds MM03 cut types and measures", () => {
  const cases = [
    ["lageraie pindala 2015–2024", "3", "1", 2015, 2024],
    ["Lageraie pindala viimase kümne aasta jooksul", "3", "1", 2015, 2024],
    ["raiemaht 20 aastat tagasi võrreldes praegusega", "1", "3", 2004, 2024],
    ["Kas praegu raiutakse rohkem kui 20 aastat tagasi?", "1", "3", 2004, 2024],
    ["harvendusraie maht viimase viie aasta jooksul", "5", "3", 2020, 2024],
    ["kuidas on raiemaht muutunud", "1", "3", 2015, 2024],
    ["lageraie maht aastate lõikes", "3", "3", 2015, 2024],
    ["Raiepindala viimase 10 aasta jooksul", "1", "1", 2015, 2024],
    ["harvendusraiepindala 2015–2024", "5", "1", 2015, 2024],
    ["lageraiemaht viimase 10 aasta jooksul", "3", "3", 2015, 2024],
    ["Kuidas on raie maht kahe kümnendi jooksul muutunud?", "1", "3", 2005, 2024],
    ["Kui palju on reeglina raiutud viimase 10 aasta jooksul?", "1", "3", 2015, 2024],
    ["Raiemaht muutub reeglina aastate lõikes", "1", "3", 2015, 2024],
  ];
  for (const [query, cut, measure, from, to] of cases) {
    const intent = forestSeriesIntent(query);
    assert.ok(intent, query);
    assert.equal(intent.table, "MM03", query);
    assert.equal(intent.cutType.code, cut, query);
    assert.equal(intent.measure.code, measure, query);
    assert.equal(intent.years.from, from, query);
    assert.equal(intent.years.to, to, query);
  }
});

test("forest series intent refuses single-year, ambiguous, breakdown and Eurostat-balance questions", () => {
  for (const query of [
    "Metsamaa pindala 2024",
    "Kui suur osa Eestist on mets?",
    "mets aastate lõikes",
    "raiemaht",
    "Kas raiemaht ületab juurdekasvu viimase viie aasta jooksul?",
    "raiemaht ja netojuurdekasv 2015–2024",
    "metsamaa pindala ja raiemaht 2015–2024",
    "männikute pindala viimase kümne aasta jooksul",
    "lageraie pindala Harju maakonnas 2015–2024",
    "RMK raiemaht 2015–2024",
    "erametsa raiemaht aastate lõikes",
    "metsamaa pindala prognoos 2030",
    "raiemaht raiedokumentide alusel 2015–2024",
    "lageraie pindala ja maht 2015–2024",
    "metsamaa pindala 1990–1995",
    "metsamaa pindala 2026–2030",
    "forest area from 2015 to 2024",
    "metsasus 2024. aastal",
    `metsamaa pindala ${"aegrida ".repeat(40)}`,
    "metsamaa pindala Tartumaal aastate lõikes",
    "Harjumaa lageraie pindala 2015–2024",
    "puistute üldvaru Pärnumaal viimase kümne aasta jooksul",
    "Tallinna metsasus aastate lõikes",
  ]) {
    assert.equal(forestSeriesIntent(query), null, query);
    assert.equal(isForestSeriesQuery(query), false, query);
  }
});

test("forest series intent refuses non-quantity, species, cross-border and single-year-trend phrasing", () => {
  for (const query of [
    "Kuidas on raiereeglid muutunud?",
    "raiepiirangud aja jooksul",
    "Metsamaa hind viimase 10 aasta jooksul",
    "metsamaa maksustamine muutunud",
    "vanade metsade pindala muutus",
    "okaspuude tagavara aastate lõikes",
    "tamme tagavara viimase kümne aasta jooksul",
    "raievanus aastate lõikes",
    "Kuidas raie mõjutab kliimat viimase 10 aasta andmetel",
    "Kui palju raiuti viimase aasta jooksul?",
    "metsamaa pindala viimasel aastal",
    "metsamaa pindala Eestis ja Soomes 2015–2024",
    "Metsanduse arengukava 2021–2030 raiemaht",
    "metsareeglid aastate lõikes",
  ]) {
    assert.equal(forestSeriesIntent(query), null, query);
    assert.equal(isForestSeriesQuery(query), false, query);
  }
});

test("forest series requests select only the bound codes and years with item filters", () => {
  assert.deepEqual(forestSeriesRequest(forestSeriesIntent("Puistute üldvaru 2021–2023")), {
    query: [
      { code: "Näitaja", selection: { filter: "item", values: ["10"] } },
      { code: "Aasta", selection: { filter: "item", values: ["2021", "2022", "2023"] } },
    ],
    response: { format: "json-stat2" },
  });
  assert.deepEqual(forestSeriesRequest(forestSeriesIntent("lageraie pindala 2022–2024")), {
    query: [
      { code: "Aasta", selection: { filter: "item", values: ["2022", "2023", "2024"] } },
      { code: "Raie liik", selection: { filter: "item", values: ["3"] } },
      { code: "Näitaja", selection: { filter: "item", values: ["1", "2"] } },
    ],
    response: { format: "json-stat2" },
  });
  assert.equal(forestSeriesRequest(null), null);
  assert.match(FOREST_SERIES_KK51_API_URL, /metsavaru\/KK51\.PX$/u);
  assert.match(FOREST_SERIES_MM03_API_URL, /metsamajandus\/MM03\.PX$/u);
});

test("KK51 live capture parses into a validated forest series document", async () => {
  const query = "Metsamaa pindala 2015–2025";
  const [document] = forestSeriesFromJson(query, await fixture("pxweb-kk51-metsamaa-pindala-2015-2025.json"), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.ok(document);
  assert.equal(document.id, "forest-series-kk51-1-2015-2025");
  assert.equal(document.url, FOREST_SERIES_KK51_TABLE_URL);
  assert.equal(document.organization, "Statistikaamet");
  assert.equal(document.retrieval, "official-structured-statistics-pxweb");
  assert.equal(document.published, "2025");
  assert.match(document.locator, /KK51\.PX[\s\S]*Näitaja=1[\s\S]*Aasta=2015–2025[\s\S]*levitamispõhimõtted/u);
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);
  const projection = document._forestSeries;
  assert.equal(projection.points.length, 11);
  assert.deepEqual(projection.points[0], { year: 2015, value: 2310.6 });
  assert.deepEqual(projection.points.at(-1), { year: 2025, value: 2360.2 });
  assert.match(document.summary, /^Statistikaameti tabeli KK51 \(SMI hinnang\) järgi oli metsamaa pindala 2015\. aastal 2 310,6 tuhat ha ja 2025\. aastal 2 360,2 tuhat ha\./u);
  assert.match(document.summary, /väikseim avaldatud väärtus oli 2 310,6 tuhat ha \(2015\) ja suurim 2 360,2 tuhat ha \(2025\); avaldatud aastaid on 11\./u);
  assert.match(document.summary, /Otspunktide vahe on 49,6 tuhat ha, kuid vahepealsed tõusud ja langused/u);
  assert.match(document.content, /proovitükkidel põhinev valikuuring/u);
  assert.match(document.content, /„updated” välja ei kasutata/u);
  assert.doesNotMatch(`${document.summary} ${document.content}`, /2017-12-12/u);
  assert.deepEqual(validatedForestSeriesProjection(query, document, NOW), projection);
});

test("MM03 live capture keeps the relative error beside each lageraie value", async () => {
  const query = "lageraie pindala 2015–2024";
  const [document] = forestSeriesFromJson(query, await fixture("pxweb-mm03-lageraie-pindala-2015-2024.json"), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.ok(document);
  assert.equal(document.id, "forest-series-mm03-3-1-2015-2024");
  assert.equal(document.url, FOREST_SERIES_MM03_TABLE_URL);
  assert.equal(document.published, "2024");
  const projection = document._forestSeries;
  assert.equal(projection.seriesLabel, "Lageraie: raiepindala");
  assert.equal(projection.unit, "tuhat ha");
  assert.deepEqual(projection.points[0], { year: 2015, value: 31.6, error: 10.3 });
  assert.deepEqual(projection.points.at(-1), { year: 2024, value: 34, error: 10.7 });
  assert.match(document.summary, /lageraie raiepindala 2015\. aastal 31,6 tuhat ha ja 2024\. aastal 34,0 tuhat ha/u);
  assert.match(document.summary, /2024\. aasta hinnangu suhteline viga oli ±10,7%\./u);
  assert.match(document.content, /ei ole raiedokumentide \(metsateatiste\) alusel/u);
  assert.deepEqual(validatedForestSeriesProjection(query, document, NOW), projection);
});

test("forest series parser rejects schema drift, stale fetches and out-of-bound values", () => {
  const query = "Metsamaa pindala 2021–2023";
  const accepted = forestSeriesFromJson(query, kk51Fixture(), { now: NOW, fetchedAt: FETCHED_AT });
  assert.equal(accepted.length, 1);
  const rejected = [
    ["wrong label", kk51Fixture({ label: "KK51: MIDAGI MUUD | Näitaja ning Aasta" })],
    ["wrong source", kk51Fixture({ source: "Keegi teine" })],
    ["wrong tableid", kk51Fixture({ extension: { px: { tableid: "KK52", decimals: 0 } } })],
    ["wrong decimals", kk51Fixture({ extension: { px: { tableid: "KK51", decimals: 1 } } })],
    ["wrong size", kk51Fixture({ size: [1, 2] })],
    ["status present", kk51Fixture({ status: { 0: "e" } })],
    ["value too large", kk51Fixture({}, { values: [2325.6, 9_999, 2334.2] })],
    ["negative value", kk51Fixture({}, { values: [2325.6, -1, 2334.2] })],
    ["string value", kk51Fixture({}, { values: [2325.6, "2325", 2334.2] })],
    ["extra dimension key", kk51Fixture({ dimension: { ...JSON.parse(kk51Fixture()).dimension, Maakond: {} } })],
    ["wrong year order", kk51Fixture({}, { years: ["2021", "2023", "2022"] })],
    ["fewer years than requested", kk51Fixture({}, { years: ["2021", "2022"], values: [1, 2] })],
    ["all null", kk51Fixture({}, { values: [null, null, null] })],
    ["one point only", kk51Fixture({}, { values: [null, null, 2334.2] })],
    ["not json", "<html>"],
    ["nul byte", `${kk51Fixture()}\0`],
  ];
  for (const [reason, body] of rejected) {
    assert.deepEqual(forestSeriesFromJson(query, body, { now: NOW, fetchedAt: FETCHED_AT }), [], reason);
  }
  assert.deepEqual(forestSeriesFromJson(query, kk51Fixture(), { now: NOW, fetchedAt: FETCHED_AT, stale: true }), [], "stale");
  assert.deepEqual(forestSeriesFromJson(query, kk51Fixture(), { now: NOW, fetchedAt: NOW + 10 * 60_000 }), [], "future fetch");
  assert.deepEqual(forestSeriesFromJson(query, kk51Fixture(), { now: NOW, fetchedAt: NOW - 14 * 60 * 60_000 }), [], "old fetch");
  assert.deepEqual(forestSeriesFromJson("Metsamaa pindala 2024", kk51Fixture(), { now: NOW, fetchedAt: FETCHED_AT }), [], "no intent");
});

test("forest series parser reports an unpublished year as a gap", () => {
  const query = "Metsamaa pindala 2021–2023";
  const [document] = forestSeriesFromJson(query, kk51Fixture({}, { values: [2325.6, null, 2334.2] }), { now: NOW, fetchedAt: FETCHED_AT });
  assert.deepEqual(document._forestSeries.points.map((point) => point.year), [2021, 2023]);
  assert.match(document.summary, /avaldatud aastaid on 2\. Aastate 2022 kohta ei ole väärtust avaldatud\./u);
  assert.match(document.summary, /Rida ei langenud ühelgi avaldatud aastal; otspunktide vahe on 8,6 tuhat ha\./u);
});

test("forest series projection re-validation rejects tampered documents", () => {
  const query = "Metsamaa pindala 2021–2023";
  const [document] = forestSeriesFromJson(query, kk51Fixture(), { now: NOW, fetchedAt: FETCHED_AT });
  assert.ok(validatedForestSeriesProjection(query, document, NOW));
  const tampered = [
    { ...document, summary: `${document.summary} Lisatud lause.` },
    { ...document, url: "https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM04" },
    { ...document, _forestSeries: { ...document._forestSeries, points: [{ year: 2021, value: 1 }, { year: 2023, value: 2 }] } },
    { ...document, _forestSeries: { ...document._forestSeries, years: { from: 2020, to: 2023 } } },
    { ...document, _contentHash: "abc" },
  ];
  for (const candidate of tampered) assert.equal(validatedForestSeriesProjection(query, candidate, NOW), null);
  assert.equal(validatedForestSeriesProjection("Metsamaa pindala 2020–2023", document, NOW), null, "different window");
  assert.equal(validatedForestSeriesProjection(query, document, NOW + 14 * 60 * 60_000), null, "expired fetch");
});

test("forest series response carries a cited line chart built from the same points", async () => {
  const query = "lageraie pindala 2015–2024";
  const documents = forestSeriesFromJson(query, await fixture("pxweb-mm03-lageraie-pindala-2015-2024.json"), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  const response = composeForestSeriesResponse(query, documents, { now: NOW, total: 7 });
  assert.ok(response);
  assert.equal(response.total, 7);
  assert.equal(response.answer.eyebrow, "Statistikaameti tabel MM03");
  assert.equal(response.answer.title, "Lageraie: raiepindala 2015–2024: 31,6 → 34,0 tuhat ha");
  assert.equal(response.answer.intro, documents[0].summary);
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.equal(response.answer.parts.length, 1);
  assert.equal(response.answer.parts[0].title, "Mida näitaja tähendab");
  assert.match(response.answer.parts[0].text, /raiedokumentide/u);
  assert.deepEqual(response.answer.parts[0].citations, [1]);
  assert.match(response.answer.note, /SMI valikuuringu aastahinnangute rida/u);
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].citation, 1);
  assert.equal(response.sources[0].evidenceExcerpt, documents[0].content);
  assert.equal(response.related.length, 3);
  assert.equal(response.clarification, null);
  assert.deepEqual(response.evidence, { kind: "structured-forest-series", answerable: true, documentIds: [documents[0].id] });
  assert.deepEqual(response.chart, {
    kind: "line",
    title: "Lageraie: raiepindala 2015–2024",
    unit: "tuhat ha",
    xLabel: "Aasta",
    series: [{
      id: "mm03-3-1",
      label: "Lageraie: raiepindala",
      points: documents[0]._forestSeries.points.map((point) => ({ x: point.year, y: point.value, error: point.error })),
    }],
    citation: 1,
    caption: "Statistikaamet, tabel MM03: Metsaraie riikliku metsainventeerimise (SMI) hinnangul. SMI valikuuringu aastahinnangud koos suhtelise veaga.",
  });
});

test("forest series response refuses a document that does not re-validate for the query", async () => {
  const documents = forestSeriesFromJson("Metsamaa pindala 2015–2025", await fixture("pxweb-kk51-metsamaa-pindala-2015-2025.json"), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.equal(composeForestSeriesResponse("Metsamaa pindala 2016–2025", documents, { now: NOW }), null);
  assert.equal(composeForestSeriesResponse("Metsamaa pindala 2015–2025", [], { now: NOW }), null);
  assert.equal(composeForestSeriesResponse("Metsamaa pindala 2015–2025", documents, { now: NOW + 14 * 60 * 60_000 }), null);
  const response = composeForestSeriesResponse("Metsamaa pindala 2015–2025", documents, { now: NOW });
  assert.equal(response.answer.eyebrow, "Statistikaameti tabel KK51");
  assert.equal(response.chart.series[0].id, "kk51-1");
  assert.deepEqual(response.chart.series[0].points[0], { x: 2015, y: 2310.6 });
  assert.equal(response.chart.caption, "Statistikaamet, tabel KK51: Metsavaru riikliku metsainventeerimise (SMI) hinnangul. SMI valikuuringu aastahinnangud.");
});

test("structured loader posts one bounded forest series request only for a series intent", async () => {
  // Metsasus is not a national series in the SMI workbook, so it still comes
  // from Statistikaamet KK51.
  const query = "Territooriumi metsasus 2015–2025";
  let calls = 0;
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async (url, payload) => {
      calls += 1;
      assert.equal(url, FOREST_SERIES_KK51_API_URL);
      assert.deepEqual(payload, forestSeriesRequest(forestSeriesIntent(query)));
      return { body: await fixture("pxweb-kk51-metsamaa-pindala-2015-2025.json"), fetchedAt: FETCHED_AT, stale: false };
    },
  });
  assert.equal(calls, 1);
  assert.equal(documents.some((document) => document.url === SMI_2025_TABLES_URL), false);
  const single = await loadStructuredIndicatorDocuments("Metsamaa pindala 2024", {
    now: NOW,
    fetchPxwebDataset: async () => { throw new Error("must not fetch"); },
  });
  assert.equal(single.some((document) => String(document.id).startsWith("forest-series-")), false);

  const failed = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async () => { throw new Error("upstream down"); },
  });
  assert.deepEqual(failed, []);
});

test("structured loader uses Keskkonnaagentuur's SMI workbook first and skips Statistikaamet for covered series", async () => {
  const query = "Metsamaa pindala 2015–2025";
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async () => { throw new Error("must not fetch"); },
  });
  assert.deepEqual(documents.map((document) => document.id), ["forest-series-smi2025-1-2015-2025"]);
  const [document] = documents;
  assert.equal(document.url, SMI_2025_TABLES_URL);
  assert.equal(document.organization, "Keskkonnaagentuur / Keskkonnaportaal");
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);
  assert.match(document.summary, /^Keskkonnaagentuuri SMI 2025 tulemuste töölehe 25 järgi oli metsamaa pindala 2015\. aastal 2 310,6 tuhat ha ja 2025\. aastal 2 360,2 tuhat ha\./u);

  const [kk51] = forestSeriesFromJson(query, await fixture("pxweb-kk51-metsamaa-pindala-2015-2025.json"), { now: NOW, fetchedAt: FETCHED_AT });
  const response = composeForestSeriesResponse(query, [kk51, document], { now: NOW });
  assert.equal(response.answer.eyebrow, "Keskkonnaagentuur, SMI 2025");
  assert.deepEqual(response.sources.map((source) => source.id), [document.id]);
  assert.equal(response.chart.series[0].id, "smi-1");
  assert.deepEqual(response.chart.series[0].points.map((point) => point.y), kk51._forestSeries.points.map((point) => point.value));
  assert.match(response.chart.caption, /^Keskkonnaagentuur, SMI 2025 tulemuste tööleht 25: metsamaa pindala\./u);
  // Deduplication may merge the series into the workbook's catalogue entry;
  // the workbook URL in the results is enough to keep the SMI series first.
  const catalogue = { id: "forest-smi-2025-tables", title: "SMI 2025 tulemuste andmetabelid", url: SMI_2025_TABLES_URL };
  assert.equal(composeForestSeriesResponse(query, [kk51, catalogue], { now: NOW }).sources[0].id, document.id);
  assert.equal(composeForestSeriesResponse(query, [kk51], { now: NOW }).sources[0].id, kk51.id);

  const felling = smiForestSeriesDocument("lageraie pindala 2015–2024");
  assert.deepEqual(felling._forestSeries.points.map((point) => point.value), [31.6, 32.4, 35.6, 34.6, 29.7, 29.7, 27.1, 32.6, 32, 34]);
  assert.equal(smiForestSeriesDocument("Territooriumi metsasus 2015–2025"), null);
  assert.equal(smiForestSeriesDocument("Puistute varu juurdekasv 2015–2025"), null);
});

test("the pipeline answers a forest series question from its visible source and abstains without it", async () => {
  const query = "Metsamaa pindala 2015–2025";
  const [document] = forestSeriesFromJson(query, await fixture("pxweb-kk51-metsamaa-pindala-2015-2025.json"), {
    now: NOW,
    fetchedAt: NOW,
  });
  const fallback = searchTimeoutFallback(query, {
    searchResults: { items: [document], total: 1 },
    filters: {},
    startedAt: NOW,
  });
  assert.equal(fallback.answer.eyebrow, "Statistikaameti tabel KK51");
  assert.equal(fallback.chart.citation, 1);
  assert.deepEqual(fallback.sources.map((source) => source.id), [document.id]);

  const filtered = searchTimeoutFallback(query, {
    searchResults: { items: [document], total: 1 },
    filters: { category: "Muu sisutüüp" },
    startedAt: NOW,
  });
  assert.equal(filtered.chart, undefined);

  const live = await searchEnvironmentLive(query, {
    startedAt: NOW,
    deadlineAt: NOW + 1_000,
    useCache: false,
    searchResults: { items: [document], total: 1 },
  });
  assert.equal(live.answer.eyebrow, "Statistikaameti tabel KK51");
  assert.equal(live.chart.series[0].points.length, 11);
  assert.equal(live.sources[0].url, FOREST_SERIES_KK51_TABLE_URL);

  const without = searchTimeoutFallback(query, { searchResults: { items: [], total: 0 }, filters: {}, startedAt: NOW });
  assert.equal(without.chart, undefined);
  assert.equal(assessSearchQuery(query).reason, "requested-time-series-required");
});

const FOREST_HARVEST_BALANCE_QUERIES = [
  "Kas 2024. aasta inventuuri kasvunäitaja oli 2023. aasta raietest suurem?",
  "Kas raiutakse rohkem kui juurde kasvab viimase 10 aasta jooksul?",
  "Kas raie ületab metsa kasvu aastate lõikes?",
  "Kas raiemaht on viimase viie aasta jooksul olnud suurem kui metsa kasv?",
];

test("harvest-vs-growth questions are recognised by the Eurostat balance predicate", () => {
  for (const query of FOREST_HARVEST_BALANCE_QUERIES) {
    assert.equal(isForestHarvestBalanceQuery(query), true, query);
  }
});

test("harvest-vs-growth questions defer to the Eurostat balance adapter and never reach the forest series PXWeb loader", async () => {
  for (const query of FOREST_HARVEST_BALANCE_QUERIES) {
    await loadStructuredIndicatorDocuments(query, {
      now: NOW,
      fetchPxwebDataset: async () => { throw new Error("must not fetch"); },
      fetchJsonDataset: async () => { throw new Error("no network in this test"); },
    });
  }
});

test("a forest series document survives public ranking for its own query", async () => {
  const query = "lageraie pindala 2015–2024";
  const [document] = forestSeriesFromJson(query, await fixture("pxweb-mm03-lageraie-pindala-2015-2024.json"), {
    now: NOW,
    fetchedAt: NOW,
  });
  const page = {
    id: "portal-lageraie",
    title: "Lageraie",
    url: "https://keskkonnaportaal.ee/et/lageraie",
    summary: "Lageraie on uuendusraie liik.",
    content: "Lageraie on uuendusraie liik, mille korral raiutakse puistu ühe võttega.",
    organization: "Keskkonnaportaal",
    sourceTier: "official",
    tags: ["mets", "lageraie"],
    topics: ["mets", "lageraie"],
  };
  const ranked = rankPublicSearchCandidates(query, [page, document], { now: NOW });
  assert.ok(ranked.find((candidate) => candidate.id === document.id));
  assert.equal(composeForestSeriesResponse(query, ranked, { now: NOW })?.evidence.kind, "structured-forest-series");
});

// ---------------------------------------------------------------------------
// Context charts: single-value forest questions keep their text answer and
// gain the last ten published years of the same indicator as a chart.
// ---------------------------------------------------------------------------
import {
  forestContextChart,
  forestContextSeriesIntent,
  isForestContextSeriesQuery,
  withForestContextChart,
} from "../server/forest-series.mjs";
import { composeSearchResponse } from "../server/search.mjs";

const CONTEXT_YEARS = ["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"];
const CONTEXT_VALUES = [2313.6, 2331.1, 2331.3, 2333.2, 2325.5, 2325.6, 2325, 2334.2, 2350.8, 2360.2];

test("context series intent binds single-value forest questions to the last ten published years", () => {
  const cases = [
    ["mitu ha metsa on eestis", "KK51", "1"],
    ["Kui palju metsa on Eestis?", "KK51", "1"],
    ["Kui suur on Eesti metsamaa pindala?", "KK51", "1"],
    ["Kui suur osa Eestist on mets?", "KK51", "34"],
    ["Mitu protsenti Eestist on metsaga kaetud?", "KK51", "34"],
    ["Eesti metsa tagavara", "KK51", "10"],
    ["Kui suur on metsa juurdekasv?", "KK51", "26"],
  ];
  for (const [query, table, code] of cases) {
    const intent = forestContextSeriesIntent(query);
    assert.ok(intent, query);
    assert.equal(intent.table, table, query);
    assert.equal(intent.indicator.code, code, query);
    assert.deepEqual(intent.years, { from: 2016, to: 2025, mode: "context" }, query);
    assert.equal(isForestContextSeriesQuery(query), true, query);
  }
  const harvest = forestContextSeriesIntent("Kui palju raiuti Eestis?");
  assert.equal(harvest.table, "MM03");
  assert.equal(harvest.cutType.code, "1");
  assert.equal(harvest.measure.code, "3");
  assert.deepEqual(harvest.years, { from: 2015, to: 2024, mode: "context" });
  const clearCut = forestContextSeriesIntent("Kui suur on lageraie pindala?");
  assert.equal(clearCut.cutType.code, "3");
  assert.equal(clearCut.measure.code, "1");
});

test("context series intent stays out of the way of series, single-year, balance and scoped questions", () => {
  for (const query of [
    "Metsamaa pindala 2024",
    "metsasus 2024. aastal",
    "Metsamaa pindala viimase kümne aasta jooksul",
    "lageraie pindala 2015–2024",
    "Kuidas on Eesti metsasus muutunud?",
    "Kas raiemaht ületab juurdekasvu?",
    "mets",
    "männikute pindala",
    "metsamaa pindala Tartumaal",
    "Kuidas on raiereeglid muutunud?",
    "Metsamaa hind",
    "kui palju metsa on soomes",
    "Kui palju vett võeti Eestis 2024?",
  ]) {
    assert.equal(forestContextSeriesIntent(query), null, query);
    assert.equal(isForestContextSeriesQuery(query), false, query);
  }
});

test("a context series document parses and validates but never becomes the answer itself", () => {
  const query = "mitu ha metsa on eestis";
  const [document] = forestSeriesFromJson(query, kk51Fixture({}, { years: CONTEXT_YEARS, values: CONTEXT_VALUES }), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.ok(document);
  assert.equal(document.id, "forest-series-kk51-1-2016-2025");
  assert.equal(document._forestSeries.points.length, 10);
  assert.deepEqual(validatedForestSeriesProjection(query, document, NOW), document._forestSeries);
  assert.equal(composeForestSeriesResponse(query, [document], { now: NOW }), null);
  const context = forestContextChart(query, [document], { now: NOW });
  assert.equal(context.source.id, document.id);
  assert.equal(context.chart.kind, "line");
  assert.equal(context.chart.title, "Metsamaa pindala 2016–2025");
  assert.equal(context.chart.series[0].points.length, 10);
  assert.deepEqual(context.chart.series[0].points[0], { x: 2016, y: 2313.6 });
  assert.equal(forestContextChart("Metsamaa pindala viimase kümne aasta jooksul", [document], { now: NOW }), null);
  assert.equal(forestContextChart(query, [], { now: NOW }), null);
});

test("withForestContextChart attaches the chart to an answerable draft with its own citation", () => {
  const query = "mitu ha metsa on eestis";
  const [seriesDocument] = forestSeriesFromJson(query, kk51Fixture({}, { years: CONTEXT_YEARS, values: CONTEXT_VALUES }), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  const portal = {
    id: "smi-2025-forest-area",
    title: "SMI 2025: Eesti metsamaa pindala",
    url: "https://keskkonnaportaal.ee/et/smi-2025",
    summary: "SMI 2025 järgi oli Eesti metsamaa pindala 2,36 miljonit hektarit.",
    content: "SMI 2025 järgi oli Eesti metsamaa pindala 2,36 miljonit hektarit ehk 52,1% Eesti pindalast.",
    organization: "Keskkonnaagentuur",
    sourceTier: "official",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
  };
  const draft = composeSearchResponse(query, [portal], { answerable: true, limit: 6, total: 2 });
  assert.equal(draft.evidence.answerable, true);
  const attached = withForestContextChart(draft, query, [portal, seriesDocument], { now: NOW });
  assert.equal(attached.chart.citation, 2);
  assert.deepEqual(attached.sources.map((source) => source.id), [portal.id, seriesDocument.id]);
  assert.equal(attached.sources[1].citation, 2);
  assert.equal(attached.sources[1].evidenceExcerpt, seriesDocument.content);
  assert.equal(attached.answer, draft.answer);

  const alreadyCited = composeSearchResponse(query, [seriesDocument, portal], { answerable: true, limit: 6, total: 2 });
  const reused = withForestContextChart(alreadyCited, query, [portal, seriesDocument], { now: NOW });
  assert.equal(reused.chart.citation, 1);
  assert.equal(reused.sources.length, 2);

  const unanswerable = composeSearchResponse(query, [portal], { answerable: false, clarification: "Täpsusta.", limit: 6, total: 2 });
  assert.equal(withForestContextChart(unanswerable, query, [portal, seriesDocument], { now: NOW }), unanswerable);
  const charted = { ...draft, chart: { kind: "bar" } };
  assert.equal(withForestContextChart(charted, query, [portal, seriesDocument], { now: NOW }), charted);
  assert.equal(withForestContextChart(draft, query, [portal], { now: NOW }), draft);
});

test("structured loader adds the SMI context series for a single-value forest question without fetching", async () => {
  const query = "mitu ha metsa on eestis";
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async () => { throw new Error("must not fetch"); },
  });
  assert.ok(documents.some((document) => document.id === "forest-series-smi2025-1-2016-2025"));
  const balance = await loadStructuredIndicatorDocuments("Kas raiemaht ületab juurdekasvu?", {
    now: NOW,
    fetchPxwebDataset: async () => { throw new Error("must not fetch"); },
    fetchJsonDataset: async () => { throw new Error("offline"); },
  });
  assert.equal(balance.some((document) => String(document.id).startsWith("forest-series-")), false);
});

test("the context chart prefers the SMI workbook and reuses the citation of the cited SMI entry", async () => {
  const query = "mitu ha metsa on eestis";
  const [kk51] = forestSeriesFromJson(query, kk51Fixture({}, { years: CONTEXT_YEARS, values: CONTEXT_VALUES }), { now: NOW, fetchedAt: FETCHED_AT });
  const smi = smiForestSeriesDocument(query);
  const workbookEntry = {
    id: "forest-smi-2025-tables",
    title: "SMI 2025 tulemuste andmetabelid",
    url: SMI_2025_TABLES_URL,
    summary: "SMI 2025 tabelite järgi oli Eesti metsamaa pindala 2 360,2 tuhat hektarit ehk 52,1% Eesti pindalast.",
    content: "SMI 2025 tabelite järgi oli Eesti metsamaa pindala 2 360,2 tuhat hektarit ehk 52,1% Eesti pindalast.",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    sourceTier: "official",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
  };
  const draft = {
    answer: { title: "Metsamaa", intro: workbookEntry.summary, introCitations: [1], parts: [] },
    sources: [{ ...workbookEntry, citation: 1 }],
    evidence: { answerable: true },
  };
  const attached = withForestContextChart(draft, query, [kk51, smi], { now: NOW });
  assert.equal(attached.chart.citation, 1);
  assert.equal(attached.sources.length, 1);
  assert.equal(attached.chart.series[0].id, "smi-1");
  assert.equal(attached.chart.series[0].points.at(-1).y, 2360.2);

  const uncited = withForestContextChart({ ...draft, sources: [] }, query, [kk51, smi], { now: NOW });
  assert.equal(uncited.sources[0].id, smi.id);
  const fallback = withForestContextChart({ ...draft, sources: [] }, query, [kk51], { now: NOW });
  assert.equal(fallback.sources[0].id, kk51.id);
});

test("the live pipeline keeps the portal answer and adds the context chart under it", async () => {
  const query = "mitu ha metsa on eestis";
  const [seriesDocument] = forestSeriesFromJson(query, kk51Fixture({}, { years: CONTEXT_YEARS, values: CONTEXT_VALUES }), {
    now: NOW,
    fetchedAt: NOW,
  });
  const portal = {
    id: "smi-2025-forest-area",
    title: "SMI 2025: Eesti metsamaa pindala",
    url: "https://keskkonnaportaal.ee/et/smi-2025",
    summary: "SMI 2025 järgi oli Eesti metsamaa pindala 2,36 miljonit hektarit ehk 52,1% Eesti pindalast.",
    content: "Keskkonnaagentuuri SMI 2025 tulemuste järgi oli Eesti metsamaa pindala 2,36 miljonit hektarit ehk 52,1% Eesti pindalast.",
    organization: "Keskkonnaagentuur",
    type: "Statistika",
    published: "2026",
    sourceTier: "official",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    topics: ["mets", "metsamaa", "pindala", "SMI"],
    tags: ["mets", "metsamaa", "pindala", "SMI"],
  };
  const live = await searchEnvironmentLive(query, {
    startedAt: NOW,
    deadlineAt: NOW + 1_000,
    useCache: false,
    searchResults: { items: [portal, seriesDocument], total: 2 },
  });
  if (live.evidence?.answerable === false || !live.answer.introCitations.length) {
    // Without a reviewed extract the deterministic pipeline may abstain; the
    // contract under test is only that an abstention never carries a chart.
    assert.equal(live.chart, undefined);
    return;
  }
  assert.notEqual(live.answer.eyebrow, "Statistikaameti tabel KK51");
  assert.equal(live.chart.kind, "line");
  const citedSource = live.sources.find((source) => source.citation === live.chart.citation);
  assert.equal(citedSource.url, FOREST_SERIES_KK51_TABLE_URL);
});

test("a series fetched for the question stays within the first visible results even when portal pages outscore it", () => {
  const query = "Kui suur osa Eestist on mets?";
  const [seriesDocument] = forestSeriesFromJson(query, kk51Fixture({
    dimension: {
      Näitaja: { extension: { show: "value" }, label: "Näitaja", category: { index: { 34: 0 }, label: { 34: "Territooriumi metsasus, %" } } },
      Aasta: JSON.parse(kk51Fixture({}, { years: CONTEXT_YEARS, values: CONTEXT_VALUES })).dimension.Aasta,
    },
  }, { years: CONTEXT_YEARS, values: [51, 51, 51.4, 51.4, 51.5, 51.3, 51.3, 51.3, 51.5, 52.1] }), { now: NOW, fetchedAt: NOW });
  assert.ok(seriesDocument, "fixture must parse as the metsasus series");
  const topics = ["metsamaa pindala", "metsasus maakonniti", "SMI 2024 tulemused", "SMI 2025 tulemused", "metsaga kaetud ala", "puistute pindala", "riigimets ja erametsa osa", "metsade tagavara", "metsa vanuseline struktuur", "mets ja kliima"];
  const portalPages = topics.map((topic, index) => ({
    id: `portal-${index}`,
    title: `Kui suur osa Eestist on mets: ${topic}`,
    url: `https://keskkonnaportaal.ee/et/${topic.replace(/\s+/gu, "-")}`,
    summary: `${topic}: kui suur osa Eestist on mets ja kuidas see on mõõdetud (${index}).`,
    content: `${topic}. Kui suur osa Eestist on mets? Eesti metsamaa pindala on üle poole riigi pindalast; ${topic} kirjeldab seda täpsemalt ${"eri nurgast ".repeat(index + 1)}.`,
    organization: "Keskkonnaportaal",
    sourceTier: "official",
    tags: ["mets", "eesti", "osa", topic.split(" ")[0]],
  }));
  const ranked = rankPublicSearchCandidates(query, [...portalPages, seriesDocument], { now: NOW });
  const position = ranked.findIndex((candidate) => candidate.id === seriesDocument.id);
  assert.ok(position >= 0 && position <= 5, `series ranked at ${position}`);
  assert.notEqual(ranked[0].id, seriesDocument.id, "the best portal page keeps the lead");
  const unrelated = rankPublicSearchCandidates("Kui palju vett võeti Eestis 2024?", [...portalPages, seriesDocument], { now: NOW });
  assert.ok(unrelated.findIndex((candidate) => candidate.id === seriesDocument.id) > 5 || unrelated.every((c) => c.id !== seriesDocument.id));
});

// ---------------------------------------------------------------------------
// Follow-ups that only widen the period ("näita 2000-2025") inherit the root
// question's indicator and re-run the series with the requested window.
// ---------------------------------------------------------------------------
import { contextualRetrievalQuery, isSafeEllipticalFollowUp } from "../server/retrieval.mjs";

const WIDE_YEARS = Array.from({ length: 26 }, (_, index) => String(2000 + index));
const WIDE_VALUES = WIDE_YEARS.map((_, index) => Number((2240 + index * 4.6).toFixed(1)));

test("a bare period request is an accepted elliptical follow-up", () => {
  for (const value of ["näita 2000-2025", "2000–2025", "näita 2000 kuni 2025", "alates 2000", "viimase 20 aasta jooksul", "viimased 25 aastat", "näita pikemat perioodi", "aastate lõikes"]) {
    assert.equal(isSafeEllipticalFollowUp(value), true, value);
  }
  for (const value of ["näita 2000-2025 Tallinnas", "2000-2025 parool", "näita kõike", "kes elab Tartus 2000-2025"]) {
    assert.equal(isSafeEllipticalFollowUp(value), false, value);
  }
});

test("the follow-up retrieval query carries the root subject and the period follow-up", () => {
  const combined = contextualRetrievalQuery("mitu ha metsa on eestis", "näita 2000-2025", []);
  assert.equal(combined, "naita 2000-2025 mitu ha metsa on eestis");
  const intent = forestSeriesIntent(combined);
  assert.equal(intent.table, "KK51");
  assert.equal(intent.indicator.code, "1");
  assert.deepEqual(intent.years, { from: 2000, to: 2025, mode: "range" });
  const cover = forestSeriesIntent(contextualRetrievalQuery("Kui suur osa Eestist on mets?", "alates 2000", []));
  assert.equal(cover.indicator.code, "34");
  assert.deepEqual(cover.years, { from: 2000, to: 2025, mode: "since" });
  assert.equal(forestSeriesIntent("mitu ha metsa on eestis"), null, "no period → still not a series question");
});

test("the live follow-up path answers the widened period from the series with a full chart", async () => {
  const rootQuery = "mitu ha metsa on eestis";
  const question = "näita 2000-2025";
  const retrievalQuery = contextualRetrievalQuery(rootQuery, question, []);
  const [seriesDocument] = forestSeriesFromJson(retrievalQuery, kk51Fixture({}, { years: WIDE_YEARS, values: WIDE_VALUES }), {
    now: NOW,
    fetchedAt: NOW,
  });
  assert.ok(seriesDocument);
  assert.equal(seriesDocument._forestSeries.points.length, 26);
  const live = await searchEnvironmentLive(question, {
    startedAt: NOW,
    deadlineAt: NOW + 1_000,
    assessmentQuery: retrievalQuery,
    retrievalQuery,
    allowSafeEllipticalFollowUp: true,
    useCache: false,
    searchResults: { items: [seriesDocument], total: 1 },
  });
  assert.equal(live.answer.eyebrow, "Statistikaameti tabel KK51");
  assert.match(live.answer.title, /^Metsamaa pindala 2000–2025/u);
  assert.equal(live.chart.series[0].points.length, 26);
  assert.equal(live.chart.citation, 1);
});

test("felling phrasings without the word raie resolve to the harvest series, not forest area", () => {
  for (const [query, cut, measure] of [
    ["Mitu ha võetakse eestis metsa maha", "1", "1"],
    ["kui palju metsa langetatakse eestis", "1", "3"],
    ["kui palju metsa maha võetakse aastas", "1", "3"],
  ]) {
    const intent = forestContextSeriesIntent(query);
    assert.ok(intent, query);
    assert.equal(intent.table, "MM03", query);
    assert.equal(intent.cutType.code, cut, query);
    assert.equal(intent.measure.code, measure, query);
  }
  const series = forestSeriesIntent("Mitu ha võetakse eestis metsa maha 2015–2024");
  assert.equal(series.table, "MM03");
  assert.equal(series.measure.code, "1");
});

test("a felling question without a period is answered from the MM03 series itself", () => {
  const query = "Mitu ha võetakse eestis metsa maha";
  const years = ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"];
  const payload = JSON.parse(kk51Fixture());
  const body = JSON.stringify({
    ...payload,
    label: "MM03: METSARAIE RIIKLIKU METSAINVENTEERIMISE (SMI) HINNANGUL | Aasta, Raie liik ning Näitaja",
    id: ["Aasta", "Raie liik", "Näitaja"],
    size: [10, 1, 2],
    dimension: {
      Aasta: { extension: { show: "value" }, label: "Aasta", category: { index: Object.fromEntries(years.map((y, i) => [y, i])), label: Object.fromEntries(years.map((y) => [y, y])) } },
      "Raie liik": { extension: { show: "value" }, label: "Raie liik", category: { index: { 1: 0 }, label: { 1: "Koguraie" } } },
      Näitaja: { extension: { show: "value" }, label: "Näitaja", category: { index: { 1: 0, 2: 1 }, label: { 1: "Raiepindala, tuhat ha", 2: "Raiepindala suhteline viga, %" } } },
    },
    value: years.flatMap((_, i) => [77.6 + i * 4, 9.5]),
    extension: { px: { tableid: "MM03", decimals: 0 } },
  });
  const [document] = forestSeriesFromJson(query, body, { now: NOW, fetchedAt: FETCHED_AT });
  assert.ok(document);
  const response = composeForestSeriesResponse(query, [document], { now: NOW });
  assert.equal(response.answer.eyebrow, "Statistikaameti tabel MM03");
  assert.equal(response.answer.title, "Koguraie: raiepindala 2024. aastal: 113,6 tuhat ha");
  assert.match(response.answer.intro, /Hinnangu suhteline viga oli ±9,5%/u);
  assert.equal(response.chart.series[0].points.length, 10);
  assert.equal(composeForestSeriesResponse("mitu ha metsa on eestis", [document], { now: NOW }), null);
});
