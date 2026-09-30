import assert from "node:assert/strict";
import test from "node:test";

import { classifyForestryGeographyScope } from "../server/municipalities.mjs";
import { resolvePublicForestryIntent } from "../server/forestry-public.mjs";
import { assessSearchQuery } from "../server/search.mjs";

// Questions from the 2026-09 manual review of forest and wildlife answers.

test("unnamed or organisation words default to Estonia, not a foreign region", () => {
  for (const query of [
    "Kui palju metsa haldab RMK?",
    "Kui palju metsa uuendati ehk istutati ja külvati Eestis 2025. aastal?",
  ]) {
    const scope = classifyForestryGeographyScope(query);
    assert.match(scope.kind, /^national-/u, query);
    assert.notEqual(assessSearchQuery(query).reason, "unsupported-geography", query);
  }
});

test("explicitly named foreign countries still stay foreign", () => {
  assert.equal(classifyForestryGeographyScope("Kui palju metsa on Soomes?").kind, "foreign-or-other-region");
});

test("forest compounds, moose and hunting belong to the environment domain", () => {
  for (const query of [
    "Mis on sanitaarraie?",
    "Kui palju põtru elab Eestis?",
    "Millal algab Eestis linnujaht ja mida peab jälgima?",
    "Kuidas on okaspuumetsade pindala Eestis viimase kümne aasta jooksul muutunud?",
  ]) {
    assert.equal(assessSearchQuery(query).kind, "answerable", query);
  }
});

test("a named felling type is specific enough to answer, bare raie still asks", () => {
  assert.equal(assessSearchQuery("Mis on lageraie?").kind, "answerable");
  assert.equal(assessSearchQuery("Mis on raie?").reason, "broad-topic");
});

test("questions about another forest subject never get the forest-area snapshot", () => {
  for (const query of [
    "Millised on Eesti metsade enamuspuuliigid ja kui suur on nende osakaal?",
    "Kui palju on Eestis üle 100 aasta vanuseid metsi?",
    "Kui palju oli Eestis metsatulekahjusid 2025. aastal?",
    "Kaitstavate metsade osakaal Eestis",
    "Kui palju metsa haldab RMK?",
    "Kui palju metsa uuendati ehk istutati ja külvati Eestis 2025. aastal?",
  ]) {
    assert.notEqual(resolvePublicForestryIntent(query)?.kind, "forest-area", query);
  }
});

test("plain forest-area questions keep the forest-area snapshot", () => {
  for (const query of [
    "Kui palju on eestis metsa?",
    "Kui suur on Eesti metsamaa pindala?",
  ]) {
    assert.equal(resolvePublicForestryIntent(query)?.kind, "forest-area", query);
  }
});
