# Design QA

## Kontrolli ulatus

Kontroll tehti Google Chrome'i päris brauserirenderdusega mõõtudel 1440 × 1100 ja 390 × 844. Lähteportaali identiteet, kohalikud päris pildid, logo, Rubik/Roboto tüpograafia ja kolmerealine desktop-header jäid varasemast kloonist alles. Selle iteratsiooni fookus oli otsingu kasutusvoo parandamine.

Kõik pildid kasutavad Playwrighti `scale: css` seadistust. Enne ja pärast sama oleku kuvatõmmised pandi üheks võrdluspildiks ning hinnati koos; üksik screenshot ei olnud heakskiidu alus.

## Paarisvõrdlused

| Olek | Enne | Pärast | Paarisvõrdlus |
|---|---|---|---|
| Desktop autocomplete | `output/playwright/23-v2-audit-autocomplete-desktop.png` | `output/playwright/32-v3-local-autocomplete-desktop.png` | `output/playwright/compare-autocomplete-desktop.png` |
| Desktop `mets` tulemus | `output/playwright/24-v2-audit-search-desktop.png` | `output/playwright/44-v4-local-search-desktop-final.png` | `output/playwright/compare-v4-search-desktop-final.png` |
| Mobiili esimene vaade | `output/playwright/25-v2-audit-entry-scroll-mobile.png` | `output/playwright/34-v3-local-home-mobile.png` | `output/playwright/compare-home-mobile.png` |
| Mobiili autocomplete | `output/playwright/26-v2-audit-autocomplete-mobile.png` | `output/playwright/41-v4-local-autocomplete-mobile.png` | `output/playwright/compare-v4-autocomplete-mobile.png` |
| Mobiili `mets` tulemus | `output/playwright/27-v2-audit-search-mobile.png` | `output/playwright/45-v4-local-search-mobile-final.png` | `output/playwright/compare-v4-search-mobile-final.png` |

Need paarid kirjeldavad kompaktse vastusevaate varasemat iteratsiooni. Uues vaates on vastuse all eraldi 12 kirjega lai portaaliotsing, mistõttu täisleht on teadlikult pikem; 1440 px ja 390 px kontrollis ei tekkinud horisontaalset overflow'd.

## Leitud probleemid ja parandused

### P1 — iframe viis desktopi lehe avamisel Terrapointi juurde

Põhjus oli iframe'is töötava Terrapointi desktop-autofookus, mitte hostlehe lazy-load. Terrapointi `landInput.focus()` aktiveeris cross-origin iframe'i ja brauser keris selle nähtavale.

Parandus: autofookus töötab ainult siis, kui Terrapoint on top-level aken. Embedded vaates ei kutsuta `focus()` välja. Lõplik vastuvõtukriteerium avalikul domeenil: vähemalt kahe sekundi järel `scrollY === 0` ja hostdokumendi aktiivne element ei ole iframe.

### P1 — autocomplete jäi pildikaartide taha

Põhjus oli `.hero__content` eraldi stacking context `z-index: 1`, samal ajal kui `.portal-tiles` oli `z-index: 3`. Dropdowni enda kõrgem z-index ei saanud vanema stacking context'ist väljuda.

Parandus: tarbetu vanema stacking context eemaldati. Dropdown on nüüd kõigi nelja pildikaardi kohal, kuid hero läbipaistev ala ei blokeeri kaartide klikke. Loend on viie soovitusega ning viewport-bounded.

### P1 — mobiili esimeses vaates polnud põhiotsingut

Põhjus oli media query, mis peitis kogu hero. Kasutaja nägi esmalt nelja väravakaarti ja alles nende all väikest otsingu CTA-d.

Parandus: mobiilis kuvatakse enne kaarte lihtsustatud hero koos pealkirja, küsimusevälja, submit-nupu ja allikate lubadusega. Eraldi korduv promo eemaldati.

### P1 — otsingutulemus oli pikk tehniline raport

