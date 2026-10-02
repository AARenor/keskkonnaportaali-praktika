import { createHash } from "node:crypto";
import { load } from "cheerio";
import {
  climateDailyMeanFromJson,
  climateDailyQueryUrl,
  isClimateDailyMeanQuery,
} from "./climate.mjs";
import {
  fetchOfficialDataset,
  fetchOfficialGeoJsonDataset,
  fetchOfficialJsonDataset,
  fetchOfficialPostgrestDataset,
  fetchOfficialPxwebDataset,
  fetchOfficialXmlDataset,
} from "./integrations.mjs";
import {
  eelisEmajogiPublicWatercourseFromGeoJson,
  EELIS_EMAJOGI_PUBLIC_WATERCOURSE_WFS_URL,
  eelisNaturaSiteFromJson,
  eelisNaturaSiteQueryUrl,
  isEelisEmajogiPublicWatercourseQuery,
  isEelisNaturaSiteQuery,
} from "./eelis.mjs";
import {
  isLandUseShareQuery,
  LAND_USE_KK07_API_URL,
  landUseShareFromJson,
  landUseShareRequest,
  smiLandCategoriesValid,
  smiLandCategoryDocument,
} from "./land-use-share.mjs";
import {
  smiHarvestShareDocument,
  isHarvestShareQuery,
} from "./harvest-share.mjs";
import { sourceEvidenceEligibility } from "./source-registry.mjs";
import {
  isStatisticsHazardousWasteQuery,
  isStatisticsTotalWasteRecoveryQuery,
  isStatisticsWastewaterBht7Query,
  isStatisticsWaterAbstractionQuery,
  STATISTICS_HAZARDOUS_WASTE_API_URL,
  STATISTICS_TOTAL_WASTE_RECOVERY_API_URL,
  STATISTICS_WATER_ABSTRACTION_API_URL,
  STATISTICS_WASTEWATER_BHT7_API_URL,
  statisticsHazardousWasteFromJson,
  statisticsHazardousWasteRequest,
  statisticsTotalWasteRecoveryFromJson,
  statisticsTotalWasteRecoveryRequest,
  statisticsWastewaterBht7FromJson,
  statisticsWastewaterBht7Request,
  statisticsWaterAbstractionFromJson,
  statisticsWaterAbstractionRequest,
} from "./statistics.mjs";
import {
  composeForestSeriesResponse,
  FOREST_SERIES_KK51_API_URL,
  FOREST_SERIES_MM03_API_URL,
  forestSeriesFromJson,
  forestSeriesRequest,
  isForestContextSeriesQuery,
  isForestSeriesQuery,
  resolveForestSeriesIntent,
  smiForestSeriesDocument,
} from "./forest-series.mjs";

export { composeForestSeriesResponse };

export const MUNICIPAL_WASTE_RECYCLING_CSV_URL = "https://tableau.envir.ee/views/jtmed-OlmejtmeteringlussevttEestijaEuroopaLiit/OlmejtmeteringlussevttEestijaEuroopaLiit.csv?:showVizHome=no";
export const MUNICIPAL_WASTE_RECYCLING_PAGE_URL = "https://keskkonnaportaal.ee/et/olmejaatmete-ringlussevott";
const MUNICIPAL_WASTE_RECYCLING_LOCATOR = "Ametliku Tableau vaate CSV-väljund; valitud rida vastab vastuses nimetatud aastale.";
const MUNICIPAL_WASTE_RECYCLING_ACTION_LABEL = "Ava Keskkonnaportaali näitajaleht";
export const FOREST_BALANCE_EUROSTAT_API_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/for_vol_efa?geo=EE&sinceTimePeriod=2020&stk_flow=NAI&stk_flow=RMOV&indic_fo=FOR&unit=THS_M3&lang=en";
export const FOREST_BALANCE_EUROSTAT_URL = "https://ec.europa.eu/eurostat/web/products-eurostat-news/w/edn-20260320-2";
export const FOREST_BALANCE_EFA_HANDBOOK_URL = "https://ec.europa.eu/eurostat/web/products-manuals-and-guidelines/w/ks-gq-24-015";
export const FOREST_BALANCE_KAUR_URL = "https://keskkonnaagentuur.ee/node/2720";
export const FOREST_FIVE_YEAR_KAUR_URL = "https://keskkonnaagentuur.ee/uudised/smi-segametsade-osakaal-kasvab";
export const CURRENT_WEATHER_OBSERVATIONS_XML_URL = "https://www.ilmateenistus.ee/ilma_andmed/xml/observations.php";
export const CURRENT_WEATHER_OBSERVATIONS_INFO_URL = "https://www.ilmateenistus.ee/teenused/ilmainfo/eesti-vaatlusandmed-xml/";
export const WEATHER_FORECAST_XML_URL = "https://www.ilmateenistus.ee/ilma_andmed/xml/forecast.php";
export const WEATHER_FORECAST_INFO_URL = "https://keskkonnaportaal.ee/et/avaandmed/ilmaprognoosid/ilmaprognooside-kirjeldus";
export const LATEST_HYDROLOGY_API_URL = "https://keskkonnaandmed.envir.ee/f_hydroseire";
export const LATEST_HYDROLOGY_INFO_URL = "https://keskkonnaportaal.ee/et/avaandmed/hudroloogilise-seire-andmestik/hudroloogilise-seire-andmestiku-kirjeldus";

const MAX_INDICATOR_CSV_BYTES = 1_000_000;
const MAX_INDICATOR_CSV_ROWS = 500;
const MAX_INDICATOR_CSV_COLUMNS = 32;
const MAX_INDICATOR_CSV_FIELD_LENGTH = 1_024;
const MIN_MUNICIPAL_WASTE_YEAR = 1990;
const MAX_MUNICIPAL_WASTE_PLACEHOLDER_YEARS = 20;
const MUNICIPAL_WASTE_LEGACY_HEADER = Object.freeze([
  "Aasta", "Measure Names", "% Eesti", "% EL",
]);
const MUNICIPAL_WASTE_TABLEAU_HEADER = Object.freeze([
  "Aasta", "Measure Names", "Eesti/EL õige", "% Eesti (copy)", "% Eesti", "% EL (copy)", "% EL",
]);
const MIN_FOREST_BALANCE_YEAR = 2020;
const MAX_FOREST_BALANCE_VALUE_THOUSAND_M3 = 100_000;
const REVIEWED_FOREST_BALANCE_STATUS_AT = "2026-08-21T00:00:00.000Z";
const REVIEWED_FOREST_BALANCE_MAX_AGE_MS = 400 * 24 * 60 * 60_000;
const LIVE_FOREST_BALANCE_MAX_AGE_MS = 24 * 60 * 60_000;
const FOREST_BALANCE_FUTURE_SKEW_MS = 5 * 60_000;
const REVIEWED_FOREST_BALANCE_YEARS = Object.freeze([2020, 2021, 2022, 2023, 2024]);
const MAX_WEATHER_XML_BYTES = 500_000;
const MAX_WEATHER_STATIONS = 300;
const WEATHER_OBSERVATION_MAX_AGE_MS = 15 * 60_000;
const WEATHER_OBSERVATION_FUTURE_SKEW_MS = 5 * 60_000;
const WEATHER_FORECAST_STATUS_MAX_AGE_MS = 15 * 60_000;
const LATEST_HYDROLOGY_MAX_AGE_MS = 36 * 60 * 60_000;
const MAX_HYDROLOGY_JSON_BYTES = 20_000;
const HYDROLOGY_SELECT_FIELDS = "jaam_kood,jaam_nimi,jaam_taisnimi,veekogu_nimi,valgala_nimi,jaam_laiuskraad,jaam_pikkuskraad,timeline_ts_utc,aegrida_nimi,vaartus";
const WEATHER_LOCATIONS = Object.freeze([
  { key: "tallinn", label: "Tallinn", query: /\btal{1,2}in{1,2}\w*/u, stations: ["Tallinn-Harku"] },
  { key: "tartu", label: "Tartu", query: /\btartu\w*/u, stations: ["Tartu", "Tartu-Tõravere"] },
  { key: "parnu", label: "Pärnu", query: /\bparnu\w*/u, stations: ["Pärnu"] },
  { key: "narva", label: "Narva", query: /\bnarva\w*/u, stations: ["Narva"] },
  { key: "johvi", label: "Jõhvi", query: /\bjohvi\w*/u, stations: ["Jõhvi"] },
  { key: "viljandi", label: "Viljandi", query: /\bviljandi\w*/u, stations: ["Viljandi"] },
  { key: "voru", label: "Võru", query: /\bvoru\w*/u, stations: ["Võru"] },
  { key: "valga", label: "Valga", query: /\bvalga\w*/u, stations: ["Valga"] },
  { key: "haapsalu", label: "Haapsalu", query: /\bhaapsalu\w*/u, stations: ["Haapsalu"] },
  { key: "kuressaare", label: "Kuressaare", query: /\bkuressaare\w*/u, stations: ["Kuressaare linn"] },
]);
const LATEST_HYDROLOGY_STATIONS = Object.freeze([
  {
    key: "tartu-emajogi",
    label: "Tartu",
    code: 41025,
    name: "Tartu",
    fullName: "Tartu hüdromeetriajaam",
    waterbody: "Emajõgi",
    apiWaterbody: "Emajõgi",
    catchment: "Emajõgi",
    graphZeroEh2000: 29.77,
    temperatureSensorLocation: "riverbed-near-bottom",
    infoUrl: "https://www.ilmateenistus.ee/meist/vaatlusvork/tartu-kvissentali-hudromeetriajaam/",
    query: (text) => /\btartu\w*/u.test(text) && /\bemajo\w*/u.test(text),
  },
  {
    key: "kloostrimetsa-pirita",
    label: "Kloostrimetsa",
    code: 41157,
    name: "Kloostrimetsa",
    fullName: "Kloostrimetsa hüdromeetriajaam",
    waterbody: "Pirita jõgi",
    apiWaterbody: "Pirita j.",
    catchment: "Pirita jõgi",
    graphZeroEh2000: 6.22,
    temperatureSensorLocation: "riverbed-near-bottom",
    infoUrl: "https://www.ilmateenistus.ee/meist/vaatlusvork/kloostrimetsa-hudromeetriajaam/",
    query: (text) => /\bkloostrimetsa\w*/u.test(text),
  },
]);
const LATEST_HYDROLOGY_METRICS = Object.freeze([
  {
    key: "temperature",
    series: "WT avg",
    unit: "°C",
    minimum: -5,
    maximum: 45,
    query: /\b(?:veetemperatuur|vee temperatuur|water temperature)\w*/u,
  },
  {
    key: "level",
    series: "WL avg",
    unit: "cm",
    minimum: -1_000,
    maximum: 2_000,
    query: /\b(?:veetase|vee tase|water level)\w*/u,
  },
  {
    key: "discharge",
    series: "Äravool avg",
    unit: "m³/s",
    minimum: 0,
    maximum: 10_000,
    query: /\b(?:aravool|vooluhulk|discharge|flow rate)\w*/u,
  },
]);

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

