import assert from "node:assert/strict";
import test from "node:test";
import {
  composeCurrentWeatherObservationResponse,
  composeForestHarvestBalanceAnswer,
  composeMunicipalWasteRecyclingResponse,
  composeNationalWeatherForecastResponse,
  currentWeatherObservationFromXml,
  CURRENT_WEATHER_OBSERVATIONS_XML_URL,
  forestBalanceObservations,
  forestHarvestBalanceDocumentsFromJson,
  FOREST_BALANCE_EUROSTAT_API_URL,
  isForestHarvestBalanceQuery,
  isCurrentWeatherObservationQuery,
  isLatestPublishedHydrologyQuery,
  isNationalWeatherForecastQuery,
  isMunicipalWasteRecyclingRateQuery,
  loadStructuredIndicatorDocuments,
  LATEST_HYDROLOGY_API_URL,
  LATEST_HYDROLOGY_INFO_URL,
  latestPublishedHydrologyFromJson,
  latestPublishedHydrologyQueryUrl,
  composeLatestPublishedHydrologyResponse,
  municipalWasteIndicatorFromCsv,
  MUNICIPAL_WASTE_RECYCLING_CSV_URL,
  MUNICIPAL_WASTE_RECYCLING_PAGE_URL,
  nationalWeatherForecastFromXml,
  WEATHER_FORECAST_XML_URL,
} from "../server/indicators.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";

const forestFixture = {
  id: ["freq", "stk_flow", "indic_fo", "unit", "geo", "time"],
  size: [1, 2, 1, 1, 1, 5],
  dimension: {
    freq: { category: { index: { A: 0 } } },
    stk_flow: { category: { index: { NAI: 0, RMOV: 1 } } },
    indic_fo: { category: { index: { FOR: 0 } } },
    unit: { category: { index: { THS_M3: 0 } } },
    geo: { category: { index: { EE: 0 } } },
    time: { category: { index: { 2020: 0, 2021: 1, 2022: 2, 2023: 3, 2024: 4 } } },
  },
  value: { 0: 14370.94, 2: 9100, 3: 9100, 5: 12179, 7: 12013, 8: 11564 },
  status: { 0: "i", 5: "i", 7: "e", 8: "e" },
};

const fixture = `Aasta,Measure Names,Eesti/EL õige,% Eesti (copy),% Eesti,% EL (copy),% EL
2022,Eesti,*,33.4,33.4,,
2023,Eesti,*,37.9,37.9,,
2024,Eesti,*,36.4,36.4,,
2022,Euroopa Liit (EL),,,,49.1,49.1
2023,Euroopa Liit (EL),,,,47.9,47.9
2024,Euroopa Liit (EL),,,,48.1,48.1
`;

function weatherFixture(timestamp, {
  temperature = "14.2",
  humidity = "85",
  pressure = "1008.4",
  wind = "2.5",
  windMax = "4.1",
  precipitation = "0",
  duplicate = false,
} = {}) {
  const station = `<station>
    <name>Tallinn-Harku</name><wmocode>26038</wmocode>
    <longitude>24.6028916666</longitude><latitude>59.3981222223</latitude>
    <phenomenon>Clear</phenomenon><visibility>35.0</visibility>
    <precipitations>${precipitation}</precipitations><airpressure>${pressure}</airpressure>
    <relativehumidity>${humidity}</relativehumidity><airtemperature>${temperature}</airtemperature>
    <winddirection>180</winddirection><windspeed>${wind}</windspeed><windspeedmax>${windMax}</windspeedmax>
    <waterlevel></waterlevel><waterlevel_eh2000></waterlevel_eh2000><watertemperature></watertemperature>
    <uvindex></uvindex><sunshineduration></sunshineduration><globalradiation></globalradiation>
  </station>`;
  return `<?xml version="1.0" encoding="UTF-8"?><observations timestamp="${timestamp}">${station}${duplicate ? station : ""}</observations>`;
}

function forecastFixture(startDate = "2026-08-21") {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const blocks = Array.from({ length: 4 }, (_value, index) => {
    const date = new Date(start + index * 24 * 60 * 60_000).toISOString().slice(0, 10);
    const nightMin = 5 + index;
    const nightMax = 10 + index;
    const dayMin = 12 + index;
    const dayMax = 18 + index;
    return `<forecast date="${date}">
      <night><phenomenon>Moderate rain</phenomenon><tempmin>${nightMin}</tempmin><tempmax>${nightMax}</tempmax><text>Öösel sajab mitmel pool vihma ja puhub mõõdukas tuul.</text></night>
      <day><phenomenon>Variable clouds</phenomenon><tempmin>${dayMin}</tempmin><tempmax>${dayMax}</tempmax><text>Päeval on vahelduva pilvisusega ilm ja kohati sajab hoovihma.</text></day>
    </forecast>`;
  }).join("");
  return `<?xml version="1.0"?><forecasts>${blocks}</forecasts>`;
}

function hydrologyFixture({
  stationCode = 41025,
  stationName = "Tartu",
  stationFullName = "Tartu hüdromeetriajaam",
  waterbody = "Emajõgi",
  catchment = "Emajõgi",
  latitude = 58.380022,
  longitude = 26.726181,
  series = "WL avg",
  value = 33,
  latest = "2026-08-20T20:00:00",
  previous = "2026-08-20T19:00:00",
} = {}) {
  const row = (timestamp, measurement) => ({
    jaam_kood: stationCode,
    jaam_nimi: stationName,
    jaam_taisnimi: stationFullName,
    veekogu_nimi: waterbody,
    valgala_nimi: catchment,
    jaam_laiuskraad: latitude,
    jaam_pikkuskraad: longitude,
    timeline_ts_utc: timestamp,
    aegrida_nimi: series,
    vaartus: measurement,
  });
  return JSON.stringify([row(latest, value), row(previous, value + 0.4)]);
}

test("current-weather XML adapter binds a fresh measurement to station, time and unit", () => {
  const now = Date.parse("2026-08-21T22:30:00Z");
  const timestamp = Math.floor((now - 2 * 60_000) / 1_000);
  const query = "Mis on praegune temperatuur Tallinnas?";
  const [document] = currentWeatherObservationFromXml(query, weatherFixture(timestamp), { now });

  assert.equal(isCurrentWeatherObservationQuery(query), true);
  assert.equal(document.id, "current-weather-observations");
  assert.equal(document.url, CURRENT_WEATHER_OBSERVATIONS_XML_URL);
  assert.equal(document.retrieval, "official-structured-weather-xml");
  assert.match(document.summary, /Tallinn-Harku[\s\S]*2026-08-21 22:28 UTC[\s\S]*14,2 °C/u);
  assert.match(document.content, /suhteline õhuniiskus 85%/u);
  assert.match(document.content, /viimase tunni sademete hulk 0 mm/u);
  assert.equal(document._weatherObservation.measurements.precipitation, 0);
  assert.equal(sourceEvidenceEligibility(document, { now }).eligible, true);

  const response = composeCurrentWeatherObservationResponse(query, [document], { now, total: 4 });
  assert.equal(response.answer.title, "Tallinn: õhutemperatuur 14,2 °C");
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.equal(response.sources[0].url, CURRENT_WEATHER_OBSERVATIONS_XML_URL);
  assert.match(response.sources[0].evidenceExcerpt, /nimetatud ilmajaama/u);
  assert.equal(response.evidence.kind, "structured-current-weather");
});

