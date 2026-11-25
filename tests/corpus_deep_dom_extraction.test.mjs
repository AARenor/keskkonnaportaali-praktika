import assert from "node:assert/strict";
import test from "node:test";
import { extractReadablePage } from "../server/corpus_document_parsing.mjs";

const DEEP_TEXT = "Sügav leht sisaldab piisavalt pikka teksti, et seda saaks korralikult tsiteerida.";

function deepPage(depth) {
  const open = "<div>".repeat(depth);
  const close = "</div>".repeat(depth);
  return `<html><head><title>Sügav leht</title></head><body><main>`
    + `<div class="field--name-body">${open}<p>${DEEP_TEXT}</p>${close}</div>`
    + `</main></body></html>`;
}

test("readable extraction survives a deeply nested publisher page", () => {
  const result = extractReadablePage(deepPage(12_000), "https://example.ee/deep");
  assert.ok(result.content.includes(DEEP_TEXT), result.content.slice(0, 200));
  assert.equal(result.title, "Sügav leht");
});

test("readable extraction still removes hidden and nosnippet text", () => {
  const html = `<html><head><title>Tavaline leht</title></head><body><main>`
    + `<div class="field--name-body"><p>${DEEP_TEXT}</p>`
    + `<div hidden>PEIDETUD TEKST</div><div data-nosnippet>VÄLJA JÄETUD TEKST</div>`
    + `</div></main></body></html>`;
  const result = extractReadablePage(html, "https://example.ee/normal");
  assert.ok(result.content.includes(DEEP_TEXT));
  assert.ok(!result.content.includes("PEIDETUD TEKST"));
  assert.ok(!result.content.includes("VÄLJA JÄETUD TEKST"));
});
