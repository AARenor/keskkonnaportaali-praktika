import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  PDF_EXTRACTION_LIMITS,
  PDF_EXTRACTION_STATUSES,
  createPdfExtractionLimiter,
  extractPdfPages,
  isPdfContentType,
  isPdfSignature,
} from "../server/pdf_extraction.mjs";

// Every fixture below is generated in the test from ASCII page text, so no real
// public document, page extract or user record is part of the suite. The PDFs
// are structurally valid: correct object offsets, a real xref table and, for
// the encrypted case, a real RC4 standard security handler.
function buildPdf({ pages, junkPrefix = 0 }) {
  const header = Buffer.from(`${" ".repeat(junkPrefix)}%PDF-1.7\n`, "latin1");
  const parts = [header];
  const objects = [];
  const kids = [];
  const numbers = [];
  let next = 3;
  for (let index = 0; index < pages.length; index += 1) {
    numbers.push([next, next + 1]);
    next += 2;
  }
  const fontNumber = next;
  for (const [pageNumber] of numbers) kids.push(`${pageNumber} 0 R`);
  objects.push([1, Buffer.from("<< /Type /Catalog /Pages 2 0 R >>")]);
  objects.push([2, Buffer.from(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`)]);
  for (let index = 0; index < pages.length; index += 1) {
    const [pageNumber, contentNumber] = numbers[index];
    objects.push([pageNumber, Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`,
    )]);
    const stream = pages[index] === null
      ? Buffer.alloc(0)
      : Buffer.from(`BT /F1 18 Tf 72 760 Td (${pages[index]}) Tj ET\n`, "latin1");
    objects.push([contentNumber, Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),
      stream,
      Buffer.from("\nendstream"),
    ])]);
  }
  objects.push([fontNumber, Buffer.from(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  )]);
  objects.sort((left, right) => left[0] - right[0]);
  let offset = header.length;
  const offsets = new Map();
  for (const [number, body] of objects) {
    const chunk = Buffer.concat([Buffer.from(`${number} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
    offsets.set(number, offset);
    parts.push(chunk);
    offset += chunk.length;
  }
  const total = objects[objects.length - 1][0] + 1;
  const xrefStart = offset;
  parts.push(Buffer.from(`xref\n0 ${total}\n0000000000 65535 f \n`));
  for (let number = 1; number < total; number += 1) {
    parts.push(Buffer.from(`${String(offsets.get(number) ?? 0).padStart(10, "0")} 00000 n \n`));
  }
  parts.push(Buffer.from(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`));
  return Buffer.concat(parts);
}

const PDF_PADDING = Buffer.from(
  "28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A",
  "hex",
);

function padPassword(value) {
  const text = Buffer.from(value, "latin1");
  const padded = Buffer.alloc(32);
  const used = Math.min(text.length, 32);
  text.copy(padded, 0, 0, used);
  PDF_PADDING.copy(padded, used, 0, 32 - used);
  return padded;
}

function rc4(key, data) {
  const state = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) state[index] = index;
  let swap = 0;
  for (let index = 0; index < 256; index += 1) {
    swap = (swap + state[index] + key[index % key.length]) & 0xff;
    const held = state[index];
    state[index] = state[swap];
    state[swap] = held;
  }
  const output = Buffer.alloc(data.length);
  let first = 0;
  let second = 0;
  for (let index = 0; index < data.length; index += 1) {
    first = (first + 1) & 0xff;
    second = (second + state[first]) & 0xff;
    const held = state[first];
    state[first] = state[second];
    state[second] = held;
    output[index] = data[index] ^ state[(state[first] + state[second]) & 0xff];
  }
  return output;
}

const md5 = (...parts) => {
  const hash = createHash("md5");
  for (const part of parts) hash.update(part);
  return hash.digest();
};

