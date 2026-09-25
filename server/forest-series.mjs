import { createHash } from "node:crypto";
import { sourceEvidenceEligibility } from "./source-registry.mjs";
import { STATISTICS_DISSEMINATION_POLICY_URL } from "./statistics.mjs";

export const FOREST_SERIES_KK51_API_URL = "https://andmed.stat.ee/api/v1/et/stat/keskkond/loodusvarad-ja-nende-kasutamine/metsavaru/KK51.PX";
export const FOREST_SERIES_KK51_TABLE_URL = "https://andmed.stat.ee/et/stat/keskkond__loodusvarad-ja-nende-kasutamine__metsavaru/KK51";
export const FOREST_SERIES_MM03_API_URL = "https://andmed.stat.ee/api/v1/et/stat/majandus/metsamajandus/MM03.PX";
export const FOREST_SERIES_MM03_TABLE_URL = "https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM03";
export const FOREST_SERIES_TABLE_YEARS = Object.freeze({
  KK51: Object.freeze({ from: 1999, to: 2025 }),
  MM03: Object.freeze({ from: 1999, to: 2024 }),
});

const MAX_QUERY_LENGTH = 180;
const MIN_WINDOW_YEARS = 2;
const MAX_WINDOW_YEARS = 27;
const DEFAULT_WINDOW_YEARS = 10;
const MAX_JSON_BYTES = 64_000;
const MAX_OPERATIONAL_FETCH_AGE_MS = 13 * 60 * 60_000;
const FUTURE_FETCH_SKEW_MS = 5 * 60_000;

const TABLE_LABELS = Object.freeze({
  KK51: "KK51: METSAVARU RIIKLIKU METSAINVENTEERIMISE (SMI) HINNANGUL | Näitaja ning Aasta",
  MM03: "MM03: METSARAIE RIIKLIKU METSAINVENTEERIMISE (SMI) HINNANGUL | Aasta, Raie liik ning Näitaja",
});
const TABLE_TITLES = Object.freeze({
  KK51: "Metsavaru riikliku metsainventeerimise (SMI) hinnangul",
  MM03: "Metsaraie riikliku metsainventeerimise (SMI) hinnangul",
});

// Order matters: the first matching pattern wins, so the more specific
// hectare-stock and increment rows come before the generic stock row.
const KK51_INDICATORS = Object.freeze([
  { code: "34", label: "Territooriumi metsasus, %", name: "Territooriumi metsasus", unit: "%", key: "metsasus", max: 100, pattern: /\bmetsasus\w*/u },
  { code: "18", label: "Puistute keskmine hektarivaru, m³/ha", name: "Puistute keskmine hektarivaru", unit: "m³/ha", key: "hektarivaru", max: 1_000, pattern: /\bhektarivaru\w*|\bhektari\s+(?:tagavara|varu)\w*|\b(?:tagavara|varu)\w*\s+hektari\s+kohta\b/u },
  { code: "26", label: "Puistute varu juurdekasv enamuspuuliigiti aastas, m³/ha", name: "Puistute varu juurdekasv aastas", unit: "m³/ha", key: "juurdekasv", max: 100, pattern: /\bjuurdekasv\w*/u },
  { code: "10", label: "Puistute üldvaru, tuhat m³", name: "Puistute üldvaru", unit: "tuhat m³", key: "uldvaru", max: 1_000_000, pattern: /\btagavara\w*|\buldvaru\w*|\bpuidu\s?varu\w*|\bmetsavaru\w*|\bkasvava\s+metsa\s+varu\w*/u },
  { code: "2", label: "Puistute pindala, tuhat ha", name: "Puistute pindala", unit: "tuhat ha", key: "puistute-pindala", max: 5_000, pattern: /\bpuistu\w*\s+pindala\w*|\bmetsaga\s+kaetud\b/u },
  { code: "1", label: "Metsamaa pindala, tuhat ha", name: "Metsamaa pindala", unit: "tuhat ha", key: "metsamaa-pindala", max: 5_000, pattern: /\bmetsamaa\w*|\bmetsa(?:de)?\s+pindala\w*|\bmetsa\s+maa\b/u },
].map((item) => Object.freeze(item)));

