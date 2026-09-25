import assert from "node:assert/strict";
import test from "node:test";
import {
  officialCitationUrlEligibility,
} from "../server/citation-policy.mjs";
import {
  SEARCH_CACHE_MAX_RESPONSE_BYTES,
  restoreCachedResponse,
  sanitizeCachedResponse,
} from "../server/database.mjs";
import { publicResponse } from "../server/pipeline.mjs";
import { evidenceDocumentsFromListing } from "../server/retrieval.mjs";
import { sourceCanSupportPublicCitation } from "../server/source-registry.mjs";

function source(overrides = {}) {
  return {
    id: "official-source",
    citation: 1,
    title: "Ametlik allikas",
    organization: "Keskkonnaagentuur",
    type: "Andmed",
    url: "https://keskkonnaandmed.envir.ee/f_kliima_paev?jaam_kood=eq.AJVORU01#result",
    sourceTier: "official",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    summary: "Kontrollitud ametlik lähteandmestik.",
    ...overrides,
  };
}

function citedDraft(sources) {
  return {
    query: "kontrollitud küsimus",
    total: sources.length,
    answer: {
      eyebrow: "Kontrollitud vastus",
      title: "Kontrollitud fakt",
      intro: "Fakt pärineb ametlikust allikast.",
      introCitations: [1],
      parts: [],
      note: "Kontrolli algallikat.",
    },
    sources,
    evidence: { kind: "test", answerable: true },
  };
}

test("citation policy accepts dynamic official queries and reviewed PDF fragments", () => {
  const urls = [
    "https://keskkonnaandmed.envir.ee/f_rahvalad?nimi=eq.Lahemaa%20loodusala&limit=2",
    "https://keskkonnaandmed.envir.ee/f_kliima_paev?jaam_kood=eq.AJVORU01&aasta=eq.2025",
    "https://andmed.stat.ee/et/stat/keskkond__surve-keskkonnaseisundile__jaatmete-teke/KK610",
    "https://keskkonnaportaal.ee/sites/default/files/2026-01/SMI%20arendamine.pdf#page=22",
  ];
  for (const url of urls) assert.equal(officialCitationUrlEligibility(url).eligible, true, url);
});

test("citation policy rejects unsafe schemes, credentials, private and unapproved origins", () => {
  const urls = [
    "javascript:alert(1)",
    "http://keskkonnaportaal.ee/andmed",
    "https://user:pass@keskkonnaportaal.ee/andmed",
    "https://keskkonnaportaal.ee.evil.example/andmed",
    "https://evil.example/andmed",
    "https://127.0.0.1/andmed",
    "https://[::1]/andmed",
    "https://keskkonnaportaal.ee:8443/andmed",
    "not a URL",
    `https://keskkonnaportaal.ee/${"x".repeat(2_001)}`,
  ];
  for (const url of urls) assert.equal(officialCitationUrlEligibility(url).eligible, false, url);
});

test("public evidence excludes an otherwise eligible record from an unapproved origin", () => {
  const forged = source({ url: "https://evil.example/forged" });
  assert.equal(sourceCanSupportPublicCitation(forged).eligible, false);
  assert.deepEqual(evidenceDocumentsFromListing({ items: [forged] }), []);
  assert.equal(evidenceDocumentsFromListing({ items: [source()] }).length, 1);
});

test("public response fails closed for an invalid cited URL and drops invalid uncited URLs", () => {
  const forged = source({ url: "javascript:alert(1)" });
  const failed = publicResponse(citedDraft([forged]));
  assert.equal(failed.answer.title, "Allikaviiteid ei saanud kontrollida");
  assert.deepEqual(failed.sources, []);

  const valid = source();
  const uncitedForged = source({ id: "uncited-forged", citation: 2, url: "https://evil.example/phish" });
  const response = publicResponse(citedDraft([valid, uncitedForged]));
  assert.deepEqual(response.sources.map((item) => item.id), [valid.id]);
  assert.deepEqual(response.answer.introCitations, [1]);
});

