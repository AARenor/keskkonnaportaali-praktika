import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  HARVEST_SHARE_LATEST_YEAR,
  composeHarvestShareResponse,
  harvestShareFromJson,
  harvestShareIntent,
  harvestShareRequest,
  isHarvestShareQuery,
  validatedHarvestShareProjection,
} from "../server/harvest-share.mjs";
import { FOREST_SERIES_MM03_API_URL, FOREST_SERIES_MM03_TABLE_URL } from "../server/forest-series.mjs";
import { loadStructuredIndicatorDocuments, requiresExtendedStructuredListingBudget } from "../server/indicators.mjs";
import { searchEnvironmentLive, searchTimeoutFallback } from "../server/pipeline.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";

const NOW = Date.parse("2026-09-28T12:00:00Z");
const FETCHED_AT = Date.parse("2026-09-28T11:59:30Z");

async function fixture() {
  return readFile(new URL("./fixtures/pxweb-mm03-cut-types-area-2024.json", import.meta.url), "utf8");
}

test("share-of-felling questions name a cut type, a measure and the latest MM03 year", () => {
  const cases = [
    ["Kui suur osa raiest on eestis lageraie", "3", "1"],
    ["mitu protsenti raiest on lageraie", "3", "1"],
    ["Kui suur osa raiemahust on harvendusraie?", "5", "3"],
    ["kui suur osa raiest on uuendusraie", "2", "1"],
    ["Mis osa raiepindalast on hooldusraie?", "4", "1"],
    ["lageraie osakaal raiest", "3", "1"],
  ];
  for (const [query, cutType, measure] of cases) {
    const intent = harvestShareIntent(query);
    assert.ok(intent, query);
    assert.equal(intent.cutType.code, cutType, query);
    assert.equal(intent.measure.code, measure, query);
    assert.equal(intent.year, HARVEST_SHARE_LATEST_YEAR, query);
    assert.equal(isHarvestShareQuery(query), true, query);
  }
  for (const query of [
    "lageraie pindala 2015–2024",
    "Kui suur on lageraie pindala?",
    "Kui suur osa Eestist on mets?",
    "kui suur osa raiest on lageraie Tartumaal",
    "kui suur osa raiest oli lageraie 2010",
    "Kas raiemaht ületab juurdekasvu?",
    "kui suur osa raiest",
  ]) {
    assert.equal(harvestShareIntent(query), null, query);
  }
  assert.deepEqual(harvestShareRequest(harvestShareIntent("Kui suur osa raiest on eestis lageraie")), {
    query: [
      { code: "Aasta", selection: { filter: "item", values: [String(HARVEST_SHARE_LATEST_YEAR)] } },
      { code: "Raie liik", selection: { filter: "item", values: ["1", "2", "3", "4", "5", "6"] } },
      { code: "Näitaja", selection: { filter: "item", values: ["1"] } },
    ],
    response: { format: "json-stat2" },
  });
});

test("MM03 cut-type capture parses into a validated harvest share document", async () => {
  const query = "Kui suur osa raiest on eestis lageraie";
  const [document] = harvestShareFromJson(query, await fixture(), { now: NOW, fetchedAt: FETCHED_AT });
  assert.ok(document);
  assert.equal(document.id, "harvest-share-mm03-1-2024");
  assert.equal(document.url, FOREST_SERIES_MM03_TABLE_URL);
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);
  const projection = document._harvestShare;
  assert.equal(projection.total, 117.4);
  assert.equal(projection.unit, "tuhat ha");
  assert.deepEqual(projection.parts.map((part) => [part.key, part.value]), [
    ["lageraie", 34], ["muu-uuendusraie", 1.6], ["harvendusraie", 25.5], ["muu-hooldusraie", 41.4], ["muu-raie", 14.8],
  ]);
  assert.equal(projection.parts[0].share, 29);
  assert.equal(projection.groups.uuendusraie, 35.6);
  assert.match(document.summary, /^Statistikaameti tabeli MM03 \(SMI hinnang\) järgi oli 2024\. aastal koguraie pindala 117,4 tuhat ha, millest lageraie 34,0 tuhat ha ehk 29,0 %/u);
  assert.match(document.summary, /harvendusraie 25,5 tuhat ha \(21,7 %\)/u);
  assert.match(document.content, /lageraie on uuendusraie osa/u);
  assert.doesNotMatch(`${document.summary} ${document.content}`, /2017-12-12/u);
  assert.deepEqual(validatedHarvestShareProjection(query, document, NOW), projection);
});

