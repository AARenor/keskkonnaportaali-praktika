import { createHash } from "node:crypto";
import { fetchOfficialDataset, fetchOfficialJsonDataset } from "./integrations.mjs";

export const MUNICIPAL_WASTE_RECYCLING_CSV_URL = "https://tableau.envir.ee/views/jtmed-OlmejtmeteringlussevttEestijaEuroopaLiit/OlmejtmeteringlussevttEestijaEuroopaLiit.csv?:showVizHome=no";
export const FOREST_BALANCE_EUROSTAT_API_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/for_vol_efa?geo=EE&sinceTimePeriod=2020&stk_flow=NAI&stk_flow=RMOV&indic_fo=FOR&unit=THS_M3&lang=en";
export const FOREST_BALANCE_EUROSTAT_URL = "https://ec.europa.eu/eurostat/web/products-eurostat-news/w/edn-20260320-2";
export const FOREST_BALANCE_EFA_HANDBOOK_URL = "https://ec.europa.eu/eurostat/web/products-manuals-and-guidelines/w/ks-gq-24-015";
export const FOREST_BALANCE_KAUR_URL = "https://keskkonnaagentuur.ee/node/2720";
export const FOREST_FIVE_YEAR_KAUR_URL = "https://keskkonnaagentuur.ee/uudised/smi-segametsade-osakaal-kasvab";

const MAX_INDICATOR_CSV_BYTES = 1_000_000;
const MAX_INDICATOR_CSV_ROWS = 500;
const MAX_INDICATOR_CSV_COLUMNS = 32;
const MAX_INDICATOR_CSV_FIELD_LENGTH = 1_024;
const MIN_MUNICIPAL_WASTE_YEAR = 1990;
const MIN_FOREST_BALANCE_YEAR = 2020;
const MAX_FOREST_BALANCE_VALUE_THOUSAND_M3 = 100_000;
const REVIEWED_FOREST_BALANCE_STATUS_AT = "2026-08-21T00:00:00.000Z";
const REVIEWED_FOREST_BALANCE_MAX_AGE_MS = 400 * 24 * 60 * 60_000;
const LIVE_FOREST_BALANCE_MAX_AGE_MS = 24 * 60 * 60_000;
const FOREST_BALANCE_FUTURE_SKEW_MS = 5 * 60_000;
const REVIEWED_FOREST_BALANCE_YEARS = Object.freeze([2020, 2021, 2022, 2023, 2024]);

// Reviewed, version-pinned copy of the official Eurostat extract used by the
// forestry comparison. It is deliberately date-bounded (2020–2024, with
// missing values preserved) and is used only when the live dataset is stale,
// malformed or temporarily unreachable. This keeps an upstream outage from
// turning a previously verified public question into an evidence-free answer.
function reviewedForestBalanceSnapshot() {
  return {
    id: ["freq", "stk_flow", "indic_fo", "unit", "geo", "time"],
    size: [1, 2, 1, 1, 1, 5],
    dimension: {
      freq: { category: { index: { A: 0 } } },
      stk_flow: { category: { index: { NAI: 0, RMOV: 1 } } },
      indic_fo: { category: { index: { FOR: 0 } } },
      unit: { category: { index: { THS_M3: 0 } } },
      geo: { category: { index: { EE: 0 } } },
      time: { category: { index: { 2020: 0, 2021: 1, 2022: 2, 2023: 3, 2024: 4 } } },
    },
    value: { 0: 14370.94, 2: 9100, 3: 9100, 5: 12179, 7: 12013, 8: 11564 },
    status: { 0: "i", 5: "i", 7: "e", 8: "e" },
  };
}

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
  const input = String(value || "");
  if (Buffer.byteLength(input, "utf8") > MAX_INDICATOR_CSV_BYTES || input.includes("\0")) return null;
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  const text = input.replace(/^\uFEFF/u, "");
  const pushField = () => {
    if (field.length > MAX_INDICATOR_CSV_FIELD_LENGTH || row.length >= MAX_INDICATOR_CSV_COLUMNS) return false;
    row.push(field.trim());
    field = "";
    closedQuote = false;
    return true;
  };
  const pushRow = () => {
    if (!pushField()) return false;
    if (row.some(Boolean)) {
      if (rows.length >= MAX_INDICATOR_CSV_ROWS) return false;
      rows.push(row);
    }
    row = [];
    return true;
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (quoted && character === '"') {
      quoted = false;
      closedQuote = true;
    } else if (quoted) {
      field += character;
    } else if (closedQuote && (character === " " || character === "\t")) {
      continue;
    } else if (closedQuote && character !== "," && character !== "\n" && character !== "\r") {
      return null;
    } else if (character === '"') {
      if (field) return null;
      quoted = true;
    } else if (character === "," && !quoted) {
      if (!pushField()) return null;
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      if (!pushRow()) return null;
    } else {
      field += character;
    }
    if (field.length > MAX_INDICATOR_CSV_FIELD_LENGTH) return null;
  }
  if (quoted) return null;
  if (field || row.length) {
    if (!pushRow()) return null;
  }
  return rows;
}

function municipalRate(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{1,3}(?:[.,]\d{1,6})?$/u.test(normalized)) return null;
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function uniqueHeaderIndex(header, name) {
  const matches = header
    .map((value, index) => (value === name ? index : -1))
    .filter((index) => index >= 0);
  return matches.length === 1 ? matches[0] : -1;
}

function etNumber(value) {
  return new Intl.NumberFormat("et-EE", { maximumFractionDigits: 1 }).format(value);
}

function etDecimal(value, maximumFractionDigits = 3) {
  return new Intl.NumberFormat("et-EE", {
    minimumFractionDigits: 1,
    maximumFractionDigits,
  }).format(value);
}

