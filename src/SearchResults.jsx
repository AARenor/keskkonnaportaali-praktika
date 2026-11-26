import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CircleHelp, LoaderCircle, Sparkles } from "lucide-react";
import AnswerChart, { chartSourceDiffers } from "./AnswerChart.jsx";
import AnswerParts from "./AnswerParts.jsx";
import BroadSearchResults from "./BroadSearchResults.jsx";
import SearchForm from "./SearchForm.jsx";
import {
  AnswerNote,
  Citation,
  ExternalAnchor,
  SourceActions,
  SourceLegend,
  UpdateNotice,
} from "./AnswerSources.jsx";
import { noteServerBuild } from "./app-build.js";
import {
  DEFAULT_SEARCH_FILTERS,
  clientSearchFilters,
  followUpAnswerPayload,
  followUpRequestPayload,
  hasNoModelWording,
  isNoAnswerCard,
  isSourceOnlyCard,
  searchRequestPayload,
} from "./search_request.js";
import { searchWaitingMessage } from "./search-stream.js";
import { readSearchJob } from "./search_jobs.js";
import { answerHeading } from "./answer_title.js";
import { contextualSuggestions } from "./suggestion_context.js";
import { SEARCH_HISTORY_MAX_PAGES, searchHistoryCacheKey } from "./search_history.js";
import { shouldFetchRemoteSuggestions } from "./search-suggestions.js";

function SearchLoadingSkeleton({ resultsReady = false, elapsedMs = 0 }) {
  return (
    <section aria-hidden="true" className="search-skeleton">
      <div className="search-skeleton__status"><LoaderCircle className="spin" size={18} /><span>{searchWaitingMessage({ elapsedMs, listingReady: resultsReady })}</span></div>
      <div aria-hidden="true" className="search-skeleton__answer">
        <span className="skeleton-line skeleton-line--label" />
        <span className="skeleton-line skeleton-line--title" />
        <span className="skeleton-line skeleton-line--wide" />
        <span className="skeleton-line skeleton-line--medium" />
        <div className="search-skeleton__citations"><span /><span /><span /></div>
      </div>
    </section>
  );
}

