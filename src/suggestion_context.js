// Contextual follow-up suggestions.
//
// The picker chooses only among reviewed questions the caller already holds in
// memory: the current page query and the turns of the open conversation decide
// which of them still fit. Nothing here writes a question, calls a model or
// touches the network, so a person's own words, a name or any free-text detail
// can never travel back out as a suggestion.
import { REVIEWED_FORESTRY_SEARCH_SUGGESTIONS } from "./search-suggestions.js";

export const CONTEXTUAL_SUGGESTION_MAX = 12;

const DEFAULT_LIMIT = 3;
const MAX_CONTEXT_CHARS = 200;
const MAX_SUGGESTION_CHARS = 200;
const MAX_CANDIDATES = 200;
const MAX_RELATED = 12;
const MAX_PRIOR_QUESTIONS = 8;
const SCAN_LIMIT_FACTOR = 4;
const MIN_LEXICAL_TOKEN = 5;
const LEXICAL_STEM = 5;

// "mets" is the domain word of this portal: every forestry question contains
// it, so on its own it never carries a specific question. A broad match counts
// only when the question itself is that broad.
const BROAD_CONCEPT = "mets";

// Mutually exclusive water sub-topics. A question about groundwater never
// becomes a question about the sea or a flood just because both mention
// monitoring.
const WATER_DOMAINS = new Set(["joogivesi", "meri", "uleujutus", "heitvesi"]);

// A subject is a known topic family; a lexical word is a name, place or
// unknown term. Lexical overlap may rank and may qualify a question that names
// no subject of its own, but it never joins two different subjects.
const WEIGHT_CURRENT_SUBJECT = 3;
const WEIGHT_CURRENT_BROAD = 1;
const WEIGHT_CURRENT_LEXICAL = 1;
const WEIGHT_ROOT_SUBJECT = 2;
const WEIGHT_ROOT_BROAD = 0.5;
const WEIGHT_ROOT_LEXICAL = 0.5;
const WEIGHT_PRIOR_SUBJECT = 1.5;
const WEIGHT_PRIOR_BROAD = 0.5;
const WEIGHT_PRIOR_LEXICAL = 0.5;
const WEIGHT_REVIEWED_RELATED = 2;
const WEIGHT_YEAR_MATCH = 1;
const WEIGHT_YEAR_MISS = -1;

