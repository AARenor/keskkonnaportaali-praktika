import assert from "node:assert/strict";
import test from "node:test";
import {
  composeEelisEmajogiPublicWatercourseResponse,
  EELIS_EMAJOGI_CODE,
  EELIS_EMAJOGI_PUBLIC_WATERCOURSE_WFS_URL,
  eelisEmajogiPublicWatercourseFromGeoJson,
  isEelisEmajogiPublicWatercourseQuery,
} from "../server/eelis.mjs";
import { loadStructuredIndicatorDocuments } from "../server/indicators.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";

const NOW = Date.parse("2026-08-21T23:45:00Z");
const FETCHED_AT = Date.parse("2026-08-21T23:44:30Z");

function eelisFixture(overrides = {}) {
  const properties = {
    sys_id: 44,
    versioon: 1720477283496,
    kkr_kood: EELIS_EMAJOGI_CODE,
    nimi: "Emajõgi",
    avalik: "Jah",
    avalik_kas: "Avalik",
    markus: "",
    ...(overrides.properties || {}),
  };
  return JSON.stringify({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: "avalikud_vooluveekogud.46",
      geometry: null,
      properties,
      ...(overrides.feature || {}),
    }],
    totalFeatures: 1,
    numberMatched: 1,
    numberReturned: 1,
    timeStamp: "2026-08-21T23:44:29.000Z",
    crs: null,
    ...overrides.collection,
  });
}

test("EELIS adapter binds the fixed Emajõgi WFS identity and public-use fields", () => {
  const query = "Kas Emajõgi on avalikult kasutatav veekogu?";
  assert.equal(isEelisEmajogiPublicWatercourseQuery(query), true);
  const url = new URL(EELIS_EMAJOGI_PUBLIC_WATERCOURSE_WFS_URL);
  assert.equal(url.origin + url.pathname, "https://gsavalik.envir.ee/geoserver/eelis/ows");
  assert.equal(url.searchParams.get("service"), "WFS");
  assert.equal(url.searchParams.get("version"), "2.0.0");
  assert.equal(url.searchParams.get("typeNames"), "eelis:avalikud_vooluveekogud");
  assert.equal(url.searchParams.get("CQL_FILTER"), "kkr_kood='VEE1023600'");
  assert.equal(url.searchParams.get("count"), "2");
  assert.equal(url.toString().includes(query), false);

  const [document] = eelisEmajogiPublicWatercourseFromGeoJson(query, eelisFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.ok(document);
  assert.equal(document.url, EELIS_EMAJOGI_PUBLIC_WATERCOURSE_WFS_URL);
  assert.equal(document._eelisPublicWatercourse.code, "VEE1023600");
  assert.equal(document._eelisPublicWatercourse.publicFlag, "Jah");
  assert.equal(document._eelisPublicWatercourse.publicUse, "Avalik");
  assert.equal(document._eelisPublicWatercourse.fetchedAt, "2026-08-21T23:44:30.000Z");
  assert.match(document.locator, /keskkonnaportaal\.ee\/et\/avaandmed\/geoserver/u);
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);

  const response = composeEelisEmajogiPublicWatercourseResponse(query, [document], { now: NOW });
  assert.match(response.answer.title, /Emajõgi[\s\S]*avalik „Jah”[\s\S]*avalik kasutus „Avalik”/u);
  assert.match(response.answer.intro, /^EELISe avaliku WFS-i informatiivses Emajõe kirjes \(VEE1023600\) on välja „avalik” väärtus „Jah” ja välja „avalik_kas” väärtus „Avalik”/u);
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.match(response.answer.note, /mitte individuaalne õigusnõu[\s\S]*eramaa[\s\S]*kalastada/u);
  assert.equal(response.sources.length, 1);
  assert.match(response.sources[0].evidenceExcerpt, /versioonivälja ei käsitleta kuupäevana[\s\S]*CC BY 4\.0/u);
  assert.equal(response.evidence.kind, "structured-eelis-public-watercourse");
});

