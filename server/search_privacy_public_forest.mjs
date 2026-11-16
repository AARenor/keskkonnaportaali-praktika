import {
  REVIEWED_ESTONIAN_MUNICIPALITY_BASES,
  classifyForestryGeographyScope,
  isReviewedEstonianCountyIdentity,
  isReviewedEstonianMunicipalityIdentity,
  removeFirstReviewedMunicipalityOrganizationName,
  reviewedEstonianForestryMunicipalityScope,
  reviewedEstonianMunicipalityCandidateScope,
  reviewedEstonianMunicipalityScope,
} from "./municipalities.mjs";
import { normalize } from "./search_query_terms.mjs";
import { hasLossyUnicodeLetterOrNumber } from "./search_privacy_protected_area.mjs";
import {
  ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN,
  CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN,
  ECOLOGICAL_MODIFIER_PATTERN,
  ECOLOGICAL_SUBJECT_PATTERN,
  GENERIC_CADASTRAL_FIELD_PREFIXES,
  PUBLIC_ORGANIZATION_PATTERN,
  isWholeReviewedPublicOrganizationName,
  removeFirstPublicOrganizationName,
} from "./search_privacy_patterns.mjs";
function isReviewedPublicEntityName(value) {
  const name = String(value || "").replace(/[.?!,;:]+$/gu, "").trim();
  if (!name) return false;
  if (isReviewedEstonianMunicipalityIdentity(name)
    || removeFirstReviewedMunicipalityOrganizationName(name).trim() === ""
    || removeFirstPublicOrganizationName(name).trim() === "") return true;
  return Boolean(reviewedEstonianMunicipalityCandidateScope(name));
}

function reviewedPublicEntityAssetAssociationCandidates(value) {
  const text = String(value || "").trim();
  if (!/(?<!\p{L})(?:mets\w*|metsamaa\w*|forest|woodland)(?!\p{L})/iu.test(text)) return [];
  const patterns = [
    /(?:in|under)\s+(?:the\s+)?name\s+of\s+(.+?)[.?!]?$/iu,
    /(?:titled|registered|recorded|assigned|attributed|attributable|linked|associated|transferred|conveyed|granted)\s+(?:to|under|with|for)\s+(.+?)[.?!]?$/iu,
    /(?:acquired\s+by|vested\s+in|anti)\s+(.+?)[.?!]?$/iu,
    /(?:title|beneficiar(?:y|ies)|holders?|possessors?|owners?|ownership|kasutaja|õigustatud\s+isik|valdaja|haldaja|kasusaaja)\s*[:=\p{Pd}]+\s*(.+?)[.?!]?$/iu,
    /^(.+?)\s*[,;\p{Pd}]+\s*(?:metsamaa\w*|metsaala\w*|(?:forest|woodland)(?:\s+(?:area|land|property|parcel|plot))?)\s+(?:omanik\w*|haldaja\w*|valdaja\w*|kasutaja\w*|owner|manager|holder|possessor)(?:\s+(?:eestis|estonia))?[.?!]?$/iu,
  ];
  return patterns.flatMap((pattern) => {
    const match = text.match(pattern);
    return match ? [match[1]] : [];
  });
}

function partialMunicipalityCandidateHasIdentityMaterial(candidate) {
  if (!reviewedEstonianMunicipalityScope(candidate)
    || reviewedEstonianMunicipalityCandidateScope(candidate)) return false;
  const residual = removeFirstReviewedMunicipalityOrganizationName(candidate);
  const tokens = residual.match(/[\p{L}\p{N}]+/gu) || [];
  // A complete public continuation may follow the municipality in the same
  // asset sentence. Only residual identity material makes the partial match
  // private; conjunctions, institutional descriptors and contact-channel
  // nouns do not become a synthetic person by themselves.
  return tokens.some((token) => !/^(?:a|an|the|and|plus|of|for|to|with|ja|ning|voi|või|official|public|general|state|national|local|municipal|municipality|city|government|environment\w*|forest\w*|nature\w*|climate\w*|water\w*|waste\w*|biodivers\w*|green|infrastructure|agency|authority|board|office|department|service|unit|information|data|contact|phone|telephone|email|mailbox|address|amet\w*|asutus\w*|avalik\w*|riigi\w*|linna\w*|valla\w*|omavalitsus\w*|keskkonna\w*|metsa\w*|loodus\w*|kliima\w*|vee\w*|jäätme\w*|jaatme\w*|elurikk\w*|osakond\w*|teenistus\w*|üksus\w*|uksus\w*|andm\w*|info\w*|kontakt\w*|telefon\w*|e-?post\w*|postkast\w*|aadress\w*)$/iu.test(token));
}

