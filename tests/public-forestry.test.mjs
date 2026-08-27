import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assessSearchQuery,
  composeScopeResponse,
  containsPrivatePersonLookup,
  forestEvidenceIntent,
  officialServiceCatalogueDocuments,
} from "../server/search.mjs";
import {
  rankPublicSearchCandidates,
  selectAnswerEvidence,
} from "../server/retrieval.mjs";
import {
  createPortalDraft,
  publicResponse,
  searchEnvironmentLive,
} from "../server/pipeline.mjs";
import { buildLlmRequest } from "../server/llm.mjs";
import { searchOfficialSites } from "../server/integrations.mjs";
import {
  forestHarvestBalanceDocumentsFromJson,
  isForestHarvestBalanceQuery,
  loadStructuredIndicatorDocuments,
} from "../server/indicators.mjs";
import {
  FORESTRY_BALANCE_VARIANTS,
  FORESTRY_NEGATIVE_COLLISIONS,
  FORESTRY_VARIANT_GROUPS,
  MUNICIPALITY_CLARIFICATION_VARIANTS,
} from "./fixtures/forestry-query-matrix.mjs";
import {
  REVIEWED_FORESTRY_SEARCH_SUGGESTIONS,
  REVIEWED_SEARCH_SUGGESTIONS,
  suggestionsForValue,
} from "../src/search-suggestions.js";

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
  ["Kui palju lageraiet on viimase 10 aasta jooksul tehtud?", "clearcut-last-ten-years", /2015[.–]+2024[\s\S]*31,6[\s\S]*34,0[\s\S]*319,3[\s\S]*ei kirjelda tingimata kordumatut maa-ala/iu],
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

function claimNumericTokens(value) {
  return [...String(value || "").matchAll(/\b\d+(?:[,.]\d+)?%?/gu)]
    .map((match) => match[0].replace(",", "."));
}

function witnessTextForCitations(draft, citations = []) {
  const wanted = new Set(citations.map(Number));
  return draft.sources
    .filter((source) => wanted.has(Number(source.citation)))
    .map((source) => source.evidenceExcerpt || "")
    .join(" ")
    .replaceAll(",", ".");
}

function assertNumericClaimsHaveVisibleWitnesses(draft, query) {
  const claims = [
    { text: draft.answer.intro, citations: draft.answer.introCitations },
    ...draft.answer.parts.map((part) => ({ text: part.text, citations: part.citations })),
  ];
  for (const claim of claims) {
    const numbers = claimNumericTokens(claim.text);
    if (!numbers.length) continue;
    const witnesses = witnessTextForCitations(draft, claim.citations);
    for (const number of numbers) {
      assert.ok(witnesses.includes(number), `${query}: visible citation witness omits ${number}`);
    }
  }
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

test("every visible reviewed suggestion leads to a deterministic answer or the intended municipality clarification", () => {
  assert.equal(REVIEWED_FORESTRY_SEARCH_SUGGESTIONS.length, 18);
  assert.equal(REVIEWED_SEARCH_SUGGESTIONS.length, 33);
  assert.deepEqual(
    suggestionsForValue("", {}, REVIEWED_SEARCH_SUGGESTIONS, 5).map((item) => item.value),
    REVIEWED_FORESTRY_SEARCH_SUGGESTIONS.slice(0, 5),
  );
  const directory = officialServiceCatalogueDocuments();
  for (const query of REVIEWED_FORESTRY_SEARCH_SUGGESTIONS) {
    const assessment = assessSearchQuery(query);
    if (query === MUNICIPAL_QUERY) {
      assert.equal(assessment.kind, "needs-clarification", query);
      assert.equal(assessment.reason, "missing-municipality", query);
      continue;
    }
    assert.equal(assessment.kind, "answerable", query);
    if (isForestHarvestBalanceQuery(query)) continue;
    const intent = forestEvidenceIntent(query);
    assert.ok(intent, `${query}: missing public intent`);
    const visible = rankPublicSearchCandidates(query, directory, { intentDocuments: directory, now: NOW }).slice(0, 12);
    const plan = selectAnswerEvidence(query, visible);
    assert.equal(plan?.strong, true, `${query}: visible suggestion has insufficient evidence`);
  }
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
    assert.ok(wordCount >= 12, `${query}: answer has only ${wordCount} words`);
    assert.ok(wordCount <= 220, `${query}: answer has ${wordCount} words`);

    const citations = usedCitations(draft);
    const sourcesByCitation = new Map(draft.sources.map((source) => [source.citation, source]));
    assert.ok(citations.size >= 1, `${query}: answer should use directly relevant official evidence`);
    assert.ok([...citations].every((citation) => sourcesByCitation.get(citation)?.sourceTier === "official"), query);
    assert.ok([...citations].every((citation) => sourcesByCitation.get(citation)?.evidenceExcerpt), `${query}: citation has no visible evidence excerpt`);
    assertNumericClaimsHaveVisibleWitnesses(draft, query);
    assert.ok(draft.answer.parts.every((part) => /[.!?]$/u.test(part.text.trim())), `${query}: truncated answer part`);
    const witnesses = [...citations].map((citation) => sourcesByCitation.get(citation)?.evidenceExcerpt || "").join(" ");
    if (expectedIntent === "forest-age-trend") assert.match(witnesses, /nii noorte kui ka vanade/iu, query);
    if (expectedIntent === "logging-in-protected-areas") assert.match(witnesses, /ei tõenda tehtud raietöid/iu, query);
  }
});

