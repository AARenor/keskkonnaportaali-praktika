import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { buildCorpusFanoutQueries, searchCorpusFanout } from "../server/corpus_fanout.mjs";


test("buildCorpusFanoutQueries caps discovery at three subqueries", () => {
  const queries = buildCorpusFanoutQueries("metsa ülevaade", { limit: 99 });
  assert.equal(queries.length, 3);
});

test("privacy blocked queries produce no corpus fanout subqueries", () => {
  assert.deepEqual(buildCorpusFanoutQueries("Kus elab Jaan Tamm?", { limit: 3 }), []);
});

test("foreign script queries produce no corpus fanout subqueries", () => {
  assert.deepEqual(buildCorpusFanoutQueries("mets Eestis 中文", { limit: 3 }), []);
});

test("fanout core has no live provider or network import", () => {
  const source = readFileSync(new URL("../server/corpus_fanout.mjs", import.meta.url), "utf8");
  for (const forbidden of [
    "integrations.mjs",
    "retrieval.mjs",
    "pipeline.mjs",
    "llm.mjs",
    "corpus_fetch.mjs",
    "node:http",
    "node:https",
    "undici",
    "openai",
    "fetch(",
    "searchOfficialSites",
    "searchEnvironmentLive",
    "generateGroundedAnswer",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("searchCorpusFanout calls only the injected reader with bound page options", async () => {
  const calls = [];
  const injected = async (subquery, options) => {
    calls.push({ subquery, options });
    return { status: "ready", items: [], rankedWindow: [] };
  };
  const filters = { source: "official" };
  const deadlineAt = Date.now() + 60_000;
  const controller = new AbortController();

  const result = await searchCorpusFanout("metsa ülevaade", {
    filters,
    deadlineAt,
    signal: controller.signal,
    searchCorpusImpl: injected,
  });

  assert.deepEqual(calls.map((call) => call.subquery), [
    "metsa ülevaade",
    "eesti metsamaa pindala smi",
    "eesti metsade seisund smi ülevaade",
  ]);
  assert.deepEqual(calls[0].options, {
    page: 1,
    pageSize: 50,
    includeContent: true,
    preferSnapshot: false,
    returnRankedWindow: true,
    filters,
    signal: controller.signal,
    deadlineAt,
  });
  assert.deepEqual(result.statuses.map((entry) => entry.status), ["ready", "ready", "ready"]);
});

test("searchCorpusFanout deduplicates documents from overlapping ranked windows", async () => {
  const first = { id: "corpus-1", url: "https://example.ee/metsa", title: "Mets", content: "A" };
  const second = { id: "corpus-2", url: "https://example.ee/raie", title: "Raie", content: "B" };
  const injected = async (_subquery, _options) => ({
    status: "ready",
    items: [first, second],
    rankedWindow: [first, second],
  });

  const result = await searchCorpusFanout("metsa ülevaade", { searchCorpusImpl: injected });

  assert.deepEqual(result.documents, [first, second]);
  assert.equal(new Set(result.documents.map((document) => document.url)).size, 2);
});

test("searchCorpusFanout stops before an expired deadline", async () => {
  const calls = [];
  const injected = async (subquery) => {
    calls.push(subquery);
    return { status: "ready", items: [], rankedWindow: [] };
  };

  const result = await searchCorpusFanout("metsa ülevaade", {
    deadlineAt: Date.now() - 1,
    searchCorpusImpl: injected,
  });

  assert.equal(calls.length, 0);
  assert.equal(result.subqueries.length, 3);
  assert.deepEqual(result.documents, []);
  assert.deepEqual(result.statuses.map((entry) => entry.status), ["skipped", "skipped", "skipped"]);
});

test("searchCorpusFanout stops before an aborted signal", async () => {
  const calls = [];
  const injected = async (subquery) => {
    calls.push(subquery);
    return { status: "ready", items: [], rankedWindow: [] };
  };
  const controller = new AbortController();
  controller.abort();

  const result = await searchCorpusFanout("metsa ülevaade", {
    signal: controller.signal,
    searchCorpusImpl: injected,
  });

  assert.equal(calls.length, 0);
  assert.deepEqual(result.documents, []);
  assert.deepEqual(result.statuses.map((entry) => entry.status), ["skipped", "skipped", "skipped"]);
});

test("forest-only mode drops non-forest fanout queries", () => {
  const previous = process.env.ALL_ENVIRONMENT_SEARCH_ENABLED;
  delete process.env.ALL_ENVIRONMENT_SEARCH_ENABLED;
  try {
    assert.deepEqual(buildCorpusFanoutQueries("mis on ringmajandus", { limit: 3 }), []);
    assert.ok(buildCorpusFanoutQueries("metsa ülevaade", { limit: 3 }).length > 0);
  } finally {
    if (previous === undefined) delete process.env.ALL_ENVIRONMENT_SEARCH_ENABLED;
    else process.env.ALL_ENVIRONMENT_SEARCH_ENABLED = previous;
  }
});

test("fanout statuses contain indexes instead of raw subquery text", async () => {
  const injected = async () => ({ status: "ready", items: [], rankedWindow: [] });
  const result = await searchCorpusFanout("metsa ülevaade", { searchCorpusImpl: injected });

  assert.deepEqual(result.statuses, [
    { index: 0, status: "ready" },
    { index: 1, status: "ready" },
    { index: 2, status: "ready" },
  ]);
  const serialized = JSON.stringify(result.statuses);
  for (const subquery of result.subqueries) assert.equal(serialized.includes(subquery), false);
});

test("fanout drops documents that fail public source or filter guards", async () => {
  const allowed = {
    id: "corpus-1",
    url: "https://keskkonnaportaal.ee/mets",
    sourceTier: "official",
    title: "Mets",
    content: "A",
  };
  const blockedSource = {
    id: "corpus-2",
    url: "https://www.stat.ee/raie",
    organization: "Statistikaamet",
    sourceTier: "official",
    title: "Raie",
    content: "B",
  };
  const wrongTier = {
    id: "corpus-3",
    url: "https://keskkonnaportaal.ee/vesi",
    sourceTier: "supplementary",
    title: "Vesi",
    content: "C",
  };
  const injected = async () => ({
    status: "ready",
    items: [allowed, blockedSource, wrongTier],
    rankedWindow: [allowed, blockedSource, wrongTier],
  });

  const result = await searchCorpusFanout("metsa ülevaade", {
    filters: { source: "official" },
    searchCorpusImpl: injected,
  });

  assert.deepEqual(result.documents, [allowed]);
});
