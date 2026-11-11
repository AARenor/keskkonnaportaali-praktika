// Behaviour tests for the 2025 felling versus growth question, SMI edition
// attribution, the gross/net increment boundary and the handbook limit.
//
// These assert the reviewed facts: SMI 2025 workbook worksheet 11 (increment),
// worksheet 22 and 34 (sample based felling estimates, latest year 2024), worksheet 23 (five
// year average with no printed window), Keskkonnaagentuur 18.08.2026 news (2025
// felling is an expert estimate, managed forest net increment 4,9 m³/ha) and
// Keskkonnaagentuur 09.04.2026 analysis (decade versus 20 year relation).

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
import {
  ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS,
  forestryIntentDefinitions,
} from "../server/forestry-public.mjs";
import { selectAnswerEvidence } from "../server/retrieval.mjs";
import * as smiTables from "../server/smi-tables.mjs";

const NOW = Date.parse("2026-11-04T12:00:00.000Z");
const Q2025 = "kas 2025. aastal raiuti rohkem kui mets kasvas";

function ok(value, message) {
  assert.ok(value, message);
  return value;
}

function normalizeText(value) {
  return String(value || "")
    .toLocaleLowerCase("et")
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .trim();
}

// The balance answer may only cite the workbook extract, the Keskkonnaagentuur
// balance analysis and the Eurostat handbook, the same set production passes.
function balanceSources() {
  const workbook = ok(smiHarvestBalanceDocument(), "the SMI 2025 balance extract must exist");
  return [
    workbook,
    {
      id: "forest-balance-kaur-methodology",
      title: "Netojuurdekasvu ja raie tasakaal",
      organization: "Keskkonnaagentuur",
      type: "Analüüs",
      url: "https://keskkonnaagentuur.ee/node/2720",
      summary: "",
      content: "Netojuurdekasv saadakse, kui juurdekasvust arvatakse maha looduslikult väljalangev puidukogus. Raiemahuga tuleb võrrelda elusate puude raiet. Viimase kümnendi keskmisena on elusate puude raiemaht olnud kõrgem kui majandatavate metsade netojuurdekasv. Kui vaadelda 20 aasta pikkust perioodi, siis on eluspuude raiemaht olnud alla netojuurdekasvu. Ühe näitaja põhjal ei ole võimalik teha lõplikku järeldust metsamajanduse jätkusuutlikkuse kohta.",
      topics: ["mets"],
      tags: ["mets"],
      sourceTier: "official",
      retrieval: "official-structured-forestry-source",
      evidencePolicy: "claim-specific",
      _answerEvidenceEligible: true,
    },
    {
      id: "forest-balance-eurostat-handbook",
      title: "European Forest Accounts Handbook: raiemaht (removals) ja netojuurdekasv",
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
    },
    {
      id: "forest-stock-stable",
      title: "SMI: Metsatagavara on stabiilne",
      organization: "Keskkonnaagentuur",
      type: "Metsastatistika",
      url: "https://keskkonnaagentuur.ee/uudised/smi-metsatagavara-stabiilne",
      summary: "",
      content: "2025. aastal oli majandatava metsa netojuurdekasvuks 4,9 m³/ha aastas. Raiemahu eksperthinnangu alusel oli 2025. aasta raiemaht 11 miljonit m³.",
      topics: ["mets", "SMI"],
      tags: ["mets", "SMI"],
      sourceTier: "official",
      retrieval: "official-structured-forestry-source",
      evidencePolicy: "claim-specific",
      _publishedAt: "2026-08-18",
      _answerEvidenceEligible: true,
    },
  ];
}

test("the 2025 felling question gets no single year verdict", () => {
  const sources = balanceSources();
  const response = ok(
    composeForestHarvestBalanceAnswer(Q2025, sources, Q2025),
    "the 2025 harvest balance question must still produce a cited answer",
  );
  const { answer } = response;

  assert.doesNotMatch(
    answer.title,
    /kasvab mets juurde rohkem kui raiutakse|raiutakse rohkem kui juurde kasvab/u,
    "a 2025 question must not be answered with a verdict built on the 2024 felling year",
  );
  assert.doesNotMatch(
    answer.intro,
    /^(?:Jah|Ei)\./u,
    "no yes or no verdict may open a question about a year without a comparable SMI pair",
  );
  assert.match(answer.intro, /SMI 2025/u, "the answer names the SMI edition it is using");
  assert.match(answer.intro, /eksperthinnang/u, "the 2025 felling figure is labelled an expert estimate");
  assert.match(answer.intro, /11(?:,0)? miljonit m³/u, "the 2025 expert estimate is the published 11 million m³");
  assert.match(answer.intro, /2024\. aasta/u, "the answer names the latest workbook felling year");
  assert.match(answer.intro, /netojuurdekasv/u, "the answer distinguishes net increment from gross increment");
  assert.ok(
    answer.introCitations.includes(4),
    "the expert estimate is attributed to the 18.08.2026 Keskkonnaagentuur review, not to the workbook",
  );
  assert.match(answer.note, /kestlikkuse/u, "the sustainability caveat stays");
});

