import { PORTAL_SECTION_SOURCES } from "./portal-source-catalogue.mjs";
import { PORTAL_REPORT_SOURCES } from "./portal-report-catalogue.mjs";
import { PORTAL_DATA_SOURCES } from "./portal-data-source-catalogue.mjs";
import {
  AMBIGUOUS_ROOTS,
  FOREIGN_SCRIPT_PATTERN,
  STOP_WORDS,
  forestEvidenceIntent,
  isBroadTopicDataOverviewQuery,
  normalize,
  queryTerms,
  rootIsDomain,
  textHasQueryRoot,
} from "./search_query_terms.mjs";
import { ambiguousDomainGuidanceIds } from "./search_navigation_policy.mjs";
export function forestryIntentServiceDocumentIds(query) {
  const intent = forestEvidenceIntent(query);
  return [...(intent?.serviceDocumentIds || [])];
}
const PORTAL_OVERVIEW_SLUGS = Object.freeze([
  ["energeetika", "energeetika-ja-keskkond"],
  ["ilm", "ilm-ja-kliima"],
  ["kliima", "ilm-ja-kliima"],
  ["jaatmed", "jaatmed-ja-ringmajandus"],
  ["ringmajandus", "jaatmed-ja-ringmajandus"],
  ["liigid", "liigid"],
  ["elurikkus", "liigid"],
  ["muld", "muld-ja-maahoive"],
  ["maahoive", "muld-ja-maahoive"],
  ["okosusteemid", "okosusteemid"],
  ["valisohk", "valisohk"],
  ["vesi", "vesi"],
  ["megatrendid", "megatrendid"],
]);

const reviewedDataSourceCache = new Map();

export function reviewedDataSourceSource(query) {
  const text = normalize(query);
  if (!text) return null;
  if (reviewedDataSourceCache.has(text)) return reviewedDataSourceCache.get(text);
  const tokens = text.split(" ").filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
  const raw = String(query || "").trim();
  const exactTitle = PORTAL_DATA_SOURCES.some((source) => (
    normalize(source.title) === text && text.length >= 5
  ));
  const dataSourceMarker = /\b(?:andmeteenus|avaandme\w*|wfs|api|dhs|kese|kotkas|kaia|eelis|loodusveeb|seismo|nemo|swan|parametervalue|viewid|download_opendata|keskkonnaportaal)\b/u.test(text)
    || /(?:^|\s)[ft]_[a-z0-9_]+/iu.test(raw)
    || /https?:\/\//u.test(raw)
    || /\.[a-z]{2,4}\b/u.test(raw)
    || /\+$/u.test(raw);
  // Generic one-word topics ("vesi", "kliima") must keep their normal broad
  // topic gate. The bypass is only for a named data service or an exact
  // catalogue title.
  if (!exactTitle && !dataSourceMarker) {
    reviewedDataSourceCache.set(text, null);
    return null;
  }
  if (/\bkese\b/u.test(text) && /(?:seire|andme)/u.test(text)) {
    const source = PORTAL_DATA_SOURCES.find((candidate) => (candidate.url === "https://kese.envir.ee" || candidate.url === "https://kese.envir.ee/"));
    reviewedDataSourceCache.set(text, source || null);
    return source || null;
  }
  if (/\bkotkas\b/u.test(text) && /(?:jaatme|register|heite)/u.test(text)) {
    const source = PORTAL_DATA_SOURCES.find((candidate) => candidate.url === "https://kotkas.envir.ee/registry/index");
    reviewedDataSourceCache.set(text, source || null);
    return source || null;
  }
  if (/\bwfs\b/u.test(text) && /metsaregist/u.test(text) && /eraldis/u.test(text)) {
    const source = PORTAL_DATA_SOURCES.find((candidate) => candidate.url.includes("typeName=metsaregister:eraldis&"));
    reviewedDataSourceCache.set(text, source || null);
    return source || null;
  }
  let result = null;
  if (tokens.length) {
    let best = -Infinity;
    for (const source of PORTAL_DATA_SOURCES) {
      const haystack = normalize([
        source.title,
        source.url,
        ...(source.tags || []),
        source.summary,
      ].filter(Boolean).join(" "));
      const matched = tokens.filter((token) => textHasQueryRoot(haystack, token)).length;
      if (matched !== tokens.length) continue;
      let params = 0;
      let segments = 0;
      try {
        const url = new URL(source.url);
        params = url.searchParams.size;
        segments = url.pathname.split("/").filter(Boolean).length;
      } catch {
        // Keep the title score for malformed catalogue URLs.
      }
      // Prefer the exact catalogue title, then the less specific service URL
      // when several entries share a title (for example a general register
      // search versus a pre-filtered object-type query).
      const score = tokens.length * 100
        + (normalize(source.title) === text ? 20 : 0)
        + (params === 0 ? 10 : 0)
        - params * 2
        - Math.min(20, segments);
      if (score > best) {
        best = score;
        result = source;
      }
    }
  }
  reviewedDataSourceCache.set(text, result);
  return result;
}

