# Keskkonnaportaali otsingu kasutusjuhend

Uuendatud: 02.10.2026

Täielik sirvitav juhend koos peatükilinkidega:
[praktika.arleserver.cfd/docs/kasutajale](https://praktika.arleserver.cfd/docs/kasutajale).
Alljärgnev on lühike repositooriumi kiirjuhend; avaliku juhendi sisu asub
failis [src/docs/content.jsx](../src/docs/content.jsx).

## Küsimuse esitamine

Kirjuta üks võimalikult konkreetne eestikeelne küsimus. Kui otsid arvu, lisa võimalusel näitaja, piirkond ja aasta, näiteks „Kui suur oli Eesti metsamaa pindala 2025. aastal?”. Otsing on praegu eestikeelne; vene- ja ingliskeelse sisupäringu asemel võib tulla eestikeelne palve küsimus eesti keeles kirjutada.

Ära sisesta otsingusse saladusi ega tundlikke isikuandmeid. Eraisiku nime ja kinnistu seost otsing ei koosta. Kinnistu avalike metsaandmete jaoks kasuta katastritunnust või ametlikku Metsaportaali.

Soovituste saamiseks saadetakse 2–80 märgi pikkune sisestatud tekst serverile
juba kirjutamise ajal. Otsinguaadress `/otsi` ei taasta küsimust jagatud lingist
ega pärast uuesti laadimist; küsimused püsivad ainult avatud lehe mälus.

## Kuidas vastust lugeda

1. Koondvastus tuleb enne tulemuste loendit.
2. Vastuses olev numberlink avab väidet kandva ametliku HTTPS-allika uuel vahelehel.
3. Tulemuse metaandmetes tähendab **Allikas:** sisu väljaandjat. Keskkonnaagentuuri koostatud materjal kuvatakse nimega „Keskkonnaagentuur”, mitte lühendiga.
4. **Andmed:** näitab eraldi andmeaastat ja vajadusel andmete täpset seisu. **Uuendatud:** näitab allikalehel avaldatud viimast muutmiskuupäeva; kui seda pole, kuvatakse **Avaldatud:**. Näiteks puidubilansi juures kuvatakse „Andmed: 2023 (seisuga 18.03.2026) · Uuendatud: 01.10.2026”, et lehe muutmise aega ei peetaks ekslikult andmeaastaks.
5. „Ametlik” ei tähenda automaatselt, et iga sama lehe lause tõendab küsitud arvu. Vastus kasutab ainult küsimust otseselt katvat lõiku või valideeritud andmerida.
6. Viitenumbril ja allikate kompaktsel legendil on sama värv; allika eristamiseks on alati ka number ja nimi. **Uusim leheuuendus** võrdleb üksnes teadaolevaid lehe muutmise kuupäevi, mitte andmeaastaid ega meie kontrollimise aega. Teadmata kuupäevaga allikale värskust juurde ei omistata.

„Ülevaade” üksi ei ole teemaväline päring: otsing palub valida keskkonnateema. „Metsa ülevaade” või „Põhjavesi andmed Eestis” annavad täpsema lähtekoha.

## Filtrid

Tulemusi saab piirata **allika**, **sisutüübi** ja **aasta** järgi ning muuta **järjestust**. Filtri muutmine teeb uue tõendiotsingu ja koostab vastuse uuesti. Relevantsusjärjestus eelistab küsimust otseselt katvat allikat; värskus täpsustab võrreldavaid tulemusi, mitte ei tõsta kõrvalteemat ettepoole.

Aastafilter tähendab allika **avaldamisaastat**, mitte andmeaastat ega lehe viimast uuendamist. Näiteks 2025. aasta põhjavee aruanne on avaldatud 2026. aastal. Kui küsid konkreetse aasta andmeid, kirjuta aasta küsimusse; ainult aastafiltri muutmine ei muuda aruande mõõtmisperioodi.

## Miks kaks ametlikku metsanumbrit võivad erineda?

Enne arvude võrdlemist kontrolli:

- kas mõlemad kirjeldavad sama näitajat, näiteks metsamaad või puistute pindala;
- kas andmeaasta ja allika uuendamisaeg on samad;
- kas üldkogum on kogu Eesti, RMK hallatav maa või registrisse kantud eraldised;
- kas kasutati SMI valikuuringut, ETAK-i ruumiandmeid või Metsaregistri inventeerimisandmeid;
- kas arvuga kaasneb statistiline viga ja kas definitsioon muutus.

SMI, metsaaastaraamat, puidubilanss, Keskkonnaportaal ja teised ametlikud allikad täidavad eri ülesandeid. Erinevus ei tähenda iseenesest, et üks arv on vale.

Näiteks metsamaa tagavara sisaldab teistsugust üldkogumit kui puistute tagavara; puidubilansi kogumaht sisaldab lisaks kohalikule puidule ka importi. Mõistete selgitused ja aastaraamatu terminoloogia on [allikaregistris](ALLIKAD.md#metsanduse-mõisted-ja-seosed). Statistikaamet ei ole praegu vastuste allikavalikus; puuduva esmase tõendi asemel ei kuvata kontrollimata asendusarvu.

## Diagrammid ja jätkuküsimused

Diagramm kuvatakse ainult siis, kui server sai sama vastuse jaoks valideeritud ametliku arvurea. Diagrammi ei tuletata vabast tekstist. Vastuse all olev jätkuküsimus käivitab uue otsingu; varasem vastus ei muutu uue väite tõendiks.

## Kui täpset tõendit ei leitud

Kui sobivad ametlikud tulemused on olemas, kuid nende nähtavad tõendilõigud ei kata küsimust piisavalt täpselt, ütleb otsing seda eraldi ning jätab tulemused avamiseks alles. Täpsusta siis objekti, näitajat, piirkonda või aastat. Teade „täpset ja piisavalt asjakohast ametlikku tõendit ei leitud” kuvatakse ainult siis, kui ka sobivat ametlikku tulemust ei leitud. Teenuse tõrke korral ei asenda rakendus puuduvat tõendit vana arvu ega üldteadmisega.
