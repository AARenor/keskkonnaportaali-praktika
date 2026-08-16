import assert from "node:assert/strict";
import test from "node:test";
import { composeCadastreAnswer, extractCadastreNumber, normalizeSpatialState } from "../server/cadastre.mjs";

test("cadastre intent accepts only a canonical cadastral number", () => {
  assert.equal(extractCadastreNumber("Vaata 78404:409:0113 metsa"), "78404:409:0113");
  assert.equal(extractCadastreNumber("78404:409:011'3"), null);
  assert.equal(extractCadastreNumber("78404:409:0113x"), null);
});

test("official spatial answer distinguishes found, not found and unavailable states", () => {
  const result = composeCadastreAnswer("78404:409:0113", "78404:409:0113", {
    extractedAt: "2026-08-16T12:00:00.000Z",
    cadastre: {
      status: "found",
      areaHectares: 21.65,
      address: "Kadaka pst 159",
      municipality: "Tallinn",
      county: "Harju maakond",
      intendedUse: "MAATULUNDUSMAA",
    },
    forest: {
      status: "not_found",
      count: 0,
    },
  });

  assert.match(result.answer.intro, /21,65 ha/);
  assert.match(result.answer.parts[0].text, /ei tõenda, et kinnistul metsa ei ole/);
  assert.equal(result.evidence.states.cadastre, "found");
  assert.equal(result.evidence.states.forest, "not_found");
  assert.ok(result.sources.every((source) => new URL(source.url).protocol === "https:"));
  assert.doesNotMatch(JSON.stringify(result), /Terrapoint|Qdrant|PostgreSQL/i);
});

test("official spatial outage never becomes an absence claim", () => {
  const result = composeCadastreAnswer("78404:409:0113", "78404:409:0113", {
    extractedAt: "2026-08-16T12:00:00.000Z",
    cadastre: { status: "unavailable" },
    forest: { status: "unavailable" },
  });
  assert.match(result.answer.intro, /ei saa järeldada/);
  assert.match(result.answer.parts[0].text, /ei tähenda/);
});

test("invalid WFS payload degrades only that source to unavailable", () => {
  const malformedCadastre = [{ properties: { tunnus: "00000:000:0000", pindala: 1000 } }];
  const validForest = [{ properties: { id: "stand-1", katastri_nr: "78404:409:0113", pindala: 1.2, invent_kp: "2024-01-01" } }];
  assert.deepEqual(normalizeSpatialState("cadastre", malformedCadastre, "78404:409:0113"), { status: "unavailable" });
  assert.equal(normalizeSpatialState("forest", validForest, "78404:409:0113").status, "found");
});

test("cadastre extract is explicitly informational and unofficial", () => {
  const result = composeCadastreAnswer("78404:409:0113", "78404:409:0113", {
    extractedAt: "2026-08-16T12:00:00.000Z",
    cadastre: { status: "not_found" },
    forest: { status: "unavailable" },
  });
  assert.match(`${result.answer.intro} ${result.answer.note}`, /informatiivne/iu);
  assert.match(result.answer.note, /mitteametlik/iu);
  assert.ok(result.sources.every((source) => source.type === "Avalik ruumiandmeteenus"));
});
