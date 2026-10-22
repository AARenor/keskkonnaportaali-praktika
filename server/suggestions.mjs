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
  "Kuhu viia ohtlikud jäätmed?",
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
    "Kuhu viia ohtlikud jäätmed?",
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
  ["mets", [
    "Kui palju metsa on Eestis?",
    "Kui suur osa Eestist on kaetud metsaga?",
    "Kas Eestis raiutakse rohkem kui metsa juurde kasvab?",
    "Mis vahe on SMI-l ja metsaregistril?",
    "Kui suur osa metsadest on kaitse all?",
    "Kuidas mõjutab kliimamuutus metsi?",
    "Mis on metsateatis?",
    "Kuidas taotleda metsateatist?",
    "Kas kaitsealadel raiutakse?",
    "Kuidas arvutatakse juurdekasvu?",
    "Kui palju lageraiet on viimase 10 aasta jooksul tehtud?",
    "Kust leida konkreetse kinnistu metsaandmeid?",
  ]],
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
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 12));
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
