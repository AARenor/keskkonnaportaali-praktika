import assert from "node:assert/strict";
import test from "node:test";
import { getReviewedSearchSuggestions, relatedQueries } from "../server/suggestions.mjs";

test("forestry followups stay short and match the requested intent", () => {
  const clearcutDefinition = getReviewedSearchSuggestions("Mis on lageraie?", 5);
  assert.deepEqual(clearcutDefinition, [
    "Mida loetakse lageraiks?",
    "Millal on lageraie lubatud?",
    "Kui palju lageraiet tehakse?",
  ]);
  const forestCriteria = getReviewedSearchSuggestions("Mida loetakse metsaks?", 5);
  assert.deepEqual(forestCriteria, [
    "Mis on mets?",
    "Mis vahe on metsal ja metsamaal?",
    "Mis on mets FAO FRA järgi?",
  ]);
  const filing = getReviewedSearchSuggestions("raieteatise esitamine", 2);
  assert.deepEqual(filing, [
    "Millal tuleb metsateatis esitada?",
    "Kui kaua vaatab Keskkonnaamet metsateatist läbi?",
  ]);
});

test("the broad forest alias offers only useful followups", () => {
  assert.deepEqual(getReviewedSearchSuggestions("mets", 5), [
    "Mis on mets?",
    "Mida loetakse metsaks?",
    "Mis on lageraie?",
    "Millal on lageraie lubatud?",
    "Kuidas esitada metsateatist?",
  ]);
});

test("unmapped source tags do not become invented followup questions", () => {
  assert.deepEqual(relatedQueries("unmapped forestry topic", [{ tags: ["mets", "lageraie"] }]), []);
});
