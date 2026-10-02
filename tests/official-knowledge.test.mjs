import assert from "node:assert/strict";
import test from "node:test";

import {
  forestEvidenceIntent,
  officialServiceCatalogueDocuments,
} from "../server/search.mjs";
import {
  forestrySourceClass,
  FORESTRY_SOURCE_HIERARCHY,
} from "../server/forestry-source-policy.mjs";
import {
  rankPublicSearchCandidates,
  scoreSearchCandidate,
  selectAnswerEvidence,
} from "../server/retrieval.mjs";
import { createPortalDraft, directEvidenceExtract, publicResponse } from "../server/pipeline.mjs";
import { assessEvidence, assessSearchQuery, composeScopeResponse } from "../server/search.mjs";
import { resultMatchesFilters } from "../server/retrieval.mjs";
import { smiSeriesPoints, smiSeriesWorksheet } from "../server/smi-tables.mjs";
import { smiForestSeriesDocument } from "../server/forest-series.mjs";
import * as harvest from "../server/harvest-share.mjs";
import { publicSourceAllowed } from "../server/citation-policy.mjs";

test("forest-land stock series does not silently substitute stand stock", () => {
  assert.equal(smiSeriesWorksheet("KK51", "10"), 25);
  assert.deepEqual(smiSeriesPoints("KK51", "10", {from: 2024, to: 2025}), [{year: 2024, value: 465116}, {year: 2025, value: 466242}]);
  const series = smiForestSeriesDocument("Eesti metsa tagavara viimase kümne aasta jooksul");
  assert.ok(series);
  assert.match(series.title, /Metsamaa kasvava metsa tagavara/u);
  assert.match(series.locator, /tööleht 25/u);
  assert.doesNotMatch(series.summary, /puistute üldvaru/iu);
  assert.equal(smiForestSeriesDocument("Puistute üldvaru 2015–2025"), null, "an explicit stand-stock question must not borrow forest-land stock");
});

test("SMI 2024 edition date does not masquerade as its data year", () => {
  const source = officialServiceCatalogueDocuments().find((item) => item.id === "forest-area");
  assert.equal(source.published, "2025");
  assert.equal(source.dataYear, "2024");
  assert.equal(source.dataAsOf, "30.07.2025");
});

test("bark beetle sources separate publication, updates and explicit publisher", () => {
  const sources = officialServiceCatalogueDocuments();
  const guidance = sources.find((item) => item.id === "bark-beetle-guidance");
  assert.equal(guidance.organization, "Kliimaministeerium");
  assert.equal(guidance.published, "19.04.2024");
  assert.equal(guidance.updated, "27.05.2025");
  const monitoring = sources.find((item) => item.id === "bark-beetle-monitoring-2026");
  assert.equal(monitoring.published, "14.05.2024");
  assert.equal(monitoring.updated, "03.09.2026");
  const forestView = sources.find((item) => item.id === "metsainfo-hetkeseis");
  assert.equal(forestView.published, "12.02.2024");
  assert.equal(forestView.updated, "07.01.2026");
});

test("groundwater report extracts bind each reviewed annual total to the requested year", () => {
  const source = officialServiceCatalogueDocuments().find((item) => item.id === "groundwater-balance-2025-report");
  for (const [year, value] of [[2022,"649 158"],[2023,"607 781"],[2024,"558 697"],[2025,"689 662"]]) {
    const query = `Kui suur oli põhjaveevõtt ${year}?`;
    const extract = directEvidenceExtract(query,source);
    assert.ok(extract.includes(value),`${query}: ${extract}`);
    assert.ok(extract.includes(String(year)),query);
    if(year!==2025)assert.ok(!extract.includes("689 662"),query);
    assert.equal(assessEvidence(query,[{...source,score:100}]).strong,true,query);
  }
});

