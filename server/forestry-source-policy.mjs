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

const SOURCE_CLASSES = new Set(FORESTRY_SOURCE_HIERARCHY.map((item) => item.id));
const SOURCE_SCORES = new Map(FORESTRY_SOURCE_HIERARCHY.map((item) => [item.id, item.score]));

function normalizedSourceText(document = {}) {
  return [
    document.title,
    document.organization,
    document.url,
    ...(document.tags || []),
    ...(document.topics || []),
  ].filter(Boolean).join(" ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("et");
}

export function forestrySourceClass(document = {}) {
  const explicit = String(document._forestrySourceClass || "").trim();
  if (SOURCE_CLASSES.has(explicit)) return explicit;
  if (document.sourceTier === "supplementary") return "supplementary";
  const text = normalizedSourceText(document);
  if (/\beurostat\b/u.test(text)) return "eurostat";
  if (/\b(?:aastaraamat mets|metsa aastaraamat|metsaaastaraamat)\b/u.test(text)) return "forest-yearbook";
  if (/\bpuidubilanss\b/u.test(text)) return "wood-balance";
  if (/\b(?:smi|statistiline metsainventuur|statistilise metsainventuuri)\b/u.test(text)) return "smi";
  if (/\bkliimaministeerium\b/u.test(text)) return "climate-ministry";
  if (/\b(?:keskkonnaagentuur|kaur|keskkonnaportaal)\b/u.test(text)) return "environment-agency-portal";
  return "additional-official";
}

export function forestrySourcePreference(document = {}) {
  return SOURCE_SCORES.get(forestrySourceClass(document)) || 0;
}
