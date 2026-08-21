import { canonicalResultUrl } from "../server/retrieval.mjs";
import { requestBoundedAuditJson } from "./audit-http.mjs";

const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/u, "").split("=");
  return [key, rest.join("=") || true];
}));
const baseUrl = new URL(String(options["base-url"] || "http://127.0.0.1:4317"));
if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
  throw new Error("--base-url must be an HTTP(S) origin without credentials");
}
const minimumIntervalMs = Math.max(0, Math.min(Number(options["interval-ms"]) || 3_200, 10_000));
let lastRequestStartedAt = 0;
let checks = 0;
const failures = [];

const sourceCases = [
  { id: "source-official", q: "keskkonnaloa taotlemine", source: "official", nonempty: true },
  { id: "source-trusted", q: "mullaseire tulemused", source: "trusted", nonempty: true },
  { id: "source-supplementary", q: "Eesti metsad", source: "supplementary", nonempty: true },
  { id: "source-other", q: "Rail Baltica mõju keskkonnale", source: "other", nonempty: true },
  { id: "source-reviewed-empty", q: "mets", source: "reviewed", nonempty: false },
];
const categoryCases = [
  { id: "category-permit", q: "KOTKAS keskkonnaluba", category: "Infosüsteem" },
  { id: "category-geoserver", q: "WFS GeoServer", category: "Ruumiandmete API" },
  { id: "category-soil", q: "mullaseire tulemused", category: "Riikliku seire ülevaade" },
  { id: "category-marine", q: "Läänemere seisund", category: "Ametlik seisundihinnang" },
  { id: "category-electric", q: "elektriauto elutsükkel", category: "Ametlik teemaülevaade" },
];
const yearCases = [
  { id: "year-forest", q: "kui palju metsa Eestis on", year: 2026 },
  { id: "year-geoserver", q: "WFS GeoServer", year: 2026 },
  { id: "year-electric", q: "elektriauto elutsükkel", year: 2024 },
  { id: "year-wind", q: "tuulepargi keskkonnamõju", year: 2025 },
  { id: "year-noise", q: "Tallinna mürakaart", year: 2024 },
];
const combinedCases = [
  { id: "combined-forest", q: "kui palju metsa Eestis on", source: "official", category: "Ülevaade", year: 2026 },
  { id: "combined-geoserver", q: "WFS GeoServer", source: "official", category: "Ruumiandmete API", year: 2026 },
  { id: "combined-electric", q: "elektriauto elutsükkel", source: "official", category: "Ametlik teemaülevaade", year: 2024 },
  { id: "combined-wind", q: "tuulepargi keskkonnamõju", source: "official", category: "Ametlik juhend", year: 2025 },
  { id: "combined-noise", q: "Tallinna mürakaart", source: "official", category: "Ametlik mürakaart", year: 2024 },
];
const sortQueries = [
  "metsade seisund",
  "põhjavee seisund",
  "jäätmete ringlussevõtt",
  "kliimamuutuse sademed",
  "keskkonnaseire tulemused",
];

function check(condition, message, context = {}) {
  checks += 1;
  if (!condition) failures.push({ message, ...context });
}

function publishedYear(item) {
  const label = String(item?.published || "");
  const match = label.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/u);
  return match ? Number(match[1]) : null;
}

function sourceMatches(item, source) {
  if (source === "all") return true;
  if (source === "trusted") return ["official", "reviewed"].includes(item.sourceTier);
  return item.sourceTier === source;
}

function itemMatches(item, filters) {
  return sourceMatches(item, filters.source || "all")
    && (!filters.category || item.type === filters.category)
    && (!filters.year || publishedYear(item) === Number(filters.year));
}