test("2025 felling is never attributed to a source that does not publish it", () => {
  const workbook = ok(smiHarvestBalanceDocument(), "the SMI 2025 balance extract must exist");
  assert.doesNotMatch(
    workbook.content,
    /eksperthinnang|11,0 miljonit/u,
    "the workbook publishes no 2025 felling and may not be quoted for one",
  );
  assert.match(workbook.content, /aegrida lõpeb 2024\. aastaga/u);
  assert.match(workbook.content, /ega sisalda 2025\. aasta raiemahtu/u);

  const projection = ok(validatedSmiHarvestBalanceProjection(workbook));
  assert.equal(projection.cutYear, 2024, "the workbook felling series ends in 2024");
  assert.equal(projection.cut2025ExpertThousandM3, 11_000, "the 2025 expert estimate is carried as its own field");
  assert.equal(projection.cut2025IsExpertEstimate, true);
  assert.equal(
    projection.cut2025ExpertRelativeErrorPercent,
    null,
    "the expert estimate has no published sampling error and none may be invented",
  );

  const visible = ok(composeForestHarvestBalanceAnswer(Q2025, balanceSources(), Q2025));
  assert.match(visible.answer.intro, /eksperthinnang/u);
  assert.ok(visible.answer.introCitations.includes(4), "the review that published the estimate is cited");

  const withoutNews = ok(
    composeForestHarvestBalanceAnswer(Q2025, balanceSources().filter((source) => source.id !== "forest-stock-stable"), Q2025),
  );
  assert.doesNotMatch(
    withoutNews.answer.intro,
    /eksperthinnang|11,0 miljonit/u,
    "without the review the estimate is omitted, not attributed to the workbook",
  );
  assert.deepEqual(withoutNews.answer.introCitations, [1]);
});

test("gross increment is never used as net increment and no 2025 net total is invented", () => {
  const workbook = ok(smiHarvestBalanceDocument(), "the SMI 2025 balance extract must exist");
  assert.match(
    workbook.content,
    /kogujuurdekasvust arvatakse netojuurdekasvu saamiseks maha looduslik suremus/iu,
    "mortality is subtracted from gross growth",
  );
  assert.doesNotMatch(
    workbook.content,
    /netojuurdekasvust arvatakse maha/u,
    "the definition must not be reversed",
  );
  assert.doesNotMatch(
    workbook.content,
    /netojuurdekasv\w*[^.]{0,60}?(?:9\s?\d{3}|1\d[,.]\d)\s*(?:tuhat|miljonit)\s*m³/u,
    "no national net increment total may be derived from the per hectare figure",
  );

  const projection = ok(validatedSmiHarvestBalanceProjection(workbook));
  assert.equal(
    projection.netIncrementNationalThousandM3 ?? null,
    null,
    "the workbook publishes no national net increment total",
  );

  const response = ok(composeForestHarvestBalanceAnswer(Q2025, balanceSources(), Q2025));
  assert.match(response.answer.intro, /4,9 m³ hektari kohta/u, "the per hectare net figure is quoted");
  assert.ok(response.answer.introCitations.includes(4), "the per hectare net figure is cited to the review");
  assert.doesNotMatch(
    response.answer.intro,
    /netojuurdekasvuks oli [\d\s.,]+\s*(?:tuhat|miljonit) m³/u,
    "the answer must not state a national net increment total",
  );
});

test("the SMI edition is named and the previous edition's numbers stay out", () => {
  const workbook = ok(smiHarvestBalanceDocument(), "the SMI 2025 balance extract must exist");
  assert.equal(workbook.url, smiTables.SMI_2025_TABLES_URL);
  assert.equal(workbook._smiEdition?.dataAsOf, "2026-08-18");
  assert.equal(smiTables.SMI_2025_INCREMENT.dataYear, 2025);
  assert.doesNotMatch(workbook.content, /15 430|15,4303|SMI 2024/u);

  const increment = ok(
    composeSmiIncrementResponse("kui palju puitu juurde kasvab Eestis", [smiIncrementDocument()]),
    "the increment question is answered from the SMI 2025 workbook",
  );
  assert.match(increment.answer.eyebrow, /SMI 2025/u);
  assert.match(increment.answer.intro, /15 458/u);
  assert.doesNotMatch(increment.answer.intro, /15 430|15,4303/u);
  assert.equal(isForestIncrementQuestion("kui palju puitu juurde kasvab Eestis"), true);
});