function hasWaterTemperatureContext(text) {
  return String(text || "").split(/\s+/u).some((word) => [
    "vesi", "vee", "vees", "veest", "vette", "water", "sea", "river", "lake",
  ].includes(word)
    || /^(?:veetemperatuur|pohjave|mereve|jarveve|suplusve|joogive|reove|jogi|joe|jarv|meri|emajogi|emajoe)/u.test(word)
    || /(?:joe|jarve|mere|vee)\w*$/u.test(word));
}

function currentWeatherIntent(query) {
  const text = normalize(query);
  const location = WEATHER_LOCATIONS.find((candidate) => candidate.query.test(text));
  if (!location || hasWaterTemperatureContext(text)
    || /\b(?:homme|ulehomme|prognoos|ennustus|hoiatus|eile|mullu|ajalool|arhiiv|tulevik)\w*/u.test(text)
    || /\b(?:19|20)\d{2}\b/u.test(text)) return null;
  const metric = /\b(?:tuul|tuulekiirus|wind)\w*/u.test(text)
    ? "wind"
    : /\b(?:ohu ?niiskus|suhteline (?:ohu ?)?niiskus|niiskus|humidity)\w*/u.test(text)
      ? "humidity"
      : /\b(?:ohurohk|baromeet|pressure)\w*/u.test(text)
        ? "pressure"
        : /\b(?:sadem|vihm|rain)\w*/u.test(text)
          ? "precipitation"
          : "temperature";
  const explicitMetric = /\b(?:ohu ?temperatuur|temperatuur|sooja|kulm|tuul|tuulekiirus|ohu ?niiskus|suhteline (?:ohu ?)?niiskus|niiskus|ohurohk|baromeet|sadem|vihm|temperature|wind|humidity|pressure|rain)\w*/u.test(text);
  const currentCue = /\b(?:praegu|praegune|hetkel|hetkeilm|jooksev|current|now)\w*/u.test(text);
  const weatherCue = explicitMetric || /\b(?:ilm|weather)\w*/u.test(text);
  return weatherCue && (explicitMetric || currentCue) ? { location, metric } : null;
}

export function isCurrentWeatherObservationQuery(query) {
  return Boolean(currentWeatherIntent(query));
}

function boundedXmlNumber(value, minimum, maximum) {
  const text = String(value ?? "").trim();
  if (!text) return { valid: true, value: null };
  if (!/^-?\d{1,4}(?:\.\d{1,16})?$/u.test(text)) return { valid: false, value: null };
  const number = Number(text);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? { valid: true, value: number }
    : { valid: false, value: null };
}

function stationMeasurement($, station, tag, minimum, maximum) {
  const nodes = $(station).children(tag);
  if (nodes.length !== 1) return { valid: false, value: null };
  return boundedXmlNumber(nodes.first().text(), minimum, maximum);
}

function parsedWeatherStation($, station) {
  const fields = {
    latitude: stationMeasurement($, station, "latitude", 57, 60.5),
    longitude: stationMeasurement($, station, "longitude", 21, 29.5),
    temperature: stationMeasurement($, station, "airtemperature", -80, 60),
    humidity: stationMeasurement($, station, "relativehumidity", 0, 100),
    pressure: stationMeasurement($, station, "airpressure", 850, 1_100),
    wind: stationMeasurement($, station, "windspeed", 0, 100),
    windMax: stationMeasurement($, station, "windspeedmax", 0, 150),
    precipitation: stationMeasurement($, station, "precipitations", 0, 500),
  };
  if (Object.values(fields).some((field) => !field.valid)
    || fields.latitude.value === null
    || fields.longitude.value === null
    || fields.temperature.value === null) return null;
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
}

function weatherMetricValue(measurements, metric) {
  return metric === "wind" ? measurements.wind
    : metric === "humidity" ? measurements.humidity
      : metric === "pressure" ? measurements.pressure
        : metric === "precipitation" ? measurements.precipitation
          : measurements.temperature;
}

function validProjectedWeatherMeasurements(measurements) {
  if (!measurements || typeof measurements !== "object" || Array.isArray(measurements)) return false;
  const bounded = (value, minimum, maximum, { required = false } = {}) => (
    value === null ? !required : typeof value === "number"
      && Number.isFinite(value) && value >= minimum && value <= maximum
  );
  return bounded(measurements.latitude, 57, 60.5, { required: true })
    && bounded(measurements.longitude, 21, 29.5, { required: true })
    && bounded(measurements.temperature, -80, 60, { required: true })
    && bounded(measurements.humidity, 0, 100)
    && bounded(measurements.pressure, 850, 1_100)
    && bounded(measurements.wind, 0, 100)
    && bounded(measurements.windMax, 0, 150)
    && bounded(measurements.precipitation, 0, 500);
}

function weatherMetricText(measurements, metric) {
  if (metric === "wind") return `keskmine tuulekiirus ${etNumber(measurements.wind)} m/s`;
  if (metric === "humidity") return `suhteline õhuniiskus ${etNumber(measurements.humidity)}%`;
  if (metric === "pressure") return `õhurõhk ${etNumber(measurements.pressure)} hPa`;
  if (metric === "precipitation") return `viimase tunni sademete hulk ${etNumber(measurements.precipitation)} mm`;
  return `õhutemperatuur ${etNumber(measurements.temperature)} °C`;
}

function additionalWeatherText(measurements, primaryMetric) {
  const values = [
    ["temperature", measurements.temperature],
    ["humidity", measurements.humidity],
    ["pressure", measurements.pressure],
    ["wind", measurements.wind],
    ["precipitation", measurements.precipitation],
  ].filter(([metric, value]) => metric !== primaryMetric && value !== null);
  if (!values.length) return "";
  return values.map(([metric]) => weatherMetricText(measurements, metric)).join(", ");
}

