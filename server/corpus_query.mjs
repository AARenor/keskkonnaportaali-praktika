import { canonicalizePublicSearchQuery } from "./search_query_canonicalization.mjs";
import { analyzeQueryIntent } from "./query_intent.mjs";
import { specialistSubjectRoot, specialistSubjectVariants } from "./topic-keywords.mjs";
import { cleanText } from "./corpus_document_parsing.mjs";
const QUERY_STOPWORDS = new Set([
  "aga", "ei", "eesti", "eestis", "ehk", "et", "ja", "kas", "kui", "kuidas", "kus", "meie",
  "miks", "mis", "mida", "millal", "milline", "ning", "on", "oma", "palun", "praegu", "praegune", "praegused", "hetke", "hetkel",
  "selgita", "selgitage", "sooviksin", "teada", "mind", "huvitab",
  "täna", "tana", "homme", "homne", "ülehomme", "ulehomme", "reaalajas", "see",
  "seda", "selle", "siis", "suur", "suured", "suurus", "uusim", "uusimad", "värske", "värsked", "või", "ule", "üle", "uks", "üks",
]);
// Reviewed Estonian wording pairs. A user may ask for the act while the
// cited page names the result, or the reverse. Keep the group exact so the
// expansion cannot drift into unrelated words with a similar prefix.
const REVIEWED_QUERY_STEM_FORMS = new Map([
  ["uuendati", "uuend"],
  ["uuendamine", "uuend"],
  ["metsauuendus", "uuend"],
  ["uuendatud", "uuend"],
  ["mõjutab", "mõju"],
  ["mõju", "mõju"],
  ["majandamine", "majand"],
  ["majandatakse", "majand"],
]);
const REVIEWED_QUERY_STEM_VARIANTS = new Map([
  ["uuend", ["uuend", "metsauuendu"]],
  ["mõju", ["mõju"]],
  ["majand", ["majand"]],
]);
const SEARCH_FILTER_SOURCES = new Set(["all", "trusted", "official", "reviewed", "supplementary", "other"]);

export function normalizeCorpusQuery(value = "") {
  const canonicalInput = canonicalizePublicSearchQuery(value);
  return canonicalInput.ok ? canonicalInput.query.toLocaleLowerCase("et") : "";
}

function corpusTermRoot(term) {
  const subject = specialistSubjectRoot(term);
  if (subject) return subject;
  if (/^kasvuhoonegaas/iu.test(term)) return "kasvuhoonegaas";
  if (/^mets/iu.test(term)) return "mets";
  if (/^(?:rai|raie|raium|raiemaht)/iu.test(term)) return "rai";
  if (/^noor/iu.test(term)) return "noor";
  if (/^(?:vana|vanus|vanem)/iu.test(term)) return "vanus";
  if (/^muut/iu.test(term)) return "muut";
  if (/^tulevik/iu.test(term)) return "tulevik";
  if (/^kasv/iu.test(term)) return "kasv";
  if (/^põhjave/iu.test(term)) return "põhjave";
  if (/^läänemer/iu.test(term)) return "läänemer";
  if (/^mer/iu.test(term)) return "mer";
  if (/^hei[dt]/iu.test(term)) return "heide";
  if (/^ringmajand/iu.test(term)) return "ringmajandus";
  if (/^ringlussevõt/iu.test(term)) return "ringlussevõt";
  if (/^(?:tohib|lubat|keelat)$/iu.test(term)) return "lubatav";
  if (/^võib$/iu.test(term)) return "lubatav";
  if (/^autorehv/iu.test(term)) return "rehv";
  if (/^elutsük/iu.test(term)) return "elutsük";
  if (/^sadem/iu.test(term)) return "sadem";
  if (/^ajalool/iu.test(term)) return "ajalool";
  if (/^emajõ/iu.test(term)) return "emajõ";
  if (/^keskkonnalo/iu.test(term)) return "keskkonnalo";
  if (/^(?:taotl|taotle)/iu.test(term)) return "taotl";
  if (/^ettevõt/iu.test(term)) return "ettevõt";
  if (/^ehit/iu.test(term)) return "ehit";
  if (/^(?:liik|liig)/iu.test(term)) return "liik";
  if (/^(?:elupaik|elupaig)/iu.test(term)) return "elupaik";
  if (/^lang/iu.test(term)) return "lang";
  if (/^vähen/iu.test(term)) return "vähen";
  if (/^suuren/iu.test(term)) return "suuren";
  if (/^seir/iu.test(term)) return "seir";
  if (/^mõõt/iu.test(term)) return "mõõt";
  if (/^kait/iu.test(term)) return "kait";
  if (/maal$/iu.test(term) && term.length >= 7) return term.slice(0, -1);
  return term;
}

