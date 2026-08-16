# Keskkonnaportaali praktika

Keskkonnaportaali visuaalsel identiteedil põhinev praktikaprojekt, mis lisab kaks prototüübitavat põhiideed:

- Keskkonnaportaali reaalajaotsingule, Qdrantile ja serveripoolsele LLM-ile toetuv vastus-enne-allikaid otsing;
- portaali sees toimiv kogu `terrapoint.ee` rakendus;
- eraldatud PostgreSQL-i vahemälu ning nähtav vastuse päritoluinfo.

Avalik praktikakeskkond: [praktika.arleserver.cfd](https://praktika.arleserver.cfd)

Viimane avalik API-, Coolify- ja Playwright-kontroll: **16.08.2026**, rakenduskoodi commit `fa1b72d`. Kuupäevastatud tõendid ja täpne andmevoogude loend on failis [PROJEKT.md](./PROJEKT.md#avaliku-versiooni-kontroll--16082026).

Täielik kirjeldus, arhitektuur, käivitamine ja piirangud on failis [PROJEKT.md](./PROJEKT.md).

## Kiirkäivitus

```bash
npm install
npm run build
PORT=4174 npm start
```

Dockeriga:

```bash
docker compose up --build
```

Tervisekontroll: `GET /api/health`.