const MM03_CUT_TYPES = Object.freeze([
  { code: "3", label: "..lageraie", name: "Lageraie", pattern: /\blageraie\w*/u },
  { code: "5", label: "..harvendusraie", name: "Harvendusraie", pattern: /\bharvendus\w*/u },
  { code: "1", label: "Koguraie", name: "Koguraie", pattern: /\b(?:raie\w*|raiu\w*|raiemah\w*|raiepindala\w*)/u },
].map((item) => Object.freeze(item)));

const MM03_MEASURES = Object.freeze({
  area: Object.freeze({ code: "1", errorCode: "2", label: "Raiepindala, tuhat ha", errorLabel: "Raiepindala suhteline viga, %", name: "raiepindala", unit: "tuhat ha", max: 500 }),
  volume: Object.freeze({ code: "3", errorCode: "4", label: "Raiemaht, tuhat m³", errorLabel: "Raiemahu suhteline viga, %", name: "raiemaht", unit: "tuhat m³", max: 50_000 }),
});

const NUMBER_WORDS = new Map([
  ["kahe", 2], ["kaks", 2], ["kolme", 3], ["kolm", 3], ["nelja", 4], ["neli", 4],
  ["viie", 5], ["viis", 5], ["kuue", 6], ["kuus", 6], ["seitsme", 7], ["seitse", 7],
  ["kaheksa", 8], ["uheksa", 9], ["kumne", 10], ["kumme", 10],
  ["viieteistkumne", 15], ["viisteist", 15], ["kahekumne", 20], ["kakskummend", 20],
  ["kahekumne viie", 25], ["kolmekumne", 30], ["kolmkummend", 30],
]);

// "reegl" and "piirang" are matched without a leading boundary because they
// mostly occur as the tail of a raie-compound (e.g. "raiereeglid",
// "raiepiirangud"), the same reason AREA_MEASURE/VOLUME_MEASURE drop \b.
const UNSUPPORTED_SCOPE = /\b(?:maakon\w*|vald\w*|valla\w*|linn\w*|piirkon\w*|rmk|riigimets\w*|eramets\w*|omanik\w*|omand\w*|kaitse\w*|natura|puuliik\w*|mand|mann(?:i|ik)\w*|kuus(?:k|e|ik)\w*|kas(?:k|e)|kaasik\w*|haab\w*|haav(?:a|ik)\w*|lep(?:p|a|ik)\w*|prognoos\w*|tulevi\w*|planeeri\w*|eesmark\w*|siht\w*|euroopa\w*|soome\w*|lati\w*|leedu\w*|rootsi\w*|sanitaar\w*|valgustus\w*|valikraie\w*|kinnist\w*|katastri\w*|metsateati\w*|raiedokument\w*|hukkun\w*|kahjust\w*|harjumaa\w*|hiiumaa\w*|ida virumaa\w*|jogevamaa\w*|jarvamaa\w*|laanemaa\w*|laane virumaa\w*|polvamaa\w*|parnumaa\w*|raplamaa\w*|saaremaa\w*|tartumaa\w*|valgamaa\w*|viljandimaa\w*|vorumaa\w*|virumaa\w*|tallinn\w*|tartu\w*|parnu\w*|narva\w*|hind\w*|hinna\w*|maks\w*|seadus\w*|oigus\w*|luba\w*|load\w*|vanus\w*|raievanus\w*|moju\w*|vana\b|vanad\w*|vanade\w*|kliima\w*|arengukava\w*|tamm\w*|tamme\w*|saar\w*|jalaka\w*|parn\w*|vaher\w*|vahtra\w*|okaspuu\w*|lehtpuu\w*)\b|reegl\w*|piirang\w*/u;
const TREND_WORDS = /\b(?:aegri\w*|aegrea\w*|aastate\s+loikes|aastate\s+kaupa|aasta\s+aastalt|aastati|trend\w*|muutu\w*|dunaamika\w*|ajalug\w*|ajalooli\w*|areng\w*|kasvanud|vahenenud|langenud|tousnud|suurenenud|kahanenud|aja\s+jooksul|viimas\w*\s+aastate\w*|viimas\w*\s+aastatel\b|viimas\w*\s+aastat\b|aastakumne\w*|kumnendi\w*)\b/u;
const COMPARISON_WORDS = /\b(?:rohkem|vahem|vorrel\w*|kui|praegu|nuud|tana|varem|suurem|vaiksem|erine\w*)\b/u;
const AREA_MEASURE = /pindala\w*|\bhektar\w*|\bha\b/u;
const VOLUME_MEASURE = /maht\w*|mahu\w*|\bm3\b|\btihumeet\w*|\bkuupmeet\w*|\btm\b|\braiuti\b|\braiutakse\b|\braiutud\b/u;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^0-9a-z]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function numberFrom(token) {
  if (/^\d{1,2}$/u.test(token)) return Number(token);
  return NUMBER_WORDS.get(token) ?? null;
}

