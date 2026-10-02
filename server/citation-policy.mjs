export const OFFICIAL_CITATION_ORIGIN_VALUES = Object.freeze([
  "https://airviro.klab.ee",
  "https://andmed.stat.ee",
  "https://avaandmed.keskkonnaportaal.ee",
  "https://ec.europa.eu",
  "https://eea.europa.eu",
  "https://foresteurope.org",
  "https://geoportaal.maaamet.ee",
  "https://gsavalik.envir.ee",
  "https://ilmateenistus.ee",
  "https://keskkonnaagentuur.ee",
  "https://www.keskkonnaagentuur.ee",
  "https://keskkonnaamet.ee",
  "https://www.keskkonnaamet.ee",
  "https://keskkonnaandmed.envir.ee",
  "https://keskkonnaportaal.ee",
  "https://www.keskkonnaportaal.ee",
  "https://kliimaatlas.keskkonnaportaal.ee",
  "https://kliimaministeerium.ee",
  "https://www.kliimaministeerium.ee",
  "https://kotkas.envir.ee",
  "https://lva.keskkonnainfo.ee",
  "https://ohuseire.ee",
  "https://www.ohuseire.ee",
  "https://pakis.envir.ee",
  "https://proto.envir.ee",
  "https://register.keskkonnaportaal.ee",
  "https://register.metsad.ee",
  "https://rescue.ee",
  "https://rmk.ee",
  "https://tableau.envir.ee",
  "https://tallinn.ee",
  "https://tartu.ee",
  "https://terviseamet.ee",
  "https://www.eea.europa.eu",
  "https://www.foresteurope.org",
  "https://www.ilmateenistus.ee",
  "https://www.riigiteataja.ee",
  "https://www.rescue.ee",
  "https://www.tallinn.ee",
  "https://www.terviseamet.ee",
]);

export const OFFICIAL_CITATION_ORIGINS = new Set(OFFICIAL_CITATION_ORIGIN_VALUES);
const UTF8_ENCODER = new TextEncoder();

// Transport validation and historical adapter fixtures remain independent of
// the current public publisher-selection policy.
export function publicSourceAllowed(document = {}) {
  if (/\bStatistikaamet\b/iu.test(String(document?.organization || "").trim())) return false;
  try {
    return !/(^|\.)stat\.ee$/iu.test(new URL(String(document?.url || "")).hostname);
  } catch {
    return true; // Citation boundaries independently reject invalid URLs.
  }
}

export function officialCitationUrlEligibility(value) {
  if (typeof value !== "string" || value.length === 0 || UTF8_ENCODER.encode(value).byteLength > 2_000) {
    return { eligible: false, reason: "invalid-url-length" };
  }
  if (value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    return { eligible: false, reason: "invalid-url-characters" };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return { eligible: false, reason: "invalid-url" };
  }
  if (url.protocol !== "https:") return { eligible: false, reason: "https-required" };
  if (url.username || url.password) return { eligible: false, reason: "credentials-forbidden" };
  if (!OFFICIAL_CITATION_ORIGINS.has(url.origin)) {
    return { eligible: false, reason: "unapproved-citation-origin" };
  }
  return { eligible: true, reason: "approved-citation-origin", url };
}