function etYearList(years = []) {
  if (years.length <= 1) return years[0] || "";
  return `${years.slice(0, -1).map((year) => `${year}.`).join(", ")} ja ${years.at(-1)}`;
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

export function municipalWasteIndicatorFromCsv(query, csv, options = {}) {
  if (!isMunicipalWasteRecyclingRateQuery(query)) return [];
  const rows = csvRows(csv);
  if (!rows || rows.length < 2) return [];
  const header = rows[0];
  const yearIndex = uniqueHeaderIndex(header, "Aasta");
  const nameIndex = uniqueHeaderIndex(header, "Measure Names");
  const estoniaIndex = uniqueHeaderIndex(header, "% Eesti");
  const euIndex = uniqueHeaderIndex(header, "% EL");
  if ([yearIndex, nameIndex, estoniaIndex, euIndex].some((index) => index < 0)) return [];
  const byYear = new Map();
  const seen = new Set();
  const maximumYear = new Date().getUTCFullYear() + 1;
  for (const row of rows.slice(1)) {
    if (row.length !== header.length) return [];
    const yearText = String(row[yearIndex] || "");
    if (!/^(?:19|20)\d{2}$/u.test(yearText)) return [];
    const year = Number(yearText);
    if (year < MIN_MUNICIPAL_WASTE_YEAR || year > maximumYear) return [];
    const entity = row[nameIndex];
    if (entity !== "Eesti" && entity !== "Euroopa Liit (EL)") return [];
    const key = `${year}:${entity}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const values = byYear.get(year) || { year, estonia: null, eu: null };
    if (entity === "Eesti") {
      if (String(row[euIndex] || "").trim()) return [];
      values.estonia = municipalRate(row[estoniaIndex]);
      if (values.estonia === null) return [];
    } else {
      if (String(row[estoniaIndex] || "").trim()) return [];
      values.eu = municipalRate(row[euIndex]);
      if (values.eu === null) return [];
    }
    byYear.set(year, values);
  }
  if (!byYear.size || byYear.size > 150) return [];
  for (const observation of byYear.values()) {
    if (observation.eu !== null && observation.estonia === null) return [];
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
    evidencePolicy: "versioned",
    _answerEvidenceEligible: options.stale !== true,
    _contentHash: createHash("sha256").update(csv).digest("hex"),
    _evidenceVersion: createHash("sha256").update(csv).digest("hex"),
    _publishedAt: `${observation.year}-12-31`,
  }];
}

function forestHarvestComparisonIntent(query) {
  const text = normalize(query);
  if (/\b(?:bruto|kogu|tais)(?:\s+\w+){0,3}\s*juurdekasv\w*\b/u.test(text)) return null;
  const harvestMatch = text.match(/\b(?:rai\w*|puidu ?varum\w*|puidu ?eemaldam\w*|eemaldam\w*)/u);
  const incrementMatch = text.match(/\b(?:neto ?juurde ?kasv\w*|juurde ?kasv\w*)/u)
    || text.match(/\b(?:mets|puist)\w*(?:\s+\w+){0,2}\s+kasv\w*\s+juurde\b/u)
    || text.match(/\b(?:mets|puist)\w*(?:\s+\w+){0,2}\s+kasv\w*\b/u)
    || text.match(/\bkasv\w*\s+juurde\b/u)
    || text.match(/\b(?:kasvunaitaj|kasvuhinnang)\w*\b/u);
  if (!harvestMatch || !incrementMatch) return null;
  const causal = /\b(?:mojuta|pohjusta|tagajarg|miks)\w*/u.test(text);
  if (causal) return null;
  const greater = /\b(?:ulet|suurem|korgem|rohkem)\w*/u.test(text);
  const lower = /\b(?:alla|vaiksem|madalam|vahem)\w*/u.test(text);
  const neutralComparison = /\b(?:vordle|vordlus|suhe|tasakaal|versus|vs)\w*\b/u.test(text)
    || /\braie\w*\s+(?:ja|ning)\s+(?:neto\s*)?juurdekasv\w*\b/u.test(text);
  const harvestIndex = harvestMatch.index;
  const incrementIndex = incrementMatch.index;
  const harvestFirst = harvestIndex <= incrementIndex;
  if (greater) return harvestFirst ? "removals-greater" : "removals-lower";
  if (lower) return harvestFirst ? "removals-lower" : "removals-greater";
  return neutralComparison ? "neutral" : null;
}

export function isForestHarvestBalanceQuery(query) {
  return Boolean(forestHarvestComparisonIntent(query));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validatedDimensionPositions(payload, name, size) {
  const index = payload?.dimension?.[name]?.category?.index;
  let entries;
  if (Array.isArray(index)) {
    if (index.length !== size) return null;
    entries = index.map((value, position) => [value, position]);
  } else if (isPlainObject(index)) {
    entries = Object.entries(index);
    if (entries.length !== size) return null;
  } else {
    return null;
  }
  const positions = new Map();
  const occupied = new Set();
  for (const [rawLabel, rawPosition] of entries) {
    if (typeof rawLabel !== "string" || !rawLabel || rawLabel.length > 80) return null;
    if (!Number.isInteger(rawPosition) || rawPosition < 0 || rawPosition >= size) return null;
    if (positions.has(rawLabel) || occupied.has(rawPosition)) return null;
    positions.set(rawLabel, rawPosition);
    occupied.add(rawPosition);
  }
  if (occupied.size !== size) return null;
  for (let position = 0; position < size; position += 1) {
    if (!occupied.has(position)) return null;
  }
  return positions;
}

function validJsonStatContainer(container, size, validValue, { optional = false } = {}) {
  if (container === undefined || container === null) return optional;
  if (Array.isArray(container)) {
    if (container.length !== size) return false;
    for (let index = 0; index < size; index += 1) {
      if (!Object.hasOwn(container, index) || !validValue(container[index])) return false;
    }
    return true;
  }
  if (!isPlainObject(container) || Object.keys(container).length > size) return false;
  for (const [key, value] of Object.entries(container)) {
    if (!/^(?:0|[1-9]\d*)$/u.test(key)) return false;
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= size || !validValue(value)) return false;
  }
  return true;
}

function validateForestBalanceJsonStat(payload) {
  if (!isPlainObject(payload) || !Array.isArray(payload.id) || !Array.isArray(payload.size)) return null;
  const expected = ["freq", "stk_flow", "indic_fo", "unit", "geo", "time"];
  const ids = payload.id;
  const sizes = payload.size;
  if (ids.length !== expected.length || sizes.length !== expected.length) return null;
  if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) return null;
  if (expected.some((id) => !ids.includes(id))) return null;
  if (!isPlainObject(payload.dimension)) return null;
  const dimensionKeys = Object.keys(payload.dimension);
  if (dimensionKeys.length !== expected.length || dimensionKeys.some((id) => !expected.includes(id))) return null;
  if (sizes.some((size) => !Number.isSafeInteger(size) || size <= 0)) return null;
  const sizeByName = new Map(ids.map((id, index) => [id, sizes[index]]));
  if (sizeByName.get("freq") !== 1
    || sizeByName.get("stk_flow") !== 2
    || sizeByName.get("indic_fo") !== 1
    || sizeByName.get("unit") !== 1
    || sizeByName.get("geo") !== 1
    || sizeByName.get("time") < 1
    || sizeByName.get("time") > 200) return null;
  const totalSize = sizes.reduce((product, size) => product * size, 1);
  if (!Number.isSafeInteger(totalSize) || totalSize <= 0 || totalSize > 400) return null;
  const positions = new Map();
  for (const id of ids) {
    const dimension = validatedDimensionPositions(payload, id, sizeByName.get(id));
    if (!dimension) return null;
    positions.set(id, dimension);
  }
  const exactCodes = new Map([
    ["freq", ["A"]],
    ["stk_flow", ["NAI", "RMOV"]],
    ["indic_fo", ["FOR"]],
    ["unit", ["THS_M3"]],
    ["geo", ["EE"]],
  ]);
  for (const [id, codes] of exactCodes) {
    const actual = positions.get(id);
    if (actual.size !== codes.length || codes.some((code) => !actual.has(code))) return null;
  }
  const maximumYear = new Date().getUTCFullYear() + 1;
  for (const year of positions.get("time").keys()) {
    if (!/^\d{4}$/u.test(year)) return null;
    const numericYear = Number(year);
    if (numericYear < MIN_FOREST_BALANCE_YEAR || numericYear > maximumYear) return null;
  }
  if (!validJsonStatContainer(
    payload.value,
    totalSize,
    (value) => value === null || (typeof value === "number"
      && Number.isFinite(value)
      && value >= 0
      && value <= MAX_FOREST_BALANCE_VALUE_THOUSAND_M3),
  )) return null;
  if (!validJsonStatContainer(
    payload.status,
    totalSize,
    (value) => value === null || (typeof value === "string"
      && value.length <= 16
      && !/[\p{Cc}\p{Cf}]/u.test(value)),
    { optional: true },
  )) return null;
  return { ids, sizes, positions, totalSize };
}

function jsonStatIndex(schema, coordinates) {
  if (!schema || !isPlainObject(coordinates)) return null;
  const coordinateKeys = Object.keys(coordinates);
  if (coordinateKeys.length !== schema.ids.length
    || schema.ids.some((id) => !Object.hasOwn(coordinates, id))) return null;
  let index = 0;
  for (let dimension = 0; dimension < schema.ids.length; dimension += 1) {
    const id = schema.ids[dimension];
    const position = schema.positions.get(id).get(String(coordinates[id]));
    if (!Number.isInteger(position) || position < 0 || position >= schema.sizes[dimension]) return null;
    index = index * schema.sizes[dimension] + position;
  }
  return index;
}

export function forestBalanceObservations(payload) {
  const schema = validateForestBalanceJsonStat(payload);
  if (!schema) return [];
  const years = [...schema.positions.get("time").keys()]
    .filter((value) => /^\d{4}$/u.test(value))
    .sort((left, right) => Number(left) - Number(right));
  const observations = [];
  for (const year of years) {
    const shared = { freq: "A", indic_fo: "FOR", unit: "THS_M3", geo: "EE", time: year };
    const incrementIndex = jsonStatIndex(schema, { ...shared, stk_flow: "NAI" });
    const removalsIndex = jsonStatIndex(schema, { ...shared, stk_flow: "RMOV" });
    const incrementValue = incrementIndex === null ? null : payload?.value?.[incrementIndex];
    const removalsValue = removalsIndex === null ? null : payload?.value?.[removalsIndex];
    const increment = incrementValue === null || incrementValue === undefined ? null : incrementValue;
    const removals = removalsValue === null || removalsValue === undefined ? null : removalsValue;
    observations.push({
      year: Number(year),
      increment: Number.isFinite(increment) ? Number((increment / 1_000).toFixed(6)) : null,
      removals: Number.isFinite(removals) ? Number((removals / 1_000).toFixed(6)) : null,
      incrementStatus: incrementIndex === null ? null : payload?.status?.[incrementIndex] || null,
      removalsStatus: removalsIndex === null ? null : payload?.status?.[removalsIndex] || null,
    });
  }
  return observations;
}

export function validatedForestBalanceProjection(document, {
  currentYear = new Date().getUTCFullYear(),
} = {}) {
  const projection = document?._forestBalance;
  const projectionHash = String(document?._forestBalanceHash || "").trim();
  const contentHash = String(document?._contentHash || "").trim();
  const exactDataset = [document?.url, document?.locator]
    .some((value) => String(value || "").trim() === FOREST_BALANCE_EUROSTAT_API_URL);
  if (document?.id !== "forest-balance-eurostat"
    || !exactDataset
    || !/^[a-f0-9]{64}$/u.test(contentHash)
    || contentHash !== String(document?._evidenceVersion || "").trim()
    || !isPlainObject(projection)
    || !/^[a-f0-9]{64}$/u.test(projectionHash)
    || !Array.isArray(projection.observations)
    || projection.observations.length < 1
    || projection.observations.length > 200
    || !Array.isArray(projection.missingYears)
    || !Number.isInteger(projection.rangeStart)
    || !Number.isInteger(projection.rangeEnd)
    || Object.keys(projection).length !== 4
    || !["observations", "rangeStart", "rangeEnd", "missingYears"]
      .every((key) => Object.hasOwn(projection, key))) return null;

  const observationKeys = ["year", "increment", "removals", "incrementStatus", "removalsStatus"];
  const validStatus = (value) => value === null
    || (typeof value === "string" && value.length <= 16 && !/[\p{Cc}\p{Cf}]/u.test(value));
  const validValue = (value) => value === null
    || (Number.isFinite(value) && value >= 0 && value <= 100);
  if (!projection.observations.every((item, index, observations) => (
    isPlainObject(item)
      && Object.keys(item).length === observationKeys.length
      && observationKeys.every((key) => Object.hasOwn(item, key))
      && Number.isInteger(item.year)
      && item.year >= MIN_FOREST_BALANCE_YEAR
      && item.year <= currentYear + 1
      && (index === 0 || item.year > observations[index - 1].year)
      && validValue(item.increment)
      && validValue(item.removals)
      && validStatus(item.incrementStatus)
      && validStatus(item.removalsStatus)
  ))) return null;

  const expectedMissingYears = projection.observations
    .filter((item) => item.increment === null || item.removals === null)
    .map((item) => item.year);
  if (projection.rangeStart !== projection.observations[0].year
    || projection.rangeEnd !== projection.observations.at(-1).year
    || projection.missingYears.length !== expectedMissingYears.length
    || !projection.missingYears.every((year, index) => (
      Number.isInteger(year) && year === expectedMissingYears[index]
    ))) return null;

  // All nested fields have been reduced to bounded primitives above, so the
  // digest cannot traverse attacker-controlled/circular object structure.
  const serialized = JSON.stringify(projection);
  const expectedHash = createHash("sha256").update(serialized).digest("hex");
  return expectedHash === projectionHash ? projection : null;
}

function forestBalanceKaurDocuments() {
  return [
    {
      id: "forest-balance-kaur-methodology",
      title: "Netojuurdekasvu ja raie tasakaal – üks jätkusuutlikku metsamajandust kirjeldav näitaja",
      organization: "Keskkonnaagentuur",
      type: "Analüüs",
      published: "09.04.2026",
      url: FOREST_BALANCE_KAUR_URL,
      summary: "Keskkonnaagentuuri analüüsi järgi oli viimase kümnendi keskmisena elusate puude raiemaht majandatavate metsade netojuurdekasvust kõrgem, kuid 20 aasta vaates madalam. Lühiajalist ületamist ei saa üksi nimetada üle- ega alaraieks.",
      content: "Netojuurdekasv saadakse, kui juurdekasvust arvatakse maha looduslik suremus. Viimase kümnendi keskmisena on elusate puude raiemaht olnud kõrgem kui majandatavate metsade netojuurdekasv. Kui vaadelda 20 aasta pikkust perioodi, on elusate puude raiemaht olnud alla netojuurdekasvu. Pikaajalise kestlikkuse hindamiseks tuleb arvestada ka metsa vanuselist ja puuliigilist struktuuri, looduslikke kadusid, kahjustusi ja tagavara muutust.",
      topics: ["mets", "raiemaht", "netojuurdekasv", "pikaajaline trend", "SMI"],
      tags: ["mets", "raiemaht", "netojuurdekasv", "pikaajaline trend", "SMI"],
      sourceTier: "official",
      retrieval: "official-structured-forestry-source",
      evidencePolicy: "claim-specific",
      _answerEvidenceEligible: true,
      _publishedAt: "2026-04-09",
    },
    {
      id: "forest-balance-kaur-five-year",
      title: "SMI: Segametsade osakaal kasvab",
      organization: "Keskkonnaagentuur",
      type: "Metsastatistika",
      published: "10.06.2024",
      url: FOREST_FIVE_YEAR_KAUR_URL,
      summary: "Viimase viie raiehooaja 2018/2019–2022/2023 keskmine raiemaht oli 11,2 miljonit tihumeetrit. Raiemaht oli 2021. aastal 10,0 ja 2022. aastal 12,1 miljonit tihumeetrit.",
      content: "Keskkonnaagentuuri SMI ülevaate järgi püsis raiemaht viimastel aastatel ligikaudu 10–12 miljoni tihumeetri tasemel. 2021. aasta raiemaht oli 10,0 miljonit tihumeetrit ja 2022. aasta raiemaht 12,1 miljonit tihumeetrit. Viimase viie raiehooaja 2018/2019–2022/2023 keskmine oli 11,2 miljonit tihumeetrit. Ülevaade rõhutab, et pikemas vaates peavad raie ja netojuurdekasv majandatavates metsades olema tasakaalus, kuid lühiajaline kõrvalekalle võib olla loomulik.",
      topics: ["mets", "raiemaht", "viis aastat", "SMI", "2021", "2022", "2023"],
      tags: ["mets", "raiemaht", "viis aastat", "SMI", "2021", "2022", "2023"],
      sourceTier: "official",
      retrieval: "official-structured-forestry-source",
      evidencePolicy: "claim-specific",
      _answerEvidenceEligible: true,
      _publishedAt: "2024-06-10",
    },
  ];
}

export function forestHarvestBalanceDocumentsFromJson(query, payload, options = {}) {
  if (!isForestHarvestBalanceQuery(query)) return [];
  const observations = forestBalanceObservations(payload);
  const comparable = observations.filter((item) => item.increment !== null && item.removals !== null);
  const kaur = forestBalanceKaurDocuments();
  if (!comparable.length) return kaur;
  const rangeStart = observations[0]?.year;
  const rangeEnd = observations.at(-1)?.year;
  const rangeSentence = Number.isInteger(rangeStart) && Number.isInteger(rangeEnd)
    ? `Kasutatud väljavõtte aastad on ${rangeStart}–${rangeEnd}; ${rangeEnd + 1}. aasta rida selles väljavõttes ei ole.`
    : "";
  const observationsText = comparable.map((item) => {
    const difference = Math.abs(item.removals - item.increment);
    const relation = item.removals > item.increment
      ? `ületas netojuurdekasvu ${etDecimal(difference, 1)} miljoni m³ võrra`
      : item.removals < item.increment
        ? `jäi netojuurdekasvust ${etDecimal(difference, 1)} miljoni m³ võrra madalamaks`
        : "võrdus netojuurdekasvuga";
    return `${item.year}. aastal oli netojuurdekasv ${etDecimal(item.increment, 1)} ja Eurostati puidu eemaldamine (removals) ${etDecimal(item.removals, 1)} miljonit m³ koorega, seega eemaldamine ${relation}`;
  }).join(". ");
  const missingYears = observations
    .filter((item) => item.increment === null || item.removals === null)
    .map((item) => item.year);
  const sourcePayload = JSON.stringify(payload);
  const contentHash = createHash("sha256").update(sourcePayload).digest("hex");
  const liveFetchedAt = Number(options.fetchedAt);
  const validationNow = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const liveTimestampIsValid = Number.isFinite(liveFetchedAt)
    && liveFetchedAt > 0
    && liveFetchedAt <= validationNow + FOREST_BALANCE_FUTURE_SKEW_MS
    && validationNow - liveFetchedAt <= LIVE_FOREST_BALANCE_MAX_AGE_MS;
  const evidenceStatusAt = options.reviewedSnapshot === true
    ? REVIEWED_FOREST_BALANCE_STATUS_AT
    : liveTimestampIsValid
      ? new Date(liveFetchedAt).toISOString()
      : null;
  const answerEvidenceEligible = options.stale !== true
    && (options.reviewedSnapshot === true || liveTimestampIsValid);
  const forestBalanceProjection = { observations, rangeStart, rangeEnd, missingYears };
  const forestBalanceHash = createHash("sha256")
    .update(JSON.stringify(forestBalanceProjection))
    .digest("hex");
  return [{
    id: "forest-balance-eurostat",
    title: "Eesti puidu eemaldamine ja netojuurdekasv Eurostati metsa arvepidamises",
    organization: "Eurostat",
    type: "Ametlik andmestik",
    published: "20.03.2026",
    // The machine-readable dataset is the identity of this numeric evidence.
    // Keeping the landing/news page as the canonical URL lets an unrelated
    // corpus or discovery card at that page collapse into this record during
    // deduplication and strip the structured observation tuple. The exact API
    // URL also gives readers the source that actually contains the values.
    url: FOREST_BALANCE_EUROSTAT_API_URL,
    locator: FOREST_BALANCE_EUROSTAT_API_URL,
    summary: `${rangeSentence} ${observationsText}.${forestObservationStatusSentence(comparable)}`.trim(),
    content: `Eurostati European Forest Accounts andmestiku for_vol_efa näitaja FOR, algühik tuhat kuupmeetrit koorega; kasutajavastuses on väärtused teisendatud miljoniteks kuupmeetriteks. ${rangeSentence} ${observationsText}. ${missingYears.length ? `Mõlemat võrreldavat väärtust ei ole aastate ${missingYears.join(", ")} kohta avaldatud.` : ""}`.trim(),
    topics: ["mets", "raiemaht", "puidu eemaldamine", "netojuurdekasv", "Eurostat", ...comparable.map((item) => String(item.year))],
    tags: ["mets", "raiemaht", "puidu eemaldamine", "netojuurdekasv", "Eurostat", ...comparable.map((item) => String(item.year))],
    sourceTier: "official",
    retrieval: options.reviewedSnapshot === true
      ? "reviewed-official-eurostat-snapshot"
      : "official-eurostat-json",
    evidencePolicy: "versioned",
    _answerEvidenceEligible: answerEvidenceEligible,
    _contentHash: contentHash,
    _evidenceVersion: contentHash,
    ...(evidenceStatusAt ? {
      _evidenceStatusAt: evidenceStatusAt,
      freshness: {
        class: options.reviewedSnapshot === true
          ? "annual-official-dataset-snapshot"
          : "live-official-dataset",
        basis: "retrieved-at",
        maxAgeMs: options.reviewedSnapshot === true
          ? REVIEWED_FOREST_BALANCE_MAX_AGE_MS
          : LIVE_FOREST_BALANCE_MAX_AGE_MS,
        requiresSourceTimestamp: true,
      },
    } : {}),
    _publishedAt: "2026-03-20",
    _stale: options.stale === true,
    _forestBalanceHash: forestBalanceHash,
    _forestBalance: forestBalanceProjection,
  }, {
    id: "forest-balance-eurostat-handbook",
    title: "European Forest Accounts Handbook: puidu eemaldamine ja netojuurdekasv",
    organization: "Eurostat",
    type: "Metoodika",
    published: "2024",
    url: FOREST_BALANCE_EFA_HANDBOOK_URL,
    summary: "EFA removals mõõdab aruandeperioodil metsast eemaldatud elusate ja surnud puude mahtu koorega. Sama aasta eemaldamise ja netojuurdekasvu võrdlus näitab, kas eemaldamine ületab juurdekasvu või jääb sellest alla, kuid EFA näitaja ei võrdu üks-ühele ühe aasta SMI raiemahuga.",
    content: "European Forest Accounts käsiraamatu peatükid 4.14–4.18 määratlevad mahu koorega. Removals hõlmab aruandeperioodil metsast eemaldatud elusaid ja surnud puid, sealhulgas metsast ära toodud looduslikku väljalangemist, varasemal perioodil langetatud puitu ning eemaldatud mittetüvepuitu. Sama aasta eemaldamise ja netojuurdekasvu võrdlus näitab, kas eemaldamine ületab juurdekasvu või jääb sellest alla. Seetõttu ei ole EFA removals üks-ühele sama mis ühe aasta SMI raiemaht.",
    topics: ["mets", "puidu eemaldamine", "removals", "metoodika", "koorega"],
    tags: ["mets", "puidu eemaldamine", "removals", "metoodika", "koorega"],
    sourceTier: "official",
    retrieval: "official-eurostat-methodology",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    _publishedAt: "2024-01-01",
  }, ...kaur];
}

function forestObservationStatusSentence(observations = []) {
  const labels = { i: "imputeerituna", e: "hinnangulisena", p: "esialgsena" };
  const details = [];
  for (const observation of observations) {
    const incrementLabel = labels[observation.incrementStatus];
    const removalsLabel = labels[observation.removalsStatus];
    if (incrementLabel) details.push(`${observation.year}. aasta netojuurdekasv on märgitud ${incrementLabel}`);
    if (removalsLabel) details.push(`${observation.year}. aasta eemaldamine on märgitud ${removalsLabel}`);
  }
  return details.length ? ` Eurostati kvaliteedimärgendid: ${details.join("; ")}.` : "";
}

export function composeForestHarvestBalanceAnswer(query, sources = [], controlQuery = query) {
  const comparisonIntent = forestHarvestComparisonIntent(query);
  if (!comparisonIntent) return null;
  const citationFor = (id) => {
    const index = sources.findIndex((source) => source.id === id);
    return index >= 0 ? index + 1 : null;
  };
  const eurostat = sources.find((source) => source.id === "forest-balance-eurostat");
  const eurostatCitation = citationFor("forest-balance-eurostat");
  const handbookCitation = citationFor("forest-balance-eurostat-handbook");
  const methodCitation = citationFor("forest-balance-kaur-methodology");
  const fiveYearCitation = citationFor("forest-balance-kaur-five-year");
  const allObservations = validatedForestBalanceProjection(eurostat)?.observations || [];
  const observations = allObservations.filter((item) => item.increment !== null && item.removals !== null);
  const controlText = String(controlQuery || "");
  const controlYear = requestedYear(controlText);
  const controlLastFiveIntent = /\b(?:viimase\s+(?:5|viie)|5\s+aasta|viie\s+aasta|viis\s+aastat)\b/iu.test(controlText);
  const temporalQuery = controlYear || controlLastFiveIntent ? controlText : query;
  const explicitYear = requestedYear(temporalQuery);
  if (!observations.length || !eurostatCitation) return null;
  const requestedObservation = explicitYear
    ? allObservations.find((item) => item.year === explicitYear)
    : null;
  if (explicitYear && (!requestedObservation
    || requestedObservation.increment === null
    || requestedObservation.removals === null)) {
    const missingYearExplanation = [
      methodCitation ? "Netojuurdekasv arvestab juurdekasvust maha loodusliku suremuse." : "",
      handbookCitation ? "Eurostati käsiraamatu järgi näitab sama aasta eemaldamise ja netojuurdekasvu võrdlus, kas eemaldamine ületab juurdekasvu või jääb sellest alla." : "",
    ].filter(Boolean).join(" ");
    return {
      answer: {
        eyebrow: "Allikapõhine koondvastus",
        title: `${explicitYear}. aasta kohta võrreldav paar puudub`,
        intro: `Kasutatud Eurostati metsa arvepidamise väljavõttes ei ole ${explicitYear}. aasta kohta korraga avaldatud nii Eesti netojuurdekasvu kui ka puidu eemaldamise (removals) väärtust. Seetõttu ei saa selle andmerea põhjal nende suhet sel aastal hinnata.`,
        introCitations: [eurostatCitation],
        parts: missingYearExplanation ? [{
          title: "Miks ma puuduvat väärtust ei asenda",
          text: missingYearExplanation,
          citations: [methodCitation, handbookCitation].filter(Boolean),
        }] : [],
        note: "Puuduv võrreldav paar ei tähenda, et raiet või juurdekasvu sel aastal ei olnud; see tähendab ainult, et kasutatud ametlikus reas ei ole mõlemat väärtust avaldatud.",
      },
      related: [
        "Milliste aastate kohta on mõlemad väärtused olemas?",
        "Mis vahe on kogu- ja netojuurdekasvul?",
        "Mida see viimase viie aasta jooksul tähendab?",
      ],
    };
  }
  const lastFiveIntent = /\b(?:viimase\s+(?:5|viie)|5\s+aasta|viie\s+aasta|viis\s+aastat)\b/iu.test(String(temporalQuery));

  if (lastFiveIntent) {
    const window = allObservations.slice(-5);
    const comparableWindow = window.filter((item) => item.increment !== null && item.removals !== null);
    const missingWindow = window.filter((item) => item.increment === null || item.removals === null).map((item) => item.year);
    const availableWindow = comparableWindow
      .map((item) => `${item.year}: eemaldamine ${etDecimal(item.removals, 1)} ja netojuurdekasv ${etDecimal(item.increment, 1)} mln m³ koorega`)
      .join("; ");
    const higherYears = comparableWindow.filter((item) => item.removals > item.increment).map((item) => String(item.year));
    const lowerYears = comparableWindow.filter((item) => item.removals < item.increment).map((item) => String(item.year));
    const equalYears = comparableWindow.filter((item) => item.removals === item.increment).map((item) => String(item.year));
    const relations = [
      higherYears.length ? `${etYearList(higherYears)}. aastal oli eemaldamine suurem` : "",
      lowerYears.length ? `${etYearList(lowerYears)}. aastal oli eemaldamine väiksem` : "",
      equalYears.length ? `${etYearList(equalYears)}. aastal olid näitajad võrdsed` : "",
    ].filter(Boolean).join("; ");
    const startYear = window[0]?.year;
    const endYear = window.at(-1)?.year;
    const nextUnavailableYear = Number.isInteger(endYear) ? endYear + 1 : null;
    const latestWindow = comparableWindow.at(-1);
    const latestWindowRelation = latestWindow
      ? latestWindow.removals > latestWindow.increment
        ? "suurem"
        : latestWindow.removals < latestWindow.increment ? "väiksem" : "sama suur"
      : null;
    const incompleteWindow = window.length < 5 || missingWindow.length > 0;
    return {
      answer: {
        eyebrow: "Allikapõhine koondvastus",
        title: incompleteWindow
          ? `${startYear}–${endYear} viie aasta kohta ei saa lünkade tõttu täielikku trendi anda`
          : `Viie värskeima võrdlusaasta reas oli ${latestWindow.year}. aastal eemaldamine netojuurdekasvust ${latestWindowRelation}`,
        intro: `„Viimased viis aastat” tähendab siin Eurostati kasutatud väljavõtte viit värskeimat allikas olevat aastat (${startYear}–${endYear}); ${nextUnavailableYear}. aasta rida selles väljavõttes veel ei ole. Avaldatud on need võrreldavad paarid: ${availableWindow || "ühtegi täielikku paari ei ole"}. ${relations ? `${relations}.` : ""}${missingWindow.length ? ` Aastate ${missingWindow.join(" ja ")} kohta puudub vähemalt üks võrreldav väärtus, seega ei moodusta need punktid täielikku viie aasta trendi.` : ""}${forestObservationStatusSentence(comparableWindow)}`,
        introCitations: [eurostatCitation],
        parts: [
          ...(handbookCitation ? [{
            title: "Mida Eurostati eemaldamine tähendab",
            text: "EFA removals mõõdab perioodil metsast eemaldatud elusate ja surnud puude mahtu koorega ning võib hõlmata metsast ära toodud looduslikku väljalangemist, varem langetatud puitu ja mittetüvepuitu. See ei ole üks-ühele sama mis ühe aasta SMI raiemaht.",
            citations: [handbookCitation],
          }] : []),
          ...(fiveYearCitation ? [{
            title: "KAURi eraldi viie raiehooaja vaade",
            text: "Keskkonnaagentuuri 2024. aasta SMI ülevaates oli 2018/2019–2022/2023 viie raiehooaja keskmine raiemaht 11,2 miljonit tihumeetrit; 2021. aasta hinnang oli 10,0 ja 2022. aasta hinnang 12,1 miljonit tihumeetrit. See ei ole sama ajavahemik ega üks-ühele sama näitaja kui Eurostati removals-rida.",
            citations: [fiveYearCitation],
          }] : []),
          ...(methodCitation ? [{
            title: "Pikem võrdlus annab teise vaate",
            text: "Keskkonnaagentuuri järgi oli viimase kümnendi keskmisena elusate puude raiemaht majandatavate metsade netojuurdekasvust kõrgem, kuid 20 aasta vaates madalam. Üks lühike või lünklik periood ei tõenda üksi pikaajalist üle- ega alaraiet.",
            citations: [methodCitation],
          }] : []),
        ].slice(0, 3),
        note: "Puuduvaid aastaid ei ole interpoleeritud. Eurostati puidu eemaldamise, SMI raiemahu ning kogu- ja netojuurdekasvu mõisted ja ulatused ei ole omavahel asendatavad.",
      },
      related: [
        "Mis vahe on kogu- ja netojuurdekasvul?",
        "Kuidas on raiemaht 20 aasta jooksul muutunud?",
        "Miks netojuurdekasv viimastel aastatel vähenes?",
      ],
    };
  }

  const latest = requestedObservation || observations.at(-1);
  const latestDifference = Math.abs(latest.removals - latest.increment);
  const removalsGreater = latest.removals > latest.increment;
  const removalsLower = latest.removals < latest.increment;
  const predicateResult = comparisonIntent === "removals-greater"
    ? removalsGreater
    : comparisonIntent === "removals-lower" ? removalsLower : null;
  const relation = removalsGreater
    ? `puidu eemaldamine ületas netojuurdekasvu umbes ${etDecimal(latestDifference, 1)} miljoni m³ võrra (maht koorega)`
    : removalsLower
      ? `puidu eemaldamine jäi netojuurdekasvust umbes ${etDecimal(latestDifference, 1)} miljoni m³ võrra madalamaks (maht koorega)`
      : "puidu eemaldamine ja netojuurdekasv olid võrdsed";
  const qualitySentence = forestObservationStatusSentence([latest]);
  const directTitle = predicateResult === null
    ? `${latest.year}. aastal oli puidu eemaldamine netojuurdekasvust ${removalsGreater ? "suurem" : removalsLower ? "väiksem" : "sama suur"}`
    : `${latest.year}. aasta võrreldavate andmete järgi ${predicateResult ? "jah" : "ei"}`;
  const directLead = predicateResult === null ? "" : `${predicateResult ? "Jah" : "Ei"}. `;

  return {
    answer: {
      eyebrow: "Allikapõhine koondvastus",
      title: directTitle,
      intro: `${directLead}Eurostati metsa arvepidamises oli Eesti ${latest.year}. aasta puidu eemaldamine (removals) ${etDecimal(latest.removals, 1)} miljonit m³ koorega ja netojuurdekasv ${etDecimal(latest.increment, 1)} miljonit m³ koorega; ${relation}.${qualitySentence}`,
      introCitations: [eurostatCitation],
      parts: [
        ...(handbookCitation ? [{
          title: "Mida Eurostati eemaldamine tähendab",
          text: "EFA removals mõõdab perioodil metsast eemaldatud elusate ja surnud puude mahtu koorega ning võib hõlmata metsast ära toodud looduslikku väljalangemist, varem langetatud puitu ja mittetüvepuitu. See ei ole üks-ühele sama mis ühe aasta SMI raiemaht.",
          citations: [handbookCitation],
        }] : []),
        ...(methodCitation ? [{
          title: "Eraldi KAURi raiemahu võrdlus",
          text: "Netojuurdekasv on kogu juurdekasv pärast loodusliku suremuse mahaarvamist. Keskkonnaagentuur kirjutab eraldi majandatavate metsade SMI võrdluses, et elusate puude raiemaht oli viimase kümnendi keskmisena netojuurdekasvust kõrgem, kuid 20 aasta vaates madalam.",
          citations: [methodCitation],
        }] : []),
        ...(fiveYearCitation ? [{
          title: "Lühem taust",
          text: handbookCitation
            ? "SMI järgi oli 2018/2019–2022/2023 viie raiehooaja keskmine raiemaht 11,2 miljonit tihumeetrit. See taust ei ole sama ajavahemik ega üks-ühele sama näitaja kui Eurostati puidu eemaldamine ning ei anna üksi lõplikku hinnangut metsamajanduse kestlikkusele."
            : "SMI järgi oli 2018/2019–2022/2023 viie raiehooaja keskmine raiemaht 11,2 miljonit tihumeetrit.",
          citations: [fiveYearCitation, methodCitation, handbookCitation].filter(Boolean),
        }] : []),
      ],
      note: "Eurostati puidu eemaldamine (removals), SMI raiemaht ning kogu- ja netojuurdekasv ei ole üks-ühele asendatavad. Järeldus kehtib ainult samas allikas, aastas ja ulatuses võrreldud näitajatele.",
    },
    related: [
      "Mida see viimase viie aasta jooksul tähendab?",
      "Mis vahe on kogu- ja netojuurdekasvul?",
      "Kuidas on raiemaht 20 aasta jooksul muutunud?",
    ],
  };
}

export async function loadStructuredIndicatorDocuments(query, options = {}) {
  const timeoutMs = Math.max(250, Math.min(Number(options.timeoutMs) || 2_000, 4_000));
  const documents = [];
  if (isMunicipalWasteRecyclingRateQuery(query)) {
    try {
      const result = await fetchOfficialDataset(MUNICIPAL_WASTE_RECYCLING_CSV_URL, {
        timeoutMs,
        signal: options.signal,
      });
      documents.push(...municipalWasteIndicatorFromCsv(query, result.body, { stale: result.stale }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The rest of the ranked official search remains available.
    }
  }
  if (isForestHarvestBalanceQuery(query)) {
    const reviewedDocuments = () => forestHarvestBalanceDocumentsFromJson(
      query,
      reviewedForestBalanceSnapshot(),
      { reviewedSnapshot: true },
    );
    try {
      const fetchJsonDataset = options.fetchJsonDataset || fetchOfficialJsonDataset;
      const result = await fetchJsonDataset(FOREST_BALANCE_EUROSTAT_API_URL, {
        timeoutMs,
        signal: options.signal,
      });
      const fetchedDocuments = forestHarvestBalanceDocumentsFromJson(
        query,
        JSON.parse(result.body),
        { stale: result.stale, fetchedAt: result.fetchedAt, now: options.now },
      );
      const hasFreshComparison = fetchedDocuments.some((document) => {
        if (document.id !== "forest-balance-eurostat"
          || document._answerEvidenceEligible !== true) return false;
        const observedYears = new Set(
          (document._forestBalance?.observations || []).map((observation) => observation.year),
        );
        return REVIEWED_FOREST_BALANCE_YEARS.every((year) => observedYears.has(year));
      });
      documents.push(...(hasFreshComparison ? fetchedDocuments : reviewedDocuments()));
    } catch (error) {
      if (options.signal?.aborted) throw error;
      documents.push(...reviewedDocuments());
    }
  }
  return documents;
}
