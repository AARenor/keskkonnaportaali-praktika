import { officialCitationUrlEligibility } from "./citation-policy.mjs";

export const OFFICIAL_ROUTE_CLASSES = Object.freeze([
  "official_data_or_api",
  "official_spatial_or_register",
  "official_live_weather",
  "official_live_air",
  "official_live_water",
  "official_historical_observation",
  "official_indicator_or_report",
  "official_guidance",
  "official_legal_context",
  "official_forestry_evidence",
  "official_environmental_assessment",
]);

const ROUTE_CLASS_IDS = Object.freeze({
  official_data_or_api: new Set([
    "open-data", "kese-monitoring", "official-data-services", "open-data-downloader",
    "official-geoserver", "kaia-service", "statistics-pxweb", "waste-reporting-data",
    "forest-spatial-data", "official-cadastre-wfs", "official-forest-register-wfs", "latest-published-hydrology",
    "eelis-emajogi-public-watercourse", "eelis-natura-site", "statistics-water-abstraction-2024",
    "statistics-wastewater-bht7-2024", "statistics-hazardous-waste-2024", "statistics-total-waste-recovery",
    "climate-station-daily-mean",
  ]),
  official_spatial_or_register: new Set([
    "environment-register", "official-geoserver", "waste-facilities-map", "well-register",
    "metsaregister", "forest-spatial-data", "official-cadastre-wfs", "official-forest-register-wfs",
    "forest-catalogue", "biodiversity", "tallinn-noise-map", "tartu-noise-map",
    "eelis-emajogi-public-watercourse", "eelis-natura-site",
  ]),
  official_live_weather: new Set(["weather-forecast", "current-weather-observations", "kaia-service"]),
  official_live_air: new Set(["air-quality-live"]),
  official_live_water: new Set([
    "current-hydrology-observations", "marine-observations", "marine-ice-map", "bathing-water-quality",
  ]),
  official_historical_observation: new Set([
    "historical-weather-data", "historical-hydrology-data", "marine-observations",
    "marine-ice-map", "kese-monitoring", "water-monitoring", "latest-published-hydrology",
    "statistics-water-abstraction-2024", "statistics-wastewater-bht7-2024", "statistics-hazardous-waste-2024",
    "statistics-total-waste-recovery",
    "climate-station-daily-mean",
  ]),
  official_indicator_or_report: new Set([
    "climate-atlas", "water-monitoring", "radiation-monitoring", "soil-monitoring-results",
    "precipitation-change", "greenhouse-gas-inventory", "municipal-waste-recycling", "municipal-waste-recycling-page",
    "groundwater-status", "marine-strategy-status", "bathing-water-quality",
    "groundwater-pesticide-monitoring", "wildlife-status-2025", "electric-vehicle-lifecycle",
    "baltic-sea-litter", "ida-viru-groundwater",
    "statistics-water-abstraction-2024", "statistics-wastewater-bht7-2024", "statistics-hazardous-waste-2024",
    "statistics-total-waste-recovery",
    "forest-area", "forest-stock-stable", "forest-condition-review", "protected-forest-share",
    "forest-smi-2024-summary", "forest-smi-2025-presentation", "forest-yearbook-2023-fellings",
    "forest-climate-adaptation-report", "increment-method", "clearcut-over-time",
  ]),
  official_guidance: new Set([
    "waste-burning-guidance", "protected-nature-guidance", "mining-impact-guidance",
    "mined-land-restoration", "wastewater-local-treatment", "baltic-sea-litter",
    "hazardous-waste-asbestos", "river-dams-fish", "green-network-planning-guide",
    "invasive-species-guidance", "organizational-footprint", "wetland-restoration",
    "solar-panel-end-of-life", "protected-area-construction", "wind-farm-assessment-guide",
    "forest-notice-guidance", "forest-register-workflow", "forest-rmk-data-methods",
    "water-monitoring", "protected-nature-guidance", "metsainfo-hetkeseis",
  ]),
  official_legal_context: new Set([
    "environmental-permits", "protected-area-construction", "forest-notice-guidance",
    "forest-register-workflow", "forest-law", "nature-conservation-law", "environmental-assessment",
    "protected-nature-guidance",
  ]),
  official_forestry_evidence: new Set([
    "forest-overview", "forest-catalogue", "forest-inventory-publication", "smi", "forest-area",
    "forest-stock-stable", "forest-condition-review", "metsainfo-hetkeseis", "metsaregister",
    "smi-metsaregister", "forest-balance-kaur-methodology", "forest-smi-2024-summary",
    "forest-notice-guidance", "forest-law", "nature-conservation-law", "protected-forest-share",
    "forest-spatial-data", "forest-smi-2025-presentation", "forest-smi-methodology-20-years",
    "forest-rmk-data-methods", "forest-yearbook-2023-fellings", "forest-climate-adaptation-report",
    "forest-register-workflow", "increment-method", "clearcut-over-time", "official-forest-register-wfs",
  ]),
  official_environmental_assessment: new Set([
    "environmental-assessment", "wind-farm-assessment-guide", "mining-impact-guidance",
  ]),
});