function requestedWindow(text, table) {
  const published = FOREST_SERIES_TABLE_YEARS[table];
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => Number(match[0]));
  const distinctYears = [...new Set(years)].sort((left, right) => left - right);
  const range = text.match(/\b((?:19|20)\d{2})\s*(?:kuni|ja)\s*((?:19|20)\d{2})\b/u);
  const since = text.match(/\balates\s+((?:19|20)\d{2})\b|\b((?:19|20)\d{2})\s+aastast\b|\baastast\s+((?:19|20)\d{2})\b/u);
  const lastN = text.match(/\bviimas\w*\s+(\d{1,2}|kahekumne viie|[a-z]+)\s+aasta\w*/u);
  const ago = text.match(/\b(\d{1,2}|kahekumne viie|[a-z]+)\s+aasta\w*\s+tagasi\b/u);
  const decades = text.match(/\b(\d{1,2}|[a-z]+)\s+(?:kumnendi|aastakumne)\w*/u);
  let window = null;
  if (since && distinctYears.length === 1) {
    window = { from: Number(since[1] || since[2] || since[3]), to: published.to, mode: "since" };
  } else if (range || distinctYears.length >= 2) {
    window = { from: distinctYears[0], to: distinctYears.at(-1), mode: "range" };
  } else if (lastN && numberFrom(lastN[1]) !== null) {
    const count = numberFrom(lastN[1]);
    window = { from: published.to - count + 1, to: published.to, mode: "last-n" };
  } else if (ago && numberFrom(ago[1]) !== null && COMPARISON_WORDS.test(text)) {
    window = { from: published.to - numberFrom(ago[1]), to: published.to, mode: "ago" };
  } else if (decades && numberFrom(decades[1]) !== null) {
    const count = numberFrom(decades[1]) * 10;
    window = { from: published.to - count + 1, to: published.to, mode: "last-n" };
  } else if (distinctYears.length === 0 && (TREND_WORDS.test(text) || /\bviimas\w*\s+aastakumne\w*|\bviimas\w*\s+kumnendi\w*/u.test(text))) {
    window = { from: published.to - DEFAULT_WINDOW_YEARS + 1, to: published.to, mode: "default" };
  }
  if (!window) return null;
  const from = Math.max(window.from, published.from);
  const to = Math.min(window.to, published.to);
  const count = to - from + 1;
  if (!Number.isInteger(from) || !Number.isInteger(to) || count < MIN_WINDOW_YEARS || count > MAX_WINDOW_YEARS) return null;
  return { from, to, mode: window.mode };
}

