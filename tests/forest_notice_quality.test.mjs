import assert from "node:assert/strict";
import test from "node:test";

import { officialServiceCatalogueDocuments } from "../server/search_catalogue.mjs";
import { citedEvidenceAnswersQuestion, extractAnswersQuery, withRepeatedAnswerNote } from "../server/answer_coverage.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval_ranking.mjs";
import { createPortalDraft, searchEnvironmentLive } from "../server/pipeline.mjs";

const NOW = Date.parse("2026-11-10T12:00:00Z");

async function search(query) {
  const directory = officialServiceCatalogueDocuments();
  const visible = rankPublicSearchCandidates(query, directory, {
    intentDocuments: directory,
    now: NOW,
  }).slice(0, 12);
  return createPortalDraft(query, {
    deadlineAt: Date.now(),
    searchResults: { total: visible.length, items: visible },
  });
}

function answerText(draft) {
  return [draft.answer.intro, ...draft.answer.parts.map((part) => part.text)].join(" ");
}

for (const query of [
  "Millal tuleb metsateatis esitada?",
  "Millal on metsaomanikul vaja metsateatist esitada?",
]) {
  test(`forest notice requirements address the question: ${query}`, async () => {
    const draft = await search(query);
    const text = answerText(draft);
    assert.match(text, /valgustusraie/iu, "the guidance's thinning exception must be stated");
    assert.match(text, /20\s+tihumeetrit[\s\S]*kinnisasja[\s\S]*aastas/iu, "the annual property allowance must be stated with its unit and scope");
    assert.match(text, /metsakahjust/iu, "significant forest damage must be covered");
    assert.doesNotMatch(draft.answer.intro, /^Teatise esitamine, menetlemine või raiet lubav otsus ei tõenda/iu, "the answer must not lead with an unrelated logging disclaimer");
    const cited = new Set([
      ...draft.answer.introCitations,
      ...draft.answer.parts.flatMap((part) => part.citations),
    ]);
    const evidence = draft.sources.filter((source) => cited.has(source.citation))
      .map((source) => source.evidenceExcerpt || "").join(" ");
    assert.match(evidence, /valgustusraie/iu, "a cited excerpt must support the thinning exception");
    assert.match(evidence, /20\s+tihumeetrit/iu, "a cited excerpt must support the annual allowance");
  });
}

test("raieteatise esitamine returns a cited ordered procedure without parcel permission", async () => {
  const draft = await search("raieteatise esitamine");
  const steps = draft.answer.parts.filter((part) => part.role === "step");
  assert.deepEqual(steps.map((part) => part.step), [1, 2, 3, 4]);
  assert.ok(steps.every((part) => part.citations.length > 0));
  assert.equal(draft.answer.parts.some((part) => part.role === "context"), false);
  assert.match(draft.answer.note, /üldjuhis[\s\S]*ei kinnita konkreetse kinnistu raieluba/iu);
});

test("a property specific filing question retains cited registry lookup guidance", async () => {
  const draft = await search("Kuidas esitada metsateatist oma kinnistule?");
  const propertyContext = draft.answer.parts.find((part) => part.role === "context");
  assert.equal(propertyContext?.title, "Konkreetse kinnistu andmed");
  assert.match(propertyContext?.text || "", /kasutada riiklikku Metsaregistrit ehk Metsaportaali/u);
  assert.ok(propertyContext?.citations.length > 0);
  assert.deepEqual(draft.answer.parts.filter((part) => part.role === "step").map((part) => part.step), [1, 2, 3, 4]);
});

test("forest notice exemptions do not answer an unasked fee question", async () => {
  const draft = await search("Millal ei pea metsateatist esitama?");
  const text = answerText(draft);
  assert.match(text, /valgustusraie/iu);
  assert.match(text, /20\s+tihumeetrit[\s\S]*kinnisasja[\s\S]*aastas/iu);
  assert.doesNotMatch(text, /30\s+eurot/iu);
});
test("notice fee answers do not apply the current amount to a requested past year", async () => {
  const historical = await search("Mis oli metsateatise riigilõiv 2023. aastal?");
  assert.doesNotMatch(answerText(historical), /30\s+eurot|2024/iu);

  const current = await search("Metsateatise riigilõiv?");
  assert.match(answerText(current), /30\s+eurot/iu);
  assert.ok(current.answer.introCitations.length > 0);
});

for (const query of [
  "Millal tuleb metsateatis esitada?",
  "Kas valgustusraie puhul on metsateatist vaja?",
]) {
  test(`a rejected model answer retains the relevant notice guidance: ${query}`, async () => {
    const directory = officialServiceCatalogueDocuments();
    const items = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
    }).slice(0, 12);
    const result = await searchEnvironmentLive(query, {
      searchResults: { total: items.length, items },
      useCache: false,
      deadlineAt: Date.now() + 15_000,
      recordSearch: async () => {},
      generateAnswer: async () => ({
        answer: null,
        acceptedClaims: [],
        attempt: { status: "degraded", reason: "local-rejected" },
      }),
    });
    assert.notEqual(result.answer.eyebrow, "Vastust ei leitud");
    assert.match(answerText(result), /valgustusraie/iu);
    assert.match(result.answer.note, /üldjuhise väljavõte/iu);
    assert.ok(result.answer.introCitations.length > 0);
  });
}

