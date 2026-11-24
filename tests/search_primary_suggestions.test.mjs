import test from "node:test";
import assert from "node:assert/strict";

import {
  PRIMARY_SEARCH_SUGGESTIONS,
  REVIEWED_SEARCH_SUGGESTIONS,
  primarySuggestionsForValue,
  suggestionsForValue,
} from "../src/search-suggestions.js";

test("the empty search box offers the six primary reviewed questions", () => {
  const items = primarySuggestionsForValue("");
  assert.equal(items.length, 6);
  assert.deepEqual(items.map((item) => item.value), PRIMARY_SEARCH_SUGGESTIONS.slice(0, 6));
  assert.ok(items.every((item) => item.count === null));
});

test("every primary suggestion belongs to the reviewed set", () => {
  const reviewed = new Set(REVIEWED_SEARCH_SUGGESTIONS);
  for (const suggestion of PRIMARY_SEARCH_SUGGESTIONS) {
    assert.ok(reviewed.has(suggestion), `${suggestion} is not reviewed`);
  }
});

test("one typed letter filters the primary list instead of hiding it", () => {
  const items = primarySuggestionsForValue("met");
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.value.toLocaleLowerCase("et").includes("met")));
  assert.deepEqual(primarySuggestionsForValue("zzz"), []);
});

test("the primary list respects a caller limit", () => {
  assert.equal(primarySuggestionsForValue("", 3).length, 3);
});

test("the remote list still requires a real query and a matching response", () => {
  const remote = { query: "mets", items: [{ value: "Metsateatis", count: 3 }] };
  assert.deepEqual(suggestionsForValue("", remote), []);
  assert.deepEqual(suggestionsForValue("mets", remote), [{ value: "Metsateatis", count: 3 }]);
});
