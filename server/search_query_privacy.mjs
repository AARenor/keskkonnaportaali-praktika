import { classifyForestryGeographyScope, hasLossyUnicodeForestryAreaResidual } from "./municipalities.mjs";
import { resolvePublicForestryIntent } from "./forestry-public.mjs";
import {
  canonicalSecurityText,
  canonicalizePublicSearchQuery,
  decodeSecurityEscapes,
  MAX_PUBLIC_SEARCH_QUERY_LENGTH,
} from "./search_query_canonicalization.mjs";
import { containsUnsafeInstruction } from "./search_query_safety.mjs";
import {
  hasForeignPrivatePersonClause,
  hasUnsupportedPublicProviderResidual,
  isCompleteReviewedPublicOrganizationContactQuestion,
  isReviewedPublicClauseComposition,
  isReviewedPublicOrganizationContactClause,
  OWN_FOREST_FIRST_PERSON_OPENING_PATTERN,
  splitPublicQueryClauses,
} from "./search_privacy_clauses.mjs";
import {
  hasAssetResidentIdentityFieldRequest,
  hasCountyShapedPersonAssetAssociation,
  hasPrivateAssetIdentityFieldRequest,
  hasReviewedCountyDescriptorCompoundPersonAsset,
  hasReviewedCountyPrivateAssetEcologySensitiveResidual,
  isCompleteReviewedCountyForestAgeQuestion,
  isCompleteReviewedCountyForestCategoryQuestion,
  isCompleteReviewedCountyPrivateAssetAggregateQuestion,
  isCompleteReviewedCountyPrivateAssetEcologyQuestion,
  isCompleteReviewedCountyPublicForestQuestion,
  isCompleteReviewedCountyPublicForestQuestionOrContactComposition,
  IMPERATIVE_PRIVATE_OWNER_ENUMERATION_PATTERN,
  reviewedCountyForestPrefixScope,
  reviewedForestMetricOfCountyCandidate,
  REVIEWED_COUNTY_FOREST_REQUEST_TARGET_PATTERN,
  stripNegatedPrivateContactFields,
  stripReviewedCountyPublicRequestPrefix,
} from "./search_privacy_county.mjs";
import {
  hasLossyUnicodeProtectedConstructionResidual,
  hasReviewedForestTopicPersonResidual,
  IMPERATIVE_NAMED_OWNER_LOOKUP_PATTERN,
} from "./search_privacy_protected_area.mjs";
import {
  isCompleteReviewedNationalForestryFactQuestion,
  PRIVACY_CHECK,
} from "./search_privacy_public_forest.mjs";
import { AMBIGUOUS_BARE_COUNTY_PRIVATE_ASSET_PATTERN } from "./search_privacy_patterns.mjs";
import {
  BENIGN_REGULATORY_ATTRIBUTION_SOURCE,
  BENIGN_REGULATORY_CONTEXT_NAME_SOURCE,
  isBenignNaturalPersonAttributionClause,
  isReviewedBenignProtectedAreaAdviceTail,
  isReviewedPublicOrganizationProtectedBuildingContactQuery,
} from "./search_privacy_public_exceptions.mjs";
import { classifyPrivacyDomainRules } from "./search_privacy_domain_rules.mjs";
import { assessReviewedQuestionRules } from "./search_privacy_reviewed_rules.mjs";
import { classifyPrivacyContactRules } from "./search_privacy_contact_rules.mjs";
import { classifyPrivacyPersonRules } from "./search_privacy_person_rules.mjs";

