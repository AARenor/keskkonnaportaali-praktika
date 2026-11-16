const PERSONAL_LOOKUP_PATTERNS = Object.freeze([
  /\baadressil\b[\s\S]{0,80}\b(?:elab|elanikk?[\p{L}\p{N}_-]*|isik[\p{L}\p{N}_-]*|keegi)\b/iu,
  /\b(?:kodune\s+aadress[\p{L}\p{N}_-]*|kodu\s+asukoht[\p{L}\p{N}_-]*)\b/iu,
  /\b(?:konkreetse|kindla)\s+(?:inimese|isiku|eraisiku)\b[\s\S]{0,80}\b(?:puurkaev[\p{L}\p{N}_-]*|kinnist[\p{L}\p{N}_-]*|aadress[\p{L}\p{N}_-]*|andm[\p{L}\p{N}_-]*)/iu,
  /\bkes\s+elab\b[\s\S]{0,60}\b[\p{L}'’-]{2,40}\s+\d{1,4}[a-z]?\b/iu,
  /\belanike?\s+nime[\p{L}\p{N}_-]*\b/iu,
  /\b(?:kellele\s+kuulub|omaniku\s+nimi|kes\s+on[\s\S]{0,40}\bomanik)\b[\s\S]{0,100}\b(?:katastri[\p{L}\p{N}_:-]*|kinnist[\p{L}\p{N}_-]*|maa(?:u|ü)ksus[\p{L}\p{N}_:-]*|puurkaev[\p{L}\p{N}_-]*|aadress[\p{L}\p{N}_-]*)/iu,
  /\b(?:leia|otsi|näita|naita)\s+[\p{L}'’-]{2,40}\s+[\p{L}'’-]{2,40}\s+(?:kinnist[\p{L}\p{N}_-]*|maat[\p{L}\p{N}_-]*|maa(?:u|ü)ksus[\p{L}\p{N}_-]*|aadress[\p{L}\p{N}_-]*|puurkaev[\p{L}\p{N}_-]*)\b/iu,
]);
const ENGLISH_OWNER_ENUMERATION_ACTION_PATTERN = /\b(?:list|show|find|identify|return|give|provide|reveal|disclose|name|enumerate|display)\b[\s\S]{0,100}\b(?:(?:all|the|private|current|registered)\s+){0,4}(?:owners?|landowners?|homeowners?|proprietors?|landholders?|landlords?)\b[\s\S]{0,100}\b(?:register|registry|database|permits?|properties|property|parcels?|plots?|land|houses?|homes?|farms?|wells?|boreholes?|buildings?|dwellings?)\b/iu;
const ENGLISH_WHO_OWNER_ASSET_PATTERN = /\bwho\s+(?:is|are)\s+(?:(?:all|the|private|current|registered)\s+){0,4}(?:owners?|landowners?|homeowners?|proprietors?|landholders?|landlords?)\s+of\b[\s\S]{0,80}\b(?:properties|property|parcels?|plots?|land|houses?|homes?|farms?|wells?|boreholes?|buildings?|dwellings?)\b/iu;
const ENGLISH_PERSONAL_LOOKUP_PATTERNS = Object.freeze([
  ENGLISH_OWNER_ENUMERATION_ACTION_PATTERN,
  ENGLISH_WHO_OWNER_ASSET_PATTERN,
  // Ownership and occupancy questions can turn an otherwise ordinary
  // environmental term into a private-person registry lookup. Keep these
  // patterns independent of the domain vocabulary so every admitted English
  // root receives the same pre-retrieval privacy treatment.
  /\bwho\s+(?:owns?|is\s+the\s+(?:registered\s+)?owner\s+of)\b[\s\S]{0,120}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|cadastral\s+(?:unit|parcel)|street\s+address)\b/iu,
  /\bwho\s+(?:currently\s+)?(?:lives?|resides?|stays?)\s+(?:at|on)\b/iu,
  /\bwhat\s+is\s+[\p{L}'’-]{2,40}\s+[\p{L}'’-]{2,40}(?:'s|’s)\s+(?:home\s+)?(?:address|residence|phone|telephone|email|contact(?:\s+(?:details|information))?)\b/iu,
  /\b(?:name|identity|address|phone|telephone|email|contact(?:\s+(?:details|information))?)\s+of\s+the\s+(?:owner|resident|occupant|landowner|homeowner)\b/iu,
  /\b(?:owner|resident|occupant|landowner|homeowner)(?:'s|’s)?\s+(?:name|identity|address|phone|telephone|email|contact(?:\s+(?:details|information))?)\b/iu,
  /\b(?:find|identify|locate|show|give|tell)\b[\s\S]{0,100}\b(?:private\s+person|individual|resident|occupant|landowner|homeowner)\b[\s\S]{0,100}\b(?:property|parcel|plot|land|house|home|farm|well|borehole|address|phone|telephone|email|contact)\b/iu,
  /\b(?:(?:can\s+you\s+|please\s+)?(?:tell(?:\s+me)?|look\s*up|lookup|find|identify|show|provide|reveal|disclose|get|give)|i\s+need)\b[\s\S]{0,100}\b(?:owner|landowner|homeowner)\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)\b/iu,
  /\bwhose\s+(?:(?:forest|woodland|land|cadastral|private)\s+){0,2}(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)\b/iu,
  /\bwho\s+(?:rents?|leases?|uses?|holds?)\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)\b/iu,
  /\bwho\s+is\s+the\s+(?:tenant|lessee|renter|occupant)\s+of\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)\b/iu,
  /\b(?:name|identity|contact)\s+of\s+the\s+(?:tenant|lessee|renter|occupant)\s+of\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)\b/iu,
  /\bwho\s+is\s+(?:the\s+)?(?:proprietor|landholder|landlord|resident|occupant|inhabitant)\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|address|street)\b/iu,
  /\bwho\s+(?:currently\s+)?inhabits?\s+(?:at|on)?\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|address|street)\b/iu,
  /\b(?:list|show|find|identify|return|give|provide|reveal|disclose|name|enumerate|display)\b[\s\S]{0,80}\bprivate\s+(?:owners?|landowners?|homeowners?|residents?|individuals?|people|persons?)\b[\s\S]{0,80}\b(?:register|registry|database|permits?)\b/iu,
  /\b(?:list|show|find|identify|return|give|provide|reveal|disclose)\b[\s\S]{0,80}\b(?:names?|identities)\s+of\s+(?:all\s+)?(?:owners?|landowners?|homeowners?|residents?)\b[\s\S]{0,80}\b(?:register|registry|database)\b/iu,
  /\b(?:which|what)\s+(?:individuals?|people|persons?|owners?|landowners?|homeowners?)\s+(?:own|hold|lease|rent)\w*\b[\s\S]{0,80}\b(?:properties|parcels|plots|land|houses|homes|farms|wells|boreholes)\b/iu,
  /\bwho\s+are\s+(?:the\s+)?(?:private\s+)?(?:owners?|landowners?|homeowners?)\s+of\b[\s\S]{0,80}\b(?:properties|parcels|plots|land|houses|homes|farms|wells|boreholes)\b/iu,
  /\b(?:locate|find|identify)\s+[\p{L}'’-]{2,40}\s+[\p{L}'’-]{2,40}\s+(?:home|address|residence|property|parcel)\b[\s\S]{0,80}\b(?:register|registry|database)\b/iu,
]);
const ENGLISH_PERSON_TOKEN_SOURCE = String.raw`(?:\p{L}\.?|[\p{L}][\p{L}'’]{1,39})`;
const ENGLISH_PERSON_SEPARATOR_SOURCE = String.raw`(?:[\s\p{Pd}./·:_]+)`;
const ENGLISH_PERSON_NAME_SOURCE = String.raw`${ENGLISH_PERSON_TOKEN_SOURCE}${ENGLISH_PERSON_SEPARATOR_SOURCE}${ENGLISH_PERSON_TOKEN_SOURCE}(?:${ENGLISH_PERSON_SEPARATOR_SOURCE}${ENGLISH_PERSON_TOKEN_SOURCE})?`;
const ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE = String.raw`\p{Lu}[\p{Ll}'’]{1,39}${ENGLISH_PERSON_SEPARATOR_SOURCE}\p{Lu}[\p{Ll}'’]{1,39}(?:${ENGLISH_PERSON_SEPARATOR_SOURCE}\p{Lu}[\p{Ll}'’]{1,39})?`;
const ENGLISH_PRIVATE_ASSET_SOURCE = String.raw`(?:(?:(?:the|this|that|specific|private|privately\s+held|nonpublic|non[-\s]+government|isolated|secluded|protected|neighbor(?:ing)?|neighbour(?:ing)?|adjacent|adjoining|separate|separately\s+held|independent(?:ly\s+held)?|unrelated|family|household|residential|farm|forest|woodland|land|cadastral|groundwater|riverside|riverbank|lakeshore|waterside|shoreline|creekside|marsh|wetland|meadow)\s+){0,4}(?:property|parcel|plot|lot|estate|land|unit|house|home|farm|farmhouse|farmstead|well|borehole|wetland|marsh|meadow|pond|building|dwelling|cottage|premises|site|installation|landholding|holding|forest|woodland))`;
const ENGLISH_NAMED_POSSESSIVE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PERSON_NAME_SOURCE}(?:'s|’s)\s+${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "iu",
);
const ENGLISH_NAMED_ASSET_ASSOCIATION_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE}\s+${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "u",
);
const ENGLISH_ASSET_TO_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PRIVATE_ASSET_SOURCE}\b[\s\S]{0,40}\b(?:registered\s+(?:to|under)|recorded\s+under|belongs?\s+to|owned\s+by|held\s+by|associated\s+with|connected\s+to|linked\s+to)\s+${ENGLISH_PERSON_NAME_SOURCE}(?!\p{L})`,
  "iu",
);
const ENGLISH_ASSET_IN_PERSON_NAME_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PRIVATE_ASSET_SOURCE}\b[\s\S]{0,30}\b(?:registered|recorded)\s+in\s+${ENGLISH_PERSON_NAME_SOURCE}(?:'s|’s)\s+name\b`,
  "iu",
);
const ENGLISH_PERSON_TO_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PERSON_NAME_SOURCE}\s+(?:has|holds?|rents?|leases?|uses?)\s+(?:an?\s+|the\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "iu",
);
const NAMED_PERSON_CADASTRAL_FIELD_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE}\s+(?:cadastral\s+(?:[Ii][Dd]|parcel|unit|number|identifier)|katastri\w*)(?!\p{L})`,
  "u",
);
const ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN = new RegExp(
  String.raw`(?<!\p{L})([\p{L}][\p{L}'’.-]{1,39})\s+([\p{L}][\p{L}'’.-]{1,39})\s+(?:(?:cadastral|katastri)\s+(?:id|parcel|unit|number|identifier)|(?:parcel|unit|property|plot|land)\s+(?:id|number|identifier))(?!\p{L})`,
  "giu",
);
const CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\p{N}])\d{5}:\d{3}:\d{4}\s+(?:(?:for|of|to)|(?:owned|held|managed|registered|recorded|assigned|attributed|linked|associated)\s+(?:by|for|to|under|with))\s+(?:the\s+)?(${ENGLISH_PERSON_NAME_SOURCE})(?=$|[\s]*[.?!,;:])`,
  "giu",
);
const GENERIC_CADASTRAL_FIELD_PREFIXES = new Set([
  "cadastral parcel", "cadastral unit", "find the", "forest area", "forest cover",
  "forest register", "is the", "land parcel", "land register", "official register",
  "public register", "search the", "show the", "what is", "woodland area", "woodland cover",
]);

