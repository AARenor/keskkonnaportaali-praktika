import { createHash } from "node:crypto";
import {
  etNumber,
  FOREST_SERIES_MM03_API_URL,
  FOREST_SERIES_MM03_TABLE_URL,
  FOREST_SERIES_MM03_MEASURES,
  FOREST_SERIES_TABLE_LABELS,
  hasForestPeriodSignal,
  isUnsupportedForestScope,
  normalizeForestSeriesText as normalize,
} from "./forest-series.mjs";
import { sourceEvidenceEligibility } from "./source-registry.mjs";
import { STATISTICS_DISSEMINATION_POLICY_URL } from "./statistics.mjs";

// MM03 publishes 1999–2024; the share answer always uses the latest year.
export const HARVEST_SHARE_LATEST_YEAR = 2024;

const TABLE_ID = "MM03";
const MAX_QUERY_LENGTH = 180;
const MAX_JSON_BYTES = 32_000;
const MAX_OPERATIONAL_FETCH_AGE_MS = 13 * 60 * 60_000;
const FUTURE_FETCH_SKEW_MS = 5 * 60_000;
const GROUP_TOLERANCE = 0.01;
const ROUNDING_SLACK = 0.15;

const CUT_TYPE_LABELS = Object.freeze({
  1: "Koguraie", 2: "Uuendusraie", 3: "..lageraie", 4: "Hooldusraie", 5: "..harvendusraie", 6: "Muu raie",
});
const CUT_TYPE_CODES = Object.freeze(["1", "2", "3", "4", "5", "6"]);
// The asked cut type and the chart slices it covers.
const CUT_TYPES = Object.freeze([
  { code: "3", name: "Lageraie", pattern: /\blageraie\w*/u, slices: ["lageraie"], group: "lageraie" },
  { code: "5", name: "Harvendusraie", pattern: /\bharvendus\w*/u, slices: ["harvendusraie"], group: "harvendusraie" },
  { code: "2", name: "Uuendusraie", pattern: /\buuendusraie\w*/u, slices: ["lageraie", "muu-uuendusraie"], group: "uuendusraie" },
  { code: "4", name: "Hooldusraie", pattern: /\bhooldusraie\w*/u, slices: ["harvendusraie", "muu-hooldusraie"], group: "hooldusraie" },
  { code: "6", name: "Muu raie", pattern: /\bmuu\s+raie\w*/u, slices: ["muu-raie"], group: "muu" },
].map((item) => Object.freeze(item)));
const SLICES = Object.freeze([
  { key: "lageraie", label: "Lageraie", sentence: "lageraie" },
  { key: "muu-uuendusraie", label: "Muu uuendusraie", sentence: "muu uuendusraie" },
  { key: "harvendusraie", label: "Harvendusraie", sentence: "harvendusraie" },
  { key: "muu-hooldusraie", label: "Muu hooldusraie", sentence: "muu hooldusraie" },
  { key: "muu-raie", label: "Muu raie", sentence: "muu raie" },
].map((item) => Object.freeze(item)));

const SHARE_CUE = /\bosa\b|\bprotsent\w*|\bosakaal\w*/u;
const VOLUME_CUE = /raiemah\w*|\bmaht\w*|\bmahu\w*|\bm3\b|\btihumeet\w*/u;

export function harvestShareIntent(query) {
  if (typeof query !== "string" || query.length > MAX_QUERY_LENGTH) return null;
  const text = normalize(query);
  if (!text || isUnsupportedForestScope(text) || hasForestPeriodSignal(text)) return null;
  if (!/\braie\w*/u.test(text) || !SHARE_CUE.test(text) || /juurdekasv\w*/u.test(text)) return null;
  const cutType = CUT_TYPES.find((item) => item.pattern.test(text));
  if (!cutType) return null;
  const measure = VOLUME_CUE.test(text) ? FOREST_SERIES_MM03_MEASURES.volume : FOREST_SERIES_MM03_MEASURES.area;
  return { year: HARVEST_SHARE_LATEST_YEAR, cutType, measure };
}

export function isHarvestShareQuery(query) {
  return harvestShareIntent(query) !== null;
}

