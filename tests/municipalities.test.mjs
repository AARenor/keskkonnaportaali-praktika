import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyForestryGeographyScope,
  hasLossyUnicodeForestryAreaResidual,
  hasUnresolvedForestryAreaEntity,
  hasReviewedEstonianMunicipalityScope,
  hasUnresolvedForestryLocalityScope,
  isReviewedEstonianCountyIdentity,
  isReviewedNationalUnsupportedForestAreaBreakdownQuestion,
  removeFirstReviewedMunicipalityOrganizationName,
  requestsUnsupportedForestAreaBreakdown,
  requestsUnsupportedForestAreaTimeSeries,
  requestsUnsupportedForestAreaUnit,
  reviewedEstonianMunicipalityCandidateScope,
  reviewedEstonianForestryMunicipalityScope,
  reviewedEstonianMunicipalityScope,
} from "../server/municipalities.mjs";

test("reviewed municipality scope resolves city, rural and inflected territory forms", () => {
  const exactCases = [
    ["Tartu linnas", "tartu linn"],
    ["Tartu linnavalitsuses", "tartu linn"],
    ["City of Tartu", "tartu linn"],
    ["Tartu city government", "tartu linn"],
    ["city government of Tartu", "tartu linn"],
    ["local government of Pärnu", "parnu linn"],
    ["Pärnu local government", "parnu linn"],
    ["municipality of Saaremaa", "saaremaa vald"],
    ["municipality of Tartu linn", "tartu linn"],
    ["municipality of Võru vald", "voru vald"],
    ["Võru linnas", "voru linn"],
    ["Võru vallavalitsuses", "voru vald"],
    ["Pärnu linnavalitsuse haldusalas", "parnu linn"],
    ["Tartus", "tartu linn"],
    ["Võrus", "voru linn"],
    ["Pärnus", "parnu linn"],
    ["Tallinnas", "tallinn"],
  ];
  for (const [query, identity] of exactCases) {
    const scope = reviewedEstonianMunicipalityScope(query);
    assert.equal(scope?.status, "exact", query);
    assert.equal(scope?.identity, identity, query);
    assert.equal(hasReviewedEstonianMunicipalityScope(query), true, query);
  }
});

test("ambiguous and unknown municipality wording never becomes a silent exact identity", () => {
  for (const query of [
    "Võru municipal government",
    "municipal government of Tartu",
    "local government of Tartu",
    "Tartu local government",
    "municipality of Tartu",
    "Tartu municipality",
    "Tartu linn and Võru linn",
  ]) {
    const scope = reviewedEstonianMunicipalityScope(query);
    assert.equal(scope?.status, "ambiguous", query);
    assert.ok((scope?.candidates || []).length >= 2, query);
  }
  for (const query of ["municipal government", "omavalitsus", "Tiina Linn", "Tiina Vesi", "Sinioru linnavalitsus"]) {
    assert.equal(reviewedEstonianMunicipalityScope(query), null, query);
  }
});

test("public municipality candidates must consume the complete identity", () => {
  for (const query of [
    "Tartu linn",
    "Tartu linnavalitsuses",
    "City of Tartu",
    "Tartu city government",
    "municipality of Saaremaa",
    "municipality of Tartu",
    "municipality of Tartu linn",
    "Tartus",
  ]) {
    assert.ok(reviewedEstonianMunicipalityCandidateScope(query), query);
  }
  for (const query of [
    "Jaan Tartu linn",
    "Alice Saaremaa municipality",
    "John Tartu city",
    "municipality of Jaan Tartu linn",
    "Sinioru municipality",
  ]) {
    assert.equal(reviewedEstonianMunicipalityCandidateScope(query), null, query);
  }
});

