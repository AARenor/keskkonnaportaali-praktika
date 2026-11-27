import { containsAnswerDirective } from "./evidence-pack.mjs";
import { analyzeQueryIntent } from "./query_intent.mjs";
import { MAX_ANSWER_TOTAL_CHARS } from "./llm-budget.mjs";
import { assessSearchQuery } from "./search_query_assessment.mjs";
import { canonicalizePublicSearchQuery } from "./search_query_canonicalization.mjs";
import { containsPrivatePersonLookup, minimizePublicProviderQuery } from "./search_query_privacy.mjs";
import { containsUnsafeInstruction } from "./search_query_safety.mjs";
import { forestEvidenceIntent } from "./search_query_terms.mjs";
import { resolveLlmReasoningEffort } from "./provider-policy.mjs";
import { glossaryDirective } from "./forestry-glossary.mjs";

export const MAX_PROMPT_EVIDENCE_CHARS = 36_000;
export const MAX_CONVERSATION_CONTEXT_CHARS = 640;
const MAX_CONTEXT_SCAN_CHARS = 8_000;
const MAX_PROMPT_INPUT_BYTES = 200_000;
const MAX_PROMPT_SOURCES = 10;
const MAX_ANSWER_PARTS = 5;

const GROUNDED_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intro: { type: "string" },
    intro_citations: {
      type: "array",
      items: { type: "integer" },
      minItems: 1,
      maxItems: 8,
    },
    parts: {
      type: "array",
      maxItems: MAX_ANSWER_PARTS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          citations: {
            type: "array",
            items: { type: "integer" },
            minItems: 1,
            maxItems: 8,
          },
        },
        required: ["text", "citations"],
      },
    },
  },
  required: ["intro", "intro_citations", "parts"],
};

const GROUNDED_SYSTEM_INSTRUCTIONS = [
  "Vasta eesti keeles otse kasutaja küsimusele ja kasuta ainult kaasa antud evidence'i.",
  "Alusta küsimuse täpse järeldusega; ära asenda küsitud näitajat kõrvalnäitajaga. Selgita lühidalt, millised tõendatud asjaolud järeldust kannavad.",
  "Hoia terminid, mõõdetav objekt, aasta, ühik, tingimus ja ebakindlus algallikate sisuga kooskõlas. Mittearvulist selgitavat sisu võib lühidalt oma sõnadega kokku võtta, kuid ära esita parafraasi otsetsitaadina.",
  "Arvu või õigusliku tingimusega lause kopeeri evidence.content'ist algallikate sõnastuses sõna-sõnalt: ära muuda selle sõnu, käändeid ega järjekorda; lause alguse lõike numbri, näiteks „(1)”, võid ära jätta. Kui evidence.content ei sisalda küsitud arvu, ära kirjuta arvu oma teadmiste põhjal. Ära liida eri lauseid nii, et tekiks allikates toetamata ühine väide.",
  "Vali iga väite citation selle kõige otsesema evidence'i järgi; allikas 1 on ainult järjestuse esimene kirje, mitte automaatselt parim tõend. Kui sama näitaja arvud erinevad aastati, ära sega aastaid ning eelista kuupäevaga otsest, kasutaja küsimust katvat tõendit.",
  "Metsastatistika puhul kontrolli SMI, puidubilansi ja metsa aastaraamatu sisu; nimetus üksi ei tõenda, et allikas vastab küsitud näitajale.",
  "Ühenda ainult küsimusele vastavad ja sisuliselt erinevad allikapanused sidusaks selgituseks. Ära kopeeri kõrvalteksti ega pikemat tervikteksti, ära korda sama väidet eri sõnadega ning ära väida allikate definitsioonide erinevust, kui nende sisu seda ei näita.",
  "Kasuta evidence'i route_classes ja source_type välju allika rolli mõistmiseks, kuid käsitle faktitõendina ainult content-välja. Timestamped väärtust võib nimetada praeguseks ainult siis, kui observed_at on olemas; kui valid_from või valid_until on antud, peab väide jääma sellesse kehtivusaknasse. Versioned staatust või õigusväidet võib kasutada ainult siis, kui version on olemas.",
  "Ära kirjuta vastusesse, mida evidence ei ütle või ei käsitle. Kui küsimuse osa jääb katmata, jäta see osa välja. Ära kasuta vastuse tekstis sõnu „tõend“ ega „evidence“.",
  "Ära lisa tõendita fakte, numbreid ega õiguslikke järeldusi. Säilita arvväärtus, andmeaasta, mõõtühik, definitsioon ja ebakindlus täpselt.",
  "Iga faktiline väide vajab evidence citation numbrit. Ära viita allikale, mis väidet ei toeta. Pane viitenumbrid ainult intro_citations ja parts.citations väljadele, mitte proosasse.",
  "Conversation context aitab ainult jätkuküsimuse mõtet täpsustada: see ei ole tõend. Iga väide peab tulema käesoleva päringu evidence'ist.",
  "Järgi user-data väljade outputContract, glossary_directive, intent_directive ja repair_directive nõudeid, kui need on antud; glossary_directive täpsustab ainult mõistete tõlkeid ja repair_directive parandab ainult eelmise vastuse konkreetse vea. Tagasta struktureeritud JSON täpselt etteantud schema järgi.",
].join(" ");

