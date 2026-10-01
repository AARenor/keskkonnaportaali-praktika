// Short publisher label for citation chips and result lists. Preserve an
// explicitly named publisher even when its material is hosted in another
// organization's portal. Never expose Keskkonnaagentuur's old KAUR shorthand.
const PORTAL_HOST = /(^|\.)keskkonnaportaal\.ee$/iu;
const AGENCY = /keskkonnaagentuur|\bKAUR\b/iu;

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
  if (/^Keskkonnaportaal/iu.test(organization) || servedFromPortal(source?.url, source?.actionUrl)) return "Keskkonnaportaal";
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
