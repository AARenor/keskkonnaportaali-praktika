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
  FileText,
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

const SOURCE = "https://keskkonnaportaal.ee";

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
    label: "Kliimapoliitika andmevärav",
    kicker: "Vaata täpsemalt!",
    image: "/assets/tile-climate.jpg",
    href: `${SOURCE}/et/teemad/kliimapoliitika-andmevarav`,
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
    title: "Uuendatud ülevaade tuuleenergia planeeringutest (august 2026)",
    image: "/assets/featured-wind.jpg",
    tags: ["Uuringud ja aruanded", "Energeetika"],
    meta: "Andis välja Keskkonnaagentuur",
    excerpt: "Ülevaade koondab värske info võrguga ühendatud tuuleparkide ja planeeringute kohta.",
    href: `${SOURCE}/et/uuendatud-ulevaade-tuuleenergia-planeeringutest-august-2026`,
  },
  {
    title: "Ulukite arvukus ja küttimine",
    image: "/assets/featured-bear.png",
    tags: ["Väljaanded ja ülevaated", "Ulukid"],
    meta: "Andis välja Keskkonnaagentuur",
    excerpt: "2026. aasta aruanne koondab ulukiasurkondade seisundi ja küttimissoovitused.",
    href: `${SOURCE}/et/ulukite-arvukus-ja-kuttimine`,
  },
];

const news = [
  {
    title: "Mullaseire 2025: uuritud muldade seisund on hea, kuid muutused vajavad tähelepanu",
    image: "/assets/news-soil.jpg",
    tag: "Muld ja maahõive",
    date: "13.08.2026",
    href: "https://www.keskkonnaagentuur.ee/uudised/keskkonnaportaalis-ja-blogis-mullaseire-2025-uuritud-muldade-seisund-hea-kuid-moned",
  },
  {
    title: "Enne linnujahti veendu palun reeglites",
    image: "/assets/news-birds.jpg",
    tag: "Looduskaitse",
    date: "12.08.2026",
    href: "https://www.keskkonnaamet.ee/uudised/enne-linnujahti-veendu-palun-reeglites",
  },
  {
    title: "Blogis: Kui palju ja millist metsa Eestis on?",
    image: "/assets/news-forest.jpg",
    tag: "Mets",
    date: "12.08.2026",
    href: "https://www.keskkonnaagentuur.ee/uudised/blogis-kui-palju-ja-millist-metsa-eestis",
  },
  {
    title: "Blogis: Juuli oli normist jahedam ning tõi rohkelt sademeid",
    image: "/assets/news-weather.png",
    tag: "Ilm ja kliima",
    date: "03.08.2026",
    href: "https://www.keskkonnaagentuur.ee/uudised/blogis-juuli-oli-normist-jahedam-ning-toi-rohkelt-sademeid-0",
  },
];

