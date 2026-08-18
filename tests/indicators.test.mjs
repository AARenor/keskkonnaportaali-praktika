import assert from "node:assert/strict";
import test from "node:test";
import {
  composeForestHarvestBalanceAnswer,
  forestBalanceObservations,
  forestHarvestBalanceDocumentsFromJson,
  FOREST_BALANCE_EUROSTAT_API_URL,
  isForestHarvestBalanceQuery,
  isMunicipalWasteRecyclingRateQuery,
  municipalWasteIndicatorFromCsv,
  MUNICIPAL_WASTE_RECYCLING_CSV_URL,
} from "../server/indicators.mjs";

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

test("forest balance synthesis answers directly from four separately cited official sources", () => {
  const documents = forestHarvestBalanceDocumentsFromJson("Kas raiemaht ületab juurdekasvu?", forestFixture);
  const direct = composeForestHarvestBalanceAnswer("Kas raiemaht ületab juurdekasvu?", documents);
  assert.match(direct.answer.title, /2023\. aasta.*jah/u);
  assert.match(direct.answer.intro, /11,6 miljonit m³ koorega/u);
  assert.match(direct.answer.intro, /9,1 miljonit m³ koorega/u);
  assert.match(direct.answer.intro, /hinnangulisena/u);
  assert.deepEqual(direct.answer.introCitations, [1]);
  assert.deepEqual(direct.answer.parts.flatMap((part) => part.citations), [2, 3, 4, 3]);

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
