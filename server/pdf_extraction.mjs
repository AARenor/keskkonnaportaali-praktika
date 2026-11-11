import { spawn as nodeSpawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A conversion is bounded on every axis that a hostile or merely broken file can
// push: the bytes that are read, the pages that are parsed, the text that is
// kept, the wall clock and the number of converters that may run at once. The
// defaults below are the published contract; a caller may lower them and may not
// raise them.
export const PDF_EXTRACTION_LIMITS = Object.freeze({
  maximumInputBytes: 16_000_000,
  maximumPages: 400,
  maximumTextBytes: 2_000_000,
  timeoutMs: 20_000,
  concurrency: 2,
  queue: 8,
});

const STATUS_VALUES = Object.freeze([
  // The document was parsed and every page carries its own text.
  "ok",
  // Rejected before a converter ran: the material is not a PDF at all.
  "invalid-signature",
  "unsupported-content-type",
  // Rejected before a converter ran: the material is larger than the bound.
  "too-large",
  // The document is protected, so its text may not be lifted out of it.
  "encrypted",
  // The converter could not parse the file, or produced a page range it declared
  // it could not honour.
  "corrupt",
  // No page contains extractable text. A scan is not silently passed to OCR.
  "textless",
  // The document has more pages than the bound allows.
  "too-many-pages",
  // The extracted text, or the converter's output stream, exceeded the bound.
  "text-too-large",
  // The deadline expired; the converter was killed and its directory removed.
  "timeout",
  // The caller cancelled; the converter was killed and its directory removed.
  "aborted",
  // The converter is not installed in this runtime image.
  "unavailable",
  // The process already runs its full number of converters and its queue is full.
  "busy",
]);

export const PDF_EXTRACTION_STATUSES = Object.freeze({
  values: STATUS_VALUES,
  has: (value) => STATUS_VALUES.includes(value),
});

const SIGNATURE_WINDOW_BYTES = 1_024;
const ENCRYPTION_SCAN_BYTES = 65_536;
const MAXIMUM_STDERR_BYTES = 8_192;
const VERSION_TIMEOUT_MS = 2_000;

function taggedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function toByteView(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

// The PDF header may be preceded by up to a kilobyte of junk, which is what a
// file that was copied out of another container looks like. It may not be
// absent: treating an HTML error page as a document is how a parser gets fed
// something it was never meant to read.
export function isPdfSignature(bytes) {
  const view = toByteView(bytes);
  if (!view || !view.length) return false;
  return view.subarray(0, SIGNATURE_WINDOW_BYTES).toString("latin1").includes("%PDF-");
}

export function isPdfContentType(value) {
  const essence = String(value ?? "").split(";")[0].trim().toLocaleLowerCase("en-US");
  return essence === "application/pdf" || essence === "application/x-pdf";
}

// The trailer of an encrypted document names its security handler. XRef streams
// keep that dictionary at the tail of the file as well, so the last kilobytes are
// scanned rather than the whole document. This is a fast refusal in front of the
// converter, not a substitute for it: the metadata probe below is the second
// gate and covers a marker this scan could not see.
function hasEncryptionMarker(view) {
  const start = Math.max(0, view.length - ENCRYPTION_SCAN_BYTES);
  return /\/Encrypt\s+\d+\s+\d+\s+R/u.test(view.subarray(start).toString("latin1"));
}

// Converters are the expensive part of a background run, so their number is a
// process property rather than a per-call choice. A caller that asks for more
// offline work than the process can run is told so instead of being parked with
// its document held in memory.
export function createPdfExtractionLimiter({
  maximumConcurrent = PDF_EXTRACTION_LIMITS.concurrency,
  maximumQueued = PDF_EXTRACTION_LIMITS.queue,
} = {}) {
  const concurrentLimit = Math.max(1, Math.min(
    Math.trunc(Number(maximumConcurrent) || PDF_EXTRACTION_LIMITS.concurrency),
    8,
  ));
  const configuredQueue = Number(maximumQueued);
  const queueLimit = Math.max(0, Math.min(
    Number.isFinite(configuredQueue) ? Math.trunc(configuredQueue) : PDF_EXTRACTION_LIMITS.queue,
    64,
  ));
  let active = 0;
  const waiting = [];

  const makeSlot = () => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active = Math.max(0, active - 1);
      const next = waiting.shift();
      if (!next) return;
      next.cancel();
      active += 1;
      next.grant(makeSlot());
    };
  };

  const acquire = ({ signal, deadline } = {}) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(taggedError("aborted", "PDF extraction was cancelled"));
      return;
    }
    if (active < concurrentLimit) {
      active += 1;
      resolve(makeSlot());
      return;
    }
    if (waiting.length >= queueLimit) {
      reject(taggedError("busy", "PDF extraction queue is full"));
      return;
    }
    const entry = {
      grant: resolve,
      onAbort: null,
      timer: null,
      cancel: () => {
        clearTimeout(entry.timer);
        entry.timer = null;
        if (entry.onAbort) signal?.removeEventListener("abort", entry.onAbort);
        entry.onAbort = null;
      },
    };
    entry.onAbort = () => {
      entry.cancel();
      const index = waiting.indexOf(entry);
      if (index >= 0) waiting.splice(index, 1);
      reject(taggedError("aborted", "PDF extraction was cancelled"));
    };
    signal?.addEventListener("abort", entry.onAbort, { once: true });
    const remaining = Number(deadline) - Date.now();
    if (Number.isFinite(remaining)) {
      entry.timer = setTimeout(() => {
        entry.timer = null;
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
        entry.cancel();
        reject(taggedError("timeout", "PDF extraction deadline passed while queued"));
      }, Math.max(0, remaining));
    }
    waiting.push(entry);
  });

  return {
    acquire,
    snapshot: () => ({
      active,
      queued: waiting.length,
      maximumConcurrent: concurrentLimit,
      maximumQueued: queueLimit,
    }),
  };
}

