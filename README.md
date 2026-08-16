# Keskkonnaportaali praktika

Keskkonnaportaali visuaalsel identiteedil põhinev praktikaprojekt, mis lisab kaks prototüübitavat põhiideed:

- Keskkonnaportaali reaalajaotsingule, Qdrantile ja serveripoolsele LLM-ile toetuv vastus-enne-allikaid otsing;
- portaali sees toimiv kogu `terrapoint.ee` rakendus;
- eraldatud PostgreSQL-i vahemälu ning nähtav vastuse päritoluinfo.

Avalik praktikakeskkond: [praktika.arleserver.cfd](https://praktika.arleserver.cfd)

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
