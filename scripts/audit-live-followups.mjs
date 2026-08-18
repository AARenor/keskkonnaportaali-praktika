import { canonicalResultUrl } from "../server/retrieval.mjs";

const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/u, "").split("=");
  return [key, rest.join("=") || true];
}));
const baseUrl = new URL(String(options["base-url"] || "http://127.0.0.1:4317"));
if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
  throw new Error("--base-url must be an HTTP(S) origin without credentials");
}
const timeoutMs = Math.max(1_000, Math.min(Number(options["timeout-ms"]) || 20_000, 30_000));
const filters = { source: "official", category: "", year: null, sort: "relevance" };
const rootQuery = "kliimamuutuse mõju sademetele Eestis";
const questions = [
  "Kas talved on muutunud sajusemaks?",
  "Mida näitavad suvised sademed?",
  "Millise ajavahemikuga neid muutusi võrreldakse?",
];
const failures = [];
let checks = 0;

function check(condition, message, context = {}) {
  checks += 1;
  if (!condition) failures.push({ message, ...context });
}

async function post(pathname, body) {
  const startedAt = Date.now();
  const response = await fetch(new URL(pathname, baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Keskkonnaportaali-praktika-followup-audit/1.0",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, durationMs: Date.now() - startedAt, payload };
}

function citationIds(payload) {
  return [...new Set([
    ...(payload?.answer?.introCitations || []),
    ...(payload?.answer?.parts || []).flatMap((part) => part.citations || []),
  ])];
}

function validateTurn(id, result) {
  const payload = result.payload || {};
  const listing = payload.searchResults || {};
  const items = Array.isArray(listing.items) ? listing.items : [];
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  const urls = new Set(items.map((item) => canonicalResultUrl(item.url)));
  const citations = citationIds(payload);
  check(result.status === 200, "turn did not return HTTP 200", { id, status: result.status });
  check(JSON.stringify(listing.appliedFilters) === JSON.stringify(filters), "filters changed between turns", {
    id,
    appliedFilters: listing.appliedFilters,
  });
  check(items.every((item) => item.sourceTier === "official"), "a visible result escaped the official filter", { id });
  check(sources.every((source) => source.sourceTier === "official"), "an answer source escaped the official filter", { id });
  check(sources.every((source) => urls.has(canonicalResultUrl(source.url))), "an answer cited a source outside the visible ranked listing", { id });
  check(citations.every((citation) => Number.isInteger(citation) && citation >= 1 && citation <= sources.length), "a citation has no matching source", {
    id,
    citations,
    sourceCount: sources.length,
  });
  check(Array.isArray(payload.related) && payload.related.length <= 6, "related questions violate the bounded schema", { id });
  check((payload.related || []).every((question) => typeof question === "string" && question.trim().length > 0), "related question is empty", { id });
  check(String(payload?.answer?.intro || "").length <= 900, "answer introduction is unexpectedly long", { id });
  return {
    id,
    status: result.status,
    durationMs: result.durationMs,
    eyebrow: payload?.answer?.eyebrow || null,
    resultCount: items.length,
    sourceCount: sources.length,
    citationCount: citations.length,
    relatedCount: Array.isArray(payload.related) ? payload.related.length : 0,
  };
}

const rows = [];
const root = await post("/api/search", { q: rootQuery, filters, page: 1, page_size: 12 });
rows.push(validateTurn("root", root));
const previousQuestions = [];
for (const [index, question] of questions.entries()) {
  const turn = await post("/api/search/follow-up", {
    root_query: rootQuery,
    question,
    previous_questions: previousQuestions,
    filters,
  });
  rows.push(validateTurn(`follow-up-${index + 1}`, turn));
  previousQuestions.push(question);
}

const report = {
  baseUrl: baseUrl.origin,
  evaluatedAt: new Date().toISOString(),
  filters,
  turns: rows,
  checks,
  failureCount: failures.length,
  failures,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
