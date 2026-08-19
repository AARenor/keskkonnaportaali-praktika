import { cadastreSourceDocuments } from "./cadastre.mjs";

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
    tags: ["avaandmed", "andmestik", "allalaadimine", "API", "failihoidla"],
    summary:
      "Avaandmete vaade juhatab keskkonnaandmete kirjelduste, allalaaditavate failide ja seotud registrite juurde.",
    answer:
      "Keskkonnaandmete taaskasutamiseks alusta avaandmete vaatest: sealt saab liikuda andmestike kirjelduste, failihoidla ja andmeid haldavate registrite juurde.",
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
  },
  {
    id: "waste",
    title: "Jäätmed ja ringmajandus",
    organization: "Keskkonnaportaal",
    type: "Teemakataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/search?search_api_fulltext=ringmajandus",
    tags: ["jäätmed", "ringmajandus", "pistrik", "jäätmekäitlus", "taaskasutus"],
    summary:
      "Jäätmete ja ringmajanduse materjalid seovad jäätmetekke, käitluse, taaskasutuse ja valdkonna infosüsteemid.",
    answer:
      "Jäätmeandmete puhul täpsusta aasta, jäätmeliik ja käitlusviis, sest kogused ning taaskasutuse näitajad ei ole eri lõigetes otse võrreldavad.",
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
  },
  {
    id: "environmental-permits",
    title: "Keskkonnaotsuste infosüsteem KOTKAS",
    organization: "Keskkonnaamet",
    type: "Infosüsteem",
    published: "jooksev",
    url: "https://kotkas.envir.ee/",
    locator: "https://keskkonnaamet.ee/kasiraamat-kohaliku-omavalitsuse-keskkonnaspetsialistile/kaevandamisloa-taotluse-menetlus-tahtsamate-etappide-kaupa",
    tags: ["luba", "keskkonnaluba", "taotlemine", "ettevõte", "KMH", "menetlus", "aruandlus", "KOTKAS"],
    summary:
      "KOTKAS on keskkonnalubade ametlik infosüsteem: seal saab esitada taotluse ning kontrollida konkreetse keskkonnaloa menetluse staatust ja avalikke dokumente.",
    answer:
      "Konkreetse loa või menetluse ametlikku seisu kontrolli KOTKASest; portaali otsing aitab leida tausta, kuid menetlusandmete allikaks on infosüsteem ise.",
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
    tags: ["elektriauto", "elektrisõiduk", "keskkonnamõju", "elutsükkel", "aku", "kasvuhoonegaas", "õhusaaste", "transport"],
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
  "alla",
  "kaudu",
  "kontrollida",
  "esitada",
  "kaasnevad",
  "halvas",
  "teenus",
  "teenuse",
  "ole",
  "sama",
  "asi",
  "kelle",
  "vaja",
  "naeb",
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
  const words = String(query || "")
    .normalize("NFKC")
    .match(/[\p{L}\p{N}:-]+/gu) || [];
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
  const text = normalize(String(query || "").normalize("NFKC"));
  const hasForest = /\b(?:mets\w*|smi|statistilise\s+metsainvent)/u.test(text);
  const hasSmi = /\b(?:smi|statistilise\s+metsainvent\w*)/u.test(text);
  const hasForestData = /\b(?:metsa|metsandus|metsainventeerimis)andm\w*/u.test(text);
  const hasForestRegister = /\bmetsaregis\w*/u.test(text);
  const hasComparison = /\b(?:vahe|erinev\w*|vordl\w*|kumb|sama|klap\w*|vastuolu)\b/u.test(text);
  const hasAreaQuestion = /\b(?:kui palju|mitu|kui suur\w*|metsamaa|metsasuse|pindala|osakaal|hektar\w*)\b/u.test(text);

  if (hasForest && isForestDepletionQuestion(text)) {
    return {
      kind: "forest-depletion",
      discoveryQueries: [
        "metsa tagavara stabiilne SMI",
        "Eesti metsamaa pindala SMI",
        "Eesti metsade seisund trendid",
      ],
    };
  }

  if (hasForest && hasSmi && (hasForestRegister || (hasForestData && hasComparison))) {
    return {
      kind: "forest-data-sources",
      discoveryQueries: [
        "metsaregister SMI andmed",
        "statistiline metsainventuur metsaandmed",
      ],
    };
  }
  if (hasForest && hasAreaQuestion) {
    return {
      kind: "forest-area",
      discoveryQueries: [
        "metsamaa pindala SMI Eesti",
        "metsasuse pindala Eesti",
      ],
    };
  }
  return null;
}