// One bounded Estonian vocabulary instead of a general stemmer: the topics this
// portal actually answers, written as the stems prefix matching needs. Longer
// stems come first, so "metsateatis" never collapses into the broad "mets"
// family and "metsaraie" stays a felling question.
const TOPIC_FAMILIES = Object.freeze([
  ["metsateatis", ["metsateatis"]],
  ["metsaregister", ["metsaregist"]],
  ["smi", ["metsastatistik", "valikuuring", "smi"]],
  ["puidubilanss", ["puidubilansi", "puidubilanss"]],
  ["juurdekasv", ["juurdekasv", "kasv"]],
  ["raie", [
    "metsaraie", "raiemah", "lageraie", "valikraie", "harvendus", "loikus",
    "raiut", "raium", "raiu", "raie",
  ]],
  ["puit", ["puidukogus", "puidu", "puitu", "puit"]],
  ["tagavara", ["tagavara", "puiduvara"]],
  ["pindala", ["metsasus", "pindala", "katvus", "kaetud", "osakaal", "protsent", "hektar"]],
  ["kaitse", ["looduskaitse", "kaitse", "kaits", "natura"]],
  ["kliima", ["soojenemine", "susinik", "heitgaas", "kliima", "heide", "co2"]],
  // Water is several questions, not one: groundwater, drinking water and wells
  // belong together, while sea, flood and waste water are different topics that
  // a shared word like "seire" must not pull into the answer.
  ["joogivesi", [
    "pohjavesi", "pohjavee", "joogivesi", "joogivee", "puurkaev", "kaevul", "kaev",
  ]],
  ["meri", ["merevee", "rannik", "ranna", "meri", "mere", "rand"]],
  ["uleujutus", ["uleujutus"]],
  ["heitvesi", ["heitvesi", "heitvee", "reovesi"]],
  ["vesi", [
    "suplusvesi", "suplusvee", "pinnavesi", "veekogu", "veetase", "veevot",
    "niiskus", "jarve", "jogi", "vesi", "vee",
  ]],
  ["seire", ["monitooring", "proovivot", "mootmis", "moodet", "vaatlus", "seire"]],
  ["jaatmed", [
    "ringmajandus", "ringlussevot", "taaskasuta", "elektroonika", "kompost",
    "sorteer", "pakend", "jaatme", "jaatm", "prugi",
  ]],
  ["ohk", ["ohukvaliteet", "valisohu", "saaste", "ohu", "ohk"]],
  ["mura", ["mura"]],
  ["elurikkus", ["liigirikkus", "elurikkus", "liikide", "elupaik", "liigid", "liigi"]],
  ["kahjustus", ["kahjustu", "kuivend", "haigus", "urask", "putuk", "torm", "poud"]],
  ["uuendus", ["noorendik", "uuendus", "istuta", "uuen", "kulv"]],
  ["vanus", ["vanane", "vanema", "noorem", "vanus"]],
  ["omand", ["riigimets", "eramets", "omand", "rmk"]],
  ["kinnistu", ["kinnistu", "kataster", "katastri", "maatukk"]],
  ["luba", ["menetlus", "taotlem", "taotle", "luba", "loa"]],
  ["ilm", ["ohutemperatuur", "ilmaprognoos", "temperatuur", "soojakraad", "ilm"]],
  ["keskkond", ["keskkond", "keskkonna"]],
  ["mets", ["mets"]],
]);

const FAMILY_PREFIXES = Object.freeze(
  TOPIC_FAMILIES
    .flatMap(([concept, prefixes]) => prefixes.map((prefix) => ({ concept, prefix })))
    .sort((left, right) => right.prefix.length - left.prefix.length),
);

// Question words, pronouns and support verbs: they appear in almost every
// question, so they may never decide what a suggestion is about.
const STOPWORDS = new Set([
  "mis", "mida", "millest", "milline", "millist", "millised", "millal", "kuidas",
  "kus", "kust", "kuhu", "miks", "kes", "kelle", "kas", "kui", "palju", "mitu",
  "on", "oli", "olid", "olnud", "olla", "olen", "oled", "oleme", "ei", "ja",
  "ning", "voi", "ka", "siis", "aga", "kuid", "ent", "et", "see", "seda",
  "selle", "sellel", "sellest", "selleks", "need", "neid", "nende", "neil",
  "ta", "ma", "mina", "minu", "me", "meie", "te", "teie", "sa", "sina", "sinu",
  "nad", "nii", "nuud", "siin", "seal", "sealt", "sinna", "umbes", "kogu",
  "koik", "koige", "suur", "suurt", "vaike", "vaga", "hasti", "voib", "voiks",
  "peab", "peaks", "saab", "saavad", "saan", "saada", "saaks", "tahan",
  "tahaks", "soovin", "sooviksin", "palun", "teada", "andmed", "andmeid",
  "andmete", "info", "kohta", "jaoks", "korral", "abil", "juurde", "vahe",
  "teine", "teist", "sama", "naiteks", "naide",
]);

// Inflection and support families that are still not a topic, checked as
// prefixes so "viimase", "viimastel" and "viimati" share one rule.
const GENERIC_PREFIXES = Object.freeze([
  "erine", "vahe", "andme", "soovi", "selgit", "raagi", "utle", "teada",
  "tahend", "palun", "kohta", "jooksul", "eesti", "viima", "praeg", "hetke",
  "rohke", "vahem", "muut", "ajas", "ajal", "ajast", "aega", "aasta", "kasuta",
  "vaja", "voima", "leid", "leia", "jaoks", "abil", "korral", "naite", "sama",
  "teine", "kuida", "milli", "palju",
]);

