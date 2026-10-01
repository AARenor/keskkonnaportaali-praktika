# Otsingu personad

Versioon: 1.0.0

Kehtib alates: 01.10.2026

Omanik: Keskkonnaportaali praktika tootetiim

Personad kirjeldavad peamisi kasutusolukordi, mitte päris inimeste profiile. Neid kasutatakse päringute, vastuse stiili, dokumentatsiooni ja regressioonide kavandamisel. Versiooni muudetakse siis, kui sihtrühm, tema põhivajadus või vastuse leping muutub.

## Tavakasutaja

- **Eesmärk:** saada Eesti keskkonna kohta kiiresti arusaadav vastus ja avada vajadusel algallikas.
- **Tüüpilised küsimused:** „Põhjavesi andmed Eestis”, „Mis on LULUCF?”, „Kui palju on Eestis metsamaad?”.
- **Vajab:** otsest vastust, viidatud ametlikke allikaid, lihtsat eesti keelt ning selget aastat, ühikut ja piirkonda.
- **Risk:** sarnase nimega näitajad või eri aastate arvud võivad tunduda vastuolulised.
- **Vastuse ootus:** kõigepealt lühike vastus, selle sees nummerdatud lingid, seejärel lai relevantsusjärjestatud tulemuste loend.

## Metsaomanik

- **Eesmärk:** mõista mõistet, seiret või üldist tegevusjuhist ning jõuda õige registri või ametliku juhendini.
- **Tüüpilised küsimused:** kuuse-kooreüraski tunnused ja seire, metsateatis, puistu andmed, raiereeglid.
- **Vajab:** mõiste ja hetkeseisu eristamist, allika uuendamiskuupäeva ning selget märget, kui riiklik koond ei kirjelda tema kinnistut.
- **Risk:** üldine juhis ei tõenda konkreetse kinnistu õiguslikku olukorda ega tehtud raiet.
- **Vastuse ootus:** tegevusjuhis jääb tingimuslikuks ja suunab Metsaportaali, EELISesse või kehtivasse õigusallikasse, kui otsus sõltub asukohast.

## Keskkonnaspetsialist

- **Eesmärk:** leida kontrollitav näitaja, definitsioon, aegrida või metoodika ja võrrelda allikaid õigel alusel.
- **Tüüpilised küsimused:** miks metsanumbrid erinevad, metsamaa ja puistute pindala, kogu- ja netojuurdekasv, ETAK ja SMI.
- **Vajab:** allika, andmeaasta, definitsiooni, üldkogumi, ühiku, metoodika ja vea eristamist.
- **Risk:** üks värskem, kuid teise tähendusega näitaja võib otsesest allikast ekslikult ettepoole sattuda.
- **Vastuse ootus:** relevantsus on esmane; võrreldavad allikad järjestatakse metsanduse allikahierarhia järgi ning piirangud öeldakse vastuses välja.

## IT-haldur

- **Eesmärk:** hoida korje, allikakataloog, vastusevärav ja tootmisdeploy kontrollitavana.
- **Tüüpilised tööd:** ametlike URL-ide ja kuupäevade kontroll, iga-aastaste metsandusväljaannete uuendamine, regressioonid, deploy ja live-proovid.
- **Vajab:** failide ja kontrollkäskude kaarti, tõendipoliitikat, hooldusrütmi ning täpse tootmisversiooni tõendit.
- **Risk:** maandumisleht muutub ekslikult arvtõendiks, vana väljavõte jääb värskemast allikast ette või uus allikas nõrgestab privaatsus- ja geograafiapiire.
- **Vastuse ootus:** muudatus on valmis alles siis, kui regressioonid, eval'id, build, sõltumatu review, exact-SHA deploy ja live-käitumine on tõendatud.

## Ühine vastuse stiil

Kõigi personade jaoks kehtib sama tuumleping: **otsene vastus**, **viidatud ametlik tõend** ja **lihtne eesti keel**. Vastus peab nimetama asjakohase aasta, ühiku, piirkonna ja mõiste. Rakendus ei tohi puuduvat väärtust oletada ega vastust välja mõelda. Taristu-, mudeli- ja andmebaasinimesid avalikus vastuses ei näidata.

## Muudatuste ajalugu

| Versioon | Kuupäev | Muudatus |
|---|---|---|
| 1.0.0 | 01.10.2026 | Esmane versioon: tavakasutaja, metsaomanik, keskkonnaspetsialist ja IT-haldur; ühine tõendipõhine vastusestiil. |
