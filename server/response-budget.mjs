const DEFAULT_HTTP_CONNECTIONS = 256;
const DEFAULT_RESPONSE_IDLE_TIMEOUT_MS = 20_000;
const DEFAULT_RESPONSE_ABSOLUTE_TIMEOUT_MS = 60_000;

const RESERVED_HEALTH_PATHS = new Set([
  "/api/health",
  "/api/health/container-readiness",
]);

function requestHeader(request, name) {
  const viaGetter = request?.get?.(name);
  if (viaGetter !== undefined) return String(viaGetter || "").trim();
  return String(request?.headers?.[String(name).toLocaleLowerCase("en-US")] || "").trim();
}

export function isReservedHealthRequest(request) {
  const method = String(request?.method || "").toLocaleUpperCase("en-US");
  if (!["GET", "HEAD"].includes(method)
    || !RESERVED_HEALTH_PATHS.has(String(request?.path || ""))) return false;
  const contentLength = requestHeader(request, "content-length");
  const transferEncoding = requestHeader(request, "transfer-encoding");
  return (!contentLength || contentLength === "0") && !transferEncoding;
}

export function isHealthRequestPath(request) {
  return RESERVED_HEALTH_PATHS.has(String(request?.path || ""));
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Math.trunc(Number(value));
  return Math.max(minimum, Math.min(Number.isFinite(parsed) ? parsed : fallback, maximum));
}