test("current-weather adapter preserves missing values and fails closed on ambiguous or stale XML", () => {
  const now = Date.parse("2026-08-21T22:30:00Z");
  const fresh = Math.floor((now - 60_000) / 1_000);
  const query = "Kui tugev on tuul Tallinnas praegu?";
  const [document] = currentWeatherObservationFromXml(query, weatherFixture(fresh, { humidity: "" }), { now });
  assert.equal(document._weatherObservation.measurements.humidity, null);
  assert.doesNotMatch(document.content, /õhuniiskus/u);
  assert.match(document.summary, /tuulekiirus 2,5 m\/s/u);

  const invalid = [
    weatherFixture(Math.floor((now - 16 * 60_000) / 1_000)),
    weatherFixture(Math.floor((now + 6 * 60_000) / 1_000)),
    weatherFixture(fresh, { duplicate: true }),
    weatherFixture(fresh, { temperature: "NaN" }),
    `<!DOCTYPE observations [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${weatherFixture(fresh)}`,
  ];
  for (const xml of invalid) {
    assert.deepEqual(currentWeatherObservationFromXml(query, xml, { now }), []);
  }
  assert.deepEqual(currentWeatherObservationFromXml(query, weatherFixture(fresh), { now, stale: true }), []);
  assert.equal(isCurrentWeatherObservationQuery("Milline on ilm Tallinnas homme?"), false);
  assert.equal(isCurrentWeatherObservationQuery("Milline on ilm Eestis praegu?"), false);
  assert.equal(isCurrentWeatherObservationQuery("Milline on õhuniiskus Tallinnas praegu?"), true);
  assert.equal(isCurrentWeatherObservationQuery("Kui suur on suhteline õhuniiskus Tallinnas praegu?"), true);
  assert.equal(isCurrentWeatherObservationQuery("Mis on õhurõhk Valgas?"), true);
  assert.equal(isCurrentWeatherObservationQuery("Mis on õhutemperatuur Tallinnas?"), true);
  for (const waterQuery of [
    "Mis on põhjavee temperatuur Tallinnas?",
    "Mis on merevee temperatuur Tallinnas?",
    "Mis on järvevee temperatuur Tallinnas?",
    "Mis on suplusvee temperatuur Tallinnas?",
    "Mis on Emajõe temperatuur Tartus?",
    "What is the water temperature in Tallinn?",
  ]) {
    assert.equal(isCurrentWeatherObservationQuery(waterQuery), false, waterQuery);
    assert.deepEqual(currentWeatherObservationFromXml(waterQuery, weatherFixture(fresh), { now }), [], waterQuery);
    assert.equal(composeCurrentWeatherObservationResponse(waterQuery, [document], { now }), null, waterQuery);
  }

  const tampered = structuredClone(document);
  tampered._weatherObservation.measurements.wind = 999;
  tampered._weatherObservation.primaryText = "keskmine tuulekiirus 999 m/s";
  tampered.summary = tampered.summary.replace("2,5", "999");
  assert.equal(composeCurrentWeatherObservationResponse(query, [tampered], { now }), null);
});

test("structured loader calls the weather XML feed only for a supported current observation", async () => {
  const now = Date.parse("2026-08-21T22:30:00Z");
  const timestamp = Math.floor((now - 60_000) / 1_000);
  let calls = 0;
  const fetchXmlDataset = async (url) => {
    calls += 1;
    assert.equal(url, CURRENT_WEATHER_OBSERVATIONS_XML_URL);
    return { body: weatherFixture(timestamp), stale: false, fetchedAt: now };
  };
  const current = await loadStructuredIndicatorDocuments("praegune õhurõhk Tallinnas", {
    now,
    fetchXmlDataset,
  });
  assert.equal(current[0]?._weatherObservation.primaryMetric, "pressure");
  assert.equal(calls, 1);

  const forecast = await loadStructuredIndicatorDocuments("Milline on ilm Tallinnas homme?", {
    now,
    fetchXmlDataset,
  });
  assert.deepEqual(forecast, []);
  assert.equal(calls, 1);
});

test("national forecast XML adapter selects tomorrow in Estonia and preserves forecast scope", () => {
  const now = Date.parse("2026-08-21T10:00:00Z");
  const fetchedAt = now - 60_000;
  const query = "Milline on ilm Eestis homme?";
  const [document] = nationalWeatherForecastFromXml(query, forecastFixture(), { now, fetchedAt });

  assert.equal(isNationalWeatherForecastQuery(query, { now }), true);
  assert.equal(document.url, WEATHER_FORECAST_XML_URL);
  assert.equal(document.retrieval, "official-structured-forecast-xml");
  assert.match(document.summary, /2026-08-22[\s\S]*6…11 °C[\s\S]*13…19 °C/u);
  assert.equal(sourceEvidenceEligibility(document, { now }).eligible, true);
  const response = composeNationalWeatherForecastResponse(query, [document], { now });
  assert.equal(response.answer.title, "Eesti ilmaprognoos 2026-08-22");
  assert.equal(response.answer.parts.length, 2);
  assert.match(response.answer.note, /Eesti üldprognoos, mitte linnapõhine/u);
  assert.equal(response.evidence.kind, "structured-national-weather-forecast");
});

test("national forecast adapter rejects stale, partial, nonconsecutive and city-misattributed feeds", () => {
  const now = Date.parse("2026-08-21T10:00:00Z");
  const query = "Milline on ilm Eestis homme?";
  const fresh = { now, fetchedAt: now - 60_000 };
  const complete = forecastFixture();
  const invalid = [
    complete.replace(/<forecast date="2026-08-24">[\s\S]*?<\/forecast>/u, ""),
    complete.replace('date="2026-08-23"', 'date="2026-08-25"'),
    complete.replace("<tempmin>6</tempmin><tempmax>11</tempmax>", "<tempmin>20</tempmin><tempmax>11</tempmax>"),
    `<!DOCTYPE forecasts [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${complete}`,
  ];
  for (const xml of invalid) {
    assert.deepEqual(nationalWeatherForecastFromXml(query, xml, fresh), []);
  }
  assert.deepEqual(nationalWeatherForecastFromXml(query, complete, {
    now,
    fetchedAt: now - 16 * 60_000,
  }), []);
  assert.deepEqual(nationalWeatherForecastFromXml("Milline on ilm Tartus homme?", complete, fresh), []);
  assert.equal(isNationalWeatherForecastQuery("Milline on ilm Eestis ülehomme?", { now }), false);
});

