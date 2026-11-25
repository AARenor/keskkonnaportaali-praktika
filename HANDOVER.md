# Praktika valitsusüleandmise kaart

See fail kirjeldab süsteemi, 24. ja 25. novembri 2026 öise töö tulemusi ning juurutamise ja hoolduse kontrollimiseks vajalikke käske.

## Süsteemi ülevaade

Praktika on keskkonnaalaste ametlike allikate otsingu ja tõendipõhise vastuste prototype. Tootmine asub aadressil `https://praktika.arle.top`.

| Osa | Asukoht | Ülesanne |
|---|---|---|
| Veebiliides | `src/` | Otsing, tulemused, vastused, dokumendilehed |
| Server | `server/` | Otsing, allikapoliitika, korpuse haldamine, vastuse kontroll |
| Andmebaas | PostgreSQL | Dokumendikataloog, sisu, allika identiteedid, otsinguindeks |
| Korpuse sünkroonimine | `server/sync-corpus.mjs` | Ametlike sitemap'ide leidmine ja lehtede lugemine |
| Juurutamine | Workflow salvestab eelmise revisioni, seiskab vana konteineri, ootab uut juurutust ja kontrollib elusversiooni | Commit `c0117b4` juurutati, Coolify märgis `finished`, elusloendur tagastas sama SHA |
| Kasutusjuhend | `docs/KASUTUSJUHEND.md` | Lõppkasutaja juhend |
| Tehniline hooldus | `docs/IT-HOOLDUS.md` | Käskused, piirid, tõrkeotsing |
| Arhitektuur | `docs/ARHITEKTUUR.md` | Moodulid, andmevood ja piirangud |
| Allikad | `docs/ALLIKAD.md` | Lubatud allikad ja tõendipoliitika |
| Vastuvõtutõendid | `acceptance-evidence.md` | Juurutatud versioonide mõõtmised |

## Öise töö peamised muudatused

| Ala | Mis parandati | Miks see oli vajalik |
|---|---|---|
| Andmebaasi ühendus | Coolify privaatne andmebaasihost tõlgitakse tööaja URL-ist ühetasemelt hostiks | Vanasti võis server lugeda privaatset hosti avalikuks ja keelduda plaintext TLS ühendusest |
| Juurutamine | Workflow kontrollib commit'i, seiskab vana konteineri, ootab uut juurutust ja kontrollib elusversiooni | Push ei tõendanud veel tootmises uut koodi |
| Korpuse katvus | Lisandus avalike sitemap'ide ja andmebaasi võrdlev audit | Varasem aruanne näitas ainult andmebaasisolevaid ridu |
| Korpuse täitmine | Taustaindeksi taustatäide ei oota nüüd mahaloenduri lukku | Lukku võtmine põhjustas hüdratsiooni päringu aegumise |
| Otsingu jõudlus | Kolm kvadratist mustrit asendati lineaarse skannimisega | Pikk sisend võis blokeerida serveri päriselt |
| Õigusaktide feed | XML ja JSON voog on piiratud baitidega | Liiga suur välisvastus ei pääse parserisse ega logisse |
| Mudelivastuste kontroll | Jäljendatud tõendid eemaldatakse enne avalikku vastust ja logisse jätmiseks redigeeritakse jälg | Välismudeli tekst ei tohi muuta nähtavat allikat ega jätta sisemist jälge |
| Korpuse allikad | Allika identiteedi migratsioon ja testid on tihedamad | Vale allika võrdlemine võis muuta katvusaruande |
| Dokumentatsioon | Hooldusjuhendisse lisandusid uued piirid ja tõrkehoolduse reeglid | Valitsusüleandmine eeldab korduvat käivitamist ilma algset arendajat |

## Andmebaasi hetkeseis

25. novembri 2026 lõplik audit pärast kahte hüdratsioonikäivitust:

| Näitaja | Väärtus |
|---|---:|
| Kataloogi read kokku | 44 420 |
| Saadaoleva sisuga read | 42 200 |
| Loetud sisuga read | 42 156 |
| Avalike sitemap'ide leitud URL-e | 42 457 |
| Andmebaasis leitud avalikke URL-e | 42 457 |
| Andmebaasist puuduvad avalikud URL-id | 0 |
| Avalikud URL-id ilma loetud sisuta | 796 |
| Poliitikaga väljajäetud sisu | 11 |
| Vana viimase külastuse ajaga | 0 |
| Ainult andmebaasis olevad URL-id | 192 |