function weatherObservationStatement(projection) {
  return `${projection.stationName} ilmajaamas oli Ilmateenistuse XML-voo aja ${projection.observedAt.slice(0, 16).replace("T", " ")} UTC järgi ${projection.primaryText}.`;
}

export function currentWeatherObservationFromXml(query, xml, options = {}) {
  const intent = currentWeatherIntent(query);
  const input = String(xml || "");
  if (!intent || !input || Buffer.byteLength(input, "utf8") > MAX_WEATHER_XML_BYTES
    || input.includes("\0") || /<!DOCTYPE|<!ENTITY/iu.test(input)) return [];
  const validationNow = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  let $;
  try {
    $ = load(input, { xmlMode: true });
  } catch {
    return [];
  }
  const roots = $.root().children("observations");
  if (roots.length !== 1) return [];
  const timestampText = String(roots.first().attr("timestamp") || "").trim();
  if (!/^\d{10}$/u.test(timestampText)) return [];
  const observedTimestamp = Number(timestampText) * 1_000;
  if (!Number.isSafeInteger(observedTimestamp)
    || observedTimestamp > validationNow + WEATHER_OBSERVATION_FUTURE_SKEW_MS
    || validationNow - observedTimestamp > WEATHER_OBSERVATION_MAX_AGE_MS
    || options.stale === true) return [];
  const stations = roots.first().children("station").toArray();
  if (!stations.length || stations.length > MAX_WEATHER_STATIONS) return [];
  const byName = new Map();
  for (const station of stations) {
    const names = $(station).children("name");
    const name = names.length === 1 ? names.first().text().replace(/\s+/gu, " ").trim() : "";
    if (!name || name.length > 100 || /[\u0000-\u001F\u007F]/u.test(name)) return [];
    const namedStations = byName.get(name) || [];
    namedStations.push(station);
    byName.set(name, namedStations);
  }
  let selected;
  for (const stationName of intent.location.stations) {
    const namedStations = byName.get(stationName) || [];
    if (!namedStations.length) continue;
    if (namedStations.length !== 1) return [];
    const [station] = namedStations;
    const measurements = parsedWeatherStation($, station);
    if (!measurements) return [];
    if (weatherMetricValue(measurements, intent.metric) !== null) {
      selected = { stationName, measurements };
      break;
    }
  }
  if (!selected) return [];
  const observedAt = new Date(observedTimestamp).toISOString();
  const projection = {
    queryLocation: intent.location.key,
    locationLabel: intent.location.label,
    stationName: selected.stationName,
    observedAt,
    primaryMetric: intent.metric,
    primaryText: weatherMetricText(selected.measurements, intent.metric),
    additionalText: additionalWeatherText(selected.measurements, intent.metric),
    measurements: selected.measurements,
  };
  const statement = weatherObservationStatement(projection);
  const content = `${statement}${projection.additionalText ? ` Sama vaatlusaja muud näidud: ${projection.additionalText}.` : ""} Mõõtmine kirjeldab nimetatud ilmajaama, mitte automaatselt kogu linna.`;
  return [{
    id: "current-weather-observations",
    title: "Jooksvad ilmavaatlused",
    organization: "Keskkonnaagentuur / Ilmateenistus",
    type: "Reaalaja seireandmed",
    published: observedAt.slice(0, 10),
    url: CURRENT_WEATHER_OBSERVATIONS_XML_URL,
    locator: CURRENT_WEATHER_OBSERVATIONS_INFO_URL,
    summary: statement,
    content,
    topics: ["ilm", "ilmavaatlus", "hetkeilm", intent.location.label, selected.stationName, intent.metric],
    tags: ["ilm", "ilmavaatlus", "hetkeilm", intent.location.label, intent.metric],
    sourceTier: "official",
    retrieval: "official-structured-weather-xml",
    delivery: "live-service",
    routeClasses: ["official_live_weather", "official_data_or_api"],
    evidencePolicy: "timestamped",
    freshness: {
      class: "live",
      basis: "source-observed-at",
      maxAgeMs: WEATHER_OBSERVATION_MAX_AGE_MS,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _contentHash: createHash("sha256").update(input).digest("hex"),
    _evidenceObservedAt: observedAt,
    _weatherObservation: projection,
  }];
}

function validatedWeatherProjection(query, document, now = Date.now()) {
  const intent = currentWeatherIntent(query);
  const projection = document?._weatherObservation;
  if (!intent || document?.id !== "current-weather-observations"
    || document?.url !== CURRENT_WEATHER_OBSERVATIONS_XML_URL
    || document?.locator !== CURRENT_WEATHER_OBSERVATIONS_INFO_URL
    || document?.retrieval !== "official-structured-weather-xml"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || !projection || projection.queryLocation !== intent.location.key
    || projection.primaryMetric !== intent.metric
    || projection.observedAt !== document._evidenceObservedAt
    || !intent.location.stations.includes(projection.stationName)
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))) return null;
  const measurements = projection.measurements;
  if (!validProjectedWeatherMeasurements(measurements)
    || projection.locationLabel !== intent.location.label
    || weatherMetricValue(measurements, intent.metric) === null
    || weatherMetricText(measurements, intent.metric) !== projection.primaryText
    || additionalWeatherText(measurements, intent.metric) !== projection.additionalText
    || weatherObservationStatement(projection) !== document.summary) return null;
  return projection;
}

export function composeCurrentWeatherObservationResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedWeatherProjection(query, document, now));
  if (!source) return null;
  const projection = source._weatherObservation;
  const citedSource = { ...source, citation: 1, evidenceExcerpt: source.content };
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: "Värske ametlik ilmavaatlus",
      title: `${projection.locationLabel}: ${projection.primaryText}`,
      intro: source.summary,
      introCitations: [1],
      parts: projection.additionalText ? [{
        title: "Sama jaama muud näidud",
        text: `${projection.additionalText}.`,
        citations: [1],
      }] : [],
      note: "Vaatlus kirjeldab nimetatud jaama, mitte kogu linna ega prognoosi. Adapter käsitleb XML-i ajatembrit voo hetktõmmise, mitte üksiku välja mõõteajana; parameetrite uuendussagedus erineb. Enne otsust kontrolli allikat.",
    },
    sources: [citedSource],
    related: [
      `${projection.locationLabel} ilmaprognoos homme`,
      "Eesti ilmahoiatused",
      "ajaloolised ilmaandmed",
    ],
    clarification: null,
    evidence: {
      kind: "structured-current-weather",
      answerable: true,
      documentIds: [source.id],
    },
  };
}

function estonianCalendarDate(now, offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Tallinn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const base = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offsetDays);
  return new Date(base).toISOString().slice(0, 10);
}

function nationalForecastIntent(query, now = Date.now()) {
  const text = normalize(query);
  if (!/\b(?:ilm|prognoos|temperatuur|tuul|sadem|vihm|weather|forecast)\w*/u.test(text)
    || !/\b(?:homme|homn\w*|tomorrow)\b/u.test(text)
    || /\bulehomme\b/u.test(text)
    || WEATHER_LOCATIONS.some((location) => location.query.test(text))) return null;
  return { targetDate: estonianCalendarDate(now, 1) };
}

export function isNationalWeatherForecastQuery(query, options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  return Boolean(nationalForecastIntent(query, now));
}

function strictForecastDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) return null;
  const timestamp = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === text
    ? timestamp
    : null;
}

function forecastText($, period) {
  const nodes = $(period).children("text");
  if (nodes.length !== 1) return null;
  const text = nodes.first().text().replace(/\s+/gu, " ").trim();
  return text.length >= 20 && text.length <= 1_200
    && !/[\u0000-\u001F\u007F]/u.test(text)
    && /[.!?]$/u.test(text) ? text : null;
}

function forecastTemperature($, period, tag) {
  const nodes = $(period).children(tag);
  if (nodes.length !== 1) return null;
  const parsed = boundedXmlNumber(nodes.first().text(), -60, 60);
  return parsed.valid ? parsed.value : null;
}

function parsedNationalForecastPeriod($, period) {
  const minimum = forecastTemperature($, period, "tempmin");
  const maximum = forecastTemperature($, period, "tempmax");
  const text = forecastText($, period);
  if (minimum === null || maximum === null || minimum > maximum || !text) return null;
  return { minimum, maximum, text };
}

function forecastSummary(projection) {
  return `Ilmateenistuse ${projection.targetDate} Eesti prognoosis on öö õhutemperatuur ${etNumber(projection.night.minimum)}…${etNumber(projection.night.maximum)} °C ja päeva õhutemperatuur ${etNumber(projection.day.minimum)}…${etNumber(projection.day.maximum)} °C.`;
}

