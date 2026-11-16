import {
  classifyForestryGeographyScope,
  isReviewedEstonianMunicipalityIdentity,
  isReviewedNationalDefaultForestryAreaComplement,
  isReviewedNationalUnsupportedForestAreaBreakdownQuestion,
  requestsUnsupportedForestAreaBreakdown,
  requestsUnsupportedForestAreaTimeSeries,
  requestsUnsupportedForestAreaUnit,
  reviewedEstonianMunicipalityScope,
} from "./municipalities.mjs";
import { resolvePublicForestryIntent } from "./forestry-public.mjs";
import {
  CADASTRE_PATTERN,
  isPlainEcologicalResidenceDescriptionQuestion,
} from "./search_privacy_protected_area.mjs";
import {
  ENGLISH_PRIVATE_ASSET_SOURCE,
  firstPublicOrganizationNameMatch,
  NAMED_PERSON_CADASTRAL_FIELD_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_PATTERN,
} from "./search_privacy_patterns.mjs";
import {
  hasEarlyBoundedNamedPrivateAssetAssociation,
  hasEarlyNamedPersonSensitiveAssociation,
} from "./search_privacy_asset_association.mjs";
import {
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
  isGenericPublicEnvironmentalInstitutionContactQuery,
  PRIVACY_CHECK,
} from "./search_privacy_public_forest.mjs";
import {
  isReviewedPublicOrganizationProtectedBuildingContactQuery,
  reviewedMunicipalityInstitutionalContactScope,
} from "./search_privacy_public_exceptions.mjs";
import { isReviewedPublicOrganizationProtectedPlaceContactQuery } from "./search_privacy_clauses.mjs";
function isCompletePublicOrganizationPrivateAssetRoleStatement(value) {
  const text = String(value || "").trim();
  const organization = firstPublicOrganizationNameMatch(text);
  if (!organization || organization.index !== 0) return false;
  const residual = text.slice(organization.text.length)
    .replace(/\s+/gu, " ")
    .replace(/[.?!,;:]+$/gu, "")
    .trim();
  const estonianOrganizationRole = /^(?:(?:meeskond|osakond|amet|asutus|agentuur|üksus|uksus|teenistus|büroo|buroo)\p{L}*\s+)?(?:halda|majanda|käita|kaita|korralda|juhi|opereeri)\p{L}*\s+(?:(?:era|perekonna|isiklik)[\s\p{Pd}]*)?(?:mets|puurkaev|kinnist|maa)\p{L}*\s+(?:keskkonna)?mõju\p{L}*\s+(?:elupaig|liik|elurikk|põhjave|veekog)\p{L}*$/iu;
  return /^(?:(?:a|the)\s+)?private\s+(?:well|borehole)\s+(?:permit|licen[cs]e)\s+holder$|^(?:manages?|administers?|operates?|oversees?)\s+(?:(?:a|the)\s+)?private\s+(?:forest|woodland)\s+(?:habitat|ecosystem|biodiversity)$/iu.test(residual)
    || estonianOrganizationRole.test(residual);
}

