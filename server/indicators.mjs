import { createHash } from "node:crypto";
import { fetchOfficialDataset, fetchOfficialJsonDataset } from "./integrations.mjs";

export const MUNICIPAL_WASTE_RECYCLING_CSV_URL = "https://tableau.envir.ee/views/jtmed-OlmejtmeteringlussevttEestijaEuroopaLiit/OlmejtmeteringlussevttEestijaEuroopaLiit.csv?:showVizHome=no";
export const FOREST_BALANCE_EUROSTAT_API_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/for_vol_efa?geo=EE&sinceTimePeriod=2020&stk_flow=NAI&stk_flow=RMOV&indic_fo=FOR&unit=THS_M3&lang=en";
export const FOREST_BALANCE_EUROSTAT_URL = "https://ec.europa.eu/eurostat/web/products-eurostat-news/w/edn-20260320-2";
export const FOREST_BALANCE_EFA_HANDBOOK_URL = "https://ec.europa.eu/eurostat/web/products-manuals-and-guidelines/w/ks-gq-24-015";
export const FOREST_BALANCE_KAUR_URL = "https://keskkonnaagentuur.ee/node/2720";
export const FOREST_FIVE_YEAR_KAUR_URL = "https://keskkonnaagentuur.ee/uudised/smi-segametsade-osakaal-kasvab";

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^0-9a-z]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function csvRows(value) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = String(value || "").replace(/^\uFEFF/u, "");
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function numeric(value) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function etNumber(value) {
  return new Intl.NumberFormat("et-EE", { maximumFractionDigits: 1 }).format(value);
}

function etDecimal(value, maximumFractionDigits = 3) {
  return new Intl.NumberFormat("et-EE", {
    minimumFractionDigits: 1,
    maximumFractionDigits,
  }).format(value);
}

function etYearList(years = []) {
  if (years.length <= 1) return years[0] || "";
  return `${years.slice(0, -1).map((year) => `${year}.`).join(", ")} ja ${years.at(-1)}`;
}

function requestedYear(query) {
  const match = String(query || "").match(/\b((?:19|20)\d{2})\b/u);
  return match ? Number(match[1]) : null;
}

export function isMunicipalWasteRecyclingRateQuery(query) {
  const text = normalize(query);
  return /\b(?:olme ?)?jaatm\w*/u.test(text)
    && /\bringlussev\w*/u.test(text)
    && /\b(?:maar|protsent|osakaal|tase)\w*/u.test(text);
}

export function municipalWasteIndicatorFromCsv(query, csv) {
  if (!isMunicipalWasteRecyclingRateQuery(query)) return [];
  const rows = csvRows(csv);
  if (rows.length < 2) return [];
  const header = rows[0];
  const yearIndex = header.indexOf("Aasta");
  const nameIndex = header.indexOf("Measure Names");
  const estoniaIndex = header.indexOf("% Eesti");
  const euIndex = header.indexOf("% EL");
  if ([yearIndex, nameIndex, estoniaIndex, euIndex].some((index) => index < 0)) return [];
  const byYear = new Map();
  for (const row of rows.slice(1)) {
    const year = Number(row[yearIndex]);
    if (!Number.isInteger(year)) continue;
    const values = byYear.get(year) || { year, estonia: null, eu: null };
    if (row[nameIndex] === "Eesti") values.estonia = numeric(row[estoniaIndex]);
    if (row[nameIndex] === "Euroopa Liit (EL)") values.eu = numeric(row[euIndex]);
    byYear.set(year, values);
  }
  const requested = requestedYear(query);
  const available = [...byYear.values()].filter((item) => item.estonia !== null).sort((left, right) => right.year - left.year);
  const observation = requested ? byYear.get(requested) : available[0];
  if (!observation || observation.estonia === null) return [];
  const estonia = etNumber(observation.estonia);
  const comparison = observation.eu === null ? "" : ` ja Euroopa Liidus ${etNumber(observation.eu)}%`;
  const statement = `Olmejäätmete ringlussevõtu määr Eestis ${observation.year}. aastal oli ${estonia}%${comparison}.`;
  return [{
    id: "municipal-waste-recycling",
    title: "Olmejäätmete ringlussevõtu määr",
    organization: "Keskkonnaportaal / Keskkonnaagentuur",
    type: "Keskkonnanäitaja",
    published: String(observation.year),
    url: "https://keskkonnaportaal.ee/et/olmejaatmete-ringlussevott",
    locator: MUNICIPAL_WASTE_RECYCLING_CSV_URL,
    summary: statement,
    content: `${statement} Andmed on loetud lehele manustatud ametliku Tableau vaate CSV-väljundist.`,
    topics: ["jäätmed", "olmejäätmed", "ringlussevõtt", "ringlussevõtu määr", "protsent", String(observation.year)],
    tags: ["jäätmed", "olmejäätmed", "ringlussevõtt", "protsent", String(observation.year)],
    sourceTier: "official",
    retrieval: "official-tableau-csv",
    _contentHash: createHash("sha256").update(csv).digest("hex"),
    _publishedAt: `${observation.year}-12-31`,
  }];
}

