import assert from "node:assert/strict";
import test from "node:test";

import { officialCitationUrlEligibility } from "../server/citation-policy.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";
import { officialServiceCatalogueDocuments } from "../server/search.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval.mjs";

const resources = [
  ["Kust leida erametsatoetusi?", "https://www.eramets.ee/toetused/"],
  ["Kuidas taotleda metsameetme toetust?", "https://www.eramets.ee/toetused/metsameede/"],
  ["Kuidas taotleda metsameedet?", "https://www.eramets.ee/toetused/metsameede/"],
  ["metsaomaniku toetus", "https://www.eramets.ee/toetused/"],
  ["toetus metsa istutamiseks", "https://www.eramets.ee/toetused/metsameede/"],
  ["erametsatoetusvõimalused", "https://www.eramets.ee/toetused/"],
  ["kust taotleda metsauuenduse toetust", "https://www.eramets.ee/toetused/metsameede/"],
];

for (const [query, url] of resources) {
  test(`forest owners can find the official guidance: ${query}`, () => {
    assert.equal(officialCitationUrlEligibility(url).eligible, true);
    const catalogue = officialServiceCatalogueDocuments();
    const results = rankPublicSearchCandidates(query, catalogue, { intentDocuments: catalogue }).slice(0, 12);
    const source = results.find((item) => item.url === url);
    assert.ok(source, "the relevant official guidance is visible in the first page of results");
    assert.equal(source.evidencePolicy, "route-only");
    assert.equal(sourceEvidenceEligibility(source).eligible, false, "changing grant terms are not treated as cited facts");
  });
}

test("questions about what forest research relies on do not lead to grant pages", () => {
  const catalogue = officialServiceCatalogueDocuments();
  for (const query of [
    "Millele toetub metsa statistika?",
    "Millele toetub metsa kaugseire?",
    "Millele toetub metsa elurikkuse hindamine?",
    "Kuidas taotleda metsateatist?",
  ]) {
    const ranked = rankPublicSearchCandidates(query, catalogue, { intentDocuments: catalogue });
    assert.notEqual(ranked[0]?.id, "forest-owner-support-directory", query);
    assert.notEqual(ranked[0]?.id, "forest-owner-support-metsameede", query);
  }
});

test("the narrow support directory approval does not authorize unrelated pages", () => {
  for (const url of [
    "https://www.eramets.ee/foorum/",
    "https://www.eramets.ee/wp-content/uploads/recipient-list.pdf",
    "https://www.eramets.ee/toetused/metsameede/private/",
    "https://www.eramets.ee/toetused/?recipient=123",
    "http://www.eramets.ee/toetused/",
    "https://name@www.eramets.ee/toetused/",
  ]) assert.equal(officialCitationUrlEligibility(url).eligible, false, url);
});
