import {
  ADMIN_CONTEXT_ROOTS,
  AMBIGUOUS_ROOTS,
  GENERIC_QUERY_CONTEXT_TERMS,
  STOP_WORDS,
  forestEvidenceIntent,
  isTopicDataOverviewQuery,
  normalize,
  queryTerms,
  rootIsDomain,
  textHasActionRoot,
  textHasQueryRoot,
} from "./search_query_terms.mjs";
import { forestrySourcePreference } from "./forestry-source-policy.mjs";
import {
  classifyForestryGeographyScope,
  isReviewedEstonianCountyIdentity,
  isReviewedEstonianMunicipalityIdentity,
} from "./municipalities.mjs";

const AGENCY_SOURCE_PREFERENCE = 0.5;
const AGENCY_COMPARABLE_SCORE_SHARE = 0.8;

export function scoreDocument(document, query, { bridgeRoots = null } = {}) {
  const normalizedQuery = normalize(query);
  const words = bridgeRoots instanceof Set ? [...bridgeRoots] : queryTerms(query);
  if (!words.length) return 0;

  const fields = {
    title: normalize(document.title),
    tags: normalize((document.tags || []).join(" ")),
    summary: normalize(document.summary),
    excerpt: normalize(document.excerpt),
    content: normalize(document.content),
    organization: normalize(document.organization),
    answer: normalize(document.answer),
  };

  let score = 0;
  if (normalizedQuery.length >= 5 && fields.title.includes(normalizedQuery)) score += 18;
  if (normalizedQuery.length >= 5 && fields.tags.includes(normalizedQuery)) score += 12;
  if (normalizedQuery.length >= 5 && fields.summary.includes(normalizedQuery)) score += 6;
  if (normalizedQuery.length >= 5 && fields.excerpt.includes(normalizedQuery)) score += 5;
  if (normalizedQuery.length >= 5 && fields.content.includes(normalizedQuery)) score += 3;
  if (normalizedQuery.length >= 5 && fields.answer.includes(normalizedQuery)) score += 5;

  for (const word of [...new Set(words)]) {
    if (word.length < 2) continue;
    if (textHasQueryRoot(fields.title, word)) score += 7;
    if (textHasQueryRoot(fields.tags, word)) score += 5;
    if (textHasQueryRoot(fields.summary, word)) score += 2;
    if (textHasQueryRoot(fields.excerpt, word)) score += 2;
    if (textHasQueryRoot(fields.content, word)) score += 1;
    if (textHasQueryRoot(fields.organization, word)) score += 1;
    if (textHasQueryRoot(fields.answer, word)) score += 3;
  }

  const namedForestRegisterOverview = words.includes("metsaregister")
    && !words.some((word) => [
      "smi", "kataster", "kinnistu", "metsateatis", "raie", "juurdekasv", "vordlus",
      "wms", "wfs", "geojson", "ruumikiht",
    ].includes(word));
  if (namedForestRegisterOverview) {
    if (document.id === "metsaregister") score += 40;
    else if (document.id === "forest-register-workflow") score += 30;
    else if (document.id === "official-geoserver") score += 24;
  }

  return score;
}

export function documentRoots(document) {
  return new Set(queryTerms([
    document.title,
    ...(document.tags || []),
    document.summary,
    document.excerpt,
    document.content,
    document.answer,
    document.organization,
  ].filter(Boolean).join(" ")));
}

function evidencePassages(document) {
  return [
    document.summary,
    document.excerpt,
    document.answer,
    document.content,
  ]
    .filter(Boolean)
    .flatMap(splitTextPassages);
}

function passageMatchesTerms(passage, terms) {
  const passageRoots = new Set(queryTerms(passage));
  return terms.filter((term) => passageRoots.has(term) || textHasQueryRoot(passage, term));
}

const EVIDENCE_DISCLAIMER_PATTERN = /\bei\s+(?:(?:saa|pruugi)\s+)?(?:toenda|kinnita|kirjelda|naita|asenda)\b/u;

export function passageContainsEvidenceDisclaimer(passage) {
  return EVIDENCE_DISCLAIMER_PATTERN.test(normalize(passage));
}