test("forestry-only municipality scope resolves bare names without widening the privacy scope", () => {
  const exactCases = [
    ["Pärnu metsasus", "parnu linn"],
    ["Otepää metsasus", "otepaa vald"],
    ["Saaremaa metsasus", "saaremaa vald"],
  ];
  for (const [query, identity] of exactCases) {
    assert.equal(reviewedEstonianMunicipalityScope(query), null, query);
    const scope = reviewedEstonianForestryMunicipalityScope(query);
    assert.equal(scope?.status, "exact", query);
    assert.equal(scope?.identity, identity, query);
  }
  for (const query of ["Tartu metsasus", "Metsasus Tartu", "Rakvere metsasus", "Võru metsamaa pindala 2024"]) {
    const scope = reviewedEstonianForestryMunicipalityScope(query);
    assert.equal(scope?.status, "ambiguous", query);
    assert.ok((scope?.candidates || []).length >= 2, query);
  }
  assert.equal(reviewedEstonianForestryMunicipalityScope("Sinioru metsasus"), null);
  for (const query of [
    "Sinioru metsasus", "sinioru metsasus", "SINIORU metsasus",
    "Kivimetsa metsamaa pindala", "kivimetsa metsamaa pindala",
  ]) {
    assert.equal(hasUnresolvedForestryLocalityScope(query), true, query);
    assert.equal(classifyForestryGeographyScope(query).kind, "unknown-locality", query);
  }
  assert.equal(hasUnresolvedForestryLocalityScope("Eesti metsasus"), false);
  assert.equal(hasUnresolvedForestryLocalityScope("Metsamaa pindala hektarites"), false);
  assert.equal(hasUnresolvedForestryLocalityScope("Metsaga kaetud maa osakaal"), false);
  assert.equal(hasUnresolvedForestryLocalityScope("Kaitsealuse metsamaa osakaal"), false);
  for (const query of [
    "Praegune metsasus",
    "Uusim metsasus",
    "Metsasus protsentides",
    "Metsamaa pindala kokku",
    "Metsamaa pindala tänapäeval",
    "Ajalooline metsasus",
    "What is the current forest area?",
    "Current forest cover percentage",
    "Forest area today",
  ]) assert.equal(hasUnresolvedForestryLocalityScope(query), false, query);

  const countyCases = [
    ["Harjumaa", "Harju"], ["Hiiumaa", "Hiiu"], ["Ida-Virumaa", "Ida-Viru"],
    ["Jõgevamaa", "Jõgeva"], ["Järvamaa", "Järva"], ["Läänemaa", "Lääne"],
    ["Lääne-Virumaa", "Lääne-Viru"], ["Põlvamaa", "Põlva"], ["Pärnumaa", "Pärnu"],
    ["Raplamaa", "Rapla"], ["Saaremaa", "Saare"], ["Tartumaa", "Tartu"],
    ["Valgamaa", "Valga"], ["Viljandimaa", "Viljandi"], ["Võrumaa", "Võru"],
  ];
  for (const [bare, base] of countyCases) {
    assert.notEqual(classifyForestryGeographyScope(`${bare} metsasus`).kind, "national-default", bare);
    assert.equal(classifyForestryGeographyScope(`${base} maakonna metsamaa pindala`).kind, "estonian-region", base);
    assert.equal(classifyForestryGeographyScope(`${base} county forest cover`).kind, "estonian-region", base);
  }
  for (const query of [
    "Läti metsasus", "Soome metsasus", "Euroopa metsasus", "Latvia forest area",
    "Forest area of Finland", "European forest cover percentage", "Forest area of Gondor",
    "How much forest is there in Gondor?", "How many hectares of forest are there in Gondor?",
    "Forest area in Gondor Estonia", "How much forest is there in Gondor Estonia?",
  ]) {
    assert.equal(classifyForestryGeographyScope(query).kind, "foreign-or-other-region", query);
  }
  for (const query of [
    "Forest area in the current year for Gondor",
    "Forest area for the latest year in Gondor",
    "Forest area in hectares for Atlantis",
    "Forest area in hectares Gondor",
    "Forest area in 2025 in Gondor",
    "Forest area for 2025 in Gondor",
    "Forest area in 2025 for Atlantis",
    "What is the forest area in 2025 in Middle Earth",
    "Forest area by 2025 in Gondor",
    "What is the woodland coverage in 2025 in Gondor",
    "Gondor forest area",
    "What is Gondor forest area?",
    "What is Gondor's forest area?",
    "Latest Gondor forest area",
    "How much forest does Gondor have?",
    "How many hectares of forest does Gondor have?",
    "How many forest hectares are in Gondor?",
    "How many hectares are forested in Gondor?",
    "Forest area during 2025 in Gondor",
    "Forest area from 2020 through 2025 in Gondor",
    "Forest area as of 2025 in Gondor",
    "Woodland cover according to 2025 data for Atlantis",
    "Compare Estonia and Gondor forest area",
    "Estonia versus Gondor forest cover",
    "Forest area Estonia versus Gondor",
    "Forest area in Estonia and Gondor",
    "How much forest in Estonia and Gondor?",
    "How much forest was there in Gondor in 2025?",
    "Estonia's forest area compared with Gondor",
    "How much forest does Estonia have compared with Gondor?",
    "Estonia forest area compared to Gondor",
    "How much forest does Estonia have relative to Gondor?",
    "How much forest does Estonia have alongside Gondor?",
    "Estonia's forest area against Gondor",
    "How does Estonia's forest area differ from Gondor?",
    "Kui suur on Gondori metsamaa pindala?",
    "Kui palju metsa on Gondoris?",
    "Atlantise metsamaa pindala",
    "Gondor has how much forest?",
  ]) {
    assert.equal(classifyForestryGeographyScope(query).kind, "foreign-or-other-region", query);
  }
  for (const query of [
    "Gondor forest area",
    "How much forest does Gondor have?",
    "Forest area during 2025 in Gondor",
    "Compare Estonia and Gondor forest area",
    "Forest area in Estonia and Gondor",
    "Estonia's forest area compared with Gondor",
    "How much forest does Estonia have relative to Gondor?",
    "Kui suur on Gondori metsamaa pindala?",
    "Kui palju metsa on Gondoris?",
    "Gondor has how much forest?",
  ]) assert.equal(hasUnresolvedForestryAreaEntity(query), true, query);

  for (const query of [
    "Estonia's forest area and how is it measured?",
    "What is Estonia’s forest area and how is it measured?",
    "What is the country's forest area in Estonia and how is it measured?",
    "What is the nation’s woodland cover in Estonia and how is it estimated?",
  ]) {
    assert.equal(classifyForestryGeographyScope(query).kind, "national-estonia", query);
    assert.equal(hasUnresolvedForestryAreaEntity(query), false, query);
  }
  for (const query of [
    "Praegune metsasus", "Metsamaa pindala kokku", "Current forest cover percentage",
    "Forest area in hectares", "Forest area in the current year", "Forest area in the latest year",
    "Forest area in the year 2024", "Forest area in square kilometres", "Forest area in this year",
    "Forest area in the present year", "Forest area in the most recent year",
    "Forest area in million hectares", "Forest area in thousands of hectares",
    "Forest area in the period 2020 to 2025",
    "Forest cover percentage in the present year",
    "Forest cover percentage in the most recent year",
    "Forest cover percentage in million hectares",
    "Forest cover percentage in thousands of hectares",
    "How much forest is there in thousands of hectares",
    "How many hectares of forest in thousands of hectares",
    "Forest area in the current year thanks",
    "Forest area in hectares thank you",
    "Forest area in the latest year for Estonia thanks",
    "Forest area in million hectares if possible",
    "Forest area in 2025",
    "Forest area by 2025",
    "Forest area in 2025 in hectares for Estonia thank you",
    "How much forest is there in 2025",
    "How much forest is there in the current year thanks",
    "How many hectares of forest are there in 2025",
    "Forest area in Estonia and in 2025",
    "What is Estonia's forest area?",
    "What is Estonia forest area in thousands of hectares",
    "Latest Estonia forest area",
    "How many forest hectares are in Estonia?",
    "How many hectares are forested in Estonia?",
    "Forest area in Estonia this year",
    "Please tell me the national forest area",
    "Forest area by ownership category in Estonia",
    "Forest area in Estonia by ownership category",
    "Forest cover in Estonia by protection class",
    "Forest area in Estonia excluding protected forests",
    "Forest area in Estonia from 2020 to 2024",
    "Forest area in Estonia over time",
    "Forest area excluding protected forests in Estonia",
    "I want to know the forest area",
    "Find the latest forest area",
    "Give me the forest area estimate",
    "Report the current forest area figure",
    "Forest area in Estonia today",
    "Latest available Estonia forest area estimate",
    "How much forest is there in Estonia today?",
    "Forest area change over time in Estonia",
    "Forest area for each year 2020 to 2025",
    "Metsamaa pindala omandivormi järgi Eestis",
    "Metsamaa pindala aastate kaupa Eestis",
    "Forest area in km2",
  ]) {
    assert.ok(
      ["national-default", "national-estonia"].includes(classifyForestryGeographyScope(query).kind),
      query,
    );
  }
  for (const query of [
    "Forest area according to ownership category in Estonia",
    "Forest area by private ownership in Estonia",
    "Forest area with public ownership",
    "Forest area with management status",
    "Forest cover with management status",
    "Forest area by conservation status",
    "Woodland area grouped by conservation regime",
    "Forest cover according to protection class",
    "Forest area across ownership types",
    "Forest area divided by ownership",
    "Forest cover disaggregated by protection regime",
    "Woodland area based on management class",
    "Forest area for each conservation status",
    "Forest area of privately owned forests in Estonia",
    "Metsamaa pindala omandivormi järgi Eestis",
    "Forest area in Estonia by ownership category",
    "Forest cover in Estonia by protection class",
    "Forest area in Estonia excluding protected forests",
    "Forest area omandivormi järgi",
    "Forest area omandivormi järgi in Estonia",
    "Forest cover omandivormi järgi",
    "Forest area ownership järgi",
    "Woodland area omandivormi järgi",
    "Metsamaa pindala ownership järgi",
    "Forest area kaitsekategooria järgi",
    "Forest cover majandamisviisi järgi",
    "Forest area omandivormide lõikes Eestis",
    "Forest area omanikuliigi kaupa Eestis",
    "Metsasus protection class by",
  ]) assert.equal(requestsUnsupportedForestAreaBreakdown(query), true, query);
  for (const query of [
    "Forest area from 2020 to 2024",
    "Forest area 2024 and 2025",
    "Historical forest area by year",
    "Forest area over the years",
    "Forest area year to year",
    "Forest area over time",
    "Forest area through the years",
    "Forest area during the years",
    "Forest area for all years",
    "Forest cover for all years",
    "Forest area between years",
    "Forest area by period",
    "Forest area per year",
    "Woodland area across multiple years",
    "Forest cover for each period",
    "Forest area per period",
    "Forest area period by period",
    "Forest cover across time periods",
    "Woodland area over previous years",
    "Forest area by decade",
    "Forest cover timeline",
    "Metsamaa pindala aastate kaupa Eestis",
    "Forest area in Estonia from 2020 to 2024",
    "Forest area in Estonia over time",
  ]) assert.equal(requestsUnsupportedForestAreaTimeSeries(query), true, query);
  for (const query of [
    "Forest area in square kilometres",
    "Forest area in acres",
    "Forest area in km2",
    "Forest area in sq. km",
    "Forest area in km²",
    "Forest area in square miles",
    "Forest area in sq. mi",
  ]) assert.equal(requestsUnsupportedForestAreaUnit(query), true, query);
});

