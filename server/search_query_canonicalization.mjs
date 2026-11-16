import { REVIEWED_QUERY_WORD_FORMS } from "./query-word-forms.mjs";
export const MAX_PUBLIC_SEARCH_QUERY_LENGTH = 180;
const MAX_PUBLIC_SEARCH_RAW_INPUT_LENGTH = 4_096;

function securityCodePoint(raw, radix, fallback) {
  const codePoint = Number.parseInt(raw, radix);
  if (!Number.isInteger(codePoint)
    || codePoint < 0
    || codePoint > 0x10ffff
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return fallback;
  return String.fromCodePoint(codePoint);
}

export function decodeSecurityEscapes(value) {
  let text = String(value || "");
  // Decode only bounded, syntactically complete representations that a
  // browser or another downstream component could interpret differently.
  // Three passes cover nested percent/entity forms while every transform is
  // length-reducing, so this cannot become an expansion loop.
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text
      .replace(/(?:%[0-9a-f]{2})+/giu, (match) => {
        try {
          return decodeURIComponent(match);
        } catch {
          return match;
        }
      })
      .replace(/&#x([0-9a-f]{1,6});?/giu, (match, raw) => securityCodePoint(raw, 16, match))
      .replace(/&#([0-9]{1,7});?/gu, (match, raw) => securityCodePoint(raw, 10, match))
      .replace(/&(amp|apos|bsol|colon|gt|hyphen|lowbar|lt|nbsp|period|quot|sol);/giu, (_match, name) => ({
        amp: "&",
        apos: "'",
        bsol: "\\",
        colon: ":",
        gt: ">",
        hyphen: "-",
        lowbar: "_",
        lt: "<",
        nbsp: " ",
        period: ".",
        quot: "\"",
        sol: "/",
      })[name.toLocaleLowerCase("en")])
      .replace(/\\u\{([0-9a-f]{1,6})\}/giu, (match, raw) => securityCodePoint(raw, 16, match))
      .replace(/\\u([0-9a-f]{4})/giu, (match, raw) => securityCodePoint(raw, 16, match))
      .replace(/\\x([0-9a-f]{2})/giu, (match, raw) => securityCodePoint(raw, 16, match));
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

const SECURITY_KEYWORD_SEPARATOR = "[\\p{P}\\p{S}\\p{Z}\\p{C}\\p{M}_]*";
const SECURITY_CANONICAL_KEYWORDS = [
  "kontakt", "telefon", "aadress", "adress", "meil", "sideandmed", "postkast",
  "postiaadress", "postal",
  "isikuandmed", "isikukood", "sunniaeg", "sunniaja", "sunniajaga", "sunniajast",
  "sunniajale", "sunniajata", "sunniaasta", "sunnikoht", "sunnikuupaev",
  "terviseandmed", "biomeetria", "ssn", "birthdate", "birthday", "personal", "social",
  "security", "identification", "passport", "information", "data", "date", "birth",
  "national", "number", "id",
  "koduaadress", "kodutanav", "elukoht", "elukoha", "elukohta", "elukohast", "elukohale", "kodukoht", "erakodu", "asukoht", "asupaik",
  "koordinaat", "viibimiskoht", "viibib", "oobib", "paikneb", "elab", "asub",
  "valduses", "valdavad", "valdaja", "valdab", "valdas", "valdama",
  "omab", "omavad", "omas", "omasid", "omanud", "omama", "omatakse", "omatud",
  "omaja", "omandis", "omanduses",
  "mets", "metsa", "metsamaa", "metsaeraldis", "metsakinnistu", "metsatukk", "puistu",
  "kuulub", "kuuluvad", "kuulus", "kuulusid", "kuulunud", "kuuluv", "kuuluva", "kuuluvat", "kuuluvast",
  "forest", "woodland", "leia", "otsi", "naita", "kuva", "show", "find", "display",
  "contact", "phone", "telephone", "address", "email", "residence", "resident",
  "occupant", "inhabitant", "inhabits", "inhabit", "landowner", "landholder", "landlord",
  "homeowner", "proprietor", "tenant", "owner", "ownership", "owns",
  "associated", "connected", "registered", "recorded", "listed", "belongs", "linked",
  "located", "locate", "disclose", "cadastral", "property", "parcel",
  "borehole", "plot", "residing", "resides", "reside", "staying", "stays", "stay",
  "renting", "rents", "rent", "leasing", "leases", "lease", "lives", "live",
];
const SECURITY_OBFUSCATED_KEYWORD_PATTERN = new RegExp(
  `(?<!\\p{L})(?:${SECURITY_CANONICAL_KEYWORDS
    .map((keyword) => [...keyword].join(SECURITY_KEYWORD_SEPARATOR))
    .join("|")})(?!\\p{L})`,
  "giu",
);
// V8 compiles these large Unicode expressions lazily. Warm them while the
// module is loading so the first anonymous request does not pay that CPU cost
// on the shared event loop.
"kontakt".replace(SECURITY_OBFUSCATED_KEYWORD_PATTERN, "kontakt");
SECURITY_OBFUSCATED_KEYWORD_PATTERN.lastIndex = 0;

export function canonicalSecurityText(value) {
  let text = decodeSecurityEscapes(value)
    // Canonicalize the bounded apostrophe/prime lookalikes that are routinely
    // accepted in natural-language input. Possessive privacy checks must not
    // see weaker syntax than downstream discovery or model construction.
    .replace(/[\u0060\u00B4\u02B9\u02BB\u02BC\u2018\u2019\u201B\u2032\u2035]/gu, "'")
    // Retrieval and corpus search both apply NFKC. Fold compatibility forms
    // here first so the privacy decision cannot see weaker semantics than a
    // downstream search sink; NFD then exposes inserted marks to the bounded
    // keyword canonicalizer below.
    .normalize("NFKC")
    .normalize("NFD")
    // Treat Unicode dash punctuation like the ASCII hyphen used by reviewed
    // compound-word grammars. This keeps public queries consistent while the
    // same canonical form still reaches every privacy classifier.
    .replace(/\p{Pd}/gu, "-")
    // Preserve line and tab controls as visible clause boundaries. Deleting
    // them would fuse otherwise separate tokens ("ownership\nJohn") before
    // the named-private-asset detector has a chance to fail closed.
    .replace(/[\t\n\v\f\r\u0085\u2028\u2029]+/gu, " ; ")
    // Other invisible/default-ignorable controls can also occupy a token
    // boundary. Preserve that boundary instead of deleting the character and
    // fusing a surname to a reviewed geography (for example Kase<ZWSP>Ida).
    .replace(/[\p{Default_Ignorable_Code_Point}\p{Cc}]+/gu, " ")
    .replace(/[аɑα]/giu, "a")
    .replace(/[еε]/giu, "e")
    .replace(/[оο]/giu, "o")
    .replace(/[рρ]/giu, "p")
    .replace(/[сϲ]/giu, "c")
    .replace(/[хχ]/giu, "x")
    .replace(/[іι]/giu, "i")
    .replace(/[јϳ]/giu, "j")
    .replace(/[кκϰ]/giu, "k")
    .replace(/[тτ]/giu, "t")
    .replace(/[ԁ]/giu, "d")
    .replace(/[օ]/giu, "o");
  text = text.replace(
    SECURITY_OBFUSCATED_KEYWORD_PATTERN,
    // Remove obfuscating separators without discarding capitalization. Case
    // carries useful person-name evidence; every security matcher is already
    // Unicode case-insensitive where appropriate.
    (match) => match.replace(/[^\p{L}\p{N}]/gu, ""),
  );
  return text.normalize("NFC");
}

// One-letter typos in the words most forest questions are built from:
// "kui pallju on metsa eestis" must reach the same answer as "kui palju on
// metsa eestis". The list is closed and holds only public question and forest
// words. A token is corrected only when it is lowercase, at least five letters,
// not itself on the list, and exactly one edit (insert, delete, substitute or
// swap two neighbours) from exactly one listed word. Names and capitalised
// words are never touched, so a correction cannot hide a person from the
// privacy classifier. A token that starts with a listed word is an inflected
// form, not a typo, and stays as written.
const REVIEWED_QUERY_TYPO_WORDS = Object.freeze([
  "palju", "paljud", "paljude", "paljusid", "eesti", "eestis", "eestist", "eestile",
  "metsa", "metsas", "metsad", "metsade", "metsast", "metsaid", "metsale", "metsamaa", "metsamaad", "metsasus",
  "pindala", "osakaal", "lageraie", "raiemaht", "raiumine", "juurdekasv", "tagavara",
  "puuliik", "puuliigid", "metsateatis", "metsateatist", "metsaomanik", "metsaregister",
  "kooreürask", "kooreüraski", "männikute", "kuusikute", "kaasikute", "levinum", "levinuim",
]);
const REVIEWED_QUERY_TYPO_WORD_SET = new Set(REVIEWED_QUERY_TYPO_WORDS);

function withinOneEdit(left, right) {
  if (left === right) return false;
  const lengthGap = left.length - right.length;
  if (Math.abs(lengthGap) > 1) return false;
  if (lengthGap === 0) {
    const differences = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) differences.push(index);
      if (differences.length > 2) return false;
    }
    if (differences.length === 1) return true;
    const [first, second] = differences;
    return differences.length === 2 && second === first + 1
      && left[first] === right[second] && left[second] === right[first];
  }
  const [longer, shorter] = lengthGap > 0 ? [left, right] : [right, left];
  for (let index = 0; index < longer.length; index += 1) {
    if (longer.slice(0, index) + longer.slice(index + 1) === shorter) return true;
  }
  return false;
}

// Every case form and verb form of the listed words (server/query-word-forms.mjs,
// from the Vabamorf synthesizer): "metsi", "metsasid", "levinud", "puuliigil",
// "raiutakse", "raiuksin". These are correct Estonian, not typos.
const REVIEWED_QUERY_WORD_FORM_SET = new Set(Object.values(REVIEWED_QUERY_WORD_FORMS).flat());

function firstDifference(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

export function correctReviewedQueryTypos(query) {
  if (typeof query !== "string" || !query) return query;
  return query.replace(/\p{L}+/gu, (token) => {
    if (token.length < 5 || token !== token.toLocaleLowerCase("et")) return token;
    if (REVIEWED_QUERY_TYPO_WORD_SET.has(token)) return token;
    // A case or verb form of a listed word is never a typo.
    if (REVIEWED_QUERY_WORD_FORM_SET.has(token)) return token;
    // An inflected form ("metsaomanike", "pindalad") starts with a listed word
    // and is not a typo.
    if (REVIEWED_QUERY_TYPO_WORDS.some((word) => token.startsWith(word))) return token;
    // A difference only in the last letter is an ending: Estonian case and
    // person endings change the end of the word ("levinud", not "levinum").
    const candidates = REVIEWED_QUERY_TYPO_WORDS.filter((word) => withinOneEdit(token, word)
      && firstDifference(token, word) < Math.min(token.length, word.length) - 1);
    return candidates.length === 1 ? candidates[0] : token;
  });
}

export function canonicalizePublicSearchQuery(value, {
  maximumLength = MAX_PUBLIC_SEARCH_QUERY_LENGTH,
} = {}) {
  const boundedMaximum = Math.max(1, Math.min(
    Math.trunc(Number(maximumLength) || MAX_PUBLIC_SEARCH_QUERY_LENGTH),
    2_000,
  ));
  const rawValue = typeof value === "string" ? value : String(value || "");
  // Security folding intentionally performs several Unicode and bounded
  // decoding passes. Cap its input first so an anonymous request cannot spend
  // event-loop time normalizing the full HTTP body before the public query
  // length contract is enforced. The multiplier still admits ordinary NFD and
  // compatibility forms; deeply encoded input fails closed.
  const rawMaximum = Math.min(
    MAX_PUBLIC_SEARCH_RAW_INPUT_LENGTH,
    Math.max(boundedMaximum + 128, boundedMaximum * 4),
  );
  if (rawValue.length > rawMaximum) {
    return { ok: false, query: "", reason: "input-too-long", maximumLength: boundedMaximum };
  }
  const query = correctReviewedQueryTypos(
    canonicalSecurityText(rawValue).replace(/\s+/gu, " ").trim(),
  );
  if (!query) return { ok: false, query: "", reason: "empty", maximumLength: boundedMaximum };
  if (query.length > boundedMaximum) {
    return { ok: false, query: "", reason: "too-long", maximumLength: boundedMaximum };
  }
  return { ok: true, query, reason: null, maximumLength: boundedMaximum };
}
