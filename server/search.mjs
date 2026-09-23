import { createHash } from "node:crypto";
import { cadastreSourceDocuments } from "./cadastre.mjs";
import {
  ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS,
  resolvePublicForestryIntent,
} from "./forestry-public.mjs";
import {
  REVIEWED_ESTONIAN_MUNICIPALITY_BASES,
  REVIEWED_ESTONIAN_COUNTY_SECURITY_SURFACE_SOURCE,
  classifyForestryGeographyScope,
  hasLossyUnicodeForestryAreaResidual,
  isReviewedEstonianCountyIdentity,
  isReviewedEstonianMunicipalityIdentity,
  isReviewedNationalDefaultForestryAreaComplement,
  isReviewedNationalUnsupportedForestAreaBreakdownQuestion,
  removeFirstReviewedMunicipalityOrganizationName,
  requestsUnsupportedForestAreaBreakdown,
  requestsUnsupportedForestAreaTimeSeries,
  requestsUnsupportedForestAreaUnit,
  reviewedEstonianMunicipalityCandidateScope,
  reviewedEstonianForestryMunicipalityScope,
  reviewedEstonianMunicipalityScope,
} from "./municipalities.mjs";
import { withOfficialSourceProfile } from "./source-registry.mjs";
import { isStatisticsWaterAbstractionQuery } from "./statistics.mjs";

export const FOREST_OVERVIEW_URL = "https://www.keskkonnaagentuur.ee/uudised/blogis-kui-palju-ja-millist-metsa-eestis";

const SEARCH_DOCUMENTS = [
  {
    id: "forest-overview",
    title: "Kui palju ja millist metsa Eestis on?",
    organization: "Keskkonnaagentuur",
    type: "Ülevaade",
    published: "12.08.2026",
    url: FOREST_OVERVIEW_URL,
    tags: ["mets", "metsandus", "metsainventeerimine", "SMI", "puistu"],
    summary:
      "Eesti metsa seisundit ja muutusi hinnatakse statistilise metsainventeerimise abil. Ülevaade selgitab, kuidas valimipõhised mõõtmised kirjeldavad metsamaa pindala, puistute koosseisu ja tagavara.",
    answer:
      "Eesti metsa kohta kasutatakse riikliku statistika alusena statistilist metsainventeerimist (SMI), mis koondab üle Eesti tehtud valimipõhised mõõtmised ning võimaldab hinnata metsa pindala, koosseisu ja muutusi.",
  },
  {
    id: "forest-catalogue",
    title: "Metsa teemakataloog",
    organization: "Keskkonnaportaal",
    type: "Andmekataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/kataloog?theme%5B6%5D=6",
    tags: ["mets", "metsamaa", "raie", "ulukid", "looduskaitse", "andmed"],
    summary:
      "Metsa teemakataloog koondab Keskkonnaportaali metsaga seotud väljaanded, uudised, kaardid ja andmeallikad ühte vaatesse.",
    answer:
      "Keskkonnaportaali metsa teemakataloogist leiab samas vaates metsaga seotud publikatsioonid, uudised ja andmeallikad; kinnistupõhiseid andmeid tuleb kontrollida riiklikust Metsaportaalist.",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "forest-inventory-publication",
    title: "Statistiline mets: 20 aastat statistilist metsainventeerimist Eestis",
    organization: "Keskkonnaagentuur",
    type: "Väljaanne",
    published: "2020",
    url: "https://keskkonnaportaal.ee/et/statistiline-mets-20-aastat-statistilist-metsainventeerimist-eestis",
    tags: ["mets", "SMI", "statistika", "inventeerimine", "metoodika"],
    summary:
      "Väljaanne tutvustab statistilise metsainventeerimise metoodikat, valimi kujundamist ning seda, kuidas hinnangud Eesti metsade kohta tekivad.",
    answer:
      "SMI tulemusi tuleb lugeda koos metoodika ja hinnanguveaga: tegemist on valimi põhjal arvutatud riiklike hinnangute, mitte iga kinnistu täieliku mõõdistusega.",
  },
  {
    id: "open-data",
    title: "Keskkonna avaandmed",
    organization: "Keskkonnaportaal",
    type: "Avaandmed",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/avaandmed",
    tags: ["avaandmed", "andmestik", "allalaadimine", "API", "failihoidla", "metaandmed", "andmestiku kirjeldus"],
    summary:
      "Avaandmete vaade juhatab keskkonnaandmete kirjelduste, allalaaditavate failide ja seotud registrite juurde.",
    answer:
      "Keskkonnaandmete taaskasutamiseks alusta avaandmete vaatest: sealt saab liikuda andmestike kirjelduste, failihoidla ja andmeid haldavate registrite juurde.",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "environment-register",
    title: "Andmed ja kaart",
    organization: "Keskkonnaportaal",
    type: "Kaardirakendus",
    published: "jooksev",
    url: "https://register.keskkonnaportaal.ee/register",
    tags: ["kaart", "andmed", "EELIS", "kaitseala", "Natura 2000", "kaitsepiirang", "elupaik", "keskkonnaregister"],
    summary:
      "Kaardirakendus võimaldab otsida ja vaadata ruumilisi keskkonnaandmeid, sealhulgas Natura 2000 alasid, kaitsealasid, elupaiku ja kaitstavaid objekte. Kaart aitab leida registriobjekti; konkreetse piirangu kehtivus tuleb kontrollida objekti andmetest ja õigusaktist.",
    answer:
      "Asukohapõhiste keskkonnapiirangute kontrollimiseks kasuta Andmed ja kaart rakendust ning võrdle nähtavaid kihte registri objektiandmetega.",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "climate-atlas",
    title: "Eesti kliimaatlas",
    organization: "Keskkonnaagentuur",
    type: "Kaardirakendus",
    published: "jooksev",
    url: "https://kliimaatlas.keskkonnaportaal.ee/",
    tags: ["kliima", "temperatuur", "sademed", "tuul", "kliimamuutus", "kaart"],
    summary:
      "Kliimaatlas visualiseerib Eesti ajaloolisi kliimanäitajaid ja kliimamuutuse stsenaariume ruumilisel kujul.",
    answer:
      "Temperatuuri, sademete ja teiste kliimanäitajate piirkondlikuks võrdlemiseks sobib Kliimaatlas, kus saab vahetada perioodi, näitajat ja stsenaariumi.",
  },
  {
    id: "weather-overview",
    title: "Ilm ja kliima teemakataloog",
    organization: "Keskkonnaportaal",
    type: "Teemakataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/kataloog?theme%5B7%5D=7",
    tags: ["ilm", "kliima", "sademed", "temperatuur", "õhutemperatuur"],
    summary:
      "Teemakataloog koondab ilma ja kliimaga seotud ülevaated, väljaanded ja uudised.",
    answer:
      "Ilma üksiksündmuse ja pikaajalise kliimamuutuse eristamiseks vaata koos jooksvaid ilmaandmeid, pika perioodi keskmisi ning Kliimaatlase stsenaariume.",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "water-catalogue",
    title: "Vesi ja veekeskkond",
    organization: "Keskkonnaportaal",
    type: "Teemakataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/kataloog?theme%5B9%5D=9",
    tags: ["vesi", "põhjavesi", "pinnavesi", "meri", "järv", "jõgi", "veekvaliteet"],
    summary:
      "Veeteema materjalid hõlmavad pinna- ja põhjavee seisundit, seiret ning veekogude kasutamist mõjutavaid andmeid.",
    answer:
      "Veekogu seisundi hindamisel tuleb vaadata nii seireandmeid kui ka konkreetse veekogumi koondhinnangut; üks mõõtmine ei kirjelda tavaliselt kogu veekogu seisundit.",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "air-catalogue",
    title: "Välisõhk ja õhukvaliteet",
    organization: "Keskkonnaportaal",
    type: "Teemakataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/search?search_api_fulltext=%C3%B5hukvaliteet",
    tags: ["õhk", "õhukvaliteet", "heide", "saaste", "seire"],
    summary:
      "Õhukvaliteedi materjalid koondavad seire, heitkoguste ja välisõhu seisundi teemalisi allikaid.",
    answer:
      "Õhukvaliteeti hinnatakse saasteainete kaupa ning tulemust mõjutavad mõõtekoht ja ajavahemik; võrdle hetkenäitu pikema perioodi seireandmetega.",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "biodiversity",
    title: "Looduskaitse ja elurikkus",
    organization: "Keskkonnaportaal",
    type: "Teemakataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/kataloog?theme%5B4%5D=4",
    tags: ["looduskaitse", "elurikkus", "Natura", "liigid", "elupaigad", "kaitseala"],
    summary:
      "Looduskaitse teemakataloog koondab kaitstavate alade, liikide, elupaikade ja elurikkuse seisundi materjalid.",
    answer:
      "Looduskaitselise piirangu olemasolu tuleb kontrollida kaardilt ja registri objektiandmetest; avaliku kaardi puuduv kiht ei tõenda piirangu puudumist.",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "waste",
    title: "Jäätmed ja ringmajandus",
    organization: "Keskkonnaportaal",
    type: "Teemakataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/teemad/jaatmed-ja-ringmajandus",
    tags: ["jäätmed", "ringmajandus", "jäätmekäitlus", "taaskasutus", "biojäätmed", "jäätmete liigiti kogumine"],
    summary:
      "Jäätmete ja ringmajanduse materjalid seovad jäätmetekke, käitluse, taaskasutuse ja valdkonna infosüsteemid.",
    answer:
      "Jäätmeandmete puhul täpsusta aasta, jäätmeliik ja käitlusviis, sest kogused ning taaskasutuse näitajad ei ole eri lõigetes otse võrreldavad.",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
    routeClasses: ["official_guidance", "official_data_or_api"],
    _answerEvidenceEligible: false,
  },
  {
    id: "publications",
    title: "Keskkonnaalased publikatsioonid",
    organization: "Keskkonnaportaal",
    type: "Publikatsioonid",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/publikatsioonid",
    tags: ["publikatsioon", "aruanne", "uuring", "ülevaade", "andmed"],
    summary:
      "Publikatsioonide otsing koondab uuringud, aruanded, ülevaated, kaardilood ja muud avaldatud materjalid.",
    answer:
      "Põhjalikuma vastuse jaoks ava otsingutulemustes algallikas ning kontrolli väljaande kuupäeva, metoodikat ja andmete vaatlusperioodi.",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "environmental-permits",
    title: "Kaevandamisloa menetluse kontroll KOTKASes",
    organization: "Keskkonnaamet",
    type: "Infosüsteem",
    published: "23.04.2025",
    url: "https://keskkonnaamet.ee/kasiraamat-kohaliku-omavalitsuse-keskkonnaspetsialistile/kaevandamisloa-taotluse-menetlus-tahtsamate-etappide-kaupa",
    locator: "Keskkonnaameti käsiraamat: „Kaevandamisloa taotluse menetlus tähtsamate etappide kaupa”",
    actionUrl: "https://kotkas.envir.ee/permits/public_index",
    actionLabel: "Ava KOTKASes taotluste ja menetluste register",
    tags: ["luba", "keskkonnaluba", "taotlemine", "ettevõte", "KMH", "menetlus", "aruandlus", "KOTKAS"],
    summary:
      "Keskkonnaameti kaevandamisloa menetlusjuhend suunab KOTKASes „Keskkonnakaitseload” vaates „Taotluste ja menetluste registrisse” ning soovitab otsida menetluse numbri järgi. See kontrollisamm on tõendatud kaevandamisloa menetluse kohta; portaal ise konkreetset menetlusseisu ei määra.",
    content:
      "Keskkonnaameti kaevandamisloa menetlusjuhendi järgi on avatud kaevandamisloa menetluse käik KOTKASes avalikult nähtav. Juhend suunab „Keskkonnakaitseload” sakil „Taotluste ja menetluste registrisse” ning soovitab otsida menetluse numbri järgi. KOTKASesse jõudmise või selle hetkelise kättesaadavuse tõrge ei tõenda, et menetlust ei ole. Teise loaliigi menetluskäigu kohta tuleb kontrollida selle loaliigi juhendit ja KOTKASe menetluskirjet.",
    answer:
      "Kaevandamisloa menetluse ametlikku seisu kontrolli KOTKASest menetluse numbri järgi. Muude loaliikide puhul kasuta KOTKASe menetluskirjet ja vastava loaliigi juhendit.",
    evidencePolicy: "versioned",
    delivery: "catalog-only",
    routeClasses: ["official_spatial_or_register", "official_legal_context", "official_data_or_api"],
    freshness: {
      class: "reviewed-procedure-extract",
      basis: "reviewed-at",
      maxAgeMs: 31 * 24 * 60 * 60 * 1_000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _evidenceVersion: "mining-permit-procedure-reviewed-2026-09-19",
    _evidenceStatusAt: "2026-09-19T00:00:00.000Z",
  },
  {
    id: "kese-monitoring",
    title: "Keskkonnaseire infosüsteemi KESE andmestikud",
    organization: "Keskkonnaagentuur",
    type: "Seireandmed ja API",
    published: "11.02.2026",
    url: "https://keskkonnaportaal.ee/et/avaandmed/keskkonnaseire-infosusteemi-andmestikud",
    tags: ["KESE", "keskkonnaseire", "seirejaam", "mõõtmine", "vesi", "õhk", "elusloodus", "API"],
    summary:
      "KESE koondab riikliku keskkonnaseire mõõtmistulemused ja seirega seotud uuringute andmed. Avalikud levitused on kirjeldatud Keskkonnaportaalis ning masinloetavad tulemused on saadaval JSON-teenustena.",
    answer:
      "Seiretulemuse tõlgendamisel täpsusta seireprogramm, mõõtekoht, näitaja ja aeg; KESE üksik mõõtmine ei pruugi olla veekogumi, piirkonna või kogu Eesti seisundihinnang.",
  },
  {
    id: "official-data-services",
    title: "Keskkonna ja ilma valdkonna andmeteenused",
    organization: "Keskkonnaagentuur",
    type: "PostgREST API kataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/avaandmed/keskkonna-ja-ilma-valdkonna-andmeteenused",
    tags: ["API", "JSON", "PostgREST", "kliima", "hüdroloogia", "keskkonnaseire", "EELIS", "KOTKAS"],
    summary:
      "Ametlik andmeteenuste keskkond avaldab masin-masin JSON-teenuseid kliima, hüdroloogia, keskkonnaseire, EELISe ja KOTKASe andmete kasutamiseks.",
    answer:
      "API-päringus tuleb valida õige tabel, väljad ja filtrid ning arvestada lehel kirjeldatud lehekülgede ja mahupiirangutega; teenuse OpenAPI kirjeldus asub keskkonnaandmed.envir.ee juurel.",
  },
  {
    id: "open-data-downloader",
    title: "Avaandmete allalaadija kasutusjuhend",
    organization: "Keskkonnaagentuur",
    type: "Avaandmete juhend",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/avaandmed/avaandmete-allalaadija/kasutusjuhend",
    tags: ["avaandmed", "allalaadimine", "CSV", "API", "CLIDATA", "WISKI", "KESE", "KOTKAS", "EELIS"],
    summary:
      "Allalaadija koondab EELISe, KOTKASe, KESE, CLIDATA ja WISKI levitusi ning aitab koostada filtreeritud API-päringuid või laadida tulemusi CSV-na.",
    answer:
      "Suure andmehulga puhul vali esmalt vajalikud veerud ja piira päringut kuupäeva, objekti või näitaja järgi; kasutajaliides näitab ka vastava API-päringu aadressi.",
  },
  {
    id: "official-geoserver",
    title: "GeoServeri WMS- ja WFS-ruumiandmeteenused",
    organization: "Keskkonnaagentuur",
    type: "Ruumiandmete API",
    published: "27.05.2026",
    url: "https://keskkonnaportaal.ee/et/avaandmed/geoserver",
    tags: [
      "GeoServer", "WMS", "WFS", "GeoJSON", "EELIS", "Metsaregister", "kaart", "ruumiandmed",
      "ruumikiht", "looduskaitse", "vesi", "Emajõgi", "avalik veekogu",
    ],
    summary:
      "Avalik GeoServer jagab EELISe ja Metsaregistri ruumikihte WMS- ja WFS-teenustena, sealhulgas Emajõe avaliku vooluveekogu kirjet, ning võimaldab valitud kihte GeoJSONi või muude GIS-vormingutena pärida.",
    answer:
      "Ruumilise küsimuse puhul tuleb teada õiget tööruumi ja kihi nime ning kasutada võimalikult täpset ruumi- või atribuudifiltrit; avalikest kihtidest võivad tundlikud liigiandmed puududa.",
  },
  {
    id: "kaia-service",
    title: "KAIA ilma- ja keskkonnaandmete teenus",
    organization: "Keskkonnaagentuur",
    type: "Faili- ja API-teenus",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/avaandmed/kaia-teenus",
    tags: ["KAIA", "ilm", "prognoos", "hoiatus", "radar", "hüdroloogia", "mereprognoos", "tuleoht", "API"],
    summary:
      "KAIA kaudu avaldatakse meteoroloogia ja hüdroloogia faile, radaripilte, hoiatusi, prognoose, tuleohu andmeid ning mudeltooteid koos API dokumentatsiooniga.",
    answer:
      "Jooksva ilma või hoiatuse jaoks kasuta ajakohast KAIA või Ilm+ väljundit; ajaloolise kliimanäitaja jaoks vali selle asemel mõõtejaama ja perioodiga kliimaandmed.",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "statistics-pxweb",
    title: "Statistikaameti andmebaasi PXWeb API",
    organization: "Statistikaamet",
    type: "Statistika API",
    published: "jooksev",
    url: "https://andmed.stat.ee/api/v1/et/stat",
    tags: ["Statistikaamet", "PXWeb", "API", "keskkond", "energia", "jäätmed", "transport", "rahvamajandus", "vesi", "veevõtt", "KK048", "2024"],
    summary:
      "Statistikaameti PXWeb API annab masinloetava ligipääsu ametlikele statistikatabelitele, sealhulgas 2024. aasta veevõtu tabelile KK048 ning keskkonna, energia, transpordi ja jäätmete teemadele.",
    answer:
      "Statistilise vastuse jaoks tuleb nimetada tabeli näitaja, aasta ja jaotus; eri tabelite definitsioone ning ühikuid ei tohi automaatselt samastada.",
  },
  {
    id: "air-quality-live",
    title: "Eesti välisõhu kvaliteet reaalajas",
    organization: "Eesti Keskkonnauuringute Keskus",
    type: "Reaalaja seire",
    published: "jooksev",
    url: "https://ohuseire.ee/",
    tags: ["õhukvaliteet", "välisõhk", "PM10", "PM2.5", "NO2", "osoon", "Tallinn", "Tartu", "Narva", "seirejaam"],
    summary:
      "Õhuseire vaade kuvab Eesti välisõhu seirejaamade ajakohaseid mõõtetulemusi saasteainete ja jaamade kaupa. Näitu tuleb tõlgendada koos aine, mõõtekoha ja keskmistamisajaga.",
    answer:
      "Praeguse õhukvaliteedi hindamiseks vali lähim seirejaam ja saasteaine; ühe jaama hetkeline näit ei kirjelda automaatselt kogu linna ega pikaajalist õhukvaliteeti.",
    evidencePolicy: "timestamped",
    delivery: "live-service",
    freshness: {
      class: "live",
      basis: "source-observed-at",
      maxAgeMs: 15 * 60 * 1000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: false,
  },
  {
    id: "water-monitoring",
    title: "Vee seisund ja seireandmed",
    organization: "Keskkonnaagentuur",
    type: "Valdkonna ülevaade",
    published: "jooksev",
    url: "https://www.keskkonnaagentuur.ee/keskkonnaseire-ja-analuusid/vesi",
    tags: ["vesi", "veekogum", "järv", "jõgi", "põhjavesi", "meri", "KESE", "VEKA", "KOTKAS", "seire"],
    summary:
      "Keskkonnaagentuuri veevaldkonna leht seob pinna-, põhja- ja merevee seisundihinnangud KESE seireandmete, VEKA ning KOTKASe ametlike teenustega.",
    answer:
      "Veekogu kohta küsi nime või registrikoodi, seisundiliiki ja aastat; seireproovi tulemus ning veekogumi ametlik koondseisund on erinevad näitajad.",
  },
  {
    id: "waste-burning-guidance",
    title: "Jäätmete lõkkes põletamine kahjustab keskkonda ja tervist",
    organization: "Keskkonnaamet",
    type: "Ametlik juhis",
    published: "jooksev",
    url: "https://keskkonnaamet.ee/uudised/jaatmete-lokkes-poletamine-kahjustab-keskkonda-ja-tervist",
    tags: ["jäätmed", "prügi", "rehv", "põletamine", "lõke", "keelatud", "Keskkonnaamet"],
    summary:
      "Keskkonnaameti juhis selgitab, et rehve ja muid olmejäätmeid ei tohi lõkkes põletada ning jäätmed tuleb koguda liigiti ja anda üle selleks ette nähtud käitluskohta.",
    answer:
      "Rehvid ja muud jäätmed ei kuulu lõkkesse. Konkreetse olukorra korral järgi kohaliku omavalitsuse jäätmehoolduse nõudeid ning anna jäätmed üle nõuetekohasesse kogumiskohta.",
  },
  {
    id: "protected-nature-guidance",
    title: "Looduskaitse ja kaitstavad objektid",
    organization: "Keskkonnaamet",
    type: "Ametlik juhend",
    published: "jooksev",
    url: "https://keskkonnaamet.ee/elusloodus-looduskaitse/looduskaitse",
    tags: ["looduskaitse", "kaitseala", "Natura 2000", "liik", "elupaik", "püsielupaik", "piirang"],
    summary:
      "Keskkonnaameti looduskaitse info selgitab kaitstavate alade, liikide, elupaikade ja tegevuspiirangute põhimõtteid ning juhatab ametlike menetluste juurde.",
    answer:
      "Üldine looduskaitseinfo ei asenda asukohapõhist kontrolli. Konkreetse maaüksuse puhul vaata EELISe kihte ja kehtivaid kaitse-eeskirju ning vajadusel küsi Keskkonnaametilt kinnitust.",
  },
  {
    id: "environmental-assessment",
    title: "Keskkonnamõju hindamine",
    organization: "Kliimaministeerium",
    type: "Valdkonna juhend",
    published: "jooksev",
    url: "https://www.kliimaministeerium.ee/elurikkus-keskkonnakaitse/moju-hindamine-keskkonnale",
    tags: ["KMH", "KSH", "keskkonnamõju", "hindamine", "menetlus", "arendustegevus", "planeering"],
    summary:
      "Kliimaministeeriumi juhend kirjeldab keskkonnamõju hindamise ja strateegilise hindamise rolli otsustusprotsessis ning seost loa või planeeringu menetlusega.",
    answer:
      "Selleks et leida konkreetse projekti KMH või KSH, täpsusta projekti, asukohta või menetluse nime ning kontrolli menetluse ametlikku seisu KOTKASest või planeeringu avalikustajalt.",
  },
  {
    id: "mining-impact-guidance",
    title: "Kaevandamisloa andmisest keeldumise juhis",
    organization: "Keskkonnaamet",
    type: "Ametlik juhend",
    published: "jooksev",
    url: "https://keskkonnaamet.ee/kasiraamat-kohaliku-omavalitsuse-keskkonnaspetsialistile/loa-andmisest-keeldumine",
    tags: ["kaevandamisluba", "loa andmisest keeldumine", "KOV", "eelhinnang", "KMH", "riskide hindamine"],
    summary:
      "Keskkonnaameti juhend käsitleb kohaliku omavalitsuse kaevandamisloa keeldumisotsuse põhjendamist ning nimetab otsuste taga esinenud hirme. See ei tõenda, et loetletud mõju esineb konkreetses kaevanduses, kaevus või kogu maakonnas; selleks tuleb kasutada projekti eelhinnangut, KMH-d, loatingimusi ja seiret.",
    content:
      "Juhendi „Loa andmisest keeldumine” jaotis käsitleb kaevandamisloa menetlust. Seal nimetatakse kohalike omavalitsuste keeldumisotsuste taga esinenud hirmudena joogivee muutusi, müra ja tolmu, vibratsiooni ning karjäärimasinate transpordihäiringut. Leht ütleb, et mõjule antakse hinnang eelhinnangus. Loetelu ei ole konkreetse projekti, kaevu ega Ida-Virumaa tegeliku mõju seiretulemus.",
    locator: "Keskkonnaameti käsiraamat: „Loa andmisest keeldumine”, jaotis „Millised on kõige suuremad hirmud?”",
    answer:
      "Juhend aitab mõista kaevandamisloa keeldumisotsuse menetluskonteksti, kuid konkreetse keskkonnamõju järeldus vajab projekti, asukoha, eelhinnangu või KMH, loa ja seireandmete täpsustamist.",
  },
  {
    id: "ida-viru-groundwater",
    title: "Ida-Viru põlevkivibasseini põhjavee seisund",
    organization: "Kliimaministeerium",
    type: "Ametlik seisundiülevaade",
    published: "jooksev",
    url: "https://kliimaministeerium.ee/merendus-veekeskkond/veekasutamine-ja-kaitse/pohjavesi",
    tags: ["Ida-Virumaa", "põlevkivi", "kaevandamine", "põhjavesi", "veekõrvaldus", "jääkreostus", "suletud kaevandus"],
    summary:
      "Kliimaministeeriumi ülevaate järgi on Ordoviitsiumi Ida-Viru põlevkivibasseini põhjaveekogum halvas koguselises seisundis peamiselt kaevanduste veekõrvalduse tõttu. Ida-Virumaa põhjavee halba seisundit põhjustavad ka põlevkivi kaevandamine, jääkreostus ja suletud kaevanduste veega täitumine.",
    answer:
      "Ida-Virumaa kaevandamismõju hindamisel tuleb eraldi kontrollida põhjavee koguselist ja keemilist seisundit ning konkreetse loa veeärastuse, seire ja järelhoolduse tingimusi.",
  },
  {
    id: "mined-land-restoration",
    title: "Kaevandatud maa korrastamiskohustus",
    organization: "Keskkonnaamet",
    type: "Ametlik juhend",
    published: "06.01.2026",
    url: "https://keskkonnaamet.ee/keskkonnakasutus-kiirgus/maapou/korrastamiskohustus",
    tags: ["kaevandamine", "kaevandatud maa", "korrastamine", "leevendusmeede", "järelhooldus", "maastik"],
    summary:
      "Pärast kaevandamist tuleb kaevandatud maa enne kaevandamisloa lõppemist Keskkonnaameti tingimuste ja heakskiidetud korrastamisprojekti järgi korrastada, et vähendada keskkonnamõju ning anda ala uuesti kasutusse.",
    content:
      "Pärast kaevandamist tuleb kaevandatud maa korrastada enne kaevandamisloa lõppemist. Kohustus kehtib ka siis, kui luba on kehtetuks tunnistatud või kehtivuse kaotanud. Ala korrastatakse korrastamisprojekti järgi, mis koostatakse Keskkonnaameti antud tingimuste alusel; projekti rakendamiseks annab nõusoleku Keskkonnaamet ja amet kontrollib tööde nõuetekohasust. Korrastamise eesmärk on vähendada keskkonnamõju ja võtta ala uuesti kasutusse. Üldjuhend ei tõenda, et konkreetne karjäär on juba korrastatud, korrastatuks tunnistatud, praegu nõuetekohane või kehtiva loaga; selle staatuseks tuleb kontrollida objekti luba, menetluskirjet ja korrastatuks tunnistamise otsust.",
    answer:
      "Pärast kaevandamist tuleb maa enne kaevandamisloa lõppemist korrastada Keskkonnaameti tingimuste alusel koostatud korrastamisprojekti järgi. Projekti rakendamiseks annab nõusoleku Keskkonnaamet. Üldjuhend ei tõenda ühegi konkreetse karjääri praegust korrastamisstaatust.",
    evidencePolicy: "versioned",
    delivery: "catalog-only",
    freshness: {
      class: "reviewed-procedure-extract",
      basis: "reviewed-at",
      maxAgeMs: 31 * 24 * 60 * 60 * 1_000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _evidenceVersion: "kka-korrastamiskohustus-2026-01-06",
    _evidenceStatusAt: "2026-09-19T00:00:00.000Z",
  },
  {
    id: "waste-reporting-data",
    title: "Ettevõtete jäätmete aastaaruandluse andmed",
    organization: "Keskkonnaagentuur",
    type: "Avaandmestik",
    published: "27.08.2025",
    url: "https://keskkonnaportaal.ee/et/avaandmed/ettevotete-jaatmete-aastaaruandlus",
    tags: ["jäätmed", "jäätmekogus", "aastaaruanne", "KOTKAS", "jäätmekäitluskoht", "taaskasutus", "avaandmed"],
    summary:
      "Andmestik kirjeldab ettevõtete aastaaruannetega esitatud jäätmeteket ja -käitlust ning viitab riigi, maakonna ja kohaliku omavalitsuse statistilistele väljunditele.",
    answer:
      "Jäätmekoguste võrdlemisel täpsusta jäätmekood, käitlustoiming, piirkond ja aruandeaasta; ettevõtte aruandlusandmed ning riiklik koondstatistika on eri detailsusega.",
  },
  {
    id: "weather-forecast",
    title: "Ilm+ – Eesti ilmaprognoos ja hoiatused",
    organization: "Keskkonnaagentuur",
    type: "Ajakohane ilmateenus",
    published: "jooksev",
    url: "https://www.keskkonnaagentuur.ee/ilmpluss",
    tags: ["ilm", "ilmaprognoos", "homme", "hoiatus", "temperatuur", "sademed", "tuul", "Ilm+"],
    summary:
      "Keskkonnaagentuuri Ilm+ kuvab Eesti prognoosi, hoiatusi ja seirejaamade mõõdetud ilmaandmeid. Prognoosi jaoks on vaja kohta ja ajavahemikku.",
    answer:
      "Homse või tänase ilma vaatamiseks kasuta Ilm+ ajakohast prognoosi ning vali asukoht; kliimaandmete kataloog ei ole ilmaprognoosi asendus.",
    evidencePolicy: "timestamped",
    delivery: "live-service",
    freshness: {
      class: "live",
      basis: "source-validity-window",
      maxAgeMs: 15 * 60 * 1000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: false,
  },
  {
    id: "tallinn-noise-map",
    title: "Tallinna linna mürakaart 2022",
    organization: "Tallinna linn",
    type: "Ametlik mürakaart",
    published: "01.10.2024",
    url: "https://www.tallinn.ee/et/keskkond/tallinna-linna-murakaart-2022",
    tags: ["müra", "müraseire", "Tallinn", "mürakaart", "Lden", "Lnight", "liiklusmüra", "tööstusmüra"],
    summary:
      "Tallinna müra seire üldpildi jaoks näitavad ametlikud strateegilised ja siseriiklikud mürakaardid liiklus-, tööstus- ja summaarset müra. 2022. aastal avaldatud kaart kirjeldab 2019. aasta pikaajalist müraolukorda, mitte hetkeolukorda.",
    answer:
      "Tallinna üldise müraolukorra vaatamiseks kasuta päeva, õhtu ja öö mürakaarte. Need ei kirjelda piisava täpsusega lokaalset või ajutist mürahäiringut ning üksikobjekt vajab eraldi mõõtmist või modelleerimist.",
  },
  {
    id: "waste-facilities-map",
    title: "Jäätmekäitluskohad kaardirakenduses Andmed ja kaart",
    organization: "Keskkonnaagentuur",
    type: "Ametlik kaardirakendus",
    published: "27.04.2026",
    url: "https://register.keskkonnaportaal.ee/register",
    locator: "https://keskkonnaportaal.ee/et/abi",
    tags: ["jäätmed", "jäätmekäitluskoht", "jäätmekäitluskohad", "vastuvõtukoht", "katkine", "külmkapp", "kodumasin", "elektroonikaromu", "kaart", "KOTKAS", "Pärnumaa", "Viljandimaa", "maakond"],
    summary:
      "Keskkonnaportaali Andmed ja kaart rakenduses saab valida jäätmekäitluskohtade, jäätmejaamade või prügilate kihi ning otsida või suumida soovitud asukohale. Kaardil on arhiveeritud objektide jaoks eraldi kihid, mistõttu kaart on tee objekti leidmiseks, mitte tõend selle praeguse kehtivuse või vastuvõetavate jäätmeliikide kohta.",
    content:
      "Keskkonnaportaali ametlik abi ütleb, et Andmed ja kaart rakenduses kuvatakse jäätmekäitluskohtade infot. Rakenduse ametlikus kihiloendis on eraldi „Jäätmekäitluskohad“, „Jäätmejaamad“ ja „Prügilad“ ning eraldi arhiveeritud objektide kihid; rakendus pakub asukohaotsingut. Pärnumaa kohta ava kaart, vali sobiv jäätmekäitluskohtade kiht ja otsi või suumi Pärnumaa asukohale. See juhis aitab üksnes ametliku kaardivaateni: enne jäätmete viimist tuleb konkreetse objekti kehtivus ja vastuvõetavad jäätmeliigid kontrollida objektiandmetest või käitlejalt.",
    answer:
      "Piirkonna jäätmekäitluskohtade leidmiseks ava Andmed ja kaart, vali sobiv jäätmekäitluskohtade kiht ning otsi või suumi soovitud asukohale. Enne jäätmete viimist kontrolli konkreetse objekti kehtivust ja vastuvõetavaid jäätmeliike objektiandmetest või käitlejalt.",
    canonicalServiceId: "environment-register",
    intentView: "waste-facilities",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
    routeClasses: ["official_spatial_or_register", "official_guidance"],
    _answerEvidenceEligible: false,
  },
  {
    id: "radiation-monitoring",
    title: "Kiirgusseire ja kriisireguleerimine",
    organization: "Keskkonnaamet",
    type: "Riiklik seire",
    published: "jooksev",
    url: "https://www.keskkonnaamet.ee/keskkonnakasutus-kiirgus/kiirgus/kiirgusseire-ja-kriisireguleerimine",
    tags: ["kiirgus", "kiirgusseire", "radioaktiivsus", "gammakiirgus", "seiretulemused", "tulemused", "varajane hoiatus", "nSv/h"],
    summary:
      "Keskkonnaameti Eesti kiirgusseire tulemuste leht koondab riikliku seire aastaaruanded ja varajase hoiatamise süsteemi. Üle Eesti mõõdab 15 automaatjaama reaalajas summaarset õhu gammakiirguse doosikiirust.",
    answer:
      "Kiirgusolukorra hindamisel vaata mõõtekohta, aega, ühikut ja tavapärast taustataset. Üksik mõõteväärtus ei tõenda iseseisvalt kiirgusõnnetust; ebatavalisest olukorrast annab ametlikult teada Keskkonnaamet.",
  },
  {
    id: "electric-vehicle-lifecycle",
    title: "Electric vehicles – life-cycle environmental impacts",
    organization: "Euroopa Keskkonnaagentuur",
    type: "Ametlik teemaülevaade",
    published: "05.12.2024",
    url: "https://www.eea.europa.eu/en/topics/in-depth/electric-vehicles",
    tags: ["elektriauto", "elektrisõiduk", "keskkonnamõju", "keskkonnajalajälg", "elutsükkel", "aku", "kasvuhoonegaas", "õhusaaste", "transport", "linnakasutus", "võrdlus"],
    summary:
      "Euroopa Keskkonnaagentuuri elutsükli keskkonnamõju ülevaate järgi tekitab tüüpiline elektriauto Euroopas elutsükli jooksul vähem kasvuhoonegaase, õhusaastet ja müra kui võrreldav bensiini- või diiselauto, kuigi tootmisfaasi mõju on tavaliselt suurem.",
    answer:
      "Elektriauto mõju ei piirdu summutitoruga: arvesse tuleb võtta aku ja auto tootmist, elektri tootmisviisi, sõiduki suurust, läbisõitu ning taaskasutust. Euroopa tüüpilises elutsüklis korvab väiksem kasutusfaasi mõju üldjuhul suurema tootmismõju.",
  },
  {
    id: "soil-monitoring-results",
    title: "Mullaseire tulemuste ülevaade",
    organization: "Keskkonnaagentuur",
    type: "Riikliku seire ülevaade",
    published: "05.08.2026",
    url: "https://keskkonnaportaal.ee/et/mullaseire-tulemuste-ulevaade",
    tags: ["muld", "mullaseire", "seiretulemused", "raskmetallid", "taimekaitsevahendid", "KESE"],
    summary:
      "Keskkonnaportaali 2025. aasta mullaseire ülevaate järgi püsis seiratud põllumuldade pH stabiilne ja valdavalt neutraalne, tihenemine suurenes, orgaaniline süsinik vähenes mitmel seirealal ning raskmetallide sisaldused jäid alla sihtarvude, kuigi mitme elemendi sisaldus näitas kasvutrendi.",
    content:
      "2025. aasta mullaseire tulemused kirjeldavad seiratud põllumuldasid ja võrdlusalasid, mitte kõigi Eesti muldade ühesugust seisundit: pH püsis stabiilne ja valdavalt neutraalne, tihenemine suurenes, orgaaniline süsinik vähenes mitmel alal ning raskmetallide sisaldused jäid alla sihtarvude. Ülevaade põhineb Maaelu Teadmuskeskuse 2002–2025 andmetel. 2025. aastal seirati Eametsa, Kogeri, Langi, Risti ja Pikareinu põllumuldasid ning Eametsa ja Kogeri metsamuldasid.",
    evidencePolicy: "versioned",
    freshness: {
      class: "reviewed-source-extract",
      basis: "reviewed-at",
      maxAgeMs: 31 * 24 * 60 * 60 * 1_000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _evidenceVersion: "soil-monitoring-page-updated-2026-08-05",
    _evidenceStatusAt: "2026-09-19T00:00:00.000Z",
  },
  {
    id: "historical-weather-data",
    title: "Ajaloolised ilmaandmed mõõtejaamade kaupa",
    organization: "Keskkonnaagentuur",
    type: "Ametlikud mõõteandmed",
    published: "jooksev",
    url: "https://www.ilmateenistus.ee/kliima/ajaloolised-ilmaandmed/",
    tags: ["ajalooline", "ilm", "temperatuur", "sademed", "tuul", "Tartu", "Tõravere", "2020", "mõõtejaam"],
    summary:
      "Keskkonnaagentuuri ajalooliste ilmaandmete lehelt saab jaamade, sealhulgas Tartu–Tõravere, 2020. aasta tunniandmeid õhutemperatuuri, sademete, õhurõhu, niiskuse ja tuule kohta alla laadida.",
  },
  {
    id: "precipitation-change",
    title: "Sademete summa muutus Eestis",
    organization: "Keskkonnaagentuur",
    type: "Keskkonnanäitaja",
    published: "06.05.2026",
    url: "https://keskkonnaportaal.ee/et/sademete-summa-muutus",
    tags: [
      "kliimamuutus", "sademed", "sademete summa", "normperiood", "tugev sadu", "prognoos",
      "talv", "sügis", "september", "sajusem",
    ],
    summary:
      "Keskkonnaportaali näitaja kirjeldab kliimamuutuse mõõdetud mõju Eesti sademetele: 1991–2020 keskmine kogusumma oli umbes 6% suurem kui 1961–1990 ja 21% suurem kui 1931–1960. Talved on muutunud sajusemaks, sügised ja eriti september kuivemaks ning väga tugevate sadudega päevi on mõnevõrra rohkem; tulevikuprognoos on mõõdetud muutustest eraldi.",
  },
  {
    id: "historical-hydrology-data",
    title: "Sisevete ajaloolised hüdroloogilised seireandmed",
    organization: "Keskkonnaagentuur",
    type: "Ametlikud seireandmed",
    published: "jooksev",
    url: "https://www.ilmateenistus.ee/siseveed/ajaloolised-vaatlusandmed/",
    tags: ["hüdroloogia", "sisevesi", "Emajõgi", "seireandmed", "veetase", "vooluhulk", "veetemperatuur", "CSV", "2025"],
    summary:
      "Keskkonnaagentuuri ajalooliste hüdroloogiliste seireandmete vaates saab valida Emajõe hüdromeetriajaama ja 2025. aasta näitaja ning laadida veetaseme, vooluhulga või veetemperatuuri ööpäevased andmed CSV-na alla.",
  },
  {
    id: "wind-farm-assessment-guide",
    title: "Tuuleparkide keskkonnamõju hindamise juhend",
    organization: "Kliimaministeerium",
    type: "Ametlik juhend",
    published: "06.03.2025",
    url: "https://kliimaministeerium.ee/uudised/uus-juhend-aitab-uhtlustada-tuuleparkide-keskkonnamojude-hindamist",
    tags: ["keskkonnamõju", "KMH", "tuulepark", "tuuleenergia", "müra", "infraheli", "vibratsioon", "varjutamine"],
    summary:
      "Kliimaministeeriumi juhend koondab tuuleparkide müra, madalsagedusliku heli, vibratsiooni ja varjutamise hindamise ning leevendus- ja seiremeetmete põhimõtted.",
  },
  {
    id: "greenhouse-gas-inventory",
    title: "Kasvuhoonegaasid Eestis",
    organization: "Kliimaministeerium",
    type: "Ametlik inventuuriülevaade",
    published: "jooksev",
    url: "https://kliimaministeerium.ee/rohereform-kliima/kliimapoliitika/kasvuhoonegaaside-heitkogused",
    tags: ["kasvuhoonegaasid", "KHG", "heide", "inventuur", "CO2 ekvivalent", "1990–2024", "sektorid"],
    summary:
      "Kliimaministeeriumi püsileht koondab Eesti iga-aastase kasvuhoonegaaside inventuuri, aegridade selgitused, sektorite jaotuse ning allalaaditavad aruanded.",
  },
  {
    id: "municipal-waste-recycling-page",
    title: "Olmejäätmete ringlussevõtt",
    organization: "Keskkonnaportaal",
    type: "Keskkonnanäitaja",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/olmejaatmete-ringlussevott",
    tags: ["jäätmed", "olmejäätmed", "ringlussevõtt", "ringlussevõtu määr", "protsent", "sihttase", "aasta"],
    summary:
      "Jäätmete raamdirektiivi olmejäätmete korduskasutuseks ettevalmistamise ja ringlussevõtu sihttase on vähemalt 55% massi järgi 2025. aastaks ning vähemalt 60% massi järgi 2030. aastaks — eesmärk on siin sihttase, mitte Eesti mõõdetud tulemus ega tõend eesmärgi saavutamise kohta.",
    locator: "Näitajalehe selgitav tekst: jäätmete raamdirektiivi 2025. ja 2030. aasta sihttasemed",
  },
  {
    id: "protected-area-construction",
    title: "Planeerimine ja ehitamine kaitstavatel aladel",
    organization: "Keskkonnaamet",
    type: "Ametlik juhend",
    published: "jooksev",
    url: "https://keskkonnaamet.ee/elusloodus-looduskaitse/tegevused-kaitstavatel-aladel/planeerimine-ja-ehitamine",
    tags: [
      "Natura 2000", "kaitseala", "püsielupaik", "piirang", "ehitamine", "rajamine",
      "renoveerimine", "hoone", "maja", "saunamaja", "luba", "kooskõlastus",
      "Keskkonnaameti nõusolek", "protected area", "national park", "building renovation",
      "building construction", "Environment Board", "official contact",
    ],
    summary:
      "Keskkonnaameti juhend selgitab kaitstaval alal, sealhulgas püsielupaigas, ehitamise piiranguid, hoone rajamise või renoveerimise eelneva nõusoleku vajadust ning seost Natura hindamisega.",
  },
  {
    id: "groundwater-status",
    title: "Põhjavee seisund",
    organization: "Keskkonnaportaal",
    type: "Keskkonnanäitaja ja aruanded",
    published: "02.04.2024",
    url: "https://keskkonnaportaal.ee/teemad/vesi/pohjavesi/pohjavee-seisund",
    tags: ["põhjavesi", "põhjaveekogum", "seisund", "Harju", "keemiline seisund", "koguseline seisund", "seire"],
    summary:
      "Keskkonnaportaali püsileht koondab põhjaveekogumite keemilise ja koguselise seisundi hinnangud, kaardiloo ning kogumipõhised aruanded, sealhulgas Siluri–Ordoviitsiumi Harju kogumi materjali.",
  },
  {
    id: "well-permit-guidance",
    title: "Puurkaevu rajamise loa- ja projektinõuded",
    organization: "Keskkonnaamet",
    type: "Ametlik juhend",
    published: "21.07.2026",
    url: "https://keskkonnaamet.ee/keskkonnakasutus-kiirgus/vesi/salv-puurkaevud-ja-heitvesi",
    locator: "Jaotis „Puurkaevu ja -augu rajamine”",
    actionUrl: "https://register.keskkonnaportaal.ee/register/search?objectType=DRIVEN_WELL&status=kinnitatud",
    actionLabel: "Kontrolli puurkaevu registriandmeid",
    tags: ["puurkaev", "puurauk", "luba", "ehitusluba", "kasutusluba", "ehitusprojekt", "kohalik omavalitsus", "EELIS"],
    summary:
      "Keskkonnaameti 21.07.2026 uuendatud juhendi järgi vajab uue puurkaevu või -augu rajamine ehitusprojekti ning kohaliku omavalitsuse ehitusluba; pärast rajamist väljastab omavalitsus kasutusloa. Olemasoleva kaevu õiguslikku staatust ei saa üldjuhendi põhjal üksi otsustada.",
    content:
      "Keskkonnaameti juhendi jaotise „Puurkaevu ja -augu rajamine” järgi tuleb puurkaevu või -augu ehitamiseks taotleda kohalikult omavalitsuselt ehitusluba ning rajamiseks on vaja ehitusprojekti, mille koostaja peab olema hüdrogeoloogiliste tööde tegevusloaga isik. Juhend ütleb, et kohalik omavalitsus menetleb ehitusloa taotlust, kooskõlastab selle ehitusseadustiku §-s 126 nimetatud juhtudel Keskkonnaametiga ning väljastab pärast rajamist kasutusloa. See üldjuhend ei tõenda, kas kinnistul juba oleva konkreetse puurkaevu vajalikud load on olemas: selleks kontrolli kaevu registrikirjet ja küsi objekti andmetega kohalikult omavalitsuselt.",
    answer:
      "Uue puurkaevu rajamiseks on Keskkonnaameti juhendi järgi vaja projekti ja kohaliku omavalitsuse ehitusluba ning pärast rajamist kasutusluba. Juba olemasoleva kaevu puhul kontrolli konkreetset registrikirjet ja loaandmeid kohalikust omavalitsusest; üldjuhend üksi kaevu staatust ei tõenda.",
    evidencePolicy: "versioned",
    delivery: "catalog-only",
    routeClasses: ["official_legal_context", "official_guidance"],
    freshness: {
      class: "reviewed-legal-guidance-extract",
      basis: "reviewed-at",
      maxAgeMs: 31 * 24 * 60 * 60 * 1_000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _evidenceVersion: "well-permit-guidance-reviewed-2026-09-19",
    _evidenceStatusAt: "2026-09-19T00:00:00.000Z",
  },
  {
    id: "pond-permit-guidance",
    title: "Tiigi ja muu veekogu rajamise loa kontroll",
    organization: "Keskkonnaamet",
    type: "Ametlik juhend",
    published: "16.10.2025",
    url: "https://keskkonnaamet.ee/veekogu-rajamine-ja-umberkujundamine",
    locator: "Jaotis „Kontrolli, kas on vaja keskkonnaluba”",
    tags: ["tiik", "veekogu", "rajamine", "keskkonnaluba", "vee registreering", "ehitusluba", "üks hektar", "kaldajoon", "veerežiim"],
    summary:
      "Keskkonnaameti juhendi järgi ei vaja maismaale kavandatud, olemasoleva veekoguga ühendamata alla ühe hektari suurune veekogu rajamiseks keskkonnaluba; ehitusseadustiku ning asukoha piirangud võivad siiski kohalduda. Suurem, olemasoleva veekoguga seotud või veerežiimi muutev lahendus vajab eraldi kontrolli.",
    content:
      "Keskkonnaameti juhendi jaotise „Kontrolli, kas on vaja keskkonnaluba” järgi vajab üle ühe hektari suurune uus iseseisev veekogu keskkonnaluba. Maismaale kavandatud ja olemasoleva veekoguga ühendamata alla ühe hektari suuruse veekogu rajamiseks keskkonnaluba vaja ei ole, kuid järgida tuleb ehitusseadustiku nõudeid. Juhend käsitleb eraldi kaitstavat ala, olemasoleva veekogu kaldajoone või veerežiimi muutmist, süvendamist ja muid asjaolusid, mille korral võib vaja minna Keskkonnaameti nõusolekut, veekeskkonnariskiga tegevuse registreeringut, planeeringut või keskkonnaluba. Pelgalt sõna „väike” ei tõenda pindala, ühendust, asukohta ega tööde viisi; konkreetse tiigi loanõue tuleb hinnata nende andmete järgi.",
    answer:
      "Kui uus tiik on täielikult maismaal, ei ole olemasoleva veekoguga ühendatud ja jääb alla ühe hektari, ei vaja see Keskkonnaameti juhendi järgi keskkonnaluba, kuid ehitusseadustiku nõuded jäävad kehtima. Muul juhul kontrolli pindala, asukohta, ühendust, kaldajoone ja veerežiimi muutust enne järeldust.",
    evidencePolicy: "versioned",
    delivery: "catalog-only",
    routeClasses: ["official_legal_context", "official_guidance"],
    freshness: {
      class: "reviewed-legal-guidance-extract",
      basis: "reviewed-at",
      maxAgeMs: 31 * 24 * 60 * 60 * 1_000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _evidenceVersion: "pond-permit-guidance-reviewed-2026-09-19",
    _evidenceStatusAt: "2026-09-19T00:00:00.000Z",
  },
  {
    id: "circular-economy-guidance",
    title: "Ringmajanduse roll jäätmete taaskasutamisel",
    organization: "Keskkonnaportaal",
    type: "Teemaülevaade",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/teemad/jaatmed-ja-ringmajandus/ringmajandus/toetavad-tegevused",
    locator: "Ringmajandus: toetavad tegevused",
    tags: ["ringmajandus", "jäätmed", "taaskasutus", "ringlussevõtt", "korduskasutus", "jäätmehierarhia"],
    summary:
      "Ringmajandus aitab jäätmeid taaskasutada, hoides tooteid ja materjale võimalikult kaua ringluses korduskasutuse, parandamise ja ringlussevõtu kaudu; nii tekib vähem jäätmeid ja kulub vähem uut toorainet.",
    content:
      "Keskkonnaportaali teemavaate „Jäätmed ja ringmajandus” järgi hoiab ringmajandus tooteid ja materjale võimalikult kaua kasutuses: esikohal on jäätmetekke ennetamine, seejärel korduskasutus ning seejärel ringlussevõtt, kus jäätmed töödeldakse uueks tooraineks. Nii tekib vähem jäätmeid, väheneb uue tooraine kaevandamise vajadus ja paraneb jäätmete liigiti kogumine. Portaali andmetel tekkis Eestis 2024. aastal umbes 15 miljonit tonni jäätmeid ning ringleva materjali määr oli 20,5%; jäätmearuandluse infosüsteem PISTRIK stardib 2027. aastal. Üldine teemaülevaade ei asenda konkreetse jäätmeliigi käitlusjuhist: olmejäätmete ringlussevõtu sihttasemed ja mõõdetud määrad on eraldi näitajad.",
    answer:
      "Ringmajandus aitab jäätmeid taaskasutada korduskasutuse, parandamise ja ringlussevõtu kaudu, hoides materjalid ringluses ning vähendades nii jäätmeteket kui uue tooraine vajadust. Täpse jäätmeliigi koguse või määra küsimuses vaata eraldi näitajat ja aastat.",
    evidencePolicy: "versioned",
    delivery: "catalog-only",
    routeClasses: ["official_guidance"],
    freshness: {
      class: "reviewed-guidance-extract",
      basis: "reviewed-at",
      maxAgeMs: 31 * 24 * 60 * 60 * 1_000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _evidenceVersion: "circular-economy-guidance-reviewed-2026-09-23",
    _evidenceStatusAt: "2026-09-23T00:00:00.000Z",
  },
  {
    id: "waste-sorting-guidance",
    title: "Jäätmete sorteerimine kodus",
    organization: "Kliimaministeerium",
    type: "Ametlik juhend",
    published: "jooksev",
    url: "https://kliimaministeerium.ee/jaatmete-liigiti-kogumine",
    locator: "Olmejäätmete liigiti kogumise juhend",
    tags: ["jäätmed", "sorteerimine", "liigiti kogumine", "pakend", "biojäätmed", "kodus"],
    summary:
      "Kliimaministeeriumi riikliku liigiti kogumise juhendi järgi sorteeritakse kodus jäätmed liikide kaupa: eraldi kogutakse pakendid, klaas, biojäätmed, paber ja kartong ning ohtlikud jäätmed; juhendist lähtuvad edaspidi ka jäätmevedajad ja taaskasutusorganisatsioonid.",
    content:
      "Kliimaministeeriumi olmejäätmete liigiti kogumise juhend on riiklik juhis, mis muudab prügi sorteerimise kõigi jaoks lihtsamaks ja selgemaks; sellest lähtuvad edaspidi ka jäätmevedajad ja taaskasutusorganisatsioonid. Kodus kogutakse liigiti muu hulgas pakendeid, klaaspakendeid, plast- ja metallpakendeid, biojäätmeid ning paberi- ja kartongijäätmeid; eraldi kogutakse ka ohtlikud jäätmed, patareid, elektroonikajäätmed ja tekstiil. Juhendi trükimaterjalid on portaalis eesti, inglise ja vene keeles. Üldjuhend ei asenda kohaliku omavalitsuse jäätmehoolduseeskirja: täpse veograafiku ja kogumiskoha annab elukohajärgne vedaja või omavalitsus.",
    answer:
      "Sorteeri kodus jäätmed liikide kaupa riikliku juhendi järgi: eraldi pakendid, klaas, biojäätmed, paber ja kartong ning ohtlikud jäätmed. Täpse veograafiku ja kogumiskoha küsi elukohajärgselt vedajalt või omavalitsuselt.",
    evidencePolicy: "versioned",
    delivery: "catalog-only",
    routeClasses: ["official_guidance"],
    freshness: {
      class: "reviewed-guidance-extract",
      basis: "reviewed-at",
      maxAgeMs: 31 * 24 * 60 * 60 * 1_000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _evidenceVersion: "waste-sorting-guidance-reviewed-2026-09-23",
    _evidenceStatusAt: "2026-09-23T00:00:00.000Z",
  },
  {
    id: "campfire-guidance",
    title: "Telkimine ja lõkke tegemine looduses",
    organization: "RMK",
    type: "Ametlik juhend",
    published: "jooksev",
    url: "https://rmk.ee/looduses-liikumine/juhised/",
    locator: "Juhised looduses liikujale",
    tags: ["telkimine", "lõke", "mets", "igaüheõigus", "looduses liikumine"],
    summary:
      "RMK juhiste järgi võib metsas telkida igaüheõiguse piires ja lõket tohib teha ainult selleks ettevalmistatud ja tähistatud kohas tuletegemist lubaval ajal, kaitsealadel kehtivad eraldi piirangud.",
    content:
      "RMK looduses liikumise juhiste järgi peetakse kinni igaüheõiguse põhimõtetest ja piirangutest: kaitsealadel on igaüheõigus piiratud ja reeglid on kirjas vastava ala kaitse-eeskirjas. Telkimiseks, lõkke tegemiseks ja peatumiseks eelistatakse olemasolevaid matkaradu, telkimisalasid ja lõkkekohti, et mitte tekitada lisakoormust keskkonnale. Lõket tehakse ainult selleks ettevalmistatud ja tähistatud kohas tuletegemist lubaval ajal; eelistatakse kattega lõkkekohta, järgitakse tuleohutusnõudeid, põlevat lõket ei jäeta kunagi valveta ja lahkudes see kustutatakse. Tule tegemisel kasutatakse valmis puid või maha langenud oksi ning arvestatakse metsas valitseva tuleohuga.",
    answer:
      "Metsas tohib telkida igaüheõiguse piires, kaitsealal kehtivad eraldi piirangud; lõket tohib teha ainult ettevalmistatud tähistatud kohas ja lubaval ajal, valveta jätta ei tohi.",
    evidencePolicy: "versioned",
    delivery: "catalog-only",
    routeClasses: ["official_guidance"],
    freshness: {
      class: "reviewed-guidance-extract",
      basis: "reviewed-at",
      maxAgeMs: 31 * 24 * 60 * 60 * 1_000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _evidenceVersion: "campfire-guidance-reviewed-2026-09-23",
    _evidenceStatusAt: "2026-09-23T00:00:00.000Z",
  },
  {
    id: "fishing-permit-guidance",
    title: "Kalapüügiloa taotlemine",
    organization: "Keskkonnaamet",
    type: "Ametlik juhend",
    published: "jooksev",
    url: "https://keskkonnaamet.ee/taotlused-aruanded/elusloodus-looduskaitse/kalanduse-taotlused",
    locator: "Kalapüük ja kalade asustamine",
    tags: ["kalapüük", "kalapüügiluba", "kalastuskaart", "harrastuskalapüük", "nakkevõrk"],
    summary:
      "Keskkonnaameti kalanduse taotluste lehe järgi tuleb erivahenditega kalapüügiks taotleda kalastuskaart, mis annab eraldi püügiõiguse; tavaline harrastuskalapüük eeldab harrastuspüügiõiguse tasu maksmist.",
    content:
      "Keskkonnaameti kalapüügi info järgi tuleb erivahenditega või eripaigus kala- ja vähipüügiks taotleda kalastuskaart: see on dokument, mis annab eraldi püügiõiguse ning selle ostmiseks ei pea olema tasutud harrastuspüügiõiguse tasu. Kalastuskaart tuleb taotleda, kui püügivahendiks on näiteks nakkevõrk või õngejada. Kalade asustamiseks on vajalik Keskkonnaameti luba. Tavaline harrastuspüügiõigus (õnge ja lihtsamate vahenditega püük) eeldab kehtivat harrastuspüügiõiguse tasu; täpsed vahendite loetelud, piirkonnad ja keelualad on kirjas kalapüügieeskirjas ja Keskkonnaameti taotluste lehel.",
    answer:
      "Erivahenditega püügiks (näiteks nakkevõrk, õngejada) taotlege kalastuskaart; tavaline harrastuspüük eeldab harrastuspüügiõiguse tasu. Täpsed vahendid ja keelualad vaata kalapüügieeskirjast.",
    evidencePolicy: "versioned",
    delivery: "catalog-only",
    routeClasses: ["official_guidance"],
    freshness: {
      class: "reviewed-guidance-extract",
      basis: "reviewed-at",
      maxAgeMs: 31 * 24 * 60 * 60 * 1_000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: true,
    _evidenceVersion: "fishing-permit-guidance-reviewed-2026-09-23",
    _evidenceStatusAt: "2026-09-23T00:00:00.000Z",
  },
  {
    id: "well-register",
    title: "Puurkaevude ja puuraukude andmed registris",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Ametlik register ja avaandmed",
    published: "jooksev",
    url: "https://register.keskkonnaportaal.ee/register/search?objectType=DRIVEN_WELL&status=kinnitatud",
    locator: "https://keskkonnaportaal.ee/et/eelise-andmestikud",
    tags: ["puurkaev", "puurauk", "register", "EELIS", "põhjaveekiht", "põhjavesi", "andmed", "kaart"],
    summary:
      "Keskkonnaportaali Andmed ja kaart rakenduses saab otsida puurkaevu või puurauku ning vaadata EELISe registriandmeid. EELISe andmestike kirjeldus kinnitab, et puurkaevude andmestik hõlmab puurauke ja puurkaeve; konkreetse objekti juures tuleb kontrollida registrikoodi, asukohta ja geoloogilisi andmeid.",
  },
  {
    id: "marine-observations",
    title: "Mere seireandmed ja jääkaart",
    organization: "Keskkonnaagentuur",
    type: "Reaalaja- ja ajaloolised seireandmed",
    published: "jooksev",
    url: "https://www.ilmateenistus.ee/meri/vaatlusandmed/",
    locator: "https://www.ilmateenistus.ee/meri/jaakaart/",
    tags: ["meri", "merevesi", "veetemperatuur", "veetase", "vaatlusandmed", "seire", "rannik", "jääkaart", "jääolud"],
    summary:
      "Keskkonnaagentuuri merevaatluste vaade kuvab rannikujaamade veetaset, veetemperatuuri ja muid jooksvaid näite; samas ametlikus mereteenuses on eraldi ajaloolised seireandmed ning jääkaart.",
    evidencePolicy: "timestamped",
    delivery: "live-service",
    _answerEvidenceEligible: false,
  },
  {
    id: "marine-ice-map",
    title: "Mere jääkaart",
    organization: "Keskkonnaagentuur",
    type: "Ametlik jääolude kaart",
    published: "jooksev",
    url: "https://www.ilmateenistus.ee/meri/jaakaart/",
    tags: ["meri", "merejää", "jääkaart", "jääolud", "jääkate", "vaatlus", "kaart"],
    summary:
      "Keskkonnaagentuuri jääkaart näitab Eesti mereala jääolusid. Merevee temperatuuri ja veetaseme jooksvaid näite kuvatakse eraldi mere seireandmete vaates.",
    evidencePolicy: "timestamped",
    delivery: "live-service",
    _answerEvidenceEligible: false,
  },
  {
    id: "marine-strategy-status",
    title: "Eesti merestrateegia: Läänemere seisundihinnang 2024",
    organization: "Kliimaministeerium",
    type: "Ametlik seisundihinnang",
    published: "jooksev",
    url: "https://kliimaministeerium.ee/keskkonnakasutus/merestrateegia",
    tags: ["meri", "Läänemeri", "merestrateegia", "seisund", "2024", "eutrofeerumine", "seire"],
    summary:
      "Kliimaministeeriumi merestrateegia leht koondab Läänemere Eesti mereala 2024. aasta seisundihinnangu, indikaatorid, aruanded ja järgmiste meetmete dokumendid.",
  },
  {
    id: "bathing-water-quality",
    title: "Suplusvee kvaliteet ja supluskohad",
    organization: "Terviseamet",
    type: "Ajakohane tervise- ja seireinfo",
    published: "jooksev",
    url: "https://www.terviseamet.ee/keskkonnatervis/vesi/suplusvesi",
    tags: ["suplusvesi", "supluskoht", "rand", "veekvaliteet", "E. coli", "soole enterokokid", "kaart", "hoiatus"],
    summary:
      "Terviseameti püsileht koondab avatud supluskohad, jooksva suplusvee kvaliteedi, kvaliteediklassid ja kaardivaate. Jooksvat proovitulemust ning nelja viimase aasta andmetel määratud kvaliteediklassi tuleb eristada.",
    evidencePolicy: "timestamped",
    delivery: "live-service",
    _answerEvidenceEligible: false,
  },
  {
    id: "tartu-noise-map",
    title: "Tartu linna välisõhu strateegiline mürakaart 2022",
    organization: "Tartu linn",
    type: "Ametlik mürakaart",
    published: "16.05.2025",
    url: "https://tartu.ee/et/uurimused/murakaart2022",
    tags: ["müra", "mürakaart", "Tartu", "strateegiline mürakaart", "liiklusmüra", "tööstusmüra", "Lden", "Lnight"],
    summary:
      "Tartu strateegiline mürakaart annab üldhinnangu linna tiheasustusala pikaajalisele müratasemele ja on müra vähendamise tegevuskava alus. See ei ole üksikobjekti ega hetkelise häiringu mõõtmine.",
  },
  {
    id: "wastewater-local-treatment",
    title: "Reovee kohtkäitluse ja äraveo eeskiri",
    organization: "Keskkonnaamet",
    type: "Ametlik juhend",
    published: "jooksev",
    url: "https://keskkonnaamet.ee/kasiraamat-kohaliku-omavalitsuse-keskkonnaspetsialistile/reovee-kohtkaitluse-ja-araveo-eeskiri",
    tags: ["reovesi", "heitvesi", "kohtkäitlus", "omapuhasti", "väikepuhasti", "kogumismahuti", "äravedu", "ühiskanalisatsioon"],
    summary:
      "Keskkonnaameti käsiraamat juhatab kohaliku reovee kohtkäitluse, kogumismahutist äraveo ja ühiskanalisatsiooni purgimise nõuete juurde. Konkreetse kinnistu lahendus sõltub kohaliku omavalitsuse eeskirjast ja ala kanalisatsioonivõimalusest.",
  },
  {
    id: "baltic-sea-litter",
    title: "Läänemere kaitse ja mereprügi vähendamine",
    organization: "Kliimaministeerium",
    type: "Ametlik tegevuskava ja ülevaade",
    published: "27.03.2025",
    url: "https://kliimaministeerium.ee/merendus-veekeskkond/merekeskkonna-kaitse/laanemere-kaitse",
    tags: ["Läänemeri", "meri", "mereprügi", "mikroprügi", "prügi", "HELCOM", "tegevuskava", "merereostus"],
    summary:
      "Kliimaministeeriumi Läänemere kaitse leht seob mereprügi vähendamise HELCOMi tegevuskavaga ning juhatab ametlike seisundihinnangute, meetmete ja seire juurde.",
  },
  {
    id: "hazardous-waste-asbestos",
    title: "Ohtlikud jäätmed ja asbestijäätmed",
    organization: "Kliimaministeerium",
    type: "Ametlik jäätmejuhis",
    published: "jooksev",
    url: "https://www.kliimaministeerium.ee/elukeskkond-ringmajandus/ohtlikud-jaatmed",
    tags: ["ohtlikud jäätmed", "asbest", "asbestijäätmed", "eterniit", "jäätmekäitlus", "üleandmine", "jäätmejaam"],
    summary:
      "Kliimaministeeriumi juhis selgitab ohtlike jäätmete eraldi kogumist ja nõuetekohasele käitlejale üleandmist. Asbesti sisaldavaid ehitusmaterjale ei tohi segada tavajäätmetega.",
  },
  {
    id: "river-dams-fish",
    title: "Paisud Eestis ja nende mõju kaladele",
    organization: "Kliimaministeerium",
    type: "Ametlik teemaülevaade",
    published: "jooksev",
    url: "https://kliimaministeerium.ee/paisud-eestis",
    tags: ["pais", "jõgi", "kalad", "kalastik", "rändetõke", "kalapääs", "kudeala", "vooluveekogu"],
    summary:
      "Kliimaministeeriumi ülevaade selgitab, kuidas paisud katkestavad kalade rändeteid, muudavad jõelist elupaika ning võivad halvendada veekogu seisundit. Leht juhatab ka paisutamise ja kalapääsude käsitluseni.",
  },
  {
    id: "green-network-planning-guide",
    title: "Rohevõrgustiku planeerimisjuhend",
    organization: "Keskkonnaagentuur",
    type: "Ametlik planeerimisjuhend",
    published: "jooksev",
    url: "https://keskkonnaagentuur.ee/uudised/keskkonnaagentuuri-tellimusel-valminud-rohevorgustiku-planeerimisjuhend",
    tags: ["rohevõrgustik", "roheline võrgustik", "planeerimine", "elurikkus", "ökoloogiline sidusus", "tuumala", "koridor"],
    summary:
      "Keskkonnaagentuuri tellitud juhend toetab rohevõrgustiku käsitlemist planeeringutes ning aitab hinnata võrgustiku sidusust, tuumalasid ja koridore.",
  },
  {
    id: "invasive-species-guidance",
    title: "Võõrliigid: ohjamine ja tegevusjuhised",
    organization: "Keskkonnaamet",
    type: "Ametlik liigijuhend",
    published: "jooksev",
    url: "https://www.keskkonnaamet.ee/voorliigid",
    tags: ["võõrliik", "invasiivne liik", "aias", "ohjamine", "teavitamine", "võõrnälkjas", "looduskaitse"],
    summary:
      "Keskkonnaameti võõrliikide leht aitab liike ära tunda ning koondab tõrje-, ohjamis- ja teavitamisjuhised. Liigiti võivad lubatud tegevused erineda.",
  },
  {
    id: "organizational-footprint",
    title: "Organisatsioonide keskkonna- ja kasvuhoonegaaside jalajälg",
    organization: "Kliimaministeerium",
    type: "Ametlik mudel ja juhend",
    published: "jooksev",
    url: "https://www.kliimaministeerium.ee/rohereform-kliima/rohereform/organisatsioonide-jalajalg",
    tags: ["keskkonnajalajälg", "süsinikujalajälg", "KHG jalajälg", "organisatsioon", "avalik sektor", "arvutusmudel", "eriheitetegur"],
    summary:
      "Kliimaministeeriumi püsileht koondab organisatsioonide keskkonna- ja KHG-jalajälje hindamise mudelid, juhendid ning ajakohastatavad eriheitetegurid. Hindamisel tuleb kirjeldada ulatust, mõjualasid ja heiteallikate valikut.",
  },
  {
    id: "wetland-restoration",
    title: "Märgalade ja soode taastamine",
    organization: "Keskkonnaagentuur",
    type: "Ametlik teemaülevaade",
    published: "jooksev",
    url: "https://keskkonnaagentuur.ee/node/2632",
    tags: ["märgala", "soo", "raba", "taastamine", "veerežiim", "süsiniku sidumine", "üleujutus", "elurikkus"],
    summary:
      "Keskkonnaagentuuri ülevaade selgitab märgalade taastamise seost veerežiimi, elurikkuse, vee hoidmise ja süsiniku sidumisega ning toob Eesti taastamisalade näiteid.",
  },
  {
    id: "groundwater-pesticide-monitoring",
    title: "Põhjavee pestitsiidide seiretulemused 2024",
    organization: "Keskkonnaagentuur",
    type: "Riikliku seire ülevaade",
    published: "jooksev",
    url: "https://keskkonnaagentuur.ee/uudised/mida-naitavad-2024-aasta-keskkonnaseire-tulemused-meie-looduskeskkonna-seisundi-kohta",
    tags: ["põhjavesi", "pestitsiid", "taimekaitsevahend", "jääk", "seire", "2024", "keemiline seisund"],
    summary:
      "Keskkonnaagentuuri 2024. aasta riikliku seire ülevaade käsitleb põhjavee keemilist survet ning taimekaitsevahendite jääkide leide seirejaamades. Üksikleid ja põhjaveekogumi koondseisund on eri näitajad.",
  },
  {
    id: "solar-panel-end-of-life",
    title: "Mis saab päikesepaneelidest pärast kasutuse lõppu?",
    organization: "Keskkonnaportaal",
    type: "Ametlik teemaülevaade",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/teemad/taastuvenergia/mis-saab-paikesepaneelidest-ja-tuulikutest-parast-kasutuse-loppu",
    tags: ["päikesepaneel", "päikesepaneelide jäätmed", "elektroonikajäätmed", "ringlussevõtt", "kasutuse lõpp", "taastuvenergia"],
    summary:
      "Keskkonnaportaali ülevaade käsitleb päikesepaneelide materjale, kasutusea lõppu ja ringlussevõttu. Kasutuskõlbmatut paneeli tuleb käidelda elektri- ja elektroonikaseadme jäätmena, mitte segaolmejäätmena.",
  },
  {
    id: "wildlife-status-2025",
    title: "Ulukiasurkondade seisund ja küttimissoovitus 2025",
    organization: "Keskkonnaagentuur",
    type: "Riiklik ulukiseire ülevaade",
    published: "jooksev",
    url: "https://keskkonnaagentuur.ee/uudised/keskkonnaagentuur-avaldas-varske-raporti-milles-antakse-ulevaade-ulukiasurkondade",
    tags: ["uluk", "ulukiseire", "karu", "hunt", "ilves", "arvukus", "asurkond", "2025"],
    summary:
      "Keskkonnaagentuuri 2025. aasta ulukiseire ülevaade koondab jahiulukite arvukuse ja asurkondade muutused ning uue jahihooaja küttimissoovitused, sealhulgas suurkiskjate käsitluse.",
  },
];

// Curated official services are deliberately separate from the legacy search
// fixtures above. Dynamic/register landing pages are navigation results only;
// they cannot become answer evidence until a typed adapter supplies the
// required observation time or registry version.
const ADDITIONAL_OFFICIAL_SERVICE_DOCUMENTS = [
  {
    id: "current-weather-observations",
    title: "Jooksvad ilmavaatlused",
    organization: "Keskkonnaagentuur",
    type: "Reaalaja seireteenus",
    published: "jooksev",
    url: "https://www.ilmateenistus.ee/ilm/ilmavaatlused/vaatlusandmed/",
    tags: ["ilm", "ilmavaatlus", "hetkeilm", "praegu", "temperatuur", "tuul", "sademed", "ilmajaam"],
    summary: "Ilmateenistuse ametlik vaatlusvaade annab ilmajaamade jooksvad mõõtetulemused. Väärtus on tõendatav ainult koos jaama, mõõteaja, näitaja ja ühikuga.",
    evidencePolicy: "timestamped",
    routeClasses: ["official_live_weather", "official_data_or_api"],
    delivery: "live-service",
    freshness: { class: "live", basis: "source-observed-at", maxAgeMs: 15 * 60 * 1000, requiresSourceTimestamp: true },
    _answerEvidenceEligible: false,
  },
  {
    id: "weather-warnings",
    title: "Eesti ilmahoiatused",
    organization: "Keskkonnaagentuur",
    type: "Reaalaja hoiatusteenus",
    published: "jooksev",
    url: "https://www.ilmateenistus.ee/ilm/prognoosid/hoiatused/",
    tags: ["ilm", "ilmahoiatus", "hoiatus", "torm", "tuul", "äike", "libedus", "tuleoht", "üleujutushoiatus", "maakond", "kehtivus"],
    summary: "Ilmateenistuse hoiatusvaade avaldab piirkonna, ohutaseme ning hoiatuse algus- ja lõpuaja. Hoiatust ei tohi esitada kehtivana ilma allika kehtivusaja kontrollita.",
    evidencePolicy: "timestamped",
    routeClasses: ["official_live_weather"],
    delivery: "live-service",
    freshness: { class: "live", basis: "source-validity-window", maxAgeMs: 5 * 60 * 1000, requiresSourceTimestamp: true },
    _answerEvidenceEligible: false,
  },
  {
    id: "current-hydrology-observations",
    title: "Jooksvad hüdroloogilised vaatlused",
    organization: "Keskkonnaagentuur",
    type: "Reaalaja hüdroloogiline seire",
    published: "jooksev",
    url: "https://www.ilmateenistus.ee/siseveed/vaatlusandmed/kaart/",
    tags: ["hüdroloogia", "veetase", "vooluhulk", "veetemperatuur", "jõgi", "järv", "hüdromeetriajaam", "vaatlus"],
    summary: "Ametlik kaart kuvab sisevete vaatlusjaamade jooksvaid veetaseme, vooluhulga ja veetemperatuuri näite. Väärtus vajab jaama ning vaatlusaja sidumist.",
    evidencePolicy: "timestamped",
    routeClasses: ["official_live_water", "official_historical_observation", "official_data_or_api"],
    delivery: "live-service",
    freshness: { class: "live", basis: "source-observed-at", maxAgeMs: 15 * 60 * 1000, requiresSourceTimestamp: true },
    _answerEvidenceEligible: false,
  },
  {
    id: "drinking-water-guidance",
    title: "Joogivee kvaliteet ja terviseohutus",
    organization: "Terviseamet",
    type: "Ametlik juhis ja järelevalveinfo",
    published: "jooksev",
    url: "https://www.terviseamet.ee/keskkonnatervis/vesi/joogivesi",
    tags: ["joogivesi", "kraanivesi", "vee kvaliteet", "terviseohutus", "veevärk", "järelevalve", "Terviseamet"],
    summary: "Terviseameti leht selgitab joogivee kvaliteedi, nõuete ja järelevalve ametlikku käsitlust. Konkreetse piirkonna tulemus vajab proovikoha ja perioodiga algallikat.",
    evidencePolicy: "claim-specific",
    routeClasses: ["official_guidance"],
    delivery: "catalog-and-bounded-hydration",
    freshness: { class: "maintained", basis: "retrieved-at", maxAgeMs: 7 * 24 * 60 * 60 * 1000, requiresSourceTimestamp: false },
    _answerEvidenceEligible: true,
  },
  {
    id: "surface-water-status",
    title: "Pinnaveekogumite seisundiinfo",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Ametlik seisundihinnang ja andmestik",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/teemad/vesi/pinnavesi/pinnaveekogumite-seisundiinfo",
    tags: ["pinnavesi", "veekogum", "ökoloogiline seisund", "keemiline seisund", "jõgi", "järv", "seisundiklass", "seisundihinnang"],
    summary: "Keskkonnaportaali püsileht koondab pinnaveekogumite aasta-, kogumi- ja seisundiliigipõhised hinnangud ning nende metoodika.",
    evidencePolicy: "claim-specific",
    routeClasses: ["official_indicator_or_report", "official_data_or_api"],
    delivery: "structured-or-download",
    freshness: { class: "annual", basis: "source-published-at", maxAgeMs: 550 * 24 * 60 * 60 * 1000, requiresSourceTimestamp: true },
    _answerEvidenceEligible: true,
  },
  {
    id: "national-air-emissions",
    title: "Eesti õhusaasteainete heitkogused",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Riiklik heitkoguste inventuur",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/teemad/v%C3%A4lis%C3%B5hk/eesti-%C3%B5husaasteainete-heitkogused",
    tags: ["välisõhk", "õhusaaste", "heitkogus", "heitkoguste inventuur", "NOx", "SO2", "NH3", "PM2.5", "PM10", "aasta", "aegrida"],
    summary: "Ametlik inventuur koondab Eesti õhusaasteainete aastased heitkogused ainete ja sektorite kaupa. Arvuline väide peab säilitama aasta, aine, ühiku ja inventuuri versiooni.",
    evidencePolicy: "claim-specific",
    routeClasses: ["official_indicator_or_report", "official_data_or_api"],
    delivery: "structured-or-download",
    freshness: { class: "annual", basis: "source-published-at", maxAgeMs: 550 * 24 * 60 * 60 * 1000, requiresSourceTimestamp: true },
    _answerEvidenceEligible: true,
  },
  {
    id: "permitted-source-emissions",
    title: "Keskkonnakaitseluba omavate heiteallikate heitkogused",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Ametlik käitisepõhine heiteandmestik",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/teemad/valisohk/keskkonnakaitseluba-omavate-heiteallikate-heitkogused",
    tags: ["välisõhk", "heiteallikas", "käitis", "ettevõte", "keskkonnaluba", "heitkogus", "KOTKAS", "aastaaruanne", "saasteaine"],
    summary: "Ametlik vaade seob loaga heiteallikad käitiste, saasteainete ja aruandeperioodidega. Dünaamilist väärtust ei tohi tõendada landing page'i kirjeldusega.",
    evidencePolicy: "timestamped",
    routeClasses: ["official_indicator_or_report", "official_data_or_api"],
    delivery: "structured-or-download",
    freshness: { class: "daily-or-annual", basis: "source-observed-or-reporting-period", maxAgeMs: 48 * 60 * 60 * 1000, requiresSourceTimestamp: true },
    _answerEvidenceEligible: false,
  },
  {
    id: "pakis-register",
    title: "Pakendiregister PAKIS",
    organization: "Keskkonnaagentuur",
    type: "Ametlik register",
    published: "jooksev",
    url: "https://pakis.envir.ee/pakis/main/welcome",
    tags: ["PAKIS", "pakendiregister", "pakend", "pakendiettevõtja", "pakendiaruanne", "pakendijäätmed", "tootjavastutus"],
    summary: "PAKIS on pakendivaldkonna ametlik register. Kataloogikirje võib teenusesse suunata, kuid ei tõenda ettevõtte registreeringut ega aruande väärtust.",
    evidencePolicy: "route-only",
    routeClasses: ["official_spatial_or_register", "official_data_or_api"],
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "proto-register",
    title: "Probleemtooteregister PROTO",
    organization: "Keskkonnaagentuur",
    type: "Ametlik register",
    published: "jooksev",
    url: "https://proto.envir.ee/proto/main/welcome",
    tags: ["PROTO", "probleemtooteregister", "probleemtoode", "aku", "patarei", "rehv", "elektriseade", "tootjavastutus"],
    summary: "PROTO on probleemtoodete ametlik register. Kataloogikirje võib teenusesse suunata, kuid ei tõenda ettevõtte registreeringut ega aruande väärtust.",
    evidencePolicy: "route-only",
    routeClasses: ["official_spatial_or_register", "official_data_or_api"],
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "natura-protected-areas",
    title: "Natura 2000 ja kaitstavad alad",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Ametlik ülevaade ja andmestik",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/natura-2000-ja-kaitstavad-alad",
    tags: ["Natura 2000", "kaitseala", "loodusala", "linnuala", "kaitstav ala", "elupaik", "pindala", "looduskaitse", "kaart"],
    summary: "Ametlik püsileht koondab Natura 2000 ja kaitstavate alade üldandmed. Üldandmed ei asenda kinnistu objektiandmeid ega kehtivat kaitse-eeskirja.",
    evidencePolicy: "claim-specific",
    routeClasses: ["official_indicator_or_report", "official_spatial_or_register"],
    delivery: "catalog-and-bounded-hydration",
    freshness: { class: "maintained-or-periodic", basis: "source-published-at", maxAgeMs: 90 * 24 * 60 * 60 * 1000, requiresSourceTimestamp: false },
    _answerEvidenceEligible: true,
  },
  {
    id: "nature-observations",
    title: "Loodusvaatluste andmebaas",
    organization: "Keskkonnaagentuur",
    type: "Ametlik vaatlusregister",
    published: "jooksev",
    url: "https://lva.keskkonnainfo.ee/",
    tags: ["LVA", "loodusvaatlus", "liigivaatlus", "liik", "vaatluskoht", "vaatlusaeg", "fenoloogia", "kaart"],
    summary: "Loodusvaatluste andmebaas koondab vaatlusandmeid. Vaatluskirje ei tõenda iseseisvalt liigi kinnitatud levikut, pesitsemist ega puudumist.",
    evidencePolicy: "route-only",
    routeClasses: ["official_spatial_or_register", "official_data_or_api"],
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "metsaportaal",
    title: "Metsaportaal",
    organization: "Keskkonnaagentuur",
    type: "Ametlik metsaandmete registrivaade",
    published: "jooksev",
    url: "https://register.metsad.ee/",
    tags: ["Metsaportaal", "metsaregister", "katastritunnus", "kinnistu", "maatükk", "puistuandmed", "metsaeraldis", "takseerandmed", "metsateatis", "inventeerimisandmed", "kaart"],
    summary: "Metsaportaal kuvab kinnistu- ja eraldisepõhiseid Metsaregistri andmeid. Kataloogikirje ei tõenda konkreetse eraldise tunnuseid ega tehtud raiet.",
    evidencePolicy: "route-only",
    routeClasses: ["official_spatial_or_register", "official_forestry_evidence"],
    delivery: "catalog-only",
    _answerEvidenceEligible: false,
  },
  {
    id: "climate-policy-data-gateway",
    title: "Kliimapoliitika andmevärav",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Ametlik kliimanäitajate koondvaade",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/teemad/kliimapoliitika-andmevarav",
    tags: ["kliimapoliitika", "kasvuhoonegaas", "KHG", "inventuur", "EL HKS", "ETS", "heitkoguste prognoos", "kliimaeesmärk", "energia"],
    summary: "Andmevärav koondab iga-aastase KHG-inventuuri, EL HKS-i, jõupingutuste jagamise ning heiteprognooside näitajad. Arv peab säilitama aasta, sektori, ühiku ja andmeliigi.",
    evidencePolicy: "claim-specific",
    routeClasses: ["official_indicator_or_report", "official_data_or_api"],
    delivery: "catalog-and-bounded-hydration",
    freshness: { class: "annual", basis: "source-published-at", maxAgeMs: 550 * 24 * 60 * 60 * 1000, requiresSourceTimestamp: true },
    _answerEvidenceEligible: true,
  },
  {
    id: "flood-risk-management",
    title: "Üleujutusriskide hindamine ja maandamine",
    organization: "Kliimaministeerium",
    type: "Ametlik riskihinnang ja kaardid",
    published: "jooksev",
    url: "https://kliimaministeerium.ee/merendus-veekeskkond/veekasutamine-ja-kaitse/uleujutused",
    tags: ["üleujutus", "üleujutusrisk", "riskiala", "üleujutuskaart", "Pärnu", "Haapsalu", "10 aasta", "50 aasta", "100 aasta", "1000 aasta"],
    summary: "Ametlik leht koondab Pärnu ja teiste riskipiirkondade üleujutusriski hindamise ning 10, 50, 100 ja 1000 aasta veetaseme stsenaariumikaardid. Konkreetne asukohaväide peab nimetama stsenaariumi ja kaardiversiooni.",
    content: "Kliimaministeeriumi üleujutusriskide lehelt saab avada Pärnu ja teiste riskipiirkondade kaardid ning võrrelda 10, 50, 100 ja 1000 aasta veetaseme stsenaariume. 100 aasta kaart kirjeldab vastava tõenäosusstsenaariumi riskiala, mitte tänast üleujutushoiatust. Konkreetse kinnistu kohta järelduse tegemiseks tuleb kontrollida täpset asukohta, stsenaariumi ja kaardiversiooni.",
    locator: "Üleujutusohupiirkondade kaardid: Pärnu ning 10, 50, 100 ja 1000 aasta stsenaariumid.",
    evidencePolicy: "claim-specific",
    routeClasses: ["official_indicator_or_report", "official_spatial_or_register"],
    delivery: "catalog-and-bounded-hydration",
    freshness: { class: "six-year-cycle", basis: "source-version", maxAgeMs: 7 * 366 * 24 * 60 * 60 * 1000, requiresSourceTimestamp: true },
    _answerEvidenceEligible: true,
  },
];

const RELATED = {
  mets: ["metsade pindala Eestis", "metsaraie andmed", "metsa looduskaitsepiirangud"],
  kliima: ["Eesti temperatuuritrend", "sademed maakonniti", "kliimastsenaarium 2100"],
  vesi: ["põhjavee seisund", "järvede veekvaliteet", "Läänemere seisund"],
  jäätmed: ["jäätmeteke Eestis", "ringlussevõtu määr", "jäätmeluba KOTKASes"],
};

export function normalize(value = "") {
  return value
    .toLocaleLowerCase("et")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/%/gu, " protsent ")
    .replace(/[^a-z0-9äöõüšž]+/gi, " ")
    .trim();
}

export function splitTextPassages(value = "") {
  return String(value || "")
    .split(/(?:\n+|(?<=[.!?])\s+(?=[„“”"']*(?:\p{Lu}|\p{N}))|\s*[…;•]\s*)/u)
    .map((passage) => passage.trim())
    .filter(Boolean);
}

export function hasCompleteSentenceEnding(value = "") {
  return /[.!?](?:[”"'’)\]]*)$/u.test(String(value || "").trim());
}

const STOP_WORDS = new Set([
  "abil",
  "aga",
  "andmed",
  "andmete",
  "eesti",
  "eestis",
  "jaoks",
  "kohta",
  "korraga",
  "vaata",
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

const DISCOVERY_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "anna",
  "hetkel",
  "koige",
  "millal",
  "millest",
  "minu",
  "oleks",
  "praegune",
  "praegused",
  "selgita",
  "teada",
  "voib",
  "tohib",
  "lubatud",
]);

function discoveryTerm(word) {
  const normalized = normalize(word);
  if (normalized.startsWith("suplusve")) return "suplusvee";
  if (normalized.startsWith("reove") || normalized.startsWith("heitve")) return "reovesi";
  if (normalized.startsWith("mereprug")) return "mereprügi";
  if (normalized.startsWith("rohevorg")) return "rohevõrgustik";
  if (normalized.startsWith("voorliig") || normalized.startsWith("invasiiv")) return "võõrliigid";
  if (normalized.startsWith("margal") || normalized.startsWith("rab") || normalized.startsWith("soo")) return "märgalad";
  if (normalized.startsWith("jaatmekaitluskoh")) return "jäätmekäitluskohad";
  if (normalized.startsWith("autorehv") || normalized.startsWith("rehv")) return "rehvide";
  if (normalized.startsWith("polet")) return "põletamine";
  if (normalized.startsWith("jaat")) return "jäätmed";
  if (normalized.startsWith("ohukval")) return "õhukvaliteet";
  if (normalized.startsWith("pohjave")) return "põhjavesi";
  if (normalized.startsWith("metsastat")) return "metsastatistika";
  return word.toLocaleLowerCase("et");
}

export function buildDiscoveryQuery(query) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok
    || containsPrivatePersonLookup(query)
    || containsPrivatePersonLookup(canonicalInput.query)) return "";
  const providerQuery = minimizePublicProviderQuery(query);
  if (!providerQuery) return "";
  const words = providerQuery.match(/[\p{L}\p{N}:-]+/gu) || [];
  const terms = words
    .filter((word) => {
      const normalized = normalize(word);
      return (/^\d{4}$/u.test(normalized) || normalized.length >= 3)
        && !DISCOVERY_STOP_WORDS.has(normalized);
    })
    .map(discoveryTerm);
  return [...new Set(terms)].slice(0, 7).join(" ");
}

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

// Some short forestry questions lose their actual information need during
// stemming: "Kui palju metsa?" used to become only "mets" and
// "SMI ja metsaandmed" did not retain that it is a comparison of data
// sources. Keep these as small, explicit retrieval intents. They do not add
// facts or bypass live retrieval; they only select better official queries
// and later require a matching passage before an answer may be generated.
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

export function buildDiscoveryQueries(query, limit = 3) {  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok) return [];
  const acceptedQuery = canonicalInput.query;
  // Foreign-script queries fail the provider residual gate, so translate
  // intent into Estonian discovery terms via the keyword bridge instead.
  // Privacy gates already ran on the raw text before retrieval. Only
  // bridge-carrying queries may translate: this preserves the established
  // foreign-script selector path (e.g. 'Emajõe veeandmed 中文'), and a bare
  // sorting verb with no waste word still fails closed via empty bridge.
  // A private-person clause anywhere in the raw query poisons the whole
  // translation: 'лес; Где живёт Иван Петров' must yield zero discovery
  // terms, not ['mets']. The retrieval pipeline re-checks before dispatch,
  // but discovery terms must never be derived from an attack query at all.
  if (containsPrivatePersonLookup(query)) return [];
  const bridgeRoots = russianKeywordRoots(query);
  if (bridgeRoots.length && !buildDiscoveryQuery(acceptedQuery)) {
    // The bridge must carry a domain root, not just a bare sorting verb:
    // 'сортировка' alone stays out-of-scope and must not reach providers.
    if (!bridgeRoots.some(rootIsDomain)) return [];
    const translated = bridgeTermsToDiscoveryQuery(bridgeRoots);
    if (translated) return [translated];
    return [];
  }
  const base = buildDiscoveryQuery(acceptedQuery);
  if (!base) return [];
  const words = base.match(/[\p{L}\p{N}:-]+/gu) || [];
  const roots = queryTerms(acceptedQuery);
  const forestryIntent = forestEvidenceIntent(acceptedQuery);
  const expanded = [];
  if (roots.includes("mets") && roots.some((root) => ["noor", "vanus", "muutus"].includes(root))) {
    expanded.push("mets vanus");
  }
  if (roots.includes("raie") && roots.includes("tulevik")) {
    expanded.push("raiuda tulevikus");
  }
  if (roots.includes("mets") && roots.includes("seire")) {
    expanded.push("metsaseire");
  }
  const focused = words
    .filter((word) => word.length >= 4 && !["eesti", "eestis", "andmed", "kohta"].includes(normalize(word)))
    .sort((left, right) => {
      const generic = (value) => /^(?:mets\w*|keskkond\w*|andm\w*)$/iu.test(normalize(value));
      return Number(generic(left)) - Number(generic(right)) || right.length - left.length;
    });
  const intentDiscovery = forestryIntent?.discoveryQueries || [];
  const preserveEstablishedAgeExpansion = forestryIntent?.kind === "forest-age-trend";
  return [...new Set([
    ...(forestryIntent?.kind === "forest-depletion" ? intentDiscovery : []),
    base,
    ...expanded,
    ...(preserveEstablishedAgeExpansion ? focused : intentDiscovery),
    ...focused,
  ])]
    .slice(0, Math.max(1, Math.min(Number(limit) || 3, 3)));
}

const TALLINN_LOCATION_TOKEN_PATTERN = /^tal{1,2}in{1,2}(?:a(?:s|st|sse|le|l|lt|ga)?|s)?$/u;

function isTallinnLocationToken(value) {
  return TALLINN_LOCATION_TOKEN_PATTERN.test(String(value || ""));
}

function textHasTallinnLocation(value) {
  return String(value || "").split(/\s+/u).some(isTallinnLocationToken);
}

function topicRoot(word) {
  // Two high-frequency one-character portal/topic misspellings are kept
  // deliberately narrow; broader fuzzy matching would admit unrelated words.
  // English mappings below are inert in Estonian-only mode (see
  // isMultilingualSearchEnabled); Estonian branches are unaffected.
  const multilingual = isMultilingualSearchEnabled();
  if (word.startsWith("keskonnaportaal") || word.startsWith("keskkonnaportaal")) return "keskkonnaportaal";
  if (word.startsWith("keskkonnportal")) return "keskkonnaportaal";
  if (word.startsWith("keskonnaandm")) return "andmed";
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
  if (word === "eelis" || word.startsWith("eelise")) return "register";
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
  if (word.startsWith("lagerai")) return "raie";
  if (word.startsWith("metsateatis") || word.startsWith("raieteatis")) return "mets";
  if (word.startsWith("kuusk") || word.startsWith("kuuse") || word.startsWith("kuusik")) return "mets";
  if (word.startsWith("mand") || word.startsWith("manni") || word.startsWith("mannik")) return "mets";
  if (word.startsWith("rai")) return "raie";
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
  if (word.startsWith("pakend")) return "jaat";
  if (word.startsWith("taaskasut")) return "ringlussevott";
  if (word.startsWith("kulmkapp") || word.startsWith("kodumasin") || word.startsWith("elektroonik")) return "jaatmekaitluskoht";
  if (word.startsWith("patarei") || word.startsWith("ravim") || word.startsWith("varvipurk")) return "jaat";
  if (word.startsWith("aku")) return "aku";
  if (word.startsWith("jaat")) return "jaat";
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
  if (word.startsWith("saast")) return "saaste";
  if (word.startsWith("reost")) return "saaste";
  if (word.startsWith("veereost")) return "saaste";
  if (word.startsWith("reove") || word.startsWith("heitve")) return "reovesi";
  if (word.startsWith("heit")) return "heide";
  if (word.startsWith("looduskait")) return "looduskaitse";
  if (word.startsWith("elurikk")) return "elurikkus";
  if (word.startsWith("rohevorg") || word.startsWith("rohekoridor")) return "rohevorgustik";
  if (word.startsWith("voorliig") || word.startsWith("invasiiv") || word.startsWith("karuputk")) return "voorliik";
  if (word.startsWith("uluk") || word.startsWith("karu") || word.startsWith("hund") || word.startsWith("ilves") || word.startsWith("suurkisk")) return "uluk";
  if (word.startsWith("elupaik") || word.startsWith("elupaig") || word.startsWith("vaariselupa") || word.startsWith("varjepaig")) return "elupaik";
  if (word.startsWith("pusielupai")) return "pusielupaik";
  if (word.startsWith("hoiual")) return "kaitseala";
  if (word.startsWith("rahvuspar")) return "kaitseala";
  if (word.startsWith("kaitseal")) return "kaitseala";
  if (word.startsWith("kaitstav")) return "kaitstav";
  if (word.startsWith("liig") || word.startsWith("rahni") || word.startsWith("nahkhiir") || word.startsWith("hulj")
    || word.startsWith("konn") || word.startsWith("pesapaig")) return "liik";
  if (word.startsWith("suplusve") || word.startsWith("rannave") || word.startsWith("supluskoh")
    || word.startsWith("rannas") || word.startsWith("ranna") || word.startsWith("rand")) return "suplusvesi";
  if (word.startsWith("rannikumer")) return "meri";
  if (word.startsWith("joogive") || word.startsWith("kraanive")) return "joogivesi";
  if (word.startsWith("vaikepuhast") || word.startsWith("omapuhast") || word.startsWith("kohtkait") || word.startsWith("kogumismahut")) return "kohtkaitlus";
  if (word.startsWith("pestitsiid") || word.startsWith("taimekaitsevah")) return "pestitsiid";
  if (word.startsWith("nitraat")) return "nitraat";
  if (word.startsWith("pinnave")) return "vesi";
  if (word.startsWith("pohjave")) return "pohjavesi";
  if (word.startsWith("puurkaev") || word.startsWith("puurauk") || word.startsWith("salvkaev") || word.startsWith("kaevu")) return "puurkaev";
  if (word.startsWith("registr")) return "register";
  if (word === "bht7") return "vesi";
  if (word === "bod7") return "vesi";
  if (word.startsWith("mereprug")) return "mereprugi";
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
  if (word.startsWith("jog") || word.startsWith("joe")) return "jogi";
  if (["vee", "vees", "veest", "veega", "vett"].includes(word) || word.startsWith("veek")) return "vesi";
  if (word.startsWith("veetas") || word.startsWith("vooluhulk") || word.startsWith("kraavive")) return "vesi";
  if (word.startsWith("laht") || word.startsWith("lahes")) return "meri";
  if (word.startsWith("mer")) return "meri";
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
  if (word.startsWith("transpor")) return "transport";
  if (word.startsWith("maavar")) return "maavara";
  if (word.startsWith("kaevand") || word.includes("karjaar")) return "kaevandus";
  if (word.startsWith("korrasta")) return "korrastamine";
  if (word.startsWith("polevkiv")) return "polevkivi";
  if (word.startsWith("mull")) return "muld";
  if (word.startsWith("mura")) return "mura";
  if (word.startsWith("margal") || word.startsWith("turba") || word.startsWith("rab") || /^soo(?:d|s|st|de|del|des)?$/u.test(word)) return "margala";
  if (word.startsWith("taasta")) return "taastamine";
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

export function queryTerms(query) {
  const normalizedQuery = normalize(query);
  const multilingualPhrases = isMultilingualSearchEnabled();
  const roots = [...new Set(normalizedQuery
    .split(/\s+/u)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/u.test(word))
    .flatMap((word) => {
      if (word.startsWith("keskkonnainfo")) return ["keskkond"];
      if (multilingualPhrases && word.startsWith("nesting")) return ["elupaik"];
      if ((word.startsWith("press") || word.startsWith("contact"))
        && /\bofficial\s+press\s+contact\b[\s\S]{0,60}\bprivate\s+contact\b/u.test(normalizedQuery)) {
        return ["keskkond"];
      }
      if (/\bbioloog(?:i|l)\w*\s+mitmekesis\w*\b/u.test(normalizedQuery)
        && (/^bioloog(?:i|l)\w*$/u.test(word) || /^mitmekesis\w*$/u.test(word))) return [];
      if (word.startsWith("sorteer")
        && /\b(?:jaat\w*|prugi\w*|pakend\w*|biojaat\w*)\b/u.test(normalizedQuery)) return ["jaat"];
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
      if (word.startsWith("metsaandm") || word.startsWith("metsandusandm")) return ["mets", "andmed"];
      if (word.startsWith("metsaregis")) return ["mets", "metsaregister"];
      if (word.startsWith("kliimastsenaarium")) return ["kliima", "stsenaarium"];
      if (word.startsWith("mereprug")) return ["meri", "mereprugi"];
      if (word.startsWith("asbestijaat")) return ["asbest", "jaat"];
      if (word.startsWith("paikesepaneelijaat")) return ["paikesepaneel", "jaat"];
      if (word.startsWith("suplusveekvalite")) return ["suplusvesi", "seisund"];
      if (word.startsWith("ohusaast")) return ["ohk", "saaste"];
      if (word === "kmh" || word === "ksh") return [word, "keskkonnamoju"];
      if (word.startsWith("pm2")) return ["pm25", "ohukvaliteet"];
      if (word.startsWith("pm10")) return ["pm10", "ohukvaliteet"];
      return [topicRoot(word)];
    }))];
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
  if (/\bwind\s+farm\b/u.test(normalizedQuery)) phraseRoots.push("tuulepark");
  if (/\boil\s+shale\b/u.test(normalizedQuery)
    || /\bshale\s+oil\b/u.test(normalizedQuery)) phraseRoots.push("polevkivi", "kaevandus");
  if (/\b(?:river|water)\s+levels?\b/u.test(normalizedQuery)) phraseRoots.push("veetase");
  if (/\bprotected\s+areas?\b/u.test(normalizedQuery)) phraseRoots.push("kaitseala");
  if (/\bmarine\s+litter\b/u.test(normalizedQuery)) phraseRoots.push("mereprugi");
  if (/\bclimate\s+change\b/u.test(normalizedQuery)) phraseRoots.push("kliima");
  if (/\bforest\s+data\s+(?:map|maps|mapping)\b/u.test(normalizedQuery)) phraseRoots.push("ruumikiht");
  if (/\bmetsa\w*\s+andm\w*\s+kaart\w*\b/u.test(normalizedQuery)) phraseRoots.push("ruumikiht");
  if (/\bbiodiversity\s+(?:observation\w*\s+)?database\b/u.test(normalizedQuery)) phraseRoots.push("loodusvaatlus");
  if (/\bspecies\s+observations?\b/u.test(normalizedQuery)
    || /\bnature\s+observations?\b/u.test(normalizedQuery)) phraseRoots.push("loodusvaatlus");
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

export function queryRootVariants(root) {
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
  if (root === "lubatavus") return ["ei tohi", "tohib", "lubat", "keelat"];
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
  if (root === "kaitseala") return ["kaitseal", "protected area"];
  if (root === "elupaik") return ["elupaik", "elupaig", "habitat"];
  if (root === "statistika") return ["statist", "smi", "inventuur", "pxweb"];
  if (root === "tulemus") return ["tulemus"];
  if (root === "tulevik") return ["tulevik", "prognoos", "lahiaast"];
  if (root === "kadumine") return ["kadum", "kaob", "kaovad", "havim", "havib", "havivad", "otsa saam", "enam metsa pole"];
  if (root === "andmed") return ["andme", "avaand", "data"];
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
  if (root === "rohevorgustik") return ["rohevorg", "roheline vorgustik", "rohekoridor"];
  if (root === "voorliik") return ["voorliik", "invasiiv"];
  if (root === "uluk") return ["uluk", "karu", "suurkisk", "wildlife", "animal"];
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
  return [root];
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

const DOMAIN_ROOTS = new Set([
  "mets", "raie", "juurdekasv", "metsaandmed", "metsaregister", "kliima", "ilm", "prognoos", "hoiatus", "temperatuur", "sademed", "tuul",
  "vesi", "jarv", "jogi", "meri", "laanemeri", "pohjavesi", "puurkaev", "jaaolud", "ohk", "ohukvaliteet", "saaste", "heide", "kasvuhoonegaas",
  "jaat", "jaatmekaitluskoht", "prugi", "rehv", "polet", "ringmajandus", "ringlussevott", "loodus", "looduskaitse", "elurikkus", "elupaik",
  "kaitseala", "natura", "liik", "seire", "loodusvaatlus", "eutrofeerumine", "keskkond", "keskkonnaportaal", "keskkonnaluba", "menetlus", "piirang", "lubatavus",
  "suplusvesi", "joogivesi", "reovesi", "kohtkaitlus", "pestitsiid", "nitraat", "mereprugi", "asbest", "biojaatmed",
  "rohevorgustik", "voorliik", "uluk", "margala", "pais", "kala", "osoon", "paikesepaneel", "jalajalg", "susinik",
  "tuulepark", "aku", "uleujutusrisk",
  "kodus", "kalapuuk", "ranne",
  "keskkonnamoju", "kotkas", "kmh", "ksh", "kataster", "kinnistu", "metsaregister",
  "elektriauto", "energia", "transport", "kütus", "kytus", "maavara", "kaevandus", "muld",
  "mura", "kiirgus", "climate", "forest", "water", "weather", "pollution", "waste",
  "biodiversity", "nature", "air", "animal", "species", "habitat", "wildlife", "woodland",
  "sea", "ocean", "river", "lake", "data", "andmed", "metaandmed", "api", "statistika", "ruumikiht", "allalaadimine", "kaart", "register", "metsateatis",
]);
// English-only domain roots: inert in Estonian-only mode so English
// passthrough words cannot satisfy scope gating on their own. "data" and
// "api" stay language-neutral (used in Estonian technical text).
const ENGLISH_ONLY_DOMAIN_ROOTS = new Set([
  "climate", "forest", "water", "weather", "pollution", "waste",
  "biodiversity", "nature", "air", "animal", "species", "habitat", "wildlife", "woodland",
  "sea", "ocean", "river", "lake",
]);
const ADMIN_CONTEXT_ROOTS = new Set([
  "tallinn", "tartu", "parnu", "parnumaa", "narva", "viljandi", "rakvere", "voru",
  "kuressaare", "haapsalu", "johvi", "harjumaa", "saaremaa", "kohtla", "ida", "virumaa",
]);
const AMBIGUOUS_ROOTS = new Set([
  "vesi", "jarv", "ohk", "ohukvaliteet", "saaste", "jaat", "looduskaitse", "elurikkus",
  "kliima", "ilm", "keskkond", "energia", "elektriauto", "seire", "andmed",
  "prugi", "heide", "keskkonnaluba", "menetlus", "piirang", "kaart", "register", "mura",
  "temperatuur", "raie", "juurdekasv", "ringlussevott", "kaitseala", "liik", "kala", "jogi",
  "meri", "kaevandus", "pohjavesi", "sademed",
]);
const DOMAIN_FAMILY_BY_ROOT = new Map([
  ["mets", "forest"], ["raie", "forest"], ["juurdekasv", "forest"], ["metsaregister", "forest"],
  ["kliima", "climate"], ["ilm", "weather"], ["temperatuur", "weather"], ["sademed", "weather"],
  ["vesi", "water"], ["jarv", "water"], ["jogi", "water"], ["meri", "water"], ["laanemeri", "water"],
  ["water", "water"], ["sea", "water"], ["ocean", "water"], ["river", "water"], ["lake", "water"],
  ["pohjavesi", "water"], ["suplusvesi", "water"], ["joogivesi", "water"], ["reovesi", "water"], ["mereprugi", "water"], ["pais", "water"],
  ["ohk", "air"], ["ohukvaliteet", "air"], ["saaste", "air"], ["osoon", "air"],
  ["jaat", "waste"], ["prugi", "waste"], ["asbest", "waste"], ["biojaatmed", "waste"],
  ["looduskaitse", "nature"], ["elurikkus", "nature"], ["liik", "nature"], ["kala", "nature"],
  ["nature", "nature"], ["biodiversity", "nature"], ["animal", "nature"], ["species", "nature"],
  ["habitat", "nature"], ["wildlife", "nature"], ["forest", "forest"], ["woodland", "forest"],
  ["voorliik", "nature"], ["uluk", "nature"], ["margala", "nature"], ["rohevorgustik", "nature"],
  ["muld", "soil"], ["maavara", "soil"], ["kaevandus", "soil"],
  ["energia", "energy"], ["transport", "energy"], ["elektriauto", "energy"], ["paikesepaneel", "energy"],
  ["aku", "energy"], ["uleujutusrisk", "water"],
  ["api", "data"], ["data", "data"], ["andmed", "data"], ["metaandmed", "data"], ["statistika", "data"],
  ["ruumikiht", "spatial"], ["kaart", "spatial"], ["register", "spatial"],
  ["keskkonnaluba", "legal"], ["menetlus", "legal"], ["piirang", "legal"], ["lubatavus", "legal"],
]);
const PROMPT_OR_SECRET_PATTERN = /(?:ignore\s+(?:(?:all|previous)\s+)*(?:instructions?|prompts?)|(?:ignoreeri|eira)\s+(?:(?:kõiki|koiki|eelnev\w*|varasem\w*|süsteemi\w*)\s+)*(?:(?:süsteemi)?juhis\w*|korraldus\w*|reegl\w*|prompt\w*)|system\s+prompt|developer\s+message|api[- ]?key|api\s*(?:võti|voti)|reveal\s+(?:the\s+)?secret|unusta\s+(?:eelnev\w*|juhis\w*)|salajas\w*\s+juhis\w*|(?:avalda|anna|näita|naita|kuva|paljasta)\s+(?:(?:api[- ]?)?(?:saladus\w*|võti\w*|voti\w*|parool\w*|token\w*))|(?:näita|naita|kuva|avalda)\s+serveri\s+(?:keskkonnamuutuj\w*|environment\s+variables?)|(?:show|reveal|return|print|display|give)\s+(?:me\s+)?(?:the\s+)?(?:hidden|internal|system|developer)\s+(?:prompt|instructions?|message)|(?:database|server|system)\s+(?:password|secret|credentials?|token))/iu;
const PRIVILEGED_ROLE_INSTRUCTION_PATTERN = /(?<!\p{L})(?:act|behave|pretend)\s+as\s+(?:an?\s+)?(?:(?:server|system|database)\s+)?(?:administrator|admin)(?!\p{L})/iu;
const ENGLISH_HIDDEN_INSTRUCTION_REQUEST_PATTERN = /\b(?:show|reveal|return|print|display|give|provide|tell|what\s+is)\b[\s\S]{0,100}\b(?:hidden|internal|developer|system)(?:\s+\p{L}+){0,3}\s+(?:prompt|instructions?|message)\b/iu;
const ENGLISH_SECRET_REQUEST_PATTERN = /\b(?:show|reveal|return|print|display|give|provide|tell)\b[\s\S]{0,100}\b(?:(?:api|database|server|system)\s+)?(?:credentials?|secrets?|passwords?|tokens?)\b/iu;
const ESTONIAN_HIDDEN_INSTRUCTION_REQUEST_PATTERN = /\b(?:näita|naita|kuva|avalda|paljasta|mis\s+on)\b[\s\S]{0,100}\b(?:varjatud\s+(?:s[üu]steemi?)?(?:viip|prompt|juhis)\w*|s[üu]steemi(?:viip|prompt|juhis)\w*|arendaja\s+(?:viip|prompt|juhis)\w*)/iu;
const EXECUTABLE_MARKUP_PATTERN = /(?:<\s*(?:script|img|svg|iframe)\b[^>]*(?:onerror|onload|javascript:)?|\bon(?:error|load)\s*=|javascript\s*:)/iu;
const PERSONAL_LOOKUP_PATTERNS = Object.freeze([
  /\baadressil\b[\s\S]{0,80}\b(?:elab|elanikk?[\p{L}\p{N}_-]*|isik[\p{L}\p{N}_-]*|keegi)\b/iu,
  /\b(?:kodune\s+aadress[\p{L}\p{N}_-]*|kodu\s+asukoht[\p{L}\p{N}_-]*)\b/iu,
  /\b(?:konkreetse|kindla)\s+(?:inimese|isiku|eraisiku)\b[\s\S]{0,80}\b(?:puurkaev[\p{L}\p{N}_-]*|kinnist[\p{L}\p{N}_-]*|aadress[\p{L}\p{N}_-]*|andm[\p{L}\p{N}_-]*)/iu,
  /\bkes\s+elab\b[\s\S]{0,60}\b[\p{L}'’-]{2,40}\s+\d{1,4}[a-z]?\b/iu,
  /\belanike?\s+nime[\p{L}\p{N}_-]*\b/iu,
  /\b(?:kellele\s+kuulub|omaniku\s+nimi|kes\s+on[\s\S]{0,40}\bomanik)\b[\s\S]{0,100}\b(?:katastri[\p{L}\p{N}_:-]*|kinnist[\p{L}\p{N}_-]*|maa(?:u|ü)ksus[\p{L}\p{N}_:-]*|puurkaev[\p{L}\p{N}_-]*|aadress[\p{L}\p{N}_-]*)/iu,
  /\b(?:leia|otsi|näita|naita)\s+[\p{L}'’-]{2,40}\s+[\p{L}'’-]{2,40}\s+(?:kinnist[\p{L}\p{N}_-]*|maat[\p{L}\p{N}_-]*|maa(?:u|ü)ksus[\p{L}\p{N}_-]*|aadress[\p{L}\p{N}_-]*|puurkaev[\p{L}\p{N}_-]*)\b/iu,
]);
const ENGLISH_OWNER_ENUMERATION_ACTION_PATTERN = /\b(?:list|show|find|identify|return|give|provide|reveal|disclose|name|enumerate|display)\b[\s\S]{0,100}\b(?:(?:all|the|private|current|registered)\s+){0,4}(?:owners?|landowners?|homeowners?|proprietors?|landholders?|landlords?)\b[\s\S]{0,100}\b(?:register|registry|database|permits?|properties|property|parcels?|plots?|land|houses?|homes?|farms?|wells?|boreholes?|buildings?|dwellings?)\b/iu;
const ENGLISH_WHO_OWNER_ASSET_PATTERN = /\bwho\s+(?:is|are)\s+(?:(?:all|the|private|current|registered)\s+){0,4}(?:owners?|landowners?|homeowners?|proprietors?|landholders?|landlords?)\s+of\b[\s\S]{0,80}\b(?:properties|property|parcels?|plots?|land|houses?|homes?|farms?|wells?|boreholes?|buildings?|dwellings?)\b/iu;
const ENGLISH_PERSONAL_LOOKUP_PATTERNS = Object.freeze([
  ENGLISH_OWNER_ENUMERATION_ACTION_PATTERN,
  ENGLISH_WHO_OWNER_ASSET_PATTERN,
  // Ownership and occupancy questions can turn an otherwise ordinary
  // environmental term into a private-person registry lookup. Keep these
  // patterns independent of the domain vocabulary so every admitted English
  // root receives the same pre-retrieval privacy treatment.
  /\bwho\s+(?:owns?|is\s+the\s+(?:registered\s+)?owner\s+of)\b[\s\S]{0,120}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|cadastral\s+(?:unit|parcel)|street\s+address)\b/iu,
  /\bwho\s+(?:currently\s+)?(?:lives?|resides?|stays?)\s+(?:at|on)\b/iu,
  /\bwhat\s+is\s+[\p{L}'’-]{2,40}\s+[\p{L}'’-]{2,40}(?:'s|’s)\s+(?:home\s+)?(?:address|residence|phone|telephone|email|contact(?:\s+(?:details|information))?)\b/iu,
  /\b(?:name|identity|address|phone|telephone|email|contact(?:\s+(?:details|information))?)\s+of\s+the\s+(?:owner|resident|occupant|landowner|homeowner)\b/iu,
  /\b(?:owner|resident|occupant|landowner|homeowner)(?:'s|’s)?\s+(?:name|identity|address|phone|telephone|email|contact(?:\s+(?:details|information))?)\b/iu,
  /\b(?:find|identify|locate|show|give|tell)\b[\s\S]{0,100}\b(?:private\s+person|individual|resident|occupant|landowner|homeowner)\b[\s\S]{0,100}\b(?:property|parcel|plot|land|house|home|farm|well|borehole|address|phone|telephone|email|contact)\b/iu,
  /\b(?:(?:can\s+you\s+|please\s+)?(?:tell(?:\s+me)?|look\s*up|lookup|find|identify|show|provide|reveal|disclose|get|give)|i\s+need)\b[\s\S]{0,100}\b(?:owner|landowner|homeowner)\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)\b/iu,
  /\bwhose\s+(?:(?:forest|woodland|land|cadastral|private)\s+){0,2}(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)\b/iu,
  /\bwho\s+(?:rents?|leases?|uses?|holds?)\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)\b/iu,
  /\bwho\s+is\s+the\s+(?:tenant|lessee|renter|occupant)\s+of\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)\b/iu,
  /\b(?:name|identity|contact)\s+of\s+the\s+(?:tenant|lessee|renter|occupant)\s+of\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)\b/iu,
  /\bwho\s+is\s+(?:the\s+)?(?:proprietor|landholder|landlord|resident|occupant|inhabitant)\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|address|street)\b/iu,
  /\bwho\s+(?:currently\s+)?inhabits?\s+(?:at|on)?\b[\s\S]{0,100}\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|address|street)\b/iu,
  /\b(?:list|show|find|identify|return|give|provide|reveal|disclose|name|enumerate|display)\b[\s\S]{0,80}\bprivate\s+(?:owners?|landowners?|homeowners?|residents?|individuals?|people|persons?)\b[\s\S]{0,80}\b(?:register|registry|database|permits?)\b/iu,
  /\b(?:list|show|find|identify|return|give|provide|reveal|disclose)\b[\s\S]{0,80}\b(?:names?|identities)\s+of\s+(?:all\s+)?(?:owners?|landowners?|homeowners?|residents?)\b[\s\S]{0,80}\b(?:register|registry|database)\b/iu,
  /\b(?:which|what)\s+(?:individuals?|people|persons?|owners?|landowners?|homeowners?)\s+(?:own|hold|lease|rent)\w*\b[\s\S]{0,80}\b(?:properties|parcels|plots|land|houses|homes|farms|wells|boreholes)\b/iu,
  /\bwho\s+are\s+(?:the\s+)?(?:private\s+)?(?:owners?|landowners?|homeowners?)\s+of\b[\s\S]{0,80}\b(?:properties|parcels|plots|land|houses|homes|farms|wells|boreholes)\b/iu,
  /\b(?:locate|find|identify)\s+[\p{L}'’-]{2,40}\s+[\p{L}'’-]{2,40}\s+(?:home|address|residence|property|parcel)\b[\s\S]{0,80}\b(?:register|registry|database)\b/iu,
]);
const ENGLISH_PERSON_TOKEN_SOURCE = String.raw`(?:\p{L}\.?|[\p{L}][\p{L}'’]{1,39})`;
const ENGLISH_PERSON_SEPARATOR_SOURCE = String.raw`(?:[\s\p{Pd}./·:_]+)`;
const ENGLISH_PERSON_NAME_SOURCE = String.raw`${ENGLISH_PERSON_TOKEN_SOURCE}${ENGLISH_PERSON_SEPARATOR_SOURCE}${ENGLISH_PERSON_TOKEN_SOURCE}(?:${ENGLISH_PERSON_SEPARATOR_SOURCE}${ENGLISH_PERSON_TOKEN_SOURCE})?`;
const ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE = String.raw`\p{Lu}[\p{Ll}'’]{1,39}${ENGLISH_PERSON_SEPARATOR_SOURCE}\p{Lu}[\p{Ll}'’]{1,39}(?:${ENGLISH_PERSON_SEPARATOR_SOURCE}\p{Lu}[\p{Ll}'’]{1,39})?`;
const ENGLISH_PRIVATE_ASSET_SOURCE = String.raw`(?:(?:(?:the|this|that|specific|private|privately\s+held|nonpublic|non[-\s]+government|isolated|secluded|protected|neighbor(?:ing)?|neighbour(?:ing)?|adjacent|adjoining|separate|separately\s+held|independent(?:ly\s+held)?|unrelated|family|household|residential|farm|forest|woodland|land|cadastral|groundwater|riverside|riverbank|lakeshore|waterside|shoreline|creekside|marsh|wetland|meadow)\s+){0,4}(?:property|parcel|plot|lot|estate|land|unit|house|home|farm|farmhouse|farmstead|well|borehole|wetland|marsh|meadow|pond|building|dwelling|cottage|premises|site|installation|landholding|holding|forest|woodland))`;
const ENGLISH_NAMED_POSSESSIVE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PERSON_NAME_SOURCE}(?:'s|’s)\s+${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "iu",
);
const ENGLISH_NAMED_ASSET_ASSOCIATION_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE}\s+${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "u",
);
const ENGLISH_ASSET_TO_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PRIVATE_ASSET_SOURCE}\b[\s\S]{0,40}\b(?:registered\s+(?:to|under)|recorded\s+under|belongs?\s+to|owned\s+by|held\s+by|associated\s+with|connected\s+to|linked\s+to)\s+${ENGLISH_PERSON_NAME_SOURCE}(?!\p{L})`,
  "iu",
);
const ENGLISH_ASSET_IN_PERSON_NAME_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PRIVATE_ASSET_SOURCE}\b[\s\S]{0,30}\b(?:registered|recorded)\s+in\s+${ENGLISH_PERSON_NAME_SOURCE}(?:'s|’s)\s+name\b`,
  "iu",
);
const ENGLISH_PERSON_TO_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PERSON_NAME_SOURCE}\s+(?:has|holds?|rents?|leases?|uses?)\s+(?:an?\s+|the\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "iu",
);
const NAMED_PERSON_CADASTRAL_FIELD_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE}\s+(?:cadastral\s+(?:[Ii][Dd]|parcel|unit|number|identifier)|katastri\w*)(?!\p{L})`,
  "u",
);
const ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN = new RegExp(
  String.raw`(?<!\p{L})([\p{L}][\p{L}'’.-]{1,39})\s+([\p{L}][\p{L}'’.-]{1,39})\s+(?:(?:cadastral|katastri)\s+(?:id|parcel|unit|number|identifier)|(?:parcel|unit|property|plot|land)\s+(?:id|number|identifier))(?!\p{L})`,
  "giu",
);
const CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\p{N}])\d{5}:\d{3}:\d{4}\s+(?:(?:for|of|to)|(?:owned|held|managed|registered|recorded|assigned|attributed|linked|associated)\s+(?:by|for|to|under|with))\s+(?:the\s+)?(${ENGLISH_PERSON_NAME_SOURCE})(?=$|[\s]*[.?!,;:])`,
  "giu",
);
const GENERIC_CADASTRAL_FIELD_PREFIXES = new Set([
  "cadastral parcel", "cadastral unit", "find the", "forest area", "forest cover",
  "forest register", "is the", "land parcel", "land register", "official register",
  "public register", "search the", "show the", "what is", "woodland area", "woodland cover",
]);

function hasNamedPersonCadastralAssociation(value) {
  const text = String(value || "");
  ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN)) {
    const prefix = `${match[1]} ${match[2]}`.toLocaleLowerCase("en");
    if (!GENERIC_CADASTRAL_FIELD_PREFIXES.has(prefix)) {
      ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN.lastIndex = 0;
      return true;
    }
  }
  ANY_CASE_PERSON_CADASTRAL_FIELD_PATTERN.lastIndex = 0;
  CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN)) {
    const candidate = match[1] || "";
    if (!isReviewedPublicEntityName(candidate)) {
      CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN.lastIndex = 0;
      return true;
    }
  }
  CADASTRAL_TO_NAMED_PERSON_ASSOCIATION_PATTERN.lastIndex = 0;
  return false;
}
const ENGLISH_PERSON_ROLE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PERSON_NAME_SOURCE}\s+is\s+(?:(?:listed|recorded)\s+as\s+)?(?:the\s+)?(?:owner|landowner|homeowner|tenant|lessee|renter|occupant)\s+of\s+(?:an?\s+|the\s+|this\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "iu",
);
const ENGLISH_PERSON_APPOSITIVE_ROLE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PERSON_NAME_SOURCE}\s*,\s*(?:the\s+)?(?:owner|landowner|landholder|proprietor|tenant|lessee|renter|occupant|manager|operator|custodian|administrator|authorized\s+user|responsible\s+person)\s+of\s+(?:an?\s+|the\s+|this\s+|that\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "iu",
);
const ENGLISH_WHERE_RESIDENCE_PATTERN = new RegExp(
  String.raw`\bwhere\s+(?:does|is)\s+(${ENGLISH_PERSON_NAME_SOURCE})\s+(?:live|living|reside|residing|stay|staying)\b`,
  "iu",
);
const ENGLISH_WHERE_FOUND_PATTERN = new RegExp(
  String.raw`\bwhere\s+can\s+(${ENGLISH_PERSON_NAME_SOURCE})\s+be\s+found\b`,
  "iu",
);
const ENGLISH_WHERE_LOCATED_PATTERN = new RegExp(
  String.raw`\bwhere\s+is\s+(${ENGLISH_PERSON_NAME_SOURCE})\s+located\b[\s\S]{0,80}\b(?:forest|woodland|natura|protected|river|lake|sea|address|property|parcel|well|borehole)\b`,
  "iu",
);
const ENGLISH_LOCATE_PERSON_PATTERN = new RegExp(
  String.raw`\b(?:find|locate)\s+(${ENGLISH_PERSON_NAME_SOURCE})\b[\s\S]{0,60}\b(?:near|at|in)\b[\s\S]{0,50}\b(?:forest|woodland|natura|protected|river|lake|sea|address|property|parcel|well|borehole)\b`,
  "iu",
);
const PUBLIC_ORGANIZATION_PATTERN = /(?<![\p{L}\p{N}])(?:[\p{L}-]*(?:amet|agentuur|ministeerium|keskus|linnavalitsus|vallavalitsus|omavalitsus|ülikool|instituut|selts|ühing|sihtasutus|osaühing|aktsiaselts|teenistus|muuseum)[\p{L}-]*|(?:environment(?:al)?|climate|forest|nature|water|land|health|statistics)\s+(?:board|agency|ministry|authority|service|institute|university|museum|centre|center)|municipalit\w*|ministry\s+of\s+(?:climate|the\s+environment)|EELIS\w*|keskkonnaseire\s+infos[üu]steem\w*|RMK|KIK|Tallinna\s+Vesi|Eesti\s+Energia|Eesti\s+Geoloogiateenistus[\p{L}-]*|Elering(?:\s+AS)?)(?![\p{L}\p{N}])/iu;
const PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS = Object.freeze([
  /\b(?:eesti\s+)?keskkonnauuringute\s+keskus[\p{L}-]*\b/giu,
  /\b(?:kohalik\w*\s+)?omavalitsus[\p{L}-]*\b/giu,
  /\bmunicipalit\w*\b/giu,
  /\b(?:euroopa\s+)?keskkonnaagentuur[\p{L}-]*\b/giu,
  /\bkeskkonnaamet[\p{L}-]*\b/giu,
  /\bkeskkonnaportaal[\p{L}-]*\b/giu,
  /\beelis\w*\b/giu,
  /\bkeskkonnaseire\s+infos[üu]steem[\p{L}-]*\b/giu,
  /\bkliimaministeerium[\p{L}-]*\b/giu,
  /\bmaa-?\s+ja\s+ruumiamet[\p{L}-]*\b/giu,
  /\briigi\s+teataja[\p{L}-]*\b/giu,
  /\briigimetsa\s+majandamise\s+keskus[\p{L}-]*\b/giu,
  /\bstatistikaamet[\p{L}-]*\b/giu,
  /\bterviseamet[\p{L}-]*\b/giu,
  /\btallinna\s+(?:vesi|vee)[\p{L}-]*\b/giu,
  /\btartu\s+ülikool[\p{L}-]*\b/giu,
  /\btartu\s+keskkonna(?:hariduse\s+)?keskus[\p{L}-]*\b/giu,
  /\bpõllumajandus-?\s+ja\s+toiduamet[\p{L}-]*\b/giu,
  /\beesti\s+geoloogiateenistus[\p{L}-]*\b/giu,
  /\bkeskkonna\s+investeeringute\s+keskus[\p{L}-]*\b/giu,
  /\briigi\s+ilmateenistus[\p{L}-]*\b/giu,
  /\beesti\s+loodusmuuseum[\p{L}-]*\b/giu,
  /\bestonian\s+environment(?:al)?\s+(?:board|agency|research\s+centre)\b/giu,
  /\beuropean\s+environment(?:al)?\s+(?:board|agency)\b/giu,
  /\beuropean\s+forest\s+service\b/giu,
  /\beuropean\s+climate\s+ministry\b/giu,
  /\benvironment(?:al)?\s+(?:board|agency)\b/giu,
  /\bforest\s+service\b/giu,
  /\bclimate\s+ministry\b/giu,
  /\bministry\s+of\s+(?:climate|the\s+environment)\b/giu,
  /\btallinn(?:a)?\s+city\s+(?:environment(?:al)?\s+)?office\b/giu,
  /\buniversity\s+of\s+tartu\b/giu,
  /\bstatistics\s+estonia\b/giu,
  /\bestonian\s+(?:health|land)\s+board\b/giu,
  /\beesti\s+energia\b/giu,
  /\belering(?:\s+as)?\b/giu,
  /\b(?:rmk|kik)\b/giu,
]);
const PUBLIC_ORGANIZATION_NAME_PATTERNS = Object.freeze([
  ...PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS,
  // A capitalized proper-name span ending in an institutional designator is
  // an organization, even when it is not one of the catalogue's known
  // agencies. Removing the whole span prevents names such as "Blue Valley
  // Agency" and "North District Team" from being reinterpreted as people.
  /(?<![\p{L}\p{N}])(?:\p{Lu}[\p{L}'’.-]{1,39}\s+){1,4}?(?:[Aa]genc(?:y|ies)|[Aa]ssociations?|[Aa]uthorit(?:y|ies)|[Tt]eam|[Oo]ffice|[Dd]epartment|[Ss]ervice|[Oo]rgani[sz]ation|[Ii]nstitutes?|[Ii]nstitution|[Uu]niversity|[Cc]ouncil|[Bb]oard|[Cc]ommission|[Cc]ommittees?|[Cc]oalition|[Aa]lliance|[Pp]artnership|[Cc]onsortium|[Cc]ooperatives?|[Cc]orporation|[Cc]ompany|[Ff]ederations?|[Ff]oundation|[Tt]rust|[Nn]onprofit|[Ii]nitiative|[Pp]roject|[Hh]ub|[Ll]aboratory|[Nn]etwork|[Ss]ociet(?:y|ies)|[Cc]ollectives?|[Pp]anels?|[Aa]met[\p{L}-]*|[Aa]gentuur[\p{L}-]*|[Mm]inisteerium[\p{L}-]*|[Kk]eskus[\p{L}-]*|[Ll]innavalitsus[\p{L}-]*|[Vv]allavalitsus[\p{L}-]*|[Oo]mavalitsus[\p{L}-]*|[Üü]likool[\p{L}-]*|[Ii]nstituut[\p{L}-]*|[Tt]eenistus[\p{L}-]*|[Mm]uuseum[\p{L}-]*|LLC|Ltd|Inc|PLC|[Üü]hing|[Ss]elts|[Oo]saühing|[Aa]ktsiaselts|[Ss]ihtasutus|[Tt]ulundusühistu|[Mm]ittetulundusühing)(?![\p{L}\p{N}])/gu,
  /(?<![\p{L}\p{N}])(?:\p{Lu}[\p{Lu}'’.-]{1,39}\s+){1,4}?(?:AGENC(?:Y|IES)|ASSOCIATIONS?|AUTHORIT(?:Y|IES)|TEAM|OFFICE|DEPARTMENT|SERVICE|ORGANI[ZS]ATION|INSTITUTES?|INSTITUTION|UNIVERSITY|COUNCIL|BOARD|COMMISSION|COMMITTEES?|COALITION|ALLIANCE|PARTNERSHIP|CONSORTIUM|COOPERATIVES?|CORPORATION|COMPANY|FEDERATIONS?|FOUNDATION|TRUST|NONPROFIT|INITIATIVE|PROJECT|HUB|LABORATORY|NETWORK|SOCIET(?:Y|IES)|COLLECTIVES?|PANELS?|LLC|LTD|INC|PLC)(?![\p{L}\p{N}])/gu,
  /(?<![\p{L}\p{N}])[\p{L}-]{2,50}\s+(?:AS|OÜ|MTÜ|SA)(?![\p{L}\p{N}])/gu,
]);
function removeFirstPublicOrganizationName(value) {
  const selected = firstPublicOrganizationNameMatch(value);
  if (!selected) return value;
  return `${value.slice(0, selected.index)} ${value.slice(selected.index + selected.text.length)}`;
}

function firstPublicOrganizationNameMatch(value) {
  let selected = null;
  for (const pattern of PUBLIC_ORGANIZATION_NAME_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(value);
    pattern.lastIndex = 0;
    if (!match) continue;
    if (!selected
      || match.index < selected.index
      || (match.index === selected.index && match[0].length > selected.text.length)) {
      selected = { index: match.index, text: match[0] };
    }
  }
  return selected;
}

function isWholeReviewedPublicOrganizationName(value) {
  const name = String(value || "").replace(/[.?!,;:]+$/gu, "").trim();
  if (!name) return false;
  for (const pattern of PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(name);
    pattern.lastIndex = 0;
    if (match?.index === 0 && match[0].length === name.length) return true;
  }
  return false;
}

const PRIVATE_CONTACT_FIELD_PATTERN = /^(?:(?:üld|uld|yld)?kontakt\w*|contact\w*|(?:üld|uld|yld)?telefoni?\w*|telephone\w*|phone\w*|telefoninumber\w*|mobiili?\w*|mobile\w*|e-?post\w*|email\w*|meil\w*|mail\w*|sideandm\w*|[\p{L}-]*postkast\w*|[\p{L}-]*postikanal\w*|postal\w*|channels?|kanal\w*|gps|koordinaat\w*|coordinate\w*|asukoht\w*|location\w*|asupaik\w*|a?adress\w*|address\w*|koduaadress\w*|homeaddress\w*|kodutänav\w*|kodutanav\w*|elukoh\w*|residence\w*|residentsus\w*|kodukoht\w*|viibimiskoht\w*|erakodu\w*|kodu|elamu\w*|elupai[kg]\w*)$/iu;
// A deliberately narrower subset for the early title-cased-name guard.
// Habitat/location words are valid ecological predicates and stay with the
// later context-aware classifier instead of being treated as direct contact
// fields solely because they follow a name-shaped pair.
const NAMED_PERSON_DIRECT_CONTACT_FIELD_PATTERN = /^(?:(?:üld|uld|yld)?kontakt\w*|contact\w*|(?:üld|uld|yld)?telefoni?\w*|telephone\w*|phone\w*|telefoninumber\w*|mobiili?\w*|mobile\w*|e-?post\w*|email\w*|meil\w*|mail\w*|sideandm\w*|[\p{L}-]*postkast\w*|postal\w*|a?adress\w*|address\w*|koduaadress\w*|homeaddress\w*|kodutänav\w*|kodutanav\w*|elukoh\w*|residence\w*|residentsus\w*|kodukoht\w*|erakodu\w*)$/iu;
const INSTITUTIONAL_CONTACT_CHANNEL_PATTERN = /(?<![\p{L}\p{N}])(?:[\p{L}-]*kontakt\w*|contact\w*|(?:üld|uld|yld)?telefoni?\w*|telephone\w*|phone\w*|telefoninumber\w*|mobiili?\w*|mobile\w*|e-?post\w*|email\w*|meil\w*|mail\w*|sideandm\w*|[\p{L}-]*postkast\w*|[\p{L}-]*postikanal\w*|postal(?:[\s\p{P}\p{S}\p{Z}\p{C}\p{M}_]+(?:address(?:es)?|channel\w*|mailbox\w*|details?|information))?|channels?|kanal\w*|a?adress\w*|address\w*)(?![\p{L}\p{N}])/iu;
const PRIVATE_PERSON_ATTRIBUTE_TOKEN_PATTERN = /^(?:isikuandm\w*|isikukood\w*|s[üu]nni(?:aeg\w*|aj\w*|aasta\w*|koht\w*|kuup[äa]ev\w*)|terviseandm\w*|biomeetri\w*|ssn|birthdate|birthday|birthplace)$/iu;
const PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN = /^(?:isikuandm\w*|isikukood\w*|s[üu]nni(?:aeg\w*|aj\w*|aasta\w*|koht\w*|kuup[äa]ev\w*)|terviseandm\w*|biomeetri\w*|ssn|birthdate|birthday|birthplace|personal|social|security|numbers?|date|birth|place|location|national|identification|passport|identity|information)$/iu;
const PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE = String.raw`[\s\p{P}\p{S}\p{Z}\p{C}\p{M}_]+`;
const PRIVATE_PERSON_ATTRIBUTE_PATTERN = new RegExp(
  String.raw`(?:\b(?:isikuandm\w*|isikukood\w*|s[üu]nni(?:aeg\w*|aj\w*|aasta\w*|koht\w*|kuup[äa]ev\w*)|terviseandm\w*|biomeetri\w*|ssn|birthdate|birthday|birthplace)\b|(?<!\p{L})(?:social${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}security(?:${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:numbers?|no))?|personal${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:data|information|id(?:${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}number)?)|date${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}of${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}birth|place${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}of${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}birth|birth${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:place|location)|national${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:id|identification)(?:${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}number)?|passport${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}number)(?!\p{L}))`,
  "iu",
);
const PRIVATE_POSTAL_FIELD_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:postiaadress\w*|postal${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:address(?:es)?|details?|information|contact(?:${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:details?|information))?))(?!\p{L})`,
  "iu",
);
const ECOLOGICAL_SUBJECT_PATTERN = /(?<!\p{L})[\p{L}-]*(?:karu|hundi?|hund|ilves|hülg|hulj|lendorav|kotka?|toonekur(?:g|e)|nahkhiir|saarma?|kobras|põdr|podr|metssiga|rebas|looma?|linnu?|kala|lii[kg]|natura|meri|metsa?|kaitseala|looduskaitse|elurikkus|taime?|rohu?|lille?|samblik|seene?|putuk|konna?|elupai[kg]|pesapai[kg]|rähn|rahn|naarits|rästik|rastik|sisalik|vesilik|siil|madu|nastik|kaan|pärlikar[bp]|parlikar[bp]|hing|võldas|voldas|kuldking|apollo|rüdi|rudi|kõre|kore|tutka?|vigle|animal|bear|beaver|bird|boar|deer|eagle|fish|forest|fox|frog|habitat|lake|lizard|lynx|mink|ocean|orchid|otter|plant|river|salmon|sea|seal|snake|species|squirrel|stork|toad|trout|wolf|woodland)[\p{L}-]*(?!\p{L})/iu;
const ECOLOGICAL_MODIFIER_PATTERN = /^(?:eesti\w*|euroopa\w*|hall\w*|haige\w*|harilik\w*|haruld\w*|hukkun\w*|kaun\w*|leitud|lääne\w*|laane\w*|must\w*|mustlaik\w*|mustsaba\w*|nähtud|nahtud|noor\w*|panda\w*|pesu\w*|pruun\w*|puna\w*|rohe\w*|surnud|suur\w*|valge\w*|vigastatud|väike\w*|vaike\w*|atlantic|baltic|black|brown|common|estonia\w*|european|freshwater|gray|grey|marine|protected|rare|red|white|young)$/iu;

const ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN = new RegExp(
  String.raw`(?<!\p{L})([\p{L}][\p{L}'’.-]{1,39})${ENGLISH_PERSON_SEPARATOR_SOURCE}([\p{L}][\p{L}'’.-]{1,39})\s+(?:residen(?:ce|cy|t)(?:\s+status)?|domicile(?:\s+status)?|home\s+location|elukoh\w*|kodukoht\w*|residentsus\w*)(?!\p{L})`,
  "giu",
);
const CAPTURED_ANY_CASE_PERSON_NAME_SOURCE = String.raw`(${ENGLISH_PERSON_TOKEN_SOURCE})${ENGLISH_PERSON_SEPARATOR_SOURCE}(?:(${ENGLISH_PERSON_TOKEN_SOURCE})${ENGLISH_PERSON_SEPARATOR_SOURCE})?(${ENGLISH_PERSON_TOKEN_SOURCE})`;
const PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE = String.raw`(?:(?:forest|woodland)(?:\s+(?:area|cover(?:age)?|land|property|parcel|plot|holding))?|metsamaa\w*|metsaala\w*)`;
const ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:(?:owned|managed|administered|operated|maintained|controlled|leased|rented|stewarded|acquired)\s+by|held\s+(?:by|for)|(?:registered|recorded)\s+(?:to|under|for)|(?:assigned|attributed|attributable|licensed|entrusted|titled|transferred|conveyed|granted)\s+(?:to|for)|vested\s+in|(?:associated|connected|linked)\s+(?:to|with)|belongs?\s+to|kuulu(?:b|vad)\s+)\s*${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:(?:acquired|bought|purchased|inherited|received)\s+by|(?:allocated|awarded|bequeathed|ceded|conveyed|deeded|donated|gifted|granted|sold|transferred)\s+to|vested\s+in)\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_ESTONIAN_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:anti|kingiti|müüdi|muudi|loovutati|võõrandati|voorandati|pärandati|parandati|määrati|maarati|registreeriti)(?:\s+üle)?\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_OWNERSHIP_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:by\s+)?(?:ownership(?:\s+(?:breakdown|categor(?:y|ies)|class(?:es)?|type(?:s)?|status(?:es)?))?|registered\s+owner|owners?|omand|omandiõigus|kasutusõigus|omanik)\s*(?:\s+(?:(?:of|by|for|held\s+by|attributed\s+to|assigned\s+to|registered\s+to)|kuulu(?:b|vad))\s+|\s*[,/:=]\s*|\s*\p{Pd}+\s*|\s+)${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_CONNECTOR_NAMED_PERSON_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:for|on|of|at|within)\s+(?:the\s+)?${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?:'s|’s)?\s+${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "giu",
);
const CLAUSE_LEADING_NAMED_PERSON_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?:[^\p{L}\p{N}\s'’]+\s*)${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?:'s|’s)?\s+${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L}|\s+(?:habitats?|ecology|range|distribution|biodiversity|conservation|monitoring|research|policy|guidance|data|information|map|maps)\b)`,
  "giu",
);
const ANY_CASE_ESTONIAN_NAMED_PERSON_PRIVATE_LAND_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}\s+(?:era)?(?:maal|metsamaal|kinnistul|maa(?:u|ü)ksusel|maat(?:ü|u)kil|metsas)(?!\p{L})`,
  "giu",
);
const ESTONIAN_GENITIVE_PERSON_TOKEN_SOURCE = String.raw`[\p{L}][\p{L}'’]{0,38}[aeiouõäöü]`;
const CAPTURED_ESTONIAN_GENITIVE_PERSON_NAME_SOURCE = String.raw`(${ENGLISH_PERSON_TOKEN_SOURCE})${ENGLISH_PERSON_SEPARATOR_SOURCE}(?:(${ENGLISH_PERSON_TOKEN_SOURCE})${ENGLISH_PERSON_SEPARATOR_SOURCE})?(${ESTONIAN_GENITIVE_PERSON_TOKEN_SOURCE})`;
const ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE = String.raw`(?:mets(?:a(?:s|st|le|l|lt|ga|d(?:e(?:s|st|le|lt|ga)?)?)?|i)?|metsaala\w*|kinnist(?:u|ut|ul|ult|ule|uga|ute|uid)?|kinnisvara(?:l|le|lt|st|ga)?|maa(?:d|l|le|lt|st|ga)?|maa(?:u|ü)ksus\w*|maat(?:ü|u)k\w*|põld|põllu(?:l|le|lt|st|ga|d|de|sid)?|hoon(?:e|et|el|ele|elt|est|ega|ed|ete|eid)|maj(?:a|as|ast|ale|al|alt|aga|ad|ade|asid)|talu(?:s|st|sse|le|l|lt|ga|d|de|sid)?|korter(?:i|it|is|isse|ist|ile|il|ilt|iga|iks|id|ite|ites|itest|itele|itelt|itega)?|suvil(?:a|at|as|asse|ast|ale|al|alt|aga|aks|ad|ate|aid)|elam(?:u|ut|us|usse|ust|ule|ul|ult|uga|uks|ud|ute|uid)|krunt(?:i|it|is|isse|ist|ile|il|ilt|iga|id|ide|e)?|ehitis(?:e|t|es|esse|est|ele|el|elt|ega|ed|te|i)?|rajatis(?:e|t|es|esse|est|ele|el|elt|ega|ed|te|i)?|a(?:ed|ia(?:s|st|le|l|lt|ga|d|de|sid)?)|tii(?:k|gi(?:s|st|le|l|lt|ga|d|de|sid)?)|puistu(?:s|st|sse|le|l|lt|ga|d|de|sid)?|garaa(?:ž|z)(?:i|is|ist|ile|il|ilt|iga|id|ide)?|puurkaev\w*|kaev(?:u|us|ust|ule|ul|uga)?)`;
const EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE = String.raw`(?:property|parcel|plot|lot|estate|land|unit|house|home|farm|farmhouse|farmstead|well|borehole|wetland|marsh|meadow|pond|building|dwelling|cottage|premises|site|installation|landholding|holding|forest|woodland)`;
const EXPLICIT_PRIVATE_ASSET_IDENTITY_TARGET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}|(?:private|family|household|personal)\s+${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE})(?!\p{L})`,
  "iu",
);
const AMBIGUOUS_BARE_COUNTY_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:ida|lääne|laane)\s+viru\s+(?:(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}|(?:private|family|household|personal)\s+${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE})(?!\p{L})`,
  "iu",
);
// Treat every non-alphanumeric boundary consistently at the privacy edge.
// Downstream tokenizers accept a much wider Unicode punctuation/symbol set
// than the small separator allowlist that used to live here; enumerating it
// let fraction slashes, plus signs and apostrophe lookalikes carry a private
// name across provider boundaries.
const COUNTY_ASSOCIATION_SEPARATOR_SOURCE = String.raw`(?:[^\p{L}\p{N}]|\uA78C)+`;
const COUNTY_PERSON_TOKEN_SOURCE = String.raw`\p{L}[\p{L}'’]{0,39}`;
const COUNTY_ASSOCIATION_IDENTITY_SOURCE = String.raw`(?:${REVIEWED_ESTONIAN_COUNTY_SECURITY_SURFACE_SOURCE}|(?:ida|lääne|laane)${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}viru(?:maa)?)`;
const COUNTY_PRIVATE_ASSET_TARGET_SOURCE = String.raw`(?:(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}|(?:private|family|household|personal)\s+${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE}|metsamaa\p{L}*|metsaala\p{L}*|metsa(?:kinnist|pindala|omand|valdus|krunt|maatük|maatuk|maaüks|maauks)\p{L}*|${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}|metsa(?:de)?\s+(?:pindala\w*|suurus\w*|katvus\w*)|(?:forest|woodland)\s+(?:area|cover(?:age)?|property|parcel|plot|land)|${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE})`;
const COUNTY_FOLLOWED_PERSON_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${COUNTY_ASSOCIATION_IDENTITY_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(${COUNTY_PERSON_TOKEN_SOURCE}(?:${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_PERSON_TOKEN_SOURCE}){0,7})${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_PRIVATE_ASSET_TARGET_SOURCE}(?!\p{L})`,
  "iu",
);
const PERSON_FOLLOWED_COUNTY_ASSET_PATTERN = new RegExp(
  String.raw`(?:^|[.!?;:]\s*)[\s\p{Pd}([{'"„“”«»]*(?:(?:palun|please)\s+)?(?:(?:leia|otsi|näita|naita|find|show|search|lookup|mõõda|mooda|selgita|compare|explain)\s+)?(${COUNTY_PERSON_TOKEN_SOURCE}(?:${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_PERSON_TOKEN_SOURCE}){0,5})${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_ASSOCIATION_IDENTITY_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(?:${COUNTY_PERSON_TOKEN_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}){0,3}${COUNTY_PRIVATE_ASSET_TARGET_SOURCE}(?!\p{L})`,
  "iu",
);
const REVIEWED_COUNTY_MARKER_SOURCE = String.raw`(?:maakond|maakonda|maakonna|maakonnas|maakonnast|maakonnale|maakonnal|maakonnaga|maakonnana|maakonnad|maakondade|maakondi|piirkond|piirkonda|piirkonna|piirkonnas|piirkonnast|piirkonnale|piirkonnal|piirkonnaga|piirkonnana|piirkonnad|piirkondade|piirkondi|county|region|regional)`;
const REVIEWED_PUBLIC_FOREST_NOUN_SOURCE = String.raw`(?:mets|metsa|metsade|metsamaa|metsamaad|metsamaal|metsamaale|metsamaalt|metsamaast|metsamaaga|metsaala|metsaala(?:l|le|lt|st|ga))`;
const REVIEWED_PUBLIC_FOREST_METRIC_SOURCE = String.raw`(?:pindala|pindalast|pindalale|pindalaga|suurus|suurusest|suurusele|suurusega|katvus|katvusest|katvusele|katvusega|vanus|vanusest|vanusele|vanusega)`;
const REVIEWED_PUBLIC_FOREST_AGGREGATE_MODIFIER_SOURCE = String.raw`(?:keskmine|keskmise|keskmist|keskmiselt|kogu|riigi|riiklik|riikliku|avalik|avaliku|kaitstud|kaitstav|kaitstava)`;
const REVIEWED_PUBLIC_ENGLISH_FOREST_METRIC_PHRASE_SOURCE = String.raw`(?:forest|woodland)\s+(?:area|cover(?:age)?|age)`;
const COUNTY_ASSOCIATION_PERSON_RESIDUAL_SOURCE = String.raw`${COUNTY_PERSON_TOKEN_SOURCE}(?:${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_PERSON_TOKEN_SOURCE}){0,5}`;
const COUNTY_REQUEST_TOKEN_PATTERN = /^(?:palun|please|leia|otsi|näita|naita|find|show|search|lookup|mõõda|mooda|selgita|compare|explain)$/iu;
const COUNTY_PUBLIC_REQUEST_CONTENT_TOKEN_PATTERN = /^(?:avald\w*|kohustus\w*|nõu\w*|nou\w*|reegl\w*|piirang\w*|õigus\w*|oigus\w*|mõjuta\w*|mojuta\w*|publish\w*|regulat\w*|obligation\w*|requirement\w*|restriction\w*|rules?|guidance|laws?)$/iu;

function normalizeCountyAssociationSecurityTokens(value) {
  return String(value || "")
    .normalize("NFC")
    // U+02BC and U+A78B/U+A78C are letter-category apostrophe lookalikes.
    // Explicitly include default ignorables as well as every non-alphanumeric
    // run so this denial-only grammar has one self-contained token boundary.
    .replace(/(?:\p{Default_Ignorable_Code_Point}|[^\p{L}\p{N}]|[\u02BC\uA78B\uA78C])+/gu, " ")
    .trim();
}
const ASSET_RESIDENT_ROLE_PATTERN = /(?<!\p{L})(?:elanik\w*|residend\w*|rentnik\w*|residents?|occupants?|inhabitants?|tenants?)(?!\p{L})/iu;
const RESIDENTIAL_ASSET_TARGET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}|${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE})(?!\p{L})`,
  "iu",
);
const PRIVATE_ASSET_IDENTITY_FIELD_PATTERN = /(?<!\p{L})(?:nimi\w*|names?|identity\w*|identiteet\w*|kontakt\w*|contact\w*|telefon\w*|phone\w*|telephone\w*|e-?post\w*|email\w*|aadress\w*|address\w*|elukoh\w*|residence\w*|isikukood\w*|ssn)(?!\p{L})/iu;
const ASSET_RESIDENT_IDENTITY_FIELD_PATTERN = /(?<!\p{L})(?:eesnimi\w*|perekonnanimi\w*|täisnimi\w*|taisnimi\w*|vanus\w*|surnames?|age|(?:first|last|full)\s+names?)(?!\p{L})/iu;
const IMPERATIVE_PRIVATE_OWNER_ENUMERATION_PATTERN = /^(?:(?:give|show|list|find|provide)\s+(?:me\s+)?(?:the\s+)?(?:names?\s+of\s+(?:the\s+)?)?(?:all\s+)?(?:(?:registered|current|present|existing|private)\s+)?(?:owners?|landowners?|homeowners?|propertyowners?|forestowners?|proprietors?|landholders?|landlords?|land\s+owners?|home\s+owners?|property\s+owners?|forest\s+owners?|land\s+holders?)|(?:anna|näita|naita|leia|loetle)\s+(?:mulle\s+)?(?:kõigi\s+)?(?:(?:registreeritud|praegune|praegused?|praeguse|era)\s+)?(?:(?:metsa|kinnistu|maa|kodu)\s*)?omanik(?:ud|ke|e(?:\s+nimed)?))[.!?]*$/iu;

function hasAssetResidentIdentityFieldRequest(value) {
  const text = String(value || "");
  return RESIDENTIAL_ASSET_TARGET_PATTERN.test(text)
    && ASSET_RESIDENT_ROLE_PATTERN.test(text)
    && (PRIVATE_ASSET_IDENTITY_FIELD_PATTERN.test(text)
      || ASSET_RESIDENT_IDENTITY_FIELD_PATTERN.test(text)
      || PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
      || PRIVATE_POSTAL_FIELD_PATTERN.test(text));
}

const REVIEWED_COUNTY_PUBLIC_REQUEST_PREFIX_PATTERNS = Object.freeze([
  /^(?:palun\s+)?(?:leia|otsi|näita|naita|mõõda|mooda|selgita|ütle|utle)(?:\s+mulle)?(?=[\s,;:\p{Pd}]|$)/iu,
  /^(?:please\s+)?(?:find|show|search|lookup|compare|explain)(?:\s+me)?(?:\s+the)?(?=[\s,;:\p{Pd}]|$)/iu,
  /^(?:tell|show|give)\s+me(?:\s+the)?(?=[\s,;:\p{Pd}]|$)/iu,
  /^(?:can|could|would)\s+you(?:\s+please)?\s+(?:(?:find|show|search|compare|explain)(?:\s+me)?(?:\s+the)?|tell\s+me(?:\s+the)?)(?=[\s,;:\p{Pd}]|$)/iu,
  /^(?:what\s+is|how\s+(?:much|large|big)\s+is)(?:\s+the)?(?=[\s,;:\p{Pd}]|$)/iu,
  /^(?:kui\s+palju\s+(?:on|oli)|mis\s+on|milline\s+on)(?=[\s,;:\p{Pd}]|$)/iu,
  /^kas\s+(?:(?:sa\s+)?saad|te\s+saate|saaksite)\s+(?:näidata|naidata|leida|selgitada|öelda|oelda)(?:\s+mulle)?(?=[\s,;:\p{Pd}]|$)/iu,
]);
const REVIEWED_COUNTY_FOREST_REQUEST_TARGET_PATTERN = new RegExp(
  String.raw`(?:(?<!\p{L})${COUNTY_ASSOCIATION_IDENTITY_SOURCE}(?!\p{L})[\s\S]{0,192}(?<!\p{L})(?:forest|woodland|mets\p{L}*)(?!\p{L})|(?<!\p{L})(?:forest|woodland|mets\p{L}*)(?!\p{L})[\s\S]{0,192}(?<!\p{L})${COUNTY_ASSOCIATION_IDENTITY_SOURCE}(?!\p{L}))`,
  "iu",
);
const REVIEWED_FOREST_METRIC_OF_COUNTY_PATTERN = new RegExp(
  String.raw`^(?:the\s+)?((?:(?:current|present|latest(?:\s+available)?|today(?:'s)?)\s+)?(?:forest|woodland)\s+(?:area|cover(?:age)?|age))\s+(?:of|in|for)\s+(${COUNTY_ASSOCIATION_IDENTITY_SOURCE})(?!\p{L})([\s\S]*?)\s*[.!?]?$`,
  "iu",
);

function reviewedForestMetricOfCountyCandidate(value) {
  const match = String(value || "").normalize("NFC").trim()
    .match(REVIEWED_FOREST_METRIC_OF_COUNTY_PATTERN);
  if (!match) return null;
  return `${match[2]} ${match[1]} ${match[3] || ""}`
    .replace(/\s+/gu, " ")
    .trim();
}

function stripReviewedCountyPublicRequestPrefix(value) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  for (const pattern of REVIEWED_COUNTY_PUBLIC_REQUEST_PREFIX_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    return text.slice(match[0].length)
      .replace(/^[\s,;:\p{Pd}]+/gu, "")
      .replace(/^the(?:\s+|$)/iu, "")
      .trim();
  }
  return null;
}

function isReviewedCountyPublicRequestPrefix(value) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  if (stripReviewedCountyPublicRequestPrefix(text) === "") return true;
  const prefixTokens = text.match(/\p{L}+/gu) || [];
  return prefixTokens.length > 0
    && prefixTokens.every((token) => (
      COUNTY_REQUEST_TOKEN_PATTERN.test(token)
        || PERSON_CONTEXT_STOPWORD_PATTERN.test(token)
        || COUNTY_PUBLIC_REQUEST_CONTENT_TOKEN_PATTERN.test(token)
    ))
    && prefixTokens.some((token) => (
      COUNTY_REQUEST_TOKEN_PATTERN.test(token)
        || /^(?:kas|kes|kuidas|kus|millal|millin\w*|millis\w*|mis|mida|miks|how|what|when|where|which|why)$/iu.test(token)
    ));
}

function reviewedCountyForestPrefixScope(value) {
  const text = String(value || "")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim();
  const countyPattern = new RegExp(
    String.raw`(?<!\p{L})${COUNTY_ASSOCIATION_IDENTITY_SOURCE}(?!\p{L})`,
    "giu",
  );
  for (const countyMatch of text.matchAll(countyPattern)) {
    const countyIndex = countyMatch.index || 0;
    if (countyIndex === 0) continue;
    const countyQuestion = text.slice(countyIndex).trim();
    if (!isCompleteReviewedCountyPublicForestQuestionOrContactComposition(countyQuestion)) continue;
    const prefix = text.slice(0, countyIndex)
      .replace(/^[\s\p{Pd}([{'"„“”«»]+/gu, "")
      .replace(/[\s,;:\p{Pd}\])}'"„“”«»]+$/gu, "")
      .trim();
    if (isReviewedCountyPublicRequestPrefix(prefix)) return "public-request";
    if (isReviewedPublicOrganizationContactClause(prefix)
      || isCompleteReviewedPublicOrganizationContactQuestion(prefix)) return "public-contact";
    const requestResidual = stripReviewedCountyPublicRequestPrefix(prefix);
    const personCandidate = requestResidual === null ? prefix : requestResidual;
    const prefixMatch = personCandidate.match(new RegExp(
      String.raw`^(${COUNTY_PERSON_TOKEN_SOURCE}(?:${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_PERSON_TOKEN_SOURCE}){0,5})$`,
      "iu",
    ));
    if (prefixMatch && !isReviewedCountyPublicRequestPrefix(prefixMatch[1])) return "person";
    // The token cap limits parsing work; it must not become a fail-open
    // boundary. Once the suffix is a complete reviewed county-forest query,
    // any remaining nonempty prefix that is not a finite public request is an
    // unconsumed identity/prose residual and cannot cross a provider boundary.
    if (personCandidate) return "person";
  }
  return null;
}

function hasCountyShapedPersonAssetAssociation(value) {
  const text = String(value || "");
  // Public meaning is proved by a complete finite grammar, never by treating
  // each token as independently harmless. Token unions allowed repeated or
  // reordered descriptors, arbitrary residual names and marker-like prefixes
  // to inherit a county exception.
  const reviewedPublicText = stripNegatedPrivateContactFields(text)
    .replace(/\s+/gu, " ")
    .replace(/\s+([.?!,;:])/gu, "$1")
    .trim();
  if (isCompleteReviewedCountyPublicForestQuestionOrContactComposition(reviewedPublicText)) return false;
  if (COUNTY_FOLLOWED_PERSON_ASSET_PATTERN.test(text)) return true;
  const reverseMatch = text.match(PERSON_FOLLOWED_COUNTY_ASSET_PATTERN);
  if (!reverseMatch) return false;
  return !isReviewedCountyPublicRequestPrefix(reverseMatch[1]);
}

function hasReviewedCountyDescriptorCompoundPersonAsset(value) {
  const reviewedPublicText = stripNegatedPrivateContactFields(String(value || ""))
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .replace(/\s+([.?!,;:])/gu, "$1")
    .trim();
  if (isCompleteReviewedCountyPublicForestQuestionOrContactComposition(reviewedPublicText)) return false;
  const securityTokenText = normalizeCountyAssociationSecurityTokens(reviewedPublicText);
  // Match only a finite reviewed county surface. The previous two open
  // `(.+?)` captures were both semantically wider and super-linear on long
  // separator runs. Canonical whitespace is collapsed above so default-
  // ignorable boundaries cannot amplify regex work.
  const county = String.raw`(?:${REVIEWED_ESTONIAN_COUNTY_SECURITY_SURFACE_SOURCE})`;
  const patterns = [
    new RegExp(
      String.raw`^${county}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_ASSOCIATION_PERSON_RESIDUAL_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(?:mets|metsa|metsade|metsamaa\p{L}*|metsaala\p{L}*)[\s\S]*$`,
      "iu",
    ),
    new RegExp(
      String.raw`^${county}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_ASSOCIATION_PERSON_RESIDUAL_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(?:forest|woodland)[\s\S]*$`,
      "iu",
    ),
    new RegExp(
      String.raw`^${county}\s+(?:${REVIEWED_PUBLIC_ENGLISH_FOREST_METRIC_PHRASE_SOURCE}|${REVIEWED_PUBLIC_FOREST_NOUN_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE})${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_ASSOCIATION_PERSON_RESIDUAL_SOURCE}\??$`,
      "iu",
    ),
    new RegExp(
      String.raw`^${county}\s+(?:forest|woodland|${REVIEWED_PUBLIC_FOREST_NOUN_SOURCE})${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${COUNTY_ASSOCIATION_PERSON_RESIDUAL_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(?:area|cover(?:age)?|age|${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE})\??$`,
      "iu",
    ),
  ];
  return reviewedCountySensitiveForestResidualCandidates(securityTokenText).some((candidate) => (
    patterns.some((pattern) => pattern.test(candidate))
  ));
}

function hasPrivateAssetIdentityFieldRequest(value) {
  const text = String(value || "");
  const asset = EXPLICIT_PRIVATE_ASSET_IDENTITY_TARGET_PATTERN.exec(text);
  if (!asset) return false;
  const rawTail = text.slice((asset.index || 0) + asset[0].length);
  const tail = stripNegatedPrivateContactFields(
    stripSingleReviewedOrganizationContactField(rawTail),
  );
  return PRIVATE_ASSET_IDENTITY_FIELD_PATTERN.test(tail)
    || PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(tail)
    || PRIVATE_POSTAL_FIELD_PATTERN.test(tail)
    || NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(tail);
}

function stripNegatedPrivateContactFields(value) {
  const replaceUnlessGovernedByNegation = (text, pattern, negatorPattern) => text.replace(
    pattern,
    (match, offset, source) => {
      const boundedPrefix = source.slice(Math.max(0, offset - 160), offset);
      const clausePrefix = boundedPrefix.split(/[.!?;:。！？；]+/u).at(-1) || "";
      return negatorPattern.test(clausePrefix) ? match : " ";
    },
  );
  const withoutEstonianExclusion = replaceUnlessGovernedByNegation(
    String(value || ""),
    /(?<!\p{L})ilma\s+(?:(?:isiklik\w*|omanik\w*|eraisik\w*)\s+)?(?:kontakt\w*|telefoni?\w*|e-?post\w*|aadress\w*)(?!\p{L})/giu,
    /(?<!\p{L})(?:mitte|ega|ei|pole|polnud|ära|ärge)(?!\p{L})/iu,
  );
  return replaceUnlessGovernedByNegation(
    withoutEstonianExclusion,
    /(?<!\p{L})without\s+(?:(?:personal|private|owners?|owner['’]s|tenants?|tenant['’]s)\s+)?(?:contact\w*(?:\s+(?:details?|information))?|phone\w*|telephone\w*|email\w*|address\w*)(?!\p{L})/giu,
    /(?<!\p{L})(?:not|nor|never|no|cannot|can['’]?t|won['’]?t|wouldn['’]?t|shouldn['’]?t|mustn['’]?t|isn['’]?t|aren['’]?t|don['’]?t|doesn['’]?t|didn['’]?t)(?!\p{L})/iu,
  );
}

function isStrictReviewedEstonianCountyIdentity(value) {
  const text = String(value || "").normalize("NFKC").normalize("NFC").trim();
  // Municipality normalization deliberately erases punctuation for search
  // recall. A privacy exception must first prove that the original county
  // surface uses words, whitespace, or one real dash—not `/`, `_`, `.`, `+`,
  // apostrophes, repeated dashes, or other lossy aliases.
  if (!/^[\p{L}\p{M}]+(?:(?:\s+|\s*\p{Pd}\s*)[\p{L}\p{M}]+)*$/u.test(text)) return false;
  return isReviewedEstonianCountyIdentity(text);
}

function isUnambiguousReviewedEstonianCountyIdentity(value) {
  const text = String(value || "").normalize("NFKC").normalize("NFC").trim();
  if (!isStrictReviewedEstonianCountyIdentity(text)) return false;
  if (/^(?:ida|lääne|laane)\s+viru$/iu.test(text)) return false;
  return true;
}

function isCompleteReviewedCountyPrivateAssetEcologyQuestion(value) {
  const clauses = splitPublicQueryClauses(value);
  if (clauses.length < 1 || clauses.length > 2) return false;
  const contactClauses = clauses.filter(isCompleteReviewedPublicOrganizationContactQuestion);
  if (clauses.length === 2 && contactClauses.length !== 1) return false;
  const environmentalClause = clauses.find((clause) => (
    !isCompleteReviewedPublicOrganizationContactQuestion(clause)
  ));
  if (!environmentalClause) return false;
  const patterns = [
    new RegExp(String.raw`^how\s+does\s+(.+?)\s+(?:private|family|household|personal)\s+${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE}\s+(?:affect|impact)\s+(?:biodiversity|habitats?|ecology|ecosystems?|species)(?:\s+(?:diversity|richness))?\??$`, "iu"),
    new RegExp(String.raw`^kuidas\s+m[õo]juta\w*\s+(.+?)\s+(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}\s+(?:elurikk\w*|liigirikk\w*|elupai[kg]\w*|loodus\w*|ökosüsteem\w*)\??$`, "iu"),
    new RegExp(String.raw`^palun\s+selgita\s+(.+?)\s+(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}\s+m[õo]ju\s+(?:elurikk\w*|liigirikk\w*|elupai[kg]\w*|loodus\w*|ökosüsteem\w*)\??$`, "iu"),
  ];
  for (const pattern of patterns) {
    const match = environmentalClause.trim().match(pattern);
    if (match && isUnambiguousReviewedEstonianCountyIdentity(match[1])) return true;
  }
  return false;
}

function hasReviewedCountyPrivateAssetEcologySensitiveResidual(value) {
  const text = String(value || "").trim();
  const patterns = [
    new RegExp(String.raw`^how\s+does\s+(.+?)\s+(?:private|family|household|personal)\s+${EXPLICIT_ENGLISH_PRIVATE_ASSET_NOUN_SOURCE}\s+(?:affect|impact)\s+(?:biodiversity|habitats?|ecology|ecosystems?|species)(?:\s+(?:diversity|richness))?([\s\S]*)$`, "iu"),
    new RegExp(String.raw`^kuidas\s+m[õo]juta\w*\s+(.+?)\s+(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}\s+(?:elurikk\w*|liigirikk\w*|elupai[kg]\w*|loodus\w*|ökosüsteem\w*)([\s\S]*)$`, "iu"),
    new RegExp(String.raw`^palun\s+selgita\s+(.+?)\s+(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}\s+m[õo]ju\s+(?:elurikk\w*|liigirikk\w*|elupai[kg]\w*|loodus\w*|ökosüsteem\w*)([\s\S]*)$`, "iu"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !isUnambiguousReviewedEstonianCountyIdentity(match[1])) continue;
    const residual = stripNegatedPrivateContactFields(match[2])
      .replace(/^[\s,.!?;:—–−-]+/gu, "")
      .replace(/^(?:ja|ning|and)\s+/iu, "")
      .trim();
    if (!residual || isCompleteReviewedPublicOrganizationContactQuestion(residual)) return false;
    return true;
  }
  return false;
}

function isCompleteReviewedCountyPrivateAssetAggregateQuestion(value) {
  const text = String(value || "").trim();
  const unambiguousCountyPatterns = [
    new RegExp(String.raw`^(.+?)\s+(?:private|family|household|personal)\s+(?:forest|woodland|land|property)\s+(?:area|cover(?:age)?)(?:\s+(?:aggregate|data|statistics))?\??$`, "iu"),
    new RegExp(String.raw`^how\s+to\s+publish\s+(.+?)\s+(?:private|family|household|personal)\s+(?:forest|woodland|land|property)\s+(?:area|cover(?:age)?)(?:\s+(?:aggregate|data|statistics))?\??$`, "iu"),
    new RegExp(String.raw`^(.+?)\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\??$`, "iu"),
    new RegExp(String.raw`^(.+?)\s+${REVIEWED_PUBLIC_FOREST_NOUN_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE}\??$`, "iu"),
    new RegExp(String.raw`^(.+?)\s+(?:average|total|overall|state|public|protected)\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\??$`, "iu"),
    new RegExp(String.raw`^(.+?)\s+${REVIEWED_PUBLIC_FOREST_AGGREGATE_MODIFIER_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_NOUN_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE}\??$`, "iu"),
  ];
  if (unambiguousCountyPatterns.some((pattern) => {
    const match = text.match(pattern);
    return Boolean(match && isUnambiguousReviewedEstonianCountyIdentity(match[1]));
  })) return true;
  const explicitCountyPatterns = [
    new RegExp(String.raw`^(.+?)\s+(?:county|region|regional)\s+(?:forest|woodland)\s+(?:area|cover(?:age)?)\??$`, "iu"),
    new RegExp(String.raw`^(.+?)\s+${REVIEWED_COUNTY_MARKER_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_NOUN_SOURCE}\s+${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE}\??$`, "iu"),
  ];
  return explicitCountyPatterns.some((pattern) => {
    const match = text.match(pattern);
    return Boolean(match && isStrictReviewedEstonianCountyIdentity(match[1]));
  });
}

function isCompleteReviewedCountyForestAgeQuestion(value) {
  const text = String(value || "").trim();
  const patterns = [
    /^(.+?)\s+(?:(?:private|public|state|protected)\s+)?(?:forest|woodland)\s+(?:(?:average|mean)\s+)?age(?:\s+(?:distribution|trend))?\??$/iu,
    /^(.+?)\s+(?:average|mean)\s+(?:(?:private|public|state|protected)\s+)?(?:forest|woodland)\s+age\??$/iu,
  ];
  return patterns.some((pattern) => {
    const match = text.match(pattern);
    return Boolean(match && isUnambiguousReviewedEstonianCountyIdentity(match[1]));
  });
}

function isCompleteReviewedCountyForestCategoryQuestion(value) {
  const text = String(value || "").trim();
  // Keep category phrases finite and grammatical. Prefix-wide descriptor
  // matching would also accept person-name collisions such as Young Old or
  // Estonian compounds such as vanamehe/noormehe and release them upstream.
  const descriptor = String.raw`(?:vana|vanad|vanade|noor|noore|noored|noorte|looduslik|loodusliku|põlis|polis|kliimamuutuse|natura|majandatav|majandamata|segamets|segapuistu|okasmets|lehtmets|väärtuslik|vaartuslik|taastuv|kuivendatud|kahjustatud|tulekahjustatud|(?:ökoloogiliselt|okoloogiliselt)\s+(?:väärtuslik|vaartuslik)|(?:männi|manni|kuuse|kase|lehtpuu|okaspuu)\s+enamusega)`;
  const forest = REVIEWED_PUBLIC_FOREST_NOUN_SOURCE;
  const metric = String.raw`(?:\s+${REVIEWED_PUBLIC_FOREST_METRIC_SOURCE})?`;
  const unambiguousMatch = text.match(new RegExp(
    String.raw`^(.+?)\s+${descriptor}\s+${forest}${metric}\??$`,
    "iu",
  ));
  if (unambiguousMatch
    && isUnambiguousReviewedEstonianCountyIdentity(unambiguousMatch[1])) return true;
  const explicitMatch = text.match(new RegExp(
    String.raw`^(.+?)\s+${REVIEWED_COUNTY_MARKER_SOURCE}\s+${descriptor}\s+${forest}${metric}\??$`,
    "iu",
  ));
  if (explicitMatch && isStrictReviewedEstonianCountyIdentity(explicitMatch[1])) return true;
  const englishDescriptor = String.raw`(?:ecological|natural|valuable|restored|damaged|drained|mixed|coniferous|deciduous|old|young|climate[-\s]+resilient)`;
  const englishMatch = text.match(new RegExp(
    String.raw`^(.+?)\s+${englishDescriptor}\s+(?:forest|woodland)(?:\s+(?:area|cover(?:age)?|age))?\??$`,
    "iu",
  ));
  return Boolean(englishMatch
    && isUnambiguousReviewedEstonianCountyIdentity(englishMatch[1]));
}

const REVIEWED_COUNTY_PUBLIC_COMPLEMENT_CATEGORY_SOURCES = Object.freeze([
  String.raw`(?<![\p{L}\p{N}])(?:(?:in|for|during|as\s+of)\s+)?(?:19|20)\d{2}\.?(?:\s+(?:aasta|aastal))?(?![\p{L}\p{N}])`,
  String.raw`(?<![\p{L}\p{N}])(?:current|present|latest(?:\s+available)?|available|today(?:'s)?|this\s+year|now|currently|praegune|praeguse|uusim|uusima|viimane|viimase|tänane|tanane|tänapäeval|tanapaeval|praegu|uusima\s+seisuga)(?![\p{L}\p{N}])`,
  String.raw`(?<![\p{L}\p{N}])(?:(?:in\s+)?(?:hectares?|ha|acres?|percent|percentage|square\s+kilomet(?:er|re)s?|km(?:2|²)|square\s+miles?)|hektarites|hektarit|hektareid|protsentides|protsenti|ruutkilomeetrites)(?![\p{L}\p{N}])`,
]);

function reviewedCountyPublicForestParts(value) {
  const text = String(value || "").normalize("NFC").trim();
  const boundaries = [text.length, ...[...text.matchAll(/\s+/gu)].map((match) => match.index)]
    .sort((left, right) => right - left);
  for (const boundary of boundaries) {
    const county = text.slice(0, boundary).trim();
    if (!isStrictReviewedEstonianCountyIdentity(county)) continue;
    if (county.length >= text.length) return null;
    return { county, remainder: text.slice(county.length).trim() };
  }
  return null;
}

function reviewedCountyComplementSpans(remainder) {
  return REVIEWED_COUNTY_PUBLIC_COMPLEMENT_CATEGORY_SOURCES.map((source) => (
    [...remainder.matchAll(new RegExp(source, "giu"))].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }))
  ));
}

function removeReviewedCountyComplementSpans(value, spans) {
  let result = String(value || "");
  for (const span of [...spans].sort((left, right) => right.start - left.start)) {
    result = `${result.slice(0, span.start)} ${result.slice(span.end)}`;
  }
  return result
    .replace(/\s+/gu, " ")
    .replace(/\s+([.!?])/gu, "$1")
    .replace(/[.!?]+$/u, "")
    .trim();
}

function reviewedCountyPublicForestComplementCandidates(value) {
  const text = String(value || "").normalize("NFC").trim();
  const parts = reviewedCountyPublicForestParts(text);
  if (!parts) return [text];
  const { county, remainder } = parts;
  const categorySpans = reviewedCountyComplementSpans(remainder)
    .map((spans, category) => spans.map((span) => ({ ...span, category })));
  const remainders = new Set([remainder]);
  // Complements are grammatical slots, not a bag of harmless words. A
  // freshness/year modifier may precede the forest phrase; a unit or time/year
  // modifier may follow it. A trailing numeric year and unit may appear in
  // either order. Multiple same-category spans are never erased, and a
  // freshness+unit pair is never erased on the same side of the forest phrase:
  // “Current Acres” is person-shaped, while “current forest area hectares” is
  // an ordinary public query whose two complements occupy opposite slots.
  if (categorySpans.some((spans) => spans.length > 1)) return [text];
  const availableSpans = categorySpans.flat();
  const hasOnlyWhitespace = (start, end) => /^\s*$/u.test(remainder.slice(start, end));
  const hasOnlyTerminalPunctuation = (start) => /^[\s.!?]*$/u.test(remainder.slice(start));
  const isValidSlotComposition = (selected) => {
    const spans = [...selected].sort((left, right) => left.start - right.start);
    for (const prefixCount of [0, 1]) {
      const prefix = spans.slice(0, prefixCount);
      const suffix = spans.slice(prefixCount);
      if (prefix.length === 1
        && (prefix[0].category === 2 || prefix[0].start !== 0)) continue;
      if (suffix.length > 2) continue;
      if (suffix.length > 0) {
        if (!hasOnlyTerminalPunctuation(suffix.at(-1).end)) continue;
        if (suffix.slice(0, -1).some((span, index) => (
          !hasOnlyWhitespace(span.end, suffix[index + 1].start)
        ))) continue;
        if (suffix.length === 2) {
          const categories = suffix.map((span) => span.category).sort();
          if (categories[0] !== 0 || categories[1] !== 2) continue;
        }
      }
      const coreStart = prefix.length === 1 ? prefix[0].end : 0;
      const coreEnd = suffix.length > 0 ? suffix[0].start : remainder.length;
      if (coreStart >= coreEnd || !remainder.slice(coreStart, coreEnd).trim()) continue;
      return true;
    }
    return false;
  };
  for (let mask = 1; mask < (1 << availableSpans.length); mask += 1) {
    const selected = availableSpans.filter((_span, index) => mask & (1 << index));
    if (!isValidSlotComposition(selected)) continue;
    const candidate = removeReviewedCountyComplementSpans(remainder, selected);
    if (candidate) remainders.add(candidate);
  }
  return [...remainders].map((candidate) => `${county} ${candidate}`.trim());
}

function reviewedCountySensitiveForestResidualCandidates(value) {
  const text = String(value || "").normalize("NFC").trim();
  const parts = reviewedCountyPublicForestParts(text);
  if (!parts) return [text];
  const { county, remainder } = parts;
  const categorySpans = reviewedCountyComplementSpans(remainder);
  const allSpans = categorySpans.flat();
  const remainders = new Set(
    reviewedCountyPublicForestComplementCandidates(text)
      .map((candidate) => candidate.slice(county.length).trim()),
  );
  for (const spans of categorySpans) {
    if (spans.length > 0) remainders.add(removeReviewedCountyComplementSpans(remainder, spans));
    for (const span of spans) remainders.add(removeReviewedCountyComplementSpans(remainder, [span]));
  }
  if (allSpans.length > 0) remainders.add(removeReviewedCountyComplementSpans(remainder, allSpans));
  return [...remainders]
    .filter(Boolean)
    .slice(0, 32)
    .map((candidate) => `${county} ${candidate}`.trim());
}

function isCompleteReviewedCountyPublicForestQuestion(value) {
  return reviewedCountyPublicForestComplementCandidates(value).some((text) => (
    isCompleteReviewedCountyPrivateAssetEcologyQuestion(text)
      || isCompleteReviewedCountyForestAgeQuestion(text)
      || isCompleteReviewedCountyForestCategoryQuestion(text)
      || isCompleteReviewedCountyPrivateAssetAggregateQuestion(text)
  ));
}

function isCompleteReviewedCountyPublicForestQuestionOrContactComposition(value) {
  const text = String(value || "").trim();
  if (isCompleteReviewedCountyPublicForestQuestion(text)) return true;
  const clauses = splitPublicQueryClauses(text);
  if (clauses.length !== 2) return false;
  return clauses.filter(isCompleteReviewedCountyPublicForestQuestion).length === 1
    && clauses.filter((clause) => (
      isReviewedPublicOrganizationContactClause(clause)
        || isCompleteReviewedPublicOrganizationContactQuestion(clause)
    )).length === 1;
}

function stripSingleReviewedOrganizationContactField(value) {
  const text = String(value || "");
  if (!isReviewedPublicOrganizationContactClause(text)) return text;
  const organization = firstPublicOrganizationNameMatch(text);
  if (!organization) return text;
  const afterOrganizationIndex = organization.index + organization.text.length;
  const afterOrganization = text.slice(afterOrganizationIndex);
  const candidates = [
    INSTITUTIONAL_CONTACT_CHANNEL_PATTERN.exec(afterOrganization),
    PRIVATE_POSTAL_FIELD_PATTERN.exec(afterOrganization),
  ].filter(Boolean).sort((left, right) => left.index - right.index);
  const contact = candidates[0];
  if (!contact) return text;
  const contactIndex = afterOrganizationIndex + contact.index;
  return `${text.slice(0, contactIndex)} ${text.slice(contactIndex + contact[0].length)}`;
}
const ANY_CASE_ESTONIAN_NAMED_PERSON_PRIVATE_COMPOUND_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${CAPTURED_ESTONIAN_GENITIVE_PERSON_NAME_SOURCE}\s+era[\s\p{Pd}./·:_]*${ESTONIAN_PRIVATE_COMPOUND_ASSET_SOURCE}(?!\p{L})`,
  "giu",
);
const HYPHENATED_ESTONIAN_NAMED_PERSON_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(${ENGLISH_PERSON_TOKEN_SOURCE})\s*[\p{Pd}./·:_]+\s*(${ENGLISH_PERSON_TOKEN_SOURCE})\s+(?:era|perekonna|isiklik)[\s\p{Pd}./·:_]*(?:mets(?:a(?:s|st|le|l|ga)?|ad|ade)?|metsamaa\p{L}*|metsaala\p{L}*|kinnist(?:u|ut|ul|ult|ule|uga|ute|uid)?|maa(?:u|ü)ksus\p{L}*|maat(?:ü|u)k\p{L}*|puurkaev\p{L}*|kaev(?:u|us|ust|ule|ul|uga)?)(?!\p{L})`,
  "giu",
);
const ENGLISH_SINGLE_POSSESSIVE_PRIVATE_ASSET_SOURCE = String.raw`(?:(?:(?:the|this|that|specific|private|family|household|residential|neighbor(?:ing)?|neighbour(?:ing)?|adjacent|forest|woodland|land|cadastral|groundwater|riverside|lakeshore|wetland)\s+){0,3}(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|cottage|premises|site|landholding|holding)|(?:forest|woodland)\s+(?:area|cover(?:age)?))`;
const ENGLISH_SINGLE_TOKEN_POSSESSIVE_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})([\p{L}][\p{L}'’.-]{1,39}?)(?:'s|’s)\s+${ENGLISH_SINGLE_POSSESSIVE_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "giu",
);
const ENGLISH_CONNECTOR_SINGLE_TOKEN_POSSESSIVE_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:for|on|of|at|within|in)\s+(?:the\s+)?([\p{L}][\p{L}'’.-]{1,39}?)(?:'s|’s)\s+${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "giu",
);
const ENGLISH_PRONOUN_PRIVATE_ASSET_SOURCE = String.raw`(?:(?:(?:private|family|household|residential|neighbor(?:ing)?|neighbour(?:ing)?|adjacent|forest|woodland|land|cadastral)\s+){0,3}(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|cottage|premises|site|landholding|holding))`;
const ENGLISH_POSSESSIVE_PRONOUN_PRIVATE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:my|your|his|her|our|their)\s+${ENGLISH_PRONOUN_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "iu",
);
const ANY_CASE_ROLE_LABEL_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:title(?:\s+holder)?|beneficiar(?:y|ies)|holders?|possessors?|proprietors?|landholders?|rights?\s+holders?|kasutaja|õigustatud\s+isik|valdaja|haldaja|kasusaaja)\s*(?:[:=]\s*|\p{Pd}+\s*|\s+(?:is|of|on)\s+)${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_NAMED_PERSON_OWNERSHIP_FIELD_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?:'s|’s)?(?:\s*[,;:]\s*|\s*\p{Pd}+\s*|\s+)(?:ownership|owner(?:ship)?\s+(?:category|class|type|status)|is\s+(?:(?:the|a)\s+)?(?:registered\s+)?owner|owns?|possesses?|manages?|administers?|operates?|maintains?|controls?|holds?|leases?|rents?|stewards?|(?:forest|woodland)\s+(?:area|cover(?:age)?)|metsamaa\w*(?:\s+pindala\w*)?|metsaala\w*|metsaomanik\w*|omandis|omandi\s+j[aä]rgi|omandivormi\s+j[aä]rgi|omanikuliigi\s+(?:j[aä]rgi|kaupa)|nimel|valduses|kasutuses|kasutada|omab|omavad|haldab|haldavad|hallata|hallatav\w*|valdab|valdavad|kuulu(?:b|vad)|kuuluv\w*)(?!\p{L})`,
  "giu",
);
const ANY_CASE_FOREST_METRIC_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:forest|woodland)\s+(?:area|cover(?:age)?)\s+(?:of|for)\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_FOREST_ASSET_IN_NAMED_PERSON_NAME_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE}\s+(?:is\s+)?(?:registered\s+|recorded\s+)?(?:in|under)\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?:'s|’s)?\s+name(?!\p{L})`,
  "giu",
);
const ANY_CASE_NAMED_PERSON_TO_FOREST_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}\s+(?:(?:is\s+)?(?:registered|recorded|assigned|transferred|attributed|conveyed|granted)\s+(?:to|under|for|with)\s+|(?:acquired|bought|purchased|obtained|inherited|received)\s+)(?:(?:a|the)\s+)?${PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_FOREST_ASSET_ROLE_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE}(?:\s+pindala\w*)?\s+(?:owner|manager|administrator|operator|holder|possessor|beneficiar(?:y|ies)|haldaja|valdaja|kasutaja|kasusaaja|kasutusõigus|õigustatud\s+isik)\s*[:=\p{Pd}]*\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const ANY_CASE_NAMED_PERSON_APPOSITIVE_ASSET_ROLE_PATTERN = new RegExp(
  String.raw`(?<!\p{L})with\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}\s+as\s+(?:(?:the|a)\s+)?(?:owner|manager|administrator|operator|holder|possessor|beneficiar(?:y|ies)|proprietor|landholder)(?!\p{L})`,
  "giu",
);
const ANY_CASE_NAMED_PERSON_PRIVATE_ASSET_ROLE_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}\s+(?:eraomand\w*|era(?:puur)?kaev\w*|erakinnist\w*|eramaa\w*|eramets\w*|isiklik\w*\s+(?:omand|kaev|kinnist|maa|mets)\w*)\s+(?:(?:tegelik|ametlik|registreeritud|õiguslik|oiguslik|praegune)\w*\s+)?(?:(?:eest\s+)?vastutav\s+isik|haldusõiguse\s+kandja\w*|haldus(?:-|\s*)õiguse\s+kandja\w*|hoonestaja\w*|hoonestus(?:-|\s*)õiguse\s+kandja\w*|haldur\w*|haldaja\w*|valdaj\w*|loaomanik\w*|omanik\w*|kasutaja\w*|(?:permit|licen[cs]e|rights?)(?:[-\s]+)holders?|permittees?|licensees?|owners?|managers?|administrators?|operators?|users?|occupants?|tenants?|custodians?)(?!\p{L})`,
  "giu",
);
const ANY_CASE_FOREST_ASSET_GIVEN_TO_NAMED_PERSON_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${PRIVATE_FOREST_ASSOCIATION_ASSET_SOURCE}\s+anti\s+${CAPTURED_ANY_CASE_PERSON_NAME_SOURCE}(?!\p{L})`,
  "giu",
);
const NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN = /^(?:agenc(?:y|ies)|association\w*|authority|board|business|city|commission|committee|company|corporation|council|department|foundation|government|institute|institution|llc|ltd|ministry|municipalit\w*|nonprofit|office|organization|organisation|service|team|trust|university|amet\w*|asutus\w*|büroo\w*|buroo\w*|linnavalitsus\w*|ministeerium\w*|omavalitsus\w*|osakond\w*|selts\w*|teenistus\w*|vallavalitsus\w*|ühing\w*|uhing\w*)$/iu;
const OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN = /^(?:against|all|alongside|and|annual\w*|area|available|administrator\w*|beneficiar\w*|bind|binding|binds|calculat\w*|caretaker\w*|category|class|compare|comparison|compliance|conservation|contractor\w*|corporate|county|current|custodian\w*|data|each|ecological|environmental|estonia\w*|estimat\w*|every|fiduciar\w*|figure|forest|forests|government|group|historical|holder\w*|individual|inventor\w*|it|land|landowner\w*|latest|leased|legal|management|manag\w*|measur\w*|measurement\w*|middle|earth|municipal|municipality|national|natural|official|operator\w*|or|overall|owned|owner|owners|ownership|people|period|possessor\w*|post|privat\w*|proprietor\w*|protected|protection|public|published|recent|relative|reported|rented|rule|rules|sector|source|state|status|steward\w*|survey\w*|tenant\w*|tenure|title|total|trustee\w*|type|value|versus|volunteer\w*|vs|was|were|whoever|woodland|woodlands|years?|ajalool\w*|andm\w*|aasta\w*|avalik\w*|eesti\w*|eramets\w*|hallatav\w*|haldaj\w*|hinnang\w*|kaitst\w*|kategoori\w*|kasutaj\w*|kehti\w*|klass\w*|kohustus\w*|kogu|loodus\w*|maaomanik\w*|maakon\w*|majandat\w*|mets\w*|metsamaa\w*|millis\w*|munitsipaal\w*|omanik\w*|omandivorm\w*|peab|tohib|v[õo]ib|v[õo]iks|periood\w*|pindala\w*|praegune|reegl\w*|registreeritud|renditud|riigi\w*|riiklik\w*|staatus\w*|tüüp\w*|tuup\w*|uusim|valdaj\w*|viimane|v[õo]rdle|üld\w*|uld\w*)$/iu;

function isReviewedPublicEntityName(value) {
  const name = String(value || "").replace(/[.?!,;:]+$/gu, "").trim();
  if (!name) return false;
  if (isReviewedEstonianMunicipalityIdentity(name)
    || removeFirstReviewedMunicipalityOrganizationName(name).trim() === ""
    || removeFirstPublicOrganizationName(name).trim() === "") return true;
  return Boolean(reviewedEstonianMunicipalityCandidateScope(name));
}

function reviewedPublicEntityAssetAssociationCandidates(value) {
  const text = String(value || "").trim();
  if (!/(?<!\p{L})(?:mets\w*|metsamaa\w*|forest|woodland)(?!\p{L})/iu.test(text)) return [];
  const patterns = [
    /(?:in|under)\s+(?:the\s+)?name\s+of\s+(.+?)[.?!]?$/iu,
    /(?:titled|registered|recorded|assigned|attributed|attributable|linked|associated|transferred|conveyed|granted)\s+(?:to|under|with|for)\s+(.+?)[.?!]?$/iu,
    /(?:acquired\s+by|vested\s+in|anti)\s+(.+?)[.?!]?$/iu,
    /(?:title|beneficiar(?:y|ies)|holders?|possessors?|owners?|ownership|kasutaja|õigustatud\s+isik|valdaja|haldaja|kasusaaja)\s*[:=\p{Pd}]+\s*(.+?)[.?!]?$/iu,
    /^(.+?)\s*[,;\p{Pd}]+\s*(?:metsamaa\w*|metsaala\w*|(?:forest|woodland)(?:\s+(?:area|land|property|parcel|plot))?)\s+(?:omanik\w*|haldaja\w*|valdaja\w*|kasutaja\w*|owner|manager|holder|possessor)(?:\s+(?:eestis|estonia))?[.?!]?$/iu,
  ];
  return patterns.flatMap((pattern) => {
    const match = text.match(pattern);
    return match ? [match[1]] : [];
  });
}

function partialMunicipalityCandidateHasIdentityMaterial(candidate) {
  if (!reviewedEstonianMunicipalityScope(candidate)
    || reviewedEstonianMunicipalityCandidateScope(candidate)) return false;
  const residual = removeFirstReviewedMunicipalityOrganizationName(candidate);
  const tokens = residual.match(/[\p{L}\p{N}]+/gu) || [];
  // A complete public continuation may follow the municipality in the same
  // asset sentence. Only residual identity material makes the partial match
  // private; conjunctions, institutional descriptors and contact-channel
  // nouns do not become a synthetic person by themselves.
  return tokens.some((token) => !/^(?:a|an|the|and|plus|of|for|to|with|ja|ning|voi|või|official|public|general|state|national|local|municipal|municipality|city|government|environment\w*|forest\w*|nature\w*|climate\w*|water\w*|waste\w*|biodivers\w*|green|infrastructure|agency|authority|board|office|department|service|unit|information|data|contact|phone|telephone|email|mailbox|address|amet\w*|asutus\w*|avalik\w*|riigi\w*|linna\w*|valla\w*|omavalitsus\w*|keskkonna\w*|metsa\w*|loodus\w*|kliima\w*|vee\w*|jäätme\w*|jaatme\w*|elurikk\w*|osakond\w*|teenistus\w*|üksus\w*|uksus\w*|andm\w*|info\w*|kontakt\w*|telefon\w*|e-?post\w*|postkast\w*|aadress\w*)$/iu.test(token));
}

function isCompleteReviewedPublicEntityAssetAssociation(value) {
  return reviewedPublicEntityAssetAssociationCandidates(value).some((candidate) => (
    isReviewedPublicEntityName(candidate)
      || (reviewedEstonianMunicipalityScope(candidate)
        && !partialMunicipalityCandidateHasIdentityMaterial(candidate))
  ));
}

function hasPartialReviewedMunicipalityAssetAssociation(value) {
  return reviewedPublicEntityAssetAssociationCandidates(value)
    .some(partialMunicipalityCandidateHasIdentityMaterial);
}

function isGenericPublicEnvironmentalInstitutionContactQuery(value) {
  const text = String(value || "").trim();
  const completeGenericContact = [
    /^(?:(?:what|where)\s+is\s+the\s+)?(?:(?:official|public|general|state|national)\s+){1,3}(?:(?:contact|email|phone|telephone|postal|information)\s+(?:channel|route)|postal\s+address|phone|telephone|email|mailbox)\s+(?:for|of)\s+(?:the\s+)?(?:(?:national|state|public|government|official)\s+)?(?:environmental|nature|biodiversity|forest(?:ry)?|woodland|water|groundwater|waste|climate)(?:\s+(?:permits?|policy|planning|monitoring|observations?|measurements?|management|conservation|research|statistics|inventory|data|information|guidance|enquir(?:y|ies))){0,3}(?:\s+(?:agency|institution|administration|office|authority|department|unit|service|board)){0,2}\??$/iu,
    /^how\s+can\s+an?\s+official\s+(?:information|press)\s+(?:contact|channel)\s+be\s+distinguished\s+from\s+an?\s+(?:personal|private)\s+contact\??$/iu,
    /^(?:(?:national|state|public|government|official)\s+)?(?:forest(?:ry)?|woodland|nature|biodiversity|national\s+park)(?:\s+(?:policy|monitoring|management|conservation|research|statistics|data|information)){0,2}\s+(?:agency|institution|administration|office|authority|department|unit|service|board)\s+(?:(?:general|public|official)\s+)?(?:contact(?:\s+(?:details?|information|channel))?|information\s+channel|phone|telephone|email|mailbox|address)\??$/iu,
    /^where\s+is\s+the\s+(?:(?:general|public|official)\s+)?(?:contact(?:\s+(?:channel|route))?|mailbox|phone|telephone|email|address)\s+for\s+the\s+(?:forest(?:ry)?|woodland|nature|biodiversity|environmental|climate|water|groundwater|waste)(?:\s+(?:policy|monitoring|observation|management|conservation|research|statistics|inventory|data|information)){0,2}\s+(?:agency|institution|administration|office|authority|department|unit|service|board)\??$/iu,
    /^where\s+can\s+i\s+(?:find|reach)\s+(?:the\s+)?(?:(?:general|public|official)\s+)?(?:contact(?:\s+(?:channel|route))?|mailbox|phone|telephone|email|address)\s+(?:of|for)\s+(?:the\s+)?(?:(?:national|state|public|government|official)\s+)?(?:forest(?:ry)?|woodland|nature|biodiversity|environmental|climate|water|groundwater|waste)(?:\s+(?:policy|monitoring|observation|management|conservation|research|statistics|inventory|data|information)){0,2}(?:\s+(?:agency|institution|administration|office|authority|department|unit|service|board))?\??$/iu,
    /^how\s+(?:can|do)\s+i\s+(?:contact|find|reach)\s+(?:the\s+)?(?:(?:national|state|public|government|official)\s+)?(?:forest(?:ry)?|woodland|nature|biodiversity|environmental|climate|water|groundwater|waste)(?:\s+(?:policy|monitoring|observation|management|conservation|research|statistics|inventory|data|information)){0,2}\s+(?:agency|institution|administration|office|authority|department|unit|service|board)\??$/iu,
    /^(?:official|public|general)\s+contact\s+channel\s+for\s+(?:environmental|nature|biodiversity|forest(?:ry)?|woodland|water|groundwater|waste|climate)(?:\s+(?:permits?|policy|monitoring|management|conservation|data|information))?\??$/iu,
    /^what\s+is\s+the\s+(?:official|public|general)\s+contact\s+(?:channel|route)\s+for\s+(?:environmental|nature|biodiversity|forest(?:ry)?|woodland|water|groundwater|waste|climate)(?:\s+(?:permits?|policy|monitoring|management|conservation|data|information))?\??$/iu,
    /^(?:official|public|general)\s+(?:contact|postal|information)\s+(?:channel|route)\s+for\s+(?:environmental|nature|biodiversity|forest(?:ry)?|woodland|water|groundwater|waste|climate)(?:\s+(?:permits?|policy|monitoring|observation|management|conservation|inventory|data|information|guidance)){0,2}\??$/iu,
    /^(?:official|public|general)\s+(?:postal\s+address|mailbox|phone|telephone|email|contact)\s+for\s+(?:the\s+)?(?:environmental|nature|biodiversity|forest(?:ry)?|woodland|water|groundwater|waste|climate)(?:\s+(?:policy|monitoring|observation|management|conservation|inventory|data|information|guidance)){0,2}\s+(?:agency|institution|administration|office|authority|department|unit|service|board)(?:\s+(?:agency|institution|administration|office|authority|department|unit|service|board))?\??$/iu,
    /^(?:riiklik\w*\s+(?:metsapoliitika\s+asutuse|metsaameti|metsanduse\s+asutuse|looduspoliitika\s+riigiasutuse)|(?:metsa|loodus)poliitika\s+riigiasutuse)\s+(?:üldkontakt\w*|kontakt\w*|telefoni?\w*|e-?post\w*)\??$/iu,
    /^kuidas\s+leida\s+riiklik\w*\s+(?:metsa|loodus|elurikkuse|põhjavee|pohjavee)\w*(?:\s+(?:statistika|poliitika|seire|andmete))?\s+asutuse\s+(?:avalik\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|telefoni?\w*|e-?post\w*)\??$/iu,
    /^kust\s+(?:leida|leian)\s+(?:metsa|loodus|elurikkuse|põhjavee|pohjavee)\w*\s+(?:(?:statistika|poliitika|seire|andmete)\s+|seireteenuse\s+)?(?:avalik\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|telefoni?\w*|e-?post\w*)\??$/iu,
    /^millin\w*\s+on\s+riiklik\w*\s+(?:metsa|loodus|elurikkuse|põhjavee|pohjavee)\w*(?:\s+(?:statistika|poliitika|seire|andmete))?\s+(?:asutuse|üksuse|uksuse|teenistuse)\s+(?:avalik\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|telefoni?\w*|e-?post\w*)\??$/iu,
    /^riikliku?\s+(?:metsa|loodus|elurikkuse|põhjavee|pohjavee|kliima|vee|jäätme|jaatme)\w*(?:\s+(?:statistika|poliitika|seire|andmete|inventuuri))?\s+(?:avalik\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|(?:üld|uld|yld)?telefoni?\w*|e-?post\w*)\??$/iu,
    /^(?:metsa|loodus|elurikkuse|põhjavee|pohjavee|kliima|vee|jäätme|jaatme)\w*(?:\s+(?:statistika|poliitika|seire|andmete|inventuuri|vaatlus\w*)){0,2}\s+riigiasutuse\s+(?:(?:avalik|üldine|uldine|yldine)\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|(?:üld|uld|yld)?telefoni?\w*|e-?post\w*)\??$/iu,
  ].some((pattern) => pattern.test(text));
  if (completeGenericContact) return true;
  const namedPublicOrganizationContact = text.match(
    /^kuidas\s+(?:saada|leida)\s+(.+?)\s+(?:metsa|looduse|elurikkuse|põhjavee|pohjavee|kliima|vee|jäätmete|jaatmete)\w*\s+(?:avalik\w*\s+)?(?:üldkontakt\w*|kontaktkanal\w*|postkast\w*|telefoni?\w*|e-?post\w*)\??$/iu,
  );
  return Boolean(namedPublicOrganizationContact
    && PUBLIC_ORGANIZATION_PATTERN.test(namedPublicOrganizationContact[1]));
}

function isCompletePublicEcologicalAgencyRoleQuestion(value) {
  const text = String(value || "").trim();
  if (/^kes\s+(?:koordineerib|korraldab|juhib)\s+(?:eestis\s+)?(?:elupai[kg]\w*|lii[kg]\w*|elurikkuse|looduse|metsa|põhjavee|pohjavee)\s+(?:seiret|seireprogrammi|kaitset|uuringut)\??$/iu.test(text)
    || /^millin\w*\s+(?:amet|asutus|agentuur|organisatsioon)\s+(?:koordineerib|korraldab|juhib)\s+(?:eestis\s+)?(?:elupai[kg]\w*|lii[kg]\w*|elurikkuse|looduse|metsa|põhjavee|pohjavee)\s+(?:seiret|seireprogrammi|kaitset|uuringut)\??$/iu.test(text)
    || /^kelle\s+kaudu\s+toimub\s+(?:eestis\s+)?(?:elupai[kg]\w*|lii[kg]\w*|elurikkuse|looduse|metsa|põhjavee|pohjavee)\s+riiklik\w*\s+(?:seire|seireprogramm|kaitse|uuring)\w*\??$/iu.test(text)
    || /^(?:which|what)\s+(?:public\s+)?(?:agency|authority|institution|organization)\s+(?:coordinates?|manages?|runs?|oversees?)\s+(?:the\s+)?(?:estonia(?:n)?\s+)?(?:habitat|species|biodiversity|nature|forest|groundwater)\s+(?:monitoring|conservation|research)\s+(?:programme|program)?\??$/iu.test(text)) return true;
  const namedOrganizationRole = text.match(
    /^who\s+(?:coordinates?|manages?|runs?|oversees?)\s+(?:the\s+)?(?:habitat|species|biodiversity|nature|forest|groundwater)\s+(?:monitoring|conservation|research)\s+(?:in\s+estonia\s+)?for\s+(?:the\s+)?(.+?)\??$/iu,
  );
  return Boolean(namedOrganizationRole
    && removeFirstPublicOrganizationName(namedOrganizationRole[1])
      .replace(/[.?!,;:]+$/gu, "")
      .trim() === "");
}

function isCompletePublicForestConceptQuestion(value) {
  const text = String(value || "").trim();
  return /^what\s+is\s+the\s+difference\s+between\s+(?:forest\s+area\s+and\s+forest\s+cover|forest\s+cover\s+and\s+forest\s+area)\??$/iu.test(text)
    || /^how\s+does\s+(?:the\s+)?(?:forest\s+)?inventory\s+(?:distinguish|differentiate)\s+(?:forest\s+area|forest\s+land|woodland\s+coverage|forest\s+cover)\s+from\s+(?:forest\s+area|forest\s+land|woodland\s+coverage|forest\s+cover)\??$/iu.test(text)
    || /^mis\s+vahe\s+on\s+(?:metsamaa\s+pindalal\s+ja\s+metsaga\s+kaetud\s+alal|metsa\s+pindalal\s+ja\s+metsakattel)\??$/iu.test(text);
}

function isCompletePublicNationalForestAreaQuestion(value) {
  const text = String(value || "").trim();
  return /^kui\s+suur\s+(?:oli|on)\s+(?:eesti|eestis)\s+(?:metsamaa\s+pindala|metsaga\s+kaetud\s+ala|metsa\s+pindala|metsasus)(?:\s+(?:19|20)\d{2}(?:\.?\s*aastal)?)?\??$/iu.test(text)
    || /^mitu\s+hektarit\s+(?:oli|on)\s+(?:eesti|eestis)\s+(?:metsamaad|metsaga\s+kaetud\s+ala|metsa|metsakatet)(?:\s+(?:19|20)\d{2}(?:\.?\s+aastal)?)?\??$/iu.test(text)
    || /^how\s+many\s+hectares?\s+did\s+estonia\s+(?:report|record|have)\s+as\s+(?:forest\s+area|forest\s+land|woodland\s+coverage|forest\s+cover)\s+(?:in|for)\s+(?:19|20)\d{2}\??$/iu.test(text)
    || /^how\s+(?:much|many\s+hectares?\s+of)\s+(?:forest\s+area|forest\s+land|woodland\s+coverage|forest\s+cover)\s+did\s+estonia\s+(?:report|record|have)\s+(?:in|for)\s+(?:19|20)\d{2}\??$/iu.test(text);
}

function completePossessiveForestAggregatePossessor(value) {
  const text = String(value || "").trim();
  // A single possessive token is often a person's given name, so do not make
  // arbitrary possessives public. This grammar is deliberately full-query and
  // admits only reviewed public geographies/ecological programmes plus a
  // bounded environmental metric. Appended identity or private-asset clauses
  // therefore fall through to the privacy classifier.
  const possessorSource = String.raw`(?<possessor>[\p{L}\p{N}][\p{L}\p{N}&.-]{0,49}(?:\s+[\p{L}\p{N}][\p{L}\p{N}&.-]{0,49}){0,5})`;
  const forestMetric = String.raw`(?:(?:forest|forestry|woodland)\s+(?:statistics|data|area|land|cover(?:age)?|habitats?|biodiversity|inventory|polic(?:y|ies)|management|monitoring|conservation|research|guidance))`;
  const durationAmount = String.raw`(?:a|an|all|each|every|multiple|several|\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)`;
  const durationPeriod = String.raw`(?:calendar\s+)?(?:years?|decades?)`;
  const durationPhrase = String.raw`(?:(?:the\s+)?(?:last|past|previous|recent)\s+(?:${durationAmount}\s+)?${durationPeriod}|${durationAmount}\s+${durationPeriod}|(?:the\s+)?decade)`;
  const yearRange = String.raw`(?:(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}|(?:from\s+(?:19|20)\d{2}\s+(?:to|through|until)|between\s+(?:19|20)\d{2}\s+and)\s+(?:19|20)\d{2})`;
  const temporalSuffix = String.raw`(?:\s+(?:(?:in|for)\s+(?:19|20)\d{2}|today|now|currently|(?:yearly|annually)(?:\s+${yearRange})?|annual(?:ly)?\s+(?:trend|history|time\s+series)|historical\s+(?:trend|history|time\s+series)|(?:by|per)\s+(?:calendar\s+)?year|year[-\s]+by[-\s]+year|(?:this|current|latest|most\s+recent)\s+year|(?:over|for|through|during|across|throughout)\s+${durationPhrase}|(?:in|for)\s+(?:successive|consecutive|multiple|several|all|each|every)\s+(?:calendar\s+)?years?|since\s+(?:19|20)\d{2}|${durationPhrase}|(?:in\s+)?${yearRange}))?`;
  const methodSuffix = String.raw`(?:\s+in\s+estonia)?\s+and\s+how\s+is\s+it\s+(?:measured|estimated|calculated|surveyed|inventoried)`;
  const patterns = [
    new RegExp(
      String.raw`^(?:what\s+(?:is|are)|how\s+much\s+is)\s+(?:the\s+)?${possessorSource}(?:'s|’s)\s+${forestMetric}(?:${temporalSuffix}|${methodSuffix})\??$`,
      "iu",
    ),
    new RegExp(
      String.raw`^(?:the\s+)?${possessorSource}(?:'s|’s)\s+${forestMetric}(?:${temporalSuffix}|${methodSuffix})\??$`,
      "iu",
    ),
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  return match?.groups?.possessor || null;
}

function denyOnlyPossessiveForestAggregatePossessor(value) {
  const text = String(value || "").trim();
  // The public grammar above deliberately accepts only ordinary word spacing.
  // This second, bounded parser is never an allowlist: it exists solely so a
  // punctuation-separated person/geography collision cannot evade the
  // partial-identity privacy check before reaching an upstream provider.
  const possessorSource = String.raw`(?<possessor>[\p{L}\p{N}][\p{L}\p{N}\p{P}\p{S}\p{Z}\p{M}&]{0,119}?)`;
  const metricSource = String.raw`(?:(?:forest|forestry|woodland)\s+(?:statistics|data|area|land|cover(?:age)?|habitats?|biodiversity|inventory|polic(?:y|ies)|management|monitoring|conservation|research|guidance))`;
  const patterns = [
    new RegExp(
      String.raw`^(?:what\s+(?:is|are)|how\s+much\s+is)\s+(?:the\s+)?${possessorSource}(?:'s|’s)\s+${metricSource}(?:[\s\S]{0,100})?\??$`,
      "iu",
    ),
    new RegExp(
      String.raw`^(?!what\b|how\b|forest\b|forestry\b|woodland\b)(?:the\s+)?${possessorSource}(?:'s|’s)\s+${metricSource}(?:[\s\S]{0,100})?\??$`,
      "iu",
    ),
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  return match?.groups?.possessor || null;
}

function isReviewedPublicPossessiveForestAggregatePossessor(possessor) {
  if (!possessor) return false;
  const normalizedPossessor = normalize(possessor);
  const reviewedGeographyOrProgramme = /^(?:estonia|country|nation|state|world|europe|eu|natura(?:\s+2000)?|lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse|gondor|atlantis|middle\s+earth)$/u.test(normalizedPossessor);
  const foreignScope = classifyForestryGeographyScope(`${possessor} forest area`);
  const normalizedForeignIdentity = normalize(foreignScope.identity || foreignScope.matched || "");
  const municipalityScope = reviewedEstonianForestryMunicipalityScope(possessor);
  const municipalityMatches = Array.isArray(municipalityScope?.matched)
    ? municipalityScope.matched
    : [municipalityScope?.matched].filter(Boolean);
  const completeReviewedMunicipality = municipalityScope?.status === "exact"
    && municipalityMatches.some((matched) => normalize(matched) === normalizedPossessor);
  return reviewedGeographyOrProgramme
    || (foreignScope.kind === "foreign-or-other-region"
      && Boolean(normalizedForeignIdentity)
      && normalizedPossessor === normalizedForeignIdentity)
    || completeReviewedMunicipality
    || isReviewedEstonianMunicipalityIdentity(possessor)
    || removeFirstReviewedMunicipalityOrganizationName(possessor).trim() === ""
    || isWholeReviewedPublicOrganizationName(possessor);
}

function isCompletePublicPossessiveForestAggregateQuestion(value) {
  const possessor = completePossessiveForestAggregatePossessor(value);
  return Boolean(possessor)
    && !hasLossyUnicodeLetterOrNumber(possessor)
    && isReviewedPublicPossessiveForestAggregatePossessor(possessor);
}

function hasUnreviewedPossessiveForestAggregateQuestion(value) {
  const possessor = completePossessiveForestAggregatePossessor(value);
  return Boolean(possessor)
    && (hasLossyUnicodeLetterOrNumber(possessor)
      || !isReviewedPublicPossessiveForestAggregatePossessor(possessor));
}

function isCompletePublicEcologicalPossessiveForestQuestion(value) {
  const text = String(value || "").trim();
  const match = text.match(
    /^(?:(?:what|which)\s+(?:is|are)\s+(?:the\s+)?)?(?<subject>[\p{L}-]+(?:\s+[\p{L}-]+){0,3})(?:'s|’s)\s+(?:forest|woodland)\s+(?:habitats?|ecology|range|distribution|biodiversity|conservation)(?:\s+(?:data|information|map|maps|status|description|guidance))?\??$/iu,
  );
  if (!match?.groups?.subject) return false;
  const subjectWords = match.groups.subject.split(/\s+/u);
  const species = subjectWords.at(-1) || "";
  return ECOLOGICAL_SUBJECT_PATTERN.test(species)
    && subjectWords.slice(0, -1).every((word) => (
      ECOLOGICAL_MODIFIER_PATTERN.test(word) || ECOLOGICAL_SUBJECT_PATTERN.test(word)
    ));
}

function normalizePossessivePrivacyCandidate(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[\p{P}\p{S}\p{Z}\p{C}_]+/gu, " ")
    .toLocaleLowerCase("et")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function hasPartialReviewedGeographyPossessiveForestAggregate(value) {
  const completePossessor = completePossessiveForestAggregatePossessor(value);
  if (completePossessor
    && !hasLossyUnicodeLetterOrNumber(completePossessor)
    && isReviewedPublicPossessiveForestAggregatePossessor(completePossessor)) return false;
  const possessor = completePossessor || denyOnlyPossessiveForestAggregatePossessor(value);
  if (!possessor) return false;
  const rawPossessorHasLossyUnicode = hasLossyUnicodeLetterOrNumber(possessor);
  // The complete public grammar is Latin/public-entity scoped. A residual
  // caseless or mixed-script possessor that was not accepted above must never
  // be normalized away and forwarded as an ordinary forestry aggregate.
  if (rawPossessorHasLossyUnicode) return true;
  const normalizedPossessor = normalizePossessivePrivacyCandidate(possessor);
  const foreignScope = classifyForestryGeographyScope(`${normalizedPossessor} forest area`);
  const normalizedForeignIdentity = normalizePossessivePrivacyCandidate(
    foreignScope.identity || foreignScope.matched || "",
  );
  const hasPartialForeignIdentity = foreignScope.kind === "foreign-or-other-region"
    && Boolean(normalizedForeignIdentity)
    && (rawPossessorHasLossyUnicode || normalizedPossessor !== normalizedForeignIdentity);
  const isExactReviewedProgramme = /^(?:estonia|country|nation|state|world|europe|eu|natura(?:\s+2000)?|lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse|gondor|atlantis)$/u
    .test(normalizedPossessor);
  const hasPartialReviewedProgramme = /(?:^|\s)(?:estonia|country|nation|state|world|europe|eu|natura(?:\s+2000)?|lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse|gondor|atlantis)(?:\s|$)/u
    .test(normalizedPossessor)
    && (rawPossessorHasLossyUnicode || !isExactReviewedProgramme);
  const municipalityScope = reviewedEstonianForestryMunicipalityScope(normalizedPossessor);
  const municipalityMatches = Array.isArray(municipalityScope?.matched)
    ? municipalityScope.matched
    : [municipalityScope?.matched].filter(Boolean);
  const hasPartialMunicipality = municipalityMatches.some((matched) => (
    rawPossessorHasLossyUnicode
      || normalizePossessivePrivacyCandidate(matched) !== normalizedPossessor
  ));
  return hasPartialForeignIdentity || hasPartialReviewedProgramme || hasPartialMunicipality;
}

function isCompletePublicForestOwnershipAggregate(value) {
  const text = String(value || "").trim();
  return /^(?:metsamaa|metsaala|mets|metsaomand)\w*\s+(?:on\s+)?(?:riigi|avalikus?|munitsipaal|omavalitsuse|linna|valla)\w*\s+omandis(?:\s+(?:(?:ja|ning)\s+)?eestis)?\??$/iu.test(text)
    || /^(?:forest|woodland)(?:\s+(?:area|land|property))?\s+(?:is\s+)?(?:state|public|municipal|government)[-\s]+owned(?:\s+in\s+estonia)?\??$/iu.test(text);
}

function hasPersonPrefixedReviewedMunicipalityAssetAssociation(value) {
  const text = String(value || "");
  const normalizedText = normalize(text);
  if (!/(?:^|\s)(?:forest\w*|woodland\w*|land|property|parcel|plot|estate|well|borehole|mets\w*|metsamaa\w*|metsaala\w*|metsauksus\w*|kinnist\w*|maauksus\w*|maatukk\w*|puurkaev\w*|kaev\w*|eramaa\w*)(?:\s|$)/u.test(normalizedText)
    || !/(?:^|\s)(?:own\w*|ownership|hold\w*|held|manag\w*|administ\w*|operat\w*|steward\w*|custod\w*|possess\w*|register\w*|record\w*|assign\w*|inherit\w*|transfer\w*|convey\w*|grant\w*|title\w*|authority|omand\w*|omanik\w*|valdus\w*|valda\w*|kuulu\w*|halda\w*|hallata|majanda\w*|registreeri\w*|salvesta\w*|maara\w*|omista\w*|seosta\w*|loovuta\w*|pari\w*|antud|vastuta\w*|kasuta\w*|kaita\w*)(?:\s|$)/u.test(normalizedText)) return false;
  const words = normalizedText.split(/\s+/u).filter(Boolean);
  const isMunicipalityMarker = (word, next) => /^(?:city|municipalit\w*|municipal|linn\w*|val(?:d|l)\w*)$/u.test(word)
    || (/^(?:local|municipal|city)$/u.test(word) && next === "government");
  const isPublicPrefix = (word) => /^(?:a|an|the|and|or|of|by|to|for|from|in|under|with|at|near|city|municipality|municipal|local|government|official|public|state|national|county|regional|greater|new|old|north|south|east|west|forest\w*|woodland\w*|land|property|parcel|plot|estate|environment\w*|nature\w*|climate\w*|water\w*|waste\w*|agency|authority|board|office|department|service|unit|riigi\w*|avalik\w*|munitsipaal\w*|omavalitsus\w*|linna\w*|valla\w*|keskkonna\w*|metsa\w*|loodus\w*|kliima\w*|vee\w*|jaatme\w*|amet\w*|asutus\w*|osakond\w*|teenistus\w*|uksus\w*)$/u.test(word);
  const isAssetWord = (word) => /^(?:forest\w*|woodland\w*|land|property|parcel|plot|estate|well|borehole|mets\w*|metsamaa\w*|metsaala\w*|metsauksus\w*|kinnist\w*|maauksus\w*|maatukk\w*|puurkaev\w*|kaev\w*|eramaa\w*)$/u.test(word);
  const isAssociationWord = (word) => /^(?:own\w*|ownership|hold\w*|held|manag\w*|administ\w*|operat\w*|steward\w*|custod\w*|possess\w*|register\w*|record\w*|assign\w*|inherit\w*|transfer\w*|convey\w*|grant\w*|title\w*|authority|omand\w*|omanik\w*|valdus\w*|valda\w*|kuulu\w*|halda\w*|hallata|majanda\w*|registreeri\w*|salvesta\w*|maara\w*|omista\w*|seosta\w*|loovuta\w*|pari\w*|antud|vastuta\w*|kasuta\w*|kaita\w*)$/u.test(word);
  const hasReviewedMunicipalityMention = words.some((word, index) => (
    REVIEWED_ESTONIAN_MUNICIPALITY_BASES.has(word)
      && isMunicipalityMarker(words[index + 1] || "", words[index + 2] || "")
  ));
  if (hasReviewedMunicipalityMention && words.some((word, index) => (
    /^(?:to|by|for|under|with)$/u.test(word)
      && words.slice(Math.max(0, index - 3), index).some(isAssociationWord)
      && !isPublicPrefix(words[index + 1] || "")
      && !REVIEWED_ESTONIAN_MUNICIPALITY_BASES.has(words[index + 1] || "")
      && words.slice(index + 2, index + 6).some(isAssetWord)
  ))) return true;
  return words.some((word, index) => (
    REVIEWED_ESTONIAN_MUNICIPALITY_BASES.has(word)
      && isMunicipalityMarker(words[index + 1] || "", words[index + 2] || "")
      && index > 0
      && !isPublicPrefix(words[index - 1])
      && !isAssociationWord(words[index - 1])
      && !REVIEWED_ESTONIAN_MUNICIPALITY_BASES.has(words[index - 1])
  ));
}

function isExplicitHyphenatedReviewedCountyNameMatch(nameParts, matchedText) {
  if (nameParts.length !== 2
    || !isReviewedEstonianCountyIdentity(nameParts.join(" "))) return false;
  const pattern = new RegExp(
    `(?<!\\p{L})${RegExp.escape(nameParts[0])}\\s*\\p{Pd}+\\s*${RegExp.escape(nameParts[1])}(?!\\p{L})`,
    "iu",
  );
  return pattern.test(String(matchedText || ""));
}

function explicitHyphenatedReviewedCountyTokenIndexes(nameParts, matchedText) {
  const indexes = new Set();
  nameParts.forEach((part, index) => {
    if (/\p{L}\s*\p{Pd}+\s*\p{L}/u.test(part)
      && isReviewedEstonianCountyIdentity(part)) indexes.add(index);
  });
  for (let index = 0; index < nameParts.length - 1; index += 1) {
    if (!isExplicitHyphenatedReviewedCountyNameMatch(
      [nameParts[index], nameParts[index + 1]],
      matchedText,
    )) continue;
    indexes.add(index);
    indexes.add(index + 1);
  }
  return indexes;
}

function removeExplicitHyphenatedReviewedCountyNames(value) {
  return String(value || "").replace(
    /(?<!\p{L})(\p{L}+)\s*\p{Pd}+\s*(\p{L}+)(?!\p{L})/gu,
    (match, first, second) => (
      isReviewedEstonianCountyIdentity(`${first} ${second}`) ? " " : match
    ),
  );
}

function hasEarlyNamedPersonSensitiveAssociation(value) {
  const text = String(value || "");
  const pairIsPersonShaped = (first, second) => (
    !PERSON_CONTEXT_STOPWORD_PATTERN.test(first)
    && !PERSON_CONTEXT_STOPWORD_PATTERN.test(second)
    && !PUBLIC_ORGANIZATION_PATTERN.test(`${first} ${second}`)
    && removeFirstPublicOrganizationName(`${first} ${second}`).trim() !== ""
    && !isReviewedEstonianMunicipalityIdentity(`${first} ${second}`)
    && !NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(first)
    && !NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(second)
    && !(ECOLOGICAL_SUBJECT_PATTERN.test(second)
      && (ECOLOGICAL_SUBJECT_PATTERN.test(first)
        || ECOLOGICAL_MODIFIER_PATTERN.test(first)))
  );
  const namePartsContainPersonPair = (nameParts, matchedText) => {
    if (nameParts.length < 2
      || nameParts.some((part) => NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(part))
      || removeFirstPublicOrganizationName(nameParts.join(" ")).trim() === ""
      || isReviewedEstonianMunicipalityIdentity(nameParts.join(" "))) return false;
    const countyTokenIndexes = explicitHyphenatedReviewedCountyTokenIndexes(nameParts, matchedText);
    const candidatePairs = nameParts.length === 3
      ? [[0, 1], [1, 2]]
      : [[0, 1]];
    return candidatePairs.some(([firstIndex, lastIndex]) => {
      if (countyTokenIndexes.has(firstIndex) || countyTokenIndexes.has(lastIndex)) return false;
      const first = nameParts[firstIndex];
      const last = nameParts[lastIndex];
      return (
        !OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN.test(first)
        && !OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN.test(last)
        && pairIsPersonShaped(first, last)
        && removeFirstPublicOrganizationName(`${first} ${last}`).trim() !== ""
        && !isReviewedEstonianMunicipalityIdentity(`${first} ${last}`)
      );
    });
  };
  ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN)) {
    if (!pairIsPersonShaped(match[1], match[2])) continue;
    const suffix = text.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 80);
    if (/^\s+(?:habitat|range|ecology|environment|description|species|population|elupai[kg]\w*|keskkond\w*|kirjeldus\w*)\b/iu.test(suffix)) continue;
    ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN.lastIndex = 0;
    return true;
  }
  ANY_CASE_NAMED_PERSON_LOCATION_FIELD_PATTERN.lastIndex = 0;
  ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN)) {
    const nameParts = [match[1], match[2], match[3]].filter(Boolean);
    if (!namePartsContainPersonPair(nameParts, match[0])) continue;
    const suffix = text.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 50);
    if (/^\s+(?:agency|authority|board|company|corporation|council|department|government|institute|institution|office|organization|organisation|service|team|university)\b/iu.test(suffix)) continue;
    ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN.lastIndex = 0;
    return true;
  }
  ANY_CASE_ROLE_TO_NAMED_PERSON_PATTERN.lastIndex = 0;
  for (const pattern of [
    ANY_CASE_OWNERSHIP_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_ROLE_LABEL_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_ESTONIAN_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_NAMED_PERSON_OWNERSHIP_FIELD_PATTERN,
    ANY_CASE_FOREST_METRIC_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_FOREST_ASSET_IN_NAMED_PERSON_NAME_PATTERN,
    ANY_CASE_NAMED_PERSON_TO_FOREST_ASSET_PATTERN,
    ANY_CASE_FOREST_ASSET_ROLE_TO_NAMED_PERSON_PATTERN,
    ANY_CASE_NAMED_PERSON_APPOSITIVE_ASSET_ROLE_PATTERN,
    ANY_CASE_NAMED_PERSON_PRIVATE_ASSET_ROLE_PATTERN,
    ANY_CASE_FOREST_ASSET_GIVEN_TO_NAMED_PERSON_PATTERN,
  ]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const nameParts = [match[1], match[2], match[3]].filter(Boolean);
      if (pattern === ANY_CASE_NAMED_PERSON_OWNERSHIP_FIELD_PATTERN
        && nameParts.some((part) => /^(?:county\w*|maakon\w*)$/iu.test(part))) continue;
      // The optional third token is intentionally permissive so three-part
      // names work, but it can also consume the first word after a two-part
      // name ("Jaan Tamm in Estonia" or "Jaan Tamm forest area"). Check both
      // adjacent pairs. This also keeps "Anna Maria Tamm" private even though
      // “Anna” is an Estonian request verb. Explicit organization designators,
      // reviewed municipalities and ecological/common-noun pairs stay public.
      if (!namePartsContainPersonPair(nameParts, match[0])) continue;
      if (pattern === ANY_CASE_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN
        || pattern === ANY_CASE_ESTONIAN_FOREST_TRANSFER_TO_NAMED_PERSON_PATTERN) {
        const relationWindow = text.slice(
          Math.max(0, (match.index || 0) - 70),
          Math.min(text.length, (match.index || 0) + match[0].length + 70),
        );
        if (!/(?<!\p{L})(?:metsamaa\w*|metsaala\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*|forest|woodland)(?!\p{L})/iu.test(relationWindow)) continue;
      }
      if (pattern === ANY_CASE_NAMED_PERSON_OWNERSHIP_FIELD_PATTERN
        || pattern === ANY_CASE_NAMED_PERSON_APPOSITIVE_ASSET_ROLE_PATTERN) {
        const relationWindow = text.slice(
          Math.max(0, (match.index || 0) - 55),
          Math.min(text.length, (match.index || 0) + match[0].length + 70),
        );
        const hasAssetContext = /(?<!\p{L})(?:katastri\w*|kinnist\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|metsamaa\w*|metsaala\w*|metsaomanik\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*|puurkaev\w*|property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|forest|woodland)(?!\p{L})/iu.test(relationWindow);
        const hasExplicitPublicAsset = /(?<!\p{L})(?:(?:public|state(?:[-\s]+owned)?|municipal|government|national)[\s\p{Pd}_]+(?:forest|woodland|land|property|parcel|plot|well|borehole)|(?:riigi|avalik|munitsipaal|rahvus|valla|linna)[\s\p{Pd}_]*(?:mets\w*|metsamaa\w*|maa\w*|kinnist\w*|puurkaev\w*))(?!\p{L})/iu.test(relationWindow);
        if (!hasAssetContext || hasExplicitPublicAsset) continue;
      }
      const suffix = text.slice((match.index || 0) + match[0].length, (match.index || 0) + match[0].length + 50);
      if (/^\s+(?:agency|authority|board|company|corporation|council|department|government|institute|institution|office|organization|organisation|service|team|university)\b/iu.test(suffix)) continue;
      pattern.lastIndex = 0;
      return true;
    }
    pattern.lastIndex = 0;
  }
  return false;
}

function hasEarlyBoundedNamedPrivateAssetAssociation(value) {
  const text = String(value || "");
  if (ENGLISH_POSSESSIVE_PRONOUN_PRIVATE_ASSET_PATTERN.test(text)) return true;
  for (const pattern of [
    ENGLISH_SINGLE_TOKEN_POSSESSIVE_PRIVATE_ASSET_PATTERN,
    ENGLISH_CONNECTOR_SINGLE_TOKEN_POSSESSIVE_PRIVATE_ASSET_PATTERN,
  ]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const possessor = match[1] || "";
      const normalizedPossessor = normalize(possessor);
      const isReviewedPublicPossessor = OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN.test(possessor)
        || NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(possessor)
        || PUBLIC_ORGANIZATION_PATTERN.test(possessor)
        || removeFirstPublicOrganizationName(possessor).trim() === ""
        || Boolean(reviewedEstonianForestryMunicipalityScope(possessor))
        || /^(?:today|tomorrow|yesterday|world|country|nation|europe|eu|lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse)$/u.test(normalizedPossessor)
        || ECOLOGICAL_SUBJECT_PATTERN.test(possessor)
        || ECOLOGICAL_MODIFIER_PATTERN.test(possessor);
      if (!isReviewedPublicPossessor) {
        pattern.lastIndex = 0;
        return true;
      }
    }
    pattern.lastIndex = 0;
  }
  const pairIsPersonShaped = (first, second) => (
    !PERSON_CONTEXT_STOPWORD_PATTERN.test(first)
    && !PERSON_CONTEXT_STOPWORD_PATTERN.test(second)
    && !OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN.test(first)
    && !OWNERSHIP_ASSOCIATION_NON_PERSON_TOKEN_PATTERN.test(second)
    && !PUBLIC_ORGANIZATION_PATTERN.test(`${first} ${second}`)
    && !isReviewedEstonianMunicipalityIdentity(`${first} ${second}`)
    && !NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(first)
    && !NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(second)
    && !(ECOLOGICAL_SUBJECT_PATTERN.test(second)
      && (ECOLOGICAL_SUBJECT_PATTERN.test(first)
        || ECOLOGICAL_MODIFIER_PATTERN.test(first)))
  );
  const namePartsContainPersonPair = (nameParts, matchedText) => {
    if (nameParts.length < 2
      || nameParts.some((part) => NAMED_PERSON_ASSOCIATION_ORGANIZATION_DESIGNATOR_PATTERN.test(part))
      || removeFirstPublicOrganizationName(nameParts.join(" ")).trim() === ""
      || isReviewedEstonianMunicipalityIdentity(nameParts.join(" "))) return false;
    const countyTokenIndexes = explicitHyphenatedReviewedCountyTokenIndexes(nameParts, matchedText);
    const pairs = nameParts.length === 3
      ? [[0, 1], [1, 2]]
      : [[0, 1]];
    return pairs.some(([firstIndex, secondIndex]) => (
      !countyTokenIndexes.has(firstIndex)
      && !countyTokenIndexes.has(secondIndex)
      && pairIsPersonShaped(nameParts[firstIndex], nameParts[secondIndex])
    ));
  };
  for (const pattern of [
    ANY_CASE_CONNECTOR_NAMED_PERSON_PRIVATE_ASSET_PATTERN,
    CLAUSE_LEADING_NAMED_PERSON_PRIVATE_ASSET_PATTERN,
    ANY_CASE_ESTONIAN_NAMED_PERSON_PRIVATE_LAND_PATTERN,
    ANY_CASE_ESTONIAN_NAMED_PERSON_PRIVATE_COMPOUND_ASSET_PATTERN,
    HYPHENATED_ESTONIAN_NAMED_PERSON_PRIVATE_ASSET_PATTERN,
    ANY_CASE_OWNERSHIP_TO_NAMED_PERSON_PATTERN,
  ]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const nameParts = [match[1], match[2], match[3]].filter(Boolean);
      if (namePartsContainPersonPair(nameParts, match[0])) {
        pattern.lastIndex = 0;
        return true;
      }
    }
    pattern.lastIndex = 0;
  }
  return false;
}

function isPlainEcologicalResidenceDescriptionQuestion(value) {
  const text = String(value || "").trim();
  const match = text.match(
    /^(?:(?:millin\w*|mis)\s+on\s+)?([\p{L}-]+(?:\s+[\p{L}-]+)?)\s+(?:lii[kg]\w*\s+)?(?:(?:tüüpilin\w*|tuupilin\w*)\s+)?(?:elukoha|elupaiga)\s+(?:(?:tüüpilin\w*|tuupilin\w*)\s+)?(?:(?:keskkonna|looduse)\s+kirjeldus\w*|keskkond\w*|loodus\w*|kirjeldus\w*|seisund\w*)(?:\s+(?:eestis|euroopas|baltikumis|metsades))?\??$/iu,
  );
  if (match) {
    const subjectWords = match[1].split(/\s+/u)
      .filter((word) => !/^(?:tüüpilin|tuupilin)\w*$/iu.test(word));
    const species = subjectWords.at(-1) || "";
    if (ECOLOGICAL_SUBJECT_PATTERN.test(species)
      && (subjectWords.length === 1 || subjectWords.slice(0, -1).every(
        (word) => ECOLOGICAL_MODIFIER_PATTERN.test(word) || ECOLOGICAL_SUBJECT_PATTERN.test(word),
      ))) return true;
  }
  const englishMatch = text.match(
    /^((?:[\p{L}-]+\s+){0,3}[\p{L}-]+)\s+(?:habitat|range|ecology)\s+(?:location|distribution|range|environment)(?:\s+(?:policy|guidance|description|data|map))?\??$/iu,
  );
  if (!englishMatch) return false;
  const subjectWords = englishMatch[1].split(/\s+/u);
  const species = subjectWords.at(-1) || "";
  return ECOLOGICAL_SUBJECT_PATTERN.test(species)
    && subjectWords.slice(0, -1).every((word) => (
      ECOLOGICAL_MODIFIER_PATTERN.test(word) || ECOLOGICAL_SUBJECT_PATTERN.test(word)
    ));
}
const PUBLIC_CONTACT_ROLE_PATTERN = /^(?:büroo\w*|buroo\w*|e|info\w*|juht\w*|keskkonnaosakond\w*|klienditeenindus\w*|nõunik\w*|nounik\w*|osakond\w*|post|press\w*|projektiosakond\w*|spetsialist\w*|teenindus\w*|ühine|uhine|üld\w*|uld\w*|yld\w*|vaatlus\w*|customer|data|office|regional|research|service|support)$/iu;
const PERSON_CONTEXT_STOPWORD_PATTERN = /^(?:aga|alal|andm\w*|andmev[äa]rav\p{L}*|andmetel|anna|andke|asub|asuv\w*|avalik\w*|jaoks|kaudu|kas|kaits\w*|kasuta\w*|katastri\w*|kehti\w*|kes|kuidas|kinnist\w*|konkreetse|kohta|kuulu\w*|kui|kus|kust|küsimus\w*|kõrval|lahedal|lähedal|lasta|lei\w*|loa\w*|luba\w*|maaüksus\w*|maauksus\w*|maatükk\w*|maatukk\w*|metsaeraldis\w*|metsaregister\w*|millal|millin\w*|millis\w*|minu|mis|mida|midagi|miks|nõu\w*|näen|näha|näita|naita|oleva|oma|on|otsing\w*|palju|p[õo]him[õo]t\w*|poliitik\w*|puurkaev\w*|s[äa]ilita\w*|smi|sügavus\w*|tagasta|tagastage|talu\w*|testida|too|t[öo][öo]tle\w*|ütleb|vaadata|valda|vaja|ööbib|oobib|paikneb|peatub|piirkonn\w*|resideerib|registr\w*|viibib|järgi|ja|ning|või|voi|ääres|aasta|elab|elava|majas|a|about|affect\w*|are|area\w*|at|be|by|can|could|customer|data|did|do|does|for|from|get|give|handle[sd]?|handling|how|in|information|is|live[sd]?|living|may|me|must|near|number|occup(?:y|ies|ied|ying)|of|office|on|permit\w*|polic(?:y|ies)|process(?:es|ed|ing)?|protect(?:s|ed|ing)?|protected|public|regional|register\w*|requirement\w*|research|reside[sd]?|residing|return|s|service|should|show|state|stor(?:e|es|ed|ing)|stay(?:s|ed|ing)?|support|tell|that|the|this|to|use[sd]?|using|what|where|which|who|with|would)$/iu;
const ESTONIAN_PRIVATE_OWNERSHIP_PATTERN = /\b(?:omanik\w*|omaja\w*|omand(?:is|uses)\w*|oma(?:b|vad|s|sid|nud|ma|takse|tud)|valdaj\w*|valduses\w*|valda(?:b|vad|s|sid|nud|ma)|kellele\s+kuulub)\b/iu;
const ESTONIAN_FOREST_NOUN_PATTERN = /^(?:mets(?:a(?:s|st|le|lt|ga|d(?:e(?:s|st|le|lt|ga)?)?)?|i)?|metsaa)$/iu;
const ESTONIAN_PRIVATE_FOREST_NOUN_PATTERN = /^(?:eramets(?:a(?:s|st|le|lt|ga|d(?:e(?:s|st|le|lt|ga)?)?)?|i)?|erametsaa)$/iu;
const ESTONIAN_WELL_NOUN_PATTERN = /^kaev(?:u(?:s|st|le|lt|ga|d(?:e(?:s|st|le|lt|ga)?)?)?|e)?$/iu;
const PRIVATE_FOREST_ASSET_PATTERN = /(?<!\p{L})(?:metsamaa\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*|mets(?:a(?:s|st|le|lt|ga|d(?:e(?:s|st|le|lt|ga)?)?)?|i)?|forests?|woodlands?)(?!\p{L})/iu;
const PRIVATE_ASSET_LOOKUP_ACTION_PATTERN = /\b(?:anna|andke|leia|otsi|näita|naita|kuva|tagasta|tagastage|too|show|find|locate|display|reveal|provide|give|get|return|tell)\b/iu;
const FOLLOWING_FOREST_PERSON_LOOKUP_ACTION_PATTERN = /(?<!\p{L})(?:anna|andke|leia|otsi|näita|naita|kuva|tagasta|tagastage|too|show|find|locate|display|reveal|provide|give|get|return|tell|search|look(?:[\s-]+)?up|list|name)(?!\p{L})/iu;
const PRIVATE_OWNER_ROLE_SOURCE = String.raw`(?:owners?|landowners?|homeowners?|propertyowners?|forestowners?|proprietors?|landholders?|landlords?|land\s+owners?|home\s+owners?|property\s+owners?|forest\s+owners?|land\s+holders?)`;
const IMPERATIVE_NAMED_OWNER_LOOKUP_PATTERN = new RegExp(
  String.raw`^(?:find|show|search|locate|identify|lookup|look\s+up|list|name|tell\s+me|give\s+me)\s+(?:the\s+)?(?:(?:${COUNTY_PERSON_TOKEN_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}){1,5}${COUNTY_PERSON_TOKEN_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}${PRIVATE_OWNER_ROLE_SOURCE}|${PRIVATE_OWNER_ROLE_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}(?:${COUNTY_PERSON_TOKEN_SOURCE}${COUNTY_ASSOCIATION_SEPARATOR_SOURCE}){1,5}${COUNTY_PERSON_TOKEN_SOURCE})[.!?]*$`,
  "iu",
);
const REVIEWED_FOREST_LOOKUP_TOPIC_SOURCE = String.raw`(?:fire\s+(?:danger|risk|index|forecast)|carbon\s+(?:storage|stock|sink|sequestration)|age\s+(?:distribution|structure|classes|profile)|cover\s+statistics|coverage\s+(?:percentage|statistics|map|trend)|area\s+(?:statistics|by\s+county)|health\s+(?:status|indicators|condition|assessment)|management\s+(?:guidance|practices|policy|plans|methods|authority|rules)|habitat\s+map|restoration\s+methods|ownership\s+statistics|species\s+diversity|water\s+quality|coverage|health)`;
const REVIEWED_FOREST_TOPIC_PERSON_RESIDUAL_PATTERN = new RegExp(
  String.raw`^(?:(?:find|show|search|lookup|look[\s-]+up|list|locate|name|tell\s+me)(?:\s+me)?(?:\s+the)?\s+)?(?:(?:public|county|state|national|municipal)\s+)?(?:forest|woodland)\s+${REVIEWED_FOREST_LOOKUP_TOPIC_SOURCE}(?<residual>[\s\p{Pd},;:]+[\s\S]+?)[.!?]*$`,
  "iu",
);
const REVIEWED_FOREST_TOPIC_PUBLIC_COMPLEMENT_PATTERN = /^(?:(?:in|for)\s+estonia|eestis|today|now|currently|this\s+year|(?:in|for)\s+(?:19|20)\d{2}|over\s+time|by\s+year|year[-\s]+by[-\s]+year)$/iu;

function hasReviewedForestTopicPersonResidual(value) {
  const match = String(value || "").trim().match(REVIEWED_FOREST_TOPIC_PERSON_RESIDUAL_PATTERN);
  if (!match) return false;
  const residual = String(match.groups?.residual || "")
    .replace(/^[\s\p{Pd},;:]+/gu, "")
    .replace(/[.!?]+$/gu, "")
    .trim();
  if (!residual || REVIEWED_FOREST_TOPIC_PUBLIC_COMPLEMENT_PATTERN.test(residual)) return false;
  return (residual.match(/\p{L}[\p{L}'’]{0,39}/gu) || []).length >= 2;
}
const EXPLICIT_PRIVATE_FOREST_ASSET_PATTERN = /^(?:metsamaa\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*)$/iu;
const ENGLISH_PRIVATE_FOREST_QUALIFIER_PATTERN = /^(?:property|parcel|plot|lot|estate|land|holding)$/iu;
const PUBLIC_FOREST_RELATION_TOKEN_PATTERN = /^(?:rahvusparg\w*|loodusparg\w*|maastikukaitseal\w*|looduskaitseal\w*|hoiual\w*|kaitseal\w*|riigi\w*|avalik\w*|munitsipaal\w*|mountains?|national|park|public|reserve|state|municipal|government|valley)$/iu;
const ESTONIAN_BELONGING_PARTICIPLE_PATTERN = /^kuuluv(?:a(?:s|st|le|lt|ga|ks|na|d|te(?:s|st|le|lt|ga)?)?|at|ad)?$/iu;
const ESTONIAN_BELONGS_VERB_PATTERN = /^kuulu(?:b|vad|nud|s|sid)$/iu;
const CADASTRE_PATTERN = /\b\d{5}:\d{3}:\d{4}\b/u;
const ESTONIAN_REGULATORY_CONSENT_SOURCE = String.raw`kelle\s+(?:(?:eelnev|eelneva|eelnevat|kirjalik|kirjaliku|kirjalikku|ametlik|ametliku|ametlikku)\s+)?(?:nousolek|nousoleku|nousolekut|kooskolastus|kooskolastuse|kooskolastust|heakskiit|heakskiidu|heakskiitu|luba|loa)`;
const ESTONIAN_REGULATORY_REQUIREMENT_SOURCE = String.raw`(?:(?:on\s+)?(?:vaja|vajalik|noutav)|tuleb\s+(?:taotleda|taotlema|saada|kusida)|peab\s+(?:taotlema|saama|kusima))`;
const ESTONIAN_REVIEWED_NATIONAL_PARK_NAME_SOURCE = String.raw`(?:lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse)`;
const ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE = String.raw`(?:kaitseala|kaitsealal|kaitsealale|kaitsealalt|looduskaitseala|looduskaitsealal|looduskaitsealale|looduskaitsealalt|maastikukaitseala|maastikukaitsealal|maastikukaitsealale|maastikukaitsealalt|(?:${ESTONIAN_REVIEWED_NATIONAL_PARK_NAME_SOURCE}\s+)?(?:rahvuspark|rahvuspargi|rahvuspargis|rahvusparki|rahvuspargil|rahvuspargile)|natura(?:\s+2000)?\s+(?:ala|alal|alale|alalt)|hoiuala|hoiualal|hoiualale|hoiualalt|pusielupaik|pusielupaigas|pusielupaika|pusielupaigal|pusielupaigale)`;
// This allowlist is intentionally token-exact. Prefix-open forms such as
// `van\w*` or `uu\w*` would also consume kinship terms (vanaema) and names
// (Uuno), incorrectly turning a private-asset lookup into a public question.
const ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_SOURCE = String.raw`(?:vana|vanas|uus|uue|uut|uues|uuel|puidust|kivist|betoonist|palkidest|uhe|kahe|kolme|nelja|viie|kuue|seitsme|kaheksa|uheksa|kumne|mitme|korrusega|korruselise|uhekorruseline|uhekorruselise|kahekorruseline|kahekorruselise|kolmekorruseline|kolmekorruselise|neljakorruseline|neljakorruselise|viiekorruseline|viiekorruselise|riigi|riiklik|riikliku|avalik|avaliku|munitsipaal|olemasolev|olemasoleva|kavandatav|kavandatava|planeeritav|planeeritava|renoveeritud|renoveeritav|renoveeritava|renoveeritavat|kaitstav|kaitstava|vaike|vaikese|vaikest|suur|suure|suurt|ajutine|ajutise|ajutist|pusiv|pusiva|pusivat|energiatohus|energiatohusa|kohalik|kohaliku|ajalooline|ajaloolise|ajaloolist|asutuse|riigiasutuse|munitsipaalasutuse|linnavalitsuse|vallavalitsuse|ameti|agentuuri|ministeeriumi|valitsuse|omavalitsuse|kooli|haigla|teenistuse|instituudi|linna|valla)`;
const ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE = String.raw`(?:${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_SOURCE}\s+){0,12}`;
const ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_PATTERN = new RegExp(
  String.raw`^${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_SOURCE}$`,
  "u",
);
const ESTONIAN_REGULATORY_BUILDING_TOKEN_SOURCE = String.raw`(?:eramaja|maja|abihoone|abihoonet|korterelamu|korterelamut|ridaelamu|ridaelamut|uksikelamu|uksikelamut|uhepereelamu|uhepereelamut|kahepereelamu|kahepereelamut|saun|sauna|saunamaja|suvemaja|puhkemaja|kulalistemaja|kogukonnamaja|moodulmaja|palkmaja|elementmaja|kasvuhoone|kasvuhoonet|tootmishoone|tootmishoonet|toostushoone|toostushoonet|arihoone|arihoonet|eluhoone|eluhoonet|laohoone|laohoonet|buroohoone|buroohoonet|korvalhoone|korvalhoonet|majandushoone|majandushoonet|spordihoone|spordihoonet|oppehoone|oppehoonet|koolihoone|koolihoonet|lasteaiahoone|lasteaiahoonet|haiglahoone|haiglahoonet|kultuurihoone|kultuurihoonet|farmihoone|farmihoonet|kortermaja|ridamaja|paarismaja|talumaja|aiamaja|elumaja|sotsiaalmaja|hoone|hoonet|elamu|elamut|eramu|eramut|suvila|suvilat|korter|korteri|korterit|talu|kuun|kuuni|laut|lauda|majake|majakese|majakest|suvemajake|suvemajakese|suvemajakest|moodulmajake|moodulmajakese|moodulmajakest|garaaz|garaazi|kuur|kuuri|ait|aida|varjualune|varjualuse|varjualust|ehitis|ehitise|ehitist|rajatis|rajatise|rajatist)`;
const ESTONIAN_REGULATORY_BUILDING_TOKEN_PATTERN = new RegExp(
  String.raw`(?:^|\s)${ESTONIAN_REGULATORY_BUILDING_TOKEN_SOURCE}(?=\s|$)`,
  "u",
);
const ESTONIAN_REGULATORY_BUILDING_EXACT_TOKEN_PATTERN = new RegExp(
  String.raw`^${ESTONIAN_REGULATORY_BUILDING_TOKEN_SOURCE}$`,
  "u",
);
// Unknown compounds are private-asset context but never cross the public
// exception. This closes the whole `...maja`/`...hoone`/`...elamu` class
// without admitting an arbitrary person-name prefix into the safe grammar.
const ESTONIAN_COMPOUND_BUILDING_ASSET_PATTERN = /(?<!\p{L})(?:[\p{L}-]{1,40})?(?:maja(?:s|st|le|lt|ga|ks|ni|d|de|des|dest|dele|delt|dega)?|hoone(?:t|s|st|le|lt|ga|ks|ni|d|te|tes|test|tele|telt|tega)?|elamu(?:t|s|st|le|lt|ga|ks|ni|d|te|tes|test|tele|telt|tega)?)(?!\p{L})/iu;
const ESTONIAN_PRIVATE_DWELLING_TOKEN_PATTERN = /(?<!\p{L})(?:(?:[\p{L}-]{1,40})?(?:majake|majakese|majakest|majakeses|majakesse|majakesele|hooneke|hoonekese|hoonekest|hoonekeses|hoonekesesse|hoonekesele|elamuke|elamukese|elamukest|elamukeses|elamukesse|elamukesele)|korter(?:i|it|is|isse|ist|ile|ilt|iga|iks|id|ite|ites|itest|itele|itelt|itega)?)(?!\p{L})/iu;
const ESTONIAN_GENERIC_BUILDING_SOURCE = ESTONIAN_REGULATORY_BUILDING_TOKEN_SOURCE;
const ESTONIAN_BUILDING_ACTIVITY_SOURCE = String.raw`(?:ehitada|ehitamiseks|ehitamine|ehitamise|rajada|rajamiseks|rajamine|rajamise|planeerida|planeerimiseks|planeerimine|planeerimise|pustitada|pustitamiseks|pustitamine|pustitamise|renoveerida|renoveerimiseks|renoveerimine|renoveerimise|rekonstrueerida|rekonstrueerimiseks|rekonstrueerimine|rekonstrueerimise)`;
const ESTONIAN_BUILDING_ACTIVITY_TOKEN_PATTERN = new RegExp(
  String.raw`^${ESTONIAN_BUILDING_ACTIVITY_SOURCE}$`,
  "u",
);
const ESTONIAN_BUILDING_ACTIVITY_IN_TEXT_PATTERN = new RegExp(
  String.raw`(?:^|\s)${ESTONIAN_BUILDING_ACTIVITY_SOURCE}(?=\s|$)`,
  "u",
);
const ESTONIAN_REGULATORY_CONSENT_IN_TEXT_PATTERN = new RegExp(
  String.raw`(?:^|\s)${ESTONIAN_REGULATORY_CONSENT_SOURCE}(?=\s|$)`,
  "u",
);
const ESTONIAN_PROTECTED_BUILDING_LOCATION_IN_TEXT_PATTERN = new RegExp(
  String.raw`(?:^|\s)${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}(?=\s|$)`,
  "u",
);
const ESTONIAN_PROTECTED_BUILDING_LOCATION_TOKEN_PATTERN = /^(?:kaitseala|kaitsealal|kaitsealale|kaitsealalt|looduskaitseala|looduskaitsealal|looduskaitsealale|looduskaitsealalt|maastikukaitseala|maastikukaitsealal|maastikukaitsealale|maastikukaitsealalt|rahvuspark|rahvuspargi|rahvuspargis|rahvusparki|rahvuspargil|rahvuspargile|natura|ala|alal|alale|alalt|hoiuala|hoiualal|hoiualale|hoiualalt|pusielupaik|pusielupaigas|pusielupaika|pusielupaigal|pusielupaigale)$/u;
const ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_SOURCE = String.raw`(?:minu|meie(?:\s+pere)?|oma|tema|nende|naabri|sobra|sopra|perekonna|pereliikme|vanaema|vanaisa|vanavanema|vanatadi|tadi|onu|ema|isa|oe|venna|abikaasa|elukaaslase|lapse|tutre|poja|sugulase|kolleegi|selle\s+(?:(?:konkreetse|nimetatud)\s+)?inimese)`;
const ESTONIAN_REGULATORY_OBJECT_TOKEN_SOURCE = String.raw`[a-z][a-z-]{1,39}`;
const ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_PATTERNS = Object.freeze([
  new RegExp(
    String.raw`(?:^|\s)${ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_SOURCE}\s+(?:${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_SOURCE}\s+){0,4}${ESTONIAN_REGULATORY_OBJECT_TOKEN_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}(?=\s|$)`,
    "u",
  ),
  new RegExp(
    String.raw`(?:^|\s)${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+${ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_SOURCE}\s+(?:${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_SOURCE}\s+){0,4}${ESTONIAN_REGULATORY_OBJECT_TOKEN_SOURCE}(?=\s|$)`,
    "u",
  ),
]);
const ESTONIAN_REGULATORY_POLITE_PREFIX_SOURCE = String.raw`(?:palun(?:\s+(?:oelge|selgitage))?\s+)?`;
const ESTONIAN_REVIEWED_GENERIC_REGULATORY_CONSENT_PATTERNS = Object.freeze([
  new RegExp(
    String.raw`^kas\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+(?:voib|tohib|saab)\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+(?:(?:ja|ning)\s+)?${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^kas\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+(?:voib|tohib|saab)\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+(?:(?:ja|ning)\s+)?${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^${ESTONIAN_REGULATORY_POLITE_PREFIX_SOURCE}${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}\s+(?:et\s+)?${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^${ESTONIAN_REGULATORY_POLITE_PREFIX_SOURCE}${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}\s+(?:et\s+)?${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^${ESTONIAN_REGULATORY_POLITE_PREFIX_SOURCE}${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+(?:on\s+)?${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+(?:(?:ja|ning)\s+)?${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
  new RegExp(
    String.raw`^${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+(?:(?:ja|ning)\s+)?${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
]);
const ESTONIAN_REVIEWED_INSTITUTIONAL_REGULATORY_CONSENT_PATTERNS = Object.freeze([
  // A known public institution's building can be the grammatical possessor
  // even when the construction verb is implicit ("RMK maja rahvuspargis:
  // kelle luba on vaja?"). This form is considered only after an exact public
  // organization span has been removed, so a person's surname cannot occupy
  // the same slot.
  new RegExp(
    String.raw`^${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_REGULATORY_CONSENT_SOURCE}\s+${ESTONIAN_REGULATORY_REQUIREMENT_SOURCE}$`,
    "u",
  ),
]);

function hasLossyUnicodeLetterOrNumber(value) {
  const compatibilityText = String(value || "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "");
  return [...compatibilityText].some((character) => (
    /[\p{L}\p{N}]/u.test(character) && !/[A-Za-z0-9]/u.test(character)
  ));
}

function hasLossyUnicodeProtectedConstructionResidual(value) {
  const canonicalText = canonicalSecurityText(value);
  if (!hasLossyUnicodeLetterOrNumber(canonicalText)) return false;
  const normalizedText = normalize(canonicalText);
  return ESTONIAN_PROTECTED_BUILDING_LOCATION_IN_TEXT_PATTERN.test(normalizedText)
    && (
      ESTONIAN_BUILDING_ACTIVITY_IN_TEXT_PATTERN.test(normalizedText)
      || ESTONIAN_REGULATORY_CONSENT_IN_TEXT_PATTERN.test(normalizedText)
    )
    && (
      ESTONIAN_REGULATORY_BUILDING_TOKEN_PATTERN.test(normalizedText)
      || ESTONIAN_COMPOUND_BUILDING_ASSET_PATTERN.test(canonicalText)
    );
}

export function isReviewedGenericProtectedAreaConsentQuery(value) {
  const canonicalText = canonicalSecurityText(value);
  const withoutReviewedMunicipality = removeFirstReviewedMunicipalityOrganizationName(canonicalText);
  const withoutExactPublicOrganization = PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS.reduce(
    (remaining, pattern) => remaining.replace(pattern, " "),
    withoutReviewedMunicipality,
  );
  const matchesGenericGrammar = [canonicalText, withoutExactPublicOrganization].some((candidate) => {
    if (hasLossyUnicodeLetterOrNumber(candidate)) return false;
    const normalizedQuery = normalize(candidate);
    return ESTONIAN_REVIEWED_GENERIC_REGULATORY_CONSENT_PATTERNS
      .some((pattern) => pattern.test(normalizedQuery));
  });
  if (matchesGenericGrammar) return true;
  const removedExactPublicOrganization = normalize(withoutExactPublicOrganization)
    !== normalize(withoutReviewedMunicipality);
  return removedExactPublicOrganization
    && !hasLossyUnicodeLetterOrNumber(withoutExactPublicOrganization)
    && ESTONIAN_REVIEWED_INSTITUTIONAL_REGULATORY_CONSENT_PATTERNS.some(
      (pattern) => pattern.test(normalize(withoutExactPublicOrganization)),
    );
}

const REVIEWED_PROTECTED_BUILDING_CONTACT_ORGANIZATION_PATTERNS = Object.freeze([
  /\b(?:eesti\s+)?keskkonnaamet(?:i(?:ga|le|lt|l|s|st)?)?\b/giu,
  /\b(?:euroopa\s+)?keskkonnaagentuur(?:i(?:ga|le|lt|l|s|st)?)?\b/giu,
  /\bkliimaministeerium(?:i(?:ga|le|lt|l|s|st)?)?\b/giu,
  /\briigimetsa\s+majandamise\s+keskus(?:e(?:ga|le|lt|l|s|st)?)?\b/giu,
  /\b(?:estonian\s+)?environment(?:al)?\s+board\b/giu,
  /\b(?:rmk|kik)\b/giu,
]);

export function isReviewedPublicOrganizationProtectedBuildingContactQuery(value) {
  const canonicalText = canonicalSecurityText(value);
  const withoutPublicOrganization = REVIEWED_PROTECTED_BUILDING_CONTACT_ORGANIZATION_PATTERNS.reduce(
    (remaining, pattern) => remaining.replace(pattern, " "),
    canonicalText,
  );
  const removedReviewedPublicOrganization = normalize(withoutPublicOrganization)
    !== normalize(canonicalText);
  const rawResidual = withoutPublicOrganization.trim();
  if (hasLossyUnicodeLetterOrNumber(rawResidual)) return false;
  // Normalization intentionally removes punctuation and case, so inspect the
  // raw residual first. Quoted or title-cased words immediately attached to a
  // building may be a private name (for example `"Vana" maja`) and must reach
  // the conservative person/asset classifier instead of this public exception.
  const rawContactTokens = rawResidual.match(/[\p{L}]+(?:[-/'’][\p{L}]+)*/gu) || [];
  const rawActivityIndex = rawContactTokens.findIndex((token) => (
    ESTONIAN_BUILDING_ACTIVITY_TOKEN_PATTERN.test(normalize(token))
  ));
  const rawLocationIndex = rawContactTokens.findLastIndex((token, index) => (
    index < rawActivityIndex
      && ESTONIAN_PROTECTED_BUILDING_LOCATION_TOKEN_PATTERN.test(normalize(token))
  ));
  const rawConstructionObjectTokens = rawActivityIndex > rawLocationIndex
    ? rawContactTokens.slice(rawLocationIndex + 1, rawActivityIndex)
    : [];
  if (/["“„«'‘”»’]/u.test(rawResidual)
    || rawConstructionObjectTokens.some((token) => /\p{Lu}/u.test(token))) return false;
  const normalizedResidual = normalize(withoutPublicOrganization);
  const publicContactSource = String.raw`(?:(?:avalik|ametlik|uldine)\s+)?(?:kontakt|uldkontakt|telefon|uldtelefon|e\s+post|postiaadress)`;
  const reviewedEstonianContact = new RegExp(
    String.raw`^${publicContactSource}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+(?:${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+)?${ESTONIAN_BUILDING_ACTIVITY_SOURCE}(?:\s+(?:loa|nousoleku|kooskolastuse))?\s+kohta$`,
    "u",
  ).test(normalizedResidual) || new RegExp(
    String.raw`^${publicContactSource}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+(?:${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+)?${ESTONIAN_BUILDING_ACTIVITY_SOURCE}(?:\s+(?:loa|nousoleku|kooskolastuse))?$`,
    "u",
  ).test(normalizedResidual) || new RegExp(
    String.raw`^kuidas\s+(?:votta\s+uhendust|kontakteeruda)\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}$`,
    "u",
  ).test(normalizedResidual);
  if (removedReviewedPublicOrganization && reviewedEstonianContact) return true;

  const estonianNamedNationalPark = String.raw`${ESTONIAN_REVIEWED_NATIONAL_PARK_NAME_SOURCE}\s+rahvuspargi`;
  const estonianBuildingActivityNoun = String.raw`(?:ehitamise|rajamise|renoveerimise|rekonstrueerimise)`;
  const explicitEstonianContact = String.raw`(?:(?:avalik|ametlik|uldine)\s+)(?:kontakt|uldkontakt|telefon|uldtelefon|e\s+post)`;
  if ([
    new RegExp(
      String.raw`^${estonianNamedNationalPark}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${estonianBuildingActivityNoun}\s+${explicitEstonianContact}$`,
      "u",
    ),
    new RegExp(
      String.raw`^kust\s+(?:leida|leian)\s+${explicitEstonianContact}\s+${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}$`,
      "u",
    ),
  ].some((pattern) => pattern.test(normalizedResidual))) return true;

  // English organization-contact questions use a different word order from
  // the established Estonian service form. Keep this exception full-query
  // anchored and limited to reviewed protected-place names, a generic
  // building object and a construction activity. Appended people, properties
  // or contact fields therefore cannot be consumed by the public grammar.
  const englishProtectedPlace = String.raw`(?:lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse)\s+(?:national|nature)\s+park`;
  const englishBuildingActivity = String.raw`(?:renovat(?:e|ing)\s+(?:a|the)\s+(?:building|house|structure)|renovation\s+(?:of\s+)?(?:a|the)\s+(?:building|house|structure)|reconstruct(?:ing)?\s+(?:a|the)\s+(?:building|house|structure)|reconstruction\s+(?:of\s+)?(?:a|the)\s+(?:building|house|structure)|construct(?:ing)?\s+(?:a|the)\s+(?:building|house|structure)|construction\s+of\s+(?:a|the)\s+(?:building|house|structure))`;
  const englishBuildingActivityNoun = String.raw`(?:(?:building|house|structure)\s+)?(?:renovation|reconstruction|construction)`;
  const englishContactPrompt = String.raw`how\s+(?:do|can|should)\s+i\s+(?:contact|reach)(?:\s+the)?\s+(?:about|regarding|concerning|for)`;
  const englishContactChannel = String.raw`(?:(?:official|public|general)\s+)?(?:contact|email|phone|telephone)`;
  const explicitEnglishContactChannel = String.raw`(?:official|public|general)\s+(?:contact|email|phone|telephone)`;
  const reviewedOrganizationEnglishPatterns = [
    new RegExp(
      String.raw`^${englishProtectedPlace}\s+${englishContactPrompt}\s+${englishBuildingActivity}$`,
      "u",
    ),
    new RegExp(
      String.raw`^${englishContactPrompt}\s+${englishBuildingActivity}\s+(?:in|at|within)\s+(?:the\s+)?${englishProtectedPlace}$`,
      "u",
    ),
    new RegExp(
      String.raw`^(?:what\s+is\s+(?:the\s+)?)?${englishContactChannel}\s+(?:for|about|regarding|concerning)\s+(?:${englishBuildingActivity}|${englishBuildingActivityNoun})\s+(?:in|at|within)\s+(?:the\s+)?${englishProtectedPlace}$`,
      "u",
    ),
    new RegExp(
      String.raw`^${englishContactChannel}\s+(?:for|about|regarding|concerning)\s+(?:${englishBuildingActivity}|${englishBuildingActivityNoun})\s+(?:in|at|within)\s+(?:the\s+)?${englishProtectedPlace}$`,
      "u",
    ),
  ];
  if (removedReviewedPublicOrganization
    && reviewedOrganizationEnglishPatterns.some((pattern) => pattern.test(normalizedResidual))) return true;
  return [
    new RegExp(
      String.raw`^${englishProtectedPlace}\s+${englishBuildingActivityNoun}\s+${englishContactChannel}$`,
      "u",
    ),
    new RegExp(
      String.raw`^${explicitEnglishContactChannel}\s+(?:for|about|regarding|concerning)\s+${englishBuildingActivityNoun}\s+(?:in|at|within)\s+(?:the\s+)?${englishProtectedPlace}$`,
      "u",
    ),
  ].some((pattern) => pattern.test(normalizedResidual));
}
export const MAX_PUBLIC_SEARCH_QUERY_LENGTH = 180;
const MAX_PUBLIC_SEARCH_RAW_INPUT_LENGTH = 4_096;

function securityCodePoint(raw, radix, fallback) {
  const codePoint = Number.parseInt(raw, radix);
  if (!Number.isInteger(codePoint)
    || codePoint < 0
    || codePoint > 0x10ffff
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return fallback;
  return String.fromCodePoint(codePoint);
}

function decodeSecurityEscapes(value) {
  let text = String(value || "");
  // Decode only bounded, syntactically complete representations that a
  // browser or another downstream component could interpret differently.
  // Three passes cover nested percent/entity forms while every transform is
  // length-reducing, so this cannot become an expansion loop.
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text
      .replace(/(?:%[0-9a-f]{2})+/giu, (match) => {
        try {
          return decodeURIComponent(match);
        } catch {
          return match;
        }
      })
      .replace(/&#x([0-9a-f]{1,6});?/giu, (match, raw) => securityCodePoint(raw, 16, match))
      .replace(/&#([0-9]{1,7});?/gu, (match, raw) => securityCodePoint(raw, 10, match))
      .replace(/&(amp|apos|bsol|colon|gt|hyphen|lowbar|lt|nbsp|period|quot|sol);/giu, (_match, name) => ({
        amp: "&",
        apos: "'",
        bsol: "\\",
        colon: ":",
        gt: ">",
        hyphen: "-",
        lowbar: "_",
        lt: "<",
        nbsp: " ",
        period: ".",
        quot: "\"",
        sol: "/",
      })[name.toLocaleLowerCase("en")])
      .replace(/\\u\{([0-9a-f]{1,6})\}/giu, (match, raw) => securityCodePoint(raw, 16, match))
      .replace(/\\u([0-9a-f]{4})/giu, (match, raw) => securityCodePoint(raw, 16, match))
      .replace(/\\x([0-9a-f]{2})/giu, (match, raw) => securityCodePoint(raw, 16, match));
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

const SECURITY_KEYWORD_SEPARATOR = "[\\p{P}\\p{S}\\p{Z}\\p{C}\\p{M}_]*";
const SECURITY_CANONICAL_KEYWORDS = [
  "kontakt", "telefon", "aadress", "adress", "meil", "sideandmed", "postkast",
  "postiaadress", "postal",
  "isikuandmed", "isikukood", "sunniaeg", "sunniaja", "sunniajaga", "sunniajast",
  "sunniajale", "sunniajata", "sunniaasta", "sunnikoht", "sunnikuupaev",
  "terviseandmed", "biomeetria", "ssn", "birthdate", "birthday", "personal", "social",
  "security", "identification", "passport", "information", "data", "date", "birth",
  "national", "number", "id",
  "koduaadress", "kodutanav", "elukoht", "elukoha", "elukohta", "elukohast", "elukohale", "kodukoht", "erakodu", "asukoht", "asupaik",
  "koordinaat", "viibimiskoht", "viibib", "oobib", "paikneb", "elab", "asub",
  "valduses", "valdavad", "valdaja", "valdab", "valdas", "valdama",
  "omab", "omavad", "omas", "omasid", "omanud", "omama", "omatakse", "omatud",
  "omaja", "omandis", "omanduses",
  "mets", "metsa", "metsamaa", "metsaeraldis", "metsakinnistu", "metsatukk", "puistu",
  "kuulub", "kuuluvad", "kuulus", "kuulusid", "kuulunud", "kuuluv", "kuuluva", "kuuluvat", "kuuluvast",
  "forest", "woodland", "leia", "otsi", "naita", "kuva", "show", "find", "display",
  "contact", "phone", "telephone", "address", "email", "residence", "resident",
  "occupant", "inhabitant", "inhabits", "inhabit", "landowner", "landholder", "landlord",
  "homeowner", "proprietor", "tenant", "owner", "ownership", "owns",
  "associated", "connected", "registered", "recorded", "listed", "belongs", "linked",
  "located", "locate", "disclose", "cadastral", "property", "parcel",
  "borehole", "plot", "residing", "resides", "reside", "staying", "stays", "stay",
  "renting", "rents", "rent", "leasing", "leases", "lease", "lives", "live",
];
const SECURITY_OBFUSCATED_KEYWORD_PATTERN = new RegExp(
  `(?<!\\p{L})(?:${SECURITY_CANONICAL_KEYWORDS
    .map((keyword) => [...keyword].join(SECURITY_KEYWORD_SEPARATOR))
    .join("|")})(?!\\p{L})`,
  "giu",
);
// V8 compiles these large Unicode expressions lazily. Warm them while the
// module is loading so the first anonymous request does not pay that CPU cost
// on the shared event loop.
"kontakt".replace(SECURITY_OBFUSCATED_KEYWORD_PATTERN, "kontakt");
SECURITY_OBFUSCATED_KEYWORD_PATTERN.lastIndex = 0;

function canonicalSecurityText(value) {
  let text = decodeSecurityEscapes(value)
    // Canonicalize the bounded apostrophe/prime lookalikes that are routinely
    // accepted in natural-language input. Possessive privacy checks must not
    // see weaker syntax than downstream discovery or model construction.
    .replace(/[\u0060\u00B4\u02B9\u02BB\u02BC\u2018\u2019\u201B\u2032\u2035]/gu, "'")
    // Retrieval and corpus search both apply NFKC. Fold compatibility forms
    // here first so the privacy decision cannot see weaker semantics than a
    // downstream search sink; NFD then exposes inserted marks to the bounded
    // keyword canonicalizer below.
    .normalize("NFKC")
    .normalize("NFD")
    // Treat Unicode dash punctuation like the ASCII hyphen used by reviewed
    // compound-word grammars. This keeps public queries consistent while the
    // same canonical form still reaches every privacy classifier.
    .replace(/\p{Pd}/gu, "-")
    // Preserve line and tab controls as visible clause boundaries. Deleting
    // them would fuse otherwise separate tokens ("ownership\nJohn") before
    // the named-private-asset detector has a chance to fail closed.
    .replace(/[\t\n\v\f\r\u0085\u2028\u2029]+/gu, " ; ")
    // Other invisible/default-ignorable controls can also occupy a token
    // boundary. Preserve that boundary instead of deleting the character and
    // fusing a surname to a reviewed geography (for example Kase<ZWSP>Ida).
    .replace(/[\p{Default_Ignorable_Code_Point}\p{Cc}]+/gu, " ")
    .replace(/[аɑα]/giu, "a")
    .replace(/[еε]/giu, "e")
    .replace(/[оο]/giu, "o")
    .replace(/[рρ]/giu, "p")
    .replace(/[сϲ]/giu, "c")
    .replace(/[хχ]/giu, "x")
    .replace(/[іι]/giu, "i")
    .replace(/[јϳ]/giu, "j")
    .replace(/[кκϰ]/giu, "k")
    .replace(/[тτ]/giu, "t")
    .replace(/[ԁ]/giu, "d")
    .replace(/[օ]/giu, "o");
  text = text.replace(
    SECURITY_OBFUSCATED_KEYWORD_PATTERN,
    // Remove obfuscating separators without discarding capitalization. Case
    // carries useful person-name evidence; every security matcher is already
    // Unicode case-insensitive where appropriate.
    (match) => match.replace(/[^\p{L}\p{N}]/gu, ""),
  );
  return text.normalize("NFC");
}

export function canonicalizePublicSearchQuery(value, {
  maximumLength = MAX_PUBLIC_SEARCH_QUERY_LENGTH,
} = {}) {
  const boundedMaximum = Math.max(1, Math.min(
    Math.trunc(Number(maximumLength) || MAX_PUBLIC_SEARCH_QUERY_LENGTH),
    2_000,
  ));
  const rawValue = typeof value === "string" ? value : String(value || "");
  // Security folding intentionally performs several Unicode and bounded
  // decoding passes. Cap its input first so an anonymous request cannot spend
  // event-loop time normalizing the full HTTP body before the public query
  // length contract is enforced. The multiplier still admits ordinary NFD and
  // compatibility forms; deeply encoded input fails closed.
  const rawMaximum = Math.min(
    MAX_PUBLIC_SEARCH_RAW_INPUT_LENGTH,
    Math.max(boundedMaximum + 128, boundedMaximum * 4),
  );
  if (rawValue.length > rawMaximum) {
    return { ok: false, query: "", reason: "input-too-long", maximumLength: boundedMaximum };
  }
  const query = canonicalSecurityText(rawValue).replace(/\s+/gu, " ").trim();
  if (!query) return { ok: false, query: "", reason: "empty", maximumLength: boundedMaximum };
  if (query.length > boundedMaximum) {
    return { ok: false, query: "", reason: "too-long", maximumLength: boundedMaximum };
  }
  return { ok: true, query, reason: null, maximumLength: boundedMaximum };
}

export function containsUnsafeInstruction(value) {
  const text = canonicalSecurityText(value);
  return PROMPT_OR_SECRET_PATTERN.test(text)
    || PRIVILEGED_ROLE_INSTRUCTION_PATTERN.test(text)
    || ENGLISH_HIDDEN_INSTRUCTION_REQUEST_PATTERN.test(text)
    || ENGLISH_SECRET_REQUEST_PATTERN.test(text)
    || ESTONIAN_HIDDEN_INSTRUCTION_REQUEST_PATTERN.test(text)
    || EXECUTABLE_MARKUP_PATTERN.test(text);
}

const REVIEWED_MUNICIPALITY_INSTITUTIONAL_CONTACT_PATTERNS = Object.freeze([
  /^(?:(?:city|municipal|local)\s+government\s+of\s+[\p{L}'’-]{2,50}|municipality\s+of\s+[\p{L}'’-]{2,50}|[\p{L}'’-]{2,50}\s+(?:(?:city|municipal|local)\s+government|municipality))\s+(?:(?:environment(?:al)?|forest(?:ry)?|nature|climate|water|waste|biodiversity|green\s+infrastructure)\s+)?(?:office|department|service|unit)\s+(?:general\s+)?(?:contact|phone|telephone|email|mailbox)\??$/iu,
  /^[\p{L}'’-]{2,50}\s+(?:city|municipal)\s+(?:(?:environment(?:al)?|forest(?:ry)?|nature(?:\s+(?:protection|conservation))?|climate|water|waste|biodiversity|green\s+infrastructure)(?:\s+(?:monitoring|adaptation|planning|policy|information|statistics|data))?\s+)?(?:office|department|service|unit)\s+(?:(?:general|public|official)\s+)?(?:contact|phone|telephone|email|mailbox|address)\??$/iu,
]);

const BENIGN_REGULATORY_CONTEXT_NAME_SOURCE = String.raw`(?:\p{Lu}[\p{Ll}'’-]{1,39}\s+\p{Lu}[\p{Ll}'’-]{1,39}|\p{Lu}[\p{Lu}'’-]{1,39}\s+\p{Lu}[\p{Lu}'’-]{1,39}|\p{Lu}\.\s*(?:\p{Lu}[\p{Ll}'’-]{1,39}|\p{Lu}[\p{Lu}'’-]{1,39}))`;
const BENIGN_REGULATORY_ATTRIBUTION_SOURCE = String.raw`(?:küsib|küsis|palub|palus|annab|andis|kirjutas|koostas|avaldas|tutvustas|toimetas|selgitas|esitas|jagas|kommenteeris|kirjeldas)\s+(?:(?:üldist|avaliku|üldise)\s+)?(?:nõu|juhendi|selgituse|ülevaate|artikli|küsimuse)`;
const BENIGN_NAMED_REGULATORY_CONTEXT_PATTERNS = Object.freeze([
  new RegExp(String.raw`^${BENIGN_REGULATORY_CONTEXT_NAME_SOURCE}\s+${BENIGN_REGULATORY_ATTRIBUTION_SOURCE}$`, "u"),
  new RegExp(String.raw`^(?:uuringu\s+autor|projekti\s+tutvustas|küsimuse\s+esitas)\s+${BENIGN_REGULATORY_CONTEXT_NAME_SOURCE}$`, "u"),
]);

function isBenignNaturalPersonAttributionClause(value) {
  const clause = String(value || "").trim();
  if (!BENIGN_NAMED_REGULATORY_CONTEXT_PATTERNS.some((pattern) => pattern.test(clause))) {
    return false;
  }
  // The same title-case shape can name a public organization (for example
  // “Eesti Energia” or “Environment Board”). Such an organization is part of
  // the user's information need and must not be treated as disposable person
  // attribution.
  return normalize(removeFirstPublicOrganizationName(clause)) === normalize(clause);
}

function isReviewedBenignProtectedAreaAdviceTail(value) {
  const tail = String(value || "").trim();
  if (!tail || /["“„«'‘”»’]/u.test(tail)) return false;
  const hasRawIdentitySignal = [...tail.matchAll(/\p{Lu}[\p{Ll}'’-]{1,39}/gu)]
    .some((match) => {
      const token = normalize(match[0]);
      const protectedPlacePrefix = normalize(tail.slice(0, match.index));
      const beginsReviewedQuestion = match.index === 0
        && /^(?:kas|kelle|palun)$/u.test(token);
      const beginsProtectedPlacePhrase = /^(?:lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse|natura)$/u.test(token)
        && /^(?:kas)?$/u.test(protectedPlacePrefix);
      return !(
        beginsReviewedQuestion
        || beginsProtectedPlacePhrase
        || PUBLIC_ORGANIZATION_PATTERN.test(match[0])
      );
    });
  if (hasRawIdentitySignal) return false;
  return isReviewedGenericProtectedAreaConsentQuery(tail)
    || new RegExp(
      String.raw`^${ESTONIAN_PROTECTED_BUILDING_LOCATION_SOURCE}\s+${ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_SOURCE}${ESTONIAN_GENERIC_BUILDING_SOURCE}\s+${ESTONIAN_BUILDING_ACTIVITY_SOURCE}\s+kohta$`,
      "u",
    ).test(normalize(tail));
}

function reviewedMunicipalityInstitutionalContactScope(value) {
  const text = canonicalSecurityText(value).trim();
  if (!REVIEWED_MUNICIPALITY_INSTITUTIONAL_CONTACT_PATTERNS.some(
    (pattern) => pattern.test(text),
  )) return null;
  // Contact wording can use the natural English form “Narva municipal …”
  // without spelling out “city government”. The forestry scope resolver is
  // the reviewed bare-locality catalogue and preserves city/vald ambiguity.
  return reviewedEstonianForestryMunicipalityScope(text);
}

function isReviewedPublicOrganizationProtectedPlaceContactQuery(value) {
  const text = canonicalSecurityText(value).trim();
  const withoutPublicOrganization = removeFirstPublicOrganizationName(text).trim();
  if (normalize(withoutPublicOrganization) === normalize(text)
    || CADASTRE_PATTERN.test(text)
    || PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    || PRIVATE_POSTAL_FIELD_PATTERN.test(text)
    || /(?:'s|’s)\s+(?:contact|phone|telephone|email|address|property|parcel|land)\b/iu.test(withoutPublicOrganization)) return false;
  const protectedPlace = String.raw`(?:lahemaa|vilsandi|matsalu|soomaa|karula|alutaguse)`;
  return new RegExp(
    String.raw`^(?:(?:official|public|general)\s+)?contact(?:\s+(?:channel|details|information|point))?\s+(?:for|about|regarding|concerning)\s+(?:the\s+)?${protectedPlace}(?:\s+(?:national\s+park|nature\s+park|rahvuspark|looduspark))?$`,
    "u",
  ).test(normalize(withoutPublicOrganization));
}

function privacyLanguageFold(value) {
  return String(value || "")
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[’‘`´]/gu, "'")
    .replace(/\s+/gu, " ")
    .normalize("NFC")
    .trim();
}

const FOREIGN_PRIVATE_RELATION_PATTERN = new RegExp([
  // Spanish, Portuguese, French, Italian, German, Dutch and Nordic forms.
  String.raw`\b(?:donde\s+)?(?:vive|reside|habita)\b|\b(?:direccion|domicilio)(?:\s+(?:de|particular))?\b|\b(?:posee|propietari[oa]|duen[oa])\b` ,
  String.raw`\b(?:onde\s+)?(?:mora|vive|reside)\b|\benderec[oa](?:\s+(?:de|residencial))?\b|\b(?:possui|proprietari[oa])\b` ,
  String.raw`\b(?:ou\s+)?(?:habite|vit|reside)\b|\b(?:adresse|domicile)(?:\s+(?:de|personnelle?|personnel))?\b|\b(?:possede|proprietaire|appartient\s+a)\b` ,
  String.raw`\b(?:dove\s+)?(?:vive|abita|risiede)\b|\bindirizzo(?:\s+(?:di|privato))?\b|\b(?:possiede|proprietari[oa])\b` ,
  String.raw`\b(?:wo\s+)?(?:wohnt|lebt)\b|\b(?:wohn(?:ort|adresse)|adresse(?:\s+von)?)\b|\b(?:besitzt|eigentumer|gehort\s+zu)\b` ,
  String.raw`\b(?:waar\s+)?(?:woont|leeft)\b|\b(?:woonadres|adres(?:\s+van)?)\b|\b(?:bezit|eigenaar)\b` ,
  String.raw`\b(?:var\s+)?bor\b|\b(?:bostadsadress|adress(?:\s+till)?)\b|\b(?:ager|agare)\b` ,
  String.raw`\b(?:hvor\s+bor|bopel|adresse\s+til|(?:eier|ej er|ejer)\b)` ,
  // Finnish, Polish and the Baltic languages.
  String.raw`\b(?:missa\s+)?(?:asuu|oleskelee)\b|\b(?:kotiosoite|osoite(?:\s+henkilolle)?)\b|\b(?:omistaa|omistaja)\b` ,
  String.raw`\b(?:gdzie\s+)?mieszka\b|\b(?:adres(?:\s+zamieszkania)?)\b|\b(?:posiada|wlasciciel|nalezy\s+do)\b` ,
  String.raw`\b(?:kur\s+dzivo|dzivesvietas\s+adrese|(?:pieder|ipasnieks)\b)` ,
  String.raw`\b(?:kur\s+gyvena|gyvenamosios\s+vietos\s+adresas|(?:priklauso|savininkas)\b)` ,
  // Cyrillic residence, address and ownership constructions.
  String.raw`(?:где\s+(?:живет|живёт|проживает)|место\s+жительства|домашн(?:ий|его)\s+адрес|адрес|(?:владеет|собственник|принадлежит))` ,
  // CJK, Korean and Arabic scripts do not expose reliable title case, so the
  // private relation itself is sufficient at this unsupported-language edge.
  String.raw`(?:住在?哪里|住在哪|居住地|家庭住址|地址是什么|谁拥有|所有者|的(?:家|自宅|住所|住居))` ,
  String.raw`(?:どこに住|どこで暮ら|住所|居住地|誰が所有|所有者|の(?:家|自宅|住所|住居))` ,
  String.raw`(?:어디에\s*사|어디서\s*사|거주지|집\s*주소|주소(?:가\s*어디)?|누가\s*소유|소유자|의\s*(?:집|자택|주소|거주지))` ,
  String.raw`(?:اين\s+(?:يسكن|يعيش)|عنوان(?:\s+(?:المنزل|السكن|[\p{Script=Arabic}]{2,40}))?|محل\s+الاقامة|(?:منزل|بيت|دار|مسكن)\s+[\p{Script=Arabic}]{2,40}|(?:يملك|مالك))` ,
].join("|"), "iu");

const FOREIGN_SCRIPT_PATTERN = /[\p{Script=Arabic}\p{Script=Armenian}\p{Script=Bengali}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Georgian}\p{Script=Greek}\p{Script=Han}\p{Script=Hangul}\p{Script=Hebrew}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
const UNREVIEWED_PERSON_NAME_PAIR_PATTERN = /(?<![\p{L}\p{N}])(?:\p{Lu}[\p{Ll}\p{M}'’-]{1,39}|\p{Lu}{2,}[\p{Lu}\p{M}'’-]{1,39})[\s,]+(?:\p{Lu}[\p{Ll}\p{M}'’-]{1,39}|\p{Lu}{2,}[\p{Lu}\p{M}'’-]{1,39})(?![\p{L}\p{N}])/u;

function splitPublicQueryClauses(value) {
  return String(value || "")
    .split(/(?<!\b\p{Lu})\.+|[!?;,¿¡。！？；،]+|\s[-—–−]\s/gu)
    .flatMap((clause) => clause.split(
      /\s+(?:ja|ning|and)\s+(?=(?:(?:mis|millin\w*)\s+on|(?:what|where|which)\s+(?:is|are))\b[\s\S]{0,100}(?:kontakt\w*|contact\w*|telefon\w*|phone\w*|e-?post\w*|email\w*|aadress\w*|address\w*))/giu,
    ))
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function isReviewedPublicOrganizationContactClause(value) {
  const clause = String(value || "").trim();
  const withoutOrganization = removeFirstPublicOrganizationName(clause).trim();
  if (!clause || normalize(withoutOrganization) === normalize(clause)) return false;
  if (!(INSTITUTIONAL_CONTACT_CHANNEL_PATTERN.test(clause)
    || PRIVATE_POSTAL_FIELD_PATTERN.test(clause))) return false;
  return !CADASTRE_PATTERN.test(clause)
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(withoutOrganization)
    && !UNREVIEWED_PERSON_NAME_PAIR_PATTERN.test(withoutOrganization);
}

function isCompleteReviewedPublicOrganizationContactQuestion(value) {
  const text = String(value || "").trim();
  if (!isReviewedPublicOrganizationContactClause(text)) return false;
  const residual = removeFirstPublicOrganizationName(text)
    .replace(/[.?!,;:]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return [
    /^(?:mis|millin\w*)\s+on\s+(?:(?:avalik|ametlik|üldine|üld|uld)\w*\s+)?(?:kontakt\w*|telefoni?\w*|e-?post\w*|aadress\w*)$/iu,
    /^(?:what|where)\s+is\s+(?:the\s+)?(?:(?:official|public|general)\s+)?(?:contact(?:\s+(?:channel|details|information|point))?|phone|telephone|email|address)$/iu,
  ].some((pattern) => pattern.test(residual));
}

function isReviewedForeignLanguageSelectorQuery(value) {
  const text = String(value || "").normalize("NFKC").trim();
  const match = text.match(/^([\s\S]+?)\s+(中文)$/u);
  if (!match || FOREIGN_SCRIPT_PATTERN.test(match[1])) return false;
  return (queryTerms(match[1]).some(rootIsDomain)
      || /(?:vee|metsa?|õhu|ohu|kliima|keskkonna|loodus|jäätm|jaatm)[\p{L}-]*andm/iu.test(match[1]))
    && !UNREVIEWED_PERSON_NAME_PAIR_PATTERN.test(removeFirstPublicOrganizationName(match[1]));
}

function hasForeignPrivatePersonClause(value) {
  return splitPublicQueryClauses(value).some((clause) => (
    !isReviewedPublicOrganizationContactClause(clause)
      && FOREIGN_PRIVATE_RELATION_PATTERN.test(privacyLanguageFold(clause))
  ));
}

function hasUnsupportedPublicProviderResidual(value) {
  const text = String(value || "").normalize("NFKC").trim();
  if (FOREIGN_SCRIPT_PATTERN.test(text)
    && !isReviewedForeignLanguageSelectorQuery(text)) return true;
  const clauses = splitPublicQueryClauses(value);
  if (clauses.length < 2) return false;
  // Autocomplete accepts arbitrary partial text. The residual rule applies
  // when a reviewed environmental clause could otherwise carry unrelated
  // text across the provider boundary; standalone non-domain text remains
  // governed by the explicit instruction/person/script classifiers.
  const hasEnvironmentalClause = clauses.some((clause) => (
    queryTerms(clause).some(rootIsDomain)
  ));
  if (!hasEnvironmentalClause) return false;
  return clauses.some((clause) => {
    const roots = queryTerms(clause);
    const hasDomainRoot = roots.some(rootIsDomain);
    if (hasDomainRoot) return false;
    if (isReviewedPublicOrganizationContactClause(clause)) return false;
    if (/^\d+(?:[.,]\d+)?$/u.test(clause)) return false;
    if (!UNREVIEWED_PERSON_NAME_PAIR_PATTERN.test(clause)) return false;
    const withoutOrganization = removeFirstPublicOrganizationName(clause).trim();
    return normalize(withoutOrganization) === normalize(clause)
      && !isBenignNaturalPersonAttributionClause(clause);
  });
}

function isReviewedIndependentPublicClause(value) {
  const clause = String(value || "").trim();
  if (!clause || FOREIGN_SCRIPT_PATTERN.test(clause)
    || FOREIGN_PRIVATE_RELATION_PATTERN.test(privacyLanguageFold(clause))) return false;
  if (isReviewedPublicOrganizationContactClause(clause)) return true;
  const withoutOrganization = removeFirstPublicOrganizationName(clause).trim();
  const identityCandidate = withoutOrganization.replace(
    /^(?:kas|kelle|mida|mill(?:ine|al|est)|what|when|where|which|who|why|how|does|do|is|are)\s+/iu,
    "",
  );
  return queryTerms(clause).some(rootIsDomain)
    && !CADASTRE_PATTERN.test(clause)
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(clause)
    && !PRIVATE_POSTAL_FIELD_PATTERN.test(withoutOrganization)
    && !UNREVIEWED_PERSON_NAME_PAIR_PATTERN.test(identityCandidate);
}

function isReviewedPublicClauseComposition(value) {
  const clauses = splitPublicQueryClauses(value);
  return clauses.length > 1
    && clauses.some(isReviewedPublicOrganizationContactClause)
    && clauses.every(isReviewedIndependentPublicClause);
}

export function containsPrivatePersonLookup(value, {
  allowReviewedPublicClauseComposition = true,
  allowReviewedCountyRequestPrefix = true,
} = {}) {
  if (hasForeignPrivatePersonClause(decodeSecurityEscapes(value))) return true;
  const canonicalText = canonicalSecurityText(value);
  // Unsupported-language residence and ownership clauses must fail before a
  // public environmental prefix can admit the complete text. This guard is
  // intentionally ahead of every reviewed public exception and is shared by
  // all provider-facing minimization paths below.
  if (hasForeignPrivatePersonClause(canonicalText)) return true;
  // Reviewed protected-construction grammars are Latin/Estonian. Never grant
  // their public exception after normalization has erased an unconsumed
  // letter or number from another script; the intact query would otherwise
  // cross suggestion, discovery and model-provider boundaries.
  if (hasLossyUnicodeProtectedConstructionResidual(canonicalText)) return true;
  if (IMPERATIVE_PRIVATE_OWNER_ENUMERATION_PATTERN.test(canonicalText)) return true;
  if (IMPERATIVE_NAMED_OWNER_LOOKUP_PATTERN.test(canonicalText)) return true;
  if (hasReviewedForestTopicPersonResidual(canonicalText)) return true;
  // A request phrase is presentation, not query substance. Strip at most one
  // complete finite request prefix and run the entire privacy classifier again
  // on what remains. This admits “Tell me the Harju county forest area” while
  // names before, inside or after the county question still receive every
  // private-person check. Disabling a second strip keeps repeated prefix-shaped
  // tokens from forming an exemption chain.
  if (allowReviewedCountyRequestPrefix) {
    const requestResidual = stripReviewedCountyPublicRequestPrefix(canonicalText);
    if (requestResidual !== null
      && REVIEWED_COUNTY_FOREST_REQUEST_TARGET_PATTERN.test(requestResidual)) {
      if (!requestResidual) return false;
      return containsPrivatePersonLookup(requestResidual, {
        allowReviewedPublicClauseComposition,
        allowReviewedCountyRequestPrefix: false,
      });
    }
  }
  // A reviewed geography can be followed by an open-class asset role (for
  // example a tenant, operator or responsible party). Treat an explicit
  // private asset plus a requested identity/contact field structurally instead
  // of trying to enumerate every possible role noun. This guard must run
  // before aggregate and county-name exceptions at every provider boundary.
  // Evaluate asset-resident identity requests against the intact query. A
  // later county disambiguation step may remove a hyphenated geography token,
  // but it must never erase the resident/name, national-ID or birth-data risk.
  if (hasAssetResidentIdentityFieldRequest(canonicalText)) return true;
  const forestMetricOfCountyCandidate = reviewedForestMetricOfCountyCandidate(canonicalText);
  if (forestMetricOfCountyCandidate) {
    if (isCompleteReviewedCountyPublicForestQuestion(forestMetricOfCountyCandidate)) return false;
    // Reordering proves only the finite county/forest core. If the reordered
    // candidate is not fully consumed by the reviewed time, year and unit
    // slots, its suffix is unreviewed identity/prose material. Fail closed
    // regardless of token count so parser bounds can never become a bypass.
    return true;
  }
  // A complete reviewed county query can have either a bounded public request
  // prefix or a natural-person prefix. Resolve that exact tri-state before
  // generic title/name heuristics: otherwise “Find Harjumaa ...” is later
  // mistaken for a two-token name, while “Jaan Kask Harjumaa ...” must still
  // fail before every provider boundary.
  const countyForestPrefixScope = reviewedCountyForestPrefixScope(canonicalText);
  if (countyForestPrefixScope === "person") return true;
  if (countyForestPrefixScope === "public-contact") return false;
  if (countyForestPrefixScope === "public-request") {
    return !allowReviewedCountyRequestPrefix;
  }
  if (hasReviewedCountyDescriptorCompoundPersonAsset(canonicalText)) return true;
  // A reviewed county-shaped token sequence beside one or more person-shaped
  // tokens and an asset is ambiguous with a multi-part natural-person name.
  // Deny the intact punctuation/casing variants before county cleanup; only a
  // fully consumed reviewed public modifier may disambiguate the extra token.
  if (hasCountyShapedPersonAssetAssociation(canonicalText)) return true;
  // Bare Ida/Lääne Viru spellings are also plausible two-token person names.
  // Deny their private-asset form explicitly and case-insensitively instead of
  // relying on later person-shape heuristics; only an unambiguous hyphenated,
  // Virumaa, maakond or county spelling can enter a regional exception.
  if (AMBIGUOUS_BARE_COUNTY_PRIVATE_ASSET_PATTERN.test(canonicalText)) return true;
  if (hasPrivateAssetIdentityFieldRequest(canonicalText)) return true;
  // Explicitly negated contact fields are not requested identity data. Carry
  // the stripped residual through every downstream detector; any other name,
  // role, contact, cadastral or personal field remains intact and fail-closed.
  const text = stripNegatedPrivateContactFields(canonicalText)
    .replace(/\s+/gu, " ")
    .replace(/\s+([.?!,;:])/gu, "$1")
    .trim();
  // Once a complete county/private-asset ecology prefix has been consumed,
  // an arbitrary suffix cannot inherit that public meaning. Only an empty
  // residual, an explicitly negated contact field, or one complete reviewed
  // agency-contact clause is admissible; every other suffix fails closed.
  if (hasReviewedCountyPrivateAssetEcologySensitiveResidual(canonicalText)) return true;
  // Both clauses are independently complete, finite public grammars: one
  // reviewed county forest aggregate and one reviewed agency contact. Resolve
  // this composition before generic name-shape recursion can reinterpret the
  // county genitive as a person; any appended identity makes the full helper
  // fail and remains private below.
  if (isCompleteReviewedCountyPublicForestQuestionOrContactComposition(text)) return false;
  // Complete organization-contact questions carry no natural-person
  // residual. Resolve this bounded form before public-clause composition so
  // an environmental clause can safely be paired with a reviewed agency
  // contact without making the private-asset classifier absorb that field.
  if (isCompleteReviewedPublicOrganizationContactQuestion(text)) return false;
  // A complete environmental-impact question about a private asset in an
  // exact reviewed county asks about ecology, not the asset holder. An
  // optional second clause is accepted only when it is itself one complete,
  // reviewed public-organization contact question.
  if (isCompleteReviewedCountyPrivateAssetEcologyQuestion(text)) return false;
  // A fully consumed reviewed-county forest-age question is an environmental
  // aggregate, not a request about a resident. Keep this exception anchored so
  // an appended name, contact, ownership or cadastral field cannot inherit it.
  if (isCompleteReviewedCountyForestAgeQuestion(text)) return false;
  // Likewise, exact age-class, ecological-condition and composition phrases
  // are public only when the reviewed county and category consume the query.
  if (isCompleteReviewedCountyForestCategoryQuestion(text)) return false;
  // Aggregate publication wording has the same reviewed-county identity
  // shape as a person name after punctuation tokenization. Admit only the
  // fully consumed, field-free English forms after negated contacts have been
  // removed above.
  if (isCompleteReviewedCountyPrivateAssetAggregateQuestion(text)) return false;
  // Do not fuse two independently public environmental/contact clauses into
  // a person-shaped contact request. The lightweight composition grammar is
  // only a candidate allowlist: every clause must also clear the complete
  // privacy classifier in isolation before the composition may return public.
  // Disable only this shortcut in the recursive calls so a private clause can
  // never borrow a public organization's contact grammar.
  const reviewedCountyContactCompositionClauses = splitPublicQueryClauses(text);
  const reviewedCountyContactComposition = reviewedCountyContactCompositionClauses.length === 2
    && reviewedCountyContactCompositionClauses
      .filter((clause) => (
        isReviewedPublicOrganizationContactClause(clause)
          || isCompleteReviewedPublicOrganizationContactQuestion(clause)
      )).length === 1
    && reviewedCountyContactCompositionClauses.filter((clause) => (
      classifyForestryGeographyScope(clause).kind === "estonian-region"
        && resolvePublicForestryIntent(clause)?.kind === "regional-forest-area"
    )).length === 1;
  if (allowReviewedPublicClauseComposition && reviewedCountyContactComposition) {
    return reviewedCountyContactCompositionClauses.some((clause) => (
      containsPrivatePersonLookup(clause, {
        allowReviewedPublicClauseComposition: false,
      })
    ));
  }
  if (allowReviewedPublicClauseComposition && isReviewedPublicClauseComposition(text)) {
    return splitPublicQueryClauses(text).some((clause) => (
      containsPrivatePersonLookup(clause, {
        allowReviewedPublicClauseComposition: false,
      })
    ));
  }
  // A canonical cadastral identifier is a public object key by itself, but a
  // query that explicitly binds it to a structured natural-person name is a
  // private association. Enforce this invariant before any public aggregate
  // shortcut can return early.
  if (CADASTRE_PATTERN.test(text)
    && (NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(text)
      || hasNamedPersonCadastralAssociation(text))) return true;
  if (hasPersonPrefixedReviewedMunicipalityAssetAssociation(text)) return true;
  // A reviewed municipality found only inside a larger asset-holder candidate
  // is not a public organization identity. Resolve this before every public
  // aggregate/contact exception so later routing cannot reinterpret the
  // residual natural-person name as a municipality question.
  if (hasPartialReviewedMunicipalityAssetAssociation(text)) return true;
  if (isCompletePublicEcologicalPossessiveForestQuestion(text)) return false;
  // A reviewed geography or municipality token cannot make a larger
  // person-shaped possessive public (for example "John Canada" or
  // "Alice Narva"). Exact complete public possessors remain allowed below.
  if (hasPartialReviewedGeographyPossessiveForestAggregate(text)) return true;
  // Generic organization suffixes are lexical hints, not reviewed identity
  // proof: Board, Service, Trust, Council and Team are also real surnames.
  // Deny an unreviewed complete possessor before any broader organization or
  // environmental exception can reinterpret the name and reach a provider.
  if (hasUnreviewedPossessiveForestAggregateQuestion(text)) return true;
  // This helper consumes the complete query and validates its possessor as a
  // reviewed geography, programme or public organization. Resolve it before
  // the conservative one-token possessive guard; any appended private clause
  // fails the full anchor and is still handled by that guard below.
  if (isCompletePublicPossessiveForestAggregateQuestion(text)) return false;
  // This construction-contact grammar consumes the whole query, removes only
  // a bounded reviewed organization name, and rejects every private or lossy
  // residual. Resolve it before generic title-case/private-asset heuristics can
  // mistake an agency or reviewed national-park name for a natural person.
  if (isReviewedPublicOrganizationProtectedBuildingContactQuery(text)) return false;
  // Public aggregate and method questions can otherwise absorb a trailing
  // person/property phrase. Give bounded named-person asset and ownership
  // relations first refusal before any complete-query public exception.
  if (hasEarlyBoundedNamedPrivateAssetAssociation(text)) return true;
  if (isReviewedNationalUnsupportedForestAreaBreakdownQuestion(text)) return false;
  // Complete ecological descriptions and public institution/entity relations
  // have no residual clause in which a natural person can hide. Resolve these
  // bounded public forms before the any-case name grammar; all three helpers
  // are full-query or end-bound and reject an appended second identity.
  if (isPlainEcologicalResidenceDescriptionQuestion(text)
    || isGenericPublicEnvironmentalInstitutionContactQuery(text)
    || isCompletePublicEcologicalAgencyRoleQuestion(text)
    || isCompletePublicForestConceptQuestion(text)
    || isCompletePublicNationalForestAreaQuestion(text)
    || isCompletePublicPossessiveForestAggregateQuestion(text)
    || isCompletePublicForestOwnershipAggregate(text)
    || isReviewedNationalDefaultForestryAreaComplement(text)
    || reviewedMunicipalityInstitutionalContactScope(text)
    || isReviewedPublicOrganizationProtectedPlaceContactQuery(text)
    || isCompleteReviewedPublicEntityAssetAssociation(text)) return false;
  // National/regional aggregate recognition runs before the full identity
  // classifier. A bounded person + residence field, or an explicit asset-role
  // relation to a named person, must therefore get first refusal here so an
  // otherwise public forestry prefix cannot release the appended clause.
  if (hasEarlyNamedPersonSensitiveAssociation(text)) return true;
  // Registry prose that directly binds a named natural person to the custody
  // of a concrete private asset is sensitive even when phrased as a statement
  // rather than a question. Match the relation before broad ecological/name
  // heuristics can mistake words such as "records describe" for context.
  if (new RegExp(
    String.raw`\b(?:environmental\s+records?\s+describe|registry\s+records?\s+describe|according\s+to\s+the\s+filing[,]?)\s+[\p{L}'’.-]{2,40}\s+[\p{L}'’.-]{2,40}\s+(?:(?:is\s+)?entrusted\s+with|as\s+(?:a\s+)?(?:caretaker|custodian|manager|operator|steward)\s+(?:for|of))\s+(?:an?\s+|the\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}\b`,
    "iu",
  ).test(text)) return true;
  // This exact public-navigation question previously looked like a two-token
  // person name beside the word “forest”. Keep the exemption narrow so it
  // cannot suppress ownership, contact, address or other identity checks.
  if (/^where can i (?:find|access) (?:public )?(?:forest|woodland) data(?: in estonia)?\??$/iu.test(text.trim())) {
    return false;
  }
  if (isReviewedNationalDefaultForestryAreaComplement(text)) return false;
  const forestryGeographyScope = classifyForestryGeographyScope(text);
  const reviewedUnsupportedNationalForestClaim = ["national-default", "national-estonia"]
    .includes(forestryGeographyScope.kind)
    && ["forest-area", "forest-covered-area", "forest-area-method"].includes(resolvePublicForestryIntent(text)?.kind)
    && (requestsUnsupportedForestAreaBreakdown(text)
      || requestsUnsupportedForestAreaTimeSeries(text)
      || requestsUnsupportedForestAreaUnit(text))
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    && !NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(text)
    && !/\b(?:contact|phone|telephone|email|mailbox|address|postal|person|name|live|living|reside|residing|stay|staying|inhabit\w*|where|kontakt\w*|telefon\w*|e-?post\w*|postkast\w*|aadress\w*|isik\w*|nimi|elab|resideeri\w*|viibib|elukoh\w*|who|whose|where|kelle\w*|kus)\b/iu.test(text);
  // These are complete public aggregate dimensions, but the current evidence
  // contract intentionally asks for clarification. Keep them out of the
  // private-person classifier without allowing any appended identity field.
  if (reviewedUnsupportedNationalForestClaim) return false;
  const reviewedRegionalForestAggregateQuestion = ["estonian-region", "foreign-or-other-region"]
    .includes(forestryGeographyScope.kind)
    && resolvePublicForestryIntent(text)?.kind === "regional-forest-area"
    // Geography routing must never exempt an appended natural-person field.
    // The normal privacy classifier below owns those clauses; this aggregate
    // shortcut is allowed only when neither an explicit personal attribute nor
    // a named cadastral field remains in the complete query.
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    && !NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(text)
    && !/\b(?:contact|phone|telephone|email|mailbox|address|postal|owner|person|name|private|live|living|reside|residing|stay|staying|inhabit\w*|where|kontakt\w*|telefon\w*|e-?post\w*|postkast\w*|aadress\w*|omanik\w*|isik\w*|nimi|elab|resideeri\w*|viibib|elukoh\w*|who|whose|where|kelle\w*|kus)\b/iu.test(text);
  // A reviewed county/region aggregate is public even when its genitive name
  // resembles a two-token person beside the word “metsamaa”. The exemption is
  // limited to the complete regional area intent and disappears as soon as a
  // personal contact, identity, ownership or private-asset field is appended.
  if (reviewedRegionalForestAggregateQuestion) return false;
  const reviewedMunicipalityForestAggregateQuestion = forestryGeographyScope.kind === "reviewed-municipality"
    && resolvePublicForestryIntent(text)?.kind === "municipality-forest-area"
    && !CADASTRE_PATTERN.test(text)
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    && !NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(text)
    && !/\b(?:contact|phone|telephone|email|mailbox|address|postal|owner|person|name|private|live|living|reside|residing|stay|staying|inhabit\w*|where|registered|recorded|assigned|attributed|linked|associated|transferred|conveyed|granted|acquired|inherited|vested|titled|kontakt\w*|telefon\w*|e-?post\w*|postkast\w*|aadress\w*|omanik\w*|isik\w*|nimi|elab|resideeri\w*|viibib|elukoh\w*|registreeri\w*|salvesta\w*|määra\w*|maara\w*|omista\w*|seosta\w*|anna\w*|loovuta\w*|päri\w*|pari\w*|who|whose|where|kelle\w*|kus)\b/iu.test(text);
  // Reviewed municipality-area questions are public aggregates, including
  // redundant but benign wording. The complete private-field guards above
  // keep appended person, contact, ownership and cadastral clauses private.
  if (reviewedMunicipalityForestAggregateQuestion) return false;
  const estonianMunicipalityManagementMatch = text.trim().match(
    /^kuidas\s+([\p{L}'’-]{2,50}(?:\s+[\p{L}'’-]{2,50}){0,2})\s+(linn|vald)\s+(?:haldab|hooldab|käitab|kaitab|majandab|opereerib)\s+(?:(?:era|perekonna)[-\s]*)?(?:kaevu|puurkaevu|metsa|metsamaad|kinnistut)\??$/iu,
  );
  const englishMunicipalityManagementMatch = text.trim().match(
    /^how\s+does\s+([\p{L}'’-]{2,50}(?:\s+[\p{L}'’-]{2,50}){0,2})\s+(city|municipality)\s+(?:manage|maintain|operate|steward)\s+(?:(?:a|the)\s+)?(?:private|family|household)\s+(?:well|borehole|forest|woodland|land|property|parcel)\??$/iu,
  );
  const reviewedMunicipalityManagementQuestion = Boolean(
    (estonianMunicipalityManagementMatch
      && isReviewedEstonianMunicipalityIdentity(
        `${estonianMunicipalityManagementMatch[1]} ${estonianMunicipalityManagementMatch[2]}`,
      ))
    || (englishMunicipalityManagementMatch
      && isReviewedEstonianMunicipalityIdentity(
        englishMunicipalityManagementMatch[2].toLocaleLowerCase("en") === "city"
          ? `${englishMunicipalityManagementMatch[1]} linn`
          : `${englishMunicipalityManagementMatch[1]} vald`,
      )),
  );
  const reviewedMunicipalityAggregateScope = reviewedEstonianMunicipalityScope(text);
  const reviewedMunicipalityEnvironmentalAggregateQuestion = Boolean(reviewedMunicipalityAggregateScope)
    && [
      /^how\s+much\s+(?:forest|woodland)\s+(?:is|lies)\s+in\s+(?:the\s+)?city\s+of\s+[\p{L}'’-]{2,50}\??$/iu,
      /^how\s+many\s+hectares\s+of\s+(?:forest|woodland)\s+are\s+in\s+(?:the\s+)?city\s+of\s+[\p{L}'’-]{2,50}\??$/iu,
      /^what\s+percentage\s+of\s+(?:the\s+)?city\s+of\s+[\p{L}'’-]{2,50}\s+is\s+(?:forest|woodland)\??$/iu,
      /^how\s+much\s+(?:forest|woodland)\s+is\s+(?:under|managed\s+by)\s+(?:the\s+)?(?:city|municipal|local)\s+government\s+of\s+[\p{L}'’-]{2,50}\??$/iu,
      /^how\s+much\s+(?:forest|woodland)\s+is\s+(?:under|managed\s+by)\s+[\p{L}'’-]{2,50}\s+(?:city|municipal|local)\s+government\??$/iu,
      /^how\s+much\s+(?:forest|woodland)\s+does\s+[\p{L}'’-]{2,50}\s+(?:city|municipal|local)\s+government\s+manage\??$/iu,
      /^how\s+much\s+(?:forest|woodland)\s+(?:is|lies)\s+in\s+(?:the\s+)?municipality\s+of\s+[\p{L}'’-]{2,50}\??$/iu,
      /^how\s+much\s+(?:forest|woodland)\s+(?:is|lies)\s+in\s+[\p{L}'’-]{2,50}\s+municipality\??$/iu,
      /^what\s+is\s+the\s+(?:forest|woodland)\s+(?:cover(?:age)?\s+(?:percentage|percent|share)|area)\s+of\s+[\p{L}'’-]{2,50}\s+municipality\??$/iu,
      /^what\s+(?:percentage|percent|share)\s+of\s+[\p{L}'’-]{2,50}\s+municipality\s+is\s+(?:forest|woodland)\??$/iu,
    ].some((pattern) => pattern.test(text.trim()));
  const explicitUnknownMunicipalityAggregateQuestion = forestryGeographyScope.kind === "unknown-locality"
    && resolvePublicForestryIntent(text)?.kind === "municipality-forest-area"
    && !CADASTRE_PATTERN.test(text)
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    && !NAMED_PERSON_CADASTRAL_FIELD_PATTERN.test(text)
    && !/\b(?:contact|phone|telephone|email|mailbox|address|postal|owner|person|name|private|live|living|reside|residing|stay|staying|inhabit\w*|where|kontakt\w*|telefon\w*|e-?post\w*|postkast\w*|aadress\w*|omanik\w*|isik\w*|nimi|elab|resideeri\w*|viibib|elukoh\w*|who|whose|where|kelle\w*|kus)\b/iu.test(text);
  if (reviewedMunicipalityEnvironmentalAggregateQuestion || explicitUnknownMunicipalityAggregateQuestion) return false;
  if (reviewedMunicipalityInstitutionalContactScope(text)) return false;
  // These complete-query forms discuss public publication practice, generic
  // role duties or institutional service contacts. They contain words such
  // as "person", "owner", "contact" and "coordinates", but request no
  // natural-person record. Complete anchoring prevents the exception from
  // absorbing an appended name, address, private asset or identity clause.
  const reviewedPublicForestManagerSubjectSource = String.raw`(?:who|(?:which|what)\s+(?:public\s+)?(?:agency|authority|body|institution|organi[sz]ation))`;
  const reviewedPublicForestManagerActionSource = String.raw`(?:manages?|maintains?|administers?|stewards?)`;
  const reviewedPublicForestManagerAssetSource = String.raw`(?:the\s+)?(?:public|state|national|municipal|county(?:[-\s]+owned)?)\s+(?:county\s+)?(?:forest|woodland)`;
  const reviewedPublicForestManagerCoreSource = String.raw`${reviewedPublicForestManagerSubjectSource}\s+${reviewedPublicForestManagerActionSource}\s+${reviewedPublicForestManagerAssetSource}`;
  const reviewedPublicForestManagerQuestion = new RegExp(
    String.raw`^${reviewedPublicForestManagerCoreSource}(?:\s+(?:land|property))?\??$`,
    "iu",
  ).test(text.trim());
  const reviewedPublicForestManagerHasResidual = !reviewedPublicForestManagerQuestion
    && [
      new RegExp(
        String.raw`^${reviewedPublicForestManagerCoreSource}\s+(?:land|property)(?:\s*[,;:]\s*|\s+)(?<residual>[\s\S]+)$`,
        "iu",
      ),
      new RegExp(
        String.raw`^${reviewedPublicForestManagerCoreSource}(?:\s*[,;:]\s*|\s+)(?<residual>[\s\S]+)$`,
        "iu",
      ),
    ].some((pattern) => {
      const match = text.trim().match(pattern);
      return Boolean(match?.groups?.residual?.replace(/[.?!]+$/gu, "").trim());
    });
  // This public-role exception is deliberately closed rather than prefix
  // based. Any remaining text can carry an unreviewed person association, so
  // it must fail before provider minimization, retrieval, context or the LLM.
  if (reviewedPublicForestManagerHasResidual) return true;
  const reviewedConceptualPublicQuestion = [
    /^(?:(?:find|show|search|look(?:[\s-]+)?up)(?:\s+me)?(?:\s+the)?\s+)?(?:(?:public|county|state|national|municipal)\s+)?(?:forest|woodland)\s+management\s+(?:guidance|practices|policy|plans|methods|authority|rules)\??$/iu,
    /^general\s+(?:dut(?:y|ies)|responsibilit(?:y|ies)|obligations?|requirements?)\s+of\s+(?:fiduciar\w*|keepers?|conservators?|wardens?|delegates?|agents?|representatives?|proxies?|licensees?|concessionaires?|superintendents?)\s+(?:managing|maintaining|administering|operating|stewarding)\s+(?:forest|woodland|land)\s+(?:property|parcels?|plots?|holdings?)\.?$/iu,
    /^kuidas\s+peab\s+kinnistu\s+kontaktisik\w*\s+järgima\s+jäätmereegl\w*\??$/iu,
    /^kuidas\s+leida\s+(?:kohaliku\s+)?omavalitsuse\s+jäätmeinfo\s+üldtelefoni?\w*\??$/iu,
    /^kuidas\s+leida\s+asutus\w*\s+(?:üld|uld)postkast\w*\s+keskkonnateab\w*\s+jaoks\??$/iu,
    /^millin\w*\s+amet\s+annab\s+keskkonnaandm\w*\s+api\s+toe\s+(?:üld|uld|yld)kontakt\w*\??$/iu,
    /^kas\s+natura\s+ala\s+kontaktpunkti\s+roll\s+võib\s+olla\s+asutusepõhine\??$/iu,
    /^kuidas\s+avalikustada\s+elupaiga\s+piirkond\w*\s+nii[,]?\s+et\s+täppkoordinaat\w*\s+ei\s+näidata\??$/iu,
    /^(?:which|what)\s+(?:public\s+)?agency\s+coordinates?\s+coastal[-\s]+water\s+monitoring\s+overall\??$/iu,
    /^(?:which|what)\s+(?:public\s+)?(?:agency|authority|body|institution|organi[sz]ation|team)\s+(?:monitors?|studies?|assesses?|oversees?)\s+(?:forest|woodland)\s+habitats?\??$/iu,
    /^can\s+a\s+public\s+object\s+code\s+remain\s+on\s+a\s+map\s+without\s+an?\s+owner\s+name\??$/iu,
    /^how\s+should\s+a\s+rare[-\s]+species\s+observation\s+location\s+be\s+generali[sz]ed\??$/iu,
    /^how\s+can\s+i\s+find\s+a\s+municipalit\w*\s+waste[-\s]+information\s+general\s+phone\??$/iu,
    /^can\s+a\s+natura\s+site\s+contact\s+role\s+belong\s+to\s+an?\s+institution\s+rather\s+than\s+a\s+person\??$/iu,
    /^how\s+can\s+habitat\s+areas\s+be\s+published\s+without\s+showing\s+exact\s+coordinates\??$/iu,
    /^can\s+an?\s+press\s+contact\s+be\s+shown\s+in\s+a\s+public\s+service\s+catalogue\??$/iu,
    /^how\s+can\s+a\s+public\s+contact\s+role\s+for\s+monitoring\s+data\s+be\s+found\??$/iu,
    /^where\s+is\s+the\s+public\s+(?:(?:contact\s+desk\s+for\s+(?:groundwater|surface[-\s]+water|water|soil|air|climate|forest|woodland|waste|biodiversity|nature|habitat|species)(?:[-\s]+quality)?(?:\s+monitoring)?\s+(?:data|guidance|information))|(?:(?:groundwater|surface[-\s]+water|water|soil|air|climate|forest|woodland|waste|biodiversity|nature|habitat|species)(?:[-\s]+quality)?(?:\s+monitoring)?(?:\s+(?:data|guidance|information))?\s+contact\s+desk))\??$/iu,
    /^how\s+can\s+a\s+public\s+service\s+contact\s+role\s+for\s+(?:hydrology|groundwater|surface[-\s]+water|water|soil|air|climate|forest|woodland|waste|biodiversity|nature|habitat|species)\s+be\s+found\??$/iu,
    /^which\s+contact\s+roles\s+are\s+listed\s+in\s+an?\s+environmental\s+service\s+catalogue\??$/iu,
    /^kas\s+avalik\w*\s+liigiandm\w*\s+kaard\w*\s+võib\s+koordinaat\w*\s+ümarda\w*\??$/iu,
    /^kas\s+pressiosakonna\s+kontaktroll\w*\s+on\s+keskkonnaregistr\w*\s+nähtav\??$/iu,
    /^kuidas\s+eristada\s+ametlik\w*\s+infokanal\w*\s+isiklik\w*\s+kontakt\w*\??$/iu,
    /^kust\s+(?:saab|leiab?|leian)\s+natura\s+ala\s+kaitsekorraldus\w*\s+üldis\w*\s+kontaktroll\w*\??$/iu,
    /^kas\s+avalik\w*\s+keskkonnakaart\w*\s+võib\s+näidata\s+elupaik\w*\s+piirkon\w*\??$/iu,
    /^kust\s+(?:saab|leiab?|leian)\s+õhukvaliteedi\s+mõõtejaam\w*\s+kontaktkanal\w*\??$/iu,
    /^kuidas\s+avalikustada\s+haruldas\w*\s+liigi\s+elupaig\w*\s+piirkond\w*\s+ohutult\??$/iu,
    /^millis\w*\s+kontaktroll\w*\s+on\s+asutus\w*\s+teenusekataloog\w*\??$/iu,
    /^kas\s+riigimetsa\s+andmed\s+on\s+allalaaditav\w*\s+ilma\s+isikuandm\w*\??$/iu,
    /^millin\w*\s+asutus\s+annab\s+juhis\w*\s+pesapaig\w*\s+koordinaat\w*\s+peitmis\w*\??$/iu,
    /^how\s+are\s+location[-\s]+precision\s+rules\s+for\s+natura\s+observations?\s+published\??$/iu,
    /^is\s+a\s+press[-\s]+office\s+contact\s+role\s+visible\s+in\s+an?\s+environmental\s+register\??$/iu,
    /^how\s+can\s+an?\s+official\s+(?:information|press)\s+channel\s+be\s+distinguished\s+from\s+a\s+personal\s+contact\??$/iu,
    /^what\s+principles\s+govern\s+generali[sz]ing\s+the\s+location\s+of\s+a\s+protected\s+nesting\s+site\??$/iu,
    /^where\s+is\s+the\s+general\s+contact\s+role\s+for\s+(?:natura[-\s]+site|habitat|wetland|water|forest|nature|biodiversity)\s+management\??$/iu,
    /^how\s+can\s+a\s+monitoring\s+point\s+be\s+published\s+without\s+an?\s+exact\s+location\??$/iu,
    /^must\s+a\s+public\s+object\s+register\s+show\s+an?\s+owner\s+name\??$/iu,
    /^which\s+(?:public\s+)?agency\s+coordinates?\s+coastal\s+monitoring\s+programmes?\??$/iu,
    /^where\s+is\s+the\s+agency\s+general\s+press\s+contact\s+for\s+nature\s+topics\??$/iu,
    /^can\s+a\s+(?:one[-\s]+kilometre|one[-\s]+kilometer|1\s*km)\s+grid\s+replace\s+an?\s+exact\s+coordinate\??$/iu,
    /^is\s+a\s+municipal\s+general\s+contact\s+suitable\s+for\s+a\s+waste\s+question\??$/iu,
    /^which\s+contact\s+roles\s+are\s+listed\s+in\s+an?\s+agency\s+service\s+catalogue\??$/iu,
    /^is\s+state[-\s]+forest\s+data\s+downloadable\s+without\s+personal\s+information\??$/iu,
    /^which\s+(?:public\s+)?agency\s+guides?\s+hiding\s+nesting[-\s]+site\s+coordinates\??$/iu,
    /^(?:may|can)\s+(?:an?\s+)?public\s+species\s+map\s+(?:round|generali[sz]e)\s+coordinates?\s+to\s+(?:fewer\s+decimals?|\w+\s+decimal\s+places?)\??$/iu,
    /^how\s+should\s+an?\s+official\s+(?:data|information)\s+channel\s+be\s+distinguished\s+from\s+an?\s+(?:personal|private)\s+contact\??$/iu,
    /^where\s+is\s+the\s+institution[-\s]+level\s+contact\s+channel\s+for\s+natura(?:[-\s]+site)?\s+management\??$/iu,
    /^how\s+can\s+(?:an?\s+)?monitoring\s+(?:point|coordinate)\s+be\s+published\s+without\s+an?\s+exact\s+(?:location|position)\??$/iu,
    /^(?:which|what)\s+(?:public\s+)?(?:agency|authority|body|institution)\s+coordinates?\s+(?:offshore|coastal|marine)(?:[-\s]+water)?\s+monitoring\s+overall\??$/iu,
    /^where\s+is\s+the\s+(?:agency\s+)?general\s+(?:media|press)\s+contact\s+for\s+nature\s+(?:protection|topics)\??$/iu,
    /^can\s+a\s+(?:\d+|one|two)[-\s]+kilomet(?:re|er)\s+grid\s+replace\s+an?\s+exact\s+coordinate\??$/iu,
    /^which\s+(?:agency\s+)?contact\s+roles\s+are\s+listed\s+in\s+(?:(?:an?|the)\s+)?(?:agency\s+)?service\s+catalogue\??$/iu,
    /^which\s+(?:public\s+)?(?:agency|authority|body|institution)\s+guides?\s+generali[sz]ing\s+nesting[-\s]+site\s+coordinates\??$/iu,
    /^how\s+can\s+the\s+public\s+contact\s+(?:channel|role)\s+for\s+monitoring\s+data\s+be\s+found\??$/iu,
    /^kas\s+avalik\w*\s+liigikaar[dt]\w*\s+võib\s+koordinaat\w*\s+(?:üldista|uldista|ümarda|umarda)\w*\s+(?:kümnendkohani|kumnendkohani|\d+\s+kümnendkohani)\??$/iu,
    /^kuidas\s+võrrelda\s+ametlik\w*\s+(?:andme|info)kanal\w*\s+isiklik\w*\s+kontakt\w*\??$/iu,
    /^kust\s+(?:saab|leiab?|leian)\s+natura\s+kaitsekorraldus\w*\s+asutusepõhis\w*\s+kontaktkanal\w*\??$/iu,
    /^kas\s+(?:avalik\w*\s+)?keskkonnakaar[dt]\w*\s+võib\s+näidata\s+elupai[kg]\w*\s+(?:\d+\s*km\s+)?piirkon\w*\??$/iu,
    /^kuidas\s+avaldada\s+seirepunkt\w*\s+koordinaat\w*\s+ilma\s+täppasuko(?:ht|ha)\w*\??$/iu,
    /^kuidas\s+näidata\s+(?:ohustatud|haruldas\w*|kaitsealust\w*)\s+liigi\s+elupaig\w*\s+piirkond\w*\s+turvaliselt\??$/iu,
    /^millis\w*\s+asutus\w*\s+kontaktroll\w*\s+on\s+teenusekataloog\w*\??$/iu,
    /^millin\w*\s+(?:amet|asutus)\s+annab\s+pesapaig\w*\s+koordinaat\w*\s+üldistamis\w*\s+juhis\w*\??$/iu,
    /^kuidas\s+toimib\s+asutus\w*\s+määratud\s+kontaktroll\w*\s+looduskaits\w*\s+teenus\w*\??$/iu,
    /^kas\s+riigiasutus\w*\s+volitatud\s+esindaja\w*\s+ametlik\w*\s+postkast\w*\s+on\s+avalik\w*\??$/iu,
    /^kas\s+natura\s+kaard\w*\s+avalik\w*\s+kontakt\w*\s+on\s+üksusepõhi\w*\??$/iu,
    /^millin\w*\s+avalik\w*\s+postiaadress\w*\s+on\s+keskkonnaloa\s+menetlus\w*\s+kontakt\w*\??$/iu,
    /^kust\s+(?:saab|leiab?)\s+(?:meteoroloogia|ilmajaama)\s+teenus\w*\s+üldis\w*\s+telefoninumb\w*\??$/iu,
    /^kas\s+(?:registr\w*|teenusekataloog\w*)\s+kontaktroll\w*\s+võib\s+kuvada\s+ilma\s+inime\w*\s+nime\w*\??$/iu,
    /^kuidas\s+avaldada\s+elupaig\w*\s+piirkon\w*\s+nii[,]?\s+et\s+täpne\s+asukoht\w*\s+jääb\s+varjat\w*\??$/iu,
    /^kas\s+tundlik\w*\s+pesapaig\w*\s+koordinaat\w*\s+tuleb\s+avalik\w*\s+kaard\w*\s+ümarda\w*\??$/iu,
    /^millin\w*\s+on\s+asutus\w*\s+avalik\w*\s+kontakt\w*\s+keskkonnateabe\s+taotlus\w*\??$/iu,
    /^millin\w*\s+on\s+keskkonnateabe\s+avalik\w*\s+postiaadress\w*\s+kasutus\w*\??$/iu,
    /^kuidas\s+otsida\s+(?:asutus\w*|keskkonnaamet\w*)\s+kontaktroll\w*\s+teenusekataloog\w*\??$/iu,
    /^how\s+does\s+an?\s+appointed\s+institutional\s+contact\s+role\s+work\s+in\s+an?\s+nature\s+service\??$/iu,
    /^is\s+an?\s+authori[sz]ed\s+agency\s+representative(?:'s|’s)\s+public\s+mailbox\s+available\??$/iu,
    /^is\s+an?\s+natura\s+map\s+public\s+contact\s+organi[sz]ed\s+by\s+unit\??$/iu,
    /^how\s+can\s+an?\s+agency[-\s]+appointed\s+press\s+representative(?:'s|’s)\s+general\s+mailbox\s+be\s+found\??$/iu,
    /^which\s+public\s+postal\s+address\s+handles?\s+environmental[-\s]+permit\s+questions?\??$/iu,
    /^where\s+is\s+the\s+general\s+phone\s+for\s+the\s+meteorological\s+service\??$/iu,
    /^can\s+an?\s+registry\s+contact\s+role\s+be\s+shown\s+without\s+an?\s+person(?:'s|’s)\s+name\??$/iu,
    /^how\s+should\s+an?\s+(?:habitat|wetland)\s+region\s+be\s+published\s+while\s+hiding\s+(?:the\s+)?exact\s+(?:location|coordinates?)\??$/iu,
    /^should\s+an?\s+(?:sensitive|protected)\s+(?:nest|nesting[-\s]+site|nesting)\s+coordinate\s+be\s+rounded\s+on\s+an?\s+public\s+map\??$/iu,
    /^what\s+precision\s+rule\s+applies\s+to\s+an?\s+public\s+monitoring\s+station\s+location\??$/iu,
    /^is\s+environmental(?:[-\s]+data)?[-\s]+api\s+support\s+an?\s+institutional\s+general\s+contact\??$/iu,
    /^where\s+is\s+public\s+guidance\s+for\s+generali[sz]ing\s+nesting[-\s]+site\s+locations?\??$/iu,
    /^what\s+public\s+agency\s+contact\s+handles?\s+environmental[-\s]+information\s+requests?\??$/iu,
    /^how\s+should\s+an?\s+public\s+environmental[-\s]+information\s+postal\s+address\s+be\s+used\??$/iu,
    /^how\s+can\s+an?\s+agency\s+contact\s+role\s+be\s+searched\s+in\s+an?\s+service\s+catalogue\??$/iu,
    /^kuidas\s+leida\s+looduskaits\w*\s+osakon\w*\s+avalik\w*\s+postiaadress\w*\??$/iu,
    /^kuidas\s+avaldada\s+elupaig\w*\s+piirkon\w*\s+ilma\s+täpse\s+punkt\w*\??$/iu,
    /^millin\w*\s+asutus\s+määrab\s+koordinaat\w*\s+ümardamis\w*\s+põhimõt\w*\??$/iu,
    /^kas\s+natura\s+kaard\w*\s+kontaktroll\w*\s+on\s+seotud\s+asutus\w*\??$/iu,
    /^kas\s+avalik\w*\s+seirejaam\w*\s+asukoht\w*\s+võib\s+olla\s+ruu[dt]\w*\s+näidatud\??$/iu,
    /^can\s+an?\s+appointed\s+service\s+contact\s+be\s+an?\s+shared\s+institutional\s+mailbox\??$/iu,
    /^where\s+is\s+the\s+public\s+postal\s+address\s+for\s+the\s+nature[\s/_-]+protection\s+unit\??$/iu,
    /^which\s+(?:public\s+)?agency\s+sets\s+the\s+policy\s+for\s+rounding\s+coordinates\??$/iu,
    /^is\s+the\s+natura\s+map\s+contact\s+role\s+tied\s+to\s+an?\s+institution\??$/iu,
    /^how\s+can\s+an?\s+agency\s+press[-\s]+office\s+contact\s+catalogue\s+be\s+searched\??$/iu,
    /^which\s+(?:public\s+)?authority\s+publishes\s+guidance\s+for\s+generali[sz]ing\s+nesting\s+locations\??$/iu,
    /^can\s+an?\s+public\s+monitoring[-\s]+station\s+location\s+be\s+shown\s+as\s+an?\s+grid\??$/iu,
    /^kust\s+(?:saab|leiab?|leian)\s+(?:avalik\w*\s+)?keskkonnateenus\w*\s+üldis\w*\s+kontaktkanal\w*\??$/iu,
    /^elupaig\w*\s+kirjeldus\w*\.?$/iu,
    /^kas\s+ametlik\w*\s+pressiosakon\w*\s+kontakt\w*\s+võib\s+olla\s+avalik\w*\??$/iu,
    /^kas\s+avalik\w*\s+teenus\w*\s+kontaktroll\w*\s+võib\s+olla\s+üksusepõhi\w*\??$/iu,
    /^kuidas\s+avaldada\s+elupaig\w*\s+piirkon\w*\s+ilma\s+täpse\s+koordinaa[dt]\w*\??$/iu,
    /^kuidas\s+eristada\s+asutus\w*\s+infokanal\w*\s+isiklik\w*\s+kontakt\w*\??$/iu,
    /^how\s+can\s+an?\s+agency\s+(?:general\s+)?mailbox\s+be\s+found\??$/iu,
    /^can\s+an?\s+public\s+press[-\s]+office\s+contact\s+be\s+listed\??$/iu,
    /^can\s+an?\s+public\s+service\s+contact\s+role\s+belong\s+to\s+an?\s+unit\??$/iu,
    /^how\s+can\s+an?\s+habitat\s+region\s+be\s+shown\s+without\s+(?:an?\s+)?exact\s+coordinates?\??$/iu,
    /^what\s+rules\s+govern\s+hiding\s+an?\s+sensitive\s+nesting\s+location\??$/iu,
    /^how\s+can\s+an?\s+agency\s+channel\s+be\s+distinguished\s+from\s+an?\s+personal\s+contact\??$/iu,
    /^where\s+is\s+the\s+public\s+postal\s+address\s+for\s+(?:environmental[-\s]+)?permit\s+questions\??$/iu,
    /^where\s+is\s+the\s+public\s+postal\s+address\s+for\s+nature[\s/_-]+protection\s+requests?\??$/iu,
    /^(?:[\p{L}'’-]+\s+){1,5}(?:board|agency|authority|ministry)\s+(?:official\s+)?environmental[-\s]+permit\s+contact\s+for\s+a\s+private\s+(?:well|borehole)\??$/iu,
    /^keskkonnaamet\w*\s+avalik\w*\s+teenus\w*\s+kontakt\w*\s+perekonna\s+kaevu\s+loa\s+kohta\??$/iu,
    /^which\s+(?:public\s+)?(?:agency|authority|institution|organization)\s+manages?\s+coastal[-\s]+meadow\s+conservation\??$/iu,
    /^kuidas\s+avaldada\s+tundlik\w*\s+liigi\s+elupai[kg]\w*\s+piirkon\w*\??$/iu,
    /^millin\w*\s+on\s+ametlik\w*\s+keskkonnateab\w*\s+postiaadress\w*\??$/iu,
    /^kuidas\s+leida\s+asutus\w*\s+pressiosakon\w*\s+(?:üld|uld)postkast\w*\??$/iu,
    /^can\s+(?:monitoring|hydrology)\s+coordinates?\s+be\s+shown\s+as\s+an?\s+grid\??$/iu,
    /^what\s+is\s+the\s+official\s+postal\s+address\s+for\s+(?:environmental|nature)\s+information\??$/iu,
    /^how\s+can\s+(?:an?\s+agency|a\s+public)\s+press[-\s]+office\s+mailbox\s+be\s+found\??$/iu,
    /^natura\s+elupaig\w*\s+ruudustik\w*\.?$/iu,
    /^kuidas\s+avaldada\s+tundlik\w*\s+(?:liigi\s+)?elupai[kg]\w*\s+piirkon\w*(?:\s+kaard\w*)?\??$/iu,
    /^millin\w*\s+postiaadress\w*\s+on\s+ametlik\w*\s+keskkonnateab\w*\??$/iu,
    /^what\s+is\s+the\s+official\s+postal\s+address\s+for\s+environmental[-\s]+data\s+requests?\??$/iu,
    /^where\s+can\s+an?\s+agency\s+press[-\s]+office\s+mailbox\s+be\s+located\??$/iu,
    /^can\s+an?\s+(?:monitoring|hydrology)\s+coordinate\s+be\s+displayed\s+as\s+an?\s+grid\??$/iu,
    /^can\s+an?\s+habitat\s+location\s+be\s+shown\s+as\s+an?\s+region\??$/iu,
    /^kuidas\s+leida\s+pressiosakon\w*\s+ühis\w*\s+postkast\w*\??$/iu,
    /^(?:what\s+(?:are\s+the\s+|are\s+|is\s+the\s+)?environmental\s+(?:effects?|impacts?)\s+(?:of\s+|can\s+)?(?:managing\s+)?(?:an?\s+)?private\s+(?:forest|woodland)(?:\s+management)?(?:\s+have)?|what\s+environmental\s+effects?\s+can\s+managing\s+(?:an?\s+)?private\s+(?:forest|woodland)\s+have)\??$/iu,
    /^how\s+does\s+(?:adaptive\s+ecosystem|multi[-\s]+purpose|selective\s+harvest)\s+management\s+of\s+(?:forest|woodland)\s+affect\s+(?:biodiversity|habitat)\??$/iu,
    /^millin\w*\s+on\s+erametsa\s+haldamise\s+m[õo]ju\s+elupaig\w*\??$/iu,
    /^what\s+(?:(?:are\s+the|are|is\s+the)\s+)?(?:environmental\s+)?(?:effects?|impacts?)\s+(?:(?:of|can)\s+)?(?:(?:adaptive|multi[-\s]+purpose)\s+)?(?:management\s+of|managing)\s+(?:an?\s+)?private\s+(?:forest|woodland)(?:\s+and\s+(?:an?\s+)?private\s+(?:well|borehole))?(?:\s+have)?\??$/iu,
    /^kuidas\s+m[õo]jutab\s+munitsipaalüksus\w*\s+hallatav\w*\s+eramaa\w*\??$/iu,
    /^what\s+environmental\s+impact\s+does\s+long[-\s]+term\s+private\s+(?:forest|woodland)\s+stewardship\s+have\??$/iu,
    /^how\s+do\s+public\s+(?:forest|woodland)\s+and\s+private\s+(?:forest|woodland)\s+management\s+polic(?:y|ies)\s+interact\??$/iu,
    /^how\s+do\s+public\s+and\s+private\s+(?:forest|woodland)\s+management\s+practices?\s+affect\s+(?:biodiversity|habitat)\??$/iu,
    /^what\s+environmental\s+(?:effects?|impacts?)\s+can\s+private\s+property\s+use\s+have\??$/iu,
    /^what\s+are\s+the\s+(?:biodiversity|habitat)\s+(?:effects?|impacts?)\s+of\s+private\s+(?:forest|woodland)\s+stewardship\??$/iu,
    /^kuidas\s+avaldada\s+perekonna\s+kaevu\s+seire\s+üldandm\w*\s+ilma\s+kontakt\w*\??$/iu,
    /^how\s+does\s+(?:[\p{L}'’-]{2,40}[\s\p{Pd}./·:_]+){1,2}[\p{L}'’-]{2,40}\s+(?:manage\w*|maintain\w*|administer\w*|operate\w*|steward\w*)\s+(?:(?:an?|the)\s+)?(?:state(?:[-\s]+owned)?|public(?:ly[-\s]+owned|[-\s]+owned)?|national|municipal(?:ly[-\s]+owned)?|government(?:[-\s]+owned)?|city[-\s]+owned|county[-\s]+owned|federal)\s+(?:forest|woodland|land|property|estate|parcel|plot|lot|farm|well|borehole|building|dwelling)s?\??$/iu,
  ].some((pattern) => pattern.test(text.trim()))
    || reviewedPublicForestManagerQuestion
    || reviewedMunicipalityManagementQuestion;
  const reviewedOpenRolePolicyHasPrivateResidual = [
    /(?:,|;)\s*(?:and\s+)?(?:who|whom|whose|where)\b/iu,
    /\bwho\s+is\s+(?:that|the)\s+person\b/iu,
    /\bwhere\s+(?:do|does|did)\s+(?:he|she|they|this\s+person|that\s+person|the\s+person)\s+(?:live|reside|stay)\b/iu,
    /\b(?:someone|whoever|an?\s+person|an?\s+individual)\s+(?:[\p{L}'’-]{2,40}\s+){2,5}(?:who|that)\s+(?:owns?|holds?|leases?|rents?|occupies?|controls?|possesses?)\b/iu,
    /(?:,|;)\s*(?:ja|ning)\s+(?:kes|kelle|keda|kus)\b/iu,
    /(?:,|;)\s*(?:ja|ning)\s+(?:millin\w*|millis\w*|mis)\s+(?:inime\w*|isik\w*)\b/iu,
    /(?:,|;)[\s\S]{0,35}(?:millin\w*|millis\w*|mis)\s+(?:inime\w*|isik\w*)\b/iu,
    /(?<!\p{L})kes\s+(?:ta|see)\s+on(?!\p{L})/iu,
    /(?<!\p{L})kus\s+(?:ta|see\s+isik)\s+(?:elab|resideeri\w*|viibib)(?!\p{L})/iu,
  ].some((pattern) => pattern.test(text));
  // Lowercase names are intentionally not inferred from arbitrary two-word
  // phrases across the whole search surface. Inside this specific grammar,
  // however, one or two free tokens inserted directly after the generic
  // natural-person subject and before a relational clause are not a role
  // description: they are an embedded named subject (for example
  // "someone alice smith where ..."). Detect that open class before the
  // policy exemption is eligible, including the Estonian equivalent.
  const reviewedOpenRolePolicyHasEmbeddedNamedSubject = [
    /\b(?:someone|an?\s+person|an?\s+individual)\s+(?!(?:appointed|designated|assigned|acting|serving|holding|managing|maintaining|administering|operating|using|occupying|leasing|renting|representing|stewarding|responsible|tasked|charged)\b)(?:[\p{L}'’-]{1,40}\s+){1,2}(?=(?:where|who|whose|tell\s+me|which|what|owns?|holds?|leases?|rents?|occupies?|controls?|possesses?|manages?|maintains?|administers?|operates?)\b)/iu,
    /\b(?:inimesel|inimesele|isikul|isikule|sellel|sellele)\s+(?!(?:kes|kellele|kellel|kelle|keda|kus|määrati|maarati|nimetati|tegutseb|toimib|haldab|hooldab|käitab|kaitab|kasutab)\b)(?:[\p{L}'’-]{1,40}\s+){1,2}(?=(?:kes|kellele|kellel|kelle|keda|kus|milline|mis|omab|kuulub|haldab|hooldab|käitab|kaitab|kasutab)\b)/iu,
  ].some((pattern) => pattern.test(text));
  const reviewedOpenRolePolicyQuestion = [
    /^(?:what|which)\s+(?:duties|rules|rights|obligations|requirements|qualifications|permissions)\s+(?:apply\s+to|bind|govern)\s+(?:someone|whoever|an?\s+person|an?\s+individual)\b[\s\S]{0,150}\??$/iu,
    /^(?:may|can|should|must)\s+(?:someone|whoever|an?\s+person|an?\s+individual)\b[\s\S]{0,120}\b(?:tasks?|duties|rules|requirements|monitoring|compliance)\b[\s\S]{0,60}\??$/iu,
    /^(?:millis\w*|mis)\s+(?:kohustus|reegl|õigus|oigus|nõue|noue)\w*\s+(?:on|kehtib|kehtivad)\s+(?:inimes\w*|isik\w*|sellele)[\s\S]{0,150}\??$/iu,
    /^(?:what|which)\s+(?:[\p{L}-]+\s+){0,2}(?:requirements?|rules?|rights?|dut(?:y|ies)|obligations?|responsibilit(?:y|ies))\b[\s\S]{0,150}\b(?:apply|govern|bind|have)\b[\s\S]{0,80}\??$/iu,
    /^under\s+what\s+(?:requirements?|rules?)\s+(?:may|can|should|must)\s+whoever\b[\s\S]{0,150}\??$/iu,
    /^(?:millin\w*|millis\w*|mis)\s+(?:[\p{L}-]+\s+){0,2}[\p{L}-]*(?:kohustus|reegl|õigus|oigus|nõu[ed]|nou[ed]|vastutus)\w*\s+(?:on|kehtib|kehtivad|lasub)\b[\s\S]{0,150}\??$/iu,
  ].some((pattern) => pattern.test(text.trim()))
    && !reviewedOpenRolePolicyHasPrivateResidual
    && !reviewedOpenRolePolicyHasEmbeddedNamedSubject
    && !CADASTRE_PATTERN.test(text)
    && !/\b(?:name|identity|identify|disclose|reveal|contact|phone|email|address|residence|nimi|identiteet|tuvasta|avalda\s+nimi|kontakt|telefon|aadress|elukoht|resideeri\w*)\b/iu.test(text)
    && !/(?<!\p{L})\p{Lu}[\p{Ll}'’-]{1,39}\s+\p{Lu}[\p{Ll}'’-]{1,39}(?!\p{L})/u.test(text);
  // Exact conceptual questions are safe to release immediately. The broader
  // open-role grammar must wait until the complete private-person classifier
  // has run: otherwise an innocuous duty prefix can hide a lowercase name,
  // residence question or ownership clause in its bounded suffix.
  // A role-level compliance question does not ask who the owner is. Keep the
  // exemption to obligation wording and withdraw it as soon as a personal
  // field or concrete cadastral identifier appears.
  const genericOwnerComplianceQuestion = /\b(?:kas|mida|millal|kuidas)\b[\s\S]{0,40}\b(?:maa|metsa|kinnistu)?omanik\w*\s+(?:peab|tohib|võib|voib|võiks|voiks|kohustub)\b/iu.test(text);
  const reviewedOwnerComplianceQuestion = [
    /^(?:kas\s+)?(?:maa|metsa|kinnistu)?omanik\w*\s+peab\s+(?:oma\s+nimel\s+registreeritud\s+)?puurkaevu\s+registrisse\s+kandma\??$/iu,
    /^(?:kas\s+)?(?:maa|metsa|kinnistu)?omanik\w*\s+peab\s+esitama\s+metsateatise\??$/iu,
    /^(?:kas\s+)?(?:maa|metsa|kinnistu)?omanik\w*\s+peab\s+oma\s+nimekirja\s+kaitsealustest\s+liikidest\s+esitama\??$/iu,
  ].some((pattern) => pattern.test(text.trim()));
  // These whole-query forms ask what a generic asset role must do, not who
  // fills that role. Anchoring the complete wording keeps appended names,
  // contacts, identifiers and identity requests outside the exemption.
  const reviewedGenericRoleComplianceQuestion = [
    /^(?:millised|mis)\s+(?:(?:keskkonna)?õigused(?:\s+ja\s+(?:keskkonna)?kohustused)?|(?:keskkonna)?kohustused|nõuded|reeglid)\s+on\s+(?:(?:naaber|naabri)?kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|metsa(?:kinnistu|maa))\s+(?:kasutajal|valdajal|haldajal|omanikul|õigustatud\s+isikul|vastutaval\s+isikul)\??$/iu,
    /^(?:millised|mis)\s+(?:õigused|kohustused|nõuded|reeglid)\s+kehtivad\s+(?:(?:naaber|naabri)?kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|metsa(?:kinnistu|maa))\s+(?:kasutajale|valdajale|haldajale|omanikule|õigustatud\s+isikule|vastutavale\s+isikule)\??$/iu,
    /^kuidas\s+(?:saab|peab)\s+(?:(?:naaber|naabri)?kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|metsa(?:kinnistu|maa))\s+(?:kasutaja|valdaja|haldaja|omanik|õigustatud\s+isik|vastutav\s+isik)\s+(?:(?:täita|järgida)\s+(?:oma\s+)?(?:keskkonna)?(?:kohustusi|nõudeid|reegleid)|(?:keskkonna)?(?:kohustusi|nõudeid|reegleid)\s+(?:täitma|järgima))\??$/iu,
    /^(?:kinnistu|maa|metsa)omaniku\s+(?:üldised\s+)?(?:(?:keskkonna)?õigused(?:\s+ja\s+(?:keskkonna)?kohustused)?|(?:keskkonna)?kohustused|nõuded|reeglid)(?:\s+looduskaitsealal)?\.?$/iu,
    /^what\s+(?:environmental\s+)?(?:requirements?|rules?|rights?|dut(?:y|ies)|obligations?|responsibilit(?:y|ies))\s+(?:apply\s+to|govern)\s+(?:people|persons?|individuals?)\s+(?:managing|administering|operating|using|occupying|leasing|renting|maintaining|stewarding)\s+(?:(?:forest|woodland|land)\s+)?(?:property|parcel|plot|land|forest|woodland|farm|well|borehole|building)s?\??$/iu,
    /^(?:millised|mis)\s+on\s+(?:(?:naaber|naabri)?kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|metsa(?:kinnistu|maa))\s+(?:kasutaja|valdaja|haldaja|omaniku|õigustatud\s+isiku|vastutava\s+isiku)\s+(?:üldised\s+)?(?:(?:keskkonna)?õigused|(?:keskkonna)?kohustused|nõuded|reeglid)\??$/iu,
  ].some((pattern) => pattern.test(text.trim()));
  const reviewedPublicAssetRoleQuestion = [
    /^kes\s+on\s+(?:(?:riigi|avaliku|munitsipaal|omavalitsuse|linna|valla)\s*|(?:riigi|avaliku)\s+omandis\s+(?:olev\w*\s+)?|riigile\s+kuuluv\w*\s+|riigimetsa\s+)(?:metsa|metsamaa|maa|kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|hoone)\w*\s+(?:kasutaja|valdaja|haldaja|omanik|operaator|käitaja|õigustatud\s+isik|vastutav\s+isik)\??$/iu,
    /^kes\s+(?:haldab|kasutab|valdab|omab|majandab|kontrollib)\s+(?:(?:riigi|avalikku?|munitsipaal|omavalitsuse|linna|valla)\s*|(?:riigi|avalikus?)\s+omandis\s+(?:olev\w*\s+)?|riigile\s+kuuluv\w*\s+|riigimetsa\s+)(?:metsa|metsamaa|maa|kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|hoone)\w*\??$/iu,
    /^kes\s+vastutab\s+(?:(?:riigi|avaliku|munitsipaal|omavalitsuse|linna|valla)\s*|(?:riigi|avalikus?)\s+omandis\s+(?:olev\w*\s+)?|riigile\s+kuuluv\w*\s+|riigimetsa\s+)(?:metsa|metsamaa|maa|kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|hoone)\w*\s+eest\??$/iu,
  ].some((pattern) => pattern.test(text.trim()));
  const reviewedTemporalFireInformationQuestion = [
    /^where\s+is\s+(?:the\s+)?(?:today|tomorrow)(?:'s|’s)?\s+(?:forest\s+)?fire[-\s]+(?:danger|risk)\s+(?:index|forecast)(?:\s+(?:available|published))?\??$/iu,
    /^where\s+can\s+(?:the\s+)?(?:today|tomorrow)(?:'s|’s)?\s+(?:forest\s+)?fire[-\s]+(?:danger|risk)\s+(?:index|forecast)\s+be\s+found\??$/iu,
  ].some((pattern) => pattern.test(text.trim()));
  const reviewedNonIdentityEnvironmentalAssetQuestion = reviewedTemporalFireInformationQuestion || [
    /^avalik\w*\s+puurkaev\w*\s+ja\s+põhjave\w*\s+seire\w*\.?$/iu,
    /^kuidas\s+hinnata\s+naaberkinnistu\w*\s+mõju\s+avalikule\s+veekogu\w*\??$/iu,
    /^naaberkinnistu\w*\s+keskkonnamõju\w*\s+avalikule\s+jõe\w*\.?$/iu,
    /^naaberkinnistu\w*\s+ja\s+veekogu\w*\s+kaitsevööndi\w*\s+(?:reeglid|nõuded)\.?$/iu,
    /^kuidas\s+võrrelda\s+naaberkinnistu\w*\s+avalik\w*\s+keskkonnaandm\w*\??$/iu,
    /^naaberkinnistu\w*\s+maakasutuse\w*\s+mõju\s+loodusele\.?$/iu,
    /^naaberkinnistu\w*\s+keskkonnamõju\w*\s+võrdlus\s+ilma\s+omanikuta\.?$/iu,
    /^naaberkinnistu\w*\s+(?:keskkonna)?mõju\w*\s+emajõe\w*\s+elupaik\w*\.?$/iu,
    /^public\s+(?:environmental\s+)?register\s+(?:help|support)\s+contact\s+for\s+(?:borehole|forest|woodland|water|air|waste|nature|environmental)\s+data\.?$/iu,
    /^pruunkaru\w*\s+elupaiga\w*\s+kirjeldus\w*\s+eesti\w*\.?$/iu,
    /^kes\s+avaldab\s+juhis\w*\s+kinnistu\w*\s+sademeve\w*\s+vähendamis\w*\??$/iu,
    /^kuidas\s+muudab\s+metsakinnistu\w*\s+kuivendus\w*\s+elupaik\w*\s+seisund\w*\??$/iu,
    /^(?:who|which\s+(?:agency|organization))\s+(?:is\s+responsible\s+for|manages?|administers?|oversees?)\s+(?:environmental|land[-\s]+use|forest|water|waste|climate)\s+policy\s+in\s+estonia\??$/iu,
    /^(?:what|which)\s+(?:agency|organization)\s+(?:manages?|administers?|operates?|oversees?|evaluates?|studies?)\s+(?:groundwater|surface[-\s]+water|water|air|biodiversity|environmental|forest|land[-\s]+use)\s+(?:monitoring|policy|research|assessment|impacts?|effects?)\s+(?:on|in|near|across)\s+(?:agricultural|forest|public|protected)\s+land\??$/iu,
    /^(?:who|what|which)\s+(?:public\s+)?(?:agency|organization|authority|institution)\s+(?:coordinates?|organizes?|organises?|runs?|administers?|manages?|oversees?)\s+(?:coastal[-\s]+water|marine|groundwater|surface[-\s]+water|water|air|biodiversity|species|forest|environmental)\s+(?:monitoring|sampling|research|assessment|programme|program)\??$/iu,
    /^(?:how\s+is|what\s+is)\s+(?:the\s+)?(?:sensitiv\w*|confidential\w*|protection|masking|generali[sz]ation)\s+of\s+(?:an?\s+|the\s+)?(?:protected[-\s]+plant|rare[-\s]+plant|protected\s+species|species)\s+(?:(?:observation|occurrence|nesting|habitat)\s+)?location\s+(?:handled|managed|protected|masked|generalized|generalised|published|shared)\??$/iu,
    /^how\s+should\s+(?:the\s+)?(?:sensitiv\w*|confidential\w*|protection|masking|generali[sz]ation)\s+of\s+(?:an?\s+|the\s+)?(?:protected[-\s]+plant|rare[-\s]+plant|protected\s+species|species)\s+(?:(?:observation|occurrence|nesting|habitat)\s+)?location\s+be\s+(?:handled|managed|protected|masked|generalized|generalised|published|shared)\??$/iu,
    /^(?:milline|mis)\s+on\s+(?:keskkonnaamet|keskkonnaagentuur|kliimaministeerium)\w*\s+(?:pädevus|padev\w*|volitus\w*|vastutus\w*)\s+(?:kaitsealuste\s+liikide\s+elupaikade|natura\s+alade|looduskaitse)\s+(?:puhul|osas|küsimuses)\??$/iu,
    /^kuidas\s+leida\s+riigiasutuse\s+avalik\w*\s+kontakt\w*\s+ilma\s+isikuandm\w*\s+kuvamata\??$/iu,
    /^kuidas\s+eristada\s+ametlik\w*\s+pressikontakt\w*\s+eraisiku\s+kontakt\w*\??$/iu,
    /^kuidas\s+leida\s+natura\s+ala\s+kaitsekorralduskava\s+kontaktpunkt\w*\??$/iu,
    /^kust\s+leiab\s+avalik\w*\s+veekogu\w*\s+seire\w*\s+korraldaja\s+kontaktroll\w*\??$/iu,
    /^kas\s+(?:liigi\s+)?vaatlus\w*\s+asukoht\w*\s+[\s\S]{0,40}\bavalik\w*\s+kaard\w*\s+ruud(?:ista|usta)\w*\??$/iu,
    /^kas\s+keskkonnainfo\w*\s+avalikustamisel\s+piisab\s+objekti\s+koordinaat\w*\s+üldista\w*\??$/iu,
    /^kuidas\s+hinnata\s+elupaiga\s+asukohateabe\s+avaldamise\s+proportsionaals\w*\??$/iu,
    /^kas\s+avalik\w*\s+loodusandm\w*\s+kaard\w*\s+võib\s+näidata\s+liigi\s+elupaiga\s+piirkond\w*\??$/iu,
    /^how\s+can\s+i\s+find\s+(?:an?\s+)?public\s+agency\s+contact\s+without\s+exposing\s+personal\s+data\??$/iu,
    /^how\s+can\s+(?:an?\s+)?official\s+press\s+contact\s+be\s+distinguished\s+from\s+(?:an?\s+)?private\s+contact\??$/iu,
    /^how\s+can\s+i\s+find\s+the\s+contact\s+point\s+for\s+(?:an?\s+)?natura\s+site\s+management\s+plan\??$/iu,
    /^how\s+can\s+i\s+contact\s+the\s+environmental[-\s]+data\s+api\s+administrator\??$/iu,
    /^where\s+is\s+the\s+public\s+contact\s+role\s+for\s+surface[-\s]+water\s+monitoring\??$/iu,
    /^which\s+agency\s+guides?\s+generali[sz]ation\s+of\s+(?:an?\s+)?sensitive\s+nesting[-\s]+site\s+location\??$/iu,
    /^should\s+(?:an?\s+)?observation\s+location\s+be\s+shown\s+as\s+(?:an?\s+)?grid\s+cell\s+on\s+(?:an?\s+)?public\s+map\??$/iu,
    /^is\s+generali[sz]ing\s+coordinates\s+enough\s+when\s+publishing\s+environmental\s+information\??$/iu,
    /^how\s+should\s+proportionality\s+of\s+habitat[-\s]+location\s+disclosure\s+be\s+assessed\??$/iu,
  ].some((pattern) => pattern.test(text.trim()));
  const reviewedComplianceQuestion = reviewedOwnerComplianceQuestion
    || reviewedGenericRoleComplianceQuestion
    || reviewedPublicAssetRoleQuestion
    || reviewedNonIdentityEnvironmentalAssetQuestion;
  const complianceWords = text.match(/[\p{L}\p{N}]+/gu) || [];
  const requestsOwnerIdentityOrContact = complianceWords.some((word) => (
    PRIVATE_CONTACT_FIELD_PATTERN.test(word)
    || PRIVATE_PERSON_ATTRIBUTE_TOKEN_PATTERN.test(word)
  )) || PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    || PRIVATE_POSTAL_FIELD_PATTERN.test(text)
    || /(?<!\p{L})(?:oma|isiku|omaniku)\s+(?:(?:nimi|nime)(?!\p{L})|identite(?:et|edi|eti)\w*(?!\p{L}))/iu.test(text)
    || PERSONAL_LOOKUP_PATTERNS.some((pattern) => pattern.test(text));
  if (genericOwnerComplianceQuestion
    && requestsOwnerIdentityOrContact
    && !reviewedConceptualPublicQuestion) return true;
  const hasMixedScriptWord = (text.match(/\p{L}+/gu) || []).some((word) => (
    /\p{Script=Latin}/u.test(word)
      && /[^\p{Script=Latin}\p{M}]/u.test(word)
  ));
  const hasEstonianRegulatoryBuildingContext = ESTONIAN_REGULATORY_BUILDING_TOKEN_PATTERN.test(normalize(text))
    || ESTONIAN_COMPOUND_BUILDING_ASSET_PATTERN.test(text)
    || ESTONIAN_PRIVATE_DWELLING_TOKEN_PATTERN.test(text);
  const hasPrivateAssetContext = hasEstonianRegulatoryBuildingContext
    || /(?<!\p{L})(?:katastri\w*|kinnist\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|metsamaa\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*|puurkaev\w*|aadress\w*|property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|forest|woodland)(?!\p{L})/iu.test(text);
  // A private-asset query containing a Latin/non-Latin mixed token is
  // ambiguous by construction (for example Armenian/Cyrillic letters inside
  // "owns"). Fail closed instead of relying on an endless confusable list.
  if (hasMixedScriptWord
    && hasPrivateAssetContext
    && !reviewedConceptualPublicQuestion) return true;
  const matchesEnglishPersonalPattern = ENGLISH_PERSONAL_LOOKUP_PATTERNS
    .some((pattern) => pattern.test(text));
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  const sensitiveIndex = words.findIndex((word) => (
    PRIVATE_CONTACT_FIELD_PATTERN.test(word)
    || PRIVATE_PERSON_ATTRIBUTE_TOKEN_PATTERN.test(word)
  ));
  const hasSensitivePersonalAttribute = PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text);
  const hasPrivatePostalField = PRIVATE_POSTAL_FIELD_PATTERN.test(text);
  const textWithoutReviewedMunicipalityOrganization = removeFirstReviewedMunicipalityOrganizationName(text);
  const textWithoutExactKnownOrganizations = PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS.reduce(
    (remaining, pattern) => remaining.replace(pattern, " "),
    textWithoutReviewedMunicipalityOrganization,
  );
  const hasExactKnownPublicOrganization = normalize(textWithoutExactKnownOrganizations) !== normalize(text);
  // Once an exact organization anchor has been removed, keep the remainder
  // intact for identity analysis. Running the generic "Proper Name Office"
  // cleanup over that remainder would erase a person in phrases such as
  // "Environment Board Priit office email". Generic organization recognition
  // remains available when no exact catalogue organization is present.
  const textWithoutKnownOrganizations = hasExactKnownPublicOrganization
    ? textWithoutExactKnownOrganizations
    : removeFirstPublicOrganizationName(text);
  const hasKnownPublicOrganization = normalize(textWithoutKnownOrganizations) !== normalize(text);
  // A verified organization span has already been removed above. In the
  // residual text, two adjacent title-cased tokens followed by a personal
  // contact field are therefore a named-person request even when either token
  // also happens to be a place or ecological word ("Pärnu Mets telefon").
  // Token positions, rather than whitespace, keep punctuation variants inside
  // the same fail-closed rule.
  const residualContactNameMatches = [...textWithoutKnownOrganizations
    .matchAll(/[\p{L}]+(?:[-'’][\p{L}]+)*/gu)];
  const residualContactNameTokens = residualContactNameMatches.map((match) => match[0]);
  const isTitleCasedIdentityToken = (token) => /^\p{Lu}[\p{Ll}'’-]{1,39}$/u.test(token)
    && !PERSON_CONTEXT_STOPWORD_PATTERN.test(token);
  const hasCapitalizedNameWithPrivateContact = residualContactNameTokens.some((token, index, tokens) => (
    isTitleCasedIdentityToken(token)
      && isTitleCasedIdentityToken(tokens[index + 1] || "")
      && tokens.slice(index + 2, index + 5)
        .some((candidate) => NAMED_PERSON_DIRECT_CONTACT_FIELD_PATTERN.test(candidate))
  ));
  const hasStructuredEcologicalUnitContact = residualContactNameTokens.some((token, index, tokens) => (
    isTitleCasedIdentityToken(token)
      && isTitleCasedIdentityToken(tokens[index + 1] || "")
      && ECOLOGICAL_SUBJECT_PATTERN.test(token)
      && ECOLOGICAL_SUBJECT_PATTERN.test(tokens[index + 1] || "")
      && /^(?:biodivers\w*|conserv\w*|ecolog\w*|elupai[kg]\w*|elurikk\w*|habitat\w*|kaitse\w*|lii[kg]\w*|monitoring\w*|seire\w*|species\w*)$/iu.test(tokens[index + 2] || "")
      && /^(?:bureau|department|desk|office|service|team|unit|büroo\w*|buroo\w*|osakon\w*|teenistus\w*|üksus\w*|uksus\w*)$/iu.test(tokens[index + 3] || "")
      && tokens.slice(index + 4, index + 7)
        .some((candidate) => NAMED_PERSON_DIRECT_CONTACT_FIELD_PATTERN.test(candidate))
  ));
  if (hasCapitalizedNameWithPrivateContact
    && !hasKnownPublicOrganization
    && !hasStructuredEcologicalUnitContact) return true;
  const hasExplicitCapitalizedPersonName = /(?<!\p{L})\p{Lu}[\p{Ll}'’-]{1,39}(?:\s+\p{Lu}[\p{Ll}'’-]{1,39}){1,2}(?!\p{L})/u.test(textWithoutKnownOrganizations);
  const hasInstitutionalContactChannel = INSTITUTIONAL_CONTACT_CHANNEL_PATTERN.test(text)
    || PRIVATE_POSTAL_FIELD_PATTERN.test(text);
  const contactAssociationText = textWithoutKnownOrganizations
    .replace(/[\p{P}\p{S}\p{Z}\p{C}\p{M}_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const explicitPrivateAssetContactAssociation = [
    /\b(?:private|family|household|personal|neighbor(?:ing)?|neighbour(?:ing)?|adjacent)\s+(?:property|parcel|plot|lot|estate|land|unit|house|home|farm|well|borehole|building|dwelling|cottage|premises|site|installation|landholding|holding|forest|woodland)\b(?:\s+[\p{L}\p{N}]{1,30}){0,16}\s+(?:contact(?:\s+(?:details?|information))?|phone|telephone|email|mailbox|address)\b/iu,
    /\b(?:era|eraisiku|perekonna|isiklik|naabri|kõrval)\w*\s+(?:kinnist|maa(?:u|ü)ksus|maat(?:ü|u)k|maja|kaev|puurkaev|hoone)\w*\b(?:\s+[\p{L}\p{N}]{1,30}){0,16}\s+(?:kontakt\w*|telefoni?\w*|e\s+post\w*|meil\w*|postkast\w*|aadress\w*)\b/iu,
    /\b(?:erakaev|erakinnist|eramaa)\w*\b(?:\s+[\p{L}\p{N}]{1,30}){0,16}\s+(?:kontakt\w*|telefoni?\w*|e\s+post\w*|meil\w*|postkast\w*|aadress\w*)\b/iu,
    /\b(?:contact\s+(?:details?|information)|phone(?:\s+number)?|telephone(?:\s+number)?|email(?:\s+address)?|mailbox|postal\s+address)\s+(?:for|of)\s+(?:the\s+)?(?:private|family|household|personal|neighbor(?:ing)?|neighbour(?:ing)?|adjacent)\s+(?:property|parcel|plot|lot|estate|land|unit|house|home|farm|well|borehole|building|dwelling|cottage|premises|site|installation|landholding|holding|forest|woodland)$/iu,
  ].some((pattern) => pattern.test(contactAssociationText));
  if (explicitPrivateAssetContactAssociation && !reviewedConceptualPublicQuestion) return true;
  // Contact details for a reviewed public organization are public service
  // navigation, not a private-person lookup. Withdraw the exemption whenever
  // a second person, private/neighbor asset, cadastral identifier, postal
  // field, or sensitive personal attribute is also present.
  const reviewedPublicOrganizationContactCandidate = hasKnownPublicOrganization
    && hasInstitutionalContactChannel
    && !CADASTRE_PATTERN.test(text)
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    && !/\b(?:era|naaber|naabri|kõrval)\w*\s+(?:kinnist|maa|maatü|puurkaev|hoone)\w*\b/iu.test(textWithoutKnownOrganizations);
  const describedNamedRoleAsset = new RegExp(
    String.raw`\b(?:environmental\s+records?\s+describe|registry\s+records?\s+describe|according\s+to\s+the\s+filing[,]?)\s+[\p{L}'’.-]{2,40}\s+[\p{L}'’.-]{2,40}\s+(?:(?:is\s+)?entrusted\s+with|as\s+(?:a\s+)?(?:caretaker|custodian|manager|operator|steward)\s+(?:for|of))\s+(?:an?\s+|the\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}\b`,
    "iu",
  ).test(textWithoutKnownOrganizations);
  const trailingNamedRoleAsset = new RegExp(
    String.raw`\b(?:operational\s+)?(?:custodian|caretaker|manager|operator|steward)\s+for\s+(?:an?\s+|the\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}\b[\s\S]{0,55}\bis\s+[\p{L}'’.-]{2,40}\s+[\p{L}'’.-]{2,40}(?:[.?!]|$)`,
    "iu",
  ).test(textWithoutKnownOrganizations);
  if ((describedNamedRoleAsset || trailingNamedRoleAsset)
    && !reviewedConceptualPublicQuestion) return true;
  if (!reviewedTemporalFireInformationQuestion
    && !reviewedConceptualPublicQuestion
    && (ENGLISH_NAMED_POSSESSIVE_ASSET_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_NAMED_ASSET_ASSOCIATION_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_ASSET_TO_PERSON_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_ASSET_IN_PERSON_NAME_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_PERSON_TO_ASSET_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_PERSON_ROLE_ASSET_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_PERSON_APPOSITIVE_ROLE_ASSET_PATTERN.test(textWithoutKnownOrganizations))) return true;
  const englishWhereResidenceMatch = textWithoutKnownOrganizations.match(ENGLISH_WHERE_RESIDENCE_PATTERN);
  const englishWhereFoundMatch = textWithoutKnownOrganizations.match(ENGLISH_WHERE_FOUND_PATTERN);
  const englishWhereLocatedMatch = textWithoutKnownOrganizations.match(ENGLISH_WHERE_LOCATED_PATTERN);
  const englishLocatePersonMatch = textWithoutKnownOrganizations.match(ENGLISH_LOCATE_PERSON_PATTERN);
  const englishSubjectIsEcological = (subject) => {
    const subjectWords = subject?.match(/[\p{L}]+/gu) || [];
    const meaningfulWords = subjectWords.filter((word) => !PERSON_CONTEXT_STOPWORD_PATTERN.test(word));
    const explicitlyEcological = subjectWords.length > 0 && subjectWords.every((word) => (
      ECOLOGICAL_SUBJECT_PATTERN.test(word)
      || ECOLOGICAL_MODIFIER_PATTERN.test(word)
      || PERSON_CONTEXT_STOPWORD_PATTERN.test(word)
    ));
    const ecologicalCommonName = meaningfulWords.length >= 2
      && (ECOLOGICAL_SUBJECT_PATTERN.test(meaningfulWords[0])
        || ECOLOGICAL_MODIFIER_PATTERN.test(meaningfulWords[0]))
      && meaningfulWords.slice(1).every((word) => word === word.toLocaleLowerCase("en"));
    return explicitlyEcological || ecologicalCommonName;
  };
  const englishWhereResidenceIsEcological = Boolean(englishWhereResidenceMatch)
    && englishSubjectIsEcological(englishWhereResidenceMatch[1]);
  const englishNamedResidenceQuestion = Boolean(englishWhereResidenceMatch)
    && !englishWhereResidenceIsEcological;
  const englishNamedFoundQuestion = Boolean(englishWhereFoundMatch)
    && !englishSubjectIsEcological(englishWhereFoundMatch[1]);
  const englishNamedLocatedQuestion = Boolean(englishWhereLocatedMatch)
    && !englishSubjectIsEcological(englishWhereLocatedMatch[1]);
  const englishLocateNamedPerson = Boolean(englishLocatePersonMatch)
    && !englishSubjectIsEcological(englishLocatePersonMatch[1]);
  const administrativeFragment = (word) => [...ADMIN_CONTEXT_ROOTS].some((root) => textHasQueryRoot(word, root));
  const domainFragment = (word) => {
    const normalizedWord = normalize(word);
    if (DOMAIN_ROOTS.has(topicRoot(normalizedWord))) return true;
    return [...DOMAIN_ROOTS].some((root) => queryRootVariants(root).some((variant) => {
      const normalizedVariant = normalize(variant);
      return normalizedWord === normalizedVariant
        || (normalizedVariant.length >= 4 && normalizedWord.startsWith(normalizedVariant));
    }));
  };
  // Postal-field phrases are sensitive predicates, not identity material.
  // Removing the complete phrase prevents words such as "details" from
  // synthesizing a person beside a legitimate public organization or policy.
  const identityText = removeExplicitHyphenatedReviewedCountyNames(
    textWithoutKnownOrganizations.replace(PRIVATE_POSTAL_FIELD_PATTERN, " "),
  );
  const rawIdentityFragments = (identityText.match(/[\p{L}\p{N}]+/gu) || [])
    .map((word) => word.toLocaleLowerCase("et"))
    .filter(Boolean);
  const identityFragments = rawIdentityFragments
    .filter((word) => !PRIVATE_CONTACT_FIELD_PATTERN.test(word))
    .filter((word) => !PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN.test(word))
    .filter((word) => !PERSON_CONTEXT_STOPWORD_PATTERN.test(word))
    .filter((word) => !PUBLIC_ORGANIZATION_PATTERN.test(word))
    .filter((word) => !PUBLIC_CONTACT_ROLE_PATTERN.test(word))
    .filter((word) => !/^\d+$/u.test(word))
    .filter(Boolean);
  const isSuspiciousIdentityFragment = (word) => !PRIVATE_CONTACT_FIELD_PATTERN.test(word)
    && !PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN.test(word)
    && !PERSON_CONTEXT_STOPWORD_PATTERN.test(word)
    && !PUBLIC_ORGANIZATION_PATTERN.test(word)
    && !PUBLIC_CONTACT_ROLE_PATTERN.test(word)
    && !/^\d+$/u.test(word)
    && !administrativeFragment(word)
    && !domainFragment(word)
    && !ECOLOGICAL_SUBJECT_PATTERN.test(word)
    && !ECOLOGICAL_MODIFIER_PATTERN.test(word);
  const isPotentialPersonNameToken = (word) => !PRIVATE_CONTACT_FIELD_PATTERN.test(word)
    && !PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN.test(word)
    && !PERSON_CONTEXT_STOPWORD_PATTERN.test(word)
    && !PUBLIC_ORGANIZATION_PATTERN.test(word)
    && !PUBLIC_CONTACT_ROLE_PATTERN.test(word)
    && !/^\d+$/u.test(word)
    && !administrativeFragment(word);
  const isEcologicalCommonNamePair = (first, second) => (
    ECOLOGICAL_SUBJECT_PATTERN.test(second)
      && (ECOLOGICAL_MODIFIER_PATTERN.test(first)
        || ECOLOGICAL_SUBJECT_PATTERN.test(first))
  );
  const hasAdjacentNameShapedPair = rawIdentityFragments.some((word, index) => {
    const next = rawIdentityFragments[index + 1];
    return Boolean(next)
      && isPotentialPersonNameToken(word)
      && isPotentialPersonNameToken(next)
      && !isEcologicalCommonNamePair(word, next);
  });
  const suspiciousIdentityFragments = identityFragments.filter(isSuspiciousIdentityFragment);
  const hasAdjacentSuspiciousPair = rawIdentityFragments.some((word, index) => {
    const next = rawIdentityFragments[index + 1];
    return Boolean(next) && isSuspiciousIdentityFragment(word) && isSuspiciousIdentityFragment(next);
  });
  const hasAdjacentUnknownEcologicalPair = rawIdentityFragments.some((word, index) => {
    const next = rawIdentityFragments[index + 1];
    return Boolean(next)
      && ((isSuspiciousIdentityFragment(word) && ECOLOGICAL_SUBJECT_PATTERN.test(next))
        || (ECOLOGICAL_SUBJECT_PATTERN.test(word) && isSuspiciousIdentityFragment(next)));
  });
  const hasAdjacentBareEcologicalPair = rawIdentityFragments.some((word, index) => {
    const next = rawIdentityFragments[index + 1];
    return Boolean(next)
      && ECOLOGICAL_SUBJECT_PATTERN.test(word)
      && ECOLOGICAL_SUBJECT_PATTERN.test(next)
      && !ECOLOGICAL_MODIFIER_PATTERN.test(word)
      && !ECOLOGICAL_MODIFIER_PATTERN.test(next);
  });
  const hasHumanMarker = /\b(?:eraisik|inimene|isiku|inimese|elaniku|residendi)\w*\b/iu.test(text);
  const hasSensitiveContact = hasInstitutionalContactChannel
    || /\b(?:residence|residentsus\w*|elukoh\w*|kodukoht\w*)\b/iu.test(text)
    || hasPrivatePostalField;
  const hasAddressAndPresence = /\baadress\w*\b[\s\S]{0,100}\b(?:elab|peatub|resideerib|paikneb)\b/iu.test(text);
  const residenceVerbIndex = words.findIndex((word) => /^(?:elab|elava|resideeri\w*|resideeru\w*|peatub|viibib|asub|paikneb|ööbib|oobib|live[sd]?|living|reside[sd]?|residing|stay(?:s|ing)?|occup(?:y|ies|ied|ying))$/iu.test(word));
  const hasResidenceContext = residenceVerbIndex >= 0
    || /\bkus\b[\s\S]{0,100}\b(?:elab|resideeri\w*|resideeru\w*)\b/iu.test(text)
    || /\bwhere\b[\s\S]{0,100}\b(?:live|reside|stay)\b/iu.test(text);
  const hasFusedIdentityShape = suspiciousIdentityFragments.some((word) => word.length >= 8);
  const hasFusedPrivateAssetIdentity = hasFusedIdentityShape
    && hasPrivateAssetContext
    && (PRIVATE_ASSET_LOOKUP_ACTION_PATTERN.test(text)
      || /(?<!\p{L})(?:registr\w*|registry|register)(?!\p{L})/iu.test(text));
  const hasPrivateAssetIdentity = hasAdjacentNameShapedPair
    || hasAdjacentSuspiciousPair
    || hasAdjacentUnknownEcologicalPair
    || hasAdjacentBareEcologicalPair
    || hasFusedPrivateAssetIdentity;
  const hasNamedIdentity = hasAdjacentNameShapedPair
    || suspiciousIdentityFragments.length >= 2
    || hasAdjacentUnknownEcologicalPair
    || (suspiciousIdentityFragments.length >= 1 && hasKnownPublicOrganization)
    || (suspiciousIdentityFragments.length >= 1 && hasSensitiveContact)
    || (hasAdjacentBareEcologicalPair && (hasSensitiveContact || hasKnownPublicOrganization))
    || (hasResidenceContext && hasFusedIdentityShape);
  const publicOrganizationContactResidualTokens = textWithoutKnownOrganizations.match(/[\p{L}\p{N}]+/gu) || [];
  const publicOrganizationContactSafeToken = /^(?:a|a?adress\w*|about|adaptation|address\w*|advice|advisory|air|ala\w*|ametlik\w*|andm\w*|andmev[äa]rav\p{L}*|are|area\w*|avalik\w*|biodivers\w*|borehole\w*|branch|büroo\w*|buroo\w*|by|can|carbon\w*|centre\w*|center\w*|channels?|circular|circularity|climate\w*|coastal\w*|concerning|conserv\w*|contact\w*|counter|cover\w*|customer\w*|data\w*|decarbonis\w*|decarboniz\w*|department\w*|departmental\w*|desk|details?|directorate\w*|division|do|duty|e|ecolog\w*|economy|edastamis\w*|elektr\w*|email\w*|elurikkus\w*|emission\w*|energia\w*|energy\w*|enquir\w*|environment\w*|estuar\w*|finance\w*|find|for|forest\w*|front|general|get|geothermal\w*|greenhouse\w*|groundwater\w*|guidance\w*|habitat\w*|heide\w*|heritage\w*|hoiatus\w*|hooldus\w*|how|hydrogen\w*|hydrolog\w*|i|[\p{L}-]*info\w*|infrastructure\w*|inquir\w*|is|ja|jaoks|juhis\w*|jõg\w*|kaar[dt]\w*|kaev\w*|kaitseal\w*|kaitstav\w*|kanal\w*|kasvuhoonegaas\w*|klienditeenindus\w*|klienditugi\w*|klienditoe\w*|kliimapoliitik\w*|kohta|kus|(?:üld|uld|yld)?kontakt\w*|kuidas|küsimus\w*|land|leida|litter\w*|loa\w*|loodus\w*|maakasutus\w*|mailbox\w*|margala\w*|marine\w*|maps?|matka\w*|meadow\w*|media|mets\w*|modell\w*|monitoring|municipal\w*|m[äa]rgala\w*|m[üu]ra\w*|national|natura|nature\w*|noise\w*|number|nõustamis\w*|noustamis\w*|office\w*|on|overall|peat\w*|permit\w*|permitting|phone\w*|p[äa]ikese\w*|p[õo]hjave\w*|policy|portal\w*|post|postiaadress\w*|[\p{L}-]*postikanal\w*|[\p{L}-]*postkast\w*|postal\w*|press\w*|private|program\w*|programme\w*|property|protected|public\w*|pärand\w*|quality\w*|rannikuve\w*|rakendamis\w*|reach|reception|recovery\w*|regional\w*|renewable\w*|reostusteate\w*|restoration\w*|riigimets\w*|ringmajandus\w*|river\w*|saamiseks|section|seire\w*|service\w*|soil\w*|solar\w*|species\w*|state|stewardship\w*|support\w*|s[üu]sinik\w*|table|taastamis\w*|taastuvenergia\w*|team|teabe\w*|teenindus\w*|telefoni?\w*|telephone\w*|the|turba\w*|tuule\w*|[üu]leujut\w*|unit|use|used|valvebüroo\w*|valveburoo\w*|visitor\w*|water\w*|watershed\w*|waste\w*|well|what|where|which|wind\w*|wetland\w*|woodland\w*|working|ühine|uhine|üldtelefoni?\w*|uldtelefoni?\w*|yldtelefoni?\w*)$/iu;
  const publicOrganizationContactExplicitPerson = /\b(?:person|individual|employee|staff\s+member|named\s+official|private\s+contact|isik\w*|inime\w*|eraisik\w*|ametnik\w*|töötaja\w*|tootaja\w*|spetsialist\w*)\b[\s\S]{0,55}\b(?:contact\w*|phone\w*|telephone\w*|email\w*|e-?post\w*|kontakt\w*|telefoni?\w*|meil\w*)\b/iu.test(textWithoutKnownOrganizations)
    || /\b(?:contact\w*|phone\w*|telephone\w*|email\w*|e-?post\w*|kontakt\w*|telefoni?\w*|meil\w*)\b[\s\S]{0,55}\b(?:person|individual|employee|staff\s+member|isik\w*|inime\w*|eraisik\w*|ametnik\w*|töötaja\w*|tootaja\w*|spetsialist\w*)\b/iu.test(textWithoutKnownOrganizations);
  const publicOrganizationContactUnitToken = /^(?:unit|office|desk|department|directorate|division|section|branch|team|centre|center|service|programme|program|counter|bureau|taskforce|observatory|secretariat|workgroup|group|coalition|alliance|partnership|consortium|initiative|project|hub|council|board|committee|commission|panel|forum|laboratory|lab|network|ministry|agency|authority|institute|university|museum|[\p{L}-]*(?:büroo|buroo|osakon|talitus|üksus|uksus|meeskon|keskus|teenistus|teabepunk|kontaktpunk|nõustamisla|noustamisla|sekretariaa|töö?rühm|too?ruhm|rühm|ruhm|grupp|koostööko|koostooko|võrgustik|vorgustik|liit|partnerlus|konsortsium|algatus|projekt|programm|nõukogu|noukogu|komisjon|komitee|paneel|foorum|labor)\w*)$/iu;
  const publicOrganizationContactDomainToken = /^(?:catalogue\w*|flood\w*|kliimapoliitik\w*|management\w*|mapping\w*|mulla\w*|natura\w*|official\w*|project\w*|protection\w*|renewal\w*|requests?|risk\w*|roles?|teenus\w*|warning\w*|(?:üld|uld|yld)?postkast\w*)$/iu;
  const publicOrganizationContactTopicLinkToken = /^(?:[\p{L}-]*(?:andm|seire|teenus|talitus|üksus|uksus|büroo|buroo|osakon|keskus|programm|projekt|portaal|portal)\w*|catalogue\w*|conserv\w*|data\w*|guidance\w*|habitat\w*|information\w*|management\w*|mapping\w*|monitoring\w*|office\w*|permit\w*|policy|programme\w*|project\w*|protection\w*|renewal\w*|requests?|restoration\w*|risk\w*|roles?|service\w*|taastamis\w*|unit\w*|warning\w*)$/iu;
  const isLexicallyReviewedPublicOrganizationContactWord = (candidate) => (
    publicOrganizationContactSafeToken.test(candidate)
      || publicOrganizationContactUnitToken.test(candidate)
      || publicOrganizationContactDomainToken.test(candidate)
  );
  const hasReviewedEcologicalDisambiguatorAt = (tokens, index) => {
    const first = tokens[index] || "";
    const second = tokens[index + 1] || "";
    const disambiguator = tokens[index + 2] || "";
    return ECOLOGICAL_SUBJECT_PATTERN.test(first)
      && ECOLOGICAL_SUBJECT_PATTERN.test(second)
      && /^(?:biodivers\w*|conserv\w*|ecolog\w*|elupai[kg]\w*|elurikk\w*|habitat\w*|kaitse\w*|lii[kg]\w*|monitoring\w*|seire\w*|species\w*)$/iu.test(disambiguator)
      && tokens.slice(index + 2, index + 7)
        .some((candidate) => publicOrganizationContactUnitToken.test(candidate));
  };
  const isReviewedPublicOrganizationContactWord = (candidate, index, tokens) => {
    if (isLexicallyReviewedPublicOrganizationContactWord(candidate)) return true;
    if (/^green\w*$/iu.test(candidate)
      && /^infrastructure\w*$/iu.test(tokens[index + 1] || "")) return true;
    if (publicOrganizationContactTopicLinkToken.test(candidate)) return true;
    if (REVIEWED_ESTONIAN_MUNICIPALITY_BASES.has(normalize(candidate))) {
      const previous = tokens[index - 1] || "";
      const next = tokens[index + 1] || "";
      if (PRIVATE_CONTACT_FIELD_PATTERN.test(previous)
        || PRIVATE_CONTACT_FIELD_PATTERN.test(next)) return true;
    }
    if (!domainFragment(candidate)) return false;
    const previous = tokens[index - 1] || "";
    const next = tokens[index + 1] || "";
    return publicOrganizationContactTopicLinkToken.test(candidate)
      || publicOrganizationContactTopicLinkToken.test(previous)
      || publicOrganizationContactTopicLinkToken.test(next)
      || hasReviewedEcologicalDisambiguatorAt(tokens, index)
      || hasReviewedEcologicalDisambiguatorAt(tokens, index - 1);
  };
  // Removing a verified organization name does not make every residual unit
  // phrase public. Two adjacent identity-shaped tokens beside a contact
  // channel remain private even when punctuation fused them in the input.
  const publicOrganizationContactHasNamedResidual = rawIdentityFragments.some((word, index) => {
    const next = rawIdentityFragments[index + 1];
    if (!next || (isReviewedPublicOrganizationContactWord(word, index, rawIdentityFragments)
      && isReviewedPublicOrganizationContactWord(next, index + 1, rawIdentityFragments))) return false;
    const wordIsUnreviewedIdentity = isSuspiciousIdentityFragment(word)
      && !isReviewedPublicOrganizationContactWord(word, index, rawIdentityFragments);
    const nextIsUnreviewedIdentity = isSuspiciousIdentityFragment(next)
      && !isReviewedPublicOrganizationContactWord(next, index + 1, rawIdentityFragments);
    return (wordIsUnreviewedIdentity && nextIsUnreviewedIdentity)
      || (wordIsUnreviewedIdentity && ECOLOGICAL_SUBJECT_PATTERN.test(next))
      || (ECOLOGICAL_SUBJECT_PATTERN.test(word) && nextIsUnreviewedIdentity)
      || (ECOLOGICAL_SUBJECT_PATTERN.test(word)
        && !isReviewedPublicOrganizationContactWord(next, index + 1, rawIdentityFragments))
      || (ECOLOGICAL_SUBJECT_PATTERN.test(next)
        && !isReviewedPublicOrganizationContactWord(word, index, rawIdentityFragments))
      || (ECOLOGICAL_SUBJECT_PATTERN.test(word) && ECOLOGICAL_SUBJECT_PATTERN.test(next));
  });
  // Preserve capitalization for person-shape detection, but remove only the
  // verified organization marker. The broader organization-name cleanup may
  // legitimately consume a title-cased unit and must not erase a person's
  // name before this privacy check.
  const structuredContactResidualWords = textWithoutKnownOrganizations.match(/\p{L}+/gu) || [];
  const normalizedStructuredContactResidualWords = structuredContactResidualWords
    .map((word) => word.toLocaleLowerCase("et"));
  const publicOrganizationContactHasStructuredCapitalizedName = structuredContactResidualWords.some((word, index) => {
    const next = structuredContactResidualWords[index + 1] || "";
    if (!/^\p{Lu}[\p{L}'’]{1,39}$/u.test(word)
      || !/^\p{Lu}[\p{L}'’]{1,39}$/u.test(next)
      || PUBLIC_ORGANIZATION_PATTERN.test(`${word} ${next}`)) return false;
    const reviewedDescriptorPair = isReviewedPublicOrganizationContactWord(
      normalizedStructuredContactResidualWords[index],
      index,
      normalizedStructuredContactResidualWords,
    ) && isReviewedPublicOrganizationContactWord(
      normalizedStructuredContactResidualWords[index + 1],
      index + 1,
      normalizedStructuredContactResidualWords,
    );
    if (reviewedDescriptorPair) return false;
    return structuredContactResidualWords.slice(index + 2, index + 7)
      .some((candidate) => PRIVATE_CONTACT_FIELD_PATTERN.test(candidate));
  });
  const publicOrganizationUnitContactGrammar = publicOrganizationContactResidualTokens
    .some((word) => publicOrganizationContactUnitToken.test(word))
    && publicOrganizationContactResidualTokens
      .every(isReviewedPublicOrganizationContactWord);
  const reviewedPublicOrganizationContact = reviewedPublicOrganizationContactCandidate
    && publicOrganizationContactResidualTokens.length > 0
    && !publicOrganizationContactExplicitPerson
    && !publicOrganizationContactHasNamedResidual
    && !publicOrganizationContactHasStructuredCapitalizedName
    && (publicOrganizationContactResidualTokens.every(isReviewedPublicOrganizationContactWord)
      || publicOrganizationUnitContactGrammar)
    && !/(?<!\p{L})\p{L}[\p{L}'’-]{1,39}(?:'s|’s)\s+(?:number|phone|telephone|email|contact)(?!\p{L})/iu.test(textWithoutKnownOrganizations);
  const reviewedEcologicalPublicServiceContact = hasInstitutionalContactChannel
    && publicOrganizationContactResidualTokens
      .some((_, index, tokens) => hasReviewedEcologicalDisambiguatorAt(tokens, index))
    && publicOrganizationContactResidualTokens
      .some((word) => publicOrganizationContactUnitToken.test(word))
    && publicOrganizationContactResidualTokens.every(isReviewedPublicOrganizationContactWord)
    && !publicOrganizationContactExplicitPerson
    && !publicOrganizationContactHasNamedResidual
    && !publicOrganizationContactHasStructuredCapitalizedName;
  const contactScope = !hasInstitutionalContactChannel
    ? "none"
    : (hasKnownPublicOrganization && (publicOrganizationContactHasNamedResidual
        || publicOrganizationContactHasStructuredCapitalizedName)
      ? "private-person"
      : (reviewedPublicOrganizationContact || reviewedEcologicalPublicServiceContact)
        ? "public-organization"
        : hasKnownPublicOrganization
          ? "ambiguous"
          : "none");
  const hasPrivateAssetReference = CADASTRE_PATTERN.test(text)
    || /\b(?:katastri(?:üksus|uksus|tunnus|number|andmed)\w*|(?:naaber|naabri)?kinnist\w*|maa(?:u|ü)ksus\w*|puurkaev\w*|aadress\w*)\b/iu.test(text);
  const hasPersonOrOwnerPredicate = ESTONIAN_PRIVATE_OWNERSHIP_PATTERN.test(text)
    || /\b(?:kontakt\w*|elanike?\s+nime\w*|(?:isiku|inimese|omaniku)\s+nimi\w*|kes\s+(?:kasutab|elab))\b/iu.test(text)
    || /\b(?:kellele|kelle)\b[\s\S]{0,80}\b(?:kuulu\w*|omandis|omanduses|valduses)\b/iu.test(text);
  const privateScopeWords = identityText.match(/[\p{L}\p{N}]+/gu) || [];
  const forestAssetIndex = privateScopeWords.findIndex((word) => PRIVATE_FOREST_ASSET_PATTERN.test(word));
  const isPotentialForestIdentityToken = (word) => {
    const normalizedWord = normalize(word);
    return !PRIVATE_CONTACT_FIELD_PATTERN.test(word)
      && !PERSON_CONTEXT_STOPWORD_PATTERN.test(word)
      && !PUBLIC_ORGANIZATION_PATTERN.test(word)
      && !PUBLIC_CONTACT_ROLE_PATTERN.test(word)
      && !PUBLIC_FOREST_RELATION_TOKEN_PATTERN.test(word)
      && !/^\d+$/u.test(word)
      && !ADMIN_CONTEXT_ROOTS.has(normalizedWord)
      && !(DOMAIN_ROOTS.has(normalizedWord) && !ECOLOGICAL_SUBJECT_PATTERN.test(word));
  };
  const precedingForestIdentityFirst = privateScopeWords[forestAssetIndex - 2] || "";
  const precedingForestIdentitySecond = privateScopeWords[forestAssetIndex - 1] || "";
  const hasDirectNamedForestRelation = forestAssetIndex >= 2
    && isPotentialForestIdentityToken(precedingForestIdentityFirst)
    && isPotentialForestIdentityToken(precedingForestIdentitySecond)
    && !isEcologicalCommonNamePair(precedingForestIdentityFirst, precedingForestIdentitySecond);
  const forestAssetWord = privateScopeWords[forestAssetIndex] || "";
  const followingForestWord = privateScopeWords[forestAssetIndex + 1] || "";
  const followingForestIdentityIndex = forestAssetIndex + (
    /^(?:forests?|woodlands?)$/iu.test(forestAssetWord)
      && ENGLISH_PRIVATE_FOREST_QUALIFIER_PATTERN.test(followingForestWord)
      ? 2
      : 1
  );
  const reviewedFollowingForestTopicPairs = [
    [/^(?:fire|wildfire)$/iu, /^(?:danger|risk|index|forecast)$/iu],
    [/^carbon$/iu, /^(?:storage|stock|sink|sequestration)$/iu],
    [/^age$/iu, /^(?:distribution|structure|classes|profile)$/iu],
    [/^coverage$/iu, /^(?:percentage|statistics|map|trend)$/iu],
    [/^health$/iu, /^(?:status|indicators|condition|assessment)$/iu],
    [/^management$/iu, /^(?:guidance|practices|policy|plans|methods|authority|rules)$/iu],
  ];
  const isReviewedFollowingForestTopicPair = (first, second) => (
    reviewedFollowingForestTopicPairs.some(([firstPattern, secondPattern]) => (
      firstPattern.test(first) && secondPattern.test(second)
    ))
  );
  const followingForestIdentityTokens = privateScopeWords.slice(followingForestIdentityIndex);
  const hasFollowingNamedForestRelation = forestAssetIndex >= 0
    && followingForestIdentityTokens.some((first, index) => {
      const second = followingForestIdentityTokens[index + 1] || "";
      const firstLooksLikeIdentity = isSuspiciousIdentityFragment(first)
        || ECOLOGICAL_SUBJECT_PATTERN.test(first)
        || ECOLOGICAL_MODIFIER_PATTERN.test(first);
      const secondLooksLikeIdentity = isSuspiciousIdentityFragment(second)
        || ECOLOGICAL_SUBJECT_PATTERN.test(second)
        || ECOLOGICAL_MODIFIER_PATTERN.test(second);
      return Boolean(second)
        && firstLooksLikeIdentity
        && secondLooksLikeIdentity
        && !isEcologicalCommonNamePair(first, second)
        && !isReviewedFollowingForestTopicPair(first, second);
    });
  const followingForestHasReviewedTopicPrefix = Boolean(followingForestIdentityTokens[0])
    && (/^(?:area|cover|coverage|age|carbon|fire|wildfire|health|management|habitat|water|species|restoration|ownership)$/iu
      .test(followingForestIdentityTokens[0])
      || followingForestIdentityTokens.some((first, index) => (
        isReviewedFollowingForestTopicPair(first, followingForestIdentityTokens[index + 1] || "")
      )));
  const hasFollowingStructuredCapitalizedName = new RegExp(
    String.raw`(?<!\p{L})(?:forest|woodland)(?!\p{L})[\s\S]{0,160}(?<!\p{L})${ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE}[.!?]*$`,
    "u",
  ).test(text);
  // This association is already a bounded forest target plus a structurally
  // person-shaped residual. Resolve it before aggregate/environmental
  // allowlists so a safe topic prefix cannot override the private suffix.
  const hasFollowingForestLookupAction = FOLLOWING_FOREST_PERSON_LOOKUP_ACTION_PATTERN.test(text);
  if ((hasFollowingNamedForestRelation && hasFollowingForestLookupAction)
    || (hasFollowingStructuredCapitalizedName
      && (hasFollowingForestLookupAction || followingForestHasReviewedTopicPrefix))) return true;
  const hasExplicitPrivateForestAsset = EXPLICIT_PRIVATE_FOREST_ASSET_PATTERN.test(forestAssetWord)
    || (/^(?:forests?|woodlands?)$/iu.test(forestAssetWord)
      && ENGLISH_PRIVATE_FOREST_QUALIFIER_PATTERN.test(followingForestWord));
  const hasDativeForestPossession = privateScopeWords.some((word, copulaIndex) => {
    let identityEndIndex = -1;
    if (/^(?:on|oli|oleks|pole)$/iu.test(word)) {
      identityEndIndex = copulaIndex - 1;
    } else if (/^ole$/iu.test(word) && /^ei$/iu.test(privateScopeWords[copulaIndex - 1] || "")) {
      identityEndIndex = copulaIndex - 2;
    }
    if (identityEndIndex < 1
      || !hasExplicitPrivateForestAsset
      || forestAssetIndex <= copulaIndex
      || forestAssetIndex - copulaIndex > 3) return false;
    const identityFirst = privateScopeWords[identityEndIndex - 1] || "";
    const identitySecond = privateScopeWords[identityEndIndex] || "";
    return /(?:le|l)$/iu.test(identitySecond)
      && isPotentialForestIdentityToken(identityFirst)
      && isPotentialForestIdentityToken(identitySecond)
      && !isEcologicalCommonNamePair(identityFirst, identitySecond);
  });
  // A direct identity attached to a concrete private forest subdivision is
  // sufficient regardless of the request verb. Generic forest references
  // still require an explicit lookup/ownership relation so environmental
  // questions such as "how much forest" cannot synthesize a person.
  const hasNamedForestAssetLookup = hasDirectNamedForestRelation
    && (hasExplicitPrivateForestAsset
      || PRIVATE_ASSET_LOOKUP_ACTION_PATTERN.test(text)
      || ESTONIAN_PRIVATE_OWNERSHIP_PATTERN.test(text)
      || /(?:'s|’s)\s+(?:forest|woodland)\b/iu.test(text));
  const belongingParticipleIndex = privateScopeWords.findIndex((word) => (
    ESTONIAN_BELONGING_PARTICIPLE_PATTERN.test(word)
  ));
  const belongsVerbIndex = privateScopeWords.findIndex((word) => ESTONIAN_BELONGS_VERB_PATTERN.test(word));
  const forestBeforeBelongsVerb = belongsVerbIndex > forestAssetIndex
    && forestAssetIndex >= 0
    && belongsVerbIndex - forestAssetIndex <= 6;
  const dativePersonBeforeBelongsVerb = belongsVerbIndex >= 2
    && forestAssetIndex > belongsVerbIndex
    && forestAssetIndex - belongsVerbIndex <= 4
    && /(?:le|l)$/iu.test(privateScopeWords[belongsVerbIndex - 1]);
  const belongingParticipleNearForest = belongingParticipleIndex >= 0
    && forestAssetIndex >= 0
    && Math.abs(belongingParticipleIndex - forestAssetIndex) <= 4;
  const hasNamedForestOwnership = forestAssetIndex >= 0
    && hasNamedIdentity
    && (ESTONIAN_PRIVATE_OWNERSHIP_PATTERN.test(text)
      || forestBeforeBelongsVerb
      || dativePersonBeforeBelongsVerb
      || hasDativeForestPossession
      || belongingParticipleNearForest);
  const englishStreetAddress = /\b\d{1,6}[a-z]?\s+[\p{L}\p{N}'’.-]{1,50}(?:\s+[\p{L}\p{N}'’.-]{1,50}){0,4}\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|way|boulevard|blvd|court|ct|place|pl)\b/iu.test(text);
  const englishPrivateAsset = new RegExp(String.raw`(?<!\p{L})${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`, "iu").test(text);
  const englishExplicitSensitiveScope = CADASTRE_PATTERN.test(text)
    || /\b(?:private|privately\s+held|nonpublic|non[-\s]+government|family|household|residential|secluded|isolated|neighbor(?:ing)?|neighbour(?:ing)?|adjacent|adjoining|this|that|specific)\b[\s\S]{0,55}\b(?:property|parcel|plot|lot|estate|land|unit|house|home|farm|farmstead|well|borehole|wetland|marsh|meadow|pond|building|dwelling|cottage|premises|site|installation|landholding|holding|forest|woodland|water[-\s]+use\s+(?:right|title|permit|licen[cs]e)|(?:property|water|land|woodland)\s+(?:right|title)|entitlement|registration)\b/iu.test(text)
    || /\b(?:parcel|property|land|well|borehole|woodland|forest)\s+(?:registry|register|records?)\b/iu.test(text);
  const englishSpecificForest = /\b(?:this|that|the\s+specific|a\s+specific)\s+(?:forest|woodland|property|parcel|plot|land|house|home|farm|well|borehole|building)\b/iu.test(text);
  const englishOwnershipIntent = /\b(?:who\s+(?:owns?|is\s+the\s+(?:registered\s+)?(?:owner|proprietor|landholder|landlord)\s+of)|whose\s+(?:property|parcel|plot|land|house|home|farm|well|borehole)|(?:property|parcel|plot|land|forest|home|house)\s+(?:owner|landowner|homeowner|proprietor|landholder|landlord)|(?:identify|find|name|contact|show)\b[\s\S]{0,60}\b(?:owner|landowner|homeowner|proprietor|landholder|landlord))\b/iu.test(text);
  const englishOwnerContactIntent = /\b(?:(?:contact|name|identity|address|phone|telephone|email)\b[\s\S]{0,50}\b(?:owner|resident|occupant|inhabitant|landowner|landholder|landlord|homeowner|proprietor)|(?:owner|resident|occupant|inhabitant|landowner|landholder|landlord|homeowner|proprietor)\b[\s\S]{0,50}\b(?:contact|name|identity|address|phone|telephone|email))\b/iu.test(text);
  const englishNamedPossessiveContactIntent = /(?<!\p{L})\p{Lu}[\p{Ll}'’-]{1,39}(?:'s|’s)\s+(?:number|phone|telephone|email|contact(?:\s+(?:details|information))?)(?!\p{L})/u.test(textWithoutKnownOrganizations);
  const englishResidenceIntent = /\bwho\s+(?:currently\s+)?(?:lives?|is\s+living|resides?|is\s+residing|stays?|occup(?:ies|ys)|inhabits?)\b/iu.test(text)
    || (/\bwhere\s+does\b[\s\S]{0,80}\b(?:live|reside|stay|inhabit)\b/iu.test(text) && hasNamedIdentity);
  const englishNamedAssetRelationship = hasNamedIdentity && (
    /\b(?:owns?|owned)\b[\s\S]{0,80}\b(?:property|parcel|plot|land|house|home|farm|well|borehole|forest|woodland)\b/iu.test(text)
    || /\b(?:property|parcel|plot|land|house|home|farm|well|borehole|forest|woodland)\b[\s\S]{0,50}\bof\b/iu.test(text)
    || /(?:'s|’s)\s+(?:property|parcel|plot|land|house|home|farm|well|borehole|forest|woodland)\b/iu.test(text)
  );
  const englishPublicAssetPattern = /(?<![\p{L}\p{Pd}-])(?:state(?:[-\s]+owned)?|public(?:ly[-\s]+owned|[-\s]+owned)?|national|municipal(?:ly[-\s]+owned)?|government(?:[-\s]+owned)?|city[-\s]+owned|county[-\s]+owned|federal)\s+(?:(?:forest|woodland|estate)\s+(?:land|property|parcel|estate)|forest|woodland|land|property|estate|parcel|plot|lot|farm|well|borehole|building|dwelling)s?\b/giu;
  const englishPublicAssetMatches = [...text.matchAll(englishPublicAssetPattern)];
  const englishPublicResidual = text.replace(englishPublicAssetPattern, " ");
  const englishRoleInterrogativeCount = (text.match(/\b(?:who|whom|whose|(?:which|what)\s+(?:(?:named|natural)\s+)*(?:person|individual|party|agency|organization))\b/giu) || []).length;
  const englishPublicAggregate = englishPublicAssetMatches.length > 0
    && !englishStreetAddress
    && !CADASTRE_PATTERN.test(text)
    && !englishSpecificForest
    && !/\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|forest|woodland)\b/iu.test(englishPublicResidual)
    && !/\b(?:neighbor(?:ing)?|neighbour(?:ing)?|adjacent|adjoining|surrounding|other|another|second|next|nearby|private)\s+(?:one|ones)\b/iu.test(englishPublicResidual)
    && englishRoleInterrogativeCount <= englishPublicAssetMatches.length;
  const englishExplicitPersonPrivateAssetLookup = !englishPublicAggregate
    && englishPrivateAsset
    && (
      /\b(?:which|what)\s+(?:(?:named|natural|private|specific)\s+)+(?:person|individual|human(?:\s+being)?|resident)\b/iu.test(textWithoutKnownOrganizations)
      || /\b(?:identify|name|reveal|show|tell(?:\s+me)?)\b[\s\S]{0,35}\b(?:person|individual|human(?:\s+being)?)\b/iu.test(textWithoutKnownOrganizations)
    );
  const englishAssetRoleRelationship = /\b(?:own\w*|ownership|belong\w*|answer\w*|manag\w*|managers?|administ\w*|operat\w*|run(?:s|ning)?|ran|keep\w*|tend\w*|service\w*|safeguard\w*|monitor\w*|supervis\w*|overse\w*|oversaw|oversight|control\w*|controllers?|hold(?:s|ing)?|held|holders?|possess\w*|possession|us(?:e|es|ed|ing)|users?|occup\w*|occupants?|leas\w*|leaseholders?|rent\w*|tenants?|tenancy|lessees?|renters?|maintain\w*|care(?:s|d|ing)?|caretakers?|steward\w*|trustees?|guardians?|principals?|permittees?|permits?|custody|custodians?|custodianship|guardianship|dominion|remit|authority|charged|charge|responsibilit(?:y|ies)|responsible|accountable|rights?|in\s+charge|beneficial\s+owners?|title\s+holders?|registered\s+part(?:y|ies)|authorized\s+users?|legal\s+users?|landholders?|landlords?|proprietors?|permit(?:[\s-]+)holders?|fiduciar\w*|keepers?|conservators?|wardens?|delegates?|beneficiar\w*|assignees?|agents?|representatives?|prox(?:y|ies)|licensees?|concessionaires?|superintendents?)\b/iu.test(text);
  const englishIdentityAssetSource = ENGLISH_PRIVATE_ASSET_SOURCE;
  const englishIdentityPromptSource = String.raw`(?:who|whom|whose|whoever|(?:which|what)\s+(?:(?:named|natural|legal|private|specific|household|family)\s+)*(?:person|individual|party|agency|organization|company|business|enterprise|human(?:\s+being)?|owners?|landowners?|homeowners?|landholders?|landlords?|proprietors?|managers?|administrators?|operators?|custodians?|caretakers?|stewards?|trustees?|guardians?|principals?|permittees?|possessors?|controllers?|occupants?|residents?|tenants?|leaseholders?|lessees?|renters?|fiduciar\w*|keepers?|conservators?|wardens?|delegates?|beneficiar\w*|assignees?|agents?|representatives?|prox(?:y|ies)|licensees?|concessionaires?|superintendents?)|(?:name|identify|reveal|show|find|tell\s+me)\s+(?:the\s+)?(?:person|individual|party|company|human(?:\s+being)?|whoever))`;
  const englishRoleVerbSource = String.raw`(?:own\w*|belong\w*|answer\w*|manag\w*|administ\w*|operat\w*|run(?:s|ning)?|ran|keep\w*|tend\w*|service\w*|safeguard\w*|monitor\w*|supervis\w*|overse\w*|oversaw|control\w*|hold(?:s|ing)?|held|possess\w*|us(?:e|es|ed|ing)|occup\w*|leas\w*|rent\w*|maintain\w*|steward\w*|trust\w*|guard\w*|govern\w*|direct\w*|delegat\w*|care(?:s|d|ing)?\s+for)`;
  const englishRoleNounSource = String.raw`(?:owners?|beneficial\s+owners?|landowners?|landholders?|landlords?|proprietors?|management|managers?|administration|administrators?|operation|operators?|supervision|supervisors?|oversight(?:\s+authority)?|custodians?|custodianship|caretakers?|stewards?|stewardship|trustees?|guardians?|guardianship|principals?|permittees?|permits?|permit(?:[\s-]+)holders?|possessors?|possession|dominion|remit|authority|title\s+holders?|rights?\s+holders?|registered\s+part(?:y|ies)|authorized\s+users?|legal\s+users?|responsible|accountable|charged|responsible\s+(?:persons?|part(?:y|ies))|(?:persons?|individuals?|part(?:y|ies))\s+(?:responsible|accountable|in\s+charge|with\s+custody)|controllers?|occupants?|residents?|tenants?|tenancy|leaseholders?|lessees?|renters?|in\s+charge|custody|responsibilit(?:y|ies)|rights?|fiduciar\w*|keepers?|conservators?|wardens?|delegates?|beneficiar\w*|assignees?|agents?|representatives?|prox(?:y|ies)|licensees?|concessionaires?|superintendents?)`;
  const englishOpenClassRoleIdentityLookup = !englishPublicAggregate && new RegExp(
    String.raw`\b(?:who|whom)\s+(?:is|are|was|were|would\s+be)\s+(?:(?:the|an?)\s+)?(?!(?:public|government|municipal|state|agency|authority|organization|institution)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,3}\p{L}[\p{L}'’-]{1,30}\s+(?:for|of|over)\s+(?:(?:the|this|that|an?)\s+)?${englishIdentityAssetSource}(?![\p{L}-]|\s+(?:permits?|guidance|policy|rules?|data|biodiversity|monitoring|research|information|requirements?)\b)`,
    "iu",
  ).test(textWithoutKnownOrganizations);
  const englishExplicitNaturalPersonSensitiveScopeLookup = !englishPublicAggregate
    && englishExplicitSensitiveScope
    && /\b(?:natural\s+person|(?:which|what)\s+(?:(?:named|natural|legal|private|specific)\s+)*(?:person|individual|human(?:\s+being)?|resident))\b/iu.test(textWithoutKnownOrganizations);
  const englishOpenClassAppointmentLookup = !englishPublicAggregate
    && englishExplicitSensitiveScope
    && [
      /\bwho\s+(?:(?:has|had)\s+been|was|is)\s+(?:appointed|assigned|designated|named)\b[\s\S]{0,70}\b(?:for|of|over|to)\b/iu,
      /\b(?:name|identify|reveal|show|find|tell\s+me)\s+(?:the\s+)?(?:\p{L}[\p{L}'’-]{1,30}\s+){0,3}\p{L}[\p{L}'’-]{1,30}\s+(?:assigned|appointed|designated|named)\s+(?:to|for|over)\b/iu,
    ].some((pattern) => pattern.test(textWithoutKnownOrganizations));
  const englishOpenClassIdentityReference = /\b(?:who|whom|whose|whoever|someone|who\s+was\s+it|(?:name|identify|reveal|show|find|tell\s+me)\s+(?:the\s+)?(?:person|individual|party|holder|whoever|someone)|(?:disclose|reveal|show|give)\s+(?:(?:the|their|his|her)\s+)?(?:identity|name))\b/iu.test(textWithoutKnownOrganizations);
  const englishOpenClassRoleAssignmentRelationship = [
    /\b(?:appointment|assignment|designation|nomination)\b/iu,
    /\b(?:appointed|assigned|designated|nominated|selected|chosen|entrusted|commissioned|delegated|authori[sz]ed)\b/iu,
    /\b(?:took\s+up|accepted|assumed|filled|received|obtained|carries?|carried|bears?|bore|holds?|held)\b[\s\S]{0,40}\b(?:post|role|mandate|capacity|office|position|portfolio|status|remit)\b/iu,
    /\b(?:post|role|mandate|capacity|office|position|portfolio|status|remit)\b[\s\S]{0,35}\b(?:for|of|over|on|cover(?:s|ed|ing)?)\b/iu,
    /\b(?:designates?|designated|names?|named|records?|recorded)\b[\s\S]{0,45}\bas\b/iu,
    /\b(?:is|are|was|were|be|been)\s+represented\b/iu,
    /\b(?:serves?|served|acts?|acted|works?|worked|stands?|stood)\b[\s\S]{0,55}\bas\b/iu,
    /\b(?:retains?|retained|engages?|engaged)\b[\s\S]{0,45}\b(?:delegate|liaison|representative|envoy|agent|holder|officer|role)\b/iu,
    /\b(?:registry|register|records?)\b[\s\S]{0,45}\b(?:shows?|lists?|records?)\b[\s\S]{0,35}\b(?:status|role|capacity|portfolio|mandate)\b/iu,
  ].some((pattern) => pattern.test(textWithoutKnownOrganizations));
  const englishOpenClassRoleAssociationLookup = !englishPublicAggregate
    && !reviewedComplianceQuestion
    && englishExplicitSensitiveScope
    && englishOpenClassIdentityReference
    && englishOpenClassRoleAssignmentRelationship;
  const englishPublicRegulatoryIdentityQuestion = [
    /^who\s+is\s+(?:the\s+)?(?:public\s+|government\s+|regulatory\s+)?(?:agency|authority|institution|regulator)\s+for\s+private[-\s]+(?:well|borehole)\s+(?:permits?|guidance|policy|rules?|requirements?)\??$/iu,
    /^who\s+(?:regulates?|administers?|issues?|publishes?|provides?)\b[\s\S]{0,80}\bprivate[-\s]+(?:well|borehole)\s+(?:permits?|guidance|policy|rules?|requirements?)\??$/iu,
  ].some((pattern) => pattern.test(textWithoutKnownOrganizations.trim()));
  const englishDirectPrivateIdentityLookup = !englishPublicAggregate
    && !reviewedComplianceQuestion
    && !englishPublicRegulatoryIdentityQuestion
    && englishExplicitSensitiveScope
    && englishOpenClassIdentityReference;
  const englishOpenClassWhichRoleIdentityLookup = !englishPublicAggregate
    && !reviewedComplianceQuestion
    && englishExplicitSensitiveScope
    && englishAssetRoleRelationship
    && /\b(?:which|what)\s+(?![^?]{0,45}\b(?:public|government|municipal|state|agency|authority|organization|institution|regulator|rule|regulation|policy|guidance|requirement|permit|method|system|dataset|data|map|source|service)\b)(?:(?:named|natural|legal|private|specific|household|family|current|on[-\s]+site)\s+)*(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}\b/iu.test(textWithoutKnownOrganizations);
  const englishOpenClassRegistryRoleIdentityLookup = !englishPublicAggregate
    && !reviewedComplianceQuestion
    && englishExplicitSensitiveScope
    && [
      /\b(?:which|what)\s+(?!(?:public|government|municipal|state|agency|authority|organization|institution|regulator)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}\s+(?:appears?|stands?|sits?|is(?:\s+(?:named|listed|recorded))?)\b[\s\S]{0,70}\b(?:register|registry|filing|records?)\b/iu,
      /\bit\s+is\s+(?:which|what)\s+(?!(?:public|government|municipal|state|agency|authority|organization|institution|regulator)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}\s+that\b[\s\S]{0,90}\b(?:register|registry|filing|records?)\s+(?:names?|lists?|records?)\b/iu,
      /\b(?:register|registry|filing|records?)\s+(?:identif(?:y|ies|ied)|names?|lists?|records?)\s+(?:which|what)\s+(?!(?:public|government|municipal|state|agency|authority|organization|institution|regulator)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}\b/iu,
    ].some((pattern) => pattern.test(textWithoutKnownOrganizations));
  const englishPrivateAssetRoleLookup = !englishPublicAggregate && [
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,70}\b${englishRoleVerbSource}\b[\s\S]{0,100}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,36}\b(?:is|are|was|were|has|have|had|bears?|bore|holds?|held|charged)\b[\s\S]{0,35}\b${englishRoleNounSource}\b[\s\S]{0,35}\b(?:of|for|to|with|over)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b(?:serves?|functions?|acts?)\s+as\b[\s\S]{0,25}\b${englishRoleNounSource}\b[\s\S]{0,25}\b(?:of|for|over)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b(?:is|are|was|were)\s+(?:connected|linked|associated|attached)\s+(?:to|with)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b(?:is|are|was|were)\s+tied\s+to\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,30}\b${englishRoleNounSource}\b[\s\S]{0,25}\b(?:includes?|covers?|extends?\s+to)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b(?:is|was)\s+charged\s+with\s+(?:the\s+)?care\s+of\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b${englishIdentityAssetSource}\b[\s\S]{0,35}\b(?:belong(?:s)?\s+to|managed|administered|operated|run|supervised|overseen|controlled|held|possessed|used|occupied|leased|rented|maintained)\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,80}\b(?:is|are|was|were|has\s+been|had\s+been)\s+(?:managed|administered|operated|run|supervised|overseen|controlled|held|possessed|used|occupied|leased|rented|maintained|cared\s+for)\s+by\s+(?:whom|which\s+(?:named\s+)?(?:person|individual|party))\b`, "iu"),
    new RegExp(String.raw`\bby\s+(?:whom|which\s+(?:named\s+)?(?:person|individual|party))\b[\s\S]{0,35}\b(?:is|are|was|were|has\s+been|had\s+been)\b[\s\S]{0,35}\b${englishIdentityAssetSource}\b[\s\S]{0,45}\b(?:managed|administered|operated|run|supervised|overseen|controlled|held|possessed|used|occupied|leased|rented|maintained|cared\s+for)\b`, "iu"),
    new RegExp(String.raw`\b(?:identify|name|list|show|find|locate|reveal|disclose|provide|give|return|enumerate|display|tell(?:\s+me)?)\b[\s\S]{0,80}\b${englishRoleNounSource}\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b(?:identify|name|list|show|find|locate|reveal|disclose|provide|give|return|enumerate|display|tell(?:\s+me)?)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b[\s\S]{0,80}\b${englishRoleNounSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,65}\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b${englishRoleNounSource}\b`, "iu"),
    new RegExp(String.raw`\bwhose\s+(?:name|title|registration|rights?)\b[\s\S]{0,45}\b(?:attached|registered|recorded|linked|associated)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\bwhose\s+name\s+(?:is|was)\s+(?:shown\s+)?(?:on|in)\s+(?:the\s+)?(?:registry|register|records?|filing)\s+(?:for|of)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityPromptSource}\b[\s\S]{0,35}\b${englishRoleNounSource}\b[\s\S]{0,55}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b(?:what\s+is\s+the\s+identity\s+of\s+)?(?:the\s+)?(?:person|individual|human\s+being)\b[\s\S]{0,55}\b${englishRoleVerbSource}\b[\s\S]{0,75}\b${englishIdentityAssetSource}\b[\s\S]{0,45}\b(?:who|whom|what)\b`, "iu"),
    new RegExp(String.raw`\b${englishRoleNounSource}\b[\s\S]{0,55}\b${englishIdentityAssetSource}\b[\s\S]{0,45}\b(?:is|would\s+be)\s+(?:which\s+)?(?:named\s+)?(?:person|individual|who|whom)\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}(?:'s|’s)\b[\s\S]{0,30}\b${englishRoleNounSource}\b[\s\S]{0,45}\bwho\s+(?:would\s+that\s+be|is\s+that)\b`, "iu"),
    new RegExp(String.raw`\b(?:reveal|show|tell\s+me|what\s+is)\b[\s\S]{0,30}\bidentity\b[\s\S]{0,45}\b(?:whoever|person|individual)\b[\s\S]{0,45}\b${englishRoleVerbSource}\b[\s\S]{0,75}\b${englishIdentityAssetSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,45}\b${englishRoleNounSource}\b[\s\S]{0,45}\b(?:identify|name|reveal|show)\b[\s\S]{0,20}\b(?:that|the)\s+(?:person|individual)\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,65}\b(?:belongs?\s+to|is\s+held\s+by|is\s+assigned\s+to)\s+(?:whom|who|which\s+(?:named\s+)?(?:person|individual|party))\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,45}\b(?:answers?\s+to|falls?\s+under|is\s+subject\s+to)\b[\s\S]{0,25}\b${englishIdentityPromptSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,35}\b(?:is|falls?|comes?)\s+(?:directly\s+)?under\s+(?:which|what)\s+(?:named\s+|natural\s+|private\s+)?${englishRoleNounSource}\b`, "iu"),
    new RegExp(String.raw`\b${englishIdentityAssetSource}\b[\s\S]{0,90}\b(?:name|identify|reveal|show|find|disclose)\b[\s\S]{0,55}\b(?:person|individual|party|human\s+being)\b[\s\S]{0,45}\b${englishRoleNounSource}\b`, "iu"),
    new RegExp(String.raw`\b(?:management|administration|operation|supervision|control|custody|stewardship)\s+of\b[\s\S]{0,30}\b${englishIdentityAssetSource}\b[\s\S]{0,100}\b(?:rests?|lies?|falls?)\s+with\s+(?:who|whom|which\s+(?:person|individual|party))\b`, "iu"),
    new RegExp(String.raw`\bby\s+(?:what|which)\s+(?:person|individual|party)\b[\s\S]{0,35}\b(?:could|would|may|might|can)\b[\s\S]{0,80}\b${englishIdentityAssetSource}\b[\s\S]{0,35}\bbe(?:\s+being)?\s+(?:managed|administered|operated|run|supervised|overseen|controlled|held|possessed|used|occupied|leased|rented|maintained)\b`, "iu"),
    new RegExp(String.raw`\b${englishRoleNounSource}\b[\s\S]{0,35}\b(?:of|for)\b[\s\S]{0,35}\b${englishIdentityAssetSource}\b[\s\S]{0,100}\b(?:who|whom)\b[\s\S]{0,20}\b(?:is|would\s+be)\b`, "iu"),
  ].some((pattern) => pattern.test(text));
  const hasInitialAndSurnamePersonName = /(?<!\p{L})\p{Lu}\.\s*\p{Lu}[\p{Ll}'’-]{1,39}(?!\p{L})/u.test(textWithoutKnownOrganizations);
  const leadingLowercaseNameMatch = textWithoutKnownOrganizations.match(/^\s*(\p{Ll}[\p{Ll}'’-]{1,39})\s+(\p{Ll}[\p{Ll}'’-]{1,39})\s+/u);
  const hasLeadingLowercaseNamedRole = Boolean(leadingLowercaseNameMatch)
    && isSuspiciousIdentityFragment(leadingLowercaseNameMatch[1])
    && isSuspiciousIdentityFragment(leadingLowercaseNameMatch[2])
    && /\b(?:own\w*|manag\w*|administ\w*|operat\w*|supervis\w*|control\w*|hold\w*|possess\w*|us(?:e|es|ed|ing)|occup\w*|leas\w*|rent\w*|maintain\w*|halda\w*|käita\w*|valda\w*|hoolda\w*|juhi\w*)\b/iu.test(textWithoutKnownOrganizations);
  const hasRecordedLowercaseNamedRole = new RegExp(
    String.raw`\b(?:environmental\s+records?|registry\s+(?:notes|records?)?|according\s+to\s+(?:the\s+)?(?:records?|registry|filing))\b[\s\S]{0,45}\b\p{Ll}[\p{Ll}'’-]{1,39}\s+\p{Ll}[\p{Ll}'’-]{1,39}\b[\s\S]{0,30}\b(?:as\s+(?:a\s+)?${englishRoleNounSource}|is\s+(?:the\s+)?${englishRoleNounSource}|(?:is\s+)?entrusted\s+with)\b`,
    "iu",
  ).test(textWithoutKnownOrganizations);
  const trailingLowercaseNamedRoleMatch = textWithoutKnownOrganizations.match(new RegExp(
    String.raw`\b(?:custodian|caretaker|manager|operator|steward)\s+for\b[\s\S]{0,85}\b${ENGLISH_PRIVATE_ASSET_SOURCE}\b[\s\S]{0,45}\bis\s+(\p{Ll}[\p{Ll}'’-]{1,39})\s+(\p{Ll}[\p{Ll}'’-]{1,39})(?:[.?!]|$)`,
    "u",
  ));
  const hasTrailingLowercaseNamedRole = Boolean(trailingLowercaseNamedRoleMatch)
    && isSuspiciousIdentityFragment(trailingLowercaseNamedRoleMatch[1])
    && isSuspiciousIdentityFragment(trailingLowercaseNamedRoleMatch[2]);
  const isRoleLinkedPrivateAsset = (word) => /^(?:katastri\w*|(?:naaber|naabri|metsa|era|rendi)?kinnist\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|metsaeraldis\w*|metsamaa\w*|metsat(?:ü|u)kk\w*|puistu\w*|puurkaev\w*|erakaev\w*|eramaa\w*|eratalu\w*|rendikinnist\w*|property|properties|parcel|parcels|plot|plots|lot|lots|estate|estates|land|lands|house|houses|home|homes|farm|farms|well|wells|borehole|boreholes|building|buildings|dwelling|dwellings|forest|forests|woodland|woodlands)$/iu.test(word)
    || ESTONIAN_PRIVATE_FOREST_NOUN_PATTERN.test(word);
  const isPrivateAssetQualifier = (word) => /^(?:era\w*|isiklik\w*|naabri\w*|perekonna\w*|private\w*|family|household|personal)$/iu.test(word);
  const isPrivateAssetQualifierModifier = (word) => /^(?:existing|local|old|registered|vana|kaitstav\w*)$/iu.test(word);
  const isRoleLinkedPrivateAssetAt = (assetIndex) => {
    const word = rawIdentityFragments[assetIndex] || "";
    const qualifierWindow = rawIdentityFragments.slice(Math.max(0, assetIndex - 3), assetIndex);
    const qualifierIndex = qualifierWindow.findLastIndex(isPrivateAssetQualifier);
    const qualifierSuffix = qualifierIndex >= 0 ? qualifierWindow.slice(qualifierIndex) : [];
    const hasBoundedPrivateQualifier = qualifierSuffix.length > 0
      && qualifierSuffix.slice(1).every(isPrivateAssetQualifierModifier);
    return isRoleLinkedPrivateAsset(word)
      // Canonical punctuation splitting turns compounds into tokens. Bind a
      // bare forest/well noun only to a nearby private qualifier followed by
      // at most two reviewed modifiers, never to arbitrary intervening text.
      || ((ESTONIAN_FOREST_NOUN_PATTERN.test(word) || ESTONIAN_WELL_NOUN_PATTERN.test(word))
        && hasBoundedPrivateQualifier);
  };
  const isRoleLinkedPublicAsset = (word) => /^(?:(?:riigi|rahvus|munitsipaal)mets\w*)$/iu.test(word);
  const isPublicAssetQualifier = (word) => /^(?:public\w*|government\w*|municipal\w*|national|federal|state|county|city|publicly|avalik\w*|riigi\w*|munitsipaal\w*|omavalitsus\w*|linna\w*|valla\w*)$/iu.test(word);
  const isRoleLinkedPublicAssetAt = (assetIndex) => {
    const word = rawIdentityFragments[assetIndex] || "";
    return isRoleLinkedPublicAsset(word)
      || (ESTONIAN_FOREST_NOUN_PATTERN.test(word)
        && isPublicAssetQualifier(rawIdentityFragments[assetIndex - 1] || ""));
  };
  const roleAssetIsPublic = (assetIndex) => {
    if (isRoleLinkedPublicAssetAt(assetIndex)) return true;
    const preceding = rawIdentityFragments.slice(Math.max(0, assetIndex - 3), assetIndex);
    const precedingStartIndex = Math.max(0, assetIndex - 3);
    const barrierIndex = preceding.findLastIndex((word, wordIndex) => (
      isRoleLinkedPrivateAssetAt(precedingStartIndex + wordIndex)
      || isRoleLinkedPublicAssetAt(precedingStartIndex + wordIndex)
      || /^(?:and|ja|ning|plus)$/iu.test(word)
    ));
    return preceding.slice(barrierIndex + 1).some(isPublicAssetQualifier);
  };
  const isAgentivePrivateAssetRoleLink = (word) => /^(?:hallan\w*|hallat\w*|halda\w*|haldaja\w*|haldur\w*|hooldat\w*|hoolda\w*|majandat\w*|majanda\w*|käitat\w*|kaitat\w*|käita\w*|kaita\w*|kasutat\w*|kasuta\w*|omanik\w*|omab|omavad|valda\w*|valitset\w*|valitse\w*|vastut\w*|kontrollit\w*|kontrolli\w*|rendilev[õo]t\w*|rendit\w*|rendi\w*|juhi(?:b|vad|s|sid|nud|tav|tud|ma|mine|mise|jana|jaks)\w*|korralda\w*|opereeri\w*|administrator|caretaker|custodian|holders?|landholder|landlord|manager|operator|owner|stewards?|tenant|trustee|owned|owns?|managed|manages?|managing|maintained|maintains?|maintaining|administered|administers?|administering|operated|operates?|operating|supervised|supervises?|supervising|overseen|oversees?|controlled|controls?|controlling|held|holds?|holding|possessed|possesses?|possessing|used|uses?|using|occupied|occupies|occupying|leased|leases?|leasing|rented|rents?|renting|cared)$/iu.test(word);
  const isNominalPrivateAssetRoleLink = (word) => /^(?:care|custody|custodianship|management|administration|operation|supervision|oversight|stewardship|haldamis\w*|haldus\w*|juhtimis\w*|korraldamis\w*)$/iu.test(word);
  const isPrivateAssetRoleLink = (word) => isAgentivePrivateAssetRoleLink(word)
    || isNominalPrivateAssetRoleLink(word);
  const isPrivateAssetRoleBridge = (word) => /^(?:a|an|and|as|behalf|by|eest|fall|falls|fell|fallen|for|in|lie|lies|lay|lain|of|on|over|plus|remain|remains|remained|rest|rests|rested|resting|s|that|the|under|with|who|whose|is|are|was|were|be|been|being|ja|keda|mida|mille|ning|on|oli|olev\w*|poolt|volita\w*)$/iu.test(word)
    || /^[\p{L}-]{2,30}(?:ly|lt|sti)$/iu.test(word);
  const isRoleLinkedOrganizationMarker = (word) => /^(?:agenc(?:y|ies)|associations?|authorit(?:y|ies)|board|business(?:es)?|collectives?|commission|committees?|community|communities|company|contractors?|cooperatives?|corporation|council|department\w*|federations?|foundation|groups?|inc|institutes?|institution\w*|llc|ltd|nonprofit|office\w*|organi[sz]ation\w*|panels?|plc|service\w*|societ(?:y|ies)|team\w*|trust|universit(?:y|ies)|volunteers?|aktsiaselts\w*|amet\w*|agentuur\w*|asutus\w*|büroo\w*|buroo\w*|institutsioon\w*|meeskond\w*|mittetulundusühing\w*|mittetulundusuhing\w*|nõukogu\w*|noukogu\w*|osakond\w*|osaühing\w*|osauhing\w*|selts\w*|sihtasutus\w*|teenistus\w*|tulundusühistu\w*|tulundusuhistu\w*|ühing\w*|uhing\w*)$/iu.test(word);
  const isGenericRoleModifier = (word) => /^(?:active\w*|adaptive|agenc(?:y|ies)|appl(?:y|ies|ied|icable)|associations?|authorit(?:y|ies)|based|binds?|business(?:es)?|can|city|community|communities|comply\w*|contractors?|could|county|department\w*|did|do|does|district\w*|dut(?:y|ies)|ecological\w*|ecosystem|environmental\w*|extensive\w*|family|federal|follow\w*|govern\w*|government\w*|groups?|guidance|harvest|high|how|impact|institution\w*|intensity|intensive\w*|individuals?|local|long|low|may|multi|municipal\w*|monitoring|must|national|natural\w*|neighborhood|obey\w*|office\w*|organi[sz]ation\w*|people|persons?|policy|private|public|purpose|requirement\w*|resident\w*|rights?|rural|rules?|scale|selective|service\w*|short|should|small|state|sustainab\w*|team\w*|term|title|unit\w*|volunteer\w*|what|which|who|whose|would|aktiiv\w*|amet\w*|asutus\w*|avalik\w*|era|ekstensiiv\w*|institutsioon\w*|intensiiv\w*|jätkusuut\w*|jatkusuut\w*|järgi\w*|jargi\w*|kas|kehti\w*|keda|kelle|kellele|kes|kuidas|kohustus\w*|linna\w*|looduslähed\w*|looduslahed\w*|meeskond\w*|millin\w*|mis|munitsipaal\w*|nõu[ed]\w*|nou[ed]\w*|oigus\w*|omavalitsus\w*|organisatsioon\w*|peab|perekonna\w*|pikaajali\w*|reegl\w*|riigi\w*|teenus\w*|tohib|täit\w*|tait\w*|valla\w*|vana|vastutus\w*|võib|voib|võiks|voiks|uus|õigus\w*|üksus\w*|uksus\w*)$/iu.test(word);
  const isRoleLinkedNameFragment = (word) => (isSuspiciousIdentityFragment(word)
      || ECOLOGICAL_MODIFIER_PATTERN.test(word)
      || (PERSON_CONTEXT_STOPWORD_PATTERN.test(word) && !isPrivateAssetRoleBridge(word)))
    && !isGenericRoleModifier(word)
    && !isPrivateAssetRoleLink(word)
    && !isRoleLinkedPrivateAsset(word);
  // Lowercase, uppercase and punctuation-separated names cannot be inferred
  // safely across arbitrary prose. A two-token pair is nevertheless a
  // private identity when a bounded management/ownership relation attaches
  // it to a concrete environmental asset. Tokenizing first makes the same
  // fail-closed decision for `jaan tamm`, `JAAN_TAMM` and `john/smith` while
  // leaving generic phrases such as "long-term managed woodland" public.
  const hasRoleLinkedNamedPrivateAssetAssociation = rawIdentityFragments.some((first, index) => {
    const second = rawIdentityFragments[index + 1];
    if (!second
      || !isRoleLinkedNameFragment(first)
      || !isRoleLinkedNameFragment(second)
      || isEcologicalCommonNamePair(first, second)) return false;

    // Institutional proper names and plural actor groups are not people.
    // Include the token immediately after a two-word candidate so the
    // designator in "North District Team" is part of the decision.
    if (rawIdentityFragments.slice(Math.max(0, index - 1), index + 5)
      .some(isRoleLinkedOrganizationMarker)) return false;

    const trailingStartIndex = index + 2;
    const trailing = rawIdentityFragments.slice(trailingStartIndex, index + 11);
    const trailingRoleIndexes = trailing.flatMap((word, wordIndex) => {
      if (isAgentivePrivateAssetRoleLink(word)) return [wordIndex];
      if (isNominalPrivateAssetRoleLink(word)
        && trailing.slice(0, wordIndex).some((candidate) => candidate === "s")) return [wordIndex];
      return [];
    });
    const relationFiller = (word, absoluteIndex) => isPrivateAssetRoleBridge(word)
      || isGenericRoleModifier(word)
      || isPrivateAssetQualifier(word)
      || isPrivateAssetQualifierModifier(word)
      || isRoleLinkedPrivateAssetAt(absoluteIndex)
      || isRoleLinkedPublicAssetAt(absoluteIndex);
    const trailingRangeIsRelationFiller = (start, end) => trailing.slice(start, end)
      .every((word, offset) => relationFiller(word, trailingStartIndex + start + offset));
    for (const trailingRoleIndex of trailingRoleIndexes) {
      const trailingAssetIndexes = trailing.flatMap((word, wordIndex) => (
        wordIndex > trailingRoleIndex
          && isRoleLinkedPrivateAssetAt(trailingStartIndex + wordIndex) ? [wordIndex] : []
      ));
      for (const trailingAssetIndex of trailingAssetIndexes) {
        if (!roleAssetIsPublic(index + 2 + trailingAssetIndex)
          && trailing.slice(0, trailingRoleIndex).every((word) => (
            isPrivateAssetRoleBridge(word) || isGenericRoleModifier(word)
          ))
          && trailingRangeIsRelationFiller(trailingRoleIndex + 1, trailingAssetIndex)) return true;
      }
    }

    const trailingAssetIndexes = trailing.flatMap((word, wordIndex) => (
      isRoleLinkedPrivateAssetAt(trailingStartIndex + wordIndex) ? [wordIndex] : []
    ));
    for (const trailingAssetIndex of trailingAssetIndexes) {
      const roleAfterAssetIndexes = trailing.flatMap((word, wordIndex) => (
        wordIndex > trailingAssetIndex && isAgentivePrivateAssetRoleLink(word) ? [wordIndex] : []
      ));
      for (const roleAfterAssetIndex of roleAfterAssetIndexes) {
        if (!roleAssetIsPublic(index + 2 + trailingAssetIndex)
          && trailing.slice(0, trailingAssetIndex).every((word) => (
            isPrivateAssetRoleBridge(word) || isGenericRoleModifier(word)
          ))
          && trailingRangeIsRelationFiller(trailingAssetIndex + 1, roleAfterAssetIndex)) return true;
      }
    }

    const leading = rawIdentityFragments.slice(Math.max(0, index - 7), index);
    const leadingRoleIndex = leading.findLastIndex(isAgentivePrivateAssetRoleLink);
    const leadingBridges = leading.slice(leadingRoleIndex + 1);
    const leadingStartIndex = Math.max(0, index - 7);
    const leadingAssetIndex = leading.findLastIndex((word, wordIndex) => (
      wordIndex < leadingRoleIndex
        && isRoleLinkedPrivateAssetAt(leadingStartIndex + wordIndex)
    ));
    const isStrongAgentBridgeSequence = (bridgeWords) => bridgeWords.every(isPrivateAssetRoleBridge)
      || (bridgeWords.length >= 2
        && /^(?:by|poolt)$/iu.test(bridgeWords.at(-1))
        && bridgeWords.slice(0, -1).length <= 3
        && bridgeWords.slice(0, -1).every((word) => /^[\p{L}-]{2,30}$/iu.test(word)
          && !isPrivateAssetRoleLink(word)
          && !isRoleLinkedOrganizationMarker(word)
          && !isRoleLinkedPrivateAsset(word)));
    if (leadingRoleIndex >= 0
      && isStrongAgentBridgeSequence(leadingBridges)
      && leadingAssetIndex >= 0
      && !roleAssetIsPublic(leadingStartIndex + leadingAssetIndex)
      && leading.slice(leadingAssetIndex + 1, leadingRoleIndex).every((word) => (
        isPrivateAssetRoleBridge(word) || isGenericRoleModifier(word)
      ))) return true;

    // Nominal roles can appear on either side of the asset, provided the
    // strong "of/by <name>" syntax remains contiguous and bounded.
    const leadingNominalRoleIndexes = leading.flatMap((word, wordIndex) => (
      isNominalPrivateAssetRoleLink(word) ? [wordIndex] : []
    ));
    const leadingAssetIndexes = leading.flatMap((word, wordIndex) => (
      isRoleLinkedPrivateAssetAt(leadingStartIndex + wordIndex) ? [wordIndex] : []
    ));
    for (const nominalRoleIndex of leadingNominalRoleIndexes) {
      for (const assetIndex of leadingAssetIndexes) {
        const lower = Math.min(nominalRoleIndex, assetIndex);
        const upper = Math.max(nominalRoleIndex, assetIndex);
        if (!roleAssetIsPublic(leadingStartIndex + assetIndex)
          && leading.slice(lower + 1, upper).every((word) => (
            isPrivateAssetRoleBridge(word) || isGenericRoleModifier(word)
          ))
          && isStrongAgentBridgeSequence(leading.slice(upper + 1))) return true;
      }
      for (const trailingAssetIndex of trailingAssetIndexes) {
        if (!roleAssetIsPublic(trailingStartIndex + trailingAssetIndex)
          && isStrongAgentBridgeSequence(leading.slice(nominalRoleIndex + 1))
          && trailingRangeIsRelationFiller(0, trailingAssetIndex)) return true;
      }
    }

    // Possessive nominal syntax places the role after the name while the
    // asset precedes it: "woodland under John Smith's management". This is
    // a strong relation only when every intervening token is a bounded
    // grammatical bridge and the asset is not publicly qualified.
    const nominalLeadingAssetIndex = leading.findLastIndex((word, wordIndex) => (
      isRoleLinkedPrivateAssetAt(leadingStartIndex + wordIndex)
    ));
    const trailingNominalRoleIndex = trailing.findIndex(isNominalPrivateAssetRoleLink);
    return nominalLeadingAssetIndex >= 0
      && trailingNominalRoleIndex >= 0
      && !roleAssetIsPublic(leadingStartIndex + nominalLeadingAssetIndex)
      && leading.slice(nominalLeadingAssetIndex + 1).every(isPrivateAssetRoleBridge)
      && trailing.slice(0, trailingNominalRoleIndex).every(isPrivateAssetRoleBridge);
  });
  // Some genuine names collide with ordinary environmental vocabulary or
  // modal words (for example “Forest Green”, “Jaan Mets” and “May Brown”).
  // Accept them only inside strong, bounded subject/by/of/with role grammars;
  // arbitrary two-word prose remains insufficient to infer a person.
  const isStrongGrammarPersonToken = (word) => /^[\p{L}][\p{L}'’-]{1,39}$/u.test(word)
    && !isPrivateAssetRoleLink(word)
    && !isRoleLinkedOrganizationMarker(word)
    && !/^(?:a|an|the|this|that|these|those|private|public|government|municipal|national|state|county|city|federal|person|persons|people|individual|individuals|someone|whoever|term)$/iu.test(word);
  const strongGrammarPairIsOrganization = (index) => rawIdentityFragments
    .slice(Math.max(0, index - 1), index + 5)
    .some(isRoleLinkedOrganizationMarker);
  const strongGrammarPairIsGenericDescriptor = (first, second) => (
    (isGenericRoleModifier(first) && isGenericRoleModifier(second))
    // Punctuation tokenization must not reinterpret the ordinary compound
    // qualifier in "era-mets" as a two-token person's name.
    || (isPrivateAssetQualifier(first)
      && (isPrivateAssetQualifierModifier(second)
        || ESTONIAN_FOREST_NOUN_PATTERN.test(second)
        || ESTONIAN_WELL_NOUN_PATTERN.test(second)))
  );
  const strongNamedSubjectPairIndexes = rawIdentityFragments.flatMap((first, index) => {
    const second = rawIdentityFragments[index + 1];
    if (!second
      || !isStrongGrammarPersonToken(first)
      || !isStrongGrammarPersonToken(second)
      || strongGrammarPairIsGenericDescriptor(first, second)
      || strongGrammarPairIsOrganization(index)) return [];
    const hasStrongQuestionPrefix = (
      rawIdentityFragments[index - 2] === "how"
      && rawIdentityFragments[index - 1] === "does"
    ) || (
      rawIdentityFragments[index - 1] === "kuidas"
      && !/^m[õo]jutab$/iu.test(first)
    ) || (
      rawIdentityFragments[index - 2] === "kuidas"
      && /^m[õo]jutab$/iu.test(rawIdentityFragments[index - 1] || "")
    ) || (
      rawIdentityFragments[index - 4] === "what"
      && /^(?:duties|obligations|requirements|rules)$/iu.test(rawIdentityFragments[index - 3] || "")
      && /^(?:apply|applicable|bind)$/iu.test(rawIdentityFragments[index - 2] || "")
      && rawIdentityFragments[index - 1] === "to"
    );
    const directPrivateAsset = rawIdentityFragments
      .slice(index + 2, Math.min(rawIdentityFragments.length, index + 7))
      .some((_word, offset) => {
        const assetIndex = index + 2 + offset;
        return isRoleLinkedPrivateAssetAt(assetIndex) && !roleAssetIsPublic(assetIndex);
      });
    const estonianImpactPrefix = rawIdentityFragments[index - 2] === "kuidas"
      && /^m[õo]jutab$/iu.test(rawIdentityFragments[index - 1] || "");
    return hasStrongQuestionPrefix
      && (isAgentivePrivateAssetRoleLink(rawIdentityFragments[index + 2] || "")
        || (estonianImpactPrefix && directPrivateAsset)) ? [index] : [];
  });
  const hasStrongGrammarNamedPrivateAssetAssociation = rawIdentityFragments.some((first, index) => {
    const second = rawIdentityFragments[index + 1];
    if (!second
      || !isStrongGrammarPersonToken(first)
      || !isStrongGrammarPersonToken(second)
      || strongGrammarPairIsGenericDescriptor(first, second)
      || strongGrammarPairIsOrganization(index)) return false;

    const privateAssetInRange = (start, end) => rawIdentityFragments
      .slice(start, end)
      .some((word, offset) => {
        const assetIndex = start + offset;
        return isRoleLinkedPrivateAssetAt(assetIndex) && !roleAssetIsPublic(assetIndex);
      });
    if (strongNamedSubjectPairIndexes.includes(index)
      && privateAssetInRange(index + 2, Math.min(rawIdentityFragments.length, index + 11))) return true;

    const connector = rawIdentityFragments[index - 1] || "";
    const leadingStart = Math.max(0, index - 8);
    const leading = rawIdentityFragments.slice(leadingStart, index - 1);
    const leadingRoleIndex = leading.findLastIndex(isPrivateAssetRoleLink);
    const leadingPrivateAssetIndex = leading.findLastIndex((word, wordIndex) => {
      const absoluteIndex = leadingStart + wordIndex;
      return isRoleLinkedPrivateAssetAt(absoluteIndex) && !roleAssetIsPublic(absoluteIndex);
    });
    if (/^(?:by|of)$/iu.test(connector)
      && leadingRoleIndex >= 0
      && (
        leadingPrivateAssetIndex >= 0
        || privateAssetInRange(index + 2, Math.min(rawIdentityFragments.length, index + 9))
      )) return true;

    const trailingRoleIndex = rawIdentityFragments
      .slice(index + 2, index + 6)
      .findIndex(isPrivateAssetRoleLink);
    return connector === "with"
      && leadingPrivateAssetIndex >= 0
      && trailingRoleIndex >= 0
      && rawIdentityFragments.slice(index + 2, index + 2 + trailingRoleIndex)
        .every(isPrivateAssetRoleBridge);
  });
  const lowercaseNamedPrivateAssetMatches = [...textWithoutKnownOrganizations.matchAll(
    /(?<!\p{L})(\p{Ll}[\p{Ll}'’-]{1,39})(?:\s+|[._/:·—-]\s*)(\p{Ll}[\p{Ll}'’-]{1,39})\s+(?=(?:katastri\w*|(?:naaber|naabri|metsa|era|rendi)?kinnist\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|metsaeraldis\w*|metsamaa\w*|puurkaev\w*|erakaev\w*|eramaa\w*|eratalu\w*|rendikinnist\w*|property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)(?!\p{L}))/gu,
  )];
  const hasLowercaseNamedPrivateAssetAssociation = hasPrivateAssetReference
    && lowercaseNamedPrivateAssetMatches.some(([, first, second]) => (
      isSuspiciousIdentityFragment(first)
      && isSuspiciousIdentityFragment(second)
      && !isEcologicalCommonNamePair(first, second)
    ));
  const potentialRoleLinkedNamePairIndexes = rawIdentityFragments.flatMap((first, index) => {
    const second = rawIdentityFragments[index + 1];
    return Boolean(second)
      && isRoleLinkedNameFragment(first)
      && isRoleLinkedNameFragment(second)
      && !isEcologicalCommonNamePair(first, second)
      && !rawIdentityFragments.slice(Math.max(0, index - 1), index + 5)
        .some(isRoleLinkedOrganizationMarker) ? [index] : [];
  });
  const hasPotentialNamedOwnPrivateAssetAssociation = rawIdentityFragments.some((word, assetIndex) => (
    /^(?:erakaev\w*|eratalu\w*|eramaa\w*|eramets\w*|maja\w*|kinnist\w*|puurkaev\w*)$/iu.test(word)
      && /^(?:oma|tema)$/iu.test(rawIdentityFragments[assetIndex - 1] || "")
      && potentialRoleLinkedNamePairIndexes.some((nameIndex) => nameIndex + 1 < assetIndex - 1)
  ));
  const hasStructuredNamedPerson = hasExplicitCapitalizedPersonName
    || hasInitialAndSurnamePersonName
    || (hasLeadingLowercaseNamedRole && !hasKnownPublicOrganization)
    || hasRecordedLowercaseNamedRole
    || hasTrailingLowercaseNamedRole
    || hasRoleLinkedNamedPrivateAssetAssociation
    || strongNamedSubjectPairIndexes.length > 0
    || hasStrongGrammarNamedPrivateAssetAssociation
    || hasLowercaseNamedPrivateAssetAssociation;
  const normalizedRegulatoryText = normalize(text);
  const hasProtectedAreaConstructionLocation = ESTONIAN_PROTECTED_BUILDING_LOCATION_IN_TEXT_PATTERN
    .test(normalizedRegulatoryText);
  const hasProtectedAreaConstructionSignals = hasProtectedAreaConstructionLocation
    && ESTONIAN_BUILDING_ACTIVITY_IN_TEXT_PATTERN.test(normalizedRegulatoryText);
  // A broader stem check is fail-closed only: any unreviewed construction
  // inflection in an official-contact query is blocked below unless the
  // complete strict public helper accepts it.
  const hasProtectedAreaOrganizationConstructionContactContext = hasKnownPublicOrganization
    && hasInstitutionalContactChannel
    && hasProtectedAreaConstructionLocation
    && /(?:^|\s)(?:ehit|raja|planeeri|pustit|renoveeri|rekonstrueeri)[a-z-]{0,30}(?=\s|$)/u
      .test(normalizedRegulatoryText);
  const hasProtectedAreaRegulatoryConstructionContext = (
    hasProtectedAreaConstructionSignals
      && ESTONIAN_REGULATORY_CONSENT_IN_TEXT_PATTERN.test(normalizedRegulatoryText)
  ) || hasProtectedAreaOrganizationConstructionContactContext;
  const regulatoryTokenIsActivity = (token) => ESTONIAN_BUILDING_ACTIVITY_TOKEN_PATTERN
    .test(normalize(token));
  const regulatoryTokenIsReviewedPublicSyntax = (token) => {
    const normalizedToken = normalize(token);
    return ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_PATTERN.test(normalizedToken)
      || ESTONIAN_REGULATORY_BUILDING_EXACT_TOKEN_PATTERN.test(normalizedToken)
      || ESTONIAN_PROTECTED_BUILDING_LOCATION_TOKEN_PATTERN.test(normalizedToken)
      || ESTONIAN_BUILDING_ACTIVITY_TOKEN_PATTERN.test(normalizedToken)
      || /^(?:ja|ning|kas|kelle|luba|loa|nousolek|nousoleku|nousolekut|kooskolastus|kooskolastuse|kooskolastust|on|vaja|vajalik|noutav|voib|tohib|saab|palun|oelge|selgitage)$/u.test(normalizedToken);
  };
  const regulatoryDescriptorHasRawIdentitySignal = (token, index) => {
    if (!ESTONIAN_PUBLIC_BUILDING_DESCRIPTOR_TOKEN_PATTERN.test(normalize(token))) return false;
    const match = residualContactNameMatches[index];
    if (!match || !Number.isSafeInteger(match.index)) return true;
    const leading = textWithoutKnownOrganizations.slice(0, match.index);
    const trailing = textWithoutKnownOrganizations.slice(match.index + match[0].length);
    const explicitlyQuoted = /["“„«'‘]\s*$/u.test(leading)
      && /^\s*["”»'’]/u.test(trailing);
    const beginsSentence = !leading.trim() || /[.!?]\s*$/u.test(leading);
    // Keep sentence-initial capitalization available for ordinary prose, but
    // never let a quoted or mid-sentence title-cased surname collision become
    // indistinguishable from a lower-case building descriptor.
    return explicitlyQuoted || !beginsSentence;
  };
  // A period after a single capital initial belongs to the name, not to the
  // sentence boundary ("J. Tamm küsib nõu. ..."). Acronym-final periods such
  // as "RMK." still split because there is no word boundary before the K.
  const regulatoryClauseBoundaryPattern = /(?<!\b\p{Lu})\.+|[!?;]+|\s[-—–]\s/gu;
  const regulatoryClauseBoundaries = [...textWithoutKnownOrganizations
    .matchAll(regulatoryClauseBoundaryPattern)];
  const regulatoryClauseTokensAt = (index) => {
    const focus = residualContactNameMatches[index];
    if (!focus || !Number.isSafeInteger(focus.index)) return [];
    const leadingBoundary = regulatoryClauseBoundaries
      .findLast((boundary) => boundary.index < focus.index);
    const trailingBoundary = regulatoryClauseBoundaries
      .find((boundary) => boundary.index > focus.index);
    const clauseStart = leadingBoundary
      ? leadingBoundary.index + leadingBoundary[0].length
      : 0;
    const clauseEnd = trailingBoundary?.index ?? textWithoutKnownOrganizations.length;
    return residualContactNameMatches.flatMap((match, originalIndex) => (
      match.index >= clauseStart && match.index < clauseEnd
        ? [{ originalIndex, token: match[0] }]
        : []
    ));
  };
  const regulatoryIdentitySharesConstructionClause = (index, identityWidth) => {
    const clauseTokens = regulatoryClauseTokensAt(index);
    const localIndex = clauseTokens.findIndex((item) => item.originalIndex === index);
    if (localIndex < 0) return false;
    const activityAfterObject = clauseTokens
      .slice(localIndex + identityWidth + 1)
      .some((item) => regulatoryTokenIsActivity(item.token));
    const activityBeforeObject = clauseTokens
      .slice(0, localIndex)
      .some((item) => regulatoryTokenIsActivity(item.token))
      && Boolean(clauseTokens[localIndex + identityWidth]);
    return activityAfterObject || activityBeforeObject;
  };
  const hasAttachedCapitalizedRegulatoryName = residualContactNameTokens
    .some((first, index, tokens) => {
      const second = tokens[index + 1] || "";
      return isTitleCasedIdentityToken(first)
        && isTitleCasedIdentityToken(second)
        && !regulatoryTokenIsReviewedPublicSyntax(first)
        && !regulatoryTokenIsReviewedPublicSyntax(second)
        && regulatoryIdentitySharesConstructionClause(index, 2);
    });
  const hasAttachedSingleCapitalizedPossessor = residualContactNameTokens
    .some((token, index, tokens) => (
      isTitleCasedIdentityToken(token)
      && (
        !regulatoryTokenIsReviewedPublicSyntax(token)
        || regulatoryDescriptorHasRawIdentitySignal(token, index)
      )
      && !ESTONIAN_PROTECTED_BUILDING_LOCATION_TOKEN_PATTERN.test(normalize(tokens[index + 1] || ""))
      && regulatoryIdentitySharesConstructionClause(index, 1)
    ));
  const hasAttachedLowercaseRegulatoryName = residualContactNameTokens
    .some((first, index, tokens) => {
      const second = tokens[index + 1] || "";
      const normalizedFirst = normalize(first);
      const normalizedSecond = normalize(second);
      return isSuspiciousIdentityFragment(normalizedFirst)
        && isSuspiciousIdentityFragment(normalizedSecond)
        && !isEcologicalCommonNamePair(normalizedFirst, normalizedSecond)
        && !regulatoryTokenIsReviewedPublicSyntax(first)
        && !regulatoryTokenIsReviewedPublicSyntax(second)
        && regulatoryIdentitySharesConstructionClause(index, 2);
    });
  const hasAttachedPrivateConstructionPossessor = ESTONIAN_PRIVATE_CONSTRUCTION_POSSESSOR_PATTERNS
    .some((pattern) => pattern.test(normalizedRegulatoryText));
  const regulatoryTokenIsPrivateConstructionPossessor = (token, index, tokens) => {
    const normalizedToken = normalize(token);
    if (/^(?:minu|meie|oma|tema|nende|naabri|sobra|sopra|perekonna|pereliikme|vanaema|vanaisa|vanavanema|vanatadi|tadi|onu|ema|isa|oe|venna|abikaasa|elukaaslase|lapse|tutre|poja|sugulase|kolleegi)$/u.test(normalizedToken)) {
      return true;
    }
    return normalizedToken === "selle"
      && tokens.slice(index + 1, index + 4).some((candidate) => normalize(candidate) === "inimese");
  };
  const hasBoundedPrivateConstructionPossessor = residualContactNameTokens
    .some((token, index, tokens) => (
      regulatoryTokenIsPrivateConstructionPossessor(token, index, tokens)
      && regulatoryIdentitySharesConstructionClause(index, 1)
    ));
  const regulatoryClauseTexts = text
    .split(regulatoryClauseBoundaryPattern)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const benignRegulatoryContextNameSource = BENIGN_REGULATORY_CONTEXT_NAME_SOURCE;
  // These exact attribution verbs and publication nouns describe the named
  // speaker or author, not a private building owner. The exception remains
  // complete-query anchored below and the regulatory tail must independently
  // pass the reviewed public grammar before the name can be released.
  const benignRegulatoryAttributionSource = BENIGN_REGULATORY_ATTRIBUTION_SOURCE;
  const benignNamedRegulatoryContextPatterns = BENIGN_NAMED_REGULATORY_CONTEXT_PATTERNS;
  const isReviewedBenignRegulatoryAttribution = (clause) => {
    if (benignNamedRegulatoryContextPatterns.some((pattern) => pattern.test(clause))) return true;
    const withoutPublicOrganization = removeFirstPublicOrganizationName(clause).trim();
    return normalize(withoutPublicOrganization) !== normalize(clause)
      && new RegExp(String.raw`^${benignRegulatoryAttributionSource}$`, "u")
        .test(withoutPublicOrganization);
  };
  const reviewedBenignNamedRegulatoryContext = regulatoryClauseTexts.length === 2
    && regulatoryClauseTexts.some((clause) => isReviewedGenericProtectedAreaConsentQuery(clause))
    && regulatoryClauseTexts.some(isReviewedBenignRegulatoryAttribution);
  const benignAdviceText = text.trim();
  const benignAdviceTailSource = String.raw`(?:\s*[:,]\s*|\s+)([\s\S]+?)[.!?]?$`;
  const benignNamedAdviceMatch = benignAdviceText.match(new RegExp(
    String.raw`^${benignRegulatoryContextNameSource}\s+${benignRegulatoryAttributionSource}(?:\s*[:,]\s*|\s+)([\s\S]+?)[.!?]?$`,
    "u",
  ));
  const startsWithExactPublicOrganization = PUBLIC_ORGANIZATION_EXACT_NAME_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    const match = pattern.exec(benignAdviceText);
    pattern.lastIndex = 0;
    return match?.index === 0;
  });
  const withoutLeadingPublicOrganization = startsWithExactPublicOrganization
    ? removeFirstPublicOrganizationName(benignAdviceText).trim()
    : "";
  const benignPublicOrganizationAdviceMatch = startsWithExactPublicOrganization
    ? withoutLeadingPublicOrganization.match(new RegExp(
      String.raw`^${benignRegulatoryAttributionSource}${benignAdviceTailSource}`,
      "u",
    ))
    : null;
  const benignAdviceMatch = benignNamedAdviceMatch || benignPublicOrganizationAdviceMatch;
  const benignNamedAdviceTail = benignAdviceMatch?.[1] || "";
  const reviewedBenignNamedProtectedAreaAdvice = Boolean(benignAdviceMatch)
    && isReviewedBenignProtectedAreaAdviceTail(benignNamedAdviceTail);
  const hasProtectedAreaPrivateConstructionAssociation = hasProtectedAreaRegulatoryConstructionContext
    && (
      hasAttachedCapitalizedRegulatoryName
      || hasAttachedSingleCapitalizedPossessor
      || hasAttachedLowercaseRegulatoryName
      || hasAttachedPrivateConstructionPossessor
      || hasBoundedPrivateConstructionPossessor
    );
  const hasNamedPrivateResidualClause = hasPotentialNamedOwnPrivateAssetAssociation
    || (hasStructuredNamedPerson && [
    /\b(?:and|plus)\s+(?:where\s+(?:does|is)\s+(?:he|she|they|his|her|their)|who\s+(?:owns?|controls?|holds?|manages?)\s+(?:his|her|their))\b/iu,
    /(?:\band\b|[;,])\s*(?:where\s+can\s+(?:he|she|they)\s+be\s+found|(?:locate|find)\s+(?:him|her|them)|tell\s+me\s+(?:his|her|their)\s+whereabouts|what\s+is\s+(?:his|her|their)\s+(?:wife|husband|spouse)(?:'s|’s)?\s+name|who\s+is\s+(?:his|her|their)\s+(?:wife|husband|spouse))\b/iu,
    /\b(?:his|her|their)\s+(?:(?:separate|adjacent|private|family|household|residential)\s+)*(?:premises|site|cottage|property|parcel|plot|land|farm|well|borehole|forest|woodland)\b/iu,
    /\b(?:ja|ning)\s+(?:kus\s+(?:ta|tema)|kellele\s+kuulub\s+tema)\b/iu,
    /\b(?:oma|tema)\s+(?:erakaev\w*|eratalu\w*|eramaa\w*|eramets\w*|maja\w*|kinnist\w*|puurkaev\w*)\b/iu,
    /(?:\band\b|[;,])\s*(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?(?:find|locate|identify|contact|show)\s+(?:him|her|them)\b/iu,
    /(?:\band\b|[;,])\s*(?:what\s+is\s+)?(?:the\s+)?name\s+of\s+(?:his|her|their)\s+(?:wife|husband|spouse)\b/iu,
    ].some((pattern) => pattern.test(textWithoutKnownOrganizations)));
  const englishOpenClassNamedRoleAssociationLookup = !englishPublicAggregate
    && hasStructuredNamedPerson
    && englishExplicitSensitiveScope
    && (
      englishOpenClassRoleAssignmentRelationship
      || /(?<!\p{L})\p{Lu}[\p{Ll}'’-]{1,39}\s+\p{Lu}[\p{Ll}'’-]{1,39}\s*,\s*(?:\p{L}[\p{L}'’-]{1,30}\s+){0,4}\p{L}[\p{L}'’-]{1,30}\s+(?:for|of|over)\b/u.test(textWithoutKnownOrganizations)
      || /\b(?:property|parcel|plot|lot|estate|land|well|borehole|forest|woodland)\b[\s\S]{0,55}\b(?:is|was)\s+\p{Lu}[\p{Ll}'’-]{1,39}\s+\p{Lu}[\p{Ll}'’-]{1,39}(?!\p{L})/u.test(textWithoutKnownOrganizations)
    );
  const englishOpenClassNamedRoleAssetLookup = !englishPublicAggregate
    && hasStructuredNamedPerson
    && hasAdjacentSuspiciousPair
    && new RegExp(
      String.raw`\b(?:is|was|as)\s+(?:(?:the|an?)\s+)?(?:\p{L}[\p{L}'’-]{1,30}\s+){0,3}\p{L}[\p{L}'’-]{1,30}\s+(?:for|of|over)\s+(?:(?:the|this|that|an?)\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}(?![\p{L}-]|\s+(?:permits?|guidance|policy|rules?|data|biodiversity|monitoring|research|information|requirements?)\b)`,
      "iu",
    ).test(textWithoutKnownOrganizations);
  const englishNamedRoleAssetLookup = !englishPublicAggregate
    && hasStructuredNamedPerson
    && englishAssetRoleRelationship
    && new RegExp(String.raw`(?<!\p{L})${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`, "iu").test(text);
  const namedPersonSensitiveOrAssetLookup = hasStructuredNamedPerson && (
    hasEstonianRegulatoryBuildingContext
    || /\b(?:identity|identify|identification|personal\s+(?:id|data|information)|private\s+assets?|birth\s+(?:year|date)|financial(?:\s*\/\s*property)?\s+data|property\s+data|residence|residency|resident\s+status|domicile|home\s+location|coordinates?|contact|phone|telephone|email|address)\b/iu.test(textWithoutKnownOrganizations)
    || /\b(?:isiku\s+tuvast\w*|isiklik\w*\s+(?:andm\w*|vara\w*)|varalis\w*\s+andm\w*|sünni(?:aasta|aeg|kuupäev)\w*|synni(?:aasta|aeg|kuupaev)\w*|elukoh\w*|kodukoht\w*|residentsus\w*|kodune\s+paik|koordinaa\w*|omand\w*|valdusõigus\w*)\b/iu.test(textWithoutKnownOrganizations)
    || (/\b(?:permit|loa\w*|toimik\w*|register|registry|andmestik\w*)\b/iu.test(textWithoutKnownOrganizations)
      && /\b(?:identify|identity|behind|attached|tuvast\w*|isiku\w*)\b/iu.test(textWithoutKnownOrganizations))
    || (/\b(?:show|find|locate|identify|reveal|display|näita|naita|leia|otsi)\b/iu.test(textWithoutKnownOrganizations)
      && /\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|cottage|(?:kõrval|naaber)?kinnist\w*|maa\w*|maat(?:ü|u)k\w*|maja\w*|kaev\w*)\b/iu.test(textWithoutKnownOrganizations))
    || (/\b(?:omanik\w*|valdaja\w*|valdus\w*|haldaja\w*|haldur\w*|käitaja\w*|kasutaja\w*|tenant|operator|manager)\b/iu.test(textWithoutKnownOrganizations)
      && /\b(?:kinnist\w*|maa\w*|maat(?:ü|u)k\w*|maja\w*|kaev\w*|property|parcel|plot|lot|estate|land|house|home|farm|well|borehole)\b/iu.test(textWithoutKnownOrganizations))
  );
  const englishRecordedNamedRoleAssetLookup = hasStructuredNamedPerson
    && new RegExp(String.raw`\b(?:entrusted\s+with|(?:described|listed|recorded)\s+as\s+(?:a\s+)?${englishRoleNounSource}\s+(?:for|of))\b[\s\S]{0,90}\b${ENGLISH_PRIVATE_ASSET_SOURCE}\b`, "iu").test(textWithoutKnownOrganizations);
  const englishPermitIdentityLookup = /\b(?:who|whom|whose|whoever|which\s+(?:private\s+)?person|what\s+(?:private\s+)?person|identify|name|reveal|show)\b[\s\S]{0,90}\b(?:private\s+person|identity|person|individual|party|whoever)\b[\s\S]{0,90}\b(?:permit|licen[cs]e|filing|file)\b/iu.test(text)
    || /\b(?:identity|private\s+person|person|individual)\b[\s\S]{0,45}\b(?:attached|associated|behind|linked|connected)\b[\s\S]{0,45}\b(?:permit|licen[cs]e|filing|file)\b/iu.test(text);
  const englishRolePredicateCount = (text.match(/\b(?:own\w*|manag\w*|administ\w*|operat\w*|run(?:s|ning)?|ran|monitor\w*|supervis\w*|overse\w*|oversaw|control\w*|hold(?:s|ing)?|held|possess\w*|us(?:e|es|ed|ing)|occup\w*|leas\w*|rent\w*|maintain\w*|steward\w*|care(?:s|d|ing)?|responsible|accountable|manager|controller)\b/giu) || []).length;
  const englishMixedPrivateAssetReference = /\b(?:private(?:ly)?(?:\s+held)?|nonpublic|neighbor(?:ing)?|neighbour(?:ing)?|another|other|latter|former|second|third|adjacent|adjoining|nearby|counterpart|holding|separate(?:ly)?|independent(?:ly)?|unrelated|premises|site|next\s+door|across\s+the\s+road)\b/iu.test(englishPublicResidual);
  // A single interrogative can govern two coordinated role predicates. When
  // one predicate names a public asset and the other points at a private or
  // anaphoric asset, the whole request is a private role lookup.
  const englishMixedPublicPrivateRoleLookup = englishPublicAssetMatches.length > 0
    && englishRoleInterrogativeCount > 0
    && englishRolePredicateCount >= 2
    && englishMixedPrivateAssetReference;
  const englishStreetRoleAssociation = englishStreetAddress && englishAssetRoleRelationship;
  const estonianPublicAssetPattern = /\b(?:(?:riigimetsa\s+|(?:riigi|avalik\w*|munitsipaal\w*|omavalitsuse|linna|valla)\s*|(?:riigi|avalikus?)\s+omandis\s+(?:olev\w*\s+)?|riigile\s+kuuluv\w*\s+)(?:metsamaa|mets|metsa|maa(?:u|ü)ksus|maat(?:ü|u)k|kinnistu|puurkaev|erakaev|hoone)\w*|riigimets\w*|rahvusmets\w*)\b/giu;
  const estonianPublicAssetMatches = [...text.matchAll(estonianPublicAssetPattern)];
  const estonianPublicResidual = text.replace(estonianPublicAssetPattern, " ");
  const estonianPublicAggregate = estonianPublicAssetMatches.length > 0
    && !CADASTRE_PATTERN.test(text)
    && !/\baadress\w*\b/iu.test(text)
    && !/\b(?:katastri\w*|(?:naaber|naabri)?kinnist\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|puurkaev\w*|erakaev\w*|eramaa\w*)\b/iu.test(estonianPublicResidual)
    && !/\b(?:naaber|kõrval|teine|muu|era|isiklik)\w*\s+(?:üks|uks|objekt)\w*\b/iu.test(estonianPublicResidual);
  const estonianConcreteAssetContext = hasEstonianRegulatoryBuildingContext
    || /\b(?:katastri\w*|(?:(?:naaber|naabri|metsa|era|rendi)?kinnist)\w*|metsaeraldis\w*|metsamaa\w*|erapuistu\w*|eramaa\w*|eratalu\w*|(?:kõrval|naaber)maa\w*|(?:kõrval|naaber)?maja\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)k{1,2}\w*|puurkaev\w*|erakaev\w*|(?:(?:perekonna|era|isiklik)\s+kaev)\w*|talu(?:koht|koha)\w*|rendi(?:leping|lepingu)\w*|üüri(?:leping|lepingu)\w*|uuri(?:leping|lepingu)\w*|hoone\w*|aadress\w*)\b/iu.test(text)
    || rawIdentityFragments.some((word) => ESTONIAN_PRIVATE_FOREST_NOUN_PATTERN.test(word));
  const estonianIdentityRolePrompt = /(?<!\p{L})(?:kes|kelle|kellele|keda|nimeta|loetle|näita|naita|leia|otsi|tuvasta|anna|(?:millin\w*|millis\w*|mis)\s+(?:(?:füüsili\w*|fuusili\w*|konkreet\w*|era|õigusli\w*|oigusli\w*)\s+)*(?:isik\w*|inime\w*|eraisik\w*|amet))(?!\p{L})/iu.test(text);
  const estonianDirectRoleHolderPrompt = /(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?:(?:era|naaber|naabri|perekonna|isiklik)\w*\s+)*(?:omanik\w*|valdaja\w*|haldaja\w*|haldur\w*|operaator\w*|käitaja\w*|kasutaja\w*|asukas\w*|üürnik\w*|rentnik\w*|hoidja\w*|eestkostja\w*|volinik\w*|esindaja\w*|käsundisaaja\w*|kasusaaja\w*|kontaktisik\w*|litsentsisaaja\w*)(?!\p{L})/iu.test(text);
  const estonianAssetRoleRelationship = /(?<!\p{L})(?:omanik\w*|loaomanik\w*|valdaja\w*|valdus\w*|haldaja\w*|haldur\w*|haldus\w*|operaator\w*|käitaja\w*|kasutaja\w*|asukas\w*|üürni\w*|üüri\w*|rentni\w*|ülalpida\w*|hoidja\w*|hoole\s+all|õlul|oulul|eestkost\w*|pädev\w*|padev\w*|volitus\w*|volita\w*|volinik\w*|esindaja\w*|käsundisaaja\w*|kasusaaja\w*|kontaktisik\w*|litsentsisaaja\w*|kontsessionäär\w*|kontsessionaar\w*|usaldusisik\w*|korrashoi\w*|eestveda\w*|käsual\w*|kasual\w*|vastutus\w*|vastutav\w*|vastuta\w*|majanda\w*|kontrolli\w*|korralda\w*|halda\w*|hoolda\w*|kasuta\w*|kasutu\w*|valda\w*|valitse\w*|omab|omavad|kuulu\w*|hallata|käsutus\w*|juhi\w*|juhti\w*|käita\w*|opereeri\w*|järelevalv\w*|rendi\w*|nime(?:l|le)\w*|nimel)(?!\p{L})/iu.test(text);
  const estonianRoleHolderIdentityPrompt = /(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?:(?:era|naaber|naabri|perekonna|isiklik)\w*\s+)*(?:eramaa\w*|erakinnistu\w*|naaberkinnistu\w*|maa\w*|kinnistu\w*|maa(?:u|ü)ksuse\w*|maat(?:ü|u)ki\w*|kaevu\w*|puurkaevu\w*|hoone\w*)\s+(?:[\p{L}-]+\s+){0,2}[\p{L}-]+(?!\p{L})/iu.test(text);
  const estonianOpenClassAssetIdentityLookup = !estonianPublicAggregate
    && estonianConcreteAssetContext
    && /(?<!\p{L})kes\s+on(?!\p{L})/iu.test(text);
  const estonianNaturalPersonRoleLookup = estonianIdentityRolePrompt
    && /\b(?:füüsili\w*\s+isik\w*|fuusili\w*\s+isik\w*|eraisik\w*|inime\w*)\b/iu.test(text)
    && estonianAssetRoleRelationship
    && /\b(?:märgala\w*|margala\w*|natura\w*|kaitseala\w*|elupaik\w*|mets\w*|maa\w*|kinnist\w*|kaev\w*|puurkaev\w*|hoone\w*)\b/iu.test(text);
  const estonianOpenClassNamedAssetLookup = hasStructuredNamedPerson
    && hasAdjacentSuspiciousPair
    && !estonianPublicAggregate
    && estonianConcreteAssetContext
    && /\b(?:on|oli|oleks|tegutse\w*|toimi\w*|nimeta\w*|määra\w*|maara\w*)\b/iu.test(textWithoutKnownOrganizations);
  const estonianGeneralRoleIdentityLookup = !estonianPublicAggregate
    && estonianConcreteAssetContext
    && (estonianIdentityRolePrompt || estonianRoleHolderIdentityPrompt || estonianDirectRoleHolderPrompt)
    && estonianAssetRoleRelationship;
  const estonianDirectIdentityAssetLookup = !estonianPublicAggregate
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && (
      /(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?:(?:füüsili\w*|fuusili\w*|konkreet\w*|era|õigusli\w*|oigusli\w*)\s+)*(?:isik\w*|inime\w*|eraisik\w*)(?!\p{L})/iu.test(text)
      || estonianDirectRoleHolderPrompt
      || /(?<!\p{L})(?:nimeta|tuvasta|keda)(?!\p{L})/iu.test(text)
    );
  const estonianIdentityResidenceLookup = estonianIdentityRolePrompt
    && hasResidenceContext
    && (
      estonianConcreteAssetContext
      || CADASTRE_PATTERN.test(text)
      || (/(?<!\p{L})registr\w*(?!\p{L})/iu.test(text)
        && /(?<!\p{L})(?:kaev|kinnist|maa|maatü|maatu|hoone)\w*(?!\p{L})/iu.test(text)
        && estonianAssetRoleRelationship)
    );
  const estonianOpenClassIdentityReferencePattern = /(?<!\p{L})(?:kes|kelle|kellele|keda|keegi|nimeta|tuvasta|anna\s+(?:selle\s+)?isiku\s+nimi)(?!\p{L})/iu;
  const estonianOpenClassIdentityReference = estonianOpenClassIdentityReferencePattern.test(textWithoutKnownOrganizations);
  const estonianOpenClassRoleAssignmentRelationship = [
    /(?<!\p{L})(?:roll|ülesan|ulesan|mandaa[dt]|amet|positsioon|volitus|nimeli|volita)\w*(?!\p{L})/iu,
    /(?<!\p{L})(?:määrati|maarati|määras|maaras|nimetati|nimetas|volitati|volitas|pandi|valiti|anti|sai|osutus|jäi|jai|läks|laks)(?!\p{L})[\s\S]{0,55}(?<!\p{L})\p{L}[\p{L}'’-]{2,35}(?:ks|na)(?!\p{L})/iu,
    /(?<!\p{L})(?:tegutse|toimi|täida|taida|tööta|toota)\w*(?!\p{L})[\s\S]{0,55}(?<!\p{L})\p{L}[\p{L}'’-]{2,35}(?:ks|na)(?!\p{L})/iu,
    /(?<!\p{L})\p{L}[\p{L}'’-]{2,35}(?:ks|na)(?!\p{L})[\s\S]{0,35}(?<!\p{L})(?:osutus|jäi|jai|oli|on)(?!\p{L})/iu,
    /(?<!\p{L})(?:määras|maaras|nimetas|valis)(?!\p{L})[\s\S]{0,80}(?<!\p{L})kes\s+(?:see|ta)\s+oli(?!\p{L})/iu,
    /(?<!\p{L})(?:kohal|koht)\w*(?!\p{L})[\s\S]{0,25}(?<!\p{L})(?:on|oli|läks|laks)(?!\p{L})/iu,
    /(?<!\p{L})(?:registr|toimik)\w*(?!\p{L})[\s\S]{0,55}(?<!\p{L})(?:seisab|seisis|kirjas)(?!\p{L})[\s\S]{0,35}(?<!\p{L})\p{L}[\p{L}'’-]{2,35}(?:ks|na)(?!\p{L})/iu,
  ].some((pattern) => pattern.test(textWithoutKnownOrganizations));
  const estonianOpenClassRoleAssociationLookup = !estonianPublicAggregate
    && !reviewedComplianceQuestion
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && estonianOpenClassIdentityReference
    && estonianOpenClassRoleAssignmentRelationship;
  const estonianOpenClassNamedRoleAssociationLookup = !estonianPublicAggregate
    && hasStructuredNamedPerson
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && (estonianOpenClassRoleAssignmentRelationship
      || /(?<!\p{L})\p{Lu}[\p{Ll}'’-]{1,39}\s+\p{Lu}[\p{Ll}'’-]{1,39}\s*,\s*(?:erakaevu|eramaa|perekonna\s+kaevu|naaberkinnistu\w*)\s+\p{L}[\p{L}'’-]{2,40}\s*,/u.test(textWithoutKnownOrganizations));
  // “Kelle nõusolekut/luba on vaja?” asks which public authority must
  // approve a regulated activity, not who owns a building. Only reviewed,
  // complete generic grammars are exempt; any unconsumed person, possessor,
  // location or private-asset clause keeps the ordinary identity guard.
  const estonianGenericRegulatoryConsentQuestion = isReviewedGenericProtectedAreaConsentQuery(text)
    && !hasProtectedAreaPrivateConstructionAssociation
    && !CADASTRE_PATTERN.test(text)
    && !hasSensitiveContact
    && !hasSensitivePersonalAttribute
    && !hasPrivatePostalField
    && !hasPersonOrOwnerPredicate;
  const estonianResidualOpenClassIdentityReference = estonianOpenClassIdentityReferencePattern.test(
    textWithoutKnownOrganizations.replace(
      /(?<!\p{L})kelle\s+(?:(?:eelnev|kirjalik|ametlik)\w*\s+)?(?:nõusolek|kooskõlastus|heakskiit|luba)\w*(?!\p{L})/giu,
      " ",
    ),
  );
  const estonianDirectPrivateIdentityLookup = !estonianPublicAggregate
    && !reviewedComplianceQuestion
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && estonianOpenClassIdentityReference
    && (!estonianGenericRegulatoryConsentQuestion || estonianResidualOpenClassIdentityReference);
  const estonianOpenClassWhichRoleIdentityLookup = !estonianPublicAggregate
    && !reviewedComplianceQuestion
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && estonianAssetRoleRelationship
    && /(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?![^?]{0,45}(?<!\p{L})(?:avalik\w*|riigi\w*|asutus\w*|amet\w*|organisatsioon\w*|reegl\w*|õigus\w*|oigus\w*|juhis\w*|nõue\w*|noue\w*|meetod\w*|süsteem\w*|susteem\w*|andmestik\w*|kaart\w*|teenus\w*|vald\w*|maakond\w*|linn\w*|küla\w*|kyla\w*|asula\w*|piirkon\w*|omavalitsus\w*|territoorium\w*|veekogu\w*|jõgi\w*|jogi\w*|register\w*)(?!\p{L}))(?:(?:era|naaber|naabri|perekonna|isiklik|konkreet\w*)\s+)*(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}(?!\p{L})/iu.test(textWithoutKnownOrganizations);
  const estonianOpenClassRegistryRoleIdentityLookup = !estonianPublicAggregate
    && !reviewedComplianceQuestion
    && (estonianConcreteAssetContext || CADASTRE_PATTERN.test(text))
    && [
      /(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?!(?:avalik\w*|riigi\w*|asutus\w*|amet\w*|organisatsioon\w*|reegl\w*|õigus\w*|oigus\w*|juhis\w*|nõue\w*|noue\w*|meetod\w*|süsteem\w*|susteem\w*)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}\s+(?:on|oli|seisab|seisis)\b[\s\S]{0,70}(?<!\p{L})(?:registr|toimik|kand|kirje)\w*(?!\p{L})/iu,
      /(?<!\p{L})(?:registr|toimik|kand|kirje)\w*(?!\p{L})[\s\S]{0,50}(?<!\p{L})(?:nimetab|nimetas|loetleb|loetles|tuvastab|tuvastas)(?!\p{L})[\s\S]{0,35}(?<!\p{L})(?:millin\w*|millis\w*|mis)\s+(?!(?:avalik\w*|riigi\w*|asutus\w*|amet\w*|organisatsioon\w*)\b)(?:\p{L}[\p{L}'’-]{1,30}\s+){0,2}\p{L}[\p{L}'’-]{1,30}(?!\p{L})/iu,
    ].some((pattern) => pattern.test(textWithoutKnownOrganizations));
  const estonianNamedRoleAssetLookup = hasStructuredNamedPerson
    && (estonianConcreteAssetContext || /\bmaa\b/iu.test(text))
    && estonianAssetRoleRelationship;
  const estonianPrivateAssetRoleLookup = !estonianPublicAggregate && (
    /\bkes\b[\s\S]{0,100}\b(?:katastri\w*|(?:(?:naaber|naabri|metsa)?kinnist)\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|puurkaev\w*|aadress\w*)\b[\s\S]{0,60}\b(?:õiguspärane\s+)?(?:kasutaja|valdaja|haldaja|haldur|omanik|õigustatud\s+isik|vastutav\s+isik)\b/iu.test(text)
    || /\bkes\b[\s\S]{0,80}\b(?:õiguspärane\s+)?(?:kasutaja|valdaja|haldaja|haldur|omanik|õigustatud\s+isik|vastutav\s+isik)\b[\s\S]{0,60}\b(?:katastri\w*|(?:(?:naaber|naabri|metsa)?kinnist)\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|puurkaev\w*|aadress\w*)\b/iu.test(text)
    || /\b(?:nimeta|loetle|näita|naita|leia|otsi|tuvasta)\b[\s\S]{0,80}\b(?:katastri\w*|(?:(?:naaber|naabri|metsa)?kinnist)\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|puurkaev\w*|aadress\w*)\b[\s\S]{0,60}\b(?:kasutaja|valdaja|haldaja|haldur|omanik|õigustatud\s+isik|vastutav\s+isik)\b/iu.test(text)
  );
  const englishGeneralOwnerDutyQuestion = /^what\s+(?:responsibilit(?:y|ies)|rights?|dut(?:y|ies)|obligations?|rules?|requirements?)\s+(?:does|do)\s+(?:(?:an?|the)\s+)?(?:(?:private|forest|woodland|property|parcel|land)\s+){0,3}(?:owners?|landowners?|homeowners?|landholders?|proprietors?|landlords?)\s+have(?:\s+under\s+[\p{L}\s-]{1,60})?\??$/iu.test(text.trim());
  const englishGeneralOwnershipExemption = englishPublicAggregate || englishGeneralOwnerDutyQuestion;
  const englishExplicitIdentityEnumeration = ENGLISH_OWNER_ENUMERATION_ACTION_PATTERN.test(text)
    || ENGLISH_WHO_OWNER_ASSET_PATTERN.test(text)
    || /\b(?:list|show|find|identify|return|give|provide|reveal|disclose|name|enumerate|display)\b[\s\S]{0,80}\bprivate\s+(?:owners?|landowners?|homeowners?|residents?|individuals?|people|persons?)\b/iu.test(text)
    || /\b(?:which|what)\s+(?:individuals?|people|persons?|owners?|landowners?|homeowners?)\s+(?:own|hold|lease|rent)\w*\b[\s\S]{0,80}\b(?:properties|parcels|plots|land|houses|homes|farms|wells|boreholes)\b/iu.test(text)
    || /\bwho\s+are\s+(?:the\s+)?(?:private\s+)?(?:owners?|landowners?|homeowners?)\s+of\b[\s\S]{0,80}\b(?:properties|parcels|plots|land|houses|homes|farms|wells|boreholes)\b/iu.test(text);
  const englishAssetIdentityQuestion = /\b(?:who|whom|whose\s+name|which\s+person|show(?:\s+me)?\s+the\s+person)\b/iu.test(textWithoutKnownOrganizations)
    && englishPrivateAsset
    && /\b(?:(?:registered|recorded)(?:\s+(?:to|under|in))?|(?:associated|connected|linked)\s+(?:to|with)|(?:owned|held)\s+by)\b/iu.test(textWithoutKnownOrganizations)
    && !englishGeneralOwnershipExemption;
  const explicitIdentityRequestLanguage = englishRoleInterrogativeCount > 0
    || englishExplicitPersonPrivateAssetLookup
    || estonianIdentityRolePrompt
    || estonianRoleHolderIdentityPrompt
    || estonianDirectRoleHolderPrompt
    || estonianDirectIdentityAssetLookup
    || estonianIdentityResidenceLookup
    || englishExplicitNaturalPersonSensitiveScopeLookup
    || englishOpenClassAppointmentLookup
    || englishOpenClassRoleAssociationLookup
    || englishOpenClassNamedRoleAssociationLookup
    || englishDirectPrivateIdentityLookup
    || englishOpenClassWhichRoleIdentityLookup
    || englishOpenClassRegistryRoleIdentityLookup
    || estonianOpenClassAssetIdentityLookup
    || estonianNaturalPersonRoleLookup
    || estonianOpenClassRoleAssociationLookup
    || estonianOpenClassNamedRoleAssociationLookup
    || estonianDirectPrivateIdentityLookup
    || estonianOpenClassWhichRoleIdentityLookup
    || estonianOpenClassRegistryRoleIdentityLookup
    || /\b(?:identify|identity|name|reveal|show|find|locate|disclose|tuvasta|nimeta|näita|naita|leia|otsi)\b[\s\S]{0,45}\b(?:person|individual|party|human\s+being|isik\w*|inime\w*|eraisik\w*)\b/iu.test(textWithoutKnownOrganizations);
  const genericEnvironmentalActivityQuestion = !explicitIdentityRequestLanguage
    && !hasStructuredNamedPerson
    && !englishPrivateAssetRoleLookup
    && !englishOpenClassRoleIdentityLookup
    && !englishOpenClassRoleAssociationLookup
    && !englishOpenClassNamedRoleAssociationLookup
    && !englishDirectPrivateIdentityLookup
    && !englishOpenClassWhichRoleIdentityLookup
    && !englishOpenClassRegistryRoleIdentityLookup
    && !englishOpenClassNamedRoleAssetLookup
    && !englishNamedRoleAssetLookup
    && !englishRecordedNamedRoleAssetLookup
    && !englishPermitIdentityLookup
    && !englishMixedPublicPrivateRoleLookup
    && !englishStreetRoleAssociation
    && !estonianNamedRoleAssetLookup
    && !estonianOpenClassNamedAssetLookup
    && !estonianGeneralRoleIdentityLookup
    && !estonianOpenClassRoleAssociationLookup
    && !estonianOpenClassNamedRoleAssociationLookup
    && !estonianDirectPrivateIdentityLookup
    && !estonianOpenClassWhichRoleIdentityLookup
    && !estonianOpenClassRegistryRoleIdentityLookup
    && !estonianPrivateAssetRoleLookup
    && !englishAssetIdentityQuestion
    && !englishExplicitPersonPrivateAssetLookup
    && !matchesEnglishPersonalPattern
    && !hasSensitiveContact
    && !hasSensitivePersonalAttribute
    && !hasPrivatePostalField
    && /\b(?:biodivers\w*|elurikk\w*|linnurikk\w*|groundwater\w*|p[õo]hjave\w*|hydrolog\w*|sademeve\w*|wetland\w*|m[äa]rgal\w*|habitat\w*|elupai[kg]\w*|nahkhiir\w*|metsa\w*|forest\w*|woodland\w*|stream\w*|creek\w*|j[õo]e\w*|veekogu\w*)\b/iu.test(text)
    && /\b(?:affect\w*|impact\w*|effect\w*|maintain\w*|maintenance|restor\w*|monitor\w*|compar\w*|measure\w*|reduce\w*|comply\w*|follow\w*|rules?|pressure|koormus\w*|hoold\w*|taasta\w*|parand\w*|m[õo]ju\w*|m[õo][õo]d\w*|seire\w*|v[õo]rdle\w*|v[äa]henda\w*|surve\w*|reegl\w*|j[äa]rgi\w*)\b/iu.test(text);
  const englishPatternLookup = englishExplicitIdentityEnumeration
    || (matchesEnglishPersonalPattern && !(
      englishGeneralOwnershipExemption
      && !englishNamedResidenceQuestion
      && !englishNamedFoundQuestion
      && !englishNamedLocatedQuestion
      && !englishLocateNamedPerson
      && !englishOwnerContactIntent
    ));
  const englishPersonalLookup = (
    englishOwnershipIntent
      && (englishPrivateAsset || englishStreetAddress || englishSpecificForest)
      && !englishGeneralOwnershipExemption
  ) || (
    englishResidenceIntent
      && !englishWhereResidenceIsEcological
      && (hasNamedIdentity || englishPrivateAsset || englishStreetAddress || englishSpecificForest)
  ) || englishNamedResidenceQuestion
    || englishNamedFoundQuestion
    || englishNamedLocatedQuestion
    || englishLocateNamedPerson
    || englishOwnerContactIntent
    || englishNamedPossessiveContactIntent
    || (englishNamedAssetRelationship && !englishGeneralOwnershipExemption)
    || englishAssetIdentityQuestion
    || englishPatternLookup;
  const reviewedAllPublicAssetQuery = (englishPublicAggregate || estonianPublicAggregate)
    && !englishMixedPublicPrivateRoleLookup
    && !hasExplicitCapitalizedPersonName
    && !hasSensitiveContact
    && !hasSensitivePersonalAttribute
    && !hasPrivatePostalField
    && !PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text);
  const reviewedNamedPublicAssetEnvironmentalQuestion = hasExplicitCapitalizedPersonName
    && !hasSensitiveContact
    && !hasSensitivePersonalAttribute
    && !hasPrivatePostalField
    && [
      new RegExp(String.raw`^how\s+does\s+${ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE}\s+(?:manage\w*|maintain\w*|administer\w*|operate\w*|steward\w*)\s+(?:(?:an?|the)\s+)?(?:state(?:[-\s]+owned)?|public(?:ly[-\s]+owned|[-\s]+owned)?|national|municipal(?:ly[-\s]+owned)?|government(?:[-\s]+owned)?|city[-\s]+owned|county[-\s]+owned|federal)\s+(?:forest|woodland|land|property|estate|parcel|plot|lot|farm|well|borehole|building|dwelling)s?\?$`, "iu"),
      new RegExp(String.raw`^kuidas\s+m[õo]jutab\s+${ENGLISH_CAPITALIZED_PERSON_NAME_SOURCE}\s+(?:hallatav\w*\s+)?(?:riigimets\w*|rahvusmets\w*|avalik\w*\s+mets\w*)\s+(?:elupaik\w*|elurikk\w*)\?$`, "iu"),
    ].some((pattern) => pattern.test(text.trim()));
  const namedOwnerRoleLookup = hasExplicitCapitalizedPersonName && (
    new RegExp(String.raw`\b(?:owner|landowner|landholder|proprietor)\s+(?:is|named)\s+${ENGLISH_PERSON_NAME_SOURCE}\b`, "iu").test(text)
    || new RegExp(String.raw`\b${ENGLISH_PERSON_NAME_SOURCE}\s+is\s+(?:the\s+)?(?:owner|landowner|landholder|proprietor)\b`, "iu").test(text)
  );
  const explicitPersonalLookup = PERSONAL_LOOKUP_PATTERNS.some((pattern) => pattern.test(text))
    || hasAddressAndPresence
    || (hasHumanMarker && hasSensitiveContact)
    || (hasPrivateAssetReference && hasPrivateAssetIdentity && (
      hasStructuredNamedPerson
      || PRIVATE_ASSET_LOOKUP_ACTION_PATTERN.test(text)
      || hasPersonOrOwnerPredicate
      || hasSensitiveContact
      || hasSensitivePersonalAttribute
    ))
    || (hasNamedIdentity && (
      sensitiveIndex >= 0
      || hasSensitiveContact
      || hasSensitivePersonalAttribute
      || hasPrivatePostalField
    ))
    || (hasNamedIdentity && hasResidenceContext
      && !englishWhereResidenceIsEcological
      && !(englishWhereFoundMatch && englishSubjectIsEcological(englishWhereFoundMatch[1])))
    || hasNamedForestAssetLookup
    || hasNamedForestOwnership
    || englishNamedRoleAssetLookup
    || englishOpenClassRoleIdentityLookup
    || englishExplicitNaturalPersonSensitiveScopeLookup
    || englishOpenClassAppointmentLookup
    || englishOpenClassRoleAssociationLookup
    || englishOpenClassNamedRoleAssociationLookup
    || englishDirectPrivateIdentityLookup
    || englishOpenClassWhichRoleIdentityLookup
    || englishOpenClassRegistryRoleIdentityLookup
    || englishOpenClassNamedRoleAssetLookup
    || englishRecordedNamedRoleAssetLookup
    || contactScope === "private-person"
    || namedPersonSensitiveOrAssetLookup
    || englishPermitIdentityLookup
    || englishMixedPublicPrivateRoleLookup
    || englishStreetRoleAssociation
    || estonianNamedRoleAssetLookup
    || estonianOpenClassNamedAssetLookup
    || estonianOpenClassAssetIdentityLookup
    || estonianNaturalPersonRoleLookup
    || estonianDirectIdentityAssetLookup
    || estonianIdentityResidenceLookup
    || estonianOpenClassRoleAssociationLookup
    || estonianOpenClassNamedRoleAssociationLookup
    || estonianDirectPrivateIdentityLookup
    || estonianOpenClassWhichRoleIdentityLookup
    || estonianOpenClassRegistryRoleIdentityLookup
    || namedOwnerRoleLookup
    || (hasExplicitCapitalizedPersonName && /\b(?:identity|personal\s+(?:data|information))\b/iu.test(textWithoutKnownOrganizations))
    || estonianGeneralRoleIdentityLookup
    || englishExplicitPersonPrivateAssetLookup
    || englishPrivateAssetRoleLookup
    || estonianPrivateAssetRoleLookup
    || englishPersonalLookup;
  // A bounded named-person/role/private-asset association is conclusive at
  // this boundary. Do not let broader environmental, compliance, public-role
  // or organization allowlists reinterpret it after the identity has been
  // linked to a concrete asset.
  // Every conceptual form is complete-query anchored. The only former
  // open-class municipality form is now a current, case-folded municipality
  // identity lookup, so these reviewed forms cannot absorb an appended name,
  // contact field or private residual clause.
  if (reviewedConceptualPublicQuestion
    || isPlainEcologicalResidenceDescriptionQuestion(text)) return false;
  if (reviewedBenignNamedRegulatoryContext
    || reviewedBenignNamedProtectedAreaAdvice) return false;
  // Construction-object nouns are open class. Resolve a directly attached
  // person/possessor before honoring the exact whole-query public grammar;
  // otherwise unrelated name heuristics can also misread “Natura alal”.
  if (hasProtectedAreaPrivateConstructionAssociation) return true;
  // Public-organization contact wording is an availability exception only
  // after the positional private construction/name checks above have first
  // refusal. Keeping it here prevents normalized contact grammar from hiding
  // quoted, title-cased or punctuation-separated private building names.
  if (isReviewedPublicOrganizationProtectedBuildingContactQuery(text)) return false;
  if (hasProtectedAreaOrganizationConstructionContactContext) return true;
  if (estonianGenericRegulatoryConsentQuestion) return false;
  if (hasNamedPrivateResidualClause) return true;
  if (hasRoleLinkedNamedPrivateAssetAssociation) return true;
  if (hasStrongGrammarNamedPrivateAssetAssociation) return true;
  if (contactScope === "private-person" || contactScope === "ambiguous") return true;
  if (explicitPersonalLookup
    && !reviewedComplianceQuestion
    && !reviewedAllPublicAssetQuery
    && !reviewedNamedPublicAssetEnvironmentalQuestion
    && contactScope !== "public-organization"
    && !genericEnvironmentalActivityQuestion
    && !reviewedOpenRolePolicyQuestion
    && !reviewedConceptualPublicQuestion) return true;
  if (reviewedNamedPublicAssetEnvironmentalQuestion) return false;
  // Only apply the open-role policy exemption after every identity,
  // residence, ownership, private-asset and contact detector above has had
  // first refusal. This preserves generic duty questions without allowing
  // their prefix to short-circuit the personal-data boundary.
  if (reviewedOpenRolePolicyQuestion) return false;
  if (contactScope === "public-organization") return false;
  if (genericEnvironmentalActivityQuestion) return false;
  // Keep only reviewed whole-query owner-duty forms public, and only after
  // every named-person, relational-property, private-asset and sensitive-field
  // check above has run. The anchored allowlist cannot absorb extra identity,
  // owner-relation, cadastral or private-asset clauses.
  if (reviewedComplianceQuestion || estonianPublicAggregate) return false;
  return hasPrivateAssetReference && hasPersonOrOwnerPredicate;
}

// A named speaker can be part of a reviewed public regulatory question while
// still being unnecessary for retrieval or model generation. Remove only the
// complete, anchored attribution forms accepted above; the environmental tail
// must independently remain public before it can cross an upstream boundary.
export function minimizePublicProviderQuery(value, {
  maximumLength = MAX_PUBLIC_SEARCH_QUERY_LENGTH,
} = {}) {
  const canonicalInput = canonicalizePublicSearchQuery(value, { maximumLength });
  if (!canonicalInput.ok) return "";
  const originalQuery = canonicalInput.query;
  if (containsUnsafeInstruction(originalQuery)
    || containsPrivatePersonLookup(originalQuery)
    || hasLossyUnicodeForestryAreaResidual(originalQuery)) return "";

  let candidate = "";
  const clauses = splitPublicQueryClauses(originalQuery);
  if (clauses.length === 2) {
    const attributionIndex = clauses.findIndex(isBenignNaturalPersonAttributionClause);
    const tailIndex = attributionIndex < 0 ? -1 : 1 - attributionIndex;
    if (tailIndex >= 0 && isReviewedBenignProtectedAreaAdviceTail(clauses[tailIndex])) {
      candidate = clauses[tailIndex];
    }
  }

  if (!candidate) {
    const inline = originalQuery.match(new RegExp(
      String.raw`^(${BENIGN_REGULATORY_CONTEXT_NAME_SOURCE}\s+${BENIGN_REGULATORY_ATTRIBUTION_SOURCE})(?:\s*[:,]\s*|\s+)([\s\S]+?)[.!?]?$`,
      "u",
    ));
    if (inline?.[2]
      && isBenignNaturalPersonAttributionClause(inline[1])
      && isReviewedBenignProtectedAreaAdviceTail(inline[2])) {
      candidate = inline[2].trim();
    }
  }

  if (!candidate) {
    if (isReviewedPublicOrganizationProtectedBuildingContactQuery(originalQuery)) return originalQuery;
    return hasUnsupportedPublicProviderResidual(originalQuery) ? "" : originalQuery;
  }
  const minimizedInput = canonicalizePublicSearchQuery(candidate, { maximumLength });
  if (!minimizedInput.ok
    || containsUnsafeInstruction(minimizedInput.query)
    || containsPrivatePersonLookup(minimizedInput.query)
    || hasUnsupportedPublicProviderResidual(minimizedInput.query)) return "";
  return minimizedInput.query;
}

export function preparePublicProviderQuery(value, options = {}) {
  const query = minimizePublicProviderQuery(value, options);
  return query
    ? { accepted: true, query, reason: null }
    : { accepted: false, query: "", reason: "blocked-or-unconsumed" };
}

function isPublicOrganizationContactQuery(value) {
  const text = canonicalSecurityText(value);
  const textWithoutReviewedMunicipality = removeFirstReviewedMunicipalityOrganizationName(text);
  const hasReviewedMunicipalityOrganization = normalize(textWithoutReviewedMunicipality) !== normalize(text);
  return (PUBLIC_ORGANIZATION_PATTERN.test(text) || hasReviewedMunicipalityOrganization)
    && (INSTITUTIONAL_CONTACT_CHANNEL_PATTERN.test(text)
      || PRIVATE_POSTAL_FIELD_PATTERN.test(text))
    && !containsPrivatePersonLookup(text);
}

function rootIsDomain(root) {
  if (!isMultilingualSearchEnabled() && ENGLISH_ONLY_DOMAIN_ROOTS.has(root)) return false;
  if (DOMAIN_ROOTS.has(root)) return true;
  return [...DOMAIN_ROOTS].some((candidate) => root.startsWith(candidate) && candidate.length >= 4);
}

function clarificationFor(root) {
  if (["vesi", "jarv", "jogi", "meri", "pohjavesi"].includes(root)) {
    return "Palun lisa veekogu nimi või registrikood, soovitud näitaja ning aasta või ajavahemik.";
  }
  if (["ohk", "ohukvaliteet", "saaste"].includes(root)) {
    return "Palun lisa asukoht, saasteaine või näitaja ning kas soovid hetkeolukorda või pikemat perioodi.";
  }
  if (["kliima", "ilm", "temperatuur", "sademed"].includes(root)) {
    return "Palun lisa asukoht, näitaja ja ajavahemik. Ilmaprognoosi puhul märgi ka päev.";
  }
  if (["jaat", "prugi", "rehv"].includes(root)) {
    return "Palun lisa jäätmeliik, piirkond ning kas otsid käitlusjuhist, kogust või käitluskohta.";
  }
  if (["looduskaitse", "elurikkus", "kaitseala", "natura", "liik"].includes(root)) {
    return "Palun lisa liik, ala, asukoht või konkreetne tegevus, mille kohta infot vajad.";
  }
  if (["energia", "elektriauto", "transport"].includes(root)) {
    return "Palun täpsusta, kas soovid heite, energiakulu, elukaare, toetuse või muu keskkonnamõju infot.";
  }
  return "Palun lisa teema, näitaja, piirkond või ajavahemik, et saaksin valida õige ametliku allika.";
}

export function analyzePublicSearchQuery(query, options = {}) {
  const canonicalInput = canonicalizePublicSearchQuery(query, options);
  const cleanQuery = canonicalInput.ok ? canonicalInput.query : "";
  const normalized = normalize(cleanQuery);
  // queryTerms only sees the canonicalized query, where Cyrillic is folded
  // or stripped. Merge Russian roots from the raw input so Russian queries
  // reach scope gating and retrieval instead of always reading as empty.
  const roots = [...new Set([...queryTerms(cleanQuery), ...russianKeywordRoots(query)])];
  const domainRoots = roots.filter(rootIsDomain);
  const domainFamilies = new Set(domainRoots.map((root) => DOMAIN_FAMILY_BY_ROOT.get(root)).filter(Boolean));
  const forestryIntent = forestEvidenceIntent(cleanQuery);
  const locationPattern = /\b(?:tartu|jogeva|parnu|narva|viljandi|rakvere|voru|valga|kuressaare|haapsalu|johvi|saaremaa|kohtla|harjumaa|raplamaa|ida virumaa)\w*/u;
  const hasLocation = textHasTallinnLocation(normalized) || locationPattern.test(normalized);
  const historical = /\b(?:(?:19|20)\d{2}|ajalool\w*|varasem\w*|arhiiv\w*|eelmisel|mullu|kliima\w*|keskm\w*|moodunud|historical|historic|archive|archived|past)\b/u.test(normalized);
  const current = /\b(?:tana\w*|homn\w*|homm\w*|homs\w*|ulehomme|praegu|hetkel|hetke\w*|nadalavahet\w*|reaalajas|prognoos\w*|\w*hoiatus\w*|today|tomorrow|current|currently|now|weekend|forecast\w*|warning\w*)\b/u.test(normalized);
  const weatherMeasurementIntent = roots.some((root) => [
    "temperatuur", "ohutemperatuur", "tuul", "niiskus", "ohuniiskus", "ohurohk", "sooja", "kulm", "baromeetrirohk",
    "wind", "humidity", "pressure",
  ].includes(root))
    && !roots.some((root) => [
      "vesi", "meri", "laanemeri", "jarv", "jogi", "emajogi", "pohjavesi", "suplusvesi", "joogivesi", "reovesi", "mootmine",
    ].includes(root));
  const weatherIntent = domainRoots.some((root) => ["ilm", "prognoos", "hoiatus", "sademed"].includes(root))
    || weatherMeasurementIntent;
  const airIntent = roots.some((root) => ["ohk", "ohukvaliteet", "saaste", "osoon", "pm10", "pm25"].includes(root));
  const routeClasses = new Set();
  if (weatherIntent && (current || (hasLocation && !historical))) routeClasses.add("official_live_weather");
  if (airIntent && (current || (hasLocation && !historical))) routeClasses.add("official_live_air");
  const liveWaterIntent = (current
    && roots.some((root) => ["vesi", "jogi", "jarv", "meri", "laanemeri", "emajogi", "mootmine", "suplusvesi"].includes(root))
    && !historical)
    || (roots.includes("jaaolud") && !historical);
  if (liveWaterIntent) routeClasses.add("official_live_water");
  const explicitDataIntent = roots.some((root) => ["api", "avaandmed", "metaandmed", "allalaadimine", "pxweb"].includes(root));
  const statisticalDataIntent = roots.includes("statistika")
    && !roots.some((root) => ["mets", "metsaandmed", "metsaregister"].includes(root));
  if (explicitDataIntent || statisticalDataIntent) {
    routeClasses.add("official_data_or_api");
  }
  if (roots.some((root) => ["kaart", "ruumikiht", "register", "kataster", "kinnistu", "pusielupaik", "puurkaev", "jaatmekaitluskoht", "mura"].includes(root))
    || (roots.some((root) => ["kaitseala", "elupaik", "liik"].includes(root))
      && (/\b(?:kaart|piir(?:id|i|ide|joon)\w*|asukoht|naen|näen|leid|otsin|riiklik)\w*/u.test(normalized) || hasLocation))
    || /\b(?:oma|minu|mu)\s+maat\w*\b[\s\S]{0,50}\b(?:puistu|metsa)andm\w*/u.test(normalized)) {
    routeClasses.add("official_spatial_or_register");
  }
  if ((historical && roots.some((root) => ["ilm", "temperatuur", "vesi", "jogi", "jarv", "meri", "emajogi", "mootmine"].includes(root)))
    || roots.some((root) => ["jaaolud"].includes(root))
    || (roots.includes("meri") && roots.some((root) => ["temperatuur", "mootmine", "seire"].includes(root)))) {
    routeClasses.add("official_historical_observation");
  }
  if (roots.some((root) => ["seisund", "kliima", "kasvuhoonegaas", "ringlussevott", "jalajalg", "elektriauto", "pestitsiid", "osoon", "uluk", "suplusvesi", "stsenaarium", "kiirgus", "mereprugi", "eutrofeerumine"].includes(root))
    || (roots.includes("laanemeri") && /\b(?:oitse\w*|vetika\w*|eutrofeer\w*)\b/u.test(normalized))) {
    routeClasses.add("official_indicator_or_report");
  }
  if (roots.includes("uleujutusrisk")) {
    routeClasses.add("official_indicator_or_report");
    routeClasses.add("official_spatial_or_register");
  }
  const legalIntent = roots.some((root) => ["keskkonnaluba", "menetlus", "piirang", "taotlemine", "ehitamine"].includes(root))
    || /\bkaitse\s+alla\b/u.test(normalized)
    || (roots.includes("metsateatis") && /\b(?:piisab|peab|kohustus\w*|noue\w*|esitama|vaja)\b/u.test(normalized))
    || (roots.includes("lubatavus")
      && roots.some((root) => ["kaitseala", "kaitstav", "liik", "elupaik", "puurkaev", "jarv"].includes(root)));
  if (legalIntent) routeClasses.add("official_legal_context");
  const legalDecisionIntent = legalIntent
    && !roots.some((root) => ["kaart", "ruumikiht", "register", "kataster"].includes(root));
  if (roots.some((root) => ["kmh", "ksh"].includes(root)) || (roots.includes("keskkonnamoju") && roots.includes("tuulepark"))) {
    routeClasses.add("official_environmental_assessment");
  }
  if (roots.includes("keskkonnamoju") && roots.includes("kaevandus")) {
    routeClasses.add("official_environmental_assessment");
    routeClasses.add("official_guidance");
  }
  const guidanceIntent = /\b(?:kuidas|kuhu|miks|mida|kas|tohib|voib|teatada|viia|käidelda|kaidelda|how|where|why|what|dispose|report)\b/u.test(normalized)
    && roots.some((root) => [
      "jaat", "asbest", "biojaatmed", "reovesi", "kohtkaitlus", "pais", "kala", "voorliik",
      "liik", "elupaik", "rohevorgustik", "margala", "taastamine", "kaevandus", "paikesepaneel",
      "pohjavesi", "joogivesi", "vesi", "metsateatis", "rehv", "polet", "jalajalg",
    ].includes(root));
  const implicitGuidanceIntent = (roots.includes("paikesepaneel") && /\bmis\s+saab\b/u.test(normalized))
    || (roots.includes("voorliik") && /\b(?:aias|aeda|aed)\b/u.test(normalized))
    || (roots.includes("metsateatis") && /\b(?:voi|või)\b/u.test(normalized));
  if ((guidanceIntent || implicitGuidanceIntent) && (!legalIntent || roots.some((root) => ["jaat", "asbest", "biojaatmed", "reovesi", "kohtkaitlus", "pais", "voorliik", "metsateatis"].includes(root)))) {
    routeClasses.add("official_guidance");
  }
  if (forestryIntent || roots.some((root) => ["mets", "raie", "juurdekasv", "metsaandmed", "metsaregister"].includes(root))) {
    routeClasses.add("official_forestry_evidence");
  }
  const primaryRouteClass = [
    routeClasses.has("official_live_weather") ? "official_live_weather" : null,
    routeClasses.has("official_live_air") ? "official_live_air" : null,
    routeClasses.has("official_live_water") ? "official_live_water" : null,
    routeClasses.has("official_data_or_api") ? "official_data_or_api" : null,
    routeClasses.has("official_legal_context") && legalDecisionIntent ? "official_legal_context" : null,
    routeClasses.has("official_spatial_or_register") && !/\bavalik\w*\b/u.test(normalized)
      ? "official_spatial_or_register"
      : null,
    routeClasses.has("official_historical_observation") ? "official_historical_observation" : null,
    routeClasses.has("official_environmental_assessment") ? "official_environmental_assessment" : null,
    routeClasses.has("official_legal_context") ? "official_legal_context" : null,
    routeClasses.has("official_guidance") ? "official_guidance" : null,
    routeClasses.has("official_indicator_or_report") ? "official_indicator_or_report" : null,
    routeClasses.has("official_spatial_or_register") ? "official_spatial_or_register" : null,
    routeClasses.has("official_forestry_evidence") ? "official_forestry_evidence" : null,
  ].find(Boolean) || null;
  return {
    cleanQuery,
    inputReason: canonicalInput.reason,
    normalized,
    roots,
    domainRoots,
    domainFamilies,
    forestryIntent,
    hasLocation,
    historical,
    current,
    weatherIntent,
    airIntent,
    candidateRouteClasses: [...routeClasses],
    primaryRouteClass,
  };
}

export function assessSearchQuery(query, options = {}) {
  // Length is the cheapest reject: check the canonicalization result BEFORE
  // running decode/pattern passes so overlong input cannot spend classifier
  // time. decodeSecurityEscapes is length-reducing, so a raw query that fits
  // rawMaximum can never decode to something that exceeds it.
  const earlyLength = canonicalizePublicSearchQuery(query, options);
  if (earlyLength.reason === "too-long" || earlyLength.reason === "input-too-long") {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "invalid-query-length",
      clarification: "Otsing ületab turvalise pikkuspiiri. Lühenda päringut ja proovi uuesti.",
    };
  }
  const rawForeignPrivateClause = hasForeignPrivatePersonClause(decodeSecurityEscapes(query));
  const analysis = analyzePublicSearchQuery(query, options);
  const {
    cleanQuery, inputReason, normalized, roots, domainRoots, domainFamilies, forestryIntent,
  } = analysis;
  if (inputReason === "too-long" || inputReason === "input-too-long") {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "invalid-query-length",
      clarification: "Otsing ületab turvalise pikkuspiiri. Lühenda päringut ja proovi uuesti.",
    };
  }
  if (!cleanQuery) return { kind: "needs-clarification", topic: null, reason: "empty", clarification: clarificationFor(null) };
  if (containsUnsafeInstruction(cleanQuery)) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "unsafe-instruction",
      clarification: "Saan aidata Eesti keskkonnaandmete küsimustega, kuid mitte süsteemijuhiste ega saladuste päringutega.",
    };
  }
  if (rawForeignPrivateClause || containsPrivatePersonLookup(cleanQuery)) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "personal-data-lookup",
      clarification: "Ma ei aita tuvastada eraisiku elukohta, vara ega muid isikuga seostatavaid registriandmeid. Avalikke keskkonnaobjekte saab otsida objekti tunnuse järgi ametlikust registrist.",
    };
  }
  if (isReviewedGenericProtectedAreaConsentQuery(cleanQuery)) {
    return {
      kind: "answerable",
      topic: "looduskaitse",
      reason: "protected-area-consent",
      clarification: null,
    };
  }
  if (isReviewedPublicOrganizationProtectedBuildingContactQuery(cleanQuery)) {
    return {
      kind: "answerable",
      topic: "looduskaitse",
      reason: "official-organization-contact",
      clarification: null,
    };
  }
  const municipalityContactScope = reviewedMunicipalityInstitutionalContactScope(cleanQuery);
  if (municipalityContactScope?.status === "ambiguous") {
    return {
      kind: "needs-clarification",
      topic: "keskkonnaandmed",
      reason: "ambiguous-municipality",
      clarification: "Palun täpsusta, kas mõtled samanimelist linna või valda, et saaksin valida õige omavalitsuse ametliku kontaktkanali.",
    };
  }
  if (municipalityContactScope?.status === "exact") {
    return {
      kind: "answerable",
      topic: "keskkonnaandmed",
      reason: "official-organization-contact",
      clarification: null,
    };
  }
  if (isPublicOrganizationContactQuery(cleanQuery)) {
    return {
      kind: "answerable",
      topic: "keskkonnaandmed",
      reason: "official-organization-contact",
      clarification: null,
    };
  }
  if (CADASTRE_PATTERN.test(cleanQuery)) {
    return { kind: "answerable", topic: "kataster", reason: "cadastre-number", clarification: null };
  }
  if (normalized === "andmed") {
    return {
      kind: "needs-clarification",
      topic: "andmed",
      reason: "broad-topic",
      clarification: clarificationFor("andmed"),
    };
  }
  const broadRequest = /^(?:tahan\s+\w+\s+teada|vajan\s+(?:ainult\s+)?kaarti|otsin\s+loataotlust|minu\s+mets)$/u.test(normalized)
    || (/\bsiin\b/u.test(normalized) && roots.some((root) => ["lubatavus", "ehitamine"].includes(root)))
    || (/\b(?:ohk|ohukvaliteet)\b/u.test(normalized)
      && /\b(?:halb|hea|puhas)\b/u.test(normalized)
      && !ADMIN_CONTEXT_ROOTS.has(roots.find((root) => ADMIN_CONTEXT_ROOTS.has(root))));
  if (broadRequest) {
    return {
      kind: "needs-clarification",
      topic: domainRoots[0] || null,
      reason: "broad-topic",
      clarification: clarificationFor(domainRoots[0] || null),
    };
  }
  if (roots.includes("register")
    && roots.includes("ettevote")
    && !roots.some((root) => ["keskkonnaluba", "jaat", "heide", "saaste", "pakend", "mets", "puurkaev"].includes(root))) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "outside-environment-domain",
      clarification: "Üldiste ettevõtteandmete asemel küsi konkreetse keskkonnaloa, heite, jäätmearuande või muu keskkonnaregistri kirje kohta.",
    };
  }
  const hasRecognizedLiveRoute = analysis.candidateRouteClasses.some((routeClass) => [
    "official_live_weather",
    "official_live_air",
    "official_live_water",
  ].includes(routeClass));
  if (!domainRoots.length && !forestryIntent && !hasRecognizedLiveRoute) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "outside-environment-domain",
      clarification: "Küsi Eesti keskkonna, looduse, ilma, vee, õhu, jäätmete, metsa või keskkonnaregistrite kohta.",
    };
  }
  const topic = domainRoots[0] || "mets";
  const suspiciousUnknownTokens = normalized.split(/\s+/u).filter((word) => word.length >= 4
    && !/[aeiouõäöü]/u.test(word)
    && !/\d/u.test(word));
  if (suspiciousUnknownTokens.length && domainRoots.length <= 1) {
    return {
      kind: "needs-clarification",
      topic,
      reason: "unknown-modifier",
      clarification: "Üks päringu osa jäi ebaselgeks. Palun sõnasta teema või tundmatu termin täpsemalt.",
    };
  }
  const hasRelationalQuestion = /\b(?:kas|kuidas|miks|mida|milline|millised|tohib|voib)\b/u.test(normalized);
  const knownCatalogueCombination = domainRoots.some((root) => ["mets", "metsaandmed", "metsaregister"].includes(root))
    && roots.some((root) => ["andmed", "kaart", "ruumikiht", "register"].includes(root));
  if (domainFamilies.size >= 3
    && normalized.split(/\s+/u).length <= 6
    && !hasRelationalQuestion
    && !forestryIntent
    && !knownCatalogueCombination) {
    return {
      kind: "needs-clarification",
      topic,
      reason: "mixed-topics",
      clarification: "Päring sisaldab mitut eri keskkonnateemat. Palun vali üks teema või kirjelda, millist seost nende vahel otsid.",
    };
  }
  const namedMunicipalityExample = /\bnaiteks\b[\s\S]{0,35}\b(?:omavalitsus|vald|linn)\w*\b/u.test(normalized);
  const forestAreaGeographyScope = forestryIntent
    ? classifyForestryGeographyScope(cleanQuery)
    : null;
  const reviewedNationalBreakdown = isReviewedNationalUnsupportedForestAreaBreakdownQuestion(cleanQuery);
  const nationalForestAreaScope = ["national-default", "national-estonia"]
    .includes(forestAreaGeographyScope?.kind) || reviewedNationalBreakdown;
  if (nationalForestAreaScope
    && (["forest-area", "forest-covered-area", "forest-area-method"].includes(forestryIntent?.kind)
      || reviewedNationalBreakdown)
    && requestsUnsupportedForestAreaBreakdown(cleanQuery)) {
    return {
      kind: "needs-clarification",
      topic: "mets",
      reason: "requested-breakdown-required",
      clarification: "Päring küsib metsamaa jaotust või välistust, mida üleriigiline kogupindala ei tõenda. Palun lisa sama omandi-, kaitse- või muu kategooria ametlik näitaja koos aasta ja ühikuga; kogupindala ei kanta sellele alamrühmale üle.",
    };
  }
  if (nationalForestAreaScope
    && ["forest-area", "forest-covered-area"].includes(forestryIntent?.kind)
    && requestsUnsupportedForestAreaTimeSeries(cleanQuery)) {
    return {
      kind: "needs-clarification",
      topic: "mets",
      reason: "requested-time-series-required",
      clarification: "Päring küsib metsamaa aegrida või muutust. Ühe aasta üleriigilist näitajat ei kasutata ajaloo või trendi asendusena; vastuseks on vaja sama definitsiooni, aasta ja ühikuga ametlikke aastavaatlusi kogu küsitud perioodi kohta.",
    };
  }
  if (nationalForestAreaScope
    && ["forest-area", "forest-covered-area"].includes(forestryIntent?.kind)
    && requestsUnsupportedForestAreaUnit(cleanQuery)) {
    return {
      kind: "needs-clarification",
      topic: "mets",
      reason: "requested-unit-conversion-required",
      clarification: "Ametlik mõõtmine on selles vastuseallikas hektarites. Ma ei esita aakrite või ruutühikute teisendust ilma eraldi kontrollitud arvutuse ja ümardusreeglita; palun küsi hektarites või lisa soovitud ametlik teisendusallikas.",
    };
  }
  if (forestryIntent?.kind === "regional-forest-area") {
    const geographyScope = forestAreaGeographyScope;
    const isEstonianRegion = geographyScope.kind === "estonian-region";
    return {
      kind: "needs-clarification",
      topic: "mets",
      reason: isEstonianRegion ? "regional-observation-required" : "unsupported-geography",
      clarification: isEstonianRegion
        ? "Piirkond on tuvastatud, kuid arvuline vastus vajab sama maakonna või piirkonna, andmeaasta, näitaja ja ühikuga ametlikku vaatlust. Eesti üleriigilist SMI näitajat ei kanta piirkonnale üle."
        : "Päring nimetab Eesti-välise või muu piirkonna. See otsing ei asenda puuduvat piirkondlikku allikat Eesti SMI arvuga; palun küsi Eesti näitajat või lisa soovitud piirkonna ametlik andmeallikas, näitaja ja aasta.",
    };
  }
  if (forestryIntent?.kind === "municipality-forest-area") {
    const municipalityScope = reviewedEstonianForestryMunicipalityScope(cleanQuery);
    const hasReviewedMunicipality = Boolean(municipalityScope);
    const municipalityIsMissing = /\b(?:minu|mu|meie|oma|selles|siin)\b[\s\S]{0,35}\b(?:vald|valla|vallas)\w*\b/u.test(normalized)
      || /\bkoduvall\w*\b/u.test(normalized)
      || namedMunicipalityExample
      || /^(?:kui\s+palju\s+)?mets\w*\s+(?:on\s+)?vallas$/u.test(normalized)
      || /\b(?:metsa|metsade?)\s+(?:protsent|osakaal|pindala)\s+vallas\b/u.test(normalized)
      || !hasReviewedMunicipality;
    if (municipalityIsMissing) {
      return {
        kind: "needs-clarification",
        topic: "mets",
        reason: "missing-municipality",
        clarification: namedMunicipalityExample
          ? "Palun täpsusta konkreetne omavalitsus (näiteks Võru linn või Võru vald) ja soovitud näitaja: metsamaa pindala, metsasuse protsent või Metsaregistris kehtivate eraldiste pindala. Need on eri näitajad."
          : "Palun nimeta vald või linn ja täpsusta, kas soovid metsamaa pindala, metsasuse protsenti või Metsaregistris kehtivate eraldiste pindala. Need on eri näitajad.",
      };
    }
    if (municipalityScope.status === "ambiguous") {
      return {
        kind: "needs-clarification",
        topic: "mets",
        reason: "ambiguous-municipality",
        clarification: "Päring võib viidata mitmele omavalitsusele või nii sama nimega linnale kui vallale. Palun nimeta täpselt linn või vald ning soovitud näitaja ja andmeaasta.",
      };
    }
    return {
      kind: "needs-clarification",
      topic: "mets",
      reason: "municipality-observation-required",
      clarification: "Omavalitsus on tuvastatud. Arvulise vastuse jaoks täpsusta andmeaasta ja näitaja: metsamaa pindala, metsasuse protsent või Metsaregistris kehtivate eraldiste pindala. Vastus peab põhinema sama omavalitsuse, aasta ja ühikuga ruumiandmetel; riiklikku SMI kogunäitajat ei kanta omavalitsusele üle.",
    };
  }
  if (!CADASTRE_PATTERN.test(cleanQuery)
    && (/(?:\b(?:minu|mu|oma)\s+(?:salvkaev|kaev)\w*\b|\b(?:minu|mu)\s+maal\b[\s\S]{0,50}\bvaariselupaik\b)/u.test(normalized))) {
    return {
      kind: "needs-clarification",
      topic: domainRoots[0] || null,
      reason: "missing-object-location",
      clarification: "Palun lisa objekti asukoht või registritunnus. Isiklikke objektiandmeid ma ei tuleta nime ega ebamäärase asukohakirjelduse põhjal.",
    };
  }
  if (["jarv", "vesi"].includes(topic) && /\bjarvede\b/u.test(normalized)) {
    return {
      kind: "needs-clarification",
      topic: "jarv",
      reason: "multiple-waterbodies",
      clarification: "Palun nimeta konkreetne järv või veekogumi kood ning ütle, kas soovid ökoloogilist, keemilist või suplusvee seisundit.",
    };
  }
  const propertyHowTo = forestryIntent?.kind === "property-forest-data"
    && /\b(?:kust|kus|millises|kuidas|leida|vaadata|kontrollida|otsida|otsing|jargi|sisesta|avada|kasuta)\b/u.test(normalized);
  if (!CADASTRE_PATTERN.test(cleanQuery)
    && !propertyHowTo
    && /(?:katastritunnus|katastri\s*(?:number|andmed)|kinnistu\s*(?:andmed|piirang|mets)|minu\s+kinnistu)/iu.test(normalized)) {
    return {
      kind: "needs-clarification",
      topic: "kataster",
      reason: "missing-cadastre-number",
      clarification: "Lisa katastritunnus kujul 12345:678:9012. Aadressi järgi üksuse leidmiseks kasuta ametlikku kaardi- või aadressiotsingut.",
    };
  }
  const weatherLocationPattern = /\b(?:tartu|parnu|narva|viljandi|rakvere|voru|valga|kuressaare|haapsalu|johvi|saaremaa|kohtla)\w*/u;
  const hasWeatherLocation = textHasTallinnLocation(normalized) || weatherLocationPattern.test(normalized);
  const explicitlyCurrentWeather = /\b(?:tana\w*|homn\w*|homm\w*|homs\w*|ulehomme|praegu|hetkel|hetkeseis\w*|nadalavahet\w*|prognoos\w*|\w*hoiatus\w*|today|tomorrow|current|currently|now|weekend|forecast\w*|warning\w*)\b/u.test(normalized);
  const historicalWeatherContext = /\b(?:(?:19|20)\d{2}|ajalool\w*|kliima\w*|keskm\w*|möödunud|moodunud|historical|historic|archive|past)\b/u.test(normalized);
  const weatherIntent = analysis.candidateRouteClasses.includes("official_live_weather")
    || domainRoots.some((root) => ["ilm", "prognoos", "hoiatus", "sademed"].includes(root));
  const locationDefaultsToCurrentWeather = weatherIntent
    && hasWeatherLocation
    && !historicalWeatherContext;
  if (weatherIntent
    && (explicitlyCurrentWeather || locationDefaultsToCurrentWeather)) {
    return {
      kind: "live-weather",
      topic: "ilm",
      reason: "time-sensitive-weather",
      clarification: hasWeatherLocation
        ? null
        : "Lisa asukoht, et avada õige piirkonna prognoos.",
    };
  }
  const explicitlyCurrentAir = /\b(?:praeg\w*|hetkel|hetke\w*|reaalajas|tana\w*|värske\w*|varske\w*|today|current|currently|now|real\s+time|latest)\b/u.test(normalized);
  const airIntent = roots.some((root) => ["ohk", "ohukvaliteet", "saaste", "osoon", "pm10", "pm25"].includes(root));
  const airLocation = textHasTallinnLocation(normalized)
    || /\b(?:tartu|parnu|narva|kohtla|viljandi|voru|saaremaa)\w*/u.test(normalized);
  if (airIntent && (explicitlyCurrentAir || (airLocation && !historicalWeatherContext))) {
    return {
      kind: "live-air",
      topic: "ohukvaliteet",
      reason: "time-sensitive-air-quality",
      clarification: airLocation
        ? null
        : "Lisa asukoht või lähim seirejaam ja soovitud saasteaine.",
    };
  }
  if (analysis.candidateRouteClasses.includes("official_live_water")) {
    return {
      kind: "live-water",
      topic: roots.includes("suplusvesi")
        ? "suplusvesi"
        : roots.some((root) => ["meri", "laanemeri", "jaaolud"].includes(root))
          ? "meri"
          : "vesi",
      reason: "time-sensitive-water",
      clarification: null,
    };
  }
  const nonContextRoots = roots.filter((root) => root !== topic && !ADMIN_CONTEXT_ROOTS.has(root));
  const waterContextOnly = ["vesi", "jarv"].includes(topic) && nonContextRoots.length === 0;
  if (!isStatisticsWaterAbstractionQuery(cleanQuery)
    && AMBIGUOUS_ROOTS.has(topic) && (roots.length <= 1 || waterContextOnly)) {
    return {
      kind: "needs-clarification",
      topic,
      reason: "broad-topic",
      clarification: clarificationFor(topic),
    };
  }
  return { kind: "answerable", topic, reason: "environment-domain", clarification: null };
}

export function scoreDocument(document, query, { bridgeRoots = null } = {}) {
  const normalizedQuery = normalize(query);
  const words = bridgeRoots instanceof Set ? [...bridgeRoots] : queryTerms(query);
  if (!words.length) return 0;

  const fields = {
    title: normalize(document.title),
    tags: normalize((document.tags || []).join(" ")),
    summary: normalize(document.summary),
    excerpt: normalize(document.excerpt),
    content: normalize(document.content),
    organization: normalize(document.organization),
    answer: normalize(document.answer),
  };

  let score = 0;
  if (normalizedQuery.length >= 5 && fields.title.includes(normalizedQuery)) score += 18;
  if (normalizedQuery.length >= 5 && fields.tags.includes(normalizedQuery)) score += 12;
  if (normalizedQuery.length >= 5 && fields.summary.includes(normalizedQuery)) score += 6;
  if (normalizedQuery.length >= 5 && fields.excerpt.includes(normalizedQuery)) score += 5;
  if (normalizedQuery.length >= 5 && fields.content.includes(normalizedQuery)) score += 3;
  if (normalizedQuery.length >= 5 && fields.answer.includes(normalizedQuery)) score += 5;

  for (const word of [...new Set(words)]) {
    if (word.length < 2) continue;
    if (textHasQueryRoot(fields.title, word)) score += 7;
    if (textHasQueryRoot(fields.tags, word)) score += 5;
    if (textHasQueryRoot(fields.summary, word)) score += 2;
    if (textHasQueryRoot(fields.excerpt, word)) score += 2;
    if (textHasQueryRoot(fields.content, word)) score += 1;
    if (textHasQueryRoot(fields.organization, word)) score += 1;
    if (textHasQueryRoot(fields.answer, word)) score += 3;
  }

  const namedForestRegisterOverview = words.includes("metsaregister")
    && !words.some((word) => [
      "smi", "kataster", "kinnistu", "metsateatis", "raie", "juurdekasv", "vordlus",
      "wms", "wfs", "geojson", "ruumikiht",
    ].includes(word));
  if (namedForestRegisterOverview) {
    if (document.id === "metsaregister") score += 40;
    else if (document.id === "forest-register-workflow") score += 30;
    else if (document.id === "official-geoserver") score += 24;
  }

  return score;
}

function documentRoots(document) {
  return new Set(queryTerms([
    document.title,
    ...(document.tags || []),
    document.summary,
    document.excerpt,
    document.content,
    document.answer,
    document.organization,
  ].filter(Boolean).join(" ")));
}

function evidencePassages(document) {
  return [
    document.summary,
    document.excerpt,
    document.answer,
    document.content,
  ]
    .filter(Boolean)
    .flatMap(splitTextPassages);
}

function passageMatchesTerms(passage, terms) {
  return terms.filter((term) => textHasQueryRoot(passage, term));
}

function documentCanDirectlyAnswerQuery(query, document) {
  // Typed CSV evidence is allowed to answer only through its validator and
  // deterministic composer. If that contract rejects an incomplete temporal
  // intent or impossible observation, the generic lexical fallback must not
  // re-promote the same document from its prose fields.
  if (document?.id === "municipal-waste-recycling") return false;
  if (document?.id !== "municipal-waste-recycling-page") return true;
  const text = normalize(query);
  const asksForTarget = /\b(?:sihttase|eesmark)\w*/u.test(text);
  const asksWhetherTargetWasMet = /\b(?:saavut|tait|joud|tegelik|moodet|tulemus)\w*/u.test(text)
    || /\bon\s+(?:\d{4}\s+)?(?:sihttasem|eesmarg)\w*/u.test(text);
  return asksForTarget && !asksWhetherTargetWasMet;
}

export function assessEvidence(query, documents = []) {
  const terms = queryTerms(query);
  const evidenceDomainTerms = terms.filter((term) => rootIsDomain(term)
    && !ADMIN_CONTEXT_ROOTS.has(term));
  const broadGenericIntent = terms.filter((term) => !ADMIN_CONTEXT_ROOTS.has(term)).length === 1
    && evidenceDomainTerms.length === 1
    && AMBIGUOUS_ROOTS.has(evidenceDomainTerms[0]);
  const requiredDomainTerms = terms.filter((term) => rootIsDomain(term)
    && !["andmed", "keskkond", "seire"].includes(term));
  const candidates = (documents || []).slice(0, 8);
  const topScore = Number(candidates[0]?.score || 0);
  const matched = new Set();
  const perDocument = [];
  for (const document of candidates) {
    const roots = documentRoots(document);
    const documentMatches = terms.filter((term) => roots.has(term));
    perDocument.push({
      id: document.id,
      matchedTerms: documentMatches,
      coverage: terms.length ? documentMatches.length / terms.length : 0,
    });
    for (const term of terms) {
      if (roots.has(term)) matched.add(term);
    }
  }
  const coverage = terms.length ? matched.size / terms.length : 0;
  const years = normalize(query)
    .replace(/\bnatura\s+2000\b/gu, "natura")
    .match(/\b(?:19|20)\d{2}\b/gu) || [];
  const requiredMatches = Math.min(2, Math.max(1, terms.length));
  const directDocument = broadGenericIntent ? null : perDocument.find((match, index) => {
    const document = candidates[index];
    if (!documentCanDirectlyAnswerQuery(query, document)) return false;
    const passageTerms = terms.filter((term) => !ADMIN_CONTEXT_ROOTS.has(term));
    const requiredPassageMatches = passageTerms.length <= 3
      ? passageTerms.length
      : Math.ceil(passageTerms.length * 0.75);
    const directPassage = evidencePassages(document).some((passage) => {
      const passageText = normalize(passage);
      const passageMatches = passageMatchesTerms(passage, terms);
      const requiredMatches = passageMatches.filter((term) => passageTerms.includes(term));
      return years.every((year) => passageText.includes(year))
        && requiredDomainTerms.every((term) => passageMatches.includes(term))
        && requiredMatches.length >= requiredPassageMatches;
    });
    return match.matchedTerms.length >= requiredMatches
      && match.coverage >= 0.45
      && requiredDomainTerms.every((term) => match.matchedTerms.includes(term))
      && directPassage;
  });
  const yearsCovered = years.length === 0 || Boolean(directDocument);
  const strong = candidates.length > 0
    && topScore >= 10
    && Boolean(directDocument);
  return {
    strong,
    topScore,
    coverage,
    matchedTerms: [...matched],
    terms,
    yearsCovered,
    directDocumentId: directDocument?.id || null,
  };
}

export function relatedQueries(query, sources) {
  const normalizedQuery = normalize(query);
  const direct = Object.entries(RELATED).find(([key]) => normalizedQuery.includes(normalize(key)));
  if (direct) return direct[1];

  const tags = sources.flatMap((source) => source.tags || []).filter((tag) => tag.length > 3);
  return [...new Set(tags)].slice(0, 3).map((tag) => `${tag} andmed Eestis`);
}

// These are deliberately small, reviewed extracts of maintained official
// pages/PDFs.  They are not the legacy forestry answer fixtures: they give the
// public retrieval path a bounded official fallback when live discovery is
// slow, while preserving the public URL and locator that the user can inspect.
// The detailed corpus remains excluded from primary answer evidence.
const OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS = [
  {
    id: "smi",
    title: "Metsastatistika, sh statistiline metsainventuur (SMI)",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Metoodika",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/teemad/mets/metsastatistika-sh-smi",
    tags: ["mets", "SMI", "metsainventeerimine", "statistika", "metoodika"],
    summary: "SMI on üleriigiliste proovitükkidega valikuuring, mille põhjal koostatakse statistiliste meetoditega kogu Eesti metsade üldistatud hinnang.",
    content: "Statistiline metsainventuur ehk SMI on üleriigiliste proovitükkidega valikuuring. SMI põhjal koostatakse statistiliste meetoditega kogu Eesti metsade üldistatud hinnang ning näitajaga kaasneb statistiline viga. SMI tagavara on valimi põhjal arvutatud statistiline hinnang koos veaga, mitte üks kindel vaieldamatu number. SMI sobib riigi metsade seisundi ja muutuste hindamiseks, mitte üksiku kinnistu inventeerimisandmete esitamiseks. Lausmetsakorralduse inventeerimisandmed kirjeldavad mõõdetud kinnistuid ja metsaeraldisi ega kata tingimata sama üldkogumit või ajaseisu. Valimi suurus üksi ei määra hinnangu täpsust: olulised on ka valikukava, proovitükkide esinduslikkus, mõõtmiskvaliteet ja avaldatud veahinnang. Erinevus lausmetsakorralduse registriandmetest ei tõenda iseenesest, et SMI tagavara oleks üle hinnatud; enne tuleb võrrelda üldkogumit, definitsiooni, andmeaastat ja ebakindlust.",
    locator: "SMI kui üleriigiline proovitükkidega valikuuring ning kogu Eesti üldistatud statistiline hinnang koos veahinnanguga.",
  },
  {
    id: "forest-area",
    title: "SMI 2024: Eesti metsamaa pindala",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Statistika",
    published: "2024",
    url: "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI2024/SMI_2024.pdf",
    tags: ["mets", "metsamaa", "SMI", "pindala", "metsasus", "statistika", "tagavara", "juurdekasv", "lageraie", "mänd", "kuusk"],
    summary: "SMI 2024 järgi oli metsamaa pindala 2 350,6 tuhat hektarit: 51,84% kogu Eesti pindalast või 54,08%, kui nimetajast jätta välja Peipsi ja Võrtsjärv. Pindalahinnangu suhteline viga oli ±1,2%.",
    content: "SMI 2024 andmetel oli Eesti metsamaa pindala 2 350,6 tuhat hektarit ehk 51,84% kogu Eesti 4 533,9 tuhande hektari suurusest pindalast ning suhteline viga oli ±1,2%. Sama metsamaa pindala on 54,08% siis, kui nimetajast jäetakse välja Peipsi ja Võrtsjärv ning Eesti pindalana kasutatakse 4 346,7 tuhat hektarit. Seega võivad 51,84% ja 54,08% mõlemad olla õiged: erineb arvutuse nimetaja. Metsaga kaetud pindala ehk puistute pindala oli 2 135,8 tuhat hektarit ehk 47,11% kogu Eesti pindalast. Metsamaa ja metsaga kaetud pindala on eri näitajad. Kogu metsamaa kasvava metsa tagavara hinnang oli 452,831 miljonit tihumeetrit suhtelise veaga ±1,5%. Tagavara ei ole aastane raiemaht ega automaatselt raiutav puidukogus. SMI 2024 järgi oli 19,7% metsamaast mittemajandatav ja 10,1% majanduspiiranguga. Ka majandusmetsas sõltub puidu kasutus vanusest, seisundist, juurdekasvust, õiguslikest piirangutest, ligipääsust ja omaniku otsusest. SMI 2024 tabeli järgi oli mudeli alusel arvutatud metsamaa juurdekasvu hinnang 15,4303 miljonit tihumeetrit aastas ehk 6,6 tihumeetrit hektari kohta aastas ning suhteline viga oli ±1,4%. 2023. aasta raiete tagavara hinnang oli 11,736 miljonit tihumeetrit suhtelise veaga ±10,1%. 2023. aasta lageraie pindala hinnang oli 32,0 tuhat hektarit ja viie aasta keskmine 30,5 tuhat hektarit aastas. Enamuspuuliigi järgi oli männi metsamaa pindala 695,3 tuhat hektarit ehk 29,6% ning kuuse pindala 431,8 tuhat hektarit ehk 18,4%. Mänd oli kuusest suurem ka tagavara osakaalu järgi.",
    locator: "SMI 2024, lk 3, 7, 8, 12, 22 ja 57–59: pindala, tagavara, juurdekasv, puuliigid ning raiete hinnangud koos suhtelise veaga.",
  },
  {
    id: "forest-stock-stable",
    title: "SMI: metsade tagavara on stabiilne",
    organization: "Keskkonnaagentuur",
    type: "Metsastatistika",
    published: "18.08.2026",
    url: "https://keskkonnaagentuur.ee/uudised/smi-metsatagavara-stabiilne",
    tags: ["mets", "SMI", "tagavara", "metsade seisund", "trend", "vanusjaotus"],
    summary: "SMI 2025 järgi oli Eesti metsamaa pindala 2,36 miljonit hektarit ehk 52,1% Eesti pindalast ning kasvava metsa tagavara püsis stabiilsena 466 miljoni m³ juures.",
    content: "Keskkonnaagentuuri SMI 2025 tulemuste järgi oli Eesti metsamaa pindala 2,36 miljonit hektarit ehk 52,1% Eesti pindalast. Kasvava metsa tagavara püsis stabiilsena 466 miljoni m³ juures ja ligikaudu 20% metsamaast oli mittemajandatav. Jätkuvalt suurenes nii noorte kui ka vanade metsade pindala: noorte metsade kasvu seostati raie ja metsastumisega ning vanade metsade kasvu mittemajandatava metsamaa ja metsaomanike valikutega. 2025. aasta raiemahu eksperthinnang oli 11 miljonit m³ ning viimaste aastate tase ligikaudu 11–12 miljonit m³. Metsa pindala, tagavara, vanuseline struktuur, puuliigiline koosseis ja raiemaht kirjeldavad eri tahke ega ole omavahel asendatavad näitajad.",
    locator: "SMI 2025 põhinäitajad: metsamaa pindala, tagavara, vanusjaotus, puuliigid, juurdekasv ja raiemahu eksperthinnang.",
  },
  {
    id: "forest-condition-review",
    title: "Keskkonnaülevaade – mets",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Keskkonnaülevaade",
    published: "17.06.2026",
    url: "https://keskkonnaportaal.ee/et/keskkonnaulevaade/keskkonnaulevaade-mets",
    tags: ["mets", "metsade seisund", "kahjustused", "elurikkus", "kliimarisk", "trend"],
    summary: "Keskkonnaülevaade käsitleb metsa pindala, tagavara, vanuselist struktuuri, kahjustusi, elurikkust, kaitset ja kliimariski eraldi näitajatena ning eristab metsamaad metsaga kaetud pindalast.",
    content: "Metsa püsimist ja seisundit ei kirjelda üks näitaja. Keskkonnaülevaate järgi moodustas metsamaa 51,8% Eesti pindalast, kuid metsaga kaetud pindala ehk puistute pindala 47,1%; need on eri näitajad. 2024. aasta ruumianalüüsi järgi oli kaitse all 28,4% Eesti metsadest ja rangelt kaitstav 16,8% metsamaast; neid õigusliku kaitse näitajaid ei tohi samastada SMI majanduskategooriatega. Ülevaade käsitleb eraldi metsa pindala, tagavara ja vanuselist struktuuri ning metsade kahjustusi, elurikkust, kaitset ja kliimaga seotud riske. Kliimamuutuse mõjud ei ole ühesuunalised: põuad, soojemad talved, haigustekitajad ja kahjurid võivad juurdekasvu vähendada ning puid kahjustada. Kuuse-kooreüraski kahjustuskollete laienemist hinnati 2019.–2024. aastal ligikaudu 22 500 hektarile. Raiemahu mõju sõltub metsa asukohast, vanusest, koosseisust, elupaikadest, mullast ja veerežiimist, mistõttu väide, et kõik lageraied on alati ühesuguse keskkonnamõjuga, ei ole mõõdetav üksikfakt, ning mõju tuleb hinnata konkreetse ala elupaikade, mulla, veerežiimi ja taastumise järgi, mitte tuletada seda ainult lageraie liigist või ühest pindala- või mahuarvust. Ülevaate järgi on raiemaht viimasel kümnendil püsinud ligikaudu 10–12 miljoni m³ tasemel, kuid pikaajalise võrdluse jaoks tuleb kasutada sama definitsiooni ja metoodikaga aegrida. Viimase aasta hinnang ja viie aasta keskmine ei näita iseenesest, kas praegu raiutakse rohkem kui täpselt 20 aastat tagasi. Vastuseks on vaja sama metoodikaga 20-aastast aegrida.",
    locator: "Metsamaa ja metsaga kaetud pindala, kaitse näitajad, vanuseline struktuur, kliimamõjud, kahjustused, elurikkus ning raiemahu pikaajaline kontekst.",
    _publishedAt: "2026-06-17",
  },
  {
    id: "metsainfo-hetkeseis",
    title: "Metsainfo hetkeseis",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Andmete koondvaade",
    published: "07.01.2026",
    url: "https://keskkonnaportaal.ee/et/teemad/mets/metsainfo-hetkeseis",
    tags: ["mets", "metsaandmed", "metsateatis", "metsaregister", "RMK", "inventeerimine"],
    summary: "Koondvaade eristab metsateatisi, RMK hallatavate metsade takseerandmeid ja Metsaregistri inventeerimisandmeid.",
    content: "Metsainfo hetkeseis koondab eraldi vaated metsateatistele, RMK hallatavate metsade takseerandmetele ja Metsaregistri ülepinnalise takseerimisega kogutud inventeerimisandmetele. RMK vaade kirjeldab ainult RMK hallatavaid metsi RMK takseerandmete põhjal ning uueneb jooksvalt; SMI on kogu Eesti kohta koostatav perioodiline statistiline valikuuring. Metsaregistri inventeerimisandmed kehtivad kümme aastat ja kehtivad kirjed katavad ligi kolmveerandi Eesti metsamaast. Metsateatised kirjeldavad lubava märke saanud kavatsusi ning kõiki teatisi ei ole looduses realiseeritud. Kaitsealadel kuvatud teatised ja registreeritud raied ei tõenda tehtud raietöid. Nendel vaadetel on erinev katvus, ajaseis ja tähendus, mistõttu nende numbrid ei pea kattuma ning neid ei tohi käsitada ühe ja sama näitajana.",
    locator: "Eraldi vaated metsateatistele, RMK hallatavate metsade takseerandmetele ja Metsaregistri inventeerimisandmetele.",
  },
  {
    id: "metsaregister",
    title: "Metsaregistri andmestikud",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Andmekataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/avaandmed/metsaregistri-andmestikud",
    tags: ["mets", "metsaandmed", "metsaregister", "inventeerimine", "metsateatis", "WMS", "WFS"],
    summary: "Metsaregistri andmekataloog eristab inventeerimis-, metsateatise ja välitööde andmestikke ning nende avalikke ruumiandmete levitusi.",
    content: "Metsaregister on riiklik andmekogu, mille andmestike hulka kuuluvad inventeerimis-, metsateatise ja välitööde andmed. Avalikke Metsaregistri ruumiandmeid levitatakse Metsaportaalis ning WMS- ja WFS-teenustena. Registri andmestik sobib kinnistu- ja metsaeraldisepõhiste andmete vaatamiseks.",
    locator: "Metsaregistri inventeerimis-, metsateatise ja välitööde andmestikud; Metsaportaal ning WMS/WFS levitused.",
  },
  {
    id: "smi-metsaregister",
    title: "Metsandus: SMI ja Metsaregister",
    organization: "Kliimaministeerium",
    type: "Selgitus",
    published: "07.04.2021",
    url: "https://kliimaministeerium.ee/elurikkus-keskkonnakaitse/metsandus",
    tags: ["mets", "metsandusandmed", "SMI", "metsaregister", "metsainventeerimine"],
    summary: "Metsaandmed on mitmel viisil kogutavate andmete katusmõiste: SMI ja kinnistute inventeerimisandmeid koondav Metsaregister on eri ametlikud allikad.",
    content: "Metsaandmed on mitmel viisil kogutavate andmete katusmõiste. Statistilise metsainventuuriga ehk SMI-ga koostatakse statistiline kokkuvõte Eesti metsade seisundist, kasutamisest ja muutustest ajas. Metsaregister sisaldab kinnistute metsainventeerimise andmeid ning lisaks metsateatiste, metsakaitseekspertiiside ja metsauuendusekspertiiside andmeid. Eri ametlike allikate arvud võivad erineda, sest nende katvus, üldkogum, andmeaasta, ajaseis, definitsioon ja mõõtmismeetod on erinevad; võrdlus vajab enne nende tingimuste ühtlustamist.",
    locator: "Metsandusandmete kogumise viisid; SMI tulemused ning Metsaregistri inventeerimis- ja metsateatise andmed.",
  },
];

export function forestryIntentServiceDocumentIds(query) {
  const intent = forestEvidenceIntent(query);
  return [...(intent?.serviceDocumentIds || [])];
}

// The catalogue contains compact, manually reviewed extracts rather than a
// live copy of the linked page. Any extract that may support an answer is
// therefore issued as a short-lived reviewed version. Updating catalogue
// prose requires advancing this timestamp after the linked sources have been
// checked; otherwise the extract automatically becomes navigation-only.
const CATALOGUE_REVIEWED_AT = "2026-09-19T00:00:00.000Z";
const CATALOGUE_REVIEW_MAX_AGE_MS = 31 * 24 * 60 * 60 * 1_000;

export function reviewedCatalogueEvidenceVersion(document = {}) {
  const extract = [
    document.id,
    document.title,
    document.organization,
    document.type,
    document.published,
    document.url,
    document.summary,
    document.content,
    document.locator,
    document.actionUrl,
    document.actionLabel,
    document.tags,
    document.topics,
  ];
  const digest = createHash("sha256").update(JSON.stringify(extract)).digest("hex");
  return `catalogue-review-2026-09-19:${digest}`;
}

function withReviewedCatalogueEvidence(document, { forceRouteOnly = false } = {}) {
  if (forceRouteOnly || document._answerEvidenceEligible === false
    || ["route-only", "timestamped", "versioned"].includes(document.evidencePolicy)) {
    return {
      ...document,
      evidencePolicy: forceRouteOnly ? "route-only" : document.evidencePolicy,
      _answerEvidenceEligible: forceRouteOnly ? false : document._answerEvidenceEligible,
    };
  }
  if (document.evidencePolicy === "claim-specific"
    && document.freshness?.requiresSourceTimestamp === true) return document;
  return {
    ...document,
    evidencePolicy: "versioned",
    _answerEvidenceEligible: true,
    _evidenceVersion: reviewedCatalogueEvidenceVersion(document),
    _evidenceStatusAt: CATALOGUE_REVIEWED_AT,
    freshness: {
      class: "reviewed-catalogue-extract",
      basis: "reviewed-at",
      maxAgeMs: CATALOGUE_REVIEW_MAX_AGE_MS,
      requiresSourceTimestamp: true,
    },
  };
}

function reviewedNavigationCitationSource(source, citation) {
  const reviewed = {
    ...source,
    evidencePolicy: "versioned",
    _answerEvidenceEligible: true,
    _evidenceStatusAt: CATALOGUE_REVIEWED_AT,
    freshness: {
      class: "reviewed-navigation-procedure",
      basis: "reviewed-at",
      maxAgeMs: CATALOGUE_REVIEW_MAX_AGE_MS,
      requiresSourceTimestamp: true,
    },
  };
  return {
    ...reviewed,
    citation,
    evidenceExcerpt: source.summary,
    _evidenceVersion: reviewedCatalogueEvidenceVersion(reviewed),
  };
}

export function officialServiceCatalogueDocuments() {
  // The two SMI entries in SEARCH_DOCUMENTS are legacy deterministic-answer
  // fixtures. Current primary forestry evidence instead comes from the
  // maintained, cited service-directory extracts above or live retrieval.
  const legacyForestryFacts = new Set(["forest-overview", "forest-inventory-publication"]);
  const directory = [...SEARCH_DOCUMENTS, ...ADDITIONAL_OFFICIAL_SERVICE_DOCUMENTS]
    .map(({ answer: _answer, tags, ...document }) => withReviewedCatalogueEvidence({
      ...document,
      tags: [...(tags || [])],
      topics: [...(tags || [])],
      sourceTier: "official",
      retrieval: "official-service-directory",
    }, { forceRouteOnly: legacyForestryFacts.has(document.id) }));
  const forestryDirectory = [
    ...OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS,
    ...ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS,
  ].map((document) => withReviewedCatalogueEvidence({
    ...document,
    topics: [...document.tags],
    sourceTier: "official",
    retrieval: "official-service-directory",
  }));
  return [...directory, ...forestryDirectory, ...cadastreSourceDocuments()]
    .map(withOfficialSourceProfile);
}

export function directDirectoryDocumentIds(query) {
  const text = normalize(query);
  const preferred = [];
  if (/\bkeskkonnaseir\w*\b[\s\S]{0,60}\b(?:andmekog|andmestik)\w*\b/u.test(text)) {
    preferred.push("kese-monitoring");
  }
  if (/\bnatura\s+2000\b[\s\S]{0,60}\b(?:registr|andm)\w*\b/u.test(text)) {
    preferred.push("environment-register", "biodiversity");
  }
  if ((/\bsadem\w*\b[\s\S]{0,60}\bvaatlusandm\w*\b/u.test(text)
    || /\bvaatlusandm\w*\b[\s\S]{0,60}\bsadem\w*\b/u.test(text))) {
    preferred.push("historical-weather-data", "weather-overview");
  }
  if (/\b(?:keskkonnaandm|keskonnaandm)\w*\b[\s\S]{0,60}\b(?:teenus|loetelu)\w*\b/u.test(text)) {
    preferred.push("official-data-services", "open-data-downloader");
  }
  return [...new Set(preferred)];
}

export function rankDocuments(query, documents = SEARCH_DOCUMENTS, { russianRoots = [] } = {}) {
  const primaryTopic = assessSearchQuery(query).topic;
  const preferred = new Map(directDirectoryDocumentIds(query).map((id, index) => [id, index]));
  // Cyrillic tokens are folded/stripped by canonicalSecurityText, so the
  // canonical queryTerms may contain only folded fragments ('coptipovka').
  // The bridge must REPLACE, not merge, those fragments — otherwise the
  // primary-topic gate and scoring see junk roots the documents never match.
  const canonicalRoots = new Set(queryTerms(query));
  const bridgeRoots = new Set(russianRoots?.length ? [...russianRoots] : [...canonicalRoots]);
  return documents
    .map((document) => ({ ...document, score: scoreDocument(document, query, { bridgeRoots }) }))
    .filter((document) => document.score > 0
      && (!primaryTopic || documentRoots(document).has(primaryTopic) || [...bridgeRoots].some((root) => documentRoots(document).has(root))))
    .sort((a, b) => {
      const aPreference = preferred.get(a.id) ?? Number.POSITIVE_INFINITY;
      const bPreference = preferred.get(b.id) ?? Number.POSITIVE_INFINITY;
      return aPreference - bPreference
        || b.score - a.score
        || a.title.localeCompare(b.title, "et");
    });
}

export function composeSearchResponse(query, rankedDocuments, options = {}) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  const cleanQuery = canonicalInput.ok ? canonicalInput.query : "";
  const limit = Math.max(1, Math.min(Number(options.limit) || 6, 10));
  const ranked = Array.isArray(rankedDocuments) ? rankedDocuments : [];
  const chosen = ranked
    .slice(0, limit)
    .map((document, index) => ({ ...document, citation: index + 1 }));
  const directEvidence = options.answerable !== false && chosen.length > 0;
  const title = cleanQuery
    ? `${cleanQuery.charAt(0).toLocaleUpperCase("et")}${cleanQuery.slice(1)}`
    : "Täpsusta keskkonnaandmete küsimust";

  return {
    query: cleanQuery,
    total: Number.isFinite(options.total) ? options.total : ranked.length,
    generatedAt: new Date().toISOString(),
    answer: {
      eyebrow: directEvidence ? "Kontrollitud allikaotsing" : "Vajan täpsustust",
      title,
      intro: directEvidence
        ? "Leidsin küsimusega seotud ametlikud allikad, kuid usaldusväärset koondvastust ei õnnestunud praegu koostada. Ava allikad või proovi hetke pärast uuesti."
        : "Täpset ja piisavalt asjakohast ametlikku tõendit ei leitud. Ma ei asenda puuduvat tõendit üldteadmise ega juhusliku artikliga.",
      introCitations: [],
      parts: [],
      note: "",
    },
    sources: chosen.map(({ score: _score, semanticScore: _semanticScore, combinedScore: _combinedScore, tags, ...source }) => ({
      ...source,
      tags: (tags || []).slice(0, 5),
    })),
    related: options.related || relatedQueries(cleanQuery, chosen),
    clarification: options.clarification || (directEvidence ? null : "Lisa näitaja, piirkond, objekt või ajavahemik."),
    evidence: {
      kind: options.evidenceKind || "portal-discovery",
      answerable: directEvidence,
      documentIds: chosen.map((source) => source.id),
      quality: options.quality || null,
    },
  };
}

const WASTE_FACILITIES_MAP_URL = "https://register.keskkonnaportaal.ee/register";
// Keep the reviewed procedure in a private module snapshot. Ranked discovery
// cards are only visibility witnesses: aliases that share the URL must never
// supply prose that later receives this snapshot's review timestamp/version.
const REVIEWED_WASTE_FACILITIES_NAVIGATION_SOURCE = (() => {
  const source = [...SEARCH_DOCUMENTS, ...ADDITIONAL_OFFICIAL_SERVICE_DOCUMENTS]
    .find((document) => document.id === "waste-facilities-map"
      && document.url === WASTE_FACILITIES_MAP_URL);
  return source ? Object.freeze({
    ...source,
    tags: Object.freeze([...(source.tags || [])]),
  }) : null;
})();
const WASTE_FACILITIES_COUNTIES = [
  ["ida viru", "Ida-Virumaa"],
  ["laane viru", "Lääne-Virumaa"],
  ["harju", "Harjumaa"],
  ["hiiu", "Hiiumaa"],
  ["jogeva", "Jõgevamaa"],
  ["jarva", "Järvamaa"],
  ["laane", "Läänemaa"],
  ["polva", "Põlvamaa"],
  ["parnu", "Pärnumaa"],
  ["rapla", "Raplamaa"],
  ["saare", "Saaremaa"],
  ["tartu", "Tartumaa"],
  ["valga", "Valgamaa"],
  ["viljandi", "Viljandimaa"],
  ["voru", "Võrumaa"],
];
const UNSUPPORTED_WASTE_FACILITY_FACT_REQUEST = /\b(?:kas|milline|millised|mitu|arv|loetle|nimeta|aadress|lahim|avatud|lahti|praegu|hetkel|tana|homme|kell|telefon|kontakt|hind|tasuta|votab|voetakse|vastu|kehtiv|staatus|luba|operaator|kulkapp|elektroonikaromu|asbest|rehv|ohtlik)\w*\b/u;

function wasteFacilitiesCounty(query) {
  const normalized = normalize(query);
  return WASTE_FACILITIES_COUNTIES.find(([stem]) => {
    const pattern = new RegExp(`\\b${stem.replace(" ", "[ -]")}(?:maa\\w*)?\\b`, "u");
    return pattern.test(normalized);
  })?.[1] || null;
}

// This is deliberately a navigation response, not an answer-evidence adapter.
// The public map contains current and archived layers and cannot establish that
// a particular facility exists, is open, or accepts a requested waste type.
export function composeWasteFacilitiesNavigationResponse(query, documents = [], options = {}) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok) return null;
  const cleanQuery = canonicalInput.query;
  const normalized = normalize(cleanQuery);
  const county = wasteFacilitiesCounty(cleanQuery);
  const requestsFacilitiesMap = /\b(?:jaatmekaitluskoh|jaatmejaam)\w*\b/u.test(normalized)
    && Boolean(county || /\bkaart\w*\b/u.test(normalized));
  if (!requestsFacilitiesMap || UNSUPPORTED_WASTE_FACILITY_FACT_REQUEST.test(normalized)) return null;

  const listingWitness = (Array.isArray(documents) ? documents : []).find((document) => (
    document?.id === "waste-facilities-map"
    && String(document.url || "").trim() === WASTE_FACILITIES_MAP_URL
    && document.sourceTier === "official"
    && document.evidencePolicy === "route-only"
    && document._answerEvidenceEligible === false
  ));
  if (!listingWitness || !REVIEWED_WASTE_FACILITIES_NAVIGATION_SOURCE) return null;
  const source = REVIEWED_WASTE_FACILITIES_NAVIGATION_SOURCE;
  const citedSource = reviewedNavigationCitationSource({
    ...source,
    tags: [...(source.tags || source.topics || [])].slice(0, 5),
  }, 1);
  const location = county || "soovitud asukoht";
  return {
    query: cleanQuery,
    total: Number.isFinite(options.total) ? options.total : 1,
    generatedAt: new Date().toISOString(),
    answer: {
      eyebrow: "Ametliku kaardi juhis",
      title: `Jäätmekäitluskohti saab otsida Andmed ja kaart rakendusest`,
      intro: `Ava Andmed ja kaart, vali sobiv jäätmekäitluskohtade kiht ning kasuta asukohaotsingut või suumi kaardil asukohale ${location}.`,
      introCitations: [1],
      parts: [],
      note: "See navigatsioonijuhis ei kinnita ühegi koha olemasolu, kehtivust, lahtiolekut ega vastuvõetavaid jäätmeliike. Kontrolli need konkreetse objekti andmetest või käitlejalt.",
    },
    sources: [citedSource],
    related: ["jäätmejaamade kaart", "jäätmekäitluskohtade andmekihid", "ettevõtete jäätmete aastaaruandlus"],
    clarification: null,
    evidence: {
      kind: "official-navigation-routing",
      documentIds: [source.id],
    },
  };
}

function responseSources(ids) {
  const catalogue = [...SEARCH_DOCUMENTS, ...ADDITIONAL_OFFICIAL_SERVICE_DOCUMENTS];
  return ids.flatMap((id, index) => {
    const source = catalogue.find((candidate) => candidate.id === id);
    return source ? [reviewedNavigationCitationSource(source, index + 1)] : [];
  });
}

export function composeScopeResponse(query, assessment) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  const cleanQuery = canonicalInput.ok ? canonicalInput.query : "";
  if (assessment.kind === "live-weather") {
    const sources = responseSources(["weather-forecast", "kaia-service"]);
    return {
      query: cleanQuery,
      total: sources.length,
      generatedAt: new Date().toISOString(),
      answer: {
        eyebrow: "Ajakohane ilmainfo",
        title: "Ilmaprognoos tuleb võtta reaalaja teenusest",
        intro: "Tänase või homse ilma jaoks ava Keskkonnaagentuuri Ilm+ prognoos. Kliimaartiklid ja ajaloolised mõõtmised ei ole jooksva prognoosi asendus.",
        introCitations: [1],
        parts: [{
          title: "Masinloetavad andmed",
          text: "KAIA koondab prognoosi-, hoiatus-, radari- ja muid ilmaandmete väljundeid.",
          citations: [2],
        }],
        note: "Prognoos muutub ajas; kontrolli enne otsust alati allika viimast uuendust.",
      },
      sources,
      related: ["Eesti ilmahoiatused", "ajalooline temperatuur", "sademed mõõtejaamades"],
      clarification: assessment.clarification,
      evidence: { kind: "official-live-routing", documentIds: sources.map((source) => source.id) },
    };
  }

  if (assessment.kind === "live-air") {
    const sources = responseSources(["air-quality-live"]);
    return {
      query: cleanQuery,
      total: sources.length,
      generatedAt: new Date().toISOString(),
      answer: {
        eyebrow: "Ajakohane õhuseire",
        title: "Hetke õhukvaliteet tuleb võtta lähimast seirejaamast",
        intro: "Ava Eesti välisõhu kvaliteedi reaalajavaade, vali lähim seirejaam ja saasteaine ning kontrolli näidu keskmistamisaega. Ühe jaama hetkeline näit ei kirjelda automaatselt kogu linna ega pikaajalist õhukvaliteeti.",
        introCitations: [1],
        parts: [],
        note: "Seireandmed muutuvad ajas; tervise- või tegevusotsuse puhul kontrolli allika viimast uuendust.",
      },
      sources,
      related: ["Tallinna õhukvaliteedi pikaajaline trend", "PM2.5 mõõtmised", "Eesti välisõhu seirejaamad"],
      clarification: assessment.clarification,
      evidence: { kind: "official-live-routing", documentIds: sources.map((source) => source.id) },
    };
  }

  if (assessment.kind === "live-water") {
    const normalized = normalize(cleanQuery);
    const roots = queryTerms(cleanQuery);
    const isBathingWater = roots.includes("suplusvesi")
      || /\b(?:suplus\w*|ujum\w*|rand|ranna)\b/u.test(normalized);
    const isIce = roots.includes("jaaolud")
      || /\b(?:jaakaart|merejaa|jaakate)\w*\b/u.test(normalized);
    const isCombinedMarineObservation = isIce
      && roots.some((root) => ["temperatuur", "seire", "mootmine"].includes(root));
    const isMarine = isIce
      || roots.some((root) => ["meri", "laanemeri"].includes(root))
      || /\b(?:laht|lahe|rannik\w*)\b/u.test(normalized);
    const variant = isBathingWater
      ? {
          ids: ["bathing-water-quality"],
          eyebrow: "Ajakohane suplusvee info",
          title: "Suplusvee hetkeseis tuleb kontrollida Terviseameti vaatest",
          intro: "Ava Terviseameti suplusvee vaade, vali supluskoht ning kontrolli viimase proovi kuupäeva ja tulemust. Jooksev proovitulemus ja nelja viimase aasta põhjal määratud kvaliteediklass ei ole sama näitaja.",
          note: "Proovitulemused muutuvad hooaja jooksul; ujumisotsuse puhul kontrolli ka kohapealseid hoiatusi.",
          related: ["Eesti supluskohad", "suplusvee kvaliteediklass", "Pirita suplusvee proovid"],
        }
      : isCombinedMarineObservation
        ? {
            ids: ["marine-observations", "marine-ice-map"],
            eyebrow: "Ajakohane mereseire",
            title: "Merevee näidud ja jääolud tuleb võtta ametlikest vaatlusvaadetest",
            intro: "Ava Keskkonnaagentuuri merevaatluste vaade temperatuuri ja veetaseme jaoks ning jääkaart jääolude jaoks. Vali sobiv rannikujaam või kaardiala ja kontrolli mõlema vaate uuendamisaega.",
            note: "Merevee näidud ja jääolud muutuvad ajas; ühe jaama või kaardikihi põhjal ei saa kirjeldada kogu Läänemerd.",
            related: ["Eesti merevaatlusjaamad", "Eesti mere jääkaart", "ajaloolised merevaatlused"],
          }
        : isIce
        ? {
            ids: ["marine-ice-map"],
            eyebrow: "Ajakohane merejää info",
            title: "Jääolud tuleb võtta ametlikult jääkaardilt",
            intro: "Ava Keskkonnaagentuuri mere jääkaart ning kontrolli kaardi vaatlus- ja uuendamisaega. Otsing ei esita vana jääolude kirjeldust praeguse olukorrana.",
            note: "Jääolud võivad kiiresti muutuda; liikumisohutust ei saa hinnata üksnes üldkaardi põhjal.",
            related: ["Eesti mere jääkaart", "Läänemere veetemperatuur", "ajaloolised jääolud"],
          }
        : isMarine
          ? {
              ids: ["marine-observations"],
              eyebrow: "Ajakohane mereseire",
              title: "Mere hetkeseis tuleb võtta lähimast vaatlusjaamast",
              intro: "Ava Keskkonnaagentuuri merevaatluste vaade, vali sobiv rannikujaam ja näitaja ning kontrolli mõõtmise aega. Ühe jaama näit ei kirjelda automaatselt kogu lahte ega Läänemerd.",
              note: "Veetase ja -temperatuur muutuvad ajas; kontrolli allika viimast mõõtmisaega.",
              related: ["Eesti merevaatlusjaamad", "Läänemere veetemperatuur", "merevee taseme ajalugu"],
            }
          : {
              ids: ["current-hydrology-observations"],
              eyebrow: "Ajakohane sisevete seire",
              title: "Veetaseme hetkeseis tuleb võtta mõõtejaamast",
              intro: "Ava Keskkonnaagentuuri hüdroloogiliste vaatluste kaart, vali õige jõgi või järv ja mõõtejaam ning kontrolli näidu aega ja ühikut. Otsing ei esita vana vaatlust praeguse näiduna.",
              note: "Veetase, vooluhulk ja veetemperatuur muutuvad ajas; kontrolli allika viimast mõõtmisaega.",
              related: ["Eesti hüdromeetriajaamad", "Emajõe ajalooline veetase", "jõgede vooluhulk"],
            };
    const sources = responseSources(variant.ids);
    return {
      query: cleanQuery,
      total: sources.length,
      generatedAt: new Date().toISOString(),
      answer: {
        eyebrow: variant.eyebrow,
        title: variant.title,
        intro: variant.intro,
        introCitations: sources.map((source) => source.citation),
        parts: [],
        note: variant.note,
      },
      sources,
      related: variant.related,
      clarification: assessment.clarification,
      evidence: { kind: "official-live-routing", documentIds: sources.map((source) => source.id) },
    };
  }

  const isOutOfScope = assessment.kind === "out-of-scope";
  const topicSources = assessment.topic === "kataster"
    ? responseSources(["environment-register", "official-geoserver"])
    : [];
  return {
    query: cleanQuery,
    total: topicSources.length,
    generatedAt: new Date().toISOString(),
    answer: {
      eyebrow: isOutOfScope ? "Otsingu ulatus" : "Vajan täpsustust",
      title: isOutOfScope
        ? "See otsing vastab Eesti keskkonnaandmete küsimustele"
        : "Palun täpsusta küsimust",
      intro: isOutOfScope
        ? "Ma ei anna juhuslikku üldvastust, kui küsimus ei ole Eesti keskkonnaandmete või keskkonnaregistrite kohta."
        : assessment.clarification,
      introCitations: [],
      parts: [],
      note: "Piisava ametliku tõendita jätab otsing vastuse koostamata.",
    },
    sources: topicSources,
    related: ["Eesti metsade seisund", "õhukvaliteet Tallinnas", "põhjavee seisund", "jäätmete käitlemine"],
    clarification: isOutOfScope ? assessment.clarification : null,
    evidence: {
      kind: isOutOfScope ? "safe-abstention" : "needs-clarification",
      answerable: false,
      documentIds: topicSources.map((source) => source.id),
    },
  };
}

export function searchEnvironment(query, limit = 6) {
  // Privacy gates must see the RAW query first: canonicalization folds
  // Cyrillic homoglyphs, which can erase a private-person clause while the
  // Russian bridge still routes on the environmental prefix. A mixed query
  // ('лес; Где живёт Иван Петров') must fail closed via the raw assessment,
  // not rank the catalogue on its environmental half.
  const rawAssessment = assessSearchQuery(query);
  if (rawAssessment.kind !== "answerable") {
    return composeScopeResponse(rawAssessment.kind === "out-of-scope" ? "" : (canonicalizePublicSearchQuery(query).ok ? canonicalizePublicSearchQuery(query).query : ""), rawAssessment);
  }
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (canonicalInput.reason === "empty") {
    return {
      query: "",
      total: 0,
      answer: null,
      sources: [],
      related: ["metsade seisund", "Eesti kliima", "keskkonna avaandmed"],
    };
  }

  if (!canonicalInput.ok) {
    return composeScopeResponse("", assessSearchQuery(query));
  }
  const cleanQuery = canonicalInput.query;

  const assessment = assessSearchQuery(cleanQuery);
  if (assessment.kind !== "answerable") return composeScopeResponse(cleanQuery, assessment);
  // The legacy synchronous path ranks the raw catalogue: merge the Russian
  // keyword bridge so Cyrillic queries score against the same domain roots
  // as the live retrieval pipeline (which merges russianKeywordRoots in
  // analyzePublicSearchQuery). Privacy gates already ran on the raw text.
  const ranked = rankDocuments(cleanQuery, SEARCH_DOCUMENTS, { russianRoots: russianKeywordRoots(query) });
  const quality = assessEvidence(cleanQuery, ranked);
  return composeSearchResponse(cleanQuery, ranked, {
    answerable: quality.strong,
    clarification: quality.strong ? null : "Lisa konkreetne näitaja, objekt, piirkond või ajavahemik.",
    limit,
    quality,
    total: ranked.length,
  });
}

export { SEARCH_DOCUMENTS };