Esmase täitmise käigus töödeldi 1 000 kirjet: 73 sisu lisati, 433 jäi vahele ja 494 lugemist ebaõnnestus. Ametlike ja portaali sitemap'ide tühjade kirjete sihitud täitmise käigus töödeldi 767 kirjet: 0 sisu lisati, 283 jäi vahele ja 484 lugemist ebaõnnestus. Tõrked olid peamiselt HTTP vastused, robots keeld, liiga suured lehed ja allika poolt välja jäetud sisu. Näiteks kliimaministeeriumi renoveerimise lehel on `noindex`, mistõttu sisu ei salvestata.

See on täielik URL katvus heakskiidetud ametlike allikate hulgas, mitte kogu interneti peegeldus. Allikate hulk on tahtlikult piiratud. Õigusaktide täisteksti ei salvestata: see loetakse iga kord Riigi Teataja voost.

## Kontrollid

| Kontroll | Käsk | Tulemus |
|---|---|---|
| Täisautomaattestid | `env -u DATABASE_URL -u DATABASE_SSL_MODE npm test` | 1448 läbitud, 0 ebaõnnestunud, 810,9 sekundit |
| Ehitus | `npm run build` | Läbitud, 1603 moodulit |
| Sites ehitus | `npm run test:sites` | 3 läbitud, 0 ebaõnnestunud |
| Workflow | `actionlint .github/workflows/deploy.yml` | Läbitud |
| Andmebaasiühenduse test | `node --test tests/coolify_private_database_host.test.mjs` | Täisautomaattestide osa |
| Korpuse katvus | `node scripts/audit-corpus-coverage.mjs --compare-public --fail-on-gap` | Väljuskood 2: 0 puuduvat URL-i, 796 avalikku URL-i ilma loetud sisuta |
| Avaliku otsingu kvaliteedivärav | `npm run eval:public` | 147/147, kõik viis näitajat 1,0 |
| Sõltuvused | `npm audit --omit=dev` | 0 haavatavust |
| Failisüsteem | `trivy fs --scanners vuln --quiet .` | `package-lock.json` jaoks 0 haavatavust |
| Importitsüklid | `dep-cycles server src scripts` | Ei leitud tsükleid |
| Dubleerimine | `jscpd --reporters ai server src scripts` | 134 klooni, 2,2% |
| Turvaskann | `semgrep --config auto` muudetud failidel | 0 viga, 13 dünaamilise mustri hoiatusut üle vaadatud |
| Saladuste skann | `gitleaks detect --no-git -s . --redact` | Jälgitud failides 0 leidu |

Semgrepi hoiatused puudutavad dünaamilisi RegExp objekte. Päringutüved normaliseeritakse tähtedeks ja numbriteks, seadustermid läbivad `escapePattern`, akronüümid on suurtähed ja modaalsõnad on konstandid. Kontrollitud sisendid ei võimalda mustri süstamist.

Hadolint näitab kolme hooldushoiatusut: Apache paketi versioon pole kinnitatud, kasutajanimi pole number ja health check on shell vormis. Need ei takista praegust ehitust.

## Käivitamine ja hooldus

Kõik käsud käivitatakse repositooriumi juurkataloogist.

| Ülesanne | Käsk |
|---|---|
| Kohalik arendus | `npm run dev` |
| Täistestid | `env -u DATABASE_URL -u DATABASE_SSL_MODE npm test` |
| Ehitus | `npm run build` |
| Korpuse sünkroonimine | `npm run sync:corpus -- --hydrate-limit=1000` |
| Andmebaasi aruanne | `node scripts/audit-corpus-coverage.mjs` |
| Avaliku katvuse aruanne | `node scripts/audit-corpus-coverage.mjs --compare-public --fail-on-gap` |
| Tootmise tervis | `curl -fsS https://praktika.arle.top/api/health/container-readiness` |
| Tootmise ehitus | `curl -fsS https://praktika.arle.top/build.json` |

Tootmises vajab korpuse käsk `DATABASE_URL` ja `SEARCH_HASH_SECRET` väärtusi. Need käivitatakse Coolify konteineri sees, kus need juba olemas on.

## Teadaolevad piirangud

- Otsing on eestikeelne, kuni `MULTILINGUAL_SEARCH_ENABLED=true` ei ole juurutatud.
- Avalik otsing tugineb heakskiidetud allikatele ja teemadele. Kui piisavat tõendit ei leita, näidatakse tulemusi ja sõnumit, et vastust ei leitud.
- PDF sisu loetakse piiratud mahus, lehekülgede arvus ja ajaga. Skaneeritud PDF ilma tekstikihita jääb otsimata.
- Korpuse katvuse aruanne kontrollib ainult heakskiidetud allikate sitemap'e.
- Andmebaasis olevad vanad dokumendid ei ole automaatselt avalike sitemap'ide osa. Need kustutatakse alles allika poliitika ja säilitusreeglite järgi.
- Avalik API ei väljasta mudeli nime, teenusepakkujat, andmebaasi ega sisemisi skoore.