Varasem vaade näitas koondvastuse asemel portaali väljavõtteid, seitset suurt allikakaarti ning kasutajale mõttetuid teenuse-, andmebaasi- ja fallback-olekuid. Mobiilileht oli ligikaudu 4942 px kõrge.

Parandus: tulemuste lehel on kompaktne brand/search header, sisuline H1, otsene vastus, kaks kuni kolm jaotist, inline-viited, tagasihoidlik metoodikamärkus, kolm kompaktset allikat ja seotud küsimused. Sama mobiilileht on nüüd ligikaudu 2160 px kõrge, ilma tõendeid kaotamata.

### P1 — `mets` ei olnud päris vastus

Varasem fallback kopeeris kolm esimest Keskkonnaportaali otsingukaardi teksti. Parandus kasutab läbi vaadatud metsateadmiste baasi ja sünteesib eraldi metsamaa pindala, selle näitaja piirid ja ametlike arvude erinevuse põhjused. Igal sisulisel osal on viide kuvatud ametlikule allikale.

### P1 — väike tõendipakk näis kogu otsingutulemuste hulgana

AI vastuse viis kontrollitud tõendiallikat ja portaali lai tulemuste hulk olid varem ühes mõttelises loendis. Nüüd on „Vastuse allikad” ja „Otsingutulemused” eraldi. `mets` vaates kuvatakse portaali 953 kaardiesinemist ning selgitatakse, et need koonduvad 752 eri URL-iks. Lai loend lehitseb 12 eri URL-i kaupa 63 lehel ega käivita lehevahetusel AI vastust uuesti.

### P1 — peidetud allika viide ei töötanud

Vastus viitas allikatele 4 ja 5, kuid DOM-is olid algselt ainult esimesed kolm kirjet. Viitel klõpsamine avab nüüd vajadusel kogu loendi, ootab renderduse ära, viib fookuse õigele allikalingile ja kerib selle nähtavale. Brauserikontroll kinnitas ülemineku `source-1..3` olekust `source-1..5` olekusse ning aktiivseks elemendiks `source-5`.

### P1 — kattuvad päringud, fookus ja mobiili juhtnupud

Igal uuel päringul katkestatakse eelmine fetch ja vastus võetakse vastu ainult viimase request-ID jaoks. Mockitud aeglane esimene ja kiire teine päring kinnitasid, et vana vastus ei saa uut üle kirjutada. Valmis vastuse H1 saab programmilise fookuse ja dokumendi pealkiri uueneb; mobiili ikoonnupul on dünaamiline `aria-label`.

### P1 — teksti ja fookuse kontrast

Väikese allikameta, kompaktse jaluse ja soovituste loenduri toonid muudeti tumedamaks. Üldine helekollane 1,51 : 1 fookusring asendati tumeda sinise ning valge eraldusringiga; otsinguvälja `focus-within` kasutab sama kõrge kontrastiga mustrit.

## Ligipääsetavus ja interaktsioonid

- Combobox seob välja ja listbox'i `aria-controls`, `aria-expanded` ja `aria-activedescendant` atribuutidega.
- Listbox sisaldab ainult `role="option"` lapsi ning aktiivse järglase mustris pole valikud eraldi tab-järjestuses.
- Arrow Down/Up liiguvad viie soovituse vahel; Enter valib aktiivse soovituse või käivitab päringu; Escape sulgeb loendi.
- Mouse/touch valik ning otsingu puhastamine jätavad fookuse väljale.
- Tulemuste H1 kirjeldab vastust, mitte kasutaja päringut või tehnilist olekut.
- Viitenumbrid on lingid vastava allikani, ka siis kui allikas on esialgu kokku volditud; allikakaartidel on kirjeldav nimi, väljaandja, aasta ja täpne locator.
- „Kõik allikad” avaldab oleku `aria-expanded` ja seose `aria-controls`; JS-kerimine austab reduced-motion eelistust.
- 390 px vaates puudub horisontaalne lehe overflow ning kõik põhikontrollid on püsivalt nähtavad.

## Visuaalne hinnang

Paarisvõrdluste ja interaktsioonitestide järgi ei jäänud lokaalsesse buildi ühtegi teadaolevat P0/P1 probleemi:

