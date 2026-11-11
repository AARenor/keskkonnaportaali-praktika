const repository = "https://github.com/AARenor/keskkonnaportaali-praktika/blob/main/";

function Code({ children }) {
  return <pre tabIndex={0}><code translate="no">{children}</code></pre>;
}

function CodeLink({ path, children }) {
  return <a href={`${repository}${path}`}>{children || path}</a>;
}

export const userGuide = {
  title: "Kasutusjuhend",
  intro: "Leia Eesti keskkonnateemade kohta selgitusi ja ametlikke allikaid. Küsi eesti keeles, täpsusta otsingut ning kontrolli olulist infot algallikast.",
  sections: [
    {
      id: "esimene-otsing",
      title: "Alusta otsingust",
      content: <>
        <ol>
          <li>Ava <a href="/">praktikaprojekti avaleht</a> ja kirjuta väljale „Küsi keskkonnaandmete kohta …” märksõna või küsimus.</li>
          <li>Vajuta Enter või nuppu „Küsi” (mobiilis otsinguikoon). Võid valida ka sobiva küsimuse otsingusoovituste hulgast.</li>
          <li>Loe vastust, kui selle koostamiseks leidub piisavalt sobivaid allikaid. Vastuse järel näed otsingutulemusi.</li>
          <li>Ava nummerdatud viide või tulemuse pealkiri ja kontrolli infot algallikast.</li>
        </ol>
        <p>Tulemused võivad ilmuda enne vastuse valmimist. Otsingu ajal ei pea lehte uuesti laadima. Pikk vastus ei sõltu ühest lahtisest ühendusest: leht küsib serverilt lühikeste päringutega töö seisu, seega aeglane vastus ei katke ainuüksi kestuse tõttu. Kui lehe sulged või uuendad või alustad uut otsingut, katkeb pooleliolev töö ja vastust tuleb uuesti küsida.</p>
        <p>„Tühjenda otsing” eemaldab sisestatud teksti, kuid ei kustuta juba kuvatud tulemusi. Uus küsimus käivitab uue otsingu.</p>
        <p>Otsing töötab praegu eesti keeles. Konto loomist ega sisselogimist selle otsingu kasutamiseks ei ole.</p>
        <p>Praegu koostab otsing AI kokkuvõtte ainult Eesti metsateemadel. Muude keskkonnateemade kohta saab otsida allikaid: näed tulemuste loendit, pealkirju ja viiteid, kuid mitte AI koondvastust. See piir on toote otsus, mitte tõrge, ja seda saab seadistusega muuta ainult eraldi otsuse ning kvaliteedikontrolli järel.</p>
        <p>Allikakiht hõlmab Keskkonnaportaali ja heakskiidetud ametlike väljaandjate avalikke lehti. Leheteksti täidetakse järk-järgult ka täissünkroonimiste vahel. Allika tõrke korral võib uue teksti jõudmine otsingusse võtta kauem.</p>
      </>,
    },
    {
      id: "hea-kusimus",
      title: "Kuidas küsimust sõnastada?",
      content: <>
        <p>Alusta teemast, mida päriselt teada tahad. Lisa aasta, koht või näitaja, kui need on olulised. Pikk ja viisakas sissejuhatus pole vajalik, kuid võid küsida loomulikus eesti keeles.</p>
        <ul>
          <li><strong>Üldine teema:</strong> „mets” või „põhjavesi”.</li>
          <li><strong>Konkreetne küsimus:</strong> „kui palju on raiemaht” või „kuidas ürask kuuski kahjustab”.</li>
          <li><strong>Aeg või näitaja:</strong> „jäätmete ringlussevõtu määr Eestis 2023”.</li>
          <li><strong>Osakaal:</strong> „kui suur osa Eestist on mets”.</li>
        </ul>
        <p>Need on küsimuste näited, mitte lubadus, et iga sõnastus saab alati vastuse. Sobivate tõendite puudumisel võib otsing näidata ainult allikaid või paluda täpsustust.</p>
        <p>Kui kasutad soovitusi klaviatuuriga, liigu valikute vahel üles- ja allanoolega, vali Enteriga ning sule loend Escape'iga. Soovituse saab valida ka hiire või puudutusega.</p>
      </>,
    },
    {
      id: "vastus-ja-allikad",
      title: "Vastus ja allikate kontrollimine",
      content: <>
        <p>Vastus on otsingu käigus leitud allikate põhjal koostatud selgitus. See ei asenda algallikat, ametlikku otsust ega erialast nõustamist.</p>
        <ul>
          <li><strong>Nummerdatud viide</strong> vastuse tekstis avab vastava algallika uues vahelehes.</li>
          <li><strong>Tulemuse pealkiri</strong> viib allikale. Kirjeldus aitab otsustada, kas allikas vastab sinu küsimusele.</li>
          <li><strong>Allika nimi</strong> näitab info avaldajat. Vastuse viidete värvid ja allikate legend aitavad viiteid kokku viia.</li>
          <li><strong>Legendi read on lingid:</strong> iga allika number, nimi ja kuupäev avaneb kohe algallikas uuel vahelehel — ka siis, kui vastus ei mahtunud ühtegi viidet intro alla.</li>
          <li><strong>„Andmed:”</strong> näitab andmeaastat; <strong>„Uuendatud:”</strong> lehe teadaolevat muutmisaega ning selle puudumisel <strong>„Avaldatud:”</strong> avaldamisaega. Reaalaja seireallika kellaaeg on vaatlusaeg ja kuvatakse kui <strong>„Andmete seis:”</strong>.</li>
        </ul>
        <p>Avatud küsimuse („miks…”, „kuidas…”, „mida teeb…”) vastus eelistab sisulist põhjust, tagajärge ja vajalikku konteksti, mitte lauset sellest, mida mõni veebileht käsitleb. Mitu asjakohast allikalauset võib moodustada ühe selgituse; pikkus pole omaette eesmärk. Arvu, aastat, konkreetset kohta või tegevust küsiv vastus nõuab endiselt täpset tõendit; sobiva lõigu puudumisel kuvatakse allikad või palutakse täpsustust.</p>
        <p>Metsa valeväidete küsimuses eristatakse artiklis vaidlustatud väidet allika enda selgitusest. Vastus nimetab allika avaldamisaja: ajalooline selgitus ei tõenda väite praegust levimust ega tänast metsaseisu. Kui artikli sisust ei leidu väite ja selgituse paari, ei asendata seda üldise metsaülevaatega.</p>
        <p>„Uusim leheuuendus” tähendab võrdlust teadaolevate lehe uuendamiskuupäevade vahel. See ei tähenda, et kõik selles allikas esitatud andmed oleksid sama aasta kohta.</p>
        <p>Olulise arvu juures kontrolli algallikast aastat, ühikut ja mõistet. Näiteks metsamaa pindala ei ole sama mis metsaga kaetud metsamaa ehk puistute pindala.</p>
        <p><strong>Raiemaht ja juurdekasv ei ole üks arv.</strong> Juurdekasv on puistule aastas lisanduv tüvepuidu kogus; netojuurdekasv saadakse, kui sellest arvatakse maha looduslik suremus. Raiemahuga tuleb võrrelda sama ulatuse ja sama perioodi elusate puude raiet, sest raiemahu hulka loetakse ka surnud puud. Keskkonnaagentuuri ülevaate järgi oli viimase kümnendi keskmisena elusate puude raiemaht majandatavates metsades netojuurdekasvust kõrgem, 20 aasta vaates aga sellest madalam. Ühe aasta ega ühe näitaja põhjal ei saa metsamajanduse kestlikkuse kohta lõplikku järeldust teha. <a href="https://keskkonnaagentuur.ee/node/2720">Keskkonnaagentuur: netojuurdekasvu ja raie tasakaal</a></p>
        <p><strong>SMI töövihik ei avalda kogu riigi netojuurdekasvu kogumahtu.</strong> Töövihik annab kogujuurdekasvu kogu riigile ning valimil põhineva raiemahuhinnangu aastate kaupa kuni 2024. aastani. Keskkonnaagentuuri andmetel on 2025. aasta raiemahu eksperthinnang 11 miljonit m³, mitte töövihiku 2025. aasta rida. Kui vastus neid arve kõrvutab, nimetab ta iga arvu juures väljaande ja aasta ega lahuta eri avaldajate ridu üksteisest. <a href="https://keskkonnaagentuur.ee/uudised/smi-metsatagavara-stabiilne">Keskkonnaagentuur: SMI metsatagavara on stabiilne</a></p>
        <p><strong>Väljavõtted on lühikesed ja piiratud.</strong> Tulemuse kirjeldus ja vastuses kasutatud allikaväljavõte on lühikesed tsitaadid, mis viivad algallika juurde, mitte allika koopia. Kui avaldaja on lühiväljavõtte keelanud või piiranud, järgib otsing seda piiri; siis näed linki, pealkirja ja kuupäeva, kuid mitte pikka tekstilõiku. Avaldaja luba robotitele ei ole litsents ega anna õigust sisu taaskasutada.</p>
        <p>Mõne allika luba kehtib kopeeritud tekstile ainult piiratud aja. Kui avad sama vastuse hiljem uuesti, võib selle koha peal olla ainult linkidega vaade: kopeeritud teksti, väidet ega diagrammi siis enam ei näidata. Lingid, pealkirjad ja kuupäevad jäävad alles, seega saad algallikat ise kontrollida.</p>
      </>,
    },
    {
      id: "filtrid",
      title: "Täpsusta tulemusi filtritega",
      content: <>
        <p>Otsingutulemuste juures saad muuta allika-, sisutüübi- ja aastafiltrit ning tulemuste järjestust. Pakutavad sisutüübid ja aastad sõltuvad leitud tulemustest.</p>
        <ul>
          <li><strong>Allikas:</strong> „Kõik allikad”, „Ametlikud ja kontrollitud”, „Ametlikud”, „Taustallikad” või „Muud veebiallikad”. See on allikarühm, mitte üksiku asutuse valik.</li>
          <li><strong>Sisutüüp:</strong> vali näiteks artikkel, teemaleht või andmeallikas, kui see valik on saadaval.</li>
          <li><strong>Aasta:</strong> kitsenda tulemusi allika avaldamisaasta järgi, mitte mõõteaasta ega lehe uuendamisaasta järgi. Soovitud andmeaasta kirjuta küsimusse.</li>
          <li><strong>Järjestus:</strong> „Asjakohasemad enne” või „Uuemad asjakohased enne”. Mõlemal juhul peab allikas küsimusega sobima.</li>
        </ul>
        <p>Filtri muutmine teeb uue otsingu, koostab vastuse uuesti valitud allikatest ja alustab uut jätkuküsimuste lõime. Väga kitsas filter võib jätta vastuse või tulemused tühjaks. Sel juhul kasuta „Lähtesta” või täpsusta küsimust.</p>
        <p>Kui tulemusi on mitu lehekülge, kasuta „Eelmine”, leheküljenumbrit või „Järgmine”. Lehekülje vahetamine muudab tulemuste loendit, mitte algset vastust. Tulemuste arv võib allikate uuenedes muutuda.</p>
      </>,
    },
    {
      id: "jatkukusimused",
      title: "Küsi edasi",
      content: <>
        <p>Vastuse juures saad kasutada vormi „Küsi selle vastuse kohta”. Iga jätkuküsimuse jaoks otsitakse allikad uuesti; varasem vastus üksi ei ole uue väite tõend.</p>
        <p>Kirjuta, mida soovid täpsustada, või vali seotud küsimus. Näiteks pärast metsamaa pindala küsimust võid küsida „näita 2000–2025”, kui soovid sama näitaja pikemat aegrida.</p>
        <p>Jätkuküsimus, mis ise teemat nimetab (näiteks „selgita hindamise etappe” või lühend „KIH”), pärib algse küsimuse teema: otsing ühendab mõlemad ja vastab sama lõime allikaist. Kui jätkuküsimus toob kaasa hoopis teise valdkonna sõna, küsib otsing uuesti täpsemalt — see kaitseb vastust teemavälise sisu eest.</p>
        <p>Ühes vastuse jätkuküsimuste lõimes saab teha kuni neli jätku, iga küsimus kuni 180 märki. Ka „Küsi veel” valiku kasutamine loetakse jätkuks. Kui piir saab täis või alustad teist teemat, esita uus küsimus peamises otsingukastis.</p>
        <p>Jätkuvastus ilmub algse vastuse alla oma viidetega. Allpool olev lai tulemuste loend jääb algse küsimuse loendiks; jätkuvastuse algallikaid kontrolli selle enda nummerdatud viidetest.</p>
      </>,
    },
    {
      id: "vestlus",
      title: "Vestlus eraldi aknas",
      content: <>
        <p>Avalehel ja otsinguvaates <code>/otsi</code> on nupp „Ava vestlus”. See avab vestlusakna, mis kasutab sama allikapõhist otsingut ega asenda tavalist otsingut: põhiotsing jääb lehele alles ja töötab vestlusest sõltumata.</p>
        <ul>
          <li><strong>Esimene küsimus</strong> läheb samasse otsingusse kui põhivorm. Vastus, nummerdatud viited, diagramm ja võimalik täpsustuspalve on samad, mida näed otsingutulemuse juures.</li>
          <li><strong>Iga järgmine küsimus</strong> teeb uue tõendiotsingu. Varasemad küsimused aitavad teemat täpsustada, kuid varasem vastus ei muutu uue väite tõendiks.</li>
          <li><strong>Kuni neli jätkuküsimust</strong> ühe vestluse kohta. Kui piir saab täis, pakub aken uue vestluse alustamist.</li>
          <li><strong>„Uus vestlus”</strong> tühjendab sõnumid, pooleliolevad päringud ja varasema konteksti.</li>
        </ul>
        <p>Vestlusaken pakub alguses ja iga vastuse järel ainult eelnevalt üle vaadatud metsaküsimusi, mis seostuvad selle küsimuse ja selle vestlusega. Juba küsitud küsimust uuesti ei pakuta, ja kui sobivat küsimust ei ole, jääb pakkumiste rida lühemaks või kaob sootuks. Valik tehakse brauseris: see ei tee uut võrgupäringut, ei kutsu mudelit ega salvesta profiili ega ajalugu.</p>
        <p>Vestlusakna sulgemine ja uuesti avamine hoiab selle lehe sõnumid alles. Lehe uuendamisel kaovad need brauseri mälust ning lingi jagamine vestlust ei taasta. Pooleliolev vastus katkeb lehe sulgemisel või uuendamisel, sest töö võti elab ainult selle lehe mälus. Sõnumeid ei salvestata selles brauseris püsivalt.</p>
        <p>Kui vastust ei õnnestu koostada, kuvatakse juba leitud otsingutulemused esmalt ja selgitus nende järel. Allika enda väljavõte säilitab viite ja märkuse. Küsimust saab uuesti proovida; puuduvaid tulemusi ega vastust ei mõelda juurde.</p>
        <p>Klaviatuuriga saab akna avada ja sulgeda: Escape sulgeb akna ja viib fookuse tagasi nupule „Ava vestlus”. Mobiilivaates püsib aken ekraani piires.</p>
      </>,
    },
    {
      id: "diagrammid",
      title: "Loe diagrammi koos viitega",
      content: <>
        <p>Diagramm kuvatakse ainult siis, kui vastuse juurde leidub kontrollitud ametlik andmerida. Kõigile küsimustele diagrammi ei teki ja seda ei tuletata vastuse sõnastusest.</p>
        <ul>
          <li>Aegrida näitab avaldatud aastate väärtusi joone või tulpadena. Pealkiri, ühik ja allikaviide selgitavad, mida võrreldakse.</li>
          <li>Metsamaa osakaalu küsimuse juures võib olla maakategooriate jaotuse sektordiagramm.</li>
          <li>Raieliigi osakaalu küsimuse juures võib olla eri raieliikide jaotuse sektordiagramm.</li>
          <li>Konkreetse aasta, piirkonna või puuliigi küsimusele ei lisata automaatselt üldist Eesti kontekstidiagrammi.</li>
        </ul>
        <p>Metsastatistika vastuste ja diagrammide põhiallikas on Keskkonnaagentuuri SMI. Puuduv aasta ei tähenda nulli ning värskeim avaldatud aasta ei pruugi olla käesolev aasta. Kui kontrollitud andmerida puudub, jääb diagramm ära ja vastus viitab allikale tekstina.</p>
        <p>Diagramm järgib avaldatud arve, mitte ümardatud muljet:</p>
        <ul>
          <li><strong>Ühik kirjutatakse diagrammile välja</strong>, mitte ainult hõljumisaknasse. Pealkiri ja ühik kehtivad kogu joonise kohta.</li>
          <li><strong>Tulp algab nulljoonest</strong>, seega tulpade kõrgus on omavahel võrreldav. Negatiivne väärtus joonistatakse nulljoonest allapoole.</li>
          <li><strong>Lõigatud telg ütleb seda ise.</strong> Kui joondiagrammi vertikaaltelg algab andmetest kõrgemal, seisab allkirjas lause „Vertikaaltelg algab väärtusest …, mitte nullist.” Selle lause puudumisel algab telg nullist või sisaldab nulli.</li>
          <li><strong>Avaldatud täpsus säilib.</strong> Arv 6,55 jääb 6,55; suure koguse juures jääb kuvatud täpsus ühe kümnendkohani. Ümardus ei muuda algallikat.</li>
          <li><strong>Kaht eri ühikut ei panda ühele teljele.</strong> Eri ühikus seeriad joonistatakse eraldi paneelidena, mitte ühe segatud skaalana.</li>
          <li><strong>Jaotusdiagrammil on kuni kaheksa osa.</strong> Väiksemad rühmad koondatakse üheks osaks ja kogusumma ei muutu.</li>
        </ul>
        <p>Iga diagrammi juures on viide ja andmeaasta. Enne arvu kasutamist kontrolli, mida see mõõdab: kogujuurdekasv, netojuurdekasv ja raiemaht ei ole sama suurus. Kui joonisel on mitu seeriat, loe iga seeria silti ja ühikut eraldi.</p>
        <p>Hiirega punkti kohal liikudes või Tab-klahviga andmepunktile liikudes saab vaadata väärtust. Ekraanilugeja jaoks on diagrammil ka tekstikirjeldus ja andmetabel.</p>
      </>,
    },
    {
      id: "kui-otsing-ei-aita",
      title: "Kui vastust või tulemusi ei ole",
      content: <>
        <ul>
          <li><strong>Tulemused on olemas, kuid vastust pole:</strong> allikad ei pruugi küsimust piisavalt täpselt katta. Ava sobiv allikas või küsi konkreetsemalt.</li>
          <li><strong>Tulemusi pole:</strong> eemalda filtrid, kontrolli kirjapilti ja proovi eestikeelset teemanimetust.</li>
          <li><strong>Küsitakse täpsustust:</strong> lisa soovitud aasta, näitaja või koht. Ära lisa isikuandmeid.</li>
          <li><strong>Juhendi vastus puudub:</strong> kontrollitud juhendi- ja kataloogiväljavõtted kehtivad 12 kuud. Kui allikas on aegunud, ei kasutata seda vastuses; ava algallikas või küsi teemakohast teenust.</li>
          <li><strong>Otsing on ajutiselt hõivatud või ebaõnnestub:</strong> oota veidi ja proovi uuesti. Otsing ei muuda ametlikke andmeid.</li>
          <li><strong>Leht palub uuendada:</strong> laadi see uuesti, et kasutada uut otsinguversiooni. Vajadusel sisesta küsimus pärast laadimist uuesti.</li>
        </ul>
        <p>Praeguse ilma ja õhukvaliteedi küsimused võivad suunata ametlikku ajakohasesse teenusesse. See on kasulik tulemus, mitte lubadus, et kõik teenuse andmed kuvatakse praktikaportaalis.</p>
        <p>Otsing keskendub Eesti keskkonnateemadele. Metsa üldnäitajad on Eesti kohta; välismaa või väga kohaliku küsimuse jaoks ei pruugi olla piisavalt sobivaid andmeid.</p>
      </>,
    },
    {
      id: "privaatsus",
      title: "Privaatsus ja ohutu kasutamine",
      content: <>
        <p>Ära sisesta otsingusse isikukoodi, kontaktandmeid, terviseinfot ega muid tundlikke isikuandmeid. Ka vabatekstiline küsimus võib sisaldada isikuandmeid.</p>
        <p>Otsingusoovituste saamiseks saadetakse 2–80 märgi pikkune sisestatud tekst serverile juba kirjutamise ajal, enne nupu „Küsi” vajutamist. Seetõttu ära kirjuta väljale tundlikku infot ka prooviks.</p>
        <p>Kui väli näitab juba käivitatud küsimust, valitakse soovitused brauseris üle vaadatud loendist ega saadeta selle valiku jaoks uut päringut. Kontekstipõhised jätkuküsimused kasutavad ainult avatud lehe ja vestluse mälu, ei tee võrgupäringut ega mudelikutset ning ei salvesta profiili ega ajalugu. Need soovitused lähtuvad üksnes praegusest küsimusest ja avatud vestlusest, mitte sinu varasemast kasutusest.</p>
        <p>Vastuse koostamiseks võib OpenAI GPT-6-Luna autenditud serveripoolse Codex gateway kaudu töödelda küsimust, kuni kümmet valitud avaliku allika väljavõtet (kokku kuni 36 000 märki) ja jätkuküsimuse korral kuni 1 400 märki varasemate küsimuste konteksti. Mudeli sisendile ei lisata sinu IP-aadressi, küpsiseid, brauseri mandaate, serverisaladusi ega kogu andmekogu.</p>
        <p>Praktikaprojekti otsingu- ja vahemälutabelisse ei salvestata toorpäringut. See ei tähenda täielikku anonüümsust: välise teenuse, veebiserveri või puhverserveri logimise tingimused võivad olla erinevad. Algallika või Terrapointi avamisel kehtivad ka selle teenuse tingimused.</p>
        <p>Ametliku kasutuselevõtu eel tuleb andmetöötluse tingimused uuesti üle vaadata. Ära kasuta otsingut üksikisiku kohta privaatsete andmete leidmiseks.</p>
        <p>Otsingu küsimus ei ole uues otsingulingis. Aadress <code>/otsi</code> ei taasta küsimust järjehoidjast ega jagatud lingist; avatud lehe mälus olev otsing kaob uuesti laadimisel. Ka jätkuküsimused ei ole püsivalt salvestatud vestlus.</p>
      </>,
    },
    {
      id: "terrapoint",
      title: "Eraldi Terrapointi vaade",
      content: <>
        <p>Avalehe Terrapointi jaotises on eraldi kinnistuandmete rakendus. See ei ole keskkonnateemade üldotsingu osa ja selle tulemusi ei kasutata üldotsingu vastuste allikana.</p>
        <p>Kasuta selle vaate enda otsingut ja juhiseid. Kui sisseehitatud vaade ei avane, saab rakenduse avada ka <a href="https://terrapoint.ee/">Terrapointi veebilehel</a>. Tegemist on eraldi teenusega, mille andmete ja kasutamise tingimusi tuleb kontrollida seal.</p>
        <p>Avalehe päevakajalised lood ja sündmused on praktikaversiooni kuupäevastatud sisukoopia, mitte reaalajas uudisvoog.</p>
      </>,
    },
  ],
};

