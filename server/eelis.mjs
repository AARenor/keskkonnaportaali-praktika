import { createHash } from "node:crypto";
import { sourceEvidenceEligibility } from "./source-registry.mjs";

export const EELIS_GEOSERVER_INFO_URL = "https://keskkonnaportaal.ee/et/avaandmed/geoserver";
export const EELIS_WFS_CAPABILITIES_URL = "https://gsavalik.envir.ee/geoserver/eelis/ows?service=WFS&request=GetCapabilities&version=2.0.0";
export const EELIS_EMAJOGI_CODE = "VEE1023600";
export const EELIS_NATURA_API_URL = "https://keskkonnaandmed.envir.ee/f_rahvalad";
export const EELIS_DATA_SERVICES_INFO_URL = "https://keskkonnaportaal.ee/et/avaandmed/keskkonna-ja-ilma-valdkonna-andmeteenused";

export const EELIS_NATURA_SITES = Object.freeze([
  { id: "lahemaa-loodusala", name: "Lahemaa loodusala", euCode: "EE0010173", kkrCode: "RAH0000601", aliases: ["Lahemaa", "Lahemaa Natura", "Lahemaa loodusala"] },
  { id: "matsalu-loodusala", name: "Matsalu loodusala", euCode: "EE0040501", kkrCode: "RAH0000694", aliases: ["Matsalu", "Matsalu Natura", "Matsalu loodusala"] },
  { id: "soomaa-loodusala", name: "Soomaa loodusala", euCode: "EE0080574", kkrCode: "RAH0000550", aliases: ["Soomaa", "Soomaa Natura", "Soomaa loodusala"] },
  { id: "alam-pedja-loodusala", name: "Alam-Pedja loodusala", euCode: "EE0080374", kkrCode: "RAH0000577", aliases: ["Alam-Pedja", "Alam Pedja", "Alam-Pedja loodusala"] },
  { id: "otepaa-loodusala", name: "Otepää loodusala", euCode: "EE0080401", kkrCode: "RAH0000582", aliases: ["Otepää", "Otepaa", "Otepää loodusala"] },
  { id: "rahumae-loodusala", name: "Rahumäe loodusala", euCode: "EE0010143", kkrCode: "RAH0000451", aliases: ["Rahumäe", "Rahumae", "Rahumäe loodusala"] },
].map((site) => Object.freeze({
  ...site,
  aliases: Object.freeze([...new Set([site.name, ...site.aliases].map((alias) => normalize(alias)))]),
})));

const EELIS_EMAJOGI_LAYER = "eelis:avalikud_vooluveekogud";
const EELIS_EMAJOGI_FIELDS = "sys_id,versioon,kkr_kood,nimi,avalik,avalik_kas,markus";
const EELIS_RECORD_MAX_AGE_MS = 60 * 60_000;
const EELIS_FUTURE_SKEW_MS = 5 * 60_000;
const EELIS_LOCAL_TIMEZONE_MAX_OFFSET_MS = 3 * 60 * 60_000;
const EELIS_COLLECTION_TIME_SKEW_MS = 15 * 60_000;
const MAX_EELIS_GEOJSON_BYTES = 64_000;
const EELIS_PROPERTY_KEYS = Object.freeze(EELIS_EMAJOGI_FIELDS.split(",").sort());
const EELIS_NATURA_FIELDS = "kood,nimi,tyyp,tyyp_selg,kkr_kood,pindala_maa,pindala_vesi,pindala_meri,muut_aeg,keht_staatus";
const EELIS_NATURA_KEYS = Object.freeze(EELIS_NATURA_FIELDS.split(",").sort());
const MAX_EELIS_NATURA_JSON_BYTES = 32_000;
const MAX_EELIS_AREA_HA = 5_000_000;

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
    && /\b(?:jogi|veekogu|vooluveekogu|kasutatav|kasutus)\w*/u.test(text);
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

function hasPhrase(text, phrase) {
  return ` ${text} `.includes(` ${phrase} `);
}