test("notice filing guidance does not answer questions about processing or expiry", () => {
  const filingGuidance = "Metsateatis esitatakse kavandatavate raiete kohta, välja arvatud valgustusraie.";
  assert.equal(extractAnswersQuery("Kui kaua metsateatist menetletakse?", filingGuidance), false);
  assert.equal(extractAnswersQuery("Millal lõpeb metsateatise kehtivus?", filingGuidance), false);
  assert.equal(extractAnswersQuery("Mitu metsateatist esitati?", filingGuidance), false);
});

test("review duration requires a cited processing period, not filing or validity", () => {
  const timing = "Keskkonnaamet vaatab teatise läbi 15 tööpäeva jooksul; kui vaja kooskõlastust või ekspertiisi, võib menetlus kesta kuni 30 tööpäeva.";
  const validity = "Raiet lubav metsateatis kehtib 24 kuud metsaregistris registreerimisest.";
  const filing = "Metsateatis esitatakse Metsaregistri kaudu enne raiet.";
  const answer = { introCitations: [1], parts: [] };
  for (const query of ["Kui kaua metsateatist menetletakse?", "Kui kaua menetlus kestab? Kuidas esitada metsateatist?"]) {
    assert.equal(citedEvidenceAnswersQuestion(query, answer, [{ citation: 1, evidenceExcerpt: timing }]), true, query);
    for (const evidenceExcerpt of [filing, validity]) {
      assert.equal(citedEvidenceAnswersQuestion(query, answer, [{ citation: 1, evidenceExcerpt }]), false, query);
    }
  }
  assert.equal(citedEvidenceAnswersQuestion("Kui kaua kestab metsateatise menetlus 2023. aastal?", answer, [
    { citation: 1, evidenceExcerpt: timing },
  ]), false);
  assert.equal(citedEvidenceAnswersQuestion("Kui kaua kestab metsateatise menetlus ja mis on riigilõiv?", answer, [
    { citation: 1, evidenceExcerpt: timing },
  ]), false);
  for (const qualifier of ["menetlustasu", "läbivaatamistasu", "kestlikkus"]) {
    assert.equal(citedEvidenceAnswersQuestion(`Kui kaua kestab metsateatise menetlus ja mis on ${qualifier}?`, answer, [
      { citation: 1, evidenceExcerpt: timing },
    ]), false, qualifier);
  }
});

test("repeated follow-ups require relevant evidence from one currently cited source", () => {
  const question = "Kas valgustusraie puhul on metsateatist vaja?";
  const answer = { introCitations: [1], parts: [] };
  const guidance = {
    citation: 1,
    evidenceExcerpt: "Metsateatis esitatakse kavandatavate raiete kohta, välja arvatud valgustusraie.",
  };
  assert.equal(citedEvidenceAnswersQuestion(question, answer, [guidance]), true);
  assert.equal(citedEvidenceAnswersQuestion("Kui kaua metsateatist menetletakse?", answer, [guidance]), false);
  assert.equal(citedEvidenceAnswersQuestion("Kas nii?", answer, [guidance]), false);
  assert.equal(citedEvidenceAnswersQuestion(question, { introCitations: [], parts: [] }, [guidance]), false);
  assert.equal(citedEvidenceAnswersQuestion(question, answer, [{ ...guidance, citation: 2 }]), false);
  assert.equal(citedEvidenceAnswersQuestion(question, { introCitations: [1, 2], parts: [] }, [
    { citation: 1, evidenceExcerpt: "Metsateatise saab esitada Metsaregistri kaudu." },
    { citation: 2, evidenceExcerpt: "Valgustusraie tehakse noore metsa hooldamiseks." },
  ]), false);
});

test("a repeated answer keeps its source caveat within the note limit", () => {
  const caveat = "Kontrolli kehtivat seadust.";
  const result = withRepeatedAnswerNote({ note: caveat });
  assert.ok(result.note.startsWith(caveat));
  assert.match(result.note, /kordab/iu);
  assert.equal(withRepeatedAnswerNote(result).note, result.note);
  const longCaveat = "Kontrolli kehtivat seadust. ".repeat(25);
  assert.equal(withRepeatedAnswerNote({ note: longCaveat }).note, longCaveat);
});

test("fanout enabled keeps unrelated questions free of notice text but notice questions answered", async () => {
  const fanout = { subqueryCount: 2, mergedCandidates: 12 };
  const draftWithFanout = async (query) => {
    const directory = officialServiceCatalogueDocuments();
    const items = rankPublicSearchCandidates(query, directory, {
      intentDocuments: directory,
      now: Date.parse("2026-11-25T12:00:00Z"),
    }).slice(0, 12);
    return createPortalDraft(query, {
      deadlineAt: Date.now() + 4_000,
      searchResults: { total: items.length, items, fanout },
    });
  };

  const unrelated = await draftWithFanout("Kuidas registreerida metsa?");
  assert.equal(unrelated.answer.eyebrow, "Vastust ei leitud");
  assert.doesNotMatch(answerText(unrelated), /metsateatis\w*/iu);

  const notice = await draftWithFanout("Kui kaua metsateatist menetletakse?");
  assert.match(answerText(notice), /(?:15|30)\s+tööpäeva/u);
});
