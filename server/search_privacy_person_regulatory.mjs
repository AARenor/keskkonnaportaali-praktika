import { normalize } from "./search_query_terms.mjs";
import {
  ESTONIAN_BUILDING_ACTIVITY_IN_TEXT_PATTERN,
  ESTONIAN_BUILDING_ACTIVITY_TOKEN_PATTERN,
  ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_PATTERNS,
  ESTONIAN_PROTECTED_BUILDING_LOCATION_IN_TEXT_PATTERN,
  ESTONIAN_PROTECTED_BUILDING_LOCATION_TOKEN_PATTERN,
  ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_PATTERN,
  ESTONIAN_REGULATORY_BUILDING_EXACT_TOKEN_PATTERN,
  ESTONIAN_REGULATORY_CONSENT_IN_TEXT_PATTERN,
} from "./search_privacy_protected_area.mjs";
import {
  PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS,
  removeFirstPublicOrganizationName,
} from "./search_privacy_patterns.mjs";
import {
  isEcologicalCommonNamePair,
  isSuspiciousIdentityFragment,
  isTitleCasedIdentityToken,
} from "./search_privacy_identity.mjs";
import {
  BENIGN_NAMED_REGULATORY_CONTEXT_PATTERNS,
  BENIGN_REGULATORY_ATTRIBUTION_SOURCE,
  BENIGN_REGULATORY_CONTEXT_NAME_SOURCE,
  isReviewedBenignProtectedAreaAdviceTail,
  isReviewedGenericProtectedAreaConsentQuery,
} from "./search_privacy_public_exceptions.mjs";

