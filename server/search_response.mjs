import { relatedQueries } from "./suggestions.mjs";
import {
  ADDITIONAL_OFFICIAL_SERVICE_DOCUMENTS,
  OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS,
  SEARCH_DOCUMENTS,
  reviewedNavigationCitationSource,
} from "./search_catalogue.mjs";
import { ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS } from "./forestry-public.mjs";
import { assessEvidence, scoreDocument } from "./search_evidence.mjs";
import { specificQuestionMismatch, wasteFacilitiesNavigationContext } from "./search_navigation_policy.mjs";
import { isForestRelatedQuery, assessSearchQuery } from "./search_query_assessment.mjs";
import { canonicalizePublicSearchQuery } from "./search_query_canonicalization.mjs";
import {
  forestEvidenceIntent,
  isAllEnvironmentSearchEnabled,
  isBroadTopicDataOverviewQuery,
  normalize,
  queryTerms,
} from "./search_query_terms.mjs";
import { ambiguousBroadDomainGuidanceIds, directDirectoryDocumentIds } from "./search_selectors.mjs";
export const NO_ANSWER_EYEBROW = "Vastust ei leitud";
export const NO_ANSWER_INTRO = "Meil ei ole sellele küsimusele vastust. Meie allikatest ei leidnud me selget ja usaldusväärset vastust.";

// One plain message for everything search does not answer. Any listing the
// route already found stays visible beside it.





export function composeNoAnswerResponse(query) {
  return composeSearchResponse(query, [], { answerable: false, hasRelevantResults: false, total: 0, related: [] });
}

export function composeSearchResponse(query, rankedDocuments, options = {}) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  const cleanQuery = canonicalInput.ok ? canonicalInput.query : "";
  const limit = Math.max(1, Math.min(Number(options.limit) || 6, 10));
  const ranked = Array.isArray(rankedDocuments) ? rankedDocuments : [];
  const chosen = ranked
    .slice(0, limit)
    .map((document, index) => ({ ...document, citation: index + 1 }));
  // An explicit hasRelevantResults is a factual claim about the query's
  // subject, so it must not be overridden by a non-empty chosen list: any
  // ranked match is not automatically a *related* result.
  const hasRelevantResults = options.hasRelevantResults === undefined
    ? chosen.length > 0
    : options.hasRelevantResults === true;
  const directEvidence = options.answerable !== false && chosen.length > 0 && hasRelevantResults;
  const title = cleanQuery
    ? `${cleanQuery.charAt(0).toLocaleUpperCase("et")}${cleanQuery.slice(1)}`
    : "Täpsusta keskkonnaandmete küsimust";

  return {
    query: cleanQuery,
    total: Number.isFinite(options.total) ? options.total : ranked.length,
    generatedAt: new Date().toISOString(),
    answer: {
      eyebrow: directEvidence
        ? "Kontrollitud allikaotsing"
        : NO_ANSWER_EYEBROW,
      title,
      intro: directEvidence
        ? "Leidsin küsimusega seotud ametlikud allikad, kuid usaldusväärset koondvastust ei õnnestunud praegu koostada. Ava allikad või proovi hetke pärast uuesti."
        : NO_ANSWER_INTRO,
      introCitations: [],
      parts: [],
      note: "",
    },
    sources: chosen.map(({ score: _score, semanticScore: _semanticScore, combinedScore: _combinedScore, tags, ...source }) => ({
      ...source,
      tags: (tags || []).slice(0, 5),
    })),
    related: options.related || relatedQueries(cleanQuery, chosen),
    clarification: options.clarification || null,
    evidence: {
      kind: options.evidenceKind || "portal-discovery",
      answerable: directEvidence,
      documentIds: chosen.map((source) => source.id),
      quality: options.quality || null,
    },
  };
}

