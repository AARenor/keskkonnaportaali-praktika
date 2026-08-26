export const REMOTE_SUGGESTION_MAX_LENGTH = 80;

export const REVIEWED_FORESTRY_SEARCH_SUGGESTIONS = Object.freeze([
  "Kui suur osa Eestist on kaetud metsaga?",
  "Kas Eestis raiutakse rohkem kui metsa juurde kasvab?",
  "Miks annavad eri allikad erinevaid numbreid?",
  "Mis vahe on SMI-l ja metsaregistril?",
  "Kuidas arvutatakse juurdekasvu?",
  "Miks ei võrdu tagavara raiutava puidukogusega?",
  "Kust leida konkreetse kinnistu metsaandmeid?",
  "Kui suur osa metsadest on kaitse all?",
  "Miks erinevad RMK ja SMI numbrid?",
  "Kuidas mõjutab kliimamuutus metsi?",
  "Mis on metsateatis?",
  "Kas Eestis saab mets otsa?",
  "Kas praegu raiutakse rohkem kui 20 aastat tagasi?",
  "Kas meie metsad muutuvad nooremaks?",
  "Kui palju lageraiet on viimase 10 aasta jooksul tehtud?",
  "Kas kuusk või mänd domineerib Eestis?",
  "Kas kaitsealadel raiutakse?",
  "Kui palju metsa on minu koduvallas?",
]);

export const REVIEWED_ENVIRONMENT_SEARCH_SUGGESTIONS = Object.freeze([
  "Kust leida põhjavee seireandmeid?",
  "Milline on õhukvaliteet Tallinnas praegu?",
  "Kust leida jäätmekäitluskohti Tartus?",
  "Kas Lahemaa loodusala on Natura ala?",
  "Kas Matsalu loodusala on Natura loodusala?",
  "Kust leida keskkonnaandmete API-d?",
  "Kui palju tekkis Eestis 2024. aastal ohtlikke jäätmeid?",
  "Kui suur oli Eesti veevõtt 2024. aastal?",
  "Kui suur oli BHT7 heitveekoormus Eestis 2024. aastal?",
  "Kas Emajõgi on avalik veekogu?",
  "Mis oli Jõgeva 15. jaanuari 2024 ööpäeva keskmine õhutemperatuur?",
  "Mis oli Võru ööpäeva keskmine õhutemperatuur 21. augustil 2025?",
  "Kui palju jäätmeid taaskasutati Eestis 2024. aastal?",
  "Kuidas aitab ringmajandus jäätmeid taaskasutada?",
  "Milline on Eesti elurikkuse seisund?",
]);

export const REVIEWED_SEARCH_SUGGESTIONS = Object.freeze([
  ...REVIEWED_FORESTRY_SEARCH_SUGGESTIONS,
  ...REVIEWED_ENVIRONMENT_SEARCH_SUGGESTIONS,
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
]);

const REVIEWED_ALIAS_SURFACE_PATTERN = /^[a-z0-9õäöüšž]+(?:[ _-][a-z0-9õäöüšž]+)*$/iu;

export function shouldFetchRemoteSuggestions(value) {
  const query = String(value || "").trim();
  return query.length >= 2 && query.length <= REMOTE_SUGGESTION_MAX_LENGTH;
}

function normalizeSuggestion(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et");
}

function normalizeSuggestionAlias(value) {
  const surface = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("et");
  if (!surface || surface.length > REMOTE_SUGGESTION_MAX_LENGTH
    || !REVIEWED_ALIAS_SURFACE_PATTERN.test(surface)) return null;
  return normalizeSuggestion(surface)
    .replace(/[^0-9a-z]+/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function editDistanceAtMostOne(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

function reviewedTokenMatches(queryToken, token) {
  if (token.length < 3) return token === queryToken;
  if (token.startsWith(queryToken) || queryToken.startsWith(token)) return true;
  if (queryToken.length < 3) return false;
  return [queryToken.length - 1, queryToken.length, queryToken.length + 1]
    .filter((length) => length > 0)
    .some((length) => editDistanceAtMostOne(queryToken, token.slice(0, length)));
}

export function suggestionsForValue(value, remote = {}, local = [], limit = 5) {
  const originalQuery = String(value || "").trim();
  if (originalQuery.length > REMOTE_SUGGESTION_MAX_LENGTH) return [];
  const canonicalQuery = originalQuery.normalize("NFKC");
  if (canonicalQuery.length > REMOTE_SUGGESTION_MAX_LENGTH) return [];
  const query = normalizeSuggestion(canonicalQuery);
  const localItems = local
    .map((item, index) => ({
      value: String(item || "").replace(/\s+/gu, " ").trim(),
      index,
    }))
    .filter((item) => item.value);
  const localValueKeys = new Set(localItems.map((item) => normalizeSuggestion(item.value)));
  const aliasKey = normalizeSuggestionAlias(originalQuery);
  const scoredAliases = (aliasKey === null ? [] : REVIEWED_SOURCE_CODE_ALIASES.get(aliasKey) || [])
    .filter((suggestion) => localValueKeys.has(normalizeSuggestion(suggestion)))
    .map((suggestion, index) => ({
      value: suggestion,
      count: null,
      index: -100 + index,
      relevance: 110,
      question: /[?]$/u.test(suggestion),
    }));
  const queryTokens = query.match(/[0-9a-z]+/giu) || [];
  const scoredLocal = localItems
    .map((item) => {
      const normalized = normalizeSuggestion(item.value);
      const tokens = normalized.match(/[0-9a-z]+/giu) || [];
      const prefixMatches = queryTokens.filter((queryToken) => (
        tokens.some((token) => reviewedTokenMatches(queryToken, token))
      )).length;
      const relevance = !query ? 50 - item.index * 0.001
        : normalized.startsWith(query) ? 100
        : queryTokens.length && prefixMatches === queryTokens.length ? 60 + prefixMatches
          : 0;
      return { value: item.value, count: null, index: item.index, relevance, question: /[?]$/u.test(item.value) };
    })
    .filter((item) => item.relevance > 0);
  const scoredRemote = String(remote.query || "") === originalQuery && Array.isArray(remote.items)
    ? remote.items.map((item, index) => {
      const clean = String(item?.value || "").replace(/\s+/gu, " ").trim();
      const normalized = normalizeSuggestion(clean);
      return {
        value: clean,
        count: item?.count ?? null,
        index: localItems.length + index,
        relevance: normalized === query ? 105 : normalized.startsWith(query) ? 95 : 70,
        question: /[?]$/u.test(clean),
      };
    }).filter((item) => item.value)
    : [];
  const seen = new Set();
  return [...(scoredAliases.length ? scoredAliases : scoredLocal), ...scoredRemote]
    .sort((left, right) => Number(right.question) - Number(left.question)
      || right.relevance - left.relevance
      || left.index - right.index)
    .filter((item) => {
      const key = normalizeSuggestion(item.value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ value: suggestion, count }) => ({ value: suggestion, count }));
}