test("harvest share parser rejects schema drift and inconsistent sub-totals", async () => {
  const query = "Kui suur osa raiest on eestis lageraie";
  const base = JSON.parse(await fixture());
  const variants = [
    ["size", { ...base, size: [1, 5, 1] }],
    ["status", { ...base, status: { 0: "e" } }],
    ["lageraie above uuendusraie", { ...base, value: [117.4, 35.6, 40, 66.9, 25.5, 14.8] }],
    ["groups do not sum", { ...base, value: [117.4, 35.6, 34, 40, 25.5, 14.8] }],
    ["negative", { ...base, value: [117.4, -1, 34, 66.9, 25.5, 14.8] }],
    ["wrong measure label", { ...base, dimension: { ...base.dimension, Näitaja: { ...base.dimension.Näitaja, category: { index: { 1: 0 }, label: { 1: "Raiemaht, tuhat m³" } } } } }],
  ];
  for (const [reason, payload] of variants) {
    assert.deepEqual(harvestShareFromJson(query, JSON.stringify(payload), { now: NOW, fetchedAt: FETCHED_AT }), [], reason);
  }
  assert.deepEqual(harvestShareFromJson("Kui suur on lageraie pindala?", await fixture(), { now: NOW, fetchedAt: FETCHED_AT }), []);
});

test("the harvest share answer states the share and carries a sector chart with the asked cut type emphasised", async () => {
  const query = "Kui suur osa raiest on eestis lageraie";
  const documents = harvestShareFromJson(query, await fixture(), { now: NOW, fetchedAt: FETCHED_AT });
  const response = composeHarvestShareResponse(query, documents, { now: NOW });
  assert.equal(response.answer.eyebrow, "Statistikaameti tabel MM03");
  assert.equal(response.answer.title, "Lageraie moodustas 2024. aastal 29,0 % koguraie pindalast");
  assert.equal(response.answer.intro, documents[0].summary);
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.equal(response.evidence.kind, "structured-harvest-share");
  assert.equal(response.chart.kind, "share");
  assert.equal(response.chart.title, "Raiepindala raieliigiti 2024");
  assert.deepEqual(response.chart.series[0].points.map((point) => [point.label, point.emphasis === true]), [
    ["Lageraie", true], ["Muu uuendusraie", false], ["Harvendusraie", false], ["Muu hooldusraie", false], ["Muu raie", false],
  ]);
  const regeneration = composeHarvestShareResponse("kui suur osa raiest on uuendusraie", documents, { now: NOW });
  assert.equal(regeneration.answer.title, "Uuendusraie moodustas 2024. aastal 30,3 % koguraie pindalast");
  assert.deepEqual(regeneration.chart.series[0].points.filter((point) => point.emphasis).map((point) => point.label), ["Lageraie", "Muu uuendusraie"]);
  assert.equal(composeHarvestShareResponse("Kui suur on lageraie pindala?", documents, { now: NOW }), null);
});

test("the loader fetches only the cut-type split for a share question and the pipeline prefers it to the series", async () => {
  const query = "Kui suur osa raiest on eestis lageraie";
  const urls = [];
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async (url, payload) => {
      urls.push(payload.query.map((item) => item.code).join("/"));
      assert.equal(url, FOREST_SERIES_MM03_API_URL);
      assert.deepEqual(payload, harvestShareRequest(harvestShareIntent(query)));
      return { body: await fixture(), fetchedAt: FETCHED_AT, stale: false };
    },
  });
  assert.deepEqual(urls, ["Aasta/Raie liik/Näitaja"]);
  assert.deepEqual(documents.map((document) => document.id), ["harvest-share-mm03-1-2024"]);
  assert.equal(requiresExtendedStructuredListingBudget(query), true);

  const [document] = harvestShareFromJson(query, await fixture(), { now: NOW, fetchedAt: NOW });
  const fallback = searchTimeoutFallback(query, { searchResults: { items: [document], total: 1 }, filters: {}, startedAt: NOW });
  assert.equal(fallback.answer.eyebrow, "Statistikaameti tabel MM03");
  assert.equal(fallback.chart.kind, "share");
  const live = await searchEnvironmentLive(query, { startedAt: NOW, deadlineAt: NOW + 1_000, useCache: false, searchResults: { items: [document], total: 1 } });
  assert.equal(live.chart.kind, "share");
  assert.equal(live.chart.citation, 1);
  const ranked = rankPublicSearchCandidates(query, [
    ...Array.from({ length: 10 }, (_, index) => ({ id: `p${index}`, title: `Kui suur osa raiest on lageraie ${index}`, url: `https://keskkonnaportaal.ee/et/raie-${index}`, summary: `raie lageraie osa ${index}`, content: `Kui suur osa raiest on eestis lageraie ${"raie ".repeat(index + 1)}`, organization: "Keskkonnaportaal", sourceTier: "official", tags: ["raie", "lageraie"] })),
    document,
  ], { now: NOW });
  assert.ok(ranked.findIndex((candidate) => candidate.id === document.id) <= 6);
});
