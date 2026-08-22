import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  publicCitationUrl,
  rankOneSearchResultId,
  requestBoundedAuditJson,
  requestBoundedAuditText,
} from "../scripts/audit-http.mjs";

test("live audits rank the listing and inspect the user-visible citation URL", () => {
  const body = {
    searchResults: { items: [{ id: "ranked-first" }, { id: "cited-second" }] },
    sources: [{
      id: "cited-second",
      url: "https://official.example/evidence",
      locator: "Section 4, reviewed table",
    }],
  };
  assert.equal(rankOneSearchResultId(body), "ranked-first");
  assert.equal(publicCitationUrl(body.sources[0]), "https://official.example/evidence");
  assert.equal(rankOneSearchResultId({}), null);
  assert.equal(publicCitationUrl({ locator: "Not a URL" }), null);
});

test("live audit transport refuses redirects and bounds declared and streamed bodies", async () => {
  let observedInit;
  const accepted = await requestBoundedAuditJson("https://audit.example/api", {
    redirect: "follow",
  }, {
    fetchImpl: async (_url, init) => {
      observedInit = init;
      return new Response('{"ok":true}', {
        headers: { "content-length": "11", "content-type": "application/json" },
      });
    },
    maximumBytes: 32,
  });
  assert.equal(observedInit.redirect, "error");
  assert.deepEqual(accepted.body, { ok: true });

  await assert.rejects(requestBoundedAuditText("https://audit.example/declared", {}, {
    fetchImpl: async () => new Response("small", { headers: { "content-length": "99" } }),
    maximumBytes: 8,
  }), /too large/u);

  let cancelled = false;
  const oversizedStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("123456"));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(requestBoundedAuditText("https://audit.example/chunked", {}, {
    fetchImpl: async () => new Response(oversizedStream),
    maximumBytes: 5,
  }), /too large/u);
  assert.equal(cancelled, true);
});

test("every live audit client uses the shared bounded transport", async () => {
  const files = [
    "audit-live-filters.mjs",
    "audit-live-followups.mjs",
    "audit-live-grounding.mjs",
    "evaluate-live-search.mjs",
    "evaluate-relevance-holdout.mjs",
    "load-search.mjs",
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), "utf8");
    assert.match(source, /requestBoundedAudit(?:Json|Text)/u, file);
    assert.doesNotMatch(source, /\bfetch\s*\(/u, file);
    assert.doesNotMatch(source, /response\.(?:arrayBuffer|blob|json|text)\s*\(/u, file);
  }
});