test("latest-published hydrology adapter binds an exact station, series, source time and unit", () => {
  const now = Date.parse("2026-08-21T22:30:00Z");
  const query = "Mis oli Emajõe Tartu jaama viimati avaldatud veetase?";
  const url = latestPublishedHydrologyQueryUrl(query, { now });
  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.origin + parsedUrl.pathname, LATEST_HYDROLOGY_API_URL);
  assert.equal(parsedUrl.searchParams.get("jaam_kood"), "eq.41025");
  assert.equal(parsedUrl.searchParams.get("aegrida_nimi"), "eq.WL avg");
  assert.equal(parsedUrl.searchParams.get("limit"), "2");
  assert.equal(isLatestPublishedHydrologyQuery(query), true);

  const [document] = latestPublishedHydrologyFromJson(query, hydrologyFixture(), { now });
  assert.equal(document.url, url);
  assert.match(document.locator, new RegExp(LATEST_HYDROLOGY_INFO_URL.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(document.locator, /tartu-kvissentali-hudromeetriajaam/u);
  assert.equal(document._hydrologyObservation.stationCode, 41025);
  assert.equal(document._hydrologyObservation.series, "WL avg");
  assert.equal(document._hydrologyObservation.observedAt, "2026-08-20T20:00:00.000Z");
  assert.match(document.summary, /Emajõe Tartu jaamas[\s\S]*veetaseme tunni keskmine 33 cm[\s\S]*andmeaeg 2026-08-20 20:00 UTC/u);
  assert.equal(document._hydrologyObservation.graphZeroEh2000, 29.77);
  assert.equal(sourceEvidenceEligibility(document, { now }).eligible, true);

  const response = composeLatestPublishedHydrologyResponse(query, [document], { now });
  assert.equal(response.answer.title, "Emajõgi, Tartu: veetaseme tunni keskmine 33 cm");
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.match(response.answer.note, /mitte reaalajanäit/u);
  assert.match(response.answer.parts[0].text, /graafiku nulli \(29,77 m EH2000\)[\s\S]*mitte ühise absoluutkõrgusena/u);
  assert.match(response.answer.parts[1].text, /operatiivsete toorandmetena[\s\S]*lõplikku kontrolli/u);
  assert.deepEqual(response.answer.parts.flatMap((part) => part.citations), [1, 1]);
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].id, document.id);
  assert.match(response.sources[0].evidenceExcerpt, /graafiku nulli[\s\S]*operatiivsed toorandmed/u);
  assert.equal(response.evidence.kind, "structured-latest-published-hydrology");
});

test("latest-published hydrology supports bounded metrics but rejects live, ambiguous and malformed claims", () => {
  const now = Date.parse("2026-08-21T22:30:00Z");
  const temperatureQuery = "Mis oli Kloostrimetsa jaamas viimati avaldatud veetemperatuur?";
  const dischargeQuery = "Mis oli Emajõe Tartu jaama uusim avaldatud äravool?";
  assert.equal(isLatestPublishedHydrologyQuery(temperatureQuery), true);
  assert.equal(isLatestPublishedHydrologyQuery(dischargeQuery), true);
  assert.equal(
    latestPublishedHydrologyFromJson(
      dischargeQuery,
      hydrologyFixture({ series: "Äravool avg", value: 29.592 }),
      { now },
    )[0]?._hydrologyObservation.primaryText,
    "arvutusliku äravoolu tunni keskmine 29,592 m³/s",
  );
  for (const query of [
    "Mis on Emajõe veetase praegu?",
    "Mis oli Emajõe viimati avaldatud veetase?",
    "Mis oli Tartu jaama viimati avaldatud veetase?",
    "Mis oli Emajõe Tartu jaama 2025. aasta veetase?",
    "Mis oli Emajõe Tartu jaama viimati avaldatud veetase eile?",
    "Mis oli Emajõe Tartu jaama viimati avaldatud veetase üleeile?",
    "Mis oli Emajõe Tartu jaama viimati avaldatud veetase eelmisel nädalal?",
    "Mis oli Emajõe Tartu jaama viimati avaldatud veetase 20. augustil?",
    "Mis oli Emajõe Tartu jaama viimati avaldatud veetase 20.08?",
    "Mis oli Emajõe Tartu jaama viimati avaldatud maksimaalne veetase?",
  ]) assert.equal(isLatestPublishedHydrologyQuery(query), false, query);

  const kloostrimetsa = hydrologyFixture({
    stationCode: 41157,
    stationName: "Kloostrimetsa",
    stationFullName: "Kloostrimetsa hüdromeetriajaam",
    waterbody: "Pirita j.",
    catchment: "Pirita jõgi",
    latitude: 59.466291,
    longitude: 24.879519,
    series: "WT avg",
    value: 15.2,
  });
  assert.equal(
    latestPublishedHydrologyFromJson(temperatureQuery, kloostrimetsa, { now })[0]?._hydrologyObservation.primaryText,
    "vee temperatuuri tunni keskmine 15,2 °C",
  );
  const [temperatureDocument] = latestPublishedHydrologyFromJson(temperatureQuery, kloostrimetsa, { now });
  const temperatureResponse = composeLatestPublishedHydrologyResponse(temperatureQuery, [temperatureDocument], { now });
  assert.match(temperatureResponse.answer.parts[0].text, /jõesängi põhja lähedal[\s\S]*ei ole veepinna ega suplusvee temperatuur/u);

  const invalid = [
    hydrologyFixture({ stationCode: 99999 }),
    hydrologyFixture({ series: "WL max" }),
    hydrologyFixture({ value: 99_999 }),
    hydrologyFixture({ latest: "2026-08-20T20:30:00" }),
    hydrologyFixture({ latest: "2026-08-21T23:00:00" }),
    hydrologyFixture({ latest: "2026-08-20T09:00:00", previous: "2026-08-20T08:00:00" }),
    hydrologyFixture({ latest: "2026-08-20T20:00:00", previous: "2026-08-20T20:00:00" }),
    "{}",
    "not-json",
  ];
  for (const body of invalid) {
    assert.deepEqual(latestPublishedHydrologyFromJson(
      "Mis oli Emajõe Tartu jaama viimati avaldatud veetase?",
      body,
      { now },
    ), []);
  }
  assert.deepEqual(latestPublishedHydrologyFromJson(
    "Mis oli Emajõe Tartu jaama viimati avaldatud veetase?",
    hydrologyFixture(),
    { now, stale: true },
  ), []);
});

test("structured loader calls the hydrology API only for a last-published exact-station query", async () => {
  const now = Date.parse("2026-08-21T22:30:00Z");
  let calls = 0;
  const fetchPostgrestDataset = async (url) => {
    calls += 1;
    assert.equal(url, latestPublishedHydrologyQueryUrl(
      "Mis oli Emajõe Tartu jaama viimati avaldatud veetase?",
      { now },
    ));
    return { body: hydrologyFixture(), stale: false, fetchedAt: now };
  };
  const latest = await loadStructuredIndicatorDocuments(
    "Mis oli Emajõe Tartu jaama viimati avaldatud veetase?",
    { now, fetchPostgrestDataset },
  );
  assert.equal(latest[0]?._hydrologyObservation.stationCode, 41025);
  assert.equal(calls, 1);

  const current = await loadStructuredIndicatorDocuments("Mis on Emajõe veetase praegu?", {
    now,
    fetchPostgrestDataset,
  });
  assert.deepEqual(current, []);
  assert.equal(calls, 1);
});

