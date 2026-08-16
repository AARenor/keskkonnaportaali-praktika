# Design QA

## Comparison target

- Source visual truth: live `https://keskkonnaportaal.ee/` captures in `/tmp/keskkonnaportaal-source.jvr4Xd/`.
- Rendered implementation: Chrome-rendered local production build at the project preview server.
- Browser: Google Chrome through Playwright CLI, as authorized by the user.
- Theme/auth: public, light theme, unauthenticated.
- Density normalization: screenshots use Playwright `scale: css` and device scale factor 1. Source and implementation pairs have identical pixel and CSS dimensions, so no resampling was required.

## Evidence

### Full-view comparison

- Desktop source overview: `/tmp/keskkonnaportaal-source.jvr4Xd/source-desktop-full.png`.
- Desktop implementation full page: `/home/arle/Keskkonnaportaali praktika/qa-desktop-full-final.png`.
- The source full-page capture contains its cookie-consent overlay. The practice app does not set cookies or analytics, so reproducing that overlay would be misleading; precise above-the-fold comparison therefore uses the clean source state below.

### Focused comparisons

| State | Source | Implementation | Viewport / pixels |
|---|---|---|---|
| Desktop clean homepage top | `/tmp/keskkonnaportaal-source.jvr4Xd/source-desktop-clean-top.png` | `/home/arle/Keskkonnaportaali praktika/qa-desktop-final-2.png` | 1440 × 1000 CSS px / 1440 × 1000 image px |
| Desktop Teemad mega-menu | `/tmp/keskkonnaportaal-source.jvr4Xd/source-desktop-menu-teemad.png` | `/home/arle/Keskkonnaportaali praktika/qa-desktop-menu-final-2.png` | 1440 × 1000 CSS px / 1440 × 1000 image px |
| Mobile homepage top | `/tmp/keskkonnaportaal-source.jvr4Xd/source-mobile-top.png` | `/home/arle/Keskkonnaportaali praktika/qa-mobile-final-2.png` | 390 × 844 CSS px / 390 × 844 image px |
| Mobile navigation drawer | `/tmp/keskkonnaportaal-source.jvr4Xd/source-mobile-menu-open.png` | `/home/arle/Keskkonnaportaali praktika/qa-mobile-menu-final.png` | 390 × 844 CSS px / 390 × 844 image px |
| Mobile answer-first search | `/tmp/keskkonnaportaal-source.jvr4Xd/source-mobile-search-results.png` | `/home/arle/Keskkonnaportaali praktika/qa-mobile-search-final-2.png` | 390 × 844 CSS px / 390 × 844 image px |
| Functional Terrapoint result | Live Terrapoint visual/API behavior | `/home/arle/Keskkonnaportaali praktika/prototype-terrapoint-result.png` | iframe element 357 × 621 image px in 390 × 844 host viewport |

Focused evidence was required because header alignment, menu depth, search-state wrapping and iframe content were too small to judge reliably from the full-page captures.

## Required fidelity surfaces

- **Fonts and typography:** the implementation self-hosts the same Rubik and Roboto families observed in the source. Heading weight, body density, uppercase tile labels and small metadata maintain the source hierarchy. No broken truncation or unresolved fallback was visible at the tested viewports.
- **Spacing and layout rhythm:** the three header bands, 515 px hero, overlapping four-tile row, two-column current-content region, events grid and three-image footer feature band follow the source composition. Desktop header content now uses the source's full-width padding. Mobile retains the source's clipped quick-link bar, compact brand bar and two-by-two tiles. The added AI-search banner and Terrapoint section are intentional product additions.
- **Colors and visual tokens:** dark navy brand header, cyan navigation, pale-blue utility surfaces, blue links, purple public-notice cards and green date cards map closely to the source palette. New answer confidence and Terrapoint status colors are semantic and meet readable contrast.
- **Image quality and asset fidelity:** the logo, hero, four portal tiles, feature stories, news cards and three lower promo panels are local copies of the real source assets. Object-fit crops preserve the source subjects and aspect ratios. No visible source artwork was replaced with hand-drawn SVG, emoji, placeholder art or CSS illustration.
- **Copy and content:** source navigation labels, section names and current content are retained. New copy clearly labels the practice environment, describes source-grounded answers, and warns that missing map data does not prove a restriction is absent.
- **Icons:** functional icons use one consistent Lucide stroke family; the official Keskkonnaportaal logo remains the source vector. Icon buttons have accessible names and visible focus rings.
- **Responsiveness/accessibility:** checked at 1440 × 1000 and 390 × 844. No horizontal page overflow, hidden persistent controls or text collisions remain. Menus, forms and iframe controls use semantic buttons/labels; reduced motion and keyboard focus styles are included.

