# Ametlike allikate ja API-de register

Uuendatud: 17.08.2026

See register kirjeldab, millised allikad on otsingu päringuteel aktiivsed, millised on kasutajale suunavad kataloogiallikad ning milliseid teenuseid ei kasutata enne eraldi valideeritud adapterit. Ükski allikas ei anna mudelile õigust kasutada üldteadmisi: vastus peab jääma tagastatud tõendite piiresse.

## Aktiivsed päringutee allikad

| Allikas | Väljaandja | Ligipääs | Kasutus ja piirang | Puhver | Eval-kate |
|---|---|---|---|---|---|
| Versioonitud metsakorpus | Keskkonnaagentuuri, Keskkonnaportaali, Statistikaameti jt ametlikud väljaanded | Kohalik JSON-snapshot, 13 algallikat ja 21 vastusedokumenti | Ainult läbi vaadatud metsavastused; iga number säilitab aasta, ühiku, definitsiooni ja piirangu | Revisjonipõhine PostgreSQL | 30/30 külmutatud vastatavat päringut, abstention ja injection-kontrollid |
| Keskkonnaportaali otsing | Keskkonnaagentuur | `https://keskkonnaportaal.ee/et/search?search_api_fulltext=...` | Dokumenteerimata HTML-discovery. Tulemuste HTML-i ei renderdata; server eraldab ainult pealkirja, puhta teksti, URL-i ja metaandmed | 5 min, stale-if-error kuni 24 h | Keskkonnateema positiivsed juhud; teemaväline ja null-vastete negatiivsed juhud |
| Valitsusportaali ühine otsing | Keskkonnaamet, Keskkonnaagentuur, Kliimaministeerium | `https://search.service.eu-live.vportal.ee/v1/search/{index}`; indeksid `keskkonnaamet`, `keskkonnaagentuur`, `kliimamin` | Ametlike veebide täistekstiotsing. Päring kasutab `sort_by=score`, eesti keelt ja kuni viit vastet saidi kohta. Sisend on tõend, mitte mudelijuhis. Teenus jättis kontrolli ajal TLS-i vahesertifikaadi saatmata; rakendus lisab Let’s Encrypti ametliku avaliku YR1/YR2 ahela, kuid ei lülita sertifikaadikontrolli välja. Coolify IPv4-only võrgus sunnitakse selle hosti ühendus IPv4-le, et Node ei jääks töötut IPv6 ühendust ootama | 5 min, stale-if-error kuni 24 h | Rehvide põletamine, Tallinna õhk, load, vesi ja negatiivsed teemavälised juhud |
| Katastri WFS | Maa- ja Ruumiamet | `kataster:ky_kehtiv` GeoServer WFS | Ainult kanonilise katastritunnuse korral. Väljavõte on informatiivne ja mitteametlik; `not_found` ja `unavailable` on eraldi olekud | 10 min; tõrke korral 30 s | Leitud, ei leitud, vigane vastus ja timeout |
| Metsaregistri WFS | Keskkonnaagentuur | `metsaregister:eraldis` GeoServer WFS | Sama katastritunnuse avalikud eraldised. Vaste puudumine ei tõenda metsa puudumist | 10 min; tõrke korral 30 s | Leitud, ei leitud, osaline tõrge ja timeout |

Kõigil võrguallikatel on HTTPS-hostide allowlist, päringu ajapiir, vastusemahu piir ja kontrollitud redirect. Väliskutsed tehakse paralleelselt ning kogu kasutajapäring peab lõppema hiljemalt 15 sekundiga.

## Kontrollitud kataloogi- ja suunamisallikad

Need 30 kohalikus kataloogis olevat kirjet aitavad valida õige ametliku teenuse ja on nõrga võrguolukorra korral kasutajale suunavad allikad. Need ei muutu automaatselt konkreetse arvu või õigusliku järelduse tõendiks.

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

## Teadlikult mitte automaatselt kasutatavad liidesed

- Riigi Teataja õigusallikas lisatakse vastuse koostamisse alles siis, kui päring säilitab redaktsiooni kehtivusaja, paragrahvi ja tervikteksti viite. Praegu ei tehta otsingutulemuse põhjal siduvat õiguslikku järeldust.
- PXWebi ja PostgRESTi suvalisi tabeleid ei anta otse LLM-ile. Iga adapter peab valideerima tabeli skeemi, filtrid, ühiku, perioodi ja maksimaalse ridade arvu.
- Ohuseire ja ilma reaalaja väärtusi ei kopeerita vana artikli väljavõttest. Kui tüübikindlat hetkeandmete adapterit ei ole, kuvatakse aus suunamisvastus.
- Qdrant ei ole päringu hot path'is. Praegune väike ametlik korpus ja deterministlik intent-routing annavad evalides kontrollitavama tulemuse kui räsivektor.

## Uue allika vastuvõtukriteeriumid

Uus allikas lubatakse vastuse koostamisse alles siis, kui on dokumenteeritud väljaandja, URL/endpoint, litsents või avaliku kasutuse alus, skeem, autentimine, mahu- ja kiiruspiirid, uuendussagedus, cache-poliitika, isikuandmete risk ning vähemalt üks positiivne ja üks negatiivne eval-juht. Allika tõrge peab andma oleku `unavailable`, mitte väite, et otsitavat nähtust ei ole.
