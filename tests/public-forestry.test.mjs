import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assessSearchQuery,
  composeScopeResponse,
  forestEvidenceIntent,
  officialServiceCatalogueDocuments,
} from "../server/search.mjs";
import {
  rankPublicSearchCandidates,
  selectAnswerEvidence,
} from "../server/retrieval.mjs";
import { createPortalDraft } from "../server/pipeline.mjs";
import {
  forestHarvestBalanceDocumentsFromJson,
  isForestHarvestBalanceQuery,
} from "../server/indicators.mjs";
import {
  FORESTRY_BALANCE_VARIANTS,
  FORESTRY_NEGATIVE_COLLISIONS,
  FORESTRY_VARIANT_GROUPS,
  MUNICIPALITY_CLARIFICATION_VARIANTS,
} from "./fixtures/forestry-query-matrix.mjs";

const NOW = Date.parse("2026-08-19T12:00:00Z");

const DETERMINISTIC_CASES = [
  ["SMI vs lausmetsakorraldus – tagavara on ülehinnatud.", "smi-method-comparison", /ei tõenda[^.]*üle hinnatud/iu],
  ["Tagavara ei võrdu reaalselt kättesaadava puiduga.", "stock-versus-harvestable", /ei ole aastane raiemaht[^.]*raiutav puidukogus/iu],
  ["RMK andmed vs SMI andmed.", "rmk-versus-smi", /RMK hallatavate[\s\S]*SMI[\s\S]*kogu Eesti/iu],
  ["Metsasuse ja pindala protsendid.", "forest-covered-area", /51,8[4%][\s\S]*47,11%[\s\S]*eri näitajad/iu],
  ["Suurem valim ei tähenda automaatselt täpsemat tulemust.", "sample-size-and-precision", /Valimi suurus üksi ei määra hinnangu täpsust/iu],
  ["Eesti metsad hävivad kiiresti.", "forest-depletion", /ei viita[^.]*otsa saamas/iu],
  ["Kõik lageraied on keskkonnavastased.", "clearcut-value-judgement", /kõik lageraied[^.]*ei ole mõõdetav üksikfakt/iu],
  ["Vana mets on automaatselt kaitse all.", "old-forest-protection", /ei anna[^.]*automaatset õiguslikku kaitset/iu],
  ["Metsaregistri ja SMI andmed peavad alati kattuma.", "forest-data-sources", /SMI[\s\S]*Metsaregister[\s\S]*kinnistu/iu],
  ["Metsa tagavara on üks kindel vaieldamatu number.", "forest-stock-uncertainty", /mitte üks kindel vaieldamatu number/iu],
  ["Kui suur osa Eestist on kaetud metsaga?", "forest-covered-area", /47,11%/u],
  ["Miks annavad eri allikad erinevaid numbreid?", "why-forest-numbers-differ", /katvus[\s\S]*andmeaasta[\s\S]*definitsioon/iu],
  ["Mis vahe on SMI-l ja metsaregistril?", "forest-data-sources", /SMI[\s\S]*Metsaregister[\s\S]*kinnistu/iu],
  ["Kuidas arvutatakse juurdekasvu?", "increment-method", /Kogujuurdekasv[\s\S]*Netojuurdekasv[\s\S]*mudelipõhise meetodi[\s\S]*mitmese imputeerimise/iu],
  ["Miks ei võrdu tagavara raiutava puidukogusega?", "stock-versus-harvestable", /ei ole aastane raiemaht[^.]*raiutav puidukogus/iu],
  ["Kust leida konkreetse kinnistu metsaandmeid?", "property-forest-data", /Metsaregistrit ehk Metsaportaali/iu],
  ["Kui suur osa metsadest on kaitse all?", "protected-forest-share", /28,4%[\s\S]*16,8%/u],
  ["Miks erinevad RMK ja SMI numbrid?", "rmk-versus-smi", /RMK hallatavate[\s\S]*SMI[\s\S]*kogu Eesti/iu],
  ["Kuidas mõjutab kliimamuutus metsi?", "climate-impact", /põuad[\s\S]*kuuse-kooreüraski/iu],
  ["Mis on metsateatis?", "forest-notice", /kavandatav\w* raiet?[\s\S]*ei tõenda/iu],
  ["Kas Eestis saab mets otsa?", "forest-depletion", /ei viita[^.]*otsa saamas/iu],
  ["Kas praegu raiutakse rohkem kui 20 aastat tagasi?", "harvest-over-time", /2002\. aasta hinnang 10,157[\s\S]*2022\. aasta hinnang 12,077[\s\S]*18,9% suurem[\s\S]*ei tähenda ühtlast kasvutrendi/iu],
  ["Kas meie metsad muutuvad nooremaks?", "forest-age-trend", /suurenes nii noorte kui ka vanade metsade pindala/iu],
  ["Kuidas muutus lageraie pindala 2014–2024?", "clearcut-over-time", /2014[.–]+2024[\s\S]*29,7[\s\S]*34,0[\s\S]*ei näita ühtlast kasvu/iu],
  ["Kas kuusk või mänd domineerib Eestis?", "pine-versus-spruce", /695,3[\s\S]*431,8[\s\S]*Mänd oli kuusest suurem/iu],
  ["Kas kaitsealadel raiutakse?", "logging-in-protected-areas", /sihtkaitsevööndis[\s\S]*piiranguvööndis[\s\S]*registreeritud raied ei tõenda/iu],
];

