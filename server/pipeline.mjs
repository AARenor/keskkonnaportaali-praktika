import { createHash } from "node:crypto";
import { boundedChart, validPublicChart } from "./answer-chart.mjs";
import { withForestContextChart } from "./forest-series.mjs";
import { withLandUseShareChart } from "./land-use-share.mjs";
import { officialCitationUrlEligibility } from "./citation-policy.mjs";
import { readSearchCache, recordSearch } from "./database.mjs";
import { answerCadastreQuestion } from "./cadastre.mjs";
import { composeClimateDailyMeanResponse } from "./climate.mjs";
import {
  hydrateOfficialDocuments,
} from "./integrations.mjs";
import { generateGroundedAnswer, sanitizeLlmEvidenceText } from "./llm.mjs";
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
  canonicalResultUrl,
  evidenceDocumentsFromListing,
  isSafeEllipticalFollowUp,
  prepareRankedSearchResults,
  rankSearchCandidates,
  resultMatchesFilters,
  selectAnswerEvidence,
  stablePublicResultId,
} from "./retrieval.mjs";
import {
  assessEvidence,
  assessSearchQuery,
  canonicalizePublicSearchQuery,
  composeScopeResponse,
  composeSearchResponse,
  composeWasteFacilitiesNavigationResponse,
  forestryIntentServiceDocumentIds,
  hasCompleteSentenceEnding,
  normalize,
  queryTerms,
  splitTextPassages,
  textHasQueryRoot,
} from "./search.mjs";
import { sourceCanSupportPublicCitation } from "./source-registry.mjs";
import { relationshipClaimHasPassageWitness } from "./proposition-grounding.mjs";

// Increment whenever the public response/citation contract changes so rows
// written under an older policy cannot be served without regeneration.
export const SEARCH_RESPONSE_REVISION = "answer-v51-forest-series-chart";
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
    items: (listing?.items || [])
      .filter((document) => !QUERY_BOUND_ADAPTER_RETRIEVALS.has(document.retrieval)),
  };
  return evidenceDocumentsFromListing(conventionalListing);
}

function rankPortalDocuments(query, documents) {
  const ranked = rankSearchCandidates(query, documents).map((document) => ({
    ...document,
    score: document._ranking.score,
  }));
  // The public search ranker has already admitted these official documents
  // for the resolved forestry intent. A second lexical pass must not discard
  // a complementary methodology source merely because it uses different
  // words from the user's misconception (for example “valimi suurus” rather
  // than “kümme korda rohkem vaatlusi”).
  const requiredIds = forestryIntentServiceDocumentIds(query);
  const documentsById = new Map((documents || []).map((document) => [document.id, document]));
  const required = requiredIds.map((id) => documentsById.get(id)).filter(Boolean);
  const seenCandidates = new Set();
  const candidates = [...ranked, ...required].filter((document) => {
    if (!document?.id || seenCandidates.has(document.id)) return false;
    seenCandidates.add(document.id);
    return true;
  });
  const plannedEvidence = selectAnswerEvidence(query, candidates);
  if (!plannedEvidence?.strong) return ranked;
  const directIndex = candidates.findIndex((document) => document.id === plannedEvidence.directDocumentId);
  const withDirectFirst = directIndex > 0
    ? [candidates[directIndex], ...candidates.slice(0, directIndex), ...candidates.slice(directIndex + 1)]
    : candidates;
  if (!required.length) return withDirectFirst;
  // The displayed list and the answer use the same ranked candidate set. A
  // verified passage may lead that set, and the complementary official
  // SMI/Metsaregister documents stay visible in the same evidence set. No
  // separately fetched source can enter the answer here.
  const seen = new Set();
  return [withDirectFirst[0], ...required, ...withDirectFirst].filter((document) => {
    if (!document?.id || seen.has(document.id)) return false;
    seen.add(document.id);
    return true;
  });
}

