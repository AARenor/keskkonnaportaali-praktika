import { useEffect, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { safeExternalHref } from "./url-safety.js";
import { citationColor, latestSourceUpdates, sourceDateMeta, sourceOrganizationLabel } from "./source-label.js";
import { APP_BUILD_MISMATCH_EVENT } from "./app-build.js";

function citationSourceLabel(source) {
  return sourceOrganizationLabel(source) || "Allikas";
}

export function ExternalAnchor({ children, className, href, ...props }) {
  const safeHref = safeExternalHref(href);
  return (
    <a {...props} aria-disabled={safeHref ? undefined : true} className={className} href={safeHref || undefined} target={safeHref ? "_blank" : undefined} rel={safeHref ? "noreferrer" : undefined}>
      {children}
    </a>
  );
}

export function UpdateNotice() {
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

export function Citation({ number, sources = [] }) {
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

export function SourceLegend({ sources = [] }) {
  if (!sources.length) return null;
  const latest = latestSourceUpdates(sources);
  return (
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
  );
}

export function SourceActions({ sources = [] }) {
  const actions = sources
    .filter((source) => safeExternalHref(source?.actionUrl) && String(source?.actionLabel || "").trim())
    .filter((source, index, items) => items.findIndex((item) => item.actionUrl === source.actionUrl) === index);
  if (!actions.length) return null;
  return (
    <div className="answer-actions">
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

export function AnswerNote({ note }) {
  if (!note || isRedundantAnswerNote(note)) return null;
  return (
    <div className="answer-note"><ShieldCheck aria-hidden="true" size={18} /><p>{note}</p></div>
  );
}
