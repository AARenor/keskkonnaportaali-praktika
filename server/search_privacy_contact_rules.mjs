import { PERSON_CONTEXT_STOPWORD_PATTERN, normalize } from "./search_query_terms.mjs";
import {
  analyzeEnglishResidenceSignals,
  hasAdministrativeQueryRoot,
  hasPrivacyDomainQueryRoot,
  isEcologicalCommonNamePair,
  isSuspiciousIdentityFragment,
  isTitleCasedIdentityToken,
} from "./search_privacy_identity.mjs";
import { REVIEWED_ESTONIAN_MUNICIPALITY_BASES } from "./municipalities.mjs";
import {
  CADASTRE_PATTERN,
  ESTONIAN_COMPOUND_BUILDING_ASSET_PATTERN,
  ESTONIAN_PRIVATE_DWELLING_TOKEN_PATTERN,
  ESTONIAN_REGULATORY_BUILDING_TOKEN_PATTERN,
  PRIVATE_ASSET_LOOKUP_ACTION_PATTERN,
} from "./search_privacy_protected_area.mjs";
import {
  ENGLISH_ASSET_IN_PERSON_NAME_PATTERN,
  ENGLISH_ASSET_TO_PERSON_PATTERN,
  ENGLISH_NAMED_POSSESSIVE_ASSET_PATTERN,
  ENGLISH_NAMED_ASSET_ASSOCIATION_PATTERN,
  ENGLISH_PERSONAL_LOOKUP_PATTERNS,
  ENGLISH_PERSON_APPOSITIVE_ROLE_ASSET_PATTERN,
  ENGLISH_PERSON_ROLE_ASSET_PATTERN,
  ENGLISH_PERSON_TO_ASSET_PATTERN,
  ENGLISH_PRIVATE_ASSET_SOURCE,
  ECOLOGICAL_MODIFIER_PATTERN,
  ECOLOGICAL_SUBJECT_PATTERN,
  INSTITUTIONAL_CONTACT_CHANNEL_PATTERN,
  NAMED_PERSON_DIRECT_CONTACT_FIELD_PATTERN,
  PRIVATE_CONTACT_FIELD_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_TOKEN_PATTERN,
  PRIVATE_POSTAL_FIELD_PATTERN,
  PUBLIC_CONTACT_ROLE_PATTERN,

  PUBLIC_ORGANIZATION_PATTERN,
} from "./search_privacy_patterns.mjs";
import { removeKnownPublicOrganizationName } from "./search_privacy_text.mjs";
import { removeExplicitHyphenatedReviewedCountyNames } from "./search_privacy_public_forest.mjs";