## Juurutamise tõend

Lõplik versioon on `c0117b4a831f28082ccc4b3038e832adcf588960`. GitHub Actions töövoog `45536113174` lõppes `success` 12 minuti ja 50 sekundiga. Coolify juurutuse UUID `tffqlmx5g3jgoyzvmijnr6n0` märgitati `finished` kell 03:06:09 UTC ja rakendus oli `running:healthy`. `/api/health/container-readiness` tagastas sama SHA ja `/build.json` vastas HTTP 200.

Tootmises käivitatud `node server/sync-corpus.mjs --hydrate-limit=0` lõppes olekuga `ready`, leidis kataloogist 5 976 tulemust ja seemnepäringu `mets` ajutine allikaviga ei katkestanud sünkrooni. Sünkroon jätkas seega sitemap'ide ja kataloogiga töötamise. Korpuse lõplik audit leidis kõik 42 457 avaliku sitemap URL-i andmebaasist, puuduvaid URL-e 0. Loetud sisu puudus 796 URL-il, need jäid allika HTTP vastuse, `robots.txt` keelu, liiga suure lehe või väljajätmise tõttu.

Brauserikontroll 1280 × 800 ja 390 × 844 vaates näitas HTTP 200, null lehe- ja konsooliviga, null ebaõnnestunud päringut ja null horisontaalset ülevoolu. API päring `mets` vastas HTTP 200, 3 osa ja 4 allikaga. Täistestid läbisid 1 448/1 448, ehitus 1 603 moodulit ja avaliku otsingu kvaliteedivärav 147/147.

## Tootmise taastamine 25. novembril 2026

Kell 14:27 UTC jooks 45631967423 peatus pärast vana konteineri seiskamist, sest Coolify hosti `/data/coolify` oli ketta täidumise tõttu kirjutamatu. Uued juurutused h5055rqdabg93hdzb3sn8gk9 ja t6gm8pmiw3xtvuwowek5a4hv jäid vastavalt olekusse `failed` ja `in_progress`; nende `docker-compose.yaml` ja `.env` jäid tühjadeks. Töövoo taastamisstepp jäi välise tühistuse tõttu käivitamata, seega vastas `https://praktika.arle.top` korduvalt HTTP 503 tekstiga `no available server`.

Konfiguratsioon taastati Coolify API-st: `.env` generati 35 mittetootmisvaate runtime-muutujat ja `docker-compose.yaml` kirjutati uuesti heakskiidetud image'i `7254404731897b32bb8c507b427737c41224b18a` järgi. Seejärel käivitati API kaudu deployment `f2ipvvz6h8bzrakjsxabbxou`. Coolify ehitas hetke `main`-ist image'i `ebdf0a7b00f501dee312352d47cd663512ebedbf`; konteiner on `running:healthy` ja avalik `container-readiness` vastas HTTP 200-ga ning sama SHA-ga väljal `revision`. Coolify rakenduse `git_commit_sha` väli näitas endiselt vana väärtust `7254404`, mistõttu tuleb juurutuse tõendamisel lugeda konteineri image'i ja elus testi, mitte ainult seda välja.

Enne taastamist käivitas flownäppude testi 45639826341 samal puul (`ebdf0a7` on tühi commit, sama tree mis `d4062c2`) ühe katse, kus katvusauditi ühine ajalõpp ei rakendunud, kuigi test ebaõnnestus juhuslikult. Sama puu oli varem läbinud 1477 testi. Käesolev töö parandab selle katse nii, et ajalõpp lukustub kohe ja test ei sõltu crawleri ajastusest.

Et taastamine ei jääks tulevikus välise tühistuse tõttu vahele, kasutab `.github/workflows/deploy.yml` taastamissammu tingimust `always() && (failure() || cancelled())`. Enne seda käivitus taastamine ainult `failure()` korral ja tühistatud jooks jättis tootmise konteinerita. `actionlint` kinnitas muudatuse.

## Korduvkontrollid 25. novembril 2026