test("reviewed counties require an exact non-lossy security surface", () => {
  for (const alias of [
    "Ida/Viru", "Ida_Viru", "Ida.Viru", "Ida|Viru", "Ida+Viru", "Ida⁄Viru", "Ida’Viru", "IdaꞌViru",
    "Lääne/Viru", "Lääne_Viru", "Lääne.Viru", "Lääne|Viru", "Lääne+Viru", "Lääne⁄Viru", "Lääne’Viru", "LääneꞌViru",
  ]) {
    assert.equal(isReviewedEstonianCountyIdentity(alias), false, alias);
    assert.notEqual(
      classifyForestryGeographyScope(`${alias} metsamaa pindala`).kind,
      "estonian-region",
      alias,
    );
  }
  for (const alias of [
    "Ida-Viru", "Ida–Viru", "Ida Viru", "Ida-Virumaa",
    "Lääne-Viru", "Lääne–Viru", "Lääne Viru", "Lääne-Virumaa",
  ]) {
    assert.equal(isReviewedEstonianCountyIdentity(alias), true, alias);
    assert.equal(
      classifyForestryGeographyScope(`${alias} metsamaa pindala`).kind,
      "estonian-region",
      alias,
    );
  }
  for (const alias of [
    "Hárjumaa",
    "Ḣarjumaa",
    "Ha\u0301rjumaa",
    "Päŕnumaa",
    "Ta\u0301rtumaa",
  ]) {
    assert.equal(isReviewedEstonianCountyIdentity(alias), false, alias);
    assert.notEqual(
      classifyForestryGeographyScope(`${alias} Young forest area`).kind,
      "estonian-region",
      alias,
    );
  }
});

