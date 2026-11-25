import { analyzeQueryIntent, isNoticeFeeQuestion, isNoticeReviewDurationQuestion } from "./query_intent.mjs";
import { hasReviewedAnswerForms, matchesReviewedAnswerForm, matchesStrictReviewedAnswerForm } from "./question_wording.mjs";
import { GENERIC_QUERY_CONTEXT_TERMS, queryRootVariants } from "./search_query_terms.mjs";
const ADMIN_CONTEXT_ROOTS = new Set([
  "tallinn", "tartu", "parnu", "parnumaa", "narva", "viljandi", "rakvere", "voru",
  "kuressaare", "haapsalu", "johvi", "harjumaa", "saaremaa", "kohtla", "ida", "virumaa",
]);
const QUESTION_FRAME_TERMS = new Set(["millal", "puhul"]);
const ASKER_FRAME_TERMS = new Set(["mul", "minu", "mu", "meil", "sul", "oma", "paar", "tahan", "tahaks", "soovin", "maha", "votta"]);
const ANSWER_STOP_WORDS = new Set(["vaja"]);
const NOTICE_TOPIC_CONTEXT_TERMS = new Set(["mets"]);
// Use and action roots frame a notice question without adding legal conditions.
const NOTICE_ANSWER_FRAME_TERMS = new Set([
  "ei", "erand", "erandi", "hind", "kogus", "kohustus", "kohustuslik", "maha", "maksab",
  "maksma", "mitu", "noue", "nouav", "pea", "peab", "pead", "peame", "pean", "peate",
  "puit", "puu", "puud", "riigiloiv", "suurus", "tasu", "teha", "tegema", "tuleb",
  "tuleks", "tulevad", "vaja", "vajadus", "vajalik", "votta", "euro", "esitamine",
  "tegem",
  "metsateatis", "summa", "tingimus",
]);
// A firewood subtype is covered by a cited rule about wood only when the answer names wood.
const NOTICE_ANSWER_EQUIVALENTS = new Map([["kuttepuu", ["puit"]]]);
const YEAR_COMPLEMENT_PATTERN = /^aasta(?:l|st|ks|ni|sse|le|ga|ta|te|tel)?$/u;
const NOTICE_LOCATION_ROOTS = new Set([...ADMIN_CONTEXT_ROOTS, "eesti"]);
const NON_ANSWER_TEXT_PATTERN = /^(?:esileht|avaleht)\b|\b(?:esileht\s+uudised|loe\s+edasi|laadi\s+alla|jaga\s+lehte|blogi\s+\d{2}\.\d{2}\.\d{4})\b/iu;
const CASE_ENDING_REMAINDER = /^[aeiou]?(?:d|de|des|dega|deks|dele|del|delt|dest|desse|ga|s|st|sse|le|l|lt|ks|ni|na|ta|t|te|tes|tele|id|ide|sid)?$/u;
const STATED_TIME_PATTERN = /\d|\b(?:jaanuar|veebruar|marts|aprill|mai|juuni|juuli|august|september|oktoober|november|detsember|kevad|suvi|suve|sugis|talv|alates|kuni|enne|parast|hiljemalt|jooksul|ajavahemik)\w*/u;
const ASKED_AREA_KINDS = ["hoiuala", "pusielupai", "sihtkaitsevoond", "piiranguvoond", "loodusreservaa", "rahvuspar", "talvituspai", "vaariselupai"];

function normalize(value = "") {
  return String(value || "")
    .toLocaleLowerCase("et")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/%/gu, " protsent ")
    .replace(/[^a-z0-9äöõüšž]+/gi, " ")
    .trim();
}

function queryTerms(query) {
  return analyzeQueryIntent(query).terms.map(normalize);
}

function answerRootMatches(token, root, strict = false) {
  if (hasReviewedAnswerForms(root)) {
    return strict
      ? matchesStrictReviewedAnswerForm(token, root)
      : matchesReviewedAnswerForm(token, root);
  }
  const stems = new Set(queryRootVariants(root).map(normalize).filter(Boolean));
  if (root.endsWith("mine") && root.length > 6) stems.add(root.slice(0, -4));
  return [...stems].some((stem) => token === stem || token.startsWith(stem));
}

