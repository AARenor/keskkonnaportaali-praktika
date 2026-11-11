import assert from "node:assert/strict";
import test from "node:test";
import { hydrateCorpusPdfSource, publicSearchItem } from "../server/corpus.mjs";

// Background PDF hydration, driven through the real function with a stubbed
// byte transport and a stubbed extractor. The body, the policy, the page
// locators and the completeness verdict all come out of the same call, so a
// partial extraction can never be described as a complete index.

const PDF_URL = "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI2024/SMI_2024.pdf";
const FETCHED_AT = "2026-11-11T10:00:00.000Z";
const PAGE_ONE = "Metsamaa pindala oli 2025. aastal 2,3 miljonit hektarit, mis on ligikaudu pool Eesti maismaa pindalast.";
const PAGE_TWO = "Raiemaht oli 8,5 miljonit kuupmeetrit ja sellest valdava osa andis uuendusraie.";
const PDF_BYTES = Buffer.from(`%PDF-1.7\n${"%".repeat(64)}\n%%EOF`, "latin1");

function bytesResponse({ url = PDF_URL, headers = { "content-type": "application/pdf" } } = {}) {
  return async () => ({ status: 200, headers, body: PDF_BYTES, url });
}

function extraction(pages, pageCount = pages.length, status = "ok") {
  return async () => ({
    status,
    pages: status === "ok" ? pages : [],
    pageCount,
    extractorVersion: status === "ok" ? "pdftotext-bounded-v1" : null,
    detail: status === "ok" ? null : "extractor detail",
  });
}

function allowedRobots(overrides = {}) {
  return {
    status: "allowed",
    origin: "https://keskkonnaportaal.ee",
    checkedAt: FETCHED_AT,
    ...overrides,
  };
}

async function hydrate(overrides = {}) {
  return hydrateCorpusPdfSource(PDF_URL, {
    observedAt: FETCHED_AT,
    robotsObservation: allowedRobots(),
    requestBytes: bytesResponse(),
    extractPages: extraction([
      { pageNumber: 1, text: PAGE_ONE },
      { pageNumber: 2, text: PAGE_TWO },
    ]),
    ...overrides,
  });
}

function rowFrom(result) {
  return {
    id: 91,
    title: "Statistiline metsainventuur 2024",
    canonical_url: result.document.url,
    source_key: "official-page-hydration",
    source_tier: "official",
    category: "Statistika",
    organization: "Keskkonnaagentuur",
    published_at: "2024-12-31",
    content_hash: result.document.contentHash,
    fetched_at: result.document.observedAt,
    content: result.document.content,
    summary: "",
    metadata: result.document.metadata,
  };
}

test("a complete PDF hydration binds bytes, policy and page locators", async () => {
  const result = await hydrate();
  assert.equal(result.status, "indexed");
  assert.equal(result.document.content, `${PAGE_ONE} ${PAGE_TWO}`);
  assert.equal(result.document.retained, true);
  assert.equal(result.pageCount, 2);
  const policy = result.document.metadata.source_policy;
  assert.equal(policy.version, "source-policy-v1");
  assert.equal(policy.contentKind, "fetched-pdf");
  assert.equal(policy.observations.bodyHashPresent, true);
  assert.equal(policy.use.answerEvidence, true);
  assert.deepEqual(result.document.pdf, {
    pageCount: 2,
    indexedPages: 2,
    complete: true,
    extractorVersion: "pdftotext-bounded-v1",
    retained: true,
  });

  const item = publicSearchItem(rowFrom(result), true);
  assert.equal(item.evidencePolicy, "versioned");
  assert.equal(item._answerEvidenceEligible, true);
  assert.deepEqual(item._pdfIndex, { pageCount: 2, indexedPages: 2, complete: true });
  assert.equal(item._pageLocators.length, 2);
  assert.equal(item._pageLocators[0].pageNumber, 1);
  assert.equal(item.content.slice(item._pageLocators[0].start, item._pageLocators[0].end), PAGE_ONE);
  assert.equal(item.content.slice(item._pageLocators[1].start, item._pageLocators[1].end), PAGE_TWO);
  assert.match(String(item._sourcePolicyBinding || ""), /^source-policy-v1:[a-f0-9]{64}$/u);
});

test("a disallowed source is never fetched", async () => {
  let fetched = 0;
  const result = await hydrate({
    robotsObservation: allowedRobots({ status: "disallowed" }),
    requestBytes: async () => {
      fetched += 1;
      return bytesResponse()();
    },
  });
  assert.equal(result.status, "denied");
  assert.equal(result.document, null);
  assert.equal(result.policy, null);
  assert.equal(fetched, 0, "the robots gate settles before any request");
});

test("a page-limited extraction is not stored as a document", async () => {
  const result = await hydrate({
    extractPages: extraction([], 900, "too-many-pages"),
  });
  assert.equal(result.status, "too-many-pages");
  assert.equal(result.document, null);
  assert.equal(result.policy, null);
  assert.equal(result.pageCount, 900);
});

test("a textless extraction is not stored as a document", async () => {
  const result = await hydrate({
    extractPages: extraction([{ pageNumber: 1, text: "   " }], 1),
  });
  assert.equal(result.status, "textless");
  assert.equal(result.document, null);
});

test("an encrypted PDF keeps its bytes out of the index", async () => {
  const result = await hydrate({ extractPages: extraction([], 4, "encrypted") });
  assert.equal(result.status, "encrypted");
  assert.equal(result.document, null);
  assert.equal(result.policy, null);
});

test("noarchive binds the bytes but keeps no copy of the body", async () => {
  const result = await hydrate({
    requestBytes: bytesResponse({
      headers: { "content-type": "application/pdf", "x-robots-tag": ["noarchive"] },
    }),
  });
  assert.equal(result.status, "indexed");
  assert.equal(result.document.retained, false);
  assert.equal(result.document.content, "");
  assert.deepEqual(result.document.pageLocators, []);
  assert.equal(result.document.metadata.page_locators.length, 0);
  assert.equal(result.document.metadata.source_policy.use.retainBody, false);
  assert.equal(result.document.metadata.source_policy.use.answerEvidence, true);

  const item = publicSearchItem(rowFrom(result), true);
  assert.equal(item.content, "");
  assert.equal(item._answerEvidenceEligible, false);
  assert.equal(item.url, PDF_URL);
  assert.equal(item.title, "Statistiline metsainventuur 2024");
});

test("a non PDF response is refused before extraction", async () => {
  let extracted = 0;
  const result = await hydrate({
    requestBytes: bytesResponse({ headers: { "content-type": "text/html; charset=utf-8" } }),
    extractPages: async () => {
      extracted += 1;
      return extraction([])();
    },
  });
  assert.equal(result.status, "unsupported-content-type");
  assert.equal(result.document, null);
  assert.equal(extracted, 0, "the declared type is refused before a converter runs");
});

test("a redirect to another resource is not promoted under the PDF row", async () => {
  const result = await hydrate({
    requestBytes: bytesResponse({ url: "https://keskkonnaportaal.ee/et/teine-fail.pdf" }),
  });
  assert.equal(result.status, "resource-changed");
  assert.equal(result.document, null);
});
