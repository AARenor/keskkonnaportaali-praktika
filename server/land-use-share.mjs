import { createHash } from "node:crypto";
import { attachChartToDraft } from "./answer-chart.mjs";
import {
  etNumber,
  hasForestPeriodSignal,
  isUnsupportedForestScope,
  normalizeForestSeriesText as normalize,
} from "./forest-series.mjs";
import { sourceEvidenceEligibility } from "./source-registry.mjs";
import { STATISTICS_DISSEMINATION_POLICY_URL } from "./statistics.mjs";

export const LAND_USE_KK07_API_URL = "https://andmed.stat.ee/api/v1/et/stat/keskkond/loodusvarad-ja-nende-kasutamine/maakasutuse-muutumine/KK07.PX";
export const LAND_USE_KK07_TABLE_URL = "https://andmed.stat.ee/et/stat/keskkond__loodusvarad-ja-nende-kasutamine__maakasutuse-muutumine/KK07";
// KK07 publishes 1989–2024; the share answer always uses the latest year.
export const LAND_USE_LATEST_YEAR = 2024;

const TABLE_ID = "KK07";
const TABLE_LABEL = "KK07: MAISMAA PINDALA KLIIMAARUANNETES | Aasta ning Maakasutus";
const UNIT = "tuhat ha";
const MAX_QUERY_LENGTH = 180;
const MAX_JSON_BYTES = 32_000;
const MAX_THOUSAND_HA = 10_000;
const TOTAL_TOLERANCE = 0.005;
const MAX_OPERATIONAL_FETCH_AGE_MS = 13 * 60 * 60_000;
const FUTURE_FETCH_SKEW_MS = 5 * 60_000;

const LAND_USE_CLASSES = Object.freeze([
  { code: "1", label: "Metsamaa*", name: "Metsamaa", sentence: "metsamaa" },
  { code: "2", label: "Põllumaa", name: "Põllumaa", sentence: "põllumaa" },
  { code: "3", label: "Rohumaa", name: "Rohumaa", sentence: "rohumaa" },
  { code: "4", label: "Looduslikud mittemajandatavad märgalad", name: "Looduslikud märgalad", sentence: "looduslikud märgalad" },
  { code: "5", label: "Majandatavad märgalad**", name: "Majandatavad märgalad", sentence: "majandatavad märgalad" },
  { code: "6", label: "Asustusalad", name: "Asustusalad", sentence: "asustusalad" },
  { code: "7", label: "Muu maa", name: "Muu maa", sentence: "muu maa" },
].map((item) => Object.freeze(item)));
const TOTAL_CLASS = Object.freeze({ code: "8", label: "Kokku" });
const ALL_CODES = Object.freeze([...LAND_USE_CLASSES.map((item) => item.code), TOTAL_CLASS.code]);

const SHARE_CUE = /\bosa\b|\bprotsent\w*|\bosakaal\w*|\bmetsasus\w*|\bmetsa\s+all\b|\bkaetud\b|\bmetsane\b/u;
const FELLING = /\braie\w*|\braiu\w*|langeta\w*|\bmaha\b|juurdekasv\w*|\beemalda\w*/u;

// A share question about forest ("kui suur osa Eestist on mets", "mitu
// protsenti", "metsasus") with no period and no regional scope. It never
// replaces the text answer; it only selects the land-use split to show.
export function landUseShareIntent(query) {
  if (typeof query !== "string" || query.length > MAX_QUERY_LENGTH) return null;
  const text = normalize(query);
  if (!text || isUnsupportedForestScope(text) || hasForestPeriodSignal(text)) return null;
  if (!/\bmets\w*/u.test(text) || FELLING.test(text) || !SHARE_CUE.test(text)) return null;
  return { year: LAND_USE_LATEST_YEAR };
}

export function isLandUseShareQuery(query) {
  return landUseShareIntent(query) !== null;
}

