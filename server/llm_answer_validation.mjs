import { acceptedClaim } from "./delivered-outcome.mjs";
import { evidencePackMatchesSources } from "./evidence-pack.mjs";
import { hasCompleteSentenceEnding } from "./search_evidence.mjs";
import { forestEvidenceIntent, normalize, queryTerms, textHasQueryRoot } from "./search_query_terms.mjs";
import { splitTextPassages } from "./search_evidence.mjs";
import { answersAskedHectares, namesAskedAreaKind, namesDefinitionTerm, statesAskedAge, statesAskedTime } from "./answer_coverage.mjs";
import {
  MAX_ANSWER_INTRO_CHARS,
  MAX_ANSWER_PART_CHARS,
  MAX_ANSWER_TOTAL_CHARS,
} from "./llm-budget.mjs";
import { analyzeQueryIntent } from "./query_intent.mjs";
import { glossaryAvoidHits } from "./forestry-glossary.mjs";
import { classifyForestryGeographyScope, normalizeMunicipalityText } from "./municipalities.mjs";
import { reviewTraceState, SHADOW_CHECK_PATTERN } from "./llm_validation_state.mjs";
import {
  assertAnswerNumericWorkload,
  assertClaimGrounding,
  checkCodeFromMessage,
  claimTokens,
  failCheck,
  groundingValidationContext,
  numberOccurrences,
  protectedDirectIntro,
  rebindGroundedCitations,
  rejectionWithText,
  reviewTraceEnabled,
  validCitations,
} from "./llm_claim_grounding.mjs";

// A length bound is a sanity limit, never a knife: text that runs past it is
// cut back to its last complete sentence, and text with no sentence boundary is
// kept whole, because a fragment in the middle of a sentence is rejected by
// every grounding check and the reader loses the answer entirely.
function trimToCompleteSentence(text, maximumLength) {
  if (text.length <= maximumLength) return text;
  const window = text.slice(0, maximumLength);
  const boundary = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf("."),
    window.lastIndexOf("!"),
    window.lastIndexOf("?"),
  );
  return boundary > 0 ? window.slice(0, boundary + 1).trim() : text;
}

function cleanGeneratedText(value, maxLength) {
  const cleaned = String(value || "")
    .replace(/\s*\[(?:\s*\d+\s*(?:,\s*\d+\s*)*)\]/gu, "")
    .replace(/[\t\r\n\u2028\u2029]+/gu, "; ")
    .replace(/\s+/gu, " ")
    .trim();
  return trimToCompleteSentence(cleaned, maxLength);
}
function hasNationalSampleMethod(text) {
  const passage = normalize(text);
  return /\bvalikuuring\w*\b/u.test(passage)
    && /\bproovitukk\w*\b/u.test(passage)
    && /\bstatistili\w*\b/u.test(passage)
    && /\b(?:uleriigil\w*|ule\s+eestilin\w*|kogu\s+eesti\w*|uldistat\w*)\b/u.test(passage)
    && !/\b(?:ei\s+ole|pole)\b[\s\S]{0,100}\b(?:valikuuring|proovitukk|statistili)\w*/u.test(passage);
}

// How a question is asked is not what it asks about: "kui kiiresti peab ...
// tegema" is answered by "ühe aasta jooksul", which repeats none of these words.
const QUESTION_FORM_ROOTS = new Set([
  "millal", "mitu", "kiiresti", "tegema", "olema", "olla", "pean", "peab", "aja", "ajaks",
  // Words that set the scene ("leidsin oma metsast", "eelmine omanik oli juba")
  // or ask for a choice ("milliseid valida"), not the subject being asked about.
  "eelmine", "veel", "juba", "nuud", "seal", "oma", "leidsin", "ostsin", "milliseid", "valida",
  "joua", "jouan", "jouab",
  "jatta", "jatma", "votta", "maha", "minna", "tulla", "jaab", "jaada", "kirjas", "vaatama", "korda", "enne",
  // Who is asking and how much ("mul", "minu", "paar puud"), and the asking
  // verb itself ("tegeleb", "tahan"), name no subject the answer must repeat.
  "mul", "minu", "mu", "sul", "sinu", "meil", "meie", "teil", "paar", "moni", "monda",
  "tahan", "tahaks", "soovin", "tegeleb", "tegelevad",
  // "SMI definitsioon", "mida tähendab": the answer defines, it need not say so.
  "definitsioon", "moiste", "tahendus", "tahendab",
  "koige", "levinu", "levinum",
]);

