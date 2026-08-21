# Ametlike allikate ja API-de register

Uuendatud: 19.08.2026

See register kirjeldab, millised allikad on otsingu päringuteel aktiivsed, millised on kasutajale suunavad kataloogiallikad ning milliseid teenuseid ei kasutata enne eraldi valideeritud adapterit. Ükski allikas ei anna mudelile õigust kasutada üldteadmisi: vastus peab jääma tagastatud tõendite piiresse.

## Aktiivsed päringutee allikad

| Allikas | Väljaandja | Ligipääs | Kasutus ja piirang | Puhver | Eval-kate |
|---|---|---|---|---|---|
| PostgreSQL-i sisukorpus | Keskkonnaportaal ja viidatud avalikud allikad | 8407 algset sitemapilehte, 6057 otsingukaarti, valitud täistekstid ja auditi-snapshot'id | Lai tulemuste loend ning sama loendi ametlike AI-tõendite leidmine; vana snapshot'i järjekord ei asenda relevantsusjärjestust | Püsiv korpus, 24 h sünkroniseerimispoliitika; enne portaali lugemist jõustatakse live `robots.txt` | Parseri-, robots-, deduplikatsiooni-, filtri-, relevantsus- ja avaliku lepingu testid |
| Kureeritud eestikeelne Vikipeedia | Wikimedia kogukond | MediaWiki Action API, kaheksa valitud mõisteartiklit | Ainult täiendav mõistetaust; ei tõenda üksinda ametlikku arvu, õigust ega hetkeolukorda | PostgreSQL-i korpus | Allikatase välistab selle ametliku tõendi rollist |
| Keskkonnaportaali otsing | Keskkonnaagentuur | `https://keskkonnaportaal.ee/et/search?search_api_fulltext=...` | Dokumenteerimata HTML-discovery. Tulemuste HTML-i ei renderdata; server eraldab ainult pealkirja, puhta teksti, URL-i ja metaandmed | 5 min, stale-if-error kuni 24 h | Keskkonnateema positiivsed juhud; teemaväline ja null-vastete negatiivsed juhud |
| Valitsusportaali ühine otsing | Keskkonnaamet, Keskkonnaagentuur, Kliimaministeerium | `https://search.service.eu-live.vportal.ee/v1/search/{index}`; indeksid `keskkonnaamet`, `keskkonnaagentuur`, `kliimamin` | Ametlike veebide täistekstiotsing. Päring kasutab `sort_by=score`, eesti keelt, kuni kuut vastet saidi kohta ja vajadusel kuni kolme intent-laiendust. Sisend on tõend, mitte mudelijuhis. Teenus jättis kontrolli ajal TLS-i vahesertifikaadi saatmata; rakendus lisab Let’s Encrypti ametliku avaliku YR1/YR2 ahela, kuid ei lülita sertifikaadikontrolli välja. Coolify IPv4-only võrgus sunnitakse selle hosti ühendus IPv4-le, et Node ei jääks töötut IPv6 ühendust ootama | 5 min, stale-if-error kuni 24 h | Jäätmete põletamine, Tallinna õhk, metsa vanusetrend, tuleviku raiemaht, load, vesi ja negatiivsed teemavälised juhud |
| Katastri WFS | Maa- ja Ruumiamet | `kataster:ky_kehtiv` GeoServer WFS | Ainult kanonilise katastritunnuse korral. Väljavõte on informatiivne ja mitteametlik; `not_found` ja `unavailable` on eraldi olekud | 10 min; tõrke korral 30 s | Leitud, ei leitud, vigane vastus ja timeout |
| Metsaregistri WFS | Keskkonnaagentuur | `metsaregister:eraldis` GeoServer WFS | Sama katastritunnuse avalikud eraldised. Vaste puudumine ei tõenda metsa puudumist | 10 min; tõrke korral 30 s | Leitud, ei leitud, osaline tõrge ja timeout |

Kõigil võrguallikatel on HTTPS-hostide allowlist, päringu ajapiir, vastusemahu piir ja kontrollitud redirect. Väliskutsed tehakse paralleelselt ning kogu kasutajapäring peab lõppema hiljemalt 15 sekundiga.

