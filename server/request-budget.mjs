export const DEFAULT_SEARCH_DEADLINE_MS = 15_000;
export const JSON_SEARCH_DEADLINE_CEILING_MS = 12_000;
export const DEFAULT_SEARCH_CONCURRENCY = 8;
export const DEFAULT_SEARCH_QUEUE = 32;
// Slow listings still leave enough time for hydration, grounded synthesis,
// citation rebinding and transport under the 15 s public request deadline.
const FINAL_RESPONSE_RESERVE_MS = 7_500;

export function configuredSearchBudgetMs(
  value = process.env.SEARCH_DEADLINE_MS,
  ceilingMs = DEFAULT_SEARCH_DEADLINE_MS,
) {
  const ceiling = Math.max(1_000, Math.min(Number(ceilingMs) || DEFAULT_SEARCH_DEADLINE_MS, DEFAULT_SEARCH_DEADLINE_MS));
  return Math.max(1_000, Math.min(Number(value) || DEFAULT_SEARCH_DEADLINE_MS, ceiling));
}

export function searchDeadline(startedAt, ceilingMs = DEFAULT_SEARCH_DEADLINE_MS, value = process.env.SEARCH_DEADLINE_MS) {
  return Number(startedAt) + configuredSearchBudgetMs(value, ceilingMs);
}

export function progressiveListingBudgetMs({ remainingMs } = {}) {
  const remaining = Math.max(1, Math.trunc(Number(remainingMs) || 1));
  const reserve = Math.min(FINAL_RESPONSE_RESERVE_MS, Math.floor(remaining / 2));
  return Math.max(1, remaining - reserve);
}

export function configuredSearchConcurrency(value = process.env.SEARCH_MAX_CONCURRENCY) {
  // A single global slot cannot reserve capacity for a second caller. Public
  // search therefore requires at least two slots; operators can still bound
  // expensive LLM/provider work independently with its own lower limit.
  return Math.max(2, Math.min(Math.trunc(Number(value) || DEFAULT_SEARCH_CONCURRENCY), 20));
}

export function configuredSearchPerClientConcurrency(
  value = process.env.SEARCH_MAX_CONCURRENCY_PER_CLIENT,
  maximumActive = configuredSearchConcurrency(),
) {
  const globalMaximum = Math.max(1, Math.trunc(Number(maximumActive) || DEFAULT_SEARCH_CONCURRENCY));
  const safeDefault = globalMaximum === 1 ? 1 : Math.min(2, globalMaximum - 1);
  return Math.max(1, Math.min(Math.trunc(Number(value) || safeDefault), safeDefault));
}

