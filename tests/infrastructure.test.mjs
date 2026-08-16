import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertSafeDatabaseUrl } from "../server/database.mjs";
import { parseLlmJson } from "../server/llm.mjs";
import { localEmbedding } from "../server/qdrant.mjs";

test("PostgreSQL guard accepts a dedicated database and rejects Chatwoot", () => {
  assert.equal(
    assertSafeDatabaseUrl("postgresql://practice:secret@postgres:5432/keskkonnaportaal_practice"),
    true,
  );
  assert.throws(
    () => assertSafeDatabaseUrl("postgresql://chatwoot:secret@postgres:5432/chatwoot"),
    /dedicated non-Chatwoot/,
  );
});

test("local Qdrant embedding is deterministic and normalized", () => {
  const first = localEmbedding("Eesti metsade seisund");
  const second = localEmbedding("Eesti metsade seisund");
  assert.equal(first.length, 256);
  assert.deepEqual(first, second);
  const magnitude = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(magnitude - 1) < 1e-9);
});

test("LLM JSON parser repairs common truncated punctuation without executing content", () => {
  const parsed = parseLlmJson('```json\n{"parts":[{"text":"Tõend", "citations":[1]}], "confidence":"kõrge",}\n```');
  assert.equal(parsed.parts[0].text, "Tõend");
  assert.deepEqual(parsed.parts[0].citations, [1]);
});

test("public page uses the complete Terrapoint application and permits only its frame origin", async () => {
  const [app, server] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../server/index.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(app, /data-testid="terrapoint-embed"/);
  assert.match(app, /src="https:\/\/terrapoint\.ee\/"/);
  assert.doesNotMatch(app.match(/function TerrapointSection[\s\S]*?function EventsSection/)?.[0] || "", /src="\/embed\/terrapoint"/);
  assert.match(server, /frame-src 'self' https:\/\/www\.openstreetmap\.org https:\/\/terrapoint\.ee/);
});