test("national forest area and measurement method keep distinct, claim-complete citations", async () => {
  const directory = officialServiceCatalogueDocuments();
  const queries = [
    "Kui palju metsa Eestis on ja kuidas seda mõõdetakse?",
    "Kuidas Eesti metsa mõõdetakse ja kui palju seda on?",
    "How much forest is in Estonia and how is it measured?",
    "How much forest is there in Estonia and how is it measured?",
    "How much forest does Estonia have and how is it measured?",
    "What is the forest area in Estonia and how is it measured?",
  ];
  for (const query of queries) {
    assert.equal(forestEvidenceIntent(query)?.kind, "forest-area-method", query);
    const visible = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
      now: NOW,
    }).slice(0, 12);
    assert.ok(["forest-overview", "forest-stock-stable"].includes(visible[0]?.id), query);
    const plan = selectAnswerEvidence(query, visible);
    assert.equal(plan?.kind, "forest-area-method", query);
    assert.equal(plan?.strong, true, query);
    assert.ok(plan.evidenceRoles?.area, query);
    assert.ok(plan.evidenceRoles?.method, query);
    assert.notEqual(plan.evidenceRoles.area, plan.evidenceRoles.method, query);
    const areaWitness = (plan.passagesByDocument[plan.evidenceRoles.area] || []).join(" ");
    const methodWitness = (plan.passagesByDocument[plan.evidenceRoles.method] || []).join(" ");
    assert.match(areaWitness, /2,36\s+miljonit hektarit[\s\S]*52,1%/u, query);
    assert.doesNotMatch(areaWitness, /466|tagavara|raiemaht|m[³3]|tihumeet/iu, query);
    assert.match(methodWitness, /(?:SMI|statistiline metsainventuur)[\s\S]*proovitükk[\s\S]*valikuuring/iu, query);
    assert.match(methodWitness, /(?:kogu Eesti|üleriigil|üldistat)/iu, query);

    const result = await searchEnvironmentLive(query, {
      deadlineAt: Date.now() + 400,
      searchResults: { total: visible.length, items: visible },
      useCache: false,
    });
    const text = answerText(result);
    assert.match(text, /2,36\s+miljonit hektarit[\s\S]*52,1%/u, query);
    assert.match(text, /(?:SMI|statistiline metsainventuur)[\s\S]*proovitükk[\s\S]*valikuuring/iu, query);
    assert.doesNotMatch(text, /466|tagavara|raiemaht|m[³3]|tihumeet/iu, query);
    const citations = usedCitations(result);
    assert.equal(citations.size, 2, query);
    assert.ok([...citations].every((citation) => (
      result.sources.find((source) => source.citation === citation)?.evidenceExcerpt
    )), query);
    assertNumericClaimsHaveVisibleWitnesses(result, query);
  }
});

test("parcel and source-comparison area questions outrank the national composite route", () => {
  const directory = officialServiceCatalogueDocuments();
  const cases = [
    ["Kuidas mõõdetakse kinnistu metsa pindala ja kui palju seda on?", "property-forest-data"],
    ["Kuidas mõõdetakse metsa kinnistul ja kui palju seda on?", "property-forest-data"],
    ["Kui palju on metsa maaüksusel ning kuidas seda mõõdetakse?", "property-forest-data"],
    ["Milline on metsa pindala SMI ja Metsaregistri järgi ning kuidas see mõõdetakse?", "forest-data-sources"],
    ["Kui palju metsa on Eestis SMI järgi ja kuidas Metsaregister seda mõõdab?", "forest-data-sources"],
  ];
  for (const [query, expectedIntent] of cases) {
    assert.equal(forestEvidenceIntent(query)?.kind, expectedIntent, query);
    const visible = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
      now: NOW,
    }).slice(0, 12);
    const plan = selectAnswerEvidence(query, visible);
    assert.equal(plan?.kind, expectedIntent, query);
    assert.ok(!(plan?.supportingDocumentIds || []).includes("forest-stock-stable"), query);
    assert.notEqual(plan?.directDocumentId, "forest-stock-stable", query);
  }
});

test("lossy Unicode residuals cannot dispatch the national forest answer to a model", async () => {
  const directory = officialServiceCatalogueDocuments();
  for (const suffix of ["山田太郎の住所", "김민수 주소", "عنوان محمد"]) {
    const query = `Kui palju metsa Eestis on ja kuidas seda mõõdetakse? ${suffix}`;
    const visible = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
      now: NOW,
    }).slice(0, 12);
    assert.notEqual(selectAnswerEvidence(query, visible)?.strong, true, query);
    let modelCalls = 0;
    const result = await searchEnvironmentLive(query, {
      deadlineAt: Date.now() + 1_000,
      searchResults: { total: visible.length, items: visible },
      useCache: false,
      generateAnswer: async () => {
        modelCalls += 1;
        return { answer: null, status: "test", provider: "test" };
      },
    });
    assert.equal(modelCalls, 0, query);
    assert.equal(usedCitations(result).size, 0, query);
    assert.doesNotMatch(answerText(result), /2,36\s+miljonit hektarit|52,1%/u, query);
    assert.throws(() => buildLlmRequest({
      selectedModel: "gpt-5.6-luna",
      query,
      evidence: [],
      singleSource: true,
    }), /private-person|provider boundary/iu, query);
    let discoveryCalls = 0;
    const discovery = await searchOfficialSites(query, 5, {
      requestText: async () => {
        discoveryCalls += 1;
        throw new Error("must not dispatch");
      },
    });
    assert.equal(discoveryCalls, 0, query);
    assert.deepEqual(discovery, { documents: [], total: 0, services: [] }, query);
  }
});

test("a missing forest measurement method yields no partial numeric answer and keeps the overview", async () => {
  const query = "Kui palju metsa Eestis on ja kuidas seda mõõdetakse?";
  const directory = officialServiceCatalogueDocuments();
  const visible = rankPublicSearchCandidates(query, directory, {
    intentDocuments: directory,
    now: NOW,
  }).slice(0, 12);
  const methodIds = new Set([
    "smi",
    "forest-smi-2025-presentation",
    "forest-smi-methodology-20-years",
  ]);
  const withoutMethod = visible.filter((document) => !methodIds.has(document.id));
  const plan = selectAnswerEvidence(query, withoutMethod);
  assert.equal(plan?.strong, false);
  assert.equal(plan?.directDocumentId, null);
  assert.deepEqual(plan?.supportingDocumentIds, []);
  assert.equal(plan?.reason, "national-area-method-evidence-required");
  assert.deepEqual(plan?.missingEvidenceRequirements, ["national-smi-measurement-method"]);

  const result = await searchEnvironmentLive(query, {
    deadlineAt: Date.now() + 400,
    searchResults: { total: withoutMethod.length, items: withoutMethod },
    useCache: false,
  });
  assert.equal(usedCitations(result).size, 0);
  assert.doesNotMatch(answerText(result), /2[,.](?:36|350)|51[,.]84|52[,.]1|54[,.]08/u);
  assert.match(result.clarification, /ei kata korraga[\s\S]*mõõtmismeetodit/iu);
  assert.ok(result.sources.some((source) => source.title === "Kui palju ja millist metsa Eestis on?"));
});

test("the 20-year harvest answer excludes clearcut area and damage side facts", async () => {
  const query = "Kas praegu raiutakse rohkem kui 20 aastat tagasi?";
  const directory = officialServiceCatalogueDocuments();
  const visible = rankPublicSearchCandidates(query, directory, {
    intentDocuments: directory,
    now: NOW,
  }).slice(0, 12);
  const draft = await createPortalDraft(query, {
    deadlineAt: Date.now(),
    searchResults: { total: visible.length, items: visible },
  });
  const text = answerText(draft);
  assert.match(text, /2002\. aasta hinnang 10,157[\s\S]*2022\. aasta hinnang 12,077[\s\S]*18,9% suurem/iu);
  assert.doesNotMatch(text, /lagerai|27,1|35,6|kooreürask/iu);
  const cited = usedCitations(draft);
  assert.ok([...cited].every((citation) => draft.sources.find((source) => source.citation === citation)?.evidenceExcerpt));
});

