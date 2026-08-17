# Keskkonnaportaali praktika

Keskkonnaportaali visuaalsel keelel põhinev praktikaprojekt, mille kaks põhiosa on:

- kompaktne vastus-enne-allikaid otsing koos 21 struktureeritud metsateadmise, viidete ja ametlike algallikatega;
- portaali sees töötav kogu `terrapoint.ee` rakendus, mis on üldotsingust täielikult eraldatud.

Avalik keskkond: [praktika.arleserver.cfd](https://praktika.arleserver.cfd)

Arhitektuur, turve, piirangud ja kontrollnimekiri on kirjeldatud failis [PROJEKT.md](./PROJEKT.md). Kontrollitud ametlike API-de register asub failis [docs/ALLIKAD.md](./docs/ALLIKAD.md) ning visuaalse regressiooni tõendid failis [design-qa.md](./design-qa.md).

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
```

Tervisekontroll: `GET /api/health`.

## Kontroll

```bash
npm test
npm run build
npm run test:sites
docker compose config
```
