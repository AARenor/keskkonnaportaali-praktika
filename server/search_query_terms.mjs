import { specialistSubjectRoot, specialistSubjectVariants } from "./topic-keywords.mjs";
import { resolvePublicForestryIntent } from "./forestry-public.mjs";
export function normalize(value = "") {
  return value
    .toLocaleLowerCase("et")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/%/gu, " protsent ")
    .replace(/[^a-z0-9äöõüšž]+/gi, " ")
    .trim();
}
export const STOP_WORDS = new Set([
  "abil",
  "nende",
  "need",
  "neid",
  "aga",
  "andmed",
  "andmete",
  "eesti",
  "eestis",
  "jaoks",
  "kohta",
  "korraga",
  "vaata",
  "naitab",
  "naitavad",
  "tahendab",
  "tahendavad",
  "kattesaadavad",
  "olemas",
  "naeb",
  "leiab",
  "mis",
  "kuidas",
  "kas",
  "miks",
  "milline",
  "millised",
  "palun",
  "räägi",
  "raagi",
  "mulle",
  "meie",
  "nii",
  "mina",
  "sina",
  "tema",
  "nad",
  "kohta",
  "praegu",
  "panna",
  "osta",
  "ostma",
  "ostmine",
  "praegune",
  "praegused",
  "hetke",
  "hetkel",
  "täna",
  "tana",
  "homme",
  "homne",
  "ülehomme",
  "ulehomme",
  "reaalajas",
  "värske",
  "värsked",
  "uusim",
  "see",
  "seda",
  "selle",
  "siis",
  "tahan",
  "soovin",
  "sooviksin",
  "selgita",
  "selgitage",
  "teada",
  "mind",
  "huvitab",
  "vana",
  "vanu",
  "mida",
  "tahendab",
  "viimase",
  "jooksul",
  "kui",
  "suur",
  "suured",
  "suurus",
  "taies",
  "palju",
  "oli",
  "on",
  "aasta",
  "aastal",
  "kust",
  "kuhu",
  "viia",
  "saab",
  "saada",
  "leia",
  "leian",
  "vaata",
  "vaadata",
  "alla",
  "kaudu",
  "kontrollida",
  "esitada",
  "kaasnevad",
  "halvas",
  "teenus",
  "teenuse",
  "ole",
  "oleva",
  "alati",
  "linnas",
  "sama",
  "asi",
  "kelle",
  "vaja",
  "teeb",
  "teed",
  "tee",
  "teha",
  "tehes",
  "teinud",
  "tegemine",
  "hoida",
  "hoia",
  "hoiab",
  "hoidmine",
  "ennetada",
  "ennetamine",
  "valtida",
  "vältida",
  "valtimine",
  "vältimine",
  "ara",
  "ära",
  "missugune",
  "missugused",
  "peab",
  "peaks",
  "voib",
  "võib",
  "voiks",
  "võiks",
  "tuleb",
  "tuleks",
  "voimalik",
  "võimalik",
  "voimalikud",
  "võimalikud",
  "kasutama",
  "kasutada",
  "kasuta",
  "kasutatakse",
  "leidub",
  "leida",
  "leian",
  "anna",
  "andke",
  "andma",
  "utle",
  "ütle",
  "utleb",
  "ütleb",
  "tapsemalt",
  "täpsemalt",
  "ning",
  "voi",
  "või",
  "ja",
  "et",
  "ka",
  "koige",
  "kõige",
  "naeb",
  "how",
  "what",
  "where",
  "why",
  "which",
  "please",
  "tell",
  "show",
  "find",
  "right",
  "now",
  "current",
  "currently",
  "today",
  "tomorrow",
  "latest",
  "estonia",
  "estonian",
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "about",
  "to",
  "of",
  "in",
  "on",
  "at",
  "is",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did",
  "can",
  "could",
  "should",
  "would",
  "has",
  "have",
  "had",
  "will",
  "its",
  "this",
  "that",
  "there",
  "their",
  "they",
  "them",
  "you",
  "your",
  "by",
  "than",
  "also",
  "such",
]);
export function forestEvidenceIntent(query) {
  return resolvePublicForestryIntent(query);
}

// Language scope: the practice portal is Estonian-only for now. Foreign
// bridges (Russian keyword roots, English topic/phrase mappings) stay in
// the codebase but are inert unless explicitly re-enabled at runtime.
// Set MULTILINGUAL_SEARCH_ENABLED=true to restore multilingual retrieval.
export function isMultilingualSearchEnabled() {
  return String(process.env.MULTILINGUAL_SEARCH_ENABLED ?? "").trim().toLowerCase() === "true";
}

// Search answers forest questions only. Set ALL_ENVIRONMENT_SEARCH_ENABLED=true
// to restore answers on every environmental topic.
export function isAllEnvironmentSearchEnabled() {
  return String(process.env.ALL_ENVIRONMENT_SEARCH_ENABLED ?? "").trim().toLowerCase() === "true";
}

// Stems are listed by inflected form because "kuus", "kasu" and "puudub" must
// not count as trees. "metsik" and "metsloom" are wildlife, not forest.
export const FOREST_STAND_PATTERN = /\b(?:(?!metsik|metsloom)\p{L}*mets\p{L}*|(?:kaasik|kuusik|lepik|haavik|tammik|noorendik|raadam|raadat|saaresurm|vaarisel|vääriselupai|puit|puidu)\p{L}*|\p{L}{3,}puu(?:d|de|l|le|lt|s|st|ga|t|desse)?)\b/iu;
export const FOREST_VOCABULARY_PATTERN = /\b(?:(?!metsik|metsloom)\p{L}*mets\p{L}*|(?:kaasik|kuusik|lepik|haavik|tammik|noorendik|raadam|raadat|saaresurm|vaarisel|vääriselupai)\p{L}*|\p{L}*raie\p{L}*|\p{L}*raiu\p{L}*|\p{L}*puu(?:d|de|l|le|lt|s|st|ga|t|desse)?|pui(?:d|dude|dudel)|\p{L}*puit\p{L}*|\p{L}*puidu\p{L}*|puuliik\p{L}*|palgi\p{L}*|palkide|harvest\p{L}*|forvarder\p{L}*|forwarder\p{L}*|lang(?:i|il|ile|ilt|id|ide)?|kokkuve\p{L}*|veoseleh\p{L}*|rinnasdiam\p{L}*|okkakad\p{L}*|okkakao\p{L}*|hoiuala\p{L}*|kaitseala\p{L}*|\p{L}*kaitsevoond\p{L}*|piiranguvoond\p{L}*|looduskaitse\p{L}*|pusielupai\p{L}*|kaitsealus\p{L}*|talvituspai\p{L}*|loodusreservaa\p{L}*|rahvuspar\p{L}*|puistu\p{L}*|\p{L}*urask\p{L}*|feromoon\p{L}*|juurepess\p{L}*|harvendus\p{L}*|kuusk\p{L}*|kuuse\p{L}*|mand|manni\p{L}*|kask|kaske|kase|kasel|kasesid|haab|haava|lepp|lepa|tamm|tamme|smi|rmk|lulucf)\b/iu;
const TALLINN_LOCATION_TOKEN_PATTERN = /^tal{1,2}in{1,2}(?:a(?:s|st|sse|le|l|lt|ga)?|s)?$/u;

function isTallinnLocationToken(value) {
  return TALLINN_LOCATION_TOKEN_PATTERN.test(String(value || ""));
}

export function textHasTallinnLocation(value) {
  return String(value || "").split(/\s+/u).some(isTallinnLocationToken);
}

