# Keskkonnaportaali praktika

Keskkonnaportaali visuaalsel identiteedil põhinev praktikaprojekt, mis lisab kaks prototüübitavat põhiideed:

- vastus-enne-allikaid keskkonnaotsing;
- portaali sees toimiv Terrapointi kinnistuotsing.

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
