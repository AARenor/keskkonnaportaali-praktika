# Otsingu parandused ja üleandmise tõendid

Uuendatud 16.11.2026. See dokument selgitab otsingu valikuid, avalikke allikaid ja mõõtmise piire. See ei tähenda, et Keskkonnaportaal oleks selle praktikarakenduse vastu võtnud või et CMS-i integratsioon oleks tehtud.

## Mida mõõdeti enne muudatusi

Lähtemõõtmine käis 13.11.2026 kell 16:45:02 kuni 16:51:18 UTC avalikul aadressil `https://praktika.arle.top`. Tervisekontroll ja avaldatud lähtekood näitasid mõlemad revisjoni `bd49abab88d98b152b879b431f34bb39ad1f6adc`. Mõõtmisel oli 10 sama baseline faili päringut, üks teise tulemuste lehe päring, samaaegsus üks, päringute alguse vahe vähemalt 3200 ms, vastuse ülempiir 1 000 000 baiti ja tähtaeg 300 000 ms. Kõik kümme otsingupäringut vastasid HTTP 200.

Esimese tulemuste lehe suurus oli kõigil kümnel päringul 12. Kogu tulemuste arv varieerus 35 kuni 974. Otsinguvastus võttis 3992 kuni 19243 ms ja vastuse suurus oli 7534 kuni 18932 baiti. Teine leht mõõdeti päringule „mis on lageraie”: 3277 ms ja 10678 baiti. Kolmel päringul oli vastusekaart vastuseta. Vastusekatse märgiti neljal korral valmis, kolmel korral nõrgenenuks, kahel korral mittekasutatavaks ja ühel korral puuduvaks.

Kümnes päring küsis lageraie pindala muutust 2014 kuni 2024. Vastuses oli üheteistkümne punktiga joondiagramm ning Keskkonnaagentuuri SMI töövihiku 33. tabeli viide. Viimase viie aasta väärtused olid 2020. aastal 29,7, 2021. aastal 27,1, 2022. aastal 32,6, 2023. aastal 32,0 ja 2024. aastal 34,0 tuhat hektarit. Need arvud peavad jääma koos aastate, ühiku ja sama viidatud algallikaga.

Lähteseisu JSON asub failis [evaluation/search_improvements_before_20261113.json](../evaluation/search_improvements_before_20261113.json). See ei sisalda ühegi kümne vastuse juures `usage_telemetry` välja. See tähendab, et kasutatud sisend ja väljundtokenid, mudelikõnede arv ning kulu olid mõõtmata, mitte null.

## Uuem avalik lähtepunkt enne järgmist integreerimist

15.11.2026 kell 23:21:45 kuni 23:23:58 UTC tehtud [mõõtmine](../evaluation/search_improvements_before_integration_20261116.json) on eraldi lähtepunkt. See kasutas sama kümmet baseline päringut. Kõik kümme `POST /api/search` päringut vastasid HTTP 200. Koos teise lehe ning kahe tervisekontrolliga oli kokku 13 HTTP päringut. Mõlemad tervisekontrollid näitasid `status: ok` ja sama avalikku revisjoni `2dcb61d9883f3a25a3e2a247ce0d06e80af6fa01`. Faili `measurement.baselineRevision` osutab vanemale baseline revisjonile `bd49abab88d98b152b879b431f34bb39ad1f6adc`. See ei ole pärast käimasolevaid muudatusi tehtud mõõtmine.

Kõigis kümnes juhtumis oli `answer.format` väärtus `null`, kuid vastuseobjekt oli olemas. Kolme kaardi tekst oli „Vastust ei leitud”. Kümnenda päringu üheteistkümne väärtusega diagramm asus väljal `presentation.chart`. `answer.format: null` ei tähenda, et vastus puudub, ega näita iseenesest tabeli või diagrammi olemasolu. Kõigi kümne päringu kasutusolek oli `missing`; tokenid ja kuluväljad olid `null`, mitte arvuline 0. Need jäävad lahku allpool säilitatud neljast tegeliku kasutusega päringust.

## Töökoopia vastused pärast parandusi

[Sama kümne päringu uus mõõtmine](../evaluation/search_improvements_preview_20261116.json) tehti aadressil `http://127.0.0.1:3001`. Kõik kümme otsingut vastasid HTTP 200 ja olid olekus `deterministic_zero`: uut mudelikõnet ega mudelitokeneid nende vastuste koostamiseks ei kasutatud. See ei ole kogu teenuse kulu mõõtmine. Revisjon oli `development` ja hindaja `revisionStability` oli `unknown`, seega ei ole see fail avaliku väljalaske tõend.

Sisuline võrdlus uuema avaliku lähtepunktiga:

