# Keskkonnaportaali praktika

Keskkonnaportaali visuaalsel keelel põhinev praktikaprojekt, mille põhiosad on:

- vastus-enne-allikaid otsing, kus vastuse koostamine ja tõendikontroll kasutavad sama päringu värsket, filtreeritud ja järjestatud tõendipakki ning lisavad nummerdatud viited;
- PostgreSQL-i korpus koos portaali sitemapilehtede, otsingukaartide ja valitud täistekstidega; tulemusi täiendavad ametlikud otsinguliidesed, kontrollitud ilma-, hüdroloogia- ja kliimaandmed ning valitud EELISe registrikirjed. Statistikaamet on avalikust allikavalikust välistatud;
- allika-, sisutüübi-, aasta- ja järjestusfiltrid ning kuni neli iga kord uue tõendiotsingu tegevat viidatud jätkuküsimust;
- toetatud metsaküsimustele Keskkonnaagentuuri kontrollitud esmased SMI töövihiku aegread koos viidatud diagrammiga; sobiva esmase andmerea puudumisel diagrammi ei kuvata;
- metsa osakaalu küsimusele („kui suur osa Eestist on mets”) SMI 2025 maakategooriate jaotus sektordiagrammina;
- raie osakaalu küsimusele („kui suur osa raiest on lageraie”) SMI raieliikide jaotus sektordiagrammina;
- portaali sees töötav kogu `terrapoint.ee` rakendus, mis on üldotsingust täielikult eraldatud.

Avalik keskkond: [praktika.arleserver.cfd](https://praktika.arleserver.cfd)

## Avalikud juhendid

- [Juhendite ülevaade](https://praktika.arleserver.cfd/docs)
- [Tavakasutaja juhend](https://praktika.arleserver.cfd/docs/kasutajale): otsing, filtrid, viited, diagrammid, jätkuküsimused ja privaatsus.
- [Arendaja integratsioonijuhend](https://praktika.arleserver.cfd/docs/arendajale): API leping, sama päritolu ühendamine keskkonnaportaal.ee süsteemiga, voogedastus, seadistus ja üleandmise kontrollnimekiri.

Juhendite versioonitud sisu: [src/docs/content.jsx](./src/docs/content.jsx).
Need kirjeldavad praegust praktikaversiooni, mitte juba tehtud CMS-i või SSO
integratsiooni. Vanemad arhitektuuri- ja QA-dokumendid sisaldavad ajaloolisi
teostus- ja teenusekirjeldusi; jooksva integratsiooni jaoks alusta avalikust
arendajajuhendist ning kontrolli lähtekoodi ja tegelikku käituskeskkonda.

Arhitektuur, turve, piirangud ja kontrollnimekiri on kirjeldatud failis [PROJEKT.md](./PROJEKT.md). Korduvkäivitatavad tootmise tõendid ja docs-to-code kaart on failis [acceptance-evidence.md](./acceptance-evidence.md). Otsingu andmevoo ja Luna teenuse privaatsuspiir on failis [PRIVAATSUS.md](./PRIVAATSUS.md). Portaali ja uue otsingu uurimus asub failis [docs/ARHITEKTUUR.md](./docs/ARHITEKTUUR.md), ametlike API-de register failis [docs/ALLIKAD.md](./docs/ALLIKAD.md) ning visuaalse regressiooni tõendid failis [design-qa.md](./design-qa.md).

Sihtrühmad ja vastusestiil on versioonitud failis [docs/PERSONAD.md](./docs/PERSONAD.md). Eraldi juhendid on [tavakasutajale](./docs/KASUTUSJUHEND.md) ning [IT-haldurile](./docs/IT-HOOLDUS.md), sealhulgas SMI, aastaraamatu „Mets“ ja puidubilansi iga-aastane hooldusprotsess.

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

### Tausta-AI ja juurutus

06.10.2026 seadistuse cutover kasutab olemasolevat autenditud Codex gateway'd:
`LLM_BASE_URL=https://terrapoint.arleserver.cfd/v1`,
`LLM_MODEL=openai-codex/gpt-6-luna`, `LLM_REASONING_EFFORT=low` ja
`LLM_TIMEOUT_MS=14500`, `LLM_ORCHESTRATION=direct`. Otsene mudelikõne hoiab
alles viite- ja tõendikontrollid ning mahub senisesse 15-sekundilisse eelarvesse;
neljakutseline `agents` režiim ületas live-kontrollis ajapiiri.
Transport on alati Responses API; teist varumudelit ei kasutata.
`LLM_API_KEY` saab ainult serveri runtime-keskkonnas
gateway bearer'i; `.env.example` ei sisalda võtit. Võtmeta lokaalse käivituse
jaoks määra `LLM_ENABLED=false`. OpenAI Codex sisselogimine jääb hosti OMP
auth brokerisse ja gateway'sse: OAuth-i ei kopeerita rakendusse ega brauserisse.
Mudel töötleb OpenAI teenuses piiratud avalikku küsimust ja valitud tõendeid;
gateway nime jagamine Terrapointiga ei anna mudelile Terrapointi andmeid.
Allika-, viite-, privaatsus- ja eelarvekontrollid jäävad samaks ning mudelitõrke
korral säilib deterministlik allikapõhine vastus, mitte teine mudel.

Tootmine kasutab Coolify **Dockerfile** build pack'i, mitte Compose'i runtime'i.
Runtime-muutujad tuleb seetõttu muuta ka Coolifys enne `main` push'i käivitatavat
redeploy'd. Täpne käituskeskkonna ja exact-SHA kontrolli kord:
[IT-halduri juhend](./docs/IT-HOOLDUS.md#codex-gateway-ja-coolify-runtime).

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