test("harvest shares and chart use primary SMI workbook with tamper and scope rejection", () => {
  assert.equal(typeof harvest.smiHarvestShareDocument, "function");
  for (const [query, expectedShare] of [["Kui suur osa raiest on lageraie?", "29,0"], ["Kui suur osa raiemahust on lageraie?", "73,9"]]) {
    const document = harvest.smiHarvestShareDocument(query);
    assert.ok(document, query);
    const response = harvest.composeHarvestShareResponse(query, [document], {now: NOW});
    assert.ok(response, query);
    assert.match(response.answer.title, new RegExp(expectedShare, "u"));
    assert.match(response.sources[0].url, /SMI%202025%20tulemused\.xlsx$/u);
    assert.match(response.chart.caption, /Keskkonnaagentuur/u);
    assert.doesNotMatch(response.answer.intro, /Statistikaamet/u);
    const forged = structuredClone(document);
    forged._harvestShare.total += 1;
    assert.equal(harvest.composeHarvestShareResponse(query, [forged], {now: NOW}), null);
  }
  assert.equal(harvest.smiHarvestShareDocument("Kui suur osa raiest oli lageraie 2023?"), null);
  assert.equal(harvest.smiHarvestShareDocument("Kui suur osa raiest on lageraie Tartumaal?"), null);
});

test("bare overview asks for the environmental topic instead of rejecting the domain", () => {
  for (const query of ["ülevaade", "palun ülevaadet", "soovin ülevaadet"]) {
    const assessment = assessSearchQuery(query);
    assert.equal(assessment.kind, "needs-clarification", query);
    assert.match(assessment.clarification, /mets|vesi|kliima/u);
    assert.doesNotMatch(composeScopeResponse(query, assessment).answer.title, /Palun küsi Eesti/u);
  }
  assert.equal(assessSearchQuery("ülevaade jalgpallist").kind, "out-of-scope");
});

test("public result filters exclude Statistics Estonia for every source-filter setting", () => {
  assert.equal(publicSourceAllowed(null), true); // URL boundary rejects null independently.
  assert.equal(publicSourceAllowed({organization:"Statistikaamet / muu väljaandja", url:"https://keskkonnaportaal.ee/et/table"}), false);
  assert.equal(publicSourceAllowed({url:"https://stat.ee/et"}), false);
  assert.equal(publicSourceAllowed({url:"https://stat.ee.example.invalid/"}), true);
  for (const source of ["all", "official", "trusted"]) {
    assert.equal(resultMatchesFilters({ title: "Raiemaht", url: "https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM03", sourceTier: "official" }, { source }), false);
    assert.equal(resultMatchesFilters({ title: "SMI", url: "https://keskkonnaportaal.ee/et/teemad/mets/metsastatistika-sh-smi", sourceTier: "official" }, { source }), true);
  }
});

test("public response cannot leak an excluded statistical citation or its chart", () => {
  const source = officialServiceCatalogueDocuments().find((document) => document.id === "wood-balance-overview");
  const draft = { answer: { title: "Raiemaht", intro: "Raiemaht on 10 miljonit m³.", introCitations: [1], parts: [] }, sources: [{...source, citation: 1, title: "MM03", url: "https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM03"}] };
  assert.equal(publicResponse({ ...draft, sources: [{ ...source, citation: 1 }] }, {now: NOW}).sources.length, 1);
  const response = publicResponse(draft, {now: NOW});
  assert.deepEqual(response.sources, []);
  assert.doesNotMatch(response.answer.intro, /10 miljonit/u);
  assert.equal(response.chart, undefined);
});

test("an otherwise eligible source cannot expose an excluded publisher as its action", () => {
  const source = officialServiceCatalogueDocuments().find((item) => item.id === "wood-balance-overview");
  const response = publicResponse({sources: [{...source, citation: 1, actionUrl: "https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM03", actionLabel: "Ava tabel"}], answer: {title:"Puidubilanss", intro:source.summary, introCitations:[1], parts:[]}}, {now:NOW});
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].actionUrl, undefined);
});

const NOW = Date.parse("2026-10-01T12:00:00Z");

function answerText(draft) {
  return [draft.answer.intro, ...draft.answer.parts.map((part) => part.text)].join("\n");
}

