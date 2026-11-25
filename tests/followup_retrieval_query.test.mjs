import assert from "node:assert/strict";
import test from "node:test";
import { buildLlmRequest } from "../server/llm_prompt.mjs";
import { searchEnvironmentLive } from "../server/pipeline.mjs";
import {
  conversationContext,
  contextualRetrievalQuery,
} from "../server/retrieval_context.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval_ranking.mjs";
import { officialServiceCatalogueDocuments } from "../server/search_catalogue.mjs";

const SELECTED_MODEL = "test-model";
const ROOT = "Kui palju metsamaad on Eestis?";
const FOLLOW_UP = "Selgita seda";

function payloadFor(options) {
  const body = buildLlmRequest({ selectedModel: SELECTED_MODEL, ...options }).body;
  return JSON.parse(body.input[1].content[0].text);
}

test("a short follow-up keeps the minimized question and inherits the root directive", () => {
  const retrievalQuery = contextualRetrievalQuery(ROOT, FOLLOW_UP, []);
  assert.match(retrievalQuery, /Kui palju metsamaad on Eestis\?/u);

  const payload = payloadFor({ query: FOLLOW_UP, retrievalQuery });
  assert.equal(payload.question, FOLLOW_UP);
  assert.equal(payload.conversation_context, undefined);
  assert.match(payload.intent_directive, /metsamaa hulka/iu);
  assert.match(payload.intent_directive, /Vasta küsitud arvuga/iu);
  assert.equal(payload.evidence.length, 0);

  const bare = payloadFor({ query: FOLLOW_UP });
  assert.doesNotMatch(bare.intent_directive, /metsamaa hulka/iu);
});

test("a private-person follow-up still throws before a prompt is built", () => {
  const privateQuestion = "Kus elab Jaan Tamm?";
  assert.throws(
    () => payloadFor({ query: privateQuestion, retrievalQuery: `${privateQuestion} ${ROOT}` }),
    (error) => error?.code === "PRIVATE_PERSON_LLM_QUERY",
  );
});

test("the follow-up pipeline sends the canonical retrieval query to the answer generator", async () => {
  const retrievalQuery = contextualRetrievalQuery(ROOT, FOLLOW_UP, []);
  const documents = officialServiceCatalogueDocuments();
  const items = rankPublicSearchCandidates(retrievalQuery, documents, { intentDocuments: documents }).slice(0, 12);
  let captured;

  await searchEnvironmentLive(FOLLOW_UP, {
    startedAt: Date.now(),
    deadlineAt: Date.now() + 9_000,
    useCache: false,
    assessmentQuery: retrievalQuery,
    retrievalQuery,
    rootContext: ROOT,
    conversationContext: conversationContext(ROOT, []),
    allowSafeEllipticalFollowUp: true,
    onDraft: () => {},
    searchResults: { total: items.length, items },
    recordSearch: async () => ({ status: "disabled" }),
    generateAnswer: async (query, draft, options) => {
      captured = { query, retrievalQuery: options.retrievalQuery };
      return { answer: null, acceptedClaims: [], attempt: {} };
    },
  });

  assert.ok(captured, "the answer generator must run for this fixture");
  assert.equal(captured.query, FOLLOW_UP);
  assert.equal(captured.retrievalQuery, retrievalQuery);

  const payload = payloadFor({
    query: captured.query,
    retrievalQuery: captured.retrievalQuery,
    conversationContext: conversationContext(ROOT, []),
  });
  assert.equal(payload.question, FOLLOW_UP);
  assert.match(payload.intent_directive, /metsamaa hulka/iu);
  assert.ok(!payload.evidence.some((entry) => String(entry.content || "").includes(ROOT)));
});