function admissionError(message = "Search admission capacity is full", code = "SEARCH_CAPACITY") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function abortError(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

/**
 * A bounded round-robin admission gate shared by every public search route.
 * Each caller gets only a strict subset of the global slots, so one address
 * cannot consume the whole search service. Waiting work is bounded both
 * globally and per caller and disappears immediately when the HTTP request is
 * aborted.
 */
export function createFairSearchAdmission({
  maximumActive = configuredSearchConcurrency(),
  maximumActivePerClient = configuredSearchPerClientConcurrency(undefined, maximumActive),
  maximumQueue = DEFAULT_SEARCH_QUEUE,
  maximumQueuedPerClient = 2,
  maximumWaitMs = 1_800,
  capacityCode = "SEARCH_CAPACITY",
  capacityLabel = "Search admission",
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const activeLimit = Math.max(2, Math.min(
    Math.trunc(Number(maximumActive) || DEFAULT_SEARCH_CONCURRENCY),
    20,
  ));
  const clientLimit = Math.max(1, Math.min(
    Math.trunc(Number(maximumActivePerClient) || 1),
    activeLimit === 1 ? 1 : activeLimit - 1,
  ));
  const queueLimit = Math.max(1, Math.min(
    Math.trunc(Number(maximumQueue) || DEFAULT_SEARCH_QUEUE),
    200,
  ));
  const clientQueueLimit = Math.max(1, Math.min(
    Math.trunc(Number(maximumQueuedPerClient) || 2),
    8,
  ));
  const waitLimitMs = Math.max(100, Math.min(Number(maximumWaitMs) || 1_800, 5_000));
  const activeByClient = new Map();
  const queues = new Map();
  const rotation = [];
  let active = 0;
  let queued = 0;
  let closed = false;
  const capacityError = (message = `${capacityLabel} capacity is full`) => (
    admissionError(message, capacityCode)
  );

  function cleanClientKey(value) {
    return String(value || "unknown").replace(/[^a-z0-9:.\[\]-]/giu, "-").slice(0, 128) || "unknown";
  }

  function removeRotationKey(key) {
    let index = rotation.indexOf(key);
    while (index >= 0) {
      rotation.splice(index, 1);
      index = rotation.indexOf(key);
    }
  }

  function releaseEntry(entry) {
    if (entry.released) return;
    entry.released = true;
    active = Math.max(0, active - 1);
    const clientActive = Math.max(0, Number(activeByClient.get(entry.key) || 0) - 1);
    if (clientActive) activeByClient.set(entry.key, clientActive);
    else activeByClient.delete(entry.key);
    drain();
  }

  function grant(entry) {
    if (entry.settled || entry.signal?.aborted || closed) {
      if (!entry.settled) {
        entry.settled = true;
        if (entry.timer) clearTimer(entry.timer);
        entry.signal?.removeEventListener("abort", entry.onAbort);
        entry.reject(entry.signal?.aborted
          ? abortError(entry.signal)
          : capacityError(`${capacityLabel} is closed`));
      }
      return false;
    }
    entry.settled = true;
    if (entry.timer) clearTimer(entry.timer);
    entry.signal?.removeEventListener("abort", entry.onAbort);
    active += 1;
    activeByClient.set(entry.key, Number(activeByClient.get(entry.key) || 0) + 1);
    entry.resolve(() => releaseEntry(entry));
    return true;
  }

  function removeQueuedEntry(entry, error) {
    if (entry.settled) return;
    const clientQueue = queues.get(entry.key);
    const index = clientQueue?.indexOf(entry) ?? -1;
    if (index >= 0) {
      clientQueue.splice(index, 1);
      queued = Math.max(0, queued - 1);
    }
    if (!clientQueue?.length) {
      queues.delete(entry.key);
      removeRotationKey(entry.key);
    }
    entry.settled = true;
    if (entry.timer) clearTimer(entry.timer);
    entry.signal?.removeEventListener("abort", entry.onAbort);
    entry.reject(error);
  }

  function drain() {
    if (closed || active >= activeLimit || !queued) return;
    let blockedClients = 0;
    while (active < activeLimit && queued && rotation.length) {
      const key = rotation.shift();
      const clientQueue = queues.get(key);
      if (!clientQueue?.length) {
        queues.delete(key);
        continue;
      }
      if (Number(activeByClient.get(key) || 0) >= clientLimit) {
        rotation.push(key);
        blockedClients += 1;
        if (blockedClients >= rotation.length) break;
        continue;
      }
      blockedClients = 0;
      const entry = clientQueue.shift();
      queued = Math.max(0, queued - 1);
      if (clientQueue.length) rotation.push(key);
      else queues.delete(key);
      if (!grant(entry)) continue;
    }
  }

  function acquire(clientKey, { signal, maximumWaitMs: callerMaximumWaitMs } = {}) {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    if (closed) return Promise.reject(capacityError(`${capacityLabel} is closed`));
    const callerWaitLimitMs = callerMaximumWaitMs === undefined
      ? waitLimitMs
      : Math.max(0, Math.min(Math.trunc(Number(callerMaximumWaitMs) || 0), waitLimitMs));
    if (callerWaitLimitMs <= 0) {
      return Promise.reject(capacityError(`${capacityLabel} wait expired`));
    }
    const key = cleanClientKey(clientKey);
    const canStart = active < activeLimit
      && Number(activeByClient.get(key) || 0) < clientLimit
      && queued === 0;
    if (canStart) {
      const entry = { key, released: false, settled: false, signal };
      active += 1;
      activeByClient.set(key, Number(activeByClient.get(key) || 0) + 1);
      entry.settled = true;
      return Promise.resolve(() => releaseEntry(entry));
    }
    const clientQueue = queues.get(key) || [];
    if (queued >= queueLimit || clientQueue.length >= clientQueueLimit) {
      return Promise.reject(capacityError());
    }
    return new Promise((resolve, reject) => {
      const entry = {
        key,
        signal,
        resolve,
        reject,
        released: false,
        settled: false,
        onAbort: null,
        timer: null,
      };
      entry.onAbort = () => {
        removeQueuedEntry(entry, abortError(signal));
        drain();
      };
      clientQueue.push(entry);
      queues.set(key, clientQueue);
      if (clientQueue.length === 1) rotation.push(key);
      queued += 1;
      signal?.addEventListener("abort", entry.onAbort, { once: true });
      entry.timer = setTimer(() => {
        removeQueuedEntry(entry, capacityError(`${capacityLabel} wait expired`));
        drain();
      }, callerWaitLimitMs);
      entry.timer?.unref?.();
      drain();
    });
  }

  function close(reason = capacityError(`${capacityLabel} is closed`)) {
    if (closed) return false;
    closed = true;
    for (const clientQueue of queues.values()) {
      for (const entry of clientQueue) {
        if (entry.settled) continue;
        entry.settled = true;
        if (entry.timer) clearTimer(entry.timer);
        entry.signal?.removeEventListener("abort", entry.onAbort);
        entry.reject(reason);
      }
    }
    queues.clear();
    rotation.length = 0;
    queued = 0;
    return true;
  }

  return {
    acquire,
    close,
    stats: () => ({
      active,
      queued,
      clients: activeByClient.size,
      queuedClients: queues.size,
      maximumActive: activeLimit,
      maximumActivePerClient: clientLimit,
      maximumQueue: queueLimit,
      maximumWaitMs: waitLimitMs,
      closed,
    }),
  };
}