export function forestSeriesIntent(query) {
  if (typeof query !== "string" || query.length > MAX_QUERY_LENGTH) return null;
  const text = normalize(query);
  if (!text || UNSUPPORTED_SCOPE.test(text)) return null;
  const hasRaie = /\b(?:raie\w*|raiu\w*|lageraie\w*|harvendus\w*)/u.test(text);
  // No leading boundary: "netojuurdekasv" must also route to the Eurostat adapter.
  const hasIncrement = /juurdekasv\w*/u.test(text);
  const hasRemovals = /\beemalda\w*/u.test(text);
  // Harvest-versus-increment questions belong to the Eurostat balance adapter.
  if (hasIncrement && (hasRaie || hasRemovals)) return null;
  const indicator = KK51_INDICATORS.find((item) => item.pattern.test(text)) || null;
  if (indicator && hasRaie) return null;
  if (!indicator && !hasRaie) return null;
  if (indicator) {
    const years = requestedWindow(text, "KK51");
    return years ? { table: "KK51", indicator, years } : null;
  }
  const cutType = MM03_CUT_TYPES.find((item) => item.pattern.test(text));
  const asksArea = AREA_MEASURE.test(text);
  const asksVolume = VOLUME_MEASURE.test(text);
  if (!cutType || (asksArea && asksVolume)) return null;
  const measure = asksArea
    ? MM03_MEASURES.area
    : asksVolume
      ? MM03_MEASURES.volume
      : cutType.code === "3" ? MM03_MEASURES.area : MM03_MEASURES.volume;
  const years = requestedWindow(text, "MM03");
  return years ? { table: "MM03", indicator: null, cutType, measure, years } : null;
}

export function isForestSeriesQuery(query) {
  return forestSeriesIntent(query) !== null;
}

function windowYears(years) {
  const values = [];
  for (let year = years.from; year <= years.to; year += 1) values.push(String(year));
  return values;
}

export function forestSeriesRequest(intent) {
  if (!intent || !FOREST_SERIES_TABLE_YEARS[intent.table]) return null;
  const years = windowYears(intent.years);
  if (intent.table === "KK51") {
    return {
      query: [
        { code: "Näitaja", selection: { filter: "item", values: [intent.indicator.code] } },
        { code: "Aasta", selection: { filter: "item", values: years } },
      ],
      response: { format: "json-stat2" },
    };
  }
  return {
    query: [
      { code: "Aasta", selection: { filter: "item", values: years } },
      { code: "Raie liik", selection: { filter: "item", values: [intent.cutType.code] } },
      { code: "Näitaja", selection: { filter: "item", values: [intent.measure.code, intent.measure.errorCode] } },
    ],
    response: { format: "json-stat2" },
  };
}