export function passageDisclaimsEvidence(passage) {
  const text = normalize(passage);
  const disclaimerIndex = text.search(EVIDENCE_DISCLAIMER_PATTERN);
  if (disclaimerIndex < 0) return false;
  const affirmativePrefix = text.slice(0, disclaimerIndex);
  return !/\b(?:on|oli|olid|kehtib|kehtivad|tahendab|moodustab|moodustas|tuleb|saab|annab|kasutab|koondab|kirjeldab|naitab|valis|avaldati|ulatub|kasvas|kahanes)\b/u
    .test(affirmativePrefix);
}

const NATIONAL_REPORT_PATHS = new Set([
  "/et/teemad/vesi/pohjavesi",
  "/sites/default/files/Teemad/VESI/põhjavesi/2025_põhjaveebilansi aastaaruanne.pdf",
  "/sites/default/files/Teemad/VESI/põhjavesi/2025 Põhjaveekogumite ja nitraaditundliku ala seirearuanne.pdf",
  "/sites/default/files/Teemad/Mets/Puidubilanss 2023.pdf",
]);

function documentCanDirectlyAnswerQuery(query, document) {
  // These report excerpts contain national totals, not territorial splits.
  // Place names may be harmless context for a directory route, but must not
  // turn Estonia's total into a local or another country's measurement.
  let nationalReport = false;
  try {
    const url = new URL(document?.url);
    nationalReport = /(^|\.)keskkonnaportaal\.ee$/u.test(url.hostname)
      && NATIONAL_REPORT_PATHS.has(decodeURIComponent(url.pathname).replace(/\/$/u, ""));
  } catch { /* Invalid URLs cannot establish a national source identity. */ }
  if (nationalReport) {
    const namesLocalArea = queryTerms(query).some((term) => ADMIN_CONTEXT_ROOTS.has(term)
      || isReviewedEstonianCountyIdentity(term) || isReviewedEstonianMunicipalityIdentity(term));
    if (namesLocalArea || classifyForestryGeographyScope(query).kind === "foreign-or-other-region") return false;
  }
  // Typed CSV evidence is allowed to answer only through its validator and
  // deterministic composer. If that contract rejects an incomplete temporal
  // intent or impossible observation, the generic lexical fallback must not
  // re-promote the same document from its prose fields.
  if (document?.id === "municipal-waste-recycling") return false;
  if (document?.id !== "municipal-waste-recycling-page") return true;
  const text = normalize(query);
  const asksForTarget = /\b(?:sihttase|eesmark)\w*/u.test(text);
  const asksWhetherTargetWasMet = /\b(?:saavut|tait|joud|tegelik|moodet|tulemus)\w*/u.test(text)
    || /\bon\s+(?:\d{4}\s+)?(?:sihttasem|eesmarg)\w*/u.test(text);
  return asksForTarget && !asksWhetherTargetWasMet;
}

// Words that carry no environment subject of their own. A ranked set that
// matches only these filler words is not "related" to the question, so the
// answer must not claim to have found related official results for it.

const DOCUMENT_SEARCH_TEXT_CACHE = new WeakMap();
function documentSearchText(document) {
  if (!document || typeof document !== "object") return "";
  const cached = DOCUMENT_SEARCH_TEXT_CACHE.get(document);
  if (cached !== undefined) return cached;
  const text = normalize([
    document.title,
    ...(document.tags || []),
    document.summary,
    document.excerpt,
    document.content,
    document.answer,
    document.organization,
  ].filter(Boolean).join(" "));
  DOCUMENT_SEARCH_TEXT_CACHE.set(document, text);
  return text;
}

