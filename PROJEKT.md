# Keskkonnaportaali praktikaprojekt

## Eesmärk

See on Keskkonnaportaali eraldiseisev praktikaversioon aadressil [praktika.arleserver.cfd](https://praktika.arleserver.cfd). Avaleht kasutab Keskkonnaportaali tuttavat visuaalset keelt ja lisab kaks selgelt eraldatud kasutusvoogu:

1. **Allikapõhine küsimus-vastus otsing.** Kasutaja saab vastuse esmalt, iga väite juures on nummerdatud viited ning vastuse järel ametlikud algallikad.
2. **Terrapointi täisrakendus.** Avalehe eraldi jaotises töötab `terrapoint.ee` iframe. Terrapoint ei osale üldotsingu vastuste koostamises ega ilmu selle allikatesse.

Projekt on märgitud praktikaprojektiks ja saadab `noindex` juhise. See ei ole Keskkonnaportaali ametlik tootmiskeskkond.

## Kasutajakogemus

- Avalehe põhiotsing on nähtav kohe nii töölaual kui ka mobiili esimeses vaates. Mobiilipäise otsinguikoon viib fookuse samasse vormi ega loo DOM-i teist otsingukasti.
- Autocomplete pakub kuni viis sisulist küsimust ning toetab klaviatuuri, hiirt ja puutetundlikku ekraani.
- Otsingutulemus on kompaktne: otsene koondvastus, allikaviited, kolm esmast allikat, nupp ülejäänute avamiseks ja seotud küsimused.
- Avalikus kasutajaliideses ega API vastuses ei näidata mudeli, andmebaasi, vektorindeksi, fallback'i või ühenduste tehnilisi olekuid.
- Terrapointi iframe ei tohi lehte esmakordsel laadimisel enda juurde kerida ega hostrakenduselt fookust võtta.

## Arhitektuur

| Kiht | Lahendus | Vastutus |
|---|---|---|
| Kasutajaliides | React 19 + Vite | Responsive avaleht, ligipääsetav otsing, vastus ja allikad, Terrapointi iframe |
| Rakendusserver | Node.js + Express | Staatika, avalik API, turvapäised, rate limit ja päringu orkestreerimine |
| Metsateadmised | Versioonitud JSON-korpus | 21 läbi vaadatud vastusedokumenti, 18 FAQ teemat, 12 väärarusaama ja 13 ametlikku algallikat |
| Otsing | Kohalik eesti hübriidotsing | Terminilaiendus, BM25-laadne skoor, märgijadade sarnasus ja RRF-järjestus |
| Värske sisu | Nelja ametliku veebikogu liitotsing | Keskkonnaportaali, Keskkonnaameti, Keskkonnaagentuuri ja Kliimaministeeriumi sisu paralleelne avastamine ning puhastatud täistekst |
| Ruumipäring | Avalik kataster + Metsaregistri WFS | Valideeritud katastritunnuse informatiivne pindala ja metsaeraldiste hetkeseis otse avalikust teenusest |
| Vastuse koostamine | Kontrollitud vastus/abstention + valikuline LLM | Läbi vaadatud vertikaal vastab deterministlikult; üldotsingu mudel töötab ainult tugeva tõendikatte korral ja tõrke puhul kuvatakse aus allikaotsingu olek |
| Vahemälu | Eraldatud PostgreSQL | Versioonitud vastusepuhver ja privaatsust hoidev tehniline sündmuslogi |
| Terrapoint | Eraldi iframe | Kogu Terrapointi UI, kaart ja sealsed avalikud integratsioonid; üldotsingust lahus |
| Pakendamine | Dockerfile + Compose | Mitte-root, read-only veebikonteiner ja eraldatud PostgreSQL |
| Deploy | Coolify | Docker-build, tervisekontroll, HTTPS ja `praktika.arleserver.cfd` |

### Miks Redis ei ole praegu lisatud?

Rakendusel on üks veebireplika ning PostgreSQL annab juba püsiva vastusepuhvri. Bounded in-memory puhvrid katavad lühikesed korduspäringud. Redis lisaks praegu hooldus- ja rikkepinda ilma mõõdetava kasutegurita. See muutub põhjendatuks mitme replika, hajutatud rate limit'i, tööjärjekorra või instantsideülese single-flight vajaduse korral.

### Qdranti roll

Senine 256-mõõtmeline räsivektor ei olnud semantiline embedding ja Qdranti kirjutamine iga kasutajapäringu ajal ei parandanud otsingukvaliteeti. Qdrant on seetõttu eemaldatud päringu hot path'ist. Compose'is on see alles ainult valikulise `experimental-vector` profiilina, kuni olemas on päris mitmekeelne embedding, versioonitud eeltöötlus ja evalidega tõestatud kvaliteedivõit.

## Otsingu tööpõhimõte

Avalik endpoint on `GET /api/search?q=<küsimus>`.

1. Päring normaliseeritakse ning klassifitseeritakse deterministlikult olekusse `answerable`, `needs-clarification`, `live-weather` või `out-of-scope`. Prompt-injection'i korral vastatakse turvalise ulatuse selgitusega; mudelit ei kutsuta.
2. Metsateema korral otsitakse versioonitud ja läbi vaadatud teadmusbaasist. Üldine `mets` koostab päris sünteesi metsamaa pindalast, näitajate piiridest ja ametlike arvude erinevuse põhjustest; see ei kopeeri otsingukaartide väljavõtteid.
3. Valideeritud katastritunnuse korral küsitakse otse Maa- ja Ruumiameti avalikku `kataster:ky_kehtiv` ning Metsaregistri `metsaregister:eraldis` WFS-i. Katastriväljavõte märgitakse informatiivseks ja mitteametlikuks. Vastus eristab selgelt olekuid „leitud”, „eduka päringu tulemusel ei leitud” ja „allikas ei vastanud”.
4. Muude teemade korral otsitakse paralleelselt Keskkonnaportaalist ning Keskkonnaameti, Keskkonnaagentuuri ja Kliimaministeeriumi Valitsusportaali indeksitest. API täistekst või lubatud ametlik leht puhastatakse serveris; toorest HTML-i ei renderdata.
5. Tõendivärav nõuab, et vähemalt üks ametlik dokument kataks küsimuse põhitingimused ja küsitud aasta. Eri artiklitest juhuslikult kokku saadud märksõnad ei anna AI-le vastamisõigust.
6. Valikuline OpenCode Go `deepseek-v4-flash` võib koostada üldotsingu sünteesi ainult tugeva tõendipaki põhjal. Kui DeepSeek ei mahu oma seitsmesekundilisse katseaknasse, kasutab sama tõendilepingut `mimo-v2.5`; väikese kogujäägiga alustatakse kohe kiirema varumudeliga. Mõlemad töötavad OpenCode Go dokumenteeritud `/chat/completions` liidesel ning neile kehtib teenuse järgi nullpäevane andmesäilitus. Iga sisuline väide vajab lubatud viidet; arvud, ühikud, aastad, väitekatvus ja polaarsus valideeritakse mudelist sõltumatult. Metsavastust ega WFS-väljavõtet mudel ümber ei sõnasta.
7. 429, timeout, vigane mudelivastus või nõrk tõend ei muutu artikliväljavõtteks. Kasutaja saab kas kontrollitud vertikaalvastuse, täpsustusküsimuse, turvalise abstention'i või teate, et koondvastust ei saanud usaldusväärselt koostada.
8. Avalikus vastuses on ainult küsimus, vastus, viited, allikad, täpsustus ja seotud küsimused. Tehniline diagnostika jääb serverisse.
9. Kogu otsingul on 15 sekundi vastusepiir. Kui värskete allikate lugemine või mudel ei mahu sellesse, katkestatakse väliskutsed ja tagastatakse kontrollitud ajapiiri vastus, mitte proxy 504.

Vahemälu võti sisaldab teadmusbaasi ja vastuseskeemi revisjoni, seega ei saa vana Terrapointi või varasema skeemi vastus pärast deploy'd edasi elada.

### AI tõendileping ja tagasilükkamise semantika

Mudeli kasutamine ei anna päringule vastamisõigust. Mudel kutsutakse ainult siis, kui serveri deterministlik tõendivärav on märkinud vähemalt ühe ametliku dokumendi sama päringu jaoks piisavalt tugevaks. Mudelile saadetakse üksnes selle päringu piiratud tõendipakk (`summary`, kontrollitud väide ja/või puhastatud ametliku lehe sisu); mudelil ei ole selles voos veebi-, andmebaasi- ega tööriistajuurdepääsu. Tõenditekst on sisendandmed, mitte juhis, ning selles leiduvat käsku ei täideta.

Mudeli väljund ei lähe otse kasutajale. Server kontrollib enne avaldamist, et:

- iga muudetud väide viitaks kuvatud allikanumbrile;
- väites olev arv, aasta ja ühik esineksid just viidatud allika tõendis, mitte mõnes teises allikas;
- väite sisulistel sõnadel oleks piisav kattuvus viidatud tõendiga;
- eitus, lubamine/keelamine ning kasvu või languse suund ei pöörduks vastupidiseks;
- pealkiri ja usaldusmärkus jääksid deterministlikust algvastusest, mitte mudelist.

Kontrolli ebaõnnestumine ei lisa vastusele hoiatust ega lase vigast teksti läbi. Vigane lõik eemaldatakse; vigase sissejuhatuse asemel säilib deterministlik algtekst. Kui ükski mudeli väide kontrolli ei läbi, käsitletakse kogu mudelikatset ebaõnnestununa (`answer: null`) ning pipeline tagastab algvastuse. Sama juhtub vigase JSON-i, 429, timeout'i või mõlema mudeli tõrke korral.

Deterministlik algvastus tähendab üht neljast selgelt piiritletud liigist:

1. 21 eelkirjutatud ja tehniliselt läbi vaadatud metsadokumendist koostatud vastus;
2. 30-kirjelise ametliku allikakataloogi konkreetse kirje eelkirjutatud vastus koos sama allika viitega;
3. eelkirjutatud reaalaja-suunamine, täpsustusküsimus või ulatusest loobumine;
4. globaalse ajapiiri korral eelkirjutatud teade ja asjakohased allikakaardid, mitte uus genereeritud faktivastus.

Sõna „kontrollitud” tähendab siin praktikaprojekti tehnilist kontrolli, mitte Keskkonnaagentuuri sisueksperdi kinnitust. Dünaamilise allika viite lubamiseks peab URL jääma `server/integrations.mjs` ametlike HTTPS-hostide lubatud nimekirja ka pärast ümbersuunamist. Lause ja viite temaatilist seost kontrollitakse viidatud tõendi, mitte kogu vastuse vastu. Autoriteetne allikate ja API-de register on `docs/ALLIKAD.md`; runtime'i kataloog on `server/search.mjs` ning metsakorpuse register `server/knowledge/forestry/sources.json`.

## Teadmiste baas

Failid asuvad kaustas `server/knowledge/forestry/`:

- `sources.json` — 13 ametlikku algallikat koos väljaandja, URL-i, kuupäeva ja kasutuspiirangutega;
- `documents.json` — 21 struktureeritud vastust koos aliaste, metoodika, piirangute, väitetüübi ja täpse allikakohaga.

Korpus katab muu hulgas metsasuse, SMI metoodika, juurdekasvu, raiemahu, Metsaregistri, metsateatise, kaitse, elurikkuse ja kliimariskide küsimused. Iga numbriline vastus peab säilitama aasta, ühiku, definitsiooni ning asjakohase ebakindluse.

Materjal on `prototype_research_reviewed_not_kaur_approved`: tehniliselt kontrollitud praktikakorpus, mitte Keskkonnaagentuuri sisuline kinnitus. Enne tootmiskasutust peab sisuekspert versiooni kinnitama.

## Avalikult ligipääsetavad runtime-ühendused

### Ametlikud avaandmeteenused

| Liides | Kasutus |
|---|---|
| `gsavalik.envir.ee/geoserver/kataster/wfs` | Valideeritud katastritunnuse kehtiv üksus, pindala, aadress ja sihtotstarve |
| `gsavalik.envir.ee/geoserver/metsaregister/wfs` | Sama tunnuse avalikud metsaeraldise kirjed, pindalad ja inventeerimiskuupäevad |

Maa- ja Ruumiameti teenus on tasuta avalik teenus, kuid selle väljavõte on kasutustingimuste järgi informatiivne ja mitteametlik.

### Portaali avalikud veebiliidesed ja algallikad

| Ühendus | Kasutus |
|---|---|
| `keskkonnaportaal.ee/et/search?search_api_fulltext=...` | Portaali värske sisu avastamise fallback |
| `keskkonnaportaal.ee/et/search_api_autocomplete/kem_kkp_search` | Täiendavad puhastatud soovitused pärast enda FAQ-sid |
| `search.service.eu-live.vportal.ee/v1/search/keskkonnaamet` | Keskkonnaameti ametliku veebisisu relevantsusjärjestusega täistekstiotsing |
| `search.service.eu-live.vportal.ee/v1/search/keskkonnaagentuur` | Keskkonnaagentuuri ametliku veebisisu täistekstiotsing |
| `search.service.eu-live.vportal.ee/v1/search/kliimamin` | Kliimaministeeriumi ametliku veebisisu täistekstiotsing |
| Keskkonnaportaali ja teiste ametiasutuste HTTPS-lehed/PDF-id | Vastuse kontrollitavad algallikad |

Keskkonnaportaali Drupali otsa ei käsitleta versioonitud lepingulise API-na. Päringud on ajapiiranguga, vastusemaht on piiratud, tulemused puhverdatakse ning tõrke korral kasutatakse stale-if-error väärtust.

### Eraldatud veebirakendus

`terrapoint.ee` töötab ainult täisrakenduse iframe'ina. See ei ole riigi avaandmeteenus ega üldotsingu andmeallikas.

### Kontrollitud andmeteenused ja järgmised tüübikindlad adapterid

Uuringu käigus kontrollitud ametlikud algallikad on lisatud 30 kirjega suunamiskataloogi. Toorarvude automaatne vastamine ootab iga teenuse kohta tüübikindlat adapterit:

- KAUR PostgREST `https://keskkonnaandmed.envir.ee/` kliima- ja seireandmetele;
- EELIS avalikud JSON-jaotused ning KAUR GeoServeri WFS kaitse-, Natura-, vääriselupaiga ja Metsaregistri andmetele;
- Maa- ja Ruumiameti AKS WFS aadressi- ja katastriotsingule;
- Statistikaameti PXWeb tabelid `MM03` ja `MM04`; neid ei tohi kokku segada, sest esimene kirjeldab SMI raiemahu hinnangut ja teine metsateatiste statistikat;
- Riigi Teataja kuupäevastatud API õiguslikele küsimustele.

Ruumipäringu kolm kohustuslikku olekut on `leitud`, `eduka päringu tulemusel ei leitud` ja `allikas ei vastanud`. Timeout või 504 ei tohi kunagi muutuda väiteks, et piirangut või metsa ei ole.

## Terrapointi integratsioon

Avaleht manustab `https://terrapoint.ee/` tervikuna. Praktikaportaali CSP lubab frame'ida ainult Terrapointi ning Terrapoint lubab oma `frame-ancestors` loendis praktikadomeeni.

Terrapointi desktop-autofookus on top-level aknaga piiratud: iseseisval lehel võib otsing saada fookuse, iframe'is mitte. Vana `/embed/terrapoint` ja piiratud proxy-route'id on alles ainult tagasiühilduvuseks ning üldotsing neid ei kutsu.

## Kohalik käivitamine

Nõuded: Node.js 24 ja npm.

```bash
npm install
npm run build
PORT=4174 LLM_ENABLED=false SEARCH_CACHE_ENABLED=false npm start
```

Täiskeskkond Docker Compose'iga:

```bash
cp .env.example .env
# määra .env failis POSTGRES_PASSWORD ja soovi korral serveripoolne LLM-võti
docker compose up --build
```

Vaikimisi käivituvad veebirakendus ja PostgreSQL. Eksperimentaalse Qdranti konteineri saab eraldi käivitada käsuga `docker compose --profile experimental-vector up`, kuid rakenduse praegune otsing seda ei kasuta.

## Coolify seadistus

- build pack: **Dockerfile**;
- sisemine port: `3000`;
- health check: `/api/health`;
- domeen: `https://praktika.arleserver.cfd`;
- `PUBLIC_ORIGIN=https://praktika.arleserver.cfd`;
- projektile eraldatud `DATABASE_URL`;
- valikuline serverisaladus `OPENCODE_GO_API_KEY`;
- `LLM_ENABLED=true|false` ja `SEARCH_CACHE_ENABLED=true|false`.

Coolify tokenit, SSH privaatvõtit ega mudelivõtit ei tohi panna reposse, brauserikoodi, dokumentatsiooni või logidesse. Deploy-võti peab olema projektipõhine ja minimaalse õigusega.

## Turve ja privaatsus

- Otsingul on üldisest API-st rangem IP-põhine piirang.
- Päringu pikkus, URL-id, allikate hostid, response size ja redirect'id valideeritakse serveris.
- Avalik `/api/health` on minimaalne ega paljasta teenuseid või pakkujaid.
- LLM-võti ei jõua brauserisse; mudel saab ainult avaliku küsimuse ja valitud avalikud tõendid.
- Otsingulogi ei säilita kasutaja toorpäringut. Ka vahemällu salvestatavast JSON-ist eemaldatakse `query`, aegunud vahemäluread kustutatakse ning varasemad toorpäringud redigeeritakse skeemimigratsiooniga.
- Degradeerunud portaali- või ruumivastust ei salvestata tunniajase kvaliteetvastusena, et järgmine päring saaks taastunud allikaid uuesti proovida.
- PostgreSQL-i transaktsioon kasutab ühte reserveeritud klienti ning SQL on parameeterdatud.
- Veebikonteiner töötab mitte-root kasutajana, read-only failisüsteemiga, `no-new-privileges` režiimis ja piiratud logirotatsiooniga.
- Rakendus ei renderda mudeli või allikate toorest HTML-i.

## Testid ja väljalaskekontroll

```bash
npm test
npm run build
npm run test:sites
docker compose config
```

Automaattestid kontrollivad muu hulgas:

- 13 allikat, 21 dokumenti, 18 FAQ teemat ja 12 väärarusaama;
- 30 allikaga üldkataloog ning 51 päringuga külmutatud keskkonnaotsingu routing-komplekt;
- külmutatud v2 hindamiskomplekti 30/30 vastatava päringu õiget intent-vastust ja Recall@3 väärtust 100%;
- `mets` päris sünteesi, täpset FAQ vastust ja turvalist abstention'it;
- raiemahu/juurdekasvu vastuse aastaid, ühikuid ja piiranguid;
- mudelivastuse viidete, arvude, ühikute, väitekatvuse ja polaarsuse kontrolli;
- 15 sekundi globaalse vastusepiiri kontrollitud fallback'i ning vahemälu toorpäringu eemaldamist;
- Terrapointi ning infrastruktuurijargooni puudumist üldotsingu payload'ist ja UI-st;
- kuni viit sisulist autocomplete-soovitust;
- Sites-buildi lepingut.

Brauseri regression peab katma 1440 × 1100 ja 390 × 844 vaated, autocomplete'i kihistuse, klaviatuurikäitumise, mobiili esimest vaadet, kompaktset otsingulehte, allikate avamist, horisontaalse overflow puudumist ning avaliku iframe'i fookuse/scroll'i kontrolli.

17.08.2026 avalik vastuvõtutest tehti puhta Playwrighti sessiooniga otse aadressil `https://praktika.arleserver.cfd`, mitte localhostis. Vaadetes 390 × 844 ja 1440 × 1100 fokusseeris päise nupp ainsa portaaliotsingu. Päring „Kas Eestis tohib vanu rehve põletada?” sisestati ja esitati UI kaudu; leht renderdas viidatud „AI koondvastuse”, tulemuse pealkiri sai fookuse ning viide avas õige Keskkonnaameti allikakaardi. Päring „Kuidas valida kassile toitu?” renderdas ilma allikateta ulatuse selgituse ega koostanud juhuslikku vastust. Terrapointi iframe'is olid nähtavad selle otsing, kaart ja juhtnupud. Mõlemas vaates puudusid horisontaalne overflow ja brauserikonsooli vead; viite 4 avamine laiendas viiest allikast koosneva loendi ja fokusseeris `source-4` elemendi.

## Olulisemad failid

```text
server/forestry.mjs                     teadmiste laadimine, valideerimine ja hübriidotsing
server/knowledge/forestry/sources.json ametlik allikaregister
server/knowledge/forestry/documents.json struktureeritud vastused
server/integrations.mjs                 portaali discovery ja ametliku täislehe lugemine
docs/ALLIKAD.md                         kontrollitud allikate, API-de ja piirangute register
server/cadastre.mjs                     ametliku katastri ja Metsaregistri WFS-vastus
server/pipeline.mjs                     intent, retrieval, vastus ja cache
server/llm.mjs                          valikuline, viiteid säilitav sõnastuskiht
server/database.mjs                     PostgreSQL-i cache ja sisemine logi
server/index.mjs                        API, turvapäised ja tervisekontroll
src/App.jsx                             vaated ja ligipääsetavad otsinguvood
src/styles.css                          responsive visuaalne süsteem
tests/                                  automaattestid
compose.yaml                            Docker Compose keskkond
design-qa.md                            enne/pärast brauseritõendid
```

## Piirangud ja järgmine etapp

- Keskkonnaportaali HTML-otsing on dokumenteerimata fallback ning parser vajab portaali markup'i muutumisel uuendamist. Kolm Valitsusportaali JSON-indeksit vähendavad sellest sõltuvust, kuid ei ole versioonitud avalik leping.
- Väljaspool metsateemat sõltub sisuline koondvastus ametliku liitotsingu tõendikattest. Nõrk vaste annab täpsustuse või abstention'i; uued arvulised vertikaalid tuleb lisada struktureeritud väidete, ametliku API-adapteri ja eval-komplektiga.
- Väline LLM võib olla rate limit'i taga; see ei mõjuta kontrollitud metsavastuste saadavust ning portaalipäring langeb kontrollitud baasvastusele tagasi.
- Terrapointi iframe sõltub mõlema domeeni CSP-st ja selle väliste ametlike teenuste saadavusest.
