import { normalize } from "./search_query_terms.mjs";

const WASTE_FACILITIES_COUNTIES = [
  ["ida viru", "Ida-Virumaa"],
  ["laane viru", "Lääne-Virumaa"],
  ["harju", "Harjumaa"],
  ["hiiu", "Hiiumaa"],
  ["jogeva", "Jõgevamaa"],
  ["jarva", "Järvamaa"],
  ["laane", "Läänemaa"],
  ["polva", "Põlvamaa"],
  ["parnu", "Pärnumaa"],
  ["rapla", "Raplamaa"],
  ["saare", "Saaremaa"],
  ["tartu", "Tartumaa"],
  ["valga", "Valgamaa"],
  ["viljandi", "Viljandimaa"],
  ["voru", "Võrumaa"],
];
const UNSUPPORTED_WASTE_FACILITY_FACT_REQUEST = /\b(?:kas|milline|millised|mitu|arv|loetle|nimeta|aadress|lahim|avatud|lahti|praegu|hetkel|tana|homme|kell|telefon|kontakt|hind|tasuta|votab|voetakse|vastu|kehtiv|staatus|luba|operaator|kulkapp|elektroonikaromu|asbest|rehv|ohtlik)\w*\b/u;

function wasteFacilitiesCounty(normalized) {
  return WASTE_FACILITIES_COUNTIES.find(([stem]) => {
    const pattern = new RegExp(`\\b${stem.replace(" ", "[ -]")}(?:maa\\w*)?\\b`, "u");
    return pattern.test(normalized);
  })?.[1] || null;
}

export function wasteFacilitiesNavigationContext(query) {
  const normalized = normalize(query);
  const county = wasteFacilitiesCounty(normalized);
  const requestsFacilitiesMap = /\b(?:jaatmekaitluskoh|jaatmejaam)\w*\b/u.test(normalized)
    && Boolean(county || /\bkaart\w*\b/u.test(normalized));
  if (!requestsFacilitiesMap || UNSUPPORTED_WASTE_FACILITY_FACT_REQUEST.test(normalized)) return null;
  return { county };
}

export function specificQuestionMismatch(query, text) {
  const cleanQuery = normalize(query);
  const sourceText = normalize(text);
  if (/(?:metsa)?poleng|tulekahju|tuleoht/u.test(cleanQuery)
    && /(?:hoida|valtida|ennetada|kaitsta|ennetus|torje)/u.test(cleanQuery)) {
    return !/(?:poleng|tulekahju|tuleoht)/u.test(sourceText);
  }
  if (/eraldis/u.test(cleanQuery) && /(?:taotle|taotlus|taotlemine)/u.test(cleanQuery)) {
    return !/(?:eraldis|taotl|metsateatis)/u.test(sourceText);
  }
  return false;
}

export function ambiguousDomainGuidanceIds(root) {
  const ids = [];
  if (root === "ohk" || root === "ohukvaliteet" || root === "saaste") {
    ids.push("air-catalogue", "air-quality-live");
  } else if (root === "energia" || root === "elektriauto") {
    ids.push("renewable-energy-guidance");
  } else if (root === "vesi" || root === "jarv" || root === "jogi" || root === "meri" || root === "pohjavesi") {
    ids.push("groundwater-overview", "water-monitoring");
  } else if (root === "jaat" || root === "prugi") {
    ids.push("waste-reporting-data");
  } else if (root === "kliima" || root === "ilm" || root === "temperatuur" || root === "sademed") {
    ids.push("historical-weather-data", "weather-overview");
  } else if (root === "elurikkus" || root === "looduskaitse" || root === "kaitseala") {
    ids.push("biodiversity");
  } else if (root === "seire" || root === "andmed") {
    ids.push("kese-monitoring", "official-data-services");
  }
  return ids;
}
