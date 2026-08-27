const RELATION_FAMILIES = Object.freeze([
  {
    family: "monitor",
    pattern: /(?<!\p{L})(?:monitor(?:s|ed|ing)?|track(?:s|ed|ing)?|seirab|seiravad|seiras|seiratakse|seireb|monitoorib|monitoorivad|j[äa]lgib|j[äa]lgivad)(?!\p{L})/giu,
  },
  {
    family: "publish",
    pattern: /(?<!\p{L})(?:publish(?:es|ed|ing)?|release(?:s|d|ing)?|avaldab|avaldavad|avaldas|publitseerib|publitseeris)(?!\p{L})/giu,
  },
  {
    family: "manage",
    pattern: /(?<!\p{L})(?:manage(?:s|d|ment|ing)?|administer(?:s|ed|ing)?|haldab|haldavad|haldas|hallatakse|hallatud|majandab|majandavad|majandas)(?!\p{L})/giu,
  },
  {
    family: "operate",
    pattern: /(?<!\p{L})(?:operate(?:s|d|ing)?|run(?:s|ning)?|k[äa]itab|k[äa]itavad|k[äa]itas|opereerib|opereerivad|opereeris)(?!\p{L})/giu,
  },
  {
    family: "maintain",
    pattern: /(?<!\p{L})(?:maintain(?:s|ed|ing)?|service(?:s|d|ing)?|hooldab|hooldavad|hooldas|hooldatakse)(?!\p{L})/giu,
  },
  {
    family: "protect",
    pattern: /(?<!\p{L})(?:protect(?:s|ed|ing|ion)?|conserve(?:s|d|ing)?|kaitseb|kaitsevad|kaitses|kaitstakse|s[äa]ilitab|s[äa]ilitavad)(?!\p{L})/giu,
  },
  {
    family: "coordinate",
    pattern: /(?<!\p{L})(?:coordinate(?:s|d|ing)?|organize(?:s|d|ing)?|organise(?:s|d|ing)?|koordineerib|koordineerivad|korraldab|korraldavad)(?!\p{L})/giu,
  },
  {
    family: "issue",
    pattern: /(?<!\p{L})(?:issue(?:s|d|ing)?|grant(?:s|ed|ing)?|approve(?:s|d|ing)?|v[äa]ljastab|v[äa]ljastavad|andis\s+v[äa]lja|kinnitab|kinnitavad)(?!\p{L})/giu,
  },
  {
    family: "own",
    pattern: /(?<!\p{L})(?:own(?:s|ed|ing)?|possess(?:es|ed|ing)?|belong(?:s|ed|ing)?|omab|omavad|omas|kuulub|kuuluvad|kuulus)(?!\p{L})/giu,
  },
]);

const ENTITY_STARTER_WORDS = new Set([
  "A", "Air-quality", "An", "And", "As", "According", "After", "All", "Although", "Authority", "Based", "Before", "But",
  "Current", "Data", "During", "Evidence", "Findings", "For", "From", "If", "In", "It", "Official", "On", "One", "Public",
  "Administering", "Control", "Duty", "Granting", "Maintaining", "Management", "Monitoring", "Oversight", "Ownership", "Possessing", "Protection", "Publishing", "Reported", "Research", "Responsibility", "Results", "See", "Source", "Summary", "The", "There", "These", "This", "Those", "Tracking", "Under", "Walking", "We", "When", "Where", "While", "With",
  "Air", "Biodiversity", "Climate", "Environmental", "Forest", "Nature", "Waste", "Water",
  "Ametlik", "Andmed", "Haldus", "Kaitse", "Kui", "Kõik", "Leitud", "Need", "Nende", "Omand", "Praegune", "See", "Seega", "Seire", "Selle", "Vastavalt", "Vastutus", "Õigus",
  "Kaitseala", "Keskkond", "Kliima", "Loodus", "Mets", "Vesi", "Õhk", "Õhukvaliteet", "Õhukvaliteeti",
].map((word) => word.toLocaleLowerCase("et")));

const ENTITY_LEADING_PREFIX_WORDS = new Set([
  "a", "an", "the", "after", "as", "before", "between", "by", "during", "for",
  "from", "in", "on", "to", "under", "with",
]);

const ESTONIAN_OBJECT_FIRST_RELATION_PATTERN = /^(?:haldab|haldavad|haldas|majandab|majandavad|majandas|seirab|seiravad|seiras|monitoorib|monitoorivad|jälgib|jälgivad|kaitseb|kaitsevad|kaitses|koordineerib|koordineerivad|korraldab|korraldavad|väljastab|väljastavad|kinnitab|kinnitavad|hooldab|hooldavad|hooldas|opereerib|opereerivad|opereeris)$/iu;

const RELATION_STOPWORDS = new Set([
  "a", "about", "against", "along", "an", "and", "annual", "are", "as", "at", "behalf", "by", "for", "from", "in", "into", "is", "of", "on", "onto",
  "or", "over", "the", "to", "under", "via", "was", "were", "with", "according", "it", "that", "has", "have", "had",
  "ja", "ning", "on", "oli", "oma", "selle", "see", "seda", "vastavalt",
  "abil", "jaoks", "järgi", "kaudu", "nimel", "põhjal", "poolt", "kohta", "aasta", "aastal", "andmed", "andmete", "ametlik", "avalik",
]);

function normalizedWord(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("et")
    .replace(/[^a-zõäöüšž-]/giu, "");
}

function wordRoot(value) {
  const token = normalizedWord(value);
  for (const suffix of ["takse", "dakse", "atakse", "mine", "mise", "mist", "tele", "dele", "test", "dest", "tega", "dega", "ing", "nud", "tud", "sid", "vad", "ed", "es", "st", "lt", "le", "ga", "ks", "da", "ma", "ta", "b", "d", "t", "s"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) return token.slice(0, -suffix.length);
  }
  return token;
}

