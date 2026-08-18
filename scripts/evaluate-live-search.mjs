import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { canonicalResultUrl } from "../server/retrieval.mjs";
import { hasCompleteSentenceEnding } from "../server/search.mjs";

const argumentsMap = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/u, "").split("=");
  return [key, rest.join("=") || true];
}));
const baseUrl = new URL(String(argumentsMap["base-url"] || "http://127.0.0.1:4317"));
if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
  throw new Error("--base-url must be an HTTP(S) origin without credentials");
}
const minimumIntervalMs = Math.max(0, Math.min(Number(argumentsMap["interval-ms"]) || 3_200, 10_000));
const dataset = JSON.parse(await readFile(
  new URL("../evaluation/environment_search_queries_v1.json", import.meta.url),
  "utf8",
));
const qrels = dataset.cases.filter((item) => item.topSource);
const failures = [];
const queryResults = [];
let checks = 0;
let failedChecks = 0;
let lastRequestStartedAt = 0;

function check(condition, message, context = {}) {
  checks += 1;
  if (!condition) {
    failedChecks += 1;
    failures.push({ message, ...context });
  }
}

async function request(pathname, parameters = {}) {
  const waitMs = Math.max(0, minimumIntervalMs - (Date.now() - lastRequestStartedAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  const url = new URL(pathname, baseUrl);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  lastRequestStartedAt = Date.now();
  const startedAt = Date.now();
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Keskkonnaportaali-praktika-live-eval/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return {
    status: response.status,
    durationMs: Date.now() - startedAt,
    hash: createHash("sha256").update(text).digest("hex"),
    body,
  };
}

function answerCitations(body) {
  return [
    ...(body?.answer?.introCitations || []),
    ...(body?.answer?.parts || []).flatMap((part) => part.citations || []),
  ];
}

function assertPublicContract(item, result) {
  const body = result.body;
  check(result.status === 200, "search did not return HTTP 200", { id: item.id, status: result.status });
  check(Boolean(body && Array.isArray(body.sources) && Array.isArray(body.searchResults?.items)),
    "search response is not the expected JSON contract", { id: item.id });
  if (!body) return;
  check(result.durationMs <= 15_500, "search exceeded the public application budget", {
    id: item.id,
    durationMs: result.durationMs,
  });
  check(hasCompleteSentenceEnding(body.answer?.intro), "answer introduction ends with an incomplete sentence", {
    id: item.id,
  });
  for (const [partIndex, part] of (body.answer?.parts || []).entries()) {
    check(hasCompleteSentenceEnding(part?.text), "answer part ends with an incomplete sentence", {
      id: item.id,
      partIndex,
    });
  }
  const visibleUrls = new Set((body.searchResults?.items || []).map((source) => canonicalResultUrl(source.url)));
  for (const source of body.sources || []) {
    check(visibleUrls.has(canonicalResultUrl(source.url)), "answer source is outside the visible result snapshot", {
      id: item.id,
      sourceId: source.id,
    });
    for (const forbidden of ["content", "stale", "_ranking", "_relevance", "score"]) {
      check(!(forbidden in source), "answer source leaks an internal field", {
        id: item.id,
        sourceId: source.id,
        field: forbidden,
      });
    }
  }
  const citations = answerCitations(body);
  for (const citation of citations) {
    check(Number.isInteger(citation) && citation >= 1 && citation <= (body.sources || []).length,
      "answer contains an unresolved citation", { id: item.id, citation });
  }
  check(!("llmStatus" in body) && !("provider" in body) && !("evidence" in body),
    "public response leaks backend provenance", { id: item.id });
}

for (const item of qrels) {
  let result;
  try {
    result = await request("/api/search", { q: item.query });
  } catch (error) {
    failures.push({ id: item.id, message: "search request failed", error: error.name });
    continue;
  }
  assertPublicContract(item, result);
  const actual = result.body?.sources?.[0]?.id || null;
  check(actual === item.topSource, "unexpected rank-one source", {
    id: item.id,
    expected: item.topSource,
    actual,
  });
  queryResults.push({
    id: item.id,
    status: result.status,
    durationMs: result.durationMs,
    hash: result.hash,
    expectedTopSource: item.topSource,
    topSource: actual,
  });
}

const firstPage = await request("/api/search/results", {
  q: "mets",
  page: 1,
  page_size: 10,
  source: "official",
});
const secondPage = await request("/api/search/results", {
  q: "mets",
  page: 2,
  page_size: 10,
  source: "official",
});
const firstIds = (firstPage.body?.items || []).map((item) => item.id);
const secondIds = (secondPage.body?.items || []).map((item) => item.id);
check(firstPage.status === 200 && secondPage.status === 200, "pagination request failed", {
  firstStatus: firstPage.status,
  secondStatus: secondPage.status,
});
check(firstIds.length === 10 && secondIds.length === 10, "pagination returned an incomplete page", {
  firstCount: firstIds.length,
  secondCount: secondIds.length,
});
check((firstPage.body?.items || []).every((item) => item.sourceTier === "official")
  && (secondPage.body?.items || []).every((item) => item.sourceTier === "official"),
"official filter leaked another source tier");
check(firstIds.every((id) => !secondIds.includes(id)), "result pages overlap");

const zeroResult = await request("/api/search", { q: "mets", category: "__eval-no-result__" });
check(zeroResult.status === 200, "zero-result filter did not return a controlled response", { status: zeroResult.status });
check((zeroResult.body?.searchResults?.items || []).length === 0
  && (zeroResult.body?.sources || []).length === 0
  && answerCitations(zeroResult.body).length === 0,
"zero-result filter produced hidden evidence or citations");

const invalidFilter = await request("/api/search", { q: "mets", year: 1900 });
check(invalidFilter.status === 400, "invalid year was silently ignored", { status: invalidFilter.status });

const durations = queryResults.map((item) => item.durationMs).sort((left, right) => left - right);
const report = {
  baseUrl: baseUrl.origin,
  evaluatedAt: new Date().toISOString(),
  datasetVersion: dataset.version,
  qrels: {
    passed: queryResults.filter((item) => item.topSource === item.expectedTopSource).length,
    total: qrels.length,
  },
  checks: { passed: checks - failedChecks, total: checks },
  latencyMs: durations.length ? {
    p50: durations[Math.floor(durations.length * 0.5)],
    p95: durations[Math.floor(durations.length * 0.95)],
    max: durations.at(-1),
  } : null,
  pageHashes: { first: firstPage.hash, second: secondPage.hash },
  queries: queryResults,
  failures,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
