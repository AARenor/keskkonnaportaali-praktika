import { boundedChart, validPublicChart } from "./answer-chart.mjs";
import { officialCitationUrlEligibility, publicSourceAllowed } from "./citation-policy.mjs";
import { assertAnswerAddressesQuery } from "./llm_answer_validation.mjs";
import { sourceCanSupportPublicCitation, sourceCopyPermission } from "./source-registry.mjs";
import { stablePublicResultId } from "./retrieval_listing.mjs";
import { NO_ANSWER_EYEBROW } from "./search_response.mjs";
import { forestEvidenceIntent, normalize } from "./search_query_terms.mjs";
import { publicUsageTelemetry, searchUsageTelemetry } from "./search_usage_projection.mjs";

const CONDENSER_STOP_WORDS = new Set([
  "ehk", "ning", "oli", "olid", "on", "see", "seda", "kui", "mis", "et",
  "eesti", "aasta", "aastal", "aastatel", "andmed", "andmetel", "järgi", "põhjal",
]);

function condenserWords(value = "") {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("et")
    .replace(/[^0-9a-zõäöüšž]+/giu, " ")
    .split(/\s+/u)
    .filter((word) => word.length >= 4 && !CONDENSER_STOP_WORDS.has(word));
}

function condenserNumbers(value = "") {
  return [...String(value || "").normalize("NFKC").matchAll(/\d+(?:[.,]\d+)?/gu)]
    .map((match) => match[0].replace(",", "."));
}

function condenserOverlap(left, right) {
  const a = new Set(condenserWords(left));
  const b = new Set(condenserWords(right));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

// Remove a sentence that repeats another one's facts with slightly different
// framing. This is intentionally conservative: the later sentence must carry
// every number of the earlier one, and the wording must overlap substantially.
// Definition sentences such as "Statistiline metsainventuur ehk SMI on ..."
// are merged with a following acronym sentence instead of dropped.
export function condenseRedundantSentences(value = "", { mergeDefinitions = false } = {}) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  if (!text) return text;
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-ZÕÄÖÜŠŽ0-9„“"'])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length < 2) return text;
  const condensed = [];
  for (const sentence of sentences) {
    const previous = condensed.at(-1);
    if (previous) {
      const aNumbers = condenserNumbers(previous);
      const bNumbers = condenserNumbers(sentence);
      const numbersCovered = aNumbers.length > 0
        && aNumbers.every((number) => bNumbers.includes(number));
      const overlap = condenserOverlap(previous, sentence);
      if (numbersCovered && overlap >= 0.38) {
        // Keep the sentence that also carries the additional fact.
        condensed[condensed.length - 1] = sentence;
        continue;
      }
      if (overlap >= 0.82) {
        const aCovered = bNumbers.length > 0
          && bNumbers.every((number) => aNumbers.includes(number));
        if (aCovered || condenserWords(sentence).length <= condenserWords(previous).length) continue;
        condensed[condensed.length - 1] = sentence;
        continue;
      }
      if (mergeDefinitions) {
        const definition = previous.match(/^(.+?)\s+ehk\s+([A-ZÕÄÖÜŠŽ][\w-]{1,})\s+on\s+(.+)$/u);
        if (definition) {
          const [, fullName, acronym, predicate] = definition;
          const prefix = `${acronym} on `;
          if (sentence.startsWith(prefix)) {
            const rest = sentence.slice(prefix.length);
            if (condenserOverlap(predicate, rest) >= 0.2) {
              condensed[condensed.length - 1] = `${fullName} ehk ${acronym} on ${rest}`;
              continue;
            }
          }
        }
      }
    }
    condensed.push(sentence);
  }
  return condensed.join(" ");
}
// A copied field was legal when the evidence pack was built, but the response
// can be written much later: a slow model call, a streamed listing, a replayed
// timeout snapshot, a job poll. These helpers decide, on the clock that writes
// the response, whether the publisher decision behind each source still
// releases its copy, and what the response looks like when it no longer does.
// Link metadata is never part of the question.
//
// The bound travels as an enumerable own symbol on the internal result: a
// `{ ...result }` spread keeps it for an emitter, while JSON.stringify and
// every serialized body drop it, so an instant can never leak into a payload.
export const ANSWER_SOURCE_EXPIRY = Symbol.for("keskkonnaportaal.answer-source-expiry");
const WITHHELD_COPY_EYEBROW = "Allikas ei ole enam avaldatav";
const WITHHELD_COPY_TITLE = "Sisu ei ole enam avaldatav";
const WITHHELD_COPY_INTRO = "Selle allika sisu ei ole enam avaldatav, seega ei esita ma selle põhjal vastust. Allikate lingid on alles.";
const WITHHELD_COPY_CLARIFICATION = "Ava allikas uuesti, et näha selle praegust sisu.";

