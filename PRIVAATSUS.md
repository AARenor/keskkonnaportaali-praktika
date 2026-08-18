# Otsingu privaatsuspiir

Keskkonnaportaali praktikaprojekt ei ole Keskkonnaportaali ametlik tootmiskeskkond. Otsing on mõeldud avalike keskkonnaallikate leidmise ja allikapõhise vastuse demonstratsiooniks. Otsingusse ei tohi sisestada tundlikke isikuandmeid.

Kasutajaliides hoiab otsingu- ja jätkuküsimuse vormid võimalikult kompaktsed. Tehnilise andmevoo ja teenusepakkuja tingimuste kirjeldus asub lehe jaluses jaotises „Otsingu ja AI-vastuse privaatsus”.

## Mis liigub kuhu

- Kui otsinguväljale on kirjutatud vähemalt kaks ja kõige rohkem 80 märki, saadab brauser 180 ms viite järel teksti sama päritolu serverile JSON POST-kehas ning server küsib selle tekstiga Keskkonnaportaalilt soovitusi. See toimub enne nupu „Küsi” vajutamist; Lunale sel ajal päringut ei saadeta.
- Otsingu või jätkuküsimuse saatmisel liigub tekst sama päritolu serverile JSON POST-kehas. Tekst ei lähe URL-i, lehe pealkirja, cookie'sse, `localStorage`'isse ega `sessionStorage`'isse. Server saadab portaaliotsinguks vajalikud sõnad ametlikele otsinguteenustele. Terrapointi iframe ei saa üldotsingu päringut.
- Kui tõendikvaliteet on piisav, saab OpenCode Go Luna otsingu toorteksti, kuni kümne juba järjestatud avaliku allika päringupõhiselt valitud väljavõtted (kokku kuni 36 000 märki) ja väljundskeemi. Jätkuküsimuse korral lisandub kuni 1 400 märki varasemate küsimuste konteksti. Kontekst aitab mõista jätkuküsimust, kuid seda ei käsitata faktitõendina.
- Luna ei saa kasutaja IP-aadressi, brauseri küpsiseid, PostgreSQL-i sisu, kogu otsingukorpust, Terrapointi andmeid, shelli ega veebitööriistu.
- Praktikaportaali PostgreSQL-i otsingulogis on ainult serverisaladusega võtmega HMAC-SHA-256 sõrmejälg, kestus ja kasutatud dokumentide ID-d. Sõrmejälge ei saa ilma serverisaladuseta võimalike päringute sõnastiku abil tagasi arvutada. Vastusevahemälust eemaldatakse `query` väli; varasema lihtsa räsi read kustutatakse skeemimigratsiooniga. Aegunud vahemäluread eemaldatakse käivitumisel ja iga 60 sekundi järel ning otsingukirjed kustutatakse 30 päeva järel.
- Brauser hoiab kuni 50 otsingu teksti ainult avatud lehe protsessimälus, et sama vahelehe tagasi-edasi navigeerimine töötaks; kuni neli jätkuküsimust püsivad sama vastuse Reacti olekus. Neid ei kirjutata püsisalvestusse ning need kaovad lehe uuesti laadimisel või vahelehe sulgemisel; jätkuküsimused kustuvad ka uue juurvastuse avamisel.

OpenCode'i [mudelipõhine privaatsustabel](https://opencode.ai/docs/go/#privacy) märgib Luna sisendi mudelitreeningus mittekasutatavaks, kuid väärkasutuse jälgimise logid võivad säilida kuni 30 päeva. Mudelipäring kasutab seadet `store: false`, mis piirab Responses API oleku talletamist, kuid ei lülita välja teenusepakkuja väärkasutuse jälgimise logi. See logi võib sisaldada teenusele saadetud küsimust ja vastust. Teenusepakkuja tingimused võivad muutuda ning need tuleb enne ametlikku kasutuselevõttu uuesti üle kontrollida.

## Õiguslik staatus

See dokument kirjeldab praktikaprojekti tehnilist andmevoogu, mitte ametliku teenuse lõplikku privaatsusteadet ega õiguslikku alust. Enne ametlikku kasutuselevõttu peab vastutav töötleja kinnitama õigusliku aluse, säilitustähtajad, kontaktandmed ja teenusepakkuja lepingu.
