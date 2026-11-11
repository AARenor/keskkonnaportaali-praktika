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

// Search shortens compounds ("valgustusraie" to "raie"), which is too broad for
// asking what one legal term means, so these questions look for the whole term.
const GENERIC_TERM_WORDS = new Set(["mets", "metsa", "metsad", "raie", "raied", "seadus", "eeskiri", "metsamaa", "puit", "puud"]);

export function askedLawTerm(query) {
  const text = plainWord(query).replace(/[?!.,]+/gu, " ").replace(/\s+/gu, " ").trim();
  const asked = text.match(/^mis on (\p{L}+(?: \p{L}+)?)$/u)?.[1]
    || text.match(/^(\p{L}+(?: \p{L}+)?) (?:mis|mida) see tahendab$/u)?.[1]
    || text.match(/^(\p{L}+(?: \p{L}+)?) (?:moiste|tahendus|definitsioon)$/u)?.[1]
    || text.match(/^(\p{L}+)$/u)?.[1];
  if (!asked) return null;
  const words = asked.split(" ");
  if (words.every((word) => GENERIC_TERM_WORDS.has(word)) || !words.some((word) => word.length >= 6)) return null;
  return words;
}

// A definition opens the sentence: "Raadamine on raie", "Mets on hukkunud, kui".
// "Kui metsateatis on esitatud" only mentions the term, so it does not count.
function definitionPattern(stems) {
  const orders = stems.length === 2 ? [stems, [...stems].reverse()] : [stems];
  const forms = orders.map((order) => order.map((stem) => `${stem}\\p{L}*`).join(stems.length === 2 ? " (?:on )?" : " "));
  const term = `\\p{L}{0,12}(?:${forms.join("|")})`;
  return new RegExp(`(?:^|[.;:] )${term} on\\b|\\bloetakse ${term}`, "u");
}

function stemOf(word) {
  return word.slice(0, Math.max(5, word.length - 3));
}

const textForLookup = (text) => plainWord(text);

// Picks the sentences of one section that speak about the asked term, with a
// definition first. The narrowed text is still the law's own words, and the
// model then cannot answer "what is raadamine" from the section's fee rule.
export function focusedLawSection(query, documents = []) {
  const words = askedLawTerm(query);
  if (!words) return null;
  const stems = words.map(stemOf);
  const mentions = (text) => stems.every((stem) => new RegExp(`(?:^|[^\\p{L}])\\p{L}{0,12}${stem}`, "u").test(text));
  const defines = (text) => definitionPattern(stems).test(text);
  const ranked = [];
  for (const document of documents) {
    if (!document?._lawSection) continue;
    const sentences = String(document.content || "").split(/(?<=[.;:])\s+(?=\(?\d*[¹²³⁴⁵⁶⁷⁸⁹]*\)?\s*\p{Lu}|\(\d)/u);
    const matching = sentences.filter((sentence) => mentions(textForLookup(sentence)));
    if (!matching.length) continue;
    const defining = matching.filter((sentence) => defines(textForLookup(sentence).replace(/^\(\d+[^)]*\)\s*/u, "")));
    const opening = matching.filter((sentence) => new RegExp(`^(?:\\(\\d+[^)]*\\)\\s*)?${stems[0]}`, "u").test(textForLookup(sentence)));
    const inHeading = mentions(textForLookup(document.summary));
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
    _lawDefinition: best.definition ? best.definition.replace(/^\(\d+[^)]*\)\s*/u, "").trim() : "",
  };
}

export function definesLawTerm(query, text) {
  const words = askedLawTerm(query);
  if (!words) return false;
  return definitionPattern(words.map(stemOf)).test(plainWord(text));
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