// A capitalized word after the sentence-opening token is an explicit subject:
// a place, register, organisation or species the answer must actually mention.
// This keeps broad qualitative answers from replying to "Emajões" with a
// national water report or to "RMK" with generic forest statistics.
function explicitSubjectTerms(query) {
  const tokens = String(query || "").split(/\s+/u).filter(Boolean);
  const firstWord = normalize(tokens[0] || "").replace(/[^\p{L}\p{N}]+/gu, "");
  const startsWithQuestionWord = /^(?:kuidas|missugune|milline|mis|mida|kes|kuhu|kus|kust|kui|kas|millal|miks|mitu|kuivord)$/u.test(firstWord);
  const words = tokens.slice(startsWithQuestionWord ? 1 : 0);
  return [...new Set(words
    .filter((word) => /^\p{Lu}/u.test(word) && word.replace(/[^\p{L}\p{N}]+/gu, "").length >= 3)
    .map((word) => normalize(word).replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((word) => word && !STOP_WORDS.has(word)))];
}

function textHasExplicitSubject(text, subject) {
  if (textHasQueryRoot(text, subject)) return true;
  // Inflected proper names ("Emajões") lose their case ending before the
  // document word ("Emajõe"). Try one short stem for named subjects only.
  if (subject.length >= 5) {
    for (const suffix of ["s", "d", "e", "a", "u", "i", "t", "l", "n"]) {
      if (!subject.endsWith(suffix)) continue;
      const stem = subject.slice(0, -1);
      if (stem.length >= 5 && textHasQueryRoot(text, stem)) return true;
    }
  }
  return false;
}

// A fact-check answer must rest on the source's own correction of a disputed
// statement, not on a title, tag or a generic amount. Numbered allegation
// lists ("1. … valeandmeid. Nende andmed on korrektsed …") and unnumbered
// allegation/correction prose both qualify, but only when both sides occur in
// body passages and share the question's subject.
const FACT_CHECK_CLAIM_START = /^\d{1,2}[.)]\s*\p{Lu}/u;
const FACT_CHECK_NUMBERED_MARKER = /^\d{1,2}[.)]$/u;
const FACT_CHECK_CORRECTION_MARKER = /\b(?:vale|valeks|ei\s+vasta\s+toele|tegelikult|tegelikkuses|lukkab\s+umber|lukatakse\s+umber|on\s+vale|ei\s+ole\b|ei\s+oleks\b|korrektsed|korrektne|oige\s+on|ei\s+tohi\s+uletada|alahindamine|erinevused\s+tulenevad|klapivad)\b/u;
const FACT_CHECK_ALLEGATION_MARKER = /\b(?:valevait\w*|valeandm\w*|valeinfo\w*|vaidetakse|hinnangul|ulerai\w*|otsas|ei\s+ole)\b/u;
const FACT_CHECK_INTENT_TERMS = new Set([
  "levinud", "valevaited", "valevait", "valeandmed", "valeandm", "valeinfo",
  "muut", "muudi", "muuti", "umber", "lukkab", "lukatakse", "kaivad", "tosi",
]);

function factCheckSubjectTerms(terms) {
  return terms.filter((term) => term.length >= 4 && !FACT_CHECK_INTENT_TERMS.has(term));
}

function documentCarriesFactCheckPair(document, terms) {
  const passages = evidencePassages(document).map((passage) => String(passage || "").trim()).filter(Boolean);
  if (!passages.length) return false;
  const subjects = factCheckSubjectTerms(terms);
  const hasSubject = (value) => subjects.length === 0
    || subjects.some((subject) => textHasQueryRoot(value, subject));
  const marker = passages.findIndex((passage) => FACT_CHECK_CLAIM_START.test(passage)
    || FACT_CHECK_NUMBERED_MARKER.test(passage));
  if (marker >= 0) {
    const body = passages.slice(marker + 1);
    return body.some((passage) => FACT_CHECK_ALLEGATION_MARKER.test(normalize(passage)) && hasSubject(passage))
      && body.some((passage) => FACT_CHECK_CORRECTION_MARKER.test(normalize(passage)) && hasSubject(passage));
  }
  return passages.some((passage) => FACT_CHECK_ALLEGATION_MARKER.test(normalize(passage)) && hasSubject(passage))
    && passages.some((passage) => FACT_CHECK_CORRECTION_MARKER.test(normalize(passage)) && hasSubject(passage));
}

