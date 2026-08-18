import assert from "node:assert/strict";
import test from "node:test";
import {
  articleText,
  readBoundedResponseText,
  validatedOfficialUrl,
} from "../server/integrations.mjs";

test("official fetch targets reject non-HTTPS and off-list redirect destinations", () => {
  assert.equal(
    validatedOfficialUrl("/et/mets", "https://keskkonnaportaal.ee/").toString(),
    "https://keskkonnaportaal.ee/et/mets",
  );
  assert.throws(() => validatedOfficialUrl("http://keskkonnaportaal.ee/et/mets"), /allowlist/u);
  assert.throws(() => validatedOfficialUrl("https://example.com/collect"), /allowlist/u);
});

test("chunked upstream bodies are stopped at the byte limit", async () => {
  const accepted = new Response("õhk", { headers: { "content-type": "text/plain" } });
  assert.equal(await readBoundedResponseText(accepted, 8), "õhk");

  const oversized = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("123"));
      controller.enqueue(new TextEncoder().encode("456"));
      controller.close();
    },
  }));
  await assert.rejects(readBoundedResponseText(oversized, 5), /too large/u);

  const declaredOversized = new Response("ok", { headers: { "content-length": "99" } });
  await assert.rejects(readBoundedResponseText(declaredOversized, 5), /too large/u);
});

test("hydrated article text restores spacing between adjacent styled sentences", () => {
  const text = articleText(`
    <main><article><p><span>Esimene lause.</span><strong>Teine lause!</strong><span>„Kolmas lause.”</span></p></article></main>
  `);
  assert.equal(text, "Esimene lause. Teine lause! „Kolmas lause.”");
});
