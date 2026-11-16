import { specialistSubjectVariants } from "./topic-keywords.mjs";
import { analyzeQueryIntent } from "./query_intent.mjs";
import { answersAskedHectares, extractAnswersQuery } from "./answer_coverage.mjs";
import { claimTokens, safeSemanticInference, tokensShareStem } from "./llm_claim_grounding.mjs";
import { relationshipClaimHasPassageWitness } from "./proposition-grounding.mjs";
import { condenseRedundantSentences } from "./search_public_response.mjs";
import { NO_ANSWER_EYEBROW, NO_ANSWER_INTRO } from "./search_response.mjs";
import { sanitizeLlmEvidenceText } from "./search_evidence_sanitization.mjs";
import {
  forestEvidenceIntent,
  normalize,
  queryTerms,
  rootIsDomain,
  textHasActionRoot,
  textHasQueryRoot,
} from "./search_query_terms.mjs";
import {
  hasCompleteSentenceEnding,
  passageDisclaimsEvidence,
  splitTextPassages,
} from "./search_evidence.mjs";

function passageQueryCoverage(query, passage) {
  const roots = queryTerms(query);
  if (!roots.length) return 0;
  return roots.filter((root) => textHasQueryRoot(passage, root)).length / roots.length;
}

function passageDirectness(query, passage) {
  const roots = queryTerms(query);
  const text = normalize(passage);
  const cleanQuery = normalize(query);
  const years = cleanQuery.match(/\b(?:19|20)\d{2}\b/gu) || [];
  // Describing what a page covers is navigation, not an explanation of the
  // subject. Prefer its actual factual passage even with fewer exact words.
  const pageDescription = /\b(?:juhend|leht|artikkel|ulevaade|andmestik)\w*\s+(?:selgita|kirjelda|tutvusta|sisalda|kasitle)\w*/u.test(text);
  const unrelatedEvent = /\b(?:seminar|konverents|koolitus|registreeru)\w*/u.test(text)
    && !/\b(?:seminar|konverents|koolitus|uritus)\w*/u.test(cleanQuery);
  const yearScore = (years.length ? (years.every((year) => text.includes(year)) ? 20 : -20) : 0)
    - (pageDescription || unrelatedEvent ? 24 : 0);
  if (/\b(?:ohtlik|kahjulik|terviserisk|tervisemoju|risk)\w*/u.test(cleanQuery)) {
    const consequence = /\b(?:haigestu|kopsuvah|vahki|vahk|kahjusta|murgi|surma|suremu|hingamis|tervisehaire)\w*/u.test(text);
    return yearScore + (consequence ? 20 : 0);
  }
  if (/\b(?:paritolu|parineb|tekib|tekkimise|pohjustab)\b/u.test(cleanQuery)) {
    const origin = /\b(?:allikas|allikaks|parineb|tekib|tekivad|pohjustab|pohjustavad)\b/u.test(text);
    return yearScore + (origin ? 20 : 0);
  }
  if (roots.includes("keskkonnamoju")) {
    const subjectRoots = roots.filter((root) => !["keskkonnamoju", "ida", "virumaa"].includes(root));
    const hasSubject = subjectRoots.some((root) => textHasQueryRoot(text, root));
    const hasImpact = textHasQueryRoot(text, "keskkonnamoju");
    const concreteImpact = /\b(?:pohjave|pinnave|joogive|mura|lohket|tolm|hairing|leevend|enneta|taaskasut|aherain|eluslood|maastik|kahju)\w*/u.test(text);
    const procedureOnly = /\b(?:nousolek|komisjon|vallavalits|ministeerium|avalik rahvakoosolek)\w*/u.test(text)
      && !concreteImpact;
    return yearScore
      + (hasSubject && hasImpact ? 20 : 0)
      + (concreteImpact ? 12 : 0)
      - (procedureOnly ? 18 : 0);
  }
  if (roots.some((root) => ["muutus", "kasv"].includes(root))
    && roots.some((root) => ["noor", "vanus"].includes(root))) {
    const hasForestAge = text.includes("mets") && /\b(?:noor|vanus|vana)\w*/u.test(text);
    const hasDirection = /\b(?:suuren|vahen|lang|kahan|pusi)\w*/u.test(text);
    return yearScore + (hasForestAge && hasDirection ? 20 : 0);
  }
  // Guidance questions need an instruction, not a description of the page.
  const guidanceQuestion = /\b(?:kuidas|mida\s+teha|mida\s+peab|kuhu|kus\s+saab|millised\s+on\s+nouded|kuidas\s+valtida|kuidas\s+taotleda)\b/u.test(normalize(query))
    && !/\b(?:kui\s+palju|kui\s+suur|pindala|osakaal|muutunud|muutus|trend|aastatel|arv|kogus|protsent)\b/u.test(normalize(query));
  if (guidanceQuestion) {
    const adviceText = /\b(?:tuleb|peab|soovita\w*|valdi\w*|valtida|eemalda\w*|kuivata\w*|tuuluta\w*|puhasta\w*|kontrolli\w*|taotle\w*|esita\w*|hoia\w*|vaheta\w*|paranda\w*|koguge|vii\b|viia\b|registreeri\w*)\b/u.test(text);
    // An imperative sentence is only an answer when it is about the question's
    // own action. Otherwise a disposal sentence on a sorting page could answer
    // "how do I sort bio-waste" merely because it contains "viia".
    const terms = queryTerms(query);
    const actions = terms.filter((term) => term.length >= 5 && /(?:da|ma|mine|takse|tud|nud)$/u.test(term) && !term.endsWith("maa"));
    const advice = adviceText && (actions.length === 0 || actions.some((term) => textHasActionRoot(passage, term)));
    const meta = /\b(?:kasitleb|sisaldab|annab\s+ulevaate|on\s+puhendatud|tutvustab|leiad|naed)\b/u.test(text);
    const chrome = /\b(?:avakuva|infosusteem|menuu|otsing|avaandmed|juhatus)\b/u.test(text);
    return yearScore + (advice ? 14 : 0) - (meta ? 16 : 0) - (chrome ? 10 : 0);
  }
  return yearScore;
}