function forestHarvestComparisonIntent(query) {
  const text = normalize(query);
  if (/\b(?:bruto|kogu|tais)(?:\s+\w+){0,3}\s*juurdekasv\w*\b/u.test(text)) return null;
  const harvest = /\b(?:raie ?maht|raie|puidu ?varum|puidu ?eemaldam|eemaldam)\w*/u.test(text);
  const increment = /\b(?:neto ?juurdekasv|juurdekasv)\w*/u.test(text);
  if (!harvest || !increment) return null;
  const causal = /\b(?:mojuta|pohjusta|tagajarg|miks)\w*/u.test(text);
  if (causal) return null;
  const greater = /\b(?:ulet|suurem|korgem|rohkem)\w*/u.test(text);
  const lower = /\b(?:alla|vaiksem|madalam|vahem)\w*/u.test(text);
  const neutralComparison = /\b(?:vordle|vordlus|suhe|tasakaal|versus|vs)\w*\b/u.test(text)
    || /\braie\w*\s+(?:ja|ning)\s+(?:neto\s*)?juurdekasv\w*\b/u.test(text);
  const harvestIndex = Math.min(...[text.indexOf("raie"), text.indexOf("eemaldam"), text.indexOf("varum")]
    .filter((index) => index >= 0));
  const incrementIndex = text.indexOf("juurdekasv");
  const harvestFirst = harvestIndex <= incrementIndex;
  if (greater) return harvestFirst ? "removals-greater" : "removals-lower";
  if (lower) return harvestFirst ? "removals-lower" : "removals-greater";
  return neutralComparison ? "neutral" : null;
}

export function isForestHarvestBalanceQuery(query) {
  return Boolean(forestHarvestComparisonIntent(query));
}

function dimensionPositions(payload, name) {
  const index = payload?.dimension?.[name]?.category?.index;
  if (Array.isArray(index)) return new Map(index.map((value, position) => [String(value), position]));
  if (!index || typeof index !== "object") return new Map();
  return new Map(Object.entries(index).map(([value, position]) => [String(value), Number(position)]));
}

function jsonStatIndex(payload, coordinates) {
  const ids = Array.isArray(payload?.id) ? payload.id : [];
  const sizes = Array.isArray(payload?.size) ? payload.size : [];
  if (!ids.length || ids.length !== sizes.length) return null;
  let index = 0;
  for (let dimension = 0; dimension < ids.length; dimension += 1) {
    const position = dimensionPositions(payload, ids[dimension]).get(String(coordinates[ids[dimension]]));
    if (!Number.isInteger(position) || position < 0 || position >= Number(sizes[dimension])) return null;
    index = index * Number(sizes[dimension]) + position;
  }
  return index;
}

export function forestBalanceObservations(payload) {
  const years = [...dimensionPositions(payload, "time").keys()]
    .filter((value) => /^\d{4}$/u.test(value))
    .sort((left, right) => Number(left) - Number(right));
  const observations = [];
  for (const year of years) {
    const shared = { freq: "A", indic_fo: "FOR", unit: "THS_M3", geo: "EE", time: year };
    const incrementIndex = jsonStatIndex(payload, { ...shared, stk_flow: "NAI" });
    const removalsIndex = jsonStatIndex(payload, { ...shared, stk_flow: "RMOV" });
    const incrementValue = incrementIndex === null ? null : payload?.value?.[incrementIndex];
    const removalsValue = removalsIndex === null ? null : payload?.value?.[removalsIndex];
    const increment = incrementValue === null || incrementValue === undefined ? null : Number(incrementValue);
    const removals = removalsValue === null || removalsValue === undefined ? null : Number(removalsValue);
    observations.push({
      year: Number(year),
      increment: Number.isFinite(increment) ? Number((increment / 1_000).toFixed(6)) : null,
      removals: Number.isFinite(removals) ? Number((removals / 1_000).toFixed(6)) : null,
      incrementStatus: incrementIndex === null ? null : payload?.status?.[incrementIndex] || null,
      removalsStatus: removalsIndex === null ? null : payload?.status?.[removalsIndex] || null,
    });
  }
  return observations;
}

