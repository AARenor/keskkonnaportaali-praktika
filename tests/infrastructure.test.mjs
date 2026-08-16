import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertSafeDatabaseUrl, sanitizeCachedResponse } from "../server/database.mjs";
import { parseLlmJson, resolveLlmTarget, validateGroundedAnswer } from "../server/llm.mjs";
import { isSearchCacheEnabled, publicResponse, settleWithinDeadline } from "../server/pipeline.mjs";
import { composeSearchResponse } from "../server/search.mjs";
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

test("legacy exhausted free-model configuration migrates to the bounded Go target", () => {
  assert.deepEqual(resolveLlmTarget("https://opencode.ai/zen/v1", "deepseek-v4-flash-free"), {
    baseUrl: "https://opencode.ai/zen/go/v1",
    model: "gpt-5.6-luna",
  });
  assert.deepEqual(resolveLlmTarget("https://example.invalid/v1", "operator-choice"), {
    baseUrl: "https://example.invalid/v1",
    model: "operator-choice",
  });
});

test("LLM validation rejects invented and cross-cited measurements", () => {
  const draft = {
    answer: {
      title: "Metsamaa näitaja",
      intro: "2024. aastal oli metsamaad 2,3506 miljonit hektarit.",
      introCitations: [1],
      parts: [{ title: "Teine näitaja", text: "Teises tabelis oli 999,9 miljonit tm.", citations: [2] }],
      note: "Kontrollitud märkus.",
    },
    sources: [
      { citation: 1, title: "Metsamaa", content: "2024. aastal oli metsamaad 2,3506 miljonit hektarit." },
      { citation: 2, title: "Tagavara", content: "Teises tabelis oli 999,9 miljonit tm." },
    ],
  };

  const valid = validateGroundedAnswer({
    intro: "2024. aastal oli metsamaad 2,3506 miljonit hektarit. [1]",
    intro_citations: [1],
    parts: [],
    note: "Väljamõeldud märkus.",
  }, draft, "Kui palju metsamaad on?");
  assert.equal(valid.note, "Kontrollitud märkus.");
  assert.doesNotMatch(valid.intro, /\[1\]/u);

  assert.throws(() => validateGroundedAnswer({
    intro: "2024. aastal oli metsamaad 999,9 miljonit tm.",
    intro_citations: [1],
    parts: [],
  }, draft, "Kui palju metsamaad on?"), /ungrounded numeric claim/);
  assert.throws(() => validateGroundedAnswer({
    intro: "Kõik Eesti metsad on täiesti terved.",
    intro_citations: [1],
    parts: [],
  }, draft, "Kuidas metsadel läheb?"), /not sufficiently supported/);

  const polarityDraft = {
    answer: {
      title: "Metsamaa kaitse",
      intro: "Metsamaa ei ole täielikult kaitstud.",
      introCitations: [1],
      parts: [],
      note: "",
    },
    sources: [{ citation: 1, title: "Kaitse", content: "Metsamaa ei ole täielikult kaitstud." }],
  };
  assert.throws(() => validateGroundedAnswer({
    intro: "Metsamaa on täielikult kaitstud.",
    intro_citations: [1],
    parts: [],
  }, polarityDraft, "Kas metsamaa on kaitstud?"), /reverses the polarity/);
});

test("hydrated source text stays internal and public output uses an allowlist", () => {
  const draft = composeSearchResponse("vesi", [{
    id: "source-1",
    title: "Veeseire",
    organization: "Keskkonnaagentuur",
    type: "Ametlik leht",
    published: "2026",
    url: "https://keskkonnaportaal.ee/et/vesi",
    tags: ["vesi"],
    summary: "Avalik kokkuvõte.",
    content: "Täispikk serverisisene tõenditekst.",
    excerpt: "Otsingukaardi väljavõte.",
    retrieval: "live-discovery",
    stale: false,
    score: 20,
  }]);
  assert.match(draft.sources[0].content, /Täispikk/);
  const visible = publicResponse(draft);
  assert.equal(visible.evidence, undefined);
  assert.equal(visible.sources[0].content, undefined);
  assert.equal(visible.sources[0].excerpt, undefined);
  assert.equal(visible.sources[0].retrieval, undefined);
  assert.equal(visible.sources[0].stale, undefined);
});

test("global deadline returns a controlled fallback and aborts remaining work", async () => {
  const controller = new AbortController();
  const result = await settleWithinDeadline(new Promise(() => {}), 20, { status: "fallback" }, controller);
  assert.deepEqual(result, { status: "fallback" });
  assert.equal(controller.signal.aborted, true);
});

test("cached responses never retain raw query text", () => {
  assert.deepEqual(sanitizeCachedResponse({ query: "minu aadress", total: 1, sources: [] }), { total: 1, sources: [] });
  assert.equal(isSearchCacheEnabled("false"), false);
  assert.equal(isSearchCacheEnabled("true"), true);
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
