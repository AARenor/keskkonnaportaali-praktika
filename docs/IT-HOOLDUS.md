# IT-halduri hooldusjuhend

Uuendatud: 10.10.2026

Dokumendiversioon: 1.2.1

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

HTML-i korpusesünkroon kogub ka ainult saidikaardis olevaid lehti. Täissünkroon kasutab kuni kahte paralleelset hüdratsioonipäringut ja 400 ms pausi partiide vahel; taustakorje kasutab kuni kahte paralleelset päringut ja ühesekundilist pausi. `robots.txt`, `noindex` ja ümbersuunamise piirangud jäävad jõusse. Kui `robots.txt` keelab portaali otsinguotsa, jätkub sünkroon saidikaardi ja kataloogikirjetega ning jooksu detailidesse märgitakse `catalogSkipped: "robots-disallowed"`; keelatud rada ei avata ja vanu kirjeid ei eemaldata. Portaali tulemuste arvu vastuolu katkestab täissünkrooni: seda ei maskeerita eduka täieliku korjena. Korda kontrollitud seemnepäringutega; pooleli jooksnud töö ei anna kogu kataloogi vanade kirjete eemaldamise õigust.

Lehe `.publication-date-author` plokist säilitatakse väljaandja, `Avaldatud` ning `Uuendatud` kuupäev. Andmebaasi `metadata.source_updated_at` tähendab allika avaldatud leheuuendust. `fetched_at` tähendab meie korje aega ja saidikaardi `modified_at` on eraldi tehniline ajamärge; kumbagi ei nimetata avalikus vaates leheuuenduseks. Päev peab olema kalendris olemas. Uus metadata ilmub vanale kirjele alles pärast selle tegelikku uuesti laadimist.

Ebaõnnestunud hüdratsiooni `hydration_attempted_at` ei tõenda edukat värskendamist. Kui katse on sama uus või uuem kui säilitatud sisu korjeaeg, jääb kirje suunavaks tulemuseks, mitte faktivastuse tõendiks. Seitsme päeva järel saab kirje tagasi piiratud taustakorje järjekorda; tegelik ooteaeg sõltub järjekorrast. Edukas lugemine asendab sisu ja eemaldab vana katsemärke. See taustapäring vajab PostgreSQL 16 või uuemat versiooni. Avaldamisaasta filter kasutab kuvatud `published` aastat, mitte peidetud uuendamis- või korjekuupäeva.

10.11.2026 kirjutuskaitstud loendus leidis 43 709 kättesaadavat kirjet ja 41 631 salvestatud tekstiga kirjet. 31 891 varem edukalt loetud ametlikust lehetekstist oli vaid 84 loetud viimase seitsme päeva jooksul; 31 807 olid vanemad ning 7 213 lehe viimane värskendus oli ebaõnnestunud või vahele jäetud. Need arvud kirjeldavad kontrollihetke. Salvestatud tekstide arv ei ole sama mis värske faktitõendi arv.

PDF-ide täissisu automaatne hüdratsioon ei ole selle HTML-korje osa. Kolme uue primaararuande ja olemasoleva aastaraamatu täiendused on käsitsi üle vaadatud, leheküljeviitega kataloogiväljavõtted. Ärge nimetage neid täielikuks PDF-otsinguks.

