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
  "Milline on homne ilmaprognoos Eestis?",
  "Milline on õhutemperatuur praegu Tartus?",
  "Mis oli Tartu Emajõe viimati avaldatud veetase?",
]);

function generalSuggestions(query, limit) {
  const roots = queryTerms(query);
  if (!roots.length) return [];
  const rootsMatch = (left, right) => left === right
    || (left.length >= 5 && right.length >= 5 && left.slice(0, 5) === right.slice(0, 5));
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
      return {
        value,
        index,
        score: matches === roots.length && literalMatches === queryTokens.length
          ? 100 + matches + literalMatches
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
  const reviewedGeneral = generalSuggestions(query, safeLimit);
  const values = [
    ...reviewedGeneral,
    ...(reviewedGeneral.length ? [] : getForestrySuggestions(query, safeLimit)),
  ];
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").toLocaleLowerCase("et");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, safeLimit);
}
