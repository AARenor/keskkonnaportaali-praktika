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
4. **Väljaandeid ei segata:** vastus kasutab ühte väljaannet ja ühte metoodikat. SMI 2024 PDF-i 2 350,6 tuhat ha jääb algse väljaande juurde; uuema töövihiku tagasiulatuvalt ümber arvutatud 2024. aasta rida (2 350,8 tuhat ha) ei ole vana numbri asendus ega iseenesest metsa tegeliku muutuse tõend. SMI 2025 esitluse järgi muudeti 2025. aastal kõrguse, tagavara, alla 8 cm puude mahu, juurdekasvu, suremuse ja netojuurdekasvu arvutusmetoodikat, seega eri metoodikaga avaldatud mahte ei käsitleta täielikult võrreldavatena. Väljaande identiteet ja artefakti räsi on `server/smi-tables.mjs` failis (`SMI_2025_EDITION`).
5. **Juurdekasv ja raie:** juurdekasv on puistule aastas lisanduv tüvepuidu kogus, netojuurdekasv saadakse loodusliku suremuse mahaarvamisel. Raiemahuga võrreldakse sama ulatuse ja perioodi elusate puude raiet, sest raiemahu hulk sisaldab ka surnud puid. SMI 2025 töövihiku tööleht 11 annab kogujuurdekasvu 15 458 tuhat m³ aastas (6,55 m³/ha, suhteline viga ±1,4%), tööleht 34 mõõdetud raiemahu kuni 2024. aastani (12 500 tuhat m³), tööleht 23 viie aasta keskmise raiemahu (11 897 tuhat m³). Töövihik ei avalda riiklikku netojuurdekasvu kogumahtu. 2025. aasta raiemaht 11,0 miljonit m³ on Keskkonnaagentuuri [18.08.2026 ülevaate](https://keskkonnaagentuur.ee/uudised/smi-metsatagavara-stabiilne) eksperthinnang, mitte mõõdetud tulemus, ja majandatava metsa netojuurdekasv 4,9 m³/ha aastas pärineb samast ülevaatest. Viimase kümnendi keskmisena oli elusate puude raiemaht netojuurdekasvust kõrgem, 20 aasta vaates madalam, ja üks aasta ei otsusta kestlikkust: [Keskkonnaagentuur, netojuurdekasvu ja raie tasakaal](https://keskkonnaagentuur.ee/node/2720). Ära lahuta eri avaldajate ridu ega tuleta netojuurdekasvu kogumahtu juurdekasvust ja raiest.

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

PDF-ide täissisu automaatne hüdratsioon on eraldi piiratud taustapass, mis jookseb pärast lehekülgede passi (ühe jooksu kohta kuni 10 dokumenti, 400 ms vahe) ja kasutab konverterit `pdftotext` ning metaandmete lugejat `pdfinfo` (mõlemad `poppler-utils`, paigaldatud `Dockerfile`-i). Indeksisse läheb ainult täielik, tekstikihiga ja lubatud lugemine. Krüpteeritud, skaneeritud ehk tekstikihita, liiga suur, liiga mitme lehega, liiga suure tekstiga, katki jäänud või ajapiiri ületanud fail jääb indekseerimata ja vana tekst kaotab tõendiõiguse. Konversiooni piirid on koodis (`server/pdf_extraction.mjs`): korpuse HTTP-lugemine kuni 4 MB, konverteri sisend kuni 16 MB, 400 lehekülge, 2 MB teksti, 20 sekundit, kaks konverterit korraga ja kaheksa järjekohaga. Ilma konverterita lõpeb lugemine olekuga `unavailable`; siis ei indekseerita ühtegi PDF-i. Pärast baaskujutise või `poppler-utils` uuendust kontrolli, et üks teadaolev PDF annab endiselt oleku `ok` ja lehepiirid kattuvad dokumendi lehtede arvuga. Ärge nimetage seda täielikuks PDF-otsinguks: automaatse konversiooni leheküljenumber jääb sisemiseks lokaatoriks ega ilmu avalikus vastuses. Kolme uue primaararuande ja olemasoleva aastaraamatu täiendused on käsitsi üle vaadatud, leheküljeviitega kataloogiväljavõtted.

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
   ja mudelikõne taimer `LLM_TIMEOUT_MS`. Hoia olemasolevad concurrency-, tokeni-,
   eelarve-, proxy-, andmebaasi- ja privaatsuspiirid alles. Kontrolli
   `LLM_TIMEOUT_MS` väärtust runtime'ist, mitte sellest juhendist.
   Toetatud effort'id on `low` ja `medium`; `minimal` ja `none` peatavad
   käivituse. Väljundtokenite taotlust ei saadeta; eelarve reservatsioon
   kasutab fikseeritud hinnangut `AGENT_MANAGER_ANSWER_TOKENS`, mis ei ole
   kontrollitud Codex wire'i jõustatud väljundipiir.
   Otsingu kaks kella ja transpordi lagi (`SEARCH_DEADLINE_MS`,
   `ANSWER_DEADLINE_MS`, `PUBLIC_RESPONSE_IDLE_TIMEOUT_MS`,
   `PUBLIC_RESPONSE_ABSOLUTE_TIMEOUT_MS`) peavad olema omavahel kooskõlas;
   vastasel korral server ei käivitu. Ära pikenda neid pimesi: vaata
   allpool "Ajamudel, eelarved ja allikapoliitika".
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

Live hindamise 15,5 sekundi lävend on rangem jõudluseesmärk, mitte serveri otsingu ülempiir. Ühekordse JSON-liidese loendi lagi on vaikimisi 75 000 ms (`JSON_SEARCH_DEADLINE_CEILING_MS`, seadistus saab seda ainult vähendada) ja vastuse aken kuni 195 000 ms (`ANSWER_DEADLINE_MS`). Hindamis- ja grounding'u skriptid ootavad `SEARCH_AUDIT_TIMEOUT_MS` ehk vaikimisi 90 000 ms otsingutähtaega pluss 10 000 ms võrguvaru, et aeglast vastust ei peetaks ekslikult katkestuseks. Varasem 50 sekundi loendi ja 60 sekundi oote kirjeldus oli aegunud.

Kontrollireeglid on intentide kaupa (`server/llm.mjs` `assertAnswerAddressesQuery`): kaitse-osa, metsamaa pindala ja meetod, metsasus, puuliigid, kliimamõju, andmeallikate eristus ja metsa kadumine omavad igaüks oma sisulist nõuet ning ülejäänud intentid kasutavad 75% tüvede kattuvust. Kui tavalise sõnastusega küsimus hakkab ootamatult andma „Vastust ei leitud”, kontrolli kõigepealt kahte kohta: kas `resolvePublicForestryIntent` tabab käändevormi (`kaitsealuse\w*`, `kuiv(?!end)\w*`, `puuliik`), ja kas vastava intenti kontroll nõuab sõna, mida hea vastus ei pea kordama.

Süsteemijuhis on stabiilne ja tõendipakk eelneb muutuvale küsimusele. See võimaldab provider'i prompt-cache'i, kuid ei tõenda tabamust. 22.10.2026 sama tõendipakiga päris Responses-kontrollides oli `cached_tokens=0`, sealhulgas eraldi tõendi- ja küsimussõnumiga ning `prompt_cache_key` katsetes. Gateway ei toetanud proovitud explicit-cache parameetreid; rakendus neid ei saada. Ära raporteeri ühisprefiksi pikkust cache hit rate'ina ega vähenda tokenieelarvet oletatava cache-soodustuse võrra.

Saidikaardi madalam kvaliteet ei tohi üle kirjutada valideeritud lehe sisu, räsi, lugemisaega ega `metadata.source_kind` päritolu. Varasema vastuoluga hüdratsioonirida jääb navigeerimisallikaks kuni tegeliku uue lubatud HTTPS-lugemiseni; taustapartii eelistab neid ridu. Ära paranda tõendiõigust massilise metaandme-UPDATE'iga. Robots-, noindex-, päritolu-, mahu- ja värskuspiirid jäävad kehtima.


OpenAI ja gateway logimise, säilitamise ning konto andmetöötlustingimused tuleb
enne ametlikku kasutuselevõttu kinnitada eraldi; `store: false` ja keelatud SDK
tracing ei tõenda teenusepoolse logimise puudumist. Täpne andmepiir:
[PRIVAATSUS.md](../PRIVAATSUS.md).

## Ajamudel, eelarved ja allikapoliitika

Otsingul on kaks eraldi kella. Tulemuste loendi aken algab päringust (`SEARCH_DEADLINE_MS`) ja vastuse aken alles loendi avaldamisest (`ANSWER_DEADLINE_MS`); ühekordne `POST /api/search` piirab loendit lisaks väärtusega `JSON_SEARCH_DEADLINE_CEILING_MS`. Mudelikõne oma taimer on `LLM_TIMEOUT_MS`, mis piirab ühte teenusepakkuja kutset, mitte kogu vastuse etappi. `PUBLIC_RESPONSE_ABSOLUTE_TIMEOUT_MS` peab katma loendi akna, vastuse akna ja lõppvastuse reservi ning `PUBLIC_RESPONSE_IDLE_TIMEOUT_MS` peab ületama ühekordse otsingu loendi lage. Server valideerib selle käivitumisel ja keeldub käivitumast, kui aken ei mahu; ära paranda olukorda lühemaks lõigatud eelarvega, sest see kaotab tõendatud vastuse.

Kui vastus peab läbima välist puhverserverit või CDN-i, kontrolli selle enda lugemisaja piiri. Cloudflare'i [ametlik 524 dokumentatsioon](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/) määrab vaikimisi Proxy Read Timeout'iks 125 sekundit ja seda saab tõsta ainult Enterprise'i tasemel (kuni 6000 s) või jätta alamdomeen puhverserverita. Brauseri töötransport hoiab ühendused lühikesed, seega edge ei katkesta pikka AI vastust selle kestuse tõttu; [HTTP/2 to Origin](https://developers.cloudflare.com/speed/optimization/protocol/http2-to-origin/) selgitab, et multiplexing koondab paljud küsitlused ühele algsele ühendusele, kuid üle 125 sekundi kestvad päringud, sealhulgas voogedastus, vajavad endiselt Proxy Read Timeout'i tõstmist. Rakenduse näidiseadistuse absoluutne lagi on edge'i vaikimisi piirist suurem, seega voo- ja JSON-ühilduvusradade jaoks otsusta mõõdetult: kas tõsta edge'i piiri või seada nende radade eelarved edge'i piiri alla.

Tööregister (`server/search_jobs.mjs`) on protsessi mälus ja selle piirid on koodis, mitte keskkonnamuutujates: kuni 40 jooksvat tööd, 2 ühe kliendi kohta, 2000 kirjet, 2 MB sündmusi töö kohta, 16 MB kõiki sündmusi, kõva tähtaeg 285 sekundit, lõppvastus küsitletav 60 sekundit, kirje identiteet vähemalt 600 sekundit ja kauem ainult aktiivse koristuse ajal, sulgemise ajavaru 5 sekundit. See pikem püsimine ei ole veel tootmises tõendatud. Küsitlus ja tühistamine on eraldi 120 päringu minutikvoodi all; loomine kulutab sama otsingupiirangut, vastuvõtukohta ja mudelieelarvet nagu voog. Tähtaeg lõpetab jooksu loogiliselt, kuid takerdunud koristus hoiab oma töökohta ja kliendikohta kuni tegeliku lõpetamiseni või protsessi lõpuni: ära eelda, et 285 sekundi möödumine vabastab mahu. Tundmatu, kuid korrektselt vormistatud identifikaatori tühistamine paigaldab tühistamistombstone'i ja vastab 200, kui reservis on koht, muidu 429 `JOB_CAPACITY`; see reserv on 200 kokku ja 2 ühe kliendi kohta. Olemasoleva töö tühistamisel jääb vale võti 404 vastuseks. Allika kopeerimisakna ajal tagastab küsitlus sama `seq` juures linkidele taandatud asenduse ilma kopeeritud teksti, väite ja diagrammita; kui sündmus ja asendus koos ei mahu, salvestatakse kohe asendus. Aken ja asendus on sisemised ega ilmu avalikus JSON-is. See ei ole jaotatud püsivus: kontrollitud tootmistopoloogias 11.11.2026 oli üks terve konteiner ja üks rakenduse põhiprotsess, seega register on jagamata ja kaob igal taaskäivitusel. Taaskäivitus, restart või juurutus kaotab pooleliolevad tööd ja kasutaja peab otsingu uuesti algatama; ära käivita mitut replikat ilma seansipüsivuseta, sest küsitlus võib jõuda protsessi, kus tööd ei ole, ja saab 404. Sulgemisel katkestab server jooksva töö ja ootab jooksutajaid kuni 5 sekundit, seega rolling deploy võib kasutajale kaotada poolelioleva vastuse isegi siis, kui andmed ja cache jäävad alles.

Mudelieelarve on libisev aken protsessi mälus (`server/llm-budget.mjs`): `LLM_BUDGET_WINDOW_MS`, globaalne `LLM_ROLLING_REQUEST_BUDGET` ja `LLM_ROLLING_TOKEN_BUDGET` ning kliendi osa `LLM_CLIENT_REQUEST_BUDGET` ja `LLM_CLIENT_TOKEN_BUDGET`. Reservatsioon tehakse enne võrku saatmist ja asendatakse pärast vastust teenusepakkuja tegeliku kasutusega; teadmata kasutus debiteerib täisreservi. Väärtus `0`, `off`, `none` või `unlimited` lülitab vastava piiri välja. Loendurid ei ole andmebaasis ega replikate vahel jagatud ja need nullistuvad taaskäivitusel, seega mitme replika korral on igal protsessil oma eelarve. Kontrolli pärast taaskäivitust, et kvoot ei oleks ootamatult tühi ega täis; `LLM_CLIENT_BUDGET_KEYS` piirab jälgitavate kliendivõtmete arvu.

Avaldaja lõikepiiranguid jõustab üks leht (`server/source_policy.mjs`, `source-policy-v1`). `noindex` ja robots-keeld välistavad teksti; `nosnippet` ja `max-snippet:0` võtavad ära lühiväljavõtte ja mudeli tõendi; lõplik `max-snippet` piirab mõlemat sama märgialani; `noarchive` jätab alles lingi ja metaandmed; `data-nosnippet` lõigud eemaldatakse enne tekstieraldust. Tundmatu juhis, näiteks `noai` või `noimageai`, talletatakse vaatlusena ega otsusta ise midagi, sest see ei ole selle portaali jaoks teadaolev keeld ega luba. Nii ei muuda uus, veel tundmatu märksõna ootamatult kasutusõigust, kuid seda ei tohi ka vaikselt ära visata, sest tulevane õiguste kontroll võib seda vajada. Loetamatu või mitmeti tõlgendatav poliitika, samuti puuduv või tundmatu versiooniga salvestatud poliitika käitub seevastu keeluna. `rightsReview` jääb `unreviewed`, kuni on viide tegelikule õiguste kontrollile; robots-luba ei ole litsents. [Google'i robots-meta dokumentatsioon](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag) kirjeldab nende juhiste tähendust Google'i enda tulemustes, mitte teiste otsijate ega meie oma koopia jaoks. Enne riiklikku kasutuselevõttu tuleb allikate kasutusõigused eraldi kokku leppida.

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

10.11.2026 selgus, et serveri `arle-daily-backup` töö kasutas `docker ps` vormingus välja `.Config.Image`. Docker lükkas selle tagasi ja PostgreSQL-i varukoopiate tsükkel jäi tühjaks, kuigi töö lõpetas edukalt. Skript kasutab nüüd välja `.Image` ning loeb andmebaasi kasutajanime konteineri enda `POSTGRES_USER` seadest. Puuduva konteineriloendi või ebaõnnestunud andmebaasikoopia korral on töö ebaõnnestunud; viimase korral ei kärbita olemasolevaid snapshot'e. Muudatus kontrolliti eraldatud eduka ja vigase töö näidetega, ja 11.11.2026 öine automaatne jooks tootis kolm andmebaasikoopiat, mille gzip-kontroll läbis.

Eraldi projekti PostgreSQL-i koopia salvestati kaitstud asukohta `/srv/ai/backups/db-dumps/praktika_project_20261110T191540Z.dump`. See taastati võrguta ajutises PostgreSQL 17 konteineris: korpuses oli 43 979 kirjet. Sama faili krüpteeritud restic-snapshot loeti tagasi ja SHA256 kattus lähtefailiga. See tõendab konkreetse koopia taastamist, mitte kogu varundussüsteemi või taastamisaja eesmärgi täitmist.

11.11.2026 automaatne jooks andis eraldi tõendi, mis katab korje- ja taastamisahela tervikuna: ajastatud töö tootis gzip-kehtiva dumpi, sama faili krüpteeritud restic-snapshot vastas lähtefailile, ja võrguühenduseta taastatud praktika andmebaasis oli 5 tabelit ja 47 105 rida. See on ühe ajastatud jooksu taastamistõend, mitte tõend taastamisaja eesmärgi, pikaajalise säilituse ega teise asukoha kohta.

Restic-hoidla asub samas serveris. Serverist eraldi paiknev sihtkoht ei ole valitud ega konfigureeritud, seega ei ole offsite-varukoopiat ega selle taastamist tõendatud. Enne ametlikku üleandmist tuleb kokku leppida serverist eraldi paiknev kaitstud varukoopia, ligipääs, säilitus ja korduv taastamise proov. Andmebaasi täielik `pg_dumpall` võib sisaldada teiste andmebaaside andmeid ja rollide parooliräsisid; käsitle seda piiratud ligipääsuga salajase materjalina.

## Andmebaasi üleandmine

Vaikimisi üleandmine on tühi PostgreSQL 17 andmebaas, mille rakendus ise esimesel kasutusel valmis teeb: `CREATE EXTENSION IF NOT EXISTS pg_trgm` ja `unaccent` ning tabelid `practice_corpus_documents`, `practice_corpus_runs`, `practice_corpus_query_snapshots`, `practice_search_cache` ja `practice_search_runs`. Sisu taastatakse piiratud korjega, mitte dumpiga. Korje teeb päris päringuid avalikele allikatele ja võib võtta kaua; käivita see konteineri sees, sest runtime-image'is ei ole npm-i ja hosti `.env` ei laadita sellesse Node-skripti:

```bash
docker compose exec web node server/sync-corpus.mjs --hydrate-limit=1000 --seed-queries=mets
```

Ära pane andmebaasidumpi ega saladusi avalikku GitHubi repositooriumisse. Täielik andmebaas sisaldab avaldajate tekste, vahemällu salvestatud väljavõtteid ja pseudonüümseid tööandmeid, mille allikaõigused on veel `unreviewed`. Päris snapshot'i üleandmine eeldab nimetatud vastuvõtjat, õiguste ülevaatust, kokku lepitud krüpteeritud kanalit ja iseseisvalt uuesti genereeritud saladusi; ära kasuta avalikus näites olevaid väärtusi uuesti.

11.11.2026 kontrolliti tühja, võrgust eraldatud PostgreSQL 17 andmebaasiga ja mittejuurena töötava runtime-image'iga: tühi andmebaas andis `databaseHealth: ready` ja `searchCorpus: ready` ning rakendus lõi kõik viis praktikatabelit ja `pg_trgm` ning `unaccent` laienduse. See tõendab skeemi loomist, mitte täiskorpuse sünkroonimist, mida ei käivitatud; katsekonteinerid eemaldati ja hostile porti ei avatud.

Erinevat migratsioonide arveraamatut ei ole: skeem luuakse ja täiendatakse idempotentsete lausetega. Rakendus vajab praegu oma andmebaasis DDL- ja laienduste õigusi, seega anna üle omanik- või roll, kellel need õigused on, või loo skeem üks kord nende õigustega.

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

11.11.2026 läbis varasem täissviit pärast metsateatise ja vestluse jätkuküsimuse parandusi kõik 903 testi. Kohalik proov, mis vastas 21 sekundi pärast, kinnitas eraldi, et filtriaudit ja live holdout ei katkesta enam päringut 20 sekundi järel. Rakenduse build ja kolm Sites'i tarbijatesti läbisid. Sama päeva üleandmise muudatustega läbis värske `npm test` kõik 1219 testi; ühtegi testi ei jäetud vahele.

Pärast nõutud kontrollide läbimist ja tellija juurutusluba tee üks koondatud diff-review, kontrolli ainult kavandatud faile ja saladuste puudumist ning alles siis commit'i ja push'i `main` harusse. Valmisolek nõuab kahte sõltumatut tootmistõendit: Coolify kirje peab olema olekus `finished` täpselt `origin/main` commit'i SHA-l ning korduvad API- ja brauseriproovid peavad näitama uue versiooni käitumist. Kontrolli desktopi ja 390 px mobiilivaadet, allikalinke, kuupäevi, filtreid, eestikeelsuse piiri ning värske lehe `scrollY === 0` ja iframe'i mitteaktiivsust.

## Üleandmise otsused, mis ei ole veel tehtud

Järgnevad otsused kuuluvad vastuvõtvale organisatsioonile. Ükski neist ei ole selle praktikaprojekti poolt kinnitatud ega allkirjastatud, ja ükski dokument ei tohi neid esitada tehtuna:

1. **Vastutav töötleja, omanik ja avalik kontakt.** Kes vastutab teenuse, andmete, logimise ja kustutamise eest ning kes vastab kasutajate pöördumistele. Kuni see on määramata, ei ole avalikul lehel kellegi kinnitatud kontaktandmeid.
2. **Serverist eraldi paiknev varukoopia.** Sihtkoht, ligipääs, krüpteerimine, säilitus ja korduva taastamise proov. Praegu on tõendatud sama serveri restic-hoidla ja üks võrguta taastamine, mitte offsite-varukoopia.
3. **Ligipääsetavuse avaldus.** Avaldatud avaldus, mille vastavust on kontrollitud sõltumatult; senised kontrollid on tõendid, mitte sertifikaat.
4. **Sõltumatu vastuvõtukontroll.** Turva- ja ligipääsetavuskontrolli tulemus ning otsus, kas lahendus võetakse vastu, lükatakse tagasi või vajab täiendusi.

Need otsused ei muuda tehnilist tõendit olematuks ega asenda seda: taastamine, testid ja kontrollid jäävad kehtima nii, nagu need tegelikult tehti.

## Versiooniajalugu

| Versioon | Kuupäev | Muudatus |
|---|---|---|
| 1.0.0 | 01.10.2026 | Allikahierarhia, korjereeglid ning SMI, aastaraamatu ja puidubilansi hooldusprotsess. |
| 1.1.0 | 06.10.2026 | Autenditud Codex gateway, GPT-6-Luna, serveripoolne bearer ning Coolify runtime'i ja exact-SHA redeploy kord. |
| 1.2.0 | 06.10.2026 | Allika võrdlusidentiteet ja lokaatoriga witness, üks muutumatu tõendipakk, semantilise versiooni eristus, lõppvastuse järgi määratud provider/olek ning külmutatud v1 aus raport eraldi v2 arenduskomplektist. |
| 1.2.1 | 10.10.2026 | Proxy aadressi kordustõrke runtime-parandus ja tootmise brauseri/API turvapiiri kontroll. |
