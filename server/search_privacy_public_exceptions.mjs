import { canonicalSecurityText } from "./search_query_canonicalization.mjs";
import { normalize } from "./search_query_terms.mjs";
import { removeFirstReviewedMunicipalityOrganizationName, reviewedEstonianForestryMunicipalityScope } from "./municipalities.mjs";
import {
  PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS,
  PUBLIC_ORGANIZATION_PATTERN,
  removeFirstPublicOrganizationName,
} from "./search_privacy_patterns.mjs";
import {
  ESTONIAN_BUILDING_ACTIVITY_SOURCE,
  ESTONIAN_BUILDING_ACTIVITY_TOKEN_PATTERN,
  ESTONIAN_GENERIC_BUILDING_SOURCE,
  ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE,
  ESTONIAN_PROTECTED_BUILDING_LOCATION_TOKEN_PATTERN,
  ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE,
  ESTONIAN_REVIEWED_GENERIC_REGULATORY_CONSENT_PATTERNS,
  ESTONIAN_REVIEWED_INSTITUTIONAL_REGULATORY_CONSENT_PATTERNS,
  ESTONIAN_REVIEWED_NATIONAL_PARK_NAME_SOURCE,
  hasLossyUnicodeLetterOrNumber,
} from "./search_privacy_protected_area.mjs";

export {
  BENIGN_REGULATORY_CONTEXT_NAME_SOURCE,
  BENIGN_REGULATORY_ATTRIBUTION_SOURCE,
  BENIGN_NAMED_REGULATORY_CONTEXT_PATTERNS,
  isBenignNaturalPersonAttributionClause,
  isReviewedBenignProtectedAreaAdviceTail,
};
export function isReviewedGenericProtectedAreaConsentQuery(value) {
  const canonicalText = canonicalSecurityText(value);
  const withoutReviewedMunicipality = removeFirstReviewedMunicipalityOrganizationName(canonicalText);
  const withoutExactPublicOrganization = PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS.reduce(
    (remaining, pattern) => remaining.replace(pattern, " "),
    withoutReviewedMunicipality,
  );
  const matchesGenericGrammar = [canonicalText, withoutExactPublicOrganization].some((candidate) => {
    if (hasLossyUnicodeLetterOrNumber(candidate)) return false;
    const normalizedQuery = normalize(candidate);
    return ESTONIAN_REVIEWED_GENERIC_REGULATORY_CONSENT_PATTERNS
      .some((pattern) => pattern.test(normalizedQuery));
  });
  if (matchesGenericGrammar) return true;
  const removedExactPublicOrganization = normalize(withoutExactPublicOrganization)
    !== normalize(withoutReviewedMunicipality);
  return removedExactPublicOrganization
    && !hasLossyUnicodeLetterOrNumber(withoutExactPublicOrganization)
    && ESTONIAN_REVIEWED_INSTITUTIONAL_REGULATORY_CONSENT_PATTERNS.some(
      (pattern) => pattern.test(normalize(withoutExactPublicOrganization)),
    );
}

const REVIEWED_PROTECTED_BUILDING_CONTACT_ORGANIZATION_PATTERNS = Object.freeze([
  /\b(?:eesti\s+)?keskkonnaamet(?:i(?:ga|le|lt|l|s|st)?)?\b/giu,
  /\b(?:euroopa\s+)?keskkonnaagentuur(?:i(?:ga|le|lt|l|s|st)?)?\b/giu,
  /\bkliimaministeerium(?:i(?:ga|le|lt|l|s|st)?)?\b/giu,
  /\briigimetsa\s+majandamise\s+keskus(?:e(?:ga|le|lt|l|s|st)?)?\b/giu,
  /\b(?:estonian\s+)?environment(?:al)?\s+board\b/giu,
  /\b(?:rmk|kik)\b/giu,
]);

