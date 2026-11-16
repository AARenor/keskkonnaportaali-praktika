import { SMI_2025_EDITION, SMI_2025_TABLES_URL } from "./smi-tables.mjs";
import { sameSourceResource, sourceEvidenceBinding, sourceResourceKey, sourceWitnessKey } from "./source-identity.mjs";
import { normalize, queryTerms, textHasQueryRoot } from "./search_query_terms.mjs";
import { splitTextPassages, passageContainsEvidenceDisclaimer, passageDisclaimsEvidence } from "./search_evidence.mjs";
import { sourceCanSupportPublicCitation } from "./source-registry.mjs";
import { statisticalReferenceDimensions } from "./municipalities.mjs";
import { clean, resultPublishedAt, hasIndependentEvidenceCapability, hasValidatedForestBalanceProjection } from "./retrieval_deduplication.mjs";
import { sanitizeLlmEvidenceText } from "./search_evidence_sanitization.mjs";
import { validatedForestBalanceProjection, validatedSmiHarvestBalanceProjection } from "./indicators.mjs";
function evidenceSourcePassages(document = {}) {
  const seen = new Set();
  // Evidence is raw source prose only; search-engine excerpts and discovery
  // metadata never become claim-bearing passages.
  return [document.content, document.summary, document.answer]
    .filter(Boolean)
    .flatMap(splitTextPassages)
    .map(clean)
    .filter((passage) => {
      const key = normalize(passage);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function claimBearingEvidenceSourcePassages(document = {}) {
  return evidenceSourcePassages(document)
    .filter((passage) => !passageDisclaimsEvidence(passage));
}

// Fact-check planning: keep a disputed statement together with the source's
// own correction. The windows stay raw source prose so the evidence pack's
// exact-window admission (evidence-pack.mjs rawWindows) accepts them; nothing
// here rewrites or paraphrases the article, and the disputed claim is never
// promoted as fact by itself.
const FACT_CHECK_CLAIM_START = /^\d{1,2}[.)]\s*\p{Lu}/u;
const FACT_CHECK_NUMBERED_MARKER = /^\d{1,2}[.)]$/u;
const FACT_CHECK_CORRECTION_MARKER = /\b(?:vale|valeks|ei\s+vasta\s+toele|tegelikult|tegelikkuses|lukkab\s+umber|lukatakse\s+umber|on\s+vale|ei\s+ole\b|ei\s+oleks\b|korrektsed|korrektne|oige\s+on|ei\s+tohi\s+uletada|alahindamine|erinevused\s+tulenevad|klapivad)\b/u;
const FACT_CHECK_ALLEGATION_MARKER = /\b(?:valevait\w*|valeandm\w*|valeinfo\w*|vaidetakse|hinnangul|ulerai\w*|otsas)\b/u;
const FACT_CHECK_DOCUMENT_FRAMING = /\b(?:valevait\w*|valeinfo\w*|valeandm\w*|desinformatsioon\w*|lukkab\s+umber|lukatakse\s+umber|umber\s+luk\w*|tosi\s+voi\s+vale|ei\s+vasta\s+toele|on\s+vale|muut|muudi|muuti)\b/u;
const FACT_CHECK_INTENT_TERMS = new Set([
  "levinud", "valevaited", "valevait", "valeandmed", "valeandm", "valeinfo",
  "muut", "muudi", "muuti", "umber", "lukkab", "lukatakse", "kaivad", "tosi",
]);

function factCheckSubjectTerms(query) {
  return queryTerms(query).filter((term) => term.length >= 4 && !FACT_CHECK_INTENT_TERMS.has(term));
}

// A numbered claim may arrive either as "1. Claim sentence." or as a lone
// "1." window followed by the claim sentence, depending on how the source
// body was split. Both shapes identify the same source structure.
function factCheckNumberedStart(windows, index) {
  const window = windows[index];
  if (FACT_CHECK_CLAIM_START.test(window)) return { claimIndex: index, claim: window };
  if (FACT_CHECK_NUMBERED_MARKER.test(window) && index + 1 < windows.length) {
    return { claimIndex: index + 1, claim: windows[index + 1] };
  }
  return null;
}

function factCheckEvidence(document = {}, query = "") {
  const windows = [...new Set(claimBearingEvidenceSourcePassages(document))];
  if (!windows.length) return null;
  // The correction framing may live in the title, summary or body: a document
  // that never presents itself as a correction is not fact-check evidence.
  const framingText = normalize([document.title, document.summary, document.content, document.answer]
    .filter(Boolean).join(" "));
  if (!FACT_CHECK_DOCUMENT_FRAMING.test(framingText)) return null;
  const subjects = factCheckSubjectTerms(query);
  const hasSubject = (value) => subjects.length === 0
    || subjects.some((subject) => textHasQueryRoot(value, subject));
  const pairs = [];
  for (let index = 0; index < windows.length && pairs.length < 4; index += 1) {
    const start = factCheckNumberedStart(windows, index);
    if (!start) continue;
    // A bare numbered topic label ("4. Netojuurdekasvu mõiste.") names a
    // subject but states no allegation; a real claim needs a full sentence or
    // an explicit allegation marker.
    if (start.claim.length < 25 && !FACT_CHECK_ALLEGATION_MARKER.test(normalize(start.claim))) continue;
    const block = [];
    for (let next = start.claimIndex + 1; next < windows.length; next += 1) {
      if (factCheckNumberedStart(windows, next)) break;
      block.push(windows[next]);
    }
    // Find the actual response before retaining nearby explanatory context.
    // Never treat the allegation's continuation or a link to another page as
    // the response; keep anaphoric conclusions with their numeric antecedents.
    const position = block.findIndex((window) => FACT_CHECK_CORRECTION_MARKER.test(normalize(window)));
    if (position < 0) continue;
    const response = block[position];
    const isNavigation = (passage) => /\b(?:blogi|loe\s+lahemalt|tapsemalt\s+on\s+teemat)\w*/u.test(normalize(passage));
    const safeContext = (passage) => !FACT_CHECK_ALLEGATION_MARKER.test(normalize(passage)) && !isNavigation(passage);
    const context = /^(?:need|see|selle)\b/u.test(normalize(response))
      ? block.slice(Math.max(0, position - 2), position).filter(safeContext)
      : [];
    const following = block[position + 1];
    const corrections = [
      ...context,
      response,
      ...(following && !context.length && safeContext(following) ? [following] : []),
    ];
    const pairText = [start.claim, ...corrections].join(" ");
    if (!hasSubject(pairText)) continue;
    pairs.push({ index: pairs.length + 1, claim: start.claim, corrections });
  }
  if (!pairs.length) {
    // Unnumbered correction prose: an allegation sentence followed directly by
    // the source's correction. Both sides stay verbatim.
    for (let index = 1; index < windows.length && pairs.length < 2; index += 1) {
      const correction = windows[index];
      const claim = windows[index - 1];
      if (factCheckNumberedStart(windows, index)) continue;
      if (!FACT_CHECK_CORRECTION_MARKER.test(normalize(correction))) continue;
      if (!FACT_CHECK_ALLEGATION_MARKER.test(normalize(claim))) continue;
      if (!hasSubject(`${claim} ${correction}`)) continue;
      pairs.push({ index: pairs.length + 1, claim, corrections: [correction] });
    }
  }
  if (!pairs.length) return null;
  return { pairs, passages: pairs.flatMap((pair) => [pair.claim, ...pair.corrections]) };
}

function forestAreaPassageEvidence(passage = "") {
  const raw = String(passage || "");
  const text = normalize(raw);
  const measurementValue = "(?:\\d{1,3}(?:[\\s\\u00A0]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)";
  const hasForestArea = /\b(?:metsamaa\w*|metsaga\s+kaetud|metsasus\w*|metsa\s+pindala|metsade\s+pindala)\b/iu.test(raw);
  const hasMetsamaaArea = /\b(?:metsamaa\w*|metsa\s+pindala|metsade\s+pindala)\b/iu.test(raw);
  const hasMeasurement = new RegExp(`\\b${measurementValue}\\s*(?:%|protsent(?:i|ides|ides?)?|ha\\b|hektar(?:it|i)?|miljonit?\\s+hektarit?|tuhat\\s+(?:ha\\b|hektarit?))`, "iu").test(raw);
  const hasHectares = new RegExp(`\\b${measurementValue}\\s*(?:ha\\b|hektar(?:it|i)?|miljonit?\\s+hektarit?|tuhat\\s+(?:ha\\b|hektarit?))`, "iu").test(raw);
  const subsetMetric = /\b(?:elaniku\s+kohta|metsamaast|kaitse\s+all|rangelt\s+kait|mittemajandatav|majanduspiirang|okaspuu|lehtpuu|puistute\s+pindala)\b/iu.test(raw);
  const hasSmi = /\b(?:smi|statistilise\s+metsainvent)/iu.test(raw);
  const hasEstonia = /\beesti\w*\b/iu.test(text);
  return {
    satisfies: hasForestArea && hasMeasurement && !subsetMetric,
    score: (hasForestArea ? 16 : 0)
      + (hasMeasurement ? 20 : 0)
      + (hasMetsamaaArea ? 6 : 0)
      + (hasHectares ? 4 : 0)
      + (hasSmi ? 8 : 0)
      + (hasEstonia ? 4 : 0)
      - (subsetMetric ? 40 : 0),
  };
}

function uniquePassages(values = [], limit = 3) {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function requestedQueryYear(query) {
  return normalize(requestedPeriodQuery(query)).match(/\b((?:19|20)\d{2})\b/u)?.[1] || "";
}

function requestsSmi2025HistoricalRow(query) {
  const dimensions = statisticalReferenceDimensions(query);
  return /\bsmi\b/iu.test(String(query))
    && dimensions?.editionYear === SMI_2025_EDITION.year
    && dimensions.referenceYear === SMI_2025_EDITION.historicalReferenceYear;
}

// A reviewed edition is not a second reference period.
function requestedPeriodQuery(query) {
  return statisticalReferenceDimensions(query)?.periodQuery ?? query;
}

function containsEvidenceYear(value, year) {
  if (!year) return false;
  return new RegExp(`\\b${year}\\b`, "u").test(normalize(value));
}


function measurementPassagesContainRequestedYear(passages = [], year = "") {
  return !year || passages.some((passage) => containsEvidenceYear(passage, year));
}

function areaMeasurementKey(value = "") {
  const match = String(value || "").match(/\b(\d{1,3}(?:[\s\u00A0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(%|protsent(?:i|ides|ides?)?|ha\b|hektar(?:it|i)?|miljonit?\s+hektarit?|tuhat\s+(?:ha\b|hektarit?))/iu);
  return match ? `${match[1].replace(/[\s\u00A0]/gu, "").replace(",", ".")}:${normalize(match[2])}` : "";
}

function forestAreaEvidence(document, year = "") {
  const matches = claimBearingEvidenceSourcePassages(document)
    .map((passage, index) => ({ passage, index, ...forestAreaPassageEvidence(passage) }))
    .filter((candidate) => candidate.score > 0)
    .filter((candidate) => !year || (candidate.satisfies && containsEvidenceYear(candidate.passage, year)))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = matches[0];
  if (!best) return { satisfies: false, score: 0, passages: [] };
  const measurementKeys = new Set();
  const measurements = matches.filter((candidate) => {
    if (!candidate.satisfies) return false;
    const key = areaMeasurementKey(candidate.passage);
    if (key && measurementKeys.has(key)) return false;
    if (key) measurementKeys.add(key);
    return true;
  });
  return {
    satisfies: best.satisfies,
    score: best.score,
    passages: uniquePassages([
      ...measurements.map((candidate) => candidate.passage),
      ...matches.map((candidate) => candidate.passage),
    ], 2),
  };
}

function forestAreaOnlyEvidence(document, year = "") {
  const matches = claimBearingEvidenceSourcePassages(document)
    .map((passage, index) => ({ passage, index, ...forestAreaPassageEvidence(passage) }))
    .filter((candidate) => candidate.satisfies)
    .filter((candidate) => measurementPassagesContainRequestedYear([candidate.passage], year))
    // A composite area-and-method answer must not inherit a neighboring stock
    // or harvest observation merely because it appears in the same source.
    .filter((candidate) => !/\b(?:tagavara\w*|raiemaht\w*|m[³3]\b|tihumeet\w*|kuupmeet\w*)/iu
      .test(candidate.passage))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = matches[0] || null;
  return {
    satisfies: Boolean(best),
    score: best?.score || 0,
    passages: best ? [best.passage] : [],
  };
}

function forestMeasurementMethodEvidence(document) {
  const passages = claimBearingEvidenceSourcePassages(document);
  const matches = passages
    .map((passage, index) => {
      const text = normalize(passage);
      const hasSmi = /\b(?:smi|statistiline\s+metsainvent\w*)\b/u.test(text);
      const hasSampleStudy = /\bvalikuuring\w*\b/u.test(text);
      const hasSamplePlots = /\bproovitukk\w*\b/u.test(text);
      const hasNationalGeneralization = /\b(?:kogu\s+eesti\w*|uleriigil\w*|uldistat\w*)\b/u.test(text);
      const explainsGeneralization = /\b(?:kogu\s+eesti\w*|uldistat\w*)\b/u.test(text);
      const satisfies = hasSmi && hasSampleStudy && hasSamplePlots && hasNationalGeneralization
        && !/\b(?:smi|statistiline\s+metsainvent\w*)\b[\s\S]{0,120}\b(?:ei\s+ole|pole)\b/u.test(text);
      return {
        passage,
        index,
        satisfies,
        score: (satisfies ? 100 : 0)
          + (hasSmi ? 12 : 0)
          + (hasSampleStudy ? 18 : 0)
          + (hasSamplePlots ? 18 : 0)
          + (hasNationalGeneralization ? 18 : 0)
          + (explainsGeneralization ? 12 : 0),
      };
    })
    .filter((candidate) => candidate.satisfies)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const best = matches[0] || null;
  const generalization = passages.find((passage) => {
    const text = normalize(passage);
    return /\bstatistili\w*/u.test(text) && /\b(?:kogu\s+eesti|uleriigil\w*)\b/u.test(text)
      && /\buldistat\w*\s+hinnang\w*/u.test(text)
      && !/\bei\s+(?:koostata|anna|uldistata)\w*\b/u.test(text);
  });
  return {
    satisfies: Boolean(best && generalization),
    score: best && generalization ? best.score : 0,
    passages: best && generalization ? uniquePassages([best.passage, generalization]) : [],
  };
}

function forestDepletionEvidence(document) {
  const passages = claimBearingEvidenceSourcePassages(document);
  const statusPassage = passages.find((passage) => {
    const text = normalize(passage);
    const hasForestStock = /\b(?:kasvava\s+metsa\s+tagavara|metsa\s+(?:kogu)?tagavara|metsatagavara|metsavaru)\w*/u.test(text);
    const hasMeasuredDirection = /\b(?:stabiil\w*|pusi\w*|suuren\w*|vahen\w*|kahan\w*|lang\w*)\b/u.test(text);
    return hasForestStock && hasMeasuredDirection;
  });
  const area = forestAreaEvidence(document);
  const context = overviewConditionEvidence(document);
  const roles = [
    statusPassage ? "status" : null,
    area.satisfies ? "area" : null,
    context.satisfies ? "context" : null,
  ].filter(Boolean);
  return {
    satisfies: roles.length > 0,
    score: (statusPassage ? 100 : 0)
      + (area.satisfies ? 70 : 0)
      + (context.satisfies ? 55 : 0),
    passages: uniquePassages([
      statusPassage,
      ...(area.passages || []),
      ...context.passages,
    ].filter(Boolean), 6),
    roles,
  };
}

function comparisonSourcePassages(source = {}) {
  return [source.summary, source.answer, source.content].filter(Boolean)
    .flatMap((value) => splitTextPassages(sanitizeLlmEvidenceText(value)));
}

function forestComparisonEvidence(source) {
  const passages = comparisonSourcePassages(source);
  const excludes = (value) => {
    const passage = normalize(value);
    return /\b(?:metsa|metsandus|metsainventeerimis)andm\w*/u.test(passage)
      && /\b(?:smi|statistilise\s+metsainvent|metsaregis\w*)/u.test(passage)
      && /\b(?:ei\s+kuulu|pole\s+osa|ei\s+ole\s+(?:osa|allik\w*)|pole\s+(?:osa|allik\w*))/u.test(passage);
  };
  const denies = (value) => /\b(?:ei\s+(?:utle|kinnita|naita)|ei\s+tahenda)\b[\s\S]{0,180}\b(?:smi|statistilise\s+metsainvent|metsaregis\w*)\b[\s\S]{0,180}\b(?:kuulub|on\s+neist|on\s+uks)/u.test(normalize(value))
    || /\b(?:uksnes|ainult)\s+loetleb\b[\s\S]{0,180}\bmarkson\w*/u.test(normalize(value));
  if (passages.some(excludes) || passages.some(denies)) return { satisfies: false, passages: [] };
  const umbrella = passages.find((value) => {
    const text = normalize(value);
    return /\b(?:metsa|metsandus)andm\w*/u.test(text)
      && /\b(?:kogutakse|kogumine)\b/u.test(text) && /\bmitmel\s+viisil\b/u.test(text)
      && !/\bei\s+koguta\b/u.test(text);
  });
  const nationalSummary = passages.find((value) => {
    const text = normalize(value);
    return /\bstatistili\w*\b/u.test(text) && /\b(?:kokkuvot\w*|hinnang\w*)\b/u.test(text)
      && /\beesti\s+mets\w*/u.test(text) && /\bmuutus\w*/u.test(text)
      && !/\bei\s+(?:koosta|anna|kirjelda)\w*\b/u.test(text);
  });
  const smi = passages.find((value) => /\bstatistili\w*\s+metsainvent\w*/u.test(normalize(value))
    && /\bsmi\b/u.test(normalize(value)));
  const propertyRegistry = passages.find((value) => {
    const text = normalize(value);
    return /\bkinnistu\w*\b/u.test(text) && /\binventeerimis\w*|metsainventeerimis\w*/u.test(text)
      && /\b(?:metsaregis\w*|metsaressursi\s+arvestuse\s+riiklik\w*\s+registr\w*)/u.test(text)
      && /\b(?:registreeritud|koondatakse|sisaldab)\b/u.test(text)
      && !/\bei\s+(?:ole\s+registreeritud|koondat\w*|sisalda)\b/u.test(text);
  });
  const satisfies = Boolean(umbrella && nationalSummary && smi && propertyRegistry);
  return { satisfies, passages: satisfies ? uniquePassages([umbrella, nationalSummary, smi, propertyRegistry], 4) : [] };
}

export function hasForestryComparisonRole(source) {
  return forestComparisonEvidence(source).satisfies;
}

function forestRegisterEvidence(source) {
  // These are necessary body concepts, not authority/role admission. Avoid
  // sanitizing every unrelated catalogue article for a registry role it cannot
  // satisfy; a possible match still crosses the complete sanitizer and guards.
  const raw = normalize([source.summary, source.answer, source.content].filter(Boolean).join(" ").normalize("NFKC"));
  if (!/\bmetsaregis\w*/u.test(raw)
    || !/\b(?:metsainventeerimis|inventeerimis)\w*/u.test(raw)
    || !/\bkinnistu\w*/u.test(raw)
    || !/\b(?:metsaeraldis|eraldis)\w*/u.test(raw)) return { satisfies: false, passages: [] };
  const passages = comparisonSourcePassages(source);
  const registry = "(?:metsaregis\\w*|registri\\s+andmestik)";
  const affirmative = (value) => {
    const passage = normalize(value);
    return new RegExp(`\\b(?:${registry}|register)\\b[\\s\\S]{0,160}\\b(?:sisaldab|koondab|koondatakse|kuuluvad|sobib)\\b`, "u").test(passage)
      && !new RegExp(`\\b(?:${registry}|register)\\b[\\s\\S]{0,160}\\b(?:ei\\s+sisalda|pole\\s+(?:osa|allik))\\b`, "u").test(passage);
  };
  const identity = passages.find((value) => /\bmetsaregis\w*\b/u.test(normalize(value))
    && /\b(?:riiklik\s+andmekogu|metsaressursi\s+arvestuse\s+riiklik\w*\s+registr\w*)/u.test(normalize(value)));
  const contents = passages.find((value) => affirmative(value) && /\b(?:metsainventeerimis|inventeerimis)\w*/u.test(normalize(value))
    && /\bmetsateatis\w*/u.test(normalize(value)));
  const scope = passages.find((value) => {
    const text = normalize(value);
    return /\bkinnistu\w*/u.test(text) && /\b(?:metsaeraldis\w*|eraldis\w*)/u.test(text)
      && (affirmative(value) || /\basukohakirjeldus\b/u.test(text))
      && !/\bei\s+(?:sisalda|kirjelda|sobi)\b/u.test(text);
  });
  const satisfies = Boolean(identity && contents && scope);
  return { satisfies, passages: satisfies ? uniquePassages([identity, contents, scope]) : [] };
}

export function hasForestRegisterRole(source) {
  return forestRegisterEvidence(source).satisfies;
}


const FOREST_OVERVIEW_ROLES = Object.freeze(["measurement", "method", "condition", "registry"]);
const SMI_2024_PDF_URL = "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI2024/SMI_2024.pdf";
const retainedOverviewPlans = new WeakMap();

function retainOverviewPlan(value, query, plan, sort = "relevance") {
  if (plan?.kind !== "forest-overview" || !plan.strong || !plan.edition?.latestVerified) return;
  for (const witness of Object.values(plan.roleWitnesses)) {
    Object.freeze(witness.passages);
    Object.freeze(witness);
  }
  Object.freeze(plan.roleWitnesses);
  Object.freeze(plan.requiredRoles);
  Object.freeze(plan.edition);
  Object.freeze(plan);
  retainedOverviewPlans.set(value, { query, sort, plan });
}

// This is computation reuse, not a new evidence capability. A copied listing
// has no retained plan, and changed body/policy/date/locator/edition or expired
// eligibility forces the ordinary planner to run again.
export function currentListingEvidencePlan(value, query, documents = value?.items || [], sort = "relevance") {
  const retained = retainedOverviewPlans.get(value);
  if (!retained || retained.query !== query || retained.sort !== sort) return null;
  const plan = retained.plan;
  if (!FOREST_OVERVIEW_ROLES.every((role) => {
    const witness = plan.roleWitnesses[role];
    const matches = documents.filter((source) => source.id === witness.documentId);
    if (matches.length !== 1 || !sourceCanSupportPublicCitation(matches[0]).eligible) return false;
    const source = matches[0];
    if (role === "measurement" && !verifiedSmi2025Edition(source)) return false;
    const binding = sourceEvidenceBinding(source);
    return binding.witnessKey === witness.witnessKey && binding.version === witness.version
      && binding.snapshotHash === witness.snapshotHash;
  })) return null;
  return plan;
}

function smiNationalEvidence(source) {
  const passages = claimBearingEvidenceSourcePassages(source);
  const smiName = "(?:smi|statistilise\\s+metsainvent)";
  if (passages.some((raw) => new RegExp(`\\b${smiName}\\w*\\s+(?:ei\\s+ole|pole|ei\\s+sobi|ei\\s+anna|ei\\s+kirjelda|ei\\s+hinda)\\b`, "u")
    .test(normalize(raw)))) return { satisfies: false, passages: [] };
  const method = forestMeasurementMethodEvidence(source);
  const scope = passages.find((raw) => {
    const passage = normalize(raw);
    const generalized = /\b(?:koostatakse|annab|kirjeldab|hindab|sobib)\b/u.test(passage)
      && /\b(?:kogu\s+eesti|riigi\s+mets\w*)/u.test(passage)
      && (/\buldistat\w*\s+hinnang\w*/u.test(passage)
        || (/\bseisundi\w*/u.test(passage) && /\bmuutus\w*/u.test(passage)));
    return generalized && !/\bei\s+(?:koostata|sobi|anna|kirjelda|hinda)\w*\b/u.test(passage);
  });
  const satisfies = method.satisfies && Boolean(scope);
  return { satisfies, score: satisfies ? method.score : 0, passages: satisfies ? uniquePassages([...method.passages, scope]) : [] };
}

export function hasSmiNationalRole(source) {
  return smiNationalEvidence(source).satisfies;
}

function forestComparisonRolesEvidence(document) {
  const roleEvidence = {
    comparison: forestComparisonEvidence(document),
    method: smiNationalEvidence(document),
    registry: forestRegisterEvidence(document),
  };
  const roles = Object.keys(roleEvidence).filter((role) => roleEvidence[role].satisfies);
  return { satisfies: roles.length > 0, score: roles.length * 100, roles, roleEvidence,
    passages: uniquePassages(roles.flatMap((role) => roleEvidence[role].passages), 6) };
}

function isSmiDefinitionPassage(passage) {
  const text = normalize(passage);
  return /\bstatistiline\s+metsainvent\w*\b/u.test(text) && /\bsmi\b/u.test(text)
    && /\bvalikuuring\w*\b/u.test(text) && /\bproovitukk\w*\b/u.test(text)
    && !/\b(?:ei\s+ole|pole)\b/u.test(text);
}

export function selectSmiDefinitionEvidence(source) {
  const passages = claimBearingEvidenceSourcePassages(source);
  const definition = passages.find(isSmiDefinitionPassage);
  const national = smiNationalEvidence(source);
  const scope = national.passages.find((passage) => !isSmiDefinitionPassage(passage));
  const uncertainty = passages.find((passage) => /\bstatistili\w*\b/u.test(normalize(passage))
    && /\bviga\b/u.test(normalize(passage)) && /\b(?:smi|hinnang\w*|naitaj\w*)\b/u.test(normalize(passage)));
  return { satisfies: Boolean(definition && national.satisfies),
    passages: uniquePassages([definition, scope, uncertainty].filter(Boolean), 3) };
}

function overviewMethodEvidence(document) {
  const definition = selectSmiDefinitionEvidence(document);
  const measurementMethod = forestMeasurementMethodEvidence(document);
  const satisfies = definition.satisfies && measurementMethod.satisfies;
  return { satisfies, passages: satisfies ? definition.passages : [] };
}

function overviewConditionEvidence(document) {
  const passages = claimBearingEvidenceSourcePassages(document);
  const dimensions = [/\bpindala\w*|metsamaa\w*/u, /\b(?:metsa)?tagavara\w*/u,
    /\bvanus\w*|vanuselis\w*/u, /\bkahjust\w*/u, /\belurikk\w*|okoloogili\w*/u,
    /\bkaits\w*/u, /\bkliima\w*|risk\w*/u];
  const measuredStock = passages.find((raw) => {
    const text = normalize(raw);
    return /\b(?:19|20)\d{2}\b/u.test(text) && /\bmetsamaa\s+pindala\b/u.test(text)
      && /\d[\s\S]{0,60}\bhektar\w*/u.test(text)
      && /\d[\s\S]{0,40}\b(?:m3|tihumeet\w*)[\s\S]{0,30}\bpuit\w*/u.test(text);
  });
  const stockChange = passages.find((raw) => {
    const text = normalize(raw);
    return /\b(?:kogu|hektari)?tagavara\w*/u.test(text)
      && /\b(?:vahen\w*|suuren\w*|stabiil\w*|muutusi\s+pole\s+olnud)\b/u.test(text);
  });
  const composition = passages.find((raw) => {
    const text = normalize(raw);
    return /\b(?:puist\w*|mets\w*)/u.test(text)
      && /\bliigili\w*\s+mitmekesis\w*/u.test(text)
      && /\b(?:suuren\w*|vahen\w*)/u.test(text)
      && !/\bei\s+(?:suurene|vahene)\w*/u.test(text);
  });
  const age = passages.find((raw) => {
    const text = normalize(raw);
    return /\bnoor\w*/u.test(text) && /\bvan\w*/u.test(text) && /\bmets\w*/u.test(text)
      && /\bpindala\w*/u.test(text) && /\b(?:suuren\w*|vahen\w*)/u.test(text)
      && !/\bei\s+(?:suurene|vahene)\w*/u.test(text);
  });
  if (measuredStock && stockChange && composition && age) {
    return { satisfies: true, passages: uniquePassages([measuredStock, stockChange, composition, age], 4) };
  }
  const measured = passages.find((raw) => {
    const text = normalize(raw);
    return /\b(?:metsa)?tagavara\w*/u.test(text) && /\b(?:vahen\w*|kasvan\w*|suuren\w*)\b/u.test(text)
      && /\d/u.test(text) && !/\bei\s+(?:vahen|kasva|suuren)\w*\b/u.test(text);
  });
  const ecology = passages.find((raw) => {
    const text = normalize(raw);
    return /\bokoloogili\w*\s+seisund\w*/u.test(text) && /\b(?:looduslik\w*|elurikk\w*)/u.test(text)
      && /\b(?:majanduslik\w*|okosusteem\w*)/u.test(text)
      && !/\bei\s+(?:naita|kirjelda)\w*\b/u.test(text);
  });
  const pressures = passages.find((raw) => {
    const text = normalize(raw);
    return /\bmets\w*/u.test(text) && /\b(?:kliima\w*|kahjust\w*|poud\w*)/u.test(text)
      && /\b(?:vanuselis\w*|liigilis\w*)/u.test(text) && /\b(?:vahen\w*|mojut\w*|muutu\w*)/u.test(text)
      && !/\bei\s+(?:vahen|mojuta|muutu)\w*\b/u.test(text);
  });
  const witnesses = [measured, ecology, pressures].filter(Boolean);
  const text = normalize(witnesses.join(" "));
  const satisfies = witnesses.length === 3 && dimensions.filter((pattern) => pattern.test(text)).length >= 3;
  return { satisfies, passages: satisfies ? uniquePassages(witnesses) : [] };
}

function overviewRegistryEvidence(document) {
  const register = forestRegisterEvidence(document);
  if (!register.satisfies) return { satisfies: false, passages: [] };
  const passages = claimBearingEvidenceSourcePassages(document);
  const intention = passages.find((raw) => {
    const text = normalize(raw);
    return /\bmetsateatis\w*\b/u.test(text)
      && /\b(?:ei\s+ole\s+koiki|ei\s+ole[\s\S]{0,60}realiseer\w*|ei\s+toenda[\s\S]{0,60}(?:tehtud|toimun\w*)|kavandatav\w*)\b/u.test(text);
  });
  const distribution = passages.find((raw) => {
    const text = normalize(raw);
    return /\bmetsaregis\w*/u.test(text) && /\b(?:metsaportaal\w*|geoserver\w*|wms|wfs)\b/u.test(text);
  });
  return { satisfies: true,
    passages: uniquePassages([...register.passages, intention, distribution].filter(Boolean), 5) };
}

function verifiedSmi2025Edition(document) {
  return sameSourceResource(document?.url, SMI_2025_TABLES_URL)
    && document?._smiEdition?.artifactSha256 === SMI_2025_EDITION.artifactSha256
    && document?._smiEdition?.verifiedAt === SMI_2025_EDITION.verifiedAt
    && clean(document?.dataAsOf) === "18.08.2026"
    && hasIndependentEvidenceCapability(document) && sourceWitnessKey(document) !== null;
}

function measurementEdition(query, documents, now = Date.now()) {
  const year = requestedQueryYear(query);
  const revised = requestsSmi2025HistoricalRow(query);
  const workbook = documents.find((document) => verifiedSmi2025Edition(document)
    && resultPublishedAt(document) <= now
    && forestAreaOnlyEvidence(document, revised ? "2024" : "2025").satisfies);
  if (workbook && (!year || year === "2025" || revised)) return {
    year: 2025, dataYear: revised ? 2024 : 2025, revised,
    publishedAt: SMI_2025_EDITION.publishedAt, dataAsOf: SMI_2025_EDITION.dataAsOf,
    latestVerified: !year && !revised, artifactSha256: SMI_2025_EDITION.artifactSha256,
    locator: revised ? SMI_2025_EDITION.historicalLocator : SMI_2025_EDITION.measurementLocator,
    revisionReason: null, resourceKey: sourceResourceKey(workbook.url),
  };
  const historical = documents.find((document) => sameSourceResource(document?.url, SMI_2024_PDF_URL)
    && hasIndependentEvidenceCapability(document) && forestAreaOnlyEvidence(document).satisfies);
  if (historical && (!year || year === "2024") && !revised) return {
    year: 2024, dataYear: 2024, revised: false, latestVerified: false,
    publishedAt: clean(historical.published), dataAsOf: clean(historical.dataAsOf) || null,
    locator: historical.locator || null, resourceKey: sourceResourceKey(historical.url),
  };
  return null;
}

function overviewEvidenceForDocument(document, edition = null) {
  const measurement = forestAreaOnlyEvidence(document, edition ? String(edition.dataYear) : "");
  const measurementPassage = measurement.passages.find((passage) => {
    const text = normalize(passage);
    return /\beesti\w*\b/u.test(text) && /\bmetsamaa\w*\b/u.test(text)
      && /\b(?:19|20)\d{2}\b/u.test(text)
      && (!edition || (sameSourceResource(document.url, edition.resourceKey)
        && containsEvidenceYear(passage, String(edition.dataYear))))
      && (/\b(?:kogu\s+eesti|eesti)[\s\S]{0,100}\bpindala\w*\b/u.test(text)
        || (edition?.revised && /\bmetsamaa\s+pindala\b/u.test(text)));
  });
  const roleEvidence = {
    measurement: { satisfies: Boolean(measurementPassage), passages: measurementPassage ? [measurementPassage] : [] },
    method: overviewMethodEvidence(document),
    condition: overviewConditionEvidence(document),
    registry: overviewRegistryEvidence(document),
  };
  const roles = FOREST_OVERVIEW_ROLES.filter((role) => roleEvidence[role].satisfies);
  return { satisfies: roles.length > 0, score: roles.length * 100, roles, roleEvidence,
    passages: uniquePassages(roles.flatMap((role) => roleEvidence[role].passages), 8) };
}

function evidenceVersion(document) {
  return sourceEvidenceBinding(document).version;
}


function compareForestryFacts(left, right, sort = "relevance") {
  const leftTuple = sort === "newest" ? left._ranking.factNewestTuple : left._ranking.factTuple;
  const rightTuple = sort === "newest" ? right._ranking.factNewestTuple : right._ranking.factTuple;
  for (let index = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] !== rightTuple[index]) return rightTuple[index] > leftTuple[index] ? 1 : -1;
  }
  return clean(left.title).normalize("NFKC").localeCompare(clean(right.title).normalize("NFKC"), "et")
    || clean(left.id).localeCompare(clean(right.id), "et")
    || clean(sourceWitnessKey(left)).localeCompare(clean(sourceWitnessKey(right)), "et")
    || clean(evidenceVersion(left)).localeCompare(clean(evidenceVersion(right)), "et");
}

function genericForestryEvidence(intent, document) {
  const requiredIds = new Set(intent?.serviceDocumentIds || []);
  const groups = Array.isArray(intent?.evidenceGroups) ? intent.evidenceGroups : [];
  if (!requiredIds.has(document?.id) || !groups.length) {
    return { satisfies: false, score: 0, passages: [], roles: [], matchedGroupIndexes: [] };
  }
  const passages = evidenceSourcePassages(document);
  const normalizedGroups = groups.map((group) => (group || []).map(normalize).filter(Boolean));
  const passageMatches = passages.map((passage) => {
    const text = normalize(passage);
    const disclaimerOnly = passageDisclaimsEvidence(passage);
    const matchedGroupIndexes = normalizedGroups
      .map((alternatives, index) => {
        const requiresDisclaimer = alternatives.some((alternative) => passageContainsEvidenceDisclaimer(alternative));
        return (!disclaimerOnly || requiresDisclaimer)
          && alternatives.some((alternative) => text.includes(alternative))
          ? index
          : -1;
      })
      .filter((index) => index >= 0);
    return { passage, matchedGroupIndexes };
  });
  const matchedGroupIndexes = [...new Set(passageMatches.flatMap((item) => item.matchedGroupIndexes))];
  const uncoveredGroups = new Set(matchedGroupIndexes);
  const selectedMatches = [];
  // The increment explanation has several short, separately verifiable
  // method steps. Preserve them instead of stopping after the first four
  // passages and silently omitting how the two methods differ.
  const maximumSelectedPassages = intent?.kind === "increment-method" ? 7 : 4;
  while (uncoveredGroups.size && selectedMatches.length < maximumSelectedPassages) {
    const next = passageMatches
      .map((item, index) => ({
        item,
        index,
        adds: item.matchedGroupIndexes.filter((groupIndex) => uncoveredGroups.has(groupIndex)).length,
      }))
      .filter((candidate) => candidate.adds > 0 && !selectedMatches.includes(candidate.item))
      .sort((left, right) => right.adds - left.adds
        || right.item.matchedGroupIndexes.length - left.item.matchedGroupIndexes.length
        || left.index - right.index)[0];
    if (!next) break;
    selectedMatches.push(next.item);
    for (const groupIndex of next.item.matchedGroupIndexes) uncoveredGroups.delete(groupIndex);
  }
  // Greedy coverage chooses the smallest useful passage set, but the public
  // explanation must still read in the order used by the reviewed source.
  const selectedPassages = selectedMatches
    .sort((left, right) => passageMatches.indexOf(left) - passageMatches.indexOf(right))
    .map((item) => item.passage);
  const coverage = matchedGroupIndexes.length / Math.max(1, normalizedGroups.length);
  return {
    satisfies: matchedGroupIndexes.length === normalizedGroups.length,
    score: matchedGroupIndexes.length * 32 + coverage * 40 + (matchedGroupIndexes.length ? 18 : 0),
    passages: selectedPassages,
    roles: [],
    matchedGroupIndexes,
  };
}

function beetlePassageMatchesYear(passage, year) {
  // A year attached to the query word still constrains the observation. In
  // evidence it must be a whole year in a factual monitoring/data sentence,
  // not part of a site ID or an explicit statement that the data is absent.
  const yearPattern = new RegExp(`(?<!\\d)${year}(?!\\d)`, "u");
  const identifierPattern = new RegExp(`\\b(?:kood\\w*|tunnus\\w*|id)(?:\\s+\\w+){0,2}\\s*[:=]?\\s*${year}(?!\\d)`, "u");
  return String(passage || "").split(/[!?]\s+|(?<!\d)\.\s+|\.\s+(?=\p{Lu}|(?:19|20)\d{2})/u).some((sentence) => {
    const text = normalize(sentence);
    return yearPattern.test(text) && !identifierPattern.test(text)
      && /\b(?:seir\w*|andm\w*|tulemus\w*|puunis\w*)\b/u.test(text)
      && /\b(?:alates|seisuga|loendat\w*|puut\w*|seirati|registreerit\w*|moodet\w*|tuvastat\w*|leiti|kogut\w*|arv\w*|keskmis\w*|andmestik\w*)\b/u.test(text)
      && !passageDisclaimsEvidence(sentence)
      && !/\b(?:tutvuda\s+siin|vaata\s+siit|leiab\s+siit|link\w*)\b/u.test(text)
      && !/\bei\s+(?:esita\w*|sisald\w*|ole\w*|kajasta\w*|leidu\w*|teht\w*)\b/u.test(text);
  });
}

function intentEvidenceForDocument(intent, document, edition = null, year = "") {
  if (intent?.kind === "smi-definition") {
    const definition = selectSmiDefinitionEvidence(document);
    return { ...definition, score: definition.satisfies ? 100 : 0, roles: definition.satisfies ? ["method"] : [] };
  }
  if (intent?.kind === "forest-overview") return overviewEvidenceForDocument(document, edition);
  if (intent?.kind === "forest-area") return forestAreaEvidence(document, year || (edition ? String(edition.dataYear) : ""));
  if (intent?.kind === "forest-area-method") {
    const area = forestAreaOnlyEvidence(document);
    const method = smiNationalEvidence(document);
    const roles = [area.satisfies ? "measurement" : null, method.satisfies ? "method" : null].filter(Boolean);
    return { satisfies: roles.length > 0, score: area.score + method.score, roles,
      passages: uniquePassages([...area.passages, ...method.passages], 4) };
  }
  if (intent?.kind === "forest-depletion") return forestDepletionEvidence(document);
  if (intent?.kind === "forest-data-sources") return forestComparisonRolesEvidence(document);
  return genericForestryEvidence(intent, document);
}

function forestBalanceClaimEvidence(query, document) {
  const smiBalance = validatedSmiHarvestBalanceProjection(document);
  if (smiBalance) {
    // The same edition publishes both sides of the comparison: the annual
    // increment and the felling volume of the newest year.
    return {
      satisfies: true,
      score: 0,
      roles: ["measurement"],
      passages: claimBearingEvidenceSourcePassages(document),
    };
  }
  const projection = hasValidatedForestBalanceProjection(document) ? validatedForestBalanceProjection(document) : null;
  if (projection) {
    const year = requestedQueryYear(query);
    const count = /\b(?:viimase\s+(?:5|viie)|5\s+aasta|viie\s+aasta|viis\s+aastat)\b/iu.test(String(query)) ? 5 : 1;
    const cohort = year ? projection.observations.filter((item) => item.year === Number(year))
      : projection.observations.slice(-count);
    const complete = cohort.length === (year ? 1 : count)
      && cohort.every((item) => item.increment !== null && item.removals !== null);
    return {
      satisfies: true, score: 0, roles: complete ? ["measurement", "cohort"] : ["availability"],
      passages: claimBearingEvidenceSourcePassages(document),
    };
  }
  const passages = claimBearingEvidenceSourcePassages(document);
  const method = passages.find((value) => {
    const text = normalize(value);
    return /\bnetojuurdekasv\w*/u.test(text) && /\b(?:maha|lahutat\w*|arvat\w*)\b/u.test(text)
      && /\bsuremus\w*|suremis\w*/u.test(text);
  });
  const definition = passages.find((value) => {
    const text = normalize(value);
    return /\bremovals\b/u.test(text) && /\belusa\w*/u.test(text) && /\bsurnud\b/u.test(text)
      && /\bkoorega\b/u.test(text)
      && !/\b(?:ei\s+sisalda|ei\s+holma|pole)\b/u.test(text);
  });
  const qualifier = passages.find((value) => {
    const text = normalize(value);
    return /\bremovals\b/u.test(text) && /\bsmi\b/u.test(text)
      && /\b(?:ei\s+ole|ei\s+vordu)\b/u.test(text);
  });
  const witnesses = uniquePassages([method, ...(definition && qualifier ? [definition, qualifier] : [])].filter(Boolean));
  return { satisfies: witnesses.length > 0, score: 0, roles: witnesses.length ? ["method"] : [], passages: witnesses };
}
export { retainOverviewPlan, measurementEdition, forestAreaOnlyEvidence, forestAreaEvidence, forestDepletionEvidence,
  forestComparisonRolesEvidence, forestRegisterEvidence, FOREST_OVERVIEW_ROLES,
  smiNationalEvidence, overviewEvidenceForDocument, factCheckEvidence, requestedQueryYear,
  requestedPeriodQuery, measurementPassagesContainRequestedYear, containsEvidenceYear,
  compareForestryFacts, genericForestryEvidence, beetlePassageMatchesYear,
  intentEvidenceForDocument, forestBalanceClaimEvidence, uniquePassages };
