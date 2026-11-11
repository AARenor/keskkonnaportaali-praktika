// Cloudflare closes an HTTP/2 origin stream that stays open past 125 seconds, so
// one long search response cannot carry an AI answer that takes longer than that.
// This transport moves the waiting out of the connection: one short create
// request starts the work exactly once, and short polls carry the sequenced
// events until the answer is complete. Closing a poll loses nothing, because the
// server holds every event until this browser has read it.
//
// The job key is a bearer secret: it authorises poll and cancel, so it never
// leaves the request body. It is not put in a URL, a log line or storage, and a
// new id and key are generated for every read, which is also what makes a second
// create for the same read impossible.
//
// Contract (shared with server/search_jobs):
//   POST /api/search/jobs        {job_id, job_key, kind, request}
//   POST /api/search/jobs/poll   {job_id, job_key, after}
//   POST /api/search/jobs/cancel {job_id, job_key}
//   body {job_id, state, deadline_at, retry_after_ms, events:[{seq, event}]}
//   state: running | complete | failed | cancelled; seq is dense from 1.

const EVENT_TYPES = new Set(["results", "draft", "answer"]);
// A poll may be retried: the work behind it keeps running untouched.
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
// A create answered like this may still have been accepted upstream, so the same
// id and key are polled instead of assuming nothing started. 429 (capacity) and
// 503 (store closed) are definite refusals and are handled separately.
const CREATE_UNCERTAIN_STATUSES = new Set([408, 500, 502, 504]);
const CANCELLED_STATES = new Set(["cancelled", "canceled", "aborted"]);
const EXPIRED_STATES = new Set(["expired", "timeout", "timed_out"]);
const FAILED_STATES = new Set(["failed", "error"]);
const SUCCESS_STATES = new Set(["complete", "completed", "done", "succeeded", "finished"]);
const TERMINAL_STATES = new Set([...CANCELLED_STATES, ...EXPIRED_STATES, ...FAILED_STATES, ...SUCCESS_STATES]);

export const SEARCH_JOB_CREATE_PATH = "/api/search/jobs";
export const SEARCH_JOB_POLL_PATH = "/api/search/jobs/poll";
export const SEARCH_JOB_CANCEL_PATH = "/api/search/jobs/cancel";
export const SEARCH_JOB_POLL_MS = 2_000;
export const SEARCH_JOB_REQUEST_TIMEOUT_MS = 8_000;
export const SEARCH_JOB_CANCEL_TIMEOUT_MS = 2_000;
export const SEARCH_JOB_MAX_MS = 300_000;
export const SEARCH_JOB_CREATE_GRACE_MS = 6_000;
export const SEARCH_JOB_MAX_POLL_DELAY_MS = 10_000;
export const SEARCH_JOB_MAX_CONSECUTIVE_FAILURES = 5;
export const SEARCH_JOB_MAX_BUFFER = 2_000_000;

export class SearchJobError extends Error {
  constructor(message, { code = "search_job_failed", status = 0, retryable = false, retryAfterMs = 0, listingReady = false, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "SearchJobError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = Number.isFinite(retryAfterMs) ? retryAfterMs : 0;
    this.listingReady = listingReady;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function abortError(reason) {
  if (reason && reason.name === "AbortError") return reason;
  const error = new Error(typeof reason?.message === "string" && reason.message ? reason.message : "Otsing katkestati.");
  error.name = "AbortError";
  if (reason !== undefined) error.cause = reason;
  return error;
}

function base64url(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomUuid(cryptoImpl) {
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  let hex = "";
  for (let index = 0; index < bytes.length; index += 1) hex += bytes[index].toString(16).padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// The key must come from the platform generator. There is no fallback to a
// predictable value, because a guessable key would hand the answer to anyone.
function createCredentials(cryptoImpl) {
  if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== "function") {
    throw new SearchJobError("Brauser ei toeta turvalist juhuarvugeneraatorit.", { code: "invalid_request" });
  }
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(32));
  if (!bytes || bytes.length !== 32) {
    throw new SearchJobError("Otsingutöö võtit ei saanud luua.", { code: "invalid_request" });
  }
  const id = typeof cryptoImpl.randomUUID === "function" ? cryptoImpl.randomUUID() : randomUuid(cryptoImpl);
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    throw new SearchJobError("Otsingutöö identifikaator on vigane.", { code: "invalid_request" });
  }
  return { id, key: base64url(bytes) };
}

function serverMessage(payload, fallback) {
  if (isPlainObject(payload)) {
    for (const field of ["error", "message", "detail"]) {
      if (typeof payload[field] === "string" && payload[field].trim()) return payload[field].trim().slice(0, 300);
    }
  }
  return fallback;
}

// The application answers with its own envelope (`code`, usually also `error`).
// An edge or proxy error page has no such code, so it proves nothing about
// whether the request reached the store and started a job.
function appRefusal(payload) {
  return isPlainObject(payload) && typeof payload.code === "string" && /^JOB_[A-Z0-9_]+$/.test(payload.code);
}

function deadlineOf(value) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number(value);
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 0;
}

function isRetryable(error) {
  return error instanceof SearchJobError && error.retryable === true;
}

// One deadline for the request, forwarded from the caller's signal so an abort
// still reaches the socket while the request is in flight.
function linkSignals({ signal, timeoutMs, setTimer, clearTimer }) {
  const controller = new AbortController();
  let timedOut = false;
  let timer = null;
  const forward = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) forward();
    else signal.addEventListener("abort", forward, { once: true });
  }
  if (timeoutMs > 0) {
    timer = setTimer(() => {
      timedOut = true;
      controller.abort(new Error("request timeout"));
    }, timeoutMs);
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose() {
      if (timer) clearTimer(timer);
      signal?.removeEventListener?.("abort", forward);
    },
  };
}

