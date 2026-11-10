import assert from "node:assert/strict";
import test from "node:test";

import { officialServiceCatalogueDocuments } from "../server/search.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval.mjs";
import { createPortalDraft } from "../server/pipeline.mjs";

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