const WASTE_FACILITIES_MAP_URL = "https://register.keskkonnaportaal.ee/register";
// Keep the reviewed procedure in a private module snapshot. Ranked discovery
// cards are only visibility witnesses: aliases that share the URL must never
// supply prose that later receives this snapshot's review timestamp/version.
const REVIEWED_WASTE_FACILITIES_NAVIGATION_SOURCE = (() => {
  const source = [...SEARCH_DOCUMENTS, ...ADDITIONAL_OFFICIAL_SERVICE_DOCUMENTS]
    .find((document) => document.id === "waste-facilities-map"
      && document.url === WASTE_FACILITIES_MAP_URL);
  return source ? Object.freeze({
    ...source,
    tags: Object.freeze([...(source.tags || [])]),
  }) : null;
})();
// This is deliberately a navigation response, not an answer-evidence adapter.
// The public map contains current and archived layers and cannot establish that
// a particular facility exists, is open, or accepts a requested waste type.
export function composeWasteFacilitiesNavigationResponse(query, documents = [], options = {}) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok) return null;
  const cleanQuery = canonicalInput.query;
  const route = wasteFacilitiesNavigationContext(cleanQuery);
  if (!route) return null;

  const listingWitness = (Array.isArray(documents) ? documents : []).find((document) => (
    document?.id === "waste-facilities-map"
    && String(document.url || "").trim() === WASTE_FACILITIES_MAP_URL
    && document.sourceTier === "official"
    && document.evidencePolicy === "route-only"
    && document._answerEvidenceEligible === false
  ));
  if (!listingWitness || !REVIEWED_WASTE_FACILITIES_NAVIGATION_SOURCE) return null;
  const source = REVIEWED_WASTE_FACILITIES_NAVIGATION_SOURCE;
  const citedSource = reviewedNavigationCitationSource({
    ...source,
    tags: [...(source.tags || source.topics || [])].slice(0, 5),
  }, 1, listingWitness);
  const location = route.county || "soovitud asukoht";
  return {
    query: cleanQuery,
    total: Number.isFinite(options.total) ? options.total : 1,
    generatedAt: new Date().toISOString(),
    answer: {
      eyebrow: "Ametliku kaardi juhis",
      title: `Jäätmekäitluskohti saab otsida Andmed ja kaart rakendusest`,
      intro: `Ava Andmed ja kaart, vali sobiv jäätmekäitluskohtade kiht ning kasuta asukohaotsingut või suumi kaardil asukohale ${location}.`,
      introCitations: [1],
      parts: [],
      note: "See navigatsioonijuhis ei kinnita ühegi koha olemasolu, kehtivust, lahtiolekut ega vastuvõetavaid jäätmeliike. Kontrolli need konkreetse objekti andmetest või käitlejalt.",
    },
    sources: [citedSource],
    related: ["jäätmejaamade kaart", "jäätmekäitluskohtade andmekihid", "ettevõtete jäätmete aastaaruandlus"],
    clarification: null,
    evidence: {
      kind: "official-navigation-routing",
      documentIds: [source.id],
    },
  };
}

