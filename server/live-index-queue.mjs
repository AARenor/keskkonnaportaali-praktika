import { createHmac, randomBytes } from "node:crypto";

function abortError(reason = "Official discovery indexing stopped") {
  return reason instanceof Error
    ? reason
    : new DOMException(String(reason || "Official discovery indexing stopped"), "AbortError");
}

function richerDocument(left = {}, right = {}) {
  const richerField = (leftValue, rightValue) => (
    String(rightValue || "").length > String(leftValue || "").length ? rightValue : leftValue
  );
  return {
    ...left,
    ...right,
    title: String(right.title || left.title || ""),
    summary: String(richerField(left.summary, right.summary) || ""),
    content: String(richerField(left.content, right.content) || ""),
    tags: [...new Set([...(left.tags || left.topics || []), ...(right.tags || right.topics || [])])],
  };
}

/**
 * Owns all persistence triggered by live public search. The queue is bounded by
 * canonical URL, writes only a small batch at a time, suppresses recent
 * successes, and has an explicit shutdown lifecycle. Producer requests do not
 * own accepted maintenance; their signal only prevents already-aborted work
 * from entering the process-wide queue.
 */
export function createOfficialDiscoveryIndexQueue({
  writeBatch,
  keyOf,
  maximumPending = 500,
  batchSize = 50,
  concurrency = 1,
  successTtlMs = 15 * 60_000,
  retryBackoffMs = 30_000,
  acceptanceWindowMs = 7 * 24 * 60 * 60_000,
  maximumAcceptedPerWindow = 10_000,
  maximumAcceptedPerClient = 500,
  clientScopeSecret = randomBytes(32),
  maintenanceIntervalMs = 60 * 60_000,
  now = () => Date.now(),
} = {}) {
  if (typeof writeBatch !== "function" || typeof keyOf !== "function") {
    throw new TypeError("Official discovery index queue requires writeBatch and keyOf functions");
  }
  const pendingLimit = Math.max(1, Math.min(Math.trunc(Number(maximumPending) || 500), 2_000));
  const safeBatchSize = Math.max(1, Math.min(Math.trunc(Number(batchSize) || 50), 100));
  const activeLimit = Math.max(1, Math.min(Math.trunc(Number(concurrency) || 1), 2));
  const successTtl = Math.max(1_000, Math.min(Number(successTtlMs) || 15 * 60_000, 24 * 60 * 60_000));
  const retryBackoff = Math.max(1_000, Math.min(Number(retryBackoffMs) || 30_000, 60 * 60_000));
  const configuredAcceptanceWindow = Math.max(1_000, Math.min(
    Number(acceptanceWindowMs) || 7 * 24 * 60 * 60_000,
    30 * 24 * 60 * 60_000,
  ));
  const acceptanceWindow = Math.max(configuredAcceptanceWindow, successTtl, retryBackoff);
  const acceptedWindowLimit = Math.max(1, Math.min(
    Math.trunc(Number(maximumAcceptedPerWindow) || 10_000),
    100_000,
  ));
  const acceptedClientLimit = Math.max(1, Math.min(
    Math.trunc(Number(maximumAcceptedPerClient) || 500),
    acceptedWindowLimit,
  ));
  const scopeSecret = Buffer.isBuffer(clientScopeSecret)
    ? clientScopeSecret
    : Buffer.from(clientScopeSecret || "");
  if (scopeSecret.length < 16) {
    throw new TypeError("Official discovery client scope secret must be at least 16 bytes");
  }
  const maintenanceInterval = Math.max(60_000, Math.min(
    Number(maintenanceIntervalMs) || 60 * 60_000,
    24 * 60 * 60_000,
  ));
  const pending = new Map();
  const inflight = new Set();
  const successes = new Map();
  const retries = new Map();
  const acceptedNewKeys = new Map();
  const clientAcceptedCounts = new Map();
  const activeControllers = new Set();
  const idleWaiters = new Set();
  const MAINTENANCE_KEY = "\0official-live-maintenance";
  let active = 0;
  let closed = false;
  let drainScheduled = false;
  let lastMaintenanceAt = 0;

  // A URL that was already accepted must remain in the success/retry history
  // for the entire corresponding suppression period. Otherwise accepting more
  // than an unrelated fixed history size evicts early keys while they are
  // still counted in acceptedNewKeys, allowing repeated writes without
  // consuming another acceptance slot.
  const suppressionHistoryLimit = acceptedWindowLimit;

  function prune(history, currentTime, ttl, maximum = suppressionHistoryLimit) {
    for (const [key, timestamp] of history) {
      if (currentTime - timestamp >= ttl || history.size > maximum) history.delete(key);
    }
  }

  function clientScopeKey(value) {
    return createHmac("sha256", scopeSecret)
      .update(String(value || "unknown").slice(0, 240))
      .digest("hex");
  }

  function pruneAccepted(currentTime) {
    for (const [key, entry] of acceptedNewKeys) {
      if (currentTime - entry.acceptedAt < acceptanceWindow) continue;
      acceptedNewKeys.delete(key);
      const nextCount = Math.max(0, Number(clientAcceptedCounts.get(entry.clientScope) || 0) - 1);
      if (nextCount) clientAcceptedCounts.set(entry.clientScope, nextCount);
      else clientAcceptedCounts.delete(entry.clientScope);
    }
  }

  function recordAcceptedKey(key, clientScope, currentTime) {
    acceptedNewKeys.set(key, { acceptedAt: currentTime, clientScope });
    clientAcceptedCounts.set(clientScope, Number(clientAcceptedCounts.get(clientScope) || 0) + 1);
  }

  function settleIdle() {
    if (active || pending.size) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  }

  function scheduleDrain() {
    if (drainScheduled || closed) return;
    drainScheduled = true;
    queueMicrotask(() => {
      drainScheduled = false;
      drain();
    });
  }

  function completeBatch(entries, result, failed) {
    const currentTime = Number(now()) || Date.now();
    const ready = !failed && ["ready", "empty", "disabled"].includes(String(result?.status || ""));
    for (const [key, entry] of entries) {
      inflight.delete(key);
      if (closed) continue;
      if (entry.kind === "maintenance") {
        if (ready) lastMaintenanceAt = currentTime;
        continue;
      }
      if (ready) {
        successes.set(key, currentTime);
        retries.delete(key);
      } else {
        retries.set(key, currentTime);
        successes.delete(key);
      }
    }
    prune(successes, currentTime, successTtl, suppressionHistoryLimit);
    prune(retries, currentTime, retryBackoff, suppressionHistoryLimit);
  }

  function runBatch(entries) {
    active += 1;
    const controller = new AbortController();
    activeControllers.add(controller);
    const documents = entries.flatMap(([, entry]) => entry.kind === "document" ? [entry.document] : []);
    const maintenance = entries.some(([, entry]) => entry.kind === "maintenance");
    Promise.resolve()
      .then(() => writeBatch(documents, { signal: controller.signal, maintenance }))
      .then(
        (result) => completeBatch(entries, result, false),
        () => completeBatch(entries, null, true),
      )
      .finally(() => {
        activeControllers.delete(controller);
        active = Math.max(0, active - 1);
        drain();
        settleIdle();
      });
  }

  function drain() {
    if (closed) {
      settleIdle();
      return;
    }
    while (active < activeLimit && pending.size) {
      const entries = [];
      for (const [key, entry] of pending) {
        pending.delete(key);
        inflight.add(key);
        entries.push([key, entry]);
        if (entries.length >= safeBatchSize) break;
      }
      if (entries.length) runBatch(entries);
    }
    settleIdle();
  }

  function enqueue(documents = [], { signal, clientKey = "unknown" } = {}) {
    if (closed || signal?.aborted) {
      return { accepted: 0, coalesced: 0, dropped: Array.isArray(documents) ? documents.length : 0, closed };
    }
    const currentTime = Number(now()) || Date.now();
    prune(successes, currentTime, successTtl, suppressionHistoryLimit);
    prune(retries, currentTime, retryBackoff, suppressionHistoryLimit);
    pruneAccepted(currentTime);
    const clientScope = clientScopeKey(clientKey);
    let accepted = 0;
    let coalesced = 0;
    let dropped = 0;
    for (const document of Array.isArray(documents) ? documents : []) {
      const key = String(keyOf(document) || "");
      if (!key) {
        dropped += 1;
        continue;
      }
      if (inflight.has(key)) {
        coalesced += 1;
        continue;
      }
      if (currentTime - Number(successes.get(key) || 0) < successTtl) {
        coalesced += 1;
        continue;
      }
      if (currentTime - Number(retries.get(key) || 0) < retryBackoff) {
        coalesced += 1;
        continue;
      }
      const existing = pending.get(key);
      if (existing?.kind === "document") {
        existing.document = richerDocument(existing.document, document);
        coalesced += 1;
        continue;
      }
      if (pending.size >= pendingLimit) {
        dropped += 1;
        continue;
      }
      const isNewWithinWindow = !acceptedNewKeys.has(key);
      if (isNewWithinWindow && (
        acceptedNewKeys.size >= acceptedWindowLimit
        || Number(clientAcceptedCounts.get(clientScope) || 0) >= acceptedClientLimit
      )) {
        dropped += 1;
        continue;
      }
      pending.set(key, { kind: "document", document });
      if (isNewWithinWindow) recordAcceptedKey(key, clientScope, currentTime);
      accepted += 1;
    }
    if (accepted) scheduleDrain();
    return { accepted, coalesced, dropped, closed: false };
  }

  function scheduleMaintenance({ signal } = {}) {
    const currentTime = Number(now()) || Date.now();
    if (closed || signal?.aborted) return false;
    if (pending.has(MAINTENANCE_KEY) || inflight.has(MAINTENANCE_KEY)) return false;
    if (lastMaintenanceAt && currentTime - lastMaintenanceAt < maintenanceInterval) return false;
    pending.set(MAINTENANCE_KEY, { kind: "maintenance" });
    scheduleDrain();
    return true;
  }

  function stop(reason) {
    if (closed) return false;
    closed = true;
    pending.clear();
    successes.clear();
    retries.clear();
    acceptedNewKeys.clear();
    clientAcceptedCounts.clear();
    const error = abortError(reason);
    for (const controller of activeControllers) {
      if (!controller.signal.aborted) controller.abort(error);
    }
    settleIdle();
    return true;
  }

  function idle() {
    if (!active && !pending.size) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.add(resolve));
  }

  return {
    enqueue,
    scheduleMaintenance,
    stop,
    idle,
    stats: () => ({
      active,
      pending: pending.size,
      inflight: inflight.size,
      recent: successes.size,
      retries: retries.size,
      acceptedInWindow: acceptedNewKeys.size,
      clientsInWindow: clientAcceptedCounts.size,
      maximumPending: pendingLimit,
      acceptanceWindowMs: acceptanceWindow,
      maximumAcceptedPerWindow: acceptedWindowLimit,
      maximumAcceptedPerClient: acceptedClientLimit,
      suppressionHistoryLimit,
      batchSize: safeBatchSize,
      concurrency: activeLimit,
      closed,
    }),
  };
}