test("a fully consumed national forest-area method question is not mistaken for a locality", () => {
  for (const query of [
    "Kui palju metsa Eestis on ja kuidas seda mõõdetakse?",
    "Kui palju metsa on Eestis ja kuidas metsa hinnatakse?",
    "How much forest is in Estonia and how is it measured?",
    "How much forest is there in Estonia and how is it measured?",
    "How much forest does Estonia have and how is it measured?",
    "What is the forest area in Estonia and how is it measured?",
  ]) {
    assert.equal(hasUnresolvedForestryAreaEntity(query), false, query);
    assert.equal(classifyForestryGeographyScope(query).kind, "national-estonia", query);
  }

  for (const query of [
    "Kui palju metsa Eestis on ja kuidas seda mõõdetakse Tartu linnas?",
    "Kui palju metsa Eestis on ja kuidas seda mõõdetakse Gondoris?",
    "Kui palju metsa Eestis on ja kuidas seda mõõdetakse Jaan Tamme kinnistul?",
    "How much forest is in Estonia and how is it measured in Gondor?",
    "Kui palju metsa Eestis on ja kuidas seda mõõdetakse? 山田太郎の住所",
    "Kui palju metsa Eestis on ja kuidas seda mõõdetakse? 김민수 주소",
    "Kui palju metsa Eestis on ja kuidas seda mõõdetakse? عنوان محمد",
  ]) {
    assert.equal(hasUnresolvedForestryAreaEntity(query), true, query);
    assert.notEqual(classifyForestryGeographyScope(query).kind, "national-estonia", query);
  }
  for (const query of [
    "Kui palju metsa Eestis on ja kuidas seda mõõdetakse? 山田太郎の住所",
    "Kui palju metsa Eestis on ja kuidas seda mõõdetakse? 김민수 주소",
    "Kui palju metsa Eestis on ja kuidas seda mõõdetakse? عنوان محمد",
  ]) assert.equal(hasLossyUnicodeForestryAreaResidual(query), true, query);
});