test("the five year felling average never gains an invented window", () => {
  const fiveYear = ok(smiTables.SMI_2025_FIVE_YEAR_CUT);
  assert.equal(fiveYear.thousandM3, 11896.779);
  assert.equal(
    Object.keys(fiveYear).filter((key) => /^(years|window|period|from|to)$/u.test(key)).length,
    0,
    "worksheet 23 prints no calendar window, so none may be carried",
  );

  const workbook = ok(smiHarvestBalanceDocument(), "the SMI 2025 balance extract must exist");
  assert.doesNotMatch(
    workbook.content,
    /viie aasta keskmine[^.]{0,80}?(?:19|20)\d{2}\s*(?:kuni|k\.?|–|-)\s*(?:19|20)\d{2}/u,
    "the five year average must not be given a year range",
  );
});

test("Metsandusteatmik stays a bibliography entry without stock or price claims", () => {
  const entry = ok(
    ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS.find((document) => document.id === "metsandusteatmik"),
    "the reviewed handbook entry must stay in the catalogue",
  );
  const entryText = `${entry.summary} ${entry.content}`;
  assert.doesNotMatch(entryText, /laost otsas|laos otsas|hetkel laos|saadaval|hind|€/u);

  const document = {
    ...entry,
    sourceTier: "official",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    _evidenceStatusAt: new Date(NOW).toISOString(),
    freshness: { class: "reviewed-catalogue-extract", basis: "reviewed-at", maxAgeMs: 366 * 24 * 60 * 60 * 1_000, requiresSourceTimestamp: true },
  };
  const response = ok(composeMetsandusteatmikResponse("metsandusteatmik", [document], { now: NOW }));
  const answerText = [
    response.answer.title,
    response.answer.intro,
    ...response.answer.parts.map((part) => part.text),
    response.answer.note,
  ].join(" ");
  assert.match(answerText, /432/u);
  assert.match(answerText, /978-9916-620-22-9/u);
  assert.match(answerText, /bibliograaf|ei ole avalikus veebis/u);
  assert.doesNotMatch(answerText, /laost otsas|saadaval|€|hind/u, "the answer may not claim availability or price");
});

test("sampling uncertainty travels with every number", () => {
  const workbook = ok(smiHarvestBalanceDocument(), "the SMI 2025 balance extract must exist");
  assert.match(workbook.content, /±1,4%/u, "increment relative error");
  assert.match(workbook.content, /±9,6%/u, "2024 felling relative error");
  assert.match(workbook.content, /±7,6%/u, "five year felling relative error");
  assert.match(workbook.content, /suhteline viga|valikuuring/u);

  const response = ok(composeForestHarvestBalanceAnswer(Q2025, balanceSources(), Q2025));
  assert.match(response.answer.intro, /±1,4%/u);
});

test("the harvest question's evidence groups are satisfiable by published wording", () => {
  const definitions = forestryIntentDefinitions();
  const corpus = [
    "Raiemahu eksperthinnangu alusel oli 2025. aasta raiemaht 11 miljonit m³.",
    "Raiemaht on püsinud viimastel aastatel ca 11–12 miljoni tihumeetri tasemel.",
    "2025. aastal oli majandatava metsa netojuurdekasvuks 4,9 m³/ha aastas.",
    ok(smiHarvestBalanceDocument(), "the SMI 2025 balance extract must exist").content,
    "Netojuurdekasv saadakse, kui juurdekasvust arvatakse maha looduslik suremus. Viimase kümnendi keskmisena on elusate puude raiemaht olnud kõrgem kui majandatavate metsade netojuurdekasv, kuid 20 aasta vaates alla netojuurdekasvu. Ühe näitaja põhjal ei saa teha lõplikku järeldust metsamajanduse kestlikkuse kohta.",
  ].map(normalizeText);

  const unsatisfied = [];
  for (const kind of ["forest-harvest-2025", "forest-harvest-balance"]) {
    const spec = ok(definitions[kind], `${kind} must stay a defined forestry intent`);
    spec.evidenceGroups.forEach((group, index) => {
      const alternatives = group.map(normalizeText);
      const satisfied = corpus.some((text) => alternatives.some((alternative) => alternative && text.includes(alternative)));
      if (!satisfied) unsatisfied.push(`${kind} group ${index + 1}: ${group.join(" | ")}`);
    });
  }
  assert.deepEqual(
    unsatisfied,
    [],
    `every required evidence group must be satisfiable by the real published wording:\n${unsatisfied.join("\n")}`,
  );
});

test("circulating false claims still resolve to the reviewed correction pairs", () => {
  const entry = ok(
    ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS.find((document) => document.id === "mets-fact-check-corrections"),
  );
  assert.equal(entry.published, "17.03.2023");
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
  assert.equal(selection.claimPairs.length, 4);
});