export function joinListLead(payload) {
  const intro = String(payload?.intro || "").trim();
  const parts = Array.isArray(payload?.parts) ? payload.parts : [];
  const next = String(parts[0]?.text || "").trim();
  if (!intro.endsWith(":") || !next) return payload;
  const citations = [...new Set([
    ...(Array.isArray(payload.intro_citations) ? payload.intro_citations : []),
    ...(Array.isArray(parts[0].citations) ? parts[0].citations : []),
  ])];
  return { ...payload, intro: `${intro} ${next}`, intro_citations: citations, parts: parts.slice(1) };
}

const SAYS_SOURCES_DO_NOT_ANSWER = /\b(?:(?:esitatud|antud|need|kaasa\s+antud)\s+)?(?:toend\w*|evidence\w*)\s+(?:ei|pole)\b|\b(?:nende|nendest|selle)\s+toendi\w*\s+(?:pohjal|alusel)\s+ei\s+(?:saa|ole)\b|\bevidence\w*\b/u;

// Estonian stems change in inflection and compounds ("kataster" → "katastri-
// tunnus"), so a long root also counts when a word starts with its first
// letters: at least five, and all but the last three.
function answerHasRoot(answer, root) {
  if (textHasQueryRoot(answer, root)) return true;
  // SMI states forest age and stock per "puistu" (forest stand).
  if (root === "mets" && /\bpuistu\p{L}*/u.test(answer)) return true;
  // "pesitsusperiood", "pesitsusrahu" and "pesitsemise aeg" name the same season.
  if (/^pesits/u.test(root) && /\bpesits\p{L}*/u.test(answer)) return true;
  // Going somewhere on foot is "viibimine" or "liikumine" in the law.
  if (/^matka/u.test(root) && /\b(?:viibi|liiku)\p{L}*/u.test(answer)) return true;
  if (/^lai(?:ad|a|u|uga|us)?$/u.test(root)
    && /\blai(?:us|use|usi|ust|une|used|uga)?\b/u.test(answer)) return true;
  // "Mõõdetakse", "mõõdetuna" and "mõõtmine" are one verb; t and d alternate.
  if (/^moot/u.test(root) && /\bmoo[dt]\p{L}*/u.test(answer)) return true;
  if (/^to(?:o|od|id|ode)$/u.test(root)
    && /\bto(?:o|od|ode|id|oga|oks|ost|osse|odest|odele)\b/u.test(answer)) return true;
  // A long compound is answered by its first part: "pesitsusperioodil" by
  // "pesitsusrahu", "pesitsusajal".
  if (root.length >= 12 && new RegExp(`\\b${root.slice(0, 8)}\\p{L}*`, "u").test(answer)) return true;
  if (root.length < 7) return false;
  const prefix = root.slice(0, Math.max(5, root.length - 3));
  return new RegExp(`\\b${prefix}\\p{L}*`, "u").test(answer);
}

function askedEstonianPlace(query) {
  const scope = classifyForestryGeographyScope(query);
  const identity = scope.kind === "estonian-region"
    ? scope.identity
    : scope.kind === "reviewed-municipality" && scope.municipality?.status === "exact"
      ? scope.municipality.identity
      : "";
  const base = normalizeMunicipalityText(identity).replace(/\s+(?:maakond|vald|linn)$/u, "").replace(/\s+/gu, "");
  return base.length >= 3 ? base : "";
}