function eelisNaturaSiteIntent(query) {
  if (typeof query !== "string" || query.length > 180) return null;
  const text = normalize(query);
  const matches = EELIS_NATURA_SITES.filter((site) => (
    site.aliases.some((alias) => hasPhrase(text, alias))
  ));
  const asksNaturaRecord = /\bnatura\b/u.test(text) || /\b(?:loodusala|loodusalal|loodusala staatus|loodusala pindala)\b/u.test(text);
  const asksUnsupportedRight = /\bkas\s+ma\b/u.test(text)
    || /\b(?:tohi|voin|voib|voiks|luba|lubatud|eramaa|kallasrada|ehita|ehitus|telki|telkim|jahipid|kalast|juurdepaas|ligipaas|park|soiduk|omanik|omand|oigus)\w*/u.test(text);
  // Remove only the network name. Any year left afterward—including a bare
  // 2000—is a historical-state request that this current-row adapter cannot
  // answer without risking a present-status claim for the past.
  const historicalText = text.replace(/\bnatura\s+2000\b/gu, "natura");
  const asksHistoricalState = /\b(?:19|20)\d{2}\b/u.test(historicalText)
    || /\b(?:eile|uleeile|eelm\w*|moodun\w*|ajalool\w*|arhiiv\w*|vordle|muutus)\b/u.test(text);
  if (matches.length !== 1 || !asksNaturaRecord || asksUnsupportedRight || asksHistoricalState
    || /\blinnuala\w*\b/u.test(text)) return null;
  return { site: matches[0] };
}

export function isEelisNaturaSiteQuery(query) {
  return Boolean(eelisNaturaSiteIntent(query));
}

export function eelisNaturaSiteQueryUrl(query) {
  const intent = eelisNaturaSiteIntent(query);
  if (!intent) return null;
  const url = new URL(EELIS_NATURA_API_URL);
  url.searchParams.set("nimi", `eq.${intent.site.name}`);
  url.searchParams.set("select", EELIS_NATURA_FIELDS);
  url.searchParams.set("limit", "2");
  return url.toString();
}

function strictLocalTimestamp(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/u);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const [year, month, day, hour, minute, second] = [
    yearText, monthText, dayText, hourText, minuteText, secondText,
  ].map(Number);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day && hour <= 23 && minute <= 59 && second <= 59
    ? text
    : null;
}

function strictLocalTimestampEpoch(value) {
  const timestamp = strictLocalTimestamp(value);
  if (timestamp === null) return Number.NaN;
  return Date.parse(`${timestamp.slice(0, 19)}Z`);
}

function etArea(value) {
  return new Intl.NumberFormat("et-EE", { maximumFractionDigits: 2 }).format(value);
}

function eelisNaturaStatement(projection) {
  return `EELISe kehtivas kirjes on ${projection.name} (${projection.euCode}; ${projection.kkrCode}) tüübiga „${projection.type}”. Kirjes on maa pindala ${etArea(projection.landAreaHa)} ha, sisevee pindala ${etArea(projection.inlandWaterAreaHa)} ha ja mere pindala ${etArea(projection.marineAreaHa)} ha.`;
}

function eelisNaturaContent(projection) {
  return `${eelisNaturaStatement(projection)} Registrikirje muutmisaeg on ${projection.recordChangedAt}. See on EELISe informatiivne registrikirje, mitte piiri asukoha, tegevusloa, ehitusõiguse, eramaale juurdepääsu, telkimise ega muu isikupõhise õiguse otsus.`;
}

