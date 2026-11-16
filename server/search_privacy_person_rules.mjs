import {
  ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE,
  ENGLISH_OWNER_ENUMERATION_ACTION_PATTERN,
  ENGLISH_PERSON_NAME_SOURCE,
  ENGLISH_PRIVATE_ASSET_SOURCE,
  ENGLISH_WHO_OWNER_ASSET_PATTERN,
  PERSONAL_LOOKUP_PATTERNS,
  PRIVATE_PERSON_ATTRIBUTE_PATTERN,
} from "./search_privacy_patterns.mjs";
import {
  CADASTRE_PATTERN,
  ESTONIAN_PRIVATE_FOREST_NOUN_PATTERN,
  isPlainEcologicalResidenceDescriptionQuestion,
  PRIVATE_ASSET_LOOKUP_ACTION_PATTERN,
} from "./search_privacy_protected_area.mjs";
import {
  isReviewedGenericProtectedAreaConsentQuery,
  isReviewedPublicOrganizationProtectedBuildingContactQuery,
} from "./search_privacy_public_exceptions.mjs";
import { classifyPrivacyPersonAssociations } from "./search_privacy_person_associations.mjs";
import { assessPrivacyPersonRegulatoryRules } from "./search_privacy_person_regulatory.mjs";
import { classifyPrivacyPersonForestRules } from "./search_privacy_person_forest.mjs";