export function directPortalOverviewSourceId(query) {
  const text = normalize(query);
  if (!/\bkeskkonnaulevaade\b/u.test(text)) return null;
  if (/\bmets\b/u.test(text)) return "forest-condition-review";
  const match = PORTAL_OVERVIEW_SLUGS.find(([needle]) => new RegExp(`\\b${needle}\\b`, "u").test(text));
  if (!match) return null;
  return PORTAL_SECTION_SOURCES.find((source) => (
    source.url.endsWith(`/keskkonnaulevaade-${match[1]}`)
  ))?.id || null;
}

export function directPortalOverviewSource(query) {
  const id = directPortalOverviewSourceId(query);
  if (!id) return null;
  if (id === "forest-condition-review") {
    return {
      id,
      url: "https://keskkonnaportaal.ee/et/keskkonnaulevaade/keskkonnaulevaade-mets",
    };
  }
  const source = PORTAL_SECTION_SOURCES.find((candidate) => candidate.id === id);
  return source ? { id: source.id, url: source.url } : null;
}

const PORTAL_REPORT_SOURCE_IDS = new Map(PORTAL_REPORT_SOURCES
  .filter((source) => /\/et\//u.test(source.url))
  .map((source) => [source.url.replace(/^https:\/\/keskkonnaportaal\.ee\/et\//u, ""), source.id]));

function directPortalReportSourceId(query) {
  const text = normalize(query);
  if (/\bjaatmeteke\b|\bjaatmete\s+teke\b/u.test(text)) {
    return PORTAL_REPORT_SOURCE_IDS.get("jaatmeteke") || null;
  }
  return null;
}

export function directPortalReportSource(query) {
  const id = directPortalReportSourceId(query);
  const source = id ? PORTAL_REPORT_SOURCES.find((candidate) => candidate.id === id) : null;
  return source ? { id: source.id, url: source.url } : null;
}

// Match the grant noun, not the unrelated verb "toetub". The verb form
// "toetusid" also needs excluding. Application wording must name a forest
// owner or measure, not merely a forest notice.
const FOREST_SUPPORT_COMPOUND_SOURCE = "eramets|metsaomani|metsameede|metsameetme|metsauuend|metsaistut|metsamajand";
const FOREST_SUPPORT_GRANT_STEM_PATTERN = /toetus(?!id)|rahastu/u;
// Accept the application and the owner or measure in either order.
const FOREST_SUPPORT_APPLICATION_PATTERN = new RegExp(
  `(?:${FOREST_SUPPORT_COMPOUND_SOURCE})\\p{L}*[\\s\\S]{0,20}taotl|taotl[\\s\\S]{0,20}(?:${FOREST_SUPPORT_COMPOUND_SOURCE})`,
  "u",
);
const FOREST_SUPPORT_CONTEXT_PATTERN = new RegExp(
  `(?:${FOREST_SUPPORT_COMPOUND_SOURCE}|metsandus)|(?:^|\\s)mets(?:a|ad|as|ast|ade|i)?(?=\\s|$)`,
  "u",
);
const FOREST_SUPPORT_SCHEME_PATTERN = new RegExp(
  "metsameede|metsameetme|metsauuend|metsaistut|metsa\\s+(?:uuenda|istuta)",
  "u",
);

// A named measure leads to its page; other support questions use the directory.
function forestSupportNavigationDocumentIds(query) {
  const text = normalize(query);
  if (!text || !FOREST_SUPPORT_CONTEXT_PATTERN.test(text)) return [];
  const requestsSupport = FOREST_SUPPORT_GRANT_STEM_PATTERN.test(text)
    || FOREST_SUPPORT_APPLICATION_PATTERN.test(text);
  if (!requestsSupport) return [];
  return FOREST_SUPPORT_SCHEME_PATTERN.test(text)
    ? ["forest-owner-support-metsameede", "forest-owner-support-directory"]
    : ["forest-owner-support-directory"];
}

export function directDirectoryDocumentIds(query) {
  const text = normalize(query);
  const roots = queryTerms(query);
  const preferred = [];
  if (forestEvidenceIntent(query)?.kind === "forest-overview") preferred.push("metsainfo-hetkeseis");
  if (isBroadTopicDataOverviewQuery(query, roots)) {
    if (roots.includes("pohjavesi")) preferred.push("groundwater-overview");
    else if (/\bpinnave\w*/u.test(text) || roots.some((root) => ["vesi", "jarv", "jogi", "meri", "laanemeri"].includes(root))) preferred.push("water-monitoring");
    else if (roots.some((root) => ["ohk", "ohukvaliteet"].includes(root))) preferred.push("air-quality-live");
    else if (roots.includes("kliima")) preferred.push("official-data-services");
    else if (roots.includes("jaat")) preferred.push("waste-reporting-data");
    else if (roots.some((root) => ["mets", "metsaandmed", "metsaregister"].includes(root))) preferred.push("metsainfo-hetkeseis");
    else if (roots.includes("muld")) preferred.push("soil-monitoring-results");
    else if (roots.includes("kiirgus")) preferred.push("radiation-monitoring");
    else if (roots.includes("uluk")) preferred.push("wildlife-status-2025");
    else if (roots.some((root) => ["elurikkus", "loodus", "looduskaitse"].includes(root))) preferred.push("biodiversity");
    else if (roots.includes("seire")) preferred.push("kese-monitoring");
  }
  if (/\bkeskkonnaseir\w*\b[\s\S]{0,60}\b(?:andmekog|andmestik)\w*\b/u.test(text)) {
    preferred.push("kese-monitoring");
  }
  if (/\bnatura\s+2000\b[\s\S]{0,60}\b(?:registr|andm)\w*\b/u.test(text)) {
    preferred.push("environment-register", "biodiversity");
  }
  if ((/\bsadem\w*\b[\s\S]{0,60}\bvaatlusandm\w*\b/u.test(text)
    || /\bvaatlusandm\w*\b[\s\S]{0,60}\bsadem\w*\b/u.test(text))) {
    preferred.push("historical-weather-data", "weather-overview");
  }
  if (/\b(?:keskkonnaandm|keskonnaandm)\w*\b[\s\S]{0,60}\b(?:teenus|loetelu)\w*\b/u.test(text)) {
    preferred.push("official-data-services", "open-data-downloader");
  }
  const reportId = directPortalReportSourceId(query);
  if (reportId) preferred.push(reportId);
  const reviewedDataSource = reviewedDataSourceSource(query);
  if (reviewedDataSource) preferred.push(reviewedDataSource.id);
  // A support question asks where the official guidance is, not what a grant
  // currently pays: the two reviewed support cards stay on the first visible
  // page, with the scheme's own page leading when the question names it.
  preferred.push(...forestSupportNavigationDocumentIds(query));
  // A broad ambiguous-domain question ("Kus on kõige puhtam õhk?") has no
  // claims-bearing catalogue card, but its domain's official service
  // summaries do exist. Keep those cards inside the first visible page so
  // ranking noise cannot bury the reviewed guidance below word-overlap
  // corpus items. Numeric years and precise station requests stay out.
  const ambiguousIds = ambiguousBroadDomainGuidanceIds(query, roots);
  if (ambiguousIds.length) preferred.push(...ambiguousIds);
  return [...new Set(preferred)];
}

// Broad ambiguous-domain query characteristics: at most two domain roots,
// every domain root in AMBIGUOUS_ROOTS (exact fold), no explicit year, and
// no precise measurement-object request. Shared by directory injection and
// composeAmbiguousDomainGuidanceResponse.
export function ambiguousBroadDomainGuidanceIds(query, roots = queryTerms(query)) {
  const text = normalize(query);
  // Foreign-script queries resolve through the translation bridge instead:
  // the guidance prose is Estonian and the pinned discovery order for
  // translated queries (waste guide first) must stay untouched.
  if (FOREIGN_SCRIPT_PATTERN.test(String(query || ""))) return [];
  if (forestEvidenceIntent(query)) return [];
  const domainRoots = roots.filter((root) => rootIsDomain(root));
  if (domainRoots.length === 0 || domainRoots.length > 2) return [];
  if (!domainRoots.every((root) => AMBIGUOUS_ROOTS.has(root))) return [];
  if (/\b(?:19|20)\d{2}\b/u.test(text)) return [];
  if (/\b(?:seirejaam|proovipunkt|mõõtejaam)\b/u.test(text)) return [];
  // Precise service requests must keep their specialised cards: a state
  // ("seisund"), a result of monitoring ("tulemused"), a sample, a PM2.5
  // reading, a construction consent or sorting procedure is no longer a
  // broad ambiguous-domain question.
  if (/\b(?:seisund|tulemus\w*|proov\w*|hetkeseis\w*|pm\s*2\.?\s*5|pm25|kooskolastus|n[oõ]usolek|ehitamis?\w*|maja|sorteerim\w*|menetl\w*|vajalik|lub\w*|m[oõ][oõ]t\w*|kinnistu|piirang\w*)\b/u.test(text)) return [];
  // Stemmed query roots carry precise intent even when the normalized text
  // hides it behind inflection ("nõusolekut", "ehitada"): prefix-check the
  // folded roots directly.
  const precisionRootPattern = /^(?:seisund|tulemus|proov|hetkeseis|pm25|kooskolastus|nousolek|ehitami|saunamaja|maja|sorteerim|menetl|vajalik|lub|moot|rajam|monis|kinnistu|piirang|menlus)/iu;
  if (roots.some((root) => precisionRootPattern.test(String(root || "")))) return [];
  const lead = domainRoots[0];
  // Protection, water, monitoring and waste families keep their specialised
  // routing for any qualified question. Their guidance only engages on bare
  // domain questions ("Kus Eestis on kaitsealasid?"): every other content
  // root must be a neutral question word. Air and energy questions keep the
  // broader behaviour because no other family claims those domains.
  if (["kaitseala", "vesi", "jarv", "jogi", "meri", "pohjavesi", "seire", "andmed", "jaat", "prugi"].includes(lead)) {
    const neutralQuestionRoots = new Set([
      "kus", "kuhu", "kui", "mis", "palju", "koige", "eesti", "eestis", "mida",
      "millest", "miks", "kes", "kelle", "millal", "kuidas", "ikka",
    ]);
    const secondaryRoots = roots.filter((root) => root !== lead && !domainRoots.includes(root));
    if (!secondaryRoots.every((root) => neutralQuestionRoots.has(root))) return [];
  }
  return ambiguousDomainGuidanceIds(domainRoots[0]);
}

