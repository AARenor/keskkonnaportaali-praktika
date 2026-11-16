import { canonicalizePublicSearchQuery } from "./search_query_canonicalization.mjs";
import { assessSearchQuery } from "./search_query_assessment.mjs";
import { containsPrivatePersonLookup } from "./search_query_privacy.mjs";
import { containsUnsafeInstruction } from "./search_query_safety.mjs";
import { isNeutralElaborationToken } from "./search_query_terms.mjs";
import { normalize } from "./search_query_terms.mjs";
export function contextualRetrievalQuery(rootQuery, question, previousQuestions = []) {
  const safeFragment = (value) => {
    const input = canonicalizePublicSearchQuery(value);
    const fragment = input.ok ? input.query : "";
    return fragment && !contextAssessmentIsBlocked(assessSearchQuery(fragment)) ? fragment : "";
  };
  if (blockedFollowUpAssessment(rootQuery, question, previousQuestions)) return "";
  const root = safeFragment(rootQuery);
  const followUp = safeFragment(question);
  const previous = (Array.isArray(previousQuestions) ? previousQuestions : [])
    .map(safeFragment)
    .filter(Boolean)
    .slice(-3);
  // A complete question that continues nothing starts a new subject. Everything
  // else keeps the conversation topic, even when it also passes on its own.
  if (followUp && !isContinuationFollowUp(followUp) && assessSearchQuery(followUp).kind === "answerable") return followUp;
  let retrievalQuery = "";
  for (const fragment of [followUp, previous.at(-1), root].filter(Boolean)) {
    const candidate = canonicalizePublicSearchQuery([retrievalQuery, fragment].filter(Boolean).join(" "));
    if (candidate.ok) retrievalQuery = candidate.query;
  }
  return retrievalQuery;
}

function contextAssessmentIsBlocked(assessment) {
  return assessment?.kind === "out-of-scope"
    && ["unsafe-instruction", "personal-data-lookup"].includes(assessment.reason);
}

const CONTINUATION_FOLLOW_UP_PATTERN = /^(?:ja|aga|kuid|ning|v[oõ]i)\s|(?:^|\s)(?:see|seda|selle|sellel|selles|sellest|seal|sinna|sealt|need|neid|nende|sama|samuti)(?=\s|$)|\ska\s+(?:sobib|kehtib|kaib|käib|loeb)(?=\s|[?!.]|$)/iu;

export function isContinuationFollowUp(value) {
  const text = String(value || "").trim();
  return CONTINUATION_FOLLOW_UP_PATTERN.test(text)
    || /^(?:kui\s+kaua|millal)\s+(?:menetlus|läbivaatamine)\s+(?:kestab|lõpeb)[?!.]*$/iu.test(text);
}

