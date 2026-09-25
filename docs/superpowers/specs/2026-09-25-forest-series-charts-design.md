# Forest time-series charts in search answers

Date: 2026-09-25
Status: approved design, awaiting implementation plan

## Goal

When a search question asks about a forest indicator over more than one year, the
answer shows a chart of the official year-by-year series next to the text. Today
those questions either abstain ("vastuseks on vaja sama metoodikaga aegrida") or
answer from a reviewed prose extract that lists the numbers inline. Both are
harder to read than a line on a chart.

The chart is never decorative: it is built from the same validated numbers the
text answer cites, it carries the same numbered citation, and it exists only when
the question needed a series in the first place.

## Non-goals

- No chart for single-year questions. They keep today's behaviour and make no
  extra upstream request.
- No chart from model-generated prose, and no numbers extracted from text.
- No county, ownership or species breakdowns (MM04, KK51 species rows) in this
  version. The KK51 species rows and KK509 biomass table are natural follow-ups
  and the contract below already fits them.
- No charting library. One small inline-SVG component.
- Non-forest series (municipal waste, KK048, KK25, KK610) are out of scope here,
  but must be able to adopt the same `chart` contract without changes to the
  client or the public-response validation.

## Sources

All three are official, already allow-listed HTTPS hosts, and the two new ones
are PXWeb JSON-stat2 tables fetched with the existing `fetchOfficialPxwebDataset`
helper (16 kB request cap, 256 kB response cap, 12 h cache, stale-if-error 24 h).

### KK51: metsavaru SMI hinnangul (new adapter)

- API: `https://andmed.stat.ee/api/v1/et/stat/keskkond/loodusvarad-ja-nende-kasutamine/metsavaru/KK51.PX`
- Table page: `https://andmed.stat.ee/et/stat/keskkond__loodusvarad-ja-nende-kasutamine__metsavaru/KK51`
- Dimensions: `Näitaja` (34 rows), `Aasta` (1999–2025). Role `time` = `Aasta`.
- Indicators used in this version (closed catalogue, exact label match required):

  | code | label | unit | intent keywords (normalised) |
  |---|---|---|---|
  | 1 | Metsamaa pindala, tuhat ha | tuhat ha | metsamaa pindala, metsa pindala |
  | 2 | Puistute pindala, tuhat ha | tuhat ha | puistute pindala, metsaga kaetud pindala |
  | 10 | Puistute üldvaru, tuhat m³ | tuhat m³ | tagavara, üldvaru, puidu varu |
  | 18 | Puistute keskmine hektarivaru, m³/ha | m³/ha | hektarivaru, hektari tagavara |
  | 26 | Puistute varu juurdekasv enamuspuuliigiti aastas, m³/ha | m³/ha | juurdekasv |
  | 34 | Territooriumi metsasus, % | % | metsasus |

- Live probe on 2026-09-25 (codes 1, 10, 34 × 2015–2025) returned `status: null`,
  `extension.px = { tableid: "KK51", decimals: 0 }`, `source: "Statistikaamet"`,
  values such as metsamaa pindala 2310.6 → 2360.2 and metsasus 51 → 52.1. The
  `updated: 2017-12-12` field is misleading and is not used as a publication or
  freshness signal, matching the other KK adapters.

### MM03: metsaraie SMI hinnangul (new adapter)

- API: `https://andmed.stat.ee/api/v1/et/stat/majandus/metsamajandus/MM03.PX`
- Table page: `https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM03`
- Dimensions: `Aasta` (1999–2024), `Raie liik` (6), `Näitaja` (6). Role `time` = `Aasta`.
- Cut types used: `1 Koguraie`, `3 ..lageraie`, `5 ..harvendusraie`.
- Measures used: `1 Raiepindala, tuhat ha` with `2 Raiepindala suhteline viga, %`,
  and `3 Raiemaht, tuhat m³` with `4 Raiemahu suhteline viga, %`. The error
  column is always requested together with its value and shown as ± in the
  chart tooltip and in the answer text. `Väljaraie` (5, 6) is not used.
- Live probe on 2026-09-25 (2015–2024 × {1,3} × {1,3,4}) returned clean values
  with `status: null`; lageraie pindala matched the reviewed SMI 2025 extract
  exactly (2015 31,6; 2017 35,6; 2021 27,1; 2024 34,0 tuhat ha).
- `docs/ALLIKAD.md` and `PROJEKT.md` currently list MM03 and MM04 as deliberately
  not auto-used because they must not be confused. This design adds MM03 only.
  MM04 (raiedokumendid, maakond, omand) stays out. Every MM03 answer names the
  table and says the values are SMI sample estimates with a relative error, so a
  reader cannot mistake them for raiedokumentide statistics.

### Eurostat `for_vol_efa` (existing adapter, chart added)

