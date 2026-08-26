import { createHash } from "node:crypto";
import { sourceEvidenceEligibility } from "./source-registry.mjs";

export const CLIMATE_DAILY_API_URL = "https://keskkonnaandmed.envir.ee/f_kliima_paev";
export const CLIMATE_DATASET_INFO_URL = "https://keskkonnaportaal.ee/et/avaandmed/kliimaandmestik";
export const CLIMATE_DATA_DESCRIPTION_URL = "https://keskkonnaportaal.ee/avaandmed/kliimaandmestik/kliimaandmestiku-kirjeldus";

export const CLIMATE_DAILY_STATIONS = Object.freeze([
  { key: "tallinn-harku", code: "AJHARK01", name: "Tallinn-Harku", aliases: ["Tallinn-Harku", "Tallinn Harku", "Harku"] },
  { key: "heltermaa", code: "AJHELT01", name: "Heltermaa", aliases: ["Heltermaa"] },
  { key: "jogeva", code: "AJJOGE01", name: "Jõgeva", aliases: ["Jõgeva", "Jogeva"] },
  { key: "johvi", code: "AJJOHV01", name: "Jõhvi", aliases: ["Jõhvi", "Johvi"] },
  { key: "kihnu", code: "AJKIHN01", name: "Kihnu", aliases: ["Kihnu"] },
  { key: "kunda", code: "AJKUND01", name: "Kunda", aliases: ["Kunda"] },
  { key: "kuusiku", code: "AJKUUS01", name: "Kuusiku", aliases: ["Kuusiku"] },
  { key: "laane-nigula", code: "AJNIGU01", name: "Lääne-Nigula", aliases: ["Lääne-Nigula", "Laane-Nigula", "Lääne Nigula"] },
  { key: "narva", code: "AJNARV01", name: "Narva", aliases: ["Narva"] },
  { key: "pakri", code: "AJPAKR01", name: "Pakri", aliases: ["Pakri"] },
  { key: "parnu", code: "AJPARN01", name: "Pärnu", aliases: ["Pärnu", "Parnu"] },
  { key: "ristna", code: "AJRIST01", name: "Ristna", aliases: ["Ristna"] },
  { key: "roomassaare", code: "AJROOM01", name: "Roomassaare", aliases: ["Roomassaare"] },
  { key: "ruhnu", code: "AJRUHN01", name: "Ruhnu", aliases: ["Ruhnu"] },
  { key: "sorve", code: "AJSORV01", name: "Sõrve", aliases: ["Sõrve", "Sorve"] },
  { key: "tartu-toravere", code: "AJTART01", name: "Tartu-Tõravere", aliases: ["Tartu-Tõravere", "Tartu Toravere", "Tõravere", "Toravere"] },
  { key: "tiirikoja", code: "AJTIIR01", name: "Tiirikoja", aliases: ["Tiirikoja"] },
  { key: "tooma", code: "AJTOOM01", name: "Tooma", aliases: ["Tooma"] },
  { key: "turi", code: "AJTURI01", name: "Türi", aliases: ["Türi", "Turi"] },
  { key: "valga", code: "AJVALG01", name: "Valga", aliases: ["Valga"] },
  { key: "viljandi", code: "AJVILJ01", name: "Viljandi", aliases: ["Viljandi"] },
  { key: "vilsandi", code: "AJVILS01", name: "Vilsandi", aliases: ["Vilsandi"] },
  { key: "virtsu", code: "AJVIRT01", name: "Virtsu", aliases: ["Virtsu"] },
  { key: "voru", code: "AJVORU01", name: "Võru", aliases: ["Võru", "Voru"] },
  { key: "vaike-maarja", code: "AJV-MA01", name: "Väike-Maarja", aliases: ["Väike-Maarja", "Vaike-Maarja", "Väike Maarja"] },
].map((station) => Object.freeze({
  ...station,
  aliases: Object.freeze([...new Set([station.name, ...station.aliases].map((alias) => normalize(alias)))]),
})));
const ELEMENT_CODE = "DTA08";
const ELEMENT_NAME = "Air temperature (daily avg)";
const UNIT = "°C";
const MAX_JSON_BYTES = 64_000;
const MAX_OPERATIONAL_FETCH_AGE_MS = 13 * 60 * 60_000;
const FUTURE_SKEW_MS = 5 * 60_000;
const MIN_YEAR = 1865;
const SELECT_FIELDS = "jaam_kood,jaam_nimi,aasta,kuu,paev,vaartus,element_kood,element_nimi_eng,element_yhik_eng,avaandmed_ts";
const ROW_KEYS = Object.freeze(SELECT_FIELDS.split(",").sort());
const MONTH_ADESSIVE = Object.freeze([
  "jaanuaril", "veebruaril", "märtsil", "aprillil", "mail", "juunil",
  "juulil", "augustil", "septembril", "oktoobril", "novembril", "detsembril",
]);
const MONTH_FORMS = new Map([
  ["jaanuar", 1], ["jaanuari", 1], ["jaanuaril", 1],
  ["veebruar", 2], ["veebruari", 2], ["veebruaril", 2],
  ["marts", 3], ["martsi", 3], ["martsil", 3],
  ["aprill", 4], ["aprilli", 4], ["aprillil", 4],
  ["mai", 5], ["mail", 5], ["juuni", 6], ["juunil", 6],
  ["juuli", 7], ["juulil", 7], ["august", 8], ["augustil", 8],
  ["augusti", 8], ["september", 9], ["septembri", 9], ["septembril", 9],
  ["oktoober", 10], ["oktoobri", 10], ["oktoobril", 10],
  ["november", 11], ["novembri", 11], ["novembril", 11],
  ["detsember", 12], ["detsembri", 12], ["detsembril", 12],
]);
const NATURAL_MONTH_PATTERN = [...MONTH_FORMS.keys()].sort((left, right) => right.length - left.length).join("|");

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et");
}