const STRUCTURED_SOURCE_IDS = new Set([
  "statistics-pxweb", "official-geoserver", "official-cadastre-wfs", "official-forest-register-wfs",
  "historical-weather-data", "historical-hydrology-data", "kese-monitoring", "official-data-services",
  "open-data-downloader", "waste-reporting-data", "current-weather-observations", "weather-forecast",
  "latest-published-hydrology", "eelis-emajogi-public-watercourse", "eelis-natura-site",
  "statistics-water-abstraction-2024", "statistics-wastewater-bht7-2024", "statistics-hazardous-waste-2024",
  "statistics-total-waste-recovery",
  "climate-station-daily-mean", "municipal-waste-recycling",
]);
const LIVE_SOURCE_IDS = new Set([
  "weather-forecast", "current-weather-observations", "kaia-service", "air-quality-live", "marine-observations", "marine-ice-map",
  "bathing-water-quality",
]);
const EVIDENCE_POLICIES = new Set([
  "route-only",
  "timestamped",
  "versioned",
  "claim-specific",
]);
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const DEFAULT_FUTURE_SKEW_MS = 5 * 60 * 1_000;

function clean(value = "") {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function routeClassesFor(document = {}) {
  if (Array.isArray(document.routeClasses)) {
    return [...new Set(document.routeClasses)]
      .filter((routeClass) => OFFICIAL_ROUTE_CLASSES.includes(routeClass));
  }
  const classes = OFFICIAL_ROUTE_CLASSES.filter((routeClass) => ROUTE_CLASS_IDS[routeClass].has(document.id));
  const tags = clean([...(document.tags || []), ...(document.topics || [])].join(" ")).toLocaleLowerCase("et");
  const type = clean(document.type).toLocaleLowerCase("et");
  if (!classes.length && /\b(?:juhend|juhis|käsiraamat|kasutusjuhend)\b/iu.test(`${type} ${tags}`)) {
    classes.push("official_guidance");
  }
  if (!classes.length && /\b(?:näitaja|seire|statistika|aruanne|ülevaade)\b/iu.test(`${type} ${tags}`)) {
    classes.push("official_indicator_or_report");
  }
  return classes;
}

function sourceDelivery(document = {}) {
  const explicit = clean(document.delivery);
  if (explicit) return explicit;
  if (LIVE_SOURCE_IDS.has(document.id)) return "live-service";
  if (STRUCTURED_SOURCE_IDS.has(document.id)) return "structured-or-download";
  if (document.retrieval === "official-federated-search") return "federated-discovery";
  return "catalog-and-bounded-hydration";
}

function evidencePolicyFor(document = {}) {
  if (document.retrieval === "official-federated-search"
    || document.delivery === "federated-discovery") return "route-only";
  const explicit = clean(document.evidencePolicy);
  return EVIDENCE_POLICIES.has(explicit) ? explicit : "route-only";
}

function freshnessFor(document = {}, delivery = "") {
  if (document.freshness && typeof document.freshness === "object" && !Array.isArray(document.freshness)) {
    return Object.freeze({ ...document.freshness });
  }
  return Object.freeze({
    class: delivery === "live-service" ? "live" : "maintained-or-periodic",
    basis: "retrieved-at",
    maxAgeMs: null,
    requiresSourceTimestamp: delivery === "live-service",
  });
}

function strictTimestamp(value) {
  const text = clean(value);
  if (!ISO_TIMESTAMP_PATTERN.test(text)) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/u);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = "", zone, sign, offsetHourText, offsetMinuteText] = match;
  const [year, month, day, hour, minute, second] = [
    yearText, monthText, dayText, hourText, minuteText, secondText,
  ].map(Number);
  const millisecond = Number(fraction.padEnd(3, "0"));
  const offsetHour = zone === "Z" ? 0 : Number(offsetHourText);
  const offsetMinute = zone === "Z" ? 0 : Number(offsetMinuteText);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59
    || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, millisecond);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) return null;
  const signedOffset = zone === "Z" ? 0 : (sign === "+" ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  const timestamp = calendar.getTime() - signedOffset * 60_000;
  return Number.isFinite(timestamp) && Date.parse(text) === timestamp ? timestamp : null;
}

function boundedPositiveDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 && duration <= 10 * 366 * 24 * 60 * 60 * 1_000
    ? duration
    : null;
}

function strictPublishedTimestamp(value) {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) {
    const timestamp = Date.parse(`${text}T00:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === text
      ? timestamp
      : null;
  }
  return strictTimestamp(text);
}

function requiredClaimFreshness(document, { now, futureSkewMs }) {
  const freshness = document.freshness;
  if (freshness?.requiresSourceTimestamp !== true) return null;
  if (document._answerEvidenceEligible !== true) {
    return { eligible: false, reason: "adapter-not-validated" };
  }
  const basis = clean(freshness.basis);
  if (basis === "source-version") {
    const version = clean(document._evidenceVersion);
    return version && version.length <= 120
      ? { eligible: true, reason: "explicit-version" }
      : { eligible: false, reason: "invalid-source-version" };
  }
  if (basis === "source-published-at") {
    const publishedAt = strictPublishedTimestamp(document._publishedAt);
    const maxAgeMs = boundedPositiveDuration(freshness.maxAgeMs);
    if (publishedAt === null || maxAgeMs === null) {
      return { eligible: false, reason: "invalid-source-publication-time" };
    }
    if (publishedAt > now + futureSkewMs || now - publishedAt > maxAgeMs) {
      return { eligible: false, reason: "stale-or-future-publication" };
    }
    return { eligible: true, reason: "fresh-source-publication" };
  }
  return { eligible: false, reason: "unsupported-freshness-basis" };
}

export function sourceEvidenceEligibility(document = {}, {
  now = Date.now(),
  futureSkewMs = DEFAULT_FUTURE_SKEW_MS,
} = {}) {
  const explicitPolicy = clean(document.evidencePolicy);
  if (explicitPolicy && !EVIDENCE_POLICIES.has(explicitPolicy)) {
    return { eligible: false, policy: explicitPolicy, reason: "unknown-policy" };
  }
  const implicitFederatedRoute = document.retrieval === "official-federated-search"
    || document.delivery === "federated-discovery";
  if (!explicitPolicy && !implicitFederatedRoute) {
    return { eligible: false, policy: "route-only", reason: "missing-policy" };
  }
  const policy = evidencePolicyFor(document);
  if (document._answerEvidenceEligible === false) {
    return { eligible: false, policy, reason: "explicitly-disabled" };
  }
  if (policy === "route-only") {
    return { eligible: false, policy, reason: "route-only" };
  }
  if (policy === "timestamped") {
    if (document._answerEvidenceEligible !== true) {
      return { eligible: false, policy, reason: "adapter-not-validated" };
    }
    const observedAt = strictTimestamp(document._evidenceObservedAt);
    const maxAgeMs = boundedPositiveDuration(document.freshness?.maxAgeMs);
    if (observedAt === null || maxAgeMs === null) {
      return { eligible: false, policy, reason: "invalid-observation-time" };
    }
    if (observedAt > now + futureSkewMs || now - observedAt > maxAgeMs) {
      return { eligible: false, policy, reason: "stale-or-future-observation" };
    }
    const validFromText = clean(document._evidenceValidFrom);
    const validUntilText = clean(document._evidenceValidUntil);
    const validFrom = validFromText ? strictTimestamp(validFromText) : null;
    const validUntil = validUntilText ? strictTimestamp(validUntilText) : null;
    if ((validFromText && validFrom === null) || (validUntilText && validUntil === null)) {
      return { eligible: false, policy, reason: "invalid-validity-window" };
    }
    if ((validFrom !== null && now + futureSkewMs < validFrom)
      || (validUntil !== null && now - futureSkewMs > validUntil)
      || (validFrom !== null && validUntil !== null && validUntil < validFrom)) {
      return { eligible: false, policy, reason: "outside-validity-window" };
    }
    return { eligible: true, policy, reason: "fresh-observation" };
  }
  if (policy === "versioned") {
    if (document._answerEvidenceEligible !== true) {
      return { eligible: false, policy, reason: "adapter-not-validated" };
    }
    const version = clean(document._evidenceVersion);
    if (version && version.length <= 120) {
      if (document.retrieval === "approved-page-hydration"
        || document.freshness?.requiresSourceTimestamp === true) {
        const statusAt = strictTimestamp(document._evidenceStatusAt);
        const maxAgeMs = boundedPositiveDuration(document.freshness?.maxAgeMs);
        if (statusAt === null || maxAgeMs === null) {
          return { eligible: false, policy, reason: "invalid-version-status-time" };
        }
        if (statusAt > now + futureSkewMs || now - statusAt > maxAgeMs) {
          return { eligible: false, policy, reason: "stale-or-future-version" };
        }
      }
      return { eligible: true, policy, reason: "explicit-version" };
    }
    const statusAt = strictTimestamp(document._evidenceStatusAt);
    const maxAgeMs = boundedPositiveDuration(document.freshness?.maxAgeMs);
    if (statusAt === null || maxAgeMs === null) {
      return { eligible: false, policy, reason: "invalid-status-time" };
    }
    if (statusAt > now + futureSkewMs || now - statusAt > maxAgeMs) {
      return { eligible: false, policy, reason: "stale-or-future-status" };
    }
    return { eligible: true, policy, reason: "fresh-status" };
  }
  const requiredFreshness = requiredClaimFreshness(document, { now, futureSkewMs });
  if (requiredFreshness) return { ...requiredFreshness, policy };
  if (policy === "claim-specific" && document._answerEvidenceEligible !== true) {
    return { eligible: false, policy, reason: "adapter-not-validated" };
  }
  return { eligible: true, policy, reason: "claim-specific" };
}

export function sourceCanSupportPublicCitation(document = {}, options = {}) {
  const evidence = sourceEvidenceEligibility(document, options);
  if (!evidence.eligible) return evidence;
  const citation = officialCitationUrlEligibility(document.url);
  return citation.eligible
    ? evidence
    : { ...evidence, eligible: false, reason: citation.reason };
}

export function officialSourceProfile(document = {}, options = {}) {
  const routeClasses = routeClassesFor(document);
  const delivery = sourceDelivery(document);
  const evidencePolicy = evidencePolicyFor(document);
  const freshness = freshnessFor(document, delivery);
  return Object.freeze({
    id: clean(document.id),
    canonicalUrl: clean(document.url),
    publisher: clean(document.organization),
    sourceTier: clean(document.sourceTier || "official"),
    delivery,
    routeClasses: Object.freeze([...routeClasses]),
    evidencePolicy,
    evidenceEligible: sourceEvidenceEligibility(document, options).eligible,
    freshness,
    freshnessClass: freshness.class,
    checkedAt: "2026-08-19",
  });
}

export function withOfficialSourceProfile(document = {}, options = {}) {
  const profile = officialSourceProfile(document, options);
  return {
    ...document,
    sourceProfile: profile,
    routeClasses: [...profile.routeClasses],
    delivery: profile.delivery,
    evidencePolicy: profile.evidencePolicy,
    freshness: profile.freshness,
    _answerEvidenceEligible: profile.evidenceEligible,
    checkedAt: profile.checkedAt,
  };
}

export function buildOfficialSourceRegistry(documents = []) {
  const registry = documents.map(officialSourceProfile);
  const ids = new Set();
  const urls = new Set();
  for (const source of registry) {
    if (!source.id || ids.has(source.id)) throw new Error(`Duplicate or missing official source id: ${source.id}`);
    if (!source.canonicalUrl || urls.has(source.canonicalUrl)) {
      // Multiple intent-specific records may deliberately share one public
      // service URL, so only IDs are uniqueness keys in the registry.
      if (!source.canonicalUrl) throw new Error(`Missing official source URL: ${source.id}`);
    }
    ids.add(source.id);
    urls.add(source.canonicalUrl);
  }
  return Object.freeze(registry);
}

export function sourceSupportsRouteClass(document, routeClass) {
  return Array.isArray(document?.routeClasses)
    ? document.routeClasses.includes(routeClass)
    : officialSourceProfile(document).routeClasses.includes(routeClass);
}
