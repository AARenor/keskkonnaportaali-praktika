import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  FOREST_SERIES_KK51_API_URL,
  FOREST_SERIES_KK51_TABLE_URL,
  FOREST_SERIES_MM03_API_URL,
  FOREST_SERIES_MM03_TABLE_URL,
  forestSeriesFromJson,
  forestSeriesIntent,
  forestSeriesRequest,
  isForestSeriesQuery,
  validatedForestSeriesProjection,
} from "../server/forest-series.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";

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
