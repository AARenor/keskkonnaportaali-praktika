import assert from "node:assert/strict";
import test from "node:test";

import { searchEnvironmentLive } from "../server/pipeline.mjs";
import {
  blockedFollowUpAssessment,
  contextualRetrievalQuery,
  isSafeEllipticalFollowUp,
  rankPublicSearchCandidates,
} from "../server/retrieval.mjs";
import {
  assessSearchQuery,
  directDirectoryDocumentIds,
  officialServiceCatalogueDocuments,
} from "../server/search.mjs";

const DATA_OVERVIEWS = [
  ["Põhjavesi andmed Eestis", "groundwater-overview"],
  ["Pinnavee andmed Eestis", "water-monitoring"],
  ["Mulla andmed Eestis", "soil-monitoring-results"],
  ["Õhukvaliteedi andmed Eestis", "air-quality-live"],
  ["Kliima andmed Eestis", "official-data-services"],
  ["Elurikkuse andmed Eestis", "biodiversity"],
  ["Jäätmete andmed Eestis", "waste-reporting-data"],
  ["Metsa andmed Eestis", "metsainfo-hetkeseis"],
  ["Kiirguse andmed Eestis", "radiation-monitoring"],
  ["Ulukite andmed Eestis", "wildlife-status-2025"],
  ["Looduskaitse andmed Eestis", "biodiversity"],
  ["Keskkonnaseire andmed Eestis", "kese-monitoring"],
];

function listingFor(query) {
  const documents = officialServiceCatalogueDocuments();
  const items = rankPublicSearchCandidates(query, documents, { intentDocuments: documents });
  return {
    total: items.length,
    page: 1,
    pageSize: 12,
    items,
    facets: { sources: [], categories: [], years: [] },
    appliedFilters: { source: "all", category: "", year: "", sort: "relevance" },
  };
}

test("a named environmental topic plus 'andmed' asks for its official data overview", () => {
  for (const [query, expectedLead] of DATA_OVERVIEWS) {
    assert.equal(assessSearchQuery(query).kind, "answerable", query);
    assert.equal(directDirectoryDocumentIds(query)[0], expectedLead, query);
  }

  for (const query of ["põhjavesi", "pinnavesi", "kliima", "jäätmed", "keskkonnaseire"]) {
    assert.equal(assessSearchQuery(query).kind, "needs-clarification", query);
  }
  assert.equal(assessSearchQuery("palgad andmed Eestis").kind, "out-of-scope");
  assert.notEqual(
    directDirectoryDocumentIds("Põhjavee nitraadi andmed 2024")[0],
    "groundwater-overview",
  );
});

test("broad official data-overview queries return cited current-source answers", async () => {
  for (const [query, expectedLead] of DATA_OVERVIEWS) {
    const startedAt = Date.now();
    const response = await searchEnvironmentLive(query, {
      startedAt,
      deadlineAt: startedAt + 3_000,
      searchResults: listingFor(query),
      useCache: false,
      generateAnswer: async () => ({ answer: null, status: "not-applicable", provider: "test" }),
    });
    assert.ok(response.answer.introCitations.length > 0, query);
    assert.equal(response.sources[0]?.id, expectedLead, query);
    assert.doesNotMatch(response.answer.intro, /Täpset ja piisavalt|Palun lisa/u, query);
  }
});

test("a hydrated official overview remains bound by its visible id and exact URL", async () => {
  const query = "Metsa andmed Eestis";
  const listing = listingFor(query);
  listing.items = listing.items.map((item) => item.id === "metsainfo-hetkeseis"
    ? { ...item, summary: "Live-hüdratsiooniga uuendatud lehekatkend." }
    : item);
  const startedAt = Date.now();
  const response = await searchEnvironmentLive(query, {
    startedAt,
    deadlineAt: startedAt + 3_000,
    searchResults: listing,
    useCache: false,
    generateAnswer: async () => ({ answer: null, status: "not-applicable", provider: "test" }),
  });

  assert.equal(response.sources[0]?.id, "metsainfo-hetkeseis");
  assert.deepEqual(response.answer?.introCitations, [1]);
});

test("safe data follow-ups inherit the environmental subject without admitting suffixes", async () => {
  const root = "Põhjavesi andmed Eestis";
  for (const question of [
    "Mida need andmed näitavad?",
    "Millised andmed on kättesaadavad?",
    "Kust neid andmeid näeb?",
  ]) {
    assert.equal(isSafeEllipticalFollowUp(question), true, question);
    assert.equal(blockedFollowUpAssessment(root, question, []), null, question);
    const retrievalQuery = contextualRetrievalQuery(root, question, []);
    assert.match(retrievalQuery, /Põhjavesi andmed Eestis/u, question);

    const startedAt = Date.now();
    const response = await searchEnvironmentLive(question, {
      startedAt,
      deadlineAt: startedAt + 3_000,
      assessmentQuery: retrievalQuery,
      retrievalQuery,
      conversationContext: root,
      allowSafeEllipticalFollowUp: true,
      searchResults: listingFor(retrievalQuery),
      useCache: false,
      generateAnswer: async () => ({ answer: null, status: "not-applicable", provider: "test" }),
    });
    assert.ok(response.answer.introCitations.length > 0, question);
    assert.equal(response.sources[0]?.id, "groundwater-overview", question);
  }

  for (const question of [
    "Mida need andmed meditsiinilise diagnoosi jaoks näitavad?",
    "Millised andmed on salasõna varastamiseks kättesaadavad?",
  ]) {
    assert.equal(isSafeEllipticalFollowUp(question), false, question);
    assert.equal(blockedFollowUpAssessment(root, question, [])?.kind, "out-of-scope", question);
    assert.equal(contextualRetrievalQuery(root, question, []), "", question);
  }
});