export function directEvidenceExtract(query, document, plannedEvidence = null, { requireSubject = false } = {}) {
  const subjects = queryTerms(query).filter((root) => specialistSubjectVariants(root));
  // The generic extract must answer the same subject the broad evidence gate
  // accepted. Without this, an advice-heavy sentence about a different object
  // on the same page ("vana külmik") could become the answer to "biojäätmed".
  const terms = queryTerms(query);
  const genericContext = new Set(["andmed", "keskkond", "seire"]);
  const actionTerms = terms.filter((term) => term.length >= 5 && /(?:da|ma|mine|takse|tud|nud)$/u.test(term)
    && !term.endsWith("maa")
    && !genericContext.has(term));
  const stateTerms = terms.filter((term) => /^(?:haig|vigast|surnud|hukkunud)/u.test(term));
  const itemTerms = terms.filter((term) => ["arvuti", "kulmkapp", "kulmik", "telefon", "patarei", "moobel", "diivan", "ravim", "rehv"].includes(term));
  const organizationTerms = terms.filter((term) => ["keskkonnaamet", "keskkonnaagentuur", "kliimaministeerium", "rmk"].includes(term));
  const primarySubject = [...terms]
    .filter((term) => !genericContext.has(term))
    .sort((left, right) => (Number(rootIsDomain(right)) - Number(rootIsDomain(left))) || right.length - left.length)[0] || null;
  const passageAnswersSubject = (passage) => (!primarySubject || textHasQueryRoot(passage, primarySubject))
    && actionTerms.every((term) => textHasActionRoot(passage, term))
    && stateTerms.every((term) => textHasQueryRoot(passage, term))
    && itemTerms.every((term) => textHasQueryRoot(passage, term))
    && organizationTerms.every((term) => textHasQueryRoot(passage, term));
  const stablePublicationText = (value) => {
    const published = /^\d{2}\.\d{2}\.\d{4}$/u.test(String(document?.published || "").trim())
      ? String(document.published).trim()
      : "";
    return String(value || "")
      .replace(/\btäna\s+avaldatud\b/giu, published ? `${published} avaldatud` : "avaldatud")
      .replace(/\bm\s*3\b/giu, "m³");
  };
  const plannedPassages = plannedEvidence?.directDocumentId === document?.id
    ? plannedEvidence?.passages || []
    : [];
  const plannedExtract = plannedPassages
    .map(sanitizeLlmEvidenceText)
    .map(stablePublicationText)
    .map((value) => plannedEvidence?.kind === "forest-area"
      ? value.replace(/,\s*millel\s+kasv\w*[\s\S]*$/iu, ".")
      : value)
    .map((value) => value.replace(/\s+/gu, " ").trim())
    .map((value) => plannedEvidence?.kind === "forest-area" && !hasCompleteSentenceEnding(value)
      ? `${value}.` : value)
    .filter((value) => value.length >= 20 && hasCompleteSentenceEnding(value))
    .reduce((extract, passage) => {
      const joined = [extract, passage].filter(Boolean).join(" ");
      return joined.length <= 520 ? joined : extract;
    }, "");
  const condensedPlannedExtract = condenseRedundantSentences(plannedExtract);
  if (condensedPlannedExtract && hasCompleteSentenceEnding(condensedPlannedExtract)
    && subjects.every((root) => textHasQueryRoot(condensedPlannedExtract, root))) return condensedPlannedExtract;
  const preferred = new Set(plannedPassages.map((value) => normalize(value)));
  const passages = [document?.summary, document?.content]
    .filter(Boolean)
    .flatMap(splitTextPassages)
    .map(sanitizeLlmEvidenceText)
    .map(stablePublicationText)
    .map((value) => value.replace(/\s+/gu, " ").trim())
    .filter((value) => subjects.every((root) => textHasQueryRoot(value, root)))
    .filter((value) => !requireSubject || passageAnswersSubject(value))
    // Semicolon windows can start mid-sentence. Do not attach a dependent
    // lowercase clause to a different lead sentence and change its subject.
    .filter((value) => !requireSubject || /^[„“"'([]*[\p{Lu}\d]/u.test(value))
    .filter((value) => value.length >= 35 && value.length <= 520 && hasCompleteSentenceEnding(value));
  // The source's own data year is stated for every sentence on it, so a
  // sentence is not preferred just because it happens to repeat that year.
  const dataYear = /^(?:19|20)\d{2}$/u.test(String(document?.dataYear || "")) ? String(document.dataYear) : "";
  const scoringQuery = dataYear ? query.replace(new RegExp(`\\b${dataYear}\\b`, "gu"), " ").trim() || query : query;
  const rankedPassages = passages
    .map((passage, index) => ({
      passage: passage.replace(/^[„“”"']+|[„“”"']+$/gu, "").trim(),
      score: passageQueryCoverage(scoringQuery, passage) * 20
        + passageDirectness(scoringQuery, passage)
        + (preferred.has(normalize(passage)) ? 80 : 0)
        - index * 0.001,
    }))
    .sort((left, right) => right.score - left.score);
  const lead = rankedPassages[0]?.passage || "";
  if (!requireSubject || !lead) return lead;
  // Each retained sentence already passed the same subject/action boundary.
  // Lead with the direct answer, then retain bounded factual context from
  // that source; navigation and page descriptions must not fill the space.
  const selected = distinctPassages(rankedPassages
    .map(({ passage }) => passage)
    // A sentence about what the page or map does not prove is navigation
    // meta, not the answer ("Piirkonna kaart ega üldjuhend ei tõenda …").
    .filter((passage) => !passageDisclaimsEvidence(passage))
    .filter((passage) => passageQueryCoverage(scoringQuery, passage) > 0
      && passageDirectness(scoringQuery, passage) >= 0));
  let extract = "";
  let retained = 0;
  for (const passage of selected) {
    const candidate = [extract, passage].filter(Boolean).join(" ");
    if (candidate.length > 900) continue;
    extract = candidate;
    if (++retained === 3) break;
  }
  return condenseRedundantSentences(extract);
}


export function sourceCitation(source) {
  const citation = Number(source?.citation);
  return Number.isInteger(citation) && citation > 0 ? citation : 0;
}

function uniqueCitations(sources = []) {
  return [...new Set(sources.map(sourceCitation).filter(Boolean))];
}

function safeSourcePassages(source = {}) {
  return [source.evidenceExcerpt, source.summary, source.answer, source.content]
    .filter(Boolean)
    .flatMap((value) => splitTextPassages(sanitizeLlmEvidenceText(value)))
    .map((value) => value.replace(/\s+/gu, " ").trim())
    .filter((value) => value.length >= 20)
    .map((value) => hasCompleteSentenceEnding(value) ? value : `${value}.`);
}

function forestAreaMeasurementPassage(source) {
  return safeSourcePassages(source).find((passage) => {
    const text = normalize(passage);
    const measuredText = passage.normalize("NFKC").toLocaleLowerCase("et");
    const hasYear = /\b(?:19|20)\d{2}\b/u.test(text);
    const hasArea = /\bmetsamaa\w*[\s\S]{0,80}\bpindala\w*/u.test(text)
      || /\bmetsamaa\s+oli\b/u.test(text);
    const hasMeasuredArea = /\b\d+(?:[.,]\d+)?\s*(?:(?:miljon\w*|tuhat)\s+)?(?:ha\b|hektar\w*)/u.test(measuredText);
    return hasYear && hasArea && hasMeasuredArea;
  }) || "";
}

function stableForestStockPassage(source) {
  const passages = safeSourcePassages(source);
  const stable = passages.find((passage) => {
    const text = normalize(passage);
    return /\b(?:kasvava\s+metsa\s+tagavara|metsa\s+(?:kogu)?tagavara|metsatagavara|metsavaru)\w*/u.test(text)
      && /\b(?:stabiil\w*|pusi\w*|muutumat\w*)/u.test(text)
      && !/\bei\s+(?:ole|pusi)\s+stabiil\w*/u.test(text);
  });
  if (!stable) return "";
  const measured = passages.find((passage) => {
    const text = normalize(passage);
    const measuredText = passage.normalize("NFKC").toLocaleLowerCase("et");
    const hasYear = /\b(?:19|20)\d{2}\b/u.test(text);
    const hasStock = /\b(?:kasvava\s+metsa\s+tagavara|metsa\s+(?:kogu)?tagavara|metsatagavara|metsavaru)\w*/u.test(text)
      || (/\bmetsamaa\s+pindala\b/u.test(text) && /\bkasvas\b[\s\S]{0,80}\bpuitu\b/u.test(text));
    const hasMeasuredVolume = /\b\d+(?:[.,]\d+)?\s*(?:miljon\w*\s+)?(?:tm\b|tihumeet\w*|m[³3]\b|kuupmeet\w*)/u.test(measuredText);
    return hasYear && hasStock && hasMeasuredVolume;
  });
  return measured ? (measured === stable ? measured : `${measured} ${stable}`) : "";
}


// This is a constrained degraded-mode answer, not a hidden knowledge-base
// answer. It is composed only when the visible official result set contains a
// strong direct comparison plus independent SMI-method and registry-role
// evidence. Luna can still replace it after its normal grounding checks.
export function composeForestDataSourcesFallback(query, plannedEvidence, sources = [], previousAnswer = {}) {
  if (plannedEvidence?.kind !== "forest-data-sources" || !plannedEvidence?.strong) return null;
  const visibleOfficial = sources.filter((source) => source?.sourceTier === "official" && sourceCitation(source));
  const roles = plannedEvidence.evidenceRoles;
  const comparison = visibleOfficial.find((source) => source.id === roles?.comparison);
  const smiMethod = visibleOfficial.find((source) => source.id === roles?.method);
  const registry = visibleOfficial.find((source) => source.id === roles?.registry);
  if (!comparison || !smiMethod || !registry) return null;

  const comparisonCitations = uniqueCitations([comparison]);
  const smiCitations = uniqueCitations([smiMethod]);
  // The comparison source contains the intact subject/object sentence for the
  // summarized registry role; the registry catalogue independently identifies
  // the live datasets. Cite both instead of assembling the claim from separate
  // passages under a single catalogue citation.
  const registryCitations = uniqueCitations([comparison, registry]);
  const introCitations = uniqueCitations([comparison, smiMethod, registry]);
  return {
    eyebrow: "Allikapõhine kokkuvõte",
    title: String(previousAnswer.title || query).trim().slice(0, 180),
    intro: "Metsandusandmeid kogutakse mitmel viisil. Statistiline metsainventuur (SMI) on valikuuring, mille raames mõõdetakse üleriigiliselt proovitükke. Saadud andmete ja statistiliste meetodite alusel koostatakse metsaressursi üldistatud hinnangud kogu Eesti kohta. Riigi ja teiste metsomanike poolt tellitud kinnistute metsainventeerimiseandmed on registreeritud metsaressursi arvestuse riiklikus registris (Metsaregister). Metsaregistrisse koondatakse lisaks andmed metsateatiste, metsakaitseekspertiiside ja metsauuendusekspertiiside kohta.",
    introCitations,
    parts: [
      {
        title: "Metsaandmed",
        text: "Eestis kogutakse metsandusandmeid mitmel viisil, tagamaks andmete täpsus, ajas võrreldavus, kvaliteet ja usaldusväärsus.",
        citations: comparisonCitations,
      },
      {
        title: "SMI roll",
        text: "Statistiline metsainventuur (SMI) on valikuuring, mille raames mõõdetakse üleriigiliselt proovitükke. Saadud andmete ja statistiliste meetodite alusel koostatakse metsaressursi üldistatud hinnangud kogu Eesti kohta.",
        citations: smiCitations,
      },
      {
        title: "Metsaregistri roll",
        text: "Riigi ja teiste metsomanike poolt tellitud kinnistute metsainventeerimiseandmed on registreeritud metsaressursi arvestuse riiklikus registris (Metsaregister). Register sisaldab metsainventeerimise, metsateatiste, metsauuenduse, metsakaitseekspertiiside ja välitööde andmeid.",
        citations: registryCitations,
      },
    ],
    note: String(previousAnswer.note || "").trim().slice(0, 700),
  };
}

// A broad "will forest run out" question needs a short synthesis, not a
// literal hit for the word "otsa". This degraded answer is unlocked only by
// visible official evidence with three roles: present stock direction,
// current forest-area measurement and the multi-indicator condition context.
export function composeForestDepletionFallback(query, plannedEvidence, sources = [], previousAnswer = {}) {
  if (plannedEvidence?.kind !== "forest-depletion" || !plannedEvidence?.strong) return null;
  const visibleOfficial = sources.filter((source) => source?.sourceTier === "official" && sourceCitation(source));
  const byId = new Map(visibleOfficial.map((source) => [source.id, source]));
  const status = byId.get(plannedEvidence.evidenceRoles?.status);
  const area = byId.get(plannedEvidence.evidenceRoles?.area);
  const context = byId.get(plannedEvidence.evidenceRoles?.context);
  if (!status || !area || !context || new Set([status.id, area.id, context.id]).size < 2) return null;

  const areaPassage = forestAreaMeasurementPassage(area);
  const stockPassage = stableForestStockPassage(status);
  const contextPassage = (plannedEvidence.passagesByDocument?.[context.id] || []).join(" ");
  if (!areaPassage || !stockPassage || !contextPassage) return null;
  const measurementPassages = distinctPassages([areaPassage, stockPassage].flatMap(splitTextPassages));
  const measurementText = measurementPassages.join(" ");
  const contextCitations = uniqueCitations([context]);
  return {
    eyebrow: "Allikapõhine kokkuvõte",
    title: String(previousAnswer.title || query).trim().slice(0, 180),
    intro: `Praegused ametlikud näitajad ei viita sellele, et Eesti mets oleks otsa saamas. ${measurementText} Need mõõtmised kirjeldavad konkreetset andmeaastat, mitte kindlat tulevikuprognoosi. Ökoloogiline seisund näitab looduslikkust, mis ei pruugi tähendada puistu kõrget majanduslikku väärtust.`,
    introCitations: uniqueCitations([status, area, context]),
    parts: [
      {
        title: "Praegune seis",
        text: "Metsamaa pindala ja puidu tagavara on eri mõõdikud. Need kirjeldavad mõõdetud hetkeseisu ega anna üksinda kindlat prognoosi metsa tuleviku või ökoloogilise seisundi kohta.",
        citations: uniqueCitations([area, status, context]),
      },
      {
        title: "Seisundi tervikpilt",
        text: contextPassage,
        citations: contextCitations,
      },
    ],
    note: String(previousAnswer.note || "").trim().slice(0, 700),
  };
}

function distinctPassages(passages = []) {
  const distinct = [];
  const seen = new Set();
  for (const passage of passages) {
    const key = normalize(passage);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    distinct.push(passage);
  }
  return distinct;
}

export function composeSourceClaimPairs(query, plannedEvidence, sources = []) {
  if (plannedEvidence?.kind !== "forest-fact-check" || !plannedEvidence.strong) return null;
  const source = sources.find((candidate) => candidate.id === plannedEvidence.directDocumentId);
  const citation = sourceCitation(source);
  const witness = plannedEvidence.roleWitnesses?.claims;
  if (!source || source.sourceTier !== "official" || !citation || witness?.documentId !== source.id) return null;
  const admitted = new Set(witness.passages || []);
  const pairs = (plannedEvidence.claimPairs || []).flatMap((pair) => {
    if (!admitted.has(pair.claim) || !pair.corrections?.length
      || pair.corrections.some((passage) => !admitted.has(passage))) return [];
    const claim = sanitizeLlmEvidenceText(pair.claim).replace(/^\d+\.\s*/u, "").trim();
    const corrections = pair.corrections.map((passage) => sanitizeLlmEvidenceText(passage).trim());
    if (corrections.some((passage) => !passage || !hasCompleteSentenceEnding(passage))) return [];
    const text = corrections.join(" ");
    // Dropping a trailing correction can turn its preceding context into an
    // uncorrected allegation. Admit the complete bounded pair or omit it.
    if (`„${claim}” ${text}`.length > 900) return [];
    return [{ title: `Väide: „${claim}”`, claim, text, citations: [citation] }];
  }).slice(0, 4);
  if (!pairs.length) return null;
  const published = String(source.published || "").trim();
  return {
    eyebrow: "Allika väited ja selgitused",
    title: query,
    // Keep the first allegation visibly labeled and separate from its response:
    // merging opposed propositions into one paragraph loses their attribution.
    intro: pairs[0].title,
    introCitations: pairs[0].citations,
    parts: pairs.map(({ title, text, citations }, index) => ({
      title: index === 0 ? "Allika selgitus" : title,
      text,
      citations,
    })),
    note: [
      published ? `Allikas avaldati ${published}.` : "",
      "Need on allika avaldamisaegsed selgitused, mitte väidete praeguse levimuse või tänase metsaseisu hinnang.",
    ].filter(Boolean).join(" "),
  };
}

// Generic forestry intents use only passages that were selected from the
// same visible official result set. This keeps a useful deterministic answer
// when Luna is unavailable without importing the legacy prewritten forestry
// corpus or turning manually assigned tags into factual evidence.


// Keep the query matcher and answer matcher on the same comparator vocabulary.
// "Levinu" alone also matches "levinud", which is not comparative.
const COMPARISON_WORD_PATTERN = String.raw`(?:(?:koige|enim|vahim|suurim|vaikseim|parim|halvim|rohkem|vahem|suurem|vaiksem|korgem|madalam|parem|halvem|levinu(?:im|m))\w*|enam(?:gi)?)`;
const COMPARISON_ROOT_PATTERN = new RegExp(`^(?:${COMPARISON_WORD_PATTERN})$`, "u");
const STATED_COMPARISON_PATTERN = new RegExp(
  `\\b${COMPARISON_WORD_PATTERN}\\b|\\p{L}{3,}(?:mad|maid|imad|eimad)\\b`,
  "u",
);

function comparisonCoverage(query, text, evidenceKind = "") {
  const normalizedText = normalize(text);
  if (evidenceKind === "structured-source-fact-check") {
    return { comparisonPresent: false, valid: true };
  }
  const normalizedQuery = normalize(query);
  // A conceptual claim about one growth figure is not a request to compare
  // observations. Require the actual limitation, and never apply this contract
  // to a dated or explicitly comparative harvest question.
  if (evidenceKind === "forest-harvest-balance"
    && !/\b(?:19|20)\d{2}\b|\brai\w*\b|\bkui\b/u.test(normalizedQuery)
    && /\bjuurdekasv\w*\b/u.test(normalizedQuery)
    && /\b(?:toesta\w*|automaats\w*)\b/u.test(normalizedQuery)
    && /\b(?:kestlik\w*|jatkusuutlik\w*)\b/u.test(normalizedQuery)
    && /\b(?:ei saa|ei ole voimalik)\b[^.]{0,120}\bjareld\w*\b[^.]{0,100}\b(?:kestlik\w*|jatkusuutlik\w*)\b/u.test(normalizedText)) {
    return { comparisonPresent: false, valid: true };
  }
  if (evidenceKind === "structured-forest-balance" || evidenceKind === "structured-forest-balance-net") {
    const askedYears = normalizedQuery.match(/\b(?:19|20)\d{2}\b/gu) || [];
    const hasHarvest = /\brai\w*\b/u.test(normalizedText);
    const statesNet = /\bnetojuurdekasv\w*\b/u.test(normalizedText);
    const statesGross = /\bkogu\s*juurdekasv\w*\b/u.test(normalizedText);
    const explainsComparisonScope = /\b(?:suhe|vordl\w*|vorrel\w*|korvut\w*|ei ole uks uhele sama)\b/u.test(normalizedText)
      || /\bei ole\b[^.]{0,160}\bkorraga avaldatud\b/u.test(normalizedText);
    const yearsCovered = askedYears.every((year) => normalizedText.includes(year));
    return {
      comparisonPresent: true,
      valid: hasHarvest && statesNet && (evidenceKind === "structured-forest-balance-net" || statesGross)
        && explainsComparisonScope && yearsCovered,
    };
  }
  if (evidenceKind === "harvest-over-time") {
    const askedYears = normalize(query).match(/\b(?:19|20)\d{2}\b/gu) || [];
    const answerYears = [...new Set(normalizedText.match(/\b(?:19|20)\d{2}\b/gu) || [])];
    const yearsCovered = askedYears.length
      ? askedYears.every((year) => answerYears.includes(year))
      : answerYears.length >= 2;
    const statesHarvestComparison = /\brai\w*\b/u.test(normalizedText)
      && STATED_COMPARISON_PATTERN.test(normalizedText);
    return { comparisonPresent: true, valid: yearsCovered && statesHarvestComparison };
  }
  if (evidenceKind === "sample-size-and-precision") {
    const namesSample = /\b(?:valim\w*|proovitukk\w*|vaatlus\w*)\b/u.test(normalizedText);
    const statesUncertainty = /\b(?:statistil\w*\s+vig\w*|veahinnang\w*|usaldus(?:piir|vahemik)\w*|maaramat\w*)\b/u.test(normalizedText);
    return { comparisonPresent: true, valid: namesSample && statesUncertainty };
  }

  const sentences = splitTextPassages(text);
  const comparisons = sentences.filter((sentence) => STATED_COMPARISON_PATTERN.test(normalize(sentence)));
  const terms = [...new Set([
    ...analyzeQueryIntent(query).terms,
    ...queryTerms(query).filter((term) => textHasQueryRoot(query, term)),
  ])];
  const asksComparison = STATED_COMPARISON_PATTERN.test(normalize(query))
    || terms.some((term) => COMPARISON_ROOT_PATTERN.test(normalize(term)));
  if (!asksComparison) return { comparisonPresent: comparisons.length > 0, valid: true };
  if (!comparisons.length) return { comparisonPresent: false, valid: false };
  const valid = comparisons.some((sentence) => terms.every((term) => (
    textHasQueryRoot(sentence, term)
    || COMPARISON_ROOT_PATTERN.test(normalize(term))
    || extractAnswersQuery(term, sentence)
    || (/\bhektar/u.test(normalize(term)) && answersAskedHectares(query, sentence))
  )));
  return { comparisonPresent: true, valid };
}

export function comparisonAnswersQuery(query, text, evidenceKind = "") {
  return comparisonCoverage(query, text, evidenceKind).valid;
}

export function cardAnswersQueryWords(query, text, evidenceKind = "") {
  const comparison = comparisonCoverage(query, text, evidenceKind);
  if (!comparison.valid) return false;
  if (comparison.comparisonPresent) return true;
  return extractAnswersQuery(query, text);
}



// The first sentence of a fallback card that does not answer the question.
// Kept as text, not a flag: a later step may replace the card with a good one,
// and only the off-target text itself is withheld.
function offTargetLead(draft) {
  const lead = normalize(splitTextPassages(draft?.evidence?.offTargetIntro || "")[0] || "");
  return lead.length >= 40 ? lead : "";
}

export function repeatsOffTargetLead(draft, text) {
  const lead = offTargetLead(draft);
  return Boolean(lead) && normalize(text || "").includes(lead);
}

// The model is told to keep the card's lead. A lead already known not to answer
// would only be repeated and then withdrawn, so the model starts without it and
// must write its own cited lead, which is reviewed like any other.
export function modelStartingDraft(draft) {
  const copy = structuredClone(draft);
  if (!repeatsOffTargetLead(draft, draft?.answer?.intro)) return copy;
  copy.answer = { ...copy.answer, intro: "", introCitations: [] };
  return copy;
}

export function withoutOffTargetFallback(draft) {
  if (!repeatsOffTargetLead(draft, draft?.answer?.intro)) return draft;
  // The blanked card shows no excerpt and no parts, so a note that scoped or
  // qualified the withdrawn excerpt would describe text the reader cannot see.
  return {
    ...draft,
    answer: {
      ...draft.answer,
      eyebrow: NO_ANSWER_EYEBROW,
      intro: NO_ANSWER_INTRO,
      introCitations: [],
      parts: [],
      note: "",
    },
  };
}

export function composeOfficialForestryEvidenceFallback(query, plannedEvidence, sources = [], previousAnswer = {}) {
  if (!plannedEvidence?.strong
    || !plannedEvidence?.passagesByDocument
    || ["forest-area", "forest-depletion", "forest-data-sources", "forest-fact-check"].includes(plannedEvidence.kind)) return null;
  const byId = new Map((sources || []).map((source) => [source.id, source]));
  const bundles = (plannedEvidence.supportingDocumentIds || []).flatMap((documentId) => {
    const source = byId.get(documentId);
    const citation = sourceCitation(source);
    if (!source || source.sourceTier !== "official" || !citation) return [];
    const selectedPassages = (plannedEvidence.passagesByDocument[documentId] || [])
      .map(sanitizeLlmEvidenceText)
      .map((value) => value.replace(/\s+/gu, " ").trim())
      .filter((value) => value.length >= 25)
      .map((value) => {
        const complete = hasCompleteSentenceEnding(value) ? value : `${value}.`;
        return `${complete.charAt(0).toLocaleUpperCase("et")}${complete.slice(1)}`;
      });
    // Once the evidence planner has satisfied the intent contract, render
    // exactly those passages. Adding merely similar text from the same page
    // can silently change the subject (for example harvest volume to clearcut
    // area) even though the citation number remains unchanged.
    const unique = distinctPassages(selectedPassages);
    const directAnswerIntents = new Set([
      "forest-stock-overview",
      "forest-increment-overview",
      "protected-forest-overview",
    ]);
    const ordered = directAnswerIntents.has(plannedEvidence.kind)
      ? [...unique].sort((left, right) => passageQueryCoverage(query, right) - passageQueryCoverage(query, left))
      : unique;
    const text = condenseRedundantSentences(ordered.reduce((result, passage) => {
      const joined = [result, passage].filter(Boolean).join(" ");
      return joined.length <= 680 ? joined : result;
    }, ""));
    return text ? [{ source, citation, text }] : [];
  });
  if (!bundles.length) return null;
  const [lead, ...supporting] = bundles;
  if (plannedEvidence.kind === "why-forest-numbers-differ") {
    const sentences = splitTextPassages(lead.text).filter((sentence) => sentence.length >= 25);
    if (sentences.length >= 3) {
      const parts = [];
      if (supporting[0]) {
        parts.push({
          title: "Mõõtmismeetod ja katvus",
          text: supporting[0].text,
          citations: [supporting[0].citation],
        });
      }
      parts.push({
        title: "Aeg, definitsioon ja arvutusviis",
        text: sentences.slice(2).join(" "),
        citations: [lead.citation],
      });
      return {
        eyebrow: "Allikapõhine kokkuvõte",
        title: String(previousAnswer.title || query).trim().slice(0, 180),
        intro: sentences.slice(0, 2).join(" "),
        introCitations: [lead.citation],
        parts: parts.slice(0, 3),
        note: String(previousAnswer.note || "").trim().slice(0, 700),
      };
    }
  }
  return {
    eyebrow: "Allikapõhine kokkuvõte",
    title: String(previousAnswer.title || query).trim().slice(0, 180),
    intro: lead.text,
    introCitations: [lead.citation],
    parts: supporting.slice(0, 3).map((bundle) => ({
      title: String(bundle.source.title || "Täiendav ametlik selgitus").trim().slice(0, 140),
      text: bundle.text,
      citations: [bundle.citation],
    })),
    note: noticeAnswerNote(plannedEvidence.kind)
      || (plannedEvidence.kind === "clearcut-value-judgement"
        ? "Need väljavõtted kirjeldavad metsamajandamise mõju ja selle tingimusi; need ei tõenda üldist väärtushinnangut iga lageraie kohta."
        : String(previousAnswer.note || "").trim().slice(0, 700)),
  };
}

// The notice guidance lists the two ordinary cases in everyday practice. It
// is not the whole of the law, and this excerpt is not freshly verified law
// text, so the card must not imply that its list is exhaustive or that it
// states extra statutory exceptions such as the national defence case.
const NOTICE_ANSWER_KINDS = new Set(["forest-notice", "forest-notice-exception", "forest-notice-exception-fee"]);

function noticeAnswerNote(kind) {
  if (!NOTICE_ANSWER_KINDS.has(kind)) return "";
  return "See on Keskkonnaameti üldjuhise väljavõte, mitte seaduse terviktekst: seadusest võivad tuleneda ka muud erandid ja lisanõuded, mida see väljavõte ei loetle.";
}

// A model answer replaces the deterministic answer object, so the same scope
// caveat has to be re-applied on the accepted card. The answer's own plan kind
// is not carried on every composer, so the query's notice intent decides when
// it is missing. It is a statement about the extract's coverage, not a claim
// about the law, and it never replaces a note the answer already carries.
export function withNoticeScopeCaveat(note, query, kind) {
  const effectiveKind = NOTICE_ANSWER_KINDS.has(kind)
    ? kind
    : /metsateat|raieteat/iu.test(String(query || "")) ? forestEvidenceIntent(query)?.kind : "";
  const caveat = noticeAnswerNote(effectiveKind);
  if (!caveat) return note;
  const current = String(note || "").trim();
  if (current.includes("üldjuhise väljavõte")) return current;
  return [current, caveat].filter(Boolean).join(" ").slice(0, 700);
}

// Bare generic forest overview (nt "mets"): mitme ametliku allika süntees
// loobumise asemel. Koostatud ainult nähtavast ametlikust tulemusehulgast
// täpsete väljavõtetega, et väited säilitaksid nähtava tunnistaja.
export function composeGenericForestOverviewFallback(query, plannedEvidence, sources = [], previousAnswer = {}) {
  if (plannedEvidence?.kind !== "forest-overview" || !plannedEvidence.strong) return null;
  const roles = plannedEvidence.roleWitnesses;
  const byId = new Map(sources.map((source) => [source.id, source]));
  const roleClaim = (role) => {
    const witness = roles?.[role];
    const source = byId.get(witness?.documentId);
    if (!source || !sourceCitation(source)) return null;
    const text = witness.passages.map(sanitizeLlmEvidenceText)
      .map((passage) => passage.replace(/\s+/gu, " ").trim())
      .filter(Boolean)
      .map((passage) => hasCompleteSentenceEnding(passage) ? passage : `${passage}.`)
      .join(" ");
    return text ? { text, citations: [sourceCitation(source)] } : null;
  };
  const measurement = roleClaim(plannedEvidence.numericSourceRole);
  const method = roleClaim("method");
  const condition = roleClaim("condition");
  const registry = roleClaim("registry");
  if (!measurement || !method || !condition || !registry) return null;
  return {
    eyebrow: "Allikapõhine kokkuvõte",
    title: "Eesti metsa ei kirjelda üksainus number",
    intro: measurement.text,
    introCitations: measurement.citations,
    parts: [
      { title: "Kuidas mõõdetakse", ...method },
      { title: "Seisundi tervikpilt", ...condition },
      { title: "Andmete erinevus", ...registry },
    ],
    note: String(previousAnswer.note || "").trim().slice(0, 700),
  };
}

export function answerEvidenceDocuments(documents = [], plannedEvidence, forestBalance) {
  if (forestBalance || !plannedEvidence?.strong) return documents;
  const ids = [...new Set([
    plannedEvidence.directDocumentId,
    ...(plannedEvidence.supportingDocumentIds || []),
  ].filter(Boolean))];
  const byId = new Map((documents || []).map((document) => [document.id, document]));
  const selected = ids.map((id) => byId.get(id)).filter(Boolean);
  const chosen = selected.length ? selected : documents;
  return chosen;
}


function answerCitationNumbers(answer = {}) {
  return new Set([
    ...(answer.introCitations || []),
    ...(answer.parts || []).flatMap((part) => part.citations || []),
  ].map(Number).filter(Number.isFinite));
}


function answerClaims(answer = {}) {
  return [
    {
      text: String(answer.intro || "").trim(),
      relationshipText: String(answer.intro || "").trim(),
      citations: (answer.introCitations || []).map(Number).filter(Number.isFinite),
    },
    ...(answer.parts || []).map((part) => {
      const partText = String(part.text || "").trim();
      return {
        text: [part.title, partText].filter(Boolean).join(" ").trim(),
        // A display heading helps lexical excerpt selection but is not part of
        // the factual proposition whose entity relationship must be bound.
        relationshipText: partText,
        citations: (part.citations || []).map(Number).filter(Number.isFinite),
      };
    }),
  ].filter((claim) => claim.text);
}

function canonicalClaimNumbers(value) {
  return [...String(value || "").normalize("NFKC").matchAll(/(?<![\p{L}\p{N}])(\d+(?:[.,]\d+)?)(?:\s*%)?(?![\p{L}\p{N}])/gu)]
    .map((match) => match[1].replace(",", ".").replace(/^0+(?=\d)/u, ""));
}

function claimWitnessCoverage(claim, witness) {
  const roots = [...new Set(claimTokens(claim))];
  const witnessTokens = claimTokens(witness);
  const matchedRoots = roots.filter((root) => witnessTokens.some((token) => tokensShareStem(root, token)));
  const expectedNumbers = canonicalClaimNumbers(claim);
  const witnessedNumbers = new Set(canonicalClaimNumbers(witness));
  const matchedNumbers = expectedNumbers.filter((number) => witnessedNumbers.has(number));
  return {
    roots,
    matchedRoots,
    expectedNumbers,
    matchedNumbers,
  };
}

export function claimHasVisibleWitness(claim, witness, relationshipClaim = claim, query = "", minimumRootCoverage = 0.4) {

  const passages = (Array.isArray(witness) ? witness : [witness])
    .flatMap(splitTextPassages)
    .filter(Boolean);
  const joinedWitness = passages.join(" ");
  const coverage = claimWitnessCoverage(claim, joinedWitness);
  if (coverage.matchedNumbers.length !== coverage.expectedNumbers.length) return false;
  if (safeSemanticInference(relationshipClaim, joinedWitness, query)) return true;
  const relationshipWitness = relationshipClaimHasPassageWitness(relationshipClaim, passages);
  if (relationshipWitness === false) return false;
  if (!coverage.roots.length) return true;
  const requiredRoots = coverage.roots.length <= 2
    ? coverage.roots.length
    : Math.max(2, Math.ceil(coverage.roots.length * minimumRootCoverage));
  return coverage.matchedRoots.length >= requiredRoots;
}

function rebindSupportedCitations(citations, supports, propositionUnits = []) {
  let retained = [...new Set((citations || []).map(Number).filter((citation) => (
    Number.isInteger(citation) && citation > 0
  )))].slice(0, 10);
  if (!retained.length || !supports(retained)) return [];
  for (const citation of [...retained]) {
    if (supports([citation])) continue;
    const without = retained.filter((candidate) => candidate !== citation);
    // Dropping a citation is optional. Require near-complete factual concept
    // coverage without it; generic shared topic words cannot replace its
    // definition (for example subtraction of natural mortality).
    if (!without.length || !supports(without, undefined, 0.8)) continue;
    const uniquelySupportsProposition = propositionUnits.some((unit) => (
      supports([citation], unit) && !supports(without, unit)
    ));
    if (!uniquelySupportsProposition) retained = without;
  }
  return retained.length && supports(retained) ? retained : [];
}

function visibleClaimCitations(claim, sourcesByCitation, query) {
  const supportCache = new Map();
  const supports = (citations, proposition = claim, minimumRootCoverage = 0.4) => {
    const cacheKey = `${citations.join(",")}:${proposition.text}:${proposition.relationshipText}:${minimumRootCoverage}`;
    if (supportCache.has(cacheKey)) return supportCache.get(cacheKey);
    const witnesses = citations
      .map((citation) => sourcesByCitation.get(citation)?.evidenceExcerpt || "")
      .filter(Boolean);
    const supported = witnesses.length > 0
      && claimHasVisibleWitness(proposition.text, witnesses, proposition.relationshipText, query, minimumRootCoverage)
      && (proposition !== claim || propositionUnits.every((unit) => (
        claimHasVisibleWitness(unit.text, witnesses, unit.relationshipText, query, minimumRootCoverage)
      )));
    supportCache.set(cacheKey, supported);
    return supported;
  };
  const propositionUnits = splitTextPassages(claim.propositionText || claim.relationshipText || claim.text)
    .filter((text) => text.trim() && !/^(?:jah|ei|yes|no)[.!?]$/iu.test(text.trim()))
    .map((text) => ({ text, relationshipText: text }));
  return rebindSupportedCitations(claim.citations, supports, propositionUnits);
}

export function rebindAnswerCitationsToVisibleWitnesses(draft = {}) {
  const sourcesByCitation = new Map((draft.sources || []).map((source) => [Number(source.citation), source]));
  const introText = String(draft.answer?.intro || "").trim();
  const introCitations = visibleClaimCitations({
    text: introText,
    relationshipText: introText,
    propositionText: introText,
    citations: (draft.answer?.introCitations || []).map(Number).filter(Number.isFinite),
  }, sourcesByCitation, draft.query);
  const parts = (draft.answer?.parts || []).map((part) => {
    const partText = String(part.text || "").trim();
    const citations = visibleClaimCitations({
      text: [part.title, partText].filter(Boolean).join(" ").trim(),
      relationshipText: partText,
      propositionText: partText,
      citations: (part.citations || []).map(Number).filter(Number.isFinite),
    }, sourcesByCitation, draft.query);
    return { ...part, citations };
  });
  return {
    ...draft,
    answer: {
      ...draft.answer,
      introCitations,
      parts,
    },
  };
}


export function answerClaimsHaveVisibleWitnesses(draft = {}) {
  const sourcesByCitation = new Map((draft.sources || []).map((source) => [Number(source.citation), source]));
  return answerClaims(draft.answer).every((claim) => {
    const witnesses = claim.citations
      .map((citation) => sourcesByCitation.get(citation)?.evidenceExcerpt || "")
      .filter(Boolean);
    return witnesses.length > 0
      && claimHasVisibleWitness(claim.text, witnesses, claim.relationshipText, draft.query);
  });
}

function claimHasVisibleWitnessInDraft(draft, claim) {
  if (!claim?.text || !claim.citations?.length) return false;
  const wanted = new Set(claim.citations.map(Number));
  const witnesses = (draft.sources || [])
    .filter((source) => wanted.has(Number(source.citation)))
    .map((source) => source.evidenceExcerpt || "")
    .filter(Boolean);
  return witnesses.length > 0
    && claimHasVisibleWitness(claim.text, witnesses, claim.relationshipText || claim.text, draft.query);
}

export function finalizeVisibleAnswerWitnesses(draft, query, evidencePack) {
  const attached = rebindAnswerCitationsToVisibleWitnesses(
    attachEvidenceExcerpts(draft, query, evidencePack),
  );
  if (answerClaimsHaveVisibleWitnesses(attached)) return attached;

  const introClaim = {
    text: String(attached.answer?.intro || "").trim(),
    relationshipText: String(attached.answer?.intro || "").trim(),
    citations: (attached.answer?.introCitations || []).map(Number).filter(Number.isFinite),
  };
  if (!claimHasVisibleWitnessInDraft(attached, introClaim)) {
    return {
      ...attached,
      clarification: null,
      answer: {
        ...attached.answer,
        eyebrow: NO_ANSWER_EYEBROW,
        intro: NO_ANSWER_INTRO,
        introCitations: [],
        parts: [],
        note: "",
      },
      evidence: {
        ...attached.evidence,
        // An uncited placeholder ("Leidsin seotud allikad, kuid …") claims
        // nothing, so it shows as a no-answer while the model may still answer
        // from the same sources. Only a cited claim without a witness is unanswerable.
        // A planned intent (a figure that needs its method source, …) keeps its
        // own stricter rule: its missing evidence never goes to the model.
        answerable: introClaim.citations.length === 0 && !attached.evidence?.quality?.answerIntent,
      },
    };
  }

  const parts = (attached.answer?.parts || []).filter((part) => claimHasVisibleWitnessInDraft(attached, {
    text: [part.title, part.text].filter(Boolean).join(" ").trim(),
    relationshipText: String(part.text || "").trim(),
    citations: (part.citations || []).map(Number).filter(Number.isFinite),
  }));
  const reduced = {
    ...attached,
    answer: {
      ...attached.answer,
      parts,
    },
  };
  return attachEvidenceExcerpts(reduced, query, evidencePack);
}

export function attachEvidenceExcerpts(draft, _query, evidencePack) {
  const usedCitations = answerCitationNumbers(draft?.answer);
  return {
    ...draft,
    sources: (draft.sources || []).map((source) => {
      if (!usedCitations.has(Number(source.citation))) return source;
      const packed = evidencePack?.entries.find((entry) => entry.citation === Number(source.citation));
      const { evidenceExcerpt: _previousExcerpt, ...snapshot } = source;
      // The immutable pack has already reserved complete required witnesses
      // within its per-source and whole-pack bounds. Public proof must expose
      // those same bytes, not select or clip a second evidence window.
      return packed?.content ? { ...snapshot, evidenceExcerpt: packed.content } : snapshot;
    }),
  };
}
