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
import { createPortalDraft, publicResponse } from "../server/pipeline.mjs";

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
  assert.equal(woodBalance.updated, "02.09.2026");

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