export function harvestShareRequest(intent) {
  if (!intent) return null;
  return {
    query: [
      { code: "Aasta", selection: { filter: "item", values: [String(intent.year)] } },
      { code: "Raie liik", selection: { filter: "item", values: [...CUT_TYPE_CODES] } },
      { code: "Näitaja", selection: { filter: "item", values: [intent.measure.code] } },
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

function round1(value) {
  return Number(value.toFixed(1));
}

function share(value, total) {
  return round1((value / total) * 100);
}

function unitDigits(unit) {
  return unit === "tuhat m³" ? 0 : 1;
}

function measureWord(measure) {
  return measure.code === "1" ? "pindala" : "maht";
}

function measureGenitive(measure) {
  return measure.code === "1" ? "pindalast" : "mahust";
}

export function harvestShareStatement(projection) {
  const digits = unitDigits(projection.unit);
  const [first, ...rest] = projection.parts;
  const restText = rest.map((part, index) => (
    `${index === rest.length - 1 ? "ja " : ""}${SLICES.find((item) => item.key === part.key).sentence} ${etNumber(part.value, digits)} ${projection.unit} (${etNumber(part.share, 1)} %)`
  )).join(", ");
  return `Statistikaameti tabeli ${TABLE_ID} (SMI hinnang) järgi oli ${projection.year}. aastal koguraie ${measureWord(projection.measure)} ${etNumber(projection.total, digits)} ${projection.unit}, millest ${SLICES[0].sentence} ${etNumber(first.value, digits)} ${projection.unit} ehk ${etNumber(first.share, 1)} %, ${restText}.`;
}

export function harvestShareContent(projection) {
  return `${harvestShareStatement(projection)} Näitajad on SMI valikuuringu hinnangud koos suhtelise veaga, mitte raiedokumentide statistika; lageraie on uuendusraie osa ja harvendusraie hooldusraie osa. JSON-stat2 vastuse eksitavat „updated” välja ei kasutata avaldamisaja ega värskuse tõendina.`;
}

function parsePayload(intent, payload) {
  const year = String(intent.year);
  const measure = intent.measure;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || payload.class !== "dataset" || payload.version !== "2.0"
    || payload.label !== FOREST_SERIES_TABLE_LABELS.MM03 || payload.source !== "Statistikaamet"
    || !exactArray(payload.id, ["Aasta", "Raie liik", "Näitaja"]) || !exactArray(payload.size, [1, CUT_TYPE_CODES.length, 1])
    || !exactKeys(payload.dimension, ["Aasta", "Raie liik", "Näitaja"])
    || !validDimension(payload.dimension.Aasta, "Aasta", [year], { [year]: year })
    || !validDimension(payload.dimension["Raie liik"], "Raie liik", CUT_TYPE_CODES, CUT_TYPE_LABELS)
    || !validDimension(payload.dimension["Näitaja"], "Näitaja", [measure.code], { [measure.code]: measure.label })
    || !exactKeys(payload.role, ["time"]) || !exactArray(payload.role.time, ["Aasta"])
    || !exactKeys(payload.extension, ["px"]) || !exactKeys(payload.extension.px, ["tableid", "decimals"])
    || payload.extension.px.tableid !== TABLE_ID || payload.extension.px.decimals !== 0
    || (payload.status !== undefined && payload.status !== null)
    || !Array.isArray(payload.value) || payload.value.length !== CUT_TYPE_CODES.length
    || !payload.value.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= measure.max)) return null;
  const [total, regeneration, clearCut, tending, thinning, other] = payload.value;
  if (total <= 0 || clearCut > regeneration + ROUNDING_SLACK || thinning > tending + ROUNDING_SLACK
    || Math.abs(regeneration + tending + other - total) > total * GROUP_TOLERANCE + ROUNDING_SLACK) return null;
  const values = {
    "lageraie": clearCut,
    "muu-uuendusraie": round1(Math.max(0, regeneration - clearCut)),
    "harvendusraie": thinning,
    "muu-hooldusraie": round1(Math.max(0, tending - thinning)),
    "muu-raie": other,
  };
  return {
    year: intent.year,
    measure: { code: measure.code, label: measure.label },
    unit: measure.unit,
    total,
    groups: { koguraie: total, uuendusraie: regeneration, lageraie: clearCut, hooldusraie: tending, harvendusraie: thinning, muu: other },
    parts: SLICES.map((slice) => ({ key: slice.key, label: slice.label, value: values[slice.key], share: share(values[slice.key], total) })),
  };
}

export function harvestShareFromJson(query, json, options = {}) {
  const intent = harvestShareIntent(query);
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
    id: `harvest-share-mm03-${intent.measure.code}-${intent.year}`,
    title: `Statistikaamet MM03: raie${measureWord(intent.measure)} raieliigiti ${intent.year}`,
    organization: "Statistikaamet",
    type: "Ametlik aastastatistika (JSON-stat2)",
    published: String(intent.year),
    url: FOREST_SERIES_MM03_TABLE_URL,
    locator: `PXWeb POST: ${FOREST_SERIES_MM03_API_URL}; valikud Aasta=${intent.year}, Raie liik=1–6, Näitaja=${intent.measure.code} (${intent.measure.label}); levitamispõhimõtted ja litsents: ${STATISTICS_DISSEMINATION_POLICY_URL}`,
    summary: harvestShareStatement(projection),
    content: harvestShareContent(projection),
    topics: ["mets", "raie", "lageraie", "uuendusraie", "hooldusraie", "harvendusraie", "osakaal", TABLE_ID, String(intent.year)],
    tags: ["Statistikaamet", "raie", "SMI", TABLE_ID, "CC BY-SA 4.0"],
    sourceTier: "official",
    retrieval: "official-structured-statistics-pxweb",
    delivery: "structured-or-download",
    routeClasses: ["official_indicator_or_report", "official_historical_observation", "official_data_or_api"],
    evidencePolicy: "claim-specific",
    freshness: { class: "annual-historical-statistic", basis: "reference-year", maxAgeMs: null, requiresSourceTimestamp: false },
    _answerEvidenceEligible: true,
    _contentHash: createHash("sha256").update(input).digest("hex"),
    _harvestShare: projection,
  }];
}

