import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

test("versioned personas define audiences and the evidence-bound answer style", async () => {
  const personas = await text("docs/PERSONAD.md");
  assert.match(personas, /Versioon:\s*1\.0\.0/u);
  for (const audience of ["Tavakasutaja", "Metsaomanik", "Keskkonnaspetsialist", "IT-haldur"]) {
    assert.match(personas, new RegExp(`##[^\n]*${audience}`, "u"), audience);
  }
  assert.match(personas, /otsene vastus[\s\S]*viidatud[\s\S]*lihtne eesti keel/iu);
  assert.match(personas, /ei tohi[\s\S]*(?:oletada|välja mõelda)/iu);
});

test("ordinary-user guide explains sources, dates, filters and safety boundaries", async () => {
  const guide = await text("docs/KASUTUSJUHEND.md");
  assert.match(guide, /Allikas:[\s\S]*Uuendatud:/u);
  assert.match(guide, /allika[\s\S]*sisutüübi[\s\S]*aasta[\s\S]*järjestus/iu);
  assert.match(guide, /isikuandm/iu);
  assert.match(guide, /tõendit ei leitud/iu);
});

test("IT guide locks the source hierarchy and all three annual forestry workflows", async () => {
  const guide = await text("docs/IT-HOOLDUS.md");
  assert.match(guide, /SMI\s*→\s*metsaaastaraamat\s*→\s*puidubilanss\s*→\s*Keskkonnaportaal\/Keskkonnaagentuur\s*→\s*Kliimaministeerium\s*→\s*täiendavad allikad\s*→\s*Eurostat/iu);
  for (const source of ["SMI", "Aastaraamat „Mets“", "Puidubilanss"]) {
    assert.match(guide, new RegExp(`### ${source.replace(/[„“]/gu, ".")}[\\s\\S]*Kontroll[\\s\\S]*Uuenda[\\s\\S]*Testi`, "iu"), source);
  }
  assert.match(guide, /uusi Statistikaameti allikaid ei lisata/iu);
  assert.match(guide, /npm test[\s\S]*npm run build[\s\S]*npm run test:sites/u);
});

test("repository documentation entry point links both user and IT guidance", async () => {
  const readme = await text("README.md");
  assert.match(readme, /docs\/PERSONAD\.md/u);
  assert.match(readme, /docs\/KASUTUSJUHEND\.md/u);
  assert.match(readme, /docs\/IT-HOOLDUS\.md/u);
});