function forestBalanceKaurDocuments() {
  return [
    {
      id: "forest-balance-kaur-methodology",
      title: "Netojuurdekasvu ja raie tasakaal – üks jätkusuutlikku metsamajandust kirjeldav näitaja",
      organization: "Keskkonnaagentuur",
      type: "Analüüs",
      published: "09.04.2026",
      url: FOREST_BALANCE_KAUR_URL,
      summary: "Keskkonnaagentuuri analüüsi järgi oli viimase kümnendi keskmisena elusate puude raiemaht majandatavate metsade netojuurdekasvust kõrgem, kuid 20 aasta vaates madalam. Lühiajalist ületamist ei saa üksi nimetada üle- ega alaraieks.",
      content: "Netojuurdekasv saadakse, kui juurdekasvust arvatakse maha looduslik suremus. Viimase kümnendi keskmisena on elusate puude raiemaht olnud kõrgem kui majandatavate metsade netojuurdekasv. Kui vaadelda 20 aasta pikkust perioodi, on elusate puude raiemaht olnud alla netojuurdekasvu. Pikaajalise kestlikkuse hindamiseks tuleb arvestada ka metsa vanuselist ja puuliigilist struktuuri, looduslikke kadusid, kahjustusi ja tagavara muutust.",
      topics: ["mets", "raiemaht", "netojuurdekasv", "pikaajaline trend", "SMI"],
      tags: ["mets", "raiemaht", "netojuurdekasv", "pikaajaline trend", "SMI"],
      sourceTier: "official",
      retrieval: "official-structured-forestry-source",
      _publishedAt: "2026-04-09",
    },
    {
      id: "forest-balance-kaur-five-year",
      title: "SMI: Segametsade osakaal kasvab",
      organization: "Keskkonnaagentuur",
      type: "Metsastatistika",
      published: "10.06.2024",
      url: FOREST_FIVE_YEAR_KAUR_URL,
      summary: "Viimase viie raiehooaja 2018/2019–2022/2023 keskmine raiemaht oli 11,2 miljonit tihumeetrit. Raiemaht oli 2021. aastal 10,0 ja 2022. aastal 12,1 miljonit tihumeetrit.",
      content: "Keskkonnaagentuuri SMI ülevaate järgi püsis raiemaht viimastel aastatel ligikaudu 10–12 miljoni tihumeetri tasemel. 2021. aasta raiemaht oli 10,0 miljonit tihumeetrit ja 2022. aasta raiemaht 12,1 miljonit tihumeetrit. Viimase viie raiehooaja 2018/2019–2022/2023 keskmine oli 11,2 miljonit tihumeetrit. Ülevaade rõhutab, et pikemas vaates peavad raie ja netojuurdekasv majandatavates metsades olema tasakaalus, kuid lühiajaline kõrvalekalle võib olla loomulik.",
      topics: ["mets", "raiemaht", "viis aastat", "SMI", "2021", "2022", "2023"],
      tags: ["mets", "raiemaht", "viis aastat", "SMI", "2021", "2022", "2023"],
      sourceTier: "official",
      retrieval: "official-structured-forestry-source",
      _publishedAt: "2024-06-10",
    },
  ];
}

