import assert from "node:assert/strict";
import test from "node:test";
import {
  asksForImpact,
  asksForPreciseQuantity,
  multiSourceSynthesisDocuments,
} from "../server/search_evidence.mjs";
import { assessSearchQuery } from "../server/search_query_assessment.mjs";
import { buildLlmRequest } from "../server/llm_prompt.mjs";
import {
  isRetryableLlmProviderFailure,
  resolveLlmModelChain,
} from "../server/provider-policy.mjs";

function source(id, overrides = {}) {
  const key = String(id);
  return {
    id: key,
    citation: Number(key.replace(/\D+/gu, "")) || 1,
    title: `Allikas ${key}`,
    url: `https://keskkonnaportaal.ee/${key}`,
    sourceTier: "official",
    evidencePolicy: "public",
    content: "Metsaraie mõjutab metsade seisundit ja elupaiku. Raieliik ja selle ulatus määravad, kui suur on mõju loodusele ning kui kaua ökosüsteem taastub. Lisaks muudab raie puistu struktuuri, mullaomadusi ja liigikoosseisu, mistõttu tuleb mõju hinnata iga kaitseala ja elupaiga tüübi kaupa eraldi.",
    ...overrides,
  };
}

test("model chain keeps order, drops blanks and duplicates", () => {
  assert.deepEqual(
    resolveLlmModelChain("primary/model", "fallback/one, fallback/two, primary/model, "),
    ["primary/model", "fallback/one", "fallback/two"],
  );
  assert.deepEqual(resolveLlmModelChain("primary/model", ""), ["primary/model"]);
});

test("provider failures retry only when another model could answer", () => {
  assert.equal(isRetryableLlmProviderFailure({ status: 429 }), true);
  assert.equal(isRetryableLlmProviderFailure({ status: 402 }), true);
  assert.equal(isRetryableLlmProviderFailure({ status: 503 }), true);
  assert.equal(isRetryableLlmProviderFailure({ status: 404 }), true);
  assert.equal(isRetryableLlmProviderFailure(new Error("usage_limit_reached")), true);
  assert.equal(isRetryableLlmProviderFailure({ status: 400 }), false);
  assert.equal(isRetryableLlmProviderFailure(new Error("request aborted")), false);
});

test("quantity and year questions stay on the strict evidence path", () => {
  assert.equal(asksForPreciseQuantity("kui palju on raiemaht"), true);
  assert.equal(asksForPreciseQuantity("kui palju on Eestis metsa"), true);
  assert.equal(asksForPreciseQuantity("metsaraie 2024"), true);
  assert.equal(asksForPreciseQuantity("metsaraie mõju loodusele"), false);
  assert.equal(asksForImpact("metsaraie mõju loodusele"), true);
  assert.equal(asksForImpact("mis on metsaraie"), false);
});

test("synthesis needs three content-bearing official documents", () => {
  const query = "metsaraie mõju loodusele";
  assert.equal(multiSourceSynthesisDocuments(query, [source(1), source(2)]), null);
  const documents = multiSourceSynthesisDocuments(query, [source(1), source(2), source(3)]);
  assert.equal(documents.length, 3);
  assert.deepEqual(documents.map((document) => document.id), ["1", "2", "3"]);
});

test("law sections and route-only cards never become synthesis evidence", () => {
  const query = "metsaraie mõju loodusele";
  const documents = multiSourceSynthesisDocuments(query, [
    source(1),
    source(2),
    source(3, { _lawSection: true }),
    source(4, { url: "https://www.riigiteataja.ee/akt/MS#para10" }),
    source(5, { evidencePolicy: "route-only" }),
    source(6, { sourceTier: "secondary" }),
    source(7, { content: "Lühike." }),
    source(8),
  ]);
  assert.deepEqual(documents.map((document) => document.id), ["1", "2", "8"]);
});

test("a definition question about a broad topic is answerable instead of a clarification", () => {
  assert.equal(assessSearchQuery("mis on elurikkus").kind, "answerable");
  assert.equal(assessSearchQuery("vesi").kind, "needs-clarification");
});

test("synthesis asks the model for a multi-source overview", () => {
  const request = buildLlmRequest({
    selectedModel: "test/model",
    query: "metsaraie mõju loodusele",
    evidence: [{ citation: 1, title: "Allikas", content: "Metsaraie mõjutab metsade seisundit.", source_type: "official" }],
    synthesisIntent: "multi-source-synthesis",
  });
  const payload = JSON.parse(request.body.input[1].content[0].text);
  assert.match(payload.intent_directive, /terviklik ülevaade/);
  assert.match(payload.intent_directive, /nimetab küsimuse subjekti/);
});