test("complete national ownership breakdowns stay aggregate while appended identities stay unresolved", () => {
  for (const query of [
    "How much forest is in Estonia and how is it measured by ownership?",
    "How much forest is in Estonia and how is it measured according to ownership?",
    "How much forest is in Estonia and how is it measured by ownership category?",
    "How much forest is in Estonia and how is it measured across ownership types?",
    "Forest area in Estonia and how is it measured by ownership?",
    "Forest area in Estonia and how is it measured according to ownership?",
    "Forest area in Estonia and how is it measured by tenure?",
    "Forest area in Estonia and how is it measured by public ownership?",
    "Forest area in Estonia by ownership and how is it measured?",
    "Forest area in Estonia broken down by ownership",
    "Metsamaa pindala Eestis omanike kaupa",
    "Kui palju metsa Eestis on omandivormide kaupa ja kuidas seda mõõdetakse?",
  ]) {
    assert.equal(isReviewedNationalUnsupportedForestAreaBreakdownQuestion(query), true, query);
    assert.equal(hasUnresolvedForestryAreaEntity(query), false, query);
    assert.equal(classifyForestryGeographyScope(query).kind, "national-estonia", query);
  }

  for (const query of [
    "How much forest is in Estonia and how is it measured by ownership for John Smith?",
    "Forest area in Estonia broken down by ownership in Gondor",
    "Metsamaa pindala Eestis omanike kaupa Jaan Tamm",
    "How much forest is in Estonia and how is it measured by ownership? 山田太郎の住所",
  ]) {
    assert.equal(isReviewedNationalUnsupportedForestAreaBreakdownQuestion(query), false, query);
  }
});

test("privacy cleanup removes only exact reviewed municipality organization spans", () => {
  assert.equal(
    removeFirstReviewedMunicipalityOrganizationName("Tartu linnavalitsuse keskkonnaosakonna telefon").trim(),
    "keskkonnaosakonna telefon",
  );
  assert.equal(
    removeFirstReviewedMunicipalityOrganizationName("City of Tartu environmental office phone").trim(),
    "environmental office phone",
  );
  assert.equal(
    removeFirstReviewedMunicipalityOrganizationName("city government of Tartu environmental office phone").trim(),
    "environmental office phone",
  );
  assert.equal(
    removeFirstReviewedMunicipalityOrganizationName("municipality of Saaremaa environmental office phone").trim(),
    "environmental office phone",
  );
  for (const query of ["Võru municipal government phone", "municipal government of Tartu phone", "municipality of Tartu phone", "Tiina Linn phone", "Sinioru linnavalitsuse telefon"]) {
    assert.equal(removeFirstReviewedMunicipalityOrganizationName(query), query);
  }
});