test("structured loader fetches the national forecast feed without conflating a city forecast", async () => {
  const now = Date.parse("2026-08-21T10:00:00Z");
  let calls = 0;
  const fetchXmlDataset = async (url) => {
    calls += 1;
    assert.equal(url, WEATHER_FORECAST_XML_URL);
    return { body: forecastFixture(), stale: false, fetchedAt: now - 60_000 };
  };
  const documents = await loadStructuredIndicatorDocuments("Milline on ilm Eestis homme?", {
    now,
    fetchXmlDataset,
  });
  assert.equal(documents[0]?._weatherForecast.targetDate, "2026-08-22");
  assert.equal(calls, 1);
  const city = await loadStructuredIndicatorDocuments("Milline on ilm Tartus homme?", {
    now,
    fetchXmlDataset,
  });
  assert.deepEqual(city, []);
  assert.equal(calls, 1);
});

test("municipal-waste rate adapter reads the requested year from official Tableau CSV", () => {
  const documents = municipalWasteIndicatorFromCsv("jäätmete ringlussevõtu määr Eestis 2023", fixture);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].id, "municipal-waste-recycling");
  assert.equal(documents[0].url, MUNICIPAL_WASTE_RECYCLING_CSV_URL);
  assert.match(documents[0].locator, /ametliku Tableau vaate CSV-väljund/iu);
  assert.equal(documents[0].actionUrl, MUNICIPAL_WASTE_RECYCLING_PAGE_URL);
  assert.equal(documents[0].actionLabel, "Ava Keskkonnaportaali näitajaleht");
  assert.match(documents[0].summary, /2023\. aastal oli 37,9%/u);
  assert.match(documents[0].summary, /Euroopa Liidus 47,9%/u);
  assert.equal(documents[0].retrieval, "official-tableau-csv");
  assert.deepEqual(documents[0]._municipalWasteRecycling, {
    year: 2023,
    estoniaRate: 37.9,
    euRate: 47.9,
  });
});

test("municipal-waste composer binds one validated CSV observation to its citation", () => {
  const now = Date.parse("2026-08-22T00:00:00Z");
  const query = "Kui suur oli olmejäätmete ringlussevõtu tase Eestis 2023?";
  const [source] = municipalWasteIndicatorFromCsv(query, fixture, { now });
  const page = {
    id: "municipal-waste-recycling-page",
    title: "Olmejäätmete ringlussevõtt",
    url: MUNICIPAL_WASTE_RECYCLING_PAGE_URL,
    sourceTier: "official",
    evidencePolicy: "versioned",
    _answerEvidenceEligible: true,
    _evidenceVersion: "reviewed-page",
  };
  const response = composeMunicipalWasteRecyclingResponse(query, [source, page], { now, total: 2 });
  assert.ok(response);
  assert.match(response.answer.intro, /2023\. aastal oli 37,9%/u);
  assert.match(response.answer.intro, /Euroopa Liidus 47,9%/u);
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].id, "municipal-waste-recycling");
  assert.equal(response.sources[0].url, MUNICIPAL_WASTE_RECYCLING_CSV_URL);
  assert.equal(response.sources[0].actionUrl, MUNICIPAL_WASTE_RECYCLING_PAGE_URL);
  assert.match(response.sources[0].evidenceExcerpt, /ametliku Tableau vaate CSV-väljundist/u);
});

test("municipal-waste composer rejects ambiguous or provenance-mismatched evidence", () => {
  const now = Date.parse("2026-08-22T00:00:00Z");
  const query = "jäätmete ringlussevõtu määr Eestis 2023";
  const [source] = municipalWasteIndicatorFromCsv(query, fixture, { now });
  const invalid = [
    { ...source, id: "municipal-waste-recycling-page" },
    { ...source, url: MUNICIPAL_WASTE_RECYCLING_PAGE_URL },
    { ...source, actionUrl: "https://keskkonnaportaal.ee/et/jaatmed" },
    { ...source, retrieval: "official-service-directory" },
    { ...source, _answerEvidenceEligible: false },
    { ...source, _contentHash: "0".repeat(64) },
    { ...source, _evidenceVersion: "0".repeat(64) },
    { ...source, _municipalWasteRecycling: { ...source._municipalWasteRecycling, year: 2022 } },
    {
      ...source,
      _municipalWasteRecycling: {
        ...source._municipalWasteRecycling,
        estoniaRate: source._municipalWasteRecycling.euRate,
        euRate: source._municipalWasteRecycling.estoniaRate,
      },
    },
    { ...source, _municipalWasteRecycling: { ...source._municipalWasteRecycling, extra: true } },
  ];
  for (const document of invalid) {
    assert.equal(composeMunicipalWasteRecyclingResponse(query, [document], { now }), null);
  }
  assert.equal(composeMunicipalWasteRecyclingResponse(query, [source, { ...source }], { now }), null);
  assert.equal(composeMunicipalWasteRecyclingResponse(
    "olmejäätmete ringlussevõtu määr Eestis 2030",
    [source],
    { now },
  ), null);
});

test("municipal-waste adapter uses the latest complete observation and abstains on missing years", () => {
  assert.match(municipalWasteIndicatorFromCsv("olmejäätmete ringlussevõtu protsent", fixture)[0].summary, /2024\. aastal oli 36,4%/u);
  assert.deepEqual(municipalWasteIndicatorFromCsv("olmejäätmete ringlussevõtu määr 2030", fixture), []);
  assert.deepEqual(municipalWasteIndicatorFromCsv("jäätmete põletamine", fixture), []);
  assert.equal(isMunicipalWasteRecyclingRateQuery("ringlussevõtu määr Eestis"), false);
});

