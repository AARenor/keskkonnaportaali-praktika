import assert from "node:assert/strict";
import test from "node:test";
import {
  createListingWindowCache,
  getBoundListingWindow,
  listingWindowKey,
  LISTING_WINDOW_TTL_MS,
  pageListingWindow,
} from "../server/listing_window.mjs";

const keyParts = {
  query: "mida loetakse lageraieks",
  filters: { source: "official", category: "Juhend", year: 2025, sort: "relevance" },
  revision: "corpus-19:ready:policy-v2",
  includeContent: true,
  excludeUrls: [],
};

test("listing window keys keep the full query, filters, and corpus revision distinct", () => {
  const base = listingWindowKey(keyParts);
  assert.notEqual(listingWindowKey({ ...keyParts, query: "mida loetakse metsaks" }), base);
  assert.notEqual(listingWindowKey({ ...keyParts, filters: { ...keyParts.filters, category: "Õigusakt" } }), base);
  assert.notEqual(listingWindowKey({ ...keyParts, revision: "corpus-20:ready:policy-v2" }), base);
  assert.notEqual(listingWindowKey({ ...keyParts, excludeUrls: ["https://keskkonnaportaal.ee/et/mets"] }), base);
  assert.equal(listingWindowKey({ ...keyParts, filters: { ...keyParts.filters } }), base);
});
test("page two binds query, filters, content mode, exclusions, and ID but ignores revision", () => {
  const cache = createListingWindowCache({ ttlMs: 1_000, now: () => 0 });
  const window = { windowId: "window-r1", queryRevision: "corpus-r1", rankedIds: ["first", "second"] };
  assert.equal(cache.setWindow(keyParts, window), true);

  assert.equal(getBoundListingWindow(cache, { ...keyParts, windowId: "window-r1" }), window);
  assert.equal(getBoundListingWindow(cache, { ...keyParts, revision: "corpus-r2", windowId: "window-r1" }), window);
  assert.equal(getBoundListingWindow(cache, { ...keyParts, windowId: "window-other" }), null);
  assert.equal(getBoundListingWindow(cache, { ...keyParts, query: "mida loetakse metsaks", windowId: "window-r1" }), null);
  assert.equal(getBoundListingWindow(cache, {
    ...keyParts,
    filters: { ...keyParts.filters, category: "Õigusakt" },
    windowId: "window-r1",
  }), null);
  assert.equal(getBoundListingWindow(cache, { ...keyParts, includeContent: false, windowId: "window-r1" }), null);
  assert.equal(getBoundListingWindow(cache, {
    ...keyParts,
    excludeUrls: ["https://keskkonnaportaal.ee/et/mets"],
    windowId: "window-r1",
  }), null);
});

test("page two exclusion order is canonical and distinct snapshots never overwrite", () => {
  const cache = createListingWindowCache({ ttlMs: 1_000, now: () => 0 });
  const excluded = { ...keyParts, excludeUrls: ["https://example.ee/b", "https://example.ee/a"] };
  const first = { windowId: "window-r1", queryRevision: "corpus-r1", rankedIds: ["old"] };
  const second = { windowId: "window-r2", queryRevision: "corpus-r2", rankedIds: ["new"] };

  assert.equal(cache.setWindow(excluded, first), true);
  assert.equal(cache.setWindow({ ...excluded, revision: "corpus-r2" }, second), true);
  assert.equal(cache.setWindow(excluded, { ...first, rankedIds: ["replacement"] }), false);
  assert.equal(getBoundListingWindow(cache, {
    ...excluded,
    excludeUrls: [...excluded.excludeUrls].reverse(),
    revision: "corpus-r3",
    windowId: first.windowId,
  }), first);
  assert.equal(getBoundListingWindow(cache, { ...excluded, windowId: second.windowId }), second);
  assert.deepEqual(first.rankedIds, ["old"]);
});

test("listing window expiry prunes its lookup index", () => {
  let now = 0;
  const cache = createListingWindowCache({ ttlMs: 100, maxEntries: 2, now: () => now });
  const window = { windowId: "window-r1", queryRevision: "corpus-r1" };
  cache.setWindow(keyParts, window);

  now = 100;
  assert.equal(getBoundListingWindow(cache, { ...keyParts, windowId: window.windowId }), null);
  assert.equal(cache.size, 0);
  assert.equal(cache.setWindow(keyParts, window), true);
});

test("listing window cache expires entries and invalidates late writes after refresh", () => {
  let now = 0;
  const cache = createListingWindowCache({ ttlMs: 100, maxEntries: 2, now: () => now });
  const window = { windowId: "window-r1", queryRevision: "corpus-r1", ids: ["1", "2"] };
  const generation = cache.generation();
  assert.equal(cache.setWindow(keyParts, window, { expectedGeneration: generation }), true);
  assert.equal(getBoundListingWindow(cache, { ...keyParts, windowId: window.windowId }), window);

  now = 100;
  assert.equal(getBoundListingWindow(cache, { ...keyParts, windowId: window.windowId }), null);
  assert.equal(cache.setWindow(keyParts, { ...window, windowId: "stale" }, { expectedGeneration: generation }), true);
  cache.clear();
  assert.equal(cache.setWindow(keyParts, { ...window, windowId: "late-stale" }, { expectedGeneration: generation }), false);
  assert.equal(getBoundListingWindow(cache, { ...keyParts, windowId: "late-stale" }), null);
});

