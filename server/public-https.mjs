import { lookup as dnsLookup } from "node:dns";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const blockedIpv4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) blockedIpv4.addSubnet(address, prefix, "ipv4");

const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");
const blockedIpv6 = new BlockList();
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) blockedIpv6.addSubnet(address, prefix, "ipv6");

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// A document body and a PDF artifact are not the same resource: the text reader
// asks for pages and stops at four megabytes, while an approved PDF attachment
// can legitimately be larger. Both ceilings are transport constants, so a caller
// can lower its own bound but never raise the one the process enforces.
const MAXIMUM_TEXT_BYTES = 8_000_000;
const DEFAULT_TEXT_BYTES = 4_000_000;
const MAXIMUM_BINARY_BYTES = 16_000_000;
const DEFAULT_BINARY_BYTES = 12_000_000;

export const PUBLIC_HTTPS_LIMITS = Object.freeze({
  textBytes: MAXIMUM_TEXT_BYTES,
  defaultTextBytes: DEFAULT_TEXT_BYTES,
  binaryBytes: MAXIMUM_BINARY_BYTES,
  defaultBinaryBytes: DEFAULT_BINARY_BYTES,
});

export const DEFAULT_TEXT_ACCEPT = "text/html,application/xhtml+xml,text/plain,text/csv;q=0.9,*/*;q=0.5";
export const DEFAULT_BINARY_ACCEPT = "application/pdf,application/x-pdf;q=0.9,application/octet-stream;q=0.5,*/*;q=0.1";

export function isPublicIpAddress(value) {
  const address = String(value || "").replace(/%.+$/u, "");
  const family = isIP(address);
  if (family === 4) return !blockedIpv4.check(address, "ipv4");
  if (family === 6) {
    return globalIpv6.check(address, "ipv6") && !blockedIpv6.check(address, "ipv6");
  }
  return false;
}

export function validateApprovedPublicHttpsUrl(value, approvedOrigins) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("Outbound URL is invalid");
  }
  const origins = approvedOrigins instanceof Set ? approvedOrigins : new Set(approvedOrigins || []);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || !origins.has(url.origin)) {
    throw new Error("Outbound URL is outside the approved HTTPS origins");
  }
  // Node reports an IPv6 literal with its brackets on `hostname`, so the address
  // check has to look at the address itself rather than at the bracketed host.
  const literal = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  if (isIP(literal) && !isPublicIpAddress(literal)) {
    throw new Error("Outbound URL resolves to a non-public address");
  }
  return url;
}

export function createPublicOnlyLookup(lookupImpl = dnsLookup) {
  return (hostname, options = {}, callback) => {
    const literalFamily = isIP(hostname);
    if (literalFamily) {
      if (!isPublicIpAddress(hostname)) {
        callback(new Error("Outbound hostname is a non-public address"));
        return;
      }
      if (options.all) callback(null, [{ address: hostname, family: literalFamily }]);
      else callback(null, hostname, literalFamily);
      return;
    }
    lookupImpl(hostname, {
      all: true,
      verbatim: true,
      ...(Number(options.family) ? { family: Number(options.family) } : {}),
      ...(Number(options.hints) ? { hints: Number(options.hints) } : {}),
    }, (error, addresses) => {
      if (error) {
        callback(error);
        return;
      }
      const resolved = Array.isArray(addresses) ? addresses : [];
      if (!resolved.length || resolved.some((entry) => !isPublicIpAddress(entry?.address))) {
        callback(new Error("Outbound hostname has a non-public DNS answer"));
        return;
      }
      const selected = resolved[0];
      if (options.all) {
        callback(null, resolved.map((entry) => ({
          address: entry.address,
          family: Number(entry.family) || isIP(entry.address),
        })));
      } else {
        callback(null, selected.address, Number(selected.family) || isIP(selected.address));
      }
    });
  };
}