const GENERIC_MIN_PREFIX = 4;
const DIGIT_RUN = /\+?\d(?:[\s.-]?\d){6,}/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const HAS_LETTER = /\p{L}/u;

function normalizeKey(value) {
  return String(value ?? "")
    .slice(0, 2_000)
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^0-9a-z]+/gu, " ")
    .trim();
}

// A suggestion is a plain reviewed question. Markup, links, e-mail addresses,
// phone numbers, control characters and oversized strings are refused even when
// a caller passes them, so a hostile pool cannot turn into rendered output.
function cleanSuggestion(value) {
  if (typeof value !== "string") return null;
  // The raw length is checked before any whitespace work: padding must not buy
  // a pass over a long tail, and a padded question is still an oversized one.
  if (value.length > MAX_SUGGESTION_CHARS) return null;
  const text = value.replace(/\s+/gu, " ").trim();
  if (!text || text.length > MAX_SUGGESTION_CHARS) return null;
  if (CONTROL_CHARACTERS.test(text)) return null;
  if (/[<>]/u.test(text)) return null;
  if (/:\/\//u.test(text) || /\bwww\./iu.test(text)) return null;
  if (text.includes("@")) return null;
  if (DIGIT_RUN.test(text)) return null;
  if ((text.match(/\d/gu) || []).length >= 9) return null;
  if (!HAS_LETTER.test(text)) return null;
  return text;
}

const DEFAULT_SUGGESTIONS = Object.freeze(
  REVIEWED_FORESTRY_SEARCH_SUGGESTIONS.map(cleanSuggestion).filter(Boolean),
);

function boundedText(value) {
  if (typeof value !== "string") return "";
  return value.slice(0, MAX_CONTEXT_CHARS).replace(/\s+/gu, " ").trim();
}

function boundedList(value, max) {
  if (!Array.isArray(value)) return [];
  let length = 0;
  try {
    length = Number(value.length);
  } catch {
    return [];
  }
  if (!Number.isFinite(length) || length <= 0) return [];
  // Bound the entries visited, not only the strings kept: a caller array full
  // of non-strings must not cost a walk over an unbounded tail.
  const items = [];
  const scanLimit = Math.min(length, max * SCAN_LIMIT_FACTOR);
  for (let index = 0; index < scanLimit && items.length < max; index += 1) {
    const entry = value[index];
    if (typeof entry === "string") items.push(entry);
  }
  return items;
}

function isGenericToken(token) {
  if (STOPWORDS.has(token)) return true;
  return GENERIC_PREFIXES.some((prefix) => (
    prefix.length >= GENERIC_MIN_PREFIX && token.startsWith(prefix)
  ));
}

function conceptsForToken(token) {
  const family = FAMILY_PREFIXES.find((entry) => token.startsWith(entry.prefix));
  if (!family) return token.length >= MIN_LEXICAL_TOKEN ? [`w:${token.slice(0, LEXICAL_STEM)}`] : [];
  const concepts = [family.concept];
  if (family.concept !== BROAD_CONCEPT && token.startsWith(BROAD_CONCEPT)) concepts.push(BROAD_CONCEPT);
  return concepts;
}

// One parsed question: the known subjects it names, the lexical words that are
// names or unknown terms, whether it is a broad forestry question, and the
// years it mentions.
function contextOf(text, cache) {
  const key = normalizeKey(text);
  const cached = cache.get(key);
  if (cached) return cached;
  const context = { subjects: new Set(), lexical: new Set(), broad: false, years: new Set() };
  for (const token of key.split(" ")) {
    if (!token || !/[a-z0-9]/u.test(token)) continue;
    if (/^\d+$/u.test(token)) {
      if (token.length === 4) {
        const year = Number(token);
        if (year >= 1900 && year <= 2100) context.years.add(year);
      }
      continue;
    }
    if (token.length < 3) continue;
    if (isGenericToken(token)) continue;
    for (const concept of conceptsForToken(token)) {
      if (concept === BROAD_CONCEPT) context.broad = true;
      else if (concept.startsWith("w:")) context.lexical.add(concept);
      else context.subjects.add(concept);
    }
  }
  cache.set(key, context);
  return context;
}

function combinedContext(texts, cache) {
  const context = { subjects: new Set(), lexical: new Set(), broad: false, years: new Set() };
  for (const text of texts) {
    const parsed = contextOf(text, cache);
    parsed.subjects.forEach((concept) => context.subjects.add(concept));
    parsed.lexical.forEach((concept) => context.lexical.add(concept));
    parsed.years.forEach((year) => context.years.add(year));
    if (parsed.broad) context.broad = true;
  }
  return context;
}

function yearFilterOf(filters) {
  if (!filters || typeof filters !== "object") return null;
  let value;
  try {
    value = Number(filters.year);
  } catch {
    return null;
  }
  return Number.isInteger(value) && value >= 1900 && value <= 2100 ? value : null;
}

function boundedLimit(value) {
  let numeric;
  try {
    numeric = Number(value);
  } catch {
    return DEFAULT_LIMIT;
  }
  if (!Number.isFinite(numeric)) return DEFAULT_LIMIT;
  return Math.min(CONTEXTUAL_SUGGESTION_MAX, Math.max(1, Math.floor(numeric)));
}

function sharesConcepts(left, right) {
  if (!left.size || !right.size) return false;
  for (const concept of left) {
    if (right.has(concept)) return true;
  }
  return false;
}

function waterDomainsOf(context) {
  const domains = new Set();
  for (const concept of context.subjects) {
    if (WATER_DOMAINS.has(concept)) domains.add(concept);
  }
  return domains;
}

// The current question owns the water topic. Only when it names none does the
// open conversation supply one, so a follow-up keeps the root's water body.
function activeWaterDomains(current, root, prior) {
  const currentDomains = waterDomainsOf(current);
  if (currentDomains.size) return currentDomains;
  const rootDomains = waterDomainsOf(root);
  if (rootDomains.size) return rootDomains;
  return waterDomainsOf(prior);
}

// A candidate that names only a different water body answers another question,
// even when it shares the monitoring word.
function waterDomainConflicts(item, activeDomains) {
  if (!activeDomains.size) return false;
  let namedDomain = false;
  let namedActiveDomain = false;
  for (const concept of item.context.subjects) {
    if (!WATER_DOMAINS.has(concept)) continue;
    namedDomain = true;
    if (activeDomains.has(concept)) namedActiveDomain = true;
  }
  return namedDomain && !namedActiveDomain;
}

// A candidate earns a place only by sharing a real subject with the question,
// or with the open conversation when the question names none. A place or other
// lexical word may rank a candidate and may qualify one that names no subject
// at all, but on its own it never joins two different subjects. Reviewed
// related questions are already approved for this answer.
function isRelevant(item, current, root, prior, activeDomains) {
  if (item.reviewedRelated) return true;
  if (waterDomainConflicts(item, activeDomains)) return false;

  const inheritedSubject = sharesConcepts(item.context.subjects, root.subjects)
    || sharesConcepts(item.context.subjects, prior.subjects);
  if (current.subjects.size) {
    if (sharesConcepts(item.context.subjects, current.subjects)) return true;
    if (item.context.subjects.size) return false;
    return sharesConcepts(item.context.lexical, current.lexical);
  }
  if (current.broad) {
    return item.context.broad
      || inheritedSubject
      || sharesConcepts(item.context.lexical, current.lexical);
  }
  return inheritedSubject || sharesConcepts(item.context.lexical, current.lexical);
}

function scoreCandidate(item, current, root, prior, filterYear) {
  let score = 0;
  for (const concept of item.context.subjects) {
    if (current.subjects.has(concept)) score += WEIGHT_CURRENT_SUBJECT;
    if (root.subjects.has(concept)) score += WEIGHT_ROOT_SUBJECT;
    if (prior.subjects.has(concept)) score += WEIGHT_PRIOR_SUBJECT;
  }
  for (const concept of item.context.lexical) {
    if (current.lexical.has(concept)) score += WEIGHT_CURRENT_LEXICAL;
    if (root.lexical.has(concept)) score += WEIGHT_ROOT_LEXICAL;
    if (prior.lexical.has(concept)) score += WEIGHT_PRIOR_LEXICAL;
  }
  if (item.context.broad) {
    if (current.broad) score += WEIGHT_CURRENT_BROAD;
    if (root.broad) score += WEIGHT_ROOT_BROAD;
    if (prior.broad) score += WEIGHT_PRIOR_BROAD;
  }
  if (item.reviewedRelated) score += WEIGHT_REVIEWED_RELATED;
  if (filterYear !== null && item.context.years.size) {
    score += item.context.years.has(filterYear) ? WEIGHT_YEAR_MATCH : WEIGHT_YEAR_MISS;
  }
  return score;
}

export function contextualSuggestions(options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const limit = boundedLimit(opts.limit);
  const query = boundedText(opts.query);
  const rootQuery = boundedText(opts.rootQuery);
  const priorTexts = boundedList(opts.priorQuestions, MAX_PRIOR_QUESTIONS).map(boundedText).filter(Boolean);
  const candidateTexts = boundedList(opts.candidates, MAX_CANDIDATES);
  const relatedTexts = boundedList(opts.related, MAX_RELATED);
  const allowDefault = opts.allowDefault === true;
  const filterYear = yearFilterOf(opts.filters);

  const cache = new Map();
  const current = contextOf(query, cache);
  const root = contextOf(rootQuery, cache);
  const prior = combinedContext(priorTexts, cache);

  // The current question and every earlier turn are already answered: they may
  // never come back as a suggestion. Comparison is case, diacritic and
  // punctuation insensitive.
  const excluded = new Set();
  for (const text of [query, rootQuery, ...priorTexts]) {
    const key = normalizeKey(text);
    if (key) excluded.add(key);
  }

  const pool = [];
  const byKey = new Map();
  const addItem = (value, reviewedRelated) => {
    const cleaned = cleanSuggestion(value);
    if (!cleaned) return;
    const key = normalizeKey(cleaned);
    if (!key || excluded.has(key)) return;
    const existing = byKey.get(key);
    if (existing) {
      if (reviewedRelated) existing.reviewedRelated = true;
      return;
    }
    const item = {
      value: cleaned,
      index: pool.length,
      reviewedRelated,
      context: contextOf(cleaned, cache),
    };
    byKey.set(key, item);
    pool.push(item);
  };
  candidateTexts.forEach((value) => addItem(value, false));
  relatedTexts.forEach((value) => addItem(value, true));

  const hasContext = Boolean(query || rootQuery || priorTexts.length);
  if (!hasContext) {
    const reviewed = pool.filter((item) => item.reviewedRelated).map((item) => item.value);
    if (reviewed.length) return reviewed.slice(0, limit);
    return allowDefault ? DEFAULT_SUGGESTIONS.slice(0, limit) : [];
  }

  const scored = [];
  const activeDomains = activeWaterDomains(current, root, prior);
  for (const item of pool) {
    if (!isRelevant(item, current, root, prior, activeDomains)) continue;
    scored.push({ item, score: scoreCandidate(item, current, root, prior, filterYear) });
  }
  scored.sort((left, right) => right.score - left.score || left.item.index - right.item.index);
  return scored.slice(0, limit).map((entry) => entry.item.value);
}
