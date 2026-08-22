const DEFAULT_MAXIMUM_BYTES = 2_000_000;
const DEFAULT_DRAIN_TIMEOUT_MS = 2_000;
const DEFAULT_IDLE_TIMEOUT_MS = 20_000;

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Math.trunc(Number(value));
  return Math.max(minimum, Math.min(Number.isFinite(parsed) ? parsed : fallback, maximum));
}

function streamError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function abortReason(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The response stream was aborted", "AbortError");
}

function waitForEvent(response, eventName, {
  signal,
  timeoutMs,
  timeoutCode,
  timeoutMessage,
  setTimer,
  clearTimer,
  closeIsSuccess = false,
} = {}) {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      response.off?.(eventName, onEvent);
      response.off?.("close", onClose);
      response.off?.("error", onError);
      signal?.removeEventListener?.("abort", onAbort);
      clearTimer(timer);
    };
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onEvent = () => settle(resolve);
    const onClose = () => (closeIsSuccess
      ? settle(resolve)
      : settle(reject, streamError("STREAM_CLOSED", "The response stream closed before it drained")));
    const onError = (error) => settle(reject, error);
    const onAbort = () => settle(reject, abortReason(signal));
    const timer = setTimer(() => {
      const error = streamError(timeoutCode, timeoutMessage);
      settle(reject, error);
      response.destroy?.(error);
    }, timeoutMs);
    timer?.unref?.();
    response.once?.(eventName, onEvent);
    if (eventName !== "close") response.once?.("close", onClose);
    response.once?.("error", onError);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

/**
 * Serialize NDJSON writes and keep transport backpressure inside a strict byte,
 * inactivity and drain deadline. Queued writes never reject on an unobserved
 * promise; callers use write()/finish() when they need the stored failure.
 */
export function createBoundedNdjsonWriter(response, {
  signal,
  maximumBytes = DEFAULT_MAXIMUM_BYTES,
  drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onFailure = () => undefined,
} = {}) {
  const byteLimit = boundedInteger(maximumBytes, DEFAULT_MAXIMUM_BYTES, 1_024, 4_000_000);
  const drainLimitMs = boundedInteger(drainTimeoutMs, DEFAULT_DRAIN_TIMEOUT_MS, 100, 5_000);
  const idleLimitMs = boundedInteger(idleTimeoutMs, DEFAULT_IDLE_TIMEOUT_MS, 1_000, 30_000);
  let bytesWritten = 0;
  let failure;
  let pending = Promise.resolve();
  let finishing = false;

  const fail = (error) => {
    if (!failure) {
      failure = error instanceof Error ? error : streamError("STREAM_FAILED", "The response stream failed");
      try {
        onFailure(failure);
      } catch {
        // Failure reporting must never mask or delay transport teardown.
      }
    }
    return failure;
  };

  response.setHeader?.("Connection", "close");
  response.setTimeout?.(idleLimitMs, () => {
    const error = fail(streamError("STREAM_IDLE_TIMEOUT", "The response stream was inactive for too long"));
    response.destroy?.(error);
  });

  const writeRaw = async (type, payload) => {
    if (failure) throw failure;
    if (signal?.aborted) throw fail(abortReason(signal));
    if (finishing || response.writableEnded || response.destroyed) {
      throw fail(streamError("STREAM_CLOSED", "The response stream is no longer writable"));
    }
    const line = `${JSON.stringify({ type, ...payload })}\n`;
    bytesWritten += Buffer.byteLength(line, "utf8");
    if (bytesWritten > byteLimit) {
      const error = fail(streamError("STREAM_TOO_LARGE", "The response stream exceeded its byte limit"));
      response.destroy?.(error);
      throw error;
    }
    if (response.write(line) !== false) return;
    try {
      await waitForEvent(response, "drain", {
        signal,
        timeoutMs: drainLimitMs,
        timeoutCode: "STREAM_DRAIN_TIMEOUT",
        timeoutMessage: "The response stream did not drain in time",
        setTimer,
        clearTimer,
      });
    } catch (error) {
      throw fail(error);
    }
  };

  const enqueue = (type, payload) => {
    pending = pending
      .then(() => writeRaw(type, payload))
      .catch((error) => {
        fail(error);
      });
    return pending;
  };

  const write = async (type, payload) => {
    await enqueue(type, payload);
    if (failure) throw failure;
  };

  const finish = async () => {
    await pending;
    if (failure) throw failure;
    if (response.destroyed) throw fail(streamError("STREAM_CLOSED", "The response stream was destroyed"));
    if (response.writableEnded) return;
    finishing = true;
    const closed = waitForEvent(response, "close", {
      signal,
      timeoutMs: drainLimitMs,
      timeoutCode: "STREAM_FINISH_TIMEOUT",
      timeoutMessage: "The response stream did not finish in time",
      setTimer,
      clearTimer,
      closeIsSuccess: true,
    });
    response.end();
    try {
      await closed;
    } catch (error) {
      throw fail(error);
    }
  };

  return {
    enqueue,
    write,
    finish,
    stats: () => ({
      bytesWritten,
      failed: Boolean(failure),
      finishing,
    }),
  };
}