export function assessEvidence(query, documents = []) {
  const terms = queryTerms(query);
  // Among documents that directly answer, Keskkonnaagentuur and its portal go
  // first. The broad path matches loosely, so it keeps relevance order.
  // Every check below still applies, and a far weaker match cannot jump ahead.
  const topCandidateScore = Number(documents?.[0]?.score || 0);
  const inSourceOrder = (matches, candidateList) => matches
    .map((match, index) => ({
      match,
      agency: forestrySourcePreference(candidateList[index]) >= AGENCY_SOURCE_PREFERENCE
        && Number(candidateList[index].score || 0) >= topCandidateScore * AGENCY_COMPARABLE_SCORE_SHARE,
    }))
    .sort((left, right) => Number(right.agency) - Number(left.agency))
    .map(({ match }) => match);
  const documentForMatch = (match, candidateList) => candidateList.find((document) => document.id === match.id);
  const factCheckIntent = forestEvidenceIntent(query)?.kind === "forest-fact-check";
  const factCheckDocument = (document) => !factCheckIntent || documentCarriesFactCheckPair(document, terms);
  const evidenceDomainTerms = terms.filter((term) => rootIsDomain(term)
    && !ADMIN_CONTEXT_ROOTS.has(term));
  const broadGenericIntent = !isTopicDataOverviewQuery(query, terms)
    && terms.filter((term) => !ADMIN_CONTEXT_ROOTS.has(term)).length === 1
    && evidenceDomainTerms.length === 1
    && AMBIGUOUS_ROOTS.has(evidenceDomainTerms[0]);
  const requiredDomainTerms = terms.filter((term) => rootIsDomain(term)
    && !["andmed", "keskkond", "seire"].includes(term));
  const candidates = (documents || []).slice(0, 8);
  const topScore = Number(candidates[0]?.score || 0);
  const matched = new Set();
  const perDocument = [];
  for (const document of candidates) {
    const roots = documentRoots(document);
    const documentMatches = terms.filter((term) => roots.has(term));
    perDocument.push({
      id: document.id,
      matchedTerms: documentMatches,
      coverage: terms.length ? documentMatches.length / terms.length : 0,
    });
    for (const term of terms) {
      if (roots.has(term)) matched.add(term);
    }
  }
  const coverage = terms.length ? matched.size / terms.length : 0;
  const mandateOrganization = /^mida\s+teeb\s+/u.test(normalize(query))
    && terms.length === 1
    && ["keskkonnaamet", "keskkonnaagentuur", "kliimaministeerium", "rmk"].includes(terms[0]);
  const mandatePassage = (value) => !mandateOrganization
    || (textHasQueryRoot(value, terms[0])
      && /\b(?:teeb|tegevus\w*|ulesanne\w*|ülesanne\w*|haldab|korraldab|vastutab|pakub)\b/u.test(normalize(value)));
  const years = normalize(query)
    .replace(/\bnatura\s+2000\b/gu, "natura")
    .match(/\b(?:19|20)\d{2}\b/gu) || [];
  const requiredMatches = Math.min(2, Math.max(1, terms.length));
  // A misconception question is answered by the source's own assertion and
  // correction pair, not by repeating its wording. This is intent-specific:
  // the ordinary term-coverage path below is untouched for every other query.
  const directDocument = broadGenericIntent ? null : factCheckIntent
    ? perDocument.find((_match, index) => documentCanDirectlyAnswerQuery(query, candidates[index])
      && documentCarriesFactCheckPair(candidates[index], terms))
    : inSourceOrder(perDocument, candidates).find((match) => {
      const document = documentForMatch(match, candidates);
      if (!documentCanDirectlyAnswerQuery(query, document)) return false;
      const passageTerms = terms.filter((term) => !ADMIN_CONTEXT_ROOTS.has(term));
      const requiredPassageMatches = passageTerms.length <= 3
        ? passageTerms.length
        : Math.ceil(passageTerms.length * 0.75);
      const directPassage = evidencePassages(document).some((passage) => {
        const passageText = normalize(passage);
        if (passageDisclaimsEvidence(passage)) return false;
        const passageMatches = passageMatchesTerms(passage, terms);
        const requiredMatches = passageMatches.filter((term) => passageTerms.includes(term));
        // A reviewed source's own data year counts as stating that year: the
        // SMI page gives 2025 shares without repeating "2025" in each sentence.
        return years.every((year) => passageText.includes(year) || String(document.dataYear || "") === year)
          && mandatePassage(passage)
          && requiredDomainTerms.every((term) => passageMatches.includes(term))
          && requiredMatches.length >= requiredPassageMatches;
      });
      return match.matchedTerms.length >= requiredMatches
        && match.coverage >= 0.45
        && requiredDomainTerms.every((term) => match.matchedTerms.includes(term))
        && directPassage;
    });
  const yearsCovered = years.length === 0 || Boolean(directDocument);
  const strong = candidates.length > 0
    && topScore >= 10
    && Boolean(directDocument);

  // Qualitative, open questions ("miks …", "kuidas …", "mida teeb …") rarely
  // repeat every word of the source. When one actual passage carries the
  // question's primary subject and any explicitly named place/actor, a cited
  // synthesis is still safer and more useful than a blanket refusal. Numeric
  // or year-bound questions keep the strict path so a side fact cannot answer
  // a measurement the evidence does not contain.
  const normalizedQuery = normalize(query);
  const asksForMeasurement = years.length > 0
    || /\b(?:kui\s+palju|mitu|arv|kogus|maht|pindala|protsent|osakaal|tase|hind|temperatuur|heide|heitkogus|saastekogus)\b/u.test(normalizedQuery);
  const explicitSubjects = explicitSubjectTerms(query);
  const optionalContext = new Set(["kodus", "keskkond", "andmed", "seire", "eesti", "eestis", "riik"]);
  const broadDomainTerms = terms.filter((term) => rootIsDomain(term)
    && !optionalContext.has(term)
    && !GENERIC_QUERY_CONTEXT_TERMS.has(term)
    && !ADMIN_CONTEXT_ROOTS.has(term));
  const preferredSubject = [...terms]
    .filter((term) => !ADMIN_CONTEXT_ROOTS.has(term) && !GENERIC_QUERY_CONTEXT_TERMS.has(term))
    .sort((left, right) => (Number(rootIsDomain(right)) - Number(rootIsDomain(left))) || right.length - left.length)[0] || null;
  const actionTerms = terms.filter((term) => term.length >= 5 && /(?:da|ma|mine|takse|tud|nud)$/u.test(term)
    || ["touseb", "tousnud", "tous", "tarbib", "tarbimine", "muutub", "muutunud", "vaheneb", "suureneb", "kahaneb", "kasvab"]
      .includes(term))
    .filter((term) => !GENERIC_QUERY_CONTEXT_TERMS.has(term));
  const stateTerms = terms.filter((term) => /^(?:haig|vigast|surnud|hukkunud)/u.test(term));
  const itemTerms = terms.filter((term) => ["arvuti", "kulmkapp", "kulmik", "telefon", "patarei", "moobel", "diivan", "ravim", "rehv"].includes(term));
  const organizationTerms = terms.filter((term) => ["keskkonnaamet", "keskkonnaagentuur", "kliimaministeerium", "rmk"].includes(term));
  const locationQuestion = /\b(?:kus|kust|kuhu)\s+(?:asub|asuvad|paikneb|paiknevad|on)\b/u.test(normalizedQuery);
  const broadDocument = (strong || asksForMeasurement || broadGenericIntent || locationQuestion || !preferredSubject)
    ? null
    : perDocument.find((match, index) => {
      const document = candidates[index];
      if (document._answerEvidenceEligible === false || document.evidencePolicy === "route-only" || document.delivery === "structured-or-download") return false;
      if (!documentCanDirectlyAnswerQuery(query, document)) return false;
      if (!factCheckDocument(document)) return false;
      const primarySubject = [...match.matchedTerms]
        .filter((term) => !GENERIC_QUERY_CONTEXT_TERMS.has(term))
        .sort((left, right) => (Number(rootIsDomain(right)) - Number(rootIsDomain(left))) || right.length - left.length)[0] || null;
      if (!primarySubject) return false;
      const documentText = documentSearchText(document);
      if (!explicitSubjects.every((subject) => textHasExplicitSubject(documentText, subject))) return false;
      return evidencePassages(document).some((passage) => {
        if (passageDisclaimsEvidence(passage)) return false;
        const passageMatches = passageMatchesTerms(passage, terms);
        return passageMatches.includes(primarySubject)
          && mandatePassage(passage)
          && (explicitSubjects.length > 0
            ? explicitSubjects.every((subject) => textHasExplicitSubject(passage, subject))
            : broadDomainTerms.every((term) => passageMatches.includes(term)))
          && actionTerms.every((term) => textHasActionRoot(passage, term))
          && stateTerms.every((term) => textHasQueryRoot(passage, term))
          && itemTerms.every((term) => textHasQueryRoot(passage, term))
          && organizationTerms.every((term) => textHasQueryRoot(passage, term))
          && passageMatches.some((term) => !GENERIC_QUERY_CONTEXT_TERMS.has(term));
      });
    });
  // A law section near the top that names the question's own subject (säilikpuu,
  // juuremädanik) is read by the model even when the wording differs: law says
  // "uuendada" where a reader writes "istutada", and its quantities are rules,
  // not statistics. The model's own checks still decide whether it answers.
  // The subject is a noun: verb forms ("lennutada", "varastati") appear all
  // over the law and say nothing about which section answers.
  const lawSubject = [...terms]
    .filter((term) => !ADMIN_CONTEXT_ROOTS.has(term) && !GENERIC_QUERY_CONTEXT_TERMS.has(term))
    .filter((term) => !/(?:[aeiu]da|tati|takse|tud|nud)$/u.test(term))
    // "tohib" and "taotlema" become these roots; they name the question type, not its subject.
    .filter((term) => !["lubatavus", "piirang", "menetlus", "taotlemine"].includes(term))
    .filter((term) => term.length >= 7);
  // Any of the specific nouns will do, and an inflected form counts: the law
  // says "enne raiesmiku uuenemist" where a reader writes "uuenemata", and
  // "äravedu langilt" where the question also names "loometsas".
  const namesLawSubject = (passage) => lawSubject.some((term) => textHasQueryRoot(passage, term)
    || normalize(passage).includes(term.slice(0, Math.max(6, term.length - 3))));
  const lawDocument = strong || broadDocument || !lawSubject.length || years.length
    ? null
    : candidates.slice(0, 3).find((document) => document?._lawSection
      && documentCanDirectlyAnswerQuery(query, document)
      && evidencePassages(document).some((passage) => !passageDisclaimsEvidence(passage)
        && namesLawSubject(passage)));
  const answerable = strong || Boolean(broadDocument) || Boolean(lawDocument);
  return {
    strong,
    answerable,
    broad: Boolean(broadDocument || lawDocument),
    topScore,
    coverage,
    matchedTerms: [...matched],
    terms,
    yearsCovered,
    directDocumentId: directDocument?.id || broadDocument?.id || lawDocument?.id || null,
    broadDocumentId: broadDocument?.id || lawDocument?.id || null,
  };
}