// A reviewed service card may summarize broad national topic data and where it
// lives, but never infer a live value or a fact about a specific object.
export function composeTopicDataOverviewResponse(query, documents = [], options = {}) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok || !isBroadTopicDataOverviewQuery(canonicalInput.query)) return null;
  const preferredIds = directDirectoryDocumentIds(canonicalInput.query);
  const visible = Array.isArray(documents) ? documents : [];
  // This intentionally does not require claim-level passage coverage: the
  // narrow classifier accepts only a broad topic + "andmed" overview without
  // a year or modifier. Exact id+URL binding below permits only the reviewed
  // catalogue summary and never a live value or object-specific claim.
  const witness = preferredIds.flatMap((id) => visible.filter((document) => (
    document?.id === id
    && document.sourceTier === "official"
  )))[0];
  if (!witness) return null;
  const source = [
    ...SEARCH_DOCUMENTS,
    ...ADDITIONAL_OFFICIAL_SERVICE_DOCUMENTS,
    ...OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS,
    ...ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS,
  ]
    .find((document) => document.id === witness.id && document.url === witness.url);
  if (!source) return null;

  const citedSource = reviewedNavigationCitationSource({
    ...source,
    tags: [...(source.tags || [])].slice(0, 5),
  }, 1, witness);
  const publicInput = canonicalizePublicSearchQuery(options.publicQuery || canonicalInput.query);
  return {
    query: publicInput.ok ? publicInput.query : canonicalInput.query,
    total: Number.isFinite(options.total) ? options.total : 1,
    generatedAt: new Date().toISOString(),
    answer: {
      eyebrow: "Ametlik andmeteenus",
      title: source.title,
      intro: source.summary,
      introCitations: [1],
      parts: [],
      note: [
        source.answer,
        "Teenusekirjeldus ei tõenda üksikut mõõtetulemust ega registriobjekti hetkeseisu.",
      ].filter(Boolean).join(" "),
    },
    sources: [citedSource],
    related: relatedQueries(canonicalInput.query, [source]),
    clarification: null,
    evidence: {
      kind: witness._answerEvidenceEligible === false
        ? "official-navigation-routing"
        : "official-data-overview",
      documentIds: [source.id],
    },
  };
}


// A reviewed route card may safely tell the user where an official service
// lives even when its changing contents cannot support a current factual
// claim. The immutable catalogue extract, never live alias prose, is cited.
export function composeOfficialServiceNavigationResponse(query, documents = [], options = {}) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok || forestEvidenceIntent(canonicalInput.query)) return null;
  const cleanQuery = canonicalInput.query;
  const catalogue = [...SEARCH_DOCUMENTS, ...ADDITIONAL_OFFICIAL_SERVICE_DOCUMENTS];
  const visible = Array.isArray(documents) ? documents : [];
  const source = visible.flatMap((witness) => {
    if (witness?.sourceTier !== "official" || witness._answerEvidenceEligible !== false) return [];
    const reviewed = catalogue.find((candidate) => (
      candidate.id === witness.id && candidate.url === witness.url
    ));
    if (!reviewed) return [];
    const quality = assessEvidence(cleanQuery, [{
      ...reviewed,
      score: scoreDocument(reviewed, cleanQuery),
    }]);
    return quality.strong ? [reviewed] : [];
  })[0];
  if (!source) return null;
  if (specificQuestionMismatch(cleanQuery, [source.title, source.summary, source.answer].filter(Boolean).join(" "))) return null;

  const citedSource = reviewedNavigationCitationSource({
    ...source,
    tags: [...(source.tags || [])].slice(0, 5),
  }, 1, visible.find((witness) => witness.id === source.id && witness.url === source.url));
  return {
    query: cleanQuery,
    total: Number.isFinite(options.total) ? options.total : 1,
    generatedAt: new Date().toISOString(),
    answer: {
      eyebrow: "Ametlik teenus",
      title: source.title,
      intro: source.summary,
      introCitations: [1],
      parts: [],
      note: "Teenusekirjeldus juhatab ametliku vaate juurde, kuid ei kinnita üksikut mõõtetulemust ega registriobjekti hetkeseisu.",
    },
    sources: [citedSource],
    related: relatedQueries(cleanQuery, [source]),
    clarification: null,
    evidence: {
      kind: "official-navigation-routing",
      documentIds: [source.id],
    },
  };
}