export function validatedHarvestShareProjection(query, document, now = Date.now()) {
  const intent = harvestShareIntent(query);
  const projection = document?._harvestShare;
  if (!intent || !projection || typeof projection !== "object") return null;
  const fetchedAt = Date.parse(String(projection.fetchedAt || ""));
  const groups = projection.groups || {};
  const finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= intent.measure.max;
  const expectedValues = groups && {
    "lageraie": groups.lageraie,
    "muu-uuendusraie": round1(Math.max(0, groups.uuendusraie - groups.lageraie)),
    "harvendusraie": groups.harvendusraie,
    "muu-hooldusraie": round1(Math.max(0, groups.hooldusraie - groups.harvendusraie)),
    "muu-raie": groups.muu,
  };
  if (document.id !== `harvest-share-mm03-${intent.measure.code}-${intent.year}` || document.url !== FOREST_SERIES_MM03_TABLE_URL
    || document.retrieval !== "official-structured-statistics-pxweb"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || projection.year !== intent.year || projection.unit !== intent.measure.unit
    || projection.measure?.code !== intent.measure.code || projection.measure?.label !== intent.measure.label
    || !finite(projection.total) || projection.total <= 0 || groups.koguraie !== projection.total
    || !["uuendusraie", "lageraie", "hooldusraie", "harvendusraie", "muu"].every((key) => finite(groups[key]))
    || groups.lageraie > groups.uuendusraie + ROUNDING_SLACK || groups.harvendusraie > groups.hooldusraie + ROUNDING_SLACK
    || Math.abs(groups.uuendusraie + groups.hooldusraie + groups.muu - projection.total) > projection.total * GROUP_TOLERANCE + ROUNDING_SLACK
    || !Array.isArray(projection.parts) || projection.parts.length !== SLICES.length
    || !projection.parts.every((part, index) => part && part.key === SLICES[index].key && part.label === SLICES[index].label
      && part.value === expectedValues[part.key] && part.share === share(part.value, projection.total))
    || !Number.isFinite(fetchedAt) || fetchedAt > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedAt > MAX_OPERATIONAL_FETCH_AGE_MS
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || document.published !== String(projection.year)
    || harvestShareStatement(projection) !== document.summary
    || harvestShareContent(projection) !== document.content) return null;
  return projection;
}

function chartFromProjection(projection, cutType) {
  return {
    kind: "share",
    title: `Raie${measureWord(projection.measure)} raieliigiti ${projection.year}`,
    unit: projection.unit,
    series: [{
      id: `mm03-share-${projection.measure.code}-${projection.year}`,
      label: `Raieliigid ${projection.year}`,
      points: projection.parts.map((part, index) => ({
        x: index + 1,
        y: part.value,
        label: part.label,
        ...(cutType.slices.includes(part.key) ? { emphasis: true } : {}),
      })),
    }],
    citation: 1,
    caption: `Statistikaamet, tabel ${TABLE_ID}: metsaraie SMI hinnangul. Lageraie kuulub uuendusraie ja harvendusraie hooldusraie hulka.`,
  };
}

export function composeHarvestShareResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const intent = harvestShareIntent(query);
  if (!intent) return null;
  const source = (documents || []).find((document) => validatedHarvestShareProjection(query, document, now));
  if (!source) return null;
  const projection = source._harvestShare;
  const groupValue = projection.groups[intent.cutType.group];
  const groupShare = share(groupValue, projection.total);
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: `Statistikaameti tabel ${TABLE_ID}`,
      title: `${intent.cutType.name} moodustas ${projection.year}. aastal ${etNumber(groupShare, 1)} % koguraie ${measureGenitive(intent.measure)}`,
      intro: source.summary,
      introCitations: [1],
      parts: [{
        title: "Mida näitaja tähendab",
        text: "Näitajad on riikliku metsainventeerimise (SMI) valikuuringu hinnangud koos suhtelise veaga, mitte raiedokumentide statistika. Lageraie on uuendusraie osa ja harvendusraie hooldusraie osa; osakaalud on arvutatud sama aasta koguraie suhtes.",
        citations: [1],
      }],
      note: "See on ühe aasta SMI hinnangute jaotus. See ei ole prognoos, piirkonna või kinnistu näitaja ega otsus raie kestlikkuse kohta.",
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: ["Kuidas on lageraie pindala muutunud viimase kümne aasta jooksul?", "Kas raiemaht ületab juurdekasvu?", "Kui palju raiuti Eestis?"],
    clarification: null,
    evidence: { kind: "structured-harvest-share", answerable: true, documentIds: [source.id] },
    chart: chartFromProjection(projection, intent.cutType),
  };
}
