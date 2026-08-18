import test from "node:test";
import assert from "node:assert/strict";
import { parseSearchStreamLine, readSearchStream } from "../src/search-stream.js";

function streamedResponse(chunks, init = { status: 200 }) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), init);
}

test("progressive search delivers fragmented results, draft and final answer in order", async () => {
  const events = [];
  const response = streamedResponse([
    '{"type":"results","search',
    'Results":{"items":[{"id":"one"}]}}\n{"type":"draft","result":',
    '{"answer":{"title":"Esialgne"}}}\n',
    '{"type":"answer","result":{"answer":{"title":"Lõplik"}}}\n',
  ]);

  await readSearchStream(response, (event) => events.push(event));

  assert.deepEqual(events.map((event) => event.type), ["results", "draft", "answer"]);
  assert.equal(events[0].searchResults.items[0].id, "one");
  assert.equal(events[1].result.answer.title, "Esialgne");
  assert.equal(events[2].result.answer.title, "Lõplik");
});

test("progressive search rejects malformed and unknown events", async () => {
  assert.throws(
    () => parseSearchStreamLine('{"type":"telemetry","secret":"no"}'),
    /tundmatu vahetulemuse/u,
  );
  await assert.rejects(
    readSearchStream(streamedResponse(['{"type":"results"}\n']), () => undefined),
    /vahetulemus on vigane/u,
  );
});

test("progressive search requires a final answer", async () => {
  await assert.rejects(
    readSearchStream(streamedResponse(['{"type":"results","searchResults":{"items":[]}}\n']), () => undefined),
    /lõppvastus jäi saabumata/u,
  );
});

test("progressive search treats the answer as terminal", async () => {
  const delivered = [];
  await assert.rejects(
    readSearchStream(streamedResponse([
      '{"type":"results","searchResults":{"items":[]}}\n',
      '{"type":"answer","result":{"answer":{"title":"Lõplik"}}}\n',
      '{"type":"draft","result":{"answer":{"title":"Vananenud"}}}\n',
    ]), (event) => delivered.push(event.type)),
    /vales järjekorras/u,
  );
  assert.deepEqual(delivered, ["results", "answer"]);
});

test("progressive search bounds buffered data and preserves server errors", async () => {
  await assert.rejects(
    readSearchStream(streamedResponse(["x".repeat(2_000_001)]), () => undefined),
    /liiga mahukas/u,
  );
  const errorResponse = new Response(JSON.stringify({ error: "Päring on vigane." }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
  await assert.rejects(readSearchStream(errorResponse, () => undefined), /Päring on vigane/u);
});