function forecastContent(projection) {
  return `${forecastSummary(projection)} Öö prognoos: ${projection.night.text} Päeva prognoos: ${projection.day.text}`;
}

function validForecastPeriod(period) {
  return period && typeof period === "object" && !Array.isArray(period)
    && typeof period.minimum === "number" && Number.isFinite(period.minimum)
    && typeof period.maximum === "number" && Number.isFinite(period.maximum)
    && period.minimum >= -60 && period.maximum <= 60 && period.minimum <= period.maximum
    && typeof period.text === "string" && period.text.length >= 20 && period.text.length <= 1_200
    && !/[\u0000-\u001F\u007F]/u.test(period.text) && /[.!?]$/u.test(period.text);
}

export function nationalWeatherForecastFromXml(query, xml, options = {}) {
  const input = String(xml || "");
  const validationNow = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const intent = nationalForecastIntent(query, validationNow);
  const fetchedAt = Number(options.fetchedAt);
  if (!intent || !input || Buffer.byteLength(input, "utf8") > 100_000
    || input.includes("\0") || /<!DOCTYPE|<!ENTITY/iu.test(input)
    || !Number.isFinite(fetchedAt) || fetchedAt > validationNow + WEATHER_OBSERVATION_FUTURE_SKEW_MS
    || validationNow - fetchedAt > WEATHER_FORECAST_STATUS_MAX_AGE_MS
    || options.stale === true) return [];
  let $;
  try {
    $ = load(input, { xmlMode: true });
  } catch {
    return [];
  }
  const roots = $.root().children("forecasts");
  if (roots.length !== 1) return [];
  const forecasts = roots.first().children("forecast").toArray();
  if (forecasts.length !== 4) return [];
  const dated = [];
  for (const forecast of forecasts) {
    const date = String($(forecast).attr("date") || "").trim();
    const timestamp = strictForecastDate(date);
    if (timestamp === null || dated.some((entry) => entry.date === date)) return [];
    dated.push({ date, timestamp, forecast });
  }
  for (let index = 1; index < dated.length; index += 1) {
    if (dated[index].timestamp - dated[index - 1].timestamp !== 24 * 60 * 60_000) return [];
  }
  const localToday = estonianCalendarDate(validationNow);
  if (![localToday, estonianCalendarDate(validationNow, 1)].includes(dated[0].date)) return [];
  const selected = dated.find((entry) => entry.date === intent.targetDate);
  if (!selected) return [];
  const nightNodes = $(selected.forecast).children("night");
  const dayNodes = $(selected.forecast).children("day");
  if (nightNodes.length !== 1 || dayNodes.length !== 1) return [];
  const night = parsedNationalForecastPeriod($, nightNodes.first());
  const day = parsedNationalForecastPeriod($, dayNodes.first());
  if (!night || !day) return [];
  const projection = { targetDate: intent.targetDate, scope: "Eesti", night, day };
  const statusAt = new Date(fetchedAt).toISOString();
  const hash = createHash("sha256").update(input).digest("hex");
  return [{
    id: "weather-forecast",
    title: "Ilm+ – Eesti ilmaprognoos ja hoiatused",
    organization: "Keskkonnaagentuur / Ilmateenistus",
    type: "Ametlik 96 tunni ilmaprognoos",
    published: intent.targetDate,
    url: WEATHER_FORECAST_XML_URL,
    locator: WEATHER_FORECAST_INFO_URL,
    summary: forecastSummary(projection),
    content: forecastContent(projection),
    topics: ["ilm", "ilmaprognoos", "homme", "Eesti", intent.targetDate],
    tags: ["ilm", "ilmaprognoos", "homme", "Eesti", intent.targetDate],
    sourceTier: "official",
    retrieval: "official-structured-forecast-xml",
    delivery: "live-service",
    routeClasses: ["official_live_weather", "official_data_or_api"],
    evidencePolicy: "versioned",
    freshness: {
      class: "live-forecast-version",
      basis: "retrieved-version-at",
      maxAgeMs: WEATHER_FORECAST_STATUS_MAX_AGE_MS,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _contentHash: hash,
    _evidenceVersion: hash,
    _evidenceStatusAt: statusAt,
    _weatherForecast: projection,
  }];
}

function validatedForecastProjection(query, document, now = Date.now()) {
  const intent = nationalForecastIntent(query, now);
  const projection = document?._weatherForecast;
  if (!intent || document?.id !== "weather-forecast"
    || document?.url !== WEATHER_FORECAST_XML_URL
    || document?.locator !== WEATHER_FORECAST_INFO_URL
    || document?.retrieval !== "official-structured-forecast-xml"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || !projection || projection.targetDate !== intent.targetDate || projection.scope !== "Eesti"
    || !validForecastPeriod(projection.night) || !validForecastPeriod(projection.day)
    || document._contentHash !== document._evidenceVersion
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || document.summary !== forecastSummary(projection)
    || document.content !== forecastContent(projection)) return null;
  return projection;
}

export function composeNationalWeatherForecastResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedForecastProjection(query, document, now));
  if (!source) return null;
  const projection = source._weatherForecast;
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: "Värske ametlik ilmaprognoos",
      title: `Eesti ilmaprognoos ${projection.targetDate}`,
      intro: source.summary,
      introCitations: [1],
      parts: [
        { title: "Öö", text: projection.night.text, citations: [1] },
        { title: "Päev", text: projection.day.text, citations: [1] },
      ],
      note: "See on Eesti üldprognoos, mitte linnapõhine prognoos. Prognoos muutub; kontrolli enne otsust värskeimat allikast laaditud prognoosi ja eraldi ilmahoiatusi.",
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: ["Eesti ilmahoiatused", "praegune temperatuur Tallinnas", "ajaloolised ilmaandmed"],
    clarification: null,
    evidence: {
      kind: "structured-national-weather-forecast",
      answerable: true,
      documentIds: [source.id],
    },
  };
}

function latestPublishedHydrologyIntent(query) {
  const text = normalize(query);
  const rawText = String(query || "").toLocaleLowerCase("et");
  const historicalQualifier = /\b(?:eile|uleeile|eelm\w*|moodun\w*|mullu|varasem\w*|ajalool\w*|arhiiv\w*|kuupaev\w*|yesterday|previous|ago)\b/u.test(text)
    || /\blast\s+(?:week|month|year)\b/u.test(text)
    || /\b(?:jaanuar|veebruar|marts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember|january|february|march|april|june|july|september|october|november|december)\w*/u.test(text)
    || /\b(?:[0-3]?\d)[./-](?:0?[1-9]|1[0-2])(?:[./-](?:\d{2}|\d{4}))?\b/u.test(rawText);
  if (!/\b(?:(?:viimati|viimane|viimase|uusim|uusima) avaldat\w*|latest published)\b/u.test(text)
    || /\b(?:praegu|hetkel|reaalajas|jooksev|tana|now|current|real time|miinimum|minimaal|maksimum|maksimaal|madalaim|korgeim|min|max)\w*/u.test(text)
    || /\b(?:19|20)\d{2}\b/u.test(text)
    || historicalQualifier) return null;
  const stations = LATEST_HYDROLOGY_STATIONS.filter((station) => station.query(text));
  const metrics = LATEST_HYDROLOGY_METRICS.filter((metric) => metric.query.test(text));
  return stations.length === 1 && metrics.length === 1
    ? { station: stations[0], metric: metrics[0] }
    : null;
}

export function isLatestPublishedHydrologyQuery(query) {
  return Boolean(latestPublishedHydrologyIntent(query));
}

function hydrologyQuerySince(now) {
  const currentHour = Math.floor(now / (60 * 60_000)) * 60 * 60_000;
  return new Date(currentHour - LATEST_HYDROLOGY_MAX_AGE_MS).toISOString().slice(0, 19);
}

export function latestPublishedHydrologyQueryUrl(query, options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const intent = latestPublishedHydrologyIntent(query);
  if (!intent || !Number.isFinite(now)) return null;
  const querySince = hydrologyQuerySince(now);
  const url = new URL(LATEST_HYDROLOGY_API_URL);
  url.searchParams.set("select", HYDROLOGY_SELECT_FIELDS);
  url.searchParams.set("jaam_kood", `eq.${intent.station.code}`);
  url.searchParams.set("aegrida_nimi", `eq.${intent.metric.series}`);
  url.searchParams.set("timeline_ts_utc", `gte.${querySince}`);
  url.searchParams.set("order", "timeline_ts_utc.desc");
  url.searchParams.set("limit", "2");
  return url.toString();
}