export function assertAnswerAddressesQuery(text, query, label = "answer") {
  const answerIntent = forestEvidenceIntent(query);
  const roots = queryTerms(query).filter((root) => !QUESTION_FORM_ROOTS.has(root)).slice(0, 6);
  if (!roots.length) return true;
  const answer = normalize(text);
  const asked = normalize(query);
  // "Tõend ei ütle …", "evidence ei käsitle …": the model reports that its
  // sources do not answer. That is a no-answer, not an answer, even when the
  // rest of the text is grounded, so it never reaches the reader.
  if (SAYS_SOURCES_DO_NOT_ANSWER.test(answer)) {
    throw new Error(`LLM ${label} says its sources do not answer the question`);
  }
  // A question about Saaremaa or Võru vald is not answered by an Estonia-wide
  // figure. The answer must speak about the place the question names.
  const namedPlace = askedEstonianPlace(query);
  if (namedPlace && !normalizeMunicipalityText(text).replace(/\s+/gu, "").includes(namedPlace)) {
    throw new Error(`LLM ${label} does not speak about the place the question names`);
  }
  // "Kui suur, mitu, kui palju" is answered by an amount. A rule about the same
  // place without one ("kaitsealal võib määrata raied") does not answer it.
  if (/\b(?:kui\s+(?:suur|lai|korge|pikk|palju|vana|kaua)\w*|mitu|mitme)\b/u.test(asked)
    && !/\d|\b(?:uks|uhe|kaks|kahe|kolm|kolme|neli|nelja|viis|viie|kuus|kuue|seitse|seitsme|kaheksa|uheksa|kumme|kumne|sada|saja|tuhat|tuhande|pool|poole)\b/u.test(answer)) {
    throw new Error(`LLM ${label} does not give the amount the question asks for`);
  }
  if (!statesAskedTime(query, text)) {
    throw new Error(`LLM ${label} does not give the time the question asks for`);
  }
  if (!statesAskedAge(query, text)) {
    throw new Error(`LLM ${label} does not give the age the question asks for`);
  }
  if (!answersAskedHectares(query, text)) {
    throw new Error(`LLM ${label} does not give the hectares the question asks for`);
  }
  // Search folds hoiuala, püsielupaik and the zones into "kaitseala", but their
  // rules differ, so the answer must speak about the same kind of area.
  if (!namesAskedAreaKind(query, text)) {
    throw new Error(`LLM ${label} does not speak about the protected area the question names`);
  }
  if (answerIntent?.kind === "protected-forest-share") {
    const hasMeasure = numberOccurrences(text).some((occurrence) => occurrence.units.has("percent") || occurrence.units.has("area"));
    const hasScope = /\betak\b/u.test(answer) && /\bmetsamaa\w*/u.test(answer)
      && /\b(?:19|20)\d{2}\b/u.test(answer)
      && /\bprojekteeritav\w*\s+al\w*/u.test(answer);
    const wrongScope = /\b(?:eesti\s+)?(?:territoorium\w*|maisma\w*|kogupindal\w*)\b/u.test(answer)
      || /\b(?:mittemajandatav\w*|majanduspiirang\w*)\b/u.test(answer)
      || /\b(?:ei\s+holma|ei\s+sisalda|ilma|valja\s+arvatud)\b[\s\S]{0,80}\bprojekteeritav\w*/u.test(answer)
      || /\b(?:ainult|uksnes)\b[\s\S]{0,60}\b(?:kehtestatud|olemasolev\w*)\b/u.test(answer);
    if (!hasMeasure || !hasScope || wrongScope) {
      throw new Error(`LLM ${label} omits the protection measure's year, ETAK forest-land scope or projected-area qualification`);
    }
    return true;
  }
  if (["forest-area", "forest-area-method", "forest-covered-area"].includes(answerIntent?.kind)) {
    const hasAreaConcept = /\b(?:metsamaa\w*|metsaga\s+kaetud|metsasus\w*|metsa\s+pindala|metsade\s+pindala)\b/iu.test(text);
    const hasAreaMeasurement = numberOccurrences(text)
      .some((occurrence) => occurrence.units.has("area") || occurrence.units.has("percent"));
    if (!hasAreaConcept || !hasAreaMeasurement) {
      throw new Error(`LLM ${label} does not give the requested forest-area measurement`);
    }
    if (answerIntent.kind === "forest-area-method") {
      if (!hasNationalSampleMethod(text)) {
        throw new Error(`LLM ${label} does not explain the requested national sample method`);
      }
      return true;
    }
    // A cover question is answered by naming the forest area and its measured
    // share; it does not have to repeat the question's words "osa" or "kaetud".
    if (answerIntent.kind === "forest-covered-area") return true;
  }
  if (answerIntent?.kind === "forest-species-share") {
    // "Millised puuliigid metsades kasvavad?" is answered by naming the species
    // and their shares; it does not have to repeat the verb "kasvavad".
    const namesSpecies = /\b(?:kask|man[dn]|kuusk|haab|lepp|tamm|saar|vaher|pihlak|okaspuu|lehtpuu|enamusp(uu)?liik)\w*/u.test(answer);
    const namesShare = numberOccurrences(text).some((occurrence) => occurrence.units.has("percent"));
    if (!namesSpecies || !namesShare) {
      throw new Error(`LLM ${label} does not name the forest species with their shares`);
    }
    return true;
  }
  if (answerIntent?.kind === "climate-impact") {
    // The question names a climate driver and asks for its effect on forests.
    // Demanding the literal verb "mõjutab" rejected correct answers in the
    // model's own words, so the check follows the claim instead of the wording:
    // a driver, a forest effect and a direction.
    const namesDriver = /\b(?:kliima\w*|pou\w*|kuiv(?!end)\w*|soojen\w*|urask\w*|torm\w*|sadem\w*)\b/u.test(answer);
    const namesEffect = /\b(?:juurdekasv\w*|kasv\w*|kahjust\w*|suremus\w*|seisund\w*|tervis\w*|stress\w*|viljakus\w*|kadu\w*)\b/u.test(answer);
    // "muut" is deliberately absent: the noun "kliimamuutus" already satisfies
    // the driver test, so it would also satisfy the direction test and let a
    // hedge such as "kliimamuutuse mõju ei ole kirjeldatud" through.
    const statesDirection = /\b(?:suuren\w*|vahen\w*|kahan\w*|lang\w*|paran\w*|halven\w*|mojut\w*|ohust\w*|kannat\w*|nouab\w*)\b/u.test(answer);
    if (!namesDriver || !namesEffect || !statesDirection) {
      throw new Error(`LLM ${label} does not connect the climate driver to a forest effect`);
    }
    return true;
  }
  if (answerIntent?.kind === "forest-data-sources") {
    const mentionsSmi = /\b(?:smi|statistilise\s+metsainvent\w*)/iu.test(text);
    const mentionsDataSource = /\b(?:metsa|metsandus|metsainventeerimis)andm\w*|metsaregis\w*/iu.test(text);
    const saysEquivalent = splitTextPassages(text).some((sentence) => {
      const equivalence = /\b(?:sünonüüm\w*|üks\s+ja\s+sama|sama\s+asi|ei\s+ole\s+vahet|on\s+samad?\s+metsaandm\w*|tähendavad?\s+sama)\b/iu.test(sentence);
      const negated = /\b(?:ei\s+ole|pole)(?:\s+[a-zõäöüšž-]+){0,4}\s+(?:sünonüüm\w*|üks\s+ja\s+sama|sama\s+asi)\b/iu.test(sentence);
      return equivalence && !negated;
    });
    const hasSmiRole = /\b(?:valikuuring\w*|proovitükk\w*|statistilis\w*|üleriigil\w*|riiklik\w*)/iu.test(text);
    const hasOtherDataRole = /\b(?:mitmel\s+viisil|katusmõiste\w*|eri\s+allik\w*|metsaregis\w*|kinnistu\w*|eraldis\w*|registr\w*)/iu.test(text);
    if (!mentionsSmi || !mentionsDataSource || saysEquivalent || !hasSmiRole || !hasOtherDataRole) {
      throw new Error(`LLM ${label} does not distinguish the requested forestry data sources`);
    }
    return true;
  }
  if (answerIntent?.kind === "forest-depletion") {
    const addressesDepletion = /\b(?:otsa\s+(?:saam\w*|saada|saavat)|saaks\s+(?:(?:peagi|lahiajal)\s+)?otsa|kadum\w*|kao\w*|havi\w*)\b/u.test(answer);
    const usesStateIndicator = /\b(?:metsamaa\w*|pindala\w*|tagavara\w*|vanus\w*|elurikk\w*|kahjust\w*)\b/u.test(answer);
    const boundsTheConclusion = /\b(?:praegu\w*|praegus\w*|hetkeseis\w*|ei\s+viita|ei\s+naita|ei\s+toesta|mitte\s+(?:kindel|tuleviku)|tulevikuprognoos\w*)\b/u.test(answer);
    if (!addressesDepletion || !usesStateIndicator || !boundsTheConclusion) {
      throw new Error(`LLM ${label} does not answer the bounded forest-depletion question`);
    }
    // The intent-specific checks above cover the idiom and its factual scope.
    // Do not run the generic stem matcher afterwards: Estonian "saab" and
    // "saada" are forms of the same verb but do not share its naive stem.
    return true;
  }
  const hasDirection = /\b(?:suuren|vahen|kahan|lang|pusi|nooren|vananen|eri\s+suun|samaaeg)\w*/u.test(answer);
  if (roots.includes("noor") && roots.includes("muutus")
    && (!/\bnoor\w*/u.test(answer) || !hasDirection)) {
    throw new Error(`LLM ${label} does not state the requested younger-forest direction`);
  }
  if (roots.includes("vanus") && roots.includes("osakaal") && roots.includes("muutus")
    && (!/\bkeskeal\w*/u.test(answer) || !/\bosakaal\w*/u.test(answer) || !hasDirection)) {
    throw new Error(`LLM ${label} does not explain the requested middle-aged forest share direction`);
  }
  const matched = roots.filter((root) => answerHasRoot(answer, root));
  const required = roots.length <= 3 ? roots.length : Math.ceil(roots.length * 0.75);
  if (matched.length < required) {
    failCheck(rejectionWithText(
      `LLM ${label} does not answer the requested intent (${matched.length}/${roots.length})`,
      `missing roots: ${roots.filter((root) => !matched.includes(root)).join(", ")}`,
    ));
  }
  return true;
}

