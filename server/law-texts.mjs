import { analyzeQueryIntent, supportsIntentConcept } from "./query_intent.mjs";
import { REVIEWED_QUERY_WORD_FORMS } from "./query-word-forms.mjs";

// Full text of the forest laws, read from Riigi Teataja's own data feed.
//
// There is no stored copy, because a stored law goes out of date. The feed names
// the version in force today (a newer version can be published but not yet in
// force, so "latest published" would be wrong). If that cannot be confirmed
// recently, the law text is withheld and the question gets an honest no-answer.

const API_BASE = "https://www.riigiteataja.ee/public-api/api/v1/akt";
const REQUEST_TIMEOUT_MS = 20_000;
const CHECK_INTERVAL_MS = 60 * 60 * 1_000;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1_000;
const MAX_VERIFICATION_AGE_MS = 24 * 60 * 60 * 1_000;
const MINIMUM_SECTION_LENGTH = 40;

export const FOREST_LAWS = [
  { key: "metsaseadus", actId: "112052026020", title: "Metsaseadus", publicUrl: "https://www.riigiteataja.ee/akt/MS", minimumSections: 40 },
  { key: "metsa-majandamise-eeskiri", actId: "12771900", title: "Metsa majandamise eeskiri", publicUrl: "https://www.riigiteataja.ee/akt/12771900?leiaKehtiv", minimumSections: 10 },
  // Hoiuala, kaitseala, püsielupaik and shore rules in a forest come from here;
  // no other official source states them.
  { key: "looduskaitseseadus", actId: "109072026047", title: "Looduskaitseseadus", publicUrl: "https://www.riigiteataja.ee/akt/LKS", minimumSections: 60, tags: ["looduskaitse", "kaitseala", "hoiuala"] },
];

const SUPERSCRIPT = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const lawState = new Map();

function decodeXmlText(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
    .replace(/<sup>([\s\S]*?)<\/sup>/giu, (_, digits) => [...digits.trim()].map((digit) => SUPERSCRIPT[digit] ?? digit).join(""))
    .replace(/<[^>]+>/gu, "")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

// Some limits are only in a table, so its cells must survive as readable text.
function tableAsText(value) {
  return String(value).replace(/<\/t[dh]>/giu, " | ").replace(/<\/tr>/giu, " ; ");
}

function firstTag(xml, tag) {
  return decodeXmlText(xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "u"))?.[1]);
}

// Amendment marks and technical notes are not part of the rule, and a repealed
// subsection exists only as an amendment mark, so removing them removes it too.
export function parseLawSections(xml) {
  const sections = [];
  for (const [block, anchor] of String(xml || "").matchAll(/<paragrahv id="([^"]+)"[^>]*>[\s\S]*?<\/paragrahv>/gu).map((match) => [match[0], match[1]])) {
    const body = block
      .replace(/<muutmismarge(?:\s[^>]*)?>[\s\S]*?<\/muutmismarge>/gu, "")
      .replace(/<normtehnmarkus(?:\s[^>]*)?>[\s\S]*?<\/normtehnmarkus>/gu, "");
    const number = firstTag(body, "kuvatavNr").replace(/\.$/u, "");
    const heading = firstTag(body, "paragrahvPealkiri");
    const tokens = [...body.replace(/<paragrahvPealkiri(?:\s[^>]*)?>[\s\S]*?<\/paragrahvPealkiri>/u, "").matchAll(/<(kuvatavNr|tavatekst|kuvatavTekst|HTMLKonteiner)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gu)]
      .slice(1)
      .map((match) => ({ isNumber: match[1] === "kuvatavNr", text: decodeXmlText(match[1] === "HTMLKonteiner" ? tableAsText(match[2]) : match[2]) }))
      .filter((token) => token.text);
    // A number with no text after it belongs to a repealed subsection.
    const text = tokens
      .filter((token, index) => !token.isNumber || (tokens[index + 1] && !tokens[index + 1].isNumber))
      .map((token) => token.text)
      .join(" ");
    if (!number || text.length < MINIMUM_SECTION_LENGTH) continue;
    sections.push({ anchor, number, heading, text });
  }
  return sections;
}