test("public response rejects cited sources without an eligible evidence policy", () => {
  const ineligibleSources = [
    source({ evidencePolicy: "route-only", _answerEvidenceEligible: false }),
    source({ evidencePolicy: undefined, _answerEvidenceEligible: true }),
    source({ evidencePolicy: "trusted", _answerEvidenceEligible: true }),
  ];
  for (const ineligible of ineligibleSources) {
    assert.equal(sourceCanSupportPublicCitation(ineligible).eligible, false);
    assert.deepEqual(evidenceDocumentsFromListing({ items: [ineligible] }), []);
    const response = publicResponse(citedDraft([ineligible]));
    assert.equal(response.answer.title, "Allikaviiteid ei saanud kontrollida");
    assert.deepEqual(response.sources, []);
  }

  const valid = publicResponse(citedDraft([source()]));
  assert.equal(valid.answer.title, "Kontrollitud fakt");
  assert.equal(valid.sources.length, 1);

  const uncitedRouteOnly = source({
    id: "route-only-discovery",
    citation: 2,
    evidencePolicy: "route-only",
    _answerEvidenceEligible: false,
  });
  const withDiscovery = publicResponse(citedDraft([source(), uncitedRouteOnly]));
  assert.equal(withDiscovery.answer.title, "Kontrollitud fakt");
  assert.deepEqual(withDiscovery.sources.map((item) => item.citation), [1]);
});

test("public response requires citation identifiers to be actual positive JSON integers", () => {
  for (const malformed of ["1", " 1 ", ["1"], 1.5, 0, -1, null, true]) {
    const draft = citedDraft([source()]);
    draft.answer.introCitations = [malformed];
    const response = publicResponse(draft);
    assert.equal(response.answer.title, "Allikaviiteid ei saanud kontrollida", JSON.stringify(malformed));
    assert.deepEqual(response.sources, []);
  }

  const malformedSource = citedDraft([source({ citation: "1" })]);
  const response = publicResponse(malformedSource);
  assert.equal(response.answer.title, "Allikaviiteid ei saanud kontrollida");
  assert.deepEqual(response.sources, []);
});

test("privacy-safe cache round trips retain citation policy privately and revalidate freshness", () => {
  const query = "roostiku ülevaade";
  const now = Date.parse("2026-08-23T12:00:00Z");
  const candidates = [
    source(),
    source({
      evidencePolicy: "timestamped",
      retrieval: "official-structured-weather-xml",
      freshness: { class: "live", basis: "source-observed-at", maxAgeMs: 15 * 60_000, requiresSourceTimestamp: true },
      _evidenceObservedAt: "2026-08-23T11:55:00Z",
    }),
    source({
      evidencePolicy: "versioned",
      retrieval: "official-service-directory",
      freshness: { class: "reviewed", basis: "reviewed-at", maxAgeMs: 31 * 24 * 60 * 60_000, requiresSourceTimestamp: true },
      _evidenceVersion: "reviewed-v1",
      _evidenceStatusAt: "2026-08-23T00:00:00Z",
    }),
  ];

  for (const candidate of candidates) {
    const safe = sanitizeCachedResponse(citedDraft([candidate]), query);
    assert.ok(safe);
    const restored = restoreCachedResponse(safe, query);
    assert.equal(sourceCanSupportPublicCitation(restored.sources[0], { now }).eligible, true);
    const publicCached = publicResponse(restored, { now });
    assert.equal(publicCached.answer.title, "Kontrollitud fakt");
    assert.equal(publicCached.sources.length, 1);
    for (const hidden of [
      "evidencePolicy", "_answerEvidenceEligible", "freshness", "retrieval", "delivery",
      "_evidenceObservedAt", "_evidenceValidFrom", "_evidenceValidUntil", "_evidenceVersion",
      "_evidenceStatusAt", "_publishedAt",
    ]) assert.equal(hidden in publicCached.sources[0], false, hidden);
  }

  const timestamped = candidates[1];
  const stale = restoreCachedResponse(sanitizeCachedResponse(citedDraft([timestamped]), query), query);
  assert.equal(sourceCanSupportPublicCitation(stale.sources[0], { now: now + 20 * 60_000 }).eligible, false);
  assert.equal(
    publicResponse(stale, { now: now + 20 * 60_000 }).answer.title,
    "Allikaviiteid ei saanud kontrollida",
  );

  const federated = source({
    evidencePolicy: "claim-specific",
    retrieval: "official-federated-search",
    delivery: "federated-discovery",
  });
  const restoredFederated = restoreCachedResponse(
    sanitizeCachedResponse(citedDraft([federated]), query),
    query,
  );
  assert.equal(sourceCanSupportPublicCitation(restoredFederated.sources[0], { now }).eligible, false);
});