function sleep(milliseconds, signal, setTimer, clearTimer) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal.reason));
      return;
    }
    let timer = null;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimer(timer);
      signal?.removeEventListener?.("abort", onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, abortError(signal.reason));
    timer = setTimer(() => finish(resolve), milliseconds);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

async function postJson({
  fetchImpl,
  path,
  body,
  signal = null,
  keepalive = false,
  timeoutMs,
  maxBufferBytes,
  setTimer,
  clearTimer,
}) {
  const link = linkSignals({ signal, timeoutMs, setTimer, clearTimer });
  const failure = (error) => {
    if (signal?.aborted) return abortError(signal.reason);
    const timedOut = link.timedOut();
    return new SearchJobError(
      timedOut ? "Otsingutöö päring aegus." : "Otsingu ühendus katkes.",
      { code: timedOut ? "timeout" : "transport", retryable: true, cause: error },
    );
  };
  try {
    let response;
    try {
      response = await fetchImpl(path, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "same-origin",
        keepalive,
        signal: link.signal,
      });
    } catch (error) {
      throw failure(error);
    }
    let text = "";
    try {
      text = await response.text();
    } catch (error) {
      throw failure(error);
    }
    let data = null;
    if (typeof text === "string" && text.trim()) {
      if (text.length > maxBufferBytes) {
        throw new SearchJobError("Otsingutöö vastus oli liiga mahukas.", { code: "invalid_response", status: response.status });
      }
      try {
        data = JSON.parse(text);
      } catch {
        // A proxy error page is not JSON, and that must not decide whether the
        // request failed: the status does. A 2xx with no readable body is caught
        // by the caller as an invalid response.
        data = null;
      }
    }
    return { ok: Boolean(response.ok), status: Number(response.status) || 0, data, response };
  } finally {
    link.dispose();
  }
}

