import { createHash } from "node:crypto";
import { sourceEvidenceEligibility } from "./source-registry.mjs";

export const STATISTICS_WATER_ABSTRACTION_API_URL = "https://andmed.stat.ee/api/v1/et/stat/Keskkond/loodusvarad-ja-nende-kasutamine/veekasutus/KK048.PX";
export const STATISTICS_WATER_ABSTRACTION_TABLE_URL = "https://andmed.stat.ee/et/stat/keskkond__loodusvarad-ja-nende-kasutamine__veekasutus/KK048";
export const STATISTICS_WATER_INFO_URL = "https://stat.ee/et/avasta-statistikat/valdkonnad/keskkond/vesi";
export const STATISTICS_DISSEMINATION_POLICY_URL = "https://stat.ee/et/statistikaamet/meist/strateegia/riikliku-statistika-levitamise-pohimotted";
export const STATISTICS_WATER_ABSTRACTION_YEAR = 2024;
export const STATISTICS_WASTEWATER_BHT7_API_URL = "https://andmed.stat.ee/api/v1/et/stat/keskkond/surve-keskkonnaseisundile/vee-saastamine/KK25.PX";
export const STATISTICS_WASTEWATER_BHT7_TABLE_URL = "https://andmed.stat.ee/et/stat/keskkond__surve-keskkonnaseisundile__vee-saastamine/KK25";
export const STATISTICS_WASTEWATER_BHT7_YEAR = 2024;
export const STATISTICS_HAZARDOUS_WASTE_API_URL = "https://andmed.stat.ee/api/v1/et/stat/keskkond/surve-keskkonnaseisundile/jaatmete-teke/KK068.PX";
export const STATISTICS_HAZARDOUS_WASTE_TABLE_URL = "https://andmed.stat.ee/et/stat/keskkond__surve-keskkonnaseisundile__jaatmete-teke/KK068";
export const STATISTICS_HAZARDOUS_WASTE_YEAR = 2024;
export const STATISTICS_TOTAL_WASTE_RECOVERY_API_URL = "https://andmed.stat.ee/api/v1/et/stat/keskkond/surve-keskkonnaseisundile/jaatmete-teke/KK610.PX";
export const STATISTICS_TOTAL_WASTE_RECOVERY_TABLE_URL = "https://andmed.stat.ee/et/stat/keskkond__surve-keskkonnaseisundile__jaatmete-teke/KK610";

const MAX_STATISTICS_JSON_BYTES = 256_000;
const MAX_OPERATIONAL_FETCH_AGE_MS = 13 * 60 * 60_000;
const FUTURE_FETCH_SKEW_MS = 5 * 60_000;
const MAX_WATER_ABSTRACTION_THOUSAND_M3 = 10_000_000;
const TABLE_ID = "KK048";
const UNIT = "tuhat m³";
const EXPECTED_LABEL = "KK048: VEEVÕTT | Aasta, Maakond, Tegevusala (EMTAK 2008) ning Vee liik";
const EXPECTED_DIMENSIONS = Object.freeze([
  Object.freeze({ id: "Aasta", code: "2024", label: "2024" }),
  Object.freeze({ id: "Maakond", code: "1", label: "Kogu Eesti" }),
  Object.freeze({ id: "Tegevusala (EMTAK 2008)", code: "1", label: "Tegevusalad kokku" }),
  Object.freeze({ id: "Vee liik", code: "1", label: "Vesi kokku" }),
]);
const FIXED_REQUEST = Object.freeze({
  query: Object.freeze(EXPECTED_DIMENSIONS.map(({ id, code }) => Object.freeze({
    code: id,
    selection: Object.freeze({ filter: "item", values: Object.freeze([code]) }),
  }))),
  response: Object.freeze({ format: "json-stat2" }),
});
const WASTEWATER_BHT7_TABLE_ID = "KK25";
const WASTEWATER_BHT7_EXPECTED_LABEL = "KK25: PINNAVEEKOGUDESSE JUHITUD HEITVEE REOSTUSKOORMUS | Maakond, Aasta ning Reostuskoormuse näitaja";
const WASTEWATER_BHT7_MAX_TONNES = 10_000_000;
const WASTEWATER_BHT7_EXPECTED_DIMENSIONS = Object.freeze([
  Object.freeze({ id: "Maakond", code: "1", label: "Kogu Eesti" }),
  Object.freeze({ id: "Aasta", code: "2024", label: "2024" }),
  Object.freeze({ id: "Reostuskoormuse näitaja", code: "1", label: "Bioloogiline hapnikutarve (BHT7)" }),
]);
const WASTEWATER_BHT7_FIXED_REQUEST = Object.freeze({
  query: Object.freeze(WASTEWATER_BHT7_EXPECTED_DIMENSIONS.map(({ id, code }) => Object.freeze({
    code: id,
    selection: Object.freeze({ filter: "item", values: Object.freeze([code]) }),
  }))),
  response: Object.freeze({ format: "json-stat2" }),
});
const HAZARDOUS_WASTE_TABLE_ID = "KK068";
const HAZARDOUS_WASTE_EXPECTED_LABEL = "KK068: JÄÄTMETEKE | Aasta, Jäätmeliik ning Tegevusala (EMTAK 2008)";
const HAZARDOUS_WASTE_MAX_TONNES = 100_000_000;
const HAZARDOUS_WASTE_EXPECTED_DIMENSIONS = Object.freeze([
  Object.freeze({ id: "Aasta", code: "2024", label: "2024" }),
  Object.freeze({ id: "Jäätmeliik", code: "41", label: "Ohtlikud jäätmed kokku" }),
  Object.freeze({ id: "Tegevusala (EMTAK 2008)", code: "1", label: "Tegevusalad kokku" }),
]);
const HAZARDOUS_WASTE_FIXED_REQUEST = Object.freeze({
  query: Object.freeze(HAZARDOUS_WASTE_EXPECTED_DIMENSIONS.map(({ id, code }) => Object.freeze({
    code: id,
    selection: Object.freeze({ filter: "item", values: Object.freeze([code]) }),
  }))),
  response: Object.freeze({ format: "json-stat2" }),
});
const TOTAL_WASTE_RECOVERY_TABLE_ID = "KK610";
const TOTAL_WASTE_RECOVERY_EXPECTED_LABEL = "KK610: JÄÄTMEBILANSS | Aasta, Jäätmeliik ning Näitaja";
const TOTAL_WASTE_RECOVERY_MIN_YEAR = 2002;
const TOTAL_WASTE_RECOVERY_MAX_YEAR = 2024;
const TOTAL_WASTE_RECOVERY_MAX_TONNES = 100_000_000;