// Broad ambiguous-domain questions ("Kus on kõige puhtam õhk?", "Kui palju
// taastuvat energiat toodetakse?") rarely carry a claims-bearing passage in a
// single catalogue card, but the domain IS covered by reviewed official
// services. Rather than asserting there is no evidence at all, route the
// question to its reviewed service summary with a visible citation. This
// composes only immutable catalogue prose — never live values or a computed
// superlative — so it stays honest while replacing the bare refusal.
export function composeAmbiguousDomainGuidanceResponse(query, documents = [], options = {}) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok || forestEvidenceIntent(canonicalInput.query)) return null;
  const cleanQuery = canonicalInput.query;
  const assessment = assessSearchQuery(cleanQuery);
  if (assessment.kind !== "answerable") return null;
  const terms = queryTerms(cleanQuery);
  const preferredIds = ambiguousBroadDomainGuidanceIds(cleanQuery, terms);
  if (preferredIds.length === 0) return null;  const visible = Array.isArray(documents) ? documents : [];
  const witness = preferredIds.flatMap((id) => visible.filter((document) => (
    document?.id === id && document.sourceTier === "official"
  )))[0];
  if (!witness) return null;
  const catalogue = [...SEARCH_DOCUMENTS, ...ADDITIONAL_OFFICIAL_SERVICE_DOCUMENTS];
  const source = catalogue.find((document) => document.id === witness.id && document.url === witness.url);
  if (!source) return null;
  if (specificQuestionMismatch(cleanQuery, [source.title, source.summary, source.answer].filter(Boolean).join(" "))) return null;

  const citedSource = reviewedNavigationCitationSource({
    ...source,
    tags: [...(source.tags || [])].slice(0, 5),
  }, 1, witness);
  return {
    query: cleanQuery,
    total: Number.isFinite(options.total) ? options.total : 1,
    generatedAt: new Date().toISOString(),
    answer: {
      eyebrow: "Ametlik teenus",
      title: source.title,
      intro: source.summary,
      introCitations: [1],
      parts: [],
      note: "Teenusekirjeldus juhatab ametliku vaate juurde, kuid ei kinnita üksikut mõõtetulemust ega võrdlust hetkeseisus.",
    },
    sources: [citedSource],
    related: relatedQueries(cleanQuery, [source]),
    clarification: null,
    evidence: {
      kind: "official-navigation-routing",
      documentIds: [source.id],
    },
  };
}

// Reviewed service cards that safely describe their domain's official data
// when the question is broad and ambiguous. Each entry's prose stays in the
// immutable catalogue; the visible witness remains required at compose time.
function responseSources(ids) {
  const catalogue = [...SEARCH_DOCUMENTS, ...ADDITIONAL_OFFICIAL_SERVICE_DOCUMENTS];
  return ids.flatMap((id, index) => {
    const source = catalogue.find((candidate) => candidate.id === id);
    return source ? [reviewedNavigationCitationSource(source, index + 1)] : [];
  });
}

