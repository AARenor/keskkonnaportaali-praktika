import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import test from "node:test";
import * as transport from "../server/public-https.mjs";

// The module namespace is taken as a whole and destructured, so this file can be
// run before the byte preserving entry point exists: a missing export becomes an
// undefined local instead of an import failure, and the behavioural assertions
// below then fail on the transport itself rather than on module resolution.
const {
  DEFAULT_BINARY_ACCEPT,
  DEFAULT_TEXT_ACCEPT,
  PUBLIC_HTTPS_LIMITS,
  createPublicOnlyLookup,
  requestApprovedPublicHttpsBytes,
  requestApprovedPublicHttpsText,
} = transport;

// The approved public read path has to hand back the artifact it downloaded.
// Until a byte preserving entry point exists, the only approved read is the text
// entry point, so the fallback below routes the same bytes through it and the
// assertion shows what that path currently does to a PDF.
const readApprovedFile = requestApprovedPublicHttpsBytes
  ?? ((url, options) => requestApprovedPublicHttpsText(url, options).then((result) => ({
    ...result,
    body: Buffer.from(String(result.body ?? ""), "utf8"),
  })));

const APPROVED = ["https://www.keskkonnaagentuur.ee", "https://keskkonnaagentuur.ee"];
const APPROVED_ORIGINS = new Set(APPROVED);
const PUBLIC_PEER = "93.184.216.34";

// A PDF is a byte stream, not a text document: 0x00, lone continuation bytes
// and a UTF-16 surrogate all appear inside a real file. The payload below mixes
// every shape that a utf8 round trip destroys, so a transport that decodes and
// re-encodes it cannot return the original bytes.
const PAYLOAD = Buffer.concat([
  Buffer.from("%PDF-1.7\n", "latin1"),
  Buffer.from([0x00, 0x25, 0xff, 0xfe, 0x80, 0x81, 0xc3, 0x28, 0xed, 0xa0, 0x80]),
  Buffer.from([0x0a, 0x00, 0x0d, 0x0a]),
  Buffer.from("leht sisu", "utf8"),
]);

function chunked(body, sizes = [7, 11, 3, body.length]) {
  const chunks = [];
  let offset = 0;
  for (const size of sizes) {
    if (offset >= body.length) break;
    chunks.push(body.subarray(offset, Math.min(offset + size, body.length)));
    offset = Math.min(offset + size, body.length);
  }
  if (offset < body.length) chunks.push(body.subarray(offset));
  return chunks;
}

// The socket and the DNS answer are injected, while the approved-origin check,
// the redirect loop, the byte bound and the abort plumbing under test are the
// real ones. Nothing below opens a connection.
function mockHttpsRequest(responses, calls, { remoteAddress = PUBLIC_PEER } = {}) {
  return (url, options, callback) => {
    const request = new EventEmitter();
    let response;
    let destroyed = false;
    request.end = (body) => queueMicrotask(() => {
      const spec = responses.shift();
      if (!spec) throw new Error(`Unexpected outbound request to ${url}`);
      calls.push({ url: url.toString(), options, body });
      request.emit("socket", { remoteAddress });
      if (destroyed) return;
      response = Readable.from(spec.chunks || [spec.body || ""]);
      response.statusCode = spec.status;
      // A real IncomingMessage reports a redirect destination as the `location`
      // header, so a fixture that names one has to arrive through the same
      // channel. Without this the redirect loop sees a status with no
      // destination and refuses before the code under test is reached.
      response.headers = spec.location
        ? { location: spec.location, ...(spec.headers || {}) }
        : (spec.headers || {});
      response.headersDistinct = spec.headersDistinct || {};
      callback(response);
    });
    request.destroy = (error) => {
      destroyed = true;
      response?.destroy(error);
      if (error) queueMicrotask(() => request.emit("error", error));
    };
    return request;
  };
}

function transportFor(responses, options = {}) {
  const calls = [];
  return {
    calls,
    requestImpl: mockHttpsRequest(responses, calls, options),
  };
}

function binaryOptions(patch = {}) {
  return { approvedOrigins: APPROVED_ORIGINS, maximumBytes: 4_000, ...patch };
}

test("an approved PDF response arrives byte identical", async () => {
  const { requestImpl } = transportFor([{
    status: 200,
    chunks: chunked(PAYLOAD),
    headers: { "content-type": "application/pdf" },
  }]);
  const result = await readApprovedFile(`${APPROVED[0]}/failid/mets.pdf`, {
    approvedOrigins: APPROVED_ORIGINS,
    maximumBytes: 4_000,
    requestImpl,
  });
  assert.equal(result.status, 200);
  assert.ok(Buffer.isBuffer(result.body), "the approved read must return the downloaded bytes");
  assert.equal(result.body.length, PAYLOAD.length, "decoding changes the length of a PDF");
  assert.ok(result.body.equals(PAYLOAD), "an approved PDF must not be decoded on the way out");
});

