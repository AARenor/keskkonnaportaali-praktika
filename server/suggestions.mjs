import { getForestrySuggestions } from "./forestry.mjs";
import { analyzeQueryIntent } from "./query_intent.mjs";
import { normalize, queryTerms } from "./search_query_terms.mjs";

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
  "Kas Eestis tohib vanu rehve põletada?",
  "Kas väikese tiigi rajamiseks on luba vaja?",
  "Kuidas saada puurkaevu andmeid?",
  "Kuidas arvutada ettevõtte süsinikujalajälge?",
  "Kust näeb Tallinna mürakaarti?",
  "Kas Pärnu rannas võib ujuda?",
  "Kuidas kontrollida KOTKAS keskkonnaloa menetluse staatust?",
  "Kust leida KESE keskkonnaseire mõõtmistulemusi?",
  "Mis on Eesti jäätmete ringlussevõtu määr?",
  "Kust leida keskkonnaandmete API-d?",
  "Milline on õhukvaliteet Tallinnas praegu?",
  "Mis oli 2024. aasta keskmine õhutemperatuur Eestis?",
  "Kust leida üleujutusohu prognoosid?",
  "Kust leida merevee taseme mõõtmisandmeid?",

  "Kuidas taotleda keskkonnaluba?",
  "Kuidas teatada reostusest?",
  "Kuhu viia vana elektroonika?",
  "Mida teha vanade ravimitega?",
  "Kuidas kompostida biojäätmeid?",
  "Kuidas sorteerida pakendeid?",
  "Kust leida jäätmekäitluskohti?",
  "Kust leida jäätmekäitluskohti Tartus?",
  "Kuidas kaitsta kodu radooni eest?",
  "Kuidas hoida ära hallitust kodus?",
  "Kust leida põhjavee seireandmeid?",
  "Kust leida joogivee kvaliteedi andmeid?",
  "Kust leida suplusvee andmeid?",
  "Kuidas taotleda metsateatist?",
  "Millal algab linnujaht?",
  "Kuidas kaitsta kaitsealust liiki?",
  "Kust leida Natura alasid?",
  "Kuidas taotleda kaevuluba?",
  "Kuidas hinnata keskkonnamõju?",
  "Milline on Eesti kliima tulevik?",
  "Mida teha reostunud pinnasega?",
  "Kuidas taotleda välisõhu saasteluba?",
  "Kust leida keskkonnaregistri andmeid?",
  "Kui palju metsa on Eestis?",
]);