export function topicRoot(word) {
  // Keep reviewed specialist subjects intact through scope, query expansion
  // and document ranking. A generic "mets"/"seire" match is not an ürask hit.
  const subject = specialistSubjectRoot(word);
  if (subject) return subject;
  // Two high-frequency one-character portal/topic misspellings are kept
  // deliberately narrow; broader fuzzy matching would admit unrelated words.
  // English mappings below are inert in Estonian-only mode (see
  // isMultilingualSearchEnabled); Estonian branches are unaffected.
  const multilingual = isMultilingualSearchEnabled();
  if (word.startsWith("keskonnaportaal") || word.startsWith("keskkonnaportaal")) return "keskkonnaportaal";
  if (word.startsWith("keskkonnportal")) return "keskkonnaportaal";
  if (word.startsWith("keskonnaandm")) return "andmed";
  // Both compounds refer to the same expert estimate.
  if (word.startsWith("eksperthinnang") || word.startsWith("eksperdihinnang")) return "eksperthinnang";
  if (multilingual && word.startsWith("environmental")) return "keskkond";
  if (multilingual && word.startsWith("conservation")) return "looduskaitse";
  if (multilingual && word.startsWith("wetland")) return "margala";
  if (multilingual && word.startsWith("meadow")) return "elupaik";
  if (multilingual && word.startsWith("flood")) return "uleujutusrisk";
  if (multilingual && word.startsWith("hydrolog")) return "vesi";
  if (multilingual && word.startsWith("renewal")) return "taastamine";
  if (multilingual && word.startsWith("warning")) return "hoiatus";
  if (multilingual && word.startsWith("mapping")) return "kaart";
  if (multilingual && (word.startsWith("landowner") || word.startsWith("landholder"))) return "piirang";
  if (word.startsWith("keskkonnareg") || word.startsWith("keskonnareg")) return "register";
  if (word.startsWith("keskkonnateab") || word.startsWith("keskonnateab")) return "keskkond";
  if (word.startsWith("keskkonnateenus") || word.startsWith("keskonnateenus")) return "keskkond";
  if (word.startsWith("veeregis")) return "vesi";
  if (word === "eelis" || word.startsWith("eelise")) return "eelis";
  if (word.startsWith("keskkonnakohust") || word.startsWith("keskonnakohust")) return "piirang";
  if (word.startsWith("keskkonnaoig") || word.startsWith("keskonnaoig")) return "piirang";
  if (word.startsWith("keskkonnaobj") || word.startsWith("keskonnaobj")) return "register";
  if (word.startsWith("biodiverst")) return "elurikkus";
  if (multilingual && word.startsWith("groundwater")) return "pohjavesi";
  if (multilingual && word.startsWith("borehole")) return "puurkaev";
  if (word.startsWith("erakaev")) return "puurkaev";
  if (multilingual && word.startsWith("weather")) return "ilm";
  if (multilingual && word.startsWith("forecast")) return "prognoos";
  if (multilingual && word === "air") return "ohk";
  if (multilingual && word.startsWith("temperature")) return "temperatuur";
  if (multilingual && (word.startsWith("precipitation") || word.startsWith("rainfall"))) return "sademed";
  if (word.startsWith("eramets")) return "mets";
  if (word.startsWith("eramaa")) return "kinnistu";
  if (word.startsWith("haldam") || word.startsWith("haldaja")) return "piirang";
  if (word.startsWith("munitsipaaluksus")) return "keskkond";
  if (multilingual && (word.startsWith("forest") || word.startsWith("woodland"))) return "mets";
  if (word.startsWith("kaitsemets")) return "mets";
  if (multilingual && (word.startsWith("wildlife") || word.startsWith("animal") || word.startsWith("bear") || word.startsWith("wolf"))) return "uluk";
  if (multilingual && (/^(?:beaver|bird|deer|eagle|fox|frog|lynx|mink|otter|salmon|seal|snake|squirrel|stork|toad|trout)\w*$/u.test(word)
    || /^boars?$/u.test(word))) return "uluk";
  if (multilingual && (word.startsWith("biodiversity") || word.startsWith("biodiversite") || word === "nature")) return "elurikkus";
  if (multilingual && word.startsWith("species")) return "liik";
  if (multilingual && word.startsWith("habitat")) return "elupaik";
  if (multilingual && word === "water") return "vesi";
  if (multilingual && word.startsWith("river")) return "jogi";
  if (multilingual && (word.startsWith("stream") || word.startsWith("creek"))) return "jogi";
  if (multilingual && word.startsWith("lake")) return "jarv";
  if (multilingual && (word === "sea" || word.startsWith("ocean") || word.startsWith("marine"))) return "meri";
  if (multilingual && word.startsWith("baltic")) return "laanemeri";
  if (multilingual && word.startsWith("pollution")) return "saaste";
  if (multilingual && word.startsWith("waste")) return "jaat";
  if (multilingual && word.startsWith("recycl")) return "ringlussevott";
  if (multilingual && word === "rate") return "maar";
  if (multilingual && word.startsWith("noise")) return "mura";
  if (multilingual && word.startsWith("radiation")) return "kiirgus";
  if (multilingual && word.startsWith("monitor")) return "seire";
  if (multilingual && word.startsWith("observation")) return "seire";
  if (multilingual && (word.startsWith("eutroph") || word.startsWith("algal") || word === "algae" || word.startsWith("bloom"))) return "eutrofeerumine";
  if (multilingual && (word === "map" || word === "maps")) return "kaart";
  if (multilingual && word === "data") return "andmed";
  if (multilingual && word.startsWith("database")) return "register";
  if (multilingual && word.startsWith("status")) return "seisund";
  if (multilingual && word.startsWith("permit")) return "keskkonnaluba";
  if (multilingual && word.startsWith("application")) return "taotlemine";
  if (multilingual && word.startsWith("assessment")) return "hindamine";
  if (multilingual && (word.startsWith("renovat") || word.startsWith("reconstruct")
    || word.startsWith("construct") || word === "building")) return "ehitamine";
  if (multilingual && word.startsWith("scenario")) return "stsenaarium";
  if (multilingual && word.startsWith("climate")) return "kliima";
  if (multilingual && word.startsWith("historical")) return "ajalooline";
  if (multilingual && word.startsWith("regeneration")) return "taastamine";
  if (multilingual && (word.startsWith("tyre") || word.startsWith("tire"))) return "rehv";
  if (multilingual && (word.startsWith("dispose") || word.startsWith("disposal"))) return "jaat";
  if (word.startsWith("avaandm")) return "avaandmed";
  if (word.startsWith("keskkonnaandm")) return "andmed";
  if (word.startsWith("metaandm")) return "metaandmed";
  if (word.startsWith("clidata")) return "api";
  if (word.startsWith("openapi") || word === "api" || word.startsWith("api")) return "api";
  if (word.startsWith("geojson") || word.startsWith("qgis") || word.startsWith("wfs") || word.startsWith("wms")) return "ruumikiht";
  if (word.startsWith("csv") || word.startsWith("json") || word.startsWith("excel")) return "allalaadimine";
  if (word.startsWith("statist")) return "statistika";
  if (word.startsWith("andm")) return "andmed";
  if (word.startsWith("kasvuhoonegaas") || word === "khg") return "kasvuhoonegaas";
  if (word.startsWith("kasvuhoone")) return "kasvuhoonegaas";
  if (word.startsWith("metsaregis")) return "metsaregister";
  if (word.startsWith("metsaandm") || word.startsWith("metsandusandm")) return "metsaandmed";
  if (word.startsWith("metsloom")) return "uluk";
  if (word.startsWith("riigimets")) return "mets";
  if (word.startsWith("mets")) return "mets";
  if (word.startsWith("lausmetsakorrald")) return "mets";
  if (word === "rmk") return "mets";
  if (word.startsWith("tagavara") || word.startsWith("tihumeet")) return "mets";
  if (word.startsWith("valim") || word.startsWith("proovitukk")) return "mets";
  if (word.startsWith("puist")) return "mets";
  if (word.startsWith("saaresurm")) return "saaresurm";
  if (word.startsWith("lagerai")) return "raie";
  if (word.startsWith("metsateatis") || word.startsWith("raieteatis")) return "mets";
  if (word.startsWith("kuusk") || word.startsWith("kuuse") || word.startsWith("kuusik")) return "mets";
  if (word.startsWith("manni") || word.startsWith("mannik")) return "mets";
  if (word.startsWith("rai") && !word.startsWith("rain")) return "raie";
  // Estonian compounds carry the subject at the end: sanitaarraie,
  // harvendusraie, okaspuumetsade, segametsas.
  if (/^\p{L}{3,}rai(?:e|u)\p{L}*$/u.test(word)) return "raie";
  if (/^(?:okaspuu|lehtpuu|puu|sega|salu|palu|laane|nomme|soo|kuuse|manni|kase|lepa|haava)mets\p{L}*$/u.test(word)) return "mets";
  if (word.startsWith("puuliik") || word.startsWith("puuliig") || word.startsWith("enamuspuuliik") || word.startsWith("enamuspuuliig")) return "mets";
  if (word.startsWith("netojuurdekasv") || word.startsWith("juurdekasv")) return "juurdekasv";
  if (word.startsWith("ulet")) return "uletamine";
  if (word.startsWith("noor")) return "noor";
  if (word.startsWith("vanus") || word.startsWith("vanamets") || word.startsWith("keskeal")) return "vanus";
  if (word.startsWith("osakaal")) return "osakaal";
  if (word.startsWith("muut") || word.startsWith("vahen") || word.startsWith("kahan") || word.startsWith("langen")) return "muutus";
  if (word.startsWith("vaiksem")) return "vaiksem";
  if (word.startsWith("kasv")) return "kasv";
  if (word.startsWith("tulemus")) return "tulemus";
  if (word.startsWith("tulevik")) return "tulevik";
  if (word.startsWith("kliim")) return "kliima";
  if (word.startsWith("ilm")) return "ilm";
  if (word.startsWith("stsenaarium")) return "stsenaarium";
  if (word.startsWith("kaard")) return "kaart";
  if (word.startsWith("ruumikiht")) return "ruumikiht";
  if (word.startsWith("laadida") || word.startsWith("allalaadi") || word.startsWith("alalaadi")) return "allalaadimine";
  if (word.startsWith("kasutusjuh")) return "kasutusjuhend";
  if (word.startsWith("jaatmekaitluskoh")) return "jaatmekaitluskoht";
  if (word.startsWith("asbest") || word.startsWith("eterniit")) return "asbest";
  if (word.startsWith("biojaat") || word.startsWith("kompost")) return "biojaatmed";
  if (word.startsWith("plastijaat")) return "plastijaatmed";
  if (word.startsWith("pakend")) return "jaat";
  if (word.startsWith("pudel") || word.startsWith("klaas")) return "klaas";
  if (word.startsWith("diivan") || word.startsWith("divan") || word.startsWith("moobel")) return "suurjaatmed";
  if (word.startsWith("taaskasut")) return "ringlussevott";
  if (word.startsWith("kulmkapp") || word.startsWith("kulmik") || word.startsWith("kodumasin") || word.startsWith("elektroonik")) return "jaatmekaitluskoht";
  if (word.startsWith("patarei") || word.startsWith("ravim") || word.startsWith("varvipurk")) return "jaat";
  if (word.startsWith("aku")) return "aku";
  if (word.startsWith("jaat")) return "jaat";
  if (word.startsWith("ringmajand")) return "ringmajandus";
  if (word.startsWith("ringlussevot")) return "ringlussevott";
  if (word === "maar" || word.startsWith("protsent")) return "maar";
  if (word.startsWith("prugil")) return "jaatmekaitluskoht";
  if (word.startsWith("prugi")) return "prugi";
  if (word.startsWith("rehv") || word.startsWith("autorehv")) return "rehv";
  if (word.startsWith("polet")) return "polet";
  if (word.startsWith("tohi") || /^(?:voib|voivad|voiks|voiksid)$/u.test(word)
    || word.startsWith("lubat") || word.startsWith("keelat")) return "lubatavus";
  if (word.startsWith("ohukval") || word === "ohu") return "ohukvaliteet";
  if (word.startsWith("ohusaast")) return "ohukvaliteet";
  if (word.startsWith("peenosak") || word.startsWith("pm10") || word.startsWith("pm2")
    || word === "no2" || word === "co" || word.startsWith("vingugaas")) return "ohukvaliteet";
  if (word === "ohk" || word.startsWith("valisoh")) return "ohk";
  if (word === "uv" || word.startsWith("ultraviolett")) return "uvkiirgus";
  if (word.startsWith("radioaktiiv")) return "radioaktiivne";
  if (word.startsWith("radionukliid")) return "radionukliid";
  if (word.startsWith("radoon")) return "radoon";
  if (word.startsWith("sisekliim")) return "sisekliima";
  if (word.startsWith("hallitus")) return "hallitus";
  if (word.startsWith("liigniisk") || word.startsWith("ohuniisk") || word.startsWith("niiskus")) return "niiskus";
  if (word.startsWith("kemikaal")) return "kemikaal";
  if (word.startsWith("ohutuskaart")) return "ohutuskaart";
  if (word.startsWith("biotsiid")) return "biotsiid";
  if (word.startsWith("kimal") || word.startsWith("tolmeld")) return "tolmeldaja";
  if (word.startsWith("mikroplast")) return "mikroplast";
  if (word.startsWith("lohn") || word.startsWith("hais")) return "lohn";
  if (word.startsWith("okoloog")) return "okoloogia";
  if (/^(?:teatada|teatamine|teatamist)$/u.test(word)) return "teatamine";
  if (["pfas", "pfos", "pfoa"].includes(word)) return "pfas";
  if (word === "prtr") return "prtr";
  if (word.startsWith("saast")) return "saaste";
  if (word.startsWith("reost")) return "reostus";
  if (word.startsWith("veereost")) return "reostus";
  if (word.startsWith("reove") || word.startsWith("heitve")) return "reovesi";
  if (word.startsWith("heit")) return "heide";
  if (word.startsWith("looduskait")) return "looduskaitse";
  if (word.startsWith("elurikk")) return "elurikkus";
  if (word.startsWith("rohevorg") || word.startsWith("rohekoridor")) return "rohevorgustik";
  if (word.startsWith("voorliig") || word.startsWith("invasiiv") || word.startsWith("karuputk")) return "voorliik";
  if (word.startsWith("uluk") || word.startsWith("karu") || word.startsWith("hund") || word.startsWith("ilves") || word.startsWith("suurkisk")) return "uluk";
  if (/^(?:poder|podr|potr|hirv|rebas|rebane|kahrik|kobra|saakal)\p{L}*$/u.test(word)) return "uluk";
  if (/^(?:\p{L}*jaht(?:i|il|ile|ist|ide)?|\p{L}*jahi\p{L}*)$/u.test(word)) return "uluk";
  if (word.startsWith("elupaik") || word.startsWith("elupaig") || word.startsWith("vaariselupa") || word.startsWith("varjepaig")) return "elupaik";
  if (word.startsWith("pusielupai")) return "pusielupaik";
  if (word.startsWith("hoiual")) return "kaitseala";
  if (word.startsWith("rahvuspar")) return "kaitseala";
  if (word.startsWith("kaitseal")) return "kaitseala";
  if (word.startsWith("kaitstav")) return "kaitstav";
  if (word.startsWith("liig") || word.startsWith("rahni") || word.startsWith("nahkhiir") || word.startsWith("hulj")
    || word.startsWith("konn") || word.startsWith("pesapaig")) return "liik";
  if (word.startsWith("rannikuve")) return "rannikuvesi";
  if (word.startsWith("suplusve") || word.startsWith("rannave") || word.startsWith("supluskoh")
    || word.startsWith("rannas") || word.startsWith("ranna") || word.startsWith("rand")) return "suplusvesi";
  if (word.startsWith("rannikumer")) return "meri";
  if (word.startsWith("joogive") || word.startsWith("kraanive")) return "joogivesi";
  if (word.startsWith("vaikepuhast") || word.startsWith("omapuhast") || word.startsWith("kohtkait") || word.startsWith("kogumismahut")) return "kohtkaitlus";
  if (word.startsWith("pestitsiid") || word.startsWith("taimekaitsevah")) return "pestitsiid";
  if (word.startsWith("nitraat")) return "nitraat";
  if (word.startsWith("veekaits")) return "veekaitse";
  if (word.startsWith("veelo") || word.startsWith("veeloa") || word.startsWith("veelub")) return "vesi";
  if (word.startsWith("pinnave")) return "vesi";
  if (word.startsWith("pohjave")) return "pohjavesi";
  if (word.startsWith("puurkaev") || word.startsWith("puurauk") || word.startsWith("salvkaev") || word.startsWith("kaevu")) return "puurkaev";
  if (word.startsWith("registr")) return "register";
  if (word === "bht7") return "vesi";
  if (word === "bod7") return "vesi";
  if (word.startsWith("mereprug") || word.startsWith("mikroprug")) return "mereprugi";
  if (word.startsWith("laanemer")) return "laanemeri";
  if (word.startsWith("eutrofeer") || word.startsWith("eutrofer") || word.startsWith("oitse")
    || word.startsWith("vetik") || word.startsWith("sinivetik")) return "eutrofeerumine";
  if (word.startsWith("vooluveekog")) return "vesi";
  if (word.startsWith("veeseir")) return "vesi";
  if (word.startsWith("hudro")) return "vesi";
  if (word.startsWith("emajog") || word.startsWith("emajoe")) return "emajogi";
  // Jõgeva is a station/place name, not an inflected form of "jõgi". Keep
  // this check ahead of the broad river stem so historical station queries
  // retain their location identity.
  if (word.startsWith("jogeva")) return "jogeva";
  if (word.startsWith("veevot")) return "vesi";
  if (word.startsWith("jarv") || word.startsWith("tiig")) return "jarv";
  if (word.startsWith("jogi") || word.startsWith("joe") || word.startsWith("joge") || word.startsWith("jokke")) return "jogi";
  if (["vee", "vees", "veest", "veega", "vett"].includes(word) || word.startsWith("veek")) return "vesi";
  if (word.startsWith("veetas") || word.startsWith("vooluhulk") || word.startsWith("kraavive")) return "vesi";
  if (word === "laht" || word.startsWith("lahe") || word.startsWith("lahte") || word.startsWith("lahes")) return "meri";
  if (word.startsWith("mere") || word.startsWith("merd") || word.startsWith("merre") || word === "meri") return "meri";
  if (word.startsWith("jaaolu") || word === "jaakaart" || word === "jaad" || word === "jaa") return "jaaolud";
  if (word.startsWith("vaatlusandm")) return "seire";
  if (word.startsWith("ohutemperatuur") || word.startsWith("temperatuur")) return "temperatuur";
  if (word.startsWith("sadem") || word.startsWith("saju") || word.startsWith("sajab") || word.startsWith("vihm")) return "sademed";
  if (word.startsWith("uleujutusrisk") || word.startsWith("uleujutusala") || word.startsWith("uleujutuskaart")) return "uleujutusrisk";
  if (word.startsWith("aike") || word.startsWith("libed") || word.startsWith("tuleoh") || word.startsWith("uleujutus")) return "hoiatus";
  if (word.startsWith("talv")) return "kliima";
  if (word.startsWith("prognoos")) return "prognoos";
  if (word.startsWith("ilmaprognoos")) return "prognoos";
  if (word.startsWith("hoiatus") || word.includes("hoiatus")) return "hoiatus";
  if (word.startsWith("katastr")) return "kataster";
  if (word.startsWith("maatuk") || word.startsWith("maatukk") || word.startsWith("maauksus")) return "kinnistu";
  if (word.startsWith("naaberkinnist") || word.startsWith("naabrikinnist")) return "kinnistu";
  if (word.startsWith("kinnist")) return "kinnistu";
  if (word.startsWith("maaomanik") || word.startsWith("metsaomanik")) return "piirang";
  if (word.startsWith("keskkonnalub") || word.startsWith("keskkonnalo")
    || word.startsWith("keskonnalub") || word.startsWith("keskonnalo")
    || word === "luba" || word.startsWith("loa")) return "keskkonnaluba";
  if (word.startsWith("keskkonnapiir") || word.startsWith("keskonnapiir")) return "piirang";
  if (word.startsWith("kotkas")) return "kotkas";
  if (word.startsWith("loataotl")) return "taotlemine";
  if (word.startsWith("taotl") || word.startsWith("taotle")) return "taotlemine";
  if (word.startsWith("menetl")) return "menetlus";
  if (word.startsWith("staatus")) return "staatus";
  if (word.startsWith("nousole")) return "nousolek";
  if (word.startsWith("ettevot")) return "ettevote";
  if (word.startsWith("ehita") || word.startsWith("ehitus")
    || word.startsWith("raja") || word.startsWith("pustita")) return "ehitamine";
  if (word.startsWith("seisund") || word.startsWith("hinnang")) return "seisund";
  if (word.startsWith("hinnat") || word.startsWith("hindam")) return "hindamine";
  if (word.startsWith("kvalite")) return "seisund";
  if (word.startsWith("keskkonnamoj")) return "keskkonnamoju";
  if (word.startsWith("keskkonnarisk")) return "keskkonnamoju";
  if (word.startsWith("tuulepar")) return "tuulepark";
  if (word.startsWith("seir")) return "seire";
  if (word.startsWith("keskkonnaseir")) return "seire";
  if (word.startsWith("moot") || word.startsWith("mood")) return "mootmine";
  if (word.startsWith("automaatjaam")) return "automaatjaam";
  if (word.startsWith("elektriaut")) return "elektriauto";
  if (word.startsWith("elutsuk")) return "elutsukkel";
  if (word.startsWith("energi") || word.startsWith("taastuvenergi") || word.startsWith("paikeseenergi")) return "energia";
  if (word.startsWith("vedelkut") || word.startsWith("vedelkyt") || word.startsWith("kutus") || word.startsWith("kytus")) return "kutus";
  if (word.startsWith("transpor")) return "transport";
  if (word.startsWith("maavar")) return "maavara";
  if (word.startsWith("kaevand") || word.includes("karjaar")) return "kaevandus";
  if (word.startsWith("korrasta")) return "korrastamine";
  if (word.startsWith("polevkiv")) return "polevkivi";
  if (word.startsWith("mull")) return "muld";
  if (word.startsWith("maahoiv") || word.startsWith("netohoiv")) return "maahoive";
  if (word.startsWith("jaakreost")) return "jaakreostus";
  if (word.startsWith("mura")) return "mura";
  if (word.startsWith("vibratsioon")) return "mura";
  if (word.startsWith("margal") || word.startsWith("turba") || word.startsWith("rab") || /^soo(?:d|s|st|de|del|des)?$/u.test(word)) return "margala";
  if (word.startsWith("taasta")) return "taastamine";
  if (word.startsWith("kohanem")) return "kohanemine";
  if (word.startsWith("pais")) return "pais";
  if (word.startsWith("kalapuugi") || word.startsWith("kalapuuk") || word.startsWith("kalastus")) return "kalapuuk";
  if (/^kal(?:a|ad|ade|ast|astik|aliik)/u.test(word)) return "kala";
  if (word.startsWith("ranne") || word.startsWith("ränne") || word.startsWith("migration")) return "ranne";
  if (word.startsWith("osoon")) return "osoon";
  if (word.startsWith("paikesepaneel") || word.startsWith("fotogalvaan")) return "paikesepaneel";
  if (word.startsWith("jalajalg") || word.startsWith("jalajalj") || word.startsWith("keskkonnajalaj") || word.startsWith("susinikujalaj") || word.startsWith("khgjalaj")) return "jalajalg";
  if (word.startsWith("organisatsioon")) return "organisatsioon";
  if (word.startsWith("susinik")) return "susinik";
  if (word === "co2") return "kasvuhoonegaas";
  if (word.startsWith("sidum")) return "sidumine";
  if (word.includes("kiirg")) return "kiirgus";
  if (word.startsWith("tegevuspiirang")) return "tegevuspiirang";
  if (word.startsWith("piirang")) return "piirang";
  if (word.startsWith("harju")) return "harjumaa";
  if (isTallinnLocationToken(word)) return "tallinn";
  if (word.startsWith("tartu")) return "tartu";
  if (word.startsWith("viljand")) return "viljandi";
  if (word.startsWith("parnu")) return "parnu";
  if (word.startsWith("narva")) return "narva";
  if (word.startsWith("voru")) return "voru";
  if (word.startsWith("saare")) return "saaremaa";
  if (word.startsWith("kohtla")) return "kohtla";
  // English and colloquial keyword variety: these map onto existing domain
  // roots so their queryRootVariants need no changes.
  if (word.startsWith("pesticid")) return "pestitsiid";
  if (word.startsWith("pinnas")) return "muld";
  if (multilingual && (word === "soil" || word === "soils")) return "muld";
  if (word.startsWith("polismets")) return "mets";
  if (multilingual && (word === "bog" || word === "bogs")) return "margala";
  if (word.startsWith("uputus")) return "uleujutusrisk";
  if (word.startsWith("loodusvaatlus") || word.startsWith("liigivaatlus")) return "loodusvaatlus";
  if (multilingual && word.startsWith("contamin")) return "saaste";
  if (multilingual && word.startsWith("protect")) return "kaitse";
  if (multilingual && (word === "level" || word === "levels")) return "maar";
  if (word.startsWith("tuulik")) return "tuulepark";
  if (multilingual && (word === "fish" || word === "fishes" || word === "fishing")) return "kala";
  if (multilingual && word.startsWith("hazard")) return "ohtlik";
  if (multilingual && (word.startsWith("emission") || word === "ghg")) return "kasvuhoonegaas";
  if (word.startsWith("murg")) return "ohtlik";
  if (word.startsWith("suplemis")) return "suplusvesi";
  if (multilingual && word === "bathing") return "suplusvesi";
  if (multilingual && word.startsWith("landfill")) return "jaatmekaitluskoht";
  if (word.startsWith("maapou")) return "kaevandus";
  if (word.startsWith("vanarehv")) return "rehv";
  if (multilingual && (word === "apply" || word === "applies" || word === "applied" || word === "applying")) return "taotlemine";
  if (word.endsWith("maal") && word.length >= 7) return word.slice(0, -1);
  return word;
}
// Russian environment keywords mapped onto existing Estonian domain roots.
// The second element may be null to silently drop a token (e.g. Эстония).
const RUSSIAN_KEYWORD_ROOTS = Object.freeze([
  ["лес", "mets"],
  ["леса", "mets"],
  ["вода", "vesi"],
  ["воды", "vesi"],
  ["воздух", "ohk"],
  // Homoglyph note: canonicalSecurityText folds Cyrillic т→t but leaves
  // и/у/с intact, so patterns match the RAW query. 'сортировка' must pair
  // with an explicit waste word — bare sorting verbs (incl. folded Latin
  // lookalikes) stay out-of-scope so JS-sort attacks keep failing closed.
  ["мусор", "jaat"],
  ["мусора", "jaat"],
  ["мусором", "jaat"],
  ["мусоре", "jaat"],
  ["отходы", "jaat"],
  ["отходов", "jaat"],
  ["отходами", "jaat"],
  ["отходах", "jaat"],
  ["загрязнение", "saaste"],
  ["загрязнения", "saaste"],
  ["климат", "kliima"],
  ["природа", "elurikkus"],
  ["озеро", "jarv"],
  ["озера", "jarv"],
  ["река", "jogi"],
  ["реки", "jogi"],
  ["море", "meri"],
  ["рыба", "kala"],
  ["шум", "mura"],
  ["почва", "muld"],
  ["площадь", "pindala"],
  ["подземные", "pohjavesi"],
  ["подземных", "pohjavesi"],
  ["грунтовые", "pohjavesi"],
  ["грунтовых", "pohjavesi"],
  ["заповедник", "kaitseala"],
  ["заповедника", "kaitseala"],
  ["заповеднике", "kaitseala"],
  ["охраняемая", "kaitseala"],
  ["охраняемой", "kaitseala"],
  ["заказник", "looduskaitse"],
  ["заказника", "looduskaitse"],
  ["выбросы", "heide"],
  ["выбросов", "heide"],
  ["парниковые", "kasvuhoonegaas"],
  ["парниковых", "kasvuhoonegaas"],
  ["переработка", "ringmajandus"],
  ["переработки", "ringmajandus"],
  ["упаковка", "jaat"],
  ["упаковки", "jaat"],
  ["эстония", null],
  ["эстонии", null],
  ["сортировка", "sorteerimine"],
  ["сортировать", "sorteerimine"],
  ["сортировки", "sorteerimine"],
]);

