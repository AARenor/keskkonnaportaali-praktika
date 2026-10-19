import assert from "node:assert/strict";
import test from "node:test";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { searchEnvironmentLive, draftMatchesListingAndFilters } from "../server/pipeline.mjs";
import { buildEvidencePack, isEvidencePack } from "../server/evidence-pack.mjs";
import { sourceIsLinkedToVisibleService } from "../server/source-identity.mjs";
import {
  cadastreSourceDocuments,
  composeCadastreAnswer,
  extractCadastreNumber,
  fetchFeatureCollection,
  normalizeSpatialState,
} from "../server/cadastre.mjs";

test("cadastre intent accepts only a canonical cadastral number", () => {
  assert.equal(extractCadastreNumber("Vaata 78404:409:0113 metsa"), "78404:409:0113");
  assert.equal(extractCadastreNumber("78404:409:011'3"), null);
  assert.equal(extractCadastreNumber("78404:409:0113x"), null);
});

test("official WFS retrieval stays on the approved public HTTPS transport", async () => {
  const url = "https://gsavalik.envir.ee/geoserver/eelis/ows?service=WFS";
  let observed;
  const features = await fetchFeatureCollection(url, 1_000, undefined, async (requestedUrl, options) => {
    observed = { requestedUrl, options };
    return {
      status: 200,
      body: JSON.stringify({ type: "FeatureCollection", features: [] }),
    };
  });

  assert.deepEqual(features, []);
  assert.equal(observed.requestedUrl, url);
  assert.equal(observed.options.approvedOrigins.has("https://gsavalik.envir.ee"), true);
  assert.equal(observed.options.maximumBytes, 3_000_000);
  assert.equal(observed.options.maximumRedirects, 0);
  assert.match(observed.options.headers.Accept, /application\/geo\+json/u);
  assert.equal(observed.options.signal instanceof AbortSignal, true);
});

test("official spatial answer distinguishes found, not found and unavailable states", () => {
  const result = composeCadastreAnswer("78404:409:0113", "78404:409:0113", {
    extractedAt: "2026-08-16T12:00:00.000Z",
    cadastre: {
      status: "found",
      areaHectares: 21.65,
      address: "Kadaka pst 159",
      municipality: "Tallinn",
      county: "Harju maakond",
      intendedUse: "MAATULUNDUSMAA",
    },
    forest: {
      status: "not_found",
      count: 0,
    },
  });

  assert.match(result.answer.intro, /21,65 ha/);
  assert.match(result.answer.parts[0].text, /ei tõenda, et kinnistul metsa ei ole/);
  assert.equal(result.evidence.states.cadastre, "found");
  assert.equal(result.evidence.states.forest, "not_found");
  assert.ok(result.sources.every((source) => new URL(source.url).protocol === "https:"));
  assert.doesNotMatch(JSON.stringify(result), /Terrapoint|Qdrant|PostgreSQL/i);
});

test("official spatial outage never becomes an absence claim", () => {
  const result = composeCadastreAnswer("78404:409:0113", "78404:409:0113", {
    extractedAt: "2026-08-16T12:00:00.000Z",
    cadastre: { status: "unavailable" },
    forest: { status: "unavailable" },
  });
  assert.match(result.answer.intro, /ei saa järeldada/);
  assert.match(result.answer.parts[0].text, /ei tähenda/);
});

test("invalid WFS payload degrades only that source to unavailable", () => {
  const malformedCadastre = [{ properties: { tunnus: "00000:000:0000", pindala: 1000 } }];
  const validForest = [{ properties: { id: "stand-1", katastri_nr: "78404:409:0113", pindala: 1.2, invent_kp: "2024-01-01" } }];
  assert.deepEqual(normalizeSpatialState("cadastre", malformedCadastre, "78404:409:0113"), { status: "unavailable" });
  assert.equal(normalizeSpatialState("forest", validForest, "78404:409:0113").status, "found");
});

test("cadastre extract is explicitly informational and unofficial", () => {
  const result = composeCadastreAnswer("78404:409:0113", "78404:409:0113", {
    extractedAt: "2026-08-16T12:00:00.000Z",
    cadastre: { status: "not_found" },
    forest: { status: "unavailable" },
  });
  assert.match(`${result.answer.intro} ${result.answer.note}`, /informatiivne/iu);
  assert.match(result.answer.note, /mitteametlik/iu);
  assert.ok(result.sources.every((source) => source.type === "Avalik ruumiandmeteenus"));
});