const BALANCE_QUERIES = [
  "Juurdekasvu ja raiemahu ekslik võrdlemine.",
  "Raiutakse rohkem kui juurde kasvab.",
  "Kas Eestis raiutakse rohkem kui metsa juurde kasvab?",
];

const MUNICIPAL_QUERY = "Kui palju metsa on minu koduvallas?";

function answerText(draft) {
  return [draft.answer.intro, ...draft.answer.parts.map((part) => part.text)].join("\n");
}

function usedCitations(draft) {
  return new Set([
    ...draft.answer.introCitations,
    ...draft.answer.parts.flatMap((part) => part.citations),
  ]);
}

test("all 30 supplied forestry misconceptions and FAQs have an explicit public route", () => {
  assert.equal(DETERMINISTIC_CASES.length + BALANCE_QUERIES.length + 1, 30);
  for (const [query, expectedIntent] of DETERMINISTIC_CASES) {
    assert.equal(assessSearchQuery(query).kind, "answerable", query);
    assert.equal(forestEvidenceIntent(query)?.kind, expectedIntent, query);
  }
  for (const query of BALANCE_QUERIES) {
    assert.equal(assessSearchQuery(query).kind, "answerable", query);
    assert.equal(isForestHarvestBalanceQuery(query), true, query);
  }
  const municipal = assessSearchQuery(MUNICIPAL_QUERY);
  assert.equal(municipal.kind, "needs-clarification");
  assert.equal(municipal.reason, "missing-municipality");
});

test("the 26 source-directory forestry routes render explanatory, visibly cited answers", async () => {
  const directory = officialServiceCatalogueDocuments();
  for (const [query, expectedIntent, expectedAnswer] of DETERMINISTIC_CASES) {
    const visible = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
      now: NOW,
    }).slice(0, 12);
    const plan = selectAnswerEvidence(query, visible);
    assert.equal(plan?.kind, expectedIntent, query);
    assert.equal(plan?.strong, true, query);

    const draft = await createPortalDraft(query, {
      deadlineAt: Date.now(),
      searchResults: { total: visible.length, items: visible },
    });
    assert.equal(draft.evidence.answerable, true, query);
    assert.match(answerText(draft), expectedAnswer, query);
    const wordCount = answerText(draft).trim().split(/\s+/u).length;
    assert.ok(wordCount >= 60, `${query}: answer has only ${wordCount} words`);
    assert.ok(wordCount <= 220, `${query}: answer has ${wordCount} words`);

    const citations = usedCitations(draft);
    const sourcesByCitation = new Map(draft.sources.map((source) => [source.citation, source]));
    const minimumCitationCount = ["increment-method", "clearcut-over-time"].includes(expectedIntent) ? 1 : 2;
    assert.ok(citations.size >= minimumCitationCount, `${query}: answer should use enough directly relevant official sources`);
    assert.ok([...citations].every((citation) => sourcesByCitation.get(citation)?.sourceTier === "official"), query);
    assert.ok(draft.answer.parts.every((part) => /[.!?]$/u.test(part.text.trim())), `${query}: truncated answer part`);
  }
});