// Russian keyword bridge. Cyrillic tokens are stripped by normalize() and
// homoglyph-folded by canonicalSecurityText(), so Russian queries would
// otherwise always come back empty. These map onto existing domain roots;
// queries without a listed keyword are unaffected. Privacy gates run on the
// raw/cleaned text independently of roots, so this cannot unblock
// personal-data or instruction attacks (they contain no listed keyword).
const CYRILLIC_FOLD = Object.freeze({
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0445": "x", "\u0456": "i",
  "\u0458": "j", "\u043a": "k", "\u0442": "t", "\u0501": "d", "\u0585": "o",
});
const RUSSIAN_KEYWORD_PATTERNS = Object.freeze(RUSSIAN_KEYWORD_ROOTS.map(([keyword, root]) => {
  const folded = keyword.replace(/[аеорсхіјктԁօ]/giu, (letter) => CYRILLIC_FOLD[letter.toLocaleLowerCase("ru")] ?? letter);
  const edge = "(?<![\\p{L}\\p{N}_])";
  const trailing = "(?![\\p{L}\\p{N}_])";
  return {
    root,
    raw: new RegExp(`${edge}${keyword}${trailing}`, "u"),
    folded: folded === keyword ? null : new RegExp(`${edge}${folded}${trailing}`, "u"),
  };
}));

