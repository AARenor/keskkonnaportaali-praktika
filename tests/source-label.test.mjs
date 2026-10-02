import assert from "node:assert/strict";
import test from "node:test";
import { sourceDateMeta, sourceOrganizationLabel } from "../src/source-label.js";
import * as labels from "../src/source-label.js";
import { readFile } from "node:fs/promises";

test("legend source numbers are readable without relying on color or hover", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /<span className="source-legend__number">\{source\.citation\}<\/span>/u);
});

test("source legend colors agree by citation and latest marker compares only valid page updates", () => {
  assert.equal(typeof labels.citationColor, "function");
  assert.equal(new Set(Array.from({length: 10}, (_, i) => labels.citationColor(i + 1))).size, 10);
  assert.equal(labels.citationColor(2), labels.citationColor(2));
  assert.equal(typeof labels.latestSourceUpdates, "function");
  const sources = [
    {citation: 1, updated: "02.09.2026"},
    {citation: 2, updated: "01.10.2026", dataYear: "2023"},
    {citation: 3, published: "02.10.2026", dataYear: "2025"},
    {citation: 4, updated: "31.02.2026"},
    {citation: 5, updated: "2027-01-01"},
  ];
  assert.deepEqual(labels.latestSourceUpdates(sources, Date.parse("2026-10-02T12:00:00Z")), [2]);
  assert.deepEqual(labels.latestSourceUpdates([{citation: 1, updated: "01.10.2026"}]), []);
  assert.deepEqual(labels.latestSourceUpdates([{citation: 1, updated: "2026-10-01"}, {citation: 2, updated: "01.10.2026"}], Date.parse("2026-10-02")), [1, 2]);
});

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
  assert.equal(sourceOrganizationLabel({ organization: "Eesti Keskkonnauuringute Keskus", url: "https://keskkonnaportaal.ee/sites/default/files/seire.pdf" }), "Eesti Keskkonnauuringute Keskus");
  assert.equal(sourceOrganizationLabel({ organization: "Statistikaamet", url: "https://andmed.stat.ee" }), "Statistikaamet");
  assert.equal(sourceOrganizationLabel({}), "");
});
