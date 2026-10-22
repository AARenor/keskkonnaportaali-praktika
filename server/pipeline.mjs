import { createHash } from "node:crypto";
import { specialistSubjectVariants } from "./topic-keywords.mjs";
import { boundedChart, validPublicChart } from "./answer-chart.mjs";
import { withForestContextChart } from "./forest-series.mjs";
import { composeHarvestShareResponse } from "./harvest-share.mjs";
import { withLandUseShareChart } from "./land-use-share.mjs";
import { officialCitationUrlEligibility, publicSourceAllowed } from "./citation-policy.mjs";
import { readSearchCache, recordSearch } from "./database.mjs";
import { answerCadastreQuestion } from "./cadastre.mjs";
import { composeClimateDailyMeanResponse } from "./climate.mjs";
import {
  hydrateOfficialDocuments,
} from "./integrations.mjs";
import { assertAnswerAddressesQuery, claimTokens, generateGroundedAnswer, safeSemanticInference, tokensShareStem } from "./llm.mjs";
import { buildEvidencePack } from "./evidence-pack.mjs";
import { deliveredOutcome } from "./delivered-outcome.mjs";
import { publicSourceWitnessKey, sameSourceResource, sourceEvidenceBinding, sourceIsLinkedToVisibleService, sourceResourceKey, sourceWitnessKey } from "./source-identity.mjs";
import { composeEelisEmajogiPublicWatercourseResponse, composeEelisNaturaSiteResponse } from "./eelis.mjs";
import {
  composeStatisticsHazardousWasteResponse,
  composeStatisticsTotalWasteRecoveryResponse,
  composeStatisticsWastewaterBht7Response,
  composeStatisticsWaterAbstractionResponse,
} from "./statistics.mjs";
import {
  composeCurrentWeatherObservationResponse,
  composeForestHarvestBalanceAnswer,
  composeForestSeriesResponse,
  composeLatestPublishedHydrologyResponse,
  composeMunicipalWasteRecyclingResponse,
  composeNationalWeatherForecastResponse,
} from "./indicators.mjs";
import {
  evidenceDocumentsFromListing,
  currentListingEvidencePlan,
  isContextAnchoredFollowUp,
  isSafeEllipticalFollowUp,
  prepareRankedSearchResults,
  rankPublicSearchCandidates,
  resultMatchesFilters,
  selectAnswerEvidence,
  selectSmiDefinitionEvidence,
  stablePublicResultId,
} from "./retrieval.mjs";
import {
  assessEvidence,
  assessSearchQuery,
  canonicalizePublicSearchQuery,
  composeOfficialServiceNavigationResponse,
  composeAmbiguousDomainGuidanceResponse,
  composeScopeResponse,
  composeSearchResponse,
  composeTopicDataOverviewResponse,
  composeWasteFacilitiesNavigationResponse,
  directPortalOverviewSource,
  directPortalReportSource,
  forestryIntentServiceDocumentIds,
  rankedSetCoversSubject,
  forestEvidenceIntent,
  hasCompleteSentenceEnding,
  normalize,
  queryTerms,
  rootIsDomain,
  sanitizeLlmEvidenceText,
  splitTextPassages,
  textHasActionRoot,
  textHasQueryRoot,
} from "./search.mjs";
import { sourceCanSupportPublicCitation } from "./source-registry.mjs";
import { relationshipClaimHasPassageWitness } from "./proposition-grounding.mjs";

// Increment whenever the public response/citation contract changes so rows
// written under an older policy cannot be served without regeneration.
// Increment whenever the public response/citation contract changes so rows
// written under an older policy cannot be served without regeneration.
export const SEARCH_RESPONSE_REVISION = "answer-v70-source-pack-portal-expansion";
const DEFAULT_SEARCH_DEADLINE_MS = 15_000;
const QUERY_BOUND_ADAPTER_RETRIEVALS = new Set([
  "official-structured-climate-daily",
  "official-structured-eelis-natura",
  "official-structured-eelis-wfs",
  "official-structured-forecast-xml",
  "official-structured-hydrology-postgrest",
  "official-structured-statistics-pxweb",
  "official-structured-weather-xml",
  "official-tableau-csv",
]);

function conventionalEvidenceDocumentsFromListing(listing) {
  // Typed adapter rows are valid only for the exact query that their composer
  // revalidates. If that composer declines the row, do not recycle it as
  // ordinary lexical evidence for a neighboring legal, temporal or geographic
  // question. Forestry's multi-source structured comparison has its own
  // retrieval class and remains available to its dedicated planner below.
  const conventionalListing = {
    ...(listing || {}),
    items: (listing?.evidenceCandidates || listing?.items || [])
      .filter((document) => !QUERY_BOUND_ADAPTER_RETRIEVALS.has(document.retrieval)),
  };
  return evidenceDocumentsFromListing(conventionalListing);
}

function rankPortalDocuments(query, documents, options = {}) {
  return rankPublicSearchCandidates(query, documents, { ...options, intentDocuments: documents }).map((document) => ({
    ...document,
    score: document._ranking?.score || 0,
  }));
}


export function reassociateHydratedDocuments(candidates = [], hydratedDocuments = []) {
  const hydratedByUrl = new Map(hydratedDocuments
    .map((document) => [sourceWitnessKey(document), document])
    .filter(([key]) => key));
  return candidates.map((document) => {
    const key = sourceWitnessKey(document);
    return (key && hydratedByUrl.get(key)) || document;
  });
}

function passageQueryCoverage(query, passage) {
  const roots = queryTerms(query);
  if (!roots.length) return 0;
  return roots.filter((root) => textHasQueryRoot(passage, root)).length / roots.length;
}

