import assert from "node:assert/strict";
import test from "node:test";
import { isLenientOfficialEvidenceRow } from "../server/corpus_runtime.mjs";
import { isLenientVportalEvidence } from "../server/integrations.mjs";
import { acceptsIntroLead } from "../server/llm_answer_validation.mjs";

const CONTENT_HASH = "a".repeat(64);

test("a fresh official page of 400+ chars becomes evidence only in lenient mode", () => {
  const base = {
    lenient: true,
    federated: true,
    sourceTier: "official",
    policyApplies: true,
    copiedLength: 500,
    contentHash: CONTENT_HASH,
  };
  assert.equal(isLenientOfficialEvidenceRow(base), true);
  assert.equal(isLenientOfficialEvidenceRow({ ...base, lenient: false }), false);
  assert.equal(isLenientOfficialEvidenceRow({ ...base, copiedLength: 399 }), false);
  assert.equal(isLenientOfficialEvidenceRow({ ...base, sourceTier: "unofficial" }), false);
  assert.equal(isLenientOfficialEvidenceRow({ ...base, policyApplies: false }), false);
  assert.equal(isLenientOfficialEvidenceRow({ ...base, federated: false }), false);
  assert.equal(isLenientOfficialEvidenceRow({ ...base, contentHash: "short" }), false);
});

test("a reviewed route-only card never becomes answer evidence", () => {
  const base = {
    lenient: true,
    federated: true,
    sourceTier: "official",
    policyApplies: true,
    copiedLength: 500,
    contentHash: CONTENT_HASH,
  };
  assert.equal(isLenientOfficialEvidenceRow({ ...base, reviewedPolicy: "route-only" }), false);
  assert.equal(isLenientOfficialEvidenceRow({ ...base, reviewedPolicy: "versioned" }), true);
});

test("the portal search producer needs the switch and a 400-char body", () => {
  assert.equal(isLenientVportalEvidence({ lenient: true, contentLength: 400 }), true);
  assert.equal(isLenientVportalEvidence({ lenient: true, contentLength: 399 }), false);
  assert.equal(isLenientVportalEvidence({ lenient: false, contentLength: 400 }), false);
  assert.equal(isLenientVportalEvidence({ lenient: true, contentLength: "420" }), true);
  assert.equal(isLenientVportalEvidence(), false);
});

test("the direct current source keeps the lead unless lenient mode accepts a grounded alternative", () => {
  const direct = [1];
  assert.equal(acceptsIntroLead({
    proposedIntroChanged: true, directDraftCitations: direct, introCitations: [2],
  }), false);
  assert.equal(acceptsIntroLead({
    lenient: true, proposedIntroChanged: true, directDraftCitations: direct, introCitations: [2],
  }), true);
  assert.equal(acceptsIntroLead({
    proposedIntroChanged: true, directDraftCitations: direct, introCitations: [1],
  }), true);
  assert.equal(acceptsIntroLead({
    proposedIntroChanged: false, directDraftCitations: direct, introCitations: [2],
  }), true);
  assert.equal(acceptsIntroLead({
    proposedIntroChanged: true, directDraftCitations: [], introCitations: [2],
  }), true);
  assert.equal(acceptsIntroLead({
    proposedIntroChanged: true, directDraftCitations: direct, introCitations: [], citesLawSection: true,
  }), true);
});
