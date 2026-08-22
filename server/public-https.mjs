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
  if (isIP(url.hostname) && !isPublicIpAddress(url.hostname)) {
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

function requestOnce(url, {
  headers,
  signal,
  maximumBytes,
  lookupImpl,
  requestImpl,
  method = "GET",
  body = "",
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
        Accept: "text/html,application/xhtml+xml,text/plain,text/csv;q=0.9,*/*;q=0.5",
        "Accept-Encoding": "identity",
        ...headers,
      },
      lookup: createPublicOnlyLookup(lookupImpl),
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
        body: Buffer.concat(chunks, size).toString("utf8"),
        headers: Object.freeze({
          "content-type": String(response.headers?.["content-type"] || "").slice(0, 240),
          "content-profile": String(response.headers?.["content-profile"] || "").slice(0, 120),
          "x-robots-tag": String(response.headers?.["x-robots-tag"] || "").slice(0, 240),
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

export async function requestApprovedPublicHttpsText(value, {
  approvedOrigins,
  headers,
  signal,
  maximumBytes = 4_000_000,
  maximumRedirects = 3,
  lookupImpl = dnsLookup,
  requestImpl = httpsRequest,
} = {}) {
  const byteLimit = Math.max(1, Math.min(Number(maximumBytes) || 4_000_000, 8_000_000));
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
      maximumBytes: byteLimit,
      lookupImpl,
      requestImpl,
    });
    if (!REDIRECT_STATUSES.has(result.status)) return { ...result, url: current.toString() };
    if (!result.location || redirects === redirectLimit) {
      throw new Error("Outbound response redirected too many times or without a destination");
    }
    current = validateApprovedPublicHttpsUrl(new URL(result.location, current), approvedOrigins);
  }
  throw new Error("Outbound response redirected too many times");
}

export async function requestApprovedPublicHttpsJsonPost(value, {
  approvedOrigins,
  body,
  signal,
  maximumBytes = 256_000,
  lookupImpl = dnsLookup,
  requestImpl = httpsRequest,
} = {}) {
  const current = validateApprovedPublicHttpsUrl(value, approvedOrigins);
  const requestBody = typeof body === "string" ? body : "";
  const requestBytes = Buffer.byteLength(requestBody, "utf8");
  if (!requestBody || requestBytes > 64_000) {
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
  const result = await requestOnce(current, {
    method: "POST",
    body: requestBody,
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "identity",
      "Content-Type": "application/json",
      "Content-Length": String(requestBytes),
      "User-Agent": "Keskkonnaportaali-praktika/4.0 (+https://praktika.arleserver.cfd)",
    },
    signal,
    maximumBytes: byteLimit,
    lookupImpl,
    requestImpl,
  });
  if (REDIRECT_STATUSES.has(result.status)) {
    throw new Error("Outbound JSON POST redirects are not allowed");
  }
  return { ...result, url: current.toString() };
}