function totalWasteRecoveryDimensions(year) {
  return [
    { id: "Aasta", code: String(year), label: String(year) },
    { id: "Jäätmeliik", code: "1", label: "Jäätmed kokku" },
    { id: "Näitaja", code: "7", label: "....taaskasutamine" },
  ];
}

export function statisticsWaterAbstractionRequest() {
  return JSON.parse(JSON.stringify(FIXED_REQUEST));
}

export function statisticsWastewaterBht7Request() {
  return JSON.parse(JSON.stringify(WASTEWATER_BHT7_FIXED_REQUEST));
}

export function statisticsHazardousWasteRequest() {
  return JSON.parse(JSON.stringify(HAZARDOUS_WASTE_FIXED_REQUEST));
}

export function statisticsTotalWasteRecoveryRequest(year) {
  const numericYear = Number(year);
  if (!Number.isInteger(numericYear)
    || numericYear < TOTAL_WASTE_RECOVERY_MIN_YEAR
    || numericYear > TOTAL_WASTE_RECOVERY_MAX_YEAR) return null;
  return {
    query: totalWasteRecoveryDimensions(numericYear).map(({ id, code }) => ({
      code: id,
      selection: { filter: "item", values: [code] },
    })),
    response: { format: "json-stat2" },
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

function statisticsWaterAbstractionIntent(query) {
  if (typeof query !== "string" || query.length > 180) return null;
  const text = normalize(query);
  const tokens = text.split(" ").filter(Boolean);
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => Number(match[0]));
  const asksWaterAbstraction = /\bveevot\w*/u.test(text)
    || /\bvee\s+vot\w*/u.test(text)
    || (/\bvett\b/u.test(text) && /\b(?:voeti|voteti|voetud)\w*/u.test(text));
  const asksNationalScope = /\beesti(?:s|l)?\b/u.test(text);
  const asksUnsupportedBreakdown = /\b(?:maakond|vald|linn|tallinn|tartu|parnu|narva|harju|hiiu|ida viru|jogeva|jarva|laane|polva|rapla|saare|valga|viljandi|voru|tegevusala|sektor|ettevote|toostus|pollumajandus|kodumajapid|pohjavesi|kaevandusvesi|pinnavesi|merevesi|mineraalvesi|jahutusvesi|veekasut|elaniku kohta|per capita)\w*/u.test(text);
  const asksUnsupportedAnalysis = /\b(?:praegu|hetkel|jooksev|tana|prognoos|trend|muutus|vordle|vordlus|miks|pohjus|osakaal|protsent)\w*/u.test(text);
  const approvedTokens = new Set([
    "2024", "aasta", "aastal", "eesti", "eestis", "kogu", "kogumaht", "kui", "kokku",
    "mis", "oli", "palju", "suur", "vee", "vett",
  ]);
  const hasOnlyReviewedLanguage = tokens.length > 0 && tokens.every((token) => (
    approvedTokens.has(token)
    || /^veevot\w*$/u.test(token)
    || /^(?:vot\w*|voeti|voteti|voetud)$/u.test(token)
  ));
  return asksWaterAbstraction && asksNationalScope
    && years.length === 1 && years[0] === STATISTICS_WATER_ABSTRACTION_YEAR
    && !asksUnsupportedBreakdown && !asksUnsupportedAnalysis && hasOnlyReviewedLanguage
    ? { year: STATISTICS_WATER_ABSTRACTION_YEAR }
    : null;
}

export function isStatisticsWaterAbstractionQuery(query) {
  return Boolean(statisticsWaterAbstractionIntent(query));
}

function statisticsWastewaterBht7Intent(query) {
  if (typeof query !== "string" || query.length > 180) return null;
  const text = normalize(query);
  const tokens = text.split(" ").filter(Boolean);
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => Number(match[0]));
  const asksBht7 = /\bbht\s*7\b/u.test(text)
    || (/\bbioloogilis\w*\b/u.test(text) && /\bhapnikutarv\w*\b/u.test(text));
  const asksSurfaceWater = /\bpinnaveekog\w*\b/u.test(text);
  const asksWastewaterDischarge = /\bheitve\w*\b/u.test(text)
    || (asksSurfaceWater && /\bjuhit\w*\b/u.test(text));
  const asksLoad = /\b(?:reostuskoorm\w*|tonn\w*)\b/u.test(text);
  const asksNationalScope = /\beesti(?:s|l)?\b/u.test(text);
  const approvedTokens = new Set([
    "2024", "aasta", "aastal", "bht7", "eesti", "eestis", "kogu", "kui", "mis", "mitu",
    "oli", "palju", "suur", "tonni",
  ]);
  const hasOnlyReviewedLanguage = tokens.length > 0 && tokens.every((token) => (
    approvedTokens.has(token)
    || /^bioloogilis\w*$/u.test(token)
    || /^hapnikutarv\w*$/u.test(token)
    || /^heitve\w*$/u.test(token)
    || /^pinnaveekog\w*$/u.test(token)
    || /^reostuskoorm\w*$/u.test(token)
    || /^orgaanilis\w*$/u.test(token)
    || /^juhit\w*$/u.test(token)
  ));
  return asksBht7 && asksWastewaterDischarge && asksSurfaceWater && asksLoad && asksNationalScope
    && years.length === 1 && years[0] === STATISTICS_WASTEWATER_BHT7_YEAR
    && hasOnlyReviewedLanguage
    ? { year: STATISTICS_WASTEWATER_BHT7_YEAR }
    : null;
}