export function landUseShareRequest() {
  return {
    query: [
      { code: "Aasta", selection: { filter: "item", values: [String(LAND_USE_LATEST_YEAR)] } },
      { code: "Maakasutus", selection: { filter: "item", values: [...ALL_CODES] } },
    ],
    response: { format: "json-stat2" },
  };
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

function validDimension(dimension, id, codes, labels) {
  return exactKeys(dimension, ["extension", "label", "category"])
    && dimension.label === id
    && exactKeys(dimension.extension, ["show"]) && dimension.extension.show === "value"
    && exactKeys(dimension.category, ["index", "label"])
    && exactKeys(dimension.category.index, codes)
    && codes.every((code, position) => dimension.category.index[code] === position)
    && exactKeys(dimension.category.label, codes)
    && codes.every((code) => dimension.category.label[code] === labels[code]);
}

function share(value, total) {
  return Number(((value / total) * 100).toFixed(1));
}

export function landUseShareStatement(projection) {
  const [forest, ...rest] = projection.parts;
  const restText = rest.map((part, index) => (
    `${index === rest.length - 1 ? "ja " : ""}${LAND_USE_CLASSES.find((item) => item.code === part.code).sentence} ${etNumber(part.value, 1)} ${UNIT} (${etNumber(part.share, 1)} %)`
  )).join(", ");
  return `Statistikaameti tabeli ${TABLE_ID} (kliimaaruandluse maakasutus) järgi oli ${projection.year}. aastal Eesti maismaa pindalast metsamaa ${etNumber(forest.value, 1)} ${UNIT} ehk ${etNumber(forest.share, 1)} %, ${restText}; maismaa kokku ${etNumber(projection.total, 1)} ${UNIT}.`;
}

export function landUseShareContent(projection) {
  return `${landUseShareStatement(projection)} Kliimaaruandluse maakasutusklass „metsamaa” erineb SMI metsamaa definitsioonist, seetõttu ei ole see osakaal sama mis SMI metsasus. JSON-stat2 vastuse eksitavat „updated” välja ei kasutata avaldamisaja ega värskuse tõendina.`;
}

function parsePayload(intent, payload) {
  const year = String(intent.year);
  const labels = Object.fromEntries([...LAND_USE_CLASSES.map((item) => [item.code, item.label]), [TOTAL_CLASS.code, TOTAL_CLASS.label]]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || payload.class !== "dataset" || payload.version !== "2.0"
    || payload.label !== TABLE_LABEL || payload.source !== "Statistikaamet"
    || !exactArray(payload.id, ["Aasta", "Maakasutus"]) || !exactArray(payload.size, [1, ALL_CODES.length])
    || !exactKeys(payload.dimension, ["Aasta", "Maakasutus"])
    || !validDimension(payload.dimension.Aasta, "Aasta", [year], { [year]: year })
    || !validDimension(payload.dimension.Maakasutus, "Maakasutus", ALL_CODES, labels)
    || !exactKeys(payload.role, ["time"]) || !exactArray(payload.role.time, ["Aasta"])
    || !exactKeys(payload.extension, ["px"]) || !exactKeys(payload.extension.px, ["tableid", "decimals"])
    || payload.extension.px.tableid !== TABLE_ID || payload.extension.px.decimals !== 1
    || (payload.status !== undefined && payload.status !== null)
    || !Array.isArray(payload.value) || payload.value.length !== ALL_CODES.length
    || !payload.value.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_THOUSAND_HA)) return null;
  const total = payload.value[ALL_CODES.length - 1];
  const parts = LAND_USE_CLASSES.map((item, index) => ({
    code: item.code,
    label: item.name,
    value: payload.value[index],
    share: share(payload.value[index], total),
  }));
  const sum = parts.reduce((accumulator, part) => accumulator + part.value, 0);
  if (total <= 0 || Math.abs(sum - total) > total * TOTAL_TOLERANCE) return null;
  return { year: intent.year, total, parts };
}