Üldotsingu sünteesi juhib OpenAI Agents SDK manager OpenCode Go `gpt-5.6-luna` Responses API kaudu. Mitme allika korral peab manager esmalt kasutama relevantsusspetsialisti ja võib arvude või väidete pingete korral kasutada tõendikriitikut; spetsialistid on manageri tööriistad, mitte eraldi vastusekanalid. Kõik mudelikutsed jäävad nähtava filtreeritud tulemusehulga ametliku tõendialamhulga ja range skeemi piiresse ning lõppväljund läbib viite-, arvu-, ühiku-, väitekatvuse ja polaarsuse kontrolli. Tõrke korral säilib tulemuste loend ja kuvatakse aus fallback; agentidel puudub ligipääs andmebaasile ja veebile.

## Metsastatistika avaldamisseis

19.08.2026 kontrollis oli **SMI 2025** ametlik esitlus-PDF juba Keskkonnaportaali failiruumis avaldatud: [„SMI 2025 ettekanne”](https://keskkonnaportaal.ee/sites/default/files/Teemad/Mets/SMI%20tulemused%202025/SMI%202025%20ettekanne.pdf), serveri `Last-Modified` 18.08.2026. PDF-i metaandmed, tekstikiht ja visuaalselt renderdatud võtmelehed kinnitasid muu hulgas 2,3602 mln ha metsamaad (52,1%), 466 mln m³ tagavara, majanduskategooriad 20,2% / 10,4% / 69,4%, puistute keskmise vanuse 55 aastat ning 2025. aasta raiemahu 11,0 mln m³ eksperthinnangu. Teemakataloogi maandumisleht näitas samal kontrollhetkel veel SMI 2024 aastakäiku, seega käsitleb rakendus seda indeksi viitena, mitte tõendina, et uuem PDF puudub. Uus PDF on runtime'i ametlikus metsakataloogis eraldi allikana ja selle väiteid ei segata SMI 2024 metoodika või arvudega.

## Regressiooni- ja võrdlusmaterjal

Versioonitud metsakorpus sisaldab 16 algallikat ja 21 vastusedokumenti ning selle 30 vastatava päringu külmutatud eval jääb kvaliteedi võrdlusaluseks. See ei ole enam primaarse `/api/search` päringutee allikas: uus vastus peab tulema sama hetke filtreeritud ja järjestatud tulemustest, et vana SMI-aasta või eelkirjutatud väide ei saaks värskemast avaldatud allikast mööda minna.

## Kontrollitud kataloogi- ja suunamisallikad

Runtime'i kataloogis on 95 kirjet: 73 üldist keskkonnaallikat, 20 metsanduse tõendiallikat ja kaks katastri-/Metsaregistri WFS-allikat. Need aitavad valida õige ametliku teenuse ja on nõrga võrguolukorra korral kasutajale suunavad allikad, kuid ei muutu automaatselt konkreetse arvu või õigusliku järelduse tõendiks. 18.08.2026 varasema 48 siht-URL-i automaatne kontroll sai kõigilt eduka vastuse või ümbersuunamise; 19.08 lisatud lehed kontrolliti eraldi nende ametlikul hostil ning lukustati realistliku 147 päringuga arendusmaatriksi ja teemaliste peibutusallikate vastu.

Kataloogi allikaprofiil (`server/source-registry.mjs`) määrab eraldi marsruudiklassi, tarneviisi, värskusklassi ja tõendipoliitika. Need väljad ei lähe avalikku API-sse, kuid takistavad teenuse maandumislehte muutumast seal peituva väärtuse tõendiks.

| Tõendipoliitika | Mida runtime lubab |
|---|---|
| `route-only` | Kuvab ametliku teenuse õige suunana; ei anna selle kirje tekstiga AI-le faktivastuse õigust. |
| `timestamped` | Jooksev väärtus on AI-tõend ainult tüübikindla adapteri mõõte- või kehtivusajaga. |
| `versioned` | Muutuv õigus-, loa- või menetlusseis vajab versiooni või kontrollitud staatuse aega. |
| `claim-specific` | Püsilehe puhastatud sisu võib tõendada ainult päringuga samas lõigus otseselt kaetud väidet. |

Uus kate sisaldab Ilmateenistuse jooksvaid ilma-, hoiatuse- ja hüdroloogiavaateid, Terviseameti joogivee juhist, pinnaveekogumite seisundit, riiklikke ja käitisepõhiseid õhuheiteid, PAKIS-e ja PROTO registreid, Natura alasid, Loodusvaatluste andmebaasi, Metsaportaali, kliimapoliitika andmeväravat ning üleujutusriski kaarte. Dünaamilised vaated on tahtlikult `route-only` või `timestamped`, kuni nende jaoks on skeemi, aja ja ühiku valideerimisega adapter.

| Valdkond | Ametlik teenus | Kontrollitud omadus | Runtime-roll |
|---|---|---|---|
| Keskkonnaseire | KESE andmestikud | Riiklik seire ja seotud uuringud; HTML/CSV ning JSON-jaotused, CC-BY 4.0 | Allika valik ja ametliku seire juurde suunamine |
| Keskkonna- ja ilmaandmed | `https://keskkonnaandmed.envir.ee/` | PostgREST/OpenAPI, kontrolli ajal 303 rada. Kliima, hüdroloogia, seire, EELIS ja järjest lisanduvad KOTKASe jaotused. Reaalne lubatud skeem oli `Accept-Profile: apijahiala` | Kataloogiallikas; konkreetne tabel vajab eraldi tüübikindlat adapterit |
| Avaandmete allalaadija | Keskkonnaportaal | EELIS, KOTKAS, KESE, CLIDATA ja WISKI; CSV ning API-URL-i koostamine | Kasutaja suunamine filtreeritud allalaadimise juurde |
| Ilm ja hoiatused | KAIA ning Ilm+ | Prognoosid, hoiatused, radar, meteoroloogia, hüdroloogia, tuleoht ja mudeltooted | Ajatundlik ilmapäring ei lähe artikli-AI-le; kasutaja suunatakse reaalaja teenusesse |
| Õhukvaliteet | `https://ohuseire.ee/` | Jaama- ja saasteainepõhised ajakohased mõõtetulemused | Reaalaja allika suunamine; hetkeseisu ei tuletata vanast artiklist |
| Ruumiandmed | `https://gsavalik.envir.ee/geoserver` | EELISe ja Metsaregistri WMS/WFS, sh GeoJSON. Tundlikud liigikihid ei ole avalikud | Katastri/metsa adapter on aktiivne; muud kihid vajavad eraldi evalle |
| Ametlik statistika | `https://andmed.stat.ee/api/v1/et/stat` | PXWeb API, sh keskkonna, energia, transpordi ja jäätmete tabelid | Kataloogiallikas; arvvastus vajab tabeli, mõõtme, ühiku ja perioodi adapterit |
| Load ja menetlused | KOTKAS | Keskkonnaload, KMH/KSH ja aruandlus | Menetluse ametliku seisu algallikas; otsing leiab juhendi või menetluse viite |
| Vee seisund | KESE, VEKA, KOTKAS ja Keskkonnaagentuuri veeleht | Eristab mõõtmise, veekogumi seisundihinnangu ja kasutusandmed | Otsing nõuab veekogu/näitaja/aasta täpsustust |
| Puurkaevud | [Keskkonnaportaali register](https://register.keskkonnaportaal.ee/register/search?objectType=DRIVEN_WELL&status=kinnitatud) | EELISe puurkaevude ja puuraukude registrikirjed ning objekti geoloogilised andmed | Puurkaevu päring suunatakse filtreeritud registrivaatesse, mitte põhjaveekogumi üldise seisundi artiklisse |
| Merevaatlused ja jää | [Keskkonnaagentuuri merevaatlused](https://www.ilmateenistus.ee/meri/vaatlusandmed/) ning [jääkaart](https://www.ilmateenistus.ee/meri/jaakaart/) | Rannikujaamade veetase, veetemperatuur, ajaloolised vaatlusandmed ja mere jääolud | Jooksev vaatlus suunatakse mõõteandmetesse; jääpäringus tõstetakse eraldi jääkaart teiseks või esimeseks tulemuseks |
| Tallinna müra | Tallinna linna 2022. aasta mürakaart | Liiklus-, tööstus- ja summaarne müra; kaart kirjeldab 2019. aasta pikaajalist olukorda ning ei lahenda lokaalset häiringut | Täpne mürakaardi suunamine koos ajaperioodi ja kasutuspiiranguga |
| Jäätmekäitluskohad | Keskkonnaportaali Andmed ja kaart + KOTKAS | Kehtivate ja arhiveeritud käitluskohtade kaardikiht ning objekti menetlusinfo | Piirkondlik otsing suunatakse kaardikihile; vastuvõetav jäätmeliik tuleb kontrollida käitlejalt |
| Kiirgusseire | Keskkonnaameti riiklik kiirgusseire | 15 automaatjaama, reaalaja doosikiirus ja varajane hoiatus | Üksiknäitu ei tõlgendata automaatselt kiirgusõnnetusena |
| Elektriauto elutsükkel | Euroopa Keskkonnaagentuur | Tootmise, kasutuse, elektrisegu, aku ja lõppkäitluse tervikmõju | Vastus eristab kasutusfaasi heidet ning tootmise suuremat algmõju |
| Mullaseire | [Keskkonnaportaal](https://keskkonnaportaal.ee/et/mullaseire-tulemuste-ulevaade) | Riikliku mullaseire viimased tulemused ning viide KESE detailandmetele | Täpne seireülevaade eelistatakse üldisele visualiseeringule või uudisele |
| Ajaloolised ilmaandmed | [Keskkonnaagentuur](https://www.ilmateenistus.ee/kliima/ajaloolised-ilmaandmed/) | Jaamapõhised tunniandmed, sh Tartu–Tõravere temperatuur ja sademed; failid uuenevad kord aastas | Aasta ja asukohaga päring suunatakse mõõteandmetesse, mitte kohanimega uudisesse |
| Sademete muutus | [Keskkonnaportaal](https://keskkonnaportaal.ee/et/sademete-summa-muutus) | Kolme 30-aastase normperioodi võrdlus, hooajaline muutus ja tulevikuprognoos | Kliimamuutuse sadememõju päring eristab mõõdetud muutust prognoosist |
| Ajalooline hüdroloogia | [Keskkonnaagentuur](https://www.ilmateenistus.ee/siseveed/ajaloolised-vaatlusandmed/) | Hüdromeetriajaamade veetaseme, vooluhulga ja veetemperatuuri ööpäevased CSV-aegread | Jõe, aasta ja näitajaga päring suunatakse jaamavalikusse |
| Tuuleparkide KMH | [Kliimaministeerium](https://kliimaministeerium.ee/uudised/uus-juhend-aitab-uhtlustada-tuuleparkide-keskkonnamojude-hindamist) | Müra, madalsagedusliku heli, vibratsiooni ja varjutamise ametlik hindamisjuhend | Juhend eelistatakse üksikprojekti menetlusele või üldisele KMH-uudisele |
| Kaevandamise mõjud | [Keskkonnaamet](https://keskkonnaamet.ee/kasiraamat-kohaliku-omavalitsuse-keskkonnaspetsialistile/loa-andmisest-keeldumine) | Avalik autentimiseta HTML-juhend nimetab joogivee muutused, müra ja tolmu, vibratsiooni ning transpordihäiringu; leevendus sõltub eelhinnangust/KMH-st ja konkreetsest loast | Ida-Virumaa kaevandamismõju päringu peamine juhend; ei asenda objektipõhist menetlusdokumenti |
| Ida-Viru põhjavesi | [Kliimaministeerium](https://kliimaministeerium.ee/merendus-veekeskkond/veekasutamine-ja-kaitse/pohjavesi) | Avalik autentimiseta seisundiülevaade seob põlevkivibasseini halva koguselise seisundi veekõrvaldusega ning kirjeldab ka jääkreostuse ja suletud kaevanduste mõju | Piirkonnaspetsiifiline vee-tõend; seisundiaasta ja konkreetne kogum tuleb vastuses säilitada |
| Kaevandatud maa korrastamine | [Keskkonnaamet](https://keskkonnaamet.ee/keskkonnakasutus-kiirgus/maapou/korrastamiskohustus) | Avalik autentimiseta juhend: maa korrastatakse Keskkonnaameti tingimuste ja heakskiidetud projekti järgi enne loa lõppu | Leevendusmeetme ametlik alus; ei tõenda, et konkreetne ala on juba korrastatud |
| KHG inventuur | [Kliimaministeerium](https://kliimaministeerium.ee/rohereform-kliima/kliimapoliitika/kasvuhoonegaaside-heitkogused) | Eesti iga-aastane kasvuhoonegaaside aegrida, sektorid ja inventuuriaruanded | Küsitud andmeaasta suunatakse püsilehele; artikli avaldamisaastat ei samastata andmeaastaga |
| Olmejäätmete ringlussevõtt | [Keskkonnaportaal](https://keskkonnaportaal.ee/et/olmejaatmete-ringlussevott) | Ringlussevõtu määr, EL võrdlus ja sihttasemed | Näitajapäring läheb mõõdikule, mitte juhuslikule investeeringu-uudisele |
| Kaitstaval alal ehitamine | [Keskkonnaamet](https://keskkonnaamet.ee/elusloodus-looduskaitse/tegevused-kaitstavatel-aladel/planeerimine-ja-ehitamine) | Eelnev nõusolek, looduskaitselised piirangud ja Natura hindamine | Tegevusjuhend eelistatakse üldisele kaitseala-uudisele |
| Põhjavee seisund | [Keskkonnaportaal](https://keskkonnaportaal.ee/teemad/vesi/pohjavesi/pohjavee-seisund) | Keemiline ja koguseline seisund, kaardilugu ning kogumipõhised aruanded | Maakonna-aasta päring suunatakse seisundimaterjalidele, mitte kohanimega kõrvalteemale |
| Mereala 2024 seisund | [Kliimaministeerium](https://kliimaministeerium.ee/keskkonnakasutus/merestrateegia) | Eesti merestrateegia, 2024 seisundihinnang, indikaatorid ja aruanded | Läänemere seisundipäring eelistab hinnangut üldisele mereuudisele |
| Suplusvee kvaliteet | [Terviseamet](https://www.terviseamet.ee/keskkonnatervis/vesi/suplusvesi) | Ametlik supluskohtade seire, proovide tulemused ja suplushooaja info | „Kust vaadata?” päring eelistab seireteenust juhuslikule rannauudisele |
| Tartu strateegiline müra | [Tartu linn](https://tartu.ee/et/uurimused/murakaart2022) | 2022. aasta strateegiline mürakaart ja tegevuskava lähtematerjal | Tartu mürakaardi päring ei lähe Tallinna kaardile ega üldisele mürauuringule |
| Reovee kohtkäitlus | [Keskkonnaamet](https://keskkonnaamet.ee/kasiraamat-kohaliku-omavalitsuse-keskkonnaspetsialistile/reovee-kohtkaitluse-ja-araveo-eeskiri) | Kogumismahuti, omapuhasti, äraveo ja kohaliku eeskirja ametlik juhis | Majapidamise tegevusjuhend eelistatakse üldisele veeseisundi lehele |
| Läänemere mereprügi | [Kliimaministeerium](https://kliimaministeerium.ee/merendus-veekeskkond/merekeskkonna-kaitse/laanemere-kaitse) | Läänemere kaitse, mereprügi ja rahvusvahelised meetmed | Konkreetne mereprügi allikas püsib üldise mereteema ja värske uudise ees |
| Ohtlikud jäätmed ja asbest | [Kliimaministeerium](https://www.kliimaministeerium.ee/elukeskkond-ringmajandus/ohtlikud-jaatmed) | Ohtlike jäätmete, sh asbesti, ohutu käitluse põhimõtted | Käitlusjuhis eelistatakse jäätmete üldkataloogile; vastuvõtukoht tuleb eraldi kontrollida |
| Paisud ja kalade läbipääs | [Kliimaministeerium](https://kliimaministeerium.ee/paisud-eestis) | Paisude mõju veekogule ning kalade liikumise ja paisutamise nõuded | Jõekalade/paisu päring eelistab otsest juhendit juhuslikule kalandusuudisele |
| Rohevõrgustiku planeerimine | [Keskkonnaagentuur](https://keskkonnaagentuur.ee/uudised/keskkonnaagentuuri-tellimusel-valminud-rohevorgustiku-planeerimisjuhend) | Planeerimisjuhend rohevõrgustiku sidususe käsitlemiseks | Planeerimisküsimus suunatakse juhendile, mitte üldisele elurikkuse kataloogile |
| Võõrliigid | [Keskkonnaamet](https://www.keskkonnaamet.ee/voorliigid) | Võõrliikide tuvastamine, teatamine ja ohjamise ametlik info | Tegevusjuhend eelistatakse liigiteemalisele uudisele |
| Organisatsiooni jalajälg | [Kliimaministeerium](https://www.kliimaministeerium.ee/rohereform-kliima/rohereform/organisatsioonide-jalajalg) | Organisatsiooni keskkonna- ja süsinikujalajälje hindamise juhised | Ainult jalajäljeintent aktiveerib lehe; üldine KHG-aasta päring jääb inventuuri juurde |
| Märgalade taastamine | [Keskkonnaagentuur](https://keskkonnaagentuur.ee/node/2632) | Märgalade taastamise eesmärgid ja ökosüsteemipõhine kontekst | Taastamispäring eelistab otsest projekti-/juhendiallikat üldisele kliimauudisele |
| Pestitsiidid põhjavees | [Keskkonnaagentuur](https://keskkonnaagentuur.ee/uudised/mida-naitavad-2024-aasta-keskkonnaseire-tulemused-meie-looduskeskkonna-seisundi-kohta) | 2024. aasta keskkonnaseire tulemused, sh põhjavee pestitsiidijäägid | Aasta ja näitajaga päring säilitab 2024 mõõteperioodi ega vali üldist põhjaveelehte |
| Päikesepaneelide lõppkäitlus | [Keskkonnaportaal](https://keskkonnaportaal.ee/et/teemad/taastuvenergia/mis-saab-paikesepaneelidest-ja-tuulikutest-parast-kasutuse-loppu) | Paneelide ja tuulikute kasutusjärgne käitlus ning ringlus | Elutsüklipäring eelistab otsest selgitust taastuvenergia ülduudisele |
| Ulukiasurkonnad 2025 | [Keskkonnaagentuur](https://keskkonnaagentuur.ee/uudised/keskkonnaagentuur-avaldas-varske-raporti-milles-antakse-ulevaade-ulukiasurkondade) | Värske ulukiasurkondade seisundi ja küttimissoovituste raport | Liigi arvukuse päring eelistab 2025 raportit juhuslikule metsa- või jahiartiklile |

## Teadlikult mitte automaatselt kasutatavad liidesed

- Riigi Teataja õigusallikas lisatakse vastuse koostamisse alles siis, kui päring säilitab redaktsiooni kehtivusaja, paragrahvi ja tervikteksti viite. Praegu ei tehta otsingutulemuse põhjal siduvat õiguslikku järeldust.
- PXWebi ja PostgRESTi suvalisi tabeleid ei anta otse LLM-ile. Iga adapter peab valideerima tabeli skeemi, filtrid, ühiku, perioodi ja maksimaalse ridade arvu.
- Ohuseire ja ilma reaalaja väärtusi ei kopeerita vana artikli väljavõttest. Kui tüübikindlat hetkeandmete adapterit ei ole, kuvatakse aus suunamisvastus.
- Qdrant ei ole päringu hot path'is. PostgreSQL-i ja ametliku live-otsingu hübriid koos deterministliku intent- ja relevantsusjärjestusega annab praegu kontrollitavama tulemuse kui räsivektor.

## Uue allika vastuvõtukriteeriumid

Uus allikas lubatakse vastuse koostamisse alles siis, kui on dokumenteeritud väljaandja, URL/endpoint, litsents või avaliku kasutuse alus, skeem, autentimine, mahu- ja kiiruspiirid, uuendussagedus, cache-poliitika, isikuandmete risk ning vähemalt üks positiivne ja üks negatiivne eval-juht. Allika tõrge peab andma oleku `unavailable`, mitte väite, et otsitavat nähtust ei ole.

Kolm kaevandamisallikat on avalikud ametiasutuste HTML-lehed, ei vaja autentimist ega sisalda päringupõhist isikuandmete töötlemist. Neile rakenduvad sama HTTPS-hostide allowlist, live-hüdratsiooni 2 MB ja korpusesünkrooni 4 MB vastusepiir, kontrollitud ümbersuunamine, päringuaeg ning 24 tunni korpusevärskendus nagu teistele ametlikele lehtedele. Positiivne eval lukustab kaks Ida-Virumaa sõnastust allikale `mining-impact-guidance`; negatiivsed kontrollid välistavad üldise menetlusloa kui konkreetse mõjufakti ning nõuavad objektipõhise järelduse puhul täpsustust.
