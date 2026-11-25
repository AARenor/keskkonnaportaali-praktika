import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudSun,
  ExternalLink,
  Facebook,
  Instagram,
  Layers3,
  Link2,
  LoaderCircle,
  Map as MapIcon,
  MapPinned,
  Menu,
  Search,
  Sparkles,
  X,
  Youtube,
} from "lucide-react";
import { readSearchJob } from "./search_jobs.js";
import { noteServerBuild } from "./app-build.js";
import { DEFAULT_SEARCH_FILTERS, clientSearchFilters, searchRequestPayload } from "./search_request.js";
import { searchHistory } from "./search_history.js";
import SearchForm from "./SearchForm.jsx";
import SearchResults from "./SearchResults.jsx";
import { ExternalAnchor } from "./AnswerSources.jsx";

const SOURCE = "https://keskkonnaportaal.ee";

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

function navigationSearch(state = window.history.state, search = window.location.search) {
  const id = String(state?.practiceSearchId || "");
  const snapshot = id ? searchHistory.restore(id) : null;
  if (snapshot) return { ...snapshot, id, snapshot };
  return { ...legacySearchFromLocation(search), id, snapshot: null };
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




const DRAWER_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Header({ compact = false, onRevealSearch }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [megaMenu, setMegaMenu] = useState(null);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const drawerCloseRef = useRef(null);

  const drawerOpen = menuOpen && !compact;

  useEffect(() => {
    if (compact) setMenuOpen(false);
  }, [compact]);

  useEffect(() => {
    document.body.classList.toggle("menu-locked", drawerOpen);
    return () => document.body.classList.remove("menu-locked");
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const drawer = drawerRef.current;
    drawerCloseRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = [...drawer.querySelectorAll(DRAWER_FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = drawer.contains(document.activeElement);
      if (event.shiftKey && (!inside || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (!compact) menuButtonRef.current?.focus();
    };
  }, [drawerOpen, compact]);

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
            <button className="header-icon header-icon--menu" ref={menuButtonRef} onClick={() => setMenuOpen((open) => !open)} type="button" aria-expanded={drawerOpen} aria-controls="mobile-drawer" aria-label={drawerOpen ? "Sulge menüü" : "Ava menüü"}>
              {drawerOpen ? <X size={24} aria-hidden="true" /> : <Menu size={25} aria-hidden="true" />}
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
              {megaMenus[megaMenu].groups.map((group) => (
                <div key={group[0]}>
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

      <div
        className={`mobile-drawer ${drawerOpen ? "mobile-drawer--open" : ""}`}
        id="mobile-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-drawer-title"
        inert={!drawerOpen}
      >
        <div className="mobile-drawer__top">
          <span id="mobile-drawer-title">Menüü</span>
          <button ref={drawerCloseRef} onClick={() => setMenuOpen(false)} type="button" aria-label="Sulge menüü"><X size={24} aria-hidden="true" /></button>
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
      {drawerOpen ? <button className="drawer-backdrop" onClick={() => setMenuOpen(false)} aria-label="Sulge menüü" type="button" /> : null}
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
          <div className="tp-empty"><MapIcon size={42} /><h1>Leia kinnistu andmed</h1><p>Alusta aadressist, vali sobiv katastriüksus ja vaata Terrapointi koondandmeid.</p></div>
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
            <div className="tp-map">{mapUrl ? <iframe src={mapUrl} title="Kinnistu asukoht OpenStreetMapis" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-same-origin allow-scripts" /> : <MapIcon size={38} />}</div>
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


export function App() {
  const isEmbed = window.location.pathname.startsWith("/embed/terrapoint");
  const initialNavigation = navigationSearch();
  const initialSnapshot = initialNavigation.snapshot;
  const initialHistoryId = initialNavigation.id;
  const [view, setView] = useState(window.location.pathname.startsWith("/otsi") && initialNavigation.query ? "search" : "home");
  const [query, setQuery] = useState(initialNavigation.query);
  const [result, setResult] = useState(initialSnapshot?.result || null);
  const [previewListing, setPreviewListing] = useState(initialSnapshot?.listing || null);
  const [listingUnavailable, setListingUnavailable] = useState(initialSnapshot?.listingUnavailable === true);
  const [searchFilters, setSearchFilters] = useState(initialNavigation.filters || DEFAULT_SEARCH_FILTERS);
  const [listingNotice, setListingNotice] = useState(initialSnapshot?.listingNotice || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialSnapshot?.error || "");
  const [historyId, setHistoryId] = useState(initialHistoryId);
  const searchRequestRef = useRef({ id: 0, controller: null });
  const historyIdRef = useRef(initialHistoryId);
  const homeSearchInputRef = useRef(null);
  const searchStateRef = useRef(null);

  const snapshotFor = (values = {}) => {
    const current = searchStateRef.current || {};
    const id = values.id || historyIdRef.current;
    const queryValue = values.queryValue ?? current.query ?? "";
    const listingValue = values.listingValue === undefined ? current.previewListing || null : values.listingValue;
    const resultValue = values.resultValue === undefined ? current.result || null : values.resultValue;
    const filtersValue = values.filtersValue ?? current.filters;
    const listingUnavailableValue = values.listingUnavailableValue === undefined
      ? current.listingUnavailable === true
      : values.listingUnavailableValue === true;
    const errorValue = values.errorValue === undefined ? current.error || "" : values.errorValue;
    const listingNoticeValue = values.listingNoticeValue ?? current.listingNotice ?? "";
    const filters = clientSearchFilters(filtersValue || listingValue?.appliedFilters || resultValue?.searchResults?.appliedFilters);
    const savedResult = resultValue && listingValue
      ? { ...resultValue, searchResults: listingValue }
      : resultValue;
    const snapshot = {
      query: queryValue,
      filters,
      listing: listingValue,
      result: savedResult,
      listingUnavailable: listingUnavailableValue,
      error: errorValue,
      listingNotice: listingNoticeValue,
    };
    if (values.scrollY !== undefined) snapshot.scrollY = values.scrollY;
    else if (id === historyIdRef.current) snapshot.scrollY = window.scrollY;
    return { id, snapshot };
  };
  const saveSnapshot = (values = {}) => {
    const { id, snapshot } = snapshotFor(values);
    if (id) searchHistory.update(id, snapshot);
  };
  const createSnapshot = (values = {}) => {
    const { id, snapshot } = snapshotFor(values);
    if (id) searchHistory.create(id, snapshot);
  };
  const saveSnapshotRef = useRef(saveSnapshot);

  const performSearch = async (nextQuery, control = {}) => {
    const clean = String(nextQuery || "").trim();
    if (!clean) return;
    const options = typeof control === "boolean" ? { pushState: control } : control || {};
    const pushState = options.pushState !== false;
    const filters = clientSearchFilters(options.filters || DEFAULT_SEARCH_FILTERS);
    const requestPayload = searchRequestPayload(clean, filters);
    if (pushState && view === "search") saveSnapshot();
    const activeHistoryId = pushState
      ? searchHistory.createId()
      : String(options.historyId || window.history.state?.practiceSearchId || historyIdRef.current || searchHistory.createId());
    searchRequestRef.current.controller?.abort();
    const requestId = searchRequestRef.current.id + 1;
    const controller = new AbortController();
    searchRequestRef.current = { id: requestId, controller };
    historyIdRef.current = activeHistoryId;
    setHistoryId(activeHistoryId);
    setQuery(clean);
    setSearchFilters(filters);
    setView("search");
    setResult(null);
    setPreviewListing(null);
    setListingUnavailable(false);
    setBusy(true);
    setError("");
    setListingNotice("");
    if (pushState) {
      window.history.pushState({ practiceSearchId: activeHistoryId }, "", "/otsi");
    } else if (window.history.state?.practiceSearchId !== activeHistoryId) {
      window.history.replaceState({ ...(window.history.state || {}), practiceSearchId: activeHistoryId }, "", "/otsi");
    }
    createSnapshot({
      id: activeHistoryId,
      queryValue: clean,
      filtersValue: filters,
      listingValue: null,
      resultValue: null,
      listingUnavailableValue: false,
      errorValue: "",
      listingNoticeValue: "",
      scrollY: 0,
    });
    window.scrollTo({ top: 0, behavior: pushState ? "smooth" : "auto" });
    let latestListing = null;
    let latestSafeResult = null;
    const persistStreamState = ({ listingValue, resultValue, listingUnavailableValue = false, errorValue = "" }) => {
      const currentId = historyIdRef.current || activeHistoryId;
      const currentState = searchStateRef.current || {};
      const activeListing = currentId !== activeHistoryId
        ? currentState.previewListing || listingValue
        : listingValue;
      const activeResult = resultValue && activeListing
        ? { ...resultValue, searchResults: activeListing }
        : resultValue;
      saveSnapshot({
        id: activeHistoryId,
        queryValue: clean,
        filtersValue: filters,
        listingValue,
        resultValue,
        listingUnavailableValue,
        errorValue,
        listingNoticeValue: "",
      });
      if (currentId !== activeHistoryId) {
        saveSnapshot({
          id: currentId,
          queryValue: clean,
          filtersValue: filters,
          listingValue: activeListing,
          resultValue: activeResult,
          listingUnavailableValue,
          errorValue,
          listingNoticeValue: "",
        });
      }
      return { listing: activeListing, result: activeResult };
    };
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
            const saved = persistStreamState({
              listingValue: latestListing,
              resultValue: latestSafeResult,
              listingUnavailableValue: event.listingUnavailable === true,
            });
            setPreviewListing(saved.listing || null);
            setListingUnavailable(event.listingUnavailable === true);
            return;
          }
          const nextResult = event.result;
          latestSafeResult = nextResult;
          latestListing = nextResult.searchResults || latestListing;
          const saved = persistStreamState({
            listingValue: latestListing,
            resultValue: nextResult,
          });
          setPreviewListing(saved.listing || null);
          setResult(saved.result);
          setListingUnavailable(false);
        },
      });
    } catch (searchError) {
      if (searchError.name === "AbortError" || searchRequestRef.current.id !== requestId) return;
      const message = latestSafeResult
        ? "Lõpliku sõnastuse voog katkes. Kuvan kontrollitud esialgset vastust ja juba leitud allikaid."
        : latestListing
          ? "Koondvastuse voog katkes. Juba leitud otsingutulemused on endiselt saadaval."
          : searchError.message || "Serveriga ei saanud ühendust.";
      const saved = persistStreamState({
        listingValue: latestListing,
        resultValue: latestSafeResult,
        errorValue: message,
      });
      setResult(saved.result);
      setPreviewListing(saved.listing || null);
      setError(message);
    } finally {
      if (searchRequestRef.current.id === requestId) {
        searchRequestRef.current = { id: requestId, controller: null };
        setBusy(false);
      }
    }
  };
  const performSearchRef = useRef(performSearch);
  useLayoutEffect(() => {
    searchStateRef.current = { query, result, previewListing, listingUnavailable, busy, error, filters: searchFilters, listingNotice };
    saveSnapshotRef.current = saveSnapshot;
    performSearchRef.current = performSearch;
  });

  const selectResultPage = (listing, notice = "", previousScrollY = window.scrollY) => {
    saveSnapshot({ scrollY: previousScrollY });
    const filters = clientSearchFilters(listing?.appliedFilters || previewListing?.appliedFilters || searchFilters);
    const nextNotice = typeof notice === "string" ? notice : "";
    const nextId = searchHistory.createId();
    const currentResult = searchStateRef.current.result;
    const nextResult = currentResult ? { ...currentResult, searchResults: listing } : null;
    historyIdRef.current = nextId;
    setHistoryId(nextId);
    setSearchFilters(filters);
    setListingNotice(nextNotice);
    setPreviewListing(listing);
    if (nextResult) setResult(nextResult);
    createSnapshot({
      id: nextId,
      queryValue: query,
      filtersValue: filters,
      listingValue: listing,
      resultValue: nextResult,
      listingUnavailableValue: listingUnavailable,
      errorValue: error,
      listingNoticeValue: nextNotice,
      scrollY: window.scrollY,
    });
    window.history.pushState({ practiceSearchId: nextId }, "", "/otsi");
  };

  useEffect(() => {
    if (window.location.pathname.startsWith("/embed/terrapoint")) return undefined;
    const previousRestoration = window.history.scrollRestoration;
    if (previousRestoration) window.history.scrollRestoration = "manual";
    let scrollFrame = 0;
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        if (historyIdRef.current) searchHistory.updateScroll(historyIdRef.current, window.scrollY);
      });
    };
    const initial = navigationSearch();
    if (window.location.pathname.startsWith("/otsi") && initial.query) {
      historyIdRef.current = initial.id || historyIdRef.current;
      if (initial.snapshot) {
        setHistoryId(initial.id);
        setQuery(initial.query);
        setSearchFilters(initial.snapshot.filters || initial.filters || DEFAULT_SEARCH_FILTERS);
        setListingNotice(initial.snapshot.listingNotice || "");
        setResult(initial.snapshot.result || null);
        setPreviewListing(initial.snapshot.listing || null);
        setListingUnavailable(initial.snapshot.listingUnavailable === true);
        setError(initial.snapshot.error || "");
        document.title = "Otsingutulemused | Keskkonnaportaali praktika";
        window.requestAnimationFrame(() => window.scrollTo({ top: initial.snapshot.scrollY || 0, behavior: "instant" }));
      } else {
        performSearchRef.current(initial.query, {
          pushState: false,
          filters: initial.filters,
          historyId: initial.id,
        });
      }
    } else if (window.location.pathname.startsWith("/otsi")) {
      window.history.replaceState({}, "", "/");
    }

    const onPopState = (event) => {
      const current = searchStateRef.current || {};
      saveSnapshotRef.current({
        errorValue: current.busy ? "Otsing katkestati lehelt lahkumisel. Varem saadud tulemused on alles." : current.error,
      });
      searchRequestRef.current.controller?.abort();
      searchRequestRef.current = { id: searchRequestRef.current.id + 1, controller: null };
      const searchView = window.location.pathname.startsWith("/otsi");
      const next = navigationSearch(event.state);
      setView(searchView && next.query ? "search" : "home");
      setQuery(next.query);
      setSearchFilters(next.snapshot?.filters || next.filters || DEFAULT_SEARCH_FILTERS);
      historyIdRef.current = next.id;
      setHistoryId(next.id);
      if (searchView && next.query && next.snapshot) {
        setResult(next.snapshot.result || null);
        setPreviewListing(next.snapshot.listing || null);
        setListingUnavailable(next.snapshot.listingUnavailable === true);
        setError(next.snapshot.error || "");
        setListingNotice(next.snapshot.listingNotice || "");
        setBusy(false);
        document.title = "Otsingutulemused | Keskkonnaportaali praktika";
        window.requestAnimationFrame(() => window.scrollTo({ top: next.snapshot.scrollY || 0, behavior: "instant" }));
      } else if (searchView && next.query) {
        performSearchRef.current(next.query, { pushState: false, filters: next.filters, historyId: next.id });
      } else {
        if (searchView && !next.query) window.history.replaceState({}, "", "/");
        setResult(null);
        setPreviewListing(null);
        setListingUnavailable(false);
        setError("");
        setSearchFilters(DEFAULT_SEARCH_FILTERS);
        setListingNotice("");
        setBusy(false);
        document.title = "Keskkonnaportaali praktika";
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPopState);
    return () => {
      searchRequestRef.current.controller?.abort();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPopState);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      if (previousRestoration) window.history.scrollRestoration = previousRestoration;
    };
    // Initial routing intentionally runs once.
  }, []);

  if (isEmbed) return <TerrapointEmbed />;

  const goHome = () => {
    saveSnapshot({
      errorValue: busy ? "Otsing katkestati lehelt lahkumisel. Varem saadud tulemused on alles." : error,
    });
    searchRequestRef.current.controller?.abort();
    searchRequestRef.current = { id: searchRequestRef.current.id + 1, controller: null };
    window.history.pushState({}, "", "/");
    historyIdRef.current = "";
    setHistoryId("");
    setView("home");
    setQuery("");
    setSearchFilters(DEFAULT_SEARCH_FILTERS);
    setResult(null);
    setPreviewListing(null);
    setListingUnavailable(false);
    setError("");
    setListingNotice("");
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
        <SearchResults
          answerTextOf={answerTextOf}
          busy={busy}
          error={error}
          historyId={historyId}
          key={historyId || "search"}
          listingUnavailable={listingUnavailable}
          filters={searchFilters}
          listingNotice={listingNotice}
          onHome={goHome}
          onPageSelect={selectResultPage}
          onListingNotice={setListingNotice}
          onSearch={performSearch}
          previewListing={previewListing}
          query={query}
          result={result}
        />
      ) : (
        <Home busy={busy} onSearch={performSearch} searchInputRef={homeSearchInputRef} />
      )}
      <Footer compact={view === "search"} />
    </>
  );
}
