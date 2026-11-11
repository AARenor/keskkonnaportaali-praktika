// A grounded answer can legitimately outlive any single HTTP exchange, and the
// proxy in front of the portal refuses to keep an origin response open that
// long. The reader therefore stops holding one long stream open: a job is
// created, generation runs detached from the request, and every short poll
// returns only the events the reader has not seen yet.
//
// This module is the server half of that protocol. It owns admission, the
// detached run, bounded public events, replay and cancellation. It never
// generates and never retries an answer: `run` is the existing search
// coordinator, scheduled exactly once per job.
//
// Deliberate privacy choice: the job key and the client key are only ever held
// as sha256 digests. The store needs them for ownership and admission counting,
// never in the clear, and nothing in this module writes a query, a key or a
// client address anywhere.
//
// A replayed event may carry text copied from a source whose permission to copy
// it has an end. A public event has already lost the witness that would prove
// that end, so the producer supplies the instant and a safe replacement
// alongside emit; the store serves the replacement from that instant, keeps the
// sequence identical, and never publishes the bound itself.

import { createHash, timingSafeEqual } from "node:crypto";

// The only event types the public search stream already produces. The poll body
// carries the same objects, so the browser can reuse one set of callbacks.
const PUBLIC_EVENT_TYPES = new Set(["results", "draft", "answer"]);

export const JOB_STATES = Object.freeze({
  RUNNING: "running",
  COMPLETE: "complete",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

const TERMINAL_STATES = new Set([JOB_STATES.COMPLETE, JOB_STATES.FAILED, JOB_STATES.CANCELLED]);

// A job is either a first search or a follow-up about an existing answer; both
// use the same request payload shape the streaming routes already accept.
const JOB_KINDS = new Set(["search", "follow-up"]);

// Hard bounds. These are the ceilings, not tuning knobs: a deployment may lower
// any of them, none may be raised past these numbers.
export const JOB_BOUNDS = Object.freeze({
  liveJobs: 40,
  liveJobsPerClient: 10,
  records: 2_000,
  // Cancelling an identifier that never existed buys a record slot that blocks
  // a later same-key create, so it is spent from its own small budget rather
  // than from the record space real reads need. The effective allowance is this
  // cap reduced by the configured record and byte budgets, so one record worth
  // of capacity always remains for a real job however small those budgets are
  // lowered.
  unknownCancelReservations: 200,
  unknownCancelReservationsPerClient: 2,
  jobBytes: 2_000_000,
  totalBytes: 16_000_000,
  ownerLeaseMs: 30_000,
  terminalPayloadMs: 60_000,
  tombstoneMs: 600_000,
  hardDeadlineMs: 285_000,
  sweepMs: 1_000,
  retryAfterMs: 2_000,
  closeGraceMs: 5_000,
  payloadBytes: 32_768,
  idPattern: /^[A-Za-z0-9_-]{8,64}$/,
  keyPattern: /^[A-Za-z0-9_-]{16,128}$/,
});

// Each retained record also costs its own bookkeeping bytes, so 2000 idle
// tombstones cannot hide inside the 16 MB event budget.
const RECORD_OVERHEAD_BYTES = 512;
const CANONICAL_DEPTH = 16;

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(parsed, maximum));
}

function defaultHashSecret(value) {
  return createHash("sha256").update(value, "utf8").digest();
}

