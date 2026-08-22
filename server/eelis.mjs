import { createHash } from "node:crypto";
import { sourceEvidenceEligibility } from "./source-registry.mjs";

export const EELIS_GEOSERVER_INFO_URL = "https://keskkonnaportaal.ee/et/avaandmed/geoserver";
export const EELIS_WFS_CAPABILITIES_URL = "https://gsavalik.envir.ee/geoserver/eelis/ows?service=WFS&request=GetCapabilities&version=2.0.0";
export const EELIS_EMAJOGI_CODE = "VEE1023600";

const EELIS_EMAJOGI_LAYER = "eelis:avalikud_vooluveekogud";
const EELIS_EMAJOGI_FIELDS = "sys_id,versioon,kkr_kood,nimi,avalik,avalik_kas,markus";
const EELIS_RECORD_MAX_AGE_MS = 60 * 60_000;
const EELIS_FUTURE_SKEW_MS = 5 * 60_000;
const EELIS_COLLECTION_TIME_SKEW_MS = 15 * 60_000;
const MAX_EELIS_GEOJSON_BYTES = 64_000;
const EELIS_PROPERTY_KEYS = Object.freeze(EELIS_EMAJOGI_FIELDS.split(",").sort());

function buildEelisEmajogiUrl() {
  const url = new URL("https://gsavalik.envir.ee/geoserver/eelis/ows");
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", EELIS_EMAJOGI_LAYER);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("CQL_FILTER", `kkr_kood='${EELIS_EMAJOGI_CODE}'`);
  url.searchParams.set("propertyName", EELIS_EMAJOGI_FIELDS);
  url.searchParams.set("count", "2");
  return url.toString();
}

export const EELIS_EMAJOGI_PUBLIC_WATERCOURSE_WFS_URL = buildEelisEmajogiUrl();

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^0-9a-z]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanText(value, maximum = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximum);
}

function eelisEmajogiIntent(query) {
  const text = normalize(query);
  const asksClassification = /\bemajo\w*/u.test(text)
    && /\bavalik\w*/u.test(text)
    && /\b(?:jogi|veekogu|kasutatav|kasutus)\w*/u.test(text);
  const asksIndividualRight = /\b(?:kas ma|tohi|voi(?:n|b|me|te|vad|ksin|ksid?)|luba|lubatud|juurdepaas|ligipaas|eramaa|kallasrada|kalast|ujum|supel|paat|soiduk|park|telki|telkim|maaomanik|omand|oigus)\w*/u.test(text);
  const asksHistoricalState = /\b(?:19|20)\d{2}\b/u.test(text)
    || /\b(?:eile|uleeile|eelm\w*|moodun\w*|ajalool\w*|arhiiv\w*)\b/u.test(text);
  return asksClassification && !asksIndividualRight && !asksHistoricalState
    ? { code: EELIS_EMAJOGI_CODE, name: "Emajõgi" }
    : null;
}

