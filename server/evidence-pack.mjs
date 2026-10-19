import { createHash } from "node:crypto";
import { forestEvidenceIntent, normalize, queryTerms, sanitizeLlmEvidenceText, splitTextPassages, textHasQueryRoot } from "./search.mjs";
import { sourceCanSupportPublicCitation } from "./source-registry.mjs";
import { sourceEvidenceBinding, sourceWitnessKey } from "./source-identity.mjs";

const MAX_SOURCES = 10;
const MAX_CONTENT = 4_000;
const MAX_SERIALIZED = 36_000;
// Only this constructor can admit a pack. A copied object and recomputed
// digest are not proof that its windows crossed the source boundary.
const constructedPacks = new WeakSet();

export function isEvidencePack(pack) {
  return constructedPacks.has(pack) && pack.complete === true;
}


function passageText(value) {
  return sanitizeLlmEvidenceText(value).replace(/\s+/gu, " ").trim();
}

function metadataText(value, limit) {
  return sanitizeLlmEvidenceText(value).slice(0, limit);
}


export function evidencePackMatchesSources(pack, sources = []) {
  if (!isEvidencePack(pack)) return false;
  return pack.entries.every((entry) => {
    const matching = sources.filter((source) => source.citation === entry.citation);
    if (matching.length !== 1 || !sourceCanSupportPublicCitation(matching[0]).eligible) return false;
    const actual = sourceEvidenceBinding(matching[0]);
    const admitted = pack.bindings[entry.citation];
    return actual.witnessKey === admitted.witnessKey && actual.version === admitted.version
      && actual.snapshotHash === admitted.snapshotHash;
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
      if (!text || seen.has(text)) continue;
      seen.add(text);
      windows.push({ text, order: windows.length, score: windowScore(text, query, intent) + priority });
    }
  }
  return windows;
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function buildEvidencePack({ sources = [], query = "", plan = null } = {}) {
  const requiredRoles = [...new Set(plan?.requiredRoles || [])];
  const requiredIds = new Set(requiredRoles.map((role) => plan?.roleWitnesses?.[role]?.documentId).filter(Boolean));
  const citationCounts = new Map();
  sources.forEach((source) => citationCounts.set(source.citation, (citationCounts.get(source.citation) || 0) + 1));
  const eligible = sources.filter((source) => {
    if (!sourceCanSupportPublicCitation(source).eligible || !sourceWitnessKey(source)
      || !Number.isInteger(source.citation) || source.citation < 1
      || citationCounts.get(source.citation) !== 1) return false;
    return true;
  });
  const selectedSources = [...eligible.filter((source) => requiredIds.has(source.id)), ...eligible.filter((source) => !requiredIds.has(source.id))].slice(0, MAX_SOURCES);
  const records = selectedSources.map((source) => {
    const eligibility = sourceCanSupportPublicCitation(source);
    const binding = sourceEvidenceBinding(source);
    return {
      source,
      binding,
      windows: rawWindows(source, query),
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
