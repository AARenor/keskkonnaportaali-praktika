import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sourcePayload = JSON.parse(readFileSync(new URL("./knowledge/forestry/sources.json", import.meta.url), "utf8"));
const documentPayload = JSON.parse(readFileSync(new URL("./knowledge/forestry/documents.json", import.meta.url), "utf8"));

const ALLOWED_SOURCE_HOSTS = new Set([
  "keskkonnaportaal.ee",
  "www.keskkonnaportaal.ee",
  "keskkonnaagentuur.ee",
  "www.keskkonnaagentuur.ee",
  "keskkonnaamet.ee",
  "www.keskkonnaamet.ee",
  "riigiteataja.ee",
  "www.riigiteataja.ee",
  "kliimaministeerium.ee",
  "www.kliimaministeerium.ee",
]);

const STOPWORDS = new Set([
  "aga", "all", "alla", "alusel", "ei", "eesti", "eestis", "ehk", "et", "ja", "jah", "kas",
  "kogu", "kui", "kuidas", "kus", "ma", "meie", "miks", "mis", "mida", "millal", "milline",
  "minu", "ning", "nii", "on", "oma", "osa", "palju", "praegu", "saa", "saab", "see", "seda",
  "selle", "siis", "suur", "suurem", "või", "vähem", "üle", "üks", "ühte",
]);

const ESTONIAN_SUFFIXES = [
  "mistest", "misega", "mistega", "miseks", "mistel", "mistes", "mised", "desse", "tesse", "dega",
  "tega", "dele", "tele", "dest", "test", "delt", "telt", "mine", "mise", "mata", "maks", "mast",
  "sse", "vad", "nud", "tud", "sid", "del", "tel", "des", "tes", "st", "lt", "le", "ga", "ta",
  "ks", "ni", "na", "da", "ma", "d", "t", "s",
];

const QUERY_EXPANSIONS = {
  arv: ["number", "andmeallikas", "metoodika"],
  arvud: ["number", "andmeallikas", "metoodika"],
  numbrid: ["number", "andmeallikas", "metoodika"],
  puidutagavara: ["tagavara", "puidukogus"],
  puiduvaru: ["tagavara", "puidukogus", "raiutav"],
  raiuda: ["raie", "raiutav"],
  raiutakse: ["raie", "raiemaht"],
  raiedokument: ["metsateatis", "kavandatav", "raie"],
  kasvust: ["juurdekasv"],
  majandatav: ["mittemajandatav", "majanduspiirang"],
  männikuid: ["mänd", "männi", "puuliik"],
  mändi: ["mänd", "männi", "puuliik"],
  kuusikuid: ["kuusk", "kuuse", "puuliik"],
  kuuske: ["kuusk", "kuuse", "puuliik"],
  vallal: ["vald", "omavalitsus"],
  vallas: ["vald", "omavalitsus"],
  metsane: ["metsasus", "metsamaa"],
  metsapinna: ["metsamaa", "metsasus"],
  metsastatistika: ["metsaandmed", "andmeallikas", "metoodika"],
  metsaarv: ["number", "andmeallikas", "metoodika"],
  tabelit: ["andmeallikas", "metoodika"],
  erineva: ["erinevad", "numbrid", "andmeallikas", "metoodika"],
  lahknevad: ["erinevad", "numbrid", "andmeallikas", "metoodika"],
  proovialade: ["proovitükk", "valikuuring", "SMI"],
  proovipunktide: ["proovitükk", "valikuuring", "SMI"],
  registri: ["metsaregister", "eraldis"],
  eraldiste: ["metsaregister", "eraldis"],
  eraldisregister: ["metsaregister", "eraldis"],
  lausinventeeritud: ["lausinventeerimine", "lausmetsakorraldus"],
  maatüki: ["kinnistu", "katastritunnus", "metsaregister"],
  katastriüksuse: ["kinnistu", "katastritunnus", "metsaregister"],
  takseerandmed: ["eraldis", "metsaregister"],
  koosseisu: ["eraldis", "puuliik", "kinnistu"],
  raiekavatsusel: ["metsateatis", "kavandatav", "raie", "lubav", "märge"],
  trend: ["aegrida", "muutus"],
  aastate: ["aegrida", "20", "aastat"],
  põuad: ["põud", "kliimamuutus"],
  soojemad: ["kliimamuutus", "soojenemine"],
  riigimetsa: ["RMK", "riigimets"],
  vanusejaotus: ["vanuseklass", "keskmine", "vanus"],
  männikute: ["mänd", "männi", "puuliik"],
  kuusikute: ["kuusk", "kuuse", "puuliik"],
  vaatlusi: ["valim", "proovitükk", "täpsus"],
  kestliku: ["jätkusuutlik", "juurdekasv", "raiemaht"],
  kaitsestaatuse: ["kaitseala", "õiguslik", "kaitse"],
  raiereegel: ["raie", "kaitseala", "tingimus"],
  kaitsealal: ["kaitseala", "kaitstud"],
  kaitsealadel: ["kaitseala", "kaitstud"],
};

