import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { canonicalResultUrl, rankSearchCandidates } from "../server/retrieval.mjs";
import { officialServiceCatalogueDocuments } from "../server/search.mjs";

const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/u, "").split("=");
  return [key, rest.join("=") || true];
}));
const datasetText = await readFile(new URL("../evaluation/environment_search_holdout_v1.json", import.meta.url), "utf8");
const dataset = JSON.parse(datasetText);
const now = Date.parse("2026-08-18T00:00:00Z");
const documents = officialServiceCatalogueDocuments();
const documentById = new Map(documents.map((document) => [document.id, document]));
const unknownSourceIds = dataset.cases
  .map((item) => item.topSource)
  .filter((id) => !documentById.has(id));
if (unknownSourceIds.length) {
  throw new Error(`Holdout references unknown source IDs: ${[...new Set(unknownSourceIds)].join(", ")}`);
}
const baseUrl = options["base-url"] ? new URL(String(options["base-url"])) : null;
if (baseUrl && (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password)) {
  throw new Error("--base-url must be an HTTP(S) origin without credentials");
}
const minimumIntervalMs = Math.max(0, Math.min(Number(options["interval-ms"]) || 3_200, 10_000));

function round(value) {
  return Number(value.toFixed(4));
}

function rankFor(item) {
  const ranked = rankSearchCandidates(item.query, documents, { now });
  const index = ranked.findIndex((source) => source.id === item.topSource);
  return {
    id: item.id,
    expected: item.topSource,
    actual: ranked[0]?.id || null,
    rank: index < 0 ? null : index + 1,
  };
}

const cases = dataset.cases.map(rankFor);
const total = cases.length;
const precisionAt1 = cases.filter((item) => item.rank === 1).length / total;
const mrr = cases.reduce((sum, item) => sum + (item.rank ? 1 / item.rank : 0), 0) / total;
const ndcgAt5 = cases.reduce((sum, item) => (
  sum + (item.rank && item.rank <= 5 ? 1 / Math.log2(item.rank + 1) : 0)
), 0) / total;
const failures = cases.filter((item) => item.rank !== 1);
const metrics = (items) => ({
  precisionAt1: round(items.filter((item) => item.rank === 1).length / items.length),
  mrr: round(items.reduce((sum, item) => sum + (item.rank ? 1 / item.rank : 0), 0) / items.length),
  ndcgAt5: round(items.reduce((sum, item) => (
    sum + (item.rank && item.rank <= 5 ? 1 / Math.log2(item.rank + 1) : 0)
  ), 0) / items.length),
});

let live = null;
if (baseUrl) {
  const liveCases = [];
  let lastRequestStartedAt = 0;
  for (const item of dataset.cases) {
    const waitMs = Math.max(0, minimumIntervalMs - (Date.now() - lastRequestStartedAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestStartedAt = Date.now();
    const startedAt = Date.now();
    let response;
    let body = null;
    let error = null;
    try {
      response = await fetch(new URL("/api/search", baseUrl), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Keskkonnaportaali-praktika-holdout/1.0",
        },
        body: JSON.stringify({ q: item.query }),
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      body = await response.json();
    } catch (cause) {
      error = cause.name;
    }
    const ranked = body?.searchResults?.items || [];
    const expectedUrl = canonicalResultUrl(documentById.get(item.topSource)?.url || "");
    // Live discovery may merge the same canonical page under an upstream ID.
    // Qrels describe the source page, not an implementation-specific ID.
    const index = ranked.findIndex((source) => canonicalResultUrl(source.url) === expectedUrl);
    liveCases.push({
      id: item.id,
      expected: item.topSource,
      expectedUrl,
      actual: ranked[0]?.id || body?.sources?.[0]?.id || null,
      actualUrl: canonicalResultUrl(ranked[0]?.url || body?.sources?.[0]?.url || ""),
      rank: index < 0 ? null : index + 1,
      status: response?.status || null,
      durationMs: Date.now() - startedAt,
      error,
    });
  }
  const durations = liveCases.map((item) => item.durationMs).sort((left, right) => left - right);
  live = {
    baseUrl: baseUrl.origin,
    ...metrics(liveCases),
    latencyMs: {
      p50: durations[Math.ceil(durations.length * 0.5) - 1],
      p95: durations[Math.ceil(durations.length * 0.95) - 1],
      max: durations.at(-1),
    },
    failures: liveCases.filter((item) => item.status !== 200 || item.rank !== 1),
  };
}
const result = {
  dataset: dataset.version,
  datasetHash: createHash("sha256").update(datasetText).digest("hex"),
  createdAt: dataset.createdAt,
  evaluatedAt: new Date().toISOString(),
  cases: total,
  precisionAt1: round(precisionAt1),
  mrr: round(mrr),
  ndcgAt5: round(ndcgAt5),
  gates: dataset.gates,
  failures,
  live,
};

console.log(JSON.stringify(result, null, 2));

if (precisionAt1 < dataset.gates.precisionAt1
  || mrr < dataset.gates.mrr
  || ndcgAt5 < dataset.gates.ndcgAt5
  || (live && (live.precisionAt1 < dataset.gates.precisionAt1
    || live.mrr < dataset.gates.mrr
    || live.ndcgAt5 < dataset.gates.ndcgAt5
    || live.failures.length))) {
  process.exitCode = 1;
}