1. Lisa või muuda dokumenti olemasolevas ametlikus kataloogis; eelista olemasoleva dokumendi täiendamist duplikaadile.
2. Seo dokument ainult nende `_forestryIntentKinds` väärtustega, mida pealkiri, kokkuvõte või sisu ise katab. Sildid üksi ei anna tõendusõigust.
3. Lisa `published`, olemasolul `updated`, avalik HTTPS `url` ja kontrollitav `locator`. `_publishedAt` täpne kuupäev lisatakse ainult siis, kui allikas selle tõendab; pelgale väljaandeaastale ei mõelda avaldamispäeva juurde.
4. Vii `CATALOGUE_REVIEWED_AT` ja versiooniprefiks edasi ainult pärast kataloogi tegelikku korduskontrolli.
5. Muuda `SEARCH_RESPONSE_REVISION` järgmisele `answer-vNN-*` väärtusele, kui vastuse liikmesus, järjestus, allikaväli või sisu muutus; see väldib vana vastusecache'i kasutamist. `tests/infrastructure.test.mjs` peab kontrollima, et eri versioonid annavad eri cache'i võtme.

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
   ja `LLM_TIMEOUT_MS=45000`. Hoia olemasolevad concurrency-, tokeni-,
   eelarve-, proxy-, andmebaasi- ja privaatsuspiirid alles.
   Toetatud effort'id on `low` ja `medium`; `minimal` ja `none` peatavad
   käivituse. 3200 väljundtokeni taotlus on rakenduse eelarvereserv, mitte
   kontrollitud Codex wire'i jõustatud väljundipiir.
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
   14,5-sekundilise ajapiiri. Üks varasem otsene Luna vastus koos serveri viite-
   ja tõendikontrolliga valmis 6,9 sekundiga; see ei ole praeguse muudatuse
   latentsusgarantii. Ära lülita `agents` režiimi sisse enne selle tervikvoo
   tõendatud mahtumist senisesse otsingueelarvesse.

### Vastuse kvaliteet ja vahemälu

Pikk loomulik küsimus suurendab laia `OR`-vastet. Korpuse järjestus piirab täpse valemi kandidaadiaknaga, kuid `DATABASE_QUERY_TIMEOUT_MS` (vaikimisi 8000 ms) jääb rangeks piiriks. Kui korpusepäring ületab selle, tagastab `searchCorpus` oleku `degraded` ja avalik vastus jääb kataloogi või otsingutulemuste tasemele. Kontrolli siis `DATABASE_QUERY_TIMEOUT_MS`-i, korpuse mahtu ja seda, kas lehepäring ise mahub eelarvesse; ära tõsta piiri pimesi ega tõlgenda degradeerunud vastust väitena, et andmeid ei ole.

Metsa valeväidete vastus vajab artikli sisust väite–selgituse paari, mitte pealkirjavastet või üldist SMI ülevaadet. Avaldamisaeg ja ajaloolise selgituse piirang peavad jääma nähtavaks. Täielik paaritatud vastus ei vaja sõnastusmudeli kutset; kontrolli sama päringut korrates ka deterministliku vastusevahemälu taasesitust ning allika- ja aastafiltri muutmisel vana vastuse eemaldumist.

Vastuse kvaliteedi mõõtmisel loe `answerAttempt` välja, mitte ainult `status`-t: `reason: "none"` tähendab mudeli enda avaldatud teksti, `no-new-contribution` ja `local-rejected` tähendavad deterministlikku viidatud algvastust, `not-applicable` tähendab struktureeritud teed ilma mudelikutseta. „Roheline” staatus ei tõesta, et mudel vastas. Mõõtebaterii tuleb teha värskelt kliendilt või pärast konteineri taaskäivitust: libiseva akna eelarve (vaikimisi 15 päringut ja 120 000 tokenit kliendi kohta tunnis) on protsessisisene ja täitub kiiresti, sest reservatsioon arvestab ühe tokeni iga tõendipaki baidi kohta. Täis kvoodiga jooksub näitab enamik ridu `budget-exhausted`, mis ei ole kvaliteediregressioon.

Live hindamise 15,5 sekundi lävend on rangem jõudluseesmärk, mitte serveri 50 sekundi JSON-otsingu ülempiir. Hindamis- ja grounding'u skriptid ootavad kuni pikima lubatud 60 sekundi otsingutähtaja ja kümnesekundilise võrguvaru lõpuni, et aeglast vastust ei peetaks ekslikult katkestuseks.