export function isStatisticsWastewaterBht7Query(query) {
  return Boolean(statisticsWastewaterBht7Intent(query));
}

function statisticsHazardousWasteIntent(query) {
  if (typeof query !== "string" || query.length > 180) return null;
  const text = normalize(query);
  const tokens = text.split(" ").filter(Boolean);
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => Number(match[0]));
  const asksHazardousWaste = /\bohtlik\w*\b/u.test(text) && /\bjaat\w*\b/u.test(text);
  const asksGeneration = /\b(?:tekk\w*|jaatmetek\w*)\b/u.test(text);
  const asksAmount = /\b(?:palju|mitu|kogus|tonn|suur)\w*\b/u.test(text);
  const asksNationalTotal = /\beesti(?:s|l)?\b/u.test(text)
    || (/\btegevusala\w*\b/u.test(text) && /\bkokku\b/u.test(text));
  const asksUnsupportedScope = /\b(?:maakond|vald|linn|tallinn|tartu|parnu|narva|harju|hiiu|ida viru|jogeva|jarva|laane|polva|rapla|saare|valga|viljandi|voru|ettevote|kaitleja|kaitluskoht|jaatmejaam|kogumispunkt|kohalik|piirkond)\w*/u.test(text);
  const asksUnsupportedOperation = /\b(?:ringlusse|taaskasut|kaitl|toodel|ladest|polet|transport|vedu|vastu vot|luba|risk|tervis)\w*/u.test(text);
  const asksUnsupportedAnalysis = /\b(?:praegu|hetkel|jooksev|tana|prognoos|trend|muutus|kasv|kahan|vordle|vordlus|miks|pohjus|osakaal|protsent|milline|millised|liikide kaupa)\w*/u.test(text);
  const approvedTokens = new Set([
    "2024", "aasta", "aastal", "eesti", "eestis", "kogu", "kui", "kokku", "mis", "mitu",
    "oli", "palju", "suur", "tegevusaladel", "tonni",
  ]);
  const hasOnlyReviewedLanguage = tokens.length > 0 && tokens.every((token) => (
    approvedTokens.has(token)
    || /^ohtlik\w*$/u.test(token)
    || /^jaat\w*$/u.test(token)
    || /^(?:tekk\w*|jaatmetek\w*)$/u.test(token)
    || /^kogus\w*$/u.test(token)
    || /^tegevusala\w*$/u.test(token)
    || /^tonn\w*$/u.test(token)
  ));
  return asksHazardousWaste && asksGeneration && asksAmount && asksNationalTotal
    && years.length === 1 && years[0] === STATISTICS_HAZARDOUS_WASTE_YEAR
    && !asksUnsupportedScope && !asksUnsupportedOperation && !asksUnsupportedAnalysis
    && hasOnlyReviewedLanguage
    ? { year: STATISTICS_HAZARDOUS_WASTE_YEAR }
    : null;
}

export function isStatisticsHazardousWasteQuery(query) {
  return Boolean(statisticsHazardousWasteIntent(query));
}

function statisticsTotalWasteRecoveryIntent(query) {
  if (typeof query !== "string" || query.length > 180) return null;
  const text = normalize(query);
  const tokens = text.split(" ").filter(Boolean);
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => Number(match[0]));
  const asksWaste = /\bjaat\w*/u.test(text);
  const asksRecovery = /\btaaskasut\w*/u.test(text);
  const asksAmount = /\b(?:kui palju|mitu|kogus|tonn|suur)\w*/u.test(text);
  const asksNationalTotal = /\beesti(?:s|l)?\b/u.test(text) && /\b(?:kogu|kokku|jaatme)\w*/u.test(text);
  const unsupportedScope = /\b(?:olmejaat|ohtlik|maakond|vald|linn|tallinn|tartu|parnu|narva|harju|hiiu|ida viru|jogeva|jarva|laane|polva|rapla|saare|valga|viljandi|voru|ettevote|kaitleja|kaitluskoht|jaatmejaam|piirkond|kohalik|jaatmekood|jaatmeliik)\w*/u.test(text);
  const unsupportedMeasure = /\b(?:ringlussevot|maar|protsent|osakaal|import|eksport|ladest|polet|korvaldam|teke|tekkis)\w*/u.test(text);
  const unsupportedAnalysis = /\b(?:praegu|hetkel|jooksev|tana|prognoos|trend|muutus|kasv|kahan|vordle|vordlus|aastate|miks|pohjus)\w*/u.test(text);
  const approvedTokens = new Set([
    "aasta", "aastal", "eesti", "eestis", "kogu", "kui", "kokku", "mis", "mitu",
    "oli", "palju", "suur", "tonni",
  ]);
  const reviewedLanguage = tokens.length > 0 && tokens.every((token) => (
    approvedTokens.has(token)
    || /^\d{4}$/u.test(token)
    || /^jaat\w*$/u.test(token)
    || /^taaskasut\w*$/u.test(token)
    || /^kogus\w*$/u.test(token)
    || /^tonn\w*$/u.test(token)
  ));
  const year = years[0];
  return asksWaste && asksRecovery && asksAmount && asksNationalTotal
    && years.length === 1 && year >= TOTAL_WASTE_RECOVERY_MIN_YEAR && year <= TOTAL_WASTE_RECOVERY_MAX_YEAR
    && !unsupportedScope && !unsupportedMeasure && !unsupportedAnalysis && reviewedLanguage
    ? { year }
    : null;
}

export function isStatisticsTotalWasteRecoveryQuery(query) {
  return Boolean(statisticsTotalWasteRecoveryIntent(query));
}

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