function strictHydrologyTimestamp(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:00:00$/u.test(text)) return null;
  const timestamp = Date.parse(`${text}Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 19) === text
    ? timestamp
    : null;
}

function hydrologyPrimaryText(metric, value) {
  const formatted = new Intl.NumberFormat("et-EE", {
    maximumFractionDigits: metric.key === "discharge" ? 3 : 1,
  }).format(value);
  if (metric.key === "temperature") return `vee temperatuuri tunni keskmine ${formatted} °C`;
  if (metric.key === "discharge") return `arvutusliku äravoolu tunni keskmine ${formatted} m³/s`;
  return `veetaseme tunni keskmine ${formatted} cm`;
}

function hydrologyStatement(projection) {
  return `Keskkonnaagentuuri API viimati avaldatud tunniandmetes oli ${projection.waterbodyGenitive} ${projection.stationName} jaamas ${projection.primaryText} (andmeaeg ${projection.observedAt.slice(0, 16).replace("T", " ")} UTC).`;
}

function hydrologyMetricContext(projection) {
  if (projection.metric === "level") {
    const graphZero = new Intl.NumberFormat("et-EE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(projection.graphZeroEh2000);
    return `Veetase on sentimeetrites ${projection.stationName} jaama graafiku nulli (${graphZero} m EH2000) suhtes, mitte ühise absoluutkõrgusena.`;
  }
  if (projection.metric === "temperature") {
    return "Veetemperatuuri andur paikneb jõesängi põhja lähedal; näit ei ole veepinna ega suplusvee temperatuur.";
  }
  return "Äravool on veetaseme ja mõõdetud vooluhulkade seosest arvutatud näit.";
}

function hydrologyContent(projection) {
  return `${hydrologyStatement(projection)} Allikas avaldab tunniandmed kord ööpäevas, seega ei ole see reaalajanäit. ${hydrologyMetricContext(projection)} Need on operatiivsed toorandmed, mis asendatakse pärast iga-aastast lõplikku kontrolli. Jaamanäit ei kirjelda automaatselt kogu jõge ega valgalat.`;
}

function hydrologyLocator(station) {
  return `Andmestiku kirjeldus: ${LATEST_HYDROLOGY_INFO_URL}; jaamakirjeldus: ${station.infoUrl}`;
}

function validHydrologyRow(row, station, metric) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const expectedKeys = HYDROLOGY_SELECT_FIELDS.split(",");
  const keys = Object.keys(row);
  if (keys.length !== expectedKeys.length || expectedKeys.some((key) => !keys.includes(key))) return null;
  const timestamp = strictHydrologyTimestamp(row.timeline_ts_utc);
  if (row.jaam_kood !== station.code || row.jaam_nimi !== station.name
    || row.jaam_taisnimi !== station.fullName || row.veekogu_nimi !== station.apiWaterbody
    || row.valgala_nimi !== station.catchment || row.aegrida_nimi !== metric.series
    || typeof row.jaam_laiuskraad !== "number" || !Number.isFinite(row.jaam_laiuskraad)
    || row.jaam_laiuskraad < 57 || row.jaam_laiuskraad > 60.5
    || typeof row.jaam_pikkuskraad !== "number" || !Number.isFinite(row.jaam_pikkuskraad)
    || row.jaam_pikkuskraad < 21 || row.jaam_pikkuskraad > 29.5
    || typeof row.vaartus !== "number" || !Number.isFinite(row.vaartus)
    || row.vaartus < metric.minimum || row.vaartus > metric.maximum
    || timestamp === null) return null;
  return { timestamp, value: row.vaartus, latitude: row.jaam_laiuskraad, longitude: row.jaam_pikkuskraad };
}

export function latestPublishedHydrologyFromJson(query, json, options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const intent = latestPublishedHydrologyIntent(query);
  const input = String(json || "");
  if (!intent || !input || Buffer.byteLength(input, "utf8") > MAX_HYDROLOGY_JSON_BYTES
    || input.includes("\0") || options.stale === true) return [];
  let rows;
  try {
    rows = JSON.parse(input);
  } catch {
    return [];
  }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 2) return [];
  const parsedRows = rows.map((row) => validHydrologyRow(row, intent.station, intent.metric));
  if (parsedRows.some((row) => !row)) return [];
  if (parsedRows.length === 2 && parsedRows[0].timestamp <= parsedRows[1].timestamp) return [];
  const latest = parsedRows[0];
  if (latest.timestamp > now + WEATHER_OBSERVATION_FUTURE_SKEW_MS
    || now - latest.timestamp > LATEST_HYDROLOGY_MAX_AGE_MS) return [];
  const querySince = hydrologyQuerySince(now);
  const sinceTimestamp = Date.parse(`${querySince}Z`);
  if (parsedRows.some((row) => row.timestamp < sinceTimestamp)) return [];
  const observedAt = new Date(latest.timestamp).toISOString();
  const waterbodyGenitive = intent.station.key === "tartu-emajogi" ? "Emajõe" : "Pirita jõe";
  const projection = {
    stationKey: intent.station.key,
    stationCode: intent.station.code,
    stationName: intent.station.name,
    stationFullName: intent.station.fullName,
    waterbody: intent.station.waterbody,
    waterbodyGenitive,
    graphZeroEh2000: intent.station.graphZeroEh2000,
    temperatureSensorLocation: intent.station.temperatureSensorLocation,
    stationInfoUrl: intent.station.infoUrl,
    observedAt,
    querySince,
    metric: intent.metric.key,
    series: intent.metric.series,
    unit: intent.metric.unit,
    value: latest.value,
    latitude: latest.latitude,
    longitude: latest.longitude,
    primaryText: hydrologyPrimaryText(intent.metric, latest.value),
  };
  const statement = hydrologyStatement(projection);
  const queryUrl = latestPublishedHydrologyQueryUrl(query, { now });
  return [{
    id: "latest-published-hydrology",
    title: "Viimati avaldatud hüdroloogilised tunniandmed",
    organization: "Keskkonnaagentuur",
    type: "Ametlikud hüdroloogilised tunniandmed",
    published: observedAt.slice(0, 10),
    url: queryUrl,
    locator: hydrologyLocator(intent.station),
    summary: statement,
    content: hydrologyContent(projection),
    topics: ["hüdroloogia", intent.station.waterbody, intent.station.name, intent.metric.key, "viimati avaldatud"],
    tags: ["hüdroloogia", intent.station.waterbody, intent.station.name, intent.metric.key, "tunniandmed"],
    sourceTier: "official",
    retrieval: "official-structured-hydrology-postgrest",
    delivery: "structured-or-download",
    routeClasses: ["official_historical_observation", "official_data_or_api"],
    evidencePolicy: "timestamped",
    freshness: {
      class: "daily-published-hourly-observation",
      basis: "source-observed-at",
      maxAgeMs: LATEST_HYDROLOGY_MAX_AGE_MS,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _contentHash: createHash("sha256").update(input).digest("hex"),
    _evidenceObservedAt: observedAt,
    _hydrologyObservation: projection,
  }];
}

function validatedHydrologyProjection(query, document, now = Date.now()) {
  const intent = latestPublishedHydrologyIntent(query);
  const projection = document?._hydrologyObservation;
  if (!intent || document?.id !== "latest-published-hydrology"
    || document?.url !== latestPublishedHydrologyQueryUrl(query, { now: Date.parse(`${projection?.querySince || ""}Z`) + LATEST_HYDROLOGY_MAX_AGE_MS })
    || document?.locator !== hydrologyLocator(intent.station)
    || document?.retrieval !== "official-structured-hydrology-postgrest"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || !projection || projection.stationKey !== intent.station.key
    || projection.stationCode !== intent.station.code || projection.stationName !== intent.station.name
    || projection.stationFullName !== intent.station.fullName || projection.waterbody !== intent.station.waterbody
    || projection.waterbodyGenitive !== (intent.station.key === "tartu-emajogi" ? "Emajõe" : "Pirita jõe")
    || projection.graphZeroEh2000 !== intent.station.graphZeroEh2000
    || projection.temperatureSensorLocation !== intent.station.temperatureSensorLocation
    || projection.stationInfoUrl !== intent.station.infoUrl
    || projection.metric !== intent.metric.key || projection.series !== intent.metric.series
    || projection.unit !== intent.metric.unit || projection.observedAt !== document._evidenceObservedAt
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))) return null;
  const observedTimestamp = Date.parse(projection.observedAt);
  const sinceTimestamp = Date.parse(`${projection.querySince}Z`);
  if (!Number.isFinite(observedTimestamp) || !Number.isFinite(sinceTimestamp)
    || observedTimestamp < sinceTimestamp || sinceTimestamp > now
    // The lower-bound URL is hour-rounded and may remain visible across a
    // cache/hour boundary. Measurement freshness is enforced independently.
    || now - sinceTimestamp > LATEST_HYDROLOGY_MAX_AGE_MS + 2 * 60 * 60_000
    || typeof projection.value !== "number" || !Number.isFinite(projection.value)
    || projection.value < intent.metric.minimum || projection.value > intent.metric.maximum
    || typeof projection.latitude !== "number" || projection.latitude < 57 || projection.latitude > 60.5
    || typeof projection.longitude !== "number" || projection.longitude < 21 || projection.longitude > 29.5
    || hydrologyPrimaryText(intent.metric, projection.value) !== projection.primaryText
    || hydrologyStatement(projection) !== document.summary
    || hydrologyContent(projection) !== document.content) return null;
  return projection;
}

export function composeLatestPublishedHydrologyResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedHydrologyProjection(query, document, now));
  if (!source) return null;
  const projection = source._hydrologyObservation;
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: "Viimati avaldatud ametlikud tunniandmed",
      title: `${projection.waterbody}, ${projection.stationName}: ${projection.primaryText}`,
      intro: source.summary,
      introCitations: [1],
      parts: [
        {
          title: "Mida näit tähendab",
          text: hydrologyMetricContext(projection),
          citations: [1],
        },
        {
          title: "Andmete staatus",
          text: "Tunni keskmised avaldatakse kord ööpäevas operatiivsete toorandmetena ning need asendatakse pärast iga-aastast lõplikku kontrolli.",
          citations: [1],
        },
      ],
      note: "See on allika viimati avaldatud tunni keskmine, mitte reaalajanäit. Kontrolli andmeaega ja jaama ulatust; operatiivne väärtus võib lõpliku kontrolli järel muutuda.",
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: [
      `${projection.waterbody} jooksvad vaatlused`,
      `${projection.waterbody} ajaloolised hüdroloogilised andmed`,
      "Eesti hüdromeetriajaamad",
    ],
    clarification: null,
    evidence: {
      kind: "structured-latest-published-hydrology",
      answerable: true,
      documentIds: [source.id],
    },
  };
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

function exactCsvHeader(header, expected) {
  return header.length === expected.length
    && header.every((value, index) => value === expected[index]);
}

function municipalWasteHeader(header) {
  if (exactCsvHeader(header, MUNICIPAL_WASTE_LEGACY_HEADER)) {
    return {
      yearIndex: 0,
      nameIndex: 1,
      estoniaIndex: 2,
      euIndex: 3,
      markerIndex: -1,
      estoniaCopyIndex: -1,
      euCopyIndex: -1,
    };
  }
  if (exactCsvHeader(header, MUNICIPAL_WASTE_TABLEAU_HEADER)) {
    return {
      yearIndex: 0,
      nameIndex: 1,
      markerIndex: 2,
      estoniaCopyIndex: 3,
      estoniaIndex: 4,
      euCopyIndex: 5,
      euIndex: 6,
    };
  }
  return null;
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
  const match = String(query || "").match(/(?<!\d)((?:19|20)\d{2})(?!\d)/u);
  return match ? Number(match[1]) : null;
}

function requestedYears(query) {
  return [...new Set(
    [...String(query || "").matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/gu)]
      .map((match) => Number(match[1])),
  )];
}

function hasUnsupportedMunicipalWasteRateIntent(query) {
  const years = requestedYears(query);
  if (years.length > 1) return true;
  const year = years[0] ?? null;
  const tokens = normalize(query).split(/\s+/u).filter(Boolean);
  const hasEstonia = tokens.some((token) => /^eesti\w*$/u.test(token));
  const hasEuropeanUnionName = tokens.some((token, index) => /^euroopa\w*$/u.test(token)
    && /^(?:liit|liid)\w*$/u.test(tokens[index + 1] || ""));
  const hasEuropeanUnion = hasEuropeanUnionName
    || tokens.some((token) => /^el(?:i|iga|is|ist|il|ilt)?$/u.test(token));
  const hasGeographicComparison = hasEstonia && hasEuropeanUnion;
  const hasComparison = tokens.some((token) => /^(?:vordle|vordlus|vorreldes|vs|versus)\w*$/u.test(token));
  const hasLatestPeriod = tokens.some((token) => /^(?:viimati|viima[ns]|uusim|varskeim)\w*$/u.test(token));
  if ((hasComparison && !hasGeographicComparison)
    || (year !== null && tokens.includes("aastaga") && hasComparison)
    || (year !== null && hasLatestPeriod
      && (hasComparison || tokens.includes("ja") || tokens.includes("ning")))) return true;
  const commonToken = (token) => /^(?:kui|kuidas|mis|mida|milline|palju|kas|on|oli|ole|palun|mulle|sa|saad|voiksid|valja|soovin|teada|suur|korge|madal|tapne|umbes|koige)$/u.test(token)
    || /^(?:utle|oelda|anna|naita|esita|too|leia)\w*$/u.test(token)
    || /^(?:olme)?jaatm\w*$/u.test(token)
    || /^ringlussev\w*$/u.test(token)
    || /^(?:maar|protsent|osakaal|tase|naitaja|vaartus|number)\w*$/u.test(token)
    || /^eesti\w*$/u.test(token)
    || /^el(?:i|iga|is|ist|il|ilt)?$/u.test(token)
    || /^(?:ja|ning|vs|versus|vordle|vordlus|vorreldes)\w*$/u.test(token)
    || /^(?:viimati|viima[ns]|uusim|varskeim|teadaolev|avaldatud|kattesaadav)\w*$/u.test(token)
    || /^(?:andm|allik|ametlik)\w*$/u.test(token)
    || /^(?:jargi|kohta)$/u.test(token);
  return tokens.some((token, index) => {
    if (commonToken(token)) return false;
    if (hasEuropeanUnionName && (/^euroopa\w*$/u.test(token) || /^(?:liit|liid)\w*$/u.test(token))) return false;
    if (hasGeographicComparison && /^(?:suurem|korgem|madalam|vaiksem|rohkem|vahem|oma)\w*$/u.test(token)) return false;
    if (year !== null && (token === String(year) || token === `${year}a`)) return false;
    if (year !== null && /^(?:a|aasta|aastal|aastat|aastaga|kalendriaasta\w*|jooksul|loikes|seisuga)$/u.test(token)) return false;
    if (index > 0 && tokens[index - 1] === "el" && /^(?:i|iga|is|ist|il|ilt)$/u.test(token)) return false;
    return true;
  });
}

function isCompletedMunicipalWasteYear(year, now) {
  return Number.isInteger(year)
    && year >= MIN_MUNICIPAL_WASTE_YEAR
    && year < new Date(now).getUTCFullYear();
}

function municipalWasteStatement(projection) {
  const comparison = projection.euRate === null
    ? ""
    : ` ja Euroopa Liidus ${etNumber(projection.euRate)}%`;
  return `Olmejäätmete ringlussevõtu määr Eestis ${projection.year}. aastal oli ${etNumber(projection.estoniaRate)}%${comparison}.`;
}

function municipalWasteContent(projection) {
  return `${municipalWasteStatement(projection)} Andmed on loetud lehele manustatud ametliku Tableau vaate CSV-väljundist.`;
}

export function isMunicipalWasteRecyclingRateQuery(query) {
  const text = normalize(query);
  return /\b(?:olme ?)?jaatm\w*/u.test(text)
    && /\bringlussev\w*/u.test(text)
    && /\b(?:maar|protsent|osakaal|tase)\w*/u.test(text)
    && !hasUnsupportedMunicipalWasteRateIntent(query);
}

export function municipalWasteIndicatorFromCsv(query, csv, options = {}) {
  if (!isMunicipalWasteRecyclingRateQuery(query)) return [];
  const rows = csvRows(csv);
  if (!rows || rows.length < 2) return [];
  const header = rows[0];
  const schema = municipalWasteHeader(header);
  if (!schema) return [];
  const {
    yearIndex,
    nameIndex,
    estoniaIndex,
    euIndex,
    markerIndex,
    estoniaCopyIndex,
    euCopyIndex,
  } = schema;
  const byYear = new Map();
  const seen = new Set();
  const suppliedNow = Number(options.now);
  const now = Number.isFinite(suppliedNow) ? suppliedNow : Date.now();
  const currentYear = new Date(now).getUTCFullYear();
  const maximumPlaceholderYear = currentYear + MAX_MUNICIPAL_WASTE_PLACEHOLDER_YEARS;
  for (const row of rows.slice(1)) {
    if (row.length !== header.length) return [];
    const yearText = String(row[yearIndex] || "");
    if (!/^(?:19|20)\d{2}$/u.test(yearText)) return [];
    const year = Number(yearText);
    if (year < MIN_MUNICIPAL_WASTE_YEAR || year > maximumPlaceholderYear) return [];
    const entity = row[nameIndex];
    if (entity !== "Eesti" && entity !== "Euroopa Liit (EL)") return [];
    const key = `${year}:${entity}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const values = byYear.get(year) || {
      year,
      estonia: null,
      eu: null,
      unavailable: new Set(),
    };
    const estoniaText = String(row[estoniaIndex] || "").trim();
    const euText = String(row[euIndex] || "").trim();
    if (markerIndex >= 0) {
      const marker = String(row[markerIndex] || "").trim();
      const estoniaCopy = String(row[estoniaCopyIndex] || "").trim();
      const euCopy = String(row[euCopyIndex] || "").trim();
      if (entity === "Eesti") {
        if (euText || euCopy || estoniaCopy !== estoniaText
          || (estoniaText ? marker !== "*" : marker !== "Eesti")) return [];
      } else if (estoniaText || estoniaCopy || marker || euCopy !== euText) return [];
    }
    if (entity === "Eesti") {
      if (euText) return [];
      if (!estoniaText) values.unavailable.add(entity);
      else {
        const rate = municipalRate(estoniaText);
        if (rate === null || year > currentYear) return [];
        if (isCompletedMunicipalWasteYear(year, now)) values.estonia = rate;
        else values.unavailable.add(entity);
      }
    } else {
      if (estoniaText) return [];
      if (!euText) values.unavailable.add(entity);
      else {
        const rate = municipalRate(euText);
        if (rate === null || year > currentYear) return [];
        if (isCompletedMunicipalWasteYear(year, now)) values.eu = rate;
        else values.unavailable.add(entity);
      }
    }
    byYear.set(year, values);
  }
  if (!byYear.size || byYear.size > 150) return [];
  const observedYears = [...byYear.values()]
    .filter((observation) => observation.estonia !== null || observation.eu !== null)
    .map((observation) => observation.year);
  if (!observedYears.length) return [];
  const latestObservedYear = Math.max(...observedYears);
  for (const observation of byYear.values()) {
    if (observation.eu !== null && observation.estonia === null) return [];
    if (observation.unavailable.size) {
      if (observation.unavailable.size !== 2
        || observation.year <= latestObservedYear
        || observation.estonia !== null
        || observation.eu !== null) return [];
    }
  }
  const requested = requestedYear(query);
  const available = [...byYear.values()].filter((item) => item.estonia !== null).sort((left, right) => right.year - left.year);
  const observation = requested ? byYear.get(requested) : available[0];
  if (!observation || observation.estonia === null) return [];
  const projection = {
    year: observation.year,
    estoniaRate: observation.estonia,
    euRate: observation.eu,
  };
  const statement = municipalWasteStatement(projection);
  const contentHash = createHash("sha256").update(csv).digest("hex");
  return [{
    id: "municipal-waste-recycling",
    title: "Olmejäätmete ringlussevõtu määr",
    organization: "Keskkonnaportaal / Keskkonnaagentuur",
    type: "Keskkonnanäitaja",
    published: String(observation.year),
    url: MUNICIPAL_WASTE_RECYCLING_CSV_URL,
    locator: MUNICIPAL_WASTE_RECYCLING_LOCATOR,
    actionUrl: MUNICIPAL_WASTE_RECYCLING_PAGE_URL,
    actionLabel: MUNICIPAL_WASTE_RECYCLING_ACTION_LABEL,
    summary: statement,
    content: municipalWasteContent(projection),
    topics: ["jäätmed", "olmejäätmed", "ringlussevõtt", "ringlussevõtu määr", "protsent", String(observation.year)],
    tags: ["jäätmed", "olmejäätmed", "ringlussevõtt", "protsent", String(observation.year)],
    sourceTier: "official",
    retrieval: "official-tableau-csv",
    delivery: "structured-or-download",
    routeClasses: ["official_indicator_or_report", "official_historical_observation", "official_data_or_api"],
    evidencePolicy: "versioned",
    _answerEvidenceEligible: options.stale !== true,
    _contentHash: contentHash,
    _evidenceVersion: contentHash,
    _publishedAt: `${observation.year}-12-31`,
    _municipalWasteRecycling: projection,
  }];
}

