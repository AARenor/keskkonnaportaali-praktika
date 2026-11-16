import {
  REVIEWED_ESTONIAN_COUNTY_SECURITY_SURFACE_SOURCE,
  isReviewedEstonianCountyIdentity,
} from "./municipalities.mjs";
import {
  COUNTY_ASSOCIATION_SEPARATOR_SOURCE,
  COUNTY_PERSON_TOKEN_SOURCE,
  ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE,
  EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE,
  EXPLICIT_PRIVATE_ASSET_IDENTITY_TARGET_PATTERN,
  INSTITUTIONAL_CONTACT_CHANNEL_PATTERN,
  NAMED_PERSON_CADASTRAL_FIELD_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_PATTERN,
  PRIVATE_POSTAL_FIELD_PATTERN,
} from "./search_privacy_patterns.mjs";
import { PERSON_CONTEXT_STOPWORD_PATTERN } from "./search_query_terms.mjs";
import {
  isCompleteReviewedPublicOrganizationContactQuestion,
  isReviewedPublicOrganizationContactClause,
  splitPublicQueryClauses,
} from "./search_privacy_clauses.mjs";
import { firstPublicOrganizationNameMatch } from "./search_privacy_patterns.mjs";
const COUNTY_ASSOCIATION_IDENTITY_SOURCE = String.raw`(?:${REVIEWED_ESTONIAN_COUNTY_SECURITY_SURFACE_SOURCE}|(?:ida|lääne|laane)${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}viru(?:maa)?)`;
const COUNTY_PRIVATE_ASSET_TARGET_SOURCE = String.raw`(?:(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}|(?:private|family|household|personal)\s+${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE}|metsamaa\p{L}*|metsaala\p{L}*|metsa(?:kinnist|pindala|omand|valdus|krunt|maatük|maatuk|maaüks|maauks)\p{L}*|${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}|metsa(?:de)?\s+(?:pindala\w*|suurus\w*|katvus\w*)|(?:forest|woodland)\s+(?:area|cover(?:age)?|property|parcel|plot|land)|${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE})`;
const COUNTY_FOLLOWED_PERSON_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${COUNTY_ASSOCIATION_IDENTITY_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(${COUNTY_PERSON_TOKEN_SOURCE}(?:${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_PERSON_TOKEN_SOURCE}){0,7})${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_PRIVATE_ASSET_TARGET_SOURCE}(?!\p{L})`,
  "iu",
);
const PERSON_FOLLOWED_COUNTY_ASSET_PATTERN = new RegExp(
  String.raw`(?:^|[.!?;:]\s*)[\s\p{Pd}([{'"„“”«»]*(?:(?:palun|please)\s+)?(?:(?:leia|otsi|näita|naita|find|show|search|lookup|mõõda|mooda|selgita|compare|explain)\s+)?(${COUNTY_PERSON_TOKEN_SOURCE}(?:${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_PERSON_TOKEN_SOURCE}){0,5})${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_ASSOCIATION_IDENTITY_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(?:${COUNTY_PERSON_TOKEN_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}){0,3}${COUNTY_PRIVATE_ASSET_TARGET_SOURCE}(?!\p{L})`,
  "iu",
);
const REVIEWED_COUNTY_MARKER_SOURCE = String.raw`(?:maakond|maakonda|maakonna|maakonnas|maakonnast|maakonnale|maakonnal|maakonnaga|maakonnana|maakonnad|maakondade|maakondi|piirkond|piirkonda|piirkonna|piirkonnas|piirkonnast|piirkonnale|piirkonnal|piirkonnaga|piirkonnana|piirkonnad|piirkondade|piirkondi|county|region|regional)`;
const REVIEWED_PUBLIC_FOREST_NOUN_SOURCE = String.raw`(?:mets|metsa|metsade|metsamaa|metsamaad|metsamaal|metsamaale|metsamaalt|metsamaast|metsamaaga|metsaala|metsaala(?:l|le|lt|st|ga))`;
const REVIEWED_PUBLIC_FOREST_METRIC_SOURCE = String.raw`(?:pindala|pindalast|pindalale|pindalaga|suurus|suurusest|suurusele|suurusega|katvus|katvusest|katvusele|katvusega|vanus|vanusest|vanusele|vanusega)`;
const REVIEWED_PUBLIC_FOREST_AGGREGATE_MODIFIER_SOURCE = String.raw`(?:keskmine|keskmise|keskmist|keskmiselt|kogu|riigi|riiklik|riikliku|avalik|avaliku|kaitstud|kaitstav|kaitstava)`;
const REVIEWED_PUBLIC_ENGLISH_FOREST_METRIC_PHRASE_SOURCE = String.raw`(?:forest|woodland)\s+(?:area|cover(?:age)?|age)`;
const COUNTY_ASSOCIATION_PERSON_RESIDUAL_SOURCE = String.raw`${COUNTY_PERSON_TOKEN_SOURCE}(?:${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_PERSON_TOKEN_SOURCE}){0,5}`;
const COUNTY_REQUEST_TOKEN_PATTERN = /^(?:palun|please|leia|otsi|näita|naita|find|show|search|lookup|mõõda|mooda|selgita|compare|explain)$/iu;
const COUNTY_PUBLIC_REQUEST_CONTENT_TOKEN_PATTERN = /^(?:avald\w*|kohustus\w*|nõu\w*|nou\w*|reegl\w*|piirang\w*|õigus\w*|oigus\w*|mõjuta\w*|mojuta\w*|publish\w*|regulat\w*|obligation\w*|requirement\w*|restriction\w*|rules?|guidance|laws?)$/iu;
function normalizeCountyAssociationSecurityTokens(value) {
  return String(value || "")
    .normalize("NFC")
    // U+02BC and U+A78B/U+A78C are letter-category apostrophe lookalikes.
    // Explicitly include default ignorables as well as every non-alphanumeric
    // run so this denial-only grammar has one self-contained token boundary.
    .replace(/(?:\p{Default_Ignorable_Code_Point}|[^\p{L}\p{N}]|[\u02BC\uA78B\uA78C])+/gu, " ")
    .trim();
}
const ASSET_RESIDENT_ROLE_PATTERN = /(?<!\p{L})(?:elanik\w*|residend\w*|rentnik\w*|residents?|occupants?|inhabitants?|tenants?)(?!\p{L})/iu;
const RESIDENTIAL_ASSET_TARGET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}|${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE})(?!\p{L})`,
  "iu",
);
const PRIVATE_ASSET_IDENTITY_FIELD_PATTERN = /(?<!\p{L})(?:nimi\w*|names?|identity\w*|identiteet\w*|kontakt\w*|contact\w*|telefon\w*|phone\w*|telephone\w*|e-?post\w*|email\w*|aadress\w*|address\w*|elukoh\w*|residence\w*|isikukood\w*|ssn)(?!\p{L})/iu;
const ASSET_RESIDENT_IDENTITY_FIELD_PATTERN = /(?<!\p{L})(?:eesnimi\w*|perekonnanimi\w*|täisnimi\w*|taisnimi\w*|vanus\w*|surnames?|age|(?:first|last|full)\s+names?)(?!\p{L})/iu;
const IMPERATIVE_PRIVATE_OWNER_ENUMERATION_PATTERN = /^(?:(?:give|show|list|find|provide)\s+(?:me\s+)?(?:the\s+)?(?:names?\s+of\s+(?:the\s+)?)?(?:all\s+)?(?:(?:registered|current|present|existing|private)\s+)?(?:owners?|landowners?|homeowners?|propertyowners?|forestowners?|proprietors?|landholders?|landlords?|land\s+owners?|home\s+owners?|property\s+owners?|forest\s+owners?|land\s+holders?)|(?:anna|näita|naita|leia|loetle)\s+(?:mulle\s+)?(?:kõigi\s+)?(?:(?:registreeritud|praegune|praegused?|praeguse|era)\s+)?(?:(?:metsa|kinnistu|maa|kodu)\s*)?omanik(?:ud|ke|e(?:\s+nimed)?))[.!?]*$/iu;

function hasAssetResidentIdentityFieldRequest(value) {
  const text = String(value || "");
  return RESIDENTIAL_ASSET_TARGET_PATTERN.test(text)
    && ASSET_RESIDENT_ROLE_PATTERN.test(text)
    && (PRIVATE_ASSET_IDENTITY_FIELD_PATTERN.test(text)
      || ASSET_RESIDENT_IDENTITY_FIELD_PATTERN.test(text)
      || PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
      || PRIVATE_POSTAL_FIELD_PATTERN.test(text));
}

const REVIEWED_COUNTY_PUBLIC_REQUEST_PREFIX_PATTERNS = Object.freeze([
  /^(?:palun\s+)?(?:leia|otsi|näita|naita|mõõda|mooda|selgita|ütle|utle)(?:\s+mulle)?(?=[\s,;:\p{Pd}]|$)/iu,
  /^(?:please\s+)?(?:find|show|search|lookup|compare|explain)(?:\s+me)?(?:\s+the)?(?=[\s,;:\p{Pd}]|$)/iu,
  /^(?:tell|show|give)\s+me(?:\s+the)?(?=[\s,;:\p{Pd}]|$)/iu,
  /^(?:can|could|would)\s+you(?:\s+please)?\s+(?:(?:find|show|search|compare|explain)(?:\s+me)?(?:\s+the)?|tell\s+me(?:\s+the)?)(?=[\s,;:\p{Pd}]|$)/iu,
  /^(?:what\s+is|how\s+(?:much|large|big)\s+is)(?:\s+the)?(?=[\s,;:\p{Pd}]|$)/iu,
  /^(?:kui\s+palju\s+(?:on|oli)|mis\s+on|milline\s+on)(?=[\s,;:\p{Pd}]|$)/iu,
  /^kas\s+(?:(?:sa\s+)?saad|te\s+saate|saaksite)\s+(?:näidata|naidata|leida|selgitada|öelda|oelda)(?:\s+mulle)?(?=[\s,;:\p{Pd}]|$)/iu,
]);
const REVIEWED_COUNTY_FOREST_REQUEST_TARGET_PATTERN = new RegExp(
  String.raw`(?:(?<!\p{L})${COUNTY_ASSOCIATION_IDENTITY_SOURCE}(?!\p{L})[\s\S]{0,192}(?<!\p{L})(?:forest|woodland|mets\p{L}*)(?!\p{L})|(?<!\p{L})(?:forest|woodland|mets\p{L}*)(?!\p{L})[\s\S]{0,192}(?<!\p{L})${COUNTY_ASSOCIATION_IDENTITY_SOURCE}(?!\p{L}))`,
  "iu",
);
const REVIEWED_FOREST_METRIC_OF_COUNTY_PATTERN = new RegExp(
  String.raw`^(?:the\s+)?((?:(?:current|present|latest(?:\s+available)?|today(?:'s)?)\s+)?(?:forest|woodland)\s+(?:area|cover(?:age)?|age))\s+(?:of|in|for)\s+(${COUNTY_ASSOCIATION_IDENTITY_SOURCE})(?!\p{L})([\s\S]*?)\s*[.!?]?$`,
  "iu",
);

function reviewedForestMetricOfCountyCandidate(value) {
  const match = String(value || "").normalize("NFC").trim()
    .match(REVIEWED_FOREST_METRIC_OF_COUNTY_PATTERN);
  if (!match) return null;
  return `${match[2]} ${match[1]} ${match[3] || ""}`
    .replace(/\s+/gu, " ")
    .trim();
}

function stripReviewedCountyPublicRequestPrefix(value) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  for (const pattern of REVIEWED_COUNTY_PUBLIC_REQUEST_PREFIX_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    return text.slice(match[0].length)
      .replace(/^[\s,;:\p{Pd}]+/gu, "")
      .replace(/^the(?:\s+|$)/iu, "")
      .trim();
  }
  return null;
}

function isReviewedCountyPublicRequestPrefix(value) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  if (stripReviewedCountyPublicRequestPrefix(text) === "") return true;
  const prefixTokens = text.match(/\p{L}+/gu) || [];
  return prefixTokens.length > 0
    && prefixTokens.every((token) => (
      COUNTY_REQUEST_TOKEN_PATTERN.test(token)
        || PERSON_CONTEXT_STOPWORD_PATTERN.test(token)
        || COUNTY_PUBLIC_REQUEST_CONTENT_TOKEN_PATTERN.test(token)
    ))
    && prefixTokens.some((token) => (
      COUNTY_REQUEST_TOKEN_PATTERN.test(token)
        || /^(?:kas|kes|kuidas|kus|millal|millin\w*|millis\w*|mis|mida|miks|how|what|when|where|which|why)$/iu.test(token)
    ));
}

function reviewedCountyForestPrefixScope(value) {
  const text = String(value || "")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim();
  const countyPattern = new RegExp(
    String.raw`(?<!\p{L})${COUNTY_ASSOCIATION_IDENTITY_SOURCE}(?!\p{L})`,
    "giu",
  );
  for (const countyMatch of text.matchAll(countyPattern)) {
    const countyIndex = countyMatch.index || 0;
    if (countyIndex === 0) continue;
    const countyQuestion = text.slice(countyIndex).trim();
    if (!isCompleteReviewedCountyPublicForestQuestionOrContactComposition(countyQuestion)) continue;
    const prefix = text.slice(0, countyIndex)
      .replace(/^[\s\p{Pd}([{'"„“”«»]+/gu, "")
      .replace(/[\s,;:\p{Pd}\])}'"„“”«»]+$/gu, "")
      .trim();
    if (isReviewedCountyPublicRequestPrefix(prefix)) return "public-request";
    if (isReviewedPublicOrganizationContactClause(prefix)
      || isCompleteReviewedPublicOrganizationContactQuestion(prefix)) return "public-contact";
    const requestResidual = stripReviewedCountyPublicRequestPrefix(prefix);
    const personCandidate = requestResidual === null ? prefix : requestResidual;
    const prefixMatch = personCandidate.match(new RegExp(
      String.raw`^(${COUNTY_PERSON_TOKEN_SOURCE}(?:${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_PERSON_TOKEN_SOURCE}){0,5})$`,
      "iu",
    ));
    if (prefixMatch && !isReviewedCountyPublicRequestPrefix(prefixMatch[1])) return "person";
    // The token cap limits parsing work; it must not become a fail-open
    // boundary. Once the suffix is a complete reviewed county-forest query,
    // any remaining nonempty prefix that is not a finite public request is an
    // unconsumed identity/prose residual and cannot cross a provider boundary.
    if (personCandidate) return "person";
  }
  return null;
}

function hasCountyShapedPersonAssetAssociation(value) {
  const text = String(value || "");
  // Public meaning is proved by a complete finite grammar, never by treating
  // each token as independently harmless. Token unions allowed repeated or
  // reordered descriptors, arbitrary residual names and marker-like prefixes
  // to inherit a county exception.
  const reviewedPublicText = stripNegatedPrivateContactFields(text)
    .replace(/\s+/gu, " ")
    .replace(/\s+([.?!,;:])/gu, "$1")
    .trim();
  if (isCompleteReviewedCountyPublicForestQuestionOrContactComposition(reviewedPublicText)) return false;
  if (COUNTY_FOLLOWED_PERSON_ASSET_PATTERN.test(text)) return true;
  const reverseMatch = text.match(PERSON_FOLLOWED_COUNTY_ASSET_PATTERN);
  if (!reverseMatch) return false;
  return !isReviewedCountyPublicRequestPrefix(reverseMatch[1]);
}

function hasReviewedCountyDescriptorCompoundPersonAsset(value) {
  const reviewedPublicText = stripNegatedPrivateContactFields(String(value || ""))
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .replace(/\s+([.?!,;:])/gu, "$1")
    .trim();
  if (isCompleteReviewedCountyPublicForestQuestionOrContactComposition(reviewedPublicText)) return false;
  const securityTokenText = normalizeCountyAssociationSecurityTokens(reviewedPublicText);
  // Match only a finite reviewed county surface. The previous two open
  // `(.+?)` captures were both semantically wider and super-linear on long
  // separator runs. Canonical whitespace is collapsed above so default-
  // ignorable boundaries cannot amplify regex work.
  const county = String.raw`(?:${REVIEWED_ESTONIAN_COUNTY_SECURITY_SURFACE_SOURCE})`;
  const patterns = [
    new RegExp(
      String.raw`^${county}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_ASSOCIATION_PERSON_RESIDUAL_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(?:mets|metsa|metsade|metsamaa\p{L}*|metsaala\p{L}*)[\s\S]*$`,
      "iu",
    ),
    new RegExp(
      String.raw`^${county}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_ASSOCIATION_PERSON_RESIDUAL_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(?:forest|woodland)[\s\S]*$`,
      "iu",
    ),
    new RegExp(
      String.raw`^${county}\s+(?:${REVIEWED_PUBLIC_ENGLISH_FOREST_METRIC_PHRASE_SOURCE}|${REVIEWED_PUBLIC_FOREST_NOUN_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE})${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_ASSOCIATION_PERSON_RESIDUAL_SOURCE}\??$`,
      "iu",
    ),
    new RegExp(
      String.raw`^${county}\s+(?:forest|woodland|${REVIEWED_PUBLIC_FOREST_NOUN_SOURCE})${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_ASSOCIATION_PERSON_RESIDUAL_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(?:area|cover(?:age)?|age|${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE})\??$`,
      "iu",
    ),
  ];
  return reviewedCountySensitiveForestResidualCandidates(securityTokenText).some((candidate) => (
    patterns.some((pattern) => pattern.test(candidate))
  ));
}

function hasPrivateAssetIdentityFieldRequest(value) {
  const text = String(value || "");
  const asset = EXPLICIT_PRIVATE_ASSET_IDENTITY_TARGET_PATTERN.exec(text);
  if (!asset) return false;
  const rawTail = text.slice((asset.index || 0) + asset[0].length);
  const tail = stripNegatedPrivateContactFields(
    stripSingleReviewedOrganizationContactField(rawTail),
  );
  return PRIVATE_ASSET_IDENTITY_FIELD_PATTERN.test(tail)
    || PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(tail)
    || PRIVATE_POSTAL_FIELD_PATTERN.test(tail)
    || NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(tail);
}

function stripNegatedPrivateContactFields(value) {
  const replaceUnlessGovernedByNegation = (text, pattern, negatorPattern) => text.replace(
    pattern,
    (match, offset, source) => {
      const boundedPrefix = source.slice(Math.max(0, offset - 160), offset);
      const clausePrefix = boundedPrefix.split(/[.!?;:。！？；]+/u).at(-1) || "";
      return negatorPattern.test(clausePrefix) ? match : " ";
    },
  );
  const withoutEstonianExclusion = replaceUnlessGovernedByNegation(
    String(value || ""),
    /(?<!\p{L})ilma\s+(?:(?:isiklik\w*|omanik\w*|eraisik\w*)\s+)?(?:kontakt\w*|telefoni?\w*|e-?post\w*|aadress\w*)(?!\p{L})/giu,
    /(?<!\p{L})(?:mitte|ega|ei|pole|polnud|ära|ärge)(?!\p{L})/iu,
  );
  return replaceUnlessGovernedByNegation(
    withoutEstonianExclusion,
    /(?<!\p{L})without\s+(?:(?:personal|private|owners?|owner['’]s|tenants?|tenant['’]s)\s+)?(?:contact\w*(?:\s+(?:details?|information))?|phone\w*|telephone\w*|email\w*|address\w*)(?!\p{L})/giu,
    /(?<!\p{L})(?:not|nor|never|no|cannot|can['’]?t|won['’]?t|wouldn['’]?t|shouldn['’]?t|mustn['’]?t|isn['’]?t|aren['’]?t|don['’]?t|doesn['’]?t|didn['’]?t)(?!\p{L})/iu,
  );
}

function isStrictReviewedEstonianCountyIdentity(value) {
  const text = String(value || "").normalize("NFKC").normalize("NFC").trim();
  // Municipality normalization deliberately erases punctuation for search
  // recall. A privacy exception must first prove that the original county
  // surface uses words, whitespace, or one real dash—not `/`, `_`, `.`, `+`,
  // apostrophes, repeated dashes, or other lossy aliases.
  if (!/^[\p{L}\p{M}]+(?:(?:\s+|\s*\p{Pd}\s*)[\p{L}\p{M}]+)*$/u.test(text)) return false;
  return isReviewedEstonianCountyIdentity(text);
}

function isUnambiguousReviewedEstonianCountyIdentity(value) {
  const text = String(value || "").normalize("NFKC").normalize("NFC").trim();
  if (!isStrictReviewedEstonianCountyIdentity(text)) return false;
  if (/^(?:ida|lääne|laane)\s+viru$/iu.test(text)) return false;
  return true;
}

function isCompleteReviewedCountyPrivateAssetEcologyQuestion(value) {
  const clauses = splitPublicQueryClauses(value);
  if (clauses.length < 1 || clauses.length > 2) return false;
  const contactClauses = clauses.filter(isCompleteReviewedPublicOrganizationContactQuestion);
  if (clauses.length === 2 && contactClauses.length !== 1) return false;
  const environmentalClause = clauses.find((clause) => (
    !isCompleteReviewedPublicOrganizationContactQuestion(clause)
  ));
  if (!environmentalClause) return false;
  const patterns = [
    new RegExp(String.raw`^how\s+does\s+(.+?)\s+(?:private|family|household|personal)\s+${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE}\s+(?:affect|impact)\s+(?:biodiversity|habitats?|ecology|ecosystems?|species)(?:\s+(?:diversity|richness))?\??$`, "iu"),
    new RegExp(String.raw`^kuidas\s+m[õo]juta\w*\s+(.+?)\s+(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}\s+(?:elurikk\w*|liigirikk\w*|elupai[kg]\w*|loodus\w*|ökosüsteem\w*)\??$`, "iu"),
    new RegExp(String.raw`^palun\s+selgita\s+(.+?)\s+(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}\s+m[õo]ju\s+(?:elurikk\w*|liigirikk\w*|elupai[kg]\w*|loodus\w*|ökosüsteem\w*)\??$`, "iu"),
  ];
  for (const pattern of patterns) {
    const match = environmentalClause.trim().match(pattern);
    if (match && isUnambiguousReviewedEstonianCountyIdentity(match[1])) return true;
  }
  return false;
}

function hasReviewedCountyPrivateAssetEcologySensitiveResidual(value) {
  const text = String(value || "").trim();
  const patterns = [
    new RegExp(String.raw`^how\s+does\s+(.+?)\s+(?:private|family|household|personal)\s+${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE}\s+(?:affect|impact)\s+(?:biodiversity|habitats?|ecology|ecosystems?|species)(?:\s+(?:diversity|richness))?([\s\S]*)$`, "iu"),
    new RegExp(String.raw`^kuidas\s+m[õo]juta\w*\s+(.+?)\s+(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}\s+(?:elurikk\w*|liigirikk\w*|elupai[kg]\w*|loodus\w*|ökosüsteem\w*)([\s\S]*)$`, "iu"),
    new RegExp(String.raw`^palun\s+selgita\s+(.+?)\s+(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}\s+m[õo]ju\s+(?:elurikk\w*|liigirikk\w*|elupai[kg]\w*|loodus\w*|ökosüsteem\w*)([\s\S]*)$`, "iu"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !isUnambiguousReviewedEstonianCountyIdentity(match[1])) continue;
    const residual = stripNegatedPrivateContactFields(match[2])
      .replace(/^[\s,.!?;:—–−-]+/gu, "")
      .replace(/^(?:ja|ning|and)\s+/iu, "")
      .trim();
    if (!residual || isCompleteReviewedPublicOrganizationContactQuestion(residual)) return false;
    return true;
  }
  return false;
}

function isCompleteReviewedCountyPrivateAssetAggregateQuestion(value) {
  const text = String(value || "").trim();
  const unambiguousCountyPatterns = [
    new RegExp(String.raw`^(.+?)\s+(?:private|family|household|personal)\s+(?:forest|woodland|land|property)\s+(?:area|cover(?:age)?)(?:\s+(?:aggregate|data|statistics))?\??$`, "iu"),
    new RegExp(String.raw`^how\s+to\s+publish\s+(.+?)\s+(?:private|family|household|personal)\s+(?:forest|woodland|land|property)\s+(?:area|cover(?:age)?)(?:\s+(?:aggregate|data|statistics))?\??$`, "iu"),
    new RegExp(String.raw`^(.+?)\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\??$`, "iu"),
    new RegExp(String.raw`^(.+?)\s+${REVIEWED_PUBLIC_FOREST_NOUN_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE}\??$`, "iu"),
    new RegExp(String.raw`^(.+?)\s+(?:average|total|overall|state|public|protected)\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\??$`, "iu"),
    new RegExp(String.raw`^(.+?)\s+${REVIEWED_PUBLIC_FOREST_AGGREGATE_MODIFIER_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_NOUN_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE}\??$`, "iu"),
  ];
  if (unambiguousCountyPatterns.some((pattern) => {
    const match = text.match(pattern);
    return Boolean(match && isUnambiguousReviewedEstonianCountyIdentity(match[1]));
  })) return true;
  const explicitCountyPatterns = [
    new RegExp(String.raw`^(.+?)\s+(?:county|region|regional)\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\??$`, "iu"),
    new RegExp(String.raw`^(.+?)\s+${REVIEWED_COUNTY_MARKER_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_NOUN_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE}\??$`, "iu"),
  ];
  return explicitCountyPatterns.some((pattern) => {
    const match = text.match(pattern);
    return Boolean(match && isStrictReviewedEstonianCountyIdentity(match[1]));
  });
}

function isCompleteReviewedCountyForestAgeQuestion(value) {
  const text = String(value || "").trim();
  const patterns = [
    /^(.+?)\s+(?:(?:private|public|state|protected)\s+)?(?:forest|woodland)\s+(?:(?:average|mean)\s+)?age(?:\s+(?:distribution|trend))?\??$/iu,
    /^(.+?)\s+(?:average|mean)\s+(?:(?:private|public|state|protected)\s+)?(?:forest|woodland)\s+age\??$/iu,
  ];
  return patterns.some((pattern) => {
    const match = text.match(pattern);
    return Boolean(match && isUnambiguousReviewedEstonianCountyIdentity(match[1]));
  });
}

function isCompleteReviewedCountyForestCategoryQuestion(value) {
  const text = String(value || "").trim();
  // Keep category phrases finite and grammatical. Prefix-wide descriptor
  // matching would also accept person-name collisions such as Young Old or
  // Estonian compounds such as vanamehe/noormehe and release them upstream.
  const descriptor = String.raw`(?:vana|vanad|vanade|noor|noore|noored|noorte|looduslik|loodusliku|põlis|polis|kliimamuutuse|natura|majandatav|majandamata|segamets|segapuistu|okasmets|lehtmets|väärtuslik|vaartuslik|taastuv|kuivendatud|kahjustatud|tulekahjustatud|(?:ökoloogiliselt|okoloogiliselt)\s+(?:väärtuslik|vaartuslik)|(?:männi|manni|kuuse|kase|lehtpuu|okaspuu)\s+enamusega)`;
  const forest = REVIEWED_PUBLIC_FOREST_NOUN_SOURCE;
  const metric = String.raw`(?:\s+${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE})?`;
  const unambiguousMatch = text.match(new RegExp(
    String.raw`^(.+?)\s+${descriptor}\s+${forest}${metric}\??$`,
    "iu",
  ));
  if (unambiguousMatch
    && isUnambiguousReviewedEstonianCountyIdentity(unambiguousMatch[1])) return true;
  const explicitMatch = text.match(new RegExp(
    String.raw`^(.+?)\s+${REVIEWED_COUNTY_MARKER_SOURCE}\s+${descriptor}\s+${forest}${metric}\??$`,
    "iu",
  ));
  if (explicitMatch && isStrictReviewedEstonianCountyIdentity(explicitMatch[1])) return true;
  const englishDescriptor = String.raw`(?:ecological|natural|valuable|restored|damaged|drained|mixed|coniferous|deciduous|old|young|climate[-\s]+resilient)`;
  const englishMatch = text.match(new RegExp(
    String.raw`^(.+?)\s+${englishDescriptor}\s+(?:forest|woodland)(?:\s+(?:area|cover(?:age)?|age))?\??$`,
    "iu",
  ));
  return Boolean(englishMatch
    && isUnambiguousReviewedEstonianCountyIdentity(englishMatch[1]));
}

const REVIEWED_COUNTY_PUBLIC_COMPLEMENT_CATEGORY_SOURCES = Object.freeze([
  String.raw`(?<![\p{L}\p{N}])(?:(?:in|for|during|as\s+of)\s+)?(?:19|20)\d{2}\.?(?:\s+(?:aasta|aastal))?(?![\p{L}\p{N}])`,
  String.raw`(?<![\p{L}\p{N}])(?:current|present|latest(?:\s+available)?|available|today(?:'s)?|this\s+year|now|currently|praegune|praeguse|uusim|uusima|viimane|viimase|tänane|tanane|tänapäeval|tanapaeval|praegu|uusima\s+seisuga)(?![\p{L}\p{N}])`,
  String.raw`(?<![\p{L}\p{N}])(?:(?:in\s+)?(?:hectares?|ha|acres?|percent|percentage|square\s+kilomet(?:er|re)s?|km(?:2|²)|square\s+miles?)|hektarites|hektarit|hektareid|protsentides|protsenti|ruutkilomeetrites)(?![\p{L}\p{N}])`,
]);

function reviewedCountyPublicForestParts(value) {
  const text = String(value || "").normalize("NFC").trim();
  const boundaries = [text.length, ...[...text.matchAll(/\s+/gu)].map((match) => match.index)]
    .sort((left, right) => right - left);
  for (const boundary of boundaries) {
    const county = text.slice(0, boundary).trim();
    if (!isStrictReviewedEstonianCountyIdentity(county)) continue;
    if (county.length >= text.length) return null;
    return { county, remainder: text.slice(county.length).trim() };
  }
  return null;
}

function reviewedCountyComplementSpans(remainder) {
  return REVIEWED_COUNTY_PUBLIC_COMPLEMENT_CATEGORY_SOURCES.map((source) => (
    [...remainder.matchAll(new RegExp(source, "giu"))].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }))
  ));
}

function removeReviewedCountyComplementSpans(value, spans) {
  let result = String(value || "");
  for (const span of [...spans].sort((left, right) => right.start - left.start)) {
    result = `${result.slice(0, span.start)} ${result.slice(span.end)}`;
  }
  return result
    .replace(/\s+/gu, " ")
    .replace(/\s+([.!?])/gu, "$1")
    .replace(/[.!?]+$/u, "")
    .trim();
}

function reviewedCountyPublicForestComplementCandidates(value) {
  const text = String(value || "").normalize("NFC").trim();
  const parts = reviewedCountyPublicForestParts(text);
  if (!parts) return [text];
  const { county, remainder } = parts;
  const categorySpans = reviewedCountyComplementSpans(remainder)
    .map((spans, category) => spans.map((span) => ({ ...span, category })));
  const remainders = new Set([remainder]);
  // Complements are grammatical slots, not a bag of harmless words. A
  // freshness/year modifier may precede the forest phrase; a unit or time/year
  // modifier may follow it. A trailing numeric year and unit may appear in
  // either order. Multiple same-category spans are never erased, and a
  // freshness+unit pair is never erased on the same side of the forest phrase:
  // “Current Acres” is person-shaped, while “current forest area hectares” is
  // an ordinary public query whose two complements occupy opposite slots.
  if (categorySpans.some((spans) => spans.length > 1)) return [text];
  const availableSpans = categorySpans.flat();
  const hasOnlyWhitespace = (start, end) => /^\s*$/u.test(remainder.slice(start, end));
  const hasOnlyTerminalPunctuation = (start) => /^[\s.!?]*$/u.test(remainder.slice(start));
  const isValidSlotComposition = (selected) => {
    const spans = [...selected].sort((left, right) => left.start - right.start);
    for (const prefixCount of [0, 1]) {
      const prefix = spans.slice(0, prefixCount);
      const suffix = spans.slice(prefixCount);
      if (prefix.length === 1
        && (prefix[0].category === 2 || prefix[0].start !== 0)) continue;
      if (suffix.length > 2) continue;
      if (suffix.length > 0) {
        if (!hasOnlyTerminalPunctuation(suffix.at(-1).end)) continue;
        if (suffix.slice(0, -1).some((span, index) => (
          !hasOnlyWhitespace(span.end, suffix[index + 1].start)
        ))) continue;
        if (suffix.length === 2) {
          const categories = suffix.map((span) => span.category).sort();
          if (categories[0] !== 0 || categories[1] !== 2) continue;
        }
      }
      const coreStart = prefix.length === 1 ? prefix[0].end : 0;
      const coreEnd = suffix.length > 0 ? suffix[0].start : remainder.length;
      if (coreStart >= coreEnd || !remainder.slice(coreStart, coreEnd).trim()) continue;
      return true;
    }
    return false;
  };
  for (let mask = 1; mask < (1 << availableSpans.length); mask += 1) {
    const selected = availableSpans.filter((_span, index) => mask & (1 << index));
    if (!isValidSlotComposition(selected)) continue;
    const candidate = removeReviewedCountyComplementSpans(remainder, selected);
    if (candidate) remainders.add(candidate);
  }
  return [...remainders].map((candidate) => `${county} ${candidate}`.trim());
}

function reviewedCountySensitiveForestResidualCandidates(value) {
  const text = String(value || "").normalize("NFC").trim();
  const parts = reviewedCountyPublicForestParts(text);
  if (!parts) return [text];
  const { county, remainder } = parts;
  const categorySpans = reviewedCountyComplementSpans(remainder);
  const allSpans = categorySpans.flat();
  const remainders = new Set(
    reviewedCountyPublicForestComplementCandidates(text)
      .map((candidate) => candidate.slice(county.length).trim()),
  );
  for (const spans of categorySpans) {
    if (spans.length > 0) remainders.add(removeReviewedCountyComplementSpans(remainder, spans));
    for (const span of spans) remainders.add(removeReviewedCountyComplementSpans(remainder, [span]));
  }
  if (allSpans.length > 0) remainders.add(removeReviewedCountyComplementSpans(remainder, allSpans));
  return [...remainders]
    .filter(Boolean)
    .slice(0, 32)
    .map((candidate) => `${county} ${candidate}`.trim());
}

function isCompleteReviewedCountyPublicForestQuestion(value) {
  return reviewedCountyPublicForestComplementCandidates(value).some((text) => (
    isCompleteReviewedCountyPrivateAssetEcologyQuestion(text)
      || isCompleteReviewedCountyForestAgeQuestion(text)
      || isCompleteReviewedCountyForestCategoryQuestion(text)
      || isCompleteReviewedCountyPrivateAssetAggregateQuestion(text)
  ));
}

function isCompleteReviewedCountyPublicForestQuestionOrContactComposition(value) {
  const text = String(value || "").trim();
  if (isCompleteReviewedCountyPublicForestQuestion(text)) return true;
  const clauses = splitPublicQueryClauses(text);
  if (clauses.length !== 2) return false;
  return clauses.filter(isCompleteReviewedCountyPublicForestQuestion).length === 1
    && clauses.filter((clause) => (
      isReviewedPublicOrganizationContactClause(clause)
        || isCompleteReviewedPublicOrganizationContactQuestion(clause)
    )).length === 1;
}

function stripSingleReviewedOrganizationContactField(value) {
  const text = String(value || "");
  if (!isReviewedPublicOrganizationContactClause(text)) return text;
  const organization = firstPublicOrganizationNameMatch(text);
  if (!organization) return text;
  const afterOrganizationIndex = organization.index + organization.text.length;
  const afterOrganization = text.slice(afterOrganizationIndex);
  const candidates = [
    INSTITUTIONAL_CONTACT_CHANNEL_PATTERN.exec(afterOrganization),
    PRIVATE_POSTAL_FIELD_PATTERN.exec(afterOrganization),
  ].filter(Boolean).sort((left, right) => left.index - right.index);
  const contact = candidates[0];
  if (!contact) return text;
  const contactIndex = afterOrganizationIndex + contact.index;
  return `${text.slice(0, contactIndex)} ${text.slice(contactIndex + contact[0].length)}`;
}

export {
  hasAssetResidentIdentityFieldRequest,
  reviewedForestMetricOfCountyCandidate,
  stripReviewedCountyPublicRequestPrefix,
  reviewedCountyForestPrefixScope,
  hasCountyShapedPersonAssetAssociation,
  hasReviewedCountyDescriptorCompoundPersonAsset,
  hasPrivateAssetIdentityFieldRequest,
  stripNegatedPrivateContactFields,
  hasReviewedCountyPrivateAssetEcologySensitiveResidual,
  isCompleteReviewedCountyPrivateAssetEcologyQuestion,
  isCompleteReviewedCountyForestAgeQuestion,
  isCompleteReviewedCountyForestCategoryQuestion,
  isCompleteReviewedCountyPrivateAssetAggregateQuestion,
  isCompleteReviewedCountyPublicForestQuestion,
  isCompleteReviewedCountyPublicForestQuestionOrContactComposition,
  IMPERATIVE_PRIVATE_OWNER_ENUMERATION_PATTERN,
  REVIEWED_COUNTY_FOREST_REQUEST_TARGET_PATTERN,
};