function answerPartAddressesQuery(part, query) {
  const roots = queryTerms(query).slice(0, 6);
  if (!roots.length) return true;
  const text = String(part?.text || "");
  const intent = forestEvidenceIntent(query);
  return (["forest-area", "forest-area-method"].includes(intent?.kind) && hasNationalSampleMethod(text))
    || roots.some((root) => textHasQueryRoot(text, root));
}

function preserveReviewedDefinitions(intro, parts, draft) {
  const generatedText = [intro, ...parts.map((part) => part.text)].filter(Boolean).join(" ");
  const generatedTokens = new Set(claimTokens(generatedText));
  const reviewedParts = draft.answer?.parts || [];
  const missingDefinitions = [];
  for (const part of reviewedParts) {
    const text = String(part.text || "");
    for (const match of text.matchAll(/\b([A-ZÕÄÖÜŠŽ]{2,10})\s+(?:tähendab|ehk)\s+([^:;.!?]{3,120})/gu)) {
      const acronym = match[1];
      const definitionTokens = claimTokens(match[2]).slice(0, 3);
      if (!new RegExp(`\\b${acronym}\\b`, "u").test(generatedText)) continue;
      if (definitionTokens.length && definitionTokens.every((token) => generatedTokens.has(token))) continue;
      missingDefinitions.push(part);
    }
  }
  if (!missingDefinitions.length) return parts;
  const merged = [...missingDefinitions, ...parts];
  return merged.filter((part, index) => merged.findIndex((candidate) => candidate.text === part.text) === index).slice(0, 5);
}

