import assert from "node:assert/strict";
import test from "node:test";

import { withoutUnrelatedNoticePassages } from "../server/answer_coverage.mjs";
import { isRepairableRejection, repairDirectiveFor } from "../server/answer_repair.mjs";
import { buildLlmRequest } from "../server/llm_prompt.mjs";

const evidence = [{
  citation: 1,
  title: "Raiemaht",
  url: "https://keskkonnaagentuur.ee/raiemahud",
  content: "Raiemaht oli 12,5 miljonit m³. Metsateatis tuleb esitada Metsaregistris.",
}];

test("an unrelated notice sentence is removed without dropping the grounded answer", () => {
  const draft = {
    answer: {
      intro: "Raiemaht oli 12,5 miljonit m³.",
      introCitations: [1],
      parts: [{
        text: "Raiemaht oli 12,5 miljonit m³. Metsateatis tuleb esitada Metsaregistris.",
        citations: [1],
      }],
    },
  };
  const cleaned = withoutUnrelatedNoticePassages("metsaraie andmed", draft);
  assert.match(cleaned.answer.parts[0].text, /Raiemaht oli/u);
  assert.doesNotMatch(cleaned.answer.parts.map((part) => part.text).join(" "), /Metsateatis/u);
  assert.notEqual(cleaned, draft);
});

test("a notice question keeps its notice filing sentence", () => {
  const draft = {
    answer: {
      intro: "Metsateatis esitatakse kavandatavate raiete kohta.",
      introCitations: [1],
      parts: [{ text: "Metsateatis tuleb esitada Metsaregistris.", citations: [1] }],
    },
  };
  assert.equal(withoutUnrelatedNoticePassages("mis on metsateatis", draft), draft);
});

test("repair directives are fixed, bounded and only for recoverable rejections", () => {
  const intent = repairDirectiveFor("local-rejected", "LLM answer does not answer the requested intent (0/1)");
  assert.match(intent, /subjekti/u);
  assert.ok(intent.length <= 400);
  assert.equal(repairDirectiveFor("local-rejected", "LLM answer exceeds the configured character limit"), "");
  assert.equal(repairDirectiveFor("specific-topic-mismatch", ""), "");
  assert.equal(isRepairableRejection("local-rejected", "LLM introduction has no individually attributable citations"), true);
  assert.equal(isRepairableRejection("evidence-insufficient", ""), false);
});

test("the repair directive reaches the provider prompt without raw model text", () => {
  const directive = repairDirectiveFor("local-rejected", "LLM answer does not answer the requested intent (0/1)");
  const request = buildLlmRequest({
    selectedModel: "gpt-6-luna",
    query: "metsaraie andmed",
    evidence,
    repairDirective: directive,
  });
  const payload = JSON.parse(request.body.input[1].content[0].text);
  assert.equal(payload.repair_directive, directive);
  assert.doesNotMatch(payload.repair_directive, /\(0\/1\)/u);
  const plain = JSON.parse(buildLlmRequest({
    selectedModel: "gpt-6-luna",
    query: "metsaraie andmed",
    evidence,
  }).body.input[1].content[0].text);
  assert.equal(plain.repair_directive, undefined);
});

test("a phrase inside a rejected claim cannot select a repair directive", () => {
  const detail = "LLM answer uses an unreviewed term | claim: does not answer the requested intent";
  assert.equal(repairDirectiveFor("local-rejected", detail), "");
  assert.equal(isRepairableRejection("local-rejected", detail), false);
});

test("the provider instruction names the repair directive field", () => {
  const request = buildLlmRequest({
    selectedModel: "gpt-6-luna",
    query: "metsaraie andmed",
    evidence,
    repairDirective: "Nimeta küsimuse subjekt.",
  });
  assert.match(request.body.input[0].content[0].text, /repair_directive/u);
});

test("unrelated notice wording in the genitive is removed from a mixed answer", () => {
  const draft = {
    answer: {
      intro: "Raiemaht oli 12,5 miljonit m³. Metsateate esitamine toimub Metsaregistri kaudu.",
      introCitations: [1],
      parts: [],
    },
  };
  const cleaned = withoutUnrelatedNoticePassages("Kui palju on raiemaht 2025?", draft);
  assert.match(cleaned.answer.intro, /Raiemaht oli/u);
  assert.doesNotMatch(cleaned.answer.intro, /Metsateate/u);
});

test("a harvest volume question does not inherit notice filing wording", () => {
  const draft = {
    answer: {
      intro: "Raiemaht oli 12,5 miljonit m³. Metsateatis tuleb esitada Metsaregistris.",
      introCitations: [1],
      parts: [],
    },
  };
  const cleaned = withoutUnrelatedNoticePassages("Kui palju on raiemaht 2025?", draft);
  assert.match(cleaned.answer.intro, /Raiemaht oli/u);
  assert.doesNotMatch(cleaned.answer.intro, /Metsateatis/u);
});
