import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, MessageCircle, Search, Sparkles, X } from "lucide-react";
import AnswerChart, { chartSourceDiffers } from "./AnswerChart.jsx";
import { noteServerBuild } from "./app-build.js";
import { DEFAULT_SEARCH_FILTERS, followUpAnswerPayload, followUpRequestPayload, hasNoModelWording, searchRequestPayload } from "./search_request.js";
import { REVIEWED_FORESTRY_SEARCH_SUGGESTIONS } from "./search-suggestions.js";
import { contextualSuggestions } from "./suggestion_context.js";
import { searchWaitingMessage } from "./search-stream.js";
import { readSearchJob } from "./search_jobs.js";

// Same bound as the inline follow-ups on the search page, so one conversation
// limit holds for both entry points.
const MAX_FOLLOW_UPS = 4;
const FOLLOW_UP_LIMIT_HINT = `Jätkuküsimusi saab esitada ${MAX_FOLLOW_UPS}. Alusta uut vestlust, et teemat jätkata.`;
const QUESTION_HINT = "Vastan eesti keeles Eesti metsaandmete küsimustele. Kui allikad leitakse, lisan neile viited.";

// The question fields the page itself owns. The launcher floats above the
// page, so it has to know when one of them reaches its corner: at phone widths
// the answer follow-up row and its send button land exactly there.
const PAGE_COMPOSERS = ".search-form, .followup-form";
const LAUNCHER_CLEARANCE = 8;

