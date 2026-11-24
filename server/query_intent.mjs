import { REVIEWED_QUERY_WORD_FORMS } from "./query-word-forms.mjs";

const MAX_TERMS = 16;
const TERM_FORMS = new Map(
  Object.entries(REVIEWED_QUERY_WORD_FORMS)
    .flatMap(([canonical, forms]) => forms.map((form) => [form, canonical])),
);

for (const form of ["lageraiks"]) TERM_FORMS.set(form, "lageraie");
for (const form of [
  "raieteatis", "raieteatise", "raieteatist", "raieteatisel", "raieteatisele",
  "raieteatisest", "raieteatisega", "raieteatiseta", "raieteatiste", "raieteatistel",
]) {
  TERM_FORMS.set(form, "metsateatis");
}
for (const form of [
  "esitamine", "esitamise", "esitamist", "esitamisel", "esitamiseks", "esitamiste",
  "esitamisega", "esitada", "esita", "esitan", "esitad", "esitab", "esitame", "esitate",
  "esitavad", "esitage", "esitas", "esitasin", "esitasid", "esitatud",
]) {
  TERM_FORMS.set(form, "esitamine");
}

const QUESTION_WORDS = new Set([
  "mis", "mida", "millal", "milline", "millised", "millise", "millist", "milliste",
  "milliseks", "mille", "millest", "millega", "kuidas", "kuhu", "kus", "kes", "kas",
  "kui", "palju", "suur", "suure", "on", "oli", "oleks", "olema", "ja", "ning", "või",
  "see", "seda", "loetakse", "arvatakse", "peetakse", "tähendab", "tähendus", "mõiste",
  "mõistet", "mõisteks", "definitsioon", "määratlus", "palun", "selgita", "kirjelda",
  "eesti", "eestis", "jaoks", "kohta", "puhul", "vaja", "nii", "praegu", "hetkel", "täna", "homme",
]);

const PERMISSION_WORDS = new Set([
  "lubatud", "lubata", "lubatakse", "lubama", "lubada", "lubab", "luban", "lubad", "lubame",
  "lubate", "lubavad", "lubaks", "lubaksin", "lubaksid", "lubaksite", "lubatav", "lubatava",
  "lubatavat", "lubatavaks", "lubatavus", "lubatavuse", "lubatavust", "lubatavuses",
  "lubatavusest", "tohib", "tohin", "tohid", "tohime", "tohite", "tohivad", "tohtida",
  "tohtima", "tohiks", "tohiksin", "tohiksid", "võib", "võivad", "võin", "võid", "võime",
  "võite", "võiks", "võiksin", "võiksid", "võiksite", "tingimus", "tingimuse", "tingimust",
  "tingimused", "tingimustel", "tingimustega", "tingimusel", "tingimusteta", "eeldus", "eelduse",
  "eeldust", "eeldused", "eeldustel",
]);

const PROCEDURE_WORDS = new Set([
  "vormistamine", "vormistada", "täitmine", "täita", "menetlemine", "menetleda",
  "menetlus", "toiming", "toimingud",
]);

const QUANTITY_WORDS = new Set([
  "mitu", "mitmes", "mitmendal", "arv", "arvu", "arvud", "kogus", "koguse", "kogust",
  "maht", "mahu", "mahtu", "pindala", "pindalaga", "hektar", "hektarit", "hektari",
  "hektaritest", "protsent", "protsenti", "protsendi", "osakaal", "osakaalu",
  "suurus", "suuruse",
]);

const CRITERIA_WORDS = new Set([
  "kriteerium", "kriteeriumi", "kriteeriumid", "kriteeriumide", "tunnus", "tunnuse", "tunnused",
  "tunnuste", "piiritlemine", "määratlemine", "määratlus", "määratluse", "liigitus", "liigituse",
]);

const DEFINITION_WORDS = new Set([
  "definitsioon", "definitsiooni", "mõiste", "mõistet", "mõisteks", "tähendus", "tähenduse",
  "tähendust", "defineeri", "defineerimine", "määratlus", "määratluse",
]);

