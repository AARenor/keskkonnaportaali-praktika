import { isReviewedEstonianMunicipalityIdentity, reviewedEstonianForestryMunicipalityScope } from "./municipalities.mjs";
import { PERSON_CONTEXT_STOPWORD_PATTERN, normalize } from "./search_query_terms.mjs";
import {
  ANY_CASE_CONNECTOR_NAMED_PERSON_PRIVATE_ASSET_PATTERN,
  ANY_CASE_ESTONIAN_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN,
  ANY_CASE_ESTONIAN_NAMED_PERSON_PRIVATE_LAND_PATTERN,
  ANY_CASE_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN,
  ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN,
  ANY_CASE_OWNERSHIP_TO_NAMED_PERSON_PATTERN,
  ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN,
  CAPTURED_ANY_CASE_PERSON_NAME_SOURCE,
  CAPTURED_ESTONIAN_GENITIVE_PERSON_NAME_SOURCE,
  ECOLOGICAL_MODIFIER_PATTERN,
  ECOLOGICAL_SUBJECT_PATTERN,
  ENGLISH_PERSON_TOKEN_SOURCE,
  ENGLISH_PRIVATE_ASSET_SOURCE,
  ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE,
  PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE,
  PUBLIC_ORGANIZATION_PATTERN,
  removeFirstPublicOrganizationName,
  CLAUSE_LEADING_NAMED_PERSON_PRIVATE_ASSET_PATTERN,
} from "./search_privacy_patterns.mjs";
import { explicitHyphenatedReviewedCountyTokenIndexes } from "./search_privacy_public_forest.mjs";
function hasEarlyNamedPersonSensitiveAssociation(value) {
  const text = String(value || "");
  const pairIsPersonShaped = (first, second) => (
    !PERSON_CONTEXT_STOPWORD_PATTERN.test(first)
    && !PERSON_CONTEXT_STOPWORD_PATTERN.test(second)
    && !PUBLIC_ORGANIZATION_PATTERN.test(`${first} ${second}`)
    && removeFirstPublicOrganizationName(`${first} ${second}`).trim() !== ""
    && !isReviewedEstonianMunicipalityIdentity(`${first} ${second}`)
    && !NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(first)
    && !NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(second)
    && !(ECOLOGICAL_SUBJECT_PATTERN.test(second)
      && (ECOLOGICAL_SUBJECT_PATTERN.test(first)
        || ECOLOGICAL_MODIFIER_PATTERN.test(first)))
  );
  const namePartsContainPersonPair = (nameParts, matchedText) => {
    if (nameParts.length < 2
      || nameParts.some((part) => NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(part))
      || removeFirstPublicOrganizationName(nameParts.join(" ")).trim() === ""
      || isReviewedEstonianMunicipalityIdentity(nameParts.join(" "))) return false;
    const countyTokenIndexes = explicitHyphenatedReviewedCountyTokenIndexes(nameParts, matchedText);
    const candidatePairs = nameParts.length === 3
      ? [[0, 1], [1, 2]]
      : [[0, 1]];
    return candidatePairs.some(([firstIndex, lastIndex]) => {
      if (countyTokenIndexes.has(firstIndex) || countyTokenIndexes.has(lastIndex)) return false;
      const first = nameParts[firstIndex];
      const last = nameParts[lastIndex];
      return (
        !OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN.test(first)
        && !OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN.test(last)
        && pairIsPersonShaped(first, last)
        && removeFirstPublicOrganizationName(`${first} ${last}`).trim() !== ""
        && !isReviewedEstonianMunicipalityIdentity(`${first} ${last}`)
      );
    });
  };
  ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN)) {
    if (!pairIsPersonShaped(match[1], match[2])) continue;
    const suffix = text.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 80);
    if (/^\s+(?:habitat|range|ecology|environment|description|species|population|elupai[kg]\w*|keskkond\w*|kirjeldus\w*)\b/iu.test(suffix)) continue;
    ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN.lastIndex = 0;
    return true;
  }
  ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN.lastIndex = 0;
  ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN)) {
    const nameParts = [match[1], match[2], match[3]].filter(Boolean);
    if (!namePartsContainPersonPair(nameParts, match[0])) continue;
    const suffix = text.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 50);
    if (/^\s+(?:agency|authority|board|company|corporation|council|department|government|institute|institution|office|organization|organisation|service|team|university)\b/iu.test(suffix)) continue;
    ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN.lastIndex = 0;
    return true;
  }
  ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN.lastIndex = 0;
  for (const pattern of [
    ANY_CASE_OWNERSHIP_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_ROLE_LABEL_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_ESTONIAN_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_NAMED_PERSON_OWNERSHIP_FIELD_PATTERN,
    ANY_CASE_FOREST_METRIC_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_FOREST_ASSET_IN_NAMED_PERSON_NAME_PATTERN,
    ANY_CASE_NAMED_PERSON_TO_FOREST_ASSET_PATTERN,
    ANY_CASE_FOREST_ASSET_ROLE_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_NAMED_PERSON_APPOSITIVE_ASSET_ROLE_PATTERN,
    ANY_CASE_NAMED_PERSON_PRIVATE_ASSET_ROLE_PATTERN,
    ANY_CASE_FOREST_ASSET_GIVEN_TO_NAMED_PERSON_PATTERN,
  ]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const nameParts = [match[1], match[2], match[3]].filter(Boolean);
      if (pattern === ANY_CASE_NAMED_PERSON_OWNERSHIP_FIELD_PATTERN
        && nameParts.some((part) => /^(?:county\w*|maakon\w*)$/iu.test(part))) continue;
      // The optional third token is intentionally permissive so three-part
      // names work, but it can also consume the first word after a two-part
      // name ("Jaan Tamm in Estonia" or "Jaan Tamm forest area"). Check both
      // adjacent pairs. This also keeps "Anna Maria Tamm" private even though
      // “Anna” is an Estonian request verb. Explicit organization designators,
      // reviewed municipalities and ecological/common-noun pairs stay public.
      if (!namePartsContainPersonPair(nameParts, match[0])) continue;
      if (pattern === ANY_CASE_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN
        || pattern === ANY_CASE_ESTONIAN_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN) {
        const relationWindow = text.slice(
          Math.max(0, (match.index || 0) - 70),
          Math.min(text.length, (match.index || 0) + match[0].length + 70),
        );
        if (!/(?<!\p{L})(?:metsamaa\w*|metsaala\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*|forest|woodland)(?!\p{L})/iu.test(relationWindow)) continue;
      }
      if (pattern === ANY_CASE_NAMED_PERSON_OWNERSHIP_FIELD_PATTERN
        || pattern === ANY_CASE_NAMED_PERSON_APPOSITIVE_ASSET_ROLE_PATTERN) {
        const relationWindow = text.slice(
          Math.max(0, (match.index || 0) - 55),
          Math.min(text.length, (match.index || 0) + match[0].length + 70),
        );
        const hasAssetContext = /(?<!\p{L})(?:katastri\w*|kinnist\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|metsamaa\w*|metsaala\w*|metsaomanik\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*|puurkaev\w*|property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|forest|woodland)(?!\p{L})/iu.test(relationWindow);
        const hasExplicitPublicAsset = /(?<!\p{L})(?:(?:public|state(?:[-\s]+owned)?|municipal|government|national)[\s\p{Pd}_]+(?:forest|woodland|land|property|parcel|plot|well|borehole)|(?:riigi|avalik|munitsipaal|rahvus|valla|linna)[\s\p{Pd}_]*(?:mets\w*|metsamaa\w*|maa\w*|kinnist\w*|puurkaev\w*))(?!\p{L})/iu.test(relationWindow);
        if (!hasAssetContext || hasExplicitPublicAsset) continue;
      }
      const suffix = text.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 50);
      if (/^\s+(?:agency|authority|board|company|corporation|council|department|government|institute|institution|office|organization|organisation|service|team|university)\b/iu.test(suffix)) continue;
      pattern.lastIndex = 0;
      return true;
    }
    pattern.lastIndex = 0;
  }
  return false;
}

