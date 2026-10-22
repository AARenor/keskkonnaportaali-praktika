# Keskkonnaportaali praktika

Keskkonnaportaali visuaalsel keelel põhinev praktikaprojekt, mille põhiosad on:

- vastus-enne-allikaid otsing, kus vastuse koostamine ja tõendikontroll kasutavad sama päringu värsket, filtreeritud ja järjestatud tõendipakki ning lisavad nummerdatud viited;
- PostgreSQL-i korpus, mis koondab portaali sitemapilehed, otsingukaardid, valitud täistekstid ning heakskiidetud ametlike väljaandjate (Keskkonnaagentuur, Keskkonnaamet, Kliimaministeerium, RMK, Ilmateenistus, Terviseamet, KIK) eestikeelsed sitemap-URL-id. Lehetekst hüdratiseeritakse kõigilt lubatud ametlikelt hostidelt ning täissünkroonimiste vahel jätkab piiratud taustapartii tühjade ja aegunud leheteksti ridade täitmist; tulemusi täiendavad ametlikud otsinguliidesed, kontrollitud ilma-, hüdroloogia- ja kliimaandmed ning valitud EELISe registrikirjed. Statistikaamet on avalikust allikavalikust välistatud;
- avatud kvalitatiivsele küsimusele võib vastuse anda üks asjakohane viidatud ametlik lõik; arvu, aastat, nimetatud kohta või tegevust küsiv vastus nõuab endiselt täpset tõendit ning mudeli tõrke korral kuvatakse sama tõendi viidatud väljavõte;
- pikk loomulik küsimus ei tohi korpuse otsingut vaikselt degradeerida: lai `OR`-vaste järjestatakse odava `ts_rank`-iga piiratud kandidaadiaknasse (vähemalt 1000 rida, sügavamal lehel `offset + 4 × lehe suurus`) ja täpne kaalutud valem arvutatakse ainult selle akna sees. Lehekülgede koguarv tuleb sama filtreeritud vaste hulgast, mitte kandidaadiaknast;
- allika-, sisutüübi-, aasta- ja järjestusfiltrid ning kuni neli iga kord uue tõendiotsingu tegevat viidatud jätkuküsimust;
- toetatud metsaküsimustele Keskkonnaagentuuri kontrollitud esmased SMI töövihiku aegread koos viidatud diagrammiga; sobiva esmase andmerea puudumisel diagrammi ei kuvata;
- metsa osakaalu küsimusele („kui suur osa Eestist on mets”) SMI 2025 maakategooriate jaotus sektordiagrammina;
- raie osakaalu küsimusele („kui suur osa raiest on lageraie”) SMI raieliikide jaotus sektordiagrammina;
- portaali sees töötav kogu `terrapoint.ee` rakendus, mis on üldotsingust täielikult eraldatud.

