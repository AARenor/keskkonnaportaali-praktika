import test from "node:test";
import assert from "node:assert/strict";
import { analyzeQueryIntent } from "../server/query_intent.mjs";

test("classifies clearcut definition, criteria, permission, and quantity questions", () => {
  const cases = [
    ["Mis on lageraie?", "definition", "clearcut"],
    ["Mida loetakse lageraiks?", "criteria", "clearcut"],
    ["Millal on lageraie lubatud?", "conditions", "clearcut"],
    ["Millistel tingimustel võib lageraiet teha?", "conditions", "clearcut"],
    ["Kui palju lageraiet tehakse?", "quantitative", "clearcut"],
    ["Millal on lageraie lubatud, kui puistu on hõre?", "conditions", "clearcut"],
    ["Millal on lageraie lubatud aastal 2026, kui puistu on 40-aastane?", "conditions", "clearcut"],
    ["Kui suur on Eesti metsa pindala?", "quantitative", "forest"],
  ];

  for (const [query, intent, topic] of cases) {
    const result = analyzeQueryIntent(query);
    assert.equal(result.intent, intent, query);
    assert.equal(result.topic, topic, query);
  }
});

test("classifies forest definition and classification criteria separately", () => {
  const definition = analyzeQueryIntent("Mis on mets?");
  const criteria = analyzeQueryIntent("Mida loetakse metsaks?");

  assert.equal(definition.intent, "definition");
  assert.equal(definition.topic, "forest");
  assert.equal(criteria.intent, "criteria");
  assert.equal(criteria.topic, "forest");
});

test("keeps other forest questions in the general intent", () => {
  const result = analyzeQueryIntent("Kuidas mets mõjutab elurikkust?");

  assert.equal(result.intent, "general");
  assert.equal(result.topic, "forest");
});

test("recognizes a forest notice filing procedure in common inflections", () => {
  for (const query of [
    "raieteatise esitamine",
    "raieteatise esitamise",
    "raieteatise esitamiseks",
    "metsateatise esitamine",
    "Kuidas esitada metsateatist?",
    "Esita metsateatis",
  ]) {
    const result = analyzeQueryIntent(query);
    assert.equal(result.intent, "procedure", query);
    assert.equal(result.topic, "forest_notice", query);
    assert.ok(result.terms.includes("metsateatis"), query);
  }
});

test("notice requirement and exception questions are conditions, not filing procedures", () => {
  for (const query of [
    "Millal tuleb metsateatis esitada?",
    "Millal on metsaomanikul vaja metsateatist esitada?",
    "Millal ei pea metsateatist esitama?",
    "Kas valgustusraie puhul on metsateatist vaja?",
    "Kas metsateatise esitamine on tasuline?",
  ]) {
    const result = analyzeQueryIntent(query);
    assert.equal(result.intent, "conditions", query);
    assert.equal(result.topic, "forest_notice", query);
  }
  assert.equal(analyzeQueryIntent("Kuidas esitada metsateatist?").intent, "procedure");
});

test("a how to phrase stays a filing procedure when it mentions obligation wording", () => {
  assert.equal(analyzeQueryIntent("Kuidas tuleb metsateatis esitada?").intent, "procedure");
});

test("classifies legal authority questions as conditions", () => {
  const result = analyzeQueryIntent("Kes kehtestab vääriselupaiga korra?");

  assert.equal(result.intent, "conditions");
  assert.equal(result.topic, "other");
  assert.deepEqual(result.authoritySubjectTerms, ["vääriselupaiga", "korra"]);
});

test("past authority wording does not classify as an active setter question", () => {
  assert.equal(analyzeQueryIntent("Kes kehtestas raievanuse?").intent, "general");
});

test("does not treat a permission statement as a definition", () => {
  const result = analyzeQueryIntent("Lageraie on lubatud");

  assert.equal(result.intent, "conditions");
  assert.equal(result.topic, "clearcut");
});

test("does not infer a forestry intent from an unrelated subject", () => {
  const result = analyzeQueryIntent("Millal on lennuk lubatud?");

  assert.equal(result.intent, "conditions");
  assert.equal(result.topic, "other");
  assert.deepEqual(result.terms, ["lennuk"]);
});
