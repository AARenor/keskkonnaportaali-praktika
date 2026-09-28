import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  composeSearchResponse,
} from "../server/search.mjs";
import {
  LAND_USE_KK07_API_URL,
  LAND_USE_KK07_TABLE_URL,
  LAND_USE_LATEST_YEAR,
  isLandUseShareQuery,
  landUseShareChart,
  landUseShareFromJson,
  landUseShareIntent,
  landUseShareRequest,
  validatedLandUseShareProjection,
  withLandUseShareChart,
} from "../server/land-use-share.mjs";
import { loadStructuredIndicatorDocuments, requiresExtendedStructuredListingBudget } from "../server/indicators.mjs";
import { searchEnvironmentLive } from "../server/pipeline.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";

const NOW = Date.parse("2026-09-28T12:00:00Z");
const FETCHED_AT = Date.parse("2026-09-28T11:59:30Z");

async function fixture() {
  return readFile(new URL("./fixtures/pxweb-kk07-land-use-2024.json", import.meta.url), "utf8");
}

test("share questions about forest resolve to the latest KK07 land-use split", () => {
  for (const query of [
    "Kui suur osa eestis on metsa all?",
    "Kui suur osa Eestist on mets?",
    "Mitu protsenti Eestist on metsaga kaetud?",
    "kui suur on eesti metsasus",
    "Mis osa Eesti maismaast on mets?",
  ]) {
    assert.deepEqual(landUseShareIntent(query), { year: LAND_USE_LATEST_YEAR }, query);
    assert.equal(isLandUseShareQuery(query), true, query);
  }
  for (const query of [
    "mitu ha metsa on eestis",
    "Kui suur osa Eestist oli mets 2010?",
    "metsasus viimase kümne aasta jooksul",
    "Kui suur osa Tartumaast on mets?",
    "kui suur osa raiest on lageraie",
    "Kas raiemaht ületab juurdekasvu?",
    "kui suur osa Eesti jäätmetest taaskasutatakse",
  ]) {
    assert.equal(landUseShareIntent(query), null, query);
  }
  assert.deepEqual(landUseShareRequest(), {
    query: [
      { code: "Aasta", selection: { filter: "item", values: [String(LAND_USE_LATEST_YEAR)] } },
      { code: "Maakasutus", selection: { filter: "item", values: ["1", "2", "3", "4", "5", "6", "7", "8"] } },
    ],
    response: { format: "json-stat2" },
  });
  assert.match(LAND_USE_KK07_API_URL, /KK07\.PX$/u);
});

test("KK07 live capture parses into a validated land-use share document", async () => {
  const query = "Kui suur osa eestis on metsa all?";
  const [document] = landUseShareFromJson(query, await fixture(), { now: NOW, fetchedAt: FETCHED_AT });
  assert.ok(document);
  assert.equal(document.id, "land-use-share-kk07-2024");
  assert.equal(document.url, LAND_USE_KK07_TABLE_URL);
  assert.equal(document.published, "2024");
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);
  const projection = document._landUseShare;
  assert.equal(projection.year, 2024);
  assert.equal(projection.total, 4533.9);
  assert.equal(projection.parts.length, 7);
  assert.deepEqual(projection.parts[0], { code: "1", label: "Metsamaa", value: 2459.7, share: 54.3 });
  assert.equal(projection.parts.find((part) => part.code === "6").label, "Asustusalad");
  assert.match(document.summary, /^Statistikaameti tabeli KK07 \(kliimaaruandluse maakasutus\) järgi oli 2024\. aastal Eesti maismaa pindalast metsamaa 2 459,7 tuhat ha ehk 54,3 %/u);
  assert.match(document.summary, /põllumaa 989,9 tuhat ha \(21,8 %\)/u);
  assert.match(document.content, /erineb SMI metsamaa definitsioonist/u);
  assert.doesNotMatch(`${document.summary} ${document.content}`, /2020-06-11/u);
  assert.deepEqual(validatedLandUseShareProjection(query, document, NOW), projection);
});

test("KK07 parser rejects schema drift, an inconsistent total and stale fetches", async () => {
  const query = "Kui suur osa eestis on metsa all?";
  const base = JSON.parse(await fixture());
  const variants = [
    ["label", { ...base, label: "KK07: MIDAGI | Aasta ning Maakasutus" }],
    ["tableid", { ...base, extension: { px: { tableid: "KK08", decimals: 1 } } }],
    ["decimals", { ...base, extension: { px: { tableid: "KK07", decimals: 0 } } }],
    ["size", { ...base, size: [1, 7] }],
    ["status", { ...base, status: { 0: "e" } }],
    ["null part", { ...base, value: [null, 989.9, 267.2, 319.5, 103.4, 349.1, 45, 4533.9] }],
    ["negative", { ...base, value: [-1, 989.9, 267.2, 319.5, 103.4, 349.1, 45, 4533.9] }],
    ["total mismatch", { ...base, value: [2459.7, 989.9, 267.2, 319.5, 103.4, 349.1, 45, 5000] }],
    ["wrong category label", { ...base, dimension: { ...base.dimension, Maakasutus: { ...base.dimension.Maakasutus, category: { ...base.dimension.Maakasutus.category, label: { ...base.dimension.Maakasutus.category.label, 1: "Mets" } } } } }],
  ];
  for (const [reason, payload] of variants) {
    assert.deepEqual(landUseShareFromJson(query, JSON.stringify(payload), { now: NOW, fetchedAt: FETCHED_AT }), [], reason);
  }
  assert.deepEqual(landUseShareFromJson(query, await fixture(), { now: NOW, fetchedAt: FETCHED_AT, stale: true }), []);
  assert.deepEqual(landUseShareFromJson(query, await fixture(), { now: NOW, fetchedAt: NOW - 14 * 60 * 60_000 }), []);
  assert.deepEqual(landUseShareFromJson("mitu ha metsa on eestis", await fixture(), { now: NOW, fetchedAt: FETCHED_AT }), []);
});