export function buildDiscoveryQueries(query, limit = 3) {
  const base = buildDiscoveryQuery(query);
  if (!base) return [];
  const words = base.match(/[\p{L}\p{N}:-]+/gu) || [];
  const roots = queryTerms(query);
  const forestryIntent = forestEvidenceIntent(query);
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
  return [...new Set([
    ...(forestryIntent?.discoveryQueries || []),
    base,
    ...expanded,
    ...focused,
  ])]
    .slice(0, Math.max(1, Math.min(Number(limit) || 3, 3)));
}

function topicRoot(word) {
  if (word.startsWith("avaandm")) return "avaandmed";
  if (word.startsWith("keskkonnaandm")) return "andmed";
  if (word.startsWith("kasvuhoonegaas") || word === "khg") return "kasvuhoonegaas";
  if (word.startsWith("metsaregis")) return "metsaregister";
  if (word.startsWith("metsaandm") || word.startsWith("metsandusandm")) return "metsaandmed";
  if (word.startsWith("mets")) return "mets";
  if (word.startsWith("rai")) return "raie";
  if (word.startsWith("netojuurdekasv") || word.startsWith("juurdekasv")) return "juurdekasv";
  if (word.startsWith("ulet")) return "uletamine";
  if (word.startsWith("noor")) return "noor";
  if (word.startsWith("vanus") || word.startsWith("vanamets") || word.startsWith("keskeal")) return "vanus";
  if (word.startsWith("osakaal")) return "osakaal";
  if (word.startsWith("muut") || word.startsWith("vahen") || word.startsWith("kahan") || word.startsWith("langen")) return "muutus";
  if (word.startsWith("kasv")) return "kasv";
  if (word.startsWith("tulemus")) return "tulemus";
  if (word.startsWith("tulevik")) return "tulevik";
  if (word.startsWith("kliim")) return "kliima";
  if (word.startsWith("stsenaarium")) return "stsenaarium";
  if (word.startsWith("kaard")) return "kaart";
  if (word.startsWith("ruumikiht")) return "ruumikiht";
  if (word.startsWith("laadida") || word.startsWith("allalaadi") || word.startsWith("alalaadi")) return "allalaadimine";
  if (word.startsWith("kasutusjuh")) return "kasutusjuhend";
  if (word.startsWith("jaatmekaitluskoh")) return "jaatmekaitluskoht";
  if (word.startsWith("kulmkapp") || word.startsWith("kodumasin") || word.startsWith("elektroonik")) return "jaatmekaitluskoht";
  if (word.startsWith("jaat")) return "jaat";
  if (word.startsWith("ringlussevot")) return "ringlussevott";
  if (word === "maar" || word.startsWith("protsent")) return "maar";
  if (word.startsWith("prugil")) return "jaatmekaitluskoht";
  if (word.startsWith("prugi")) return "prugi";
  if (word.startsWith("rehv") || word.startsWith("autorehv")) return "rehv";
  if (word.startsWith("polet")) return "polet";
  if (["tohib", "voib", "lubatud", "keelatud"].includes(word)) return "lubatavus";
  if (word.startsWith("ohukval") || word === "ohu") return "ohukvaliteet";
  if (word.startsWith("peenosak")) return "ohukvaliteet";
  if (word === "ohk" || word.startsWith("valisoh")) return "ohk";
  if (word.startsWith("saast")) return "saaste";
  if (word.startsWith("heit")) return "heide";
  if (word.startsWith("looduskait")) return "looduskaitse";
  if (word.startsWith("elurikk")) return "elurikkus";
  if (word.startsWith("elupaik") || word.startsWith("elupaig")) return "elupaik";
  if (word.startsWith("pusielupaig")) return "pusielupaik";
  if (word.startsWith("kaitseal")) return "kaitseala";
  if (word.startsWith("kaitstav")) return "kaitstav";
  if (word.startsWith("liig")) return "liik";
  if (word.startsWith("pohjave")) return "pohjavesi";
  if (word.startsWith("puurkaev") || word.startsWith("puurauk")) return "puurkaev";
  if (word.startsWith("registr")) return "register";
  if (word.startsWith("laanemer")) return "laanemeri";
  if (word.startsWith("hudro")) return "vesi";
  if (word.startsWith("emajog") || word.startsWith("emajoe")) return "emajogi";
  if (word.startsWith("jarv")) return "jarv";
  if (word.startsWith("jog")) return "jogi";
  if (word === "vee" || word.startsWith("veek")) return "vesi";
  if (word.startsWith("veetas")) return "vesi";
  if (word.startsWith("mer")) return "meri";
  if (word.startsWith("jaaolu") || word === "jaakaart") return "jaaolud";
  if (word.startsWith("vaatlusandm")) return "seire";
  if (word.startsWith("temperatuur")) return "temperatuur";
  if (word.startsWith("sadem") || word.startsWith("saju")) return "sademed";
  if (word.startsWith("prognoos")) return "prognoos";
  if (word.startsWith("ilmaprognoos")) return "prognoos";
  if (word.startsWith("hoiatus") || word.includes("hoiatus")) return "hoiatus";
  if (word.startsWith("katastr")) return "kataster";
  if (word.startsWith("kinnist")) return "kinnistu";
  if (word.startsWith("keskkonnalub") || word.startsWith("keskkonnalo") || word.startsWith("keskonnalo")) return "keskkonnaluba";
  if (word.startsWith("kotkas")) return "kotkas";
  if (word.startsWith("taotl") || word.startsWith("taotle")) return "taotlemine";
  if (word.startsWith("nousole")) return "nousolek";
  if (word.startsWith("ettevot")) return "ettevote";
  if (word.startsWith("ehita") || word.startsWith("ehitus")) return "ehitamine";
  if (word.startsWith("seisund") || word.startsWith("hinnang")) return "seisund";
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
  if (word.startsWith("kaevand") || word.startsWith("karjaar")) return "kaevandus";
  if (word.startsWith("korrasta")) return "korrastamine";
  if (word.startsWith("polevkiv")) return "polevkivi";
  if (word.startsWith("mull")) return "muld";
  if (word.startsWith("mura")) return "mura";
  if (word.includes("kiirg")) return "kiirgus";
  if (word.startsWith("tegevuspiirang")) return "tegevuspiirang";
  if (word.startsWith("piirang")) return "piirang";
  if (word.startsWith("harju")) return "harjumaa";
  if (word.startsWith("tallinn")) return "tallinn";
  if (word.startsWith("tartu")) return "tartu";
  if (word.startsWith("viljand")) return "viljandi";
  if (word.endsWith("maal") && word.length >= 7) return word.slice(0, -1);
  return word;
}

