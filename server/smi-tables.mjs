// Reviewed extracts from Keskkonnaagentuur's SMI 2025 results workbook.
//
// Public charts use the primary workbook, not Statistikaamet republications.
// Missing indicators remain unavailable rather than switching publisher.
//
// Values were copied from the workbook published 18.08.2026: worksheet 1
// (land categories), 25 (forest land area and stock), 28 (stand area and stock
// per hectare), 33 and 34 (felling area and volume, all owners).

import { createHash } from "node:crypto";

export const SMI_2025_TABLES_URL = "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI%20tulemused%202025/SMI%202025%20tulemused.xlsx";
export const SMI_2025_ORGANIZATION = "Keskkonnaagentuur / Keskkonnaportaal";
export const SMI_2025_YEAR = 2025;
const SMI_2025_PUBLISHED_AT = "2026-08-18";

const FIRST_YEAR = 1999;

// Worksheet 1, "Eesti üldpindala jaotus maakategooriate järgi", whole Estonia
// including Lake Peipus and Võrtsjärv. Minor categories are summed so the
// share chart stays within its eight-slice limit; the total is unchanged.
export const SMI_2025_TOTAL_AREA = 4533.9;
export const SMI_2025_FOREST_WITH_TREES = 2151.2;
export const SMI_2025_LAND_CATEGORIES = Object.freeze([
  { code: "metsamaa", label: "Metsamaa", value: 2360.2 },
  { code: "pollumajandusmaa", label: "Põllumajandusmaa", value: 1198.5 },
  { code: "asustus", label: "Asustusala, teed ja trassid", value: 341.2 },
  { code: "veekogud", label: "Siseveed ja muud veekogud", value: 268.8 },
  { code: "soo", label: "Soo", value: 229.5 },
  { code: "muu", label: "Karjäärid ja muud maad", value: 82.4 },
  { code: "poosastik", label: "Põõsastik", value: 53.4 },
].map((item) => Object.freeze(item)));

// Annual national series keyed like the Statistikaamet series they replace:
// KK51 indicator code, or MM03 "<cut type>-<measure>".
const SERIES = Object.freeze({
  "KK51:1": { worksheet: 25, years: [1999, 2025], values: [2192.6, 2243.1, 2235.4, 2215.2, 2255.5, 2282.3, 2271, 2268.7, 2264.9, 2229.3, 2216.6, 2222.2, 2234.6, 2249.6, 2268.5, 2295.5, 2310.6, 2313.6, 2331.1, 2331.3, 2333.2, 2325.5, 2325.6, 2325, 2334.2, 2350.8, 2360.2] },
  "KK51:2": { worksheet: 28, years: [1999, 2025], values: [2053.9, 2095.8, 2075.1, 2052, 2092, 2118.8, 2107.2, 2114, 2116.5, 2082.8, 2071.2, 2081.1, 2089.9, 2101.6, 2115.6, 2136, 2147, 2143.2, 2157.8, 2149.1, 2142.4, 2120.6, 2117.9, 2111.3, 2122.1, 2136.1, 2151.2] },
  "KK51:10": { worksheet: 25, years: [1999, 2025], values: [437081, 451781, 444300, 439062, 443216, 449126, 446508, 448994, 451989, 449667, 454069, 458627, 468067, 474953, 485149, 491428, 493237, 493809, 496784, 490459, 487219, 480268, 472868, 466140, 465222, 465116, 466242] },
  "KK51:18": { worksheet: 28, years: [1999, 2025], values: [212, 214.7, 213.1, 212.9, 210.8, 210.9, 210.8, 211.3, 212.5, 214.8, 218, 219.3, 222.8, 224.9, 228.2, 229, 228.6, 229.1, 228.9, 226.8, 225.8, 224.8, 221.6, 219, 217.4, 216, 214.9] },
  "MM03:1-1": { worksheet: 33, years: [1999, 2024], values: [87, 78.6, 88.1, 85.4, 85.8, 73.7, 67.5, 62.3, 55, 52.5, 61.3, 71.2, 85.5, 84, 88.1, 75.9, 77.6, 74, 82.6, 87.8, 88.3, 88.1, 86.8, 100.5, 109.9, 117.4] },
  "MM03:3-1": { worksheet: 33, years: [1999, 2024], values: [21.6, 23.1, 28.9, 26.6, 23.8, 18.3, 15, 12.2, 12.7, 12.8, 17.3, 22.8, 25, 27.4, 28.7, 29.7, 31.6, 32.4, 35.6, 34.6, 29.7, 29.7, 27.1, 32.6, 32, 34] },
  "MM03:5-1": { worksheet: 33, years: [1999, 2024], values: [34.8, 31.3, 33.3, 30.3, 31.8, 22, 19.3, 12.7, 13.4, 12.5, 16.2, 16.3, 22.6, 18.7, 24.8, 18.9, 18.5, 14.6, 14.9, 19.3, 19.5, 19.4, 15.8, 18.9, 21.5, 25.5] },
  "MM03:1-3": { worksheet: 34, years: [1999, 2024], values: [9885, 9579, 11477, 9670, 9676, 8081, 7987, 6657, 6142, 5694, 6678, 8658, 9584, 10817, 10818, 10749, 10931, 11586, 13340, 13347, 11599, 10951, 10143, 12247, 11880, 12500] },
  "MM03:3-3": { worksheet: 34, years: [1999, 2024], values: [5207, 5471, 6923, 5528, 5360, 4436, 4674, 3989, 4109, 4009, 4570, 6330, 6934, 8338, 8162, 8522, 8754, 9599, 10793, 10532, 8688, 8334, 7864, 9552, 8884, 9231] },
  "MM03:5-3": { worksheet: 34, years: [1999, 2024], values: [3176, 2869, 2917, 2535, 2669, 1897, 1447, 838, 873, 866, 1043, 1072, 1307, 1022, 1402, 1124, 1238, 1073, 1207, 1440, 1409, 1347, 1029, 1347, 1542, 1857] },
});

