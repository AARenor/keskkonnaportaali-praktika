# Keskkonnaportaali praktikaprojekt

Tootmise vastuvõtukriteeriumide, andmevoo, marsruutide ja koodikaardi detailne register on failis [`acceptance-evidence.md`](./acceptance-evidence.md). Otsingu andmetöötluse kasutajale suunatud piir on failis [`PRIVAATSUS.md`](./PRIVAATSUS.md).

## Eesmärk

See on Keskkonnaportaali eraldiseisev praktikaversioon aadressil [praktika.arleserver.cfd](https://praktika.arleserver.cfd). Avaleht kasutab Keskkonnaportaali tuttavat visuaalset keelt ja lisab kaks selgelt eraldatud kasutusvoogu:

1. **Allikapõhine küsimus-vastus otsing.** Kasutaja saab vastuse esmalt, iga väite juures on nummerdatud viited ning vastuse järel ametlikud algallikad.
2. **Terrapointi täisrakendus.** Avalehe eraldi jaotises töötab `terrapoint.ee` iframe. Terrapoint ei osale üldotsingu vastuste koostamises ega ilmu selle allikatesse.

Projekt on märgitud praktikaprojektiks ja saadab `noindex` juhise. See ei ole Keskkonnaportaali ametlik tootmiskeskkond.

## Kasutajakogemus

- Avalehe põhiotsing on nähtav kohe nii töölaual kui ka mobiili esimeses vaates. Mobiilipäise otsinguikoon viib fookuse samasse vormi ega loo DOM-i teist otsingukasti.
- Autocomplete pakub kuni viis sisulist küsimust ning toetab klaviatuuri, hiirt ja puutetundlikku ekraani.
- Otsingutulemus näitab esmalt lühikest vastust koos allika nime kandvate tekstisiseste viidetega ning kohe selle järel lehekülgede kaupa „Otsingutulemused”. Mahukamad viidatud allikakaardid asuvad tulemuste järel, et nendeni ei peaks enne tavaotsingu tulemusi kerima. Mõlemad vaated lähtuvad samast filtreeritud ja järjestatud tulemusehulgast; filtri muutmine koostab ka vastuse uuesti.
- Iga filtriväli on teadlikult ühe valikuga. Eri väljade valikud ühendatakse `AND`-ina (näiteks `official` + „Ametlik juhend” + 2025); sama välja sees mitmikvaliku `OR`-semantikat UI ei paku.
- Relevantsus on esmane järjestussignaal. Ametlikkus, tõendi täielikkus ja tegelik avaldamiskuupäev täpsustavad võrreldavaid vasteid; tulevikukuupäev ei saa värskusboonust.
- Vastuse all saab esitada kuni neli jätkuküsimust. Iga voor teeb uue tõendiotsingu; varasem vestlus aitab ainult mõtet täpsustada ega muutu tõendiks.
- Avalikus kasutajaliideses ega API vastuses ei näidata mudeli, andmebaasi, vektorindeksi, fallback'i või ühenduste tehnilisi olekuid.
- Terrapointi iframe ei tohi lehte esmakordsel laadimisel enda juurde kerida ega hostrakenduselt fookust võtta.

## Arhitektuur

| Kiht | Lahendus | Vastutus |
|---|---|---|
| Kasutajaliides | React 19 + Vite | Responsive avaleht, ligipääsetav otsing, vastus ja allikad, Terrapointi iframe |
| Rakendusserver | Node.js + Express | Staatika, avalik API, turvapäised, rate limit ja päringu orkestreerimine |
| Metsa regressioonikorpus | Versioonitud JSON-korpus | 21 läbi vaadatud vastusedokumenti, 18 FAQ teemat, 12 väärarusaama ja 16 ametlikku algallikat; eval- ja võrdlusmaterjal, mitte primaarvastuse otsetee |
| Otsing | Eesti relevantsusjärjestaja | Tüve- ja intent-laiendus, pealkirja/kokkuvõtte/lõigu kate, fraasilähedus, autoriteet ja ajakohasus |
| Lai sisukorpus | PostgreSQL FTS + `pg_trgm` | 8407 sitemapilehte, 6057 portaali otsingukaarti, valitud puhastatud täistekstid, täpsed päringusnapshot'id ja kureeritud taustallikad |
| Värske sisu | Ametlik liitotsing + tüübikindlad andmeadapterid | Keskkonnaportaali, Keskkonnaameti, Keskkonnaagentuuri ja Kliimaministeeriumi sisu paralleelne avastamine, puhastatud täistekst ning konkreetsete näitajate ametlik masinloetav väärtus |
| Ruumipäring | Avalik kataster + Metsaregistri WFS | Valideeritud katastritunnuse informatiivne pindala ja metsaeraldiste hetkeseis otse avalikust teenusest |
| Vastuse koostamine | Sama järjestatud tulemusehulk + `gpt-5.6-luna` | Luna sõnastab nähtavate ametlike tulemuste põhjal otsese vastuse; server kontrollib viited, väited ja küsimusele vastamise ning tõrke korral kuvab sama värske allika viidatud väljavõtte või ausa abstention'i |
| Andmebaas | Eraldatud PostgreSQL | Korpus ja hübriidotsing, versioonitud vastusepuhver ning privaatsust hoidev tehniline sündmuslogi |
| Terrapoint | Eraldi iframe | Kogu Terrapointi UI, kaart ja sealsed avalikud integratsioonid; üldotsingust lahus |
| Pakendamine | Dockerfile + Compose | Mitte-root image; Compose'is read-only veebikonteiner ja eraldatud PostgreSQL |
| Deploy | Coolify | Docker-build, tervisekontroll, HTTPS ja `praktika.arleserver.cfd` |

### Miks Redis ei ole praegu lisatud?

Rakendusel on üks veebireplika ning PostgreSQL annab juba püsiva vastusepuhvri. Bounded in-memory puhvrid katavad lühikesed korduspäringud. Redis lisaks praegu hooldus- ja rikkepinda ilma mõõdetava kasutegurita. See muutub põhjendatuks mitme replika, hajutatud rate limit'i, tööjärjekorra või instantsideülese single-flight vajaduse korral.

### Qdranti roll

Senine 256-mõõtmeline räsivektor ei olnud semantiline embedding ja Qdranti kirjutamine iga kasutajapäringu ajal ei parandanud otsingukvaliteeti. Qdrant on seetõttu eemaldatud päringu hot path'ist. Compose'is on see alles ainult valikulise `experimental-vector` profiilina, kuni olemas on päris mitmekeelne embedding, versioonitud eeltöötlus ja evalidega tõestatud kvaliteedivõit.

## Otsingu tööpõhimõte

Brauseri põhivoog kasutab NDJSON-endpointi `POST /api/search/stream`, kus küsimus on JSON-kehas. Server saadab järjest `results`, vajaduse korral `draft` ja täpselt ühe terminalse `answer` sündmuse: lai tulemuste loend ilmub enne aeglasemat AI-sõnastust ning turvaline esialgne vastus säilib ka siis, kui lõplik voog katkeb. `POST /api/search` jääb sama lõppvastuse JSON-liideseks ja `POST /api/search/results` lehitseb tulemusi AI-d uuesti käivitamata. GET on ainult dokumenteeritud programmiliidese ühilduvuseks; brauser seda ei kasuta.

1. Päring normaliseeritakse ning klassifitseeritakse deterministlikult olekusse `answerable`, `needs-clarification`, `live-weather`, `live-air` või `out-of-scope`. Jooksva ilma ja õhukvaliteedi päring suunatakse ametlikku reaalaja teenusesse, mitte vana artikli sünteesi. Prompt-injection'i korral mudelit ei kutsuta.
2. PostgreSQL-i kandidaadid, tasuta ametlikud Valitsusportaali otsinguliidesed ja päringule sobivad tüübikindlad andmeadapterid käivitatakse paralleelselt. Eesti intent-laiendus teeb vajadusel kuni kolm kitsast alamotsingut, näiteks `raiuda tulevikus` või `mets vanus`. Metsapindala küsimus säilitab eraldi kvantitatiivse intenti ning nõuab samas lõigus metsamaa mõistet, arvu ja ühikut; SMI/metsaandmete võrdlus nõuab SMI ja Metsaregistri või muu metsaandmeallika eri rolli sisulist kirjeldust, mitte lihtsalt mõlema märksõna esinemist. Vajalikud ametlikud SMI, Metsainfo ja Metsaregistri lehed on lisaks live-otsingule hooldatud teenusekataloogis, et aeglane avastus ei sunniks üldise metsaartikliga vastama. Olmejäätmete ringlussevõtu määra adapter loeb küsitud aasta väärtuse portaali ametliku Tableau vaate CSV-väljundist. Raiemahu ja netojuurdekasvu võrdlus kasutab Eurostati `for_vol_efa` JSON-stat rida ning KAURi metoodika- ja SMI-allikaid; vastus eristab EFA `removals`-näitajat ühe aasta SMI raiemahust, säilitab puuduva aasta, `i`/`e` kvaliteedilipud ja ühiku „m³ koorega”.
3. URL-id kanoniseeritakse ja duplikaadid ühendatakse. Mitme mõiste korral peab PostgreSQL-i kandidaat katma kõik mõisterühmad (`AND`), kuid sama mõiste käänded ja sünonüümid on rühma sees alternatiivid (`OR`). Server rakendab allika-, sisutüübi- ja aastafiltrid ning järjestab tulemused kõigepealt päringu tegeliku katvuse, seejärel autoriteedi, täielikkuse ja värskuse järgi.
   Lehitsemisel arvutatakse sama 50 tugevaima kohaliku ja live-kandidaadi järjestatud prefiks igal lehel uuesti; sügavam saba küsitakse PostgreSQL-ist sama prefiksi URL-e välistades. Nii ei kordu üks tulemus eri lehtedel isegi siis, kui live-allikad liituvad kohaliku korpusega.
4. AI tõendid valitakse ainult selle sama nähtava ja filtreeritud tulemuselehe ametlikest kirjetest. Vana metsakorpus ei saa värskest otsingust mööda minna; seetõttu kasutab vastus uusimat päriselt avaldatud allikat, mitte lihtsalt kunagist eelkirjutatud SMI vastust. Vastuse jaoks saab valida kuni kümme eri allikat, kuid allikate rohkus ei tõsta üldist kataloogilehte otsese mõõtmise või metoodikalehe ette.
5. Kuni kümne valitud ametliku lehe täistekst hüdrateeritakse serveris, kui ühine ajapiir seda lubab. Igast allikast valitakse päringu mõisteid, mõõtmisi ja definitsioone kõige paremini katvad lõigud; Luna tõendipakk on kuni 36 000 märki ja kuni 4 000 märki allika kohta. Toorest HTML-i ei renderdata ning täistekst ja sisemised skoorid ei jõua avalikku API-sse.
6. Tõendivärav nõuab, et vähemalt üks tegelik pealkiri, kokkuvõte või täistekstilõik kataks küsimuse põhitingimused ja küsitud aasta. Käsitsi lisatud silt või eri artiklitest juhuslikult kokku saadud märksõnad ei anna AI-le vastamisõigust.
7. OpenCode Go `gpt-5.6-luna` töötab Responses API range JSON Schema kaudu kuni 3 200 väljundtokeniga. Mudel alustab järeldusest ja võib piisava tõendi korral anda kuni viis sisulist täpsustust. Iga sisuline väide vajab lubatud viidet; arvud, ühikud, aastad, väitekatvus, polaarsus ja esimese lause vastavus küsitud intentile valideeritakse mudelist sõltumatult. Valideerimisvea korral mahub ühisesse eelarvesse üks kontrollitud korduskatse.
8. Valideeritud katastritunnuse korral kasutatakse eraldi Maa- ja Ruumiameti ning Metsaregistri WFS-voogu, mis eristab olekuid „leitud”, „ei leitud” ja „allikas ei vastanud”.
9. Jätkuküsimus teeb uue ühendotsingu ja uue viidatud vastuse. Iseseisev sisuline jätkuküsimus otsitakse eraldi; ainult „aga miks?” laadne elliptiline küsimus pärib juurküsimuse ja viimase vooru otsingukonteksti. Kuni kolme varasema küsimuse tekst võib mudelile mõtet selgitada, kuid ei muutu tõendiks.
10. 429, timeout, vigane mudelivastus või nõrk tõend ei muutu väljamõeldud vastuseks. Esimese tulemusefaasi ülempiir streamis on 3,5 sekundit ning kogu progressiivse vastuse ja iga jätkuvooru ühine ülempiir 15 sekundit. Vana kõik-korraga JSON-liides jätab võrgule varu ja lõpeb hiljemalt 12 sekundiga. PostgreSQL-i päringu ja statement'i vaikimisi piir on 4 sekundit. Korraga sünteesitakse kuni kaheksa täismahus otsingut ning mõõdetud Luna piir on kaks paralleelset mudelikutsungit; ülejäänud otsingud ei jää mudelijärjekorda, vaid tagastavad kontrollitud capacity-fallback'i või sama tõendi koondvastuse.

Vahemälu võti sisaldab vastuse- ja retrieval-skeemi revisjoni ning jooksva järjestatud tulemusehulga URL-ide, järjekorra, metaandmete ja sisuversioonide sõrmejälge. Allika uuendamine, eemaldamine või tombstone muudab võtit; lisaks kontrollitakse cache-hit'il, et iga viidatud URL kuulub endiselt nähtavasse tulemusehulka. Päringu osa võtmes on `SEARCH_HASH_SECRET`-iga HMAC-SHA-256, mitte sõnastikuründega proovitav lihtne räsi. Seega ei saa vana Terrapointi, eelkirjutatud metsakorpuse või varasema tulemuselepingu vastus pärast deploy'd ega allikamuutust edasi elada.

### AI tõendileping ja tagasilükkamise semantika

Mudeli kasutamine ei anna päringule vastamisõigust. Mudel kutsutakse ainult siis, kui serveri deterministlik tõendivärav on märkinud vähemalt ühe ametliku dokumendi sama päringu jaoks piisavalt tugevaks. Mudelile saadetakse üksnes selle päringu piiratud tõendipakk (`summary`, kontrollitud väide ja/või puhastatud ametliku lehe sisu); mudelil ei ole selles voos veebi-, andmebaasi- ega tööriistajuurdepääsu. Tõenditekst on sisendandmed, mitte juhis, ning selles leiduvat käsku ei täideta.

Mudeli väljund ei lähe otse kasutajale. Server kontrollib enne avaldamist, et:

- iga muudetud väide viitaks kuvatud allikanumbrile;
- väites olev arv, aasta ja ühik esineksid just viidatud allika tõendis, mitte mõnes teises allikas;
- väite sisulistel sõnadel oleks piisav kattuvus viidatud tõendiga;
- eitus, lubamine/keelamine ning kasvu või languse suund ei pöörduks vastupidiseks;
- vastuse esimene väide kataks kasutaja küsitud objekti, näitaja ja muutuse suuna, mitte üksnes mõne tõendatud kõrvalfakti;
- pealkiri ja usaldusmärkus jääksid deterministlikust algvastusest, mitte mudelist.

Kontrolli ebaõnnestumine ei lisa vastusele hoiatust ega lase vigast teksti läbi. Vigane lõik eemaldatakse; vigase sissejuhatuse asemel säilib deterministlik algtekst. Kui ükski mudeli väide kontrolli ei läbi, käsitletakse mudelikatset ebaõnnestununa (`answer: null`). Kui ühises ajapiiris tehtud korduskatse samuti ebaõnnestub, tagastab pipeline ausa algvastuse. Sama juhtub vigase JSON-i, 429 või timeout'i korral.

Deterministlik fallback tähendab üht kolmest selgelt piiritletud liigist:

1. sama päringu esimese tugeva ametliku allika kõige otsesem lühike tekstilõik koos viitega; kui sellist lõiku ei ole, nähtavad allikakaardid ja aus abstention;
2. eelkirjutatud reaalaja-suunamine, katastrivastus, täpsustusküsimus või ulatusest loobumine;
3. globaalse ajapiiri korral eelkirjutatud teade ja juba leitud asjakohased allikakaardid, mitte uus genereeritud faktivastus.

Sõna „kontrollitud” tähendab siin praktikaprojekti tehnilist kontrolli, mitte Keskkonnaagentuuri sisueksperdi kinnitust. Dünaamilise allika viite lubamiseks peab URL jääma `server/integrations.mjs` ametlike HTTPS-hostide lubatud nimekirja ka pärast ümbersuunamist. Lause ja viite temaatilist seost kontrollitakse viidatud tõendi, mitte kogu vastuse vastu. Autoriteetne allikate ja API-de register on `docs/ALLIKAD.md`; runtime'i kataloog on `server/search.mjs` ning metsakorpuse register `server/knowledge/forestry/sources.json`.

## Regressiooni- ja võrdluskorpus

Failid asuvad kaustas `server/knowledge/forestry/`:

- `sources.json` — 16 ametlikku algallikat koos väljaandja, URL-i, kuupäeva ja kasutuspiirangutega;
- `documents.json` — 21 struktureeritud vastust koos aliaste, metoodika, piirangute, väitetüübi ja täpse allikakohaga.

Korpus katab muu hulgas metsasuse, SMI metoodika, juurdekasvu, raiemahu, Metsaregistri, metsateatise, kaitse, elurikkuse ja kliimariskide küsimused. Seda kasutatakse regressioonitestides, terminite ja soovituste kontrollis ning uue dünaamilise järjestaja võrdlusalusena. Primaarne `/api/search` ei tagasta neid dokumente otse ega kasuta nende eelkirjutatud vastuseid värske otsingu asemel.

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
| `keskkonnaportaal.ee/sitemap.xml` | 8407 avaliku lehe korpuse avastamine ja muutmisajad |
| `keskkonnaportaal.ee/et/search_api_autocomplete/kem_kkp_search` | Täiendavad puhastatud soovitused pärast enda FAQ-sid |
| `et.wikipedia.org/w/api.php` | Kaheksa kureeritud mõisteartikli täistekst; ainult täiendav taustatase |
| `search.service.eu-live.vportal.ee/v1/search/keskkonnaamet` | Keskkonnaameti ametliku veebisisu relevantsusjärjestusega täistekstiotsing |
| `search.service.eu-live.vportal.ee/v1/search/keskkonnaagentuur` | Keskkonnaagentuuri ametliku veebisisu täistekstiotsing |
| `search.service.eu-live.vportal.ee/v1/search/kliimamin` | Kliimaministeeriumi ametliku veebisisu täistekstiotsing |
| `tableau.envir.ee/.../OlmejtmeteringlussevttEestijaEuroopaLiit.csv` | Olmejäätmete ringlussevõtu määra küsitud aasta tüübikindel Eesti/EL väärtus; viide näitab inimesele portaali näitajalehte ja `locator` täpset CSV-vaadet |
| Keskkonnaportaali ja teiste ametiasutuste HTTPS-lehed/PDF-id | Vastuse kontrollitavad algallikad |

Keskkonnaportaali Drupali otsa ei käsitleta versioonitud lepingulise API-na. Päringud on ajapiiranguga, vastusemaht on piiratud, tulemused puhverdatakse ning tõrke korral kasutatakse stale-if-error väärtust.

### Eraldatud veebirakendus

`terrapoint.ee` töötab ainult täisrakenduse iframe'ina. See ei ole riigi avaandmeteenus ega üldotsingu andmeallikas.

### Kontrollitud andmeteenused ja järgmised tüübikindlad adapterid

Uuringu käigus kontrollitud ametlikud algallikad on lisatud 48 kirjega suunamiskataloogi. Esimene toorarvu adapter (`server/indicators.mjs`) katab olmejäätmete ringlussevõtu määra. Järgmised teenused vajavad enne automaatset arvvastust samasugust skeemi-, ühiku-, aasta- ja eval-kontrolliga adapterit:

- KAUR PostgREST `https://keskkonnaandmed.envir.ee/` kliima- ja seireandmetele;
- EELIS avalikud JSON-jaotused ning KAUR GeoServeri WFS kaitse-, Natura-, vääriselupaiga ja Metsaregistri andmetele;
- Maa- ja Ruumiameti AKS WFS aadressi- ja katastriotsingule;
- Statistikaameti PXWeb tabelid `MM03` ja `MM04`; neid ei tohi kokku segada, sest esimene kirjeldab SMI raiemahu hinnangut ja teine metsateatiste statistikat;
- Riigi Teataja kuupäevastatud API õiguslikele küsimustele.

Ruumipäringu kolm kohustuslikku olekut on `leitud`, `eduka päringu tulemusel ei leitud` ja `allikas ei vastanud`. Timeout või 504 ei tohi kunagi muutuda väiteks, et piirangut või metsa ei ole.

## Terrapointi integratsioon

Avaleht manustab `https://terrapoint.ee/` tervikuna. Praktikaportaali CSP lubab frame'ida ainult Terrapointi ning Terrapoint lubab oma `frame-ancestors` loendis praktikadomeeni.

Terrapointi desktop-autofookus on top-level aknaga piiratud: iseseisval lehel võib otsing saada fookuse, iframe'is mitte. Vana `/embed/terrapoint` ja piiratud proxy-route'id on alles ainult tagasiühilduvuseks ning üldotsing neid ei kutsu.

Täisrakenduse iframe ei kasuta teadlikult `sandbox` atribuuti, sest Terrapointi kaart, vormid ja selle enda ametlikud API-ühendused vajavad tavapärast rakenduse käitumist. Turvapiir on brauseri cross-origin same-origin policy, hosti kitsas CSP `frame-src https://terrapoint.ee`, range referrer policy ning kaamera, mikrofoni ja geolokatsiooni keelav `Permissions-Policy`. Praktikaserveri kaks vana proxy-route'i aktsepteerivad ainult fikseeritud Terrapointi upstream'i: aadress on pikkuspiiratud ja katastritunnus peab vastama täpsele formaadile; kasutaja ei saa anda serverile suvalist fetch-URL-i. Üldotsingu ja Luna kooditee neid route'e ei kutsu.

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
npm run sync:corpus -- --hydrate-limit=1000 --seed-queries=mets
```

Vaikimisi käivituvad veebirakendus ja PostgreSQL. Eksperimentaalse Qdranti konteineri saab eraldi käivitada käsuga `docker compose --profile experimental-vector up`, kuid rakenduse praegune otsing seda ei kasuta.

## Coolify seadistus

- build pack: **Dockerfile**;
- sisemine port: `3000`;
- Coolify konteineri readiness health check: `/api/health/container-readiness` iga sekundi järel, timeout 2 s ja üks ebaõnnestumine; avalik minimaalne olek jääb `/api/health`;
- domeen: `https://praktika.arleserver.cfd`;
- `PUBLIC_ORIGIN=https://praktika.arleserver.cfd`;
- projektile eraldatud `DATABASE_URL`;
- serverisaladus `OPENCODE_ZEN_API_KEY` või `OPENCODE_GO_API_KEY`;
- `LLM_MODEL=gpt-5.6-luna`, `LLM_API_STYLE=responses` ja `LLM_BASE_URL=https://opencode.ai/zen/go/v1`;
- `LLM_ENABLED=true|false` ja `SEARCH_CACHE_ENABLED=true|false`.
- vähemalt 32 juhusliku baidiga runtime-saladus `SEARCH_HASH_SECRET`; selle puudumisel kasutatakse ainult serveris olemasolevat `DATABASE_URL` saladust.
- `CORPUS_SYNC_ON_START=true`, `CORPUS_SYNC_INTERVAL_HOURS=24`, `CORPUS_SEED_QUERIES=mets` ja progressiivse täistekstipartii `CORPUS_STARTUP_HYDRATE_LIMIT=200`.

Coolify tokenit, SSH privaatvõtit ega mudelivõtit ei tohi panna reposse, brauserikoodi, dokumentatsiooni või logidesse. Deploy-võti peab olema projektipõhine ja minimaalse õigusega.

Coolify API-token ja GitHubi SSH deploy-võti on ainult haldus- ja juurutusvahendid. Veebikonteiner ei loe kumbagi runtime'is; otsing kasutab eraldi serverisaladust `OPENCODE_ZEN_API_KEY` või `OPENCODE_GO_API_KEY`. Seetõttu ei muuda haldusvõtmete rotatsioon sama image'i otsingu-, allika- ega AI-käitumist, kuid pärast rotatsiooni tuleb kinnitada, et Coolify saab endiselt repot lugeda ja juurutada.

Avaliku timeout-ahela kontroll 18.08.2026: rakendus piirab progressiivse otsingu 15 ja kõik-korraga JSON-liidese 12 sekundiga; fault-injection'i automaattest tõendab, et lõppematu operatsioon katkestatakse ning asendatakse deterministliku vastusega. Jooksva Coolify proxy Traefik 3.6.9 konfiguratsioon ei määra `responseHeaderTimeout` ega response `writeTimeout` väärtust üle; binaari tegelikud vaikeväärtused olid mõlemal `0`, mille Traefik ise kirjeldab kui timeout'i puudumist. Domeeni ees oleva Cloudflare'i [ametlik 524 dokumentatsioon](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/) määrab vaikimisi Proxy Read Timeout'iks 125 sekundit. Seega on rakenduse halvim vastusepiir 15 s väiksem kui avaliku edge'i 125 s piir ning Traefik ei katkesta vastuse ootamist enne rakenduse fallback'i.

## Turve ja privaatsus

- Otsingul on üldisest API-st rangem IP-põhine piirang.
- Päringu pikkus, URL-id, allikate hostid, response size ja redirect'id valideeritakse serveris.
- Avalik `/api/health` on minimaalne ega paljasta teenuseid või pakkujaid.
- LLM-võti ei jõua brauserisse; mudel saab ainult avaliku küsimuse ja valitud avalikud tõendid.
- Luna töötab välise OpenCode Go teenusena. Payload sisaldab küsimust, kuni kümne järjestatud avaliku allika päringupõhiselt valitud väljavõtteid (kokku kuni 36 000 märki), väljundskeemi ja jätkuvoorus kuni 1 400 märki varasemate küsimuste konteksti; kasutaja IP-d, küpsiseid, andmebaasilogi ega kogu korpust sinna ei lisata. Tehnilised privaatsustingimused asuvad kasutajaliideses ainult lehe jaluses. OpenCode'i [mudelipõhine privaatsustabel](https://opencode.ai/docs/go/#privacy) märgib Luna sisendi mudelitreeningus mittekasutatavaks, kuid abuse-monitoring'u logid võivad säilida kuni 30 päeva.
- Ametlikud live-otsingud näevad serveri päringut ja väljuvat IP-d. Terrapointi iframe on brauseri otseühendus: sinna sisestatud andmed lähevad Terrapointile, kuid praktikaportaali üldotsingu päringuid Terrapointile ei saadeta.
- Otsingulogi ei säilita kasutaja toorpäringut. Logi ja cache kasutavad võtmega HMAC-SHA-256 sõrmejälge; varasema lihtsa räsi read kustutatakse migratsiooniga. Ka vahemällu salvestatavast JSON-ist eemaldatakse `query`, aegunud vahemäluread kustutatakse ning UI saadab otsingu ja soovitused JSON POST-kehas: toorpäring ei lähe aadressiribale, lehe pealkirja ega püsivasse brauserisalvestusse; back/forward hoiab ainult läbipaistmatut protsessimälu ID-d.
- Degradeerunud portaali- või ruumivastust ei salvestata tunniajase kvaliteetvastusena, et järgmine päring saaks taastunud allikaid uuesti proovida.
- PostgreSQL-i transaktsioon kasutab ühte reserveeritud klienti ning SQL on parameeterdatud.
- Coolify runtime kasutab eraldi kasutajat `practice_user` ja andmebaasi `keskkonnaportaal_practice`; kontrollhetkel olid PostgreSQL-i `log_statement=none` ja `log_min_duration_statement=-1`, seega päringutekste serveri SQL-logisse ei kirjutatud.
- Päringusnapshot'i saab kirjutada ainult `configured-seed` päritoluga; avalik kasutajapäring ei kutsu snapshot'i kirjutusrada.
- Veebiimage töötab mitte-root `node` kasutajana. Compose lisab read-only failisüsteemi, `no-new-privileges` režiimi, piiratud `/tmp` tmpfs-i ja logirotatsiooni. Coolify Dockerfile-runtime kasutab `--cap-drop=ALL --init`; Coolify ei rakenda selles build pack'is `--read-only` valikut, kuid `/app` on root-omandis ja `node` kasutajale kirjutuskaitstud. Ajutised kirjutused jäävad `/tmp` alla.
- Rakendus ei renderda mudeli või allikate toorest HTML-i.

## Testid ja väljalaskekontroll

Relevantsusandmestike masinloetav provenance, eraldi päringu- ja qrel-hashid, mõõdikute definitsioonid ning ausad piirangud asuvad failis [`evaluation/relevance_evaluation_manifest_v1.json`](./evaluation/relevance_evaluation_manifest_v1.json). Testisviit arvutab hashid uuesti, kontrollib väravaid ja ebaõnnestub vaikse andmestikumuudatuse korral.

```bash
npm test
npm run build
npm run test:sites
docker compose config
npm run eval:holdout
npm run eval:blind
npm run eval:live -- --base-url=https://praktika.arleserver.cfd
npm run audit:filters -- --base-url=https://praktika.arleserver.cfd
npm run audit:followups -- --base-url=https://praktika.arleserver.cfd
npm run audit:grounding -- --base-url=https://praktika.arleserver.cfd
npm run audit:load -- --base-url=https://praktika.arleserver.cfd
npm run audit:load-results -- --base-url=https://praktika.arleserver.cfd
```

`audit:load-results` kontrollib eraldi tulemuste endpoint'i jagatud koormuspiiri. Tootmise
`SEARCH_MAX_CONCURRENCY=8` korral peavad 20 korraga alustatud päringust kaheksa tegema
täismahus töö ning 12 saama kontrollitud `429` capacity-vastuse koos `Retry-After: 2`
päisega; sama rate-limit akna 21. päring peab saama `429` ja `Retry-After: 60`.
Timeout, 5xx või teistsugune jaotus ebaõnnestab auditi.

Automaattestid kontrollivad muu hulgas:

- 16 allikaga regressioonikorpuse, 21 dokumendi, 18 FAQ teema ja 12 väärarusaama sisemise tervikluse;
- eraldiseisva tulemuste lehitsemise, korpuse parserid ja ametlike URL-aliaste deduplikatsiooni;
- fraasi- ja lõigukattega relevantsusjärjestuse, tegeliku avaldamisaja, tulevikukuupäeva karistuse ning allika-, tüübi- ja aastafiltrite jõustamise;
- 48 allikaga üldkataloog, 59 päringuga külmutatud routing-komplekt, 40 päringuga holdout ja 10 päringuga lukustatud post-fix regressioonikomplekt;
- 40 päringuga holdout'i P@1, MRR, nDCG@5 ja Recall@5 väravad ning sama komplekti URL-põhise live-kontrolli; andmevaliku tõenduspiir ja ühe binaarse qrel'i piirang on masinloetavas eval-manifestis;
- 24/24 teenusepäringu õige esimese allika nii deterministlikus järjestajas kui ka külma PostgreSQL-i vahemäluga päris HTTP-voos;
- külmutatud v2 hindamiskomplekti 30/30 vastatava päringu õiget intent-vastust ja Recall@3 väärtust 100%;
- `mets` päris sünteesi, täpset FAQ vastust ja turvalist abstention'it;
- raiemahu/netojuurdekasvu operaatorit, dünaamilist viie aasta akent, dense JSON-stat nullväärtusi, täpseid aastaid, kvaliteedilippe, ühikut „m³ koorega” ja bruto-/netomõiste lahusust;
- progressiivse `results → draft? → answer` protokolli fragmenteeritud pakette, suuruspiiri, terminalset lõppvastust ja katkenud voo turvalist säilitamist;
- mudelivastuse viidete, arvude, ühikute, väitekatvuse, polaarsuse ja tervikliku lauselõpu kontrolli;
- arvuliste ja võrdlevate väidete täpset tõendilauset, sealhulgas üksuse, aasta-väärtuse paari, mõõtühiku ja võrdluse osapoolte vahetamise keeldu;
- progressiivse voo 15 sekundi ja kõik-korraga JSON-liidese 12 sekundi vastusepiiri kontrollitud fallback'i ning vahemälu toorpäringu eemaldamist;
- kõigi nelja otsingutee ühist kaheksa töökoha piiri; listing-endpoint annab ülekoormusel kontrollitud `429` capacity-vastuse ega alusta piiramatut retrieval'it;
- deadline'i järel katastri-cache'i ja PostgreSQL-i tehingu rollback'i ning vana otsingu/autocomplete'i hilise vastuse blokeerimist;
- võtmega HMAC-sõrmejälge, vana liht-räsi migratsiooni ja allikate liikmelisuse, järjekorra või sisu muutumisel cache'i invalidatsiooni;
- kolme järjestikuse jätkuküsimuse filtri-, allika- ja viitelepingu püsimist;
- Terrapointi ning infrastruktuurijargooni puudumist üldotsingu payload'ist ja UI-st;
- kuni viit sisulist autocomplete-soovitust;
- Sites-buildi lepingut.

Brauseri regression peab katma 1440 × 1100 ja 390 × 844 vaated, autocomplete'i kihistuse, klaviatuurikäitumise, mobiili esimest vaadet, kompaktset otsingulehte, allikate avamist, horisontaalse overflow puudumist ning avaliku iframe'i fookuse/scroll'i kontrolli.

18.08.2026 enne progressiivse otsingu muudatust kontrollitud baseline oli commit `392687311f073bb43bd109df40afa6461c23bebe`, Coolify deployment `hvs6wvgz3g8ea7aq1jx4p5f6`. Avalik `/api/health` tagastas sama täispika revisjoni; konteiner oli `healthy`, restartide arv 0 ja kasutaja `node`. Live-eval sai 24/24 päringul oodatud esimese allika ja 1242/1242 avaliku lepingu kontrolli. Grounding-audit läbis 10/10 esinduslikku vastust, 10/10 adversariaalset loobumist, 14 väidet ja 17 allikaavamist. Filtrimaatriks läbis 210/210 ja juur + kolm jätkuküsimust 36/36 kontrolli. Ükski neist kontrollidest ei andnud 504. Jooksva väljalaske täpne revisjon on alati masina-loetavalt `/api/health` vastuses ja Coolify deployment-ajaloos, mitte käsitsi muudetavas dokumendiväljas.

20 samaaegset päringut andsid 20 HTTP 200 vastust: 11 allikapõhist fallback'i, 1 deterministlik marsruutvastus ja 8 selgelt märgitud capacity-fallback'i; timeout'e, 5xx-e ja 504-sid oli 0. P50 oli 8748 ms, p95 15 169 ms ja maksimum 15 333 ms. Pöörlevad `X-Forwarded-For` väärtused ei möödunud piirangust ning 21. päring sai 429 + `Retry-After: 60`. Eraldi täielikult võrguühenduseta 1 s rikketest andis 5/5 kontrollitud HTTP 200 vastust, maksimum 639 ms.

Vaadetes 1440 × 1000 ja 390 × 844 jäi värske avaleht `scrollY === 0` juurde, aktiivne element oli hostdokumendi `BODY`, põhiotsing oli nähtav ja horisontaalset overflow'd polnud. Terrapointi cross-origin iframe laadis päris `terrapoint.ee` rakenduse ega võtnud hostilt fookust. UI-päring „jäätmete ringlussevõtu määr Eestis 2023” kuvas 37,9% ja EL-i 47,9%, seadis sama ametliku näitaja nii vastuse esimeseks viiteks kui ka laiotsingu esimeseks tulemuseks, fokusseeris tulemuse H1 ning keris viiteklõpsul olemasoleva `source-1` kaardini. Deterministlik race-test tõendas lisaks, et 15,2 s hiline vana otsing ei muuda uuema vastuse pealkirja ega allika-DOM-i ning B→A järjekorras saabunud autocomplete'i vastustest jääb nähtavale ainult B. First-party konsoolis oli 0 viga ja 0 hoiatust.

Cache'i revisjon `answer-v15-stable-public-ids` seob vastuse jooksva järjestatud allikahulga, täpse andmelokaatori ja sisuversiooniga, et varasema järjestuse või muudetud allika vastus ei jääks pärast deploy'd kehtima. Live-allika ja PostgreSQL-i püsikoopia avalik ID tuletatakse kanoniseeritud URL-ist, mistõttu sama tulemus ei vaheta asünkroonse indekseerimise piiril identiteeti ega Reacti võtit.

## Olulisemad failid

```text
server/forestry.mjs                     ajaloolise võrdluskorpuse eval- ja soovitusmootor
server/knowledge/forestry/sources.json regressiooni allikaregister
server/knowledge/forestry/documents.json regressiooni struktureeritud vastused
server/integrations.mjs                 portaali discovery ja ametliku täislehe lugemine
server/indicators.mjs                   ametlike masinloetavate näitajate tüübikindlad adapterid
server/corpus.mjs                       PostgreSQL-i korpus, sitemap, MediaWiki ja lai otsing
server/sync-corpus.mjs                  käsitsi käivitatav korpuse sünkroniseerimine
docs/ALLIKAD.md                         kontrollitud allikate, API-de ja piirangute register
docs/ARHITEKTUUR.md                     portaali ja praktikalahenduse arhitektuuriuuring
server/cadastre.mjs                     ametliku katastri ja Metsaregistri WFS-vastus
server/pipeline.mjs                     intent, retrieval, vastus ja cache
server/retrieval.mjs                    ühendotsing, deduplikatsioon, filtrid ja relevantsusjärjestus
server/llm.mjs                          valikuline, viiteid säilitav sõnastuskiht
server/database.mjs                     PostgreSQL-i cache ja sisemine logi
server/index.mjs                        API, turvapäised ja tervisekontroll
src/App.jsx                             vaated ja ligipääsetavad otsinguvood
src/styles.css                          responsive visuaalne süsteem
tests/                                  automaattestid
compose.yaml                            Docker Compose keskkond
design-qa.md                            enne/pärast brauseritõendid
PRIVAATSUS.md                           otsingu ja välise Luna andmetöötluse piir
```

## Piirangud ja järgmine etapp

- Keskkonnaportaali HTML-otsing on dokumenteerimata fallback ning parser vajab portaali markup'i muutumisel uuendamist. Kolm Valitsusportaali JSON-indeksit vähendavad sellest sõltuvust, kuid ei ole versioonitud avalik leping.
- Väljaspool metsateemat sõltub sisuline koondvastus ametliku liitotsingu tõendikattest. Nõrk vaste annab täpsustuse või abstention'i; uued arvulised vertikaalid tuleb lisada struktureeritud väidete, ametliku API-adapteri ja eval-komplektiga.
- Väline Luna teenus võib olla rate limit'i taga; lai PostgreSQL-i ja ametlike veebide tulemuste loend jääb saadavaks ning faktide väljamõtlemise asemel kuvatakse aus allikaotsingu fallback.
- Terrapointi iframe sõltub mõlema domeeni CSP-st ja selle väliste ametlike teenuste saadavusest.
