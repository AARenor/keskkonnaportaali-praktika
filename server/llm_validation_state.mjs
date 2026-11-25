import { createHash } from "node:crypto";

export const reviewTraceState = {
  shadowSkippedChecks: null,
  shadowTraceIntro: null,
};

export const SHADOW_CHECK_PATTERN = /(?:does-not-answer-the-requested-intent|has-an-unbound-factual-negation|reverses-the-polarity-of-cited-evidence|has-an-unbound-semantic-clause)$/u;

export const MAX_REVIEW_TRACE_HITS = 16;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function reviewTextShape(value) {
  const text = String(value ?? "");
  return { chars: text.length, sha256: sha256(text) };
}

export function reviewAnswerShape(answer) {
  const intro = String(answer?.intro ?? "");
  const parts = Array.isArray(answer?.parts) ? answer.parts : [];
  const text = [intro, ...parts.map((part) => String(part?.text ?? ""))].filter(Boolean).join(" ¶ ");
  return { ...reviewTextShape(text), introChars: intro.length, partCount: parts.length };
}

export function reviewEvidenceShape(pack) {
  const entries = Array.isArray(pack?.entries) ? pack.entries : [];
  const text = entries.map((entry) => String(entry?.content ?? "")).join("\n");
  return { ...reviewTextShape(text), entryCount: entries.length };
}

export function reviewRejectionShape(check, error, skipped = false) {
  const claim = error?.rejectedTextShape || reviewTextShape(error?.rejectedText);
  const source = error?.evidenceTextShape || reviewTextShape(error?.evidenceText);
  return {
    check,
    skipped,
    claimChars: claim.chars,
    claimSha256: claim.sha256,
    sourceChars: source.chars,
    sourceSha256: source.sha256,
  };
}
