import { assessEvidence, rankedSetCoversSubject } from "./search_evidence.mjs";
import { SEARCH_DOCUMENTS } from "./search_catalogue.mjs";
import { rankDocuments } from "./search_ranking.mjs";
import { composeScopeResponse, composeSearchResponse } from "./search_response.mjs";
import { assessSearchQuery } from "./search_query_assessment.mjs";
import { canonicalizePublicSearchQuery } from "./search_query_canonicalization.mjs";
import {
  containsPrivatePersonLookup,
  minimizePublicProviderQuery,
} from "./search_query_privacy.mjs";
import {
  STOP_WORDS,
  bridgeTermsToDiscoveryQuery,
  forestEvidenceIntent,
  normalize,
  queryTerms,
  rootIsDomain,
  russianKeywordRoots,
} from "./search_query_terms.mjs";

const DISCOVERY_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "anna",
  "hetkel",
  "koige",
  "millal",
  "millest",
  "minu",
  "oleks",
  "praegune",
  "praegused",
  "selgita",
  "teada",
  "tohib",
  "lubatud",
]);

function discoveryTerm(word) {
  const normalized = normalize(word);
  if (normalized.startsWith("suplusve")) return "suplusvee";
  if (normalized.startsWith("reove") || normalized.startsWith("heitve")) return "reovesi";
  if (normalized.startsWith("mereprug")) return "mereprügi";
  if (normalized.startsWith("rohevorg")) return "rohevõrgustik";
  if (normalized.startsWith("voorliig") || normalized.startsWith("invasiiv")) return "võõrliigid";
  if (normalized.startsWith("margal") || normalized.startsWith("rab") || /^soo(?:d|s|st|de|del|des)?$/u.test(normalized)) return "märgalad";
  if (normalized.startsWith("jaatmekaitluskoh")) return "jäätmekäitluskohad";
  if (normalized.startsWith("autorehv") || normalized.startsWith("rehv")) return "rehvide";
  if (normalized.startsWith("polet")) return "põletamine";
  if (normalized.startsWith("jaat")) return "jäätmed";
  if (normalized.startsWith("ohukval")) return "õhukvaliteet";
  if (normalized.startsWith("pohjave")) return "põhjavesi";
  if (normalized.startsWith("metsastat")) return "metsastatistika";
  return word.toLocaleLowerCase("et");
}

export function buildDiscoveryQuery(query) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok
    || containsPrivatePersonLookup(query)
    || containsPrivatePersonLookup(canonicalInput.query)) return "";
  const providerQuery = minimizePublicProviderQuery(query);
  if (!providerQuery) return "";
  const words = providerQuery.match(/[\p{L}\p{N}:-]+/gu) || [];
  const terms = words
    .filter((word) => {
      const normalized = normalize(word);
      return (/^\d{4}$/u.test(normalized) || normalized.length >= 3)
        && !DISCOVERY_STOP_WORDS.has(normalized);
    })
    .map(discoveryTerm);
  return [...new Set(terms)].slice(0, 7).join(" ");
}


// Some short forestry questions lose their actual information need during
// stemming: "Kui palju metsa?" used to become only "mets" and
// "SMI ja metsaandmed" did not retain that it is a comparison of data
// sources. Keep these as small, explicit retrieval intents. They do not add
// facts or bypass live retrieval; they only select better official queries
// and later require a matching passage before an answer may be generated.


