import { analyzeQueryIntent, isNoticeFeeQuestion, supportsIntentConcept } from "./query_intent.mjs";
import { normalize, queryRootVariants } from "./search_query_terms.mjs";
import { answersNoticeQualifiers } from "./answer_coverage.mjs";

const LAW_HOSTS = new Set(["riigiteataja.ee", "www.riigiteataja.ee"]);
const AGENCY_HOSTS = new Set(["keskkonnaamet.ee", "www.keskkonnaamet.ee"]);
const FAO_SOURCE_ID = "fao-fra-terms-2025";

function citationOf(source) {
  return Number.isInteger(source?.citation) && source.citation > 0 ? source.citation : null;
}

function sourceText(source) {
  return String(source?.content || source?.evidenceExcerpt || "").trim();
}

function sourceUrl(source) {
  try {
    return new URL(source?.url).toString();
  } catch {
    return "";
  }
}

function isLawSection(source, anchor) {
  const citation = citationOf(source);
  if (!citation || source.organization !== "Riigi Teataja" || !/^Metsaseadus\b/u.test(String(source.title || ""))) return false;
  try {
    const url = new URL(sourceUrl(source));
    const matchesAnchor = anchor
      ? url.hash === `#${anchor}`
      : /^#para[\p{L}\p{N}]+$/u.test(url.hash);
    return url.protocol === "https:" && LAW_HOSTS.has(url.hostname) && url.pathname === "/akt/MS"
      && matchesAnchor && Boolean(sourceText(source));
  } catch {
    return false;
  }
}

function subsections(content) {
  const text = String(content || "");
  const markers = [...text.matchAll(/\((\d+)\)\s*/gu)];
  return new Map(markers.map((marker, index) => [
    marker[1], text.slice(marker.index, markers[index + 1]?.index ?? text.length).trim(),
  ]));
}

function withoutMarker(value) {
  return String(value || "").replace(/^\(\d+[^)]*\)\s*/u, "").trim();
}
function splitNumberedItems(text) {
  const value = String(text || "").trim();
  const firstItem = value.search(/\s+\d+\)\s/u);
  if (firstItem < 0) return { lead: value, details: "" };
  return {
    lead: value.slice(0, firstItem).trim(),
    details: value.slice(firstItem).trim(),
  };
}

function lawSource(sources, anchor) {
  return (Array.isArray(sources) ? sources : []).find((source) => isLawSection(source, anchor)) || null;
}

function answer({ eyebrow, title, intro, introCitations, parts = [], note = "", format }) {
  return { eyebrow, title, intro, introCitations, parts, note, format };
}

function clearcutActivity(source, format) {
  const citation = citationOf(source);
  const paragraph = subsections(sourceText(source)).get("1");
  const text = withoutMarker(paragraph);
  if (!citation || !text || !/\blageraie\s+(?:korral|on)\b/iu.test(text)
    || /\blageraie\s+on\s+(?:lubatud|lubatav\p{L}*|keelatud|vajalik\p{L}*)\b/iu.test(text)) return null;
  const { lead, details } = splitNumberedItems(text);
  if (format === "definition") {
    const intro = details
      ? lead.replace(/,\s*välja arvatud:\s*$/u, ", välja arvatud seaduses loetletud erandid.")
      : text;
    return answer({
      eyebrow: "Metsaseaduse § 29 tegevuse kirjeldus",
      title: "Lageraie",
      intro,
      introCitations: [citation],
      note: "See kirjeldab raietegevust, mitte konkreetse kinnistu luba.",
      format,
    });
  }
  return answer({
    eyebrow: "Metsaseaduse § 29 tunnus",
    title: "Mida loetakse lageraieks",
    intro: details ? lead : text,
    introCitations: [citation],
    parts: details ? [{
      title: "Seaduses loetletud erandid",
      text: details,
      citations: [citation],
      role: "criterion",
    }] : [],
    note: "Tegevuse kirjeldus ei kinnita konkreetse kinnistu raieluba.",
    format,
  });
}

