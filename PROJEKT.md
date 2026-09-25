# Keskkonnaportaali praktikaprojekt

Tootmise vastuvõtukriteeriumide, andmevoo, marsruutide ja koodikaardi detailne register on failis [`acceptance-evidence.md`](./acceptance-evidence.md). Otsingu andmetöötluse kasutajale suunatud piir on failis [`PRIVAATSUS.md`](./PRIVAATSUS.md).

## Eesmärk

See on Keskkonnaportaali eraldiseisev praktikaversioon aadressil [praktika.arleserver.cfd](https://praktika.arleserver.cfd). Avaleht kasutab Keskkonnaportaali tuttavat visuaalset keelt ja lisab kaks selgelt eraldatud kasutusvoogu:

1. **Allikapõhine küsimus-vastus otsing.** Kasutaja saab vastuse esmalt, iga väite juures on nummerdatud viited ning vastuse järel ametlikud algallikad.
2. **Terrapointi täisrakendus.** Avalehe eraldi jaotises töötab `terrapoint.ee` iframe. Terrapoint ei osale üldotsingu vastuste koostamises ega ilmu selle allikatesse.

Projekt on märgitud praktikaprojektiks ja saadab `noindex` juhise. See ei ole Keskkonnaportaali ametlik tootmiskeskkond.

## Kasutajakogemus

- Avalehe põhiotsing on nähtav kohe nii töölaual kui ka mobiili esimeses vaates. Mobiilipäise otsinguikoon viib fookuse samasse vormi ega loo DOM-i teist otsingukasti.
- Autocomplete pakub kuni viis sisulist küsimust ning toetab klaviatuuri, hiirt ja puutetundlikku ekraani.
- Otsingutulemus näitab esmalt lühikest vastust koos allika nime kandvate tekstisiseste viidetega ning kohe selle järel lehekülgede kaupa „Otsingutulemused”. Tekstisisene viide avab viidatud HTTPS-algallika uuel vahelehel; sama infot kordavat eraldi viidatud allikakaartide plokki ei kuvata. Vastus ja lai tulemustevaade lähtuvad samast filtreeritud ning järjestatud tulemusehulgast; filtri muutmine koostab ka vastuse uuesti.
- Iga filtriväli on teadlikult ühe valikuga. Eri väljade valikud ühendatakse `AND`-ina (näiteks `official` + „Ametlik juhend” + 2025); sama välja sees mitmikvaliku `OR`-semantikat UI ei paku.
- Relevantsus on esmane järjestussignaal. Ametlikkus, tõendi täielikkus ja tegelik avaldamiskuupäev täpsustavad võrreldavaid vasteid; tulevikukuupäev ei saa värskusboonust.
- Vastuse all saab esitada kuni neli jätkuküsimust. Iga voor teeb uue tõendiotsingu; varasem vestlus aitab ainult mõtet täpsustada ega muutu tõendiks.
- Avalikus kasutajaliideses ega API vastuses ei näidata mudeli, andmebaasi, vektorindeksi, fallback'i või ühenduste tehnilisi olekuid.
- Terrapointi iframe ei tohi lehte esmakordsel laadimisel enda juurde kerida ega hostrakenduselt fookust võtta.

## Arhitektuur

| Kiht | Lahendus | Vastutus |
|---|---|---|
| Kasutajaliides | React 19 + Vite | Responsive avaleht, ligipääsetav otsing, vastus ja allikad, Terrapointi iframe |
| Rakendusserver | Node.js + Express | Staatika, avalik API, turvapäised, rate limit ja päringu orkestreerimine |
| Metsa regressioonikorpus | Versioonitud JSON-korpus | 21 läbi vaadatud vastusedokumenti, 18 FAQ teemat, 12 väärarusaama ja 16 ametlikku algallikat; eval- ja võrdlusmaterjal, mitte primaarvastuse otsetee |
| Otsing | Eesti relevantsusjärjestaja | Tüve- ja intent-laiendus, pealkirja/kokkuvõtte/lõigu kate, fraasilähedus, autoriteet ja ajakohasus |
| Lai sisukorpus | PostgreSQL FTS + `pg_trgm` | 8407 sitemapilehte, 6057 portaali otsingukaarti, valitud puhastatud täistekstid, täpsed päringusnapshot'id ja kureeritud taustallikad |
| Värske sisu | Ametlik liitotsing + tüübikindlad andmeadapterid | Keskkonnaportaali, Keskkonnaameti, Keskkonnaagentuuri ja Kliimaministeeriumi sisu paralleelne avastamine, puhastatud täistekst ning konkreetsete näitajate ametlik masinloetav väärtus |
| Ruumipäring | Avalik kataster + Metsaregistri WFS | Valideeritud katastritunnuse informatiivne pindala ja metsaeraldiste hetkeseis otse avalikust teenusest |
| Veekogu klassifikatsioon | EELIS WFS | Ainult Emajõe (`VEE1023600`) täpne avaliku vooluveekogu kirje; informatiivne klassifikatsioon hoitakse eraldi isiklikust juurdepääsu- või tegevusõigusest |
| Nimega Natura loodusala kirje | EELIS PostgREST | Ainult Lahemaa, Matsalu, Soomaa, Alam-Pedja, Otepää või Rahumäe täpne kehtiv registrikirje; server seob nime EL-i ja KKR-koodiga ning hoiab pindala-/staatusfakti lahus piiri, loa või isikliku õiguse otsusest |
| Riiklik veevõtu aastanäitaja | Statistikaameti PXWeb | Ainult KK048 kogu Eesti, kõigi tegevusalade ja vee kokku 2024. aasta JSON-stat2 lahter; muud aastad ja jaotused lükatakse enne välispäringut tagasi |
| Riiklik heitvee BHT7 aastanäitaja | Statistikaameti PXWeb | Ainult KK25 kogu Eesti 2024. aasta pinnaveekogudesse juhitud heitvee bioloogilise hapnikutarbe (`BHT7`) koondlahter; ohtlikud jäätmed, kohalik või jooksev veekvaliteet, muud näitajad, vastavusotsused ja võrdlused lükatakse enne välispäringut tagasi |
| Riiklik ohtlike jäätmete aastanäitaja | Statistikaameti PXWeb | Ainult KK068 kogu Eesti 2024. aasta ohtlike jäätmete tekkekogus, tegevusalad kokku, tonnides kuivkaalus; käitlus, ringlussevõtt, piirkonnad, ettevõtted, alamliigid, muud aastad ja trendid lükatakse enne välispäringut tagasi |
| Riiklik kogu jäätmete taaskasutamine | Statistikaameti PXWeb | KK610 kogu Eesti jäätmete koond ja näitaja „taaskasutamine” ühel sõnaselgel aastal vahemikust 2002–2024, tonnides; määrad, jäätmeliigid, piirkonnad, trendid ja mitme aasta võrdlused lükatakse enne välispäringut tagasi |
| Jaamapõhine ajalooline kliimanäit | Keskkonnaagentuuri PostgREST | Üks 25 kureeritud jaamast, fikseeritud `DTA08` element ja üks sõnaselge minevikukuupäev; adapter nõuab üht täpselt sama jaama ja kuupäeva valideeritud ööpäeva keskmist °C rida ning lükkab hetkeilma, muud elemendid ja võrdlused tagasi |
| Vastuse koostamine | Sama järjestatud tulemusehulk + OpenAI Agents SDK + `gpt-5.6-luna` | Manager käivitab mitme allika korral ühe kohustusliku review-tööriistaga järjest nii relevantsusspetsialisti kui ka tõendikriitiku, kuid omab lõppvastust; server kontrollib viited, väited ja küsimusele vastamise ning tõrke korral kuvab sama värske allika viidatud väljavõtte või ausa abstention'i |
| Andmebaas | Eraldatud PostgreSQL | Korpus ja hübriidotsing, versioonitud vastusepuhver ning privaatsust hoidev tehniline sündmuslogi |
| Terrapoint | Eraldi iframe | Kogu Terrapointi UI, kaart ja sealsed avalikud integratsioonid; üldotsingust lahus |
| Pakendamine | Dockerfile + Compose | Mitte-root image; Compose'is read-only veebikonteiner ja eraldatud PostgreSQL |
| Deploy | Coolify | Docker-build, tervisekontroll, HTTPS ja `praktika.arleserver.cfd` |

### Miks Redis ei ole praegu lisatud?

Rakendusel on üks veebireplika ning PostgreSQL annab juba püsiva vastusepuhvri. Bounded in-memory puhvrid katavad lühikesed korduspäringud. Redis lisaks praegu hooldus- ja rikkepinda ilma mõõdetava kasutegurita. See muutub põhjendatuks mitme replika, hajutatud rate limit'i, tööjärjekorra või instantsideülese single-flight vajaduse korral.

### Qdranti roll

Senine 256-mõõtmeline räsivektor ei olnud semantiline embedding ja Qdranti kirjutamine iga kasutajapäringu ajal ei parandanud otsingukvaliteeti. Qdrant on seetõttu eemaldatud päringu hot path'ist. Compose'is on see alles ainult valikulise `experimental-vector` profiilina, kuni olemas on päris mitmekeelne embedding, versioonitud eeltöötlus ja evalidega tõestatud kvaliteedivõit.

## Otsingu tööpõhimõte

Brauseri põhivoog kasutab NDJSON-endpointi `POST /api/search/stream`, kus küsimus on JSON-kehas. Server saadab järjest `results`, vajaduse korral `draft` ja täpselt ühe terminalse `answer` sündmuse: lai tulemuste loend ilmub enne aeglasemat AI-sõnastust ning turvaline esialgne vastus säilib ka siis, kui lõplik voog katkeb. `POST /api/search` jääb sama lõppvastuse JSON-liideseks ja `POST /api/search/results` lehitseb tulemusi AI-d uuesti käivitamata. GET on ainult dokumenteeritud programmiliidese ühilduvuseks; brauser seda ei kasuta.

1. Päring normaliseeritakse ning klassifitseeritakse deterministlikult olekusse `answerable`, `needs-clarification`, `live-weather`, `live-air`, `live-water` või `out-of-scope`. Jooksva ilma, õhukvaliteedi, sisevee, mere, jääolude ja suplusvee päring suunatakse vastavasse ametlikku reaalaja teenusesse, mitte vana artikli sünteesi. Prompt-injection'i korral mudelit ei kutsuta.
2. PostgreSQL-i kandidaadid, tasuta ametlikud Valitsusportaali otsinguliidesed ja päringule sobivad tüübikindlad andmeadapterid käivitatakse paralleelselt. Valitsusportaali JSON-vastus vähendatakse enne vahemällu salvestamist versioonitud lubatud väljade projektsiooniks: kuni kuus dokumenti, kuni 12 kasutatavat sisufragmenti dokumendi kohta, kuni 48 kB HTML-i dokumendi kohta ja 192 kB vastuse kohta. Ülejäänud välju ei käida läbi ega säilitata ning iga valitud dokument puhastatakse ühe HTML-parseri kutsega. Eesti intent-laiendus teeb vajadusel kuni kolm kitsast alamotsingut, näiteks `raiuda tulevikus` või `mets vanus`. Metsapindala küsimus säilitab eraldi kvantitatiivse intenti ning nõuab samas lõigus metsamaa mõistet, arvu ja ühikut; SMI/metsaandmete võrdlus nõuab SMI ja Metsaregistri või muu metsaandmeallika eri rolli sisulist kirjeldust. Küsimus „kas mets saab otsa” käsitletakse metsa püsimise ja seisundi intentina: matka- ja ronimistekstid eemaldatakse tõendikandidaatidest ning vastus vajab eraldi ametlikku hetkeseisu-, pindala- ja seisundikonteksti. Vajalikud ametlikud SMI, Metsainfo ja Metsaregistri lehed on lisaks live-otsingule hooldatud teenusekataloogis. Olmejäätmete ringlussevõtu määra adapter loeb küsitud aasta väärtuse portaali ametliku Tableau vaate CSV-väljundist. Raiemahu ja netojuurdekasvu võrdlus kasutab Eurostati `for_vol_efa` JSON-stat rida ning KAURi metoodika- ja SMI-allikaid; vastus eristab EFA `removals`-näitajat ühe aasta SMI raiemahust, säilitab puuduva aasta, `i`/`e` kvaliteedilipud ja ühiku „m³ koorega”. Ilmateenistuse vaatlusadapter seob hetkenäidu täpse jaama, XML-i allikaaja ja ühikuga ning lubab ainult kuni 15 minuti vanuse väärtuse; prognoosiadapter valib Eesti ajavööndi homse kuupäeva ametlikust nelja ööpäeva XML-ist ja hoiab Eesti üldprognoosi linnaprognoosist eraldi. Hüdroloogiaadapter kasutab ainult täpselt kureeritud Tartu–Emajõe või Kloostrimetsa–Pirita jaama ja üht `avg` seeriat; kuni 36 tunni vanune andmeaeg esitatakse „viimati avaldatud” tunni keskmisena, mitte reaalajanäiduna. Veetaseme juures kuvatakse jaamapõhise graafiku null EH2000 süsteemis, veetemperatuuri juures põhjalähedase anduri piirang ning kõigi näitude juures operatiivse toorandme staatus. Kliimaadapter seob ühe 25 kureeritud jaamast, `DTA08` elemendi ja ühe sõnaselge minevikukuupäeva; see nõuab täpselt üht sama jaama/kuupäeva rida, °C ühikut, avaldamisajatemplit ja värsket operatiivset allalaadimist ning ei esita väärtust praeguse ilma ega kogu piirkonna ruumilise keskmisena. EELISe WFS-adapter vastab ainult Emajõe avaliku veekogu klassifikatsioonile. Eraldi `f_rahvalad` adapter seob ühe kuuest nimega Natura loodusalast täpse EL-i ja KKR-koodi, kehtiva staatuse, registri muutmisaja ning maa-, sisevee- ja merepindalaga. Mõlemad EELISe vastused on informatiivsed ega otsusta piiri, ehitusõigust, eramaale juurdepääsu, kalastamist või muud isiklikku õigust. Statistikaameti adapteritest KK048, KK25 ja KK068 kasutavad fikseeritud 2024. aasta Eesti koondmõõtmeid; KK610 seob ühe sõnaselge aasta vahemikust 2002–2024 kogu jäätmete ja näitaja „taaskasutamine” lahtriga. Kõik nõuavad täpset JSON-stat2 tabeli-, dimensiooni-, koodi-, sildi-, ühiku- ja status-lepingut; nad ei esita vana `updated` välja andmete avaldamisajana ning KK068 ei koosta 2020. aasta liigitusmuudatuse tõttu trendi. Mitme aasta metsaküsimuse korral (aastavahemik, „viimase kümne aasta”, „20 aastat tagasi”, „aegrida”, „muutus”) seob eraldi adapter Statistikaameti KK51 metsavaru või MM03 metsaraie tabeli ühe näitaja ja küsitud aastad ühte `item`-filtritega JSON-stat2 päringusse; vastus ja `chart` väli koostatakse samast valideeritud reast ning avalik serialiseerija kontrollib diagrammilepingut (liik, 1–3 rida, 2–40 punkti, viide täpselt ühele allikale) enne väljastamist.
3. URL-id kanoniseeritakse ja duplikaadid ühendatakse. Mitme mõiste korral peab PostgreSQL-i kandidaat katma kõik mõisterühmad (`AND`), kuid sama mõiste käänded ja sünonüümid on rühma sees alternatiivid (`OR`). Päringuanalüüs määrab lisaks sisulistele tüvedele vajaliku ametliku allikarolli (näiteks reaalaja ilm, register, ajalooline vaatlus või juhend); roll on järjestuse täpsustaja, mitte luba teemavälise kataloogilehe esiletõstmiseks. Server rakendab allika-, sisutüübi- ja aastafiltrid ning järjestab tulemused kõigepealt päringu tegeliku katvuse, seejärel autoriteedi, täielikkuse ja värskuse järgi.
   Lehitsemisel arvutatakse sama 50 tugevaima kohaliku ja live-kandidaadi järjestatud prefiks igal lehel uuesti; sügavam saba küsitakse PostgreSQL-ist sama prefiksi URL-e välistades. Nii ei kordu üks tulemus eri lehtedel isegi siis, kui live-allikad liituvad kohaliku korpusega.
4. AI tõendid valitakse ainult selle sama nähtava ja filtreeritud tulemuselehe ametlikest kirjetest. Igal kureeritud allikal on eksplitsiitne tõendipoliitika: `route-only`, `timestamped`, `versioned` või `claim-specific`. Kataloogi- ja registri maandumisleht võib aidata kasutaja õigesse teenusesse, kuid ei tõenda seal peituvat objekti või arvu; reaalaja väärtus vajab adapteri mõõteaega ja muutuv menetlusseis versiooni või staatuse aega. Vana metsakorpus ei saa värskest otsingust mööda minna; seetõttu kasutab vastus uusimat päriselt avaldatud allikat, mitte lihtsalt kunagist eelkirjutatud SMI vastust. Vastuse jaoks saab valida kuni kümme eri allikat, kuid allikate rohkus ei tõsta üldist kataloogilehte otsese mõõtmise või metoodikalehe ette.
5. Kuni kuue kõrgeima asetusega ametliku lehe täistekst hüdrateeritakse serveris, kui ühine ajapiir seda lubab; vastuse kandidaatide nähtav hulk jääb kuni kümne allika suuruseks. Hüdratsioon kasutab kogu protsessi nelja töökoha ja 48 järjekohaga väravat ning sama kanoniseeritud URL-i samaaegne laadimine koondatakse üheks tööks. Igast allikast valitakse päringu mõisteid, mõõtmisi ja definitsioone kõige paremini katvad lõigud; Luna tõendipakk on kuni 36 000 märki ja kuni 4 000 märki allika kohta. Toorest HTML-i ei renderdata ning täistekst ja sisemised skoorid ei jõua avalikku API-sse.
6. Tõendivärav nõuab, et vähemalt üks tegelik pealkiri, kokkuvõte või täistekstilõik kataks küsimuse põhitingimused ja küsitud aasta. Käsitsi lisatud silt või eri artiklitest juhuslikult kokku saadud märksõnad ei anna AI-le vastamisõigust.
7. OpenCode Go `gpt-5.6-luna` töötab Responses API ja OpenAI Agents SDK range Zod/JSON Schema kaudu. Mitme allika puhul on manageri esimene kutse kohustuslik `review_evidence`: see käivitab samal serveri koostatud sisendil järjest relevantsusspetsialisti ja tõendikriitiku ning lülitub seejärel välja. Manageri kaks turn'i ja spetsialistide kaks üheturilist jooksu piiravad tee nelja mudelikutseni. Manager omab kuni 3 200 väljundtokeniga lõppvastust, spetsialistidel on kummalgi 700 tokeni piir ja kõigil `store: false`; ühe allika korral kasutatakse otsest range skeemiga mudelikõnet. Iga sisuline väide vajab lubatud viidet ning arvud, ühikud, aastad, väitekatvus, polaarsus ja esimese lause vastavus küsitud intentile valideeritakse pärast agente mudelist sõltumatult. Mudeli legacy `related_questions` välja ei avaldata; kasutajale kuvatakse ainult serveris läbi vaadatud seotud küsimused. Valideerimisvea korral säilib kontrollitud deterministlik vastus.
8. Valideeritud katastritunnuse korral kasutatakse eraldi Maa- ja Ruumiameti ning Metsaregistri WFS-voogu, mis eristab olekuid „leitud”, „ei leitud” ja „allikas ei vastanud”.
9. Jätkuküsimus teeb uue ühendotsingu ja uue viidatud vastuse. Iseseisev sisuline jätkuküsimus otsitakse eraldi; ainult „aga miks?” laadne elliptiline küsimus pärib juurküsimuse ja viimase vooru otsingukonteksti. Kuni kolme varasema küsimuse tekst võib mudelile mõtet selgitada, kuid ei muutu tõendiks.
10. 429, timeout, vigane mudelivastus või nõrk tõend ei muutu väljamõeldud vastuseks. Esimese tulemusefaasi ülempiir streamis on tavaliselt 3,5 sekundit; ainult täpselt tuvastatud aeglasel hüdroloogia-, EELISe Emajõe või nimega Natura, KK048/KK25/KK068/KK610 PXWeb- või kureeritud `DTA08` kliimaandmete päringul on see 7 sekundit. Kogu progressiivse vastuse ja iga jätkuvooru ühine ülempiir jääb 15 sekundiks ning ka kuni 1,8-sekundiline pääsujärjekorra ooteaeg kuulub sama eelarve sisse. NDJSON-vastus püsib globaalse ja kliendipõhise admission'i sees kuni ühenduse sulgumiseni, arvestab `write()` backpressure'it, katkestab kahe sekundiga mitte-drain'iva või mitte-sulguva transpordi, seab 20-sekundilise aktiivse vastuse jõudeaja ning ei väljasta üle 2 MB. Kõigil avalikel vastustel, kaasa arvatud staatika ja SPA fallback, on lisaks 20-sekundiline jõude- ning 60-sekundiline absoluutne elueapiir. Protsess lubab vaikimisi kuni 256 socket'it, 224 aktiivset vastust ja 192 mitte-tervisekontrolli vastust; kliendipõhised laed on vastavalt 16 ja 12 ning tervisekontrollidele jääb reserv. Vana kõik-korraga JSON-liides jätab võrgule varu ja lõpeb hiljemalt 12 sekundiga. HTTP päised peavad saabuma 5 ja päringukeha 10 sekundi jooksul; kliendi katkestus tühistab JSON-, stream-, listing-, jätku- ja Terrapointi töö. PostgreSQL-i päringu ja statement'i vaikimisi piir on 4 sekundit. Korraga sünteesitakse kuni kaheksa täismahus otsingut, kuid üks usaldusväärselt tuvastatud kliendiaadress saab neist vaikimisi ainult kaks; 32-kohaline protsessiülene järjekord teenindab kliendijärjekordi ringmeetodil ja jätab alati koha teisele aadressile. AI-orchestratsiooni töökohti on kaks; ülejäänud otsingud saavad väikese JSON 503 + `Retry-After` vastuse või sama tõendi koondvastuse. Mitme agent-turniga tee vajab enne tootmisdeploy'd eraldi live-latentsus- ja koormusevali.

Metsapindala tõendipiir klassifitseerib geograafia enne riikliku SMI vaatlusmaterjali lubamist. Eesti linnad ja vallad, kõik maakonnad, nimega välisriigid või muud piirkonnad ning positiivse kohanimegrammatikaga tundmatud kohad vajavad sama koha, aasta, näitaja, ühiku ja väärtusega seotud vaatlust. Tõstuta üldsõnad nagu „praegune”, „kokku” või „protsentides” säilitavad Eesti vaikimisi ulatuse, kuid kohalik või välisriigi päring tagastab sobiva tõendi puudumisel allikateta täpsustuse. Sama ulatus kontrollitakse uuesti lõplikus tõendivalikus, mitte ainult intentimarsruuteris.

Vahemälu võti sisaldab vastuse- ja retrieval-skeemi revisjoni ning jooksva järjestatud tulemusehulga URL-ide, järjekorra, metaandmete ja sisuversioonide sõrmejälge. Allika uuendamine, eemaldamine või tombstone muudab võtit; lisaks kontrollitakse cache-hit'il, et iga viidatud URL kuulub endiselt nähtavasse tulemusehulka. Päringu osa võtmes on `SEARCH_HASH_SECRET`-iga HMAC-SHA-256, mitte sõnastikuründega proovitav lihtne räsi. Seega ei saa vana Terrapointi, eelkirjutatud metsakorpuse või varasema tulemuselepingu vastus pärast deploy'd ega allikamuutust edasi elada.

### AI tõendileping ja tagasilükkamise semantika

Mudeli kasutamine ei anna päringule vastamisõigust. Mudel kutsutakse ainult siis, kui serveri deterministlik tõendivärav on märkinud vähemalt ühe ametliku dokumendi sama päringu jaoks piisavalt tugevaks. Managerile saadetakse üksnes selle päringu piiratud tõendipakk (`summary`, kontrollitud väide ja/või puhastatud ametliku lehe sisu); kohustuslik review-tööriist annab mõlemale spetsialistile täpselt sama serveri koostatud küsimuse ja tõendi. Agentidel ei ole selles voos veebi-, andmebaasi- ega väliste tööriistade juurdepääsu. Tõenditekst on sisendandmed, mitte juhis, ning selles leiduvat käsku ei täideta.

Mudeli väljund ei lähe otse kasutajale. Server kontrollib enne avaldamist, et:

- iga muudetud väide viitaks kuvatud allikanumbrile;
- väites olev arv, aasta, ühik ja materiaalne subjekt esineksid samas viidatud numbriklauslis, mitte teises lauses või allikas; subjektita arvuklauslit võib kasutada ainult muutmata verbatim-väitena;
- väite sisulistel sõnadel oleks piisav kattuvus viidatud tõendiga;
- eitus, lubamine/keelamine ning kasvu või languse suund ei pöörduks vastupidiseks;
- vastuse esimene väide kataks kasutaja küsitud objekti, näitaja ja muutuse suuna, mitte üksnes mõne tõendatud kõrvalfakti;
- pealkiri ja usaldusmärkus jääksid deterministlikust algvastusest, mitte mudelist.

Kontrolli ebaõnnestumine ei lisa vastusele hoiatust ega lase vigast teksti läbi. Vigane lõik eemaldatakse; vigase sissejuhatuse asemel säilib deterministlik algtekst. Kui ükski mudeli väide kontrolli ei läbi, käsitletakse mudelikatset ebaõnnestununa (`answer: null`). Kui ühises ajapiiris tehtud korduskatse samuti ebaõnnestub, tagastab pipeline ausa algvastuse. Sama juhtub vigase JSON-i, 429 või timeout'i korral.

Deterministlik fallback tähendab üht kolmest selgelt piiritletud liigist:

1. sama päringu esimese tugeva ametliku allika kõige otsesem lühike tekstilõik koos viitega; kui sellist lõiku ei ole, nähtavad allikakaardid ja aus abstention;
2. eelkirjutatud reaalaja-suunamine, katastrivastus, täpsustusküsimus või ulatusest loobumine;
3. globaalse ajapiiri korral eelkirjutatud teade ja juba leitud asjakohased allikakaardid, mitte uus genereeritud faktivastus.

Sõna „kontrollitud” tähendab siin praktikaprojekti tehnilist kontrolli, mitte Keskkonnaagentuuri sisueksperdi kinnitust. Dünaamilise allika viite lubamiseks peab URL jääma `server/integrations.mjs` ametlike HTTPS-hostide lubatud nimekirja ka pärast ümbersuunamist. Lause ja viite temaatilist seost kontrollitakse viidatud tõendi, mitte kogu vastuse vastu. Autoriteetne allikate ja API-de register on `docs/ALLIKAD.md`; runtime'i kataloog on `server/search.mjs` ning metsakorpuse register `server/knowledge/forestry/sources.json`.

## Regressiooni- ja võrdluskorpus

Failid asuvad kaustas `server/knowledge/forestry/`:

- `sources.json` — 16 ametlikku algallikat koos väljaandja, URL-i, kuupäeva ja kasutuspiirangutega;
- `documents.json` — 21 struktureeritud vastust koos aliaste, metoodika, piirangute, väitetüübi ja täpse allikakohaga.

Korpus katab muu hulgas metsasuse, SMI metoodika, juurdekasvu, raiemahu, Metsaregistri, metsateatise, kaitse, elurikkuse ja kliimariskide küsimused. Seda kasutatakse regressioonitestides, terminite ja soovituste kontrollis ning uue dünaamilise järjestaja võrdlusalusena. Primaarne `/api/search` ei tagasta neid dokumente otse ega kasuta nende eelkirjutatud vastuseid värske otsingu asemel.

Materjal on `prototype_research_reviewed_not_kaur_approved`: tehniliselt kontrollitud praktikakorpus, mitte Keskkonnaagentuuri sisuline kinnitus. Enne tootmiskasutust peab sisuekspert versiooni kinnitama.

## Avalikult ligipääsetavad runtime-ühendused

### Ametlikud avaandmeteenused

| Liides | Kasutus |
|---|---|
| `gsavalik.envir.ee/geoserver/kataster/wfs` | Valideeritud katastritunnuse kehtiv üksus, pindala, aadress ja sihtotstarve |
| `gsavalik.envir.ee/geoserver/metsaregister/wfs` | Sama tunnuse avalikud metsaeraldise kirjed, pindalad ja inventeerimiskuupäevad |
| `gsavalik.envir.ee/geoserver/eelis/ows` | Fikseeritud `eelis:avalikud_vooluveekogud` WFS-kirje Emajõele (`VEE1023600`); täpsed `avalik=Jah` ja `avalik_kas=Avalik` väljad, mitte isiklik tegevusluba |

Maa- ja Ruumiameti teenus on tasuta avalik teenus, kuid selle väljavõte on kasutustingimuste järgi informatiivne ja mitteametlik.

### Portaali avalikud veebiliidesed ja algallikad

| Ühendus | Kasutus |
|---|---|
| `keskkonnaportaal.ee/et/search?search_api_fulltext=...` | Portaali värske sisu avastamise fallback |
| `keskkonnaportaal.ee/sitemap.xml` | 8407 avaliku lehe korpuse avastamine ja muutmisajad |
| `keskkonnaportaal.ee/et/search_api_autocomplete/kem_kkp_search` | Täiendavad puhastatud soovitused pärast enda FAQ-sid |
| `et.wikipedia.org/w/api.php` | Kaheksa kureeritud mõisteartikli täistekst; ainult täiendav taustatase |
| `search.service.eu-live.vportal.ee/v1/search/keskkonnaamet` | Keskkonnaameti ametliku veebisisu relevantsusjärjestusega täistekstiotsing |
| `search.service.eu-live.vportal.ee/v1/search/keskkonnaagentuur` | Keskkonnaagentuuri ametliku veebisisu täistekstiotsing |
| `search.service.eu-live.vportal.ee/v1/search/kliimamin` | Kliimaministeeriumi ametliku veebisisu täistekstiotsing |
| `tableau.envir.ee/.../OlmejtmeteringlussevttEestijaEuroopaLiit.csv` | Olmejäätmete ringlussevõtu määra küsitud aasta tüübikindel Eesti/EL väärtus; nummerdatud viide avab täpse CSV-väljundi ja eraldi tegevuslink portaali näitajalehe |
| `ilmateenistus.ee/ilma_andmed/xml/observations.php` | Kuni 15 minuti vanune jaama-, aja-, näitaja- ja ühikupõhine ilmavaatlus toetatud Eesti linnadele |
| `ilmateenistus.ee/ilma_andmed/xml/forecast.php` | Nelja järjestikuse kuupäevaga Eesti prognoos; automaatvastus kasutab ainult Eesti ajavööndi homset üldprognoosi ega omista seda linnale |
| `keskkonnaandmed.envir.ee/f_hydroseire` | Täpse kureeritud jaama ning `WL avg`, `WT avg` või `Äravool avg` seeria viimati avaldatud tunni keskmine; `Accept-Profile: apijahiala`, andmeaeg kuni 36 tundi vana ja alati eraldi reaalaja veepäringust; jaama graafiku null, põhjalähedane temperatuuriandur ja operatiivse toorandme staatus on vastuses sõnaselgelt eristatud |
| `keskkonnaandmed.envir.ee/f_kliima_paev` | Ühe 25 kureeritud jaama täpne kood, `DTA08` element ja üks minevikukuupäev; `Accept-Profile: apijahiala`, üks sama identiteediga rida, °C, allika avaldamisajatempel ning kuni 13 tunni vanune operatiivne allalaadimine |
| `keskkonnaandmed.envir.ee/f_rahvalad` | Ühe kuuest kureeritud Natura loodusala täpne nimefilter ja fikseeritud kümne välja projektsioon; üks kehtiv sama EL-i/KKR-koodiga rida, registri muutmisaeg ja kolm pindalavälja |
| `andmed.stat.ee/.../KK048.PX` | Fikseeritud JSON POST: 2024, kogu Eesti, kõik tegevusalad ja vesi kokku; üks range JSON-stat2 väärtus tuhandetes m³, CC BY-SA 4.0 ning stale/redirect/sisutüübivea korral arvvastus puudub |
| `andmed.stat.ee/.../KK25.PX` | Fikseeritud JSON POST: 2024, kogu Eesti ja bioloogiline hapnikutarve (`BHT7`); üks range JSON-stat2 väärtus tonnides, CC BY-SA 4.0 ning stale/redirect/sisutüübi-, dimensiooni- või status-vea korral arvvastus puudub |
| `andmed.stat.ee/.../KK068.PX` | Fikseeritud JSON POST: 2024, ohtlikud jäätmed kokku ja tegevusalad kokku; üks range JSON-stat2 väärtus tonnides kuivkaalus, CC BY-SA 4.0 ning stale/redirect/sisutüübi-, dimensiooni- või status-vea korral arvvastus puudub |
| `andmed.stat.ee/.../KK610.PX` | Serveriga seotud JSON POST: üks sõnaselge aasta 2002–2024, jäätmed kokku ja näitaja „taaskasutamine”; üks range JSON-stat2 väärtus tonnides, CC BY-SA 4.0 ning stale/redirect/sisutüübi-, dimensiooni- või status-vea korral arvvastus puudub |
| Keskkonnaportaali ja teiste ametiasutuste HTTPS-lehed/PDF-id | Vastuse kontrollitavad algallikad |

Keskkonnaportaali Drupali otsa ei käsitleta versioonitud lepingulise API-na. Päringud on ajapiiranguga, vastusemaht on piiratud, tulemused puhverdatakse ning tõrke korral kasutatakse stale-if-error väärtust.

### Eraldatud veebirakendus

`terrapoint.ee` töötab ainult täisrakenduse iframe'ina. See ei ole riigi avaandmeteenus ega üldotsingu andmeallikas.

### Kontrollitud andmeteenused ja järgmised tüübikindlad adapterid

Uuringu käigus kontrollitud ametlikud algallikad on lisatud runtime-kataloogi. Tüübikindlad adapterid katavad olmejäätmete ühe lõppenud kalendriaasta mõõdetud ringlussevõtu määra, Eurostati metsa juurdekasvu/eemaldamise rea, Ilmateenistuse jooksvad jaamavaatlused, Eesti nelja ööpäeva prognoosi, kahe kureeritud hüdromeetriajaama viimati avaldatud tunni keskmised, ühe 25 kureeritud jaama ühe päeva valideeritud `DTA08` kliimanäidu, EELISe Emajõe avaliku vooluveekogu kirje, kuue nimega Natura loodusala täpsed kehtivad kirjed ning Statistikaameti KK048 veevõtu, KK25 BHT7 ja KK068 ohtlike jäätmete Eesti 2024. aasta koondlahtrid ja KK610 kogu jäätmete taaskasutamise lahtri ühel sõnaselgel aastal 2002–2024 ning KK51 metsavaru ja MM03 metsaraie aastaread mitme aasta metsaküsimustele. Olmejäätmete ringlussevõtu määra mitme aasta, lühendatud aastavahemiku ja suhtelise ajaperioodi võrdlus loobub, kuni kõik perioodid siduv eraldi võrdlusadapter on olemas; KK610 tõendab ainult tonnides taaskasutatud kogu jäätmete kogust, mitte ringlussevõtu määra ega trendi. Keskkonnaportaali ülevaade tõendab eraldi jäätmete raamdirektiivi sihttasemeid — vähemalt 55% massi järgi 2025. aastaks ja vähemalt 60% massi järgi 2030. aastaks — kuid seda kasutatakse otsese tõendina ainult sihttaseme päringus, mitte Eesti mõõdetud tulemuse ega eesmärgi saavutamise küsimuses. Muud reaalaja õhu-, vee- ja registrivaated on turvalised suunamisallikad, kuni järgmised teenused saavad enne automaatset vastust skeemi-, ühiku-, aja- ja eval-kontrolliga adapteri:

- muud KAUR PostgREST `https://keskkonnaandmed.envir.ee/` kliima- ja seireelemendid, jaamad ning perioodid;
- muud kui kuue kureeritud Natura loodusala EELISe avalikud JSON-jaotused ning KAUR GeoServeri WFS kaitse-, Natura-, vääriselupaiga ja Metsaregistri andmetele;
- Maa- ja Ruumiameti AKS WFS aadressi- ja katastriotsingule;
- Statistikaameti PXWeb tabel MM04 (raiedokumentide statistika); MM03 SMI hinnang on eraldi adapteriga aktiivne ja neid ei tohi kokku segada;
- Riigi Teataja kuupäevastatud API õiguslikele küsimustele.

Ruumipäringu kolm kohustuslikku olekut on `leitud`, `eduka päringu tulemusel ei leitud` ja `allikas ei vastanud`. Timeout või 504 ei tohi kunagi muutuda väiteks, et piirangut või metsa ei ole.

## Terrapointi integratsioon

Avaleht manustab `https://terrapoint.ee/` tervikuna. Praktikaportaali CSP lubab frame'ida ainult Terrapointi ning Terrapoint lubab oma `frame-ancestors` loendis praktikadomeeni.

Terrapointi desktop-autofookus on top-level aknaga piiratud: iseseisval lehel võib otsing saada fookuse, iframe'is mitte. Vana `/embed/terrapoint` ja piiratud proxy-route'id on alles ainult tagasiühilduvuseks ning üldotsing neid ei kutsu.

Täisrakenduse iframe kasutab täpset `sandbox="allow-forms allow-same-origin allow-scripts"` profiili; OpenStreetMapi kinnistukaart kasutab ainult `allow-same-origin allow-scripts`. Kumbki ei saa popup'i ega ülemise akna navigatsiooni õigust. Turvapiiri täiendavad brauseri cross-origin same-origin policy, hosti kitsas CSP `frame-src https://terrapoint.ee`, range referrer policy ning kaamera, mikrofoni ja geolokatsiooni keelav `Permissions-Policy`. Praktikaserveri kaks vana proxy-route'i aktsepteerivad ainult fikseeritud Terrapointi upstream'i: aadress on pikkuspiiratud ja katastritunnus peab vastama täpsele formaadile; kasutaja ei saa anda serverile suvalist fetch-URL-i. Üldotsingu ja Luna kooditee neid route'e ei kutsu.

## Kohalik käivitamine

Nõuded: Node.js 24 ja npm.

```bash
npm install
npm run build
PORT=4174 PROXY_MODE=direct PUBLIC_ORIGIN=http://127.0.0.1:4174 LLM_ENABLED=false SEARCH_CACHE_ENABLED=false npm start
```

Täiskeskkond Docker Compose'iga:

```bash
cp .env.example .env
# genereeri .env faili eraldi POSTGRES_PASSWORD ja vähemalt 32-baidine SEARCH_HASH_SECRET;
# soovi korral lisa serveripoolne LLM-võti
docker compose up --build
npm run sync:corpus -- --hydrate-limit=1000 --seed-queries=mets
```

Vaikimisi käivituvad veebirakendus ja PostgreSQL. Eksperimentaalse Qdranti konteineri saab eraldi käivitada käsuga `docker compose --profile experimental-vector up`, kuid rakenduse praegune otsing seda ei kasuta.

## Coolify seadistus

- build pack: **Dockerfile**;
- sisemine port: `3000`;
- Coolify konteineri readiness health check: `/api/health/container-readiness` iga sekundi järel, timeout 2 s ja kolm järjestikust ebaõnnestumist; avalik minimaalne olek jääb `/api/health`. Kolme katse aken väldib ühe lühikese event-loop'i viivituse tõttu ainsa terve backendi eemaldamist, kuid viiesekundiline shutdown-drain jätab rolling deploy'l endiselt aega vana konteiner enne sulgemist marsruudist eemaldada;
- domeen: `https://praktika.arleserver.cfd`;
- `PUBLIC_ORIGIN=https://praktika.arleserver.cfd`;
- `PROXY_MODE=trusted`; tootmises ei käivitu server määramata režiimi või täpse `PUBLIC_ORIGIN`-ita ning `trusted` režiim nõuab lisaks täpset proxy-ahelat;
- `TRUSTED_PROXY_CIDRS` sisaldab täpselt tegeliku Traefiku ja päriselt ahelas oleva edge-proxy CIDR-e; `trusted` režiim tühja loendiga ja kõiki võrke usaldav `0.0.0.0/0` või `::/0` keelatakse;
- `IPV6_CLIENT_PREFIX_BITS=64` koondab ühe IPv6 võrgu privacy-aadressid samaks rate-limit-, admission- ja LLM-kvoodi identiteediks; kui edge annab kliendile /56 või /48 delegatsiooni, tuleb väärtus vastavaks seada, `/128` jätab aadressid eraldi;
- avaliku transpordi vaikelaed `MAX_HTTP_CONNECTIONS=256`, `MAX_ACTIVE_PUBLIC_RESPONSES=224`, `MAX_ACTIVE_GENERAL_RESPONSES=192`, kliendipõhised aktiivvastuse laed 16/12 ning `PUBLIC_RESPONSE_IDLE_TIMEOUT_MS=20000` ja `PUBLIC_RESPONSE_ABSOLUTE_TIMEOUT_MS=60000`;
- projektile eraldatud `DATABASE_URL`;
- serverisaladus `OPENCODE_ZEN_API_KEY` või `OPENCODE_GO_API_KEY`;
- `LLM_MODEL=gpt-5.6-luna`, `LLM_API_STYLE=responses`, `LLM_ORCHESTRATION=agents` ja `LLM_BASE_URL=https://opencode.ai/zen/go/v1`;
- `LLM_ENABLED=true|false`, `SEARCH_CACHE_ENABLED=true|false`, anonüümse püsistuse laed `SEARCH_CACHE_MAX_ROWS=5000` ja `SEARCH_RUN_MAX_ROWS=50000`, piiratud hoolduspartii `SEARCH_RETENTION_BATCH_SIZE=250`, protsessiülene libiseva akna mudelieelarve `LLM_BUDGET_WINDOW_MS`, `LLM_ROLLING_REQUEST_BUDGET` ja `LLM_ROLLING_TOKEN_BUDGET` ning sama akna kliendipõhine õiglane osa `LLM_CLIENT_REQUEST_BUDGET`/`LLM_CLIENT_TOKEN_BUDGET`;
- vähemalt 32 juhusliku baidiga kanoonilises Base64/Base64URL vormis sõltumatu runtime-saladus `SEARCH_HASH_SECRET` (nt `openssl rand -base64 48`); püsiva andmebaasi korral keeldub server puuduva, madala mitmekesisusega või andmebaasiparooliga kattuva võtmega käivitumast;
- `CORPUS_SYNC_ON_START=true`, `CORPUS_SYNC_INTERVAL_HOURS=24`, `CORPUS_SEED_QUERIES=mets` ja progressiivse täistekstipartii `CORPUS_STARTUP_HYDRATE_LIMIT=200`.

Coolify tokenit, SSH privaatvõtit ega mudelivõtit ei tohi panna reposse, brauserikoodi, dokumentatsiooni või logidesse. Deploy-võti peab olema projektipõhine ja minimaalse õigusega.

Coolify API-token ja GitHubi SSH deploy-võti on ainult haldus- ja juurutusvahendid. Veebikonteiner ei loe kumbagi runtime'is; otsing kasutab eraldi serverisaladust `OPENCODE_ZEN_API_KEY` või `OPENCODE_GO_API_KEY`. Seetõttu ei muuda haldusvõtmete rotatsioon sama image'i otsingu-, allika- ega AI-käitumist, kuid pärast rotatsiooni tuleb kinnitada, et Coolify saab endiselt repot lugeda ja juurutada.

Avaliku timeout-ahela kontroll 18.08.2026: rakendus piirab progressiivse otsingu 15 ja kõik-korraga JSON-liidese 12 sekundiga; fault-injection'i automaattest tõendab, et lõppematu operatsioon katkestatakse ning asendatakse deterministliku vastusega. Jooksva Coolify proxy Traefik 3.6.9 konfiguratsioon ei määra `responseHeaderTimeout` ega response `writeTimeout` väärtust üle; binaari tegelikud vaikeväärtused olid mõlemal `0`, mille Traefik ise kirjeldab kui timeout'i puudumist. Domeeni ees oleva Cloudflare'i [ametlik 524 dokumentatsioon](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/) määrab vaikimisi Proxy Read Timeout'iks 125 sekundit. Seega on rakenduse halvim vastusepiir 15 s väiksem kui avaliku edge'i 125 s piir ning Traefik ei katkesta vastuse ootamist enne rakenduse fallback'i.

## Turve ja privaatsus

- Otsingul ja Terrapointi tagasiühilduvusmarsruutidel on üldisest API-st rangem kliendi ja fikseeritud operatsiooni põhine piirang; ressursi tee ega katastritunnus ei loo uut kvooti. Edastatud kliendiaadressi kasutatakse ainult siis, kui paremalt vasakule kontrollitav proxy-ahel kuulub `TRUSTED_PROXY_CIDRS` loendisse. Täielik valideeritud aadress ja abuse-control identiteet on eraldi: IPv4 jääb aadressipõhiseks, IPv6 nullitakse `IPV6_CLIENT_PREFIX_BITS` järel ning sama võti juhib rate-limit'it, admission'it ja kliendi LLM-kvooti. `PROXY_MODE=direct` kasutab vahetut socket'it, kuid tootmine nõuab eksplitsiitset režiimi ja fikseeritud brauseri `PUBLIC_ORIGIN`-it; `trusted` nõuab lisaks mittetühja täpset ahelat. Host-päisest ei tuletata lubatud päritolu.
- Päringu pikkus, URL-id, allikate hostid, response size ja redirect'id valideeritakse serveris. Kõik suured upstream-vastused läbivad enne JSON-i või teksti parsimist voogedastava baitpiiri; Terrapointi ja ametlike integratsioonide protsessivahemäludel on lisaks ühine bait-eelarve.
- Autocomplete'il on eraldi kliendikvoot, kahe töökoha, kliendi aktiivpiiri ja kliendipõhise ringmeetodil piiratud järjekorraga upstream-värav, sama päringu koondamine ning viimase katkestanud kliendi järel tühistatav fetch. Portaali tõrke korral kuvatakse ainult päringu juurtega täielikult kattuvaid, läbi vaadatud metsa- või struktureeritud keskkonnaandmete näiteküsimusi; semantiline kõrvalvaste ei täida nimekirja teise valdkonna soovitustega. Korpuse avalik statistikarada kasutab eraldi 20 päringu/minuti kvooti, kliendipõhist HTTP-admission'it ja 60-sekundilist koondatud snapshot'i. Tegeliku andmebaasitöö jaoks on teine kahe töökoha piir: selle lease vabastatakse alles loader'i tegelikul lõppemisel, ka siis, kui HTTP-klient on juba lahkunud või draiver eirab katkestust. Nii ei saa katkestatud päringud PostgreSQL-i ühenduste reservi nähtamatult monopoliseerida.
- Päringuaegne ametlike URL-ide püsindekseerimine läbib ühe kirjutajaga, 500 URL-i ja 50-kirjelise partii ülempiiriga protsessiülest järjekorda. Sama kanoniseeritud URL koondatakse, õnnestunud kirjutus summutatakse 15 minutiks, sulgemine tühistab aktiivse transaktsiooni ning `official-live-search` kirje peidetakse vaikimisi 7 ja kustutatakse 14 päeva järel, kui seda uuesti ei avastata.
- LLM-võti seotakse enne selle lugemist täpselt `https://opencode.ai` HTTPS-päritoluga; mandaati, porti, päringuparameetrit, fragmenti või teist päritolu sisaldav alus-URL peatab käivituse. Terrapointi ja live-grounding auditi väljuvad päringud kontrollivad iga ümbersuunamist, tegelikku DNS/IP-aadressi ja voogedastatud baitide ülempiiri.
- Avalik `/api/health` on minimaalne ega paljasta teenuseid või pakkujaid.
- LLM-võti ei jõua brauserisse; mudel saab ainult avaliku küsimuse ja valitud avalikud tõendid.
- Luna töötab välise OpenCode Go teenusena. Agents SDK manager ja tema kaks piiratud spetsialisti ei näe rohkem kui küsimust, kuni kümne järjestatud avaliku allika päringupõhiselt valitud väljavõtteid (kokku kuni 36 000 märki), väljundskeemi ja jätkuvoorus kuni 1 400 märki varasemate küsimuste konteksti; kasutaja IP-d, küpsiseid, andmebaasilogi ega kogu korpust sinna ei lisata. Kõigil SDK mudelikõnedel on `store: false` ja tracing välja lülitatud. Tehnilised privaatsustingimused asuvad kasutajaliideses ainult lehe jaluses. OpenCode'i [mudelipõhine privaatsustabel](https://opencode.ai/docs/go/#privacy) märgib Luna sisendi mudelitreeningus mittekasutatavaks, kuid abuse-monitoring'u logid võivad säilida kuni 30 päeva.
- Kõigi klientide ühises libiseva akna eelarves reserveeritakse iga tegeliku mudelikõne piiratud JSON-sisendile tokenizerist sõltumatu ülempiirina üks token iga UTF-8 baidi kohta, lisaks väljundilagi ja protokollivaru, enne võrku saatmist. Pärast vastust asendub reservatsioon teenusepakkuja sisend- ja väljundtokenite kogusummaga; dispatch'i järel teadmata kasutusega katkestus debiteerib täisreservi. Agents SDK transport ei järgi redirecte, ei tee peidetud retry'sid ja katkestab üle 1 MB vastuse. Ainult enne dispatch'i peatatud jooks ei kuluta eelarvet. Ammendunud reserv ei katkesta otsingut: uus tasuline kõne jäetakse tegemata ja kasutajale jääb sama jooksva tõendi deterministlik viidatud vastus.
- Ametlikud live-otsingud näevad serveri päringut ja väljuvat IP-d. Terrapointi iframe on brauseri otseühendus: sinna sisestatud andmed lähevad Terrapointile, kuid praktikaportaali üldotsingu päringuid Terrapointile ei saadeta.
- Otsingulogi ei säilita kasutaja toorpäringut. Logi ja cache kasutavad võtmega HMAC-SHA-256 sõrmejälge ning uutes tabelites ei ole päringuteksti veergu. Vahemälu `privacy-safe-v6` lubatud väljade skeem ei salvesta `query` välja, päringust tehtud pealkirja ega mudeli loodud vastuseproosat; ühisesse PostgreSQL-i cache'i sobib ainult deterministliku serveritee kontrollitud mall koos ametlike allikate avalike väljade ning rangelt piiratud tõendipoliitika ja värskuse metaandmetega. Need sisemised väljad valideeritakse cache-hit'il uuesti ega kuulu avaliku vastuse lubatud väljade hulka. Täieliku päringu või mistahes vähemalt kolmetähelise sisulise päringutokeni otse, käändevormis või korduvalt URL-, HTML- või kaldkriipsuga kodeeritult säilimine jätab kogu vastuse salvestamata. Tundlikku identifikaatorit (e-post, telefon, isikukood, UUID, katastritunnus või pikk unikaalne täht-numbriline tunnus) sisaldav päring ei ole üldse vastusecache'i jaoks kõlblik. Dekodeerimine peab piiratud töömahu sees jõudma fikspunktini, vastasel korral jäetakse cache-kirjutus ära. Skeemi käivitumigratsioon nullib valikulise cache'i ühe `TRUNCATE`-operatsiooniga, kui leiab vana päringuteksti veeru või ühildumatu vastuseümbrise, ning eemaldab mõlemast otsingutabelist vana tekstiveeru enne valmisolekut; tavapärane aegumise ja mahupiiri hooldus jääb kuni 250 rea kaupa piiratuks. Cache'i 5000 ja tehnilise run-logi 50 000 rea vaikepiir jõustatakse ühe andmebaasiülese mittekohustusliku advisory-lock'i sees: iga uus rida teeb enne insert'i ruumi, mitme partii vana võlg ei saa uue anonüümse päringu tõttu kasvada ning lock'i hõive jätab vabatahtliku püsistuse vahele. UI saadab otsingu ja soovitused JSON POST-kehas: toorpäring ei lähe aadressiribale, lehe pealkirja ega püsivasse brauserisalvestusse; back/forward hoiab ainult läbipaistmatut protsessimälu ID-d.
- Degradeerunud portaali- või ruumivastust ei salvestata tunniajase kvaliteetvastusena, et järgmine päring saaks taastunud allikaid uuesti proovida.
- PostgreSQL-i transaktsioon kasutab ühte reserveeritud klienti ning SQL on parameeterdatud.
- Iga seadistatud PostgreSQL nõuab eksplitsiitset `DATABASE_SSL_MODE` väärtust. Plaintext `disable` on lubatud ainult Compose'i täpsele `postgres` hostile, loopback'ile või `DATABASE_PLAINTEXT_HOSTS` loendis eksplitsiitselt nimetatud sama keskkonna privaathostile; loend ei luba skeemi, porti ega wildcard'i. Iga muu host keeldub sellega käivitumast ja vajab serdi ning hostinime kontrolliga `verify-full` režiimi.
- Coolify runtime kasutab eraldi kasutajat `practice_user` ja andmebaasi `keskkonnaportaal_practice`; kontrollhetkel olid PostgreSQL-i `log_statement=none` ja `log_min_duration_statement=-1`, seega päringutekste serveri SQL-logisse ei kirjutatud.
- Päringusnapshot'i saab kirjutada ainult `configured-seed` päritoluga; avalik kasutajapäring ei kutsu snapshot'i kirjutusrada.
- Veebiimage töötab mitte-root `node` kasutajana. Node'i build/runtime, PostgreSQL-i ja valikulise Qdranti image'id kasutavad tagi kõrval ametlikust registrist kontrollitud immutable multiarch-digestit. Compose lisab read-only failisüsteemi, `no-new-privileges` režiimi, piiratud `/tmp` tmpfs-i ja logirotatsiooni. Coolify Dockerfile-runtime kasutab `--cap-drop=ALL --init`; Coolify ei rakenda selles build pack'is `--read-only` valikut, kuid `/app` on root-omandis ja `node` kasutajale kirjutuskaitstud. Ajutised kirjutused jäävad `/tmp` alla.
- Rakendus ei renderda mudeli või allikate toorest HTML-i.

## Testid ja väljalaskekontroll

Relevantsusandmestike masinloetav provenance, eraldi päringu- ja qrel-hashid, mõõdikute definitsioonid ning ausad piirangud asuvad failis [`evaluation/relevance_evaluation_manifest_v1.json`](./evaluation/relevance_evaluation_manifest_v1.json). Testisviit arvutab hashid uuesti, kontrollib väravaid ja ebaõnnestub vaikse andmestikumuudatuse korral.

```bash
npm test
npm run build
npm run test:sites
docker compose config
npm run eval:holdout
npm run eval:blind
npm run eval:live -- --base-url=https://praktika.arleserver.cfd
npm run audit:filters -- --base-url=https://praktika.arleserver.cfd
npm run audit:followups -- --base-url=https://praktika.arleserver.cfd
npm run audit:grounding -- --base-url=https://praktika.arleserver.cfd
npm run audit:load -- --base-url=https://praktika.arleserver.cfd
npm run audit:load-results -- --base-url=https://praktika.arleserver.cfd
```

`audit:load-results` kontrollib eraldi tulemuste endpoint'i jagatud koormuspiiri ja
portaalilehe kättesaadavust. Avalikus Cloudflare'i ees olevas tootmises on 20 samaaegse
päringu täpne 8/12 jaotus ainult vaatlusnäitaja: edge võib päringud origin'ini ajastada
mitmes laines, kuid iga vastus peab olema kas valmis tulemuste `200` või kontrollitud
capacity-`429` koos `Retry-After: 2` päisega. Otsese origin'i kontrollis saab lisada
`--strict-capacity=true`; siis peab `SEARCH_MAX_CONCURRENCY=8` korral jaotus olema täpselt
8 valmis tulemust ja 12 capacity-vastust.

Koormuspuhangu järel tehtav 21. päring on teadlikult **rate-limit'i proov**, mitte aktiivse
otsingukonkurentsi mõõtmine: see peab saama `429` ja `Retry-After: 60`. Audit teeb puhangu
ajal ning vaikimisi veel 10 sekundi järel cache-busted `GET /` ja `GET /api/health` proove;
kumbki ei tohi anda 5xx ega ületada 2,5 sekundit. Aega saab lokaalses kiirtestis muuta
valikuga `--availability-tail-ms=0`. Timeout, 5xx, vale tulemuseendpoint'i vastuseklass või
rate-limit'i päise puudumine ebaõnnestab auditi.

Automaattestid kontrollivad muu hulgas:

- 16 allikaga regressioonikorpuse, 21 dokumendi, 18 FAQ teema ja 12 väärarusaama sisemise tervikluse;
- eraldiseisva tulemuste lehitsemise, korpuse parserid ja ametlike URL-aliaste deduplikatsiooni;
- fraasi- ja lõigukattega relevantsusjärjestuse, tegeliku avaldamisaja, tulevikukuupäeva karistuse ning allika-, tüübi- ja aastafiltrite jõustamise;
- 99 allikaga runtime-kataloog, 59 päringuga külmutatud routing-komplekt, 40 päringuga holdout, 10 päringuga lukustatud post-fix regressioonikomplekt, 18 päringuga avatud adversariaalne eval ning 147 päringuga 11 valdkonna arendusmaatriks; viimane ei ole liikluslogidest tuletatud populaarsusmõõtmine ega sõltumatu holdout;
- 40 päringuga holdout'i P@1, MRR, nDCG@5 ja Recall@5 väravad ning sama komplekti URL-põhise live-kontrolli; andmevaliku tõenduspiir ja ühe binaarse qrel'i piirang on masinloetavas eval-manifestis;
- 24/24 teenusepäringu õige esimese allika nii deterministlikus järjestajas kui ka külma PostgreSQL-i vahemäluga päris HTTP-voos;
- külmutatud v2 hindamiskomplekti 30/30 vastatava päringu õiget intent-vastust ja Recall@3 väärtust 100%;
- `mets` päris sünteesi, täpset FAQ vastust ja turvalist abstention'it;
- raiemahu/netojuurdekasvu operaatorit, dünaamilist viie aasta akent, dense JSON-stat nullväärtusi, täpseid aastaid, kvaliteedilippe, ühikut „m³ koorega” ja bruto-/netomõiste lahusust;
- progressiivse `results → draft? → answer` protokolli fragmenteeritud pakette, suuruspiiri, terminalset lõppvastust ja katkenud voo turvalist säilitamist;
- mudelivastuse viidete, arvude, ühikute, väitekatvuse, polaarsuse ja tervikliku lauselõpu kontrolli;
- jooksva sisevee, merevee, jääolude ja suplusvee alamliigi õiget reaalaja-suunamist ning vana mõõtmise hetkeväärtusena esitamise keeldu;
- „kas Eestis saab mets otsa” intenti, Majakivi matkalause välistamist ning mitme näitajaga ametliku metsavastuse viiteid;
- arvuliste ja võrdlevate väidete täpset tõendilauset, sealhulgas üksuse, aasta-väärtuse paari, mõõtühiku ja võrdluse osapoolte vahetamise keeldu;
- progressiivse voo 15 sekundi ja kõik-korraga JSON-liidese 12 sekundi vastusepiiri kontrollitud fallback'i ning vahemälu toorpäringu eemaldamist;
- kõigi nelja otsingutee ühist kaheksa töökoha piiri; listing-endpoint annab ülekoormusel kontrollitud `429` capacity-vastuse ega alusta piiramatut retrieval'it;
- deadline'i järel katastri-cache'i ja PostgreSQL-i tehingu rollback'i ning vana otsingu/autocomplete'i hilise vastuse blokeerimist;
- võtmega HMAC-sõrmejälge, vana liht-räsi migratsiooni ja allikate liikmelisuse, järjekorra või sisu muutumisel cache'i invalidatsiooni;
- kolme järjestikuse jätkuküsimuse filtri-, allika- ja viitelepingu püsimist;
- Terrapointi ning infrastruktuurijargooni puudumist üldotsingu payload'ist ja UI-st;
- kuni viit sisulist autocomplete-soovitust;
- Sites-buildi lepingut.

Brauseri regression peab katma 1440 × 1100 ja 390 × 844 vaated, autocomplete'i kihistuse, klaviatuurikäitumise, mobiili esimest vaadet, kompaktset otsingulehte, allikate avamist, horisontaalse overflow puudumist ning avaliku iframe'i fookuse/scroll'i kontrolli.

18.08.2026 enne progressiivse otsingu muudatust kontrollitud baseline oli commit `392687311f073bb43bd109df40afa6461c23bebe`, Coolify deployment `hvs6wvgz3g8ea7aq1jx4p5f6`. Avalik `/api/health` tagastas sama täispika revisjoni; konteiner oli `healthy`, restartide arv 0 ja kasutaja `node`. Live-eval sai 24/24 päringul oodatud esimese allika ja 1242/1242 avaliku lepingu kontrolli. Grounding-audit läbis 10/10 esinduslikku vastust, 10/10 adversariaalset loobumist, 14 väidet ja 17 allikaavamist. Filtrimaatriks läbis 210/210 ja juur + kolm jätkuküsimust 36/36 kontrolli. Ükski neist kontrollidest ei andnud 504. Jooksva väljalaske täpne revisjon on alati masina-loetavalt `/api/health` vastuses ja Coolify deployment-ajaloos, mitte käsitsi muudetavas dokumendiväljas.

20 samaaegset päringut andsid 20 HTTP 200 vastust: 11 allikapõhist fallback'i, 1 deterministlik marsruutvastus ja 8 selgelt märgitud capacity-fallback'i; timeout'e, 5xx-e ja 504-sid oli 0. P50 oli 8748 ms, p95 15 169 ms ja maksimum 15 333 ms. Pöörlevad `X-Forwarded-For` väärtused ei möödunud piirangust ning 21. päring sai 429 + `Retry-After: 60`. Eraldi täielikult võrguühenduseta 1 s rikketest andis 5/5 kontrollitud HTTP 200 vastust, maksimum 639 ms.

Vaadetes 1440 × 1000 ja 390 × 844 jäi värske avaleht `scrollY === 0` juurde, aktiivne element oli hostdokumendi `BODY`, põhiotsing oli nähtav ja horisontaalset overflow'd polnud. Terrapointi cross-origin iframe laadis päris `terrapoint.ee` rakenduse ega võtnud hostilt fookust. UI-päring „jäätmete ringlussevõtu määr Eestis 2023” kuvas 37,9% ja EL-i 47,9%, seadis sama ametliku näitaja nii vastuse esimeseks viiteks kui ka laiotsingu esimeseks tulemuseks, fokusseeris tulemuse H1 ning keris viiteklõpsul olemasoleva `source-1` kaardini. Deterministlik race-test tõendas lisaks, et 15,2 s hiline vana otsing ei muuda uuema vastuse pealkirja ega allika-DOM-i ning B→A järjekorras saabunud autocomplete'i vastustest jääb nähtavale ainult B. First-party konsoolis oli 0 viga ja 0 hoiatust.

Cache'i revisjon `answer-v27-fragment-free-cache-and-exact-entities` seob vastuse jooksva järjestatud allikahulga, allikarolli, tõendipoliitika, täpse andmelokaatori, sisuversiooni, täpse nimeüksuse sidumise ja v5 privaatsuspiiriga, et varasema järjestuse, muudetud allika või vana puhastaja vastus ei jääks pärast deploy'd kehtima. Live-allika ja PostgreSQL-i püsikoopia avalik ID tuletatakse kanoniseeritud URL-ist, mistõttu sama tulemus ei vaheta asünkroonse indekseerimise piiril identiteeti ega Reacti võtit.

## Olulisemad failid

```text
server/forestry.mjs                     ajaloolise võrdluskorpuse eval- ja soovitusmootor
server/knowledge/forestry/sources.json regressiooni allikaregister
server/knowledge/forestry/documents.json regressiooni struktureeritud vastused
server/integrations.mjs                 portaali discovery ja ametliku täislehe lugemine
server/indicators.mjs                   ametlike masinloetavate näitajate tüübikindlad adapterid
server/corpus.mjs                       PostgreSQL-i korpus, sitemap, MediaWiki ja lai otsing
server/sync-corpus.mjs                  käsitsi käivitatav korpuse sünkroniseerimine
docs/ALLIKAD.md                         kontrollitud allikate, API-de ja piirangute register
docs/ARHITEKTUUR.md                     portaali ja praktikalahenduse arhitektuuriuuring
server/cadastre.mjs                     ametliku katastri ja Metsaregistri WFS-vastus
server/pipeline.mjs                     intent, retrieval, vastus ja cache
server/retrieval.mjs                    ühendotsing, deduplikatsioon, filtrid ja relevantsusjärjestus
server/llm.mjs                          valikuline, viiteid säilitav sõnastuskiht
server/database.mjs                     PostgreSQL-i cache ja sisemine logi
server/index.mjs                        API, turvapäised ja tervisekontroll
src/App.jsx                             vaated ja ligipääsetavad otsinguvood
src/styles.css                          responsive visuaalne süsteem
tests/                                  automaattestid
compose.yaml                            Docker Compose keskkond
design-qa.md                            enne/pärast brauseritõendid
PRIVAATSUS.md                           otsingu ja välise Luna andmetöötluse piir
```

## Piirangud ja järgmine etapp

- Keskkonnaportaali HTML-otsing on dokumenteerimata fallback ning parser vajab portaali markup'i muutumisel uuendamist. Kolm Valitsusportaali JSON-indeksit vähendavad sellest sõltuvust, kuid ei ole versioonitud avalik leping.
- Väljaspool metsateemat sõltub sisuline koondvastus ametliku liitotsingu tõendikattest. Nõrk vaste annab täpsustuse või abstention'i; uued arvulised vertikaalid tuleb lisada struktureeritud väidete, ametliku API-adapteri ja eval-komplektiga.
- Väline Luna teenus võib olla rate limit'i taga; lai PostgreSQL-i ja ametlike veebide tulemuste loend jääb saadavaks ning faktide väljamõtlemise asemel kuvatakse aus allikaotsingu fallback.
- Terrapointi iframe sõltub mõlema domeeni CSP-st ja selle väliste ametlike teenuste saadavusest.