function isCompleteReviewedPublicEntityAssetAssociation(value) {
  return reviewedPublicEntityAssetAssociationCandidates(value).some((candidate) => (
    isReviewedPublicEntityName(candidate)
      || (reviewedEstonianMunicipalityScope(candidate)
        && !partialMunicipalityCandidateHasIdentityMaterial(candidate))
  ));
}

function hasPartialReviewedMunicipalityAssetAssociation(value) {
  return reviewedPublicEntityAssetAssociationCandidates(value)
    .some(partialMunicipalityCandidateHasIdentityMaterial);
}

function isGenericPublicEnvironmentalInstitutionContactQuery(value) {
  const text = String(value || "").trim();
  const completeGenericContact = [
    /^(?:(?:what|where)\s+is\s+the\s+)?(?:(?:official|public|general|state|national)\s+){1,3}(?:(?:contact|email|phone|telephone|postal|information)\s+(?:channel|route)|postal\s+address|phone|telephone|email|mailbox)\s+(?:for|of)\s+(?:the\s+)?(?:(?:national|state|public|government|official)\s+)?(?:environmental|nature|biodiversity|forest(?:ry)?|woodland|water|groundwater|waste|climate)(?:\s+(?:permits?|policy|planning|monitoring|observations?|measurements?|management|conservation|research|statistics|inventory|data|information|guidance|enquir(?:y|ies))){0,3}(?:\s+(?:agency|institution|administration|office|authority|department|unit|service|board)){0,2}\??$/iu,
    /^how\s+can\s+an?\s+official\s+(?:information|press)\s+(?:contact|channel)\s+be\s+distinguished\s+from\s+an?\s+(?:personal|private)\s+contact\??$/iu,
    /^(?:(?:national|state|public|government|official)\s+)?(?:forest(?:ry)?|woodland|nature|biodiversity|national\s+park)(?:\s+(?:policy|monitoring|management|conservation|research|statistics|data|information)){0,2}\s+(?:agency|institution|administration|office|authority|department|unit|service|board)\s+(?:(?:general|public|official)\s+)?(?:contact(?:\s+(?:details?|information|channel))?|information\s+channel|phone|telephone|email|mailbox|address)\??$/iu,
    /^where\s+is\s+the\s+(?:(?:general|public|official)\s+)?(?:contact(?:\s+(?:channel|route))?|mailbox|phone|telephone|email|address)\s+for\s+the\s+(?:forest(?:ry)?|woodland|nature|biodiversity|environmental|climate|water|groundwater|waste)(?:\s+(?:policy|monitoring|observation|management|conservation|research|statistics|inventory|data|information)){0,2}\s+(?:agency|institution|administration|office|authority|department|unit|service|board)\??$/iu,
    /^where\s+can\s+i\s+(?:find|reach)\s+(?:the\s+)?(?:(?:general|public|official)\s+)?(?:contact(?:\s+(?:channel|route))?|mailbox|phone|telephone|email|address)\s+(?:of|for)\s+(?:the\s+)?(?:(?:national|state|public|government|official)\s+)?(?:forest(?:ry)?|woodland|nature|biodiversity|environmental|climate|water|groundwater|waste)(?:\s+(?:policy|monitoring|observation|management|conservation|research|statistics|inventory|data|information)){0,2}(?:\s+(?:agency|institution|administration|office|authority|department|unit|service|board))?\??$/iu,
    /^how\s+(?:can|do)\s+i\s+(?:contact|find|reach)\s+(?:the\s+)?(?:(?:national|state|public|government|official)\s+)?(?:forest(?:ry)?|woodland|nature|biodiversity|environmental|climate|water|groundwater|waste)(?:\s+(?:policy|monitoring|observation|management|conservation|research|statistics|inventory|data|information)){0,2}\s+(?:agency|institution|administration|office|authority|department|unit|service|board)\??$/iu,
    /^(?:official|public|general)\s+contact\s+channel\s+for\s+(?:environmental|nature|biodiversity|forest(?:ry)?|woodland|water|groundwater|waste|climate)(?:\s+(?:permits?|policy|monitoring|management|conservation|data|information))?\??$/iu,
    /^what\s+is\s+the\s+(?:official|public|general)\s+contact\s+(?:channel|route)\s+for\s+(?:environmental|nature|biodiversity|forest(?:ry)?|woodland|water|groundwater|waste|climate)(?:\s+(?:permits?|policy|monitoring|management|conservation|data|information))?\??$/iu,
    /^(?:official|public|general)\s+(?:contact|postal|information)\s+(?:channel|route)\s+for\s+(?:environmental|nature|biodiversity|forest(?:ry)?|woodland|water|groundwater|waste|climate)(?:\s+(?:permits?|policy|monitoring|observation|management|conservation|inventory|data|information|guidance)){0,2}\??$/iu,
    /^(?:official|public|general)\s+(?:postal\s+address|mailbox|phone|telephone|email|contact)\s+for\s+(?:the\s+)?(?:environmental|nature|biodiversity|forest(?:ry)?|woodland|water|groundwater|waste|climate)(?:\s+(?:policy|monitoring|observation|management|conservation|inventory|data|information|guidance)){0,2}\s+(?:agency|institution|administration|office|authority|department|unit|service|board)(?:\s+(?:agency|institution|administration|office|authority|department|unit|service|board))?\??$/iu,
    /^(?:riiklik\w*\s+(?:metsapoliitika\s+asutuse|metsaameti|metsanduse\s+asutuse|looduspoliitika\s+riigiasutuse)|(?:metsa|loodus)poliitika\s+riigiasutuse)\s+(?:üldkontakt\w*|kontakt\w*|telefoni?\w*|e-?post\w*)\??$/iu,
    /^kuidas\s+leida\s+riiklik\w*\s+(?:metsa|loodus|elurikkuse|põhjavee|pohjavee)\w*(?:\s+(?:statistika|poliitika|seire|andmete))?\s+asutuse\s+(?:avalik\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|telefoni?\w*|e-?post\w*)\??$/iu,
    /^kust\s+(?:leida|leian)\s+(?:metsa|loodus|elurikkuse|põhjavee|pohjavee)\w*\s+(?:(?:statistika|poliitika|seire|andmete)\s+|seireteenuse\s+)?(?:avalik\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|telefoni?\w*|e-?post\w*)\??$/iu,
    /^millin\w*\s+on\s+riiklik\w*\s+(?:metsa|loodus|elurikkuse|põhjavee|pohjavee)\w*(?:\s+(?:statistika|poliitika|seire|andmete))?\s+(?:asutuse|üksuse|uksuse|teenistuse)\s+(?:avalik\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|telefoni?\w*|e-?post\w*)\??$/iu,
    /^riikliku?\s+(?:metsa|loodus|elurikkuse|põhjavee|pohjavee|kliima|vee|jäätme|jaatme)\w*(?:\s+(?:statistika|poliitika|seire|andmete|inventuuri))?\s+(?:avalik\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|(?:üld|uld|yld)?telefoni?\w*|e-?post\w*)\??$/iu,
    /^(?:metsa|loodus|elurikkuse|põhjavee|pohjavee|kliima|vee|jäätme|jaatme)\w*(?:\s+(?:statistika|poliitika|seire|andmete|inventuuri|vaatlus\w*)){0,2}\s+riigiasutuse\s+(?:(?:avalik|üldine|uldine|yldine)\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|(?:üld|uld|yld)?telefoni?\w*|e-?post\w*)\??$/iu,
  ].some((pattern) => pattern.test(text));
  if (completeGenericContact) return true;
  const namedPublicOrganizationContact = text.match(
    /^kuidas\s+(?:saada|leida)\s+(.+?)\s+(?:metsa|looduse|elurikkuse|põhjavee|pohjavee|kliima|vee|jäätmete|jaatmete)\w*\s+(?:avalik\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|telefoni?\w*|e-?post\w*)\??$/iu,
  );
  return Boolean(namedPublicOrganizationContact
    && PUBLIC_ORGANIZATION_PATTERN.test(namedPublicOrganizationContact[1]));
}