const FORESTRY_MARKERS = [
  "mets", "puist", "raie", "raiu", "smi", "rmk", "tagavara", "juurdekasv", "mänd", "männi",
  "kuusk", "ürask", "katastr", "eraldis", "tihumeet", " tm", "fra ", "suhteline viga",
  "proovitükk", "lageraie", "lageraije", "metsateatis", "metsaregister", "metsainventuur",
  "eri allikad", "erinevaid numbreid", "range kaitse", "kaitse all", "majandatav",
  "valimi esinduslikkus", "suurem valim", "vaatlusi", "täpsema tulemuse", "51,84", "54,08",
];

const UNSAFE_MARKERS = [
  "ignoreeri juhiseid", "unusta eelmised reeglid", "süsteemijuhis", "api võti", "salasõna", "parool",
];

const BROAD_FOREST_QUERIES = new Set([
  "mets", "metsad", "metsandus", "eesti mets", "mets eestis", "eesti metsad", "metsaandmed", "metsade seisund",
]);

const BROAD_DOCUMENT_IDS = ["forest-area", "will-forest-run-out", "why-numbers-differ"];
const BROAD_SUGGESTIONS = [
  "Kui suur osa Eestist on mets?",
  "Kas raiemaht ületab juurdekasvu?",
  "Miks annavad allikad erinevaid metsanumbreid?",
  "Mis vahe on SMI-l ja Metsaregistril?",
  "Kui suur osa metsast on kaitstud?",
];

export function normalizeForestryText(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("et")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function rawTokens(value) {
  return (normalizeForestryText(value).match(/[0-9a-zõäöüšž]+/giu) || [])
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function stem(token) {
  if (/^\d+$/.test(token) || token.length <= 4) return token;
  for (const suffix of ESTONIAN_SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) return token.slice(0, -suffix.length);
  }
  return token;
}

function analysisTokens(value, expand = false) {
  const tokens = rawTokens(value);
  const expanded = expand
    ? tokens.flatMap((token) => [token, ...(QUERY_EXPANSIONS[token] || [])])
    : tokens;
  return expanded.map(stem);
}

function counts(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) || 0) + 1);
  return result;
}

function characterNgrams(value, size = 3) {
  const normalized = rawTokens(value).join(" ");
  if (!normalized) return new Map();
  const padded = `  ${normalized}  `;
  const grams = [];
  for (let index = 0; index <= padded.length - size; index += 1) grams.push(padded.slice(index, index + size));
  return counts(grams);
}

function cosine(left, right) {
  if (!left.size || !right.size) return 0;
  let numerator = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const value of left.values()) leftMagnitude += value * value;
  for (const value of right.values()) rightMagnitude += value * value;
  for (const [key, value] of left) numerator += value * (right.get(key) || 0);
  return numerator / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude) || 1);
}

function assertKnowledgeBase() {
  if (sourcePayload.schema_version !== 1 || documentPayload.schema_version !== 1) {
    throw new Error("Unsupported forestry knowledge schema");
  }
  const sources = new Map();
  for (const source of sourcePayload.sources || []) {
    const url = new URL(source.url);
    if (url.protocol !== "https:" || !ALLOWED_SOURCE_HOSTS.has(url.hostname) || sources.has(source.id)) {
      throw new Error(`Invalid forestry source: ${source.id || "unknown"}`);
    }
    sources.set(source.id, Object.freeze({ ...source }));
  }
  const documents = [];
  const ids = new Set();
  for (const document of documentPayload.documents || []) {
    if (!document.id || ids.has(document.id) || !document.answer?.summary || !document.answer?.methodology) {
      throw new Error(`Invalid forestry document: ${document.id || "unknown"}`);
    }
    for (const reference of document.sources || []) {
      if (!sources.has(reference.source_id) || !reference.locator) throw new Error(`Invalid source reference in ${document.id}`);
    }
    ids.add(document.id);
    documents.push(Object.freeze({ ...document }));
  }
  return { sources, documents };
}