export function classifyPrivacyPersonRules(text, contactState, reviewedState) {
  const {
    contactScope,
    englishLocateNamedPerson,
    englishNamedFoundQuestion,
    englishNamedLocatedQuestion,
    englishNamedResidenceQuestion,
    englishWhereResidenceIsEcological,
    englishWhereFoundIsEcological,
    hasAddressAndPresence,
    hasAdjacentSuspiciousPair,
    hasEstonianRegulatoryBuildingContext,
    hasExplicitCapitalizedPersonName,
    hasHumanMarker,
    hasInstitutionalContactChannel,
    hasKnownPublicOrganization,
    hasNamedIdentity,
    hasPrivateAssetIdentity,
    hasPrivatePostalField,
    hasResidenceContext,
    hasSensitiveContact,
    hasSensitivePersonalAttribute,
    identityText,
    matchesEnglishPersonalPattern,
    rawIdentityFragments,
    residualContactNameMatches,
    residualContactNameTokens,
    sensitiveIndex,
    textWithoutKnownOrganizations,
  } = contactState;
  const {
    reviewedComplianceQuestion,
    reviewedConceptualPublicQuestion,
    reviewedOpenRolePolicyQuestion,
  } = reviewedState;
  const forestIdentityRules = classifyPrivacyPersonForestRules(text, identityText, hasNamedIdentity);
  if (forestIdentityRules.earlyPrivateForestLookup) return true;
  const {
    hasNamedForestAssetLookup,
    hasNamedForestOwnership,
    hasPersonOrOwnerPredicate,
    hasPrivateAssetReference,
  } = forestIdentityRules;
  const englishStreetAddress = /\b\d{1,6}[a-z]?\s+[\p{L}\p{N}'’.-]{1,50}(?:\s+[\p{L}\p{N}'’.-]{1,50}){0,4}\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|way|boulevard|blvd|court|ct|place|pl)\b/iu.test(text);
  const englishPrivateAsset = new RegExp(String.raw`(?<!\p{L})${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`, "iu").test(text);
  const englishExplicitSensitiveScope = CADASTRE_PATTERN.test(text)
    || /\b(?:private|privately\s+held|nonpublic|non[-\s]+government|family|household|residential|secluded|isolated|neighbor(?:ing)?|neighbour(?:ing)?|adjacent|adjoining|this|that|specific)\b[\s\S]{0,55}\b(?:property|parcel|plot|lot|estate|land|unit|house|home|farm|farmstead|well|borehole|wetland|marsh|meadow|pond|building|dwelling|cottage|premises|site|installation|landholding|holding|forest|woodland|water[-\s]+use\s+(?:right|title|permit|licen[cs]e)|(?:property|water|land|woodland)\s+(?:right|title)|entitlement|registration)\b/iu.test(text)
    || /\b(?:parcel|property|land|well|borehole|woodland|forest)\s+(?:registry|register|records?)\b/iu.test(text);
  const englishSpecificForest = /\b(?:this|that|the\s+specific|a\s+specific)\s+(?:forest|woodland|property|parcel|plot|land|house|home|farm|well|borehole|building)\b/iu.test(text);
  const englishOwnershipIntent = /\b(?:who\s+(?:owns?|is\s+the\s+(?:registered\s+)?(?:owner|proprietor|landholder|landlord)\s+of)|whose\s+(?:property|parcel|plot|land|house|home|farm|well|borehole)|(?:property|parcel|plot|land|forest|home|house)\s+(?:owner|landowner|homeowner|proprietor|landholder|landlord)|(?:identify|find|name|contact|show)\b[\s\S]{0,60}\b(?:owner|landowner|homeowner|proprietor|landholder|landlord))\b/iu.test(text);
  const englishOwnerContactIntent = /\b(?:(?:contact|name|identity|address|phone|telephone|email)\b[\s\S]{0,50}\b(?:owner|resident|occupant|inhabitant|landowner|landholder|landlord|homeowner|proprietor)|(?:owner|resident|occupant|inhabitant|landowner|landholder|landlord|homeowner|proprietor)\b[\s\S]{0,50}\b(?:contact|name|identity|address|phone|telephone|email))\b/iu.test(text);
  const englishNamedPossessiveContactIntent = /(?<!\p{L})\p{Lu}[\p{Ll}'’-]{1,39}(?:'s|’s)\s+(?:number|phone|telephone|email|contact(?:\s+(?:details|information))?)(?!\p{L})/u.test(textWithoutKnownOrganizations);
  const englishResidenceIntent = /\bwho\s+(?:currently\s+)?(?:lives?|is\s+living|resides?|is\s+residing|stays?|occup(?:ies|ys)|inhabits?)\b/iu.test(text)
    || (/\bwhere\s+does\b[\s\S]{0,80}\b(?:live|reside|stay|inhabit)\b/iu.test(text) && hasNamedIdentity);
  const englishNamedAssetRelationship = hasNamedIdentity && (
    /\b(?:owns?|owned)\b[\s\S]{0,80}\b(?:property|parcel|plot|land|house|home|farm|well|borehole|forest|woodland)\b/iu.test(text)
    || /\b(?:property|parcel|plot|land|house|home|farm|well|borehole|forest|woodland)\b[\s\S]{0,50}\bof\b/iu.test(text)
    || /(?:'s|’s)\s+(?:property|parcel|plot|land|house|home|farm|well|borehole|forest|woodland)\b/iu.test(text)
  );
  const englishPublicAssetPattern = /(?<![\p{L}\p{Pd}-])(?:state(?:[-\s]+owned)?|public(?:ly[-\s]+owned|[-\s]+owned)?|national|municipal(?:ly[-\s]+owned)?|government(?:[-\s]+owned)?|city[-\s]+owned|county[-\s]+owned|federal)\s+(?:(?:forest|woodland|estate)\s+(?:land|property|parcel|estate)|forest|woodland|land|property|estate|parcel|plot|lot|farm|well|borehole|building|dwelling)s?\b/giu;
  const englishPublicAssetMatches = [...text.matchAll(englishPublicAssetPattern)];
  const englishPublicResidual = text.replace(englishPublicAssetPattern, " ");
  const englishRoleInterrogativeCount = (text.match(/\b(?:who|whom|whose|(?:which|what)\s+(?:(?:named|natural)\s+)*(?:person|individual|party|agency|organization))\b/giu) || []).length;
  const englishPublicAggregate = englishPublicAssetMatches.length > 0
    && !englishStreetAddress
    && !CADASTRE_PATTERN.test(text)
    && !englishSpecificForest
    && !/\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|forest|woodland)\b/iu.test(englishPublicResidual)
    && !/\b(?:neighbor(?:ing)?|neighbour(?:ing)?|adjacent|adjoining|surrounding|other|another|second|next|nearby|private)\s+(?:one|ones)\b/iu.test(englishPublicResidual)
    && englishRoleInterrogativeCount <= englishPublicAssetMatches.length;
  const englishExplicitPersonPrivateAssetLookup = !englishPublicAggregate
    && englishPrivateAsset
    && (
      /\b(?:which|what)\s+(?:(?:named|natural|private|specific)\s+)+(?:person|individual|human(?:\s+being)?|resident)\b/iu.test(textWithoutKnownOrganizations)
      || /\b(?:identify|name|reveal|show|tell(?:\s+me)?)\b[\s\S]{0,35}\b(?:person|individual|human(?:\s+being)?)\b/iu.test(textWithoutKnownOrganizations)
    );
  const englishAssetRoleRelationship = /\b(?:own\w*|ownership|belong\w*|answer\w*|manag\w*|managers?|administ\w*|operat\w*|run(?:s|ning)?|ran|keep\w*|tend\w*|service\w*|safeguard\w*|monitor\w*|supervis\w*|overse\w*|oversaw|oversight|control\w*|controllers?|hold(?:s|ing)?|held|holders?|possess\w*|possession|us(?:e|es|ed|ing)|users?|occup\w*|occupants?|leas\w*|leaseholders?|rent\w*|tenants?|tenancy|lessees?|renters?|maintain\w*|care(?:s|d|ing)?|caretakers?|steward\w*|trustees?|guardians?|principals?|permittees?|permits?|custody|custodians?|custodianship|guardianship|dominion|remit|authority|charged|charge|responsibilit(?:y|ies)|responsible|accountable|rights?|in\s+charge|beneficial\s+owners?|title\s+holders?|registered\s+part(?:y|ies)|authorized\s+users?|legal\s+users?|landholders?|landlords?|proprietors?|permit(?:[\s-]+)holders?|fiduciar\w*|keepers?|conservators?|wardens?|delegates?|beneficiar\w*|assignees?|agents?|representatives?|prox(?:y|ies)|licensees?|concessionaires?|superintendents?)\b/iu.test(text);
  const englishIdentityAssetSource = ENGLISH_PRIVATE_ASSET_SOURCE;
  const englishIdentityPromptSource = String.raw`(?:who|whom|whose|whoever|(?:which|what)\s+(?:(?:named|natural|legal|private|specific|household|family)\s+)*(?:person|individual|party|agency|organization|company|business|enterprise|human(?:\s+being)?|owners?|landowners?|homeowners?|landholders?|landlords?|proprietors?|managers?|administrators?|operators?|custodians?|caretakers?|stewards?|trustees?|guardians?|principals?|permittees?|possessors?|controllers?|occupants?|residents?|tenants?|leaseholders?|lessees?|renters?|fiduciar\w*|keepers?|conservators?|wardens?|delegates?|beneficiar\w*|assignees?|agents?|representatives?|prox(?:y|ies)|licensees?|concessionaires?|superintendents?)|(?:name|identify|reveal|show|find|tell\s+me)\s+(?:the\s+)?(?:person|individual|party|company|human(?:\s+being)?|whoever))`;
  const englishRoleVerbSource = String.raw`(?:own\w*|belong\w*|answer\w*|manag\w*|administ\w*|operat\w*|run(?:s|ning)?|ran|keep\w*|tend\w*|service\w*|safeguard\w*|monitor\w*|supervis\w*|overse\w*|oversaw|control\w*|hold(?:s|ing)?|held|possess\w*|us(?:e|es|ed|ing)|occup\w*|leas\w*|rent\w*|maintain\w*|steward\w*|trust\w*|guard\w*|govern\w*|direct\w*|delegat\w*|care(?:s|d|ing)?\s+for)`;
  const englishRoleNounSource = String.raw`(?:owners?|beneficial\s+owners?|landowners?|landholders?|landlords?|proprietors?|management|managers?|administration|administrators?|operation|operators?|supervision|supervisors?|oversight(?:\s+authority)?|custodians?|custodianship|caretakers?|stewards?|stewardship|trustees?|guardians?|guardianship|principals?|permittees?|permits?|permit(?:[\s-]+)holders?|possessors?|possession|dominion|remit|authority|title\s+holders?|rights?\s+holders?|registered\s+part(?:y|ies)|authorized\s+users?|legal\s+users?|responsible|accountable|charged|responsible\s+(?:persons?|part(?:y|ies))|(?:persons?|individuals?|part(?:y|ies))\s+(?:responsible|accountable|in\s+charge|with\s+custody)|controllers?|occupants?|residents?|tenants?|tenancy|leaseholders?|lessees?|renters?|in\s+charge|custody|responsibilit(?:y|ies)|rights?|fiduciar\w*|keepers?|conservators?|wardens?|delegates?|beneficiar\w*|assignees?|agents?|representatives?|prox(?:y|ies)|licensees?|concessionaires?|superintendents?)`;
  const englishOpenClassRoleIdentityLookup = !englishPublicAggregate && new RegExp(
    String.raw`\b(?:who|whom)\s+(?:is|are|was|were|would\s+be)\s+(?:(?:the|an?)\s+)?(?!(?:public|government|municipal|state|agency|authority|organization|institution)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,3}\p{L}[\p{L}'’-]{1,30}\s+(?:for|of|over)\s+(?:(?:the|this|that|an?)\s+)?${englishIdentityAssetSource}(?![\p{L}-]|\s+(?:permits?|guidance|policy|rules?|data|biodiversity|monitoring|research|information|requirements?)\b)`,
    "iu",
  ).test(textWithoutKnownOrganizations);
  const englishExplicitNaturalPersonSensitiveScopeLookup = !englishPublicAggregate
    && englishExplicitSensitiveScope
    && /\b(?:natural\s+person|(?:which|what)\s+(?:(?:named|natural|legal|private|specific)\s+)*(?:person|individual|human(?:\s+being)?|resident))\b/iu.test(textWithoutKnownOrganizations);
  const englishOpenClassAppointmentLookup = !englishPublicAggregate
    && englishExplicitSensitiveScope
    && [
      /\bwho\s+(?:(?:has|had)\s+been|was|is)\s+(?:appointed|assigned|designated|named)\b[\s\S]{0,70}\b(?:for|of|over|to)\b/iu,
      /\b(?:name|identify|reveal|show|find|tell\s+me)\s+(?:the\s+)?(?:\p{L}[\p{L}'’-]{1,30}\s+){0,3}\p{L}[\p{L}'’-]{1,30}\s+(?:assigned|appointed|designated|named)\s+(?:to|for|over)\b/iu,
    ].some((pattern) => pattern.test(textWithoutKnownOrganizations));
  const englishOpenClassIdentityReference = /\b(?:who|whom|whose|whoever|someone|who\s+was\s+it|(?:name|identify|reveal|show|find|tell\s+me)\s+(?:the\s+)?(?:person|individual|party|holder|whoever|someone)|(?:disclose|reveal|show|give)\s+(?:(?:the|their|his|her)\s+)?(?:identity|name))\b/iu.test(textWithoutKnownOrganizations);
  const englishOpenClassRoleAssignmentRelationship = [
    /\b(?:appointment|assignment|designation|nomination)\b/iu,
    /\b(?:appointed|assigned|designated|nominated|selected|chosen|entrusted|commissioned|delegated|authori[sz]ed)\b/iu,
    /\b(?:took\s+up|accepted|assumed|filled|received|obtained|carries?|carried|bears?|bore|holds?|held)\b[\s\S]{0,40}\b(?:post|role|mandate|capacity|office|position|portfolio|status|remit)\b/iu,
    /\b(?:post|role|mandate|capacity|office|position|portfolio|status|remit)\b[\s\S]{0,35}\b(?:for|of|over|on|cover(?:s|ed|ing)?)\b/iu,
    /\b(?:designates?|designated|names?|named|records?|recorded)\b[\s\S]{0,45}\bas\b/iu,
    /\b(?:is|are|was|were|be|been)\s+represented\b/iu,
    /\b(?:serves?|served|acts?|acted|works?|worked|stands?|stood)\b[\s\S]{0,55}\bas\b/iu,
    /\b(?:retains?|retained|engages?|engaged)\b[\s\S]{0,45}\b(?:delegate|liaison|representative|envoy|agent|holder|officer|role)\b/iu,
    /\b(?:registry|register|records?)\b[\s\S]{0,45}\b(?:shows?|lists?|records?)\b[\s\S]{0,35}\b(?:status|role|capacity|portfolio|mandate)\b/iu,
  ].some((pattern) => pattern.test(textWithoutKnownOrganizations));
  const englishOpenClassRoleAssociationLookup = !englishPublicAggregate
    && !reviewedComplianceQuestion
    && englishExplicitSensitiveScope
    && englishOpenClassIdentityReference
    && englishOpenClassRoleAssignmentRelationship;
  const englishPublicRegulatoryIdentityQuestion = [
    /^who\s+is\s+(?:the\s+)?(?:public\s+|government\s+|regulatory\s+)?(?:agency|authority|institution|regulator)\s+for\s+private[-\s]+(?:well|borehole)\s+(?:permits?|guidance|policy|rules?|requirements?)\??$/iu,
    /^who\s+(?:regulates?|administers?|issues?|publishes?|provides?)\b[\s\S]{0,80}\bprivate[-\s]+(?:well|borehole)\s+(?:permits?|guidance|policy|rules?|requirements?)\??$/iu,
  ].some((pattern) => pattern.test(textWithoutKnownOrganizations.trim()));
  const englishDirectPrivateIdentityLookup = !englishPublicAggregate
    && !reviewedComplianceQuestion
    && !englishPublicRegulatoryIdentityQuestion
    && englishExplicitSensitiveScope
    && englishOpenClassIdentityReference;
  const englishOpenClassWhichRoleIdentityLookup = !englishPublicAggregate
    && !reviewedComplianceQuestion
    && englishExplicitSensitiveScope
    && englishAssetRoleRelationship
    && /\b(?:which|what)\s+(?![^?]{0,45}\b(?:public|government|municipal|state|agency|authority|organization|institution|regulator|rule|regulation|policy|guidance|requirement|permit|method|system|dataset|data|map|source|service)\b)(?:(?:named|natural|legal|private|specific|household|family|current|on[-\s]+site)\s+)*(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}\b/iu.test(textWithoutKnownOrganizations);
  const englishOpenClassRegistryRoleIdentityLookup = !englishPublicAggregate
    && !reviewedComplianceQuestion
    && englishExplicitSensitiveScope
    && [
      /\b(?:which|what)\s+(?!(?:public|government|municipal|state|agency|authority|organization|institution|regulator)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}\s+(?:appears?|stands?|sits?|is(?:\s+(?:named|listed|recorded))?)\b[\s\S]{0,70}\b(?:register|registry|filing|records?)\b/iu,
      /\bit\s+is\s+(?:which|what)\s+(?!(?:public|government|municipal|state|agency|authority|organization|institution|regulator)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}\s+that\b[\s\S]{0,90}\b(?:register|registry|filing|records?)\s+(?:names?|lists?|records?)\b/iu,
      /\b(?:register|registry|filing|records?)\s+(?:identif(?:y|ies|ied)|names?|lists?|records?)\s+(?:which|what)\s+(?!(?:public|government|municipal|state|agency|authority|organization|institution|regulator)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}\b/iu,
    ].some((pattern) => pattern.test(textWithoutKnownOrganizations));
  const englishPrivateAssetRoleLookup = !englishPublicAggregate && [
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,70}\b${englishRoleVerbSource}\b[\s\S]{0,100}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,36}\b(?:is|are|was|were|has|have|had|bears?|bore|holds?|held|charged)\b[\s\S]{0,35}\b${englishRoleNounSource}\b[\s\S]{0,35}\b(?:of|for|to|with|over)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b(?:serves?|functions?|acts?)\s+as\b[\s\S]{0,25}\b${englishRoleNounSource}\b[\s\S]{0,25}\b(?:of|for|over)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b(?:is|are|was|were)\s+(?:connected|linked|associated|attached)\s+(?:to|with)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b(?:is|are|was|were)\s+tied\s+to\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,30}\b${englishRoleNounSource}\b[\s\S]{0,25}\b(?:includes?|covers?|extends?\s+to)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b(?:is|was)\s+charged\s+with\s+(?:the\s+)?care\s+of\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b${englishIdentityAssetSource}\b[\s\S]{0,35}\b(?:belong(?:s)?\s+to|managed|administered|operated|run|supervised|overseen|controlled|held|possessed|used|occupied|leased|rented|maintained)\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,80}\b(?:is|are|was|were|has\s+been|had\s+been)\s+(?:managed|administered|operated|run|supervised|overseen|controlled|held|possessed|used|occupied|leased|rented|maintained|cared\s+for)\s+by\s+(?:whom|which\s+(?:named\s+)?(?:person|individual|party))\b`, "iu"),
    new RegExp(String.raw`\bby\s+(?:whom|which\s+(?:named\s+)?(?:person|individual|party))\b[\s\S]{0,35}\b(?:is|are|was|were|has\s+been|had\s+been)\b[\s\S]{0,35}\b${englishIdentityAssetSource}\b[\s\S]{0,45}\b(?:managed|administered|operated|run|supervised|overseen|controlled|held|possessed|used|occupied|leased|rented|maintained|cared\s+for)\b`, "iu"),
    new RegExp(String.raw`\b(?:identify|name|list|show|find|locate|reveal|disclose|provide|give|return|enumerate|display|tell(?:\s+me)?)\b[\s\S]{0,80}\b${englishRoleNounSource}\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b(?:identify|name|list|show|find|locate|reveal|disclose|provide|give|return|enumerate|display|tell(?:\s+me)?)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b[\s\S]{0,80}\b${englishRoleNounSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,65}\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b${englishRoleNounSource}\b`, "iu"),
    new RegExp(String.raw`\bwhose\s+(?:name|title|registration|rights?)\b[\s\S]{0,45}\b(?:attached|registered|recorded|linked|associated)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\bwhose\s+name\s+(?:is|was)\s+(?:shown\s+)?(?:on|in)\s+(?:the\s+)?(?:registry|register|records?|filing)\s+(?:for|of)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b${englishRoleNounSource}\b[\s\S]{0,55}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b(?:what\s+is\s+the\s+identity\s+of\s+)?(?:the\s+)?(?:person|individual|human\s+being)\b[\s\S]{0,55}\b${englishRoleVerbSource}\b[\s\S]{0,75}\b${englishIdentityAssetSource}\b[\s\S]{0,45}\b(?:who|whom|what)\b`, "iu"),
    new RegExp(String.raw`\b${englishRoleNounSource}\b[\s\S]{0,55}\b${englishIdentityAssetSource}\b[\s\S]{0,45}\b(?:is|would\s+be)\s+(?:which\s+)?(?:named\s+)?(?:person|individual|who|whom)\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}(?:'s|’s)\b[\s\S]{0,30}\b${englishRoleNounSource}\b[\s\S]{0,45}\bwho\s+(?:would\s+that\s+be|is\s+that)\b`, "iu"),
    new RegExp(String.raw`\b(?:reveal|show|tell\s+me|what\s+is)\b[\s\S]{0,30}\bidentity\b[\s\S]{0,45}\b(?:whoever|person|individual)\b[\s\S]{0,45}\b${englishRoleVerbSource}\b[\s\S]{0,75}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,45}\b${englishRoleNounSource}\b[\s\S]{0,45}\b(?:identify|name|reveal|show)\b[\s\S]{0,20}\b(?:that|the)\s+(?:person|individual)\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,65}\b(?:belongs?\s+to|is\s+held\s+by|is\s+assigned\s+to)\s+(?:whom|who|which\s+(?:named\s+)?(?:person|individual|party))\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,45}\b(?:answers?\s+to|falls?\s+under|is\s+subject\s+to)\b[\s\S]{0,25}\b${englishIdentityPromptSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,35}\b(?:is|falls?|comes?)\s+(?:directly\s+)?under\s+(?:which|what)\s+(?:named\s+|natural\s+|private\s+)?${englishRoleNounSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,90}\b(?:name|identify|reveal|show|find|disclose)\b[\s\S]{0,55}\b(?:person|individual|party|human\s+being)\b[\s\S]{0,45}\b${englishRoleNounSource}\b`, "iu"),
    new RegExp(String.raw`\b(?:management|administration|operation|supervision|control|custody|stewardship)\s+of\b[\s\S]{0,30}\b${englishIdentityAssetSource}\b[\s\S]{0,100}\b(?:rests?|lies?|falls?)\s+with\s+(?:who|whom|which\s+(?:person|individual|party))\b`, "iu"),
    new RegExp(String.raw`\bby\s+(?:what|which)\s+(?:person|individual|party)\b[\s\S]{0,35}\b(?:could|would|may|might|can)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b[\s\S]{0,35}\bbe(?:\s+being)?\s+(?:managed|administered|operated|run|supervised|overseen|controlled|held|possessed|used|occupied|leased|rented|maintained)\b`, "iu"),
    new RegExp(String.raw`\b${englishRoleNounSource}\b[\s\S]{0,35}\b(?:of|for)\b[\s\S]{0,35}\b${englishIdentityAssetSource}\b[\s\S]{0,100}\b(?:who|whom)\b[\s\S]{0,20}\b(?:is|would\s+be)\b`, "iu"),
  ].some((pattern) => pattern.test(text));
  const {
    hasPotentialNamedOwnPrivateAssetAssociation,
    hasRoleLinkedNamedPrivateAssetAssociation,
    hasStrongGrammarNamedPrivateAssetAssociation,
    hasStructuredNamedPerson,
  } = classifyPrivacyPersonAssociations(
    textWithoutKnownOrganizations,
    rawIdentityFragments,
    hasPrivateAssetReference,
    hasExplicitCapitalizedPersonName,
    hasKnownPublicOrganization,
    englishRoleNounSource,
  );
  const {
    hasProtectedAreaOrganizationConstructionContactContext,
    hasProtectedAreaPrivateConstructionAssociation,
    reviewedBenignNamedProtectedAreaAdvice,
    reviewedBenignNamedRegulatoryContext,
  } = assessPrivacyPersonRegulatoryRules(
    text,
    textWithoutKnownOrganizations,
    hasKnownPublicOrganization,
    hasInstitutionalContactChannel,
    residualContactNameMatches,
    residualContactNameTokens,
  );
  const hasNamedPrivateResidualClause = hasPotentialNamedOwnPrivateAssetAssociation
    || (hasStructuredNamedPerson && [
    /\b(?:and|plus)\s+(?:where\s+(?:does|is)\s+(?:he|she|they|his|her|their)|who\s+(?:owns?|controls?|holds?|manages?)\s+(?:his|her|their))\b/iu,
    /(?:\band\b|[;,])\s*(?:where\s+can\s+(?:he|she|they)\s+be\s+found|(?:locate|find)\s+(?:him|her|them)|tell\s+me\s+(?:his|her|their)\s+whereabouts|what\s+is\s+(?:his|her|their)\s+(?:wife|husband|spouse)(?:'s|’s)?\s+name|who\s+is\s+(?:his|her|their)\s+(?:wife|husband|spouse))\b/iu,
    /\b(?:his|her|their)\s+(?:(?:separate|adjacent|private|family|household|residential)\s+)*(?:premises|site|cottage|property|parcel|plot|land|farm|well|borehole|forest|woodland)\b/iu,
    /\b(?:ja|ning)\s+(?:kus\s+(?:ta|tema)|kellele\s+kuulub\s+tema)\b/iu,
    /\b(?:oma|tema)\s+(?:erakaev\w*|eratalu\w*|eramaa\w*|eramets\w*|maja\w*|kinnist\w*|puurkaev\w*)\b/iu,
    /(?:\band\b|[;,])\s*(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:find|locate|identify|contact|show)\s+(?:him|her|them)\b/iu,
    /(?:\band\b|[;,])\s*(?:what\s+is\s+)?(?:the\s+)?name\s+of\s+(?:his|her|their)\s+(?:wife|husband|spouse)\b/iu,
    ].some((pattern) => pattern.test(textWithoutKnownOrganizations)));
  const englishOpenClassNamedRoleAssociationLookup = !englishPublicAggregate
    && hasStructuredNamedPerson
    && englishExplicitSensitiveScope
    && (
      englishOpenClassRoleAssignmentRelationship
      || /(?<!\p{L})\p{Lu}[\p{Ll}'’-]{1,39}\s+\p{Lu}[\p{Ll}'’-]{1,39}\s*,\s*(?:\p{L}[\p{L}'’-]{1,30}\s+){0,4}\p{L}[\p{L}'’-]{1,30}\s+(?:for|of|over)\b/u.test(textWithoutKnownOrganizations)
      || /\b(?:property|parcel|plot|lot|estate|land|well|borehole|forest|woodland)\b[\s\S]{0,55}\b(?:is|was)\s+\p{Lu}[\p{Ll}'’-]{1,39}\s+\p{Lu}[\p{Ll}'’-]{1,39}(?!\p{L})/u.test(textWithoutKnownOrganizations)
    );
  const englishOpenClassNamedRoleAssetLookup = !englishPublicAggregate
    && hasStructuredNamedPerson
    && hasAdjacentSuspiciousPair
    && new RegExp(
      String.raw`\b(?:is|was|as)\s+(?:(?:the|an?)\s+)?(?:\p{L}[\p{L}'’-]{1,30}\s+){0,3}\p{L}[\p{L}'’-]{1,30}\s+(?:for|of|over)\s+(?:(?:the|this|that|an?)\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}(?![\p{L}-]|\s+(?:permits?|guidance|policy|rules?|data|biodiversity|monitoring|research|information|requirements?)\b)`,
      "iu",
    ).test(textWithoutKnownOrganizations);
  const englishNamedRoleAssetLookup = !englishPublicAggregate
    && hasStructuredNamedPerson
    && englishAssetRoleRelationship
    && new RegExp(String.raw`(?<!\p{L})${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`, "iu").test(text);
  const namedPersonSensitiveOrAssetLookup = hasStructuredNamedPerson && (
    hasEstonianRegulatoryBuildingContext
    || /\b(?:identity|identify|identification|personal\s+(?:id|data|information)|private\s+assets?|birth\s+(?:year|date)|financial(?:\s*\/\s*property)?\s+data|property\s+data|residence|residency|resident\s+status|domicile|home\s+location|coordinates?|contact|phone|telephone|email|address)\b/iu.test(textWithoutKnownOrganizations)
    || /\b(?:isiku\s+tuvast\w*|isiklik\w*\s+(?:andm\w*|vara\w*)|varalis\w*\s+andm\w*|sünni(?:aasta|aeg|kuupäev)\w*|synni(?:aasta|aeg|kuupaev)\w*|elukoh\w*|kodukoht\w*|residentsus\w*|kodune\s+paik|koordinaa\w*|omand\w*|valdusõigus\w*)\b/iu.test(textWithoutKnownOrganizations)
    || (/\b(?:permit|loa\w*|toimik\w*|register|registry|andmestik\w*)\b/iu.test(textWithoutKnownOrganizations)
      && /\b(?:identify|identity|behind|attached|tuvast\w*|isiku\w*)\b/iu.test(textWithoutKnownOrganizations))
    || (/\b(?:show|find|locate|identify|reveal|display|näita|naita|leia|otsi)\b/iu.test(textWithoutKnownOrganizations)
      && /\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|cottage|(?:kõrval|naaber)?kinnist\w*|maa\w*|maat(?:ü|u)k\w*|maja\w*|kaev\w*)\b/iu.test(textWithoutKnownOrganizations))
    || (/\b(?:omanik\w*|valdaja\w*|valdus\w*|haldaja\w*|haldur\w*|käitaja\w*|kasutaja\w*|tenant|operator|manager)\b/iu.test(textWithoutKnownOrganizations)
      && /\b(?:kinnist\w*|maa\w*|maat(?:ü|u)k\w*|maja\w*|kaev\w*|property|parcel|plot|lot|estate|land|house|home|farm|well|borehole)\b/iu.test(textWithoutKnownOrganizations))
  );
  const englishRecordedNamedRoleAssetLookup = hasStructuredNamedPerson
    && new RegExp(String.raw`\b(?:entrusted\s+with|(?:described|listed|recorded)\s+as\s+(?:a\s+)?${englishRoleNounSource}\s+(?:for|of))\b[\s\S]{0,90}\b${ENGLISH_PRIVATE_ASSET_SOURCE}\b`, "iu").test(textWithoutKnownOrganizations);
  const englishPermitIdentityLookup = /\b(?:who|whom|whose|whoever|which\s+(?:private\s+)?person|what\s+(?:private\s+)?person|identify|name|reveal|show)\b[\s\S]{0,90}\b(?:private\s+person|identity|person|individual|party|whoever)\b[\s\S]{0,90}\b(?:permit|licen[cs]e|filing|file)\b/iu.test(text)
    || /\b(?:identity|private\s+person|person|individual)\b[\s\S]{0,45}\b(?:attached|associated|behind|linked|connected)\b[\s\S]{0,45}\b(?:permit|licen[cs]e|filing|file)\b/iu.test(text);
  const englishRolePredicateCount = (text.match(/\b(?:own\w*|manag\w*|administ\w*|operat\w*|run(?:s|ning)?|ran|monitor\w*|supervis\w*|overse\w*|oversaw|control\w*|hold(?:s|ing)?|held|possess\w*|us(?:e|es|ed|ing)|occup\w*|leas\w*|rent\w*|maintain\w*|steward\w*|care(?:s|d|ing)?|responsible|accountable|manager|controller)\b/giu) || []).length;
  const englishMixedPrivateAssetReference = /\b(?:private(?:ly)?(?:\s+held)?|nonpublic|neighbor(?:ing)?|neighbour(?:ing)?|another|other|latter|former|second|third|adjacent|adjoining|nearby|counterpart|holding|separate(?:ly)?|independent(?:ly)?|unrelated|premises|site|next\s+door|across\s+the\s+road)\b/iu.test(englishPublicResidual);
  // A single interrogative can govern two coordinated role predicates. When
  // one predicate names a public asset and the other points at a private or
  // anaphoric asset, the whole request is a private role lookup.
  const englishMixedPublicPrivateRoleLookup = englishPublicAssetMatches.length > 0
    && englishRoleInterrogativeCount > 0
    && englishRolePredicateCount >= 2
    && englishMixedPrivateAssetReference;
  const englishStreetRoleAssociation = englishStreetAddress && englishAssetRoleRelationship;
  const estonianPublicAssetPattern = /\b(?:(?:riigimetsa\s+|(?:riigi|avalik\w*|munitsipaal\w*|omavalitsuse|linna|valla)\s*|(?:riigi|avalikus?)\s+omandis\s+(?:olev\w*\s+)?|riigile\s+kuuluv\w*\s+)(?:metsamaa|mets|metsa|maa(?:u|ü)ksus|maat(?:ü|u)k|kinnistu|puurkaev|erakaev|hoone)\w*|riigimets\w*|rahvusmets\w*)\b/giu;
  const estonianPublicAssetMatches = [...text.matchAll(estonianPublicAssetPattern)];
  const estonianPublicResidual = text.replace(estonianPublicAssetPattern, " ");
  const estonianPublicAggregate = estonianPublicAssetMatches.length > 0
    && !CADASTRE_PATTERN.test(text)
    && !/\baadress\w*\b/iu.test(text)
    && !/\b(?:katastri\w*|(?:naaber|naabri)?kinnist\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|puurkaev\w*|erakaev\w*|eramaa\w*)\b/iu.test(estonianPublicResidual)
    && !/\b(?:naaber|kõrval|teine|muu|era|isiklik)\w*\s+(?:üks|uks|objekt)\w*\b/iu.test(estonianPublicResidual);
  const estonianConcreteAssetContext = hasEstonianRegulatoryBuildingContext
    || /\b(?:katastri\w*|(?:(?:naaber|naabri|metsa|era|rendi)?kinnist)\w*|metsaeraldis\w*|metsamaa\w*|erapuistu\w*|eramaa\w*|eratalu\w*|(?:kõrval|naaber)maa\w*|(?:kõrval|naaber)?maja\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)k{1,2}\w*|puurkaev\w*|erakaev\w*|(?:(?:perekonna|era|isiklik)\s+kaev)\w*|talu(?:koht|koha)\w*|rendi(?:leping|lepingu)\w*|üüri(?:leping|lepingu)\w*|uuri(?:leping|lepingu)\w*|hoone\w*|aadress\w*)\b/iu.test(text)
    || rawIdentityFragments.some((word) => ESTONIAN_PRIVATE_FOREST_NOUN_PATTERN.test(word));
  const estonianIdentityRolePrompt = /(?<!\p{L})(?:kes|kelle|kellele|keda|nimeta|loetle|näita|naita|leia|otsi|tuvasta|anna|(?:millin\w*|millis\w*|mis)\s+(?:(?:füüsili\w*|fuusili\w*|konkreet\w*|era|õigusli\w*|oigusli\w*)\s+)*(?:isik\w*|inime\w*|eraisik\w*|amet))(?!\p{L})/iu.test(text);
  const estonianDirectRoleHolderPrompt = /(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?:(?:era|naaber|naabri|perekonna|isiklik)\w*\s+)*(?:omanik\w*|valdaja\w*|haldaja\w*|haldur\w*|operaator\w*|käitaja\w*|kasutaja\w*|asukas\w*|üürnik\w*|rentnik\w*|hoidja\w*|eestkostja\w*|volinik\w*|esindaja\w*|käsundisaaja\w*|kasusaaja\w*|kontaktisik\w*|litsentsisaaja\w*)(?!\p{L})/iu.test(text);
  const estonianAssetRoleRelationship = /(?<!\p{L})(?:omanik\w*|loaomanik\w*|valdaja\w*|valdus\w*|haldaja\w*|haldur\w*|haldus\w*|operaator\w*|käitaja\w*|kasutaja\w*|asukas\w*|üürni\w*|üüri\w*|rentni\w*|ülalpida\w*|hoidja\w*|hoole\s+all|õlul|oulul|eestkost\w*|pädev\w*|padev\w*|volitus\w*|volita\w*|volinik\w*|esindaja\w*|käsundisaaja\w*|kasusaaja\w*|kontaktisik\w*|litsentsisaaja\w*|kontsessionäär\w*|kontsessionaar\w*|usaldusisik\w*|korrashoi\w*|eestveda\w*|käsual\w*|kasual\w*|vastutus\w*|vastutav\w*|vastuta\w*|majanda\w*|kontrolli\w*|korralda\w*|halda\w*|hoolda\w*|kasuta\w*|kasutu\w*|valda\w*|valitse\w*|omab|omavad|kuulu\w*|hallata|käsutus\w*|juhi\w*|juhti\w*|käita\w*|opereeri\w*|järelevalv\w*|rendi\w*|nime(?:l|le)\w*|nimel)(?!\p{L})/iu.test(text);
  const estonianRoleHolderIdentityPrompt = /(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?:(?:era|naaber|naabri|perekonna|isiklik)\w*\s+)*(?:eramaa\w*|erakinnistu\w*|naaberkinnistu\w*|maa\w*|kinnistu\w*|maa(?:u|ü)ksuse\w*|maat(?:ü|u)ki\w*|kaevu\w*|puurkaevu\w*|hoone\w*)\s+(?:[\p{L}-]+\s+){0,2}[\p{L}-]+(?!\p{L})/iu.test(text);
  const estonianOpenClassAssetIdentityLookup = !estonianPublicAggregate
    && estonianConcreteAssetContext
    && /(?<!\p{L})kes\s+on(?!\p{L})/iu.test(text);
  const estonianNaturalPersonRoleLookup = estonianIdentityRolePrompt
    && /\b(?:füüsili\w*\s+isik\w*|fuusili\w*\s+isik\w*|eraisik\w*|inime\w*)\b/iu.test(text)
    && estonianAssetRoleRelationship
    && /\b(?:märgala\w*|margala\w*|natura\w*|kaitseala\w*|elupaik\w*|mets\w*|maa\w*|kinnist\w*|kaev\w*|puurkaev\w*|hoone\w*)\b/iu.test(text);
  const estonianOpenClassNamedAssetLookup = hasStructuredNamedPerson
    && hasAdjacentSuspiciousPair
    && !estonianPublicAggregate
    && estonianConcreteAssetContext
    && /\b(?:on|oli|oleks|tegutse\w*|toimi\w*|nimeta\w*|määra\w*|maara\w*)\b/iu.test(textWithoutKnownOrganizations);
  const estonianGeneralRoleIdentityLookup = !estonianPublicAggregate
    && estonianConcreteAssetContext
    && (estonianIdentityRolePrompt || estonianRoleHolderIdentityPrompt || estonianDirectRoleHolderPrompt)
    && estonianAssetRoleRelationship;
  const estonianDirectIdentityAssetLookup = !estonianPublicAggregate
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && (
      /(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?:(?:füüsili\w*|fuusili\w*|konkreet\w*|era|õigusli\w*|oigusli\w*)\s+)*(?:isik\w*|inime\w*|eraisik\w*)(?!\p{L})/iu.test(text)
      || estonianDirectRoleHolderPrompt
      || /(?<!\p{L})(?:nimeta|tuvasta|keda)(?!\p{L})/iu.test(text)
    );
  const estonianIdentityResidenceLookup = estonianIdentityRolePrompt
    && hasResidenceContext
    && (
      estonianConcreteAssetContext
      || CADASTRE_PATTERN.test(text)
      || (/(?<!\p{L})registr\w*(?!\p{L})/iu.test(text)
        && /(?<!\p{L})(?:kaev|kinnist|maa|maatü|maatu|hoone)\w*(?!\p{L})/iu.test(text)
        && estonianAssetRoleRelationship)
    );
  const estonianOpenClassIdentityReferencePattern = /(?<!\p{L})(?:kes|kelle|kellele|keda|keegi|nimeta|tuvasta|anna\s+(?:selle\s+)?isiku\s+nimi)(?!\p{L})/iu;
  const estonianOpenClassIdentityReference = estonianOpenClassIdentityReferencePattern.test(textWithoutKnownOrganizations);
  const estonianOpenClassRoleAssignmentRelationship = [
    /(?<!\p{L})(?:roll|ülesan|ulesan|mandaa[dt]|amet|positsioon|volitus|nimeli|volita)\w*(?!\p{L})/iu,
    /(?<!\p{L})(?:määrati|maarati|määras|maaras|nimetati|nimetas|volitati|volitas|pandi|valiti|anti|sai|osutus|jäi|jai|läks|laks)(?!\p{L})[\s\S]{0,55}(?<!\p{L})\p{L}[\p{L}'’-]{2,35}(?:ks|na)(?!\p{L})/iu,
    /(?<!\p{L})(?:tegutse|toimi|täida|taida|tööta|toota)\w*(?!\p{L})[\s\S]{0,55}(?<!\p{L})\p{L}[\p{L}'’-]{2,35}(?:ks|na)(?!\p{L})/iu,
    /(?<!\p{L})\p{L}[\p{L}'’-]{2,35}(?:ks|na)(?!\p{L})[\s\S]{0,35}(?<!\p{L})(?:osutus|jäi|jai|oli|on)(?!\p{L})/iu,
    /(?<!\p{L})(?:määras|maaras|nimetas|valis)(?!\p{L})[\s\S]{0,80}(?<!\p{L})kes\s+(?:see|ta)\s+oli(?!\p{L})/iu,
    /(?<!\p{L})(?:kohal|koht)\w*(?!\p{L})[\s\S]{0,25}(?<!\p{L})(?:on|oli|läks|laks)(?!\p{L})/iu,
    /(?<!\p{L})(?:registr|toimik)\w*(?!\p{L})[\s\S]{0,55}(?<!\p{L})(?:seisab|seisis|kirjas)(?!\p{L})[\s\S]{0,35}(?<!\p{L})\p{L}[\p{L}'’-]{2,35}(?:ks|na)(?!\p{L})/iu,
  ].some((pattern) => pattern.test(textWithoutKnownOrganizations));
  const estonianOpenClassRoleAssociationLookup = !estonianPublicAggregate
    && !reviewedComplianceQuestion
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && estonianOpenClassIdentityReference
    && estonianOpenClassRoleAssignmentRelationship;
  const estonianOpenClassNamedRoleAssociationLookup = !estonianPublicAggregate
    && hasStructuredNamedPerson
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && (estonianOpenClassRoleAssignmentRelationship
      || /(?<!\p{L})\p{Lu}[\p{Ll}'’-]{1,39}\s+\p{Lu}[\p{Ll}'’-]{1,39}\s*,\s*(?:erakaevu|eramaa|perekonna\s+kaevu|naaberkinnistu\w*)\s+\p{L}[\p{L}'’-]{2,40}\s*,/u.test(textWithoutKnownOrganizations));
  // “Kelle nõusolekut/luba on vaja?” asks which public authority must
  // approve a regulated activity, not who owns a building. Only reviewed,
  // complete generic grammars are exempt; any unconsumed person, possessor,
  // location or private-asset clause keeps the ordinary identity guard.
  const estonianGenericRegulatoryConsentQuestion = isReviewedGenericProtectedAreaConsentQuery(text)
    && !hasProtectedAreaPrivateConstructionAssociation
    && !CADASTRE_PATTERN.test(text)
    && !hasSensitiveContact
    && !hasSensitivePersonalAttribute
    && !hasPrivatePostalField
    && !hasPersonOrOwnerPredicate;
  const estonianResidualOpenClassIdentityReference = estonianOpenClassIdentityReferencePattern.test(
    textWithoutKnownOrganizations.replace(
      /(?<!\p{L})kelle\s+(?:(?:eelnev|kirjalik|ametlik)\w*\s+)?(?:nõusolek|kooskõlastus|heakskiit|luba)\w*(?!\p{L})/giu,
      " ",
    ),
  );
  const estonianDirectPrivateIdentityLookup = !estonianPublicAggregate
    && !reviewedComplianceQuestion
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && estonianOpenClassIdentityReference
    && (!estonianGenericRegulatoryConsentQuestion || estonianResidualOpenClassIdentityReference);
  const estonianOpenClassWhichRoleIdentityLookup = !estonianPublicAggregate
    && !reviewedComplianceQuestion
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && estonianAssetRoleRelationship
    && /(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?![^?]{0,45}(?<!\p{L})(?:avalik\w*|riigi\w*|asutus\w*|amet\w*|organisatsioon\w*|reegl\w*|õigus\w*|oigus\w*|juhis\w*|nõue\w*|noue\w*|meetod\w*|süsteem\w*|susteem\w*|andmestik\w*|kaart\w*|teenus\w*|vald\w*|maakond\w*|linn\w*|küla\w*|kyla\w*|asula\w*|piirkon\w*|omavalitsus\w*|territoorium\w*|veekogu\w*|jõgi\w*|jogi\w*|register\w*)(?!\p{L}))(?:(?:era|naaber|naabri|perekonna|isiklik|konkreet\w*)\s+)*(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}(?!\p{L})/iu.test(textWithoutKnownOrganizations);
  const estonianOpenClassRegistryRoleIdentityLookup = !estonianPublicAggregate
    && !reviewedComplianceQuestion
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && [
      /(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?!(?:avalik\w*|riigi\w*|asutus\w*|amet\w*|organisatsioon\w*|reegl\w*|õigus\w*|oigus\w*|juhis\w*|nõue\w*|noue\w*|meetod\w*|süsteem\w*|susteem\w*)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}\s+(?:on|oli|seisab|seisis)\b[\s\S]{0,70}(?<!\p{L})(?:registr|toimik|kand|kirje)\w*(?!\p{L})/iu,
      /(?<!\p{L})(?:registr|toimik|kand|kirje)\w*(?!\p{L})[\s\S]{0,50}(?<!\p{L})(?:nimetab|nimetas|loetleb|loetles|tuvastab|tuvastas)(?!\p{L})[\s\S]{0,35}(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?!(?:avalik\w*|riigi\w*|asutus\w*|amet\w*|organisatsioon\w*)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}(?!\p{L})/iu,
    ].some((pattern) => pattern.test(textWithoutKnownOrganizations));
  const estonianNamedRoleAssetLookup = hasStructuredNamedPerson
    && (estonianConcreteAssetContext || /\bmaa\b/iu.test(text))
    && estonianAssetRoleRelationship;
  const estonianPrivateAssetRoleLookup = !estonianPublicAggregate && (
    /\bkes\b[\s\S]{0,100}\b(?:katastri\w*|(?:(?:naaber|naabri|metsa)?kinnist)\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|puurkaev\w*|aadress\w*)\b[\s\S]{0,60}\b(?:õiguspärane\s+)?(?:kasutaja|valdaja|haldaja|haldur|omanik|õigustatud\s+isik|vastutav\s+isik)\b/iu.test(text)
    || /\bkes\b[\s\S]{0,80}\b(?:õiguspärane\s+)?(?:kasutaja|valdaja|haldaja|haldur|omanik|õigustatud\s+isik|vastutav\s+isik)\b[\s\S]{0,60}\b(?:katastri\w*|(?:(?:naaber|naabri|metsa)?kinnist)\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|puurkaev\w*|aadress\w*)\b/iu.test(text)
    || /\b(?:nimeta|loetle|näita|naita|leia|otsi|tuvasta)\b[\s\S]{0,80}\b(?:katastri\w*|(?:(?:naaber|naabri|metsa)?kinnist)\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|puurkaev\w*|aadress\w*)\b[\s\S]{0,60}\b(?:kasutaja|valdaja|haldaja|haldur|omanik|õigustatud\s+isik|vastutav\s+isik)\b/iu.test(text)
  );
  const englishGeneralOwnerDutyQuestion = /^what\s+(?:responsibilit(?:y|ies)|rights?|dut(?:y|ies)|obligations?|rules?|requirements?)\s+(?:does|do)\s+(?:(?:an?|the)\s+)?(?:(?:private|forest|woodland|property|parcel|land)\s+){0,3}(?:owners?|landowners?|homeowners?|landholders?|proprietors?|landlords?)\s+have(?:\s+under\s+[\p{L}\s-]{1,60})?\??$/iu.test(text.trim());
  const englishGeneralOwnershipExemption = englishPublicAggregate || englishGeneralOwnerDutyQuestion;
  const englishExplicitIdentityEnumeration = ENGLISH_OWNER_ENUMERATION_ACTION_PATTERN.test(text)
    || ENGLISH_WHO_OWNER_ASSET_PATTERN.test(text)
    || /\b(?:list|show|find|identify|return|give|provide|reveal|disclose|name|enumerate|display)\b[\s\S]{0,80}\bprivate\s+(?:owners?|landowners?|homeowners?|residents?|individuals?|people|persons?)\b/iu.test(text)
    || /\b(?:which|what)\s+(?:individuals?|people|persons?|owners?|landowners?|homeowners?)\s+(?:own|hold|lease|rent)\w*\b[\s\S]{0,80}\b(?:properties|parcels|plots|land|houses|homes|farms|wells|boreholes)\b/iu.test(text)
    || /\bwho\s+are\s+(?:the\s+)?(?:private\s+)?(?:owners?|landowners?|homeowners?)\s+of\b[\s\S]{0,80}\b(?:properties|parcels|plots|land|houses|homes|farms|wells|boreholes)\b/iu.test(text);
  const englishAssetIdentityQuestion = /\b(?:who|whom|whose\s+name|which\s+person|show(?:\s+me)?\s+the\s+person)\b/iu.test(textWithoutKnownOrganizations)
    && englishPrivateAsset
    && /\b(?:(?:registered|recorded)(?:\s+(?:to|under|in))?|(?:associated|connected|linked)\s+(?:to|with)|(?:owned|held)\s+by)\b/iu.test(textWithoutKnownOrganizations)
    && !englishGeneralOwnershipExemption;
  const explicitIdentityRequestLanguage = englishRoleInterrogativeCount > 0
    || englishExplicitPersonPrivateAssetLookup
    || estonianIdentityRolePrompt
    || estonianRoleHolderIdentityPrompt
    || estonianDirectRoleHolderPrompt
    || estonianDirectIdentityAssetLookup
    || estonianIdentityResidenceLookup
    || englishExplicitNaturalPersonSensitiveScopeLookup
    || englishOpenClassAppointmentLookup
    || englishOpenClassRoleAssociationLookup
    || englishOpenClassNamedRoleAssociationLookup
    || englishDirectPrivateIdentityLookup
    || englishOpenClassWhichRoleIdentityLookup
    || englishOpenClassRegistryRoleIdentityLookup
    || estonianOpenClassAssetIdentityLookup
    || estonianNaturalPersonRoleLookup
    || estonianOpenClassRoleAssociationLookup
    || estonianOpenClassNamedRoleAssociationLookup
    || estonianDirectPrivateIdentityLookup
    || estonianOpenClassWhichRoleIdentityLookup
    || estonianOpenClassRegistryRoleIdentityLookup
    || /\b(?:identify|identity|name|reveal|show|find|locate|disclose|tuvasta|nimeta|näita|naita|leia|otsi)\b[\s\S]{0,45}\b(?:person|individual|party|human\s+being|isik\w*|inime\w*|eraisik\w*)\b/iu.test(textWithoutKnownOrganizations);
  const genericEnvironmentalActivityQuestion = !explicitIdentityRequestLanguage
    && !hasStructuredNamedPerson
    && !englishPrivateAssetRoleLookup
    && !englishOpenClassRoleIdentityLookup
    && !englishOpenClassRoleAssociationLookup
    && !englishOpenClassNamedRoleAssociationLookup
    && !englishDirectPrivateIdentityLookup
    && !englishOpenClassWhichRoleIdentityLookup
    && !englishOpenClassRegistryRoleIdentityLookup
    && !englishOpenClassNamedRoleAssetLookup
    && !englishNamedRoleAssetLookup
    && !englishRecordedNamedRoleAssetLookup
    && !englishPermitIdentityLookup
    && !englishMixedPublicPrivateRoleLookup
    && !englishStreetRoleAssociation
    && !estonianNamedRoleAssetLookup
    && !estonianOpenClassNamedAssetLookup
    && !estonianGeneralRoleIdentityLookup
    && !estonianOpenClassRoleAssociationLookup
    && !estonianOpenClassNamedRoleAssociationLookup
    && !estonianDirectPrivateIdentityLookup
    && !estonianOpenClassWhichRoleIdentityLookup
    && !estonianOpenClassRegistryRoleIdentityLookup
    && !estonianPrivateAssetRoleLookup
    && !englishAssetIdentityQuestion
    && !englishExplicitPersonPrivateAssetLookup
    && !matchesEnglishPersonalPattern
    && !hasSensitiveContact
    && !hasSensitivePersonalAttribute
    && !hasPrivatePostalField
    && /\b(?:biodivers\w*|elurikk\w*|linnurikk\w*|groundwater\w*|p[õo]hjave\w*|hydrolog\w*|sademeve\w*|wetland\w*|m[äa]rgal\w*|habitat\w*|elupai[kg]\w*|nahkhiir\w*|metsa\w*|forest\w*|woodland\w*|stream\w*|creek\w*|j[õo]e\w*|veekogu\w*)\b/iu.test(text)
    && /\b(?:affect\w*|impact\w*|effect\w*|maintain\w*|maintenance|restor\w*|monitor\w*|compar\w*|measure\w*|reduce\w*|comply\w*|follow\w*|rules?|pressure|koormus\w*|hoold\w*|taasta\w*|parand\w*|m[õo]ju\w*|m[õo][õo]d\w*|seire\w*|v[õo]rdle\w*|v[äa]henda\w*|surve\w*|reegl\w*|j[äa]rgi\w*)\b/iu.test(text);
  const englishPatternLookup = englishExplicitIdentityEnumeration
    || (matchesEnglishPersonalPattern && !(
      englishGeneralOwnershipExemption
      && !englishNamedResidenceQuestion
      && !englishNamedFoundQuestion
      && !englishNamedLocatedQuestion
      && !englishLocateNamedPerson
      && !englishOwnerContactIntent
    ));
  const englishPersonalLookup = (
    englishOwnershipIntent
      && (englishPrivateAsset || englishStreetAddress || englishSpecificForest)
      && !englishGeneralOwnershipExemption
  ) || (
    englishResidenceIntent
      && !englishWhereResidenceIsEcological
      && (hasNamedIdentity || englishPrivateAsset || englishStreetAddress || englishSpecificForest)
  ) || englishNamedResidenceQuestion
    || englishNamedFoundQuestion
    || englishNamedLocatedQuestion
    || englishLocateNamedPerson
    || englishOwnerContactIntent
    || englishNamedPossessiveContactIntent
    || (englishNamedAssetRelationship && !englishGeneralOwnershipExemption)
    || englishAssetIdentityQuestion
    || englishPatternLookup;
  const reviewedAllPublicAssetQuery = (englishPublicAggregate || estonianPublicAggregate)
    && !englishMixedPublicPrivateRoleLookup
    && !hasExplicitCapitalizedPersonName
    && !hasSensitiveContact
    && !hasSensitivePersonalAttribute
    && !hasPrivatePostalField
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text);
  const reviewedNamedPublicAssetEnvironmentalQuestion = hasExplicitCapitalizedPersonName
    && !hasSensitiveContact
    && !hasSensitivePersonalAttribute
    && !hasPrivatePostalField
    && [
      new RegExp(String.raw`^how\s+does\s+${ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE}\s+(?:manage\w*|maintain\w*|administer\w*|operate\w*|steward\w*)\s+(?:(?:an?|the)\s+)?(?:state(?:[-\s]+owned)?|public(?:ly[-\s]+owned|[-\s]+owned)?|national|municipal(?:ly[-\s]+owned)?|government(?:[-\s]+owned)?|city[-\s]+owned|county[-\s]+owned|federal)\s+(?:forest|woodland|land|property|estate|parcel|plot|lot|farm|well|borehole|building|dwelling)s?\?$`, "iu"),
      new RegExp(String.raw`^kuidas\s+m[õo]jutab\s+${ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE}\s+(?:hallatav\w*\s+)?(?:riigimets\w*|rahvusmets\w*|avalik\w*\s+mets\w*)\s+(?:elupaik\w*|elurikk\w*)\?$`, "iu"),
    ].some((pattern) => pattern.test(text.trim()));
  const namedOwnerRoleLookup = hasExplicitCapitalizedPersonName && (
    new RegExp(String.raw`\b(?:owner|landowner|landholder|proprietor)\s+(?:is|named)\s+${ENGLISH_PERSON_NAME_SOURCE}\b`, "iu").test(text)
    || new RegExp(String.raw`\b${ENGLISH_PERSON_NAME_SOURCE}\s+is\s+(?:the\s+)?(?:owner|landowner|landholder|proprietor)\b`, "iu").test(text)
  );
  const explicitPersonalLookup = PERSONAL_LOOKUP_PATTERNS.some((pattern) => pattern.test(text))
    || hasAddressAndPresence
    || (hasHumanMarker && hasSensitiveContact)
    || (hasPrivateAssetReference && hasPrivateAssetIdentity && (
      hasStructuredNamedPerson
      || PRIVATE_ASSET_LOOKUP_ACTION_PATTERN.test(text)
      || hasPersonOrOwnerPredicate
      || hasSensitiveContact
      || hasSensitivePersonalAttribute
    ))
    || (hasNamedIdentity && (
      sensitiveIndex >= 0
      || hasSensitiveContact
      || hasSensitivePersonalAttribute
      || hasPrivatePostalField
    ))
    || (hasNamedIdentity && hasResidenceContext
      && !englishWhereResidenceIsEcological
      && !englishWhereFoundIsEcological)
    || hasNamedForestAssetLookup
    || hasNamedForestOwnership
    || englishNamedRoleAssetLookup
    || englishOpenClassRoleIdentityLookup
    || englishExplicitNaturalPersonSensitiveScopeLookup
    || englishOpenClassAppointmentLookup
    || englishOpenClassRoleAssociationLookup
    || englishOpenClassNamedRoleAssociationLookup
    || englishDirectPrivateIdentityLookup
    || englishOpenClassWhichRoleIdentityLookup
    || englishOpenClassRegistryRoleIdentityLookup
    || englishOpenClassNamedRoleAssetLookup
    || englishRecordedNamedRoleAssetLookup
    || contactScope === "private-person"
    || namedPersonSensitiveOrAssetLookup
    || englishPermitIdentityLookup
    || englishMixedPublicPrivateRoleLookup
    || englishStreetRoleAssociation
    || estonianNamedRoleAssetLookup
    || estonianOpenClassNamedAssetLookup
    || estonianOpenClassAssetIdentityLookup
    || estonianNaturalPersonRoleLookup
    || estonianDirectIdentityAssetLookup
    || estonianIdentityResidenceLookup
    || estonianOpenClassRoleAssociationLookup
    || estonianOpenClassNamedRoleAssociationLookup
    || estonianDirectPrivateIdentityLookup
    || estonianOpenClassWhichRoleIdentityLookup
    || estonianOpenClassRegistryRoleIdentityLookup
    || namedOwnerRoleLookup
    || (hasExplicitCapitalizedPersonName && /\b(?:identity|personal\s+(?:data|information))\b/iu.test(textWithoutKnownOrganizations))
    || estonianGeneralRoleIdentityLookup
    || englishExplicitPersonPrivateAssetLookup
    || englishPrivateAssetRoleLookup
    || estonianPrivateAssetRoleLookup
    || englishPersonalLookup;
  // A bounded named-person/role/private-asset association is conclusive at
  // this boundary. Do not let broader environmental, compliance, public-role
  // or organization allowlists reinterpret it after the identity has been
  // linked to a concrete asset.
  // Every conceptual form is complete-query anchored. The only former
  // open-class municipality form is now a current, case-folded municipality
  // identity lookup, so these reviewed forms cannot absorb an appended name,
  // contact field or private residual clause.
  if (reviewedConceptualPublicQuestion
    || isPlainEcologicalResidenceDescriptionQuestion(text)) return false;
  if (reviewedBenignNamedRegulatoryContext
    || reviewedBenignNamedProtectedAreaAdvice) return false;
  // Construction-object nouns are open class. Resolve a directly attached
  // person/possessor before honoring the exact whole-query public grammar;
  // otherwise unrelated name heuristics can also misread “Natura alal”.
  if (hasProtectedAreaPrivateConstructionAssociation) return true;
  // Public-organization contact wording is an availability exception only
  // after the positional private construction/name checks above have first
  // refusal. Keeping it here prevents normalized contact grammar from hiding
  // quoted, title-cased or punctuation-separated private building names.
  if (isReviewedPublicOrganizationProtectedBuildingContactQuery(text)) return false;
  if (hasProtectedAreaOrganizationConstructionContactContext) return true;
  if (estonianGenericRegulatoryConsentQuestion) return false;
  if (hasNamedPrivateResidualClause) return true;
  if (hasRoleLinkedNamedPrivateAssetAssociation) return true;
  if (hasStrongGrammarNamedPrivateAssetAssociation) return true;
  if (contactScope === "private-person" || contactScope === "ambiguous") return true;
  if (explicitPersonalLookup
    && !reviewedComplianceQuestion
    && !reviewedAllPublicAssetQuery
    && !reviewedNamedPublicAssetEnvironmentalQuestion
    && contactScope !== "public-organization"
    && !genericEnvironmentalActivityQuestion
    && !reviewedOpenRolePolicyQuestion
    && !reviewedConceptualPublicQuestion) return true;
  if (reviewedNamedPublicAssetEnvironmentalQuestion) return false;
  // Only apply the open-role policy exemption after every identity,
  // residence, ownership, private-asset and contact detector above has had
  // first refusal. This preserves generic duty questions without allowing
  // their prefix to short-circuit the personal-data boundary.
  if (reviewedOpenRolePolicyQuestion) return false;
  if (contactScope === "public-organization") return false;
  if (genericEnvironmentalActivityQuestion) return false;
  // Keep only reviewed whole-query owner-duty forms public, and only after
  // every named-person, relational-property, private-asset and sensitive-field
  // check above has run. The anchored allowlist cannot absorb extra identity,
  // owner-relation, cadastral or private-asset clauses.
  if (reviewedComplianceQuestion || estonianPublicAggregate) return false;
  return hasPrivateAssetReference && hasPersonOrOwnerPredicate;
}
