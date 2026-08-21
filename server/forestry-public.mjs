// Public forestry routing and reviewed extracts from maintained official pages.
//
// This module is deliberately separate from the legacy forestry answer corpus.
// The documents below enter the ordinary visible result set and may support an
// answer only when their title, summary or content satisfies the intent's
// evidence groups. Tags alone never make an answer eligible.

export const ADDITIONAL_OFFICIAL_FORESTRY_EVIDENCE_DOCUMENTS = [
  {
    id: "increment-method",
    title: "Kuidas hinnatakse SMI-s metsa juurdekasvu?",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Metoodikaaruanne",
    published: "05.01.2026",
    url: "https://keskkonnaportaal.ee/sites/default/files/2026-01/SMI%20arendamine%202025%20L%C3%95PPARUANNE_T%C3%9C%20MSI.pdf#page=22",
    tags: ["mets", "SMI", "juurdekasv", "netojuurdekasv", "proovitükid", "mudel", "metoodika"],
    summary: "SMI 2025 metoodikaaruanne selgitab juurdekasvu mõisteid ja kahte hindamisviisi: mudelipõhist meetodit ning mitmest imputeerimist. Mõlemad alustavad mudelpuude andmetest, liiguvad alalistele proovitükkidele ja sealt ajutistele proovitükkidele.",
    content: "Kogujuurdekasv on kõigi kasvavate puude tagavara muutus aasta jooksul ehk puistu poolt aastas kasvatatav puidukogus ning seda väljendatakse tavaliselt tihumeetrites hektari kohta aastas (tm/ha/a). Netojuurdekasv saadakse, kui kogujuurdekasvust arvatakse maha aasta jooksul surnud ehk looduslikult väljalangenud puude maht. SMI andmetel juurdekasvu hindamiseks pakub 2025. aasta metoodikaaruanne välja kaks viisi: mudelipõhise meetodi ja mitmese imputeerimise. Mõlemad lähtuvad mudelpuude andmetest, liiguvad alalistele proovitükkidele ja sealt juhumetsa meetodiga ajutistele proovitükkidele; tulemuseks on kogujuurdekasvu hinnang hektari kohta aastas. Mudelipõhine meetod kasutab uut puu kõrguse mudelit ja kõrguse muudu mudelit. Mitmene imputeerimine arvutab samale proovitükile prognooside seeria, mis võimaldab hinnata ka arvutuse viga. Need olid aruandes välja pakutud meetodid, mitte väide, et iga Eesti puud mõõdetakse igal aastal eraldi.",
    locator: "Lk 22, peatükk 3 „Puistu juurdekasvu ja suremuse mudelite loomine”.",
    _publishedAt: "2026-01-05",
    _forestryIntentKinds: ["increment-method", "smi-method-comparison", "forest-stock-uncertainty"],
  },
  {
    id: "clearcut-over-time",
    title: "SMI 2025: lageraie pindala 2014–2024",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Metsastatistika andmetabel",
    published: "18.08.2026",
    url: "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI%20tulemused%202025/SMI%202025%20tulemused.xlsx",
    tags: ["mets", "SMI", "lageraie", "raiete pindala", "aegrida", "2014–2024"],
    summary: "SMI 2025 andmetabelis kõikus lageraie pindala aastatel 2014–2024 vahemikus 27,1–35,6 tuhat hektarit: 2014. aastal 29,7 ja 2024. aastal 34,0 tuhat hektarit. Aegrida ei näita ühtlast kasvu.",
    content: "SMI 2025 tulemuste töövihiku järgi oli lageraie pindala aastati järgmine: 2014 – 29,7, 2015 – 31,6, 2016 – 32,4, 2017 – 35,6, 2018 – 34,6, 2019 – 29,7, 2020 – 29,7, 2021 – 27,1, 2022 – 32,6, 2023 – 32,0 ja 2024 – 34,0 tuhat hektarit. Viimase kümne avaldatud aastahinnangu ehk 2015–2024 lageraie pindala väärtused olid 2015 – 31,6, 2016 – 32,4, 2017 – 35,6, 2018 – 34,6, 2019 – 29,7, 2020 – 29,7, 2021 – 27,1, 2022 – 32,6, 2023 – 32,0 ja 2024 – 34,0 tuhat hektarit. Selle kümneaastase rea aritmeetiline summa on 319,3 tuhat hektarit, kuid see ei kirjelda tingimata kordumatut maa-ala, sest sama ala võib eri aastatel uuesti arvestusse sattuda. Perioodi 2014–2024 väikseim hinnang oli 27,1 tuhat hektarit 2021. aastal ja suurim 35,6 tuhat hektarit 2017. aastal. 2014. ja 2024. aasta otspunktide vahe oli ligikaudu 4,3 tuhat hektarit, kuid vahepealsed tõusud ja langused tähendavad, et seda ei saa kirjeldada ühtlase kasvutrendina. Tegu on SMI aastahinnangutega ning nende liitmine ei näita tingimata kordumatut maa-ala, sest sama ala võib eri aastatel uuesti arvestusse sattuda.",
    locator: "Tööleht 33 „Raiete pindala raieliigiti aastail 1999–2024”, rida „Lageraie”, veerud 2014–2024.",
    _publishedAt: "2026-08-18",
    _forestryIntentKinds: ["clearcut-over-time", "clearcut-last-ten-years"],
  },
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
  {
    id: "forest-smi-2025-presentation",
    title: "Statistilise metsainventuuri 2025. aasta tulemused",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Metsastatistika esitlus",
    published: "18.08.2026",
    url: "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI%20tulemused%202025/SMI%202025%20ettekanne.pdf",
    tags: ["mets", "SMI", "proovitükid", "metoodika", "tagavara", "juurdekasv", "raiemaht", "puuliigid", "vanusjaotus"],
    summary: "SMI 2025 aastahinnang põhineb ligikaudu 28 000 proovitükil ja viie mõõtmisaasta andmetel; üks proovitükk esindab keskmiselt 156,2 hektarit.",
    content: "SMI 2025 aastahinnang koondab ligikaudu 28 000 proovitükki ja viie aasta mõõtmised ning üks proovitükk esindab keskmiselt 156,2 hektarit. Valikuuringu tulemused üldistatakse kogu Eestile ning hinnangutega kaasneb valimist tulenev statistiline viga. 2025. aastal muudeti puude kõrguse, tagavara, alla 8 cm puude mahu, juurdekasvu, suremuse ja netojuurdekasvu arvutusmetoodikat; esitlus hoiatab, et seetõttu muutuvad kõik mahuhinnangud ja eri metoodikaga avaldatud arve ei tohi käsitleda täiesti võrreldavana. Uue metoodikaga oli metsamaa pindala 2 360,2 tuhat hektarit ehk 52,1% Eesti pindalast ning kasvava metsa tagavara 466 miljonit m³. Metsamaast oli 20,2% mittemajandatav, 10,4% majanduspiiranguga ja 69,4% majandusmets. Enamuspuuliigi järgi moodustasid mänd 29%, kuusk 19% ja kask 30% metsamaa pindalast. Nii noorte kui ka vanade metsade pindala suurenes, puistute keskmine vanus oli 55 aastat ning 2025. aasta raiemahu eksperthinnang 11,0 miljonit m³.",
    locator: "SMI 2025 tulemuste esitlus: valimi maht ja üldistamine, metoodikamuutus, pindala, tagavara, majanduskategooriad, puuliigid, vanusjaotus ja raiemaht.",
    _publishedAt: "2026-08-18",
    _forestryIntentKinds: ["smi-method-comparison", "forest-stock-uncertainty", "sample-size-and-precision", "increment-method", "increment-estimate-2024", "stock-versus-harvestable", "protected-forest-share", "forest-management-category-share", "forest-age-trend", "pine-versus-spruce", "harvest-over-time"],
  },
  {
    id: "forest-smi-methodology-20-years",
    title: "Statistiline mets – 20 aastat statistilist metsainventeerimist Eestis",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Metoodikaväljaanne",
    published: "2021",
    url: "https://keskkonnaportaal.ee/sites/default/files/2021-12/Statistiline%20mets%20-%2020%20aastat%20statistilist%20metsainventeerimist%20Eestis.pdf",
    tags: ["mets", "SMI", "valikuuring", "proovitükk", "juhuslik viga", "usaldusvahemik", "püsiproovitükk"],
    summary: "Metoodikaväljaanne selgitab, kuidas proovitükkide valimilt üldistatakse hinnangud kogu metsavaru kohta ning kuidas esitatakse juhuslik viga ja usaldusvahemik.",
    content: "Statistiline metsainventuur kasutab süstemaatiliselt üle Eesti paiknevaid proovitükke, et teha valimi põhjal üldistusi kogu üldkogumi kohta. Hinnang on kavandatud nihketa, kuid valikuuringuga kaasneb alati juhuslik viga, mida kirjeldatakse standardvea või usaldusvahemikuga. Püsiproovitükke mõõdetakse uuesti viie aasta järel, mis võimaldab hinnata muutusi ja juurdekasvu. Valimi täpsus ei sõltu ainult proovitükkide arvust, vaid ka valikukavast, tunnuse varieeruvusest, mõõtmiskvaliteedist ja sellest, millise piirkonna või alarühma kohta hinnangut soovitakse. Üleriigiline SMI ei asenda üksiku kinnistu lausmetsakorralduslikku inventuuri.",
    locator: "Lk 11–12 ja metoodikapeatükid: valim ja üldkogum, nihketa hinnang, juhuslik viga, usaldusvahemik ning püsiproovitükkide kordusmõõtmine.",
    _publishedAt: "2021-12-01",
    _forestryIntentKinds: ["smi-method-comparison", "forest-stock-uncertainty", "sample-size-and-precision", "increment-method", "why-forest-numbers-differ"],
  },
  {
    id: "forest-rmk-data-methods",
    title: "Kuidas kogutakse metsaandmeid?",
    organization: "Riigimetsa Majandamise Keskus",
    type: "Ametlik selgitus",
    published: "18.07.2023",
    url: "https://rmk.ee/uudised/metsamees/kuidas-kogutakse-metsaandmeid/",
    tags: ["mets", "metsaandmed", "RMK", "SMI", "Metsaregister", "takseerimine", "kaugseire"],
    summary: "RMK selgitus eristab kaugseiret, metsa majandamiseks tehtavat lauselist takseerimist ja kogu Eesti kohta üldistatavat SMI valikuuringut.",
    content: "Metsaandmeid kogutakse eri eesmärkidel kaugseire, lausmetsakorraldusliku takseerimise ja statistilise metsainventuuri abil. Lauseline takseerimine kirjeldab metsaeraldisi majandamiskava jaoks: silmamõõdulist hinnangut täpsustatakse mõõtmistega. SMI mõõdab proovitükkide valimit ning annab kogu Eesti kohta statistilise hinnangu koos tõenäosusliku veaga, mitte üksiku eraldise majandamisandmeid. Metsaregistri inventeerimisandmed katavad ligikaudu kolmveerandi metsamaast ja võivad olla kuni kümme aastat vanad. Sama aasta arv võib eri aruannetes muutuda ka siis, kui varasemad aastad arvutatakse uue metoodikaga ümber; seetõttu tuleb võrdluses kontrollida allikat, andmeaastat, definitsiooni ja arvutusviisi.",
    locator: "Kaugseire, lauseline takseerimine ja SMI; Metsaregistri katvus ja andmete vanus; metoodikamuutuse mõju avaldatud arvudele.",
    _publishedAt: "2023-07-18",
    _forestryIntentKinds: ["rmk-versus-smi", "why-forest-numbers-differ", "smi-method-comparison", "forest-data-sources"],
  },
  {
    id: "forest-yearbook-2023-fellings",
    title: "Aastaraamat Mets 2023",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Statistika aastaraamat",
    published: "2025",
    url: "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/Mets%202023.pdf",
    tags: ["mets", "SMI", "raiemaht", "lageraie", "aegrida", "2013–2022", "2002", "2022"],
    summary: "Aastaraamatu tabeli 3.2.2.1 SMI aastahinnangute järgi oli lageraie pindala 2013.–2022. aastal kokku 311,7 tuhat hektarit; see on kümne avaldatud aastahinnangu aritmeetiline summa.",
    content: "Aastaraamatu Mets 2023 tabelis 3.2.2.1 on SMI lageraie pindala aastahinnangud 2013.–2022. aasta kohta: 2013 – 28,7, 2014 – 29,7, 2015 – 31,6, 2016 – 32,4, 2017 – 35,6, 2018 – 34,6, 2019 – 29,7, 2020 – 29,7, 2021 – 27,1 ja 2022 – 32,6 tuhat hektarit. Nende kümne avaldatud aastahinnangu aritmeetiline summa on 311,7 tuhat hektarit; üksikute aastate hinnangud jäid 27,1 ja 35,6 tuhande hektari vahele. Summa ei ole eraldi aastaraamatu näitaja ega kirjelda tingimata igal aastal uut teineteisega kattumatut maa-ala. Sama aastaraamatu SMI raiemahu tabelis on 2002. aasta hinnang 10,157 ja 2022. aasta hinnang 12,077 miljonit m³ ehk 2022. aasta väärtus oli umbes 1,92 miljonit m³ ehk 18,9% suurem; kahe otspunkti võrdlus ei tähenda ühtlast kasvutrendi nende vahel. Aastaraamat märgib, et eri andmeallikate ja meetoditega koostatud raiestatistika read ei ole alati üks-ühele võrreldavad.",
    locator: "Tabel 3.2.2.1, lk 131: lageraie pindala 2013–2022; raiemahu tabel, lk 133: SMI 2002 ja 2022; metoodikamärkused lk 128.",
    _publishedAt: "2025-06-01",
    _forestryIntentKinds: ["clearcut-over-time", "clearcut-2013-2022", "harvest-over-time"],
  },
  {
    id: "forest-climate-adaptation-report",
    title: "Kliimamuutused ohustavad tuleviku Eesti metsa kasvamist ja tervist",
    organization: "Keskkonnaagentuur",
    type: "Ametliku uuringu kokkuvõte",
    published: "20.02.2020",
    url: "https://keskkonnaagentuur.ee/uudised/raport-kliimamuutused-ohustavad-tuleviku-eesti-metsa-kasvamist-ja-tervist",
    tags: ["mets", "kliimamuutus", "põud", "metsakahjustused", "elurikkus", "kohanemine", "seire"],
    summary: "Keskkonnaagentuuri tellitud kohanemisuuring käsitleb kliimamuutuse mõju Eesti metsade kasvule ja tervisele ning soovitab vastupanuvõime parandamiseks mitmekesisust, seiret ja kohanemismeetmeid.",
    content: "Soojenemine võib kasvuperioodi pikendada, kuid sagedamad põuad, tormid, liigniiskus, haigused ja kahjurid võivad metsa kasvu pidurdada ning puude tervist halvendada. Mõju sõltub puuliigist, kasvukohast, metsa vanusest ja häiringute koosmõjust, mistõttu ei saa kogu Eesti metsa kohta anda ühesuunalist prognoosi. Uuring rõhutab puuliigilise ja geneetilise mitmekesisuse, sobiva uuendamise, kahjustuste seire ning riskidega arvestava metsamajanduse rolli metsade vastupanu- ja kohanemisvõime parandamisel.",
    locator: "Keskkonnaagentuuri tellitud kliimamuutustega kohanemise uuringu kokkuvõte: kasv, tervis, kahjustusriskid, mitmekesisus ja seire.",
    _publishedAt: "2020-02-20",
    _forestryIntentKinds: ["climate-impact", "clearcut-value-judgement"],
  },
  {
    id: "forest-register-workflow",
    title: "Kuidas töötab metsaregister?",
    organization: "Keskkonnaamet",
    type: "Ametlik käsiraamat",
    published: "15.01.2025",
    url: "https://www.keskkonnaamet.ee/kasiraamat-kohaliku-omavalitsuse-keskkonnaspetsialistile/kuidas-tootab-metsaregister",
    tags: ["mets", "Metsaregister", "Metsaportaal", "metsateatis", "kaitseala", "menetlus", "kinnistu"],
    summary: "Keskkonnaameti käsiraamat selgitab Metsaregistri avalikku ja ametkondlikku vaadet ning metsateatise kontrolli, sealhulgas kaitstava ala piirangute käsitsi hindamist.",
    content: "Metsaregistri avalikus vaates saab otsida maaüksust, vaadata metsaeraldiste inventeerimisandmeid ja metsateatisi; ametkondlik vaade sisaldab menetlemiseks rohkem infot. Metsateatis kirjeldab kavandatavat raiet või olulist metsakahjustust ning Keskkonnaamet kontrollib kavandatud tegevuse vastavust nõuetele. Kaitstava ala või muu piirangu korral vaadatakse teatis käsitsi üle ning menetlus võib lõppeda lubamise, tingimuste seadmise või keelamisega. Raiet lubav metsateatis kehtib üldjuhul 24 kuud, kuid teatise registreerimine ei tõenda, et raie on looduses tehtud. Konkreetse kinnistu kohta tuleb kontrollida nii kehtivaid inventeerimisandmeid, teatisi kui ka ruumilisi kaitsepiiranguid.",
    locator: "Metsaregistri avalik ja ametkondlik vaade; metsateatise automaat- ja käsitsi kontroll; kaitsepiirangud ning menetluse tulemus.",
    _publishedAt: "2025-01-15",
    _forestryIntentKinds: ["forest-notice", "property-forest-data", "logging-in-protected-areas", "old-forest-protection"],
  },
];