function textHasQueryRoot(value, root, strict = false) {
  const words = normalize(value).split(/\s+/u).filter(Boolean);
  return words.some((word) => answerRootMatches(word, root, strict));
}
function isNoticeAnswerFrameTerm(term) {
  return NOTICE_ANSWER_FRAME_TERMS.has(term)
    || queryRootVariants(term).some((variant) => NOTICE_ANSWER_FRAME_TERMS.has(normalize(variant)));
}
function noticeAnswerTermCovered(text, term) {
  if (textHasQueryRoot(text, term)) return true;
  return queryRootVariants(term).some((variant) => (
    NOTICE_ANSWER_EQUIVALENTS.get(normalize(variant))
      ?.some((answerRoot) => textHasQueryRoot(text, answerRoot)) || false
  ));
}

// Prefix matching also erases requested fees and concepts such as sustainability.
const REVIEW_DURATION_FRAME_TERMS = new Set([
  "kaua", "kesta", "kestab", "kestavad", "kestma", "kestis", "kestnud", "kestus", "kestuse", "kestust",
  "menetlus", "menetluse", "menetlust", "menetluses", "menetluseks", "menetlusega",
  "menetlusel", "menetlusele", "menetlusest", "menetlemine", "menetlemise", "menetlemist",
  "menetletakse", "menetleda", "menetlema", "labivaatamine", "labivaatamise",
  "labivaatamist", "labivaatamisel", "labivaatamiseks",
]);

function isReviewDurationFrameTerm(term) {
  return REVIEW_DURATION_FRAME_TERMS.has(term);
}

function hasReviewDurationEvidence(text) {
  return String(text || "").split(/[.;!?]/u).some((part) => {
    const sentence = normalize(part);
    return /\b\d{1,3}\s+(?:too)?paev[a-z]*\b/u.test(sentence)
      && (/\b(?:menetl[a-z]*|labivaat[a-z]*)\b/u.test(sentence)
        || (/\bvaat[a-z]*\b/u.test(sentence) && /\blabi\b/u.test(sentence)));
  });
}

export function answersNoticeQualifiers(query, text) {
  const intent = analyzeQueryIntent(query);
  if (intent.topic !== "forest_notice") return true;
  const reviewDuration = isNoticeReviewDurationQuestion(query);
  if (reviewDuration && isNoticeFeeQuestion(query) && !/\b(?:riigiloiv|tasu|euro)[a-z]*\b/u.test(normalize(text))) return false;
  if (reviewDuration && !hasReviewDurationEvidence(text)) return false;
  const hasYear = /\b\d{4}\b/u.test(normalize(query));
  const required = intent.terms.map(normalize).filter((term) => !GENERIC_QUERY_CONTEXT_TERMS.has(term)
    && !NOTICE_TOPIC_CONTEXT_TERMS.has(term)
    && !QUESTION_FRAME_TERMS.has(term)
    && !ASKER_FRAME_TERMS.has(term)
    && !ANSWER_STOP_WORDS.has(term)
    && !isNoticeAnswerFrameTerm(term)
    && !(reviewDuration && isReviewDurationFrameTerm(term))
    && !(hasYear && YEAR_COMPLEMENT_PATTERN.test(term))
    && !(isNoticeFeeQuestion(query) && term === "esitamine"));
  if (!required.every((term) => noticeAnswerTermCovered(text, term))) return false;
  return [...NOTICE_LOCATION_ROOTS]
    .filter((root) => textHasQueryRoot(query, root))
    .every((root) => textHasQueryRoot(text, root));
}

// A reviewed catalogue page can carry one sentence about filing a forest
// notice beside the data the question actually asks for. Identify that
// boilerplate so it cannot be published as the answer to an unrelated query.
export function isForestNoticeFilingPassage(text) {
  const value = normalize(text);
  return /\bmetsateatis\w*\s+(?:(?:saab|tuleb|peab|voib)\s+)?esita\w*/u.test(value)
    || /\btaida\s+metsateatise\s+vorm\b/u.test(value);
}

