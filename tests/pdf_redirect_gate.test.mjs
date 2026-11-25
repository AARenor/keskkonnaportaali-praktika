import assert from "node:assert/strict";
import test from "node:test";
import { hydrateCorpusPdfSource } from "../server/corpus_hydration.mjs";

test("PDF batch hydration gives the byte transport the destination robots gate", async () => {
  let observed = null;
  await hydrateCorpusPdfSource("https://keskkonnaportaal.ee/report.pdf", {
    robotsObservation: {
      status: "allowed",
      origin: "https://keskkonnaportaal.ee",
      checkedAt: new Date().toISOString(),
    },
    requestBytes: async (url, options) => {
      observed = { url, hook: typeof options.assertRedirectAllowed };
      return { status: 200, url, headers: { "content-type": "text/plain" }, body: Buffer.alloc(0) };
    },
  });

  assert.equal(observed?.url, "https://keskkonnaportaal.ee/report.pdf");
  assert.equal(observed?.hook, "function");
});