function clearcutConditions(sources) {
  const law = lawSource(sources, "para29");
  const guidance = (Array.isArray(sources) ? sources : []).find((source) => {
    if (source?.id !== "forest-notice-guidance" || source.organization !== "Keskkonnaamet" || !citationOf(source)) return false;
    try {
      const url = new URL(sourceUrl(source));
      return url.protocol === "https:" && AGENCY_HOSTS.has(url.hostname) && url.pathname === "/elusloodus-looduskaitse/metsandus/metsateatis-ja-metsaregister";
    } catch {
      return false;
    }
  });
  if (!law || !guidance) return null;
  const lawCitation = citationOf(law);
  const guidanceCitation = citationOf(guidance);
  const conditionText = withoutMarker(subsections(sourceText(law)).get("4"));
  const { lead, details } = splitNumberedItems(conditionText);
  const startRule = sourceText(guidance).match(/(?:T[oö][oö]dega|Raiet[oö][oö]dega)\s+v[oõ]ib\s+alustada[^.]*\./iu)?.[0] || "";
  if (!conditionText || !/\b(?:vanus\p{L}*|diameetr\p{L}*|rinnaspindala\p{L}*|t[aä]ius\p{L}*|puistu\p{L}*)\b/iu.test(conditionText)
    || !/10\s+p[aä]eva/iu.test(startRule) || !/24\s+kuu/iu.test(startRule)
    || !/metsaregistr\p{L}*/iu.test(startRule) || !/registreeri\p{L}*/iu.test(startRule)) return null;
  return answer({
    eyebrow: "Metsaseaduse üldtingimused",
    title: "Millal lageraie on lubatud",
    intro: lead || conditionText,
    introCitations: [lawCitation],
    parts: [
      ...(details ? [{ title: "Puistu tingimused", text: details, citations: [lawCitation], role: "condition" }] : []),
      { title: "Tööde algus ja tähtaeg", text: startRule, citations: [guidanceCitation], role: "condition" },
    ],
    note: "Need on üldreeglid. Need ei kinnita konkreetse kinnistu raieluba.",
    format: "conditions",
  });
}

function forestDefinition(source, query) {
  const citation = citationOf(source);
  const analysis = analyzeQueryIntent(query);
  const asksAboutForestLand = analysis.terms.includes("metsamaa")
    || /\bmetsamaa\p{L}*\b/iu.test(String(query || ""));
  const paragraphs = subsections(sourceText(source));
  const paragraph = withoutMarker(paragraphs.get(asksAboutForestLand ? "2" : "1"));
  const expectedDefinition = asksAboutForestLand
    ? /\bmetsamaa\p{L}*\s+(?:on|loetakse)\b/iu
    : /\bmets\s+on\b/iu;
  if (!citation || !expectedDefinition.test(paragraph)) return null;
  return answer({
    eyebrow: "Metsaseaduse § 3",
    title: asksAboutForestLand ? "Metsamaa seaduse mõttes" : "Mets seaduse mõttes",
    intro: paragraph,
    introCitations: [citation],
    note: "See on Eesti seaduse määratlus, mitte rahvusvaheline statistikadefinitsioon.",
    format: "definition",
  });
}