## Comparison history

### Iteration 1 — blocked

- **[P2] Desktop header alignment and hero rhythm drifted from the source.**
  - Evidence: initial implementation `/home/arle/Keskkonnaportaali praktika/qa-desktop-final.png` centered all header content at the 1110 px page shell, while the source placed quick links, logo and main navigation about 28 px from the viewport edge. The practice badge also pushed the hero title visibly lower.
  - Fix: gave quick/brand/main navigation bars full-width 28 px gutters; positioned the practice badge independently; moved hero copy to the source vertical rhythm.
  - Post-fix evidence: `/home/arle/Keskkonnaportaali praktika/qa-desktop-final-2.png` alongside the clean source capture.

- **[P2] Mobile header search remained expanded after submitting.**
  - Evidence: `/home/arle/Keskkonnaportaali praktika/prototype-mobile-search-results.png` showed a duplicate open header form and autocomplete panel above the dedicated results form.
  - Fix: mobile search now closes before routing to the results page.
  - Post-fix evidence: `/home/arle/Keskkonnaportaali praktika/qa-mobile-search-final.png`.

### Iteration 2 — blocked

- **[P2] Mobile results breadcrumb and eyebrow collided.**
  - Evidence: `/home/arle/Keskkonnaportaali praktika/qa-mobile-search-final.png` rendered “Avalehele” and “Keskkonnaportaali parem otsing” on the same line without separation.
  - Fix: made the results-page eyebrow a block element, restoring the intended vertical hierarchy.
  - Post-fix evidence: `/home/arle/Keskkonnaportaali praktika/qa-mobile-search-final-2.png`.

- **[P2] Desktop Teemad menu was materially too shallow.**
  - Evidence: `/home/arle/Keskkonnaportaali praktika/qa-desktop-menu-final.png` exposed the hero after roughly 250 px, while the source menu covered most of the viewport and contained a denser theme index.
  - Fix: expanded the topic inventory to three dense columns plus the section-introduction column and increased the topic menu depth to 690 px.
  - Post-fix evidence: `/home/arle/Keskkonnaportaali praktika/qa-desktop-menu-final-2.png` alongside `/tmp/keskkonnaportaal-source.jvr4Xd/source-desktop-menu-teemad.png`.

### Iteration 3 — passed

The final paired comparisons show no remaining actionable P0, P1 or P2 mismatch. The source identity and responsive hierarchy remain recognizable while the requested answer-first search and Terrapoint section are clearly intentional extensions.

## Primary interactions tested

- Desktop Teemad menu opens and closes.
- Mobile navigation drawer opens and closes.
- Mobile search opens, accepts a natural-language query, submits and closes the header panel.
- Search results render an answer first, numbered citations second and source cards afterward.
- Terrapoint address search returns ten matches for the test address.
- Selecting cadastral unit `10701:002:0003` renders the map, area, land use, forest area, ownership and spatial-status notice.
- `/api/health` and `/api/search` return successful JSON.
- Browser console checked after the final homepage/menu/search runs: 0 first-party errors. The earlier OpenStreetMap embed emitted only Chrome GPU performance warnings, not application errors.

## Findings

No actionable P0/P1/P2 findings remain.

## Follow-up polish

- **[P3]** The source mega-menu uses more nested headings and indentation than the condensed practice index. The current version preserves scale and coverage but could gain full CMS-driven hierarchy later.
- **[P3]** The source quick bar has richer weather artwork; the practice build intentionally uses a consistent icon-library rendering.
- **[P3]** The OpenStreetMap embed inherits a few English control labels from the external map service.

## Implementation checklist

- [x] Desktop and mobile homepage comparison complete.
- [x] Fonts, spacing, colors, images and copy reviewed explicitly.
- [x] Navigation, search and Terrapoint states exercised.
- [x] All P0/P1/P2 findings fixed and recaptured.
- [x] Console errors checked.

final result: passed