test("the displayed ten-year clearcut question uses exactly the latest ten available annual rows", async () => {
  const query = "Kui palju lageraiet on viimase 10 aasta jooksul tehtud?";
  const directory = officialServiceCatalogueDocuments();
  const visible = rankPublicSearchCandidates(query, directory, { intentDocuments: directory, now: NOW }).slice(0, 12);
  const draft = await createPortalDraft(query, {
    deadlineAt: Date.now(),
    searchResults: { total: visible.length, items: visible },
  });
  const text = answerText(draft);
  assert.equal(draft.evidence.quality.answerIntent, "clearcut-last-ten-years");
  assert.match(text, /2015[.–]+2024/iu);
  assert.equal([...text.matchAll(/\b20(?:1[5-9]|2[0-4])\s+–\s+\d{1,2}[,.]\d\b/gu)].length, 10);
  assert.doesNotMatch(text, /2014\s+–\s+29,7/u);
  assert.match(text, /319,3[\s\S]*ei kirjelda tingimata kordumatut maa-ala/iu);
  assertNumericClaimsHaveVisibleWitnesses(draft, query);
});

test("explicit 2014–2024 clearcut trend keeps the requested period and non-uniform-trend caveat", async () => {
  const query = "Kuidas muutus lageraie pindala 2014–2024?";
  const directory = officialServiceCatalogueDocuments();
  const visible = rankPublicSearchCandidates(query, directory, { intentDocuments: directory, now: NOW }).slice(0, 12);
  const draft = await createPortalDraft(query, {
    deadlineAt: Date.now(),
    searchResults: { total: visible.length, items: visible },
  });
  const text = answerText(draft);
  assert.equal(draft.evidence.quality.answerIntent, "clearcut-over-time");
  assert.match(text, /2014\s+–\s+29,7[\s\S]*2024\s+–\s+34,0/iu);
  assert.match(text, /ei saa kirjeldada ühtlase kasvutrendina/iu);
  assert.doesNotMatch(text, /319,3/u);
  assertNumericClaimsHaveVisibleWitnesses(draft, query);
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
  const directory = officialServiceCatalogueDocuments();
  for (const query of [
    "Kui palju metsa on Tartus?",
    "Mitu hektarit metsa on Tartu linnas?",
    "Kui palju metsa on Võru linnas?",
    "Kui palju metsa on Võru linnavalitsuses?",
    "Kui palju metsa on Võru vallavalitsuses?",
    "Kui palju metsamaad on Pärnu linnas?",
    "Kui suur on Pärnu linnavalitsuse haldusalas metsasus?",
    "Kui suur on metsasus Tartu vallas?",
    "metsasus Võru vald",
    "metsamaa pindala Viljandi vald",
    "How much forest is in Võru city?",
    "How much forest is in the City of Tartu?",
    "Forest area of Viljandi municipality",
    "How much forest does the Võru municipal government manage?",
  ]) {
    assert.equal(forestEvidenceIntent(query)?.kind, "municipality-forest-area", query);
    const assessment = assessSearchQuery(query);
    assert.equal(assessment.kind, "needs-clarification", query);
    const expectedReason = /(?:Viljandi municipality|Võru municipal government)/u.test(query)
      ? "ambiguous-municipality"
      : "municipality-observation-required";
    assert.equal(assessment.reason, expectedReason, query);
    const visible = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
      now: NOW,
    }).slice(0, 12);
    const plan = selectAnswerEvidence(query, visible);
    assert.equal(plan?.kind, "municipality-forest-area", query);
    assert.equal(plan?.strong, false, query);
    assert.equal(plan?.directDocumentId, null, query);
    assert.deepEqual(plan?.supportingDocumentIds, [], query);
    assert.deepEqual(plan?.missingEvidenceRequirements, ["query-bound-locality-year-unit-value"], query);
    assert.equal(visible[0]?.id, "forest-spatial-data", query);
    const response = composeScopeResponse(query, assessment);
    assert.equal(response.evidence.answerable, false, query);
    assert.doesNotMatch(answerText(response), /(?:2[,.]36|52[,.]1)/u, query);
    assert.equal(response.sources.length, 0, query);
  }
  for (const query of FORESTRY_NEGATIVE_COLLISIONS) {
    assert.equal(forestEvidenceIntent(query), null, query);
    assert.equal(isForestHarvestBalanceQuery(query), false, query);
  }
});

