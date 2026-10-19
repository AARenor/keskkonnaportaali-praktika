import { sourceResourceKey } from "./source-identity.mjs";
import { officialCitationUrlEligibility } from "./citation-policy.mjs";

// Shared forestry-source order. Relevance and claim coverage stay primary;
// this preference only refines otherwise comparable forestry results.
export const FORESTRY_SOURCE_HIERARCHY = Object.freeze([
  Object.freeze({ id: "smi", label: "Statistiline metsainventuur (SMI)", score: 0.8 }),
  Object.freeze({ id: "forest-yearbook", label: "Aastaraamat „Mets“", score: 0.7 }),
  Object.freeze({ id: "wood-balance", label: "Puidubilanss", score: 0.6 }),
  Object.freeze({ id: "environment-agency-portal", label: "Keskkonnaagentuur ja Keskkonnaportaal", score: 0.5 }),
  Object.freeze({ id: "climate-ministry", label: "Kliimaministeerium", score: 0.4 }),
  Object.freeze({ id: "additional-official", label: "Muud ametlikud allikad", score: 0.3 }),
  Object.freeze({ id: "eurostat", label: "Eurostat", score: 0.2 }),
  Object.freeze({ id: "supplementary", label: "Taustallikad", score: 0.1 }),
]);

const SOURCE_SCORES = new Map(FORESTRY_SOURCE_HIERARCHY.map((item) => [item.id, item.score]));

const PRIMARY_RESOURCES = new Map([
  ["https://keskkonnaportaal.ee/et/teemad/mets/metsastatistika-sh-smi", "smi"],
  ["https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI2024/SMI_2024.pdf", "smi"],
  ["https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI%20tulemused%202025/SMI%202025%20tulemused.xlsx", "smi"],
  ["https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI%20tulemused%202025/SMI%202025%20ettekanne.pdf", "smi"],
  ["https://keskkonnaportaal.ee/sites/default/files/2026-01/SMI%20arendamine%202025%20L%C3%95PPARUANNE_T%C3%9C%20MSI.pdf", "smi"],
  ["https://keskkonnaportaal.ee/sites/default/files/2021-12/Statistiline%20mets%20-%2020%20aastat%20statistilist%20metsainventeerimist%20Eestis.pdf", "smi"],
  ["https://keskkonnaportaal.ee/et/metsa-aastaraamatud", "forest-yearbook"],
  ["https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/Mets%202023.pdf", "forest-yearbook"],
  ["https://keskkonnaportaal.ee/et/puidubilanss-ulevaade-eesti-puidukasutuse-mahust", "wood-balance"],
  ["https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/Puidubilanss%202023.pdf", "wood-balance"],
].map(([url, sourceClass]) => [sourceResourceKey(url), sourceClass]));

export function forestrySourceClass(document = {}) {
  if (document.sourceTier === "supplementary") return "supplementary";
  const citation = officialCitationUrlEligibility(document.url);
  if (!citation.eligible) return "additional-official";
  const publisher = String(document.organization || "").replace(/\s+/gu, " ").trim();
  const host = citation.url.hostname.replace(/^www\./u, "");
  const agencyPublisher = /^(?:Keskkonnaagentuur|KAUR)(?:\s*\/\s*(?:Keskkonnaportaal|Ilmateenistus))?$/iu.test(publisher);
  const portalPublisher = /^Keskkonnaportaal$/iu.test(publisher);
  if ((agencyPublisher || portalPublisher) && ["keskkonnaportaal.ee", "keskkonnaagentuur.ee"].includes(host)) {
    // A primary role is a reviewed publisher/resource pair, never a keyword
    // or an externally supplied _forestrySourceClass override.
    return PRIMARY_RESOURCES.get(sourceResourceKey(document.url)) || "environment-agency-portal";
  }
  if (/^Kliimaministeerium$/iu.test(publisher)
    && ["kliimaministeerium.ee", "keskkonnaportaal.ee"].includes(host)) return "climate-ministry";
  if (/^Eurostat(?:\s*\/.*)?$/iu.test(publisher) && host === "ec.europa.eu") return "eurostat";
  return "additional-official";
}

export function forestrySourcePreference(document = {}) {
  return SOURCE_SCORES.get(forestrySourceClass(document)) || 0;
}