export function containsPrivatePersonLookup(value, {
  allowReviewedPublicClauseComposition = true,
  allowReviewedCountyRequestPrefix = true,
} = {}) {
  if (hasForeignPrivatePersonClause(decodeSecurityEscapes(value))) return true;
  const canonicalText = canonicalSecurityText(value);
  // "Tahaks teada et meie pere metsas" is a first-person forest statement.
  // Classify the same text without that opening, so any name or contact field
  // in it still fails.
  // "Eelmine omanik" is a role in a buyer's own question, not an identity.
  // "Mis kellast see töötab" is about opening hours, not where someone works.
  // "Kas ma tohin oma metsas ..." is a forest owner asking about their own
  // land: the pronoun and modal verb otherwise read as a lowercase two-token
  // name ("ma tohin") beside a private asset. Drop only that first-person
  // opening and classify the rest again. The opening is dropped only when the
  // text has no digit and no capital letter after the first character, so
  // "kas ma tohin oma metsas Mari Tammele ..." stays private.
  const ownForestOpeningAllowed = !/\d/u.test(canonicalText)
    && !/\p{Lu}/u.test(canonicalText.slice(1));
  const familyForest = canonicalText
    .replace(/^(?:tahaks(?:in)?|soovi(?:n|ksin))\s+teada,?\s+et\s+(?=meie\s+(?:pere\s+)?mets)/iu, "")
    .replace(/^meie\s+pere(?=\s+mets)/iu, "meie")
    // "mis kellast see töötab" asks a service's opening hours; "see" is no person.
    .replace(/\bsee\s+t[oö][oö]tab\b/iu, "on avatud")
    .replace(/^(ostsin\s+(?:metsa|kinnistu|metsakinnistu|maa|talu)\b.*?)\beelmine\s+omanik\s+/iu, "$1")
    .replace(ownForestOpeningAllowed ? OWN_FOREST_FIRST_PERSON_OPENING_PATTERN : /(?!)/u, "$1");
  // A forest term with "mis see tähendab", and the size of RMK's holding, name
  // no person. Both grammars are closed, so an added name misses them.
  if (/^\p{L}*(?:mets|raie)\p{L}*(?:\s+\p{L}+mine)?\s+(?:mis|mida)\s+see\s+t[aä]hendab[?.!]?$/iu.test(canonicalText)
    || /^(?:kui\s+)?palju\s+\p{L}*mets\p{L}*\s+on\s+rmk\s+valduses(?:\s+(?:19|20)\d{2})?[?.!]?$/iu.test(canonicalText)) return false;
  if (familyForest !== canonicalText) {
    return containsPrivatePersonLookup(familyForest, { allowReviewedPublicClauseComposition, allowReviewedCountyRequestPrefix });
  }
  // Unsupported-language residence and ownership clauses must fail before a
  // public environmental prefix can admit the complete text. This guard is
  // intentionally ahead of every reviewed public exception and is shared by
  // all provider-facing minimization paths below.
  if (hasForeignPrivatePersonClause(canonicalText)) return true;
  // A public nature superlative or general home-safety advice is not a
  // private-person lookup. Keep the exception narrow: no address, contact
  // field, numeric identifier or named-owner wording in the original text.
  const publicEnvironmentalQuestion = /\b(?:korg|kõrg|vanim|suurim|pikim|vanem)\w*\s+(?:puu|mand|mänd|kuusk|kask|tamm|vaher|pihlakas|kadakas)\b/iu.test(canonicalText)
    || (/\b(?:kuidas|mida)\b/iu.test(canonicalText)
      && /\b(?:kodu|kodus|korteris|elamus)\b/iu.test(canonicalText)
      && /\b(?:radoon\w*|hallitus\w*|niiskus\w*|mura\w*|müra\w*|asbest\w*|pli\b|vesi\b|energia\w*|kute\w*|küte\w*)\b/iu.test(canonicalText));
  if (publicEnvironmentalQuestion
    && !/\b(?:aadress|tanav|tänav|tn\b|maja\s*nr|kinnistu\s*nr|isikukood|telefon|e-?post|email|omanik)\b/iu.test(canonicalText)
    && !/\d{3,}/u.test(canonicalText)) return false;
  // Reviewed protected-construction grammars are Latin/Estonian. Never grant
  // their public exception after normalization has erased an unconsumed
  // letter or number from another script; the intact query would otherwise
  // cross suggestion, discovery and model-provider boundaries.
  if (hasLossyUnicodeProtectedConstructionResidual(canonicalText)) return true;
  if (IMPERATIVE_PRIVATE_OWNER_ENUMERATION_PATTERN.test(canonicalText)) return true;
  if (IMPERATIVE_NAMED_OWNER_LOOKUP_PATTERN.test(canonicalText)) return true;
  // These complete national fact questions contain ownership/management or
  // “vanuses puistus” wording that resembles a person/asset relation after
  // normalization. Their closed grammar has no slot for a name or property;
  // any appended identity therefore misses the exception and remains private.
  if (isCompleteReviewedNationalForestryFactQuestion(canonicalText)) return false;
  if (hasReviewedForestTopicPersonResidual(canonicalText)) return true;
  // A request phrase is presentation, not query substance. Strip at most one
  // complete finite request prefix and run the entire privacy classifier again
  // on what remains. This admits “Tell me the Harju county forest area” while
  // names before, inside or after the county question still receive every
  // private-person check. Disabling a second strip keeps repeated prefix-shaped
  // tokens from forming an exemption chain.
  if (allowReviewedCountyRequestPrefix) {
    const requestResidual = stripReviewedCountyPublicRequestPrefix(canonicalText);
    if (requestResidual !== null
      && REVIEWED_COUNTY_FOREST_REQUEST_TARGET_PATTERN.test(requestResidual)) {
      if (!requestResidual) return false;
      return containsPrivatePersonLookup(requestResidual, {
        allowReviewedPublicClauseComposition,
        allowReviewedCountyRequestPrefix: false,
      });
    }
  }
  // A reviewed geography can be followed by an open-class asset role (for
  // example a tenant, operator or responsible party). Treat an explicit
  // private asset plus a requested identity/contact field structurally instead
  // of trying to enumerate every possible role noun. This guard must run
  // before aggregate and county-name exceptions at every provider boundary.
  // Evaluate asset-resident identity requests against the intact query. A
  // later county disambiguation step may remove a hyphenated geography token,
  // but it must never erase the resident/name, national-ID or birth-data risk.
  if (hasAssetResidentIdentityFieldRequest(canonicalText)) return true;
  const forestMetricOfCountyCandidate = reviewedForestMetricOfCountyCandidate(canonicalText);
  if (forestMetricOfCountyCandidate) {
    if (isCompleteReviewedCountyPublicForestQuestion(forestMetricOfCountyCandidate)) return false;
    // Reordering proves only the finite county/forest core. If the reordered
    // candidate is not fully consumed by the reviewed time, year and unit
    // slots, its suffix is unreviewed identity/prose material. Fail closed
    // regardless of token count so parser bounds can never become a bypass.
    return true;
  }
  // A complete reviewed county query can have either a bounded public request
  // prefix or a natural-person prefix. Resolve that exact tri-state before
  // generic title/name heuristics: otherwise “Find Harjumaa ...” is later
  // mistaken for a two-token name, while “Jaan Kask Harjumaa ...” must still
  // fail before every provider boundary.
  const countyForestPrefixScope = reviewedCountyForestPrefixScope(canonicalText);
  if (countyForestPrefixScope === "person") return true;
  if (countyForestPrefixScope === "public-contact") return false;
  if (countyForestPrefixScope === "public-request") {
    return !allowReviewedCountyRequestPrefix;
  }
  if (hasReviewedCountyDescriptorCompoundPersonAsset(canonicalText)) return true;
  // A reviewed county-shaped token sequence beside one or more person-shaped
  // tokens and an asset is ambiguous with a multi-part natural-person name.
  // Deny the intact punctuation/casing variants before county cleanup; only a
  // fully consumed reviewed public modifier may disambiguate the extra token.
  if (hasCountyShapedPersonAssetAssociation(canonicalText)) return true;
  // Bare Ida/Lääne Viru spellings are also plausible two-token person names.
  // Deny their private-asset form explicitly and case-insensitively instead of
  // relying on later person-shape heuristics; only an unambiguous hyphenated,
  // Virumaa, maakond or county spelling can enter a regional exception.
  if (AMBIGUOUS_BARE_COUNTY_PRIVATE_ASSET_PATTERN.test(canonicalText)) return true;
  if (hasPrivateAssetIdentityFieldRequest(canonicalText)) return true;
  // Explicitly negated contact fields are not requested identity data. Carry
  // the stripped residual through every downstream detector; any other name,
  // role, contact, cadastral or personal field remains intact and fail-closed.
  const text = stripNegatedPrivateContactFields(canonicalText)
    .replace(/\s+/gu, " ")
    .replace(/\s+([.?!,;:])/gu, "$1")
    .trim();
  // Once a complete county/private-asset ecology prefix has been consumed,
  // an arbitrary suffix cannot inherit that public meaning. Only an empty
  // residual, an explicitly negated contact field, or one complete reviewed
  // agency-contact clause is admissible; every other suffix fails closed.
  if (hasReviewedCountyPrivateAssetEcologySensitiveResidual(canonicalText)) return true;
  // Both clauses are independently complete, finite public grammars: one
  // reviewed county forest aggregate and one reviewed agency contact. Resolve
  // this composition before generic name-shape recursion can reinterpret the
  // county genitive as a person; any appended identity makes the full helper
  // fail and remains private below.
  if (isCompleteReviewedCountyPublicForestQuestionOrContactComposition(text)) return false;
  // Complete organization-contact questions carry no natural-person
  // residual. Resolve this bounded form before public-clause composition so
  // an environmental clause can safely be paired with a reviewed agency
  // contact without making the private-asset classifier absorb that field.
  if (isCompleteReviewedPublicOrganizationContactQuestion(text)) return false;
  // A complete environmental-impact question about a private asset in an
  // exact reviewed county asks about ecology, not the asset holder. An
  // optional second clause is accepted only when it is itself one complete,
  // reviewed public-organization contact question.
  if (isCompleteReviewedCountyPrivateAssetEcologyQuestion(text)) return false;
  // A fully consumed reviewed-county forest-age question is an environmental
  // aggregate, not a request about a resident. Keep this exception anchored so
  // an appended name, contact, ownership or cadastral field cannot inherit it.
  if (isCompleteReviewedCountyForestAgeQuestion(text)) return false;
  // Likewise, exact age-class, ecological-condition and composition phrases
  // are public only when the reviewed county and category consume the query.
  if (isCompleteReviewedCountyForestCategoryQuestion(text)) return false;
  // Aggregate publication wording has the same reviewed-county identity
  // shape as a person name after punctuation tokenization. Admit only the
  // fully consumed, field-free English forms after negated contacts have been
  // removed above.
  if (isCompleteReviewedCountyPrivateAssetAggregateQuestion(text)) return false;
  // Do not fuse two independently public environmental/contact clauses into
  // a person-shaped contact request. The lightweight composition grammar is
  // only a candidate allowlist: every clause must also clear the complete
  // privacy classifier in isolation before the composition may return public.
  // Disable only this shortcut in the recursive calls so a private clause can
  // never borrow a public organization's contact grammar.
  const reviewedCountyContactCompositionClauses = splitPublicQueryClauses(text);
  const reviewedCountyContactComposition = reviewedCountyContactCompositionClauses.length === 2
    && reviewedCountyContactCompositionClauses
      .filter((clause) => (
        isReviewedPublicOrganizationContactClause(clause)
          || isCompleteReviewedPublicOrganizationContactQuestion(clause)
      )).length === 1
    && reviewedCountyContactCompositionClauses.filter((clause) => (
      classifyForestryGeographyScope(clause, PRIVACY_CHECK).kind === "estonian-region"
        && resolvePublicForestryIntent(clause, PRIVACY_CHECK)?.kind === "regional-forest-area"
    )).length === 1;
  if (allowReviewedPublicClauseComposition && reviewedCountyContactComposition) {
    return reviewedCountyContactCompositionClauses.some((clause) => (
      containsPrivatePersonLookup(clause, {
        allowReviewedPublicClauseComposition: false,
      })
    ));
  }
  if (allowReviewedPublicClauseComposition && isReviewedPublicClauseComposition(text)) {
    return splitPublicQueryClauses(text).some((clause) => (
      containsPrivatePersonLookup(clause, {
        allowReviewedPublicClauseComposition: false,
      })
    ));
  }
  const domainState = classifyPrivacyDomainRules(text);
  if (typeof domainState === "boolean") return domainState;
  const reviewedState = assessReviewedQuestionRules(text, domainState);
  if (reviewedState.decision !== null) return reviewedState.decision;
  const contactState = classifyPrivacyContactRules(text, reviewedState);
  if (contactState.decision !== null) return contactState.decision;
  return classifyPrivacyPersonRules(text, contactState, reviewedState);
}
// A named speaker can be part of a reviewed public regulatory question while
// still being unnecessary for retrieval or model generation. Remove only the
// complete, anchored attribution forms accepted above; the environmental tail
// must independently remain public before it can cross an upstream boundary.
export function minimizePublicProviderQuery(value, {
  maximumLength = MAX_PUBLIC_SEARCH_QUERY_LENGTH,
} = {}) {
  const canonicalInput = canonicalizePublicSearchQuery(value, { maximumLength });
  if (!canonicalInput.ok) return "";
  const originalQuery = canonicalInput.query;
  if (containsUnsafeInstruction(originalQuery)
    || containsPrivatePersonLookup(originalQuery)
    || hasLossyUnicodeForestryAreaResidual(originalQuery)) return "";

  let candidate = "";
  const clauses = splitPublicQueryClauses(originalQuery);
  if (clauses.length === 2) {
    const attributionIndex = clauses.findIndex(isBenignNaturalPersonAttributionClause);
    const tailIndex = attributionIndex < 0 ? -1 : 1 - attributionIndex;
    if (tailIndex >= 0 && isReviewedBenignProtectedAreaAdviceTail(clauses[tailIndex])) {
      candidate = clauses[tailIndex];
    }
  }

  if (!candidate) {
    const inline = originalQuery.match(new RegExp(
      String.raw`^(${BENIGN_REGULATORY_CONTEXT_NAME_SOURCE}\s+${BENIGN_REGULATORY_ATTRIBUTION_SOURCE})(?:\s*[:,]\s*|\s+)([\s\S]+?)[.!?]?$`,
      "u",
    ));
    if (inline?.[2]
      && isBenignNaturalPersonAttributionClause(inline[1])
      && isReviewedBenignProtectedAreaAdviceTail(inline[2])) {
      candidate = inline[2].trim();
    }
  }

  if (!candidate) {
    if (isReviewedPublicOrganizationProtectedBuildingContactQuery(originalQuery)) return originalQuery;
    return hasUnsupportedPublicProviderResidual(originalQuery) ? "" : originalQuery;
  }
  const minimizedInput = canonicalizePublicSearchQuery(candidate, { maximumLength });
  if (!minimizedInput.ok
    || containsUnsafeInstruction(minimizedInput.query)
    || containsPrivatePersonLookup(minimizedInput.query)
    || hasUnsupportedPublicProviderResidual(minimizedInput.query)) return "";
  return minimizedInput.query;
}

export function preparePublicProviderQuery(value, options = {}) {
  const query = minimizePublicProviderQuery(value, options);
  return query
    ? { accepted: true, query, reason: null }
    : { accepted: false, query: "", reason: "blocked-or-unconsumed" };
}
