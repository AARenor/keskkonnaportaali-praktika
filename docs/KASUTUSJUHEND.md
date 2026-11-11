# Keskkonnaportaali otsingu kasutusjuhend

Uuendatud: 11.11.2026

Täielik sirvitav juhend koos peatükilinkidega:
[praktika.arle.top/docs/kasutajale](https://praktika.arle.top/docs/kasutajale).
Alljärgnev on lühike repositooriumi kiirjuhend; avaliku juhendi sisu asub
failis [src/docs/content.jsx](../src/docs/content.jsx).

## Küsimuse esitamine

Kirjuta üks võimalikult konkreetne eestikeelne küsimus. Kui otsid arvu, lisa võimalusel näitaja, piirkond ja aasta, näiteks „Kui suur oli Eesti metsamaa pindala 2025. aastal?”. Otsing on praegu eestikeelne; vene- ja ingliskeelse sisupäringu asemel võib tulla eestikeelne palve küsimus eesti keeles kirjutada.

Ära sisesta otsingusse saladusi ega tundlikke isikuandmeid. Eraisiku nime ja kinnistu seost otsing ei koosta. Kinnistu avalike metsaandmete jaoks kasuta katastritunnust või ametlikku Metsaportaali.

Soovituste saamiseks saadetakse 2–80 märgi pikkune sisestatud tekst serverile
juba kirjutamise ajal. Otsinguaadress `/otsi` ei taasta küsimust jagatud lingist
ega pärast uuesti laadimist; küsimused püsivad ainult avatud lehe mälus.

## Kuidas vastust lugeda

1. Koondvastus tuleb enne tulemuste loendit. Pikk vastus ei sõltu ühest lahtisest ühendusest: leht küsib serverilt töö seisu lühikeste päringutega, seega tulemused võivad ilmuda enne vastust. Lehe sulgemine, uuendamine või uue otsingu alustamine katkestab poolelioleva töö ja vastust tuleb uuesti küsida.
2. Vastuses olev numberlink avab väidet kandva ametliku HTTPS-allika uuel vahelehel.
3. Tulemuse metaandmetes tähendab **Allikas:** sisu väljaandjat. Keskkonnaagentuuri koostatud materjal kuvatakse nimega „Keskkonnaagentuur”, mitte lühendiga.
4. **Andmed:** näitab eraldi andmeaastat ja vajadusel andmete täpset seisu. **Uuendatud:** näitab allikalehel avaldatud viimast muutmiskuupäeva; kui seda pole, kuvatakse **Avaldatud:**. Reaalaja seireallikate puhul küljes olev kellaaeg on vaatlusaeg, mitte lehe avaldamisaeg: seda näidatakse kui **Andmete seis: pp.kk.aaaa tt:mm UTC**. Näiteks puidubilansi juures kuvatakse „Andmed: 2023 (seisuga 18.03.2026) · Uuendatud: 01.10.2026”, et lehe muutmise aega ei peetaks ekslikult andmeaastaks.
5. „Ametlik” ei tähenda automaatselt, et iga sama lehe lause tõendab küsitud arvu. Vastus kasutab ainult küsimust otseselt katvat lõiku või valideeritud andmerida.
6. Viitenumbril ja allikate kompaktsel legendil on sama värv; allika eristamiseks on alati ka number ja nimi. **Legendi iga rida on link:** number, väljaandja ja kuupäev avavad algallika uuel vahelehel — ka siis, kui vastus jättis intro ossa ilma viiteta (näiteks teate „nähtavad tõendilõigud ei kata küsimust” puhul). Numberlingi hüpikvihje on ainult lühike eelvaade. **Uusim leheuuendus** võrdleb üksnes teadaolevaid lehe muutmise kuupäevi, mitte andmeaastaid ega meie kontrollimise aega. Teadmata kuupäevaga allikale värskust juurde ei omistata.
7. Avatud kvalitatiivsele küsimusele (näiteks „miks…”, „kuidas…”, „mida teeb…”) võib vastuse anda üks asjakohane ametlik lõik, kui see katab küsimuse põhisubjekti ning allikas mainib ka nimetatud kohta või osalejat. Arvu, aastat, konkreetset kohta või tegevust küsiv vastus nõuab endiselt täpset tõendit. Kui mudel ei ole kättesaadav, kuvatakse sama tõendi viidatud väljavõte, mitte üldteadmine.

„Ülevaade” üksi ei ole teemaväline päring: otsing palub valida keskkonnateema. „Metsa ülevaade” või „Põhjavesi andmed Eestis” annavad täpsema lähtekoha.

AI koondvastus on praegu piiratud Eesti metsateemadega. Muudel keskkonnateemadel näed allikate loendit, pealkirju ja viiteid, kuid mitte AI kokkuvõtet; see on toote otsus, mitte tõrge. Vastuses kasutatud allikaväljavõtted on lühikesed tsitaadid, mis viivad algallika juurde. Kui avaldaja on lühiväljavõtte keelanud või piiranud, näed linki, pealkirja ja kuupäeva, kuid mitte pikka tekstilõiku. Avaldaja luba robotitele ei ole litsents ega anna õigust sisu taaskasutada.

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

## Raiemaht ja juurdekasv ei ole üks arv

Juurdekasv on puistule aastas lisanduv tüvepuidu kogus. Netojuurdekasv saadakse, kui sellest arvatakse maha looduslik suremus. Raiemahuga tuleb võrrelda sama ulatuse ja sama perioodi elusate puude raiet, sest raiemahu hulk sisaldab ka surnud puid.

Keskkonnaagentuuri ülevaate järgi oli viimase kümnendi keskmisena elusate puude raiemaht majandatavates metsades netojuurdekasvust kõrgem, 20 aasta vaates aga sellest madalam. Ühe aasta ega ühe näitaja põhjal ei saa metsamajanduse kestlikkuse kohta lõplikku järeldust teha: [netojuurdekasvu ja raie tasakaal](https://keskkonnaagentuur.ee/node/2720).

SMI 2025 töövihik ei avalda kogu riigi netojuurdekasvu kogumahtu. Töövihik annab kogujuurdekasvu kogu riigile ja raiemahu aastate kaupa kuni viimase mõõdetud aastani. Keskkonnaagentuuri [18.08.2026 ülevaate](https://keskkonnaagentuur.ee/uudised/smi-metsatagavara-stabiilne) järgi on 2025. aasta raiemahu eksperthinnang 11 miljonit m³, mitte mõõdetud tulemus. Kui vastus neid arve kõrvutab, nimetab ta iga arvu juures väljaande ja aasta ega lahuta eri avaldajate ridu üksteisest.

## Diagrammid ja jätkuküsimused

Diagramm kuvatakse ainult siis, kui server sai sama vastuse jaoks valideeritud ametliku arvurea. Diagrammi ei tuletata vabast tekstist. Diagramm järgib avaldatud arve: ühik trükitakse joonisele, tulp algab nulljoonest, ja kui joondiagrammi telg algab andmetest kõrgemal, ütleb allkiri seda sõnadega („Vertikaaltelg algab väärtusest …, mitte nullist”). Avaldatud kümnendkohad säilivad, seega 6,55 ei muutu 6,6-ks. Puuduv aasta ei tähenda nulli. Vastuse all olev jätkuküsimus käivitab uue otsingu; varasem vastus ei muutu uue väite tõendiks.

Jätkuküsimus, mis ise teema sõnu ei sisalda (näiteks „selgita hindamise etappe”, „millal on vajalik KIH” või „kuidas see on muutunud”), pärib algse küsimuse teema: otsing kombineerib mõlemad ja otsib tõendid uuesti. Kui jätkuküsimus toob kaasa teise valdkonna sõna (näiteks „aktsiaoptsioon” või „salasõna”), jääb teemavälise sisu kaitse alles ja päringu palutakse täpsustada.

## Vestlus eraldi aknas

Avalehel ja otsinguvaates `/otsi` on nupp **„Ava vestlus”**. See avab vestlusakna, mis kasutab sama allikapõhist otsingut ega muuda tavalist otsingut: põhiotsing jääb lehele alles ja töötab vestlusest sõltumata.

1. Vajuta „Ava vestlus” ja kirjuta küsimus samamoodi nagu põhiotsingusse.
2. Vastus tuleb samast otsingust, seega kehtivad samad nummerdatud viited, diagrammid, keeldumised ja täpsustuspalved.
3. Iga järgmine küsimus teeb uue tõendiotsingu. Varasemad küsimused aitavad teemat täpsustada, kuid varasem vastus ei muutu uue väite tõendiks.

Ühes vestluses saab küsida kuni neli jätkuküsimust. Kui piir saab täis, pakub aken uue vestluse alustamist; „Uus vestlus” tühjendab sõnumid ja varasema konteksti.

Vestlusaken pakub ainult eelnevalt üle vaadatud metsaküsimusi, mis seostuvad praeguse küsimuse ja selle vestlusega; juba küsitud küsimust uuesti ei pakuta ja sobimatu küsimuse asemel ei pakuta midagi. Valik tehakse brauseris ega tee uut võrgupäringut, ei kutsu mudelit ega salvesta profiili ega ajalugu.

Vestlusakna sulgemine ja uuesti avamine hoiab selle lehe sõnumid alles. Lehe uuendamisel kaovad need brauseri mälust ning lingi jagamine vestlust ei taasta. Sõnumeid ei salvestata selles brauseris püsivalt.

Kui vastust ei õnnestu koostada, kuvatakse juba leitud otsingutulemused esmalt ja selgitus nende järel. Kui kuvatakse allika enda väljavõte, jäävad selle viide ja märkus alles. Küsimust saab uuesti proovida; puuduvaid tulemusi ega vastust ei mõelda juurde.

Klaviatuuriga saab akna avada ja sulgeda: Escape sulgeb akna ja viib fookuse tagasi nupule „Ava vestlus”. Mobiilivaates püsib aken ekraani piires.

## Kui täpset tõendit ei leitud

Kui sobivad ametlikud tulemused on olemas, kuid nende nähtavad tõendilõigud ei kata küsimust piisavalt täpselt, ütleb otsing seda eraldi ning jätab tulemused avamiseks alles. Täpsusta siis objekti, näitajat, piirkonda või aastat. Teade „täpset ja piisavalt asjakohast ametlikku tõendit ei leitud” kuvatakse ainult siis, kui ka sobivat ametlikku tulemust ei leitud. Teenuse tõrke korral ei asenda rakendus puuduvat tõendit vana arvu ega üldteadmisega.