export default function SearchResults({ answerTextOf, result, query, busy, error, onSearch, onHome, previewListing, listingUnavailable = false, filters = DEFAULT_SEARCH_FILTERS, listingNotice = "", onListingNotice, onPageSelect }) {
  const hasResult = Boolean(result?.answer);
  const [listing, setListing] = useState(result?.searchResults || previewListing || null);
  const [listingBusy, setListingBusy] = useState(false);
  const [listingError, setListingError] = useState("");
  const [followUps, setFollowUps] = useState([]);
  const [followUpValue, setFollowUpValue] = useState("");
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [pendingFollowUpQuestion, setPendingFollowUpQuestion] = useState("");
  const [followUpError, setFollowUpError] = useState("");
  const [pendingFollowUpListing, setPendingFollowUpListing] = useState(null);
  const [emptySuggestions, setEmptySuggestions] = useState([]);
  const [waitingMs, setWaitingMs] = useState(0);
  const [followUpWaitingMs, setFollowUpWaitingMs] = useState(0);
  const headingRef = useRef(null);
  const listingHeadingRef = useRef(null);
  const followUpInputRef = useRef(null);
  const listingRequestRef = useRef({ id: 0, controller: null });
  const followUpRequestRef = useRef({ id: 0, controller: null });
  const suggestionRequestRef = useRef({ id: 0, controller: null });
  const incomingListing = result?.searchResults || previewListing || null;
  const listingKey = incomingListing
    ? searchHistoryCacheKey({ query, filters, listing: incomingListing })
    : null;
  useEffect(() => {
    listingRequestRef.current.controller?.abort();
    listingRequestRef.current = { id: listingRequestRef.current.id + 1, controller: null };
    setListing(incomingListing);
    setListingBusy(false);
    setListingError("");
    return () => {
      listingRequestRef.current.controller?.abort();
      listingRequestRef.current = { id: listingRequestRef.current.id + 1, controller: null };
    };
  }, [listingKey]);
  useEffect(() => {
    return () => followUpRequestRef.current.controller?.abort();
  }, []);
  useEffect(() => {
    if (!busy) {
      setWaitingMs(0);
      return undefined;
    }
    const startedAt = Date.now();
    setWaitingMs(0);
    const timer = window.setInterval(() => setWaitingMs(Date.now() - startedAt), 5_000);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (!followUpBusy) {
      setFollowUpWaitingMs(0);
      return undefined;
    }
    const startedAt = Date.now();
    setFollowUpWaitingMs(0);
    const timer = window.setInterval(() => setFollowUpWaitingMs(Date.now() - startedAt), 5_000);
    return () => window.clearInterval(timer);
  }, [followUpBusy]);
  useEffect(() => {
    if (!busy && hasResult) {
      document.title = "Otsingutulemused | Keskkonnaportaali praktika";
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [busy, hasResult]);
  useEffect(() => {
    if (followUpBusy || !followUps.length) return;
    const latestHeading = document.getElementById(`followup-${followUps.length}-title`);
    latestHeading?.focus({ preventScroll: true });
    latestHeading?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [followUpBusy, followUps.length]);
  const appliedFilters = clientSearchFilters(listing?.appliedFilters || result?.searchResults?.appliedFilters || filters);
  // "Küsi veel" belongs to the question the reader is on: the latest follow-up
  // decides the ranking, the answer's own question and the follow-ups already
  // asked are excluded, and a question that fits neither topic is dropped
  // instead of padding the row.
  const relatedQuestions = contextualSuggestions({
    candidates: Array.isArray(result?.related) ? result.related : [],
    query: followUps.length ? followUps[followUps.length - 1].question : result?.query || query || "",
    rootQuery: result?.query || query || "",
    priorQuestions: followUps.map((turn) => turn.question),
    filters: appliedFilters,
    limit: 12,
    allowDefault: false,
  });
  const aiUnavailable = Boolean(result?.answer?.aiUnavailable);
  const noAnswer = !aiUnavailable && isNoAnswerCard(result?.answer);
  // A card that carries no model summary: the wording failed, or the server
  // published the source records without a summary. Neither leads the results.
  const noSummary = aiUnavailable || isSourceOnlyCard(result?.answer);
  const listingLeads = (noSummary || noAnswer) && Number((listing || result?.searchResults || previewListing)?.items?.length || 0) > 0;
  // A stream that ended without an answer card leaves no wording to show, so
  // the listing header must not claim a summary sits above it either.
  const wordingMissing = noSummary || Boolean(error && !hasResult);
  const visibleListing = listing || result?.searchResults || previewListing;
  const hasActiveFilters = appliedFilters.source !== "all" || appliedFilters.category || appliedFilters.year || appliedFilters.sort !== "relevance";
  const canSuggest = Boolean(visibleListing)
    && !busy
    && !listingBusy
    && !error
    && !listingError
    && !listingUnavailable
    && Number(visibleListing.total || 0) === 0
    && !hasActiveFilters
    && shouldFetchRemoteSuggestions(query);
  useEffect(() => {
    suggestionRequestRef.current.controller?.abort();
    const requestId = suggestionRequestRef.current.id + 1;
    if (!canSuggest) {
      suggestionRequestRef.current = { id: requestId, controller: null };
      setEmptySuggestions([]);
      return undefined;
    }
    setEmptySuggestions([]);
    const controller = new AbortController();
    suggestionRequestRef.current = { id: requestId, controller };
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: query }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.suggestions) || suggestionRequestRef.current.id !== requestId) return;
        const candidates = data.suggestions.map((item) => item?.value).filter((item) => typeof item === "string");
        setEmptySuggestions(candidates.slice(0, 3));
      } catch (suggestionError) {
        if (suggestionError.name !== "AbortError" && suggestionRequestRef.current.id === requestId) setEmptySuggestions([]);
      }
    }, 100);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      if (suggestionRequestRef.current.id === requestId) {
        suggestionRequestRef.current = { id: requestId, controller: null };
      }
    };
  }, [canSuggest, query]);
  // A fallback card is a status, not the answer. When the model wording is
  // missing the ranked list leads, because that list is the product the reader
  // came for and it already survived the failure.
  const requestListingPage = async (page, windowId, signal) => {
    const payload = searchRequestPayload(query, appliedFilters, page, listing?.pageSize || 12);
    if (page > 1 && windowId) payload.window_id = windowId;
    const response = await fetch("/api/search/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    noteServerBuild(response);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Tulemusi ei saanud laadida.");
    return data;
  };
  const loadListingPage = async (page) => {
    const requestedPage = Number(page);
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > SEARCH_HISTORY_MAX_PAGES) return;
    const previousPage = Math.max(1, Number(listing?.page) || 1);
    if (requestedPage > 1 && !listing?.windowId) {
      setListingError("Selle otsinguakna tunnus puudub. Uuenda otsingut enne järgmise lehe avamist.");
      return;
    }
    const previousScrollY = window.scrollY;
    listingRequestRef.current.controller?.abort();
    const id = listingRequestRef.current.id + 1;
    const controller = new AbortController();
    listingRequestRef.current = { id, controller };
    setListingBusy(true);
    setListingError("");
    onListingNotice?.("");
    try {
      let data = await requestListingPage(requestedPage, listing?.windowId, controller.signal);
      let refreshedExpiredWindow = false;
      const windowChanged = Boolean(listing?.windowId && data.windowId !== listing.windowId);
      const revisionChanged = Boolean(listing?.queryRevision && data.queryRevision !== listing.queryRevision);
      if (requestedPage === 2 && (
        data.windowExpired === true
        || Number(data.page) !== requestedPage
        || windowChanged
        || revisionChanged
      )) {
        if (listingRequestRef.current.id !== id) return;
        data = await requestListingPage(1, undefined, controller.signal);
        if (Number(data.page || 1) !== 1 || data.windowExpired === true) {
          throw new Error("Otsingutulemuste esimest lehte ei saanud uuendada.");
        }
        refreshedExpiredWindow = true;
      } else if (Number(data.page || requestedPage) !== requestedPage) {
        throw new Error("Server tagastas vale otsingutulemuste lehe.");
      }
      if (listingRequestRef.current.id !== id) return;
      setListing(data);
      const notice = refreshedExpiredWindow
        ? "Otsinguaken aegus. Uuendasin esimest lehte. Lehevalik näitab nüüd ajakohaseid tulemusi."
        : "";
      onListingNotice?.(notice);
      const nextPage = Number(data.page || requestedPage);
      const identityChanged = data.windowId !== listing?.windowId || data.queryRevision !== listing?.queryRevision;
      if (refreshedExpiredWindow || nextPage !== previousPage || identityChanged) onPageSelect?.(data, notice, previousScrollY);
      window.requestAnimationFrame(() => {
        listingHeadingRef.current?.focus({ preventScroll: true });
        listingHeadingRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
      });
    } catch (listingLoadError) {
      if (listingLoadError.name === "AbortError" || listingRequestRef.current.id !== id) return;
      setListingError(listingLoadError.message || "Tulemusi ei saanud laadida.");
    } finally {
      if (listingRequestRef.current.id === id) {
        listingRequestRef.current = { id, controller: null };
        setListingBusy(false);
      }
    }
  };
  const applyFilters = (nextFilters) => {
    listingRequestRef.current.controller?.abort();
    onSearch(query, { filters: clientSearchFilters(nextFilters) });
  };

  const broadResults = (
    <BroadSearchResults
      busy={listingBusy}
      error={listingError}
      headingRef={listingHeadingRef}
      interactive={!listingBusy}
      listing={visibleListing}
      notice={listingNotice}
      onFilters={applyFilters}
      onPage={loadListingPage}
      onSearch={onSearch}
      suggestions={emptySuggestions}
      aiUnavailable={wordingMissing}
      noAnswer={noAnswer}
      answerCited={Boolean(result?.answer?.introCitations?.length)}
      unavailable={listingUnavailable}
    />
  );
  const askFollowUp = async (questionValue) => {
    const cleanQuestion = String(questionValue || followUpValue).replace(/\s+/gu, " ").trim();
    if (!cleanQuestion || busy || followUpBusy || followUps.length >= 4) return;
    followUpRequestRef.current.controller?.abort();
    const id = followUpRequestRef.current.id + 1;
    const controller = new AbortController();
    followUpRequestRef.current = { id, controller };
    setFollowUpBusy(true);
    setPendingFollowUpQuestion(cleanQuestion);
    setPendingFollowUpListing(null);
    setFollowUpError("");
    setFollowUpValue("");
    // Related questions live below the answer: scroll up at once so the
    // pending state and the arriving answer are visible without hunting.
    window.requestAnimationFrame(() => {
      headingRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    let latestListing = null;
    let latestResult = null;
    try {
      // The follow-up runs as an asynchronous job too: its own listing arrives
      // before the answer, so a slow model never hides the sources it already
      // found and a search longer than one connection outlives it. The previous
      // answers travel as comparison context only.
      await readSearchJob({
        kind: "follow-up",
        payload: followUpRequestPayload({
          rootQuery: result.query || query,
          question: cleanQuestion,
          previousQuestions: followUps.map((turn) => turn.question),
          previousAnswers: [result, ...followUps.map((turn) => turn.result)].map(answerTextOf).filter(Boolean),
          filters: appliedFilters,
        }),
        signal: controller.signal,
        onResponse: (response) => noteServerBuild(response),
        onEvent: (event) => {
          if (followUpRequestRef.current.id !== id) return;
          if (event.type === "results") {
            latestListing = event.searchResults || null;
            setPendingFollowUpListing(latestListing);
            return;
          }
          latestResult = event.result;
        },
      });
      if (followUpRequestRef.current.id !== id) return;
      if (!latestResult) throw new Error("Jätkuküsimusele ei saanud vastata.");
      const answer = followUpAnswerPayload(latestResult);
      setFollowUps((current) => [...current, {
        id,
        question: cleanQuestion,
        result: answer,
        listing: latestListing,
      }].slice(0, 4));
    } catch (followUpLoadError) {
      if (followUpLoadError.name === "AbortError" || followUpRequestRef.current.id !== id) return;
      setFollowUpValue(cleanQuestion);
      const found = Number(latestListing?.items?.length || 0);
      setFollowUpError(followUpLoadError.name === "Error" && latestResult
        ? followUpLoadError.message
        : found
          ? `Koondvastust ei saanud koostada. Jätkuküsimusele leiti ${found} allikat, need on allpool loetletud.`
          : followUpLoadError.message || "Jätkuküsimusele ei saanud vastata.");
      if (latestListing?.items?.length) {
        setFollowUps((current) => [...current, {
          id,
          question: cleanQuestion,
          result: null,
          listing: latestListing,
        }].slice(0, 4));
        setPendingFollowUpQuestion("");
      }
      window.requestAnimationFrame(() => followUpInputRef.current?.focus());
    } finally {
      if (followUpRequestRef.current.id === id) {
        followUpRequestRef.current = { id, controller: null };
        setFollowUpBusy(false);
        setPendingFollowUpQuestion("");
        setPendingFollowUpListing(null);
      }
    }
  };
  return (
    <main className="search-page" id="main-content">
      <div aria-atomic="true" aria-live="polite" className="sr-only">
        {busy ? searchWaitingMessage({ elapsedMs: waitingMs, listingReady: Boolean(previewListing) }) : ""}
      </div>
      <div className="search-page__header">
        <div className="shell search-results-shell">
          <button className="back-link" onClick={onHome} type="button"><ArrowLeft size={17} /> Avalehele</button>
          <SearchForm busy={busy} contextQuery={query} initialValue={query} onSearch={onSearch} variant="results" />
          <UpdateNotice />
        </div>
      </div>
      <div className="shell search-results-shell search-page__content">
        {busy && !hasResult ? <SearchLoadingSkeleton elapsedMs={waitingMs} resultsReady={Boolean(previewListing)} /> : null}
        {/* The listing that already reached the client leads: a failed stream
            cannot withdraw it, so it renders before the notice that says what
            is missing. */}
        {!hasResult && previewListing ? (
          <BroadSearchResults
            busy={false}
            error=""
            headingRef={listingHeadingRef}
            interactive={!listingBusy}
            listing={listing || previewListing}
            notice={listingNotice}
            onFilters={applyFilters}
            onPage={loadListingPage}
            onSearch={onSearch}
            suggestions={emptySuggestions}
            aiUnavailable={wordingMissing}
            noAnswer={noAnswer}
            unavailable={listingUnavailable}
          />
        ) : null}
        {error ? <div className="search-error" role="alert"><CircleHelp size={22} /><div><strong>Otsingut ei saanud lõpetada</strong><p>{error}</p><button className="error-retry" disabled={busy} onClick={() => onSearch(query, { filters: appliedFilters })} type="button">Proovi uuesti</button></div></div> : null}
        {hasResult ? (
          <>
            {listingLeads ? broadResults : null}
            <article className="answer-card">
              {busy ? <div className="answer-progress"><LoaderCircle className="spin" size={16} /> Kontrollin vastust …</div> : null}
              <div className="answer-label"><Sparkles size={17} /><span>{result.answer.eyebrow || "AI koondvastus"}</span></div>
              <h1 ref={headingRef} tabIndex={-1}>{answerHeading(result, query)}</h1>
              <p className="answer-intro">
                {result.answer.intro}{" "}
                {(result.answer.introCitations || []).map((citation) => <Citation key={citation} number={citation} sources={result.sources} />)}
              </p>
              {result.chart ? <AnswerChart chart={result.chart} citation={<Citation number={result.chart.citation} sources={result.sources} />} sourceDiffers={chartSourceDiffers(result.answer, result.chart, result.sources)} key={`${result.chart.title}-${result.chart.series.map((series) => series.id).join("|")}`} /> : null}
              <AnswerParts Citation={Citation} answer={result.answer} sources={result.sources} />
              <SourceActions sources={result.sources} />
              <SourceLegend sources={result.sources} answer={result.answer} chart={result.chart} />
              <AnswerNote note={result.answer.note} />
              {result.clarification ? (
                <div className="answer-clarification">
                  <strong>Täpsusta soovi korral</strong>
                  <p>{result.clarification}</p>
                </div>
              ) : null}
              <div className="answer-followup">
                {followUps.length || pendingFollowUpQuestion ? <div className="followup-thread">
                  {followUps.map((turn, turnIndex) => {
                    const turnAnswer = turn.result?.answer;
                    // A card without model wording is a status, not the answer:
                    // the follow-up's own listing leads it, and everything the
                    // card does carry (its own label, cited wording, parts,
                    // chart, legend, note) stays readable. Only a stream that
                    // ended without any card falls back to a plain status.
                    const noWording = hasNoModelWording(turnAnswer);
                    const turnSources = noWording ? (turn.listing?.items || []).slice(0, 5) : [];
                    const turnListing = turnSources.length ? (
                      <div className="followup-answer">
                        <span>Leitud allikad</span>
                        <ul className="followup-sources">
                          {turnSources.map((item) => (
                            <li key={item.id || item.url}><ExternalAnchor href={item.url}>{item.title || item.url}</ExternalAnchor></li>
                          ))}
                        </ul>
                      </div>
                    ) : null;
                    if (!turnAnswer) {
                      return (
                        <section className="followup-turn" key={turn.id}>
                          <div className="followup-question"><span>Teie</span><p>{turn.question}</p></div>
                          {turnListing}
                          <div className="followup-answer">
                            <p className="followup-status" role="status">Koondvastust ei saanud koostada. Proovi sama küsimust uuesti.</p>
                          </div>
                        </section>
                      );
                    }
                    return (
                      <section className="followup-turn" key={turn.id}>
                        <div className="followup-question"><span>Teie</span><p>{turn.question}</p></div>
                        {noWording ? turnListing : null}
                        <div className="followup-answer">
                          <span>{noWording ? turnAnswer.eyebrow || "AI koondvastus" : "Koondvastus"}</span>
                          <h2 id={`followup-${turnIndex + 1}-title`} tabIndex={-1}>{answerHeading(turn.result, turn.question)}</h2>
                          <p>{turnAnswer.intro}{" "}{(turnAnswer.introCitations || []).map((citation) => <Citation key={citation} number={citation} sources={turn.result.sources} />)}</p>
                          {turn.result.chart ? <AnswerChart chart={turn.result.chart} citation={<Citation number={turn.result.chart.citation} sources={turn.result.sources} />} sourceDiffers={chartSourceDiffers(turnAnswer, turn.result.chart, turn.result.sources)} key={`${turn.result.chart.title}-${turn.result.chart.series.map((series) => series.id).join("|")}`} /> : null}
                          <AnswerParts Citation={Citation} answer={turnAnswer} headingLevel="h4" sources={turn.result.sources} />
                          <SourceActions sources={turn.result.sources} />
                          <SourceLegend sources={turn.result.sources} answer={turnAnswer} chart={turn.result.chart} />
                          {noWording ? <AnswerNote note={turnAnswer.note} /> : null}
                        </div>
                      </section>
                    );
                  })}
                  {pendingFollowUpQuestion ? (
                    <section aria-busy="true" className="followup-turn followup-turn--pending">
                      <div className="followup-question"><span>Teie</span><p>{pendingFollowUpQuestion}</p></div>
                      {pendingFollowUpListing?.items?.length ? (
                        <div className="followup-answer">
                          <span>Leitud allikad</span>
                          <ul className="followup-sources">
                            {pendingFollowUpListing.items.slice(0, 5).map((item) => (
                              <li key={item.id || item.url}><ExternalAnchor href={item.url}>{item.title || item.url}</ExternalAnchor></li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div aria-hidden="true" className="followup-answer followup-answer--skeleton">
                          <span>Koondvastus</span>
                          <i className="skeleton-line skeleton-line--medium" />
                          <i className="skeleton-line skeleton-line--wide" />
                          <i className="skeleton-line skeleton-line--short" />
                        </div>
                      )}
                    </section>
                  ) : null}
                </div> : null}
                <form className="followup-form" onSubmit={(event) => { event.preventDefault(); askFollowUp(); }}>
                  <label htmlFor="answer-followup-input">Küsi selle vastuse kohta</label>
                  <div>
                    <input
                      autoComplete="off"
                      disabled={busy || followUpBusy || followUps.length >= 4}
                      id="answer-followup-input"
                      maxLength={180}
                      onChange={(event) => setFollowUpValue(event.target.value)}
                      placeholder={followUps.length >= 4 ? "Alusta uue otsinguga, et teemat jätkata" : "Kirjuta täpsustav küsimus"}
                      type="text"
                      ref={followUpInputRef}
                      value={followUpValue}
                    />
                    <button aria-label="Saada jätkuküsimus" disabled={busy || followUpBusy || !followUpValue.trim() || followUps.length >= 4} type="submit">
                      {followUpBusy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
                    </button>
                  </div>
                  {followUpError ? <p className="followup-error" role="alert">{followUpError}</p> : null}
                  {followUpBusy ? (
                    <p className="followup-status" role="status">
                      {searchWaitingMessage({
                        elapsedMs: followUpWaitingMs,
                        listingReady: Boolean(pendingFollowUpListing?.items?.length),
                        followUp: true,
                      })}
                    </p>
                  ) : null}
                </form>
              </div>
            </article>

            {listingLeads ? null : broadResults}

            {relatedQuestions.length ? (
              <section className="related-section">
                <h2>Küsi veel</h2>
                <p>Vali küsimus. See algab uue otsinguga ja näitab selle küsimuse allikad.</p>
                <div>{relatedQuestions.map((item) => <button disabled={busy || followUpBusy} key={item} onClick={() => onSearch(item)} type="button">{item}<ArrowRight size={16} /></button>)}</div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