// A publisher can repeat a header instead of listing every directive in one
// value, and Node joins repeated non-set-cookie headers into a single string on
// `headers`. The instance boundary is what carries an X-Robots-Tag scope, so the
// instances are taken from `headersDistinct` or `rawHeaders` when the response
// reports them, while a caller-supplied string, array or Headers object is
// passed through in the shape it arrived in. Nothing is truncated or collapsed
// here: the header block is already bounded by Node's own header limit, and a
// consumer that has to bound it further fails closed instead of dropping a
// directive that arrived after the cut.
function responseHeaderInstances(response, name) {
  const target = String(name).toLocaleLowerCase("en-US");
  const distinct = response?.headersDistinct;
  if (distinct && typeof distinct === "object") {
    const value = distinct[target];
    if (Array.isArray(value)) return value.map((entry) => String(entry ?? ""));
    if (value !== undefined && value !== null) return [String(value)];
  }
  const raw = Array.isArray(response?.rawHeaders) ? response.rawHeaders : null;
  if (raw) {
    const values = [];
    for (let index = 0; index + 1 < raw.length; index += 2) {
      if (String(raw[index] ?? "").trim().toLocaleLowerCase("en-US") !== target) continue;
      values.push(String(raw[index + 1] ?? ""));
    }
    if (values.length) return values;
  }
  const headers = response?.headers;
  const value = headers && typeof headers.get === "function" ? headers.get(target) : headers?.[target];
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? ""));
  return value === undefined || value === null ? [] : [String(value)];
}

function firstHeaderInstance(headers, name) {
  const value = headers && typeof headers.get === "function" ? headers.get(name) : headers?.[name];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function abortReason(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

async function awaitWhileConnected(promise, signal) {
  const pending = Promise.resolve(promise);
  if (!signal) return pending;
  if (signal.aborted) {
    // The hook may abort and reject in the same turn. Observe its rejection
    // even though the caller receives the abort instead.
    pending.catch(() => undefined);
    throw abortReason(signal);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then((value) => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    }, (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}

function requestOnce(url, {
  headers,
  signal,
  maximumBytes,
  lookupImpl,
  requestImpl,
  method = "GET",
  body = "",
  ca,
  family,
  accept = DEFAULT_TEXT_ACCEPT,
} = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let response;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const fail = (error) => finish(reject, error);
    const request = requestImpl(url, {
      method,
      headers: {
        Accept: accept,
        "Accept-Encoding": "identity",
        ...headers,
      },
      lookup: createPublicOnlyLookup(lookupImpl),
      ...(ca ? { ca } : {}),
      ...([4, 6].includes(Number(family)) ? { family: Number(family) } : {}),
      signal,
    }, (incoming) => {
      response = incoming;
      response.once("error", fail);
      const status = Number(response.statusCode || 0);
      const location = Array.isArray(response.headers?.location)
        ? response.headers.location[0]
        : response.headers?.location;
      if (REDIRECT_STATUSES.has(status)) {
        response.destroy();
        finish(resolve, { status, location: String(location || ""), body: null });
        return;
      }
      const declared = response.headers?.["content-length"];
      if (declared !== undefined) {
        const size = Number(Array.isArray(declared) ? declared[0] : declared);
        if (!Number.isSafeInteger(size) || size < 0 || size > maximumBytes) {
          const error = new Error("Outbound response is too large");
          fail(error);
          request.destroy(error);
          return;
        }
      }
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        if (settled) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > maximumBytes) {
          const error = new Error("Outbound response is too large");
          fail(error);
          request.destroy(error);
          return;
        }
        chunks.push(bytes);
      });
      response.once("end", () => finish(resolve, {
        status,
        location: "",
        body: Buffer.concat(chunks, size),
        headers: Object.freeze({
          "content-type": firstHeaderInstance(response.headers, "content-type").slice(0, 240),
          "content-profile": firstHeaderInstance(response.headers, "content-profile").slice(0, 120),
          // Every instance is kept, in arrival order and unmodified, because a
          // value that arrives after another one still carries its own crawler
          // scope and its own directives.
          "x-robots-tag": Object.freeze(responseHeaderInstances(response, "x-robots-tag")),
        }),
      }));
      response.once("aborted", () => fail(new Error("Outbound response was interrupted")));
    });
    request.once("socket", (socket) => {
      const validatePeer = () => {
        if (socket.remoteAddress && !isPublicIpAddress(socket.remoteAddress)) {
          request.destroy(new Error("Outbound connection reached a non-public address"));
        }
      };
      if (socket.remoteAddress) validatePeer();
      else socket.once("secureConnect", validatePeer);
    });
    request.once("error", fail);
    request.end(body || undefined);
  });
}