const INTENTS = {
  "smi-method-comparison": {
    serviceDocumentIds: ["smi", "forest-smi-2025-presentation", "forest-smi-methodology-20-years", "forest-rmk-data-methods"],
    discoveryQueries: ["SMI metoodika valikuuring proovitükid", "SMI statistiline viga lausmetsakorraldus"],
    evidenceGroups: [
      ["valikuuring", "proovitükk"],
      ["kogu eesti", "üleriigiline"],
      ["statistiline viga", "suhteline viga"],
      ["üksiku kinnistu", "lausmetsakorraldus", "täielik ülelugemine"],
      ["üle hinnatud", "ulehinn", "ei tõenda"],
    ],
    minimumSupportingDocuments: 2,
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
    serviceDocumentIds: ["forest-area", "forest-smi-2025-presentation", "forest-law", "protected-forest-share"],
    discoveryQueries: ["metsa tagavara raiutav puidukogus", "metsamaa tagavara majanduspiirang"],
    evidenceGroups: [
      ["tagavara"],
      ["kasvava metsa puidumaht", "kasvava metsa tagavara"],
      ["mitte automaatselt", "ei ole aastane raiemaht", "raiutav puidukogus"],
      ["mittemajandatav", "majanduspiirang", "õiguslik piirang"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-stock-uncertainty": {
    serviceDocumentIds: ["smi", "forest-area", "forest-smi-2025-presentation", "forest-smi-methodology-20-years"],
    discoveryQueries: ["SMI metsade tagavara hinnang suhteline viga", "metsa tagavara statistiline hinnang"],
    evidenceGroups: [
      ["tagavara"],
      ["statistiline hinnang", "valimi põhjal"],
      ["statistiline viga", "suhteline viga", "koos veaga"],
      ["vaieldamatu number", "mitte üks kindel"],
    ],
    minimumSupportingDocuments: 2,
  },
  "rmk-versus-smi": {
    serviceDocumentIds: ["forest-rmk-data-methods", "metsainfo-hetkeseis", "smi", "forest-smi-2025-presentation"],
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
    serviceDocumentIds: ["forest-rmk-data-methods", "smi-metsaregister", "metsainfo-hetkeseis", "smi", "forest-smi-methodology-20-years"],
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
    serviceDocumentIds: ["forest-area", "forest-condition-review"],
    discoveryQueries: ["SMI metsaga kaetud pindala puistud", "metsamaa ja puistute pindala"],
    evidenceGroups: [
      ["metsaga kaetud", "puistute pindala"],
      ["47,11%", "2 135,8"],
      ["metsamaa"],
      ["51,8%", "2 350,6"],
      ["eri näitajad", "ei ole sama"],
    ],
    minimumSupportingDocuments: 2,
  },
  "sample-size-and-precision": {
    serviceDocumentIds: ["forest-smi-2025-presentation", "forest-smi-methodology-20-years", "smi", "forest-area"],
    discoveryQueries: ["SMI valimi täpsus suhteline viga", "statistiline metsainventuur valikukava"],
    evidenceGroups: [
      ["valimi suurus", "28 000 proovitük"],
      ["valikukava", "esinduslikkus", "proovitükk", "üldistatakse"],
      ["statistiline viga", "suhteline viga"],
    ],
    minimumSupportingDocuments: 2,
  },
  "increment-method": {
    serviceDocumentIds: ["increment-method", "forest-smi-methodology-20-years", "forest-area", "forest-smi-2025-presentation", "smi", "forest-balance-kaur-methodology"],
    discoveryQueries: ["SMI juurdekasvu arvutamine mudel", "metsa juurdekasv proovitükid"],
    evidenceGroups: [
      ["kogujuurdekasv"],
      ["netojuurdekasv"],
      ["mudelipõhise meetodi", "mitmese imputeerimise"],
      ["mudelpuude andmetest"],
      ["alalistele proovitükkidele", "ajutistele proovitükkidele"],
      ["tihumeetrites hektari kohta", "tm/ha"],
      ["kõrguse muudu mudelit"],
      ["prognooside seeria", "arvutuse viga"],
      ["välja pakutud meetodid"],
    ],
    minimumSupportingDocuments: 1,
  },
  "increment-estimate-2024": {
    serviceDocumentIds: ["forest-area", "increment-method"],
    discoveryQueries: ["SMI 2024 juurdekasv 15,4303 miljonit tihumeetrit", "SMI juurdekasvu arvutamise metoodika"],
    evidenceGroups: [
      ["15,4303 miljonit tihumeetrit"],
      ["aastas"],
      ["6,6 tihumeetrit hektari kohta"],
      ["±1,4%", "1,4%"],
      ["mudeli alusel arvutatud"],
      ["kogujuurdekasv"],
      ["netojuurdekasv"],
      ["mudelipõhise meetodi", "mitmese imputeerimise"],
    ],
    minimumSupportingDocuments: 2,
  },
  "protected-forest-share": {
    serviceDocumentIds: ["protected-forest-share", "forest-condition-review"],
    discoveryQueries: ["kaitsealuse metsamaa osakaal 2024", "rangelt kaitstav metsamaa osakaal"],
    evidenceGroups: [
      ["28,4%"],
      ["16,8%"],
      ["kaitse all"],
      ["rangelt kaitstav"],
      ["õigusliku kaitse", "ruumianalüüsi"],
    ],
    minimumSupportingDocuments: 1,
  },
  "forest-management-category-share": {
    serviceDocumentIds: ["forest-smi-2025-presentation"],
    discoveryQueries: ["SMI 2025 mittemajandatav majanduspiiranguga metsamaa osakaal", "metsamaa majanduskategooriad"],
    evidenceGroups: [
      ["20,2%"],
      ["10,4%"],
      ["69,4%"],
      ["mittemajandatav"],
      ["majanduspiiranguga"],
      ["majandusmets"],
    ],
    minimumSupportingDocuments: 1,
  },
  "climate-impact": {
    serviceDocumentIds: ["forest-condition-review", "forest-climate-adaptation-report"],
    discoveryQueries: ["kliimamuutuse mõju Eesti metsadele", "põud ürask mets kliimamuutus"],
    evidenceGroups: [
      ["kliimamuutus"],
      ["põud", "soojem"],
      ["ürask"],
      ["juurdekasv", "kahjust"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-notice": {
    serviceDocumentIds: ["forest-notice-guidance", "forest-register-workflow", "metsainfo-hetkeseis", "forest-law"],
    discoveryQueries: ["metsateatis Keskkonnaamet", "metsateatis kavandatav raie metsakahjustus"],
    evidenceGroups: [
      ["metsateatis"],
      ["kavandatav raie", "kavandatava raie"],
      ["metsakahjustus"],
      ["ei tõenda", "ei ole kõiki", "looduses juba tehtud"],
    ],
    minimumSupportingDocuments: 2,
  },
  "property-forest-data": {
    serviceDocumentIds: ["forest-register-workflow", "forest-notice-guidance", "metsaregister", "forest-spatial-data"],
    discoveryQueries: ["Metsaportaal kinnistu metsaandmed", "Metsaregister katastritunnus eraldised"],
    evidenceGroups: [
      ["metsaregister", "metsaportaal"],
      ["kinnistu"],
      ["inventeerimisandmed", "eraldis"],
    ],
    minimumSupportingDocuments: 2,
  },
  "harvest-over-time": {
    serviceDocumentIds: ["forest-yearbook-2023-fellings", "forest-smi-2025-presentation", "forest-condition-review", "forest-stock-stable", "forest-balance-kaur-methodology"],
    discoveryQueries: ["raiemaht 20 aastat SMI aegrida", "Eesti raiemaht pikaajaline trend"],
    evidenceGroups: [
      ["raiemaht"],
      ["2002"],
      ["10,157"],
      ["12,077"],
      ["ei tähenda ühtlast", "võrreldavad"],
    ],
    minimumSupportingDocuments: 1,
  },
  "forest-age-trend": {
    serviceDocumentIds: ["forest-smi-2025-presentation", "forest-stock-stable", "forest-smi-2024-summary", "forest-condition-review"],
    discoveryQueries: ["Eesti metsade vanusjaotus noored vanad", "SMI noorte ja vanade metsade pindala"],
    evidenceGroups: [
      ["noorte"],
      ["vanade"],
      ["suuren", "kasv"],
      ["vanuseline", "vanusjaotus"],
    ],
    minimumSupportingDocuments: 2,
  },
  "clearcut-over-time": {
    serviceDocumentIds: ["clearcut-over-time", "forest-yearbook-2023-fellings", "forest-smi-2024-summary", "forest-area"],
    discoveryQueries: ["SMI lageraie pindala aegrida", "lageraie pindala kümme aastat"],
    evidenceGroups: [
      ["lageraie"],
      ["2014.–2024", "2014–2024"],
      ["2014 – 29,7"],
      ["2024 – 34,0"],
      ["ei saa kirjeldada ühtlase kasvutrendina", "ei näita ühtlast kasvu"],
      ["Tegu on SMI aastahinnangutega"],
    ],
    minimumSupportingDocuments: 1,
  },
  "clearcut-last-ten-years": {
    serviceDocumentIds: ["clearcut-over-time"],
    discoveryQueries: ["SMI lageraie pindala viimased kümme aastat 2015–2024"],
    evidenceGroups: [
      ["lageraie"],
      ["viimase kümne avaldatud aastahinnangu"],
      ["2015–2024"],
      ["31,6"],
      ["34,0"],
      ["319,3"],
      ["ei kirjelda tingimata kordumatut maa-ala"],
    ],
    minimumSupportingDocuments: 1,
  },
  "clearcut-2013-2022": {
    serviceDocumentIds: ["forest-yearbook-2023-fellings"],
    discoveryQueries: ["Aastaraamat Mets 2023 lageraie pindala 2013–2022"],
    evidenceGroups: [
      ["lageraie"],
      ["2013.–2022", "2013–2022"],
      ["28,7"],
      ["32,6"],
      ["311,7"],
      ["ei kirjelda tingimata", "kattumatut maa-ala"],
    ],
    minimumSupportingDocuments: 1,
  },
  "pine-versus-spruce": {
    serviceDocumentIds: ["forest-smi-2025-presentation", "forest-area", "forest-stock-stable"],
    discoveryQueries: ["SMI mänd kuusk pindala tagavara", "männikud kuusikud Eestis"],
    evidenceGroups: [
      ["mänd", "männi"],
      ["kuusk", "kuuse"],
      ["695,3", "29%", "29,6%"],
      ["431,8", "19%", "18,4%"],
      ["suurem", "domineer"],
    ],
    minimumSupportingDocuments: 2,
  },
  "logging-in-protected-areas": {
    serviceDocumentIds: ["nature-conservation-law", "forest-register-workflow", "metsainfo-hetkeseis", "forest-law"],
    discoveryQueries: ["raie kaitsealal vöönd kaitse-eeskiri", "metsateatis kaitsealal"],
    evidenceGroups: [
      ["kaitseal"],
      ["vöönd", "sihtkaitsevöönd", "piiranguvöönd"],
      ["erinevad keelud", "sõltub", "kaitse-eeskiri"],
      ["registreeritud", "registreerimine", "läbi viidud raietööde kohta andmed puuduvad", "käsitsi üle"],
    ],
    minimumSupportingDocuments: 3,
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
    serviceDocumentIds: ["forest-condition-review", "forest-climate-adaptation-report"],
    discoveryQueries: ["lageraie keskkonnamõju metsaseadus", "lageraie mõju elurikkus veerežiim"],
    evidenceGroups: [
      ["lageraie", "raie"],
      ["keskkonnamõju", "ökoloogiline"],
      ["mõju sõltub", "sõltub metsa asukohast"],
      ["ei ole mõõdetav üksikfakt", "ei ole alati"],
    ],
    minimumSupportingDocuments: 1,
  },
  "old-forest-protection": {
    serviceDocumentIds: ["nature-conservation-law", "forest-register-workflow", "forest-spatial-data", "metsaregister"],
    discoveryQueries: ["vana mets kaitse all puistu vanus", "EELIS vana mets kaitserežiim"],
    evidenceGroups: [
      ["kõrge vanus", "puistu vanus"],
      ["ei anna", "ei tulene", "üksnes vanuse tõttu"],
      ["kaitstav loodusobjekt", "liigi elupaik", "natura"],
      ["eelise", "metsaregistri", "ruumiandmed"],
    ],
    minimumSupportingDocuments: 2,
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

function editDistanceAtMostOne(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

function tokenHasStem(token, stem, fuzzy = false) {
  if (token.startsWith(stem)) return true;
  if (!fuzzy || stem.length < 6 || token.length < stem.length - 1) return false;
  const shortest = Math.max(1, stem.length - 1);
  const longest = Math.min(token.length, stem.length + 1);
  for (let length = shortest; length <= longest; length += 1) {
    if (editDistanceAtMostOne(token.slice(0, length), stem)) return true;
  }
  return false;
}

function hasStem(tokens, stems, fuzzy = false) {
  return tokens.some((token) => stems.some((stem) => tokenHasStem(token, stem, fuzzy)));
}

function forestDataSourcesIntent() {
  return {
    kind: "forest-data-sources",
    discoveryQueries: ["metsaregister SMI andmed", "statistiline metsainventuur metsaandmed"],
    serviceDocumentIds: ["smi-metsaregister", "smi", "forest-rmk-data-methods", "metsainfo-hetkeseis", "metsaregister"],
    evidenceGroups: [],
    minimumSupportingDocuments: 1,
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
  const tokens = text.split(" ").filter(Boolean);
  const hasSmi = hasStem(tokens, ["smi"]);
  const hasRegistry = hasStem(tokens, ["metsaregis"], true);
  const hasNotice = hasStem(tokens, ["metsateat"], true);
  const hasClearcut = hasStem(tokens, ["lagerai"], true);
  const hasStock = hasStem(tokens, ["tagavara", "metsavaru", "puiduvaru"], true);
  const hasParcelRegister = hasStem(tokens, ["eraldisregis"], true);
  const hasHarvest = hasStem(tokens, ["rai", "varum", "eemaldam", "metsatoo"])
    || /\bpuidu\s+(?:eemaldam|varum)\w*/u.test(text);
  const hasIncrement = hasStem(tokens, ["juurdekasv", "netojuurdekasv"], true)
    || /\bjuurde\s+kasv\w*\b/u.test(text)
    || /\b(?:mets|puist)\w*(?:\s+\w+){0,2}\s+kasv\w*\s+juurde\b/u.test(text)
    || /\bkasvunaitaj\w*|kasvuhinnang\w*\b/u.test(text);
  const hasProtection = /\b(?:kaitse\s+all|kaitstud|(?:loodus)?kaitseal\w*|kaitstava\w*|kaitsereziim\w*|kaitsevoond\w*|sihtkaitsevoond\w*|piiranguvoond\w*|natura)\b/u.test(text);
  const mentionsSample = hasStem(tokens, ["valim", "proovitukk", "vaatlus"], true);
  const hasForest = hasStem(tokens, [
    "mets", "puist", "tagavara", "metsavaru", "puiduvaru", "juurdekasv", "netojuurdekasv",
    "lagerai", "metsateat", "metsaregis", "takseer", "mand", "kuusk",
  ], true) || hasSmi || hasStem(tokens, ["rmk"]);

  if (hasForest && /\b(?:koduvall\w*|valla\s+mets\w*|mets\w*(?:\s+\w+){0,3}\s+vallas|vallas(?:\s+\w+){0,3}\s+mets\w*|metsasus\w*(?:\s+\w+){0,4}\somavalitsus\w*)\b/u.test(text)) {
    return resolved("municipality-forest-area");
  }
  if (hasForest && /\b(?:kinnistu|katastriuksus|katastritunnus|maatuk|maauksus)\w*\b/u.test(text)
    && (hasRegistry || /\b(?:metsaandm\w*|metsaeraldis\w*|puistu\w*|kust\s+lei\w*|andm\w*\s+vaat\w*)\b/u.test(text))) {
    return resolved("property-forest-data");
  }
  if ((hasStem(tokens, ["rmk", "riigimets"], true))
    && /\b(?:smi|keskkonnaagentuur\w*|kaur\w*|kogu\s+eesti|kogu\s+riigi)\b/u.test(text)
    && /\b(?:erinev\w*|statistik\w*|hinnang\w*|takseer\w*|veebikaart\w*)\b/u.test(text)) {
    return resolved("rmk-versus-smi");
  }
  if (hasStem(tokens, ["rmk"]) && hasSmi) return resolved("rmk-versus-smi");
  if ((mentionsSample || /\bvalikuuring\w*|statistiline\s+metsainvent\w*\b/u.test(text))
    && hasParcelRegister) return forestDataSourcesIntent();
  if (hasSmi && (hasRegistry || hasStem(tokens, ["registr"]))) return forestDataSourcesIntent();
  if (hasSmi && /\b(?:metsa|metsandus|metsainventeerimis)andm\w*\b/u.test(text)
    && /\b(?:vahe|erinev\w*|vordl\w*|kumb|sama|klap\w*|katt\w*|vastuolu)\b/u.test(text)) {
    return forestDataSourcesIntent();
  }
  if (mentionsSample
    && /\b(?:suurem|rohkem|mitu|palju|arv|suurus|taps\w*|vea\w*|piis\w*|esindus\w*)\b/u.test(text)) {
    return resolved("sample-size-and-precision");
  }
  if (hasSmi && (mentionsSample
    || hasStem(tokens, ["lausmetsakorrald", "ulehinn", "metoodik", "takseer", "inventuur"], true)
    || /\b(?:moodet\w*|koostat\w*|tootab|tehakse)\b/u.test(text))) {
    return resolved("smi-method-comparison");
  }
  if (hasStock && (/\b(?:uks|kindel|vaieldamatu|tapselt|tapne)\b[\s\S]{0,50}\b(?:numb\w*|arv\w*|hinnang\w*)\b/u.test(text)
    || /\b(?:ebakindl\w*|veapiir\w*|usaldusvahem\w*|tapsus\w*|tapne|hinnangu\s+viga)\b/u.test(text))) {
    return resolved("forest-stock-uncertainty");
  }
  if ((hasForest || /\beri\s+allik\w*/u.test(text))
    && /\b(?:erinev\w*|eri|lahknev\w*|klapi\w*|uhti\w*|muut\w*)\b/u.test(text)
    && /\b(?:allik\w*|numb\w*|arv\w*|metsaarv\w*|tabel\w*|statistik\w*|andm\w*|metsaandm\w*|metsandusandm\w*|aruann\w*)\b/u.test(text)) {
    return resolved("why-forest-numbers-differ");
  }
  if ((hasStock || /\b452(?:[,.]\d+)?\b/u.test(text))
    && /\b(?:raiutav\w*|raiemaht\w*|kattesaadav\w*|kasutatav\w*|ules\s+votta|kasutada\s+saab|puidukogus\w*|maha\s+rai\w*|koik\s+rai\w*)\b/u.test(text)) {
    return resolved("stock-versus-harvestable");
  }
  if (/\b452(?:[,.]\d+)?\b/u.test(text)
    && /\b(?:tapne|vaieldamatu|tegelik)\w*\b/u.test(text)
    && /\b(?:puidumaht|tihumeet|tm)\w*\b/u.test(text)) {
    return resolved("forest-stock-uncertainty");
  }
  if (hasHarvest && !hasIncrement && (/\b(?:20|kakskummend)\s+aasta\w*\b/u.test(text)
    || /\bkahe\s+kumnendi\w*\b/u.test(text)
    || (/\b2002\b/u.test(text) && /\b(?:vordl\w*|vorr\w*|rohkem|vahem|muut\w*|2022|2023|2024|2025)\b/u.test(text)))) {
    return resolved("harvest-over-time");
  }
  if (hasClearcut && /\b2013\s*2022\b/u.test(text)) {
    return resolved("clearcut-2013-2022");
  }
  if (hasClearcut && (/\b(?:viimase\s+)?(?:10|kumme|kumne)\s*(?:a|aasta\w*)\b/u.test(text)
    || /\bkumnend\w*\b/u.test(text))
    && !/\b2014\s*2024\b/u.test(text)) {
    return resolved("clearcut-last-ten-years");
  }
  if (hasClearcut && (/\b(?:aastakumn\w*|2014\s*2024)\b/u.test(text)
    || /\btrend\w*\b[\s\S]{0,40}\b(?:19|20)\d{2}\b/u.test(text))) {
    return resolved("clearcut-over-time");
  }
  if (hasClearcut && /\b(?:koik|alati|keskkonnavast\w*|keskkonn\w*|halb\w*|moju\w*|kahju\w*|elurikk\w*|loodus\w*|keskkond\w*)\b/u.test(text)) {
    return resolved("clearcut-value-judgement");
  }
  if (/\b(?:vana|vanad|vanem)\s+mets\w*\b/u.test(text)
    && /\b(?:automaat\w*|kaitse\w*|kaitst\w*|kaitsestaatus\w*|tohib\w*|rai\w*)\b/u.test(text)) return resolved("old-forest-protection");
  if (/\bpuistu\w*[\s\S]{0,35}\b(?:korge\s+vanus|vana)\b/u.test(text)
    && /\b(?:kaitse\w*|kaitst\w*|kaitsestaatus\w*|tohib\w*|rai\w*)\b/u.test(text)) return resolved("old-forest-protection");
  if (/\bpuistu\w*\b[\s\S]{0,65}\b(?:100|saja)\s+aasta\w*\b/u.test(text)
    && /\bkaitsestaatus\w*|kaitse\w*\b/u.test(text)) return resolved("old-forest-protection");
  if (hasForest && /\b(?:mittemajandatav\w*|majanduspiirang\w*|piiranguga\s+metsamaa)\b/u.test(text)
    && /\b(?:kui\s+suur|kui\s+palju|mitu|osa|osakaal|protsent\w*)\b/u.test(text)) return resolved("forest-management-category-share");
  if (hasForest && /\b(?:kaitse\s+all|kaitstud|kaitsealuse|rangelt\s+kaitstav)\b/u.test(text)
    && /\b(?:kui\s+suur|kui\s+palju|mitu|osa|osakaal|protsent\w*)\b/u.test(text)) return resolved("protected-forest-share");
  if (hasProtection && (hasHarvest || hasNotice)) return resolved("logging-in-protected-areas");
  if (hasNotice || (/\braiekavatsus\w*\b/u.test(text) && /\blubav\w*\s+mar(?:k|g)\w*\b/u.test(text))) return resolved("forest-notice");
  if (hasStem(tokens, ["mand", "mann", "mannik"], true) && hasStem(tokens, ["kuusk", "kuus", "kuusik"], true)) {
    return resolved("pine-versus-spruce");
  }
  if (hasForest && /\b(?:noor\w*|vana\w*|vanusjaot\w*|vanuselis\w*|keskealis\w*|keskmine\s+vanus)\b/u.test(text)
    && (/\b(?:muutu\w*|suuren\w*|vahen\w*|rohkem|vahem|trend\w*|jaotus\w*|keskmine|kas)\b/u.test(text)
      || /\bvanusjaot\w*\b/u.test(text))) {
    return resolved("forest-age-trend");
  }
  if (hasForest && /\b(?:kliim\w*|pou\w*|kuivus\w*|soojen\w*|urask\w*)\b/u.test(text)) return resolved("climate-impact");
  if ((hasIncrement || /\bjuurdekasvu\s+numb\w*/u.test(text))
    && /\b(?:kestlik\w*|jatkusuutlik\w*)\b/u.test(text)
    && /\b(?:toesta\w*|automaats\w*)\b/u.test(text)) return resolved("forest-harvest-balance");
  if (/\b15(?:\s+|[,.])4303\b/u.test(text) && /\b(?:kasvuhinnang\w*|tm|tihumeet)\b/u.test(text)) {
    return resolved("increment-estimate-2024");
  }
  if (hasIncrement && /\b(?:kuidas|arvuta\w*|mudel\w*|tekib|moodet\w*|hinnat\w*|metoodik\w*)\b/u.test(text) && !hasHarvest) {
    return resolved("increment-method");
  }
  // Harvest-versus-increment questions already have a dedicated structured
  // Eurostat/KAUR adapter. Leave them to that path so current observations
  // retain priority over this directory's explanatory fallback extract.
  if (hasHarvest && hasIncrement) return null;

  const depletion = hasForest && (isForestDepletionIntent(text)
    || /\bvarsti\b[\s\S]{0,25}\b(?:pole|ei\s+ole)\b[\s\S]{0,25}\bmetsa\b/u.test(text)
    || /\b(?:pole|ei\s+ole)\b[\s\S]{0,35}\benam\s+metsa\b/u.test(text)
    || /\b(?:varsti|lopuks)\b[\s\S]{0,45}\bmetsa\b[\s\S]{0,25}\b(?:pole|ei\s+ole|jaagi)\b/u.test(text)
    || /\bmets\w*\b[\s\S]{0,35}\b(?:kaob|havib|jaab)\w*\b[\s\S]{0,20}\b(?:ara|vahem)\b/u.test(text));
  if (depletion) return {
    kind: "forest-depletion",
    discoveryQueries: ["metsa tagavara stabiilne SMI", "Eesti metsamaa pindala SMI", "Eesti metsade seisund trendid"],
    serviceDocumentIds: ["forest-stock-stable", "forest-area", "forest-condition-review", "smi"],
    evidenceGroups: [],
    minimumSupportingDocuments: 1,
  };

  if (hasForest && (/\b(?:metsaga\s+kaetud|kaetud\s+metsaga|puistute\s+pindala|metsaga\s+metsamaa)\b/u.test(text)
    || /\b(?:mitu|kui\s+suur)\s+(?:protsenti|osa)\s+eesti\w*\b[\s\S]{0,30}\bmets\w*\b/u.test(text))) {
    return resolved("forest-covered-area");
  }
  if (hasForest && /\bmetsasus\w*\b/u.test(text)
    && /\b(?:pindala|protsent|osakaal)\w*\b/u.test(text)) return resolved("forest-covered-area");
  if (/\b51(?:\s+|[,.])84\b/u.test(text) && /\b54(?:\s+|[,.])08\b/u.test(text)) {
    return {
      kind: "forest-area",
      discoveryQueries: ["SMI 51,84 54,08 nimetaja Peipsi Võrtsjärv"],
      serviceDocumentIds: ["forest-area", "smi"],
      evidenceGroups: [],
      minimumSupportingDocuments: 1,
    };
  }
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
