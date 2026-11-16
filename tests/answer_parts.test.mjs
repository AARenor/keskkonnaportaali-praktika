import test from "node:test";
import assert from "node:assert/strict";
import { answerPartsPresentation } from "../src/answer_parts.js";

test("procedure parts sort into cited one based steps without merging claims", () => {
  const presentation = answerPartsPresentation({
    format: "procedure",
    parts: [
      { role: "step", step: 2, title: "Esita teatis", text: "Esita teatis enne raiet.", citations: [3] },
      { role: "step", step: 1, title: "Kontrolli tingimusi", text: "Kontrolli kinnistu piiranguid.", citations: [1, 2] },
      { title: "Õiguslik alus", text: "Teatis ei ole luba.", citations: [4] },
    ],
  });

  assert.equal(presentation.format, "procedure");
  assert.equal(presentation.sections.length, 1);
  assert.equal(presentation.sections[0].title, "Õiguslik alus");
  assert.deepEqual(presentation.steps.map(({ step, citations }) => ({ step, citations })), [
    { step: 1, citations: [1, 2] },
    { step: 2, citations: [3] },
  ]);
});

test("distinct source claims stay in separate answer sections", () => {
  const presentation = answerPartsPresentation({
    format: "general",
    parts: [
      { title: "Õiguslik määratlus", text: "Seadus määratleb metsa nii.", citations: [1, 2] },
      { title: "Statistiline määratlus", text: "Statistika kasutab teist mõõdikut.", citations: [3] },
    ],
  });

  assert.deepEqual(presentation.sections.map(({ title, citations }) => ({ title, citations })), [
    { title: "Õiguslik määratlus", citations: [1, 2] },
    { title: "Statistiline määratlus", citations: [3] },
  ]);
  assert.deepEqual(presentation.steps, []);
});