export function isReviewedPublicOrganizationProtectedBuildingContactQuery(value) {
  const canonicalText = canonicalSecurityText(value);
  const withoutPublicOrganization = REVIEWED_PROTECTED_BUILDING_CONTACT_ORGANIZATION_PATTERNS.reduce(
    (remaining, pattern) => remaining.replace(pattern, " "),
    canonicalText,
  );
  const removedReviewedPublicOrganization = normalize(withoutPublicOrganization)
    !== normalize(canonicalText);
  const rawResidual = withoutPublicOrganization.trim();
  if (hasLossyUnicodeLetterOrNumber(rawResidual)) return false;
  // Normalization intentionally removes punctuation and case, so inspect the
  // raw residual first. Quoted or title-cased words immediately attached to a
  // building may be a private name (for example `"Vana" maja`) and must reach
  // the conservative person/asset classifier instead of this public exception.
  const rawContactTokens = rawResidual.match(/[\p{L}]+(?:[-/'’][\p{L}]+)*/gu) || [];
  const rawActivityIndex = rawContactTokens.findIndex((token) => (
    ESTONIAN_BUILDING_ACTIVITY_TOKEN_PATTERN.test(normalize(token))
  ));
  const rawLocationIndex = rawContactTokens.findLastIndex((token, index) => (
    index < rawActivityIndex
      && ESTONIAN_PROTECTED_BUILDING_LOCATION_TOKEN_PATTERN.test(normalize(token))
  ));
  const rawConstructionObjectTokens = rawActivityIndex > rawLocationIndex
    ? rawContactTokens.slice(rawLocationIndex + 1, rawActivityIndex)
    : [];
  if (/["“„«'‘”»’]/u.test(rawResidual)
    || rawConstructionObjectTokens.some((token) => /\p{Lu}/u.test(token))) return false;
  const normalizedResidual = normalize(withoutPublicOrganization);
  const publicContactSource = String.raw`(?:(?:avalik|ametlik|uldine)\s+)?(?:kontakt|uldkontakt|telefon|uldtelefon|e\s+post|postiaadress)`;
  const reviewedEstonianContact = new RegExp(
    String.raw`^${publicContactSource}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+(?:${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+)?${ESTONIAN_BUILDING_ACTIVITY_SOURCE}(?:\s+(?:loa|nousoleku|kooskolastuse))?\s+kohta$`,
    "u",
  ).test(normalizedResidual) || new RegExp(
    String.raw`^${publicContactSource}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+(?:${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+)?${ESTONIAN_BUILDING_ACTIVITY_SOURCE}(?:\s+(?:loa|nousoleku|kooskolastuse))?$`,
    "u",
  ).test(normalizedResidual) || new RegExp(
    String.raw`^kuidas\s+(?:votta\s+uhendust|kontakteeruda)\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}$`,
    "u",
  ).test(normalizedResidual);
  if (removedReviewedPublicOrganization && reviewedEstonianContact) return true;

  const estonianNamedNationalPark = String.raw`${ESTONIAN_REVIEWED_NATIONAL_PARK_NAME_SOURCE}\s+rahvuspargi`;
  const estonianBuildingActivityNoun = String.raw`(?:ehitamise|rajamise|renoveerimise|rekonstrueerimise)`;
  const explicitEstonianContact = String.raw`(?:(?:avalik|ametlik|uldine)\s+)(?:kontakt|uldkontakt|telefon|uldtelefon|e\s+post)`;
  if ([
    new RegExp(
      String.raw`^${estonianNamedNationalPark}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${estonianBuildingActivityNoun}\s+${explicitEstonianContact}$`,
      "u",
    ),
    new RegExp(
      String.raw`^kust\s+(?:leida|leian)\s+${explicitEstonianContact}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}$`,
      "u",
    ),
  ].some((pattern) => pattern.test(normalizedResidual))) return true;

  // English organization-contact questions use a different word order from
  // the established Estonian service form. Keep this exception full-query
  // anchored and limited to reviewed protected-place names, a generic
  // building object and a construction activity. Appended people, properties
  // or contact fields therefore cannot be consumed by the public grammar.
  const englishProtectedPlace = String.raw`(?:lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse)\s+(?:national|nature)\s+park`;
  const englishBuildingActivity = String.raw`(?:renovat(?:e|ing)\s+(?:a|the)\s+(?:building|house|structure)|renovation\s+(?:of\s+)?(?:a|the)\s+(?:building|house|structure)|reconstruct(?:ing)?\s+(?:a|the)\s+(?:building|house|structure)|reconstruction\s+(?:of\s+)?(?:a|the)\s+(?:building|house|structure)|construct(?:ing)?\s+(?:a|the)\s+(?:building|house|structure)|construction\s+of\s+(?:a|the)\s+(?:building|house|structure))`;
  const englishBuildingActivityNoun = String.raw`(?:(?:building|house|structure)\s+)?(?:renovation|reconstruction|construction)`;
  const englishContactPrompt = String.raw`how\s+(?:do|can|should)\s+i\s+(?:contact|reach)(?:\s+the)?\s+(?:about|regarding|concerning|for)`;
  const englishContactChannel = String.raw`(?:(?:official|public|general)\s+)?(?:contact|email|phone|telephone)`;
  const explicitEnglishContactChannel = String.raw`(?:official|public|general)\s+(?:contact|email|phone|telephone)`;
  const reviewedOrganizationEnglishPatterns = [
    new RegExp(
      String.raw`^${englishProtectedPlace}\s+${englishContactPrompt}\s+${englishBuildingActivity}$`,
      "u",
    ),
    new RegExp(
      String.raw`^${englishContactPrompt}\s+${englishBuildingActivity}\s+(?:in|at|within)\s+(?:the\s+)?${englishProtectedPlace}$`,
      "u",
    ),
    new RegExp(
      String.raw`^(?:what\s+is\s+(?:the\s+)?)?${englishContactChannel}\s+(?:for|about|regarding|concerning)\s+(?:${englishBuildingActivity}|${englishBuildingActivityNoun})\s+(?:in|at|within)\s+(?:the\s+)?${englishProtectedPlace}$`,
      "u",
    ),
    new RegExp(
      String.raw`^${englishContactChannel}\s+(?:for|about|regarding|concerning)\s+(?:${englishBuildingActivity}|${englishBuildingActivityNoun})\s+(?:in|at|within)\s+(?:the\s+)?${englishProtectedPlace}$`,
      "u",
    ),
  ];
  if (removedReviewedPublicOrganization
    && reviewedOrganizationEnglishPatterns.some((pattern) => pattern.test(normalizedResidual))) return true;
  return [
    new RegExp(
      String.raw`^${englishProtectedPlace}\s+${englishBuildingActivityNoun}\s+${englishContactChannel}$`,
      "u",
    ),
    new RegExp(
      String.raw`^${explicitEnglishContactChannel}\s+(?:for|about|regarding|concerning)\s+${englishBuildingActivityNoun}\s+(?:in|at|within)\s+(?:the\s+)?${englishProtectedPlace}$`,
      "u",
    ),
  ].some((pattern) => pattern.test(normalizedResidual));
}
const REVIEWED_MUNICIPALITY_INSTITUTIONAL_CONTACT_PATTERNS = Object.freeze([
  /^(?:(?:city|municipal|local)\s+government\s+of\s+[\p{L}'’-]{2,50}|municipality\s+of\s+[\p{L}'’-]{2,50}|[\p{L}'’-]{2,50}\s+(?:(?:city|municipal|local)\s+government|municipality))\s+(?:(?:environment(?:al)?|forest(?:ry)?|nature|climate|water|waste|biodiversity|green\s+infrastructure)\s+)?(?:office|department|service|unit)\s+(?:general\s+)?(?:contact|phone|telephone|email|mailbox)\??$/iu,
  /^[\p{L}'’-]{2,50}\s+(?:city|municipal)\s+(?:(?:environment(?:al)?|forest(?:ry)?|nature(?:\s+(?:protection|conservation))?|climate|water|waste|biodiversity|green\s+infrastructure)(?:\s+(?:monitoring|adaptation|planning|policy|information|statistics|data))?\s+)?(?:office|department|service|unit)\s+(?:(?:general|public|official)\s+)?(?:contact|phone|telephone|email|mailbox|address)\??$/iu,
]);

const BENIGN_REGULATORY_CONTEXT_NAME_SOURCE = String.raw`(?:\p{Lu}[\p{Ll}'’-]{1,39}\s+\p{Lu}[\p{Ll}'’-]{1,39}|\p{Lu}[\p{Lu}'’-]{1,39}\s+\p{Lu}[\p{Lu}'’-]{1,39}|\p{Lu}\.\s*(?:\p{Lu}[\p{Ll}'’-]{1,39}|\p{Lu}[\p{Lu}'’-]{1,39}))`;
const BENIGN_REGULATORY_ATTRIBUTION_SOURCE = String.raw`(?:küsib|küsis|palub|palus|annab|andis|kirjutas|koostas|avaldas|tutvustas|toimetas|selgitas|esitas|jagas|kommenteeris|kirjeldas)\s+(?:(?:üldist|avaliku|üldise)\s+)?(?:nõu|juhendi|selgituse|ülevaate|artikli|küsimuse)`;
const BENIGN_NAMED_REGULATORY_CONTEXT_PATTERNS = Object.freeze([
  new RegExp(String.raw`^${BENIGN_REGULATORY_CONTEXT_NAME_SOURCE}\s+${BENIGN_REGULATORY_ATTRIBUTION_SOURCE}$`, "u"),
  new RegExp(String.raw`^(?:uuringu\s+autor|projekti\s+tutvustas|küsimuse\s+esitas)\s+${BENIGN_REGULATORY_CONTEXT_NAME_SOURCE}$`, "u"),
]);

function isBenignNaturalPersonAttributionClause(value) {
  const clause = String(value || "").trim();
  if (!BENIGN_NAMED_REGULATORY_CONTEXT_PATTERNS.some((pattern) => pattern.test(clause))) {
    return false;
  }
  // The same title-case shape can name a public organization (for example
  // “Eesti Energia” or “Environment Board”). Such an organization is part of
  // the user's information need and must not be treated as disposable person
  // attribution.
  return normalize(removeFirstPublicOrganizationName(clause)) === normalize(clause);
}

function isReviewedBenignProtectedAreaAdviceTail(value) {
  const tail = String(value || "").trim();
  if (!tail || /["“„«'‘”»’]/u.test(tail)) return false;
  const hasRawIdentitySignal = [...tail.matchAll(/\p{Lu}[\p{Ll}'’-]{1,39}/gu)]
    .some((match) => {
      const token = normalize(match[0]);
      const protectedPlacePrefix = normalize(tail.slice(0, match.index));
      const beginsReviewedQuestion = match.index === 0
        && /^(?:kas|kelle|palun)$/u.test(token);
      const beginsProtectedPlacePhrase = /^(?:lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse|natura)$/u.test(token)
        && /^(?:kas)?$/u.test(protectedPlacePrefix);
      return !(
        beginsReviewedQuestion
        || beginsProtectedPlacePhrase
        || PUBLIC_ORGANIZATION_PATTERN.test(match[0])
      );
    });
  if (hasRawIdentitySignal) return false;
  return isReviewedGenericProtectedAreaConsentQuery(tail)
    || new RegExp(
      String.raw`^${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+kohta$`,
      "u",
    ).test(normalize(tail));
}

export function reviewedMunicipalityInstitutionalContactScope(value) {
  const text = canonicalSecurityText(value).trim();
  if (!REVIEWED_MUNICIPALITY_INSTITUTIONAL_CONTACT_PATTERNS.some(
    (pattern) => pattern.test(text),
  )) return null;
  // Contact wording can use the natural English form “Narva municipal …”
  // without spelling out “city government”. The forestry scope resolver is
  // the reviewed bare-locality catalogue and preserves city/vald ambiguity.
  return reviewedEstonianForestryMunicipalityScope(text);
}

