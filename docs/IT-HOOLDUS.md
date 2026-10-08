# IT-halduri hooldusjuhend

Uuendatud: 06.10.2026

Dokumendiversioon: 1.1.0

## Püsivad lepingud

- Query-time retrieval on värskuse põhitee; `server/forestry-public.mjs` sisaldab ainult piiratud ja üle vaadatud väljavõtteid.
- Faktivastuse tõend peab tulema samast filtreeritud ja relevantsusjärjestatud tulemusehulgast, mida kasutaja näeb.
- Maandumis- või navigatsioonileht ei tõenda üksikut arvu. Muutuv väärtus vajab seotud adapterit või päringut otseselt katvat versioonitud lõiku.
- Otsing jääb vaikimisi eestikeelseks. Geograafia-, privaatsus-, filtri- ja aegumiskontrolle ei nõrgendata uue termini lisamiseks.
- Statistikaamet on avalikest tulemustest, vastustest ja diagrammidest välistatud (`publicSourceAllowed`). Vanad adapterid säilivad skeemikontrolli jaoks, kuid nende arv ei lähe avalikku vastusesse. Toetatud metsaarvud ja raie osakaalud tulevad SMI töövihikust.

## Metsanduse allikahierarhia

Võrreldava relevantsuse ja väitekatvuse korral on järjekord:

**SMI → metsaaastaraamat → puidubilanss → Keskkonnaportaal/Keskkonnaagentuur → Kliimaministeerium → täiendavad allikad → Eurostat.**

Hierarhia ei luba teemavälisel SMI dokumendil otsest allikat edestada. Runtime'i klassifikaator on `server/forestry-source-policy.mjs`; regressioon asub `tests/official-knowledge.test.mjs`.

## Ametliku portaali korje

1. Loe enne jooksu `https://keskkonnaportaal.ee/robots.txt`; haldus-, otsinguabi- ja muud keelatud rajad jäävad välja.
2. Kasuta sitemap'i ning portaali otsingut avastamiseks, kanoniseeri URL-id ja piira lehekülgede, dokumentide, paralleelsuse, viite ja baitide arvu.
3. Ära peegelda CMS-i. Hüdrateeri ainult valitud avalikud sisulehed ja eemalda menüüd, vormid, skriptid ning lehekroom.
4. Salvesta allika väljaandja, avaldamis- ja uuendamiskuupäev eraldi. Kuupäeva puudumist ei asendata tänase kuupäevaga.
5. Uus faktiväide vajab URL-i, kontrollkuupäeva, täpset lõiku, rolli, kindlust ning positiivset ja negatiivset regressiooni.

## Iga-aastane metsandusväljaannete hooldus

Kindlat kalendripäeva ei eeldata. Kontroll käivitatakse vähemalt kord kuus ning kohe, kui Keskkonnaagentuur teatab uuest aastakäigust.

### SMI

