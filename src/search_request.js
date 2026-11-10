// The public search request contract lives in one place: the search page and
// the chat panel must send byte-identical payloads, so a chat answer and a
// search answer come from the same evidence path.
export const DEFAULT_SEARCH_FILTERS = { source: "all", category: "", year: null, sort: "relevance" };

export function clientSearchFilters(value = {}) {
  return {
    source: ["all", "trusted", "official", "reviewed", "supplementary", "other"].includes(value.source) ? value.source : "all",
    category: String(value.category || "").slice(0, 120),
    year: Number.isInteger(Number(value.year)) && Number(value.year) >= 1990 ? Number(value.year) : null,
    sort: value.sort === "newest" ? "newest" : "relevance",
  };
}

export function searchRequestPayload(query, filters = DEFAULT_SEARCH_FILTERS, page = 1, pageSize = 12) {
  const applied = clientSearchFilters(filters);
  return { q: query, filters: applied, page, page_size: pageSize };
}

export async function readFollowUpResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(response.ok
      ? "Jätkuküsimuse vastus oli vigane. Proovi uuesti."
      : "Jätkuküsimusele ei saanud vastata.");
  }
  if (!response.ok) throw new Error(data?.error || "Jätkuküsimusele ei saanud vastata.");
  if (!data?.answer || typeof data.answer !== "object" || Array.isArray(data.answer)) {
    throw new Error("Jätkuküsimuse vastus oli vigane. Proovi uuesti.");
  }
  return data;
}