// A model answer can quote a visible notice sentence that is irrelevant to
// the user's actual question. Only a question that asks about the notice may
// keep that wording, even when the cited passage itself is admissible.
export function noticeAnswerWithoutNoticeIntent(query, text) {
  const asked = normalize(query);
  if (/\b(?:metsateatis|raieteatis)\w*/u.test(asked)) return false;
  if (/\b(?:luba|lubaa|lubaks|raie\w*)\b/u.test(asked)) return false;
  if (analyzeQueryIntent(query).topic === "forest_notice") return false;
  return isForestNoticeFilingPassage(text);
}

function shortenedQueryWords(query, terms) {
  return normalize(query).split(/\s+/u).filter((word) => word.length >= 7
    && terms.some((term) => {
      if (term.length < 3 || word.length - term.length < 3) return false;
      const at = word.indexOf(term);
      if (at < 0) return false;
      return at > 0 || !CASE_ENDING_REMAINDER.test(word.slice(term.length));
    }));
}

export function isNonAnswerText(value) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  if (text.length < 25 || NON_ANSWER_TEXT_PATTERN.test(text)) return true;
  if (/^loomulikult\b/iu.test(text)) return true;
  if (/^hiljutised uudised\b|\bvaata k[oõ]iki\b/iu.test(text)) return true;
  if (/^(?:\p{L}+\s+)?\d{4}\s+autor\b|^autor\s*:/iu.test(text)) return true;
  if (/\b[a-z]{2,}__[a-z_]+/u.test(text)) return true;
  if ((text.match(/\.(?:pdf|xlsx?|docx?|zip|csv)\b/giu) || []).length >= 2) return true;
  const [first, second] = text.split(" ").map((word) => normalize(word));
  return Boolean(first && second && first.length >= 4 && second.startsWith(first));
}

export function statesAskedTime(query, text) {
  if (!/\bmillal\b/u.test(normalize(query))) return true;
  return STATED_TIME_PATTERN.test(normalize(text));
}

export function answersAskedHectares(query, text) {
  if (!/\b(?:hektar\w*|ha)\b/u.test(normalize(query))) return true;
  return /\b(?:hektar\w*|ha)\b/u.test(normalize(text));
}

export function namesAskedAreaKind(query, text) {
  const asked = normalize(query);
  const answer = normalize(text);
  return ASKED_AREA_KINDS.every((area) => !asked.includes(area) || answer.includes(area));
}

export function statesAskedAge(query, text) {
  if (!/\bkui\s+vana\w*\b/u.test(normalize(query))) return true;
  return /\bvanus\w*|\b\d+\s*(?:aastat\b|-?aastane\w*)/u.test(normalize(text));
}

export function extractAnswersQuery(query, extract) {
  if (isNonAnswerText(extract)) return false;
  const intent = analyzeQueryIntent(query);
  const reviewDuration = isNoticeReviewDurationQuestion(query);
  if (reviewDuration && !answersNoticeQualifiers(query, extract)) return false;
  const terms = intent.terms.map(normalize)
    .filter((term) => !ADMIN_CONTEXT_ROOTS.has(term)
      && !GENERIC_QUERY_CONTEXT_TERMS.has(term)
      && !ANSWER_STOP_WORDS.has(term)
      && !(intent.topic === "forest_notice" && NOTICE_TOPIC_CONTEXT_TERMS.has(term))
      && !(reviewDuration && (term === "metsateatis" || isReviewDurationFrameTerm(term)))
      && !(reviewDuration && isNoticeAnswerFrameTerm(term))
      && !(intent.topic === "forest_notice" && isNoticeFeeQuestion(query) && term === "esitamine"));
  const required = terms.filter((term) => !QUESTION_FRAME_TERMS.has(term) && !ASKER_FRAME_TERMS.has(term));
  if (terms.length && !required.length && !reviewDuration) return false;
  if (!required.every((term) => textHasQueryRoot(extract, term))) return false;
  const text = normalize(extract);
  if (!statesAskedTime(query, extract)) return false;
  if (!statesAskedAge(query, extract)) return false;
  return shortenedQueryWords(query, terms)
    .every((word) => text.includes(word.slice(0, Math.max(6, word.length - 3))));
}
export function rawLawLeadAnswersQuery(query, text) {
  if (!/^\(?\d+\p{L}?\)\s/u.test(String(text || "").trim())) return true;
  return extractAnswersQuery(query, text);
}

