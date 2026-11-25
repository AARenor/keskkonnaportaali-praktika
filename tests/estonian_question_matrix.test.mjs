import assert from "node:assert/strict";
import test from "node:test";
import { resolvePublicForestryIntent } from "../server/forestry-public.mjs";

// Real Estonian wordings that must keep the same subject, metric and scope.
// The model budget can be exhausted, so this matrix locks the deterministic
// routing contract that runs before any model call.
const MATRIX = Object.freeze([
  ["Palju metsa on Eestis?", "forest-area"],
  ["Eestis on metsa palju?", "forest-area"],
  ["Metsa Eestis on kui palju?", "forest-area"],
  ["Palun selgita, palju metsa Eestis on?", "forest-area"],
  ["Sooviksin teada Eesti metsamaa pindala", "forest-area"],
  ["Palju metsa on Soomes?", "regional-forest-area"],
  ["Palju metsa on Võru linnas?", "municipality-forest-area"],
  ["Kuidas SMI metsa mõõdab?", "smi-method-comparison"],
  ["Millise meetodiga mõõdetakse Eesti metsa?", "smi-method-comparison"],
  ["Millise meetodiga saadakse metsa pindala?", "forest-area-method"],
  ["Milline puuliik on Eestis kõige levinum?", "forest-species-share"],
  ["Kui palju metsa on kaitse all?", "protected-forest-share"],
  ["Kui palju metsa raiuti Eestis?", null],
  ["Kui vana on Eesti mets?", null],
  ["Kuidas metsa mõõdetakse Soomes?", null],
]);

for (const [question, expected] of MATRIX) {
  test(`${question} keeps its reviewed route`, () => {
    assert.equal(resolvePublicForestryIntent(question)?.kind ?? null, expected);
  });
}