export function russianKeywordRoots(text) {
  if (!isMultilingualSearchEnabled()) return [];
  const lowered = String(text ?? "").toLocaleLowerCase("ru");
  const found = [];
  for (const { root, raw, folded } of RUSSIAN_KEYWORD_PATTERNS) {
    // NB: \b is ASCII-only and never matches around Cyrillic, so Unicode
    // letter boundaries are used instead.
    if (root !== null && !found.includes(root)
      && (raw.test(lowered) || (folded !== null && folded.test(lowered)))) found.push(root);
  }
  return found;
}

// Translate Russian-bridge roots into Estonian discovery terms so
// foreign-script queries can use the Estonian-only discovery providers.
// Only domain roots translate; an empty result means no safe translation.
export function bridgeTermsToDiscoveryQuery(roots = []) {
  const terms = [];
  for (const root of roots) {
    if (root === 'jaat') terms.push('jäätmed');
    else if (root === 'sorteerimine') terms.push('sorteerimine');
    else if (root === 'mets') terms.push('mets');
    else if (root === 'vesi') terms.push('vesi');
    else if (root === 'ohk') terms.push('õhukvaliteet');
    else if (root === 'saaste') terms.push('saaste');
    else if (root === 'kliima') terms.push('kliima');
    else if (root === 'elurikkus') terms.push('elurikkus');
    else if (root === 'jarv') terms.push('järv');
    else if (root === 'jogi') terms.push('jõgi');
    else if (root === 'meri') terms.push('meri');
    else if (root === 'kala') terms.push('kala');
    else if (root === 'mura') terms.push('müra');
    else if (root === 'muld') terms.push('muld');
    else if (root === 'pindala') terms.push('pindala');
    else if (root === 'pohjavesi') terms.push('põhjavesi');
    else if (root === 'kaitseala') terms.push('kaitseala');
    else if (root === 'looduskaitse') terms.push('looduskaitse');
    else if (root === 'heide') terms.push('heide');
    else if (root === 'kasvuhoonegaas') terms.push('kasvuhoonegaasid');
    else if (root === 'ringmajandus') terms.push('ringmajandus');
  }
  return [...new Set(terms)].slice(0, 4).join(' ');
}
const WILDLIFE_SPECIES_ROOTS = Object.freeze([
  [/^(?:poder|podr|potr)\p{L}*$/u, "poder"],
  [/^ilves\p{L}*$/u, "ilves"],
  [/^karu(?!put)\p{L}*$/u, "karu"],
  [/^hun(?:t|d)\p{L}*$/u, "hunt"],
  [/^(?:punahirv|hirv)\p{L}*$/u, "hirv"],
  [/^metskit\p{L}*$/u, "metskits"],
  [/^(?:metssiga|metssea|metssigu|metssiku)\p{L}*$/u, "metssiga"],
]);

function isForestDepletionQuestion(value) {
  const text = normalize(String(value || "").normalize("NFKC"));
  if (/\b(?:roni\w*|matk\w*|majakivi|randrahn\w*|kivi\w*|mae\w*)\b/u.test(text)) return false;
  const forest = "(?:eesti\\s+)?mets(?:a|ad|ade|as|ast|aga|amaal|amaa)?";
  const modal = "(?:saab|saavad|voib|voivad|voiks|voiksid)";
  const disappearing = "(?:kaob|kaovad|kadumas|kaduda|havib|havivad|havimas|havida|loppeb|lopevad|loppeda)";
  const bareShortQuestion = /^mets\w*\s+otsa$/u.test(text)
    || /^kas\s+mets\w*\s+otsa$/u.test(text);
  return bareShortQuestion || new RegExp(`(?:\\b${forest}(?:\\s+\\w+){0,3}\\s+${modal}(?:\\s+\\w+){0,3}\\s+otsa(?:\\s+saada)?\\b|\\b${forest}(?:\\s+\\w+){0,3}\\s+otsa\\s+${modal}\\b|\\b${modal}\\s+${forest}(?:\\s+\\w+){0,3}\\s+otsa(?:\\s+saada)?\\b|\\b${modal}\\s+eestis\\s+${forest}(?:\\s+\\w+){0,3}\\s+otsa(?:\\s+saada)?\\b|\\b${forest}(?:\\s+\\w+){0,3}\\s+(?:on\\s+)?(?:ara\\s+)?${disappearing}\\b|\\b${forest}(?:\\s+\\w+){0,3}\\s+${modal}(?:\\s+\\w+){0,3}\\s+(?:ara\\s+)?${disappearing}\\b|\\b(?:metsa|metsade)\\s+(?:kadum|havim)\\w*\\b|\\b(?:enam|varsti)\\s+(?:\\w+\\s+){0,2}metsa\\s+(?:ei\\s+ole|pole)\\b)`, "u").test(text);
}

