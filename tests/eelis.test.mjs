import assert from "node:assert/strict";
import test from "node:test";
import {
  composeEelisEmajogiPublicWatercourseResponse,
  composeEelisNaturaSiteResponse,
  EELIS_EMAJOGI_CODE,
  EELIS_EMAJOGI_PUBLIC_WATERCOURSE_WFS_URL,
  eelisEmajogiPublicWatercourseFromGeoJson,
  EELIS_NATURA_API_URL,
  EELIS_NATURA_SITES,
  eelisNaturaSiteFromJson,
  eelisNaturaSiteQueryUrl,
  isEelisEmajogiPublicWatercourseQuery,
  isEelisNaturaSiteQuery,
} from "../server/eelis.mjs";
import { loadStructuredIndicatorDocuments } from "../server/indicators.mjs";
import { searchEnvironmentLive } from "../server/pipeline.mjs";
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

function naturaFixture(overrides = {}) {
  return JSON.stringify([{
    kood: "EE0010173",
    nimi: "Lahemaa loodusala",
    tyyp: "7",
    tyyp_selg: "Natura (loodusala)",
    kkr_kood: "RAH0000601",
    pindala_maa: 47118.84,
    pindala_vesi: 673.74,
    pindala_meri: 26991.51,
    muut_aeg: "2025-09-04T10:35:04.741207",
    keht_staatus: "Kehtiv",
    ...overrides,
  }]);
}

