import assert from "node:assert/strict";
import test from "node:test";

import { officialServiceCatalogueDocuments } from "../server/search_catalogue.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval_ranking.mjs";
import { createPortalDraft } from "../server/pipeline.mjs";

test("an unrelated forest registration question does not receive forest notice text", async () => {
  const query = "Kuidas registreerida metsa?";
  const catalogue = officialServiceCatalogueDocuments();
  const items = rankPublicSearchCandidates(query, catalogue, {
    intentDocuments: catalogue,
    now: Date.parse("2026-11-25T12:00:00Z"),
  }).slice(0, 12);
  const draft = await createPortalDraft(query, {
    deadlineAt: Date.now() + 4_000,
    searchResults: { total: items.length, items },
  });
  const text = [draft.answer?.intro, ...(draft.answer?.parts || []).map((part) => part.text)]
    .filter(Boolean)
    .join(" ");

  assert.equal(draft.answer?.eyebrow, "Vastust ei leitud");
  assert.doesNotMatch(text, /metsateatis\w*/iu);
  assert.match(text, /Meil ei ole sellele küsimusele vastust/u);
});