const ENGLISH_PERSON_ROLE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PERSON_NAME_SOURCE}\s+is\s+(?:(?:listed|recorded)\s+as\s+)?(?:the\s+)?(?:owner|landowner|homeowner|tenant|lessee|renter|occupant)\s+of\s+(?:an?\s+|the\s+|this\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "iu",
);
const ENGLISH_PERSON_APPOSITIVE_ROLE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PERSON_NAME_SOURCE}\s*,\s*(?:the\s+)?(?:owner|landowner|landholder|proprietor|tenant|lessee|renter|occupant|manager|operator|custodian|administrator|authorized\s+user|responsible\s+person)\s+of\s+(?:an?\s+|the\s+|this\s+|that\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "iu",
);
const ENGLISH_WHERE_RESIDENCE_PATTERN = new RegExp(
  String.raw`\bwhere\s+(?:does|is)\s+(${ENGLISH_PERSON_NAME_SOURCE})\s+(?:live|living|reside|residing|stay|staying)\b`,
  "iu",
);
const ENGLISH_WHERE_FOUND_PATTERN = new RegExp(
  String.raw`\bwhere\s+can\s+(${ENGLISH_PERSON_NAME_SOURCE})\s+be\s+found\b`,
  "iu",
);
const ENGLISH_WHERE_LOCATED_PATTERN = new RegExp(
  String.raw`\bwhere\s+is\s+(${ENGLISH_PERSON_NAME_SOURCE})\s+located\b[\s\S]{0,80}\b(?:forest|woodland|natura|protected|river|lake|sea|address|property|parcel|well|borehole)\b`,
  "iu",
);
const ENGLISH_LOCATE_PERSON_PATTERN = new RegExp(
  String.raw`\b(?:find|locate)\s+(${ENGLISH_PERSON_NAME_SOURCE})\b[\s\S]{0,60}\b(?:near|at|in)\b[\s\S]{0,50}\b(?:forest|woodland|natura|protected|river|lake|sea|address|property|parcel|well|borehole)\b`,
  "iu",
);
export const PUBLIC_ORGANIZATION_PATTERN = /(?<![\p{L}\p{N}])(?:[\p{L}-]*(?:amet|agentuur|ministeerium|keskus|linnavalitsus|vallavalitsus|omavalitsus|ülikool|instituut|selts|ühing|sihtasutus|osaühing|aktsiaselts|teenistus|muuseum)[\p{L}-]*|(?:environment(?:al)?|climate|forest|nature|water|land|health|statistics)\s+(?:board|agency|ministry|authority|service|institute|university|museum|centre|center)|municipalit\w*|ministry\s+of\s+(?:climate|the\s+environment)|EELIS\w*|keskkonnaseire\s+infos[üu]steem\w*|RMK|KIK|Tallinna\s+Vesi|Eesti\s+Energia|Eesti\s+Geoloogiateenistus[\p{L}-]*|Elering(?:\s+AS)?)(?![\p{L}\p{N}])/iu;
const PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS = Object.freeze([
  /\b(?:eesti\s+)?keskkonnauuringute\s+keskus[\p{L}-]*\b/giu,
  /\b(?:kohalik\w*\s+)?omavalitsus[\p{L}-]*\b/giu,
  /\bmunicipalit\w*\b/giu,
  /\b(?:euroopa\s+)?keskkonnaagentuur[\p{L}-]*\b/giu,
  /\bkeskkonnaamet[\p{L}-]*\b/giu,
  /\bkeskkonnaportaal[\p{L}-]*\b/giu,
  /\beelis\w*\b/giu,
  /\bkeskkonnaseire\s+infos[üu]steem[\p{L}-]*\b/giu,
  /\bkliimaministeerium[\p{L}-]*\b/giu,
  /\bmaa-?\s+ja\s+ruumiamet[\p{L}-]*\b/giu,
  /\briigi\s+teataja[\p{L}-]*\b/giu,
  /\briigimetsa\s+majandamise\s+keskus[\p{L}-]*\b/giu,
  /\bstatistikaamet[\p{L}-]*\b/giu,
  /\bterviseamet[\p{L}-]*\b/giu,
  /\btallinna\s+(?:vesi|vee)[\p{L}-]*\b/giu,
  /\btartu\s+ülikool[\p{L}-]*\b/giu,
  /\btartu\s+keskkonna(?:hariduse\s+)?keskus[\p{L}-]*\b/giu,
  /\bpõllumajandus-?\s+ja\s+toiduamet[\p{L}-]*\b/giu,
  /\beesti\s+geoloogiateenistus[\p{L}-]*\b/giu,
  /\bkeskkonna\s+investeeringute\s+keskus[\p{L}-]*\b/giu,
  /\briigi\s+ilmateenistus[\p{L}-]*\b/giu,
  /\beesti\s+loodusmuuseum[\p{L}-]*\b/giu,
  /\bestonian\s+environment(?:al)?\s+(?:board|agency|research\s+centre)\b/giu,
  /\beuropean\s+environment(?:al)?\s+(?:board|agency)\b/giu,
  /\beuropean\s+forest\s+service\b/giu,
  /\beuropean\s+climate\s+ministry\b/giu,
  /\benvironment(?:al)?\s+(?:board|agency)\b/giu,
  /\bforest\s+service\b/giu,
  /\bclimate\s+ministry\b/giu,
  /\bministry\s+of\s+(?:climate|the\s+environment)\b/giu,
  /\btallinn(?:a)?\s+city\s+(?:environment(?:al)?\s+)?office\b/giu,
  /\buniversity\s+of\s+tartu\b/giu,
  /\bstatistics\s+estonia\b/giu,
  /\bestonian\s+(?:health|land)\s+board\b/giu,
  /\beesti\s+energia\b/giu,
  /\belering(?:\s+as)?\b/giu,
  /\b(?:rmk|kik)\b/giu,
]);
const PUBLIC_ORGANIZATION_NAME_PATTERNS = Object.freeze([
  ...PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS,
  // A capitalized proper-name span ending in an institutional designator is
  // an organization, even when it is not one of the catalogue's known
  // agencies. Removing the whole span prevents names such as "Blue Valley
  // Agency" and "North District Team" from being reinterpreted as people.
  /(?<![\p{L}\p{N}])(?:\p{Lu}[\p{L}'’.-]{1,39}\s+){1,4}?(?:[Aa]genc(?:y|ies)|[Aa]ssociations?|[Aa]uthorit(?:y|ies)|[Tt]eam|[Oo]ffice|[Dd]epartment|[Ss]ervice|[Oo]rgani[sz]ation|[Ii]nstitutes?|[Ii]nstitution|[Uu]niversity|[Cc]ouncil|[Bb]oard|[Cc]ommission|[Cc]ommittees?|[Cc]oalition|[Aa]lliance|[Pp]artnership|[Cc]onsortium|[Cc]ooperatives?|[Cc]orporation|[Cc]ompany|[Ff]ederations?|[Ff]oundation|[Tt]rust|[Nn]onprofit|[Ii]nitiative|[Pp]roject|[Hh]ub|[Ll]aboratory|[Nn]etwork|[Ss]ociet(?:y|ies)|[Cc]ollectives?|[Pp]anels?|[Aa]met[\p{L}-]*|[Aa]gentuur[\p{L}-]*|[Mm]inisteerium[\p{L}-]*|[Kk]eskus[\p{L}-]*|[Ll]innavalitsus[\p{L}-]*|[Vv]allavalitsus[\p{L}-]*|[Oo]mavalitsus[\p{L}-]*|[Üü]likool[\p{L}-]*|[Ii]nstituut[\p{L}-]*|[Tt]eenistus[\p{L}-]*|[Mm]uuseum[\p{L}-]*|LLC|Ltd|Inc|PLC|[Üü]hing|[Ss]elts|[Oo]saühing|[Aa]ktsiaselts|[Ss]ihtasutus|[Tt]ulundusühistu|[Mm]ittetulundusühing)(?![\p{L}\p{N}])/gu,
  /(?<![\p{L}\p{N}])(?:\p{Lu}[\p{Lu}'’.-]{1,39}\s+){1,4}?(?:AGENC(?:Y|IES)|ASSOCIATIONS?|AUTHORIT(?:Y|IES)|TEAM|OFFICE|DEPARTMENT|SERVICE|ORGANI[ZS]ATION|INSTITUTES?|INSTITUTION|UNIVERSITY|COUNCIL|BOARD|COMMISSION|COMMITTEES?|COALITION|ALLIANCE|PARTNERSHIP|CONSORTIUM|COOPERATIVES?|CORPORATION|COMPANY|FEDERATIONS?|FOUNDATION|TRUST|NONPROFIT|INITIATIVE|PROJECT|HUB|LABORATORY|NETWORK|SOCIET(?:Y|IES)|COLLECTIVES?|PANELS?|LLC|LTD|INC|PLC)(?![\p{L}\p{N}])/gu,
  /(?<![\p{L}\p{N}])[\p{L}-]{2,50}\s+(?:AS|OÜ|MTÜ|SA)(?![\p{L}\p{N}])/gu,
]);
function removeFirstPublicOrganizationName(value) {
  const selected = firstPublicOrganizationNameMatch(value);
  if (!selected) return value;
  return `${value.slice(0, selected.index)} ${value.slice(selected.index + selected.text.length)}`;
}

function firstPublicOrganizationNameMatch(value) {
  let selected = null;
  for (const pattern of PUBLIC_ORGANIZATION_NAME_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(value);
    pattern.lastIndex = 0;
    if (!match) continue;
    if (!selected
      || match.index < selected.index
      || (match.index === selected.index && match[0].length > selected.text.length)) {
      selected = { index: match.index, text: match[0] };
    }
  }
  return selected;
}
export { firstPublicOrganizationNameMatch };

function isWholeReviewedPublicOrganizationName(value) {
  const name = String(value || "").replace(/[.?!,;:]+$/gu, "").trim();
  if (!name) return false;
  for (const pattern of PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(name);
    pattern.lastIndex = 0;
    if (match?.index === 0 && match[0].length === name.length) return true;
  }
  return false;
}

const PRIVATE_CONTACT_FIELD_PATTERN = /^(?:(?:üld|uld|yld)?kontakt\w*|contact\w*|(?:üld|uld|yld)?telefoni?\w*|telephone\w*|phone\w*|telefoninumber\w*|mobiili?\w*|mobile\w*|e-?post\w*|email\w*|meil\w*|mail\w*|sideandm\w*|[\p{L}-]*postkast\w*|[\p{L}-]*postikanal\w*|postal\w*|channels?|kanal\w*|gps|koordinaat\w*|coordinate\w*|asukoht\w*|location\w*|asupaik\w*|a?adress\w*|address\w*|koduaadress\w*|homeaddress\w*|kodutänav\w*|kodutanav\w*|elukoh\w*|residence\w*|residentsus\w*|kodukoht\w*|viibimiskoht\w*|erakodu\w*|kodu|elamu\w*|elupai[kg]\w*)$/iu;
// A deliberately narrower subset for the early title-cased-name guard.
// Habitat/location words are valid ecological predicates and stay with the
// later context-aware classifier instead of being treated as direct contact
// fields solely because they follow a name-shaped pair.
const NAMED_PERSON_DIRECT_CONTACT_FIELD_PATTERN = /^(?:(?:üld|uld|yld)?kontakt\w*|contact\w*|(?:üld|uld|yld)?telefoni?\w*|telephone\w*|phone\w*|telefoninumber\w*|mobiili?\w*|mobile\w*|e-?post\w*|email\w*|meil\w*|mail\w*|sideandm\w*|[\p{L}-]*postkast\w*|postal\w*|a?adress\w*|address\w*|koduaadress\w*|homeaddress\w*|kodutänav\w*|kodutanav\w*|elukoh\w*|residence\w*|residentsus\w*|kodukoht\w*|erakodu\w*)$/iu;
export const INSTITUTIONAL_CONTACT_CHANNEL_PATTERN = /(?<![\p{L}\p{N}])(?:[\p{L}-]*kontakt\w*|contact\w*|(?:üld|uld|yld)?telefoni?\w*|telephone\w*|phone\w*|telefoninumber\w*|mobiili?\w*|mobile\w*|e-?post\w*|email\w*|meil\w*|mail\w*|sideandm\w*|[\p{L}-]*postkast\w*|[\p{L}-]*postikanal\w*|postal(?:[\s\p{P}\p{S}\p{Z}\p{C}\p{M}_]+(?:address(?:es)?|channel\w*|mailbox\w*|details?|information))?|channels?|kanal\w*|a?adress\w*|address\w*)(?![\p{L}\p{N}])/iu;
const PRIVATE_PERSON_ATTRIBUTE_TOKEN_PATTERN = /^(?:isikuandm\w*|isikukood\w*|s[üu]nni(?:aeg\w*|aj\w*|aasta\w*|koht\w*|kuup[äa]ev\w*)|terviseandm\w*|biomeetri\w*|ssn|birthdate|birthday|birthplace)$/iu;
const PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN = /^(?:isikuandm\w*|isikukood\w*|s[üu]nni(?:aeg\w*|aj\w*|aasta\w*|koht\w*|kuup[äa]ev\w*)|terviseandm\w*|biomeetri\w*|ssn|birthdate|birthday|birthplace|personal|social|security|numbers?|date|birth|place|location|national|identification|passport|identity|information)$/iu;
const PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE = String.raw`[\s\p{P}\p{S}\p{Z}\p{C}\p{M}_]+`;
const PRIVATE_PERSON_ATTRIBUTE_PATTERN = new RegExp(
  String.raw`(?:\b(?:isikuandm\w*|isikukood\w*|s[üu]nni(?:aeg\w*|aj\w*|aasta\w*|koht\w*|kuup[äa]ev\w*)|terviseandm\w*|biomeetri\w*|ssn|birthdate|birthday|birthplace)\b|(?<!\p{L})(?:social${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}security(?:${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:numbers?|no))?|personal${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:data|information|id(?:${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}number)?)|date${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}of${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}birth|place${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}of${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}birth|birth${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:place|location)|national${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:id|identification)(?:${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}number)?|passport${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}number)(?!\p{L}))`,
  "iu",
);
export const PRIVATE_POSTAL_FIELD_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:postiaadress\w*|postal${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:address(?:es)?|details?|information|contact(?:${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:details?|information))?))(?!\p{L})`,
  "iu",
);
const ECOLOGICAL_SUBJECT_PATTERN = /(?<!\p{L})[\p{L}-]*(?:karu|hundi?|hund|ilves|hülg|hulj|lendorav|kotka?|toonekur(?:g|e)|nahkhiir|saarma?|kobras|põdr|podr|metssiga|rebas|looma?|linnu?|kala|lii[kg]|natura|meri|metsa?|kaitseala|looduskaitse|elurikkus|taime?|rohu?|lille?|samblik|seene?|putuk|konna?|elupai[kg]|pesapai[kg]|rähn|rahn|naarits|rästik|rastik|sisalik|vesilik|siil|madu|nastik|kaan|pärlikar[bp]|parlikar[bp]|hing|võldas|voldas|kuldking|apollo|rüdi|rudi|kõre|kore|tutka?|vigle|animal|bear|beaver|bird|boar|deer|eagle|fish|forest|fox|frog|habitat|lake|lizard|lynx|mink|ocean|orchid|otter|plant|river|salmon|sea|seal|snake|species|squirrel|stork|toad|trout|wolf|woodland)[\p{L}-]*(?!\p{L})/iu;
const ECOLOGICAL_MODIFIER_PATTERN = /^(?:eesti\w*|euroopa\w*|hall\w*|haige\w*|harilik\w*|haruld\w*|hukkun\w*|kaun\w*|leitud|lääne\w*|laane\w*|must\w*|mustlaik\w*|mustsaba\w*|nähtud|nahtud|noor\w*|panda\w*|pesu\w*|pruun\w*|puna\w*|rohe\w*|surnud|suur\w*|valge\w*|vigastatud|väike\w*|vaike\w*|atlantic|baltic|black|brown|common|estonia\w*|european|freshwater|gray|grey|marine|protected|rare|red|white|young)$/iu;

const ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN = new RegExp(
  String.raw`(?<!\p{L})([\p{L}][\p{L}'’.-]{1,39})${ENGLISH_PERSON_SEPARATOR_SOURCE}([\p{L}][\p{L}'’.-]{1,39})\s+(?:residen(?:ce|cy|t)(?:\s+status)?|domicile(?:\s+status)?|home\s+location|elukoh\w*|kodukoht\w*|residentsus\w*)(?!\p{L})`,
  "giu",
);
const CAPTURED_ANY_CASE_PERSON_NAME_SOURCE = String.raw`(${ENGLISH_PERSON_TOKEN_SOURCE})${ENGLISH_PERSON_SEPARATOR_SOURCE}(?:(${ENGLISH_PERSON_TOKEN_SOURCE})${ENGLISH_PERSON_SEPARATOR_SOURCE})?(${ENGLISH_PERSON_TOKEN_SOURCE})`;
const PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE = String.raw`(?:(?:forest|woodland)(?:\s+(?:area|cover(?:age)?|land|property|parcel|plot|holding))?|metsamaa\w*|metsaala\w*)`;
const ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:(?:owned|managed|administered|operated|maintained|controlled|leased|rented|stewarded|acquired)\s+by|held\s+(?:by|for)|(?:registered|recorded)\s+(?:to|under|for)|(?:assigned|attributed|attributable|licensed|entrusted|titled|transferred|conveyed|granted)\s+(?:to|for)|vested\s+in|(?:associated|connected|linked)\s+(?:to|with)|belongs?\s+to|kuulu(?:b|vad)\s+)\s*${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:(?:acquired|bought|purchased|inherited|received)\s+by|(?:allocated|awarded|bequeathed|ceded|conveyed|deeded|donated|gifted|granted|sold|transferred)\s+to|vested\s+in)\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_ESTONIAN_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:anti|kingiti|müüdi|muudi|loovutati|võõrandati|voorandati|pärandati|parandati|määrati|maarati|registreeriti)(?:\s+üle)?\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_OWNERSHIP_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:by\s+)?(?:ownership(?:\s+(?:breakdown|categor(?:y|ies)|class(?:es)?|type(?:s)?|status(?:es)?))?|registered\s+owner|owners?|omand|omandiõigus|kasutusõigus|omanik)\s*(?:\s+(?:(?:of|by|for|held\s+by|attributed\s+to|assigned\s+to|registered\s+to)|kuulu(?:b|vad))\s+|\s*[,/:=]\s*|\s*\p{Pd}+\s*|\s+)${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_CONNECTOR_NAMED_PERSON_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:for|on|of|at|within)\s+(?:the\s+)?${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?:'s|’s)?\s+${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "giu",
);
const CLAUSE_LEADING_NAMED_PERSON_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?:[^\p{L}\p{N}\s'’]+\s*)${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?:'s|’s)?\s+${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L}|\s+(?:habitats?|ecology|range|distribution|biodiversity|conservation|monitoring|research|policy|guidance|data|information|map|maps)\b)`,
  "giu",
);
const ANY_CASE_ESTONIAN_NAMED_PERSON_PRIVATE_LAND_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}\s+(?:era)?(?:maal|metsamaal|kinnistul|maa(?:u|ü)ksusel|maat(?:ü|u)kil|metsas)(?!\p{L})`,
  "giu",
);
const ESTONIAN_GENITIVE_PERSON_TOKEN_SOURCE = String.raw`[\p{L}][\p{L}'’]{0,38}[aeiouõäöü]`;
const CAPTURED_ESTONIAN_GENITIVE_PERSON_NAME_SOURCE = String.raw`(${ENGLISH_PERSON_TOKEN_SOURCE})${ENGLISH_PERSON_SEPARATOR_SOURCE}(?:(${ENGLISH_PERSON_TOKEN_SOURCE})${ENGLISH_PERSON_SEPARATOR_SOURCE})?(${ESTONIAN_GENITIVE_PERSON_TOKEN_SOURCE})`;
const ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE = String.raw`(?:mets(?:a(?:s|st|le|l|lt|ga|d(?:e(?:s|st|le|lt|ga)?)?)?|i)?|metsaala\w*|kinnist(?:u|ut|ul|ult|ule|uga|ute|uid)?|kinnisvara(?:l|le|lt|st|ga)?|maa(?:d|l|le|lt|st|ga)?|maa(?:u|ü)ksus\w*|maat(?:ü|u)k\w*|põld|põllu(?:l|le|lt|st|ga|d|de|sid)?|hoon(?:e|et|el|ele|elt|est|ega|ed|ete|eid)|maj(?:a|as|ast|ale|al|alt|aga|ad|ade|asid)|talu(?:s|st|sse|le|l|lt|ga|d|de|sid)?|korter(?:i|it|is|isse|ist|ile|il|ilt|iga|iks|id|ite|ites|itest|itele|itelt|itega)?|suvil(?:a|at|as|asse|ast|ale|al|alt|aga|aks|ad|ate|aid)|elam(?:u|ut|us|usse|ust|ule|ul|ult|uga|uks|ud|ute|uid)|krunt(?:i|it|is|isse|ist|ile|il|ilt|iga|id|ide|e)?|ehitis(?:e|t|es|esse|est|ele|el|elt|ega|ed|te|i)?|rajatis(?:e|t|es|esse|est|ele|el|elt|ega|ed|te|i)?|a(?:ed|ia(?:s|st|le|l|lt|ga|d|de|sid)?)|tii(?:k|gi(?:s|st|le|l|lt|ga|d|de|sid)?)|puistu(?:s|st|sse|le|l|lt|ga|d|de|sid)?|garaa(?:ž|z)(?:i|is|ist|ile|il|ilt|iga|id|ide)?|puurkaev\w*|kaev(?:u|us|ust|ule|ul|uga)?)`;
const EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE = String.raw`(?:property|parcel|plot|lot|estate|land|unit|house|home|farm|farmhouse|farmstead|well|borehole|wetland|marsh|meadow|pond|building|dwelling|cottage|premises|site|installation|landholding|holding|forest|woodland)`;
const EXPLICIT_PRIVATE_ASSET_IDENTITY_TARGET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}|(?:private|family|household|personal)\s+${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE})(?!\p{L})`,
  "iu",
);
const AMBIGUOUS_BARE_COUNTY_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:ida|lääne|laane)\s+viru\s+(?:(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}|(?:private|family|household|personal)\s+${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE})(?!\p{L})`,
  "iu",
);
// Treat every non-alphanumeric boundary consistently at the privacy edge.
// Downstream tokenizers accept a much wider Unicode punctuation/symbol set
// than the small separator allowlist that used to live here; enumerating it
// let fraction slashes, plus signs and apostrophe lookalikes carry a private
// name across provider boundaries.
const COUNTY_ASSOCIATION_SEPARATOR_SOURCE = String.raw`(?:[^\p{L}\p{N}]|\uA78C)+`;
const COUNTY_PERSON_TOKEN_SOURCE = String.raw`\p{L}[\p{L}'’]{0,39}`;
const PUBLIC_CONTACT_ROLE_PATTERN = /^(?:tehnili\w*|tugi|toe|tuge|klienditug\w*|klienditoe\w*|kellast|kellani|t[oö][oö]tab|lahtiolek\w*|avatud|büroo\w*|buroo\w*|e|info\w*|juht\w*|keskkonnaosakond\w*|klienditeenindus\w*|nõunik\w*|nounik\w*|osakond\w*|post|press\w*|projektiosakond\w*|spetsialist\w*|teenindus\w*|ühine|uhine|üld\w*|uld\w*|yld\w*|vaatlus\w*|customer|data|office|regional|research|service|support)$/iu;
export {
  PERSONAL_LOOKUP_PATTERNS,
  ENGLISH_OWNER_ENUMERATION_ACTION_PATTERN,
  ENGLISH_WHO_OWNER_ASSET_PATTERN,
  ENGLISH_PERSONAL_LOOKUP_PATTERNS,
  ENGLISH_PERSON_NAME_SOURCE,
  ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE,
  ENGLISH_PRIVATE_ASSET_SOURCE,
  ENGLISH_NAMED_POSSESSIVE_ASSET_PATTERN,
  ENGLISH_NAMED_ASSET_ASSOCIATION_PATTERN,
  ENGLISH_ASSET_TO_PERSON_PATTERN,
  ENGLISH_ASSET_IN_PERSON_NAME_PATTERN,
  ENGLISH_PERSON_TO_ASSET_PATTERN,
  ENGLISH_PERSON_ROLE_ASSET_PATTERN,
  ENGLISH_PERSON_APPOSITIVE_ROLE_ASSET_PATTERN,
  ENGLISH_WHERE_RESIDENCE_PATTERN,
  ENGLISH_WHERE_FOUND_PATTERN,
  ENGLISH_WHERE_LOCATED_PATTERN,
  ENGLISH_LOCATE_PERSON_PATTERN,
  PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS,
  removeFirstPublicOrganizationName,
  PRIVATE_CONTACT_FIELD_PATTERN,
  NAMED_PERSON_DIRECT_CONTACT_FIELD_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_TOKEN_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_PATTERN,
  ECOLOGICAL_SUBJECT_PATTERN,
  ECOLOGICAL_MODIFIER_PATTERN,
  PUBLIC_CONTACT_ROLE_PATTERN,
};