function validDimension(dimension, expected) {
  return exactKeys(dimension, ["extension", "label", "category"])
    && dimension.label === expected.id
    && exactKeys(dimension.extension, ["show"])
    && dimension.extension.show === "value"
    && exactKeys(dimension.category, ["index", "label"])
    && exactKeys(dimension.category.index, [expected.code])
    && dimension.category.index[expected.code] === 0
    && exactKeys(dimension.category.label, [expected.code])
    && dimension.category.label[expected.code] === expected.label;
}

function etInteger(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
}

function etMillion(value) {
  return (value / 1_000).toFixed(3).replace(".", ",");
}

function statisticsStatement(projection) {
  return `Statistikaameti tabeli ${TABLE_ID} järgi oli ${projection.year}. aastal Eesti veevõtt kokku ${etInteger(projection.valueThousandM3)} tuhat m³ ehk ${etMillion(projection.valueThousandM3)} miljonit m³.`;
}

function statisticsContent(projection) {
  return `${statisticsStatement(projection)} Fikseeritud päringu ulatus on „Kogu Eesti”, „Tegevusalad kokku” ja „Vesi kokku”. Statistikaameti veestatistika teemaleht täpsustab, et veevõtt sisaldab ka kaevandusvee võttu. See on ${projection.year}. aasta statistika, mitte praeguse veeseisu näit; JSON-stat2 vastuse eksitavat „updated” välja ei kasutata avaldamisaja ega värskuse tõendina.`;
}

export function statisticsWaterAbstractionFromJson(query, json, options = {}) {
  const intent = statisticsWaterAbstractionIntent(query);
  const input = String(json || "");
  const now = numericTimestamp(options.now, Date.now());
  const fetchedTimestamp = numericTimestamp(options.fetchedAt, Number.NaN);
  if (!intent || !input || !Number.isFinite(now) || !Number.isFinite(fetchedTimestamp)
    || Buffer.byteLength(input, "utf8") > MAX_STATISTICS_JSON_BYTES
    || input.includes("\0") || options.stale === true
    || fetchedTimestamp > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedTimestamp > MAX_OPERATIONAL_FETCH_AGE_MS) return [];

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return [];
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || payload.class !== "dataset" || payload.version !== "2.0"
    || payload.label !== EXPECTED_LABEL || payload.source !== "Statistikaamet"
    || !exactArray(payload.id, EXPECTED_DIMENSIONS.map(({ id }) => id))
    || !exactArray(payload.size, [1, 1, 1, 1])
    || !exactKeys(payload.dimension, EXPECTED_DIMENSIONS.map(({ id }) => id))
    || !EXPECTED_DIMENSIONS.every((expected) => validDimension(payload.dimension[expected.id], expected))
    || !exactKeys(payload.role, ["time"]) || !exactArray(payload.role.time, ["Aasta"])
    || !exactKeys(payload.extension, ["px"])
    || !exactKeys(payload.extension.px, ["tableid", "decimals"])
    || payload.extension.px.tableid !== TABLE_ID || payload.extension.px.decimals !== 0
    || (payload.status !== undefined && payload.status !== null)
    || !Array.isArray(payload.value) || payload.value.length !== 1
    || !Number.isSafeInteger(payload.value[0]) || payload.value[0] < 0
    || payload.value[0] > MAX_WATER_ABSTRACTION_THOUSAND_M3) return [];

  const projection = {
    year: intent.year,
    valueThousandM3: payload.value[0],
    unit: UNIT,
    geography: "Kogu Eesti",
    activity: "Tegevusalad kokku",
    waterType: "Vesi kokku",
    fetchedAt: new Date(fetchedTimestamp).toISOString(),
  };
  return [{
    id: "statistics-water-abstraction-2024",
    title: "Statistikaamet KK048: Eesti veevõtt 2024",
    organization: "Statistikaamet",
    type: "Ametlik aastastatistika (JSON-stat2)",
    published: String(intent.year),
    url: STATISTICS_WATER_ABSTRACTION_TABLE_URL,
    locator: `Fikseeritud PXWeb POST: ${STATISTICS_WATER_ABSTRACTION_API_URL}; valikud Aasta=2024, Maakond=1 (Kogu Eesti), Tegevusala=1 (Tegevusalad kokku), Vee liik=1 (Vesi kokku); veestatistika teemaleht: ${STATISTICS_WATER_INFO_URL}; levitamispõhimõtted ja litsents: ${STATISTICS_DISSEMINATION_POLICY_URL}`,
    summary: statisticsStatement(projection),
    content: statisticsContent(projection),
    topics: ["veevõtt", "vesi", "Eesti", String(intent.year), TABLE_ID],
    tags: ["Statistikaamet", "veevõtt", "vesi kokku", String(intent.year), TABLE_ID, "CC BY-SA 4.0"],
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
    _statisticsWaterAbstraction: projection,
  }];
}

function validatedStatisticsProjection(query, document, now = Date.now()) {
  const intent = statisticsWaterAbstractionIntent(query);
  const projection = document?._statisticsWaterAbstraction;
  const fetchedAt = Date.parse(String(projection?.fetchedAt || ""));
  if (!intent || document?.id !== "statistics-water-abstraction-2024"
    || document?.url !== STATISTICS_WATER_ABSTRACTION_TABLE_URL
    || document?.retrieval !== "official-structured-statistics-pxweb"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || !projection || projection.year !== intent.year
    || !Number.isSafeInteger(projection.valueThousandM3)
    || projection.valueThousandM3 < 0
    || projection.valueThousandM3 > MAX_WATER_ABSTRACTION_THOUSAND_M3
    || projection.unit !== UNIT || projection.geography !== "Kogu Eesti"
    || projection.activity !== "Tegevusalad kokku" || projection.waterType !== "Vesi kokku"
    || !Number.isFinite(fetchedAt) || fetchedAt > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedAt > MAX_OPERATIONAL_FETCH_AGE_MS
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || statisticsStatement(projection) !== document.summary
    || statisticsContent(projection) !== document.content) return null;
  return projection;
}

export function composeStatisticsWaterAbstractionResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedStatisticsProjection(query, document, now));
  if (!source) return null;
  const projection = source._statisticsWaterAbstraction;
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: `Statistikaameti tabel ${TABLE_ID}`,
      title: `${TABLE_ID} järgi oli ${projection.year}. aasta Eesti veevõtt ${etMillion(projection.valueThousandM3)} miljonit m³`,
      intro: source.summary,
      introCitations: [1],
      parts: [{
        title: "Mida näitaja hõlmab",
        text: `Päring valib tabelist ${TABLE_ID} kogu Eesti, kõik tegevusalad ja vee kokku. Statistikaameti definitsiooni järgi sisaldab veevõtt ka kaevandusvee võttu.`,
        citations: [1],
      }],
      note: `See vastus järgib täpselt tabeli ${TABLE_ID} praegu avaldatud koondit, mitte praegust veeseisu. Teise avaldamishetke või ulatusega ametliku ülevaate arv võib erineda; võrdle ainult sama tabelit, valikuid ja versiooni.`,
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: [
      "Statistikaameti veestatistika",
      "Eesti põhjaveevõtt 2024",
      "Keskkonnaandmete PXWeb API",
    ],
    clarification: null,
    evidence: {
      kind: "structured-statistics-water-abstraction",
      answerable: true,
      documentIds: [source.id],
    },
  };
}

function statisticsWastewaterBht7Statement(projection) {
  return `Statistikaameti tabeli ${WASTEWATER_BHT7_TABLE_ID} järgi oli Eestis ${projection.year}. aastal pinnaveekogudesse juhitud heitvee orgaaniline reostuskoormus bioloogilise hapnikutarbe (BHT7) järgi ${etInteger(projection.valueTonnes)} tonni.`;
}

function statisticsWastewaterBht7Content(projection) {
  return `${statisticsWastewaterBht7Statement(projection)} Fikseeritud päringu ulatus on „Kogu Eesti” ning näitaja „Bioloogiline hapnikutarve (BHT7)”. See on üleriigiline ajalooline heitvee koondnäitaja, mitte ohtlike jäätmete kogus, praegune või kohalik veekvaliteedi hinnang ega loa nõuetele vastavuse otsus. JSON-stat2 vastuse eksitavat „updated” välja ei kasutata avaldamisaja ega värskuse tõendina.`;
}

export function statisticsWastewaterBht7FromJson(query, json, options = {}) {
  const intent = statisticsWastewaterBht7Intent(query);
  const input = String(json || "");
  const now = numericTimestamp(options.now, Date.now());
  const fetchedTimestamp = numericTimestamp(options.fetchedAt, Number.NaN);
  if (!intent || !input || !Number.isFinite(now) || !Number.isFinite(fetchedTimestamp)
    || Buffer.byteLength(input, "utf8") > MAX_STATISTICS_JSON_BYTES
    || input.includes("\0") || options.stale === true
    || fetchedTimestamp > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedTimestamp > MAX_OPERATIONAL_FETCH_AGE_MS) return [];

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return [];
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || payload.class !== "dataset" || payload.version !== "2.0"
    || payload.label !== WASTEWATER_BHT7_EXPECTED_LABEL || payload.source !== "Statistikaamet"
    || !exactArray(payload.id, WASTEWATER_BHT7_EXPECTED_DIMENSIONS.map(({ id }) => id))
    || !exactArray(payload.size, [1, 1, 1])
    || !exactKeys(payload.dimension, WASTEWATER_BHT7_EXPECTED_DIMENSIONS.map(({ id }) => id))
    || !WASTEWATER_BHT7_EXPECTED_DIMENSIONS.every((expected) => validDimension(payload.dimension[expected.id], expected))
    || !exactKeys(payload.role, ["time"]) || !exactArray(payload.role.time, ["Aasta"])
    || !exactKeys(payload.extension, ["px"])
    || !exactKeys(payload.extension.px, ["tableid", "decimals"])
    || payload.extension.px.tableid !== WASTEWATER_BHT7_TABLE_ID || payload.extension.px.decimals !== 0
    || (payload.status !== undefined && payload.status !== null)
    || !Array.isArray(payload.value) || payload.value.length !== 1
    || !Number.isSafeInteger(payload.value[0]) || payload.value[0] < 0
    || payload.value[0] > WASTEWATER_BHT7_MAX_TONNES) return [];

  const projection = {
    year: intent.year,
    valueTonnes: payload.value[0],
    unit: "tonni",
    geography: "Kogu Eesti",
    indicator: "Bioloogiline hapnikutarve (BHT7)",
    destination: "pinnaveekogudesse juhitud heitvesi",
    fetchedAt: new Date(fetchedTimestamp).toISOString(),
  };
  return [{
    id: "statistics-wastewater-bht7-2024",
    title: "Statistikaamet KK25: Eesti heitvee BHT7 reostuskoormus 2024",
    organization: "Statistikaamet",
    type: "Ametlik aastastatistika (JSON-stat2)",
    published: String(intent.year),
    url: STATISTICS_WASTEWATER_BHT7_TABLE_URL,
    locator: `Fikseeritud PXWeb POST: ${STATISTICS_WASTEWATER_BHT7_API_URL}; valikud Maakond=1 (Kogu Eesti), Aasta=2024, Reostuskoormuse näitaja=1 (Bioloogiline hapnikutarve (BHT7)); veestatistika teemaleht: ${STATISTICS_WATER_INFO_URL}; levitamispõhimõtted ja litsents: ${STATISTICS_DISSEMINATION_POLICY_URL}`,
    summary: statisticsWastewaterBht7Statement(projection),
    content: statisticsWastewaterBht7Content(projection),
    topics: ["heitvesi", "pinnaveekogud", "BHT7", "reostuskoormus", "Eesti", String(intent.year), WASTEWATER_BHT7_TABLE_ID],
    tags: ["Statistikaamet", "heitvesi", "bioloogiline hapnikutarve", "BHT7", String(intent.year), WASTEWATER_BHT7_TABLE_ID, "CC BY-SA 4.0"],
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
    _statisticsWastewaterBht7: projection,
  }];
}