function citationSetOf(response = {}) {
  const cited = new Set();
  const collect = (citations) => {
    if (!Array.isArray(citations)) return;
    citations.forEach((citation) => {
      if (Number.isInteger(Number(citation))) cited.add(Number(citation));
    });
  };
  collect(response?.answer?.introCitations);
  if (Array.isArray(response?.answer?.parts)) {
    response.answer.parts.forEach((part) => collect(part?.citations));
  }
  if (Number.isInteger(Number(response?.chart?.citation))) cited.add(Number(response.chart.citation));
  return cited;
}

// The finite copied-text window of one source: the publisher's own
// `unavailable-after`, and the freshness bound the row itself declares. This is
// a hint for the emitters that need a bound, so it reads the stored decision
// directly; the authoritative question is the copy permission, which is asked
// separately on the clock that writes the response.
function sourceCopyExpiryAt(source = {}) {
  const windows = [];
  const stored = source?._sourcePolicy ?? source?.metadata?.source_policy ?? null;
  const unavailableAfter = Date.parse(String(stored?.directives?.unavailableAfter || ""));
  if (Number.isFinite(unavailableAfter)) windows.push(unavailableAfter);
  const maxAgeMs = Number(source?.freshness?.maxAgeMs);
  const basis = Date.parse(source?._evidenceStatusAt || source?.fetched_at || "");
  if (Number.isFinite(maxAgeMs) && maxAgeMs > 0 && Number.isFinite(basis)) windows.push(basis + maxAgeMs);
  return windows.length ? Math.min(...windows) : null;
}

/**
 * The earliest copied-text window among the sources this response actually
 * shows or cites, or null when nothing it shows is windowed. A final response
 * already carries the answer, a draft carries its own prose and chart, so both
 * are accepted; a response that was already projected answers from its own
 * symbol so downstream emitters cannot drift from the request that produced it.
 */
export function publicationCopyExpiry(response = {}) {
  const attached = response?.[ANSWER_SOURCE_EXPIRY];
  if (typeof attached === "number" && Number.isFinite(attached)) return attached;
  const sources = Array.isArray(response?.sources) ? response.sources : [];
  const cited = citationSetOf(response);
  let earliest = null;
  for (const source of sources) {
    const contributes = Boolean(source?.evidenceExcerpt || source?.summary)
      || cited.has(Number(source?.citation));
    if (!contributes) continue;
    const expiryAt = sourceCopyExpiryAt(source);
    if (expiryAt === null) continue;
    earliest = earliest === null ? expiryAt : Math.min(earliest, expiryAt);
  }
  return earliest;
}

