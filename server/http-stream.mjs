const DEFAULT_MAXIMUM_BYTES = 2_000_000;
const DEFAULT_DRAIN_TIMEOUT_MS = 2_000;
// Matches the public response idle default: a stream that omits its own idle
// option must never cut a grounded answer sooner than the transport allows.
const DEFAULT_IDLE_TIMEOUT_MS = 100_000;
// A public response may legitimately live for a bounded listing plus a long
// answer window, so the writer honors the whole configured range.
const MINIMUM_IDLE_TIMEOUT_MS = 1_000;
const MAXIMUM_IDLE_TIMEOUT_MS = 300_000;
// Serialized keepalive cadence. Each tick is one blank NDJSON line (or one
// newline of JSON padding), which parsers already ignore, so no public event
// type is added to the search protocol.
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;

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
  const idleLimitMs = boundedInteger(
    idleTimeoutMs,
    DEFAULT_IDLE_TIMEOUT_MS,
    MINIMUM_IDLE_TIMEOUT_MS,
    MAXIMUM_IDLE_TIMEOUT_MS,
  );
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

  const writeLine = async (line) => {
    if (failure) throw failure;
    if (signal?.aborted) throw fail(abortReason(signal));
    if (finishing || response.writableEnded || response.destroyed) {
      throw fail(streamError("STREAM_CLOSED", "The response stream is no longer writable"));
    }
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

  const enqueueLine = (line) => {
    pending = pending
      .then(() => writeLine(line))
      .catch((error) => {
        fail(error);
      });
    return pending;
  };

  const enqueue = (type, payload) => enqueueLine(`${JSON.stringify({ type, ...payload })}\n`);

  const write = async (type, payload) => {
    await enqueue(type, payload);
    if (failure) throw failure;
  };

  // A blank line is the keepalive: it restarts the socket inactivity deadline
  // without adding a public event type, and it travels through the same
  // serialized byte, drain and cancellation path as every other write.
  const heartbeat = () => enqueueLine("\n");

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
    heartbeat,
    finish,
    stats: () => ({
      bytesWritten,
      failed: Boolean(failure),
      finishing,
    }),
  };
}

/**
 * Publish one public search response as NDJSON with two independent clocks.
 *
 * The ordinary listing is written as soon as retrieval resolves it, before any
 * model work, and is never withdrawn: a slow, refused or cancelled answer can
 * only add an answer event, never replace the links the reader already has.
 * While either phase runs, a blank NDJSON line every heartbeat interval keeps
 * proxies and the socket idle deadline alive without adding a public event.
 *
 * Returns one of "complete", "answer-fallback", "answer-skipped",
 * "listing-unavailable" or "aborted".
 */
export async function streamListingThenAnswer({
  stream,
  listing,
  answer,
  fallbackAnswer,
  publicListing = (value) => value,
  emptyListing = () => publicListing({ total: 0, page: 1, pageSize: 12, pageCount: 0, hasMore: false, items: [] }),
  answerStartBy = Infinity,
  heartbeatMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  now = Date.now,
  setInterval: startInterval = setInterval,
  clearInterval: stopInterval = clearInterval,
  isAborted = () => false,
  onListingSettled = () => undefined,
} = {}) {
  let heartbeat = null;
  const stopHeartbeat = () => {
    if (heartbeat === null) return;
    stopInterval(heartbeat);
    heartbeat = null;
  };
  const fallbackEvent = (reason, searchResults, published) => ({
    ...fallbackAnswer({ reason, searchResults }),
    searchResults: published,
  });

  try {
    if (Number(heartbeatMs) > 0) {
      heartbeat = startInterval(() => {
        // A transport failure is reported through the next write, so a
        // keepalive tick must never throw into the timer.
        try {
          stream.heartbeat();
        } catch {
          // Ignored: write()/finish() below surface the same failure.
        }
      }, Number(heartbeatMs));
      heartbeat?.unref?.();
    }
    let searchResults;
    try {
      searchResults = await listing();
    } catch (error) {
      onListingSettled();
      if (isAborted()) return "aborted";
      const empty = publicListing(emptyListing());
      await stream.write("results", { searchResults: empty, listingUnavailable: true });
      await stream.write("answer", { result: fallbackEvent("listing-unavailable", null, empty) });
      return "listing-unavailable";
    }
    onListingSettled();
    if (isAborted()) return "aborted";
    const published = publicListing(searchResults);
    await stream.write("results", { searchResults: published });
    if (now() >= answerStartBy) {
      // The remaining reserve cannot hold a grounded answer. Publishing the
      // deterministic card built from this very listing is shorter and more
      // honest than starting a model call that the transport would cut.
      stopHeartbeat();
      // The listing this event carries is published now, under this clock, not
      // the one the results event was built with: a publisher's copy window can
      // close while the reader is waiting.
      await stream.write("answer", { result: fallbackEvent("deadline", searchResults, publicListing(searchResults)) });
      return "answer-skipped";
    }
    let result;
    try {
      result = await answer(searchResults);
    } catch (error) {
      if (isAborted()) return "aborted";
      // Same clock rule as the success path: a failed answer can arrive just as
      // late, so it republishes the listing as it stands now.
      await stream.write("answer", { result: fallbackEvent("answer-failed", searchResults, publicListing(searchResults)) });
      return "answer-fallback";
    }
    if (isAborted()) return "aborted";
    // Projected at write time: generation may have outlived a copied-text
    // window that was still open when the results event went out. Link
    // metadata survives that, the excerpt does not.
    await stream.write("answer", { result: { ...result, searchResults: publicListing(searchResults) } });
    return "complete";
  } finally {
    stopHeartbeat();
  }
}

/**
 * Keep a one-shot JSON response alive while a long answer is generated.
 *
 * A JSON route that stays silent until the body is ready is bounded by the
 * socket idle timer and by every intermediate proxy, which is exactly how a
 * slow answer used to disappear. Newline padding is ignored by JSON parsers, so
 * the same endpoint keeps its contract, ends with exactly one JSON document and
 * still stops on send, on client disconnect and on transport failure.
 */
export function createPaddedJsonWriter(response, {
  intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  signal,
  setInterval: startInterval = setInterval,
  clearInterval: stopInterval = clearInterval,
} = {}) {
  // The content type must be set before the first padding byte, otherwise the
  // header would be rejected once the body has started.
  response.setHeader?.("Content-Type", "application/json; charset=utf-8");
  let timer = null;
  let finished = false;
  const stop = () => {
    if (timer === null) return;
    stopInterval(timer);
    timer = null;
  };
  const pad = () => {
    if (finished || signal?.aborted || response.writableEnded || response.destroyed) {
      stop();
      return;
    }
    try {
      response.write("\n");
    } catch {
      stop();
    }
  };
  if (Number(intervalMs) > 0) {
    timer = startInterval(pad, Number(intervalMs));
    timer?.unref?.();
  }
  return {
    stop,
    statistics: () => ({ padding: timer !== null, finished }),
    send(payload) {
      if (finished) return false;
      finished = true;
      stop();
      if (signal?.aborted || response.destroyed || response.writableEnded) return false;
      if (!response.headersSent) response.setHeader?.("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(payload));
      return true;
    },
  };
}
