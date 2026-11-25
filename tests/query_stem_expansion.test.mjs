import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnyPrefixTsQuery,
  buildPrefixTsQuery,
  corpusQueryTerms,
} from "../server/corpus_query.mjs";
import {
  assertClaimGrounding,
  groundingValidationContext,
  numericClaimBindingsMatch,
} from "../server/llm_claim_grounding.mjs";

const REVIEWED_DRAFT = { evidence: { kind: "reviewed-forestry-knowledge" } };

function prefixQueryMatches(query, text) {
  const groups = buildPrefixTsQuery(query).split(" & ").map((group) => {
    const variants = group.startsWith("(") ? group.slice(1, -1).split(" | ") : [group];
    return variants.map((variant) => variant.replace(/:\*$/u, ""));
  });
  const tokens = String(text).toLocaleLowerCase("et").match(/[0-9a-zõäöüšž]+/giu) || [];
  return groups.every((variants) => tokens.some((token) => (
    variants.some((variant) => token.startsWith(variant))
  )));
}

function groundingVerdict(evidence, claim) {
  const context = groundingValidationContext({
    entries: [{ citation: 1, content: evidence }],
  });
  try {
    assertClaimGrounding(claim, [1], REVIEWED_DRAFT, "part", "", context);
    return true;
  } catch {
    return false;
  }
}

test("a metsauuendus fixture is queryable from uuendati", () => {
  assert.deepEqual(corpusQueryTerms("uuendati"), ["uuend", "metsauuendu"]);
  assert.equal(buildPrefixTsQuery("uuendati"), "(uuend:* | metsauuendu:*)");
  assert.equal(buildAnyPrefixTsQuery("uuendati"), "(uuend:* | metsauuendu:*)");

  const fixture = "Metsauuendus toimub Keskkonnaameti juhtimisel.";
  assert.equal(prefixQueryMatches("uuendati", fixture), true);
  assert.equal(prefixQueryMatches("metsauuendus", "Uuendati toimub."), true);
  assert.equal(prefixQueryMatches("uuendati", "Metsatulekahju toimub."), false);
});

test("impact and management queries use only their reviewed stems", () => {
  assert.deepEqual(corpusQueryTerms("mõjutab"), ["mõju"]);
  assert.deepEqual(corpusQueryTerms("mõju"), ["mõju"]);
  assert.deepEqual(corpusQueryTerms("majandamine"), ["majand"]);
  assert.deepEqual(corpusQueryTerms("majandatakse"), ["majand"]);
  assert.equal(prefixQueryMatches("mõju", "Mõjutab metsa."), true);
  assert.equal(prefixQueryMatches("majandamine", "Metsa majandatakse."), true);
  assert.equal(prefixQueryMatches("mõjutab", "Metsa mõõdetakse."), false);
});

test("qualitative grounding accepts only the reviewed token equivalences", () => {
  assert.equal(groundingVerdict("Metsauuendus.", "Uuendati."), true);
  assert.equal(groundingVerdict("Uuendati.", "Metsauuendus."), true);
  assert.equal(groundingVerdict("Uuendamine.", "Uuendatud."), true);
  assert.equal(groundingVerdict("Mõjutab.", "Mõju."), true);
  assert.equal(groundingVerdict("Majandatakse.", "Majandamine."), true);
  assert.equal(groundingVerdict("Metsauuendus.", "Uuendus."), false);
  assert.equal(groundingVerdict("Metsauuendus.", "Metsatulekahju."), false);
});

test("number, year, actor and polarity gates stay strict beside the stems", () => {
  const measurement = "Metsauuendus 12 hektarit Keskkonnaameti juhtimisel.";
  assert.equal(numericClaimBindingsMatch(measurement, measurement), true);
  assert.equal(numericClaimBindingsMatch(
    "Metsauuendus 13 hektarit Keskkonnaameti juhtimisel.",
    measurement,
  ), false);
  assert.equal(numericClaimBindingsMatch(
    "Metsauuendus 12 hektarit Keskkonnaministeeriumi juhtimisel.",
    measurement,
  ), false);

  const yearEvidence = "Metsauuendus toimus 2024. aastal.";
  assert.equal(numericClaimBindingsMatch(yearEvidence, yearEvidence), true);
  assert.equal(numericClaimBindingsMatch(
    "Metsauuendus toimus 2025. aastal.",
    yearEvidence,
  ), false);

  assert.equal(groundingVerdict(measurement, "Metsauuendus 13 hektarit Keskkonnaameti juhtimisel."), false);
  assert.equal(groundingVerdict(measurement, "Metsauuendus 12 hektarit Keskkonnaministeeriumi juhtimisel."), false);
  assert.equal(groundingVerdict("Metsauuendus.", "Uuendati 12 hektarit."), false);
  assert.equal(groundingVerdict("Metsauuendus.", "Uuendati 2024. aastal."), false);
  assert.equal(groundingVerdict("Uuendati.", "Ei uuendatud."), false);
});