export function forestHarvestBalanceDocumentsFromJson(query, payload, options = {}) {
  if (!isForestHarvestBalanceQuery(query)) return [];
  const observations = forestBalanceObservations(payload);
  const comparable = observations.filter((item) => item.increment !== null && item.removals !== null);
  const kaur = forestBalanceKaurDocuments();
  if (!comparable.length) return kaur;
  const rangeStart = observations[0]?.year;
  const rangeEnd = observations.at(-1)?.year;
  const observationsText = comparable.map((item) => {
    const relation = item.removals > item.increment ? "ületas" : item.removals < item.increment ? "jäi alla" : "võrdus";
    return `${item.year}. aastal oli netojuurdekasv ${etDecimal(item.increment, 1)} ja Eurostati puidu eemaldamine (removals) ${etDecimal(item.removals, 1)} miljonit m³ koorega; eemaldamine ${relation} netojuurdekasvu`;
  }).join(". ");
  const missingYears = observations
    .filter((item) => item.increment === null || item.removals === null)
    .map((item) => item.year);
  const sourcePayload = JSON.stringify(payload);
  return [{
    id: "forest-balance-eurostat",
    title: "Eesti puidu eemaldamine ja netojuurdekasv Eurostati metsa arvepidamises",
    organization: "Eurostat",
    type: "Ametlik andmestik",
    published: "20.03.2026",
    url: FOREST_BALANCE_EUROSTAT_URL,
    locator: FOREST_BALANCE_EUROSTAT_API_URL,
    summary: `${observationsText}.${forestObservationStatusSentence(comparable)}`,
    content: `Eurostati European Forest Accounts andmestiku for_vol_efa näitaja FOR, algühik tuhat kuupmeetrit koorega; kasutajavastuses on väärtused teisendatud miljoniteks kuupmeetriteks. ${observationsText}. ${payload?.updated ? `Andmestiku uuenduse aeg: ${payload.updated}.` : ""} ${missingYears.length ? `Mõlemat võrreldavat väärtust ei ole aastate ${missingYears.join(", ")} kohta avaldatud.` : ""}`.trim(),
    topics: ["mets", "raiemaht", "puidu eemaldamine", "netojuurdekasv", "Eurostat", ...comparable.map((item) => String(item.year))],
    tags: ["mets", "raiemaht", "puidu eemaldamine", "netojuurdekasv", "Eurostat", ...comparable.map((item) => String(item.year))],
    sourceTier: "official",
    retrieval: "official-eurostat-json",
    _contentHash: createHash("sha256").update(sourcePayload).digest("hex"),
    _publishedAt: "2026-03-20",
    _stale: options.stale === true,
    _forestBalance: { observations, rangeStart, rangeEnd, missingYears },
  }, {
    id: "forest-balance-eurostat-handbook",
    title: "European Forest Accounts Handbook: puidu eemaldamine ja netojuurdekasv",
    organization: "Eurostat",
    type: "Metoodika",
    published: "2024",
    url: FOREST_BALANCE_EFA_HANDBOOK_URL,
    summary: "EFA removals mõõdab aruandeperioodil metsast eemaldatud elusate ja surnud puude mahtu koorega. Sama aasta eemaldamise ja netojuurdekasvu võrdlus näitab, kas eemaldamine ületab juurdekasvu või jääb sellest alla, kuid EFA näitaja ei võrdu üks-ühele ühe aasta SMI raiemahuga.",
    content: "European Forest Accounts käsiraamatu peatükid 4.14–4.18 määratlevad mahu koorega. Removals hõlmab aruandeperioodil metsast eemaldatud elusaid ja surnud puid, sealhulgas metsast ära toodud looduslikku väljalangemist, varasemal perioodil langetatud puitu ning eemaldatud mittetüvepuitu. Sama aasta eemaldamise ja netojuurdekasvu võrdlus näitab, kas eemaldamine ületab juurdekasvu või jääb sellest alla. Seetõttu ei ole EFA removals üks-ühele sama mis ühe aasta SMI raiemaht.",
    topics: ["mets", "puidu eemaldamine", "removals", "metoodika", "koorega"],
    tags: ["mets", "puidu eemaldamine", "removals", "metoodika", "koorega"],
    sourceTier: "official",
    retrieval: "official-eurostat-methodology",
    _publishedAt: "2024-01-01",
  }, ...kaur];
}

