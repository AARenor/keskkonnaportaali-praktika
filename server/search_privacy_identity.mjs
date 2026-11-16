import {
  ADMIN_CONTEXT_ROOTS,
  DOMAIN_ROOTS,
  PERSON_CONTEXT_STOPWORD_PATTERN,
  normalize,
  queryRootVariants,
  textHasQueryRoot,
  topicRoot,
} from "./search_query_terms.mjs";
import {
  ENGLISH_LOCATE_PERSON_PATTERN,
  ENGLISH_WHERE_FOUND_PATTERN,
  ENGLISH_WHERE_LOCATED_PATTERN,
  ENGLISH_WHERE_RESIDENCE_PATTERN,
  ECOLOGICAL_MODIFIER_PATTERN,
  ECOLOGICAL_SUBJECT_PATTERN,
  PRIVATE_CONTACT_FIELD_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN,
  PUBLIC_CONTACT_ROLE_PATTERN,
  PUBLIC_ORGANIZATION_PATTERN,
} from "./search_privacy_patterns.mjs";

export function hasAdministrativeQueryRoot(word) {
  return [...ADMIN_CONTEXT_ROOTS].some((root) => textHasQueryRoot(word, root));
}

export function hasPrivacyDomainQueryRoot(word) {
  const normalizedWord = normalize(word);
  if (DOMAIN_ROOTS.has(topicRoot(normalizedWord))) return true;
  return [...DOMAIN_ROOTS].some((root) => queryRootVariants(root).some((variant) => {
    const normalizedVariant = normalize(variant);
    return normalizedWord === normalizedVariant
      || (normalizedVariant.length >= 4 && normalizedWord.startsWith(normalizedVariant));
  }));
}

export function isSuspiciousIdentityFragment(word) {
  return !PRIVATE_CONTACT_FIELD_PATTERN.test(word)
    && !PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN.test(word)
    && !PERSON_CONTEXT_STOPWORD_PATTERN.test(word)
    && !PUBLIC_ORGANIZATION_PATTERN.test(word)
    && !PUBLIC_CONTACT_ROLE_PATTERN.test(word)
    && !/^\d+$/u.test(word)
    && !hasAdministrativeQueryRoot(word)
    && !hasPrivacyDomainQueryRoot(word)
    && !ECOLOGICAL_SUBJECT_PATTERN.test(word)
    && !ECOLOGICAL_MODIFIER_PATTERN.test(word);
}

export function isEcologicalCommonNamePair(first, second) {
  return ECOLOGICAL_SUBJECT_PATTERN.test(second)
    && (ECOLOGICAL_MODIFIER_PATTERN.test(first)
      || ECOLOGICAL_SUBJECT_PATTERN.test(first));
}
export function analyzeEnglishResidenceSignals(text) {
  const englishWhereResidenceMatch = text.match(ENGLISH_WHERE_RESIDENCE_PATTERN);
  const englishWhereFoundMatch = text.match(ENGLISH_WHERE_FOUND_PATTERN);
  const englishWhereLocatedMatch = text.match(ENGLISH_WHERE_LOCATED_PATTERN);
  const englishLocatePersonMatch = text.match(ENGLISH_LOCATE_PERSON_PATTERN);
  const englishSubjectIsEcological = (subject) => {
    const subjectWords = subject?.match(/[\p{L}]+/gu) || [];
    const meaningfulWords = subjectWords.filter((word) => !PERSON_CONTEXT_STOPWORD_PATTERN.test(word));
    const explicitlyEcological = subjectWords.length > 0 && subjectWords.every((word) => (
      ECOLOGICAL_SUBJECT_PATTERN.test(word)
      || ECOLOGICAL_MODIFIER_PATTERN.test(word)
      || PERSON_CONTEXT_STOPWORD_PATTERN.test(word)
    ));
    const ecologicalCommonName = meaningfulWords.length >= 2
      && (ECOLOGICAL_SUBJECT_PATTERN.test(meaningfulWords[0])
        || ECOLOGICAL_MODIFIER_PATTERN.test(meaningfulWords[0]))
      && meaningfulWords.slice(1).every((word) => word === word.toLocaleLowerCase("en"));
    return explicitlyEcological || ecologicalCommonName;
  };
  const englishWhereResidenceIsEcological = Boolean(englishWhereResidenceMatch)
    && englishSubjectIsEcological(englishWhereResidenceMatch[1]);
  const englishWhereFoundIsEcological = Boolean(englishWhereFoundMatch)
    && englishSubjectIsEcological(englishWhereFoundMatch[1]);

  return {
    englishNamedResidenceQuestion: Boolean(englishWhereResidenceMatch)
      && !englishWhereResidenceIsEcological,
    englishNamedFoundQuestion: Boolean(englishWhereFoundMatch)
      && !englishSubjectIsEcological(englishWhereFoundMatch[1]),
    englishNamedLocatedQuestion: Boolean(englishWhereLocatedMatch)
      && !englishSubjectIsEcological(englishWhereLocatedMatch[1]),
    englishLocateNamedPerson: Boolean(englishLocatePersonMatch)
      && !englishSubjectIsEcological(englishLocatePersonMatch[1]),
    englishWhereResidenceIsEcological,
    englishWhereFoundIsEcological,
  };
}

export function isTitleCasedIdentityToken(token) {
  return /^\p{Lu}[\p{Ll}'’-]{1,39}$/u.test(token)
    && !PERSON_CONTEXT_STOPWORD_PATTERN.test(token);
}
