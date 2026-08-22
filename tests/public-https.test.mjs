import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import test from "node:test";
import {
  createPublicOnlyLookup,
  isPublicIpAddress,
  requestApprovedPublicHttpsJsonPost,
  requestApprovedPublicHttpsText,
  validateApprovedPublicHttpsUrl,
} from "../server/public-https.mjs";
import { AUDIT_CITATION_ORIGINS } from "../scripts/audit-citation-policy.mjs";
import { officialServiceCatalogueDocuments } from "../server/search.mjs";

function mockHttpsRequest(responses, calls) {
  return (url, options, callback) => {
    const request = new EventEmitter();
    let response;
    request.end = (body) => queueMicrotask(() => {
      const spec = responses.shift();
      calls.push({ url: url.toString(), options, body });
      response = spec.stream || Readable.from(spec.chunks || [spec.body || ""]);
      response.statusCode = spec.status;
      response.headers = spec.headers || {};
      callback(response);
    });
    request.destroy = (error) => {
      response?.destroy();
      queueMicrotask(() => request.emit("error", error));
    };
    return request;
  };
}

test("public HTTPS policy rejects local, private, reserved and non-global addresses", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.1",
    "::", "::1", "::ffff:127.0.0.1", "64:ff9b::1", "fc00::1", "fe80::1", "2001:db8::1",
    "2001:2::1", "2001:10::1", "2001:20::1", "2002:7f00:1::1", "3fff::1",
  ]) assert.equal(isPublicIpAddress(address), false, address);
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);

  const origins = new Set(["https://public.example"]);
  assert.equal(
    validateApprovedPublicHttpsUrl("https://public.example/source", origins).toString(),
    "https://public.example/source",
  );
  for (const unsafe of [
    "http://public.example/source",
    "https://user:secret@public.example/source",
    "https://public.example.evil.test/source",
    "https://127.0.0.1/source",
    "https://public.example/source#fragment",
  ]) assert.throws(() => validateApprovedPublicHttpsUrl(unsafe, origins), /Outbound URL/u);
});

test("public-only DNS lookup fails closed when any answer is non-public", async () => {
  const mixedLookup = createPublicOnlyLookup((_hostname, _options, callback) => callback(null, [
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ]));
  await assert.rejects(new Promise((resolve, reject) => mixedLookup("public.example", {}, (error, address) => (
    error ? reject(error) : resolve(address)
  ))), /non-public DNS answer/u);

  const publicLookup = createPublicOnlyLookup((_hostname, _options, callback) => callback(null, [
    { address: "8.8.8.8", family: 4 },
  ]));
  assert.equal(await new Promise((resolve, reject) => publicLookup("public.example", {}, (error, address) => (
    error ? reject(error) : resolve(address)
  ))), "8.8.8.8");
  assert.deepEqual(await new Promise((resolve, reject) => publicLookup("public.example", { all: true }, (error, addresses) => (
    error ? reject(error) : resolve(addresses)
  ))), [{ address: "8.8.8.8", family: 4 }]);
});

test("public HTTPS transport validates every redirect and bounds streamed bytes", async () => {
  const origins = new Set(["https://public.example"]);
  const calls = [];
  const safe = await requestApprovedPublicHttpsText("https://public.example/start", {
    approvedOrigins: origins,
    maximumBytes: 32,
    requestImpl: mockHttpsRequest([
      { status: 302, headers: { location: "/next" } },
      { status: 200, body: "safe evidence", headers: { "content-profile": "apijahiala" } },
    ], calls),
  });
  assert.equal(safe.body, "safe evidence");
  assert.equal(safe.headers["content-profile"], "apijahiala");
  assert.deepEqual(calls.map((call) => call.url), [
    "https://public.example/start",
    "https://public.example/next",
  ]);
  assert.ok(calls.every((call) => call.options.headers["Accept-Encoding"] === "identity"));

  const unsafeCalls = [];
  await assert.rejects(requestApprovedPublicHttpsText("https://public.example/start", {
    approvedOrigins: origins,
    requestImpl: mockHttpsRequest([
      { status: 302, headers: { location: "https://127.0.0.1/private" } },
    ], unsafeCalls),
  }), /approved HTTPS origins/u);
  assert.equal(unsafeCalls.length, 1);

  await assert.rejects(requestApprovedPublicHttpsText("https://public.example/large", {
    approvedOrigins: origins,
    maximumBytes: 8,
    requestImpl: mockHttpsRequest([
      { status: 200, chunks: ["123456", "789"] },
    ], []),
  }), /too large/u);
});

test("public HTTPS transport destroys redirect bodies instead of draining them", async () => {
  let reads = 0;
  let destroyed = false;
  const redirectBody = new Readable({
    read() {
      reads += 1;
      this.push(Buffer.alloc(64 * 1024));
    },
    destroy(error, callback) {
      destroyed = true;
      callback(error);
    },
  });
  const result = await requestApprovedPublicHttpsText("https://public.example/start", {
    approvedOrigins: new Set(["https://public.example"]),
    maximumBytes: 8,
    requestImpl: mockHttpsRequest([
      { status: 302, headers: { location: "/final" }, stream: redirectBody },
      { status: 200, body: "ok" },
    ], []),
  });
  assert.equal(result.body, "ok");
  assert.equal(destroyed, true);
  assert.equal(reads, 0);
});

test("public HTTPS JSON POST pins method, body contract and forbids redirects", async () => {
  const origins = new Set(["https://public.example"]);
  const body = JSON.stringify({ query: [{ code: "Aasta", values: ["2024"] }] });
  const calls = [];
  const result = await requestApprovedPublicHttpsJsonPost("https://public.example/stat", {
    approvedOrigins: origins,
    body,
    maximumBytes: 64,
    requestImpl: mockHttpsRequest([
      { status: 200, body: '{"value":[654301]}' },
    ], calls),
  });
  assert.equal(result.body, '{"value":[654301]}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Accept, "application/json");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.headers["Content-Length"], String(Buffer.byteLength(body)));
  assert.equal(calls[0].body, body);

  await assert.rejects(requestApprovedPublicHttpsJsonPost("https://public.example/stat", {
    approvedOrigins: origins,
    body,
    requestImpl: mockHttpsRequest([
      { status: 307, headers: { location: "/other" } },
    ], []),
  }), /redirects are not allowed/u);
  await assert.rejects(requestApprovedPublicHttpsJsonPost("https://public.example/stat", {
    approvedOrigins: origins,
    body: "not json",
    requestImpl: mockHttpsRequest([], []),
  }), /invalid/u);
});

test("grounding audit approves every HTTPS locator in the official source catalogue", () => {
  assert.equal(AUDIT_CITATION_ORIGINS.has("https://tableau.envir.ee"), true);
  assert.equal(AUDIT_CITATION_ORIGINS.has("https://ec.europa.eu"), true);
  for (const source of officialServiceCatalogueDocuments()) {
    for (const field of ["url", "locator"]) {
      const value = source[field];
      if (!value) continue;
      let url;
      try {
        url = new URL(value);
      } catch {
        continue;
      }
      if (url.protocol !== "https:") continue;
      assert.equal(
        AUDIT_CITATION_ORIGINS.has(url.origin),
        true,
        `${source.id}.${field} uses an unapproved audit origin: ${url.origin}`,
      );
    }
  }
});