export function queryTerms(query) {
  const normalizedQuery = normalize(query);
  const roots = [...new Set(normalizedQuery
    .split(/\s+/u)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/u.test(word))
    .flatMap((word) => {
      if (word.startsWith("metsastat")) return [topicRoot(word), "statistika"];
      if (word.startsWith("metsaandm") || word.startsWith("metsandusandm")) return ["mets", "andmed"];
      if (word.startsWith("metsaregis")) return ["mets", "metsaregister"];
      if (word.startsWith("kliimastsenaarium")) return ["kliima", "stsenaarium"];
      if (word.includes("tormihoiatus")) return ["ilm", "hoiatus"];
      if (word === "kmh" || word === "ksh") return [word, "keskkonnamoju"];
      if (word.startsWith("pm2")) return ["pm25", "ohukvaliteet"];
      return [topicRoot(word)];
    }))];
  if (!isForestDepletionQuestion(normalizedQuery)) return roots;
  // "Otsa" is an idiomatic depletion predicate here, not a useful literal
  // retrieval token. Mapping it to the concept prevents climbing/trail pages
  // such as "Majakivi otsa ronima" from receiving full query coverage.
  return ["mets", "kadumine"];
}

export function queryRootVariants(root) {
  if (root === "raie") return ["rai"];
  if (root === "juurdekasv") return ["juurdekasv", "netojuurdekasv"];
  if (root === "uletamine") return ["ulet", "suurem", "rohkem"];
  if (root === "noor") return ["noor", "vanus", "vanuse", "vanem", "keskeal"];
  if (root === "vanus") return ["vanus", "vana", "noor", "keskeal"];
  if (root === "muutus") return ["muut", "trend", "suuren", "vahen", "kahan", "lang", "pusi"];
  if (root === "kasv") return ["kasv", "suuren"];
  if (root === "kasvuhoonegaas") return ["kasvuhoonegaas", "khg"];
  if (root === "kaevandus") return ["kaevand"];
  if (root === "heide") return ["heide", "heit"];
  if (root === "ringlussevott") return ["ringlussevot", "taaskasut"];
  if (root === "lubatavus") return ["ei tohi", "tohib", "lubat", "keelat"];
  if (root === "elutsukkel") return ["elutsuk"];
  if (root === "maar") return ["maar", "osakaal", "protsent", "tase"];
  if (root === "taotlemine") return ["taotl", "taotle"];
  if (root === "ettevote") return ["ettevot"];
  if (root === "ehitamine") return ["ehit"];
  if (root === "seisund") return ["seisund", "hinnang", "klass"];
  if (root === "keskkonnamoju") return ["keskkonnamoj", "keskkonna moju", "moju keskkonn", "keskkonnahairing"];
  if (root === "laanemeri") return ["laanemer"];
  if (root === "meri") return ["meri", "mere"];
  if (root === "sademed") return ["sadem", "saju"];
  if (root === "pohjavesi") return ["pohjave"];
  if (root === "vesi") return ["vesi", "vee", "veek", "hudro"];
  if (root === "emajogi") return ["emajog", "emajoe"];
  if (root === "ajalooline") return ["ajalool"];
  if (root === "mootmine") return ["mootm", "tulemus"];
  if (root === "harjumaa") return ["harjumaa", "harju"];
  if (root === "liik") return ["liik", "liig"];
  if (root === "kaitseala") return ["kaitseal"];
  if (root === "elupaik") return ["elupaik", "elupaig"];
  if (root === "statistika") return ["statist", "smi", "inventuur"];
  if (root === "tulemus") return ["tulemus"];
  if (root === "tulevik") return ["tulevik", "prognoos", "lahiaast"];
  if (root === "kadumine") return ["kadum", "kaob", "kaovad", "havim", "havib", "havivad", "otsa saam", "enam metsa pole"];
  if (root === "andmed") return ["andme", "avaand"];
  if (root === "metsaregister") return ["metsaregis", "metsaressursi arvestuse"];
  if (root === "avaandmed") return ["avaand"];
  if (root === "allalaadimine") return ["allalaad", "alalaad", "alla laad"];
  if (root === "kasutusjuhend") return ["kasutusjuh", "juhend"];
  if (root === "kaart") return ["kaart", "kaard"];
  if (root === "ruumikiht") return ["ruumikiht", "ruumiandm"];
  if (root === "stsenaarium") return ["stsenaarium"];
  if (root === "polevkivi") return ["polevkivi", "polevkivibassein"];
  if (root === "ohukvaliteet") return ["ohukvaliteet", "ohu kvaliteet", "valisoh"];
  if (root === "jaat") return ["jaat", "prugi"];
  return [root];
}

