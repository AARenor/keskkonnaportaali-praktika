import { isHistoricalPeriodQuery } from "./query_historical_period.mjs";
import { analyzeQueryIntent } from "./query_intent.mjs";
import { isStatisticsWaterAbstractionQuery } from "./statistics.mjs";
import {
  ADMIN_CONTEXT_ROOTS,
  AMBIGUOUS_ROOTS,
  DOMAIN_FAMILY_BY_ROOT,
  FOREST_STAND_PATTERN,
  FOREST_VOCABULARY_PATTERN,
  FOREIGN_SCRIPT_PATTERN,
  forestEvidenceIntent,
  hasEnglishOnlyQueryFrame,
  isMultilingualSearchEnabled,
  isTopicDataOverviewQuery,
  normalize,
  queryTerms,
  rootIsDomain,
  russianKeywordRoots,
  textHasTallinnLocation,
} from "./search_query_terms.mjs";
import { canonicalSecurityText, canonicalizePublicSearchQuery, decodeSecurityEscapes } from "./search_query_canonicalization.mjs";
import { containsPrivatePersonLookup } from "./search_query_privacy.mjs";
import { CADASTRE_PATTERN } from "./search_privacy_protected_area.mjs";
import { hasForeignPrivatePersonClause } from "./search_privacy_clauses.mjs";
import {
  INSTITUTIONAL_CONTACT_CHANNEL_PATTERN,
  PRIVATE_POSTAL_FIELD_PATTERN,
  PUBLIC_ORGANIZATION_PATTERN,
} from "./search_privacy_patterns.mjs";
import {
  isReviewedGenericProtectedAreaConsentQuery,
  isReviewedPublicOrganizationProtectedBuildingContactQuery,
  reviewedMunicipalityInstitutionalContactScope,
} from "./search_privacy_public_exceptions.mjs";
import { containsUnsafeInstruction } from "./search_query_safety.mjs";
import {
  classifyForestryGeographyScope,
  isReviewedNationalUnsupportedForestAreaBreakdownQuestion,
  removeFirstReviewedMunicipalityOrganizationName,
  requestsUnsupportedForestAreaBreakdown,
  requestsUnsupportedForestAreaTimeSeries,
  requestsUnsupportedForestAreaUnit,
  reviewedEstonianForestryMunicipalityScope,
} from "./municipalities.mjs";
import { reviewedDataSourceSource } from "./search_selectors.mjs";
export function isForestRelatedQuery(value) {
  const canonical = canonicalizePublicSearchQuery(value, { maximumLength: 1_400 });
  if (!canonical.ok) return false;
  // Without its dots "käsk" (an order) reads as "kask" (birch).
  const text = canonical.query.replace(/\bkäsk\p{L}*/giu, " ");
  const intent = analyzeQueryIntent(text);
  return FOREST_VOCABULARY_PATTERN.test(normalize(text))
    || Boolean(forestEvidenceIntent(text))
    || intent.topic === "clearcut";
}
function isPublicOrganizationContactQuery(value) {
  const text = canonicalSecurityText(value);
  const textWithoutReviewedMunicipality = removeFirstReviewedMunicipalityOrganizationName(text);
  const hasReviewedMunicipalityOrganization = normalize(textWithoutReviewedMunicipality) !== normalize(text);
  return (PUBLIC_ORGANIZATION_PATTERN.test(text) || hasReviewedMunicipalityOrganization)
    && (INSTITUTIONAL_CONTACT_CHANNEL_PATTERN.test(text)
      || PRIVATE_POSTAL_FIELD_PATTERN.test(text))
    && !containsPrivatePersonLookup(text);
}



function clarificationFor(root) {
  if (["vesi", "jarv", "jogi", "meri", "pohjavesi"].includes(root)) {
    return "Palun lisa veekogu nimi või registrikood, soovitud näitaja ning aasta või ajavahemik.";
  }
  if (["ohk", "ohukvaliteet", "saaste"].includes(root)) {
    return "Palun lisa asukoht, saasteaine või näitaja ning kas soovid hetkeolukorda või pikemat perioodi.";
  }
  if (["kliima", "ilm", "temperatuur", "sademed"].includes(root)) {
    return "Palun lisa asukoht, näitaja ja ajavahemik. Ilmaprognoosi puhul märgi ka päev.";
  }
  if (["jaat", "prugi", "rehv"].includes(root)) {
    return "Palun lisa jäätmeliik, piirkond ning kas otsid käitlusjuhist, kogust või käitluskohta.";
  }
  if (["looduskaitse", "elurikkus", "kaitseala", "natura", "liik"].includes(root)) {
    return "Palun lisa liik, ala, asukoht või konkreetne tegevus, mille kohta infot vajad.";
  }
  if (["energia", "elektriauto", "transport"].includes(root)) {
    return "Palun täpsusta, kas soovid heite, energiakulu, elukaare, toetuse või muu keskkonnamõju infot.";
  }
  return "Palun lisa teema, näitaja, piirkond või ajavahemik, et saaksin valida õige ametliku allika.";
}