export function isSafeEllipticalFollowUp(value) {
  const input = canonicalizePublicSearchQuery(value, { maximumLength: 120 });
  const text = input.ok ? input.query : "";
  if (!text || containsUnsafeInstruction(text)
    || /\b(?:aadress\w*|elab|elukoht\w*|kodu\w*|kontakt\w*|omanik\w*|kellele\s+kuulub|isiku\w*|inimese\w*)\b/iu.test(text)) {
    return false;
  }
  const normalized = text.toLocaleLowerCase("et").replace(/[^0-9a-zõäöüšž]+/giu, " ").trim();
  if (/^(?:aga\s+)?(?:miks|kuidas|millal|kus|mis\s+aastal)$/u.test(normalized)) return true;
  // A year-only comparison is a common continuation of a dated indicator
  // answer. Admit it only inside an already accepted conversation, where the
  // root supplies the indicator and subject.
  if (/^(?:aga\s+)?kas\s+(?:19|20)\d{2}\s+aastal$/u.test(normalized)) return true;
  if (/^(?:ja\s+|aga\s+)?(?:eelmisel|m[oõ]{1}[oö]dunud|sel|tänavu|järgmisel)\s+aastal$/u.test(normalized)) return true;
  if (/^(?:ja\s+|aga\s+)?millal\s+tuleb\s+(?:taotlus|teatis|see)\s+esitada$/u.test(normalized)) return true;
  // A bare period request ("näita 2000-2025", "alates 2000", "viimase 20
  // aasta jooksul") widens a dated answer's window. The root supplies the
  // indicator; nothing else may ride along in the string.
  const year = "(?:19|20)\\d{2}";
  const period = `(?:${year}\\s+(?:kuni\\s+)?${year}|alates\\s+${year}|viimas\\w*\\s+(?:\\d{1,2}|[a-zõäöüšž]+)\\s+aasta\\w*(?:\\s+jooksul)?|pikem\\w*\\s+perio\\w*|aastate\\s+l[oõ]ikes)`;
  if (new RegExp(`^(?:aga\\s+)?(?:n[aä]ita\\s+)?${period}$`, "u").test(normalized)) return true;
  // Ellipsis is a narrow full-string grammar, not a trusted prefix. Every
  // residual token must be consumed here; otherwise an unrelated suffix could
  // inherit an accepted environmental root and bypass the direct scope gate.
  const pronoun = "(?:see|seda|selle|sellest|need|neid|nende)";
  const bounded = normalized.split(" ").length <= 12;
  if (!bounded) return false;
  return new RegExp(`^(?:aga\\s+)?(?:mida|mis)\\s+${pronoun}\\s+(?:tähendab|näitab)$`, "u").test(normalized)
    || /^(?:aga\s+)?(?:mida|mis)\s+(?:need|nende)\s+(?:andmed|andmestikud)\s+(?:t[aä]hendavad|n[aä]itavad)$/u.test(normalized)
    || /^(?:aga\s+)?(?:millised?|mis)\s+(?:andmed|andmestikud)\s+(?:on\s+)?(?:k[aä]ttesaadavad|olemas)$/u.test(normalized)
    || /^(?:aga\s+)?kust\s+(?:neid|need|nende)\s+(?:andmeid|andmed|andmestikke|andmestikud)\s+(?:n[aä]eb|leiab)$/u.test(normalized)
    || new RegExp(`^(?:aga\\s+)?kui\\s+suur\\s+${pronoun}\\s+(?:on|oli)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?kuidas\\s+${pronoun}\\s+(?:(?:arvutatakse|hinnatakse|mõõdetakse|võrreldakse|saadi)|(?:on|oli)\\s+(?:muutunud|arenenud))$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?(?:selgita|seleta)\\s+(?:${pronoun}|täpsemalt|rohkem|veel|üksikasjalikult)(?:\\s+(?:täpsemalt|rohkem|veel|üksikasjalikult))?$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?millal\\s+${pronoun}\\s+(?:muutus|hakkas\\s+kehtima|kehtima\\s+hakkas|hakkas\\s+kehtima)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?kas\\s+${pronoun}\\s+(?:on|oli|kehtib|muutus|suurenes|vähenes|kasvas)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?(?:mida|mis)\\s+${pronoun}\\s+(?:(?:viimase|eelneva)\\s+(?:[1-9]|10|ühe|kahe|kolme|nelja|viie|kuue|seitsme|kaheksa|üheksa|kümne)\\s+aasta\\s+jooksul|(?:19|20)\\d{2}\\s+aastaga\\s+võrreldes)\\s+(?:tähendab|näitab)$`, "u").test(normalized)
    || new RegExp(`^(?:aga\\s+)?millise\\s+aja(?:vahemiku|perioodi)(?:ga)?\\s+${pronoun}(?:\\s+muutusi)?\\s+(?:võrreldakse|hõlmab|katab)$`, "u").test(normalized);
}

// A follow-up that carries no environment vocabulary of its own still inherits
// the accepted root's scope, but only while every content token is a neutral
// A follow-up that carries no environment vocabulary of its own still inherits
// the accepted root's scope, but only while every content token is a neutral
// elaboration word, a number, a reviewed acronym the conversation defines, or
// an inflected form of a token the conversation already contains. The
// conversation root must itself stay inside the environment domain and the
// follow-up must have failed the direct scope gate only for missing domain
// vocabulary, so foreign-language, unsafe and private-person questions keep
// their hard refusals below.
// Reviewed shorthand a follow-up may use for a subject the conversation has
// already established. The expansion words must also appear in the context, so
// an acronym nobody defined ("XYZ") cannot inherit the conversation's scope.
const CONTEXT_ACRONYM_EXPANSIONS = Object.freeze({
  kih: ["keskkonnamoju", "hindamist"],
});

// A follow-up token matches a context token only as one of its inflections:
// either one word is the beginning of the other ("mõjusid" of "mõju"), or they
// share a stem clearly longer than a coincidental prefix. Four shared letters
// are not enough — "piirivalve" must not ride in on "piirangud".
function contextTokenMatches(token, contextToken) {
  const followUp = normalize(token);
  const root = normalize(contextToken);
  if (!followUp || !root) return false;
  if (followUp === root) return true;
  const [shorter, longer] = followUp.length < root.length ? [followUp, root] : [root, followUp];
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
  let shared = 0;
  while (shared < shorter.length && followUp[shared] === root[shared]) shared += 1;
  return shared >= 6;
}