export function textHasQueryRoot(value, root) {
  const text = normalize(value);
  if (root === "maar") {
    // "määr" (rate) and "määrus" (regulation) are different intents in Estonian.
    // A plain substring match would make legal-regulation pages look like numeric indicators.
    return /\b(?:maar(?!us)\w*|osakaal\w*|protsent\w*|tase\w*)\b/u.test(text);
  }
  return queryRootVariants(root).some((variant) => text.includes(variant));
}

const DOMAIN_ROOTS = new Set([
  "mets", "raie", "kliima", "ilm", "prognoos", "hoiatus", "temperatuur", "sademed", "tuul",
  "vesi", "jarv", "jogi", "meri", "laanemeri", "pohjavesi", "puurkaev", "jaaolud", "ohk", "ohukvaliteet", "saaste", "heide", "kasvuhoonegaas",
  "jaat", "jaatmekaitluskoht", "prugi", "rehv", "polet", "ringmajandus", "ringlussevott", "looduskaitse", "elurikkus", "elupaik",
  "kaitseala", "natura", "liik", "seire", "keskkond", "keskkonnaportaal", "keskkonnaluba",
  "tuulepark",
  "keskkonnamoju", "kotkas", "kmh", "ksh", "kataster", "kinnistu", "metsaregister",
  "elektriauto", "energia", "transport", "kütus", "kytus", "maavara", "kaevandus", "muld",
  "mura", "kiirgus", "climate", "forest", "water", "weather", "pollution", "waste",
  "biodiversity", "nature", "air", "andmed",
]);
const ADMIN_CONTEXT_ROOTS = new Set([
  "tallinn", "tartu", "parnu", "parnumaa", "narva", "viljandi", "rakvere", "voru",
  "kuressaare", "haapsalu", "johvi", "harjumaa", "ida", "virumaa",
]);
const AMBIGUOUS_ROOTS = new Set([
  "vesi", "jarv", "ohk", "ohukvaliteet", "saaste", "jaat", "looduskaitse", "elurikkus",
  "kliima", "ilm", "keskkond", "energia", "elektriauto", "seire", "andmed",
]);
const INJECTION_PATTERN = /(?:ignore\s+(?:(?:all|previous)\s+)*(?:instructions?|prompts?)|(?:ignoreeri|eira)\s+(?:(?:kõiki|koiki|eelnev\w*|varasem\w*|süsteemi\w*)\s+)*(?:(?:süsteemi)?juhis\w*|korraldus\w*|reegel\w*|prompt\w*)|system\s+prompt|developer\s+message|api[- ]?key|reveal\s+(?:the\s+)?secret|unusta\s+(?:eelnev\w*|juhis\w*)|(?:avalda|näita|naita|kuva|paljasta)\s+(?:(?:api[- ]?)?(?:saladus\w*|võti\w*|voti\w*|parool\w*|token\w*))|<\s*script\b)/iu;
const CADASTRE_PATTERN = /\b\d{5}:\d{3}:\d{4}\b/u;