Kaheksa koodikontrolli käivitati uuesti pärast parandusi. `dep-cycles server src scripts` leidis tsükliteta tulemuse, `semgrep --config auto` kahe muudetud faili kohta 0 leidu, `trivy fs --scanners vuln --quiet .` ja `npm audit --omit=dev` 0 haavatavust ning `actionlint .github/workflows/deploy.yml` läbis. `jscpd --reporters ai server src scripts` näitas 132 klooni ja 2,2% dubleerimist. `knip --reporter compact` näitas 2 kasutamata faili ja 35 sisemist eksporti: üks neist on juba läbi viidud ühekordne migratsioon `scripts/backfill_body_index_policy.mjs`, teine on käsitsi käivitatav Playwright test, seega kumbagi ei kustutatud. `gitleaks detect --no-git -s . --redact` leidis kolm väärpositiivset vasteid, mis olid avalikult lehel olev Cloudflare analüütika token ja commiti SHA; tõelisi saladusi ei olnud. Kustutati ainult gitignore'iga `.playwright-cli` ajutised brauserijäljed, 271 MiB.

## Lõplik juurutuse tõend 25. novembril 2026

Kood versiooniga `aa49fb27b49d64d75eaeed7809183a1ede77eacf` läbis kohalikult 1478 testi, ehituse ja Sitesi testid. Töövoog `45650412355` lõppes olekuga `success` kell 16:18:23 UTC. Coolify deployment `ildzb8ohi04jojiico6wd4je` lõppes olekuga `finished` kell 16:18:18 UTC. Avalik `container-readiness` tagastas HTTP 200 ja väljal `revision` sama SHA. Töötav konteiner kasutab image'i `asdyidu5wvjx54d0b09t9rhw:aa49fb27b49d64d75eaeed7809183a1ede77eacf`. Coolify rakenduse `git_commit_sha` väli on endiselt vana `7254404`, seega on edaspidi juurutuse tõendiks töövoo logi koos konteineri image'i ja elus testiga.

Elus käitumiskontroll: `mets` tagastas HTTP 200, 3 vastuseosa ja 4 allikat, otsingus 7191 tulemust. `mis on ringmajandus` tagastas sõnumi "Meil ei ole sellele küsimusele vastust", 0 osa ja 0 allikat. Ingliskeelne `what is a forest` tagastas teate "Otsing töötab praegu eestikeelsete päringutega", 0 osa ja 0 allikat. Brauserikontroll 1280 × 800 ja 390 × 844 vaates näitas HTTP 200, null lehe- ega konsooliviga, null ebaõnnestunud päringut ja null horisontaalset ülevoolu. Avaliku otsingu kvaliteedivärav andis kõigil viiel näitajal 1,0.

## Korpuse katvus pärast parandust

Uue koodiga tootmises käivitatud `node server/sync-corpus.mjs --hydrate-limit=1000` lõppes olekuga `ready`: avastati 45 370 URL-i, indekseeriti 45 361, lisati 28 uut teksti, jäeti vahele 401 ja ebaõnnestus 571 lugemist. Kategooria `http-status` arv 501 on vigade arv, mitte HTTP olekukood. Sellele järgnenud `node scripts/audit-corpus-coverage.mjs --compare-public --fail-on-gap` andis väljuskoodi 2: 42 462 avalikku URL-i, kõik 42 462 on andmebaasis, puuduvaid URL-e 0, loetud sisuta 799, poliitikaga väljajäetud 11, vanu `last_seen_at` väärtusi 0 ja ainult andmebaasis olevaid URL-e 193.

Päris olekukoodide ja põhjuste saamiseks probeeriti konteineri sees 45 puuduva sisuga URL-i läbi sama `assertPortalRobotsAllowed` ja `fetchCorpusText` tee, mida hüdratsioon kasutab. Tulemus: 5 `rmk.ee` autori lehte on `robots.txt`-iga keelatud, 1 `www.ilmateenistus.ee` vana artikkel annab HTTP 404, 3 `keskkonnaportaal.ee` sündmustelehte annavad HTTP 500, 3 `keskkonnaagentuur.ee` lehte on lubatud mahust suuremad, 2 `www.ilmateenistus.ee` keeleversiooni on lubatud päritolude alt väljas ja 31 URL-i õnnestus lugeda. Nende 31 seast vaadati läbi 10: 6 ei andnud vähemalt 80 märgiga teksti, 3 andsid kasutatava teksti ning üks leht, `https://keskkonnaamet.ee/kontaktid`, põhjustas teksti eraldamisel virnast ülevoolu.

Virna ülevoolu põhjus oli rekursiivne DOM-i kloonimine ja serialiseerimine väga sügaval lehel. `extractReadablePage` kasutab nüüd suurtel või sügavatel lehtedel algdokumendi teksti eraldajat ja vajadusel iteratiivset DOM-i läbimist. Regressioonitest `tests/corpus_deep_dom_extraction.test.mjs` läbib 12 000 pesastatud elementi ja tavalise lehe peidetud teksti keelu. Päris lehel `https://keskkonnaamet.ee/kontaktid` eraldatakse nüüd 755 märgi pikkune tekst ilma veata.
