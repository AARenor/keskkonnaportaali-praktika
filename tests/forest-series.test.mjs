import assert from "node:assert/strict";
import test from "node:test";
import {
  FOREST_SERIES_KK51_API_URL,
  FOREST_SERIES_MM03_API_URL,
  forestSeriesIntent,
  forestSeriesRequest,
  isForestSeriesQuery,
} from "../server/forest-series.mjs";

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