export function classifyPrivacyDomainRules(text) {
  // A canonical cadastral identifier is a public object key by itself, but a
  // query that explicitly binds it to a structured natural-person name is a
  // private association. Enforce this invariant before any public aggregate
  // shortcut can return early.
  if (CADASTRE_PATTERN.test(text)
    && (NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(text)
      || hasNamedPersonCadastralAssociation(text))) return true;
  if (hasPersonPrefixedReviewedMunicipalityAssetAssociation(text)) return true;
  // A reviewed municipality found only inside a larger asset-holder candidate
  // is not a public organization identity. Resolve this before every public
  // aggregate/contact exception so later routing cannot reinterpret the
  // residual natural-person name as a municipality question.
  if (hasPartialReviewedMunicipalityAssetAssociation(text)) return true;
  if (isCompletePublicEcologicalPossessiveForestQuestion(text)) return false;
  // A reviewed geography or municipality token cannot make a larger
  // person-shaped possessive public (for example "John Canada" or
  // "Alice Narva"). Exact complete public possessors remain allowed below.
  if (hasPartialReviewedGeographyPossessiveForestAggregate(text)) return true;
  // Generic organization suffixes are lexical hints, not reviewed identity
  // proof: Board, Service, Trust, Council and Team are also real surnames.
  // Deny an unreviewed complete possessor before any broader organization or
  // environmental exception can reinterpret the name and reach a provider.
  if (hasUnreviewedPossessiveForestAggregateQuestion(text)) return true;
  // This helper consumes the complete query and validates its possessor as a
  // reviewed geography, programme or public organization. Resolve it before
  // the conservative one-token possessive guard; any appended private clause
  // fails the full anchor and is still handled by that guard below.
  if (isCompletePublicPossessiveForestAggregateQuestion(text)) return false;
  // This construction-contact grammar consumes the whole query, removes only
  // a bounded reviewed organization name, and rejects every private or lossy
  // residual. Resolve it before generic title-case/private-asset heuristics can
  // mistake an agency or reviewed national-park name for a natural person.
  if (isReviewedPublicOrganizationProtectedBuildingContactQuery(text)) return false;
  // Admit only a complete organization-plus-role statement. Removing the
  // organization must leave exactly the environmental role, so appended
  // names, contact fields and private lookup clauses remain outside the rule.
  if (isCompletePublicOrganizationPrivateAssetRoleStatement(text)) return false;
  // Public aggregate and method questions can otherwise absorb a trailing
  // person/property phrase. Give bounded named-person asset and ownership
  // relations first refusal before any complete-query public exception.
  if (hasEarlyBoundedNamedPrivateAssetAssociation(text)) return true;
  if (isReviewedNationalUnsupportedForestAreaBreakdownQuestion(text)) return false;
  // Complete ecological descriptions and public institution/entity relations
  // have no residual clause in which a natural person can hide. Resolve these
  // bounded public forms before the any-case name grammar; all three helpers
  // are full-query or end-bound and reject an appended second identity.
  if (isPlainEcologicalResidenceDescriptionQuestion(text)
    || isGenericPublicEnvironmentalInstitutionContactQuery(text)
    || isCompletePublicEcologicalAgencyRoleQuestion(text)
    || isCompletePublicForestConceptQuestion(text)
    || isCompletePublicNationalForestAreaQuestion(text)
    || isCompletePublicPossessiveForestAggregateQuestion(text)
    || isCompletePublicForestOwnershipAggregate(text)
    || isReviewedNationalDefaultForestryAreaComplement(text)
    || reviewedMunicipalityInstitutionalContactScope(text)
    || isReviewedPublicOrganizationProtectedPlaceContactQuery(text)
    || isCompleteReviewedPublicEntityAssetAssociation(text)) return false;
  // National/regional aggregate recognition runs before the full identity
  // classifier. A bounded person + residence field, or an explicit asset-role
  // relation to a named person, must therefore get first refusal here so an
  // otherwise public forestry prefix cannot release the appended clause.
  if (hasEarlyNamedPersonSensitiveAssociation(text)) return true;
  // Registry prose that directly binds a named natural person to the custody
  // of a concrete private asset is sensitive even when phrased as a statement
  // rather than a question. Match the relation before broad ecological/name
  // heuristics can mistake words such as "records describe" for context.
  if (new RegExp(
    String.raw`\b(?:environmental\s+records?\s+describe|registry\s+records?\s+describe|according\s+to\s+the\s+filing[,]?)\s+[\p{L}'’.-]{2,40}\s+[\p{L}'’.-]{2,40}\s+(?:(?:is\s+)?entrusted\s+with|as\s+(?:a\s+)?(?:caretaker|custodian|manager|operator|steward)\s+(?:for|of))\s+(?:an?\s+|the\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}\b`,
    "iu",
  ).test(text)) return true;
  // This exact public-navigation question previously looked like a two-token
  // person name beside the word “forest”. Keep the exemption narrow so it
  // cannot suppress ownership, contact, address or other identity checks.
  if (/^where can i (?:find|access) (?:public )?(?:forest|woodland) data(?: in estonia)?\??$/iu.test(text.trim())) {
    return false;
  }
  if (isReviewedNationalDefaultForestryAreaComplement(text)) return false;
  const forestryGeographyScope = classifyForestryGeographyScope(text, PRIVACY_CHECK);
  const reviewedUnsupportedNationalForestClaim = ["national-default", "national-estonia"]
    .includes(forestryGeographyScope.kind)
    && ["forest-area", "forest-covered-area", "forest-area-method"].includes(resolvePublicForestryIntent(text, PRIVACY_CHECK)?.kind)
    && (requestsUnsupportedForestAreaBreakdown(text)
      || requestsUnsupportedForestAreaTimeSeries(text)
      || requestsUnsupportedForestAreaUnit(text))
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    && !NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(text)
    && !/\b(?:contact|phone|telephone|email|mailbox|address|postal|person|name|live|living|reside|residing|stay|staying|inhabit\w*|where|kontakt\w*|telefon\w*|e-?post\w*|postkast\w*|aadress\w*|isik\w*|nimi|elab|resideeri\w*|viibib|elukoh\w*|who|whose|where|kelle\w*|kus)\b/iu.test(text);
  // These are complete public aggregate dimensions, but the current evidence
  // contract intentionally asks for clarification. Keep them out of the
  // private-person classifier without allowing any appended identity field.
  if (reviewedUnsupportedNationalForestClaim) return false;
  const reviewedRegionalForestAggregateQuestion = ["estonian-region", "foreign-or-other-region"]
    .includes(forestryGeographyScope.kind)
    && resolvePublicForestryIntent(text, PRIVACY_CHECK)?.kind === "regional-forest-area"
    // Geography routing must never exempt an appended natural-person field.
    // The normal privacy classifier below owns those clauses; this aggregate
    // shortcut is allowed only when neither an explicit personal attribute nor
    // a named cadastral field remains in the complete query.
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    && !NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(text)
    && !/\b(?:contact|phone|telephone|email|mailbox|address|postal|owner|person|name|private|live|living|reside|residing|stay|staying|inhabit\w*|where|kontakt\w*|telefon\w*|e-?post\w*|postkast\w*|aadress\w*|omanik\w*|isik\w*|nimi|elab|resideeri\w*|viibib|elukoh\w*|who|whose|where|kelle\w*|kus)\b/iu.test(text);
  // A reviewed county/region aggregate is public even when its genitive name
  // resembles a two-token person beside the word “metsamaa”. The exemption is
  // limited to the complete regional area intent and disappears as soon as a
  // personal contact, identity, ownership or private-asset field is appended.
  if (reviewedRegionalForestAggregateQuestion) return false;
  const reviewedMunicipalityForestAggregateQuestion = forestryGeographyScope.kind === "reviewed-municipality"
    && resolvePublicForestryIntent(text, PRIVACY_CHECK)?.kind === "municipality-forest-area"
    && !CADASTRE_PATTERN.test(text)
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    && !NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(text)
    && !/\b(?:contact|phone|telephone|email|mailbox|address|postal|owner|person|name|private|live|living|reside|residing|stay|staying|inhabit\w*|where|registered|recorded|assigned|attributed|linked|associated|transferred|conveyed|granted|acquired|inherited|vested|titled|kontakt\w*|telefon\w*|e-?post\w*|postkast\w*|aadress\w*|omanik\w*|isik\w*|nimi|elab|resideeri\w*|viibib|elukoh\w*|registreeri\w*|salvesta\w*|määra\w*|maara\w*|omista\w*|seosta\w*|anna\w*|loovuta\w*|päri\w*|pari\w*|who|whose|where|kelle\w*|kus)\b/iu.test(text);
  // Reviewed municipality-area questions are public aggregates, including
  // redundant but benign wording. The complete private-field guards above
  // keep appended person, contact, ownership and cadastral clauses private.
  if (reviewedMunicipalityForestAggregateQuestion) return false;
  const estonianMunicipalityManagementMatch = text.trim().match(
    /^kuidas\s+([\p{L}'’-]{2,50}(?:\s+[\p{L}'’-]{2,50}){0,2})\s+(linn|vald)\s+(?:haldab|hooldab|käitab|kaitab|majandab|opereerib)\s+(?:(?:era|perekonna)[-\s]*)?(?:kaevu|puurkaevu|metsa|metsamaad|kinnistut)\??$/iu,
  );
  const englishMunicipalityManagementMatch = text.trim().match(
    /^how\s+does\s+([\p{L}'’-]{2,50}(?:\s+[\p{L}'’-]{2,50}){0,2})\s+(city|municipality)\s+(?:manage|maintain|operate|steward)\s+(?:(?:a|the)\s+)?(?:private|family|household)\s+(?:well|borehole|forest|woodland|land|property|parcel)\??$/iu,
  );
  const reviewedMunicipalityManagementQuestion = Boolean(
    (estonianMunicipalityManagementMatch
      && isReviewedEstonianMunicipalityIdentity(
        `${estonianMunicipalityManagementMatch[1]} ${estonianMunicipalityManagementMatch[2]}`,
      ))
    || (englishMunicipalityManagementMatch
      && isReviewedEstonianMunicipalityIdentity(
        englishMunicipalityManagementMatch[2].toLocaleLowerCase("en") === "city"
          ? `${englishMunicipalityManagementMatch[1]} linn`
          : `${englishMunicipalityManagementMatch[1]} vald`,
      )),
  );
  const reviewedMunicipalityAggregateScope = reviewedEstonianMunicipalityScope(text);
  const reviewedMunicipalityEnvironmentalAggregateQuestion = Boolean(reviewedMunicipalityAggregateScope)
    && [
      /^how\s+much\s+(?:forest|woodland)\s+(?:is|lies)\s+in\s+(?:the\s+)?city\s+of\s+[\p{L}'’-]{2,50}\??$/iu,
      /^how\s+many\s+hectares\s+of\s+(?:forest|woodland)\s+are\s+in\s+(?:the\s+)?city\s+of\s+[\p{L}'’-]{2,50}\??$/iu,
      /^what\s+percentage\s+of\s+(?:the\s+)?city\s+of\s+[\p{L}'’-]{2,50}\s+is\s+(?:forest|woodland)\??$/iu,
      /^how\s+much\s+(?:forest|woodland)\s+is\s+(?:under|managed\s+by)\s+(?:the\s+)?(?:city|municipal|local)\s+government\s+of\s+[\p{L}'’-]{2,50}\??$/iu,
      /^how\s+much\s+(?:forest|woodland)\s+is\s+(?:under|managed\s+by)\s+[\p{L}'’-]{2,50}\s+(?:city|municipal|local)\s+government\??$/iu,
      /^how\s+much\s+(?:forest|woodland)\s+does\s+[\p{L}'’-]{2,50}\s+(?:city|municipal|local)\s+government\s+manage\??$/iu,
      /^how\s+much\s+(?:forest|woodland)\s+(?:is|lies)\s+in\s+(?:the\s+)?municipality\s+of\s+[\p{L}'’-]{2,50}\??$/iu,
      /^how\s+much\s+(?:forest|woodland)\s+(?:is|lies)\s+in\s+[\p{L}'’-]{2,50}\s+municipality\??$/iu,
      /^what\s+is\s+the\s+(?:forest|woodland)\s+(?:cover(?:age)?\s+(?:percentage|percent|share)|area)\s+of\s+[\p{L}'’-]{2,50}\s+municipality\??$/iu,
      /^what\s+(?:percentage|percent|share)\s+of\s+[\p{L}'’-]{2,50}\s+municipality\s+is\s+(?:forest|woodland)\??$/iu,
    ].some((pattern) => pattern.test(text.trim()));
  const explicitUnknownMunicipalityAggregateQuestion = forestryGeographyScope.kind === "unknown-locality"
    && resolvePublicForestryIntent(text, PRIVACY_CHECK)?.kind === "municipality-forest-area"
    && !CADASTRE_PATTERN.test(text)
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    && !NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(text)
    && !/\b(?:contact|phone|telephone|email|mailbox|address|postal|owner|person|name|private|live|living|reside|residing|stay|staying|inhabit\w*|where|kontakt\w*|telefon\w*|e-?post\w*|postkast\w*|aadress\w*|omanik\w*|isik\w*|nimi|elab|resideeri\w*|viibib|elukoh\w*|who|whose|where|kelle\w*|kus)\b/iu.test(text);
  if (reviewedMunicipalityEnvironmentalAggregateQuestion || explicitUnknownMunicipalityAggregateQuestion) return false;
  if (reviewedMunicipalityInstitutionalContactScope(text)) return false;
  // These complete-query forms discuss public publication practice, generic
  // role duties or institutional service contacts. They contain words such
  // as "person", "owner", "contact" and "coordinates", but request no
  // natural-person record. Complete anchoring prevents the exception from
  // absorbing an appended name, address, private asset or identity clause.
  const reviewedPublicForestManagerSubjectSource = String.raw`(?:who|(?:which|what)\s+(?:public\s+)?(?:agency|authority|body|institution|organi[sz]ation))`;
  const reviewedPublicForestManagerActionSource = String.raw`(?:manages?|maintains?|administers?|stewards?)`;
  const reviewedPublicForestManagerAssetSource = String.raw`(?:the\s+)?(?:public|state|national|municipal|county(?:[-\s]+owned)?)\s+(?:county\s+)?(?:forest|woodland)`;
  const reviewedPublicForestManagerCoreSource = String.raw`${reviewedPublicForestManagerSubjectSource}\s+${reviewedPublicForestManagerActionSource}\s+${reviewedPublicForestManagerAssetSource}`;
  const reviewedPublicForestManagerQuestion = new RegExp(
    String.raw`^${reviewedPublicForestManagerCoreSource}(?:\s+(?:land|property))?\??$`,
    "iu",
  ).test(text.trim());
  const reviewedPublicForestManagerHasResidual = !reviewedPublicForestManagerQuestion
    && [
      new RegExp(
        String.raw`^${reviewedPublicForestManagerCoreSource}\s+(?:land|property)(?:\s*[,;:]\s*|\s+)(?<residual>[\s\S]+)$`,
        "iu",
      ),
      new RegExp(
        String.raw`^${reviewedPublicForestManagerCoreSource}(?:\s*[,;:]\s*|\s+)(?<residual>[\s\S]+)$`,
        "iu",
      ),
    ].some((pattern) => {
      const match = text.trim().match(pattern);
      return Boolean(match?.groups?.residual?.replace(/[.?!]+$/gu, "").trim());
    });
  // This public-role exception is deliberately closed rather than prefix
  // based. Any remaining text can carry an unreviewed person association, so
  // it must fail before provider minimization, retrieval, context or the LLM.
  if (reviewedPublicForestManagerHasResidual) return true;
  return {
    decision: null,
    reviewedMunicipalityManagementQuestion,
    reviewedPublicForestManagerQuestion,
  };
}
