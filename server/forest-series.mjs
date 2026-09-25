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

const UNSUPPORTED_SCOPE = /\b(?:maakon\w*|vald\w*|valla\w*|linn\w*|piirkon\w*|rmk|riigimets\w*|eramets\w*|omanik\w*|omand\w*|kaitse\w*|natura|puuliik\w*|mand|mann(?:i|ik)\w*|kuus(?:k|e|ik)\w*|kas(?:k|e)|kaasik\w*|haab\w*|haav(?:a|ik)\w*|lep(?:p|a|ik)\w*|prognoos\w*|tulevi\w*|planeeri\w*|eesmark\w*|siht\w*|euroopa|soome|lati|leedu|rootsi|sanitaar\w*|valgustus\w*|valikraie\w*|kinnist\w*|katastri\w*|metsateati\w*|raiedokument\w*|hukkun\w*|kahjust\w*|harjumaa\w*|hiiumaa\w*|ida virumaa\w*|jogevamaa\w*|jarvamaa\w*|laanemaa\w*|laane virumaa\w*|polvamaa\w*|parnumaa\w*|raplamaa\w*|saaremaa\w*|tartumaa\w*|valgamaa\w*|viljandimaa\w*|vorumaa\w*|virumaa\w*|tallinn\w*|tartu\w*|parnu\w*|narva\w*)\b/u;
const TREND_WORDS = /\b(?:aegri\w*|aegrea\w*|aastate\s+loikes|aastate\s+kaupa|aasta\s+aastalt|aastati|trend\w*|muutu\w*|dunaamika\w*|ajalug\w*|ajalooli\w*|areng\w*|kasvanud|vahenenud|langenud|tousnud|suurenenud|kahanenud|aja\s+jooksul|viimas\w*\s+aasta\w*|aastakumne\w*|kumnendi\w*)\b/u;
const COMPARISON_WORDS = /\b(?:rohkem|vahem|vorrel\w*|kui|praegu|nuud|tana|varem|suurem|vaiksem|erine\w*)\b/u;
const AREA_MEASURE = /\bpindala\w*|\bhektar\w*|\bha\b/u;
const VOLUME_MEASURE = /\bmaht\w*|\bmahu\w*|\bm3\b|\btihumeet\w*|\bkuupmeet\w*|\btm\b|\braiuti\b|\braiutakse\b|\braiutud\b/u;

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
// createHash, sourceEvidenceEligibility and STATISTICS_DISSEMINATION_POLICY_URL are used from Task 2 on.
void createHash; void sourceEvidenceEligibility; void STATISTICS_DISSEMINATION_POLICY_URL;
