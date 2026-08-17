# Keskkonnaportaali praktika

Keskkonnaportaali visuaalsel keelel põhinev praktikaprojekt, mille kaks põhiosa on:

- vastus-enne-allikaid otsing koos 21 struktureeritud metsateadmise, Luna tõlgenduse ja nummerdatud viidetega;
- PostgreSQL-i korpus, mis hoiab 8407 sitemapilehte, portaali otsingukaarte, valitud täistekste ja `mets` snapshot'i 953 kaardiesinemist; UI lehitseb neist kontrollhetke 752 eri URL-i ning ütleb korduse ausalt välja;
- portaali sees töötav kogu `terrapoint.ee` rakendus, mis on üldotsingust täielikult eraldatud.

Avalik keskkond: [praktika.arleserver.cfd](https://praktika.arleserver.cfd)

Arhitektuur, turve, piirangud ja kontrollnimekiri on kirjeldatud failis [PROJEKT.md](./PROJEKT.md). Portaali ja uue otsingu uurimus asub failis [docs/ARHITEKTUUR.md](./docs/ARHITEKTUUR.md), ametlike API-de register failis [docs/ALLIKAD.md](./docs/ALLIKAD.md) ning visuaalse regressiooni tõendid failis [design-qa.md](./design-qa.md).

## Kiirkäivitus

```bash
npm install
npm run build
PORT=4174 LLM_ENABLED=false SEARCH_CACHE_ENABLED=false npm start
```

Dockeriga:

```bash
cp .env.example .env
docker compose up --build
npm run sync:corpus -- --hydrate-limit=1000 --seed-queries=mets
```

Tervisekontroll: `GET /api/health`.

## Kontroll

```bash
npm test
npm run build
npm run test:sites
docker compose config
```
