// Public forestry routing and reviewed extracts from maintained official pages.
//
// This module is deliberately separate from the legacy forestry answer corpus.
// The documents below enter the ordinary visible result set and may support an
// answer only when their title, summary or content satisfies the intent's
// evidence groups. Tags alone never make an answer eligible.

import {
  classifyForestryGeographyScope,
} from "./municipalities.mjs";

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
    tags: ["mets", "metsateatis", "metsaregister", "raie", "metsakahjustus", "kinnistu", "riigilõiv"],
    summary: "Metsateatis on dokument, mille metsaomanik esitab Keskkonnaametile kavandatava raie või olulise metsakahjustuse kohta; Keskkonnaamet kontrollib teatise nõuetekohasust ja kavandatud raie vastavust nõuetele.",
    content: "Metsateatis käsitleb kavandatavat raiet või metsaregistrisse kandmata olulist metsakahjustust. Teatise esitamine, menetlemine või raiet lubav otsus ei tõenda, et raie on looduses juba tehtud. Metsateatise saab esitada Metsaregistri kaudu, kus omanik valib oma kinnistu ja täidab vormi. Konkreetse kinnistu inventeerimisandmete, eraldiste ja teatiste vaatamiseks tuleb kasutada riiklikku Metsaregistrit ehk Metsaportaali. Keskkonnaameti kehtiva juhise järgi võib metsaomanik metsateatist esitamata raiuda kuni 20 tihumeetrit puitu kinnisasja kohta aastas. Alates 1. juulist 2024 tuleb uuendusraie ja raadamise iga metsateatise läbivaatamise eest tasuda 30 eurot riigilõivu; muud raietüübid ei ole selle juhise järgi tasulised.",
    locator: "Metsateatise definitsioon; millal ja kuidas teatis esitada; 20 tihumeetri erand ning uuendusraie ja raadamise 30-eurone riigilõiv.",
    _forestryIntentKinds: ["forest-notice", "forest-notice-exception", "forest-notice-exception-fee", "property-forest-data"],
  },
  {
    id: "forest-smi-2025-tables",
    title: "SMI 2025 tulemuste andmetabelid",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Metsastatistika andmetabel",
    published: "18.08.2026",
    url: "https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI%20tulemused%202025/SMI%202025%20tulemused.xlsx",
    tags: ["mets", "SMI", "puuliigid", "omandivorm", "okaspuu", "vanuseklass", "2025"],
    summary: "SMI 2025 töövihik annab metsamaa pindala puuliigi, omandivormi ja vanuseklassi järgi ning sisaldab 1999–2025 aegridu.",
    content: "SMI 2025 tabelite järgi oli Eesti metsamaa pindala 2 360,2 tuhat hektarit ehk 52,1% Eesti pindalast. Metsaga metsamaa ehk puistute pindala oli 2 151,2 tuhat hektarit ehk 47,45%; metsamaa ja metsaga kaetud metsamaa on eri näitajad. Tabeli 6 järgi olid Eesti metsamaa peamiste puuliikide osakaalud enamuspuuliigi alusel kask 30%, mänd 29% ja kuusk 19%. Need osakaalud kirjeldavad metsamaa enamuspuuliiki, mitte kõigi üksikpuude arvu. Omandivormi tabelis oli riigimetskondade metsamaad 1 088,108 tuhat hektarit ja muud riigimaad 93,158 tuhat hektarit ehk riigimaad kokku 1 181,266 tuhat hektarit ehk 50,0% metsamaast. Füüsiliste isikute metsamaad oli 618,223 ja juriidiliste isikute metsamaad 559,618 tuhat hektarit ehk eramaad kokku 1 177,841 tuhat hektarit ehk 49,9%; 1,093 tuhande hektari omand oli määramata. Töölehe 31 aegridade järgi oli männikute ja kuusikute ehk okaspuupuistute pindala 2016. aastal kokku 1 164,8 tuhat hektarit ning 2025. aastal 1 132,9 tuhat hektarit: vähenemine oli 31,9 tuhat ehk ümardatult 32 000 hektarit. Vanuseklasside tabeli järgi oli 2025. aastal üle 100-aastaste puistute pindala 184,0 tuhat hektarit. Kõrge vanus ise ei anna puistule automaatset õiguslikku kaitset; kaitsestaatus tuleb kontrollida kaitstava objekti, vööndi ja kehtivate ruumiandmete järgi.",
    locator: "Töölehed 1, 2, 3, 6, 13 ja 31: metsamaa ja puistute pindala, omandivorm, enamuspuuliik, vanuseklassid ning puuliikide 1999–2025 pindala aegrida.",
    _publishedAt: "2026-08-18",
    _forestryIntentKinds: ["forest-covered-area", "forest-species-share", "forest-ownership-share", "conifer-area-trend", "old-forest-area-protection"],
  },
  {
    id: "rmk-managed-forest-area",
    title: "RMK hallatava metsamaa pindala 2026. aasta jaanuaris",
    organization: "Riigimetsa Majandamise Keskus",
    type: "Ametlik metsastatistika",
    published: "2026",
    url: "https://rmk.ee/uudised/uudis/riigimetsas-kasvas-rangelt-kaitstava-metsa-pindala-300-000-hektarini/",
    tags: ["mets", "RMK", "riigimets", "metsamaa", "pindala", "2026"],
    summary: "RMK 2026. aasta jaanuari andmete järgi oli RMK hallatavat metsamaad 1 029 902 hektarit.",
    content: "RMK avaldatud 2026. aasta jaanuari andmete järgi oli RMK hallatavat metsamaad 1 029 902 hektarit. See on RMK hallatav metsamaa, mitte kogu Eesti riigi omandis oleva metsamaa või kogu Eesti metsamaa pindala.",
    locator: "2026. aasta jaanuari RMK metsamaa ja kaitsejaotuse andmed.",
    _publishedAt: "2026-01-31",
    _forestryIntentKinds: ["rmk-managed-forest-area"],
  },
  {
    id: "forest-management-rules",
    title: "Metsa majandamise eeskiri",
    organization: "Riigi Teataja",
    type: "Kehtiv õigusakt",
    published: "jooksev",
    url: "https://www.riigiteataja.ee/akt/115122017017?leiaKehtiv=",
    tags: ["mets", "raie", "sanitaarraie", "raievanus", "mänd", "boniteet"],
    summary: "Metsa majandamise eeskiri sätestab puuliigi ja boniteediklassi järgi raievanused ning sanitaarraie tingimused.",
    content: "Metsa majandamise eeskirja § 6 lõike 3 järgi tohib sanitaarraiet teha mis tahes vanusega puistus, kuid puistu täius ei tohi sanitaarraie käigus langeda alla 30%. Eeskirja § 3 järgi ei ole männi lageraievanus üks kindel arv: hariliku männi raievanused on boniteediklasside 1A, 1, 2, 3, 4 ning 5 ja 5A järgi vastavalt 90, 90, 90, 100, 110 ja 120 aastat ehk 90–120 aastat. Lageraie võib olla lubatud ka küpsusdiameetri või muude seaduses sätestatud tingimuste alusel, mistõttu konkreetse puistu otsus ei põhine ainult vanusel.",
    locator: "§ 3 lõiked 1–3: raievanused ja küpsusdiameeter; § 6 lõige 3: sanitaarraie igas vanuses puistus ning 30% täiuse alampiir.",
    _forestryIntentKinds: ["sanitary-cutting-rules", "pine-cutting-age"],
  },
  {
    id: "moose-population-2025",
    title: "Ulukiasurkondade seisund ja küttimissoovitus 2025",
    organization: "Keskkonnaagentuur",
    type: "Riiklik seirearuanne",
    published: "2025",
    url: "https://keskkonnaportaal.ee/sites/default/files/SEIREARUANNE_2025.pdf",
    tags: ["uluk", "põder", "arvukus", "seire", "2025"],
    summary: "Keskkonnaagentuuri hinnangul oli põdra asurkonna suurus 2025. aasta alguses 10 000–11 000 isendit.",
    content: "Keskkonnaagentuuri 2025. aasta ulukiseire aruande järgi oli põdra asurkonna suurus 2025. aasta alguses jätkuvalt mõõdukas: 10 000–11 000 isendit. Tegemist on üleriigilise asurkonna suuruse hinnanguga, mitte täpse loendusega ühel kuupäeval.",
    locator: "Põdra peatüki kokkuvõte ja küttimissoovitus: asurkonna hinnang 2025. aasta alguses.",
    _publishedAt: "2025-06-01",
    _forestryIntentKinds: ["moose-population-2025"],
  },
  {
    id: "bird-hunting-season-2026",
    title: "Enne linnujahti veendu reeglites",
    organization: "Keskkonnaamet",
    type: "Ametlik jahindusjuhis",
    published: "11.08.2026",
    url: "https://keskkonnaamet.ee/uudised/enne-linnujahti-veendu-palun-reeglites",
    tags: ["lind", "linnujaht", "jahipidamine", "kormoran", "veelind", "hani", "lagle"],
    summary: "Keskkonnaamet selgitab, et eri linnuliikide küttimisajad algavad eri kuupäevadel ning enne jahti tuleb kontrollida liiki ja kehtivat jahieeskirja.",
    content: "Keskkonnaameti 11. augusti 2026 juhise järgi ei ole linnujahil üht alguskuupäeva: kormorani võib küttida alates 1. augustist, vee- ja soolindude küttimisaeg algab 20. augustil ning hanede ja laglede küttimisaeg 20. septembril. Küttida tohib ainult lubatud liiki ja loa alusel ning enne jahti tuleb kontrollida kehtivat jahieeskirja. Veelinnujahil ja märgaladel ei tohi kasutada pliihaavleid ega elektroonilisi peibutusvahendeid.",
    locator: "11.08.2026 juhis: kormorani, vee- ja soolindude ning hanede ja laglede küttimisaja algus ja peamised keelud.",
    _publishedAt: "2026-08-11",
    _forestryIntentKinds: ["bird-hunting-season"],
  },
  {
    id: "bark-beetle-guidance",
    title: "Kuuse-kooreürask: kuidas teda tunda ja ära hoida?",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Ametlik metsakaitsejuhend",
    published: "27.05.2025",
    url: "https://keskkonnaportaal.ee/et/kuuse-kooreurask-kuidas-teda-tunda-ja-ara-hoida-juhend-metsaomanikule",
    tags: ["mets", "kuusk", "kooreürask", "kahjur", "püünispuu", "feromoon"],
    summary: "Juhend kirjeldab värskelt asustatud kuuse tunnuseid ning kahjustuste vähendamist püünispuude ja õigeaegse väljaveoga.",
    content: "Kuuse-kooreürask on üks olulisemaid kuusekahjureid Euroopas. Mardikas kaevandab kuuse koore all, toitub koore niineosast ja põhjustab sellega kuuskede kuivamist. Värskelt kuuse-kooreüraski asustatud puu võra võib olla veel roheline. Tunnusteks on 2–2,5 mm läbimõõduga sisenemisavad, tüvel esinevad vaigunired ja pruunikas näripuru, mis lamaval tüvel koguneb kuhjakestena ning seisval puul okstele, juurekaelale või ämblikuvõrkudele. Kahjustuste vähendamiseks kasutatakse enne lendlust langetatud püünispuid; need ja värskelt asustatud puud tuleb mõne nädala jooksul pärast asustamist välja vedada. Feromoondispenserid paigaldatakse vahetult enne lendluse algust ning võimalusel 10–15 meetri kaugusele kasvavatest keskealistest ja vanematest okaspuudest.",
    locator: "Uuendatud 27.05.2025; seotud juhendmaterjali peatükid „Kahjustuse tuvastamine” ning „Kahjustuste vältimine ja vähendamine”.",
    _publishedAt: "2025-05-27",
    _forestryIntentKinds: ["bark-beetle-guidance", "bark-beetle-damage"],
  },
  {
    id: "forest-fires-2025",
    title: "Päästeameti metsa- ja maastikutulekahjude avaandmed 2014–2025",
    organization: "Päästeamet",
    type: "Ametlik avaandmestik",
    published: "2025",
    url: "https://www.rescue.ee/et/juhend/avaandmed/metsa-ja-maastikutulekahjud",
    tags: ["mets", "metsatulekahju", "maastikutulekahju", "Päästeamet", "2025"],
    summary: "Päästeameti PÄIS-e avaandmetes oli 2025. aastal 60 sündmust, mille põlenguobjekt oli mets või mets koos maastikuga.",
    content: "Päästeameti metsa- ja maastikutulekahjude PÄIS-e avaandmestikus oli 2025. aastal 357 metsa- ja maastikutulekahju sündmuse kirjet. Neist 32 kirje välja „mis põles” väärtus oli „Mets” ja 28 väärtus „Mets, maastik”, seega oli metsa hõlmanud tulekahjusündmusi kokku 60. See arv ei ole null ega tähenda kõigi 357 maastikupõlengu nimetamist metsatulekahjuks.",
    locator: "Avaandmete CSV 2014–2025: 2025. aasta read, väli „mis_poles”; Mets 32 ja Mets, maastik 28.",
    _publishedAt: "2026-01-01",
    _forestryIntentKinds: ["forest-fires-2025"],
  },
  {
    id: "forest-regeneration-2025-availability",
    title: "Metsa-aastaraamatud ja metsauuendamise avaldatud andmed",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Ametlik statistika avaldamise loend",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/metsa-aastaraamatud",
    tags: ["mets", "metsauuendamine", "istutamine", "külv", "2025", "andmete saadavus"],
    summary: "Avalikus metsa-aastaraamatute loendis ei ole 2025. aasta üleriigilist istutamise ja külvamise pindala veel avaldatud.",
    content: "Keskkonnaportaali avalikus metsa-aastaraamatute loendis on uusim terviklik väljaanne „Aastaraamat Mets 2023”. SMI 2025 tulemuste tabelid ei sisalda üleriigilist metsauuendamise istutamise ja külvamise pindala. 2025. aasta üleriigilist istutamise ja külvamise teel uuendatud metsamaa pindala ei ole nendes ametlikes avalikes allikates avaldatud. Andme puudumine ei tähenda nullväärtust; täpset varasema aasta arvu ei tohi 2025. aastale üle kanda.",
    locator: "Metsa-aastaraamatute avalik loend ja uusim terviklik aastaraamat; 2025. aasta metsauuendamise koondnäitaja saadavus.",
    _forestryIntentKinds: ["forest-regeneration-2025-availability"],
  },
  {
    id: "forest-law",
    title: "Metsaseadus",
    organization: "Riigi Teataja",
    type: "Kehtiv õigusakt",
    published: "jooksev",
    url: "https://www.riigiteataja.ee/akt/MS",
    tags: ["mets", "metsamaa", "raie", "lageraie", "raielank", "metsateatis", "säästev majandamine", "tagavara"],
    summary: "Metsaseadus sätestab metsa kui ökosüsteemi kaitse, säästva majandamise, metsaressursi arvestuse ja metsateatise õigusliku raami.",
    content: "Metsaseaduse eesmärk on tagada metsa kui ökosüsteemi kaitse ja säästev majandamine. Seadus eristab metsa, metsamaad, metsaressursi arvestust ja konkreetseid metsamajandamise tegevusi. Kasvava metsa tagavara on metsaressursi näitaja, mitte automaatselt lubatud või majanduslikult kättesaadav raiemaht. Raie lubatavus sõltub muu hulgas metsa seisundist, vanusest, asukohast, õiguslikest piirangutest ja nõuetekohasest menetlusest. Metsaseaduse § 28 järgi tehakse sanitaarraiet metsa sanitaarse seisundi parandamiseks ning ohuallikat mittekujutavate surevate või surnud puude puidu kasutamise võimaldamiseks, kui see ei ohusta elustiku mitmekesisust. Metsaseaduse § 29 lõike 11 järgi on lageraielangi ülempiir olenevalt kasvukohast kaks hektarit luitel, erosiooni- või tuuleohtlikul ning loo ja sambliku kasvukohal, viis hektarit loetletud soo- ja rabakasvukohtades ning muudes kasvukohatüüpides üldjuhul seitse hektarit; viie ja seitsme hektari piirangul on seaduses ühe metsaeraldise erand. Metsateatise kohustus ja erandid on sätestatud §-s 41. § 41 lõike 14 järgi võib metsaomanik metsateatist esitamata raiuda kuni 20 tihumeetrit puitu kinnisasja kohta aastas.",
    locator: "§ 2, § 3, § 6, § 9, § 28, § 29 lõige 11 ja § 41; kontrolli alati kehtivat redaktsiooni.",
    _forestryIntentKinds: ["stock-versus-harvestable", "clearcut-value-judgement", "clearcut-size-limits", "sanitary-cutting-definition", "sanitary-cutting-rules", "forest-notice", "forest-notice-exception-fee", "logging-in-protected-areas"],
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
    id: "nature-protection-share-2025",
    title: "Kaitstavate alade pindala ja osakaal territooriumist",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Keskkonnanäitaja",
    published: "12.05.2026",
    url: "https://keskkonnaportaal.ee/et/kaitstavate-alade-pindala-ja-osakaal-territooriumist",
    tags: ["looduskaitse", "kaitstavad alad", "pindala", "osakaal", "EELIS", "2025"],
    summary: "31.12.2025 seisuga oli kaitse all 20% Eesti maismaast ilma suurte järvedeta, 21% koos suurte järvedega ja 23,5% Eesti kogupindalast koos territoriaalmerega.",
    content: "31.12.2025 seisuga oli kaitse all 20% Eesti maismaast ilma suurte järvedeta ja 21% maismaast koos suurte järvedega. Kaitstava ala kogupindala koos territoriaalmerega oli 1 658 779 hektarit ehk 23,5% Eesti kogupindalast. Need osakaalud kasutavad erinevaid nimetajaid, seega tuleb vastuses täpsustada, kas Eesti pindala tähendab maismaad, maismaad koos suurte järvedega või kogupindala koos territoriaalmerega.",
    locator: "Joonis 1 ja selle 31.12.2025 selgitus: maismaa, suured järved, territoriaalmeri ja kogupindala.",
    _publishedAt: "2026-05-12",
    _forestryIntentKinds: ["nature-protection-share-2025"],
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
    _forestryIntentKinds: ["smi-method-comparison", "forest-stock-uncertainty", "sample-size-and-precision", "increment-method", "increment-estimate-2024", "stock-versus-harvestable", "protected-forest-share", "forest-management-category-share", "forest-age-trend", "pine-versus-spruce", "forest-harvest-2025", "harvest-over-time"],
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
  "forest-harvest-2025": {
    serviceDocumentIds: ["forest-smi-2025-presentation"],
    discoveryQueries: ["SMI 2025 raiemahu eksperthinnang"],
    evidenceGroups: [
      ["2025. aasta raiemahu eksperthinnang"],
      ["11,0 miljonit m³", "11 miljonit m³"],
    ],
  },
  "bark-beetle-damage": {
    serviceDocumentIds: ["bark-beetle-guidance"],
    discoveryQueries: ["kuuse-kooreürask kuusik kahjustab niineosa kuivamine"],
    evidenceGroups: [
      ["kuuse-kooreürask"],
      ["koore all"],
      ["niineosast"],
      ["kuuskede kuivamist"],
    ],
  },
  "sanitary-cutting-definition": {
    serviceDocumentIds: ["forest-law"],
    discoveryQueries: ["metsaseadus sanitaarraie metsa sanitaarse seisundi parandamine"],
    evidenceGroups: [
      ["sanitaarraiet"],
      ["metsa sanitaarse seisundi parandamiseks"],
      ["surevate või surnud puude"],
      ["elustiku mitmekesisust"],
    ],
  },
  "forest-notice-exception": {
    serviceDocumentIds: ["forest-notice-guidance"],
    discoveryQueries: ["metsateatis küttepuud 20 tihumeetrit kinnisasja kohta aastas"],
    evidenceGroups: [
      ["metsateatist esitamata"],
      ["20 tihumeetrit"],
      ["kinnisasja kohta aastas"],
    ],
  },
  "nature-protection-share-2025": {
    serviceDocumentIds: ["nature-protection-share-2025"],
    discoveryQueries: ["Eesti kaitstavate alade osakaal 31.12.2025"],
    evidenceGroups: [
      ["31.12.2025"],
      ["20%"],
      ["21%"],
      ["23,5%"],
      ["territoriaalmerega"],
    ],
  },
  "forest-species-share": {
    serviceDocumentIds: ["forest-smi-2025-tables"],
    discoveryQueries: ["SMI 2025 enamuspuuliik kask mänd kuusk osakaal"],
    evidenceGroups: [
      ["kask 30%"],
      ["mänd 29%"],
      ["kuusk 19%"],
      ["enamuspuuliigi"],
    ],
  },
  "forest-ownership-share": {
    serviceDocumentIds: ["forest-smi-2025-tables"],
    discoveryQueries: ["SMI 2025 metsamaa omandivorm riigimaa eramaa"],
    evidenceGroups: [
      ["riigimaad kokku 1 181,266 tuhat hektarit"],
      ["50,0%"],
      ["eramaad kokku 1 177,841 tuhat hektarit"],
      ["49,9%"],
      ["omand oli määramata"],
    ],
  },
  "rmk-managed-forest-area": {
    serviceDocumentIds: ["rmk-managed-forest-area"],
    discoveryQueries: ["RMK hallatav metsamaa 2026 pindala"],
    evidenceGroups: [
      ["rmk hallatavat metsamaad"],
      ["1 029 902 hektarit"],
      ["mitte kogu eesti riigi omandis"],
    ],
  },
  "forest-regeneration-2025-availability": {
    serviceDocumentIds: ["forest-regeneration-2025-availability"],
    discoveryQueries: ["metsauuendamine istutamine külv 2025 Eesti"],
    evidenceGroups: [
      [
        "2025. aasta üleriigilist istutamise ja külvamise pindala",
        "2025. aasta üleriigilist istutamise ja külvamise teel uuendatud metsamaa pindala",
      ],
      ["ei ole", "pole"],
      ["avaldatud"],
      ["ei tähenda", "mitte null"],
    ],
  },
  "conifer-area-trend": {
    serviceDocumentIds: ["forest-smi-2025-tables"],
    discoveryQueries: ["SMI okaspuupuistute pindala 2016 2025"],
    evidenceGroups: [
      ["okaspuupuistute pindala"],
      ["2016. aastal kokku 1 164,8 tuhat hektarit"],
      ["2025. aastal 1 132,9 tuhat hektarit"],
      ["31,9 tuhat", "32 000 hektarit"],
    ],
  },
  "sanitary-cutting-rules": {
    serviceDocumentIds: ["forest-management-rules"],
    discoveryQueries: ["metsa majandamise eeskiri sanitaarraie vanus täius 30"],
    evidenceGroups: [
      ["sanitaarraiet"],
      ["mis tahes vanusega puistus"],
      ["alla 30%"],
    ],
  },
  "moose-population-2025": {
    serviceDocumentIds: ["moose-population-2025"],
    discoveryQueries: ["Keskkonnaagentuur põdra asurkonna suurus 2025"],
    evidenceGroups: [
      ["põdra asurkonna suurus"],
      ["2025. aasta alguses"],
      ["10 000–11 000 isendit", "10 000 - 11 000 isendit"],
      ["hinnang", "mitte täpse loendusega"],
    ],
  },
  "bird-hunting-season": {
    serviceDocumentIds: ["bird-hunting-season-2026"],
    discoveryQueries: ["Keskkonnaamet linnujaht 2026 kormoran veelinnud haned lagled"],
    evidenceGroups: [
      ["kormorani"],
      ["1. augustist"],
      ["20. augustil"],
      ["20. septembril"],
      ["jahieeskirja"],
    ],
  },
  "smi-definition": {
    serviceDocumentIds: ["smi"],
    discoveryQueries: ["mis on statistiline metsainventuur SMI valikuuring"],
    evidenceGroups: [
      ["statistiline metsainventuur ehk smi"],
      ["üleriigiliste proovitükkidega"],
      ["valikuuring"],
      ["kogu eesti metsade üldistatud hinnang"],
    ],
  },
  "bark-beetle-guidance": {
    serviceDocumentIds: ["bark-beetle-guidance"],
    discoveryQueries: ["kuuse-kooreürask tunnused näripuru püünispuu"],
    evidenceGroups: [
      ["2–2,5 mm", "2-2,5 mm"],
      ["vaigunired"],
      ["näripuru"],
      ["püünispuid"],
      ["välja vedada"],
    ],
  },
  "clearcut-size-limits": {
    serviceDocumentIds: ["forest-law"],
    discoveryQueries: ["metsaseadus lageraielangi pindala kaks viis seitse hektarit"],
    evidenceGroups: [
      ["lageraielangi ülempiir"],
      ["kaks hektarit"],
      ["viis hektarit"],
      ["seitse hektarit"],
    ],
  },
  "pine-cutting-age": {
    serviceDocumentIds: ["forest-management-rules"],
    discoveryQueries: ["metsa majandamise eeskiri harilik mänd raievanus boniteet"],
    evidenceGroups: [
      ["hariliku männi raievanused"],
      ["90, 90, 90, 100, 110 ja 120 aastat"],
      ["90–120 aastat", "90-120 aastat"],
      ["boniteediklass"],
    ],
  },
  "forest-notice-exception-fee": {
    serviceDocumentIds: ["forest-notice-guidance"],
    discoveryQueries: ["metsateatis 20 tihumeetrit riigilõiv 30 eurot"],
    evidenceGroups: [
      ["20 tihumeetrit"],
      ["30 eurot"],
      ["uuendusraie"],
      ["raadamise"],
    ],
  },
  "old-forest-area-protection": {
    serviceDocumentIds: ["forest-smi-2025-tables", "nature-conservation-law"],
    discoveryQueries: ["SMI 2025 üle 100 aastaste puistute pindala", "vana mets automaatne kaitse"],
    evidenceGroups: [
      ["üle 100-aastaste puistute pindala"],
      ["184,0 tuhat hektarit"],
      ["ei anna", "ei tulene"],
      ["automaatset õiguslikku kaitset", "üksnes vanuse tõttu"],
      ["kaitstavast loodusobjektist", "kaitstava objekti"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-fires-2025": {
    serviceDocumentIds: ["forest-fires-2025"],
    discoveryQueries: ["Päästeamet metsa maastikutulekahjud 2025 avaandmed"],
    evidenceGroups: [
      ["2025. aastal"],
      ["mets või mets koos maastikuga"],
      ["kokku 60"],
      ["357"],
    ],
  },
  "forest-area-method": {
    serviceDocumentIds: [
      "forest-stock-stable",
      "forest-area",
      "smi",
      "forest-smi-2025-presentation",
      "forest-smi-methodology-20-years",
    ],
    discoveryQueries: [
      "Eesti metsamaa pindala SMI",
      "statistiline metsainventuur valikuuring proovitükid kogu Eesti",
    ],
    evidenceGroups: [],
    minimumSupportingDocuments: 2,
  },
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
    serviceDocumentIds: ["forest-smi-2025-tables"],
    discoveryQueries: ["SMI 2025 metsamaa metsaga metsamaa pindala osakaal"],
    evidenceGroups: [
      ["metsaga metsamaa", "puistute pindala"],
      ["2 151,2 tuhat hektarit"],
      ["47,45%"],
      ["2 360,2 tuhat hektarit"],
      ["52,1%"],
      ["eri näitajad", "ei ole sama"],
    ],
  },
  "forest-overview": {
    serviceDocumentIds: ["forest-area", "smi", "forest-condition-review", "metsainfo-hetkeseis"],
    discoveryQueries: ["Eesti metsamaa pindala SMI", "Eesti metsade seisund SMI ülevaade", "metsaandmed SMI Metsaregister"],
    evidenceGroups: [
      ["51,84%", "2 350,6"],
      ["valikuuring", "proovitükk"],
      ["elurikkus", "kaitse"],
      ["eri näitajad", "eraldi", "mitmel viisil"],
    ],
    minimumSupportingDocuments: 3,
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
    requiresQueryBoundObservation: true,
  },
  "regional-forest-area": {
    serviceDocumentIds: [],
    discoveryQueries: [],
    evidenceGroups: [],
    requiresQueryBoundObservation: true,
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
    requiresQueryBoundObservation: Boolean(definition.requiresQueryBoundObservation),
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

// Estonian-only mode (default): English forestry phrasing stays inert.
// Set MULTILINGUAL_SEARCH_ENABLED=true to restore multilingual routing.
function isForestryMultilingual() {
  return String(process.env.MULTILINGUAL_SEARCH_ENABLED ?? "").trim().toLowerCase() === "true";
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

export function resolvePublicForestryIntent(query, { forPrivacyCheck = false } = {}) {
  const text = normalize(query);
  if (!text) return null;
  const tokens = text.split(" ").filter(Boolean);
  const hasSmi = hasStem(tokens, ["smi"]);
  const hasRegistry = hasStem(tokens, ["metsaregis"], true);
  const hasNotice = hasStem(tokens, ["metsateat", "raieteat"], true);
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
  const multilingualForestry = isForestryMultilingual();
  const hasForest = hasStem(tokens, [
    "mets", "puist", "tagavara", "metsavaru", "puiduvaru", "juurdekasv", "netojuurdekasv",
    "lagerai", "sanitaarrai", "metsatulekah", "metsateat", "raieteat", "metsaregis", "takseer",
    "mand", "kuusk", "okaspuu", "kooreurask",
    ...(multilingualForestry ? ["forest", "woodland"] : []),
  ], true) || (multilingualForestry && /\bforested\b/u.test(text)) || hasSmi || hasStem(tokens, ["rmk"]);

  // Claim-specific national questions must resolve before the generic
  // area/geography fallback. Several begin with “kui palju metsa”, but ask
  // about regeneration, fire events or ownership rather than forest area.
  if (hasHarvest && /\b2025\b/u.test(text)
    && /\b(?:kui\s+palju|raiemaht\w*|maht\w*|tihumeet\w*)\b/u.test(text)) {
    return resolved("forest-harvest-2025");
  }
  if (/\b(?:puuliig\w*|enamuspuuliig\w*)\b/u.test(text)
    && /\b(?:osakaal\w*|protsent\w*|peamis\w*|domineeri\w*)\b/u.test(text)) {
    return resolved("forest-species-share");
  }
  if (/\b(?:riigi\w*|riigimets\w*)\b/u.test(text)
    && /\b(?:eraomanik\w*|eramets\w*|eramaa\w*)\b/u.test(text)
    && /\b(?:osa|osakaal\w*|protsent\w*|kuulu\w*|omand\w*)\b/u.test(text)) {
    return resolved("forest-ownership-share");
  }
  if (/\brmk\b/u.test(text)
    && /\b(?:halda\w*|hallata\w*|hallatav\w*)\b/u.test(text)
    && /\b(?:mets\w*|hektar\w*|pindala\w*|palju)\b/u.test(text)) {
    return resolved("rmk-managed-forest-area");
  }
  if (/\b2025\b/u.test(text)
    && /\b(?:uuenda\w*|uuendati\w*)\b/u.test(text)
    && /\bistuta\w*\b/u.test(text)
    && /\bkulva\w*\b/u.test(text)) {
    return resolved("forest-regeneration-2025-availability");
  }
  if (/\bokaspuu\w*\b/u.test(text)
    && ((/\b2016\b/u.test(text) && /\b2025\b/u.test(text))
      || /\b(?:viimase\s+)?(?:10|kumne)\s+aasta\w*\b|\bviimase\s+kumnendi\w*\b/u.test(text))
    && /\b(?:pindala\w*|muutu\w*|vahen\w*|suuren\w*)\b/u.test(text)) {
    return resolved("conifer-area-trend");
  }
  if (/^mis\s+on\s+sanitaarrai\w*$/u.test(text)) {
    return resolved("sanitary-cutting-definition");
  }
  if (/\bsanitaarrai\w*\b/u.test(text)
    && /\b(?:vanus\w*|puistu\w*|tohib\w*|lubat\w*)\b/u.test(text)) {
    return resolved("sanitary-cutting-rules");
  }
  if (/\b(?:poder|podr|potr)\w*\b/u.test(text)
    && /\b(?:arvuk\w*|asurk\w*|palju|arv\w*)\b/u.test(text)) {
    return resolved("moose-population-2025");
  }
  if (/\blinnujaht\w*\b/u.test(text)
    || (/\b(?:lind|linnu|linde|lindude)\w*\b/u.test(text)
      && /\b(?:jaht\w*|kutt\w*|kuti\w*)\b/u.test(text))) {
    return resolved("bird-hunting-season");
  }
  if (hasSmi && (/^(?:mis|mida)\s+(?:on|tahendab)\s+smi$/u.test(text)
    || /^mis\s+on\s+statistiline\s+metsainventuur(?:\s+ehk\s+smi)?$/u.test(text))) {
    return resolved("smi-definition");
  }
  if (/\b(?:kuuse\s+)?kooreurask\w*\b/u.test(text)
    && /\b(?:tund\w*|ara\s+tund\w*|torj\w*|valdi\w*|hoid\w*)\b/u.test(text)) {
    return resolved("bark-beetle-guidance");
  }
  if (/\b(?:kuuse\s+)?kooreurask\w*\b/u.test(text)
    && /\b(?:mis\s+on|kahjust\w*|kuusik\w*|kuiv\w*)\b/u.test(text)) {
    return resolved("bark-beetle-damage");
  }
  if (hasClearcut
    && /\b(?:raielank\w*|lageraielank\w*|langi\w*)\b/u.test(text)
    && /\b(?:suur\w*|pindala\w*|hektar\w*|maksimaal\w*)\b/u.test(text)) {
    return resolved("clearcut-size-limits");
  }
  if (/\b(?:mand|mann|manniku|mannipuistu)\w*\b/u.test(text)
    && /\b(?:raievanus\w*|vanus\w*)\b/u.test(text)
    && /\b(?:rai\w*|lagerai\w*|tohib\w*)\b/u.test(text)) {
    return resolved("pine-cutting-age");
  }
  if (hasNotice
    && /\b(?:riigiloiv\w*|tasu\w*|euro\w*|20\s+tihumeet\w*|ei\s+pea)\b/u.test(text)) {
    return resolved("forest-notice-exception-fee");
  }
  if (hasNotice && /\b(?:küttepuu\w*|kuttepuu\w*|oma\s+mets\w*)\b/u.test(text)) {
    return resolved("forest-notice-exception");
  }
  if (/\b(?:ule\s+100|100\s*aasta)\w*\b/u.test(text)
    && /\b(?:mets\w*|puistu\w*)\b/u.test(text)
    && /\b(?:kaitse\w*|kaitst\w*|palju|pindala\w*)\b/u.test(text)) {
    return resolved("old-forest-area-protection");
  }
  if (/\bmetsatulekah\w*\b/u.test(text) && /\b2025\b/u.test(text)) {
    return resolved("forest-fires-2025");
  }
  if (/\b(?:eestist|eesti\s+pindala\w*|eesti\s+maismaa\w*|kogupindala\w*)\b/u.test(text)
    && /\b(?:looduskaitse\w*|kaitstav\w*|kaitse\s+all)\b/u.test(text)
    && /\b(?:osa|osakaal\w*|protsent\w*|palju|suur)\b/u.test(text)) {
    return resolved("nature-protection-share-2025");
  }

  const geographyScope = classifyForestryGeographyScope(query, { forPrivacyCheck });
  const municipalityScope = ["reviewed-municipality", "unknown-locality"].includes(geographyScope.kind);
  const regionalScope = ["estonian-region", "foreign-or-other-region"].includes(geographyScope.kind);
  const municipalityAreaMetric = new RegExp(`\\b(?:kui\\s+palju|kui\\s+suur\\w*|mitu\\s+hektar\\w*|metsasus\\w*|metsamaa\\w*|metsa\\s+pindala|metsaga\\s+kaetud|pindala|osakaal|protsent\\w*${multilingualForestry ? "|forest\\s+area|forest\\s+cover(?:age)?|woodland\\s+area|woodland\\s+cover(?:age)?|forest\\s+hectares?|hectares?\\s+(?:of\\s+)?(?:forest|woodland)|hectares?\\s+are\\s+forested|percentage|how\\s+many\\s+(?:forest\\s+)?hectares|how\\s+much\\s+(?:forest|woodland)" : ""})\\b`, "u").test(text);
  // Municipal AREA routing must never claim a harvest, clearcut, increment or
  // stock question (nt "Kui palju metsa raiuti Tartu vallas?"): local
  // quantities in those metrics have no query-bound evidence path, so an
  // area intent would substitute the wrong metric. Such questions fall
  // through and fail closed instead.
  const municipalMetricQuestion = !hasHarvest && !hasClearcut && !hasIncrement && !hasStock;
  if (hasForest && municipalMetricQuestion && (/\b(?:koduvall\w*|valla\s+mets\w*|mets\w*(?:\s+\w+){0,3}\s+vallas|vallas(?:\s+\w+){0,3}\s+mets\w*|metsasus\w*(?:\s+\w+){0,4}\somavalitsus\w*)\b/u.test(text)
    || (municipalityScope && municipalityAreaMetric))) {
    return resolved("municipality-forest-area");
  }
  const asksForestMeasurementMethod = (
    /\b(?:kuidas|mil\s+viisil)\b[\s\S]{0,70}\b(?:moodet\w*|hinnat\w*|arvutat\w*|inventeerit\w*|metoodik\w*)\b/u.test(text)
    || (multilingualForestry && /\bhow\b[\s\S]{0,70}\b(?:measur\w*|estimat\w*|calculat\w*|survey\w*|inventor\w*|method\w*)\b/u.test(text))
    || (mentionsSample && /\b(?:metoodik\w*|moodet\w*|hinnat\w*|kuidas)\b/u.test(text))
    || (multilingualForestry && mentionsSample && /\bhow\b/u.test(text))
  );
  const hasParcelScope = /\b(?:kinnistu|katastriuksus|katastritunnus|maatuk|maauksus)\w*\b/u.test(text);
  // Concrete parcel and named source-comparison requests are narrower than
  // the national amount-plus-method composite. Resolve them first so an area
  // phrase cannot substitute country-wide SMI evidence for the requested
  // registry or property evidence.
  if (hasForest && hasParcelScope
    && (hasRegistry
      || municipalityAreaMetric
      || /\b(?:metsaandm\w*|metsaeraldis\w*|puistu\w*|kust\s+lei\w*|andm\w*\s+vaat\w*)\b/u.test(text))) {
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
  // A national amount-plus-method question has two independently verifiable
  // parts. Keep it out of the single-number area route so the answer planner
  // must bind both a current area measurement and a separate SMI method
  // witness. Named local and regional scopes retain their query-bound routes.
  if (hasForest
    && municipalityAreaMetric
    && asksForestMeasurementMethod
    && !municipalityScope
    && !regionalScope) return resolved("forest-area-method");
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
    // The supporting evidence table holds exactly the 2014-2024 annual
    // rows. A request naming any other year (nt trend 2010-2020) must fail
    // closed rather than answer with the wrong period.
    const requestedYears = [...text.matchAll(/\b((?:19|20)\d{2})\b/gu)].map((match) => Number(match[1]));
    if (requestedYears.every((year) => year === 2014 || year === 2024)) {
      return resolved("clearcut-over-time");
    }
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
  // Both share intents below are Estonia-wide SMI snapshots. A named
  // county, municipality or other region (nt Harjumaa) must never receive
  // national figures: such questions stay on the regional route and fail
  // closed on query-bound geography instead.
  if (hasForest && !regionalScope && !municipalityScope && /\b(?:mittemajandatav\w*|majanduspiirang\w*|piiranguga\s+metsamaa)\b/u.test(text)
    && /\b(?:kui\s+suur|kui\s+palju|mitu|osa|osakaal|protsent\w*)\b/u.test(text)) return resolved("forest-management-category-share");
  if (hasForest && !regionalScope && !municipalityScope && /\b(?:kaitse\s+all|kaitstud|kaitsealuse|kaitstav\w*|range\s+kaitse|rangelt\s+kaitstav)\b/u.test(text)
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

  // Never let a recognized local-government scope fall through to the
  // Estonia-wide forest-area snapshot. More specific forestry intents above
  // retain priority, while local area requests stay on the municipal route.
  // Non-area metrics (harvest, clearcut, increment, stock) have no municipal
  // evidence path and must fail closed rather than borrow the area route.
  if (hasForest && municipalityScope && municipalMetricQuestion) return resolved("municipality-forest-area");
  // Counties, foreign countries and broader named regions need a measurement
  // bound to that geography. They must never fall through to Estonia's
  // national SMI figures simply because the metric wording is familiar.
  if (hasForest && regionalScope && municipalityAreaMetric) return resolved("regional-forest-area");

  if (hasForest && (/\b(?:metsaga\s+kaetud|kaetud\s+metsaga|puistute\s+pindala|metsaga\s+metsamaa)\b/u.test(text)
    || /\b(?:mitu|kui\s+suur)\s+(?:protsenti|osa)\s+eesti\w*\b[\s\S]{0,30}\bmets\w*\b/u.test(text))) {
    return resolved("forest-covered-area");
  }
  if (multilingualForestry && hasForest && (/\b(?:forest|woodland)\s+cover(?:age)?(?:\s+(?:percentage|percent|share))?\b/u.test(text)
    || /\b(?:what|which)\s+(?:percentage|percent|share)\b[\s\S]{0,45}\b(?:forest|woodland)\b/u.test(text))) {
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
  // The national AREA snapshot must never answer a harvest, clearcut,
  // increment or stock question (nt "Kui palju metsa raiuti Tartu
  // vallas?"): those metrics have their own intents or no evidence path,
  // and a pindala figure would substitute the wrong metric. Such questions
  // fall through and fail closed instead. The same holds for a question about
  // another forest subject (species, age, fire, regeneration, ownership,
  // protection, damage): "kui palju" alone does not make it an area question.
  const asksOtherForestSubject = !forPrivacyCheck && /\b(?:\w*puuli(?:ik|ig)\w*|mand|mann\w*|kuus\w*|kask|kase\w*|kaasik\w*|haab|haav\w*|lepp\w*|lepa\w*|okaspuu\w*|lehtpuu\w*|vanus\w*|vana|vanad\w*|vanade\w*|\w*tulekahj\w*|poleng\w*|polen\w*|uuend\w*|istut\w*|kulv\w*|halda\w*|rmk|riigimets\w*|kaitst\w*|kaitse\w*|\w*urask\w*|kahjust\w*|kahjur\w*|haigus\w*|torm\w*|tuuleheit\w*)\b/u.test(text);
  if (hasForest && municipalMetricQuestion && !asksOtherForestSubject && /\b(?:kui\s+palju|mitu|kui\s+suur\w*|metsamaa|metsasus\w*|pindala|osakaal|protsent|hektar\w*)\b/u.test(text)) {
    return {
      kind: "forest-area",
      discoveryQueries: ["metsamaa pindala SMI Eesti", "metsasuse pindala Eesti"],
      serviceDocumentIds: ["forest-area", "smi"],
      evidenceGroups: [],
      minimumSupportingDocuments: 1,
    };
  }
  if (multilingualForestry && hasForest && /\b(?:forest\s+area|woodland\s+area|how\s+much\s+(?:forest|woodland)|how\s+many\s+(?:forest\s+hectares?|hectares?\s+of\s+(?:forest|woodland)|hectares?\s+(?:are\s+)?forested))\b/u.test(text)) {
    return {
      kind: "forest-area",
      discoveryQueries: ["metsamaa pindala SMI Eesti", "metsasuse pindala Eesti"],
      serviceDocumentIds: ["forest-area", "smi"],
      evidenceGroups: [],
      minimumSupportingDocuments: 1,
    };
  }
  // Bare generic forest overview (nt "mets"): ukski spetsiifiline naitaja,
  // meetod, kaitse, raie ega muu kavatsus eespool ei sobinud. Tagasta
  // mitme allika süntees loobumise asemel. Piiratud ainult palja
  // üldpäringuga, et sega- ("kala mets õhk") ja täpsustatud päringud
  // ("Mis on metsaregister?") säilitaksid oma marsruudi.
  if (hasForest && /^(?:eesti\s+)?mets(?:ad)?(?:\s+eestis)?$/u.test(text)) {
    return resolved("forest-overview");
  }
  return null;
}

export function forestryIntentDefinitions() {
  return Object.fromEntries(Object.keys(INTENTS).map((kind) => [kind, resolved(kind)]));
}
