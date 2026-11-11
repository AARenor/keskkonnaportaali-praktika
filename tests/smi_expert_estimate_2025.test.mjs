// Regression: the 2025 felling expert estimate must reach the rendered card.
//
// Observed live (2026-11-11) on the deployed release candidate:
//   "Kas Eestis raiutakse 2025. aastal rohkem kui metsa juurde kasvab?"
//     showed the 2024 measured felling year and the gross/net caveat but never
//     stated the published 2025 expert estimate.
//   "Kas 2025. aasta raiemahu kohta on eksperdihinnang?"
//     answered "Meil ei ole sellele küsimusele vastust" although the official
//     publisher that states the estimate is a reviewed source.
//
// Both questions run here through the same pipeline the server runs for a
// follow-up (server/index.mjs composeFollowUpResult): the retrieval query comes
// from contextualRetrievalQuery(root, question, []), the reviewed listing is
// passed in, and searchEnvironmentLive applies the outer answer checks, the
// visible-witness check and the public projection. No network and no database:
// the listing holds the reviewed bodies the answer path reuses without a live
// read, the model call is replaced by an unavailable-provider result, and
// persistence is stubbed. The estimate either comes from the source that
// publishes it or the card says nothing about it.
//
// Reviewed facts: Keskkonnaagentuur (18.08.2026) writes "Raiemahu
// eksperthinnangu alusel oli 2025. aasta raiemaht 11 miljonit m3" and the SMI
// 2025 presentation writes the same year as "11,0 miljonit m³", both explicitly
// as an expert estimate. Either published spelling is accepted; a derived
// number is not, and neither may be shown without the source that publishes it.

import assert from "node:assert/strict";
import test from "node:test";
import { searchEnvironmentLive } from "../server/pipeline.mjs";
import { NO_ANSWER_EYEBROW, officialServiceCatalogueDocuments } from "../server/search.mjs";
import { isForestHarvestBalanceQuery, smiHarvestBalanceDocument } from "../server/indicators.mjs";
import { contextualRetrievalQuery, conversationContext } from "../server/retrieval.mjs";
import { sourceCanSupportPublicCitation } from "../server/source-registry.mjs";

const NOW = Date.parse("2026-11-11T10:00:00Z");
const ROOT_QUERY = "Kas Eestis raiutakse 2025. aastal rohkem kui metsa juurde kasvab?";
const ESTIMATE_FOLLOW_UP = "Kas 2025. aasta raiemahu kohta on eksperdihinnang?";
const ESTIMATE_SOURCE_IDS = ["forest-stock-stable", "forest-smi-2025-presentation"];
const ESTIMATE_RENDERING = /11(?:[,.]0)?\s*miljonit\s*m(?:³|3)?/iu;
const PUBLISHER_URL = /^https:\/\/(?:keskkonnaagentuur\.ee|keskkonnaportaal\.ee)\//u;
const ESTIMATE_SOURCE_URL = /uudised\/smi-metsatagavara-stabiilne|SMI(?:%20| )2025(?:%20| )ettekanne/iu;

// The answer path reuses a reviewed body it already holds. A record with no
// stored body, or one the publisher allows only as navigation, would make the
// draft re-read the page; those records are dropped so the regression stays
// offline. Offline they cannot support a claim anyway.
function reusableReviewedDocuments() {
  return officialServiceCatalogueDocuments().filter((document) => (
    document.retrieval !== "official-federated-search"
    && String(document.content || "").length >= 120
    && sourceCanSupportPublicCitation(document, { now: NOW }).eligible
  ));
}

// The reviewed listing prepared for this retrieval query. The SMI 2025 workbook
// extract is the reviewed local document the structured balance segment adds;
// the card is composed from the workbook before any Eurostat row is consulted.
function reviewedListing(retrievalQuery) {
  const documents = reusableReviewedDocuments();
  const workbook = isForestHarvestBalanceQuery(retrievalQuery) ? smiHarvestBalanceDocument() : null;
  return listingOf([...(workbook ? [workbook] : []), ...documents]);
}

// The follow-up request exactly as composeFollowUpResult builds it.
async function followUpResponse(retrievalQuery, listing) {
  const previousQuestions = [];
  return searchEnvironmentLive(ESTIMATE_FOLLOW_UP, {
    startedAt: NOW,
    deadlineAt: Date.now() + 120_000,
    assessmentQuery: retrievalQuery,
    retrievalQuery,
    rootContext: [ROOT_QUERY, ...previousQuestions].join(" → "),
    conversationContext: conversationContext(ROOT_QUERY, previousQuestions),
    allowSafeEllipticalFollowUp: true,
    searchResults: listing,
    filters: {},
    useCache: false,
    // The model is the only network call on this path. An unavailable provider
    // is the real degraded case, and the deterministic card must still answer.
    generateAnswer: async () => ({
      answer: null,
      acceptedClaims: [],
      attempt: { provider: "estimate-regression", status: "degraded", reason: "provider-error" },
    }),
    recordSearch: async () => ({ status: "skipped" }),
    llmClientKey: "estimate-regression",
  });
}

