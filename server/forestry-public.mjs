// Public forestry routing and reviewed extracts from maintained official pages.
//
// This module is deliberately separate from the legacy forestry answer corpus.
// The documents below enter the ordinary visible result set and may support an
// answer only when their title, summary or content satisfies the intent's
// evidence groups. Tags alone never make an answer eligible.

export const ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS = [
  {
    id: "forest-balance-kaur-methodology",
    title: "Netojuurdekasvu ja raie tasakaal",
    organization: "Keskkonnaagentuur",
    type: "Ametlik analüüs",
    published: "09.04.2026",
    url: "https://keskkonnaagentuur.ee/node/2720",
    tags: ["mets", "juurdekasv", "netojuurdekasv", "raiemaht", "SMI", "pikaajaline vaade"],
    summary: "Keskkonnaagentuuri analüüs selgitab juurdekasvu, suremuse, netojuurdekasvu ja raiemahu erinevust ning rõhutab, et nende suhe on ainult üks kestlikku metsamajandust kirjeldav näitaja.",
    content: "Juurdekasv näitab puistule aastas lisanduvat tüvepuidu kogust. Netojuurdekasv saadakse, kui juurdekasvust arvatakse maha looduslik suremus. Raiemahuga tuleb võrrelda sama ulatuse ja perioodi elusate puude raiet, mitte teise definitsiooni või ajavahemiku arvu. Viimase kümnendi keskmisena oli elusate puude raiemaht majandatavates metsades netojuurdekasvust kõrgem, kuid 20 aasta vaates oli see netojuurdekasvust madalam. Ühe aasta või ühe näitaja põhjal ei saa teha lõplikku järeldust metsamajanduse kestlikkuse kohta: arvestada tuleb ka metsa vanuselist ja puuliigilist struktuuri, kahjustusi, suremust, tagavara muutust ning ajaperspektiivi.",
    locator: "Teoreetiline taust; Juurdekasv, suremus ja raie; Eesti olukord.",
    _publishedAt: "2026-04-09",
    _forestryIntentKinds: ["forest-harvest-balance", "increment-method", "harvest-over-time"],
  },
  {
    id: "forest-smi-2024-summary",
    title: "SMI: segametsade osakaal kasvab",
    organization: "Keskkonnaagentuur",
    type: "Metsastatistika",
    published: "10.06.2024",
    url: "https://keskkonnaagentuur.ee/uudised/smi-segametsade-osakaal-kasvab",
    tags: ["mets", "SMI", "raiemaht", "lageraie", "vanusjaotus", "puuliigid"],
    summary: "SMI ülevaade kirjeldab raiemahtu, lageraie pindala, puistute liigilist mitmekesisust ja vanade metsade pindala muutust sama ametliku statistika raames.",
    content: "2022. aasta raiemaht oli SMI järgi 12,1 miljonit tihumeetrit ja viimase viie raiehooaja 2018/2019–2022/2023 keskmine 11,2 miljonit tihumeetrit. 2022. aasta lageraie pindala oli 32,6 tuhat hektarit; see sisaldas ka sanitaarsetel põhjustel, näiteks kuuse-kooreüraski tõrjeks tehtud lageraieid. Ühe aasta pindala ega viie aasta keskmist ei tohi lihtsalt kümnega korrutada: kümneaastane kogum vajab iga aasta sama metoodikaga aegrida ja ebakindluse arvestamist. Vanade metsade pindala suurenes jätkuvalt ning puistute liigiline mitmekesisus kasvas, samal ajal kui monokultuursete puistute pindala vähenes.",
    locator: "SMI 2023 põhitulemused: raiemaht, lageraie pindala, liigiline koosseis ja vanad metsad.",
    _publishedAt: "2024-06-10",
    _forestryIntentKinds: ["clearcut-over-time", "forest-age-trend", "harvest-over-time"],
  },
  {
    id: "forest-notice-guidance",
    title: "Metsateatis ja metsaregister",
    organization: "Keskkonnaamet",
    type: "Ametlik juhis",
    published: "jooksev",
    url: "https://www.keskkonnaamet.ee/elusloodus-looduskaitse/metsandus/metsateatis-ja-metsaregister",
    tags: ["mets", "metsateatis", "metsaregister", "raie", "metsakahjustus", "kinnistu"],
    summary: "Metsateatis on dokument, mille metsaomanik esitab Keskkonnaametile kavandatava raie või olulise metsakahjustuse kohta; Keskkonnaamet kontrollib teatise nõuetekohasust ja kavandatud raie vastavust nõuetele.",
    content: "Metsateatis käsitleb kavandatavat raiet või metsaregistrisse kandmata olulist metsakahjustust. Teatise esitamine, menetlemine või raiet lubav otsus ei tõenda, et raie on looduses juba tehtud. Metsateatise saab esitada Metsaregistri kaudu, kus omanik valib oma kinnistu ja täidab vormi. Konkreetse kinnistu inventeerimisandmete, eraldiste ja teatiste vaatamiseks tuleb kasutada riiklikku Metsaregistrit ehk Metsaportaali.",
    locator: "Metsateatise definitsioon; millal ja kuidas teatis esitada.",
    _forestryIntentKinds: ["forest-notice", "property-forest-data"],
  },
  {
    id: "forest-law",
    title: "Metsaseadus",
    organization: "Riigi Teataja",
    type: "Kehtiv õigusakt",
    published: "jooksev",
    url: "https://www.riigiteataja.ee/akt/MS",
    tags: ["mets", "metsamaa", "raie", "metsateatis", "säästev majandamine", "tagavara"],
    summary: "Metsaseadus sätestab metsa kui ökosüsteemi kaitse, säästva majandamise, metsaressursi arvestuse ja metsateatise õigusliku raami.",
    content: "Metsaseaduse eesmärk on tagada metsa kui ökosüsteemi kaitse ja säästev majandamine. Seadus eristab metsa, metsamaad, metsaressursi arvestust ja konkreetseid metsamajandamise tegevusi. Kasvava metsa tagavara on metsaressursi näitaja, mitte automaatselt lubatud või majanduslikult kättesaadav raiemaht. Raie lubatavus sõltub muu hulgas metsa seisundist, vanusest, asukohast, õiguslikest piirangutest ja nõuetekohasest menetlusest. Metsateatise kohustus ja erandid on sätestatud §-s 41.",
    locator: "§ 2, § 3, § 6, § 9 ja § 41; kontrolli alati kehtivat redaktsiooni.",
    _forestryIntentKinds: ["stock-versus-harvestable", "clearcut-value-judgement", "forest-notice", "logging-in-protected-areas"],
  },
  {
    id: "nature-conservation-law",
    title: "Looduskaitseseadus",
    organization: "Riigi Teataja",
    type: "Kehtiv õigusakt",
    published: "jooksev",
    url: "https://www.riigiteataja.ee/akt/LKS",
    tags: ["mets", "looduskaitse", "kaitseala", "sihtkaitsevöönd", "piiranguvöönd", "raie"],
    summary: "Looduskaitseseadus seob tegevuspiirangud kaitstava objekti, vööndi, kaitse-eesmärgi ja konkreetse kaitse-eeskirjaga, mitte puistu vanusega üksi.",
    content: "Puistu kõrge vanus ei anna sellele üksnes vanuse tõttu automaatset õiguslikku kaitset. Kaitse võib tuleneda kaitstavast loodusobjektist, liigi elupaigast, püsielupaigast, Natura elupaigast, vööndist või muust kehtivast piirangust. Kaitsealadel ei ole kõikjal sama režiim: sihtkaitsevööndis ja piiranguvööndis võivad kehtida erinevad keelud, erandid ja kaitse-eesmärki toetavad tegevused. Seetõttu sõltub raie võimalikkus konkreetsest alast, vööndist, kaitse-eeskirjast ja Keskkonnaameti menetlusest.",
    locator: "Kaitstavad loodusobjektid ning kaitseala sihtkaitse- ja piiranguvööndi kord; kontrolli ka objekti kaitse-eeskirja.",
    _forestryIntentKinds: ["old-forest-protection", "logging-in-protected-areas", "clearcut-value-judgement"],
  },
  {
    id: "protected-forest-share",
    title: "Metsamaa, sh kaitsealuse metsamaa osakaal Eestis",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Keskkonnanäitaja",
    published: "17.06.2026",
    url: "https://keskkonnaportaal.ee/et/metsamaa-sh-kaitsealuse-metsamaa-osakaal-eestis",
    tags: ["mets", "metsamaa", "kaitse", "range kaitse", "osakaal", "ETAK"],
    summary: "ETAK-i metsade ja kaitstavate alade ruumiandmetel põhineva näitaja järgi oli 2024. aastal kaitse all 28,4% Eesti metsadest, sealhulgas 16,8% rangelt kaitstav metsamaa.",
    content: "2024. aasta seisuga oli 28,4% Eesti metsadest kaitse all ja 16,8% rangelt kaitstav metsamaa. Need on õigusliku kaitse ruumianalüüsi näitajad. SMI majanduskategooriad, näiteks mittemajandatav või majanduspiiranguga metsamaa, kirjeldavad teistsugust jaotust ning neid ei tohi kaitsealuse metsamaa protsendiga automaatselt samastada. Konkreetse kinnistu kaitserežiim tuleb kontrollida ruumiandmetest ja kehtivast õigusaktist.",
    locator: "Keskkonnaülevaate kaitse näitaja ja 2024. aastast kasutatav kaitstava metsamaa arvutusmetoodika.",
    _publishedAt: "2026-06-17",
    _forestryIntentKinds: ["protected-forest-share", "stock-versus-harvestable"],
  },
  {
    id: "forest-spatial-data",
    title: "Ruumiandmete teenused ja EELISe kasutamine",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Ametlik andmeteenus",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/ruumiandmete-teenused-ja-eelise-kasutamine",
    tags: ["mets", "ruumiandmed", "EELIS", "WMS", "WFS", "vald", "kaitsepiirang"],
    summary: "EELISe ja Keskkonnaportaali ruumiandmeteenused võimaldavad kontrollida asukohapõhiseid keskkonnaobjekte ja piiranguid ning kasutada dokumenteeritud WMS- ja WFS-kihte.",
    content: "Valla metsamaa pindala leidmiseks tuleb kõigepealt nimetada vald ja täpsustada näitaja: metsamaa pindala, metsasuse protsent või Metsaregistris kehtivate eraldiste pindala ei ole sama asi. Piirkondlik arvutus vajab sobiva andmeaasta ja definitsiooniga metsamaa ruumikihti ning valla piiri; riiklikku SMI protsenti ei tohi lihtsalt vallale üle kanda. Puistu vanuse või kaitse kontrollimiseks tuleb kasutada Metsaregistri ja EELISe kihte ning kehtivat õiguslikku infot.",
    locator: "Avalikud ruumiandmeteenused, WMS/WFS kihid ning piiratud andmete kasutustingimused.",
    _forestryIntentKinds: ["municipality-forest-area", "old-forest-protection", "property-forest-data"],
  },
];

