import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { rankSearchCandidates } from "../server/retrieval.mjs";
import { assessSearchQuery, officialServiceCatalogueDocuments } from "../server/search.mjs";

const fixture = JSON.parse(await readFile(
  new URL("../evaluation/open_search_adversarial_v2.json", import.meta.url),
  "utf8",
));
const documents = [...fixture.distractors, ...officialServiceCatalogueDocuments()];
const now = Date.parse("2026-08-19T12:00:00Z");

test("open environmental intents beat plausible recent-news distractors", () => {
  for (const item of fixture.cases.filter((candidate) => candidate.expectedTop)) {
    const ranked = rankSearchCandidates(item.query, documents, { now });
    assert.equal(ranked[0]?.id, item.expectedTop, item.query);
  }
});

test("mixed, unknown and underspecified open queries ask before synthesizing", () => {
  for (const item of fixture.cases) {
    assert.equal(assessSearchQuery(item.query).kind, item.expectedRoute, item.query);
  }
});
