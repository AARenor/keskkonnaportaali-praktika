// Reviewed Estonian municipality identities used at both the privacy and
// forestry boundaries. Keeping this catalogue independent from search.mjs
// avoids circular imports and prevents the two boundaries from drifting.

export function normalizeMunicipalityText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^0-9a-z]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const REVIEWED_CITY_NAMES = Object.freeze([
  "haapsalu", "keila", "kohtla-järve", "loksa", "maardu", "narva", "narva-jõesuu",
  "paide", "pärnu", "rakvere", "sillamäe", "tallinn", "tartu", "viljandi", "võru",
]);

const REVIEWED_RURAL_MUNICIPALITY_NAMES = Object.freeze([
  "alutaguse", "anija", "antsla", "elva", "häädemeeste", "haljala", "harku", "hiiumaa",
  "järva", "jõelähtme", "jõgeva", "jõhvi", "kadrina", "kambja", "kanepi", "kastre",
  "kehtna", "kiili", "kihnu", "kohila", "kose", "kuusalu", "lääne-harju", "lääne-nigula",
  "lääneranna", "luunja", "lüganuse", "muhu", "mulgi", "mustvee", "märjamaa", "nõo",
  "otepää", "peipsiääre", "põhja-pärnumaa", "põhja-sakala", "põlva", "põltsamaa", "raasiku",
  "rae", "rakvere", "rapla", "räpina", "rõuge", "ruhnu", "saarde", "saaremaa", "saku",
  "saue", "setomaa", "tapa", "tartu", "tori", "tõrva", "türi", "valga", "viimsi",
  "viljandi", "vinni", "viru-nigula", "vormsi", "võru", "väike-maarja",
]);

export const REVIEWED_ESTONIAN_MUNICIPALITY_IDENTITIES = new Set([
  ...REVIEWED_CITY_NAMES.map((name) => name === "tallinn" ? name : `${name} linn`),
  ...REVIEWED_RURAL_MUNICIPALITY_NAMES.map((name) => `${name} vald`),
].map(normalizeMunicipalityText));

export const REVIEWED_ESTONIAN_MUNICIPALITY_BASES = new Set([
  ...REVIEWED_CITY_NAMES,
  ...REVIEWED_RURAL_MUNICIPALITY_NAMES,
].map(normalizeMunicipalityText));

const REVIEWED_MUNICIPALITY_IDENTITIES_BY_BASE = new Map();

function addReviewedMunicipalityBaseIdentity(base, identity) {
  const normalizedBase = normalizeMunicipalityText(base);
  const identities = REVIEWED_MUNICIPALITY_IDENTITIES_BY_BASE.get(normalizedBase) || [];
  if (!identities.includes(identity)) identities.push(identity);
  REVIEWED_MUNICIPALITY_IDENTITIES_BY_BASE.set(normalizedBase, identities);
}

for (const name of REVIEWED_CITY_NAMES) {
  const base = normalizeMunicipalityText(name);
  addReviewedMunicipalityBaseIdentity(base, base === "tallinn" ? "tallinn" : `${base} linn`);
}
for (const name of REVIEWED_RURAL_MUNICIPALITY_NAMES) {
  const base = normalizeMunicipalityText(name);
  addReviewedMunicipalityBaseIdentity(base, `${base} vald`);
}

const REVIEWED_MUNICIPALITY_BASES_LONGEST_FIRST = Object.freeze(
  [...REVIEWED_MUNICIPALITY_IDENTITIES_BY_BASE.keys()].sort((left, right) => right.length - left.length),
);

const REVIEWED_CITY_LOCATION_ALIASES = new Map(Object.entries({
  haapsalus: "haapsalu linn",
  keilas: "keila linn",
  "kohtla jarvel": "kohtla-jarve linn",
  loksal: "loksa linn",
  maardus: "maardu linn",
  narvas: "narva linn",
  "narva joesuus": "narva-joesuu linn",
  paides: "paide linn",
  parnus: "parnu linn",
  rakveres: "rakvere linn",
  sillamael: "sillamae linn",
  tallinnas: "tallinn",
  tartus: "tartu linn",
  viljandis: "viljandi linn",
  vorus: "voru linn",
}));