function isCompletePublicEcologicalAgencyRoleQuestion(value) {
  const text = String(value || "").trim();
  if (/^kes\s+(?:koordineerib|korraldab|juhib)\s+(?:eestis\s+)?(?:elupai[kg]\w*|lii[kg]\w*|elurikkuse|looduse|metsa|põhjavee|pohjavee)\s+(?:seiret|seireprogrammi|kaitset|uuringut)\??$/iu.test(text)
    || /^millin\w*\s+(?:amet|asutus|agentuur|organisatsioon)\s+(?:koordineerib|korraldab|juhib)\s+(?:eestis\s+)?(?:elupai[kg]\w*|lii[kg]\w*|elurikkuse|looduse|metsa|põhjavee|pohjavee)\s+(?:seiret|seireprogrammi|kaitset|uuringut)\??$/iu.test(text)
    || /^kelle\s+kaudu\s+toimub\s+(?:eestis\s+)?(?:elupai[kg]\w*|lii[kg]\w*|elurikkuse|looduse|metsa|põhjavee|pohjavee)\s+riiklik\w*\s+(?:seire|seireprogramm|kaitse|uuring)\w*\??$/iu.test(text)
    || /^(?:which|what)\s+(?:public\s+)?(?:agency|authority|institution|organization)\s+(?:coordinates?|manages?|runs?|oversees?)\s+(?:the\s+)?(?:estonia(?:n)?\s+)?(?:habitat|species|biodiversity|nature|forest|groundwater)\s+(?:monitoring|conservation|research)\s+(?:programme|program)?\??$/iu.test(text)
    || /^(?:what|which)\s+(?:agency|organization)\s+(?:manages?|administers?|operates?|oversees?|assess(?:es)?|evaluates?|studies?)\s+(?:groundwater|surface[-\s]+water|water|air|biodiversity|environmental|forest|land[-\s]+use)\s+(?:monitoring|policy|research|assessment|impacts?|effects?)\s+(?:on|in|near|across)\s+(?:(?:agricultural|forest|public|protected)\s+land|natura(?:\s+2000)?\s+sites?)\??$/iu.test(text)) return true;
  const namedOrganizationRole = text.match(
    /^who\s+(?:coordinates?|manages?|runs?|oversees?)\s+(?:the\s+)?(?:habitat|species|biodiversity|nature|forest|groundwater)\s+(?:monitoring|conservation|research)\s+(?:in\s+estonia\s+)?for\s+(?:the\s+)?(.+?)\??$/iu,
  );
  return Boolean(namedOrganizationRole
    && removeFirstPublicOrganizationName(namedOrganizationRole[1])
      .replace(/[.?!,;:]+$/gu, "")
      .trim() === "");
}

