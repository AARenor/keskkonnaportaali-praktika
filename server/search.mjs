import { createHash } from "node:crypto";
import { cadastreSourceDocuments } from "./cadastre.mjs";
import {
  ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS,
  resolvePublicForestryIntent,
} from "./forestry-public.mjs";
import { withOfficialSourceProfile } from "./source-registry.mjs";

const SEARCH_DOCUMENTS = [
  {
    id: "forest-overview",
    title: "Kui palju ja millist metsa Eestis on?",
    organization: "Keskkonnaagentuur",
    type: "Ülevaade",
    published: "12.08.2026",
    url: "https://www.keskkonnaagentuur.ee/uudised/blogis-kui-palju-ja-millist-metsa-eestis",
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
    title: "KOTKAS avalik keskkonnalubade otsing",
    organization: "Keskkonnaamet",
    type: "Infosüsteem",
    published: "jooksev",
    url: "https://kotkas.envir.ee/permits/public_index",
    locator: "https://keskkonnaamet.ee/kasiraamat-kohaliku-omavalitsuse-keskkonnaspetsialistile/kaevandamisloa-taotluse-menetlus-tahtsamate-etappide-kaupa",
    tags: ["luba", "keskkonnaluba", "taotlemine", "ettevõte", "KMH", "menetlus", "aruandlus", "KOTKAS"],
    summary:
      "KOTKAS on keskkonnalubade ametlik infosüsteem: seal saab esitada taotluse ning kontrollida konkreetse keskkonnaloa menetluse staatust ja avalikke dokumente.",
    answer:
      "Konkreetse loa või menetluse ametlikku seisu kontrolli KOTKASest; portaali otsing aitab leida tausta, kuid menetlusandmete allikaks on infosüsteem ise.",
    evidencePolicy: "versioned",
    delivery: "catalog-only",
    routeClasses: ["official_spatial_or_register", "official_legal_context", "official_data_or_api"],
    freshness: {
      class: "current-law-or-procedure",
      basis: "source-version-or-status-at",
      maxAgeMs: 24 * 60 * 60 * 1000,
      requiresSourceTimestamp: true,
    },
    _answerEvidenceEligible: false,
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
      "ruumikiht", "looduskaitse",
    ],
    summary:
      "Avalik GeoServer jagab EELISe ja Metsaregistri ruumikihte WMS- ja WFS-teenustena ning võimaldab valitud kihte GeoJSONi või muude GIS-vormingutena pärida.",
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
    tags: ["Statistikaamet", "PXWeb", "API", "keskkond", "energia", "jäätmed", "transport", "rahvamajandus"],
    summary:
      "Statistikaameti PXWeb API annab masinloetava ligipääsu ametlikele statistikatabelitele, sealhulgas keskkonna, energia, transpordi ja jäätmete teemadele.",
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
    title: "Kaevandamise keskkonnamõjud ja nende leevendamine",
    organization: "Keskkonnaamet",
    type: "Ametlik juhend",
    published: "jooksev",
    url: "https://keskkonnaamet.ee/kasiraamat-kohaliku-omavalitsuse-keskkonnaspetsialistile/loa-andmisest-keeldumine",
    tags: [
      "kaevandamine", "keskkonnamõju", "peamised mõjud", "leevendusmeetmed", "Ida-Virumaa",
      "joogivesi", "põhjavesi", "müra", "tolm", "vibratsioon", "transport",
    ],
    summary:
      "Keskkonnaameti kaevandamisjuhend nimetab peamiste keskkonnamõjude ja kohalike riskidena joogivee muutusi, müra ja tolmu, vibratsiooni ning karjäärimasinate transpordihäiringut. Leevendusmeetmed valitakse eelhinnangu või KMH põhjal ja seatakse vajaduse korral loa tingimuseks; mõju ulatus sõltub konkreetsest kaevandusest.",
    answer:
      "Kaevandamise riske ei saa hinnata ainult maakonna nime järgi. Kontrolli konkreetse kaevanduse eelhinnangut või KMH-d ja loa tingimusi, kus määratakse vajalikud vee-, müra-, tolmu-, vibratsiooni- ja transpordihäiringu leevendusmeetmed.",
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
    published: "jooksev",
    url: "https://keskkonnaamet.ee/keskkonnakasutus-kiirgus/maapou/korrastamiskohustus",
    tags: ["kaevandamine", "kaevandatud maa", "korrastamine", "leevendusmeede", "järelhooldus", "maastik"],
    summary:
      "Kaevandatud maa tuleb enne kaevandamisloa lõppemist Keskkonnaameti tingimuste ja heakskiidetud korrastamisprojekti järgi korrastada, et vähendada keskkonnamõju ning anda ala uuesti kasutusse.",
    answer:
      "Korrastamine on kaevandamise järel kohustuslik leevendus: projekti tingimused annab Keskkonnaamet ning loa omaja peab maa enne loa lõppu nõuetekohaselt korrastama.",
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
    published: "jooksev",
    url: "https://register.keskkonnaportaal.ee/register",
    tags: ["jäätmed", "jäätmekäitluskoht", "jäätmekäitluskohad", "vastuvõtukoht", "katkine", "külmkapp", "kodumasin", "elektroonikaromu", "kaart", "KOTKAS", "Pärnumaa", "Viljandimaa", "maakond"],
    summary:
      "Katkise külmkapi, kodumasina või muu jäätme vastuvõtukoha leidmiseks saab Keskkonnaportaali kaardirakenduses valida jäätmekäitluskohtade kihi ja piirata kaardi maakonnale. Vaade sisaldab kehtivaid ning arhiveeritud kohti ja seost KOTKASe menetlusandmetega.",
    answer:
      "Piirkonna jäätmekäitluskohtade leidmiseks ava Andmed ja kaart, vali jäätmekäitluskohtade kiht ning piira kaart soovitud maakonnale. Enne jäätmete viimist kontrolli objekti kehtivust ja vastuvõetavaid jäätmeliike KOTKASest või käitlejalt.",
    canonicalServiceId: "environment-register",
    intentView: "waste-facilities",
    evidencePolicy: "route-only",
    delivery: "catalog-only",
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
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/mullaseire-tulemuste-ulevaade",
    tags: ["muld", "mullaseire", "seiretulemused", "raskmetallid", "taimekaitsevahendid", "KESE"],
    summary:
      "Keskkonnaportaali püsileht koondab riikliku mullaseire eesmärgi, viimased tulemused ja seosed KESE detailsete seireandmetega.",
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
    id: "municipal-waste-recycling",
    title: "Olmejäätmete ringlussevõtt",
    organization: "Keskkonnaportaal",
    type: "Keskkonnanäitaja",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/olmejaatmete-ringlussevott",
    tags: ["jäätmed", "olmejäätmed", "ringlussevõtt", "ringlussevõtu määr", "protsent", "sihttase", "aasta"],
    summary:
      "Keskkonnaportaali näitaja koondab olmejäätmete ringlussevõtu määra, võrdluse Euroopa Liiduga ning 2025. ja 2030. aasta sihttasemed.",
  },
  {
    id: "protected-area-construction",
    title: "Planeerimine ja ehitamine kaitstavatel aladel",
    organization: "Keskkonnaamet",
    type: "Ametlik juhend",
    published: "jooksev",
    url: "https://keskkonnaamet.ee/elusloodus-looduskaitse/tegevused-kaitstavatel-aladel/planeerimine-ja-ehitamine",
    tags: ["Natura 2000", "kaitseala", "piirang", "ehitamine", "planeerimine", "Keskkonnaameti nõusolek"],
    summary:
      "Keskkonnaameti juhend selgitab kaitstaval alal planeerimise ja ehitamise piiranguid, eelneva nõusoleku vajadust ning seost Natura hindamisega.",
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
  if (!canonicalInput.ok || containsPrivatePersonLookup(canonicalInput.query)) return "";
  const words = canonicalInput.query.match(/[\p{L}\p{N}:-]+/gu) || [];
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

export function buildDiscoveryQueries(query, limit = 3) {
  const canonicalInput = canonicalizePublicSearchQuery(query);
  if (!canonicalInput.ok) return [];
  const acceptedQuery = canonicalInput.query;
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

function topicRoot(word) {
  if (word.startsWith("groundwater")) return "pohjavesi";
  if (word.startsWith("weather")) return "ilm";
  if (word.startsWith("forecast")) return "prognoos";
  if (word === "air") return "ohk";
  if (word.startsWith("temperature")) return "temperatuur";
  if (word.startsWith("precipitation") || word.startsWith("rainfall")) return "sademed";
  if (word.startsWith("forest") || word.startsWith("woodland")) return "mets";
  if (word.startsWith("wildlife") || word.startsWith("animal")) return "uluk";
  if (word.startsWith("biodiversity") || word === "nature") return "elurikkus";
  if (word.startsWith("species")) return "liik";
  if (word.startsWith("habitat")) return "elupaik";
  if (word === "water") return "vesi";
  if (word.startsWith("river")) return "jogi";
  if (word.startsWith("lake")) return "jarv";
  if (word === "sea" || word.startsWith("ocean") || word.startsWith("marine")) return "meri";
  if (word.startsWith("baltic")) return "laanemeri";
  if (word.startsWith("pollution")) return "saaste";
  if (word.startsWith("waste")) return "jaat";
  if (word.startsWith("recycl")) return "ringlussevott";
  if (word === "rate") return "maar";
  if (word.startsWith("noise")) return "mura";
  if (word.startsWith("radiation")) return "kiirgus";
  if (word.startsWith("monitor")) return "seire";
  if (word.startsWith("observation")) return "seire";
  if (word.startsWith("eutroph") || word.startsWith("algal") || word === "algae" || word.startsWith("bloom")) return "eutrofeerumine";
  if (word === "map" || word === "maps") return "kaart";
  if (word === "data") return "andmed";
  if (word.startsWith("database")) return "register";
  if (word.startsWith("status")) return "seisund";
  if (word.startsWith("permit")) return "keskkonnaluba";
  if (word.startsWith("application")) return "taotlemine";
  if (word.startsWith("assessment")) return "hindamine";
  if (word.startsWith("scenario")) return "stsenaarium";
  if (word.startsWith("climate")) return "kliima";
  if (word.startsWith("historical")) return "ajalooline";
  if (word.startsWith("regeneration")) return "taastamine";
  if (word.startsWith("tyre") || word.startsWith("tire")) return "rehv";
  if (word.startsWith("dispose") || word.startsWith("disposal")) return "jaat";
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
  if (word.startsWith("peenosak") || word.startsWith("pm10") || word.startsWith("pm2")) return "ohukvaliteet";
  if (word === "ohk" || word.startsWith("valisoh")) return "ohk";
  if (word.startsWith("saast")) return "saaste";
  if (word.startsWith("reove") || word.startsWith("heitve")) return "reovesi";
  if (word.startsWith("heit")) return "heide";
  if (word.startsWith("looduskait")) return "looduskaitse";
  if (word.startsWith("elurikk")) return "elurikkus";
  if (word.startsWith("rohevorg") || word.startsWith("rohekoridor")) return "rohevorgustik";
  if (word.startsWith("voorliig") || word.startsWith("invasiiv") || word.startsWith("karuputk")) return "voorliik";
  if (word.startsWith("uluk") || word.startsWith("karu") || word.startsWith("hund") || word.startsWith("ilves") || word.startsWith("suurkisk")) return "uluk";
  if (word.startsWith("elupaik") || word.startsWith("elupaig") || word.startsWith("vaariselupa") || word.startsWith("varjepaig")) return "elupaik";
  if (word.startsWith("pusielupai")) return "pusielupaik";
  if (word.startsWith("kaitseal")) return "kaitseala";
  if (word.startsWith("kaitstav")) return "kaitstav";
  if (word.startsWith("liig") || word.startsWith("rahni") || word.startsWith("nahkhiir") || word.startsWith("hulj")
    || word.startsWith("konn") || word.startsWith("pesapaig")) return "liik";
  if (word.startsWith("suplusve") || word.startsWith("rannave") || word.startsWith("supluskoh")
    || word.startsWith("rannas") || word.startsWith("ranna") || word.startsWith("rand")) return "suplusvesi";
  if (word.startsWith("joogive") || word.startsWith("kraanive")) return "joogivesi";
  if (word.startsWith("vaikepuhast") || word.startsWith("omapuhast") || word.startsWith("kohtkait") || word.startsWith("kogumismahut")) return "kohtkaitlus";
  if (word.startsWith("pestitsiid") || word.startsWith("taimekaitsevah")) return "pestitsiid";
  if (word.startsWith("nitraat")) return "nitraat";
  if (word.startsWith("pohjave")) return "pohjavesi";
  if (word.startsWith("puurkaev") || word.startsWith("puurauk") || word.startsWith("salvkaev") || word.startsWith("kaevu")) return "puurkaev";
  if (word.startsWith("registr")) return "register";
  if (word.startsWith("mereprug")) return "mereprugi";
  if (word.startsWith("laanemer")) return "laanemeri";
  if (word.startsWith("eutrofeer") || word.startsWith("oitse") || word.startsWith("vetik")) return "eutrofeerumine";
  if (word.startsWith("hudro")) return "vesi";
  if (word.startsWith("emajog") || word.startsWith("emajoe")) return "emajogi";
  if (word.startsWith("jarv") || word.startsWith("tiig")) return "jarv";
  if (word.startsWith("jog") || word.startsWith("joe")) return "jogi";
  if (["vee", "vees", "veest", "veega", "vett"].includes(word) || word.startsWith("veek")) return "vesi";
  if (word.startsWith("veetas") || word.startsWith("vooluhulk") || word.startsWith("kraavive")) return "vesi";
  if (word.startsWith("laht") || word.startsWith("lahes")) return "meri";
  if (word.startsWith("mer")) return "meri";
  if (word.startsWith("jaaolu") || word === "jaakaart" || word === "jaad" || word === "jaa") return "jaaolud";
  if (word.startsWith("vaatlusandm")) return "seire";
  if (word.startsWith("temperatuur")) return "temperatuur";
  if (word.startsWith("sadem") || word.startsWith("saju") || word.startsWith("sajab") || word.startsWith("vihm")) return "sademed";
  if (word.startsWith("uleujutusrisk") || word.startsWith("uleujutusala") || word.startsWith("uleujutuskaart")) return "uleujutusrisk";
  if (word.startsWith("aike") || word.startsWith("libed") || word.startsWith("tuleoht") || word.startsWith("uleujutus")) return "hoiatus";
  if (word.startsWith("talv")) return "kliima";
  if (word.startsWith("prognoos")) return "prognoos";
  if (word.startsWith("ilmaprognoos")) return "prognoos";
  if (word.startsWith("hoiatus") || word.includes("hoiatus")) return "hoiatus";
  if (word.startsWith("katastr")) return "kataster";
  if (word.startsWith("kinnist")) return "kinnistu";
  if (word.startsWith("keskkonnalub") || word.startsWith("keskkonnalo") || word.startsWith("keskonnalo") || word === "luba" || word.startsWith("loa")) return "keskkonnaluba";
  if (word.startsWith("kotkas")) return "kotkas";
  if (word.startsWith("loataotl")) return "taotlemine";
  if (word.startsWith("taotl") || word.startsWith("taotle")) return "taotlemine";
  if (word.startsWith("menetl")) return "menetlus";
  if (word.startsWith("nousole")) return "nousolek";
  if (word.startsWith("ettevot")) return "ettevote";
  if (word.startsWith("ehita") || word.startsWith("ehitus")) return "ehitamine";
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
  if (word.startsWith("energi")) return "energia";
  if (word.startsWith("transpor")) return "transport";
  if (word.startsWith("maavar")) return "maavara";
  if (word.startsWith("kaevand") || word.includes("karjaar")) return "kaevandus";
  if (word.startsWith("korrasta")) return "korrastamine";
  if (word.startsWith("polevkiv")) return "polevkivi";
  if (word.startsWith("mull")) return "muld";
  if (word.startsWith("mura")) return "mura";
  if (word.startsWith("margal") || word.startsWith("rab") || /^soo(?:d|s|st|de|del|des)?$/u.test(word)) return "margala";
  if (word.startsWith("taasta")) return "taastamine";
  if (word.startsWith("pais")) return "pais";
  if (/^kal(?:a|ad|ade|ast|astik|aliik)/u.test(word)) return "kala";
  if (word.startsWith("osoon")) return "osoon";
  if (word.startsWith("paikesepaneel") || word.startsWith("fotogalvaan")) return "paikesepaneel";
  if (word.startsWith("jalajalg") || word.startsWith("jalajalj") || word.startsWith("keskkonnajalaj") || word.startsWith("susinikujalaj") || word.startsWith("khgjalaj")) return "jalajalg";
  if (word.startsWith("organisatsioon")) return "organisatsioon";
  if (word.startsWith("susinik")) return "susinik";
  if (word.startsWith("sidum")) return "sidumine";
  if (word.includes("kiirg")) return "kiirgus";
  if (word.startsWith("tegevuspiirang")) return "tegevuspiirang";
  if (word.startsWith("piirang")) return "piirang";
  if (word.startsWith("harju")) return "harjumaa";
  if (word.startsWith("tallinn")) return "tallinn";
  if (word.startsWith("tartu")) return "tartu";
  if (word.startsWith("viljand")) return "viljandi";
  if (word.startsWith("parnu")) return "parnu";
  if (word.startsWith("narva")) return "narva";
  if (word.startsWith("voru")) return "voru";
  if (word.startsWith("saare")) return "saaremaa";
  if (word.startsWith("kohtla")) return "kohtla";
  if (word.endsWith("maal") && word.length >= 7) return word.slice(0, -1);
  return word;
}

export function queryTerms(query) {
  const normalizedQuery = normalize(query);
  const roots = [...new Set(normalizedQuery
    .split(/\s+/u)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/u.test(word))
    .flatMap((word) => {
      if (word.startsWith("ilmaprognoos")) return ["ilm", "prognoos"];
      if (word.startsWith("uleujutusrisk") || word.startsWith("uleujutusala") || word.startsWith("uleujutuskaart")) {
        return ["vesi", "uleujutusrisk"];
      }
      if (word.startsWith("tormihoiatus")
        || word.startsWith("aike")
        || word.startsWith("libed")
        || word.startsWith("tuleoht")
        || word.startsWith("uleujutushoiatus")) return ["ilm", "hoiatus"];
      if (word.startsWith("sajab") || word.startsWith("vihm")) return ["ilm", "sademed"];
      if (word.startsWith("vooluhulk") || word.startsWith("veetas") || word.startsWith("veetemperatuur")) {
        return ["vesi", "mootmine"];
      }
      if (word.startsWith("aku") && normalizedQuery.includes("elektriauto")
        && !/\b(?:jaat\w*|viia|utiliseer\w*|ringlusse\w*|katki|vana)\b/u.test(normalizedQuery)) return ["aku"];
      if (word.startsWith("metsateatis") || word.startsWith("raieteatis")) return ["mets", "metsateatis"];
      if (word.startsWith("loataotl")) return ["keskkonnaluba", "taotlemine"];
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
  if (/\bair\s+quality\b/u.test(normalizedQuery)) phraseRoots.push("ohukvaliteet");
  if (/\bforest\s+area\b/u.test(normalizedQuery)) phraseRoots.push("mets", "pindala");
  if (/\benvironmental\s+permits?\b/u.test(normalizedQuery)) phraseRoots.push("keskkonnaluba");
  if (/\benvironmental\s+impact\b/u.test(normalizedQuery)) phraseRoots.push("keskkonnamoju");
  if (/\bwind\s+farm\b/u.test(normalizedQuery)) phraseRoots.push("tuulepark");
  if (/\bprotected\s+areas?\b/u.test(normalizedQuery)) phraseRoots.push("kaitseala");
  if (/\bmarine\s+litter\b/u.test(normalizedQuery)) phraseRoots.push("mereprugi");
  if (/\bclimate\s+change\b/u.test(normalizedQuery)) phraseRoots.push("kliima");
  if (/\bforest\s+data\s+(?:map|maps|mapping)\b/u.test(normalizedQuery)) phraseRoots.push("ruumikiht");
  if (/\bmetsa\w*\s+andm\w*\s+kaart\w*\b/u.test(normalizedQuery)) phraseRoots.push("ruumikiht");
  if (/\bbiodiversity\s+(?:observation\w*\s+)?database\b/u.test(normalizedQuery)) phraseRoots.push("loodusvaatlus");
  if (roots.includes("stsenaarium") && roots.includes("sademed")) phraseRoots.push("kliima");
  const expandedRoots = [...new Set([...roots, ...phraseRoots])];
  if (!isForestDepletionQuestion(normalizedQuery)) return expandedRoots;
  // "Otsa" is an idiomatic depletion predicate here, not a useful literal
  // retrieval token. Mapping it to the concept prevents climbing/trail pages
  // such as "Majakivi otsa ronima" from receiving full query coverage.
  return ["mets", "kadumine"];
}

export function queryRootVariants(root) {
  if (root === "mets") return ["mets", "forest", "woodland"];
  if (root === "ilm") return ["ilm", "weather"];
  if (root === "prognoos") return ["prognoos", "forecast"];
  if (root === "ohk") return ["ohk", "air"];
  if (root === "temperatuur") return ["temperatuur", "temperature"];
  if (root === "jogi") return ["jogi", "joe", "river"];
  if (root === "jarv") return ["jarv", "lake"];
  if (root === "elurikkus") return ["elurikk", "biodiversity"];
  if (root === "seire") return ["seire", "monitor", "observation"];
  if (root === "register") return ["register", "database"];
  if (root === "mura") return ["mura", "noise"];
  if (root === "kiirgus") return ["kiirgus", "radiation"];
  if (root === "kliima") return ["kliima", "climate"];
  if (root === "keskkonnaluba") return ["keskkonnaluba", "environmental permit", "permit"];
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
  "jaat", "jaatmekaitluskoht", "prugi", "rehv", "polet", "ringmajandus", "ringlussevott", "looduskaitse", "elurikkus", "elupaik",
  "kaitseala", "natura", "liik", "seire", "loodusvaatlus", "eutrofeerumine", "keskkond", "keskkonnaportaal", "keskkonnaluba", "menetlus", "piirang", "lubatavus",
  "suplusvesi", "joogivesi", "reovesi", "kohtkaitlus", "pestitsiid", "nitraat", "mereprugi", "asbest", "biojaatmed",
  "rohevorgustik", "voorliik", "uluk", "margala", "pais", "kala", "osoon", "paikesepaneel", "jalajalg", "susinik",
  "tuulepark", "aku", "uleujutusrisk",
  "keskkonnamoju", "kotkas", "kmh", "ksh", "kataster", "kinnistu", "metsaregister",
  "elektriauto", "energia", "transport", "kütus", "kytus", "maavara", "kaevandus", "muld",
  "mura", "kiirgus", "climate", "forest", "water", "weather", "pollution", "waste",
  "biodiversity", "nature", "air", "animal", "species", "habitat", "wildlife", "woodland",
  "sea", "ocean", "river", "lake", "data", "andmed", "metaandmed", "api", "statistika", "ruumikiht", "allalaadimine", "kaart", "register", "metsateatis",
]);
const ADMIN_CONTEXT_ROOTS = new Set([
  "tallinn", "tartu", "parnu", "parnumaa", "narva", "viljandi", "rakvere", "voru",
  "kuressaare", "haapsalu", "johvi", "harjumaa", "saaremaa", "kohtla", "ida", "virumaa",
]);
const AMBIGUOUS_ROOTS = new Set([
  "vesi", "jarv", "ohk", "ohukvaliteet", "saaste", "jaat", "looduskaitse", "elurikkus",
  "kliima", "ilm", "keskkond", "energia", "elektriauto", "seire", "andmed",
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
const PROMPT_OR_SECRET_PATTERN = /(?:ignore\s+(?:(?:all|previous)\s+)*(?:instructions?|prompts?)|(?:ignoreeri|eira)\s+(?:(?:kõiki|koiki|eelnev\w*|varasem\w*|süsteemi\w*)\s+)*(?:(?:süsteemi)?juhis\w*|korraldus\w*|reegl\w*|prompt\w*)|system\s+prompt|developer\s+message|api[- ]?key|api\s*(?:võti|voti)|reveal\s+(?:the\s+)?secret|unusta\s+(?:eelnev\w*|juhis\w*)|salajas\w*\s+juhis\w*|(?:avalda|anna|näita|naita|kuva|paljasta)\s+(?:(?:api[- ]?)?(?:saladus\w*|võti\w*|voti\w*|parool\w*|token\w*))|(?:näita|naita|kuva|avalda)\s+serveri\s+(?:keskkonnamuutuj\w*|environment\s+variables?))/iu;
const EXECUTABLE_MARKUP_PATTERN = /(?:<\s*(?:script|img|svg|iframe)\b[^>]*(?:onerror|onload|javascript:)?|\bon(?:error|load)\s*=|javascript\s*:)/iu;
const PERSONAL_LOOKUP_PATTERNS = Object.freeze([
  /\baadressil\b[\s\S]{0,80}\b(?:elab|elanikk?[\p{L}\p{N}_-]*|isik[\p{L}\p{N}_-]*|keegi)\b/iu,
  /\b(?:elukoht[\p{L}\p{N}_-]*|kodune\s+aadress[\p{L}\p{N}_-]*|kodu\s+asukoht[\p{L}\p{N}_-]*)\b/iu,
  /\b(?:konkreetse|kindla)\s+(?:inimese|isiku|eraisiku)\b[\s\S]{0,80}\b(?:puurkaev[\p{L}\p{N}_-]*|kinnist[\p{L}\p{N}_-]*|aadress[\p{L}\p{N}_-]*|andm[\p{L}\p{N}_-]*)/iu,
  /\bkes\s+elab\b[\s\S]{0,60}\b[\p{L}'’-]{2,40}\s+\d{1,4}[a-z]?\b/iu,
  /\belanike?\s+nime[\p{L}\p{N}_-]*\b/iu,
  /\b(?:kellele\s+kuulub|omaniku\s+nimi|kes\s+on[\s\S]{0,40}\bomanik)\b[\s\S]{0,100}\b(?:katastri[\p{L}\p{N}_:-]*|kinnist[\p{L}\p{N}_-]*|maa(?:u|ü)ksus[\p{L}\p{N}_:-]*|puurkaev[\p{L}\p{N}_-]*|aadress[\p{L}\p{N}_-]*)/iu,
  /\b(?:leia|otsi|näita|naita)\s+[\p{L}'’-]{2,40}\s+[\p{L}'’-]{2,40}\s+(?:kinnist[\p{L}\p{N}_-]*|maat[\p{L}\p{N}_-]*|maa(?:u|ü)ksus[\p{L}\p{N}_-]*|aadress[\p{L}\p{N}_-]*|puurkaev[\p{L}\p{N}_-]*)\b/iu,
]);
const ENGLISH_PERSONAL_LOOKUP_PATTERNS = Object.freeze([
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
]);
const ENGLISH_PERSON_TOKEN_SOURCE = String.raw`(?:\p{L}\.?|[\p{L}][\p{L}'’]{1,39})`;
const ENGLISH_PERSON_SEPARATOR_SOURCE = String.raw`(?:[\s\p{Pd}./·:_]+)`;
const ENGLISH_PERSON_NAME_SOURCE = String.raw`${ENGLISH_PERSON_TOKEN_SOURCE}${ENGLISH_PERSON_SEPARATOR_SOURCE}${ENGLISH_PERSON_TOKEN_SOURCE}(?:${ENGLISH_PERSON_SEPARATOR_SOURCE}${ENGLISH_PERSON_TOKEN_SOURCE})?`;
const ENGLISH_PRIVATE_ASSET_SOURCE = String.raw`(?:(?:(?:forest|woodland|land|cadastral|private)\s+){0,2}(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling)|forest|woodland)`;
const ENGLISH_NAMED_POSSESSIVE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PERSON_NAME_SOURCE}(?:'s|’s)\s+${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
  "iu",
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
const ENGLISH_PERSON_ROLE_ASSET_PATTERN = new RegExp(
  String.raw`(?<!\p{L})${ENGLISH_PERSON_NAME_SOURCE}\s+is\s+(?:(?:listed|recorded)\s+as\s+)?(?:the\s+)?(?:owner|landowner|homeowner|tenant|lessee|renter|occupant)\s+of\s+(?:an?\s+|the\s+|this\s+)?${ENGLISH_PRIVATE_ASSET_SOURCE}(?!\p{L})`,
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
const PUBLIC_ORGANIZATION_PATTERN = /(?<![\p{L}\p{N}])(?:[\p{L}-]*(?:amet|agentuur|ministeerium|keskus|linnavalitsus|vallavalitsus|ülikool|instituut|selts|ühing|sihtasutus|osaühing|aktsiaselts|teenistus|muuseum)[\p{L}-]*|(?:environment(?:al)?|climate|forest|nature|water|land|health|statistics)\s+(?:board|agency|ministry|authority|service|institute|university|museum|centre|center)|ministry\s+of\s+(?:climate|the\s+environment)|RMK|KIK|Tallinna\s+Vesi|Eesti\s+Energia|Eesti\s+Geoloogiateenistus[\p{L}-]*|Elering(?:\s+AS)?|[\p{L}-]+\s+(?:AS|OÜ|MTÜ|SA))(?![\p{L}\p{N}])/iu;
const PUBLIC_ORGANIZATION_NAME_PATTERNS = Object.freeze([
  /\b(?:eesti\s+)?keskkonnauuringute\s+keskus[\p{L}-]*\b/giu,
  /\b(?:euroopa\s+)?keskkonnaagentuur[\p{L}-]*\b/giu,
  /\bkeskkonnaamet[\p{L}-]*\b/giu,
  /\bkeskkonnaportaal[\p{L}-]*\b/giu,
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
  /\benvironment(?:al)?\s+(?:board|agency)\b/giu,
  /\bforest\s+service\b/giu,
  /\bministry\s+of\s+(?:climate|the\s+environment)\b/giu,
  /\buniversity\s+of\s+tartu\b/giu,
  /\bstatistics\s+estonia\b/giu,
  /\bestonian\s+(?:health|land)\s+board\b/giu,
  /\beesti\s+energia\b/giu,
  /\belering(?:\s+as)?\b/giu,
  /(?<![\p{L}\p{N}])[\p{L}-]{2,50}\s+(?:AS|OÜ|MTÜ|SA)(?![\p{L}\p{N}])/giu,
  /\b(?:rmk|kik)\b/giu,
]);
const PRIVATE_CONTACT_FIELD_PATTERN = /^(?:kontakt\w*|contact\w*|telefoni?\w*|telephone\w*|phone\w*|telefoninumber\w*|mobiili?\w*|mobile\w*|e-?post\w*|email\w*|meil\w*|mail\w*|sideandm\w*|postkast\w*|gps|koordinaat\w*|coordinate\w*|asukoht\w*|location\w*|asupaik\w*|a?adress\w*|address\w*|koduaadress\w*|homeaddress\w*|kodutänav\w*|kodutanav\w*|elukoht\w*|residence\w*|kodukoht\w*|viibimiskoht\w*|erakodu\w*|kodu|elamu\w*|elupai[kg]\w*)$/iu;
const PRIVATE_PERSON_ATTRIBUTE_TOKEN_PATTERN = /^(?:isikuandm\w*|isikukood\w*|s[üu]nni(?:aeg\w*|aj\w*|aasta\w*|koht\w*|kuup[äa]ev\w*)|terviseandm\w*|biomeetri\w*|ssn|birthdate|birthday)$/iu;
const PRIVATE_PERSON_ATTRIBUTE_CONTEXT_TOKEN_PATTERN = /^(?:isikuandm\w*|isikukood\w*|s[üu]nni(?:aeg\w*|aj\w*|aasta\w*|koht\w*|kuup[äa]ev\w*)|terviseandm\w*|biomeetri\w*|ssn|birthdate|birthday|personal|social|security|numbers?|date|birth|national|identification|passport|identity|information)$/iu;
const PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE = String.raw`[\s\p{P}\p{S}\p{Z}\p{C}\p{M}_]+`;
const PRIVATE_PERSON_ATTRIBUTE_PATTERN = new RegExp(
  String.raw`(?:\b(?:isikuandm\w*|isikukood\w*|s[üu]nni(?:aeg\w*|aj\w*|aasta\w*|koht\w*|kuup[äa]ev\w*)|terviseandm\w*|biomeetri\w*|ssn|birthdate|birthday)\b|(?<!\p{L})(?:social${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}security(?:${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:numbers?|no))?|personal${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:data|information)|date${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}of${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}birth|national${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:id|identification)(?:${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}number)?|passport${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}number)(?!\p{L}))`,
  "iu",
);
const PRIVATE_POSTAL_FIELD_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(?:postiaadress\w*|postal${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:address(?:es)?|details?|information|contact(?:${PRIVATE_PERSON_ATTRIBUTE_SEPARATOR_SOURCE}(?:details?|information))?))(?!\p{L})`,
  "iu",
);
const ECOLOGICAL_SUBJECT_PATTERN = /(?<!\p{L})[\p{L}-]*(?:karu|hundi?|hund|ilves|hülg|hulj|lendorav|kotka?|toonekur(?:g|e)|nahkhiir|saarma?|kobras|põdr|podr|metssiga|rebas|looma?|linnu?|kala|lii[kg]|natura|meri|metsa?|kaitseala|looduskaitse|elurikkus|taime?|rohu?|lille?|samblik|seene?|putuk|konna?|elupai[kg]|pesapai[kg]|rähn|rahn|naarits|rästik|rastik|sisalik|vesilik|siil|madu|nastik|kaan|pärlikar[bp]|parlikar[bp]|hing|võldas|voldas|kuldking|apollo|rüdi|rudi|kõre|kore|tutka?|vigle|animal|bear|beaver|bird|boar|deer|eagle|fish|forest|fox|frog|habitat|lake|lizard|lynx|mink|ocean|orchid|otter|plant|river|salmon|sea|seal|snake|species|squirrel|stork|toad|trout|wolf|woodland)[\p{L}-]*(?!\p{L})/iu;
const ECOLOGICAL_MODIFIER_PATTERN = /^(?:eesti\w*|euroopa\w*|hall\w*|haige\w*|harilik\w*|haruld\w*|hukkun\w*|kaun\w*|leitud|lääne\w*|laane\w*|must\w*|mustlaik\w*|mustsaba\w*|nähtud|nahtud|noor\w*|panda\w*|pesu\w*|pruun\w*|puna\w*|rohe\w*|surnud|suur\w*|valge\w*|vigastatud|väike\w*|vaike\w*|atlantic|baltic|black|brown|common|estonia\w*|european|freshwater|gray|grey|marine|protected|rare|red|white|young)$/iu;
const PUBLIC_CONTACT_ROLE_PATTERN = /^(?:büroo\w*|buroo\w*|e|info\w*|juht\w*|keskkonnaosakond\w*|klienditeenindus\w*|nõunik\w*|nounik\w*|osakond\w*|post|press\w*|projektiosakond\w*|spetsialist\w*|teenindus\w*|üld\w*|uld\w*|vaatlus\w*|customer|data|office|regional|research|service|support)$/iu;
const PERSON_CONTEXT_STOPWORD_PATTERN = /^(?:aga|alal|andm\w*|andmetel|anna|andke|asub|asuv\w*|avalik\w*|jaoks|kaudu|kas|kaits\w*|kasuta\w*|katastri\w*|kes|kuidas|kinnist\w*|konkreetse|kohta|kuulu\w*|kui|kus|kust|küsimus\w*|kõrval|lahedal|lähedal|lasta|lei\w*|loa\w*|luba\w*|maaüksus\w*|maauksus\w*|maatükk\w*|maatukk\w*|metsaeraldis\w*|metsaregister\w*|millal|millis\w*|minu|mis|mida|midagi|miks|nõu\w*|näen|näha|näita|naita|oleva|oma|on|otsing\w*|palju|p[õo]him[õo]t\w*|poliitik\w*|puurkaev\w*|s[äa]ilita\w*|smi|sügavus\w*|tagasta|tagastage|talu\w*|testida|too|t[öo][öo]tle\w*|ütleb|vaadata|valda|vaja|ööbib|oobib|paikneb|peatub|piirkonn\w*|resideerib|registr\w*|viibib|järgi|ja|ning|või|voi|ääres|aasta|elab|elava|majas|a|about|affect\w*|are|area\w*|at|be|by|can|could|customer|data|did|do|does|for|from|get|give|handle[sd]?|handling|how|in|information|is|live[sd]?|living|may|me|must|near|number|occup(?:y|ies|ied|ying)|of|office|on|permit\w*|polic(?:y|ies)|process(?:es|ed|ing)?|protect(?:s|ed|ing)?|protected|public|regional|register\w*|requirement\w*|research|reside[sd]?|residing|return|s|service|should|show|state|stor(?:e|es|ed|ing)|stay(?:s|ed|ing)?|support|tell|that|the|this|to|use[sd]?|using|what|where|which|who|with|would)$/iu;
const ESTONIAN_PRIVATE_OWNERSHIP_PATTERN = /\b(?:omanik\w*|omaja\w*|omand(?:is|uses)\w*|oma(?:b|vad|s|sid|nud|ma|takse|tud)|valdaj\w*|valduses\w*|valda(?:b|vad|s|sid|nud|ma)|kellele\s+kuulub)\b/iu;
const PRIVATE_FOREST_ASSET_PATTERN = /(?<!\p{L})(?:metsamaa\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*|mets(?:a(?:s|st|le|lt|ga|d(?:e(?:s|st|le|lt|ga)?)?)?|i)?|forests?|woodlands?)(?!\p{L})/iu;
const PRIVATE_ASSET_LOOKUP_ACTION_PATTERN = /\b(?:anna|andke|leia|otsi|näita|naita|kuva|tagasta|tagastage|too|show|find|locate|display|reveal|provide|give|get|return|tell)\b/iu;
const EXPLICIT_PRIVATE_FOREST_ASSET_PATTERN = /^(?:metsamaa\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*)$/iu;
const ENGLISH_PRIVATE_FOREST_QUALIFIER_PATTERN = /^(?:property|parcel|plot|lot|estate|land|holding)$/iu;
const PUBLIC_FOREST_RELATION_TOKEN_PATTERN = /^(?:rahvusparg\w*|loodusparg\w*|maastikukaitseal\w*|looduskaitseal\w*|hoiual\w*|kaitseal\w*|riigi\w*|avalik\w*|munitsipaal\w*|mountains?|national|park|public|reserve|state|municipal|government|valley)$/iu;
const ESTONIAN_BELONGING_PARTICIPLE_PATTERN = /^kuuluv(?:a(?:s|st|le|lt|ga|ks|na|d|te(?:s|st|le|lt|ga)?)?|at|ad)?$/iu;
const ESTONIAN_BELONGS_VERB_PATTERN = /^kuulu(?:b|vad|nud|s|sid)$/iu;
const CADASTRE_PATTERN = /\b\d{5}:\d{3}:\d{4}\b/u;
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
  "koduaadress", "kodutanav", "elukoht", "kodukoht", "erakodu", "asukoht", "asupaik",
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
    // Retrieval and corpus search both apply NFKC. Fold compatibility forms
    // here first so the privacy decision cannot see weaker semantics than a
    // downstream search sink; NFD then exposes inserted marks to the bounded
    // keyword canonicalizer below.
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\p{Default_Ignorable_Code_Point}\p{Cc}]/gu, "")
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
    (match) => match.replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase("en"),
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
  return PROMPT_OR_SECRET_PATTERN.test(text) || EXECUTABLE_MARKUP_PATTERN.test(text);
}

export function containsPrivatePersonLookup(value) {
  const text = canonicalSecurityText(value);
  const hasMixedScriptWord = (text.match(/\p{L}+/gu) || []).some((word) => (
    /\p{Script=Latin}/u.test(word)
      && /[^\p{Script=Latin}\p{M}]/u.test(word)
  ));
  const hasPrivateAssetContext = /(?<!\p{L})(?:katastri\w*|kinnist\w*|maa(?:u|ü)ksus\w*|maat(?:ü|u)kk\w*|metsamaa\w*|metsaeraldis\w*|metsakinnist\w*|metsat(?:ü|u)kk\w*|puistu\w*|puurkaev\w*|aadress\w*|property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|forest|woodland)(?!\p{L})/iu.test(text);
  // A private-asset query containing a Latin/non-Latin mixed token is
  // ambiguous by construction (for example Armenian/Cyrillic letters inside
  // "owns"). Fail closed instead of relying on an endless confusable list.
  if (hasMixedScriptWord && hasPrivateAssetContext) return true;
  const matchesEnglishPersonalPattern = ENGLISH_PERSONAL_LOOKUP_PATTERNS
    .some((pattern) => pattern.test(text));
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  const sensitiveIndex = words.findIndex((word) => (
    PRIVATE_CONTACT_FIELD_PATTERN.test(word)
    || PRIVATE_PERSON_ATTRIBUTE_TOKEN_PATTERN.test(word)
  ));
  const hasSensitivePersonalAttribute = PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text);
  const hasPrivatePostalField = PRIVATE_POSTAL_FIELD_PATTERN.test(text);
  const textWithoutKnownOrganizations = PUBLIC_ORGANIZATION_NAME_PATTERNS.reduce(
    (remaining, pattern) => remaining.replace(pattern, " "),
    text,
  );
  const hasKnownPublicOrganization = normalize(textWithoutKnownOrganizations) !== normalize(text);
  if (ENGLISH_NAMED_POSSESSIVE_ASSET_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_ASSET_TO_PERSON_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_ASSET_IN_PERSON_NAME_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_PERSON_TO_ASSET_PATTERN.test(textWithoutKnownOrganizations)
    || ENGLISH_PERSON_ROLE_ASSET_PATTERN.test(textWithoutKnownOrganizations)) return true;
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
    return [...DOMAIN_ROOTS].some((root) => queryRootVariants(root).some((variant) => {
      const normalizedVariant = normalize(variant);
      return normalizedWord === normalizedVariant
        || (normalizedVariant.length >= 4 && normalizedWord.startsWith(normalizedVariant));
    }));
  };
  // Postal-field phrases are sensitive predicates, not identity material.
  // Removing the complete phrase prevents words such as "details" from
  // synthesizing a person beside a legitimate public organization or policy.
  const identityText = textWithoutKnownOrganizations.replace(PRIVATE_POSTAL_FIELD_PATTERN, " ");
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
  const hasSensitiveContact = /\b(?:kontakt\w*|contact\w*|telefoni?\w*|telephone\w*|phone\w*|telefoninumber\w*|mobiili?\w*|mobile\w*|e-?post\w*|email\w*|meil\w*|mail\w*|sideandm\w*|postkast\w*|address\w*|residence\w*)\b/iu.test(text)
    || hasPrivatePostalField;
  const hasAddressAndPresence = /\baadress\w*\b[\s\S]{0,100}\b(?:elab|peatub|resideerib|paikneb)\b/iu.test(text);
  const residenceVerbIndex = words.findIndex((word) => /^(?:elab|elava|resideerib|peatub|viibib|asub|paikneb|ööbib|oobib|live[sd]?|living|reside[sd]?|residing|stay(?:s|ing)?|occup(?:y|ies|ied|ying))$/iu.test(word));
  const hasResidenceContext = residenceVerbIndex >= 0
    || /\bkus\b[\s\S]{0,100}\belab\b/iu.test(text)
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
  const hasPrivateAssetReference = CADASTRE_PATTERN.test(text)
    || /\b(?:katastri(?:üksus|uksus|tunnus|number|andmed)\w*|kinnist\w*|maa(?:u|ü)ksus\w*|puurkaev\w*|aadress\w*)\b/iu.test(text);
  const hasPersonOrOwnerPredicate = ESTONIAN_PRIVATE_OWNERSHIP_PATTERN.test(text)
    || /\b(?:kontakt\w*|elanike?\s+nime\w*|(?:isiku|inimese|omaniku)\s+nimi\w*|kes\s+(?:kasutab|elab))\b/iu.test(text);
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
  const englishPrivateAsset = /\b(?:property|parcel|plot|lot|estate|land|house|home|farm|well|borehole|building|dwelling|cadastral\s+(?:unit|parcel)|street\s+address)\b/iu.test(text);
  const englishSpecificForest = /\b(?:this|that|the\s+specific|a\s+specific)\s+(?:forest|woodland|property|parcel|plot|land|house|home|farm|well|borehole|building)\b/iu.test(text);
  const englishOwnershipIntent = /\b(?:who\s+(?:owns?|is\s+the\s+(?:registered\s+)?(?:owner|proprietor|landholder|landlord)\s+of)|whose\s+(?:property|parcel|plot|land|house|home|farm|well|borehole)|(?:property|parcel|plot|land|forest|home|house)\s+(?:owner|landowner|homeowner|proprietor|landholder|landlord)|(?:identify|find|name|contact|show)\b[\s\S]{0,60}\b(?:owner|landowner|homeowner|proprietor|landholder|landlord))\b/iu.test(text);
  const englishOwnerContactIntent = /\b(?:(?:contact|name|identity|address|phone|telephone|email)\b[\s\S]{0,50}\b(?:owner|resident|occupant|inhabitant|landowner|landholder|landlord|homeowner|proprietor)|(?:owner|resident|occupant|inhabitant|landowner|landholder|landlord|homeowner|proprietor)\b[\s\S]{0,50}\b(?:contact|name|identity|address|phone|telephone|email))\b/iu.test(text);
  const englishResidenceIntent = /\bwho\s+(?:currently\s+)?(?:lives?|is\s+living|resides?|is\s+residing|stays?|occup(?:ies|ys)|inhabits?)\b/iu.test(text)
    || (/\bwhere\s+does\b[\s\S]{0,80}\b(?:live|reside|stay|inhabit)\b/iu.test(text) && hasNamedIdentity);
  const englishNamedAssetRelationship = hasNamedIdentity && (
    /\b(?:owns?|owned)\b[\s\S]{0,80}\b(?:property|parcel|plot|land|house|home|farm|well|borehole|forest|woodland)\b/iu.test(text)
    || /\b(?:property|parcel|plot|land|house|home|farm|well|borehole|forest|woodland)\b[\s\S]{0,50}\bof\b/iu.test(text)
    || /(?:'s|’s)\s+(?:property|parcel|plot|land|house|home|farm|well|borehole|forest|woodland)\b/iu.test(text)
  );
  const englishPublicAggregate = /\b(?:state|public|national|municipal|government(?:-owned)?)\s+(?:forest|woodland|land|property|estate)s?\b/iu.test(text)
    && !englishStreetAddress
    && !CADASTRE_PATTERN.test(text)
    && !englishSpecificForest;
  const englishGeneralOwnershipPolicy = /\b(?:responsibilit(?:y|ies)|rights?|dut(?:y|ies)|obligations?|rules?|requirements?|law|regulation|guidance|policy)\b/iu.test(text)
    && !englishStreetAddress
    && !CADASTRE_PATTERN.test(text)
    && !englishSpecificForest;
  const englishGeneralOwnershipExemption = englishPublicAggregate || englishGeneralOwnershipPolicy;
  const englishAssetIdentityQuestion = /\b(?:who|whom|whose\s+name|which\s+person|show(?:\s+me)?\s+the\s+person)\b/iu.test(textWithoutKnownOrganizations)
    && englishPrivateAsset
    && /\b(?:(?:registered|recorded)(?:\s+(?:to|under|in))?|(?:associated|connected|linked)\s+(?:to|with)|(?:owned|held)\s+by)\b/iu.test(textWithoutKnownOrganizations)
    && !englishGeneralOwnershipExemption;
  const englishPatternLookup = matchesEnglishPersonalPattern && !(
    englishGeneralOwnershipExemption
    && !englishNamedResidenceQuestion
    && !englishNamedFoundQuestion
    && !englishNamedLocatedQuestion
    && !englishLocateNamedPerson
    && !englishOwnerContactIntent
  );
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
    || (englishNamedAssetRelationship && !englishGeneralOwnershipExemption)
    || englishAssetIdentityQuestion
    || englishPatternLookup;
  const explicitPersonalLookup = PERSONAL_LOOKUP_PATTERNS.some((pattern) => pattern.test(text))
    || hasAddressAndPresence
    || (hasHumanMarker && hasSensitiveContact)
    || (hasPrivateAssetReference && hasPrivateAssetIdentity)
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
    || englishPersonalLookup;
  if (explicitPersonalLookup) return true;
  if (hasKnownPublicOrganization && hasSensitiveContact && suspiciousIdentityFragments.length === 0) return false;
  return hasPrivateAssetReference && hasPersonOrOwnerPredicate;
}

function isPublicOrganizationContactQuery(value) {
  const text = canonicalSecurityText(value);
  return PUBLIC_ORGANIZATION_PATTERN.test(text)
    && (/\b(?:kontakt\w*|contact\w*|telefoni?\w*|telephone\w*|phone\w*|telefoninumber\w*|e-?post\w*|email\w*|aadress\w*|address\w*)\b/iu.test(text)
      || PRIVATE_POSTAL_FIELD_PATTERN.test(text))
    && !containsPrivatePersonLookup(text);
}

function rootIsDomain(root) {
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
  const roots = queryTerms(cleanQuery);
  const domainRoots = roots.filter(rootIsDomain);
  const domainFamilies = new Set(domainRoots.map((root) => DOMAIN_FAMILY_BY_ROOT.get(root)).filter(Boolean));
  const forestryIntent = forestEvidenceIntent(cleanQuery);
  const locationPattern = /\b(?:tallinn|tartu|parnu|narva|viljandi|rakvere|voru|kuressaare|haapsalu|johvi|saaremaa|kohtla|harjumaa|raplamaa|ida virumaa)\w*/u;
  const hasLocation = locationPattern.test(normalized);
  const historical = /\b(?:(?:19|20)\d{2}|ajalool\w*|varasem\w*|arhiiv\w*|eelmisel|mullu|kliima\w*|keskm\w*|moodunud|historical|historic|archive|archived|past)\b/u.test(normalized);
  const current = /\b(?:tana\w*|homn\w*|homm\w*|homs\w*|ulehomme|praegu|hetkel|hetke\w*|nadalavahet\w*|reaalajas|prognoos\w*|\w*hoiatus\w*|today|tomorrow|current|currently|now|weekend|forecast\w*|warning\w*)\b/u.test(normalized);
  const weatherIntent = domainRoots.some((root) => ["ilm", "prognoos", "hoiatus", "sademed"].includes(root));
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
      && roots.some((root) => ["kaitseala", "kaitstav", "liik", "elupaik", "puurkaev"].includes(root)));
  if (legalIntent) routeClasses.add("official_legal_context");
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
  if (containsPrivatePersonLookup(cleanQuery)) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "personal-data-lookup",
      clarification: "Ma ei aita tuvastada eraisiku elukohta, vara ega muid isikuga seostatavaid registriandmeid. Avalikke keskkonnaobjekte saab otsida objekti tunnuse järgi ametlikust registrist.",
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
  if (!domainRoots.length && !forestryIntent) {
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
  if (forestryIntent?.kind === "municipality-forest-area"
    && (/\b(?:minu|mu|meie|oma|selles|siin)\b[\s\S]{0,35}\b(?:vald|valla|vallas)\w*\b/u.test(normalized)
      || /\bkoduvall\w*\b/u.test(normalized)
      || namedMunicipalityExample
      || /^(?:kui\s+palju\s+)?mets\w*\s+(?:on\s+)?vallas$/u.test(normalized)
      || /\b(?:metsa|metsade?)\s+(?:protsent|osakaal|pindala)\s+vallas\b/u.test(normalized))) {
    return {
      kind: "needs-clarification",
      topic: "mets",
      reason: "missing-municipality",
      clarification: namedMunicipalityExample
        ? "Palun täpsusta konkreetne omavalitsus (näiteks Võru linn või Võru vald) ja soovitud näitaja: metsamaa pindala, metsasuse protsent või Metsaregistris kehtivate eraldiste pindala. Need on eri näitajad."
        : "Palun nimeta vald ja täpsusta, kas soovid metsamaa pindala, metsasuse protsenti või Metsaregistris kehtivate eraldiste pindala. Need on eri näitajad.",
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
  const weatherLocationPattern = /\b(?:tallinn|tartu|parnu|narva|viljandi|rakvere|voru|kuressaare|haapsalu|johvi|saaremaa|kohtla)\w*/u;
  const explicitlyCurrentWeather = /\b(?:tana\w*|homn\w*|homm\w*|homs\w*|ulehomme|praegu|hetkel|hetkeseis\w*|nadalavahet\w*|prognoos\w*|\w*hoiatus\w*|today|tomorrow|current|currently|now|weekend|forecast\w*|warning\w*)\b/u.test(normalized);
  const historicalWeatherContext = /\b(?:(?:19|20)\d{2}|ajalool\w*|kliima\w*|keskm\w*|möödunud|moodunud|historical|historic|archive|past)\b/u.test(normalized);
  const weatherIntent = domainRoots.some((root) => ["ilm", "prognoos", "hoiatus", "sademed"].includes(root));
  const locationDefaultsToCurrentWeather = weatherIntent
    && weatherLocationPattern.test(normalized)
    && !historicalWeatherContext;
  if (weatherIntent
    && (explicitlyCurrentWeather || locationDefaultsToCurrentWeather)) {
    return {
      kind: "live-weather",
      topic: "ilm",
      reason: "time-sensitive-weather",
      clarification: weatherLocationPattern.test(normalized)
        ? null
        : "Lisa asukoht, et avada õige piirkonna prognoos.",
    };
  }
  const explicitlyCurrentAir = /\b(?:praeg\w*|hetkel|hetke\w*|reaalajas|tana\w*|värske\w*|varske\w*|today|current|currently|now|real\s+time|latest)\b/u.test(normalized);
  const airIntent = roots.some((root) => ["ohk", "ohukvaliteet", "saaste", "osoon", "pm10", "pm25"].includes(root));
  const airLocation = /\b(?:tallinn|tartu|parnu|narva|kohtla|viljandi|voru|saaremaa)\w*/u.test(normalized);
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
  if (AMBIGUOUS_ROOTS.has(topic) && (roots.length <= 1 || waterContextOnly)) {
    return {
      kind: "needs-clarification",
      topic,
      reason: "broad-topic",
      clarification: clarificationFor(topic),
    };
  }
  return { kind: "answerable", topic, reason: "environment-domain", clarification: null };
}

export function scoreDocument(document, query) {
  const normalizedQuery = normalize(query);
  const words = queryTerms(query);
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

export function assessEvidence(query, documents = []) {
  const terms = queryTerms(query);
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
  const directDocument = perDocument.find((match, index) => {
    const document = candidates[index];
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
    content: "Metsa püsimist ja seisundit ei kirjelda üks näitaja. Keskkonnaülevaate järgi moodustas metsamaa 51,8% Eesti pindalast, kuid metsaga kaetud pindala ehk puistute pindala 47,1%; need on eri näitajad. 2024. aasta ruumianalüüsi järgi oli kaitse all 28,4% Eesti metsadest ja rangelt kaitstav 16,8% metsamaast; neid õigusliku kaitse näitajaid ei tohi samastada SMI majanduskategooriatega. Ülevaade käsitleb eraldi metsa pindala, tagavara ja vanuselist struktuuri ning metsade kahjustusi, elurikkust, kaitset ja kliimaga seotud riske. Kliimamuutuse mõjud ei ole ühesuunalised: põuad, soojemad talved, haigustekitajad ja kahjurid võivad juurdekasvu vähendada ning puid kahjustada. Kuuse-kooreüraski kahjustuskollete laienemist hinnati 2019.–2024. aastal ligikaudu 22 500 hektarile. Raiemahu mõju sõltub metsa asukohast, vanusest, koosseisust, elupaikadest, mullast ja veerežiimist, mistõttu väide, et kõik lageraied on alati ühesuguse keskkonnamõjuga, ei ole mõõdetav üksikfakt. Ülevaate järgi on raiemaht viimasel kümnendil püsinud ligikaudu 10–12 miljoni m³ tasemel, kuid pikaajalise võrdluse jaoks tuleb kasutada sama definitsiooni ja metoodikaga aegrida. Viimase aasta hinnang ja viie aasta keskmine ei näita iseenesest, kas praegu raiutakse rohkem kui täpselt 20 aastat tagasi. Vastuseks on vaja sama metoodikaga 20-aastast aegrida.",
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
const CATALOGUE_REVIEWED_AT = "2026-08-19T00:00:00.000Z";
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
    document.tags,
    document.topics,
  ];
  const digest = createHash("sha256").update(JSON.stringify(extract)).digest("hex");
  return `catalogue-review-2026-08-19:${digest}`;
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

export function rankDocuments(query, documents = SEARCH_DOCUMENTS) {
  const primaryTopic = assessSearchQuery(query).topic;
  return documents
    .map((document) => ({ ...document, score: scoreDocument(document, query) }))
    .filter((document) => document.score > 0
      && (!primaryTopic || documentRoots(document).has(primaryTopic)))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "et"));
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

function responseSources(ids) {
  const catalogue = [...SEARCH_DOCUMENTS, ...ADDITIONAL_OFFICIAL_SERVICE_DOCUMENTS];
  return ids.flatMap((id, index) => {
    const source = catalogue.find((candidate) => candidate.id === id);
    return source ? [{ ...source, citation: index + 1 }] : [];
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
      documentIds: topicSources.map((source) => source.id),
    },
  };
}

export function searchEnvironment(query, limit = 6) {
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
  const ranked = rankDocuments(cleanQuery, SEARCH_DOCUMENTS);
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