function validatedStatisticsWastewaterBht7Projection(query, document, now = Date.now()) {
  const intent = statisticsWastewaterBht7Intent(query);
  const projection = document?._statisticsWastewaterBht7;
  const fetchedAt = Date.parse(String(projection?.fetchedAt || ""));
  if (!intent || document?.id !== "statistics-wastewater-bht7-2024"
    || document?.url !== STATISTICS_WASTEWATER_BHT7_TABLE_URL
    || document?.retrieval !== "official-structured-statistics-pxweb"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || !projection || projection.year !== intent.year
    || !Number.isSafeInteger(projection.valueTonnes)
    || projection.valueTonnes < 0 || projection.valueTonnes > WASTEWATER_BHT7_MAX_TONNES
    || projection.unit !== "tonni" || projection.geography !== "Kogu Eesti"
    || projection.indicator !== "Bioloogiline hapnikutarve (BHT7)"
    || projection.destination !== "pinnaveekogudesse juhitud heitvesi"
    || !Number.isFinite(fetchedAt) || fetchedAt > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedAt > MAX_OPERATIONAL_FETCH_AGE_MS
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || statisticsWastewaterBht7Statement(projection) !== document.summary
    || statisticsWastewaterBht7Content(projection) !== document.content) return null;
  return projection;
}

export function composeStatisticsWastewaterBht7Response(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedStatisticsWastewaterBht7Projection(query, document, now));
  if (!source) return null;
  const projection = source._statisticsWastewaterBht7;
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: `Statistikaameti tabel ${WASTEWATER_BHT7_TABLE_ID}`,
      title: `${WASTEWATER_BHT7_TABLE_ID} järgi oli ${projection.year}. aasta Eesti heitvee BHT7 reostuskoormus ${etInteger(projection.valueTonnes)} tonni`,
      intro: source.summary,
      introCitations: [1],
      parts: [{
        title: "Mida näitaja tähendab",
        text: `Tabel ${WASTEWATER_BHT7_TABLE_ID} valib kogu Eesti ning bioloogilise hapnikutarbe (BHT7), millega väljendatakse pinnaveekogudesse juhitud heitvee orgaanilist reostuskoormust.`,
        citations: [1],
      }],
      note: "See on 2024. aasta üleriigiline heitvee koondnäitaja, mitte ohtlike jäätmete kogus, praegune või kohalik veekvaliteedi hinnang ega loa nõuetele vastavuse otsus.",
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: [
      "Statistikaameti veestatistika",
      "Heitvee reostuskoormuse näitajad",
      "Pinnaveekogumite seisund",
    ],
    clarification: null,
    evidence: {
      kind: "structured-statistics-wastewater-bht7",
      answerable: true,
      documentIds: [source.id],
    },
  };
}

function statisticsHazardousWasteStatement(projection) {
  return `Statistikaameti tabeli ${HAZARDOUS_WASTE_TABLE_ID} järgi tekkis Eestis ${projection.year}. aastal tegevusaladel kokku ${etInteger(projection.valueTonnes)} tonni ohtlikke jäätmeid (kuivkaal).`;
}

function statisticsHazardousWasteContent(projection) {
  return `${statisticsHazardousWasteStatement(projection)} Fikseeritud päringu valikud on „Ohtlikud jäätmed kokku” ja „Tegevusalad kokku”; tabeli mõõtühik on tonni ning märkus täpsustab, et näitaja on kuivkaalus. See on üleriigiline ajalooline jäätmetekke koond, mitte jäätmete käitlemise, ringlussevõtu, piirkonna, ettevõtte, käitluskoha ega hetkeolukorra näitaja. Tabeli märkus hoiatab, et 2020. aasta jäätmeliigituse muudatuse tõttu ei ole põletusjäätmete alamliigid varasemate aastatega võrreldavad, mistõttu adapter ei koosta trendi ega aastate võrdlust. JSON-stat2 vastuse eksitavat „updated” välja ei kasutata avaldamisaja ega värskuse tõendina.`;
}