const AMOUNT_QUESTION = /^palju\b|\b(?:kui\s+(?:suur|lai|korge|pikk|palju|vana|kaua)\w*|mitu|mitme)\b/u;
const STATED_AMOUNT = /\d|\b(?:uks|uhe|kaks|kahe|kolm|kolme|neli|nelja|viis|viie|kuus|kuue|seitse|seitsme|kaheksa|uheksa|kumme|kumne|sada|saja|tuhat|tuhande|pool|poole)\b/u;

// "Kui palju, mitu" is answered by an amount; a source sentence without one
// ("RMK ei ole ühtki vääriselupaika raiunud") does not answer it.
export function givesAskedAmount(query, text) {
  // A year or a year range ("1999–2025 aegridu") is not the amount.
  const withoutYears = normalize(text).replace(/\b(?:19|20)\d{2}\b/gu, " ");
  // "… ei ole avaldatud; andme puudumine ei tähenda nullväärtust" is an honest
  // answer without an amount.
  return !AMOUNT_QUESTION.test(normalize(query)) || STATED_AMOUNT.test(withoutYears)
    || /\bei ole\b[^.]{0,120}\bavaldatud\b/u.test(normalize(text));
}

// "Üle 100 aasta vana" asks about stand age; county forest cover does not answer it.
export function namesAskedAgeClass(query, text) {
  return !/\b\d+\s+aasta\w*\s+van\w*/u.test(normalize(query)) || /\bvan(?:a|u|us|ad|em|im)\w*/u.test(normalize(text));
}

// A clear-cut question is not answered by a passage that never names clear-cutting.
export function namesAskedClearcut(query, text) {
  return !/\blageraie\w*/u.test(normalize(query)) || /lageraie|\blan(?:k|gi?|ge)\w*|raiesmik/u.test(normalize(text));
}

export function answersPermissionQuestion(query, text) {
  if (!/\b(?:lubatud|lubatav\w*|keelatud)\b/u.test(normalize(query))) return true;
  return /\b(?:luba\w*|tohi\w*|keela\w*|nou[dt]\w*|piirang\w*|voib|voi[bm]\w*|peab|seadus\w*|maarus\w*|kuni)\b/u.test(normalize(text));
}

const ASKED_CONCEPTS = [
  { asks: /toetus|taotlus|huvitis/u, answers: /toetus|toetami|taotl|rahasta|huvit|kompens|meetm/u },
  { asks: /puhapaev|laupaev|nadalavahetus|riigipuha/u, answers: /puhapaev|laupaev|nadalavahetus|riigipuha/u },
  { asks: /\beramets\w*|\beraomand\w*|\beramaa\w*/u, answers: /eramets|eraomand|erao|eramaa|metsaomanik|eramaad? kokku/u },
  { asks: /\briigimets\w*/u, answers: /riigimets|\brmk\b|riigimaa|riigi omand/u },
  // Living growing stock does not answer a question about dead wood.
  { asks: /\b(?:surnud|kuivanud|lamapuu\w*|tuuleheide\w*)\b/u, answers: /\b(?:surnud|surev\w*|kuiv\w*|lamapuu\w*|tuuleheit\w*)/u },
  { asks: /kaitsevoon\w*.*\b(?:joe|jogi|joge|jarve|veekogu\w*|kalda\w*)\b/u, answers: /veekogu|\bjo(?:e|gi|ge)\b|jarve|kalda|ranna/u },
];
function askedDefinitionTerm(query) {
  const intent = analyzeQueryIntent(query);
  const normalizedQuery = normalize(query);
  const meaningFrame = normalizedQuery.match(/^(.+?)\s+(?:mis|mida) see(?:\s+\p{L}+){0,2}\s+tahendab$/u)?.[1];
  const definitionFrame = intent.intent === "definition"
    ? normalizedQuery.match(/^mis on (.+)$/u)?.[1]
    : "";
  const subject = meaningFrame || definitionFrame;
  if (!subject) return "";
  return intent.terms.map(normalize)
    .filter((term) => textHasQueryRoot(subject, term, true))
    .sort((left, right) => right.length - left.length)[0] || "";
}