- desktop autocomplete ei ole enam kaartide all;
- mobiili esimeses vaates on põhiotsing;
- tulemuse visuaalne hierarhia algab vastusest, mitte süsteemi olekust;
- allikad on loetavad, kuid ei varjuta vastust;
- Terrapoint ei ilmu üldotsingu tulemustesse;
- kasutajaliideses puuduvad Qdranti, PostgreSQL-i, mudelipakkuja ja fallback'i nimed.

## Avaliku deploy vastuvõtukontroll

Coolify kaudu juurutatud commit `40b97e4` kontrolliti 17.08.2026 aadressil `https://praktika.arleserver.cfd` puhta Chrome'i brauseriseansiga. Avaliku deploy tulemused:

- värske 1440 × 1100 desktop-load oli 2,5 sekundi järel `scrollY === 0`, aktiivne element oli hostdokumendi `BODY`, nähtav oli täpselt üks põhiotsing ja iframe ei saanud fookust;
- `https://terrapoint.ee/` laadis cross-origin iframe'is päris Terrapointi pealkirja, sisu, neli sisendit ja 21 juhtnuppu;
- desktopi autocomplete näitas viit sisulist valikut; `mets` renderdas Luna „AI koondvastuse”, viis vastuseallikat, kuus jätkuküsimust ja 12 laia tulemust;
- `mets` tulemuse selgitus näitas korraga portaali 953 esinemist, 752 eri URL-i ja 63 lehte. Teisele lehele liikumine laadis 12 uut kirjet ning viis fookuse tulemuste H2-le;
- vastuse viide 4 avas loendi kolmelt allikalt viiele ning viis fookuse elemendile `source-4`;
- 390 × 844 vaates olid põhiotsing ja nimega submit-nupp esimeses vaates nähtavad. Päise otsingunupp fokusseeris sama ainsa sisendi, mitte teise vormi;
- mobiilis vastas küsimus „Kas meie metsad muutuvad nooremaks?” kohe, et tervikpilt ei ole lihtsalt noorenemine, selgitas SMI-d, näitas viit allikat ja kuut jätkuküsimust. Viide 5 avas kõik allikad ja fokusseeris `source-5`;
- desktopis ega mobiilis polnud horisontaalset overflow'd; first-party konsoolivigu, hoiatusi ja 504 vastuseid oli 0;
- avalik API tagastas `mets` snapshot'i `953 / 752 / 63`, kõik kasutatud viited lahendusid kuvatud allikatele ning vastus ei sisaldanud sisemisi cache'i, mudelipakkuja, andmebaasi, score'i või vektorindeksi välju.
- eraldi cache-miss päring renderdas „AI koondvastuse” ning sama serverijooks salvestus sisemiselt olekuga `ready`, pakkujaga `opencode-go/gpt-5.6-luna`, viie allika ja 4435 ms kestusega; salvestatud `query_text` oli `[redacted]`;
- sünteetiline privaatsusmarker esines pärast avalikku päringut rakenduse, Coolify proxy, Coolify ja PostgreSQL-i konteinerilogides 0 korda, vastusecache'is 0 korda ning jooksulogis 0 korda;
- 181-märgine päring tagastas HTTP 400. Seejärel tehtud 25 sisutühjast odavast kontrollpäringust tagastasid 19 HTTP 400 ja viimased 6 HTTP 429, mis tõendas minutipõhist otsingupiiri ilma mudelit käivitamata; `page_size=999` piirati 50 kirjeni;
- renderduskoodis ei ole `953`, `752` või `63` konstandina: server loeb `upstream_total`, `distinct_url_count` ja URL-järjestuse snapshot'ist ning arvutab lehekülgede arvu eri URL-ide hulga ja küsitud lehesuuruse põhjal.

Selle deploy kuvatõmmised: `output/playwright/59-luna-public-search-desktop.png`, `60-luna-public-home-mobile.png` ja `61-luna-public-age-mobile.png`.

final local result: passed
final public result: passed
