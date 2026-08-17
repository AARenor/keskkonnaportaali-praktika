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
    tags: ["kaart", "andmed", "EELIS", "kaitseala", "elupaik", "keskkonnaregister"],
    summary:
      "Kaardirakendus võimaldab otsida ja vaadata ruumilisi keskkonnaandmeid, sealhulgas kaitstavaid alasid ja objekte.",
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
    tags: ["luba", "keskkonnaluba", "taotlemine", "ettevõte", "KMH", "menetlus", "aruandlus", "KOTKAS"],
    summary:
      "KOTKASes esitatakse keskkonnaloa taotlusi ning avaldatakse keskkonnalubade, keskkonnamõju hindamiste ja muude menetluste infot.",
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
      "KESE koondab riikliku keskkonnaseire ja seirega seotud uuringute andmeid. Avalikud levitused on kirjeldatud Keskkonnaportaalis ning masinloetavad tulemused on saadaval JSON-teenustena.",
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
    tags: ["GeoServer", "WMS", "WFS", "GeoJSON", "EELIS", "Metsaregister", "kaart", "ruumiandmed"],
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
      "Keskkonnaameti juhis selgitab, et olmejäätmeid ei tohi lõkkes põletada ning jäätmed tuleb koguda liigiti ja anda üle selleks ette nähtud käitluskohta.",
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
    url: "https://kliimaministeerium.ee/elurikkus-keskkonnakaitse/keskkonnakorraldus/keskkonnamoju-hindamine",
    tags: ["KMH", "KSH", "keskkonnamõju", "hindamine", "menetlus", "arendustegevus", "planeering"],
    summary:
      "Kliimaministeeriumi juhend kirjeldab keskkonnamõju hindamise ja strateegilise hindamise rolli otsustusprotsessis ning seost loa või planeeringu menetlusega.",
    answer:
      "Selleks et leida konkreetse projekti KMH või KSH, täpsusta projekti, asukohta või menetluse nime ning kontrolli menetluse ametlikku seisu KOTKASest või planeeringu avalikustajalt.",
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
      "Tallinna ametlikud strateegilised ja siseriiklikud mürakaardid näitavad liiklus-, tööstus- ja summaarset müra. 2022. aastal avaldatud kaart kirjeldab 2019. aasta pikaajalist müraolukorda.",
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
    tags: ["jäätmed", "jäätmekäitluskoht", "jäätmekäitluskohad", "kaart", "KOTKAS", "Pärnumaa", "maakond"],
    summary:
      "Keskkonnaportaali kaardirakenduses saab kuvada kehtivaid ja arhiveeritud jäätmekäitluskohti ning liikuda objekti infopäringust KOTKASe menetlusandmetesse.",
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
      "Keskkonnaamet korraldab riiklikku kiirgusseiret ja varajase hoiatamise süsteemi. Üle Eesti mõõdab 15 automaatjaama reaalajas summaarset õhu gammakiirguse doosikiirust.",
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
      "Euroopa Keskkonnaagentuuri elutsükli ülevaate järgi tekitab tüüpiline elektriauto Euroopas elutsükli jooksul vähem kasvuhoonegaase, õhusaastet ja müra kui võrreldav bensiini- või diiselauto, kuigi tootmisfaasi mõju on tavaliselt suurem.",
    answer:
      "Elektriauto mõju ei piirdu summutitoruga: arvesse tuleb võtta aku ja auto tootmist, elektri tootmisviisi, sõiduki suurust, läbisõitu ning taaskasutust. Euroopa tüüpilises elutsüklis korvab väiksem kasutusfaasi mõju üldjuhul suurema tootmismõju.",
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
    .replace(/[^a-z0-9äöõüšž]+/gi, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "andmed",
  "andmete",
  "eesti",
  "eestis",
  "kohta",
  "seisund",
  "seisundi",
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
  "kohta",
  "praegu",
  "tahan",
  "soovin",
  "vana",
  "vanu",
  "mida",
  "tahendab",
  "kui",
  "palju",
  "oli",
  "on",
  "aasta",
  "aastal",
  "voib",
  "tohib",
  "lubatud",
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

function topicRoot(word) {
  if (word.startsWith("mets")) return "mets";
  if (word.startsWith("kliim")) return "kliima";
  if (word.startsWith("jaatmekaitluskoh")) return "jaatmekaitluskoht";
  if (word.startsWith("jaat")) return "jaat";
  if (word.startsWith("prugi")) return "prugi";
  if (word.startsWith("rehv")) return "rehv";
  if (word.startsWith("polet")) return "polet";
  if (word.startsWith("ohukval")) return "ohukvaliteet";
  if (word === "ohk" || word.startsWith("valisoh")) return "ohk";
  if (word.startsWith("saast")) return "saaste";
  if (word.startsWith("heit")) return "heide";
  if (word.startsWith("looduskait")) return "looduskaitse";
  if (word.startsWith("elurikk")) return "elurikkus";
  if (word.startsWith("elupaik")) return "elupaik";
  if (word.startsWith("kaitseal")) return "kaitseala";
  if (word.startsWith("pohjave")) return "pohjavesi";
  if (word.startsWith("hudro")) return "vesi";
  if (word.startsWith("jarv")) return "jarv";
  if (word.startsWith("jog")) return "jogi";
  if (word === "vee" || word.startsWith("veek")) return "vesi";
  if (word.startsWith("mer")) return "meri";
  if (word.startsWith("temperatuur")) return "temperatuur";
  if (word.startsWith("sadem")) return "sademed";
  if (word.startsWith("prognoos")) return "prognoos";
  if (word.startsWith("ilmaprognoos")) return "prognoos";
  if (word.startsWith("hoiatus")) return "hoiatus";
  if (word.startsWith("ilmahoiatus")) return "hoiatus";
  if (word.startsWith("katastr")) return "kataster";
  if (word.startsWith("kinnist")) return "kinnistu";
  if (word.startsWith("keskkonnalub") || word.startsWith("keskkonnalo")) return "keskkonnaluba";
  if (word.startsWith("keskkonnamoj")) return "keskkonnamoju";
  if (word.startsWith("seir")) return "seire";
  if (word.startsWith("keskkonnaseir")) return "seire";
  if (word.startsWith("elektriaut")) return "elektriauto";
  if (word.startsWith("energi")) return "energia";
  if (word.startsWith("transpor")) return "transport";
  if (word.startsWith("maavar")) return "maavara";
  if (word.startsWith("kaevand")) return "kaevandus";
  if (word.startsWith("mull")) return "muld";
  if (word.startsWith("mura")) return "mura";
  if (word.startsWith("kiirg")) return "kiirgus";
  if (word.startsWith("piirang")) return "piirang";
  if (word.startsWith("tallinn")) return "tallinn";
  if (word.startsWith("tartu")) return "tartu";
  if (word.endsWith("maal") && word.length >= 7) return word.slice(0, -1);
  return word;
}

export function queryTerms(query) {
  return [...new Set(normalize(query)
    .split(/\s+/u)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/u.test(word))
    .map(topicRoot))];
}

