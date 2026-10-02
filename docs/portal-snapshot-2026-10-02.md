# Avalehe allikasnapshot 02.10.2026

Visuaalne ja sisuline lähteallikas: https://keskkonnaportaal.ee/et, brauserivaatlus 02.10.2026 kell 04:14 UTC. See on praktikaversiooni kuupäevastatud koopia, mitte lubadus reaalajas uudisvoost. Säilivad praktikaversiooni märge, mobiili esimese vaate otsing ja eraldi Terrapointi iframe.

## Pildid

Kontrollitud HTTPS-pildid laaditi portaali enda avalehe tegelikest taustapiltide URL-idest, robots.txt reegleid järgides, järjest ühe sekundilise vahega. Failid on kohalikud; uut pildi- ega komponenditeeki ei lisatud. Originaalautorite õigused ja portaalis märgitud päritolu säilivad. SHA-256 ja tegeliku MIME/mahu manifest on kontrolltõendis.

| Kohalik fail (`public/assets/`) | Portaali lähtefail (`https://keskkonnaportaal.ee`) |
|---|---|
| portal-hero-2026.jpg | `/sites/default/files/styles/kem_frontpage_banner/public/2026-09/tasha-0HTpqzdyUTQ-unsplash.jpg?h=452754b3&itok=P-BvZLmk` |
| portal-forest-statistics.jpg | `/sites/default/files/styles/kem_640x400/public/2025-05/pine-cone-4315472_1280.jpg?itok=QRmUmr9p` |
| portal-food-waste.jpg | `/sites/default/files/styles/kem_768_362/public/2025-04/food%20waste.jpg?itok=p-W-2X5Y` |
| portal-minerals.png | `/sites/default/files/styles/kem_768_362/public/2026-09/maavarad.png?itok=ObxdrF53` |
| portal-news-ecolabel.png | `/sites/default/files/styles/kem_news_list_image/public/2026-10/ELi%20%C3%B6kom%C3%A4rgis_koduleht%20%281%29.png?itok=147qy0yz` |
| portal-news-education.png | `/sites/default/files/styles/kem_news_list_image/public/2026-10/Kuvat%C3%B5mmis%202026-10-01%20134254.png?itok=vId31cGH` |
| portal-news-kasari.png | `/sites/default/files/styles/kem_news_list_image/public/2026-09/Kasari_0.png?itok=8Z8ANHkv` |
| portal-news-weather.jpg | `/sites/default/files/styles/kem_news_list_image/public/2026-09/ilmpluss_header.jpg?itok=L4lfptuo` |
| portal-ecolabel.png | `/sites/default/files/styles/kem_news_list_image/public/2026-09/O%CC%88koma%CC%88rgis%20vertikaalne.png?itok=KOVGjOw5` |

## Kontrollitud sisu

- Andmevärav „Metsastatistika” ja käbiga pilt asendavad aegunud kliimapoliitika värava.
- Päevakajalised: toidutarneahela 2024–2025 uuring (01.10.2026) ja hüvitusalade/maapõue kaardikihtide uudis. UI ei nimeta neid SMI- ega puidubilansinäitajateks.
- Neli uudist: ELi ökomärgis (01.10), keskkonnahariduse konverents (30.09), WMO sajandi jaamad (28.09), ILM+ radarite lühiennustus (25.09). Väljaandja on eraldi igal real, KIKi lugu ei omistata Keskkonnaagentuurile.
- Viis sündmust 8.–16. oktoobril: igal sündmusel on avalehel kontrollitud oma algallikalink, mitte kõikidel sama KMH-link. Kuu sündmus on ELi ökomärgise tegevused 01.–30.10.2026.
- Päise vana fikseeritud augusti temperatuur asendati lingi neutraalse tekstiga „Ilm täna”; ilmateenuse tegelikku hetketemperatuuri ei teeselda.

## Allikakorpuse täiendus

15 valitud ametlikku URL-i kontrolliti robots-, HTTPS-, sama ressursi, noindex-, keha- ja DB tagasilugemise nõuetega. 13 keha laaditi edukalt: 11 olemasoleva keha värskendus, ühe varem tekstita olemasoleva URL-i hüdreerimine ning üks päriselt uus URL, Keskkonnaagentuuri [juurepessu algartikkel](https://keskkonnaagentuur.ee/node/2072). Viimase 2725 märgiline keha on eristatud portaali samateemalisest uudise edasiühendusest. Lisandunud 2499 märgiline keha on [püünispuude langetamise ametlik juhis](https://keskkonnaagentuur.ee/uudised/kaes-kuuse-kooreuraski-torje-esimene-etapp-puunispuude-langetamine). Nende algartiklite avaldamis-/uuendamiskuupäeva pole parseri metadata kaudu tõendatud ja neid ei esitata uueima allika tunnusena.

Juurepessu portaaliuudisel puudus enda artiklikeha: kommentaarid/naaberlood ei saanud selle asemel tõendiks; URL ja vana ajalooline keha säilisid, kuid lugeja annab ainult marsruudiallikaks. Maapõue kaardiuudise esialgne puuduv keha oli seevastu parseri viga: kommentaarivormi ühine ümbris sisaldas ka artiklit. Parandatud parser eemaldab ainult vormid ja nupud, mitte ühist tekstiümbrist; 832 märgiline kaardiuudise oma tekst taastati ja kontrolliti. Naaberlood eemaldatakse ning pesastatud teksti loetakse ainult ühe korra. Vana saastunud keha jääb marsruudiallikaks kuni puhta värskenduseni.

Täiendus hõlmas üraski teemavaadet, 2026 seiret, metsaomaniku juhendit, metsaseiret, liikide ülevaadet, artikkel 17 aruannet, kahte toidujäätmete lehte ning SMI, aastaraamatu ja puidubilansi põhilehti. 02.10.2026 04:54 UTC DB-s oli 650 kontrollitud lehe uuendamiskuupäeva ja null aktiivset Statistikaameti kirjet. Need on metadata-/väljaandjapoliitika kontrollid, mitte garantii kõikide vastuste kohta.

### Korpuse kehade järelkontroll ja taastamine

Vana korpuse 8274 hüdreeritud metaandmekirjet ei tähenda 8274 kontrollitud artiklit. Uue lugeja audit eristas 6937 vana uudisekirjet, kus esimeses 150 märgis järgnes metaandmetele kommentaariplokk, ning sisuteksti potentsiaaliga lehti. 948 viimast laaditi ametlikelt alglehtedelt uuesti: kaks töövoogu, kummaski vähemalt 500 ms paus, robots/HTTPS/noindex/ressursiidentiteedi kontroll ja DB tagasilugemine.

Esimene jooks taastas 668 puhast keha; parseri ühise ümbrise parandusega kordusjooks kontrollis ülejäänud 280 lehte ja taastas veel 277. Kokku taastati 945 nende 948 valitud lehe oma teksti. Kolmel lehel ei olnud kontrollis piisavat oma keha ja need jäid marsruudiallikaks. Ülejäänud vanade kirjete faktitõendi õigust ei taastatud oletuse ega seotud uudiste järgi. 05:40 UTC tagasilugemine: 981 hüdreeritud keha sobis lugeja tõendipoliitikaga, 7293 ajaloolist keha jäi kõrvalteksti tõttu faktitõendist välja, kontrollitud uuendamiskuupäevi 650, aktiivseid Statistikaameti kirjeid null. See ei ole kogu korpuse ümberlaadimise ega kõikide küsimuste katvuse väide.