Avalik keskkond: [praktika.arle.top](https://praktika.arle.top)

## Avalikud juhendid

- [Juhendite ülevaade](https://praktika.arle.top/docs)
- [Tavakasutaja juhend](https://praktika.arle.top/docs/kasutajale): otsing, filtrid, viited, diagrammid, jätkuküsimused ja privaatsus.
- [Arendaja integratsioonijuhend](https://praktika.arle.top/docs/arendajale): API leping, sama päritolu ühendamine keskkonnaportaal.ee süsteemiga, voogedastus, seadistus ja üleandmise kontrollnimekiri.

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
`LLM_BASE_URL=https://terrapoint.arle.top/v1`,
`LLM_MODEL=openai-codex/gpt-6-luna`, `LLM_REASONING_EFFORT=low` ja
`LLM_TIMEOUT_MS=23000`, `LLM_ORCHESTRATION=direct`. Otsene mudelikõne hoiab
alles viite- ja tõendikontrollid: JSON-otsingu ülempiir on 22 sekundit ja voo
otsingueelarve 25 sekundit;
neljakutseline `agents` režiim ületas varasemas live-kontrollis ajapiiri.
Transport on alati Responses API; teist varumudelit ei kasutata.
`LLM_API_KEY` saab ainult serveri runtime-keskkonnas
gateway bearer'i; `.env.example` ei sisalda võtit. Võtmeta lokaalse käivituse
jaoks määra `LLM_ENABLED=false`. OpenAI Codex sisselogimine jääb hosti OMP
auth brokerisse ja gateway'sse: OAuth-i ei kopeerita rakendusse ega brauserisse.
Mudel töötleb OpenAI teenuses piiratud avalikku küsimust ja valitud tõendeid;
gateway nime jagamine Terrapointiga ei anna mudelile Terrapointi andmeid.
Allika-, viite-, privaatsus- ja eelarvekontrollid jäävad samaks ning mudelitõrke
korral säilib deterministlik allikapõhine vastus, mitte teine mudel.

Allikakeskne päringutee kasutab üht muutumatut `rawEvidencePack`-i: kuni
10 allikat, 4000 märki allika kohta ja 36 000 märki kogu serialiseeritud pakile.
Planeerija reserveerib täielikud nõutud rollid enne valikulisi lõike. Mudel,
kohalik grounding ja avaliku kasutatud viite väljavõte näevad sama paki sisu;
pealkiri, tag ega varasem vastus ei ole tõend. `DeliveredOutcome` määrab
AI märgise ja privaatse lõpp-provider/oleku alles avaldatud uue toetatud väite
järgi, mitte provider-katse edu järgi. Cache `privacy-safe-v7` säilitab sama
allika publication/update/data-period väljad, mitte mudeliproosat või toorpäringut.
Üldise metsavaate täielik praegune nelja rolliga läbi vaadatud tõend võib
jätta tarbetu live-avastuse ootamise ära; puuduv/aegunud roll või sobimatu
filter säilitab tavapärase ühendotsingu. Roll tähendab avaldatud faktilõike:
registri roll vajab kinnistu/metsaeraldise ulatust, mitte üksnes raiekavatsust.

Metsa valeväidete päring vajab artikli sisust väite ja allika selgituse paare.
Pealkiri üksi ega üldine SMI ülevaade neid ei asenda. Avalik vastus eristab
vaidlustatud väite allika selgitusest ja nimetab avaldamisaja; ajaloolist
selgitust ei esitata tänase metsaseisu või väite levimuse hinnanguna.
Täielik paaritatud tõend avaldatakse ilma tarbetu mudelikõneta ning võib kasutada
sama privaatsus- ja värskuskontrollidega deterministlikku vastusevahemälu.

Korpuse ühendamisel ei kirjuta madalama kvaliteediga saidikaardikirje üle
loetud lehe sisu, sisuräsi, lugemisaega ega päritolu. Varasema vigase päritoluga
lehed jäävad navigeerimiseks: taustapartii taastab tõendiõiguse alles pärast uut
lubatud HTTPS-lugemist, mitte olemasoleva teksti massilist usaldusväärseks märkimist.

Mudeli süsteemijuhis on päringu, intent'i ja allikate arvu suhtes muutumatu.
Muutuvad juhised jäävad kasutajasisendisse; tõendid eelnevad küsimusele ja
vestluskontekstile, et sama tõendipaki ühisprefiks oleks korduskasutatav.
Provider'i prompt-cache'i tabamus ei ole garanteeritud ega sama mis rakenduse
vastusevahemälu. Lõppvastus peab säilitama planeerija nõutud rollide viited.

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
npm run eval:live -- --base-url=https://praktika.arle.top
npm run audit:filters -- --base-url=https://praktika.arle.top
```

`eval:public` kontrollib 147 käsitsi koostatud realistlikku eestikeelset
arenduspäringut 11 valdkonnas. Komplekt ei pärine kasutajalogidest ega mõõda tegelikku
populaarsust ja ei ole sõltumatu holdout; see on lai regressioonivõrk, mille kõrval
jäävad alles külmutatud holdout-, blind- ja adversariaalsed eval-id.