export function statisticsHazardousWasteFromJson(query, json, options = {}) {
  const intent = statisticsHazardousWasteIntent(query);
  const input = String(json || "");
  const now = numericTimestamp(options.now, Date.now());
  const fetchedTimestamp = numericTimestamp(options.fetchedAt, Number.NaN);
  if (!intent || !input || !Number.isFinite(now) || !Number.isFinite(fetchedTimestamp)
    || Buffer.byteLength(input, "utf8") > MAX_STATISTICS_JSON_BYTES
    || input.includes("\0") || options.stale === true
    || fetchedTimestamp > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedTimestamp > MAX_OPERATIONAL_FETCH_AGE_MS) return [];

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return [];
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || payload.class !== "dataset" || payload.version !== "2.0"
    || payload.label !== HAZARDOUS_WASTE_EXPECTED_LABEL || payload.source !== "Statistikaamet"
    || !exactArray(payload.id, HAZARDOUS_WASTE_EXPECTED_DIMENSIONS.map(({ id }) => id))
    || !exactArray(payload.size, [1, 1, 1])
    || !exactKeys(payload.dimension, HAZARDOUS_WASTE_EXPECTED_DIMENSIONS.map(({ id }) => id))
    || !HAZARDOUS_WASTE_EXPECTED_DIMENSIONS.every((expected) => validDimension(payload.dimension[expected.id], expected))
    || !exactKeys(payload.role, ["time"]) || !exactArray(payload.role.time, ["Aasta"])
    || !exactKeys(payload.extension, ["px"])
    || !exactKeys(payload.extension.px, ["tableid", "decimals"])
    || payload.extension.px.tableid !== HAZARDOUS_WASTE_TABLE_ID || payload.extension.px.decimals !== 0
    || (payload.status !== undefined && payload.status !== null)
    || !Array.isArray(payload.value) || payload.value.length !== 1
    || !Number.isSafeInteger(payload.value[0]) || payload.value[0] < 0
    || payload.value[0] > HAZARDOUS_WASTE_MAX_TONNES) return [];

  const projection = {
    year: intent.year,
    valueTonnes: payload.value[0],
    unit: "tonni (kuivkaal)",
    geography: "Eesti",
    wasteType: "Ohtlikud jäätmed kokku",
    activity: "Tegevusalad kokku",
    fetchedAt: new Date(fetchedTimestamp).toISOString(),
  };
  return [{
    id: "statistics-hazardous-waste-2024",
    title: "Statistikaamet KK068: ohtlike jäätmete teke Eestis 2024",
    organization: "Statistikaamet",
    type: "Ametlik aastastatistika (JSON-stat2)",
    published: String(intent.year),
    url: STATISTICS_HAZARDOUS_WASTE_TABLE_URL,
    locator: `Fikseeritud PXWeb POST: ${STATISTICS_HAZARDOUS_WASTE_API_URL}; valikud Aasta=2024, Jäätmeliik=41 (Ohtlikud jäätmed kokku), Tegevusala=1 (Tegevusalad kokku); levitamispõhimõtted ja litsents: ${STATISTICS_DISSEMINATION_POLICY_URL}`,
    summary: statisticsHazardousWasteStatement(projection),
    content: statisticsHazardousWasteContent(projection),
    topics: ["ohtlikud jäätmed", "jäätmeteke", "Eesti", String(intent.year), HAZARDOUS_WASTE_TABLE_ID],
    tags: ["Statistikaamet", "ohtlikud jäätmed", "jäätmeteke", "kuivkaal", String(intent.year), HAZARDOUS_WASTE_TABLE_ID, "CC BY-SA 4.0"],
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
    _statisticsHazardousWaste: projection,
  }];
}

function validatedStatisticsHazardousWasteProjection(query, document, now = Date.now()) {
  const intent = statisticsHazardousWasteIntent(query);
  const projection = document?._statisticsHazardousWaste;
  const fetchedAt = Date.parse(String(projection?.fetchedAt || ""));
  if (!intent || document?.id !== "statistics-hazardous-waste-2024"
    || document?.url !== STATISTICS_HAZARDOUS_WASTE_TABLE_URL
    || document?.retrieval !== "official-structured-statistics-pxweb"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || !projection || projection.year !== intent.year
    || !Number.isSafeInteger(projection.valueTonnes)
    || projection.valueTonnes < 0 || projection.valueTonnes > HAZARDOUS_WASTE_MAX_TONNES
    || projection.unit !== "tonni (kuivkaal)" || projection.geography !== "Eesti"
    || projection.wasteType !== "Ohtlikud jäätmed kokku"
    || projection.activity !== "Tegevusalad kokku"
    || !Number.isFinite(fetchedAt) || fetchedAt > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedAt > MAX_OPERATIONAL_FETCH_AGE_MS
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || statisticsHazardousWasteStatement(projection) !== document.summary
    || statisticsHazardousWasteContent(projection) !== document.content) return null;
  return projection;
}

export function composeStatisticsHazardousWasteResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedStatisticsHazardousWasteProjection(query, document, now));
  if (!source) return null;
  const projection = source._statisticsHazardousWaste;
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: `Statistikaameti tabel ${HAZARDOUS_WASTE_TABLE_ID}`,
      title: `${HAZARDOUS_WASTE_TABLE_ID} järgi tekkis Eestis ${projection.year}. aastal ${etInteger(projection.valueTonnes)} tonni ohtlikke jäätmeid`,
      intro: source.summary,
      introCitations: [1],
      parts: [{
        title: "Mida näitaja hõlmab",
        text: `Tabel ${HAZARDOUS_WASTE_TABLE_ID} valib ohtlikud jäätmed ja tegevusalad kokku; mõõtühik on tonni kuivkaalus. See on jäätmeteke, mitte käitlemise või ringlussevõtu kogus.`,
        citations: [1],
      }],
      note: "See on 2024. aasta üleriigiline ajalooline koond. Adapter ei anna piirkonna-, ettevõtte-, käitluskoha-, jäätmeliigi alamjaotuse ega hetkeväärtust ning ei koosta 2020. aasta liigitusmuudatuse tõttu aastate trendi.",
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: [
      "Statistikaameti jäätmestatistika",
      "Ohtlike jäätmete käitlemise juhised",
      "Jäätmekäitluskohtade kaart",
    ],
    clarification: null,
    evidence: {
      kind: "structured-statistics-hazardous-waste",
      answerable: true,
      documentIds: [source.id],
    },
  };
}

function statisticsTotalWasteRecoveryStatement(projection) {
  return `Statistikaameti tabeli ${TOTAL_WASTE_RECOVERY_TABLE_ID} järgi taaskasutati Eestis ${projection.year}. aastal jäätmeid kokku ${etInteger(projection.valueTonnes)} tonni.`;
}

function statisticsTotalWasteRecoveryContent(projection) {
  return `${statisticsTotalWasteRecoveryStatement(projection)} Fikseeritud tabelivalik on „Jäätmed kokku” ja näitaja „taaskasutamine”. See on aastane üleriigiline jäätmebilansi kogus, mitte olmejäätmete ringlussevõtu määr, ohtlike jäätmete näitaja, piirkonna- või ettevõtteväärtus, hetkeolukord ega trendivõrdlus. JSON-stat2 vastuse eksitavat „updated” välja ei kasutata avaldamisaja ega värskuse tõendina.`;
}