function hasEarlyBoundedNamedPrivateAssetAssociation(value) {
  const text = String(value || "");
  if (ENGLISH_POSSESSIVE_PRONOUN_PRIVATE_ASSET_PATTERN.test(text)) return true;
  for (const pattern of [
    ENGLISH_SINGLE_TOKEN_POSSESSIVE_PRIVATE_ASSET_PATTERN,
    ENGLISH_CONNECTOR_SINGLE_TOKEN_POSSESSIVE_PRIVATE_ASSET_PATTERN,
  ]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const possessor = match[1] || "";
      const normalizedPossessor = normalize(possessor);
      const isReviewedPublicPossessor = OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN.test(possessor)
        || NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(possessor)
        || PUBLIC_ORGANIZATION_PATTERN.test(possessor)
        || removeFirstPublicOrganizationName(possessor).trim() === ""
        || Boolean(reviewedEstonianForestryMunicipalityScope(possessor))
        || /^(?:today|tomorrow|yesterday|world|country|nation|europe|eu|lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse)$/u.test(normalizedPossessor)
        || ECOLOGICAL_SUBJECT_PATTERN.test(possessor)
        || ECOLOGICAL_MODIFIER_PATTERN.test(possessor);
      if (!isReviewedPublicPossessor) {
        pattern.lastIndex = 0;
        return true;
      }
    }
    pattern.lastIndex = 0;
  }
  const pairIsPersonShaped = (first, second) => (
    !PERSON_CONTEXT_STOPWORD_PATTERN.test(first)
    && !PERSON_CONTEXT_STOPWORD_PATTERN.test(second)
    && !OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN.test(first)
    && !OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN.test(second)
    && !PUBLIC_ORGANIZATION_PATTERN.test(`${first} ${second}`)
    && !isReviewedEstonianMunicipalityIdentity(`${first} ${second}`)
    && !NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(first)
    && !NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(second)
    && !(ECOLOGICAL_SUBJECT_PATTERN.test(second)
      && (ECOLOGICAL_SUBJECT_PATTERN.test(first)
        || ECOLOGICAL_MODIFIER_PATTERN.test(first)))
  );
  const namePartsContainPersonPair = (nameParts, matchedText) => {
    if (nameParts.length < 2
      || nameParts.some((part) => NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(part))
      || removeFirstPublicOrganizationName(nameParts.join(" ")).trim() === ""
      || isReviewedEstonianMunicipalityIdentity(nameParts.join(" "))) return false;
    const countyTokenIndexes = explicitHyphenatedReviewedCountyTokenIndexes(nameParts, matchedText);
    const pairs = nameParts.length === 3
      ? [[0, 1], [1, 2]]
      : [[0, 1]];
    return pairs.some(([firstIndex, secondIndex]) => (
      !countyTokenIndexes.has(firstIndex)
      && !countyTokenIndexes.has(secondIndex)
      && pairIsPersonShaped(nameParts[firstIndex], nameParts[secondIndex])
    ));
  };
  for (const pattern of [
    ANY_CASE_CONNECTOR_NAMED_PERSON_PRIVATE_ASSET_PATTERN,
    CLAUSE_LEADING_NAMED_PERSON_PRIVATE_ASSET_PATTERN,
    ANY_CASE_ESTONIAN_NAMED_PERSON_PRIVATE_LAND_PATTERN,
    ANY_CASE_ESTONIAN_NAMED_PERSON_PRIVATE_COMPOUND_ASSET_PATTERN,
    HYPHENATED_ESTONIAN_NAMED_PERSON_PRIVATE_ASSET_PATTERN,
    ANY_CASE_NAMED_PERSON_FOREST_CUTTING_AGE_PATTERN,
    ANY_CASE_OWNERSHIP_TO_NAMED_PERSON_PATTERN,
  ]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const nameParts = [match[1], match[2], match[3]].filter(Boolean);
      if (namePartsContainPersonPair(nameParts, match[0])) {
        pattern.lastIndex = 0;
        return true;
      }
    }
    pattern.lastIndex = 0;
  }
  return false;
}
const ANY_CASE_ESTONIAN_NAMED_PERSON_PRIVATE_COMPOUND_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${CAPTURED_ESTONIAN_GENITIVE_PERSON_NAME_SOURCE}\s+era[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}(?!\p{L})`,
  "giu",
);
const HYPHENATED_ESTONIAN_NAMED_PERSON_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(${ENGLISH_PERSON_TOKEN_SOURCE})\s*[\p{Pd}./·:_]+\s*(${ENGLISH_PERSON_TOKEN_SOURCE})\s+(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*(?:mets(?:a(?:s|st|le|l|ga)?|ad|ade)?|metsamaa\p{L}*|metsaala\p{L}*|kinnist(?:u|ut|ul|ult|ule|uga|ute|uid)?|maa(?:u|ü)ksus\p{L}*|maat(?:ü|u)k\p{L}*|puurkaev\p{L}*|kaev(?:u|us|ust|ule|ul|uga)?)(?!\p{L})`,
  "giu",
);
const ENGLISH_SINGLE_POSSESSIVE_PRIVATE_ASSET_SOURCE = String.raw`(?:(?:(?:the|this|that|specific|private|family|household|residential|neighbor(?:ing)?|neighbour(?:ing)?|adjacent|forest|woodland|land|cadastral|groundwater|riverside|lakeshore|wetland)\s+){0,3}(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|cottage|premises|site|landholding|holding)|(?:forest|woodland)\s+(?:area|cover(?:age)?))`;
const ENGLISH_SINGLE_TOKEN_POSSESSIVE_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})([\p{L}][\p{L}'’.-]{1,39}?)(?:'s|’s)\s+${ENGLISH_SINGLE_POSSESSIVE_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "giu",
);
const ENGLISH_CONNECTOR_SINGLE_TOKEN_POSSESSIVE_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:for|on|of|at|within|in)\s+(?:the\s+)?([\p{L}][\p{L}'’.-]{1,39}?)(?:'s|’s)\s+${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "giu",
);
const ENGLISH_PRONOUN_PRIVATE_ASSET_SOURCE = String.raw`(?:(?:(?:private|family|household|residential|neighbor(?:ing)?|neighbour(?:ing)?|adjacent|forest|woodland|land|cadastral)\s+){0,3}(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|cottage|premises|site|landholding|holding))`;
const ENGLISH_POSSESSIVE_PRONOUN_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:my|your|his|her|our|their)\s+${ENGLISH_PRONOUN_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "iu",
);
const ANY_CASE_ROLE_LABEL_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:title(?:\s+holder)?|beneficiar(?:y|ies)|holders?|possessors?|proprietors?|landholders?|rights?\s+holders?|kasutaja|õigustatud\s+isik|valdaja|haldaja|kasusaaja)\s*(?:[:=]\s*|\p{Pd}+\s*|\s+(?:is|of|on)\s+)${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_NAMED_PERSON_OWNERSHIP_FIELD_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?:'s|’s)?(?:\s*[,;:]\s*|\s*\p{Pd}+\s*|\s+)(?:ownership|owner(?:ship)?\s+(?:category|class|type|status)|is\s+(?:(?:the|a)\s+)?(?:registered\s+)?owner|owns?|possesses?|manages?|administers?|operates?|maintains?|controls?|holds?|leases?|rents?|stewards?|(?:forest|woodland)\s+(?:area|cover(?:age)?)|metsamaa\w*(?:\s+pindala\w*)?|metsaala\w*|metsaomanik\w*|omandis|omandi\s+j[aä]rgi|omandivormi\s+j[aä]rgi|omanikuliigi\s+(?:j[aä]rgi|kaupa)|nimel|valduses|kasutuses|kasutada|omab|omavad|haldab|haldavad|hallata|hallatav\w*|valdab|valdavad|kuulu(?:b|vad)|kuuluv\w*)(?!\p{L})`,
  "giu",
);
const ANY_CASE_FOREST_METRIC_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:forest|woodland)\s+(?:area|cover(?:age)?)\s+(?:of|for)\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_NAMED_PERSON_FOREST_CUTTING_AGE_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${CAPTURED_ESTONIAN_GENITIVE_PERSON_NAME_SOURCE}\s+(?:metsa|metsamaa|puistu)\w*\s+raievanus\w*(?!\p{L})`,
  "giu",
);
const ANY_CASE_FOREST_ASSET_IN_NAMED_PERSON_NAME_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE}\s+(?:is\s+)?(?:registered\s+|recorded\s+)?(?:in|under)\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?:'s|’s)?\s+name(?!\p{L})`,
  "giu",
);
const ANY_CASE_NAMED_PERSON_TO_FOREST_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}\s+(?:(?:is\s+)?(?:registered|recorded|assigned|transferred|attributed|conveyed|granted)\s+(?:to|under|for|with)\s+|(?:acquired|bought|purchased|obtained|inherited|received)\s+)(?:(?:a|the)\s+)?${PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_FOREST_ASSET_ROLE_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE}(?:\s+pindala\w*)?\s+(?:owner|manager|administrator|operator|holder|possessor|beneficiar(?:y|ies)|haldaja|valdaja|kasutaja|kasusaaja|kasutusõigus|õigustatud\s+isik)\s*[:=\p{Pd}]*\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_NAMED_PERSON_APPOSITIVE_ASSET_ROLE_PATTERN = new RegExp(
  String.raw`(?<!\p{L})with\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}\s+as\s+(?:(?:the|a)\s+)?(?:owner|manager|administrator|operator|holder|possessor|beneficiar(?:y|ies)|proprietor|landholder)(?!\p{L})`,
  "giu",
);
const ANY_CASE_NAMED_PERSON_PRIVATE_ASSET_ROLE_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}\s+(?:eraomand\w*|era(?:puur)?kaev\w*|erakinnist\w*|eramaa\w*|eramets\w*|isiklik\w*\s+(?:omand|kaev|kinnist|maa|mets)\w*)\s+(?:(?:tegelik|ametlik|registreeritud|õiguslik|oiguslik|praegune)\w*\s+)?(?:(?:eest\s+)?vastutav\s+isik|haldusõiguse\s+kandja\w*|haldus(?:-|\s*)õiguse\s+kandja\w*|hoonestaja\w*|hoonestus(?:-|\s*)õiguse\s+kandja\w*|haldur\w*|haldaja\w*|valdaj\w*|loaomanik\w*|omanik\w*|kasutaja\w*|(?:permit|licen[cs]e|rights?)(?:[-\s]+)holders?|permittees?|licensees?|owners?|managers?|administrators?|operators?|users?|occupants?|tenants?|custodians?)(?!\p{L})`,
  "giu",
);
const ANY_CASE_FOREST_ASSET_GIVEN_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE}\s+anti\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN = /^(?:agenc(?:y|ies)|association\w*|authority|board|business|city|commission|committee|company|corporation|council|department|foundation|government|institute|institution|llc|ltd|ministry|municipalit\w*|nonprofit|office|organization|organisation|service|team|trust|university|amet\w*|asutus\w*|büroo\w*|buroo\w*|linnavalitsus\w*|ministeerium\w*|omavalitsus\w*|osakond\w*|selts\w*|teenistus\w*|vallavalitsus\w*|ühing\w*|uhing\w*)$/iu;
const OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN = /^(?:against|all|alongside|and|annual\w*|area|available|administrator\w*|beneficiar\w*|bind|binding|binds|calculat\w*|caretaker\w*|category|class|compare|comparison|compliance|conservation|contractor\w*|corporate|county|current|custodian\w*|data|each|ecological|environmental|estonia\w*|estimat\w*|every|fiduciar\w*|figure|forest|forests|government|group|historical|holder\w*|individual|inventor\w*|it|land|landowner\w*|latest|leased|legal|management|manag\w*|measur\w*|measurement\w*|middle|earth|municipal|municipality|national|natural|official|operator\w*|or|overall|owned|owner|owners|ownership|people|period|possessor\w*|post|privat\w*|proprietor\w*|protected|protection|public|published|recent|relative|reported|rented|rule|rules|sector|source|state|status|steward\w*|survey\w*|tenant\w*|tenure|title|total|trustee\w*|type|value|versus|volunteer\w*|vs|was|were|whoever|woodland|woodlands|years?|ajalool\w*|andm\w*|aasta\w*|avalik\w*|eesti\w*|eramets\w*|hallatav\w*|haldaj\w*|hinnang\w*|kaitst\w*|kategoori\w*|kasutaj\w*|kehti\w*|klass\w*|kohustus\w*|kogu|loodus\w*|maaomanik\w*|maakon\w*|majandat\w*|mets\w*|metsamaa\w*|millis\w*|munitsipaal\w*|omanik\w*|omandivorm\w*|peab|tohib|v[õo]ib|v[õo]iks|periood\w*|pindala\w*|praegune|reegl\w*|registreeritud|renditud|riigi\w*|riiklik\w*|staatus\w*|tüüp\w*|tuup\w*|uusim|valdaj\w*|viimane|v[õo]rdle|üld\w*|uld\w*)$/iu;

export {
  hasEarlyNamedPersonSensitiveAssociation,
  hasEarlyBoundedNamedPrivateAssetAssociation,
};