async function fetchFromFeed(fetchImpl, path, kind) {
  const response = await fetchImpl(`${API_BASE}/${path}`, {
    headers: { Accept: kind === "xml" ? "application/xml" : "application/json", "User-Agent": "KeskkonnaportaaliPraktika/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`law feed answered ${response.status}`);
  return kind === "xml" ? response.text() : response.json();
}

function estonianDate(isoValue) {
  // The feed gives Estonian midnight in UTC, so read the date back in Estonia.
  return new Intl.DateTimeFormat("et-EE", { timeZone: "Europe/Tallinn", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(isoValue));
}

function publicationMark(xml) {
  const meta = xml.match(/<\/vastuvoetud>\s*<avaldamismarge(?:\s[^>]*)?>([\s\S]*?)<\/avaldamismarge>/u)?.[1] || "";
  const part = firstTag(meta, "RTosa");
  const date = firstTag(meta, "avaldamineKuupaev");
  const article = firstTag(meta, "RTartikkel");
  return part && date && article ? `${part}, ${date.slice(0, 10).split("-").reverse().join(".")}, ${article}` : "";
}

function versionIsInForce(parameters, now) {
  const starts = Date.parse(parameters?.kehtivuseAlgus);
  if (!Number.isFinite(starts) || starts > now) return false;
  const ends = parameters?.kehtivuseLopp ? Date.parse(parameters.kehtivuseLopp) : Infinity;
  return ends > now && parameters?.mitteJoustunud !== true && parameters?.kehtivKehtetus !== true;
}

function sectionDocument(law, section, version) {
  const heading = section.heading ? `${section.number}. ${section.heading}` : section.number;
  const validity = version.validUntil ? `kehtiv ${version.validFrom}–${version.validUntil}` : `kehtiv alates ${version.validFrom}`;
  return {
    id: `law-${law.key}-${section.anchor}`,
    title: `${law.title} ${heading}`,
    organization: "Riigi Teataja",
    type: "Kehtiv õigusakt",
    published: "jooksev",
    url: `${law.publicUrl}#${section.anchor}`,
    tags: [...(law.tags || ["mets"]), "seadus", law.title.toLocaleLowerCase("et")],
    summary: section.heading || law.title,
    content: section.text,
    locator: `${law.title} ${section.number}. Kehtiv redaktsioon: ${[version.mark, validity].filter(Boolean).join(", ")}. Kontrollitud Riigi Teatajast ${estonianDate(version.verifiedAt)}.`,
    _catalogueReviewedAt: version.verifiedAt,
    _lawSection: true,
    _lawVersionId: version.id,
  };
}

// Throws rather than keep anything it could not confirm; the caller keeps the
// last good text only while its verification is still recent.
async function checkLaw(law, { fetchImpl, now }) {
  const act = await fetchFromFeed(fetchImpl, `${law.actId}?leiaKehtiv=true`, "json");
  const versions = await fetchFromFeed(fetchImpl, `${act.grupiId}/redaktsioonid`, "json");
  const inForceId = String(versions.kehtivRedaktsioon || "");
  if (!inForceId || inForceId !== String(act.kehtivId)) throw new Error("law feed does not agree on the version in force");
  if (act.aktiParameetrid?.pealkiri !== law.title) throw new Error("law feed returned another act");
  if (!versionIsInForce(act.aktiParameetrid, now)) throw new Error("law feed version is not in force today");
  const verifiedAt = new Date(now).toISOString();
  const known = lawState.get(law.key);
  if (known?.versionId === inForceId) {
    lawState.set(law.key, { ...known, verifiedAt, documents: known.documents.map((document) => ({ ...document, _catalogueReviewedAt: verifiedAt })) });
    return;
  }
  const xml = await fetchFromFeed(fetchImpl, `${inForceId}/blob-xml`, "xml");
  const sections = parseLawSections(xml);
  if (sections.length < law.minimumSections) throw new Error("law text looks incomplete");
  const version = {
    id: inForceId,
    mark: publicationMark(xml),
    validFrom: estonianDate(act.aktiParameetrid.kehtivuseAlgus),
    validUntil: act.aktiParameetrid.kehtivuseLopp ? estonianDate(act.aktiParameetrid.kehtivuseLopp) : "",
    verifiedAt,
  };
  lawState.set(law.key, {
    versionId: inForceId,
    verifiedAt,
    validUntil: act.aktiParameetrid.kehtivuseLopp ? Date.parse(act.aktiParameetrid.kehtivuseLopp) : Infinity,
    documents: sections.map((section) => sectionDocument(law, section, version)),
  });
}

export async function refreshForestLaws({ fetchImpl = fetch, now = Date.now() } = {}) {
  const outcomes = await Promise.allSettled(FOREST_LAWS.map((law) => checkLaw(law, { fetchImpl, now })));
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      console.warn(JSON.stringify({ event: "forest-law-check-failed", law: FOREST_LAWS[index].key, message: String(outcome.reason?.message || "").slice(0, 120) }));
    }
  });
  return outcomes.every((outcome) => outcome.status === "fulfilled");
}

function usable(state, now) {
  return Boolean(state) && now - Date.parse(state.verifiedAt) <= MAX_VERIFICATION_AGE_MS && now < state.validUntil;
}

export function currentForestLawDocuments({ now = Date.now() } = {}) {
  return FOREST_LAWS.flatMap((law) => {
    const state = lawState.get(law.key);
    return usable(state, now) ? state.documents : [];
  });
}

function plainWord(value) {
  return String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("et");
}

const GENERIC_TERM_WORDS = new Set(["mets", "metsa", "metsad", "raie", "raied", "seadus", "eeskiri", "metsamaa", "puit", "puud"]);
const LAW_QUERY_CONTEXT_WORDS = new Set(["seaduse", "seaduses", "metsaseaduse", "jargi", "mottes", "oiguslik", "definitsiooni", "moiste"]);
const REVIEWED_FORMS_BY_ROOT = new Map(
  Object.entries(REVIEWED_QUERY_WORD_FORMS)
    .map(([root, forms]) => [plainWord(root), new Set(forms.map(plainWord))]),
);

function stemOf(word) {
  const normalized = plainWord(word);
  return normalized.length < 7 ? normalized : normalized.slice(0, -2);
}

function termPattern(word) {
  const normalized = plainWord(word);
  const forms = REVIEWED_FORMS_BY_ROOT.get(normalized);
  const alternatives = forms
    ? [...forms].sort((left, right) => right.length - left.length).map(escapePattern)
    : [`${escapePattern(stemOf(normalized))}\\p{L}*`];
  return `(?:${alternatives.join("|")})`;
}

function escapePattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function termMatches(words, text) {
  const tokens = plainWord(text).match(/\p{L}+/gu) || [];
  return words.every((word) => {
    const forms = REVIEWED_FORMS_BY_ROOT.get(plainWord(word));
    if (forms) return tokens.some((token) => forms.has(token));
    const stem = stemOf(word);
    return tokens.some((token) => token.startsWith(stem));
  });
}

function definitionPattern(words) {
  const orders = words.length === 2 ? [words, [...words].reverse()] : [words];
  const phrases = orders.map((order) => order.map(termPattern).join(" (?:on )?"));
  const phrase = `(?:${phrases.join("|")})`;
  const nonDefinition = "(?:lubatud|lubatav\\p{L}*|keelatud|keelatuks|lubatuks|esitat\\p{L}*|tehtud|toimunud|vajalik\\p{L}*|kohustuslik\\p{L}*|voimalik\\p{L}*)";
  const copula = `(?:^|[.;:] )${phrase} on\\s+(?!${nonDefinition}\\b)`;
  const classified = `\\bloetakse\\s+${phrase}(?!\\s+${nonDefinition}\\b)`;
  const clearcutActivity = words.length === 1 && plainWord(words[0]) === "lageraie"
    ? `(?:^|[.;:] )${termPattern("lageraie")} korral\\b`
    : "";
  // A law also defines inside a numbered list ("4) trassiraie, mille hulka
  // kuulub …", "6) kujundusraie, mida tehakse …"), by naming the term in
  // brackets after what it is ("… kasutamise võimaldamiseks (harvendusraie)"),
  // or of a stand ("Puistu täius on …"). "7) kuuski, mille koor …" is a list
  // of trees, not a definition.
  const listed = `(?:^|[;:] |\\d\\) )${phrase}, (?:mille hulka|mida tehakse)\\b`;
  const bracketed = `\\(${phrase}\\)`;
  const ofStand = `(?:^|[.;:] )(?:puistu|metsa) ${phrase} on\\s+(?!${nonDefinition}\\b)`;
  return new RegExp(`${copula}|${classified}|${listed}|${bracketed}|${ofStand}${clearcutActivity ? `|${clearcutActivity}` : ""}`, "u");
}

function isStatisticalContext(query) {
  return /\b(?:smi|fao|fra|statistik\w*|statistil\w*)\b/iu.test(String(query || ""));
}

export function askedLawTerm(query) {
  const text = plainWord(query).replace(/[?!.,]+/gu, " ").replace(/\s+/gu, " ").trim();
  const intent = analyzeQueryIntent(query);
  if (["definition", "criteria"].includes(intent.intent)
    && ["forest", "clearcut"].includes(intent.topic)
    && !isStatisticalContext(query)) {
    const relevant = intent.terms
      .map(plainWord)
      .filter((word) => !LAW_QUERY_CONTEXT_WORDS.has(word));
    // "mis on täius metsas" asks about täius; "metsas" only says where.
    if (relevant.length && relevant.every((word) => ["mets", "metsamaa", "lageraie"].includes(word))) return relevant;
  }
  const asked = text.match(/^mis on (\p{L}+(?: \p{L}+)?)$/u)?.[1]
    || text.match(/^mida tahendab (\p{L}+(?: \p{L}+)?)$/u)?.[1]
    || text.match(/^(\p{L}+(?: \p{L}+)?) (?:(?:mis|mida) see tahendab|mida tahendab|mis (?:see )?on)$/u)?.[1]
    || text.match(/^(\p{L}+(?: \p{L}+)?) (?:moiste|tahendus|definitsioon)$/u)?.[1]
    || text.match(/^(\p{L}+)$/u)?.[1];
  if (!asked) return null;
  // "mis on täius metsas": the place word only says where the term is used.
  const words = asked.split(" ").filter((word, index, all) => !(index === all.length - 1 && all.length > 1 && /^metsa(?:s|st|des)?$/u.test(word)));
  if (words.every((word) => GENERIC_TERM_WORDS.has(word)) || !words.some((word) => word.length >= 5)) return null;
  return words;
}

function lawSectionByAnchor(documents, anchor) {
  return documents.find((document) => document?._lawSection
    && new RegExp(`#${anchor}(?:$|[?#])`, "u").test(String(document.url || ""))
    && /metsaseadus/iu.test(String(document.title || "")));
}

function sectionSubsections(value) {
  const content = String(value || "");
  const markers = [...content.matchAll(/\((\d+)\)\s*/gu)];
  return new Map(markers.map((marker, index) => [
    marker[1],
    content.slice(marker.index, markers[index + 1]?.index ?? content.length).trim(),
  ]));
}

function focusSection(document, content, words, includeDefinition) {
  if (!document || content.length < MINIMUM_SECTION_LENGTH || !termMatches(words, content)) return null;
  const definition = definitionPattern(words).test(plainWord(content.replace(/^\(\d+[^)]*\)\s*/u, "")))
    ? content.replace(/^\(\d+[^)]*\)\s*/u, "").trim()
    : "";
  return {
    ...document,
    content,
    _focusedLawTerm: words.join(" "),
    _lawDefinition: includeDefinition ? definition : "",
  };
}

