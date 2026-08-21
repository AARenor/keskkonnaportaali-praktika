import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import proxyaddr from "proxy-addr";

const trustedProxyLists = new Map();
export const DEFAULT_IPV6_CLIENT_PREFIX_BITS = 64;

function firstHeaderValue(value) {
  return String(value || "").split(",")[0].trim();
}

function normalizedIpAddress(value) {
  const address = firstHeaderValue(value);
  try {
    const parsed = ipaddr.parse(address.split("%", 1)[0]);
    if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
      return parsed.toIPv4Address().toString();
    }
  } catch {
    // The caller's IP-family check handles malformed addresses below.
  }
  return address;
}

export function createProxyTrust(value = "") {
  const configured = String(value || "").trim();
  if (!configured) return () => false;
  if (trustedProxyLists.has(configured)) return trustedProxyLists.get(configured);
  const entries = configured.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (entries.some((entry) => ["0.0.0.0/0", "::/0"].includes(entry.toLocaleLowerCase("en")))) {
    throw new Error("TRUSTED_PROXY_CIDRS must not trust every network");
  }
  let trust;
  try {
    trust = proxyaddr.compile(entries);
  } catch (error) {
    throw new Error(`TRUSTED_PROXY_CIDRS is invalid: ${error.message}`);
  }
  if (trustedProxyLists.size >= 8) trustedProxyLists.delete(trustedProxyLists.keys().next().value);
  trustedProxyLists.set(configured, trust);
  return trust;
}

export function resolveProxyConfiguration({
  mode = process.env.PROXY_MODE,
  trustedProxyCidrs = process.env.TRUSTED_PROXY_CIDRS,
  publicOrigin = process.env.PUBLIC_ORIGIN,
  environment = process.env.NODE_ENV,
  port = process.env.PORT,
} = {}) {
  const requestedMode = String(mode || "").trim().toLocaleLowerCase("en");
  const rawOrigin = String(publicOrigin || "").trim();
  const origin = rawOrigin ? canonicalHttpOrigin(rawOrigin, { requestHeader: true }) : "";
  const cidrs = String(trustedProxyCidrs || "").trim();
  const environmentName = String(environment || "").trim().toLocaleLowerCase("en");
  const production = environmentName === "production";
  if (!requestedMode && production) {
    throw new Error("PROXY_MODE must be explicit in production: direct or trusted");
  }
  if (rawOrigin && !origin) {
    throw new Error("PUBLIC_ORIGIN must be one exact HTTP(S) origin without credentials, path, query or fragment");
  }
  if (origin) {
    const parsedOrigin = new URL(origin);
    const hostname = parsedOrigin.hostname.replace(/^\[|\]$/gu, "").toLocaleLowerCase("en");
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(hostname);
    if (parsedOrigin.protocol !== "https:" && !loopback) {
      throw new Error("PUBLIC_ORIGIN must use HTTPS except for a literal loopback development origin");
    }
  }
  const selectedMode = requestedMode || "direct";
  if (!["direct", "trusted"].includes(selectedMode)) {
    throw new Error("PROXY_MODE must be direct or trusted");
  }
  if (production && !origin) {
    throw new Error("PUBLIC_ORIGIN is required in production for browser-facing routes");
  }
  const parsedPort = Number(port || 3000);
  const localPort = Number.isSafeInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65_535
    ? parsedPort
    : 3000;
  const browserOrigins = origin ? [origin] : [
    `http://localhost:${localPort}`,
    `http://127.0.0.1:${localPort}`,
    `http://[::1]:${localPort}`,
  ];
  if (selectedMode === "direct") {
    if (cidrs) throw new Error("TRUSTED_PROXY_CIDRS requires PROXY_MODE=trusted");
    return {
      mode: selectedMode,
      publicOrigin: origin,
      browserOrigins,
      trustedProxyCidrs: "",
      trust: createProxyTrust(""),
    };
  }
  if (!cidrs) {
    throw new Error("TRUSTED_PROXY_CIDRS is required when PROXY_MODE=trusted");
  }
  if (!origin) {
    throw new Error("PUBLIC_ORIGIN is required when PROXY_MODE=trusted");
  }
  return {
    mode: selectedMode,
    publicOrigin: origin,
    browserOrigins,
    trustedProxyCidrs: cidrs,
    trust: createProxyTrust(cidrs),
  };
}