const KNOWLEDGE = assertKnowledgeBase();
const DOCUMENT_BY_ID = new Map(KNOWLEDGE.documents.map((document) => [document.id, document]));

export const FORESTRY_KB_REVISION = `forestry-${createHash("sha256")
  .update(JSON.stringify(sourcePayload))
  .update(JSON.stringify(documentPayload))
  .digest("hex")
  .slice(0, 12)}`;

function documentText(document) {
  const weighted = [document.title, document.title, document.title, document.title];
  for (let index = 0; index < 5; index += 1) weighted.push(...document.question_aliases);
  for (let index = 0; index < 3; index += 1) weighted.push(...(document.keywords || []));
  weighted.push(...(document.topics || []), ...(document.topics || []));
  weighted.push(document.answer.summary, document.answer.methodology, ...(document.answer.limitations || []));
  return weighted.join(" ");
}

const INDEX = KNOWLEDGE.documents.map((document) => ({
  document,
  terms: counts(analysisTokens(documentText(document))),
  length: analysisTokens(documentText(document)).length,
  aliasTokens: [document.title, ...document.question_aliases].map((alias) => new Set(analysisTokens(alias))),
  aliasNgrams: [document.title, ...document.question_aliases].map(characterNgrams),
  keywords: new Set(analysisTokens((document.keywords || []).join(" "))),
}));

const AVERAGE_LENGTH = INDEX.reduce((sum, item) => sum + item.length, 0) / INDEX.length;
const DOCUMENT_FREQUENCY = new Map();
for (const item of INDEX) {
  for (const term of item.terms.keys()) DOCUMENT_FREQUENCY.set(term, (DOCUMENT_FREQUENCY.get(term) || 0) + 1);
}

function bm25Scores(queryTokens) {
  const result = new Map();
  const queryCounts = counts(queryTokens);
  const totalDocuments = INDEX.length;
  for (const item of INDEX) {
    let score = 0;
    for (const [token, queryFrequency] of queryCounts) {
      const termFrequency = item.terms.get(token) || 0;
      if (!termFrequency) continue;
      const documentFrequency = DOCUMENT_FREQUENCY.get(token) || 0;
      const inverseDocumentFrequency = Math.log(1 + (totalDocuments - documentFrequency + 0.5) / (documentFrequency + 0.5));
      const denominator = termFrequency + 1.5 * (1 - 0.72 + 0.72 * item.length / AVERAGE_LENGTH);
      score += inverseDocumentFrequency * (termFrequency * 2.5 / denominator) * Math.min(queryFrequency, 2);
    }
    result.set(item.document.id, score);
  }
  return result;
}

function rankScores(scores) {
  return [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "et"))
    .map(([id]) => id);
}

function reciprocalRankFusion(rankings, rankConstant = 60) {
  const result = new Map();
  for (const ranking of rankings) {
    ranking.forEach((documentId, index) => {
      result.set(documentId, (result.get(documentId) || 0) + 1 / (rankConstant + index + 1));
    });
  }
  return result;
}

export function retrieveForestryDocuments(question, limit = 4) {
  const queryTokens = analysisTokens(question, true);
  const querySet = new Set(queryTokens);
  if (!queryTokens.length) return [];
  const bm25 = bm25Scores(queryTokens);
  const queryNgrams = characterNgrams(question);
  const semantic = new Map();
  const keyword = new Map();
  for (const item of INDEX) {
    const aliasCosine = Math.max(0, ...item.aliasNgrams.map((value) => cosine(queryNgrams, value)));
    const aliasCoverage = Math.max(0, ...item.aliasTokens.map((aliasTokens) => {
      const union = new Set([...querySet, ...aliasTokens]);
      const intersection = [...querySet].filter((token) => aliasTokens.has(token)).length;
      return intersection / Math.max(1, union.size);
    }));
    semantic.set(item.document.id, 0.72 * aliasCosine + 0.28 * aliasCoverage);
    keyword.set(item.document.id, [...querySet].filter((token) => item.keywords.has(token)).length / Math.max(1, querySet.size));
  }
  const fused = reciprocalRankFusion([rankScores(bm25), rankScores(semantic), rankScores(keyword)]);
  const maxFused = (fused.size ? Math.max(...fused.values()) : 0) || 1;
  const maxBm25 = (bm25.size ? Math.max(...bm25.values()) : 0) || 1;
  const routedDocumentId = routeForestryIntent(question);
  return INDEX.map((item) => {
    const id = item.document.id;
    const score = 0.5 * (semantic.get(id) || 0)
      + 0.22 * ((fused.get(id) || 0) / maxFused)
      + 0.18 * ((bm25.get(id) || 0) / maxBm25)
      + 0.1 * (keyword.get(id) || 0)
      + (id === routedDocumentId ? 1 : 0);
    return { document: item.document, score: Number.isFinite(score) ? score : 0 };
  })
    .sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id, "et"))
    .slice(0, Math.max(1, Math.min(Number(limit) || 4, 8)));
}