const INTENTS = {
  "smi-method-comparison": {
    serviceDocumentIds: ["smi", "forest-area"],
    discoveryQueries: ["SMI metoodika valikuuring proovitükid", "SMI statistiline viga lausmetsakorraldus"],
    evidenceGroups: [
      ["valikuuring", "proovitükk"],
      ["kogu eesti", "üleriigiline"],
      ["statistiline viga", "suhteline viga"],
      ["üksiku kinnistu", "lausmetsakorraldus", "täielik ülelugemine"],
      ["üle hinnatud", "ulehinn", "ei tõenda"],
    ],
  },
  "forest-harvest-balance": {
    serviceDocumentIds: ["forest-balance-kaur-methodology"],
    discoveryQueries: ["netojuurdekasv raiemaht Keskkonnaagentuur", "juurdekasv raiemaht SMI"],
    evidenceGroups: [
      ["netojuurdekasv"],
      ["raiemaht", "elusate puude raie"],
      ["20 aasta", "pikaajaline"],
      ["üks näitaja", "lõplikku järeldust"],
    ],
  },
  "stock-versus-harvestable": {
    serviceDocumentIds: ["forest-area", "forest-law", "protected-forest-share"],
    discoveryQueries: ["metsa tagavara raiutav puidukogus", "metsamaa tagavara majanduspiirang"],
    evidenceGroups: [
      ["tagavara"],
      ["kasvava metsa puidumaht", "kasvava metsa tagavara"],
      ["mitte automaatselt", "ei ole aastane raiemaht", "raiutav puidukogus"],
      ["mittemajandatav", "majanduspiirang", "õiguslik piirang"],
    ],
  },
  "forest-stock-uncertainty": {
    serviceDocumentIds: ["smi", "forest-area"],
    discoveryQueries: ["SMI metsade tagavara hinnang suhteline viga", "metsa tagavara statistiline hinnang"],
    evidenceGroups: [
      ["tagavara"],
      ["statistiline hinnang", "valimi põhjal"],
      ["statistiline viga", "suhteline viga", "koos veaga"],
      ["vaieldamatu number", "mitte üks kindel"],
    ],
  },
  "rmk-versus-smi": {
    serviceDocumentIds: ["metsainfo-hetkeseis", "smi"],
    discoveryQueries: ["RMK metsade olem SMI", "RMK takseerandmed statistiline metsainventuur"],
    evidenceGroups: [
      ["rmk hallatavate", "rmk metsade"],
      ["takseerandm", "rmk andmebaas"],
      ["smi", "statistiline metsainventuur"],
      ["valikuuring", "kogu eesti", "üleriigiline"],
    ],
    minimumSupportingDocuments: 2,
  },
  "why-forest-numbers-differ": {
    serviceDocumentIds: ["smi-metsaregister", "metsainfo-hetkeseis", "smi"],
    discoveryQueries: ["metsaandmed erinevad numbrid metoodika", "SMI Metsaregister RMK katvus"],
    evidenceGroups: [
      ["eri allikad", "mitmel viisil", "erinev katvus"],
      ["ajaseis", "andmeaasta", "uuenevad"],
      ["valikuuring", "takseerandmed", "inventeerimisandmed"],
      ["statistiline viga", "definitsioon", "üldkogum", "ebakindlus"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-covered-area": {
    serviceDocumentIds: ["forest-area", "smi"],
    discoveryQueries: ["SMI metsaga kaetud pindala puistud", "metsamaa ja puistute pindala"],
    evidenceGroups: [
      ["metsaga kaetud", "puistute pindala"],
      ["47,11%", "2 135,8"],
      ["metsamaa"],
      ["51,8%", "2 350,6"],
      ["eri näitajad", "ei ole sama"],
    ],
  },
  "sample-size-and-precision": {
    serviceDocumentIds: ["smi", "forest-area"],
    discoveryQueries: ["SMI valimi täpsus suhteline viga", "statistiline metsainventuur valikukava"],
    evidenceGroups: [
      ["valimi suurus"],
      ["valikukava", "esinduslikkus", "proovitükk"],
      ["statistiline viga", "suhteline viga"],
    ],
  },
  "increment-method": {
    serviceDocumentIds: ["forest-area", "smi", "forest-balance-kaur-methodology"],
    discoveryQueries: ["SMI juurdekasvu arvutamine mudel", "metsa juurdekasv proovitükid"],
    evidenceGroups: [
      ["juurdekasv"],
      ["mudel", "arvutatud hinnang"],
      ["proovitükk", "smi"],
      ["tihumeetrit", "tm/ha"],
    ],
  },
  "protected-forest-share": {
    serviceDocumentIds: ["protected-forest-share"],
    discoveryQueries: ["kaitsealuse metsamaa osakaal 2024", "rangelt kaitstav metsamaa osakaal"],
    evidenceGroups: [
      ["28,4%"],
      ["16,8%"],
      ["kaitse all", "rangelt kaitstav"],
      ["õigusliku kaitse", "ruumianalüüsi"],
    ],
  },
  "climate-impact": {
    serviceDocumentIds: ["forest-condition-review", "forest-stock-stable"],
    discoveryQueries: ["kliimamuutuse mõju Eesti metsadele", "põud ürask mets kliimamuutus"],
    evidenceGroups: [
      ["kliimamuutus"],
      ["põud", "soojem"],
      ["ürask"],
      ["juurdekasv", "kahjust"],
    ],
  },
  "forest-notice": {
    serviceDocumentIds: ["forest-notice-guidance", "metsainfo-hetkeseis", "forest-law"],
    discoveryQueries: ["metsateatis Keskkonnaamet", "metsateatis kavandatav raie metsakahjustus"],
    evidenceGroups: [
      ["metsateatis"],
      ["kavandatav raie", "kavandatava raie"],
      ["metsakahjustus"],
      ["ei tõenda", "ei ole kõiki", "looduses juba tehtud"],
    ],
  },
  "property-forest-data": {
    serviceDocumentIds: ["forest-notice-guidance", "metsaregister", "forest-spatial-data"],
    discoveryQueries: ["Metsaportaal kinnistu metsaandmed", "Metsaregister katastritunnus eraldised"],
    evidenceGroups: [
      ["metsaregister", "metsaportaal"],
      ["kinnistu"],
      ["inventeerimisandmed", "eraldis"],
    ],
  },
  "harvest-over-time": {
    serviceDocumentIds: ["forest-condition-review", "forest-stock-stable"],
    discoveryQueries: ["raiemaht 20 aastat SMI aegrida", "Eesti raiemaht pikaajaline trend"],
    evidenceGroups: [
      ["raiemaht"],
      ["20 aasta", "pikaajaline"],
      ["10–12", "10-12", "aegrida", "sama metoodika"],
      ["ei näita", "ei saa", "vaja"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-age-trend": {
    serviceDocumentIds: ["forest-stock-stable", "forest-smi-2024-summary", "forest-condition-review"],
    discoveryQueries: ["Eesti metsade vanusjaotus noored vanad", "SMI noorte ja vanade metsade pindala"],
    evidenceGroups: [
      ["noorte"],
      ["vanade"],
      ["suuren", "kasv"],
      ["vanuseline", "vanusjaotus"],
    ],
  },
  "clearcut-over-time": {
    serviceDocumentIds: ["forest-smi-2024-summary", "forest-area"],
    discoveryQueries: ["SMI lageraie pindala aegrida", "lageraie pindala kümme aastat"],
    evidenceGroups: [
      ["lageraie"],
      ["32,6", "32,0"],
      ["viie raiehooaja", "viie aasta"],
      ["kümnega korrutada", "kümneaastane"],
    ],
  },
  "pine-versus-spruce": {
    serviceDocumentIds: ["forest-area", "forest-stock-stable"],
    discoveryQueries: ["SMI mänd kuusk pindala tagavara", "männikud kuusikud Eestis"],
    evidenceGroups: [
      ["mänd", "männi"],
      ["kuusk", "kuuse"],
      ["695,3", "0,70 miljonit"],
      ["431,8", "18,4%"],
      ["suurem", "domineer"],
    ],
  },
  "logging-in-protected-areas": {
    serviceDocumentIds: ["nature-conservation-law", "metsainfo-hetkeseis", "forest-law"],
    discoveryQueries: ["raie kaitsealal vöönd kaitse-eeskiri", "metsateatis kaitsealal"],
    evidenceGroups: [
      ["kaitseal"],
      ["vöönd", "sihtkaitsevöönd", "piiranguvöönd"],
      ["erinevad keelud", "sõltub", "kaitse-eeskiri"],
      ["registreeritud", "läbi viidud raietööde kohta andmed puuduvad"],
    ],
  },
  "municipality-forest-area": {
    serviceDocumentIds: ["forest-spatial-data", "metsaregister"],
    discoveryQueries: ["valla metsamaa pindala ruumiandmed", "Metsaregister valla metsasus"],
    evidenceGroups: [
      ["nimetada vald", "valla nimi"],
      ["metsamaa pindala"],
      ["ruumikiht", "ruumiandmed"],
      ["ei ole sama", "ei tohi"],
    ],
  },
  "clearcut-value-judgement": {
    serviceDocumentIds: ["forest-law", "forest-condition-review", "nature-conservation-law"],
    discoveryQueries: ["lageraie keskkonnamõju metsaseadus", "lageraie mõju elurikkus veerežiim"],
    evidenceGroups: [
      ["lageraie", "raie"],
      ["ökosüsteemi kaitse", "ökoloogiline seisund", "keskkonnamõju"],
      ["sõltub", "konkreetne", "asukoht"],
      ["õiguslik", "kaitse-eeskiri", "säästev majandamine"],
    ],
    minimumSupportingDocuments: 2,
  },
  "old-forest-protection": {
    serviceDocumentIds: ["nature-conservation-law", "forest-spatial-data", "metsaregister"],
    discoveryQueries: ["vana mets kaitse all puistu vanus", "EELIS vana mets kaitserežiim"],
    evidenceGroups: [
      ["kõrge vanus", "puistu vanus"],
      ["ei anna", "ei tulene", "üksnes vanuse tõttu"],
      ["kaitstav loodusobjekt", "liigi elupaik", "natura"],
      ["eelise", "metsaregistri", "ruumiandmed"],
    ],
  },
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^0-9a-z]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function resolved(kind) {
  const definition = INTENTS[kind];
  if (!definition) return null;
  return {
    kind,
    discoveryQueries: [...definition.discoveryQueries],
    serviceDocumentIds: [...definition.serviceDocumentIds],
    evidenceGroups: definition.evidenceGroups.map((group) => [...group]),
    minimumSupportingDocuments: Number(definition.minimumSupportingDocuments) || 1,
  };
}

function isForestDepletionIntent(text) {
  if (/\b(?:roni\w*|matk\w*|majakivi|randrahn\w*|kivi\w*|mae\w*)\b/u.test(text)) return false;
  const forest = "(?:eesti\\s+)?mets(?:a|ad|ade|as|ast|aga|amaal|amaa)?";
  const modal = "(?:saab|saavad|voib|voivad|voiks|voiksid)";
  const disappearing = "(?:kaob|kaovad|kadumas|kaduda|havib|havivad|havimas|havida|loppeb|lopevad|loppeda)";
  const bareShortQuestion = /^mets\w*\s+otsa$/u.test(text)
    || /^kas\s+mets\w*\s+otsa$/u.test(text);
  return bareShortQuestion || new RegExp(`(?:\\b${forest}(?:\\s+\\w+){0,3}\\s+${modal}(?:\\s+\\w+){0,3}\\s+otsa(?:\\s+saada)?\\b|\\b${forest}(?:\\s+\\w+){0,3}\\s+otsa\\s+${modal}\\b|\\b${modal}\\s+${forest}(?:\\s+\\w+){0,3}\\s+otsa(?:\\s+saada)?\\b|\\b${modal}\\s+eestis\\s+${forest}(?:\\s+\\w+){0,3}\\s+otsa(?:\\s+saada)?\\b|\\b${forest}(?:\\s+\\w+){0,3}\\s+(?:on\\s+)?(?:ara\\s+)?${disappearing}\\b|\\b${forest}(?:\\s+\\w+){0,3}\\s+${modal}(?:\\s+\\w+){0,3}\\s+(?:ara\\s+)?${disappearing}\\b|\\b(?:metsa|metsade)\\s+(?:kadum|havim)\\w*\\b|\\b(?:enam|varsti)\\s+(?:\\w+\\s+){0,2}metsa\\s+(?:ei\\s+ole|pole)\\b)`, "u").test(text);
}

export function resolvePublicForestryIntent(query) {
  const text = normalize(query);
  if (!text) return null;
  const hasForest = /\b(?:mets\w*|smi|rmk|puist\w*|tagavara|juurdekasv|lagerai\w*|metsateatis\w*|metsaregis\w*|mand\w*|kuus\w*)\b/u.test(text);
  const hasHarvest = /\b(?:rai\w*|raie\w*|raiut\w*|puidu eemaldam\w*|puiduvaru\w*)\b/u.test(text);
  const hasIncrement = /\b(?:juurde\s+kasv\w*|juurdekasv\w*|netojuurdekasv\w*)\b/u.test(text);

  if (hasForest && /\b(?:koduvall\w*|valla\s+mets\w*|mets\w*\s+(?:minu\s+)?vallas)\b/u.test(text)) {
    return resolved("municipality-forest-area");
  }
  if (hasForest && /\b(?:kinnistu|katastriuksus|katastritunnus|maatukk)\w*\b/u.test(text)
    && /\b(?:metsaandm\w*|metsaeraldis\w*|puistu\w*|metsaregis\w*|kust\s+lei\w*)\b/u.test(text)) {
    return resolved("property-forest-data");
  }
  if (/\bmetsateatis\w*\b/u.test(text)) return resolved("forest-notice");
  if (/\brmk\b/u.test(text) && /\bsmi\b/u.test(text)) return resolved("rmk-versus-smi");
  if (/\bsmi\b/u.test(text) && /\b(?:lausmetsakorrald\w*|ulehinn\w*|valikuuring\w*|proovitukk\w*)\b/u.test(text)) {
    return resolved("smi-method-comparison");
  }
  if (/\bsmi\b/u.test(text) && /\bmetsaregis\w*\b/u.test(text)) return {
    kind: "forest-data-sources",
    discoveryQueries: ["metsaregister SMI andmed", "statistiline metsainventuur metsaandmed"],
    serviceDocumentIds: ["smi-metsaregister", "smi", "metsainfo-hetkeseis", "metsaregister"],
    evidenceGroups: [],
    minimumSupportingDocuments: 1,
  };
  if (/\bsmi\b/u.test(text) && /\b(?:metsa|metsandus|metsainventeerimis)andm\w*\b/u.test(text)
    && /\b(?:vahe|erinev\w*|vordl\w*|kumb|sama|klap\w*|katt\w*|vastuolu)\b/u.test(text)) return {
    kind: "forest-data-sources",
    discoveryQueries: ["metsaregister SMI andmed", "statistiline metsainventuur metsaandmed"],
    serviceDocumentIds: ["smi-metsaregister", "smi", "metsainfo-hetkeseis", "metsaregister"],
    evidenceGroups: [],
    minimumSupportingDocuments: 1,
  };
  if (/\btagavara\w*\b/u.test(text)
    && /\b(?:uks|kindel|vaieldamatu|tapselt)\b[\s\S]{0,40}\bnumb\w*\b/u.test(text)) {
    return resolved("forest-stock-uncertainty");
  }
  if (/\b(?:eri|erinev\w*)\s+allik\w*[\s\S]{0,40}\b(?:erinev\w*|teistsugus\w*)\s+numb\w*\b/u.test(text)) {
    return resolved("why-forest-numbers-differ");
  }
  if (/\btagavara\w*\b/u.test(text)
    && /\b(?:raiutav\w*|kattesaadav\w*|ules\s+votta|kasutada\s+saab|puidukogus\w*)\b/u.test(text)) {
    return resolved("stock-versus-harvestable");
  }
  if (/\b(?:suurem|rohkem)\s+(?:valim\w*|vaatlus\w*)\b/u.test(text)
    || /\bvalimi\s+(?:suurus|tap\w*)\b/u.test(text)) return resolved("sample-size-and-precision");
  if (hasHarvest && /\b(?:20|kakskummend)\s+aasta\w*\b/u.test(text) && !hasIncrement) {
    return resolved("harvest-over-time");
  }
  if (/\blagerai\w*\b/u.test(text) && /\b(?:10|kumne)\s+aasta\w*\b/u.test(text)) {
    return resolved("clearcut-over-time");
  }
  if (/\blagerai\w*\b/u.test(text) && /\b(?:koik|alati|keskkonnavast\w*|halb\w*)\b/u.test(text)) {
    return resolved("clearcut-value-judgement");
  }
  if (/\b(?:vana|vanad|vanem)\s+mets\w*\b/u.test(text)
    && /\b(?:automaat\w*|kaitse\w*|kaitsestaatus\w*)\b/u.test(text)) return resolved("old-forest-protection");
  if (/\bkaitseal\w*\b/u.test(text) && hasHarvest) return resolved("logging-in-protected-areas");
  if (hasForest && /\b(?:kaitse\s+all|kaitstud|kaitsealuse|rangelt\s+kaitstav|mittemajandatav)\b/u.test(text)
    && /\b(?:kui\s+suur|kui\s+palju|osa|osakaal|protsent)\b/u.test(text)) return resolved("protected-forest-share");
  if (/\b(?:mand|manni|mannid|mannik\w*)\b/u.test(text) && /\b(?:kuusk|kuuse|kuused|kuusik\w*)\b/u.test(text)) {
    return resolved("pine-versus-spruce");
  }
  if (hasForest && /\b(?:noorem\w*|vanusjaot\w*|vanuselis\w*|keskealis\w*)\b/u.test(text)) {
    return resolved("forest-age-trend");
  }
  if (hasForest && /\bkliim\w*\b/u.test(text)) return resolved("climate-impact");
  if (hasIncrement && /\b(?:kuidas|arvuta\w*|mudel\w*|tekib|moodet\w*)\b/u.test(text) && !hasHarvest) {
    return resolved("increment-method");
  }
  // Harvest-versus-increment questions already have a dedicated structured
  // Eurostat/KAUR adapter. Leave them to that path so current observations
  // retain priority over this directory's explanatory fallback extract.
  if (hasHarvest && hasIncrement) return null;

  const depletion = hasForest && isForestDepletionIntent(text);
  if (depletion) return {
    kind: "forest-depletion",
    discoveryQueries: ["metsa tagavara stabiilne SMI", "Eesti metsamaa pindala SMI", "Eesti metsade seisund trendid"],
    serviceDocumentIds: ["forest-stock-stable", "forest-area", "forest-condition-review", "smi"],
    evidenceGroups: [],
    minimumSupportingDocuments: 1,
  };

  if (hasForest && /\b(?:metsaga\s+kaetud|kaetud\s+metsaga|puistute\s+pindala|metsaga\s+metsamaa)\b/u.test(text)) {
    return resolved("forest-covered-area");
  }
  if (hasForest && /\bmetsasus\w*\b/u.test(text)
    && /\b(?:pindala|protsent|osakaal)\w*\b/u.test(text)) return resolved("forest-covered-area");
  if (hasForest && /\b(?:kui\s+palju|mitu|kui\s+suur\w*|metsamaa|metsasus\w*|pindala|osakaal|protsent|hektar\w*)\b/u.test(text)) {
    return {
      kind: "forest-area",
      discoveryQueries: ["metsamaa pindala SMI Eesti", "metsasuse pindala Eesti"],
      serviceDocumentIds: ["forest-area", "smi"],
      evidenceGroups: [],
      minimumSupportingDocuments: 1,
    };
  }
  return null;
}

export function forestryIntentDefinitions() {
  return Object.fromEntries(Object.keys(INTENTS).map((kind) => [kind, resolved(kind)]));
}
