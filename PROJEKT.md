# Keskkonnaportaali praktikaprojekt

## Eesmärk

See on Keskkonnaportaali eraldiseisev praktikaversioon aadressil [praktika.arleserver.cfd](https://praktika.arleserver.cfd). Avaleht kasutab Keskkonnaportaali tuttavat visuaalset keelt ja lisab kaks selgelt eraldatud kasutusvoogu:

1. **Allikapõhine küsimus-vastus otsing.** Kasutaja saab vastuse esmalt, iga väite juures on nummerdatud viited ning vastuse järel ametlikud algallikad.
2. **Terrapointi täisrakendus.** Avalehe eraldi jaotises töötab `terrapoint.ee` iframe. Terrapoint ei osale üldotsingu vastuste koostamises ega ilmu selle allikatesse.

Projekt on märgitud praktikaprojektiks ja saadab `noindex` juhise. See ei ole Keskkonnaportaali ametlik tootmiskeskkond.

## Kasutajakogemus

- Avalehe põhiotsing on nähtav kohe nii töölaual kui ka mobiili esimeses vaates. Mobiilipäise otsinguikoon viib fookuse samasse vormi ega loo DOM-i teist otsingukasti.
- Autocomplete pakub kuni viis sisulist küsimust ning toetab klaviatuuri, hiirt ja puutetundlikku ekraani.
- Otsingutulemus eristab kaks vaadet samast päringust: väike nummerdatud „Vastuse allikad” tõendikomplekt ja lehekülgede kaupa „Otsingutulemused”. Mõlemad läbivad sama allika-, sisutüübi-, aasta- ja järjestusfiltri; filtri muutmine koostab ka vastuse uuesti.
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
| Värske sisu | Nelja ametliku veebikogu liitotsing | Keskkonnaportaali, Keskkonnaameti, Keskkonnaagentuuri ja Kliimaministeeriumi sisu paralleelne avastamine ning puhastatud täistekst |
| Ruumipäring | Avalik kataster + Metsaregistri WFS | Valideeritud katastritunnuse informatiivne pindala ja metsaeraldiste hetkeseis otse avalikust teenusest |
| Vastuse koostamine | Sama järjestatud tulemusehulk + `gpt-5.6-luna` | Luna sõnastab nähtavate ametlike tulemuste põhjal otsese vastuse; server kontrollib viited, väited ja küsimusele vastamise ning tõrke korral kuvab sama värske allika viidatud väljavõtte või ausa abstention'i |
| Andmebaas | Eraldatud PostgreSQL | Korpus ja hübriidotsing, versioonitud vastusepuhver ning privaatsust hoidev tehniline sündmuslogi |
| Terrapoint | Eraldi iframe | Kogu Terrapointi UI, kaart ja sealsed avalikud integratsioonid; üldotsingust lahus |
| Pakendamine | Dockerfile + Compose | Mitte-root, read-only veebikonteiner ja eraldatud PostgreSQL |
| Deploy | Coolify | Docker-build, tervisekontroll, HTTPS ja `praktika.arleserver.cfd` |

### Miks Redis ei ole praegu lisatud?

Rakendusel on üks veebireplika ning PostgreSQL annab juba püsiva vastusepuhvri. Bounded in-memory puhvrid katavad lühikesed korduspäringud. Redis lisaks praegu hooldus- ja rikkepinda ilma mõõdetava kasutegurita. See muutub põhjendatuks mitme replika, hajutatud rate limit'i, tööjärjekorra või instantsideülese single-flight vajaduse korral.

### Qdranti roll

Senine 256-mõõtmeline räsivektor ei olnud semantiline embedding ja Qdranti kirjutamine iga kasutajapäringu ajal ei parandanud otsingukvaliteeti. Qdrant on seetõttu eemaldatud päringu hot path'ist. Compose'is on see alles ainult valikulise `experimental-vector` profiilina, kuni olemas on päris mitmekeelne embedding, versioonitud eeltöötlus ja evalidega tõestatud kvaliteedivõit.

## Otsingu tööpõhimõte

Vastuse ja esimese laia tulemuselehe endpoint on `GET /api/search?q=<küsimus>`. Ainult tulemuste järgmised lehed tulevad endpoint'ist `GET /api/search/results?q=<küsimus>&page=<n>`, mis ei genereeri AI vastust uuesti.

1. Päring normaliseeritakse ning klassifitseeritakse deterministlikult olekusse `answerable`, `needs-clarification`, `live-weather`, `live-air` või `out-of-scope`. Jooksva ilma ja õhukvaliteedi päring suunatakse ametlikku reaalaja teenusesse, mitte vana artikli sünteesi. Prompt-injection'i korral mudelit ei kutsuta.
2. PostgreSQL-i kandidaadid ja tasuta ametlikud Valitsusportaali otsinguliidesed käivitatakse paralleelselt. Eesti intent-laiendus teeb vajadusel kuni kolm kitsast alamotsingut, näiteks `raiuda tulevikus` või `mets vanus`.
3. URL-id kanoniseeritakse ja duplikaadid ühendatakse. Mitme mõiste korral peab PostgreSQL-i kandidaat katma kõik mõisterühmad (`AND`), kuid sama mõiste käänded ja sünonüümid on rühma sees alternatiivid (`OR`). Server rakendab allika-, sisutüübi- ja aastafiltrid ning järjestab tulemused kõigepealt päringu tegeliku katvuse, seejärel autoriteedi, täielikkuse ja värskuse järgi.
   Lehitsemisel arvutatakse sama 50 tugevaima kohaliku ja live-kandidaadi järjestatud prefiks igal lehel uuesti; sügavam saba küsitakse PostgreSQL-ist sama prefiksi URL-e välistades. Nii ei kordu üks tulemus eri lehtedel isegi siis, kui live-allikad liituvad kohaliku korpusega.
4. AI tõendid valitakse ainult selle sama nähtava ja filtreeritud tulemuselehe ametlikest kirjetest. Vana metsakorpus ei saa värskest otsingust mööda minna; seetõttu kasutab vastus uusimat päriselt avaldatud allikat, mitte lihtsalt kunagist eelkirjutatud SMI vastust.
5. Valitud ametlike lehtede täistekst hüdrateeritakse serveris, kui ühine ajapiir seda lubab. Toorest HTML-i ei renderdata ning täistekst ja sisemised skoorid ei jõua avalikku API-sse.
6. Tõendivärav nõuab, et vähemalt üks tegelik pealkiri, kokkuvõte või täistekstilõik kataks küsimuse põhitingimused ja küsitud aasta. Käsitsi lisatud silt või eri artiklitest juhuslikult kokku saadud märksõnad ei anna AI-le vastamisõigust.
7. OpenCode Go `gpt-5.6-luna` töötab Responses API range JSON Schema kaudu. Mudel alustab järeldusest ja pakub tõenditega seotud järgmisi küsimusi. Iga sisuline väide vajab lubatud viidet; arvud, ühikud, aastad, väitekatvus, polaarsus ja esimese lause vastavus küsitud intentile valideeritakse mudelist sõltumatult. Valideerimisvea korral mahub ühisesse eelarvesse üks kontrollitud korduskatse.
8. Valideeritud katastritunnuse korral kasutatakse eraldi Maa- ja Ruumiameti ning Metsaregistri WFS-voogu, mis eristab olekuid „leitud”, „ei leitud” ja „allikas ei vastanud”.
9. Jätkuküsimus teeb uue ühendotsingu ja uue viidatud vastuse. Iseseisev sisuline jätkuküsimus otsitakse eraldi; ainult „aga miks?” laadne elliptiline küsimus pärib juurküsimuse ja viimase vooru otsingukonteksti. Kuni kolme varasema küsimuse tekst võib mudelile mõtet selgitada, kuid ei muutu tõendiks.
10. 429, timeout, vigane mudelivastus või nõrk tõend ei muutu väljamõeldud vastuseks. Kogu esimese vastuse ja iga jätkuvooru ühine ülempiir on 15 sekundit.

Vahemälu võti sisaldab vastuse- ja retrieval-skeemi revisjoni, seega ei saa vana Terrapointi, eelkirjutatud metsakorpuse või varasema tulemuselepingu vastus pärast deploy'd edasi elada.

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
| Keskkonnaportaali ja teiste ametiasutuste HTTPS-lehed/PDF-id | Vastuse kontrollitavad algallikad |

Keskkonnaportaali Drupali otsa ei käsitleta versioonitud lepingulise API-na. Päringud on ajapiiranguga, vastusemaht on piiratud, tulemused puhverdatakse ning tõrke korral kasutatakse stale-if-error väärtust.

### Eraldatud veebirakendus

`terrapoint.ee` töötab ainult täisrakenduse iframe'ina. See ei ole riigi avaandmeteenus ega üldotsingu andmeallikas.

### Kontrollitud andmeteenused ja järgmised tüübikindlad adapterid

Uuringu käigus kontrollitud ametlikud algallikad on lisatud 43 kirjega suunamiskataloogi. Toorarvude automaatne vastamine ootab iga teenuse kohta tüübikindlat adapterit:

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
npm run sync:corpus -- --hydrate-limit=1000 --seed-queries=mets
```

Vaikimisi käivituvad veebirakendus ja PostgreSQL. Eksperimentaalse Qdranti konteineri saab eraldi käivitada käsuga `docker compose --profile experimental-vector up`, kuid rakenduse praegune otsing seda ei kasuta.

## Coolify seadistus

- build pack: **Dockerfile**;
- sisemine port: `3000`;
- health check: `/api/health`;
- domeen: `https://praktika.arleserver.cfd`;
- `PUBLIC_ORIGIN=https://praktika.arleserver.cfd`;
- projektile eraldatud `DATABASE_URL`;
- serverisaladus `OPENCODE_ZEN_API_KEY` või `OPENCODE_GO_API_KEY`;
- `LLM_MODEL=gpt-5.6-luna`, `LLM_API_STYLE=responses` ja `LLM_BASE_URL=https://opencode.ai/zen/go/v1`;
- `LLM_ENABLED=true|false` ja `SEARCH_CACHE_ENABLED=true|false`.
- `CORPUS_SYNC_ON_START=true`, `CORPUS_SYNC_INTERVAL_HOURS=24`, `CORPUS_SEED_QUERIES=mets` ja progressiivse täistekstipartii `CORPUS_STARTUP_HYDRATE_LIMIT=200`.

Coolify tokenit, SSH privaatvõtit ega mudelivõtit ei tohi panna reposse, brauserikoodi, dokumentatsiooni või logidesse. Deploy-võti peab olema projektipõhine ja minimaalse õigusega.

Coolify API-token ja GitHubi SSH deploy-võti on ainult haldus- ja juurutusvahendid. Veebikonteiner ei loe kumbagi runtime'is; otsing kasutab eraldi serverisaladust `OPENCODE_ZEN_API_KEY` või `OPENCODE_GO_API_KEY`. Seetõttu ei muuda haldusvõtmete rotatsioon sama image'i otsingu-, allika- ega AI-käitumist, kuid pärast rotatsiooni tuleb kinnitada, et Coolify saab endiselt repot lugeda ja juurutada.

Avaliku timeout-ahela kontroll 18.08.2026: rakendus piirab kogu otsingu 15 sekundiga ja fault-injection'i automaattest tõendab, et lõppematu operatsioon katkestatakse ning asendatakse deterministliku vastusega. Jooksva Coolify proxy Traefik 3.6.9 konfiguratsioon ei määra `responseHeaderTimeout` ega response `writeTimeout` väärtust üle; binaari tegelikud vaikeväärtused olid mõlemal `0`, mille Traefik ise kirjeldab kui timeout'i puudumist. Domeeni ees oleva Cloudflare'i [ametlik 524 dokumentatsioon](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/) määrab vaikimisi Proxy Read Timeout'iks 125 sekundit. Seega on rakenduse halvim vastusepiir 15 s väiksem kui avaliku edge'i 125 s piir ning Traefik ei katkesta vastuse ootamist enne rakenduse fallback'i.

## Turve ja privaatsus

- Otsingul on üldisest API-st rangem IP-põhine piirang.
- Päringu pikkus, URL-id, allikate hostid, response size ja redirect'id valideeritakse serveris.
- Avalik `/api/health` on minimaalne ega paljasta teenuseid või pakkujaid.
- LLM-võti ei jõua brauserisse; mudel saab ainult avaliku küsimuse ja valitud avalikud tõendid.
- Luna töötab välise OpenCode Go teenusena. Payload sisaldab küsimust, piiratud avalikku tõendipakki, väljundskeemi ja jätkuvoorus kuni 520 märki varasemate küsimuste konteksti; kasutaja IP-d, küpsiseid, andmebaasilogi ega kogu korpust sinna ei lisata. OpenCode'i [mudelipõhine privaatsustabel](https://opencode.ai/docs/go/#privacy) märgib Luna sisendi mudelitreeningus mittekasutatavaks, kuid abuse-monitoring'u logid võivad säilida kuni 30 päeva.
- Ametlikud live-otsingud näevad serveri päringut ja väljuvat IP-d. Terrapointi iframe on brauseri otseühendus: sinna sisestatud andmed lähevad Terrapointile, kuid praktikaportaali üldotsingu päringuid Terrapointile ei saadeta.
- Otsingulogi ei säilita kasutaja toorpäringut. Ka vahemällu salvestatavast JSON-ist eemaldatakse `query`, aegunud vahemäluread kustutatakse ning varasemad toorpäringud redigeeritakse skeemimigratsiooniga.
- Degradeerunud portaali- või ruumivastust ei salvestata tunniajase kvaliteetvastusena, et järgmine päring saaks taastunud allikaid uuesti proovida.
- PostgreSQL-i transaktsioon kasutab ühte reserveeritud klienti ning SQL on parameeterdatud.
- Coolify runtime kasutab eraldi kasutajat `practice_user` ja andmebaasi `keskkonnaportaal_practice`; kontrollhetkel olid PostgreSQL-i `log_statement=none` ja `log_min_duration_statement=-1`, seega päringutekste serveri SQL-logisse ei kirjutatud.
- Päringusnapshot'i saab kirjutada ainult `configured-seed` päritoluga; avalik kasutajapäring ei kutsu snapshot'i kirjutusrada.
- Veebikonteiner töötab mitte-root kasutajana, read-only failisüsteemiga, `no-new-privileges` režiimis ja piiratud logirotatsiooniga.
- Rakendus ei renderda mudeli või allikate toorest HTML-i.

## Testid ja väljalaskekontroll

```bash
npm test
npm run build
npm run test:sites
docker compose config
npm run eval:live -- --base-url=https://praktika.arleserver.cfd
```

Automaattestid kontrollivad muu hulgas:

- 16 allikaga regressioonikorpuse, 21 dokumendi, 18 FAQ teema ja 12 väärarusaama sisemise tervikluse;
- eraldiseisva tulemuste lehitsemise, korpuse parserid ja ametlike URL-aliaste deduplikatsiooni;
- fraasi- ja lõigukattega relevantsusjärjestuse, tegeliku avaldamisaja, tulevikukuupäeva karistuse ning allika-, tüübi- ja aastafiltrite jõustamise;
- 43 allikaga üldkataloog ning 54 päringuga külmutatud keskkonnaotsingu routing-komplekt;
- 19/19 teenusepäringu õige esimese allika nii deterministlikus järjestajas kui ka külma PostgreSQL-i vahemäluga päris HTTP-voos;
- külmutatud v2 hindamiskomplekti 30/30 vastatava päringu õiget intent-vastust ja Recall@3 väärtust 100%;
- `mets` päris sünteesi, täpset FAQ vastust ja turvalist abstention'it;
- raiemahu/juurdekasvu vastuse aastaid, ühikuid ja piiranguid;
- mudelivastuse viidete, arvude, ühikute, väitekatvuse, polaarsuse ja tervikliku lauselõpu kontrolli;
- 15 sekundi globaalse vastusepiiri kontrollitud fallback'i ning vahemälu toorpäringu eemaldamist;
- Terrapointi ning infrastruktuurijargooni puudumist üldotsingu payload'ist ja UI-st;
- kuni viit sisulist autocomplete-soovitust;
- Sites-buildi lepingut.

Brauseri regression peab katma 1440 × 1100 ja 390 × 844 vaated, autocomplete'i kihistuse, klaviatuurikäitumise, mobiili esimest vaadet, kompaktset otsingulehte, allikate avamist, horisontaalse overflow puudumist ning avaliku iframe'i fookuse/scroll'i kontrolli.

18.08.2026 avalik vastuvõtutest tehti commit'il `ee42516` puhaste Playwrighti sessioonidega otse aadressil `https://praktika.arleserver.cfd`, mitte localhostis. HTTPS tagastas 200, HTTP suunati 308-ga HTTPS-i, sertifikaat kattis `*.arleserver.cfd` ning healthcheck oli roheline. Külm live-eval sai 19/19 päringul oodatud esimese allika ja 1026/1026 avaliku lepingu, viite, filtratsiooni ning lause-tervikluse kontrolli; p50 oli 10,450 s ja p95/maksimum 14,136 s, 504 vastuseid oli 0.

Vaadetes 1440 × 1100 ja 390 × 844 jäi värske avaleht `scrollY === 0` juurde, aktiivne element oli hostdokumendi `BODY`, põhiotsing oli nähtav ja horisontaalset overflow'd polnud. Terrapointi cross-origin iframe laadis päris `terrapoint.ee` rakenduse, selle sisu ja neli sisendit ega võtnud hostilt fookust. UI-päring „jäätmete ringlussevõtu määr Eestis 2023” pani õigeks esimeseks tulemuseks olmejäätmete ringlussevõtu näitaja; peidetud viide 4 laiendas kaheksa allika loendi ja fokusseeris `source-4`. Mobiilil oli submit-nupp nimega, filtrid üheveerulised ja esimene loatulem KOTKAS. Mõlema sessiooni first-party konsoolis oli 0 viga ja 0 hoiatust.

Sama brauserikontroll avastas enne lõppversiooni ühe katkestatud Valitsusportaali snippet'ist pärinenud avalause. Parandus nõuab nüüd nii deterministlikult väljavõttelt kui ka mudeli intro/osa tekstilt lõpetatud lauset, lisab kaks regressioonitesti, tõstab cache'i revisiooni `answer-v10-complete-sentences` ning kontrollib sama omadust live-evalis. Pärast uut deploy'd lõppes sama 38% vastus terviklikult ja kogu avalik komplekt läbis korduskontrolli.

## Olulisemad failid

```text
server/forestry.mjs                     ajaloolise võrdluskorpuse eval- ja soovitusmootor
server/knowledge/forestry/sources.json regressiooni allikaregister
server/knowledge/forestry/documents.json regressiooni struktureeritud vastused
server/integrations.mjs                 portaali discovery ja ametliku täislehe lugemine
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
```

## Piirangud ja järgmine etapp

- Keskkonnaportaali HTML-otsing on dokumenteerimata fallback ning parser vajab portaali markup'i muutumisel uuendamist. Kolm Valitsusportaali JSON-indeksit vähendavad sellest sõltuvust, kuid ei ole versioonitud avalik leping.
- Väljaspool metsateemat sõltub sisuline koondvastus ametliku liitotsingu tõendikattest. Nõrk vaste annab täpsustuse või abstention'i; uued arvulised vertikaalid tuleb lisada struktureeritud väidete, ametliku API-adapteri ja eval-komplektiga.
- Väline Luna teenus võib olla rate limit'i taga; lai PostgreSQL-i ja ametlike veebide tulemuste loend jääb saadavaks ning faktide väljamõtlemise asemel kuvatakse aus allikaotsingu fallback.
- Terrapointi iframe sõltub mõlema domeeni CSP-st ja selle väliste ametlike teenuste saadavusest.