export const developerGuide = {
  title: "Integratsioonijuhend arendajale",
  intro: "Praeguse praktikaprojekti tehniline leping arendajale, kes ühendab allikapõhise otsingu keskkonnaportaal.ee süsteemiga. Näited kirjeldavad olemasolevat lahendust, mitte valmis portaaliintegratsiooni.",
  sections: [
    {
      id: "integratsiooni-piir",
      title: "Integratsiooni piir ja lähtekoht",
      content: <>
        <p>Projekt koosneb Reacti kasutajaliidesest, Node.js/Expressi API-st ning otsingu allikakihist. Avalik lähtekood asub <a href="https://github.com/AARenor/keskkonnaportaali-praktika">projekti repositooriumis</a>. Portaali sisemist CMS-i, SSO-d, andmebaasi ega juurutusprotsessi see projekt ei kirjelda ega ühenda automaatselt.</p>
        <p><strong>Soovitatav lähtekoht:</strong> vii otsinguteenuse API portaali enda päritolu taha ja ühenda portaali kasutajaliides sellega suhteliste <code>/api/…</code> aadresside kaudu. Kui portaal neid teid juba kasutab, lepi marsruutide nimeruum kokku ning muuda klienti ja puhverserverit koos.</p>
        <ul>
          <li>Üldotsing ja Terrapointi täisrakenduse iframe jäävad eraldi. Ära kasuta Terrapointi üldotsingu tõendiallikana.</li>
          <li>Kogu praktikaprojekti iframe'ina teise domeeni lisamine ei tööta muutmata kujul: CSP sisaldab <code>frame-ancestors 'self'</code>.</li>
          <li>Otse brauserist praktikadomeeni API kutsumine ei ole toetatud integratsiooniviis. Ristpäritolu brauseripäringud lükatakse tagasi; CORS-i pole avatud.</li>
          <li>Praegusel API-l puudub kasutajakontode või API-võtmega kliendiautentimise leping. Origin-kontroll ei ole autentimine. Vajadusel lisa teenusevaheline ligipääsupiir oma taristus.</li>
        </ul>
        <p>Enne ametlikku ühendamist lepi vastuvõtva meeskonnaga kokku päritolu, marsruudid, teenuse omanik, andmetöötlus, ligipääs, seire, veapiirid ning tagasipöördumine senise otsingu juurde. Ära käsitle praktikadomeeni tootmise teenustaseme lubadusena.</p>
        <p>Lähtekohad: <CodeLink path="src/App.jsx" />, <CodeLink path="server/index.mjs" />, <CodeLink path="server/security.mjs" />.</p>
      </>,
    },
    {
      id: "api-ulevaade",
      title: "API teed ja päringud",
      content: <>
        <div className="docs-table" tabIndex={0} role="region" aria-label="API teed">
          <table>
            <caption>Olemasolevad otsingu- ja tervisekontrolli liidesed</caption>
            <thead><tr><th scope="col">Meetod ja tee</th><th scope="col">Otstarve</th></tr></thead>
            <tbody>
              <tr><td><code>POST /api/search/jobs</code></td><td>Brauseri põhitee pika vastuse jaoks: keha <code>{'{job_id, job_key, kind, request}'}</code> loob töö ja vastab kohe töö olekuga (201); genereerimine jookseb päringust eraldi.</td></tr>
              <tr><td><code>POST /api/search/jobs/poll</code></td><td>Lühike küsitlus: <code>{'{job_id, job_key, after}'}</code> → <code>{'{job_id, state, deadline_at, retry_after_ms, events}'}</code>. Sündmused on järjenumbritega <code>seq</code> ja iga küsitlus annab ainult veel nägemata sündmused.</td></tr>
              <tr><td><code>POST /api/search/jobs/cancel</code></td><td>Tühistab oma töö; olemasoleval tööl vale võti vastab 404. Tundmatu, kuid korrektne identifikaator jätab tühistamistombstone'i, mis peatab veel teel oleva loomispäringu, ja vastab 200, kui reservis on koht, muidu 429.</td></tr>
              <tr><td><code>POST /api/search/stream</code></td><td>Ühilduvusrada välistele klientidele: tulemused enne vastust; NDJSON. Brauser ei kasuta seda enam pika vastuse jaoks.</td></tr>
              <tr><td><code>POST /api/search</code></td><td>Ühilduvusrada: vastus ja tulemused ühe JSON-objektina.</td></tr>
              <tr><td><code>POST /api/search/results</code></td><td>Ainult lehekülgede ja filtritega tulemuste loend.</td></tr>
              <tr><td><code>POST /api/search/follow-up</code></td><td>Ühilduvusrada: uue tõendiotsinguga jätkuküsimus; JSON-vastus.</td></tr>
              <tr><td><code>POST /api/search/follow-up/stream</code></td><td>Ühilduvusrada: jätkuküsimus NDJSON-voos.</td></tr>
              <tr><td><code>POST /api/suggestions</code></td><td><code>{'{q}'}</code> → <code>{'{suggestions: [{value, count}]}'}</code>, kuni kaksteist valikut. Piir 80 märki; alla kahe märgi korral tühi loend.</td></tr>
              <tr><td><code>GET /api/health</code></td><td>Protsessi tervis, <code>revision</code> ja aeg; ei tõesta kõigi sõltuvuste töökorda.</td></tr>
              <tr><td><code>GET /api/health/container-readiness</code></td><td>Konteineri vastuvõtuvalmidus; sulgemisel HTTP 503.</td></tr>
              <tr><td><code>GET /api/corpus</code></td><td>Allikakihi koondstatistika, mitte dokumentide eksport. <code>hydrated</code> loeb kättesaadavate kirjete salvestatud tekstid, <code>freshOfficialPages</code> viimase seitsme päeva edukalt loetud ametlikud lehed ja <code>lastSync.errorCount</code> viimase sünkroonimise vead. Värske lehe loendur ei tõesta, et iga leht sobib konkreetse vastuse tõendiks.</td></tr>
            </tbody>
          </table>
        </div>
        <p>POST-päringud peavad kasutama <code>Content-Type: application/json</code>. JSON-keha ülempiir on 32 KiB, tihendatud keha ei toetata. Küsimus <code>q</code> on nõutav ning pärast normaliseerimist kuni 180 märki. Kasuta <code>page</code> vahemikus 1–500 ja <code>page_size</code> vahemikus 1–50; vaikimisi 1 ja 12.</p>
        <p>Otsingu ja soovituste GET-alias'e ei ole. Küsimus tuleb JSON-kehast; lehekülge ja filtreid saab anda ka päringuparameetrites, kuid lihtsama ja üheselt mõistetava integratsiooni jaoks hoia need kõik kehas.</p>
        <Code>{`curl --fail-with-body --max-time 20 \\
  -X POST 'https://praktika.arle.top/api/search' \\
  -H 'Content-Type: application/json' \\
  --data '{"q":"mets","page":1,"page_size":12,"filters":{"source":"all","category":"","year":null,"sort":"relevance"}}'`}</Code>
        <p>See on serveri või käsurea näide, mitte luba brauseri ristpäritolu päringuks. Ära lisa küsimust URL-i päringuparameetriks ega logi seda tavapärasesse ligipääsulogi.</p>
        <p>Teed ja valideerimine: <CodeLink path="server/index.mjs" />. Praegune brauseriklient: <CodeLink path="src/App.jsx" />.</p>
      </>,
    },
    {
      id: "vastuse-leping",
      title: "JSON-vastus ja viited",
      content: <>
        <p><code>/api/search</code> tagastab tavaliselt HTTP 200 ja objekti väljadega <code>query</code>, <code>total</code>, <code>generatedAt</code>, <code>answer</code>, <code>sources</code>, <code>related</code>, <code>clarification</code>, <code>chart</code> ning <code>searchResults</code>. Valikulised väärtused võivad puududa või olla tühjad; klient peab neid kaitsvalt käsitlema.</p>
        <ul>
          <li><code>answer</code>: pealkiri <code>title</code>, sissejuhatus <code>intro</code>, selle viitenumbrid <code>introCitations</code>, lõigud <code>parts</code> ja lisamärkus <code>note</code>. Lõigus on <code>text</code>, <code>citations</code> ja võimalik <code>title</code>.</li>
          <li><code>sources[]</code>: viite number <code>citation</code>, <code>id</code>, <code>title</code>, <code>url</code>, avaldaja <code>organization</code> ja muu saadaolev allikametadata.</li>
          <li><code>searchResults</code>: <code>items[]</code>, <code>total</code>, <code>page</code>, <code>pageSize</code>, <code>pageCount</code>, <code>hasMore</code>, <code>facets</code>, <code>appliedFilters</code> ja <code>updatedAt</code>.</li>
          <li><code>related[]</code>: seotud küsimuste tekstid. <code>clarification</code> võib sisaldada täpsustamisvajadust; ära käsitle seda HTTP veana.</li>
          <li><code>chart</code>: valikuline kontrollitud diagrammi andmestruktuur. Kasuta olemasolevat <CodeLink path="src/AnswerChart.jsx">diagrammirenderdajat</CodeLink>, mitte mudeli proosast arvude eraldamist.</li>
        </ul>
        <p>Tulemuste loendi endpoint tagastab <code>searchResults</code> kuju otse, ilma vastuse ümbriseta. Tulemuse <code>id</code> ei ole viitenumber. Seosta vastuse numbrid alati <code>sources[].citation</code> kaudu ja ava vastav kontrollitud HTTPS-URL; puuduvat viidet ära asenda juhusliku tulemusega.</p>
        <p>Märgis „AI koondvastus” tähendab, et lõppvastuses säilis vähemalt üks uus kontrollitud mudeliväide. Mudelikõne toimumine, algvastuse koopia või tagasi lükatud täiendus seda märgist ei anna; sel juhul jääb alles sama jooksu allikapõhine vastus. Vastuse teenusepakkuja ja katse põhjus jäävad serveri privaatseks tehniliseks infoks.</p>
        <p>Lühike mõõtmisküsimus võib teadlikult saada ühe viidatud väljavõttega vastuse ka ilma märgiseta: deterministlik allikaväljavõte on toote otsus, mitte tõrge. Sama klient saab tunnis piiratud arvu mudelikõnesid; kvoodi täitumisel jääb alles sama jooksu allikapõhine vastus, mistõttu klient ei tohi eeldada, et iga päring saab mudeli kirjutatud teksti.</p>
        <p>Allika <code>published</code> on tõendatud avaldamisaeg ning võib olla tühi. <code>updated</code>, <code>dataYear</code> ja <code>dataAsOf</code> tähistavad eraldi leheuuendust, andmeaastat ja andmete seisu. Uuema SMI töövihiku varasema aasta rida võib erineda sama aasta algse väljaande hinnangust; neid ei tohi eri väljaannetest üheks arvuks ega muutuse põhjuseks ühendada.</p>
        <p>Loendi loenduriks kasuta <code>searchResults.total</code>; see ei ole garanteeritud ammendav kogu veebi vastete arv. Lehitsemine teeb uue otsingu, mitte ei loe külmutatud tulemuste hetkeseisu. <code>updatedAt</code> on loendi koostamise aeg, mitte allikalehe uuendamiskuupäev.</p>
        <p>Teksti ei tohi renderdada kontrollimata HTML-ina. Kasuta tavalist tekstirenderdust ning <CodeLink path="src/url-safety.js">välislinkide valideerimist</CodeLink>. Avalikust vastusest ei tohi tuletada ega kuvada teenusepakkujat, mudelit või sisemist ühendusolekut.</p>
        <p><code>chart.kind</code> on praegu <code>line</code>, <code>bar</code> või <code>share</code>. Diagrammil on pealkiri, ühik, andmeseeriad, <code>citation</code> ja valikuline <code>caption</code>; punktidel on <code>x</code> ning <code>y</code>, ja jaotusdiagrammil ka silt. Kui diagramm puudub või ei läbi kontrolli, jäta see kuvamata.</p>
        <p>Leping ja näited: <CodeLink path="server/pipeline.mjs" />, <CodeLink path="server/retrieval.mjs" />, <CodeLink path="server/answer-chart.mjs" />, <CodeLink path="tests/search-stream.test.mjs" />.</p>
      </>,
    },
    {
      id: "too-ja-kusitlus",
      title: "Pikk vastus: töö ja lühiküsitlus",
      content: <>
        <p>Pikk vastus ei tohi sõltuda ühest lahtisest ühendusest. Cloudflare'i <a href="https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/">524 dokumentatsioon</a> määrab vaikimisi Proxy Read Timeout'iks 125 sekundit ja seda saab tõsta ainult Enterprise'i tasemel; <a href="https://developers.cloudflare.com/speed/optimization/protocol/http2-to-origin/">HTTP/2 to Origin</a> kordab, et üle 125 sekundi kestvad päringud, sealhulgas voogedastus, vajavad selle piiri tõstmist, kuigi multiplexing koondab paljud lühikesed päringud ühele algsele ühendusele. Seetõttu loob brauser töö ja küsib selle seisu lühikeste päringutega.</p>
        <p>Loomine: <code>POST /api/search/jobs</code> kehaga <code>{'{job_id, job_key, kind, request}'}</code>. <code>job_id</code> on 8 kuni 64 URL-turvalist märki ja <code>job_key</code> 16 kuni 128 URL-turvalist märki; brauser genereerib mõlemad iga lugemise jaoks krüptograafilisest juhuarvugeneraatorist. <code>job_key</code> on bearer-saladus: see autoriseerib küsitluse ja tühistamise, käib ainult päringu kehas ega jõua URL-i, logisse ega salvestusse. <code>kind</code> on <code>search</code> või <code>follow-up</code> ja <code>request</code> on sama keha, mille voog võtab. Server vastab uue töö korral 201 ja töö olekuga, mitte vastuse tekstiga; sama identifikaatori, võtme ja päringuga kordus vastab 200 sama olekuga. Brauser jätkab kadunud kinnituse järel siiski küsitlust, mitte teist loomist.</p>
        <p>Vastuse keha on <code>{'{job_id, state, deadline_at, retry_after_ms, events: [{seq, event}]}'}</code>. <code>state</code> on <code>running</code>, <code>complete</code>, <code>failed</code> või <code>cancelled</code>. <code>seq</code> on tihe alates 1 ja sündmuse tüübid on <code>results</code>, <code>draft</code> ja <code>answer</code>: tulemuste loend tuleb alati enne vastust, seega aeglane mudel ei varja juba leitud allikaid. Lõppolek on lõplik: hilinenud sündmus ei kasvata tühistatud ega aegunud tööd.</p>
        <p>Küsitlus: <code>POST /api/search/jobs/poll</code> kehaga <code>{'{job_id, job_key, after}'}</code> annab ainult sündmused, mille <code>seq</code> on suurem kui <code>after</code>. Loetamatu kursori korral saadetakse kõik alles olevad sündmused uuesti ja klient eemaldab korduse <code>seq</code> järgi, seega kadunud kursori hind on liiklus, mitte kaotatud sündmus. Brauser küsib vaikimisi iga 2000 ms järel, austab serveri <code>retry_after_ms</code> vihjet (jooksvana 2000 ms, lõppolekus 0), katkestab iga päringu 8000 ms järel ja teatab ühendusveast alles viie järjestikuse tõrke järel. Töö ise jookseb edasi ka siis, kui üks küsitlus katkeb.</p>
        <p>Sündmuse kopeerimisaken ja asendus: kui avaldaja luba kopeeritud tekstile aegub, tagastab küsitlus sama <code>seq</code> juures linkidele taandatud asenduse ega korda enam kopeeritud teksti, väidet ega diagrammi. Aken ja asendus hoitakse sündmuse kõrval, mitte selle sees, ega ilmu avalikus JSON-is. Kui sündmus ja asendus koos ei mahu, aga asendus üksi mahub, salvestatakse kohe asendus ilma aknata.</p>
        <p>Tühistamine: <code>POST /api/search/jobs/cancel</code> kehaga <code>{'{job_id, job_key}'}</code>. Brauser tühistab töö uue otsingu, filtrivahetuse või lehelt lahkumise korral <code>keepalive</code> päringuga. Olemasoleva töö puhul nõutakse õiget võtit ja vale võti vastab 404 nagu tundmatu töö. Tundmatu, kuid korrektselt vormistatud identifikaatori tühistamine paigaldab tühistamistombstone'i, mis peatab veel teel oleva loomise, ja vastab 200; kui tundmatute tühistuste reserv on otsas, vastab see 429 <code>JOB_CAPACITY</code>. Reserv on 200 kirjet kokku ja 2 ühe kliendi kohta ning see on eraldi kirjete ja töökohtade eelarvest. Vana päringu vastus ei tohi uue vaate üle kirjutada.</p>
        <p>Piirid on protsessi mälus ja neid võib ainult vähendada: kuni 40 jooksvat tööd, kuni 2 ühe kliendi kohta, kuni 2000 kirjet, 2 MB ühe töö sündmusi ja 16 MB kõiki sündmusi, kõva tähtaeg 285 sekundit, koristus iga sekund, sulgemise ajavaru 5 sekundit, töö päringu kanooniline kuju kuni 32 768 baiti ning tundmatute tühistuste reserv 200 kokku ja 2 ühe kliendi kohta. Sündmuste sisu kärbitakse 60 sekundi järel ja kirje identiteet püsib vähemalt 600 sekundit, kauem ainult aktiivse koristuse ajal; see pikem püsimine ei ole veel tootmises tõendatud. Tähtaeg lõpetab jooksu loogiliselt, kuid takerdunud koristus hoiab oma töökohta ja kliendikohta kuni tegeliku lõpetamiseni või protsessi lõpuni, seega 285 sekundi möödumine ei vabasta mahu kohe. Loomine kulutab sama otsingupiirangut (20 päringut minutis), sama vastuvõtukohta ja sama mudelieelarvet nagu voog; küsitlus ja tühistamine kasutavad eraldi 120 päringu minutikvooti ega võta genereerimiskohta. Kõik kolm jäävad üldise 240 päringu minutikvoodi ja sama päritolu JSON-kontrolli alla.</p>
        <p>Register on ainult selle protsessi mälus. Tootmise kontrollitud topoloogias (11.11.2026) oli üks terve konteiner ja selles üks rakenduse põhiprotsess, seega praegu jagavad kõik küsitlused sama registrit. Töö ei ela taaskäivituse ega juurutuse üle: uue konteineri käivitumisel tuleb otsing uuesti algatada. Ilma seansipüsivuse (affinity) lubaduseta ei tohi mitut replikat kasutada nii, et küsitlus võib jõuda teise protsessi: siis vastab see 404 ja klient peab alustama uue otsingu. Võtmeid hoitakse ainult SHA-256 räsina ja vale võti vastab sama 404-ga nagu tundmatu töö, seega identifikaatori arvamine ei anna tööle ligipääsu. Serveri pool: <CodeLink path="server/search_jobs.mjs" />. Brauseri pool: <CodeLink path="src/search_jobs.js" />.</p>
        <p>Vead on eristatavad: 400 <code>JOB_INVALID</code> vigase keha korral, 404 <code>JOB_NOT_FOUND</code> tundmatu või vale võtmega töö korral, 409 <code>JOB_CONFLICT</code> sama identifikaatori ja teistsuguse päringu korral, 429 <code>JOB_CAPACITY</code> täis järjekorra või ammendunud tundmatute tühistuste reservi korral koos <code>retry_after_ms</code> ja <code>Retry-After</code> päisega ning 503 <code>JOB_CLOSED</code> serveri sulgemise ajal. Neid ei tohi taandada üldiseks võrguveaks.</p>
      </>,
    },
    {
      id: "voog-ja-tuhistamine",
      title: "Järkjärguline vastus ja tühistamine",
      content: <>
        <p><code>/api/search/stream</code> on ühilduvusrada välistele klientidele, mitte brauseri põhitee: NDJSON vastuse tüüp on <code>application/x-ndjson</code>. See ei ole SSE ega üks JSON-dokument. Iga rida on eraldi JSON-objekt; võrgu andmeplokk võib lõppeda ka rea või UTF-8 märgi keskel.</p>
        <Code>{`{"type":"results","searchResults":{…}}
{"type":"draft","result":{…}}
{"type":"answer","result":{…}}`}</Code>
        <p>See on kuju kirjeldus, mitte käivitatav JSON-näide: <code>…</code> tähistab vastavat objekti. <code>draft</code> on valikuline. Edukas voog lõpeb <code>answer</code> sündmusega; eraldi <code>done</code> sündmust ega SSE <code>data:</code> eesliidet pole.</p>
        <p>Kasuta olemasolevat parserit <CodeLink path="src/search-stream.js" />. See hoiab protokolli lugemise, vastuse mahu ja sündmuste järjekorra kontrolli ühes kohas. Ära kutsu selle endpoint'i puhul <code>response.json()</code>.</p>
        <p>Puhverserver peab voo kohe edasi andma: ära puhverda ega vahemällu salvesta NDJSON-vastust. Server saadab <code>X-Accel-Buffering: no</code> ja <code>Cache-Control: no-store</code>; kontrolli tegelikku käitumist vastuvõtva taristu kaudu.</p>
        <p>Uue küsimuse, filtrivahetuse või lehelt lahkumise korral tühista eelmine päring <code>AbortController</code> abil. Ära lase vana päringu hilinenud vastusel uue päringu vaadet üle kirjutada.</p>
        <p>Iga teenusevastuse tavapärasel teel on <code>X-App-Build</code>; sama identifikaator on <code>/build.json</code> failis ja kliendikoodi sisse kompileeritud. Kui API vastuse build erineb avatud lehe build'ist, näita uuendamisvajadust, mitte uut andmestruktuuri vana renderdajaga. Varased ülekoormuse vastused võivad tavapäised vahele jätta.</p>
        <p>Näidis teise endpoint'i lihtsa integratsiooni alustamiseks (sama päritolu brauseris):</p>
        <Code>{`const controller = new AbortController();
const response = await fetch("/api/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ q: "mets", page: 1, page_size: 12 }),
  signal: controller.signal,
});
if (!response.ok) throw new Error("Otsingupäring ebaõnnestus");
const result = await response.json();
// Kontrolli vastuse kuju, build'i ja viiteid enne kuvamist.
// Uus otsing või lehelt lahkumine: controller.abort();`}</Code>
        <p>JSON-näide ei asenda täielikku brauseriklienti. Põhitee kasutab tööd ja lühiküsitlust, sest pikk vastus ei tohi sõltuda ühest lahtisest ühendusest; võta build'i kontroll, küsitluse kordus, tühistamine ja tühjad olekud üle <CodeLink path="src/App.jsx">olemasolevast kliendist</CodeLink>.</p>
      </>,
    },
    {
      id: "filtrid-ja-jatkud",
      title: "Filtrid ja jätkuküsimused",
      content: <>
        <p><code>filters.source</code> väärtused on <code>all</code>, <code>trusted</code>, <code>official</code>, <code>reviewed</code>, <code>supplementary</code> ja <code>other</code>. <code>trusted</code> koondab ametlikud ja kontrollitud allikad. <code>sort</code> on <code>relevance</code> või <code>newest</code>. <code>category</code> on tühi string või täpne sisutüübi väärtus (kuni 120 märki); <code>year</code> on <code>null</code> või täisarv 1990. aastast jooksva UTC-aasta + 1-ni. Filtrid rakenduvad korraga (AND); mitmikvaliku massiive pole.</p>
        <p>Võta allika-, sisutüübi- ja aastavalikud vastuse <code>facets</code> väljast, mitte ära kodeeri kõiki silte oma klienti. Sisend peab läbima serveri <CodeLink path="server/retrieval.mjs">filtrivalideerimise</CodeLink>. Kõik allikarühmad ei ole automaatselt sobivad faktivastuse tõendiks.</p>
        <p>Filtri muutmine peab tühistama eelmise vastuse ja käivitama uue otsingu. Ära näita varem koostatud vastust uue filtreeritud loendi kohal: vastuse tõendid peavad pärinema samast kehtivast tulemuste kogumist.</p>
        <p>Jätkuküsimus on eraldi otsing, mitte vaba vestlus. Säilita juurküsimus ja piiratud varasemate küsimuste kontekst; ära saada algallikana tagasi varasema mudelivastuse teksti.</p>
        <Code>{`{
  "root_query": "Kui palju on Eestis metsamaad?",
  "question": "Näita 2000–2025",
  "previous_questions": [],
  "filters": { "source": "official", "sort": "relevance" }
}`}</Code>
        <p>Saada see keha <code>POST /api/search/follow-up</code> teele. Juurküsimus ja jätkuküsimus on kumbki kuni 180 normaliseeritud märki. Server lubab kuni neli <code>previous_questions</code> sisendit; kontekst kasutab juurt ja viimast kolme varasemat sobivat küsimust, kokku kuni 1 400 märki. Vastus sisaldab oma uut loendit, alati lehekülg 1 ja suurus 12.</p>
        <p>Praegune kasutajaliides piirab lõime nelja jätkuvooruni; server piirab saadetud konteksti, mitte kõigi tulevaste voorude koguarvu. Serveris vestlussessiooni ei säilitata. Metsanäitaja perioodipõhine jätk võib pärida algse näitaja, kuid muu sõnastus peab uuesti läbima ulatuse ja privaatsuse kontrolli.</p>
        <p>Olemasolev klient näitab jätkuvastuse viiteid, kuid ei asenda laia juurküsimuse loendit jätkuvastuse loendiga. Säilita see eristus või kuva uues kliendis jätku loend eraldi, et vastust ja tõendeid mitte segi ajada.</p>
      </>,
    },
    {
      id: "vestlusliides",
      title: "Vestlusliides",
      content: <>
        <p>Avaleht ja <code>/otsi</code> pakuvad eraldi sisenemistee vestlusele nupuga „Ava vestlus”. See on kliendipoolne vaade olemasolevale otsingule: uut marsruuti, mudelit ega tõenditeed ei lisandu ja põhiotsing jääb muutumata.</p>
        <ul>
          <li><strong>Esimene voor:</strong> <code>POST /api/search/jobs</code> kehaga <code>kind: "search"</code> ja sama <code>request</code> kehaga, mille põhiotsing saadab, seejärel <code>POST /api/search/jobs/poll</code> kuni <code>answer</code> sündmuseni. Loe sündmusi <CodeLink path="src/search_jobs.js">olemasoleva töökliendiga</CodeLink>; NDJSON-i parser <CodeLink path="src/search-stream.js" /> jääb ühilduvusradade jaoks.</li>
          <li><strong>Järgmised voorud:</strong> <code>POST /api/search/jobs</code> kehaga <code>kind: "follow-up"</code> ja <code>request</code> väljadega <code>root_query</code>, <code>question</code>, <code>previous_questions</code>, <code>previous_answers</code> ja <code>filters</code>, seejärel sama küsitlus. Server teeb uue tõendiotsingu ja uue viidatud vastuse; varasem vastus ei ole tõend. Korduv vastus säilib ainult siis, kui üks selle praegu viidatud lõik katab jätkuküsimuse sisusõnad.</li>
          <li><strong>Vastuse sisu:</strong> vastus, <code>sources[]</code>, <code>chart</code>, <code>clarification</code> ja vastuseta olek tulevad samast vastuseobjektist. Kasuta samu renderdajaid ja viitelinke; ära anna vestlusele oma allika- ega diagrammipoliitikat.</li>
          <li><strong>Soovitatud küsimused:</strong> vali need brauseris funktsiooniga <CodeLink path="src/suggestion_context.js">contextualSuggestions</CodeLink> ainult eelnevalt üle vaadatud kandidaatide seast, kasutades jooksvat küsimust, lõime juurküsimust, juba küsitud küsimusi ja valikulist aastafiltrit. Juba küsitud küsimus ei tohi korduda ja sobimatu kandidaat jäetakse välja, mitte ei asendata väljamõeldud täitega. See valik ei tee võrgupäringut, ei kutsu mudelit ega salvesta profiili ega ajalugu.</li>
          <li><strong>Lõime piir:</strong> kuni neli jätkuküsimust, seejärel paku uue vestluse alustamist. Server piirab saadetud konteksti, mitte voorude koguarvu, seega on nelja vooru piir kliendi otsus.</li>
          <li><strong>Seis:</strong> hoia sõnumid, juurküsimus ja kontekst ainult komponendi mälus. „Uus vestlus” tühjendab sõnumid, pooleliolevad päringud ja varasema konteksti; hilinenud vastus ei tohi uude vestlusesse jõuda. Paneeli sulgemine ja uuesti avamine hoiab jooksva lehe sõnumid, lehe uuendamine neid ei taasta. Ära salvesta vestlust ega luba salvestamist kasutajale.</li>
          <li><strong>Tõrked:</strong> jäta viga nähtavaks ja uuesti proovitavaks. Ära asenda tõrget väljamõeldud vastusega ega eelmise vooru tulemusega.</li>
          <li><strong>Ligipääsetavus:</strong> avaja on nimega nupp, paneeli juhtnupud on sildistatud, olekuteade on ekraanilugejale kättesaadav, Escape sulgeb paneeli ja tagastab fookuse avajale, mobiilivaates püsib paneel ekraani piires.</li>
        </ul>
        <p>Vestlus ei muuda põhiotsingu vaadet, marsruute ega Terrapointi iframe'i. Lähtekoht: <CodeLink path="src/App.jsx" />.</p>
      </>,
    },
    {
      id: "vead-ja-piirangud",
      title: "Vead, piirangud ja ohutu taastumine",
      content: <>
        <div className="docs-table" tabIndex={0} role="region" aria-label="HTTP vastuste käsitlemine">
          <table>
            <caption>Ära taanda kõiki olukordi üldiseks võrguveaks</caption>
            <thead><tr><th scope="col">Vastus</th><th scope="col">Kliendi tegevus</th></tr></thead>
            <tbody>
              <tr><td><code>200</code></td><td>Kontrolli sisu: tühi loend, täpsustus või ajutine vastus on võimalik ka eduka HTTP korral.</td></tr>
              <tr><td><code>400</code></td><td>Vigane, tühi või liiga pikk päring, vale lehekülg või filter. Paranda sisendit, ära korda automaatselt.</td></tr>
              <tr><td><code>403</code></td><td>Keelatud brauseri päritolu. Kontrolli sama päritolu marsruutimist ja päiseid.</td></tr>
              <tr><td><code>413 / 415</code></td><td>Liiga suur keha või toetamata andmevorming/tihendus. Kasuta piiratud JSON-keha.</td></tr>
              <tr><td><code>429</code></td><td>Päringusageduse piir. Arvesta <code>Retry-After</code> päist; ära tee tihedat korduskatset.</td></tr>
              <tr><td><code>503</code></td><td>Ajutine vastuvõtu- või ressursipiir. Säilita küsimus ainult jooksvas vaates, oota ja luba uus katse.</td></tr>
              <tr><td><code>502 / 504</code></td><td>Allika või välise teenuse tõrge/ajapiir. Näita ohutut tõrget; ära asenda tõendit vana vastusega.</td></tr>
            </tbody>
          </table>
        </div>
        <p>Voo lugemisel käsitle ka katkist ühendust, osalist vastust ja lõppsündmuseta voogu. Töö ja küsitluse lugemisel käsitle katkist küsitlust, kadunud tööd ja aegunud tähtaega eraldi: tulemuste sündmus võib olla juba käes, seega näita juba kehtivalt saadud tulemusi ainult õige päringu juures ning ära kuuluta poolikut vastust valmis vastuseks.</p>
        <p>Töö vead on eristatavad ja need ei tohi muutuda üldiseks võrguveaks: 400 <code>JOB_INVALID</code>, 404 <code>JOB_NOT_FOUND</code> (tundmatu töö, vale võti või taaskäivituse järel kadunud töö), 409 <code>JOB_CONFLICT</code>, 429 <code>JOB_CAPACITY</code> koos <code>retry_after_ms</code> ja <code>Retry-After</code> päisega ning 503 <code>JOB_CLOSED</code>. Kadunud töö järel tuleb alustada uus otsing, mitte jääda küsitlema.</p>
        <p>Oluline endpoint'ide erinevus: JSON-otsing ja jätkuküsimus võivad ajapiiri või allikatõrke korral anda HTTP 200 sisulise loobumisega. Voo vastuvõtu tõrge enne päiste saatmist on 503. Ainult tulemuste endpoint võib tagastada 429 vastuvõtupiiri, 503 ajapiiri või 502 allikatõrke korral, koos <code>retryable: true</code> ja <code>Retry-After: 2</code>.</p>
        <p>Valesti vormistatud, liiga suure või toetamata JSON-keha korral tagastab API piiratud veateate ega kirjuta päringu sisu parseri logisse. Ühenduse ressursipiir võib siiski katkestada võrguühenduse ilma veakehata.</p>
        <p>Vaikimisi piirangud on kliendiaadressi kohta ühes 60-sekundilises aknas: kogu <code>/api</code> 240 päringut, otsingute rühm 20, soovitused 30, allikastatistika 20 ja Terrapointi rühm 30. Otsingu endpoint'id jagavad sama piirangurühma. Need piirid on protsessipõhised, mitte mitme replika ühine kvoot.</p>
        <p>Koormuspiirid ja otsingu ajapiirid on lisaks päringusageduse piirile. Ühel otsingul on <strong>kaks eraldi kella</strong>, mitte üks ühine taimer. Tulemuste loendi aken algab päringu algusest ja seda juhib <code>SEARCH_DEADLINE_MS</code>; vastuse aken algab alles siis, kui loend on avaldatud, ja seda juhib <code>ANSWER_DEADLINE_MS</code>. Seetõttu ei saa aeglane allikaotsing võtta ära vastuse aega ega aeglane mudel võtta ära juba leitud linke.</p>
        <p>Ühekordne <code>/api/search</code> piirab loendiakent laega <code>JSON_SEARCH_DEADLINE_CEILING_MS</code>, mis on vaikimisi lühem kui voo oma; vastuse aken on ka sellel marsruudil eraldi ja keha hoitakse täitemärkidega elus, et vaikiv ühendus ei lõikaks vastust enne tähtaega. Jätkuküsimus kasutab sama vastuseakent, mis algab uue tõendiotsingu loendi valmimisel.</p>
        <p>Transport peab need aknad ära mahtuma. <code>PUBLIC_RESPONSE_ABSOLUTE_TIMEOUT_MS</code> peab katma loendi akna, vastuse akna ja lõppvastuse reservi ning <code>PUBLIC_RESPONSE_IDLE_TIMEOUT_MS</code> peab olema pikem kui ühekordse otsingu loendi lagi. Kui see ei kehti, keeldub server käivitumast konkreetse põhjuse tekstiga, mitte ei lühenda eelarvet vaikselt päringu ajal. Vaikeväärtused ja nende vahemikud on failis <CodeLink path=".env.example" /> ning leping <CodeLink path="server/request-budget.mjs" /> ja <CodeLink path="server/response-budget.mjs" />.</p>
        <p>Mudelikõne oma taimer on <code>LLM_TIMEOUT_MS</code>. See ei ole sama mis vastuse aken: vastuse aken piirab kogu vastuse etappi, <code>LLM_TIMEOUT_MS</code> ühte teenusepakkuja kutset. Puhverserveri ja kliendi ajapiirid peavad jätma edastuseks varu. Vaikimisi on korraga kuni kaheksa otsingut (<code>SEARCH_MAX_CONCURRENCY</code>), kuni kaks ühe kliendi kohta (<code>SEARCH_MAX_CONCURRENCY_PER_CLIENT</code>) ning piiratud ootejärjekord.</p>
        <p>AI eelarve on libisev aken ning see elab protsessi mälus: <code>LLM_BUDGET_WINDOW_MS</code>, <code>LLM_ROLLING_REQUEST_BUDGET</code> ja <code>LLM_ROLLING_TOKEN_BUDGET</code> piiravad kogu protsessi, <code>LLM_CLIENT_REQUEST_BUDGET</code> ja <code>LLM_CLIENT_TOKEN_BUDGET</code> ühe kliendi osa. Loendurid nullistuvad konteineri taaskäivitusel ega ole mitme replika ühine kvoot. Ammendumine ei katkesta otsingut: uus tasuline kõne jääb tegemata ja alles jääb sama jooksu allikapõhine vastus.</p>
        <p>Ära ava kulukat anonüümset API-d mitme replikaga ilma taristutaseme ühiste piiride ja eelarveta. Kontrollid: <CodeLink path="server/security.mjs" />, <CodeLink path="server/request-budget.mjs" />, <CodeLink path="server/response-budget.mjs" />.</p>
      </>,
    },
    {
      id: "kaivitamine",
      title: "Lokaalne käivitus ja juurutamine",
      content: <>
        <p>Korpuse sünkroonimine loeb 24-tunnise vahega portaali sitemap'i ja heakskiidetud ametlike väljaandjate sitemap'e (keskkonnaagentuur.ee, keskkonnaamet.ee, kliimaministeerium.ee, rmk.ee, www.ilmateenistus.ee, terviseamet.ee, kik.ee). Iga hosti <code>robots.txt</code> kontrollitakse enne lugemist; ühe allika tõrge ei katkesta teisi. Leheteksti täidab taustapartii, mida juhivad <code>CORPUS_CONTINUOUS_BACKFILL</code>, <code>CORPUS_BACKFILL_INTERVAL_MS</code> ja <code>CORPUS_BACKFILL_BATCH_SIZE</code>. Katvust saab kontrollida <CodeLink path="scripts/audit-corpus-coverage.mjs" /> skriptiga; see teeb ainult kirjutuskaitstud päringuid.</p>
        <p>PDF-vormingus ametlikud aruanded läbivad eraldi taustapassi pärast lehekülgede passi, ühe jooksu kohta piiratud arvu dokumente. Konverter on <code>pdftotext</code> ja metaandmete lugeja <code>pdfinfo</code> (<code>poppler-utils</code>); puuduva konverteri korral ei indekseerita ühtegi PDF-i ja põhjus on olekus <code>unavailable</code>. Konversioon on piiratud sisendi baitide, lehtede arvu, säilitatava teksti mahu, seinakella ja korraga jooksva konverterite arvuga. Iga piirang on vastuses olek, mitte erand, ja indeksisse läheb ainult täielik lugemine.</p>
        <p>Indekseerimata jäävad krüpteeritud PDF, skaneeritud ehk tekstikihita PDF, liiga suur või liiga mitme lehega fail, katki jäänud konversioon ja ajapiiri ületanud konversioon. Ebaõnnestunud lugemine on katse: vana tekst võib alles jääda suunavaks lingiks, kuid kaotab tõendiõiguse. Lehepiirid on indeksi sisemine lokaator (<code>metadata.page_locators</code>) ja avalik vastus ei kanna automaatse konversiooni leheküljenumbrit; käsitsi kinnitatud lokaator, näiteks „Lk 22, peatükk 3”, on ainult üle vaadatud väljavõttel.</p>
        <p>Taustakorje ja päringuaegne lehelugemine kontrollivad kumbki oma <code>User-Agent</code> tootetunnusele vastavaid <code>robots.txt</code> ja <code>noindex</code> juhiseid. Nimetatud rühmadest kehtib kõige täpsem; samaväärsed rühmad ühendatakse ja <code>*</code> on varuvariant.</p>
        <p>Kui leht suunab teisele aadressile, kontrollitakse enne sihtlehe lugemist ka selle aadressi avaldaja reegleid. Korduvad <code>X-Robots-Tag</code> päised säilitavad iga lugeja kohta oma ulatuse.</p>
        <p>Madalamakvaliteediline saidikaardikirje ei tohi loetud lehe sisu ega tõendipäritolu üle kirjutada. Varasema vigase päritoluga kirje saab tõendiks tagasi alles pärast uut lubatud lehelugemist; üksnes andmebaasi metaandmete muutmisest ei piisa.</p>
        <p>Edukas lehelugemine jõuab värskendusjärjekorda kuue päeva järel. Ebaõnnestunud värskendus saab pärast seitsmepäevast ooteaega tagasi järjekorda; tegelik lugemisaeg sõltub järjekorrast. Varasemat leheteksti ei kasutata faktitõendina enne uut edukat lugemist. Taustapartii vajab PostgreSQL 16 või uuemat versiooni.</p>
        <p>Otsing kasutab range sõnarühma <code>AND</code>-päringut täpsussignaalina ja laiemat põhimõistete <code>OR</code>-päringut avatud küsimuste leidmiseks; järjestus lisab katvuse ning pealkirja/kokkuvõtte vaste. Avatud kvalitatiivsele küsimusele võib vastata üks ametlik lõik, arvu- ja aastaküsimused jäävad range tõendivärava taha. Avalik vastus ei sisalda sisemist <code>evidenceCandidates</code> välja ega kogu korpuse teksti.</p>
        <p>Dockerfile'i lähtekoht on Node.js 24. Sõltuvused on lukustatud <code>package-lock.json</code> failis. Minimaalne arenduse kontroll ilma vastuse koostamise teenuse ja püsiva vahemäluta:</p>
        <Code>{`npm ci
npm run build
PORT=4174 PROXY_MODE=direct \\
PUBLIC_ORIGIN=http://127.0.0.1:4174 \\
LLM_ENABLED=false SEARCH_CACHE_ENABLED=false npm start`}</Code>
        <p>See käivitus kasutab siiski ametlike allikate võrguühendusi; see ei ole võrguühenduseta tootmislahendus. Korpuse ja püsiva otsinguvahemälu jaoks lisa PostgreSQL vastavalt <CodeLink path="compose.yaml" /> failile. Võimalik vektoriotsing ei ole baaskäivituse eeltingimus.</p>
        <p><code>npm run build</code> valmistab <code>dist/client</code> ja Sitesi üleandmisfailid <code>dist/server/index.js</code> ning <code>dist/.openai/hosting.json</code>. Tavapärane tootmiskäivitus on siiski <code>server/index.mjs</code>; Sitesi worker ei asenda selle otsingu API-d.</p>
        <p><code>npm run eval:live</code> mõõdab ka 15,5 sekundi jõudluseesmärki. Hindamiskliendi 70 sekundi ajapiir jätab pikima otsingutähtaja järel võrguvaru; see ei muuda serveri enda tähtaega.</p>
        <p>Andmebaasi skeemi algseadistus toimub <CodeLink path="server/database.mjs">andmekihis</CodeLink>. Enne ametlikku juurutamist lepi kokku kontrollitud skeemimuudatuste, varukoopiate ja taastamise kord. Sünkroonimise käsurealiides on <CodeLink path="server/sync-corpus.mjs" /> ja hooldusjuhend <CodeLink path="docs/IT-HOOLDUS.md" />.</p>
        <p>Kasuta eraldi andmebaasi: algseadistus loob ja muudab projekti tabeleid, indeksid ning laiendused <code>pg_trgm</code> ja <code>unaccent</code>. Ainult SELECT/INSERT õigustest ei piisa. Korpuse <code>practice_corpus_*</code> tabelid ja päringuvahemälu <code>practice_search_*</code> tabelid ei ole portaali olemasoleva sisuskeemi asendus.</p>
        <p>Tervisekontroll ega konteineri valmidus ei oota korpuse ega andmebaasi migratsiooni valmimist. Kontrolli pärast juurutamist eraldi allikakihi tegelikku tööd ja vähemalt üht päris otsingut.</p>
        <p>Praktikaprojekti praegune <CodeLink path=".github/workflows/deploy.yml">GitHub Actionsi töövoog</CodeLink> käivitab main-haru push'il Coolify juurutuse. Ära tõsta selle praktikakeskkonna aadresse ega ligipääse portaali tootmiskeskkonda. Vastuvõttev meeskond peab määrama oma juurutus- ja tagasipöördumisprotsessi.</p>
      </>,
    },
    {
      id: "seadistus-ja-turve",
      title: "Keskkonnaseadistus ja turvapiir",
      content: <>
        <p>Täielik muutujate näidis on <CodeLink path=".env.example" />. Alljärgnev on integratsiooni jaoks oluline valik, mitte täielik konfiguratsiooniregister. Saladuste väärtused määra käituskeskkonnas; neid ei tohi lisada brauseripakki, dokumentatsiooni ega repositooriumisse.</p>
        <div className="docs-table" tabIndex={0} role="region" aria-label="Keskkonnamuutujad">
          <table>
            <caption>Peamised seadistusvaldkonnad</caption>
            <thead><tr><th scope="col">Muutuja</th><th scope="col">Tähendus</th></tr></thead>
            <tbody>
              <tr><td><code>PORT</code></td><td>Teenuse kuulamisport; vaikimisi 3000.</td></tr>
              <tr><td><code>PUBLIC_ORIGIN</code></td><td>Täpne avalik päritolu, kaasa arvatud skeem ja vajadusel port.</td></tr>
              <tr><td><code>PROXY_MODE</code></td><td><code>direct</code> või <code>trusted</code>. Tootmises tuleb režiim ja avalik päritolu selgelt määrata.</td></tr>
              <tr><td><code>TRUSTED_PROXY_CIDRS</code></td><td>Usaldatud sisenevate puhverserverite aadressid, mitte kõigi internetiklientide usaldus.</td></tr>
              <tr><td><code>DATABASE_URL</code></td><td>Serveripoolne PostgreSQL ühendus; ära saada seda klienti.</td></tr>
              <tr><td><code>SEARCH_HASH_SECRET</code></td><td>Eraldi juhuslik, vähemalt 32 baidi tugevune Base64/Base64URL saladus päringusõrmejälgede jaoks. Nõutav, kui andmebaas on seadistatud, ka keelatud vastusevahemäluga.</td></tr>
              <tr><td><code>DATABASE_SSL_MODE</code></td><td>Kaugandmebaasi jaoks <code>verify-full</code> ja vajadusel <code>DATABASE_SSL_CA</code>. Krüpteerimata ühendus on lubatud ainult kontrollitud lokaalsele või selgelt lubatud hostile.</td></tr>
              <tr><td><code>LLM_ENABLED</code></td><td>Vastuse koostamise teenuse kasutamine. Väärtus <code>false</code> keelab selle.</td></tr>
              <tr><td><code>LLM_API_KEY</code></td><td>Ainult serveri runtime-saladus: autenditud Codex gateway bearer. OpenAI Codex OAuth jääb hosti OMP auth brokerisse ja gateway'sse; seda ei kopeerita rakendusse. Võtit ei anta API tarbijale ega brauserile.</td></tr>
              <tr><td><code>LLM_BASE_URL</code>, <code>LLM_MODEL</code></td><td><code>https://terrapoint.arle.top/v1</code> ja <code>openai-codex/gpt-6-luna</code>. Transport on alati Responses API, teist varumudelit ei kasutata; reasoning on <code>low</code>. Ühe mudelikõne taimer on <code>LLM_TIMEOUT_MS</code>; selle väärtust ei kinnitata siin dokumendis, vaid käituskeskkonnas ja failis <CodeLink path=".env.example" />.</td></tr>
              <tr><td><code>SEARCH_DEADLINE_MS</code>, <code>ANSWER_DEADLINE_MS</code></td><td>Kaks eraldi kella: tulemuste loend ja vastus. Vastuse aken algab alles loendi avaldamisel. Ühekordsel <code>/api/search</code> marsruudil piirab loendit lisaks <code>JSON_SEARCH_DEADLINE_CEILING_MS</code>.</td></tr>
              <tr><td><code>PUBLIC_RESPONSE_IDLE_TIMEOUT_MS</code>, <code>PUBLIC_RESPONSE_ABSOLUTE_TIMEOUT_MS</code></td><td>Avaliku transpordi lagi. Absoluutne lagi peab katma loendi akna, vastuse akna ja lõppvastuse reservi; vastasel korral server ei käivitu.</td></tr>
              <tr><td><code>LLM_BUDGET_WINDOW_MS</code>, <code>LLM_ROLLING_REQUEST_BUDGET</code>, <code>LLM_ROLLING_TOKEN_BUDGET</code>, <code>LLM_CLIENT_REQUEST_BUDGET</code>, <code>LLM_CLIENT_TOKEN_BUDGET</code></td><td>Protsessisisesed libiseva akna mudelieelarved. Loendurid kaovad taaskäivitusel ega ole replikate vahel jagatud; väärtus <code>0</code> või <code>off</code> lülitab vastava piiri välja.</td></tr>
              <tr><td><code>ALL_ENVIRONMENT_SEARCH_ENABLED</code></td><td>Vaikimisi <code>false</code>: AI vastus ainult Eesti metsateemadel, muudel teemadel jääb allikate loend. <code>true</code> taastab kõik keskkonnateemad ja nõuab eraldi sisu- ja kvaliteedikontrolli.</td></tr>
              <tr><td><code>SEARCH_CACHE_ENABLED</code></td><td>Püsiva vastusevahemälu kasutamine; <code>false</code> keelab selle.</td></tr>
              <tr><td><code>MULTILINGUAL_SEARCH_ENABLED</code></td><td>Vaikimisi keelatud. Ära lülita ametlikus üleandmises sisse ilma eraldi keelekvaliteedi kontrollita.</td></tr>
              <tr><td><code>APP_REVISION</code></td><td>Juurutatud koodi commit'i identifikaator tervisekontrollis; erineb kliendi build'i identifikaatorist.</td></tr>
            </tbody>
          </table>
        </div>
        <p>Päritolu kontroll kasutab muu hulgas <code>Origin</code> ja <code>Sec-Fetch-Site</code> päiseid. Hoia need puhverserveris alles. Serveritevaheline klient võib brauseripäised puududa lasta, kuid peab endiselt saatma JSON-meediatüübi; see ei anna talle autentitud kasutaja rolli.</p>
        <p>Vastuse koostamise <code>LLM_BASE_URL</code> ei ole suvalise teenuse URL-i seadistus: praegune poliitika lubab ainult täpset gateway alust <code>https://terrapoint.arle.top/v1</code>. Responses marsruut on <code>/v1/responses</code>. Teenuse või mudeli vahetamine vajab eraldi turva-, privaatsus- ja vastusekvaliteedi kontrolli. Coolify Dockerfile-runtime'i muutujad tuleb seadistada eraldi; Compose'i muutmine ei muuda tootmise keskkonda.</p>
        <p><code>trusted</code> režiimis on <code>TRUSTED_PROXY_CIDRS</code> kohustuslik; kogu internetti hõlmav CIDR ei ole lubatud. Avalik päritolu peab kasutama HTTPS-i, välja arvatud sõnaselge loopback-arenduskeskkond. Ka brauseri <code>same-site</code> päring lükatakse tagasi, kui see ei ole sama päritolu.</p>
        <p>Ära kasuta pimesi <code>trust proxy=true</code>. Valesti usaldatud edastuspäis võib rikkuda kliendiaadressi, päringupiirid või HTTPS-suunamise. Valideeri seadistus oma tegeliku proxy-topoloogia peal, mitte ainult arendusmasinas.</p>
        <p>Kui relee koondab kõik külastajad üheks kliendiaadressiks, jagavad nad ka otsingu- ja koormuskvoote. Vaikimisi arvestatakse IPv6 kliente /64 prefiksi järgi. Säilita õige kliendi identiteet ainult usaldatud päiseahela kaudu.</p>
        <p>CSP lubab skripte ja API-ühendusi oma päritolust; Terrapoint ja OpenStreetMap on piiratud iframe-erandid. Pilootkeskkond saadab <code>noindex, nofollow</code>. Need on praegused kaitsepiirid, mitte portaali lõpliku indekseerimis- või raamimise poliitika.</p>
        <p>Väliste allikate päringud peavad jääma olemasoleva lubatud HTTPS-allikate kontrolli taha. Ära lisa suvalise URL-i proxy't ega eemalda SSRF-kaitset, et integratsiooni lihtsustada. Lähtekohad: <CodeLink path="server/security.mjs" />, <CodeLink path="server/public-https.mjs" />, <CodeLink path="server/provider-policy.mjs" />.</p>
      </>,
    },
    {
      id: "andmed-ja-privaatsus",
      title: "Andmeallikad ja privaatsus",
      content: <>
        <p>Vastuse tõend peab kuuluma samasse värskesse, filtreeritud ja relevantsusjärjestatud tulemuste kogumisse, mida kasutajale näidatakse. Sobimatu allika pealkiri või käsitsi lisatud teemamärgend ei anna õigust faktivastuseks.</p>
        <p><CodeLink path="server/evidence-pack.mjs">Üks muutumatu tõendipakk</CodeLink> reserveerib planeerija nõutud rollide terviklõigud enne valikulisi lõike: kuni kümme allikat, 4000 märki allika kohta ja 36 000 märki koos serialiseeritud metaandmetega. Mudel, kohalik grounding ja avalik kasutatud viite <code>evidenceExcerpt</code> tarbivad sama paki sisu; teist kärpivat akent ei arvutata.</p>
        <p>Iga kopeeritud allikas kannab allikapoliitika otsust (<CodeLink path="server/source_policy.mjs" />, versioon <code>source-policy-v1</code>). <code>robots.txt</code> keeld või <code>noindex</code> välistab teksti; <code>nosnippet</code> ja <code>max-snippet:0</code> võtavad ära nii lühiväljavõtte kui mudeli tõendi; lõplik <code>max-snippet</code> piirab mõlemat sama märgialani; <code>noarchive</code> jätab alles lingi ja metaandmed, kuid ei säilita teksti; <code>data-nosnippet</code> lõigud eemaldatakse enne tekstieraldust. Tundmatu üksikdirektiiv, näiteks <code>noai</code>, jääb vaatluseks ega otsusta midagi, kuid puuduv, loetamatu, mitmeti tõlgendatav, aegunud või tundmatu versiooniga poliitika käitub keeluna, seega varem lubatud tekst ei jää tõendiks, kui värske lugemine juhist ei kinnita.</p>
        <p>Piirid on kihilisid ja kitsam võidab: tulemuse kirjeldus kuni 500 märki, mudeli tõendipakk kuni 4 000 märki allika kohta ja 36 000 märki kogu paki kohta ning avaldaja <code>max-snippet</code> võib neid mõlemaid vähendada. Need arvud on koodis olemas; ära suurenda neid dokumendimuudatusega.</p>
        <p>Need juhised on avaldaja palve, mitte litsents. Lubav <code>robots.txt</code>, avalik URL ega lubav <code>X-Robots-Tag</code> ei anna õigust sisu taaskasutada, ja õiguste ülevaate olek jääb <code>unreviewed</code>, kuni on olemas viide tegelikule õiguste kontrollile. Google'i dokumentatsioon kirjeldab nende juhiste tähendust Google'i enda tulemustes; teised otsijad ja meie oma koopia ei ole sellega seotud. Enne riiklikku kasutuselevõttu tuleb allikate kasutusõigused eraldi kokku leppida.</p>
        <p>Üldine metsavaade nõuab päris mõõtetulemust, statistilist meetodit, mitmemõõtmelist seisundit ja kinnistu/metsaeraldise ulatusega registriandmeid. Metsateatiste raiekavatsus või üldine mõõtmete sõnaloend ei täida tervet rolli. Ainult täieliku praeguse läbi vaadatud rollikomplekti ja uusima füüsiliselt kontrollitud SMI väljaande korral võib server jätta tarbetu live-avastuse ootamise ära; filtrid, nähtav liikmelisus ja freshness kontrollitakse ka korpuse ühendamise järel ning ühine ajapiir jääb samaks.</p>
        <p>Numberlingi tooltip ja allikate legend annavad igast tegelikult viidatud allikast lühikese eelvaate, algallikalingi, kuupäevade tähenduse ja lokaatori. Suuremaid tõendiplokke privaatsel avataval plokil tuua pole vaja; avalik kasutaja küsib vastuse täpsustusi uuesti. Numberlingi tooltip jääb eelvaateks ja renderdatakse tavalise tekstina, mitte HTML-ina; metadata-only kaart ei saa väljamõeldud tõendiplokki.</p>
        <p><CodeLink path="server/delivered-outcome.mjs">Lõppvastuse päritolu</CodeLink> määratakse pärast nähtava tõendi kontrolli ja avalikku serialiseerimist. AI märgis nõuab tegelikult säilinud uut toetatud väidet: mustandi koopia, muutmata sissejuhatus või pelk kirjavahemärgiga ühendus ei piisa. Privaatne provider-katse ei leki API-sse; seotud küsimused pärinevad kohalikust läbi vaadatud sisust, mitte eemaldatud mudeliskeemist.</p>
        <p><code>privacy-safe-v7</code> cache hoiab allika avaldamise, uuendamise, andmeaasta, andmete seisu ja lokaatori lahus ning sama versiooni juures. Teadmata kontrolliaeg jääb <code>null</code>; leheuuendus ei ole väljaande avaldamine ega uus andmeaasta.</p>
        <p>Vastusevahemällu pääseb ainult sama päringu autentse lõppotsusega seotud mudelieelne deterministlik hetkeseis. Mudeli proosat, toorpäringut ja päringust moodustatud pealkirja ei talletata; kopeeritud lõppotsus ei saa kirjutusluba. Avalike allikafaktide tavaline teemasõnakattuvus ei ole päringuleke. Tundlike identifikaatorite välistus, päringut kandvate URL-ide/lokaatorite fragmendikontroll ja kõigi väljade piiratud fikspunktidekodeerimine säilivad.</p>
        <p>Mudeli süsteemijuhis püsib eri küsimustel sama. Tõendid paiknevad sisendis enne muutuvat küsimust ja vestluskonteksti, et sama tõendipaki prefiksit saaks teenusepakkuja vahemälus korduskasutada. See ei garanteeri provider'i cache-tabamust. Täieliku paaritatud allikatõendi puhul ei tehta tarbetut mudelikõnet.</p>
        <p>Avalik otsing välistab Statistikaameti avaldajana. Ajalooliste adapterite olemasolu testides ei tähenda, et need oleksid avaliku otsingu varuallikad. Metsa arvuliste vastuste ja diagrammide jaoks kasuta kontrollitud Keskkonnaagentuuri SMI ridu; sobiva andmerea puudumisel jäta diagramm ära.</p>
        <p>OpenAI töötleb autenditud Codex gateway kaudu avalikku küsimust ja piiratud allikaväljavõtteid. Praegune piir on kuni kümme väljavõtet, kokku 36 000 märki, ja jätkuküsimusel kuni 1 400 märki küsimuste konteksti. IP-aadressi, küpsiseid, OAuth-i ega serverisaladusi mudeli sisendile ei lisata. Gateway ei anna mudelile Terrapointi andmeid. <code>store: false</code> ja keelatud tracing ei tõenda teenusepakkuja ega gateway säilitustingimusi; kontrolli need enne ametlikku kasutuselevõttu eraldi.</p>
        <p>Rakenduse otsingu- ja vahemälutabelites kasutatakse toorpäringu asemel serveripoolse võtmega sõrmejälge ning ajaliselt piiratud koondandmeid. See ei kata automaatselt teenusepakkuja, puhverserveri ega sinu lisatud logisid. Keela päringu sisu logimine; määra säilitustähtajad, ligipääs ja kustutamine enne ametlikku kasutuselevõttu.</p>
        <p><CodeLink path="PRIVAATSUS.md">Privaatsuse tehniline ülevaade</CodeLink> kirjeldab praegust teenusepiiri. Teenuse tingimused, andmetöötlusleping ja võimalik mõjuhinnang tuleb vastuvõtva organisatsiooniga üle kontrollida; prototüüp ei tõesta iseenesest nõuetele vastavust.</p>
        <p>Vanemad arhitektuuri-, QA- ja privaatsusdokumendid sisaldavad ajaloolisi teenuse- ja mudelinimesid ning varasemaid kasutajaliidese kirjeldusi. Need ei tõesta praeguse käituskeskkonna mudelit ega selle säilitustingimusi. Kontrolli kehtivat seadistust turvaliselt ja valideeri konkreetse teenuse tingimused uuesti; lähtekood ja see kuupäevastatud API-juhend on tehnilise lepingu lähtekoht.</p>
        <p>Allikaregister: <CodeLink path="server/source-registry.mjs" />. Vahemälu ja säilitamine: <CodeLink path="server/database.mjs" />. Aastahooldus: <CodeLink path="docs/IT-HOOLDUS.md" />.</p>
      </>,
    },
    {
      id: "uleandmise-kontroll",
      title: "Üleandmise kontrollnimekiri",
      content: <>
        <ol>
          <li><strong>API leping:</strong> proovi päris portaali päritolust otsingut, soovitusi, filtrit, lehekülge ja jätkuküsimust. Kontrolli vale keha, liiga pikka küsimust ning keelatud päritolu.</li>
          <li><strong>Vastuse transport:</strong> töö loomine ja lühiküsitlus annavad tulemused enne vastust, tühistamine töötab ning vana vastus ei ilmu uue küsimuse alla. Kontrolli katkist küsitlust, kadunud tööd pärast taaskäivitust, aegunud tähtaega ja ülekoormust. Proovi ka ühilduvat NDJSON-voogu ja ühekordset JSON-liidest eraldi, sest nende eelarved on edge'i piiri suhtes endiselt lahtised.</li>
          <li><strong>Viited:</strong> nummerdatud HTTPS-viited avavad õiged algallikad; vastuse ja diagrammi tõendid on samas tulemuste loendis.</li>
          <li><strong>Keele- ja ulatuspiir:</strong> eestikeelne faktivastus on tootmises piiratud Eesti metsateemadega; muudel keskkonnateemadel kontrolli allikate loendit.</li>
          <li><strong>Mobiil ja ligipääsetavus:</strong> otsing on esimeses mobiilivaates, soovitused töötavad klaviatuuriga, fookus on nähtav ja Terrapointi iframe ei liiguta esmast lehevaadet.</li>
          <li><strong>Versioon:</strong> <code>/api/health</code> revision vastab juurutatud commit'ile; lehe, <code>/build.json</code> ja API build kattuvad. Testi ka enne juurutust avatud vana lehte.</li>
          <li><strong>Taristu ja andmetöötlus:</strong> saladused on ainult serveris, proxy päised kontrollitud, kvoodid ühised seal, kus vaja, ja logid ei kogu vabateksti. Andmebaasi varukoopia taastamine on proovitud, kuid serverist eraldi paiknev sihtkoht, ligipääs ja säilitus on veel kokku leppimata.</li>
          <li><strong>Vastutav meeskond ja vastuvõtt:</strong> kinnita vastutav töötleja ja avalik kontakt, jälgimine, aastane allikahooldus, tagasipöördumine, ligipääsetavuse avaldus ning sõltumatu turva- ja ligipääsetavuskontroll. Neid otsuseid see juhend ei tee ega esita tehtuna.</li>
        </ol>
        <Code>{`npm test
npm run build
npm run test:sites
npm run eval:live -- --base-url=https://praktika.arle.top
npm run audit:filters -- --base-url=https://praktika.arle.top`}</Code>
        <p>Viimased kaks käsku kontrollivad praktikakeskkonda. Vastuvõtutestis asenda päritolu kokkulepitud testkeskkonnaga; ära koorma ametlikku tootmist ilma kontrollitud testiaknata. <code>npm test</code> lülitab mitmekeelse testikihi sisse, kuid <CodeLink path="tests/estonian-only.test.mjs">vaikerežiimi test</CodeLink> kontrollib eraldi eestikeelset tootmispiiri.</p>
        <p>Need on esimese väljaande üleandmiskriteeriumid, mitte garantii iga välise allika katkematu töö kohta. Täienda integratsioonilepingut vastuvõtva meeskonna tegelike otsuste ja testitulemustega.</p>
        <p>Ükski riigiasutus ei ole seda praktikalahendust vastu võtnud, tellinud ega kinnitanud. Puuduvad kinnitatud vastutav töötleja ja kontakt, serverist eraldi paiknev varukoopia sihtkoht, avaldatud ligipääsetavuse avaldus ning sõltumatu vastuvõtukontroll. Need on vastuvõtva organisatsiooni otsused, mida ei asenda see dokument ega tehniline tõend.</p>
      </>,
    },
  ],
};