1. **Kontroll:** ava [Metsastatistika, sh SMI](https://keskkonnaportaal.ee/et/teemad/mets/metsastatistika-sh-smi); kinnita uusima XLSX-i ja PDF-i andmeaasta, lehel näidatud „seisuga” kuupäev, HTTP kättesaadavus ning faili identiteet.
2. **Uuenda:** loe arvud uuest töövihikust koos töölehe, rea, ühiku, vea ja metoodikamärkusega. Uuenda ainult vastavaid dokumente failides `server/search.mjs`, `server/forestry-public.mjs` või tüübikindlas adapteris. Ära sega vana ja uue metoodika arve.
3. **Testi:** lisa intenti positiivne juht, vale aasta/ühiku või kõrvalteema negatiivne juht ning kontroll, et vastuse allikas on nähtavas tulemusehulgas. Käivita vähemalt `tests/official-knowledge.test.mjs`, `tests/public-forestry.test.mjs` ja seotud adapteritestid.

### Aastaraamat „Mets“

1. **Kontroll:** ava [metsa aastaraamatute loend](https://keskkonnaportaal.ee/et/metsa-aastaraamatud); kinnita uusim loetletud väljaanne, PDF-i URL, lehe **Uuendatud** kuupäev ning aastaraamatu andmeaasta. Need kuupäevad ei ole sama mõiste.
2. **Uuenda:** vaheta runtime'i väljaandeviide alles pärast PDF-i tabeli, lehekülje, ühiku ja metoodikamärkuse kontrolli. Säilita vanem väljaanne, kui mõni toetatud aegrida lõpeb seal.
3. **Testi:** kontrolli, et uus aastaraamat on SMI järel ja puidubilansi ees, kuid ainult võrreldava relevantsuse korral; lisa puuduva tabeli või teise perioodi fail-closed juht.

### Puidubilanss

1. **Kontroll:** ava [puidubilansi ülevaade](https://keskkonnaportaal.ee/et/puidubilanss-ulevaade-eesti-puidukasutuse-mahust); kinnita uusim PDF, selle „seisuga” kuupäev, lehe **Uuendatud** kuupäev ja allika märgitud ligikaudu pooleteiseaastane andmeviive.
2. **Uuenda:** säilita mõiste ulatus — puiduallikad, import, eksport, tootmine, liikumine tööstuses ja lõpptarbimine. Ära esita väljaande aastat jooksva aasta puidukasutusena.
3. **Testi:** kontrolli mõistepäringut, avaldamisviite sõnastust, nähtavat allikat ja negatiivset juhtu, mis küsib veel avaldamata aastat.

## Teadmusväljavõtte uuendamine

HTML-i korpusesünkroon kogub nüüd ka ainult saidikaardis olevaid lehti. Hüdratsiooni vaikeseade on kaks paralleelset päringut ja vähemalt kahesekundiline paus töölise partiide vahel; robots.txt, noindex ja ümbersuunamise piirangud jäävad jõusse. Portaali tulemuste arvu vastuolu katkestab täissünkrooni: seda ei maskeerita eduka täieliku korjena. Korda kontrollitud seemnepäringutega; pooleli jooksnud töö ei anna kogu kataloogi vanade kirjete eemaldamise õigust.

Lehe `.publication-date-author` plokist säilitatakse väljaandja, `Avaldatud` ning `Uuendatud` kuupäev. Andmebaasi `metadata.source_updated_at` tähendab allika avaldatud leheuuendust. `fetched_at` tähendab meie korje aega ja saidikaardi `modified_at` on eraldi tehniline ajamärge; kumbagi ei nimetata avalikus vaates leheuuenduseks. Päev peab olema kalendris olemas. Uus metadata ilmub vanale kirjele alles pärast selle tegelikku uuesti laadimist.

Ebaõnnestunud hüdratsiooni `hydration_attempted_at` ei tõenda edukat värskendamist. Kui katse on sama uus või uuem kui säilitatud sisu korjeaeg, jääb kirje suunavaks tulemuseks, mitte faktivastuse tõendiks; hilisem edukas hüdratsioon võib tõendusõiguse taastada. Avaldamisaasta filter kasutab kuvatud `published` aastat, mitte peidetud uuendamis- või korjekuupäeva.

PDF-ide täissisu automaatne hüdratsioon ei ole selle HTML-korje osa. Kolme uue primaararuande ja olemasoleva aastaraamatu täiendused on käsitsi üle vaadatud, leheküljeviitega kataloogiväljavõtted. Ärge nimetage neid täielikuks PDF-otsinguks.

1. Lisa või muuda dokumenti olemasolevas ametlikus kataloogis; eelista olemasoleva dokumendi täiendamist duplikaadile.
2. Seo dokument ainult nende `_forestryIntentKinds` väärtustega, mida pealkiri, kokkuvõte või sisu ise katab. Sildid üksi ei anna tõendusõigust.
3. Lisa `published`, olemasolul `updated`, avalik HTTPS `url` ja kontrollitav `locator`. `_publishedAt` täpne kuupäev lisatakse ainult siis, kui allikas selle tõendab; pelgale väljaandeaastale ei mõelda avaldamispäeva juurde.
4. Vii `CATALOGUE_REVIEWED_AT` ja versiooniprefiks edasi ainult pärast kataloogi tegelikku korduskontrolli.
5. Muuda `SEARCH_RESPONSE_REVISION` järgmisele `answer-vNN-*` väärtusele, kui vastuse liikmesus, järjestus, allikaväli või sisu muutus; see väldib vana vastusecache'i kasutamist. Lukusta uus väärtus `tests/infrastructure.test.mjs` regressiooniga.

## Codex gateway ja Coolify runtime

Tausta-AI kasutab olemasolevat hosti OMP auth brokerit ja autenditud Codex
gateway'd. OpenAI Codex OAuth jääb hosti; ära kopeeri seda rakendusse.
Rakenduse `LLM_API_KEY` on ainult gateway bearer ja runtime-saladus, mitte
OpenAI OAuth ega Coolify haldustoken. Seda ei lisata build-argumentidesse,
brauserikoodi, reposse ega logidesse.

Coolify rakenduse UUID on `asdyidu5wvjx54d0b09t9rhw`, sisemine app ID `12`.
See kasutab **Dockerfile** build pack'i ja porti `3000`; `compose.yaml` on
eraldi lokaalse stack'i leping ega määra selle tootmisrakenduse runtime'i.

1. Määra Coolify selle rakenduse runtime-keskkonnas turvaliselt `LLM_API_KEY`
   gateway bearer'iga, `LLM_BASE_URL=https://terrapoint.arle.top/v1`,
   `LLM_MODEL=openai-codex/gpt-6-luna`,
   `LLM_ORCHESTRATION=direct`, `LLM_ENABLED=true`, `LLM_REASONING_EFFORT=low`
   ja `LLM_TIMEOUT_MS=14500`. Hoia olemasolevad concurrency-, tokeni-,
   eelarve-, proxy-, andmebaasi- ja privaatsuspiirid alles.
   Eemalda `OPENCODE_GO_API_KEY`, `OPENCODE_ZEN_API_KEY`, `LLM_API_STYLE`
   ja `LLM_FALLBACK_MODEL` runtime'ist: neid enam ei kasutata.
   Ära väljasta võtme väärtust seadistuse või konteineri kontrollimisel.
2. Salvesta runtime enne uue koodi juurutamist. `.github/workflows/deploy.yml`
   käivitub `main` push'il ning teeb GitHub Actionsi `COOLIFY_API_TOKEN`
   saladusega `POST https://coolify.arle.top/api/v1/applications/asdyidu5wvjx54d0b09t9rhw/start`
   ja tühja JSON-kehaga `{}`. Vajadusel kasuta sama rakenduse Coolify Redeploy
   tegevust; paljas juba töötava konteineri restart ei lisa muudetud keskkonda.
3. Jälgi Coolify deployment'i kuni `finished` olekuni täpsel lükatud commit'i
   SHA-l. Kinnita uue konteineri revisjon ja health, `/api/health` revision,
   `/build.json` ning API `X-App-Build` kooskõla. Aktiivne konteiner enne
   06.10.2026 cutover'it oli `asdyidu5wvjx54d0b09t9rhw-132024278705`;
   rolling deploy loob uue nime, nii et vana nime ei tohi püsivalt eeldada.
4. Kontrolli päris brauseri same-origin otsingut ja vähemalt üht piisava
   avaliku tõendiga AI-vastust. Avalik health ei tõenda mudeli tööd ega avalda
   teenusepakkujat. Gateway Responses marsruut on `/v1/responses`; autentitud
   kontroll ja mudeli identiteedi kinnitus toimuvad ainult serveri poolel ilma
   bearer'i, OAuth-i või küsimuse sisu logimata. Mudelitõrge või täis eelarve
   peab jätma alles viidatud deterministliku vastuse, mitte teise varumudeli.
   Tootmine kasutab olemasolevat otsest mudeliteed: nelja järjestikuse
   mudelikutsena töötav `agents` režiim ületas 06.10.2026 live-kontrollides
   14,5-sekundilise ajapiiri. Otsene Luna vastus koos serveri viite- ja
   tõendikontrolliga valmis 6,9 sekundiga. Ära lülita `agents` režiimi sisse
   enne selle tervikvoo tõendatud mahtumist senisesse otsingueelarvesse.

OpenAI ja gateway logimise, säilitamise ning konto andmetöötlustingimused tuleb
enne ametlikku kasutuselevõttu kinnitada eraldi; `store: false` ja keelatud SDK
tracing ei tõenda teenusepoolse logimise puudumist. Täpne andmepiir:
[PRIVAATSUS.md](../PRIVAATSUS.md).

### Proxy aadressi muutumine

Pärast `coolify-proxy` taasloomist kontrolli selle tegelikku siseneva võrgu
aadressi ning uuenda `TRUSTED_PROXY_CIDRS` ainult selle täpse `/32` (IPv4) või
`/128` (IPv6) aadressiga. Ära laienda usaldust kogu Docker alamvõrgule ega
nõrgenda `Origin` või `Sec-Fetch-Site` kontrolle. 06.10.2026 tõrke ajal oli
runtime'is vana `172.19.0.11/32`, kuid tegelik proxy oli `172.19.0.17`;
parandus on juurutatud täpse `172.19.0.17/32` usalduse ja uue runtime'iga. See
aadress ei ole püsiv leping: kontrolli seda iga proxy taasloomise järel.
Avalik avaleht ja health võivad töötada ajal, mil päris brauseri otsing ning
soovitused saavad 403. Seetõttu kontrolli pärast muudatust mõlemat endpoint'i
päris sama päritolu brauseripäistega ning kinnita, et võõras päritolu jääb keelatuks.

## Kontroll ja tootmisse viimine

```bash
npm test
npm run build
npm run test:sites
npm run eval:blind
npm run eval:open
npm run eval:public
```

Eraldi ajalooline kontroll `npm run eval:holdout` kasutab külmutatud v1 komplekti ja sisaldab H05 küsimust, mille nõutud allikas on `statistics-pxweb`. Uue välistamispoliitikaga lõpetab see komplekt „unknown source IDs” veaga, mistõttu see ei ole praeguse allikapoliitika läbiv tootmisvärav. Vana ootus jäeti kontrolli ajal muutmata; seda ei tohi raporteerida läbivana ega numbrilist lävendit vähendada. Uue poliitika negatiivsed vastuse-/graafiku- ja filtriproovid on `tests/official-knowledge.test.mjs`, `tests/statistics.test.mjs` ning `tests/retrieval.test.mjs`. Holdout'i edasine muutmine vajab eraldi versioonitud allikapoliitika ülevaatust.

Seejärel tee diff-review, kontrolli ainult kavandatud faile ja saladuste puudumist, commit'i ning push'i `main` harusse. Valmisolek nõuab kahte sõltumatut tootmistõendit: Coolify kirje peab olema olekus `finished` täpselt `origin/main` commit'i SHA-l ning korduvad API- ja brauseriproovid peavad näitama uue versiooni käitumist. Kontrolli desktopi ja 390 px mobiilivaadet, allikalinke, kuupäevi, filtreid, eestikeelsuse piiri ning värske lehe `scrollY === 0` ja iframe'i mitteaktiivsust.

## Versiooniajalugu

| Versioon | Kuupäev | Muudatus |
|---|---|---|
| 1.0.0 | 01.10.2026 | Allikahierarhia, korjereeglid ning SMI, aastaraamatu ja puidubilansi hooldusprotsess. |
| 1.1.0 | 06.10.2026 | Autenditud Codex gateway, GPT-6-Luna, serveripoolne bearer ning Coolify runtime'i ja exact-SHA redeploy kord. |