export function statisticsTotalWasteRecoveryFromJson(query, json, options = {}) {
  const intent = statisticsTotalWasteRecoveryIntent(query);
  const input = String(json || "");
  const now = numericTimestamp(options.now, Date.now());
  const fetchedTimestamp = numericTimestamp(options.fetchedAt, Number.NaN);
  if (!intent || !input || !Number.isFinite(now) || !Number.isFinite(fetchedTimestamp)
    || Buffer.byteLength(input, "utf8") > MAX_STATISTICS_JSON_BYTES
    || input.includes("\0") || options.stale === true
    || fetchedTimestamp > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedTimestamp > MAX_OPERATIONAL_FETCH_AGE_MS) return [];
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return [];
  }
  const expectedDimensions = totalWasteRecoveryDimensions(intent.year);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || payload.class !== "dataset" || payload.version !== "2.0"
    || payload.label !== TOTAL_WASTE_RECOVERY_EXPECTED_LABEL || payload.source !== "Statistikaamet"
    || !exactArray(payload.id, expectedDimensions.map(({ id }) => id))
    || !exactArray(payload.size, [1, 1, 1])
    || !exactKeys(payload.dimension, expectedDimensions.map(({ id }) => id))
    || !expectedDimensions.every((expected) => validDimension(payload.dimension[expected.id], expected))
    || !exactKeys(payload.role, ["time"]) || !exactArray(payload.role.time, ["Aasta"])
    || !exactKeys(payload.extension, ["px"])
    || !exactKeys(payload.extension.px, ["tableid", "decimals"])
    || payload.extension.px.tableid !== TOTAL_WASTE_RECOVERY_TABLE_ID
    || payload.extension.px.decimals !== 0
    || (payload.status !== undefined && payload.status !== null)
    || !Array.isArray(payload.value) || payload.value.length !== 1
    || !Number.isSafeInteger(payload.value[0]) || payload.value[0] < 0
    || payload.value[0] > TOTAL_WASTE_RECOVERY_MAX_TONNES) return [];

  const projection = {
    year: intent.year,
    valueTonnes: payload.value[0],
    unit: "tonni",
    geography: "Eesti",
    wasteType: "Jäätmed kokku",
    indicator: "Taaskasutamine",
    fetchedAt: new Date(fetchedTimestamp).toISOString(),
  };
  return [{
    id: "statistics-total-waste-recovery",
    title: `Statistikaamet KK610: jäätmete taaskasutamine Eestis ${intent.year}`,
    organization: "Statistikaamet",
    type: "Ametlik aastastatistika (JSON-stat2)",
    published: String(intent.year),
    url: STATISTICS_TOTAL_WASTE_RECOVERY_TABLE_URL,
    locator: `Fikseeritud PXWeb POST: ${STATISTICS_TOTAL_WASTE_RECOVERY_API_URL}; valikud Aasta=${intent.year}, Jäätmeliik=1 (Jäätmed kokku), Näitaja=7 (taaskasutamine); levitamispõhimõtted ja litsents: ${STATISTICS_DISSEMINATION_POLICY_URL}`,
    summary: statisticsTotalWasteRecoveryStatement(projection),
    content: statisticsTotalWasteRecoveryContent(projection),
    topics: ["jäätmed", "taaskasutamine", "Eesti", String(intent.year), TOTAL_WASTE_RECOVERY_TABLE_ID],
    tags: ["Statistikaamet", "jäätmed kokku", "taaskasutamine", String(intent.year), TOTAL_WASTE_RECOVERY_TABLE_ID, "CC BY-SA 4.0"],
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
    _statisticsTotalWasteRecovery: projection,
  }];
}

function validatedStatisticsTotalWasteRecoveryProjection(query, document, now) {
  const intent = statisticsTotalWasteRecoveryIntent(query);
  const projection = document?._statisticsTotalWasteRecovery;
  const fetchedAt = Date.parse(String(projection?.fetchedAt || ""));
  if (!intent || document?.id !== "statistics-total-waste-recovery"
    || document?.url !== STATISTICS_TOTAL_WASTE_RECOVERY_TABLE_URL
    || document?.retrieval !== "official-structured-statistics-pxweb"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || !projection || projection.year !== intent.year
    || !Number.isSafeInteger(projection.valueTonnes) || projection.valueTonnes < 0
    || projection.valueTonnes > TOTAL_WASTE_RECOVERY_MAX_TONNES
    || projection.unit !== "tonni" || projection.geography !== "Eesti"
    || projection.wasteType !== "Jäätmed kokku" || projection.indicator !== "Taaskasutamine"
    || !Number.isFinite(fetchedAt) || fetchedAt > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedAt > MAX_OPERATIONAL_FETCH_AGE_MS
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || document.summary !== statisticsTotalWasteRecoveryStatement(projection)
    || document.content !== statisticsTotalWasteRecoveryContent(projection)) return null;
  return projection;
}

export function composeStatisticsTotalWasteRecoveryResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedStatisticsTotalWasteRecoveryProjection(query, document, now));
  if (!source) return null;
  const projection = source._statisticsTotalWasteRecovery;
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: `Statistikaameti tabel ${TOTAL_WASTE_RECOVERY_TABLE_ID}`,
      title: `${TOTAL_WASTE_RECOVERY_TABLE_ID} järgi taaskasutati Eestis ${projection.year}. aastal jäätmeid kokku ${etInteger(projection.valueTonnes)} tonni`,
      intro: source.summary,
      introCitations: [1],
      parts: [{
        title: "Tabelivaliku ulatus",
        text: `Fikseeritud tabelivalik on „${projection.wasteType}” ja näitaja „${projection.indicator.toLocaleLowerCase("et")}”.`,
        citations: [1],
      }],
      note: "See on aastane üleriigiline jäätmebilansi kogus. See ei ole olmejäätmete ringlussevõtu määr, ohtlike jäätmete näitaja, piirkonna- või ettevõtteväärtus, hetkeolukord ega trendivõrdlus.",
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: ["Statistikaameti jäätmestatistika", "Olmejäätmete ringlussevõtu määr", "Ohtlike jäätmete teke"],
    clarification: null,
    evidence: {
      kind: "structured-statistics-total-waste-recovery",
      answerable: true,
      documentIds: [source.id],
    },
  };
}
