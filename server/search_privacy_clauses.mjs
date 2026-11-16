import { canonicalSecurityText } from "./search_query_canonicalization.mjs";
import {
  FOREIGN_SCRIPT_PATTERN,
  normalize,
  queryTerms,
  rootIsDomain,
} from "./search_query_terms.mjs";
import { CADASTRE_PATTERN } from "./search_privacy_protected_area.mjs";
import {
  INSTITUTIONAL_CONTACT_CHANNEL_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_PATTERN,
  PRIVATE_POSTAL_FIELD_PATTERN,
  removeFirstPublicOrganizationName,
} from "./search_privacy_patterns.mjs";
import { isBenignNaturalPersonAttributionClause } from "./search_privacy_public_exceptions.mjs";
function isReviewedPublicOrganizationProtectedPlaceContactQuery(value) {
  const text = canonicalSecurityText(value).trim();
  const withoutPublicOrganization = removeFirstPublicOrganizationName(text).trim();
  if (normalize(withoutPublicOrganization) === normalize(text)
    || CADASTRE_PATTERN.test(text)
    || PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    || PRIVATE_POSTAL_FIELD_PATTERN.test(text)
    || /(?:'s|’s)\s+(?:contact|phone|telephone|email|address|property|parcel|land)\b/iu.test(withoutPublicOrganization)) return false;
  const protectedPlace = String.raw`(?:lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse)`;
  return new RegExp(
    String.raw`^(?:(?:official|public|general)\s+)?contact(?:\s+(?:channel|details|information|point))?\s+(?:for|about|regarding|concerning)\s+(?:the\s+)?${protectedPlace}(?:\s+(?:national\s+park|nature\s+park|rahvuspark|looduspark))?$`,
    "u",
  ).test(normalize(withoutPublicOrganization));
}

function privacyLanguageFold(value) {
  return String(value || "")
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[’‘`´]/gu, "'")
    .replace(/\s+/gu, " ")
    .normalize("NFC")
    .trim();
}

const FOREIGN_PRIVATE_RELATION_PATTERN = new RegExp([
  // Spanish, Portuguese, French, Italian, German, Dutch and Nordic forms.
  String.raw`\b(?:donde\s+)?(?:vive|reside|habita)\b|\b(?:direccion|domicilio)(?:\s+(?:de|particular))?\b|\b(?:posee|propietari[oa]|duen[oa])\b` ,
  String.raw`\b(?:onde\s+)?(?:mora|vive|reside)\b|\benderec[oa](?:\s+(?:de|residencial))?\b|\b(?:possui|proprietari[oa])\b` ,
  String.raw`\b(?:ou\s+)?(?:habite|vit|reside)\b|\b(?:adresse|domicile)(?:\s+(?:de|personnelle?|personnel))?\b|\b(?:possede|proprietaire|appartient\s+a)\b` ,
  String.raw`\b(?:dove\s+)?(?:vive|abita|risiede)\b|\bindirizzo(?:\s+(?:di|privato))?\b|\b(?:possiede|proprietari[oa])\b` ,
  String.raw`\b(?:wo\s+)?(?:wohnt|lebt)\b|\b(?:wohn(?:ort|adresse)|adresse(?:\s+von)?)\b|\b(?:besitzt|eigentumer|gehort\s+zu)\b` ,
  String.raw`\b(?:waar\s+)?(?:woont|leeft)\b|\b(?:woonadres|adres(?:\s+van)?)\b|\b(?:bezit|eigenaar)\b` ,
  String.raw`\b(?:var\s+)?bor\b|\b(?:bostadsadress|adress(?:\s+till)?)\b|\b(?:ager|agare)\b` ,
  String.raw`\b(?:hvor\s+bor|bopel|adresse\s+til|(?:eier|ej er|ejer)\b)` ,
  // Finnish, Polish and the Baltic languages.
  String.raw`\b(?:missa\s+)?(?:asuu|oleskelee)\b|\b(?:kotiosoite|osoite(?:\s+henkilolle)?)\b|\b(?:omistaa|omistaja)\b` ,
  String.raw`\b(?:gdzie\s+)?mieszka\b|\b(?:adres(?:\s+zamieszkania)?)\b|\b(?:posiada|wlasciciel|nalezy\s+do)\b` ,
  String.raw`\b(?:kur\s+dzivo|dzivesvietas\s+adrese|(?:pieder|ipasnieks)\b)` ,
  String.raw`\b(?:kur\s+gyvena|gyvenamosios\s+vietos\s+adresas|(?:priklauso|savininkas)\b)` ,
  // Cyrillic residence, address and ownership constructions.
  String.raw`(?:где\s+(?:живет|живёт|проживает)|место\s+жительства|домашн(?:ий|его)\s+адрес|адрес|(?:владеет|собственник|принадлежит))` ,
  // CJK, Korean and Arabic scripts do not expose reliable title case, so the
  // private relation itself is sufficient at this unsupported-language edge.
  String.raw`(?:住在?哪里|住在哪|居住地|家庭住址|地址是什么|谁拥有|所有者|的(?:家|自宅|住所|住居))` ,
  String.raw`(?:どこに住|どこで暮ら|住所|居住地|誰が所有|所有者|の(?:家|自宅|住所|住居))` ,
  String.raw`(?:어디에\s*사|어디서\s*사|거주지|집\s*주소|주소(?:가\s*어디)?|누가\s*소유|소유자|의\s*(?:집|자택|주소|거주지))` ,
  String.raw`(?:اين\s+(?:يسكن|يعيش)|عنوان(?:\s+(?:المنزل|السكن|[\p{Script=Arabic}]{2,40}))?|محل\s+الاقامة|(?:منزل|بيت|دار|مسكن)\s+[\p{Script=Arabic}]{2,40}|(?:يملك|مالك))` ,
].join("|"), "iu");

const UNREVIEWED_PERSON_NAME_PAIR_PATTERN = /(?<![\p{L}\p{N}])(?:\p{Lu}[\p{Ll}\p{M}'’-]{1,39}|\p{Lu}{2,}[\p{Lu}\p{M}'’-]{1,39})[\s,]+(?:\p{Lu}[\p{Ll}\p{M}'’-]{1,39}|\p{Lu}{2,}[\p{Lu}\p{M}'’-]{1,39})(?![\p{L}\p{N}])/u;

function splitPublicQueryClauses(value) {
  return String(value || "")
    .split(/(?<!\b\p{Lu})\.+|[!?;,¿¡。！？；،]+|\s[-—–−]\s/gu)
    .flatMap((clause) => clause.split(
      /\s+(?:ja|ning|and)\s+(?=(?:(?:mis|millin\w*)\s+on|(?:what|where|which)\s+(?:is|are))\b[\s\S]{0,100}(?:kontakt\w*|contact\w*|telefon\w*|phone\w*|e-?post\w*|email\w*|aadress\w*|address\w*))/giu,
    ))
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function isReviewedPublicOrganizationContactClause(value) {
  const clause = String(value || "").trim();
  const withoutOrganization = removeFirstPublicOrganizationName(clause).trim();
  if (!clause || normalize(withoutOrganization) === normalize(clause)) return false;
  if (!(INSTITUTIONAL_CONTACT_CHANNEL_PATTERN.test(clause)
    || PRIVATE_POSTAL_FIELD_PATTERN.test(clause))) return false;
  return !CADASTRE_PATTERN.test(clause)
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(withoutOrganization)
    && !UNREVIEWED_PERSON_NAME_PAIR_PATTERN.test(withoutOrganization);
}

function isCompleteReviewedPublicOrganizationContactQuestion(value) {
  const text = String(value || "").trim();
  if (!isReviewedPublicOrganizationContactClause(text)) return false;
  const residual = removeFirstPublicOrganizationName(text)
    .replace(/[.?!,;:]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return [
    /^(?:mis|millin\w*)\s+on\s+(?:(?:avalik|ametlik|üldine|üld|uld)\w*\s+)?(?:kontakt\w*|telefoni?\w*|e-?post\w*|aadress\w*)$/iu,
    /^(?:what|where)\s+is\s+(?:the\s+)?(?:(?:official|public|general)\s+)?(?:contact(?:\s+(?:channel|details|information|point))?|phone|telephone|email|address)$/iu,
  ].some((pattern) => pattern.test(residual));
}

function isReviewedForeignLanguageSelectorQuery(value) {
  const text = String(value || "").normalize("NFKC").trim();
  const match = text.match(/^([\s\S]+?)\s+(中文)$/u);
  if (!match || FOREIGN_SCRIPT_PATTERN.test(match[1])) return false;
  return (queryTerms(match[1]).some(rootIsDomain)
      || /(?:vee|metsa?|õhu|ohu|kliima|keskkonna|loodus|jäätm|jaatm)[\p{L}-]*andm/iu.test(match[1]))
    && !UNREVIEWED_PERSON_NAME_PAIR_PATTERN.test(removeFirstPublicOrganizationName(match[1]));
}

export function hasForeignPrivatePersonClause(value) {
  return splitPublicQueryClauses(value).some((clause) => (
    !isReviewedPublicOrganizationContactClause(clause)
      && FOREIGN_PRIVATE_RELATION_PATTERN.test(privacyLanguageFold(clause))
  ));
}

function hasUnsupportedPublicProviderResidual(value) {
  const text = String(value || "").normalize("NFKC").trim();
  if (FOREIGN_SCRIPT_PATTERN.test(text)
    && !isReviewedForeignLanguageSelectorQuery(text)) return true;
  const clauses = splitPublicQueryClauses(value);
  if (clauses.length < 2) return false;
  // Autocomplete accepts arbitrary partial text. The residual rule applies
  // when a reviewed environmental clause could otherwise carry unrelated
  // text across the provider boundary; standalone non-domain text remains
  // governed by the explicit instruction/person/script classifiers.
  const hasEnvironmentalClause = clauses.some((clause) => (
    queryTerms(clause).some(rootIsDomain)
  ));
  if (!hasEnvironmentalClause) return false;
  return clauses.some((clause) => {
    const roots = queryTerms(clause);
    const hasDomainRoot = roots.some(rootIsDomain);
    if (hasDomainRoot) return false;
    if (isReviewedPublicOrganizationContactClause(clause)) return false;
    if (/^\d+(?:[.,]\d+)?$/u.test(clause)) return false;
    if (!UNREVIEWED_PERSON_NAME_PAIR_PATTERN.test(clause)) return false;
    const withoutOrganization = removeFirstPublicOrganizationName(clause).trim();
    return normalize(withoutOrganization) === normalize(clause)
      && !isBenignNaturalPersonAttributionClause(clause);
  });
}

function isReviewedIndependentPublicClause(value) {
  const clause = String(value || "").trim();
  if (!clause || FOREIGN_SCRIPT_PATTERN.test(clause)
    || FOREIGN_PRIVATE_RELATION_PATTERN.test(privacyLanguageFold(clause))) return false;
  if (isReviewedPublicOrganizationContactClause(clause)) return true;
  const withoutOrganization = removeFirstPublicOrganizationName(clause).trim();
  const identityCandidate = withoutOrganization.replace(
    /^(?:kas|kelle|mida|mill(?:ine|al|est)|what|when|where|which|who|why|how|does|do|is|are)\s+/iu,
    "",
  );
  return queryTerms(clause).some(rootIsDomain)
    && !CADASTRE_PATTERN.test(clause)
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(clause)
    && !PRIVATE_POSTAL_FIELD_PATTERN.test(withoutOrganization)
    && !UNREVIEWED_PERSON_NAME_PAIR_PATTERN.test(identityCandidate);
}

function isReviewedPublicClauseComposition(value) {
  const clauses = splitPublicQueryClauses(value);
  return clauses.length > 1
    && clauses.some(isReviewedPublicOrganizationContactClause)
    && clauses.every(isReviewedIndependentPublicClause);
}

// First-person opening of a forest owner question about their own land:
// "kas ma tohin oma metsas", "kuidas me saame oma kinnistul". Group 1 keeps the
// question word; the land word stays in the residual for reclassification.
const OWN_FOREST_FIRST_PERSON_OPENING_PATTERN = /^((?:kas|kuidas|millal|mida|kui)\s+)?(?:ma|mina|me|meie)\s+(?:tohi(?:n|me)|v[õo]i(?:n|me)|pea(?:n|me)|saa(?:n|me)|vaja(?:n|me)|taha(?:n|me)|soovi(?:n|me)|kavatse(?:n|me)|plaani(?:n|me))\s+oma\s+(?=(?:mets|metsa\p{L}*|kinnistu\p{L}*|maa(?:l|lt|le|tüki\p{L}*|tuki\p{L}*)?)(?!\p{L}))/iu;

export {
  isReviewedPublicOrganizationProtectedPlaceContactQuery,
  splitPublicQueryClauses,
  isReviewedPublicOrganizationContactClause,
  isCompleteReviewedPublicOrganizationContactQuestion,
  hasUnsupportedPublicProviderResidual,
  isReviewedPublicClauseComposition,
  OWN_FOREST_FIRST_PERSON_OPENING_PATTERN,
};