function requiredRoleWitnessCitations(evidencePack) {
  const witnesses = Object.values(evidencePack?.roleWitnesses || {});
  if (!witnesses.length) return [];
  const citationByWitnessKey = new Map();
  for (const [citation, binding] of Object.entries(evidencePack.bindings || {})) {
    if (!binding?.witnessKey || citationByWitnessKey.has(binding.witnessKey)) continue;
    const number = Number(citation);
    if (Number.isInteger(number) && number > 0) citationByWitnessKey.set(binding.witnessKey, number);
  }
  return [...new Set(witnesses.map((witness) => citationByWitnessKey.get(witness.witnessKey)).filter(Number.isInteger))];
}

// A law list item ends without a full stop ("… tuleohutusnõudeid järgides").
// Copied word for word as a whole source line it is complete, so it gets the
// full stop; any other unterminated text stays incomplete and is rejected.
function closedEvidenceLine(text, evidencePack) {
  const value = String(text || "").trim();
  if (!value || hasCompleteSentenceEnding(value) || value.length < 40) return value;
  const copiesWholeLine = (evidencePack?.entries || []).some((entry) => String(entry?.content || "")
    .split(/\n+/u)
    .map((line) => line.trim())
    // The subsection number "(1)" is a locator, not part of the rule.
    .some((line) => line === value || line.replace(/^\(\d+\p{L}?\)\s*/u, "") === value));
  return copiesWholeLine ? `${value}.` : value;
}