const defaultLimiter = createPdfExtractionLimiter();

function clamp(value, fallback, minimum, maximum) {
  const configured = Number(value);
  const resolved = Number.isFinite(configured) ? configured : fallback;
  return Math.max(minimum, Math.min(Math.trunc(resolved), maximum));
}

function resolveSettings(options = {}) {
  const configuredTermination = Number(options.terminateTimeoutMs);
  return {
    maximumInputBytes: clamp(
      options.maximumInputBytes,
      PDF_EXTRACTION_LIMITS.maximumInputBytes,
      1,
      PDF_EXTRACTION_LIMITS.maximumInputBytes,
    ),
    maximumPages: clamp(options.maximumPages, PDF_EXTRACTION_LIMITS.maximumPages, 1, 2_000),
    maximumTextBytes: clamp(
      options.maximumTextBytes,
      PDF_EXTRACTION_LIMITS.maximumTextBytes,
      1,
      16_000_000,
    ),
    timeoutMs: clamp(options.timeoutMs, PDF_EXTRACTION_LIMITS.timeoutMs, 1, 120_000),
    terminateTimeoutMs: Math.max(10, Math.min(
      Number.isFinite(configuredTermination) ? Math.trunc(configuredTermination) : 500,
      5_000,
    )),
    command: String(options.command || process.env.PDFTOTEXT_PATH || "pdftotext"),
    infoCommand: String(options.infoCommand || process.env.PDFINFO_PATH || "pdfinfo"),
    spawnImpl: typeof options.spawnImpl === "function" ? options.spawnImpl : nodeSpawn,
    tempRoot: String(options.tempRoot || tmpdir()),
    limiter: options.limiter && typeof options.limiter.acquire === "function"
      ? options.limiter
      : defaultLimiter,
    signal: options.signal,
    extractorVersion: typeof options.extractorVersion === "string" ? options.extractorVersion : null,
    // An injected converter is unknown until it reports a version, so the probe
    // only runs against the installed binary.
    probeVersion: !options.spawnImpl && typeof options.extractorVersion !== "string",
  };
}

// Both probes and the conversion run with the same restricted environment: a
// fixed PATH, a locale that cannot change the output encoding, and a TMPDIR in
// the private directory so anything poppler writes is removed with it. The
// parent's environment, and with it every credential in it, never reaches the
// child.
function childEnvironment(workDirectory) {
  return {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: workDirectory,
    TMPDIR: workDirectory,
    LC_ALL: "C",
    LANG: "C",
  };
}