export function buildDiscoveryQueries(query, limit = 3) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok) return [];
  const acceptedQuery = canonicalInput.query;
  // Foreign-script queries fail the provider residual gate, so translate
  // intent into Estonian discovery terms via the keyword bridge instead.
  // Privacy gates already ran on the raw text before retrieval. Only
  // bridge-carrying queries may translate: this preserves the established
  // foreign-script selector path (e.g. 'Emajõe veeandmed 中文'), and a bare
  // sorting verb with no waste word still fails closed via empty bridge.
  // A private-person clause anywhere in the raw query poisons the whole
  // translation: 'лес; Где живёт Иван Петров' must yield zero discovery
  // terms, not ['mets']. The retrieval pipeline re-checks before dispatch,
  // but discovery terms must never be derived from an attack query at all.
  if (containsPrivatePersonLookup(query)) return [];
  const bridgeRoots = russianKeywordRoots(query);
  if (bridgeRoots.length && !buildDiscoveryQuery(acceptedQuery)) {
    // The bridge must carry a domain root, not just a bare sorting verb:
    // 'сортировка' alone stays out-of-scope and must not reach providers.
    if (!bridgeRoots.some(rootIsDomain)) return [];
    const translated = bridgeTermsToDiscoveryQuery(bridgeRoots);
    if (translated) return [translated];
    return [];
  }
  const base = buildDiscoveryQuery(acceptedQuery);
  if (!base) return [];
  const words = base.match(/[\p{L}\p{N}:-]+/gu) || [];
  const roots = queryTerms(acceptedQuery);
  const forestryIntent = forestEvidenceIntent(acceptedQuery);
  const expanded = [];
  if (roots.includes("mets") && roots.some((root) => ["noor", "vanus", "muutus"].includes(root))) {
    expanded.push("mets vanus");
  }
  if (roots.includes("raie") && roots.includes("tulevik")) {
    expanded.push("raiuda tulevikus");
  }
  if (roots.includes("mets") && roots.includes("seire")) {
    expanded.push("metsaseire");
  }
  const focused = words
    .filter((word) => word.length >= 4 && !["eesti", "eestis", "andmed", "kohta"].includes(normalize(word)))
    .sort((left, right) => {
      const generic = (value) => /^(?:mets\w*|keskkond\w*|andm\w*)$/iu.test(normalize(value));
      return Number(generic(left)) - Number(generic(right)) || right.length - left.length;
    });
  const intentDiscovery = forestryIntent?.discoveryQueries || [];
  const preserveEstablishedAgeExpansion = forestryIntent?.kind === "forest-age-trend";
  return [...new Set([
    ...(forestryIntent?.kind === "forest-depletion" ? intentDiscovery : []),
    base,
    ...expanded,
    ...(preserveEstablishedAgeExpansion ? focused : intentDiscovery),
    ...focused,
  ])]
    .slice(0, Math.max(1, Math.min(Number(limit) || 3, 3)));
}

export function searchEnvironment(query, limit = 6) {
  // Privacy gates must see the RAW query first: canonicalization folds
  // Cyrillic homoglyphs, which can erase a private-person clause while the
  // Russian bridge still routes on the environmental prefix. A mixed query
  // ('лес; Где живёт Иван Петров') must fail closed via the raw assessment,
  // not rank the catalogue on its environmental half.
  const rawAssessment = assessSearchQuery(query);
  if (rawAssessment.kind !== "answerable") {
    return composeScopeResponse(rawAssessment.kind === "out-of-scope" ? "" : (canonicalizePublicSearchQuery(query).ok ? canonicalizePublicSearchQuery(query).query : ""), rawAssessment);
  }
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (canonicalInput.reason === "empty") {
    return {
      query: "",
      total: 0,
      answer: null,
      sources: [],
      related: ["metsade seisund", "Eesti kliima", "keskkonna avaandmed"],
    };
  }

  if (!canonicalInput.ok) {
    return composeScopeResponse("", assessSearchQuery(query));
  }
  const cleanQuery = canonicalInput.query;

  const assessment = assessSearchQuery(cleanQuery);
  if (assessment.kind !== "answerable") return composeScopeResponse(cleanQuery, assessment);
  // The legacy synchronous path ranks the raw catalogue: merge the Russian
  // keyword bridge so Cyrillic queries score against the same domain roots
  // as the live retrieval pipeline (which merges russianKeywordRoots in
  // analyzePublicSearchQuery). Privacy gates already ran on the raw text.
  const ranked = rankDocuments(cleanQuery, SEARCH_DOCUMENTS, { russianRoots: russianKeywordRoots(query) });
  const quality = assessEvidence(cleanQuery, ranked);
  return composeSearchResponse(cleanQuery, ranked, {
    answerable: quality.strong,
    // Only a subject-carrying ranked set may be described as related official
    // results; filler-word matches ("andmed") must not produce that claim.
    hasRelevantResults: rankedSetCoversSubject(cleanQuery, ranked),
    clarification: quality.strong ? null : "Lisa konkreetne näitaja, objekt, piirkond või ajavahemik.",
    limit,
    quality,
    total: ranked.length,
  });
}

