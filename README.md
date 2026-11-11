# Keskkonnaportaali praktika

Keskkonnaportaali visuaalsel keelel põhinev praktikaprojekt, mille põhiosad on:

- vastus-enne-allikaid otsing, kus vastuse koostamine ja tõendikontroll kasutavad sama päringu värsket, filtreeritud ja järjestatud tõendipakki ning lisavad nummerdatud viited; pikk vastus liigub brauserisse protsessisisese töö ja lühiküsitluse kaudu, seega ei sõltu see ühest kaua lahti hoitavast ühendusest;
- PostgreSQL-i korpus, mis koondab portaali sitemapilehed, otsingukaardid, valitud täistekstid ning heakskiidetud ametlike väljaandjate (Keskkonnaagentuur, Keskkonnaamet, Kliimaministeerium, RMK, Ilmateenistus, Terviseamet, KIK) eestikeelsed sitemap-URL-id. Lehetekst hüdratiseeritakse kõigilt lubatud ametlikelt hostidelt ning täissünkroonimiste vahel jätkab piiratud taustapartii tühjade ja aegunud leheteksti ridade täitmist; tulemusi täiendavad ametlikud otsinguliidesed, kontrollitud ilma-, hüdroloogia- ja kliimaandmed ning valitud EELISe registrikirjed. Statistikaamet on avalikust allikavalikust välistatud;
- avatud kvalitatiivsele küsimusele võib vastuse anda üks asjakohane viidatud ametlik lõik; arvu, aastat, nimetatud kohta või tegevust küsiv vastus nõuab endiselt täpset tõendit ning mudeli tõrke korral kuvatakse sama tõendi viidatud väljavõte;
- pikk loomulik küsimus ei tohi korpuse otsingut vaikselt degradeerida: lai `OR`-vaste järjestatakse odava `ts_rank`-iga piiratud kandidaadiaknasse (vähemalt 1000 rida, sügavamal lehel `offset + 4 × lehe suurus`) ja täpne kaalutud valem arvutatakse ainult selle akna sees. Lehekülgede koguarv tuleb sama filtreeritud vaste hulgast, mitte kandidaadiaknast;
- allika-, sisutüübi-, aasta- ja järjestusfiltrid ning kuni neli iga kord uue tõendiotsingu tegevat viidatud jätkuküsimust;
- toetatud metsaküsimustele Keskkonnaagentuuri kontrollitud esmased SMI töövihiku aegread koos viidatud diagrammiga; sobiva esmase andmerea puudumisel diagrammi ei kuvata;
- metsa osakaalu küsimusele („kui suur osa Eestist on mets”) SMI 2025 maakategooriate jaotus sektordiagrammina;
- raie osakaalu küsimusele („kui suur osa raiest on lageraie”) SMI raieliikide jaotus sektordiagrammina;
- PDF-vormingus ametlike aruannete piiratud taustaindeks (`poppler-utils`): indeksisse läheb ainult täielik, tekstikihiga ja lubatud lugemine, krüpteeritud, skaneeritud, liiga suur või ajapiiri ületanud fail jääb indekseerimata;
- avaldaja robots- ja lõikepiirangute järgimine ühe allikapoliitika otsusena (`noindex`, `nosnippet`, `max-snippet`, `noarchive`, `data-nosnippet`); lubav `robots.txt` ei ole litsents;
- portaali sees töötav kogu `terrapoint.ee` rakendus, mis on üldotsingust täielikult eraldatud.

Diagramm järgib avaldatud arve, mitte ümardatud muljet: tulp algab nulljoonest, lõigatud joontelg ütleb seda allkirjas, avaldatud kümnendkohad säilivad ja eri ühikus seeriad joonistatakse eraldi paneelidena. AI koondvastus on tootmises piiratud Eesti metsateemadega (`ALL_ENVIRONMENT_SEARCH_ENABLED` on vaikimisi `false`); muudel keskkonnateemadel jääb lugejale allikate loend. Mudelieelarved on protsessisisesed ja nullistuvad konteineri taaskäivitusel.