export function isForestryQuestion(question) {
  const normalized = normalizeForestryText(question);
  return FORESTRY_MARKERS.some((marker) => normalized.includes(marker));
}

function isBroadForestryQuestion(question) {
  const normalized = normalizeForestryText(question).replace(/[?!.,]+$/g, "").trim();
  return BROAD_FOREST_QUERIES.has(normalized)
    || (normalized.length <= 22 && rawTokens(normalized).length <= 2 && /\bmetsa?(?:d|st|le|ga|s)?\b/u.test(normalized));
}

function includesAny(value, markers) {
  return markers.some((marker) => value.includes(marker));
}

// Transparent intent routing handles high-stakes distinctions that lexical
// similarity alone cannot make reliably (for example stock vs harvestable
// volume, national vs municipal area, and SMI vs the stand register).
export function routeForestryIntent(question) {
  const value = normalizeForestryText(question);
  const has = (...markers) => includesAny(value, markers);

  if (has("kaitsestaatuse", "saja aasta", "100 aasta") && has("puistu", "mets")) return "old-forest-protection";
  if (has("lageraije", "lageraie") && has("keskkonnavast", "alati")) return "clearcut-value-judgement";
  if (has("lageraije", "lageraie") && has("trend", "aastatel", "aasta jooksul", "aegrida")) return "clearcut-over-time";
  if (has("männik", "mänd") && has("kuusik", "kuusk") && has("võrdle", "hektar", "tagavara")) return "pine-versus-spruce";
  if (has("ürask", "põleng", "kuivus", "põud") && has("kliima", "soojen")) return "climate-impact";
  if (has("raiekavats", "metsateatis", "lubav märge")) return "forest-notice";
  if (has("vaatlusi", "proovipunkt", "valim") && has("täpsem", "täpsus", "korda")) return "sample-size-and-precision";

  if (has("rmk", "riigimetsa", "riigimets") && has("kogu eesti", "kogu riigi", "keskkonnaagentuur", "smi", "statistika")) {
    return "rmk-versus-smi";
  }
  if (
    (has("smi", "metsainventuur", "valikuuring", "proovipunkt", "lausinventeer") && has("metsaregister", "eraldisregister", "registri tagavara"))
    || (has("eraldisregister", "metsaregister") && has("riigi hinnang", "statistiline", "sama tulemuse"))
  ) return "smi-versus-metsaregister";

  if (
    (has("raiemaht", "raie maht", "raietest", "raiemahu") && has("juurdekasv", "kasvunäitaja", "kasvuhinnang"))
    || (has("juurdekasv", "kasvuhinnang") && has("kestlik", "jätkusuutlik"))
  ) return "harvest-versus-increment";
  if (has("15,4303", "15.4303") || (has("juurdekasv", "kasvuhinnang") && has("kust tuleb", "kuidas arvut", "metoodika"))) {
    return "increment-method";
  }

  if (
    (has("452,831", "452.831", "452 miljon") && has("täpne", "vaieldamatu", "tegelik puidumaht"))
    || (has("kauri", "ametliku", "eri allik", "erinevaid") && has("metsaarv", "ei ühti", "teise ametliku tabel", "numbr"))
  ) return "why-numbers-differ";
  if (has("452,831", "452.831", "452 miljon") && has("raiutav", "üles võtta", "kõik võib", "varu")) {
    return "stock-versus-harvestable";
  }

  if (has("metsa kadum", "metsad häviv", "mets hävib", "mets otsa", "mets kaob") && has("trend", "ühe aasta", "raiemahu", "metsastatistika")) {
    return "will-forest-run-out";
  }
  if (has("raie maht", "raiemaht", "raiemahu") && has("kümnendi", "läbi aastate", "aastate jooksul", "aegrida", "muutunud")) {
    return "harvest-over-time";
  }
  if (has("vanusejaotus", "vanuseklass") && has("noorte", "trend", "nihkub", "keskmine vanus")) return "forest-age-trend";

  if (has("kaitseala", "looduskaitseala") && has("raie", "raiuda", "lubatud", "vöönd")) return "logging-in-protected-areas";
  if (has("mittemajandatav", "piiranguga mets", "kaitstud mets", "range kaitse") && has("osakaal", "protsent", "pindala")) {
    return "protected-forest-share";
  }
  if (has("omavalitsus", "vallas", "vallal", "maakonnas", "võru vald", "võru linn") && has("metsasus", "metsamaa", "metsa pindala")) {
    return "municipality-forest-area";
  }
  if (has("maatüki", "kinnistu", "katastriüksuse") && has("puistu", "metsaeraldis", "metsaregister", "koosseisu", "teenuses")) {
    return "property-forest-data";
  }
  if (
    (has("metsamaa", "metsasus") && has("hektar", "osakaal", "riigi pindala", "protsent"))
    || has("51,84", "54,08")
  ) return "forest-area";

  return null;
}

