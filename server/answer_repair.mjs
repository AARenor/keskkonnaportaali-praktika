// A validation rejection can often be fixed by a different wording of the
// same evidence. The provider sees only one of these fixed directives, never
// the local rejection text or a model claim, so validation output cannot turn
// into a prompt instruction. One repair attempt is allowed per answer.
export const MAX_REPAIR_DIRECTIVE_CHARS = 400;

const REPAIR_RULES = Object.freeze([
  [
    /does not answer the requested intent/u,
    "Eelmine vastus ei nimetanud küsimuse subjekti. Nimeta esimeses lauses küsimuse subjekt ja anna selle kohta kõik allikates toetatud põhiandmed. Ära lisa metsateatise esitamise juhiseid, kui küsimus ei küsi nende kohta.",
  ],
  [
    /does not name the question's subject/u,
    "Eelmine vastus ei nimetanud küsimuse põhiteemat. Nimeta see esimeses lauses ja lisa ainult allikates toetatud asjakohased faktid.",
  ],
  [
    /has no individually attributable citations/u,
    "Eelmise vastuse sissejuhatuses oli väide, mida ükski viidatud allikas eraldi ei toeta. Kirjuta sissejuhatus ühe lausena, mille iga fakt on leitav ühe ja sama viidatud allika tekstis. Ülejäänud faktid lisa eraldi osadesse oma viidetega.",
  ],
  [
    /bypasses the directly matched current source/u,
    "Eelmine vastus vahetas otse leitud allika ära. Kasuta sissejuhatuse viitena küsimusele kõige otsesemat allikat või säilita antud intro.",
  ],
  [
    /grounding workload exceeds/u,
    "Eelmine vastus ületas kontrolli mahupiiri. Vasta kõige rohkem kolme lausega ja kasuta kõige rohkem kolme arvu; iga arv peab olema koos aasta ja ühikuga viidatud allikas.",
  ],
  [
    /does not explain the requested national sample method/u,
    "Eelmine vastus ei selgitanud mõõtmismeetodit. Nimeta valikuuring, proovitükid, üleriigiline katvus ja statistiline hinnang ainult siis, kui allikas neid toetab.",
  ],
]);

export function repairDirectiveFor(reason, detail = "") {
  if (reason !== "local-rejected") return "";
  const value = String(detail || "").split("|", 1)[0].trim();
  for (const [pattern, directive] of REPAIR_RULES) {
    if (pattern.test(value)) return directive.slice(0, MAX_REPAIR_DIRECTIVE_CHARS);
  }
  return "";
}

export function isRepairableRejection(reason, detail = "") {
  return Boolean(repairDirectiveFor(reason, detail));
}
