import test from "node:test";
import assert from "node:assert/strict";
import { fetchSearchStream, parseSearchStreamLine, readSearchStream } from "../src/search-stream.js";

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

test("a chart on the final answer event passes the stream parser untouched", () => {
  const chart = { kind: "line", title: "T", unit: "%", series: [{ id: "a", label: "A", points: [{ x: 2020, y: 1 }, { x: 2021, y: 2 }] }], citation: 1 };
  const event = parseSearchStreamLine(JSON.stringify({ type: "answer", result: { answer: { title: "x" }, chart } }));
  assert.deepEqual(event.result.chart, chart);
});


test("search transport retries one transient gateway failure", async () => {
  const calls = [];
  const responses = [
    new Response("bad gateway", { status: 502 }),
    new Response("ok", { status: 200 }),
  ];
  const response = await fetchSearchStream("/api/search/stream", {}, {
    retryDelayMs: 0,
    fetchImpl: async (...args) => {
      calls.push(args);
      return responses.shift();
    },
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
});

test("search transport retries one network failure and preserves aborts", async () => {
  let calls = 0;
  const response = await fetchSearchStream("/api/search/stream", {}, {
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response("ok", { status: 200 });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 2);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    fetchSearchStream("/api/search/stream", { signal: controller.signal }, {
      retryDelayMs: 0,
      fetchImpl: async () => { throw new TypeError("fetch failed"); },
    }),
    /fetch failed/u,
  );
});