export function namesDefinitionTerm(query, text) {
  const defined = askedDefinitionTerm(query);
  return !defined || textHasQueryRoot(text, defined, true);
}

export function answersAskedConcept(query, text) {
  if (!answersPermissionQuestion(query, text)) return false;
  if (!answersNoticeQualifiers(query, text)) return false;
  if (!statesAskedTime(query, text)
    || !statesAskedAge(query, text)
    || !answersAskedHectares(query, text)
    || !namesAskedAreaKind(query, text)
    || !namesDefinitionTerm(query, text)) return false;
  const normalizedQuery = normalize(query);
  const normalizedText = normalize(text);
  if (/^hiljutised uudised\b|\bvaata koiki\b/u.test(normalizedText) || /\b[a-z]{2,}__[a-z_]+/u.test(String(text))) return false;
  return ASKED_CONCEPTS.every(({ asks, answers }) => !asks.test(normalizedQuery) || answers.test(normalizedText));
}

export function citedEvidenceAnswersQuestion(question, answer, sources = []) {
  const query = String(question || "").trim();
  if (!query) return false;
  const meaningful = queryTerms(query).filter((term) => !ADMIN_CONTEXT_ROOTS.has(term)
    && !GENERIC_QUERY_CONTEXT_TERMS.has(term)
    && !QUESTION_FRAME_TERMS.has(term)
    && !ANSWER_STOP_WORDS.has(term));
  if (!meaningful.length) return false;
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
  const citationNumbers = (values) => (Array.isArray(values) ? values : [])
    .filter((value) => typeof value === "number" && Number.isInteger(value) && value > 0);
  const parts = Array.isArray(answer.parts) ? answer.parts : [];
  const cited = new Set([
    ...citationNumbers(answer.introCitations),
    ...parts.flatMap((part) => (part && typeof part === "object" && !Array.isArray(part)
      ? citationNumbers(part.citations)
      : [])),
  ]);
  if (!cited.size) return false;
  return (Array.isArray(sources) ? sources : []).some((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) return false;
    if (typeof source.citation !== "number" || !cited.has(source.citation)) return false;
    const excerpt = typeof source.evidenceExcerpt === "string" ? source.evidenceExcerpt : "";
    if (!excerpt.trim()) return false;
    return extractAnswersQuery(query, excerpt) && answersAskedConcept(query, excerpt);
  });
}

const REPEATED_ANSWER_SHARE = 0.8;

export function repeatsEarlierAnswer(text, earlierAnswers = [], { title = "", question = "" } = {}) {
  const normalizedTitle = normalize(title);
  if (normalizedTitle && normalizedTitle !== normalize(question)
    && earlierAnswers.every((earlier) => !normalize(earlier).includes(normalizedTitle))) return false;
  const words = new Set(normalize(text).split(/\s+/u).filter((word) => word.length > 3));
  if (words.size < 5) return false;
  return earlierAnswers.some((earlier) => {
    const seen = new Set(normalize(earlier).split(/\s+/u));
    return [...words].filter((word) => seen.has(word)).length / words.size >= REPEATED_ANSWER_SHARE;
  });
}

const REPEATED_ANSWER_NOTE = "See vastus kordab eelmises vastuses antud teavet.";

export function withRepeatedAnswerNote(answer) {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return answer;
  const raw = answer.note;
  if (!(raw === undefined || raw === null || typeof raw === "string" || Array.isArray(raw))) return answer;
  const note = (Array.isArray(raw) ? raw.map((entry) => String(entry ?? "")).join(" ") : String(raw ?? "")).trim();
  if (note.includes(REPEATED_ANSWER_NOTE)) return answer;
  if (note && note.length + 1 + REPEATED_ANSWER_NOTE.length > 700) return answer;
  return { ...answer, note: note ? `${note} ${REPEATED_ANSWER_NOTE}` : REPEATED_ANSWER_NOTE };
}
