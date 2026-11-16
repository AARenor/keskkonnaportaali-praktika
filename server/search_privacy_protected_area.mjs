import { canonicalSecurityText } from "./search_query_canonicalization.mjs";
import { normalize } from "./search_query_terms.mjs";
import {
  COUNTY_ASSOCIATION_SEPARATOR_SOURCE,
  COUNTY_PERSON_TOKEN_SOURCE,
  ECOLOGICAL_MODIFIER_PATTERN,
  ECOLOGICAL_SUBJECT_PATTERN,
} from "./search_privacy_patterns.mjs";
function isPlainEcologicalResidenceDescriptionQuestion(value) {
  const text = String(value || "").trim();
  const match = text.match(
    /^(?:(?:millin\w*|mis)\s+on\s+)?([\p{L}-]+(?:\s+[\p{L}-]+)?)\s+(?:lii[kg]\w*\s+)?(?:(?:tüüpilin\w*|tuupilin\w*)\s+)?(?:elukoha|elupaiga)\s+(?:(?:tüüpilin\w*|tuupilin\w*)\s+)?(?:(?:keskkonna|looduse)\s+kirjeldus\w*|keskkond\w*|loodus\w*|kirjeldus\w*|seisund\w*)(?:\s+(?:eestis|euroopas|baltikumis|metsades))?\??$/iu,
  );
  if (match) {
    const subjectWords = match[1].split(/\s+/u)
      .filter((word) => !/^(?:tüüpilin|tuupilin)\w*$/iu.test(word));
    const species = subjectWords.at(-1) || "";
    if (ECOLOGICAL_SUBJECT_PATTERN.test(species)
      && (subjectWords.length === 1 || subjectWords.slice(0, -1).every(
        (word) => ECOLOGICAL_MODIFIER_PATTERN.test(word) || ECOLOGICAL_SUBJECT_PATTERN.test(word),
      ))) return true;
  }
  const englishMatch = text.match(
    /^((?:[\p{L}-]+\s+){0,3}[\p{L}-]+)\s+(?:habitat|range|ecology)\s+(?:location|distribution|range|environment)(?:\s+(?:policy|guidance|description|data|map))?\??$/iu,
  );
  if (!englishMatch) return false;
  const subjectWords = englishMatch[1].split(/\s+/u);
  const species = subjectWords.at(-1) || "";
  return ECOLOGICAL_SUBJECT_PATTERN.test(species)
    && subjectWords.slice(0, -1).every((word) => (
      ECOLOGICAL_MODIFIER_PATTERN.test(word) || ECOLOGICAL_SUBJECT_PATTERN.test(word)
    ));
}
// Support desk and opening-hours words ("tehnilise toe telefon, mis kellast
// kellani see töötab") name a service, not a person. "Kell" alone is a
// surname, so only the hour forms are listed.
const ESTONIAN_PRIVATE_OWNERSHIP_PATTERN = /\b(?:omanik\w*|omaja\w*|omand(?:is|uses)\w*|oma(?:b|vad|s|sid|nud|ma|takse|tud)|valdaj\w*|valduses\w*|valda(?:b|vad|s|sid|nud|ma)|kellele\s+kuulub)\b/iu;
const ESTONIAN_FOREST_NOUN_PATTERN = /^(?:mets(?:a(?:s|st|le|lt|ga|d(?:e(?:s|st|le|lt|ga)?)?)?|i)?|metsaa)$/iu;
const ESTONIAN_PRIVATE_FOREST_NOUN_PATTERN = /^(?:eramets(?:a(?:s|st|le|lt|ga|d(?:e(?:s|st|le|lt|ga)?)?)?|i)?|erametsaa)$/iu;
const ESTONIAN_WELL_NOUN_PATTERN = /^kaev(?:u(?:s|st|le|lt|ga|d(?:e(?:s|st|le|lt|ga)?)?)?|e)?$/iu;
const PRIVATE_FOREST_ASSET_PATTERN = /(?<!\p{L})(?:metsamaa\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*|mets(?:a(?:s|st|le|lt|ga|d(?:e(?:s|st|le|lt|ga)?)?)?|i)?|forests?|woodlands?)(?!\p{L})/iu;
const PRIVATE_ASSET_LOOKUP_ACTION_PATTERN = /\b(?:anna|andke|leia|otsi|näita|naita|kuva|tagasta|tagastage|too|show|find|locate|display|reveal|provide|give|get|return|tell)\b/iu;
const FOLLOWING_FOREST_PERSON_LOOKUP_ACTION_PATTERN = /(?<!\p{L})(?:anna|andke|leia|otsi|näita|naita|kuva|tagasta|tagastage|too|show|find|locate|display|reveal|provide|give|get|return|tell|search|look(?:[\s-]+)?up|list|name)(?!\p{L})/iu;
const PRIVATE_OWNER_ROLE_SOURCE = String.raw`(?:owners?|landowners?|homeowners?|propertyowners?|forestowners?|proprietors?|landholders?|landlords?|land\s+owners?|home\s+owners?|property\s+owners?|forest\s+owners?|land\s+holders?)`;
const IMPERATIVE_NAMED_OWNER_LOOKUP_PATTERN = new RegExp(
  String.raw`^(?:find|show|search|locate|identify|lookup|look\s+up|list|name|tell\s+me|give\s+me)\s+(?:the\s+)?(?:(?:${COUNTY_PERSON_TOKEN_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}){1,5}${COUNTY_PERSON_TOKEN_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${PRIVATE_OWNER_ROLE_SOURCE}|${PRIVATE_OWNER_ROLE_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(?:${COUNTY_PERSON_TOKEN_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}){1,5}${COUNTY_PERSON_TOKEN_SOURCE})[.!?]*$`,
  "iu",
);
const REVIEWED_FOREST_LOOKUP_TOPIC_SOURCE = String.raw`(?:fire\s+(?:danger|risk|index|forecast)|carbon\s+(?:storage|stock|sink|sequestration)|age\s+(?:distribution|structure|classes|profile)|cover\s+statistics|coverage\s+(?:percentage|statistics|map|trend)|area\s+(?:statistics|by\s+county)|health\s+(?:status|indicators|condition|assessment)|management\s+(?:guidance|practices|policy|plans|methods|authority|rules)|habitat\s+map|restoration\s+methods|ownership\s+statistics|species\s+diversity|water\s+quality|coverage|health)`;
const REVIEWED_FOREST_TOPIC_PERSON_RESIDUAL_PATTERN = new RegExp(
  String.raw`^(?:(?:find|show|search|lookup|look[\s-]+up|list|locate|name|tell\s+me)(?:\s+me)?(?:\s+the)?\s+)?(?:(?:public|county|state|national|municipal)\s+)?(?:forest|woodland)\s+${REVIEWED_FOREST_LOOKUP_TOPIC_SOURCE}(?<residual>[\s\p{Pd},;:]+[\s\S]+?)[.!?]*$`,
  "iu",
);
const REVIEWED_FOREST_TOPIC_PUBLIC_COMPLEMENT_PATTERN = /^(?:(?:in|for)\s+estonia|eestis|today|now|currently|this\s+year|(?:in|for)\s+(?:19|20)\d{2}|over\s+time|by\s+year|year[-\s]+by[-\s]+year)$/iu;

