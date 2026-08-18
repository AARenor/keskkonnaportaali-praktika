# Ametlike allikate ja API-de register

Uuendatud: 18.08.2026

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

Üldotsingu sünteesi sõnastab OpenCode Go `gpt-5.6-luna` Responses API kaudu. Luna saab ainult nähtava filtreeritud tulemusehulga ametliku tõendialamhulga ja range JSON Schema ning selle väljund läbib viite-, arvu-, ühiku-, väitekatvuse ja polaarsuse kontrolli. Tõrke korral säilib tulemuste loend ja kuvatakse aus fallback; mudelil puudub ligipääs andmebaasile, veebile ja tööriistadele.

## Metsastatistika avaldamisseis

18.08.2026 kontrolli seisuga on viimane päriselt avaldatud terviklik aastakäik **SMI 2024**. Keskkonnaagentuuri 12.08.2026 artikkel [„Kui palju ja millist metsa Eestis on?”](https://keskkonnaagentuur.ee/uudised/blogis-kui-palju-ja-millist-metsa-eestis) teatab, et SMI 2025 tulemused avaldatakse järgmisel nädalal; rakendus ei nimeta neid enne avaldamist olemasolevaks ega tuleta puuduvaid arve. Otsing võib kasutada 2026. aasta artiklit värske tõlgenduse ja 30.07.2025 SMI-tulemuste lehte viimase avaldatud arvulise/vanusjaotuse tõendina. Pärast SMI 2025 tegelikku avaldamist jõuab uus URL live-otsingu kaudu kandidaadihulka ega vaja eelkirjutatud vastuse vahetamist.

## Regressiooni- ja võrdlusmaterjal

Versioonitud metsakorpus sisaldab 16 algallikat ja 21 vastusedokumenti ning selle 30 vastatava päringu külmutatud eval jääb kvaliteedi võrdlusaluseks. See ei ole enam primaarse `/api/search` päringutee allikas: uus vastus peab tulema sama hetke filtreeritud ja järjestatud tulemustest, et vana SMI-aasta või eelkirjutatud väide ei saaks värskemast avaldatud allikast mööda minna.

## Kontrollitud kataloogi- ja suunamisallikad

Need 43 kohalikus kataloogis olevat kirjet aitavad valida õige ametliku teenuse ja on nõrga võrguolukorra korral kasutajale suunavad allikad. Need ei muutu automaatselt konkreetse arvu või õigusliku järelduse tõendiks. 18.08.2026 automaatne lingikontroll sai kõigilt 43 siht-URL-ilt eduka vastuse või ümbersuunamise.

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

## Teadlikult mitte automaatselt kasutatavad liidesed

- Riigi Teataja õigusallikas lisatakse vastuse koostamisse alles siis, kui päring säilitab redaktsiooni kehtivusaja, paragrahvi ja tervikteksti viite. Praegu ei tehta otsingutulemuse põhjal siduvat õiguslikku järeldust.
- PXWebi ja PostgRESTi suvalisi tabeleid ei anta otse LLM-ile. Iga adapter peab valideerima tabeli skeemi, filtrid, ühiku, perioodi ja maksimaalse ridade arvu.
- Ohuseire ja ilma reaalaja väärtusi ei kopeerita vana artikli väljavõttest. Kui tüübikindlat hetkeandmete adapterit ei ole, kuvatakse aus suunamisvastus.
- Qdrant ei ole päringu hot path'is. PostgreSQL-i ja ametliku live-otsingu hübriid koos deterministliku intent- ja relevantsusjärjestusega annab praegu kontrollitavama tulemuse kui räsivektor.

## Uue allika vastuvõtukriteeriumid

Uus allikas lubatakse vastuse koostamisse alles siis, kui on dokumenteeritud väljaandja, URL/endpoint, litsents või avaliku kasutuse alus, skeem, autentimine, mahu- ja kiiruspiirid, uuendussagedus, cache-poliitika, isikuandmete risk ning vähemalt üks positiivne ja üks negatiivne eval-juht. Allika tõrge peab andma oleku `unavailable`, mitte väite, et otsitavat nähtust ei ole.

Kolm kaevandamisallikat on avalikud ametiasutuste HTML-lehed, ei vaja autentimist ega sisalda päringupõhist isikuandmete töötlemist. Neile rakenduvad sama HTTPS-hostide allowlist, live-hüdratsiooni 2 MB ja korpusesünkrooni 4 MB vastusepiir, kontrollitud ümbersuunamine, päringuaeg ning 24 tunni korpusevärskendus nagu teistele ametlikele lehtedele. Positiivne eval lukustab kaks Ida-Virumaa sõnastust allikale `mining-impact-guidance`; negatiivsed kontrollid välistavad üldise menetlusloa kui konkreetse mõjufakti ning nõuavad objektipõhise järelduse puhul täpsustust.