function socketAddress(request = {}) {
  return normalizedIpAddress(request.socket?.remoteAddress || request.connection?.remoteAddress);
}

export function requestFromTrustedProxy(request = {}, configuredCidrs = "") {
  const address = socketAddress(request);
  return Boolean(isIP(address) && createProxyTrust(configuredCidrs)(address, 0));
}

export function requestAuditAddress(request = {}, configuredCidrs = "") {
  try {
    const address = normalizedIpAddress(proxyaddr(request, createProxyTrust(configuredCidrs)));
    if (isIP(address)) return address;
  } catch {
    // A malformed forwarding chain fails closed to the immediate peer below.
  }
  const address = socketAddress(request);
  return isIP(address) ? address : "unknown";
}

export function resolveIpv6ClientPrefixBits(value = process.env.IPV6_CLIENT_PREFIX_BITS) {
  const configured = String(value ?? "").trim();
  if (!configured) return DEFAULT_IPV6_CLIENT_PREFIX_BITS;
  if (!/^\d{1,3}$/u.test(configured)) {
    throw new Error("IPV6_CLIENT_PREFIX_BITS must be an integer from 32 to 128");
  }
  const bits = Number(configured);
  if (bits < 32 || bits > 128) {
    throw new Error("IPV6_CLIENT_PREFIX_BITS must be an integer from 32 to 128");
  }
  return bits;
}

export function aggregateClientAddress(
  value,
  prefixBits = resolveIpv6ClientPrefixBits(),
) {
  const address = normalizedIpAddress(value);
  const family = isIP(address);
  if (family === 4) return address;
  if (family !== 6) return "unknown";
  const bits = resolveIpv6ClientPrefixBits(prefixBits);
  try {
    const parsed = ipaddr.parse(address.split("%", 1)[0]);
    if (parsed.kind() !== "ipv6") return "unknown";
    const bytes = parsed.toByteArray();
    for (let index = 0; index < bytes.length; index += 1) {
      const remaining = bits - (index * 8);
      if (remaining >= 8) continue;
      if (remaining <= 0) bytes[index] = 0;
      else bytes[index] &= (0xff << (8 - remaining)) & 0xff;
    }
    return `${ipaddr.fromByteArray(bytes).toString()}/${bits}`;
  } catch {
    // Parser disagreement must collapse identities instead of granting a new
    // quota for every alternate textual representation.
    return `ipv6-unparseable/${bits}`;
  }
}

export function requestRateLimitAddress(
  request = {},
  configuredCidrs = "",
  { ipv6PrefixBits = resolveIpv6ClientPrefixBits() } = {},
) {
  return aggregateClientAddress(
    requestAuditAddress(request, configuredCidrs),
    ipv6PrefixBits,
  );
}

export function canonicalHttpOrigin(value, { requestHeader = false } = {}) {
  try {
    const parsed = new URL(String(value || ""));
    if (!["http:", "https:"].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || (requestHeader && (parsed.pathname !== "/" || parsed.search || parsed.hash))) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

export function canonicalApiRoutePath(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(value || "").normalize("NFKC"));
  } catch {
    return "";
  }
  if (!decoded.startsWith("/") || /[\u0000-\u001f\u007f]/u.test(decoded)) return "";
  const segments = [];
  for (const segment of decoded.split(/\/+/u)) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment.toLocaleLowerCase("en"));
  }
  return `/${segments.join("/")}`;
}