test("the share chart lists every land-use class with forest emphasised and cites the table", async () => {
  const query = "Kui suur osa eestis on metsa all?";
  const documents = landUseShareFromJson(query, await fixture(), { now: NOW, fetchedAt: FETCHED_AT });
  const { source, chart } = landUseShareChart(query, documents, { now: NOW });
  assert.equal(source.id, documents[0].id);
  assert.equal(chart.kind, "share");
  assert.equal(chart.title, "Eesti maismaa jagunemine maakasutuse järgi 2024");
  assert.equal(chart.unit, "tuhat ha");
  assert.equal(chart.series.length, 1);
  assert.equal(chart.series[0].points.length, 7);
  assert.deepEqual(chart.series[0].points[0], { x: 1, y: 2459.7, label: "Metsamaa", emphasis: true });
  assert.deepEqual(chart.series[0].points[1], { x: 2, y: 989.9, label: "Põllumaa" });
  assert.match(chart.caption, /KK07[\s\S]*kliimaaruandlus[\s\S]*SMI/u);
  assert.equal(landUseShareChart("mitu ha metsa on eestis", documents, { now: NOW }), null);
});

test("withLandUseShareChart attaches the sector chart to an answerable share answer", async () => {
  const query = "Kui suur osa eestis on metsa all?";
  const [shareDocument] = landUseShareFromJson(query, await fixture(), { now: NOW, fetchedAt: FETCHED_AT });
  const portal = {
    id: "smi-2024-forest-area",
    title: "SMI 2024: Eesti metsamaa pindala",
    url: "https://keskkonnaportaal.ee/et/smi-2024",
    summary: "SMI 2024 andmetel oli Eesti metsamaa pindala 2 350,6 tuhat hektarit ehk 51,84% kogu Eesti pindalast.",
    content: "SMI 2024 andmetel oli Eesti metsamaa pindala 2 350,6 tuhat hektarit ehk 51,84% kogu Eesti pindalast.",
    organization: "Keskkonnaagentuur",
    sourceTier: "official",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
  };
  const draft = composeSearchResponse(query, [portal], { answerable: true, limit: 6, total: 2 });
  const attached = withLandUseShareChart(draft, query, [portal, shareDocument], { now: NOW });
  assert.equal(attached.chart.kind, "share");
  assert.equal(attached.chart.citation, 2);
  assert.equal(attached.sources[1].id, shareDocument.id);
  assert.equal(withLandUseShareChart(draft, "mitu ha metsa on eestis", [portal, shareDocument], { now: NOW }), draft);
  const unanswerable = composeSearchResponse(query, [portal], { answerable: false, clarification: "Täpsusta.", limit: 6, total: 2 });
  assert.equal(withLandUseShareChart(unanswerable, query, [portal, shareDocument], { now: NOW }), unanswerable);
});

test("structured loader posts the fixed KK07 request for a share question and the live pipeline prefers the sector chart", async () => {
  const query = "Kui suur osa eestis on metsa all?";
  let calls = 0;
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async (url, payload) => {
      calls += 1;
      if (url === LAND_USE_KK07_API_URL) {
        assert.deepEqual(payload, landUseShareRequest());
        return { body: await fixture(), fetchedAt: FETCHED_AT, stale: false };
      }
      throw new Error("offline");
    },
  });
  assert.ok(calls >= 1);
  assert.ok(documents.some((document) => document.id === "land-use-share-kk07-2024"));
  assert.equal(requiresExtendedStructuredListingBudget(query), true);

  const [shareDocument] = landUseShareFromJson(query, await fixture(), { now: NOW, fetchedAt: NOW });
  const portal = {
    id: "smi-2024-forest-area",
    title: "SMI 2024: Eesti metsamaa pindala",
    url: "https://keskkonnaportaal.ee/et/smi-2024",
    summary: "SMI 2024 andmetel oli Eesti metsamaa pindala 2 350,6 tuhat hektarit ehk 51,84% kogu Eesti pindalast.",
    content: "SMI 2024 andmetel oli Eesti metsamaa pindala 2 350,6 tuhat hektarit ehk 51,84% kogu Eesti 4 533,9 tuhande hektari suurusest pindalast.",
    organization: "Keskkonnaagentuur",
    type: "Statistika",
    published: "2025",
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
    searchResults: { items: [portal, shareDocument], total: 2 },
  });
  if (live.evidence?.answerable === false || !live.answer.introCitations.length) {
    assert.equal(live.chart, undefined);
    return;
  }
  assert.equal(live.chart.kind, "share");
  assert.equal(live.sources.find((source) => source.citation === live.chart.citation).url, LAND_USE_KK07_TABLE_URL);
});

test("the land-use document fetched for a share question stays within the first visible results", async () => {
  const { rankPublicSearchCandidates } = await import("../server/retrieval.mjs");
  const query = "Kui suur osa Eestist on mets?";
  const [shareDocument] = landUseShareFromJson(query, await fixture(), { now: NOW, fetchedAt: NOW });
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
  const ranked = rankPublicSearchCandidates(query, [...portalPages, shareDocument], { now: NOW });
  const position = ranked.findIndex((candidate) => candidate.id === shareDocument.id);
  assert.ok(position >= 0 && position <= 6, `land-use document ranked at ${position}`);
});