export function isEelisEmajogiPublicWatercourseQuery(query) {
  return Boolean(eelisEmajogiIntent(query));
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
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function eelisStatement(projection) {
  const checkedAt = projection.fetchedAt.slice(0, 16).replace("T", " ");
  return `EELISe avaliku WFS-i informatiivses ${projection.name.replace(/jõgi$/u, "jõe")} kirjes (${projection.code}) on välja „avalik” väärtus „${projection.publicFlag}” ja välja „avalik_kas” väärtus „${projection.publicUse}” (kontrollitud ${checkedAt} UTC).`;
}

function eelisContent(projection) {
  return `${eelisStatement(projection)} Kirje pärineb kihist „avalikud_vooluveekogud”. WFS-kiht on informatiivne: see ei anna isikupõhist luba pääseda üle eramaa, sõita, kalastada ega teha muud tegevust ning selle versioonivälja ei käsitleta kuupäevana. EELISe allikale tuleb viidata; kihi eritingimuse puudumisel kohaldub CC BY 4.0.`;
}

export function eelisEmajogiPublicWatercourseFromGeoJson(query, json, options = {}) {
  const intent = eelisEmajogiIntent(query);
  const input = String(json || "");
  const now = numericTimestamp(options.now, Date.now());
  const fetchedTimestamp = numericTimestamp(options.fetchedAt, Number.NaN);
  if (!intent || !input || !Number.isFinite(now) || !Number.isFinite(fetchedTimestamp)
    || Buffer.byteLength(input, "utf8") > MAX_EELIS_GEOJSON_BYTES
    || input.includes("\0") || options.stale === true
    || fetchedTimestamp > now + EELIS_FUTURE_SKEW_MS
    || now - fetchedTimestamp > EELIS_RECORD_MAX_AGE_MS) return [];

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return [];
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || payload.type !== "FeatureCollection"
    || payload.totalFeatures !== 1 || payload.numberMatched !== 1 || payload.numberReturned !== 1
    || !Array.isArray(payload.features) || payload.features.length !== 1
    || payload.crs !== null) return [];
  const collectionTimestamp = Date.parse(String(payload.timeStamp || ""));
  if (!Number.isFinite(collectionTimestamp)
    || Math.abs(collectionTimestamp - fetchedTimestamp) > EELIS_COLLECTION_TIME_SKEW_MS) return [];

  const feature = payload.features[0];
  const properties = feature?.properties;
  if (!feature || feature.type !== "Feature" || feature.geometry !== null
    || !/^avalikud_vooluveekogud\.\d+$/u.test(String(feature.id || ""))
    || !exactKeys(properties, EELIS_PROPERTY_KEYS)
    || !Number.isSafeInteger(properties.sys_id) || properties.sys_id <= 0
    || !Number.isSafeInteger(properties.versioon) || properties.versioon <= 0
    || properties.kkr_kood !== intent.code || properties.nimi !== intent.name
    || properties.avalik !== "Jah" || properties.avalik_kas !== "Avalik"
    || properties.markus !== "") return [];

  const fetchedAt = new Date(fetchedTimestamp).toISOString();
  const projection = {
    code: intent.code,
    name: intent.name,
    publicFlag: properties.avalik,
    publicUse: properties.avalik_kas,
    systemId: properties.sys_id,
    recordVersion: properties.versioon,
    note: cleanText(properties.markus),
    fetchedAt,
    collectionTimestamp: new Date(collectionTimestamp).toISOString(),
  };
  return [{
    id: "eelis-emajogi-public-watercourse",
    title: "EELIS: Emajõe avaliku vooluveekogu kirje",
    organization: "EELIS (Eesti looduse infosüsteem), Keskkonnaagentuur",
    type: "Ametlik informatiivne WFS-kirje",
    published: fetchedAt.slice(0, 10),
    url: EELIS_EMAJOGI_PUBLIC_WATERCOURSE_WFS_URL,
    locator: `GeoServeri kirjeldus: ${EELIS_GEOSERVER_INFO_URL}; teenuse tingimused: ${EELIS_WFS_CAPABILITIES_URL}`,
    summary: eelisStatement(projection),
    content: eelisContent(projection),
    topics: ["EELIS", "Emajõgi", EELIS_EMAJOGI_CODE, "avalik veekogu", "WFS"],
    tags: ["EELIS", "Emajõgi", EELIS_EMAJOGI_CODE, "avalik kasutus", "WFS", "CC BY 4.0"],
    sourceTier: "official",
    retrieval: "official-structured-eelis-wfs",
    delivery: "structured-or-download",
    routeClasses: ["official_spatial_or_register", "official_data_or_api"],
    evidencePolicy: "timestamped",
    freshness: {
      class: "event-updated-spatial-record",
      basis: "source-observed-at",
      maxAgeMs: EELIS_RECORD_MAX_AGE_MS,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _contentHash: createHash("sha256").update(input).digest("hex"),
    _evidenceObservedAt: fetchedAt,
    _eelisPublicWatercourse: projection,
  }];
}

function validatedEelisProjection(query, document, now = Date.now()) {
  const intent = eelisEmajogiIntent(query);
  const projection = document?._eelisPublicWatercourse;
  if (!intent || document?.id !== "eelis-emajogi-public-watercourse"
    || document?.url !== EELIS_EMAJOGI_PUBLIC_WATERCOURSE_WFS_URL
    || document?.retrieval !== "official-structured-eelis-wfs"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || !projection || projection.code !== intent.code || projection.name !== intent.name
    || projection.publicFlag !== "Jah" || projection.publicUse !== "Avalik"
    || !Number.isSafeInteger(projection.systemId) || projection.systemId <= 0
    || !Number.isSafeInteger(projection.recordVersion) || projection.recordVersion <= 0
    || projection.note !== ""
    || projection.fetchedAt !== document._evidenceObservedAt
    || !Number.isFinite(Date.parse(projection.collectionTimestamp))
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || eelisStatement(projection) !== document.summary
    || eelisContent(projection) !== document.content) return null;
  return projection;
}

export function composeEelisEmajogiPublicWatercourseResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedEelisProjection(query, document, now));
  if (!source) return null;
  const projection = source._eelisPublicWatercourse;
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: "EELISe informatiivne ruumikiht",
      title: `EELISe kirje: ${projection.name} — avalik „${projection.publicFlag}”, avalik kasutus „${projection.publicUse}”`,
      intro: source.summary,
      introCitations: [1],
      parts: [],
      note: "See on EELISe informatiivse WFS-kihi kirje, mitte individuaalne õigusnõu ega luba pääseda üle eramaa, sõita, kalastada või teha muud tegevust. Kontrolli kehtivat õigust ja konkreetse koha piiranguid algallikast.",
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: [
      "Emajõe hüdroloogilised vaatlusandmed",
      "EELISe avalikud ruumikihid",
      "veekogude kasutamise õiguslikud piirangud",
    ],
    clarification: null,
    evidence: {
      kind: "structured-eelis-public-watercourse",
      answerable: true,
      documentIds: [source.id],
    },
  };
}
