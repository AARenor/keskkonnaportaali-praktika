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

// The browser reads follow-ups from the streamed route, so the ordinary
// listing for the new question arrives before the answer. The one-shot JSON
// route stays for other consumers and keeps the same body contract.
export const FOLLOW_UP_STREAM_PATH = "/api/search/follow-up/stream";

export function followUpRequestPayload({
  rootQuery,
  question,
  previousQuestions = [],
  previousAnswers = [],
  filters = DEFAULT_SEARCH_FILTERS,
} = {}) {
  return {
    root_query: String(rootQuery || ""),
    question: String(question || ""),
    previous_questions: (Array.isArray(previousQuestions) ? previousQuestions : []).slice(0, 4),
    // Comparison context for the repeated-answer check, never evidence.
    previous_answers: (Array.isArray(previousAnswers) ? previousAnswers : [])
      .filter((value) => typeof value === "string" && value.trim())
      .slice(0, 5),
    filters: clientSearchFilters(filters),
  };
}

// One validator for both transports: an answer event and a JSON body must
// carry the same answer card, so a broken follow-up is reported the same way.
export function followUpAnswerPayload(data) {
  const answer = data?.answer;
  const hasIntro = typeof answer?.intro === "string" && answer.intro.trim();
  const hasPart = Array.isArray(answer?.parts) && answer.parts.some((part) => typeof part?.text === "string" && part.text.trim());
  if (!answer || typeof answer !== "object" || Array.isArray(answer) || (!hasIntro && !hasPart)) {
    throw new Error("Jätkuküsimuse vastus oli vigane. Proovi uuesti.");
  }
  return data;
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
  return followUpAnswerPayload(data);
}

// The server marks its plain no-answer card with this public eyebrow (the same
// string as NO_ANSWER_EYEBROW in server/search.mjs). The search page and the
// chat panel read the marker from here, so the two renderings cannot drift.
export const NO_ANSWER_EYEBROW = "Vastust ei leitud";

// The server's other no-summary card: sources were chosen, the summary was not
// made (server/search.mjs composeSearchResponse). It carries no aiUnavailable
// flag, so its own public eyebrow is the marker; scripts/load-search.mjs:74
// already classifies that eyebrow as an evidence fallback, never an answer.
export const SOURCE_ONLY_EYEBROW = "Kontrollitud allikaotsing";

export function isNoAnswerCard(answer) {
  return Boolean(answer) && answer.eyebrow === NO_ANSWER_EYEBROW;
}

export function isSourceOnlyCard(answer) {
  return Boolean(answer) && answer.eyebrow === SOURCE_ONLY_EYEBROW;
}

// The card carries no model wording: the wording failed, the sources hold no
// answer, or the server published the source records without a summary. In
// every case the listing the reader already received leads, and the card below
// it says what is missing.
export function hasNoModelWording(answer) {
  return !answer
    || answer.aiUnavailable === true
    || isNoAnswerCard(answer)
    || isSourceOnlyCard(answer);
}
