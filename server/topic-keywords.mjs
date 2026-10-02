// Reviewed narrow subjects shared by query scope, lexical ranking and SQL
// retrieval. Never replace a specific subject with a generic topic.
const SUBJECTS = [
  [/^(?:(?:kuuse)?koore)?urask\p{L}*$/u, "urask", ["urask", "kooreurask", "kuusekooreurask"]],
  [/^feromoon\p{L}*$/u, "feromoon", ["feromoon"]],
  [/^puunispu\p{L}*$/u, "puunispuu", ["puunispu"]],
  [/^juurepess\p{L}*$/u, "juurepess", ["juurepess"]],
  [/^samblik\p{L}*$/u, "samblik", ["samblik"]],
  [/^(?:sammal|sambla)\p{L}*$/u, "sammal", ["sammal", "sambla"]],
  [/^toiduka(?:du|o)\p{L}*$/u, "toidukadu", ["toidukadu", "toidukao"]],
  [/^toidujaat\p{L}*$/u, "toidujaatmed", ["toidujaat"]],
  [/^smi(?:l|st|ga|s|d)?$/u, "smi", ["smi", "statistiline metsainventuur", "statistilise metsainventuuri"]],
  [/^metsaaastaraamat\p{L}*$/u, "aastaraamat", ["aastaraamat"]],
];

export function specialistSubjectRoot(word = "") {
  const normalized = String(word).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("et");
  return SUBJECTS.find(([pattern]) => pattern.test(normalized))?.[1] || null;
}

export function specialistSubjectVariants(root) {
  return SUBJECTS.find(([, subject]) => subject === root)?.[2] || null;
}
