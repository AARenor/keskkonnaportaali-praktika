import assert from "node:assert/strict";
import test from "node:test";
import { composeForestSeriesResponse, resolveForestSeriesIntent, smiForestSeriesDocument, validatedForestSeriesProjection } from "../server/forest-series.mjs";
import { rankPublicSearchCandidates, rankSearchCandidates } from "../server/retrieval.mjs";
import { searchEnvironmentLive } from "../server/pipeline.mjs";
import { loadStructuredIndicatorDocuments } from "../server/indicators.mjs";

const WORDINGS = ["raiemaht", "kui palju on raiemaht", "Kui suur on raiemaht?", "Kui palju metsa Eestis raiutakse?"];

test("an explicit hectare unit wins over the felling verb without hiding mixed measures", () => {
  for (const query of ["Mitu hektarit Eestis raiutakse?", "Kui palju metsa hektarites raiutakse?", "Mitu hektarit raiuti viimase kümne aasta jooksul?"]) {
    assert.equal(resolveForestSeriesIntent(query)?.measure.code, "1", query);
  }
  assert.equal(resolveForestSeriesIntent("Kui palju lageraiet raiutakse?")?.measure.code, "3");
  assert.equal(resolveForestSeriesIntent("Kui palju lageraiet langetatakse?")?.measure.code, "3");
  assert.equal(resolveForestSeriesIntent("Kui palju lageraiet võetakse maha?")?.measure.code, "3");
  assert.equal(resolveForestSeriesIntent("Mitu kuupmeetrit Eestis raiutakse?")?.measure.code, "3");
  assert.equal(resolveForestSeriesIntent("Kui suur on raiemaht kuupmeetrites ja hektarites?"), null);
});

test("a harvest quantity question answers the latest published value before context years", () => {
  const query = "kui palju on raiemaht";
  const document = smiForestSeriesDocument(query);
  const result = composeForestSeriesResponse(query, [document]);
  assert.equal(result.answer.title, "Koguraie: raiemaht 2024. aastal: 12 500 tuhat m³");
  assert.match(result.answer.intro, /järgi oli koguraie raiemaht 2024\. aastal 12 500 tuhat m³\./u);
  assert.doesNotMatch(result.answer.intro, /2015/u);
  assert.equal(result.chart.series[0].points.length, 10);
  const period = "raiemaht 2015–2024";
  const trend = composeForestSeriesResponse(period, [smiForestSeriesDocument(period)]);
  assert.match(trend.answer.title, /2015–2024: 10 931 → 12 500/u);
});

test("SMI series validation binds the exact question, source and reviewed data", () => {
  const document = smiForestSeriesDocument("raiemaht");
  assert.deepEqual(validatedForestSeriesProjection("kui palju on raiemaht", document), document._forestSeries);
  for (const query of ["raiemaht Tartumaal", "RMK raiemaht", "raiemaht Soomes", "raiemaht 2023", "raiemaht ja juurdekasv", "lageraie pindala"]) {
    assert.equal(validatedForestSeriesProjection(query, document), null, query);
  }
  for (const mutate of [
    (d) => { d._forestSeries.points.at(-1).value += 1; },
    (d) => { d._forestSeries.worksheet = 25; },
    (d) => { d.summary = "Muu näitaja"; },
    (d) => { d.id = "unbound-series"; },
    (d) => { d.url = "https://example.test/unbound"; },
    (d) => { d._contentHash = "0".repeat(64); },
    (d) => { d.title = "Muu näitaja"; },
    (d) => { d.published = "2023"; },
    (d) => { d.locator = "Muu tabel"; },
    (d) => { d.organization = "Muu väljaandja"; },
    (d) => { d.evidencePolicy = "route-only"; },
  ]) {
    const modified = structuredClone(document);
    mutate(modified);
    assert.equal(validatedForestSeriesProjection("raiemaht", modified), null);
  }
});