function isCompletePublicForestConceptQuestion(value) {
  const text = String(value || "").trim();
  return /^what\s+is\s+the\s+difference\s+between\s+(?:forest\s+area\s+and\s+forest\s+cover|forest\s+cover\s+and\s+forest\s+area)\??$/iu.test(text)
    || /^how\s+does\s+(?:the\s+)?(?:forest\s+)?inventory\s+(?:distinguish|differentiate)\s+(?:forest\s+area|forest\s+land|woodland\s+coverage|forest\s+cover)\s+from\s+(?:forest\s+area|forest\s+land|woodland\s+coverage|forest\s+cover)\??$/iu.test(text)
    || /^mis\s+vahe\s+on\s+(?:metsamaa\s+pindalal\s+ja\s+metsaga\s+kaetud\s+alal|metsa\s+pindalal\s+ja\s+metsakattel)\??$/iu.test(text);
}

function isCompletePublicNationalForestAreaQuestion(value) {
  const text = String(value || "").trim();
  return /^kui\s+suur\s+(?:oli|on)\s+(?:eesti|eestis)\s+(?:metsamaa\s+pindala|metsaga\s+kaetud\s+ala|metsa\s+pindala|metsasus)(?:\s+(?:19|20)\d{2}(?:\.?\s*aastal)?)?\??$/iu.test(text)
    || /^mitu\s+hektarit\s+(?:oli|on)\s+(?:eesti|eestis)\s+(?:metsamaad|metsaga\s+kaetud\s+ala|metsa|metsakatet)(?:\s+(?:19|20)\d{2}(?:\.?\s+aastal)?)?\??$/iu.test(text)
    || /^how\s+many\s+hectares?\s+did\s+estonia\s+(?:report|record|have)\s+as\s+(?:forest\s+area|forest\s+land|woodland\s+coverage|forest\s+cover)\s+(?:in|for)\s+(?:19|20)\d{2}\??$/iu.test(text)
    || /^how\s+(?:much|many\s+hectares?\s+of)\s+(?:forest\s+area|forest\s+land|woodland\s+coverage|forest\s+cover)\s+did\s+estonia\s+(?:report|record|have)\s+(?:in|for)\s+(?:19|20)\d{2}\??$/iu.test(text);
}