// One redirect loop serves every approved public read. The origin allowlist, the
// redirect bound, the destination policy hook and the caller signal are decided
// once here, and each entry point only chooses its own byte ceiling and what the
// collected bytes mean.
async function requestApprovedPublicHttpsArtifact(value, {
  approvedOrigins,
  headers,
  signal,
  maximumBytes,
  maximumRedirects = 3,
  lookupImpl = dnsLookup,
  requestImpl = httpsRequest,
  ca,
  family,
  assertRedirectAllowed,
  accept = DEFAULT_TEXT_ACCEPT,
} = {}) {
  const configuredRedirectLimit = Number(maximumRedirects);
  const redirectLimit = Math.max(0, Math.min(
    Number.isFinite(configuredRedirectLimit) ? configuredRedirectLimit : 3,
    5,
  ));
  let current = validateApprovedPublicHttpsUrl(value, approvedOrigins);
  for (let redirects = 0; redirects <= redirectLimit; redirects += 1) {
    const result = await requestOnce(current, {
      headers,
      signal,
      maximumBytes,
      lookupImpl,
      requestImpl,
      ca,
      family,
      accept,
    });
    if (!REDIRECT_STATUSES.has(result.status)) return { ...result, url: current.toString() };
    if (!result.location || redirects === redirectLimit) {
      throw new Error("Outbound response redirected too many times or without a destination");
    }
    const destination = validateApprovedPublicHttpsUrl(
      new URL(result.location, current),
      approvedOrigins,
    );
    // A followed redirect is a request to another address, so the caller may
    // settle that address's publisher policy before this transport connects to
    // it. The approved-origin check above already ran, so the hook never sees an
    // address the allowlist does not hold, and the hook is bounded by the same
    // caller signal as the request: an answer that arrives after the deadline is
    // abandoned instead of holding the reader open.
    if (typeof assertRedirectAllowed === "function") {
      // A read that is already aborted never starts the policy lookup: its
      // answer could only be discarded, and the caller is owed the abort now.
      if (signal?.aborted) throw abortReason(signal);
      await awaitWhileConnected(assertRedirectAllowed(destination, {
        from: current.toString(),
        status: result.status,
        redirects: redirects + 1,
        signal,
      }), signal);
    }
    current = destination;
  }
  throw new Error("Outbound response redirected too many times");
}

// The text reader keeps the behaviour every existing caller depends on: the same
// options, the same ceiling, and one decode at this boundary.
export async function requestApprovedPublicHttpsText(value, options = {}) {
  const byteLimit = Math.max(1, Math.min(
    Number(options.maximumBytes) || DEFAULT_TEXT_BYTES,
    MAXIMUM_TEXT_BYTES,
  ));
  const result = await requestApprovedPublicHttpsArtifact(value, {
    ...options,
    maximumBytes: byteLimit,
    accept: options.accept || DEFAULT_TEXT_ACCEPT,
  });
  return { ...result, body: result.body.toString("utf8") };
}