test("a corpus refresh invalidates sibling retrieval windows and late writes", () => {
  const corpusCache = createListingWindowCache({ now: () => 0 });
  const retrievalCache = createListingWindowCache({ now: () => 0 });
  const generation = retrievalCache.generation();
  const window = { windowId: "window-r1", queryRevision: "corpus-r1", ids: ["stale"] };
  assert.equal(retrievalCache.setWindow(keyParts, window, { expectedGeneration: generation }), true);

  corpusCache.clear();

  assert.equal(getBoundListingWindow(retrievalCache, { ...keyParts, windowId: window.windowId }), null);
  assert.equal(retrievalCache.setWindow(keyParts, { ...window, windowId: "late-stale" }, { expectedGeneration: generation }), false);
  assert.equal(retrievalCache.setWindow(keyParts, { ...window, windowId: "fresh" }), true);
});

test("benign discovery or hydration refreshes corpus lookup without expiring a retained page", () => {
  const corpusCache = createListingWindowCache({ now: () => 0 });
  const retrievalCache = createListingWindowCache({ now: () => 0 });
  const generation = retrievalCache.generation();
  const freshness = corpusCache.freshness();
  const window = { windowId: "retained", queryRevision: "old", ids: ["first", "second"] };
  corpusCache.set("fresh-query", { ids: ["old"] });
  retrievalCache.setWindow(keyParts, window, { expectedGeneration: generation });

  corpusCache.clearFreshness();
  assert.equal(corpusCache.get("fresh-query"), null);
  assert.equal(corpusCache.set("fresh-query", { ids: ["stale"] }, { expectedFreshness: freshness }), false);
  assert.equal(getBoundListingWindow(retrievalCache, { ...keyParts, revision: "new", windowId: "retained" }), window);
  assert.equal(retrievalCache.setWindow(keyParts, { ...window, windowId: "later" }, { expectedGeneration: generation }), true);
});

test("default listing retention spans answer generation and normal reading", () => {
  let now = 0;
  const cache = createListingWindowCache({ now: () => now });
  const window = { windowId: "window-r1", queryRevision: "corpus-r1", ids: ["first", "second"] };
  cache.setWindow(keyParts, window);

  now = 285_000 + 600_000 - 1;
  assert.equal(getBoundListingWindow(cache, { ...keyParts, windowId: window.windowId }), window);
  assert.equal(LISTING_WINDOW_TTL_MS, 900_000);
  now = LISTING_WINDOW_TTL_MS;
  assert.equal(getBoundListingWindow(cache, { ...keyParts, windowId: window.windowId }), null);
});

test("listing window cache evicts the least recently used bounded entry and prunes its index", () => {
  const cache = createListingWindowCache({ ttlMs: 1_000, maxEntries: 2, now: () => 0 });
  const firstOptions = { ...keyParts, query: "esimene" };
  const secondOptions = { ...keyParts, query: "teine" };
  const thirdOptions = { ...keyParts, query: "kolmas" };
  const first = { windowId: "window-1", ids: ["1"] };
  const second = { windowId: "window-2", ids: ["2"] };
  const third = { windowId: "window-3", ids: ["3"] };
  cache.setWindow(firstOptions, first);
  cache.setWindow(secondOptions, second);
  assert.equal(getBoundListingWindow(cache, { ...firstOptions, windowId: first.windowId }), first);
  cache.setWindow(thirdOptions, third);
  assert.equal(getBoundListingWindow(cache, { ...secondOptions, windowId: second.windowId }), null);
  assert.equal(getBoundListingWindow(cache, { ...firstOptions, windowId: first.windowId }), first);
  assert.equal(getBoundListingWindow(cache, { ...thirdOptions, windowId: third.windowId }), third);
});

test("listing window pages preserve rank order and expose only the first two pages", () => {
  const ranked = Array.from({ length: 128 }, (_value, index) => ({ id: `item-${index + 1}` }));
  const first = pageListingWindow(ranked, { page: 1, pageSize: 12, total: 200, totalRelation: "eq" });
  const second = pageListingWindow(ranked, { page: 2, pageSize: 12, total: 200, totalRelation: "eq" });
  const third = pageListingWindow(ranked, { page: 3, pageSize: 12, total: 200, totalRelation: "eq" });

  assert.deepEqual(first.items.map((item) => item.id), Array.from({ length: 12 }, (_value, index) => `item-${index + 1}`));
  assert.deepEqual(second.items.map((item) => item.id), Array.from({ length: 12 }, (_value, index) => `item-${index + 13}`));
  assert.equal(first.pageCount, 2);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
  assert.equal(first.truncated, true);
  assert.deepEqual(third.items, []);
  const secondByOffset = pageListingWindow(ranked, {
    page: 1, pageSize: 12, offset: 12, total: 200, totalRelation: "eq",
  });
  assert.deepEqual(secondByOffset.items, second.items);
  assert.equal(secondByOffset.hasMore, false);
  assert.equal(third.hasMore, false);

  const unknownTotal = pageListingWindow(ranked.slice(0, 1), {
    page: 1, pageSize: 12, total: 1, totalRelation: "gte",
  });
  assert.equal(unknownTotal.truncated, true);
  const underfilled = pageListingWindow(ranked.slice(0, 8), {
    page: 1, pageSize: 12, total: 200, totalRelation: "eq",
  });
  assert.equal(underfilled.pageCount, 1);
  assert.equal(underfilled.hasMore, false);
  assert.equal(underfilled.truncated, true);
});