1. „Mis on lageraie” sai varem tingimuste kirjelduse, nüüd definitsiooni. „Mida loetakse lageraiks” jäi varem vastuseta, nüüd selgitab tunnuseid. „Millal on lageraie lubatud” ja „lageraiete tingimused” saavad kehtivate eelduste selgituse, mitte vana RMK uudise põhjal koostatud vastuse.
2. „Mis on mets” sai varem SMI ülevaate ja „mida loetakse metsaks” metsauuenduse tiheduse kirjelduse. Nüüd eristatakse metsa definitsiooni, tunnuseid ja metsamaad. Ka nimisõnaline „metsa definitsioon” viitab Metsaseaduse § 3 definitsioonile, mitte portaali üldisele statistika ja puhkemetsade tekstile.
3. Mõlemad metsateatise esitamise küsimused saavad üldise lõigu asemel neli nummerdatud sammu. [Keskkonnaameti juhise](https://keskkonnaamet.ee/elusloodus-looduskaitse/metsandus/metsateatis-ja-metsaregister) järgi on tavamenetluse tähtaeg 15 tööpäeva; põhjendatud pikendus võib viia kogutähtaja 30 tööpäevani. Raiet saab alustada kümne päeva möödumisel lubamisest ning teha 24 kuu jooksul metsateatise registreerimisest metsaregistris. Alguspunkti ei asendata loa kättesaamise ega esitamise kuupäevaga.
4. Lageraie pindala diagramm säilitab 11 aastaväärtust aastatest 2014 kuni 2024, ühiku tuhat hektarit ja SMI algallika. Definitsioonide ning esitamise sammude juurde dekoratiivset diagrammi ei lisata.

Ühesuguse tähendusega eri sõnastused võivad saada sama vastuse. Eri eesmärkidega küsimusi, näiteks definitsiooni ja loa tingimusi, ei suruta enam sama vastuse alla. Sisuline kontroll hõlmas tegelikke vastuseid ja viidatud allikaid, mitte üksnes HTTP olekut või hindaja kohalikku intenti silti.

## Arhitektuurivalikud

**Üks modulaarne teenus, mitte uued teenused.** Otsing, allikate kogumine, vastuse koostamine ja avalik API kasutavad sama rakendust ning olemasolevat PostgreSQL-i ühendusekogu. Uue teenuse või andmebaasi lisamine tooks juurde juurutuse, saladuste, varukoopiate, jälgimise ja tõrgete piirid, kuid üleandmiseks pole eraldi teenuse lepingut vaja. Jätkame ühe protsessi ja olemasoleva andmebaasiga ning eraldame moodulid tegelike vastutuste järgi.

Refaktori suuruse lähtepunkt on varem avaldatud revisjon `bd49abab88d98b152b879b431f34bb39ad1f6adc`. Tabel võrdleb selle baasi failiridu integreeritud lähtekoodiga. See on lähtekoodi suuruse võrdlus, mitte jõudlustest.

<table>
<thead>
<tr><th>Fail</th><th>Avaldatud bd49</th><th>Praegune tööpuu</th></tr>
</thead>
<tbody>
<tr><td><code>server/search.mjs</code></td><td>9892</td><td>185</td></tr>
<tr><td><code>server/corpus.mjs</code></td><td>4734</td><td>381</td></tr>
<tr><td><code>server/pipeline.mjs</code></td><td>2653</td><td>1525</td></tr>
<tr><td><code>server/llm.mjs</code></td><td>2505</td><td>268</td></tr>
<tr><td><code>server/forestry-public.mjs</code></td><td>1808</td><td>1128</td></tr>
<tr><td><code>src/App.jsx</code></td><td>1841</td><td>1150</td></tr>
</tbody>
</table>

`server/retrieval.mjs` kohta pole avaldatud baasi reaarvu mõõdetud. Praeguses commitimata tööpuus on seal 337 rida.

**Moodulite vastutus.** Koodipiirid eraldavad muutuvad kohustused, kuid ei lisa eraldi käituskeskkonda ega dubleeri andmebaasi ühendusekogu.

* `server/search.mjs` jääb otsingu ja avastusotsingu juhiks. Kataloogi, päringu kanoonimise, privaatsuse, ohutuse ja valdkonna hindamise, allikavaliku, järjestuse ning vastuse koostamise eest vastutavad eraldi otsingumoodulid.
* `server/corpus.mjs` jääb korpuse sünkroonimise ja allikate sisu täiendamise juhiks. `corpus_storage.mjs` omab skeemi, allikapoliitika SQL-i, kirjutusi, mahtu, säilitamist ja vektori täitmist ning kasutab olemasolevat `database.mjs` ühendusekogu. `corpus_query.mjs` omab päringu normaliseerimist, filtreid ja värskuse kontrolli. `corpus_fetch.mjs` omab lubatud HTTPS päringuid, robots poliitikat ning portaali ja ametlike saidikaartide läbimist. `corpus_hydration.mjs` omab HTML sisu ja PDF sisu täiendamist ning salvestamist. `corpus_ingestion.mjs` omab ametlikku avastamist ja kataloogi elutsüklit. `corpus_runtime.mjs` omab korpuseotsingut, avalikku tulemuste vaadet ning reaalajas portaali tagavarateed. `corpus_listing_state.mjs` on ainus korpuse tulemusteakna omanik.
* `server/retrieval.mjs` jääb olekuga päringu juhiks: see koordineerib päringu lubamist, korpuse ja reaalajas allikate otsingut, tagavarateed, lehekülgede koostamist ning akna aegumist ja tähtaegu. Eraldi moodulid omavad duplikaatide sidumist, tõendeid, järjestamist, loendit ja jätkuküsimuse konteksti. Tulemusteaknal ja vahemälul jääb üks selge omanik.

**Piiratud otsinguaken.** Kõik filtrid rakendatakse enne piiratud kandidaadiakent. Vaikimisi kuvatakse 12 tulemust ning lubatud on kuni kaks tulemuste lehte. See hoiab päringukulu ja mälukasutuse stabiilsemana kui tuhandete ridade laadimine andmebaasist teenuse mällu, ent jätab järjestamisele piisava hulga kandidaate. `totalRelation: eq` tähendab täpset arvu ja `totalRelation: gte` alampiiri. Kuvatud leht ja koguarv kirjeldavad filtreeritud tulemusi; piiratud akent ei esitata ekslikult kogu korpuse täpse koguarvuna.

**Keskne päringu intent.** `server/query_intent.mjs` eristab definitsiooni, tunnuseid või kriteeriume, lubatavuse tingimusi, protseduuri, arvulist küsimust ja üldist küsimust. Sama mõtet väljendavad käändevormid saavad sama tüübi. Nii ei lisata iga testküsimuse jaoks uut erandit ega aeta segi näiteks lageraie tähendust ja tingimusi, mille korral see on lubatud.

Hindaja raporti `intent` arvutatakse päringutekstist kohalikult. See ei ole API vastusest saadud käitusaja telemeetria ega tõend selle kohta, mis intent serveris valiti.

**Privaatsuse etapid.** `server/search_query_privacy.mjs` (311 rida) on päringukihi koordinaator ja avalikule pakkujale saadetava päringu minimeerija. See hoiab lahus sõnamustrid, maakonna konteksti, avaliku metsa konteksti, kinnistuseosed, kaitseala tunnused, klauslid ja avalikud erandid. `server/search_privacy_person_rules.mjs` (592 rida) on `classifyPrivacyPersonRules` järjestatud isikureeglite koordinaator. See kontrollib metsaidentiteeti ja selle varast lõppotsust, esmaseid ingliskeelseid kinnistureegleid, isiku ja kinnistu seoseid, kaitseala õigusreegleid, ülejäänud ingliskeelseid ja eestikeelseid rollituvastajaid ning olemasolevaid lõplikke poliitikaotsuseid. Metsa reeglid asuvad 168 reaga failis `server/search_privacy_person_forest.mjs`, seosereeglid 355 reaga failis `server/search_privacy_person_associations.mjs` ning õigusreeglid 221 reaga failis `server/search_privacy_person_regulatory.mjs`. Valdkonna, ülevaadatud küsimuste, kontaktide, klauslite, kaitseala ja avalike erandite reeglid jäävad eraldi moodulitesse.

Privaatsuse kontrolli `true` ja `false` on selle kontrolli lõplikud otsused. `null` tähendab, et otsust veel ei ole ja järjestatud kontroll jätkub. `false` üksi ei luba päringut. Päring peab läbima ka muud ohutuse, asjakohasuse ja poliitika kontrollid.

**Täielik, kuid privaatsust hoidev cache'i ulatus.** Vastuse sobivus sõltub päringu täistekstist, filtritest, allikate või korpuse revisjonist ja poliitikast. Ainult intent'i järgi võtme tegemine segaks eri küsimusi kokku. Vestluse toorandmeid ei salvestata. Vastuse vahemälu ei ole sama mis mudeliteenuse prompt'i vahemälu ega CDN-i HTTP-vahemälu.

**Allikasüntees sama tõendipaki põhjal.** Vastus ja nähtav tulemuste nimekiri lähtuvad samast värskest, filtreeritud ja järjestatud allikahulgast. Mudel võib ühendada eri allikate kasulikud väited, kuid vastuse faktid ja viited kontrollitakse serveris sama tõendipaki vastu. Puuduva tõendi korral jääb alles viidatud allika sõnastus või aus vastus, et tõendist ei piisa.

Tõendipakis on kuni 10 allikat, kuni 4000 märki allika kohta ja kuni 36000 märki kogu serialiseeritud paki kohta. Vaikimisi kasutatakse üht mudelikõnet. Valikulises `agents` režiimis töötavad kaks rollipiiranguga ülevaatajat järjest ning näevad ainult sama pakki. Nende töö ei ava uusi allikaid ega piiramatut konteksti. Need piirid vähendavad korduvat mudelitööd ja hoiavad ülevaatuse tulemuse kontrollitavana.

`server/search_evidence_sanitization.mjs` hoiab `sanitizeLlmEvidenceText` puhastusfunktsiooni eraldi lehemoodulis. Nii saab tõendipaki koostamine allikateksti puhastada, importimata vastuse ja valideerimise tsüklit.

## Otsingu ajalugu ja kerimine

`src/search_history.js` määrab kirje eluea loomisel. Vaikimisi aegub kirje 15 minuti järel ja alles hoitakse kuni 20 kirjet. Vastuse, lehe või kerimisasendi uuendamine ega ajaloost taastamine ei pikenda seda aega. Ajaloo kirje sisaldab päringut, filtreid, valitud lehte, vastust, loendit, revisjone ja kerimisasendit, mitte vestluse käike. Cache'i võti hõlmab päringut, filtreid, lehte ja lehe suurust, päringurevisjoni, tulemusteakna ID-d, allika ja indeksi revisjoni ning poliitikat.

`create` ja `update` on eri toimingud, sest uus otsing vajab uut ID-d ja algab uue elueaga, hilinenud tulemuse salvestus peab aga muutma ainult sama aktiivset kirjet. `update` ei loo aegunud, väljatõrjutud või puuduvat kirjet uuesti ega pikenda selle aegumist. Nii ei ärata hilinenud vastus vana otsingut ellu.

Tulemuste lehe valimine loob uue `practiceSearchId` kirje koos valitud lehe ja kerimisasendiga. Kui uus leht saabub, liigub fookus ja kerimine selle lehe loendi pealkirjale. Tagasi ja edasi liikumine taastab vastava lehe ning salvestatud kerimisasendi uut otsingut kordamata. Hiljem saabuv vastus uuendab algse otsingu kirjet, kuid ei vii lugejat valitud lehelt ära.

Kui brauseri ajaloos on läbipaistmatu aegunud ID, mille taga pole taastatavat päringut, naaseb rakendus avalehele ega käivita uut otsingut. Brauserikontroll `expired_history_back` läbis selle haru nii eraldi kui ka kogu kasutajaliidese kontrollis.

Lehe laadimise callback loeb vastuse hetkeväärtust `searchStateRef.current.result` kaudu. Varem võis enne vastuse mustandit loodud callback mäletada tühja vastust: teise lehe loend saabus, kuid uuesti loodud tulemuste komponent eelistas esimese lehe mustandit. Regressioonikontroll katab nii mõlemad aktiivsed loendid kui ka komponendi uuesti loomise. Ajalookirje ei dubleeri loendit vastuse sees; taastamisel kontrollitakse eraldi salvestatud loendit ja tegelikult kuvatud rida.

## Millal diagramm aitab

Diagramm aitab siis, kui küsimuse taga on kontrollitud arvuline aegrida või kategooriate võrdlus. Näiteks lageraie pindala muutus ajas sobib joondiagrammiks ning raieliikide osakaaluks sobib sektordiagramm. Vastus peab säilitama avaldatud arvud, aastad, ühikud, nimetaja ja algallika viite. Diagramm arvutatakse serveris kontrollitud ametlikust reast, mitte mudeli tekstist.

Mõiste, raieõiguslikud eeldused ja metsateatise esitamise sammud sobivad tekstiks või järjestatud loendiks. Nende kõrvale pole mõtet joonist lisada. Päringus kasutatava baseline komplekti arvulist näidet võrreldakse definitsiooni ja protseduuri päringutega. Mõõtmine salvestab vastuse, tabeli või diagrammi andmed, tsitaadid ning iga päringu tegeliku mudelitöö. Dekoratiivseid pilte ega pildi mudelikõnesid ei tehta.

## Ametlikud metsanduse allikad

[Metsaseaduse kehtiv tekst Riigi Teatajas](https://www.riigiteataja.ee/akt/MS) eristab § 3 järgi metsa ökosüsteemi ja metsamaa tingimusi. Lageraie tähendus tuleb hoida lahus raietingimustest: § 29 lõige 1 kirjeldab lageraie sisu ning lõiked 4 ja 5 selle lubatavuse kriteeriume ja vanusevahemikke. Küsimused „mis on lageraie” ja „mida loetakse lageraieks” küsivad sama põhimõistet, mitte luba konkreetsel kinnistul.

[Keskkonnaameti metsateatise ja metsaregistri juhend](https://keskkonnaamet.ee/elusloodus-looduskaitse/metsandus/metsateatis-ja-metsaregister) ütleb, et omanik või esindaja logib metsaregistrisse ID-kaardi, Mobiil-ID või Smart-ID abil, valib kinnistu, täidab teatise ja esitab selle. Tavamenetluse tähtaeg on 15 tööpäeva. Kui kooskõlastus või metsakaitseekspertiis on vajalik, on Keskkonnaametil metsateatise kontrollimiseks aega kokku kuni 30 tööpäeva. Raiet võib alustada 10 päeva pärast raiet lubavat otsust ning teha 24 kuu jooksul. Üldjuhend ei kinnita konkreetse kinnistu luba.

[Keskkonnaagentuur kirjeldab SMI-d valikuuringuna](https://keskkonnaagentuur.ee/uudised/mis-statistiline-metsainventuur-ehk-smi). 2025. aasta [SMI tulemuste teade](https://keskkonnaagentuur.ee/uudised/statistilise-metsainventuuri-smi-andmetel-metsa-tagavara-stabiilne) nimetab eraldi metsamaa kogupindala ja metsaga metsamaa ehk puistute pindala. Läbi vaadatud materjal ei tõenda, et SMI kasutaks eraldi õiguslikku metsadefinitsiooni, mis oleks seadusega vastuolus. Vastuses tuleb lahus hoida seaduse mõiste ning SMI mõõdetavad pindalanäitajad.

Metsateatise ja tasu vastus peab katma kõik küsimuses küsitud täpsustused, näiteks aasta ja menetluse liigi. 2023. aasta riigilõivu kohta pole selles mõõtmises kinnitatud allikat ega tulemust. Praeguse määra põhjal ei tohi teha järeldust 2023. aasta kohta. See lisaküsimus ei kuulu algse kümne päringuga baseline'i ning seda ei tohi esitada ajaloolise enne ja pärast võrdlusena.

Lühike järelküsimus „Kui kaua menetlus kestab?” säilitab eelmise metsateatise küsimuse teema. Menetlusaega ei asendata esitamise juhise ega teatise 24 kuu kehtivusega. Vastus säilitab nii 15 tööpäeva tähtaja kui ka vajaduse korral kuni 30 tööpäeva kogutähtaja. Tasu ja aasta täpsustused peavad jääma vastuse kontrolli alles. Kontrollitud menetlusaja väljavõte ei vaja uut mudelipäringut: enne peavad läbima kontrolli vastuse sisu, nähtav ametlik allikaviide ja terviklik tõendipakett.

## KeMIT, GitLab, Drupal ja üleandmise piir

Ametlikes allikates nähtav asutus on KeMIT ehk Keskkonnaministeeriumi Infotehnoloogiakeskus. Kasutaja „GEMIT” viitab tõenäoliselt KeMIT-ile. [Digiriigi KeMIT-i profiil](https://digiriik.eesti.ee/index.php/node/138) loetleb Keskkonnaportaali avaliku e-teenusena. [KeMIT-i ametlik veebileht](https://kemit.ee/) kirjeldab asutuse avalikke e-teenuseid.

[Riigihangete registri leping](https://riigihanked.riik.ee/rhr-web/#/procurement/5190661/contracts/9850318) viitab hankele 257158 ja registri sisemisele hanke ID-le 5190661 pealkirjaga „Keskkonnaportaali arendus ja hooldus”. Raamleping 6-2/23/37 nimetab Askend Estonia OÜ, on allkirjastatud 13.03.2023, lõpeb registri järgi 12.03.2027 ning selle staatus on „signed”. See tõendab registris kajastatud lepingut, mitte ainsat või praegust käituspartnerit ega tegelikku arendusvoogu.

[Riigihanke avalike dokumentide loend](https://riigihanked.riik.ee/rhr-web/#/procurement/5190661/documents?group=B) sisaldab 2022. aasta tehnilisi nõudeid. Põhitehnilise kirjelduse dokument 19692293 avaldati 09.12.2022. Punkt 3.7.3 määratleb arenduse infosüsteemi arendamise ja testimisena vastavalt lähteülesandele, disainile ja arhitektuurile. Punktid 6.3.1 ja 6.3.2 kirjeldavad agiilset tööd koos kliendi meeskonnaga ning lähtekoodi automaatset paigaldamist vastuvõtutesti keskkondadesse. Lisa 1 punkt 3 nimetab GitLabi versioonihaldusena. Lisa 3 punkt 3.4.3 nõuab paigaldusjuhendit, mille järgi kliendi administraator saab paigalduse teha välise abita.

Hanke lisa 2 on ASiC konteiner, milles on eraldi PDF-id. Kuueleheküljeline tehnoloogiline profiil „KeM haldusala tehnoloogiline profiil 2021”, versioon 4, jõustus 18.11.2021. Selle lehekülg 6 loetleb Drupal'i sisuhaldussüsteemina, kuid ei nimeta Drupal'i versiooni. Lehekülg 2 nõuab loodava lahenduse üleandmisel GitLab CI/CD või kokkuleppel Jenkinsi paigaldusskripti üleandmist. Eraldi 20 leheküljega mittefunktsionaalsete nõuete PDF-i testimise jaotis leheküljel 19 käsitleb funktsionaalset ja mittefunktsionaalset testimist, aruandeid, jõudlusteste ning OWASP Top 10 kontrolle. Need on 2022. aasta hankedokumendid, mis sisaldavad 2021. aasta profiili, mitte tõendid 2026. aasta töökorralduse või paigaldatud versioonide kohta.

Keskkonnaportaali lähtekoodirepositooriumi, tegelikke juurutuse, sisuhalduse või SSO seadeid ega praktikarakenduse Drupal'i integratsiooni ei ole siin kontrollitud või teostatud. GitLabi [merge request'i juhend](https://docs.gitlab.com/user/project/merge_requests/), [CI/CD juhend](https://docs.gitlab.com/ci/pipelines/), Drupal'i [Composer'i juhend](https://www.drupal.org/docs/develop/using-composer/manage-dependencies) ja [konfiguratsioonihalduse juhend](https://www.drupal.org/docs/administering-a-drupal-site/configuration-management) jäävad üldiseks juhiseks, mitte tõendiks KeMIT-i või Keskkonnaportaali tegelikust praktikast.

Ilma praktikarakenduse ja portaali vahel kokkulepitud integratsioonilepinguta pole põhjust olemasolevat API teenust Drupal'i sees ümber kirjutada. Enne integratsiooni tuleb kokku leppida API leping, autentimine ja SSO, keskkonnad, andmebaasi vastutus, allikate kasutusõigused, varukoopiad, valve ja tagasipööramine.

## Vahepealne töökoopia mõõtmine, mitte väljalaske tõend

Töökoopia järelmõõtmine käis 13.11.2026 kell 20:42:57 kuni 20:44:40 UTC aadressil `http://127.0.0.1:3001`. See on lokaalne loopbacki eelvaade, mitte avalik tootmisaadress. Hindaja kasutas kõiki kümmet baseline päringut. Kõik kümme vastasid HTTP 200 ning ebaõnnestunud otsingupäringuid oli null. Kokku tehti 13 HTTP päringut: kümme `POST /api/search`, üks teise lehe päring ja kaks tervisekontrolli.

Kümne esimese lehe päringu aeg oli 4214 kuni 16193 ms ja vastusemaht 7456 kuni 14857 UTF-8 baiti. Avaliku Cloudflare'i baasmõõtmise vastav vahemik oli 3992 kuni 19243 ms ja 7534 kuni 18932 baiti. Need mõõtmised kasutavad eri ühendusteed, seega ei tõenda nende võrdlus tootmiskeskkonna kiiruse muutust.

Päringu „mis on lageraie” esimese lehe kaks esimest tulemust olid enne ja pärast samad: Metsaseaduse § 29 ning Keskkonnaagentuuri raieinfo uudis. Töökoopia teise lehe päring kasutas esimese lehe `windowId` väärtust, tagastas 12 tulemust ja `windowExpired` oli `false`. See võttis 305 ms ning vastus oli 11517 baiti. Avaliku baasi teine leht võttis 3277 ms ja oli 10678 baiti. Kuna esimene mõõtmine käis avaliku Cloudflare'i ja teine loopbacki kaudu, ei esitata ajavahet kiiruse paranemisena.

Töökoopia `GET /api/health` näitas enne ja pärast mõõtmist revisjoni `development`. Hindaja märkis `revisionStability.status` väärtuseks `unknown` ja lõpetas koodiga 1, sest käituskeskkond ei avaldanud täpset lähterevisjoni. See ei ole läbitud väljalaskevärav ega tõend avaldatud versiooni kohta. Eraldi kohalikus UI elutsükli korduses läbis `history_filters_and_pages` 15 kontrolli, `mobile_home` 4 kontrolli ja `mobile_chat_retry` 5 kontrolli. Kordus ei leidnud ootamatuid päringuid, vastuseid ega konsooli või lehe vigu. Viis tahtlikult tekitatud konsooliviga ja kaks oodatud tühistamist olid eraldi märgitud. See osaline kontroll ei asenda täielikku UI kontrolli ega testikomplekti; käimasolevate muudatuste lõplik kontroll on veel ootel.

Kõigi kümne vastuse päis märkis `cache-control: no-store`. `answerCacheHit` jäi `null` ja rakenduse sisemine cache'i tabamus ei olnud nähtav. Seetõttu ei järeldata vastuse päisest ega `deterministic_zero` olekust cache'i tabamust. Töökoopia buildi päis oli `praktika_preview_20261113_204101`, see ei ole lähterevisjoni tunnus.

Sama kümne päringu sisuline võrdlus:

* „Mis on lageraie” vastas baasis lageraie lubatavuse tingimustega, mitte tegevuse tähendusega. Töökoopia vastus kirjeldas Metsaseaduse § 29 lõike 1 raietegevust, viitas samale paragrahvile ja ütles selgelt, et üldkirjeldus ei kinnita konkreetse kinnistu luba.
* „Mis on mets” viis baasis statistilise metsainventeerimise ülevaateni. Töökoopia vastas Metsaseaduse § 3 ökosüsteemi määratlusega ning eristas selle rahvusvahelisest statistilisest mõistest.
* „Mida loetakse metsaks” vastas baasis metsa uuenemise tingimustega. Töökoopia kasutas § 3 metsamaa välistusi, mis on küsimusega paremini seotud, kuid loetles ainult seda, mida metsamaaks ei loeta. Positiivseid metsamaa tingimusi vastus ei toonud, seega jäi see osaliseks.
* Kolm vastust jäid vastuseta nii enne kui pärast: „mida loetakse lageraiks”, „millal on lageraie lubatud” ja „lageraiete tingimused”. Kahe viimase puhul leidis töökoopia asjakohased Metsaseaduse või Keskkonnaameti allikad, kuid vastus jäi sõnumiks, et vastust ei leitud. Seda ei loeta lahendatuks.
* „Metsateatise esitamine” sisaldas töökoopias allikaviitega samme 1, 3 ja 4, kuid jättis juhendi sisselogimise ehk sammu 2 vahele. Päringu „kuidas esitada raieteatist” vastus jäi üheks üldiseks lauseks, mitte täielikuks sammujuhiseks. Mõlemad vastused märkisid, et üldjuhis ei kinnita konkreetse kinnistu luba.
* Esimese tulemuste lehe kaks esimest allikat jäid samaks. Teisel lehel muutus järjestus: enne oli esimene Harku järve teatiste peatamise uudis, pärast Harku järve lageraie keelamise otsus. Mõlemad olid ametlikud allikad ning töökoopia aken ei olnud aegunud.

Arvuline trendiküsimus tagastas nii baasis kui töökoopias sama üheteistkümne punktiga joondiagrammi. [Keskkonnaagentuuri SMI 2025 töövihiku tabeli 33](https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI%20tulemused%202025/SMI%202025%20tulemused.xlsx) lageraie pindala väärtused olid tuhandetes hektarites: 2014 29,7; 2015 31,6; 2016 32,4; 2017 35,6; 2018 34,6; 2019 29,7; 2020 29,7; 2021 27,1; 2022 32,6; 2023 32,0; 2024 34,0. Töökoopia ei väljastanud tabelit. Hindaja liigitas küsimuse üldiseks, kuigi vastuses oli diagramm. Selle päringu kasutusolek oli `deterministic_zero`, seega mudelitööd ei tehtud. Baasmõõtmise tokenikasutus puudus, nii et varasema mudelitöö kohta järeldust teha ei saa.

Kõik päringupõhised vastused, viited, allikad, lehed, cache'i nähtavus ja tokeniväljad on salvestatud [järelmõõtmise JSON-is](../evaluation/search_improvements_after_20261113.json).

Varasem struktuurimõõtmine võrdleb avaldatud baasi `bd49abab88d98b152b879b431f34bb39ad1f6adc` selleaegse ühendatud töökoopia lähtepuuga, mitte praeguse tööpuuga. `dep-cycles server src` leidis mõlemas mõõtmises null sõltuvustsüklit. `jscpd --reporters ai server src` leidis avaldatud baasis 124 koodiklooni ehk 2,5 protsenti ning varasemas töökoopia mõõtmises 125 koodiklooni ehk 2,3 protsenti. Need arvud ei tõenda otsingu kiiruse ega vastuse kvaliteedi muutust.

Failide reaarvud avaldatud baasis ja varasemas töökoopia mõõtmises:

* `server/search.mjs`: 9892 avaldatud baasis, 7964 varasemas töökoopia mõõtmises.
* `server/corpus.mjs`: 4734 avaldatud baasis, 4117 varasemas töökoopia mõõtmises.
* `server/pipeline.mjs`: 2653 avaldatud baasis, 1456 varasemas töökoopia mõõtmises.
* `server/llm.mjs`: 2505 avaldatud baasis, 261 varasemas töökoopia mõõtmises.
* `server/forestry-public.mjs`: 1808 avaldatud baasis, 1119 varasemas töökoopia mõõtmises.
* `src/App.jsx`: 1841 avaldatud baasis, 1140 varasemas töökoopia mõõtmises. Tolleaegne arv sisaldab taastatud `CalendarDays` importi.

Ühendatud puus on paralleelselt tehtud muudatusi, seega ei omistata neid üksnes otsingu hindajale. Varasemad koodikorduse ja töökoopia reaarvu mõõtmised kirjeldavad varasemat tööpuud, mitte praegust commitimata tööpuud. Praeguse tööpuu `dep-cycles server src` tulemus oli null tsüklit ning viimase esbuild lingi aeg oli 51 ms. Need on piiratud struktuuri ja sidumise tõendid. Täielikud testid, brauserikontroll ja väljalaske kontroll on veel ootel.

## Tokenid ja kulu

Avalikus baasmõõtmises puudus kõigi kümne vastuse juures tokenikasutus ja tegelik kulu. Töökoopia järelmõõtmises oli neli päringut olekuga `actual`, kuus olekuga `deterministic_zero` ning null päringut olekutes `unknown`, `missing` või `cache_hit`. Nelja päris kasutusmõõdu peale oli kokku 23722 sisendtokenit, 0 vahemälust loetud sisendtokenit, 0 arutlustokenit, 581 väljundtokenit ja 24303 tokenit. Mudelikõnesid oli neli, igas tegeliku kasutusega päringus üks.

Nelja `actual` päringu muutmata kasutusmõõdud on eraldi säilitatud failis [search_model_usage_sample_20261113.json](../evaluation/search_model_usage_sample_20261113.json). See märgib need vahepealseks töökoopia vaatluseks, mitte väljalaske kontrolliks. Tervisekontrolli revisjon oli `development` ja tegelik gateway arve teadmata.

Neljast tegelikust mudelikõnest arvutatud keskmine oli 5930,5 sisendtokenit ja 145,25 väljundtokenit, kokku 6075,75 tokenit otsingu kohta. Hindaja stsenaariumid arvutatakse funktsiooniga `estimateLlmUsageScenarios` failis `server/llm_usage.mjs`; need kasutavad ainult nelja tegeliku kasutuse keskmist. Kuut `deterministic_zero` päringut ei segata mudelitöö keskmisega. Nelja tegeliku mudelikõne peale kokku oli 23722 sisendtokenit, 581 väljundtokenit ja 24303 tokenit. Selle nelja päringu võrdlushind oli 0,0026627 dollarit.

Avaliku API hinnakirja võrdluses kasutasin [GPT-6 Luna mudeli lehel](https://developers.openai.com/api/docs/models/gpt-6-luna) ja [OpenAI hinnakirjas](https://developers.openai.com/api/docs/pricing) avaldatud Standardi lühikese konteksti hindu: sisend 0,10 dollarit miljoni tokeni kohta, vahemälust loetud sisend 0,01 dollarit miljoni tokeni kohta ning väljund 0,50 dollarit miljoni tokeni kohta. Järgmise tabeli tokenite kogused on stsenaariumi kogusummad, mis on arvutatud nelja tegeliku mudelikõne keskmise põhjal.

| Mudelipäringuid stsenaariumis | Kokku sisendtokenit | Kokku väljundtokenit | Kokku tokeneid | Illustratiivne USD võrdlushind kokku |
|---:|---:|---:|---:|---:|
| 1 | 5930,5 | 145,25 | 6075,75 | 0,000665675 |
| 10 | 59305 | 1452,5 | 60757,5 | 0,00665675 |
| 100 | 593050 | 14525 | 607575 | 0,0665675 |

Vahepealse kümne küsimusega töökoopiamõõtmise segu sisaldas nelja `actual` mudelikasutusega päringut ja kuut `deterministic_zero` päringut. Selle segu keskmine oli 2372,2 sisendtokenit, 58,1 väljundtokenit ja 2430,3 tokenit kokku. Avaliku hinnakirja võrdlushind oli 0,00026627 dollarit päringu kohta. See kirjeldab ainult mõõdetud kümne küsimuse segu, mitte tavakasutuse prognoosi.

Need on mudelitokenite võrdlushinnad, mitte kogu teenuse kulud, rakenduse kuluarvestus ega arve. Võrdlussummad arvutati sama funktsiooniga eraldi määraobjektil; see ei muuda runtime'i ega mõõtmisfaili seadistatud hinda. Rakendus kasutab `openai-codex/gpt-6-luna` mudelit Terrapointi Codex OAuth gateway kaudu; tegelik gateway arve ja arveldusmäär on teadmata. Seetõttu jäi järelmõõtmise `cost_estimate.amount` väärtuseks `null` ja hinnapõhjendus puudus. Kuue `deterministic_zero` päringu korral oli uut mudelitööd null, mitte kogu teenuse tegelik kulu null.

Eraldi Codex gateway väljundipiiri katse on dokumenteeritud [arhitektuuriülevaates](./ARHITEKTUUR.md). Selle 230 tokenit ei kuulu otsingupäringute valimisse ega hindaja 1, 10 või 100 päringu kasutus- või kulunäidetesse.

Töökoopia hindaja korduskäsk eeldab, et rakendus juba vastab aadressil `http://127.0.0.1:3001`. Uus väljundtee hoiab olemasoleva mõõtmisfaili alles:

```bash
npm run eval:improvements -- --base-url=http://127.0.0.1:3001 --output=evaluation/search_improvements_repeat_20261113.json --baseline=evaluation/search_improvements_before_20261113.json
```

Avaliku juurutuse mõõtmiseks kasuta eraldi väljundfaili pärast juurutust:

```bash
npm run eval:improvements -- --base-url=https://praktika.arle.top --output=/home/arle/AI-drop/praktika_tulemused_20261116.json --baseline=evaluation/search_improvements_before_integration_20261116.json
```

See käsk mõõdab pärast tegelikku avalikku juurutust sama kümmet päringut ning salvestab tulemuse väljapoole repositooriumi, et mõõtmise lisamine ei käivitaks uut juurutust. Enne ja pärast mõõtmist tuleb kirja panna avalik `GET /api/health` revisjon ja `GET /build.json` vastus. `X-App-Build` on rakenduse järgu tähis, mitte lähtekoodi revisjon. Fail `search_improvements_before_integration_20261116.json` on 2dcb avalik lähtepunkt. Algne `bd49` baseline jääb eraldi alles.


See loeb kõik baseline faili päringud järjest, ei kasuta küpsiseid ega autentimist, piirab iga HTTP vastuse ühe megabaidiga ja ei korda päringuid. HTTP ajapiir on lähtekatsega sama 300 000 ms. Otsingu vastuseaken võib kesta kuni 195 000 ms, seega oleks audit-abifunktsiooni 100 000 ms vaikeväärtus aeglase vastuse jaoks liiga lühike.

Kui üks pikk vastus vajab taustatööd, saab kasutada toetatud tööregistrit käsuga `--async`. Taustatöö jääb 300 000 ms kogupiiri sisse, polli viide on 100 kuni 5 000 ms, pollide arv kuni 320 ning tõrke korral saadetakse tühistamine viiesekundilise eraldi ajapiiriga. Serveri töö kõva piir on 285 000 ms. Hindaja ei kirjuta töö ID-d ega võtit väljundfaili.

Kui baseline sisaldab teist lehte, teeb hindaja selle kohe vastava esimese lehe järel. Leheküljeaken kehtib kuni 900 sekundit ja protsessisisene vahemälu hoiab kuni kaheksat akent. Teine leht kasutab esimese vastuse `windowId` väärtust päringu `window_id` väljal. Aegunud aken märgitakse veana, mitte edukaks tühjaks leheks. Olemasolev muutumatu lehe-snapshot säilib tavapäraste allika või indeksi värskuse muutuste korral ning aegub TTL-i või mahupiiri tõttu, allika eemaldamisel, juurdepääsu- või õigusemuudatusel või sõnaselge ohutuse tõttu kehtetuks tunnistamisel. Uus esimene leht kasutab päringu hetke kehtivat revisjoni. Varasem aegumise vaatlus üksi ei tuvasta aegumise põhjust ega tõenda, et lehe-snapshot oli põhjuslikult allika või indeksi revisjoniga seotud. See tekst ei väida, et uut snapshot'i käitumist katvad koodimuudatused oleksid testidega läbinud. Hindaja säilitab ka vanema baseline'i, milles akna ID puudub.

2023. aasta riigilõivu küsimus on eraldi regressioonikontroll, mille kohta varasemat mõõtmist ei ole. Olemasolev hindaja toetab ühe päringuga sisendit; puuduva varasema vastuse korral jäävad võrdluse varasemad mõõdikud väärtusele `null`. See ei tähenda, et varem vastust polnud. Eraldi aruanne kontrollib, et ainult 2024. aasta juulist kehtivat tasu kirjeldav tõend ei muutuks vastuseks 2023. aasta kohta. Kui valitud allikad küsitud aastat ei kata, on aus vastamata jätmine koos allikatega sobiv tulemus. Selle kontrolli jaoks ei pea oletama 2023. aasta tasu ega muutma kummagi salvestatud lähtepunkti andmeid.

## Kontrollitulemused enne avalikku juurutust

`npm test` läbis 1360 testi, ebaõnnestumisi ja vahele jäetud teste oli 0. See täissviit jooksis enne viimast lehekülje callback'i parandust ja vestluse menetlusaja parandusi.

Viimase callback'i ja taastamise regressiooni järel läbis `node --test --test-concurrency=2 tests/search_job_ui.test.mjs tests/search_history.test.mjs` kõik 26 testi. `npm run build` valmis pärast viimast kasutajaliidese rakenduskoodi muudatust. Hilisemad parandused puudutasid serverit, teste ja dokumentatsiooni.

Vestluse ja menetlusaja paranduste järel läbis `MULTILINGUAL_SEARCH_ENABLED=true ALL_ENVIRONMENT_SEARCH_ENABLED=true node --test --test-reporter=tap --test-concurrency=2 tests/forest_notice_quality.test.mjs tests/search_improvements_integration.test.mjs tests/query_intent.test.mjs tests/answer_templates.test.mjs` kõik 54 testi, ebaõnnestumisi ja vahele jäetud teste oli 0. Kaetud on 15 ja 30 tööpäeva, ametlik allikaviide, tasu liitsõnad ja aastaarv, puuduva tõendi tagasilükkamine ning kontrollitud menetlusaja vastus ilma mudelipäringuta.

Sihitud serveritestid vajavad samu kahte keskkonnalippu nagu projekti `npm test`. Lippudeta eraldi jooks andis kolm profiilist sõltuvat viga; nende kolme testi ja vestluse konteksti regressiooni kordus õigete lippudega läbis kõik neli kontrolli.

Viimase viie muudetud faili `biome check` läbis 0 vea ja 0 hoiatusega. See ei muuda allpool kirjeldatud vanemate testiabifunktsioonide leide.

Lõplik Playwrighti kontroll päris eelvaaterakenduse vastu läbis 14 stsenaariumi ja 105 kontrolli. Vaated olid 1280 × 800 ja 390 × 844 pikslit. Kontroll hõlmas mõisteid, raie eeldusi, esitamise samme, aegrida, filtreid, teist lehte, tagasi ja edasi liikumist, aegunud ajalugu, laadimise ajal saabuvat mustandit ning mobiilivestlust. Järelküsimus säilitas metsateatise teema, vastas 15 ja kuni 30 tööpäeva kohta ning viitas õigele Keskkonnaameti juhisele. Brauseri ja API järgu tähised ühtisid. Ootamatuid päringu-, HTTP-, konsooli- ega lehevigu ei olnud. Töölaua esitamisjuhise ja mobiili järelvastuse pilte vaadati üle. See tõendab eelvaadet, mitte veel avalikku juurutust.

Biome ei ole täielikult puhas: viimases sihitud testifaili kontrollis jäi alles 2 viga ja 4 hoiatust olemasolevates testiabifunktsioonides. Esimene viga on `tests/search_job_ui.test.mjs:314:10`, `lint/suspicious/useIterableCallbackReturn`. Neid varasemaid abifunktsioone ei muudetud selle paranduse varjus.

## Avalik kontroll ja tulemuste akna järelparandus

16. novembri esimene avalik kontroll käis järgu `9f64477cfb9ac89ab9f8851b1e1be83a81391936` vastu. `npm run eval:improvements` läbis kümme päringut veata. Kõik kümme vastust valmisid ilma mudelipäringuta. Varasemas võrreldavas mõõtmises jäi kolm neist küsimustest vastuseta, selles mõõtmises mitte ükski. Avaliku saidi Playwrighti kontroll läbis 14 stsenaariumi ja 105 kontrolli ning ei leidnud ootamatuid võrguvigu, konsoolivigu ega lehevigu.

Täiendav teise lehe kontroll näitas aegunud akent. Selle üksiku juhtumi põhjus ei ole tõendatud. Koodis leitud eraldi põhjuslik viga oli siiski selge: tavapärane taustal indekseerimine võis kustutada juba väljastatud akna. Järelparandus eristab andmete värskust ja ohutuse tõttu kehtetuks tunnistamist. Säilitatud aken hoiab algset järjestust ja revisjoni; uus päring loeb värskeid andmeid. Allika eemaldamine, piiravam kasutusõigus, õiguse aegumine ja kontrolli andmebaasiviga tühistavad akna endiselt.

Vahemälu paranduse viis sihitud testifaili läbisid 179 testi. See jooks toimus enne viimaseid kolme valideerimisparandust. Nende järel läbisid leheakna kümme testi ning `MULTILINGUAL_SEARCH_ENABLED=true ALL_ENVIRONMENT_SEARCH_ENABLED=true node --test tests/corpus_index_policy.test.mjs` läbis ühe päris PostgreSQL andmebaasiga integratsioonitesti. Viimane kontrollib eraldi pikka teksti ja lühikest kokkuvõtet, ohutut sisu värskendamist, hiljem lisatud `nosnippet` piirangut, puuduva õigusekirje tagasilükkamist, allika eemaldamist, andmebaasiviga ning vea järel vana akna või poolelioleva kirjutuse tagasilükkamist. Ajutise konteineri eemaldamine on testi kohustuslik väide.

Testandmete ressursivõtmed kasutavad nüüd tootmiskoodi `sourceResourceKey()` funktsiooni. Näiteks Keskkonnaportaali `/et` keeleosa ei kuulu sellesse võtmesse. Algse aadressi kasutamine nii testirea kui ka õigusekirje võtmena läbis SQL-i omavahelise võrdluse, kuid andis tegelikus tekstiprojektsioonis tühja kokkuvõtte. URL ise ja sisu räsi jäid muutmata.

Järelparanduse kaheksa JavaScripti faili `biome check` andis 0 viga ja 2 olemasolevat hoiatust. Need on valikulise ahela soovitused failides `server/corpus_runtime.mjs:90` ja `server/retrieval.mjs:276`; kõrvalise ümbervormindamise vältimiseks jäid need alles. Viimati muudetud regressioonifaili eraldi kontroll oli puhas. Terra kirjutas paranduse ja regressioonid, Sol leidis kolm valideerimisviga ning kinnitas parandatud ploki pärast nende kõrvaldamist. Tegelikud marsruudid olid `openai-codex/gpt-6.1-terra` ja `openai-codex/gpt-6.1-sol`.

Eraldi regressioon tõendas, et varem ainult pealkirjaga kuvatud allika hilisem lubatud täistekst ei tohi vana akent tühistada. Test ebaõnnestus enne parandust ning sama PostgreSQL kontroll läbis selle pärast parandust. Valideerija keelab endiselt varem lubatud indekseerimisõiguse kadumise ja kontrollib iga säilitatud tekstivälja kehtivaid piiranguid.

Aegumise serverilogisse lisati ainult kindlad tõeväärtused ja korpuse olekud: kas aken leiti, kas selle kontrolliandmed olid olemas, kas õiguste kontroll õnnestus ning kas ohutuse põlvkond muutus. Päringut, filtreid, akna ID-d, allikateksti ega autentimisandmeid see logi ei salvesta. See aitab eristada puuduva akna ja õiguste kontrolli tõrget, tegemata ühe aegumisjuhtumi põhjusest oletust.