export function queryTerms(query) {
  const normalizedQuery = normalize(query);
  const multilingualPhrases = isMultilingualSearchEnabled();
  // Modals are filler for discovery queries but carry the permission intent
  // of "kas … võib …" questions. Keep them out of the token stream and add
  // the semantic root explicitly.
  const permissionRoots = /\b(?:voib|voivad|voiks|voiksid)\b/u.test(normalizedQuery) ? ["lubatavus"] : [];
  const permitIntent = /\btaotl/u.test(normalizedQuery)
    && /\b(?:eraldis|raie|metsateatis)\w*/u.test(normalizedQuery);
  const permitRoots = permitIntent ? ["metsateatis", "esitamine", "mets"] : [];
  const savingRoots = /sääst\w*/iu.test(String(query || "")) && /\b(?:vett|vesi|energiat|elektrit)\b/iu.test(String(query || ""))
    ? ["vesi", "saastmine"]
    : [];
  const termRoots = normalizedQuery
    .split(/\s+/u)
    .filter((word) => (word.length >= 3 || word === "uv") && !STOP_WORDS.has(word) && !/^\d+$/u.test(word))
    .flatMap((word) => {
      if (savingRoots.length && word.startsWith("saasta")) return [];
      if (word.startsWith("keskkonnainfo")) return ["keskkond"];
      if (word.startsWith("eraldis")) return "eraldis";
      if (word.startsWith("pohjaveevot")) return ["pohjavesi", "veevott"];
      if ((word === "roheline" || word === "rohelise" || word === "rohelist" || word === "taristu")
        && /\brohel(?:ine|ise|ist)\s+taristu\b/u.test(normalizedQuery)) return ["rohevorgustik"];
      if (word.startsWith("kulmkapp") || word.startsWith("kulmik") || word.startsWith("kulmutus")) {
        return ["jaat", "jaatmekaitluskoht", "kulmkapp", "kylmik"];
      }
      if (word.startsWith("saask") || word.startsWith("mosquito")) return ["putukas", "saask"];
      if (word === "soo" || /^(?:soid|soode|soos|soost|sooga)$/u.test(word)) return "margala";
      if (word.startsWith("soostik")) return "margala";
      if (word.startsWith("rohepoore")) return "rohepoore";
      if (word.startsWith("keskkonnaandm")) return "keskkonnaandmed";
      if (word.startsWith("kuumalaine")) return "kuumalaine";
      if (word.startsWith("arvuti") || word.startsWith("sulearvuti")) return ["jaat", "jaatmekaitluskoht", "arvuti"];
      // A named game species stays a term of its own, so a passage about
      // that species outranks the report's general summary.
      const species = WILDLIFE_SPECIES_ROOTS.find(([pattern]) => pattern.test(word));
      if (species) return ["uluk", species[1]];
      // Tree-species and conifer questions keep their subject next to "mets".
      if (/^(?:enamus)?puuli(?:ik|ig)\p{L}*$/u.test(word)) return ["mets", "puuliik"];
      if (/^okaspuu\p{L}*$/u.test(word)) return ["mets", "okaspuu"];
      // "Kui palju põtru elab Eestis?" asks for a population count.
      if (/^(?:elab|elavad|elutseb|elutsevad)$/u.test(word)
        && /\b(?:kui\s+palju|mitu)\b/u.test(normalizedQuery)) return ["arvukus"];
      if (multilingualPhrases && word.startsWith("nesting")) return ["elupaik"];
      if ((word.startsWith("press") || word.startsWith("contact"))
        && /\bofficial\s+press\s+contact\b[\s\S]{0,60}\bprivate\s+contact\b/u.test(normalizedQuery)) {
        return ["keskkond"];
      }
      if (/\bbioloog(?:i|l)\w*\s+mitmekesis\w*\b/u.test(normalizedQuery)
        && (/^bioloog(?:i|l)\w*$/u.test(word) || /^mitmekesis\w*$/u.test(word))) return [];
      if (word.startsWith("sorteer")
        && /\b(?:jaat\w*|prugi\w*|pakend\w*|biojaat\w*)\b/u.test(normalizedQuery)) {
        // A waste-sorting question names the method explicitly: carry both
        // roots so the reviewed sorting guide can answer. Bare "jäätmete
        // sorteerimine" is now answerable too (guide exists); unrelated
        // "sorteerimis-" compounds without waste words stay out (below).
        return ["jaat", "sorteerimine"];
      }
      if ((multilingualPhrases && (word === "sorting" || word === "sort"))
        && /\b(?:jaat\w*|prugi\w*|pakend\w*|biojaat\w*|waste|garbage|trash|rubbish)\b/u.test(normalizedQuery)) return ["jaat"];
      if (((multilingualPhrases && (word === "home" || word === "household")) || word.startsWith("kodus") || word.startsWith("kodune"))
        && /\b(?:jaat\w*|prugi\w*|pakend\w*|biojaat\w*|waste|garbage|trash|rubbish|sorteer\w*|sorting)\b/u.test(normalizedQuery)) return ["jaat", "kodus"];
      if (word.startsWith("ilmaprognoos")) return ["ilm", "prognoos"];
      if (word.startsWith("uleujutusrisk") || word.startsWith("uleujutusala") || word.startsWith("uleujutuskaart")) {
        return ["vesi", "uleujutusrisk"];
      }
      if (word.startsWith("tormihoiatus")
        || word.startsWith("aike")
        || word.startsWith("libed")
        || word.startsWith("tuleoh")
        || word.startsWith("uleujutushoiatus")) return ["ilm", "hoiatus"];
      if (word.startsWith("fire-danger")
        || word.startsWith("fire-risk")
        || (multilingualPhrases && word === "fire" && /\bfire(?:[-\s]+)(?:danger|risk)\b/u.test(normalizedQuery))) {
        return ["ilm", "hoiatus"];
      }
      if (word.startsWith("sajab") || word.startsWith("vihm") || (multilingualPhrases && (word === "rain" || word.startsWith("rainfall")))) {
        return ["ilm", "sademed"];
      }
      if (word.startsWith("vooluhulk") || word.startsWith("veetas") || word.startsWith("veetemperatuur")) {
        return ["vesi", "mootmine"];
      }
      if (word.startsWith("aku") && normalizedQuery.includes("elektriauto")
        && !/\b(?:jaat\w*|viia|utiliseer\w*|ringlusse\w*|katki|vana)\b/u.test(normalizedQuery)) return ["aku"];
      if (word.startsWith("metsateatis") || word.startsWith("raieteatis")) return ["mets", "metsateatis"];
      if (word.startsWith("loataotl")) return ["keskkonnaluba", "taotlemine"];
      if ((word === "luba" || word.startsWith("loa"))
        && /\b(?:puurkaev\w*|puurauk\w*|salvkaev\w*|tiik\w*|tiig\w*|jarv\w*)\b/u.test(normalizedQuery)) {
        return ["lubatavus"];
      }
      if (word.startsWith("sihtkaitsevoond")) return ["kaitseala", "piirang"];
      if (word.startsWith("gaas") && normalizedQuery.includes("kasvuhoone gaas")) return ["kasvuhoonegaas"];
      if (word.startsWith("polevkivikaevand")) return ["polevkivi", "kaevandus"];
      if (word.startsWith("metsastat")) return [topicRoot(word), "statistika"];
      // The state forest manager is a named actor, not a synonym for "mets":
      // keep both roots so "mida teeb RMK" can reach RMK pages while forest
      // statistics questions still rank SMI material.
      if (word === "rmk") return ["rmk", "mets"];
      if (word.startsWith("metsaandm") || word.startsWith("metsandusandm")) return ["mets", "andmed"];
      if (word.startsWith("metsaregis")) return ["mets", "metsaregister"];
      if (word.startsWith("kliimastsenaarium")) return ["kliima", "stsenaarium"];
      if (word.startsWith("mereprug")) return ["meri", "mereprugi"];
      if (word.startsWith("asbestijaat")) return ["asbest", "jaat"];
      if (word.startsWith("kaevandamisjaat")) return ["kaevandus", "jaat", "kaevandamisjaatmed"];
      if (word.startsWith("paikesepaneelijaat")) return ["paikesepaneel", "jaat"];
      if (word.startsWith("suplusveekvalite")) return ["suplusvesi", "seisund"];
      if (word.startsWith("ohusaast")) return ["ohk", "saaste"];
      if (word === "kmh" || word === "ksh") return [word, "keskkonnamoju"];
      if (word.startsWith("pm2")) return ["pm25", "ohukvaliteet"];
      if (word.startsWith("pm10")) return ["pm10", "ohukvaliteet"];
      return [topicRoot(word)];
    });
  const roots = [...new Set([...permitRoots, ...permissionRoots, ...savingRoots,
    ...termRoots.filter((root) => !(permitIntent && ["taotlemine", "eraldis", "raie"].includes(root)))])];
  const phraseRoots = [];
  if (multilingualPhrases && /\bair\s+quality\b/u.test(normalizedQuery)) phraseRoots.push("ohukvaliteet");
  if (multilingualPhrases && /\bwater\s+quality\b/u.test(normalizedQuery)) phraseRoots.push("vesi", "seisund");
  if (multilingualPhrases && /\benvironmental\s+data\b/u.test(normalizedQuery)) phraseRoots.push("keskkond", "andmed", "api");
  if (/\bbioloog(?:i|l)\w*\s+mitmekesis\w*\b/u.test(normalizedQuery)) phraseRoots.push("elurikkus");
  if (/\bpunane\s+raamat\b/u.test(normalizedQuery)) phraseRoots.push("liik");
  if (/\bpm\s+2\s+5\b/u.test(normalizedQuery)) phraseRoots.push("pm25", "ohukvaliteet");
  if (multilingualPhrases && /\bforest\s+area\b/u.test(normalizedQuery)) phraseRoots.push("mets", "pindala");
  if (multilingualPhrases && /\benvironmental\s+permits?\b/u.test(normalizedQuery)) phraseRoots.push("keskkonnaluba");
  if (multilingualPhrases && /\benvironmental\s+(?:impact|impacts|effect|effects)\b/u.test(normalizedQuery)) phraseRoots.push("keskkonnamoju");
  if (multilingualPhrases && /\bcircular[-\s]+economy\b/u.test(normalizedQuery)) phraseRoots.push("ringmajandus");
  if (multilingualPhrases && /\bgreen[-\s]+infrastructure\b/u.test(normalizedQuery)) phraseRoots.push("rohevorgustik");
  if (/\b(?:(?:official|public)\s+)?press\s+contact\b[\s\S]{0,50}\bpublic\s+(?:service\s+)?catalogue\b/u.test(normalizedQuery)) {
    phraseRoots.push("keskkond");
  }
  if (/\bofficial\s+(?:information|press)\s+channel\b[\s\S]{0,50}\bpersonal\s+contact\b/u.test(normalizedQuery)
    || /\bcontact\s+roles?\b[\s\S]{0,50}\b(?:agency|institutional|environmental)\s+(?:service\s+)?catalogue\b/u.test(normalizedQuery)
    || /\b(?:agency|institutional|environmental)\s+(?:service\s+)?catalogue\b[\s\S]{0,50}\bcontact\s+roles?\b/u.test(normalizedQuery)
    || /\bkontaktroll\w*\b[\s\S]{0,50}\b(?:asutus\w*\s+)?teenusekataloog\w*\b/u.test(normalizedQuery)) {
    phraseRoots.push("keskkond");
  }
  if (/\b(?:(?:\d+|one|two)[-\s]+kilomet(?:re|er)|\d+\s*km)\s+grid\b[\s\S]{0,50}\b(?:exact\s+)?coordinates?\b/u.test(normalizedQuery)) {
    phraseRoots.push("kaart");
  }
  if (/\b(?:agency|authority|institution)\b[\s\S]{0,100}\b(?:policy|guidance|rules?)\b[\s\S]{0,60}\b(?:rounding|generali[sz]ing)\b[\s\S]{0,30}\bcoordinates?\b/u.test(normalizedQuery)
    || /\b(?:asutus|amet|institutsioon)\w*\b[\s\S]{0,100}\bkoordinaat\w*\b[\s\S]{0,60}\b(?:ümarda|umarda|üldista|uldista)\w*\b[\s\S]{0,40}\b(?:põhimõt|pohimot|reegl|juhis)\w*\b/u.test(normalizedQuery)) {
    phraseRoots.push("kaart", "keskkond");
  }
  if (/\b(?:agency\s+)?contact\s+roles?\b[\s\S]{0,60}\b(?:agency\s+)?service\s+catalogue\b/u.test(normalizedQuery)
    || /\bpublic\s+contact\s+(?:channel|role)\b[\s\S]{0,60}\bmonitoring\s+data\b/u.test(normalizedQuery)) {
    phraseRoots.push("keskkond");
  }
  if (/\b(?:duties|rules|rights|obligations|requirements|qualifications|permissions)\b[\s\S]{0,120}\b(?:well|borehole|forest|woodland|land|property|parcel)\b/u.test(normalizedQuery)) {
    phraseRoots.push("keskkond");
  }
  if (/\b(?:agency|authority|board|institutional|institution|ministry|public)\b[\s\S]{0,80}\b(?:contact|mailbox|postal\s+address|phone|representative)\b/u.test(normalizedQuery)
    || /\b(?:asutus|riigiasutus|avalik)\w*\b[\s\S]{0,80}\b(?:kontakt|(?:üld|uld|yld)?postkast|postiaadress|telefon|esindaja)\w*\b/u.test(normalizedQuery)) {
    phraseRoots.push("keskkond");
  }
  if (/\b(?:monitoring|hydrology)\s+coordinates?\b[\s\S]{0,50}\bgrid\b/u.test(normalizedQuery)) {
    phraseRoots.push("kaart", "seire");
  }
  if (/\bpressiosakon\w*\b[\s\S]{0,50}\b(?:(?:ühine|uhine|üldine|uldine|yldine)\s+|(?:üld|uld|yld))postkast\w*\b/u.test(normalizedQuery)) {
    phraseRoots.push("keskkond");
  }
  if (/\b(?:meteorological|meteorology)\s+service\b[\s\S]{0,50}\b(?:general\s+)?(?:phone|contact)\b/u.test(normalizedQuery)
    || /\b(?:general\s+)?(?:phone|contact)\b[\s\S]{0,50}\b(?:meteorological|meteorology)\s+service\b/u.test(normalizedQuery)
    || /\b(?:meteoroloogia|ilmajaama)\s+teenus\w*\b[\s\S]{0,50}\b(?:üldis\w*\s+)?(?:telefon|kontakt)\w*\b/u.test(normalizedQuery)) {
    phraseRoots.push("ilm");
  }
  if (/\bland\s+use\b/u.test(normalizedQuery)
    && /\b(?:policy|policies|impact|impacts|effect|effects)\b/u.test(normalizedQuery)) phraseRoots.push("keskkonnamoju");
  if (/\b(?:impact|impacts|effect|effects)\b/u.test(normalizedQuery)
    && /\b(?:adjacent|adjoining|neighbor(?:ing)?|neighbour(?:ing)?)\s+land\b/u.test(normalizedQuery)
    && /\b(?:stream|creek|river|lake|water)\b/u.test(normalizedQuery)) {
    phraseRoots.push("keskkonnamoju", "jogi");
  }
  if (/\b(?:state(?:\s+owned)?|public(?:ly\s+owned|\s+owned)?|national|municipal(?:ly\s+owned)?|government(?:\s+owned)?|city\s+owned|county\s+owned|federal)\s+(?:forest|woodland|land|property|estate|parcel|plot|lot|farm|well|borehole|building|dwelling)s?\b/u.test(normalizedQuery)) {
    phraseRoots.push("kataster");
  }
  if (multilingualPhrases && /\bwind\s+farm\b/u.test(normalizedQuery)) phraseRoots.push("tuulepark");
  if (multilingualPhrases && (/\boil\s+shale\b/u.test(normalizedQuery)
    || /\bshale\s+oil\b/u.test(normalizedQuery))) phraseRoots.push("polevkivi", "kaevandus");
  if (multilingualPhrases && /\b(?:river|water)\s+levels?\b/u.test(normalizedQuery)) phraseRoots.push("veetase");
  if (multilingualPhrases && /\bprotected\s+areas?\b/u.test(normalizedQuery)) phraseRoots.push("kaitseala");
  if (multilingualPhrases && /\bmarine\s+litter\b/u.test(normalizedQuery)) phraseRoots.push("mereprugi");
  if (multilingualPhrases && /\bclimate\s+change\b/u.test(normalizedQuery)) phraseRoots.push("kliima");
  if (multilingualPhrases && /\bforest\s+data\s+(?:map|maps|mapping)\b/u.test(normalizedQuery)) phraseRoots.push("ruumikiht");
  if (/\bmetsa\w*\s+andm\w*\s+kaart\w*\b/u.test(normalizedQuery)) phraseRoots.push("ruumikiht");
  if (multilingualPhrases && /\bbiodiversity\s+(?:observation\w*\s+)?database\b/u.test(normalizedQuery)) phraseRoots.push("loodusvaatlus");
  if (multilingualPhrases && (/\bspecies\s+observations?\b/u.test(normalizedQuery)
    || /\bnature\s+observations?\b/u.test(normalizedQuery))) phraseRoots.push("loodusvaatlus");
  if (/\bemaj(?:og|oe)\w*\b/u.test(normalizedQuery)
    && /\bavalik\w*\s+kasutus\w*\b/u.test(normalizedQuery)) phraseRoots.push("vesi");
  if (roots.includes("stsenaarium") && roots.includes("sademed")) phraseRoots.push("kliima");
  let expandedRoots = [...new Set([...roots, ...phraseRoots])];
  // An explicit waste-sorting intent already carries the "jaat" root; the
  // incidental "prugi" root would otherwise let marine-litter pages outrank
  // the waste guide on coverage. Single-word "prügi" queries are unaffected.
  if (expandedRoots.includes("jaat") && expandedRoots.includes("prugi")
    && /\bsorteer\w*/u.test(normalizedQuery)) {
    expandedRoots = expandedRoots.filter((root) => root !== "prugi");
  }
  for (const root of russianKeywordRoots(query)) {
    if (!expandedRoots.includes(root)) expandedRoots.push(root);
  }
  if (!isForestDepletionQuestion(normalizedQuery)) return expandedRoots;
  // "Otsa" is an idiomatic depletion predicate here, not a useful literal
  // retrieval token. Mapping it to the concept prevents climbing/trail pages
  // such as "Majakivi otsa ronima" from receiving full query coverage.
  return ["mets", "kadumine"];
}