export async function readSearchJob(options = {}) {
  const {
    kind,
    payload,
    signal = null,
    onEvent = () => {},
    onResponse = () => {},
    fetchImpl = globalThis.fetch,
    cryptoImpl = globalThis.crypto,
    now = () => Date.now(),
    setTimer = (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimer = (handle) => clearTimeout(handle),
    pagehideTarget = typeof window === "undefined" ? null : window,
    pollIntervalMs = SEARCH_JOB_POLL_MS,
    requestTimeoutMs = SEARCH_JOB_REQUEST_TIMEOUT_MS,
    cancelTimeoutMs = SEARCH_JOB_CANCEL_TIMEOUT_MS,
    maxJobMs = SEARCH_JOB_MAX_MS,
    createGraceMs = SEARCH_JOB_CREATE_GRACE_MS,
    maxConsecutiveFailures = SEARCH_JOB_MAX_CONSECUTIVE_FAILURES,
    maxBufferBytes = SEARCH_JOB_MAX_BUFFER,
  } = options || {};

  if (kind !== "search" && kind !== "follow-up") {
    throw new SearchJobError("Otsingutöö liik on vigane.", { code: "invalid_request" });
  }
  if (!isPlainObject(payload)) {
    throw new SearchJobError("Otsingutöö päring on vigane.", { code: "invalid_request" });
  }
  if (typeof fetchImpl !== "function") {
    throw new SearchJobError("Brauser ei toeta otsingutöö päringuid.", { code: "invalid_request" });
  }

  const { id, key } = createCredentials(cryptoImpl);
  const startedAt = now();
  let deadlineAt = startedAt + maxJobMs;
  let graceUntil = startedAt + createGraceMs;
  let lastSeq = 0;
  let phase = 0;
  let answer = null;
  let lastState = "";
  let lastErrorText = "";
  let acknowledged = false;
  let cancelCalled = false;
  let consecutiveFailures = 0;
  // A create request has left the browser, so the store may hold this record.
  let jobMayExist = false;
  // No live job is left to abort: terminal state, unknown id, explicit store
  // closure, or the store's own deadline has passed.
  let jobFinished = false;

  const listingReady = () => phase >= 1;
  const withListing = (error) => {
    error.listingReady = listingReady();
    return error;
  };
  const invalidResponse = (message = "Otsingutöö vastus oli vigane.", status = 0) => new SearchJobError(message, { code: "invalid_response", status });
  const expiredError = () => {
    // The store's own 285 s hard limit has passed, so the job is already terminal.
    jobFinished = true;
    return withListing(new SearchJobError("Otsingu aeg sai läbi. Proovi otsing uuesti käivitada.", { code: "job_expired" }));
  };
  // A dead connection must not look like a slow answer: after a few unusable
  // attempts in a row the browser says so instead of polling for minutes. Only an
  // explicit store answer proves there is no live job left to cancel.
  const connectionError = (status = 0, explicit = false) => {
    const closed = status === 503 && explicit;
    if (closed) jobFinished = true;
    const code = status === 429 ? "job_capacity" : closed ? "job_closed" : "transport";
    const message = status === 429
      ? "Otsing on hetkel hõivatud. Proovi mõne sekundi pärast uuesti."
      : closed
        ? "Otsingu teenus sulgub. Proovi hetke pärast uuesti."
        : listingReady()
          ? "Ühendus katkes. Juba leitud tulemused on endiselt saadaval, proovi vastust uuesti."
          : "Serveriga ei saanud ühendust. Proovi uuesti.";
    return withListing(new SearchJobError(message, { code, status, retryable: status === 429 || closed }));
  };
  const noteFailure = (status, explicit = false) => {
    consecutiveFailures += 1;
    if (consecutiveFailures >= maxConsecutiveFailures) throw connectionError(status, explicit);
  };

  // Events are planned first and delivered second, so a malformed response can
  // never leave half of a listing on the screen and the phase untouched.
  const planEvents = (entries) => {
    if (!Array.isArray(entries)) throw invalidResponse("Otsingutöö sündmused olid vigased.");
    let nextPhase = phase;
    let nextAnswer = answer;
    let nextSeq = lastSeq;
    const accepted = [];
    for (const entry of entries) {
      if (!isPlainObject(entry)) throw invalidResponse("Otsingutöö sündmused olid vigased.");
      const seq = Number(entry.seq);
      if (!Number.isInteger(seq) || seq < 1) throw invalidResponse("Otsingutöö sündmuste järjekord oli vigane.");
      if (seq <= nextSeq) continue;
      if (seq !== nextSeq + 1) throw invalidResponse("Otsingutöö sündmuste järjekord oli vigane.");
      const event = entry.event;
      if (!isPlainObject(event) || !EVENT_TYPES.has(event.type)) {
        throw invalidResponse("Otsing tagastas tundmatu vahetulemuse.");
      }
      if (event.type === "results" && (!event.searchResults || typeof event.searchResults !== "object")) {
        throw invalidResponse("Otsingutulemuste vahetulemus on vigane.");
      }
      if ((event.type === "draft" || event.type === "answer") && (!event.result || typeof event.result !== "object")) {
        throw invalidResponse("Koondvastuse vahetulemus on vigane.");
      }
      if (event.type === "results") {
        if (nextPhase !== 0) throw invalidResponse("Otsingu vahetulemused saabusid vales järjekorras.");
        nextPhase = 1;
      } else if (event.type === "draft") {
        if (nextPhase !== 1) throw invalidResponse("Otsingu vahetulemused saabusid vales järjekorras.");
        nextPhase = 2;
      } else {
        if (nextPhase < 1 || nextPhase >= 3) throw invalidResponse("Otsingu lõppvastus saabus vales järjekorras.");
        nextPhase = 3;
        nextAnswer = event;
      }
      nextSeq = seq;
      accepted.push(event);
    }
    return { accepted, nextPhase, nextAnswer, nextSeq };
  };

  const applyBody = (response, data) => {
    if (!isPlainObject(data) || typeof data.job_id !== "string" || data.job_id !== id) {
      throw invalidResponse("Otsingutöö vastus oli vigane.", response?.status ?? 0);
    }
    const deadline = deadlineOf(data.deadline_at);
    if (deadline) {
      // The deadline is on the server clock. Use it only when it is plausible
      // here, so a device with a wrong clock cannot end a live search early; the
      // local budget below is then the backstop.
      const remaining = deadline - now();
      if (remaining > 0 && remaining <= maxJobMs) deadlineAt = Math.min(deadlineAt, deadline);
    }
    if (typeof data.state === "string" && data.state.trim()) lastState = data.state.trim().toLowerCase();
    if (typeof data.error === "string" && data.error.trim()) lastErrorText = data.error.trim().slice(0, 300);
    const plan = planEvents(data.events ?? []);
    phase = plan.nextPhase;
    answer = plan.nextAnswer;
    lastSeq = plan.nextSeq;
    for (const event of plan.accepted) onEvent(event);
  };

  const answerMissingError = () => withListing(new SearchJobError(
    listingReady()
      ? "Tulemused leiti, kuid koondvastust ei saabunud. Proovi uuesti."
      : "Otsingu lõppvastus jäi saabumata.",
    { code: "answer_missing" },
  ));

  const terminalOutcome = () => {
    if (answer) return answer;
    if (TERMINAL_STATES.has(lastState)) jobFinished = true;
    if (CANCELLED_STATES.has(lastState)) throw withListing(new SearchJobError("Otsing tühistati.", { code: "job_cancelled" }));
    if (EXPIRED_STATES.has(lastState)) throw expiredError();
    if (FAILED_STATES.has(lastState)) {
      throw withListing(new SearchJobError(
        lastErrorText || "Otsingu koostamine ebaõnnestus. Proovi uuesti.",
        { code: "job_failed" },
      ));
    }
    if (SUCCESS_STATES.has(lastState)) throw answerMissingError();
    return null;
  };

  const pollDelay = (data) => {
    const hinted = Number(data?.retry_after_ms);
    const base = Number.isFinite(hinted) && hinted >= 0 ? hinted : pollIntervalMs;
    return Math.min(Math.max(base, pollIntervalMs), SEARCH_JOB_MAX_POLL_DELAY_MS);
  };

  const stop = new AbortController();
  const stopWith = (reason) => {
    if (!stop.signal.aborted) stop.abort(reason);
  };
  const onSignalAbort = () => stopWith(signal?.reason ?? abortError());
  const onPagehide = () => {
    const reason = new Error("Leht suleti.");
    reason.name = "AbortError";
    stopWith(reason);
  };
  if (signal) {
    if (signal.aborted) stopWith(signal.reason);
    else signal.addEventListener?.("abort", onSignalAbort, { once: true });
  }
  pagehideTarget?.addEventListener?.("pagehide", onPagehide, { once: true });
  const cleanup = () => {
    signal?.removeEventListener?.("abort", onSignalAbort);
    pagehideTarget?.removeEventListener?.("pagehide", onPagehide);
  };

  const throwIfStopped = () => {
    if (stop.signal.aborted) throw abortError(stop.signal.reason);
  };

  const cancelJob = async () => {
    if (cancelCalled || !jobMayExist || jobFinished) return;
    cancelCalled = true;
    try {
      // keepalive so a navigation does not drop the request; a 404 tombstone for
      // an id that never existed is a success, and nothing here may mask an abort.
      await postJson({
        fetchImpl,
        path: SEARCH_JOB_CANCEL_PATH,
        body: { job_id: id, job_key: key },
        signal: null,
        keepalive: true,
        timeoutMs: cancelTimeoutMs,
        maxBufferBytes,
        setTimer,
        clearTimer,
      });
    } catch {
      // Cancelling is best effort: 200 (recorded), 404 (unknown id or wrong key)
      // and 429 (no room for the tombstone) are all non-fatal, never retried and
      // never shown to the reader. This must not replace the abort that follows.
    }
  };

  try {
    throwIfStopped();

    jobMayExist = true;
    let created = null;
    try {
      created = await postJson({
        fetchImpl,
        path: SEARCH_JOB_CREATE_PATH,
        body: { job_id: id, job_key: key, kind, request: payload },
        signal: stop.signal,
        timeoutMs: requestTimeoutMs,
        maxBufferBytes,
        setTimer,
        clearTimer,
      });
    } catch (error) {
      if (!isRetryable(error)) throw error;
      // The acknowledgement was lost, not the job: the same id and key are polled
      // from here on. A second create could pay for the same answer twice.
      noteFailure(0);
      created = null;
    }

    if (created) {
      onResponse(created.response);
      if (created.status === 409) {
        // The id already holds a different request, so this create started nothing.
        jobFinished = true;
        throw new SearchJobError("Otsingutöö päring erineb juba käivitatud otsingust.", { code: "job_conflict", status: 409 });
      }
      if (!created.ok) {
        // A 4xx never reached the store's admission, so it proves no job exists.
        // A 5xx can come from an edge that swallowed an accepted create, so it
        // only counts as a refusal when the application's own code says so.
        const definitive = created.status < 500 || appRefusal(created.data);
        if (!definitive) {
          // The store may already have accepted this create, so the same
          // credentials are polled and a second job is never created.
          noteFailure(created.status);
          created = null;
        } else if (created.status === 429) {
          jobFinished = true;
          throw new SearchJobError("Otsing on hetkel hõivatud. Proovi mõne sekundi pärast uuesti.", {
            code: "job_capacity",
            status: 429,
            retryable: true,
            retryAfterMs: Number(created.data?.retry_after_ms),
          });
        } else if (created.status === 503) {
          jobFinished = true;
          throw new SearchJobError("Otsingu teenus sulgub. Proovi hetke pärast uuesti.", { code: "job_closed", status: 503, retryable: true });
        } else {
          jobFinished = true;
          throw new SearchJobError(serverMessage(created.data, "Otsingut ei saanud käivitada."), {
            code: "invalid_response",
            status: created.status,
          });
        }
      }
    }

    if (created) {
      consecutiveFailures = 0;
      acknowledged = true;
      applyBody(created.response, created.data);
      const finished = terminalOutcome();
      if (finished) return finished;
    } else {
      // No acknowledgement: give the create a moment to land before the first
      // 404 is believed.
      graceUntil = now() + createGraceMs;
    }

    let delayMs = 0;
    while (true) {
      throwIfStopped();
      if (now() - startedAt >= maxJobMs || now() >= deadlineAt) throw expiredError();
      if (delayMs > 0) {
        await sleep(delayMs, stop.signal, setTimer, clearTimer);
        throwIfStopped();
      }

      let polled;
      try {
        polled = await postJson({
          fetchImpl,
          path: SEARCH_JOB_POLL_PATH,
          body: { job_id: id, job_key: key, after: lastSeq },
          signal: stop.signal,
          timeoutMs: requestTimeoutMs,
          maxBufferBytes,
          setTimer,
          clearTimer,
        });
      } catch (error) {
        if (!isRetryable(error)) throw error;
        // Only the poll is retried; the work behind it keeps running untouched.
        noteFailure(0);
        delayMs = pollIntervalMs;
        continue;
      }

      onResponse(polled.response);

      if (polled.status === 404) {
        if (!acknowledged && now() <= graceUntil) {
          delayMs = pollIntervalMs;
          continue;
        }
        // The store does not know this id (or the key is wrong, which is the same
        // answer on purpose), so nothing is left behind to cancel.
        jobFinished = true;
        throw withListing(new SearchJobError("Otsingutööd ei leitud. Käivita otsing uuesti.", { code: "job_lost", status: 404 }));
      }
      if (polled.status === 409) {
        throw new SearchJobError("Otsingutöö päring erineb algseisust.", { code: "job_conflict", status: 409 });
      }
      if (RETRYABLE_STATUSES.has(polled.status)) {
        // A retryable status counts against the same bound as a dead connection,
        // otherwise a server stuck on 503 would be polled until the deadline.
        noteFailure(polled.status, appRefusal(polled.data));
        delayMs = pollDelay(polled.data);
        continue;
      }
      if (!polled.ok) {
        throw withListing(new SearchJobError(serverMessage(polled.data, "Otsing ei vastanud."), {
          code: "invalid_response",
          status: polled.status,
        }));
      }

      consecutiveFailures = 0;
      applyBody(polled.response, polled.data);
      const finished = terminalOutcome();
      if (finished) return finished;
      delayMs = pollDelay(polled.data);
    }
  } catch (error) {
    if (stop.signal.aborted) {
      await cancelJob();
      throw abortError(stop.signal.reason ?? error);
    }
    // A read that ends before a terminal state leaves a job nobody will read, so
    // it is aborted like an abort. cancelJob is a no-op when no record can exist
    // or when the store already proved the job is gone.
    await cancelJob();
    throw error;
  } finally {
    cleanup();
  }
}
