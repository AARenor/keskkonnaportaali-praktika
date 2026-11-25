// One reviewed list of equivalent surface forms for the answer gate.
// The question side keeps its own routing vocabulary. This module exists so
// answer coverage does not silently disagree with the reviewed question forms.
import { REVIEWED_RAIETEATIS_FORMS } from "./query_intent.mjs";
import { REVIEWED_QUERY_WORD_FORMS } from "./query-word-forms.mjs";

// Each entry adds a second word a source may legitimately use for the same
// asked subject. Keep the list short and reviewed. A compound such as
// metsamaa is not a generic synonym for every forest question, but it is a
// correct answer wording for a national forest area question.
export const REVIEWED_ANSWER_EQUIVALENT_ROOTS = Object.freeze({
  mets: Object.freeze(["metsamaa"]),
  metsateatis: Object.freeze(["raieteatis"]),
});

const REVIEWED_EXTRA_FORMS = Object.freeze({
  metsateatis: Object.freeze(REVIEWED_RAIETEATIS_FORMS),
});

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("et")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9äöõüšž]+/gi, " ")
    .trim();
}

const strictFormsByRoot = new Map();
const formsByRoot = new Map();

for (const [root, forms] of Object.entries(REVIEWED_QUERY_WORD_FORMS)) {
  const key = normalize(root);
  const strict = new Set(forms.map(normalize));
  strictFormsByRoot.set(key, strict);
  formsByRoot.set(key, new Set(strict));
}

for (const [root, extraForms] of Object.entries(REVIEWED_EXTRA_FORMS)) {
  const key = normalize(root);
  const strict = strictFormsByRoot.get(key) ?? new Set([key]);
  for (const form of extraForms) strict.add(normalize(form));
  strictFormsByRoot.set(key, strict);
  formsByRoot.set(key, new Set(strict));
}

for (const [root, equivalents] of Object.entries(REVIEWED_ANSWER_EQUIVALENT_ROOTS)) {
  const key = normalize(root);
  const forms = formsByRoot.get(key) ?? new Set([key]);
  for (const equivalent of equivalents) {
    forms.add(normalize(equivalent));
    for (const form of [...(formsByRoot.get(normalize(equivalent)) ?? []), ...(strictFormsByRoot.get(normalize(equivalent)) ?? [])]) {
      forms.add(form);
    }
  }
  formsByRoot.set(key, forms);
}

export function hasReviewedAnswerForms(root) {
  return strictFormsByRoot.has(normalize(root));
}

export function reviewedAnswerForms(root) {
  return new Set(formsByRoot.get(normalize(root)) ?? []);
}

export function matchesReviewedAnswerForm(token, root) {
  return (formsByRoot.get(normalize(root)) ?? new Set()).has(normalize(token));
}

export function matchesStrictReviewedAnswerForm(token, root) {
  return (strictFormsByRoot.get(normalize(root)) ?? new Set()).has(normalize(token));
}
