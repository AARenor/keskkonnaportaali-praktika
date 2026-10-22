import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildEvidencePack } from "../server/evidence-pack.mjs";
import {
  FORESTRY_GLOSSARY,
  FORESTRY_GLOSSARY_SOURCE,
  glossaryAvoidHits,
  glossaryTermsInText,
} from "../server/forestry-glossary.mjs";
import { validateGroundedAnswer } from "../server/llm.mjs";

function groundingSource(source) {
  return {
    url: "https://keskkonnaamet.ee/grounding-fixture",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    ...source,
  };
}

test("every glossary term names its Estonian form, English match phrases and source", () => {
  assert.match(FORESTRY_GLOSSARY_SOURCE.url, /^https:\/\/keskkonnaportaal\.ee\/.*Mets%202023\.pdf$/u);
  assert.ok(FORESTRY_GLOSSARY.length >= 50);
  for (const term of FORESTRY_GLOSSARY) {
    assert.ok(term.et.trim(), "Estonian form is required");
    assert.ok(term.en.length && term.en.every((phrase) => phrase.trim()), `${term.et} needs English match phrases`);
    assert.ok(term.source.trim(), `${term.et} needs a source locator`);
  }
});

test("English source wording maps to the yearbook's Estonian term", () => {
  const found = (text) => glossaryTermsInText(text).map((term) => term.et);
  assert.equal(found("Clear felling dominated the felling area.")[0], "lageraie");
  assert.ok(found("Clear felling dominated the felling area.").includes("raie pindala"));
  assert.ok(found("Growing stock on forest available for wood supply").includes("tagavara"));
  assert.ok(found("Growing stock on forest available for wood supply").includes("majandatav metsamaa"));
  assert.ok(found("Wood removals exceeded the net annual increment").includes("raiemaht"));
  assert.ok(found("Wood removals exceeded the net annual increment").includes("netojuurdekasv"));
  // Greenhouse-gas removals are carbon sinks, not harvested wood.
  assert.deepEqual(found("LULUCF emissions and removals in 2023"), ["heide ja sidumine"]);
  assert.deepEqual(found("Household waste cleaning and tree-free stand-up meetings"), []);
});


test("mistranslated wood removals are caught in every Estonian case form", () => {
  for (const text of [
    "Puidu eemaldamine oli suurem kui juurdekasv.",
    "Võrreldi puidu eemaldamise ja netojuurdekasvu.",
    "Eurostati eemaldamist võrreldakse netojuurdekasvuga.",
  ]) {
    assert.equal(glossaryAvoidHits(text).length, 1, text);
    assert.equal(glossaryAvoidHits(text)[0].et, "raiemaht");
  }
  assert.deepEqual(glossaryAvoidHits("Eurostati raiemaht ületas netojuurdekasvu."), []);
  assert.deepEqual(glossaryAvoidHits("Barjääride eemaldamine kiirendab ringmajandust."), []);
  // A source that itself uses the form may be quoted.
  assert.deepEqual(glossaryAvoidHits("Puidu eemaldamine kasvas.", [{ content: "Puidu eemaldamine kasvas 2023. aastal." }]), []);
});

test("grounded answers using a glossary-rejected translation fall back to the draft", () => {
  const query = "Kas raiemaht ületab netojuurdekasvu?";
  const sentence = "Eurostati metsa arvepidamises võrreldakse sama aasta raiemahtu ja netojuurdekasvu.";
  const draft = {
    evidence: { kind: "ranked-search-results", answerable: true },
    answer: { title: query, intro: sentence, introCitations: [1], parts: [], note: "Kontrolli algallikat." },
    sources: [groundingSource({ citation: 1, title: "Eurostat metsa arvepidamine", content: sentence })],
  };
  const pack = buildEvidencePack({ sources: draft.sources, query, plan: null });
  const mistranslated = "Eurostati metsa arvepidamises võrreldakse sama aasta puidu eemaldamist ja netojuurdekasvu.";

  const rejected = validateGroundedAnswer({ intro: mistranslated, intro_citations: [1], parts: [] }, draft, query, pack);
  assert.equal(rejected.answer, null);
  assert.equal(rejected.rejectionReason, "local-rejected");
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(?:mjs|js|jsx|json)$/u.test(entry.name) && entry.name !== "glossary.json")
    .map((entry) => `${entry.parentPath || entry.path}/${entry.name}`);
}

test("hand-written Estonian output never uses a glossary-rejected translation", async () => {
  const files = [...await sourceFiles(fileURLToPath(new URL("../server/", import.meta.url))), ...await sourceFiles(fileURLToPath(new URL("../src/", import.meta.url)))];
  const offenders = [];
  for (const file of files) {
    const hits = glossaryAvoidHits(await readFile(file, "utf8"));
    if (hits.length) offenders.push(`${file}: ${hits.flatMap((hit) => hit.found).join(", ")}`);
  }
  assert.deepEqual(offenders, []);
});
