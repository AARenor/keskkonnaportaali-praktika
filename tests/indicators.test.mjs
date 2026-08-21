import assert from "node:assert/strict";
import test from "node:test";
import {
  composeForestHarvestBalanceAnswer,
  forestBalanceObservations,
  forestHarvestBalanceDocumentsFromJson,
  FOREST_BALANCE_EUROSTAT_API_URL,
  isForestHarvestBalanceQuery,
  isMunicipalWasteRecyclingRateQuery,
  loadStructuredIndicatorDocuments,
  municipalWasteIndicatorFromCsv,
  MUNICIPAL_WASTE_RECYCLING_CSV_URL,
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

test("municipal-waste rate adapter reads the requested year from official Tableau CSV", () => {
  const documents = municipalWasteIndicatorFromCsv("jäätmete ringlussevõtu määr Eestis 2023", fixture);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].id, "municipal-waste-recycling");
  assert.equal(documents[0].locator, MUNICIPAL_WASTE_RECYCLING_CSV_URL);
  assert.match(documents[0].summary, /2023\. aastal oli 37,9%/u);
  assert.match(documents[0].summary, /Euroopa Liidus 47,9%/u);
  assert.equal(documents[0].retrieval, "official-tableau-csv");
});

test("municipal-waste adapter uses the latest complete observation and abstains on missing years", () => {
  assert.match(municipalWasteIndicatorFromCsv("olmejäätmete ringlussevõtu protsent", fixture)[0].summary, /2024\. aastal oli 36,4%/u);
  assert.deepEqual(municipalWasteIndicatorFromCsv("olmejäätmete ringlussevõtu määr 2030", fixture), []);
  assert.deepEqual(municipalWasteIndicatorFromCsv("jäätmete põletamine", fixture), []);
  assert.equal(isMunicipalWasteRecyclingRateQuery("ringlussevõtu määr Eestis"), false);
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