function forestCriteria(source) {
  const citation = citationOf(source);
  const paragraphs = subsections(sourceText(source));
  const forest = withoutMarker(paragraphs.get("1"));
  const forestLand = withoutMarker(paragraphs.get("2"));
  const exclusions = withoutMarker(paragraphs.get("3"));
  if (!citation || !exclusions || !/\bmets\s+on\b/iu.test(forest) || !/\bmetsamaa\p{L}*/iu.test(forestLand)
    || !/\b(?:hektar\p{L}*|pindala\p{L}*)/iu.test(forestLand) || !/\bpuu\p{L}*\b/iu.test(forestLand)
    || !/\b(?:k[oõ]rgus\p{L}*|v[oõ]ra\p{L}*|liitus\p{L}*)\b/iu.test(forestLand)) return null;
  const parts = [forestLand, exclusions].filter(Boolean).map((text, index) => ({
    title: ["Metsamaa", "Erandid"][index],
    text,
    citations: [citation],
    role: "criterion",
  }));
  return answer({
    eyebrow: "Metsaseaduse § 3 mõisted",
    title: "Mida loetakse metsaks",
    intro: forest,
    introCitations: [citation],
    parts,
    note: "Need on Eesti seaduse mõisted, mitte rahvusvaheline statistikadefinitsioon.",
    format: "criteria",
  });
}

function explicitFaoDefinition(query, sources) {
  if (!/\b(?:fao|fra)\b/iu.test(query)) return null;
  const source = (Array.isArray(sources) ? sources : []).find((item) => item?.id === FAO_SOURCE_ID && citationOf(item));
  if (!source || source.organization !== "Food and Agriculture Organization of the United Nations (FAO)") return null;
  try {
    const url = new URL(sourceUrl(source));
    if (url.protocol !== "https:" || url.hostname !== "openknowledge.fao.org") return null;
  } catch {
    return null;
  }
  const citation = citationOf(source);
  const sentences = sourceText(source).split(/(?<=[.!?])\s+/u).filter(Boolean);
  const forest = sentences.find((sentence) => /FAO FRA 2025 m[aä][aä]ratluse j[aä]rgi on mets/iu.test(sentence));
  if (!forest) return null;
  if (!/\b(?:m[õo]iste\w*|definitsioon\w*|termin\w*)\b/iu.test(query)) {
    return answer({
      eyebrow: "FAO FRA 2025 rahvusvaheline määratlus",
      title: "Mets rahvusvahelises statistikas",
      intro: forest,
      introCitations: [citation],
      note: "See on FAO FRA määratlus. Eesti Metsaseaduse mõiste on eraldi.",
      format: "definition",
    });
  }
  const definitions = [
    ["Muu puittaimestikuga maa", /^Muu puittaimestikuga maa on\b/iu],
    ["Kasvav tagavara", /^Kasvav tagavara on\b/iu],
    ["Raadamine", /^Raadamine on\b/iu],
    ["Metsastumine", /^Metsastumine on\b/iu],
    ["Metsa pindala netomuutus", /^Metsa pindala netomuutus on\b/iu],
  ].map(([title, pattern]) => {
    const text = sentences.find((sentence) => pattern.test(sentence));
    return text ? { title, text, citations: [citation], role: "definition" } : null;
  });
  if (definitions.some((part) => !part)) return null;
  return answer({
    eyebrow: "FAO FRA 2025 rahvusvahelised mõisted",
    title: "FAO FRA 2025 mõisted",
    intro: forest,
    introCitations: [citation],
    parts: definitions,
    note: "Need on FAO FRA rahvusvahelised statistikamõisted. Eesti Metsaseaduse mõisted on eraldi.",
    format: "definition",
  });
}

function noticeGuidanceSource(sources) {
  const source = (Array.isArray(sources) ? sources : []).find((item) => item?.id === "forest-notice-guidance" && citationOf(item));
  if (!source || source.organization !== "Keskkonnaamet") return null;
  try {
    const url = new URL(sourceUrl(source));
    return url.protocol === "https:" && AGENCY_HOSTS.has(url.hostname)
      && url.pathname === "/elusloodus-looduskaitse/metsandus/metsateatis-ja-metsaregister"
      ? source
      : null;
  } catch {
    return null;
  }
}