Kontrollireeglid on intentide kaupa (`server/llm.mjs` `assertAnswerAddressesQuery`): kaitse-osa, metsamaa pindala ja meetod, metsasus, puuliigid, kliimamõju, andmeallikate eristus ja metsa kadumine omavad igaüks oma sisulist nõuet ning ülejäänud intentid kasutavad 75% tüvede kattuvust. Kui tavalise sõnastusega küsimus hakkab ootamatult andma „Vastust ei leitud”, kontrolli kõigepealt kahte kohta: kas `resolvePublicForestryIntent` tabab käändevormi (`kaitsealuse\w*`, `kuiv(?!end)\w*`, `puuliik`), ja kas vastava intenti kontroll nõuab sõna, mida hea vastus ei pea kordama.

Süsteemijuhis on stabiilne ja tõendipakk eelneb muutuvale küsimusele. See võimaldab provider'i prompt-cache'i, kuid ei tõenda tabamust. 22.10.2026 sama tõendipakiga päris Responses-kontrollides oli `cached_tokens=0`, sealhulgas eraldi tõendi- ja küsimussõnumiga ning `prompt_cache_key` katsetes. Gateway ei toetanud proovitud explicit-cache parameetreid; rakendus neid ei saada. Ära raporteeri ühisprefiksi pikkust cache hit rate'ina ega vähenda tokenieelarvet oletatava cache-soodustuse võrra.

Saidikaardi madalam kvaliteet ei tohi üle kirjutada valideeritud lehe sisu, räsi, lugemisaega ega `metadata.source_kind` päritolu. Varasema vastuoluga hüdratsioonirida jääb navigeerimisallikaks kuni tegeliku uue lubatud HTTPS-lugemiseni; taustapartii eelistab neid ridu. Ära paranda tõendiõigust massilise metaandme-UPDATE'iga. Robots-, noindex-, päritolu-, mahu- ja värskuspiirid jäävad kehtima.


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

10.10.2026 kordus sama tõrge pärast proxy taasloomist: rakendus usaldas
`172.19.0.17/32`, kuid `coolify-proxy` tegelik aadress rakendusega ühises
`coolify` võrgus oli `172.19.0.6`. Coolify rakenduse 12 runtime-muutuja
uuendati täpsele `172.19.0.6/32` aadressile. Juurutus 326
(`a24bda57-418a-45fb-9e58-369bc79c11be`) lõppes `finished` olekus samal
tootmisrevisjonil `197166c9e7fc2c73eaf377adc7874fea95eeaa5f`; rakenduse koodi
ei muudetud. Uus konteiner on healthy ning avalik health kinnitas sama SHA.
`https://praktika.arle.top` päris brauseri `mets` otsing andis viidatud vastuse
ja 1607 tulemust; soovitused ning sama päritolu JSON-otsing andsid HTTP 200.
`jäätmete ringlussevõtu määr Eestis 2023` vastas 37,9%. Võõra `Origin`-iga
otsing ja soovitused andsid endiselt HTTP 403, ka võltsitud `same-origin`
päisega. Vana `praktika.arleserver.cfd` suunab brauseri kanoonilisele domeenile
`praktika.arle.top`.

10.11.2026 staatiline Trivy kontroll leidis senises praktikarakenduse Alpine'i baasis kolm kõrge raskusastmega CVE leidu viies paketikirjes. Uus kinnitatud `node:24-alpine` baaskujutis `sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8` ei andnud sama andmebaasiga kõrge ega kriitilise raskusastmega Alpine'i paketileidu. See on kontrollihetke sõltuvusülevaade, mitte tõend rakenduse rünnatavusest või turvalisusest.

Sama päeva `npm audit` leidis enne lukufaili uuendamist kümme mõjutatud paketti, neist ühe kriitilise ja seitse kõrge raskusastmega. Pärast ühilduvate sõltuvusversioonide uuendamist vastas kogu lukufaili audit `found 0 vulnerabilities`. Käimasolev eraldi arenduskonteiner kasutab endiselt varem paigaldatud `node_modules` puud; tootmiskujutis paigaldab sõltuvused lukufailist uuesti.

