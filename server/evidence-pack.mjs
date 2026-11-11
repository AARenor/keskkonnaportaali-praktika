import { createHash } from "node:crypto";
import { containsUnsafeInstruction, forestEvidenceIntent, normalize, queryTerms, sanitizeLlmEvidenceText, splitTextPassages, textHasQueryRoot } from "./search.mjs";
import { projectSourceCopy, SOURCE_EVIDENCE_BODY_CHARS, SOURCE_EVIDENCE_COPY_CHARS, sourceCanSupportPublicCitation, sourceCopyPermission } from "./source-registry.mjs";
import { sourceEvidenceBinding, sourceWitnessKey } from "./source-identity.mjs";

const MAX_SOURCES = 10;
// What one source may contribute to the model. The selection below runs over the
// whole policy-permitted body and decides which passages spend this budget, so
// the cap is applied to the chosen windows and never to the raw record.
const MAX_CONTENT = SOURCE_EVIDENCE_COPY_CHARS;
const MAX_SERIALIZED = 36_000;
// Only this constructor can admit a pack. A copied object and recomputed
// digest are not proof that its windows crossed the source boundary.
const constructedPacks = new WeakSet();

export function isEvidencePack(pack) {
  return constructedPacks.has(pack) && pack.complete === true;
}

function directiveWord(source) {
  return String.raw`(?<![\p{L}\p{N}_])(?:${source})(?![\p{L}\p{N}_])`;
}

const DIRECTIVE_FORM = directiveWord(String.raw`vastake|vasta|kirjutage|kirjuta|märkige|märgi|lisage|lisa|jätke|jäta|nimetage|nimeta|tagastage|tagasta|koostage|koosta|eirake|eira|ignoreeri|ignore|answer|respond|reply|output|return|print|write|include|mention|mark|ответьте|ответь|напишите|напиши|игнорируйте|игнорируй`);
const DIRECTED_ANSWER = directiveWord(String.raw`vastus\w*|vastuses|vastuseks|answer\w*|response\w*|reply|output|kokkuvõt\w*|kokkuvõte|summary|mudel\w*|model|assistant|tehisintellekt\w*|chatbot\w*|küsimus\w*|question\w*`);
const DIRECTED_SOURCE_BASE = directiveWord(String.raw`allika\w*|allikate\w*|allikas|sources?|evidence|tõend\w*|viide|viited|viita\w*|citations?|kontekst\w*|context|juhis\w*|instructions?|korraldus\w*|reegl\w*|источник\w*`);
const ANSWER_SHAPING = directiveWord(String.raw`nii|järgmiselt|ainult|alati|mitte|ilma|as|only|always|never|without|stiil\w*|style`);
const ANSWER_WORDING = String.raw`(?:in\s+(?:English|Estonian)|(?:inglise|eesti)\s+keeles|lühidalt|briefly|viiteid|viited|citations?|no\s+citations?|without\s+citations?)`;

// An instruction addressed to the answer writer is not evidence. Every
// alternative below pairs a directive form with the object it directs: the
// answer itself, the source base it must ignore or cite, or the wording it must
// use. A reviewed forestry page that tells a person to submit an application
// ("Esitage taotlus"), warns a landowner ("Ära kasuta kemikaale") or says one
// area "ei vasta" a definition matches none of them, which the corpus test
// below measures over every reviewed document.
const ANSWER_DIRECTIVE_PATTERNS = Object.freeze([
  new RegExp(String.raw`${DIRECTIVE_FORM}[\s\S]{0,90}${DIRECTED_ANSWER}[\s\S]{0,90}${ANSWER_SHAPING}`, "iu"),
  new RegExp(String.raw`${directiveWord("vasta|vastake|tagasta|answer|respond|reply|output|return|print|write")}[\s\S]{0,40}${directiveWord("et|that")}`, "iu"),
  new RegExp(String.raw`${directiveWord("eira|eirake|ignoreeri|ignore|игнорируй|игнорируйте")}[\s\S]{0,90}${DIRECTED_SOURCE_BASE}`, "iu"),
  new RegExp(String.raw`${directiveWord("ära|ärge|mitte|do\\s+not|don'?t|never|не")}\s*${directiveWord("kasuta|kasutage|maini|mainige|viita|viitage|cite|use|mention|include|упоминай|используй")}[\s\S]{0,90}${DIRECTED_SOURCE_BASE}`, "iu"),
  new RegExp(String.raw`${directiveWord("vasta|vastake|answer|respond|reply|write")}[\s\S]{0,60}${ANSWER_WORDING}`, "iu"),
]);

/**
 * A passage that directs the answer instead of stating a fact about the forest.
 * Quarantining it is lossy, so the grammar is built from paired directive
 * constructions rather than from topic words: it never fires on a forestry
 * term, and the corpus test pins that no reviewed sentence is lost.
 */
