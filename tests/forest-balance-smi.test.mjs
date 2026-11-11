import assert from "node:assert/strict";
import test from "node:test";
import {
  composeForestHarvestBalanceAnswer,
  composeMetsandusteatmikResponse,
  composeSmiIncrementResponse,
  isForestIncrementQuestion,
  smiHarvestBalanceDocument,
  smiIncrementDocument,
  validatedSmiHarvestBalanceProjection,
} from "../server/indicators.mjs";
import { searchTimeoutFallback } from "../server/pipeline.mjs";
import { selectAnswerEvidence } from "../server/retrieval.mjs";
import { sourceCanSupportPublicCitation } from "../server/source-registry.mjs";
import { ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS } from "../server/forestry-public.mjs";
import { SMI_2025_TABLES_URL } from "../server/smi-tables.mjs";

const NOW = Date.parse("2026-11-04T12:00:00.000Z");

// A year inside Estonian running text ("2025. aasta") looks like a full stop to
// a naive sentence split. Protect it so a claim can be checked together with
// the qualifier that limits it.
function sentencesOf(value) {
  return String(value)
    .replace(/(?<=\b\d{4})\.(?=\s)/gu, "\u0000")
    .split(/(?<=\.)\s+/u)
    .map((sentence) => sentence.replaceAll("\u0000", "."));
}

function cardTextOf(response) {
  const answer = response?.answer || {};
  return [answer.title, answer.intro, ...(answer.parts || []).map((part) => part.text)]
    .filter(Boolean)
    .join(" ");
}

// A qualifier that limits an availability claim to the publication it is about.
const WORKBOOK_SCOPED = /(?:töövihik|selles väljaandes|väljavõttest)/iu;
const ESTIMATE_2025_SOURCE = {
  id: "forest-stock-stable",
  title: "SMI: Metsatagavara on stabiilne",
  organization: "Keskkonnaagentuur",
  url: "https://keskkonnaagentuur.ee/uudised/smi-metsatagavara-stabiilne",
  summary: "",
  content: "2025. aastal oli majandatava metsa netojuurdekasvuks 4,9 m³/ha aastas. Raiemahu eksperthinnangu alusel oli 2025. aasta raiemaht 11 miljonit m³.",
  topics: ["mets"],
  tags: ["mets"],
  sourceTier: "official",
  retrieval: "official-structured-forestry-source",
  evidencePolicy: "claim-specific",
  _publishedAt: "2026-08-18",
  _answerEvidenceEligible: true,
};

function synthesisDocuments() {
  const smi = smiHarvestBalanceDocument();
  const methodology = {
    id: "forest-balance-kaur-methodology",
    title: "Netojuurdekasvu ja raie tasakaal",
    organization: "Keskkonnaagentuur",
    type: "Analüüs",
    url: "https://keskkonnaagentuur.ee/node/2720",
    summary: "",
    content: "Netojuurdekasv saadakse, kui juurdekasvust arvatakse maha looduslik suremus. Viimase kümnendi keskmisena on elusate puude raiemaht olnud kõrgem kui majandatavate metsade netojuurdekasv.",
    topics: ["mets"],
    tags: ["mets"],
    sourceTier: "official",
    retrieval: "official-structured-forestry-source",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
  };
  const handbook = {
    id: "forest-balance-eurostat-handbook",
    title: "European Forest Accounts Handbook",
    organization: "Eurostat",
    type: "Metoodika",
    url: "https://ec.europa.eu/eurostat/web/products-manuals-and-guidelines/w/ks-gq-24-015",
    summary: "",
    content: "EFA raiemaht (removals) mõõdab aruandeperioodil metsast eemaldatud elusate ja surnud puude mahtu koorega ega ole üks-ühele sama mis ühe aasta SMI raiemaht.",
    topics: ["mets"],
    tags: ["mets"],
    sourceTier: "official",
    retrieval: "official-eurostat-methodology",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
  };
  return [smi, methodology, handbook];
}