export function eelisNaturaSiteFromJson(query, json, options = {}) {
  const intent = eelisNaturaSiteIntent(query);
  const input = String(json || "");
  const now = numericTimestamp(options.now, Date.now());
  const fetchedTimestamp = numericTimestamp(options.fetchedAt, Number.NaN);
  if (!intent || !input || !Number.isFinite(now) || !Number.isFinite(fetchedTimestamp)
    || Buffer.byteLength(input, "utf8") > MAX_EELIS_NATURA_JSON_BYTES
    || input.includes("\0") || options.stale === true
    || fetchedTimestamp > now + EELIS_FUTURE_SKEW_MS
    || now - fetchedTimestamp > EELIS_RECORD_MAX_AGE_MS) return [];
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return [];
  }
  if (!Array.isArray(payload) || payload.length !== 1) return [];
  const row = payload[0];
  const changedAt = strictLocalTimestamp(row?.muut_aeg);
  const changedTimestamp = strictLocalTimestampEpoch(changedAt);
  const areas = [row?.pindala_maa, row?.pindala_vesi, row?.pindala_meri];
  if (!exactKeys(row, EELIS_NATURA_KEYS)
    || row.kood !== intent.site.euCode || row.nimi !== intent.site.name
    || row.tyyp !== "7" || row.tyyp_selg !== "Natura (loodusala)"
    || row.kkr_kood !== intent.site.kkrCode || row.keht_staatus !== "Kehtiv"
    || changedAt === null || !Number.isFinite(changedTimestamp)
    || changedTimestamp > now + EELIS_LOCAL_TIMEZONE_MAX_OFFSET_MS + EELIS_FUTURE_SKEW_MS
    || areas.some((area) => typeof area !== "number"
      || !Number.isFinite(area) || area < 0 || area > MAX_EELIS_AREA_HA)) return [];

  const fetchedAt = new Date(fetchedTimestamp).toISOString();
  const projection = {
    catalogueId: intent.site.id,
    name: intent.site.name,
    euCode: intent.site.euCode,
    kkrCode: intent.site.kkrCode,
    type: row.tyyp_selg,
    status: row.keht_staatus,
    landAreaHa: row.pindala_maa,
    inlandWaterAreaHa: row.pindala_vesi,
    marineAreaHa: row.pindala_meri,
    recordChangedAt: changedAt,
    fetchedAt,
  };
  return [{
    id: "eelis-natura-site",
    title: `EELIS: ${projection.name}`,
    organization: "EELIS (Eesti looduse infosüsteem), Keskkonnaagentuur",
    type: "Ametlik informatiivne Natura registrikirje (JSON)",
    published: projection.recordChangedAt.slice(0, 10),
    url: eelisNaturaSiteQueryUrl(query),
    locator: `Andmeteenuste kirjeldus: ${EELIS_DATA_SERVICES_INFO_URL}; EELISe ruumiandmete tingimused: ${EELIS_GEOSERVER_INFO_URL}`,
    actionUrl: "https://register.keskkonnaportaal.ee/register",
    actionLabel: "Ava ala kaardil ja registris",
    summary: eelisNaturaStatement(projection),
    content: eelisNaturaContent(projection),
    topics: ["EELIS", "Natura 2000", projection.name, projection.euCode, projection.kkrCode],
    tags: ["EELIS", "Natura", "loodusala", projection.name, "CC BY 4.0"],
    sourceTier: "official",
    retrieval: "official-structured-eelis-natura",
    delivery: "structured-or-download",
    routeClasses: ["official_spatial_or_register", "official_data_or_api"],
    evidencePolicy: "timestamped",
    freshness: {
      class: "current-spatial-register-record",
      basis: "source-observed-at",
      maxAgeMs: EELIS_RECORD_MAX_AGE_MS,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _contentHash: createHash("sha256").update(input).digest("hex"),
    _evidenceObservedAt: fetchedAt,
    _eelisNaturaSite: projection,
  }];
}

function validatedEelisNaturaProjection(query, document, now) {
  const intent = eelisNaturaSiteIntent(query);
  const projection = document?._eelisNaturaSite;
  const fetchedAt = Date.parse(String(projection?.fetchedAt || ""));
  const changedAt = strictLocalTimestampEpoch(projection?.recordChangedAt);
  if (!intent || document?.id !== "eelis-natura-site"
    || document?.url !== eelisNaturaSiteQueryUrl(query)
    || document?.retrieval !== "official-structured-eelis-natura"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || !projection || projection.catalogueId !== intent.site.id
    || projection.name !== intent.site.name || projection.euCode !== intent.site.euCode
    || projection.kkrCode !== intent.site.kkrCode || projection.type !== "Natura (loodusala)"
    || projection.status !== "Kehtiv" || !Number.isFinite(changedAt)
    || changedAt > now + EELIS_LOCAL_TIMEZONE_MAX_OFFSET_MS + EELIS_FUTURE_SKEW_MS
    || [projection.landAreaHa, projection.inlandWaterAreaHa, projection.marineAreaHa].some((area) => (
      typeof area !== "number" || !Number.isFinite(area) || area < 0 || area > MAX_EELIS_AREA_HA
    ))
    || !Number.isFinite(fetchedAt) || fetchedAt > now + EELIS_FUTURE_SKEW_MS
    || now - fetchedAt > EELIS_RECORD_MAX_AGE_MS
    || projection.fetchedAt !== document._evidenceObservedAt
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || document.summary !== eelisNaturaStatement(projection)
    || document.content !== eelisNaturaContent(projection)) return null;
  return projection;
}

export function composeEelisNaturaSiteResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedEelisNaturaProjection(query, document, now));
  if (!source) return null;
  const projection = source._eelisNaturaSite;
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: "EELISe Natura registrikirje",
      title: `EELISe kirje: ${projection.name} — „${projection.type}”`,
      intro: source.summary,
      introCitations: [1],
      parts: [{
        title: "Kirje ajakohasus",
        text: `EELISe kirje staatus on „${projection.status}” ja registri muutmisaeg ${projection.recordChangedAt}.`,
        citations: [1],
      }],
      note: "See on EELISe informatiivne registrikirje, mitte piiri asukoha, tegevusloa, ehitusõiguse, eramaale juurdepääsu, telkimise ega muu isikupõhise õiguse otsus.",
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: ["Natura 2000 alade kaart", `${projection.name} registrikirje`, "EELISe avaandmed"],
    clarification: null,
    evidence: {
      kind: "structured-eelis-natura-site",
      answerable: true,
      documentIds: [source.id],
    },
  };
}
