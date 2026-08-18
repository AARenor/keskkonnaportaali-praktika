export const REMOTE_SUGGESTION_MAX_LENGTH = 80;

export function shouldFetchRemoteSuggestions(value) {
  const query = String(value || "").trim();
  return query.length >= 2 && query.length <= REMOTE_SUGGESTION_MAX_LENGTH;
}

export function suggestionsForValue(value, remote = {}, local = [], limit = 5) {
  const originalQuery = String(value || "").trim();
  const query = originalQuery.toLocaleLowerCase("et");
  if (query.length < 2) return [];
  if (String(remote.query || "") === originalQuery && Array.isArray(remote.items) && remote.items.length) {
    return remote.items.slice(0, limit);
  }
  return local
    .filter((item) => String(item || "").toLocaleLowerCase("et").includes(query))
    .slice(0, limit)
    .map((item) => ({ value: item, count: null }));
}
