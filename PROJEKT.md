# Keskkonnaportaali praktikaprojekt

## Projekti eesmärk

See projekt on Keskkonnaportaali praktikaversioon. Avaleht järgib `keskkonnaportaal.ee` struktuuri, värve, tüpograafiat ja sisutüüpe, kuid lisab kaks uut kasutusvoogu:

1. **Allikapõhine parem otsing.** Kasutaja saab kirjutada loomulikus keeles küsimuse. Leht kuvab kõigepealt lühikese koondvastuse koos nummerdatud viidetega ja seejärel kasutatud ametlikud allikad.
2. **Manustatud Terrapoint.** Portaali sees olev eraldatud iframe võimaldab otsida aadressi, valida katastriüksuse ning vaadata kinnistu põhi- ja ruumiandmeid.

Projekt on selgelt märgitud praktikaprojektiks ning avalik leht saadab `noindex` juhised, et seda ei aetaks segamini Keskkonnaportaali ametliku tootmiskeskkonnaga.

Töötav praktikakeskkond asub aadressil [praktika.arleserver.cfd](https://praktika.arleserver.cfd). Lähtekood on privaatses GitHubi repos ning Coolify loeb seda ainult selle rakenduse jaoks loodud read-only deploy-võtmega.

## Tehniline ülesehitus

| Kiht | Lahendus | Vastutus |
|---|---|---|
| Kasutajaliides | React 19 + Vite | Avaleht, menüüd, responsive vaated, otsingu- ja Terrapointi kasutusvood |
| Ikoonid | Lucide React | Ühtlane ning ligipääsetav ikoonisüsteem |
| Rakendusserver | Node.js + Express | Staatilise rakenduse serveerimine, otsingu API, Terrapointi proxy, turvapäised |
| Otsing | Kohalik kureeritud allikakorpus ja deterministlik järjestus | Töötab ilma välise AI-võtmeta ja seob iga vastuse algallikaga |
| Terrapoint | Serveripoolne proxy avalikule `terrapoint.ee` API-le | Väldib brauseri CORS/CSP takistusi, lisab ajalimiidi ja vahemälu |
| Kaart | OpenStreetMapi ametlik embed | Kuvab valitud katastriüksuse keskpunkti |
| Pakendamine | Mitmeastmeline Dockerfile | Väike eraldi Node.js tootmiskonteiner |
| Deploy | Coolify | Docker-build, tervisekontroll ja HTTPS-domeen |

## Otsingu tööpõhimõte

Otsingu endpoint on `GET /api/search?q=<küsimus>`.

Praegune esialgne versioon:

- otsib kureeritud Keskkonnaportaali, Keskkonnaagentuuri, Keskkonnaameti ja seotud ametlike infosüsteemide allikate hulgast;
- normaliseerib eesti täpitähed ja arvestab teemade sõnatüvesid;
- järjestab vasteid pealkirja, märksõnade ja kokkuvõtte järgi;
- koostab kuni kolmest tugevamast allikast lühivastuse;
- lisab igale lõigule nummerdatud viite ning kuvab algallikad vastuse järel;
- annab ebakindla vaste puhul madala kindluse märgise ja üldised ametlikud lähteallikad.

See lahendus on teadlikult deterministlik: demo töötab kohe ja ei vaja salajast mudelivõtit. Järgmises etapis saab sama API taha lisada serveripoolse keelemudeli, kuid mudelile tuleb anda ainult valitud allikate tekst ning vastus peab säilitama olemasolevad viite-ID-d. Allikata väiteid ei tohiks UI-s avaldada.

## Terrapointi integratsioon

Terrapointi enda avaleht ei luba turvapäiste tõttu otse teise saidi iframe'is kuvamist. Seetõttu on projektis oma, samal domeenil töötav manustatud vaade aadressil `/embed/terrapoint`.

Vaade kasutab järgmisi proxy-endpointe:

- `GET /api/terrapoint/address?q=<aadress>` – aadressiotsing;
- `GET /api/terrapoint/parcel/:number` – katastriüksuse koondandmed.

Proxy omadused:

- aadressivastuse vahemälu 10 minutit;
- kinnistuvastuse vahemälu 30 minutit;
- ülesvoolu päringu ajalimiit 22 sekundit;
- kuni 24 tunni vanuse puhverdatud vastuse kasutamine ajutise tõrke ajal;
- selge JSON-viga `TERRAPOINT_TIMEOUT` või `TERRAPOINT_UNAVAILABLE`;
- Terrapointi tõrge ei peata portaali avalehte ega otsingut.

Oluline kasutajateade jääb alati nähtavale: puuduv vaste ei kinnita piirangu või metsa puudumist ning otsus tuleb kontrollida ametlikust registrist.

## Kohalik käivitamine

Nõuded: Node.js 24 ja npm.

```bash
npm install
npm run build
PORT=4174 npm start
```

Rakendus on seejärel pordil `4174`. Tootmises annab pordi keskkonnamuutuja `PORT`.

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
- keskkonnamuutuja: `PUBLIC_ORIGIN=https://praktika.arleserver.cfd`.

Praegune deploy kasutab mitmeastmelist Dockerfile'i, käitab Node.js protsessi mitte-root kasutajana ning on Coolifys tervisekontrolli järgi `running:healthy`. Domeeni liiklus läheb HTTPS-i kaudu rakenduse sisemisele pordile `3000`; proxyst saabuvad HTTP-päringud suunatakse püsivalt `PUBLIC_ORIGIN` HTTPS-aadressile.

Rakendusse ei tohi lisada vestluses või lähtekoodis jagatud Coolify API tokenit ega SSH privaatvõtit. Deploy-võtmed peavad olema projektipõhised ja minimaalse õigusega; API automatiseerimisel kasuta lühiajalist tokenit ning kustuta see pärast operatsiooni.

## Turve ja privaatsus

- API päringute maht on piiratud IP-põhiselt 120 päringuni minutis.
- Päringu pikkus ja katastritunnuse kuju valideeritakse serveris.
- Rakendus saadab CSP, `nosniff`, piiratud Permissions Policy ja Referrer Policy päised.
- Terrapointi upstream-URL on serveris fikseeritud keskkonnamuutujaga; kasutaja ei saa suvalist URL-i proxystada.
- Rakendus ei kasuta analüütikat ega küpsiseid.
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
- Terrapointi aadressiotsing → katastriüksus → koondandmed;
- `/api/health`;
- brauserikonsoolis esimese osapoole vead puuduvad.

## Olulisemad kaustad

```text
public/assets/       kohalikud lähteportaali pildid, logo ja fondid
server/index.mjs     Express-server, proxy ja tervisekontroll
server/search.mjs    otsingukorpus, järjestus ja koondvastus
src/App.jsx          Reacti vaated ja kasutusvood
src/styles.css       responsive visuaalne süsteem
tests/               automaattestid
Dockerfile           tootmiskonteiner
compose.yaml         kohalik Docker Compose keskkond
```

## Piirangud ja järgmised sammud

- Otsingukorpus on esialgne ning vajab tootmiseks automaatset sisusünkroniseerimist ja toimetuslikku kvaliteedikontrolli.
- Koondvastus on praegu allikapõhine algoritmiline kokkuvõte, mitte vabalt teksti genereeriv keelemudel.
- Terrapointi vastuse kiirus sõltub välistest andmeallikatest; vahemälu pehmendab, kuid ei kõrvalda upstream-tõrkeid.
- Kinnistu kaart näitab keskpunkti. Täieliku geomeetria ja kihtide visualiseerimine on järgmise etapi töö.
- Avalehe sisu on demonstratsiooniline hetktõmmis ja ei asenda Keskkonnaportaali CMS-i.