function normalizeQuery(query) {
  return String(query ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("et")
    .replace(/[’‘`]/gu, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function canonicalTerm(word) {
  return TERM_FORMS.get(word) || word;
}

function topicFor(words) {
  if (words.includes("metsateatis")) return "forest_notice";
  if (words.includes("lageraie")) return "clearcut";
  if (words.includes("mets") || words.includes("metsamaa")) return "forest";
  return "other";
}

function hasDefinitionFrame(query, words) {
  return /\b(?:mis\s+on|mis\s+t[aä]hendab|mida\s+t[aä]hendab|mille\s+t[aä]hendus|mis\s+on\s+seaduse\s+m[oõ]istes)\b/u.test(query)
    || words.some((word) => DEFINITION_WORDS.has(word));
}

function hasCriteriaFrame(query, words) {
  return /\b(?:mida|mis|millist|milliseid|milline|millised|millise|milliste)\s+(?:loetakse|arvatakse|peetakse)\b/u.test(query)
    || words.some((word) => CRITERIA_WORDS.has(word));
}

function hasPermissionFrame(query, words) {
  return words.some((word) => PERMISSION_WORDS.has(word))
    || /\b(?:millistel\s+tingimustel|mis\s+tingimustel|millal\s+tohib|kas\s+tohib)\b/u.test(query);
}

function hasProcedureFrame(words) {
  return words.some((word) => PROCEDURE_WORDS.has(word) || canonicalTerm(word) === "esitamine");
}

const NOTICE_REQUIREMENT_PATTERN = /\b(?:vaja(?:lik\w*|dus\w*)?|ei\s+pea|kohustus\w*|n[oõ]utav\w*|erand\w*)\b/u;
const NOTICE_TIMING_REQUIREMENT_PATTERN = /\b(?:millal|kas)\b[\s\S]{0,80}\b(?:peab|peavad|pean|pead|peame|peate|peaks\w*|tuleb|tulevad|tuleks\w*)\b/u;

export function isNoticeFeeQuestion(query) {
  return /\b(?:(?:menetlus|l[aä]bivaatamis)?tasu\p{L}*|riigil[oõ]iv\p{L}*|euro\p{L}*)\b/u.test(normalizeQuery(query));
}

// A duration question asks for processing time, not the notice's validity.
// The ordinary wording is "Kui kaua vaatab Keskkonnaamet metsateatist läbi?",
// where the verb "vaatab ... läbi" carries the review without the noun
// "läbivaatamine", so that phrasing has to match too.
export function isNoticeReviewDurationQuestion(query) {
  const text = normalizeQuery(query);
  return topicFor((text.match(/[\p{L}\p{N}']+/gu) || []).map(canonicalTerm)) === "forest_notice"
    && /\b(?:kaua|kest\p{L}*|menetlusaeg\p{L}*|menetlust[aä]htaeg\p{L}*)\b/u.test(text)
    && /\b(?:menetl\p{L}*|l[aä]bivaat\p{L}*|vaat\p{L}*(?:\s+\S+){0,4}\s+(?:l[aä]bi|[uü]le)|[uü]le\s+vaat\p{L}*)\b/u.test(text);
}

function hasNoticeRequirementFrame(query) {
  return NOTICE_REQUIREMENT_PATTERN.test(query)
    || NOTICE_TIMING_REQUIREMENT_PATTERN.test(query)
    || isNoticeFeeQuestion(query);
}

function hasLegalAuthorityFrame(query) {
  return /\bkes\s+kehtest(?:ab|avad)\b/u.test(query);
}

function legalAuthoritySubjectTerms(query) {
  const subject = query.match(/\bkes\s+kehtest(?:ab|avad)\s+(.+)$/u)?.[1] || "";
  return termsFor(subject.match(/[\p{L}\p{N}']+/gu) || []);
}

function hasQuantitativeFrame(query, words) {
  return words.some((word) => QUANTITY_WORDS.has(word))
    || /\b(?:palju\w*|kui\s+suur\w*)\b/u.test(query);
}

function termsFor(words) {
  const terms = [];
  for (const word of words) {
    if (QUESTION_WORDS.has(word) || PERMISSION_WORDS.has(word)) continue;
    const term = canonicalTerm(word);
    if (!terms.includes(term)) terms.push(term);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

const SUPPORTED_SUBJECT_TERMS = {
  clearcut: new Set(["lageraie", "raie", "mets"]),
  forest: new Set(["mets", "metsamaa"]),
};
const CONCEPT_CONTEXT_TERMS = new Set([
  "millistel", "teha", "tegemine", "seadus", "seaduse", "seaduses", "jargi", "järgi",
  "mõistes", "mottes", "kriteerium", "kriteeriumi", "kriteeriumid", "kriteeriumide",
  "fao", "fra", "smi", "statistika", "statistiline", "statistilise", "statistilist", "statistiliselt",
]);

export function supportsIntentConcept(analysis) {
  const subjects = SUPPORTED_SUBJECT_TERMS[analysis?.topic];
  if (!subjects) return true;
  const terms = Array.isArray(analysis.terms) ? analysis.terms : [];
  return terms.some((term) => subjects.has(term))
    && terms.every((term) => subjects.has(term) || CONCEPT_CONTEXT_TERMS.has(term));
}

export function analyzeQueryIntent(query) {
  const normalizedQuery = normalizeQuery(query);
  const words = normalizedQuery.match(/[\p{L}\p{N}']+/gu) || [];
  const topic = topicFor(words.map(canonicalTerm));
  const hasNoticeRequirement = topic === "forest_notice" && hasNoticeRequirementFrame(normalizedQuery);
  const hasProcedure = topic === "forest_notice" && hasProcedureFrame(words);
  const hasQuantity = hasQuantitativeFrame(normalizedQuery, words);
  const hasCriteria = hasCriteriaFrame(normalizedQuery, words);
  const hasPermission = hasPermissionFrame(normalizedQuery, words);
  const hasAuthority = hasLegalAuthorityFrame(normalizedQuery);
  const authoritySubjectTerms = hasAuthority ? legalAuthoritySubjectTerms(normalizedQuery) : [];
  const hasDefinition = hasDefinitionFrame(normalizedQuery, words);

  let intent = "general";
  if (hasNoticeRequirement) intent = "conditions";
  else if (hasProcedure) intent = "procedure";
  else if (hasCriteria) intent = "criteria";
  else if (hasPermission) intent = "conditions";
  else if (hasAuthority) intent = "conditions";
  else if (hasQuantity) intent = "quantitative";
  else if (hasDefinition) intent = "definition";

  return {
    intent,
    topic,
    normalizedQuery,
    terms: termsFor(words),
    authoritySubjectTerms,
  };
}