test("municipal-waste adapter never collapses a multi-year comparison to one observation", () => {
  const now = Date.parse("2026-08-22T00:00:00Z");
  for (const query of [
    "Kuidas muutus olmejäätmete ringlussevõtu määr 2023. ja 2024. aasta vahel?",
    "Võrdle olmejäätmete ringlussevõtu määra 2024 ja 2023",
    "Võrdle olmejäätmete ringlussevõtu määra 2023 ja 24",
    "Võrdle olmejäätmete ringlussevõtu määra 2023a ja 24a",
    "Võrdle olmejäätmete ringlussevõtu määra 23–24",
    "Kuidas muutus olmejäätmete ringlussevõtu määr aastatel 2023–24?",
    "Kuidas muutus olmejäätmete ringlussevõtu määr viimase kahe aasta jooksul?",
    "Kuidas muutus olmejäätmete ringlussevõtu määr viimasel kahel aastal?",
    "Kuidas muutus olmejäätmete ringlussevõtu määr viimaste aastate jooksul?",
    "Kuidas muutus olmejäätmete ringlussevõtu määr viimase paari aasta jooksul?",
    "Kuidas muutus olmejäätmete ringlussevõtu määr viimase poolteise aasta jooksul?",
    "Olmejäätmete ringlussevõtu määr viimasel kümnendil",
    "Võrdle olmejäätmete ringlussevõtu määra kahe aasta jooksul",
    "Kuidas muutus olmejäätmete ringlussevõtu määr viimase aasta jooksul?",
    "Kas olmejäätmete ringlussevõtu määr tõusis 2023. aastaga võrreldes?",
    "Võrdle olmejäätmete ringlussevõtu määra 2023 võrreldes 24",
    "Võrdle olmejäätmete ringlussevõtu määra enne ja pärast 2023. aastat",
    "Olmejäätmete ringlussevõtu määr 2023. aastast saadik",
    "Olmejäätmete ringlussevõtu määr 2023. aastani",
    "Olmejäätmete ringlussevõtu määr 2023. aasta algusest",
    "Võrdle viimati avaldatud olmejäätmete ringlussevõtu määra ja 2023. aasta näitajat",
    "Kui kõrge on olmejäätmete ringlussevõtu määr 2023. aastaga võrreldes?",
    "Kas Eesti olmejäätmete ringlussevõtu määr oli 2023. aastal kõrgem Euroopa tasemest?",
    "Olmejäätmete ringlussevõtu määra trend",
  ]) {
    assert.equal(isMunicipalWasteRecyclingRateQuery(query), false, query);
    assert.deepEqual(municipalWasteIndicatorFromCsv(query, fixture, { now }), [], query);
    const [singleYearSource] = municipalWasteIndicatorFromCsv(
      "olmejäätmete ringlussevõtu määr 2023",
      fixture,
      { now },
    );
    assert.equal(composeMunicipalWasteRecyclingResponse(
      query,
      [singleYearSource],
      { now },
    ), null, query);
  }

  for (const [query, year] of [
    ["Olmejäätmete ringlussevõtu määr 2023. aastal", 2023],
    ["Olmejäätmete ringlussevõtu määr 2023. aasta jooksul", 2023],
    ["Olmejäätmete ringlussevõtu määr 2024. a", 2024],
    ["Võrdle Eesti ja ELi olmejäätmete ringlussevõtu määra 2023", 2023],
    ["Kas Eesti olmejäätmete ringlussevõtu määr oli 2023. aastal kõrgem kui ELis?", 2023],
    ["Kas Eesti olmejäätmete ringlussevõtu määr oli 2023. aastal madalam Euroopa Liidu omast?", 2023],
    ["Palun ütle mulle, kui suur oli olmejäätmete ringlussevõtu määr Eestis 2023. aastal?", 2023],
    ["Kas saad öelda, kui suur oli olmejäätmete ringlussevõtu määr Eestis 2023. aastal?", 2023],
    ["Mis on viimane teadaolev olmejäätmete ringlussevõtu määr Eestis?", 2024],
  ]) {
    assert.equal(isMunicipalWasteRecyclingRateQuery(query), true, query);
    const [source] = municipalWasteIndicatorFromCsv(query, fixture, { now });
    assert.equal(source._municipalWasteRecycling.year, year, query);
  }
});

test("municipal-waste adapter rejects current and future numeric rows as completed observations", () => {
  const now = Date.parse("2026-08-22T00:00:00Z");
  const header = "Aasta,Measure Names,% Eesti,% EL";
  for (const year of [2026, 2027]) {
    const csv = [
      header,
      "2024,Eesti,36.4,",
      `2024,Euroopa Liit (EL),,48.1`,
      `${year},Eesti,55.0,`,
      `${year},Euroopa Liit (EL),,60.0`,
      "",
    ].join("\n");
    assert.deepEqual(municipalWasteIndicatorFromCsv(
      `olmejäätmete ringlussevõtu määr Eestis ${year}`,
      csv,
      { now },
    ), [], String(year));
    const latestCompleted = municipalWasteIndicatorFromCsv(
      "olmejäätmete ringlussevõtu määr Eestis",
      csv,
      { now },
    );
    if (year === 2026) {
      assert.match(latestCompleted[0].summary, /2024\. aastal oli 36,4%/u);
      assert.doesNotMatch(latestCompleted[0].summary, /55%|60%/u);
    } else {
      assert.deepEqual(latestCompleted, [], String(year));
    }
  }

  for (const query of [
    "Kui suur on olmejäätmete ringlussevõtu määr tänavu?",
    "Kui suur on olmejäätmete ringlussevõtu määr järgmisel aastal?",
    "Kui suur oli olmejäätmete ringlussevõtu määr mullu?",
    "Kui suur oli olmejäätmete ringlussevõtu määr möödunud aastal?",
    "Kui suur oli olmejäätmete ringlussevõtu määr üleeelmisel aastal?",
    "Kui suur on olmejäätmete ringlussevõtu määr praegusel aastal?",
    "Kui suur on tänase seisuga olmejäätmete ringlussevõtu määr?",
    "Kui suur on täna olmejäätmete ringlussevõtu määr?",
    "Kui suur on hetkel olmejäätmete ringlussevõtu määr?",
    "Kui suur on olmejäätmete ringlussevõtu määr käesoleva perioodi kohta?",
  ]) {
    assert.equal(isMunicipalWasteRecyclingRateQuery(query), false, query);
    assert.deepEqual(municipalWasteIndicatorFromCsv(query, fixture, { now }), [], query);
  }

  const [pastSource] = municipalWasteIndicatorFromCsv(
    "olmejäätmete ringlussevõtu määr Eestis 2024",
    fixture,
    { now },
  );
  const futureSource = {
    ...pastSource,
    published: "2027",
    summary: "Olmejäätmete ringlussevõtu määr Eestis 2027. aastal oli 55% ja Euroopa Liidus 60%.",
    content: "Olmejäätmete ringlussevõtu määr Eestis 2027. aastal oli 55% ja Euroopa Liidus 60%. Andmed on loetud lehele manustatud ametliku Tableau vaate CSV-väljundist.",
    _publishedAt: "2027-12-31",
    _municipalWasteRecycling: { year: 2027, estoniaRate: 55, euRate: 60 },
  };
  assert.equal(composeMunicipalWasteRecyclingResponse(
    "olmejäätmete ringlussevõtu määr Eestis 2027",
    [futureSource],
    { now },
  ), null);
});

test("municipal-waste adapter accepts only the reviewed Tableau duplicate-column shape and paired future placeholders", () => {
  const currentTableauCsv = [
    "Aasta,Measure Names,Eesti/EL õige,% Eesti (copy),% Eesti,% EL (copy),% EL",
    "2023,Eesti,*,37.9,37.9,,",
    "2024,Eesti,*,36.4,36.4,,",
    "2025,Eesti,Eesti,,,,",
    "2030,Eesti,Eesti,,,,",
    "2023,Euroopa Liit (EL),,,,47.9,47.9",
    "2024,Euroopa Liit (EL),,,,48.1,48.1",
    "2025,Euroopa Liit (EL),,,,,",
    "2030,Euroopa Liit (EL),,,,,",
    "",
  ].join("\n");
  const now = Date.parse("2026-08-22T00:00:00Z");
  const [document] = municipalWasteIndicatorFromCsv(
    "jäätmete ringlussevõtu määr Eestis 2023",
    currentTableauCsv,
    { now },
  );
  assert.match(document.summary, /2023\. aastal oli 37,9%/u);
  assert.match(document.summary, /Euroopa Liidus 47,9%/u);

  for (const invalid of [
    currentTableauCsv.replace("37.9,37.9", "38.0,37.9"),
    currentTableauCsv.replace("2025,Euroopa Liit (EL),,,,,\n", ""),
    currentTableauCsv.replace("2030,Eesti,Eesti,,,,", "2030,Eesti,*,40,40,,"),
    currentTableauCsv.replace("2025,Eesti,Eesti,,,,", "2022,Eesti,Eesti,,,,")
      .replace("2025,Euroopa Liit (EL),,,,,", "2022,Euroopa Liit (EL),,,,,"),
    currentTableauCsv.replace("Eesti/EL õige", "Eesti/EL muu"),
  ]) {
    assert.deepEqual(municipalWasteIndicatorFromCsv(
      "jäätmete ringlussevõtu määr Eestis 2023",
      invalid,
      { now },
    ), []);
  }
});