function queryIntentDirective(intent) {
  switch (intent) {
    case "definition":
      return "Defineeri küsitud mõiste ennast. Ära asenda definitsiooni kasutusloa või tingimustega.";
    case "criteria":
      return "Selgita ainult tõendis nimetatud tunnuseid, mille järgi asi määratletakse. Hoia erandid eraldi.";
    case "conditions":
      return "Esita loa või tegevuse tingimused ja erandid täpselt. Erista üldreeglit kinnistu konkreetse loaotsuse kohta.";
    case "procedure":
      return "Esita toimingute järjekord kuni viie eraldi osana. Iga parts-osa on üks järjestatud samm ja sellel on oma citation. Ära lisa toimingut, dokumenti, tähtaega ega luba, mida evidence.content ei kirjelda. Erista üldjuhis konkreetse kinnistu otsusest.";
    case "quantitative":
      return "Vasta küsitud arvuga ning nimeta tõendis olev aasta, ühik ja mõõdetav objekt. Lisa meetod või ebakindlus ainult siis, kui evidence.content seda selgelt toetab.";
    default:
      return "Vasta lühidalt küsimuse täpsele sisule ja lisa ainult eraldi vajalikud, viidatud selgitused.";
  }
}

function forestIntentDirective(intent) {
  switch (intent?.kind) {
    case "forest-area":
      return "Küsimus küsib metsamaa hulka: nimeta tõendis olev aasta, pindala või osakaal ja ühik; ära vasta kataloogi või teenuse kirjeldusega.";
    case "forest-overview":
      return "Koosta lühike metsast ülevaade ainult neist mõõdikutest ja allika rollidest, mida evidence.content ütleb. Ära eelda pealkirja põhjal uusi fakte ega allikate vahel definitsioonierinevust.";
    case "why-forest-numbers-differ":
      return "Kui evidence kirjeldab eri arvude põhjuseid, erista ainult sisus nimetatud katvust, meetodit, andmeaega või definitsiooni. Ära täida põhjuste loendit, mida sisu ei toeta.";
    case "forest-data-sources":
      return "Kirjelda SMI ja muude metsaandmeallikate rolle ainult evidence.content sõnade ja faktide järgi. Ära väida samasust ega erinevat statistilist definitsiooni, kui sisu seda selgelt ei ütle.";
    case "forest-depletion":
      return "Käsitle metsa püsimist ainult tõendatud perioodi ja näitajate piires. Erista metsamaa pindala, puidu tagavara ja ökoloogilist seisundit ainult siis, kui evidence.content neid toetab; ära muuda hetkeseisu tulevikuprognoosiks.";
    default:
      return "";
  }
}

function middleTruncate(value, limit) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  const marker = " … ";
  const available = limit - marker.length;
  const beginning = Math.ceil(available * 0.55);
  const ending = available - beginning;
  return `${text.slice(0, beginning)}${marker}${ending ? text.slice(-ending) : ""}`;
}