async function post(pathname, q, filters = {}, { page = 1, pageSize = 12 } = {}) {
  const waitMs = Math.max(0, minimumIntervalMs - (Date.now() - lastRequestStartedAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestStartedAt = Date.now();
  const startedAt = Date.now();
  const { response, body } = await requestBoundedAuditJson(new URL(pathname, baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Keskkonnaportaali-praktika-filter-audit/1.0",
    },
    body: JSON.stringify({ q, filters, page, page_size: pageSize }),
    signal: AbortSignal.timeout(20_000),
  }, { label: "Filter audit response" });
  return { status: response.status, body, durationMs: Date.now() - startedAt };
}

function listingContract(id, result, filters, { nonempty = true, answer = false } = {}) {
  const listing = answer ? result.body?.searchResults : result.body;
  const items = listing?.items || [];
  check(result.status === 200, "filter request did not return HTTP 200", { id, status: result.status });
  check(Array.isArray(items), "filter response has no item array", { id });
  check(items.every((item) => itemMatches(item, filters)), "a result escaped the selected filters", { id });
  check(nonempty ? items.length > 0 : items.length === 0, "filtered result emptiness was unexpected", {
    id,
    itemCount: items.length,
  });
  check(Number(listing?.pageCount || 0) === Math.ceil(Number(listing?.total || 0) / Number(listing?.pageSize || 12)),
    "pageCount does not match filtered total", { id });
  check(JSON.stringify(listing?.appliedFilters || {}) === JSON.stringify({
    source: filters.source || "all",
    category: filters.category || "",
    year: filters.year ? Number(filters.year) : null,
    sort: filters.sort || "relevance",
  }), "server did not echo the normalized applied filters", { id, appliedFilters: listing?.appliedFilters });
  if (answer) {
    const visibleUrls = new Set(items.map((item) => canonicalResultUrl(item.url)));
    check((result.body?.sources || []).every((source) => visibleUrls.has(canonicalResultUrl(source.url))),
      "AI answer cited a source outside the filtered result set", { id });
  }
}

const durations = [];
for (const item of sourceCases) {
  const result = await post("/api/search/results", item.q, { source: item.source });
  durations.push(result.durationMs);
  listingContract(item.id, result, { source: item.source }, { nonempty: item.nonempty });
}
for (const item of categoryCases) {
  const result = await post("/api/search/results", item.q, { category: item.category });
  durations.push(result.durationMs);
  listingContract(item.id, result, { category: item.category });
}
for (const item of yearCases) {
  const result = await post("/api/search/results", item.q, { year: item.year });
  durations.push(result.durationMs);
  listingContract(item.id, result, { year: item.year });
}
for (const q of sortQueries) {
  for (const sort of ["relevance", "newest"]) {
    const id = `sort-${sort}-${q}`;
    // The first lookup may discover and asynchronously persist a previously
    // unseen official result. Measure ordering stability only after that
    // deliberate refresh boundary, then require identical consecutive pages.
    const warmup = await post("/api/search/results", q, { sort }, { pageSize: 10 });
    durations.push(warmup.durationMs);
    const first = await post("/api/search/results", q, { sort }, { pageSize: 10 });
    const second = await post("/api/search/results", q, { sort }, { pageSize: 10 });
    durations.push(first.durationMs, second.durationMs);
    listingContract(id, first, { sort });
    const firstIds = (first.body?.items || []).map((item) => item.id);
    const repeatedIds = (second.body?.items || []).map((item) => item.id);
    check(JSON.stringify(firstIds) === JSON.stringify(repeatedIds), "sort order is not stable across identical requests", { id });
    check(new Set(firstIds).size === firstIds.length, "sorted page contains duplicate IDs", { id });
  }
}
for (const item of combinedCases) {
  const filters = { source: item.source, category: item.category, year: item.year };
  const result = await post("/api/search", item.q, filters);
  durations.push(result.durationMs);
  listingContract(item.id, result, filters, { answer: true });
}

const paginationFirst = await post("/api/search/results", "mets", { source: "official" }, { page: 1, pageSize: 10 });
const paginationSecond = await post("/api/search/results", "mets", { source: "official" }, { page: 2, pageSize: 10 });
const paginationRepeat = await post("/api/search/results", "mets", { source: "official" }, { page: 1, pageSize: 10 });
durations.push(paginationFirst.durationMs, paginationSecond.durationMs, paginationRepeat.durationMs);
const firstIds = (paginationFirst.body?.items || []).map((item) => item.id);
const secondIds = (paginationSecond.body?.items || []).map((item) => item.id);
check(paginationFirst.status === 200 && paginationSecond.status === 200 && paginationRepeat.status === 200,
  "pagination request failed");
check(firstIds.length === 10 && secondIds.length === 10, "pagination returned an incomplete page");
check(firstIds.every((id) => !secondIds.includes(id)), "filtered pages overlap");
check(JSON.stringify(firstIds) === JSON.stringify((paginationRepeat.body?.items || []).map((item) => item.id)),
  "filtered first page is not stable");
check(paginationFirst.body?.total === paginationSecond.body?.total, "filtered total changed between pages");

durations.sort((left, right) => left - right);
const percentile = (fraction) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * fraction) - 1)] || null;
const report = {
  baseUrl: baseUrl.origin,
  evaluatedAt: new Date().toISOString(),
  requestCount: durations.length,
  matrix: {
    source: sourceCases.length,
    category: categoryCases.length,
    year: yearCases.length,
    sort: sortQueries.length,
    combined: combinedCases.length,
  },
  checks: { passed: checks - failures.length, total: checks },
  latencyMs: { p50: percentile(0.5), p95: percentile(0.95), max: durations.at(-1) || null },
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
