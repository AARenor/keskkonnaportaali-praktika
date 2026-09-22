import { getForestrySuggestions } from "./forestry.mjs";
import { normalize, queryTerms } from "./search.mjs";

// Reviewed, directly answerable examples for the structured non-forestry
// adapters. These are a local availability fallback for the official portal's
// autocomplete endpoint, not claims or evidence by themselves.
export const REVIEWED_ENVIRONMENT_SUGGESTIONS = Object.freeze([
  "Kui palju tekkis Eestis 2024. aastal ohtlikke jäätmeid?",
  "Kui suur oli Eesti veevõtt 2024. aastal?",
  "Kui suur oli BHT7 heitveekoormus Eestis 2024. aastal?",
  "Kas Emajõgi on avalik veekogu?",
  "Mis oli Jõgeva 15. jaanuari 2024 ööpäeva keskmine õhutemperatuur?",
  "Mis oli Võru ööpäeva keskmine õhutemperatuur 21. augustil 2025?",
  "Kas Matsalu loodusala on Natura loodusala?",
  "Kui palju jäätmeid taaskasutati Eestis 2024. aastal?",
  "Kas Lahemaa loodusala on Natura ala?",
  "Kuidas aitab ringmajandus jäätmeid taaskasutada?",
  "Milline on Eesti elurikkuse seisund?",
  "Milline on homne ilmaprognoos Eestis?",
  "Milline on õhutemperatuur praegu Tartus?",
  "Mis oli Tartu Emajõe viimati avaldatud veetase?",
]);

const REVIEWED_SOURCE_CODE_ALIASES = new Map([
  ["dta08", ["Mis oli Jõgeva 15. jaanuari 2024 ööpäeva keskmine õhutemperatuur?"]],
  ["kk048", ["Kui suur oli Eesti veevõtt 2024. aastal?"]],
  ["kk25", ["Kui suur oli BHT7 heitveekoormus Eestis 2024. aastal?"]],
  ["kk068", ["Kui palju tekkis Eestis 2024. aastal ohtlikke jäätmeid?"]],
  ["kk610", ["Kui palju jäätmeid taaskasutati Eestis 2024. aastal?"]],
  ["eelis", ["Kas Emajõgi on avalik veekogu?", "Kas Lahemaa loodusala on Natura ala?"]],
  ["f rahvalad", ["Kas Lahemaa loodusala on Natura ala?"]],
  ["lahemaa", ["Kas Lahemaa loodusala on Natura ala?"]],
  ["ringmajandus", ["Kuidas aitab ringmajandus jäätmeid taaskasutada?"]],
  ["elurikkus", ["Milline on Eesti elurikkuse seisund?"]],
  ["voru temperatuur", ["Mis oli Võru ööpäeva keskmine õhutemperatuur 21. augustil 2025?"]],
  ["ohtlikud jaatmed", ["Kui palju tekkis Eestis 2024. aastal ohtlikke jäätmeid?"]],
  ["ohk", ["Milline on õhutemperatuur praegu Tartus?", "Milline on homne ilmaprognoos Eestis?"]],
  ["ohukvaliteet", ["Milline on õhutemperatuur praegu Tartus?", "Milline on homne ilmaprognoos Eestis?"]],
]);

const REVIEWED_ALIAS_SURFACE_PATTERN = /^[a-z0-9õäöüšž]+(?:[ _-][a-z0-9õäöüšž]+)*$/iu;

function reviewedSearchSuggestionAliasKey(query) {
  const surface = String(query ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("et");
  if (!surface || surface.length > 80 || !REVIEWED_ALIAS_SURFACE_PATTERN.test(surface)) return null;
  return normalize(surface);
}

export function isReviewedSearchSuggestionAlias(query) {
  const key = reviewedSearchSuggestionAliasKey(query);
  return key !== null && REVIEWED_SOURCE_CODE_ALIASES.has(key);
}

function aliasSuggestions(query, limit) {
  const key = reviewedSearchSuggestionAliasKey(query);
  return (key === null ? [] : REVIEWED_SOURCE_CODE_ALIASES.get(key) || []).slice(0, limit);
}

function generalSuggestions(query, limit) {
  const roots = queryTerms(query);
  if (!roots.length) return [];
  const rootsMatch = (left, right) => left === right
    || (left.length >= 5 && right.length >= 5 && left.slice(0, 5) === right.slice(0, 5))
    || (left.length >= 4 && right.length >= 4
      && (left.startsWith(right) || right.startsWith(left)));
  const queryTokens = normalize(query).split(/\s+/u)
    .filter((token) => token.length >= 4 && !/^\d+$/u.test(token));
  return REVIEWED_ENVIRONMENT_SUGGESTIONS
    .map((value, index) => {
      const candidateRoots = new Set(queryTerms(value));
      const matches = roots.filter((root) => (
        [...candidateRoots].some((candidateRoot) => rootsMatch(root, candidateRoot))
      )).length;
      const candidateTokens = normalize(value).split(/\s+/u);
      const literalMatches = queryTokens.filter((token) => (
        candidateTokens.some((candidateToken) => rootsMatch(token, candidateToken))
      )).length;
      // Exact tier (100+): every root and every literal token overlaps -
      // the paraphrase tier (50+) below fires only when every query root is
      // still covered, so synonym queries suggest the same reviewed
      // questions without loosening to partial-topic matches.
      return {
        value,
        index,
        score: matches === roots.length && literalMatches === queryTokens.length
          ? 100 + matches + literalMatches
          : matches === roots.length && matches > 0
            ? 50 + matches
            : 0,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ value }) => value);
}

export function getReviewedSearchSuggestions(query, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 5));
  const reviewedAliases = aliasSuggestions(query, safeLimit);
  const reviewedGeneral = generalSuggestions(query, safeLimit);
  const values = [
    ...reviewedAliases,
    ...reviewedGeneral,
    ...(reviewedAliases.length || reviewedGeneral.length ? [] : getForestrySuggestions(query, safeLimit)),
  ];
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").toLocaleLowerCase("et");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, safeLimit);
}