function sourceFor(reference) {
  const source = KNOWLEDGE.sources.get(reference.source_id);
  return {
    id: source.id,
    title: source.title,
    organization: source.publisher,
    sourceSystem: source.publisher,
    type: source.source_type === "official_dataset" ? "Ametlik andmestik" : "Ametlik allikas",
    published: source.data_year ? String(source.data_year) : source.updated_at || source.published_at || "jooksev",
    url: source.url,
    summary: reference.locator ? `Asukoht allikas: ${reference.locator}` : source.notes || "Ametlik algallikas.",
    content: source.notes || "",
    locator: reference.locator,
    tags: [source.source_type, source.data_year ? String(source.data_year) : null].filter(Boolean),
    sourceTier: "reviewed",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
  };
}

function buildSourceIndex(documents) {
  const sources = [];
  const citationById = new Map();
  for (const document of documents) {
    for (const reference of document.sources || []) {
      if (citationById.has(reference.source_id)) continue;
      const source = sourceFor(reference);
      source.citation = sources.length + 1;
      citationById.set(reference.source_id, source.citation);
      sources.push(source);
    }
  }
  return { sources, citationById };
}

function citationsFor(document, citationById) {
  return [...new Set((document.sources || []).map((reference) => citationById.get(reference.source_id)).filter(Boolean))];
}

function clarificationFor(document) {
  if (document.id === "municipality-forest-area") {
    return "Millise valla kohta soovid metsamaa pindala või metsasuse protsenti?";
  }
  if (document.id === "harvest-over-time") {
    return "Milliseid aastaid või perioode soovid võrrelda?";
  }
  if (document.id === "clearcut-over-time") {
    return "Millist kümneaastast perioodi soovid võrrelda?";
  }
  return null;
}

function knowledgeResponse(query, selectedDocuments, { broad = false, topScore = 1 } = {}) {
  const { sources, citationById } = buildSourceIndex(selectedDocuments);
  const primary = selectedDocuments[0];
  let parts;
  let title;
  let intro;
  let note;

  if (broad) {
    const [area, outlook, differences] = selectedDocuments;
    title = "Eesti metsa ei kirjelda üksainus number";
    intro = "Lühidalt: Eestis on metsamaad üle poole pindalast, kuid metsa seisundit tuleb hinnata mitme näitaja ja sama metoodikaga aegrea põhjal.";
    parts = [
      { title: "Kui palju metsa?", text: area.answer.summary, citations: citationsFor(area, citationById) },
      { title: "Mida pindala ei ütle?", text: outlook.answer.summary, citations: citationsFor(outlook, citationById) },
      { title: "Miks arvud erinevad?", text: differences.answer.summary, citations: citationsFor(differences, citationById) },
    ];
    note = "SMI on valikuuring ning arvud tuleb alati siduda aasta, definitsiooni ja avaldatud veahinnanguga.";
  } else {
    title = primary.title;
    intro = primary.answer.summary;
    parts = [
      { title: "Kuidas seda hinnatakse?", text: primary.answer.methodology, citations: citationsFor(primary, citationById) },
    ];
    note = (primary.answer.limitations || []).slice(0, 2).join(" ");
  }

  return {
    query,
    total: selectedDocuments.length,
    generatedAt: new Date().toISOString(),
    answer: {
      eyebrow: "Koondvastus",
      title,
      intro,
      introCitations: broad ? citationsFor(selectedDocuments[0], citationById) : citationsFor(primary, citationById),
      parts,
      note,
    },
    sources,
    clarification: broad ? "Kas soovid edasi vaadata metsasust, raiet ja juurdekasvu, kaitset või konkreetset piirkonda?" : clarificationFor(primary),
    related: (broad ? BROAD_SUGGESTIONS : primary.related_questions || BROAD_SUGGESTIONS).slice(0, 6),
    evidence: {
      kind: "reviewed-forestry-knowledge",
      answerable: true,
      revision: FORESTRY_KB_REVISION,
      documentIds: selectedDocuments.map((document) => document.id),
      topScore,
    },
  };
}

