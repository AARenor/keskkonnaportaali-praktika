import assert from "node:assert/strict";
import test from "node:test";
import { officialServiceCatalogueDocuments } from "../server/search.mjs";
import { rankSearchCandidates, selectAnswerEvidence } from "../server/retrieval.mjs";
import { createPortalDraft } from "../server/pipeline.mjs";

// Actual own-body extract checked on the official monitoring page 2026-10-02.
const content = "Kooreüraskit seirab Keskkonnaagentuur koostöös RMK-ga. Igasse Mandri-Eesti maakonda ja Saaremaale on RMK rajanud spetsiaalsed seirepunktid. Igas punktis on neli seirepüünist, mille tulemustest arvutatakse maakonna keskmine. Allolevas interaktiivses töölauas on toodud üraskite keskmised arvud seirepunktides nädalate lõikes alates 12. maist 2026. Laadi alla Exceli formaadis andmed (seisuga 2. september 2026). 2025. aasta kuuse-kooreüraskite seire tulemustega saab lähemalt tutvuda SIIN. 2024. aasta kuuse-kooreüraskite seire tulemustega saab lähemalt tutvuda SIIN. 2023. aasta kuuse-kooreüraskite seire tulemustega saab lähemalt tutvuda SIIN. Rohkem infot kuuse-kooreüraski ja soovituste kohta leiab siit.";

test("current monitoring wording answers its own year, never the linked previous-year reports", async () => {
  const documents = officialServiceCatalogueDocuments().filter(d => d.id === "bark-beetle-monitoring-2026").map(d => ({...d, content, summary:content.slice(0,500)}));
  for (const q of ["üraskite seire 2026", "üraskite seire2026"]) {
    const items = rankSearchCandidates(q, documents);
    assert.equal(selectAnswerEvidence(q,items)?.strong, true, q);
    const draft = await createPortalDraft(q,{deadlineAt:Date.now(),searchResults:{total:items.length,items}});
    assert.equal(draft.evidence.answerable,true,q);
    assert.equal(draft.sources.length,1,q);
  }
  for (const q of ["üraskite seire2025", "üraskite seire 2025", "üraskite seire Tartumaal", "üraskite seire Rootsis"]) {
    const items = rankSearchCandidates(q, documents);
    const draft = await createPortalDraft(q,{deadlineAt:Date.now(),searchResults:{total:items.length,items}});
    assert.equal(draft.evidence.answerable,false,q);
    assert.equal(draft.sources.length,0,q);
  }
});