export {
  COUNTY_ASSOCIATION_SEPARATOR_SOURCE,
  COUNTY_PERSON_TOKEN_SOURCE,
};

export {
  NAMED_PERSON_CADASTRAL_FIELD_PATTERN,
  ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN,
  CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN,
  GENERIC_CADASTRAL_FIELD_PREFIXES,
  isWholeReviewedPublicOrganizationName,
  AMBIGUOUS_BARE_COUNTY_PRIVATE_ASSET_PATTERN,
};

export {
  ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE,
  EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE,
  EXPLICIT_PRIVATE_ASSET_IDENTITY_TARGET_PATTERN,
};

export {
  ANY_CASE_CONNECTOR_NAMED_PERSON_PRIVATE_ASSET_PATTERN,
  ANY_CASE_ESTONIAN_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN,
  ANY_CASE_ESTONIAN_NAMED_PERSON_PRIVATE_LAND_PATTERN,
  ANY_CASE_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN,
  ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN,
  ANY_CASE_OWNERSHIP_TO_NAMED_PERSON_PATTERN,
  ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN,
  CAPTURED_ANY_CASE_PERSON_NAME_SOURCE,
  CAPTURED_ESTONIAN_GENITIVE_PERSON_NAME_SOURCE,
  ENGLISH_PERSON_TOKEN_SOURCE,
  PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE,
  CLAUSE_LEADING_NAMED_PERSON_PRIVATE_ASSET_PATTERN,
};
