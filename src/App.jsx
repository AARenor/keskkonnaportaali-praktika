import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudSun,
  ExternalLink,
  Facebook,
  Globe2,
  Instagram,
  Layers3,
  Link2,
  LoaderCircle,
  Map,
  MapPinned,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  TreePine,
  X,
  Youtube,
} from "lucide-react";
import { safeExternalHref } from "./url-safety.js";
import { citationColor, latestSourceUpdates, sourceDateMeta, sourceOrganizationLabel } from "./source-label.js";
import {
  REVIEWED_SEARCH_SUGGESTIONS,
  shouldFetchRemoteSuggestions,
  suggestionsForValue,
} from "./search-suggestions.js";
import { contextualSuggestions } from "./suggestion_context.js";
import { searchWaitingMessage } from "./search-stream.js";
import AnswerChart, { chartSourceDiffers } from "./AnswerChart.jsx";
import { APP_BUILD_MISMATCH_EVENT, noteServerBuild } from "./app-build.js";
import { DEFAULT_SEARCH_FILTERS, clientSearchFilters, followUpAnswerPayload, followUpRequestPayload, hasNoModelWording, isNoAnswerCard, isSourceOnlyCard, searchRequestPayload } from "./search_request.js";
import { readSearchJob } from "./search_jobs.js";
import { answerHeading } from "./answer_title.js";
import Chatbot from "./Chatbot.jsx";

const SOURCE = "https://keskkonnaportaal.ee";
const navigationSearches = new globalThis.Map();
let navigationSearchCounter = 0;

function legacySearchFromLocation(search = window.location.search) {
  const params = new URLSearchParams(search);
  return {
    query: String(params.get("q") || "").trim(),
    filters: clientSearchFilters({
      source: params.get("source") || "all",
      category: params.get("category") || "",
      year: params.get("year"),
      sort: params.get("sort") || "relevance",
    }),
  };
}

function rememberNavigationSearch(query, filters) {
  navigationSearchCounter += 1;
  const id = `${Date.now().toString(36)}-${navigationSearchCounter.toString(36)}`;
  navigationSearches.set(id, { query, filters: clientSearchFilters(filters) });
  if (navigationSearches.size > 50) navigationSearches.delete(navigationSearches.keys().next().value);
  return id;
}

function navigationSearch(state = window.history.state, search = window.location.search) {
  const saved = navigationSearches.get(String(state?.practiceSearchId || ""));
  if (saved && typeof saved === "object") {
    return {
      query: String(saved.query || "").trim(),
      filters: clientSearchFilters(saved.filters),
    };
  }
  return legacySearchFromLocation(search);
}

const navItems = [
  { label: "Teemad", menu: "topics" },
  { label: "Andmed ja kaart", href: "https://register.keskkonnaportaal.ee/register", external: true },
  { label: "Andmeallikad", menu: "sources" },
  { label: "Keskkonnaülevaade", href: `${SOURCE}/et/keskkonnaulevaade` },
  { label: "Publikatsioonid", href: `${SOURCE}/et/publikatsioonid` },
  { label: "Uudised", href: `${SOURCE}/et/uudised` },
  { label: "Mõõdikud", menu: "metrics" },
  { label: "Projektid", href: `${SOURCE}/et/projektid` },
  { label: "Sündmused", href: `${SOURCE}/et/syndmuste_kalender` },
];

const megaMenus = {
  topics: {
    title: "Keskkonnateemad",
    groups: [
      [
        "Kõik teemad",
        "Elurikkus ja loodus",
        "Looduskaitse",
        "Ulukid",
        "Loodushüved",
        "Mets",
        "Metsastatistika, sh SMI",
        "Muld ja maahõive",
        "Vesi",
        "Meri",
        "Pinnavesi",
        "Põhjavesi",
      ],
      [
        "Välisõhk",
        "Õhusaasteainete heitkogused",
        "Õhk Euroopas",
        "Ilm ja kliima",
        "Kliimamuutused",
        "Ilmaülevaated",
        "Jäätmed ja ringmajandus",
        "Jäätmed",
        "Ringmajandus",
        "Kestlikkus",
      ],
      [
        "Keskkonnaseire",
        "Riiklik keskkonnaseire programm",
        "Kaugseire",
        "Copernicuse teenused",
        "Jääkaart",
        "Reaalajamajandus",
        "Metsavaldkond",
        "Veevaldkond",
        "Taastuvenergia",
        "Kliimapoliitika andmevärav",
      ],
    ],
  },
  sources: {
    title: "Andmeallikad",
    groups: [
      ["Avaandmed", "EELIS", "Keskkonnaseire", "Keskkonnaotsuste infosüsteem"],
      ["Kliimaatlas", "Statistika", "Kaardilood", "Keskkonnaülevaated"],
    ],
  },
  metrics: {
    title: "Mõõdikud",
    groups: [["Keskkonnamõõdikud", "Kliimamõõdikud", "Ringmajanduse mõõdikud"]],
  },
};

const portalTiles = [
  {
    label: "Keskkonnahoidliku arengu andmevärav",
    kicker: "Uuri lähemalt!",
    image: "/assets/tile-nature.jpg",
    href: `${SOURCE}/et/teemad/keskkonnahoidliku-arengu-andmevarav`,
  },
  {
    label: "Metsastatistika",
    kicker: "Vaata täpsemalt!",
    image: "/assets/portal-forest-statistics.jpg",
    href: `${SOURCE}/et/teemad/mets/metsastatistika-sh-smi`,
  },
  {
    label: "Jäätmeinfosüsteem PISTRIK",
    kicker: "Loe lisa!",
    image: "/assets/tile-pistrik.png",
    href: `${SOURCE}/et/jaatmeinfosusteem-pistrik`,
  },
  {
    label: "Avaandmed",
    kicker: "Leia kasutust!",
    image: "/assets/tile-open-data.jpg",
    href: `${SOURCE}/et/avaandmed`,
  },
];

const currentCards = [
  {
    title: "Uuring kogu Eesti toidutarneahelas tekkivate toidujäätmete ja toidukao kohta",
    image: "/assets/portal-food-waste.jpg",
    tags: ["Uuringud ja aruanded", "Jäätmed"],
    meta: "Andis välja Keskkonnainvesteeringute Keskus",
    excerpt: "Toidujäätmete uuring annab ülevaate Eestis tekkivate toidujäätmete ja toidukao tekkest aastatel 2024–2025.",
    href: `${SOURCE}/et/uuring-kogu-eesti-toidutarneahelas-tekkivate-toidujaatmete-ja-toidukao-kohta`,
  },
  {
    title: "Kaardirakendusse lisandus hüvitusalade ja maapõue info",
    image: "/assets/portal-minerals.png",
    tags: ["Andmed", "Looduskaitse", "Maavarad"],
    meta: "Keskkonnaportaal",
    excerpt: "Veebikaardil on kättesaadavad hüvitusalade kaardikiht ja Eesti Geoloogiateenistuse maavarade registri kaardikihid.",
    href: `${SOURCE}/et/uudised/kaardirakendusse-lisandus-huvitusalade-ja-maapoue-info`,
  },
];

const news = [
  {
    title: "Oktoober kutsub märkama Euroopa Liidu ökomärgist",
    image: "/assets/portal-news-ecolabel.png",
    tag: "Kestlikkus",
    publisher: "Keskkonnaagentuur",
    date: "01.10.2026",
    href: "https://www.keskkonnaagentuur.ee/uudised/oktoober-kutsub-markama-euroopa-liidu-okomargist",
  },
  {
    title: "KIK kutsub loodushariduse edendajaid ja õpetajaid keskkonnahariduse konverentsile",
    image: "/assets/portal-news-education.png",
    tag: "Keskkonnaharidus",
    publisher: "Keskkonnainvesteeringute Keskus",
    date: "30.09.2026",
    href: "https://www.kik.ee/et/uudised/kik-kutsub-loodushariduse-edendajaid-ja-opetajaid-keskkonnahariduse-konverentsile",
  },
  {
    title: "Blogis: Eestis on nüüd kokku 11 WMO poolt tunnustatud sajandi jaama",
    image: "/assets/portal-news-kasari.png",
    tag: "Vesi",
    publisher: "Keskkonnaagentuur",
    date: "28.09.2026",
    href: "https://www.keskkonnaagentuur.ee/uudised/blogis-eestis-nuud-kokku-11-wmo-poolt-tunnustatud-sajandi-jaama",
  },
  {
    title: "Uuenenud Keskkonnaagentuuri ilmaäpis ILM+ nüüd ka radarite lühiennustus ja täpsemad ilmahoiatused",
    image: "/assets/portal-news-weather.jpg",
    tag: "Ilm ja kliima",
    publisher: "Keskkonnaagentuur",
    date: "25.09.2026",
    href: "https://www.keskkonnaagentuur.ee/uudised/uuenenud-keskkonnaagentuuri-ilmaapis-ilm-nuud-ka-radarite-luhiennustus-ja-tapsemad",
  },
];

