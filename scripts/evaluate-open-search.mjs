import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { rankSearchCandidates } from "../server/retrieval.mjs";
import { assessSearchQuery, composeScopeResponse, officialServiceCatalogueDocuments } from "../server/search.mjs";

const datasetUrl = new URL("../evaluation/open_search_adversarial_v2.json", import.meta.url);
const dataset = JSON.parse(await readFile(datasetUrl, "utf8"));
const documents = [...dataset.distractors, ...officialServiceCatalogueDocuments()];
const now = Date.parse("2026-08-19T12:00:00Z");

function dcg(gains) {
  return gains.reduce((total, gain, index) => total + ((2 ** gain) - 1) / Math.log2(index + 2), 0);
}

const rows = [];
for (const item of dataset.cases) {
  const assessment = assessSearchQuery(item.query);
  const route = assessment.kind;
  const ranked = rankSearchCandidates(item.query, documents, { now });
  const gains = new Map(item.qrels.map((qrel) => [qrel.id, qrel.gain]));
  const relevant = new Set(gains.keys());
  const firstRelevant = ranked.findIndex((document) => relevant.has(document.id));
  const observedGains = ranked.slice(0, 5).map((document) => gains.get(document.id) || 0);
  const idealGains = [...gains.values()].sort((left, right) => right - left).slice(0, 5);
  const idealDcg = dcg(idealGains);
  rows.push({
    id: item.id,
    query: item.query,
    expectedRoute: item.expectedRoute,
    route,
    expectedTop: item.expectedTop || null,
    top: ranked[0]?.id || null,
    abstentionNoSources: item.qrels.length || route === "answerable"
      ? null
      : composeScopeResponse(item.query, assessment).sources.length === 0,
    reciprocalRank: relevant.size && firstRelevant >= 0 ? 1 / (firstRelevant + 1) : null,
    ndcgAt5: relevant.size ? (idealDcg ? dcg(observedGains) / idealDcg : 1) : null,
    recallAt5: relevant.size
      ? ranked.slice(0, 5).filter((document) => relevant.has(document.id)).length / relevant.size
      : null,
  });
}

const rankingRows = rows.filter((row) => row.expectedTop);
const average = (key) => rankingRows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rankingRows.length;
const metrics = {
  routeAccuracy: rows.filter((row) => row.route === row.expectedRoute).length / rows.length,
  primaryAt1: rankingRows.filter((row) => row.top === row.expectedTop).length / rankingRows.length,
  mrr: average("reciprocalRank"),
  ndcgAt5: average("ndcgAt5"),
  recallAt5: average("recallAt5"),
  abstentionNoSources: rows
    .filter((row) => row.abstentionNoSources !== null)
    .every((row) => row.abstentionNoSources) ? 1 : 0,
};

console.log(`Dataset: ${fileURLToPath(datasetUrl)}`);
console.log(`Status: ${dataset.status}`);
console.table(rows.map(({ reciprocalRank, ndcgAt5, recallAt5, ...row }) => ({
  ...row,
  rr: reciprocalRank === null ? "-" : reciprocalRank.toFixed(3),
  ndcg5: ndcgAt5 === null ? "-" : ndcgAt5.toFixed(3),
  recall5: recallAt5 === null ? "-" : recallAt5.toFixed(3),
})));
console.log(Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, Number(value.toFixed(4))])));

const failed = Object.entries(dataset.thresholds).filter(([key, threshold]) => metrics[key] < threshold);
if (failed.length) {
  console.error("Failed gates:", failed.map(([key, threshold]) => `${key} < ${threshold}`).join(", "));
  process.exitCode = 1;
}
