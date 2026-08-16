import assert from "node:assert/strict";
import test from "node:test";
import { normalize, searchEnvironment } from "../server/search.mjs";

test("normalize handles Estonian diacritics", () => {
  assert.equal(normalize("ÕHUKVALITEET ja jäätmed"), "ohukvaliteet ja jaatmed");
});

test("forest search ranks forest sources and emits citations", () => {
  const result = searchEnvironment("metsade seisund Eestis");
  assert.ok(result.total >= 2);
  assert.equal(result.sources[0].id, "forest-overview");
  assert.ok(result.sources.slice(0, 3).every((source) => source.tags.includes("mets") || source.tags.includes("SMI") || source.tags.includes("looduskaitse")));
  assert.deepEqual(result.answer.parts[0].citations, [1]);
});

test("unknown query returns transparent fallback sources", () => {
  const result = searchEnvironment("xyzzy täpsustamata päring");
  assert.equal(result.total, 0);
  assert.equal(result.answer.confidence, "madal");
  assert.equal(result.sources.length, 3);
});

test("search input is capped", () => {
  const result = searchEnvironment("m".repeat(500));
  assert.equal(result.query.length, 180);
});
