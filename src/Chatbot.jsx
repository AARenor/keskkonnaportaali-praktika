import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, MessageCircle, Sparkles, X } from "lucide-react";
import AnswerChart, { chartSourceDiffers } from "./AnswerChart.jsx";
import { noteServerBuild } from "./app-build.js";
import { DEFAULT_SEARCH_FILTERS, readFollowUpResponse, searchRequestPayload } from "./search_request.js";
import { REVIEWED_FORESTRY_SEARCH_SUGGESTIONS } from "./search-suggestions.js";
import { fetchSearchStream, readSearchStream } from "./search-stream.js";

// Same bound as the inline follow-ups on the search page, so one conversation
// limit holds for both entry points.
const MAX_FOLLOW_UPS = 4;
const FOLLOW_UP_LIMIT_HINT = `Jätkuküsimusi saab esitada ${MAX_FOLLOW_UPS}. Alusta uut vestlust, et teemat jätkata.`;
const QUESTION_HINT = "Vastan eesti keeles Eesti metsaandmete küsimustele. Kui allikad leitakse, lisan neile viited.";
// Reviewed forestry questions: production search is Estonian-only and
// forestry-only, so the panel never suggests a question it cannot answer.
const EXAMPLE_QUESTIONS = REVIEWED_FORESTRY_SEARCH_SUGGESTIONS.slice(0, 3);

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
function ChatAnswer({ result, onAsk, busy, atFollowUpLimit, parts }) {
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
      {result.related?.length ? (
        <div className="chatbot__related" role="group" aria-label="Soovitatud jätkuküsimused">
          {result.related.slice(0, 3).map((question) => (
            <button disabled={busy || atFollowUpLimit} key={question} onClick={() => onAsk(question)} type="button">
              {question}<ArrowRight aria-hidden="true" size={14} />
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export default function Chatbot({ answerParts, answerTextOf }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [searchFieldFocused, setSearchFieldFocused] = useState(false);
  const requestRef = useRef({ id: 0, controller: null });
  const launcherRef = useRef(null);
  const inputRef = useRef(null);
  const closeRef = useRef(null);
  const bodyRef = useRef(null);
  const restoreFocusRef = useRef(false);
  const busy = Boolean(pending);
  const followUpCount = Math.max(0, turns.length - 1);
  const atFollowUpLimit = followUpCount >= MAX_FOLLOW_UPS;

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
    setPending({ kind: "first", question, resultsReady: false });
    setError(null);
    setNotice("");
    setDraft("");
    let latestResult = null;
    try {
      const response = await fetchSearchStream("/api/search/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchRequestPayload(question, DEFAULT_SEARCH_FILTERS)),
        signal: controller.signal,
      });
      noteServerBuild(response);
      await readSearchStream(response, (event) => {
        if (requestRef.current.id !== id) return;
        if (event.type === "results") {
          setPending((current) => (current ? { ...current, resultsReady: true } : current));
          return;
        }
        latestResult = event.result;
      });
      if (requestRef.current.id !== id) return;
      if (!latestResult) throw new Error("Otsing ei tagastanud vastust. Proovi uuesti.");
      setTurns((current) => [...current, { question, result: latestResult }]);
    } catch (searchError) {
      if (searchError.name === "AbortError" || requestRef.current.id !== id) return;
      if (latestResult) {
        // The stream broke after a checked result arrived: keep that result and
        // say so, instead of inventing an answer or dropping what was verified.
        setTurns((current) => [...current, { question, result: latestResult }]);
        setNotice("Vastuse voog katkes. Kuvan viimase kontrollitud vaheseisu.");
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
    setPending({ kind: "follow-up", question, resultsReady: true });
    setError(null);
    setNotice("");
    setDraft("");
    try {
      const response = await fetch("/api/search/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root_query: rootTurn.result?.query || rootTurn.question,
          question,
          previous_questions: turns.slice(1).map((turn) => turn.question),
          previous_answers: turns.map((turn) => answerTextOf(turn.result)).filter(Boolean),
          filters: DEFAULT_SEARCH_FILTERS,
        }),
        signal: controller.signal,
      });
      noteServerBuild(response);
      const data = await readFollowUpResponse(response);
      if (requestRef.current.id !== id) return;
      setTurns((current) => [...current, { question, result: data }]);
    } catch (followUpError) {
      if (followUpError.name === "AbortError" || requestRef.current.id !== id) return;
      setError({ question, message: followUpError.message || "Jätkuküsimusele ei saanud vastata." });
      setDraft(question);
      focusInput();
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

  // Scroll only the panel, never the page: a fixed panel that drags the document
  // would move the reader's search view.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !open) return;
    body.scrollTop = body.scrollHeight;
  }, [open, turns.length, pending, error, notice]);

  const status = pending
    ? pending.kind === "first"
      ? pending.resultsReady ? "Otsingutulemused on valmis, koostan vastust." : "Otsin asjakohaseid ametlikke allikaid."
      : "Otsin jätkuküsimusele uusi allikaid."
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
                <div className="chatbot__examples" role="group" aria-label="Näidisküsimused">
                  {EXAMPLE_QUESTIONS.map((question) => (
                    <button key={question} onClick={() => ask(question)} type="button">{question}</button>
                  ))}
                </div>
              </div>
            ) : null}
            {turns.map((turn, index) => (
              <section className="chatbot__turn" key={`${turn.question}-${index}`}>
                <div className="chatbot__question"><span>Teie</span><p>{turn.question}</p></div>
                <div className="chatbot__answer">
                  <ChatAnswer busy={busy} atFollowUpLimit={atFollowUpLimit} onAsk={ask} parts={answerParts} result={turn.result} />
                </div>
              </section>
            ))}
            {pending ? (
              <section aria-busy="true" className="chatbot__turn chatbot__turn--pending">
                <div className="chatbot__question"><span>Teie</span><p>{pending.question}</p></div>
                <div aria-hidden="true" className="chatbot__answer chatbot__answer--skeleton">
                  <i className="skeleton-line skeleton-line--medium" />
                  <i className="skeleton-line skeleton-line--wide" />
                  <i className="skeleton-line skeleton-line--short" />
                </div>
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