function cleanQuestion(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

// Citations after a sentence come from the search page's own Citation chip, so
// an inline numbered link opens the same cited source in the same tab behaviour.
function CitedText({ text, citations = [], sources, Citation }) {
  return (
    <>
      {text}{citations.length ? " " : null}
      {citations.map((citation) => <Citation key={citation} number={citation} sources={sources} />)}
    </>
  );
}

// One conversation turn renders the same server result the search page renders:
// the same citation chips, chart, source legend, actions, note and clarification.
// The parts come from App, which owns them, so the two renderings stay one.
function ChatAnswer({ result, onAsk, busy, atFollowUpLimit, parts, related = [] }) {
  const { AnswerNote, Citation, SourceActions, SourceLegend } = parts;
  const answer = result?.answer;
  const sources = Array.isArray(result?.sources) ? result.sources : [];
  if (!answer) {
    return (
      <p className="chatbot__no-answer">
        Sellele küsimusele ei saanud vastust koostada. Proovi sama küsimust uuesti või sõnasta see teisiti.
      </p>
    );
  }
  return (
    <>
      <p className="chatbot__answer-label"><Sparkles aria-hidden="true" size={15} />{answer.eyebrow || "AI koondvastus"}</p>
      <h3 className="chatbot__answer-title">{answer.title}</h3>
      <p className="answer-intro"><CitedText Citation={Citation} citations={answer.introCitations} sources={sources} text={answer.intro} /></p>
      {result.chart ? (
        <AnswerChart
          chart={result.chart}
          citation={<Citation number={result.chart.citation} sources={sources} />}
          sourceDiffers={chartSourceDiffers(answer, result.chart, sources)}
          key={`${result.chart.title}-${result.chart.series.map((series) => series.id).join("|")}`}
        />
      ) : null}
      {answer.parts?.length ? (
        <div className="answer-parts">
          {answer.parts.map((part, index) => (
            <section key={index}>
              {part.title ? <h4 className="chatbot__part-title">{part.title}</h4> : null}
              <p><CitedText Citation={Citation} citations={part.citations} sources={sources} text={part.text} /></p>
            </section>
          ))}
        </div>
      ) : null}
      <SourceActions sources={sources} />
      <SourceLegend sources={sources} answer={answer} chart={result.chart} />
      <AnswerNote note={answer.note} />
      {result.clarification ? (
        <div className="answer-clarification">
          <strong>Täpsusta soovi korral</strong>
          <p>{result.clarification}</p>
        </div>
      ) : null}
      {related.length ? (
        <div className="chatbot__related" role="group" aria-label="Soovitatud jätkuküsimused">
          {related.map((question) => (
            <button disabled={busy || atFollowUpLimit} key={question} onClick={() => onAsk(question)} type="button">
              {question}<ArrowRight aria-hidden="true" size={14} />
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

// Ordinary search results inside the panel. The listing is the product the
// reader came for, so it is shown while the answer is pending and it stays if
// the answer never arrives. Links use the page's own safe anchor.
function ChatListing({ listing, ExternalAnchor }) {
  const items = Array.isArray(listing?.items) ? listing.items.slice(0, 5) : [];
  if (!items.length) return null;
  const Link = typeof ExternalAnchor === "function" ? ExternalAnchor : "a";
  const total = Number(listing.total || items.length);
  const more = Number.isFinite(total) && total > items.length;
  return (
    <div className="chatbot__results">
      <p className="chatbot__answer-label">
        <Search aria-hidden="true" size={15} />Leitud allikad{more ? ` (${items.length}/${total.toLocaleString("et-EE")})` : ""}
      </p>
      <ul aria-label="Leitud allikad" className="chatbot__sources">
        {items.map((item) => (
          <li key={item.id || item.url}><Link href={item.url}>{item.title || item.url}</Link></li>
        ))}
      </ul>
    </div>
  );
}

export default function Chatbot({ answerParts, answerTextOf, pageContext = null }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [pendingMs, setPendingMs] = useState(0);
  const [searchFieldFocused, setSearchFieldFocused] = useState(false);
  const requestRef = useRef({ id: 0, controller: null });
  const launcherRef = useRef(null);
  const launcherLiftRef = useRef(0);
  const launcherNodeRef = useRef(null);
  const remeasureLauncherRef = useRef(null);
  const inputRef = useRef(null);
  const closeRef = useRef(null);
  const bodyRef = useRef(null);
  const restoreFocusRef = useRef(false);
  const busy = Boolean(pending);
  const followUpCount = Math.max(0, turns.length - 1);
  const atFollowUpLimit = followUpCount >= MAX_FOLLOW_UPS;
  const pageQuestion = cleanQuestion(pageContext?.query);
  const threadQuestions = turns.map((turn) => turn.question);
  const rootQuestion = threadQuestions[0] || "";
  // The panel answers forestry questions, so its starting points come from the
  // reviewed forestry list only. The question already on the page decides which
  // of them fit; when none of them does the group shows fewer or disappears
  // rather than offering a question this assistant cannot answer.
  const exampleQuestions = contextualSuggestions({
    candidates: REVIEWED_FORESTRY_SEARCH_SUGGESTIONS,
    query: pageQuestion,
    rootQuery: pageQuestion,
    filters: pageContext?.filters,
    limit: 3,
    allowDefault: !pageQuestion,
  });
  // Chips belong to one thread: an answer is ranked for its own question and
  // the thread's root, so a follow-up made only of pronouns keeps the topic the
  // reader started with, and a question already asked is never offered twice.
  const suggestionsForTurn = (turn) => contextualSuggestions({
    candidates: Array.isArray(turn.result?.related) ? turn.result.related : [],
    query: turn.question,
    rootQuery: rootQuestion,
    priorQuestions: threadQuestions,
    limit: 3,
    allowDefault: false,
  });

  const cancelRequest = () => {
    requestRef.current.controller?.abort();
    requestRef.current = { id: requestRef.current.id + 1, controller: null };
  };

  const beginRequest = () => {
    requestRef.current.controller?.abort();
    const id = requestRef.current.id + 1;
    const controller = new AbortController();
    requestRef.current = { id, controller };
    return { id, controller };
  };

  const finishRequest = (id) => {
    if (requestRef.current.id !== id) return;
    requestRef.current = { id, controller: null };
    setPending(null);
  };

  const focusInput = () => {
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  const askFirstQuestion = async (question) => {
    const { id, controller } = beginRequest();
    setPending({ kind: "first", question, listing: null });
    setError(null);
    setNotice("");
    setDraft("");
    let latestResult = null;
    let latestListing = null;
    try {
      // An asynchronous job, not one long response: the panel rejoins the same
      // search after a flaky network and a slow model no longer ends the
      // question.
      await readSearchJob({
        kind: "search",
        payload: searchRequestPayload(question, DEFAULT_SEARCH_FILTERS),
        signal: controller.signal,
        onResponse: (response) => noteServerBuild(response),
        onEvent: (event) => {
          if (requestRef.current.id !== id) return;
          if (event.type === "results") {
            latestListing = event.searchResults || null;
            // Keep the ordinary results, not a boolean: they must outlive a slow
            // or failed answer and they are what the reader can act on.
            setPending((current) => (current ? { ...current, listing: latestListing } : current));
            return;
          }
          latestResult = event.result;
        },
      });
      if (requestRef.current.id !== id) return;
      if (!latestResult) throw new Error("Otsing ei tagastanud vastust. Proovi uuesti.");
      setTurns((current) => [...current, { question, result: latestResult, listing: latestListing }]);
    } catch (searchError) {
      if (searchError.name === "AbortError" || requestRef.current.id !== id) return;
      if (latestResult) {
        // The job failed after a checked result arrived: keep that result and
        // say so, instead of inventing an answer or dropping what was verified.
        setTurns((current) => [...current, { question, result: latestResult, listing: latestListing }]);
        setNotice("Vastuse voog katkes. Kuvan viimase kontrollitud vaheseisu.");
      } else if (latestListing?.items?.length) {
        // Retrieval already succeeded. A model failure cannot withdraw the
        // ordinary results, so the turn keeps them and the panel says why the
        // answer card is missing.
        setTurns((current) => [...current, { question, result: null, listing: latestListing }]);
        setNotice("Koondvastust ei saanud koostada. Leitud allikad on loetletud.");
      } else {
        setError({ question, message: searchError.message || "Serveriga ei saanud ühendust." });
        setDraft(question);
        focusInput();
      }
    } finally {
      finishRequest(id);
    }
  };

  const askFollowUp = async (question) => {
    const rootTurn = turns[0];
    if (!rootTurn) return;
    const { id, controller } = beginRequest();
    setPending({ kind: "follow-up", question, listing: null });
    setError(null);
    setNotice("");
    setDraft("");
    let latestResult = null;
    let latestListing = null;
    try {
      // Follow-ups are asynchronous jobs as well, so this question's own
      // listing is visible before the answer and the answer survives a dropped
      // poll. Previous answers travel as comparison context only.
      await readSearchJob({
        kind: "follow-up",
        payload: followUpRequestPayload({
          rootQuery: rootTurn.result?.query || rootTurn.question,
          question,
          previousQuestions: turns.slice(1).map((turn) => turn.question),
          previousAnswers: turns.map((turn) => answerTextOf(turn.result)).filter(Boolean),
          filters: DEFAULT_SEARCH_FILTERS,
        }),
        signal: controller.signal,
        onResponse: (response) => noteServerBuild(response),
        onEvent: (event) => {
          if (requestRef.current.id !== id) return;
          if (event.type === "results") {
            latestListing = event.searchResults || null;
            setPending((current) => (current ? { ...current, listing: latestListing } : current));
            return;
          }
          latestResult = event.result;
        },
      });
      if (requestRef.current.id !== id) return;
      if (!latestResult) throw new Error("Jätkuküsimusele ei saanud vastata.");
      const answer = followUpAnswerPayload(latestResult);
      setTurns((current) => [...current, { question, result: answer, listing: latestListing }]);
    } catch (followUpError) {
      if (followUpError.name === "AbortError" || requestRef.current.id !== id) return;
      if (latestListing?.items?.length) {
        setTurns((current) => [...current, { question, result: null, listing: latestListing }]);
        setNotice("Jätkuküsimuse koondvastust ei saanud koostada. Leitud allikad on loetletud.");
      } else {
        setError({ question, message: followUpError.message || "Jätkuküsimusele ei saanud vastata." });
        setDraft(question);
        focusInput();
      }
    } finally {
      finishRequest(id);
    }
  };

  const ask = (value) => {
    const question = cleanQuestion(value);
    if (!question || busy) return;
    if (!turns.length) askFirstQuestion(question);
    else if (!atFollowUpLimit) askFollowUp(question);
  };

  const resetConversation = () => {
    cancelRequest();
    setTurns([]);
    setPending(null);
    setError(null);
    setNotice("");
    setDraft("");
    focusInput();
  };

  const openPanel = () => {
    restoreFocusRef.current = false;
    setOpen(true);
  };

  const closePanel = useCallback(() => {
    restoreFocusRef.current = true;
    setOpen(false);
  }, []);

  useEffect(() => () => requestRef.current.controller?.abort(), []);

  // Elapsed time for the slow-wait copy. Keyed to the question, not to the
  // pending object, so a listing update does not restart the count.
  useEffect(() => {
    if (!pending) {
      setPendingMs(0);
      return undefined;
    }
    const startedAt = Date.now();
    setPendingMs(0);
    const timer = window.setInterval(() => setPendingMs(Date.now() - startedAt), 5_000);
    return () => window.clearInterval(timer);
  }, [pending?.kind, pending?.question]);

  useEffect(() => {
    if (open) {
      const frame = window.requestAnimationFrame(() => {
        const target = inputRef.current && !inputRef.current.disabled ? inputRef.current : closeRef.current;
        target?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (!restoreFocusRef.current) return undefined;
    restoreFocusRef.current = false;
    const frame = window.requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Escape closes the panel from anywhere on the page (it is nonmodal, so focus
  // can be outside it) and the launcher takes focus back.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closePanel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closePanel]);

  // The page search owns the viewport while someone types in it: its suggestion
  // list reaches the bottom edge of a phone screen, so the launcher steps aside
  // instead of covering the list.
  useEffect(() => {
    const syncSearchFocus = () => {
      const active = document.activeElement;
      setSearchFieldFocused(Boolean(active && typeof active.closest === "function" && active.closest(".search-form")));
    };
    document.addEventListener("focusin", syncSearchFocus);
    document.addEventListener("focusout", syncSearchFocus);
    return () => {
      document.removeEventListener("focusin", syncSearchFocus);
      document.removeEventListener("focusout", syncSearchFocus);
    };
  }, []);

  // A page question field that reaches the launcher's corner is lifted over
  // instead of covered: the launcher rises above the field and its send button,
  // stays clickable itself, and drops back to the corner once the field scrolls
  // clear. The lift is measured from page geometry rather than from the
  // launcher's own offset, so every width from 320 px up behaves the same.
  //
  // The value goes straight onto the element as a custom property, inside the
  // frame that measured it: a field that scrolls into this corner has to be
  // clear on that same paint, and a React state round trip needs one more frame,
  // which is one painted frame of the launcher sitting on the send button. The
  // listeners are attached once; a render only asks for a new measurement,
  // because a streamed answer can add or grow the field without a scroll.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const launcher = launcherRef.current;
      // A button that has just mounted carries no lift, so its rect is the
      // resting slot; a value left over from the previous node would offset it.
      if (launcher !== launcherNodeRef.current) {
        launcherNodeRef.current = launcher;
        launcherLiftRef.current = 0;
      }
      if (!launcher) return;
      const rect = launcher.getBoundingClientRect();
      // The rect already carries the current lift, so the resting slot is the
      // rect with that lift added back; the same anchor is used every time.
      const slotTop = rect.top + launcherLiftRef.current;
      const slotBottom = rect.bottom + launcherLiftRef.current;
      let lift = 0;
      document.querySelectorAll(PAGE_COMPOSERS).forEach((composer) => {
        const box = composer.getBoundingClientRect();
        // Vertical overlap alone is not enough: on a wide screen the answer
        // column ends far left of this corner, so only a field that also
        // reaches the launcher counts.
        if (box.height < 1 || box.right <= rect.left) return;
        if (box.bottom <= slotTop || box.top >= slotBottom) return;
        lift = Math.max(lift, slotBottom - box.top + LAUNCHER_CLEARANCE);
      });
      // A field taller than the screen would push the button off the top; no
      // page field is that tall, so the limit is a guard, not a layout decision.
      const limit = Math.max(0, window.innerHeight - rect.height - LAUNCHER_CLEARANCE * 2);
      const next = Math.round(Math.min(lift, limit));
      if (next === launcherLiftRef.current) return;
      launcherLiftRef.current = next;
      launcher.style.setProperty("--chatbot-launcher-lift", `${next}px`);
    };
    const onFrame = () => {
      frame = 0;
      measure();
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(onFrame);
    };
    remeasureLauncherRef.current = schedule;
    // Measure before this frame paints, so a launcher that mounts while a field
    // is already in the corner never paints on top of it.
    measure();
    // Scroll and resize measure straight away rather than through a frame: the
    // write has to belong to the frame the field reached this corner in, so a
    // reader or a test that looks at the layout right after the scroll sees the
    // lifted button and not the covering one. A transform changes no layout, so
    // this cannot start a scroll loop.
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      remeasureLauncherRef.current = null;
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, []);

  // The measurement needs a rerun after a render, so the effect above stays
  // attached once and this one only asks for it: no listener churn per render.
  useEffect(() => {
    remeasureLauncherRef.current?.();
  });

  // Scroll only the panel, never the page: a fixed panel that drags the document
  // would move the reader's search view.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !open) return;
    body.scrollTop = body.scrollHeight;
  }, [open, turns.length, pending, error, notice]);

  const status = pending
    ? searchWaitingMessage({
      elapsedMs: pendingMs,
      listingReady: Boolean(pending.listing?.items?.length),
      followUp: pending.kind === "follow-up",
    })
    : !error && turns.length ? "Vastus on valmis." : "";

  return (
    <div className="chatbot">
      <p aria-atomic="true" aria-live="polite" className="sr-only">{status}</p>
      {open ? (
        <div aria-busy={busy} aria-labelledby="chatbot-title" className="chatbot__panel" id="chatbot-panel" role="dialog">
          <div className="chatbot__head">
            <h2 id="chatbot-title">Küsi metsaandmete kohta</h2>
            <div className="chatbot__head-actions">
              {turns.length || pending || error ? (
                <button className="chatbot__reset" onClick={resetConversation} type="button">Uus vestlus</button>
              ) : null}
              <button aria-label="Sulge vestlus" className="chatbot__close" onClick={closePanel} ref={closeRef} type="button">
                <X aria-hidden="true" size={18} />
              </button>
            </div>
          </div>
          <div className="chatbot__body" ref={bodyRef}>
            {!turns.length && !pending && !error ? (
              <div className="chatbot__empty">
                <p>Küsi metsaandmete kohta. Vastus põhineb samadel kontrollitud allikatel kui portaali otsing.</p>
                <p className="chatbot__empty-note">Vastan praegu ainult Eesti metsaandmete küsimustele ja eesti keeles.</p>
                {exampleQuestions.length ? (
                  <div className="chatbot__examples" role="group" aria-label="Näidisküsimused">
                    {exampleQuestions.map((question) => (
                      <button key={question} onClick={() => ask(question)} type="button">{question}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {turns.map((turn, index) => (
              <section className="chatbot__turn" key={`${turn.question}-${index}`}>
                <div className="chatbot__question"><span>Teie</span><p>{turn.question}</p></div>
                {hasNoModelWording(turn.result?.answer) && turn.listing?.items?.length ? (
                  <ChatListing ExternalAnchor={answerParts.ExternalAnchor} listing={turn.listing} />
                ) : null}
                <div className="chatbot__answer">
                  <ChatAnswer busy={busy} atFollowUpLimit={atFollowUpLimit} onAsk={ask} parts={answerParts} related={suggestionsForTurn(turn)} result={turn.result} />
                </div>
              </section>
            ))}
            {pending ? (
              <section aria-busy="true" className="chatbot__turn chatbot__turn--pending">
                <div className="chatbot__question"><span>Teie</span><p>{pending.question}</p></div>
                {pending.listing?.items?.length ? (
                  <ChatListing ExternalAnchor={answerParts.ExternalAnchor} listing={pending.listing} />
                ) : (
                  <div aria-hidden="true" className="chatbot__answer chatbot__answer--skeleton">
                    <i className="skeleton-line skeleton-line--medium" />
                    <i className="skeleton-line skeleton-line--wide" />
                    <i className="skeleton-line skeleton-line--short" />
                  </div>
                )}
                <p aria-hidden="true" className="chatbot__pending-status"><LoaderCircle aria-hidden="true" className="spin" size={15} />{status}</p>
              </section>
            ) : null}
            {error ? (
              <div className="chatbot__error" role="alert">
                <strong>Vastust ei saanud koostada</strong>
                <p>{error.message}</p>
                <button disabled={busy} onClick={() => ask(error.question)} type="button">Proovi uuesti</button>
              </div>
            ) : null}
            {notice ? <p className="chatbot__notice" role="status">{notice}</p> : null}
          </div>
          <form
            className="chatbot__form"
            onSubmit={(event) => {
              event.preventDefault();
              ask(draft);
            }}
          >
            <label htmlFor="chatbot-input">Sinu küsimus</label>
            <div className="chatbot__input-row">
              <input
                aria-describedby="chatbot-hint"
                autoComplete="off"
                disabled={busy || atFollowUpLimit}
                id="chatbot-input"
                maxLength={180}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={atFollowUpLimit ? "Alusta uut vestlust" : "Küsi metsaandmete kohta"}
                ref={inputRef}
                type="text"
                value={draft}
              />
              <button aria-label="Saada küsimus" disabled={busy || atFollowUpLimit || !draft.trim()} type="submit">
                {busy ? <LoaderCircle aria-hidden="true" className="spin" size={18} /> : <ArrowRight aria-hidden="true" size={18} />}
              </button>
            </div>
            <p className="chatbot__hint" id="chatbot-hint">{atFollowUpLimit ? FOLLOW_UP_LIMIT_HINT : QUESTION_HINT}</p>
          </form>
        </div>
      ) : (
        <button
          aria-haspopup="dialog"
          aria-label="Ava vestlus"
          className={`chatbot__launcher${searchFieldFocused ? " chatbot__launcher--aside" : ""}`}
          onClick={openPanel}
          ref={launcherRef}
          type="button"
        >
          <MessageCircle aria-hidden="true" size={20} /><span aria-hidden="true">Ava vestlus</span>
        </button>
      )}
    </div>
  );
}
