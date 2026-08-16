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

Tulemuse täislehe kõrgus on desktopil 1760 px ja mobiilis 2160 px; mõlemas vaates võrdub dokumendi laius täpselt viewport'i laiusega.

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

Pärast Coolify deploy'd tuleb sama brauseriseansiga uuesti kinnitada:

- värske desktop-load püsib üleval ja iframe ei saa fookust;
- Terrapointi täisrakendus laeb praktikadomeeni iframe'is;
- autocomplete, `mets`, täpne FAQ ja allikate avamine töötavad;
- 390 px root-laius võrdub viewport'iga;
- first-party console error'eid ei ole;
- `/api/health` on minimaalne ja `/api/search` ei sisalda infrastruktuurijargooni.

final local result: passed
