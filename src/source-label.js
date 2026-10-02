// Short publisher label for citation chips and result lists. Preserve an
// explicitly named publisher even when its material is hosted in another
// organization's portal. Never expose Keskkonnaagentuur's old KAUR shorthand.
const PORTAL_HOST = /(^|\.)keskkonnaportaal\.ee$/iu;
const AGENCY = /keskkonnaagentuur|\bKAUR\b/iu;
const CITATION_COLORS = ["#005b83", "#73519b", "#8d4900", "#007367", "#a32e52", "#526b00", "#574cca", "#98600b", "#9b3d22", "#3c6677"];

export function citationColor(number) {
  return CITATION_COLORS[(Math.max(1, Number(number) || 1) - 1) % CITATION_COLORS.length];
}

export function latestSourceUpdates(sources = [], now = Date.now()) {
  const dated = sources.flatMap((source) => {
    const text = String(source.updated || "").trim();
    const iso = text.replace(/^(\d{2})\.(\d{2})\.(\d{4})$/u, "$3-$2-$1");
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(iso)) return [];
    const timestamp = Date.parse(iso);
    if (!Number.isFinite(timestamp) || timestamp > now || new Date(timestamp).toISOString().slice(0, 10) !== iso) return [];
    return [{ citation: source.citation, timestamp }];
  });
  if (dated.length < 2) return [];
  const latest = Math.max(...dated.map((source) => source.timestamp));
  return dated.filter((source) => source.timestamp === latest).map((source) => source.citation);
}

function servedFromPortal(...urls) {
  return urls.some((value) => {
    try {
      return PORTAL_HOST.test(new URL(String(value || "")).hostname);
    } catch {
      return false;
    }
  });
}

export function sourceOrganizationLabel(source) {
  const organization = String(source?.organization || "").trim();
  if (AGENCY.test(organization)) return "Keskkonnaagentuur";
  if (/^Keskkonnaportaal/iu.test(organization) || (!organization && servedFromPortal(source?.url, source?.actionUrl))) return "Keskkonnaportaal";
  return organization;
}

export function sourceDateMeta(source = {}) {
  const organization = sourceOrganizationLabel(source);
  const updated = String(source.updated || "").trim();
  const published = String(source.published || "").trim();
  const dataYear = String(source.dataYear || "").trim();
  const dataAsOf = String(source.dataAsOf || "").trim();
  const date = updated || published;
  const dataLabel = dataYear
    ? `Andmed: ${dataYear}${dataAsOf ? ` (seisuga ${dataAsOf})` : ""}`
    : dataAsOf ? `Andmete seis: ${dataAsOf}` : "";
  const dateLabel = date ? `${updated ? "Uuendatud" : "Avaldatud"}: ${date}` : "";
  return [dataLabel, dateLabel, organization ? `Allikas: ${organization}` : ""].filter(Boolean).join(" · ");
}