export {
  KK51_INDICATORS as FOREST_SERIES_KK51_INDICATORS,
  MM03_CUT_TYPES as FOREST_SERIES_MM03_CUT_TYPES,
  MM03_MEASURES as FOREST_SERIES_MM03_MEASURES,
  TABLE_LABELS as FOREST_SERIES_TABLE_LABELS,
  TABLE_TITLES as FOREST_SERIES_TABLE_TITLES,
  MAX_JSON_BYTES as FOREST_SERIES_MAX_JSON_BYTES,
  MAX_OPERATIONAL_FETCH_AGE_MS as FOREST_SERIES_MAX_FETCH_AGE_MS,
  FUTURE_FETCH_SKEW_MS as FOREST_SERIES_FUTURE_SKEW_MS,
  normalize as normalizeForestSeriesText,
  windowYears as forestSeriesWindowYears,
};
function numericTimestamp(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function exactArray(value, expected) {
  return Array.isArray(value) && value.length === expected.length
    && value.every((item, index) => item === expected[index]);
}

function validDimension(dimension, id, codes, labels) {
  return exactKeys(dimension, ["extension", "label", "category"])
    && dimension.label === id
    && exactKeys(dimension.extension, ["show"])
    && dimension.extension.show === "value"
    && exactKeys(dimension.category, ["index", "label"])
    && exactKeys(dimension.category.index, codes)
    && codes.every((code, position) => dimension.category.index[code] === position)
    && exactKeys(dimension.category.label, codes)
    && codes.every((code) => dimension.category.label[code] === labels[code]);
}

function boundedValue(value, max) {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : NaN;
}

export function etNumber(value, digits) {
  const [whole, fraction] = Math.abs(value).toFixed(digits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
  return `${value < 0 ? "−" : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
}

function unitDigits(unit) {
  return unit === "tuhat m³" ? 0 : 1;
}

function missingYears(projection) {
  const published = new Set(projection.points.map((point) => point.year));
  const missing = [];
  for (let year = projection.years.from; year <= projection.years.to; year += 1) {
    if (!published.has(year)) missing.push(String(year));
  }
  return missing;
}

function trendSentence(projection) {
  const values = projection.points.map((point) => point.value);
  const nonDecreasing = values.every((value, index) => index === 0 || value >= values[index - 1]);
  const nonIncreasing = values.every((value, index) => index === 0 || value <= values[index - 1]);
  const difference = etNumber(Math.abs(values.at(-1) - values[0]), projection.digits);
  if (nonDecreasing && nonIncreasing) return "Väärtus püsis kogu perioodil samal tasemel.";
  if (nonDecreasing) return `Rida ei langenud ühelgi avaldatud aastal; otspunktide vahe on ${difference} ${projection.unit}.`;
  if (nonIncreasing) return `Rida ei tõusnud ühelgi avaldatud aastal; otspunktide vahe on ${difference} ${projection.unit}.`;
  return `Otspunktide vahe on ${difference} ${projection.unit}, kuid vahepealsed tõusud ja langused tähendavad, et seda ei saa kirjeldada ühtlase trendina.`;
}

export function forestSeriesStatement(projection) {
  const { points, unit, digits } = projection;
  const first = points[0];
  const last = points.at(-1);
  const min = points.reduce((best, point) => (point.value < best.value ? point : best), points[0]);
  const max = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  const gaps = missingYears(projection);
  const errorSentence = last.error === undefined
    ? ""
    : ` ${last.year}. aasta hinnangu suhteline viga oli ±${etNumber(last.error, 1)}%.`;
  return `Statistikaameti tabeli ${projection.table} (SMI hinnang) järgi oli ${projection.sentenceLabel} ${first.year}. aastal ${etNumber(first.value, digits)} ${unit} ja ${last.year}. aastal ${etNumber(last.value, digits)} ${unit}. `
    + `Perioodi ${projection.years.from}–${projection.years.to} väikseim avaldatud väärtus oli ${etNumber(min.value, digits)} ${unit} (${min.year}) ja suurim ${etNumber(max.value, digits)} ${unit} (${max.year}); avaldatud aastaid on ${points.length}.`
    + (gaps.length ? ` Aastate ${gaps.join(", ")} kohta ei ole väärtust avaldatud.` : "")
    + ` ${trendSentence(projection)}${errorSentence}`;
}

export function forestSeriesDefinition(table) {
  return table === "KK51"
    ? "Näitaja pärineb riiklikust metsainventeerimisest (SMI), mis on proovitükkidel põhinev valikuuring; iga aasta väärtus on statistiline hinnang, mitte kõigi metsade otsene ülelugemine. Tagavara ei ole aastane raiemaht ega automaatselt raiutav puidukogus."
    : "Näitaja pärineb riiklikust metsainventeerimisest (SMI) ja on proovitükkidel põhinev statistiline hinnang koos suhtelise veaga; see ei ole raiedokumentide (metsateatiste) alusel koostatud raiestatistika ega konkreetse kinnistu raiemaht.";
}

export function forestSeriesContent(projection) {
  return `${forestSeriesStatement(projection)} ${forestSeriesDefinition(projection.table)} JSON-stat2 vastuse eksitavat „updated” välja ei kasutata avaldamisaja ega värskuse tõendina.`;
}

function seriesDescriptor(intent) {
  if (intent.table === "KK51") {
    return {
      indicatorCode: intent.indicator.code,
      seriesLabel: intent.indicator.name,
      sentenceLabel: intent.indicator.name.toLocaleLowerCase("et"),
      unit: intent.indicator.unit,
      max: intent.indicator.max,
      idSuffix: intent.indicator.code,
      selections: `Näitaja=${intent.indicator.code} (${intent.indicator.label})`,
    };
  }
  return {
    indicatorCode: `${intent.cutType.code}-${intent.measure.code}`,
    seriesLabel: `${intent.cutType.name}: ${intent.measure.name}`,
    sentenceLabel: `${intent.cutType.name.toLocaleLowerCase("et")} ${intent.measure.name}`,
    unit: intent.measure.unit,
    max: intent.measure.max,
    idSuffix: `${intent.cutType.code}-${intent.measure.code}`,
    selections: `Raie liik=${intent.cutType.code} (${intent.cutType.label}), Näitaja=${intent.measure.code} ja ${intent.measure.errorCode} (${intent.measure.label}; ${intent.measure.errorLabel})`,
  };
}

function parsePayload(intent, payload) {
  const years = windowYears(intent.years);
  const yearLabels = Object.fromEntries(years.map((year) => [year, year]));
  const base = payload && typeof payload === "object" && !Array.isArray(payload)
    && payload.class === "dataset" && payload.version === "2.0"
    && payload.label === TABLE_LABELS[intent.table] && payload.source === "Statistikaamet"
    && exactKeys(payload.role, ["time"]) && exactArray(payload.role.time, ["Aasta"])
    && exactKeys(payload.extension, ["px"]) && exactKeys(payload.extension.px, ["tableid", "decimals"])
    && payload.extension.px.tableid === intent.table && payload.extension.px.decimals === 0
    && (payload.status === undefined || payload.status === null)
    && Array.isArray(payload.value);
  if (!base) return null;
  const descriptor = seriesDescriptor(intent);
  const points = [];
  if (intent.table === "KK51") {
    if (!exactArray(payload.id, ["Näitaja", "Aasta"]) || !exactArray(payload.size, [1, years.length])
      || !exactKeys(payload.dimension, ["Näitaja", "Aasta"])
      || !validDimension(payload.dimension["Näitaja"], "Näitaja", [intent.indicator.code], { [intent.indicator.code]: intent.indicator.label })
      || !validDimension(payload.dimension.Aasta, "Aasta", years, yearLabels)
      || payload.value.length !== years.length) return null;
    for (const [index, year] of years.entries()) {
      const value = boundedValue(payload.value[index], descriptor.max);
      if (Number.isNaN(value)) return null;
      if (value !== null) points.push({ year: Number(year), value });
    }
  } else {
    const measureCodes = [intent.measure.code, intent.measure.errorCode];
    if (!exactArray(payload.id, ["Aasta", "Raie liik", "Näitaja"]) || !exactArray(payload.size, [years.length, 1, 2])
      || !exactKeys(payload.dimension, ["Aasta", "Raie liik", "Näitaja"])
      || !validDimension(payload.dimension.Aasta, "Aasta", years, yearLabels)
      || !validDimension(payload.dimension["Raie liik"], "Raie liik", [intent.cutType.code], { [intent.cutType.code]: intent.cutType.label })
      || !validDimension(payload.dimension["Näitaja"], "Näitaja", measureCodes, { [intent.measure.code]: intent.measure.label, [intent.measure.errorCode]: intent.measure.errorLabel })
      || payload.value.length !== years.length * 2) return null;
    for (const [index, year] of years.entries()) {
      const value = boundedValue(payload.value[index * 2], descriptor.max);
      const error = boundedValue(payload.value[index * 2 + 1], 100);
      if (Number.isNaN(value) || Number.isNaN(error)) return null;
      if (value === null) continue;
      points.push(error === null ? { year: Number(year), value } : { year: Number(year), value, error });
    }
  }
  if (points.length < MIN_WINDOW_YEARS) return null;
  return { descriptor, points };
}

export function forestSeriesFromJson(query, json, options = {}) {
  const intent = forestSeriesIntent(query);
  const input = String(json || "");
  const now = numericTimestamp(options.now, Date.now());
  const fetchedTimestamp = numericTimestamp(options.fetchedAt, Number.NaN);
  if (!intent || !input || !Number.isFinite(now) || !Number.isFinite(fetchedTimestamp)
    || Buffer.byteLength(input, "utf8") > MAX_JSON_BYTES
    || input.includes("\0") || options.stale === true
    || fetchedTimestamp > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedTimestamp > MAX_OPERATIONAL_FETCH_AGE_MS) return [];
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return [];
  }
  const parsed = parsePayload(intent, payload);
  if (!parsed) return [];
  const { descriptor, points } = parsed;
  const projection = {
    table: intent.table,
    indicatorCode: descriptor.indicatorCode,
    seriesLabel: descriptor.seriesLabel,
    sentenceLabel: descriptor.sentenceLabel,
    unit: descriptor.unit,
    digits: unitDigits(descriptor.unit),
    years: { from: intent.years.from, to: intent.years.to },
    points,
    fetchedAt: new Date(fetchedTimestamp).toISOString(),
  };
  const apiUrl = intent.table === "KK51" ? FOREST_SERIES_KK51_API_URL : FOREST_SERIES_MM03_API_URL;
  const tableUrl = intent.table === "KK51" ? FOREST_SERIES_KK51_TABLE_URL : FOREST_SERIES_MM03_TABLE_URL;
  const lastYear = points.at(-1).year;
  return [{
    id: `forest-series-${intent.table.toLowerCase()}-${descriptor.idSuffix}-${intent.years.from}-${intent.years.to}`,
    title: `Statistikaamet ${intent.table}: ${descriptor.seriesLabel} ${intent.years.from}–${intent.years.to}`,
    organization: "Statistikaamet",
    type: "Ametlik aastastatistika (JSON-stat2)",
    published: String(lastYear),
    url: tableUrl,
    locator: `PXWeb POST: ${apiUrl}; valikud ${descriptor.selections}, Aasta=${intent.years.from}–${intent.years.to}; levitamispõhimõtted ja litsents: ${STATISTICS_DISSEMINATION_POLICY_URL}`,
    summary: forestSeriesStatement(projection),
    content: forestSeriesContent(projection),
    topics: ["mets", "SMI", "aegrida", descriptor.seriesLabel, intent.table, String(intent.years.from), String(intent.years.to)],
    tags: ["Statistikaamet", "mets", "SMI", "aegrida", intent.table, "CC BY-SA 4.0"],
    sourceTier: "official",
    retrieval: "official-structured-statistics-pxweb",
    delivery: "structured-or-download",
    routeClasses: ["official_indicator_or_report", "official_historical_observation", "official_data_or_api"],
    evidencePolicy: "claim-specific",
    freshness: {
      class: "annual-historical-statistic",
      basis: "reference-year",
      maxAgeMs: null,
      requiresSourceTimestamp: false,
    },
    _answerEvidenceEligible: true,
    _contentHash: createHash("sha256").update(input).digest("hex"),
    _forestSeries: projection,
  }];
}

function validPoint(point, unitMax) {
  return point && typeof point === "object" && !Array.isArray(point)
    && Number.isInteger(point.year) && typeof point.value === "number" && Number.isFinite(point.value)
    && point.value >= 0 && point.value <= unitMax
    && (point.error === undefined || (typeof point.error === "number" && Number.isFinite(point.error) && point.error >= 0 && point.error <= 100))
    && Object.keys(point).every((key) => ["year", "value", "error"].includes(key));
}

export function validatedForestSeriesProjection(query, document, now = Date.now()) {
  const intent = forestSeriesIntent(query);
  const projection = document?._forestSeries;
  if (!intent || !projection || typeof projection !== "object") return null;
  const descriptor = seriesDescriptor(intent);
  const tableUrl = intent.table === "KK51" ? FOREST_SERIES_KK51_TABLE_URL : FOREST_SERIES_MM03_TABLE_URL;
  const fetchedAt = Date.parse(String(projection.fetchedAt || ""));
  const expectedId = `forest-series-${intent.table.toLowerCase()}-${descriptor.idSuffix}-${intent.years.from}-${intent.years.to}`;
  if (document.id !== expectedId || document.url !== tableUrl
    || document.retrieval !== "official-structured-statistics-pxweb"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || projection.table !== intent.table || projection.indicatorCode !== descriptor.indicatorCode
    || projection.seriesLabel !== descriptor.seriesLabel || projection.sentenceLabel !== descriptor.sentenceLabel
    || projection.unit !== descriptor.unit || projection.digits !== unitDigits(descriptor.unit)
    || !projection.years || projection.years.from !== intent.years.from || projection.years.to !== intent.years.to
    || !Array.isArray(projection.points) || projection.points.length < MIN_WINDOW_YEARS
    || projection.points.length > MAX_WINDOW_YEARS
    || !projection.points.every((point) => validPoint(point, descriptor.max))
    || !projection.points.every((point, index) => index === 0 || point.year > projection.points[index - 1].year)
    || projection.points[0].year < intent.years.from || projection.points.at(-1).year > intent.years.to
    || !Number.isFinite(fetchedAt) || fetchedAt > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedAt > MAX_OPERATIONAL_FETCH_AGE_MS
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || document.published !== String(projection.points.at(-1).year)
    || forestSeriesStatement(projection) !== document.summary
    || forestSeriesContent(projection) !== document.content) return null;
  return projection;
}

const RELATED_QUESTIONS = Object.freeze({
  KK51: Object.freeze(["Kas raiemaht ületab juurdekasvu?", "Kui suur osa Eestist on mets?", "Lageraie pindala viimase kümne aasta jooksul"]),
  MM03: Object.freeze(["Kas raiemaht ületab juurdekasvu?", "Metsamaa pindala viimase kümne aasta jooksul", "Mis vahe on SMI raiemahul ja metsateatiste statistikal?"]),
});

function chartFromProjection(projection) {
  const hasError = projection.points.some((point) => point.error !== undefined);
  return {
    kind: "line",
    title: `${projection.seriesLabel} ${projection.years.from}–${projection.years.to}`,
    unit: projection.unit,
    xLabel: "Aasta",
    series: [{
      id: `${projection.table.toLowerCase()}-${projection.indicatorCode}`,
      label: projection.seriesLabel,
      points: projection.points.map((point) => (
        point.error === undefined ? { x: point.year, y: point.value } : { x: point.year, y: point.value, error: point.error }
      )),
    }],
    citation: 1,
    caption: `Statistikaamet, tabel ${projection.table}: ${TABLE_TITLES[projection.table]}. SMI valikuuringu aastahinnangud${hasError ? " koos suhtelise veaga" : ""}.`,
  };
}

export function composeForestSeriesResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedForestSeriesProjection(query, document, now));
  if (!source) return null;
  const projection = source._forestSeries;
  const first = projection.points[0];
  const last = projection.points.at(-1);
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: `Statistikaameti tabel ${projection.table}`,
      title: `${projection.seriesLabel} ${projection.years.from}–${projection.years.to}: ${etNumber(first.value, projection.digits)} → ${etNumber(last.value, projection.digits)} ${projection.unit}`,
      intro: source.summary,
      introCitations: [1],
      parts: [{
        title: "Mida näitaja tähendab",
        text: forestSeriesDefinition(projection.table),
        citations: [1],
      }],
      note: "See on SMI valikuuringu aastahinnangute rida ühe tabeli ja näitaja kohta. See ei ole prognoos, kohaliku omavalitsuse või kinnistu näitaja ega otsus metsamajanduse kestlikkuse kohta.",
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: [...RELATED_QUESTIONS[projection.table]],
    clarification: null,
    evidence: {
      kind: "structured-forest-series",
      answerable: true,
      documentIds: [source.id],
    },
    chart: chartFromProjection(projection),
  };
}