function validatedMunicipalWasteProjection(query, document, now = Date.now()) {
  const projection = document?._municipalWasteRecycling;
  const queryYears = requestedYears(query);
  const queryYear = queryYears[0] ?? null;
  const contentHash = String(document?._contentHash || "").trim();
  const validRate = (value) => Number.isFinite(value) && value >= 0 && value <= 100;
  if (!isMunicipalWasteRecyclingRateQuery(query)
    || hasUnsupportedMunicipalWasteRateIntent(query)
    || document?.id !== "municipal-waste-recycling"
    || document?.url !== MUNICIPAL_WASTE_RECYCLING_CSV_URL
    || document?.locator !== MUNICIPAL_WASTE_RECYCLING_LOCATOR
    || document?.actionUrl !== MUNICIPAL_WASTE_RECYCLING_PAGE_URL
    || document?.actionLabel !== MUNICIPAL_WASTE_RECYCLING_ACTION_LABEL
    || document?.retrieval !== "official-tableau-csv"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || !/^[a-f0-9]{64}$/u.test(contentHash)
    || contentHash !== String(document?._evidenceVersion || "").trim()
    || !isPlainObject(projection)
    || Object.keys(projection).length !== 3
    || !["year", "estoniaRate", "euRate"].every((key) => Object.hasOwn(projection, key))
    || !Number.isInteger(projection.year)
    || queryYears.length > 1
    || !isCompletedMunicipalWasteYear(projection.year, now)
    || (queryYear !== null && projection.year !== queryYear)
    || !validRate(projection.estoniaRate)
    || !(projection.euRate === null || validRate(projection.euRate))
    || document?.published !== String(projection.year)
    || document?._publishedAt !== `${projection.year}-12-31`
    || document?.summary !== municipalWasteStatement(projection)
    || document?.content !== municipalWasteContent(projection)) return null;
  return projection;
}

export function composeMunicipalWasteRecyclingResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const candidates = (documents || [])
    .map((document) => ({ document, projection: validatedMunicipalWasteProjection(query, document, now) }))
    .filter((candidate) => candidate.projection);
  if (candidates.length !== 1) return null;
  const { document: source, projection } = candidates[0];
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: "Valideeritud olmejäätmete näitaja",
      title: `Eesti olmejäätmete ringlussevõtu määr oli ${projection.year}. aastal ${etNumber(projection.estoniaRate)}%`,
      intro: source.summary,
      introCitations: [1],
      parts: [],
      note: "See on ametliku CSV-väljundi ajalooline aastanäit. See ei tõenda tulevase sihttaseme saavutamist ega kohaliku omavalitsuse, jäätmevedaja või käitluskoha tulemust.",
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: [
      "Olmejäätmete ringlussevõtu sihttasemed",
      "Ettevõtete jäätmete aastaaruandluse andmed",
      "Jäätmekäitluskohtade kaart",
    ],
    clarification: null,
    evidence: {
      kind: "structured-municipal-waste-recycling",
      answerable: true,
      documentIds: [source.id],
    },
  };
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
    const incrementPoints = window.filter((item) => item.increment !== null).map((item) => ({ x: item.year, y: item.increment }));
    const removalPoints = window.filter((item) => item.removals !== null).map((item) => ({ x: item.year, y: item.removals }));
    const chart = incrementPoints.length >= 2 && removalPoints.length >= 2
      ? {
        kind: "bar",
        title: `Netojuurdekasv ja puidu eemaldamine ${startYear}–${endYear}`,
        unit: "mln m³ koorega",
        xLabel: "Aasta",
        series: [
          { id: "efa-increment", label: "Netojuurdekasv", points: incrementPoints },
          { id: "efa-removals", label: "Puidu eemaldamine", points: removalPoints },
        ],
        citation: eurostatCitation,
        caption: `Eurostat, metsa arvepidamine (for_vol_efa), Eesti. Puuduvaid aastaid ei ole interpoleeritud.`,
      }
      : null;
    return {
      ...(chart ? { chart } : {}),
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
            title: "Keskkonnaagentuuri eraldi viie raiehooaja vaade",
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
          title: "Keskkonnaagentuuri eraldi raiemahu võrdlus",
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
  const timeoutMs = Math.max(250, Math.min(Number(options.timeoutMs) || 2_000, 6_000));
  const documents = [];
  if (isClimateDailyMeanQuery(query, { now: options.now })) {
    try {
      const fetchPostgrestDataset = options.fetchPostgrestDataset || fetchOfficialPostgrestDataset;
      const url = climateDailyQueryUrl(query, { now: options.now });
      const result = await fetchPostgrestDataset(url, {
        timeoutMs,
        signal: options.signal,
        ttlMs: 12 * 60 * 60_000,
        staleMs: 0,
        maximumBytes: 64_000,
        maximumRedirects: 0,
      });
      documents.push(...climateDailyMeanFromJson(query, result.body, {
        fetchedAt: result.fetchedAt,
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The climate-data catalogue remains visible without a numeric claim.
    }
  }
  if (isHarvestShareQuery(query)) {
    const primary = smiHarvestShareDocument(query);
    if (primary) documents.push(primary);
  }
  const forestSeriesQuery = (isForestSeriesQuery(query) || isForestContextSeriesQuery(query))
    && !isForestHarvestBalanceQuery(query) && !isHarvestShareQuery(query);
  // Keskkonnaagentuur's own SMI workbook comes first; Statistikaamet's
  // republication is fetched only for series the workbook does not publish.
  const smiSeries = forestSeriesQuery ? smiForestSeriesDocument(query) : null;
  if (smiSeries) documents.push(smiSeries);
  if (forestSeriesQuery && !smiSeries) {
    try {
      const fetchPxwebDataset = options.fetchPxwebDataset || fetchOfficialPxwebDataset;
      const intent = resolveForestSeriesIntent(query);
      const result = await fetchPxwebDataset(
        intent.table === "KK51" ? FOREST_SERIES_KK51_API_URL : FOREST_SERIES_MM03_API_URL,
        forestSeriesRequest(intent),
        { timeoutMs, signal: options.signal, maximumBytes: 64_000 },
      );
      documents.push(...forestSeriesFromJson(query, result.body, {
        fetchedAt: result.fetchedAt,
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The reviewed SMI catalogue pages remain visible without a series.
    }
  }
  if (isLandUseShareQuery(query) && smiLandCategoriesValid()) {
    documents.push(smiLandCategoryDocument());
  } else if (isLandUseShareQuery(query)) {
    try {
      const fetchPxwebDataset = options.fetchPxwebDataset || fetchOfficialPxwebDataset;
      const result = await fetchPxwebDataset(LAND_USE_KK07_API_URL, landUseShareRequest(), {
        timeoutMs,
        signal: options.signal,
        maximumBytes: 32_000,
      });
      documents.push(...landUseShareFromJson(query, result.body, {
        fetchedAt: result.fetchedAt,
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The share answer keeps its text without the land-use split.
    }
  }
  if (isStatisticsWaterAbstractionQuery(query)) {
    try {
      const fetchPxwebDataset = options.fetchPxwebDataset || fetchOfficialPxwebDataset;
      const result = await fetchPxwebDataset(
        STATISTICS_WATER_ABSTRACTION_API_URL,
        statisticsWaterAbstractionRequest(),
        { timeoutMs, signal: options.signal },
      );
      documents.push(...statisticsWaterAbstractionFromJson(query, result.body, {
        fetchedAt: result.fetchedAt,
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The reviewed PXWeb directory route remains visible without a number.
    }
  }
  if (isStatisticsHazardousWasteQuery(query)) {
    try {
      const fetchPxwebDataset = options.fetchPxwebDataset || fetchOfficialPxwebDataset;
      const result = await fetchPxwebDataset(
        STATISTICS_HAZARDOUS_WASTE_API_URL,
        statisticsHazardousWasteRequest(),
        { timeoutMs, signal: options.signal },
      );
      documents.push(...statisticsHazardousWasteFromJson(query, result.body, {
        fetchedAt: result.fetchedAt,
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The reviewed PXWeb directory route remains visible without a number.
    }
  }
  if (isStatisticsWastewaterBht7Query(query)) {
    try {
      const fetchPxwebDataset = options.fetchPxwebDataset || fetchOfficialPxwebDataset;
      const result = await fetchPxwebDataset(
        STATISTICS_WASTEWATER_BHT7_API_URL,
        statisticsWastewaterBht7Request(),
        { timeoutMs, signal: options.signal },
      );
      documents.push(...statisticsWastewaterBht7FromJson(query, result.body, {
        fetchedAt: result.fetchedAt,
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The reviewed PXWeb directory route remains visible without a number.
    }
  }
  if (isStatisticsTotalWasteRecoveryQuery(query)) {
    try {
      const fetchPxwebDataset = options.fetchPxwebDataset || fetchOfficialPxwebDataset;
      const year = Number(String(query).match(/\b(?:19|20)\d{2}\b/u)?.[0]);
      const request = statisticsTotalWasteRecoveryRequest(year);
      const result = await fetchPxwebDataset(
        STATISTICS_TOTAL_WASTE_RECOVERY_API_URL,
        request,
        { timeoutMs, signal: options.signal },
      );
      documents.push(...statisticsTotalWasteRecoveryFromJson(query, result.body, {
        fetchedAt: result.fetchedAt,
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The reviewed PXWeb directory route remains visible without a number.
    }
  }
  if (isEelisEmajogiPublicWatercourseQuery(query)) {
    try {
      const fetchGeoJsonDataset = options.fetchGeoJsonDataset || fetchOfficialGeoJsonDataset;
      const result = await fetchGeoJsonDataset(EELIS_EMAJOGI_PUBLIC_WATERCOURSE_WFS_URL, {
        timeoutMs,
        signal: options.signal,
      });
      documents.push(...eelisEmajogiPublicWatercourseFromGeoJson(query, result.body, {
        fetchedAt: result.fetchedAt,
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The maintained GeoServer route remains visible without a classification claim.
    }
  }
  if (isEelisNaturaSiteQuery(query)) {
    try {
      const fetchPostgrestDataset = options.fetchPostgrestDataset || fetchOfficialPostgrestDataset;
      const url = eelisNaturaSiteQueryUrl(query);
      const result = await fetchPostgrestDataset(url, {
        timeoutMs,
        signal: options.signal,
        ttlMs: 30 * 60_000,
        staleMs: 0,
        maximumBytes: 32_000,
        maximumRedirects: 0,
      });
      documents.push(...eelisNaturaSiteFromJson(query, result.body, {
        fetchedAt: result.fetchedAt,
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The EELIS catalogue remains visible without a register-fact claim.
    }
  }
  if (isLatestPublishedHydrologyQuery(query)) {
    try {
      const fetchPostgrestDataset = options.fetchPostgrestDataset || fetchOfficialPostgrestDataset;
      const url = latestPublishedHydrologyQueryUrl(query, { now: options.now });
      const result = await fetchPostgrestDataset(url, {
        timeoutMs,
        signal: options.signal,
      });
      documents.push(...latestPublishedHydrologyFromJson(query, result.body, {
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The route-only hydrology views remain available without a numeric claim.
    }
  }
  if (isCurrentWeatherObservationQuery(query)) {
    try {
      const fetchXmlDataset = options.fetchXmlDataset || fetchOfficialXmlDataset;
      const result = await fetchXmlDataset(CURRENT_WEATHER_OBSERVATIONS_XML_URL, {
        timeoutMs,
        signal: options.signal,
      });
      documents.push(...currentWeatherObservationFromXml(query, result.body, {
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The route-only Ilmateenistus directory card remains available.
    }
  }
  if (isNationalWeatherForecastQuery(query, { now: options.now })) {
    try {
      const fetchXmlDataset = options.fetchXmlDataset || fetchOfficialXmlDataset;
      const result = await fetchXmlDataset(WEATHER_FORECAST_XML_URL, {
        timeoutMs,
        signal: options.signal,
      });
      documents.push(...nationalWeatherForecastFromXml(query, result.body, {
        stale: result.stale,
        fetchedAt: result.fetchedAt,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The Ilm+ forecast route remains available without a numeric claim.
    }
  }
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