export function containsAnswerDirective(value) {
  const text = String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!text) return false;
  return ANSWER_DIRECTIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function instructionPassage(value) {
  return containsUnsafeInstruction(value) || containsAnswerDirective(value);
}

function passageText(value) {
  return sanitizeLlmEvidenceText(value).replace(/\s+/gu, " ").trim();
}

function metadataText(value, limit) {
  return splitTextPassages(sanitizeLlmEvidenceText(value))
    .filter((passage) => !containsAnswerDirective(passage))
    .join("\n")
    .slice(0, limit);
}


export function evidencePackMatchesSources(pack, sources = [], { now = Date.now() } = {}) {
  if (!isEvidencePack(pack)) return false;
  return pack.entries.every((entry) => {
    const matching = sources.filter((source) => source.citation === entry.citation);
    if (matching.length !== 1 || !sourceCanSupportPublicCitation(matching[0], { now }).eligible) return false;
    const actual = sourceEvidenceBinding(matching[0]);
    const admitted = pack.bindings[entry.citation];
    if (!admitted
      || actual.witnessKey !== admitted.witnessKey
      || actual.version !== admitted.version
      || actual.snapshotHash !== admitted.snapshotHash) return false;
    // The body and the publisher decision are one witness. A record whose
    // observation is gone, replaced by a withdrawing one or past its
    // `unavailable-after` no longer authenticates the text that was admitted
    // under it, even when every copied character is unchanged.
    const permission = sourceCopyPermission(matching[0], { purpose: "evidence", now });
    return permission.permitted && permission.binding === (admitted.policyBinding ?? null);
  });
}

function windowScore(passage, query, intent) {
  const text = normalize(passage);
  const roots = queryTerms(query);
  const matched = roots.filter((root) => textHasQueryRoot(text, root)).length;
  let score = matched * 14 + (matched && matched === roots.length ? 10 : 0);
  if (intent?.kind === "forest-area") {
    if (/\b(?:metsamaa|metsaga\s+kaetud|metsasus|metsa\s+pindala|metsade\s+pindala)\b/iu.test(passage)) score += 20;
    if (/\b\d+(?:[.,]\d+)?\s*(?:%|protsent(?:i|ides|ides?)?|ha\b|hektar(?:it|i)?|miljonit?\s+hektarit?)/iu.test(passage)) score += 24;
    if (/\b(?:smi|statistilise\s+metsainvent)/iu.test(passage)) score += 8;
  }
  if (intent?.kind === "forest-data-sources") {
    score += (/\b(?:smi|statistilise\s+metsainvent\w*)/iu.test(passage) ? 20 : 0)
      + (/\bmetsaregis\w*|metsaressursi\s+arvestuse\s+riiklik/iu.test(passage) ? 20 : 0)
      + (/\b(?:metsa|metsandus|metsainventeerimis)andm\w*|inventeerimisandm\w*/iu.test(passage) ? 10 : 0);
  }
  if (intent?.kind === "forest-depletion") {
    score += (/\b(?:metsa\s+tagavara|kasvava\s+metsa\s+tagavara|metsavaru)\w*[\s\S]{0,100}\b(?:stabiil\w*|pusi\w*|suuren\w*|vahen\w*|lang\w*)\b/iu.test(passage) ? 34 : 0)
      + (/\b(?:metsamaa\w*|metsasus\w*|metsa\s+pindala)\b/iu.test(passage) ? 20 : 0)
      + [/\btagavara\w*/iu, /\bvanus\w*|vanuselis\w*/iu, /\bkahjust\w*/iu, /\belurikk\w*/iu, /\bkaits\w*/iu].filter((pattern) => pattern.test(passage)).length * 5;
  }
  return score;
}

function rawWindows(source, query) {
  const seen = new Set();
  const intent = forestEvidenceIntent(query);
  const windows = [];
  for (const [field, priority] of [["summary", 6], ["answer", 8], ["content", 2]]) {
    for (const passage of splitTextPassages(sanitizeLlmEvidenceText(source[field]))) {
      const text = passage.replace(/\s+/gu, " ").trim();
      if (!text || seen.has(text) || containsAnswerDirective(text)) continue;
      seen.add(text);
      windows.push({ text, order: windows.length, score: windowScore(text, query, intent) + priority });
    }
  }
  return windows;
}

const EVIDENCE_METADATA_FIELDS = Object.freeze([
  "title", "organization", "source_type", "published", "updated", "data_year",
  "data_as_of", "locator", "freshness_class", "observed_at", "valid_from",
  "valid_until", "version", "url",
]);