function completePossessiveForestAggregatePossessor(value) {
  const text = String(value || "").trim();
  // A single possessive token is often a person's given name, so do not make
  // arbitrary possessives public. This grammar is deliberately full-query and
  // admits only reviewed public geographies/ecological programmes plus a
  // bounded environmental metric. Appended identity or private-asset clauses
  // therefore fall through to the privacy classifier.
  const possessorSource = String.raw`(?<possessor>[\p{L}\p{N}][\p{L}\p{N}&.-]{0,49}(?:\s+[\p{L}\p{N}][\p{L}\p{N}&.-]{0,49}){0,5})`;
  const forestMetric = String.raw`(?:(?:forest|forestry|woodland)\s+(?:statistics|data|area|land|cover(?:age)?|habitats?|biodiversity|inventory|polic(?:y|ies)|management|monitoring|conservation|research|guidance))`;
  const durationAmount = String.raw`(?:a|an|all|each|every|multiple|several|\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)`;
  const durationPeriod = String.raw`(?:calendar\s+)?(?:years?|decades?)`;
  const durationPhrase = String.raw`(?:(?:the\s+)?(?:last|past|previous|recent)\s+(?:${durationAmount}\s+)?${durationPeriod}|${durationAmount}\s+${durationPeriod}|(?:the\s+)?decade)`;
  const yearRange = String.raw`(?:(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}|(?:from\s+(?:19|20)\d{2}\s+(?:to|through|until)|between\s+(?:19|20)\d{2}\s+and)\s+(?:19|20)\d{2})`;
  const temporalSuffix = String.raw`(?:\s+(?:(?:in|for)\s+(?:19|20)\d{2}|today|now|currently|(?:yearly|annually)(?:\s+${yearRange})?|annual(?:ly)?\s+(?:trend|history|time\s+series)|historical\s+(?:trend|history|time\s+series)|(?:by|per)\s+(?:calendar\s+)?year|year[-\s]+by[-\s]+year|(?:this|current|latest|most\s+recent)\s+year|(?:over|for|through|during|across|throughout)\s+${durationPhrase}|(?:in|for)\s+(?:successive|consecutive|multiple|several|all|each|every)\s+(?:calendar\s+)?years?|since\s+(?:19|20)\d{2}|${durationPhrase}|(?:in\s+)?${yearRange}))?`;
  const methodSuffix = String.raw`(?:\s+in\s+estonia)?\s+and\s+how\s+is\s+it\s+(?:measured|estimated|calculated|surveyed|inventoried)`;
  const patterns = [
    new RegExp(
      String.raw`^(?:what\s+(?:is|are)|how\s+much\s+is)\s+(?:the\s+)?${possessorSource}(?:'s|’s)\s+${forestMetric}(?:${temporalSuffix}|${methodSuffix})\??$`,
      "iu",
    ),
    new RegExp(
      String.raw`^(?:the\s+)?${possessorSource}(?:'s|’s)\s+${forestMetric}(?:${temporalSuffix}|${methodSuffix})\??$`,
      "iu",
    ),
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  return match?.groups?.possessor || null;
}

function denyOnlyPossessiveForestAggregatePossessor(value) {
  const text = String(value || "").trim();
  // The public grammar above deliberately accepts only ordinary word spacing.
  // This second, bounded parser is never an allowlist: it exists solely so a
  // punctuation-separated person/geography collision cannot evade the
  // partial-identity privacy check before reaching an upstream provider.
  const possessorSource = String.raw`(?<possessor>[\p{L}\p{N}][\p{L}\p{N}\p{P}\p{S}\p{Z}\p{M}&]{0,119}?)`;
  const metricSource = String.raw`(?:(?:forest|forestry|woodland)\s+(?:statistics|data|area|land|cover(?:age)?|habitats?|biodiversity|inventory|polic(?:y|ies)|management|monitoring|conservation|research|guidance))`;
  const patterns = [
    new RegExp(
      String.raw`^(?:what\s+(?:is|are)|how\s+much\s+is)\s+(?:the\s+)?${possessorSource}(?:'s|’s)\s+${metricSource}(?:[\s\S]{0,100})?\??$`,
      "iu",
    ),
    new RegExp(
      String.raw`^(?!what\b|how\b|forest\b|forestry\b|woodland\b)(?:the\s+)?${possessorSource}(?:'s|’s)\s+${metricSource}(?:[\s\S]{0,100})?\??$`,
      "iu",
    ),
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  return match?.groups?.possessor || null;
}

// The private-person classifier reads forest geography the older, stricter way
// (an unplaced word is an unnamed region), so answer routing changes never
// alter which questions it treats as personal lookups.
const PRIVACY_CHECK = Object.freeze({ forPrivacyCheck: true });

function isReviewedPublicPossessiveForestAggregatePossessor(possessor) {
  if (!possessor) return false;
  const normalizedPossessor = normalize(possessor);
  const reviewedGeographyOrProgramme = /^(?:estonia|country|nation|state|world|europe|eu|natura(?:\s+2000)?|lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse|gondor|atlantis|middle\s+earth)$/u.test(normalizedPossessor);
  const foreignScope = classifyForestryGeographyScope(`${possessor} forest area`, PRIVACY_CHECK);
  const normalizedForeignIdentity = normalize(foreignScope.identity || foreignScope.matched || "");
  const municipalityScope = reviewedEstonianForestryMunicipalityScope(possessor);
  const municipalityMatches = Array.isArray(municipalityScope?.matched)
    ? municipalityScope.matched
    : [municipalityScope?.matched].filter(Boolean);
  const completeReviewedMunicipality = municipalityScope?.status === "exact"
    && municipalityMatches.some((matched) => normalize(matched) === normalizedPossessor);
  return reviewedGeographyOrProgramme
    || (foreignScope.kind === "foreign-or-other-region"
      && Boolean(normalizedForeignIdentity)
      && normalizedPossessor === normalizedForeignIdentity)
    || completeReviewedMunicipality
    || isReviewedEstonianMunicipalityIdentity(possessor)
    || removeFirstReviewedMunicipalityOrganizationName(possessor).trim() === ""
    || isWholeReviewedPublicOrganizationName(possessor);
}

function isCompletePublicPossessiveForestAggregateQuestion(value) {
  const possessor = completePossessiveForestAggregatePossessor(value);
  return Boolean(possessor)
    && !hasLossyUnicodeLetterOrNumber(possessor)
    && isReviewedPublicPossessiveForestAggregatePossessor(possessor);
}

function hasUnreviewedPossessiveForestAggregateQuestion(value) {
  const possessor = completePossessiveForestAggregatePossessor(value);
  return Boolean(possessor)
    && (hasLossyUnicodeLetterOrNumber(possessor)
      || !isReviewedPublicPossessiveForestAggregatePossessor(possessor));
}

function isCompletePublicEcologicalPossessiveForestQuestion(value) {
  const text = String(value || "").trim();
  const match = text.match(
    /^(?:(?:what|which)\s+(?:is|are)\s+(?:the\s+)?)?(?<subject>[\p{L}-]+(?:\s+[\p{L}-]+){0,3})(?:'s|’s)\s+(?:forest|woodland)\s+(?:habitats?|ecology|range|distribution|biodiversity|conservation)(?:\s+(?:data|information|map|maps|status|description|guidance))?\??$/iu,
  );
  if (!match?.groups?.subject) return false;
  const subjectWords = match.groups.subject.split(/\s+/u);
  const species = subjectWords.at(-1) || "";
  return ECOLOGICAL_SUBJECT_PATTERN.test(species)
    && subjectWords.slice(0, -1).every((word) => (
      ECOLOGICAL_MODIFIER_PATTERN.test(word) || ECOLOGICAL_SUBJECT_PATTERN.test(word)
    ));
}

function normalizePossessivePrivacyCandidate(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[\p{P}\p{S}\p{Z}\p{C}_]+/gu, " ")
    .toLocaleLowerCase("et")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function hasPartialReviewedGeographyPossessiveForestAggregate(value) {
  const completePossessor = completePossessiveForestAggregatePossessor(value);
  if (completePossessor
    && !hasLossyUnicodeLetterOrNumber(completePossessor)
    && isReviewedPublicPossessiveForestAggregatePossessor(completePossessor)) return false;
  const possessor = completePossessor || denyOnlyPossessiveForestAggregatePossessor(value);
  if (!possessor) return false;
  const rawPossessorHasLossyUnicode = hasLossyUnicodeLetterOrNumber(possessor);
  // The complete public grammar is Latin/public-entity scoped. A residual
  // caseless or mixed-script possessor that was not accepted above must never
  // be normalized away and forwarded as an ordinary forestry aggregate.
  if (rawPossessorHasLossyUnicode) return true;
  const normalizedPossessor = normalizePossessivePrivacyCandidate(possessor);
  const foreignScope = classifyForestryGeographyScope(`${normalizedPossessor} forest area`, PRIVACY_CHECK);
  const normalizedForeignIdentity = normalizePossessivePrivacyCandidate(
    foreignScope.identity || foreignScope.matched || "",
  );
  const hasPartialForeignIdentity = foreignScope.kind === "foreign-or-other-region"
    && Boolean(normalizedForeignIdentity)
    && (rawPossessorHasLossyUnicode || normalizedPossessor !== normalizedForeignIdentity);
  const isExactReviewedProgramme = /^(?:estonia|country|nation|state|world|europe|eu|natura(?:\s+2000)?|lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse|gondor|atlantis)$/u
    .test(normalizedPossessor);
  const hasPartialReviewedProgramme = /(?:^|\s)(?:estonia|country|nation|state|world|europe|eu|natura(?:\s+2000)?|lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse|gondor|atlantis)(?:\s|$)/u
    .test(normalizedPossessor)
    && (rawPossessorHasLossyUnicode || !isExactReviewedProgramme);
  const municipalityScope = reviewedEstonianForestryMunicipalityScope(normalizedPossessor);
  const municipalityMatches = Array.isArray(municipalityScope?.matched)
    ? municipalityScope.matched
    : [municipalityScope?.matched].filter(Boolean);
  const hasPartialMunicipality = municipalityMatches.some((matched) => (
    rawPossessorHasLossyUnicode
      || normalizePossessivePrivacyCandidate(matched) !== normalizedPossessor
  ));
  return hasPartialForeignIdentity || hasPartialReviewedProgramme || hasPartialMunicipality;
}

function isCompletePublicForestOwnershipAggregate(value) {
  const text = String(value || "").trim();
  return /^(?:metsamaa|metsaala|mets|metsaomand)\w*\s+(?:on\s+)?(?:riigi|avalikus?|munitsipaal|omavalitsuse|linna|valla)\w*\s+omandis(?:\s+(?:(?:ja|ning)\s+)?eestis)?\??$/iu.test(text)
    || /^(?:forest|woodland)(?:\s+(?:area|land|property))?\s+(?:is\s+)?(?:state|public|municipal|government)[-\s]+owned(?:\s+in\s+estonia)?\??$/iu.test(text);
}

function isCompleteReviewedNationalForestryFactQuestion(value) {
  const text = normalizePossessivePrivacyCandidate(value);
  return [
    /^kui suur osa (?:eesti )?(?:metsamaast|metsadest) kuulub riigile ja kui suur osa (?:kuulub )?eraomanikele$/u,
    /^kui palju (?:metsa|metsamaad) (?:haldab rmk|on rmk hallata|on rmk hallatav)$/u,
    /^kas sanitaarraiet (?:tohib|voib) teha igas vanuses (?:puistus|metsas)$/u,
    /^sanitaarraie igas vanuses (?:puistus|metsas)$/u,
    /^kui suur osa (?:eesti )?(?:metsamaast|metsadest) on (?:range|rangelt) kaitse all$/u,
    /^kaitstavate metsade osakaal eestis$/u,
  ].some((pattern) => pattern.test(text));
}

function hasPersonPrefixedReviewedMunicipalityAssetAssociation(value) {
  const text = String(value || "");
  const normalizedText = normalize(text);
  if (!/(?:^|\s)(?:forest\w*|woodland\w*|land|property|parcel|plot|estate|well|borehole|mets\w*|metsamaa\w*|metsaala\w*|metsauksus\w*|kinnist\w*|maauksus\w*|maatukk\w*|puurkaev\w*|kaev\w*|eramaa\w*)(?:\s|$)/u.test(normalizedText)
    || !/(?:^|\s)(?:own\w*|ownership|hold\w*|held|manag\w*|administ\w*|operat\w*|steward\w*|custod\w*|possess\w*|register\w*|record\w*|assign\w*|inherit\w*|transfer\w*|convey\w*|grant\w*|title\w*|authority|omand\w*|omanik\w*|valdus\w*|valda\w*|kuulu\w*|halda\w*|hallata|majanda\w*|registreeri\w*|salvesta\w*|maara\w*|omista\w*|seosta\w*|loovuta\w*|pari\w*|antud|vastuta\w*|kasuta\w*|kaita\w*)(?:\s|$)/u.test(normalizedText)) return false;
  const words = normalizedText.split(/\s+/u).filter(Boolean);
  const isMunicipalityMarker = (word, next) => /^(?:city|municipalit\w*|municipal|linn\w*|val(?:d|l)\w*)$/u.test(word)
    || (/^(?:local|municipal|city)$/u.test(word) && next === "government");
  const isPublicPrefix = (word) => /^(?:a|an|the|and|or|of|by|to|for|from|in|under|with|at|near|city|municipality|municipal|local|government|official|public|state|national|county|regional|greater|new|old|north|south|east|west|forest\w*|woodland\w*|land|property|parcel|plot|estate|environment\w*|nature\w*|climate\w*|water\w*|waste\w*|agency|authority|board|office|department|service|unit|riigi\w*|avalik\w*|munitsipaal\w*|omavalitsus\w*|linna\w*|valla\w*|keskkonna\w*|metsa\w*|loodus\w*|kliima\w*|vee\w*|jaatme\w*|amet\w*|asutus\w*|osakond\w*|teenistus\w*|uksus\w*)$/u.test(word);
  const isAssetWord = (word) => /^(?:forest\w*|woodland\w*|land|property|parcel|plot|estate|well|borehole|mets\w*|metsamaa\w*|metsaala\w*|metsauksus\w*|kinnist\w*|maauksus\w*|maatukk\w*|puurkaev\w*|kaev\w*|eramaa\w*)$/u.test(word);
  const isAssociationWord = (word) => /^(?:own\w*|ownership|hold\w*|held|manag\w*|administ\w*|operat\w*|steward\w*|custod\w*|possess\w*|register\w*|record\w*|assign\w*|inherit\w*|transfer\w*|convey\w*|grant\w*|title\w*|authority|omand\w*|omanik\w*|valdus\w*|valda\w*|kuulu\w*|halda\w*|hallata|majanda\w*|registreeri\w*|salvesta\w*|maara\w*|omista\w*|seosta\w*|loovuta\w*|pari\w*|antud|vastuta\w*|kasuta\w*|kaita\w*)$/u.test(word);
  const hasReviewedMunicipalityMention = words.some((word, index) => (
    REVIEWED_ESTONIAN_MUNICIPALITY_BASES.has(word)
      && isMunicipalityMarker(words[index + 1] || "", words[index + 2] || "")
  ));
  if (hasReviewedMunicipalityMention && words.some((word, index) => (
    /^(?:to|by|for|under|with)$/u.test(word)
      && words.slice(Math.max(0, index - 3), index).some(isAssociationWord)
      && !isPublicPrefix(words[index + 1] || "")
      && !REVIEWED_ESTONIAN_MUNICIPALITY_BASES.has(words[index + 1] || "")
      && words.slice(index + 2, index + 6).some(isAssetWord)
  ))) return true;
  return words.some((word, index) => (
    REVIEWED_ESTONIAN_MUNICIPALITY_BASES.has(word)
      && isMunicipalityMarker(words[index + 1] || "", words[index + 2] || "")
      && index > 0
      && !isPublicPrefix(words[index - 1])
      && !isAssociationWord(words[index - 1])
      && !REVIEWED_ESTONIAN_MUNICIPALITY_BASES.has(words[index - 1])
  ));
}

function isExplicitHyphenatedReviewedCountyNameMatch(nameParts, matchedText) {
  if (nameParts.length !== 2
    || !isReviewedEstonianCountyIdentity(nameParts.join(" "))) return false;
  const pattern = new RegExp(
    `(?<!\\p{L})${RegExp.escape(nameParts[0])}\\s*\\p{Pd}+\\s*${RegExp.escape(nameParts[1])}(?!\\p{L})`,
    "iu",
  );
  return pattern.test(String(matchedText || ""));
}

function explicitHyphenatedReviewedCountyTokenIndexes(nameParts, matchedText) {
  const indexes = new Set();
  nameParts.forEach((part, index) => {
    if (/\p{L}\s*\p{Pd}+\s*\p{L}/u.test(part)
      && isReviewedEstonianCountyIdentity(part)) indexes.add(index);
  });
  for (let index = 0; index < nameParts.length - 1; index += 1) {
    if (!isExplicitHyphenatedReviewedCountyNameMatch(
      [nameParts[index], nameParts[index + 1]],
      matchedText,
    )) continue;
    indexes.add(index);
    indexes.add(index + 1);
  }
  return indexes;
}

function removeExplicitHyphenatedReviewedCountyNames(value) {
  return String(value || "").replace(
    /(?<!\p{L})(\p{L}+)\s*\p{Pd}+\s*(\p{L}+)(?!\p{L})/gu,
    (match, first, second) => (
      isReviewedEstonianCountyIdentity(`${first} ${second}`) ? " " : match
    ),
  );
}
function hasNamedPersonCadastralAssociation(value) {
  const text = String(value || "");
  ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN)) {
    const prefix = `${match[1]} ${match[2]}`.toLocaleLowerCase("en");
    if (!GENERIC_CADASTRAL_FIELD_PREFIXES.has(prefix)) {
      ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN.lastIndex = 0;
      return true;
    }
  }
  ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN.lastIndex = 0;
  CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN)) {
    const candidate = match[1] || "";
    if (!isReviewedPublicEntityName(candidate)) {
      CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN.lastIndex = 0;
      return true;
    }
  }
  CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN.lastIndex = 0;
  return false;
}

export {
  PRIVACY_CHECK,
  hasNamedPersonCadastralAssociation,
  hasPartialReviewedGeographyPossessiveForestAggregate,
  hasPartialReviewedMunicipalityAssetAssociation,
  hasPersonPrefixedReviewedMunicipalityAssetAssociation,
  hasUnreviewedPossessiveForestAggregateQuestion,
  isCompletePublicEcologicalAgencyRoleQuestion,
  isCompletePublicEcologicalPossessiveForestQuestion,
  isCompletePublicForestConceptQuestion,
  isCompletePublicForestOwnershipAggregate,
  isCompletePublicNationalForestAreaQuestion,
  isCompletePublicPossessiveForestAggregateQuestion,
  isCompleteReviewedPublicEntityAssetAssociation,
  isCompleteReviewedNationalForestryFactQuestion,
  isGenericPublicEnvironmentalInstitutionContactQuery,
  removeExplicitHyphenatedReviewedCountyNames,
};

export { explicitHyphenatedReviewedCountyTokenIndexes };
