import { createHash } from "node:crypto";
import { officialCitationUrlEligibility, publicSourceAllowed } from "./citation-policy.mjs";
import { publicSourceWitnessKey, sourceIsLinkedToVisibleService, sourceResourceKey, sourceWitnessKey } from "./source-identity.mjs";
import { sourceCanSupportPublicCitation } from "./source-registry.mjs";
import { resultMatchesFilters } from "./retrieval_listing.mjs";

function stableRevisionValue(value) {
  if (Array.isArray(value)) return value.map(stableRevisionValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      stableRevisionValue(value[key]),
    ]));
  }
  if (value === undefined || value === null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  return String(value);
}

export function searchListingRevision(listing = {}) {
  if (typeof listing?.queryRevision === "string" && listing.queryRevision.trim()) {
    return listing.queryRevision.trim();
  }
  if (typeof listing?.windowId === "string" && listing.windowId.trim()) return listing.windowId.trim();
  const records = (listing.items || []).map((item) => {
    const currentEvidence = sourceCanSupportPublicCitation(item);
    return stableRevisionValue({
      id: item.id,
      resourceKey: sourceResourceKey(item.url),
      witnessKey: sourceWitnessKey(item),
      title: item.title,
      organization: item.organization,
      type: item.type,
      summary: item.summary,
      answer: item.answer,
      content: item._contentHash || item.content,
      locator: item.locator,
      actionUrl: item.actionUrl ? sourceResourceKey(item.actionUrl) : null,
      actionLabel: item.actionLabel,
      published: item.published,
      updated: item.updated,
      dataYear: item.dataYear,
      dataAsOf: item.dataAsOf,
      publishedAt: item._publishedAt,
      sourceTier: item.sourceTier,
      routeClasses: item.routeClasses,
      topics: item.topics,
      tags: item.tags,
      retrieval: item.retrieval,
      delivery: item.delivery,
      evidencePolicy: item.evidencePolicy,
      answerEvidenceEligible: item._answerEvidenceEligible,
      evidenceVersion: item._evidenceVersion,
      evidenceStatusAt: item._evidenceStatusAt,
      evidenceObservedAt: item._evidenceObservedAt,
      evidenceValidFrom: item._evidenceValidFrom,
      evidenceValidUntil: item._evidenceValidUntil,
      freshness: item.freshness,
      currentEvidence: {
        eligible: currentEvidence.eligible,
        policy: currentEvidence.policy,
        reason: currentEvidence.reason,
      },
    });
  });
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

export function cachedSourcesBelongToListing(cached, listing, filters = listing?.appliedFilters || {}) {
  const sources = Array.isArray(cached?.sources) ? cached.sources : [];
  if (sources.some((source) => (
    !publicSourceAllowed(source)
    || !officialCitationUrlEligibility(source?.url).eligible
    || (source?.actionUrl !== undefined
      && (!publicSourceAllowed({ url: source.actionUrl })
        || !officialCitationUrlEligibility(source.actionUrl).eligible))
    || !resultMatchesFilters(source, filters)
  ))) return false;
  if (!listing?.items?.length || !sources.length) return true;
  const witnesses = new Set([
    ...(Array.isArray(listing.evidenceCandidates) ? listing.evidenceCandidates : []),
    ...listing.items,
  ].map(publicSourceWitnessKey).filter(Boolean));
  return sources.every((source) => {
    const key = publicSourceWitnessKey(source);
    return key !== null && witnesses.has(key);
  });
}

export function draftSourcesBelongToListing(draft, listing) {
  if (!draft?.sources?.length) return true;
  const visibleItems = listing?.items || [];
  const answerItems = listing?.evidenceCandidates || visibleItems;
  const witnesses = new Set(answerItems.map(publicSourceWitnessKey).filter(Boolean));
  return draft.sources.every((source) => {
    const key = publicSourceWitnessKey(source);
    return (key !== null && witnesses.has(key)) || sourceIsLinkedToVisibleService(source, visibleItems);
  });
}

export function draftMatchesListingAndFilters(draft, listing, filters = {}) {
  return Boolean(draft)
    && draft.sources.every((source) => resultMatchesFilters(source, filters))
    && (!listing || draftSourcesBelongToListing(draft, listing));
}
