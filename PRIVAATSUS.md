# Otsingu privaatsuspiir

Keskkonnaportaali praktikaprojekt ei ole Keskkonnaportaali ametlik tootmiskeskkond. Otsing on mõeldud avalike keskkonnaallikate leidmise ja allikapõhise vastuse demonstratsiooniks. Otsingusse ei tohi sisestada tundlikke isikuandmeid.

## Mis liigub kuhu

- Brauser saadab otsingu teksti sama päritolu serverile JSON POST-kehas. Tekst ei lähe URL-i, lehe pealkirja, cookie'sse, `localStorage`'isse ega `sessionStorage`'isse.
- Server saadab portaaliotsinguks vajalikud sõnad ametlikele otsinguteenustele. Terrapointi iframe ei saa üldotsingu päringut.
- Kui tõendikvaliteet on piisav, saab OpenCode Go Luna otsingu toorteksti, kuni kaheksa juba järjestatud avaliku allika piiratud väljavõtted ja väljundskeemi. Jätkuküsimuse korral lisandub kuni 520 märki varasemate küsimuste konteksti.
- Luna ei saa kasutaja IP-aadressi, brauseri küpsiseid, PostgreSQL-i sisu, kogu otsingukorpust, Terrapointi andmeid, shelli ega veebitööriistu.
- Praktikaportaali PostgreSQL-i otsingulogis on ainult serverisaladusega võtmega HMAC-SHA-256 sõrmejälg, kestus ja kasutatud dokumentide ID-d. Sõrmejälge ei saa ilma serverisaladuseta võimalike päringute sõnastiku abil tagasi arvutada. Vastusevahemälust eemaldatakse `query` väli; varasema lihtsa räsi read kustutatakse skeemimigratsiooniga. Aegunud vahemäluread eemaldatakse käivitumisel ja iga 60 sekundi järel ning otsingukirjed kustutatakse 30 päeva järel.

OpenCode'i [mudelipõhine privaatsustabel](https://opencode.ai/docs/go/#privacy) märgib Luna sisendi mudelitreeningus mittekasutatavaks, kuid väärkasutuse jälgimise logid võivad säilida kuni 30 päeva. Teenusepakkuja tingimused võivad muutuda ning need tuleb enne ametlikku kasutuselevõttu uuesti üle kontrollida.

## Õiguslik staatus

See dokument kirjeldab praktikaprojekti tehnilist andmevoogu, mitte ametliku teenuse lõplikku privaatsusteadet ega õiguslikku alust. Enne ametlikku kasutuselevõttu peab vastutav töötleja kinnitama õigusliku aluse, säilitustähtajad, kontaktandmed ja teenusepakkuja lepingu.