function seriesKey(table, indicatorCode) {
  return `${table}:${indicatorCode}`;
}

export function smiSeriesWorksheet(table, indicatorCode) {
  return SERIES[seriesKey(table, indicatorCode)]?.worksheet ?? null;
}

// Points for the requested window, or null when the workbook does not publish
// this series or does not cover the whole window.
export function smiSeriesPoints(table, indicatorCode, years) {
  const series = SERIES[seriesKey(table, indicatorCode)];
  if (!series || !years) return null;
  const [from, to] = series.years;
  if (years.from < from || years.to > to || years.from > years.to) return null;
  const points = [];
  for (let year = years.from; year <= years.to; year += 1) {
    points.push({ year, value: series.values[year - FIRST_YEAR] });
  }
  return points;
}

// The SMI workbook entry the answer already cites wins, so the chart reuses
// its citation number instead of listing the same workbook twice.
export function smiTablesSource(draftSources = []) {
  return (draftSources || []).find((document) => document && typeof document === "object"
    && document.url === SMI_2025_TABLES_URL
    && Number.isInteger(document.citation) && document.citation > 0) || null;
}

// Result deduplication merges every document that points at the workbook into
// one visible entry, so presence is decided by URL, not by document id. A
// filter that hides the workbook also removes the SMI chart.
export function smiWorkbookInResults(documents = []) {
  return (documents || []).some((document) => document && typeof document === "object"
    && String(document.url || "").split("#")[0].replace("://www.", "://") === SMI_2025_TABLES_URL);
}

export function smiStructuredDocument({ id, title, summary, content, locator, topics }) {
  return {
    id,
    title,
    organization: SMI_2025_ORGANIZATION,
    type: "Metsastatistika andmetabel",
    published: "18.08.2026",
    url: SMI_2025_TABLES_URL,
    locator,
    summary,
    content,
    topics: ["mets", "SMI", "Keskkonnaagentuur", ...topics],
    tags: ["Keskkonnaagentuur", "mets", "SMI", "2025"],
    sourceTier: "official",
    retrieval: "official-structured-forestry-source",
    delivery: "structured-or-download",
    routeClasses: ["official_indicator_or_report", "official_historical_observation", "official_data_or_api"],
    evidencePolicy: "claim-specific",
    freshness: {
      class: "annual-historical-statistic",
      basis: "reference-year",
      maxAgeMs: null,
      requiresSourceTimestamp: false,
    },
    _publishedAt: SMI_2025_PUBLISHED_AT,
    _answerEvidenceEligible: true,
    _contentHash: createHash("sha256").update(`${id}\n${content}`).digest("hex"),
  };
}