function forestObservationStatusSentence(observations = []) {
  const labels = { i: "imputeerituna", e: "hinnangulisena", p: "esialgsena" };
  const details = [];
  for (const observation of observations) {
    const incrementLabel = labels[observation.incrementStatus];
    const removalsLabel = labels[observation.removalsStatus];
    if (incrementLabel) details.push(`${observation.year}. aasta netojuurdekasv on märgitud ${incrementLabel}`);
    if (removalsLabel) details.push(`${observation.year}. aasta eemaldamine on märgitud ${removalsLabel}`);
  }
  return details.length ? ` Eurostati kvaliteedimärgendid: ${details.join("; ")}.` : "";
}

export function composeForestHarvestBalanceAnswer(query, sources = []) {
  const comparisonIntent = forestHarvestComparisonIntent(query);
  if (!comparisonIntent) return null;
  const citationFor = (id) => {
    const index = sources.findIndex((source) => source.id === id);
    return index >= 0 ? index + 1 : null;
  };
  const eurostat = sources.find((source) => source.id === "forest-balance-eurostat");
  const eurostatCitation = citationFor("forest-balance-eurostat");
  const handbookCitation = citationFor("forest-balance-eurostat-handbook");
  const methodCitation = citationFor("forest-balance-kaur-methodology");
  const fiveYearCitation = citationFor("forest-balance-kaur-five-year");
  const allObservations = eurostat?._forestBalance?.observations || [];
  const observations = allObservations.filter((item) => item.increment !== null && item.removals !== null);
  const explicitYear = requestedYear(query);
  if (!observations.length || !eurostatCitation || !methodCitation) return null;
  const requestedObservation = explicitYear
    ? allObservations.find((item) => item.year === explicitYear)
    : null;
  if (explicitYear && (!requestedObservation
    || requestedObservation.increment === null
    || requestedObservation.removals === null)) {
    return {
      answer: {
        eyebrow: "Allikapõhine koondvastus",
        title: `${explicitYear}. aasta kohta võrreldav paar puudub`,
        intro: `Kasutatud Eurostati metsa arvepidamise väljavõttes ei ole ${explicitYear}. aasta kohta korraga avaldatud nii Eesti netojuurdekasvu kui ka puidu eemaldamise (removals) väärtust. Seetõttu ei saa selle andmerea põhjal nende suhet sel aastal hinnata.`,
        introCitations: [eurostatCitation],
        parts: [{
          title: "Miks ma puuduvat väärtust ei asenda",
          text: "Netojuurdekasv arvestab juurdekasvust maha loodusliku suremuse ning võrdlus peab kasutama sama aasta ja ulatusega näitajaid. Naaberaasta väärtuse ülekandmine muudaks järelduse eksitavaks.",
          citations: [methodCitation],
        }],
        note: "Puuduv võrreldav paar ei tähenda, et raiet või juurdekasvu sel aastal ei olnud; see tähendab ainult, et kasutatud ametlikus reas ei ole mõlemat väärtust avaldatud.",
      },
      related: [
        "Milliste aastate kohta on mõlemad väärtused olemas?",
        "Mis vahe on kogu- ja netojuurdekasvul?",
        "Mida see viimase viie aasta jooksul tähendab?",
      ],
    };
  }
  const lastFiveIntent = /\b(?:viimase\s+(?:5|viie)|5\s+aasta|viie\s+aasta|viis\s+aastat)\b/iu.test(String(query));

  if (lastFiveIntent) {
    const window = allObservations.slice(-5);
    const comparableWindow = window.filter((item) => item.increment !== null && item.removals !== null);
    const missingWindow = window.filter((item) => item.increment === null || item.removals === null).map((item) => item.year);
    const availableWindow = comparableWindow
      .map((item) => `${item.year}: eemaldamine ${etDecimal(item.removals, 1)} ja netojuurdekasv ${etDecimal(item.increment, 1)} mln m³ koorega`)
      .join("; ");
    const higherYears = comparableWindow.filter((item) => item.removals > item.increment).map((item) => String(item.year));
    const lowerYears = comparableWindow.filter((item) => item.removals < item.increment).map((item) => String(item.year));
    const equalYears = comparableWindow.filter((item) => item.removals === item.increment).map((item) => String(item.year));
    const relations = [
      higherYears.length ? `${etYearList(higherYears)}. aastal oli eemaldamine suurem` : "",
      lowerYears.length ? `${etYearList(lowerYears)}. aastal oli eemaldamine väiksem` : "",
      equalYears.length ? `${etYearList(equalYears)}. aastal olid näitajad võrdsed` : "",
    ].filter(Boolean).join("; ");
    const startYear = window[0]?.year;
    const endYear = window.at(-1)?.year;
    const nextUnavailableYear = Number.isInteger(endYear) ? endYear + 1 : null;
    const latestWindow = comparableWindow.at(-1);
    const latestWindowRelation = latestWindow
      ? latestWindow.removals > latestWindow.increment
        ? "suurem"
        : latestWindow.removals < latestWindow.increment ? "väiksem" : "sama suur"
      : null;
    const incompleteWindow = window.length < 5 || missingWindow.length > 0;
    return {
      answer: {
        eyebrow: "Allikapõhine koondvastus",
        title: incompleteWindow
          ? `${startYear}–${endYear} viie aasta kohta ei saa lünkade tõttu täielikku trendi anda`
          : `Viie värskeima võrdlusaasta reas oli ${latestWindow.year}. aastal eemaldamine netojuurdekasvust ${latestWindowRelation}`,
        intro: `„Viimased viis aastat” tähendab siin Eurostati kasutatud väljavõtte viit värskeimat allikas olevat aastat (${startYear}–${endYear}); ${nextUnavailableYear}. aasta rida selles väljavõttes veel ei ole. Avaldatud on need võrreldavad paarid: ${availableWindow || "ühtegi täielikku paari ei ole"}. ${relations ? `${relations}.` : ""}${missingWindow.length ? ` Aastate ${missingWindow.join(" ja ")} kohta puudub vähemalt üks võrreldav väärtus, seega ei moodusta need punktid täielikku viie aasta trendi.` : ""}${forestObservationStatusSentence(comparableWindow)}`,
        introCitations: [eurostatCitation],
        parts: [
          ...(handbookCitation ? [{
            title: "Mida Eurostati eemaldamine tähendab",
            text: "EFA removals mõõdab perioodil metsast eemaldatud elusate ja surnud puude mahtu koorega ning võib hõlmata metsast ära toodud looduslikku väljalangemist, varem langetatud puitu ja mittetüvepuitu. See ei ole üks-ühele sama mis ühe aasta SMI raiemaht.",
            citations: [handbookCitation],
          }] : []),
          ...(fiveYearCitation ? [{
            title: "KAURi eraldi viie raiehooaja vaade",
            text: "Keskkonnaagentuuri 2024. aasta SMI ülevaates oli 2018/2019–2022/2023 viie raiehooaja keskmine raiemaht 11,2 miljonit tihumeetrit; 2021. aasta hinnang oli 10,0 ja 2022. aasta hinnang 12,1 miljonit tihumeetrit. See ei ole sama ajavahemik ega üks-ühele sama näitaja kui Eurostati removals-rida.",
            citations: [fiveYearCitation],
          }] : []),
          {
            title: "Pikem võrdlus annab teise vaate",
            text: "Keskkonnaagentuuri järgi oli viimase kümnendi keskmisena elusate puude raiemaht majandatavate metsade netojuurdekasvust kõrgem, kuid 20 aasta vaates madalam. Üks lühike või lünklik periood ei tõenda üksi pikaajalist üle- ega alaraiet.",
            citations: [methodCitation],
          },
        ].slice(0, 3),
        note: "Puuduvaid aastaid ei ole interpoleeritud. Eurostati puidu eemaldamise, SMI raiemahu ning kogu- ja netojuurdekasvu mõisted ja ulatused ei ole omavahel asendatavad.",
      },
      related: [
        "Mis vahe on kogu- ja netojuurdekasvul?",
        "Kuidas on raiemaht 20 aasta jooksul muutunud?",
        "Miks netojuurdekasv viimastel aastatel vähenes?",
      ],
    };
  }

  const latest = requestedObservation || observations.at(-1);
  const latestDifference = Math.abs(latest.removals - latest.increment);
  const removalsGreater = latest.removals > latest.increment;
  const removalsLower = latest.removals < latest.increment;
  const predicateResult = comparisonIntent === "removals-greater"
    ? removalsGreater
    : comparisonIntent === "removals-lower" ? removalsLower : null;
  const relation = removalsGreater
    ? `puidu eemaldamine ületas netojuurdekasvu umbes ${etDecimal(latestDifference, 1)} miljoni m³ võrra (maht koorega)`
    : removalsLower
      ? `puidu eemaldamine jäi netojuurdekasvust umbes ${etDecimal(latestDifference, 1)} miljoni m³ võrra madalamaks (maht koorega)`
      : "puidu eemaldamine ja netojuurdekasv olid võrdsed";
  const qualitySentence = forestObservationStatusSentence([latest]);
  const directTitle = predicateResult === null
    ? `${latest.year}. aastal oli puidu eemaldamine netojuurdekasvust ${removalsGreater ? "suurem" : removalsLower ? "väiksem" : "sama suur"}`
    : `${latest.year}. aasta võrreldavate andmete järgi ${predicateResult ? "jah" : "ei"}`;
  const directLead = predicateResult === null ? "" : `${predicateResult ? "Jah" : "Ei"}. `;

  return {
    answer: {
      eyebrow: "Allikapõhine koondvastus",
      title: directTitle,
      intro: `${directLead}Eurostati metsa arvepidamises oli Eesti ${latest.year}. aasta puidu eemaldamine (removals) ${etDecimal(latest.removals, 1)} miljonit m³ koorega ja netojuurdekasv ${etDecimal(latest.increment, 1)} miljonit m³ koorega; ${relation}.${qualitySentence}`,
      introCitations: [eurostatCitation],
      parts: [
        ...(handbookCitation ? [{
          title: "Mida Eurostati eemaldamine tähendab",
          text: "EFA removals mõõdab perioodil metsast eemaldatud elusate ja surnud puude mahtu koorega ning võib hõlmata metsast ära toodud looduslikku väljalangemist, varem langetatud puitu ja mittetüvepuitu. See ei ole üks-ühele sama mis ühe aasta SMI raiemaht.",
          citations: [handbookCitation],
        }] : []),
        {
          title: "Eraldi KAURi raiemahu võrdlus",
          text: "Netojuurdekasv on kogu juurdekasv pärast loodusliku suremuse mahaarvamist. Keskkonnaagentuur kirjutab eraldi majandatavate metsade SMI võrdluses, et elusate puude raiemaht oli viimase kümnendi keskmisena netojuurdekasvust kõrgem, kuid 20 aasta vaates madalam.",
          citations: [methodCitation],
        },
        ...(fiveYearCitation ? [{
          title: "Lühem taust",
          text: "SMI järgi oli 2018/2019–2022/2023 viie raiehooaja keskmine raiemaht 11,2 miljonit tihumeetrit. See taust ei ole sama ajavahemik ega üks-ühele sama näitaja kui Eurostati puidu eemaldamine ning ei anna üksi lõplikku hinnangut metsamajanduse kestlikkusele.",
          citations: [fiveYearCitation, methodCitation],
        }] : []),
      ],
      note: "Eurostati puidu eemaldamine (removals), SMI raiemaht ning kogu- ja netojuurdekasv ei ole üks-ühele asendatavad. Järeldus kehtib ainult samas allikas, aastas ja ulatuses võrreldud näitajatele.",
    },
    related: [
      "Mida see viimase viie aasta jooksul tähendab?",
      "Mis vahe on kogu- ja netojuurdekasvul?",
      "Kuidas on raiemaht 20 aasta jooksul muutunud?",
    ],
  };
}

export async function loadStructuredIndicatorDocuments(query, options = {}) {
  const timeoutMs = Math.max(250, Math.min(Number(options.timeoutMs) || 2_000, 4_000));
  const documents = [];
  if (isMunicipalWasteRecyclingRateQuery(query)) {
    try {
      const result = await fetchOfficialDataset(MUNICIPAL_WASTE_RECYCLING_CSV_URL, {
        timeoutMs,
        signal: options.signal,
      });
      documents.push(...municipalWasteIndicatorFromCsv(query, result.body));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The rest of the ranked official search remains available.
    }
  }
  if (isForestHarvestBalanceQuery(query)) {
    try {
      const result = await fetchOfficialJsonDataset(FOREST_BALANCE_EUROSTAT_API_URL, {
        timeoutMs,
        signal: options.signal,
      });
      documents.push(...forestHarvestBalanceDocumentsFromJson(query, JSON.parse(result.body), { stale: result.stale }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      documents.push(...forestBalanceKaurDocuments());
    }
  }
  return documents;
}