function validateGroundedProposal(rawPayload, draft, query, evidencePack) {
  const isProcedure = analyzeQueryIntent(query).intent === "procedure";
  const payload = isProcedure ? rawPayload : joinListLead(rawPayload);
  const validationContext = groundingValidationContext(evidencePack);
  const suppliedParts = Array.isArray(payload?.parts) ? payload.parts : [];
  const suppliedIntro = String(payload?.intro || draft.answer.intro || "");
  const suppliedAnswerLength = [suppliedIntro, ...suppliedParts.map((part) => String(part?.text || ""))]
    .filter(Boolean)
    .join("\n").length;
  if (suppliedAnswerLength > MAX_ANSWER_TOTAL_CHARS) {
    throw new Error("LLM answer exceeds the configured character limit");
  }
  assertAnswerNumericWorkload([
    suppliedIntro,
    ...suppliedParts.slice(0, 5).map((part) => String(part?.text || "")),
  ]);
  const sourceCount = draft.sources.length;
  const suppliedIntroCitations = validCitations(payload?.intro_citations, sourceCount);
  const introCitations = suppliedIntroCitations.length
    ? suppliedIntroCitations
    : (sourceCount === 1 ? [1] : []);
  const directDraftCitations = validCitations(draft.answer?.introCitations, sourceCount);
  const proposedIntro = closedEvidenceLine(
    cleanGeneratedText(payload?.intro || draft.answer.intro || "", MAX_ANSWER_INTRO_CHARS),
    evidencePack,
  );
  const proposedText = [proposedIntro, ...(Array.isArray(payload?.parts) ? payload.parts : []).map((part) => String(part?.text || ""))].join("\n");
  if (glossaryAvoidHits(proposedText, evidencePack?.entries).length) {
    throw new Error("LLM used a forestry term the glossary marks as a mistranslation");
  }
  const protectedIntro = protectedDirectIntro(draft, query, sourceCount);
  // A directly extracted, year-specific measurement is the shortest answer to
  // the user's question. Keep it as the lead even when the model prefers a
  // secondary statistic from the same evidence.
  const evaluatedIntro = protectedIntro?.intro || proposedIntro;
  const effectiveIntroCitations = protectedIntro?.citations
    || (introCitations.length ? introCitations : draft.answer.introCitations || []);
  if (proposedIntro !== String(draft.answer.intro || "").trim() && !introCitations.length) {
    throw new Error("LLM changed the introduction without citations");
  }
  // The law in force is the rule itself, so a lead taken from a current law
  // section may replace another matched page; its wording is still checked
  // against the section below like any other claim.
  const citesLawSection = introCitations.length
    && introCitations.every((citation) => /riigiteataja\.ee\/.*#para/u.test(draft.sources[citation - 1]?.url || ""));
  if (proposedIntro !== String(draft.answer.intro || "").trim()
    && directDraftCitations.length
    && !citesLawSection
    && !directDraftCitations.some((citation) => introCitations.includes(citation))) {
    throw rejectionWithText("LLM introduction bypasses the directly matched current source", proposedIntro);
  }
  if (protectedIntro && proposedIntro !== String(draft.answer.intro || "").trim()) {
    // The final answer keeps the deterministic current measurement verbatim,
    // but the model's proposed lead must still be safe before any of its
    // additional parts are accepted. Equivalent reordering of the same
    // entity/year/value/unit tuples is allowed; a new or swapped number is not.
    assertClaimGrounding(
      proposedIntro,
      introCitations,
      draft,
      "proposed introduction",
      query,
      validationContext,
    );
  }
  const parts = suppliedParts
    .slice(0, 5)
    .map((part, index) => {
      const suppliedCitations = validCitations(part?.citations, sourceCount);
      const citations = suppliedCitations.length
        ? suppliedCitations
        : (sourceCount === 1 ? [1] : []);
      const reviewedTitle = (draft.answer.parts || []).find((candidate) => {
        const candidateCitations = validCitations(candidate.citations, sourceCount);
        return candidateCitations.length && candidateCitations.every((citation) => citations.includes(citation));
      })?.title;
      return {
        title: cleanGeneratedText(reviewedTitle || (index === 0 ? "Põhivastus" : "Oluline täpsustus"), 120),
        text: closedEvidenceLine(cleanGeneratedText(part?.text || "", MAX_ANSWER_PART_CHARS), evidencePack),
        citations,
      };
    })
    .filter((part) => part.text && part.citations.length);
  if (!parts.length && !introCitations.length) throw new Error("LLM answer has no grounded claims");

  let groundedIntro = false;
  let groundedIntroCitations = [];
  let introError;
  try {
    groundedIntroCitations = rebindGroundedCitations(
      evaluatedIntro,
      effectiveIntroCitations,
      draft,
      "introduction",
      query,
      evidencePack,
      validationContext,
    );
    if (!groundedIntroCitations.length) {
      throw new Error("LLM introduction has no individually attributable citations");
    }
    if (!protectedIntro
      && proposedIntro !== String(draft.answer.intro || "").trim()
      && directDraftCitations.length
      && !directDraftCitations.some((citation) => groundedIntroCitations.includes(citation))) {
      throw new Error("LLM introduction loses the directly matched current source after citation binding");
    }
    groundedIntro = true;
  } catch (error) {
    if (error?.code === "LLM_GROUNDING_WORK_LIMIT") throw error;
    introError = error;
    if (reviewTraceState.shadowTraceIntro) reviewTraceState.shadowTraceIntro.error = error;
  }
  const groundedParts = parts.flatMap((part) => {
    try {
      const citations = rebindGroundedCitations(part.text, part.citations, draft, "part", query, evidencePack, validationContext);
      return citations.length ? [{ ...part, citations }] : [];
    } catch (error) {
      if (error?.code === "LLM_GROUNDING_WORK_LIMIT") throw error;
      return [];
    }
  });
  // A citation proves provenance, not relevance. A side statistic from the
  // direct source must still answer the user's actual question before it can
  // enter the public response.
  const queryRelevantParts = groundedParts.filter((part) => answerPartAddressesQuery(part, query));
  const promotableParts = queryRelevantParts.filter((part) => (
    !directDraftCitations.length || directDraftCitations.some((citation) => part.citations.includes(citation))
  ));
  if (!groundedIntro && !promotableParts.length) throw introError || new Error("LLM answer has no supported claims");
  const proposedTitle = String(draft.answer.title || query).trim().slice(0, 180);
  const promotedPart = groundedIntro ? null : promotableParts[0];
  const finalIntro = groundedIntro ? evaluatedIntro : promotedPart.text;
  const finalIntroCitations = groundedIntro ? groundedIntroCitations : promotedPart.citations;
  if (!namesDefinitionTerm(query, finalIntro)) {
    throw new Error("LLM introduction does not name the defined term");
  }
  const remainingGroundedParts = promotedPart
    ? queryRelevantParts.filter((part) => part !== promotedPart)
    : queryRelevantParts;
  const groundRetainedPart = (part) => {
    try {
      const citations = rebindGroundedCitations(part.text, part.citations, draft, "retained part", query, evidencePack, validationContext);
      return citations.length ? [{ ...part, citations }] : [];
    } catch (error) {
      if (error?.code === "LLM_GROUNDING_WORK_LIMIT") throw error;
      return [];
    }
  };
  const fallbackParts = groundedIntro && !remainingGroundedParts.length
    ? (draft.answer.parts || []).filter((part) => answerPartAddressesQuery(part, query)).flatMap(groundRetainedPart)
    : [];
  const candidateParts = remainingGroundedParts.length ? remainingGroundedParts : fallbackParts;
  const finalParts = preserveReviewedDefinitions(finalIntro, candidateParts, draft)
    .flatMap((part) => candidateParts.includes(part) ? [part] : groundRetainedPart(part));
  // Query coverage belongs to the complete independently grounded answer.
  // A measured lead need not repeat a method that its retained part explains;
  // rejected fields, headings and notes cannot supply the missing facet.
  assertAnswerAddressesQuery([finalIntro, ...finalParts.map((part) => part.text)].join(" "), query);
  if ([finalIntro, ...finalParts.map((part) => part.text)].filter(Boolean).join("\n").length > MAX_ANSWER_TOTAL_CHARS) {
    throw new Error("LLM final answer exceeds the configured character limit");
  }
  const answerParts = isProcedure
    ? finalParts.map((part, index) => ({ ...part, role: "step", step: index + 1 }))
    : finalParts;
  const answer = {
    eyebrow: "Allikapõhine kokkuvõte",
    title: proposedTitle,
    ...(isProcedure ? { format: "procedure" } : {}),
    intro: finalIntro,
    introCitations: finalIntroCitations,
    parts: answerParts,
    note: String(draft.answer.note || "").trim().slice(0, 700),
  };
  const acceptedClaims = [
    ...(groundedIntro && !protectedIntro ? [acceptedClaim(finalIntro, finalIntroCitations, evidencePack)] : []),
    ...(promotedPart ? [acceptedClaim(promotedPart.text, promotedPart.citations, evidencePack)] : []),
    ...remainingGroundedParts.map((part) => acceptedClaim(part.text, part.citations, evidencePack)),
  ].filter(Boolean).slice(0, 6);
  // A planner-required role witness is the admission proof for a facet the
  // deterministic answer already covers. If the model drops that source
  // entirely, the caller must keep the deterministic multi-part answer
  // instead of publishing a model synthesis that lost a required facet.
  const answerCitations = new Set([
    ...finalIntroCitations,
    ...finalParts.flatMap((part) => part.citations),
  ]);
  if (requiredRoleWitnessCitations(evidencePack).some((citation) => !answerCitations.has(citation))) {
    return { answer: null, acceptedClaims: [], rejectionReason: "local-rejected" };
  }
  return { answer, acceptedClaims, rejectionReason: acceptedClaims.length ? null : "no-new-contribution" };
}

function specificTopicMismatch(query, payload) {
  const cleanQuery = normalize(query);
  const intro = normalize(payload?.intro || "");
  if (!intro) return false;
  if (/(?:metsa)?poleng|tulekahju|tuleoht/u.test(cleanQuery)
    && /(?:hoida|valtida|ennetada|kaitsta|ennetus|torje)/u.test(cleanQuery)) {
    return !/(?:poleng|tulekahju|tuleoht)/u.test(intro);
  }
  if (/eraldis/u.test(cleanQuery) && /(?:taotle|taotlus|taotlemine)/u.test(cleanQuery)) {
    return !(/(?:eraldis|raie|metsateatis)/u.test(intro) && /taotl/u.test(intro));
  }
  if (/radoon/u.test(cleanQuery) && /(?:ohtlik|tervis|risk|piirnorm)/u.test(cleanQuery)) {
    return /(?:seminar|konverents|koolitus|toimub|korraldab|registreeru|külasta)/u.test(intro)
      || !/(?:tervis|ohtlik|risk|piirnorm|radoonioht)/u.test(intro);
  }
  return false;
}

// One bounded diagnostic pass checks what happens after the first failed rule.
// It does not rerun the full validator once for each later rejection.
function traceShadowReview(payload, draft, query, evidencePack, firstError) {
  const steps = [];
  const skipped = new Set();
  let error = firstError;
  let shadowAnswer = null;
  let introFailure = /\b(?:proposed\s+)?introduction\b/iu.test(String(error?.message || ""))
    ? error
    : null;
  if (error) {
    const check = checkCodeFromMessage(error.message);
    steps.push({ check, message: String(error.message || "").slice(0, 160), claim: error.rejectedText || "", source: error.evidenceText || "" });
    if (SHADOW_CHECK_PATTERN.test(check)) {
      skipped.add(check);
      reviewTraceState.shadowSkippedChecks = Object.assign(new Set(skipped), { hits: [] });
      reviewTraceState.shadowTraceIntro = {};
      try {
        shadowAnswer = validateGroundedProposal(payload, draft, query, evidencePack).answer;
        steps.push(...reviewTraceState.shadowSkippedChecks.hits.map((hit) => ({ ...hit, skipped: true })));
        error = null;
      } catch (nextError) {
        error = nextError;
      } finally {
        introFailure ||= reviewTraceState.shadowTraceIntro?.error || null;
        reviewTraceState.shadowSkippedChecks = null;
        reviewTraceState.shadowTraceIntro = null;
      }
    }
  }
  const text = (answer) => [answer?.intro, ...(answer?.parts || []).map((part) => part?.text)].filter(Boolean).join(" ¶ ");
  console.warn(JSON.stringify({
    event: "review-trace",
    query: String(query || "").slice(0, 300),
    steps,
    shadowPasses: !error,
    proposed: text(payload).slice(0, 2000),
    draftIntro: String(draft?.answer?.intro || "").slice(0, 400),
    ...(introFailure ? { introFailure: {
      message: String(introFailure.message || "").slice(0, 200),
      claim: introFailure.rejectedText || "",
      source: introFailure.evidenceText || "",
    } } : {}),
    evidence: (evidencePack?.entries || []).map((entry) => `[${entry.citation}] ${String(entry.content || "").slice(0, 700)}`).join("\n").slice(0, 4000),
    ...(shadowAnswer ? { shadowAnswer: text(shadowAnswer).slice(0, 2000) } : {}),
    sources: (draft?.sources || []).map((source) => String(source?.title || "").slice(0, 100)),
  }));
}

export function validateGroundedAnswer(payload, draft, query, evidencePack) {
  if (specificTopicMismatch(query, payload)) {
    return { answer: null, acceptedClaims: [], rejectionReason: "specific-topic-mismatch" };
  }
  if (!evidencePackMatchesSources(evidencePack, draft?.sources)) {
    return { answer: null, acceptedClaims: [], rejectionReason: "evidence-insufficient" };
  }
  try {
    return validateGroundedProposal(payload, draft, query, evidencePack);
  } catch (error) {
    // The parenthesis can quote evidence words, so only the fixed text leaves.
    const rejectionDetail = [
      String(error?.message || "").replace(/\s*\(.*$/su, "").slice(0, 120),
      ...(error?.rejectedText ? [`claim: ${error.rejectedText}`] : []),
      ...(error?.evidenceText ? [`source: ${error.evidenceText}`] : []),
    ].join(" | ");
    if (reviewTraceEnabled()) traceShadowReview(payload, draft, query, evidencePack, error);
    return { answer: null, acceptedClaims: [], rejectionReason: "local-rejected", rejectionDetail };
  }
}