const events = [
  {
    day: "17",
    month: "august",
    type: "notice",
    title: "Väätsa prügila laienduse KMH aruande avalik arutelu",
    excerpt: "Avalik arutelu toimub kell 17.00 RAGN-SELLS AS Väätsa jäätmekäitluskeskuses.",
  },
  {
    day: "24",
    month: "august",
    type: "notice",
    title: "Põltsamaa jõe Ao (II) paisjärvest eraldamise ehitusprojekti KMH arutelu",
    excerpt: "Avalik arutelu toimub kell 18.00 Rakke Kultuurikeskuse väikeses saalis.",
  },
  {
    day: "27",
    month: "august",
    type: "event",
    title: "Loomaaia loenguõhtu. Urmas Tartes",
    excerpt: "Inspireeriv loenguõhtu, kus jagatakse teadmisi, kogemusi ja loodusfotosid.",
  },
  {
    day: "28",
    month: "august",
    type: "day",
    title: "Läänemere päev",
    excerpt: "Iga-aastane pidupäev mere auks ja võimalus tutvuda Läänemere loodusega.",
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

const searchSuggestions = [
  "metsade seisund Eestis",
  "metsa looduskaitsepiirangud",
  "Eesti kliima muutumine",
  "põhjavee seisund",
  "õhukvaliteet Tallinnas",
  "keskkonna avaandmed",
  "jäätmete ringlussevõtt",
];

function formatDate() {
  return new Intl.DateTimeFormat("et-EE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function ExternalAnchor({ children, className, href, ...props }) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  );
}

function SearchForm({ initialValue = "", onSearch, busy, variant = "hero", autoFocus = false }) {
  const listboxId = useId();
  const inputRef = useRef(null);
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => setValue(initialValue), [initialValue]);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setRemoteSuggestions([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/suggestions?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (response.ok && Array.isArray(data.suggestions)) setRemoteSuggestions(data.suggestions);
      } catch (error) {
        if (error.name !== "AbortError") setRemoteSuggestions([]);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value]);

  const suggestions = useMemo(() => {
    const query = value.trim().toLocaleLowerCase("et");
    if (query.length < 2) return [];
    if (remoteSuggestions.length) return remoteSuggestions.slice(0, 5);
    return searchSuggestions
      .filter((item) => item.toLocaleLowerCase("et").includes(query))
      .slice(0, 5)
      .map((item) => ({ value: item, count: null }));
  }, [remoteSuggestions, value]);

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
    if (value.trim()) onSearch(value.trim());
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
            setRemoteSuggestions([]);
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
        {focused && suggestions.length ? (
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

function Header({ onSearch, busy, searchValue = "", compact = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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
            <span><CloudSun size={17} /> 19 … 26 °C</span>
            <a href={`${SOURCE}/et/ligip%C3%A4%C3%A4setavus`}><CircleHelp size={15} /> Ligipääsetavus</a>
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
            <button className="header-icon" onClick={() => setSearchOpen((open) => !open)} type="button" aria-expanded={searchOpen} aria-label="Ava otsing">
              {searchOpen ? <X size={23} /> : <Search size={22} />}
            </button>
            <button className="header-icon header-icon--menu" onClick={() => setMenuOpen((open) => !open)} type="button" aria-expanded={menuOpen} aria-label="Ava menüü">
              {menuOpen ? <X size={24} /> : <Menu size={25} />}
            </button>
          </div>
        </div>
      </div>

      {searchOpen ? (
        <div className="mobile-search-panel">
          <SearchForm
            autoFocus
            busy={busy}
            initialValue={searchValue}
            onSearch={(nextQuery) => {
              setSearchOpen(false);
              onSearch(nextQuery);
            }}
            variant="mobile"
          />
        </div>
      ) : null}

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
          <a href={`${SOURCE}/et/ligip%C3%A4%C3%A4setavus`}>Ligipääsetavus</a>
          <a href={`${SOURCE}/et/sitemap`}>Sisukaart</a>
          <a href={`${SOURCE}/et/portaalist`}>Portaalist</a>
          <a href={`${SOURCE}/et/abi`}>Abi</a>
        </div>
        <div className="mobile-drawer__footer">
          <span>Keel</span><strong>ET</strong>
        </div>
      </div>
      {menuOpen ? <button className="drawer-backdrop" onClick={() => setMenuOpen(false)} aria-label="Sulge menüü" type="button" /> : null}
    </header>
  );
}

function Hero({ onSearch, busy }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__shade" />
      <div className="shell hero__content">
        <p className="hero__practice"><Sparkles size={16} /> Uus praktikaversioon</p>
        <h1 id="hero-title">Eesti keskkonna andmete portaal</h1>
        <p className="hero__subtitle">Üks värav kõikidele keskkonnaandmetele</p>
        <SearchForm busy={busy} onSearch={onSearch} />
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
              <ExternalAnchor href={card.href} className="featured-card__image"><img src={card.image} alt="" /></ExternalAnchor>
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
            <ExternalAnchor href={item.href}><img src={item.image} alt="" /></ExternalAnchor>
            <div>
              <span className="tag">{item.tag}</span>
              <ExternalAnchor href={item.href}><h3>{item.title} <ExternalLink size={13} /></h3></ExternalAnchor>
              <p>Keskkonnaagentuur <span aria-hidden="true">|</span> {item.date}</p>
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
              <ExternalAnchor href="https://kotkas.envir.ee/kmh/index?tab=PUBLICATION">Loe lisa <ExternalLink size={13} /></ExternalAnchor>
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
          <span className="tag">Ringmajandus</span>
          <h3>RING 2026 – Ringsus kui konkurentsieelis</h3>
          <div className="month-card__visual">
            <Globe2 size={44} />
            <span>08. september<br />Kultuurikatel, Tallinn</span>
          </div>
          <p>Foorum toob kokku ettevõtted, eksperdid ja avaliku sektori, et jagada ringmajanduse praktilisi lahendusi.</p>
          <ExternalAnchor className="text-link" href="https://kik.ee/et/ringmajanduse-foorum">Lisainfo ja registreerumine <ChevronRight size={17} /></ExternalAnchor>
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

function Home({ onSearch, busy }) {
  return (
    <main id="main-content">
      <Hero busy={busy} onSearch={onSearch} />
      <PortalTiles />
      <CurrentContent />
      <TerrapointSection />
      <EventsSection />
      <FeatureLinks />
    </main>
  );
}

function Citation({ number, onNavigate }) {
  return <a className="citation" href={`#source-${number}`} onClick={(event) => onNavigate(event, number)} aria-label={`Allikas ${number}`}>{number}</a>;
}

function SearchResults({ result, query, busy, error, onSearch, onHome }) {
  const hasResult = Boolean(result?.answer);
  const [showAllSources, setShowAllSources] = useState(false);
  const headingRef = useRef(null);
  const sourcesListId = useId();
  useEffect(() => setShowAllSources(false), [result?.query]);
  useEffect(() => {
    if (!busy && hasResult) {
      document.title = `${result.answer.title} | Keskkonnaportaali praktika`;
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [busy, hasResult, result?.answer?.title, result?.query]);
  const visibleSources = showAllSources ? result?.sources || [] : (result?.sources || []).slice(0, 3);
  const revealCitation = (event, number) => {
    event.preventDefault();
    const reveal = () => {
      const target = document.getElementById(`source-${number}`);
      if (!target) return false;
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
      return true;
    };
    if (reveal()) return;
    setShowAllSources(true);
    window.requestAnimationFrame(() => window.requestAnimationFrame(reveal));
  };
  return (
    <main className="search-page" id="main-content">
      <div aria-atomic="true" aria-live="polite" className="sr-only">
        {busy ? "Koostan vastust." : error ? "Otsing ebaõnnestus." : hasResult ? `Vastus valmis: ${result.answer.title}` : ""}
      </div>
      <div className="search-page__header">
        <div className="shell search-results-shell">
          <button className="back-link" onClick={onHome} type="button"><ArrowLeft size={17} /> Avalehele</button>
          <SearchForm busy={busy} initialValue={query} onSearch={onSearch} variant="results" />
        </div>
      </div>
      <div className="shell search-results-shell search-page__content">
        {busy ? (
          <div className="search-state" role="status"><LoaderCircle className="spin" size={28} /><h1>Koostan vastust …</h1><p>Loen ametlikke allikaid ja kontrollin viiteid.</p></div>
        ) : null}
        {error ? <div className="search-error" role="alert"><CircleHelp size={22} /><div><strong>Otsingut ei saanud lõpetada</strong><p>{error}</p></div></div> : null}
        {!busy && hasResult ? (
          <>
            <article className="answer-card">
              <div className="answer-label"><Sparkles size={17} /><span>{result.answer.eyebrow || "AI koondvastus"}</span></div>
              <h1 ref={headingRef} tabIndex={-1}>{result.answer.title}</h1>
              <p className="answer-intro">
                {result.answer.intro}{" "}
                {(result.answer.introCitations || []).map((citation) => <Citation key={citation} number={citation} onNavigate={revealCitation} />)}
              </p>
              <div className="answer-parts">
                {result.answer.parts.map((part, index) => (
                  <section key={index}>
                    {part.title ? <h2>{part.title}</h2> : null}
                    <p>{part.text} {(part.citations || []).map((citation) => <Citation key={citation} number={citation} onNavigate={revealCitation} />)}</p>
                  </section>
                ))}
              </div>
              {result.answer.note ? <div className="answer-note"><ShieldCheck size={18} /><p>{result.answer.note}</p></div> : null}
              {result.clarification ? (
                <div className="answer-clarification">
                  <strong>Täpsusta soovi korral</strong>
                  <p>{result.clarification}</p>
                </div>
              ) : null}
            </article>

            <section className="sources-section" aria-labelledby="sources-title">
              <div className="sources-title-row">
                <h2 id="sources-title">Allikad</h2>
                <span>{result.sources.length}</span>
              </div>
              <div className="sources-list" id={sourcesListId}>
                {visibleSources.map((source) => (
                  <ExternalAnchor className="source-row" href={source.url} id={`source-${source.citation}`} key={source.id}>
                    <span className="source-number">{source.citation}</span>
                    <div className="source-card__body">
                      <div className="source-meta"><span>{source.organization}</span><span>{source.published}</span></div>
                      <h3>{source.title}<ExternalLink size={15} /></h3>
                      <p>{source.summary}</p>
                    </div>
                  </ExternalAnchor>
                ))}
              </div>
              {result.sources.length > 3 ? (
                <button
                  aria-controls={sourcesListId}
                  aria-expanded={showAllSources}
                  className="sources-toggle"
                  onClick={() => setShowAllSources((current) => !current)}
                  type="button"
                >
                  {showAllSources ? "Näita vähem" : `Kõik allikad (${result.sources.length})`}
                  <ChevronDown className={showAllSources ? "rotated" : ""} size={17} />
                </button>
              ) : null}
            </section>

            {result.related?.length ? (
              <section className="related-section">
                <h2>Seotud küsimused</h2>
                <div>{result.related.map((item) => <button key={item} onClick={() => onSearch(item)} type="button">{item}<ArrowRight size={16} /></button>)}</div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function Footer({ compact = false }) {
  if (compact) {
    return (
      <footer className="site-footer site-footer--compact">
        <div className="shell"><span>Keskkonnaportaali praktikaprojekt</span><span>Kontrolli olulist infot algallikast</span></div>
      </footer>
    );
  }
  return (
    <footer className="site-footer">
      <div className="shell footer-main">
        <div><img src="/assets/logo-desktop.svg" alt="Keskkonnaportaal" /><p>Praktikaprojekt, mis demonstreerib täiustatud allikapõhist otsingut ja Terrapointi integratsiooni.</p></div>
        <div><h2>Portaal</h2><a href={`${SOURCE}/et/portaalist`}>Portaalist</a><a href={`${SOURCE}/et/kontakt`}>Kontakt</a><a href={`${SOURCE}/et/abi`}>Abi</a></div>
        <div><h2>Andmed</h2><a href="https://register.keskkonnaportaal.ee/register">Andmed ja kaart</a><a href={`${SOURCE}/et/avaandmed`}>Avaandmed</a><a href="https://terrapoint.ee/">Terrapoint</a></div>
        <div><h2>Jälgi</h2><div className="socials"><a aria-label="Facebook" href="https://www.facebook.com/Keskkonnaagentuur"><Facebook /></a><a aria-label="Instagram" href="https://www.instagram.com/keskkonnaagentuur/"><Instagram /></a><a aria-label="YouTube" href="https://www.youtube.com/channel/UCyAMWZVg2a7GNIX2m__pvhA"><Youtube /></a></div></div>
      </div>
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
            <div className="tp-map">{mapUrl ? <iframe src={mapUrl} title="Kinnistu asukoht OpenStreetMapis" loading="lazy" /> : <Map size={38} />}</div>
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

export function App() {
  const isEmbed = window.location.pathname.startsWith("/embed/terrapoint");
  const [view, setView] = useState(window.location.pathname.startsWith("/otsi") ? "search" : "home");
  const [query, setQuery] = useState(new URLSearchParams(window.location.search).get("q") || "");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const searchRequestRef = useRef({ id: 0, controller: null });

  const performSearch = async (nextQuery, pushState = true) => {
    const clean = String(nextQuery || "").trim();
    if (!clean) return;
    searchRequestRef.current.controller?.abort();
    const requestId = searchRequestRef.current.id + 1;
    const controller = new AbortController();
    searchRequestRef.current = { id: requestId, controller };
    setQuery(clean);
    setView("search");
    setBusy(true);
    setError("");
    if (pushState) window.history.pushState({}, "", `/otsi?q=${encodeURIComponent(clean)}`);
    window.scrollTo({ top: 0, behavior: pushState ? "smooth" : "auto" });
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(clean)}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Otsing ei vastanud.");
      if (searchRequestRef.current.id !== requestId) return;
      setResult(data);
    } catch (searchError) {
      if (searchError.name === "AbortError" || searchRequestRef.current.id !== requestId) return;
      setResult(null);
      setError(searchError.message || "Serveriga ei saanud ühendust.");
    } finally {
      if (searchRequestRef.current.id === requestId) {
        searchRequestRef.current = { id: requestId, controller: null };
        setBusy(false);
      }
    }
  };

  useEffect(() => {
    if (isEmbed) return undefined;
    const initial = new URLSearchParams(window.location.search).get("q");
    if (window.location.pathname.startsWith("/otsi") && initial) performSearch(initial, false);

    const onPopState = () => {
      const searchView = window.location.pathname.startsWith("/otsi");
      setView(searchView ? "search" : "home");
      const next = new URLSearchParams(window.location.search).get("q") || "";
      setQuery(next);
      if (searchView && next) performSearch(next, false);
      else {
        searchRequestRef.current.controller?.abort();
        searchRequestRef.current = { id: searchRequestRef.current.id + 1, controller: null };
        setBusy(false);
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
    setError("");
    setBusy(false);
    document.title = "Keskkonnaportaali praktika";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <Header busy={busy} compact={view === "search"} onSearch={performSearch} searchValue={query} />
      {view === "search" ? (
        <SearchResults busy={busy} error={error} onHome={goHome} onSearch={performSearch} query={query} result={result} />
      ) : (
        <Home busy={busy} onSearch={performSearch} />
      )}
      <Footer compact={view === "search"} />
    </>
  );
}