test("the SMI 2025 balance extract carries the workbook values and rejects tampering", () => {
  const document = smiHarvestBalanceDocument();
  assert.equal(document.url, SMI_2025_TABLES_URL);
  assert.match(document.content, /15 458 tuhat m³ aastas/u);
  assert.match(document.content, /12 500 tuhat m³/u);
  assert.match(document.content, /11 897 tuhat m³/u);
  assert.match(document.content, /mudeli alusel/u);
  assert.equal(sourceCanSupportPublicCitation(document).eligible, true);

  const projection = validatedSmiHarvestBalanceProjection(document);
  assert.equal(projection.incrementThousandM3PerYear, 15458.258);
  assert.equal(projection.cutYear, 2024);
  assert.equal(projection.removalsHigher, false);

  const tampered = {
    ...document,
    _smiHarvestBalance: { ...projection, incrementThousandM3PerYear: 9_000 },
  };
  assert.equal(validatedSmiHarvestBalanceProjection(tampered), null);
  assert.equal(validatedSmiHarvestBalanceProjection({ ...document, id: "other" }), null);
});

test("harvest versus increment answers from the SMI 2025 edition without a gross subtraction or a year verdict", () => {
  const documents = synthesisDocuments();
  const query = "kas Eestis raiutakse rohkem kui juurde kasvab";
  const direct = composeForestHarvestBalanceAnswer(query, documents, query);
  assert.equal(direct.answer.eyebrow, "Keskkonnaagentuur, SMI 2025");
  assert.match(direct.answer.title, /sõltub mõõdikust ja perioodist/u);
  assert.doesNotMatch(direct.answer.intro, /^(?:Jah|Ei)\./u, "no single verdict is given");
  assert.match(direct.answer.intro, /15 458 tuhat m³/u);
  assert.match(direct.answer.intro, /11 897 tuhat m³/u);
  assert.doesNotMatch(
    direct.answer.intro,
    /2 958|12 500/u,
    "gross annual increment minus total felling is not a comparison and is not printed",
  );
  assert.match(
    direct.answer.intro,
    /kogujuurdekasvust arvatakse netojuurdekasvu saamiseks maha looduslik suremus/u,
    "gross growth is the base from which mortality is subtracted",
  );
  assert.deepEqual(direct.answer.introCitations, [1]);
  assert.equal(direct.answer.parts.length, 2);
  assert.deepEqual(direct.answer.parts.map((part) => part.citations), [[2], [3, 1]]);
  assert.match(direct.answer.parts[0].text, /kümnendi keskmisena[\s\S]*20 aasta/u);
  assert.doesNotMatch(direct.answer.intro, /Eurostat/u);

  const reverse = composeForestHarvestBalanceAnswer("kas juurde kasvab rohkem kui raiutakse", documents, "kas juurde kasvab rohkem kui raiutakse");
  assert.equal(reverse.answer.title, direct.answer.title, "the wording of the question does not flip a verdict");
  assert.doesNotMatch(reverse.answer.intro, /^(?:Jah|Ei)\./u);
});

test("the 2025 expert estimate is stated only when its own source is visible", () => {
  const workbook = smiHarvestBalanceDocument();
  const methodology = synthesisDocuments()[1];
  const withNews = [workbook, methodology, ESTIMATE_2025_SOURCE];
  const query = "kas 2025. aastal raiuti rohkem kui mets kasvas";
  const visible = composeForestHarvestBalanceAnswer(query, withNews, query);
  assert.match(visible.answer.intro, /eksperthinnang/u);
  const newsCitation = withNews.findIndex((source) => source.id === "forest-stock-stable") + 1;
  assert.ok(
    visible.answer.introCitations.includes(newsCitation),
    "the estimate is cited to the review that published it",
  );

  const withoutNews = composeForestHarvestBalanceAnswer(query, [workbook, methodology], query);
  assert.doesNotMatch(withoutNews.answer.intro, /eksperthinnang|11,0 miljonit/u, "the workbook publishes no 2025 estimate");
  assert.deepEqual(withoutNews.answer.introCitations, [1]);
});

