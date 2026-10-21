import { readFileSync } from "node:fs";

// Reviewed Estonian forestry terms from the Keskkonnaagentuur yearbook
// "Mets". The yearbook is bilingual, so its English headings give the
// approved Estonian equivalent for English source wording.
const glossaryPayload = JSON.parse(readFileSync(new URL("./knowledge/forestry/glossary.json", import.meta.url), "utf8"));

const MAX_DIRECTIVE_TERMS = 12;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function phrasePattern(phrase) {
  const body = phrase.trim().split(/\s+/u).map(escapeRegExp).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "iu");
}

// An avoided form is a word-start stem, so every Estonian case ending of the
// avoided noun (-mine, -mise, -mist, ...) is covered.
function stemPattern(stem) {
  const body = stem.trim().split(/\s+/u).map(escapeRegExp).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}\\p{L}*`, "giu");
}

export const FORESTRY_GLOSSARY = Object.freeze(glossaryPayload.terms.map((term) => Object.freeze({
  et: term.et,
  en: Object.freeze([...term.en]),
  avoid: Object.freeze([...(term.avoid || [])]),
  source: term.source,
  enPatterns: term.en.map(phrasePattern),
  avoidPatterns: (term.avoid || []).map(stemPattern),
})));

export const FORESTRY_GLOSSARY_SOURCE = Object.freeze({ ...glossaryPayload.source });

// Longer phrases first, so "net annual increment" wins over "annual increment"
// when both would fit into the directive budget.
export function glossaryTermsInText(text) {
  const value = String(text || "");
  if (!value) return [];
  return FORESTRY_GLOSSARY
    .map((term) => ({ term, matched: term.en.filter((_, index) => term.enPatterns[index].test(value)) }))
    .filter((item) => item.matched.length)
    .sort((a, b) => Math.max(...b.matched.map((phrase) => phrase.length)) - Math.max(...a.matched.map((phrase) => phrase.length)))
    .map((item) => ({ ...item.term, matched: item.matched }));
}

function evidenceText(evidence) {
  return (Array.isArray(evidence) ? evidence : [])
    .map((entry) => `${entry?.title || ""}\n${entry?.content || ""}`)
    .join("\n");
}

export function glossaryDirective(evidence) {
  const terms = glossaryTermsInText(evidenceText(evidence)).slice(0, MAX_DIRECTIVE_TERMS);
  if (!terms.length) return "";
  const pairs = terms.map((term) => `${term.matched[0]} → ${term.et}`).join("; ");
  const avoided = terms.flatMap((term) => term.avoid);
  return `Ingliskeelse evidence'i metsandusmõisted tõlgi aastaraamatu "Mets" sõnastiku järgi: ${pairs}.${avoided.length ? ` Ära kasuta vorme: ${[...new Set(avoided)].join(", ")}.` : ""}`;
}

// Avoided forms are allowed only when the cited source itself uses them;
// otherwise they are the model's own mistranslation.
export function glossaryAvoidHits(text, evidence = []) {
  const value = String(text || "");
  const sourceText = evidenceText(evidence);
  const hits = [];
  for (const term of FORESTRY_GLOSSARY) {
    term.avoidPatterns.forEach((pattern, index) => {
      const found = value.match(pattern);
      if (!found) return;
      const fresh = new RegExp(pattern.source, "iu");
      if (fresh.test(sourceText)) return;
      hits.push({ avoid: term.avoid[index], et: term.et, found: [...new Set(found)] });
    });
  }
  return hits;
}