export function isContextAnchoredFollowUp(question, contextQuery = "") {
  const input = canonicalizePublicSearchQuery(question, { maximumLength: 120 });
  const text = input.ok ? input.query : "";
  if (!text || text.split(" ").length > 12) return false;
  if (containsUnsafeInstruction(text)) return false;
  const contextInput = canonicalizePublicSearchQuery(contextQuery, { maximumLength: 1_400 });
  const context = contextInput.ok ? contextInput.query : "";
  if (!context) return false;
  const contextAssessment = assessSearchQuery(context);
  if (contextAssessment.kind === "out-of-scope") return false;
  const assessment = assessSearchQuery(text);
  if (assessment.kind !== "out-of-scope" || assessment.reason !== "outside-environment-domain") return false;
  // Normalize both sides: the follow-up keeps its diacritics while context
  // words fold them away, so "mõjusid" must still match "mõju".
  const contextTokens = normalize(context).split(" ").filter(Boolean);
  const acronymTokens = new Set((String(question).match(/[\p{Lu}]{2,}/gu) || [])
    .map((token) => token.toLocaleLowerCase("et")));
  return text.split(" ").filter(Boolean).every((token) => {
    if (isNeutralElaborationToken(token)) return true;
    if (/\d/u.test(token)) return true;
    const normalizedToken = normalize(token);
    const acronym = token.toLocaleLowerCase("et");
    if (acronymTokens.has(acronym)) {
      // An acronym counts only when the conversation already uses it, or when
      // the reviewed expansion's words appear in the context.
      if (contextTokens.includes(acronym)) return true;
      const expansion = CONTEXT_ACRONYM_EXPANSIONS[acronym];
      return Boolean(expansion && expansion.every((word) => contextTokens.includes(word)));
    }
    return contextTokens.includes(normalizedToken)
      || contextTokens.some((root) => contextTokenMatches(normalizedToken, root));
  });
}

export function blockedFollowUpAssessment(rootQuery, question, previousQuestions = []) {
  const fragments = [
    { value: rootQuery, allowEllipsis: false },
    ...(Array.isArray(previousQuestions)
      ? previousQuestions.map((value) => ({ value, allowEllipsis: true }))
      : []),
    { value: question, allowEllipsis: true },
  ];
  for (const [index, { value, allowEllipsis }] of fragments.entries()) {
    const input = canonicalizePublicSearchQuery(value);
    if (input.reason === "empty") continue;
    if (!input.ok) return assessSearchQuery(value);
    const fragment = input.query;
    if (containsPrivatePersonLookup(value) || containsPrivatePersonLookup(fragment)) {
      return {
        kind: "out-of-scope",
        topic: null,
        reason: "personal-data-lookup",
        clarification: "Ma ei aita tuvastada eraisiku elukohta, vara ega muid isikuga seotatud registriandmeid.",
      };
    }
    const assessment = assessSearchQuery(fragment);
    // A missing-vocabulary follow-up stays scoped by the accepted conversation
    // only when every token it adds is neutral, acronym, or root-derived; the
    // anchor context deliberately excludes the fragment itself so a token can
    // never anchor to itself.
    const anchorContext = fragments
      .filter((_fragment, otherIndex) => otherIndex !== index)
      .map((fragment) => fragment.value)
      .join(" → ");
    if (assessment.kind === "out-of-scope"
      && (!allowEllipsis
        || !(isSafeEllipticalFollowUp(fragment) || isContextAnchoredFollowUp(fragment, anchorContext)))) {
      return assessment;
    }
  }
  return null;
}

export function conversationContext(rootQuery, previousQuestions = []) {
  const keepSafeContext = (value, allowEllipsis = false) => {
    const input = canonicalizePublicSearchQuery(value);
    const cleaned = input.ok ? input.query : "";
    if (!cleaned) return "";
    const assessment = assessSearchQuery(value);
    return !containsPrivatePersonLookup(value)
      && (assessment.kind !== "out-of-scope" || (allowEllipsis && isSafeEllipticalFollowUp(cleaned)))
      ? cleaned
      : "";
  };
  const root = keepSafeContext(rootQuery);
  const previous = (Array.isArray(previousQuestions) ? previousQuestions : [])
    .map((value) => keepSafeContext(value, true))
    .filter(Boolean)
    .slice(-3);
  // Retrieval itself remains short and bounded, but the answer model can use
  // more safe context to resolve a real follow-up. It is never evidence.
  return [root, ...previous].filter(Boolean).join(" → ").slice(0, 1_400);
}