test("municipal-waste CSV fails closed on malformed, ambiguous or impossible observations", () => {
  const query = "olmejäätmete ringlussevõtu määr";
  const invalid = [
    "Aasta,Measure Names,% Eesti,% EL\n2024,Eesti,,\n",
    "Aasta,Measure Names,% Eesti,% EL\n2024,Eesti,-0.1,\n",
    "Aasta,Measure Names,% Eesti,% EL\n2024,Eesti,100.1,\n",
    "Aasta,Measure Names,% Eesti,% EL\n2024,Eesti,1e2,\n",
    "Aasta,Measure Names,% Eesti,% EL\n2099,Eesti,36.4,\n",
    "Aasta,Measure Names,% Eesti,% Eesti,% EL\n2024,Eesti,36.4,36.4,\n",
    "Aasta,Measure Names,% Eesti,% EL\n2024,Eesti,36.4,\n2024,Eesti,37.9,\n",
    "Aasta,Measure Names,% Eesti,% EL\n2024,Eesti,36.4\n",
    "Aasta,Measure Names,% Eesti,% EL\n2024,Eesti,36.4,,extra\n",
    "Aasta,Measure Names,% Eesti,% EL\n2024,Eesti,\"36.4,\n",
    "Aasta,Measure Names,% Eesti,% EL\n2024,Eesti,\"36.4\"junk,\n",
    "Aasta,Measure Names,% Eesti,% EL\n2024,Muu,36.4,\n",
    "Aasta,Measure Names,% Eesti,% EL\n2024,Euroopa Liit (EL),48.1,\n",
  ];
  for (const csv of invalid) {
    assert.deepEqual(municipalWasteIndicatorFromCsv(query, csv), [], csv);
  }

  const quotedComma = "\uFEFFAasta,Measure Names,% Eesti,% EL\r\n2024,Eesti,\"36,4\",\r\n";
  assert.match(municipalWasteIndicatorFromCsv(query, quotedComma)[0].summary, /36,4%/u);
  const optionalEu = "Aasta,Measure Names,% Eesti,% EL\n2023,Eesti,37.9,\n2024,Eesti,36.4,\n";
  assert.match(municipalWasteIndicatorFromCsv(query, optionalEu)[0].summary, /2024\. aastal oli 36,4%/u);
});

test("forest balance adapter decodes Eurostat JSON-stat without inventing missing years", () => {
  const observations = forestBalanceObservations(forestFixture);
  assert.deepEqual(observations.map(({ year, increment, removals }) => ({ year, increment, removals })), [
    { year: 2020, increment: 14.37094, removals: 12.179 },
    { year: 2021, increment: null, removals: null },
    { year: 2022, increment: 9.1, removals: 12.013 },
    { year: 2023, increment: 9.1, removals: 11.564 },
    { year: 2024, increment: null, removals: null },
  ]);
  const documents = forestHarvestBalanceDocumentsFromJson("Kas raiemaht ületab juurdekasvu?", forestFixture);
  assert.deepEqual(documents.map((document) => document.id), [
    "forest-balance-eurostat",
    "forest-balance-eurostat-handbook",
    "forest-balance-kaur-methodology",
    "forest-balance-kaur-five-year",
  ]);
  assert.equal(documents[0].locator, FOREST_BALANCE_EUROSTAT_API_URL);
  assert.match(documents[0].summary, /2023\. aastal oli netojuurdekasv 9,1 ja Eurostati puidu eemaldamine \(removals\) 11,6 miljonit m³ koorega/u);
  assert.match(documents[0].summary, /2020\. aasta netojuurdekasv on märgitud imputeerituna/u);
  assert.match(documents[0].summary, /2023\. aasta eemaldamine on märgitud hinnangulisena/u);
  assert.match(documents[0].content, /2021, 2024/u);
  assert.deepEqual(forestHarvestBalanceDocumentsFromJson("metsamaa pindala", forestFixture), []);
});

test("forest balance JSON-stat schema and values fail closed before becoming evidence", () => {
  const malformed = [];
  const missingDimension = structuredClone(forestFixture);
  missingDimension.id = missingDimension.id.filter((id) => id !== "stk_flow");
  missingDimension.size.splice(1, 1);
  delete missingDimension.dimension.stk_flow;
  malformed.push(missingDimension);

  const duplicatePosition = structuredClone(forestFixture);
  duplicatePosition.dimension.stk_flow.category.index = { NAI: 0, RMOV: 0 };
  malformed.push(duplicatePosition);

  const futureYear = structuredClone(forestFixture);
  futureYear.dimension.time.category.index = { 2020: 0, 2021: 1, 2022: 2, 2023: 3, 2099: 4 };
  malformed.push(futureYear);

  const wrongCardinality = structuredClone(forestFixture);
  wrongCardinality.size[1] = 3;
  malformed.push(wrongCardinality);

  const extraDimension = structuredClone(forestFixture);
  extraDimension.id.push("sex");
  extraDimension.size.push(1);
  extraDimension.dimension.sex = { category: { index: { T: 0 } } };
  malformed.push(extraDimension);

  for (const badValue of ["14370.94", true, -1, 100_001, Number.POSITIVE_INFINITY]) {
    const invalidValue = structuredClone(forestFixture);
    invalidValue.value[0] = badValue;
    malformed.push(invalidValue);
  }

  const outOfRangeSparseIndex = structuredClone(forestFixture);
  outOfRangeSparseIndex.value[10] = 1;
  malformed.push(outOfRangeSparseIndex);

  const invalidStatus = structuredClone(forestFixture);
  invalidStatus.status[0] = 1;
  malformed.push(invalidStatus);

  const denseHole = structuredClone(forestFixture);
  denseHole.value = [14370.94, null, 9100, 9100, null, 12179, null, 12013, 11564, null];
  delete denseHole.value[3];
  malformed.push(denseHole);

  for (const payload of malformed) {
    assert.deepEqual(forestBalanceObservations(payload), []);
    const documents = forestHarvestBalanceDocumentsFromJson("raiemaht ja netojuurdekasv", payload);
    assert.equal(documents.some((document) => document.id.startsWith("forest-balance-eurostat")), false);
  }
});