// The checked evidence is the SMI 2025 workbook plus the review that publishes
// the 2025 expert estimate. Nothing in it establishes that no 2025 measurement
// exists anywhere, and the 2024 workbook figure is a sample survey estimate:
// worksheet 22 prints 12 500 thousand m³ with a ±9,6% relative error.
test("the 2024 felling figure is an SMI survey estimate, not an exact measurement", () => {
  const documents = synthesisDocuments();
  const query = "kas 2025. aastal raiuti rohkem kui mets kasvas";
  const response = composeForestHarvestBalanceAnswer(query, documents, query);
  const text = cardTextOf(response);

  assert.match(text, /2024\. aasta[^.]*12 500 tuhat m³/u, "the 2024 felling amount keeps its year");
  assert.match(text, /12 500 tuhat m³[^.]*±9,6\s?%/u, "the 2024 felling amount keeps its relative error");
  assert.match(text, /2024\. aasta[^.]*hinnang/u, "the 2024 figure is named an estimate");
  assert.doesNotMatch(text, /2024\. aasta mõõdetud/u, "the 2024 SMI figure is not an exact measurement");
  assert.doesNotMatch(text, /mõõdetud koguraie/u, "no exact measurement wording for the SMI felling series");
  assert.deepEqual(response.answer.introCitations, [1], "the workbook stays the cited witness");
});

test("the missing 2025 measured felling is scoped to the SMI 2025 workbook", () => {
  const workbook = smiHarvestBalanceDocument();
  const methodology = synthesisDocuments()[1];
  const query = "kas 2025. aastal raiuti rohkem kui mets kasvas";
  const states = [
    ["without the review that publishes the estimate", [workbook, methodology]],
    ["with the review that publishes the estimate", [workbook, methodology, ESTIMATE_2025_SOURCE]],
  ];
  for (const [label, sources] of states) {
    const response = composeForestHarvestBalanceAnswer(query, sources, query);
    if (!sources.includes(ESTIMATE_2025_SOURCE)) {
      assert.match(response.answer.title, /töövihik/iu, "the heading limits the missing row to the workbook");
    }
    const text = cardTextOf(response);
    const claims = sentencesOf(text).filter((sentence) => /2025\. aasta mõõdetud raiemahtu/u.test(sentence));
    assert.ok(claims.length > 0, `${label}: the answer states whether a measured 2025 felling figure exists: ${text}`);
    for (const claim of claims) {
      assert.match(
        claim,
        WORKBOOK_SCOPED,
        `${label}: the availability claim must name the publication it is limited to, got: ${claim}`,
      );
    }
    assert.doesNotMatch(
      text,
      /2025\. aasta mõõdetud raiemahtu (?:ei ole|pole) (?:kusagil|kuskil|üldse|veel) avaldatud/iu,
      `${label}: no global claim about unpublished 2025 measurements`,
    );
    assert.match(text, /2025\. aasta/u, `${label}: the asked year stays in the answer`);
  }
});

test("without the SMI workbook extract the same question keeps its Eurostat fallback", () => {
  const documents = synthesisDocuments().filter((document) => document.id !== "forest-balance-smi2025");
  const fallback = composeForestHarvestBalanceAnswer("kas Eestis raiutakse rohkem kui juurde kasvab", documents, "kas Eestis raiutakse rohkem kui juurde kasvab");
  assert.equal(fallback, null, "Eurostat observations are absent here, so no invented answer is produced");
});

test("an increment question is answered from the SMI 2025 worksheet, not the 2024 PDF", () => {
  assert.equal(isForestIncrementQuestion("kui palju puitu juurde kasvab Eestis"), true);
  const document = smiIncrementDocument();
  assert.equal(document.url, SMI_2025_TABLES_URL);
  assert.equal(sourceCanSupportPublicCitation(document).eligible, true);
  const response = composeSmiIncrementResponse("kui palju puitu juurde kasvab Eestis", [document]);
  assert.match(response.answer.title, /Juurdekasv SMI 2025 andmetel: 15 458 tuhat m³ aastas/u);
  assert.match(response.answer.intro, /6,55 m³ hektari kohta/u);
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.equal(response.sources.length, 1);
  assert.equal(composeSmiIncrementResponse("kui palju on raiemaht", [document]), null);
});