Esimese uuendatud kujutise täiskontroll leidis veel kuus kõrge raskusastmega teadet baaskujutise `npm` tööriista enda sõltuvustes, mida rakenduse lukufaili audit ei hõlma. Tootmise käituskihist eemaldatakse pärast sõltuvuste paigaldamist `npm` ja `npx`, mida töötav server ei kasuta. Uue kujutise Trivy kontroll leidis seejärel nii süsteemipakettide kui ka Node'i pakettide seas null kõrge või kriitilise raskusastmega teadet.
Võrguta ajutises konteineris käivitus uus käituskiht ilma mõlema tööriistata ja `/api/health` vastas HTTP 200. Metsaomaniku toetuste otsing vastas samuti HTTP 200 ja leidis uue toetuste allika. Andmebaasi ja mudeliteenuse tööd see eraldi proov ei tõenda.

## Praktikaserveri varukoopia

10.11.2026 selgus, et serveri `arle-daily-backup` töö kasutas `docker ps` vormingus välja `.Config.Image`. Docker lükkas selle tagasi ja PostgreSQL-i varukoopiate tsükkel jäi tühjaks, kuigi töö lõpetas edukalt. Skript kasutab nüüd välja `.Image` ning loeb andmebaasi kasutajanime konteineri enda `POSTGRES_USER` seadest. Puuduva konteineriloendi või ebaõnnestunud andmebaasikoopia korral on töö ebaõnnestunud; viimase korral ei kärbita olemasolevaid snapshot'e. Muudatus kontrolliti eraldatud eduka ja vigase töö näidetega, kuid järgmine automaatne jooks ei olnud kontrolli ajal veel toimunud.

Eraldi projekti PostgreSQL-i koopia salvestati kaitstud asukohta `/srv/ai/backups/db-dumps/praktika_project_20261110T191540Z.dump`. See taastati võrguta ajutises PostgreSQL 17 konteineris: korpuses oli 43 979 kirjet. Sama faili krüpteeritud restic-snapshot loeti tagasi ja SHA256 kattus lähtefailiga. See tõendab konkreetse koopia taastamist, mitte kogu varundussüsteemi või taastamisaja eesmärgi täitmist.

Restic-hoidla asub samas serveris. Enne ametlikku üleandmist tuleb kokku leppida ka serverist eraldi paiknev kaitstud varukoopia, ligipääs, säilitus ja korduv taastamise proov. Andmebaasi täielik `pg_dumpall` võib sisaldada teiste andmebaaside andmeid ja rollide parooliräsisid; käsitle seda piiratud ligipääsuga salajase materjalina.

## Kontroll ja tootmisse viimine

Käivita mõjutatud allika-, grounding'u-, liikmesuse-, graafiku-, cache'i- ja lõppoleku tarbijatestid pärast kõigi ühiste lepingute kooskõlastamist. Alles nende järel käivita terviktestid, build, Sites-tarbijad ja eval'id. Ära pikenda regressiooni kõrvaldamiseks seadistatud otsingueelarvet, mudeli ajavaru ega kvoote. Välise mudeli edukas dispatch ei tõenda `ready` lõppolekut: kontrolli lõppvastuse uut toetatud väidet, nähtavat lokaatorit ning privaatset lõpp-provider/olek kirjet eraldi katse põhjusest. Privaatsed `acceptedClaims`, binding-räsid, pakiversioon ja katseandmed ei tohi jõuda avalikku vastusesse.

Avaliku kasutatud viite `evidenceExcerpt` peab olema sama immutable pack entry täielik `content`, mitte uus 900-märgiline aknavalik. Kontrolli algallika täisväidet koos ühiku, aasta, nimetaja ja kvalifikatsioonidega; kaitstava metsamaa ETAK-i 2024 range kaitse näitaja 16,8% sisaldab projekteeritavaid alasid. Mudeli/local/public piirid jäävad 10/4000/36000 juurde. Cache-envelope on `privacy-safe-v7` ning korduskontrollis peavad säilima sama allika `published`, `updated`, `dataYear`, `dataAsOf` ja locator; tundmatu `checkedAt` jääb `null`.

