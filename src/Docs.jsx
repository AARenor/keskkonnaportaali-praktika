import { useEffect, useState } from "react";
import { documentationRoute } from "./docs-route.js";
import { userGuide, developerGuide } from "./docs/content.jsx";
import "./docs.css";

export default function Docs({ pathname = globalThis.location?.pathname || "/docs" }) {
  const page = documentationRoute(pathname);
  const guide = page === "user" ? userGuide : page === "developer" ? developerGuide : null;
  const title = guide?.title || (page === "not-found" ? "Juhendit ei leitud" : "Juhendid");
  const [indexInitiallyOpen] = useState(() => !globalThis.matchMedia?.("(max-width: 800px)").matches);

  useEffect(() => {
    document.title = `${title} · Keskkonnaportaali praktika`;
    // The lazy-loaded article mounts after the browser's initial fragment jump.
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [title]);

  return (
    <div className="docs-page">
      <a className="skip-link" href="#docs-main">Mine juhendi juurde</a>
      <header className="docs-header">
        <div className="docs-shell docs-header__inner">
          <a className="docs-brand" href="/" aria-label="Keskkonnaportaali praktikaprojekti avaleht">
            <img src="/assets/logo-desktop.svg" alt="Keskkonnaportaal" width={260} height={41} />
            <span>Praktikaprojekti juhendid</span>
          </a>
          <a className="docs-back" href="/">Tagasi otsingusse</a>
        </div>
      </header>
      <div className="docs-audience">
        <nav className="docs-shell" aria-label="Juhendid">
          <a href="/docs" aria-current={page === "overview" ? "page" : undefined}>Ülevaade</a>
          <a href="/docs/kasutajale" aria-current={page === "user" ? "page" : undefined}>Kasutajale</a>
          <a href="/docs/arendajale" aria-current={page === "developer" ? "page" : undefined}>Arendajale</a>
        </nav>
      </div>
      <div className={`docs-shell docs-layout${guide ? " docs-layout--guide" : ""}`}>
        {guide ? (
          <aside className="docs-index">
            <details open={indexInitiallyOpen}>
              <summary>Selle juhendi sisukord</summary>
              <nav aria-label="Sisukord">
                {guide.sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
              </nav>
            </details>
            <a className="docs-index__home" href="/docs">Kõik juhendid</a>
          </aside>
        ) : null}
        <main className="docs-article" id="docs-main" tabIndex={-1}>
          <h1>{title}</h1>
          {guide ? (
            <>
              <p className="docs-lead">{guide.intro}</p>
              <p className="docs-updated">Esimene väljaanne · kontrollitud 02.10.2026</p>
              <div className="docs-notice">See juhend kirjeldab praktikaversiooni. See ei ole Keskkonnaportaali ametlik tootmisteenus.</div>
              {guide.sections.map((section) => (
                <section className="docs-section" id={section.id} key={section.id}>
                  <h2>{section.title}</h2>
                  {section.content}
                </section>
              ))}
              <p className="docs-next"><a href={page === "user" ? "/docs/arendajale" : "/docs/kasutajale"}>
                {page === "user" ? "Vaata arendaja integratsioonijuhendit" : "Vaata tavakasutaja juhendit"}
              </a></p>
            </>
          ) : page === "not-found" ? (
            <>
              <p>Sellise aadressiga juhendit ei ole. Vali kasutaja- või arendajajuhend dokumentatsiooni avalehelt.</p>
              <a className="docs-action" href="/docs">Ava juhendite ülevaade</a>
            </>
          ) : (
            <>
              <p className="docs-lead">Kuidas allikapõhist keskkonnaotsingut kasutada ja kuidas see Keskkonnaportaali süsteemiga ühendada.</p>
              <div className="docs-notice">Praktikaversioon, mitte ametlik tootmisteenus. Juhendid kirjeldavad 02.10.2026 kontrollitud lahendust; portaali integratsioon ei ole veel tehtud.</div>
              <div className="docs-guides">
                <a href="/docs/kasutajale" className="docs-guide-link">
                  <h2>Kasutajale</h2>
                  <p>Alusta küsimusest. Loe vastust, kontrolli viiteid, täpsusta tulemusi ja jätka otsingut.</p>
                  <span>Ava kasutusjuhend</span>
                </a>
                <a href="/docs/arendajale" className="docs-guide-link">
                  <h2>Arendajale</h2>
                  <p>Integratsiooni piirid, API näited, juurutamine, turve ja kontrollnimekiri üleandmiseks.</p>
                  <span>Ava integratsioonijuhend</span>
                </a>
              </div>
              <section className="docs-section">
                <h2>Mida see dokumentatsioon katab?</h2>
                <p>Praeguse otsingu ja eraldi Terrapointi vaate kasutamist ning otsingu ühendamist olemasoleva portaaliga. See ei kirjelda portaali sisemisi haldusliideseid ega kasutajakontosid.</p>
                <p>Alusta oma rolli juhendist. Iga peatüki saab jagada eraldi lingina sisukorra kaudu.</p>
              </section>
            </>
          )}
        </main>
      </div>
      <footer className="docs-footer">
        <div className="docs-shell"><span>Keskkonnaportaali praktikaprojekt</span><a href="/">Ava otsing</a></div>
      </footer>
    </div>
  );
}