export function analyzePublicSearchQuery(query, options = {}) {
  const canonicalInput = canonicalizePublicSearchQuery(query, options);
  const cleanQuery = canonicalInput.ok ? canonicalInput.query : "";
  const normalized = normalize(cleanQuery);
  // queryTerms only sees the canonicalized query, where Cyrillic is folded
  // or stripped. Merge Russian roots from the raw input so Russian queries
  // reach scope gating and retrieval instead of always reading as empty.
  const roots = [...new Set([...queryTerms(cleanQuery), ...russianKeywordRoots(query)])];
  const domainRoots = roots.filter(rootIsDomain);
  const domainFamilies = new Set(domainRoots.map((root) => DOMAIN_FAMILY_BY_ROOT.get(root)).filter(Boolean));
  const forestryIntent = forestEvidenceIntent(cleanQuery);
  const locationPattern = /\b(?:tartu|jogeva|parnu|narva|viljandi|rakvere|voru|valga|kuressaare|haapsalu|johvi|saaremaa|kohtla|harjumaa|raplamaa|ida virumaa)\w*/u;
  const hasLocation = textHasTallinnLocation(normalized) || locationPattern.test(normalized);
  const historical = isHistoricalPeriodQuery(normalized);
  const current = /\b(?:tana\w*|homn\w*|homm\w*|homs\w*|ulehomme|praegu|hetkel|hetke\w*|nadalavahet\w*|reaalajas|prognoos\w*|\w*hoiatus\w*|today|tomorrow|current|currently|now|weekend|forecast\w*|warning\w*)\b/u.test(normalized);
  const weatherMeasurementIntent = roots.some((root) => [
    "temperatuur", "ohutemperatuur", "tuul", "niiskus", "ohuniiskus", "ohurohk", "sooja", "kulm", "baromeetrirohk",
    ...(isMultilingualSearchEnabled() ? ["wind", "humidity", "pressure"] : []),
  ].includes(root))
    && !roots.some((root) => [
      "vesi", "meri", "laanemeri", "jarv", "jogi", "emajogi", "pohjavesi", "suplusvesi", "joogivesi", "reovesi", "mootmine",
    ].includes(root));
  const weatherIntent = domainRoots.some((root) => ["ilm", "prognoos", "hoiatus", "sademed"].includes(root))
    || weatherMeasurementIntent;
  const airIntent = roots.some((root) => ["ohk", "ohukvaliteet", "saaste", "osoon", "pm10", "pm25"].includes(root));
  const routeClasses = new Set();
  if (weatherIntent && (current || (hasLocation && !historical))) routeClasses.add("official_live_weather");
  if (airIntent && (current || (hasLocation && !historical))) routeClasses.add("official_live_air");
  const liveWaterIntent = (current
    && roots.some((root) => ["vesi", "jogi", "jarv", "meri", "laanemeri", "emajogi", "mootmine", "suplusvesi"].includes(root))
    && !historical)
    || (roots.includes("jaaolud") && !historical);
  if (liveWaterIntent) routeClasses.add("official_live_water");
  const explicitDataIntent = roots.some((root) => ["api", "avaandmed", "metaandmed", "allalaadimine", "pxweb"].includes(root))
    || (isTopicDataOverviewQuery(cleanQuery, roots)
      && !roots.some((root) => ["register", "kataster", "kinnistu", "pusielupaik", "puurkaev", "jaatmekaitluskoht"].includes(root)));
  const statisticalDataIntent = roots.includes("statistika")
    && !roots.some((root) => ["mets", "metsaandmed", "metsaregister"].includes(root));
  if (explicitDataIntent || statisticalDataIntent) {
    routeClasses.add("official_data_or_api");
  }
  if (roots.some((root) => ["kaart", "ruumikiht", "register", "kataster", "kinnistu", "pusielupaik", "puurkaev", "jaatmekaitluskoht", "mura"].includes(root))
    || (roots.some((root) => ["kaitseala", "elupaik", "liik"].includes(root))
      && (/\b(?:kaart|piir(?:id|i|ide|joon)\w*|asukoht|naen|näen|leid|otsin|riiklik)\w*/u.test(normalized) || hasLocation))
    || /\b(?:oma|minu|mu)\s+maat\w*\b[\s\S]{0,50}\b(?:puistu|metsa)andm\w*/u.test(normalized)) {
    routeClasses.add("official_spatial_or_register");
  }
  if ((historical && roots.some((root) => ["ilm", "temperatuur", "vesi", "jogi", "jarv", "meri", "emajogi", "mootmine"].includes(root)))
    || roots.some((root) => ["jaaolud"].includes(root))
    || (roots.includes("meri") && roots.some((root) => ["temperatuur", "mootmine", "seire"].includes(root)))) {
    routeClasses.add("official_historical_observation");
  }
  if (roots.some((root) => ["seisund", "kliima", "kasvuhoonegaas", "ringlussevott", "jalajalg", "elektriauto", "pestitsiid", "osoon", "uluk", "suplusvesi", "stsenaarium", "kiirgus", "mereprugi", "eutrofeerumine"].includes(root))
    || (roots.includes("laanemeri") && /\b(?:oitse\w*|vetika\w*|eutrofeer\w*)\b/u.test(normalized))) {
    routeClasses.add("official_indicator_or_report");
  }
  if (roots.includes("uleujutusrisk")) {
    routeClasses.add("official_indicator_or_report");
    routeClasses.add("official_spatial_or_register");
  }
  const legalIntent = roots.some((root) => ["keskkonnaluba", "menetlus", "piirang", "taotlemine", "ehitamine"].includes(root))
    || /\bkaitse\s+alla\b/u.test(normalized)
    || (roots.includes("metsateatis") && /\b(?:piisab|peab|kohustus\w*|noue\w*|esitama|vaja)\b/u.test(normalized))
    || (roots.includes("lubatavus")
      && roots.some((root) => ["kaitseala", "kaitstav", "liik", "elupaik", "puurkaev", "jarv"].includes(root)));
  if (legalIntent) routeClasses.add("official_legal_context");
  const legalDecisionIntent = legalIntent
    && !roots.some((root) => ["kaart", "ruumikiht", "register", "kataster"].includes(root));
  if (roots.some((root) => ["kmh", "ksh"].includes(root)) || (roots.includes("keskkonnamoju") && roots.includes("tuulepark"))) {
    routeClasses.add("official_environmental_assessment");
  }
  if (roots.includes("keskkonnamoju") && roots.includes("kaevandus")) {
    routeClasses.add("official_environmental_assessment");
    routeClasses.add("official_guidance");
  }
  const guidanceIntent = /\b(?:kuidas|kuhu|miks|mida|kas|tohib|voib|teatada|viia|käidelda|kaidelda|how|where|why|what|dispose|report)\b/u.test(normalized)
    && roots.some((root) => [
      "jaat", "asbest", "biojaatmed", "reovesi", "kohtkaitlus", "pais", "kala", "voorliik",
      "liik", "elupaik", "rohevorgustik", "margala", "taastamine", "kaevandus", "paikesepaneel",
      "pohjavesi", "joogivesi", "vesi", "metsateatis", "rehv", "polet", "jalajalg",
    ].includes(root));
  const implicitGuidanceIntent = (roots.includes("paikesepaneel") && /\bmis\s+saab\b/u.test(normalized))
    || (roots.includes("voorliik") && /\b(?:aias|aeda|aed)\b/u.test(normalized))
    || (roots.includes("metsateatis") && /\b(?:voi|või)\b/u.test(normalized));
  if ((guidanceIntent || implicitGuidanceIntent) && (!legalIntent || roots.some((root) => ["jaat", "asbest", "biojaatmed", "reovesi", "kohtkaitlus", "pais", "voorliik", "metsateatis"].includes(root)))) {
    routeClasses.add("official_guidance");
  }
  if (forestryIntent || roots.some((root) => ["mets", "raie", "juurdekasv", "metsaandmed", "metsaregister"].includes(root))) {
    routeClasses.add("official_forestry_evidence");
  }
  const primaryRouteClass = [
    routeClasses.has("official_live_weather") ? "official_live_weather" : null,
    routeClasses.has("official_live_air") ? "official_live_air" : null,
    routeClasses.has("official_live_water") ? "official_live_water" : null,
    routeClasses.has("official_data_or_api") ? "official_data_or_api" : null,
    routeClasses.has("official_legal_context") && legalDecisionIntent ? "official_legal_context" : null,
    routeClasses.has("official_spatial_or_register") && !/\bavalik\w*\b/u.test(normalized)
      ? "official_spatial_or_register"
      : null,
    routeClasses.has("official_historical_observation") ? "official_historical_observation" : null,
    routeClasses.has("official_environmental_assessment") ? "official_environmental_assessment" : null,
    routeClasses.has("official_legal_context") ? "official_legal_context" : null,
    routeClasses.has("official_guidance") ? "official_guidance" : null,
    routeClasses.has("official_indicator_or_report") ? "official_indicator_or_report" : null,
    routeClasses.has("official_spatial_or_register") ? "official_spatial_or_register" : null,
    routeClasses.has("official_forestry_evidence") ? "official_forestry_evidence" : null,
  ].find(Boolean) || null;
  return {
    cleanQuery,
    inputReason: canonicalInput.reason,
    normalized,
    roots,
    domainRoots,
    domainFamilies,
    forestryIntent,
    hasLocation,
    historical,
    current,
    weatherIntent,
    airIntent,
    candidateRouteClasses: [...routeClasses],
    primaryRouteClass,
  };
}