test("forestry source hierarchy keeps primary national publications ahead of supplementary sources", () => {
  assert.deepEqual(FORESTRY_SOURCE_HIERARCHY.map((item) => item.id), [
    "smi",
    "forest-yearbook",
    "wood-balance",
    "environment-agency-portal",
    "climate-ministry",
    "additional-official",
    "eurostat",
    "supplementary",
  ]);
  assert.equal(forestrySourceClass({ title: "SMI 2025 tulemused", organization: "Keskkonnaagentuur" }), "smi");
  assert.equal(forestrySourceClass({ title: "Aastaraamat Mets 2023", organization: "Keskkonnaagentuur" }), "forest-yearbook");
  assert.equal(forestrySourceClass({ title: "Puidubilanss 2023", organization: "Keskkonnaagentuur" }), "wood-balance");
  assert.equal(forestrySourceClass({ title: "Metsandus", organization: "Kliimaministeerium" }), "climate-ministry");
  assert.equal(forestrySourceClass({ title: "European Forest Accounts", organization: "Eurostat" }), "eurostat");

  const query = "Kui suur on Eesti metsamaa pindala?";
  const candidate = {
    id: "same-source",
    title: "Metsamaa pindala",
    organization: "Ametlik väljaandja",
    url: "https://example.invalid/metsamaa",
    summary: "Eesti metsamaa pindala.",
    content: "Eesti metsamaa pindala.",
    sourceTier: "official",
  };
  const scores = FORESTRY_SOURCE_HIERARCHY.map(({ id }) => scoreSearchCandidate(query, {
    ...candidate,
    id,
    url: `https://example.invalid/${id}`,
    _forestrySourceClass: id,
  }, 0, NOW));
  assert.deepEqual(scores.map((score) => score.forestrySourcePriority), [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]);
  assert.ok(scores.every((score, index) => index === 0 || scores[index - 1].score > score.score));
  const ranked = rankPublicSearchCandidates(query, FORESTRY_SOURCE_HIERARCHY.map(({ id }) => ({
    ...candidate,
    id,
    url: `https://example.invalid/${id}`,
    _forestrySourceClass: id,
  })), { now: NOW });
  assert.deepEqual(ranked.map((document) => document.id), FORESTRY_SOURCE_HIERARCHY.map(({ id }) => id));
});

test("reviewed concepts, abbreviations, beetle data and annual publications have strong visible official evidence", async () => {
  const cases = [
    ["kuusekooreürask", "bark-beetle-damage", /koore all[\s\S]*niineosast[\s\S]*kuivamist/iu],
    ["Kuuse-kooreürask andmed Eestis", "bark-beetle-monitoring", /^(?=[\s\S]*feromoonpüüniste)(?=[\s\S]*nädalate lõikes)(?=[\s\S]*2\. september 2026)/iu],
    ["Mis on puidubilanss?", "wood-balance-definition", /puiduallikad[\s\S]*lõpptarbimis[\s\S]*pooleteise aasta/iu],
    ["Mida tähendab LULUCF?", "lulucf-definition", /maakasutuse, maakasutuse muutuse ja metsanduse[\s\S]*kasvuhoonegaaside/iu],
    ["Mis on ETAK?", "etak-definition", /Eesti topograafia andmekogu[\s\S]*kaardiandmestik[\s\S]*kõlvik/iu],
    ["Mis vahe on metsamaal ja puistute pindalal?", "forest-covered-area", /2\s*360,2[\s\S]*2\s*151,2[\s\S]*eri näitajad/iu],
    ["Mis vahe on kogujuurdekasvul ja netojuurdekasvul?", "increment-method", /Kogujuurdekasv[\s\S]*Netojuurdekasv[\s\S]*surnud/iu],
    ["Millal avaldatakse SMI ja metsa-aastaraamat?", "forest-publication-cycle", /SMI 2025[\s\S]*18\. august 2026[\s\S]*Mets 2023/iu],
  ];
  const directory = officialServiceCatalogueDocuments();

  for (const [query, expectedIntent, expectedAnswer] of cases) {
    assert.equal(forestEvidenceIntent(query)?.kind, expectedIntent, query);
    const visible = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
      now: NOW,
    }).slice(0, 12);
    const plan = selectAnswerEvidence(query, visible);
    assert.equal(plan?.kind, expectedIntent, query);
    assert.equal(plan?.strong, true, query);
    assert.ok((plan?.supportingDocumentIds || []).every((id) => (
      visible.find((document) => document.id === id)?.sourceTier === "official"
    )), query);

    const draft = await createPortalDraft(query, {
      deadlineAt: Date.now(),
      searchResults: { total: visible.length, items: visible },
    });
    assert.match(answerText(draft), expectedAnswer, query);
    assert.ok(draft.sources.every((source) => source.organization !== "KAUR"), query);
  }
});