function canonicalHydrationKey(document = {}) {
  const canonical = canonicalResultUrl(document.url);
  try {
    const url = new URL(canonical);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function reassociateHydratedDocuments(candidates = [], hydratedDocuments = []) {
  const hydratedByUrl = new Map(hydratedDocuments
    .map((document) => [canonicalHydrationKey(document), document])
    .filter(([key]) => key));
  return candidates.map((document) => {
    const key = canonicalHydrationKey(document);
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
  return yearScore;
}

export function directEvidenceExtract(query, document, plannedEvidence = null) {
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
    .filter((value) => value.length >= 20 && hasCompleteSentenceEnding(value))
    .reduce((extract, passage) => {
      const joined = [extract, passage].filter(Boolean).join(" ");
      return joined.length <= 520 ? joined : extract;
    }, "");
  if (plannedExtract && hasCompleteSentenceEnding(plannedExtract)) return plannedExtract;
  const preferred = new Set(plannedPassages.map((value) => normalize(value)));
  const passages = [document?.summary, document?.content]
    .filter(Boolean)
    .flatMap(splitTextPassages)
    .map(sanitizeLlmEvidenceText)
    .map(stablePublicationText)
    .map((value) => value.replace(/\s+/gu, " ").trim())
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

function forestrySourcePassages(source = {}) {
  return [source.summary, source.answer, source.content]
    .filter(Boolean)
    .flatMap((value) => splitTextPassages(sanitizeLlmEvidenceText(value)))
    .map(normalize)
    .filter(Boolean);
}

function hasForestryComparisonRole(source) {
  const passages = forestrySourcePassages(source);
  const explicitlyExcludesDataSource = (passage) => {
    const hasData = /\b(?:metsa|metsandus|metsainventeerimis)andm\w*/u.test(passage);
    const hasNamedSource = /\b(?:smi|statistilise\s+metsainvent|metsaregis\w*)/u.test(passage);
    const excludesMembership = /\b(?:ei\s+kuulu|pole\s+osa|ei\s+ole\s+(?:osa|allik\w*)|pole\s+(?:osa|allik\w*))/u.test(passage);
    return hasData && hasNamedSource && excludesMembership;
  };
  const deniesPositiveMembership = (passage) => /\b(?:ei\s+(?:utle|kinnita|naita)|ei\s+tahenda)\b[\s\S]{0,180}\b(?:smi|statistilise\s+metsainvent|metsaregis\w*)\b[\s\S]{0,180}\b(?:kuulub|on\s+neist|on\s+(?:uks|üks))/u.test(passage)
    || /\b(?:uksnes|ainult)\s+loetleb\b[\s\S]{0,180}\bmarks[oõ]n\w*/u.test(passage);
  if (passages.some(explicitlyExcludesDataSource) || passages.some(deniesPositiveMembership)) return false;
  return passages.some((passage) => {
    const hasData = /\b(?:metsa|metsandus|metsainventeerimis)andm\w*/u.test(passage);
    const hasSmi = /\b(?:smi|statistilise\s+metsainvent)/u.test(passage);
    const hasRegistry = /\bmetsaregis\w*/u.test(passage);
    const hasUmbrellaOrMultipleSources = /\b(?:katusmoist\w*|mitmel\s+viisil|eri(?:nevate)?\s+andmeallik\w*)/u.test(passage);
    const saysSmiIsOneOfThem = /\b(?:smi|statistilise\s+metsainvent)\w*\s+on\s+neist\s+(?:uks|üks)/u.test(passage)
      || /\b(?:smi|statistilise\s+metsainvent)\w*\s+on\s+(?:uks\s+)?(?:metsa|metsandus|metsainventeerimis)andm\w*\s+(?:allik\w*|osa\w*)/u.test(passage)
      || /\b(?:smi|statistilise\s+metsainvent)\w*\s+kuulub\s+(?:metsa|metsandus|metsainventeerimis)andm\w*(?:\s+hulka)?/u.test(passage)
      || /\b(?:metsa|metsandus|metsainventeerimis)andm\w*\s+hulka\s+kuulub\s+(?:smi|statistilise\s+metsainvent)/u.test(passage);
    const saysSmiAndRegistryAreDistinctSources = hasRegistry && (
      /\b(?:smi|statistilise\s+metsainvent)\w*[\s\S]{0,180}\bmetsaregis\w*[\s\S]{0,100}\b(?:eri|erinevad|erinevate)\s+(?:ametlik(?:ud|e)?\s+)?(?:andme)?allik\w*/u.test(passage)
      || /\bmetsaregis\w*[\s\S]{0,180}\b(?:smi|statistilise\s+metsainvent)\w*[\s\S]{0,100}\b(?:eri|erinevad|erinevate)\s+(?:ametlik(?:ud|e)?\s+)?(?:andme)?allik\w*/u.test(passage)
    );
    return hasData && hasSmi && hasUmbrellaOrMultipleSources && !explicitlyExcludesDataSource(passage)
      && (saysSmiIsOneOfThem || saysSmiAndRegistryAreDistinctSources);
  });
}

function hasSmiNationalRole(source) {
  const passages = forestrySourcePassages(source);
  const smiName = "(?:smi|statistilise\\s+metsainvent)";
  const hasMethod = passages.some((passage) => new RegExp(`\\b${smiName}\\w*\\s+on\\b[\\s\\S]{0,140}\\bvalikuuring\\w*`, "u").test(passage)
    && /\bproovitukk\w*/u.test(passage)
    && /\buleriigil\w*/u.test(passage)
    && /\bstatistilis\w*/u.test(passage)
    && !new RegExp(`\\b${smiName}\\w*\\s+(?:ei\\s+ole|pole)\\b[\\s\\S]{0,140}\\b(?:valikuuring|proovitukk|uleriigil|statistilis)`, "u").test(passage));
  const hasNationalStateChangeAndParcelLimit = passages.some((passage) => new RegExp(`\\b${smiName}\\w*\\s+(?:sobib|annab|kirjeldab|hindab)\\b`, "u").test(passage)
    && /\b(?:eesti\w*|riigi\s+mets\w*|kogu\s+eesti)/u.test(passage)
    && /\bseisundi\w*/u.test(passage)
    && /\bmuutus\w*/u.test(passage)
    && /\bmitte\s+(?:uksiku\s+)?kinnistu\w*/u.test(passage)
    && /\binventeerimis\w*/u.test(passage)
    && !new RegExp(`\\b${smiName}\\w*\\s+(?:ei\\s+sobi|pole\\s+sobiv|ei\\s+anna|ei\\s+kirjelda|ei\\s+hinda)\\b`, "u").test(passage));
  return hasMethod && hasNationalStateChangeAndParcelLimit;
}

function hasForestRegisterRole(source) {
  const passages = forestrySourcePassages(source);
  const registrySubject = "(?:metsaregis\\w*|registri\\s+andmestik)";
  const affirmativeRegistryPredicate = (passage) => new RegExp(`\\b${registrySubject}\\b[\\s\\S]{0,160}\\b(?:sisaldab|koondab|kuuluvad|sobib)\\b`, "u").test(passage)
    && !new RegExp(`\\b${registrySubject}\\b[\\s\\S]{0,160}\\b(?:ei\\s+sisalda|pole\\s+(?:osa|allik))\\b`, "u").test(passage);
  return passages.some((passage) => affirmativeRegistryPredicate(passage)
    && /\binventeerimis\w*/u.test(passage)
    && /\bmetsateatis\w*/u.test(passage))
    && passages.some((passage) => affirmativeRegistryPredicate(passage)
      && /\bkinnistu\w*/u.test(passage)
      && /\b(?:metsaeraldis\w*|eraldis\w*)/u.test(passage));
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
  return safeSourcePassages(source).find((passage) => {
    const text = normalize(passage);
    const measuredText = passage.normalize("NFKC").toLocaleLowerCase("et");
    const hasYear = /\b(?:19|20)\d{2}\b/u.test(text);
    const hasStock = /\b(?:kasvava\s+metsa\s+tagavara|metsa\s+tagavara|metsavaru)\w*/u.test(text);
    const hasStableDirection = /\b(?:stabiil\w*|pusi\w*|muutumat\w*)/u.test(text);
    const hasMeasuredVolume = /\b\d+(?:[.,]\d+)?\s*(?:miljon\w*\s+)?(?:tm\b|tihumeet\w*|m[³3]\b|kuupmeet\w*)/u.test(measuredText);
    return hasYear && hasStock && hasStableDirection && hasMeasuredVolume;
  }) || "";
}

function forestConditionPassage(source) {
  return safeSourcePassages(source).find((passage) => {
    const text = normalize(passage);
    const dimensions = [
      /\bpindala\w*/u,
      /\btagavara\w*/u,
      /\bvanus\w*|vanuselis\w*/u,
      /\bkahjust\w*/u,
      /\belurikk\w*/u,
      /\bkaits\w*/u,
      /\bkliima\w*|risk\w*/u,
    ].filter((pattern) => pattern.test(text)).length;
    return /\bmets\w*/u.test(text) && dimensions >= 3;
  }) || "";
}

// This is a constrained degraded-mode answer, not a hidden knowledge-base
// answer. It is composed only when the visible official result set contains a
// strong direct comparison plus independent SMI-method and registry-role
// evidence. Luna can still replace it after its normal grounding checks.
function composeForestDataSourcesFallback(query, plannedEvidence, sources = [], previousAnswer = {}) {
  if (plannedEvidence?.kind !== "forest-data-sources" || !plannedEvidence?.strong) return null;
  const visibleOfficial = sources.filter((source) => source?.sourceTier === "official" && sourceCitation(source));
  const comparison = visibleOfficial.find((source) => source.id === plannedEvidence.directDocumentId
    && hasForestryComparisonRole(source));
  if (!comparison) return null;
  const smiMethod = visibleOfficial.find((source) => source.id !== comparison.id && hasSmiNationalRole(source));
  const registry = visibleOfficial.find((source) => source.id !== comparison.id
    && source.id !== smiMethod?.id
    && hasForestRegisterRole(source));
  if (!smiMethod || !registry) return null;

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
    intro: "Metsaandmed on mitmel viisil kogutavate metsandusandmete katusmõiste; SMI ei ole metsaandmete sünonüüm. SMI on üleriigiliste proovitükkidega valikuuring, mille põhjal koostatakse statistiliste meetoditega kogu Eesti metsade üldistatud hinnang. SMI sobib riigi metsade seisundi ja muutuste hindamiseks, mitte üksiku kinnistu inventeerimisandmete esitamiseks. Metsaregister sisaldab kinnistute metsainventeerimise andmeid ning lisaks metsateatiste, metsakaitseekspertiiside ja metsauuendusekspertiiside andmeid. Registri andmestik sobib kinnistu- ja metsaeraldisepõhiste andmete vaatamiseks. Nende arvud ei pea kattuma, sest allikatel on erinev eesmärk, katvus ja ajaseis; enne võrdlemist tuleb ühtlustada definitsioon, andmeaasta ja üldkogum.",
    introCitations,
    parts: [
      {
        title: "Metsaandmed",
        text: "Metsaandmed on mitmel viisil kogutavate andmete katusmõiste: SMI ja kinnistute inventeerimisandmeid koondav Metsaregister on eri ametlikud allikad.",
        citations: comparisonCitations,
      },
      {
        title: "SMI roll",
        text: "SMI on üleriigiliste proovitükkidega valikuuring, mille põhjal koostatakse statistiliste meetoditega kogu Eesti metsade üldistatud hinnang.",
        citations: smiCitations,
      },
      {
        title: "Metsaregistri roll",
        text: "Metsaregister sisaldab kinnistute metsainventeerimise andmeid ning lisaks metsateatiste, metsakaitseekspertiiside ja metsauuendusekspertiiside andmeid. Registri andmestik sobib kinnistu- ja metsaeraldisepõhiste andmete vaatamiseks.",
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
  const contextPassage = forestConditionPassage(context);
  if (!areaPassage || !stockPassage || !contextPassage) return null;
  const measurementPassages = [areaPassage, stockPassage].filter((passage, index, passages) => (
    passages.findIndex((candidate) => normalize(candidate) === normalize(passage)) === index
  ));
  const measurementText = measurementPassages.join(" ");
  const contextCitations = uniqueCitations([context]);
  return {
    eyebrow: "Allikapõhine kokkuvõte",
    title: String(previousAnswer.title || query).trim().slice(0, 180),
    intro: `Leitud ametlikud näitajad ei viita sellele, et Eesti mets oleks otsa saamas. ${measurementText} Need mõõtmised kirjeldavad konkreetset andmeaastat, mitte kindlat tulevikuprognoosi. Metsa ökoloogilist seisundit tuleb hinnata eraldi kahjustuste, elurikkuse, kaitse ja kliimariskide kõrval.`,
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
    const text = unique.reduce((result, passage) => {
      const joined = [result, passage].filter(Boolean).join(" ");
      return joined.length <= 680 ? joined : result;
    }, "");
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
    note: String(previousAnswer.note || "").trim().slice(0, 700),
  };
}

// Bare generic forest overview (nt "mets"): mitme ametliku allika süntees
// loobumise asemel. Koostatud ainult nähtavast ametlikust tulemusehulgast
// täpsete väljavõtetega, et väited säilitaksid nähtava tunnistaja.
function composeGenericForestOverviewFallback(query, plannedEvidence, sources = [], previousAnswer = {}) {
  if (plannedEvidence?.kind !== "forest-overview" || !plannedEvidence?.strong) return null;
  const visibleOfficial = sources.filter((source) => source?.sourceTier === "official" && sourceCitation(source));
  const byId = new Map(visibleOfficial.map((source) => [source.id, source]));
  const area = byId.get("forest-area");
  const conditionDoc = byId.get("forest-condition-review");
  const registryView = byId.get("metsainfo-hetkeseis");
  if (!area) return null;
  const areaPassage = forestAreaMeasurementPassage(area) || safeSourcePassages(area)[0] || "";
  const findMethodHit = () => {
    for (const source of visibleOfficial) {
      const hit = safeSourcePassages(source).find((passage) => {
        const text = normalize(passage);
        return /valikuuring/u.test(text) && (/proovitukk|statistil|uleriigil/u.test(text));
      });
      if (hit) return { source, passage: hit };
    }
    return null;
  };
  const methodHit = findMethodHit();
  const methodPassage = methodHit?.passage || "";
  const methodSource = methodHit?.source;
  const findConditionHit = () => {
    for (const source of visibleOfficial) {
      const hit = safeSourcePassages(source).find((passage) => {
        const text = normalize(passage);
        return /elurikk/u.test(text) && /kaits/u.test(text);
      });
      if (hit) return { source, passage: hit };
    }
    return null;
  };
  const conditionHit = findConditionHit();
  const conditionPassage = (conditionDoc && (forestConditionPassage(conditionDoc) || safeSourcePassages(conditionDoc)[0]))
    || conditionHit?.passage
    || "";
  const conditionSource = conditionDoc || conditionHit?.source;
  const registryPassage = registryView
    ? safeSourcePassages(registryView).find((passage) => /eraldi|mitmel viisil|erinev/u.test(normalize(passage)))
      || safeSourcePassages(registryView)[0]
    : "";
  const hasCondition = Boolean(conditionPassage);
  const hasRegistry = Boolean(registryPassage);
  if (!areaPassage || !methodPassage || (!hasCondition && !hasRegistry)) return null;
  const areaCitations = uniqueCitations([area]);
  const methodCitations = uniqueCitations([methodSource].filter(Boolean));
  const conditionCitations = uniqueCitations([conditionSource].filter(Boolean));
  const registryCitations = uniqueCitations([registryView].filter(Boolean));
  const parts = [
    {
      title: "Metsa pindala",
      text: areaPassage,
      citations: areaCitations,
    },
    {
      title: "Kuidas mõõdetakse",
      text: methodPassage,
      citations: methodCitations.length ? methodCitations : areaCitations,
    },
  ];
  if (hasCondition) {
    parts.push({
      title: "Seisundi tervikpilt",
      text: conditionPassage,
      citations: conditionCitations.length ? conditionCitations : areaCitations,
    });
  }
  if (registryPassage && registryCitations.length) {
    parts.push({
      title: "Andmete erinevus",
      text: registryPassage,
      citations: registryCitations,
    });
  }
  return {
    eyebrow: "Allikapõhine kokkuvõte",
    title: "Eesti metsa ei kirjelda üksainus number",
    intro: areaPassage,
    introCitations: areaCitations,
    parts,
    note: String(previousAnswer.note || "").trim().slice(0, 700),
  };
}

function answerEvidenceDocuments(documents = [], plannedEvidence, forestBalance) {
  if (forestBalance || !plannedEvidence?.strong) return documents;
  if (plannedEvidence.kind === "forest-data-sources") {
    const direct = documents.find((document) => document.id === plannedEvidence.directDocumentId);
    const smiMethod = documents.find((document) => document.id !== direct?.id && hasSmiNationalRole(document));
    const registry = documents.find((document) => document.id !== direct?.id
      && document.id !== smiMethod?.id
      && hasForestRegisterRole(document));
    const comparisonSet = [direct, smiMethod, registry].filter(Boolean);
    if (comparisonSet.length === 3) return comparisonSet;
  }
  const ids = [...new Set([
    plannedEvidence.directDocumentId,
    ...(plannedEvidence.supportingDocumentIds || []),
  ].filter(Boolean))];
  const byId = new Map((documents || []).map((document) => [document.id, document]));
  const selected = ids.map((id) => byId.get(id)).filter(Boolean);
  const chosen = selected.length ? selected : documents;
  if (plannedEvidence.kind !== "forest-area-method" || !plannedEvidence.strong) return chosen;
  // Limit every downstream consumer—including the optional model and the
  // visible citation excerpt—to the two passages selected for this composite
  // question. The cited source may contain stock and harvest figures elsewhere,
  // but those facts were not requested and cannot enter this answer pack.
  return chosen.map((document) => {
    const passages = distinctPassages(plannedEvidence.passagesByDocument?.[document.id] || []);
    if (!passages.length) return document;
    const { answer: _answer, ...projected } = document;
    const evidenceText = passages.join(" ");
    return {
      ...projected,
      summary: evidenceText,
      content: evidenceText,
    };
  });
}

function boundedEvidenceExcerpt(passages = []) {
  const seen = new Set();
  const sanitized = passages
    .map(sanitizeLlmEvidenceText)
    .map((value) => value.replace(/\s+/gu, " ").trim())
    .filter((value) => value.length >= 20)
    .map((value) => hasCompleteSentenceEnding(value) ? value : `${value}.`)
    .map((value) => `${value.charAt(0).toLocaleUpperCase("et")}${value.slice(1)}`)
    .filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return sanitized.reduce((result, passage) => {
    const joined = [result, passage].filter(Boolean).join(" ");
    return joined.length <= 900 ? joined : result;
  }, "");
}

function answerCitationNumbers(answer = {}) {
  return new Set([
    ...(answer.introCitations || []),
    ...(answer.parts || []).flatMap((part) => part.citations || []),
  ].map(Number).filter(Number.isFinite));
}

function answerClaimForCitation(answer = {}, citation) {
  return [
    (answer.introCitations || []).map(Number).includes(citation) ? answer.intro : "",
    ...(answer.parts || []).flatMap((part) => (
      (part.citations || []).map(Number).includes(citation) ? [part.title, part.text] : []
    )),
  ].filter(Boolean).join(" ");
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
  const roots = queryTerms(claim);
  const matchedRoots = roots.filter((root) => textHasQueryRoot(witness, root));
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

function claimHasVisibleWitness(claim, witness, relationshipClaim = claim) {
  const passages = (Array.isArray(witness) ? witness : [witness])
    .flatMap(splitTextPassages)
    .filter(Boolean);
  const relationshipWitness = relationshipClaimHasPassageWitness(relationshipClaim, passages);
  if (relationshipWitness === false) return false;
  const joinedWitness = passages.join(" ");
  const coverage = claimWitnessCoverage(claim, joinedWitness);
  if (coverage.matchedNumbers.length !== coverage.expectedNumbers.length) return false;
  if (!coverage.roots.length) return true;
  const requiredRoots = coverage.roots.length <= 2
    ? coverage.roots.length
    : Math.max(2, Math.ceil(coverage.roots.length * 0.4));
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
    if (!without.length || !supports(without)) continue;
    const uniquelySupportsProposition = propositionUnits.some((unit) => (
      supports([citation], unit) && !supports(without, unit)
    ));
    if (!uniquelySupportsProposition) retained = without;
  }
  return retained.length && supports(retained) ? retained : [];
}

function visibleClaimCitations(claim, sourcesByCitation) {
  const supportCache = new Map();
  const supports = (citations, proposition = claim) => {
    const cacheKey = `${citations.join(",")}:${proposition.text}:${proposition.relationshipText}`;
    if (supportCache.has(cacheKey)) return supportCache.get(cacheKey);
    const witnesses = citations
      .map((citation) => sourcesByCitation.get(citation)?.evidenceExcerpt || "")
      .filter(Boolean);
    const supported = witnesses.length > 0
      && claimHasVisibleWitness(proposition.text, witnesses, proposition.relationshipText);
    supportCache.set(cacheKey, supported);
    return supported;
  };
  const propositionUnits = splitTextPassages(claim.propositionText || claim.relationshipText || claim.text)
    .filter(hasCompleteSentenceEnding)
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
  }, sourcesByCitation);
  const parts = (draft.answer?.parts || []).map((part) => {
    const partText = String(part.text || "").trim();
    const citations = visibleClaimCitations({
      text: [part.title, partText].filter(Boolean).join(" ").trim(),
      relationshipText: partText,
      propositionText: partText,
      citations: (part.citations || []).map(Number).filter(Number.isFinite),
    }, sourcesByCitation);
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

function claimCoveringPassages(claim, passages = [], relationshipClaim = claim) {
  const remaining = passages.map((passage, index) => ({ passage, index }));
  const selected = [];
  let witness = "";
  while (remaining.length && selected.length < 8 && !claimHasVisibleWitness(claim, witness, relationshipClaim)) {
    const before = claimWitnessCoverage(claim, witness);
    const ranked = remaining.map((candidate) => {
      const combined = [witness, candidate.passage].filter(Boolean).join(" ");
      const after = claimWitnessCoverage(claim, combined);
      const numberGain = after.matchedNumbers.length - before.matchedNumbers.length;
      const rootGain = after.matchedRoots.length - before.matchedRoots.length;
      return {
        ...candidate,
        gain: numberGain * 100 + rootGain * 10 + passageQueryCoverage(claim, candidate.passage),
      };
    }).sort((left, right) => right.gain - left.gain || left.index - right.index);
    const best = ranked[0];
    if (!best || best.gain <= 0) break;
    selected.push(best.passage);
    witness = [witness, best.passage].filter(Boolean).join(" ");
    const removeIndex = remaining.findIndex((candidate) => candidate.index === best.index);
    remaining.splice(removeIndex, 1);
  }
  return selected;
}

function answerClaimsHaveVisibleWitnesses(draft = {}) {
  const sourcesByCitation = new Map((draft.sources || []).map((source) => [Number(source.citation), source]));
  return answerClaims(draft.answer).every((claim) => {
    const witnesses = claim.citations
      .map((citation) => sourcesByCitation.get(citation)?.evidenceExcerpt || "")
      .filter(Boolean);
    return witnesses.length > 0
      && claimHasVisibleWitness(claim.text, witnesses, claim.relationshipText);
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
    && claimHasVisibleWitness(claim.text, witnesses, claim.relationshipText || claim.text);
}

function finalizeVisibleAnswerWitnesses(draft, query, plannedEvidence) {
  const attached = rebindAnswerCitationsToVisibleWitnesses(
    attachEvidenceExcerpts(draft, query, plannedEvidence),
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
  return attachEvidenceExcerpts(reduced, query, plannedEvidence);
}

function attachEvidenceExcerpts(draft, _query, plannedEvidence) {
  const usedCitations = answerCitationNumbers(draft?.answer);
  const claims = answerClaims(draft?.answer);
  return {
    ...draft,
    sources: (draft.sources || []).map((source) => {
      if (!usedCitations.has(Number(source.citation))) return source;
      const plannedPassages = plannedEvidence?.passagesByDocument?.[source.id] || [];
      const claimText = answerClaimForCitation(draft.answer, Number(source.citation));
      const sourcePassages = distinctPassages([...plannedPassages, ...safeSourcePassages(source)]);
      const sourceClaims = claims.filter((claim) => claim.citations.includes(Number(source.citation)));
      const claimPassages = distinctPassages(sourceClaims.flatMap((claim) => (
        claimCoveringPassages(claim.text, sourcePassages, claim.relationshipText)
      )));
      // The deterministic planner already returns passages in explanatory
      // order. Preserve that order for its accepted draft; the claim-ranked
      // passages become authoritative when rebinding a later model answer.
      const primaryPassages = plannedPassages.length
        ? distinctPassages(plannedPassages)
        : claimPassages;
      const selectedKeys = new Set([...primaryPassages, ...claimPassages].map(normalize));
      const fallbackPassages = sourcePassages
        .filter((passage) => !selectedKeys.has(normalize(passage)))
        .map((passage, index) => ({
          passage,
          index,
          coverage: passageQueryCoverage(claimText, passage),
        }))
        .sort((left, right) => right.coverage - left.coverage || left.index - right.index)
        .map((candidate) => candidate.passage);
      const evidenceExcerpt = boundedEvidenceExcerpt([
        ...primaryPassages,
        ...claimPassages,
        ...fallbackPassages,
      ]);
      return evidenceExcerpt ? { ...source, evidenceExcerpt } : source;
    }),
  };
}

export function publicResponse(draft, { now = Date.now() } = {}) {
  const { evidence: _evidence, ...response } = draft;
  const sources = (Array.isArray(response.sources) ? response.sources : [])
    .filter((source) => officialCitationUrlEligibility(source?.url).eligible)
    .map((source) => {
      if (source.actionUrl === undefined || officialCitationUrlEligibility(source.actionUrl).eligible) return source;
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
  if (!validCitationShape
    || !validAnswerCitations
    || !citationsResolveExactlyOnce
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
      introCitations: compactCitations(answer.introCitations),
      parts: answerParts.map((part) => ({
        ...part,
        citations: compactCitations(part.citations),
      })),
    } : answer,
    sources: visibleSources.map((source, index) => {
      const publicKeys = [
        "id", "citation", "title", "organization", "type", "published", "url", "evidenceExcerpt", "locator", "actionUrl", "actionLabel", "tags", "sourceTier",
      ];
      if (!source.evidenceExcerpt) publicKeys.splice(7, 0, "summary");
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
    && ["ranked-search-results", "reviewed-official-source"].includes(draft?.evidence?.kind)
    && draft?.evidence?.answerable === true,
  );
}

export function mergeRelatedQuestions(generated = [], reviewed = [], limit = 6) {
  const seen = new Set();
  return [...generated, ...reviewed]
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
  clientKey = "unknown",
} = {}) {
  throwIfRequestAborted(signal);
  const listing = searchResults || await prepareRankedSearchResults(retrievalQuery, {
    page: 1,
    pageSize: 12,
    deadlineAt,
    signal,
    clientKey,
  });
  const candidates = conventionalEvidenceDocumentsFromListing(listing);
  // Route-only federated cards stay visible as discovery results but cannot
  // become answer evidence. Hydrate only independently eligible sources so a
  // search never spends six page requests on cards discarded immediately.
  const ranked = rankPortalDocuments(retrievalQuery, candidates);
  const hydrationBudget = remainingBudget(deadlineAt, 7_000);
  const answerCandidates = ranked.slice(0, 10);
  const hydratedTop = hydrationBudget >= 500
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
  const reranked = rankPortalDocuments(retrievalQuery, eligibleHydrated);
  const forestBalance = composeForestHarvestBalanceAnswer(retrievalQuery, reranked, query);
  const conventionalQuality = assessEvidence(retrievalQuery, reranked);
  const plannedEvidence = selectAnswerEvidence(retrievalQuery, reranked);
  const quality = plannedEvidence?.strong
    ? {
      ...conventionalQuality,
      strong: true,
      directDocumentId: plannedEvidence.directDocumentId,
      answerIntent: plannedEvidence.kind,
      supportingDocumentIds: plannedEvidence.supportingDocumentIds,
    }
    : plannedEvidence?.kind === "forest-area-method"
      ? {
        ...conventionalQuality,
        strong: false,
        directDocumentId: null,
        answerIntent: plannedEvidence.kind,
        supportingDocumentIds: [],
      }
    : conventionalQuality;
  const allPlannedAnswerDocuments = answerEvidenceDocuments(reranked, plannedEvidence, forestBalance);
  const compositeRequiredIds = plannedEvidence?.kind === "forest-area-method"
    && !plannedEvidence.strong
    ? new Set(forestryIntentServiceDocumentIds(retrievalQuery))
    : null;
  const plannedAnswerDocuments = compositeRequiredIds
    ? allPlannedAnswerDocuments.filter((document) => compositeRequiredIds.has(document?.id))
    : allPlannedAnswerDocuments;
  const compositeNavigationDocuments = plannedEvidence?.kind === "forest-area-method"
    && !plannedEvidence.strong
    ? (listing?.items || []).filter((document) => document?.id === "forest-overview").slice(0, 1)
    : [];
  const seenAnswerDocuments = new Set();
  const answerDocuments = [...compositeNavigationDocuments, ...plannedAnswerDocuments]
    .filter((document) => {
      const key = canonicalResultUrl(document?.url) || document?.id;
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
    answerable: Boolean(forestBalance) || quality.strong,
    clarification: forestBalance || quality.strong
      ? null
      : plannedEvidence?.reason === "national-area-method-evidence-required"
        ? "Leitud allikad ei kata korraga Eesti metsamaa pindala ja selle statistilist mõõtmismeetodit. Seetõttu ei esita ma osalist arvvastust; ava ametlik ülevaade või proovi uuesti."
      : "Leitud allikad ei kata küsimust piisavalt täpselt. Lisa konkreetne objekt, näitaja, piirkond või aasta.",
    evidenceKind: forestBalance
      ? "structured-forest-balance"
      : quality.strong ? "ranked-search-results" : "insufficient-evidence",
    limit: 10,
    quality,
    total: Number(listing.total || reranked.length),
  });
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
  return draft.evidence?.answerable === true
    ? finalizeVisibleAnswerWitnesses(draft, retrievalQuery, plannedEvidence)
    : attachEvidenceExcerpts(draft, retrievalQuery, plannedEvidence);
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
      url: canonicalResultUrl(item.url),
      title: item.title,
      organization: item.organization,
      type: item.type,
      summary: item.summary,
      answer: item.answer,
      content: item._contentHash || item.content,
      locator: item.locator,
      actionUrl: item.actionUrl ? canonicalResultUrl(item.actionUrl) : null,
      actionLabel: item.actionLabel,
      published: item.published,
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
    !officialCitationUrlEligibility(source?.url).eligible
    || (source?.actionUrl !== undefined && !officialCitationUrlEligibility(source.actionUrl).eligible)
  ))) return false;
  if (!listing?.items?.length || !cached?.sources?.length) return true;
  const urls = new Set(listing.items.map((item) => canonicalResultUrl(item.url)));
  return cached.sources.every((source) => urls.has(canonicalResultUrl(source.url)));
}

function draftSourcesBelongToListing(draft, listing) {
  if (!draft?.sources?.length) return true;
  const urls = new Set((listing?.items || []).map((item) => canonicalResultUrl(item.url)));
  return draft.sources.every((source) => urls.has(canonicalResultUrl(source.url)));
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
    const cached = await readSearchCache(cleanQuery, cacheRevision);
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
      );
      draft = composeSearchResponse(cleanQuery, filteredDocuments, {
        answerable: false,
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
    });
  }
  if (!draftMatchesListingAndFilters(draft, searchResults, filters)) {
    const filteredDocuments = rankPortalDocuments(
      retrievalQuery,
      conventionalEvidenceDocumentsFromListing(searchResults)
        .filter((document) => resultMatchesFilters(document, filters)),
    );
    draft = composeSearchResponse(cleanQuery, filteredDocuments, {
      answerable: false,
      clarification: "Valitud filtrid välistavad vastuse jaoks vajaliku tõendi või see puudub nähtavast tulemusehulgast. Lähtesta filter või täpsusta päringut.",
      evidenceKind: "filtered-source-exclusion",
      limit: 6,
      total: Number(searchResults?.total || filteredDocuments.length),
    });
  }
  throwIfRequestAborted(signal);
  draft.generatedAt = new Date().toISOString();
  const canGenerate = shouldGenerateGroundedAnswer(draft);
  const llmBudget = remainingBudget(deadlineAt, 300);
  if (canGenerate && llmBudget >= 500 && typeof onDraft === "function") {
    throwIfRequestAborted(signal);
    onDraft(publicResponse(withForestContextChart(withLandUseShareChart(draft, retrievalQuery, searchResults?.items, { now: startedAt }), retrievalQuery, searchResults?.items, { now: startedAt }), { now: startedAt }));
  }
  // Keep the accepted deterministic result detached from both the provider
  // input and any streamed consumer. A ready model answer must rebind its
  // visible citation witnesses before it can replace this snapshot.
  const deterministicDraft = structuredClone(draft);
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
    })
    : { answer: null, status: "not-applicable", provider: "deterministic-current-evidence" };
  throwIfRequestAborted(signal);

  if (llmResult.answer) {
    const modelDraft = rebindAnswerCitationsToVisibleWitnesses(attachEvidenceExcerpts({
      ...structuredClone(deterministicDraft),
      answer: structuredClone(llmResult.answer),
    }, retrievalQuery, null));
    // Validation proves that a model claim is grounded in the internal
    // evidence pack. This second boundary proves that the same claim is also
    // supported by the bounded excerpt a reader can actually inspect.
    draft = answerClaimsHaveVisibleWitnesses(modelDraft) ? modelDraft : deterministicDraft;
  } else {
    draft = deterministicDraft;
  }
  // Related-question links are reviewed product copy, not answer content. A
  // model may still emit the legacy schema field, but untrusted evidence must
  // never turn that uncited field into public navigation or hidden-prompt text.
  draft.related = mergeRelatedQuestions([], draft.related, 6);
  draft.generatedAt = new Date().toISOString();
  draft = withForestContextChart(withLandUseShareChart(draft, retrievalQuery, searchResults?.items, { now: startedAt }), retrievalQuery, searchResults?.items, { now: startedAt });
  const response = publicResponse(draft, { now: startedAt });
  const durationMs = Date.now() - startedAt;
  const evidenceKind = draft.evidence?.kind;
  const spatialDegraded = evidenceKind === "official-spatial-snapshot"
    && Object.values(draft.evidence?.states || {}).some((state) => state === "unavailable");
  const structuredStale = evidenceKind === "structured-forest-balance"
    && draft.sources.some((source) => source._stale === true);
  const cacheResponse = llmResult.status !== "ready" && (
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

  if (requestCanStillPersist({ signal, deadlineAt })) {
    await retainSearchPersistence(recordSearch({
      query: cleanQuery,
      response,
      cacheValue: draft,
      revision: cacheRevision,
      answerProvider: llmResult.provider,
      answerStatus: llmResult.status,
      documentIds: draft.evidence?.documentIds || [],
      durationMs,
      ttlMinutes,
      cacheResponse: listingBackedCache && cacheResponse,
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
    );
    return publicResponse(composeSearchResponse(cleanQuery, visible, {
      answerable: false,
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
  draft.answer.note = ranked.length
    ? capacityLimited
      ? "Proovi otsingut paari sekundi pärast uuesti."
      : sourceUnavailable
      ? "Juba leitud ametlikud allikad on kuvatud allpool, kuid ajutise vea järel neist uut faktivastust ei koostatud. Proovi otsingut uuesti."
      : "Juba leitud ametlikud allikad on kuvatud allpool, kuid neist ei koostatud ajapiiri järel uut faktivastust. Proovi otsingut uuesti."
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
    && isSafeEllipticalFollowUp(cleanQuery)
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