export function resolvePublicResponseBudget(environment = {}) {
  const maximumConnections = boundedInteger(
    environment.MAX_HTTP_CONNECTIONS,
    DEFAULT_HTTP_CONNECTIONS,
    64,
    2_048,
  );
  const maximumActive = boundedInteger(
    environment.MAX_ACTIVE_PUBLIC_RESPONSES,
    Math.min(224, maximumConnections - 16),
    16,
    maximumConnections - 8,
  );
  const maximumGeneral = boundedInteger(
    environment.MAX_ACTIVE_GENERAL_RESPONSES,
    Math.min(192, maximumActive - 8),
    8,
    maximumActive - 1,
  );
  const maximumPerClient = boundedInteger(
    environment.MAX_ACTIVE_PUBLIC_RESPONSES_PER_CLIENT,
    16,
    2,
    maximumActive,
  );
  const maximumGeneralPerClient = boundedInteger(
    environment.MAX_ACTIVE_GENERAL_RESPONSES_PER_CLIENT,
    12,
    1,
    Math.min(maximumPerClient, maximumGeneral),
  );
  const idleTimeoutMs = boundedInteger(
    environment.PUBLIC_RESPONSE_IDLE_TIMEOUT_MS,
    DEFAULT_RESPONSE_IDLE_TIMEOUT_MS,
    5_000,
    30_000,
  );
  const absoluteTimeoutMs = boundedInteger(
    environment.PUBLIC_RESPONSE_ABSOLUTE_TIMEOUT_MS,
    DEFAULT_RESPONSE_ABSOLUTE_TIMEOUT_MS,
    idleTimeoutMs + 1_000,
    120_000,
  );
  return {
    maximumConnections,
    maximumActive,
    maximumGeneral,
    maximumPerClient,
    maximumGeneralPerClient,
    idleTimeoutMs,
    absoluteTimeoutMs,
  };
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function decrement(map, key) {
  const next = Math.max(0, (map.get(key) || 0) - 1);
  if (next) map.set(key, next);
  else map.delete(key);
}

/**
 * Admit TCP peers before Node has parsed their HTTP headers. Ordinary peers
 * share a bounded pool below the process-wide ceiling, leaving capacity for a
 * loopback readiness probe. A trusted ingress may bypass the direct-client
 * per-peer cap, but it still cannot consume that readiness reserve.
 */
export function createPublicSocketBudget({
  keyForSocket = (socket) => socket?.remoteAddress,
  isReservedSocket = () => false,
  isTrustedIngressSocket = () => false,
  maximumActive = DEFAULT_HTTP_CONNECTIONS,
  maximumGeneral,
  maximumPerPeer,
} = {}) {
  if (typeof keyForSocket !== "function") {
    throw new TypeError("A public socket budget requires a peer-key resolver");
  }
  const totalLimit = boundedInteger(maximumActive, DEFAULT_HTTP_CONNECTIONS, 16, 2_048);
  const defaultReserve = Math.max(8, Math.ceil(totalLimit / 8));
  const generalLimit = boundedInteger(
    maximumGeneral,
    totalLimit - defaultReserve,
    8,
    totalLimit - 8,
  );
  const peerLimit = boundedInteger(
    maximumPerPeer,
    Math.min(32, generalLimit),
    2,
    generalLimit,
  );
  const activeByPeer = new Map();
  let active = 0;
  let generalActive = 0;

  const admit = (socket) => {
    const key = String(keyForSocket(socket) || "unknown").slice(0, 256);
    const reserved = Boolean(isReservedSocket(socket));
    const trustedIngress = !reserved && Boolean(isTrustedIngressSocket(socket));
    const peerActive = activeByPeer.get(key) || 0;
    const atCapacity = active >= totalLimit
      || (!reserved && generalActive >= generalLimit)
      || (!reserved && !trustedIngress && peerActive >= peerLimit);
    if (atCapacity) {
      socket.destroy?.();
      return false;
    }

    let released = false;
    active += 1;
    increment(activeByPeer, key);
    if (!reserved) generalActive += 1;
    const release = () => {
      if (released) return;
      released = true;
      socket.off?.("close", release);
      socket.off?.("error", release);
      active = Math.max(0, active - 1);
      decrement(activeByPeer, key);
      if (!reserved) generalActive = Math.max(0, generalActive - 1);
    };
    socket.once?.("close", release);
    socket.once?.("error", release);
    return true;
  };

  admit.stats = () => ({
    active,
    generalActive,
    peers: activeByPeer.size,
    maximumActive: totalLimit,
    maximumGeneral: generalLimit,
    maximumPerPeer: peerLimit,
  });
  return admit;
}

/**
 * Bound every public response independently of request parsing and keep a
 * small admission reserve for readiness probes. This complements Node's
 * process-wide socket ceiling; API-specific admission remains tighter.
 */
export function createPublicResponseBudget({
  keyForRequest,
  isReservedRequest = () => false,
  maximumActive = 224,
  maximumGeneral = 192,
  maximumPerClient = 16,
  maximumGeneralPerClient = 12,
  idleTimeoutMs = DEFAULT_RESPONSE_IDLE_TIMEOUT_MS,
  absoluteTimeoutMs = DEFAULT_RESPONSE_ABSOLUTE_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof keyForRequest !== "function") {
    throw new TypeError("A public response budget requires a client-key resolver");
  }
  const totalLimit = boundedInteger(maximumActive, 224, 2, 2_048);
  const generalLimit = boundedInteger(maximumGeneral, 192, 1, totalLimit - 1);
  const clientLimit = boundedInteger(maximumPerClient, 16, 1, totalLimit);
  const generalClientLimit = boundedInteger(
    maximumGeneralPerClient,
    12,
    1,
    Math.min(clientLimit, generalLimit),
  );
  const idleLimitMs = boundedInteger(idleTimeoutMs, DEFAULT_RESPONSE_IDLE_TIMEOUT_MS, 1_000, 30_000);
  const absoluteLimitMs = boundedInteger(
    absoluteTimeoutMs,
    DEFAULT_RESPONSE_ABSOLUTE_TIMEOUT_MS,
    idleLimitMs + 1,
    120_000,
  );
  const activeByClient = new Map();
  const generalByClient = new Map();
  let active = 0;
  let generalActive = 0;

  const middleware = (request, response, next) => {
    const key = String(keyForRequest(request) || "unknown").slice(0, 256);
    const reserved = Boolean(isReservedRequest(request));
    let admitted = false;
    let released = false;
    let absoluteTimer;

    const destroyIfOpen = () => {
      if (!response.destroyed && !response.writableFinished) response.destroy?.();
    };
    const onError = () => destroyIfOpen();
    const cleanup = () => {
      if (released) return;
      released = true;
      clearTimer(absoluteTimer);
      response.off?.("finish", cleanup);
      response.off?.("close", cleanup);
      response.off?.("error", onError);
      if (!admitted) return;
      active = Math.max(0, active - 1);
      decrement(activeByClient, key);
      if (!reserved) {
        generalActive = Math.max(0, generalActive - 1);
        decrement(generalByClient, key);
      }
    };

    response.setTimeout?.(idleLimitMs, destroyIfOpen);
    absoluteTimer = setTimer(destroyIfOpen, absoluteLimitMs);
    absoluteTimer?.unref?.();
    response.once?.("finish", cleanup);
    response.once?.("close", cleanup);
    response.once?.("error", onError);

    const atCapacity = active >= totalLimit
      || (activeByClient.get(key) || 0) >= clientLimit
      || (!reserved && (
        generalActive >= generalLimit
        || (generalByClient.get(key) || 0) >= generalClientLimit
      ));
    if (atCapacity) {
      response.setHeader?.("Connection", "close");
      response.setHeader?.("Retry-After", "2");
      const payload = { error: "Teenus on hetkel koormatud. Proovi mõne hetke pärast uuesti." };
      if (String(request.path || "").startsWith("/api/")) {
        return response.status(503).json(payload);
      }
      return response.status(503).send(payload.error);
    }

    admitted = true;
    active += 1;
    increment(activeByClient, key);
    if (!reserved) {
      generalActive += 1;
      increment(generalByClient, key);
    }
    return next();
  };

  middleware.stats = () => ({
    active,
    generalActive,
    clients: activeByClient.size,
    maximumActive: totalLimit,
    maximumGeneral: generalLimit,
  });
  return middleware;
}
