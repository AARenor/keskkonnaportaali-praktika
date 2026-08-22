# Keskkonnaportaali praktika

Keskkonnaportaali visuaalsel keelel põhinev praktikaprojekt, mille kaks põhiosa on:

- vastus-enne-allikaid otsing, kus OpenAI Agents SDK manager käivitab mitme allika korral järjest nii Luna relevantsus- kui ka tõendikriitiku ainult sama päringu värskel, filtreeritud ja järjestatud ametlikul tõendipakil ning lisab nummerdatud viited;
- PostgreSQL-i korpus koos portaali sitemapilehtede, otsingukaartide ja valitud täistekstidega; tulemusi täiendavad päringu ajal ametlikud otsinguliidesed, skeemi-, aja- ja ühikukontrolliga Ilmateenistuse vaatlus- ja prognoosi-XML, täpse jaama ja näitajaga Keskkonnaagentuuri hüdroloogia- ning Jõgeva ajaloolised kliimaandmed, EELISe fikseeritud Emajõe avaliku vooluveekogu WFS-kirje ning Statistikaameti fikseeritud KK048 veevõtu, KK25 BHT7 ja KK068 ohtlike jäätmete JSON-stat2 päringud 2024. aasta Eesti koonditele;
- allika-, sisutüübi-, aasta- ja järjestusfiltrid ning kuni neli iga kord uue tõendiotsingu tegevat viidatud jätkuküsimust;
- portaali sees töötav kogu `terrapoint.ee` rakendus, mis on üldotsingust täielikult eraldatud.

Avalik keskkond: [praktika.arleserver.cfd](https://praktika.arleserver.cfd)

Arhitektuur, turve, piirangud ja kontrollnimekiri on kirjeldatud failis [PROJEKT.md](./PROJEKT.md). Korduvkäivitatavad tootmise tõendid ja docs-to-code kaart on failis [acceptance-evidence.md](./acceptance-evidence.md). Otsingu andmevoo ja Luna teenuse privaatsuspiir on failis [PRIVAATSUS.md](./PRIVAATSUS.md). Portaali ja uue otsingu uurimus asub failis [docs/ARHITEKTUUR.md](./docs/ARHITEKTUUR.md), ametlike API-de register failis [docs/ALLIKAD.md](./docs/ALLIKAD.md) ning visuaalse regressiooni tõendid failis [design-qa.md](./design-qa.md).

## Kiirkäivitus

```bash
npm install
npm run build
PORT=4174 PROXY_MODE=direct PUBLIC_ORIGIN=http://127.0.0.1:4174 LLM_ENABLED=false SEARCH_CACHE_ENABLED=false npm start
```

Dockeriga:

```bash
cp .env.example .env
# määra .env-is eraldi juhuslikud POSTGRES_PASSWORD ja SEARCH_HASH_SECRET väärtused
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
npm run eval:holdout
npm run eval:blind
npm run eval:open
npm run eval:public
npm run eval:live -- --base-url=https://praktika.arleserver.cfd
npm run audit:filters -- --base-url=https://praktika.arleserver.cfd
```

`eval:public` kontrollib 147 käsitsi koostatud realistlikku eestikeelset
arenduspäringut 11 valdkonnas. Komplekt ei pärine kasutajalogidest ega mõõda tegelikku
populaarsust ja ei ole sõltumatu holdout; see on lai regressioonivõrk, mille kõrval
jäävad alles külmutatud holdout-, blind- ja adversariaalsed eval-id.