// A bounded subprocess: no shell, bytes on stdin, bounded stdout, bounded
// stderr, one absolute deadline, one abort signal, and a fallback for a child
// that ignores its kill signal. It never rejects; the caller decides what a
// terminated or overflowed conversion means.
function runBounded(command, args, {
  input,
  env,
  signal,
  deadline,
  maximumStdoutBytes,
  maximumStderrBytes = MAXIMUM_STDERR_BYTES,
  spawnImpl,
  terminateTimeoutMs,
}) {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let aborted = Boolean(signal?.aborted);
    let overflow = false;
    let exitCode = null;
    let exitSignal = null;
    let spawnError = null;
    let stdoutBytes = 0;
    let stderrText = "";
    const stdoutChunks = [];
    let child = null;
    let deadlineTimer = null;
    let terminateTimer = null;
    let abortHandler = null;

    const clearTimers = () => {
      clearTimeout(deadlineTimer);
      clearTimeout(terminateTimer);
      deadlineTimer = null;
      terminateTimer = null;
      if (abortHandler) signal.removeEventListener("abort", abortHandler);
      abortHandler = null;
    };
    const outcome = () => ({
      code: exitCode,
      signal: exitSignal,
      stdout: Buffer.concat(stdoutChunks, stdoutBytes),
      stderr: stderrText,
      timedOut,
      aborted,
      overflow,
      spawnError,
    });
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve(outcome());
    };
    const terminate = () => {
      if (settled) return;
      try {
        child?.kill("SIGKILL");
      } catch {
        // The child is already gone; the close event is what settles this run.
      }
      if (terminateTimer) return;
      // A converter that survives SIGKILL must not hold the caller open past the
      // deadline it was given.
      terminateTimer = setTimeout(settle, terminateTimeoutMs);
    };

    if (aborted) {
      resolve(outcome());
      return;
    }
    if (Number(deadline) <= Date.now()) {
      timedOut = true;
      resolve(outcome());
      return;
    }
    try {
      child = spawnImpl(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        env,
      });
    } catch (error) {
      spawnError = error;
      resolve(outcome());
      return;
    }

    child.once("error", (error) => {
      spawnError = error;
      terminate();
      settle();
    });
    child.once("close", (code, signalName) => {
      exitCode = code;
      exitSignal = signalName;
      settle();
    });
    child.stdout?.on("data", (chunk) => {
      if (settled || overflow) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stdoutBytes += bytes.length;
      if (stdoutBytes > maximumStdoutBytes) {
        overflow = true;
        terminate();
        return;
      }
      stdoutChunks.push(bytes);
    });
    child.stderr?.on("data", (chunk) => {
      if (settled || stderrText.length >= maximumStderrBytes) return;
      stderrText += String(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
      if (stderrText.length > maximumStderrBytes) stderrText = stderrText.slice(0, maximumStderrBytes);
    });
    child.stdin?.on("error", () => {
      // A converter that refuses the document closes its stdin before the write
      // finishes; the exit status is the answer, not the broken pipe.
    });
    try {
      if (input && input.length) child.stdin?.end(input);
      else child.stdin?.end();
    } catch {
      // The child may have exited between spawn and the write.
    }
    if (signal) {
      abortHandler = () => {
        aborted = true;
        terminate();
      };
      signal.addEventListener("abort", abortHandler, { once: true });
    }
    const remaining = Number(deadline) - Date.now();
    deadlineTimer = setTimeout(() => {
      deadlineTimer = null;
      timedOut = true;
      terminate();
    }, Math.max(0, remaining));
  });
}

function sanitizeDetail(value) {
  const line = String(value || "")
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .find((part) => part.length > 0) ?? "";
  const cleaned = line.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
  return cleaned ? cleaned.slice(0, 200) : null;
}

function describeSpawnError(error) {
  const code = String(error?.code || "").trim();
  if (code === "ENOENT") return "PDF converter is not installed in this runtime";
  return code ? `PDF converter could not start (${code.slice(0, 40)})` : "PDF converter could not start";
}

function isPasswordFailure(value) {
  return /password/iu.test(String(value || ""));
}

function parseInfo(value) {
  const text = value.toString("utf8");
  const pages = /^Pages:\s+(\d+)\s*$/mu.exec(text);
  return {
    pageCount: pages ? Number(pages[1]) : null,
    encrypted: /^Encrypted:\s+yes\b/imu.test(text),
  };
}

function normalizePageText(value) {
  return String(value)
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .trim();
}

// The converter separates pages with a form feed and writes one after the last
// page, so a page that holds no text still occupies its own position. The index
// of the piece is the only page number this module publishes; nothing is
// renumbered because a page came back empty.
function splitPages(value) {
  const pieces = String(value).split("\f");
  if (pieces.length && pieces[pieces.length - 1].trim() === "") pieces.pop();
  return pieces.map((piece, index) => ({ pageNumber: index + 1, text: normalizePageText(piece) }));
}

function failure(status, detail = null, pageCount = null) {
  return { status, pages: [], pageCount, extractorVersion: null, detail };
}

let cachedExtractorVersion = null;
let extractorVersionProbed = false;

async function readExtractorVersion(settings) {
  if (settings.extractorVersion) return settings.extractorVersion;
  if (!settings.probeVersion) return null;
  if (extractorVersionProbed) return cachedExtractorVersion;
  extractorVersionProbed = true;
  const probe = await runBounded(settings.command, ["-v"], {
    input: null,
    env: childEnvironment(settings.tempRoot),
    signal: null,
    deadline: Date.now() + VERSION_TIMEOUT_MS,
    maximumStdoutBytes: 4_096,
    spawnImpl: settings.spawnImpl,
    terminateTimeoutMs: settings.terminateTimeoutMs,
  });
  const reported = /pdftotext version (\d[\w.+-]*)/u.exec(probe.stderr)?.[1] ?? null;
  cachedExtractorVersion = reported ? `poppler-${reported}` : null;
  return cachedExtractorVersion;
}