export function containsUnsafeInstruction(value) {
  return INJECTION_PATTERN.test(String(value || "").normalize("NFKC"));
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

export function assessSearchQuery(query) {
  const cleanQuery = String(query ?? "").replace(/\s+/gu, " ").trim().slice(0, 180);
  const normalized = normalize(cleanQuery);
  const roots = queryTerms(cleanQuery);
  const domainRoots = roots.filter(rootIsDomain);
  if (!cleanQuery) return { kind: "needs-clarification", topic: null, reason: "empty", clarification: clarificationFor(null) };
  if (containsUnsafeInstruction(cleanQuery)) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "unsafe-instruction",
      clarification: "Saan aidata Eesti keskkonnaandmete küsimustega, kuid mitte süsteemijuhiste ega saladuste päringutega.",
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
  if (!domainRoots.length) {
    return {
      kind: "out-of-scope",
      topic: null,
      reason: "outside-environment-domain",
      clarification: "Küsi Eesti keskkonna, looduse, ilma, vee, õhu, jäätmete, metsa või keskkonnaregistrite kohta.",
    };
  }
  const topic = domainRoots[0];
  if (["jarv", "vesi"].includes(topic) && /\bjarvede\b/u.test(normalized)) {
    return {
      kind: "needs-clarification",
      topic: "jarv",
      reason: "multiple-waterbodies",
      clarification: "Palun nimeta konkreetne järv või veekogumi kood ning ütle, kas soovid ökoloogilist, keemilist või suplusvee seisundit.",
    };
  }
  if (!CADASTRE_PATTERN.test(cleanQuery)
    && /(?:katastritunnus|katastri\s*(?:number|andmed)|kinnistu\s*(?:andmed|piirang|mets)|minu\s+kinnistu)/iu.test(normalized)) {
    return {
      kind: "needs-clarification",
      topic: "kataster",
      reason: "missing-cadastre-number",
      clarification: "Lisa katastritunnus kujul 12345:678:9012. Aadressi järgi üksuse leidmiseks kasuta ametlikku kaardi- või aadressiotsingut.",
    };
  }
  const weatherLocationPattern = /\b(?:tallinn|tartu|parnu|narva|viljandi|rakvere|voru|kuressaare|haapsalu|johvi)\w*/u;
  const explicitlyCurrentWeather = /\b(?:tana|homn\w*|homm\w*|homs\w*|ulehomme|praegu|hetkel|prognoos\w*|\w*hoiatus\w*)\b/u.test(normalized);
  const historicalWeatherContext = /\b(?:(?:19|20)\d{2}|ajalool\w*|kliima\w*|keskm\w*|möödunud|moodunud)\b/u.test(normalized);
  const locationDefaultsToCurrentWeather = domainRoots.includes("ilm")
    && weatherLocationPattern.test(normalized)
    && !historicalWeatherContext;
  if ((domainRoots.includes("ilm") || domainRoots.includes("prognoos") || domainRoots.includes("hoiatus"))
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
  const explicitlyCurrentAir = /\b(?:praeg\w*|hetkel|hetke|reaalajas|tana|värske|varske)\b/u.test(normalized);
  if (roots.some((root) => ["ohk", "ohukvaliteet", "saaste"].includes(root)) && explicitlyCurrentAir) {
    return {
      kind: "live-air",
      topic: "ohukvaliteet",
      reason: "time-sensitive-air-quality",
      clarification: /\b(?:tallinn|tartu|parnu|narva|kohtla|viljandi|saaremaa)\w*/u.test(normalized)
        ? null
        : "Lisa asukoht või lähim seirejaam ja soovitud saasteaine.",
    };
  }
  if (roots.length <= 1 && AMBIGUOUS_ROOTS.has(topic)) {
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
    document.title,
    [...(document.tags || []), ...(document.topics || [])].join(" "),
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
    content: "Statistiline metsainventuur ehk SMI on üleriigiliste proovitükkidega valikuuring. SMI põhjal koostatakse statistiliste meetoditega kogu Eesti metsade üldistatud hinnang ning näitajaga kaasneb statistiline viga. SMI sobib riigi metsade seisundi ja muutuste hindamiseks, mitte üksiku kinnistu inventeerimisandmete esitamiseks.",
    locator: "SMI kui üleriigiline proovitükkidega valikuuring ning kogu Eesti üldistatud statistiline hinnang koos veahinnanguga.",
  },
  {
    id: "forest-area",
    title: "SMI 2024: Eesti metsamaa pindala",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Statistika",
    published: "2024",
    url: "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI2024/SMI_2024.pdf",
    tags: ["mets", "metsamaa", "SMI", "pindala", "metsasus", "statistika"],
    summary: "SMI 2024 andmetel oli Eesti metsamaa pindala 2 350,6 tuhat hektarit ehk 51,8% Eesti pindalast; suhteline viga oli ±1,2%.",
    content: "SMI 2024 andmetel oli Eesti metsamaa pindala 2 350,6 tuhat hektarit ehk 51,8% Eesti pindalast ning suhteline viga oli ±1,2%. Metsaga kaetud pindala oli 2 135,8 tuhat hektarit ehk 47,11% Eesti pindalast. Metsamaa ja metsaga kaetud pindala on eri näitajad.",
    locator: "SMI 2024, lk 3 ja 7: Eesti üldpindala jaotus, metsamaa ning metsaga kaetud pindala.",
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
    content: "Keskkonnaagentuuri SMI 2025 tulemuste järgi oli Eesti metsamaa pindala 2,36 miljonit hektarit ehk 52,1% Eesti pindalast. Kasvava metsa tagavara püsis stabiilsena 466 miljoni m³ juures. Metsamaa pindala, puistute vanuseline struktuur ja kasvava metsa tagavara kirjeldavad eri tahke.",
    locator: "SMI 2025 põhinäitajad: metsamaa pindala ja osakaal ning kasvava metsa stabiilne tagavara.",
  },
  {
    id: "forest-condition-review",
    title: "Keskkonnaülevaade – mets",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Keskkonnaülevaade",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/keskkonnaulevaade/keskkonnaulevaade-mets",
    tags: ["mets", "metsade seisund", "kahjustused", "elurikkus", "kliimarisk", "trend"],
    summary: "Metsa seisundi tervikpildi jaoks käsitleb Keskkonnaülevaade eraldi metsa pindala, tagavara, vanuselist struktuuri, kahjustusi, elurikkust ja kaitset.",
    content: "Metsa püsimist ja seisundit ei kirjelda üks näitaja. Keskkonnaülevaade käsitleb eraldi metsa pindala, tagavara ja vanuselist struktuuri ning metsade kahjustusi, elurikkust, kaitset ja kliimaga seotud riske.",
    locator: "Metsade seisundit, kahjustusi, elurikkust, kaitset ja kliimaga seotud riske käsitlevad näitajad.",
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
    content: "Metsainfo hetkeseis koondab eraldi vaated metsateatistele, RMK hallatavate metsade takseerandmetele ja Metsaregistri ülepinnalise takseerimisega kogutud inventeerimisandmetele. Vaadetel on erinev katvus, ajaseis ja tähendus, mistõttu neid ei tohi käsitada ühe ja sama näitajana.",
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
    content: "Metsaandmed on mitmel viisil kogutavate andmete katusmõiste. Statistilise metsainventuuriga ehk SMI-ga koostatakse statistiline kokkuvõte Eesti metsade seisundist, kasutamisest ja muutustest ajas. Metsaregister sisaldab kinnistute metsainventeerimise andmeid ning lisaks metsateatiste, metsakaitseekspertiiside ja metsauuendusekspertiiside andmeid.",
    locator: "Metsandusandmete kogumise viisid; SMI tulemused ning Metsaregistri inventeerimis- ja metsateatise andmed.",
  },
];

export function forestryIntentServiceDocumentIds(query) {
  const intent = forestEvidenceIntent(query);
  if (intent?.kind === "forest-area") return ["forest-area", "smi"];
  if (intent?.kind === "forest-depletion") {
    return ["forest-stock-stable", "forest-area", "forest-condition-review", "smi"];
  }
  if (intent?.kind === "forest-data-sources") {
    return ["smi-metsaregister", "smi", "metsainfo-hetkeseis", "metsaregister"];
  }
  return [];
}

export function officialServiceCatalogueDocuments() {
  // The two SMI entries in SEARCH_DOCUMENTS are legacy deterministic-answer
  // fixtures. Current primary forestry evidence instead comes from the
  // maintained, cited service-directory extracts above or live retrieval.
  const legacyForestryFacts = new Set(["forest-overview", "forest-inventory-publication"]);
  const directory = SEARCH_DOCUMENTS.map(({ answer: _answer, tags, ...document }) => ({
    ...document,
    tags: [...(tags || [])],
    topics: [...(tags || [])],
    sourceTier: "official",
    retrieval: "official-service-directory",
    _answerEvidenceEligible: !legacyForestryFacts.has(document.id),
  }));
  const forestryDirectory = OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS.map((document) => ({
    ...document,
    topics: [...document.tags],
    sourceTier: "official",
    retrieval: "official-service-directory",
    _answerEvidenceEligible: true,
  }));
  return [...directory, ...forestryDirectory, ...cadastreSourceDocuments()];
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
  const cleanQuery = String(query ?? "").trim().slice(0, 180);
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
  return ids.flatMap((id, index) => {
    const source = SEARCH_DOCUMENTS.find((candidate) => candidate.id === id);
    return source ? [{ ...source, citation: index + 1 }] : [];
  });
}

export function composeScopeResponse(query, assessment) {
  const cleanQuery = String(query ?? "").replace(/\s+/gu, " ").trim().slice(0, 180);
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
  const cleanQuery = String(query ?? "").trim().slice(0, 180);
  if (!cleanQuery) {
    return {
      query: "",
      total: 0,
      answer: null,
      sources: [],
      related: ["metsade seisund", "Eesti kliima", "keskkonna avaandmed"],
    };
  }

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