// Estonian inflection is suffix-heavy and the reviewed root registry cannot
// enumerate every noun a user may type. For otherwise unknown roots, try a
// bounded suffix strip so "puidutööstusele" still reaches "puidutööstus" and
// "väikesele" reaches "väike". Stems shorter than five characters are never
// produced, which keeps accidental substring matches out of retrieval.
const ESTONIAN_CASE_SUFFIXES = Object.freeze([
  "sele", "ssele", "le", "lt", "st", "ks", "ni", "ga", "ta", "na", "se", "te", "de",
  "s", "t", "d", "e", "a", "u", "i", "l", "n",
]);

function estonianInflectionVariants(root) {
  // Short roots are too ambiguous: stripping "se" from "veetase" would make
  // "veetarbimine" look like a water-level match. Only long, likely compound
  // nouns get the bounded inflection expansion.
  if (String(root).length < 8) return [root];
  // Verbs and participle forms do not need noun-case expansion; broadening
  // "avaldatakse" to "avaldatud" changes ranking between equally official
  // sources without improving the question match.
  if (/(?:takse|tud|nud|da|ma|b|vad)$/u.test(root)) return [root];
  if (!variantsCache.has(root)) variantsCache.set(root, buildInflectionVariants(root));
  return variantsCache.get(root);
}

const variantsCache = new Map();

function buildInflectionVariants(root) {
  const variants = new Set([root]);
  const pending = [root];
  for (let depth = 0; depth < 4; depth += 1) {
    for (const word of [...pending]) {
      for (const suffix of ESTONIAN_CASE_SUFFIXES) {
        if (!word.endsWith(suffix)) continue;
        const stem = word.slice(0, -suffix.length);
        if (stem.length < 5 || variants.has(stem)) continue;
        variants.add(stem);
        pending.push(stem);
      }
    }
  }
  return [...variants];
}

