import assert from "node:assert/strict";
import test from "node:test";

import { officialServiceCatalogueDocuments } from "../server/search.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval.mjs";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const cases = [
  ["kliimamuutuse mõju sademetele Eestis", "precipitation-change"],
  ["KESE keskkonnaseire mõõtmistulemused", "kese-monitoring"],
  ["Kas elektriauto on kogu elutsükli jooksul sisepõlemisautost keskkonnasõbralikum?", "electric-vehicle-lifecycle"],
  ["Kust näen oma maatüki puistuandmeid?", "metsaregister"],
  ["Kust leida konkreetse kinnistu metsaandmeid?", "metsaregister"],
  ["Kuidas vaadata oma metsamaa takseerandmeid?", "metsaregister"],
  ["Kust leian minu metsa takseerimisandmed?", "metsaregister"],
  ["Kui palju metsamaad Eestis on?", "forest-smi-2025-tables"],
  ["Millise metoodikaga kogub SMI oma metsaandmeid?", "forest-rmk-data-methods"],
  ["Millal tuleb metsateatis esitada?", "forest-notice-guidance"],
];

for (const [query, expected] of cases) {
  test(`the specific source leads the public listing: ${query}`, () => {
    const directory = officialServiceCatalogueDocuments();
    const ranked = rankPublicSearchCandidates(query, directory, { intentDocuments: directory, now: NOW });
    assert.equal(ranked[0]?.id, expected);
  });
}
