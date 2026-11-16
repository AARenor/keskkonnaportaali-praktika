import { canonicalSecurityText } from "./search_query_canonicalization.mjs";
const PROMPT_OR_SECRET_PATTERN = /(?:ignore\s+(?:(?:all|previous)\s+)*(?:instructions?|prompts?)|(?:ignoreeri|eira)\s+(?:(?:kõiki|koiki|eelnev\w*|varasem\w*|süsteemi\w*)\s+)*(?:(?:süsteemi)?juhis\w*|korraldus\w*|reegl\w*|prompt\w*)|system\s+prompt|developer\s+message|api[- ]?key|api\s*(?:võti|voti)|reveal\s+(?:the\s+)?secret|unusta\s+(?:eelnev\w*|juhis\w*)|salajas\w*\s+juhis\w*|(?:avalda|anna|näita|naita|kuva|paljasta)\s+(?:(?:api[- ]?)?(?:saladus\w*|võti\w*|voti\w*|parool\w*|token\w*))|(?:näita|naita|kuva|avalda)\s+serveri\s+(?:keskkonnamuutuj\w*|environment\s+variables?)|(?:show|reveal|return|print|display|give)\s+(?:me\s+)?(?:the\s+)?(?:hidden|internal|system|developer)\s+(?:prompt|instructions?|message)|(?:database|server|system)\s+(?:password|secret|credentials?|token))/iu;
const PRIVILEGED_ROLE_INSTRUCTION_PATTERN = /(?<!\p{L})(?:act|behave|pretend)\s+as\s+(?:an?\s+)?(?:(?:server|system|database)\s+)?(?:administrator|admin)(?!\p{L})/iu;
const ENGLISH_HIDDEN_INSTRUCTION_REQUEST_PATTERN = /\b(?:show|reveal|return|print|display|give|provide|tell|what\s+is)\b[\s\S]{0,100}\b(?:hidden|internal|developer|system)(?:\s+\p{L}+){0,3}\s+(?:prompt|instructions?|message)\b/iu;
const ENGLISH_SECRET_REQUEST_PATTERN = /\b(?:show|reveal|return|print|display|give|provide|tell)\b[\s\S]{0,100}\b(?:(?:api|database|server|system)\s+)?(?:credentials?|secrets?|passwords?|tokens?)\b/iu;
const ESTONIAN_HIDDEN_INSTRUCTION_REQUEST_PATTERN = /\b(?:näita|naita|kuva|avalda|paljasta|mis\s+on)\b[\s\S]{0,100}\b(?:varjatud\s+(?:s[üu]steemi?)?(?:viip|prompt|juhis)\w*|s[üu]steemi(?:viip|prompt|juhis)\w*|arendaja\s+(?:viip|prompt|juhis)\w*)/iu;
const EXECUTABLE_MARKUP_PATTERN = /(?:<\s*(?:script|img|svg|iframe)\b[^>]*(?:onerror|onload|javascript:)?|\bon(?:error|load)\s*=|javascript\s*:)/iu;
export function containsUnsafeInstruction(value) {
  const text = canonicalSecurityText(value);
  return PROMPT_OR_SECRET_PATTERN.test(text)
    || PRIVILEGED_ROLE_INSTRUCTION_PATTERN.test(text)
    || ENGLISH_HIDDEN_INSTRUCTION_REQUEST_PATTERN.test(text)
    || ENGLISH_SECRET_REQUEST_PATTERN.test(text)
    || ESTONIAN_HIDDEN_INSTRUCTION_REQUEST_PATTERN.test(text)
    || EXECUTABLE_MARKUP_PATTERN.test(text);
}