export function assessSearchQuery(query, options = {}) {
  // Length is the cheapest reject: check the canonicalization result BEFORE
  // running decode/pattern passes so overlong input cannot spend classifier
  // time. decodeSecurityEscapes is length-reducing, so a raw query that fits
  // rawMaximum can never decode to something that exceeds it.
  const earlyLength = canonicalizePublicSearchQuery(query, options);
  if (earlyLength.reason === "too-long" || earlyLength.reason === "input-too-long") {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "invalid-query-length",
      clarification: "Otsing ületab turvalise pikkuspiiri. Lühenda päringut ja proovi uuesti.",
    };
  }
  const rawForeignPrivateClause = hasForeignPrivatePersonClause(decodeSecurityEscapes(query));
  const analysis = analyzePublicSearchQuery(query, options);
  const {
    cleanQuery, inputReason, normalized, roots, domainRoots, domainFamilies, forestryIntent,
  } = analysis;
  if (inputReason === "too-long" || inputReason === "input-too-long") {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "invalid-query-length",
      clarification: "Otsing ületab turvalise pikkuspiiri. Lühenda päringut ja proovi uuesti.",
    };
  }
  if (!cleanQuery) return { kind: "needs-clarification", topic: null, reason: "empty", clarification: clarificationFor(null) };
  if (containsUnsafeInstruction(cleanQuery)) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "unsafe-instruction",
      clarification: "Saan aidata Eesti keskkonnaandmete küsimustega, kuid mitte süsteemijuhiste ega saladuste päringutega.",
    };
  }
  if (rawForeignPrivateClause || containsPrivatePersonLookup(cleanQuery)) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "personal-data-lookup",
      clarification: "Ma ei aita tuvastada eraisiku elukohta, vara ega muid isikuga seostatavaid registriandmeid. Avalikke keskkonnaobjekte saab otsida objekti tunnuse järgi ametlikust registrist.",
    };
  }
  if (!isMultilingualSearchEnabled()
    && (FOREIGN_SCRIPT_PATTERN.test(cleanQuery) || hasEnglishOnlyQueryFrame(cleanQuery))) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "unsupported-language",
      clarification: "Otsing töötab praegu eestikeelsete päringutega.",
    };
  }
  if (isReviewedGenericProtectedAreaConsentQuery(cleanQuery)) {
    return {
      kind: "answerable",
      topic: "looduskaitse",
      reason: "protected-area-consent",
      clarification: null,
    };
  }
  if (isReviewedPublicOrganizationProtectedBuildingContactQuery(cleanQuery)) {
    return {
      kind: "answerable",
      topic: "looduskaitse",
      reason: "official-organization-contact",
      clarification: null,
    };
  }
  const municipalityContactScope = reviewedMunicipalityInstitutionalContactScope(cleanQuery);
  if (municipalityContactScope?.status === "ambiguous") {
    return {
      kind: "needs-clarification",
      topic: "keskkonnaandmed",
      reason: "ambiguous-municipality",
      clarification: "Palun täpsusta, kas mõtled samanimelist linna või valda, et saaksin valida õige omavalitsuse ametliku kontaktkanali.",
    };
  }
  if (municipalityContactScope?.status === "exact") {
    return {
      kind: "answerable",
      topic: "keskkonnaandmed",
      reason: "official-organization-contact",
      clarification: null,
    };
  }
  if (isPublicOrganizationContactQuery(cleanQuery)) {
    return {
      kind: "answerable",
      topic: "keskkonnaandmed",
      reason: "official-organization-contact",
      clarification: null,
    };
  }
  if (CADASTRE_PATTERN.test(cleanQuery)) {
    return { kind: "answerable", topic: "kataster", reason: "cadastre-number", clarification: null };
  }
  if (normalized === "andmed") {
    return {
      kind: "needs-clarification",
      topic: "andmed",
      reason: "broad-topic",
      clarification: clarificationFor("andmed"),
    };
  }
  if (/^(?:(?:palun|soovin|sooviksin|tahan)\s+)?ulevaad(?:e|et)$/u.test(normalized)) {
    return {
      kind: "needs-clarification",
      topic: "keskkond",
      reason: "broad-topic",
      clarification: "Millise Eesti keskkonnateema ülevaadet soovid: mets, vesi, kliima, õhk, jäätmed või elurikkus? Näiteks küsi „metsa ülevaade“ või „põhjavee andmed Eestis“.",
    };
  }
  const broadRequest = /^(?:tahan\s+\w+\s+teada|vajan\s+(?:ainult\s+)?kaarti|otsin\s+loataotlust|minu\s+mets)$/u.test(normalized)
    || (/\bsiin\b/u.test(normalized) && roots.some((root) => ["lubatavus", "ehitamine"].includes(root)))
    || (/\b(?:ohk|ohukvaliteet)\b/u.test(normalized)
      && /\b(?:halb|hea|puhas)\b/u.test(normalized)
      && !ADMIN_CONTEXT_ROOTS.has(roots.find((root) => ADMIN_CONTEXT_ROOTS.has(root))));
  if (broadRequest) {
    return {
      kind: "needs-clarification",
      topic: domainRoots[0] || null,
      reason: "broad-topic",
      clarification: clarificationFor(domainRoots[0] || null),
    };
  }
  if (roots.includes("register")
    && roots.includes("ettevote")
    && !roots.some((root) => ["keskkonnaluba", "jaat", "heide", "saaste", "pakend", "mets", "puurkaev"].includes(root))) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "outside-environment-domain",
      clarification: "Üldiste ettevõtteandmete asemel küsi konkreetse keskkonnaloa, heite, jäätmearuande või muu keskkonnaregistri kirje kohta.",
    };
  }
  const hasRecognizedLiveRoute = analysis.candidateRouteClasses.some((routeClass) => [
    "official_live_weather",
    "official_live_air",
    "official_live_water",
  ].includes(routeClass));
  const reviewedDataSource = reviewedDataSourceSource(cleanQuery);
  if (reviewedDataSource) {
    return {
      kind: "answerable",
      topic: "andmed",
      reason: "reviewed-data-source",
      clarification: null,
    };
  }
  // Forest vocabulary in a question ("mis vanusest loetakse mänd seemnekandvaks")
  // is in scope even when no listed domain root is named; a bare fragment such
  // as "mand" is not enough on its own.
  if (!domainRoots.length && !forestryIntent && !hasRecognizedLiveRoute && !FOREST_STAND_PATTERN.test(normalized)
    && !(normalized.split(" ").length >= 3 && isForestRelatedQuery(cleanQuery))) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "outside-environment-domain",
      clarification: "Küsi Eesti keskkonna, looduse, ilma, vee, õhu, jäätmete, metsa või keskkonnaregistrite kohta.",
    };
  }
  const topic = domainRoots[0] || "mets";
  const suspiciousUnknownTokens = normalized.split(/\s+/u).filter((word) => word.length >= 4
    && !/[aeiouõäöü]/u.test(word)
    && !/\d/u.test(word));
  if (suspiciousUnknownTokens.length && domainRoots.length <= 1) {
    return {
      kind: "needs-clarification",
      topic,
      reason: "unknown-modifier",
      clarification: "Üks päringu osa jäi ebaselgeks. Palun sõnasta teema või tundmatu termin täpsemalt.",
    };
  }
  const hasRelationalQuestion = /\b(?:kas|kuidas|miks|mida|milline|millised|tohib|voib)\b/u.test(normalized);
  const knownCatalogueCombination = domainRoots.some((root) => ["mets", "metsaandmed", "metsaregister"].includes(root))
    && roots.some((root) => ["andmed", "kaart", "ruumikiht", "register"].includes(root));
  if (domainFamilies.size >= 3
    && normalized.split(/\s+/u).length <= 6
    && !hasRelationalQuestion
    && !forestryIntent
    && !knownCatalogueCombination) {
    return {
      kind: "needs-clarification",
      topic,
      reason: "mixed-topics",
      clarification: "Päring sisaldab mitut eri keskkonnateemat. Palun vali üks teema või kirjelda, millist seost nende vahel otsid.",
    };
  }
  const namedMunicipalityExample = /\bnaiteks\b[\s\S]{0,35}\b(?:omavalitsus|vald|linn)\w*\b/u.test(normalized);
  const forestAreaGeographyScope = forestryIntent
    ? classifyForestryGeographyScope(cleanQuery)
    : null;
  const reviewedNationalBreakdown = isReviewedNationalUnsupportedForestAreaBreakdownQuestion(cleanQuery);
  const nationalForestAreaScope = ["national-default", "national-estonia"]
    .includes(forestAreaGeographyScope?.kind) || reviewedNationalBreakdown;
  if (nationalForestAreaScope
    && (["forest-area", "forest-covered-area", "forest-area-method"].includes(forestryIntent?.kind)
      || reviewedNationalBreakdown)
    && requestsUnsupportedForestAreaBreakdown(cleanQuery)) {
    return {
      kind: "needs-clarification",
      topic: "mets",
      reason: "requested-breakdown-required",
      clarification: "Päring küsib metsamaa jaotust või välistust, mida üleriigiline kogupindala ei tõenda. Palun lisa sama omandi-, kaitse- või muu kategooria ametlik näitaja koos aasta ja ühikuga; kogupindala ei kanta sellele alamrühmale üle.",
    };
  }
  if (nationalForestAreaScope
    && ["forest-area", "forest-covered-area"].includes(forestryIntent?.kind)
    && requestsUnsupportedForestAreaTimeSeries(cleanQuery, { referenceRow: true })) {
    return {
      kind: "needs-clarification",
      topic: "mets",
      reason: "requested-time-series-required",
      clarification: "Päring küsib metsamaa aegrida või muutust. Ühe aasta üleriigilist näitajat ei kasutata ajaloo või trendi asendusena; vastuseks on vaja sama definitsiooni, aasta ja ühikuga ametlikke aastavaatlusi kogu küsitud perioodi kohta.",
    };
  }
  if (nationalForestAreaScope
    && ["forest-area", "forest-covered-area"].includes(forestryIntent?.kind)
    && requestsUnsupportedForestAreaUnit(cleanQuery)) {
    return {
      kind: "needs-clarification",
      topic: "mets",
      reason: "requested-unit-conversion-required",
      clarification: "Ametlik mõõtmine on selles vastuseallikas hektarites. Ma ei esita aakrite või ruutühikute teisendust ilma eraldi kontrollitud arvutuse ja ümardusreeglita; palun küsi hektarites või lisa soovitud ametlik teisendusallikas.",
    };
  }
  if (forestryIntent?.kind === "regional-forest-area") {
    const geographyScope = forestAreaGeographyScope;
    const isEstonianRegion = geographyScope.kind === "estonian-region";
    return {
      kind: "needs-clarification",
      topic: "mets",
      reason: isEstonianRegion ? "regional-observation-required" : "unsupported-geography",
      clarification: isEstonianRegion
        ? "Piirkond on tuvastatud, kuid arvuline vastus vajab sama maakonna või piirkonna, andmeaasta, näitaja ja ühikuga ametlikku vaatlust. Eesti üleriigilist SMI näitajat ei kanta piirkonnale üle."
        : "Päring nimetab Eesti-välise või muu piirkonna. See otsing ei asenda puuduvat piirkondlikku allikat Eesti SMI arvuga; palun küsi Eesti näitajat või lisa soovitud piirkonna ametlik andmeallikas, näitaja ja aasta.",
    };
  }
  if (forestryIntent?.kind === "municipality-forest-area") {
    const municipalityScope = reviewedEstonianForestryMunicipalityScope(cleanQuery);
    const hasReviewedMunicipality = Boolean(municipalityScope);
    const municipalityIsMissing = /\b(?:minu|mu|meie|oma|selles|siin)\b[\s\S]{0,35}\b(?:vald|valla|vallas)\w*\b/u.test(normalized)
      || /\bkoduvall\w*\b/u.test(normalized)
      || namedMunicipalityExample
      || /^(?:kui\s+palju\s+)?mets\w*\s+(?:on\s+)?vallas$/u.test(normalized)
      || /\b(?:metsa|metsade?)\s+(?:protsent|osakaal|pindala)\s+vallas\b/u.test(normalized)
      || !hasReviewedMunicipality;
    if (municipalityIsMissing) {
      return {
        kind: "needs-clarification",
        topic: "mets",
        reason: "missing-municipality",
        clarification: namedMunicipalityExample
          ? "Palun täpsusta konkreetne omavalitsus (näiteks Võru linn või Võru vald) ja soovitud näitaja: metsamaa pindala, metsasuse protsent või Metsaregistris kehtivate eraldiste pindala. Need on eri näitajad."
          : "Palun nimeta vald või linn ja täpsusta, kas soovid metsamaa pindala, metsasuse protsenti või Metsaregistris kehtivate eraldiste pindala. Need on eri näitajad.",
      };
    }
    if (municipalityScope.status === "ambiguous") {
      return {
        kind: "needs-clarification",
        topic: "mets",
        reason: "ambiguous-municipality",
        clarification: "Päring võib viidata mitmele omavalitsusele või nii sama nimega linnale kui vallale. Palun nimeta täpselt linn või vald ning soovitud näitaja ja andmeaasta.",
      };
    }
    return {
      kind: "needs-clarification",
      topic: "mets",
      reason: "municipality-observation-required",
      clarification: "Omavalitsus on tuvastatud. Arvulise vastuse jaoks täpsusta andmeaasta ja näitaja: metsamaa pindala, metsasuse protsent või Metsaregistris kehtivate eraldiste pindala. Vastus peab põhinema sama omavalitsuse, aasta ja ühikuga ruumiandmetel; riiklikku SMI kogunäitajat ei kanta omavalitsusele üle.",
    };
  }
  if (!CADASTRE_PATTERN.test(cleanQuery)
    && (/(?:\b(?:minu|mu|oma)\s+(?:salvkaev|kaev)\w*\b|\b(?:minu|mu)\s+maal\b[\s\S]{0,50}\bvaariselupaik\b)/u.test(normalized))) {
    return {
      kind: "needs-clarification",
      topic: domainRoots[0] || null,
      reason: "missing-object-location",
      clarification: "Palun lisa objekti asukoht või registritunnus. Isiklikke objektiandmeid ma ei tuleta nime ega ebamäärase asukohakirjelduse põhjal.",
    };
  }
  if (["jarv", "vesi"].includes(topic) && /\bjarvede\b/u.test(normalized)) {
    return {
      kind: "needs-clarification",
      topic: "jarv",
      reason: "multiple-waterbodies",
      clarification: "Palun nimeta konkreetne järv või veekogumi kood ning ütle, kas soovid ökoloogilist, keemilist või suplusvee seisundit.",
    };
  }
  const propertyHowTo = forestryIntent?.kind === "property-forest-data"
    && /\b(?:kust|kus|millises|kuidas|leida|vaadata|kontrollida|otsida|otsing|jargi|sisesta|avada|kasuta)\b/u.test(normalized);
  if (!CADASTRE_PATTERN.test(cleanQuery)
    && !propertyHowTo
    && /(?:katastritunnus|katastri\s*(?:number|andmed)|kinnistu\s*(?:andmed|piirang|mets)|minu\s+kinnistu)/iu.test(normalized)) {
    return {
      kind: "needs-clarification",
      topic: "kataster",
      reason: "missing-cadastre-number",
      clarification: "Lisa katastritunnus kujul 12345:678:9012. Aadressi järgi üksuse leidmiseks kasuta ametlikku kaardi- või aadressiotsingut.",
    };
  }
  const weatherLocationPattern = /\b(?:tartu|parnu|narva|viljandi|rakvere|voru|valga|kuressaare|haapsalu|johvi|saaremaa|kohtla)\w*/u;
  const hasWeatherLocation = textHasTallinnLocation(normalized) || weatherLocationPattern.test(normalized);
  const explicitlyCurrentWeather = /\b(?:tana\w*|homn\w*|homm\w*|homs\w*|ulehomme|praegu|hetkel|hetkeseis\w*|nadalavahet\w*|prognoos\w*|\w*hoiatus\w*|today|tomorrow|current|currently|now|weekend|forecast\w*|warning\w*)\b/u.test(normalized);
  const historicalWeatherContext = /\b(?:(?:19|20)\d{2}|ajalool\w*|kliima\w*|keskm\w*|möödunud|moodunud|historical|historic|archive|past)\b/u.test(normalized);
  // "ilma hoiatussildita" means "without a warning sign", not weather.
  const ilmaMeansWithout = /\bilma\s+\p{L}+ta\b/u.test(normalized) && !/\bilm(?:\b|[^a\s]\p{L}*)/u.test(normalized);
  const weatherIntent = !ilmaMeansWithout && (analysis.candidateRouteClasses.includes("official_live_weather")
    || domainRoots.some((root) => ["ilm", "prognoos", "hoiatus", "sademed"].includes(root)));
  const locationDefaultsToCurrentWeather = weatherIntent
    && hasWeatherLocation
    && !historicalWeatherContext;
  if (weatherIntent
    && (explicitlyCurrentWeather || locationDefaultsToCurrentWeather)) {
    return {
      kind: "live-weather",
      topic: "ilm",
      reason: "time-sensitive-weather",
      clarification: hasWeatherLocation
        ? null
        : "Lisa asukoht, et avada õige piirkonna prognoos.",
    };
  }
  const explicitlyCurrentAir = /\b(?:praeg\w*|hetkel|hetke\w*|reaalajas|tana\w*|värske\w*|varske\w*|today|current|currently|now|real\s+time|latest)\b/u.test(normalized);
  const airIntent = roots.some((root) => ["ohk", "ohukvaliteet", "saaste", "osoon", "pm10", "pm25"].includes(root));
  const airLocation = textHasTallinnLocation(normalized)
    || /\b(?:tartu|parnu|narva|kohtla|viljandi|voru|saaremaa)\w*/u.test(normalized);
  if (airIntent && (explicitlyCurrentAir || (airLocation && !historicalWeatherContext))) {
    return {
      kind: "live-air",
      topic: "ohukvaliteet",
      reason: "time-sensitive-air-quality",
      clarification: airLocation
        ? null
        : "Lisa asukoht või lähim seirejaam ja soovitud saasteaine.",
    };
  }
  if (analysis.candidateRouteClasses.includes("official_live_water")) {
    return {
      kind: "live-water",
      topic: roots.includes("suplusvesi")
        ? "suplusvesi"
        : roots.some((root) => ["meri", "laanemeri", "jaaolud"].includes(root))
          ? "meri"
          : "vesi",
      reason: "time-sensitive-water",
      clarification: null,
    };
  }
  const nonContextRoots = roots.filter((root) => root !== topic && !ADMIN_CONTEXT_ROOTS.has(root));
  const waterContextOnly = ["vesi", "jarv"].includes(topic) && nonContextRoots.length === 0;
  // A named felling type (sanitaarraie, lageraie) is a specific subject, not bare "raie".
  const namesFellingType = topic === "raie" && /\b\p{L}{3,}rai(?:e|u)\p{L}*/u.test(normalized);
  // A quantity with an explicit year is a concrete observation request, even
  // when its only topic root ("raie") would otherwise count as a broad theme.
  // Without this, "raiemaht 2024" asked for clarification despite an official
  // annual series being available for exactly that year.
  const explicitYearMetric = /\b(?:19|20)\d{2}\b/u.test(normalized)
    && /\b(?:raiemaht|raiepindala|lageraie|pindala|tagavara|juurdekasv|heide|heitmed|saaste|jaatmed|ringlus|temperatuur|sademed|metsasus|osakaal|maht)\w*/u.test(normalized);
  // A named report or indicator plus an Estonia scope is a concrete data
  // request, even when the only topic root would otherwise be too broad.
  const explicitReportQuery = /\b(?:jaatmeteke|heitkogus\w*|seire\s+tulemus\w*|aastaraamat\w*|ulevaade|ülevaade|aruanne)\w*/u.test(normalized)
    && /\b(?:eesti|eestis|20\d{2})\b/u.test(normalized);
  if (!isTopicDataOverviewQuery(cleanQuery, roots)
    && !isStatisticsWaterAbstractionQuery(cleanQuery)
    && !namesFellingType
    && !explicitYearMetric
    && !explicitReportQuery
    && AMBIGUOUS_ROOTS.has(topic) && (roots.length <= 1 || waterContextOnly)) {
    return {
      kind: "needs-clarification",
      topic,
      reason: "broad-topic",
      clarification: clarificationFor(topic),
    };
  }
  return { kind: "answerable", topic, reason: "environment-domain", clarification: null };
}