```bash
npm test
npm run build
npm run test:sites
npm run eval:blind
npm run eval:open
npm run eval:public
```

Eraldi ajalooline kontroll `npm run eval:holdout` kasutab muutmata külmutatud v1 komplekti ja selle algseid lävendeid. H05 nõuab praeguse avaliku poliitikaga välistatud `statistics-pxweb` allikat: evaluator säilitab selle rea, annab `rank: null` ja `excluded-publisher` põhjuse ning arvutab kõik näitajad kõigi 40 algse rea pealt. Muud vanad allikaootused jäävad samuti tegeliku asetuse või puudumisega raportisse; ajaloolist mitteläbimist ei nimetata roheliseks ega leevendata lävendeid. `node scripts/evaluate-relevance-holdout.mjs --dataset=environment_search_holdout_v2.json` on eraldi arenduskomplekt samade 40 küsimusega, mitte v1 asendus või uus pime holdout. Uue poliitika negatiivsed vastuse-/graafiku- ja filtriproovid jäävad tarbijatestidesse.

10.11.2026 sai v1 kontroll esikohale 38 allikat 40 võimalusest ja lõpetas endiselt veakoodiga 1. H05 on teadlikult välistatud väljaandja; H11 ootab vana suunamiskaarti `forest-overview`, kuid praegune vastus seob mõõtmise ja meetodi eraldi tõendid. Kümne küsimusega pimealade komplekt sai 10 esikohta ning 147 küsimusega arenduskomplekt läbis kõik juhud. Arenduskomplekt ei ole sõltumatu pime test.

11.11.2026 läbis pärast paralleelsete muudatuste liitmist eraldi paigaldatud uuendatud sõltuvustega täissviit kõik 897 testi. Kohalik proov, mis vastas 21 sekundi pärast, kinnitas eraldi, et filtriaudit ja live holdout ei katkesta enam päringut 20 sekundi järel. Rakenduse build ja kolm Sites'i tarbijatesti läbisid.

Pärast nõutud kontrollide läbimist ja tellija juurutusluba tee üks koondatud diff-review, kontrolli ainult kavandatud faile ja saladuste puudumist ning alles siis commit'i ja push'i `main` harusse. Valmisolek nõuab kahte sõltumatut tootmistõendit: Coolify kirje peab olema olekus `finished` täpselt `origin/main` commit'i SHA-l ning korduvad API- ja brauseriproovid peavad näitama uue versiooni käitumist. Kontrolli desktopi ja 390 px mobiilivaadet, allikalinke, kuupäevi, filtreid, eestikeelsuse piiri ning värske lehe `scrollY === 0` ja iframe'i mitteaktiivsust.

## Versiooniajalugu

| Versioon | Kuupäev | Muudatus |
|---|---|---|
| 1.0.0 | 01.10.2026 | Allikahierarhia, korjereeglid ning SMI, aastaraamatu ja puidubilansi hooldusprotsess. |
| 1.1.0 | 06.10.2026 | Autenditud Codex gateway, GPT-6-Luna, serveripoolne bearer ning Coolify runtime'i ja exact-SHA redeploy kord. |
| 1.2.0 | 06.10.2026 | Allika võrdlusidentiteet ja lokaatoriga witness, üks muutumatu tõendipakk, semantilise versiooni eristus, lõppvastuse järgi määratud provider/olek ning külmutatud v1 aus raport eraldi v2 arenduskomplektist. |
| 1.2.1 | 10.10.2026 | Proxy aadressi kordustõrke runtime-parandus ja tootmise brauseri/API turvapiiri kontroll. |