function listingOf(documents) {
  return {
    items: documents,
    evidenceCandidates: documents,
    total: documents.length,
    page: 1,
    pageSize: 12,
    pageCount: 1,
    hasMore: false,
    appliedFilters: {},
  };
}

function citedSources(response) {
  return (response.answer?.introCitations || [])
    .map((citation) => (response.sources || []).find((source) => Number(source.citation) === Number(citation)))
    .filter(Boolean);
}

function cardText(response) {
  const answer = response.answer || {};
  return [answer.intro, ...(answer.parts || []).map((part) => part.text)].filter(Boolean).join(" ");
}

// A year inside Estonian running text ("2025. aasta") looks like a full stop to
// a naive sentence split. Protect it so a claim can be checked together with
// the qualifier that limits it.
function sentencesOf(value) {
  return String(value)
    .replace(/(?<=\b\d{4})\.(?=\s)/gu, "\u0000")
    .split(/(?<=\.)\s+/u)
    .map((sentence) => sentence.replaceAll("\u0000", "."));
}

test("the 2025 estimate follow up shows the published estimate with its own source", async () => {
  const retrievalQuery = contextualRetrievalQuery(ROOT_QUERY, ESTIMATE_FOLLOW_UP, []);
  const response = await followUpResponse(retrievalQuery, reviewedListing(retrievalQuery));
  const text = cardText(response);

  assert.notEqual(
    response.answer?.eyebrow,
    NO_ANSWER_EYEBROW,
    `the follow up must be answered, it said: ${text}`,
  );
  assert.doesNotMatch(text, /Meil ei ole sellele küsimusele vastust/u);
  assert.match(text, /eksperthinnang/iu, "the 2025 figure is labelled an expert estimate");
  assert.match(text, ESTIMATE_RENDERING, "the published 2025 estimate is stated as 11 million m³");
  assert.doesNotMatch(text, /15\s?458/u, "the estimate is never presented as the SMI gross increment");

  const cited = citedSources(response);
  assert.ok(cited.length > 0, "the estimate must carry a visible citation");
  assert.ok(
    cited.some((source) => ESTIMATE_SOURCE_URL.test(String(source.url || ""))),
    `the estimate must be cited to the source that publishes it, got: ${cited.map((source) => source.url).join(", ")}`,
  );
  assert.ok(
    cited.every((source) => PUBLISHER_URL.test(String(source.url || ""))),
    "every cited source stays on the official publisher's origin",
  );
  assert.ok(
    cited.some((source) => ESTIMATE_RENDERING.test(String(source.evidenceExcerpt || ""))),
    "the cited excerpt must contain the estimate the answer quotes",
  );
});

test("without the source that publishes it the follow up states no estimate", async () => {
  const retrievalQuery = contextualRetrievalQuery(ROOT_QUERY, ESTIMATE_FOLLOW_UP, []);
  const listing = reviewedListing(retrievalQuery);
  const documents = listing.items.filter((document) => !ESTIMATE_SOURCE_IDS.includes(document.id));
  assert.ok(
    documents.every((document) => !ESTIMATE_SOURCE_IDS.includes(document.id)),
    "the estimate sources must be absent from this listing",
  );

  const response = await followUpResponse(retrievalQuery, listingOf(documents));
  const text = cardText(response);

  assert.doesNotMatch(text, ESTIMATE_RENDERING, "no estimate may be shown while its source is absent");
  assert.doesNotMatch(text, /eksperthinnang/iu, "no estimate wording may be invented");
  const cited = citedSources(response);
  assert.ok(
    cited.every((source) => !ESTIMATE_SOURCE_URL.test(String(source.url || ""))),
    "a missing source cannot be cited for the estimate",
  );
});