test("88 varied forestry keyword formulations preserve the intended route and strong visible evidence", () => {
  const directory = officialServiceCatalogueDocuments();
  const entries = Object.entries(FORESTRY_VARIANT_GROUPS);
  assert.equal(entries.reduce((total, [, queries]) => total + queries.length, 0), 88);

  for (const [expectedIntent, queries] of entries) {
    for (const query of queries) {
      assert.equal(assessSearchQuery(query).kind, "answerable", query);
      assert.equal(forestEvidenceIntent(query)?.kind, expectedIntent, query);
      const visible = rankPublicSearchCandidates(query, directory, {
        intentDocuments: directory,
        now: NOW,
      }).slice(0, 12);
      const plan = selectAnswerEvidence(query, visible);
      assert.equal(plan?.kind, expectedIntent, query);
      assert.equal(plan?.strong, true, query);
      assert.deepEqual(plan?.missingEvidenceGroups || [], [], query);
      assert.ok(visible.slice(0, 3).some((source) => source.id === plan?.directDocumentId), `${query}: direct source is not near the top`);
      assert.ok(visible.every((source) => source.sourceTier === "official"), `${query}: non-official source entered the controlled matrix`);
    }
  }
});

test("balance paraphrases, missing municipalities and negative collisions keep distinct behavior", () => {
  for (const query of FORESTRY_BALANCE_VARIANTS) {
    assert.equal(assessSearchQuery(query).kind, "answerable", query);
    assert.equal(isForestHarvestBalanceQuery(query), true, query);
  }
  for (const query of MUNICIPALITY_CLARIFICATION_VARIANTS) {
    assert.equal(forestEvidenceIntent(query)?.kind, "municipality-forest-area", query);
    const assessment = assessSearchQuery(query);
    assert.equal(assessment.kind, "needs-clarification", query);
    assert.equal(assessment.reason, "missing-municipality", query);
  }
  for (const query of FORESTRY_NEGATIVE_COLLISIONS) {
    assert.equal(forestEvidenceIntent(query), null, query);
    assert.equal(isForestHarvestBalanceQuery(query), false, query);
  }
});

test("the three harvest/increment formulations use the structured comparison and its caveats", async () => {
  const payload = {
    id: ["freq", "stk_flow", "indic_fo", "unit", "geo", "time"],
    size: [1, 2, 1, 1, 1, 5],
    dimension: {
      freq: { category: { index: { A: 0 } } },
      stk_flow: { category: { index: { NAI: 0, RMOV: 1 } } },
      indic_fo: { category: { index: { FOR: 0 } } },
      unit: { category: { index: { THS_M3: 0 } } },
      geo: { category: { index: { EE: 0 } } },
      time: { category: { index: { 2020: 0, 2021: 1, 2022: 2, 2023: 3, 2024: 4 } } },
    },
    value: { 0: 14370.94, 2: 9100, 3: 9100, 5: 12179, 7: 12013, 8: 11564 },
  };

  for (const query of BALANCE_QUERIES) {
    const documents = forestHarvestBalanceDocumentsFromJson(query, payload);
    const draft = await createPortalDraft(query, {
      deadlineAt: Date.now(),
      searchResults: { total: documents.length, items: documents },
    });
    const text = answerText(draft);
    assert.equal(draft.evidence.kind, "structured-forest-balance", query);
    assert.match(text, /2023[\s\S]{0,180}11,6 miljonit m³[\s\S]{0,100}9,1 miljonit m³/iu, query);
    assert.match(text, /ei ole üks-ühele sama mis ühe aasta SMI raiemaht/iu, query);
    assert.match(text, /20 aasta vaates madalam/iu, query);
    assert.ok(usedCitations(draft).size >= 3, query);
  }
});

