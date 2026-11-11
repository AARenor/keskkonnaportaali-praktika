// The transport-free half of an asynchronous search job.
//
// A job outlives the HTTP exchange that created it, so this module owns only
// the order of a detached run: take one admission slot, publish the ordinary
// listing, run the answer on its own clock, and keep the run open until every
// detached background cleanup has actually settled. Retrieval, synthesis,
// publication and the shared stream flow are injected by the caller, so the
// contract can be exercised without a database, a model or a socket.
//
// This module never reaches the network and never touches an Express request.

import {
  ANSWER_SOURCE_EXPIRY,
  publicationCopyExpiry,
  withholdPublicationCopy,
} from "./pipeline.mjs";

// A public event that carried permitted copied text can be replayed after the
// publisher's copy window closed. The one bound per event is the earliest
// window among the sources that event shows; the replacement is links only, so
// nothing derived from an expiring source can be served again. Both travel to
// the store as its own arguments, never inside the payload, and the internal
// symbol that carries the bound is stripped before emit.

function withoutExpirySymbol(value) {
  if (!value || typeof value !== "object") return value;
  const { [ANSWER_SOURCE_EXPIRY]: _bound, ...rest } = value;
  return rest;
}

function earliestBound(...candidates) {
  let earliest = null;
  for (const candidate of candidates) {
    // `Number(null)` is 0, so a missing bound would otherwise become epoch zero
    // and replace every event with its fallback on the first read.
    if (candidate === null || candidate === undefined) continue;
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed)) continue;
    earliest = earliest === null ? parsed : Math.min(earliest, parsed);
  }
  return earliest;
}

function linksOnlyListing(listing) {
  if (!listing || typeof listing !== "object") return listing;
  const items = Array.isArray(listing.items) ? listing.items : [];
  return {
    ...listing,
    items: items.map((item) => (item && typeof item === "object" && item.summary === undefined
      ? item
      : { ...item, summary: "" })),
  };
}

// The bound of an event is the earliest window among everything it shows:
// 1. the raw listing items, which are the only place the publisher decision
//    still exists once the public listing has dropped it, and
// 2. the card the answer stage produced, which reports its own private bound
//    through the internal symbol and may cite sources the listing never had.
function eventExpiryBound({ payload, rawListing }) {
  const card = payload?.result ?? null;
  const rawItems = Array.isArray(rawListing?.items) ? rawListing.items : [];
  return earliestBound(
    card ? publicationCopyExpiry(card) : null,
    rawItems.length ? publicationCopyExpiry({ sources: rawItems }) : null,
  );
}

// The replacement keeps the original envelope: a key that was absent stays
// absent, and a listing nested inside the card is replaced in place. Adding a
// top-level listing where the payload never had one would change the wire shape,
// and leaving the nested copy alone would reopen the expired summary.
function eventFallback(payload) {
  const card = payload?.result ?? null;
  const topListing = payload?.searchResults ?? null;
  return {
    ...payload,
    // The card, including any listing it carries, is reprojected by the module
    // that owns the copy policy: it builds from an allowlist, so a body, a
    // witness or a digest cannot survive in it.
    ...(card ? { result: withholdPublicationCopy(card) } : {}),
    // The top level listing was already published through the public projection,
    // so it holds nothing a reader may not see; only its excerpts are withheld,
    // and its envelope stays so pagination keeps working.
    ...(topListing ? { searchResults: linksOnlyListing(topListing) } : {}),
  };
}

function expiryOptionsFor({ payload, rawListing }) {
  const bound = eventExpiryBound({ payload, rawListing });
  if (!Number.isFinite(bound)) return undefined;
  // Both or neither: a window the reader cannot be protected from is worse than
  // no window at all, so the replacement is built with the bound.
  return { expiresAt: bound, fallback: eventFallback(payload) };
}

/**
 * Build the `run({ signal, emit })` function a job store schedules once.
 *
 * Everything that can fail, block or cost money is a parameter. Budgets, the
 * publication shape and the fallback card all come from the caller.
 */