export function classifyPrivacyContactRules(text, reviewedState) {
  const {
    reviewedConceptualPublicQuestion,
    reviewedTemporalFireInformationQuestion,
  } = reviewedState;
  const hasMixedScriptWord = (text.match(/\p{L}+/gu) || []).some((word) => (
    /\p{Script=Latin}/u.test(word)
      && /[^\p{Script=Latin}\p{M}]/u.test(word)
  ));
  const hasEstonianRegulatoryBuildingContext = ESTONIAN_REGULATORY_BUILDING_TOKEN_PATTERN.test(normalize(text))
    || ESTONIAN_COMPOUND_BUILDING_ASSET_PATTERN.test(text)
    || ESTONIAN_PRIVATE_DWELLING_TOKEN_PATTERN.test(text);
  const hasPrivateAssetContext = hasEstonianRegulatoryBuildingContext
    || /(?<!\p{L})(?:katastri\w*|kinnist\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|metsamaa\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*|puurkaev\w*|aadress\w*|property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|forest|woodland)(?!\p{L})/iu.test(text);
  // A private-asset query containing a Latin/non-Latin mixed token is
  // ambiguous by construction (for example Armenian/Cyrillic letters inside
  // "owns"). Fail closed instead of relying on an endless confusable list.
  if (hasMixedScriptWord
    && hasPrivateAssetContext
    && !reviewedConceptualPublicQuestion) return { decision: true };
  const matchesEnglishPersonalPattern = ENGLISH_PERSONAL_LOOKUP_PATTERNS
    .some((pattern) => pattern.test(text));
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  const sensitiveIndex = words.findIndex((word) => (
    PRIVATE_CONTACT_FIELD_PATTERN.test(word)
    || PRIVATE_PERSON_ATTRIBUTE_TOKEN_PATTERN.test(word)
  ));
  const hasSensitivePersonalAttribute = PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text);
  const hasPrivatePostalField = PRIVATE_POSTAL_FIELD_PATTERN.test(text);
  const textWithoutKnownOrganizations = removeKnownPublicOrganizationName(text);
  const hasKnownPublicOrganization = normalize(textWithoutKnownOrganizations) !== normalize(text);
  // A verified organization span has already been removed above. In the
  // residual text, two adjacent title-cased tokens followed by a personal
  // contact field are therefore a named-person request even when either token
  // also happens to be a place or ecological word ("Pärnu Mets telefon").
  // Token positions, rather than whitespace, keep punctuation variants inside
  // the same fail-closed rule.
  const residualContactNameMatches = [...textWithoutKnownOrganizations
    .matchAll(/[\p{L}]+(?:[-'’][\p{L}]+)*/gu)];
  const residualContactNameTokens = residualContactNameMatches.map((match) => match[0]);
  const hasCapitalizedNameWithPrivateContact = residualContactNameTokens.some((token, index, tokens) => (
    isTitleCasedIdentityToken(token)
      && isTitleCasedIdentityToken(tokens[index + 1] || "")
      && tokens.slice(index + 2, index + 5)
        .some((candidate) => NAMED_PERSON_DIRECT_CONTACT_FIELD_PATTERN.test(candidate))
  ));
  const hasStructuredEcologicalUnitContact = residualContactNameTokens.some((token, index, tokens) => (
    isTitleCasedIdentityToken(token)
      && isTitleCasedIdentityToken(tokens[index + 1] || "")
      && ECOLOGICAL_SUBJECT_PATTERN.test(token)
      && ECOLOGICAL_SUBJECT_PATTERN.test(tokens[index + 1] || "")
      && /^(?:biodivers\w*|conserv\w*|ecolog\w*|elupai[kg]\w*|elurikk\w*|habitat\w*|kaitse\w*|lii[kg]\w*|monitoring\w*|seire\w*|species\w*)$/iu.test(tokens[index + 2] || "")
      && /^(?:bureau|department|desk|office|service|team|unit|büroo\w*|buroo\w*|osakon\w*|teenistus\w*|üksus\w*|uksus\w*)$/iu.test(tokens[index + 3] || "")
      && tokens.slice(index + 4, index + 7)
        .some((candidate) => NAMED_PERSON_DIRECT_CONTACT_FIELD_PATTERN.test(candidate))
  ));
  if (hasCapitalizedNameWithPrivateContact
    && !hasKnownPublicOrganization
    && !hasStructuredEcologicalUnitContact) return { decision: true };
  const hasExplicitCapitalizedPersonName = /(?<!\p{L})\p{Lu}[\p{Ll}'’-]{1,39}(?:\s+\p{Lu}[\p{Ll}'’-]{1,39}){1,2}(?!\p{L})/u.test(textWithoutKnownOrganizations);
  const hasInstitutionalContactChannel = INSTITUTIONAL_CONTACT_CHANNEL_PATTERN.test(text)
    || PRIVATE_POSTAL_FIELD_PATTERN.test(text);
  const contactAssociationText = textWithoutKnownOrganizations
    .replace(/[\p{P}\p{S}\p{Z}\p{C}\p{M}_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const explicitPrivateAssetContactAssociation = [
    /\b(?:private|family|household|personal|neighbor(?:ing)?|neighbour(?:ing)?|adjacent)\s+(?:property|parcel|plot|lot|estate|land|unit|house|home|farm|well|borehole|building|dwelling|cottage|premises|site|installation|landholding|holding|forest|woodland)\b(?:\s+[\p{L}\p{N}]{1,30}){0,16}\s+(?:contact(?:\s+(?:details?|information))?|phone|telephone|email|mailbox|address)\b/iu,
    /\b(?:era|eraisiku|perekonna|isiklik|naabri|kõrval)\w*\s+(?:kinnist|maa(?:u|ü)ksus|maat(?:ü|u)k|maja|kaev|puurkaev|hoone)\w*\b(?:\s+[\p{L}\p{N}]{1,30}){0,16}\s+(?:kontakt\w*|telefoni?\w*|e\s+post\w*|meil\w*|postkast\w*|aadress\w*)\b/iu,
    /\b(?:erakaev|erakinnist|eramaa)\w*\b(?:\s+[\p{L}\p{N}]{1,30}){0,16}\s+(?:kontakt\w*|telefoni?\w*|e\s+post\w*|meil\w*|postkast\w*|aadress\w*)\b/iu,
    /\b(?:contact\s+(?:details?|information)|phone(?:\s+number)?|telephone(?:\s+number)?|email(?:\s+address)?|mailbox|postal\s+address)\s+(?:for|of)\s+(?:the\s+)?(?:private|family|household|personal|neighbor(?:ing)?|neighbour(?:ing)?|adjacent)\s+(?:property|parcel|plot|lot|estate|land|unit|house|home|farm|well|borehole|building|dwelling|cottage|premises|site|installation|landholding|holding|forest|woodland)$/iu,
  ].some((pattern) => pattern.test(contactAssociationText));
  if (explicitPrivateAssetContactAssociation
    && !reviewedConceptualPublicQuestion) return { decision: true };
  // Contact details for a reviewed public organization are public service
  // navigation, not a private-person lookup. Withdraw the exemption whenever
  // a second person, private/neighbor asset, cadastral identifier, postal
  // field, or sensitive personal attribute is also present.
  const reviewedPublicOrganizationContactCandidate = hasKnownPublicOrganization
    && hasInstitutionalContactChannel
    && !CADASTRE_PATTERN.test(text)
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    && !/\b(?:era|naaber|naabri|kõrval)\w*\s+(?:kinnist|maa|maatü|puurkaev|hoone)\w*\b/iu.test(textWithoutKnownOrganizations);
  const describedNamedRoleAsset = new RegExp(
    String.raw`\b(?:environmental\s+records?\s+describe|registry\s+records?\s+describe|according\s+to\s+the\s+filing[,]?)\s+[\p{L}'’.-]{2,40}\s+[\p{L}'’.-]{2,40}\s+(?:(?:is\s+)?entrusted\s+with|as\s+(?:a\s+)?(?:caretaker|custodian|manager|operator|steward)\s+(?:for|of))\s+(?:an?\s+|the\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}\b`,
    "iu",
  ).test(textWithoutKnownOrganizations);
  const trailingNamedRoleAsset = new RegExp(
    String.raw`\b(?:operational\s+)?(?:custodian|caretaker|manager|operator|steward)\s+for\s+(?:an?\s+|the\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}\b[\s\S]{0,55}\bis\s+[\p{L}'’.-]{2,40}\s+[\p{L}'’.-]{2,40}(?:[.?!]|$)`,
    "iu",
  ).test(textWithoutKnownOrganizations);
  if ((describedNamedRoleAsset || trailingNamedRoleAsset)
    && !reviewedConceptualPublicQuestion) return { decision: true };
  if (!reviewedTemporalFireInformationQuestion
    && !reviewedConceptualPublicQuestion
    && (ENGLISH_NAMED_POSSESSIVE_ASSET_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_NAMED_ASSET_ASSOCIATION_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_ASSET_TO_PERSON_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_ASSET_IN_PERSON_NAME_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_PERSON_TO_ASSET_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_PERSON_ROLE_ASSET_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_PERSON_APPOSITIVE_ROLE_ASSET_PATTERN.test(textWithoutKnownOrganizations))) {
    return { decision: true };
  }
  const {
    englishNamedResidenceQuestion,
    englishNamedFoundQuestion,
    englishNamedLocatedQuestion,
    englishLocateNamedPerson,
    englishWhereResidenceIsEcological,
    englishWhereFoundIsEcological,
  } = analyzeEnglishResidenceSignals(textWithoutKnownOrganizations);
  // Postal-field phrases are sensitive predicates, not identity material.
  // Removing the complete phrase prevents words such as "details" from
  // synthesizing a person beside a legitimate public organization or policy.
  const identityText = removeExplicitHyphenatedReviewedCountyNames(
    textWithoutKnownOrganizations.replace(PRIVATE_POSTAL_FIELD_PATTERN, " "),
  );
  const rawIdentityFragments = (identityText.match(/[\p{L}\p{N}]+/gu) || [])
    .map((word) => word.toLocaleLowerCase("et"))
    .filter(Boolean);
  const identityFragments = rawIdentityFragments
    .filter((word) => !PRIVATE_CONTACT_FIELD_PATTERN.test(word))
    .filter((word) => !PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN.test(word))
    .filter((word) => !PERSON_CONTEXT_STOPWORD_PATTERN.test(word))
    .filter((word) => !PUBLIC_ORGANIZATION_PATTERN.test(word))
    .filter((word) => !PUBLIC_CONTACT_ROLE_PATTERN.test(word))
    .filter((word) => !/^\d+$/u.test(word))
    .filter(Boolean);
  const isPotentialPersonNameToken = (word) => !PRIVATE_CONTACT_FIELD_PATTERN.test(word)
    && !PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN.test(word)
    && !PERSON_CONTEXT_STOPWORD_PATTERN.test(word)
    && !PUBLIC_ORGANIZATION_PATTERN.test(word)
    && !PUBLIC_CONTACT_ROLE_PATTERN.test(word)
    && !/^\d+$/u.test(word)
    && !hasAdministrativeQueryRoot(word);
  const hasAdjacentNameShapedPair = rawIdentityFragments.some((word, index) => {
    const next = rawIdentityFragments[index + 1];
    return Boolean(next)
      && isPotentialPersonNameToken(word)
      && isPotentialPersonNameToken(next)
      && !isEcologicalCommonNamePair(word, next);
  });
  const suspiciousIdentityFragments = identityFragments.filter(isSuspiciousIdentityFragment);
  const hasAdjacentSuspiciousPair = rawIdentityFragments.some((word, index) => {
    const next = rawIdentityFragments[index + 1];
    return Boolean(next) && isSuspiciousIdentityFragment(word) && isSuspiciousIdentityFragment(next);
  });
  const hasAdjacentUnknownEcologicalPair = rawIdentityFragments.some((word, index) => {
    const next = rawIdentityFragments[index + 1];
    return Boolean(next)
      && ((isSuspiciousIdentityFragment(word) && ECOLOGICAL_SUBJECT_PATTERN.test(next))
        || (ECOLOGICAL_SUBJECT_PATTERN.test(word) && isSuspiciousIdentityFragment(next)));
  });
  const hasAdjacentBareEcologicalPair = rawIdentityFragments.some((word, index) => {
    const next = rawIdentityFragments[index + 1];
    return Boolean(next)
      && ECOLOGICAL_SUBJECT_PATTERN.test(word)
      && ECOLOGICAL_SUBJECT_PATTERN.test(next)
      && !ECOLOGICAL_MODIFIER_PATTERN.test(word)
      && !ECOLOGICAL_MODIFIER_PATTERN.test(next);
  });
  const hasHumanMarker = /\b(?:eraisik|inimene|isiku|inimese|elaniku|residendi)\w*\b/iu.test(text);
  const hasSensitiveContact = hasInstitutionalContactChannel
    || /\b(?:residence|residentsus\w*|elukoh\w*|kodukoht\w*)\b/iu.test(text)
    || hasPrivatePostalField;
  const hasAddressAndPresence = /\baadress\w*\b[\s\S]{0,100}\b(?:elab|peatub|resideerib|paikneb)\b/iu.test(text);
  const residenceVerbIndex = words.findIndex((word) => /^(?:elab|elava|resideeri\w*|resideeru\w*|peatub|viibib|asub|paikneb|ööbib|oobib|live[sd]?|living|reside[sd]?|residing|stay(?:s|ing)?|occup(?:y|ies|ied|ying))$/iu.test(word));
  const hasResidenceContext = residenceVerbIndex >= 0
    || /\bkus\b[\s\S]{0,100}\b(?:elab|resideeri\w*|resideeru\w*)\b/iu.test(text)
    || /\bwhere\b[\s\S]{0,100}\b(?:live|reside|stay)\b/iu.test(text);
  const hasFusedIdentityShape = suspiciousIdentityFragments.some((word) => word.length >= 8);
  const hasFusedPrivateAssetIdentity = hasFusedIdentityShape
    && hasPrivateAssetContext
    && (PRIVATE_ASSET_LOOKUP_ACTION_PATTERN.test(text)
      || /(?<!\p{L})(?:registr\w*|registry|register)(?!\p{L})/iu.test(text));
  const hasPrivateAssetIdentity = hasAdjacentNameShapedPair
    || hasAdjacentSuspiciousPair
    || hasAdjacentUnknownEcologicalPair
    || hasAdjacentBareEcologicalPair
    || hasFusedPrivateAssetIdentity;
  const hasNamedIdentity = hasAdjacentNameShapedPair
    || suspiciousIdentityFragments.length >= 2
    || hasAdjacentUnknownEcologicalPair
    || (suspiciousIdentityFragments.length >= 1 && hasKnownPublicOrganization)
    || (suspiciousIdentityFragments.length >= 1 && hasSensitiveContact)
    || (hasAdjacentBareEcologicalPair && (hasSensitiveContact || hasKnownPublicOrganization))
    || (hasResidenceContext && hasFusedIdentityShape);
  const publicOrganizationContactResidualTokens = textWithoutKnownOrganizations.match(/[\p{L}\p{N}]+/gu) || [];
  const publicOrganizationContactSafeToken = /^(?:a|a?adress\w*|about|adaptation|address\w*|advice|advisory|air|ala\w*|ametlik\w*|andm\w*|andmev[äa]rav\p{L}*|are|area\w*|avalik\w*|biodivers\w*|borehole\w*|branch|büroo\w*|buroo\w*|by|can|carbon\w*|centre\w*|center\w*|channels?|circular|circularity|climate\w*|coastal\w*|concerning|conserv\w*|contact\w*|counter|cover\w*|customer\w*|data\w*|decarbonis\w*|decarboniz\w*|department\w*|departmental\w*|desk|details?|directorate\w*|division|do|duty|e|ecolog\w*|economy|edastamis\w*|elektr\w*|email\w*|elurikkus\w*|emission\w*|energia\w*|energy\w*|enquir\w*|environment\w*|estuar\w*|finance\w*|find|for|forest\w*|front|general|get|geothermal\w*|greenhouse\w*|groundwater\w*|guidance\w*|habitat\w*|heide\w*|heritage\w*|hoiatus\w*|hooldus\w*|how|hydrogen\w*|hydrolog\w*|i|[\p{L}-]*info\w*|infrastructure\w*|inquir\w*|is|ja|jaoks|juhis\w*|jõg\w*|kaar[dt]\w*|kaev\w*|kaitseal\w*|kaitstav\w*|kanal\w*|kasvuhoonegaas\w*|klienditeenindus\w*|klienditugi\w*|klienditoe\w*|kliimapoliitik\w*|kohta|kus|(?:üld|uld|yld)?kontakt\w*|kuidas|küsimus\w*|land|leida|litter\w*|loa\w*|loodus\w*|maakasutus\w*|mailbox\w*|margala\w*|marine\w*|maps?|matka\w*|meadow\w*|media|mets\w*|modell\w*|monitoring|municipal\w*|m[äa]rgala\w*|m[üu]ra\w*|national|natura|nature\w*|noise\w*|number|nõustamis\w*|noustamis\w*|office\w*|on|overall|peat\w*|permit\w*|permitting|phone\w*|p[äa]ikese\w*|p[õo]hjave\w*|policy|portal\w*|post|postiaadress\w*|[\p{L}-]*postikanal\w*|[\p{L}-]*postkast\w*|postal\w*|press\w*|private|program\w*|programme\w*|property|protected|public\w*|pärand\w*|quality\w*|rannikuve\w*|rakendamis\w*|reach|reception|recovery\w*|regional\w*|renewable\w*|reostusteate\w*|restoration\w*|riigimets\w*|ringmajandus\w*|river\w*|saamiseks|section|seire\w*|service\w*|soil\w*|solar\w*|species\w*|state|stewardship\w*|support\w*|s[üu]sinik\w*|table|taastamis\w*|taastuvenergia\w*|team|teabe\w*|teenindus\w*|telefoni?\w*|telephone\w*|the|turba\w*|tuule\w*|[üu]leujut\w*|unit|use|used|valvebüroo\w*|valveburoo\w*|visitor\w*|water\w*|watershed\w*|waste\w*|well|what|where|which|wind\w*|wetland\w*|woodland\w*|working|ühine|uhine|üldtelefoni?\w*|uldtelefoni?\w*|yldtelefoni?\w*)$/iu;
  const publicOrganizationContactExplicitPerson = /\b(?:person|individual|employee|staff\s+member|named\s+official|private\s+contact|isik\w*|inime\w*|eraisik\w*|ametnik\w*|töötaja\w*|tootaja\w*|spetsialist\w*)\b[\s\S]{0,55}\b(?:contact\w*|phone\w*|telephone\w*|email\w*|e-?post\w*|kontakt\w*|telefoni?\w*|meil\w*)\b/iu.test(textWithoutKnownOrganizations)
    || /\b(?:contact\w*|phone\w*|telephone\w*|email\w*|e-?post\w*|kontakt\w*|telefoni?\w*|meil\w*)\b[\s\S]{0,55}\b(?:person|individual|employee|staff\s+member|isik\w*|inime\w*|eraisik\w*|ametnik\w*|töötaja\w*|tootaja\w*|spetsialist\w*)\b/iu.test(textWithoutKnownOrganizations);
  const publicOrganizationContactUnitToken = /^(?:unit|office|desk|department|directorate|division|section|branch|team|centre|center|service|programme|program|counter|bureau|taskforce|observatory|secretariat|workgroup|group|coalition|alliance|partnership|consortium|initiative|project|hub|council|board|committee|commission|panel|forum|laboratory|lab|network|ministry|agency|authority|institute|university|museum|[\p{L}-]*(?:büroo|buroo|osakon|talitus|üksus|uksus|meeskon|keskus|teenistus|teabepunk|kontaktpunk|nõustamisla|noustamisla|sekretariaa|töö?rühm|too?ruhm|rühm|ruhm|grupp|koostööko|koostooko|võrgustik|vorgustik|liit|partnerlus|konsortsium|algatus|projekt|programm|nõukogu|noukogu|komisjon|komitee|paneel|foorum|labor)\w*)$/iu;
  const publicOrganizationContactDomainToken = /^(?:catalogue\w*|flood\w*|kliimapoliitik\w*|management\w*|mapping\w*|mulla\w*|natura\w*|official\w*|project\w*|protection\w*|renewal\w*|requests?|risk\w*|roles?|teenus\w*|warning\w*|(?:üld|uld|yld)?postkast\w*)$/iu;
  const publicOrganizationContactTopicLinkToken = /^(?:[\p{L}-]*(?:andm|seire|teenus|talitus|üksus|uksus|büroo|buroo|osakon|keskus|programm|projekt|portaal|portal)\w*|catalogue\w*|conserv\w*|data\w*|guidance\w*|habitat\w*|information\w*|management\w*|mapping\w*|monitoring\w*|office\w*|permit\w*|policy|programme\w*|project\w*|protection\w*|renewal\w*|requests?|restoration\w*|risk\w*|roles?|service\w*|taastamis\w*|unit\w*|warning\w*)$/iu;
  const isLexicallyReviewedPublicOrganizationContactWord = (candidate) => (
    publicOrganizationContactSafeToken.test(candidate)
      || publicOrganizationContactUnitToken.test(candidate)
      || publicOrganizationContactDomainToken.test(candidate)
  );
  const hasReviewedEcologicalDisambiguatorAt = (tokens, index) => {
    const first = tokens[index] || "";
    const second = tokens[index + 1] || "";
    const disambiguator = tokens[index + 2] || "";
    return ECOLOGICAL_SUBJECT_PATTERN.test(first)
      && ECOLOGICAL_SUBJECT_PATTERN.test(second)
      && /^(?:biodivers\w*|conserv\w*|ecolog\w*|elupai[kg]\w*|elurikk\w*|habitat\w*|kaitse\w*|lii[kg]\w*|monitoring\w*|seire\w*|species\w*)$/iu.test(disambiguator)
      && tokens.slice(index + 2, index + 7)
        .some((candidate) => publicOrganizationContactUnitToken.test(candidate));
  };
  const isReviewedPublicOrganizationContactWord = (candidate, index, tokens) => {
    if (isLexicallyReviewedPublicOrganizationContactWord(candidate)) return true;
    if (/^green\w*$/iu.test(candidate)
      && /^infrastructure\w*$/iu.test(tokens[index + 1] || "")) return true;
    if (publicOrganizationContactTopicLinkToken.test(candidate)) return true;
    if (REVIEWED_ESTONIAN_MUNICIPALITY_BASES.has(normalize(candidate))) {
      const previous = tokens[index - 1] || "";
      const next = tokens[index + 1] || "";
      if (PRIVATE_CONTACT_FIELD_PATTERN.test(previous)
        || PRIVATE_CONTACT_FIELD_PATTERN.test(next)) return true;
    }
    if (!hasPrivacyDomainQueryRoot(candidate)) return false;
    const previous = tokens[index - 1] || "";
    const next = tokens[index + 1] || "";
    return publicOrganizationContactTopicLinkToken.test(candidate)
      || publicOrganizationContactTopicLinkToken.test(previous)
      || publicOrganizationContactTopicLinkToken.test(next)
      || hasReviewedEcologicalDisambiguatorAt(tokens, index)
      || hasReviewedEcologicalDisambiguatorAt(tokens, index - 1);
  };
  // Removing a verified organization name does not make every residual unit
  // phrase public. Two adjacent identity-shaped tokens beside a contact
  // channel remain private even when punctuation fused them in the input.
  const publicOrganizationContactHasNamedResidual = rawIdentityFragments.some((word, index) => {
    const next = rawIdentityFragments[index + 1];
    if (!next || (isReviewedPublicOrganizationContactWord(word, index, rawIdentityFragments)
      && isReviewedPublicOrganizationContactWord(next, index + 1, rawIdentityFragments))) return false;
    const wordIsUnreviewedIdentity = isSuspiciousIdentityFragment(word)
      && !isReviewedPublicOrganizationContactWord(word, index, rawIdentityFragments);
    const nextIsUnreviewedIdentity = isSuspiciousIdentityFragment(next)
      && !isReviewedPublicOrganizationContactWord(next, index + 1, rawIdentityFragments);
    return (wordIsUnreviewedIdentity && nextIsUnreviewedIdentity)
      || (wordIsUnreviewedIdentity && ECOLOGICAL_SUBJECT_PATTERN.test(next))
      || (ECOLOGICAL_SUBJECT_PATTERN.test(word) && nextIsUnreviewedIdentity)
      || (ECOLOGICAL_SUBJECT_PATTERN.test(word)
        && !isReviewedPublicOrganizationContactWord(next, index + 1, rawIdentityFragments))
      || (ECOLOGICAL_SUBJECT_PATTERN.test(next)
        && !isReviewedPublicOrganizationContactWord(word, index, rawIdentityFragments))
      || (ECOLOGICAL_SUBJECT_PATTERN.test(word) && ECOLOGICAL_SUBJECT_PATTERN.test(next));
  });
  // Preserve capitalization for person-shape detection, but remove only the
  // verified organization marker. The broader organization-name cleanup may
  // legitimately consume a title-cased unit and must not erase a person's
  // name before this privacy check.
  const structuredContactResidualWords = textWithoutKnownOrganizations.match(/\p{L}+/gu) || [];
  const normalizedStructuredContactResidualWords = structuredContactResidualWords
    .map((word) => word.toLocaleLowerCase("et"));
  const publicOrganizationContactHasStructuredCapitalizedName = structuredContactResidualWords.some((word, index) => {
    const next = structuredContactResidualWords[index + 1] || "";
    if (!/^\p{Lu}[\p{L}'’]{1,39}$/u.test(word)
      || !/^\p{Lu}[\p{L}'’]{1,39}$/u.test(next)
      || PUBLIC_ORGANIZATION_PATTERN.test(`${word} ${next}`)) return false;
    const reviewedDescriptorPair = isReviewedPublicOrganizationContactWord(
      normalizedStructuredContactResidualWords[index],
      index,
      normalizedStructuredContactResidualWords,
    ) && isReviewedPublicOrganizationContactWord(
      normalizedStructuredContactResidualWords[index + 1],
      index + 1,
      normalizedStructuredContactResidualWords,
    );
    if (reviewedDescriptorPair) return false;
    return structuredContactResidualWords.slice(index + 2, index + 7)
      .some((candidate) => PRIVATE_CONTACT_FIELD_PATTERN.test(candidate));
  });
  const publicOrganizationUnitContactGrammar = publicOrganizationContactResidualTokens
    .some((word) => publicOrganizationContactUnitToken.test(word))
    && publicOrganizationContactResidualTokens
      .every(isReviewedPublicOrganizationContactWord);
  const reviewedPublicOrganizationContact = reviewedPublicOrganizationContactCandidate
    && publicOrganizationContactResidualTokens.length > 0
    && !publicOrganizationContactExplicitPerson
    && !publicOrganizationContactHasNamedResidual
    && !publicOrganizationContactHasStructuredCapitalizedName
    && (publicOrganizationContactResidualTokens.every(isReviewedPublicOrganizationContactWord)
      || publicOrganizationUnitContactGrammar)
    && !/(?<!\p{L})\p{L}[\p{L}'’-]{1,39}(?:'s|’s)\s+(?:number|phone|telephone|email|contact)(?!\p{L})/iu.test(textWithoutKnownOrganizations);
  const reviewedEcologicalPublicServiceContact = hasInstitutionalContactChannel
    && publicOrganizationContactResidualTokens
      .some((_, index, tokens) => hasReviewedEcologicalDisambiguatorAt(tokens, index))
    && publicOrganizationContactResidualTokens
      .some((word) => publicOrganizationContactUnitToken.test(word))
    && publicOrganizationContactResidualTokens.every(isReviewedPublicOrganizationContactWord)
    && !publicOrganizationContactExplicitPerson
    && !publicOrganizationContactHasNamedResidual
    && !publicOrganizationContactHasStructuredCapitalizedName;
  const contactScope = !hasInstitutionalContactChannel
    ? "none"
    : (hasKnownPublicOrganization && (publicOrganizationContactHasNamedResidual
        || publicOrganizationContactHasStructuredCapitalizedName)
      ? "private-person"
      : (reviewedPublicOrganizationContact || reviewedEcologicalPublicServiceContact)
        ? "public-organization"
        : hasKnownPublicOrganization
          ? "ambiguous"
          : "none");
  return {
    decision: null,
    contactScope,
    hasNamedIdentity,
    hasPrivateAssetIdentity,
    hasEstonianRegulatoryBuildingContext,
    hasExplicitCapitalizedPersonName,
    identityText,
    rawIdentityFragments,
    textWithoutKnownOrganizations,
    matchesEnglishPersonalPattern,
    sensitiveIndex,
    hasSensitivePersonalAttribute,
    hasPrivatePostalField,
    residualContactNameMatches,
    residualContactNameTokens,
    hasInstitutionalContactChannel,
    hasAdjacentSuspiciousPair,
    hasHumanMarker,
    hasSensitiveContact,
    hasAddressAndPresence,
    hasResidenceContext,
    englishNamedResidenceQuestion,
    englishNamedFoundQuestion,
    englishNamedLocatedQuestion,
    englishLocateNamedPerson,
    englishWhereResidenceIsEcological,
    englishWhereFoundIsEcological,
  };
}
