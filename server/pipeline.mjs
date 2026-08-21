import { createHash } from "node:crypto";
import { readSearchCache, recordSearch } from "./database.mjs";
import { answerCadastreQuestion } from "./cadastre.mjs";
import {
  hydrateOfficialDocuments,
} from "./integrations.mjs";
import { generateGroundedAnswer, sanitizeLlmEvidenceText } from "./llm.mjs";
import { composeForestHarvestBalanceAnswer } from "./indicators.mjs";
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
  forestryIntentServiceDocumentIds,
  hasCompleteSentenceEnding,
  normalize,
  queryTerms,
  splitTextPassages,
  textHasQueryRoot,
} from "./search.mjs";

export const SEARCH_RESPONSE_REVISION = "answer-v29-forestry-evidence-locator";
const DEFAULT_SEARCH_DEADLINE_MS = 15_000;

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
  return [source.summary, source.content]
    .filter(Boolean)
    .flatMap((value) => splitTextPassages(sanitizeLlmEvidenceText(value)))
    .map((value) => value.replace(/\s+/gu, " ").trim())
    .filter((value) => value.length >= 20 && hasCompleteSentenceEnding(value));
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
  const registryCitations = uniqueCitations([registry]);
  const introCitations = uniqueCitations([comparison, smiMethod, registry]);
  return {
    eyebrow: "Allikapõhine kokkuvõte",
    title: String(previousAnswer.title || query).trim().slice(0, 180),
    intro: "Metsaandmed on mitmel viisil kogutavate metsandusandmete katusmõiste; SMI ei ole metsaandmete sünonüüm. SMI on üleriigiline proovitükkidel põhinev statistiline valikuuring Eesti metsade seisundi ja muutuste hindamiseks, mitte üksiku kinnistu inventeerimisandmete esitamiseks. Metsaregister koondab kinnistu- ja metsaeraldisepõhiseid inventeerimisandmeid ning metsateatisi. Nende arvud ei pea kattuma, sest allikatel on erinev eesmärk, katvus ja ajaseis; enne võrdlemist tuleb ühtlustada definitsioon, andmeaasta ja üldkogum.",
    introCitations,
    parts: [
      {
        title: "Metsaandmed",
        text: "Metsaandmed hõlmavad eri kogumisviise ja andmeallikaid; SMI on neist üks, mitte kogu mõiste ega Metsaregistri teine nimi.",
        citations: comparisonCitations,
      },
      {
        title: "SMI roll",
        text: "SMI annab proovitükkidel põhineva statistilise hinnangu Eesti metsade seisundile ja muutustele ning ei ole üksiku kinnistu inventeerimisvaade.",
        citations: smiCitations,
      },
      {
        title: "Metsaregistri roll",
        text: "Metsaregister koondab kinnistu- ja metsaeraldisepõhiseid inventeerimisandmeid ning metsateatisi.",
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

function passageTokenSet(value) {
  return new Set(normalize(value).split(" ").filter((token) => token.length >= 4));
}

function passagesAreNearDuplicates(left, right) {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true;
  const leftTokens = passageTokenSet(left);
  const rightTokens = passageTokenSet(right);
  const smaller = Math.min(leftTokens.size, rightTokens.size);
  if (smaller < 5) return false;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / smaller >= 0.72;
}

function distinctPassages(passages = []) {
  const distinct = [];
  for (const passage of passages) {
    if (!distinct.some((candidate) => passagesAreNearDuplicates(candidate, passage))) distinct.push(passage);
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
  const queryRoots = queryTerms(query);
  const evidenceTerms = (plannedEvidence.evidenceGroups || []).flatMap((group) => group).map(normalize).filter(Boolean);
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
    const selectedKeys = new Set(selectedPassages.map(normalize));
    const selectedLength = selectedPassages.join(" ").length;
    // Methodology and time-series answers must remain exactly traceable to the
    // passages the evidence planner selected. Pulling extra same-document
    // sentences used to append unrelated forest-area or harvesting facts
    // merely because those sentences repeated a query word.
    const supplementaryLimit = ["increment-method", "clearcut-over-time"].includes(plannedEvidence.kind)
      ? 0
      : selectedLength < 240 ? 2 : selectedLength < 480 ? 1 : 0;
    const supplementary = safeSourcePassages(source)
      .filter((passage) => !selectedKeys.has(normalize(passage)))
      .filter((passage) => !(/\blagerai\w*|keskkonnamoju\w*/u.test(normalize(passage))
        && !/\blagerai\w*|keskkonnamoju\w*/u.test(normalize(query))))
      .map((passage, index) => ({
        passage,
        index,
        score: queryRoots.filter((root) => textHasQueryRoot(passage, root)).length * 18
          + evidenceTerms.filter((term) => normalize(passage).includes(term)).length * 8
          + (/\d/u.test(passage) && /\b(?:kui|mitu|palju|protsent|aasta)\w*\b/u.test(normalize(query)) ? 8 : 0),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, supplementaryLimit)
      .map((candidate) => candidate.passage);
    const unique = distinctPassages([...selectedPassages, ...supplementary]);
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

export function publicResponse(draft) {
  const { evidence: _evidence, ...response } = draft;
  return {
    ...response,
    sources: (response.sources || []).map((source) => ({
      ...Object.fromEntries([
        "id", "citation", "title", "organization", "type", "published", "url", "summary", "locator", "tags", "sourceTier",
      ].filter((key) => source[key] !== undefined).map((key) => [key, source[key]])),
      id: stablePublicResultId(source),
    })),
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
  const candidates = evidenceDocumentsFromListing(listing);
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
  const hydratedById = new Map(hydratedTop.map((document) => [document.id, document]));
  const hydrated = answerCandidates.map((document) => hydratedById.get(document.id) || document);
  const eligibleHydrated = evidenceDocumentsFromListing({ items: hydrated });
  const reranked = rankPortalDocuments(retrievalQuery, eligibleHydrated);
  const forestBalance = composeForestHarvestBalanceAnswer(retrievalQuery, reranked);
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
    : conventionalQuality;
  const direct = quality.strong
    ? reranked.find((document) => document.id === quality.directDocumentId)
    : null;
  const directCitation = direct
    ? reranked.findIndex((document) => document.id === direct.id) + 1
    : 0;
  const draft = composeSearchResponse(query, reranked, {
    answerable: Boolean(forestBalance) || quality.strong,
    clarification: forestBalance || quality.strong
      ? null
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
    draft.evidence.answerable = true;
  }
  const forestDataSourcesFallback = !forestBalance
    ? composeForestDataSourcesFallback(query, plannedEvidence, draft.sources, draft.answer)
    : null;
  const forestDepletionFallback = !forestBalance && !forestDataSourcesFallback
    ? composeForestDepletionFallback(query, plannedEvidence, draft.sources, draft.answer)
    : null;
  const officialForestryFallback = !forestBalance && !forestDataSourcesFallback && !forestDepletionFallback
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
  } else if (officialForestryFallback) {
    draft.answer = officialForestryFallback;
    draft.evidence.syntheticFallback = "official-forestry-evidence";
  } else if (directExtract) {
    draft.answer.eyebrow = "Allikapõhine kokkuvõte";
    draft.answer.intro = directExtract;
    draft.answer.introCitations = [directCitation];
  }
  return draft;
}

export function searchListingRevision(listing = {}) {
  const records = (listing.items || []).map((item) => [
    canonicalResultUrl(item.url),
    String(item.title || ""),
    String(item.summary || ""),
    String(item.locator || ""),
    String(item.published || ""),
    String(item.sourceTier || ""),
    String(item._contentHash || item.content || ""),
  ]);
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

export function cachedSourcesBelongToListing(cached, listing) {
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
  generateAnswer = generateGroundedAnswer,
}) {
  throwIfRequestAborted(signal);
  const assessment = assessSearchQuery(assessmentQuery);
  // Out-of-scope and private-person requests are never cache keys, database
  // telemetry, or model/retrieval inputs. Keep this defensive boundary before
  // even a cache read so legacy rows cannot bypass the current classifier.
  if (assessment.kind === "out-of-scope") {
    return publicResponse(composeScopeResponse(cleanQuery, assessment));
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
      return cached;
    }
  }

  let draft;
  if (assessment.kind !== "answerable") {
    draft = composeScopeResponse(cleanQuery, assessment);
    if (searchResults && !draftSourcesBelongToListing(draft, searchResults)) {
      const filteredDocuments = rankPortalDocuments(retrievalQuery, evidenceDocumentsFromListing(searchResults));
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
  throwIfRequestAborted(signal);
  draft.generatedAt = new Date().toISOString();
  const canGenerate = shouldGenerateGroundedAnswer(draft);
  const llmBudget = remainingBudget(deadlineAt, 300);
  if (canGenerate && llmBudget >= 500 && typeof onDraft === "function") {
    throwIfRequestAborted(signal);
    onDraft(publicResponse(draft));
  }
  const llmResult = canGenerate && llmBudget >= 500
    ? await generateAnswer(cleanQuery, draft, {
      timeoutMs: llmBudget,
      signal,
      conversationContext,
      clientKey: llmClientKey,
    })
    : { answer: null, status: "not-applicable", provider: "deterministic-current-evidence" };
  throwIfRequestAborted(signal);

  if (llmResult.answer) draft.answer = llmResult.answer;
  if (llmResult.related?.length) draft.related = mergeRelatedQuestions(llmResult.related, draft.related, 6);
  draft.generatedAt = new Date().toISOString();
  const response = publicResponse(draft);
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
    || (evidenceKind === "structured-forest-balance" && !structuredStale)
    || (evidenceKind === "official-spatial-snapshot" && !spatialDegraded)
  );
  const ttlMinutes = ["official-live-routing", "structured-forest-balance"].includes(evidenceKind) ? 5 : 20;

  if (requestCanStillPersist({ signal, deadlineAt })) {
    void recordSearch({
      query: cleanQuery,
      response,
      revision: cacheRevision,
      answerProvider: llmResult.provider,
      answerStatus: llmResult.status,
      documentIds: draft.evidence?.documentIds || [],
      durationMs,
      ttlMinutes,
      cacheResponse: listingBackedCache && cacheResponse,
      signal,
      deadlineAt,
    }).catch(() => undefined);
  }
  return response;
}

export function searchTimeoutFallback(cleanQuery, {
  assessmentQuery = cleanQuery,
  searchResults,
  reason = "deadline",
} = {}) {
  const assessment = assessSearchQuery(assessmentQuery);
  if (assessment.kind !== "answerable") return publicResponse(composeScopeResponse(cleanQuery, assessment));
  const sourceUnavailable = reason === "source-error";
  const capacityLimited = reason === "capacity";
  const ranked = searchResults?.items?.length
    ? rankPortalDocuments(assessmentQuery, evidenceDocumentsFromListing(searchResults))
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
  return publicResponse(draft);
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
    if (typeof onBackgroundCleanup === "function") onBackgroundCleanup(cleanup);
    return typeof fallback === "function" ? fallback() : fallback;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchEnvironmentLive(query, options = {}) {
  const startedAt = Number(options.startedAt) || Date.now();
  const queryInput = canonicalizePublicSearchQuery(query);
  if (queryInput.reason === "empty") return composeSearchResponse("", [], { limit: 3, total: 0 });
  const directAssessment = assessSearchQuery(queryInput.ok ? queryInput.query : query);
  if (!queryInput.ok) {
    return publicResponse(composeScopeResponse(queryInput.ok ? queryInput.query : "", directAssessment));
  }
  const cleanQuery = queryInput.query;
  const assessmentInput = canonicalizePublicSearchQuery(options.assessmentQuery ?? cleanQuery);
  const retrievalInput = canonicalizePublicSearchQuery(options.retrievalQuery ?? cleanQuery);
  if (!assessmentInput.ok || !retrievalInput.ok) {
    const rejectedValue = !assessmentInput.ok ? options.assessmentQuery : options.retrievalQuery;
    return publicResponse(composeScopeResponse("", assessSearchQuery(rejectedValue)));
  }
  const contextualAssessment = assessSearchQuery(assessmentInput.query);
  const validatedEllipticalFollowUp = options.allowSafeEllipticalFollowUp === true
    && directAssessment.kind === "out-of-scope"
    && isSafeEllipticalFollowUp(cleanQuery)
    && contextualAssessment.kind === "answerable";
  if (directAssessment.kind === "out-of-scope" && !validatedEllipticalFollowUp) {
    return publicResponse(composeScopeResponse(cleanQuery, directAssessment));
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
