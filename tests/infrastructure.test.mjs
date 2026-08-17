import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertSafeDatabaseUrl, sanitizeCachedResponse } from "../server/database.mjs";
import {
  parseLlmJson,
  resolveLlmTarget,
  resolveLlmTimeout,
  resolveMaxTokens,
  validateGroundedAnswer,
} from "../server/llm.mjs";
import {
  createPortalDraft,
  isSearchCacheEnabled,
  publicResponse,
  settleWithinDeadline,
  shouldGenerateGroundedAnswer,
} from "../server/pipeline.mjs";
import { assessSearchQuery, composeScopeResponse, composeSearchResponse } from "../server/search.mjs";
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
    model: "deepseek-v4-flash",
  });
  assert.deepEqual(resolveLlmTarget("https://example.invalid/v1", "operator-choice"), {
    baseUrl: "https://example.invalid/v1",
    model: "operator-choice",
  });
  assert.equal(resolveMaxTokens("deepseek-v4-flash", 700), 1_000);
  assert.equal(resolveMaxTokens("operator-choice", 700), 700);
  assert.equal(resolveLlmTimeout("deepseek-v4-flash", 9_500), 12_000);
  assert.equal(resolveLlmTimeout("operator-choice", 9_500), 9_500);
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

test("single-source model output can recover an omitted citation only after grounding", () => {
  const draft = {
    answer: {
      title: "Rehvide põletamine",
      intro: "Rehve ei tohi lõkkes põletada.",
      introCitations: [1],
      parts: [],
      note: "Kontrolli algallikat.",
    },
    sources: [{ citation: 1, title: "Jäätmete põletamine", answer: "Rehve ei tohi lõkkes põletada." }],
  };
  const recovered = validateGroundedAnswer({
    intro: "Rehve ei tohi lõkkes põletada.",
    intro_citations: [],
    parts: [],
  }, draft, "Kas rehve tohib põletada?");
  assert.deepEqual(recovered.introCitations, [1]);
  assert.throws(() => validateGroundedAnswer({
    intro: "Rehve võib lõkkes põletada.",
    intro_citations: [],
    parts: [],
  }, draft, "Kas rehve tohib põletada?"), /reverses the polarity/);
});

test("reviewed official-source fallback is an answer with a citation, not a generic failure", async () => {
  const draft = await createPortalDraft("Kas Eestis tohib vanu rehve põletada?", {
    deadlineAt: Date.now() + 500,
    signal: new AbortController().signal,
  });
  assert.equal(draft.answer.eyebrow, "Kontrollitud koondvastus");
  assert.match(draft.answer.intro, /ei kuulu lõkkesse|ei tohi/u);
  assert.deepEqual(draft.answer.introCitations, [1]);
  assert.equal(draft.sources[0].id, "waste-burning-guidance");
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
    answer: "Serverisisene kontrollitud väide.",
    content: "Täispikk serverisisene tõenditekst.",
    excerpt: "Otsingukaardi väljavõte.",
    retrieval: "live-discovery",
    stale: false,
    score: 20,
  }]);
  assert.match(draft.sources[0].content, /Täispikk/);
  assert.match(draft.sources[0].answer, /kontrollitud/);
  const visible = publicResponse(draft);
  assert.equal(visible.evidence, undefined);
  assert.equal(visible.sources[0].content, undefined);
  assert.equal(visible.sources[0].answer, undefined);
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

test("LLM is eligible only for a strong portal evidence contract", () => {
  assert.equal(shouldGenerateGroundedAnswer({
    sources: [{ id: "official" }],
    evidence: { kind: "portal-discovery", answerable: true },
  }), true);
  assert.equal(shouldGenerateGroundedAnswer({
    sources: [{ id: "reviewed" }],
    evidence: { kind: "reviewed-official-source", answerable: true },
  }), true);
  for (const draft of [
    composeScopeResponse("miks kassid nurruvad", assessSearchQuery("miks kassid nurruvad")),
    composeScopeResponse("vesi", assessSearchQuery("vesi")),
    { sources: [{ id: "weak" }], evidence: { kind: "insufficient-evidence", answerable: false } },
    { sources: [], evidence: { kind: "portal-discovery", answerable: true } },
  ]) assert.equal(shouldGenerateGroundedAnswer(draft), false);
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

test("mobile header reuses the home search instead of rendering a second form", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const header = app.match(/function Header[\s\S]*?function Hero/)?.[0] || "";
  assert.doesNotMatch(header, /<SearchForm/u);
  assert.doesNotMatch(app, /mobile-search-panel/u);
  assert.match(header, /onRevealSearch/u);
  assert.match(app, /homeSearchInputRef/u);
});
