# IT-halduri hooldusjuhend

Uuendatud: 01.10.2026

Dokumendiversioon: 1.0.0

## Püsivad lepingud

- Query-time retrieval on värskuse põhitee; `server/forestry-public.mjs` sisaldab ainult piiratud ja üle vaadatud väljavõtteid.
- Faktivastuse tõend peab tulema samast filtreeritud ja relevantsusjärjestatud tulemusehulgast, mida kasutaja näeb.
- Maandumis- või navigatsioonileht ei tõenda üksikut arvu. Muutuv väärtus vajab seotud adapterit või päringut otseselt katvat versioonitud lõiku.
- Otsing jääb vaikimisi eestikeelseks. Geograafia-, privaatsus-, filtri- ja aegumiskontrolle ei nõrgendata uue termini lisamiseks.
- Uusi Statistikaameti allikaid ei lisata. Olemasolevad kitsad KK51, MM03 ja KK07 diagrammiadapterid säilivad seni, kuni nende testitud leping kehtib.

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

1. Lisa või muuda dokumenti olemasolevas ametlikus kataloogis; eelista olemasoleva dokumendi täiendamist duplikaadile.
2. Seo dokument ainult nende `_forestryIntentKinds` väärtustega, mida pealkiri, kokkuvõte või sisu ise katab. Sildid üksi ei anna tõendusõigust.
3. Lisa `published`, olemasolul `updated`, `_publishedAt`, avalik HTTPS `url` ja kontrollitav `locator`.
4. Vii `CATALOGUE_REVIEWED_AT` ja versiooniprefiks edasi ainult pärast kataloogi tegelikku korduskontrolli.
5. Muuda `SEARCH_RESPONSE_REVISION` järgmisele `answer-vNN-*` väärtusele, kui vastuse liikmesus, järjestus, allikaväli või sisu muutus; see väldib vana vastusecache'i kasutamist. Lukusta uus väärtus `tests/infrastructure.test.mjs` regressiooniga.

## Kontroll ja tootmisse viimine

```bash
npm test
npm run build
npm run test:sites
npm run eval:holdout
npm run eval:blind
npm run eval:open
npm run eval:public
```

Seejärel tee diff-review, kontrolli ainult kavandatud faile ja saladuste puudumist, commit'i ning push'i `main` harusse. Valmisolek nõuab kahte sõltumatut tootmistõendit: Coolify kirje peab olema olekus `finished` täpselt `origin/main` commit'i SHA-l ning korduvad API- ja brauseriproovid peavad näitama uue versiooni käitumist. Kontrolli desktopi ja 390 px mobiilivaadet, allikalinke, kuupäevi, filtreid, eestikeelsuse piiri ning värske lehe `scrollY === 0` ja iframe'i mitteaktiivsust.

## Versiooniajalugu

| Versioon | Kuupäev | Muudatus |
|---|---|---|
| 1.0.0 | 01.10.2026 | Allikahierarhia, korjereeglid ning SMI, aastaraamatu ja puidubilansi hooldusprotsess. |
