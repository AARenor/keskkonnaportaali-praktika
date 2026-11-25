import assert from "node:assert/strict";
import test from "node:test";
import { releaseAcceptedOffTargetIntro } from "../server/pipeline.mjs";
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