export function queryRootVariants(root) {
  const subjectVariants = specialistSubjectVariants(root);
  if (subjectVariants) return subjectVariants;
  if (root === "mets") return ["mets", "forest", "woodland"];
  if (root === "kala") return ["kala", "kalast", "fish"];
  if (root === "ranne") return ["ranne", "rände", "migration"];
  if (root === "ilm") return ["ilm", "weather"];
  if (root === "prognoos") return ["prognoos", "forecast"];
  if (root === "ohk") return ["ohk", "air"];
  if (root === "temperatuur") return ["temperatuur", "temperature"];
  if (root === "jogi") return ["jogi", "joe", "river"];
  if (root === "jarv") return ["jarv", "tiik", "pond", "lake"];
  if (root === "elurikkus") return ["elurikk", "biodiversity"];
  if (root === "seire") return ["seire", "monitor", "observation"];
  if (root === "register") return ["register", "database"];
  if (root === "mura") return ["mura", "noise"];
  if (root === "kiirgus") return ["kiirgus", "radiation"];
  if (root === "kliima") return ["kliima", "climate"];
  if (root === "keskkonnaluba") return [
    "keskkonnalub", "keskkonnaloa", "keskkonnakaitsel", "environmental permit", "permit",
  ];
  if (root === "rehv") return ["rehv", "tyre", "tire"];
  if (root === "saaste") return ["saaste", "pollution"];
  if (root === "raie") return ["rai"];
  // The law's word for what a reader asks in another form of the same word.
  if (root === "puhtaks") return ["puhtaks", "puhast"];
  if (root === "vaikeseks") return ["vaikese", "vaiksem", "väiksem", "vahem", "vähem"];
  if (root === "korge") return ["korge", "korgus"];
  if (root === "koort" || root === "koorinud") return ["koor"];
  if (root === "kupsusdiameeter") return ["kupsusdiameet", "rinnasdiameet"];
  // "paar puud maha võtta" is answered in timber volume ("20 tihumeetrit puitu").
  if (root === "puud") return ["puud", "puit", "puidu", "puu"];
  // SMI states the total growing stock as "kasvava metsa tagavara".
  if (root === "kogutagavara") return ["kogutagavara", "tagavara"];
  if (root === "keskmiselt") return ["keskmiselt", "keskmine", "keskmise"];
  // Who a forest "belongs to" is its ownership form.
  if (root === "kuulub") return ["kuulu", "omand", "omani"];
  if (root === "uuenemata" || root === "uuendamata") return ["uuenem", "uuenen", "uuendam", "uuendat"];
  if (root === "juurdekasv") return ["juurdekasv", "netojuurdekasv"];
  if (root === "uletamine") return ["ulet", "suurem", "rohkem"];
  if (root === "noor") return ["noor", "vanus", "vanuse", "vanem", "keskeal"];
  if (root === "vanus") return ["vanus", "vana", "noor", "keskeal"];
  if (root === "muutus") return ["muut", "trend", "suuren", "vahen", "kahan", "lang", "pusi"];
  if (root === "kasv") return ["kasv", "suuren"];
  if (root === "vaiksem") return ["vaiksem", "väiksem", "vahem", "vähem"];
  if (root === "kasvuhoonegaas") return ["kasvuhoonegaas", "khg"];
  if (root === "kaevandus") return ["kaevand"];
  if (root === "heide") return ["heide", "heit"];
  if (root === "ringlussevott") return ["ringlussevot", "taaskasut"];
  if (root === "ringmajandus") return ["ringmajandus", "circular economy", "circularity"];
  if (root === "lubatavus") return ["ei tohi", "tohib", "võib", "lubat", "keelat"];
  if (root === "elutsukkel") return ["elutsuk"];
  if (root === "aku") return ["aku", "battery"];
  if (root === "uleujutusrisk") return ["uleujutusrisk", "uleujutusala", "uleujutuskaart", "riskistsenaarium"];
  if (root === "joogivesi") return ["joogivesi", "joogivee", "kraanivesi", "kraanivee"];
  if (root === "maar") return ["maar", "osakaal", "protsent", "tase"];
  if (root === "taotlemine") return ["taotl", "taotle"];
  if (root === "ettevote") return ["ettevot"];
  if (root === "ehitamine") return ["ehit"];
  if (root === "seisund") return ["seisund", "hinnang", "klass"];
  if (root === "hindamine") return ["hinnat", "hinda"];
  if (root === "keskkonnamoju") return ["keskkonnamoj", "keskkonna moju", "moju keskkonn", "keskkonnahairing"];
  if (root === "laanemeri") return ["laanemer", "läänemer", "baltic sea"];
  if (root === "meri") return ["meri", "mere", "sea", "ocean", "marine"];
  if (root === "mereprugi") return ["mereprugi", "mere prugi", "mikroprugi", "makroprugi"];
  if (root === "sademed") return ["sadem", "saju", "sajab", "vihm", "precipitation", "rainfall"];
  if (root === "hoiatus") return ["hoiatus", "tuleoht", "libed", "aike", "uleujutus"];
  if (root === "pohjavesi") return ["pohjave", "groundwater"];
  if (root === "vesi") return ["vesi", "vee", "veek", "hudro"];
  if (root === "suplusvesi") return ["suplusve", "supluskoh", "rannave"];
  if (root === "reovesi") return ["reove", "heitve"];
  if (root === "kohtkaitlus") return ["kohtkait", "vaikepuhast", "omapuhast", "kogumismahut"];
  if (root === "pestitsiid") return ["pestitsiid", "taimekaitsevah"];
  if (root === "nitraat") return ["nitraat", "no3"];
  if (root === "emajogi") return ["emajog", "emajoe"];
  if (root === "ajalooline") return ["ajalool", "historical", "historic"];
  if (root === "mootmine") return ["mootm", "tulemus"];
  if (root === "harjumaa") return ["harjumaa", "harju"];
  if (root === "liik") return ["liik", "liig", "species"];
  // Questions fold hoiuala, püsielupaik and the zones into this root, so a law
  // text naming the specific kind still counts; the answer check then makes sure
  // it is the same kind the question named.
  if (root === "kaitseala") return ["kaitseal", "protected area", "hoiual", "pusielupai", "sihtkaitsevoond", "piiranguvoond", "loodusreservaa", "rahvuspar"];
  if (root === "elupaik") return ["elupaik", "elupaig", "habitat"];
  if (root === "statistika") return ["statist", "smi", "inventuur", "pxweb"];
  if (root === "tulemus") return ["tulemus"];
  if (root === "tulevik") return ["tulevik", "prognoos", "lahiaast"];
  if (root === "kadumine") return ["kadum", "kaob", "kaovad", "havim", "havib", "havivad", "otsa saam", "enam metsa pole"];
  if (root === "andmed") return ["andme", "avaand", "data"];
  if (root === "keskkonnaandmed") return ["keskkonnaandm", "avaand", "andme"];
  if (root === "eelis") return ["eelis", "eelise", "looduse infosusteem"];
  if (root === "rohepoore") return ["rohepoore", "rohepoore", "green transition"];
  if (root === "metaandmed") return ["metaandm", "andmekirjeld", "andmestiku kirjeld"];
  if (root === "api") return ["api", "openapi", "clidata", "pxweb"];
  if (root === "metsaregister") return ["metsaregis", "metsaressursi arvestuse"];
  if (root === "avaandmed") return ["avaand"];
  if (root === "allalaadimine") return ["allalaad", "alalaad", "alla laad"];
  if (root === "kasutusjuhend") return ["kasutusjuh", "juhend"];
  if (root === "kaart") return ["kaart", "kaard", "map"];
  if (root === "ruumikiht") return ["ruumikiht", "ruumiandm", "wms", "wfs", "geojson", "qgis"];
  if (root === "stsenaarium") return ["stsenaarium", "scenario"];
  if (root === "loodusvaatlus") return ["loodusvaatlus", "liigivaatlus", "vaatlusandm"];
  if (root === "eutrofeerumine") return ["eutrofeer", "vetikaoit", "vetikate oit", "algal bloom"];
  if (root === "polevkivi") return ["polevkivi", "polevkivibassein"];
  if (root === "ohukvaliteet") return ["ohukvaliteet", "ohu kvaliteet", "valisoh"];
  if (root === "jaat") return ["jaat", "prugi", "waste"];
  // NOTE: 'liigiti' is deliberately NOT a variant: it is a free Estonian
  // adverb ('liigiti võib ... erineda') that collides with unrelated pages
  // (e.g. invasive-species guidance). Sorting intent matches the verb stem
  // and the household-waste compounds below.
  if (root === "sorteerimine") return ["sorteer", "sortimine", "sorting", "jaatmete liigiti kogumine"];
  if (root === "asbest") return ["asbest", "eterniit"];
  if (root === "biojaatmed") return ["biojaat", "kompost"];
  if (root === "plastijaatmed") return ["plastijaat"];
  if (root === "radoon") return ["radoon"];
  if (root === "uvkiirgus") return ["uv kiirgus", "uv indeks", "ultraviolett"];
  if (root === "radioaktiivne") return ["radioaktiiv"];
  if (root === "radionukliid") return ["radionukliid", "norm materjal"];
  if (root === "sisekliima") return ["sisekliim"];
  if (root === "hallitus") return ["hallitus"];
  if (root === "niiskus") return ["niiskus", "liigniisk", "ohuniisk"];
  if (root === "kemikaal") return ["kemikaal"];
  if (root === "ohutuskaart") return ["ohutuskaart", "sds"];
  if (root === "biotsiid") return ["biotsiid"];
  if (root === "tolmeldaja") return ["tolmeld", "kimal"];
  if (root === "mikroplast") return ["mikroplast"];
  if (root === "lohn") return ["lohn", "hais"];
  if (root === "rannikuvesi") return ["rannikuve", "rannikuveekogum"];
  if (root === "teatamine") return ["teatad", "teatam"];
  if (root === "okoloogia") return ["okoloogil"];
  if (root === "pfas") return ["pfas", "pfos", "pfoa"];
  if (root === "prtr") return ["prtr", "saasteainete heite ja ulekanderegister"];
  if (root === "maahoive") return ["maahoiv", "netohoiv"];
  if (root === "kutus") return ["kutus", "kytus", "vedelkut", "vedelkyt", "bensiin", "diislikut", "kutteoli"];
  if (root === "kohanemine") return ["kohanem"];
  if (root === "jaakreostus") return ["jaakreost"];
  if (root === "veekaitse") return ["veekaits"];
  if (root === "kaevandamisjaatmed") return ["kaevandamisjaat"];
  if (root === "rohevorgustik") return ["rohevorg", "roheline vorgustik", "rohekoridor"];
  if (root === "voorliik") return ["voorliik", "invasiiv"];
  if (root === "uluk") return ["uluk", "karu", "suurkisk", "podr", "potr", "ilves", "hunt", "hundi", "hirv", "metskit", "metssiga", "metssea", "wildlife", "animal"];
  if (root === "poder") return ["poder", "podr", "potr"];
  if (root === "puuliik") return ["puuliik", "puuliig", "kaasik", "mannik", "kuusik"];
  if (root === "okaspuu") return ["okaspuu"];
  if (root === "hunt") return ["hunt", "hundi", "hunte"];
  if (root === "hirv") return ["hirv"];
  if (root === "metskits") return ["metskit"];
  if (root === "metssiga") return ["metssiga", "metssea", "metssigu"];
  if (root === "margala") return ["margal", "raba", "soo"];
  if (root === "taastamine") return ["taastam", "tervendam", "restoration", "regeneration"];
  if (root === "pais") return ["pais", "randetoke"];
  if (root === "kala") return ["kala", "kalast", "lohe", "forell"];
  if (root === "osoon") return ["osoon", "o3"];
  if (root === "paikesepaneel") return ["paikesepaneel", "fotogalvaan"];
  if (root === "jalajalg") return ["jalajalg", "keskkonnajala", "susinikujala", "khg jalajalg"];
  if (root === "organisatsioon") return ["organisatsioon", "asutus", "ettevote"];
  if (root === "menetlus") return ["menetlus", "menetluse", "staatus"];
  if (root === "staatus") return ["staatus", "staatuse", "menetlusseis", "menetluse seis"];
  if (root === "metsateatis") return ["metsateatis", "raieteatis"];
  if (root === "susinik") return ["susinik", "co2"];
  if (root === "sidumine") return ["sidum", "neel"];
  if (root === "saastmine") return ["saast", "saasta", "saastlik", "kokkuhoid", "hoida"];
  return estonianInflectionVariants(root);
}

export function textHasActionRoot(value, root) {
  if (textHasQueryRoot(value, root)) return true;
  if (String(root).endsWith("mine") && root.length >= 8) {
    const base = root.slice(0, -4);
    return ["mise", "miseks", "misel", "misest", "mist", "misega"]
      .some((suffix) => textHasQueryRoot(value, `${base}${suffix}`));
  }
  return false;
}

export function textHasQueryRoot(value, root) {
  const text = normalize(value);
  if (root === "maar") {
    // "määr" (rate) and "määrus" (regulation) are different intents in Estonian.
    // A plain substring match would make legal-regulation pages look like numeric indicators.
    return /\b(?:maar(?!us)\w*|osakaal\w*|protsent\w*|tase\w*)\b/u.test(text);
  }
  if (root === "vesi") {
    return /\b(?:vesi[\p{L}]*|vee(?!b)[\p{L}]*|vett|water)\b/u.test(text);
  }
  return queryRootVariants(root).some((variant) => text.includes(normalize(variant)));
}
export const DOMAIN_ROOTS = new Set([
  "urask", "feromoon", "puunispuu", "juurepess", "samblik", "sammal", "toidukadu", "toidujaatmed", "smi",
  "mets", "raie", "juurdekasv", "metsaandmed", "metsaregister", "kliima", "ilm", "prognoos", "hoiatus", "temperatuur", "sademed", "tuul",
  "vesi", "veevott", "jarv", "jogi", "meri", "laanemeri", "pohjavesi", "puurkaev", "jaaolud", "ohk", "ohukvaliteet", "saaste", "heide", "kasvuhoonegaas",
  "jaat", "jaatmekaitluskoht", "prugi", "rehv", "polet", "ringmajandus", "ringlussevott", "loodus", "looduskaitse", "elurikkus", "elupaik",
  "kaitseala", "natura", "liik", "seire", "loodusvaatlus", "eutrofeerumine", "keskkond", "keskkonnaportaal", "keskkonnaluba", "menetlus", "piirang", "lubatavus",
  "suplusvesi", "joogivesi", "reovesi", "kohtkaitlus", "pestitsiid", "nitraat", "mereprugi", "rannikuvesi", "asbest", "biojaatmed", "plastijaatmed", "mikroplast",
  "rohevorgustik", "rohepoore", "voorliik", "uluk", "margala", "pais", "kala", "osoon", "paikesepaneel", "jalajalg", "susinik", "eelis", "keskkonnaandmed",
  "putukas", "saask",
  "tuulepark", "aku", "uleujutusrisk",
  "kodus", "kalapuuk", "ranne", "klaas", "suurjaatmed", "puu",
  "keskkonnamoju", "keskkonnaamet", "keskkonnaagentuur", "kliimaministeerium", "kuumalaine",
  "kotkas", "kmh", "ksh", "kataster", "kinnistu", "metsaregister",
  "elektriauto", "energia", "transport", "kutus", "maavara", "kaevandus", "muld", "maahoive", "jaakreostus", "reostus", "kaevandamisjaatmed",
  "mura", "lohn", "kiirgus", "uvkiirgus", "radioaktiivne", "radionukliid", "radoon", "sisekliima", "hallitus", "niiskus", "kemikaal", "ohutuskaart", "biotsiid", "pfas", "prtr", "veekaitse", "tolmeldaja", "climate", "forest", "water", "weather", "pollution", "waste",
  "biodiversity", "nature", "air", "animal", "species", "habitat", "wildlife", "woodland",
  "sea", "ocean", "river", "lake", "data", "andmed", "metaandmed", "api", "statistika", "ruumikiht", "allalaadimine", "kaart", "register", "metsateatis",
]);
// English-only domain roots are inert in Estonian-only mode. Language-neutral
// technical words may refine an Estonian topic but cannot establish scope on
// their own, otherwise an English subject plus "data" or "API" bypasses the
// language gate.
const ENGLISH_ONLY_DOMAIN_ROOTS = new Set([
  "climate", "forest", "water", "weather", "pollution", "waste",
  "biodiversity", "nature", "air", "animal", "species", "habitat", "wildlife", "woodland",
  "sea", "ocean", "river", "lake", "data", "api",
]);
const ENGLISH_ONLY_QUERY_MARKERS = new Set([
  "what", "where", "when", "why", "which", "who", "how",
  "is", "are", "does", "do", "can", "could", "should", "would",
  "the", "in", "of", "for", "about", "estonia",
]);
const ENGLISH_ONLY_SUBJECT_WORDS = new Set([
  "pollution", "emission", "emissions", "chemical", "chemicals",
  "guidance", "information", "monitoring", "status",
]);

