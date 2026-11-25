import assert from "node:assert/strict";
import test from "node:test";
import { extractAnswersQuery, namesDefinitionTerm } from "../server/answer_coverage.mjs";
import { resolvePublicForestryIntent } from "../server/forestry-public.mjs";
import { matchesReviewedAnswerForm } from "../server/question_wording.mjs";

test("reviewed answer wording accepts forest land as a forest form", () => {
  assert.equal(matchesReviewedAnswerForm("mets", "mets"), true);
  assert.equal(matchesReviewedAnswerForm("metsamaa", "mets"), true);
  assert.equal(matchesReviewedAnswerForm("metsamaad", "mets"), true);
  assert.equal(matchesReviewedAnswerForm("metsaga", "mets"), true);
  assert.equal(matchesReviewedAnswerForm("puitu", "mets"), false);
  assert.equal(matchesReviewedAnswerForm("raieteatis", "metsateatis"), true);
});

test("a short quantity question keeps the national forest area route", () => {
  assert.equal(resolvePublicForestryIntent("Palju metsa on Eestis?")?.kind, "forest-area");
  assert.equal(resolvePublicForestryIntent("Kui palju metsa on Eestis?")?.kind, "forest-area");
});

test("measurement wording reaches the SMI method and area method routes", () => {
  assert.equal(resolvePublicForestryIntent("Kuidas SMI metsa mõõdab?")?.kind, "smi-method-comparison");
  assert.equal(resolvePublicForestryIntent("Millise meetodiga saadakse metsa pindala?")?.kind, "forest-area-method");
});

test("a harvest question does not borrow the national forest area route", () => {
  assert.notEqual(resolvePublicForestryIntent("Kui palju metsa raiuti Eestis?")?.kind, "forest-area");
});

test("a cited forest land sentence answers a short forest area question", () => {
  assert.equal(extractAnswersQuery(
    "Kui palju metsa on Eestis?",
    "Eesti metsamaa pindala on umbes 2,4 miljonit hektarit.",
  ), true);
  assert.equal(extractAnswersQuery(
    "Kui palju metsa on Eestis?",
    "Eesti järvede pindala on umbes 2000 ruutkilomeetrit.",
  ), false);
});

test("a short quantity question keeps regional and municipal scopes", () => {
  assert.equal(resolvePublicForestryIntent("Palju metsa on Soomes?")?.kind, "regional-forest-area");
  assert.equal(resolvePublicForestryIntent("Palju metsa on Võru linnas?")?.kind, "municipality-forest-area");
  assert.equal(resolvePublicForestryIntent("Palju metsa on Eestis?")?.kind, "forest-area");
});

test("the definition gate stays strict beside the forest land equivalent", () => {
  assert.equal(namesDefinitionTerm("Mis on mets?", "Metsamaa on maa, kus kasvab puitu."), false);
  assert.equal(namesDefinitionTerm("Mis on mets?", "Mets on puistu."), true);
});

test("increment method is not stolen by SMI method wording", () => {
  assert.equal(resolvePublicForestryIntent("Mis meetodiga SMI juurdekasvu arvutab?")?.kind, "increment-method");
  assert.equal(resolvePublicForestryIntent("Kuidas SMI metsa mõõdab?")?.kind, "smi-method-comparison");
});

test("inflected raieteatis forms are covered by the shared reviewed list", () => {
  assert.equal(matchesReviewedAnswerForm("raieteatist", "metsateatis"), true);
  assert.equal(extractAnswersQuery(
    "Kuidas esitada raieteatist?",
    "Raieteatise esitamine toimub Metsaportaalis.",
  ), true);
});

test("a general forest method question keeps the national method route", () => {
  assert.equal(resolvePublicForestryIntent("Millise meetodiga mõõdetakse Eesti metsa?")?.kind, "smi-method-comparison");
  assert.equal(resolvePublicForestryIntent("Kuidas metsa mõõdetakse Soomes?"), null);
});