test("new forestry knowledge adds no Statistikaamet source", () => {
  const knowledgeIds = new Set([
    "bark-beetle-monitoring-2026",
    "wood-balance-overview",
    "smi",
    "forest-yearbook-overview",
    "lulucf-definition",
    "protected-forest-share",
  ]);
  const added = officialServiceCatalogueDocuments().filter((document) => knowledgeIds.has(document.id));
  assert.equal(added.length, knowledgeIds.size);
  assert.ok(added.every((document) => document.organization !== "Statistikaamet"));
  for (const document of added) {
    const reviewedAt = Date.parse(document._catalogueReviewedAt);
    assert.ok(Number.isFinite(reviewedAt), document.id);
    assert.ok(reviewedAt <= NOW && NOW - reviewedAt <= 31 * 24 * 60 * 60 * 1_000, document.id);
    assert.equal(document._evidenceStatusAt, document._catalogueReviewedAt, document.id);
    assert.match(document._evidenceVersion, new RegExp(`^catalogue-review-${document._catalogueReviewedAt.slice(0, 10)}:[0-9a-f]{64}$`, "u"), document.id);
    assert.equal(document.sourceProfile.checkedAt, document._catalogueReviewedAt.slice(0, 10), document.id);
  }
  assert.ok(added.every((document) => document.sourceProfile.routeClasses.includes("official_forestry_evidence")));
});

test("publication metadata keeps the data period distinct from the page update date", async () => {
  const directory = officialServiceCatalogueDocuments();
  const woodBalance = directory.find((document) => document.id === "wood-balance-overview");
  assert.equal(woodBalance.dataYear, "2023");
  assert.equal(woodBalance.dataAsOf, "18.03.2026");
  assert.equal(woodBalance.updated, "01.10.2026");

  const visible = rankPublicSearchCandidates("Mis on puidubilanss?", directory, {
    intentDocuments: directory,
    now: NOW,
  }).slice(0, 12);
  const draft = await createPortalDraft("Mis on puidubilanss?", {
    deadlineAt: Date.now(),
    searchResults: { total: visible.length, items: visible },
  });
  const response = publicResponse(draft, { now: NOW });
  const publicSource = response.sources.find((source) => source.id === "wood-balance-overview");
  assert.equal(publicSource.dataYear, "2023");
  assert.equal(publicSource.dataAsOf, "18.03.2026");
});

