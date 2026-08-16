# Keskkonnaportaali praktikaprojekt

## Projekti eesmärk

See projekt on Keskkonnaportaali praktikaversioon. Avaleht järgib `keskkonnaportaal.ee` struktuuri, värve, tüpograafiat ja sisutüüpe, kuid lisab kaks uut kasutusvoogu:

1. **Allikapõhine parem otsing.** Kasutaja saab kirjutada loomulikus keeles küsimuse. Leht kuvab kõigepealt lühikese koondvastuse koos nummerdatud viidetega ja seejärel kasutatud ametlikud allikad.
2. **Manustatud Terrapoint.** Portaali sees töötab suur iframe, mis kuvab kogu `terrapoint.ee` rakenduse muutmata kasutajaliidese, kaardi ja API-töövoogudega.

Projekt on selgelt märgitud praktikaprojektiks ning avalik leht saadab `noindex` juhised, et seda ei aetaks segamini Keskkonnaportaali ametliku tootmiskeskkonnaga.

Töötav praktikakeskkond asub aadressil [praktika.arleserver.cfd](https://praktika.arleserver.cfd). Lähtekood on privaatses GitHubi repos ning Coolify loeb seda ainult selle rakenduse jaoks loodud read-only deploy-võtmega.

## Tehniline ülesehitus

| Kiht | Lahendus | Vastutus |
|---|---|---|
| Kasutajaliides | React 19 + Vite | Avaleht, menüüd, responsive vaated, otsingu- ja Terrapointi kasutusvood |
| Ikoonid | Lucide React | Ühtlane ning ligipääsetav ikoonisüsteem |
| Rakendusserver | Node.js + Express | Staatilise rakenduse serveerimine, otsingu API, Terrapointi proxy, turvapäised |
| Reaalajaotsing | Keskkonnaportaali avalik HTML-otsing ja autocomplete JSON | Toob iga päringu ajal ametliku portaali värsked vasted ja soovitused |
| Hübriidjärjestus | Kohalik eesti teksti järjestus + Qdrant | Ühendab märksõna- ja vektorsarnasuse; kasutab ainult rakenduse eraldi kollektsiooni |
| AI-vastus | OpenCode Zen / DeepSeek V4 Flash (serveris) | Koostab vastuse ainult valitud tõenditest ja säilitab viite-ID-d; tõrke korral deterministlik fallback |
| Püsiandmed | Eraldatud PostgreSQL | Hoiab lühiajalist otsinguvahemälu ja tehnilist päritolulogi; ei kasuta Chatwooti andmebaasi |
| Terrapoint | `https://terrapoint.ee/` täisrakendus iframe'is | Sama UI, kaart ja avalikud andmeallikad nagu Terrapointi enda lehel |
| Pakendamine | Mitmeastmeline Dockerfile | Väike eraldi Node.js tootmiskonteiner |
| Deploy | Coolify | Docker-build, tervisekontroll ja HTTPS-domeen |

## Otsingu tööpõhimõte

Otsingu endpoint on `GET /api/search?q=<küsimus>`.

Praegune versioon:

- küsib kõigepealt Keskkonnaportaali avalikku `search_api_fulltext` otsingut ja kasutab portaali autocomplete JSON-endpointi;
- lisab Terrapointi kasutatavate ametlike allikate registri ning katastritunnuse korral Terrapointi kinnistu-API vastuse;
- normaliseerib eesti täpitähed, arvestab teemade sõnatüvesid ning järjestab vasteid nii leksikaalselt kui Qdranti vektorsarnasusega;
- annab kuni seitse tõendit serveripoolsele keelemudelile, mis tohib kasutada ainult neid tõendeid;
- lisab igale lõigule nummerdatud viite ning kuvab algallikad vastuse järel;
- salvestab vastuse lühikeseks ajaks eraldatud PostgreSQL-i vahemällu ning kuvab UI-s, millised teenused vastuse koostamisel osalesid;
- läheb iga välise teenuse tõrke korral astmeliselt üle kohalikule, viidetega deterministlikule vastusele.

LLM-i võti ei jõua brauserisse. Kui `OPENCODE_ZEN_API_KEY` puudub või mudel ei vasta, jääb kogu otsing tööle ning kasutaja saab samad valitud allikad koos reeglipõhise kokkuvõttega. Qdrant ja PostgreSQL on indeks ning vahemälu, mitte info algallikas.

## Terrapointi integratsioon

Portaal manustab `https://terrapoint.ee/` tervikuna. Selleks lubab praktikaportaali CSP `frame-src` ainult Terrapointi domeeni ning Terrapoint lubab oma CSP `frame-ancestors` nimekirjas ainult praktikadomeeni. Vana `/embed/terrapoint` kiirvaade ja piiratud proxy-endpointid jäid ajutiselt tagasiühilduvuse jaoks alles, kuid avaleht neid enam ei kasuta.

Iframe on desktopis kuni 980 px kõrge ja mobiilis 780–820 px kõrge. Rakendus jääb Terrapointi enda koodiks: aadressiotsing, kaardid, kinnistuandmed, AI-vaade ja kõik muud seal avalikult töötavad osad ei ole praktikaprojektis uuesti ehitatud.

Oluline kasutajateade jääb alati nähtavale: puuduv vaste ei kinnita piirangu või metsa puudumist ning otsus tuleb kontrollida ametlikust registrist.

## Kohalik käivitamine

Nõuded: Node.js 24 ja npm.

```bash
npm install
npm run build
cp .env.example .env
# muuda vähemalt POSTGRES_PASSWORD
docker compose up --build
```

Compose käivitab kolm eraldatud konteinerit: veebirakendus, PostgreSQL ja Qdrant. Kui soovid käivitada ainult Node.js rakenduse ilma andmebaaside ja LLM-ita, kasuta `npm run build && PORT=4174 npm start`; fallback-otsing töötab ka siis.

Arenduse UI-serveri saab käivitada käsuga `npm run dev`, kuid API-de täielikuks testimiseks kasuta tootmis-buildi ja `npm start` kombinatsiooni.

## Docker

```bash
docker build -t keskkonnaportaali-praktika .
docker run --rm -p 4174:3000 keskkonnaportaali-praktika
```

Või Compose'iga:

```bash
docker compose up --build
```

Konteiner töötab mitte-root kasutajana, eksponeerib pordi `3000` ning kontrollib endpointi `/api/health`.

## Coolify seadistus

Soovitatud Coolify rakenduse seaded:

- build pack: **Dockerfile**;
- Dockerfile: `/Dockerfile`;
- sisemine port: `3000`;
- health check: `/api/health`;
- domeen: `https://praktika.arleserver.cfd`;
- keskkonnamuutuja: `TERRAPOINT_API_URL=https://terrapoint.ee`;
- keskkonnamuutuja: `PUBLIC_ORIGIN=https://praktika.arleserver.cfd`;
- `DATABASE_URL` peab viitama ainult sellele projektile loodud PostgreSQL-ile;
- `QDRANT_URL`, `QDRANT_API_KEY` ja `QDRANT_COLLECTION=keskkonnaportaali_praktika_sources`;
- serverisaladus `OPENCODE_ZEN_API_KEY` ning `LLM_MODEL=deepseek-v4-flash-free`.

Praegune deploy kasutab mitmeastmelist Dockerfile'i, käitab Node.js protsessi mitte-root kasutajana ning on Coolifys tervisekontrolli järgi `running:healthy`. Domeeni liiklus läheb HTTPS-i kaudu rakenduse sisemisele pordile `3000`; proxyst saabuvad HTTP-päringud suunatakse püsivalt `PUBLIC_ORIGIN` HTTPS-aadressile.

Rakendusse ei tohi lisada vestluses või lähtekoodis jagatud Coolify API tokenit ega SSH privaatvõtit. Deploy-võtmed peavad olema projektipõhised ja minimaalse õigusega; API automatiseerimisel kasuta lühiajalist tokenit ning kustuta see pärast operatsiooni.

## Turve ja privaatsus

- API päringute maht on piiratud IP-põhiselt 120 päringuni minutis.
- Päringu pikkus ja katastritunnuse kuju valideeritakse serveris.
- Rakendus saadab CSP, `nosniff`, piiratud Permissions Policy ja Referrer Policy päised.
- Terrapointi upstream-URL on serveris fikseeritud keskkonnamuutujaga; kasutaja ei saa suvalist URL-i proxystada.
- Rakendus ei kasuta analüütikat ega jälgimisküpsiseid. PostgreSQL-i otsinguvahemälu aegub kümne minutiga.
- Kõik SQL-päringud on parameeterdatud ning Qdrantis kasutatakse eraldi projektikollektsiooni.
- LLM saab ainult kasutaja küsimuse ja kuni seitsme avaliku allika pealkirja, kokkuvõtte ning URL-i; mudel ei saa infrastruktuurisaladusi.
- Allikalingid avanevad otse nende ametlikus keskkonnas.

## Testid ja kontrollid

```bash
npm test
npm run build
npm run test:sites
```

`npm test` kontrollib otsingu normaliseerimist, teemakohast järjestust, viiteid, tundmatu päringu fallback'i ning Sites-buildi käitumist. Lisaks tuleb enne väljalaset teha brauseri smoke-test desktop- ja mobiililaiusel:

- avalehe paigutus;
- desktop mega-menüü ja mobiilimenüü;
- mobiiliotsingu avamine;
- otsinguküsimus → vastus → allikad;
- Terrapointi täisrakendus laadib iframe'is ning aadressiotsing, kaart ja kinnistu vaade on kasutatavad;
- UI päritoluriba näitab Keskkonnaportaali, Terrapointi, Qdranti, PostgreSQL-i ja LLM-i tegelikku olekut;
- `/api/health`;
- brauserikonsoolis esimese osapoole vead puuduvad.

## Olulisemad kaustad

```text
public/assets/       kohalikud lähteportaali pildid, logo ja fondid
server/index.mjs     Express-server, proxy ja tervisekontroll
server/integrations.mjs Keskkonnaportaali ja Terrapointi avalikud andmeallikad
server/pipeline.mjs  reaalajaotsingu, rerank'i, LLM-i ja fallback'i orkestreerimine
server/qdrant.mjs    projekti eraldi vektorikollektsioon
server/database.mjs  PostgreSQL-i vahemälu ja päritolulogi
server/llm.mjs       viidetega, tõendipõhine serveripoolne vastus
server/search.mjs    kohalik korpus, eesti teksti järjestus ja fallback
src/App.jsx          Reacti vaated ja kasutusvood
src/styles.css       responsive visuaalne süsteem
tests/               automaattestid
Dockerfile           tootmiskonteiner
compose.yaml         kohalik Docker Compose keskkond
```

## Piirangud ja järgmised sammud

- Keskkonnaportaali HTML-otsing on avalik tasuta liides, kuid mitte versioonitud lepinguline API; parser vajab portaali HTML-i muutumisel uuendamist.
- Kohalik 256-mõõtmeline Qdranti vektor on tasuta morfoloogiline/tekstilähedane embedding. Tootmises saab sama liidese taha panna kvaliteetsema eestikeelse embedding-mudeli.
- LLM-i vastus sõltub mudeliteenuse saadavusest, kuid tõrge ei eemalda otsingutulemusi ega allikaviiteid.
- Terrapointi iframe sõltub mõlema domeeni CSP-poliitikast ja Terrapointi välistest andmeallikatest.
- Avalehe sisu on demonstratsiooniline hetktõmmis ja ei asenda Keskkonnaportaali CMS-i.