const events = [
  {
    day: "08",
    month: "oktoober",
    type: "event",
    title: "Loomaaia loenguõhtu. Hendrik Relve",
    excerpt: "Tallinna loomaaed kutsub loenguõhtule, kus jagatakse teadmisi, kogemusi ja loodusfotosid.",
    href: "https://tallinnzoo.ee/events/loomaaia-loenguohtu-hendrik-relve/",
  },
  {
    day: "14",
    month: "oktoober",
    type: "event",
    title: "Vestlusõhtu karudest ja nende ruumikasutusest",
    excerpt: "Eesti Loodus ja Eesti looduseuurijate selts kutsuvad vestlusõhtule karude ruumikasutusest.",
    href: "https://www.facebook.com/events/1620473682825571",
  },
  {
    day: "15",
    month: "oktoober",
    type: "event",
    title: "Teadmussiirde doktorantuuri foorum",
    excerpt: "Foorum toob kokku ettevõtted, avaliku sektori asutused, erialaliidud ja ülikoolid.",
    href: "https://etag.ee/sundmus/teadmussiirde-doktorantuuri-foorum/",
  },
  {
    day: "15",
    month: "oktoober",
    type: "event",
    title: "Harrastusteaduse võimalused koolis",
    excerpt: "Koolidele sobivaid algatusi tutvustavad Eesti Ornitoloogiaühing, Keskkonnaagentuur ja Tallinna Ülikool.",
    href: "https://miks.ee/opilasele/sundmused/harrastusteaduse-voimalused-koolis/",
  },
  {
    day: "16",
    month: "oktoober",
    type: "event",
    title: "Teaduskonverents „Kuidas läheb Eesti lindudel?“",
    excerpt: "Konverents keskendub Eesti lindude käekäigule ja teadusandmetele.",
    href: "https://www.facebook.com/events/1140222478958912/",
  },
];

const featureLinks = [
  {
    title: "Riiklik ilmaäpp ILM+",
    text: "Jälgi ja vaata ilma riikliku ilmaäpiga ning saa asukohapõhiseid hoiatusi.",
    image: "/assets/feature-weather.png",
    href: "https://keskkonnaagentuur.ee/ilmpluss/",
  },
  {
    title: "Loodusvaatluste äpp",
    text: "Lisa vaatlusi, õpi liike tundma ja aita koguda Eesti looduse kohta paremaid andmeid.",
    image: "/assets/feature-observation.jpg",
    href: "https://loodusveeb.ee/et/themes/nouanded-ja-vabatahtlik-kaasaloomine/loodusvaatluste-nutirakendus",
  },
  {
    title: "Kaardilood",
    text: "Avasta ruumiandmeid lugude ja kaartide kaudu ning näe, kuidas keskkond ajas muutub.",
    image: "/assets/feature-maps.jpg",
    href: `${SOURCE}/et/publikatsioonid?type_of_article%5B47%5D=47`,
  },
];

function formatDate() {
  return new Intl.DateTimeFormat("et-EE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Tallinn",
  }).format(new Date());
}

function ExternalAnchor({ children, className, href, ...props }) {
  const safeHref = safeExternalHref(href);
  return (
    <a {...props} aria-disabled={safeHref ? undefined : true} className={className} href={safeHref || undefined} target={safeHref ? "_blank" : undefined} rel={safeHref ? "noreferrer" : undefined}>
      {children}
    </a>
  );
}

