import assert from "node:assert/strict";
import test from "node:test";
import { multiSourceSynthesisDocuments, splitTextPassages } from "../server/search_evidence.mjs";

const QUERY = "metsaraie mõju loodusele";
const BASE_CONTENT = "Metsaraie mõjutab metsade seisundit ja elupaiku. Raieliik ja selle ulatus määravad, kui suur on mõju loodusele ning kui kaua ökosüsteem taastub. Lisaks muudab raie puistu struktuuri, mullaomadusi ja liigikoosseisu, mistõttu tuleb mõju hinnata iga kaitseala ja elupaiga tüübi kaupa eraldi.";

function source(id, host, organization, marker) {
  return {
    id,
    citation: Number(id),
    title: `Allikas ${id}`,
    url: `https://${host}/teave/${id}`,
    organization,
    sourceTier: "official",
    evidencePolicy: "public",
    content: `${BASE_CONTENT}\n${marker}. ${BASE_CONTENT}`,
  };
}

test("three slots keep two publishers and every passage stays with its own source", () => {
  const fixtures = [
    ["1", "www.keskkonnaportaal.ee", "Keskkonnaportaal", "Esimese portaali lehe erilõik kirjeldab elupaiku"],
    ["2", "keskkonnaportaal.ee", "Keskkonnaportaal", "Teise portaali lehe erilõik kirjeldab elupaiku"],
    ["3", "www.keskkonnaportaal.ee", "Keskkonnaportaal", "Kolmanda portaali lehe erilõik kirjeldab elupaiku"],
    ["4", "www.keskkonnaamet.ee", "Keskkonnaamet", "Esimese ameti lehe erilõik kirjeldab elupaiku"],
    ["5", "keskkonnaamet.ee", "Keskkonnaamet", "Teise ameti lehe erilõik kirjeldab elupaiku"],
  ];
  const documents = fixtures.map(([id, host, organization, marker]) => source(id, host, organization, marker));
  const markers = new Map(fixtures.map(([id, , , marker]) => [id, marker]));
  const originals = new Map(documents.map((document) => [document.id, document]));

  const selected = multiSourceSynthesisDocuments(QUERY, documents, { minimum: 3, maximum: 3 });

  assert.deepEqual(selected.map((document) => document.id), ["1", "4", "2"]);
  assert.deepEqual(
    [...new Set(selected.map((document) => document.organization))],
    ["Keskkonnaportaal", "Keskkonnaamet"],
  );
  const selectedIds = new Set(selected.map((document) => document.id));
  assert.ok(selectedIds.has("1") && selectedIds.has("4"), "the top document of each publisher survives");
  const positions = new Map(selected.map((document, index) => [document.id, index]));
  assert.ok(positions.get("1") < positions.get("2"), "rank order inside the first publisher is unchanged");

  for (const document of selected) {
    const original = originals.get(document.id);
    assert.equal(document, original, "the selected citation keeps its original source object");
    assert.equal(document.citation, Number(document.id));
    assert.equal(new URL(document.url).hostname, new URL(original.url).hostname);
    const marker = markers.get(document.id);
    const ownPassages = splitTextPassages(document.content);
    assert.equal(ownPassages.filter((passage) => passage.includes(marker)).length, 1);
    for (const other of selected) {
      if (other === document) continue;
      assert.equal(splitTextPassages(other.content).some((passage) => passage.includes(marker)), false);
    }
  }

  assert.equal(
    multiSourceSynthesisDocuments("kui palju metsa on Eestis", documents, { minimum: 3, maximum: 3 }),
    null,
    "a precise quantity question stays on the strict evidence path",
  );
});
