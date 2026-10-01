// Short publisher label for citation chips and result lists. Material served
// from keskkonnaportaal.ee is credited to Keskkonnaportaal even when the page
// names Keskkonnaagentuur as its author; other KAUR data (envir.ee,
// keskkonnaagentuur.ee, Ilmateenistus, EELIS) is credited to Keskkonnaagentuur.
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
  if (/^Keskkonnaportaal/iu.test(organization)) return "Keskkonnaportaal";
  if (AGENCY.test(organization)) {
    return servedFromPortal(source?.url, source?.actionUrl) ? "Keskkonnaportaal" : "Keskkonnaagentuur";
  }
  return organization;
}