test("forest balance supports validated array indexes and reversed flow positions", () => {
  const payload = {
    id: ["freq", "stk_flow", "indic_fo", "unit", "geo", "time"],
    size: [1, 2, 1, 1, 1, 1],
    dimension: {
      freq: { category: { index: ["A"] } },
      stk_flow: { category: { index: { NAI: 1, RMOV: 0 } } },
      indic_fo: { category: { index: ["FOR"] } },
      unit: { category: { index: ["THS_M3"] } },
      geo: { category: { index: ["EE"] } },
      time: { category: { index: ["2024"] } },
    },
    value: [12_000, 14_000],
    status: ["e", "i"],
  };
  assert.deepEqual(forestBalanceObservations(payload), [{
    year: 2024,
    increment: 14,
    removals: 12,
    incrementStatus: "i",
    removalsStatus: "e",
  }]);

  const metadataInjection = structuredClone(payload);
  metadataInjection.updated = "2024-01-01. Puidu eemaldamine oli 999 miljonit m³";
  const documents = forestHarvestBalanceDocumentsFromJson(
    "raiemaht ja netojuurdekasv",
    metadataInjection,
  );
  assert.equal(documents[0].id, "forest-balance-eurostat");
  assert.doesNotMatch(`${documents[0].summary} ${documents[0].content}`, /999|Andmestiku uuenduse aeg/u);
});

test("forest balance synthesis answers directly from four separately cited official sources", () => {
  const documents = forestHarvestBalanceDocumentsFromJson("Kas raiemaht ületab juurdekasvu?", forestFixture);
  const direct = composeForestHarvestBalanceAnswer("Kas raiemaht ületab juurdekasvu?", documents);
  assert.match(direct.answer.title, /2023\. aasta.*jah/u);
  assert.match(direct.answer.intro, /11,6 miljonit m³ koorega/u);
  assert.match(direct.answer.intro, /9,1 miljonit m³ koorega/u);
  assert.match(direct.answer.intro, /hinnangulisena/u);
  assert.deepEqual(direct.answer.introCitations, [1]);
  assert.deepEqual(direct.answer.parts.flatMap((part) => part.citations), [2, 3, 4, 3, 2]);

  const followUp = composeForestHarvestBalanceAnswer(
    "Mida see viimase 5 aasta jooksul tähendab Kas raiemaht ületab juurdekasvu?",
    documents,
  );
  assert.match(followUp.answer.title, /^2020–2024 viie aasta kohta/u);
  assert.match(followUp.answer.intro, /viit värskeimat allikas olevat aastat \(2020–2024\)/u);
  assert.match(followUp.answer.intro, /2025\. aasta rida selles väljavõttes veel ei ole/u);
  assert.match(followUp.answer.intro, /2020: eemaldamine 12,2 ja netojuurdekasv 14,4/u);
  assert.match(followUp.answer.intro, /2022: eemaldamine 12,0 ja netojuurdekasv 9,1/u);
  assert.match(followUp.answer.intro, /2022\. ja 2023\. aastal oli eemaldamine suurem/u);
  assert.doesNotMatch(followUp.answer.intro, /2022 ja 2023\. aastal/u);
  assert.match(followUp.answer.intro, /imputeerituna/u);
  assert.match(followUp.answer.intro, /hinnangulisena/u);
  assert.match(followUp.answer.intro, /2021 ja 2024/u);
  assert.ok(new Set([
    ...followUp.answer.introCitations,
    ...followUp.answer.parts.flatMap((part) => part.citations),
  ]).size >= 4);

  const numericOnlyDirect = composeForestHarvestBalanceAnswer(
    "Kas raiemaht ületab juurdekasvu?",
    [documents[0]],
  );
  assert.match(numericOnlyDirect.answer.intro, /11,6[\s\S]*9,1[\s\S]*2,5 miljoni m³/u);
  const numericOnlyFollowUp = composeForestHarvestBalanceAnswer(
    "Mida see viimase 5 aasta jooksul tähendab Kas raiemaht ületab juurdekasvu?",
    [documents[0]],
  );
  assert.match(numericOnlyFollowUp.answer.title, /^2020–2024 viie aasta kohta/u);
  assert.match(numericOnlyFollowUp.answer.intro, /2020: eemaldamine 12,2 ja netojuurdekasv 14,4/u);
  assert.match(followUp.answer.parts[0].text, /metsast ära toodud looduslikku väljalangemist/u);
  assert.equal(isForestHarvestBalanceQuery("raiemaht ja netojuurdekasv"), true);
  assert.equal(isForestHarvestBalanceQuery("raiemaht 2023"), false);
  assert.equal(isForestHarvestBalanceQuery("Kuidas raiemaht mõjutab metsa juurdekasvu?"), false);
  assert.equal(isForestHarvestBalanceQuery("Miks raiemaht ületas netojuurdekasvu 2023. aastal?"), false);
  assert.equal(isForestHarvestBalanceQuery("Kas raiemaht ületas bruto juurdekasvu 2023?"), false);
  assert.equal(isForestHarvestBalanceQuery("Kas raiemaht ületas metsa bruto aastast juurdekasvu 2023?"), false);
  assert.equal(isForestHarvestBalanceQuery("Kas raiemaht ületas kogu juurdekasvu 2023?"), false);
  assert.equal(isForestHarvestBalanceQuery("Kas raiemaht ületas täisjuurdekasvu 2023?"), false);
  assert.equal(isForestHarvestBalanceQuery("Kas raiemaht ületas netojuurdekasvu 2023?"), true);
});

test("forest balance keeps its reviewed official snapshot when the live dataset is unavailable or stale", async () => {
  const query = "Kas raiemaht ületab netojuurdekasvu?";
  const now = Date.parse("2026-08-21T00:00:00Z");
  const unavailable = await loadStructuredIndicatorDocuments(query, {
    fetchJsonDataset: async () => {
      throw new Error("temporary upstream failure");
    },
  });
  const stale = await loadStructuredIndicatorDocuments(query, {
    fetchJsonDataset: async () => ({ body: JSON.stringify(forestFixture), stale: true }),
  });
  const partialPayload = {
    ...structuredClone(forestFixture),
    size: [1, 2, 1, 1, 1, 1],
    dimension: {
      ...structuredClone(forestFixture.dimension),
      time: { category: { index: { 2023: 0 } } },
    },
    value: { 0: 9100, 1: 11564 },
    status: { 1: "e" },
  };
  const partial = await loadStructuredIndicatorDocuments(query, {
    now,
    fetchJsonDataset: async () => ({
      body: JSON.stringify(partialPayload),
      stale: false,
      fetchedAt: now,
    }),
  });
  const missingTimestamp = await loadStructuredIndicatorDocuments(query, {
    now,
    fetchJsonDataset: async () => ({ body: JSON.stringify(forestFixture), stale: false }),
  });
  const oldTimestamp = await loadStructuredIndicatorDocuments(query, {
    now,
    fetchJsonDataset: async () => ({
      body: JSON.stringify(forestFixture),
      stale: false,
      fetchedAt: now - 24 * 60 * 60_000 - 1,
    }),
  });
  const futureTimestamp = await loadStructuredIndicatorDocuments(query, {
    now,
    fetchJsonDataset: async () => ({
      body: JSON.stringify(forestFixture),
      stale: false,
      fetchedAt: now + 5 * 60_000 + 1,
    }),
  });

  for (const documents of [
    unavailable,
    stale,
    partial,
    missingTimestamp,
    oldTimestamp,
    futureTimestamp,
  ]) {
    const snapshot = documents.find((document) => document.id === "forest-balance-eurostat");
    assert.equal(snapshot?.retrieval, "reviewed-official-eurostat-snapshot");
    assert.equal(snapshot?._answerEvidenceEligible, true);
    assert.equal(sourceEvidenceEligibility(snapshot, {
      now: Date.parse("2026-08-21T00:00:00Z"),
    }).eligible, true);
    assert.equal(sourceEvidenceEligibility(snapshot, {
      now: Date.parse("2027-09-26T00:00:00Z"),
    }).eligible, false);
    assert.match(snapshot?.summary || "", /2023\. aastal oli netojuurdekasv 9,1[\s\S]*11,6 miljonit m³/iu);
    const draft = composeForestHarvestBalanceAnswer(query, documents);
    assert.match(draft?.answer?.intro || "", /2023[\s\S]*11,6[\s\S]*9,1[\s\S]*2,5 miljoni m³/iu);
  }

  const internalTimeout = await loadStructuredIndicatorDocuments(query, {
    signal: new AbortController().signal,
    fetchJsonDataset: async () => {
      throw new DOMException("upstream timeout", "AbortError");
    },
  });
  assert.equal(internalTimeout[0]?.retrieval, "reviewed-official-eurostat-snapshot");

  const live = await loadStructuredIndicatorDocuments(query, {
    now,
    fetchJsonDataset: async () => ({
      body: JSON.stringify(forestFixture),
      stale: false,
      fetchedAt: now,
    }),
  });
  const liveDocument = live.find((document) => document.id === "forest-balance-eurostat");
  assert.equal(liveDocument?.retrieval, "official-eurostat-json");
  assert.equal(sourceEvidenceEligibility(liveDocument, { now }).eligible, true);
  assert.equal(sourceEvidenceEligibility(liveDocument, {
    now: now + 24 * 60 * 60_000 + 1,
  }).eligible, false);

  const caller = new AbortController();
  caller.abort(new DOMException("caller cancelled", "AbortError"));
  await assert.rejects(
    loadStructuredIndicatorDocuments(query, {
      signal: caller.signal,
      fetchJsonDataset: async () => {
        throw caller.signal.reason;
      },
    }),
    { name: "AbortError" },
  );
});