test("the 2025 harvest balance answer states the expert estimate and keeps the gross/net boundary", async () => {
  const response = await searchEnvironmentLive(ROOT_QUERY, {
    startedAt: NOW,
    deadlineAt: Date.now() + 120_000,
    searchResults: reviewedListing(ROOT_QUERY),
    filters: {},
    useCache: false,
    generateAnswer: async () => ({
      answer: null,
      acceptedClaims: [],
      attempt: { provider: "estimate-regression", status: "degraded", reason: "provider-error" },
    }),
    recordSearch: async () => ({ status: "skipped" }),
    llmClientKey: "estimate-regression",
  });
  const text = cardText(response);

  assert.notEqual(
    response.answer?.eyebrow,
    NO_ANSWER_EYEBROW,
    `the balance answer must not collapse to a no-answer; it said: ${text}`,
  );
  assert.match(text, /eksperthinnang/iu, "the 2025 felling figure is labelled an expert estimate");
  assert.match(text, ESTIMATE_RENDERING, "the published 2025 estimate is stated");
  assert.match(text, /2024\. aasta[^.]*12 500 tuhat m³/u, "the 2024 felling amount is stated with its year");
  assert.match(text, /12 500 tuhat m³[^.]*±9,6\s?%/u, "the 2024 amount keeps its sampling error");
  assert.match(text, /2024\. aasta[^.]*hinnang/u, "the 2024 SMI figure is named an estimate, not an exact measurement");
  assert.doesNotMatch(text, /2024\. aasta mõõdetud/u, "the 2024 SMI figure is not an exact measurement");
  assert.doesNotMatch(text, /mõõdetud koguraie/u, "no exact measurement wording for the SMI felling series");
  const availability = sentencesOf(text).filter((sentence) => /2025\. aasta mõõdetud raiemahtu/u.test(sentence));
  assert.ok(availability.length > 0, `the answer states whether a measured 2025 felling figure exists: ${text}`);
  for (const claim of availability) {
    assert.match(
      claim,
      /(?:töövihik|selles väljaandes|väljavõttest)/iu,
      `the 2025 gap must be scoped to the SMI 2025 workbook, got: ${claim}`,
    );
  }
  assert.match(text, /netojuurdekasv/u, "net increment is distinguished from gross increment");
  // The checked evidence is the SMI 2025 workbook, so a missing national net
  // increment total can only be stated about that workbook. The managed-forest
  // per-hectare value from the review stays in the answer.
  const netClaims = sentencesOf(text).filter((sentence) => /netojuurdekasvu kogumahtu/u.test(sentence));
  assert.ok(netClaims.length > 0, `the answer states whether a national net increment total exists: ${text}`);
  for (const claim of netClaims) {
    assert.match(
      claim,
      /(?:töövihik|selles väljaandes|väljavõttest)/iu,
      `the national net increment gap must be scoped to the SMI 2025 workbook, got: ${claim}`,
    );
  }
  assert.match(text, /4,9\s*m(?:³|3)[^.]{0,40}hektari kohta aastas/u, "the managed-forest net increment per hectare is kept");
  assert.doesNotMatch(
    text,
    /netojuurdekasvu kogumahtu (?:ei ole|pole) (?:kusagil|kuskil|üldse|veel) avaldatud/iu,
    "no global claim about the national net increment total",
  );
  assert.doesNotMatch(
    text,
    /2\s?958/u,
    "gross increment minus total felling is not a comparison and may never be printed",
  );

  const cited = citedSources(response);
  assert.ok(cited.length > 0, "the balance claim must carry a visible citation");
  assert.ok(
    cited.some((source) => ESTIMATE_SOURCE_URL.test(String(source.url || ""))),
    `the estimate must be cited to the source that publishes it, got: ${cited.map((source) => source.url).join(", ")}`,
  );
});

test("a combined trend answer keeps the source limitation through the public pipeline", async () => {
  const query = "Kuidas on raiemaht ja juurdekasv ajas muutunud?";
  const response = await searchEnvironmentLive(query, {
    startedAt: NOW,
    deadlineAt: Date.now() + 120_000,
    searchResults: reviewedListing(query),
    filters: {},
    useCache: false,
    generateAnswer: async () => ({
      answer: null,
      acceptedClaims: [],
      attempt: { provider: "estimate-regression", status: "degraded", reason: "provider-error" },
    }),
    recordSearch: async () => ({ status: "skipped" }),
    llmClientKey: "estimate-regression",
  });
  assert.match(response.answer.note, /väljavõte ei anna mõlema näitaja muutust aastate kaupa/iu, "the extract limitation remains visible");
  assert.match(response.answer.note, /raiemahu aastarida.*eraldi küsimusena/iu, "the note points to the separate felling series");
  assert.ok(response.answer.introCitations?.some((number) => /SMI.*tulemused\.xlsx/iu.test(
    decodeURIComponent(String(response.sources?.find((source) => Number(source.citation) === Number(number))?.url || "")),
  )), "the answer links to the SMI workbook");
  assert.doesNotMatch(response.answer.note, /2024\. aasta koguraie/u, "the five year mean is not called a single year total");
});
