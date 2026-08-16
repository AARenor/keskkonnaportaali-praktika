# Keskkonnaportaali praktikaprojekt

## Eesmärk

See on Keskkonnaportaali eraldiseisev praktikaversioon aadressil [praktika.arleserver.cfd](https://praktika.arleserver.cfd). Avaleht kasutab Keskkonnaportaali tuttavat visuaalset keelt ja lisab kaks selgelt eraldatud kasutusvoogu:

1. **Allikapõhine küsimus-vastus otsing.** Kasutaja saab vastuse esmalt, iga väite juures on nummerdatud viited ning vastuse järel ametlikud algallikad.
2. **Terrapointi täisrakendus.** Avalehe eraldi jaotises töötab `terrapoint.ee` iframe. Terrapoint ei osale üldotsingu vastuste koostamises ega ilmu selle allikatesse.

Projekt on märgitud praktikaprojektiks ja saadab `noindex` juhise. See ei ole Keskkonnaportaali ametlik tootmiskeskkond.

## Kasutajakogemus

- Avalehe põhiotsing on nähtav kohe nii töölaual kui ka mobiili esimeses vaates.
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
| Värske sisu | Keskkonnaportaali avalik otsing | Uute portaaliartiklite avastamine; valitud ametlikud lehed loetakse täistekstina |
| Ruumipäring | Avalik kataster + Metsaregistri WFS | Valideeritud katastritunnuse informatiivne pindala ja metsaeraldiste hetkeseis otse avalikust teenusest |
| Vastuse koostamine | Kontrollitud baasvastus + valikuline LLM | Läbi vaadatud vastus töötab alati; mudel võib sõnastust parandada ainult tagastatud tõendite alusel |
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

1. Päring normaliseeritakse ning klassifitseeritakse. Kahtlase URL-i või prompt-injection'i korral vastatakse turvalise täpsustusküsimusega.
2. Metsateema korral otsitakse versioonitud ja läbi vaadatud teadmusbaasist. Üldine `mets` koostab päris sünteesi metsamaa pindalast, näitajate piiridest ja ametlike arvude erinevuse põhjustest; see ei kopeeri otsingukaartide väljavõtteid.
3. Valideeritud katastritunnuse korral küsitakse otse Maa- ja Ruumiameti avalikku `kataster:ky_kehtiv` ning Metsaregistri `metsaregister:eraldis` WFS-i. Katastriväljavõte märgitakse informatiivseks ja mitteametlikuks. Vastus eristab selgelt olekuid „leitud”, „eduka päringu tulemusel ei leitud” ja „allikas ei vastanud”.
4. Muude teemade korral avastatakse tulemused Keskkonnaportaali avaliku otsingu kaudu ning valitud lubatud ametlikud lehed loetakse serveris täistekstina. HTML-otsingu väljavõtet ennast ei käsitleta lõpliku tõendina.
5. Kontrollitud struktuurne vastus on töökindel baas. Kui valikuline keelemudel on saadaval, tohib see ainult tõendite piires vastust tihendada ja peab säilitama kehtivad viited. Läbi vaadatud metsavastust ega täpset WFS-väljavõtet mudel ümber ei sõnasta.
6. 429, timeout või vigane mudelivastus ei lõhu otsingut. Lühike circuit breaker väldib korduvaid aeglaseid mudelikõnesid ja kasutajale tagastatakse kohe kontrollitud baasvastus.
7. Avalikus vastuses on ainult küsimus, vastus, viited, allikad, täpsustus ja seotud küsimused. Tehniline diagnostika jääb serverisse.
8. Kogu otsingul on 12 sekundi vastusepiir. Kui värskete allikate lugemine või mudel ei mahu sellesse, katkestatakse väliskutsed ja tagastatakse kontrollitud baasvastus, mitte proxy 504.

Vahemälu võti sisaldab teadmusbaasi ja vastuseskeemi revisjoni, seega ei saa vana Terrapointi või varasema skeemi vastus pärast deploy'd edasi elada.

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
| Keskkonnaportaali ja teiste ametiasutuste HTTPS-lehed/PDF-id | Vastuse kontrollitavad algallikad |

Keskkonnaportaali Drupali otsa ei käsitleta versioonitud lepingulise API-na. Päringud on ajapiiranguga, vastusemaht on piiratud, tulemused puhverdatakse ning tõrke korral kasutatakse stale-if-error väärtust.

### Eraldatud veebirakendus

`terrapoint.ee` töötab ainult täisrakenduse iframe'ina. See ei ole riigi avaandmeteenus ega üldotsingu andmeallikas.

### Järgmiste otsinguvertikaalide ametlikud ühendused

Uuringu käigus kontrollitud avalikult ligipääsetavad ametlikud algallikad, mida saab lisada intent-põhiselt ilma Terrapointi sõltuvuseta:

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
- valikuline serverisaladus `OPENCODE_ZEN_API_KEY`;
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
- külmutatud v2 hindamiskomplekti 30/30 vastatava päringu õiget intent-vastust ja Recall@3 väärtust 100%;
- `mets` päris sünteesi, täpset FAQ vastust ja turvalist abstention'it;
- raiemahu/juurdekasvu vastuse aastaid, ühikuid ja piiranguid;
- mudelivastuse viidete, arvude, ühikute, väitekatvuse ja polaarsuse kontrolli;
- 12 sekundi globaalse vastusepiiri kontrollitud fallback'i ning vahemälu toorpäringu eemaldamist;
- Terrapointi ning infrastruktuurijargooni puudumist üldotsingu payload'ist ja UI-st;
- kuni viit sisulist autocomplete-soovitust;
- Sites-buildi lepingut.

Brauseri regression peab katma 1440 × 1100 ja 390 × 844 vaated, autocomplete'i kihistuse, klaviatuurikäitumise, mobiili esimest vaadet, kompaktset otsingulehte, allikate avamist, horisontaalse overflow puudumist ning avaliku iframe'i fookuse/scroll'i kontrolli.

## Olulisemad failid

```text
server/forestry.mjs                     teadmiste laadimine, valideerimine ja hübriidotsing
server/knowledge/forestry/sources.json ametlik allikaregister
server/knowledge/forestry/documents.json struktureeritud vastused
server/integrations.mjs                 portaali discovery ja ametliku täislehe lugemine
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

- Keskkonnaportaali HTML-otsing on dokumenteerimata fallback ning parser vajab portaali markup'i muutumisel uuendamist. Järgmine tugev samm on portaali sitemapist versioonitud tekstiindeksi ehitamine.
- Väljaspool metsateemat on vastuse kvaliteet praegu sõltuvam portaali värskest sisust. Uued vertikaalid tuleb lisada struktureeritud claim'ide, ametliku API-adapteri ja eval-komplektiga.
- Väline LLM võib olla rate limit'i taga; see ei mõjuta kontrollitud metsavastuste saadavust ning portaalipäring langeb kontrollitud baasvastusele tagasi.
- Terrapointi iframe sõltub mõlema domeeni CSP-st ja selle väliste ametlike teenuste saadavusest.
