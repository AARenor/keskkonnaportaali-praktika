import assert from "node:assert/strict";
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

const NOW = Date.parse("2026-08-19T12:00:00Z");

const DETERMINISTIC_CASES = [
  ["SMI vs lausmetsakorraldus – tagavara on ülehinnatud.", "smi-method-comparison", /ei tõenda[^.]*üle hinnatud/iu],
  ["Tagavara ei võrdu reaalselt kättesaadava puiduga.", "stock-versus-harvestable", /ei ole aastane raiemaht[^.]*raiutav puidukogus/iu],
  ["RMK andmed vs SMI andmed.", "rmk-versus-smi", /RMK hallatavate[\s\S]*SMI[\s\S]*kogu Eesti/iu],
  ["Metsasuse ja pindala protsendid.", "forest-covered-area", /eri näitajad[\s\S]*51,8%[\s\S]*47,11%/iu],
  ["Suurem valim ei tähenda automaatselt täpsemat tulemust.", "sample-size-and-precision", /Valimi suurus üksi ei määra hinnangu täpsust/iu],
  ["Eesti metsad hävivad kiiresti.", "forest-depletion", /ei viita[^.]*otsa saamas/iu],
  ["Kõik lageraied on keskkonnavastased.", "clearcut-value-judgement", /kõik lageraied[^.]*ei ole mõõdetav üksikfakt/iu],
  ["Vana mets on automaatselt kaitse all.", "old-forest-protection", /ei anna[^.]*automaatset õiguslikku kaitset/iu],
  ["Metsaregistri ja SMI andmed peavad alati kattuma.", "forest-data-sources", /SMI[\s\S]*Metsaregister[\s\S]*kinnistu/iu],
  ["Metsa tagavara on üks kindel vaieldamatu number.", "forest-stock-uncertainty", /mitte üks kindel vaieldamatu number/iu],
  ["Kui suur osa Eestist on kaetud metsaga?", "forest-covered-area", /47,11%/u],
  ["Miks annavad eri allikad erinevaid numbreid?", "why-forest-numbers-differ", /katvus[\s\S]*andmeaasta[\s\S]*definitsioon/iu],
  ["Mis vahe on SMI-l ja metsaregistril?", "forest-data-sources", /SMI[\s\S]*Metsaregister[\s\S]*kinnistu/iu],
  ["Kuidas arvutatakse juurdekasvu?", "increment-method", /mudeliga arvutatud[^.]*15,4303 miljonit tihumeetrit/iu],
  ["Miks ei võrdu tagavara raiutava puidukogusega?", "stock-versus-harvestable", /ei ole aastane raiemaht[^.]*raiutav puidukogus/iu],
  ["Kust leida konkreetse kinnistu metsaandmeid?", "property-forest-data", /Metsaregistrit ehk Metsaportaali/iu],
  ["Kui suur osa metsadest on kaitse all?", "protected-forest-share", /28,4%[\s\S]*16,8%/u],
  ["Miks erinevad RMK ja SMI numbrid?", "rmk-versus-smi", /RMK hallatavate[\s\S]*SMI[\s\S]*kogu Eesti/iu],
  ["Kuidas mõjutab kliimamuutus metsi?", "climate-impact", /põuad[\s\S]*kuuse-kooreüraski/iu],
  ["Mis on metsateatis?", "forest-notice", /kavandatav\w* raiet?[\s\S]*ei tõenda/iu],
  ["Kas Eestis saab mets otsa?", "forest-depletion", /ei viita[^.]*otsa saamas/iu],
  ["Kas praegu raiutakse rohkem kui 20 aastat tagasi?", "harvest-over-time", /vaja sama metoodikaga 20-aastast aegrida/iu],
  ["Kas meie metsad muutuvad nooremaks?", "forest-age-trend", /suurenes nii noorte kui ka vanade metsade pindala/iu],
  ["Kui palju lageraiet on viimase 10 aasta jooksul tehtud?", "clearcut-over-time", /32,6 tuhat hektarit[\s\S]*ei tohi[^.]*kümnega korrutada/iu],
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

    const citations = usedCitations(draft);
    const sourcesByCitation = new Map(draft.sources.map((source) => [source.citation, source]));
    assert.ok(citations.size >= 1, `${query}: answer has no citation`);
    assert.ok([...citations].every((citation) => sourcesByCitation.get(citation)?.sourceTier === "official"), query);
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
