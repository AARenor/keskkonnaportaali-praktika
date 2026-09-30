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

test("the hourly page-body backfill limit defaults to 300 and is capped", async () => {
  const { corpusBackfillHydrateLimit } = await import("../server/corpus.mjs");
  assert.equal(corpusBackfillHydrateLimit(undefined), 300);
  assert.equal(corpusBackfillHydrateLimit(""), 300);
  assert.equal(corpusBackfillHydrateLimit("0"), 0);
  assert.equal(corpusBackfillHydrateLimit("5000"), 1_000);
  assert.equal(corpusBackfillHydrateLimit("-4"), 0);
});

test("the wildlife report ranks first for a moose question and carries the count", async () => {
  const { searchEnvironment } = await import("../server/search.mjs");
  const response = searchEnvironment("Kui palju põtru elab Eestis?");
  const top = (response.results || response.sources || [])[0];
  assert.equal(top?.id, "wildlife-status-2025");
  assert.match(String(top?.content || ""), /10 000–11 000/u);
});

test("a 'how many X live' question is covered by the wildlife report", async () => {
  const { searchEnvironment, assessEvidence } = await import("../server/search.mjs");
  for (const query of ["Kui palju põtru elab Eestis?", "Kui palju ilveseid elab Eestis?"]) {
    const response = searchEnvironment(query);
    const evidence = assessEvidence(query, (response.results || response.sources || []).slice(0, 6));
    assert.equal(evidence.directDocumentId, "wildlife-status-2025", query);
  }
});

test("a species question leads with that species' count, not the report summary", async () => {
  const { searchEnvironment } = await import("../server/search.mjs");
  const { directEvidenceExtract } = await import("../server/pipeline.mjs");
  for (const [query, expected] of [
    ["Kui palju põtru elab Eestis?", /10 000–11 000/u],
    ["Kui palju ilveseid elab Eestis?", /650–800/u],
    ["Kui palju karusid elab Eestis?", /1 100/u],
  ]) {
    const response = searchEnvironment(query);
    const top = (response.results || response.sources || [])[0];
    assert.match(directEvidenceExtract(query, top), expected, query);
  }
});

test("SMI 2025 answers tree species, conifer trend and 2025 felling from its own sentences", async () => {
  const { officialServiceCatalogueDocuments } = await import("../server/search.mjs");
  const { rankPublicSearchCandidates } = await import("../server/retrieval.mjs");
  const { directEvidenceExtract } = await import("../server/pipeline.mjs");
  const directory = officialServiceCatalogueDocuments();
  for (const [query, expected] of [
    ["Millised on Eesti metsade enamuspuuliigid ja kui suur on nende osakaal?", /kaasikud \(0,71 miljonit ha\)/u],
    ["Kuidas on okaspuumetsade pindala Eestis viimase kümne aasta jooksul muutunud?", /32 000 ha/u],
    ["Kui palju raiuti Eestis metsa 2025. aastal?", /11 miljonit m³/u],
  ]) {
    const visible = rankPublicSearchCandidates(query, directory, { intentDocuments: directory, now: Date.now() });
    assert.equal(visible[0]?.id, "forest-stock-stable", query);
    assert.match(directEvidenceExtract(query, visible[0]), expected, query);
  }
});