The existing forest-balance adapter already holds `observations[]` with
`{ year, increment, removals, incrementStatus, removalsStatus }` for 2020
onward. `composeForestHarvestBalanceAnswer` gains a `chart` in its
"viimase viie aasta" branch only; the single-year comparison branch and the
missing-year branch stay text-only. Missing years inside the five-year window
stay missing (gaps in the chart, not interpolated), matching the existing note
text.

## Trigger: when a series is fetched

A forest series request is made only when both hold:

1. **Forest indicator intent.** The normalised query matches one indicator from
   the KK51 catalogue or one MM03 cut type / measure pair. Ambiguous queries
   ("mets aastate lõikes" with no indicator) do not trigger. "raiemaht" alone
   means `Koguraie` × `Raiemaht`; "lageraie" alone means `..lageraie` ×
   `Raiepindala`; "lageraie maht" means `..lageraie` × `Raiemaht`.
2. **Multi-period need.** One of:
   - two or more four-digit years, or a range `2015–2024`, `2015 kuni 2024`,
     `alates 2010`, `2010. aastast`;
   - `viimase N aasta`, `viimased N aastat`, `viimase kümne / viie / kahekümne aasta`;
   - `N aastat tagasi` combined with a comparison verb (`rohkem`, `vähem`,
     `võrreldes`, `kui`);
   - `aegrida`, `aastate lõikes`, `aastate kaupa`, `aasta-aastalt`, `trend`,
     `muutus`, `muutunud`, `kuidas on muutunud`, `dünaamika`, `ajalugu`,
     `ajalooline`.

   Multilingual bridges are not added; the search is Estonian-only.

Year window resolution, in this order:

- explicit range → that range, clamped to the table's published years;
- `alates YYYY` / `YYYY. aastast` → YYYY to latest;
- `viimase N aasta` → the N latest published years;
- `N aastat tagasi` → from (latest − N) to latest;
- otherwise → the 10 latest published years.

The window must contain at least 2 and at most 27 years after clamping; anything
else returns no document, so the answer falls back to today's behaviour.

The existing `requestsUnsupportedForestAreaTimeSeries` abstention in
`server/search.mjs` (reason `requested-time-series-required`) stays as the
fallback: the structured compose chain runs before scope assessment, so a valid
KK51 document answers first and the abstention only fires when the series could
not be fetched or validated. Test coverage locks both orders.

## Server design

### New module `server/forest-series.mjs`

Mirrors the structure of `server/statistics.mjs`:

- `FOREST_SERIES_KK51_API_URL`, `FOREST_SERIES_KK51_TABLE_URL`,
  `FOREST_SERIES_MM03_API_URL`, `FOREST_SERIES_MM03_TABLE_URL`.
- `forestSeriesIntent(query, { now })` → `null` or
  `{ table: "KK51" | "MM03", indicator, cutType?, measure?, years: { from, to, mode } }`.
- `isForestSeriesQuery(query)`.
- `forestSeriesRequest(intent)` → PXWeb POST body with `filter: "item"` for
  every dimension (never `all` or `top`), so the request stays bounded and
  cache-fingerprinted.
- `forestSeriesFromJson(query, json, { fetchedAt, stale, now })` → `[]` or one
  document. Validation follows the KK048 adapter exactly: byte cap, no NUL,
  fresh operational fetch (≤ 13 h, ≤ 5 min future skew), not stale,
  `class: "dataset"`, `version: "2.0"`, exact `label`, `source: "Statistikaamet"`,
  exact `id` order, `size` equal to the request's item counts, exact
  `dimension` keys, category index/label equality for every requested code,
  `role.time = ["Aasta"]`, `extension.px.tableid` and `decimals`, `status`
  absent or null, `value.length` equal to the product of sizes, every value a
  finite number within a per-indicator bound (pindala ≤ 5 000 tuhat ha,
  üldvaru ≤ 1 000 000 tuhat m³, m³/ha ≤ 1 000, metsasus 0–100, raiemaht ≤
  50 000 tuhat m³, relative error 0–100). A `null` value (PXWeb "..") for a
  requested year is allowed and becomes a gap, but at least 2 non-null points
  are required.
- The document carries `_forestSeries: { table, indicator, unit, years, points: [{ year, value, error? }], fetchedAt }`
  and `_contentHash` of the raw body, `evidencePolicy: "claim-specific"`,
  `freshness.class: "annual-historical-statistic"`, `retrieval:
  "official-structured-statistics-pxweb"`, `sourceTier: "official"`.
  `summary` and `content` are the deterministic statement and content texts so
  proposition grounding sees the same numbers the chart shows.
- `validatedForestSeriesProjection(query, document, now)` re-derives the intent
  and re-checks every invariant, exactly as `validatedStatisticsProjection`
  does, so a cached or tampered document cannot compose an answer.