export function composeScopeResponse(query, assessment) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  const cleanQuery = canonicalInput.ok ? canonicalInput.query : "";
  if (!isAllEnvironmentSearchEnabled() && (assessment.reason === "outside-environment-domain"
    || (assessment.reason === "personal-data-lookup" && !isForestRelatedQuery(cleanQuery)))) {
    return composeNoAnswerResponse(cleanQuery);
  }
  if (assessment.kind === "live-weather") {
    const sources = responseSources(["weather-forecast", "kaia-service"]);
    return {
      query: cleanQuery,
      total: sources.length,
      generatedAt: new Date().toISOString(),
      answer: {
        eyebrow: "Ajakohane ilmainfo",
        title: "Ilmaprognoos tuleb võtta reaalaja teenusest",
        intro: "Tänase või homse ilma jaoks ava Keskkonnaagentuuri Ilm+ prognoos. Kliimaartiklid ja ajaloolised mõõtmised ei ole jooksva prognoosi asendus.",
        introCitations: [1],
        parts: [{
          title: "Masinloetavad andmed",
          text: "KAIA koondab prognoosi-, hoiatus-, radari- ja muid ilmaandmete väljundeid.",
          citations: [2],
        }],
        note: "Prognoos muutub ajas; kontrolli enne otsust alati allika viimast uuendust.",
      },
      sources,
      related: ["Eesti ilmahoiatused", "ajalooline temperatuur", "sademed mõõtejaamades"],
      clarification: assessment.clarification,
      evidence: { kind: "official-live-routing", documentIds: sources.map((source) => source.id) },
    };
  }

  if (assessment.kind === "live-air") {
    const sources = responseSources(["air-quality-live"]);
    return {
      query: cleanQuery,
      total: sources.length,
      generatedAt: new Date().toISOString(),
      answer: {
        eyebrow: "Ajakohane õhuseire",
        title: "Hetke õhukvaliteet tuleb võtta lähimast seirejaamast",
        intro: "Ava Eesti välisõhu kvaliteedi reaalajavaade, vali lähim seirejaam ja saasteaine ning kontrolli näidu keskmistamisaega. Ühe jaama hetkeline näit ei kirjelda automaatselt kogu linna ega pikaajalist õhukvaliteeti.",
        introCitations: [1],
        parts: [],
        note: "Seireandmed muutuvad ajas; tervise- või tegevusotsuse puhul kontrolli allika viimast uuendust.",
      },
      sources,
      related: ["Tallinna õhukvaliteedi pikaajaline trend", "PM2.5 mõõtmised", "Eesti välisõhu seirejaamad"],
      clarification: assessment.clarification,
      evidence: { kind: "official-live-routing", documentIds: sources.map((source) => source.id) },
    };
  }

  if (assessment.kind === "live-water") {
    const normalized = normalize(cleanQuery);
    const roots = queryTerms(cleanQuery);
    const isBathingWater = roots.includes("suplusvesi")
      || /\b(?:suplus\w*|ujum\w*|rand|ranna)\b/u.test(normalized);
    const isIce = roots.includes("jaaolud")
      || /\b(?:jaakaart|merejaa|jaakate)\w*\b/u.test(normalized);
    const isCombinedMarineObservation = isIce
      && roots.some((root) => ["temperatuur", "seire", "mootmine"].includes(root));
    const isMarine = isIce
      || roots.some((root) => ["meri", "laanemeri"].includes(root))
      || /\b(?:laht|lahe|rannik\w*)\b/u.test(normalized);
    const variant = isBathingWater
      ? {
          ids: ["bathing-water-quality"],
          eyebrow: "Ajakohane suplusvee info",
          title: "Suplusvee hetkeseis tuleb kontrollida Terviseameti vaatest",
          intro: "Ava Terviseameti suplusvee vaade, vali supluskoht ning kontrolli viimase proovi kuupäeva ja tulemust. Jooksev proovitulemus ja nelja viimase aasta põhjal määratud kvaliteediklass ei ole sama näitaja.",
          note: "Proovitulemused muutuvad hooaja jooksul; ujumisotsuse puhul kontrolli ka kohapealseid hoiatusi.",
          related: ["Eesti supluskohad", "suplusvee kvaliteediklass", "Pirita suplusvee proovid"],
        }
      : isCombinedMarineObservation
        ? {
            ids: ["marine-observations", "marine-ice-map"],
            eyebrow: "Ajakohane mereseire",
            title: "Merevee näidud ja jääolud tuleb võtta ametlikest vaatlusvaadetest",
            intro: "Ava Keskkonnaagentuuri merevaatluste vaade temperatuuri ja veetaseme jaoks ning jääkaart jääolude jaoks. Vali sobiv rannikujaam või kaardiala ja kontrolli mõlema vaate uuendamisaega.",
            note: "Merevee näidud ja jääolud muutuvad ajas; ühe jaama või kaardikihi põhjal ei saa kirjeldada kogu Läänemerd.",
            related: ["Eesti merevaatlusjaamad", "Eesti mere jääkaart", "ajaloolised merevaatlused"],
          }
        : isIce
        ? {
            ids: ["marine-ice-map"],
            eyebrow: "Ajakohane merejää info",
            title: "Jääolud tuleb võtta ametlikult jääkaardilt",
            intro: "Ava Keskkonnaagentuuri mere jääkaart ning kontrolli kaardi vaatlus- ja uuendamisaega. Otsing ei esita vana jääolude kirjeldust praeguse olukorrana.",
            note: "Jääolud võivad kiiresti muutuda; liikumisohutust ei saa hinnata üksnes üldkaardi põhjal.",
            related: ["Eesti mere jääkaart", "Läänemere veetemperatuur", "ajaloolised jääolud"],
          }
        : isMarine
          ? {
              ids: ["marine-observations"],
              eyebrow: "Ajakohane mereseire",
              title: "Mere hetkeseis tuleb võtta lähimast vaatlusjaamast",
              intro: "Ava Keskkonnaagentuuri merevaatluste vaade, vali sobiv rannikujaam ja näitaja ning kontrolli mõõtmise aega. Ühe jaama näit ei kirjelda automaatselt kogu lahte ega Läänemerd.",
              note: "Veetase ja -temperatuur muutuvad ajas; kontrolli allika viimast mõõtmisaega.",
              related: ["Eesti merevaatlusjaamad", "Läänemere veetemperatuur", "merevee taseme ajalugu"],
            }
          : {
              ids: ["current-hydrology-observations"],
              eyebrow: "Ajakohane sisevete seire",
              title: "Veetaseme hetkeseis tuleb võtta mõõtejaamast",
              intro: "Ava Keskkonnaagentuuri hüdroloogiliste vaatluste kaart, vali õige jõgi või järv ja mõõtejaam ning kontrolli näidu aega ja ühikut. Otsing ei esita vana vaatlust praeguse näiduna.",
              note: "Veetase, vooluhulk ja veetemperatuur muutuvad ajas; kontrolli allika viimast mõõtmisaega.",
              related: ["Eesti hüdromeetriajaamad", "Emajõe ajalooline veetase", "jõgede vooluhulk"],
            };
    const sources = responseSources(variant.ids);
    return {
      query: cleanQuery,
      total: sources.length,
      generatedAt: new Date().toISOString(),
      answer: {
        eyebrow: variant.eyebrow,
        title: variant.title,
        intro: variant.intro,
        introCitations: sources.map((source) => source.citation),
        parts: [],
        note: variant.note,
      },
      sources,
      related: variant.related,
      clarification: assessment.clarification,
      evidence: { kind: "official-live-routing", documentIds: sources.map((source) => source.id) },
    };
  }

  const isOutOfScope = assessment.kind === "out-of-scope";
  const outOfScopeTitle = {
    "invalid-query-length": "Palun lühenda otsingut",
    "unsafe-instruction": "Süsteemijuhiste päringut ei saa täita",
    "personal-data-lookup": "Eraisiku andmeid otsing ei kuva",
    "unsupported-language": "Palun kirjuta küsimus eesti keeles",
    "outside-environment-domain": "Palun küsi Eesti keskkonna kohta",
  }[assessment.reason] || "Palun täpsusta küsimust";
  const topicSources = assessment.topic === "kataster"
    ? responseSources(["environment-register", "official-geoserver"])
    : [];
  return {
    query: cleanQuery,
    total: topicSources.length,
    generatedAt: new Date().toISOString(),
    answer: {
      eyebrow: isOutOfScope ? "Täpsusta päringut" : "Vajan täpsustust",
      title: isOutOfScope ? outOfScopeTitle : "Palun täpsusta küsimust",
      intro: assessment.clarification,
      introCitations: [],
      parts: [],
      note: isOutOfScope ? null : "Piisava ametliku tõendita jätab otsing vastuse koostamata.",
    },
    sources: topicSources,
    related: ["Eesti metsade seisund", "õhukvaliteet Tallinnas", "põhjavee seisund", "jäätmete käitlemine"],
    clarification: null,
    evidence: {
      kind: isOutOfScope ? "safe-abstention" : "needs-clarification",
      answerable: false,
      documentIds: topicSources.map((source) => source.id),
    },
  };
}