function normalize(value) {
  return fold(value)
    .replace(/[^0-9a-z]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function hasStationAlias(text, alias) {
  const suffixes = ["l", "s", "lt", "st", "le", "ga"];
  const tokenMatches = (token, aliasToken) => token === aliasToken
    || suffixes.some((suffix) => token === `${aliasToken}${suffix}`);
  const textTokens = text.split(" ").filter(Boolean);
  const aliasTokens = alias.split(" ").filter(Boolean);
  if (aliasTokens.length === 1) return textTokens.some((token) => tokenMatches(token, aliasTokens[0]));
  return textTokens.some((_, start) => aliasTokens.every((aliasToken, offset) => (
    offset === aliasTokens.length - 1
      ? tokenMatches(textTokens[start + offset], aliasToken)
      : textTokens[start + offset] === aliasToken
  )));
}

function isStationToken(station, token) {
  return station.aliases.flatMap((alias) => alias.split(" ")).some((aliasToken) => (
    token === aliasToken
      || ["l", "s", "lt", "st", "le", "ga"].some((suffix) => token === `${aliasToken}${suffix}`)
  ));
}

function validCalendarDate(year, month, day) {
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return Number.isFinite(timestamp)
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function tallinnToday(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tallinn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.year) * 10_000 + Number(values.month) * 100 + Number(values.day);
}

function explicitDate(rawText, now) {
  const text = fold(rawText);
  const candidates = [];
  const numeric = /\b(0?[1-9]|[12]\d|3[01])[./-](0?[1-9]|1[0-2])[./-]((?:19|20)\d{2})\b/gu;
  for (const match of text.matchAll(numeric)) {
    candidates.push({
      day: Number(match[1]), month: Number(match[2]), year: Number(match[3]),
      index: match.index, length: match[0].length,
    });
  }
  const iso = /\b((?:19|20)\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/gu;
  for (const match of text.matchAll(iso)) {
    candidates.push({
      day: Number(match[3]), month: Number(match[2]), year: Number(match[1]),
      index: match.index, length: match[0].length,
    });
  }
  const natural = new RegExp(`\\b(0?[1-9]|[12]\\d|3[01])\\.?\\s+(${NATURAL_MONTH_PATTERN})\\s+((?:19|20)\\d{2})\\b`, "gu");
  for (const match of text.matchAll(natural)) {
    candidates.push({
      day: Number(match[1]), month: MONTH_FORMS.get(match[2]), year: Number(match[3]),
      index: match.index, length: match[0].length,
    });
  }
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/gu)];
  if (candidates.length !== 1 || years.length !== 1) return null;
  const candidate = candidates[0];
  const dateNumber = candidate.year * 10_000 + candidate.month * 100 + candidate.day;
  if (candidate.year < MIN_YEAR || !validCalendarDate(candidate.year, candidate.month, candidate.day)
    || dateNumber >= tallinnToday(now)) return null;
  return { ...candidate, foldedText: text };
}

function climateDailyIntent(query, options = {}) {
  if (typeof query !== "string" || query.length > 180) return null;
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  if (!Number.isFinite(now)) return null;
  const date = explicitDate(query, now);
  if (!date) return null;
  const withoutDate = `${date.foldedText.slice(0, date.index)} ${date.foldedText.slice(date.index + date.length)}`;
  const text = normalize(withoutDate);
  const matchingStations = CLIMATE_DAILY_STATIONS.filter((station) => (
    station.aliases.some((alias) => hasStationAlias(text, alias))
  ));
  if (matchingStations.length !== 1) return null;
  const station = matchingStations[0];
  const tokens = text.split(" ").filter(Boolean);
  const approved = new Set([
    "air", "at", "average", "daily", "in", "mean", "on", "station", "temperature", "the", "was", "what",
    "andmete", "ilm", "ilmajaam", "ilmajaama", "ilmajaamas", "jaam", "jaama", "jaamas",
    "jargi", "keskmine", "keskmiselt", "kui", "mis", "milline", "oli",
    "ohutemperatuur", "oopaevane", "oopaeva", "paevane", "paeva", "soe", "temperatuur", "valideeritud",
  ]);
  const reviewedLanguage = tokens.length > 0 && tokens.every((token) => (
    approved.has(token) || isStationToken(station, token)
  ));
  const asksMean = /\bkeskm(?:ine|iselt)\b/u.test(text) || /\b(?:average|mean)\b/u.test(text);
  const asksTemperature = /\b(?:ohutemperatuur|temperatuur|soe)\b/u.test(text)
    || /\b(?:air\s+)?temperature\b/u.test(text);
  const asksDaily = /\b(?:oopaevane|oopaeva|paevane|paeva)\b/u.test(text) || /\bkeskmiselt\b/u.test(text)
    || /\bdaily\b/u.test(text);
  if (!reviewedLanguage || !asksMean || !asksTemperature || !asksDaily) return null;
  return { year: date.year, month: date.month, day: date.day, station };
}

export function climateDailyMeanIntent(query, options = {}) {
  const intent = climateDailyIntent(query, options);
  return intent ? { ...intent, station: { ...intent.station, aliases: [...intent.station.aliases] } } : null;
}

export function isClimateDailyMeanQuery(query, options = {}) {
  return Boolean(climateDailyIntent(query, options));
}

export function climateDailyQueryUrl(query, options = {}) {
  const intent = climateDailyIntent(query, options);
  if (!intent) return null;
  const url = new URL(CLIMATE_DAILY_API_URL);
  url.searchParams.set("jaam_kood", `eq.${intent.station.code}`);
  url.searchParams.set("element_kood", `eq.${ELEMENT_CODE}`);
  url.searchParams.set("aasta", `eq.${intent.year}`);
  url.searchParams.set("kuu", `eq.${intent.month}`);
  url.searchParams.set("paev", `eq.${intent.day}`);
  url.searchParams.set("select", SELECT_FIELDS);
  url.searchParams.set("limit", "2");
  return url.toString();
}

export function isClimateJogevaDailyMeanQuery(query, options = {}) {
  return isClimateDailyMeanQuery(query, options);
}

export function climateJogevaDailyQueryUrl(query, options = {}) {
  return climateDailyQueryUrl(query, options);
}

function numericTimestamp(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function strictOffsetTimestamp(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?([+-])(\d{2}):(\d{2})$/u);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = "", sign, offsetHourText, offsetMinuteText] = match;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = [
    yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText,
  ].map(Number);
  if (!validCalendarDate(year, month, day) || hour > 23 || minute > 59 || second > 59
    || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  const local = Date.UTC(year, month - 1, day, hour, minute, second, Number(fraction.slice(0, 3).padEnd(3, "0")));
  const offset = (sign === "+" ? 1 : -1) * (offsetHour * 60 + offsetMinute) * 60_000;
  const timestamp = local - offset;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function dateKey(projection) {
  return `${projection.year}-${String(projection.month).padStart(2, "0")}-${String(projection.day).padStart(2, "0")}`;
}

function displayDate(projection) {
  return `${projection.day}. ${MONTH_ADESSIVE[projection.month - 1]} ${projection.year}`;
}

function displayValue(value) {
  return new Intl.NumberFormat("et-EE", { maximumFractionDigits: 2 }).format(Object.is(value, -0) ? 0 : value);
}

function displayPublication(timestamp) {
  return new Intl.DateTimeFormat("et-EE", {
    timeZone: "Europe/Tallinn",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function statement(projection) {
  return `${displayDate(projection)} oli ${projection.stationName} jaama valideeritud ööpäeva keskmine õhutemperatuur ${displayValue(projection.value)} ${UNIT}.`;
}

function content(projection) {
  return `${statement(projection)} DTA08 ööpäeva keskmine arvutatakse kaheksa mõõtmise põhjal. Keskkonnaagentuuri andmeteenuse avaldamisajatempel on ${projection.publishedAt} (${displayPublication(projection.publishedTimestamp)} Eesti aja järgi). See on ${projection.stationName} ilmajaama ajalooline päevanäit, mitte praegune temperatuur ega kogu piirkonna ruumiline keskmine.`;
}

export function climateDailyMeanFromJson(query, json, options = {}) {
  const now = numericTimestamp(options.now, Date.now());
  const intent = climateDailyIntent(query, { now });
  const fetchedAt = numericTimestamp(options.fetchedAt, Number.NaN);
  const input = String(json || "");
  if (!intent || !input || !Number.isFinite(now) || !Number.isFinite(fetchedAt)
    || Buffer.byteLength(input, "utf8") > MAX_JSON_BYTES || input.includes("\0")
    || options.stale === true || fetchedAt > now + FUTURE_SKEW_MS
    || now - fetchedAt > MAX_OPERATIONAL_FETCH_AGE_MS) return [];
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return [];
  }
  if (!Array.isArray(payload) || payload.length !== 1) return [];
  const row = payload[0];
  const publishedTimestamp = strictOffsetTimestamp(row?.avaandmed_ts);
  const observationStart = Date.UTC(intent.year, intent.month - 1, intent.day);
  const observationEnd = observationStart + 24 * 60 * 60_000;
  if (!exactKeys(row, ROW_KEYS)
    || row.jaam_kood !== intent.station.code || row.jaam_nimi !== intent.station.name
    || row.aasta !== intent.year || row.kuu !== intent.month || row.paev !== intent.day
    || row.element_kood !== ELEMENT_CODE || row.element_nimi_eng !== ELEMENT_NAME
    || row.element_yhik_eng !== UNIT || typeof row.vaartus !== "number"
    || !Number.isFinite(row.vaartus) || row.vaartus < -70 || row.vaartus > 60
    || publishedTimestamp === null || publishedTimestamp < observationEnd
    || publishedTimestamp > now + FUTURE_SKEW_MS) return [];

  const projection = {
    stationKey: intent.station.key,
    stationCode: intent.station.code,
    stationName: intent.station.name,
    elementCode: ELEMENT_CODE,
    year: intent.year,
    month: intent.month,
    day: intent.day,
    value: row.vaartus,
    unit: UNIT,
    publishedAt: row.avaandmed_ts,
    publishedTimestamp,
    fetchedAt: new Date(fetchedAt).toISOString(),
  };
  const locator = climateDailyQueryUrl(query, { now });
  return [{
    id: "climate-station-daily-mean",
    title: `${projection.stationName} jaama ööpäeva keskmine õhutemperatuur ${dateKey(projection)}`,
    organization: "Keskkonnaagentuur",
    type: "Valideeritud kliima ööpäevaandmed (JSON)",
    published: String(projection.year),
    url: locator,
    locator: `Andmestiku avaleht: ${CLIMATE_DATASET_INFO_URL}; näitaja kirjeldus: ${CLIMATE_DATA_DESCRIPTION_URL}`,
    summary: statement(projection),
    content: content(projection),
    actionUrl: CLIMATE_DATASET_INFO_URL,
    actionLabel: "Ava kliimaandmestiku kirjeldus",
    topics: ["ajalooline ilm", projection.stationName, "õhutemperatuur", "ööpäeva keskmine", dateKey(projection)],
    tags: ["Keskkonnaagentuur", "kliimaandmed", "DTA08", projection.stationName, "CC BY 4.0"],
    sourceTier: "official",
    retrieval: "official-structured-climate-daily",
    delivery: "structured-or-download",
    routeClasses: ["official_historical_observation", "official_data_or_api"],
    evidencePolicy: "claim-specific",
    freshness: {
      class: "validated-historical-daily-observation",
      basis: "reference-date",
      maxAgeMs: null,
      requiresSourceTimestamp: false,
    },
    _answerEvidenceEligible: true,
    _contentHash: createHash("sha256").update(input).digest("hex"),
    _climateDaily: projection,
  }];
}

export function climateJogevaDailyMeanFromJson(query, json, options = {}) {
  return climateDailyMeanFromJson(query, json, options);
}

function validatedProjection(query, document, now) {
  const intent = climateDailyIntent(query, { now });
  const projection = document?._climateDaily;
  const fetchedAt = Date.parse(String(projection?.fetchedAt || ""));
  const publishedTimestamp = strictOffsetTimestamp(projection?.publishedAt);
  if (!intent || document?.id !== "climate-station-daily-mean"
    || document?.url !== climateDailyQueryUrl(query, { now })
    || document?.retrieval !== "official-structured-climate-daily"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || !projection || projection.stationKey !== intent.station.key
    || projection.stationCode !== intent.station.code || projection.stationName !== intent.station.name
    || projection.elementCode !== ELEMENT_CODE || projection.year !== intent.year
    || projection.month !== intent.month || projection.day !== intent.day
    || projection.unit !== UNIT || typeof projection.value !== "number"
    || !Number.isFinite(projection.value) || projection.value < -70 || projection.value > 60
    || publishedTimestamp === null || publishedTimestamp !== projection.publishedTimestamp
    || publishedTimestamp > now + FUTURE_SKEW_MS
    || !Number.isFinite(fetchedAt) || fetchedAt > now + FUTURE_SKEW_MS
    || now - fetchedAt > MAX_OPERATIONAL_FETCH_AGE_MS
    || document.locator !== `Andmestiku avaleht: ${CLIMATE_DATASET_INFO_URL}; näitaja kirjeldus: ${CLIMATE_DATA_DESCRIPTION_URL}`
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || document.summary !== statement(projection) || document.content !== content(projection)) return null;
  return projection;
}

export function composeClimateDailyMeanResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedProjection(query, document, now));
  if (!source) return null;
  const projection = source._climateDaily;
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: "Valideeritud ajalooline kliimanäit",
      title: `${projection.stationName} jaama ${dateKey(projection)} ööpäeva keskmine oli ${displayValue(projection.value)} ${UNIT}`,
      intro: source.summary,
      introCitations: [1],
      parts: [{
        title: "Mida keskmine tähendab",
        text: `DTA08 on ööpäeva keskmine õhutemperatuur, mis arvutatakse kaheksa mõõtmise põhjal. Andmeteenuse avaldamisajatempel on ${displayPublication(projection.publishedTimestamp)} Eesti aja järgi.`,
        citations: [1],
      }],
      note: `See on ${projection.stationName} ilmajaama valideeritud ajalooline päevanäit, mitte praegune temperatuur, prognoos ega kogu piirkonna ruumiline keskmine. Jaamarea olemasolu ei tõenda katkematut aegrida kõigil kuupäevadel.`,
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: [`${projection.stationName} kliimaandmed`, "Ajaloolised ilmaandmed", "Kliimaandmete päevaread"],
    clarification: null,
    evidence: {
      kind: "structured-climate-daily-mean",
      answerable: true,
      documentIds: [source.id],
    },
  };
}

export function composeClimateJogevaDailyMeanResponse(query, documents = [], options = {}) {
  return composeClimateDailyMeanResponse(query, documents, options);
}
