import { ArrowLeft, ArrowRight, ExternalLink, LoaderCircle } from "lucide-react";
import { sourceDateMeta } from "./source-label.js";
import { DEFAULT_SEARCH_FILTERS, clientSearchFilters } from "./search_request.js";
import { ExternalAnchor } from "./AnswerSources.jsx";

const MAX_RESULT_PAGES = 2;

function sourceTierLabel(value) {
  if (value === "reviewed") return "Kontrollitud";
  if (value === "official") return "Ametlik";
  if (value === "supplementary") return "Taustallikas";
  return "Veebiallikas";
}

function pageCountFor(listing, items) {
  const reported = Math.max(0, Number(listing?.pageCount) || 0);
  const pageSize = Math.max(1, Number(listing?.pageSize) || 12);
  const hasSecondPage = reported > 1
    || listing?.hasMore === true
    || ((listing?.truncated === true || listing?.totalRelation === "gte") && items.length >= pageSize);
  return hasSecondPage ? MAX_RESULT_PAGES : Math.min(MAX_RESULT_PAGES, reported);
}

function resultCount(value, incomplete) {
  const formatted = Math.max(0, Number(value) || 0).toLocaleString("et-EE");
  return incomplete ? `vähemalt ${formatted}` : formatted;
}

export default function BroadSearchResults({
  listing,
  busy,
  error,
  notice = "",
  onPage,
  onFilters,
  headingRef,
  interactive = true,
  onSearch = null,
  suggestions = [],
  aiUnavailable = false,
  noAnswer = false,
  answerPending = false,
  answerCited = false,
  unavailable = false,
}) {
  if (!listing && !busy) return null;
  const items = Array.isArray(listing?.items) ? listing.items : [];
  const total = Math.max(0, Number(listing?.total) || 0);
  const distinctTotal = Math.max(0, Number(listing?.distinctTotal ?? total) || 0);
  const current = Math.min(MAX_RESULT_PAGES, Math.max(1, Number(listing?.page) || 1));
  const pageCount = pageCountFor(listing, items);
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
  const filters = clientSearchFilters(listing?.appliedFilters);
  const categories = Array.isArray(listing?.facets?.categories) ? listing.facets.categories : [];
  const years = Array.isArray(listing?.facets?.years) ? listing.facets.years : [];
  const hasActiveFilters = filters.source !== "all" || filters.category || filters.year || filters.sort !== "relevance";
  const incomplete = listing?.truncated === true || listing?.totalRelation === "gte";
  const limitedPages = incomplete || listing?.hasMore === true || Number(listing?.pageCount) > MAX_RESULT_PAGES;
  const safeSuggestions = typeof onSearch === "function" && !busy && !error && !unavailable
    && total === 0 && !hasActiveFilters && Array.isArray(suggestions)
    ? suggestions.filter((item) => typeof item === "string" && item.trim()).slice(0, 3)
    : [];
  const changeFilter = (key, value) => onFilters({
    ...filters,
    [key]: key === "year" ? (value ? Number(value) : null) : value,
  });
  const countText = resultCount(total, incomplete);
  const distinctText = resultCount(distinctTotal, incomplete);
  const summaryMessage = unavailable
    ? "Tulemuste loendit ei saanud laadida. Vastusekaart jääb alles, kuid allikate loend vajab uut päringut."
    : answerPending
      ? total
        ? "Kontrollin vastust. Leitud tulemused on loetletud siin."
        : "Kontrollin vastust. Laiast indeksist tulemusi ei leitud."
      : aiUnavailable
        ? total
          ? answerCited
            ? "AI-sõnastust ei saanud koostada. Vastusekaart esitab allika enda viidatud väljavõtte."
            : "AI-sõnastust ei saanud koostada. Leitud tulemused on loetletud siin."
          : "AI-vastust ei saanud koostada. Laiast indeksist tulemusi ei leitud."
        : noAnswer
          ? total
            ? "Vastust ei leitud. Leitud tulemused on loetletud siin."
            : "Vastust ei leitud. Laiast indeksist tulemusi ei leitud."
          : distinctTotal < total
            ? `Leidsin ${countText} vastet ja ühendasin need ${distinctText} eri leheks. Ülal olev koondvastus kasutab sama filtreeritud tulemuste hulka.`
            : "Ülal olev koondvastus põhineb sama päringu filtreeritud ja järjestatud tulemustel.";
  const summary = limitedPages
    ? `${summaryMessage} Näitan kuni kahte esimest kasulikku lehte.`
    : summaryMessage;

  return (
    <section className="broad-results" aria-labelledby="broad-results-title" aria-busy={busy}>
      <div className="broad-results__heading">
        <div>
          <span className="broad-results__eyebrow">Lai portaaliotsing</span>
          <h2 id="broad-results-title" ref={headingRef} tabIndex={-1}>Otsingutulemused</h2>
          <p>{summary}</p>
        </div>
        {unavailable ? null : (
          <strong>
            <span aria-hidden="true">{incomplete ? "≥ " : ""}{total.toLocaleString("et-EE")}</span>
            <span className="sr-only">{incomplete ? "Vähemalt " : ""}{total.toLocaleString("et-EE")} vastet</span>
          </strong>
        )}
      </div>
      <fieldset className="search-filters">
        <legend className="sr-only">Otsingutulemuste filtrid</legend>
        <label>
          <span>Allikas</span>
          <select disabled={!interactive || busy} value={filters.source} onChange={(event) => changeFilter("source", event.target.value)}>
            <option value="all">Kõik allikad</option>
            <option value="trusted">Ametlikud ja kontrollitud</option>
            <option value="official">Ametlikud</option>
            <option value="supplementary">Taustallikad</option>
            <option value="other">Muud veebiallikad</option>
          </select>
        </label>
        <label>
          <span>Sisutüüp</span>
          <select disabled={!interactive || busy} value={filters.category} onChange={(event) => changeFilter("category", event.target.value)}>
            <option value="">Kõik tüübid</option>
            {categories.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}
          </select>
        </label>
        <label>
          <span>Aasta</span>
          <select disabled={!interactive || busy} value={filters.year || ""} onChange={(event) => changeFilter("year", event.target.value)}>
            <option value="">Kõik aastad</option>
            {years.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}
          </select>
        </label>
        <label>
          <span>Järjestus</span>
          <select disabled={!interactive || busy} value={filters.sort} onChange={(event) => changeFilter("sort", event.target.value)}>
            <option value="relevance">Asjakohasemad enne</option>
            <option value="newest">Uuemad asjakohased enne</option>
          </select>
        </label>
        {hasActiveFilters ? <button className="filters-reset" disabled={!interactive || busy} onClick={() => onFilters(DEFAULT_SEARCH_FILTERS)} type="button">Lähtesta</button> : null}
      </fieldset>
      {error ? <div className="broad-results__error" role="alert"><span>{error}</span><button className="error-retry" disabled={!interactive || busy} onClick={() => onPage(current)} type="button">Proovi uuesti</button></div> : null}
      {notice ? <p className="broad-results__notice" role="status">{notice}</p> : null}
      {busy ? <div className="broad-results__loading" role="status"><LoaderCircle aria-hidden="true" className="spin" size={20} /> Laadin tulemusi …</div> : null}
      {!busy && !error && items.length ? (
        <div className="broad-results__list">
          {items.map((item) => (
            <ExternalAnchor className="broad-result" href={item.url} key={item.id}>
              <div className="broad-result__meta">
                <span className={`source-tier source-tier--${item.sourceTier || "other"}`}>{sourceTierLabel(item.sourceTier)}</span>
                {sourceDateMeta(item) ? <span>{sourceDateMeta(item)}</span> : null}
              </div>
              <h3>{item.title}<ExternalLink aria-hidden="true" size={15} /></h3>
              {item.summary ? <p>{item.summary}</p> : null}
              {item.locator ? <p className="broad-result__locator"><strong>Vaata allikast:</strong> {item.locator}</p> : null}
              {item.topics?.length ? <div className="broad-result__topics">{item.topics.slice(0, 3).map((topic) => <span key={topic}>{topic}</span>)}</div> : null}
            </ExternalAnchor>
          ))}
        </div>
      ) : null}
      {!busy && !error && unavailable ? (
        <p className="broad-results__empty">Tulemuste loend jäi laadimata. Proovi otsingut uuesti, et allikad uuesti järjestada.</p>
      ) : null}
      {!busy && !error && !unavailable && total === 0 ? <><p className="broad-results__empty">{hasActiveFilters
        ? `Laiast indeksist nende filtritega vasteid ei leitud (${[
          filters.source !== "all" ? `allikas: ${filters.source}` : null,
          filters.category ? `tüüp: ${filters.category}` : null,
          filters.year ? `aasta: ${filters.year}` : null,
        ].filter(Boolean).join(", ") || "filtrid"}). Proovi filtreid muuta või lähtestada.`
        : "Laiast indeksist vasteid ei leitud."}</p>{safeSuggestions.length ? <p className="broad-results__suggest">Proovi näiteks: {safeSuggestions.map((example) => <button disabled={!interactive || busy} key={example} onClick={() => onSearch(example)} type="button">{example}</button>)}</p> : null}</> : null}
      {pageCount > 1 ? (
        <nav className="results-pagination" aria-label="Otsingutulemuste lehed">
          <button disabled={!interactive || busy || current <= 1} onClick={() => onPage(current - 1)} type="button"><ArrowLeft aria-hidden="true" size={15} /> Eelmine</button>
          <div>
            {pages.map((page) => (
              <span key={page}>
                <button aria-current={page === current ? "page" : undefined} disabled={!interactive || busy || page === current} onClick={() => onPage(page)} type="button">{page}</button>
              </span>
            ))}
          </div>
          <button disabled={!interactive || busy || current >= pageCount} onClick={() => onPage(current + 1)} type="button">Järgmine <ArrowRight aria-hidden="true" size={15} /></button>
        </nav>
      ) : null}
    </section>
  );
}