function hasReviewedForestTopicPersonResidual(value) {
  const match = String(value || "").trim().match(REVIEWED_FOREST_TOPIC_PERSON_RESIDUAL_PATTERN);
  if (!match) return false;
  const residual = String(match.groups?.residual || "")
    .replace(/^[\s\p{Pd},;:]+/gu, "")
    .replace(/[.!?]+$/gu, "")
    .trim();
  if (!residual || REVIEWED_FOREST_TOPIC_PUBLIC_COMPLEMENT_PATTERN.test(residual)) return false;
  return (residual.match(/\p{L}[\p{L}'’]{0,39}/gu) || []).length >= 2;
}
const EXPLICIT_PRIVATE_FOREST_ASSET_PATTERN = /^(?:metsamaa\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*)$/iu;
const ENGLISH_PRIVATE_FOREST_QUALIFIER_PATTERN = /^(?:property|parcel|plot|lot|estate|land|holding)$/iu;
const PUBLIC_FOREST_RELATION_TOKEN_PATTERN = /^(?:rahvusparg\w*|loodusparg\w*|maastikukaitseal\w*|looduskaitseal\w*|hoiual\w*|kaitseal\w*|riigi\w*|avalik\w*|munitsipaal\w*|mountains?|national|park|public|reserve|state|municipal|government|valley)$/iu;
const ESTONIAN_BELONGING_PARTICIPLE_PATTERN = /^kuuluv(?:a(?:s|st|le|lt|ga|ks|na|d|te(?:s|st|le|lt|ga)?)?|at|ad)?$/iu;
const ESTONIAN_BELONGS_VERB_PATTERN = /^kuulu(?:b|vad|nud|s|sid)$/iu;
export const CADASTRE_PATTERN = /\b\d{5}:\d{3}:\d{4}\b/u;
const ESTONIAN_REGULATORY_CONSENT_SOURCE = String.raw`kelle\s+(?:(?:eelnev|eelneva|eelnevat|kirjalik|kirjaliku|kirjalikku|ametlik|ametliku|ametlikku)\s+)?(?:nousolek|nousoleku|nousolekut|kooskolastus|kooskolastuse|kooskolastust|heakskiit|heakskiidu|heakskiitu|luba|loa)`;
const ESTONIAN_REGULATORY_REQUIREMENT_SOURCE = String.raw`(?:(?:on\s+)?(?:vaja|vajalik|noutav)|tuleb\s+(?:taotleda|taotlema|saada|kusida)|peab\s+(?:taotlema|saama|kusima))`;
const ESTONIAN_REVIEWED_NATIONAL_PARK_NAME_SOURCE = String.raw`(?:lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse)`;
const ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE = String.raw`(?:kaitseala|kaitsealal|kaitsealale|kaitsealalt|looduskaitseala|looduskaitsealal|looduskaitsealale|looduskaitsealalt|maastikukaitseala|maastikukaitsealal|maastikukaitsealale|maastikukaitsealalt|(?:${ESTONIAN_REVIEWED_NATIONAL_PARK_NAME_SOURCE}\s+)?(?:rahvuspark|rahvuspargi|rahvuspargis|rahvusparki|rahvuspargil|rahvuspargile)|natura(?:\s+2000)?\s+(?:ala|alal|alale|alalt)|hoiuala|hoiualal|hoiualale|hoiualalt|pusielupaik|pusielupaigas|pusielupaika|pusielupaigal|pusielupaigale)`;
// This allowlist is intentionally token-exact. Prefix-open forms such as
// `van\w*` or `uu\w*` would also consume kinship terms (vanaema) and names
// (Uuno), incorrectly turning a private-asset lookup into a public question.
const ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_SOURCE = String.raw`(?:vana|vanas|uus|uue|uut|uues|uuel|puidust|kivist|betoonist|palkidest|uhe|kahe|kolme|nelja|viie|kuue|seitsme|kaheksa|uheksa|kumne|mitme|korrusega|korruselise|uhekorruseline|uhekorruselise|kahekorruseline|kahekorruselise|kolmekorruseline|kolmekorruselise|neljakorruseline|neljakorruselise|viiekorruseline|viiekorruselise|riigi|riiklik|riikliku|avalik|avaliku|munitsipaal|olemasolev|olemasoleva|kavandatav|kavandatava|planeeritav|planeeritava|renoveeritud|renoveeritav|renoveeritava|renoveeritavat|kaitstav|kaitstava|vaike|vaikese|vaikest|suur|suure|suurt|ajutine|ajutise|ajutist|pusiv|pusiva|pusivat|energiatohus|energiatohusa|kohalik|kohaliku|ajalooline|ajaloolise|ajaloolist|asutuse|riigiasutuse|munitsipaalasutuse|linnavalitsuse|vallavalitsuse|ameti|agentuuri|ministeeriumi|valitsuse|omavalitsuse|kooli|haigla|teenistuse|instituudi|linna|valla)`;
const ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE = String.raw`(?:${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_SOURCE}\s+){0,12}`;
const ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_PATTERN = new RegExp(
  String.raw`^${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_SOURCE}$`,
  "u",
);
const ESTONIAN_REGULATORY_BUILDING_TOKEN_SOURCE = String.raw`(?:eramaja|maja|abihoone|abihoonet|korterelamu|korterelamut|ridaelamu|ridaelamut|uksikelamu|uksikelamut|uhepereelamu|uhepereelamut|kahepereelamu|kahepereelamut|saun|sauna|saunamaja|suvemaja|puhkemaja|kulalistemaja|kogukonnamaja|moodulmaja|palkmaja|elementmaja|kasvuhoone|kasvuhoonet|tootmishoone|tootmishoonet|toostushoone|toostushoonet|arihoone|arihoonet|eluhoone|eluhoonet|laohoone|laohoonet|buroohoone|buroohoonet|korvalhoone|korvalhoonet|majandushoone|majandushoonet|spordihoone|spordihoonet|oppehoone|oppehoonet|koolihoone|koolihoonet|lasteaiahoone|lasteaiahoonet|haiglahoone|haiglahoonet|kultuurihoone|kultuurihoonet|farmihoone|farmihoonet|kortermaja|ridamaja|paarismaja|talumaja|aiamaja|elumaja|sotsiaalmaja|hoone|hoonet|elamu|elamut|eramu|eramut|suvila|suvilat|korter|korteri|korterit|talu|kuun|kuuni|laut|lauda|majake|majakese|majakest|suvemajake|suvemajakese|suvemajakest|moodulmajake|moodulmajakese|moodulmajakest|garaaz|garaazi|kuur|kuuri|ait|aida|varjualune|varjualuse|varjualust|ehitis|ehitise|ehitist|rajatis|rajatise|rajatist)`;
const ESTONIAN_REGULATORY_BUILDING_TOKEN_PATTERN = new RegExp(
  String.raw`(?:^|\s)${ESTONIAN_REGULATORY_BUILDING_TOKEN_SOURCE}(?=\s|$)`,
  "u",
);
const ESTONIAN_REGULATORY_BUILDING_EXACT_TOKEN_PATTERN = new RegExp(
  String.raw`^${ESTONIAN_REGULATORY_BUILDING_TOKEN_SOURCE}$`,
  "u",
);
// Unknown compounds are private-asset context but never cross the public
// exception. This closes the whole `...maja`/`...hoone`/`...elamu` class
// without admitting an arbitrary person-name prefix into the safe grammar.
const ESTONIAN_COMPOUND_BUILDING_ASSET_PATTERN = /(?<!\p{L})(?:[\p{L}-]{1,40})?(?:maja(?:s|st|le|lt|ga|ks|ni|d|de|des|dest|dele|delt|dega)?|hoone(?:t|s|st|le|lt|ga|ks|ni|d|te|tes|test|tele|telt|tega)?|elamu(?:t|s|st|le|lt|ga|ks|ni|d|te|tes|test|tele|telt|tega)?)(?!\p{L})/iu;
const ESTONIAN_PRIVATE_DWELLING_TOKEN_PATTERN = /(?<!\p{L})(?:(?:[\p{L}-]{1,40})?(?:majake|majakese|majakest|majakeses|majakesse|majakesele|hooneke|hoonekese|hoonekest|hoonekeses|hoonekesesse|hoonekesele|elamuke|elamukese|elamukest|elamukeses|elamukesse|elamukesele)|korter(?:i|it|is|isse|ist|ile|ilt|iga|iks|id|ite|ites|itest|itele|itelt|itega)?)(?!\p{L})/iu;
const ESTONIAN_GENERIC_BUILDING_SOURCE = ESTONIAN_REGULATORY_BUILDING_TOKEN_SOURCE;
const ESTONIAN_BUILDING_ACTIVITY_SOURCE = String.raw`(?:ehitada|ehitamiseks|ehitamine|ehitamise|rajada|rajamiseks|rajamine|rajamise|planeerida|planeerimiseks|planeerimine|planeerimise|pustitada|pustitamiseks|pustitamine|pustitamise|renoveerida|renoveerimiseks|renoveerimine|renoveerimise|rekonstrueerida|rekonstrueerimiseks|rekonstrueerimine|rekonstrueerimise)`;
const ESTONIAN_BUILDING_ACTIVITY_TOKEN_PATTERN = new RegExp(
  String.raw`^${ESTONIAN_BUILDING_ACTIVITY_SOURCE}$`,
  "u",
);
const ESTONIAN_BUILDING_ACTIVITY_IN_TEXT_PATTERN = new RegExp(
  String.raw`(?:^|\s)${ESTONIAN_BUILDING_ACTIVITY_SOURCE}(?=\s|$)`,
  "u",
);
const ESTONIAN_REGULATORY_CONSENT_IN_TEXT_PATTERN = new RegExp(
  String.raw`(?:^|\s)${ESTONIAN_REGULATORY_CONSENT_SOURCE}(?=\s|$)`,
  "u",
);
const ESTONIAN_PROTECTED_BUILDING_LOCATION_IN_TEXT_PATTERN = new RegExp(
  String.raw`(?:^|\s)${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}(?=\s|$)`,
  "u",
);
const ESTONIAN_PROTECTED_BUILDING_LOCATION_TOKEN_PATTERN = /^(?:kaitseala|kaitsealal|kaitsealale|kaitsealalt|looduskaitseala|looduskaitsealal|looduskaitsealale|looduskaitsealalt|maastikukaitseala|maastikukaitsealal|maastikukaitsealale|maastikukaitsealalt|rahvuspark|rahvuspargi|rahvuspargis|rahvusparki|rahvuspargil|rahvuspargile|natura|ala|alal|alale|alalt|hoiuala|hoiualal|hoiualale|hoiualalt|pusielupaik|pusielupaigas|pusielupaika|pusielupaigal|pusielupaigale)$/u;
const ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_SOURCE = String.raw`(?:minu|meie(?:\s+pere)?|oma|tema|nende|naabri|sobra|sopra|perekonna|pereliikme|vanaema|vanaisa|vanavanema|vanatadi|tadi|onu|ema|isa|oe|venna|abikaasa|elukaaslase|lapse|tutre|poja|sugulase|kolleegi|selle\s+(?:(?:konkreetse|nimetatud)\s+)?inimese)`;
const ESTONIAN_REGULATORY_OBJECT_TOKEN_SOURCE = String.raw`[a-z][a-z-]{1,39}`;
const ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_PATTERNS = Object.freeze([
  new RegExp(
    String.raw`(?:^|\s)${ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_SOURCE}\s+(?:${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_SOURCE}\s+){0,4}${ESTONIAN_REGULATORY_OBJECT_TOKEN_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}(?=\s|$)`,
    "u",
  ),
  new RegExp(
    String.raw`(?:^|\s)${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+${ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_SOURCE}\s+(?:${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_SOURCE}\s+){0,4}${ESTONIAN_REGULATORY_OBJECT_TOKEN_SOURCE}(?=\s|$)`,
    "u",
  ),
]);
const ESTONIAN_REGULATORY_POLITE_PREFIX_SOURCE = String.raw`(?:palun(?:\s+(?:oelge|selgitage))?\s+)?`;
const ESTONIAN_REVIEWED_GENERIC_REGULATORY_CONSENT_PATTERNS = Object.freeze([
  new RegExp(
    String.raw`^kas\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+(?:voib|tohib|saab)\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+(?:(?:ja|ning)\s+)?${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^kas\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+(?:voib|tohib|saab)\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+(?:(?:ja|ning)\s+)?${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^${ESTONIAN_REGULATORY_POLITE_PREFIX_SOURCE}${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}\s+(?:et\s+)?${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^${ESTONIAN_REGULATORY_POLITE_PREFIX_SOURCE}${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}\s+(?:et\s+)?${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^${ESTONIAN_REGULATORY_POLITE_PREFIX_SOURCE}${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+(?:on\s+)?${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+(?:(?:ja|ning)\s+)?${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+(?:(?:ja|ning)\s+)?${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
]);
const ESTONIAN_REVIEWED_INSTITUTIONAL_REGULATORY_CONSENT_PATTERNS = Object.freeze([
  // A known public institution's building can be the grammatical possessor
  // even when the construction verb is implicit ("RMK maja rahvuspargis:
  // kelle luba on vaja?"). This form is considered only after an exact public
  // organization span has been removed, so a person's surname cannot occupy
  // the same slot.
  new RegExp(
    String.raw`^${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
]);

function hasLossyUnicodeLetterOrNumber(value) {
  const compatibilityText = String(value || "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "");
  return [...compatibilityText].some((character) => (
    /[\p{L}\p{N}]/u.test(character) && !/[A-Za-z0-9]/u.test(character)
  ));
}

function hasLossyUnicodeProtectedConstructionResidual(value) {
  const canonicalText = canonicalSecurityText(value);
  if (!hasLossyUnicodeLetterOrNumber(canonicalText)) return false;
  const normalizedText = normalize(canonicalText);
  return ESTONIAN_PROTECTED_BUILDING_LOCATION_IN_TEXT_PATTERN.test(normalizedText)
    && (
      ESTONIAN_BUILDING_ACTIVITY_IN_TEXT_PATTERN.test(normalizedText)
      || ESTONIAN_REGULATORY_CONSENT_IN_TEXT_PATTERN.test(normalizedText)
    )
    && (
      ESTONIAN_REGULATORY_BUILDING_TOKEN_PATTERN.test(normalizedText)
      || ESTONIAN_COMPOUND_BUILDING_ASSET_PATTERN.test(canonicalText)
    );
}


export {
  isPlainEcologicalResidenceDescriptionQuestion,
  hasReviewedForestTopicPersonResidual,
  hasLossyUnicodeProtectedConstructionResidual,
  ESTONIAN_PRIVATE_OWNERSHIP_PATTERN,
  ESTONIAN_FOREST_NOUN_PATTERN,
  ESTONIAN_PRIVATE_FOREST_NOUN_PATTERN,
  ESTONIAN_WELL_NOUN_PATTERN,
  PRIVATE_FOREST_ASSET_PATTERN,
  PRIVATE_ASSET_LOOKUP_ACTION_PATTERN,
  FOLLOWING_FOREST_PERSON_LOOKUP_ACTION_PATTERN,
  EXPLICIT_PRIVATE_FOREST_ASSET_PATTERN,
  ENGLISH_PRIVATE_FOREST_QUALIFIER_PATTERN,
  PUBLIC_FOREST_RELATION_TOKEN_PATTERN,
  ESTONIAN_BELONGING_PARTICIPLE_PATTERN,
  ESTONIAN_BELONGS_VERB_PATTERN,
  ESTONIAN_COMPOUND_BUILDING_ASSET_PATTERN,
  ESTONIAN_PRIVATE_DWELLING_TOKEN_PATTERN,
  ESTONIAN_REGULATORY_BUILDING_TOKEN_PATTERN,
  ESTONIAN_BUILDING_ACTIVITY_IN_TEXT_PATTERN,
  ESTONIAN_BUILDING_ACTIVITY_TOKEN_PATTERN,
  ESTONIAN_PROTECTED_BUILDING_LOCATION_IN_TEXT_PATTERN,
  ESTONIAN_PROTECTED_BUILDING_LOCATION_TOKEN_PATTERN,
  ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_PATTERN,
  ESTONIAN_REGULATORY_BUILDING_EXACT_TOKEN_PATTERN,
  ESTONIAN_REGULATORY_CONSENT_IN_TEXT_PATTERN,
  ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_PATTERNS,
  ESTONIAN_BUILDING_ACTIVITY_SOURCE,
  ESTONIAN_GENERIC_BUILDING_SOURCE,
  ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE,
  ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE,
  ESTONIAN_REVIEWED_GENERIC_REGULATORY_CONSENT_PATTERNS,
  ESTONIAN_REVIEWED_INSTITUTIONAL_REGULATORY_CONSENT_PATTERNS,
  ESTONIAN_REVIEWED_NATIONAL_PARK_NAME_SOURCE,
};

export { hasLossyUnicodeLetterOrNumber };

export { IMPERATIVE_NAMED_OWNER_LOOKUP_PATTERN };