test("actual typed spatial pipeline publishes found and outage snapshots without admitting detached capabilities", async (t) => {
  const listing = { items: cadastreSourceDocuments(), total: 2 };
  const requests = [];
  let failing = false;
  t.mock.method(https, "request", (url, options, receive) => {
    requests.push({ url: String(url), options });
    const request = new EventEmitter();
    request.destroy = (error) => queueMicrotask(() => request.emit("error", error));
    request.end = () => queueMicrotask(() => {
      if (failing) {
        request.emit("error", new Error("fixture upstream unavailable"));
        return;
      }
      const target = new URL(url);
      const cadastreNumber = target.searchParams.get("CQL_FILTER").match(/\d{5}:\d{3}:\d{4}/u)[0];
      const features = target.pathname.includes("/kataster/")
        ? [{ properties: { tunnus: cadastreNumber, pindala: 10_000, l_aadress: "Näidisala", siht1: "MAATULUNDUSMAA" } }]
        : [{ properties: { id: "fixture-stand", katastri_nr: cadastreNumber, pindala: 1.2, invent_kp: "2024-01-01" } }];
      const response = new EventEmitter();
      response.statusCode = 200;
      response.headers = { "content-type": "application/json" };
      receive(response);
      response.emit("data", Buffer.from(JSON.stringify({ type: "FeatureCollection", features })));
      response.emit("end");
    });
    return request;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });

  for (const scenario of ["found", "unavailable"]) {
    failing = scenario === "unavailable";
    const number = failing ? "78404:409:0912" : "78404:409:0911";
    let recorded;
    let modelCalls = 0;
    const response = await searchEnvironmentLive(`Katastriüksuse ${number} metsa andmed`, {
      useCache: false,
      searchResults: listing,
      startedAt: Date.now(),
      deadlineAt: Date.now() + 3_000,
      generateAnswer() { modelCalls += 1; throw new Error("typed snapshots must not call the model"); },
      recordSearch(record) { recorded = record; },
    });
    assert.equal(modelCalls, 0);
    assert.ok(recorded);
    assert.equal(recorded.answerProvider, "deterministic-current-evidence");
    assert.equal(recorded.answerStatus, "not-applicable");
    assert.equal(recorded.attempt.reason, "not-applicable");
    assert.ok(response.answer.introCitations.length);
    assert.equal(response.sources.length, 2);
    assert.doesNotMatch(JSON.stringify(response), /_visibleServiceWitness|sourceEvidencePack|fetchUrl|fixture upstream/u);
    if (failing) {
      assert.match(response.answer.intro, /ei saa järeldada/iu);
      assert.match(response.answer.parts.map((part) => part.text).join(" "), /ei tähenda/iu);
    } else {
      assert.match(response.answer.intro, /1 ha/u);
      assert.match(response.answer.parts.map((part) => part.text).join(" "), /1,2 ha/u);
    }
  }
  assert.equal(requests.length, 4);
  assert.ok(requests.every(({ url, options }) => new URL(url).origin === "https://gsavalik.envir.ee"
    && options.signal instanceof AbortSignal && typeof options.lookup === "function"));

  const snapshot = composeCadastreAnswer("78404:409:0913", "78404:409:0913", {
    extractedAt: new Date().toISOString(),
    cadastre: { status: "found", areaHectares: 1, address: "Näidisala" },
    forest: { status: "not_found", count: 0 },
  });
  assert.ok(snapshot.sources.every((source) => typeof source.fetchUrl === "string"));
  assert.ok(draftMatchesListingAndFilters(snapshot, listing));
  const pack = buildEvidencePack({ sources: snapshot.sources, query: snapshot.query });
  assert.ok(isEvidencePack(pack));
  const detached = structuredClone(snapshot);
  assert.ok(detached.sources.every((source) => !sourceIsLinkedToVisibleService(source, listing.items)));
  assert.equal(draftMatchesListingAndFilters(detached, listing), false);
  assert.equal(isEvidencePack(structuredClone(pack)), false);
});