function rootsShareStem(left, right) {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5) return false;
  const length = Math.min(8, left.length - 1, right.length - 1);
  return length >= 5 && left.slice(0, length) === right.slice(0, length);
}

function contentRoots(value) {
  return [...new Set((String(value || "").normalize("NFKC").match(/[a-zõäöüšž]+/giu) || [])
    .map(normalizedWord)
    .filter((token) => token.length >= 3 && !RELATION_STOPWORDS.has(token))
    .map(wordRoot)
    .filter((token) => token.length >= 3 && !RELATION_STOPWORDS.has(token)))];
}

function canonicalEntity(value) {
  const tokens = String(value || "")
    .normalize("NFKC")
    .split(/\s+/u)
    .map(normalizedWord)
    .filter(Boolean);
  if (!tokens.length) return "";
  if (tokens.length > 1 && ["a", "an", "the"].includes(tokens[0])) tokens.shift();
  const last = tokens.at(-1);
  if (/nna$/u.test(last) && last.length >= 6) {
    tokens[tokens.length - 1] = last.slice(0, -1);
    return tokens.join(" ");
  }
  for (const suffix of ["sse", "st", "lt", "le", "ga", "ks", "ni", "na", "ta", "s", "l", "t", "d"]) {
    if (last.endsWith(suffix) && last.length - suffix.length >= 5) {
      tokens[tokens.length - 1] = last.slice(0, -suffix.length);
      break;
    }
  }
  return tokens.join(" ");
}