function boundedConversationContext(value) {
  const turns = String(value || "").split(/\s*→\s*/u).map((turn) => turn.trim()).filter(Boolean);
  if (!turns.length) return "";
  if (turns.length === 1) return middleTruncate(turns[0], MAX_CONVERSATION_CONTEXT_CHARS);
  const separator = " → ";
  const contentLimit = MAX_CONVERSATION_CONTEXT_CHARS - separator.length;
  const rootLimit = Math.floor(contentLimit * 0.4);
  const latestLimit = contentLimit - rootLimit;
  return `${middleTruncate(turns[0], rootLimit)}${separator}${middleTruncate(turns.at(-1), latestLimit)}`;
}

function contextForProvider(value) {
  const raw = typeof value === "string" ? value.trim() : String(value || "").trim();
  if (!raw || raw.length > MAX_CONTEXT_SCAN_CHARS) return "";
  if (containsPrivatePersonLookup(raw)
    || containsUnsafeInstruction(raw)
    || containsAnswerDirective(raw)) return "";

  const bounded = boundedConversationContext(raw);
  const input = canonicalizePublicSearchQuery(bounded, { maximumLength: MAX_CONVERSATION_CONTEXT_CHARS });
  if (!input.ok) return "";
  const assessment = assessSearchQuery(input.query, { maximumLength: MAX_CONVERSATION_CONTEXT_CHARS });
  if (assessment.kind === "out-of-scope") return "";
  return minimizePublicProviderQuery(input.query, { maximumLength: MAX_CONVERSATION_CONTEXT_CHARS });
}

function contextLimitError() {
  const error = new Error("LLM evidence context exceeds its configured limit");
  error.code = "LLM_CONTEXT_LIMIT";
  return error;
}