// The response being written is projected from private sources, while the
// public source list it carries no longer holds a policy. The bound is therefore
// computed from the private list, and an already projected response keeps the
// bound it inherited so a second projection cannot drop it.
function attachPublicationCopyExpiry(value, sources = [], cited = new Set()) {
  const inherited = value?.[ANSWER_SOURCE_EXPIRY];
  let earliest = typeof inherited === "number" && Number.isFinite(inherited) ? inherited : null;
  for (const source of sources) {
    const contributes = Boolean(source?.evidenceExcerpt || source?.summary)
      || cited.has(Number(source?.citation));
    if (!contributes) continue;
    const expiryAt = sourceCopyExpiryAt(source);
    if (expiryAt === null) continue;
    earliest = earliest === null ? expiryAt : Math.min(earliest, expiryAt);
  }
  Object.defineProperty(value, ANSWER_SOURCE_EXPIRY, {
    value: earliest,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return value;
}

// One public link field set for both projections below and for the withheld
// replacement: navigation only, never a copied field, a witness, a policy, a
// digest, a metadata bag or an internal pack.
const PUBLIC_LINK_FIELDS = Object.freeze([
  "id", "citation", "title", "organization", "type", "published", "updated",
  "dataYear", "dataAsOf", "url", "locator", "actionUrl", "actionLabel", "tags", "sourceTier",
]);

function publicLinkOnly(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const link = {};
  for (const key of PUBLIC_LINK_FIELDS) {
    const field = value[key];
    if (key === "citation") {
      if (Number.isInteger(field) && field > 0) link.citation = field;
      continue;
    }
    if (key === "tags") {
      if (Array.isArray(field)) link.tags = field.filter((tag) => typeof tag === "string").slice(0, 5);
      continue;
    }
    if (typeof field === "string" || (typeof field === "number" && Number.isFinite(field))) link[key] = field;
  }
  return link;
}

function publicListingLinks(listing) {
  const items = (Array.isArray(listing?.items) ? listing.items : [])
    .map(publicLinkOnly)
    .filter(Boolean);
  const total = Number(listing?.total);
  const page = Number(listing?.page);
  const pageSize = Number(listing?.pageSize);
  const pageCount = Number(listing?.pageCount);
  const queryRevision = typeof listing?.queryRevision === "string"
    && /^[A-Za-z0-9_.:-]{1,128}$/u.test(listing.queryRevision)
    ? listing.queryRevision
    : undefined;
  const windowId = typeof listing?.windowId === "string"
    && /^[A-Za-z0-9_-]{1,128}$/u.test(listing.windowId)
    ? listing.windowId
    : undefined;
  return {
    ...(Number.isFinite(total) ? { total } : {}),
    ...(Number.isSafeInteger(page) && page >= 1 ? { page } : {}),
    ...(Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 50 ? { pageSize } : {}),
    ...(Number.isSafeInteger(pageCount) && pageCount >= 0 ? { pageCount } : {}),
    ...(typeof listing?.hasMore === "boolean" ? { hasMore: listing.hasMore } : {}),
    ...(listing?.totalRelation === "eq" || listing?.totalRelation === "gte"
      ? { totalRelation: listing.totalRelation } : {}),
    ...(typeof listing?.truncated === "boolean" ? { truncated: listing.truncated } : {}),
    ...(typeof listing?.windowExpired === "boolean" ? { windowExpired: listing.windowExpired } : {}),
    ...(queryRevision ? { queryRevision } : {}),
    ...(windowId ? { windowId } : {}),
    items,
  };
}
function withheldAnswerCard() {
  return {
    eyebrow: WITHHELD_COPY_EYEBROW,
    title: WITHHELD_COPY_TITLE,
    intro: WITHHELD_COPY_INTRO,
    introCitations: [],
    parts: [],
    note: "",
  };
}

/**
 * The links-only replacement for a response whose copied text may no longer be
 * shown. It is built from an explicit allowlist rather than by deleting fields
 * from the original, so a raw draft that still holds bodies, witnesses, digests
 * or metadata cannot leak any of them, and an embedded listing is reprojected
 * to links the same way. The card becomes the blanked no-answer card every
 * consumer already renders, and the chart is withdrawn with the claim it drew.
 * It accepts a final response or a draft, because a draft carries prose and a
 * chart of its own.
 */
// Names which check turned the model answer down, as a short code built from
// the check's own fixed message, so a test round can be counted by cause. The
// private detail's claim and source text never reach it: everything after the
// first "|" or "(" is dropped and only lowercase letters and hyphens remain.
export function attemptCheckCode(visibleCheck, attempt) {
  if (visibleCheck) return visibleCheck;
  const message = String(attempt?.detail || "").split("|")[0].replace(/\s*\(.*$/su, "");
  return normalize(message).replace(/^llm\s+/u, "").replace(/[^a-z]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80);
}

export function withholdPublicationCopy(response = {}) {
  const safe = response && typeof response === "object" && !Array.isArray(response) ? response : {};
  const attempt = safe.answerAttempt && typeof safe.answerAttempt === "object"
    ? {
      status: typeof safe.answerAttempt.status === "string" ? safe.answerAttempt.status : "",
      reason: typeof safe.answerAttempt.reason === "string" ? safe.answerAttempt.reason : "",
      ...(typeof safe.answerAttempt.check === "string" && /^[a-z-]{1,80}$/u.test(safe.answerAttempt.check) ? { check: safe.answerAttempt.check } : {}),
    }
    : undefined;
  const usageTelemetry = publicUsageTelemetry(safe.usage_telemetry);
  return {
    ...(typeof safe.query === "string" ? { query: safe.query } : {}),
    ...(Number.isFinite(Number(safe.total)) ? { total: Number(safe.total) } : {}),
    ...(typeof safe.generatedAt === "string" ? { generatedAt: safe.generatedAt } : {}),
    ...(usageTelemetry ? { usage_telemetry: usageTelemetry } : {}),
    ...(attempt ? { answerAttempt: attempt } : {}),
    ...(safe.searchResults !== undefined ? { searchResults: publicListingLinks(safe.searchResults) } : {}),
    related: (Array.isArray(safe.related) ? safe.related : [])
      .filter((item) => typeof item === "string")
      .slice(0, 6),
    answer: safe.answer ? withheldAnswerCard() : safe.answer,
    chart: undefined,
    sources: (Array.isArray(safe.sources) ? safe.sources : []).map(publicLinkOnly).filter(Boolean),
    clarification: WITHHELD_COPY_CLARIFICATION,
  };
}

export function publicResponse(draft, { now = Date.now(), copyNow = Date.now() } = {}) {
  // `now` is the eligibility clock the caller started the request with. The
  // copy decision has its own clock, because the response can be written long
  // after the request began; a caller may pin it to keep a test deterministic.
  const copyClock = typeof copyNow === "number" && Number.isFinite(copyNow) ? copyNow : Date.now();
  const {
    evidence: _evidence,
    usage_telemetry: rawUsageTelemetry,
    ...responseFields
  } = draft;
  const safeUsageTelemetry = publicUsageTelemetry(rawUsageTelemetry)
    || (!rawUsageTelemetry ? searchUsageTelemetry(null) : null);
  const response = {
    ...responseFields,
    ...(safeUsageTelemetry ? { usage_telemetry: safeUsageTelemetry } : {}),
  };
  const sources = (Array.isArray(response.sources) ? response.sources : [])
    .filter((source) => publicSourceAllowed(source) && officialCitationUrlEligibility(source?.url).eligible)
    .map((source) => {
      if (source.actionUrl === undefined || (publicSourceAllowed({url: source.actionUrl}) && officialCitationUrlEligibility(source.actionUrl).eligible)) return source;
      const { actionUrl: _actionUrl, actionLabel: _actionLabel, ...safeSource } = source;
      return safeSource;
    });
  // A card that says it has no answer never shows a figure next to that.
  const chartCandidate = response.answer?.eyebrow !== NO_ANSWER_EYEBROW && validPublicChart(response.chart, sources) ? boundedChart(response.chart) : null;
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
  let validMeasureScope = true;
  if (answer && forestEvidenceIntent(response.query)?.kind === "protected-forest-share") {
    try {
      assertAnswerAddressesQuery([answer.intro, ...(Array.isArray(answerParts) ? answerParts.map((part) => part.text) : [])].join(" "), response.query);
    } catch {
      validMeasureScope = false;
    }
  }
  // The copy decision belongs to the clock that writes this response, not to
  // the clock that built the pack. A slow model call, a replayed timeout
  // snapshot or a job poll can all arrive after a publisher's window closed,
  // so each source is asked again here. A source whose copy is withheld keeps
  // its link metadata and loses anything a reader would read as copied text,
  // and any claim or chart drawn from it goes with the copy.
  //
  // The decision is keyed by the source object itself: a producer emits its
  // rows before any citation is assigned, so a key derived from the citation
  // would let one uncited source answer for every other one.
  const copyDecisions = new WeakMap();
  const copyPermittedFor = (source, purpose) => {
    if (!source || typeof source !== "object") return true;
    let decided = copyDecisions.get(source);
    if (!decided) {
      decided = {};
      copyDecisions.set(source, decided);
    }
    if (!Object.hasOwn(decided, purpose)) {
      decided[purpose] = sourceCopyPermission(source, { purpose, now: copyClock }).permitted;
    }
    return decided[purpose];
  };
  // A claim and a chart are evidence, so they need the evidence permission
  // specifically. A policy may release the snippet and withhold the model
  // evidence: that source still shows its link and its snippet, but it cannot
  // support a claim or a figure.
  const evidenceWithheld = (source) => !copyPermittedFor(source, "evidence");
  const withheldCitations = new Set(sources.filter(evidenceWithheld).map((source) => Number(source?.citation)));
  const citesWithheldCopy = (citations) => (Array.isArray(citations) ? citations : [])
    .some((citation) => withheldCitations.has(Number(citation)));
  const withheldAnswer = Boolean(answer) && citesWithheldCopy(answer?.introCitations);
  // One projection for both returns: link metadata always survives, and a
  // copied field is emitted only while the publisher decision still releases it
  // on this clock.
  const publicSourceList = (list, { copiedText = true } = {}) => list.map((source, index) => {
    const publicKeys = [...PUBLIC_LINK_FIELDS];
    if (copiedText) {
      if (source.evidenceExcerpt && copyPermittedFor(source, "evidence")) publicKeys.push("evidenceExcerpt");
      else if (source.summary && copyPermittedFor(source, "snippet")) publicKeys.push("summary");
    }
    return {
      ...Object.fromEntries(publicKeys
        .filter((key) => source[key] !== undefined)
        .map((key) => [key, source[key]])),
      id: stablePublicResultId(source),
      citation: index + 1,
    };
  });
  if (!validCitationShape
    || !validAnswerCitations
    || !citationsResolveExactlyOnce
    || !validMeasureScope
    || !citedSourcesSupportPublicClaims) {
    // A cited source that can no longer be verified normally leaves the card
    // with no results at all. When the reason is a copied-text window that has
    // closed, the reader still gets the navigation: the links stay, without any
    // copied text, instead of the source disappearing with its excerpt.
    const withheldProxy = withheldCitations.size > 0;
    return attachPublicationCopyExpiry({
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
      sources: withheldProxy ? publicSourceList(sources, { copiedText: false }) : [],
    }, withheldProxy ? sources : [], new Set());
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
  return attachPublicationCopyExpiry({
    ...response,
    clarification: withheldAnswer ? WITHHELD_COPY_CLARIFICATION : response.clarification,
    chart: chart && !withheldCitations.has(Number(chart.citation))
      ? { ...chart, citation: citationMap.get(chart.citation) }
      : undefined,
    answer: answer ? (withheldAnswer
      ? withheldAnswerCard()
      : {
        ...answer,
        intro: condenseRedundantSentences(answer.intro, { mergeDefinitions: true }),
        introCitations: compactCitations(answer.introCitations),
        parts: answerParts
          .filter((part) => !citesWithheldCopy(part?.citations))
          .map((part) => ({
            ...part,
            text: condenseRedundantSentences(part.text, { mergeDefinitions: true }),
            citations: compactCitations(part.citations),
          })),
      }) : answer,
    sources: publicSourceList(visibleSources),
  }, visibleSources, usedCitations);
}