function sameSecret(left, right) {
  // Both sides are sha256 digests, so a length mismatch is a programming error
  // rather than an attacker-controlled branch; the length check still runs
  // first because timingSafeEqual throws on unequal buffers.
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function jobError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function response(status, body) {
  return { status, body };
}

const INVALID = () => response(400, { code: "JOB_INVALID", error: "Töö päring on vigane." });
const NOT_FOUND = () => response(404, { code: "JOB_NOT_FOUND", error: "Tööd ei leitud." });
const CONFLICT = () => response(409, {
  code: "JOB_CONFLICT",
  error: "Selle töö identifikaator on juba teistsuguse päringu jaoks kasutusel.",
});
const CAPACITY = () => response(429, {
  code: "JOB_CAPACITY",
  error: "Tööde järjekord on täis. Proovi mõne hetke pärast uuesti.",
  retry_after_ms: JOB_BOUNDS.retryAfterMs,
});
const CLOSED = () => response(503, {
  code: "JOB_CLOSED",
  error: "Server lõpetab tööd. Proovi mõne hetke pärast uuesti.",
  retry_after_ms: 0,
});

/**
 * Order-insensitive JSON for payload fingerprints. Two requests that mean the
 * same thing must hash identically, otherwise a retried create would look like
 * a different request and be refused as a conflict.
 */
function canonicalJson(value, depth = 0, seen = new WeakSet()) {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (type === "boolean") return value ? "true" : "false";
  if (type === "string") return JSON.stringify(value);
  if (type === "bigint") return JSON.stringify(String(value));
  if (type !== "object") return undefined;
  if (depth >= CANONICAL_DEPTH) throw jobError("JOB_PAYLOAD_INVALID", "Töö päring on liiga sügav.");
  if (seen.has(value)) throw jobError("JOB_PAYLOAD_INVALID", "Töö päring on iseennast sisaldav.");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const parts = [];
      for (const item of value) {
        const encoded = canonicalJson(item, depth + 1, seen);
        parts.push(encoded === undefined ? "null" : encoded);
      }
      return `[${parts.join(",")}]`;
    }
    const parts = [];
    for (const key of Object.keys(value).sort()) {
      const encoded = canonicalJson(value[key], depth + 1, seen);
      if (encoded === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${encoded}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

// Recorded events are handed back to every poll, so they must be immutable:
// freezing once at emit time is cheaper than cloning on every read and makes a
// late mutation by the runner impossible to observe.
function freezeEvent(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeEvent(value[key]);
  return Object.freeze(value);
}

/**
 * The process-local job registry.
 *
 * Every job lives in this store only. A restart loses jobs; nothing here ever
 * recreates one, and a reader that lost its job must start a new search.
 */
export function createSearchJobStore({
  now = Date.now,
  setInterval: startInterval = setInterval,
  clearInterval: stopInterval = clearInterval,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  hashSecret = defaultHashSecret,
  liveJobs = JOB_BOUNDS.liveJobs,
  liveJobsPerClient = JOB_BOUNDS.liveJobsPerClient,
  records: recordsLimit = JOB_BOUNDS.records,
  unknownCancelReservations = JOB_BOUNDS.unknownCancelReservations,
  unknownCancelReservationsPerClient = JOB_BOUNDS.unknownCancelReservationsPerClient,
  jobBytes = JOB_BOUNDS.jobBytes,
  totalBytes: totalBytesLimit = JOB_BOUNDS.totalBytes,
  ownerLeaseMs = JOB_BOUNDS.ownerLeaseMs,
  terminalPayloadMs = JOB_BOUNDS.terminalPayloadMs,
  tombstoneMs = JOB_BOUNDS.tombstoneMs,
  hardDeadlineMs = JOB_BOUNDS.hardDeadlineMs,
  sweepMs = JOB_BOUNDS.sweepMs,
  retryAfterMs = JOB_BOUNDS.retryAfterMs,
  closeGraceMs = JOB_BOUNDS.closeGraceMs,
  payloadBytes = JOB_BOUNDS.payloadBytes,
} = {}) {
  const limits = {
    liveJobs: boundedInteger(liveJobs, JOB_BOUNDS.liveJobs, 1, JOB_BOUNDS.liveJobs),
    liveJobsPerClient: boundedInteger(liveJobsPerClient, JOB_BOUNDS.liveJobsPerClient, 1, JOB_BOUNDS.liveJobsPerClient),
    records: boundedInteger(recordsLimit, JOB_BOUNDS.records, 1, JOB_BOUNDS.records),
    unknownCancelReservations: boundedInteger(
      unknownCancelReservations,
      JOB_BOUNDS.unknownCancelReservations,
      1,
      JOB_BOUNDS.unknownCancelReservations,
    ),
    unknownCancelReservationsPerClient: boundedInteger(
      unknownCancelReservationsPerClient,
      JOB_BOUNDS.unknownCancelReservationsPerClient,
      1,
      JOB_BOUNDS.unknownCancelReservationsPerClient,
    ),
    jobBytes: boundedInteger(jobBytes, JOB_BOUNDS.jobBytes, 1_024, JOB_BOUNDS.jobBytes),
    totalBytes: boundedInteger(totalBytesLimit, JOB_BOUNDS.totalBytes, 2_048, JOB_BOUNDS.totalBytes),
    ownerLeaseMs: boundedInteger(ownerLeaseMs, JOB_BOUNDS.ownerLeaseMs, 1, JOB_BOUNDS.ownerLeaseMs),
    terminalPayloadMs: boundedInteger(terminalPayloadMs, JOB_BOUNDS.terminalPayloadMs, 1, JOB_BOUNDS.terminalPayloadMs),
    tombstoneMs: boundedInteger(tombstoneMs, JOB_BOUNDS.tombstoneMs, 1, JOB_BOUNDS.tombstoneMs),
    hardDeadlineMs: boundedInteger(hardDeadlineMs, JOB_BOUNDS.hardDeadlineMs, 1_000, JOB_BOUNDS.hardDeadlineMs),
    sweepMs: boundedInteger(sweepMs, JOB_BOUNDS.sweepMs, 50, JOB_BOUNDS.sweepMs),
    retryAfterMs: boundedInteger(retryAfterMs, JOB_BOUNDS.retryAfterMs, 100, JOB_BOUNDS.retryAfterMs),
    closeGraceMs: boundedInteger(closeGraceMs, JOB_BOUNDS.closeGraceMs, 1, JOB_BOUNDS.closeGraceMs),
    payloadBytes: boundedInteger(payloadBytes, JOB_BOUNDS.payloadBytes, 256, JOB_BOUNDS.payloadBytes),
  };

  const secretDigest = (value) => Buffer.from(hashSecret(String(value)));
  const records = new Map();
  // Accounting is a set of runner settlements, not a property of a record: an
  // admitted job stays charged here until its runner really settles, even after
  // its job is terminal and even after the record itself has been dropped. That
  // is what stops a hung provider from being replaced by work whose cost the
  // process cannot account for, and it bounds the pending runners at the live
  // job cap instead of at throughput.
  const held = new Set();
  // Cancel reservations, kept separate from both the record map and the live
  // accounting: only a tombstone from an unknown-id cancel is here, and its
  // reservation is returned when the tombstone expires or is replaced.
  const reservations = new Set();
  const pendingRuns = new Set();
  // A cancel reservation may never be what makes a real read impossible, so the
  // allowance is derived from the configured budgets: one record worth of record
  // slots and one record worth of bytes always stay available for a job.
  // Lowering records or totalBytes therefore shrinks the cancel budget instead
  // of letting it take the last slot; with records 1 or a 2048-byte budget the
  // allowance collapses to what still leaves room for one real job.
  const reservationAllowance = Math.max(0, Math.min(
    limits.unknownCancelReservations,
    limits.records - 1,
    Math.floor((limits.totalBytes - RECORD_OVERHEAD_BYTES) / RECORD_OVERHEAD_BYTES),
  ));
  let totalBytesUsed = 0;
  let closed = false;
  let closePromise = null;

  function charge(record) {
    held.add(record);
  }

  // The only two release paths are the runner settling and shutdown.
  function release(record) {
    held.delete(record);
  }

  function remove(record) {
    if (!records.has(record.id) || records.get(record.id) !== record) return;
    records.delete(record.id);
    // A removed tombstone gives its cancel reservation back; a removed job
    // record keeps its runner accounting, which only settlement or shutdown can
    // return.
    reservations.delete(record);
    // Removing a record ends its visibility, and the stored events go with it:
    // a runner that is still alive keeps its own record reachable through the
    // emit closure, and that must not keep the answer text in memory.
    dropEvents(record);
    totalBytesUsed = Math.max(0, totalBytesUsed - record.bytes);
  }

  // Free every stored public event and its byte accounting. Called when the
  // replay window closes, when a record is dropped and at shutdown, so answer
  // text can never outlive the job that produced it.
  function dropEvents(record) {
    totalBytesUsed = Math.max(0, totalBytesUsed - record.eventBytes);
    record.bytes -= record.eventBytes;
    record.eventBytes = 0;
    record.events = [];
  }

  // The 60 s window keeps the full answer replayable; after it the record
  // survives as a cheap tombstone so a retried create still gets the same
  // answer state instead of starting a second generation.
  function trimPayload(record) {
    record.payloadExpiresAt = null;
    dropEvents(record);
  }

  function terminate(record, state) {
    if (record.state !== JOB_STATES.RUNNING || !TERMINAL_STATES.has(state)) return false;
    const current = now();
    record.state = state;
    record.terminalAt = current;
    // A terminal state is final: any event the runner still tries to emit is
    // dropped by the running-state check in emitFor, so a cancelled or timed
    // out job can never grow an answer later.
    record.payloadExpiresAt = current + limits.terminalPayloadMs;
    record.expiresAt = current + limits.tombstoneMs;
    // The owner lease is the abandonment clock, never a release clock: it marks
    // when a runner that did not settle is treated as abandoned and signalled
    // again. It does not stop the job from holding its accounting.
    record.abandonAt = current + limits.ownerLeaseMs;
    record.abandoned = false;
    const reason = state === JOB_STATES.CANCELLED
      ? jobError("JOB_CANCELLED", "Töö tühistati.")
      : state === JOB_STATES.FAILED
        ? jobError("JOB_FAILED", "Töö ebaõnnestus.")
        : jobError("JOB_COMPLETE", "Töö lõppes.");
    try {
      record.controller?.abort?.(reason);
    } catch {
      // An abort listener that throws must not keep the terminal state from
      // being published.
    }
    return true;
  }

  function markSettled(record) {
    record.settled = true;
    record.abandonAt = null;
    // Accounting is held until the real runner settled, so a job that ignores
    // its abort signal keeps holding its client slot instead of silently
    // admitting work the process cannot actually free. This is the release.
    release(record);
  }

  function expireIfDue(record, current) {
    if (record.state === JOB_STATES.RUNNING && current >= record.deadlineAt) {
      terminate(record, JOB_STATES.FAILED);
    }
    if (record.abandonAt !== null && !record.abandoned && current >= record.abandonAt) {
      // The owner lease expired with the runner still unsettled: the job is
      // abandoned, so its signal is raised again for anything that still holds
      // a provider connection, and the abandonment becomes visible. Accounting
      // is deliberately NOT released here: a hung provider must never be
      // replaced, because the replacement would spend tokens the process cannot
      // account for. Only the real settlement or shutdown frees the slot.
      record.abandoned = true;
      try {
        record.controller?.abort?.(jobError("JOB_ABANDONED", "Töö omanik ei vasta."));
      } catch {
        // Ignored: an abort listener that throws must not stop the sweep.
      }
    }
    if (record.payloadExpiresAt !== null && current >= record.payloadExpiresAt) trimPayload(record);
    // An identity whose runner is still unsettled outlives its retention
    // window: the id, the terminal state and the conflict answer are still
    // load-bearing, and dropping the record would let the same id be created
    // again or a foreign cancel plant a competing tombstone for it. The live
    // slot cap bounds how many such records can exist, and settlement makes the
    // expired record reclaimable on the next sweep.
    if (record.expiresAt !== null && current >= record.expiresAt && !held.has(record)) remove(record);
  }

  function sweep() {
    if (closed) return;
    const current = now();
    for (const record of [...records.values()]) expireIfDue(record, current);
  }

  function evictableRecord(current) {
    for (const record of records.values()) {
      // Only an expired record may be reclaimed. An unexpired record still
      // carries a promise: a retried create must replay it instead of running
      // again, and a cancelled identifier must stay cancelled for its owner.
      // Paying for record space with either promise would break idempotency, so
      // pressure is answered with a refusal instead of with an eviction.
      if (record.expiresAt === null || current < record.expiresAt) continue;
      // An expired record whose runner has not settled is still the active
      // identity for its id, so pressure may not take it either.
      if (held.has(record)) continue;
      return record;
    }
    return null;
  }

  function makeRoom() {
    const current = now();
    while (records.size >= limits.records) {
      const victim = evictableRecord(current);
      if (!victim) return false;
      remove(victim);
    }
    return true;
  }

  function publicEvent(type, data) {
    if (typeof type !== "string" || !PUBLIC_EVENT_TYPES.has(type)) {
      throw jobError("JOB_EVENT_INVALID", "Tundmatu sündmuse tüüp.");
    }
    const payload = data === undefined ? {} : data;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw jobError("JOB_EVENT_INVALID", "Sündmuse sisu peab olema objekt.");
    }
    let encoded;
    try {
      // The type always wins: a payload cannot relabel the event it travels in.
      encoded = JSON.stringify({ ...payload, type });
    } catch {
      throw jobError("JOB_EVENT_INVALID", "Sündmuse sisu ei ole serialiseeritav.");
    }
    if (typeof encoded !== "string") throw jobError("JOB_EVENT_INVALID", "Sündmuse sisu ei ole serialiseeritav.");
    const bytes = Buffer.byteLength(encoded, "utf8");
    if (bytes > limits.jobBytes) throw jobError("JOB_EVENT_TOO_LARGE", "Sündmus on liiga suur.");
    // JSON.parse of our own encoding gives the poll body a detached copy, so a
    // later mutation inside the runner can never rewrite what a reader already
    // received.
    return { event: freezeEvent(JSON.parse(encoded)), bytes };
  }

  /**
   * A copied field carries a source permission that can expire, and the public
   * event has already lost the witness that would prove it. The producer
   * therefore supplies the instant and a safe replacement at emit time, and the
   * store serves the replacement from then on. Anything the store cannot honour
   * is refused here, so an expired copy is never replayed later.
   */
  function copyWindow(type, options) {
    if (options === undefined || options === null) return { expiresAt: null, fallback: null, bytes: 0 };
    if (typeof options !== "object" || Array.isArray(options)) {
      throw jobError("JOB_EVENT_INVALID", "Sündmuse aken peab olema objekt.");
    }
    const { expiresAt, fallback } = options;
    if (expiresAt === undefined && fallback === undefined) return { expiresAt: null, fallback: null, bytes: 0 };
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
      throw jobError("JOB_EVENT_INVALID", "Sündmuse aken peab olema lõplik arv.");
    }
    if (fallback === undefined) {
      throw jobError("JOB_EVENT_INVALID", "Sündmusel puudub ohutu asendus.");
    }
    const built = publicEvent(type, fallback);
    return { expiresAt, fallback: built.event, bytes: built.bytes };
  }

  function emitFor(record) {
    return (type, data, options) => {
      // A late event is not an error: cancellation, a timeout and a failed
      // runner all race with generation, and the terminal state wins. A record
      // that is no longer the live record for its id has been evicted or the
      // store has closed, so it may never publish again either.
      if (closed || record.state !== JOB_STATES.RUNNING || records.get(record.id) !== record) return;
      if (now() >= record.deadlineAt) {
        terminate(record, JOB_STATES.FAILED);
        throw jobError("JOB_DEADLINE", "Töö tähtaeg möödus.");
      }
      const built = publicEvent(type, data);
      const bound = copyWindow(type, options);
      const fits = (bytes) => record.eventBytes + bytes <= limits.jobBytes
        && totalBytesUsed + bytes <= limits.totalBytes;
      const pairBytes = built.bytes + bound.bytes;
      let entry;
      let bytes;
      if (fits(pairBytes)) {
        // The window and the replacement live beside the event, never inside it,
        // and both payloads are charged to the same byte budgets.
        entry = { seq: record.nextSeq, event: built.event, expiresAt: bound.expiresAt, fallback: bound.fallback };
        bytes = pairBytes;
      } else if (bound.fallback !== null && fits(bound.bytes)) {
        // The pair does not fit but the safe replacement does, so the event is
        // stored as the replacement itself with no window at all. The reader
        // keeps every link, the copied text is never retained, the sequence
        // number is unchanged and there is nothing left to expire, which is
        // strictly better than failing the job and serving no links.
        entry = { seq: record.nextSeq, event: bound.fallback, expiresAt: null, fallback: null };
        bytes = bound.bytes;
      } else {
        terminate(record, JOB_STATES.FAILED);
        throw jobError("JOB_BYTES", "Töö vastus ületas lubatud mahu.");
      }
      record.events.push(entry);
      record.nextSeq += 1;
      record.eventBytes += bytes;
      record.bytes += bytes;
      totalBytesUsed += bytes;
    };
  }

  function bodyFor(record, after) {
    const terminal = record.state !== JOB_STATES.RUNNING;
    const current = now();
    return {
      job_id: record.id,
      state: record.state,
      deadline_at: record.deadlineAt === null ? null : new Date(record.deadlineAt).toISOString(),
      retry_after_ms: terminal ? 0 : limits.retryAfterMs,
      events: record.events
        .filter((entry) => entry.seq > after)
        // An elapsed copy window serves the producer's safe replacement at the
        // same sequence number: the original is never replayed past its window,
        // the sequence stays dense, and the bound itself never reaches the body.
        .map((entry) => {
          if (entry.expiresAt === null || current < entry.expiresAt) return { seq: entry.seq, event: entry.event };
          // copyWindow refuses a window without a replacement, so this branch
          // can never fall back to the original.
          return { seq: entry.seq, event: entry.fallback };
        }),
    };
  }

  function schedule(record, run) {
    let tracked = null;
    const pending = Promise.resolve()
      .then(async () => {
        try {
          // The job may have been cancelled before this tick even reached the
          // runner, in which case generation must not happen at all.
          if (closed || record.state !== JOB_STATES.RUNNING) return;
          await run({ signal: record.controller.signal, emit: emitFor(record) });
          terminate(record, JOB_STATES.COMPLETE);
        } catch {
          // No automatic retry: a failed generation stays failed, and the
          // reader keeps the listing it already received.
          terminate(record, JOB_STATES.FAILED);
        } finally {
          markSettled(record);
        }
      })
      .catch(() => {
        // markSettled itself must never surface as an unhandled rejection.
        try {
          markSettled(record);
        } catch {
          // Ignored: the job is already terminal either way.
        }
      });
    tracked = pending.finally(() => {
      pendingRuns.delete(tracked);
    });
    pendingRuns.add(tracked);
  }

  function createTombstone({ id, keyHash, clientFingerprint }) {
    // The derived allowance is checked first and answers with a refusal. It is
    // what stops cancel traffic from competing for the record space that real
    // reads need, and it is spent per client as well as in total.
    if (reservations.size >= reservationAllowance) return false;
    let clientReservations = 0;
    for (const reservation of reservations) {
      if (reservation.clientFingerprint === clientFingerprint) clientReservations += 1;
    }
    if (clientReservations >= limits.unknownCancelReservationsPerClient) return false;
    const current = now();
    if (!makeRoom()) return false;
    if (totalBytesUsed + RECORD_OVERHEAD_BYTES > limits.totalBytes) return false;
    const tombstone = {
      id,
      keyHash,
      fingerprint: null,
      kind: null,
      clientFingerprint,
      reservation: true,
      state: JOB_STATES.CANCELLED,
      createdAt: current,
      deadlineAt: null,
      terminalAt: current,
      payloadExpiresAt: null,
      expiresAt: current + limits.tombstoneMs,
      abandonAt: null,
      abandoned: false,
      settled: true,
      events: [],
      nextSeq: 1,
      eventBytes: 0,
      bytes: RECORD_OVERHEAD_BYTES,
      controller: null,
    };
    records.set(id, tombstone);
    reservations.add(tombstone);
    totalBytesUsed += RECORD_OVERHEAD_BYTES;
    return true;
  }

  function start(job = {}) {
    if (closed) return CLOSED();
    const { id, key, kind, payload, clientKey, run } = job ?? {};
    if (typeof id !== "string" || !JOB_BOUNDS.idPattern.test(id)) return INVALID();
    if (typeof key !== "string" || !JOB_BOUNDS.keyPattern.test(key)) return INVALID();
    if (typeof kind !== "string" || !JOB_KINDS.has(kind)) return INVALID();
    if (typeof clientKey !== "string" || clientKey.length === 0) return INVALID();
    if (typeof run !== "function") return INVALID();
    let canonical;
    try {
      canonical = canonicalJson(payload);
    } catch {
      return INVALID();
    }
    if (canonical === undefined || Buffer.byteLength(canonical, "utf8") > limits.payloadBytes) return INVALID();
    const keyHash = secretDigest(key);
    const fingerprint = createHash("sha256").update(`${kind}\u0000${canonical}`, "utf8").digest("hex");

    const existing = records.get(id);
    let replaceableTombstone = null;
    if (existing) {
      if (sameSecret(existing.keyHash, keyHash)) {
        // The owner of this identifier: an identical request replays the job and
        // a different one is a conflict. A tombstone installed by a cancel that
        // arrived before its create has no payload to compare, so it answers
        // every request from the same secret as cancelled and no work is ever
        // started for it.
        if (existing.fingerprint !== null && existing.fingerprint !== fingerprint) return CONFLICT();
        return response(200, bodyFor(existing, 0));
      }
      // A wrong key must stay indistinguishable from an unknown job for a job
      // that exists. A cancellation, though, is not a claim of ownership over a
      // secret the caller does not hold: it only records that somebody asked to
      // cancel an identifier before it existed. A create holding its own secret
      // is therefore a normal new job. The tombstone is replaced only once that
      // job is actually admitted, so a refused admission can never cancel an
      // owner's pending create.
      if (existing.fingerprint !== null) return NOT_FOUND();
      replaceableTombstone = existing;
    }

    const clientFingerprint = secretDigest(clientKey).toString("hex");
    if (held.size >= limits.liveJobs) return CAPACITY();
    let clientJobs = 0;
    for (const record of held) {
      if (record.clientFingerprint === clientFingerprint) clientJobs += 1;
    }
    if (clientJobs >= limits.liveJobsPerClient) return CAPACITY();
    // A replacement takes the tombstone's own record slot, so it never needs
    // room made for it.
    if (!replaceableTombstone && !makeRoom()) return CAPACITY();
    const requiredBytes = RECORD_OVERHEAD_BYTES - (replaceableTombstone ? replaceableTombstone.bytes : 0);
    if (totalBytesUsed + requiredBytes > limits.totalBytes) return CAPACITY();

    const current = now();
    const record = {
      id,
      keyHash,
      fingerprint,
      kind,
      clientFingerprint,
      state: JOB_STATES.RUNNING,
      createdAt: current,
      deadlineAt: current + limits.hardDeadlineMs,
      terminalAt: null,
      payloadExpiresAt: null,
      expiresAt: null,
      abandonAt: null,
      abandoned: false,
      settled: false,
      events: [],
      nextSeq: 1,
      eventBytes: 0,
      bytes: RECORD_OVERHEAD_BYTES,
      controller: new AbortController(),
    };
    if (replaceableTombstone) remove(replaceableTombstone);
    records.set(id, record);
    totalBytesUsed += RECORD_OVERHEAD_BYTES;
    charge(record);
    schedule(record, run);
    return response(201, bodyFor(record, 0));
  }

  function poll(job = {}) {
    if (closed) return CLOSED();
    const { id, key, after } = job ?? {};
    if (typeof id !== "string" || !JOB_BOUNDS.idPattern.test(id)) return INVALID();
    if (typeof key !== "string" || !JOB_BOUNDS.keyPattern.test(key)) return INVALID();
    const record = records.get(id);
    if (!record) return NOT_FOUND();
    if (!sameSecret(record.keyHash, secretDigest(key))) return NOT_FOUND();
    // An unreadable cursor replays from the beginning; the reader dedupes on the
    // monotonic sequence number, so a lost cursor costs bandwidth, never events.
    const parsed = Number(after);
    const cursor = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
    return response(200, bodyFor(record, cursor));
  }

  function cancel(job = {}) {
    if (closed) return CLOSED();
    const { id, key, clientKey } = job ?? {};
    if (typeof id !== "string" || !JOB_BOUNDS.idPattern.test(id)) return INVALID();
    if (typeof key !== "string" || !JOB_BOUNDS.keyPattern.test(key)) return INVALID();
    // The cancel reservation budget is only meaningful per client, so the
    // identity has to be server derived. A cancel without one is refused rather
    // than spending an unattributable slot.
    if (typeof clientKey !== "string" || clientKey.length === 0) return INVALID();
    const keyHash = secretDigest(key);
    const record = records.get(id);
    if (record) {
      if (!sameSecret(record.keyHash, keyHash)) return NOT_FOUND();
      terminate(record, JOB_STATES.CANCELLED);
      return response(200, bodyFor(record, 0));
    }
    // Cancelling an identifier the store has never seen is the normal result of
    // a reader navigating away while its create is still in flight. The
    // tombstone makes sure that in-flight create cannot start generation when it
    // finally arrives, so a 200 is only sent when the tombstone really exists:
    // acknowledging a cancellation the store could not keep would promise a
    // protection that is not there.
    if (!createTombstone({
      id,
      keyHash,
      clientFingerprint: secretDigest(clientKey).toString("hex"),
    })) return CAPACITY();
    return response(200, {
      job_id: id,
      state: JOB_STATES.CANCELLED,
      deadline_at: null,
      retry_after_ms: 0,
      events: [],
    });
  }

  function stats() {
    let running = 0;
    let events = 0;
    let eventBytes = 0;
    for (const record of records.values()) {
      if (record.state === JOB_STATES.RUNNING) running += 1;
      events += record.events.length;
      eventBytes += record.eventBytes;
    }
    // A record dropped from the map can still be reachable through a live
    // runner's emit closure, so its retained answer text is reported too. This
    // is what makes "the payload is gone" observable after shutdown.
    for (const record of held) {
      if (records.get(record.id) === record) continue;
      events += record.events.length;
      eventBytes += record.eventBytes;
    }
    let heldTerminal = 0;
    let abandoned = 0;
    for (const record of held) {
      if (record.state !== JOB_STATES.RUNNING) heldTerminal += 1;
      if (record.abandoned === true) abandoned += 1;
    }
    return {
      closed,
      running,
      held: heldTerminal,
      charged: held.size,
      abandoned,
      reservations: reservations.size,
      records: records.size,
      events,
      eventBytes,
      totalBytes: totalBytesUsed,
      pendingRuns: pendingRuns.size,
    };
  }

  async function close() {
    if (closePromise) return closePromise;
    closed = true;
    stopInterval(sweeper);
    const current = now();
    for (const record of records.values()) {
      if (record.state === JOB_STATES.RUNNING) {
        record.state = JOB_STATES.CANCELLED;
        record.terminalAt = current;
      }
      try {
        record.controller?.abort?.(jobError("JOB_CLOSED", "Server sulgus."));
      } catch {
        // Ignored: shutdown must continue past a broken abort listener.
      }
    }
    // Shutdown drains instead of leaking: the process waits for the runners it
    // aborted, but only for a bounded grace period. This timer is intentionally
    // not unref'd: the wait is bounded and the caller is awaiting it.
    const drained = Promise.allSettled([...pendingRuns]);
    let timer = null;
    const grace = new Promise((resolve) => {
      timer = setTimer(resolve, limits.closeGraceMs);
    });
    closePromise = Promise.race([drained, grace])
      .catch(() => undefined)
      .then(() => {
        if (timer !== null) clearTimer(timer);
        for (const record of [...records.values()]) {
          // The answer text must not outlive the job: a runner that is still
          // alive keeps its own record reachable through the emit closure.
          dropEvents(record);
          records.delete(record.id);
        }
        totalBytesUsed = 0;
        // Every tombstone is gone with the records, so their reservations are
        // returned; there is nothing left to cancel after shutdown.
        reservations.clear();
        // A runner that ignored its abort is still unsettled, so its held entry
        // and its pending promise stay on the books: charged, held and
        // pendingRuns describe what is really still running, not what shutdown
        // wishes were over. Neither set can grow after close, because admission
        // is closed, and each entry removes itself when its runner settles.
      });
    return closePromise;
  }

  const sweeper = startInterval(sweep, limits.sweepMs);
  sweeper?.unref?.();

  return { start, poll, cancel, close, stats };
}