test("binary transport returns the exact bytes of a body that is not valid UTF-8", async () => {
  const { requestImpl, calls } = transportFor([{
    status: 200,
    chunks: chunked(PAYLOAD),
    headers: {
      "content-type": "application/pdf",
      "content-profile": "public",
      "x-robots-tag": "index, follow",
    },
  }]);
  const result = await requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/mets.pdf`, {
    ...binaryOptions(),
    requestImpl,
  });
  assert.equal(result.status, 200);
  assert.equal(result.url, `${APPROVED[0]}/failid/mets.pdf`);
  assert.ok(Buffer.isBuffer(result.body));
  assert.equal(result.body.length, PAYLOAD.length);
  assert.ok(result.body.equals(PAYLOAD), "binary body must be byte identical");
  assert.equal(result.headers["content-type"], "application/pdf");
  assert.deepEqual(result.headers["x-robots-tag"], ["index, follow"]);
  assert.deepEqual(Object.keys(result.headers).sort(), ["content-profile", "content-type", "x-robots-tag"]);
  const sent = calls[0].options.headers;
  assert.equal(sent["Accept-Encoding"], "identity");
  assert.equal(sent.Accept, DEFAULT_BINARY_ACCEPT);
  assert.ok(sent.Accept.includes("application/pdf"));
  assert.equal(typeof calls[0].options.lookup, "function");
});

test("the text transport still decodes at its own boundary and keeps its own limits", async () => {
  const { requestImpl, calls } = transportFor([{ status: 200, chunks: chunked(PAYLOAD) }]);
  const result = await requestApprovedPublicHttpsText(`${APPROVED[0]}/leht`, {
    ...binaryOptions(),
    requestImpl,
  });
  assert.equal(typeof result.body, "string");
  assert.ok(result.body.includes("\ufffd"), "the text boundary replaces bytes it cannot decode");
  assert.equal(calls[0].options.headers.Accept, DEFAULT_TEXT_ACCEPT);

  // The text ceiling stays where it was: a caller cannot raise it past the
  // documented text maximum, and the default stays below it.
  const oversized = () => transportFor([{
    status: 200,
    body: "x",
    headers: { "content-length": String(PUBLIC_HTTPS_LIMITS.textBytes + 1) },
  }]);
  await assert.rejects(
    requestApprovedPublicHttpsText(`${APPROVED[0]}/leht`, {
      approvedOrigins: APPROVED_ORIGINS,
      maximumBytes: Number.MAX_SAFE_INTEGER,
      requestImpl: oversized().requestImpl,
    }),
    /too large/u,
  );
  await assert.rejects(
    requestApprovedPublicHttpsText(`${APPROVED[0]}/leht`, {
      approvedOrigins: APPROVED_ORIGINS,
      requestImpl: transportFor([{
        status: 200,
        body: "x",
        headers: { "content-length": String(PUBLIC_HTTPS_LIMITS.defaultTextBytes + 1) },
      }]).requestImpl,
    }),
    /too large/u,
  );
});

test("binary transport rejects a declared and a streamed body above its limit", async () => {
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/suur.pdf`, {
      ...binaryOptions(),
      maximumBytes: 1_024,
      requestImpl: transportFor([{
        status: 200,
        body: "x",
        headers: { "content-length": "1025" },
      }]).requestImpl,
    }),
    /Outbound response is too large/u,
  );
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/suur.pdf`, {
      ...binaryOptions(),
      maximumBytes: 1_024,
      requestImpl: transportFor([{ status: 200, chunks: chunked(Buffer.alloc(2_048, 0x41)) }]).requestImpl,
    }),
    /Outbound response is too large/u,
  );
  // A streamed refusal must not leave a partial body behind for a caller to
  // treat as a download.
  let settled = null;
  await requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/piir.pdf`, {
    ...binaryOptions(),
    maximumBytes: 16,
    requestImpl: transportFor([{ status: 200, chunks: chunked(Buffer.alloc(64, 0x41)) }]).requestImpl,
  }).then((value) => { settled = value; }, () => undefined);
  assert.equal(settled, null);

  // The ceiling is a transport constant: a caller cannot raise it, and the
  // default sits below it.
  assert.ok(PUBLIC_HTTPS_LIMITS.defaultBinaryBytes <= PUBLIC_HTTPS_LIMITS.binaryBytes);
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/suur.pdf`, {
      approvedOrigins: APPROVED_ORIGINS,
      maximumBytes: Number.MAX_SAFE_INTEGER,
      requestImpl: transportFor([{
        status: 200,
        body: "x",
        headers: { "content-length": String(PUBLIC_HTTPS_LIMITS.binaryBytes + 1) },
      }]).requestImpl,
    }),
    /Outbound response is too large/u,
  );
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/suur.pdf`, {
      approvedOrigins: APPROVED_ORIGINS,
      requestImpl: transportFor([{
        status: 200,
        body: "x",
        headers: { "content-length": String(PUBLIC_HTTPS_LIMITS.defaultBinaryBytes + 1) },
      }]).requestImpl,
    }),
    /Outbound response is too large/u,
  );
});

