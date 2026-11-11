import { officialCitationUrlEligibility } from "./citation-policy.mjs";
import { sourceResourceKey } from "./source-identity.mjs";
import {
  extractSourceText,
  projectSourceText,
  sourcePolicyBinding,
  sourcePolicyWitness,
} from "./source_policy.mjs";

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
    "climate-station-daily-mean", "groundwater-overview",
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
    "groundwater-overview", "groundwater-status", "marine-strategy-status", "bathing-water-quality",
    "groundwater-pesticide-monitoring", "wildlife-status-2025", "electric-vehicle-lifecycle",
    "baltic-sea-litter", "ida-viru-groundwater",
    "statistics-water-abstraction-2024", "statistics-wastewater-bht7-2024", "statistics-hazardous-waste-2024",
    "statistics-total-waste-recovery",
    "forest-area", "forest-stock-stable", "forest-condition-review", "protected-forest-share",
    "forest-smi-2024-summary", "forest-smi-2025-presentation", "forest-yearbook-2023-fellings",
    "forest-climate-adaptation-report", "increment-method", "clearcut-over-time",
    "forest-smi-2025-tables", "rmk-managed-forest-area", "moose-population-2025", "forest-fires-2025",
    "forest-regeneration-2025-availability", "nature-protection-share-2025",
    "bark-beetle-monitoring-2026", "wood-balance-overview", "forest-yearbook-overview", "lulucf-definition",
  ]),
  official_guidance: new Set([
    "waste-burning-guidance", "protected-nature-guidance", "mining-impact-guidance",
    "mined-land-restoration", "wastewater-local-treatment", "baltic-sea-litter",
    "hazardous-waste-asbestos", "river-dams-fish", "green-network-planning-guide",
    "invasive-species-guidance", "organizational-footprint", "wetland-restoration",
    "solar-panel-end-of-life", "protected-area-construction", "wind-farm-assessment-guide",
    "forest-notice-guidance", "forest-register-workflow", "forest-rmk-data-methods",
    "bird-hunting-season-2026", "bark-beetle-guidance",
    "water-monitoring", "protected-nature-guidance", "metsainfo-hetkeseis",
  ]),
  official_legal_context: new Set([
    "environmental-permits", "protected-area-construction", "forest-notice-guidance",
    "forest-register-workflow", "forest-law", "nature-conservation-law", "environmental-assessment",
    "forest-management-rules",
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
    "forest-smi-2025-tables", "rmk-managed-forest-area", "forest-management-rules",
    "moose-population-2025", "bird-hunting-season-2026", "bark-beetle-guidance",
    "forest-fires-2025", "forest-regeneration-2025-availability",
    "bark-beetle-monitoring-2026", "wood-balance-overview", "forest-yearbook-overview", "lulucf-definition",
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
  "forest-smi-2025-tables", "forest-fires-2025",
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
    const version = typeof document._evidenceVersion === "string" ? clean(document._evidenceVersion) : "";
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
  if (basis === "service-status-at") {
    const statusAt = strictTimestamp(document._evidenceStatusAt);
    const maxAgeMs = boundedPositiveDuration(freshness.maxAgeMs);
    if (statusAt === null || maxAgeMs === null) return { eligible: false, reason: "invalid-service-status-time" };
    return statusAt > now + futureSkewMs || now - statusAt > maxAgeMs
      ? { eligible: false, reason: "stale-or-future-service-status" }
      : { eligible: true, reason: "fresh-service-status" };
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
    const version = typeof document._evidenceVersion === "string" ? clean(document._evidenceVersion) : "";
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
    return { eligible: false, policy, reason: "missing-or-invalid-version" };
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
  const evidenceCheckedAtMs = strictTimestamp(clean(document._evidenceStatusAt))
    ?? strictTimestamp(clean(document._catalogueReviewedAt));
  const checkedAt = evidenceCheckedAtMs === null
    ? null
    : new Date(evidenceCheckedAtMs).toISOString().slice(0, 10);
  return Object.freeze({
    id: clean(document.id),
    canonicalUrl: clean(document.url),
    resourceKey: sourceResourceKey(document.url),
    publisher: clean(document.organization),
    sourceTier: clean(document.sourceTier || "official"),
    delivery,
    routeClasses: Object.freeze([...routeClasses]),
    evidencePolicy,
    evidenceEligible: sourceEvidenceEligibility(document, options).eligible,
    freshness,
    freshnessClass: freshness.class,
    checkedAt,
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

// Copied text that this application may hand to a model for one source. The
// public listing, the model evidence pack and the retained answer cache share
// this bound so one publisher result cannot spend it three times.
export const SOURCE_EVIDENCE_COPY_CHARS = 4_000;
// The largest body this layer keeps while it selects relevant passages. Corpus
// stores at most this much per page, so selection can reach the end of the body
// and the delivery budgets below still decide what leaves the layer.
export const SOURCE_EVIDENCE_BODY_CHARS = 15_000;

const FETCHED_CONTENT_KINDS = new Set(["fetched-html", "fetched-pdf"]);
// Producers whose copied text is a body read from a publisher page. A record
// from one of these without a policy observation is a legacy body: it stays
// navigable, but nothing may be quoted from it.
const FETCHED_PRODUCERS = new Set([
  "approved-page-hydration",
  "approved-pdf-hydration",
  "official-federated-search",
  "live-discovery",
]);
const COPY_FIELD_ORDER = Object.freeze({
  snippet: Object.freeze(["summary", "excerpt", "evidenceExcerpt", "content"]),
  evidence: Object.freeze(["summary", "excerpt", "content", "answer", "evidenceExcerpt"]),
  cache: Object.freeze(["summary", "evidenceExcerpt"]),
});
// Below this many spare characters a copied field would be a sentence fragment.
const MIN_COPY_FRAGMENT = 24;

function boundedCopyText(value, limit) {
  if (!Number.isInteger(limit) || limit <= 0) return "";
  // The publisher limit is a limit on the characters a reader sees, so the text
  // is normalized before it is measured: one ligature and one combining
  // sequence are single code points that expand when they are normalized, and a
  // count taken before that normalization is not the count that is published.
  const normalized = String(value ?? "").normalize("NFKC");
  if (normalized.length <= limit) return normalized;
  const cut = (text) => {
    const sliced = text.slice(0, limit);
    // Never end on half a surrogate pair: that is not a character.
    return /[\uD800-\uDBFF]$/u.test(sliced) ? sliced.slice(0, -1) : sliced;
  };
  const bounded = cut(normalized).trim();
  const renormalized = bounded.normalize("NFKC");
  return (renormalized.length <= limit ? renormalized : cut(renormalized).trim());
}

/**
 * The policy witness a delivered record actually carries. The record's own
 * `_sourcePolicy` is rehashed with `sourcePolicyBinding`, so a witness edited
 * after observation cannot agree with the binding that was published with it,
 * and the observed body hash must be the body this record holds.
 */
export function sourceCopyWitness(document = {}) {
  const candidate = document?._sourcePolicy ?? document?.metadata?.source_policy ?? null;
  const declared = typeof document?._sourcePolicyBinding === "string"
    && document._sourcePolicyBinding !== ""
    ? document._sourcePolicyBinding
    : null;
  const witness = sourcePolicyWitness(candidate);
  if (!witness) {
    return {
      policy: null,
      binding: null,
      reason: candidate ? "source-policy-invalid" : "source-policy-missing",
    };
  }
  const binding = sourcePolicyBinding(witness);
  if (!binding) return { policy: null, binding: null, reason: "source-policy-invalid" };
  if (declared !== null && declared !== binding) {
    return { policy: null, binding: null, reason: "source-policy-mismatch" };
  }
  // A publisher body is bound to the bytes the policy was observed on. Only a
  // producer that publishes the extracted-body digest can be checked here; a
  // record whose digest names another derivation is refused rather than
  // trusted, and a record that publishes no body digest is left to the resource
  // and binding checks above.
  const bodyHash = typeof document?._contentHash === "string" ? document._contentHash : "";
  const artifactHash = typeof witness.artifactHash === "string" && witness.artifactHash !== ""
    ? witness.artifactHash
    : null;
  if (bodyHash && artifactHash && bodyHash !== artifactHash) {
    return { policy: null, binding: null, reason: "source-policy-body-mismatch" };
  }
  return { policy: witness, binding, reason: null };
}

function declaredSourceWitness(document = {}) {
  return sourcePolicyWitness(document?._sourcePolicy ?? document?.metadata?.source_policy ?? null);
}

// Whether this record's copied text is a publisher page body rather than text
// this application wrote, reviewed or read from a validated typed adapter. A
// record only counts as a stored publisher body when it claims one: a federated
// discovery card is a publisher blurb, and a retained body publishes the digest
// of the bytes that were kept. `strict` is for a retained copy, where a body
// from a publisher is not replayed at all unless the observation that released
// it travelled with it.
export function sourceCopyDerivedFromPublisher(document = {}, { strict = false } = {}) {
  const witness = declaredSourceWitness(document);
  if (witness) return FETCHED_CONTENT_KINDS.has(witness.contentKind);
  const retrieval = clean(document.retrieval);
  if (retrieval === "official-federated-search" || retrieval === "live-discovery") return true;
  if (!FETCHED_PRODUCERS.has(retrieval)) return false;
  if (strict) return true;
  return typeof document._contentHash === "string" && document._contentHash !== "";
}

/**
 * The publisher decision for one copied-text purpose. A witness that does not
 * verify, a different resource, an expired observation, and a withheld use flag
 * all answer `permitted: false`; the link metadata is never part of this call.
 * A record that was never a publisher copy keeps the provenance it already has.
 */
export function sourceCopyPermission(document = {}, {
  purpose = "snippet",
  now = Date.now(),
  limit,
  strict = false,
} = {}) {
  if (!Object.hasOwn(COPY_FIELD_ORDER, purpose)) {
    throw new TypeError(`Unknown copied text purpose: ${String(purpose)}`);
  }
  const { policy, binding, reason } = sourceCopyWitness(document);
  if (!policy) {
    return reason === "source-policy-missing" && !sourceCopyDerivedFromPublisher(document, { strict })
      ? { permitted: true, scope: "unfetched", reason: null, limit: null, binding: null, policy: null }
      : { permitted: false, scope: "policy", reason, limit: 0, binding: null, policy: null };
  }
  const projection = projectSourceText(
    { url: document.url, _sourcePolicy: policy },
    { purpose, now, limit },
  );
  return {
    permitted: projection.permitted,
    scope: "policy",
    reason: projection.reason,
    limit: projection.textLimit,
    binding,
    policy,
  };
}

/**
 * The copied fields this application may publish for one purpose, capped as a
 * total. A publisher `max-snippet` is one budget for the whole result, so the
 * fields share it instead of each spending it separately, and no field here can
 * carry text beyond that limit.
 *
 * `selector(text, characters)` is how a caller ranks passages when the
 * permitted field is longer than its budget. The delivery gate still owns the
 * budget: whatever the selector returns is measured and cut again here, so a
 * selector can change which characters are copied, never how many.
 */
export function projectSourceCopy(document = {}, {
  purpose = "snippet",
  now = Date.now(),
  limit,
  strict = false,
  selector = null,
} = {}) {
  const permission = sourceCopyPermission(document, { purpose, now, limit, strict });
  const fields = {};
  let chars = 0;
  if (permission.permitted) {
    const order = COPY_FIELD_ORDER[purpose];
    if (permission.scope === "unfetched") {
      // No publisher observation exists for this record, so this gate adds no
      // new permission and removes none: the reviewed text travels unchanged.
      for (const field of order) {
        const text = String(document?.[field] ?? "").trim();
        if (!text) continue;
        fields[field] = text;
        chars += text.length;
      }
    } else {
      const rank = purpose === "evidence" && typeof selector === "function" ? selector : null;
      let remaining = Number.isInteger(permission.limit) ? permission.limit : 0;
      if (Number.isInteger(limit) && limit > 0) remaining = Math.min(remaining, limit);
      for (const field of order) {
        if (remaining <= 0) break;
        const fieldBudget = Math.min(remaining, permission.limit);
        if (fieldBudget <= 0) continue;
        // A few spare characters are a fragment of a sentence, not a passage.
        if (chars > 0 && fieldBudget < MIN_COPY_FRAGMENT) continue;
        const text = extractSourceText(document?.[field]);
        if (!text) continue;
        // A field the publisher limited has to name the characters it keeps,
        // because a prefix is rarely the passage that answers the question.
        const bounded = rank && text.normalize("NFKC").length > fieldBudget
          ? boundedCopyText(rank(text, fieldBudget), fieldBudget)
          : boundedCopyText(text, fieldBudget);
        if (!bounded) continue;
        fields[field] = bounded;
        remaining -= bounded.length;
        chars += bounded.length;
      }
    }
  }
  return Object.freeze({
    ...permission,
    fields: Object.freeze(fields),
    chars,
  });
}

/**
 * The copied fields a saved answer may keep for one source. A cache entry is a
 * retained copy, so retention has to be permitted as well as publication, and
 * the two fields it keeps come out of the one snippet budget above.
 */
export function projectSourceCacheCopy(document = {}, { now = Date.now(), limit = SOURCE_EVIDENCE_COPY_CHARS } = {}) {
  // A saved answer is a retained copy, so the strict rule applies: text from a
  // publisher page is not replayed unless the observation that released it is
  // still on the record.
  const copy = projectSourceCopy(document, { purpose: "snippet", now, limit, strict: true });
  if (!copy.permitted) return copy;
  const reasons = ["cache", "evidence"]
    .map((purpose) => sourceCopyPermission(document, { purpose, now, limit, strict: true }))
    .find((permission) => !permission.permitted);
  if (reasons) {
    return Object.freeze({ ...copy, permitted: false, reason: reasons.reason, fields: Object.freeze({}), chars: 0 });
  }
  const fields = {};
  let chars = 0;
  for (const field of COPY_FIELD_ORDER.cache) {
    const text = copy.fields[field];
    if (!text) continue;
    fields[field] = text;
    chars += text.length;
  }
  return Object.freeze({ ...copy, fields: Object.freeze(fields), chars });
}
