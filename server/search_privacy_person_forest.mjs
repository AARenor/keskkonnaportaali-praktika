import {
  ADMIN_CONTEXT_ROOTS,
  DOMAIN_ROOTS,
  PERSON_CONTEXT_STOPWORD_PATTERN,
  normalize,
} from "./search_query_terms.mjs";
import {
  ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE,
  ECOLOGICAL_MODIFIER_PATTERN,
  ECOLOGICAL_SUBJECT_PATTERN,
  PRIVATE_CONTACT_FIELD_PATTERN,
  PUBLIC_CONTACT_ROLE_PATTERN,
  PUBLIC_ORGANIZATION_PATTERN,
} from "./search_privacy_patterns.mjs";
import {
  CADASTRE_PATTERN,
  ENGLISH_PRIVATE_FOREST_QUALIFIER_PATTERN,
  ESTONIAN_BELONGING_PARTICIPLE_PATTERN,
  ESTONIAN_BELONGS_VERB_PATTERN,
  ESTONIAN_PRIVATE_OWNERSHIP_PATTERN,
  EXPLICIT_PRIVATE_FOREST_ASSET_PATTERN,
  FOLLOWING_FOREST_PERSON_LOOKUP_ACTION_PATTERN,
  PRIVATE_ASSET_LOOKUP_ACTION_PATTERN,
  PRIVATE_FOREST_ASSET_PATTERN,
  PUBLIC_FOREST_RELATION_TOKEN_PATTERN,
} from "./search_privacy_protected_area.mjs";
import { isEcologicalCommonNamePair, isSuspiciousIdentityFragment } from "./search_privacy_identity.mjs";
export function classifyPrivacyPersonForestRules(text, identityText, hasNamedIdentity) {
  const hasPrivateAssetReference = CADASTRE_PATTERN.test(text)
    || /\b(?:katastri(?:üksus|uksus|tunnus|number|andmed)\w*|(?:naaber|naabri)?kinnist\w*|maa(?:u|ü)ksus\w*|puurkaev\w*|aadress\w*)\b/iu.test(text);
  const hasPersonOrOwnerPredicate = ESTONIAN_PRIVATE_OWNERSHIP_PATTERN.test(text)
    || /\b(?:kontakt\w*|elanike?\s+nime\w*|(?:isiku|inimese|omaniku)\s+nimi\w*|kes\s+(?:kasutab|elab))\b/iu.test(text)
    || /\b(?:kellele|kelle)\b[\s\S]{0,80}\b(?:kuulu\w*|omandis|omanduses|valduses)\b/iu.test(text);
  const privateScopeWords = identityText.match(/[\p{L}\p{N}]+/gu) || [];
  const forestAssetIndex = privateScopeWords.findIndex((word) => PRIVATE_FOREST_ASSET_PATTERN.test(word));
  const isPotentialForestIdentityToken = (word) => {
    const normalizedWord = normalize(word);
    return !PRIVATE_CONTACT_FIELD_PATTERN.test(word)
      && !PERSON_CONTEXT_STOPWORD_PATTERN.test(word)
      && !PUBLIC_ORGANIZATION_PATTERN.test(word)
      && !PUBLIC_CONTACT_ROLE_PATTERN.test(word)
      && !PUBLIC_FOREST_RELATION_TOKEN_PATTERN.test(word)
      && !/^\d+$/u.test(word)
      && !ADMIN_CONTEXT_ROOTS.has(normalizedWord)
      && !(DOMAIN_ROOTS.has(normalizedWord) && !ECOLOGICAL_SUBJECT_PATTERN.test(word));
  };
  const precedingForestIdentityFirst = privateScopeWords[forestAssetIndex - 2] || "";
  const precedingForestIdentitySecond = privateScopeWords[forestAssetIndex - 1] || "";
  const hasDirectNamedForestRelation = forestAssetIndex >= 2
    && isPotentialForestIdentityToken(precedingForestIdentityFirst)
    && isPotentialForestIdentityToken(precedingForestIdentitySecond)
    && !isEcologicalCommonNamePair(precedingForestIdentityFirst, precedingForestIdentitySecond);
  const forestAssetWord = privateScopeWords[forestAssetIndex] || "";
  const followingForestWord = privateScopeWords[forestAssetIndex + 1] || "";
  const followingForestIdentityIndex = forestAssetIndex + (
    /^(?:forests?|woodlands?)$/iu.test(forestAssetWord)
      && ENGLISH_PRIVATE_FOREST_QUALIFIER_PATTERN.test(followingForestWord)
      ? 2
      : 1
  );
  const reviewedFollowingForestTopicPairs = [
    [/^(?:fire|wildfire)$/iu, /^(?:danger|risk|index|forecast)$/iu],
    [/^carbon$/iu, /^(?:storage|stock|sink|sequestration)$/iu],
    [/^age$/iu, /^(?:distribution|structure|classes|profile)$/iu],
    [/^coverage$/iu, /^(?:percentage|statistics|map|trend)$/iu],
    [/^health$/iu, /^(?:status|indicators|condition|assessment)$/iu],
    [/^management$/iu, /^(?:guidance|practices|policy|plans|methods|authority|rules)$/iu],
  ];
  const isReviewedFollowingForestTopicPair = (first, second) => (
    reviewedFollowingForestTopicPairs.some(([firstPattern, secondPattern]) => (
      firstPattern.test(first) && secondPattern.test(second)
    ))
  );
  const followingForestIdentityTokens = privateScopeWords.slice(followingForestIdentityIndex);
  const hasFollowingNamedForestRelation = forestAssetIndex >= 0
    && followingForestIdentityTokens.some((first, index) => {
      const second = followingForestIdentityTokens[index + 1] || "";
      const firstLooksLikeIdentity = isSuspiciousIdentityFragment(first)
        || ECOLOGICAL_SUBJECT_PATTERN.test(first)
        || ECOLOGICAL_MODIFIER_PATTERN.test(first);
      const secondLooksLikeIdentity = isSuspiciousIdentityFragment(second)
        || ECOLOGICAL_SUBJECT_PATTERN.test(second)
        || ECOLOGICAL_MODIFIER_PATTERN.test(second);
      return Boolean(second)
        && firstLooksLikeIdentity
        && secondLooksLikeIdentity
        && !isEcologicalCommonNamePair(first, second)
        && !isReviewedFollowingForestTopicPair(first, second);
    });
  const followingForestHasReviewedTopicPrefix = Boolean(followingForestIdentityTokens[0])
    && (/^(?:area|cover|coverage|age|carbon|fire|wildfire|health|management|habitat|water|species|restoration|ownership)$/iu
      .test(followingForestIdentityTokens[0])
      || followingForestIdentityTokens.some((first, index) => (
        isReviewedFollowingForestTopicPair(first, followingForestIdentityTokens[index + 1] || "")
      )));
  const hasFollowingStructuredCapitalizedName = new RegExp(
    String.raw`(?<!\p{L})(?:forest|woodland)(?!\p{L})[\s\S]{0,160}(?<!\p{L})${ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE}[.!?]*$`,
    "u",
  ).test(text);
  // This association is already a bounded forest target plus a structurally
  // person-shaped residual. Resolve it before aggregate/environmental
  // allowlists so a safe topic prefix cannot override the private suffix.
  const hasFollowingForestLookupAction = FOLLOWING_FOREST_PERSON_LOOKUP_ACTION_PATTERN.test(text);
  if ((hasFollowingNamedForestRelation && hasFollowingForestLookupAction)
    || (hasFollowingStructuredCapitalizedName
      && (hasFollowingForestLookupAction || followingForestHasReviewedTopicPrefix))) {
    return { earlyPrivateForestLookup: true };
  }
  const hasExplicitPrivateForestAsset = EXPLICIT_PRIVATE_FOREST_ASSET_PATTERN.test(forestAssetWord)
    || (/^(?:forests?|woodlands?)$/iu.test(forestAssetWord)
      && ENGLISH_PRIVATE_FOREST_QUALIFIER_PATTERN.test(followingForestWord));
  const hasDativeForestPossession = privateScopeWords.some((word, copulaIndex) => {
    let identityEndIndex = -1;
    if (/^(?:on|oli|oleks|pole)$/iu.test(word)) {
      identityEndIndex = copulaIndex - 1;
    } else if (/^ole$/iu.test(word) && /^ei$/iu.test(privateScopeWords[copulaIndex - 1] || "")) {
      identityEndIndex = copulaIndex - 2;
    }
    if (identityEndIndex < 1
      || !hasExplicitPrivateForestAsset
      || forestAssetIndex <= copulaIndex
      || forestAssetIndex - copulaIndex > 3) return false;
    const identityFirst = privateScopeWords[identityEndIndex - 1] || "";
    const identitySecond = privateScopeWords[identityEndIndex] || "";
    return /(?:le|l)$/iu.test(identitySecond)
      && isPotentialForestIdentityToken(identityFirst)
      && isPotentialForestIdentityToken(identitySecond)
      && !isEcologicalCommonNamePair(identityFirst, identitySecond);
  });
  // A direct identity attached to a concrete private forest subdivision is
  // sufficient regardless of the request verb. Generic forest references
  // still require an explicit lookup/ownership relation so environmental
  // questions such as "how much forest" cannot synthesize a person.
  const hasNamedForestAssetLookup = hasDirectNamedForestRelation
    && (hasExplicitPrivateForestAsset
      || PRIVATE_ASSET_LOOKUP_ACTION_PATTERN.test(text)
      || ESTONIAN_PRIVATE_OWNERSHIP_PATTERN.test(text)
      || /(?:'s|’s)\s+(?:forest|woodland)\b/iu.test(text));
  const belongingParticipleIndex = privateScopeWords.findIndex((word) => (
    ESTONIAN_BELONGING_PARTICIPLE_PATTERN.test(word)
  ));
  const belongsVerbIndex = privateScopeWords.findIndex((word) => ESTONIAN_BELONGS_VERB_PATTERN.test(word));
  const forestBeforeBelongsVerb = belongsVerbIndex > forestAssetIndex
    && forestAssetIndex >= 0
    && belongsVerbIndex - forestAssetIndex <= 6;
  const dativePersonBeforeBelongsVerb = belongsVerbIndex >= 2
    && forestAssetIndex > belongsVerbIndex
    && forestAssetIndex - belongsVerbIndex <= 4
    && /(?:le|l)$/iu.test(privateScopeWords[belongsVerbIndex - 1]);
  const belongingParticipleNearForest = belongingParticipleIndex >= 0
    && forestAssetIndex >= 0
    && Math.abs(belongingParticipleIndex - forestAssetIndex) <= 4;
  const hasNamedForestOwnership = forestAssetIndex >= 0
    && hasNamedIdentity
    && (ESTONIAN_PRIVATE_OWNERSHIP_PATTERN.test(text)
      || forestBeforeBelongsVerb
      || dativePersonBeforeBelongsVerb
      || hasDativeForestPossession
      || belongingParticipleNearForest);
  return {
    earlyPrivateForestLookup: false,
    hasNamedForestAssetLookup,
    hasNamedForestOwnership,
    hasPersonOrOwnerPredicate,
    hasPrivateAssetReference,
  };
}