export function hasEnglishOnlyQueryFrame(value) {
  if (isMultilingualSearchEnabled()) return false;
  const words = normalize(value).split(/\s+/u).filter(Boolean);
  const markerCount = words.filter((word) => ENGLISH_ONLY_QUERY_MARKERS.has(word)).length;
  return /\buv\s+index\b/u.test(words.join(" "))
    || (words.includes("estonia") && words.some((word) => ["pfas", "pfos", "pfoa", "prtr"].includes(word)))
    || /^(?:what|where|when|why|which|who|how|is|are|does|do|can|could|should|would)\b/u.test(words.join(" "))
    || markerCount >= 2
    || (markerCount >= 1 && words.some((word) => ENGLISH_ONLY_SUBJECT_WORDS.has(word)));
}
export const ADMIN_CONTEXT_ROOTS = new Set([
  "tallinn", "tartu", "parnu", "parnumaa", "narva", "viljandi", "rakvere", "voru",
  "kuressaare", "haapsalu", "johvi", "harjumaa", "saaremaa", "kohtla", "ida", "virumaa",
]);
export const AMBIGUOUS_ROOTS = new Set([
  "vesi", "jarv", "ohk", "ohukvaliteet", "saaste", "jaat", "looduskaitse", "elurikkus",
  "kliima", "ilm", "keskkond", "energia", "elektriauto", "seire", "andmed",
  "prugi", "heide", "keskkonnaluba", "menetlus", "piirang", "kaart", "register", "mura",
  "temperatuur", "raie", "juurdekasv", "ringlussevott", "kaitseala", "liik", "kala", "jogi",
  "meri", "kaevandus", "pohjavesi", "sademed",
]);
export const DOMAIN_FAMILY_BY_ROOT = new Map([
  ["urask", "forest"], ["feromoon", "forest"], ["puunispuu", "forest"], ["juurepess", "forest"], ["smi", "forest"],
  ["samblik", "nature"], ["sammal", "nature"], ["toidukadu", "waste"], ["toidujaatmed", "waste"],
  ["mets", "forest"], ["raie", "forest"], ["juurdekasv", "forest"], ["metsaregister", "forest"],
  ["kliima", "climate"], ["ilm", "weather"], ["temperatuur", "weather"], ["sademed", "weather"],
  ["vesi", "water"], ["jarv", "water"], ["jogi", "water"], ["meri", "water"], ["laanemeri", "water"],
  ["water", "water"], ["sea", "water"], ["ocean", "water"], ["river", "water"], ["lake", "water"],
  ["pohjavesi", "water"], ["suplusvesi", "water"], ["joogivesi", "water"], ["reovesi", "water"], ["mereprugi", "water"], ["rannikuvesi", "water"], ["pais", "water"],
  ["ohk", "air"], ["ohukvaliteet", "air"], ["saaste", "air"], ["lohn", "air"], ["osoon", "air"],
  ["jaat", "waste"], ["prugi", "waste"], ["asbest", "waste"], ["biojaatmed", "waste"], ["plastijaatmed", "waste"], ["mikroplast", "waste"], ["kaevandamisjaatmed", "waste"],
  ["looduskaitse", "nature"], ["elurikkus", "nature"], ["liik", "nature"], ["kala", "nature"],
  ["nature", "nature"], ["biodiversity", "nature"], ["animal", "nature"], ["species", "nature"],
  ["habitat", "nature"], ["wildlife", "nature"], ["forest", "forest"], ["woodland", "forest"],
  ["voorliik", "nature"], ["uluk", "nature"], ["margala", "nature"], ["tolmeldaja", "nature"], ["rohevorgustik", "nature"],
  ["putukas", "nature"], ["saask", "nature"],
  ["muld", "soil"], ["maahoive", "soil"], ["jaakreostus", "soil"], ["maavara", "soil"], ["kaevandus", "soil"],
  ["energia", "energy"], ["transport", "energy"], ["elektriauto", "energy"], ["paikesepaneel", "energy"], ["kutus", "energy"],
  ["uvkiirgus", "health"], ["radioaktiivne", "health"], ["radionukliid", "health"], ["radoon", "health"], ["sisekliima", "health"], ["hallitus", "health"], ["niiskus", "health"],
  ["kemikaal", "chemicals"], ["ohutuskaart", "chemicals"], ["biotsiid", "chemicals"], ["pfas", "chemicals"], ["prtr", "chemicals"],
  ["veekaitse", "water"],
  ["aku", "energy"], ["uleujutusrisk", "water"],
  ["api", "data"], ["data", "data"], ["andmed", "data"], ["metaandmed", "data"], ["statistika", "data"],
  ["ruumikiht", "spatial"], ["kaart", "spatial"], ["register", "spatial"],
  ["keskkonnaluba", "legal"], ["menetlus", "legal"], ["piirang", "legal"], ["lubatavus", "legal"],
]);
export function rootIsDomain(root) {
  if (!isMultilingualSearchEnabled() && ENGLISH_ONLY_DOMAIN_ROOTS.has(root)) return false;
  if (DOMAIN_ROOTS.has(root)) return true;
  return [...DOMAIN_ROOTS].some((candidate) => {
    if (!isMultilingualSearchEnabled() && ENGLISH_ONLY_DOMAIN_ROOTS.has(candidate)) return false;
    return root.startsWith(candidate) && candidate.length >= 4;
  });
}
export const GENERIC_QUERY_CONTEXT_TERMS = new Set(["andmed", "keskkond", "seire"]);

export function isTopicDataOverviewQuery(query, roots = queryTerms(query)) {
  const text = normalize(query);
  if (!/\b(?:andm(?:ed|eid|ete\w*)|andmestik\w*|seireandm\w*|avaandm\w*)\b/u.test(text)) return false;
  return roots.some((root) => rootIsDomain(root)
    && !["andmed", "data", "metaandmed", "api", "statistika"].includes(root));
}

export function isBroadTopicDataOverviewQuery(query, roots = queryTerms(query)) {
  if (!isTopicDataOverviewQuery(query, roots) || /\b(?:19|20)\d{2}\b/u.test(normalize(query))) return false;
  const dataRoots = new Set(["andmed", "data", "metaandmed", "api", "statistika"]);
  const domainRoots = roots.filter((root) => rootIsDomain(root)
    && !ADMIN_CONTEXT_ROOTS.has(root) && !dataRoots.has(root));
  const modifiers = roots.filter((root) => !rootIsDomain(root)
    && !ADMIN_CONTEXT_ROOTS.has(root) && !dataRoots.has(root));
  return domainRoots.length === 1 && modifiers.length === 0;
}
// Words that cannot be part of a person's name: "ühe", "eesti", "mitu",
// statistics words (protsent, osakaal, pindala, hektar), and
// forestry nouns that are not also surnames (tree species such as tamm, kask
// and mänd are, so they stay out). Without these, "harvendusraiet ühes metsas"
// and "surnud puidu tagavara metsamaal" read as a name in front of a forest.
// Pronouns and verbs (ma tohin, nad võivad, raiusin mu) stay out: a name
// after "oma metsas" ("kas ma tohin oma metsas Mari Tammele ...") is held
// private only because that pair itself reads as a name.
export const PERSON_CONTEXT_STOPWORD_PATTERN = /^(?:mitu|protsent\p{L}*|osakaal\p{L}*|pindala\p{L}*|hektar\p{L}*|p[õo]ud\p{L}*|ühe\p{L}*|uhe\p{L}*|eesti|\p{L}*raie\p{L}*|puid\p{L}*|puit\p{L}*|tagavar\p{L}*|jahime\p{L}*|aga|alal|andm\w*|andmev[äa]rav\p{L}*|andmetel|anna|andke|asub|asuv\w*|avalik\w*|jaoks|kaudu|kas|kaits\w*|kasuta\w*|katastri\w*|kehti\w*|kes|kuidas|kinnist\w*|konkreetse|kohta|kuulu\w*|kui|kus|kust|küsimus\w*|kõrval|lahedal|lähedal|lasta|lei\w*|loa\w*|luba\w*|maaüksus\w*|maauksus\w*|maatükk\w*|maatukk\w*|metsaeraldis\w*|metsaregister\w*|millal|millin\w*|millis\w*|minu|mis|mida|midagi|miks|nõu\w*|näen|näha|näita|naita|oleva|oma|on|otsing\w*|palju|p[õo]him[õo]t\w*|poliitik\w*|puurkaev\w*|s[äa]ilita\w*|smi|sügavus\w*|tagasta|tagastage|talu\w*|testida|too|t[öo][öo]tle\w*|ütleb|vaadata|valda|vaja|ööbib|oobib|paikneb|peatub|piirkonn\w*|resideerib|registr\w*|viibib|järgi|ja|ning|või|voi|ääres|aasta|elab|elava|majas|a|about|affect\w*|are|area\w*|at|be|by|can|could|customer|data|did|do|does|for|from|get|give|handle[sd]?|handling|how|in|information|is|live[sd]?|living|may|me|must|near|number|occup(?:y|ies|ied|ying)|of|office|on|permit\w*|polic(?:y|ies)|process(?:es|ed|ing)?|protect(?:s|ed|ing)?|protected|public|regional|register\w*|requirement\w*|research|reside[sd]?|residing|return|s|service|should|show|state|stor(?:e|es|ed|ing)|stay(?:s|ed|ing)?|support|tell|that|the|this|to|use[sd]?|using|what|where|which|who|with|would)$/iu;
export const FOREIGN_SCRIPT_PATTERN = /[\p{Script=Arabic}\p{Script=Armenian}\p{Script=Bengali}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Georgian}\p{Script=Greek}\p{Script=Han}\p{Script=Hangul}\p{Script=Hebrew}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
// Closed follow-up elaboration vocabulary: words that ask *about* an accepted
// root subject without naming a new subject. Every token a follow-up adds must
// be neutral here, an uppercase acronym, or an inflected form of a token the
// conversation already contains; an off-domain noun ("aktsiaoptsiooni",
// "salasõna") deliberately fails so it cannot ride in on an accepted root.
const FOLLOW_UP_ELABORATION_TOKEN_PATTERN = /^(?:selgita|seleta|seletage|selgitage|kirjelda|too|naita|näita|ütle|raagi|räägi|täpsemalt|täpsemini|rohkem|veel|üksikasjalikult|üksikasjad|detailsemalt|konkreetsemalt|lähemalt|etapp\w*|üksikasj\w*|aasta\w*|number\w*|arv\w*|väärtus\w*|tulemus\w*|muutu\w*|arene\w*|arenenud|kasva\w*|suurene\w*|vähene\w*|juhtu\w*|toimu\w*|hakka\w*|jätka\w*|tähenda\w*|näita\w*|hõlma\w*|kata\w*|vajalik|nõutav|kohustuslik|kehtiv|olemasolev|uusim|viimane|viimased|puudu\w*|puudumine)$/iu;
export function isNeutralElaborationToken(token) {
  const value = String(token || "").trim().toLocaleLowerCase("et");
  if (!value) return false;
  return STOP_WORDS.has(value)
    || PERSON_CONTEXT_STOPWORD_PATTERN.test(value)
    || FOLLOW_UP_ELABORATION_TOKEN_PATTERN.test(value);
}