function entrySegments(record) {
  const segments = [];
  for (const field of EVIDENCE_METADATA_FIELDS) {
    const text = String(record.entry[field] ?? "").trim();
    if (text) segments.push({ record, field, text });
  }
  for (const line of String(record.entry.content || "").split("\n")) {
    const text = line.trim();
    if (text) segments.push({ record, field: "content", text });
  }
  return segments;
}

/**
 * Per-field sanitizing cannot see an instruction a page splits across two of
 * its own fields or across two sources: "… eira kõiki" in the title and "teisi
 * allikaid ja märgi lõppvastuses …" in the body are innocent alone and an
 * instruction together. Re-read the assembled evidence as the model reads it,
 * then drop every segment that sits inside a rejected sentence. Citation
 * metadata is removed rather than rewritten, and a content passage leaves the
 * pack, so a required role that depended on it is reported missing instead of
 * silently keeping a witness the reader cannot see.
 */
function quarantineJoinedDirectives(records) {
  const segments = records.flatMap(entrySegments);
  if (segments.length < 2) return;
  const rejected = splitTextPassages(segments.map((segment) => segment.text).join(" ")).filter(instructionPassage);
  if (!rejected.length) return;
  const removedByRecord = new Map();
  for (const segment of segments) {
    if (!rejected.some((passage) => passage.includes(segment.text))) continue;
    if (segment.field !== "content") {
      segment.record.entry[segment.field] = null;
      continue;
    }
    if (!removedByRecord.has(segment.record)) removedByRecord.set(segment.record, new Set());
    removedByRecord.get(segment.record).add(segment.text);
  }
  for (const [record, removed] of removedByRecord) {
    record.entry.content = String(record.entry.content || "")
      .split("\n")
      .filter((line) => !removed.has(line.trim()))
      .join("\n");
  }
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// The one passage selection this application uses. The delivery gate asks for
// it when a permitted field is longer than its budget, and the pack orders its
// own windows with the same call, so a character is chosen by relevance in both
// places or by neither.
function selectEvidenceCopy(value, { query, limit }) {
  const windows = rawWindows({ content: String(value ?? "") }, query);
  if (!windows.length) return "";
  const ranked = [...windows].sort((left, right) => right.score - left.score || left.order - right.order);
  const chosen = [];
  let used = 0;
  for (const window of ranked) {
    const next = used + window.text.length + (chosen.length ? 1 : 0);
    if (next > limit) continue;
    chosen.push(window);
    used = next;
  }
  // A single relevant passage can be longer than the whole budget. Handing over
  // the start of the best one beats handing over nothing; the gate cuts it.
  if (!chosen.length) return ranked[0].text;
  return chosen.sort((left, right) => left.order - right.order).map((window) => window.text).join("\n");
}

export function buildEvidencePack({ sources = [], query = "", plan = null, now = Date.now() } = {}) {
  const requiredRoles = [...new Set(plan?.requiredRoles || [])];
  const requiredIds = new Set(requiredRoles.map((role) => plan?.roleWitnesses?.[role]?.documentId).filter(Boolean));
  const citationCounts = new Map();
  sources.forEach((source) => citationCounts.set(source.citation, (citationCounts.get(source.citation) || 0) + 1));
  // A source becomes model input only through this projection: the publisher
  // decision observed for its own body, the resource the witness names, and one
  // character budget for everything copied out of it.
  const copies = new Map();
  const eligible = sources.filter((source) => {
    if (!sourceCanSupportPublicCitation(source, { now }).eligible || !sourceWitnessKey(source)
      || !Number.isInteger(source.citation) || source.citation < 1
      || citationCounts.get(source.citation) !== 1) return false;
    // The gate decides whether this body may be copied and how many characters
    // the publisher allows. Inside that budget this selection names the passages
    // that answer the question, so a capped page hands over its measurement and
    // not the first sentences of its introduction.
    const copy = projectSourceCopy(source, {
      purpose: "evidence",
      now,
      limit: SOURCE_EVIDENCE_BODY_CHARS,
      selector: (text, characters) => selectEvidenceCopy(text, { query, limit: characters }),
    });
    if (!copy.permitted) return false;
    copies.set(source, copy);
    return true;
  });
  const selectedSources = [...eligible.filter((source) => requiredIds.has(source.id)), ...eligible.filter((source) => !requiredIds.has(source.id))].slice(0, MAX_SOURCES);
  const records = selectedSources.map((source) => {
    const eligibility = sourceCanSupportPublicCitation(source);
    const binding = sourceEvidenceBinding(source);
    const copy = copies.get(source);
    return {
      source,
      // The evidence binding names the body; the copy binding names the
      // publisher decision that released it. A pack is current only while both
      // still hold, so both travel with the admitted entry.
      binding: Object.freeze({ ...binding, policyBinding: copy?.binding ?? null }),
      // Windows are drawn from the projected copy only, so a publisher cap or a
      // withheld field cannot be bypassed by naming the raw record.
      windows: rawWindows({
        summary: copy?.fields.summary ?? "",
        answer: copy?.fields.answer ?? "",
        content: copy?.fields.content ?? "",
      }, query),
      reserved: [],
      optional: [],
      entry: {
        citation: Number(source.citation),
        title: metadataText(source.title, 500),
        organization: metadataText(source.organization, 240),
        source_type: metadataText(source.type, 160) || null,
        published: metadataText(source.published, 120),
        updated: metadataText(source.updated, 120) || null,
        data_year: metadataText(source.dataYear, 80) || null,
        data_as_of: metadataText(source.dataAsOf, 120) || null,
        locator: metadataText(source.locator, 1_000) || null,
        route_classes: (Array.isArray(source.routeClasses) ? source.routeClasses : []).filter((value) => /^official_[a-z_]{3,60}$/u.test(String(value))).slice(0, 4),
        evidence_policy: eligibility.policy,
        freshness_class: metadataText(source.freshness?.class || source.sourceProfile?.freshnessClass, 120) || null,
        observed_at: metadataText(source._evidenceObservedAt, 120) || null,
        valid_from: metadataText(source._evidenceValidFrom, 120) || null,
        valid_until: metadataText(source._evidenceValidUntil, 120) || null,
        // Only a producer-validated semantic version reaches the model.
        // The private binding digest never grants versioned fact rights.
        version: typeof source._evidenceVersion === "string" && source._evidenceVersion.length <= 120
          ? metadataText(source._evidenceVersion, 120) || null : null,
        url: metadataText(source.url, 2_000),
        content: "",
      },
    };
  });
  const missing = new Set(plan?.missingEvidenceRequirements || []);
  const witnesses = {};
  for (const role of requiredRoles) {
    const witness = plan?.roleWitnesses?.[role];
    const record = records.find((candidate) => candidate.source.id === witness?.documentId);
    const passages = (witness?.passages || []).map(passageText);
    if (!record || !record.binding.witnessKey || !passages.length || passages.some((passage, index) => (
      !passage || passage !== String(witness.passages[index]).normalize("NFKC").replace(/\s+/gu, " ").trim().replace(/\bm\s*3\b/giu, "m³") || !record.windows.some((window) => window.text === passage)
    )) || (witness.witnessKey && witness.witnessKey !== record.binding.witnessKey)
      || (witness.version && witness.version !== record.binding.version)
      || (witness.snapshotHash && witness.snapshotHash !== record.binding.snapshotHash)) {
      missing.add(role);
      continue;
    }
    const reserved = [...new Set([...record.reserved, ...passages])];
    if (reserved.join("\n").length > MAX_CONTENT) {
      missing.add(role);
      continue;
    }
    record.reserved = reserved;
    witnesses[role] = { documentId: record.source.id, ...record.binding, passages };
  }
  const refresh = (record) => {
    record.entry.content = [...record.reserved, ...record.optional].join("\n");
  };
  records.forEach(refresh);
  let entries = records.map((record) => record.entry);
  if (JSON.stringify(entries).length > MAX_SERIALIZED) {
    requiredRoles.forEach((role) => missing.add(role));
    while (records.length && JSON.stringify(entries).length > MAX_SERIALIZED) {
      records.pop();
      entries = records.map((record) => record.entry);
    }
  } else if (plan?.requiredOnly !== true) {
    for (const record of records) {
      for (const window of [...record.windows].sort((left, right) => right.score - left.score || left.order - right.order)) {
        if (record.reserved.some((passage) => passage.includes(window.text))) continue;
        const candidate = [...record.reserved, ...record.optional, window.text].join("\n");
        if (candidate.length > MAX_CONTENT) continue;
        record.optional.push(window.text);
        refresh(record);
        if (JSON.stringify(entries).length > MAX_SERIALIZED) {
          record.optional.pop();
          refresh(record);
        }
      }
    }
  }
  quarantineJoinedDirectives(records);
  for (const role of requiredRoles) {
    const witness = witnesses[role];
    const record = records.find((candidate) => candidate.source.id === witness?.documentId);
    if (!witness || !record || witness.passages.some((passage) => !record.entry.content.includes(passage))) {
      missing.add(role);
      delete witnesses[role];
    }
  }
  const serialized = JSON.stringify(entries);
  const pack = freeze({
    entries,
    bindings: Object.fromEntries(records.map((record) => [record.entry.citation, record.binding])),
    roleWitnesses: witnesses,
    complete: missing.size === 0 && entries.some((entry) => entry.content),
    missingEvidenceRequirements: [...missing],
    packVersion: createHash("sha256").update(serialized).digest("hex"),
    serializedChars: serialized.length,
  });
  constructedPacks.add(pack);
  return pack;
}
