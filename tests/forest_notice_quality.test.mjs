import assert from "node:assert/strict";
import test from "node:test";

import { citedEvidenceAnswersQuestion, extractAnswersQuery, officialServiceCatalogueDocuments, withRepeatedAnswerNote } from "../server/search.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval.mjs";
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

test("forest notice exemptions do not answer an unasked fee question", async () => {
  const draft = await search("Millal ei pea metsateatist esitama?");
  const text = answerText(draft);
  assert.match(text, /valgustusraie/iu);
  assert.match(text, /20\s+tihumeetrit[\s\S]*kinnisasja[\s\S]*aastas/iu);
  assert.doesNotMatch(text, /30\s+eurot/iu);
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
