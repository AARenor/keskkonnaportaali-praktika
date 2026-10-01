import assert from "node:assert/strict";
import test from "node:test";
import { sourceDateMeta, sourceOrganizationLabel } from "../src/source-label.js";

test("KAUR data is credited to Keskkonnaagentuur", () => {
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaagentuur", url: "https://keskkonnaagentuur.ee/node/2720" }), "Keskkonnaagentuur");
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaagentuur / Ilmateenistus", url: "https://www.ilmateenistus.ee/ilma_andmed/xml/forecast.php" }), "Keskkonnaagentuur");
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaagentuur / Keskkonnaportaal", url: "https://gsavalik.envir.ee/geoserver/metsaregister/wfs" }), "Keskkonnaagentuur");
});

test("explicit Keskkonnaagentuur attribution is preserved on Keskkonnaportaal pages", () => {
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaagentuur", url: "https://keskkonnaportaal.ee/et/metsa-aastaraamatud" }), "Keskkonnaagentuur");
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaagentuur / Keskkonnaportaal", url: "https://register.keskkonnaportaal.ee/register/search" }), "Keskkonnaagentuur");
  assert.equal(sourceOrganizationLabel({ organization: "KAUR", url: "https://keskkonnaportaal.ee/et/teemad/mets" }), "Keskkonnaagentuur");
  assert.equal(sourceOrganizationLabel({ organization: "Keskkonnaportaal", url: "https://keskkonnaportaal.ee/et/teemad/mets" }), "Keskkonnaportaal");
});

test("source metadata puts the publisher next to the update or publication date", () => {
  assert.equal(sourceDateMeta({
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    dataYear: "2026",
    dataAsOf: "02.09.2026",
    updated: "03.09.2026",
    published: "14.05.2024",
  }), "Andmed: 2026 (seisuga 02.09.2026) · Uuendatud: 03.09.2026 · Allikas: Keskkonnaagentuur");
  assert.equal(sourceDateMeta({ organization: "Kliimaministeerium", published: "07.04.2026" }), "Avaldatud: 07.04.2026 · Allikas: Kliimaministeerium");
});

test("other publishers keep their own name", () => {
  assert.equal(sourceOrganizationLabel({ organization: "Statistikaamet", url: "https://andmed.stat.ee" }), "Statistikaamet");
  assert.equal(sourceOrganizationLabel({}), "");
});