function noticeFee(query, sources) {
  const source = noticeGuidanceSource(sources);
  const statement = sourceText(source).match(/Alates 1\. juulist 2024 tuleb uuendusraie ja raadamise iga metsateatise läbivaatamise eest tasuda 30 eurot riigilõivu; muud raietüübid ei ole selle juhise järgi tasulised\./iu)?.[0] || "";
  const citation = citationOf(source);
  if (!statement || !citation || !answersNoticeQualifiers(query, statement)) return null;
  return answer({
    eyebrow: "Keskkonnaameti metsateatise juhis",
    title: "Metsateatise läbivaatamise riigilõiv",
    intro: statement,
    introCitations: [citation],
    note: "See käsitleb teatise läbivaatamise riigilõivu, mitte konkreetse kinnistu raieluba.",
    format: "conditions",
  });
}

function noticeRequirements(query, sources) {
  const source = noticeGuidanceSource(sources);
  if (!source) return null;
  const text = sourceText(source);
  const duty = text.match(/Metsateatis esitatakse kavandatavate raiete kohta, välja arvatud valgustusraie, ning metsaregistrisse kandmata oluliste metsakahjustuste kohta\./iu)?.[0] || "";
  const annualException = text.match(/Keskkonnaameti kehtiva juhise järgi võib metsaomanik metsateatist esitamata raiuda kuni 20 tihumeetrit puitu kinnisasja kohta aastas\./iu)?.[0] || "";
  if (!duty || !annualException || !answersNoticeQualifiers(query, `${duty} ${annualException}`)) return null;
  const citation = citationOf(source);
  return answer({
    eyebrow: "Keskkonnaameti metsateatise juhis",
    title: "Metsateatise esitamise tingimused",
    intro: duty,
    introCitations: [citation],
    parts: [{
      title: "Aastane kogus, mille puhul juhis lubab teatise esitamata jätta",
      text: annualException,
      citations: [citation],
      role: "condition",
    }],
    note: "See on üldjuhis. See ei kinnita konkreetse kinnistu raieluba.",
    format: "conditions",
  });
}

function procedureSteps(content) {
  const text = String(content || "");
  const markers = [...text.matchAll(/\((\d+)\)\s*/gu)];
  return markers.map((marker, index) => {
    const start = marker.index + marker[0].length;
    const nextMarker = markers[index + 1]?.index ?? text.length;
    const sentenceEnd = text.indexOf(". ", start);
    const end = sentenceEnd >= 0 && sentenceEnd < nextMarker ? sentenceEnd + 1 : nextMarker;
    return { step: Number(marker[1]), text: text.slice(start, end).trim() };
  });
}

function asksAboutSpecificProperty(query) {
  return /\b(?:kinnist\p{L}*|kinnisasj\p{L}*|erald\p{L}*|katastriuks\p{L}*)\b/u.test(normalize(query));
}

function noticeProcedure(query, sources) {
  const source = noticeGuidanceSource(sources);
  if (!source) return null;
  const citation = citationOf(source);
  const procedureIntro = sourceText(source).match(/Esitamise sammud Metsaregistris:/iu)?.[0] || "";
  if (!procedureIntro) return null;
  const steps = procedureSteps(sourceText(source)).filter((item) => item.step >= 1 && item.step <= 4);
  const expectedSteps = [
    /ava\s+metsaregister/iu,
    /logi\s+sisse/iu,
    /vali\s+oma\s+kinnistu/iu,
    /t[aä]ida\s+metsateatise\s+vorm\s+ja\s+esita\s+see/iu,
  ];
  if (steps.length !== 4 || steps.some((item, index) => item.step !== index + 1 || !expectedSteps[index].test(item.text))) return null;
  const propertyGuide = asksAboutSpecificProperty(query)
    ? sourceText(source).match(/Konkreetse kinnistu[^.]*\./iu)?.[0] || ""
    : "";
  const selectedEvidence = [procedureIntro, ...steps.map((item) => item.text), propertyGuide].join(" ");
  if (!answersNoticeQualifiers(query, selectedEvidence)) return null;
  return answer({
    eyebrow: "Keskkonnaameti metsateatise juhis",
    title: "Metsateatise esitamine",
    intro: procedureIntro,
    introCitations: [citation],
    parts: [
      ...steps.map((item) => ({ title: `Samm ${item.step}`, text: item.text, citations: [citation], role: "step", step: item.step })),
      ...(propertyGuide ? [{ title: "Konkreetse kinnistu andmed", text: propertyGuide, citations: [citation], role: "context" }] : []),
    ],
    note: "See on üldjuhis. See ei kinnita konkreetse kinnistu raieluba.",
    format: "procedure",
  });
}