test("privacy-safe cache envelope has a total UTF-8 byte ceiling", () => {
  const oversized = citedDraft(Array.from({ length: 10 }, (_value, index) => source({
    id: `source-${index}`,
    citation: index + 1,
    title: "🌊".repeat(500),
    summary: "🌲".repeat(2_000),
    evidenceExcerpt: "🌧️".repeat(4_000),
    url: `https://keskkonnaportaal.ee/et/source-${index}`,
  })));
  oversized.answer.introCitations = [];
  oversized.answer.parts = [];
  assert.ok(Buffer.byteLength(JSON.stringify(oversized), "utf8") > SEARCH_CACHE_MAX_RESPONSE_BYTES);
  assert.equal(sanitizeCachedResponse(oversized, "roostiku ülevaade"), null);
});

test("an invalid optional action URL is omitted without suppressing a valid citation", () => {
  const response = publicResponse(citedDraft([source({
    actionUrl: "https://evil.example/action",
    actionLabel: "Ava tegevus",
  })]));
  assert.equal(response.answer.title, "Kontrollitud fakt");
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].actionUrl, undefined);
  assert.equal(response.sources[0].actionLabel, undefined);
});

function chartFor(citation) {
  return {
    kind: "line",
    title: "Test",
    unit: "%",
    series: [{ id: "a", label: "A", points: [{ x: 2020, y: 1 }, { x: 2021, y: 2 }] }],
    citation,
  };
}

test("publicResponse keeps a valid chart, remaps its citation and drops an invalid one", () => {
  const uncited = source({ id: "uncited", citation: 1, url: "https://keskkonnaportaal.ee/et/uncited" });
  const cited = source({ id: "cited", citation: 2, url: "https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM03" });
  const draft = {
    ...citedDraft([uncited, cited]),
    answer: { ...citedDraft([]).answer, introCitations: [2] },
    chart: chartFor(2),
  };
  const response = publicResponse(draft);
  assert.deepEqual(response.sources.map((item) => item.id), ["cited"]);
  assert.equal(response.chart.citation, 1);
  assert.equal(response.chart.series[0].points.length, 2);

  const chartOnly = publicResponse({ ...citedDraft([uncited, cited]), answer: { ...citedDraft([]).answer, introCitations: [1] }, chart: chartFor(2) });
  assert.deepEqual(chartOnly.sources.map((item) => item.id).sort(), ["cited", "uncited"]);
  assert.equal(chartOnly.chart.citation, chartOnly.sources.find((item) => item.id === "cited").citation);

  const invalid = publicResponse({ ...citedDraft([source()]), chart: { ...chartFor(1), kind: "pie" } });
  assert.equal(invalid.chart, undefined);
  assert.equal(invalid.answer.title, "Kontrollitud fakt");

  const unresolved = publicResponse({ ...citedDraft([source()]), chart: chartFor(9) });
  assert.equal(unresolved.chart, undefined);
});

test("publicResponse drops a chart whose source cannot support a public citation without failing the answer", () => {
  const eligible = source({ id: "eligible", citation: 1 });
  const ineligible = source({
    id: "ineligible",
    citation: 2,
    evidencePolicy: "route-only",
    _answerEvidenceEligible: false,
  });
  const draft = {
    ...citedDraft([eligible, ineligible]),
    answer: { ...citedDraft([]).answer, introCitations: [1] },
    chart: chartFor(2),
  };
  const response = publicResponse(draft);
  assert.equal(response.answer.title, "Kontrollitud fakt");
  assert.equal(response.chart, undefined);
  assert.deepEqual(response.sources.map((item) => item.id), ["eligible"]);

  const supported = publicResponse({ ...draft, chart: chartFor(1) });
  assert.equal(supported.answer.title, "Kontrollitud fakt");
  assert.equal(supported.chart.citation, 1);
});

test("cache sanitizer retains a valid chart and drops an invalid one", () => {
  // Uses a query distinct from the fixed answer title (as the other
  // sanitizeCachedResponse tests above do): the default citedDraft() query
  // "kontrollitud küsimus" shares the word "kontrollitud" with the fixed
  // answer title "Kontrollitud fakt", which trips the pre-existing
  // conservative retained-query-fragment privacy filter and makes the
  // sanitizer fail closed for reasons unrelated to the chart contract.
  const query = "roostiku ülevaade";
  const draft = { ...citedDraft([source()]), query, chart: chartFor(1) };
  const safe = sanitizeCachedResponse(draft, query);
  assert.deepEqual(safe.chart, chartFor(1));
  const restored = restoreCachedResponse(safe, query);
  assert.deepEqual(restored.chart, chartFor(1));
  const invalid = sanitizeCachedResponse({ ...draft, chart: { ...chartFor(1), citation: 7 } }, query);
  assert.equal(invalid.chart, undefined);
});
