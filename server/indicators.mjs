import { createHash } from "node:crypto";
import { fetchOfficialDataset } from "./integrations.mjs";

export const MUNICIPAL_WASTE_RECYCLING_CSV_URL = "https://tableau.envir.ee/views/jtmed-OlmejtmeteringlussevttEestijaEuroopaLiit/OlmejtmeteringlussevttEestijaEuroopaLiit.csv?:showVizHome=no";

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^0-9a-z]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function csvRows(value) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = String(value || "").replace(/^\uFEFF/u, "");
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function numeric(value) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function etNumber(value) {
  return new Intl.NumberFormat("et-EE", { maximumFractionDigits: 1 }).format(value);
}

function requestedYear(query) {
  const match = String(query || "").match(/\b((?:19|20)\d{2})\b/u);
  return match ? Number(match[1]) : null;
}

export function isMunicipalWasteRecyclingRateQuery(query) {
  const text = normalize(query);
  return /\b(?:olme ?)?jaatm\w*/u.test(text)
    && /\bringlussev\w*/u.test(text)
    && /\b(?:maar|protsent|osakaal|tase)\w*/u.test(text);
}

export function municipalWasteIndicatorFromCsv(query, csv) {
  if (!isMunicipalWasteRecyclingRateQuery(query)) return [];
  const rows = csvRows(csv);
  if (rows.length < 2) return [];
  const header = rows[0];
  const yearIndex = header.indexOf("Aasta");
  const nameIndex = header.indexOf("Measure Names");
  const estoniaIndex = header.indexOf("% Eesti");
  const euIndex = header.indexOf("% EL");
  if ([yearIndex, nameIndex, estoniaIndex, euIndex].some((index) => index < 0)) return [];
  const byYear = new Map();
  for (const row of rows.slice(1)) {
    const year = Number(row[yearIndex]);
    if (!Number.isInteger(year)) continue;
    const values = byYear.get(year) || { year, estonia: null, eu: null };
    if (row[nameIndex] === "Eesti") values.estonia = numeric(row[estoniaIndex]);
    if (row[nameIndex] === "Euroopa Liit (EL)") values.eu = numeric(row[euIndex]);
    byYear.set(year, values);
  }
  const requested = requestedYear(query);
  const available = [...byYear.values()].filter((item) => item.estonia !== null).sort((left, right) => right.year - left.year);
  const observation = requested ? byYear.get(requested) : available[0];
  if (!observation || observation.estonia === null) return [];
  const estonia = etNumber(observation.estonia);
  const comparison = observation.eu === null ? "" : ` ja Euroopa Liidus ${etNumber(observation.eu)}%`;
  const statement = `Olmejäätmete ringlussevõtu määr Eestis ${observation.year}. aastal oli ${estonia}%${comparison}.`;
  return [{
    id: "municipal-waste-recycling",
    title: "Olmejäätmete ringlussevõtu määr",
    organization: "Keskkonnaportaal / Keskkonnaagentuur",
    type: "Keskkonnanäitaja",
    published: String(observation.year),
    url: "https://keskkonnaportaal.ee/et/olmejaatmete-ringlussevott",
    locator: MUNICIPAL_WASTE_RECYCLING_CSV_URL,
    summary: statement,
    content: `${statement} Andmed on loetud lehele manustatud ametliku Tableau vaate CSV-väljundist.`,
    topics: ["jäätmed", "olmejäätmed", "ringlussevõtt", "ringlussevõtu määr", "protsent", String(observation.year)],
    tags: ["jäätmed", "olmejäätmed", "ringlussevõtt", "protsent", String(observation.year)],
    sourceTier: "official",
    retrieval: "official-tableau-csv",
    _contentHash: createHash("sha256").update(csv).digest("hex"),
    _publishedAt: `${observation.year}-12-31`,
  }];
}

export async function loadStructuredIndicatorDocuments(query, options = {}) {
  if (!isMunicipalWasteRecyclingRateQuery(query)) return [];
  try {
    const result = await fetchOfficialDataset(MUNICIPAL_WASTE_RECYCLING_CSV_URL, {
      timeoutMs: Math.max(250, Math.min(Number(options.timeoutMs) || 2_000, 4_000)),
      signal: options.signal,
    });
    return municipalWasteIndicatorFromCsv(query, result.body);
  } catch {
    return [];
  }
}