test("municipal and regional scopes fail closed without borrowing national forest figures", async () => {
  const directory = officialServiceCatalogueDocuments();
  const cases = [
    ["Tartu metsasus", "ambiguous-municipality"],
    ["Pärnu metsasus", "municipality-observation-required"],
    ["Rakvere metsasus", "ambiguous-municipality"],
    ["Otepää metsasus", "municipality-observation-required"],
    ["Saaremaa metsasus", "municipality-observation-required"],
    ["Võru metsamaa pindala 2024", "ambiguous-municipality"],
    ["Metsasus Tartu", "ambiguous-municipality"],
    ["Sinioru metsasus", "missing-municipality"],
    ["Kivimetsa metsamaa pindala", "missing-municipality"],
    ["How much forest is under the municipal government of Tartu?", "ambiguous-municipality"],
    ["How much forest is managed by Tartu local government?", "ambiguous-municipality"],
    ["What is the forest cover percentage of Saaremaa municipality?", "municipality-observation-required"],
    ["How much forest is in the municipality of Tartu?", "ambiguous-municipality"],
    ["How much forest is in the municipality of Tartu linn?", "municipality-observation-required"],
    ["How much forest is in the municipality of Võru vald?", "municipality-observation-required"],
    ["How much forest is in the municipality of municipality of Tartu?", "ambiguous-municipality"],
    ["How much forest is managed by municipality of Tartu local government?", "ambiguous-municipality"],
    ["How much forest is in the municipality of Saaremaa?", "municipality-observation-required"],
    ["How much forest is in the local government of Sinioru?", "missing-municipality"],
    ["How much forest is in the unknown local government of Sinioru?", "missing-municipality"],
    ["Forest area of the Municipality of Sinioru", "missing-municipality"],
    ["Forest area of Sinioru municipality", "missing-municipality"],
    ["How much forest does Municipality of Sinioru have?", "missing-municipality"],
  ];
  for (const [query, expectedReason] of cases) {
    assert.equal(containsPrivatePersonLookup(query), false, query);
    assert.equal(forestEvidenceIntent(query)?.kind, "municipality-forest-area", query);
    const assessment = assessSearchQuery(query);
    assert.equal(assessment.kind, "needs-clarification", query);
    assert.equal(assessment.reason, expectedReason, query);
    const visible = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
      now: NOW,
    }).slice(0, 12);
    const plan = selectAnswerEvidence(query, visible);
    assert.equal(plan?.kind, "municipality-forest-area", query);
    assert.equal(plan?.strong, false, query);
    assert.equal(plan?.directDocumentId, null, query);
    assert.deepEqual(plan?.supportingDocumentIds, [], query);
    const response = composeScopeResponse(query, assessment);
    assert.equal(response.sources.length, 0, query);
    assert.doesNotMatch(answerText(response), /(?:2[,.]36|2[,.]350|51[,.]84|52[,.]1|54[,.]08)/u, query);
    const publicDraft = await searchEnvironmentLive(query, {
      deadlineAt: Date.now() + 5_000,
      searchResults: { total: visible.length, items: visible },
      useCache: false,
    });
    assert.equal(publicDraft.sources.length, 0, query);
    assert.equal(usedCitations(publicDraft).size, 0, query);
    assert.doesNotMatch(answerText(publicDraft), /(?:2[,.]36|2[,.]350|51[,.]84|52[,.]1|54[,.]08)/u, query);
  }

  const regionalCases = [
    ["Harjumaa metsasus", "regional-observation-required"],
    ["Põlvamaa metsamaa pindala", "regional-observation-required"],
    ["Harju maakonna metsasus", "regional-observation-required"],
    ["Põlva county forest cover", "regional-observation-required"],
    ["Läti metsasus", "unsupported-geography"],
    ["Soome metsasus", "unsupported-geography"],
    ["Euroopa metsasus", "unsupported-geography"],
    ["Latvia forest area", "unsupported-geography"],
    ["Forest area of Finland", "unsupported-geography"],
    ["European forest cover percentage", "unsupported-geography"],
    ["Forest area of Gondor", "unsupported-geography"],
    ["How much forest is there in Gondor?", "unsupported-geography"],
    ["How many hectares of forest are there in Gondor?", "unsupported-geography"],
    ["Forest area in Gondor Estonia", "unsupported-geography"],
    ["How much forest is there in Gondor Estonia?", "unsupported-geography"],
    ["Forest area in the current year for Gondor", "unsupported-geography"],
    ["Forest area for the latest year in Gondor", "unsupported-geography"],
    ["Forest area in hectares for Atlantis", "unsupported-geography"],
    ["Forest area in hectares Gondor", "unsupported-geography"],
    ["Forest area in 2025 in Gondor", "unsupported-geography"],
    ["Forest area for 2025 in Gondor", "unsupported-geography"],
    ["Forest area in 2025 for Atlantis", "unsupported-geography"],
    ["What is the forest area in 2025 in Middle Earth", "unsupported-geography"],
    ["Forest area by 2025 in Gondor", "unsupported-geography"],
    ["What is the woodland coverage in 2025 in Gondor", "unsupported-geography"],
    ["Gondor forest area", "unsupported-geography"],
    ["What is Gondor forest area?", "unsupported-geography"],
    ["What is Gondor's forest area?", "unsupported-geography"],
    ["Latest Gondor forest area", "unsupported-geography"],
    ["How much forest does Gondor have?", "unsupported-geography"],
    ["How many hectares of forest does Gondor have?", "unsupported-geography"],
    ["How many forest hectares are in Gondor?", "unsupported-geography"],
    ["How many hectares are forested in Gondor?", "unsupported-geography"],
    ["Forest area during 2025 in Gondor", "unsupported-geography"],
    ["Forest area from 2020 through 2025 in Gondor", "unsupported-geography"],
    ["Forest area as of 2025 in Gondor", "unsupported-geography"],
    ["Woodland cover according to 2025 data for Atlantis", "unsupported-geography"],
    ["Compare Estonia and Gondor forest area", "unsupported-geography"],
    ["Estonia versus Gondor forest cover", "unsupported-geography"],
    ["Forest area Estonia versus Gondor", "unsupported-geography"],
    ["Forest area in Estonia and Gondor", "unsupported-geography"],
    ["How much forest in Estonia and Gondor?", "unsupported-geography"],
    ["How much forest was there in Gondor in 2025?", "unsupported-geography"],
    ["Estonia's forest area compared with Gondor", "unsupported-geography"],
    ["How much forest does Estonia have compared with Gondor?", "unsupported-geography"],
    ["Estonia forest area compared to Gondor", "unsupported-geography"],
    ["How much forest does Estonia have relative to Gondor?", "unsupported-geography"],
    ["How much forest does Estonia have alongside Gondor?", "unsupported-geography"],
    ["Estonia's forest area against Gondor", "unsupported-geography"],
    ["How does Estonia's forest area differ from Gondor?", "unsupported-geography"],
    ["Kui suur on Gondori metsamaa pindala?", "unsupported-geography"],
    ["Kui palju metsa on Gondoris?", "unsupported-geography"],
    ["Atlantise metsamaa pindala", "unsupported-geography"],
    ["Gondor has how much forest?", "unsupported-geography"],
  ];
  for (const countyName of [
    "Harju", "Hiiu", "Ida-Viru", "Jõgeva", "Järva", "Lääne", "Lääne-Viru", "Põlva",
    "Pärnu", "Rapla", "Saare", "Tartu", "Valga", "Viljandi", "Võru",
  ]) {
    const query = `${countyName} maakonna metsamaa pindala`;
    assert.equal(containsPrivatePersonLookup(query), false, query);
    assert.equal(forestEvidenceIntent(query)?.kind, "regional-forest-area", query);
    assert.equal(assessSearchQuery(query).reason, "regional-observation-required", query);
  }
  for (const [query, expectedReason] of regionalCases) {
    assert.equal(forestEvidenceIntent(query)?.kind, "regional-forest-area", query);
    const assessment = assessSearchQuery(query);
    assert.equal(assessment.kind, "needs-clarification", query);
    assert.equal(assessment.reason, expectedReason, query);
    const visible = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
      now: NOW,
    }).slice(0, 12);
    const plan = selectAnswerEvidence(query, visible);
    assert.equal(plan?.kind, "regional-forest-area", query);
    assert.equal(plan?.strong, false, query);
    assert.equal(plan?.directDocumentId, null, query);
    assert.deepEqual(plan?.supportingDocumentIds, [], query);
    assert.deepEqual(plan?.missingEvidenceRequirements, ["query-bound-geography-year-unit-value"], query);
    const response = composeScopeResponse(query, assessment);
    assert.equal(response.evidence.answerable, false, query);
    assert.equal(response.sources.length, 0, query);
    assert.doesNotMatch(answerText(response), /(?:2[,.]36|2[,.]350|51[,.]84|52[,.]1|54[,.]08)/u, query);
    if (/Gondor|Atlantis|Middle Earth/u.test(query)) {
      const publicDraft = await searchEnvironmentLive(query, {
        deadlineAt: Date.now() + 5_000,
        searchResults: { total: visible.length, items: visible },
        useCache: false,
      });
      assert.equal(publicDraft.sources.length, 0, query);
      assert.equal(usedCitations(publicDraft).size, 0, query);
      assert.doesNotMatch(answerText(publicDraft), /(?:2[,.]36|2[,.]350|51[,.]84|52[,.]1|54[,.]08)/u, query);
    }
  }
  for (const query of [
    "Harju maakonna metsamaa pindala ja Jaan Tamme e-post",
    "Forest area of Finland and Jaan Tamm email",
    "Forest area in million hectares and Jaan Tamm email",
    "How much forest is in Sinioru and where does Jaan Tamm live?",
    "Gondor forest area and what is Jaan Tamm's birth date?",
    "Gondor forest area and Jaan Tamm social security number",
    "Gondor forest area and Jaan Tamm passport number",
    "Gondor forest area and Jaan Tamm personal ID",
    "Gondor forest area and Jaan Tamm cadastral parcel",
    "Forest area in Finland and what is Jaan Tamm's birth date?",
    "Harjumaa metsasus ning Jaan Tamme sünniaeg",
    "Forest area of privately owned forests in Estonia and Jaan Tamm email",
    "Forest area of the Municipality of Sinioru and Jaan Tamm email",
    "How much forest does Municipality of Sinioru have and where does Jaan Tamm live?",
    "Forest area in hectares and Jaan Tamm cadastral ID 12345:678:9012",
    "Forest area in hectares and JAAN TAMM CADASTRAL ID 12345:678:9012",
    "Forest area in Estonia and Jaan Tamm residence",
    "Forest area in Estonia and jaan tamm residence",
    "Forest area in Estonia and JAAN TAMM RESIDENCE",
    "Forest area in Estonia and Jaan Tamm residency",
    "Forest area in Estonia and Jaan Tamm domicile",
    "Forest area in Estonia and Jaan Tamm residency status",
    "Forest area in Estonia and Jaan Tamm resident status",
    "Forest area in Estonia and Jaan Tamm residentsus",
    "Forest area in Estonia and jaan tamm residentsus",
    "Forest area in Estonia and JAAN TAMM RESIDENTSUS",
    "Forest area in Estonia and Jaan-Tamm residentsus",
    "Forest area in Estonia and Jaan/Tamm residentsus",
    "Forest area in Estonia and Jaan_Tamm residentsus",
    "Forest area in Estonia managed by Jaan Tamm",
    "Forest area in Estonia managed by jaan tamm",
    "Forest area in Estonia owned by JAAN TAMM",
    "Forest area in Estonia by ownership of Jaan Tamm",
    "Forest area in Estonia by ownership of jaan tamm",
    "Forest area in Estonia by ownership of JAAN TAMM",
    "Forest area in Estonia by ownership of Jaan-Tamm",
    "Forest area in Estonia by ownership of Jaan/Tamm",
    "Forest area in Estonia by ownership of Jaan_Tamm",
    "Forest area in Estonia by ownership of Anna Maria Tamm",
    "Forest area by ownership of Jaan Tamm in Estonia",
    "Forest area by ownership of Jaan Tamm within Estonia",
    "Forest area by ownership of Jaan Tamm forest holdings",
    "Forest area according to ownership of Jaan Tamm in Estonia",
    "Forest area in Estonia by Jaan Tamm ownership",
    "Forest area in Estonia by Jaan Tamm's ownership",
    "Metsamaa pindala Jaan Tamme omandis Eestis",
    "Metsamaa pindala Jaan Tamme omandi järgi Eestis",
    "Mati Maasika omandivormi järgi olev metsamaa",
    "Mati Maasika ownership forest area",
    "Forest area in Estonia and Mati Maasika ownership",
    "Forest area in Estonia, ownership: Jaan Tamm",
    "Forest area in Estonia, ownership — Jaan Tamm",
    "Forest area in Estonia, ownership = Jaan Tamm",
    "Forest area in Estonia, ownership attributed to Jaan Tamm",
    "Forest area in Estonia by ownership: Jaan Tamm",
    "Forest area in Estonia by ownership—Jaan Tamm",
    "Forest area in Estonia, Jaan Tamm owns the forest",
    "Forest area in Estonia registered to Jaan Tamm",
    "Forest area in Estonia registered to jaan tamm",
    "Forest area in Estonia registered to JAAN TAMM",
    "Forest area in Estonia registered to Jaan-Tamm",
    "Forest area in Estonia registered to Jaan/Tamm",
    "Forest area in Estonia registered to Jaan_Tamm",
    "Forest area in Estonia owned by Anna Maria Tamm",
    "Forest area in Estonia managed by Anna Maria Tamm",
    "Forest area in Estonia registered to Anna Maria Tamm",
    "Forest area in Estonia registered to Mati Maasika",
    "Metsamaa pindala Eestis, omand: Jaan Tamm",
    "Metsamaa pindala Eestis, Jaan Tammile kuuluv mets",
    "Metsamaa pindala Eestis Jaan Tamm hallata",
    "Metsamaa pindala Eestis, omandiõigus Jaan Tammel",
    "Forest area in Estonia titled to Jaan Tamm",
    "Forest area in Estonia held for Jaan Tamm",
    "Forest area in Estonia, Jaan Tamm's forest area",
    "Forest area of Jaan Tamm in Estonia",
    "Jaan Tamm forest area in Estonia",
    "Forest area attributable to Jaan Tamm in Estonia",
    "Forest area in Estonia, title: Jaan Tamm",
    "Forest area in Estonia, beneficiary: Jaan Tamm",
    "Forest area in Estonia, holder: Jaan Tamm",
    "Forest area in Estonia, possessor: Jaan Tamm",
    "Metsamaa pindala Jaan Tamme nimel Eestis",
    "Jaan Tamme metsamaa pindala Eestis",
    "Metsamaa pindala kuulub Jaan Tammele Eestis",
    "Metsamaa pindala Jaan Tamme valduses Eestis",
    "Metsamaa pindala Eestis, kasutaja: Jaan Tamm",
    "Metsamaa pindala Eestis, õigustatud isik: Jaan Tamm",
    "Metsamaa pindala Eestis, valdaja: Jaan Tamm",
    "Eesti metsamaa pindala ja Jaan Tamme elukoht",
    "Eesti metsamaa pindala ja Jaan Tamme kodukoht",
  ]) {
    assert.equal(containsPrivatePersonLookup(query), true, query);
    assert.equal(assessSearchQuery(query).reason, "personal-data-lookup", query);
    assert.equal(selectAnswerEvidence(query, directory), null, query);
    const privateResponse = await searchEnvironmentLive(query, {
      deadlineAt: Date.now() + 5_000,
      searchResults: { total: directory.length, items: directory },
      useCache: false,
    });
    assert.equal(privateResponse.sources.length, 0, query);
    assert.equal(usedCitations(privateResponse).size, 0, query);
  }

  for (const query of [
    "Brown bear residence habitat in Estonia",
    "Where does the brown bear live?",
    "Forest habitat of species in Estonia",
    "Forest area in Estonia and brown bear residence habitat",
    "Forest area in Estonia managed by Tartu linn",
    "Forest area in Estonia managed by Võru vald",
    "Forest area in Estonia by ownership category",
    "Forest area in Estonia by public ownership",
    "Forest area in Estonia by ownership of state forests",
    "Forest area in Estonia by ownership of Tartu linn",
    "Forest area in Estonia by ownership of Statistics Estonia",
    "Forest area in Estonia by ownership of Blue Valley Agency",
    "Forest area in Estonia by ownership of brown bear habitat",
    "Forest area in Estonia, ownership: Statistics Estonia",
    "Forest area in Estonia, ownership — Blue Valley Agency",
    "Forest area in Estonia registered to Tartu linn",
    "Forest area in Estonia, brown bear owns the forest habitat",
    "How does Jaan Tamm manage municipal forest?",
    "How does Forest Whitaker manage public woodland?",
    "Kuidas Jaan Tamm haldab riigi-metsa?",
    "Forest area in Estonia in the name of Statistics Estonia",
    "Forest area in Estonia in the name of Tartu linn",
    "Forest area in Estonia in the name of Municipality of Tartu",
    "Forest area by title holder in Estonia",
    "Forest area by beneficiary category in Estonia",
    "Forest area by possessor category in Estonia",
    "Forest area in Estonia, holder: Environment Board",
    "Forest area in Estonia, beneficiary: Blue Valley Agency",
    "Forest area in Estonia titled to Tartu linn",
    "Lendorava elukoha keskkond Eestis",
    "National forest institution contact",
    "national forest policy agency contact",
    "national forest authority phone",
    "Riikliku metsapoliitika asutuse kontakt",
    "Riiklik metsaameti üldkontakt",
    "Pruunkaru elukoht ja elupaik Eestis",
  ]) {
    assert.equal(containsPrivatePersonLookup(query), false, query);
    assert.notEqual(assessSearchQuery(query).reason, "personal-data-lookup", query);
  }

  const privateSuffix = "How much forest is under the municipal government of Tartu and what is Jaan Tamm’s email?";
  assert.equal(assessSearchQuery(privateSuffix).kind, "out-of-scope");
  assert.equal(assessSearchQuery(privateSuffix).reason, "personal-data-lookup");

  const nationalCases = [
    ["Kui palju metsa on Eestis?", "forest-area"],
    ["How much forest is in Estonia?", "forest-area"],
    ["What is the forest area of Estonia?", "forest-area"],
    ["What percentage of Estonia is forest?", "forest-covered-area"],
    ["Praegune metsasus", "forest-area"],
    ["Uusim metsasus", "forest-area"],
    ["Metsasus protsentides", "forest-covered-area"],
    ["Metsamaa pindala kokku", "forest-area"],
    ["Metsamaa pindala tänapäeval", "forest-area"],
    ["What is the current forest area?", "forest-area"],
    ["Current forest cover percentage", "forest-covered-area"],
    ["Forest area today", "forest-area"],
    ["Forest area in the current year", "forest-area"],
    ["Forest area in the latest year", "forest-area"],
    ["Forest area in the year 2024", "forest-area"],
    ["Kui suur oli Eesti metsamaa pindala 2024. aastal?", "forest-area"],
    ["How many hectares did Estonia report as forest area in 2024?", "forest-area"],
    ["Mitu hektarit oli Eesti metsamaad 2024. aastal?", "forest-area"],
    ["Forest area in this year", "forest-area"],
    ["Forest area in the present year", "forest-area"],
    ["Forest area in the most recent year", "forest-area"],
    ["Forest area in million hectares", "forest-area"],
    ["Forest area in thousands of hectares", "forest-area"],
    ["Forest cover percentage in the present year", "forest-covered-area"],
    ["Forest cover percentage in the most recent year", "forest-covered-area"],
    ["Forest cover percentage in million hectares", "forest-covered-area"],
    ["Forest cover percentage in thousands of hectares", "forest-covered-area"],
    ["How much forest is there in thousands of hectares", "forest-area"],
    ["How many hectares of forest in thousands of hectares", "forest-area"],
    ["Forest area in the current year thanks", "forest-area"],
    ["Forest area in hectares thank you", "forest-area"],
    ["Forest area in the latest year for Estonia thanks", "forest-area"],
    ["Forest area in million hectares if possible", "forest-area"],
    ["Forest area in 2025", "forest-area"],
    ["Forest area by 2025", "forest-area"],
    ["Forest area in 2025 in hectares for Estonia thank you", "forest-area"],
    ["Forest area in Estonia and in 2025", "forest-area"],
    ["What is Estonia's forest area?", "forest-area"],
    ["What is Estonia forest area in thousands of hectares", "forest-area"],
    ["Latest Estonia forest area", "forest-area"],
    ["How many forest hectares are in Estonia?", "forest-area"],
    ["How many hectares are forested in Estonia?", "forest-area"],
    ["How much forest is there in 2025", "forest-area"],
    ["How much forest is there in the current year thanks", "forest-area"],
    ["How many hectares of forest are there in 2025", "forest-area"],
    ["Forest area in Estonia this year", "forest-area"],
    ["Please tell me the national forest area", "forest-area"],
    ["I want to know the forest area", "forest-area"],
    ["Find the latest forest area", "forest-area"],
    ["Give me the forest area estimate", "forest-area"],
    ["Report the current forest area figure", "forest-area"],
    ["Forest area in Estonia today", "forest-area"],
    ["Latest available Estonia forest area estimate", "forest-area"],
    ["How much forest is there in Estonia today?", "forest-area"],
  ];
  for (const [query, expectedIntent] of nationalCases) {
    assert.equal(assessSearchQuery(query).kind, "answerable", query);
    assert.equal(forestEvidenceIntent(query)?.kind, expectedIntent, query);
  }
  for (const [query, expectedReason, expectedRequirement, expectedIntent = "forest-area"] of [
    ["Forest area by ownership category in Estonia", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area according to ownership category in Estonia", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area by private ownership in Estonia", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area with public ownership", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area with management status", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest cover with management status", "requested-breakdown-required", "query-bound-category-year-unit-value", "forest-covered-area"],
    ["Forest area by conservation status", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Woodland area grouped by conservation regime", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest cover according to protection class", "requested-breakdown-required", "query-bound-category-year-unit-value", "forest-covered-area"],
    ["Forest cover according to land use type", "requested-breakdown-required", "query-bound-category-year-unit-value", "forest-covered-area"],
    ["Forest area across ownership types", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area divided by ownership", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest cover disaggregated by protection regime", "requested-breakdown-required", "query-bound-category-year-unit-value", "forest-covered-area"],
    ["Woodland area based on management class", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area for each conservation status", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area of privately owned forests in Estonia", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area excluding protected forests in Estonia", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Metsamaa pindala omandivormi järgi Eestis", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area in Estonia by ownership category", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest cover in Estonia by protection class", "requested-breakdown-required", "query-bound-category-year-unit-value", "forest-covered-area"],
    ["Forest area in Estonia excluding protected forests", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area omandivormi järgi", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area omandivormi järgi in Estonia", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest cover omandivormi järgi", "requested-breakdown-required", "query-bound-category-year-unit-value", "forest-covered-area"],
    ["Forest area ownership järgi", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Woodland area omandivormi järgi", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Metsamaa pindala ownership järgi", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area kaitsekategooria järgi", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest cover majandamisviisi järgi", "requested-breakdown-required", "query-bound-category-year-unit-value", "forest-covered-area"],
    ["Forest area omandivormide lõikes Eestis", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Forest area omanikuliigi kaupa Eestis", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Metsasus protection class by", "requested-breakdown-required", "query-bound-category-year-unit-value"],
    ["Ajalooline metsasus", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area in the period 2020 to 2025", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area from 2020 to 2024", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Historical forest area by year", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area over the years", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area year to year", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area over time", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area through the years", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area during the years", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area for all years", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest cover for all years", "requested-time-series-required", "query-bound-time-series-year-unit-value", "forest-covered-area"],
    ["Forest area between years", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area by period", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area per year", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Woodland area across multiple years", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest cover for each period", "requested-time-series-required", "query-bound-time-series-year-unit-value", "forest-covered-area"],
    ["Forest area per period", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area period by period", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest cover across time periods", "requested-time-series-required", "query-bound-time-series-year-unit-value", "forest-covered-area"],
    ["Woodland area over previous years", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area by decade", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest cover timeline", "requested-time-series-required", "query-bound-time-series-year-unit-value", "forest-covered-area"],
    ["Annual forest area 2018 through 2024", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area 2024 and 2025", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Metsamaa pindala aastate kaupa Eestis", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area in Estonia from 2020 to 2024", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area in Estonia over time", "requested-time-series-required", "query-bound-time-series-year-unit-value"],
    ["Forest area in square kilometres", "requested-unit-conversion-required", "validated-unit-conversion"],
    ["Forest area in acres", "requested-unit-conversion-required", "validated-unit-conversion"],
    ["Forest area in km2", "requested-unit-conversion-required", "validated-unit-conversion"],
    ["Forest cover with public ownership", "requested-breakdown-required", "query-bound-category-year-unit-value", "forest-covered-area"],
    ["Forest cover over time", "requested-time-series-required", "query-bound-time-series-year-unit-value", "forest-covered-area"],
    ["Forest cover in acres", "requested-unit-conversion-required", "validated-unit-conversion", "forest-covered-area"],
    ["Forest area in square miles", "requested-unit-conversion-required", "validated-unit-conversion"],
  ]) {
    assert.equal(forestEvidenceIntent(query)?.kind, expectedIntent, query);
    assert.equal(assessSearchQuery(query).reason, expectedReason, query);
    const visible = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
      now: NOW,
    }).slice(0, 12);
    const plan = selectAnswerEvidence(query, visible);
    assert.equal(plan?.strong, false, query);
    assert.equal(plan?.directDocumentId, null, query);
    assert.deepEqual(plan?.supportingDocumentIds, [], query);
    assert.deepEqual(plan?.navigationDocumentIds, [], query);
    assert.deepEqual(plan?.missingEvidenceRequirements, [expectedRequirement], query);
    const publicDraft = await searchEnvironmentLive(query, {
      deadlineAt: Date.now() + 5_000,
      searchResults: { total: visible.length, items: visible },
      useCache: false,
    });
    assert.equal(publicDraft.sources.length, 0, query);
    assert.equal(usedCitations(publicDraft).size, 0, query);
    assert.doesNotMatch(answerText(publicDraft), /(?:2[,.]36|2[,.]350|51[,.]84|52[,.]1|54[,.]08)/u, query);
  }
  for (const [query, expectedIntent] of [
    ["Forest area in 1999", "forest-area"],
    ["Forest area in 2010", "forest-area"],
    ["Forest area in 2020", "forest-area"],
    ["Forest area in 2030", "forest-area"],
    ["Forest cover in 1999", "forest-covered-area"],
    ["Forest cover in 2030", "forest-covered-area"],
    ["Woodland cover in 1999", "forest-covered-area"],
    ["What was Estonia forest coverage in 2010?", "forest-covered-area"],
    ["Forest coverage in 2025", "forest-covered-area"],
    ["Forest cover as of 2020", "forest-covered-area"],
  ]) {
    assert.equal(containsPrivatePersonLookup(query), false, query);
    assert.equal(forestEvidenceIntent(query)?.kind, expectedIntent, query);
    const visible = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
      now: NOW,
    }).slice(0, 12);
    const plan = selectAnswerEvidence(query, visible);
    assert.equal(plan?.strong, false, query);
    assert.equal(plan?.directDocumentId, null, query);
    assert.deepEqual(plan?.supportingDocumentIds, [], query);
    assert.equal(plan?.reason, "requested-year-evidence-required", query);
    const publicDraft = await searchEnvironmentLive(query, {
      deadlineAt: Date.now() + 5_000,
      searchResults: { total: visible.length, items: visible },
      useCache: false,
    });
    assert.equal(usedCitations(publicDraft).size, 0, query);
    assert.doesNotMatch(answerText(publicDraft), /(?:2[,.]36|2[,.]350|51[,.]84|52[,.]1|54[,.]08)/u, query);
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
    const documents = forestHarvestBalanceDocumentsFromJson(query, payload, { fetchedAt: Date.now() });
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
    assertNumericClaimsHaveVisibleWitnesses(draft, query);
    if (query === "Juurdekasvu ja raiemahu ekslik võrdlemine.") {
      const background = draft.answer.parts.find((part) => part.title === "Lühem taust");
      assert.ok(background);
      const witness = witnessTextForCitations(draft, background.citations);
      assert.match(witness, /ei ole[^.]*üks-ühele[^.]*SMI raiemaht/iu);
    }
  }

  const missingYearQuery = "Kas 2024. aasta inventuuri kasvunäitaja oli 2023. aasta raietest suurem?";
  const missingYearDocuments = forestHarvestBalanceDocumentsFromJson(missingYearQuery, payload, { fetchedAt: Date.now() });
  const missingYearDraft = await createPortalDraft(missingYearQuery, {
    deadlineAt: Date.now(),
    searchResults: { total: missingYearDocuments.length, items: missingYearDocuments },
  });
  assert.match(answerText(missingYearDraft), /ei ole[\s\S]*2024[\s\S]*korraga avaldatud/iu);
  assert.match(witnessTextForCitations(missingYearDraft, missingYearDraft.answer.introCitations), /ei ole[\s\S]*2024[\s\S]*avaldatud/iu);
  const missingYearMethod = missingYearDraft.answer.parts.find((part) => part.title === "Miks ma puuduvat väärtust ei asenda");
  assert.ok(missingYearMethod);
  const methodWitness = witnessTextForCitations(missingYearDraft, missingYearMethod.citations);
  assert.match(methodWitness, /Netojuurdekasv[\s\S]*looduslik(?:ku)? suremus(?:e)?/iu);
  assert.match(methodWitness, /Sama aasta eemaldamise ja netojuurdekasvu võrdlus/iu);
  assertNumericClaimsHaveVisibleWitnesses(missingYearDraft, missingYearQuery);
});