// A byte preserving read of an approved public artifact. The bytes are never
// decoded here: a PDF round tripped through utf8 loses its binary structure, and
// a signature check downstream could no longer tell an intact file from a
// damaged one.
export async function requestApprovedPublicHttpsBytes(value, options = {}) {
  const byteLimit = Math.max(1, Math.min(
    Number(options.maximumBytes) || DEFAULT_BINARY_BYTES,
    MAXIMUM_BINARY_BYTES,
  ));
  return requestApprovedPublicHttpsArtifact(value, {
    ...options,
    maximumBytes: byteLimit,
    accept: options.accept || DEFAULT_BINARY_ACCEPT,
  });
}

export async function requestApprovedPublicHttpsJsonPost(value, {
  approvedOrigins,
  body,
  headers,
  signal,
  maximumBytes = 256_000,
  maximumRequestBytes = 64_000,
  lookupImpl = dnsLookup,
  requestImpl = httpsRequest,
  ca,
  family,
} = {}) {
  const current = validateApprovedPublicHttpsUrl(value, approvedOrigins);
  const requestBody = typeof body === "string" ? body : "";
  const requestBytes = Buffer.byteLength(requestBody, "utf8");
  const requestByteLimit = Math.max(1, Math.min(
    Number(maximumRequestBytes) || 64_000,
    1_000_000,
  ));
  if (!requestBody || requestBytes > requestByteLimit) {
    throw new Error("Outbound JSON request body is missing or too large");
  }
  let parsed;
  try {
    parsed = JSON.parse(requestBody);
  } catch {
    throw new Error("Outbound JSON request body is invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Outbound JSON request body must be an object");
  }
  const byteLimit = Math.max(1, Math.min(Number(maximumBytes) || 256_000, 1_000_000));
  const allowedHeaderNames = new Set([
    "authorization",
    "idempotency-key",
    "openai-beta",
    "openai-organization",
    "openai-project",
    "origin",
    "user-agent",
  ]);
  let headerEntries = [];
  if (headers && typeof headers.entries === "function") headerEntries = [...headers.entries()];
  else if (Array.isArray(headers)) headerEntries = headers;
  else if (headers && typeof headers === "object") headerEntries = Object.entries(headers);
  if (headerEntries.length > 32) throw new Error("Outbound JSON request has too many headers");
  const forwardedHeaders = {};
  let headerBytes = 0;
  for (const [rawName, rawValue] of headerEntries) {
    const name = String(rawName || "").trim().toLocaleLowerCase("en-US");
    if (!allowedHeaderNames.has(name) && !name.startsWith("x-stainless-")) continue;
    const value = String(rawValue ?? "");
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/u.test(name)
      || /[\u0000-\u001f\u007f]/u.test(value)
      || Buffer.byteLength(value, "utf8") > 8_192) {
      throw new Error("Outbound JSON request has an invalid header");
    }
    headerBytes += Buffer.byteLength(name, "utf8") + Buffer.byteLength(value, "utf8");
    if (headerBytes > 16_384) throw new Error("Outbound JSON request headers are too large");
    forwardedHeaders[name] = value;
  }
  const result = await requestOnce(current, {
    method: "POST",
    body: requestBody,
    headers: {
      ...forwardedHeaders,
      Accept: "application/json",
      "Accept-Encoding": "identity",
      "Content-Type": "application/json",
      "Content-Length": String(requestBytes),
      "User-Agent": "Keskkonnaportaali-praktika/4.0 (+https://praktika.arle.top)",
    },
    signal,
    maximumBytes: byteLimit,
    lookupImpl,
    requestImpl,
    ca,
    family,
  });
  if (REDIRECT_STATUSES.has(result.status)) {
    throw new Error("Outbound JSON POST redirects are not allowed");
  }
  // The JSON reader owns its own decode boundary, exactly like the text reader:
  // its callers parse a JSON string, so the collected bytes are decoded once
  // here instead of handing a Buffer to a contract that never had one.
  return { ...result, body: result.body.toString("utf8"), url: current.toString() };
}
