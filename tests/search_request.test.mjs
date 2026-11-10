import test from "node:test";
import assert from "node:assert/strict";
import * as searchRequest from "../src/search_request.js";

test("a malformed follow-up response remains a retryable error", async () => {
  const response = new Response("{broken", { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(async () => searchRequest.readFollowUpResponse(response), /Jätkuküsimuse vastus oli vigane/u);
});

test("a follow-up without an answer does not become a completed turn", async () => {
  const response = new Response("{}", { status: 200 });
  await assert.rejects(async () => searchRequest.readFollowUpResponse(response), /Jätkuküsimuse vastus oli vigane/u);
});

test("a failed follow-up preserves the server error", async () => {
  const response = new Response('{"error":"Päringute piir on täis."}', { status: 429 });
  await assert.rejects(async () => searchRequest.readFollowUpResponse(response), /Päringute piir on täis/u);
});

test("a valid follow-up keeps its answer and cited source", async () => {
  const response = new Response('{"answer":{"title":"Metsaregister"},"sources":[{"citation":1,"url":"https://example.org/"}]}');
  const result = await searchRequest.readFollowUpResponse(response);
  assert.equal(result.answer.title, "Metsaregister");
  assert.equal(result.sources[0].url, "https://example.org/");
});