test("EELIS adapter rejects legal-access, historical and non-Emajõgi questions", () => {
  for (const query of [
    "Kas ma tohin üle eramaa Emajõe äärde minna?",
    "Kas Emajõgi on avalik veekogu ning tähendab see, et tohin mööda kallast kõndida?",
    "Emajõgi on avalik veekogu — kas võiksin sealt eramaalt ligi pääseda?",
    "Kas Emajõel tohib paadiga sõita?",
    "Kas Emajõgi oli 2024. aastal avalik veekogu?",
    "Kas Pirita jõgi on avalik veekogu?",
    "Kas Emajõgi on veekogu?",
  ]) assert.equal(isEelisEmajogiPublicWatercourseQuery(query), false, query);
});

test("EELIS GeoJSON schema, cardinality, status and fetch freshness fail closed", () => {
  const query = "Kas Emajõgi on avalik veekogu?";
  const invalidBodies = [
    "not json",
    eelisFixture({ collection: { type: "Feature" } }),
    eelisFixture({ collection: { numberReturned: 0 } }),
    eelisFixture({ collection: { numberMatched: 2, totalFeatures: 2 } }),
    eelisFixture({ collection: { features: [] } }),
    eelisFixture({ feature: { geometry: { type: "Point", coordinates: [0, 0] } } }),
    eelisFixture({ feature: { id: "other.1" } }),
    eelisFixture({ properties: { kkr_kood: "VEE0000000" } }),
    eelisFixture({ properties: { nimi: "Pirita jõgi" } }),
    eelisFixture({ properties: { avalik: "Ei" } }),
    eelisFixture({ properties: { avalik_kas: "Mitteavalik" } }),
    eelisFixture({ properties: { sys_id: "44" } }),
    eelisFixture({ properties: { versioon: "1720477283496" } }),
    eelisFixture({ properties: { extra: "unexpected" } }),
    eelisFixture({ properties: { markus: "Käsitsi ülevaatust vajav märkus" } }),
    eelisFixture({ properties: { markus: "x".repeat(501) } }),
    eelisFixture({ collection: { timeStamp: "not-a-date" } }),
    eelisFixture({ collection: { timeStamp: "2026-08-21T20:00:00.000Z" } }),
  ];
  for (const body of invalidBodies) {
    assert.deepEqual(eelisEmajogiPublicWatercourseFromGeoJson(query, body, {
      now: NOW,
      fetchedAt: FETCHED_AT,
    }), []);
  }
  assert.deepEqual(eelisEmajogiPublicWatercourseFromGeoJson(query, eelisFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
    stale: true,
  }), []);
  assert.deepEqual(eelisEmajogiPublicWatercourseFromGeoJson(query, eelisFixture(), {
    now: NOW,
    fetchedAt: NOW - 61 * 60_000,
  }), []);
  assert.deepEqual(eelisEmajogiPublicWatercourseFromGeoJson(query, eelisFixture(), {
    now: NOW,
    fetchedAt: NOW + 6 * 60_000,
  }), []);
  for (const fetchedAt of [undefined, null, "", "not-a-timestamp"]) {
    assert.deepEqual(eelisEmajogiPublicWatercourseFromGeoJson(query, eelisFixture(), {
      now: NOW,
      fetchedAt,
    }), []);
  }
  assert.deepEqual(eelisEmajogiPublicWatercourseFromGeoJson(
    query,
    "x".repeat(64_001),
    { now: NOW, fetchedAt: FETCHED_AT },
  ), []);
});

test("structured loader calls only the fixed EELIS WFS route for the exact classification intent", async () => {
  const query = "Kas Emajõgi on avalik veekogu?";
  let calls = 0;
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchGeoJsonDataset: async (url) => {
      calls += 1;
      assert.equal(url, EELIS_EMAJOGI_PUBLIC_WATERCOURSE_WFS_URL);
      return { body: eelisFixture(), fetchedAt: FETCHED_AT, stale: false };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(documents.map((document) => document.id), ["eelis-emajogi-public-watercourse"]);

  const rejected = await loadStructuredIndicatorDocuments("Kas ma tohin üle eramaa Emajõe äärde minna?", {
    now: NOW,
    fetchGeoJsonDataset: async () => {
      throw new Error("must not fetch");
    },
  });
  assert.deepEqual(rejected, []);

  const rejectedCompound = await loadStructuredIndicatorDocuments(
    "Kas Emajõgi on avalik veekogu ning tähendab see, et tohin mööda kallast kõndida?",
    {
      now: NOW,
      fetchGeoJsonDataset: async () => {
        throw new Error("must not fetch");
      },
    },
  );
  assert.deepEqual(rejectedCompound, []);
});