const DOMAIN_ROOTS = new Set([
  "mets", "kliima", "ilm", "prognoos", "hoiatus", "temperatuur", "sademed", "tuul",
  "vesi", "jarv", "jogi", "meri", "pohjavesi", "ohk", "ohukvaliteet", "saaste", "heide",
  "jaat", "jaatmekaitluskoht", "prugi", "rehv", "polet", "ringmajandus", "looduskaitse", "elurikkus", "elupaik",
  "kaitseala", "natura", "liik", "seire", "keskkond", "keskkonnaportaal", "keskkonnaluba",
  "keskkonnamoju", "kotkas", "kmh", "ksh", "kataster", "kinnistu", "metsaregister",
  "elektriauto", "energia", "transport", "kütus", "kytus", "maavara", "kaevandus", "muld",
  "mura", "kiirgus", "climate", "forest", "water", "weather", "pollution", "waste",
  "biodiversity", "nature", "air", "andmed",
]);
const AMBIGUOUS_ROOTS = new Set([
  "vesi", "jarv", "ohk", "ohukvaliteet", "saaste", "jaat", "looduskaitse", "elurikkus",
  "kliima", "ilm", "keskkond", "energia", "elektriauto", "seire", "andmed",
]);
const INJECTION_PATTERN = /(?:ignore\s+(?:all|previous)|system\s+prompt|developer\s+message|api[- ]?key|reveal\s+(?:the\s+)?secret|unusta\s+(?:eelnev|juhised)|avalda\s+(?:saladus|võti|voti)|<\s*script\b)/iu;
const CADASTRE_PATTERN = /\b\d{5}:\d{3}:\d{4}\b/u;

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
  if (INJECTION_PATTERN.test(cleanQuery)) {
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
      clarification: "Lisa katastritunnus kujul 12345:678:9012. Aadressi järgi kinnistu leidmiseks kasuta allpool Terrapointi otsingut.",
    };
  }
  if ((domainRoots.includes("ilm") || domainRoots.includes("prognoos") || domainRoots.includes("hoiatus"))
    && /\b(?:tana|homme|ulehomme|praegu|prognoos|hoiatus)\b/u.test(normalized)) {
    return {
      kind: "live-weather",
      topic: "ilm",
      reason: "time-sensitive-weather",
      clarification: /\b(?:tallinn|tartu|parnu|narva|viljandi|rakvere|voru|kuressaare|haapsalu|johvi)\w*/u.test(normalized)
        ? null
        : "Lisa asukoht, et avada õige piirkonna prognoos.",
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
    if (fields.title.includes(word)) score += 7;
    if (fields.tags.includes(word)) score += 5;
    if (fields.summary.includes(word)) score += 2;
    if (fields.excerpt.includes(word)) score += 2;
    if (fields.content.includes(word)) score += 1;
    if (fields.organization.includes(word)) score += 1;
    if (fields.answer.includes(word)) score += 3;
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
    document.summary,
    document.excerpt,
    document.answer,
    document.content,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/(?:\n+|(?<=[.!?])\s+|\s*…\s*)/u))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function assessEvidence(query, documents = []) {
  const terms = queryTerms(query);
  const requiredDomainTerms = terms.filter((term) => rootIsDomain(term)
    && !["andmed", "keskkond", "seire"].includes(term));
  const candidates = (documents || []).slice(0, 5);
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
    const requestedYearPassage = years.length === 0 || evidencePassages(document).some((passage) => {
      const passageText = normalize(passage);
      const passageRoots = new Set(queryTerms(passage));
      const passageMatches = terms.filter((term) => passageRoots.has(term));
      return years.every((year) => passageText.includes(year))
        && passageMatches.length >= requiredMatches
        && passageMatches.length / terms.length >= 0.45;
    });
    return match.matchedTerms.length >= requiredMatches
      && match.coverage >= 0.45
      && requiredDomainTerms.every((term) => match.matchedTerms.includes(term))
      && requestedYearPassage;
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

export function rankDocuments(query, documents = SEARCH_DOCUMENTS) {
  return documents
    .map((document) => ({ ...document, score: scoreDocument(document, query) }))
    .filter((document) => document.score > 0)
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
      note: "Vastuses kasutatakse ainult kuvatud ametlikke allikaid. Õigusliku või asukohapõhise otsuse puhul kontrolli alati algallikat.",
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