// Two spellings of the same question compare equal, so the results page still
// recognises its own question after the reader retypes it with another case or
// a missing diacritic.
function comparableQuestion(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function SearchForm({ initialValue = "", onSearch, busy, variant = "hero", autoFocus = false, inputRef: providedInputRef, contextQuery = "" }) {
  const listboxId = useId();
  const internalInputRef = useRef(null);
  const inputRef = providedInputRef || internalInputRef;
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState({ query: "", items: [] });
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestionRequestRef = useRef({ id: 0, controller: null });

  useEffect(() => setValue(initialValue), [initialValue]);

  useEffect(() => {
    const query = value.trim();
    suggestionRequestRef.current.controller?.abort();
    const requestId = suggestionRequestRef.current.id + 1;
    if (!shouldFetchRemoteSuggestions(query)) {
      suggestionRequestRef.current = { id: requestId, controller: null };
      setRemoteSuggestions({ query: "", items: [] });
      return undefined;
    }
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
        if (response.ok
          && Array.isArray(data.suggestions)
          && suggestionRequestRef.current.id === requestId) {
          setRemoteSuggestions({ query, items: data.suggestions });
        }
      } catch (error) {
        if (error.name !== "AbortError" && suggestionRequestRef.current.id === requestId) {
          setRemoteSuggestions({ query, items: [] });
        }
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      if (suggestionRequestRef.current.id === requestId) {
        suggestionRequestRef.current = { id: requestId, controller: null };
      }
    };
  }, [value]);

  // On a results page the field carries the question the reader is looking at,
  // so an idle or cleared field offers the reviewed questions that relate to
  // that question instead of the same top-of-list on every page. Typing
  // something else keeps the reviewed filter this field has always used.
  const trimmedValue = value.trim();
  const contextualField = Boolean(contextQuery)
    && (!trimmedValue || comparableQuestion(trimmedValue) === comparableQuestion(contextQuery));
  const suggestions = useMemo(() => {
    if (contextualField) {
      return contextualSuggestions({
        candidates: REVIEWED_SEARCH_SUGGESTIONS,
        query: trimmedValue,
        rootQuery: contextQuery,
        limit: 12,
        allowDefault: false,
      }).map((suggestion) => ({ value: suggestion, count: null }));
    }
    return suggestionsForValue(value, remoteSuggestions, REVIEWED_SEARCH_SUGGESTIONS, 12);
  }, [contextQuery, contextualField, remoteSuggestions, trimmedValue, value]);

  useEffect(() => setActiveIndex(-1), [value, suggestions.length]);

  const chooseSuggestion = (suggestion) => {
    setValue(suggestion.value);
    setFocused(false);
    setActiveIndex(-1);
    onSearch(suggestion.value);
  };

  const submit = (event) => {
    event.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      chooseSuggestion(suggestions[activeIndex]);
      return;
    }
    if (value.trim()) {
      suggestionRequestRef.current.controller?.abort();
      setFocused(false);
      setActiveIndex(-1);
      onSearch(value.trim());
    }
  };

  const handleKeyDown = (event) => {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocused(true);
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocused(true);
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFocused(false);
      setActiveIndex(-1);
    }
  };

  return (
    <form className={`search-form search-form--${variant}`} onSubmit={submit} role="search">
      <div className="search-control">
        <Search aria-hidden="true" className="search-control__leading" size={21} />
        <input
          ref={inputRef}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={focused && suggestions.length ? listboxId : undefined}
          aria-expanded={Boolean(focused && suggestions.length)}
          aria-label="Otsi keskkonnaandmeid"
          autoComplete="off"
          autoFocus={autoFocus}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          onChange={(event) => {
            setValue(event.target.value);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Küsi keskkonnaandmete kohta …"
          role="combobox"
          value={value}
        />
        {value ? (
          <button className="icon-button search-control__clear" onClick={() => {
            setValue("");
            setRemoteSuggestions({ query: "", items: [] });
            inputRef.current?.focus();
          }} type="button" aria-label="Tühjenda otsing">
            <X size={19} />
          </button>
        ) : null}
        <button
          aria-label={busy ? "Otsin" : "Küsi"}
          className="search-submit"
          disabled={busy || !value.trim()}
          type="submit"
        >
          {busy ? <LoaderCircle className="spin" size={19} /> : <Sparkles size={18} />}
          <span>{busy ? "Otsin" : "Küsi"}</span>
        </button>
        {!busy && focused && suggestions.length ? (
          <div className="search-suggestions">
            <div className="search-suggestions__title" id={`${listboxId}-label`}>Soovitatud päringud</div>
            <div aria-labelledby={`${listboxId}-label`} id={listboxId} role="listbox">
              {suggestions.map((suggestion, index) => (
                <button
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "active" : ""}
                  id={`${listboxId}-option-${index}`}
                  key={suggestion.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseSuggestion(suggestion)}
                  role="option"
                  tabIndex={-1}
                  type="button"
                >
                  <Search size={16} />
                  <span>{suggestion.value}</span>
                  {suggestion.count ? <small>{suggestion.count} vastet</small> : null}
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {variant === "hero" ? (
        <p className="search-form__hint">Vastus esmalt, kasutatud ametlikud allikad kohe järel</p>
      ) : null}
    </form>
  );
}

function Header({ compact = false, onRevealSearch }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [megaMenu, setMegaMenu] = useState(null);

  useEffect(() => {
    document.body.classList.toggle("menu-locked", menuOpen);
    return () => document.body.classList.remove("menu-locked");
  }, [menuOpen]);

  const toggleMega = (menu) => setMegaMenu((current) => (current === menu ? null : menu));

  if (compact) {
    return (
      <header className="site-header site-header--compact">
        <a className="skip-link" href="#main-content">Liigu edasi põhisisu juurde</a>
        <div className="brand-bar">
          <div className="shell brand-bar__inner">
            <a className="brand" href="/" aria-label="Keskkonnaportaali praktika avaleht">
              <img src="/assets/logo-desktop.svg" alt="Keskkonnaportaal" />
            </a>
            <span className="practice-pill">Praktikaprojekt</span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">Liigu edasi põhisisu juurde</a>
      <div className="quick-bar">
        <div className="shell quick-bar__inner">
          <div className="quick-links">
            <ExternalAnchor href="https://register.keskkonnaportaal.ee/register">Andmed ja kaart <ExternalLink size={13} /></ExternalAnchor>
            <span aria-hidden="true">|</span>
            <ExternalAnchor href="https://kliimaatlas.keskkonnaportaal.ee/">Kliimaatlas <ExternalLink size={13} /></ExternalAnchor>
            <span aria-hidden="true">|</span>
            <ExternalAnchor href="https://avaandmed.keskkonnaportaal.ee/dhs/Active">Avaandmete failihoidla <ExternalLink size={13} /></ExternalAnchor>
          </div>
          <div className="quick-tools">
            <span><CalendarDays size={15} /> {formatDate()}</span>
            <span><CloudSun size={17} /> Ilm täna</span>
            <a href={`${SOURCE}/et/ligip%C3%A4%C3%A4setavus`}><CircleHelp size={15} /> Algse portaali ligipääsetavus</a>
            <button type="button"><Link2 size={15} /> Lingid <ChevronDown size={13} /></button>
            <button type="button">ET <ChevronDown size={13} /></button>
          </div>
        </div>
      </div>

      <div className="brand-bar">
        <div className="shell brand-bar__inner">
          <a className="brand" href="/" aria-label="Keskkonnaportaali praktika avaleht">
            <img src="/assets/logo-desktop.svg" alt="Keskkonnaportaal" />
          </a>
          <span className="practice-pill">Praktikaprojekt</span>
          <nav className="utility-nav" aria-label="Abilingid">
            <a href={`${SOURCE}/et/sitemap`}>Sisukaart</a>
            <a href={`${SOURCE}/et/portaalist`}>Portaalist</a>
            <a href={`${SOURCE}/et/abi`}><CircleHelp size={16} /> Abi</a>
          </nav>
          <div className="mobile-actions">
            <button className="header-icon" onClick={onRevealSearch} type="button" aria-label="Mine otsingusse">
              <Search size={22} />
            </button>
            <button className="header-icon header-icon--menu" onClick={() => setMenuOpen((open) => !open)} type="button" aria-expanded={menuOpen} aria-label="Ava menüü">
              {menuOpen ? <X size={24} /> : <Menu size={25} />}
            </button>
          </div>
        </div>
      </div>

      <nav className="main-nav" aria-label="Põhinavigatsioon">
        <div className="shell main-nav__inner">
          {navItems.map((item) =>
            item.menu ? (
              <button
                className={megaMenu === item.menu ? "active" : ""}
                key={item.label}
                onClick={() => toggleMega(item.menu)}
                type="button"
                aria-expanded={megaMenu === item.menu}
              >
                {item.label} <ChevronDown size={15} />
              </button>
            ) : (
              <a key={item.label} href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noreferrer" : undefined}>
                {item.label}{item.external ? <ExternalLink size={13} /> : null}
              </a>
            ),
          )}
        </div>
      </nav>

      {megaMenu ? (
        <div className={`mega-menu mega-menu--${megaMenu}`}>
          <div className="shell mega-menu__inner">
            <div>
              <span className="eyebrow">Sirvi portaali</span>
              <h2>{megaMenus[megaMenu].title}</h2>
            </div>
            <div className="mega-menu__groups">
              {megaMenus[megaMenu].groups.map((group, index) => (
                <div key={index}>
                  {group.map((label) => (
                    <a key={label} href={`${SOURCE}/et/search?search_api_fulltext=${encodeURIComponent(label)}`}>
                      {label}<ChevronRight size={16} />
                    </a>
                  ))}
                </div>
              ))}
            </div>
            <button className="icon-button mega-menu__close" onClick={() => setMegaMenu(null)} type="button" aria-label="Sulge menüü"><X /></button>
          </div>
        </div>
      ) : null}

      <div className={`mobile-drawer ${menuOpen ? "mobile-drawer--open" : ""}`} aria-hidden={!menuOpen}>
        <div className="mobile-drawer__top">
          <span>Menüü</span>
          <button onClick={() => setMenuOpen(false)} type="button" aria-label="Sulge menüü"><X size={24} /></button>
        </div>
        <nav aria-label="Mobiilimenüü">
          {navItems.map((item) => (
            <a key={item.label} href={item.href || `${SOURCE}/et/search?search_api_fulltext=${encodeURIComponent(item.label)}`}>
              <span>{item.label}</span>{item.menu ? <span className="drawer-plus">+</span> : <ChevronRight size={18} />}
            </a>
          ))}
        </nav>
        <div className="mobile-drawer__secondary">
          <a href={`${SOURCE}/et/ligip%C3%A4%C3%A4setavus`}>Algse portaali ligipääsetavus</a>
          <a href={`${SOURCE}/et/sitemap`}>Algse portaali sisukaart</a>
          <a href={`${SOURCE}/et/portaalist`}>Algse portaali tutvustus</a>
          <a href={`${SOURCE}/et/abi`}>Algse portaali abi</a>
        </div>
        <div className="mobile-drawer__footer">
          <span>Keel</span><strong>ET</strong>
        </div>
      </div>
      {menuOpen ? <button className="drawer-backdrop" onClick={() => setMenuOpen(false)} aria-label="Sulge menüü" type="button" /> : null}
    </header>
  );
}

function Hero({ onSearch, busy, searchInputRef }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__shade" />
      <div className="shell hero__content">
        <p className="hero__practice"><Sparkles size={16} /> Uus praktikaversioon</p>
        <h1 id="hero-title">Eesti keskkonna andmete portaal</h1>
        <p className="hero__subtitle">Üks värav kõikidele keskkonnaandmetele</p>
        <SearchForm busy={busy} inputRef={searchInputRef} onSearch={onSearch} />
      </div>
    </section>
  );
}

function PortalTiles() {
  return (
    <section className="shell portal-tiles" aria-label="Andmeväravad">
      {portalTiles.map((tile) => (
        <ExternalAnchor className="portal-tile" href={tile.href} key={tile.label}>
          <img src={tile.image} alt="" />
          <span className="portal-tile__shade" />
          <span className="portal-tile__kicker">{tile.kicker}</span>
          <strong>{tile.label}</strong>
        </ExternalAnchor>
      ))}
    </section>
  );
}

function SectionHeading({ children, href, linkLabel = "Vaata kõiki" }) {
  return (
    <div className="section-heading">
      <h2>{children}</h2>
      {href ? <ExternalAnchor href={href}>{linkLabel}<ChevronRight size={17} /></ExternalAnchor> : null}
    </div>
  );
}

function CurrentContent() {
  return (
    <section className="shell current-grid">
      <div className="current-featured">
        <SectionHeading>Päevakajaline</SectionHeading>
        <div className="featured-grid">
          {currentCards.map((card) => (
            <article className="featured-card" key={card.title}>
              <ExternalAnchor href={card.href} className="featured-card__image" aria-label={`Ava artikkel: ${card.title}`}><img src={card.image} alt="" /></ExternalAnchor>
              <div className="tag-row">{card.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <ExternalAnchor href={card.href}><h3>{card.title}</h3></ExternalAnchor>
              <p className="meta">{card.meta}</p>
              <p>{card.excerpt}</p>
              <ExternalAnchor className="text-link" href={card.href}>Loe edasi <ChevronRight size={17} /></ExternalAnchor>
            </article>
          ))}
        </div>
      </div>
      <aside className="news-list">
        <SectionHeading href={`${SOURCE}/et/uudised`}>Hiljutised uudised</SectionHeading>
        {news.map((item) => (
          <article className="news-item" key={item.title}>
            <ExternalAnchor href={item.href} aria-label={`Ava uudis: ${item.title}`}><img src={item.image} alt="" /></ExternalAnchor>
            <div>
              <span className="tag">{item.tag}</span>
              <ExternalAnchor href={item.href}><h3>{item.title} <ExternalLink size={13} /></h3></ExternalAnchor>
              <p>{item.publisher} <span aria-hidden="true">|</span> {item.date}</p>
            </div>
          </article>
        ))}
      </aside>
    </section>
  );
}

function TerrapointSection() {
  return (
    <section className="terrapoint-section" aria-labelledby="terrapoint-title">
      <div className="shell terrapoint-layout">
        <div className="terrapoint-copy">
          <span className="eyebrow">Terrapointi täisrakendus</span>
          <h2 id="terrapoint-title">Kogu Terrapoint, otse portaali sees</h2>
          <p>
            Allpool töötab sama Terrapointi kasutajaliides, kaart ja avalik API nagu terrapoint.ee lehel.
            Otsi aadressi või katastritunnust ning vaata kinnistu, metsa ja piirangute koondandmeid.
          </p>
        </div>
        <div className="terrapoint-actions">
          <span><CheckCircle2 size={18} /> Päris Terrapointi UI ja API</span>
          <span><CheckCircle2 size={18} /> Kõik funktsioonid ühes suures vaates</span>
          <ExternalAnchor className="outline-button" href="https://terrapoint.ee/">Ava uuel lehel <ExternalLink size={16} /></ExternalAnchor>
        </div>
      </div>
      <div className="terrapoint-frame-wrap">
        <div className="frame-label"><span /> terrapoint.ee · manustatud täisvaade</div>
        <iframe
          className="terrapoint-frame"
          data-testid="terrapoint-embed"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-forms allow-same-origin allow-scripts"
          src="https://terrapoint.ee/"
          title="Terrapointi täisrakendus"
        />
      </div>
    </section>
  );
}

function EventsSection() {
  return (
    <section className="shell events-layout">
      <div>
        <SectionHeading href={`${SOURCE}/et/syndmuste_kalender`}>Sündmuste kalender</SectionHeading>
        <div className="event-list">
          {events.map((event) => (
            <article className={`event-card event-card--${event.type}`} key={`${event.day}-${event.title}`}>
              <div className="event-date"><strong>{event.day}</strong><span>{event.month}</span></div>
              <div className="event-body"><h3>{event.title}</h3><p>{event.excerpt}</p></div>
              <ExternalAnchor href={event.href}>Loe lisa <ExternalLink size={13} /></ExternalAnchor>
            </article>
          ))}
        </div>
        <div className="event-legend">
          <span><i className="legend-dot legend-dot--event" /> Üritused</span>
          <span><i className="legend-dot legend-dot--notice" /> Avalikustamised</span>
          <span><i className="legend-dot legend-dot--day" /> Tähtpäevad</span>
        </div>
      </div>
      <aside className="month-card">
        <SectionHeading>Kuu sündmus</SectionHeading>
        <div className="month-card__body">
          <h3>Euroopa Liidu ökomärgise teadlikkuse suurendamise tegevused 2026</h3>
          <img className="month-card__image" src="/assets/portal-ecolabel.png" alt="ELi ökomärgis – usaldusväärne valik" loading="lazy" />
          <p className="meta">01.–30. oktoober 2026</p>
          <p>Oktoober on Euroopa Liidu ökomärgise kuu. ELi ökomärgis aitab üles leida tooted, mis on paremad nii loodusele kui ka meie tervisele.</p>
          <ExternalAnchor className="text-link" href={`${SOURCE}/et/events/euroopa-liidu-okomargise-teadlikkuse-suurendamise-tegevused-2026`}>Loe edasi <ChevronRight size={17} /></ExternalAnchor>
        </div>
      </aside>
    </section>
  );
}

function FeatureLinks() {
  return (
    <section className="feature-links" aria-label="Kasulikud rakendused">
      {featureLinks.map((item) => (
        <ExternalAnchor className="feature-link" href={item.href} key={item.title}>
          <img src={item.image} alt="" />
          <span className="feature-link__shade" />
          <span className="feature-link__content"><small>{item.text}</small><strong>{item.title}</strong></span>
        </ExternalAnchor>
      ))}
    </section>
  );
}

function Home({ onSearch, busy, searchInputRef }) {
  return (
    <main id="main-content">
      <Hero busy={busy} onSearch={onSearch} searchInputRef={searchInputRef} />
      <PortalTiles />
      <CurrentContent />
      <TerrapointSection />
      <EventsSection />
      <FeatureLinks />
    </main>
  );
}

function citationSourceLabel(source) {
  return sourceOrganizationLabel(source) || "Allikas";
}

// Shown once the server answers from a newer build than this page: the
// page keeps working, but new answer parts (such as a chart kind it does not
// know) only render after a reload.
function UpdateNotice() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const onMismatch = () => setAvailable(true);
    window.addEventListener(APP_BUILD_MISMATCH_EVENT, onMismatch);
    return () => window.removeEventListener(APP_BUILD_MISMATCH_EVENT, onMismatch);
  }, []);
  if (!available) return null;
  return (
    <div className="app-update" role="status">
      <p>Otsingust on uus versioon. Laadi leht uuesti, et näha vastuse kõiki osi.</p>
      <button onClick={() => window.location.reload()} type="button">Laadi uuesti</button>
    </div>
  );
}

function Citation({ number, sources = [] }) {
  const source = sources.find((candidate) => Number(candidate.citation) === Number(number));
  const label = citationSourceLabel(source);
  const sourceTitle = source?.title || label;
  return (
    <ExternalAnchor
      aria-label={`Allikas ${number}: ${sourceTitle}${safeExternalHref(source?.url) ? " (avaneb uuel vahelehel)" : ""}`}
      className="citation"
      style={{ "--citation-color": citationColor(number) }}
      href={source?.url}
      title={source
        ? [
          source.title,
          sourceDateMeta(source),
          source.evidenceExcerpt ? `Tõend: ${source.evidenceExcerpt.slice(0, 320)}` : "",
          source.locator ? `Vaata: ${source.locator}` : "",
        ].filter(Boolean).join(" — ")
        : `Allikas ${number}`}
    >
      <span>{number}</span><span>{label}</span>
    </ExternalAnchor>
  );
}

export function SourceLegend({ sources = [], answer, chart }) {
  if (!sources.length) return null;
  const latest = latestSourceUpdates(sources);
  return (
    <>
    <ul className="source-legend" aria-label="Allikate värvid ja kuupäevad">
      {sources.map((source) => {
        const row = (
          <>
            <span className="source-legend__number">{source.citation}</span>
            <span title={source.title}>{citationSourceLabel(source)} <span className="source-legend__date">{sourceDateMeta({ updated: source.updated, published: source.published, dataYear: source.dataYear, dataAsOf: source.dataAsOf })}</span>
              {latest.includes(source.citation) ? <strong title="Uusim teadaolev lehe muutmise kuupäev nende allikate seas; see ei ole andmeaasta. Teadmata kuupäevaga allikaid ei võrreldud."> · Uusim leheuuendus</strong> : null}
            </span>
          </>
        );
        const safeHref = safeExternalHref(source.url);
        return (
          <li key={source.citation} style={{ "--citation-color": citationColor(source.citation) }}>
            {safeHref ? (
              <ExternalAnchor
                aria-label={`Allikas ${source.citation}: ${source.title || citationSourceLabel(source)} — ${sourceDateMeta(source)} (avaneb uuel vahelehel)`}
                className="source-legend__link"
                href={safeHref}
              >
                {row}
                <ExternalLink aria-hidden="true" size={12} />
              </ExternalAnchor>
            ) : row}
          </li>
        );
      })}
    </ul>
    </>
  );
}

function SourceActions({ sources = [] }) {
  const actions = sources
    .filter((source) => safeExternalHref(source?.actionUrl) && String(source?.actionLabel || "").trim())
    .filter((source, index, items) => items.findIndex((item) => item.actionUrl === source.actionUrl) === index);
  if (!actions.length) return null;
  return (
    <div className="answer-actions" aria-label="Ametliku allika toimingud">
      {actions.map((source) => (
        <ExternalAnchor href={source.actionUrl} key={source.actionUrl}>
          {source.actionLabel}<ExternalLink aria-hidden="true" size={15} />
        </ExternalAnchor>
      ))}
    </div>
  );
}

function isRedundantAnswerNote(note) {
  return String(note || "").replace(/\s+/gu, " ").trim()
    === "Vastuses kasutatakse ainult kuvatud ametlikke allikaid. Õigusliku või asukohapõhise otsuse puhul kontrolli alati algallikat.";
}

// One note renderer for the search page and the chat panel.
function AnswerNote({ note }) {
  if (!note || isRedundantAnswerNote(note)) return null;
  return (
    <div className="answer-note"><ShieldCheck size={18} /><p>{note}</p></div>
  );
}

function sourceTierLabel(value) {
  if (value === "reviewed") return "Kontrollitud";
  if (value === "official") return "Ametlik";
  if (value === "supplementary") return "Taustallikas";
  return "Veebiallikas";
}

function BroadSearchResults({ listing, busy, error, onPage, onFilters, headingRef, interactive = true, onSearch = null, aiUnavailable = false, noAnswer = false, answerCited = false, unavailable = false, query = "" }) {
  if (!listing && !busy) return null;
  const total = Number(listing?.total || 0);
  const distinctTotal = Number(listing?.distinctTotal || total);
  const current = Number(listing?.page || 1);
  const pageCount = Number(listing?.pageCount || 0);
  const pages = [...new Set([1, current - 1, current, current + 1, pageCount])]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((left, right) => left - right);
  const filters = clientSearchFilters(listing?.appliedFilters);
  const categories = Array.isArray(listing?.facets?.categories) ? listing.facets.categories : [];
  const years = Array.isArray(listing?.facets?.years) ? listing.facets.years : [];
  const hasActiveFilters = filters.source !== "all" || filters.category || filters.year || filters.sort !== "relevance";
  // A dead end still has somewhere to go, but only where the reader's own
  // question leads: the reviewed questions that relate to it, and nothing at all
  // when none of them does.
  const emptyStateSuggestions = typeof onSearch === "function" && !busy && !error && !unavailable
    && total === 0 && !hasActiveFilters
    ? contextualSuggestions({
      candidates: REVIEWED_SEARCH_SUGGESTIONS,
      query,
      rootQuery: query,
      limit: 3,
      allowDefault: false,
    })
    : [];
  const changeFilter = (key, value) => onFilters({
    ...filters,
    [key]: key === "year" ? (value ? Number(value) : null) : value,
  });
  return (
    <section className="broad-results" aria-labelledby="broad-results-title" aria-busy={busy}>
      <div className="broad-results__heading">
        <div>
          <span className="broad-results__eyebrow">Lai portaaliotsing</span>
          <h2 id="broad-results-title" ref={headingRef} tabIndex={-1}>Otsingutulemused</h2>
          <p>{unavailable
            ? "Tulemuste loendit ei saanud laadida. Vastusekaart jääb alles, kuid allikate loend vajab uut päringut."
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
              ? `Leidsin ${total.toLocaleString("et-EE")} vastet ja ühendasin need ${distinctTotal.toLocaleString("et-EE")} eri leheks. Ülal olev koondvastus kasutab sama filtreeritud tulemuste hulka.`
              : "Ülal olev koondvastus põhineb sama päringu filtreeritud ja järjestatud tulemustel."}</p>
        </div>
        {unavailable ? null : <strong>{total.toLocaleString("et-EE")}</strong>}
      </div>
      <div className="search-filters" aria-label="Otsingutulemuste filtrid" role="group">
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
      </div>
      {error ? <div className="broad-results__error" role="alert"><span>{error}</span><button className="error-retry" disabled={!interactive || busy} onClick={() => onPage(current)} type="button">Proovi uuesti</button></div> : null}
      {busy ? <div className="broad-results__loading" role="status"><LoaderCircle className="spin" size={20} /> Laadin tulemusi …</div> : null}
      {!busy && !error && listing?.items?.length ? (
        <div className="broad-results__list">
          {listing.items.map((item) => (
            <ExternalAnchor className="broad-result" href={item.url} key={item.id}>
              <div className="broad-result__meta">
                <span className={`source-tier source-tier--${item.sourceTier || "other"}`}>{sourceTierLabel(item.sourceTier)}</span>
                {sourceDateMeta(item) ? <span>{sourceDateMeta(item)}</span> : null}
              </div>
              <h3>{item.title}<ExternalLink size={15} /></h3>
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
        : "Laiast indeksist vasteid ei leitud."}</p>{emptyStateSuggestions.length ? <p className="broad-results__suggest">Proovi näiteks: {emptyStateSuggestions.map((example) => <button disabled={!interactive || busy} key={example} onClick={() => onSearch(example)} type="button">{example}</button>)}</p> : null}</> : null}
      {pageCount > 1 ? (
        <nav className="results-pagination" aria-label="Otsingutulemuste lehed">
          <button disabled={!interactive || busy || current <= 1} onClick={() => onPage(current - 1)} type="button"><ArrowLeft size={15} /> Eelmine</button>
          <div>
            {pages.map((page, index) => (
              <span key={page}>
                {index > 0 && page - pages[index - 1] > 1 ? <i aria-hidden="true">…</i> : null}
                <button aria-current={page === current ? "page" : undefined} disabled={!interactive || busy || page === current} onClick={() => onPage(page)} type="button">{page}</button>
              </span>
            ))}
          </div>
          <button disabled={!interactive || busy || current >= pageCount} onClick={() => onPage(current + 1)} type="button">Järgmine <ArrowRight size={15} /></button>
        </nav>
      ) : null}
    </section>
  );
}

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

function SearchResults({ result, query, busy, error, onSearch, onHome, previewListing, listingUnavailable = false }) {
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
  const [waitingMs, setWaitingMs] = useState(0);
  const [followUpWaitingMs, setFollowUpWaitingMs] = useState(0);
  const headingRef = useRef(null);
  const listingHeadingRef = useRef(null);
  const followUpInputRef = useRef(null);
  const listingRequestRef = useRef({ id: 0, controller: null });
  const followUpRequestRef = useRef({ id: 0, controller: null });
  useEffect(() => {
    listingRequestRef.current.controller?.abort();
    listingRequestRef.current = { id: listingRequestRef.current.id + 1, controller: null };
    setListing(result?.searchResults || previewListing || null);
    setListingBusy(false);
    setListingError("");
    return () => listingRequestRef.current.controller?.abort();
  }, [previewListing, result?.query, result?.searchResults]);
  useEffect(() => {
    followUpRequestRef.current.controller?.abort();
    followUpRequestRef.current = { id: followUpRequestRef.current.id + 1, controller: null };
    setFollowUps([]);
    setFollowUpValue("");
    setFollowUpBusy(false);
    setPendingFollowUpQuestion("");
    setFollowUpError("");
    return () => followUpRequestRef.current.controller?.abort();
  }, [result?.generatedAt, result?.query]);
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
  }, [busy, hasResult, result?.answer?.title, result?.query]);
  useEffect(() => {
    if (followUpBusy || !followUps.length) return;
    const latestHeading = document.getElementById(`followup-${followUps.length}-title`);
    latestHeading?.focus({ preventScroll: true });
    // The follow-up answer renders above the "Küsi veel" section: bring it
    // into view so a related-question click visibly leads to its answer.
    latestHeading?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [followUpBusy, followUps.length]);
  const appliedFilters = clientSearchFilters(listing?.appliedFilters || result?.searchResults?.appliedFilters);
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
  // A fallback card is a status, not the answer. When the model wording is
  // missing the ranked list leads, because that list is the product the reader
  // came for and it already survived the failure.
  const loadListingPage = async (page) => {
    listingRequestRef.current.controller?.abort();
    const id = listingRequestRef.current.id + 1;
    const controller = new AbortController();
    listingRequestRef.current = { id, controller };
    setListingBusy(true);
    setListingError("");
    try {
      const response = await fetch("/api/search/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchRequestPayload(query, appliedFilters, page, listing?.pageSize || 12)),
        signal: controller.signal,
      });
      noteServerBuild(response);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Tulemusi ei saanud laadida.");
      if (listingRequestRef.current.id !== id) return;
      setListing(data);
      window.requestAnimationFrame(() => {
        listingHeadingRef.current?.focus({ preventScroll: true });
        listingHeadingRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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
      // Filters and pagination belong to the listing's own request, not to the
      // model answer: they stay usable while a slow answer is still running.
      interactive={!listingBusy}
      listing={visibleListing}
      onFilters={applyFilters}
      onPage={loadListingPage}
      onSearch={onSearch}
      aiUnavailable={wordingMissing}
      noAnswer={noAnswer}
      answerCited={Boolean(result?.answer?.introCitations?.length)}
      unavailable={listingUnavailable}
      query={query}
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
        setFollowUps((current) => [...current, { question: cleanQuestion, result: null, listing: latestListing }].slice(0, 4));
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
            onFilters={applyFilters}
            onPage={loadListingPage}
            onSearch={onSearch}
            aiUnavailable={wordingMissing}
            noAnswer={noAnswer}
            unavailable={listingUnavailable}
            query={query}
          />
        ) : null}
        {error ? <div className="search-error" role="alert"><CircleHelp size={22} /><div><strong>Otsingut ei saanud lõpetada</strong><p>{error}</p><button className="error-retry" disabled={busy} onClick={() => onSearch(query, { filters: appliedFilters })} type="button">Proovi uuesti</button></div></div> : null}
        {hasResult ? (
          <>
            {listingLeads ? broadResults : null}
            <article className="answer-card">
              {busy ? <div className="answer-progress"><LoaderCircle className="spin" size={16} /> Kontrollin veel AI-sõnastust …</div> : null}
              <div className="answer-label"><Sparkles size={17} /><span>{result.answer.eyebrow || "AI koondvastus"}</span></div>
              <h1 ref={headingRef} tabIndex={-1}>{answerHeading(result, query)}</h1>
              <p className="answer-intro">
                {result.answer.intro}{" "}
                {(result.answer.introCitations || []).map((citation) => <Citation key={citation} number={citation} sources={result.sources} />)}
              </p>
              {result.chart ? <AnswerChart chart={result.chart} citation={<Citation number={result.chart.citation} sources={result.sources} />} sourceDiffers={chartSourceDiffers(result.answer, result.chart, result.sources)} key={`${result.chart.title}-${result.chart.series.map((series) => series.id).join("|")}`} /> : null}
              <div className="answer-parts">
                {(result.answer.parts || []).map((part, index) => (
                  <section key={index}>
                    {part.title ? <h2>{part.title}</h2> : null}
                    <p>{part.text} {(part.citations || []).map((citation) => <Citation key={citation} number={citation} sources={result.sources} />)}</p>
                  </section>
                ))}
              </div>
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
                        <section className="followup-turn" key={`${turn.question}-${turnIndex}`}>
                          <div className="followup-question"><span>Teie</span><p>{turn.question}</p></div>
                          {turnListing}
                          <div className="followup-answer">
                            <p className="followup-status" role="status">Koondvastust ei saanud koostada. Proovi sama küsimust uuesti.</p>
                          </div>
                        </section>
                      );
                    }
                    return (
                      <section className="followup-turn" key={`${turn.question}-${turnIndex}`}>
                        <div className="followup-question"><span>Teie</span><p>{turn.question}</p></div>
                        {noWording ? turnListing : null}
                        <div className="followup-answer">
                          <span>{noWording ? turnAnswer.eyebrow || "AI koondvastus" : "Koondvastus"}</span>
                          <h2 id={`followup-${turnIndex + 1}-title`} tabIndex={-1}>{answerHeading(turn.result, turn.question)}</h2>
                          <p>{turnAnswer.intro}{" "}{(turnAnswer.introCitations || []).map((citation) => <Citation key={citation} number={citation} sources={turn.result.sources} />)}</p>
                          {turn.result.chart ? <AnswerChart chart={turn.result.chart} citation={<Citation number={turn.result.chart.citation} sources={turn.result.sources} />} sourceDiffers={chartSourceDiffers(turnAnswer, turn.result.chart, turn.result.sources)} key={`${turn.result.chart.title}-${turn.result.chart.series.map((series) => series.id).join("|")}`} /> : null}
                          {(turnAnswer.parts || []).map((part, partIndex) => (
                            <p key={partIndex}>{part.text}{" "}{(part.citations || []).map((citation) => <Citation key={citation} number={citation} sources={turn.result.sources} />)}</p>
                          ))}
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
                      placeholder={followUps.length >= 4 ? "Alusta uue otsinguga, et teemat jätkata" : "Näiteks: mida see viimase viie aasta jooksul tähendab?"}
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
                <p>Vali küsimus—otsin sellele uued allikad ja seon vastuse praeguse teemaga.</p>
                <div>{relatedQuestions.map((item) => <button disabled={busy || followUpBusy || followUps.length >= 4} key={item} onClick={() => askFollowUp(item)} type="button">{item}<ArrowRight size={16} /></button>)}</div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

// This site is a practice project. It may not present another organisation's
// accessibility statement or contact channel as its own, and it must not claim
// an official conformance assessment that nobody performed.
function AccessibilityDisclosure() {
  return (
    <details className="footer-privacy" id="ligipaasetavus">
      <summary>Ligipääsetavus ja tagasiside</summary>
      <p>
        See leht on praktikaprojekt, mitte Keskkonnaportaal ega mõne riigiasutuse ametlik teenus.
        Leht on ehitatud ligipääsetavuse põhimõtteid järgides: klaviatuuriga navigeerimine, nähtav
        fookus, sisu loogiline järjekord, ekraanilugeja teated otsingu olekust ja liikumise
        vähendamise eelistus. Lehte ei ole ametlikult auditeeritud ega vastavushinnatud, seega ei
        väida see leht vastavust ühelegi ligipääsetavuse standardile.
      </p>
      <p>
        Puudusest või takistusest teata praktikaprojekti avalikus
        {" "}<ExternalAnchor href="https://github.com/AARenor/keskkonnaportaali-praktika/issues">GitHubi vearaportis</ExternalAnchor>.
        Sinna kirjutamiseks on vaja GitHubi sisselogimist ja kõik raportid on avalikud, seega ära
        lisa isikuandmeid ega konfidentsiaalset teavet. See kanal ei ole riigiasutuse ametlik
        ligipääsetavuse teade ega ametlik kontakt algse portaali haldajaga. Algse keskkonnaportaali
        enda ligipääsetavusinfo asub
        {" "}<ExternalAnchor href={`${SOURCE}/et/ligip%C3%A4%C3%A4setavus`}>algse portaali lehel</ExternalAnchor>.
      </p>
    </details>
  );
}

function PrivacyDisclosure() {
  return (
    <details className="footer-privacy" id="otsingu-privaatsus">
      <summary>Otsingu ja AI-vastuse privaatsus</summary>
      <p>
        Vastuse koostamiseks töötleb OpenAI GPT-6-Luna autenditud serveripoolse Codex gateway kaudu otsingu teksti, kuni kümmet päringu järgi valitud avaliku allika väljavõtet (kokku kuni 36 000 märki) ja jätkuküsimuse korral kuni 1 400 märki varasemate küsimuste konteksti. IP-aadressi, küpsiseid, brauseri mandaate, serverisaladusi ega kogu andmekogu mudeli sisendile ei lisata. Praktikaportaal ei säilita toorpäringut oma otsingu- või vahemälutabelis. Ära sisesta otsingusse tundlikke isikuandmeid.
      </p>
      <p>
        OpenAI Codex sisselogimine ja autentimine jäävad serveri auth brokerisse ning gateway'sse, mitte brauserisse. Teenusepakkuja ja gateway logimise, säilitamise ning mudelitreeningu tingimused tuleb enne ametlikku kasutuselevõttu eraldi kinnitada. <ExternalAnchor href="https://openai.com/policies/privacy-policy/">Vaata OpenAI privaatsustingimusi</ExternalAnchor>.
      </p>
      <p>
        Mudelipäring kasutab seadet <code>store: false</code> ja Agents SDK tracing on keelatud. Need piiravad rakendusepoolset Responses API oleku ja trace'i talletamist, kuid ei tõenda teenusepakkuja ega gateway logimise puudumist. Välise teenuse logid võivad sisaldada saadetud küsimust ja vastust; tingimused tuleb kehtiva konto ja gateway poliitika alusel üle kontrollida.
      </p>
    </details>
  );
}

function Footer({ compact = false }) {
  if (compact) {
    return (
      <footer className="site-footer site-footer--compact">
        <div className="shell"><span>Keskkonnaportaali praktikaprojekt</span><a href="/docs">Juhendid</a><span>Kontrolli olulist infot algallikast</span></div>
        <div className="shell"><PrivacyDisclosure /><AccessibilityDisclosure /></div>
      </footer>
    );
  }
  return (
    <footer className="site-footer">
      <div className="shell footer-main">
        <div><img src="/assets/logo-desktop.svg" alt="Keskkonnaportaal" /><p>Praktikaprojekt, mis demonstreerib täiustatud allikapõhist otsingut ja Terrapointi integratsiooni.</p></div>
        <div><h2>Algne keskkonnaportaal</h2><a href={`${SOURCE}/et/portaalist`}>Portaalist</a><a href={`${SOURCE}/et/kontakt`}>Kontakt (algne portaal)</a><a href={`${SOURCE}/et/abi`}>Abi</a><a href="/docs">Juhendid</a></div>
        <div><h2>Andmed</h2><a href="https://register.keskkonnaportaal.ee/register">Andmed ja kaart</a><a href={`${SOURCE}/et/avaandmed`}>Avaandmed</a><a href="https://terrapoint.ee/">Terrapoint</a></div>
        <div><h2>Jälgi</h2><div className="socials"><a aria-label="Facebook" href="https://www.facebook.com/Keskkonnaagentuur"><Facebook /></a><a aria-label="Instagram" href="https://www.instagram.com/keskkonnaagentuur/"><Instagram /></a><a aria-label="YouTube" href="https://www.youtube.com/channel/UCyAMWZVg2a7GNIX2m__pvhA"><Youtube /></a></div></div>
      </div>
      <div className="shell"><PrivacyDisclosure /><AccessibilityDisclosure /></div>
      <div className="footer-bottom"><div className="shell"><span>© 2026 Keskkonnaportaali praktikaprojekt</span><span>Ei ole Keskkonnaportaali ametlik tootmiskeskkond</span></div></div>
    </footer>
  );
}

function TerrapointEmbed() {
  const [query, setQuery] = useState("Pärnu mnt 10");
  const [addresses, setAddresses] = useState([]);
  const [parcel, setParcel] = useState(null);
  const [stage, setStage] = useState("idle");
  const [message, setMessage] = useState("");
  const inputRef = useRef(null);

  const findAddresses = async (event) => {
    event?.preventDefault();
    if (!query.trim()) return;
    setStage("address-loading");
    setMessage("");
    setParcel(null);
    try {
      const response = await fetch(`/api/terrapoint/address?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Aadressiotsing ebaõnnestus.");
      setAddresses(Array.isArray(data.results) ? data.results : []);
      setStage("addresses");
      if (!data.results?.length) setMessage("Vasteid ei leitud. Proovi täpsemat aadressi või katastritunnust.");
    } catch (error) {
      setStage("error");
      setMessage(error.message);
    }
  };

  const loadParcel = async (item) => {
    setStage("parcel-loading");
    setMessage("");
    try {
      const response = await fetch(`/api/terrapoint/parcel/${encodeURIComponent(item.katastri_nr)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kinnistu andmeid ei saanud laadida.");
      setParcel(data);
      setStage("parcel");
    } catch (error) {
      setStage("error");
      setMessage(error.message);
    }
  };

  const cadastro = parcel?.kataster;
  const centroid = cadastro?.centroid;
  const mapUrl = centroid
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${centroid.longitude - 0.006}%2C${centroid.latitude - 0.004}%2C${centroid.longitude + 0.006}%2C${centroid.latitude + 0.004}&layer=mapnik&marker=${centroid.latitude}%2C${centroid.longitude}`
    : null;

  return (
    <main className="tp-embed">
      <header className="tp-header">
        <div><MapPinned size={23} /><strong>terrapoint</strong></div>
        <span>Kinnistu kiirvaade</span>
      </header>
      <div className="tp-content">
        <form className="tp-search" onSubmit={findAddresses}>
          <label htmlFor="tp-query">Aadress või kohanimi</label>
          <div><Search size={18} /><input id="tp-query" ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Näiteks Pärnu mnt 10" /><button disabled={stage.endsWith("loading")} type="submit">Otsi</button></div>
        </form>

        {stage === "idle" ? (
          <div className="tp-empty"><Map size={42} /><h1>Leia kinnistu andmed</h1><p>Alusta aadressist, vali sobiv katastriüksus ja vaata Terrapointi koondandmeid.</p></div>
        ) : null}

        {stage.endsWith("loading") ? <div className="tp-loading"><LoaderCircle className="spin" /><span>{stage === "address-loading" ? "Otsin aadresse …" : "Laadin kinnistu andmeid …"}</span></div> : null}

        {message ? <div className="tp-message" role="alert"><CircleHelp size={20} /><span>{message}</span><button onClick={() => findAddresses()} type="button">Proovi uuesti</button></div> : null}

        {stage === "addresses" && addresses.length ? (
          <section className="tp-results"><div className="tp-results__heading"><h1>Vali katastriüksus</h1><span>{addresses.length} vastet</span></div>{addresses.map((item) => (
            <button key={`${item.katastri_nr}-${item.aadress}`} onClick={() => loadParcel(item)} type="button"><MapPinned size={19} /><span><strong>{item.aadress}</strong><small>{item.asula}, {item.vald}, {item.maakond}</small><code>{item.katastri_nr}</code></span><ChevronRight size={18} /></button>
          ))}</section>
        ) : null}

        {stage === "parcel" && cadastro ? (
          <section className="tp-parcel">
            <div className="tp-parcel__top"><button onClick={() => { setParcel(null); setStage("addresses"); }} type="button"><ArrowLeft size={16} /> Tagasi</button><span><CheckCircle2 size={16} /> Andmed laaditud</span></div>
            <div className="tp-map">{mapUrl ? <iframe src={mapUrl} title="Kinnistu asukoht OpenStreetMapis" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-same-origin allow-scripts" /> : <Map size={38} />}</div>
            <div className="tp-parcel__title"><span className="eyebrow">Katastriüksus</span><h1>{cadastro.l_aadress || cadastro.number}</h1><code>{cadastro.number}</code></div>
            <div className="tp-stats">
              <div><span>Pindala</span><strong>{cadastro.pindala_ha ?? "–"} ha</strong></div>
              <div><span>Sihtotstarve</span><strong>{cadastro.sihtotstarve || "–"}</strong></div>
              <div><span>Metsamaa</span><strong>{cadastro.mets_pindala_ha ?? "–"} ha</strong></div>
              <div><span>Omand</span><strong>{cadastro.omvorm || "–"}</strong></div>
            </div>
            <div className="tp-alert"><Layers3 size={19} /><p><strong>Ruumiline kontroll</strong><br />Natura 2000: {parcel.spatial_status?.natura_2000?.intersects ? "kattub" : "teadaolevat kattuvust ei leitud"}; kaitseala: {parcel.spatial_status?.kaitseala?.intersects ? "kattub" : "teadaolevat kattuvust ei leitud"}.</p></div>
            <p className="tp-disclaimer">Puuduv vaste ei kinnita piirangu puudumist. Enne otsust kontrolli ametlikke registreid.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}

// The title goes first: a data card's title is the only part that tells two
// cards from the same table apart (see repeatsEarlierAnswer on the server).
function answerTextOf(item) {
  return [item?.answer?.title, item?.answer?.intro, ...(item?.answer?.parts || []).map((part) => part?.text)].filter(Boolean).join(" ");
}

// The chat panel renders its answers with the search page's own parts, passed
// in so the two renderings cannot drift apart and App stays their single owner.
const CHAT_ANSWER_PARTS = Object.freeze({ AnswerNote, Citation, SourceActions, SourceLegend, ExternalAnchor });

export function App() {
  const isEmbed = window.location.pathname.startsWith("/embed/terrapoint");
  const initialNavigation = navigationSearch();
  const [view, setView] = useState(window.location.pathname.startsWith("/otsi") && initialNavigation.query ? "search" : "home");
  const [query, setQuery] = useState(initialNavigation.query);
  const [result, setResult] = useState(null);
  const [previewListing, setPreviewListing] = useState(null);
  const [listingUnavailable, setListingUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const searchRequestRef = useRef({ id: 0, controller: null });
  const homeSearchInputRef = useRef(null);

  const performSearch = async (nextQuery, control = {}) => {
    const clean = String(nextQuery || "").trim();
    if (!clean) return;
    const options = typeof control === "boolean" ? { pushState: control } : control || {};
    const pushState = options.pushState !== false;
    const filters = clientSearchFilters(options.filters || DEFAULT_SEARCH_FILTERS);
    const requestPayload = searchRequestPayload(clean, filters);
    searchRequestRef.current.controller?.abort();
    const requestId = searchRequestRef.current.id + 1;
    const controller = new AbortController();
    searchRequestRef.current = { id: requestId, controller };
    setQuery(clean);
    setView("search");
    setResult(null);
    setPreviewListing(null);
    setListingUnavailable(false);
    setBusy(true);
    setError("");
    if (pushState) {
      window.history.pushState({ practiceSearchId: rememberNavigationSearch(clean, filters) }, "", "/otsi");
    }
    window.scrollTo({ top: 0, behavior: pushState ? "smooth" : "auto" });
    let latestListing = null;
    let latestSafeResult = null;
    try {
      // The search runs as an asynchronous job: the listing, then the answer,
      // arrive through short polls, so one slow model call no longer ends the
      // search and a retried page rejoins the job instead of starting another.
      await readSearchJob({
        kind: "search",
        payload: requestPayload,
        signal: controller.signal,
        onResponse: (response) => noteServerBuild(response),
        onEvent: (event) => {
          if (searchRequestRef.current.id !== requestId) return;
          if (event.type === "results") {
            latestListing = event.searchResults;
            setPreviewListing(event.searchResults);
            // A failed listing is reported as such, never as "no results".
            setListingUnavailable(event.listingUnavailable === true);
            return;
          }
          const nextResult = event.result;
          latestSafeResult = nextResult;
          latestListing = nextResult.searchResults || latestListing;
          setPreviewListing(latestListing || null);
          setResult(nextResult);
        },
      });
    } catch (searchError) {
      if (searchError.name === "AbortError" || searchRequestRef.current.id !== requestId) return;
      if (latestSafeResult) setResult(latestSafeResult);
      if (latestListing) setPreviewListing(latestListing);
      setError(latestSafeResult
        ? "Lõpliku sõnastuse voog katkes. Kuvan kontrollitud esialgset vastust ja juba leitud allikaid."
        : latestListing
          ? "Koondvastuse voog katkes. Juba leitud otsingutulemused on endiselt saadaval."
          : searchError.message || "Serveriga ei saanud ühendust.");
    } finally {
      if (searchRequestRef.current.id === requestId) {
        searchRequestRef.current = { id: requestId, controller: null };
        setBusy(false);
      }
    }
  };

  useEffect(() => {
    if (isEmbed) return undefined;
    const initial = navigationSearch();
    if (window.location.pathname.startsWith("/otsi") && initial.query) {
      window.history.replaceState({ practiceSearchId: rememberNavigationSearch(initial.query, initial.filters) }, "", "/otsi");
      performSearch(initial.query, { pushState: false, filters: initial.filters });
    } else if (window.location.pathname.startsWith("/otsi")) {
      window.history.replaceState({}, "", "/");
    }

    const onPopState = (event) => {
      const searchView = window.location.pathname.startsWith("/otsi");
      setView(searchView ? "search" : "home");
      const next = navigationSearch(event.state);
      setQuery(next.query);
      if (searchView && next.query) performSearch(next.query, { pushState: false, filters: next.filters });
      else {
        searchRequestRef.current.controller?.abort();
        searchRequestRef.current = { id: searchRequestRef.current.id + 1, controller: null };
        setBusy(false);
        setPreviewListing(null);
        document.title = "Keskkonnaportaali praktika";
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      searchRequestRef.current.controller?.abort();
      window.removeEventListener("popstate", onPopState);
    };
    // Initial routing intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isEmbed) return <TerrapointEmbed />;

  const goHome = () => {
    searchRequestRef.current.controller?.abort();
    searchRequestRef.current = { id: searchRequestRef.current.id + 1, controller: null };
    window.history.pushState({}, "", "/");
    setView("home");
    setQuery("");
    setResult(null);
    setPreviewListing(null);
    setListingUnavailable(false);
    setError("");
    setBusy(false);
    document.title = "Keskkonnaportaali praktika";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const revealHomeSearch = () => {
    const input = homeSearchInputRef.current;
    if (!input) return;
    input.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    input.focus({ preventScroll: true });
  };

  return (
    <>
      <Header compact={view === "search"} onRevealSearch={revealHomeSearch} />
      {view === "search" ? (
        <SearchResults busy={busy} error={error} listingUnavailable={listingUnavailable} onHome={goHome} onSearch={performSearch} previewListing={previewListing} query={query} result={result} />
      ) : (
        <Home busy={busy} onSearch={performSearch} searchInputRef={homeSearchInputRef} />
      )}
      <Footer compact={view === "search"} />
      <Chatbot
        answerParts={CHAT_ANSWER_PARTS}
        answerTextOf={answerTextOf}
        pageContext={view === "search"
          ? {
            query,
            // The year filter means something to a suggestion only when it is
            // one the reader is actually looking at.
            filters: clientSearchFilters(result?.searchResults?.appliedFilters || previewListing?.appliedFilters),
          }
          : null}
      />
    </>
  );
}
