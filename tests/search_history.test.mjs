import test from "node:test";
import assert from "node:assert/strict";
import { createSearchHistory, searchHistoryCacheKey } from "../src/search_history.js";

const base = {
  query: "metsateatise esitamine",
  filters: { source: "official", category: "guide", year: 2025, sort: "newest" },
  page: 2,
  pageSize: 12,
  queryRevision: "query-r4",
  windowId: "window-9",
  sourceRevision: "sources-r8",
  indexRevision: "index-r3",
  policyVersion: "policy-r2",
};

test("history restores the selected page, answer, filters, and scroll without conversation data", () => {
  let now = 1_000;
  const history = createSearchHistory({ now: () => now });
  const id = history.createId();
  const snapshot = {
    ...base,
    listing: { page: 2, pageSize: 12, items: [{ id: "second-page" }] },
    result: { answer: { title: "Metsateatis", intro: "Esita teatis enne raiet." } },
    scrollY: 840,
    listingNotice: "n".repeat(600),
    turns: [{ question: "Private chat question", result: { answer: { intro: "Private answer" } } }],
  };

  history.create(id, snapshot);
  const restored = history.restore(id);

  assert.equal(restored.query, base.query);
  assert.deepEqual(restored.filters, base.filters);
  assert.equal(restored.page, 2);
  assert.deepEqual(restored.listing.items, [{ id: "second-page" }]);
  assert.equal(restored.result.answer.title, "Metsateatis");
  assert.equal(restored.listingNotice.length, 500);
  assert.equal(restored.scrollY, 840);
  assert.equal(Object.hasOwn(restored, "turns"), false);
  now += 1;
  assert.equal(history.restore(id).query, base.query);
});

test("cache identity includes query, filters, page, revisions, and policy version", () => {
  const original = searchHistoryCacheKey(base);
  const changes = [
    { query: "lageraie" },
    { filters: { ...base.filters, year: 2024 } },
    { page: 1 },
    { pageSize: 24 },
    { queryRevision: "query-r5" },
    { windowId: "window-10" },
    { sourceRevision: "sources-r9" },
    { indexRevision: "index-r4" },
    { policyVersion: "policy-r3" },
  ];

  for (const change of changes) {
    assert.notEqual(searchHistoryCacheKey({ ...base, ...change }), original, JSON.stringify(change));
  }
});
test("identical search keys keep separate tab entries and scroll positions", () => {
  const history = createSearchHistory();
  const first = history.createId();
  const second = history.createId();
  const snapshot = {
    ...base,
    listing: { page: 2, pageSize: 12, items: [{ id: "same-results" }] },
    result: { answer: { title: "Sama vastus", intro: "Sama sisu." } },
  };

  history.create(first, { ...snapshot, scrollY: 120 });
  history.create(second, { ...snapshot, scrollY: 780 });

  assert.equal(searchHistoryCacheKey(history.restore(first)), searchHistoryCacheKey(history.restore(second)));
  assert.equal(history.restore(first).scrollY, 120);
  assert.equal(history.restore(second).scrollY, 780);
  history.updateScroll(first, 360);
  assert.equal(history.restore(first).scrollY, 360);
  assert.equal(history.restore(second).scrollY, 780);
});


test("history expires old snapshots and keeps only the configured number", () => {
  let now = 0;
  const history = createSearchHistory({ now: () => now, ttlMs: 100, maxEntries: 2 });
  const first = history.createId();
  history.create(first, { ...base, page: 1 });
  now = 1;
  const second = history.createId();
  history.create(second, { ...base, query: "mets" });
  now = 2;
  const third = history.createId();
  history.create(third, { ...base, query: "metsateatis" });

  assert.equal(history.update(first, { ...base, query: "revived" }), null);
  assert.equal(history.restore(first), null);
  assert.equal(history.restore(second).query, "mets");
  assert.equal(history.restore(third).query, "metsateatis");
  now = 50;
  assert.ok(history.update(third, { ...base, query: "updated" }));
  assert.equal(history.restore(third).query, "updated");
  now = 101;
  assert.equal(history.update(second, { ...base, query: "late update" }), null);
  assert.equal(history.restore(second), null);
  now = 102;
  assert.equal(history.update(third, { ...base, query: "late update" }), null);
  assert.equal(history.restore(third), null);
  assert.equal(history.size, 0);
});