test("the municipality question asks for the missing municipality and metric instead of inventing a number", () => {
  const assessment = assessSearchQuery(MUNICIPAL_QUERY);
  const response = composeScopeResponse(MUNICIPAL_QUERY, assessment);
  assert.equal(response.evidence.kind, "needs-clarification");
  assert.match(response.answer.intro, /nimeta vald/iu);
  assert.match(response.answer.intro, /metsamaa pindala, metsasuse protsenti või Metsaregistris kehtivate eraldiste pindala/iu);
  assert.equal(response.answer.introCitations.length, 0);
});

const V2_PUBLIC_INTENTS = Object.freeze({
  "FAQ-01": "forest-area",
  "FAQ-03": "why-forest-numbers-differ",
  "FAQ-04": "forest-data-sources",
  "FAQ-05": "increment-method",
  "FAQ-06": "stock-versus-harvestable",
  "FAQ-07": "property-forest-data",
  "FAQ-08": "protected-forest-share",
  "FAQ-09": "rmk-versus-smi",
  "FAQ-10": "climate-impact",
  "FAQ-11": "forest-notice",
  "FAQ-12": "forest-depletion",
  "FAQ-13": "harvest-over-time",
  "FAQ-14": "forest-age-trend",
  "FAQ-15": "clearcut-over-time",
  "FAQ-16": "pine-versus-spruce",
  "FAQ-17": "logging-in-protected-areas",
  "MIS-01": "forest-data-sources",
  "MIS-03": "stock-versus-harvestable",
  "MIS-04": "rmk-versus-smi",
  "MIS-05": "forest-area",
  "MIS-06": "sample-size-and-precision",
  "MIS-07": "forest-depletion",
  "MIS-08": "forest-harvest-balance",
  "MIS-09": "clearcut-value-judgement",
  "MIS-10": "old-forest-protection",
  "MIS-11": "forest-data-sources",
  "MIS-12": "forest-stock-uncertainty",
});

test("all 30 locked v2 FAQ and misconception formulations reach current strong public evidence", async () => {
  const evaluation = JSON.parse(await readFile(new URL("../evaluation/forestry_queries_v2.json", import.meta.url), "utf8"));
  const answerableRows = evaluation.queries.filter((row) => row.kind === "answerable");
  const directory = officialServiceCatalogueDocuments();
  assert.equal(answerableRows.length, 30);

  for (const row of answerableRows) {
    const tag = row.tags[0];
    const assessment = assessSearchQuery(row.query);
    if (tag === "FAQ-18") {
      assert.equal(forestEvidenceIntent(row.query)?.kind, "municipality-forest-area", row.query);
      assert.equal(assessment.kind, "needs-clarification", row.query);
      assert.equal(assessment.reason, "missing-municipality", row.query);
      assert.match(assessment.clarification, /Võru linn või Võru vald/iu);
      continue;
    }
    assert.equal(assessment.kind, "answerable", row.query);
    if (["FAQ-02", "MIS-02"].includes(tag)) {
      assert.equal(isForestHarvestBalanceQuery(row.query), true, row.query);
      continue;
    }

    const expectedIntent = V2_PUBLIC_INTENTS[tag];
    assert.ok(expectedIntent, `${tag}: missing expected current route`);
    assert.equal(forestEvidenceIntent(row.query)?.kind, expectedIntent, row.query);
    const visible = rankPublicSearchCandidates(row.query, directory, {
      intentDocuments: directory,
      now: NOW,
    }).slice(0, 12);
    const plan = selectAnswerEvidence(row.query, visible);
    assert.equal(plan?.kind, expectedIntent, row.query);
    assert.equal(plan?.strong, true, row.query);
    assert.deepEqual(plan?.missingEvidenceGroups || [], [], row.query);

    const draft = await createPortalDraft(row.query, {
      deadlineAt: Date.now(),
      searchResults: { total: visible.length, items: visible },
    });
    assert.equal(draft.evidence.answerable, true, row.query);
    const citations = usedCitations(draft);
    const sourcesByCitation = new Map(draft.sources.map((source) => [source.citation, source]));
    assert.ok(citations.size >= 1, `${row.query}: no visible citation`);
    assert.ok([...citations].every((citation) => sourcesByCitation.get(citation)?.sourceTier === "official"), row.query);
  }
});

