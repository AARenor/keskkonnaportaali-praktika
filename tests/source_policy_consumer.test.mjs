import assert from "node:assert/strict";
import test from "node:test";
import { extractReadablePage } from "../server/corpus.mjs";

test("publisher-excluded page text does not enter a stored source body", () => {
  const page = extractReadablePage(
    '<main><h1>Forest</h1><article><p>Visible source text.</p><p data-nosnippet>Private excerpt marker.</p></article></main>',
    "https://keskkonnaportaal.ee/et/teemad/mets",
  );
  assert.match(page.content, /Visible source text/u);
  assert.doesNotMatch(page.content, /Private excerpt marker/u);
});
