const ANSWER_FORMATS = new Set([
  "definition",
  "criteria",
  "conditions",
  "procedure",
  "quantitative",
  "general",
]);

function validPart(part) {
  return part && typeof part === "object"
    && typeof part.text === "string"
    && part.text.trim();
}

export function answerPartsPresentation(answer = {}) {
  const format = ANSWER_FORMATS.has(answer?.format) ? answer.format : "general";
  const parts = Array.isArray(answer?.parts) ? answer.parts.filter(validPart) : [];
  const steps = format === "procedure"
    ? parts
      .map((part, index) => ({ part, index }))
      .filter(({ part }) => part.role === "step" && Number.isInteger(part.step) && part.step > 0)
      .sort((left, right) => left.part.step - right.part.step || left.index - right.index)
      .map(({ part }) => part)
    : [];
  const stepParts = new Set(steps);
  return {
    format,
    sections: parts.filter((part) => !stepParts.has(part)),
    steps,
  };
}