test("primary report extracts preserve period, units, method and page locator", () => {
  const directory = officialServiceCatalogueDocuments();
  const balance = directory.find((document) => document.id === "wood-balance-2023-report");
  assert.ok(balance);
  assert.equal(balance.dataYear, "2023");
  assert.match(balance.url, /Puidubilanss%202023\.pdf$/u);
  assert.match(balance.content, /16 398 000[\s\S]*11,7[\s\S]*3,5/u);
  assert.match(balance.content, /tihumeetriteks[\s\S]*tagasiulatuvalt/u);
  assert.match(balance.locator, /3[–-]4/u);
  const groundwater = directory.find((document) => document.id === "groundwater-balance-2025-report");
  assert.ok(groundwater);
  assert.equal(groundwater.dataYear, "2025");
  assert.match(groundwater.content, /689 662[\s\S]*m³[\s\S]*ööpäevas/u);
  assert.match(groundwater.content, /kaevandustest ja karjääridest/u);
  const monitoring = directory.find((document) => document.id === "groundwater-monitoring-2025-report");
  assert.ok(monitoring);
  assert.equal(monitoring.organization, "Eesti Keskkonnauuringute Keskus");
  assert.match(monitoring.content, /248[\s\S]*232/u);
  assert.match(monitoring.locator, /7[–-]9/u);
  const yearbook = directory.find((document) => document.id === "forest-yearbook-2023-fellings");
  assert.match(yearbook.content, /Majandatav mets[\s\S]*majanduspiiranguga[\s\S]*majanduspiiranguta/u);
  assert.match(yearbook.content, /9\. septembri 2024/u);
  assert.match(yearbook.content, /managed forest[\s\S]*forest available for wood supply/u);
});

test("new report evidence covers actual quantities but rejects another year and tags-only witnesses", () => {
  const directory = officialServiceCatalogueDocuments();
  for (const [query, id] of [
    ["Kui suur oli põhjaveevõtt 2025?", "groundwater-balance-2025-report"],
    ["Põhjaveeseire veetase 2025", "groundwater-monitoring-2025-report"],
    ["Puidubilansi kogumaht 2023", "wood-balance-2023-report"],
  ]) {
    const document = directory.find((item) => item.id === id);
    const ranked = rankPublicSearchCandidates(query, [document], {now: NOW}).map((item) => ({...item, score: item._ranking.score}));
    assert.equal(assessSearchQuery(query).kind, "answerable", query);
    assert.equal(assessEvidence(query, ranked).strong, true, query);
    assert.equal(assessEvidence(query, [{...document, score: 100, title: "Aruanne", summary: "", content: ""}]).strong, false, query);
  }
  const groundwater = directory.find((item) => item.id === "groundwater-balance-2025-report");
  assert.equal(assessEvidence("Kui suur oli põhjaveevõtt 2026?", [{...groundwater, score: 100}]).strong, false);
  assert.equal(assessEvidence("Kui suur oli põhjaveevõtt Harjumaal 2025?", [{...groundwater, score: 100}]).strong, false);
  assert.equal(assessEvidence("Kui suur oli põhjaveevõtt Rootsis 2025?", [{...groundwater, score: 100}]).strong, false);
  assert.equal(assessEvidence("Kui suur oli põhjaveevõtt Narvas 2025?", [{...groundwater, score: 100}]).strong, false);
  const landing = directory.find((item) => item.id === "groundwater-overview");
  for (const document of [groundwater, landing]) {
    assert.equal(assessEvidence("Kui suur oli põhjaveevõtt Harjumaal 2025?", [{...document, id:"upstream-alias", score:100}]).strong, false);
  }
});

test("the yearbook's checked inventory-method passage is retrievable for source differences", () => {
  const query = "Miks annavad eri allikad erinevaid numbreid?";
  const yearbook = officialServiceCatalogueDocuments().find((item) => item.id === "forest-yearbook-2023-fellings");
  const ranked = rankPublicSearchCandidates(query, [yearbook], {now: NOW});
  assert.equal(ranked.length, 1);
  assert.ok(forestEvidenceIntent(query).serviceDocumentIds.includes(yearbook.id));
  assert.match(yearbook.content, /lausinventeerimis/u);
  const visible = rankPublicSearchCandidates(query, officialServiceCatalogueDocuments(), {now: NOW}).slice(0,12);
  assert.equal(visible[0].id, yearbook.id, "the checked comparison passage must not lose to looser topic phrasing");
  const plan = selectAnswerEvidence(query, visible);
  assert.equal(plan.strong, true);
  assert.equal(plan.directDocumentId, yearbook.id);
  assert.equal(selectAnswerEvidence(query, [{...yearbook, title:"Aastaraamat", summary:"", content:"", tags:["SMI","metsaregister","metoodika"]}])?.strong, false);
});