- `composeForestSeriesResponse(query, documents, { total, now })` → the answer
  object with `chart`.

### Answer text (deterministic, no model)

- `eyebrow`: `Statistikaameti tabel KK51` / `MM03`.
- `title`: `<Indicator> <from>–<to>: <first> → <last> <unit>` using Estonian
  number formatting (`etDecimal`, one decimal for tuhat ha / m³/ha / %, integer
  for tuhat m³).
- `intro`: first and last value with years, minimum and maximum with years,
  the count of published points, then one of:
  - monotonic non-decreasing: "Rida kasvas igal aastal või püsis samal tasemel."
  - monotonic non-increasing: the mirror sentence.
  - otherwise: "Otspunktide vahe on X, kuid vahepealsed tõusud ja langused
    tähendavad, et seda ei saa kirjeldada ühtlase trendina." (same stance as the
    reviewed lageraie extract).
  For MM03 the intro adds the relative error of the latest year.
  `introCitations: [1]`.
- `parts`: one part "Mida näitaja tähendab" with the fixed indicator definition
  (SMI is a sample-based estimate; tagavara is not raiemaht; MM03 is SMI, not
  raiedokumendid), `citations: [1]`.
- `note`: the standard SMI caveat used by the reviewed extracts.
- `sources`: the one KK51/MM03 document with `citation: 1`, `evidenceExcerpt: content`.
- `related`: three fixed forest follow-ups relevant to the indicator.
- `evidence: { kind: "structured-forest-series", answerable: true, documentIds }`.

### Chart contract (`result.chart`)

```json
{
  "kind": "line",
  "title": "Metsamaa pindala 2015–2025",
  "unit": "tuhat ha",
  "xLabel": "Aasta",
  "series": [
    { "id": "kk51-1", "label": "Metsamaa pindala", "points": [ { "x": 2015, "y": 2310.6 }, { "x": 2016, "y": 2313.6, "error": 1.2 } ] }
  ],
  "citation": 1,
  "caption": "Statistikaamet, tabel KK51, SMI hinnang."
}
```

- `kind`: `"line"` for one or more series over years; `"bar"` for grouped
  per-year comparison of two measures (used by the Eurostat increment vs
  removals chart).
- 1–3 series, each 2–40 points, `x` an integer 1850–2100, `y` a finite number,
  `error` optional finite ≥ 0 (relative error in %, shown as ±).
- `citation` must resolve to exactly one source in `sources`.
- `caption` ≤ 200 characters, plain text.

`publicResponse` in `server/pipeline.mjs` validates the field with a new
`validPublicChart(chart, sources)` helper. An invalid chart is dropped and the
rest of the answer is kept; the answer never fails because of its chart. This
mirrors how an invalid `actionUrl` is stripped today.

### Wiring

- `loadStructuredIndicatorDocuments` in `server/indicators.mjs` gets one more
  block: `if (isForestSeriesQuery(query))` → `fetchOfficialPxwebDataset(url,
  forestSeriesRequest(intent))` → `forestSeriesFromJson`. Same try/catch
  shape: an upstream failure leaves the listing without the series document.
- `requiresExtendedStructuredListingBudget` returns true for forest series
  queries, like the other exact PXWeb queries.
- Both compose chains in `server/pipeline.mjs` (live draft and timeout
  fallback) add `composeForestSeriesResponse` before the Eurostat/forestry
  paths, after the weather/hydrology adapters.
- `composeForestHarvestBalanceAnswer` returns `chart` alongside `answer` and
  `related` when the resolved window has ≥ 2 comparable years; the caller
  spreads it into the draft the same way it spreads `answer`.
- `SEARCH_RESPONSE_REVISION` is bumped so cached responses without a chart do
  not survive the deploy.

## Client design

### `src/AnswerChart.jsx`

- Props: `chart`, `sources`. Renders `null` when `chart` is absent.
- Inline `<svg viewBox="0 0 640 260">` scaled to the card width by CSS. Left
  axis with 4–5 ticks, bottom axis with every year (every second year when
  more than 14 points). Line series draw a polyline with point markers; a
  `null` gap breaks the line. Bar series draw grouped bars from a zero
  baseline. Line charts use a padded data range (10% above and below) so a
  2310–2360 series remains readable; bar charts always start at 0.
- Colors come from the existing tokens: first series `--brand-700`, second
  `--green`, third `--purple`, axes and grid `--line`, text `--muted`. No new
  palette. The dataviz skill is loaded before the component is written and
  its contrast validator is run on these three against the card background.
- Hover/focus on a point shows a small tooltip: year, value with unit, and
  ± error when present. Points are keyboard-focusable (`tabIndex=0`) so the
  values are reachable without a mouse.