export function assessPrivacyPersonRegulatoryRules(
  text,
  textWithoutKnownOrganizations,
  hasKnownPublicOrganization,
  hasInstitutionalContactChannel,
  residualContactNameMatches,
  residualContactNameTokens,
) {
  const normalizedRegulatoryText = normalize(text);
  const hasProtectedAreaConstructionLocation = ESTONIAN_PROTECTED_BUILDING_LOCATION_IN_TEXT_PATTERN
    .test(normalizedRegulatoryText);
  const hasProtectedAreaConstructionSignals = hasProtectedAreaConstructionLocation
    && ESTONIAN_BUILDING_ACTIVITY_IN_TEXT_PATTERN.test(normalizedRegulatoryText);
  // A broader stem check is fail-closed only: any unreviewed construction
  // inflection in an official-contact query is blocked below unless the
  // complete strict public helper accepts it.
  const hasProtectedAreaOrganizationConstructionContactContext = hasKnownPublicOrganization
    && hasInstitutionalContactChannel
    && hasProtectedAreaConstructionLocation
    && /(?:^|\s)(?:ehit|raja|planeeri|pustit|renoveeri|rekonstrueeri)[a-z-]{0,30}(?=\s|$)/u
      .test(normalizedRegulatoryText);
  const hasProtectedAreaRegulatoryConstructionContext = (
    hasProtectedAreaConstructionSignals
      && ESTONIAN_REGULATORY_CONSENT_IN_TEXT_PATTERN.test(normalizedRegulatoryText)
  ) || hasProtectedAreaOrganizationConstructionContactContext;
  const regulatoryTokenIsActivity = (token) => ESTONIAN_BUILDING_ACTIVITY_TOKEN_PATTERN
    .test(normalize(token));
  const regulatoryTokenIsReviewedPublicSyntax = (token) => {
    const normalizedToken = normalize(token);
    return ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_PATTERN.test(normalizedToken)
      || ESTONIAN_REGULATORY_BUILDING_EXACT_TOKEN_PATTERN.test(normalizedToken)
      || ESTONIAN_PROTECTED_BUILDING_LOCATION_TOKEN_PATTERN.test(normalizedToken)
      || ESTONIAN_BUILDING_ACTIVITY_TOKEN_PATTERN.test(normalizedToken)
      || /^(?:ja|ning|kas|kelle|luba|loa|nousolek|nousoleku|nousolekut|kooskolastus|kooskolastuse|kooskolastust|on|vaja|vajalik|noutav|voib|tohib|saab|palun|oelge|selgitage)$/u.test(normalizedToken);
  };
  const regulatoryDescriptorHasRawIdentitySignal = (token, index) => {
    if (!ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_PATTERN.test(normalize(token))) return false;
    const match = residualContactNameMatches[index];
    if (!match || !Number.isSafeInteger(match.index)) return true;
    const leading = textWithoutKnownOrganizations.slice(0, match.index);
    const trailing = textWithoutKnownOrganizations.slice(match.index + match[0].length);
    const explicitlyQuoted = /["“„«'‘]\s*$/u.test(leading)
      && /^\s*["”»'’]/u.test(trailing);
    const beginsSentence = !leading.trim() || /[.!?]\s*$/u.test(leading);
    // Keep sentence-initial capitalization available for ordinary prose, but
    // never let a quoted or mid-sentence title-cased surname collision become
    // indistinguishable from a lower-case building descriptor.
    return explicitlyQuoted || !beginsSentence;
  };
  // A period after a single capital initial belongs to the name, not to the
  // sentence boundary ("J. Tamm küsib nõu. ..."). Acronym-final periods such
  // as "RMK." still split because there is no word boundary before the K.
  const regulatoryClauseBoundaryPattern = /(?<!\b\p{Lu})\.+|[!?;]+|\s[-—–]\s/gu;
  const regulatoryClauseBoundaries = [...textWithoutKnownOrganizations
    .matchAll(regulatoryClauseBoundaryPattern)];
  const regulatoryClauseTokensAt = (index) => {
    const focus = residualContactNameMatches[index];
    if (!focus || !Number.isSafeInteger(focus.index)) return [];
    const leadingBoundary = regulatoryClauseBoundaries
      .findLast((boundary) => boundary.index < focus.index);
    const trailingBoundary = regulatoryClauseBoundaries
      .find((boundary) => boundary.index > focus.index);
    const clauseStart = leadingBoundary
      ? leadingBoundary.index + leadingBoundary[0].length
      : 0;
    const clauseEnd = trailingBoundary?.index ?? textWithoutKnownOrganizations.length;
    return residualContactNameMatches.flatMap((match, originalIndex) => (
      match.index >= clauseStart && match.index < clauseEnd
        ? [{ originalIndex, token: match[0] }]
        : []
    ));
  };
  const regulatoryIdentitySharesConstructionClause = (index, identityWidth) => {
    const clauseTokens = regulatoryClauseTokensAt(index);
    const localIndex = clauseTokens.findIndex((item) => item.originalIndex === index);
    if (localIndex < 0) return false;
    const activityAfterObject = clauseTokens
      .slice(localIndex + identityWidth + 1)
      .some((item) => regulatoryTokenIsActivity(item.token));
    const activityBeforeObject = clauseTokens
      .slice(0, localIndex)
      .some((item) => regulatoryTokenIsActivity(item.token))
      && Boolean(clauseTokens[localIndex + identityWidth]);
    return activityAfterObject || activityBeforeObject;
  };
  const hasAttachedCapitalizedRegulatoryName = residualContactNameTokens
    .some((first, index, tokens) => {
      const second = tokens[index + 1] || "";
      return isTitleCasedIdentityToken(first)
        && isTitleCasedIdentityToken(second)
        && !regulatoryTokenIsReviewedPublicSyntax(first)
        && !regulatoryTokenIsReviewedPublicSyntax(second)
        && regulatoryIdentitySharesConstructionClause(index, 2);
    });
  const hasAttachedSingleCapitalizedPossessor = residualContactNameTokens
    .some((token, index, tokens) => (
      isTitleCasedIdentityToken(token)
      && (
        !regulatoryTokenIsReviewedPublicSyntax(token)
        || regulatoryDescriptorHasRawIdentitySignal(token, index)
      )
      && !ESTONIAN_PROTECTED_BUILDING_LOCATION_TOKEN_PATTERN.test(normalize(tokens[index + 1] || ""))
      && regulatoryIdentitySharesConstructionClause(index, 1)
    ));
  const hasAttachedLowercaseRegulatoryName = residualContactNameTokens
    .some((first, index, tokens) => {
      const second = tokens[index + 1] || "";
      const normalizedFirst = normalize(first);
      const normalizedSecond = normalize(second);
      return isSuspiciousIdentityFragment(normalizedFirst)
        && isSuspiciousIdentityFragment(normalizedSecond)
        && !isEcologicalCommonNamePair(normalizedFirst, normalizedSecond)
        && !regulatoryTokenIsReviewedPublicSyntax(first)
        && !regulatoryTokenIsReviewedPublicSyntax(second)
        && regulatoryIdentitySharesConstructionClause(index, 2);
    });
  const hasAttachedPrivateConstructionPossessor = ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_PATTERNS
    .some((pattern) => pattern.test(normalizedRegulatoryText));
  const regulatoryTokenIsPrivateConstructionPossessor = (token, index, tokens) => {
    const normalizedToken = normalize(token);
    if (/^(?:minu|meie|oma|tema|nende|naabri|sobra|sopra|perekonna|pereliikme|vanaema|vanaisa|vanavanema|vanatadi|tadi|onu|ema|isa|oe|venna|abikaasa|elukaaslase|lapse|tutre|poja|sugulase|kolleegi)$/u.test(normalizedToken)) {
      return true;
    }
    return normalizedToken === "selle"
      && tokens.slice(index + 1, index + 4).some((candidate) => normalize(candidate) === "inimese");
  };
  const hasBoundedPrivateConstructionPossessor = residualContactNameTokens
    .some((token, index, tokens) => (
      regulatoryTokenIsPrivateConstructionPossessor(token, index, tokens)
      && regulatoryIdentitySharesConstructionClause(index, 1)
    ));
  const regulatoryClauseTexts = text
    .split(regulatoryClauseBoundaryPattern)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const benignRegulatoryContextNameSource = BENIGN_REGULATORY_CONTEXT_NAME_SOURCE;
  // These exact attribution verbs and publication nouns describe the named
  // speaker or author, not a private building owner. The exception remains
  // complete-query anchored below and the regulatory tail must independently
  // pass the reviewed public grammar before the name can be released.
  const benignRegulatoryAttributionSource = BENIGN_REGULATORY_ATTRIBUTION_SOURCE;
  const benignNamedRegulatoryContextPatterns = BENIGN_NAMED_REGULATORY_CONTEXT_PATTERNS;
  const isReviewedBenignRegulatoryAttribution = (clause) => {
    if (benignNamedRegulatoryContextPatterns.some((pattern) => pattern.test(clause))) return true;
    const withoutPublicOrganization = removeFirstPublicOrganizationName(clause).trim();
    return normalize(withoutPublicOrganization) !== normalize(clause)
      && new RegExp(String.raw`^${benignRegulatoryAttributionSource}$`, "u")
        .test(withoutPublicOrganization);
  };
  const reviewedBenignNamedRegulatoryContext = regulatoryClauseTexts.length === 2
    && regulatoryClauseTexts.some((clause) => isReviewedGenericProtectedAreaConsentQuery(clause))
    && regulatoryClauseTexts.some(isReviewedBenignRegulatoryAttribution);
  const benignAdviceText = text.trim();
  const benignAdviceTailSource = String.raw`(?:\s*[:,]\s*|\s+)([\s\S]+?)[.!?]?$`;
  const benignNamedAdviceMatch = benignAdviceText.match(new RegExp(
    String.raw`^${benignRegulatoryContextNameSource}\s+${benignRegulatoryAttributionSource}(?:\s*[:,]\s*|\s+)([\s\S]+?)[.!?]?$`,
    "u",
  ));
  const startsWithExactPublicOrganization = PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    const match = pattern.exec(benignAdviceText);
    pattern.lastIndex = 0;
    return match?.index === 0;
  });
  const withoutLeadingPublicOrganization = startsWithExactPublicOrganization
    ? removeFirstPublicOrganizationName(benignAdviceText).trim()
    : "";
  const benignPublicOrganizationAdviceMatch = startsWithExactPublicOrganization
    ? withoutLeadingPublicOrganization.match(new RegExp(
      String.raw`^${benignRegulatoryAttributionSource}${benignAdviceTailSource}`,
      "u",
    ))
    : null;
  const benignAdviceMatch = benignNamedAdviceMatch || benignPublicOrganizationAdviceMatch;
  const benignNamedAdviceTail = benignAdviceMatch?.[1] || "";
  const reviewedBenignNamedProtectedAreaAdvice = Boolean(benignAdviceMatch)
    && isReviewedBenignProtectedAreaAdviceTail(benignNamedAdviceTail);
  const hasProtectedAreaPrivateConstructionAssociation = hasProtectedAreaRegulatoryConstructionContext
    && (
      hasAttachedCapitalizedRegulatoryName
      || hasAttachedSingleCapitalizedPossessor
      || hasAttachedLowercaseRegulatoryName
      || hasAttachedPrivateConstructionPossessor
      || hasBoundedPrivateConstructionPossessor
    );
  return {
    hasProtectedAreaOrganizationConstructionContactContext,
    hasProtectedAreaPrivateConstructionAssociation,
    hasProtectedAreaRegulatoryConstructionContext,
    reviewedBenignNamedProtectedAreaAdvice,
    reviewedBenignNamedRegulatoryContext,
  };
}
