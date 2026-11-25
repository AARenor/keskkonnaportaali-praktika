import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildEvidencePack } from "../server/evidence-pack.mjs";
import { validateGroundedAnswer } from "../server/llm_answer_validation.mjs";

const QUERY_MARKER = "Qz";
const EVIDENCE_MARKER = "Ev";
const DRAFT_MARKER = "Dx";
const PROPOSED_MARKER = "Px";
const SOURCE_MARKER = "Sz";
const QUERY = `Mis on mets ja puu? ${QUERY_MARKER}`;
const EVIDENCE_TEXT = `Mets on eluskõlvus majandatav ala. ${EVIDENCE_MARKER}.`;
const DRAFT_INTRO = `Mets on eluskõlvus majandatav ala. ${DRAFT_MARKER}.`;
const PROPOSED_INTRO = `Mets on eluskõlvus majandatav ala. ${PROPOSED_MARKER}.`;
const CHECK = "answer-does-not-answer-the-requested-intent";
const MISSING_ROOTS = "missing roots: puu";
const FORBIDDEN_KEYS = new Set([
  "query", "evidence", "proposed", "draft", "draftIntro", "shadowAnswer", "sources",
  "message", "claim", "source", "content", "title", "text", "rejectedText", "evidenceText",
]);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertNoRawFields(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoRawFields);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(FORBIDDEN_KEYS.has(key), false, `raw trace field ${key} must not be emitted`);
    assertNoRawFields(child);
  }
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("review trace emits only redacted shapes for a real validation failure", () => {
  const source = {
    id: "review-trace-fixture",
    citation: 1,
    title: `Metsa mõiste ${SOURCE_MARKER}`,
    url: "https://keskkonnaamet.ee/mets",
    content: EVIDENCE_TEXT,
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
  };
  const draft = {
    answer: {
      title: "Metsa mõiste",
      intro: DRAFT_INTRO,
      introCitations: [1],
      parts: [],
      note: "",
    },
    sources: [source],
  };
  const payload = { intro: PROPOSED_INTRO, intro_citations: [1], parts: [] };
  const evidencePack = buildEvidencePack({ sources: [source], query: QUERY });
  const evidenceContent = evidencePack.entries[0].content;
  assert.equal(evidenceContent.includes(EVIDENCE_MARKER), true);
  const previousTrace = process.env.REVIEW_TRACE;
  const previousOrigin = process.env.PUBLIC_ORIGIN;
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  process.env.REVIEW_TRACE = "local";
  process.env.PUBLIC_ORIGIN = "http://127.0.0.1:3000";
  try {
    const result = validateGroundedAnswer(payload, draft, QUERY, evidencePack);
    assert.equal(result.answer, null);
    assert.deepEqual(result.acceptedClaims, []);
    assert.equal(result.rejectionReason, "local-rejected");
    assert.match(result.rejectionDetail, /does not answer the requested intent/u);
    assert.match(result.rejectionDetail, /missing roots: puu/u);

    assert.equal(warnings.length, 1);
    const line = String(warnings[0][0]);
    const trace = JSON.parse(line);
    for (const marker of [QUERY_MARKER, EVIDENCE_MARKER, DRAFT_MARKER, PROPOSED_MARKER, SOURCE_MARKER]) {
      assert.equal(line.includes(marker), false, `${marker} must not appear in the trace`);
    }
    assertNoRawFields(trace);

    assert.equal(trace.event, "review-trace");
    assert.equal(trace.queryChars, QUERY.length);
    assert.equal(trace.querySha256, sha256(QUERY));
    assert.equal(trace.proposedChars, PROPOSED_INTRO.length);
    assert.equal(trace.proposedSha256, sha256(PROPOSED_INTRO));
    assert.equal(trace.proposedIntroChars, PROPOSED_INTRO.length);
    assert.equal(trace.proposedPartCount, 0);
    assert.equal(trace.draftChars, DRAFT_INTRO.length);
    assert.equal(trace.draftSha256, sha256(DRAFT_INTRO));
    assert.equal(trace.draftIntroChars, DRAFT_INTRO.length);
    assert.equal(trace.draftPartCount, 0);
    assert.equal(trace.sourceCount, 1);
    assert.equal(trace.evidenceChars, evidenceContent.length);
    assert.equal(trace.evidenceSha256, sha256(evidenceContent));
    assert.equal(trace.evidenceEntryCount, 1);
    assert.equal(trace.shadowPasses, true);
    assert.equal(trace.shadowHitCount, 1);
    assert.equal(trace.stepCount, 2);
    assert.equal(trace.shadowAnswerChars, PROPOSED_INTRO.length);
    assert.equal(trace.shadowAnswerSha256, sha256(PROPOSED_INTRO));
    assert.equal(trace.shadowAnswerIntroChars, PROPOSED_INTRO.length);
    assert.equal(trace.shadowAnswerPartCount, 0);
    assert.equal(Object.hasOwn(trace, "introFailureCheck"), false);
    assert.deepEqual(trace.steps.map((step) => step.check), [CHECK, CHECK]);
    assert.deepEqual(trace.steps.map((step) => step.skipped), [false, true]);
    for (const step of trace.steps) {
      assert.equal(step.claimChars, MISSING_ROOTS.length);
      assert.equal(step.claimSha256, sha256(MISSING_ROOTS));
      assert.equal(step.sourceChars, 0);
      assert.equal(step.sourceSha256, sha256(""));
    }
  } finally {
    console.warn = previousWarn;
    restoreEnv("REVIEW_TRACE", previousTrace);
    restoreEnv("PUBLIC_ORIGIN", previousOrigin);
  }
});
