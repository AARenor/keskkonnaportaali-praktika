import assert from "node:assert/strict";
import test from "node:test";
import {
  isMunicipalWasteRecyclingRateQuery,
  municipalWasteIndicatorFromCsv,
  MUNICIPAL_WASTE_RECYCLING_CSV_URL,
} from "../server/indicators.mjs";

const fixture = `Aasta,Measure Names,Eesti/EL õige,% Eesti (copy),% Eesti,% EL (copy),% EL
2022,Eesti,*,33.4,33.4,,
2023,Eesti,*,37.9,37.9,,
2024,Eesti,*,36.4,36.4,,
2022,Euroopa Liit (EL),,,,49.1,49.1
2023,Euroopa Liit (EL),,,,47.9,47.9
2024,Euroopa Liit (EL),,,,48.1,48.1
`;

test("municipal-waste rate adapter reads the requested year from official Tableau CSV", () => {
  const documents = municipalWasteIndicatorFromCsv("jäätmete ringlussevõtu määr Eestis 2023", fixture);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].id, "municipal-waste-recycling");
  assert.equal(documents[0].locator, MUNICIPAL_WASTE_RECYCLING_CSV_URL);
  assert.match(documents[0].summary, /2023\. aastal oli 37,9%/u);
  assert.match(documents[0].summary, /Euroopa Liidus 47,9%/u);
  assert.equal(documents[0].retrieval, "official-tableau-csv");
});

test("municipal-waste adapter uses the latest complete observation and abstains on missing years", () => {
  assert.match(municipalWasteIndicatorFromCsv("olmejäätmete ringlussevõtu protsent", fixture)[0].summary, /2024\. aastal oli 36,4%/u);
  assert.deepEqual(municipalWasteIndicatorFromCsv("olmejäätmete ringlussevõtu määr 2030", fixture), []);
  assert.deepEqual(municipalWasteIndicatorFromCsv("jäätmete põletamine", fixture), []);
  assert.equal(isMunicipalWasteRecyclingRateQuery("ringlussevõtu määr Eestis"), false);
});