// A standard security handler with V 1 / R 2 and an empty user password. The
// file opens without a password, and poppler still reports it as encrypted, so
// the extractor has to refuse it rather than silently return the text.
function buildEncryptedPdf({ pages = ["Salajane leht"] } = {}) {
  const permissions = -1;
  const documentId = md5(Buffer.from("%PDF-1.7 encrypted extractor fixture"));
  const ownerKey = md5(padPassword("")).subarray(0, 5);
  const ownerValue = rc4(ownerKey, padPassword(""));
  const permissionBytes = Buffer.alloc(4);
  permissionBytes.writeInt32LE(permissions, 0);
  const fileKey = md5(padPassword(""), ownerValue, permissionBytes, documentId).subarray(0, 5);
  const userValue = rc4(fileKey, PDF_PADDING);

  const objects = [];
  const kids = [];
  const numbers = [];
  let next = 3;
  for (let index = 0; index < pages.length; index += 1) {
    numbers.push([next, next + 1]);
    next += 2;
  }
  const fontNumber = next;
  const encryptNumber = next + 1;
  for (const [pageNumber] of numbers) kids.push(`${pageNumber} 0 R`);
  objects.push([1, Buffer.from("<< /Type /Catalog /Pages 2 0 R >>")]);
  objects.push([2, Buffer.from(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`)]);
  for (let index = 0; index < pages.length; index += 1) {
    const [pageNumber, contentNumber] = numbers[index];
    objects.push([pageNumber, Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`,
    )]);
    const raw = Buffer.from(`BT /F1 18 Tf 72 760 Td (${pages[index]}) Tj ET\n`, "latin1");
    const objectKey = md5(fileKey, Buffer.from([contentNumber & 0xff, (contentNumber >> 8) & 0xff,
      (contentNumber >> 16) & 0xff, 0, 0])).subarray(0, fileKey.length + 5);
    const encrypted = rc4(objectKey, raw);
    objects.push([contentNumber, Buffer.concat([
      Buffer.from(`<< /Length ${encrypted.length} >>\nstream\n`),
      encrypted,
      Buffer.from("\nendstream"),
    ])]);
  }
  objects.push([fontNumber, Buffer.from(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  )]);
  objects.push([encryptNumber, Buffer.from(
    `<< /Filter /Standard /V 1 /R 2 /O <${ownerValue.toString("hex")}> /U <${userValue.toString("hex")}> /P ${permissions} >>`,
  )]);
  objects.sort((left, right) => left[0] - right[0]);

  const parts = [Buffer.from("%PDF-1.7\n%\xa0\xb1\xc2\xd3\n", "latin1")];
  const offsets = new Map();
  let offset = parts[0].length;
  for (const [number, body] of objects) {
    const chunk = Buffer.concat([Buffer.from(`${number} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
    offsets.set(number, offset);
    parts.push(chunk);
    offset += chunk.length;
  }
  const total = objects[objects.length - 1][0] + 1;
  const xrefStart = offset;
  parts.push(Buffer.from(`xref\n0 ${total}\n0000000000 65535 f \n`));
  for (let number = 1; number < total; number += 1) {
    parts.push(Buffer.from(`${String(offsets.get(number) ?? 0).padStart(10, "0")} 00000 n \n`));
  }
  parts.push(Buffer.from(
    `trailer\n<< /Size ${total} /Root 1 0 R /Encrypt ${encryptNumber} 0 R /ID [<${documentId.toString("hex")}> <${documentId.toString("hex")}>] >>\nstartxref\n${xrefStart}\n%%EOF\n`,
  ));
  return Buffer.concat(parts);
}

// A fake extractor process is used wherever the behaviour under test is the
// caller's deadline, cleanup or concurrency, so the suite never waits on a real
// subprocess for those cases.
function createFakeSpawn(plan) {
  const calls = [];
  const state = { active: 0, maximumActive: 0 };
  const spawnImpl = (command, args, options) => {
    const index = calls.length;
    const record = { command, args, options, child: null };
    calls.push(record);
    state.active += 1;
    state.maximumActive = Math.max(state.maximumActive, state.active);
    const spec = plan({ command, args, options, index, active: state.active }) || {};
    const child = new EventEmitter();
    record.child = child;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.stdin.on("error", () => {});
    let closed = false;
    let signals = [];
    const finish = (code = spec.code ?? 0, signal = null) => {
      if (closed) return;
      closed = true;
      state.active -= 1;
      child.emit("close", code, signal);
    };
    child.kill = (signal = "SIGTERM") => {
      signals = [...signals, signal];
      child.killSignals = signals;
      if (spec.ignoreKill) return true;
      setImmediate(() => finish(null, signal));
      return true;
    };
    if (spec.stdout !== undefined) {
      child.stdout.write(Buffer.isBuffer(spec.stdout) ? spec.stdout : Buffer.from(String(spec.stdout), "utf8"));
    }
    if (spec.stderr !== undefined) child.stderr.write(String(spec.stderr));
    if (!spec.hang) {
      setTimeout(() => {
        child.stdout.end();
        child.stderr.end();
        finish(spec.code ?? 0, null);
      }, Math.max(0, spec.delayMs ?? 0));
    }
    return child;
  };
  return { spawnImpl, calls, state };
}

async function withTempRoot(run) {
  const root = await mkdtemp(join(tmpdir(), "pdf-extraction-test-"));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function assertFailure(result, status) {
  assert.ok(PDF_EXTRACTION_STATUSES.has(status), `${status} must be part of the published status vocabulary`);
  assert.equal(result.status, status);
  assert.deepEqual(result.pages, []);
  assert.ok(result.detail === null || typeof result.detail === "string");
  assert.ok(result.detail === null || result.detail.length <= 240, "a failure detail is bounded");
  assert.ok(result.pageCount === null || Number.isSafeInteger(result.pageCount));
}

test("extracts page specific text and keeps the page number of every page", async () => {
  await withTempRoot(async (tempRoot) => {
    const result = await extractPdfPages(
      buildPdf({ pages: ["Esimene leht", "Teine leht"] }),
      { tempRoot },
    );
    assert.equal(result.status, "ok");
    assert.equal(result.pageCount, 2);
    assert.deepEqual(result.pages, [
      { pageNumber: 1, text: "Esimene leht" },
      { pageNumber: 2, text: "Teine leht" },
    ]);
    assert.match(String(result.extractorVersion), /^poppler-\d+\./u);
    assert.equal(result.detail, null);
    assert.deepEqual(await readdir(tempRoot), [], "the extractor must not leave a working directory behind");
  });
});

test("keeps the position of an empty page instead of renumbering the next page", async () => {
  await withTempRoot(async (tempRoot) => {
    const result = await extractPdfPages(
      buildPdf({ pages: ["Esimene leht", null, "Kolmas leht"] }),
      { tempRoot },
    );
    assert.equal(result.status, "ok");
    assert.equal(result.pageCount, 3);
    assert.deepEqual(result.pages.map((page) => page.pageNumber), [1, 2, 3]);
    assert.equal(result.pages[0].text, "Esimene leht");
    assert.equal(result.pages[1].text, "");
    assert.equal(result.pages[2].text, "Kolmas leht");
  });
});

test("rejects material that is not a PDF before a subprocess is started", async () => {
  const fake = createFakeSpawn(() => ({ stdout: "" }));
  const html = Buffer.from("<!doctype html><html><body>sisu</body></html>", "utf8");
  assert.equal(isPdfSignature(html), false);
  assertFailure(await extractPdfPages(html, { spawnImpl: fake.spawnImpl }), "invalid-signature");
  assert.equal(fake.calls.length, 0);

  assertFailure(
    await extractPdfPages(buildPdf({ pages: ["Sisu"] }), {
      spawnImpl: fake.spawnImpl,
      contentType: "text/html; charset=utf-8",
    }),
    "unsupported-content-type",
  );
  assert.equal(fake.calls.length, 0);
  assert.equal(isPdfContentType("application/pdf"), true);
  assert.equal(isPdfContentType("application/pdf; charset=binary"), true);
  assert.equal(isPdfContentType("application/x-pdf"), true);
  assert.equal(isPdfContentType("text/html"), false);
  assert.equal(isPdfContentType("application/octet-stream"), false);
  assert.equal(isPdfContentType(""), false);

  // The signature is allowed inside the documented first kilobyte, which is what
  // a file that was pasted after a small header looks like.
  const prefixed = buildPdf({ pages: ["Sisu"], junkPrefix: 512 });
  assert.equal(isPdfSignature(prefixed), true);
  assert.equal(isPdfSignature(Buffer.from("%PDF-1.7")), true);
  assert.equal(isPdfSignature(Buffer.from("PK\u0003\u0004zip")), false);
});

test("rejects input above the byte bound without parsing it", async () => {
  const fake = createFakeSpawn(() => ({ stdout: "" }));
  const oversized = Buffer.concat([
    Buffer.from("%PDF-1.7\n", "latin1"),
    Buffer.alloc(5_000, 0x20),
  ]);
  assertFailure(
    await extractPdfPages(oversized, { spawnImpl: fake.spawnImpl, maximumInputBytes: 4_096 }),
    "too-large",
  );
  assert.equal(fake.calls.length, 0);
  assert.ok(PDF_EXTRACTION_LIMITS.maximumInputBytes > 4_096, "the published bound is larger than the test bound");
});

test("refuses an encrypted document instead of extracting its text", async () => {
  const encrypted = buildEncryptedPdf();
  const fake = createFakeSpawn(() => ({ stdout: "Salajane leht\n\f" }));
  assertFailure(await extractPdfPages(encrypted, { spawnImpl: fake.spawnImpl }), "encrypted");
  assert.equal(fake.calls.length, 0, "an encryption marker is refused before a converter runs");

  await withTempRoot(async (tempRoot) => {
    const result = await extractPdfPages(encrypted, { tempRoot });
    assertFailure(result, "encrypted");
    assert.deepEqual(await readdir(tempRoot), []);
  });

  // The metadata probe is the second gate: a converter build that reports an
  // encryption flag, and one that demands a password, must both end encrypted.
  const flagged = createFakeSpawn(({ args }) => (
    args[0] === "-layout"
      ? { stdout: "Salajane leht\n\f" }
      : { stdout: "Pages: 1\nEncrypted: yes (print:no copy:no change:no addNotes:no algorithm:RC4)\n" }
  ));
  assertFailure(
    await extractPdfPages(buildPdf({ pages: ["Salajane leht"] }), { spawnImpl: flagged.spawnImpl }),
    "encrypted",
  );
  assert.equal(flagged.calls.length, 1, "the text converter is not started once encryption is known");

  const password = createFakeSpawn(({ args }) => (
    args[0] === "-layout"
      ? { stdout: "Salajane leht\n\f" }
      : { stderr: "Command Line Error: Incorrect password\n", code: 1 }
  ));
  assertFailure(
    await extractPdfPages(buildPdf({ pages: ["Salajane leht"] }), { spawnImpl: password.spawnImpl }),
    "encrypted",
  );
});

test("rejects a corrupt document with a bounded, sanitised detail", async () => {
  const corrupt = Buffer.from("%PDF-1.7\nthis is not a pdf at all\n", "latin1");
  await withTempRoot(async (tempRoot) => {
    const result = await extractPdfPages(corrupt, { tempRoot });
    assertFailure(result, "corrupt");
    assert.ok((result.detail || "").length > 0);
    assert.ok(!String(result.detail).includes(tempRoot), "the detail must not leak a private path");
    assert.ok(!String(result.detail).includes("\n"));
    assert.deepEqual(await readdir(tempRoot), []);
  });
});

test("rejects a document without extractable text instead of calling OCR", async () => {
  await withTempRoot(async (tempRoot) => {
    const result = await extractPdfPages(buildPdf({ pages: [null] }), { tempRoot });
    assertFailure(result, "textless");
    assert.equal(result.pageCount, 1);
    assert.deepEqual(await readdir(tempRoot), []);
  });
});

test("refuses more pages than the bound and larger text than the bound", async () => {
  const three = buildPdf({ pages: ["Esimene", "Teine", "Kolmas"] });
  const fake = createFakeSpawn(({ args }) => (
    args[0] === "-layout" ? { stdout: "Esimene\n\fTeine\n\fKolmas\n\f" } : { stdout: "Pages: 3\nEncrypted: no\n" }
  ));
  const bounded = await extractPdfPages(three, { spawnImpl: fake.spawnImpl, maximumPages: 2 });
  assertFailure(bounded, "too-many-pages");
  assert.equal(bounded.pageCount, 3);
  assert.equal(fake.calls.length, 1, "the page bound is settled from metadata before conversion");

  const real = await extractPdfPages(three, { maximumPages: 2 });
  assertFailure(real, "too-many-pages");
  assert.equal(real.pageCount, 3);

  const wide = createFakeSpawn(({ args }) => (
    args[0] === "-layout" ? { stdout: "a".repeat(70_000) } : { stdout: "Pages: 1\nEncrypted: no\n" }
  ));
  assertFailure(
    await extractPdfPages(buildPdf({ pages: ["Sisu"] }), {
      spawnImpl: wide.spawnImpl,
      maximumTextBytes: 1_000,
    }),
    "text-too-large",
  );

  await withTempRoot(async (tempRoot) => {
    const tight = await extractPdfPages(three, { tempRoot, maximumTextBytes: 5 });
    assertFailure(tight, "text-too-large");
    assert.deepEqual(await readdir(tempRoot), []);
  });
});

test("stops at the deadline, kills the converter and cleans its working directory", async () => {
  await withTempRoot(async (tempRoot) => {
    const fake = createFakeSpawn(({ args }) => (
      args[0] === "-layout" ? { hang: true } : { stdout: "Pages: 1\nEncrypted: no\n" }
    ));
    const started = Date.now();
    const result = await extractPdfPages(buildPdf({ pages: ["Aeglane"] }), {
      spawnImpl: fake.spawnImpl,
      tempRoot,
      timeoutMs: 60,
    });
    assertFailure(result, "timeout");
    assert.ok(Date.now() - started < 2_000, "an expired deadline has to return promptly");
    const converted = fake.calls.filter((call) => call.args[0] === "-layout");
    assert.equal(converted.length, 1);
    assert.deepEqual(converted[0].child.killSignals, ["SIGKILL"]);
    assert.deepEqual(await readdir(tempRoot), []);
  });

  // A converter that ignores the kill signal must not hold the caller open: the
  // deadline is the promise, not the process.
  await withTempRoot(async (tempRoot) => {
    const stuck = createFakeSpawn(({ args }) => (
      args[0] === "-layout" ? { hang: true, ignoreKill: true } : { stdout: "Pages: 1\nEncrypted: no\n" }
    ));
    const started = Date.now();
    const result = await extractPdfPages(buildPdf({ pages: ["Kange"] }), {
      spawnImpl: stuck.spawnImpl,
      tempRoot,
      timeoutMs: 40,
      terminateTimeoutMs: 40,
    });
    assertFailure(result, "timeout");
    assert.ok(Date.now() - started < 1_500, "an unkillable converter is abandoned, not awaited");
    assert.deepEqual(await readdir(tempRoot), []);
  });
});

test("cancels on the caller signal and cleans up the same way", async () => {
  await withTempRoot(async (tempRoot) => {
    const fake = createFakeSpawn(({ args }) => (
      args[0] === "-layout" ? { hang: true } : { stdout: "Pages: 1\nEncrypted: no\n" }
    ));
    const controller = new AbortController();
    const pending = extractPdfPages(buildPdf({ pages: ["Katkestus"] }), {
      spawnImpl: fake.spawnImpl,
      tempRoot,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(new Error("worker shutting down")), 30);
    const result = await pending;
    assertFailure(result, "aborted");
    const converted = fake.calls.filter((call) => call.args[0] === "-layout");
    assert.deepEqual(converted[0].child.killSignals, ["SIGKILL"]);
    assert.deepEqual(await readdir(tempRoot), []);

    // An abort that arrives before the queue hands out a slot must not start a
    // converter at all.
    const early = new AbortController();
    early.abort(new Error("never started"));
    const before = createFakeSpawn(() => ({ stdout: "" }));
    assertFailure(
      await extractPdfPages(buildPdf({ pages: ["Katkestus"] }), {
        spawnImpl: before.spawnImpl,
        tempRoot,
        signal: early.signal,
      }),
      "aborted",
    );
    assert.equal(before.calls.length, 0);
    assert.deepEqual(await readdir(tempRoot), []);
  });
});

test("reports a missing converter as unavailable instead of returning an empty document", async () => {
  const result = await extractPdfPages(buildPdf({ pages: ["Sisu"] }), {
    command: "pdftotext-missing-for-test",
    infoCommand: "pdfinfo-missing-for-test",
  });
  assertFailure(result, "unavailable");
  assert.ok((result.detail || "").length > 0);
});

test("a single process never runs more converters than its own bound allows", async () => {
  const limiter = createPdfExtractionLimiter({ maximumConcurrent: 1, maximumQueued: 2 });
  const fake = createFakeSpawn(({ args }) => (
    args[0] === "-layout" ? { stdout: "Esimene\n\fTeine\n\f", delayMs: 25 } : { stdout: "Pages: 2\nEncrypted: no\n" }
  ));
  const pages = buildPdf({ pages: ["Esimene", "Teine"] });
  const [first, second] = await Promise.all([
    extractPdfPages(pages, { spawnImpl: fake.spawnImpl, limiter }),
    extractPdfPages(pages, { spawnImpl: fake.spawnImpl, limiter }),
  ]);
  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  assert.equal(fake.state.maximumActive, 1);
  assert.equal(fake.calls.length, 4);
  assert.deepEqual(limiter.snapshot(), { active: 0, queued: 0, maximumConcurrent: 1, maximumQueued: 2 });
});

test("a full extraction queue refuses new work explicitly", async () => {
  const limiter = createPdfExtractionLimiter({ maximumConcurrent: 1, maximumQueued: 1 });
  const fake = createFakeSpawn(({ args }) => (
    args[0] === "-layout" ? { hang: true } : { stdout: "Pages: 1\nEncrypted: no\n" }
  ));
  const pages = buildPdf({ pages: ["Sisu"] });
  const controllers = [new AbortController(), new AbortController()];
  const running = extractPdfPages(pages, {
    spawnImpl: fake.spawnImpl,
    limiter,
    signal: controllers[0].signal,
  });
  const queued = extractPdfPages(pages, {
    spawnImpl: fake.spawnImpl,
    limiter,
    signal: controllers[1].signal,
  });
  const refused = await extractPdfPages(pages, { spawnImpl: fake.spawnImpl, limiter });
  assertFailure(refused, "busy");
  assert.deepEqual(limiter.snapshot(), {
    active: 1,
    queued: 1,
    maximumConcurrent: 1,
    maximumQueued: 1,
  });
  controllers[0].abort(new Error("done"));
  controllers[1].abort(new Error("done"));
  assertFailure(await running, "aborted");
  assertFailure(await queued, "aborted");
  assert.deepEqual(limiter.snapshot(), {
    active: 0,
    queued: 0,
    maximumConcurrent: 1,
    maximumQueued: 1,
  });
});

test("the converter is invoked without a shell and with arguments that cannot be injected", async () => {
  const fake = createFakeSpawn(({ args }) => (
    args[0] === "-layout" ? { stdout: "Sisu\n\f" } : { stdout: "Pages: 1\nEncrypted: no\n" }
  ));
  const result = await extractPdfPages(buildPdf({ pages: ["Sisu"] }), { spawnImpl: fake.spawnImpl });
  assert.equal(result.status, "ok");
  for (const call of fake.calls) {
    assert.ok(Array.isArray(call.args), "arguments are passed as an array");
    assert.equal(call.options.shell ?? false, false, "no shell may interpret the arguments");
    assert.ok(!call.args.some((argument) => /[;&|`$><\n]/u.test(String(argument))), "no argument carries shell syntax");
    assert.ok(typeof call.command === "string" && call.command.length > 0);
  }
  const convert = fake.calls.find((call) => call.args[0] === "-layout");
  assert.deepEqual(convert.args.slice(1, 5), ["-enc", "UTF-8", "-f", "1"]);
  assert.equal(convert.args.at(-1), "-", "the text goes to stdout instead of a file in the container");
  assert.ok(convert.options.env.TMPDIR, "the converter writes its temporary files inside the private directory");
  assert.notEqual(convert.options.env.TMPDIR, tmpdir());
});