function focusedClearcutSection(documents, subsectionNumber) {
  const section = lawSectionByAnchor(documents, "para29");
  if (!section) return null;
  const content = sectionSubsections(section.content).get(String(subsectionNumber)) || "";
  if (!termMatches(["lageraie"], content)) return null;
  if (subsectionNumber === 1
    && !definitionPattern(["lageraie"]).test(plainWord(content.replace(/^\(\d+[^)]*\)\s*/u, "")))) return null;
  return focusSection(section, content, ["lageraie"], subsectionNumber === 1);
}

function focusedForestSection(documents, words, intent) {
  const section = lawSectionByAnchor(documents, "para3");
  if (!section) return null;
  const paragraphs = sectionSubsections(section.content);
  const landDefinition = intent === "definition" && words.length === 1 && words[0] === "metsamaa";
  const selected = intent === "criteria"
    ? ["1", "2", "3"].map((number) => paragraphs.get(number)).filter(Boolean)
    : [paragraphs.get(landDefinition ? "2" : "1")].filter(Boolean);
  if (selected.length < (intent === "criteria" ? 3 : 1)
    || !definitionPattern(words).test(plainWord(selected[0].replace(/^\(\d+[^)]*\)\s*/u, "")))) return null;
  return focusSection(section, selected.join(" "), words, intent === "definition");
}