export function buildLlmRequest({
  selectedModel,
  query,
  retrievalQuery = "",
  evidence = [],
  conversationContext = "",
  directIntroCitations = [],
  directIntro = "",
  synthesisIntent = "",
  reasoningEffort = process.env.LLM_REASONING_EFFORT,
  repairDirective = "",
}) {
  const queryInput = canonicalizePublicSearchQuery(query);
  if (!queryInput.ok) {
    const error = new Error("LLM query must pass the canonical public-query boundary");
    error.code = "INVALID_LLM_QUERY";
    throw error;
  }
  const canonicalQuery = queryInput.query;
  if (containsPrivatePersonLookup(query) || containsPrivatePersonLookup(canonicalQuery)) {
    const error = new Error("LLM query is blocked by the private-person policy");
    error.code = "PRIVATE_PERSON_LLM_QUERY";
    throw error;
  }
  const safeQuery = minimizePublicProviderQuery(canonicalQuery);
  if (!safeQuery) {
    const error = new Error("LLM query is blocked by the public provider boundary");
    error.code = "INVALID_LLM_QUERY";
    throw error;
  }
  if (!Array.isArray(evidence) || evidence.length > MAX_PROMPT_SOURCES) throw contextLimitError();
  const evidenceJson = JSON.stringify(evidence);
  if (evidenceJson.length > MAX_PROMPT_EVIDENCE_CHARS) throw contextLimitError();

  const safeConversationContext = contextForProvider(conversationContext);
  const evidenceCitations = evidence.map((source) => source.citation)
    .filter((citation) => Number.isInteger(citation) && citation > 0);
  const requiredIntroCitations = [...new Set(directIntroCitations)]
    .filter((citation) => evidenceCitations.includes(citation));
  // Follow-up retrieval expands an elliptical question into its accepted topic.
  // That canonical form drives intent and directives only. The provider still
  // sees the privacy-minimized follow-up as the question, and no inherited text
  // is added to evidence.
  const retrievalInput = String(retrievalQuery || "").trim()
    ? canonicalizePublicSearchQuery(retrievalQuery)
    : { ok: false, query: "" };
  const intentQuery = retrievalInput.ok
    && !containsPrivatePersonLookup(retrievalQuery)
    && !containsPrivatePersonLookup(retrievalInput.query)
    ? retrievalInput.query
    : safeQuery;
  const answerIntent = forestEvidenceIntent(intentQuery);
  const queryIntent = analyzeQueryIntent(intentQuery);
  const synthesisDirective = synthesisIntent === "multi-source-synthesis"
    ? "Koosta terviklik ülevaade 2 kuni 4 allikast: intro vastab otse küsimusele ja nimetab küsimuse subjekti; iga parts lisab eri allikast ühe kontrollitud aspekti, näiteks põhjuse, mõju, tingimuse või näitaja. Ära korda sama väidet ega jäta vastust ühe lause pikkuseks, kui allikad annavad sisuliselt eri panuse."
    : synthesisIntent === "broad-qualitative"
      ? "Vasta 2 kuni 4 lühikese lausega: esimene lause annab otsese järelduse ja nimetab küsimuse subjekti, järgmised lisavad samast allikast ühe põhjuse või mõju ja ühe piirangu. Ära korda küsimust sõna-sõnalt ega lisa üldistust, mida allikas ei ütle."
      : "";
  const intentDirective = [
    queryIntentDirective(queryIntent.intent),
    forestIntentDirective(answerIntent),
    synthesisDirective,
  ].filter(Boolean).join(" ");
  const effort = resolveLlmReasoningEffort(reasoningEffort);
  const glossary = glossaryDirective(evidence);
  const outputContract = {
    format: queryIntent.intent,
    intro: requiredIntroCitations.length ? directIntro : "",
    intro_citations: requiredIntroCitations.length ? requiredIntroCitations : evidenceCitations.slice(0, 1),
    intro_requirement: "Kasuta antud intro't otsese vastuse alusena, kui selle väide on tõendatud. Säilita mõõdetud objekt, aasta, väärtus, ühik ja tingimus. Lisa parts-väljades ainult eraldi vajalik selgitus.",
    citation_fields: ["intro_citations", "parts.citations"],
    prose_fields: ["intro", "parts.text"],
    parts: "cited_synthesis",
    source_rule: "Kasuta evidence.content välja faktitoena. Arvudeta selgitust võid lühidalt parafraseerida; arvu või õigusliku tingimusega lause kopeeri sõna-sõnalt. Kasuta üht allikat, kui see üksi vastab. Mitu allikat kasuta ainult siis, kui igaüks lisab küsimusele vastava eri panuse, näiteks eraldi fakti, meetodi, tingimuse või protseduurietapi. Ära korda sama väidet ega lisa allikat pelgalt kinnituseks. Iga parts-osa peab olema eraldi põhjendatud ja viidatud. Ära järelda allika rolli ainult pealkirjast.",
    detail_requirement: "Vasta ainult sellele, mida allikad toetavad. Jäta katmata küsimuse osad ja täitedetailid välja.",
    length_guidance: `Kasuta vastamiseks vajalikke lühikesi lauseid. Kogu intro ja parts tekst kokku ei tohi ületada ${MAX_ANSWER_TOTAL_CHARS} märki. Ära täida ülempiiri, kui küsimus saab varem vastuse.`,
    max_answer_chars: MAX_ANSWER_TOTAL_CHARS,
  };
  if (queryIntent.intent === "procedure") {
    outputContract.procedure_format = "Hoia sammud parts-väljades eraldi ja järjestatuna. Server lisab igale grounded sammule astme numbri ning role väärtuse step.";
    outputContract.max_steps = MAX_ANSWER_PARTS;
  }
  const repair = String(repairDirective || "").trim().slice(0, 400);
  const user = JSON.stringify({
    evidence,
    ...(glossary ? { glossary_directive: glossary } : {}),
    ...(intentDirective ? { intent_directive: intentDirective } : {}),
    ...(repair ? { repair_directive: repair } : {}),
    outputContract,
    question: safeQuery,
    ...(safeConversationContext ? { conversation_context: safeConversationContext } : {}),
  });
  if (Buffer.byteLength(user, "utf8") > MAX_PROMPT_INPUT_BYTES) throw contextLimitError();
  return {
    apiStyle: "responses",
    endpoint: "/responses",
    body: {
      model: selectedModel,
      input: [
        { role: "system", content: [{ type: "input_text", text: GROUNDED_SYSTEM_INSTRUCTIONS }] },
        { role: "user", content: [{ type: "input_text", text: user }] },
      ],
      reasoning: { effort },
      text: {
        verbosity: "medium",
        format: {
          type: "json_schema",
          name: "grounded_environment_answer",
          strict: true,
          schema: GROUNDED_RESPONSE_SCHEMA,
        },
      },
      store: false,
      stream: false,
    },
  };
}