Avalik keskkond: [praktika.arle.top](https://praktika.arle.top)

## Üleandmine

Avalik kood ei anna õigust korpuse ega allikate sisule: allikate kasutusõigused tuleb vastuvõtva asutusega eraldi kokku leppida. Koodi litsents ei ole veel otsustatud, seega ära eelda ühtegi litsentsi. Ükski riigiasutus ei ole seda lahendust vastu võtnud ega kinnitanud.

- [IT-halduri juhend](./docs/IT-HOOLDUS.md): juurutus, saladused, varukoopia ja taastamine, hooldus.
- [Arhitektuur](./docs/ARHITEKTUUR.md) ja [ametlike allikate register](./docs/ALLIKAD.md): andmevoog, piirangud, allikate lepingud.
- [Privaatsus](./PRIVAATSUS.md) ja [tavakasutaja juhend](./docs/KASUTUSJUHEND.md).
- [Vastuvõtu tõendid](./acceptance-evidence.md) ja [projekti kirjeldus](./PROJEKT.md).

Lokaalseks käivituseks on vaja Node 24. Andmebaasi või vahemälu kasutamisel on vaja PostgreSQL 17 ning kahte sõltumatut saladust (`POSTGRES_PASSWORD` ja `SEARCH_HASH_SECRET`, mõlemad eraldi juhuslikud); kohaliku `npm start` jaoks koosta ka `DATABASE_URL` ise. LLM on valikuline: `LLM_ENABLED=false` käivitab otsingu ilma mudelivõtmeta. Täpne käsk on allpool ja `.env.example` kirjeldab kõik väärtused.

## Avalikud juhendid

- [Juhendite ülevaade](https://praktika.arle.top/docs)
- [Tavakasutaja juhend](https://praktika.arle.top/docs/kasutajale): otsing, filtrid, viited, diagrammid, jätkuküsimused ja privaatsus.
- [Arendaja integratsioonijuhend](https://praktika.arle.top/docs/arendajale): API leping, sama päritolu ühendamine keskkonnaportaal.ee süsteemiga, töö ja lühiküsitluse transport, ühilduvad voo- ja JSON-liidesed, seadistus ja üleandmise kontrollnimekiri.

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
docker compose up -d --build
docker compose exec web node server/sync-corpus.mjs --hydrate-limit=1000 --seed-queries=mets
```

Korje käivitub konteineri sees, sest runtime-image'is ei ole npm-i ja hosti `.env` ei laadita sellesse Node-skripti; konteiner saab samad keskkonnamuutujad Compose'ist. Skript loob vajaliku skeemi idempotentselt ja teeb päris ülesvoolu päringuid avalikele allikatele, seega võib see võtta mitu minutit.

Tervisekontroll: `GET /api/health`.

### Tausta-AI ja juurutus

06.10.2026 seadistuse cutover kasutab olemasolevat autenditud Codex gateway'd:
`LLM_BASE_URL=https://terrapoint.arle.top/v1`,
`LLM_MODEL=openai-codex/gpt-6-luna`, `LLM_REASONING_EFFORT=low`,
`LLM_ORCHESTRATION=direct` ja mudelikõne taimer `LLM_TIMEOUT_MS`. Otsene
mudelikõne hoiab alles viite- ja tõendikontrollid. Ajaeelarve on tahtlikult
helde: kui mudel või allikate lugemine võtab kauem, ootab lugeja kauem, selle
asemel et kaotada tõendatud vastus taimeri taha.

Otsingul on kaks eraldi kella, mitte üks ühine taimer. Tulemuste loendi aken
algab päringust ja seda juhib `SEARCH_DEADLINE_MS`; vastuse aken algab alles
siis, kui loend on avaldatud, ja seda juhib `ANSWER_DEADLINE_MS`. Ühekordne
`/api/search` piirab loendit lisaks väärtusega `JSON_SEARCH_DEADLINE_CEILING_MS`.
Transport peab need aknad ära mahtuma: `PUBLIC_RESPONSE_ABSOLUTE_TIMEOUT_MS`
katab loendi akna, vastuse akna ja lõppvastuse reservi ning
`PUBLIC_RESPONSE_IDLE_TIMEOUT_MS` on pikem kui ühekordse otsingu loendi lagi.
Kui see ei kehti, keeldub server käivitumast, mitte ei lühenda eelarvet vaikselt.
Vaikeväärtused on failis `.env.example`. Neljakutseline `agents` režiim ületas
varasemas live-kontrollis tolleaegse ajapiiri.
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