export function assessSameOriginBrowserRequest({
  expectedOrigin,
  expectedOrigins,
  fetchSite,
  origin,
  requestOrigin,
} = {}) {
  const browserSite = String(fetchSite || "").trim().toLocaleLowerCase("en");
  if (browserSite && !["same-origin", "none"].includes(browserSite)) {
    return { ok: false, status: 403, reason: "cross-origin-browser-request" };
  }

  const suppliedOrigin = String(origin || "").trim();
  const browserRequest = Boolean(browserSite || suppliedOrigin);
  if (browserRequest) {
    const acceptedOrigins = new Set([
      ...(Array.isArray(expectedOrigins) ? expectedOrigins : []),
      expectedOrigin,
    ].map((value) => canonicalHttpOrigin(value, { requestHeader: true })).filter(Boolean));
    const observedOrigin = canonicalHttpOrigin(requestOrigin, { requestHeader: true });
    if (!acceptedOrigins.size || !observedOrigin || !acceptedOrigins.has(observedOrigin)) {
      return { ok: false, status: 403, reason: "origin-mismatch" };
    }
  }
  if (suppliedOrigin) {
    const acceptedOrigins = new Set([
      ...(Array.isArray(expectedOrigins) ? expectedOrigins : []),
      expectedOrigin,
    ].map((value) => canonicalHttpOrigin(value, { requestHeader: true })).filter(Boolean));
    const browserOrigin = canonicalHttpOrigin(suppliedOrigin, { requestHeader: true });
    if (!browserOrigin || !acceptedOrigins.has(browserOrigin)) {
      return { ok: false, status: 403, reason: "origin-mismatch" };
    }
  }

  return { ok: true, status: 200, reason: "accepted" };
}

export function assessSameOriginJsonRequest({
  contentType,
  expectedOrigin,
  expectedOrigins,
  fetchSite,
  origin,
  requestOrigin,
} = {}) {
  const mediaType = String(contentType || "").split(";", 1)[0].trim().toLocaleLowerCase("en");
  if (mediaType !== "application/json") {
    return { ok: false, status: 415, reason: "application-json-required" };
  }
  return assessSameOriginBrowserRequest({
    expectedOrigin,
    expectedOrigins,
    fetchSite,
    origin,
    requestOrigin,
  });
}

export function createFixedWindowRateLimiter({
  maxRequests,
  scope,
  store = new Map(),
  windowMs = 60_000,
  maxKeys = 2_000,
  now = () => Date.now(),
  trustedProxyCidrs,
  ipv6PrefixBits = process.env.IPV6_CLIENT_PREFIX_BITS,
} = {}) {
  const maximum = Math.max(1, Math.min(Number(maxRequests) || 1, 10_000));
  const boundedWindowMs = Math.max(1_000, Math.min(Number(windowMs) || 60_000, 60 * 60_000));
  const boundedMaxKeys = Math.max(100, Math.min(Number(maxKeys) || 2_000, 100_000));
  const operation = String(scope || "api").replace(/[^a-z0-9:_-]/giu, "-").slice(0, 80) || "api";
  const clientPrefixBits = resolveIpv6ClientPrefixBits(ipv6PrefixBits);

  return (request, response, next) => {
    const currentTime = Number(now()) || Date.now();
    const key = `${requestRateLimitAddress(request, trustedProxyCidrs, {
      ipv6PrefixBits: clientPrefixBits,
    })}:${operation}`;
    let entry = store.get(key);
    if (!entry || currentTime - entry.startedAt >= boundedWindowMs) {
      entry = { startedAt: currentTime, count: 0 };
      store.set(key, entry);
    }
    entry.count += 1;

    if (store.size > boundedMaxKeys) {
      for (const [entryKey, candidate] of store) {
        if (currentTime - candidate.startedAt >= boundedWindowMs) store.delete(entryKey);
      }
      while (store.size > boundedMaxKeys) store.delete(store.keys().next().value);
    }

    if (entry.count > maximum) {
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil(boundedWindowMs / 1_000))));
      return response.status(429).json({ error: "Liiga palju päringuid. Proovi minuti pärast uuesti." });
    }
    return next();
  };
}

export function bindRequestAbort(request, response) {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException("The client disconnected", "AbortError"));
    }
  };
  const abortClosedResponse = () => {
    if (!response.writableEnded) abort();
  };
  request.once?.("aborted", abort);
  response.once?.("close", abortClosedResponse);
  if (request.aborted || response.destroyed) abort();
  return {
    controller,
    cleanup() {
      request.off?.("aborted", abort);
      response.off?.("close", abortClosedResponse);
    },
  };
}