test("binary transport refuses an unapproved origin or a non-public literal before connecting", async () => {
  const cases = [
    ["http://www.keskkonnaagentuur.ee/failid/a.pdf", APPROVED_ORIGINS, /outside the approved HTTPS origins/u],
    ["https://other.example/a.pdf", APPROVED_ORIGINS, /outside the approved HTTPS origins/u],
    ["https://obvious-userinfo@www.keskkonnaagentuur.ee/a.pdf", APPROVED_ORIGINS, /outside the approved HTTPS origins/u],
    ["https://www.keskkonnaagentuur.ee/a.pdf#page=2", APPROVED_ORIGINS, /outside the approved HTTPS origins/u],
    // An approved origin can still resolve to something the process must not
    // dial, which is why the address check is separate from the allowlist.
    ["https://127.0.0.1/a.pdf", new Set(["https://127.0.0.1"]), /non-public address/u],
    ["https://[::1]/a.pdf", new Set(["https://[::1]"]), /non-public address/u],
    ["https://169.254.169.254/a.pdf", new Set(["https://169.254.169.254"]), /non-public address/u],
  ];
  for (const [target, origins, pattern] of cases) {
    const { requestImpl, calls } = transportFor([{ status: 200, body: "" }]);
    await assert.rejects(
      requestApprovedPublicHttpsBytes(target, { ...binaryOptions(), approvedOrigins: origins, requestImpl }),
      pattern,
      target,
    );
    assert.equal(calls.length, 0, `${target} must not reach the transport`);
  }
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/a.pdf`, { requestImpl: () => assert.fail("no request") }),
    /outside the approved HTTPS origins/u,
  );
});

test("binary transport rechecks the DNS answer and the connected peer address", async () => {
  const privateAnswer = createPublicOnlyLookup(
    (hostname, options, callback) => callback(null, [{ address: "10.0.0.9", family: 4 }]),
  );
  await new Promise((resolve, reject) => {
    privateAnswer("www.keskkonnaagentuur.ee", {}, (error) => {
      if (!error) { reject(new Error("a private DNS answer must be refused")); return; }
      assert.match(error.message, /non-public DNS answer/u);
      resolve();
    });
  });

  // The transport has to wire the injected resolver into the request it makes,
  // otherwise the approval check and the address that is dialled can diverge.
  let wiredLookup = null;
  await requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/dns.pdf`, {
    ...binaryOptions(),
    lookupImpl: (hostname, options, callback) => callback(null, []),
    requestImpl: (url, options, callback) => {
      wiredLookup = options.lookup;
      return transportFor([{ status: 200, body: PAYLOAD }]).requestImpl(url, options, callback);
    },
  });
  assert.equal(typeof wiredLookup, "function");
  await new Promise((resolve, reject) => {
    wiredLookup("www.keskkonnaagentuur.ee", {}, (error) => {
      if (!error) { reject(new Error("the injected resolver must answer through the public only lookup")); return; }
      assert.match(error.message, /non-public DNS answer/u);
      resolve();
    });
  });

  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/peer.pdf`, {
      ...binaryOptions(),
      requestImpl: transportFor([{ status: 200, body: "payload" }], { remoteAddress: "192.168.1.7" }).requestImpl,
    }),
    /non-public address/u,
  );
});

test("binary transport follows an approved redirect and refuses a disallowed one", async () => {
  const follow = transportFor([
    { status: 302, location: "https://keskkonnaagentuur.ee/failid/mets.pdf" },
    { status: 200, chunks: chunked(PAYLOAD) },
  ]);
  const hooks = [];
  const followed = await requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/mets.pdf`, {
    ...binaryOptions(),
    requestImpl: follow.requestImpl,
    assertRedirectAllowed: (destination, context) => {
      hooks.push({ destination: destination.toString(), ...context });
    },
  });
  assert.equal(followed.url, "https://keskkonnaagentuur.ee/failid/mets.pdf");
  assert.ok(followed.body.equals(PAYLOAD));
  assert.equal(follow.calls.length, 2);
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].destination, "https://keskkonnaagentuur.ee/failid/mets.pdf");
  assert.equal(hooks[0].from, `${APPROVED[0]}/failid/mets.pdf`);
  assert.equal(hooks[0].status, 302);
  assert.equal(hooks[0].redirects, 1);
  assert.equal(hooks[0].signal, undefined);

  const denied = transportFor([{ status: 302, location: "https://evil.example/mets.pdf" }]);
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/mets.pdf`, {
      ...binaryOptions(),
      requestImpl: denied.requestImpl,
    }),
    /outside the approved HTTPS origins/u,
  );
  assert.equal(denied.calls.length, 1);

  const policyDenied = transportFor([
    { status: 302, location: "https://keskkonnaagentuur.ee/keelatud.pdf" },
    { status: 200, body: "must not be read" },
  ]);
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/mets.pdf`, {
      ...binaryOptions(),
      requestImpl: policyDenied.requestImpl,
      assertRedirectAllowed: () => { throw new Error("Redirect destination is disallowed"); },
    }),
    /disallowed/u,
  );
  assert.equal(policyDenied.calls.length, 1);
});