export function answerForestryQuestion(question) {
  const query = String(question || "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!query) return null;
  const normalized = normalizeForestryText(query);
  if (/\b(?:https?|file|ftp|gopher):\/\//iu.test(query) || /<\s*\/?\s*[a-z]/iu.test(query) || UNSAFE_MARKERS.some((marker) => normalized.includes(marker))) {
    return {
      query,
      total: 0,
      generatedAt: new Date().toISOString(),
      answer: {
        eyebrow: "Koondvastus",
        title: "Palun sõnasta metsaküsimus ilma välise lingi või juhisteta",
        intro: "Otsing vastab ainult avalike metsaandmete sisuküsimustele ega järgi päringusse lisatud tehnilisi juhiseid.",
        introCitations: [],
        parts: [],
        note: "Proovi küsida näiteks metsasuse, SMI, raiemahu, kaitse või Metsaregistri kohta.",
      },
      sources: [],
      clarification: "Millist metsa näitajat, piirkonda või perioodi soovid uurida?",
      related: BROAD_SUGGESTIONS.slice(0, 4),
      evidence: { kind: "safe-abstention", revision: FORESTRY_KB_REVISION, documentIds: [], topScore: 0 },
    };
  }

  if (isBroadForestryQuestion(query)) {
    return knowledgeResponse(query, BROAD_DOCUMENT_IDS.map((id) => DOCUMENT_BY_ID.get(id)), { broad: true, topScore: 1 });
  }

  const routedDocumentId = routeForestryIntent(query);
  if (routedDocumentId) {
    return knowledgeResponse(query, [DOCUMENT_BY_ID.get(routedDocumentId)], { topScore: 1 });
  }
  if (!isForestryQuestion(query)) return null;

  const ranked = retrieveForestryDocuments(query, 4);
  if (!ranked.length || ranked[0].score < 0.34) return null;
  return knowledgeResponse(query, [ranked[0].document], { topScore: ranked[0].score });
}

export function getForestrySuggestions(query, limit = 5) {
  const clean = String(query || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 5));
  if (!clean || isBroadForestryQuestion(clean)) return BROAD_SUGGESTIONS.slice(0, safeLimit);
  const normalized = normalizeForestryText(clean);
  const normalizedTokens = normalized.match(/[0-9a-zõäöüšž]+/giu) || [];
  const aliasMatches = KNOWLEDGE.documents
    .flatMap((document, documentIndex) => (document.question_aliases || []).map((value, aliasIndex) => ({
      value,
      documentIndex,
      aliasIndex,
    })))
    .map((item) => {
      const alias = normalizeForestryText(item.value);
      const aliasTokens = alias.match(/[0-9a-zõäöüšž]+/giu) || [];
      const prefixMatches = normalizedTokens.filter((token) => aliasTokens.some((aliasToken) => (
        aliasToken.startsWith(token) || token.startsWith(aliasToken)
      ))).length;
      const score = alias.startsWith(normalized) ? 100
        : normalizedTokens.length && prefixMatches === normalizedTokens.length ? 60 + prefixMatches
          : 0;
      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score
      || left.documentIndex - right.documentIndex
      || left.aliasIndex - right.aliasIndex)
    .map((item) => item.value);
  const semanticMatches = (isForestryQuestion(clean) ? retrieveForestryDocuments(clean, safeLimit) : [])
    .filter((item) => item.score >= 0.22)
    .map((item) => item.document.question_aliases[0] || item.document.title)
    .filter(Boolean);
  return [...aliasMatches, ...semanticMatches]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .slice(0, safeLimit);
}

export function forestryKnowledgeStats() {
  return {
    revision: FORESTRY_KB_REVISION,
    sources: KNOWLEDGE.sources.size,
    documents: KNOWLEDGE.documents.length,
    faqTopics: Object.keys(documentPayload.required_coverage?.faq || {}).length,
    misconceptions: Object.keys(documentPayload.required_coverage?.misconception || {}).length,
  };
}
