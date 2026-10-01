import assert from "node:assert/strict";
import test from "node:test";
import {
  SEARCH_DOCUMENTS,
  assessEvidence,
  buildDiscoveryQueries,
  buildDiscoveryQuery,
  queryTerms,
} from "../server/search.mjs";
import {
  buildPrefixTsQuery,
  corpusRankingTerms,
} from "../server/corpus.mjs";

// Generic polite question framing ("palun selgita", "sooviksin teada",
// "mind huvitab") must not change retrieval: the framing words carry no
// topic, and the topic roots must match the plain question exactly.
const SUBJECTS = [
  {
    topic: "ringmajandus",
    plain: ["ringmajandus"],
    framed: [
      "Palun selgita ringmajandust",
      "Sooviksin teada ringmajandusest",
      "Mind huvitab ringmajandus",
    ],
    documentId: "circular-economy-guidance",
  },
  {
    topic: "waste sorting",
    plain: ["Jäätmete sorteerimine"],
    framed: [
      "Palun selgita jäätmete sorteerimist",
      "Sooviksin teada jäätmete sorteerimisest",
      "Mind huvitab jäätmete sorteerimine",
    ],
    documentId: "waste-sorting-guidance",
  },
  {
    topic: "kaevanduse korrastamine",
    plain: ["Kaevanduse korrastamine"],
    framed: [
      "Palun selgita kaevanduse korrastamist",
      "Sooviksin teada kaevanduse korrastamisest",
      "Mind huvitab kaevanduse korrastamine",
    ],
    documentId: "mined-land-restoration",
  },
];

const FRAMING_WORDS = ["selgita", "selgitage", "sooviksin", "teada", "mind", "huvitab"];

function withEstonianOnly(fn) {
  const previous = process.env.MULTILINGUAL_SEARCH_ENABLED;
  delete process.env.MULTILINGUAL_SEARCH_ENABLED;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.MULTILINGUAL_SEARCH_ENABLED;
    else process.env.MULTILINGUAL_SEARCH_ENABLED = previous;
  }
}

function scored(document) {
  return { ...document, score: 12 };
}

for (const subject of SUBJECTS) {
  test(`framing adds no query roots: ${subject.topic}`, () => {
    const plainRoots = new Set(subject.plain.flatMap((query) => queryTerms(query)));
    assert.ok(plainRoots.size > 0);
    for (const query of subject.framed) {
      const roots = queryTerms(query);
      for (const word of FRAMING_WORDS) {
        assert.ok(!roots.includes(word), `${query} keeps framing root ${word}: ${roots}`);
      }
      assert.deepEqual(
        [...new Set(roots)].sort(),
        [...plainRoots].sort(),
        `${query} roots differ from plain`,
      );
    }
  });

  test(`framed evidence stays strong on the reviewed passage: ${subject.topic}`, () => {
    const document = SEARCH_DOCUMENTS.find((entry) => entry.id === subject.documentId);
    assert.ok(document, `missing reviewed document ${subject.documentId}`);
    const candidates = [scored(document)];
    for (const query of [...subject.plain, ...subject.framed]) {
      const assessment = assessEvidence(query, candidates);
      assert.equal(assessment.strong, true, `${query}: ${JSON.stringify(assessment)}`);
      assert.equal(assessment.directDocumentId, subject.documentId, query);
    }
  });

  test(`framed discovery keeps the topic and drops framing: ${subject.topic}`, () => {
    for (const query of subject.framed) {
      const discovery = buildDiscoveryQuery(query);
      const normalized = discovery.toLocaleLowerCase("et");
      assert.ok(!normalized.includes("märgalad"), `${query} leaks wetlands: ${discovery}`);
      for (const word of ["selgita", "sooviksin", "teada", "mind", "huvitab"]) {
        assert.ok(!normalized.split(/\s+/u).includes(word), `${query} keeps ${word}: ${discovery}`);
      }
      assert.ok(discovery.length > 0, `${query} loses the whole topic`);
    }
  });

  test(`framed corpus prefix ignores polite wording: ${subject.topic}`, () => {
    const plainPrefix = buildPrefixTsQuery(subject.plain[0]);
    for (const query of subject.framed) {
      const prefix = buildPrefixTsQuery(query);
      const terms = corpusRankingTerms(query);
      for (const word of ["selgita", "sooviksin", "teada", "mind", "huvitab", "palun"]) {
        assert.ok(!terms.includes(word), `${query} keeps ${word} in corpus terms`);
      }
      assert.ok(prefix.length > 0, `${query} loses the whole corpus topic`);
    }
    assert.ok(plainPrefix.length > 0);
  });
}

test("inflected ringmajandus canonicalizes to the same root", () => {
  assert.ok(queryTerms("Palun selgita ringmajandust").includes("ringmajandus"));
  assert.deepEqual(
    [...new Set(queryTerms("Palun selgita ringmajandust"))].sort(),
    [...new Set(queryTerms("ringmajandus"))].sort(),
  );
  assert.equal(buildPrefixTsQuery("Palun selgita ringmajandust"), buildPrefixTsQuery("ringmajandus"));
});

test("framing never invents wetlands, but a real soo still maps there", () => {
  assert.ok(!buildDiscoveryQuery("Sooviksin teada jäätmete sorteerimisest").includes("märgalad"));
  assert.ok(!queryTerms("Sooviksin teada ringmajandusest").includes("margala"));
  assert.ok(queryTerms("Eesti soode pindala").includes("margala"));
  assert.ok(buildDiscoveryQuery("Eesti soode pindala").includes("märgalad"));
  assert.ok(buildDiscoveryQuery("soo kaitse").includes("märgalad"));
});

test("polite framing does not loosen privacy, language, or grounding gates", () => {
  withEstonianOnly(() => {
    // A private-person lookup stays blocked even when politely framed.
    assert.deepEqual(buildDiscoveryQueries("Palun selgita Jaan Tamme erametsa pindala"), []);
    assert.deepEqual(buildDiscoveryQueries("Sooviksin teada Jaan Tamme erametsa pindala"), []);
    // Russian queries stay without results while Estonian-only mode is on.
    assert.deepEqual(buildDiscoveryQueries("Sooviksin teada переработка отходов"), []);
  });
  // A supported question with framing still needs its requested topic.
  const unrelated = [{ ...SEARCH_DOCUMENTS.find((entry) => entry.id === "waste-sorting-guidance"), score: 12 }];
  const offTopic = assessEvidence("Palun selgita ringmajandust", unrelated);
  assert.equal(offTopic.strong, false);
  assert.equal(offTopic.directDocumentId, null);
  // A requested year missing from the passage still blocks grounding.
  const circular = [{ ...SEARCH_DOCUMENTS.find((entry) => entry.id === "circular-economy-guidance"), score: 12 }];
  const yearMismatch = assessEvidence("Palun selgita ringmajandust 2010. aastal", circular);
  assert.equal(yearMismatch.yearsCovered, false);
  assert.equal(yearMismatch.strong, false);
});
