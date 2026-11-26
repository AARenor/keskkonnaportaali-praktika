
export function snapshotAbortError(signal, message = "The corpus statistics request was aborted") {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException(message, "AbortError");
}

export function createCoalescedTtlSnapshot({
  load,
  acquireWork,
  ttlMs = 60_000,
  timeoutMs = 1_500,
  shouldCache = () => true,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof load !== "function") throw new TypeError("A snapshot loader is required");
  const safeTtlMs = Math.max(100, Math.min(Number(ttlMs) || 60_000, 5 * 60_000));
  const safeTimeoutMs = Math.max(100, Math.min(Number(timeoutMs) || 1_500, 5_000));
  let snapshot = null;
  let inflight = null;

  function startRefresh(startOptions = {}) {
    const controller = new AbortController();
    const deadlineAt = now() + safeTimeoutMs;
    const entry = {
      controller,
      deadlineAt,
      promise: null,
      settled: false,
      waiters: 0,
      timer: null,
    };
    entry.timer = setTimer(() => {
      controller.abort(new DOMException("Corpus statistics refresh timed out", "TimeoutError"));
    }, safeTimeoutMs);
    const loaderPromise = Promise.resolve()
      .then(async () => {
        const releaseWork = typeof acquireWork === "function"
          ? await acquireWork({
            clientKey: startOptions.clientKey,
            signal: controller.signal,
            deadlineAt,
          })
          : () => undefined;
        try {
          return await load({ signal: controller.signal, deadlineAt });
        } finally {
          releaseWork();
        }
      });
    let detachInternalAbort = () => undefined;
    const internalAbort = new Promise((_resolve, reject) => {
      const onAbort = () => reject(snapshotAbortError(
        controller.signal,
        "Corpus statistics refresh was aborted",
      ));
      detachInternalAbort = () => controller.signal.removeEventListener("abort", onAbort);
      if (controller.signal.aborted) onAbort();
      else controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    // An abort must retire the shared entry even if an underlying driver has
    // not observed the signal yet. Promise.race installs a rejection handler
    // on the loader, so a late failure remains consumed after the entry is
    // detached and a later request can create a fresh bounded attempt.
    entry.promise = Promise.race([loaderPromise, internalAbort])
      .then((value) => {
        if (!controller.signal.aborted && shouldCache(value)) {
          snapshot = { value, expiresAt: now() + safeTtlMs };
        }
        return value;
      })
      .finally(() => {
        detachInternalAbort();
        entry.settled = true;
        if (entry.timer) clearTimer(entry.timer);
        if (inflight === entry) inflight = null;
      });
    // A caller always attaches synchronously below, but retain a rejection
    // handler so a final-waiter abort cannot create an unhandled rejection.
    void entry.promise.catch(() => undefined);
    inflight = entry;
    return entry;
  }

  function waitForRefresh(entry, { signal, deadlineAt } = {}) {
    if (signal?.aborted) return Promise.reject(snapshotAbortError(signal));
    entry.waiters += 1;
    return new Promise((resolve, reject) => {
      let complete = false;
      let deadlineTimer;
      const finish = (callback, value) => {
        if (complete) return;
        complete = true;
        if (deadlineTimer) clearTimer(deadlineTimer);
        signal?.removeEventListener("abort", onAbort);
        entry.waiters = Math.max(0, entry.waiters - 1);
        if (!entry.waiters && !entry.settled && !entry.controller.signal.aborted) {
          entry.controller.abort(new DOMException("All corpus statistics clients disconnected", "AbortError"));
        }
        callback(value);
      };
      const onAbort = () => finish(reject, snapshotAbortError(signal));
      signal?.addEventListener("abort", onAbort, { once: true });
      if (Number.isFinite(deadlineAt)) {
        const remainingMs = Math.max(0, Number(deadlineAt) - now());
        if (!remainingMs) {
          finish(reject, new DOMException("Corpus statistics deadline expired", "TimeoutError"));
          return;
        }
        deadlineTimer = setTimer(
          () => finish(reject, new DOMException("Corpus statistics deadline expired", "TimeoutError")),
          remainingMs,
        );
        // A deadline that callers await must keep the event loop alive.
      }
      entry.promise.then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error),
      );
    });
  }

  return {
    get(options = {}) {
      if (options.signal?.aborted) return Promise.reject(snapshotAbortError(options.signal));
      if (snapshot && snapshot.expiresAt > now()) return Promise.resolve(snapshot.value);
      return waitForRefresh(inflight || startRefresh(options), options);
    },
    clear() {
      snapshot = null;
      if (inflight && !inflight.controller.signal.aborted) {
        inflight.controller.abort(new DOMException("Corpus statistics snapshot cleared", "AbortError"));
      }
    },
    stats: () => ({
      cached: Boolean(snapshot && snapshot.expiresAt > now()),
      inflight: Boolean(inflight),
      waiters: inflight?.waiters || 0,
    }),
  };
}
