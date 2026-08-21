export const REMOTE_SUGGESTION_MAX_LENGTH = 80;

export const REVIEWED_SEARCH_SUGGESTIONS = Object.freeze([
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

export function shouldFetchRemoteSuggestions(value) {
  const query = String(value || "").trim();
  return query.length >= 2 && query.length <= REMOTE_SUGGESTION_MAX_LENGTH;
}

export function suggestionsForValue(value, remote = {}, local = [], limit = 5) {
  const originalQuery = String(value || "").trim();
  const query = originalQuery.toLocaleLowerCase("et");
  const localItems = local
    .map((item, index) => ({
      value: String(item || "").replace(/\s+/gu, " ").trim(),
      index,
    }))
    .filter((item) => item.value);
  const queryTokens = query.match(/[0-9a-zõäöüšž]+/giu) || [];
  const scoredLocal = localItems
    .map((item) => {
      const normalized = item.value.toLocaleLowerCase("et");
      const tokens = normalized.match(/[0-9a-zõäöüšž]+/giu) || [];
      const prefixMatches = queryTokens.filter((queryToken) => (
        tokens.some((token) => token.startsWith(queryToken) || queryToken.startsWith(token))
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
      const normalized = clean.toLocaleLowerCase("et");
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
  return [...scoredLocal, ...scoredRemote]
    .sort((left, right) => Number(right.question) - Number(left.question)
      || right.relevance - left.relevance
      || left.index - right.index)
    .filter((item) => {
      const key = item.value.toLocaleLowerCase("et");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ value: suggestion, count }) => ({ value: suggestion, count }));
}