function focusedAuthoritySection(documents, subjectTerms) {
  const words = subjectTerms.map((term) => String(term || "").trim()).filter(Boolean);
  if (!words.length) return null;
  const matches = new Map();
  for (const document of documents) {
    if (!document?._lawSection
      || document.organization !== "Riigi Teataja"
      || !/^Metsaseadus\b/u.test(String(document.title || ""))) continue;
    let url;
    try {
      url = new URL(document.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:"
      || !["riigiteataja.ee", "www.riigiteataja.ee"].includes(url.hostname)
      || url.pathname !== "/akt/MS"
      || !/^#para[\p{L}\p{N}]+$/u.test(url.hash)) continue;
    for (const rawStatement of String(document.content || "").split(/(?<=[.!?])\s+/u)) {
      const statement = rawStatement.trim();
      const normalized = plainWord(statement);
      if (!statement
        || !/\bkehtest(?:ab|avad)\b/u.test(normalized)
        || !termMatches(words, statement)) continue;
      matches.set(`${url.href}\n${normalized}`, { document, statement });
    }
  }
  if (matches.size !== 1) return null;
  const { document, statement } = matches.values().next().value;
  return focusSection(document, statement, words, false);
}

function capitalized(text) {
  return text ? text[0].toLocaleUpperCase("et") + text.slice(1) : text;
}

// A definition inside a list sentence is only the asked item, in the law's own
// words: "Kujundusraie, mida tehakse …" out of "Lubatud on järgmised raied: 1)
// uuendusraie, …; 6) kujundusraie, mida tehakse …", and "Hooldusraiet tehakse
// metsa väärtuse tõstmiseks, … (harvendusraie)." out of the hooldusraie list.
// Accent removal keeps each letter in place, so positions found in the plain
// text are the same in the original.
function definitionClause(sentence, words) {
  const plain = plainWord(sentence);
  if (plain.length !== sentence.length) return sentence;
  const phrase = `(?:${words.map(termPattern).join(" ")})`;
  const items = [...plain.matchAll(/(?:^|\s)\d+\)\s([^;]*)/gu)];
  for (const item of items) {
    const start = item.index + item[0].length - item[1].length;
    const text = sentence.slice(start, start + item[1].length).replace(/[.;]\s*$/u, "");
    if (new RegExp(`^${phrase}, (?:mille hulka|mida tehakse)\\b`, "u").test(item[1])) {
      return `${capitalized(text)}.`;
    }
    if (new RegExp(`\\(${phrase}\\)`, "u").test(item[1])) {
      const lead = sentence.slice(0, items[0].index).replace(/[:\s]+$/u, "");
      const upToTerm = text.replace(/\).*$/u, ")");
      return lead ? `${lead} ${upToTerm}.` : `${capitalized(upToTerm)}.`;
    }
  }
  return sentence;
}