function passageDirectness(query, passage) {
  const roots = queryTerms(query);
  const text = normalize(passage);
  const years = normalize(query).match(/\b(?:19|20)\d{2}\b/gu) || [];
  const yearScore = years.length ? (years.every((year) => text.includes(year)) ? 20 : -20) : 0;
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

const CONDENSER_STOP_WORDS = new Set([
  "ehk", "ning", "oli", "olid", "on", "see", "seda", "kui", "mis", "et",
  "eesti", "aasta", "aastal", "aastatel", "andmed", "andmetel", "järgi", "põhjal",
]);

function condenserWords(value = "") {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("et")
    .replace(/[^0-9a-zõäöüšž]+/giu, " ")
    .split(/\s+/u)
    .filter((word) => word.length >= 4 && !CONDENSER_STOP_WORDS.has(word));
}

function condenserNumbers(value = "") {
  return [...String(value || "").normalize("NFKC").matchAll(/\d+(?:[.,]\d+)?/gu)]
    .map((match) => match[0].replace(",", "."));
}

function condenserOverlap(left, right) {
  const a = new Set(condenserWords(left));
  const b = new Set(condenserWords(right));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

// Remove a sentence that repeats another one's facts with slightly different
// framing. This is intentionally conservative: the later sentence must carry
// every number of the earlier one, and the wording must overlap substantially.
// Definition sentences such as "Statistiline metsainventuur ehk SMI on ..."
// are merged with a following acronym sentence instead of dropped.
export function condenseRedundantSentences(value = "", { mergeDefinitions = false } = {}) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  if (!text) return text;
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-ZÕÄÖÜŠŽ0-9„“"'])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length < 2) return text;
  const condensed = [];
  for (const sentence of sentences) {
    const previous = condensed.at(-1);
    if (previous) {
      const aNumbers = condenserNumbers(previous);
      const bNumbers = condenserNumbers(sentence);
      const numbersCovered = aNumbers.length > 0
        && aNumbers.every((number) => bNumbers.includes(number));
      const overlap = condenserOverlap(previous, sentence);
      if (numbersCovered && overlap >= 0.38) {
        // Keep the sentence that also carries the additional fact.
        condensed[condensed.length - 1] = sentence;
        continue;
      }
      if (overlap >= 0.82) {
        const aCovered = bNumbers.length > 0
          && bNumbers.every((number) => aNumbers.includes(number));
        if (aCovered || condenserWords(sentence).length <= condenserWords(previous).length) continue;
        condensed[condensed.length - 1] = sentence;
        continue;
      }
      if (mergeDefinitions) {
        const definition = previous.match(/^(.+?)\s+ehk\s+([A-ZÕÄÖÜŠŽ][\w-]{1,})\s+on\s+(.+)$/u);
        if (definition) {
          const [, fullName, acronym, predicate] = definition;
          const prefix = `${acronym} on `;
          if (sentence.startsWith(prefix)) {
            const rest = sentence.slice(prefix.length);
            if (condenserOverlap(predicate, rest) >= 0.2) {
              condensed[condensed.length - 1] = `${fullName} ehk ${acronym} on ${rest}`;
              continue;
            }
          }
        }
      }
    }
    condensed.push(sentence);
  }
  return condensed.join(" ");
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
    .filter((value) => value.length >= 35 && value.length <= 520 && hasCompleteSentenceEnding(value));
  return passages
    .map((passage, index) => ({
      passage: passage.replace(/^[„“”"']+|[„“”"']+$/gu, "").trim(),
      score: passageQueryCoverage(query, passage) * 20
        + passageDirectness(query, passage)
        + (preferred.has(normalize(passage)) ? 80 : 0)
        - index * 0.001,
    }))
    .sort((left, right) => right.score - left.score)[0]?.passage?.slice(0, 520) || "";
}


function sourceCitation(source) {
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
function composeForestDataSourcesFallback(query, plannedEvidence, sources = [], previousAnswer = {}) {
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
function composeForestDepletionFallback(query, plannedEvidence, sources = [], previousAnswer = {}) {
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

// Generic forestry intents use only passages that were selected from the
// same visible official result set. This keeps a useful deterministic answer
// when Luna is unavailable without importing the legacy prewritten forestry
// corpus or turning manually assigned tags into factual evidence.
function composeOfficialForestryEvidenceFallback(query, plannedEvidence, sources = [], previousAnswer = {}) {
  if (!plannedEvidence?.strong
    || !plannedEvidence?.passagesByDocument
    || ["forest-area", "forest-depletion", "forest-data-sources"].includes(plannedEvidence.kind)) return null;
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
    note: plannedEvidence.kind === "clearcut-value-judgement"
      ? "Need väljavõtted kirjeldavad metsamajandamise mõju ja selle tingimusi; need ei tõenda üldist väärtushinnangut iga lageraie kohta."
      : String(previousAnswer.note || "").trim().slice(0, 700),
  };
}

// Bare generic forest overview (nt "mets"): mitme ametliku allika süntees
// loobumise asemel. Koostatud ainult nähtavast ametlikust tulemusehulgast
// täpsete väljavõtetega, et väited säilitaksid nähtava tunnistaja.
function composeGenericForestOverviewFallback(query, plannedEvidence, sources = [], previousAnswer = {}) {
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

function answerEvidenceDocuments(documents = [], plannedEvidence, forestBalance) {
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

function claimHasVisibleWitness(claim, witness, relationshipClaim = claim, query = "", minimumRootCoverage = 0.4) {

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

function rebindAnswerCitationsToVisibleWitnesses(draft = {}) {
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


function answerClaimsHaveVisibleWitnesses(draft = {}) {
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

function finalizeVisibleAnswerWitnesses(draft, query, evidencePack) {
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
      clarification: "Leitud allikad ei kata vastuse kõiki väiteid piisavalt selge nähtava väljavõttega.",
      answer: {
        ...attached.answer,
        eyebrow: "Täpsustust on vaja",
        intro: "Leitud ametlike allikate põhjal ei saanud koostada väitehaaval kontrollitava viitega vastust. Täpsusta näitajat, aastat või võrdlust.",
        introCitations: [],
        parts: [],
        note: "Allikad on kuvatud allpool, kuid neist ei koostatud osaliselt viidatud faktivastust.",
      },
      evidence: {
        ...attached.evidence,
        answerable: false,
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

function attachEvidenceExcerpts(draft, _query, evidencePack) {
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

export function publicResponse(draft, { now = Date.now() } = {}) {
  const { evidence: _evidence, ...response } = draft;
  const sources = (Array.isArray(response.sources) ? response.sources : [])
    .filter((source) => publicSourceAllowed(source) && officialCitationUrlEligibility(source?.url).eligible)
    .map((source) => {
      if (source.actionUrl === undefined || (publicSourceAllowed({url: source.actionUrl}) && officialCitationUrlEligibility(source.actionUrl).eligible)) return source;
      const { actionUrl: _actionUrl, actionLabel: _actionLabel, ...safeSource } = source;
      return safeSource;
    });
  const chartCandidate = validPublicChart(response.chart, sources) ? boundedChart(response.chart) : null;
  const chart = chartCandidate
    && sourceCanSupportPublicCitation(
      sources.find((source) => Number(source?.citation) === chartCandidate.citation) || {},
      { now },
    ).eligible
    ? chartCandidate
    : null;
  const answer = response.answer && typeof response.answer === "object" && !Array.isArray(response.answer)
    ? response.answer
    : null;
  const rawCitations = [];
  let validCitationShape = Boolean(answer || response.answer == null);
  const collectCitations = (citations) => {
    if (citations === undefined) return;
    if (!Array.isArray(citations)) {
      validCitationShape = false;
      return;
    }
    rawCitations.push(...citations);
  };
  collectCitations(answer?.introCitations);
  if (chart) rawCitations.push(chart.citation);
  const answerParts = answer?.parts === undefined ? [] : answer.parts;
  if (!Array.isArray(answerParts)) validCitationShape = false;
  else answerParts.forEach((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      validCitationShape = false;
      return;
    }
    collectCitations(part.citations);
  });

  const validAnswerCitations = rawCitations.every((citation) => (
    typeof citation === "number" && Number.isInteger(citation) && citation > 0
  ));
  const sourceCitationCounts = new Map();
  for (const source of sources) {
    const citation = source?.citation;
    if (typeof citation !== "number" || !Number.isInteger(citation) || citation <= 0) continue;
    sourceCitationCounts.set(citation, (sourceCitationCounts.get(citation) || 0) + 1);
  }
  const usedCitations = new Set(rawCitations);
  const citationsResolveExactlyOnce = [...usedCitations].every((citation) => (
    sourceCitationCounts.get(citation) === 1
  ));
  const citedSourcesSupportPublicClaims = [...usedCitations].every((citation) => {
    const source = sources.find((candidate) => Number(candidate?.citation) === citation);
    return sourceCanSupportPublicCitation(source || {}, { now }).eligible;
  });
  let validMeasureScope = true;
  if (answer && forestEvidenceIntent(response.query)?.kind === "protected-forest-share") {
    try {
      assertAnswerAddressesQuery([answer.intro, ...(Array.isArray(answerParts) ? answerParts.map((part) => part.text) : [])].join(" "), response.query);
    } catch {
      validMeasureScope = false;
    }
  }
  if (!validCitationShape
    || !validAnswerCitations
    || !citationsResolveExactlyOnce
    || !validMeasureScope
    || !citedSourcesSupportPublicClaims) {
    return {
      ...response,
      chart: undefined,
      clarification: "Vastuse allikaviiteid ei saanud üheselt kontrollida.",
      answer: {
        eyebrow: "Täpsustust on vaja",
        title: "Allikaviiteid ei saanud kontrollida",
        intro: "Leitud ametlike allikate põhjal ei saanud koostada üheselt kontrollitava viitega faktivastust. Täpsusta näitajat, aastat või asukohta ja proovi uuesti.",
        introCitations: [],
        parts: [],
        note: "Otsingutulemused on kuvatud allpool, kuid neist ei koostatud faktivastust.",
      },
      sources: [],
    };
  }
  const visibleSources = usedCitations.size
    ? sources.filter((source) => usedCitations.has(source.citation))
    : sources;
  const citationMap = new Map(visibleSources.map((source, index) => [
    source.citation,
    index + 1,
  ]));
  const compactCitations = (citations = []) => [...new Set(citations
    .map((citation) => citationMap.get(citation))
    .filter(Number.isInteger))];
  return {
    ...response,
    chart: chart ? { ...chart, citation: citationMap.get(chart.citation) } : undefined,
    answer: answer ? {
      ...answer,
      intro: condenseRedundantSentences(answer.intro, { mergeDefinitions: true }),
      introCitations: compactCitations(answer.introCitations),
      parts: answerParts.map((part) => ({
        ...part,
        text: condenseRedundantSentences(part.text, { mergeDefinitions: true }),
        citations: compactCitations(part.citations),
      })),
    } : answer,
    sources: visibleSources.map((source, index) => {
      const publicKeys = [
        "id", "citation", "title", "organization", "type", "published", "updated", "dataYear", "dataAsOf", "url", "evidenceExcerpt", "locator", "actionUrl", "actionLabel", "tags", "sourceTier",
      ];
      if (!source.evidenceExcerpt) publicKeys.push("summary");
      return {
        ...Object.fromEntries(publicKeys
          .filter((key) => source[key] !== undefined)
          .map((key) => [key, source[key]])),
        id: stablePublicResultId(source),
        citation: index + 1,
      };
    }),
  };
}

function remainingBudget(deadlineAt, reserveMs = 0) {
  return Math.max(0, deadlineAt - Date.now() - reserveMs);
}

function throwIfRequestAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

export function isSearchCacheEnabled(value = process.env.SEARCH_CACHE_ENABLED) {
  return String(value ?? "true").toLocaleLowerCase("et") !== "false";
}

export function requestCanStillPersist({ signal, deadlineAt, now = Date.now() } = {}) {
  return !signal?.aborted && (!Number.isFinite(deadlineAt) || now < deadlineAt);
}

export function retainSearchPersistence(operation, onBackgroundCleanup) {
  const cleanup = Promise.resolve(operation).catch(() => undefined);
  if (typeof onBackgroundCleanup === "function") {
    try {
      // Registration is synchronous: the HTTP owner retains its search slot
      // before this operation can return a response. The response itself does
      // not wait for optional telemetry/cache persistence.
      onBackgroundCleanup(cleanup);
      return Promise.resolve();
    } catch {
      // A caller without a working lease must wait for the bounded operation;
      // optional database work is never allowed to become detached.
    }
  }
  return cleanup;
}

export function shouldGenerateGroundedAnswer(draft) {
  return Boolean(
    draft?.sources?.length
    && ["ranked-search-results", "reviewed-official-source", "broad-grounded-answer"].includes(draft?.evidence?.kind)
    && draft?.evidence?.answerable === true,
  );
}

function reviewedRelatedQuestions(reviewed = [], limit = 6) {
  const seen = new Set();
  return reviewed
    .map((value) => String(value || "").replace(/\s+/gu, " ").trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase("et").replace(/[^0-9a-zõäöüšž]+/giu, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 6, 6)));
}

export async function createPortalDraft(query, {
  deadlineAt,
  signal,
  retrievalQuery = query,
  searchResults,
  sort = searchResults?.appliedFilters?.sort || "relevance",
  clientKey = "unknown",
} = {}) {
  throwIfRequestAborted(signal);
  const listing = searchResults || await prepareRankedSearchResults(retrievalQuery, {
    page: 1,
    pageSize: 12,
    deadlineAt,
    signal,
    clientKey,
    filters: { sort },
  });
  const candidates = conventionalEvidenceDocumentsFromListing(listing);
  // Route-only federated cards stay visible as discovery results but cannot
  // become answer evidence. Hydrate only independently eligible sources so a
  // search never spends six page requests on cards discarded immediately.
  const rankingOptions = { sort, now: Date.now() };
  const retainedPlan = currentListingEvidencePlan(listing, retrievalQuery, candidates, sort);
  const ranked = retainedPlan ? candidates : rankPortalDocuments(retrievalQuery, candidates, rankingOptions);
  const hydrationBudget = remainingBudget(deadlineAt, 7_000);
  const answerCandidates = retainedPlan
    ? ranked.filter((source) => retainedPlan.supportingDocumentIds.includes(source.id))
    : ranked.slice(0, 10);
  const hydratedTop = retainedPlan ? answerCandidates : hydrationBudget >= 500
    ? await hydrateOfficialDocuments(ranked.slice(0, 6), 6, {
      timeoutMs: Math.min(2_000, hydrationBudget),
      signal,
    })
    : answerCandidates.slice(0, 6);
  throwIfRequestAborted(signal);
  // IDs describe logical catalogue entries, not transport identity. A typed
  // dataset and its human landing page may deliberately have related IDs, and
  // a future malformed duplicate must never replace evidence from another URL.
  // Re-associate hydration only with the same canonical HTTPS resource.
  const hydrated = reassociateHydratedDocuments(answerCandidates, hydratedTop);
  const eligibleHydrated = evidenceDocumentsFromListing({ items: hydrated });
  const currentPlan = retainedPlan && currentListingEvidencePlan(listing, retrievalQuery, eligibleHydrated, sort);
  const reranked = currentPlan ? eligibleHydrated : rankPortalDocuments(retrievalQuery, eligibleHydrated, rankingOptions);
  const forestBalance = composeForestHarvestBalanceAnswer(retrievalQuery, reranked, query);
  const conventionalQuality = currentPlan ? {} : assessEvidence(retrievalQuery, reranked);
  const plannedEvidence = currentPlan || selectAnswerEvidence(retrievalQuery, reranked, { ...rankingOptions, preRanked: true });
  const directOverview = (() => {
    const source = directPortalOverviewSource(retrievalQuery) || directPortalReportSource(retrievalQuery);
    if (!source) return null;
    return reranked.find((document) => document.id === source.id
      || sameSourceResource(document.url, source.url)) || null;
  })();
  const mandateTerms = queryTerms(query);
  const mandateOrganizationQuery = /^mida\s+teeb\s+/u.test(normalize(query))
    && mandateTerms.length === 1
    && ["keskkonnaamet", "keskkonnaagentuur", "kliimaministeerium", "rmk"].includes(mandateTerms[0]);
  const plannedMandateOk = !mandateOrganizationQuery
    || (plannedEvidence?.passages || []).some((passage) => textHasQueryRoot(passage, mandateTerms[0])
      && /\b(?:teeb|tegevus\w*|ulesanne\w*|ülesanne\w*|haldab|korraldab|vastutab|pakub)\b/u.test(normalize(passage)));
  const quality = directOverview
    ? {
      ...conventionalQuality,
      strong: true,
      answerable: true,
      directDocumentId: directOverview.id,
      answerIntent: "portal-overview",
      supportingDocumentIds: [directOverview.id],
    }
    : plannedEvidence?.strong && plannedMandateOk
    ? {
      ...conventionalQuality,
      strong: true,
      answerable: true,
      directDocumentId: plannedEvidence.directDocumentId,
      answerIntent: plannedEvidence.kind,
      supportingDocumentIds: plannedEvidence.supportingDocumentIds,
    }
    : ["forest-area-method", "forest-overview"].includes(plannedEvidence?.kind) || plannedEvidence?.requiresStrictScopeEvidence
      ? {
        ...conventionalQuality,
        strong: false,
        directDocumentId: null,
        answerIntent: plannedEvidence.kind,
        supportingDocumentIds: [],
      }
    : conventionalQuality;

  if (mandateOrganizationQuery && !plannedMandateOk) {
    quality.strong = false;
    quality.answerable = false;
    quality.directDocumentId = null;
    quality.supportingDocumentIds = [];
  }

  // Does the ranked set actually carry the question's subject? This decides
  // whether the answer may claim to have found "related official results" or
  // must report that no suitable official evidence exists at all. The visible
  // listing counts too: it is the set the user can open.
  const subjectCovered = Boolean(forestBalance)
    || quality.answerable
    || rankedSetCoversSubject(query, [
      ...reranked,
      ...conventionalEvidenceDocumentsFromListing(listing),
    ]);
  const allPlannedAnswerDocuments = answerEvidenceDocuments(reranked, plannedEvidence, forestBalance);
  const compositeRequiredIds = plannedEvidence?.kind === "forest-area-method"
    && !plannedEvidence.strong
    ? new Set(forestryIntentServiceDocumentIds(retrievalQuery))
    : null;
  const plannedAnswerDocuments = plannedEvidence?.requiresStrictScopeEvidence && !plannedEvidence.strong
    ? []
    : compositeRequiredIds
    ? allPlannedAnswerDocuments.filter((document) => compositeRequiredIds.has(document?.id))
    : allPlannedAnswerDocuments;
  const compositeNavigationDocuments = plannedEvidence?.kind === "forest-area-method"
    && !plannedEvidence.strong
    ? (listing?.items || []).filter((document) => document?.id === "forest-overview").slice(0, 1)
    : [];
  const seenAnswerDocuments = new Set();
  const answerDocuments = [...compositeNavigationDocuments, ...plannedAnswerDocuments]
    .filter((document) => {
      const key = sourceWitnessKey(document) || document?.id;
      if (!key || seenAnswerDocuments.has(key)) return false;
      seenAnswerDocuments.add(key);
      return true;
    });
  const direct = quality.strong
    ? answerDocuments.find((document) => document.id === quality.directDocumentId)
    : null;
  const directCitation = direct
    ? answerDocuments.findIndex((document) => document.id === direct.id) + 1
    : 0;
  const draft = composeSearchResponse(query, answerDocuments, {
    answerable: Boolean(forestBalance) || quality.answerable,
    // "Seotud ametlikud tulemused" is a claim about the question's subject:
    // incidental matches on filler words never qualify (see
    // rankedSetCoversSubject).
    hasRelevantResults: subjectCovered,
    clarification: forestBalance || quality.answerable
      ? null
      : subjectCovered
        ? plannedEvidence?.reason === "national-area-method-evidence-required"
          ? "Leitud allikad ei kata korraga Eesti metsamaa pindala ja selle statistilist mõõtmismeetodit. Seetõttu ei esita ma osalist arvvastust; ava ametlik ülevaade või proovi uuesti."
          : "Leitud allikad ei kata küsimust piisavalt täpselt. Lisa konkreetne objekt, näitaja, piirkond või aasta."
        : undefined,
    evidenceKind: forestBalance
      ? "structured-forest-balance"
      : quality.strong
        ? "ranked-search-results"
        : quality.answerable ? "broad-grounded-answer" : "insufficient-evidence",
    limit: 10,
    quality,
    total: Number(listing.total || reranked.length),
  });
  if (quality.broad && !forestBalance) {
    // A qualitative answer must still say something verifiable when the model
    // is unavailable. Use the most query-relevant passage from the same
    // document that passed the broad eligibility check.
    const broadDocument = answerDocuments.find((document) => document.id === quality.broadDocumentId);
    const extract = broadDocument ? directEvidenceExtract(retrievalQuery, broadDocument, null, { requireSubject: true }) : "";
    const broadCitation = broadDocument
      ? answerDocuments.findIndex((document) => document.id === broadDocument.id) + 1
      : 0;
    if (extract && broadCitation > 0) {
      draft.answer = {
        eyebrow: "Allikapõhine vastus",
        title: draft.answer.title,
        intro: extract,
        introCitations: [broadCitation],
        parts: [],
        note: "",
      };
      draft.clarification = null;
    }
  }
  if (forestBalance) {
    draft.answer = forestBalance.answer;
    draft.related = forestBalance.related;
    if (forestBalance.chart) draft.chart = forestBalance.chart;
    draft.evidence.answerable = true;
  }
  if (plannedEvidence?.reason === "national-area-method-evidence-required") {
    draft.answer.eyebrow = "Mõõtmismeetodi tõend puudub";
    draft.answer.intro = "Leitud ametlikud allikad ei kata korraga nii Eesti metsamaa pindala kui ka seda, kuidas riiklik hinnang saadakse. Ma ei esita ainult üht poolt vastusest ega lisa kontrollimata metoodikat.";
    draft.answer.introCitations = [];
    draft.answer.parts = [];
  }
  const forestDataSourcesFallback = !forestBalance
    ? composeForestDataSourcesFallback(query, plannedEvidence, draft.sources, draft.answer)
    : null;
  const forestDepletionFallback = !forestBalance && !forestDataSourcesFallback
    ? composeForestDepletionFallback(query, plannedEvidence, draft.sources, draft.answer)
    : null;
  const genericForestOverviewFallback = !forestBalance && !forestDataSourcesFallback && !forestDepletionFallback
    ? composeGenericForestOverviewFallback(query, plannedEvidence, draft.sources, draft.answer)
    : null;
  const officialForestryFallback = !forestBalance && !forestDataSourcesFallback && !forestDepletionFallback && !genericForestOverviewFallback
    ? composeOfficialForestryEvidenceFallback(query, plannedEvidence, draft.sources, draft.answer)
    : null;
  const directExtract = !forestBalance && direct
    ? directEvidenceExtract(retrievalQuery, direct, plannedEvidence)
    : "";
  if (forestDataSourcesFallback) {
    draft.answer = forestDataSourcesFallback;
    // The fallback is a terse rendering of raw visible evidence, not a new
    // source. Do not feed it back to Luna as if it were independently
    // reviewed evidence; Luna must ground any replacement in the sources.
    draft.evidence.syntheticFallback = "forest-data-sources";
  } else if (forestDepletionFallback) {
    draft.answer = forestDepletionFallback;
    draft.evidence.syntheticFallback = "forest-depletion";
  } else if (genericForestOverviewFallback) {
    draft.answer = genericForestOverviewFallback;
    draft.evidence.syntheticFallback = "forest-overview";
  } else if (officialForestryFallback) {
    draft.answer = officialForestryFallback;
    draft.evidence.syntheticFallback = "official-forestry-evidence";
  } else if (directExtract) {
    draft.answer.eyebrow = "Allikapõhine kokkuvõte";
    draft.answer.intro = directExtract;
    draft.answer.introCitations = [directCitation];
  }
  const definitionRoots = queryTerms(retrievalQuery);
  let packPlan = plannedEvidence;
  if (draft.evidence.answerable && draft.sources.length === 1
    && definitionRoots.length && definitionRoots.every((root) => root === "smi")) {
    const source = draft.sources[0];
    const definition = selectSmiDefinitionEvidence(source);
    if (definition.satisfies) {
      // Select actual definition and scope passages once; a summary synonym
      // must not become a second definition in the single-source model pack.
      packPlan = {
        requiredRoles: ["definition"],
        roleWitnesses: { definition: {
          documentId: source.id, ...sourceEvidenceBinding(source), passages: definition.passages,
        } },
        requiredOnly: true,
      };
      draft.answer = {
        ...draft.answer,
        eyebrow: "Allikapõhine kokkuvõte",
        intro: definition.passages.slice(0, 2).join(" "),
        introCitations: [sourceCitation(source)],
        parts: [],
      };
    }
  }
  const intentNormalized = normalize(query);
  const firePreventionIntent = /(?:metsa)?poleng|tulekahju|tuleoht/u.test(intentNormalized)
    && /(?:hoida|valtida|ennetada|kaitsta|ennetus|torje)/u.test(intentNormalized);
  const fellingProcedureIntent = /eraldis/u.test(intentNormalized)
    && /(?:taotle|taotlus|taotlemine)/u.test(intentNormalized);
  const intentAnswer = normalize(draft.answer?.intro || "");
  const radonRiskIntent = /radoon/u.test(intentNormalized)
    && /(?:ohtlik|tervis|risk|piirnorm)/u.test(intentNormalized);
  const intentCovered = !firePreventionIntent && !fellingProcedureIntent && !radonRiskIntent
    || (firePreventionIntent && /(?:poleng|tulekahju|tuleoht)/u.test(intentAnswer))
    || (fellingProcedureIntent && /(?:eraldis|raie|metsateatis)/u.test(intentAnswer) && /taotl/u.test(intentAnswer))
    || (radonRiskIntent && /(?:tervis|ohtlik|risk|piirnorm|radoonioht)/u.test(intentAnswer)
      && !/(?:seminar|konverents|koolitus|toimub|korraldab|registreeru|külasta)/u.test(intentAnswer));
  if (!intentCovered) {
    draft.answer = {
      eyebrow: "Vajan täpsustust",
      title: draft.answer?.title || query,
      intro: "Leitud allikad ei kata küsimuse konkreetset tegevust piisavalt täpselt. Ma ei esita sama teema üldist statistikat vastusena.",
      introCitations: [],
      parts: [],
      note: "",
    };
    draft.clarification = "Täpsusta tegevust või objekti; praegused allikad kirjeldavad teist teemat.";
    draft.evidence.answerable = false;
  }
  const evidencePack = buildEvidencePack({ sources: draft.sources, query: retrievalQuery, plan: packPlan });
  draft.evidence.sourceEvidencePack = evidencePack;
  return draft.evidence?.answerable === true
    ? finalizeVisibleAnswerWitnesses(draft, retrievalQuery, evidencePack)
    : attachEvidenceExcerpts(draft, retrievalQuery, evidencePack);
}

function stableRevisionValue(value) {
  if (Array.isArray(value)) return value.map(stableRevisionValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      stableRevisionValue(value[key]),
    ]));
  }
  if (value === undefined || value === null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  return String(value);
}

export function searchListingRevision(listing = {}) {
  const records = (listing.items || []).map((item) => {
    const currentEvidence = sourceCanSupportPublicCitation(item);
    return stableRevisionValue({
      id: item.id,
      resourceKey: sourceResourceKey(item.url),
      witnessKey: sourceWitnessKey(item),
      title: item.title,
      organization: item.organization,
      type: item.type,
      summary: item.summary,
      answer: item.answer,
      content: item._contentHash || item.content,
      locator: item.locator,
      actionUrl: item.actionUrl ? sourceResourceKey(item.actionUrl) : null,
      actionLabel: item.actionLabel,
      published: item.published,
      updated: item.updated,
      dataYear: item.dataYear,
      dataAsOf: item.dataAsOf,
      publishedAt: item._publishedAt,
      sourceTier: item.sourceTier,
      routeClasses: item.routeClasses,
      topics: item.topics,
      tags: item.tags,
      retrieval: item.retrieval,
      delivery: item.delivery,
      evidencePolicy: item.evidencePolicy,
      answerEvidenceEligible: item._answerEvidenceEligible,
      evidenceVersion: item._evidenceVersion,
      evidenceStatusAt: item._evidenceStatusAt,
      evidenceObservedAt: item._evidenceObservedAt,
      evidenceValidFrom: item._evidenceValidFrom,
      evidenceValidUntil: item._evidenceValidUntil,
      freshness: item.freshness,
      currentEvidence: {
        eligible: currentEvidence.eligible,
        policy: currentEvidence.policy,
        reason: currentEvidence.reason,
      },
    });
  });
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

export function cachedSourcesBelongToListing(cached, listing) {
  if ((cached?.sources || []).some((source) => (
    !publicSourceAllowed(source) || !officialCitationUrlEligibility(source?.url).eligible
    || (source?.actionUrl !== undefined && (!publicSourceAllowed({url: source.actionUrl}) || !officialCitationUrlEligibility(source.actionUrl).eligible))
  ))) return false;
  if (!listing?.items?.length || !cached?.sources?.length) return true;
  const witnesses = new Set(listing.items.map(publicSourceWitnessKey).filter(Boolean));
  return cached.sources.every((source) => {
    const key = publicSourceWitnessKey(source);
    return key !== null && witnesses.has(key);
  });
}

function draftSourcesBelongToListing(draft, listing) {
  if (!draft?.sources?.length) return true;
  const visibleItems = listing?.items || [];
  const answerItems = listing?.evidenceCandidates || visibleItems;
  const witnesses = new Set(answerItems.map(publicSourceWitnessKey).filter(Boolean));
  return draft.sources.every((source) => {
    const key = publicSourceWitnessKey(source);
    return (key !== null && witnesses.has(key)) || sourceIsLinkedToVisibleService(source, visibleItems);
  });
}

export function draftMatchesListingAndFilters(draft, listing, filters = {}) {
  return Boolean(draft)
    && draft.sources.every((source) => resultMatchesFilters(source, filters))
    && (!listing || draftSourcesBelongToListing(draft, listing));
}

async function searchWithinBudget(cleanQuery, {
  startedAt,
  deadlineAt,
  signal,
  assessmentQuery = cleanQuery,
  retrievalQuery = cleanQuery,
  searchResults,
  filters = {},
  conversationContext = "",
  llmClientKey = "unknown",
  useCache = true,
  onDraft,
  onBackgroundCleanup,
  generateAnswer = generateGroundedAnswer,
  persistSearch = recordSearch,
}) {
  throwIfRequestAborted(signal);
  const assessment = assessSearchQuery(assessmentQuery);
  // Out-of-scope and private-person requests are never cache keys, database
  // telemetry, or model/retrieval inputs. Keep this defensive boundary before
  // even a cache read so legacy rows cannot bypass the current classifier.
  if (assessment.kind === "out-of-scope") {
    return publicResponse(composeScopeResponse(cleanQuery, assessment), { now: startedAt });
  }
  const defaultFilters = !filters?.category && !filters?.year
    && [undefined, "", "all"].includes(filters?.source)
    && [undefined, "", "relevance"].includes(filters?.sort);
  const cacheEnabled = useCache && defaultFilters && isSearchCacheEnabled();
  const cacheRevision = `${SEARCH_RESPONSE_REVISION}:${searchListingRevision(searchResults)}`;
  const listingBackedCache = cacheEnabled && Boolean(searchResults?.items?.length);
  if (listingBackedCache) {
    const cached = await readSearchCache(cleanQuery, cacheRevision, { signal, deadlineAt });
    throwIfRequestAborted(signal);
    if (cached && cachedSourcesBelongToListing(cached, searchResults)) {
      // Defence in depth: persisted responses still cross the current public
      // serializer even when their revision and listing witness are valid.
      return publicResponse(cached, { now: startedAt });
    }
  }

  let draft;
  const structuredIndicatorCandidate = composeCurrentWeatherObservationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeNationalWeatherForecastResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeLatestPublishedHydrologyResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeEelisEmajogiPublicWatercourseResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeEelisNaturaSiteResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeHarvestShareResponse(retrievalQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeForestSeriesResponse(retrievalQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeStatisticsWaterAbstractionResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeStatisticsHazardousWasteResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeStatisticsTotalWasteRecoveryResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeStatisticsWastewaterBht7Response(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeClimateDailyMeanResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeMunicipalWasteRecyclingResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeWasteFacilitiesNavigationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeTopicDataOverviewResponse(retrievalQuery, searchResults?.items, {
    total: searchResults?.total,
    publicQuery: cleanQuery,
  }) || composeOfficialServiceNavigationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeAmbiguousDomainGuidanceResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  });
  const structuredIndicatorDraft = draftMatchesListingAndFilters(
    structuredIndicatorCandidate,
    searchResults,
    filters,
  ) ? structuredIndicatorCandidate : null;
  if (structuredIndicatorDraft) {
    draft = structuredIndicatorDraft;
  } else if (assessment.kind !== "answerable") {
    draft = composeScopeResponse(cleanQuery, assessment);
    if (searchResults && !draftSourcesBelongToListing(draft, searchResults)) {
      const filteredDocuments = rankPortalDocuments(
        retrievalQuery,
        conventionalEvidenceDocumentsFromListing(searchResults),
        { sort: filters.sort, now: startedAt },
      );
      draft = composeSearchResponse(cleanQuery, filteredDocuments, {
        answerable: false,
        hasRelevantResults: Boolean(searchResults?.items?.length),
        clarification: defaultFilters
          ? "Selle küsimuse jaoks vajalikku reaalaja- või registriallikat ei leitud nähtavast tulemusehulgast. Täpsusta päringut või proovi uuesti."
          : "Valitud filtrid välistavad selle küsimuse jaoks vajaliku reaalaja- või registriallika. Lähtesta filter või vali sobiv ametlik sisutüüp.",
        evidenceKind: "filtered-scope-exclusion",
        limit: 6,
        total: Number(searchResults.total || filteredDocuments.length),
      });
    }
  } else {
    const cadastreCandidate = await answerCadastreQuestion(cleanQuery, { signal, deadlineAt });
    const cadastreDraft = draftMatchesListingAndFilters(cadastreCandidate, searchResults, filters)
      ? cadastreCandidate
      : null;
    draft = cadastreDraft || await createPortalDraft(cleanQuery, {
      deadlineAt,
      signal,
      retrievalQuery,
      searchResults,
      clientKey: llmClientKey,
      sort: filters.sort || "relevance",
    });
  }
  if (!draftMatchesListingAndFilters(draft, searchResults, filters)) {
    const filteredDocuments = rankPortalDocuments(
      retrievalQuery,
      conventionalEvidenceDocumentsFromListing(searchResults)
        .filter((document) => resultMatchesFilters(document, filters)),
      { sort: filters.sort, now: startedAt },
    );
    draft = composeSearchResponse(cleanQuery, filteredDocuments, {
      answerable: false,
      hasRelevantResults: Boolean(searchResults?.items?.length),
      clarification: "Valitud filtrid välistavad vastuse jaoks vajaliku tõendi või see puudub nähtavast tulemusehulgast. Lähtesta filter või täpsusta päringut.",
      evidenceKind: "filtered-source-exclusion",
      limit: 6,
      total: Number(searchResults?.total || filteredDocuments.length),
    });
  }
  throwIfRequestAborted(signal);
  // Every composer crosses the same one-pack boundary, including reviewed
  // navigation and typed adapters that do not use createPortalDraft.
  if (!draft.evidence?.sourceEvidencePack) {
    draft.evidence = {
      ...draft.evidence,
      sourceEvidencePack: buildEvidencePack({ sources: draft.sources, query: retrievalQuery }),
    };
    draft = draft.evidence.answerable === true
      ? finalizeVisibleAnswerWitnesses(draft, retrievalQuery, draft.evidence.sourceEvidencePack)
      : attachEvidenceExcerpts(draft, retrievalQuery, draft.evidence.sourceEvidencePack);
  }
  draft.generatedAt = new Date().toISOString();
  const evidencePack = draft.evidence?.sourceEvidencePack;
  const canGenerate = shouldGenerateGroundedAnswer(draft) && evidencePack?.complete === true;
  const llmBudget = remainingBudget(deadlineAt, 300);
  if (canGenerate && llmBudget >= 500 && typeof onDraft === "function") {
    throwIfRequestAborted(signal);
    onDraft(publicResponse(withForestContextChart(withLandUseShareChart(draft, retrievalQuery, searchResults?.items, { now: startedAt }), retrievalQuery, searchResults?.items, { now: startedAt }), { now: startedAt }));
  }
  // Keep the accepted deterministic result detached from both the provider
  // input and any streamed consumer. A ready model answer must rebind its
  // visible citation witnesses before it can replace this snapshot.
  const deterministicDraft = structuredClone(draft);
  // Keep opaque source admission on our snapshot, never on provider copies.
  // Cloning a descriptor cannot recreate its private constructor binding.
  deterministicDraft.sources = deterministicDraft.sources.map((source, index) => ({
    ...source,
    ...(draft.sources[index]._visibleServiceWitness
      ? { _visibleServiceWitness: draft.sources[index]._visibleServiceWitness } : {}),
  }));
  deterministicDraft.evidence.sourceEvidencePack = evidencePack;
  // Never hand the model the full remaining budget: its attempt timers
  // would then run into the shared deadline, and the resulting abort
  // converts a ready cited draft into a timeout message. Keep a tail margin
  // for rebinding, serialization and transport so the deterministic draft
  // is always still deliverable; skip the attempt when even that margin
  // does not fit.
  const LLM_TAIL_MARGIN_MS = 1_500;
  const llmAttemptCeilingMs = llmBudget - LLM_TAIL_MARGIN_MS;
  const llmResult = canGenerate && llmAttemptCeilingMs >= 500
    ? await generateAnswer(cleanQuery, structuredClone(draft), {
      timeoutMs: llmAttemptCeilingMs,
      signal,
      conversationContext,
      clientKey: llmClientKey,
      evidencePack,
    })
    : { answer: null, acceptedClaims: [], attempt: {
      provider: "deterministic-current-evidence",
      status: shouldGenerateGroundedAnswer(draft) ? "degraded" : "not-applicable",
      reason: !shouldGenerateGroundedAnswer(draft) ? "not-applicable"
        : !evidencePack?.complete ? "evidence-insufficient" : "budget",
    } };
  throwIfRequestAborted(signal);

  let visibleRejected = false;
  if (llmResult.answer) {
    const modelDraft = rebindAnswerCitationsToVisibleWitnesses(attachEvidenceExcerpts({
      ...structuredClone(deterministicDraft),
      sources: deterministicDraft.sources,
      evidence: deterministicDraft.evidence,
      answer: structuredClone(llmResult.answer),
    }, retrievalQuery, evidencePack));
    // Validation proves that a model claim is grounded in the internal
    // evidence pack. This second boundary proves that the same claim is also
    // supported by the bounded excerpt a reader can actually inspect.
    visibleRejected = !answerClaimsHaveVisibleWitnesses(modelDraft);
    draft = visibleRejected ? deterministicDraft : modelDraft;
  } else {
    draft = deterministicDraft;
  }
  // Related navigation is reviewed local product copy, never provider output.
  draft.related = reviewedRelatedQuestions(draft.related, 6);
  draft.generatedAt = new Date().toISOString();
  draft = withForestContextChart(withLandUseShareChart(draft, retrievalQuery, searchResults?.items, { now: startedAt }), retrievalQuery, searchResults?.items, { now: startedAt });
  const publishedResponse = publicResponse(draft, { now: startedAt });
  const deterministicResponse = publicResponse(deterministicDraft, { now: startedAt });
  const durationMs = Date.now() - startedAt;
  const evidenceKind = draft.evidence?.kind;
  const spatialDegraded = evidenceKind === "official-spatial-snapshot"
    && Object.values(draft.evidence?.states || {}).some((state) => state === "unavailable");
  const structuredStale = evidenceKind === "structured-forest-balance"
    && draft.sources.some((source) => source._stale === true);
  const cacheEligible = (
    evidenceKind === "safe-abstention"
    || evidenceKind === "needs-clarification"
    || evidenceKind === "official-live-routing"
    || evidenceKind === "structured-national-weather-forecast"
    || (evidenceKind === "structured-forest-balance" && !structuredStale)
    || (evidenceKind === "official-spatial-snapshot" && !spatialDegraded)
  );
  const ttlMinutes = [
    "official-live-routing",
    "structured-national-weather-forecast",
    "structured-forest-balance",
  ].includes(evidenceKind) ? 5 : 20;
  const publishedBindings = Object.fromEntries((publishedResponse.sources || []).map((source) => {
    const originals = draft.sources.filter((candidate) => (
      stablePublicResultId(candidate) === source.id
      && candidate.url === source.url && candidate.locator === source.locator
      && Number.isInteger(candidate.citation) && candidate.citation > 0
    ));
    if (originals.length !== 1) return [source.citation, undefined];
    const original = originals[0];
    const binding = evidencePack?.bindings[original.citation];
    const retained = sourceEvidenceBinding(original);
    const packed = evidencePack?.entries.filter((entry) => entry.citation === original.citation);
    return [source.citation, binding && packed?.length === 1
      && retained.witnessKey !== null && retained.witnessKey === binding.witnessKey
      && retained.version === binding.version && retained.snapshotHash === binding.snapshotHash ? binding : undefined];
  }));
  const outcome = deliveredOutcome({
    publishedResponse, deterministicResponse, deterministicCacheValue: deterministicDraft, acceptedClaims: llmResult.acceptedClaims,
    attempt: visibleRejected && llmResult.attempt
      ? { ...llmResult.attempt, reason: "visible-rejected" } : llmResult.attempt,
    evidenceKind, cacheEligible, publishedBindings,
  });
  const response = outcome.response;

  if (requestCanStillPersist({ signal, deadlineAt })) {
    await retainSearchPersistence(persistSearch({
      query: cleanQuery,
      response,
      cacheValue: deterministicDraft,
      cacheOutcome: outcome,
      revision: cacheRevision,
      answerProvider: outcome.answerProvider,
      answerStatus: outcome.answerStatus,
      attempt: outcome.attempt,
      documentIds: draft.evidence?.documentIds || [],
      durationMs,
      ttlMinutes,
      cacheResponse: listingBackedCache && outcome.cacheResponse,
      signal,
      deadlineAt,
    }), onBackgroundCleanup);
  }
  return response;
}

export function searchTimeoutFallback(cleanQuery, {
  assessmentQuery = cleanQuery,
  searchResults,
  filters = {},
  reason = "deadline",
  startedAt = Date.now(),
} = {}) {
  const assessment = assessSearchQuery(assessmentQuery);
  const structuredCandidate = composeCurrentWeatherObservationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeNationalWeatherForecastResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeLatestPublishedHydrologyResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeEelisEmajogiPublicWatercourseResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeEelisNaturaSiteResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeHarvestShareResponse(assessmentQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeForestSeriesResponse(assessmentQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeStatisticsWaterAbstractionResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeStatisticsHazardousWasteResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeStatisticsTotalWasteRecoveryResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeStatisticsWastewaterBht7Response(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeClimateDailyMeanResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeMunicipalWasteRecyclingResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
  }) || composeWasteFacilitiesNavigationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeTopicDataOverviewResponse(assessmentQuery, searchResults?.items, {
    total: searchResults?.total,
    publicQuery: cleanQuery,
  }) || composeOfficialServiceNavigationResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  }) || composeAmbiguousDomainGuidanceResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
  });
  const structuredIndicator = draftMatchesListingAndFilters(
    structuredCandidate,
    searchResults,
    filters,
  ) ? structuredCandidate : null;
  if (structuredIndicator) return publicResponse(structuredIndicator, { now: startedAt });
  if (assessment.kind !== "answerable") {
    const scopeDraft = composeScopeResponse(cleanQuery, assessment);
    if (draftMatchesListingAndFilters(scopeDraft, searchResults, filters)) {
      return publicResponse(scopeDraft, { now: startedAt });
    }
    const visible = rankPortalDocuments(
      assessmentQuery,
      conventionalEvidenceDocumentsFromListing(searchResults)
        .filter((document) => resultMatchesFilters(document, filters)),
      { sort: filters.sort, now: startedAt },
    );
    return publicResponse(composeSearchResponse(cleanQuery, visible, {
      answerable: false,
      hasRelevantResults: Boolean(searchResults?.items?.length),
      clarification: "Valitud filtrid välistavad selle küsimuse jaoks vajaliku reaalaja- või registriallika või see puudub nähtavast tulemusehulgast. Lähtesta filter või täpsusta päringut.",
      evidenceKind: "filtered-scope-exclusion",
      limit: 6,
      total: Number(searchResults?.total || visible.length),
    }), { now: startedAt });
  }
  const sourceUnavailable = reason === "source-error";
  const capacityLimited = reason === "capacity";
  const ranked = searchResults?.items?.length
    ? rankPortalDocuments(
      assessmentQuery,
      conventionalEvidenceDocumentsFromListing(searchResults)
        .filter((document) => resultMatchesFilters(document, filters)),
      { sort: filters.sort, now: startedAt },
    )
    : [];
  const quality = assessEvidence(cleanQuery, ranked);
  const draft = composeSearchResponse(cleanQuery, ranked, {
    answerable: false,
    clarification: capacityLimited
      ? "Otsing teenindab praegu mitut päringut korraga. Proovi paari sekundi pärast uuesti."
      : sourceUnavailable
        ? "Osa värskeid allikaid ei vastanud. Proovi uuesti või lisa täpsem objekt, näitaja, piirkond või aasta."
        : "Värskete allikate laadimine võttis liiga kaua. Proovi uuesti või lisa täpsem objekt, näitaja, piirkond või aasta.",
    evidenceKind: capacityLimited
      ? "capacity-fallback"
      : sourceUnavailable ? "source-unavailable-fallback" : "deadline-fallback",
    limit: 6,
    quality,
  });
  draft.answer.eyebrow = capacityLimited
    ? "Otsing on praegu koormatud"
    : sourceUnavailable ? "Osa allikaid ei vastanud" : "Otsing võttis liiga kaua";
  draft.answer.intro = capacityLimited
    ? "Otsing teenindab praegu mitut päringut korraga ning uut faktivastust ei koostatud. See ei tähenda, et otsitud andmeid ei ole."
    : sourceUnavailable
      ? "Osa värskeid allikaid ei vastanud ning uut faktivastust ei koostatud. See ei tähenda, et otsitud andmeid ei ole."
      : "Värskete allikate laadimine ei jõudnud vastuse ajapiiri sisse. See ei tähenda, et otsitud andmeid ei ole.";
  draft.answer.introCitations = [];
  draft.answer.parts = [];
  draft.answer.aiUnavailable = true;
  draft.answer.note = ranked.length
    ? capacityLimited
      ? "Proovi otsingut paari sekundi pärast uuesti."
      : sourceUnavailable
      ? "Juba leitud ametlikud allikad on kuvatud tulemuste loendis, kuid ajutise vea järel neist uut faktivastust ei koostatud. Proovi otsingut uuesti."
      : "Juba leitud ametlikud allikad on kuvatud tulemuste loendis, kuid neist ei koostatud ajapiiri järel uut faktivastust. Proovi otsingut uuesti."
    : capacityLimited
      ? "Proovi otsingut paari sekundi pärast uuesti."
      : "Proovi otsingut uuesti või lisa täpsem objekt, näitaja, piirkond või aasta.";
  return publicResponse(draft, { now: startedAt });
}

export function createDeadlineCleanupLease(finalize = () => undefined) {
  const pending = new Set();
  let finished = false;
  let finalized = false;
  const maybeFinalize = () => {
    if (finalized || !finished || pending.size) return;
    finalized = true;
    finalize();
  };
  const track = (operation) => {
    if (!operation) return Promise.resolve();
    const cleanup = Promise.resolve(operation).catch(() => undefined);
    pending.add(cleanup);
    cleanup.then(() => {
      pending.delete(cleanup);
      maybeFinalize();
    });
    return cleanup;
  };
  return {
    track,
    finish() {
      finished = true;
      maybeFinalize();
    },
    pendingCount() {
      return pending.size;
    },
  };
}

export async function settleWithinDeadline(
  operation,
  timeoutMs,
  fallback,
  controller = new AbortController(),
  { onBackgroundCleanup } = {},
) {
  let timer;
  let timedOut = false;
  const operationPromise = Promise.resolve(operation);
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("The search deadline expired", "AbortError"));
      resolve(undefined);
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([operationPromise, timeout]);
    if (!timedOut) return result;
    const cleanup = operationPromise.then(() => undefined, () => undefined);
    // Return the bounded response immediately. HTTP owners pass this cleanup
    // promise to a lease which retains their admission slot until the losing
    // database/upstream operation has actually released its resources.
    // Optional telemetry must never break the bounded timeout response: a
    // synchronously throwing callback would otherwise bypass the fallback.
    if (typeof onBackgroundCleanup === "function") {
      try {
        onBackgroundCleanup(cleanup);
      } catch {
        // Fall through to the fallback response below.
      }
    }
    return typeof fallback === "function" ? fallback() : fallback;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchEnvironmentLive(query, options = {}) {
  const startedAt = Number(options.startedAt) || Date.now();
  const queryInput = canonicalizePublicSearchQuery(query);
  if (queryInput.reason === "empty") return composeSearchResponse("", [], { limit: 3, total: 0 });
  const directAssessment = assessSearchQuery(query);
  if (!queryInput.ok) {
    return publicResponse(composeScopeResponse(queryInput.ok ? queryInput.query : "", directAssessment), { now: startedAt });
  }
  const cleanQuery = queryInput.query;
  const assessmentInput = canonicalizePublicSearchQuery(options.assessmentQuery ?? cleanQuery);
  const retrievalInput = canonicalizePublicSearchQuery(options.retrievalQuery ?? cleanQuery);
  if (!assessmentInput.ok || !retrievalInput.ok) {
    const rejectedValue = !assessmentInput.ok ? options.assessmentQuery : options.retrievalQuery;
    return publicResponse(composeScopeResponse("", assessSearchQuery(rejectedValue)), { now: startedAt });
  }
  const contextualAssessment = assessSearchQuery(assessmentInput.query);
  const validatedEllipticalFollowUp = options.allowSafeEllipticalFollowUp === true
    && directAssessment.kind === "out-of-scope"
    && (isSafeEllipticalFollowUp(cleanQuery)
      // A follow-up whose own tokens name no new subject inherits the accepted
      // root's scope: every added token must be neutral, acronym, or
      // root-derived (see isContextAnchoredFollowUp). Hard scope, privacy and
      // language refusals are unaffected.
      || isContextAnchoredFollowUp(cleanQuery, options.rootContext || options.conversationContext || ""))
    // A period-only follow-up on a dated indicator assesses as
    // "requested-time-series-required" in context; the structured series
    // adapter answers it first, and otherwise the clarification stands.
    && ["answerable", "needs-clarification"].includes(contextualAssessment.kind);
  if (directAssessment.kind === "out-of-scope" && !validatedEllipticalFollowUp) {
    return publicResponse(composeScopeResponse(cleanQuery, directAssessment), { now: startedAt });
  }
  const contextInput = canonicalizePublicSearchQuery(options.conversationContext || "", {
    maximumLength: 1_400,
  });
  const safeConversationContext = contextInput.ok ? contextInput.query : "";
  const canonicalFallbackOptions = {
    ...options,
    assessmentQuery: assessmentInput.query,
    retrievalQuery: retrievalInput.query,
    conversationContext: safeConversationContext,
  };
  let acceptedGroundedDraft = null;
  const captureGroundedDraft = (draft) => {
    // publicResponse intentionally shares nested answer objects with the
    // internal draft. Detach the accepted deterministic result before the
    // provider sees that draft, and give stream consumers their own copy too.
    // A timeout or provider failure can then never expose partially mutated
    // answer text without its original citations.
    acceptedGroundedDraft = structuredClone(draft);
    if (typeof options.onDraft === "function") options.onDraft(structuredClone(acceptedGroundedDraft));
  };
  const bestAvailableFallback = (reason) => acceptedGroundedDraft
    || searchTimeoutFallback(cleanQuery, { ...canonicalFallbackOptions, reason });

  const configuredDeadlineMs = Math.max(1_000, Math.min(Number(process.env.SEARCH_DEADLINE_MS) || DEFAULT_SEARCH_DEADLINE_MS, 15_000));
  const absoluteDeadline = Number(options.deadlineAt) || startedAt + configuredDeadlineMs;
  if (absoluteDeadline <= Date.now()) {
    return searchTimeoutFallback(cleanQuery, canonicalFallbackOptions);
  }
  const deadlineMs = Math.max(1, Math.min(configuredDeadlineMs, absoluteDeadline - Date.now()));
  const controller = new AbortController();
  const signal = options.signal && typeof AbortSignal.any === "function"
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  const operation = searchWithinBudget(cleanQuery, {
    startedAt,
    deadlineAt: absoluteDeadline,
    signal,
    assessmentQuery: assessmentInput.query,
    retrievalQuery: retrievalInput.query,
    searchResults: options.searchResults,
    filters: options.filters || {},
    conversationContext: safeConversationContext,
    llmClientKey: options.llmClientKey || "unknown",
    useCache: options.useCache !== false,
    onDraft: captureGroundedDraft,
    onBackgroundCleanup: options.onBackgroundCleanup,
    generateAnswer: typeof options.generateAnswer === "function"
      ? options.generateAnswer
      : generateGroundedAnswer,
    persistSearch: typeof options.recordSearch === "function" ? options.recordSearch : recordSearch,
  }).catch((error) => {
    if (options.signal?.aborted) {
      throw options.signal.reason instanceof Error ? options.signal.reason : error;
    }
    return bestAvailableFallback("source-error");
  });
  return settleWithinDeadline(
    operation,
    deadlineMs,
    () => bestAvailableFallback("deadline"),
    controller,
    { onBackgroundCleanup: options.onBackgroundCleanup },
  );
}
