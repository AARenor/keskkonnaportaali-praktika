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
        <p>Tulemused võivad ilmuda enne vastuse valmimist. Otsingu ajal ei pea lehte uuesti laadima.</p>
        <p>„Tühjenda otsing” eemaldab sisestatud teksti, kuid ei kustuta juba kuvatud tulemusi. Uus küsimus käivitab uue otsingu.</p>
        <p>Otsing töötab praegu eesti keeles. Konto loomist ega sisselogimist selle otsingu kasutamiseks ei ole.</p>
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
          <li><strong>„Andmed:”</strong> näitab andmeaastat; <strong>„Uuendatud:”</strong> lehe teadaolevat muutmisaega ning selle puudumisel <strong>„Avaldatud:”</strong> avaldamisaega.</li>
        </ul>
        <p>„Uusim leheuuendus” tähendab võrdlust teadaolevate lehe uuendamiskuupäevade vahel. See ei tähenda, et kõik selles allikas esitatud andmed oleksid sama aasta kohta.</p>
        <p>Olulise arvu juures kontrolli algallikast aastat, ühikut ja mõistet. Näiteks metsamaa pindala ei ole sama mis metsaga kaetud metsamaa ehk puistute pindala.</p>
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
        <p>Ühes vastuse jätkuküsimuste lõimes saab teha kuni neli jätku, iga küsimus kuni 180 märki. Ka „Küsi veel” valiku kasutamine loetakse jätkuks. Kui piir saab täis või alustad teist teemat, esita uus küsimus peamises otsingukastis.</p>
        <p>Jätkuvastus ilmub algse vastuse alla oma viidetega. Allpool olev lai tulemuste loend jääb algse küsimuse loendiks; jätkuvastuse algallikaid kontrolli selle enda nummerdatud viidetest.</p>
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
        <p>Metsastatistika vastuste ja diagrammide põhiallikas on Keskkonnaagentuuri SMI. Puuduv aasta ei tähenda nulli ning värskeim avaldatud aasta ei pruugi olla käesolev aasta.</p>
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
        <p>Vastuse koostamise teenusele võidakse saata küsimus, kuni kümme valitud avaliku allika väljavõtet (kokku kuni 36 000 märki) ja jätkuküsimuse korral kuni 1 400 märki varasemate küsimuste konteksti. Sellele teenusele ei lisata sinu IP-aadressi, küpsiseid ega kogu andmekogu.</p>
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
              <tr><td><code>POST /api/search/stream</code></td><td>Brauseri põhivoog: tulemused enne vastust; NDJSON.</td></tr>
              <tr><td><code>POST /api/search</code></td><td>Vastus ja tulemused ühe JSON-objektina.</td></tr>
              <tr><td><code>POST /api/search/results</code></td><td>Ainult lehekülgede ja filtritega tulemuste loend.</td></tr>
              <tr><td><code>POST /api/search/follow-up</code></td><td>Uue tõendiotsinguga jätkuküsimus; JSON-vastus.</td></tr>
              <tr><td><code>POST /api/suggestions</code></td><td><code>{'{q}'}</code> → <code>{'{suggestions: [{value, count}]}'}</code>, kuni viis valikut. Piir 80 märki; alla kahe märgi korral tühi loend.</td></tr>
              <tr><td><code>GET /api/health</code></td><td>Protsessi tervis, <code>revision</code> ja aeg; ei tõesta kõigi sõltuvuste töökorda.</td></tr>
              <tr><td><code>GET /api/health/container-readiness</code></td><td>Konteineri vastuvõtuvalmidus; sulgemisel HTTP 503.</td></tr>
              <tr><td><code>GET /api/corpus</code></td><td>Allikakihi koondstatistika, mitte dokumentide eksport.</td></tr>
            </tbody>
          </table>
        </div>
        <p>POST-päringud peavad kasutama <code>Content-Type: application/json</code>. JSON-keha ülempiir on 32 KiB, tihendatud keha ei toetata. Küsimus <code>q</code> on nõutav ning pärast normaliseerimist kuni 180 märki. Kasuta <code>page</code> vahemikus 1–500 ja <code>page_size</code> vahemikus 1–50; vaikimisi 1 ja 12.</p>
        <p>Otsingu ja soovituste GET-alias'e ei ole. Küsimus tuleb JSON-kehast; lehekülge ja filtreid saab anda ka päringuparameetrites, kuid lihtsama ja üheselt mõistetava integratsiooni jaoks hoia need kõik kehas.</p>
        <Code>{`curl --fail-with-body --max-time 20 \\
  -X POST 'https://praktika.arleserver.cfd/api/search' \\
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
        <p>Loendi loenduriks kasuta <code>searchResults.total</code>; see ei ole garanteeritud ammendav kogu veebi vastete arv. Lehitsemine teeb uue otsingu, mitte ei loe külmutatud tulemuste hetkeseisu. <code>updatedAt</code> on loendi koostamise aeg, mitte allikalehe uuendamiskuupäev.</p>
        <p>Teksti ei tohi renderdada kontrollimata HTML-ina. Kasuta tavalist tekstirenderdust ning <CodeLink path="src/url-safety.js">välislinkide valideerimist</CodeLink>. Avalikust vastusest ei tohi tuletada ega kuvada teenusepakkujat, mudelit või sisemist ühendusolekut.</p>
        <p><code>chart.kind</code> on praegu <code>line</code>, <code>bar</code> või <code>share</code>. Diagrammil on pealkiri, ühik, andmeseeriad, <code>citation</code> ja valikuline <code>caption</code>; punktidel on <code>x</code> ning <code>y</code>, ja jaotusdiagrammil ka silt. Kui diagramm puudub või ei läbi kontrolli, jäta see kuvamata.</p>
        <p>Leping ja näited: <CodeLink path="server/pipeline.mjs" />, <CodeLink path="server/retrieval.mjs" />, <CodeLink path="server/answer-chart.mjs" />, <CodeLink path="tests/search-stream.test.mjs" />.</p>
      </>,
    },
    {
      id: "voog-ja-tuhistamine",
      title: "Järkjärguline vastus ja tühistamine",
      content: <>
        <p><code>/api/search/stream</code> vastuse tüüp on <code>application/x-ndjson</code>. See ei ole SSE ega üks JSON-dokument. Iga rida on eraldi JSON-objekt; võrgu andmeplokk võib lõppeda ka rea või UTF-8 märgi keskel.</p>
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
        <p>JSON-näide ei asenda täielikku voogedastusega brauseriklienti. Võta build'i kontroll, tühistamine ja tühjad olekud üle <CodeLink path="src/App.jsx">olemasolevast kliendist</CodeLink>.</p>
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
        <p>Voo lugemisel käsitle ka katkist ühendust, osalist vastust ja lõppsündmuseta voogu. Näita juba kehtivalt saadud tulemusi ainult õige päringu juures ning ära kuuluta poolikut vastust valmis vastuseks.</p>
        <p>Oluline endpoint'ide erinevus: JSON-otsing ja jätkuküsimus võivad ajapiiri või allikatõrke korral anda HTTP 200 sisulise loobumisega. Voo vastuvõtu tõrge enne päiste saatmist on 503. Ainult tulemuste endpoint võib tagastada 429 vastuvõtupiiri, 503 ajapiiri või 502 allikatõrke korral, koos <code>retryable: true</code> ja <code>Retry-After: 2</code>.</p>
        <p>Valesti vormistatud või liiga suure JSON-keha veavastus ei ole tingimata JSON: serveril pole parserivea jaoks kohandatud JSON-käsitlejat. Ka ühenduse ressursipiir võib katkestada võrguühenduse ilma veakehata. Ära eelda kõigi tõrgete puhul <code>{'{error}'}</code> struktuuri.</p>
        <p>Vaikimisi piirangud on kliendiaadressi kohta ühes 60-sekundilises aknas: kogu <code>/api</code> 240 päringut, otsingute rühm 20, soovitused 30, allikastatistika 20 ja Terrapointi rühm 30. Otsingu endpoint'id jagavad sama piirangurühma. Need piirid on protsessipõhised, mitte mitme replika ühine kvoot.</p>
        <p>Koormuspiirid ja otsingu ajapiirid on lisaks päringusageduse piirile. JSON-otsingu ajapiiri ülempiir on 12 sekundit; voo vaikimisi otsingueelarve on 15 sekundit. Puhverserveri ja kliendi ajapiirid peavad jätma edastuseks varu. Vaikimisi on korraga kuni kaheksa otsingut, kuni kaks ühe kliendi kohta ning piiratud ootejärjekord.</p>
        <p>Ära ava kulukat anonüümset API-d mitme replikaga ilma taristutaseme ühiste piiride ja eelarveta. Kontrollid: <CodeLink path="server/security.mjs" />, <CodeLink path="server/request-budget.mjs" />, <CodeLink path="server/response-budget.mjs" />.</p>
      </>,
    },
    {
      id: "kaivitamine",
      title: "Lokaalne käivitus ja juurutamine",
      content: <>
        <p>Dockerfile'i lähtekoht on Node.js 24. Sõltuvused on lukustatud <code>package-lock.json</code> failis. Minimaalne arenduse kontroll ilma vastuse koostamise teenuse ja püsiva vahemäluta:</p>
        <Code>{`npm ci
npm run build
PORT=4174 PROXY_MODE=direct \\
PUBLIC_ORIGIN=http://127.0.0.1:4174 \\
LLM_ENABLED=false SEARCH_CACHE_ENABLED=false npm start`}</Code>
        <p>See käivitus kasutab siiski ametlike allikate võrguühendusi; see ei ole võrguühenduseta tootmislahendus. Korpuse ja püsiva otsinguvahemälu jaoks lisa PostgreSQL vastavalt <CodeLink path="compose.yaml" /> failile. Võimalik vektoriotsing ei ole baaskäivituse eeltingimus.</p>
        <p><code>npm run build</code> valmistab <code>dist/client</code> ja Sitesi üleandmisfailid <code>dist/server/index.js</code> ning <code>dist/.openai/hosting.json</code>. Tavapärane tootmiskäivitus on siiski <code>server/index.mjs</code>; Sitesi worker ei asenda selle otsingu API-d.</p>
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
              <tr><td><code>OPENCODE_GO_API_KEY</code>, <code>OPENCODE_ZEN_API_KEY</code>, <code>LLM_API_KEY</code></td><td>Vastuse koostamise teenuse serveripoolsed keskkonnamuutujad selles eelistusjärjekorras. Ühtegi väärtust ei anta API tarbijale ega brauserile.</td></tr>
              <tr><td><code>SEARCH_CACHE_ENABLED</code></td><td>Püsiva vastusevahemälu kasutamine; <code>false</code> keelab selle.</td></tr>
              <tr><td><code>MULTILINGUAL_SEARCH_ENABLED</code></td><td>Vaikimisi keelatud. Ära lülita ametlikus üleandmises sisse ilma eraldi keelekvaliteedi kontrollita.</td></tr>
              <tr><td><code>APP_REVISION</code></td><td>Juurutatud koodi commit'i identifikaator tervisekontrollis; erineb kliendi build'i identifikaatorist.</td></tr>
            </tbody>
          </table>
        </div>
        <p>Päritolu kontroll kasutab muu hulgas <code>Origin</code> ja <code>Sec-Fetch-Site</code> päiseid. Hoia need puhverserveris alles. Serveritevaheline klient võib brauseripäised puududa lasta, kuid peab endiselt saatma JSON-meediatüübi; see ei anna talle autentitud kasutaja rolli.</p>
        <p>Vastuse koostamise <code>LLM_BASE_URL</code> ei ole suvalise teenuse URL-i seadistus: praegune poliitika lubab ainult <code>https://opencode.ai</code> päritolu. Teenuse või mudeli vahetamine vajab eraldi turva-, privaatsus- ja vastusekvaliteedi kontrolli.</p>
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
        <p>Avalik otsing välistab Statistikaameti avaldajana. Ajalooliste adapterite olemasolu testides ei tähenda, et need oleksid avaliku otsingu varuallikad. Metsa arvuliste vastuste ja diagrammide jaoks kasuta kontrollitud Keskkonnaagentuuri SMI ridu; sobiva andmerea puudumisel jäta diagramm ära.</p>
        <p>Kasutaja küsimus ja piiratud allikaväljavõtted võivad liikuda välise vastuse koostamise teenuse juurde. Praegune piir on kuni kümme väljavõtet, kokku 36 000 märki, ja jätkuküsimusel kuni 1 400 märki küsimuste konteksti. IP-aadressi ja küpsiseid sellele päringule ei lisata.</p>
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
          <li><strong>Voog:</strong> tulemused saabuvad enne vastust, tühistamine töötab ning vana vastus ei ilmu uue küsimuse alla. Kontrolli ka katkist voogu ja ülekoormust.</li>
          <li><strong>Viited:</strong> nummerdatud HTTPS-viited avavad õiged algallikad; vastuse ja diagrammi tõendid on samas tulemuste loendis.</li>
          <li><strong>Keele- ja ulatuspiir:</strong> eestikeelsed keskkonnaküsimused töötavad; inglise ja vene päringud ei saa vaikerežiimis põhjendamatut faktivastust.</li>
          <li><strong>Mobiil ja ligipääsetavus:</strong> otsing on esimeses mobiilivaates, soovitused töötavad klaviatuuriga, fookus on nähtav ja Terrapointi iframe ei liiguta esmast lehevaadet.</li>
          <li><strong>Versioon:</strong> <code>/api/health</code> revision vastab juurutatud commit'ile; lehe, <code>/build.json</code> ja API build kattuvad. Testi ka enne juurutust avatud vana lehte.</li>
          <li><strong>Taristu ja andmetöötlus:</strong> saladused on ainult serveris, proxy päised kontrollitud, kvoodid ühised seal, kus vaja, varukoopia taastatav ja logid ei kogu vabateksti.</li>
          <li><strong>Vastutav meeskond:</strong> kinnita jälgimine, kontakt, aastane allikahooldus ja tagasipöördumine. Neid otsuseid see juhend ei tee.</li>
        </ol>
        <Code>{`npm test
npm run build
npm run test:sites
npm run eval:live -- --base-url=https://praktika.arleserver.cfd
npm run audit:filters -- --base-url=https://praktika.arleserver.cfd`}</Code>
        <p>Viimased kaks käsku kontrollivad praktikakeskkonda. Vastuvõtutestis asenda päritolu kokkulepitud testkeskkonnaga; ära koorma ametlikku tootmist ilma kontrollitud testiaknata. <code>npm test</code> lülitab mitmekeelse testikihi sisse, kuid <CodeLink path="tests/estonian-only.test.mjs">vaikerežiimi test</CodeLink> kontrollib eraldi eestikeelset tootmispiiri.</p>
        <p>Need on esimese väljaande üleandmiskriteeriumid, mitte garantii iga välise allika katkematu töö kohta. Täienda integratsioonilepingut vastuvõtva meeskonna tegelike otsuste ja testitulemustega.</p>
      </>,
    },
  ],
};
