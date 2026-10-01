import assert from "node:assert/strict";
import test from "node:test";
import { sourceOrganizationLabel } from "../src/source-label.js";

test("KAUR data is credited to Keskkonnaagentuur", () => {
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaagentuur", url: "https://keskkonnaagentuur.ee/node/2720" }), "Keskkonnaagentuur");
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaagentuur / Ilmateenistus", url: "https://www.ilmateenistus.ee/ilma_andmed/xml/forecast.php" }), "Keskkonnaagentuur");
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaagentuur / Keskkonnaportaal", url: "https://gsavalik.envir.ee/geoserver/metsaregister/wfs" }), "Keskkonnaagentuur");
});

test("pages on keskkonnaportaal.ee that name Keskkonnaagentuur are credited to Keskkonnaportaal", () => {
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaagentuur", url: "https://keskkonnaportaal.ee/et/metsa-aastaraamatud" }), "Keskkonnaportaal");
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaagentuur / Keskkonnaportaal", url: "https://register.keskkonnaportaal.ee/register/search" }), "Keskkonnaportaal");
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaportaal / Keskkonnaagentuur", url: "https://tableau.envir.ee/x.csv", actionUrl: "https://keskkonnaportaal.ee/et/olmejaatmete-ringlussevott" }), "Keskkonnaportaal");
});

test("other publishers keep their own name", () => {
  assert.equal(sourceOrganizationLabel({ organization: "Statistikaamet", url: "https://andmed.stat.ee" }), "Statistikaamet");
  assert.equal(sourceOrganizationLabel({}), "");
});