function namedEntities(value, knownEntities = []) {
  const result = [];
  const raw = String(value || "").normalize("NFKC");
  const pattern = /(?<![\p{L}\p{N}])(?:\p{Lu}[\p{L}\p{M}'’.-]{1,39}|\p{Lu}{2,}[\p{Lu}\p{N}.-]*)(?:\s+(?:\p{Lu}[\p{L}\p{M}'’.-]{1,39}|\p{Lu}{2,}[\p{Lu}\p{N}.-]*)){0,4}/gu;
  for (const match of raw.matchAll(pattern)) {
    let text = match[0].trim();
    let start = match.index || 0;
    const leading = text.match(/^([\p{L}\p{M}'’.-]+)\s+/u);
    if (leading && ENTITY_LEADING_PREFIX_WORDS.has(normalizedWord(leading[1]))) {
      const remainderOffset = match[0].indexOf(text) + leading[0].length;
      text = text.slice(leading[0].length).trimStart();
      start = (match.index || 0) + remainderOffset;
    }
    const titleWords = [...text.matchAll(/[\p{L}\p{M}'’-]+/gu)];
    const trailing = raw.slice(start + text.length);
    if (titleWords.length >= 2
      && /^\s+(?:abil|jaoks|kaudu|nimel|vastu)(?:\s|[.,;:]|$)/iu.test(trailing)) {
      // Estonian can place two separately inflected named arguments next to
      // each other before a postfix role marker ("Tartut Pärnu jaoks"). The
      // capitalization matcher would otherwise fuse them into one entity and
      // make active/passive argument binding asymmetric.
      for (const word of titleWords) {
        const wordText = word[0];
        const wordCanonical = canonicalEntity(wordText);
        if (!wordCanonical || ENTITY_STARTER_WORDS.has(wordCanonical)) continue;
        const wordStart = start + (word.index || 0);
        result.push({
          text: wordText,
          canonical: wordCanonical,
          index: wordStart,
          end: wordStart + wordText.length,
        });
      }
      continue;
    }
    const canonical = canonicalEntity(text);
    if (!canonical || ENTITY_STARTER_WORDS.has(canonical)
      || ENTITY_STARTER_WORDS.has(normalizedWord(text))) continue;
    result.push({ text, canonical, index: start, end: start + text.length });
  }
  if (knownEntities.length) {
    const words = [...raw.matchAll(/[\p{L}\p{M}'’.-]+/gu)].map((match) => ({
      text: match[0],
      index: match.index || 0,
      end: (match.index || 0) + match[0].length,
    }));
    const known = [...new Map(knownEntities.map((entity) => [entity.canonical, entity])).values()]
      .sort((left, right) => right.canonical.split(" ").length - left.canonical.split(" ").length);
    for (const entity of known) {
      const width = entity.canonical.split(" ").length;
      for (let index = 0; index + width <= words.length; index += 1) {
        const selected = words.slice(index, index + width);
        const text = raw.slice(selected[0].index, selected.at(-1).end);
        const canonical = canonicalEntity(text);
        if (!entityMatches(canonical, entity.canonical)) continue;
        const candidate = { text, canonical: entity.canonical, index: selected[0].index, end: selected.at(-1).end };
        if (!result.some((current) => current.index === candidate.index && current.end === candidate.end)) {
          result.push(candidate);
        }
      }
    }
  }
  const resolved = knownEntities.length ? result.filter((current) => {
    if (knownEntities.some((known) => entityMatches(current.canonical, known.canonical))) return true;
    const narrowerKnown = result.filter((candidate) => (
      candidate !== current
      && candidate.index >= current.index
      && candidate.end <= current.end
      && (candidate.index > current.index || candidate.end < current.end)
      && knownEntities.some((known) => entityMatches(candidate.canonical, known.canonical))
    ));
    // A capitalization-only span can accidentally fuse adjacent inflected
    // arguments ("Tartut Pärnu"). Prefer two independently known evidence
    // entities over a compound that the visible evidence never names.
    return narrowerKnown.length < 2;
  }) : result;
  return resolved.sort((left, right) => left.index - right.index || right.end - left.end);
}

function entityMatches(left, right) {
  if (left === right) return true;
  const leftTokens = left.split(" ");
  const rightTokens = right.split(" ");
  return leftTokens.length === rightTokens.length
    && leftTokens.every((token, index) => rootsShareStem(token, rightTokens[index]));
}

function reliableEvidenceEntityLexicon(clauses) {
  const records = clauses.flatMap((clause) => namedEntities(clause).map((entity) => ({ clause, entity })));
  return records.flatMap(({ clause, entity }) => {
    const repeated = records.some((candidate) => candidate.entity !== entity
      && entityMatches(candidate.entity.canonical, entity.canonical));
    const repeatedAwayFromSentenceStart = repeated && records.some((candidate) => (
      candidate.entity.index > 0
      && entityMatches(candidate.entity.canonical, entity.canonical)
    ));
    const uppercaseOrMultiword = /\s/u.test(entity.text)
      || (/\p{Lu}/u.test(entity.text) && !/\p{Ll}/u.test(entity.text));
    const participatesInKnownRelation = relationMatches(clause).some((relation) => (
      entity.end <= relation.index || entity.index >= relation.end
    ));
    return repeatedAwayFromSentenceStart || uppercaseOrMultiword || participatesInKnownRelation
      ? [entity]
      : [];
  });
}

function stripReportingPreamble(value) {
  return String(value || "").replace(
    /^\s*(?:(?:(?:it|the\s+report|this\s+report|the\s+source|this\s+source)\s+(?:says|states|reports|notes|indicates)(?:\s+that)?|according\s+to\s+(?:the\s+)?(?:data|report|source|evidence)|reported|stated|noted)\s*[:,;—-]?\s*|[\p{L}\p{M}-]{2,30}:\s*(?=\p{L}))/iu,
    "",
  );
}

function hasStructuralNamedPropositionShape(clause, knownEntities = []) {
  const entities = namedEntities(clause, knownEntities);
  if (!entities.length) return false;
  const passiveSubject = passiveNamedSubject(clause, entities);
  const subject = passiveSubject || leadingNamedSubject(clause, entities);
  if (!subject) return false;
  const propositionText = passiveSubject
    ? clause.slice(0, passiveSubject.index)
    : clause.slice(subject.end);
  return rootsWithoutEntities(propositionText, entities).length >= 2;
}

function splitIndependentPunctuationClauses(passage, knownEntities = []) {
  const value = String(passage || "").trim();
  for (const separator of value.matchAll(/,\s*|:\s*|\s*[—–]\s*|\s+-\s+|\s*\/\s*|\s*\(\s*/gu)) {
    const index = separator.index || 0;
    const left = value.slice(0, index).trim();
    const right = value.slice(index + separator[0].length).trim();
    // Keep relative clauses attached to their antecedent. Splitting before the
    // later named geography would otherwise turn one directly witnessed
    // proposition into two unrelated fragments.
    if (/^(?:which|who|whom|whose|mille|mis|mida|kelle|keda)\b/iu.test(right)) continue;
    if (!left || !right
      || !(hasNamedPropositionShape(left, knownEntities)
        || hasStructuralNamedPropositionShape(left, knownEntities))
      || !(hasNamedPropositionShape(right, knownEntities)
        || hasStructuralNamedPropositionShape(right, knownEntities))) continue;
    return [
      ...splitIndependentPunctuationClauses(left, knownEntities),
      ...splitIndependentPunctuationClauses(right, knownEntities),
    ];
  }
  // Treat any other visible punctuation immediately before a later named
  // subject as a candidate boundary. This covers typographic/full-width
  // separators without letting plain whitespace turn direct objects into new
  // clauses. Both sides must still independently satisfy proposition shape.
  const entities = namedEntities(value, knownEntities);
  for (const entity of entities.slice(1)) {
    const prefix = value.slice(0, entity.index);
    const boundary = prefix.match(/[^\p{L}\p{N}]+$/u)?.[0] || "";
    if (!boundary || !boundary.replace(/\s/gu, "")) continue;
    const left = prefix.slice(0, -boundary.length).trim();
    const right = value.slice(entity.index).trim();
    if (!left || !right
      || !(hasNamedPropositionShape(left, knownEntities)
        || hasStructuralNamedPropositionShape(left, knownEntities))
      || !(hasNamedPropositionShape(right, knownEntities)
        || hasStructuralNamedPropositionShape(right, knownEntities))) continue;
    return [
      ...splitIndependentPunctuationClauses(left, knownEntities),
      ...splitIndependentPunctuationClauses(right, knownEntities),
    ];
  }
  return value ? [value] : [];
}

function embeddedRelativeNamedClauses(passage, knownEntities = []) {
  const value = String(passage || "").trim();
  const clauses = [];
  const pattern = /\b(?:which|who|whom|whose|that|mida|mille|mis|keda)\s+(?:the\s+)?(?=\p{Lu})/giu;
  for (const marker of value.matchAll(pattern)) {
    const tail = value.slice((marker.index || 0) + marker[0].length).trim();
    if (!tail || !hasStructuralNamedPropositionShape(tail, knownEntities)) continue;
    clauses.push(tail);
  }
  return clauses.filter((clause, index, all) => all.indexOf(clause) === index);
}

function atomicRelationshipClauses(value, knownEntities = []) {
  const passages = String(value || "")
    .split(/(?:\n+|(?<=[.!?;])\s+)/u)
    .map((part) => stripReportingPreamble(part).trim())
    .filter(Boolean)
    .flatMap((passage) => splitIndependentPunctuationClauses(passage, knownEntities))
    .flatMap((passage) => [passage, ...embeddedRelativeNamedClauses(passage, knownEntities)]);
  return passages.flatMap((passage) => {
    const pieces = passage.split(/\s+(?:and|but|while|whereas|ja|ning|aga|kuid|samas)\s+/giu)
      .map((part) => part.trim())
      .filter(Boolean);
    // Coordinated factual clauses must retain their own passage boundary even
    // when the predicate is outside the finite synonym families below. Do not
    // split a coordinated subject ("Tallinn and Tartu monitor ..."): every
    // emitted side must independently contain a named proposition shape.
    return pieces.length > 1
      && pieces.filter((piece) => {
        if (hasNamedPropositionShape(piece, knownEntities)) return true;
        const entities = namedEntities(piece, knownEntities);
        // Gerund/location forms such as “walking on North Trail is allowed”
        // have a named participant but no named grammatical subject. Two
        // independent content roots are enough to recognize the coordinated
        // clause boundary; a coordinated subject (“Tallinn and Tartu ...”)
        // still has no proposition on its first side and remains intact.
        return entities.length > 0 && rootsWithoutEntities(piece, entities).length >= 2;
      }).length > 1
      ? pieces
      : [passage];
  });
}

const NOMINAL_RELATION_WORDS = new Set(["management", "protection"]);

function relationMatchIsNominal(value, match) {
  const token = normalizedWord(match[0]);
  if (NOMINAL_RELATION_WORDS.has(token)) return true;
  if (!token.endsWith("ing")) return false;
  const prefix = String(value || "").slice(Math.max(0, (match.index || 0) - 64), match.index || 0);
  return !/(?:^|\s)(?:am|are|be|been|being|is|was|were)(?:\s+[a-z-]+){0,2}\s+$/iu.test(prefix);
}

function relationMatches(value) {
  const matches = [];
  for (const relation of RELATION_FAMILIES) {
    relation.pattern.lastIndex = 0;
    for (const match of String(value || "").matchAll(relation.pattern)) {
      if (relationMatchIsNominal(value, match)) continue;
      matches.push({
        family: relation.family,
        text: match[0],
        index: match.index || 0,
        end: (match.index || 0) + match[0].length,
      });
    }
  }
  return matches.sort((left, right) => left.index - right.index);
}

function relationPassiveSubject(clause, relation, entities) {
  return entities.find((entity) => {
    if (entity.index >= relation.end
      && /(?:^|\s)(?:by|poolt)[\s,;:()—–-]{0,12}$/iu.test(clause.slice(relation.end, entity.index))) return true;
    return /^[\s,;:()—–-]{0,12}poolt(?:\s|[.,;:()—–-]|$)/iu.test(clause.slice(entity.end));
  }) || null;
}

function relationshipSignatures(value, knownEntities = []) {
  return atomicRelationshipClauses(value, knownEntities).flatMap((clause) => {
    const entities = namedEntities(clause, knownEntities);
    return relationMatches(clause).map((relation) => {
      const beforeEntities = entities.filter((entity) => entity.end <= relation.index);
      const afterEntities = entities.filter((entity) => entity.index >= relation.end);
      const passiveSubject = relationPassiveSubject(clause, relation, entities);
      const objectFirstSubject = !passiveSubject && beforeEntities.length === 0
        && afterEntities.length === 1
        && ESTONIAN_OBJECT_FIRST_RELATION_PATTERN.test(relation.text)
        ? afterEntities[0]
        : null;
      const subjectEntities = passiveSubject
        ? [passiveSubject]
        : (objectFirstSubject ? [objectFirstSubject] : beforeEntities);
      const argumentSlots = relationArgumentSlots({
        clause,
        relation,
        beforeEntities,
        afterEntities,
        passiveSubject,
        objectFirstSubject,
      });
      const objectEntities = argumentSlots.map((slot) => slot.entity);
      const objectText = passiveSubject || objectFirstSubject
        ? clause.slice(0, relation.index)
        : clause.slice(relation.end);
      const objectRoots = contentRoots(objectText).filter((root) => (
        !afterEntities.some((entity) => contentRoots(entity.text).some((token) => rootsShareStem(root, token)))
        && !beforeEntities.some((entity) => contentRoots(entity.text).some((token) => rootsShareStem(root, token)))
      ));
      return {
        family: relation.family,
        entities,
        beforeEntities,
        afterEntities,
        subjectEntities,
        objectEntities,
        argumentSlots,
        objectRoots,
      };
    });
  }).filter((signature) => signature.subjectEntities.length > 0);
}

function entityRoots(entities) {
  return entities.flatMap((entity) => contentRoots(entity.text));
}

function rootsWithoutEntities(value, entities) {
  const excluded = entityRoots(entities);
  return contentRoots(value).filter((root) => (
    !excluded.some((candidate) => rootsShareStem(root, candidate))
  ));
}

function leadingNamedSubject(clause, entities = namedEntities(clause)) {
  let embedded = null;
  for (const entity of entities) {
    const earlier = entities.filter((candidate) => candidate.end <= entity.index);
    const prefixRoots = rootsWithoutEntities(clause.slice(0, entity.index), earlier);
    if (prefixRoots.length) {
      if (rootsWithoutEntities(clause.slice(entity.end), entities).length >= 2) embedded = entity;
      continue;
    }
    const laterEntityExists = entities.some((candidate) => candidate.index > entity.end);
    if (laterEntityExists && /^\s*,/u.test(clause.slice(entity.end))) continue;
    return entity;
  }
  // A reporting/attribution preamble must not make the embedded named
  // proposition disappear into the legacy aggregate bag-of-words fallback.
  return embedded;
}

function passiveNamedSubject(clause, entities = namedEntities(clause)) {
  return entities.find((entity) => (
    /(?:^|\s)(?:by|poolt)[\s,;:()—–-]{0,12}$/iu.test(clause.slice(0, entity.index))
    || /^[\s,;:()—–-]{0,12}poolt(?:\s|[.,;:()—–-]|$)/iu.test(clause.slice(entity.end))
  )) || null;
}

function directionalEntityRoles(clause, entities = namedEntities(clause)) {
  return entities.flatMap((entity) => {
    const before = clause.slice(0, entity.index);
    const after = clause.slice(entity.end);
    let role = null;
    if (/(?:^|[\s,;:(])from[\s,;:()—–-]{0,12}$/iu.test(before)) role = "from";
    else if (/(?:^|[\s,;:(])to[\s,;:()—–-]{0,12}$/iu.test(before)) role = "to";
    else if (/(?:^|[\s,;:(])by[\s,;:()—–-]{0,12}$/iu.test(before)
      || /^[\s,;:()—–-]{0,12}poolt(?:\s|[.,;:()—–-]|$)/iu.test(after)) role = "by";
    if (!role) {
      const raw = normalizedWord(entity.text);
      const canonical = canonicalEntity(entity.text);
      if (raw !== canonical && raw.endsWith("lt")) role = "from";
      else if (raw !== canonical && raw.endsWith("le")) role = "to";
    }
    return role ? [{ role, entity }] : [];
  });
}

const RELATION_ARGUMENT_ROLE_PATTERN = /(?:^|[\s,;:()\[\]{}\u2014\u2013-])(?<role>on\s+behalf\s+of|along\s+with|against|about|under|over|using|from|with|for|into|onto|in|on|at|to|via|of)(?:\s+(?:a|an|the))?[\s,;:()\[\]{}\u2014\u2013-]*$/iu;

function relationArgumentRole(clause, start, entity) {
  const connector = String(clause || "").slice(Math.max(0, start), entity.index);
  const explicit = connector.match(RELATION_ARGUMENT_ROLE_PATTERN)?.groups?.role
    ?.toLocaleLowerCase("en").replace(/\s+/gu, "-");
  if (explicit === "along-with") return "with";
  if (explicit === "using" || explicit === "via") return "instrument";
  if (explicit) return explicit;

  const postfix = String(clause || "").slice(entity.end);
  if (/^\s+jaoks(?:\s|[.,;:]|$)/iu.test(postfix)) return "for";
  if (/^\s+vastu(?:\s|[.,;:]|$)/iu.test(postfix)) return "against";
  if (/^\s+(?:abil|kaudu)(?:\s|[.,;:]|$)/iu.test(postfix)) return "instrument";
  if (/^\s+nimel(?:\s|[.,;:]|$)/iu.test(postfix)) return "on-behalf-of";

  // Preserve the most common Estonian case-bound direction markers when the
  // role is encoded in the entity token rather than a separate preposition.
  const raw = normalizedWord(entity.text);
  const canonical = canonicalEntity(entity.text);
  if (raw !== canonical) {
    if (raw.endsWith("lt") || raw.endsWith("st")) return "from";
    if (raw.endsWith("le")) return "to";
    if (raw.endsWith("ga")) return "with";
    if (raw.endsWith("s")) return "in";
  }
  return "direct";
}

function relationArgumentSlots({
  clause,
  relation,
  beforeEntities,
  afterEntities,
  passiveSubject,
  objectFirstSubject,
}) {
  const slots = [];
  if (passiveSubject) {
    let cursor = 0;
    for (const entity of beforeEntities) {
      const role = relationArgumentRole(clause, cursor, entity);
      if (entity !== passiveSubject) slots.push({ role, entity });
      cursor = entity.end;
    }
    cursor = relation.end;
    for (const entity of afterEntities) {
      const role = relationArgumentRole(clause, cursor, entity);
      if (entity !== passiveSubject) slots.push({ role, entity });
      cursor = entity.end;
    }
    return slots;
  }
  if (objectFirstSubject) return beforeEntities.map((entity, index) => ({
    role: relationArgumentRole(clause, index ? beforeEntities[index - 1].end : 0, entity),
    entity,
  }));
  let cursor = relation.end;
  for (const entity of afterEntities) {
    slots.push({ role: relationArgumentRole(clause, cursor, entity), entity });
    cursor = entity.end;
  }
  return slots;
}

function orderedArgumentSlotsCovered(required, candidates) {
  let cursor = -1;
  return required.every((slot) => {
    const next = candidates.findIndex((candidate, index) => (
      index > cursor
      && candidate.role === slot.role
      && entityMatches(slot.entity.canonical, candidate.entity.canonical)
    ));
    if (next < 0) return false;
    cursor = next;
    return true;
  });
}

function genericArgumentSlots(clause, entities, subject, passiveSubject = null) {
  const argumentsInOrder = passiveSubject
    ? entities.filter((entity) => entity !== passiveSubject)
    : entities.filter((entity) => entity.index >= subject.end);
  let cursor = passiveSubject ? 0 : subject.end;
  return argumentsInOrder.map((entity) => {
    const slot = { role: relationArgumentRole(clause, cursor, entity), entity };
    cursor = entity.end;
    return slot;
  });
}

const GENERIC_PREDICATE_STARTERS = new Set([
  "am", "are", "can", "could", "did", "does", "has", "have", "is", "may", "might",
  "must", "shall", "should", "was", "were", "will", "would",
  "on", "oli", "peab", "saab", "tohib", "võib",
]);

const GENERIC_COPULAR_PREDICATES = new Set(["am", "are", "be", "been", "being", "is", "oli", "on", "was", "were"]);
const GENERIC_HAVE_PREDICATES = new Set(["had", "has", "have"]);
const GENERIC_AUXILIARY_PREDICATES = new Set([
  "can", "could", "did", "do", "does", "may", "might", "must", "peab", "saab",
  "shall", "should", "tohib", "võib", "will", "would",
]);
const GENERIC_PREDICATE_SKIP_WORDS = new Set([
  "abil", "jaoks", "järgi", "kaudu", "kohta", "põhjal", "poolt", "vastavalt",
]);

function predicateShapedWord(token, previous = "") {
  if (!token) return false;
  if (GENERIC_COPULAR_PREDICATES.has(token)
    || GENERIC_HAVE_PREDICATES.has(token)
    || GENERIC_AUXILIARY_PREDICATES.has(token)) return true;
  if (["to", "et"].includes(previous)) return true;
  return token.length >= 4 && (
    /(?:s|ed|ing)$/u.test(token)
    || /(?:b|vad|takse|dakse|ti|sid|nud|tud|da|ma|ta|ks)$/u.test(token)
  );
}

function genericPredicateRoots(value) {
  const tokens = (String(value || "").normalize("NFKC").match(/[\p{L}\p{M}'’.-]+/gu) || [])
    .map(normalizedWord)
    .filter(Boolean);
  while (["et", "that"].includes(tokens[0])) tokens.shift();
  const substantive = [];
  const helpers = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (GENERIC_COPULAR_PREDICATES.has(token)) {
      helpers.push("copula");
      continue;
    }
    if (GENERIC_HAVE_PREDICATES.has(token)) {
      helpers.push("have");
      continue;
    }
    if (GENERIC_AUXILIARY_PREDICATES.has(token)) {
      helpers.push(token);
      continue;
    }
    if (predicateShapedWord(token, tokens[index - 1])) substantive.push(wordRoot(token));
  }
  if (!substantive.length && !helpers.length) {
    const fallback = tokens.find((token) => !GENERIC_PREDICATE_SKIP_WORDS.has(token));
    if (fallback) substantive.push(wordRoot(fallback));
  }
  return [...new Set([...substantive, ...helpers].filter(Boolean))];
}

function genericPredicateRoot(value) {
  return genericPredicateRoots(value)[0] || "";
}

function genericPredicateCovered(required, value) {
  if (!required) return true;
  return genericPredicateRoots(value).some((candidate) => rootsShareStem(required, candidate));
}

function hasLeadingPredicateShape(value) {
  const match = String(value || "")
    .normalize("NFKC")
    .match(/^\s*[,:;—–-]?\s*(?:et|that)?\s*["“”'‘’(]*([\p{L}\p{M}'’.-]+)/iu);
  if (!match) return false;
  const token = normalizedWord(match[1]);
  if (!token) return false;
  if (GENERIC_PREDICATE_STARTERS.has(token)) return true;
  // English finite verbs and common Estonian finite/participle endings give a
  // language-independent-enough proposition boundary without enumerating the
  // reporting predicate that introduced it.
  return token.length >= 4 && (
    /(?:s|ed|ing)$/u.test(token)
    || /(?:b|vad|takse|dakse|ti|sid|nud|tud|ks)$/u.test(token)
  );
}

function genericNamedSignatures(clause, knownEntities = []) {
  // Numeric/entity binding is already handled by the stricter tuple validator
  // (year, unit, geography and comparator). This guard targets ordinary prose
  // where the former bag-of-passages fallback permitted relationship swaps.
  if (/\d/u.test(clause)) return [];
  if (relationshipSignaturesWithoutSplitting(clause, knownEntities).length) return [];
  const entities = namedEntities(clause, knownEntities);
  if (!entities.length) return [];
  const claimRoots = rootsWithoutEntities(clause, entities);
  const directionalRoles = directionalEntityRoles(clause, entities);
  const passiveSubject = passiveNamedSubject(clause, entities);
  const primarySubject = passiveSubject || leadingNamedSubject(clause, entities);
  if (!primarySubject) {
    // Some relationships put every named participant after the predicate
    // (“responsibility passes from Tallinn to Tartu”). They still require one
    // intact passage that contains the association, not separate entity hits.
    return entities.length >= 2 && claimRoots.length >= 2 ? [{
      clauseText: clause,
      entities,
      subjectEntities: [],
      substantiveRoots: claimRoots,
      claimRoots,
      directionalRoles,
      associationOnly: true,
      embedded: true,
      objectRoots: claimRoots,
      copular: false,
      predicateRoot: "",
      argumentSlots: [],
    }] : [];
  }
  const primaryEarlierEntities = entities.filter((entity) => entity.end <= primarySubject.index);
  const primaryPrefixRoots = rootsWithoutEntities(
    clause.slice(0, primarySubject.index),
    primaryEarlierEntities,
  );
  if (!passiveSubject && primaryPrefixRoots.length
    && !hasLeadingPredicateShape(clause.slice(primarySubject.end))) {
    return entities.length >= 2 && claimRoots.length >= 2 ? [{
      clauseText: clause,
      entities,
      subjectEntities: [],
      substantiveRoots: claimRoots,
      claimRoots,
      directionalRoles,
      associationOnly: true,
      embedded: true,
      objectRoots: claimRoots,
      copular: false,
      predicateRoot: "",
      argumentSlots: [],
    }] : [];
  }

  // A title-cased speaker or prose preface can precede another complete named
  // proposition without using one of our finite relation verbs (for example,
  // “Tallinn says Tartu handles ...”). Audit every substantive later tail as
  // well as the primary subject. This structural rule prevents an unfamiliar
  // reporting verb from hiding the embedded proposition. Exact same-passage
  // evidence is checked below so ordinary multi-entity sentences remain valid.
  const subjects = [primarySubject];
  if (!passiveSubject) {
    for (const entity of entities) {
      if (entity.index <= primarySubject.index
        || entityMatches(entity.canonical, primarySubject.canonical)) continue;
      const tail = clause.slice(entity.end)
        .split(/\s+(?:and|but|while|whereas|ja|ning|aga|kuid|samas)\s+/iu)[0];
      if (!rootsWithoutEntities(tail, entities).length
        || !hasLeadingPredicateShape(tail)) continue;
      subjects.push(entity);
    }
  }

  return subjects.flatMap((subject) => {
    const subjectIsPassive = Boolean(passiveSubject)
      && entityMatches(subject.canonical, passiveSubject.canonical);
    const propositionText = (subjectIsPassive
      ? clause.slice(0, subject.index)
      : clause.slice(subject.end))
      .split(/\s+(?:and|but|while|whereas|ja|ning|aga|kuid|samas)\s+/iu)[0];
    const substantiveRoots = rootsWithoutEntities(propositionText, entities);
    if (!substantiveRoots.length) return [];
    const earlierEntities = entities.filter((entity) => entity.end <= subject.index);
    const prefixRoots = rootsWithoutEntities(clause.slice(0, subject.index), earlierEntities);
    return [{
      clauseText: clause,
      entities,
      subjectEntities: [subject],
      substantiveRoots,
      claimRoots,
      directionalRoles,
      associationOnly: false,
      embedded: subject !== primarySubject || prefixRoots.length > 0,
      objectRoots: substantiveRoots.length >= 2
        ? (subjectIsPassive ? substantiveRoots.slice(0, -1) : substantiveRoots.slice(1))
        : substantiveRoots,
      copular: /^\s*(?:is|are|was|were|on|oli)\b/iu.test(propositionText),
      predicateRoot: genericPredicateRoot(propositionText),
      argumentSlots: genericArgumentSlots(clause, entities, subject, subjectIsPassive ? passiveSubject : null),
    }];
  });
}

function hasNamedPropositionShape(clause, knownEntities = []) {
  return relationshipSignaturesWithoutSplitting(clause, knownEntities).length > 0
    || genericNamedSignatures(clause, knownEntities).length > 0;
}

// Internal single-clause form used while deciding whether a coordination may
// be split. Calling relationshipSignatures() there would recurse through the
// clause splitter itself.
function relationshipSignaturesWithoutSplitting(clause, knownEntities = []) {
  const entities = namedEntities(clause, knownEntities);
  return relationMatches(clause).flatMap((relation) => {
    const beforeEntities = entities.filter((entity) => entity.end <= relation.index);
    const afterEntities = entities.filter((entity) => entity.index >= relation.end);
    const passiveSubject = relationPassiveSubject(clause, relation, entities);
    const objectFirstSubject = !passiveSubject && beforeEntities.length === 0
      && afterEntities.length === 1
      && ESTONIAN_OBJECT_FIRST_RELATION_PATTERN.test(relation.text);
    return (passiveSubject || objectFirstSubject || beforeEntities.length) ? [relation] : [];
  });
}

function entitiesCovered(required, candidates) {
  return required.every((entity) => candidates.some((candidate) => (
    entityMatches(entity.canonical, candidate.canonical)
  )));
}

function objectRootsCovered(required, candidateClause) {
  if (!required.length) return true;
  const candidates = contentRoots(candidateClause);
  const covered = required.filter((root) => candidates.some((candidate) => rootsShareStem(root, candidate))).length;
  return required.length <= 5
    ? covered === required.length
    : required.length - covered <= 1 && covered / required.length >= 0.85;
}

function signatureHasWitness(signature, evidenceClause) {
  const evidenceRelations = relationMatches(evidenceClause)
    .filter((relation) => relation.family === signature.family);
  return evidenceRelations.some((relation) => {
    const entities = namedEntities(evidenceClause);
    const beforeEntities = entities.filter((entity) => entity.end <= relation.index);
    const afterEntities = entities.filter((entity) => entity.index >= relation.end);
    const passiveSubject = relationPassiveSubject(evidenceClause, relation, entities);
    const objectFirstSubject = !passiveSubject && beforeEntities.length === 0
      && afterEntities.length === 1
      && ESTONIAN_OBJECT_FIRST_RELATION_PATTERN.test(relation.text)
      ? afterEntities[0]
      : null;
    const subjectEntities = passiveSubject
      ? [passiveSubject]
      : (objectFirstSubject ? [objectFirstSubject] : beforeEntities);
    const argumentSlots = relationArgumentSlots({
      clause: evidenceClause,
      relation,
      beforeEntities,
      afterEntities,
      passiveSubject,
      objectFirstSubject,
    });
    const objectEntities = argumentSlots.map((slot) => slot.entity);
    const objectText = passiveSubject || objectFirstSubject
      ? evidenceClause.slice(0, relation.index)
      : evidenceClause.slice(relation.end);
    return entitiesCovered(signature.entities, entities)
      && entitiesCovered(signature.subjectEntities, subjectEntities)
      && entitiesCovered(signature.objectEntities, objectEntities)
      && orderedArgumentSlotsCovered(signature.argumentSlots, argumentSlots)
      && objectRootsCovered(signature.objectRoots, objectText);
  });
}

function genericEvidenceBinding(signature, evidenceClause, evidenceEntityLexicon) {
  const entities = namedEntities(evidenceClause, evidenceEntityLexicon).filter((entity) => (
    evidenceEntityLexicon.some((known) => entityMatches(entity.canonical, known.canonical))
  ));
  const passiveSubject = passiveNamedSubject(evidenceClause, entities);
  const subject = passiveSubject || leadingNamedSubject(evidenceClause, entities);
  const subjectCovered = Boolean(subject)
    && entitiesCovered(signature.subjectEntities, [subject]);
  const argumentSlots = subject
    ? genericArgumentSlots(evidenceClause, entities, subject, passiveSubject)
    : [];
  const argumentsCovered = orderedArgumentSlotsCovered(signature.argumentSlots || [], argumentSlots);
  const propositionText = passiveSubject
    ? evidenceClause.slice(0, passiveSubject.index)
    : evidenceClause.slice(subject?.end || 0);
  const candidates = rootsWithoutEntities(propositionText, entities);
  const predicateCovered = genericPredicateCovered(signature.predicateRoot, propositionText);
  const requiredRoots = signature.copular
    ? signature.substantiveRoots
    : signature.objectRoots;
  const matched = requiredRoots.filter((root) => (
    candidates.some((candidate) => rootsShareStem(root, candidate))
  )).length;
  const strictCoverage = requiredRoots.length <= 3
    ? matched === requiredRoots.length
    : requiredRoots.length - matched <= 1 && matched / requiredRoots.length >= 0.8;
  const distributedCoverage = matched >= Math.min(2, requiredRoots.length)
    && matched / requiredRoots.length >= 0.6;
  return { subjectCovered, argumentsCovered, strictCoverage, distributedCoverage, predicateCovered, entities };
}

function genericSignatureStatus(signature, evidenceClauses, evidenceEntityLexicon) {
  if (signature.entities.length >= 2) {
    const exactClause = String(signature.clauseText || "")
      .normalize("NFKC")
      .toLocaleLowerCase("et")
      .replace(/\s+/gu, " ")
      .trim();
    if (exactClause && evidenceClauses.some((clause) => (
      String(clause || "").normalize("NFKC").toLocaleLowerCase("et")
        .replace(/\s+/gu, " ").trim() === exactClause
    ))) return true;
    const intactAssociation = evidenceClauses.some((clause) => {
      const entities = namedEntities(clause, evidenceEntityLexicon);
      if (!entitiesCovered(signature.entities, entities)) return false;
      const evidenceRoles = directionalEntityRoles(clause, entities);
      if (!(signature.directionalRoles || []).every((required) => (
        evidenceRoles.some((candidate) => candidate.role === required.role
          && entityMatches(candidate.entity.canonical, required.entity.canonical))
      ))) return false;
      if (signature.associationOnly) {
        let cursor = -1;
        for (const required of signature.entities) {
          const next = entities.findIndex((candidate, index) => (
            index > cursor && entityMatches(required.canonical, candidate.canonical)
          ));
          if (next < 0) return false;
          cursor = next;
        }
      } else {
        const passiveSubject = passiveNamedSubject(clause, entities);
        const subject = passiveSubject || leadingNamedSubject(clause, entities);
        if (!subject || !entitiesCovered(signature.subjectEntities, [subject])) return false;
        const argumentSlots = genericArgumentSlots(clause, entities, subject, passiveSubject);
        if (!orderedArgumentSlotsCovered(signature.argumentSlots || [], argumentSlots)) return false;
        const propositionText = passiveSubject
          ? clause.slice(0, passiveSubject.index)
          : clause.slice(subject.end);
        if (!genericPredicateCovered(signature.predicateRoot, propositionText)) return false;
      }
      const roots = rootsWithoutEntities(clause, entities);
      const required = signature.substantiveRoots;
      const matched = required.filter((root) => (
        roots.some((candidate) => rootsShareStem(root, candidate))
      )).length;
      return required.length <= 4
        ? matched === required.length
        : required.length - matched <= 1 && matched / required.length >= 0.8;
    });
    // Multi-entity prose is an association claim even when its predicate is
    // outside the finite relation families. Never assemble that association
    // from entity and topic words spread over different cited passages.
    if (!intactAssociation) return false;
    return true;
  }

  const directWitness = evidenceClauses.some((clause) => {
    // Exact same-passage coverage may rely on a single title-case geography or
    // organization that is intentionally absent from the conservative global
    // lexicon. It is safe to use the clause-local entities here because all
    // claim entities and every substantive claim root must coexist in this one
    // visible passage.
    const entities = namedEntities(clause, evidenceEntityLexicon);
    if (!entitiesCovered(signature.entities, entities)) return false;
    if (!genericEvidenceBinding(signature, clause, evidenceEntityLexicon).predicateCovered) return false;
    const roots = rootsWithoutEntities(clause, entities);
    return signature.claimRoots.every((required) => (
      roots.some((candidate) => rootsShareStem(required, candidate))
    ));
  });
  if (directWitness) return true;

  const bindings = evidenceClauses.map((clause) => (
    genericEvidenceBinding(signature, clause, evidenceEntityLexicon)
  ));
  if (bindings.some((binding) => (
    binding.subjectCovered && binding.argumentsCovered
      && binding.predicateCovered && binding.strictCoverage
  ))) return true;

  const evidenceEntities = bindings.flatMap((binding) => binding.entities);
  const subjectIsNamedInEvidence = entitiesCovered(signature.subjectEntities, evidenceEntities);
  const evidenceRoots = contentRoots(evidenceClauses.join(" "));
  const subjectAppearsAsOrdinaryContent = entityRoots(signature.subjectEntities).every((root) => (
    evidenceRoots.some((candidate) => rootsShareStem(root, candidate)
      || (root.length >= 4 && candidate.length >= 4 && root.slice(0, 4) === candidate.slice(0, 4)))
  ));
  const distributedObject = bindings.some((binding) => (
    !binding.subjectCovered && binding.distributedCoverage
  ));

  if (distributedObject && (subjectIsNamedInEvidence
    || !subjectAppearsAsOrdinaryContent)) return false;
  // Without a high-confidence cross-passage binding, leave ordinary
  // paraphrase validation to the existing polarity/numeric/token guards.
  return null;
}

/**
 * Return null when a clause has no bounded entity/relation proposition. When
 * it does, every proposition must be witnessed by one intact cited passage;
 * words from unrelated sources can never be assembled into a new relation.
 */
export function relationshipClaimHasPassageWitness(claim, evidencePassages = []) {
  const clauses = evidencePassages.flatMap(atomicRelationshipClauses);
  const evidenceEntityLexicon = reliableEvidenceEntityLexicon(clauses);
  const signatures = relationshipSignatures(claim, evidenceEntityLexicon);
  const genericSignatures = atomicRelationshipClauses(claim, evidenceEntityLexicon)
    .flatMap((clause) => genericNamedSignatures(clause, evidenceEntityLexicon));
  if (!signatures.length && !genericSignatures.length) return null;
  if (!signatures.every((signature) => clauses.some((clause) => (
    signatureHasWitness(signature, clause)
  )))) return false;
  let witnessedGeneric = false;
  for (const signature of genericSignatures) {
    const status = genericSignatureStatus(signature, clauses, evidenceEntityLexicon);
    if (status === false) return false;
    if (status === true) witnessedGeneric = true;
  }
  return signatures.length || witnessedGeneric ? true : null;
}