// "Leidsin küsimusega seotud ametlikke tulemusi" is a factual claim: the
// question's own subject has to be present in the ranked set, i.e. at least one
// specific content term must match. Filler words ("andmed") are excluded
// because incidental matches on them never make unrelated documents related.
export function rankedSetCoversSubject(query, documents = []) {
  const quality = assessEvidence(query, documents);
  if (!quality.terms.length) return (documents || []).length > 0;
  return quality.matchedTerms.some((term) => !GENERIC_QUERY_CONTEXT_TERMS.has(term)
    && !ADMIN_CONTEXT_ROOTS.has(term));
}

export function splitTextPassages(value = "") {
  // A semicolon in a parenthetical alias is not a new claim (SMI; ingl NFI).
  // A law's numbered subsection "(2) …" starts a new sentence, so a "not" in
  // one subsection is never compared against a quote of the one before it.
  return String(value || "")
    .split(/(?:\n+|(?<=[.!?])\s+(?=[„“”"']*(?:\p{Lu}|\p{N}|\(\d+\p{No}*\)))|\s*(?:[…•]|;(?![^()]*\))|(?<!\([^()]*);)\s*)/u)
    .map((passage) => passage.trim())
    .filter(Boolean);
}
export function hasCompleteSentenceEnding(value = "") {
  return /[.!?](?:[”"'’)\]]*)$/u.test(String(value || "").trim());
}