export function focusedLawSection(query, documents = []) {
  const intent = analyzeQueryIntent(query);
  if (intent.authoritySubjectTerms.length) {
    return focusedAuthoritySection(documents, intent.authoritySubjectTerms);
  }
  const supportsSpecializedConcept = supportsIntentConcept(intent);
  if (intent.topic === "clearcut") {
    if (intent.intent === "conditions") {
      return supportsSpecializedConcept ? focusedClearcutSection(documents, 4) : null;
    }
    if (supportsSpecializedConcept
      && (intent.intent === "definition" || intent.intent === "criteria")) {
      return focusedClearcutSection(documents, 1);
    }
  }
  if (intent.topic === "forest" && !isStatisticalContext(query)
    && (intent.intent === "definition" || intent.intent === "criteria")) {
    const words = askedLawTerm(query);
    if (!words) return null;
    if (supportsSpecializedConcept && words.length === 1 && ["mets", "metsamaa"].includes(words[0])) {
      return focusedForestSection(documents, words, intent.intent);
    }
  }
  const words = askedLawTerm(query);
  if (!words) return null;
  const mentions = (text) => termMatches(words, text);
  const defines = (text) => definitionPattern(words).test(plainWord(text));
  const beginsWithAskedTerm = (text) => {
    const normalized = plainWord(text).replace(/^\(\d+[^)]*\)\s*/u, "");
    return words.some((word) => new RegExp(`^(?:${termPattern(word)})\\b`, "u").test(normalized));
  };
  const ranked = [];
  for (const document of documents) {
    if (!document?._lawSection) continue;
    const sentences = String(document.content || "").split(/(?<=[.;:])\s+(?=\(?\d*[¹²³⁴⁵⁶⁷⁸⁹]*\)?\s*\p{Lu}|\(\d)/u);
    const matching = sentences.filter((sentence) => mentions(sentence));
    if (!matching.length) continue;
    const defining = matching.filter((sentence) => defines(sentence.replace(/^\(\d+[^)]*\)\s*/u, "")));
    const opening = matching.filter(beginsWithAskedTerm);
    const inHeading = mentions(document.summary);
    const score = (defining.length ? 4 : 0) + (inHeading ? 2 : 0) + (opening.length ? 1 : 0);
    if (!score) continue;
    const lead = [...new Set([...defining, ...opening, ...matching])].slice(0, 5);
    ranked.push({ document, score, content: lead.join(" "), definition: defining[0] });
  }
  const best = ranked.sort((left, right) => right.score - left.score)[0];
  if (!best || best.content.length < MINIMUM_SECTION_LENGTH) return null;
  return {
    ...best.document,
    content: best.content,
    _focusedLawTerm: words.join(" "),
    _lawDefinition: best.definition ? definitionClause(best.definition.replace(/^\(\d+[^)]*\)\s*/u, "").trim(), words) : "",
  };
}
const LAW_TOPIC_UNIT_WORDS = new Set(["ha", "hektar", "aasta", "protsent", "osakaal", "pindala", "ruutmeeter", "kuupmeeter", "tihumeeter"]);
const LAW_TOPIC_OWNER_WORDS = new Set(["eramets", "eraomanik", "eraomand", "eramaa", "riigimaa", "riigimets"]);
const LAW_TOPIC_STATISTIC_PATTERN = /\b(?:19|20)\d{2}\b|protsent|osakaal|\bkui\s+(?:palju|suur\p{L}*)\s+(?:on\s+)?eesti\b/u;
function topicExcludedWord(word, roots) {
  return [...roots].some((root) => word === root || (root.length > 2 && word.startsWith(root)));
}