test("EELIS adapter binds the fixed Emajõgi WFS identity and public-use fields", () => {
  const query = "Kas Emajõgi on avalikult kasutatav veekogu?";
  assert.equal(isEelisEmajogiPublicWatercourseQuery(query), true);
  assert.equal(isEelisEmajogiPublicWatercourseQuery("Kas Emajõgi on avalik vooluveekogu?"), true);
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

test("named Natura adapter resolves a curated identity and cites the exact EELIS row", () => {
  const query = "Kas Lahemaa loodusala on Natura ala?";
  assert.equal(EELIS_NATURA_SITES.length, 6);
  assert.equal(isEelisNaturaSiteQuery(query), true);
  const url = new URL(eelisNaturaSiteQueryUrl(query));
  assert.equal(`${url.origin}${url.pathname}`, EELIS_NATURA_API_URL);
  assert.equal(url.searchParams.get("nimi"), "eq.Lahemaa loodusala");
  assert.equal(url.searchParams.get("limit"), "2");
  assert.equal(url.toString().includes(query), false);

  const [document] = eelisNaturaSiteFromJson(query, naturaFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.equal(document?.id, "eelis-natura-site");
  assert.equal(document?.url, eelisNaturaSiteQueryUrl(query));
  assert.equal(document?._eelisNaturaSite.euCode, "EE0010173");
  assert.equal(document?._eelisNaturaSite.kkrCode, "RAH0000601");
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);
  assert.match(document?.summary || "", /47\s?118,84 ha[\s\S]*673,74 ha[\s\S]*26\s?991,51 ha/u);

  const response = composeEelisNaturaSiteResponse(query, [document], { now: NOW });
  assert.match(response?.answer.title || "", /Lahemaa loodusala[\s\S]*Natura \(loodusala\)/u);
  assert.deepEqual(response?.answer.introCitations, [1]);
  assert.match(response?.answer.note || "", /mitte[\s\S]*tegevusloa[\s\S]*eramaale juurdepääsu/u);
  assert.equal(response?.sources[0].url, eelisNaturaSiteQueryUrl(query));
});

test("named Natura adapter accepts six reviewed sites and rejects ambiguous, legal or malformed claims", () => {
  for (const site of EELIS_NATURA_SITES) {
    const query = `Kas ${site.name} on Natura loodusala?`;
    assert.equal(isEelisNaturaSiteQuery(query), true, query);
    assert.equal(new URL(eelisNaturaSiteQueryUrl(query)).searchParams.get("nimi"), `eq.${site.name}`);
    const [document] = eelisNaturaSiteFromJson(query, naturaFixture({
      kood: site.euCode,
      nimi: site.name,
      kkr_kood: site.kkrCode,
    }), { now: NOW, fetchedAt: FETCHED_AT });
    assert.equal(document?._eelisNaturaSite.euCode, site.euCode, query);
    assert.equal(document?._eelisNaturaSite.kkrCode, site.kkrCode, query);
  }
  for (const query of [
    "Kas Soomaa loodusala on Natura 2000 ala?",
    "Kas Otepää loodusala kuulub Natura 2000 võrgustikku?",
  ]) assert.equal(isEelisNaturaSiteQuery(query), true, query);
  for (const query of [
    "Kas Lahemaal tohib telkida?",
    "Kas Lahemaa loodusala oli Natura ala 2024. aastal?",
    "Kas Lahemaa loodusala oli Natura ala 2000. aastal?",
    "Kas Lahemaa loodusala oli Natura ala 2000?",
    "Lahemaa loodusala staatus 2000",
    "Was Lahemaa Natura status valid in 2000?",
    "Kas Lahemaa linnuala on Natura ala?",
    "Kas Lahemaa ja Matsalu loodusalad on Natura alad?",
    "Kas tundmatu loodusala on Natura ala?",
  ]) assert.equal(isEelisNaturaSiteQuery(query), false, query);

  const query = "Kas Lahemaa loodusala on Natura ala?";
  for (const body of [
    "not json",
    "[]",
    JSON.stringify([JSON.parse(naturaFixture())[0], JSON.parse(naturaFixture())[0]]),
    naturaFixture({ kood: "EE0000000" }),
    naturaFixture({ nimi: "Matsalu loodusala" }),
    naturaFixture({ tyyp: "6" }),
    naturaFixture({ tyyp_selg: "Natura (linnuala)" }),
    naturaFixture({ kkr_kood: "RAH0000000" }),
    naturaFixture({ keht_staatus: "Kehtetu" }),
    naturaFixture({ pindala_maa: -1 }),
    naturaFixture({ pindala_vesi: "673.74" }),
    naturaFixture({ pindala_meri: 5_000_001 }),
    naturaFixture({ muut_aeg: "2025-02-31T10:00:00" }),
    naturaFixture({ extra: true }),
  ]) assert.deepEqual(eelisNaturaSiteFromJson(query, body, { now: NOW, fetchedAt: FETCHED_AT }), []);
  assert.deepEqual(eelisNaturaSiteFromJson(query, naturaFixture(), {
    now: NOW,
    fetchedAt: NOW - 61 * 60_000,
  }), []);
  assert.deepEqual(eelisNaturaSiteFromJson(query, "x".repeat(32_001), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  }), []);
});

test("named Natura adapter rejects future record-change timestamps at ingestion and composition", () => {
  const query = "Kas Lahemaa loodusala on Natura ala?";
  const farFuture = "2099-01-01T00:00:00";
  assert.deepEqual(eelisNaturaSiteFromJson(query, naturaFixture({ muut_aeg: farFuture }), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  }), []);

  const localClockAtUtcPlusThree = new Date(NOW + 3 * 60 * 60_000).toISOString().slice(0, 19);
  assert.equal(eelisNaturaSiteFromJson(query, naturaFixture({
    muut_aeg: localClockAtUtcPlusThree,
  }), { now: NOW, fetchedAt: FETCHED_AT }).length, 1);
  assert.equal(eelisNaturaSiteFromJson(query, naturaFixture({
    muut_aeg: "2001-01-01T00:00:00",
  }), { now: NOW, fetchedAt: FETCHED_AT }).length, 1);

  const [document] = eelisNaturaSiteFromJson(query, naturaFixture(), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  const tampered = structuredClone(document);
  const originalChangedAt = tampered._eelisNaturaSite.recordChangedAt;
  tampered._eelisNaturaSite.recordChangedAt = farFuture;
  tampered.published = farFuture.slice(0, 10);
  tampered.content = tampered.content.replace(originalChangedAt, farFuture);
  assert.equal(composeEelisNaturaSiteResponse(query, [tampered], { now: NOW }), null);
});

test("structured loader requests only the resolved Natura row", async () => {
  const query = "Kas Lahemaa loodusala on Natura ala?";
  let calls = 0;
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPostgrestDataset: async (url, options) => {
      calls += 1;
      assert.equal(url, eelisNaturaSiteQueryUrl(query));
      assert.equal(options.staleMs, 0);
      assert.equal(options.maximumBytes, 32_000);
      return { body: naturaFixture(), fetchedAt: FETCHED_AT, stale: false };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(documents.map((document) => document.id), ["eelis-natura-site"]);
});

test("production pipeline keeps a named Natura answer bound to its visible exact EELIS row", async () => {
  const query = "Kas Matsalu loodusala on Natura loodusala?";
  const [document] = eelisNaturaSiteFromJson(query, naturaFixture({
    kood: "EE0040501",
    nimi: "Matsalu loodusala",
    kkr_kood: "RAH0000694",
  }), { now: NOW, fetchedAt: FETCHED_AT });
  const response = await searchEnvironmentLive(query, {
    startedAt: NOW,
    deadlineAt: NOW + 1_000,
    useCache: false,
    searchResults: { items: [document], total: 1 },
  });
  assert.match(response.answer.title, /Matsalu loodusala[\s\S]*Natura \(loodusala\)/u);
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.deepEqual(response.sources.map((source) => source.id), ["eelis-natura-site"]);
  assert.equal(response.sources[0].url, eelisNaturaSiteQueryUrl(query));
});