test("Metsandusteatmik is identified from its reviewed entry, never quoted", () => {
  const entry = ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS.find((document) => document.id === "metsandusteatmik");
  assert.ok(entry);
  const document = {
    ...entry,
    sourceTier: "official",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    _evidenceStatusAt: new Date(NOW).toISOString(),
    freshness: { class: "reviewed-catalogue-extract", basis: "reviewed-at", maxAgeMs: 366 * 24 * 60 * 60 * 1_000, requiresSourceTimestamp: true },
  };
  const response = composeMetsandusteatmikResponse("metsandusteatmik", [document], { now: NOW });
  assert.match(response.answer.intro, /432/u);
  assert.match(response.answer.intro, /978-9916-620-22-9/u);
  assert.match(response.answer.parts[0].text, /paberväljaandega/u);
  assert.deepEqual(response.answer.introCitations, [1]);
});

test("circulating forest allegations are answered from the reviewed claim and correction pairs", () => {
  const entry = ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS.find((document) => document.id === "mets-fact-check-corrections");
  assert.ok(entry, "the correction article must stay a reviewed document");
  assert.equal(entry.published, "17.03.2023");
  assert.equal(entry._publishedAt, "2023-03-17");
  assert.match(entry.url, /keskkonnaagentuur\.ee\/uudised\/keskkonnaagentuur-lukkab-umber-metsastatistika-kohta-kaivad-valevaited/u);
  assert.deepEqual(entry._forestryIntentKinds, ["forest-fact-check"]);

  // Mirrors what `officialServiceCatalogueDocuments()` hands the retriever:
  // a reviewed catalogue extract is versioned evidence with a review window.
  const document = {
    ...entry,
    sourceTier: "official",
    retrieval: "official-service-directory",
    evidencePolicy: "versioned",
    _answerEvidenceEligible: true,
    _evidenceVersion: "c0ffee",
    _evidenceStatusAt: new Date(NOW).toISOString(),
    freshness: { class: "reviewed-catalogue-extract", basis: "reviewed-at", maxAgeMs: 366 * 24 * 60 * 60 * 1_000, requiresSourceTimestamp: true },
  };
  const selection = selectAnswerEvidence("metsa kohta levivad valeväited", [document], { now: NOW });
  assert.equal(selection.kind, "forest-fact-check");
  assert.equal(selection.strong, true);
  assert.equal(selection.claimPairs.length, 4);
  assert.match(selection.claimPairs[0].claim, /raieküps mets Eestis otsas/u);
  assert.ok(selection.claimPairs.every((pair) => pair.corrections.length >= 1));
});

test("a timed-out answer still leads with a cited source extract", () => {
  const ranked = [{
    id: "forest-area",
    title: "SMI 2024: Eesti metsamaa pindala",
    url: "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI2024/SMI_2024.pdf",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Statistika",
    sourceTier: "official",
    retrieval: "official-structured-forestry-source",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    freshness: { class: "annual-historical-statistic", basis: "reference-year", maxAgeMs: null, requiresSourceTimestamp: false },
    summary: "SMI 2024 järgi oli metsamaa pindala 2 350,6 tuhat hektarit.",
    content: "SMI 2024 järgi oli metsamaa pindala 2 350,6 tuhat hektarit: 51,84% kogu Eesti pindalast. Pindalahinnangu suhteline viga oli ±1,2%.",
  }];
  const result = searchTimeoutFallback("kui suur on metsamaa pindala", {
    assessmentQuery: "kui suur on metsamaa pindala",
    searchResults: { items: ranked, total: 1 },
  });
  assert.equal(result.answer.eyebrow, "Allika viidatud väljavõte");
  assert.match(result.answer.intro, /2 350,6 tuhat hektarit/u);
  assert.deepEqual(result.answer.introCitations, [1]);
  assert.equal(result.answer.aiUnavailable, true);
  assert.equal(result.sources.length, 1);

  const empty = searchTimeoutFallback("kui suur on metsamaa pindala", { assessmentQuery: "kui suur on metsamaa pindala" });
  assert.deepEqual(empty.answer.introCitations, []);
  assert.equal(empty.answer.parts.length, 0);
});