export function corpusRankingTerms(value = "") {
  const canonicalTerms = analyzeQueryIntent(normalizeCorpusQuery(value)).terms
    .flatMap((term) => term.match(/[0-9a-zõäöüšž]+/giu) || []);
  return [...new Set(canonicalTerms
    .filter((term) => term.length >= 2 && !QUERY_STOPWORDS.has(term))
    .flatMap((term) => {
      const reviewedStem = REVIEWED_QUERY_STEM_FORMS.get(term);
      if (reviewedStem) return [reviewedStem];
      return /^metsastat/iu.test(term)
        ? [corpusTermRoot(term), "statist"]
        : [corpusTermRoot(term)];
    }))]
    .slice(0, 10);
}

function corpusTermVariants(term) {
  const reviewedVariants = REVIEWED_QUERY_STEM_VARIANTS.get(term);
  if (reviewedVariants) return reviewedVariants;
  const subjectVariants = specialistSubjectVariants(term);
  // SQL lexemes cannot contain spaces. Phrase alternatives remain available
  // to passage ranking; here the reviewed token stems form one OR group.
  if (subjectVariants) return subjectVariants.filter((variant) => !variant.includes(" "));
  if (term === "noor") return [term, "vanus"];
  if (term === "vanus") return [term, "noor", "vana"];
  if (term === "muut") return [term, "trend"];
  if (term === "rai") return [term, "raiemaht", "raiuda"];
  if (term === "kasv") return [term, "suuren"];
  if (term === "heide") return ["heit", "heid"];
  if (term === "lubatav") return ["tohi", "lubat", "keelat"];
  if (term === "rehv") return ["rehv", "autorehv"];
  if (term === "sadem") return ["sadem", "saju"];
  if (term === "emajõ") return ["emajõ", "emajõe"];
  if (term === "mõõt") return ["mõõt", "tulemus"];
  if (term === "liik") return ["liik", "liig"];
  if (term === "elupaik") return ["elupaik", "elupaig"];
  if (["lang", "vähen"].includes(term)) return [term, "vähen", "kahan"];
  return [term];
}

export function corpusQueryTerms(value = "") {
  const terms = corpusRankingTerms(value);
  const expanded = terms.flatMap(corpusTermVariants);
  return [...new Set(expanded)].slice(0, 14);
}

export function buildPrefixTsQuery(value = "") {
  return corpusRankingTerms(value).map((term) => {
    const group = corpusTermVariants(term).map((variant) => `${variant}:*`);
    return group.length === 1 ? group[0] : `(${group.join(" | ")})`;
  }).join(" & ");
}

// Open natural-language questions add qualifiers ("väikesele
// puidutööstusele") that no single source repeats verbatim. Requiring every
// term would return an empty page even when an official permit guide covers
// the subject. Use OR for recall and let coverage ranking prefer documents
// that match more of the question.
export function buildAnyPrefixTsQuery(value = "") {
  const groups = corpusRankingTerms(value).map((term) => {
    const variants = corpusTermVariants(term).map((variant) => `${variant}:*`);
    return variants.length === 1 ? variants[0] : `(${variants.join(" | ")})`;
  });
  return groups.join(" | ");
}

export function normalizeSearchFilters(value = {}) {
  const source = SEARCH_FILTER_SOURCES.has(String(value.source || "all")) ? String(value.source || "all") : "all";
  const category = cleanText(value.category).slice(0, 120);
  const requestedYear = Number(value.year);
  const maximumYear = new Date().getUTCFullYear() + 1;
  const year = Number.isInteger(requestedYear) && requestedYear >= 1990 && requestedYear <= maximumYear
    ? requestedYear
    : null;
  const sort = value.sort === "newest" ? "newest" : "relevance";
  return { source, category, year, sort };
}

export function sourceTiersForFilter(source = "all") {
  if (source === "trusted") return ["official", "reviewed"];
  if (["official", "reviewed", "supplementary", "other"].includes(source)) return [source];
  return [];
}

export function queryNeedsFreshness(value = "") {
  const query = normalizeCorpusQuery(value);
  return /\b(?:praeg\w*|hetke\w*|uusim\w*|viimati|värske\w*|tänavu|tulevik\w*|trend\w*|muutu\w*|20(?:2[5-9]|[3-9]\d))\b/iu.test(query);
}

export function summarizeUrlOccurrences(values = []) {
  const occurrences = values.map((value) => String(value || "").trim()).filter(Boolean);
  const distinctUrls = [...new Set(occurrences)];
  return {
    occurrences,
    distinctUrls,
    occurrenceCount: occurrences.length,
    distinctCount: distinctUrls.length,
  };
}