test("an upstream forest-balance outage still reaches the final public answer with claim-complete witnesses", async () => {
  const query = "Kas raiemaht ületab netojuurdekasvu?";
  const documents = await loadStructuredIndicatorDocuments(query, {
    fetchJsonDataset: async () => {
      throw new DOMException("upstream timeout", "AbortError");
    },
  });
  const draft = await createPortalDraft(query, {
    deadlineAt: Date.now(),
    searchResults: { total: documents.length, items: documents },
  });
  const response = publicResponse(draft);
  assert.equal(draft.evidence.kind, "structured-forest-balance");
  assert.match(response.answer.intro, /2023[\s\S]*11,6[\s\S]*9,1[\s\S]*2,5 miljoni m³/iu);
  assert.match(
    response.sources.find((source) => source.citation === 1)?.evidenceExcerpt || "",
    /2023[\s\S]*9,1[\s\S]*11,6[\s\S]*2,5 miljoni m³/iu,
  );
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
  "FAQ-05": "increment-estimate-2024",
  "FAQ-06": "stock-versus-harvestable",
  "FAQ-07": "property-forest-data",
  "FAQ-08": "forest-management-category-share",
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

test("locked numeric FAQs answer the requested quantity instead of a neighboring forestry metric", async () => {
  const cases = [
    {
      query: "Kust tuleb 15,4303 miljoni tm aastane kasvuhinnang?",
      intent: "increment-estimate-2024",
      required: /15,4303[\s\S]*6,6[\s\S]*±1,4%/u,
      forbidden: /28,4%|16,8%/u,
    },
    {
      query: "Mittemajandatava ja piiranguga metsamaa osakaal",
      intent: "forest-management-category-share",
      required: /20,2%[\s\S]*10,4%[\s\S]*69,4%/u,
      forbidden: /28,4%|16,8%/u,
    },
    {
      query: "Kui suur osa metsadest on kaitse all?",
      intent: "protected-forest-share",
      required: /28,4%[\s\S]*16,8%/u,
      forbidden: /20,2%|10,4%/u,
    },
  ];
  const directory = officialServiceCatalogueDocuments();
  for (const item of cases) {
    const visible = rankPublicSearchCandidates(item.query, directory, { intentDocuments: directory, now: NOW }).slice(0, 12);
    const draft = await createPortalDraft(item.query, {
      deadlineAt: Date.now(),
      searchResults: { total: visible.length, items: visible },
    });
    const text = answerText(draft);
    assert.equal(draft.evidence.quality.answerIntent, item.intent, item.query);
    assert.match(text, item.required, item.query);
    assert.doesNotMatch(text, item.forbidden, item.query);
    assertNumericClaimsHaveVisibleWitnesses(draft, item.query);
  }
});

test("clearcut value judgement starts with the conditional impact evidence and avoids legal-category tangents", async () => {
  const query = "Lageraije võib numbrite põhjal nimetada alati keskkonnavastaseks";
  const directory = officialServiceCatalogueDocuments();
  const visible = rankPublicSearchCandidates(query, directory, { intentDocuments: directory, now: NOW }).slice(0, 12);
  const draft = await createPortalDraft(query, {
    deadlineAt: Date.now(),
    searchResults: { total: visible.length, items: visible },
  });
  assert.match(draft.answer.intro, /^Raiemahu mõju sõltub metsa asukohast/iu);
  assert.match(draft.answer.intro, /ei ole mõõdetav üksikfakt/iu);
  assert.doesNotMatch(answerText(draft), /28,4%|16,8%|20,2%|10,4%|kaitse-eeskiri/iu);
});

test("public answer payload emits only cited sources and prefers claim-bound witnesses to generic summaries", async () => {
  const query = "Metsamaa hektarid ja osakaal riigi pindalast";
  const directory = officialServiceCatalogueDocuments();
  const visible = rankPublicSearchCandidates(query, directory, { intentDocuments: directory, now: NOW }).slice(0, 12);
  const draft = await createPortalDraft(query, {
    deadlineAt: Date.now(),
    searchResults: { total: visible.length, items: visible },
  });
  const response = publicResponse(draft);
  assert.deepEqual(new Set(response.sources.map((source) => source.citation)), usedCitations(draft));
  assert.ok(response.sources.every((source) => source.evidenceExcerpt));
  assert.ok(response.sources.every((source) => source.summary === undefined));
  assertNumericClaimsHaveVisibleWitnesses(draft, query);
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
  assert.match(cited?.evidenceExcerpt || "", /Kogujuurdekasv[\s\S]*Netojuurdekasv[\s\S]*mudelipõhise meetodi[\s\S]*mitmese imputeerimise/iu);
  assert.match(cited?.locator || "", /lk 22[\s\S]*peatükk 3/iu);
  assert.equal(cited?.url, "https://keskkonnaportaal.ee/sites/default/files/2026-01/SMI%20arendamine%202025%20L%C3%95PPARUANNE_T%C3%9C%20MSI.pdf#page=22");
  assert.match(visible[0]?.locator || "", /lk 22/iu);

  const visibleResponse = publicResponse(draft);
  assert.equal(visibleResponse.sources[0].content, undefined);
  assert.match(visibleResponse.sources[0].evidenceExcerpt || "", /Kogujuurdekasv/iu);
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