test("a national quantity series does not answer foreign scopes or causes", () => {
  const document = smiForestSeriesDocument("raiemaht");
  for (const query of [
    "Kui palju on raiemaht Saksamaal?",
    "Kui suur on raiemaht Prantsusmaal?",
    "Raiemaht Norras 2015–2024",
    "Miks on raiemaht nii suur?",
    "Palun selgita raiemahu põhjuseid",
    "Millest sõltub raiemaht?",
  ]) {
    assert.equal(resolveForestSeriesIntent(query), null, query);
    assert.equal(validatedForestSeriesProjection(query, document), null, query);
    assert.equal(composeForestSeriesResponse(query, [document]), null, query);
  }
});

test("natural harvest wording keeps its validated SMI series on the visible page", async () => {
  for (const query of WORDINGS) {
    const document = smiForestSeriesDocument(query);
    // Numerous lexical news matches must not push the bound dataset beyond
    // the visible result set. These cards are navigation, not numeric evidence.
    const news = Array.from({ length: 20 }, (_, i) => ({
      id: `harvest-news-${i}`,
      title: `${query}: a${String(i).padStart(3, "0")} b${String(i).padStart(3, "0")} c${String(i).padStart(3, "0")} metsaraie uudis`,
      summary: `${query}. Raiemaht ja metsaraie Eestis.`,
      content: "",
      url: `https://keskkonnaagentuur.ee/uudised/wording-fixture-${i}`,
      type: "Uudis",
      sourceTier: "official",
      evidencePolicy: "route-only",
      _answerEvidenceEligible: false,
      tags: ["mets", "raie"],
    }));
    // prepareRankedSearchResults defaults to 12 results per page.
    const pageSize = 12;
    const items = rankPublicSearchCandidates(query, [...news, document]).slice(0, pageSize);
    assert.ok(items.some((item) => item.id === document.id), query);
    assert.notEqual(items[0].id, document.id, "visibility promotion preserves the ranked lead");
    const tampered = { ...document, _contentHash: "0".repeat(64) };
    const untyped = { ...tampered, _forestSeries: undefined };
    assert.deepEqual(rankPublicSearchCandidates(query, [...news, tampered]).map((d) => d.id), rankPublicSearchCandidates(query, [...news, untyped]).map((d) => d.id), "an unvalidated series gets only its ordinary lexical position");
    if (query === "kui palju on raiemaht") {
      assert.ok(rankSearchCandidates(query, [...news, document]).findIndex((d) => d.id === document.id) >= pageSize, "the reproducer needs the visibility promotion, not just lexical scoring");
      assert.ok(rankPublicSearchCandidates(query, [...news, tampered]).findIndex((d) => d.id === document.id) >= pageSize, "the unvalidated result stays offpage after deduplication too");
    }
    const result = await searchEnvironmentLive(query, {
      useCache: false,
      searchResults: { items, total: 21 },
      generateAnswer: async () => { throw new Error("structured answer must not need generation"); },
    });
    assert.match(result.answer.intro, /2024.*12 500 tuhat m³/u, query);
    assert.equal(result.chart.series[0].points.at(-1).y, 12500, query);
    assert.equal(result.sources[0].url, document.url, query);
    const filtered = await searchEnvironmentLive(query, {
      useCache: false,
      searchResults: { items: [], total: 0 },
      generateAnswer: async () => { throw new Error("missing evidence must not need generation"); },
    });
    assert.equal(filtered.chart, undefined, query);
    assert.equal(filtered.sources.length, 0, query);
  }
});

test("natural harvest quantities load the primary SMI series without a remote fallback", async () => {
  for (const query of WORDINGS) {
    const documents = await loadStructuredIndicatorDocuments(query, {
      fetchPxwebDataset: async () => { throw new Error("primary SMI series must not fetch PXWeb"); },
    });
    assert.deepEqual(documents.map((d) => d.id), [smiForestSeriesDocument(query).id], query);
  }
});