test("the increment answer exposes the exact method, source summary and locator without unrelated forestry facts", async () => {
  const query = "Kuidas arvutatakse juurdekasvu?";
  const directory = officialServiceCatalogueDocuments();
  const visible = rankPublicSearchCandidates(query, directory, {
    intentDocuments: directory,
    now: NOW,
  }).slice(0, 12);
  const plan = selectAnswerEvidence(query, visible);
  assert.equal(visible[0]?.id, "increment-method");
  assert.equal(plan?.directDocumentId, "increment-method");
  assert.equal(plan?.strong, true);

  const draft = await createPortalDraft(query, {
    deadlineAt: Date.now(),
    searchResults: { total: visible.length, items: visible },
  });
  const text = answerText(draft);
  assert.match(text, /Kogujuurdekasv[\s\S]*Netojuurdekasv/iu);
  assert.match(text, /mudelipõhise meetodi[\s\S]*mitmese imputeerimise/iu);
  assert.match(text, /mudelpuude andmetest[\s\S]*alalistele proovitükkidele[\s\S]*ajutistele proovitükkidele/iu);
  assert.doesNotMatch(text, /51,8%|majandusmetsas sõltub/iu);

  const cited = draft.sources.find((source) => source.citation === draft.answer.introCitations[0]);
  assert.equal(cited?.id, "increment-method");
  assert.match(cited?.summary || "", /kahte hindamisviisi[\s\S]*mudelipõhist[\s\S]*imputeerimist/iu);
  assert.match(cited?.locator || "", /lõpparuande lk 22/iu);
  assert.equal(cited?.url, "https://keskkonnaportaal.ee/et/statistilise-metsainventuuri-smi-ja-maakasutuse-maakasutuse-muutuse-ja-metsanduse-lulucf-andmehoive");
  assert.match(visible[0]?.locator || "", /lk 22/iu);
});

test("a route-only corpus copy cannot suppress the reviewed increment evidence at the same URL", async () => {
  const query = "Kuidas arvutatakse juurdekasvu?";
  const directory = officialServiceCatalogueDocuments();
  const increment = directory.find((source) => source.id === "increment-method");
  const corpusNavigationCopy = {
    id: "corpus-increment-navigation-copy",
    title: increment.title,
    url: increment.url,
    sourceTier: "official",
    summary: "CORPUS_NAVIGATION_SENTINEL",
    content: "CORPUS_NAVIGATION_SENTINEL",
    topics: ["CORPUS_NAVIGATION_SENTINEL"],
    retrieval: "catalogue-directory",
    delivery: "catalog-and-bounded-hydration",
    evidencePolicy: "route-only",
    _answerEvidenceEligible: false,
  };
  const visible = rankPublicSearchCandidates(query, [corpusNavigationCopy, ...directory], {
    intentDocuments: directory,
    now: NOW,
  }).slice(0, 12);
  const retained = visible.find((source) => source.id === "increment-method");
  assert.equal(retained?.evidencePolicy, "versioned");
  assert.equal(retained?._answerEvidenceEligible, true);
  assert.doesNotMatch(`${retained?.summary} ${retained?.content} ${(retained?.topics || []).join(" ")}`, /CORPUS_NAVIGATION_SENTINEL/u);

  const plan = selectAnswerEvidence(query, visible);
  assert.equal(plan?.strong, true);
  assert.equal(plan?.directDocumentId, "increment-method");
  const draft = await createPortalDraft(query, {
    deadlineAt: Date.now(),
    searchResults: { total: visible.length, items: visible },
  });
  assert.equal(draft.evidence.answerable, true);
  assert.equal(draft.sources.find((source) => source.citation === draft.answer.introCitations[0])?.id, "increment-method");
});
