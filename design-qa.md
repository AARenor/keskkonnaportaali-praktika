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

Varasem fallback kopeeris kolm esimest Keskkonnaportaali otsingukaardi teksti. Parandus valib tõendid samast värskest, filtreeritud ja relevantsuse järgi järjestatud tulemusehulgast, mida kasutaja näeb. Läbi vaadatud metsateadmiste baasi kasutatakse regressiooni- ja võrdluskorpusena, kuid see ei saa runtime'is värskest otsingust mööda minna. Igal avaldatud sisulisel osal on viide kuvatud ametlikule allikale.

### P1 — väike tõendipakk näis kogu otsingutulemuste hulgana

AI vastuse väike tõendialamhulk ja portaali lai tulemuste hulk olid varem ühes mõttelises loendis. Nüüd on „Vastuse allikad” ja „Otsingutulemused” eraldi. Lai loend lehitseb 12 kanoniseeritud URL-i kaupa ega käivita lehevahetusel AI vastust uuesti. Tulemuste koguarv arvutatakse jooksvalt PostgreSQL-i ning live-allikate hetkeseisust; seda ei hoita kasutajaliideses konstandina.

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

Coolify kaudu juurutatud commit `ee42516` kontrolliti 18.08.2026 aadressil `https://praktika.arleserver.cfd` puhaste Chrome'i brauseriseanssidega. Avaliku deploy tulemused:

- värske 1440 × 1100 desktop-load ja 390 × 844 mobiililaadimine jäid `scrollY === 0` juurde, aktiivne element oli hostdokumendi `BODY`, nähtav oli üks põhiotsing ja horisontaalset overflow'd ei tekkinud;
- `https://terrapoint.ee/` laadis cross-origin iframe'is päris Terrapointi pealkirja, sisu ja neli sisendit; iframe ei saanud hostdokumendi fookust;
- „jäätmete ringlussevõtu määr Eestis 2023” asetas näitaja lehe esimeseks, vastas tervikliku 38% lausega ning peidetud viide 4 laiendas kaheksa allika loendi ja fokusseeris `source-4`;
- „keskkonnaloa taotlemine ettevõttele” asetas mobiilis esimeseks KOTKASe; neli filtrit muutusid ühel veerul loetavaks ning ükski ikoonnupp ei jäänud nimeta;
- first-party konsoolivigu ja hoiatusi oli mõlemas sessioonis 0;
- avalik live-eval sai 19/19 oodatud esikohta ja 1026/1026 API-lepingu, viite, filtri, paginationi, privaatsusvälja ning lõpetatud lause kontrolli. p50 oli 10,450 s, p95/maksimum 14,136 s ja 504 vastuseid oli 0;
- brauserikontrollis leitud katkine otsingusnippet põhjustas enne lõppdeploy'd pooliku avalause. Cache'i revisioon `answer-v10-complete-sentences`, kaks uut regressioonitesti ja live-evali lauselõpukontroll välistavad sama vea kordumise.

final local result: passed
final public result: passed