test("forest balance synthesis honors an explicit year and abstains when its pair is missing", () => {
  const documents = forestHarvestBalanceDocumentsFromJson("Kas raiemaht ületab juurdekasvu?", forestFixture);
  const year2020 = composeForestHarvestBalanceAnswer("Kas raiemaht ületas juurdekasvu 2020. aastal?", documents);
  assert.match(year2020.answer.title, /2020\. aasta.*ei$/u);
  assert.match(year2020.answer.intro, /^Ei\./u);
  assert.match(year2020.answer.intro, /12,2 miljonit m³ koorega/u);
  assert.match(year2020.answer.intro, /14,4 miljonit m³ koorega/u);
  assert.match(year2020.answer.intro, /imputeerituna/u);

  const below2023 = composeForestHarvestBalanceAnswer("Kas raiemaht jäi alla netojuurdekasvu 2023. aastal?", documents);
  assert.match(below2023.answer.title, /2023\. aasta.*ei$/u);
  assert.match(below2023.answer.intro, /^Ei\./u);
  assert.match(below2023.answer.intro, /ületas netojuurdekasvu/u);

  for (const year of [2021, 2024, 2019, 2030]) {
    const missing = composeForestHarvestBalanceAnswer(`Kas raiemaht ületas juurdekasvu ${year}. aastal?`, documents);
    assert.match(missing.answer.title, new RegExp(`^${year}\\. aasta kohta võrreldav paar puudub$`, "u"));
    assert.match(missing.answer.intro, /ei saa selle andmerea põhjal nende suhet/u);
    assert.deepEqual(missing.answer.introCitations, [1]);
    assert.doesNotMatch(missing.answer.intro, /2023\. aasta raiemaht/u);
  }
});

test("forest balance keeps dense JSON-stat nulls missing and derives a rolling window", () => {
  const denseFixture = {
    ...forestFixture,
    value: [14370.94, null, 9100, 9100, null, 12179, null, 12013, 11564, null],
  };
  assert.deepEqual(
    forestBalanceObservations(denseFixture).filter((item) => [2021, 2024].includes(item.year)),
    [
      { year: 2021, increment: null, removals: null, incrementStatus: null, removalsStatus: null },
      { year: 2024, increment: null, removals: null, incrementStatus: null, removalsStatus: null },
    ],
  );

  const sixYears = {
    ...forestFixture,
    size: [1, 2, 1, 1, 1, 6],
    dimension: {
      ...forestFixture.dimension,
      time: { category: { index: { 2020: 0, 2021: 1, 2022: 2, 2023: 3, 2024: 4, 2025: 5 } } },
    },
    value: [15000, 14500, 14000, 13500, 13000, 12500, 10000, 11000, 15000, 14500, 13500, 9000],
    status: {},
  };
  const documents = forestHarvestBalanceDocumentsFromJson("raiemaht ja netojuurdekasv", sixYears);
  const answer = composeForestHarvestBalanceAnswer("Mida see viimase 5 aasta jooksul tähendab: raiemaht ja netojuurdekasv?", documents);
  assert.doesNotMatch(answer.answer.intro, /2020:/u);
  assert.match(answer.answer.intro, /2021:/u);
  assert.match(answer.answer.intro, /2025: eemaldamine 9,0 ja netojuurdekasv 12,5/u);
  assert.match(answer.answer.intro, /2026\. aasta rida selles väljavõttes veel ei ole/u);
  assert.match(answer.answer.title, /2025\. aastal.*väiksem$/u);
});

test("forest balance five-year answer carries a grouped bar chart with gaps kept", () => {
  const documents = forestHarvestBalanceDocumentsFromJson("Kas raiemaht ületab juurdekasvu?", forestFixture);
  const direct = composeForestHarvestBalanceAnswer("Kas raiemaht ületab juurdekasvu?", documents);
  assert.equal(direct.chart, undefined);
  const fiveYear = composeForestHarvestBalanceAnswer(
    "Mida see viimase 5 aasta jooksul tähendab Kas raiemaht ületab juurdekasvu?",
    documents,
  );
  assert.equal(fiveYear.chart.kind, "bar");
  assert.equal(fiveYear.chart.title, "Netojuurdekasv ja puidu eemaldamine 2020–2024");
  assert.equal(fiveYear.chart.unit, "mln m³ koorega");
  assert.equal(fiveYear.chart.citation, fiveYear.answer.introCitations[0]);
  assert.deepEqual(fiveYear.chart.series.map((series) => series.label), ["Netojuurdekasv", "Puidu eemaldamine"]);
  const observations = documents[0]._forestBalance.observations;
  assert.deepEqual(
    fiveYear.chart.series[0].points,
    observations.filter((item) => item.increment !== null).map((item) => ({ x: item.year, y: item.increment })),
  );
  assert.deepEqual(
    fiveYear.chart.series[1].points,
    observations.filter((item) => item.removals !== null).map((item) => ({ x: item.year, y: item.removals })),
  );
  assert.match(fiveYear.chart.caption, /^Eurostat, metsa arvepidamine \(for_vol_efa\), Eesti\./u);
});