- Accessibility: `<svg role="img" aria-labelledby>` with a `<title>` and a
  `<desc>` that states the series, first/last value and range; plus a
  visually hidden `<table>` with the full data so screen readers and copy/paste
  get the numbers.
- Caption under the chart: `chart.caption` followed by the same `<Citation>`
  component the text uses, so the chart links to the same numbered source.

### Placement in `src/App.jsx`

The chart block renders directly under the intro paragraph and above
`answer-parts`, full card width, in both the root answer and each follow-up
turn (`turn.result.chart`). It is not a side column: the answer card is a
single reading column and the intro sentence introduces the numbers the chart
then shows. On phones the block is the same, just narrower; the SVG scales via
`viewBox`, the caption wraps.

### Styles

`src/styles.css` gains `.answer-chart`, `.answer-chart svg`,
`.answer-chart__caption`, `.answer-chart__tooltip`, and the hidden table class,
using the existing restrained typography (13–14 px labels, no bold beyond the
title line). Print keeps the chart; the tooltip is hover/focus-only.

## Error handling

| Situation | Behaviour |
|---|---|
| Upstream timeout or non-200 | No series document; the query falls through to today's paths (reviewed extract, abstention, or synthesis). No chart. |
| Schema drift (label, dimension, code, decimals, size) | `forestSeriesFromJson` returns `[]`. Logged via the existing structured-fetch logging. |
| A requested year is `null` in the table | Gap in the chart, excluded from min/max/first/last; intro says which years are unpublished. |
| Fewer than 2 published points | No document. |
| Chart fails `validPublicChart` | Chart stripped, text answer kept. |
| Filter change on the results page | The answer is rebuilt from the filtered evidence, as today; the chart comes with the rebuilt answer or not at all. |
| Stale cache (`stale: true`) | Not evidence, no document, same as KK048. |

## Testing

- `tests/forest-series.test.mjs`
  - intent: positive and negative query matrix (indicator without period, period
    without indicator, single year, explicit range, `alates`, `viimase N`,
    `N aastat tagasi`, range clamping to published years, > 27 years rejected).
  - request body: exact `filter: "item"` selections for each intent.
  - parsing from recorded fixtures (`tests/fixtures/pxweb-kk51-*.json`,
    `tests/fixtures/pxweb-mm03-*.json` captured from the live probes on
    2026-09-25): happy path, wrong label, wrong tableid, wrong decimals, wrong
    size, status flag present, value out of bound, one null year, all null, stale,
    future fetch time, > 13 h old fetch.
  - compose: title/intro/parts text, monotonic vs non-monotonic sentence,
    relative error in MM03 intro, chart shape, citation binding.
  - `validatedForestSeriesProjection` rejects a document whose summary or
    points were altered after parsing.
- `tests/search.test.mjs` addition: `publicResponse` keeps a valid chart,
  strips an invalid one, and never drops the answer.
- `tests/indicators.test.mjs` addition: `loadStructuredIndicatorDocuments`
  calls the PXWeb fetch once for a forest series query with the expected body
  and not at all for a single-year forest question.
- `tests/forestry.test.mjs` addition: the `requested-time-series-required`
  abstention still fires when the series fetch fails; a valid KK51 document
  wins when it succeeds.
- `tests/search-stream.test.mjs`: a `chart` field on an `answer` event passes
  the client parser unchanged.
- Eurostat: `composeForestHarvestBalanceAnswer` returns a `bar` chart with a
  gap for a missing year and no chart for a single-year question.
- Live verification after deploy (per `AGENTS.md`): probe
  `metsamaa pindala viimase kümne aasta jooksul`, `lageraie pindala 2015–2024`,
  `raiemaht 20 aastat tagasi võrreldes praegusega`, `kas Eestis raiutakse
  rohkem kui netojuurdekasv viimase viie aasta jooksul`, and one single-year
  control (`metsamaa pindala 2024`) that must return no chart. Browser pass on
  desktop and 390 px confirms the chart renders, the tooltip works with
  keyboard, and the page still loads at `scrollY === 0`.

## Documentation updates

- `docs/ALLIKAD.md`: add KK51 and MM03 rows to the active sources table with
  the exact request contract and limits; move MM03 out of the "deliberately not
  auto-used" list, keep MM04 there with the reason.
- `PROJEKT.md`: update the Statistikaamet adapter paragraph and the "aegrida"
  limitation sentences.
- `AGENTS.md` durable decision: "A chart appears under an answer only when the
  question asked for more than one period and the chart is built server-side
  from the same validated official series the text cites; no chart is ever
  derived from prose or a model."
- `README.md`: one line in the feature list.

## Deployment

Merge to `main`, push, poll the Coolify deployment until it reports `finished`
on the pushed SHA, then run the live probes above. Both the deploy record and
the behaviour probes must pass before the work is called done.