export const REVIEWED_MUNICIPALITY_ORGANIZATION_PATTERN = /(?<![\p{L}\p{N}])([\p{L}'’-]{2,50})\s+(linn\w*|val(?:d|l)\w*|city(?:\s+government)?|municipalit\w*|(?:municipal|local)\s+government)(?![\p{L}\p{N}])/giu;
const REVIEWED_CITY_OF_PATTERN = /(?<![\p{L}\p{N}])city\s+of\s+([\p{L}'’-]{2,50})(?![\p{L}\p{N}])/giu;
const REVIEWED_GOVERNMENT_OF_PATTERN = /(?<![\p{L}\p{N}])(city|municipal|local)\s+government\s+of\s+([\p{L}'’-]{2,50})(?![\p{L}\p{N}])/giu;
const REVIEWED_MUNICIPALITY_OF_PATTERN = /(?<![\p{L}\p{N}])municipality\s+of\s+([\p{L}'’-]{2,50})(?![\p{L}\p{N}])/giu;

export function isReviewedEstonianMunicipalityIdentity(value) {
  const identity = normalizeMunicipalityText(value);
  return REVIEWED_ESTONIAN_MUNICIPALITY_IDENTITIES.has(identity)
    || identity === "tallinn linn"
    || identity === "tallinna linn";
}

function municipalityIdentitiesFromOrganizationMatch(base, marker) {
  const normalizedBase = normalizeMunicipalityText(base) === "tallinna"
    ? "tallinn"
    : normalizeMunicipalityText(base);
  const normalizedMarker = normalizeMunicipalityText(marker);
  const cityMarker = normalizedMarker.startsWith("linn")
    || normalizedMarker.startsWith("city");
  const ruralMarker = normalizedMarker.startsWith("vall")
    || normalizedMarker.startsWith("vald");
  const candidates = cityMarker
    ? [`${normalizedBase} linn`]
    : ruralMarker
      ? [`${normalizedBase} vald`]
      : [`${normalizedBase} vald`, `${normalizedBase} linn`];
  return candidates.filter(isReviewedEstonianMunicipalityIdentity);
}

export function municipalityIdentityFromOrganizationMatch(base, marker) {
  const candidates = municipalityIdentitiesFromOrganizationMatch(base, marker);
  return candidates.length === 1 ? candidates[0] : null;
}

export function removeFirstReviewedMunicipalityOrganizationName(value) {
  const candidates = [];
  REVIEWED_MUNICIPALITY_ORGANIZATION_PATTERN.lastIndex = 0;
  for (const match of String(value || "").matchAll(REVIEWED_MUNICIPALITY_ORGANIZATION_PATTERN)) {
    if (!municipalityIdentityFromOrganizationMatch(match[1], match[2])) continue;
    candidates.push(match);
  }
  REVIEWED_MUNICIPALITY_ORGANIZATION_PATTERN.lastIndex = 0;
  REVIEWED_CITY_OF_PATTERN.lastIndex = 0;
  for (const match of String(value || "").matchAll(REVIEWED_CITY_OF_PATTERN)) {
    if (!isReviewedEstonianMunicipalityIdentity(`${match[1]} linn`)) continue;
    candidates.push(match);
  }
  REVIEWED_CITY_OF_PATTERN.lastIndex = 0;
  REVIEWED_GOVERNMENT_OF_PATTERN.lastIndex = 0;
  for (const match of String(value || "").matchAll(REVIEWED_GOVERNMENT_OF_PATTERN)) {
    if (!municipalityIdentityFromOrganizationMatch(match[2], `${match[1]} government`)) continue;
    candidates.push(match);
  }
  REVIEWED_GOVERNMENT_OF_PATTERN.lastIndex = 0;
  REVIEWED_MUNICIPALITY_OF_PATTERN.lastIndex = 0;
  for (const match of String(value || "").matchAll(REVIEWED_MUNICIPALITY_OF_PATTERN)) {
    if (!municipalityIdentityFromOrganizationMatch(match[1], "municipality")) continue;
    candidates.push(match);
  }
  REVIEWED_MUNICIPALITY_OF_PATTERN.lastIndex = 0;
  const selected = candidates.sort((left, right) => left.index - right.index)[0];
  return selected
    ? `${value.slice(0, selected.index)} ${value.slice(selected.index + selected[0].length)}`
    : value;
}

function normalizedPhraseIsPresent(text, phrase) {
  return (` ${text} `).includes(` ${phrase} `);
}

export function reviewedEstonianMunicipalityScope(value) {
  const raw = String(value || "");
  const matches = [];
  const addMatch = (identity, match, typeSpecific = false) => {
    const start = Number.isInteger(match?.index) ? match.index : null;
    matches.push({
      identity,
      matched: match?.[0] || String(match || ""),
      start,
      end: start === null ? null : start + match[0].length,
      typeSpecific,
    });
  };
  REVIEWED_MUNICIPALITY_ORGANIZATION_PATTERN.lastIndex = 0;
  for (const match of raw.matchAll(REVIEWED_MUNICIPALITY_ORGANIZATION_PATTERN)) {
    const marker = normalizeMunicipalityText(match[2]);
    const typeSpecific = marker.startsWith("linn")
      || marker.startsWith("vald")
      || marker.startsWith("vall")
      || marker.startsWith("city");
    for (const identity of municipalityIdentitiesFromOrganizationMatch(match[1], match[2])) {
      addMatch(identity, match, typeSpecific);
    }
  }
  REVIEWED_MUNICIPALITY_ORGANIZATION_PATTERN.lastIndex = 0;
  REVIEWED_CITY_OF_PATTERN.lastIndex = 0;
  for (const match of raw.matchAll(REVIEWED_CITY_OF_PATTERN)) {
    const identity = `${normalizeMunicipalityText(match[1])} linn`;
    if (isReviewedEstonianMunicipalityIdentity(identity)) addMatch(identity, match, true);
  }
  REVIEWED_CITY_OF_PATTERN.lastIndex = 0;
  REVIEWED_GOVERNMENT_OF_PATTERN.lastIndex = 0;
  for (const match of raw.matchAll(REVIEWED_GOVERNMENT_OF_PATTERN)) {
    for (const identity of municipalityIdentitiesFromOrganizationMatch(match[2], `${match[1]} government`)) {
      addMatch(identity, match, normalizeMunicipalityText(match[1]) === "city");
    }
  }
  REVIEWED_GOVERNMENT_OF_PATTERN.lastIndex = 0;
  REVIEWED_MUNICIPALITY_OF_PATTERN.lastIndex = 0;
  for (const match of raw.matchAll(REVIEWED_MUNICIPALITY_OF_PATTERN)) {
    for (const identity of municipalityIdentitiesFromOrganizationMatch(match[1], "municipality")) {
      addMatch(identity, match);
    }
  }
  REVIEWED_MUNICIPALITY_OF_PATTERN.lastIndex = 0;

  const text = normalizeMunicipalityText(raw);
  for (const [alias, identity] of REVIEWED_CITY_LOCATION_ALIASES) {
    if (normalizedPhraseIsPresent(text, alias)) matches.push({
      identity,
      matched: alias,
      start: null,
      end: null,
      typeSpecific: true,
    });
  }
  // “municipality of Tartu linn” contains both the explicit typed identity
  // “Tartu linn” and a shorter generic “municipality of Tartu” substring.
  // Drop only generic matches whose source span overlaps an explicit city or
  // rural marker; separate clauses and separate municipalities stay
  // ambiguous rather than being silently narrowed.
  const typedMatches = matches.filter((match) => match.typeSpecific && match.start !== null);
  const effectiveMatches = matches.filter((match) => match.typeSpecific
    || match.start === null
    || !typedMatches.some((typed) => match.start < typed.end && typed.start < match.end));
  const identities = [...new Set(effectiveMatches.map((match) => match.identity))];
  if (!identities.length) return null;
  if (identities.length > 1) {
    return {
      status: "ambiguous",
      identity: null,
      candidates: identities,
      matched: effectiveMatches.map((match) => match.matched),
    };
  }
  return {
    status: "exact",
    identity: identities[0],
    candidates: identities,
    matched: effectiveMatches[0].matched,
  };
}

export function hasReviewedEstonianMunicipalityScope(value) {
  return Boolean(reviewedEstonianMunicipalityScope(value));
}

// Public-entity exemptions must consume the whole candidate identity. The
// general scope resolver is intentionally able to find a municipality inside
// a longer query, so using it as a Boolean identity check would let a natural
// person's larger name inherit a public municipality substring.
export function reviewedEstonianMunicipalityCandidateScope(value) {
  const raw = String(value || "").trim();
  const scope = reviewedEstonianMunicipalityScope(raw);
  if (!scope) return null;
  const normalizedCandidate = normalizeMunicipalityText(raw);
  const matched = Array.isArray(scope.matched) ? scope.matched : [scope.matched];
  if (matched.some((item) => normalizeMunicipalityText(item) === normalizedCandidate)) {
    return scope;
  }
  // Nested typed forms such as “municipality of Tartu linn” resolve through
  // the inner typed span. Accept that reviewed wrapper only when the complete
  // candidate follows the bounded one-base municipality grammar.
  if (/^municipality\s+of\s+[\p{L}'’-]{2,50}(?:\s+(?:linn\w*|val(?:d|l)\w*))?$/iu.test(raw)) {
    return scope;
  }
  return null;
}

// Forestry questions often use only a municipality's bare name (for example,
// "Pärnu metsasus"). Keep this expansion out of the privacy boundary: a bare
// place name is useful for geographic routing, but must never become an
// organization/person exemption by itself.
export function reviewedEstonianForestryMunicipalityScope(value) {
  const explicitScope = reviewedEstonianMunicipalityScope(value);
  if (explicitScope) return explicitScope;

  const text = normalizeMunicipalityText(value);
  const matches = [];
  for (const base of REVIEWED_MUNICIPALITY_BASES_LONGEST_FIRST) {
    if (!normalizedPhraseIsPresent(text, base)) continue;
    for (const identity of REVIEWED_MUNICIPALITY_IDENTITIES_BY_BASE.get(base) || []) {
      matches.push({ identity, matched: base });
    }
  }
  const identities = [...new Set(matches.map((match) => match.identity))];
  if (!identities.length) return null;
  if (identities.length > 1) {
    return {
      status: "ambiguous",
      identity: null,
      candidates: identities,
      matched: [...new Set(matches.map((match) => match.matched))],
    };
  }
  return {
    status: "exact",
    identity: identities[0],
    candidates: identities,
    matched: matches[0].matched,
  };
}

const FORESTRY_LOCALITY_METRIC_PATTERN = /\b(?:metsasus\w*|metsamaa\w*|metsa\s+pindala|metsaga\s+kaetud|forest\s+area|forest\s+cover|woodland\s+area)\b/u;
const FORESTRY_NATIONAL_SCOPE_PATTERN = /\b(?:eesti|eestis|eestil|estonia|estonian|national|nationwide|countrywide|kogu\s+riigi|smi)\b/u;
const FORESTRY_UNKNOWN_PLACE_NAME_ENDING_PATTERN = /(?:oru|jarve|joesuu|mae|vere|kula|saare|ranna|kalda|oja|nurme|valja|niidu|pargi|raba|soo|metsa)$/u;
const FORESTRY_LOCALITY_METRIC_TOKEN_PATTERN = /^(?:mets\w*|metsasus\w*|metsamaa\w*|pindala\w*|osakaal\w*|protsent\w*|hektar\w*|forest|woodland|area|cover(?:age)?|percentage|percent|share)$/u;

const REVIEWED_ESTONIAN_COUNTY_ALIASES = Object.freeze([
  ["harju maakond", ["harjumaa", "harju maakond", "harju county"]],
  ["hiiu maakond", ["hiiumaa", "hiiu maakond", "hiiu county"]],
  ["ida viru maakond", ["ida virumaa", "ida viru maakond", "ida viru county"]],
  ["jogeva maakond", ["jogevamaa", "jogeva maakond", "jogeva county"]],
  ["jarva maakond", ["jarvamaa", "jarva maakond", "jarva county"]],
  ["laane maakond", ["laanemaa", "laane maakond", "laane county"]],
  ["laane viru maakond", ["laane virumaa", "laane viru maakond", "laane viru county"]],
  ["polva maakond", ["polvamaa", "polva maakond", "polva county"]],
  ["parnu maakond", ["parnumaa", "parnu maakond", "parnu county"]],
  ["rapla maakond", ["raplamaa", "rapla maakond", "rapla county"]],
  ["saare maakond", ["saaremaa", "saare maakond", "saare county"]],
  ["tartu maakond", ["tartumaa", "tartu maakond", "tartu county"]],
  ["valga maakond", ["valgamaa", "valga maakond", "valga county"]],
  ["viljandi maakond", ["viljandimaa", "viljandi maakond", "viljandi county"]],
  ["voru maakond", ["vorumaa", "voru maakond", "voru county"]],
]);

const FORESTRY_FOREIGN_OR_OTHER_REGION_PATTERN = new RegExp(
  String.raw`\b(?:${[
    String.raw`lati(?:s|st|le|l|lt|ga)?|latvia(?:n)?|soome(?:s|st|le|l|lt|ga)?|finland(?:s)?`,
    String.raw`rootsi(?:s|st|le|l|lt|ga)?|sweden|norra(?:s|st|le|l|lt|ga)?|norway|leedu(?:s|st|le|l|lt|ga)?|lithuania(?:n)?`,
    String.raw`taani(?:s|st|le|l|lt|ga)?|denmark|island(?:il|ilt|ile|i)?|iceland|poola(?:s|st|le|l|lt|ga)?|poland`,
    String.raw`saksamaa(?:l|lt|le|ga)?|germany|prantsusmaa(?:l|lt|le|ga)?|france|venemaa(?:l|lt|le|ga)?|russia(?:n)?`,
    String.raw`ukraina(?:s|st|le|l|lt|ga)?|ukraine|valgevene(?:s|st|le|l|lt|ga)?|belarus|hispaania(?:s|st|le|l|lt|ga)?|spain`,
    String.raw`itaalia(?:s|st|le|l|lt|ga)?|italy|austria(?:s)?|belgia(?:s|st|le|l|lt|ga)?|belgium|holland|madalmaad|netherlands`,
    String.raw`sveits(?:is|ist|ile|ilt|iga)?|switzerland|tsehhi(?:s|st|le|l|lt|ga)?|czechia|slovakkia|slovakia|sloveenia|slovenia`,
    String.raw`horvaatia|croatia|rumeenia|romania|bulgaaria|bulgaria|kreeka|greece|portugal|iirimaa|ireland|ungari|hungary`,
    String.raw`uhendkuningriik|suurbritannia|united\s+kingdom|britain|usa|uhendriigid|united\s+states|canada|kanada|china|hiina|japan|jaapan`,
    String.raw`australia|austraalia|new\s+zealand|uus\s+meremaa|india|brazil|brasiilia|argentina|mexico|mehhiko`,
    String.raw`euroopa\w*|europe|european|baltikum\w*|baltic\s+states?|scandinavia\w*|skandinaavia\w*|nordic\w*|pohjamaad`,
    String.raw`aasia\w*|asia(?:n)?|aafrika\w*|africa(?:n)?|north\s+america(?:n)?|south\s+america(?:n)?|ameerika\w*`,
    String.raw`amazon\w*|siberia\w*|arctic\w*|arktika\w*|worldwide|world|global\w*|maailm\w*`,
  ].join("|")})\b`,
  "u",
);

const FORESTRY_EXPLICIT_MUNICIPALITY_SCOPE_PATTERN = /\b(?:linn|linna|linnas|linnavalitsus\w*|vald|valla|vallas|vallavalitsus\w*|omavalitsus\w*|municipalit\w*|(?:municipal|local)\s+government|city(?:\s+government)?)\b/u;
const FORESTRY_EXPLICIT_OTHER_GEOGRAPHY_PATTERNS = Object.freeze([
  /\b(?:forest|woodland)\s+(?:area|cover(?:age)?(?:\s+(?:percentage|percent|share))?)\s+(?:of|in|for)\s+(?:the\s+)?(?!(?:the|estonia|estonian|hectares?|percent(?:age)?|share|total|current|latest|today|year|square\s+kilomet(?:er|re)s?)\b)[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3}\b/u,
  /\bhow\s+much\s+(?:forest|woodland)\s+(?:is(?:\s+there)?|lies)\s+in\s+(?:the\s+)?(?!(?:the|estonia|country)\b)[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3}\b/u,
  /\bhow\s+many\s+hectares\s+of\s+(?:forest|woodland)(?:\s+are\s+there)?\s+in\s+(?:the\s+)?(?!(?:the|estonia|country)\b)[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3}\b/u,
  /\b(?:percentage|percent|share)\s+of\s+(?:the\s+)?(?!(?:the|estonia|country)\b)[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3}\s+is\s+(?:forest|woodland)\b/u,
]);
const FORESTRY_AREA_CORE_METRIC_SOURCE = String.raw`(?:forest|woodland)\s+(?:area|cover(?:age)?(?:\s+(?:percentage|percent|share))?)`;
const FORESTRY_AREA_REQUEST_PREFIX_SOURCE = String.raw`(?:(?:what|how\s+much)\s+(?:is|was)\s+(?:the\s+)?|(?:(?:please|kindly)\s+)?(?:(?:can|could|would)\s+you\s+)?(?:show|give|tell|report)\s+(?:me\s+)?(?:the\s+)?)`;
const FORESTRY_AREA_METRIC_QUERY_SOURCE = String.raw`(?:${FORESTRY_AREA_REQUEST_PREFIX_SOURCE})?${FORESTRY_AREA_CORE_METRIC_SOURCE}`;
const FORESTRY_NATURAL_AREA_QUERY_SOURCE = String.raw`(?:how\s+much\s+(?:forest|woodland)(?:\s+(?:is(?:\s+there)?|lies))?|how\s+many\s+hectares\s+of\s+(?:forest|woodland)(?:\s+are\s+there)?)`;
const FORESTRY_TIME_COMPLEMENT_SOURCE = String.raw`(?:(?:this|current|present|latest|last|previous|recent|most\s+recent|newest(?:\s+available)?)\s+year|year\s+(?:19|20)\d{2}|(?:19|20)\d{2}|today|now|currently|at\s+present|as\s+of\s+(?:today|now|(?:19|20)\d{2})|all\s+years|period(?:\s+from)?\s+(?:19|20)\d{2}\s+(?:to|until|through)\s+(?:19|20)\d{2}|years?\s+(?:19|20)\d{2}\s+(?:to|until|through)\s+(?:19|20)\d{2})`;
const FORESTRY_UNIT_COMPLEMENT_SOURCE = String.raw`(?:(?:(?:\d+(?:[.,]\d+)?|thousands?|millions?|billions?)(?:\s+of)?\s+)?(?:hectares?|ha|acres?|(?:square|sq\.?)\s+(?:met(?:er|re)s?|kilomet(?:er|re)s?|feet|foot|yards?|miles?|m|km|ft|yd|mi)|cubic\s+(?:met(?:er|re)s?|kilomet(?:er|re)s?)|m2|km2|ft2|yd2|mi2)|(?:thousands?|millions?|billions?))`;
const FORESTRY_AGGREGATE_COMPLEMENT_SOURCE = String.raw`(?:total|overall|percentage|percent|share|percentage\s+points)`;
const FORESTRY_EXPLICIT_NATIONAL_AREA_QUERY_SOURCE = String.raw`(?:${FORESTRY_AREA_REQUEST_PREFIX_SOURCE})?(?:(?:current|latest|most\s+recent|newest(?:\s+available)?)\s+)?(?:estonia|eesti)(?:\s+s)?\s+(?:(?:current|latest|most\s+recent|newest(?:\s+available)?)\s+)?${FORESTRY_AREA_CORE_METRIC_SOURCE}`;
const FORESTRY_NATIONAL_DEFAULT_AREA_COMPLEMENT_SOURCES = Object.freeze([
  String.raw`${FORESTRY_AREA_METRIC_QUERY_SOURCE}\s+(?:in|for|of|by)\s+(?:the\s+)?${FORESTRY_TIME_COMPLEMENT_SOURCE}`,
  String.raw`${FORESTRY_AREA_METRIC_QUERY_SOURCE}\s+${FORESTRY_TIME_COMPLEMENT_SOURCE}`,
  String.raw`${FORESTRY_AREA_METRIC_QUERY_SOURCE}\s+in\s+${FORESTRY_UNIT_COMPLEMENT_SOURCE}`,
  String.raw`${FORESTRY_AREA_METRIC_QUERY_SOURCE}\s+in\s+(?:the\s+)?${FORESTRY_AGGREGATE_COMPLEMENT_SOURCE}`,
  String.raw`${FORESTRY_AREA_METRIC_QUERY_SOURCE}\s+(?:in|for|of)\s+(?:the\s+)?(?:estonia|eesti|country|nation)`,
  String.raw`${FORESTRY_NATURAL_AREA_QUERY_SOURCE}\s+(?:in|for|of|by)\s+(?:the\s+)?${FORESTRY_TIME_COMPLEMENT_SOURCE}`,
  String.raw`${FORESTRY_NATURAL_AREA_QUERY_SOURCE}\s+in\s+${FORESTRY_UNIT_COMPLEMENT_SOURCE}`,
  String.raw`${FORESTRY_NATURAL_AREA_QUERY_SOURCE}\s+in\s+(?:the\s+)?${FORESTRY_AGGREGATE_COMPLEMENT_SOURCE}`,
  String.raw`${FORESTRY_NATURAL_AREA_QUERY_SOURCE}\s+(?:in|for|of)\s+(?:the\s+)?(?:estonia|eesti|country|nation)`,
  String.raw`${FORESTRY_EXPLICIT_NATIONAL_AREA_QUERY_SOURCE}\s+(?:in|for|of|by)\s+(?:the\s+)?${FORESTRY_TIME_COMPLEMENT_SOURCE}`,
  String.raw`${FORESTRY_EXPLICIT_NATIONAL_AREA_QUERY_SOURCE}\s+in\s+${FORESTRY_UNIT_COMPLEMENT_SOURCE}`,
  String.raw`${FORESTRY_EXPLICIT_NATIONAL_AREA_QUERY_SOURCE}\s+in\s+(?:the\s+)?${FORESTRY_AGGREGATE_COMPLEMENT_SOURCE}`,
  FORESTRY_EXPLICIT_NATIONAL_AREA_QUERY_SOURCE,
]);
const FORESTRY_NATIONAL_DEFAULT_AREA_COMPLEMENT_PATTERNS = Object.freeze(
  FORESTRY_NATIONAL_DEFAULT_AREA_COMPLEMENT_SOURCES.map((source) => new RegExp(`^${source}$`, "u")),
);
const FORESTRY_NATIONAL_DEFAULT_AREA_COMPLEMENT_RESIDUAL_PATTERNS = Object.freeze(
  FORESTRY_NATIONAL_DEFAULT_AREA_COMPLEMENT_SOURCES.map(
    (source) => new RegExp(`^${source}\\s+(.+)$`, "u"),
  ),
);
const FORESTRY_REVIEWED_AREA_CONTINUATION_PATTERNS = Object.freeze([
  new RegExp(String.raw`^(?:and\s+)?(?:in|for|of|by)\s+(?:the\s+)?${FORESTRY_TIME_COMPLEMENT_SOURCE}(?:\s+|$)`, "u"),
  new RegExp(String.raw`^(?:and\s+)?in\s+${FORESTRY_UNIT_COMPLEMENT_SOURCE}(?:\s+|$)`, "u"),
  new RegExp(String.raw`^(?:and\s+)?in\s+(?:the\s+)?${FORESTRY_AGGREGATE_COMPLEMENT_SOURCE}(?:\s+|$)`, "u"),
  /^(?:and\s+)?(?:in|for|of)\s+(?:the\s+)?(?:estonia|eesti|country|nation)(?:\s+|$)/u,
  // Once an explicit national complement has been consumed, ordinary trailing
  // time/unit/aggregate qualifiers need no second preposition: “in Estonia
  // this year” is complete, while “in Estonia this year for Gondor” still
  // leaves a query-bound residual and fails closed on the next iteration.
  new RegExp(String.raw`^(?:and\s+)?(?:the\s+)?${FORESTRY_TIME_COMPLEMENT_SOURCE}(?:\s+|$)`, "u"),
  new RegExp(String.raw`^(?:and\s+)?${FORESTRY_UNIT_COMPLEMENT_SOURCE}(?:\s+|$)`, "u"),
  new RegExp(String.raw`^(?:and\s+)?(?:the\s+)?${FORESTRY_AGGREGATE_COMPLEMENT_SOURCE}(?:\s+|$)`, "u"),
  /^(?:and\s+)?(?:(?:according\s+to|based\s+on|using|from)\s+(?:the\s+)?(?:official\s+)?(?:smi|nfi|data|statistics|figures)(?:\s+data)?|nationally|nationwide|countrywide)(?:\s+|$)/u,
]);
const FORESTRY_REVIEWED_COURTESY_RESIDUAL_PATTERN = /^(?:and\s+)?(?:please|palun|thanks|thank\s+you|if\s+possible)$/u;
const FORESTRY_REVIEWED_EXPLICIT_NATIONAL_AREA_PATTERNS = Object.freeze([
  /^(?:(?:what\s+(?:is|was)\s+(?:the\s+)?|show\s+(?:me\s+)?(?:the\s+)?))?(?:(?:current|latest|most\s+recent|newest(?:\s+available)?)\s+)?(?:estonia|eesti)(?:\s+s)?\s+(?:forest|woodland)\s+(?:area|cover(?:age)?(?:\s+(?:percentage|percent|share))?)$/u,
  /^(?:(?:what\s+(?:is|was)\s+(?:the\s+)?|show\s+(?:me\s+)?(?:the\s+)?))?(?:estonia|eesti)(?:\s+s)?\s+(?:(?:current|latest|most\s+recent|newest(?:\s+available)?)\s+)?(?:forest|woodland)\s+(?:area|cover(?:age)?(?:\s+(?:percentage|percent|share))?)$/u,
]);

function reviewNationalDefaultForestryAreaComplement(value) {
  const text = normalizeMunicipalityText(value);
  if (FORESTRY_REVIEWED_EXPLICIT_NATIONAL_AREA_PATTERNS.some((pattern) => pattern.test(text))
    || FORESTRY_NATIONAL_DEFAULT_AREA_COMPLEMENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return { matched: true, reviewed: true, residual: null };
  }
  for (const pattern of FORESTRY_NATIONAL_DEFAULT_AREA_COMPLEMENT_RESIDUAL_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    let residual = match[1];
    while (residual) {
      if (FORESTRY_REVIEWED_COURTESY_RESIDUAL_PATTERN.test(residual)) {
        return { matched: true, reviewed: true, residual: null };
      }
      const continuation = FORESTRY_REVIEWED_AREA_CONTINUATION_PATTERNS
        .map((candidate) => residual.match(candidate)?.[0] || "")
        .sort((left, right) => right.length - left.length)[0];
      if (!continuation) return { matched: true, reviewed: false, residual };
      residual = residual.slice(continuation.length).trim();
    }
    return { matched: true, reviewed: true, residual: null };
  }
  return { matched: false, reviewed: false, residual: null };
}

export function isReviewedNationalDefaultForestryAreaComplement(value) {
  return reviewNationalDefaultForestryAreaComplement(value).reviewed;
}

function unresolvedNationalDefaultForestryAreaResidual(value) {
  return reviewNationalDefaultForestryAreaComplement(value).residual;
}

const FORESTRY_AREA_ENTITY_CONTEXT_PATTERN = /\b(?:(?:forest|woodland)\s+(?:area|cover(?:age)?(?:\s+(?:percentage|percent|share))?|hectares?)|forest\s+hectares?|hectares?\s+(?:of\s+)?(?:forest|woodland)|hectares?\s+are\s+forested|how\s+much\s+(?:forest|woodland)|how\s+many\s+(?:forest\s+hectares?|hectares?)|metsamaa\w*\s+pindala\w*|metsasus\w*|kui\s+palju\s+metsa)\b/u;
const FORESTRY_REVIEWED_NON_ENTITY_TOKENS = new Set([
  "a", "about", "according", "acre", "acres", "across", "age", "aged", "all", "and", "annual", "are", "area",
  "against", "alongside", "answer", "areas", "as", "at", "available", "average", "based", "between",
  "billion", "billions", "breakdown", "by", "calculate", "can", "categories", "category", "class",
  "based", "broken", "categorised", "categorized", "classes", "classified", "commercial", "compare", "compared", "comparison", "conservation", "contain", "contains",
  "could", "country", "countrywide", "cover", "coverage", "cubic", "current", "currently", "data",
  "annual", "annually", "change", "changed", "changes", "changing", "did", "differ", "difference",
  "chronology", "decade", "decades", "different", "differs", "disaggregated", "display", "divided", "down", "each", "every", "evolution",
  "do", "does", "during", "estimate", "except", "figure", "figures", "find",
  "eesti", "estonia", "estonian", "estimated", "for", "forest", "forested", "forests", "from", "give",
  "get", "group", "grouped", "groups", "growing", "ha", "had", "harvest", "has", "have", "hectare", "hectares", "historical", "history", "how",
  "i", "if", "in", "is", "just", "kindly", "km", "km2", "know", "kilometer", "kilometers", "kilometre",
  "kilometres", "last", "latest", "land", "list", "managed", "management", "many", "m2", "me", "meter",
  "longitudinal", "longitudinally", "m", "meters", "metre", "metres", "middle", "million", "millions", "month", "months", "most", "much", "multiple", "nation", "national",
  "nationally", "nationwide", "need", "newest", "now", "of", "official", "old", "on", "only", "over",
  "overall",
  "owned", "owner", "ownership", "palun", "percentage", "percent", "per", "period", "please", "points",
  "periods", "possible", "present", "previous", "private", "privately", "production", "productive", "productivity", "protected", "protection",
  "provide", "public",
  "exclude", "excluded", "excluding", "recent", "relative", "report", "reported", "result", "s", "share",
  "quarter", "quarters", "regime", "regimes", "segmented", "separated", "show", "smi", "species", "split", "sq", "square", "feet", "foot", "ft", "ft2", "timeline", "yard", "yards", "yd", "yd2",
  "mile", "miles", "mi", "mi2",
  "series", "several", "state", "statistics", "statistic", "status", "stock", "strictly", "successive", "tell", "than", "thank", "thanks",
  "the", "there", "this", "through", "thousand", "thousands", "time", "to", "today", "total", "trend",
  "tenure", "type", "types", "unmanaged", "unprotected", "until", "us", "use", "value", "versus", "vs", "want", "was",
  "we", "were", "what", "where", "which", "why", "will", "with", "without", "woodland", "would", "year",
  "since", "yearly", "years", "you", "young", "trends",
  // Normalized Estonian request, national, temporal, unit and aggregate words.
  "aasta", "aastal", "aastane", "aastate", "ajalooline", "ajalugu", "andmed", "andmetel", "anna",
  "eestis", "eestil", "hektar", "hektarit", "hektarites", "ja", "jargi", "kaitse", "kaupa", "kogu", "loikes",
  "kokku", "kui", "metsa", "metsamaa", "metsasus", "muutus", "muutused", "omandivormi",
  "mis", "mulle", "naita", "ning", "oli", "on", "osakaal", "palju", "pindala", "praegune", "protsent",
  "protsendid", "protsentides", "range", "riigi", "statistika", "suur", "tanapaeval", "tanavu", "uusim",
  "viimane",
]);
const FORESTRY_REVIEWED_NON_ENTITY_TOKEN_PATTERNS = Object.freeze([
  /^(?:omandivorm|omandiliik|omanikuliig|kaitsekategoori|kaitseklass|kaitsestaatus|kaitsereziim|majandamiskategoori|majandamisviis|majandamisstaatus|puuliig|vanuseklass|maakasutus|tootlikkus)\w*$/u,
]);
const FORESTRY_AREA_PREPOSITION_COMPLEMENT_PATTERN = /(?=\b(?:in|for|of)\s+(?:the\s+)?([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,4}))/gu;
const FORESTRY_AREA_PREFIX_ENTITY_PATTERN = /^(?:(?:what\s+(?:is|was)|show\s+(?:me)?|give\s+me|tell\s+me|compare)\s+(?:the\s+)?)?((?:[a-z][a-z-]*\s+){1,7}?)(?:forest|woodland)\s+(?:area|cover(?:age)?(?:\s+(?:percentage|percent|share))?)\b/u;
const FORESTRY_AREA_HAVE_ENTITY_PATTERN = /\b(?:how\s+much\s+(?:forest|woodland)|how\s+many\s+(?:forest\s+hectares?|hectares?\s+of\s+(?:forest|woodland)))\s+(?:does|did|would|could)\s+((?:[a-z][a-z-]*\s+){1,4}?)(?:have|contain)\b/u;
const FORESTRY_ESTONIAN_AREA_PREFIX_ENTITY_PATTERN = /^(?:(?:kui\s+suur\s+on|mis\s+on|naita(?:\s+mulle)?|anna(?:\s+mulle)?|palun)\s+)?((?:[a-z][a-z-]*\s+){1,6}?)(?:metsamaa\w*\s+pindala\w*|metsasus\w*)\b/u;
const FORESTRY_REVERSED_HAVE_ENTITY_PATTERN = /^((?:[a-z][a-z-]*\s+){1,5}?)(?:has|had)\s+(?:how\s+much\s+(?:forest|woodland)|how\s+many\s+(?:forest\s+hectares?|hectares?\s+of\s+(?:forest|woodland)))\b/u;
const FORESTRY_ESTONIAN_REVERSED_ENTITY_PATTERN = /^((?:[a-z][a-z-]*\s+){1,5}?)(?:on|oli)\s+kui\s+palju\s+metsa\b/u;
const FORESTRY_AREA_SUFFIX_ENTITY_PATTERNS = Object.freeze([
  /\b(?:forest|woodland)\s+(?:area|cover(?:age)?(?:\s+(?:percentage|percent|share))?)\b\s+(.+)$/u,
  /\b(?:how\s+much\s+(?:forest|woodland)|how\s+many\s+(?:forest\s+hectares?|hectares?(?:\s+of\s+(?:forest|woodland))?))\b\s+(.+)$/u,
  /\b(?:metsamaa\w*\s+pindala\w*|metsasus\w*)\b\s+(.+)$/u,
  /\bkui\s+palju\s+metsa\b\s+(.+)$/u,
]);
const FORESTRY_AREA_COMPARISON_PATTERN = /\b(?:compare|comparison|compared\s+(?:with|to|against)|versus|vs|relative\s+to|alongside|against|differ(?:s|ed|ing)?\s+from|difference\s+between|and)\b/u;
// A narrow national area + methodology question must not turn its complete
// explanatory suffix into an open-class locality. The anchors are deliberate:
// appended places or private clauses remain unresolved and fail closed.
const FORESTRY_REVIEWED_NATIONAL_MIXED_AREA_METHOD_PATTERNS = Object.freeze([
  /^kui\s+palju\s+metsa\s+(?:eestis\s+on|on\s+eestis)\s+ja\s+kuidas\s+(?:seda|metsa)\s+(?:moodetakse|hinnatakse)$/u,
  /^how\s+much\s+(?:forest|woodland)(?:\s+area)?\s+(?:is(?:\s+there)?\s+in\s+estonia|does\s+estonia\s+have)\s+and\s+how\s+is\s+it\s+(?:measured|estimated|calculated|surveyed|inventoried)$/u,
  /^what\s+is\s+the\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\s+in\s+estonia\s+and\s+how\s+is\s+it\s+(?:measured|estimated|calculated|surveyed|inventoried)$/u,
  /^(?:what\s+is\s+)?estonia\s+s\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\s+and\s+how\s+is\s+it\s+(?:measured|estimated|calculated|surveyed|inventoried)$/u,
  /^(?:what\s+is\s+)?(?:the\s+)?(?:country|nation)\s+s\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\s+in\s+estonia\s+and\s+how\s+is\s+it\s+(?:measured|estimated|calculated|surveyed|inventoried)$/u,
]);

function isReviewedNationalMixedForestAreaMethodQuestion(value) {
  // The matcher below intentionally uses the lossy Estonian/English catalogue
  // normalization. Refuse that shortcut when another script would disappear;
  // otherwise an appended name or locality could make a non-complete query
  // look exactly like one of these anchored national questions.
  if (hasLossyUnicodeForestryAreaResidual(value)) return false;
  const text = normalizeMunicipalityText(value);
  return FORESTRY_REVIEWED_NATIONAL_MIXED_AREA_METHOD_PATTERNS.some(
    (pattern) => pattern.test(text),
  );
}
const FORESTRY_BREAKDOWN_METRIC_SOURCE = String.raw`(?:(?:forest|woodland)\s+(?:area|cover(?:age)?(?:\s+(?:percentage|percent|share))?)|metsamaa\w*(?:\s+pindala\w*)?|metsasus\w*|metsa\s+pindala\w*)`;
const FORESTRY_BREAKDOWN_DIMENSION_SOURCE = String.raw`(?:ownership|tenure|owner|management|protection|conservation|age|species|land[-\s]+use|harvest|productivity|omandivorm\w*|omandiliik\w*|omanikuliig\w*|kaitsekategoori\w*|kaitseklas\w*|kaitsestaatu\w*|kaitsere[zž]iim\w*|majandamiskategoori\w*|majandamisviis\w*|majandamisstaatu\w*|puuliig\w*|vanuseklas\w*|maakasutus\w*|tootlikkus\w*)`;
const FORESTRY_BREAKDOWN_CONNECTOR_SUFFIX_SOURCE = String.raw`(?:\s+(?:j[aä]rgi|kaupa|l[oõ]ikes))?`;
const UNSUPPORTED_FOREST_AREA_BREAKDOWN_PATTERNS = Object.freeze([
  /\b(?:by|per|with|under|across|according\s+to|based\s+on|grouped\s+by|classified\s+by|categorised\s+by|categorized\s+by|broken\s+down\s+by|split\s+by|divided\s+by|segmented\s+by|separated\s+by|disaggregated\s+by)\s+(?:(?:legal|forest|woodland|public|private|state|municipal|government|commercial|ecological|owner|ownership|management|protection|conservation|age|species|land[-\s]+use|harvest|productivity)\s+){0,2}(?:ownership|tenure|owner|management|protection|conservation|age|species|land[-\s]+use|harvest|productivity|categor(?:y|ies)|class(?:es)?|type(?:s)?|status(?:es)?|regime(?:s)?|group(?:s)?|breakdown)\b/iu,
  /\b(?:by|under|according\s+to)\s+(?:private|public|state(?:[-\s]+owned)?|municipal|government|corporate|individual)\s+ownership\b/iu,
  /\b(?:private|public|state(?:[-\s]+owned)?|municipal|government|corporate|individual)\s+ownership\b/iu,
  /\b(?:ownership|tenure|owner)\s+(?:categor(?:y|ies)|class(?:es)?|type(?:s)?|breakdown)\b/iu,
  /\bownership[-\s]+specific\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\b/iu,
  /\b(?:for|within)\s+each\s+(?:ownership|tenure|owner|management|protection|conservation|age|species|land[-\s]+use)\s+(?:categor(?:y|ies)|class(?:es)?|type(?:s)?|status(?:es)?|regime(?:s)?|group(?:s)?)\b/iu,
  /\b(?:excluding|exclude(?:d|s)?|without|except(?:\s+for)?)\b[\s\S]{0,60}\b(?:protected|unprotected|private|public|state(?:[-\s]+owned)?|municipal|commercial|production|productive|managed|unmanaged)?\s*(?:forests?|woodlands?)\b/iu,
  /\b(?:only|just)\s+(?:protected|unprotected|private|public|state(?:[-\s]+owned)?|municipal|commercial|production|productive|managed|unmanaged)\s+(?:forests?|woodlands?)\b/iu,
  /\b(?:protected|unprotected|private|public|state(?:[-\s]+owned)?|municipal|commercial|production|productive|managed|unmanaged|old[-\s]+growth|young)\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\b/iu,
  /\b(?:forest|woodland)\s+(?:area|cover(?:age)?)\s+(?:of|for)\s+(?:privately\s+owned|publicly\s+owned|state(?:[-\s]+owned)?|municipal|protected|unprotected|commercial|productive)\s+(?:forests?|woodlands?)\b/iu,
  /\b(?:omandivorm\w*|omanikuliig\w*|kaitsealuse\w*|kaitsmata\w*|erametsa\w*|riigimetsa\w*|majandatava\w*|majandamata\w*)\b[\s\S]{0,45}\b(?:metsamaa\w*|metsasus\w*|pindala\w*)\b/iu,
  /\b(?:metsamaa\w*|metsasus\w*|metsa\s+pindala\w*)\b[\s\S]{0,45}\b(?:omandivorm\w*|omanikuliig\w*|omanike\s+kaupa|kaitsekategoori\w*|majandamiskategoori\w*|puuliigi\w*|vanuseklassi\w*)\b/iu,
  /\b(?:kui\s+palju\s+metsa|mitu\s+hektarit\s+metsa)\b[\s\S]{0,70}\b(?:(?:omandivorm|omanikuliig)\w*|omanike)\s+(?:j[aä]rgi|kaupa|l[oõ]ikes)\b/iu,
  // A user can mix the English metric with an Estonian dimension or
  // connector. Treat the metric and dimension independently instead of
  // requiring the whole phrase to use one language; otherwise a national
  // total can be mistaken for the requested category breakdown.
  new RegExp(String.raw`\b${FORESTRY_BREAKDOWN_METRIC_SOURCE}\b[\s\S]{0,60}\b${FORESTRY_BREAKDOWN_DIMENSION_SOURCE}${FORESTRY_BREAKDOWN_CONNECTOR_SUFFIX_SOURCE}\b`, "iu"),
  new RegExp(String.raw`\b${FORESTRY_BREAKDOWN_DIMENSION_SOURCE}${FORESTRY_BREAKDOWN_CONNECTOR_SUFFIX_SOURCE}\b[\s\S]{0,60}\b${FORESTRY_BREAKDOWN_METRIC_SOURCE}\b`, "iu"),
]);

export function requestsUnsupportedForestAreaBreakdown(value) {
  return UNSUPPORTED_FOREST_AREA_BREAKDOWN_PATTERNS.some(
    (pattern) => pattern.test(String(value || "")),
  );
}

const REVIEWED_NATIONAL_FOREST_BREAKDOWN_DIMENSION_SOURCE = String.raw`(?:(?:(?:legal|forest|woodland|public|private|state|municipal|government|corporate|individual)\s+){0,2}(?:ownership|tenure|management|protection|conservation|age|species|land\s+use|harvest|productivity))(?:\s+(?:breakdown|categor(?:y|ies)|class(?:es)?|type(?:s)?|status(?:es)?|regime(?:s)?|group(?:s)?))?`;
const REVIEWED_NATIONAL_FOREST_BREAKDOWN_SUFFIX_SOURCE = String.raw`(?:(?:by|according\s+to|across)\s+${REVIEWED_NATIONAL_FOREST_BREAKDOWN_DIMENSION_SOURCE}|(?:broken\s+down|grouped|divided|split|disaggregated)\s+by\s+${REVIEWED_NATIONAL_FOREST_BREAKDOWN_DIMENSION_SOURCE})`;
const REVIEWED_NATIONAL_FOREST_BREAKDOWN_PATTERNS = Object.freeze([
  new RegExp(
    String.raw`^how\s+much\s+(?:forest|woodland)(?:\s+area)?\s+(?:is(?:\s+there)?\s+in\s+estonia|does\s+estonia\s+have)\s+and\s+how\s+is\s+it\s+(?:measured|estimated|calculated|surveyed|inventoried)\s+${REVIEWED_NATIONAL_FOREST_BREAKDOWN_SUFFIX_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^what\s+is\s+the\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\s+in\s+estonia\s+and\s+how\s+is\s+it\s+(?:measured|estimated|calculated|surveyed|inventoried)\s+${REVIEWED_NATIONAL_FOREST_BREAKDOWN_SUFFIX_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^(?:forest|woodland)\s+(?:area|cover(?:age)?)\s+in\s+estonia\s+and\s+how\s+is\s+it\s+(?:measured|estimated|calculated|surveyed|inventoried)\s+${REVIEWED_NATIONAL_FOREST_BREAKDOWN_SUFFIX_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^(?:forest|woodland)\s+(?:area|cover(?:age)?)\s+in\s+estonia\s+${REVIEWED_NATIONAL_FOREST_BREAKDOWN_SUFFIX_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^(?:forest|woodland)\s+(?:area|cover(?:age)?)\s+in\s+estonia\s+${REVIEWED_NATIONAL_FOREST_BREAKDOWN_SUFFIX_SOURCE}\s+and\s+how\s+is\s+it\s+(?:measured|estimated|calculated|surveyed|inventoried)$`,
    "u",
  ),
  /^(?:metsamaa(?:\s+pindala)?|metsa\s+pindala|metsasus)\s+eestis\s+(?:(?:omandivorm|omanikuliig)\w*|omanike)\s+(?:jargi|kaupa|loikes)$/u,
  /^kui\s+palju\s+metsa\s+(?:eestis\s+on|on\s+eestis)\s+(?:(?:omandivorm|omanikuliig)\w*|omanike)\s+(?:jargi|kaupa|loikes)\s+ja\s+kuidas\s+(?:seda|metsa)\s+(?:moodetakse|hinnatakse|arvutatakse|inventeeritakse)$/u,
]);

// These are complete, public aggregate questions. Keep the grammar closed so
// an appended locality, natural-person name, contact field or private asset
// can never inherit the national SMI route merely because the prefix is safe.
export function isReviewedNationalUnsupportedForestAreaBreakdownQuestion(value) {
  if (hasLossyUnicodeForestryAreaResidual(value)) return false;
  const text = normalizeMunicipalityText(value);
  return requestsUnsupportedForestAreaBreakdown(value)
    && REVIEWED_NATIONAL_FOREST_BREAKDOWN_PATTERNS.some((pattern) => pattern.test(text));
}

const UNSUPPORTED_FOREST_AREA_TIME_SERIES_PATTERNS = Object.freeze([
  /\b(?:trend|trends|history|historical|chronology|timeline|longitudinal(?:ly)?|time\s+series|year[-\s]+by[-\s]+year|period[-\s]+by[-\s]+period|year\s+to\s+year|(?:by|per)\s+(?:calendar\s+)?(?:year|decade|quarter|month)|(?:by|per)\s+(?:time\s+)?periods?|(?:each|every|all)\s+(?:year|period|decade|quarter|month)|multiple\s+(?:years?|periods?|decades?)|several\s+(?:years?|periods?|decades?)|different\s+(?:years?|periods?|decades?)|annual(?:ly)?|yearly|(?:change(?:d|s)?\s+)?over\s+time|through\s+time|evolution)\b/iu,
  /\b(?:over|through|during|across|between)\s+(?:the\s+)?(?:(?:all|multiple|several|different|successive|consecutive|previous|past|recent)\s+)?(?:years?|(?:time\s+)?periods?|decades?)\b/iu,
  /\bfor\s+(?:all|each|every|multiple|several|different|successive|consecutive|previous|past|recent)\s+(?:years?|periods?|decades?)\b/iu,
  /\b(?:from|between|period(?:\s+from)?)\s+(?:19|20)\d{2}\s+(?:to|until|through|and|[-–—])\s+(?:19|20)\d{2}\b/iu,
  /\b(?:19|20)\d{2}\s*(?:to|until|through|[-–—])\s*(?:19|20)\d{2}\b/iu,
  /\b(?:since\s+(?:19|20)\d{2}|over\s+the\s+(?:last|past)\s+\d{1,3}\s+years?)\b/iu,
  /\b(?:aastate\s+kaupa|aasta-aastalt|aegrida\w*|ajaloolin\w*|ajalugu\w*|trend\w*|muutus\w*\s+ajas)\b/iu,
]);

export function requestsUnsupportedForestAreaTimeSeries(value) {
  const years = new Set(
    [...String(value || "").matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => match[0]),
  );
  return years.size > 1 || UNSUPPORTED_FOREST_AREA_TIME_SERIES_PATTERNS.some(
    (pattern) => pattern.test(String(value || "")),
  );
}

const UNSUPPORTED_FOREST_AREA_UNIT_PATTERN = /(?:\b(?:acres?|(?:square|sq\.?)\s*(?:m|km|met(?:er|re)s?|kilomet(?:er|re)s?|feet|foot|ft|yards?|yd|miles?|mi)|m2|km2|ft2|yd2|mi2|cubic\s+(?:met(?:er|re)s?|kilomet(?:er|re)s?))\b|\b(?:m|km|ft|yd|mi)²(?![\p{L}\p{N}]))/iu;

export function requestsUnsupportedForestAreaUnit(value) {
  return UNSUPPORTED_FOREST_AREA_UNIT_PATTERN.test(String(value || ""));
}

function unresolvedEntityTokens(value) {
  return normalizeMunicipalityText(value)
    .split(" ")
    .filter((token) => token && !/^\d+(?:[.,]\d+)?$/u.test(token)
      && !FORESTRY_REVIEWED_NON_ENTITY_TOKENS.has(token)
      && !FORESTRY_REVIEWED_NON_ENTITY_TOKEN_PATTERNS.some((pattern) => pattern.test(token)));
}

export function hasLossyUnicodeForestryAreaResidual(value) {
  // normalizeMunicipalityText intentionally folds reviewed Estonian/English
  // wording to ASCII for catalogue matching. Any other Unicode letter or
  // number would disappear at that boundary, so keep it as an unresolved
  // query-bound residual instead of letting a reviewed national prefix absorb
  // an appended name, address or locality in another script.
  const normalizedText = normalizeMunicipalityText(value);
  if (!FORESTRY_AREA_ENTITY_CONTEXT_PATTERN.test(normalizedText)) return false;
  const decomposed = String(value || "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "");
  return [...decomposed].some((character) => (
    /[\p{Letter}\p{Number}]/u.test(character)
    && !/[0-9A-Za-z]/u.test(character)
  ));
}

// National SMI evidence is eligible only when an English forest-area query
// leaves no unreviewed entity around its metric. This catches open-class place
// names before the metric, as the subject of “does … have”, in comparisons,
// and after alternate temporal wording. It deliberately returns only a
// query-bound residual; it does not try to assert that the text names a real
// place.
export function hasUnresolvedForestryAreaEntity(value) {
  const text = normalizeMunicipalityText(value);
  if (!FORESTRY_AREA_ENTITY_CONTEXT_PATTERN.test(text)) return false;
  if (hasLossyUnicodeForestryAreaResidual(value)) return true;
  if (isReviewedNationalMixedForestAreaMethodQuestion(value)) return false;
  if (isReviewedNationalUnsupportedForestAreaBreakdownQuestion(value)) return false;

  const prefixEntity = text.match(FORESTRY_AREA_PREFIX_ENTITY_PATTERN)?.[1] || "";
  if (prefixEntity && unresolvedEntityTokens(prefixEntity).length) return true;

  const estonianPrefixEntity = text.match(FORESTRY_ESTONIAN_AREA_PREFIX_ENTITY_PATTERN)?.[1] || "";
  if (estonianPrefixEntity && unresolvedEntityTokens(estonianPrefixEntity).length) return true;

  const haveEntity = text.match(FORESTRY_AREA_HAVE_ENTITY_PATTERN)?.[1] || "";
  if (haveEntity && unresolvedEntityTokens(haveEntity).length) return true;

  const reversedHaveEntity = text.match(FORESTRY_REVERSED_HAVE_ENTITY_PATTERN)?.[1] || "";
  if (reversedHaveEntity && unresolvedEntityTokens(reversedHaveEntity).length) return true;

  const estonianReversedEntity = text.match(FORESTRY_ESTONIAN_REVERSED_ENTITY_PATTERN)?.[1] || "";
  if (estonianReversedEntity && unresolvedEntityTokens(estonianReversedEntity).length) return true;

  for (const match of text.matchAll(FORESTRY_AREA_PREPOSITION_COMPLEMENT_PATTERN)) {
    const candidate = match[1] || "";
    if (unresolvedEntityTokens(candidate).length) return true;
  }

  for (const pattern of FORESTRY_AREA_SUFFIX_ENTITY_PATTERNS) {
    const suffixEntity = text.match(pattern)?.[1] || "";
    if (suffixEntity && unresolvedEntityTokens(suffixEntity).length) return true;
  }

  if (FORESTRY_AREA_COMPARISON_PATTERN.test(text)
    && FORESTRY_NATIONAL_SCOPE_PATTERN.test(text)
    && unresolvedEntityTokens(text).length) return true;
  return false;
}

// Unknown locality-like modifiers must fail closed instead of falling through
// to a national SMI figure. This is deliberately limited to area/cover metrics
// so generic national forestry questions retain their existing route.
export function hasUnresolvedForestryLocalityScope(value) {
  const text = normalizeMunicipalityText(value);
  if (!FORESTRY_LOCALITY_METRIC_PATTERN.test(text)
    || reviewedEstonianForestryMunicipalityScope(value)) return false;

  // Bare unknown words are not enough: temporal, unit and aggregate modifiers
  // are open classes and must retain the national route. A reviewed Estonian
  // place-name ending is positive locality evidence regardless of casing;
  // metric/unit tokens are excluded before testing the suffix. Explicit
  // municipality syntax is handled by the shared classifier below.
  return text.split(" ").some((token) => token.length >= 3
    && !FORESTRY_LOCALITY_METRIC_TOKEN_PATTERN.test(token)
    && FORESTRY_UNKNOWN_PLACE_NAME_ENDING_PATTERN.test(token));
}

function reviewedCountyScope(text, { explicitOnly = false } = {}) {
  for (const [identity, aliases] of REVIEWED_ESTONIAN_COUNTY_ALIASES) {
    const matched = aliases.find((alias) => {
      const explicit = /\b(?:maakond|county)\b/u.test(alias);
      if (explicitOnly && !explicit) return false;
      if (!explicit) return normalizedPhraseIsPresent(text, alias);
      const [base, marker] = alias.split(/\s+(?=[^\s]+$)/u);
      const phrasePattern = new RegExp(
        `(?:^|\\s)${base.replace(/\s+/gu, "\\s+")}\\s+${marker === "maakond" ? "maakonn\\w*" : "county\\w*"}(?:$|\\s)`,
        "u",
      );
      return phrasePattern.test(text);
    });
    if (matched) return { identity, matched };
  }
  return null;
}

// Forestry facts in this portal default to Estonia only when the query does
// not name a competing geography. This shared classifier is intentionally a
// closed catalogue plus positive geographic grammar: arbitrary modifiers do
// not become places, while municipalities, counties, foreign regions and
// unresolved locality-shaped names can never inherit a national SMI value.
export function classifyForestryGeographyScope(value) {
  const text = normalizeMunicipalityText(value);
  const explicitCounty = reviewedCountyScope(text, { explicitOnly: true });
  if (explicitCounty) return { kind: "estonian-region", ...explicitCounty };

  const foreignMatch = text.match(FORESTRY_FOREIGN_OR_OTHER_REGION_PATTERN)?.[0] || null;
  if (foreignMatch) {
    return { kind: "foreign-or-other-region", identity: foreignMatch, matched: foreignMatch };
  }

  const municipality = reviewedEstonianForestryMunicipalityScope(value);
  if (municipality) return { kind: "reviewed-municipality", municipality };

  const county = reviewedCountyScope(text);
  if (county) return { kind: "estonian-region", ...county };

  if (FORESTRY_EXPLICIT_MUNICIPALITY_SCOPE_PATTERN.test(text)) {
    return { kind: "unknown-locality", identity: null, matched: null };
  }
  if (hasUnresolvedForestryLocalityScope(value)) {
    return { kind: "unknown-locality", identity: null, matched: null };
  }
  if (isReviewedNationalMixedForestAreaMethodQuestion(value)) {
    return { kind: "national-estonia", identity: "estonia", matched: null };
  }
  if (isReviewedNationalUnsupportedForestAreaBreakdownQuestion(value)) {
    return { kind: "national-estonia", identity: "estonia", matched: null };
  }
  // “in/of/for” can introduce either a geography or a requested period/unit.
  // Consume reviewed complete temporal, unit and aggregate complements before
  // the conservative unknown-geography grammar. The full-string requirement
  // prevents an appended place or private residual clause from being hidden.
  if (isReviewedNationalDefaultForestryAreaComplement(value)) {
    return { kind: "national-default", identity: "estonia", matched: null };
  }
  // Resolve open-class entities before interpreting typed dimensions. This
  // keeps an appended place such as “by ownership in Gondor” geographic, but
  // allows a fully consumed public dimension such as “in Estonia by
  // ownership” to reach its precise breakdown clarification.
  const unresolvedAreaResidual = unresolvedNationalDefaultForestryAreaResidual(value);
  if (hasUnresolvedForestryAreaEntity(value)) {
    return { kind: "foreign-or-other-region", identity: null, matched: null };
  }
  // Unsupported claim dimensions are not geographies. They are classified as
  // national here and rejected by their dedicated evidence contracts, after
  // the open-class entity guard has already ruled out an appended place.
  if (requestsUnsupportedForestAreaBreakdown(value)
    || requestsUnsupportedForestAreaTimeSeries(value)
    || requestsUnsupportedForestAreaUnit(value)) {
    return {
      kind: FORESTRY_NATIONAL_SCOPE_PATTERN.test(text) ? "national-estonia" : "national-default",
      identity: "estonia",
      matched: null,
    };
  }
  // A reviewed temporal, unit or aggregate prefix is national only when it
  // consumes the complete question. Any other trailing clause remains
  // query-bound: otherwise “in the current year for Gondor” could inherit an
  // Estonia-wide SMI value because the first complement looked harmless.
  if (unresolvedAreaResidual) {
    return {
      kind: "foreign-or-other-region",
      identity: unresolvedAreaResidual,
      matched: unresolvedAreaResidual,
    };
  }
  if (FORESTRY_NATIONAL_SCOPE_PATTERN.test(text)) {
    return { kind: "national-estonia", identity: "estonia", matched: null };
  }
  if (FORESTRY_EXPLICIT_OTHER_GEOGRAPHY_PATTERNS.some((pattern) => pattern.test(text))) {
    return { kind: "foreign-or-other-region", identity: null, matched: null };
  }
  return { kind: "national-default", identity: "estonia", matched: null };
}
