import { createHash } from "node:crypto";
import { splitTextPassages } from "./search.mjs";
import { isEvidencePack } from "./evidence-pack.mjs";

const acceptedClaimRecords = new WeakSet();
const deterministicCacheValues = new WeakMap();

// Only the in-process delivery owner can associate the pre-provider snapshot
// with a cache decision. Serialized/replayed outcomes have no such authority.
export function deterministicCacheValue(outcome, query) {
  const owned = deterministicCacheValues.get(outcome);
  return owned?.query === query ? owned.value : null;
}

const REASONS = new Set(["none", "not-applicable", "disabled", "capacity", "budget", "timeout", "provider-error", "invalid-output", "local-rejected", "no-new-contribution", "visible-rejected", "evidence-insufficient"]);

function propositionText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("et")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function claimTextHash(text) {
  return createHash("sha256").update(propositionText(text)).digest("hex");
}

export function acceptedClaim(text, citations, evidencePack) {
  if (!isEvidencePack(evidencePack)) return null;
  const sourceBindings = [...new Set(citations)].map((citation) => evidencePack.bindings[citation]);
  if (!sourceBindings.length || sourceBindings.some((binding) => !binding?.witnessKey || !binding.version || !binding.snapshotHash)) return null;
  const claim = Object.freeze({
    textHash: claimTextHash(text),
    sourceBindings: Object.freeze(sourceBindings.slice(0, 10).map((binding) => Object.freeze({ ...binding }))),
  });
  acceptedClaimRecords.add(claim);
  return claim;
}

function answerFields(answer) {
  return [
    ...(answer?.intro ? [{ text: answer.intro, citations: answer.introCitations || [] }] : []),
    ...(answer?.parts || []).map((part) => ({ text: part.text, citations: part.citations || [] })),
  ];
}

function repeatsBaseline(text, baselineFields) {
  const candidate = propositionText(text);
  if (!candidate) return true;
  const baseline = baselineFields.flatMap((field) => splitTextPassages(field.text))
    .map(propositionText).filter(Boolean);
  const reachable = new Set([0]);
  for (const start of reachable) {
    for (const passage of baseline) {
      if (!candidate.startsWith(passage, start)) continue;
      const end = start + passage.length;
      if (end === candidate.length) return true;
      if (candidate[end] === " ") reachable.add(end + 1);
    }
  }
  return false;
}

export function deliveredOutcome({ publishedResponse, deterministicResponse, deterministicCacheValue: cacheValue, acceptedClaims = [], attempt, evidenceKind, cacheEligible = false, publishedBindings = {} }) {
  const privateAttempt = attempt ? {
    provider: String(attempt.provider || "deterministic-current-evidence").slice(0, 160),
    status: String(attempt.status || "degraded").slice(0, 40),
    reason: REASONS.has(attempt.reason) ? attempt.reason : "provider-error",
  } : undefined;
  const baselineFields = answerFields(deterministicResponse?.answer);
  const acceptedSurvivors = answerFields(publishedResponse?.answer).filter((field) => {
    const hash = claimTextHash(field.text);
    const bindings = field.citations.map((citation) => publishedBindings[citation]);
    return bindings.length > 0 && bindings.every(Boolean) && acceptedClaims.some((claim) => (
      acceptedClaimRecords.has(claim)
      && claim.textHash === hash
      && bindings.every((published) => claim.sourceBindings.some((binding) => (
        published.witnessKey === binding.witnessKey && published.version === binding.version
        && published.snapshotHash === binding.snapshotHash
      )))
    ));
  });
  const contribution = privateAttempt?.status === "ready"
    && privateAttempt.provider !== "deterministic-current-evidence"
    && acceptedSurvivors.some((field) => !repeatsBaseline(field.text, baselineFields));
  const attempted = privateAttempt && privateAttempt.reason !== "not-applicable";
  const answerProvider = contribution ? privateAttempt?.provider || "deterministic-current-evidence" : "deterministic-current-evidence";
  const answerStatus = contribution ? "ready" : attempted ? "degraded" : "not-applicable";
  if (privateAttempt && !contribution && privateAttempt.reason === "none") {
    privateAttempt.reason = acceptedSurvivors.length || !acceptedClaims.length
      ? "no-new-contribution" : "visible-rejected";
  }
  const response = {
    ...publishedResponse,
    answer: publishedResponse.answer ? {
      ...publishedResponse.answer,
      eyebrow: contribution ? "AI koondvastus"
        : publishedResponse.answer.eyebrow === "AI koondvastus" ? "Allikapõhine kokkuvõte" : publishedResponse.answer.eyebrow,
    } : publishedResponse.answer,
  };
  const outcome = { response, answerProvider, answerStatus, cacheResponse: !contribution && Boolean(cacheEligible), ...(privateAttempt ? { attempt: privateAttempt } : {}) };
  if (outcome.cacheResponse && cacheValue && typeof cacheValue === "object") {
    deterministicCacheValues.set(outcome, { value: cacheValue, query: cacheValue.query });
  }
  return outcome;
}
