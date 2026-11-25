import assert from "node:assert/strict";
import test from "node:test";

import { officialServiceCatalogueDocuments } from "../server/search_catalogue.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval_ranking.mjs";
import { createPortalDraft, searchEnvironmentLive } from "../server/pipeline.mjs";
import { noticeAnswerWithoutNoticeIntent } from "../server/answer_coverage.mjs";
test("a paraphrased filing sentence is still a notice filing passage", () => {
  const passage = "Metsateatise saab esitada Metsaregistri kaudu.";
  assert.equal(noticeAnswerWithoutNoticeIntent("Kuidas registreerida metsa?", passage), true);
  assert.equal(noticeAnswerWithoutNoticeIntent("Kui kaua metsateatist menetletakse?", passage), false);
});

test("a generated forest notice passage is rejected for an unrelated registration question", async () => {
  const query = "Kuidas registreerida metsa?";
  const catalogue = officialServiceCatalogueDocuments();
  const items = rankPublicSearchCandidates(query, catalogue, {
    intentDocuments: catalogue,
    now: Date.parse("2026-11-25T12:00:00Z"),
  }).slice(0, 12);
  const result = await searchEnvironmentLive(query, {
    searchResults: { total: items.length, items },
    useCache: false,
    deadlineAt: Date.now() + 15_000,
    recordSearch: async () => {},
    generateAnswer: async () => ({
      answer: {
        eyebrow: "AI koondvastus",
        title: query,
        intro: "Metsaregister on Eesti riiklik andmekogu, kuhu kogutakse ja säilitatakse andmeid metsa paiknemise, pindala, tagavara, kasutamise ja seisundi kohta.",
        introCitations: [1],
        parts: [{
          title: "Oluline täpsustus",
          text: "Metsateatis esitatakse kavandatavate raiete kohta, välja arvatud valgustusraie ning metsaregistrisse kandmata oluliste metsakahjustuste kohta.",
          citations: [1],
        }],
        note: "",
      },
      acceptedClaims: [],
      attempt: { provider: "test", status: "ready", reason: "none" },
    }),
  });
  const text = [result.answer?.intro, ...(result.answer?.parts || []).map((part) => part.text)]
    .filter(Boolean)
    .join(" ");
  assert.doesNotMatch(text, /metsateatis\w*/iu);
});

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
