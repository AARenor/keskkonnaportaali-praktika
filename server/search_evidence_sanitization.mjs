import { containsUnsafeInstruction } from "./search_query_safety.mjs";
import { splitTextPassages } from "./search_evidence.mjs";

const EVIDENCE_DIRECTIVE_PATTERN = /(?:süsteemi(?:juhis|prompt)|exfiltrat|javascript\s*:|<\s*script\b|onerror\s*=|data\s*:\s*text\/html)/iu;

export function sanitizeLlmEvidenceText(value) {
  const text = String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/gu, " ")
    .replace(/\bm\s*3\b/giu, "m³")
    .replace(/[\t\r\n\u2028\u2029]+/gu, "\n")
    .replace(/[^\S\n]+/gu, " ")
    .replace(/ *\n+ */gu, "\n")
    .trim();
  if (!text) return "";
  const passages = splitTextPassages(text);
  const rejected = new Set(passages.flatMap((passage, index) => (
    containsUnsafeInstruction(passage) || EVIDENCE_DIRECTIVE_PATTERN.test(passage) ? [index] : []
  )));
  for (let start = 0; start < passages.length; start += 1) {
    for (let size = 2; size <= 4 && start + size <= passages.length; size += 1) {
      const indexes = Array.from({ length: size }, (_, offset) => start + offset);
      if (indexes.some((index) => rejected.has(index))) continue;
      const collapsed = indexes.map((index) => passages[index]).join(" ");
      if (!containsUnsafeInstruction(collapsed) && !EVIDENCE_DIRECTIVE_PATTERN.test(collapsed)) continue;
      indexes.forEach((index) => rejected.add(index));
    }
  }
  return passages.filter((_passage, index) => !rejected.has(index)).join("\n").trim();
}