export function landUseShareFromJson(query, json, options = {}) {
  const intent = landUseShareIntent(query);
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
  const projection = { ...parsed, fetchedAt: new Date(fetchedTimestamp).toISOString() };
  return [{
    id: `land-use-share-kk07-${intent.year}`,
    title: `Statistikaamet KK07: Eesti maismaa jagunemine maakasutuse järgi ${intent.year}`,
    organization: "Statistikaamet",
    type: "Ametlik aastastatistika (JSON-stat2)",
    published: String(intent.year),
    url: LAND_USE_KK07_TABLE_URL,
    locator: `PXWeb POST: ${LAND_USE_KK07_API_URL}; valikud Aasta=${intent.year}, Maakasutus=1–8; levitamispõhimõtted ja litsents: ${STATISTICS_DISSEMINATION_POLICY_URL}`,
    summary: landUseShareStatement(projection),
    content: landUseShareContent(projection),
    topics: ["mets", "metsasus", "maakasutus", "osakaal", "metsamaa", TABLE_ID, String(intent.year)],
    tags: ["Statistikaamet", "maakasutus", "metsasus", TABLE_ID, "CC BY-SA 4.0"],
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
    _landUseShare: projection,
  }];
}

export function validatedLandUseShareProjection(query, document, now = Date.now()) {
  const intent = landUseShareIntent(query);
  const projection = document?._landUseShare;
  if (!intent || !projection || typeof projection !== "object") return null;
  const fetchedAt = Date.parse(String(projection.fetchedAt || ""));
  const validPart = (part, index) => part && typeof part === "object"
    && part.code === LAND_USE_CLASSES[index].code && part.label === LAND_USE_CLASSES[index].name
    && typeof part.value === "number" && Number.isFinite(part.value) && part.value >= 0 && part.value <= MAX_THOUSAND_HA
    && part.share === share(part.value, projection.total);
  if (document.id !== `land-use-share-kk07-${intent.year}` || document.url !== LAND_USE_KK07_TABLE_URL
    || document.retrieval !== "official-structured-statistics-pxweb"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || projection.year !== intent.year
    || typeof projection.total !== "number" || !Number.isFinite(projection.total) || projection.total <= 0
    || !Array.isArray(projection.parts) || projection.parts.length !== LAND_USE_CLASSES.length
    || !projection.parts.every(validPart)
    || Math.abs(projection.parts.reduce((sum, part) => sum + part.value, 0) - projection.total) > projection.total * TOTAL_TOLERANCE
    || !Number.isFinite(fetchedAt) || fetchedAt > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedAt > MAX_OPERATIONAL_FETCH_AGE_MS
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || document.published !== String(projection.year)
    || landUseShareStatement(projection) !== document.summary
    || landUseShareContent(projection) !== document.content) return null;
  return projection;
}

function chartFromProjection(projection) {
  return {
    kind: "share",
    title: `Eesti maismaa jagunemine maakasutuse järgi ${projection.year}`,
    unit: UNIT,
    series: [{
      id: `kk07-${projection.year}`,
      label: `Maakasutus ${projection.year}`,
      points: projection.parts.map((part, index) => ({
        x: index + 1,
        y: part.value,
        label: part.label,
        ...(part.code === "1" ? { emphasis: true } : {}),
      })),
    }],
    citation: 1,
    caption: `Statistikaamet, tabel ${TABLE_ID}: maismaa pindala kliimaaruandluses. Kliimaaruandluse metsamaa erineb SMI metsamaa definitsioonist.`,
  };
}

export function landUseShareChart(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  if (!landUseShareIntent(query)) return null;
  const source = (documents || []).find((document) => validatedLandUseShareProjection(query, document, now));
  if (!source) return null;
  return { source, chart: chartFromProjection(source._landUseShare) };
}

export function withLandUseShareChart(draft, query, documents = [], options = {}) {
  if (!draft || typeof draft !== "object" || !draft.answer || draft.chart) return draft;
  if (draft.evidence?.answerable === false) return draft;
  const context = landUseShareChart(query, documents, options);
  return context ? attachChartToDraft(draft, context.source, context.chart) : draft;
}
