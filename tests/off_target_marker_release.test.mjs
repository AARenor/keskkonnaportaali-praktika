import assert from "node:assert/strict";
import test from "node:test";
import { releaseAcceptedOffTargetIntro, searchEnvironmentLive } from "../server/pipeline.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval_ranking.mjs";
import { officialServiceCatalogueDocuments } from "../server/search_catalogue.mjs";
import { withoutOffTargetFallback } from "../server/search_answer_evidence.mjs";

function draft(intro) {
  return {
    answer: {
      eyebrow: "Allikapõhine kokkuvõte",
      intro,
      introCitations: [1],
      parts: [],
    },
    evidence: { offTargetIntro: intro, answerable: true },
    sources: [{ id: "forest-law" }],
  };
}

test("an accepted card releases its stale off target marker", () => {
  const accepted = draft("Mets on ökosüsteem, mis koosneb metsamaast, taimestikust ja loomastikust.");
  releaseAcceptedOffTargetIntro(accepted, "Mis on mets?");
  assert.equal(accepted.evidence.offTargetIntro, undefined);
  assert.equal(withoutOffTargetFallback(structuredClone(accepted)).answer.eyebrow, "Allikapõhine kokkuvõte");
});

test("a card that still misses the question keeps its off target marker", () => {
  const offTarget = draft("Järv on veekogu, mis on ümbritsetud maaga ja sisaldab magedat vett.");
  releaseAcceptedOffTargetIntro(offTarget, "Mis on mets?");
  assert.match(String(offTarget.evidence.offTargetIntro), /^Järv on/);
  assert.equal(withoutOffTargetFallback(structuredClone(offTarget)).answer.eyebrow, "Vastust ei leitud");
});

test("public response never exposes fanout metadata", async () => {
  const query = "Kui kaua metsateatist menetletakse?";
  const fanout = { subqueryCount: 3, mergedCandidates: 7 };
  const directory = officialServiceCatalogueDocuments();
  const items = rankPublicSearchCandidates(query, directory, {
    intentDocuments: directory,
    now: Date.parse("2026-11-25T12:00:00Z"),
  }).slice(0, 12);

  const result = await searchEnvironmentLive(query, {
    searchResults: {
      total: items.length,
      items,
      evidenceCandidates: items,
      fanout,
    },
    useCache: false,
    deadlineAt: Date.now() + 15_000,
    recordSearch: async () => {},
    generateAnswer: async () => ({
      answer: null,
      acceptedClaims: [],
      attempt: { provider: "test", status: "unavailable", reason: "local-rejected" },
    }),
  });

  for (const key of ["fanout", "subqueryCount", "mergedCandidates", "missingSubquestions"]) {
    assert.equal(Object.hasOwn(result, key), false, key);
  }
  assert.equal(JSON.stringify(result).includes("\"fanout\""), false);
  assert.equal(Object.getOwnPropertySymbols(result).some((symbol) => /fanout|subquestion/iu.test(String(symbol.description))), false);
});