/**
 * Extracts the text of an approved public PDF into positioned pages.
 *
 * The call never schedules itself and holds no request context: an indexer
 * decides when a document is converted, and this function answers one document.
 * Every failure is a status, because a textless, encrypted or oversized file is
 * a normal answer about a source and not an exception a caller has to catch.
 * The bytes are read from stdin for the same reason the input is never written
 * to a path a publisher controls: only this process names the temporary place,
 * and it removes it in `finally` whatever the outcome was.
 */
export async function extractPdfPages(bytes, options = {}) {
  const view = toByteView(bytes);
  if (!view) throw new TypeError("PDF extraction requires the document bytes");
  const settings = resolveSettings(options);

  // A declared content type is a second gate in front of the signature. An
  // absent header is not a claim, so it is left to the bytes; a header that names
  // something other than a PDF is refused even when the bytes look like one.
  const declaredType = options.contentType;
  const hasDeclaredType = declaredType !== undefined
    && declaredType !== null
    && String(declaredType).trim() !== "";
  if (hasDeclaredType && !isPdfContentType(declaredType)) {
    return failure("unsupported-content-type");
  }
  if (!isPdfSignature(view)) return failure("invalid-signature");
  if (view.length > settings.maximumInputBytes) {
    return failure("too-large", `document is ${view.length} bytes`, null);
  }
  if (hasEncryptionMarker(view)) return failure("encrypted");

  const deadline = Date.now() + settings.timeoutMs;
  let release = null;
  try {
    release = await settings.limiter.acquire({ signal: settings.signal, deadline });
  } catch (error) {
    const status = ["aborted", "timeout", "busy"].includes(error?.code) ? error.code : "aborted";
    return failure(status);
  }

  let workDirectory = null;
  try {
    try {
      workDirectory = await mkdtemp(join(settings.tempRoot, "praktika-pdf-"));
    } catch {
      return failure("unavailable", "PDF extraction temporary directory is unavailable");
    }
    const env = childEnvironment(workDirectory);
    const common = {
      env,
      signal: settings.signal,
      deadline,
      spawnImpl: settings.spawnImpl,
      terminateTimeoutMs: settings.terminateTimeoutMs,
    };

    const info = await runBounded(settings.infoCommand, ["-"], {
      ...common,
      input: view,
      maximumStdoutBytes: 65_536,
    });
    if (info.aborted) return failure("aborted");
    if (info.timedOut) return failure("timeout");
    if (info.spawnError) return failure("unavailable", describeSpawnError(info.spawnError));
    if (info.code !== 0 && isPasswordFailure(info.stderr)) return failure("encrypted");
    if (info.code !== 0) return failure("corrupt", sanitizeDetail(info.stderr));
    const metadata = parseInfo(info.stdout);
    if (metadata.encrypted) return failure("encrypted");
    if (metadata.pageCount !== null && metadata.pageCount > settings.maximumPages) {
      return failure("too-many-pages", null, metadata.pageCount);
    }

    // A page count is what makes the converter's page range provable: with it the
    // run covers exactly the document, and without it the whole file is read and
    // the count is checked afterwards instead of a prefix being called an index.
    const range = metadata.pageCount === null
      ? []
      : ["-f", "1", "-l", String(metadata.pageCount)];
    const converted = await runBounded(settings.command, ["-layout", "-enc", "UTF-8", ...range, "-", "-"], {
      ...common,
      input: view,
      maximumStdoutBytes: settings.maximumTextBytes + 65_536,
    });
    if (converted.aborted) return failure("aborted");
    if (converted.timedOut) return failure("timeout");
    if (converted.overflow) return failure("text-too-large");
    if (converted.spawnError) return failure("unavailable", describeSpawnError(converted.spawnError));
    if (converted.code !== 0) {
      if (isPasswordFailure(converted.stderr)) return failure("encrypted");
      return failure("corrupt", sanitizeDetail(converted.stderr));
    }
    if (converted.stdout.length > settings.maximumTextBytes) return failure("text-too-large");

    const pages = splitPages(converted.stdout.toString("utf8"));
    if (metadata.pageCount !== null && pages.length !== metadata.pageCount) {
      // The page number is the locator this module publishes, so a boundary the
      // converter did not honour is a corrupt answer about the document, never a
      // shorter document with silently shifted page numbers.
      return failure("corrupt", "page boundaries do not match the document page count");
    }
    if (!pages.length || pages.every((page) => page.text === "")) {
      return failure("textless", null, metadata.pageCount ?? pages.length);
    }
    if (pages.length > settings.maximumPages) return failure("too-many-pages", null, pages.length);

    return {
      status: "ok",
      pages,
      pageCount: pages.length,
      extractorVersion: await readExtractorVersion(settings),
      detail: null,
    };
  } finally {
    if (workDirectory) {
      await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
    if (release) release();
  }
}