function authorityRuleAnswer(sources, analysis) {
  const subjectTerms = Array.isArray(analysis?.authoritySubjectTerms)
    ? analysis.authoritySubjectTerms
    : [];
  if (!subjectTerms.length) return null;
  const subjectRoots = subjectTerms.map((term) => {
    const normalizedTerm = normalize(term);
    const variants = queryRootVariants(term)
      .map(normalize)
      .filter((root) => root && normalizedTerm.startsWith(root));
    return [...new Set([normalizedTerm, ...variants])].filter(Boolean);
  });
  if (subjectRoots.some((roots) => !roots.length)) return null;

  const matches = new Map();
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!isLawSection(source)) continue;
    const citation = citationOf(source);
    for (const rawSentence of sourceText(source).split(/(?<=[.!?])\s+/u)) {
      const statement = withoutMarker(rawSentence);
      const normalizedStatement = normalize(statement);
      if (!statement || !/\bkehtest(?:ab|avad)\b/u.test(normalizedStatement)) continue;
      const words = normalizedStatement.split(/\s+/u).filter(Boolean);
      const matchesSubject = subjectRoots.every((roots) => roots.some((root) => words
        .some((word) => word === root || word.startsWith(root))));
      if (!matchesSubject) continue;
      matches.set(`${source.url}\n${normalizedStatement}`, { source, statement, citation });
    }
  }
  if (matches.size !== 1) return null;
  const { source, statement, citation } = matches.values().next().value;
  return answer({
    eyebrow: source.title,
    title: "Seaduses nimetatud kehtestaja",
    intro: statement,
    introCitations: [citation],
    note: "See on seaduses kirjas olev üldreegel.",
    format: "general",
  });
}

export function buildIntentAnswer({ query, intent, topic, sources = [] } = {}) {
  const analysis = analyzeQueryIntent(query);
  if (analysis.intent !== intent || analysis.topic !== topic) return null;
  if (intent === "conditions") {
    const authorityAnswer = authorityRuleAnswer(sources, analysis);
    if (authorityAnswer) return authorityAnswer;
  }
  if (["clearcut", "forest"].includes(topic) && !supportsIntentConcept(analysis)) return null;
  if (topic === "clearcut" && (intent === "definition" || intent === "criteria")) {
    const source = lawSource(sources, "para29");
    return source ? clearcutActivity(source, intent) : null;
  }
  if (topic === "clearcut" && intent === "conditions") return clearcutConditions(sources);
  if (topic === "forest" && (intent === "definition" || intent === "criteria")) {
    if (/\b(?:smi|statistik\w*|statistil\w*)\b/iu.test(String(query || ""))) return explicitFaoDefinition(query, sources);
    if (/\b(?:fao|fra)\b/iu.test(String(query || ""))) return explicitFaoDefinition(query, sources);
    const source = lawSource(sources, "para3");
    if (!source) return null;
    return intent === "definition" ? forestDefinition(source, query) : forestCriteria(source);
  }
  if (topic === "forest_notice" && intent === "procedure") return noticeProcedure(query, sources);
  if (topic === "forest_notice" && intent === "conditions") {
    return isNoticeFeeQuestion(query) ? noticeFee(query, sources) : noticeRequirements(query, sources);
  }
  return null;
}