function topicalBodyMatches(word, text) {
  if (termMatches([word], text)) return true;
  const forms = REVIEWED_FORMS_BY_ROOT.get(plainWord(word));
  const alternatives = forms
    ? [...forms].map(escapePattern)
    : [escapePattern(stemOf(word))];
  return new RegExp(`(?:^|[^\\p{L}])\\p{L}{0,12}(?:${alternatives.join("|")})`, "u")
    .test(plainWord(text));
}

export function topicalLawSection(query, documents = []) {
  const intent = analyzeQueryIntent(query);

  if (askedLawTerm(query)
    || isStatisticalContext(query)
    || LAW_TOPIC_STATISTIC_PATTERN.test(plainWord(query))) return null;
  const words = [...new Set(intent.terms.map(plainWord).filter((word) => (
    word.length >= 5
    && !LAW_QUERY_CONTEXT_WORDS.has(word)
    && !GENERIC_TERM_WORDS.has(word)
    && !topicExcludedWord(word, LAW_TOPIC_UNIT_WORDS)
    && !topicExcludedWord(word, LAW_TOPIC_OWNER_WORDS)
    && !/^\d+$/u.test(word)
  )))];
  if (words.length < 2) return null;

  const sections = [];
  const seen = new Set();
  for (const document of documents.slice(0, 512)) {
    if (!document?._lawSection) continue;
    const key = String(document.id || document.url || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sections.push(document);
  }
  if (!sections.length) return null;

  const headingFrequency = new Map(words.map((word) => [
    word,
    sections.filter((document) => termMatches([word], document.summary || document.title || "")).length,
  ]));
  const rareWords = words.filter((word) => {
    const frequency = headingFrequency.get(word);
    return frequency >= 1 && frequency <= 2;
  });
  if (!rareWords.length) return null;

  const candidates = [];
  for (const document of sections) {
    const heading = document.summary || document.title || "";
    const topics = rareWords.filter((word) => termMatches([word], heading));
    if (!topics.length) continue;
    const body = String(document.content || "").slice(0, 12_000);
    const otherWords = words.filter((word) => !topics.includes(word) && topicalBodyMatches(word, body));
    const remainingWords = words.filter((word) => !topics.includes(word));
    if (!otherWords.length || (remainingWords.length >= 3 && otherWords.length < 2)) continue;
    let content = String(document.content || "");
    if (content.length > 2_500) {
      const statements = content.slice(0, 12_000)
        .split(/(?<=[.;:])\s+(?=\(?\d*[¹²³⁴⁵⁶⁷⁸⁹]*\)?\s*\p{Lu}|\(\d)/u);
      content = statements
        .filter((statement) => words.some((word) => topicalBodyMatches(word, statement)))
        .slice(0, 6)
        .join(" ");
      if (content.length < MINIMUM_SECTION_LENGTH) continue;
    }
    candidates.push({ document, content, score: topics.length * 10 + otherWords.length });
  }
  candidates.sort((left, right) => right.score - left.score);
  const [best, next] = candidates;
  if (!best || (next && next.score === best.score)) return null;
  return { ...best.document, content: best.content, _focusedLawTopic: true };
}

export function definesLawTerm(query, text) {
  const words = askedLawTerm(query);
  if (!words) return false;
  const intent = analyzeQueryIntent(query);
  if (intent.topic === "forest" && intent.intent === "definition"
    && supportsIntentConcept(intent) && !isStatisticalContext(query)
    && words.length === 1 && words[0] === "mets") {
    return /(?:^|[.;:]\s+)mets\s+on\s+okosusteem\b/u.test(plainWord(text));
  }
  return definitionPattern(words).test(plainWord(text));
}

export function forestLawVersionStamp({ now = Date.now() } = {}) {
  return FOREST_LAWS.map((law) => {
    const state = lawState.get(law.key);
    return usable(state, now) ? state.versionId : "none";
  }).join(",");
}

// The short reviewed summaries were written against one version. Once the feed
// names another, what they say may no longer hold, so they step aside.
export function reviewedLawSummaryIsOutdated(document) {
  if (!document?._reviewedLawVersion) return false;
  const law = FOREST_LAWS.find((item) => item.key === document._reviewedLawKey);
  const current = law ? lawState.get(law.key)?.versionId : undefined;
  return Boolean(current) && current !== document._reviewedLawVersion;
}

export function startForestLawChecks() {
  // A failed first check must not leave the laws out for a whole hour.
  const check = () => refreshForestLaws().then((complete) => {
    if (!complete) setTimeout(() => void check(), RETRY_AFTER_FAILURE_MS).unref();
  }).catch(() => undefined);
  void check();
  const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}

export function resetForestLawsForTests() {
  lawState.clear();
}