const CURATED_FORESTRY_INTENT_SUGGESTIONS = Object.freeze({
  "clearcut:definition": Object.freeze(["Mida loetakse lageraiks?", "Millal on lageraie lubatud?", "Kui palju lageraiet tehakse?"]),
  "clearcut:criteria": Object.freeze(["Mis on lageraie?", "Millal on lageraie lubatud?", "Kui palju lageraiet tehakse?"]),
  "clearcut:conditions": Object.freeze(["Mis on lageraie?", "Mida loetakse lageraiks?", "Kui palju lageraiet tehakse?"]),
  "clearcut:quantitative": Object.freeze(["Mis on lageraie?", "Mida loetakse lageraiks?", "Millal on lageraie lubatud?"]),
  "forest:definition": Object.freeze(["Mida loetakse metsaks?", "Mis vahe on metsal ja metsamaal?", "Mis on mets FAO FRA järgi?"]),
  "forest:criteria": Object.freeze(["Mis on mets?", "Mis vahe on metsal ja metsamaal?", "Mis on mets FAO FRA järgi?"]),
  "forest_notice:procedure": Object.freeze(["Millal tuleb metsateatis esitada?", "Kui kaua vaatab Keskkonnaamet metsateatist läbi?", "Millal võib raietööga alustada?"]),
});


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
  ["kotkas", ["Kuidas kontrollida KOTKAS keskkonnaloa menetluse staatust?"]],
  ["kese", ["Kust leida KESE keskkonnaseire mõõtmistulemusi?"]],
  ["ringlussevott", ["Mis on Eesti jäätmete ringlussevõtu määr?"]],
  ["rehvid", ["Kas Eestis tohib vanu rehve põletada?"]],
  ["puurkaev", ["Kuidas saada puurkaevu andmeid?"]],
  ["susinikujalajalg", ["Kuidas arvutada ettevõtte süsinikujalajälge?"]],
  ["susinikujalajalge", ["Kuidas arvutada ettevõtte süsinikujalajälge?"]],
  ["murakaart", ["Kust näeb Tallinna mürakaarti?"]],
  ["tiik", ["Kas väikese tiigi rajamiseks on luba vaja?"]],
  ["parnu rand", ["Kas Pärnu rannas võib ujuda?"]],
  ["ohk", ["Milline on õhutemperatuur praegu Tartus?", "Milline on homne ilmaprognoos Eestis?"]],
  ["ohukvaliteet", ["Milline on õhukvaliteet Tallinnas praegu?"]],
  ["mura", ["Kust näeb Tallinna mürakaarti?"]],
  ["mura tase", ["Kust näeb Tallinna mürakaarti?"]],
  ["kliima", ["Mis oli 2024. aasta keskmine õhutemperatuur Eestis?"]],
  ["uputus", ["Kust leida üleujutusohu prognoosid?"]],
  ["uleujutus", ["Kust leida üleujutusohu prognoosid?"]],
  ["meri", ["Kust leida merevee taseme mõõtmisandmeid?"]],
  ["mereveetase", ["Kust leida merevee taseme mõõtmisandmeid?"]],
  ["merevee tase", ["Kust leida merevee taseme mõõtmisandmeid?"]],
  ["vesi", [
    "Kui suur oli Eesti veevõtt 2024. aastal?",
    "Kas Emajõgi on avalik veekogu?",
    "Mis oli Tartu Emajõe viimati avaldatud veetase?",
    "Kust leida põhjavee seireandmeid?",
    "Kust leida joogivee kvaliteedi andmeid?",
    "Kust leida suplusvee andmeid?",
    "Kust leida üleujutusohu prognoosid?",
    "Kust leida merevee taseme mõõtmisandmeid?",
  ]],
  ["jaatmed", [
    "Kui palju tekkis Eestis 2024. aastal ohtlikke jäätmeid?",
    "Kui palju jäätmeid taaskasutati Eestis 2024. aastal?",
      "Kuhu viia vana elektroonika?",
    "Mida teha vanade ravimitega?",
    "Kuidas kompostida biojäätmeid?",
    "Kuidas sorteerida pakendeid?",
    "Kust leida jäätmekäitluskohti?",
    "Mis on Eesti jäätmete ringlussevõtu määr?",
  ]],
  ["luba", [
    "Kuidas taotleda keskkonnaluba?",
      "Kuidas taotleda välisõhu saasteluba?",
    "Kuidas taotleda kaevuluba?",
    "Kuidas taotleda metsateatist?",
    "Kas väikese tiigi rajamiseks on luba vaja?",
    "Kuidas kontrollida KOTKAS keskkonnaloa menetluse staatust?",
  ]],
  ["lageraie", ["Mis on lageraie?", "Mida loetakse lageraiks?", "Millal on lageraie lubatud?", "Kui palju lageraiet tehakse?"]],
  ["mets", ["Mis on mets?", "Mida loetakse metsaks?", "Mis on lageraie?", "Millal on lageraie lubatud?", "Kuidas esitada metsateatist?"]],
  ["metsateatis", ["Kuidas esitada metsateatist?", "Millal tuleb metsateatis esitada?", "Kui kaua vaatab Keskkonnaamet metsateatist läbi?"]],
]);

function forestryIntentSuggestions(query, limit) {
  const { topic, intent } = analyzeQueryIntent(query);
  return (CURATED_FORESTRY_INTENT_SUGGESTIONS[`${topic}:${intent}`] || []).slice(0, limit);
}


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
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 12));
  const intentSuggestions = forestryIntentSuggestions(query, safeLimit);
  if (intentSuggestions.length) return intentSuggestions;
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

const RELATED_QUERIES = {
  mets: ["metsade pindala Eestis", "metsaraie andmed", "metsa looduskaitsepiirangud"],
  kliima: ["Eesti temperatuuritrend", "sademed maakonniti", "kliimastsenaarium 2100"],
  vesi: ["põhjavee seisund", "järvede veekvaliteet", "Läänemere seisund"],
  jäätmed: ["jäätmeteke Eestis", "ringlussevõtu määr", "jäätmeluba KOTKASes"],
};

export function relatedQueries(query, _sources = []) {
  const normalizedQuery = normalize(query);
  const direct = Object.entries(RELATED_QUERIES).find(([key]) => normalizedQuery.includes(normalize(key)));
  return direct ? direct[1] : [];
}
