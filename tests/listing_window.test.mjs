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
test("page two requires the exact cached query, filters, revision, and window ID", () => {
  const cache = createListingWindowCache({ ttlMs: 1_000, now: () => 0 });
  const key = listingWindowKey(keyParts);
  const window = { windowId: "window-r1", rankedIds: ["first", "second"] };
  cache.set(key, window);

  assert.equal(getBoundListingWindow(cache, { ...keyParts, windowId: "window-r1" }), window);
  assert.equal(getBoundListingWindow(cache, keyParts), null);
  assert.equal(getBoundListingWindow(cache, { ...keyParts, query: "mida loetakse metsaks", windowId: "window-r1" }), null);
  assert.equal(getBoundListingWindow(cache, {
    ...keyParts,
    filters: { ...keyParts.filters, category: "Õigusakt" },
    windowId: "window-r1",
  }), null);
  assert.equal(getBoundListingWindow(cache, { ...keyParts, revision: "corpus-r2", windowId: "window-r1" }), null);
  assert.equal(getBoundListingWindow(cache, { ...keyParts, windowId: "window-other" }), null);
});

test("listing window cache expires entries and invalidates late writes after refresh", () => {
  let now = 0;
  const cache = createListingWindowCache({ ttlMs: 100, maxEntries: 2, now: () => now });
  const key = listingWindowKey(keyParts);
  const generation = cache.generation();
  cache.set(key, { ids: ["1", "2"] }, { expectedGeneration: generation });
  assert.deepEqual(cache.get(key), { ids: ["1", "2"] });

  now = 100;
  assert.equal(cache.get(key), null);
  cache.set(key, { ids: ["stale"] }, { expectedGeneration: generation });
  cache.clear();
  cache.set(key, { ids: ["late stale write"] }, { expectedGeneration: generation });
  assert.equal(cache.get(key), null);
});

test("a corpus refresh invalidates sibling retrieval windows and late writes", () => {
  const corpusCache = createListingWindowCache({ now: () => 0 });
  const retrievalCache = createListingWindowCache({ now: () => 0 });
  const key = listingWindowKey(keyParts);
  const generation = retrievalCache.generation();
  retrievalCache.set(key, { ids: ["stale"] }, { expectedGeneration: generation });

  corpusCache.clear();

  assert.equal(retrievalCache.get(key), null);
  assert.equal(retrievalCache.set(key, { ids: ["late stale"] }, { expectedGeneration: generation }), false);
  assert.equal(retrievalCache.set(key, { ids: ["fresh"] }), true);
});

test("default listing retention spans answer generation and normal reading", () => {
  let now = 0;
  const cache = createListingWindowCache({ now: () => now });
  const key = listingWindowKey(keyParts);
  const window = { ids: ["first", "second"] };
  cache.set(key, window);

  now = 285_000 + 600_000 - 1;
  assert.equal(cache.get(key), window);
  assert.equal(LISTING_WINDOW_TTL_MS, 900_000);
  now = LISTING_WINDOW_TTL_MS;
  assert.equal(cache.get(key), null);
});

test("listing window cache evicts the least recently used bounded entry", () => {
  const cache = createListingWindowCache({ ttlMs: 1_000, maxEntries: 2, now: () => 0 });
  const first = listingWindowKey({ ...keyParts, query: "esimene" });
  const second = listingWindowKey({ ...keyParts, query: "teine" });
  const third = listingWindowKey({ ...keyParts, query: "kolmas" });
  cache.set(first, { ids: ["1"] });
  cache.set(second, { ids: ["2"] });
  assert.deepEqual(cache.get(first), { ids: ["1"] });
  cache.set(third, { ids: ["3"] });
  assert.equal(cache.get(second), null);
  assert.deepEqual(cache.get(first), { ids: ["1"] });
  assert.deepEqual(cache.get(third), { ids: ["3"] });
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
