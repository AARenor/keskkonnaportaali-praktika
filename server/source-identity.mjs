import { createHash } from "node:crypto";
import { OFFICIAL_CITATION_ORIGINS, officialCitationUrlEligibility } from "./citation-policy.mjs";

export const SOURCE_IDENTITY_VERSION = "source-identity-v1";
const approvedAliases = new Map();
for (const hostname of [
  "keskkonnaportaal.ee", "keskkonnaagentuur.ee", "keskkonnaamet.ee",
  "kliimaministeerium.ee", "ohuseire.ee", "eea.europa.eu", "foresteurope.org",
  "ilmateenistus.ee", "rescue.ee", "tallinn.ee", "terviseamet.ee",
]) {
  if (OFFICIAL_CITATION_ORIGINS.has(`https://www.${hostname}`)
    && OFFICIAL_CITATION_ORIGINS.has(`https://${hostname}`)) {
    approvedAliases.set(`www.${hostname}`, hostname);
  }
}
const WITNESS_PRODUCERS = new Set([
  "official-service-directory", "approved-page-hydration",
  "official-structured-climate-daily", "official-structured-eelis-wfs",
  "official-structured-eelis-natura", "official-structured-statistics-pxweb",
  "official-structured-weather-xml", "official-structured-forecast-xml",
  "official-structured-hydrology-postgrest", "official-structured-forestry-source",
  "official-tableau-csv", "official-eurostat-json", "official-eurostat-methodology",
  "reviewed-official-eurostat-snapshot",
  "official-structured-cadastre-wfs", "reviewed-official-navigation-procedure",
]);
const visibleServiceBindings = new WeakMap();

// Comparison keys never replace an approved fetch or citation URL.
export function sourceResourceKey(value) {
  try {
    if (typeof value !== "string" || value.length > 2_000 || value !== value.trim()) return null;
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || /[\u0000-\u001f\u007f]/u.test(value)) return null;
    url.hostname = approvedAliases.get(url.hostname) || url.hostname;
    if (url.hostname === "keskkonnaportaal.ee") {
      if (url.pathname === "/et") url.pathname = "/";
      else if (url.pathname.startsWith("/et/")) url.pathname = url.pathname.slice(3);
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid)/iu.test(key)) url.searchParams.delete(key);
    }
    // URLSearchParams.sort is stable: repeated values retain their order.
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function sameSourceResource(leftUrl, rightUrl) {
  const left = sourceResourceKey(leftUrl);
  return left !== null && left === sourceResourceKey(rightUrl);
}

// Display deduplication can compare a safe HTTPS location without granting
// transport, citation or body-validation rights.
export function sourceComparisonWitnessKey(source = {}) {
  const resource = sourceResourceKey(source.url);
  if (!resource) return null;
  const url = new URL(source.url);
  const match = /\.pdf$/iu.test(url.pathname)
    ? url.hash.slice(1).match(/(?:^|[&?])page=(\d{1,5})(?=&|$)/iu)
    : null;
  const page = match && Number(match[1]) > 0 ? Number(match[1]) : null;
  const locator = typeof source.locator === "string" ? source.locator.replace(/\s+/gu, " ").trim() : "";
  if (locator.length > 1_000) return null;
  return page || locator ? JSON.stringify([resource, page, locator || null]) : resource;
}

export function publicSourceWitnessKey(source = {}) {
  return officialCitationUrlEligibility(source.url).eligible ? sourceComparisonWitnessKey(source) : null;
}

export function sourceWitnessKey(source = {}) {
  const key = publicSourceWitnessKey(source);
  if (!key) return null;
  if (key === sourceResourceKey(source.url)) return key;
  const knownProducer = WITNESS_PRODUCERS.has(source.retrieval);
  // Identity is stable; the request's freshness gate separately revokes use.
  if (!knownProducer || source._answerEvidenceEligible !== true
    || !["timestamped", "versioned", "claim-specific"].includes(source.evidencePolicy)) return null;
  return key;
}

export function sourceEvidenceBinding(source) {
  const witnessKey = sourceWitnessKey(source);
  const snapshotHash = createHash("sha256").update(JSON.stringify([
    witnessKey, source.locator || null, source.organization || null,
    source.fetchUrl ?? null, source.citationUrl ?? null,
    source.evidencePolicy, source.retrieval, source._answerEvidenceEligible, source.freshness || null,
    ...["summary", "answer", "content"].map((field) => String(source[field] || "").normalize("NFKC")),
    ...["published", "_publishedAt", "updated", "dataYear", "dataAsOf",
      "_evidenceObservedAt", "_evidenceValidFrom", "_evidenceValidUntil",
      "_evidenceStatusAt", "_catalogueReviewedAt"].map((field) => source[field] ?? null),
  ])).digest("hex");
  const version = String(source._evidenceVersion || source._contentHash || "")
    .normalize("NFKC").replace(/[\u0000-\u001f\u007f]/gu, " ").trim().slice(0, 120);
  // The fallback is this actual snapshot's hash, never an upstream version,
  // physical artifact checksum or fabricated publication date.
  return { witnessKey, version: version || `snapshot-sha256:${snapshotHash}`, snapshotHash };
}

// The adapter/reviewed constructor binds an actual body witness to the
// approved visible service descriptor. A caller-supplied URL/key is no proof.
export function bindSourceToVisibleService(source, service) {
  const serviceKey = publicSourceWitnessKey(service);
  const binding = sourceEvidenceBinding(source);
  if (!serviceKey || !binding.witnessKey || !WITNESS_PRODUCERS.has(source.retrieval)
    || source._answerEvidenceEligible !== true) return source;
  const descriptor = Object.freeze({ id: service.id, witnessKey: serviceKey });
  visibleServiceBindings.set(descriptor, Object.freeze({ ...binding, producer: source.retrieval }));
  return { ...source, _visibleServiceWitness: descriptor };
}

export function sourceIsLinkedToVisibleService(source, visible = []) {
  const descriptor = source._visibleServiceWitness;
  const admitted = descriptor && visibleServiceBindings.get(descriptor);
  if (!admitted || source.retrieval !== admitted.producer) return false;
  const actual = sourceEvidenceBinding(source);
  return actual.witnessKey === admitted.witnessKey && actual.version === admitted.version
    && actual.snapshotHash === admitted.snapshotHash
    && visible.some((service) => service.id === descriptor.id
      && publicSourceWitnessKey(service) === descriptor.witnessKey);
}
