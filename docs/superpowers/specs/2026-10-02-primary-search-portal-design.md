# Esmased metsallikad, teematuvastus ja portaali ajakohastamine

## Eesmärk ja piirid

Kasutaja soovib ametlikele algallikatele lähedasi vastuseid, toimivaid lühikesi märksõnu ning Keskkonnaportaali praeguse avalehe pilte ja sisu. Metsastatistika põhiallikad on SMI, puidubilanss ja aastaraamat „Mets“. Õigus-, seire- ja kahjuriküsimustes jääb esimeseks küsimusele vastav ametlik juhend või seire, mitte kõrvalteemaline statistika. Statistikaamet jääb tulemuste, viidete ja graafikute hulgast välja.

## Valitud lahendus

Kolm võimalikku teed: uus semantiline otsingukiht (liiga suur, tõendivalikut raskem kontrollida); üksikute keeldumiste erandid (jätavad retrieval'i katkise subjekti alles); olemasoleva ühise juure- ja teemapõhise marsruutimise parandamine (valitud). Säilitame konkreetse subjekti, käändevormid ja liitsõnad ning kasutame sama sõnastikku päringu ja dokumendi lugemisel. Ei muuda privaatsus-, keele-, piirkonna- ega tõendikaitseid. Teemapõhised olemasolevad filtrid jäävad nähtavaks; uut paralleelset tulemusehulka ei teki.

## Allikad ja vastused

Olemasolev metsallikate hierarhia jääb asjakohasust täpsustama. Täpsed SMI, aastaraamatu ja puidubilansi märksõnad saavad otsetee vastavatele nähtavatele allikatele; väärtusi ei kopeerita teisest näitajast. AI säilitab algallika mõisted, väidete tähenduse, ühikud, aastad ja ebakindluse ning kasutab algallikalähedast neutraalset sõnastust. Kõik faktid tulevad sama filtreeritud tulemusehulga tõenditest. Võrgurikke korral jääb olemasolev kontrollitud väljavõte/aus keeldumine.

## UI

02.10.2026 brauserivaatlus: sinine päis (#003b86), sinine naviriba (#0073b8), Roboto, valge sisu ja õrnsinised paneelid; uus okaspuuoksaga hero, metsastatistika andmevärav, toidujäätmete ja maapõue kaardiuudised, oktoobri sündmused. Uuendame olemasolevate komponentide andmed ja pildid, mitte ei ehita uut komponentide süsteemi. Pildid jäävad lokaalseks kontrollitud koopiaks koos lähte-URL-ide dokumentatsiooniga. Praktikaversiooni märge säilib, otsing on mobiilis esimeses vaates enne andmeväravaid. Terrapoint jääb eraldi iframe'i, ei autofookusta hosti.

## Kontroll

RED/GREEN regressioonid üraski vormidele/seirele/tõrjele, SMI-le, aastaraamatule ja muudele uuritud subjektilünkadele; negatiivsed võõrkeele, tundmatu sõna, privaatandmete, piirkonna ja vale allika juhud. Ametlike lehtede robots/piiratud laadimine ja DB read-back enne/pärast, eristades uusi URL-e uuest liigitusest. Kogu npm test, build, Sites ja sõltumatu diffi enesekontroll. Lokaalne ning tootmise desktop/mobiil, autocomplete, pildid, viited, graafikud, iframe; exact-SHA Coolify finished + build-fingerprint + järjestatud live-auditid.

## Rakendusplaan

1. Reprodutseeri scope/routing/ranking ja salvesta ametliku avalehe tõend ning märksõnade maatriks.
2. Kirjuta ebaõnnestuvad regressioonid, paranda ühised juured ja olemasolevad intents; allikad ja LLM-sõnastus.
3. Täienda uuritud ametlikku kataloogi/DB-d piiratud sünkrooniga; dokumenteeri kuupäevad ja katvuse piirid.
4. Uuenda olemasolevad avalehe pildid/sisu ja vajalikud stiilid; kontrolli brauseris.
5. Review, täielikud kontrollid, ainult kavandatud failide commit/push, exact-SHA tootmise tõend ja sulgemine.