export function createSearchJobRun({
  kind,
  scope,
  clientKey,
  acquireSlot,
  listing,
  answerSearch,
  answerFollowUp,
  fallbackAnswer,
  blockedPayload,
  publishListing,
  emptyListing,
  flow,
  now = Date.now,
  listingDeadline,
  listingWindow,
  answerDeadline,
  transportReserveMs = 0,
} = {}) {
  const { filters } = scope;
  return async function run({ signal, emit }) {
    const startedAt = now();
    const deadlineAt = listingDeadline(startedAt);
    if (scope.blockedAssessment) {
      // Exactly the safe pair the streaming routes send, and nothing ran.
      const payload = blockedPayload(scope);
      emit("results", { searchResults: payload.searchResults });
      emit("answer", { result: payload });
      return;
    }

    let release = () => undefined;
    let admissionReleased = false;
    const releaseAdmission = () => {
      if (admissionReleased) return;
      admissionReleased = true;
      const current = release;
      release = () => undefined;
      current();
    };
    // A bounded answer may detach a database or provider call it can no longer
    // wait for. The reader gets the listing, the draft and the answer as soon as
    // each exists, but the job's own slot stays held until that detached work
    // has settled, so a burst of timed-out jobs cannot hide unbounded work
    // behind an already finished answer. A cancellation does not shortcut this
    // either: the slot is released only when the work it aborted has drained.
    // The job deadline is not a release path: it aborts the run and marks the
    // job terminal, while the registry accounting follows the runner promise,
    // which resolves only on real settlement or at process shutdown.
    let rawListing = null;
    const pendingCleanups = new Set();
    const trackCleanup = (operation) => {
      if (!operation) return Promise.resolve();
      const cleanup = Promise.resolve(operation).then(() => undefined, () => undefined);
      pendingCleanups.add(cleanup);
      cleanup.then(() => {
        pendingCleanups.delete(cleanup);
      });
      return cleanup;
    };
    try {
      release = await acquireSlot(clientKey, {
        signal,
        maximumWaitMs: Math.max(0, deadlineAt - now() - transportReserveMs),
      });
      // Every event the job publishes goes through one door, so a draft cannot
      // be the one event that reaches the reader without a bound and a
      // replacement. The bound is read before the symbol is stripped and then
      // travels only as the store's own argument.
      const emitEvent = (type, payload) => {
        const options = expiryOptionsFor({ payload, rawListing });
        const clean = payload?.result
          ? { ...payload, result: withoutExpirySymbol(payload.result) }
          : payload;
        emit(type, clean, options);
      };
      await flow({
        stream: {
          write: async (type, payload) => {
            emitEvent(type, payload);
          },
        },
        heartbeatMs: 0,
        answerStartBy: now() + listingWindow({ remainingMs: deadlineAt - now() }),
        isAborted: () => signal.aborted,
        onListingSettled: releaseAdmission,
        publicListing: publishListing,
        emptyListing: () => emptyListing(scope),
        listing: async () => {
          // Kept for the expiry bound: the published listing has no policy left,
          // and the raw items are the only place the windows still exist.
          rawListing = await listing({
            page: scope.page,
            pageSize: scope.pageSize,
            filters,
            deadlineAt,
            signal,
          });
          return rawListing;
        },
        answer: (searchResults) => {
          const shared = {
            signal,
            startedAt,
            deadlineAt: answerDeadline(now()),
            searchResults,
            llmClientKey: clientKey,
            onBackgroundCleanup: trackCleanup,
          };
          if (kind === "follow-up") return answerFollowUp(shared);
          // The grounded draft is published as its own event the moment it
          // exists, so a slow or failing model cannot withdraw what the reader
          // already has. It is never wrapped as a final answer, and its listing
          // is projected at that moment, not when the answer started: a
          // publisher's copied-text window can close in between.
          return answerSearch({
            ...shared,
            onDraft: (draft) => emitEvent("draft", {
              result: { ...draft, searchResults: publishListing(searchResults) },
            }),
          });
        },
        fallbackAnswer,
      });
    } finally {
      releaseAdmission();
      // The run must not settle, and the registry must not free the slot, before
      // every detached cleanup has settled. The loop, not a single snapshot,
      // because a cleanup may hand on further work.
      while (pendingCleanups.size) {
        await Promise.allSettled([...pendingCleanups]);
      }
    }
  };
}