test("binary redirects honour the redirect bound, the missing location and an aborted reader", async () => {
  const loop = [1, 2, 3, 4].map(() => ({
    status: 307,
    location: "https://keskkonnaagentuur.ee/failid/mets.pdf",
  }));
  const { requestImpl } = transportFor(loop);
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/mets.pdf`, {
      ...binaryOptions(),
      maximumRedirects: 1,
      requestImpl,
    }),
    /redirected too many times/u,
  );
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/mets.pdf`, {
      ...binaryOptions(),
      maximumRedirects: 0,
      requestImpl: transportFor([{ status: 301, location: "https://keskkonnaagentuur.ee/x.pdf" }]).requestImpl,
    }),
    /redirected too many times or without a destination/u,
  );
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/mets.pdf`, {
      ...binaryOptions(),
      requestImpl: transportFor([{ status: 302 }]).requestImpl,
    }),
    /redirected too many times or without a destination/u,
  );

  const controller = new AbortController();
  controller.abort(new Error("reader left"));
  let hookCalls = 0;
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/mets.pdf`, {
      ...binaryOptions(),
      signal: controller.signal,
      requestImpl: transportFor([{ status: 302, location: "https://keskkonnaagentuur.ee/x.pdf" }]).requestImpl,
      assertRedirectAllowed: () => { hookCalls += 1; },
    }),
    /reader left/u,
  );
  assert.equal(hookCalls, 0, "an aborted reader never starts the policy lookup");
});

test("binary transport carries the caller signal and aborts on it", async () => {
  const controller = new AbortController();
  const hanging = (url, options) => {
    const request = new EventEmitter();
    request.end = () => {};
    request.destroy = () => {};
    options.signal?.addEventListener("abort", () => {
      request.emit("error", options.signal.reason);
    }, { once: true });
    return request;
  };
  const pending = requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/aeglane.pdf`, {
    ...binaryOptions(),
    signal: controller.signal,
    requestImpl: hanging,
  });
  controller.abort(new Error("deadline reached"));
  await assert.rejects(pending, /deadline reached/u);

  // A clock based abort reaches the same boundary: the signal handed to the
  // request layer is the caller's own, so a timeout composed by the caller is a
  // transport timeout.
  await assert.rejects(
    requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/aeglane.pdf`, {
      ...binaryOptions(),
      signal: AbortSignal.timeout(20),
      requestImpl: hanging,
    }),
    (error) => error.name === "TimeoutError",
  );

  let seenSignal = null;
  await requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/kiire.pdf`, {
    ...binaryOptions(),
    signal: AbortSignal.timeout(5_000),
    requestImpl: (url, options, callback) => {
      seenSignal = options.signal;
      return transportFor([{ status: 200, body: PAYLOAD }]).requestImpl(url, options, callback);
    },
  });
  assert.ok(seenSignal instanceof AbortSignal);
});

test("binary transport reports a non successful status without inventing a body", async () => {
  const result = await requestApprovedPublicHttpsBytes(`${APPROVED[0]}/failid/puudub.pdf`, {
    ...binaryOptions(),
    requestImpl: transportFor([{ status: 404, headers: { "content-type": "text/html" } }]).requestImpl,
  });
  assert.equal(result.status, 404);
  assert.ok(Buffer.isBuffer(result.body));
  assert.equal(result.body.length, 0);
  assert.equal(result.headers["content-type"], "text/html");
});
