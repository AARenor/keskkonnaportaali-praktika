# Forest Time-Series Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a search question asks about a forest indicator over more than one year, fetch the official year series on demand (Statistikaamet KK51 or MM03, or the already-fetched Eurostat balance), answer from it deterministically, and render an inline SVG chart under the answer intro, cited like the text.

**Architecture:** A new server adapter `server/forest-series.mjs` (intent → bounded PXWeb POST → strict JSON-stat2 validation → deterministic answer + `chart`) is wired into the existing structured-indicator loader and both compose chains in `server/pipeline.mjs`. A new `server/answer-chart.mjs` validates the `chart` contract inside `publicResponse` and the cache sanitizer, remapping its citation like answer citations. The client gets a pure layout helper `src/answer-chart-layout.js` (node-testable) and an `AnswerChart` React component rendered from `App.jsx` for the root answer and follow-up turns.

**Tech Stack:** Node 22 ESM (`.mjs`), Express 5, `node:test` + `node:assert/strict`, React 19 + Vite 6, plain CSS with existing tokens. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-forest-series-charts-design.md`

## Global Constraints

- Search is Estonian-only; no Russian/English bridges for the new intent.
- Never expose provider/model/infrastructure jargon in public UI or API text.
- A chart is built only server-side from validated official numbers; never from prose or a model.
- Every PXWeb request uses `filter: "item"` for every dimension (never `all`/`top`); requests go through `fetchOfficialPxwebDataset` (16 kB request cap, 256 kB response cap).
- The JSON-stat2 `updated` field is never used as a publication or freshness signal.
- MM04 is never fetched or cited. Every MM03 answer says the values are SMI sample estimates with a relative error.
- Year window after clamping: 2 ≤ years ≤ 27; at least 2 published (non-null) points.
- Chart contract: `kind` ∈ {`line`,`bar`}; 1–3 series; 2–40 points per series; `x` integer 1850–2100 strictly increasing; `y` finite; optional `error` finite ≥ 0 ≤ 1000; `citation` resolves to exactly one source; `title` ≤ 160 chars; `unit` ≤ 40; `xLabel` ≤ 40; `caption` ≤ 200.
- An invalid chart is dropped; the answer is never failed because of its chart.
- Chart colours: series 1 `--brand-700` (#0073b8), series 2 `--green` (#008849), series 3 `--purple` (#9d45b5). Validated with the dataviz palette validator on 2026-09-25: all checks pass on the light surface.
- Text never wears the series colour; axes/grid are 1 px solid `--line`; lines 2 px; markers r=4 with a 2 px white ring; bars ≤ 24 px wide from a zero baseline; legend present for ≥ 2 series, none for one.
- Run tests with `npm test` (sets `MULTILINGUAL_SEARCH_ENABLED=true`); a single file with `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/<file>.test.mjs`.
- Commit after every task. Do not push until Task 12; a push to `main` deploys production.

---

## File map

| File | Responsibility |
|---|---|
| `server/forest-series.mjs` (new) | KK51/MM03 intent, request body, JSON-stat2 parsing/validation, projection re-validation, answer + chart composition |
| `server/answer-chart.mjs` (new) | `validPublicChart(chart, sources)` and `boundedChart(chart)` shared by `publicResponse` and the cache sanitizer |
| `server/indicators.mjs` | loader block for forest series; extended listing budget |
| `server/pipeline.mjs` | compose-chain wiring, `publicResponse` chart validation + citation remap, revision bump, Eurostat chart pass-through |
| `server/database.mjs` | cache sanitizer keeps a valid chart |
| `src/answer-chart-layout.js` (new) | pure layout maths: nice domain, tick step, run splitting, formatting |
| `src/AnswerChart.jsx` (new) | SVG chart component with legend, crosshair tooltip, keyboard focus, hidden table, caption |
| `src/App.jsx` | render `AnswerChart` under the intro for root and follow-up answers |
| `src/styles.css` | `.answer-chart*` styles |
| `tests/forest-series.test.mjs` (new), `tests/answer-chart.test.mjs` (new), `tests/answer-chart-layout.test.mjs` (new), additions to `tests/indicators.test.mjs`, `tests/citation-policy.test.mjs`, `tests/search-stream.test.mjs` | tests |
| `tests/fixtures/pxweb-kk51-metsamaa-pindala-2015-2025.json`, `tests/fixtures/pxweb-mm03-lageraie-pindala-2015-2024.json` | live captures recorded 2026-09-25 (already on disk) |
| `docs/ALLIKAD.md`, `PROJEKT.md`, `AGENTS.md`, `README.md` | documentation |

---

### Task 1: Forest-series intent and request body

**Files:**
- Create: `server/forest-series.mjs`
- Test: `tests/forest-series.test.mjs`

**Interfaces:**
- Produces: `forestSeriesIntent(query) → null | { table: "KK51"|"MM03", indicator: {code,label,name,unit,key,max}, cutType?: {code,label,name}, measure?: {code,errorCode,label,errorLabel,name,unit,max}, years: {from:number,to:number,mode:string} }`
- Produces: `isForestSeriesQuery(query) → boolean`
- Produces: `forestSeriesRequest(intent) → { query: [...], response: { format: "json-stat2" } }`
- Produces: constants `FOREST_SERIES_KK51_API_URL`, `FOREST_SERIES_KK51_TABLE_URL`, `FOREST_SERIES_MM03_API_URL`, `FOREST_SERIES_MM03_TABLE_URL`, `FOREST_SERIES_TABLE_YEARS`

- [ ] **Step 1: Write the failing tests**

Create `tests/forest-series.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  FOREST_SERIES_KK51_API_URL,
  FOREST_SERIES_MM03_API_URL,
  forestSeriesIntent,
  forestSeriesRequest,
  isForestSeriesQuery,
} from "../server/forest-series.mjs";

test("forest series intent binds KK51 indicators to a multi-year window", () => {
  const cases = [
    ["Metsamaa pindala viimase kümne aasta jooksul", "KK51", "1", 2016, 2025, "last-n"],
    ["Kuidas on Eesti metsasus muutunud?", "KK51", "34", 2016, 2025, "default"],
    ["Puistute üldvaru 2015–2025", "KK51", "10", 2015, 2025, "range"],
    ["tagavara aegrida alates 2010", "KK51", "10", 2010, 2025, "since"],
    ["Metsamaa pindala 2000 kuni 2010", "KK51", "1", 2000, 2010, "range"],
    ["puistute pindala trend", "KK51", "2", 2016, 2025, "default"],
    ["metsaga kaetud pindala aastate lõikes", "KK51", "2", 2016, 2025, "default"],
    ["hektarivaru viimase 5 aasta jooksul", "KK51", "18", 2021, 2025, "last-n"],
    ["juurdekasv aastate kaupa", "KK51", "26", 2016, 2025, "default"],
    ["metsasus 1990–2025", "KK51", "34", 1999, 2025, "range"],
  ];
  for (const [query, table, code, from, to, mode] of cases) {
    const intent = forestSeriesIntent(query);
    assert.ok(intent, query);
    assert.equal(intent.table, table, query);
    assert.equal(intent.indicator.code, code, query);
    assert.deepEqual(intent.years, { from, to, mode }, query);
    assert.equal(isForestSeriesQuery(query), true, query);
  }
});

test("forest series intent binds MM03 cut types and measures", () => {
  const cases = [
    ["lageraie pindala 2015–2024", "3", "1", 2015, 2024],
    ["Lageraie pindala viimase kümne aasta jooksul", "3", "1", 2015, 2024],
    ["raiemaht 20 aastat tagasi võrreldes praegusega", "1", "3", 2004, 2024],
    ["Kas praegu raiutakse rohkem kui 20 aastat tagasi?", "1", "3", 2004, 2024],
    ["harvendusraie maht viimase viie aasta jooksul", "5", "3", 2020, 2024],
    ["kuidas on raiemaht muutunud", "1", "3", 2015, 2024],
    ["lageraie maht aastate lõikes", "3", "3", 2015, 2024],
  ];
  for (const [query, cut, measure, from, to] of cases) {
    const intent = forestSeriesIntent(query);
    assert.ok(intent, query);
    assert.equal(intent.table, "MM03", query);
    assert.equal(intent.cutType.code, cut, query);
    assert.equal(intent.measure.code, measure, query);
    assert.equal(intent.years.from, from, query);
    assert.equal(intent.years.to, to, query);
  }
});

test("forest series intent refuses single-year, ambiguous, breakdown and Eurostat-balance questions", () => {
  for (const query of [
    "Metsamaa pindala 2024",
    "Kui suur osa Eestist on mets?",
    "mets aastate lõikes",
    "raiemaht",
    "Kas raiemaht ületab juurdekasvu viimase viie aasta jooksul?",
    "raiemaht ja netojuurdekasv 2015–2024",
    "metsamaa pindala ja raiemaht 2015–2024",
    "männikute pindala viimase kümne aasta jooksul",
    "lageraie pindala Harju maakonnas 2015–2024",
    "RMK raiemaht 2015–2024",
    "erametsa raiemaht aastate lõikes",
    "metsamaa pindala prognoos 2030",
    "raiemaht raiedokumentide alusel 2015–2024",
    "lageraie pindala ja maht 2015–2024",
    "metsamaa pindala 1990–1995",
    "metsamaa pindala 2026–2030",
    "forest area from 2015 to 2024",
    "metsasus 2024. aastal",
    `metsamaa pindala ${"aegrida ".repeat(40)}`,
  ]) {
    assert.equal(forestSeriesIntent(query), null, query);
    assert.equal(isForestSeriesQuery(query), false, query);
  }
});

test("forest series requests select only the bound codes and years with item filters", () => {
  assert.deepEqual(forestSeriesRequest(forestSeriesIntent("Puistute üldvaru 2021–2023")), {
    query: [
      { code: "Näitaja", selection: { filter: "item", values: ["10"] } },
      { code: "Aasta", selection: { filter: "item", values: ["2021", "2022", "2023"] } },
    ],
    response: { format: "json-stat2" },
  });
  assert.deepEqual(forestSeriesRequest(forestSeriesIntent("lageraie pindala 2022–2024")), {
    query: [
      { code: "Aasta", selection: { filter: "item", values: ["2022", "2023", "2024"] } },
      { code: "Raie liik", selection: { filter: "item", values: ["3"] } },
      { code: "Näitaja", selection: { filter: "item", values: ["1", "2"] } },
    ],
    response: { format: "json-stat2" },
  });
  assert.equal(forestSeriesRequest(null), null);
  assert.match(FOREST_SERIES_KK51_API_URL, /metsavaru\/KK51\.PX$/u);
  assert.match(FOREST_SERIES_MM03_API_URL, /metsamajandus\/MM03\.PX$/u);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/forest-series.test.mjs`
Expected: FAIL with `Cannot find module '.../server/forest-series.mjs'`.

- [ ] **Step 3: Write the intent and request implementation**

Create `server/forest-series.mjs`:

```js
import { createHash } from "node:crypto";
import { sourceEvidenceEligibility } from "./source-registry.mjs";
import { STATISTICS_DISSEMINATION_POLICY_URL } from "./statistics.mjs";

export const FOREST_SERIES_KK51_API_URL = "https://andmed.stat.ee/api/v1/et/stat/keskkond/loodusvarad-ja-nende-kasutamine/metsavaru/KK51.PX";
export const FOREST_SERIES_KK51_TABLE_URL = "https://andmed.stat.ee/et/stat/keskkond__loodusvarad-ja-nende-kasutamine__metsavaru/KK51";
export const FOREST_SERIES_MM03_API_URL = "https://andmed.stat.ee/api/v1/et/stat/majandus/metsamajandus/MM03.PX";
export const FOREST_SERIES_MM03_TABLE_URL = "https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM03";
export const FOREST_SERIES_TABLE_YEARS = Object.freeze({
  KK51: Object.freeze({ from: 1999, to: 2025 }),
  MM03: Object.freeze({ from: 1999, to: 2024 }),
});

const MAX_QUERY_LENGTH = 180;
const MIN_WINDOW_YEARS = 2;
const MAX_WINDOW_YEARS = 27;
const DEFAULT_WINDOW_YEARS = 10;
const MAX_JSON_BYTES = 64_000;
const MAX_OPERATIONAL_FETCH_AGE_MS = 13 * 60 * 60_000;
const FUTURE_FETCH_SKEW_MS = 5 * 60_000;

const TABLE_LABELS = Object.freeze({
  KK51: "KK51: METSAVARU RIIKLIKU METSAINVENTEERIMISE (SMI) HINNANGUL | Näitaja ning Aasta",
  MM03: "MM03: METSARAIE RIIKLIKU METSAINVENTEERIMISE (SMI) HINNANGUL | Aasta, Raie liik ning Näitaja",
});
const TABLE_TITLES = Object.freeze({
  KK51: "Metsavaru riikliku metsainventeerimise (SMI) hinnangul",
  MM03: "Metsaraie riikliku metsainventeerimise (SMI) hinnangul",
});

// Order matters: the first matching pattern wins, so the more specific
// hectare-stock and increment rows come before the generic stock row.
const KK51_INDICATORS = Object.freeze([
  { code: "34", label: "Territooriumi metsasus, %", name: "Territooriumi metsasus", unit: "%", key: "metsasus", max: 100, pattern: /\bmetsasus\w*/u },
  { code: "18", label: "Puistute keskmine hektarivaru, m³/ha", name: "Puistute keskmine hektarivaru", unit: "m³/ha", key: "hektarivaru", max: 1_000, pattern: /\bhektarivaru\w*|\bhektari\s+(?:tagavara|varu)\w*|\b(?:tagavara|varu)\w*\s+hektari\s+kohta\b/u },
  { code: "26", label: "Puistute varu juurdekasv enamuspuuliigiti aastas, m³/ha", name: "Puistute varu juurdekasv aastas", unit: "m³/ha", key: "juurdekasv", max: 100, pattern: /\bjuurdekasv\w*/u },
  { code: "10", label: "Puistute üldvaru, tuhat m³", name: "Puistute üldvaru", unit: "tuhat m³", key: "uldvaru", max: 1_000_000, pattern: /\btagavara\w*|\buldvaru\w*|\bpuidu\s?varu\w*|\bmetsavaru\w*|\bkasvava\s+metsa\s+varu\w*/u },
  { code: "2", label: "Puistute pindala, tuhat ha", name: "Puistute pindala", unit: "tuhat ha", key: "puistute-pindala", max: 5_000, pattern: /\bpuistu\w*\s+pindala\w*|\bmetsaga\s+kaetud\b/u },
  { code: "1", label: "Metsamaa pindala, tuhat ha", name: "Metsamaa pindala", unit: "tuhat ha", key: "metsamaa-pindala", max: 5_000, pattern: /\bmetsamaa\w*|\bmetsa(?:de)?\s+pindala\w*|\bmetsa\s+maa\b/u },
].map((item) => Object.freeze(item)));

const MM03_CUT_TYPES = Object.freeze([
  { code: "3", label: "..lageraie", name: "Lageraie", pattern: /\blageraie\w*/u },
  { code: "5", label: "..harvendusraie", name: "Harvendusraie", pattern: /\bharvendus\w*/u },
  { code: "1", label: "Koguraie", name: "Koguraie", pattern: /\b(?:raie\w*|raiu\w*|raiemah\w*|raiepindala\w*)/u },
].map((item) => Object.freeze(item)));

const MM03_MEASURES = Object.freeze({
  area: Object.freeze({ code: "1", errorCode: "2", label: "Raiepindala, tuhat ha", errorLabel: "Raiepindala suhteline viga, %", name: "raiepindala", unit: "tuhat ha", max: 500 }),
  volume: Object.freeze({ code: "3", errorCode: "4", label: "Raiemaht, tuhat m³", errorLabel: "Raiemahu suhteline viga, %", name: "raiemaht", unit: "tuhat m³", max: 50_000 }),
});

const NUMBER_WORDS = new Map([
  ["kahe", 2], ["kaks", 2], ["kolme", 3], ["kolm", 3], ["nelja", 4], ["neli", 4],
  ["viie", 5], ["viis", 5], ["kuue", 6], ["kuus", 6], ["seitsme", 7], ["seitse", 7],
  ["kaheksa", 8], ["uheksa", 9], ["kumne", 10], ["kumme", 10],
  ["viieteistkumne", 15], ["viisteist", 15], ["kahekumne", 20], ["kakskummend", 20],
  ["kahekumne viie", 25], ["kolmekumne", 30], ["kolmkummend", 30],
]);

const UNSUPPORTED_SCOPE = /\b(?:maakon\w*|vald\w*|valla\w*|linn\w*|piirkon\w*|rmk|riigimets\w*|eramets\w*|omanik\w*|omand\w*|kaitse\w*|natura|puuliik\w*|mand|mann(?:i|ik)\w*|kuus(?:k|e|ik)\w*|kas(?:k|e)|kaasik\w*|haab\w*|haav(?:a|ik)\w*|lep(?:p|a|ik)\w*|prognoos\w*|tulevi\w*|planeeri\w*|eesmark\w*|siht\w*|euroopa|soome|lati|leedu|rootsi|sanitaar\w*|valgustus\w*|valikraie\w*|kinnist\w*|katastri\w*|metsateati\w*|raiedokument\w*|hukkun\w*|kahjust\w*)\b/u;
const TREND_WORDS = /\b(?:aegri\w*|aegrea\w*|aastate\s+loikes|aastate\s+kaupa|aasta\s+aastalt|aastati|trend\w*|muutu\w*|dunaamika\w*|ajalug\w*|ajalooli\w*|areng\w*|kasvanud|vahenenud|langenud|tousnud|suurenenud|kahanenud|aja\s+jooksul|viimas\w*\s+aasta\w*|aastakumne\w*|kumnendi\w*)\b/u;
const COMPARISON_WORDS = /\b(?:rohkem|vahem|vorrel\w*|kui|praegu|nuud|tana|varem|suurem|vaiksem|erine\w*)\b/u;
const AREA_MEASURE = /\bpindala\w*|\bhektar\w*|\bha\b/u;
const VOLUME_MEASURE = /\bmaht\w*|\bmahu\w*|\bm3\b|\btihumeet\w*|\bkuupmeet\w*|\btm\b|\braiuti\b|\braiutakse\b|\braiutud\b/u;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^0-9a-z]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function numberFrom(token) {
  if (/^\d{1,2}$/u.test(token)) return Number(token);
  return NUMBER_WORDS.get(token) ?? null;
}

function requestedWindow(text, table) {
  const published = FOREST_SERIES_TABLE_YEARS[table];
  const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/gu)].map((match) => Number(match[0]));
  const distinctYears = [...new Set(years)].sort((left, right) => left - right);
  const range = text.match(/\b((?:19|20)\d{2})\s*(?:kuni|ja)\s*((?:19|20)\d{2})\b/u);
  const since = text.match(/\balates\s+((?:19|20)\d{2})\b|\b((?:19|20)\d{2})\s+aastast\b|\baastast\s+((?:19|20)\d{2})\b/u);
  const lastN = text.match(/\bviimas\w*\s+(\d{1,2}|kahekumne viie|[a-z]+)\s+aasta\w*/u);
  const ago = text.match(/\b(\d{1,2}|kahekumne viie|[a-z]+)\s+aasta\w*\s+tagasi\b/u);
  let window = null;
  if (since && distinctYears.length === 1) {
    window = { from: Number(since[1] || since[2] || since[3]), to: published.to, mode: "since" };
  } else if (range || distinctYears.length >= 2) {
    window = { from: distinctYears[0], to: distinctYears.at(-1), mode: "range" };
  } else if (lastN && numberFrom(lastN[1]) !== null) {
    const count = numberFrom(lastN[1]);
    window = { from: published.to - count + 1, to: published.to, mode: "last-n" };
  } else if (ago && numberFrom(ago[1]) !== null && COMPARISON_WORDS.test(text)) {
    window = { from: published.to - numberFrom(ago[1]), to: published.to, mode: "ago" };
  } else if (distinctYears.length === 0 && (TREND_WORDS.test(text) || /\bviimas\w*\s+aastakumne\w*|\bviimas\w*\s+kumnendi\w*/u.test(text))) {
    window = { from: published.to - DEFAULT_WINDOW_YEARS + 1, to: published.to, mode: "default" };
  }
  if (!window) return null;
  const from = Math.max(window.from, published.from);
  const to = Math.min(window.to, published.to);
  const count = to - from + 1;
  if (!Number.isInteger(from) || !Number.isInteger(to) || count < MIN_WINDOW_YEARS || count > MAX_WINDOW_YEARS) return null;
  return { from, to, mode: window.mode };
}

export function forestSeriesIntent(query) {
  if (typeof query !== "string" || query.length > MAX_QUERY_LENGTH) return null;
  const text = normalize(query);
  if (!text || UNSUPPORTED_SCOPE.test(text)) return null;
  const hasRaie = /\b(?:raie\w*|raiu\w*|lageraie\w*|harvendus\w*)/u.test(text);
  // No leading boundary: "netojuurdekasv" must also route to the Eurostat adapter.
  const hasIncrement = /juurdekasv\w*/u.test(text);
  const hasRemovals = /\beemalda\w*/u.test(text);
  // Harvest-versus-increment questions belong to the Eurostat balance adapter.
  if (hasIncrement && (hasRaie || hasRemovals)) return null;
  const indicator = KK51_INDICATORS.find((item) => item.pattern.test(text)) || null;
  if (indicator && hasRaie) return null;
  if (!indicator && !hasRaie) return null;
  if (indicator) {
    const years = requestedWindow(text, "KK51");
    return years ? { table: "KK51", indicator, years } : null;
  }
  const cutType = MM03_CUT_TYPES.find((item) => item.pattern.test(text));
  const asksArea = AREA_MEASURE.test(text);
  const asksVolume = VOLUME_MEASURE.test(text);
  if (!cutType || (asksArea && asksVolume)) return null;
  const measure = asksArea
    ? MM03_MEASURES.area
    : asksVolume
      ? MM03_MEASURES.volume
      : cutType.code === "3" ? MM03_MEASURES.area : MM03_MEASURES.volume;
  const years = requestedWindow(text, "MM03");
  return years ? { table: "MM03", indicator: null, cutType, measure, years } : null;
}

export function isForestSeriesQuery(query) {
  return forestSeriesIntent(query) !== null;
}

function windowYears(years) {
  const values = [];
  for (let year = years.from; year <= years.to; year += 1) values.push(String(year));
  return values;
}

export function forestSeriesRequest(intent) {
  if (!intent || !FOREST_SERIES_TABLE_YEARS[intent.table]) return null;
  const years = windowYears(intent.years);
  if (intent.table === "KK51") {
    return {
      query: [
        { code: "Näitaja", selection: { filter: "item", values: [intent.indicator.code] } },
        { code: "Aasta", selection: { filter: "item", values: years } },
      ],
      response: { format: "json-stat2" },
    };
  }
  return {
    query: [
      { code: "Aasta", selection: { filter: "item", values: years } },
      { code: "Raie liik", selection: { filter: "item", values: [intent.cutType.code] } },
      { code: "Näitaja", selection: { filter: "item", values: [intent.measure.code, intent.measure.errorCode] } },
    ],
    response: { format: "json-stat2" },
  };
}

export {
  KK51_INDICATORS as FOREST_SERIES_KK51_INDICATORS,
  MM03_CUT_TYPES as FOREST_SERIES_MM03_CUT_TYPES,
  MM03_MEASURES as FOREST_SERIES_MM03_MEASURES,
  TABLE_LABELS as FOREST_SERIES_TABLE_LABELS,
  TABLE_TITLES as FOREST_SERIES_TABLE_TITLES,
  MAX_JSON_BYTES as FOREST_SERIES_MAX_JSON_BYTES,
  MAX_OPERATIONAL_FETCH_AGE_MS as FOREST_SERIES_MAX_FETCH_AGE_MS,
  FUTURE_FETCH_SKEW_MS as FOREST_SERIES_FUTURE_SKEW_MS,
  normalize as normalizeForestSeriesText,
  windowYears as forestSeriesWindowYears,
};
// createHash, sourceEvidenceEligibility and STATISTICS_DISSEMINATION_POLICY_URL are used from Task 2 on.
void createHash; void sourceEvidenceEligibility; void STATISTICS_DISSEMINATION_POLICY_URL;
```

Notes for the implementer:
- `normalize` strips diacritics, so match `uldvaru`, `kumne`, `loikes`, `vorrel` (never `üldvaru`).
- `"metsasus 1990–2025"` clamps to 1999–2025 (27 years, allowed); `"metsamaa pindala 1990–1995"` clamps to nothing and returns null.
- `"Kas praegu raiutakse rohkem kui 20 aastat tagasi?"`: `raiutakse` matches the Koguraie pattern and `VOLUME_MEASURE`, `praegu`/`rohkem`/`kui` satisfy `COMPARISON_WORDS`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/forest-series.test.mjs`
Expected: 4 passing tests. If a query in the positive matrix returns null, print `normalizeForestSeriesText(query)` and adjust the regex rather than the test.

- [ ] **Step 5: Commit**

```bash
git add server/forest-series.mjs tests/forest-series.test.mjs
git commit -m "feat(forest-series): bind KK51/MM03 multi-year intents to bounded PXWeb requests"
```

---

### Task 2: JSON-stat2 parsing and projection re-validation

**Files:**
- Modify: `server/forest-series.mjs`
- Test: `tests/forest-series.test.mjs`
- Uses fixtures: `tests/fixtures/pxweb-kk51-metsamaa-pindala-2015-2025.json`, `tests/fixtures/pxweb-mm03-lageraie-pindala-2015-2024.json`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `forestSeriesFromJson(query, json, { fetchedAt, stale, now }) → [] | [document]` where `document._forestSeries = { table, indicatorCode, seriesLabel, sentenceLabel, unit, digits, years: {from,to}, points: [{ year, value, error? }], fetchedAt }`.
- Produces: `validatedForestSeriesProjection(query, document, now) → null | projection`.
- Produces: `forestSeriesStatement(projection)`, `forestSeriesContent(projection)`, `forestSeriesDefinition(table)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/forest-series.test.mjs` (add the new imports to the existing import block):

```js
import { readFile } from "node:fs/promises";
import {
  FOREST_SERIES_KK51_TABLE_URL,
  FOREST_SERIES_MM03_TABLE_URL,
  forestSeriesFromJson,
  validatedForestSeriesProjection,
} from "../server/forest-series.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";

const NOW = Date.parse("2026-09-25T12:00:00Z");
const FETCHED_AT = Date.parse("2026-09-25T11:59:30Z");

async function fixture(name) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function kk51Fixture(overrides = {}, { years = ["2021", "2022", "2023"], values = [2325.6, 2325, 2334.2] } = {}) {
  const payload = {
    class: "dataset",
    label: "KK51: METSAVARU RIIKLIKU METSAINVENTEERIMISE (SMI) HINNANGUL | Näitaja ning Aasta",
    source: "Statistikaamet",
    updated: "2017-12-12T07:00:00Z",
    id: ["Näitaja", "Aasta"],
    size: [1, years.length],
    dimension: {
      Näitaja: {
        extension: { show: "value" },
        label: "Näitaja",
        category: { index: { 1: 0 }, label: { 1: "Metsamaa pindala, tuhat ha" } },
      },
      Aasta: {
        extension: { show: "value" },
        label: "Aasta",
        category: {
          index: Object.fromEntries(years.map((year, position) => [year, position])),
          label: Object.fromEntries(years.map((year) => [year, year])),
        },
      },
    },
    value: values,
    role: { time: ["Aasta"] },
    version: "2.0",
    extension: { px: { tableid: "KK51", decimals: 0 } },
    ...overrides,
  };
  return JSON.stringify(payload);
}

test("KK51 live capture parses into a validated forest series document", async () => {
  const query = "Metsamaa pindala 2015–2025";
  const [document] = forestSeriesFromJson(query, await fixture("pxweb-kk51-metsamaa-pindala-2015-2025.json"), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.ok(document);
  assert.equal(document.id, "forest-series-kk51-1-2015-2025");
  assert.equal(document.url, FOREST_SERIES_KK51_TABLE_URL);
  assert.equal(document.organization, "Statistikaamet");
  assert.equal(document.retrieval, "official-structured-statistics-pxweb");
  assert.equal(document.published, "2025");
  assert.match(document.locator, /KK51\.PX[\s\S]*Näitaja=1[\s\S]*Aasta=2015–2025[\s\S]*levitamispõhimõtted/u);
  assert.equal(sourceEvidenceEligibility(document, { now: NOW }).eligible, true);
  const projection = document._forestSeries;
  assert.equal(projection.points.length, 11);
  assert.deepEqual(projection.points[0], { year: 2015, value: 2310.6 });
  assert.deepEqual(projection.points.at(-1), { year: 2025, value: 2360.2 });
  assert.match(document.summary, /^Statistikaameti tabeli KK51 \(SMI hinnang\) järgi oli metsamaa pindala 2015\. aastal 2 310,6 tuhat ha ja 2025\. aastal 2 360,2 tuhat ha\./u);
  assert.match(document.summary, /väikseim avaldatud väärtus oli 2 310,6 tuhat ha \(2015\) ja suurim 2 360,2 tuhat ha \(2025\); avaldatud aastaid on 11\./u);
  assert.match(document.summary, /Otspunktide vahe on 49,6 tuhat ha, kuid vahepealsed tõusud ja langused/u);
  assert.match(document.content, /proovitükkidel põhinev valikuuring/u);
  assert.match(document.content, /„updated” välja ei kasutata/u);
  assert.doesNotMatch(`${document.summary} ${document.content}`, /2017-12-12/u);
  assert.deepEqual(validatedForestSeriesProjection(query, document, NOW), projection);
});

test("MM03 live capture keeps the relative error beside each lageraie value", async () => {
  const query = "lageraie pindala 2015–2024";
  const [document] = forestSeriesFromJson(query, await fixture("pxweb-mm03-lageraie-pindala-2015-2024.json"), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.ok(document);
  assert.equal(document.id, "forest-series-mm03-3-1-2015-2024");
  assert.equal(document.url, FOREST_SERIES_MM03_TABLE_URL);
  assert.equal(document.published, "2024");
  const projection = document._forestSeries;
  assert.equal(projection.seriesLabel, "Lageraie: raiepindala");
  assert.equal(projection.unit, "tuhat ha");
  assert.deepEqual(projection.points[0], { year: 2015, value: 31.6, error: 10.3 });
  assert.deepEqual(projection.points.at(-1), { year: 2024, value: 34, error: 10.7 });
  assert.match(document.summary, /lageraie raiepindala 2015\. aastal 31,6 tuhat ha ja 2024\. aastal 34,0 tuhat ha/u);
  assert.match(document.summary, /2024\. aasta hinnangu suhteline viga oli ±10,7%\./u);
  assert.match(document.content, /ei ole raiedokumentide \(metsateatiste\) alusel/u);
  assert.deepEqual(validatedForestSeriesProjection(query, document, NOW), projection);
});

test("forest series parser rejects schema drift, stale fetches and out-of-bound values", () => {
  const query = "Metsamaa pindala 2021–2023";
  const accepted = forestSeriesFromJson(query, kk51Fixture(), { now: NOW, fetchedAt: FETCHED_AT });
  assert.equal(accepted.length, 1);
  const rejected = [
    ["wrong label", kk51Fixture({ label: "KK51: MIDAGI MUUD | Näitaja ning Aasta" })],
    ["wrong source", kk51Fixture({ source: "Keegi teine" })],
    ["wrong tableid", kk51Fixture({ extension: { px: { tableid: "KK52", decimals: 0 } } })],
    ["wrong decimals", kk51Fixture({ extension: { px: { tableid: "KK51", decimals: 1 } } })],
    ["wrong size", kk51Fixture({ size: [1, 2] })],
    ["status present", kk51Fixture({ status: { 0: "e" } })],
    ["value too large", kk51Fixture({}, { values: [2325.6, 9_999, 2334.2] })],
    ["negative value", kk51Fixture({}, { values: [2325.6, -1, 2334.2] })],
    ["string value", kk51Fixture({}, { values: [2325.6, "2325", 2334.2] })],
    ["extra dimension key", kk51Fixture({ dimension: { ...JSON.parse(kk51Fixture()).dimension, Maakond: {} } })],
    ["wrong year order", kk51Fixture({}, { years: ["2021", "2023", "2022"] })],
    ["fewer years than requested", kk51Fixture({}, { years: ["2021", "2022"], values: [1, 2] })],
    ["all null", kk51Fixture({}, { values: [null, null, null] })],
    ["one point only", kk51Fixture({}, { values: [null, null, 2334.2] })],
    ["not json", "<html>"],
    ["nul byte", `${kk51Fixture()}\0`],
  ];
  for (const [reason, body] of rejected) {
    assert.deepEqual(forestSeriesFromJson(query, body, { now: NOW, fetchedAt: FETCHED_AT }), [], reason);
  }
  assert.deepEqual(forestSeriesFromJson(query, kk51Fixture(), { now: NOW, fetchedAt: FETCHED_AT, stale: true }), [], "stale");
  assert.deepEqual(forestSeriesFromJson(query, kk51Fixture(), { now: NOW, fetchedAt: NOW + 10 * 60_000 }), [], "future fetch");
  assert.deepEqual(forestSeriesFromJson(query, kk51Fixture(), { now: NOW, fetchedAt: NOW - 14 * 60 * 60_000 }), [], "old fetch");
  assert.deepEqual(forestSeriesFromJson("Metsamaa pindala 2024", kk51Fixture(), { now: NOW, fetchedAt: FETCHED_AT }), [], "no intent");
});

test("forest series parser reports an unpublished year as a gap", () => {
  const query = "Metsamaa pindala 2021–2023";
  const [document] = forestSeriesFromJson(query, kk51Fixture({}, { values: [2325.6, null, 2334.2] }), { now: NOW, fetchedAt: FETCHED_AT });
  assert.deepEqual(document._forestSeries.points.map((point) => point.year), [2021, 2023]);
  assert.match(document.summary, /avaldatud aastaid on 2\. Aastate 2022 kohta ei ole väärtust avaldatud\./u);
  assert.match(document.summary, /Rida ei langenud ühelgi avaldatud aastal; otspunktide vahe on 8,6 tuhat ha\./u);
});

test("forest series projection re-validation rejects tampered documents", () => {
  const query = "Metsamaa pindala 2021–2023";
  const [document] = forestSeriesFromJson(query, kk51Fixture(), { now: NOW, fetchedAt: FETCHED_AT });
  assert.ok(validatedForestSeriesProjection(query, document, NOW));
  const tampered = [
    { ...document, summary: `${document.summary} Lisatud lause.` },
    { ...document, url: "https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM04" },
    { ...document, _forestSeries: { ...document._forestSeries, points: [{ year: 2021, value: 1 }, { year: 2023, value: 2 }] } },
    { ...document, _forestSeries: { ...document._forestSeries, years: { from: 2020, to: 2023 } } },
    { ...document, _contentHash: "abc" },
  ];
  for (const candidate of tampered) assert.equal(validatedForestSeriesProjection(query, candidate, NOW), null);
  assert.equal(validatedForestSeriesProjection("Metsamaa pindala 2020–2023", document, NOW), null, "different window");
  assert.equal(validatedForestSeriesProjection(query, document, NOW + 14 * 60 * 60_000), null, "expired fetch");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/forest-series.test.mjs`
Expected: the new tests FAIL with `forestSeriesFromJson is not a function` (or "does not provide an export named").

- [ ] **Step 3: Implement parsing, text and re-validation**

Replace the trailing `void createHash; ...` line in `server/forest-series.mjs` with:

```js
function numericTimestamp(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function exactArray(value, expected) {
  return Array.isArray(value) && value.length === expected.length
    && value.every((item, index) => item === expected[index]);
}

function validDimension(dimension, id, codes, labels) {
  return exactKeys(dimension, ["extension", "label", "category"])
    && dimension.label === id
    && exactKeys(dimension.extension, ["show"])
    && dimension.extension.show === "value"
    && exactKeys(dimension.category, ["index", "label"])
    && exactKeys(dimension.category.index, codes)
    && codes.every((code, position) => dimension.category.index[code] === position)
    && exactKeys(dimension.category.label, codes)
    && codes.every((code) => dimension.category.label[code] === labels[code]);
}

function boundedValue(value, max) {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : NaN;
}

export function etNumber(value, digits) {
  const [whole, fraction] = Math.abs(value).toFixed(digits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, " ");
  return `${value < 0 ? "−" : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
}

function unitDigits(unit) {
  return unit === "tuhat m³" ? 0 : 1;
}

function missingYears(projection) {
  const published = new Set(projection.points.map((point) => point.year));
  const missing = [];
  for (let year = projection.years.from; year <= projection.years.to; year += 1) {
    if (!published.has(year)) missing.push(String(year));
  }
  return missing;
}

function trendSentence(projection) {
  const values = projection.points.map((point) => point.value);
  const nonDecreasing = values.every((value, index) => index === 0 || value >= values[index - 1]);
  const nonIncreasing = values.every((value, index) => index === 0 || value <= values[index - 1]);
  const difference = etNumber(Math.abs(values.at(-1) - values[0]), projection.digits);
  if (nonDecreasing && nonIncreasing) return "Väärtus püsis kogu perioodil samal tasemel.";
  if (nonDecreasing) return `Rida ei langenud ühelgi avaldatud aastal; otspunktide vahe on ${difference} ${projection.unit}.`;
  if (nonIncreasing) return `Rida ei tõusnud ühelgi avaldatud aastal; otspunktide vahe on ${difference} ${projection.unit}.`;
  return `Otspunktide vahe on ${difference} ${projection.unit}, kuid vahepealsed tõusud ja langused tähendavad, et seda ei saa kirjeldada ühtlase trendina.`;
}

export function forestSeriesStatement(projection) {
  const { points, unit, digits } = projection;
  const first = points[0];
  const last = points.at(-1);
  const min = points.reduce((best, point) => (point.value < best.value ? point : best), points[0]);
  const max = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  const gaps = missingYears(projection);
  const errorSentence = last.error === undefined
    ? ""
    : ` ${last.year}. aasta hinnangu suhteline viga oli ±${etNumber(last.error, 1)}%.`;
  return `Statistikaameti tabeli ${projection.table} (SMI hinnang) järgi oli ${projection.sentenceLabel} ${first.year}. aastal ${etNumber(first.value, digits)} ${unit} ja ${last.year}. aastal ${etNumber(last.value, digits)} ${unit}. `
    + `Perioodi ${projection.years.from}–${projection.years.to} väikseim avaldatud väärtus oli ${etNumber(min.value, digits)} ${unit} (${min.year}) ja suurim ${etNumber(max.value, digits)} ${unit} (${max.year}); avaldatud aastaid on ${points.length}.`
    + (gaps.length ? ` Aastate ${gaps.join(", ")} kohta ei ole väärtust avaldatud.` : "")
    + ` ${trendSentence(projection)}${errorSentence}`;
}

export function forestSeriesDefinition(table) {
  return table === "KK51"
    ? "Näitaja pärineb riiklikust metsainventeerimisest (SMI), mis on proovitükkidel põhinev valikuuring; iga aasta väärtus on statistiline hinnang, mitte kõigi metsade otsene ülelugemine. Tagavara ei ole aastane raiemaht ega automaatselt raiutav puidukogus."
    : "Näitaja pärineb riiklikust metsainventeerimisest (SMI) ja on proovitükkidel põhinev statistiline hinnang koos suhtelise veaga; see ei ole raiedokumentide (metsateatiste) alusel koostatud raiestatistika ega konkreetse kinnistu raiemaht.";
}

export function forestSeriesContent(projection) {
  return `${forestSeriesStatement(projection)} ${forestSeriesDefinition(projection.table)} JSON-stat2 vastuse eksitavat „updated” välja ei kasutata avaldamisaja ega värskuse tõendina.`;
}

function seriesDescriptor(intent) {
  if (intent.table === "KK51") {
    return {
      indicatorCode: intent.indicator.code,
      seriesLabel: intent.indicator.name,
      sentenceLabel: intent.indicator.name.toLocaleLowerCase("et"),
      unit: intent.indicator.unit,
      max: intent.indicator.max,
      idSuffix: intent.indicator.code,
      selections: `Näitaja=${intent.indicator.code} (${intent.indicator.label})`,
    };
  }
  return {
    indicatorCode: `${intent.cutType.code}-${intent.measure.code}`,
    seriesLabel: `${intent.cutType.name}: ${intent.measure.name}`,
    sentenceLabel: `${intent.cutType.name.toLocaleLowerCase("et")} ${intent.measure.name}`,
    unit: intent.measure.unit,
    max: intent.measure.max,
    idSuffix: `${intent.cutType.code}-${intent.measure.code}`,
    selections: `Raie liik=${intent.cutType.code} (${intent.cutType.label}), Näitaja=${intent.measure.code} ja ${intent.measure.errorCode} (${intent.measure.label}; ${intent.measure.errorLabel})`,
  };
}

function parsePayload(intent, payload) {
  const years = windowYears(intent.years);
  const yearLabels = Object.fromEntries(years.map((year) => [year, year]));
  const base = payload && typeof payload === "object" && !Array.isArray(payload)
    && payload.class === "dataset" && payload.version === "2.0"
    && payload.label === TABLE_LABELS[intent.table] && payload.source === "Statistikaamet"
    && exactKeys(payload.role, ["time"]) && exactArray(payload.role.time, ["Aasta"])
    && exactKeys(payload.extension, ["px"]) && exactKeys(payload.extension.px, ["tableid", "decimals"])
    && payload.extension.px.tableid === intent.table && payload.extension.px.decimals === 0
    && (payload.status === undefined || payload.status === null)
    && Array.isArray(payload.value);
  if (!base) return null;
  const descriptor = seriesDescriptor(intent);
  const points = [];
  if (intent.table === "KK51") {
    if (!exactArray(payload.id, ["Näitaja", "Aasta"]) || !exactArray(payload.size, [1, years.length])
      || !exactKeys(payload.dimension, ["Näitaja", "Aasta"])
      || !validDimension(payload.dimension["Näitaja"], "Näitaja", [intent.indicator.code], { [intent.indicator.code]: intent.indicator.label })
      || !validDimension(payload.dimension.Aasta, "Aasta", years, yearLabels)
      || payload.value.length !== years.length) return null;
    for (const [index, year] of years.entries()) {
      const value = boundedValue(payload.value[index], descriptor.max);
      if (Number.isNaN(value)) return null;
      if (value !== null) points.push({ year: Number(year), value });
    }
  } else {
    const measureCodes = [intent.measure.code, intent.measure.errorCode];
    if (!exactArray(payload.id, ["Aasta", "Raie liik", "Näitaja"]) || !exactArray(payload.size, [years.length, 1, 2])
      || !exactKeys(payload.dimension, ["Aasta", "Raie liik", "Näitaja"])
      || !validDimension(payload.dimension.Aasta, "Aasta", years, yearLabels)
      || !validDimension(payload.dimension["Raie liik"], "Raie liik", [intent.cutType.code], { [intent.cutType.code]: intent.cutType.label })
      || !validDimension(payload.dimension["Näitaja"], "Näitaja", measureCodes, { [intent.measure.code]: intent.measure.label, [intent.measure.errorCode]: intent.measure.errorLabel })
      || payload.value.length !== years.length * 2) return null;
    for (const [index, year] of years.entries()) {
      const value = boundedValue(payload.value[index * 2], descriptor.max);
      const error = boundedValue(payload.value[index * 2 + 1], 100);
      if (Number.isNaN(value) || Number.isNaN(error)) return null;
      if (value === null) continue;
      points.push(error === null ? { year: Number(year), value } : { year: Number(year), value, error });
    }
  }
  if (points.length < MIN_WINDOW_YEARS) return null;
  return { descriptor, points };
}

export function forestSeriesFromJson(query, json, options = {}) {
  const intent = forestSeriesIntent(query);
  const input = String(json || "");
  const now = numericTimestamp(options.now, Date.now());
  const fetchedTimestamp = numericTimestamp(options.fetchedAt, Number.NaN);
  if (!intent || !input || !Number.isFinite(now) || !Number.isFinite(fetchedTimestamp)
    || Buffer.byteLength(input, "utf8") > MAX_JSON_BYTES
    || input.includes("\0") || options.stale === true
    || fetchedTimestamp > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedTimestamp > MAX_OPERATIONAL_FETCH_AGE_MS) return [];
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return [];
  }
  const parsed = parsePayload(intent, payload);
  if (!parsed) return [];
  const { descriptor, points } = parsed;
  const projection = {
    table: intent.table,
    indicatorCode: descriptor.indicatorCode,
    seriesLabel: descriptor.seriesLabel,
    sentenceLabel: descriptor.sentenceLabel,
    unit: descriptor.unit,
    digits: unitDigits(descriptor.unit),
    years: { from: intent.years.from, to: intent.years.to },
    points,
    fetchedAt: new Date(fetchedTimestamp).toISOString(),
  };
  const apiUrl = intent.table === "KK51" ? FOREST_SERIES_KK51_API_URL : FOREST_SERIES_MM03_API_URL;
  const tableUrl = intent.table === "KK51" ? FOREST_SERIES_KK51_TABLE_URL : FOREST_SERIES_MM03_TABLE_URL;
  const lastYear = points.at(-1).year;
  return [{
    id: `forest-series-${intent.table.toLowerCase()}-${descriptor.idSuffix}-${intent.years.from}-${intent.years.to}`,
    title: `Statistikaamet ${intent.table}: ${descriptor.seriesLabel} ${intent.years.from}–${intent.years.to}`,
    organization: "Statistikaamet",
    type: "Ametlik aastastatistika (JSON-stat2)",
    published: String(lastYear),
    url: tableUrl,
    locator: `PXWeb POST: ${apiUrl}; valikud ${descriptor.selections}, Aasta=${intent.years.from}–${intent.years.to}; levitamispõhimõtted ja litsents: ${STATISTICS_DISSEMINATION_POLICY_URL}`,
    summary: forestSeriesStatement(projection),
    content: forestSeriesContent(projection),
    topics: ["mets", "SMI", "aegrida", descriptor.seriesLabel, intent.table, String(intent.years.from), String(intent.years.to)],
    tags: ["Statistikaamet", "mets", "SMI", "aegrida", intent.table, "CC BY-SA 4.0"],
    sourceTier: "official",
    retrieval: "official-structured-statistics-pxweb",
    delivery: "structured-or-download",
    routeClasses: ["official_indicator_or_report", "official_historical_observation", "official_data_or_api"],
    evidencePolicy: "claim-specific",
    freshness: {
      class: "annual-historical-statistic",
      basis: "reference-year",
      maxAgeMs: null,
      requiresSourceTimestamp: false,
    },
    _answerEvidenceEligible: true,
    _contentHash: createHash("sha256").update(input).digest("hex"),
    _forestSeries: projection,
  }];
}

function validPoint(point, unitMax) {
  return point && typeof point === "object" && !Array.isArray(point)
    && Number.isInteger(point.year) && typeof point.value === "number" && Number.isFinite(point.value)
    && point.value >= 0 && point.value <= unitMax
    && (point.error === undefined || (typeof point.error === "number" && Number.isFinite(point.error) && point.error >= 0 && point.error <= 100))
    && Object.keys(point).every((key) => ["year", "value", "error"].includes(key));
}

export function validatedForestSeriesProjection(query, document, now = Date.now()) {
  const intent = forestSeriesIntent(query);
  const projection = document?._forestSeries;
  if (!intent || !projection || typeof projection !== "object") return null;
  const descriptor = seriesDescriptor(intent);
  const tableUrl = intent.table === "KK51" ? FOREST_SERIES_KK51_TABLE_URL : FOREST_SERIES_MM03_TABLE_URL;
  const fetchedAt = Date.parse(String(projection.fetchedAt || ""));
  const expectedId = `forest-series-${intent.table.toLowerCase()}-${descriptor.idSuffix}-${intent.years.from}-${intent.years.to}`;
  if (document.id !== expectedId || document.url !== tableUrl
    || document.retrieval !== "official-structured-statistics-pxweb"
    || sourceEvidenceEligibility(document, { now }).eligible !== true
    || projection.table !== intent.table || projection.indicatorCode !== descriptor.indicatorCode
    || projection.seriesLabel !== descriptor.seriesLabel || projection.sentenceLabel !== descriptor.sentenceLabel
    || projection.unit !== descriptor.unit || projection.digits !== unitDigits(descriptor.unit)
    || !projection.years || projection.years.from !== intent.years.from || projection.years.to !== intent.years.to
    || !Array.isArray(projection.points) || projection.points.length < MIN_WINDOW_YEARS
    || projection.points.length > MAX_WINDOW_YEARS
    || !projection.points.every((point) => validPoint(point, descriptor.max))
    || !projection.points.every((point, index) => index === 0 || point.year > projection.points[index - 1].year)
    || projection.points[0].year < intent.years.from || projection.points.at(-1).year > intent.years.to
    || !Number.isFinite(fetchedAt) || fetchedAt > now + FUTURE_FETCH_SKEW_MS
    || now - fetchedAt > MAX_OPERATIONAL_FETCH_AGE_MS
    || !/^[a-f0-9]{64}$/u.test(String(document._contentHash || ""))
    || document.published !== String(projection.points.at(-1).year)
    || forestSeriesStatement(projection) !== document.summary
    || forestSeriesContent(projection) !== document.content) return null;
  return projection;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/forest-series.test.mjs`
Expected: all tests pass. If `sourceEvidenceEligibility` rejects the document, compare the document's `freshness`/`evidencePolicy` fields against `statisticsWaterAbstractionFromJson` in `server/statistics.mjs:308` and match them exactly.

- [ ] **Step 5: Commit**

```bash
git add server/forest-series.mjs tests/forest-series.test.mjs tests/fixtures/pxweb-kk51-metsamaa-pindala-2015-2025.json tests/fixtures/pxweb-mm03-lageraie-pindala-2015-2024.json
git commit -m "feat(forest-series): parse and re-validate KK51/MM03 year series"
```

---

### Task 3: Compose the answer with its chart

**Files:**
- Modify: `server/forest-series.mjs`
- Test: `tests/forest-series.test.mjs`

**Interfaces:**
- Consumes: Task 2.
- Produces: `composeForestSeriesResponse(query, documents, { total, now }) → null | response` with `response.chart` following the contract in Global Constraints and `response.evidence.kind === "structured-forest-series"`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/forest-series.test.mjs` (add `composeForestSeriesResponse` to the import):

```js
test("forest series response carries a cited line chart built from the same points", async () => {
  const query = "lageraie pindala 2015–2024";
  const documents = forestSeriesFromJson(query, await fixture("pxweb-mm03-lageraie-pindala-2015-2024.json"), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  const response = composeForestSeriesResponse(query, documents, { now: NOW, total: 7 });
  assert.ok(response);
  assert.equal(response.total, 7);
  assert.equal(response.answer.eyebrow, "Statistikaameti tabel MM03");
  assert.equal(response.answer.title, "Lageraie: raiepindala 2015–2024: 31,6 → 34,0 tuhat ha");
  assert.equal(response.answer.intro, documents[0].summary);
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.equal(response.answer.parts.length, 1);
  assert.equal(response.answer.parts[0].title, "Mida näitaja tähendab");
  assert.match(response.answer.parts[0].text, /raiedokumentide/u);
  assert.deepEqual(response.answer.parts[0].citations, [1]);
  assert.match(response.answer.note, /SMI valikuuringu aastahinnangute rida/u);
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].citation, 1);
  assert.equal(response.sources[0].evidenceExcerpt, documents[0].content);
  assert.equal(response.related.length, 3);
  assert.equal(response.clarification, null);
  assert.deepEqual(response.evidence, { kind: "structured-forest-series", answerable: true, documentIds: [documents[0].id] });
  assert.deepEqual(response.chart, {
    kind: "line",
    title: "Lageraie: raiepindala 2015–2024",
    unit: "tuhat ha",
    xLabel: "Aasta",
    series: [{
      id: "mm03-3-1",
      label: "Lageraie: raiepindala",
      points: documents[0]._forestSeries.points.map((point) => ({ x: point.year, y: point.value, error: point.error })),
    }],
    citation: 1,
    caption: "Statistikaamet, tabel MM03: Metsaraie riikliku metsainventeerimise (SMI) hinnangul. SMI valikuuringu aastahinnangud koos suhtelise veaga.",
  });
});

test("forest series response refuses a document that does not re-validate for the query", async () => {
  const documents = forestSeriesFromJson("Metsamaa pindala 2015–2025", await fixture("pxweb-kk51-metsamaa-pindala-2015-2025.json"), {
    now: NOW,
    fetchedAt: FETCHED_AT,
  });
  assert.equal(composeForestSeriesResponse("Metsamaa pindala 2016–2025", documents, { now: NOW }), null);
  assert.equal(composeForestSeriesResponse("Metsamaa pindala 2015–2025", [], { now: NOW }), null);
  assert.equal(composeForestSeriesResponse("Metsamaa pindala 2015–2025", documents, { now: NOW + 14 * 60 * 60_000 }), null);
  const response = composeForestSeriesResponse("Metsamaa pindala 2015–2025", documents, { now: NOW });
  assert.equal(response.answer.eyebrow, "Statistikaameti tabel KK51");
  assert.equal(response.chart.series[0].id, "kk51-1");
  assert.deepEqual(response.chart.series[0].points[0], { x: 2015, y: 2310.6 });
  assert.equal(response.chart.caption, "Statistikaamet, tabel KK51: Metsavaru riikliku metsainventeerimise (SMI) hinnangul. SMI valikuuringu aastahinnangud.");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/forest-series.test.mjs`
Expected: FAIL, `composeForestSeriesResponse` is not exported.

- [ ] **Step 3: Implement the composer**

Append to `server/forest-series.mjs`:

```js
const RELATED_QUESTIONS = Object.freeze({
  KK51: Object.freeze(["Kas raiemaht ületab juurdekasvu?", "Kui suur osa Eestist on mets?", "Lageraie pindala viimase kümne aasta jooksul"]),
  MM03: Object.freeze(["Kas raiemaht ületab juurdekasvu?", "Metsamaa pindala viimase kümne aasta jooksul", "Mis vahe on SMI raiemahul ja metsateatiste statistikal?"]),
});

function chartFromProjection(projection) {
  const hasError = projection.points.some((point) => point.error !== undefined);
  return {
    kind: "line",
    title: `${projection.seriesLabel} ${projection.years.from}–${projection.years.to}`,
    unit: projection.unit,
    xLabel: "Aasta",
    series: [{
      id: `${projection.table.toLowerCase()}-${projection.indicatorCode}`,
      label: projection.seriesLabel,
      points: projection.points.map((point) => (
        point.error === undefined ? { x: point.year, y: point.value } : { x: point.year, y: point.value, error: point.error }
      )),
    }],
    citation: 1,
    caption: `Statistikaamet, tabel ${projection.table}: ${TABLE_TITLES[projection.table]}. SMI valikuuringu aastahinnangud${hasError ? " koos suhtelise veaga" : ""}.`,
  };
}

export function composeForestSeriesResponse(query, documents = [], options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const source = (documents || []).find((document) => validatedForestSeriesProjection(query, document, now));
  if (!source) return null;
  const projection = source._forestSeries;
  const first = projection.points[0];
  const last = projection.points.at(-1);
  return {
    query: String(query || "").trim(),
    total: Number(options.total || documents.length || 1),
    generatedAt: new Date(now).toISOString(),
    answer: {
      eyebrow: `Statistikaameti tabel ${projection.table}`,
      title: `${projection.seriesLabel} ${projection.years.from}–${projection.years.to}: ${etNumber(first.value, projection.digits)} → ${etNumber(last.value, projection.digits)} ${projection.unit}`,
      intro: source.summary,
      introCitations: [1],
      parts: [{
        title: "Mida näitaja tähendab",
        text: forestSeriesDefinition(projection.table),
        citations: [1],
      }],
      note: "See on SMI valikuuringu aastahinnangute rida ühe tabeli ja näitaja kohta. See ei ole prognoos, kohaliku omavalitsuse või kinnistu näitaja ega otsus metsamajanduse kestlikkuse kohta.",
    },
    sources: [{ ...source, citation: 1, evidenceExcerpt: source.content }],
    related: [...RELATED_QUESTIONS[projection.table]],
    clarification: null,
    evidence: {
      kind: "structured-forest-series",
      answerable: true,
      documentIds: [source.id],
    },
    chart: chartFromProjection(projection),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/forest-series.test.mjs`
Expected: all pass. Note the MM03 expected chart uses `error: point.error`; `deepEqual` treats `{ error: undefined }` and a missing key differently, so the test's `map` must produce the same shape as `chartFromProjection` (every MM03 fixture point has an error, so it does).

- [ ] **Step 5: Commit**

```bash
git add server/forest-series.mjs tests/forest-series.test.mjs
git commit -m "feat(forest-series): compose deterministic answer with cited line chart"
```

---

### Task 4: Chart contract validation in the public response and cache

**Files:**
- Create: `server/answer-chart.mjs`
- Modify: `server/pipeline.mjs:53` (revision), `server/pipeline.mjs:906-1003` (`publicResponse`)
- Modify: `server/database.mjs:327-431` (`sanitizeCachedResponse`)
- Test: `tests/answer-chart.test.mjs` (new), `tests/citation-policy.test.mjs`

**Interfaces:**
- Produces: `validPublicChart(chart, sources) → boolean` and `boundedChart(chart) → chart` (deep copy with only contract keys) from `server/answer-chart.mjs`.
- `publicResponse` output gains `chart` (with `citation` remapped to the compact public numbering) or no `chart` key.

- [ ] **Step 1: Write the failing tests**

Create `tests/answer-chart.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { boundedChart, validPublicChart } from "../server/answer-chart.mjs";

const sources = [{ citation: 1, url: "https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM03" }, { citation: 2, url: "https://ec.europa.eu/eurostat/x" }];

function chart(overrides = {}) {
  return {
    kind: "line",
    title: "Lageraie: raiepindala 2015–2024",
    unit: "tuhat ha",
    xLabel: "Aasta",
    series: [{ id: "mm03-3-1", label: "Lageraie: raiepindala", points: [{ x: 2015, y: 31.6, error: 10.3 }, { x: 2016, y: 32.4 }] }],
    citation: 1,
    caption: "Statistikaamet, tabel MM03.",
    ...overrides,
  };
}

test("validPublicChart accepts the documented contract", () => {
  assert.equal(validPublicChart(chart(), sources), true);
  assert.equal(validPublicChart(chart({ kind: "bar", caption: undefined, xLabel: undefined }), sources), true);
  assert.equal(validPublicChart(chart({ series: [chart().series[0], { id: "b", label: "B", points: [{ x: 2015, y: 1 }, { x: 2016, y: 2 }] }, { id: "c", label: "C", points: [{ x: 2015, y: 1 }, { x: 2017, y: 2 }] }] }), sources), true);
});

test("validPublicChart rejects every contract violation", () => {
  const bad = [
    ["null", null],
    ["array", []],
    ["kind", chart({ kind: "pie" })],
    ["title empty", chart({ title: "  " })],
    ["title long", chart({ title: "x".repeat(161) })],
    ["unit long", chart({ unit: "x".repeat(41) })],
    ["caption long", chart({ caption: "x".repeat(201) })],
    ["no series", chart({ series: [] })],
    ["four series", chart({ series: Array.from({ length: 4 }, (_, index) => ({ id: `s${index}`, label: "S", points: [{ x: 2015, y: 1 }, { x: 2016, y: 2 }] })) })],
    ["one point", chart({ series: [{ id: "a", label: "A", points: [{ x: 2015, y: 1 }] }] })],
    ["41 points", chart({ series: [{ id: "a", label: "A", points: Array.from({ length: 41 }, (_, index) => ({ x: 2000 + index, y: index })) }] })],
    ["x not integer", chart({ series: [{ id: "a", label: "A", points: [{ x: 2015.5, y: 1 }, { x: 2016, y: 2 }] }] })],
    ["x out of range", chart({ series: [{ id: "a", label: "A", points: [{ x: 1800, y: 1 }, { x: 2016, y: 2 }] }] })],
    ["x not increasing", chart({ series: [{ id: "a", label: "A", points: [{ x: 2016, y: 1 }, { x: 2015, y: 2 }] }] })],
    ["y NaN", chart({ series: [{ id: "a", label: "A", points: [{ x: 2015, y: Number.NaN }, { x: 2016, y: 2 }] }] })],
    ["y string", chart({ series: [{ id: "a", label: "A", points: [{ x: 2015, y: "1" }, { x: 2016, y: 2 }] }] })],
    ["error negative", chart({ series: [{ id: "a", label: "A", points: [{ x: 2015, y: 1, error: -1 }, { x: 2016, y: 2 }] }] })],
    ["extra point key", chart({ series: [{ id: "a", label: "A", points: [{ x: 2015, y: 1, z: 1 }, { x: 2016, y: 2 }] }] })],
    ["label long", chart({ series: [{ id: "a", label: "x".repeat(81), points: [{ x: 2015, y: 1 }, { x: 2016, y: 2 }] }] })],
    ["citation unknown", chart({ citation: 3 })],
    ["citation zero", chart({ citation: 0 })],
    ["citation string", chart({ citation: "1" })],
    ["extra chart key", chart({ html: "<b>" })],
  ];
  for (const [reason, candidate] of bad) assert.equal(validPublicChart(candidate, sources), false, reason);
  assert.equal(validPublicChart(chart(), [{ citation: 1 }, { citation: 1 }]), false, "duplicate citation");
});

test("boundedChart copies only contract keys", () => {
  const copy = boundedChart({ ...chart(), extra: 1, series: [{ ...chart().series[0], extra: 2 }] });
  assert.deepEqual(Object.keys(copy).sort(), ["caption", "citation", "kind", "series", "title", "unit", "xLabel"]);
  assert.deepEqual(Object.keys(copy.series[0]).sort(), ["id", "label", "points"]);
  assert.deepEqual(copy.series[0].points[0], { x: 2015, y: 31.6, error: 10.3 });
  assert.deepEqual(copy.series[0].points[1], { x: 2016, y: 32.4 });
});
```

Append to `tests/citation-policy.test.mjs` (add `sanitizeCachedResponse`/`restoreCachedResponse` are already imported):

```js
function chartFor(citation) {
  return {
    kind: "line",
    title: "Test",
    unit: "%",
    series: [{ id: "a", label: "A", points: [{ x: 2020, y: 1 }, { x: 2021, y: 2 }] }],
    citation,
  };
}

test("publicResponse keeps a valid chart, remaps its citation and drops an invalid one", () => {
  const uncited = source({ id: "uncited", citation: 1, url: "https://keskkonnaportaal.ee/et/uncited" });
  const cited = source({ id: "cited", citation: 2, url: "https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM03" });
  const draft = {
    ...citedDraft([uncited, cited]),
    answer: { ...citedDraft([]).answer, introCitations: [2] },
    chart: chartFor(2),
  };
  const response = publicResponse(draft);
  assert.deepEqual(response.sources.map((item) => item.id), ["cited"]);
  assert.equal(response.chart.citation, 1);
  assert.equal(response.chart.series[0].points.length, 2);

  const chartOnly = publicResponse({ ...citedDraft([uncited, cited]), answer: { ...citedDraft([]).answer, introCitations: [1] }, chart: chartFor(2) });
  assert.deepEqual(chartOnly.sources.map((item) => item.id).sort(), ["cited", "uncited"]);
  assert.equal(chartOnly.chart.citation, chartOnly.sources.find((item) => item.id === "cited").citation);

  const invalid = publicResponse({ ...citedDraft([source()]), chart: { ...chartFor(1), kind: "pie" } });
  assert.equal(invalid.chart, undefined);
  assert.equal(invalid.answer.title, "Kontrollitud fakt");

  const unresolved = publicResponse({ ...citedDraft([source()]), chart: chartFor(9) });
  assert.equal(unresolved.chart, undefined);
});

test("cache sanitizer retains a valid chart and drops an invalid one", () => {
  const draft = { ...citedDraft([source()]), query: "kontrollitud küsimus", chart: chartFor(1) };
  const safe = sanitizeCachedResponse(draft, "kontrollitud küsimus");
  assert.deepEqual(safe.chart, chartFor(1));
  const restored = restoreCachedResponse(safe, "kontrollitud küsimus");
  assert.deepEqual(restored.chart, chartFor(1));
  const invalid = sanitizeCachedResponse({ ...draft, chart: { ...chartFor(1), citation: 7 } }, "kontrollitud küsimus");
  assert.equal(invalid.chart, undefined);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/answer-chart.test.mjs tests/citation-policy.test.mjs`
Expected: `answer-chart` fails on missing module; the two new citation-policy tests fail (`response.chart` undefined).

- [ ] **Step 3: Create `server/answer-chart.mjs`**

```js
const CHART_KINDS = new Set(["line", "bar"]);
const CHART_KEYS = new Set(["kind", "title", "unit", "xLabel", "series", "citation", "caption"]);
const SERIES_KEYS = new Set(["id", "label", "points"]);
const POINT_KEYS = new Set(["x", "y", "error"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, maximum, { required = false } = {}) {
  if (value === undefined) return !required;
  return typeof value === "string" && (!required || value.trim().length > 0) && value.length <= maximum;
}

function validPoint(point) {
  return isPlainObject(point)
    && Object.keys(point).every((key) => POINT_KEYS.has(key))
    && Number.isInteger(point.x) && point.x >= 1850 && point.x <= 2100
    && typeof point.y === "number" && Number.isFinite(point.y)
    && (point.error === undefined
      || (typeof point.error === "number" && Number.isFinite(point.error) && point.error >= 0 && point.error <= 1000));
}

function validSeries(series) {
  return isPlainObject(series)
    && Object.keys(series).every((key) => SERIES_KEYS.has(key))
    && boundedString(series.id, 60, { required: true })
    && boundedString(series.label, 80, { required: true })
    && Array.isArray(series.points) && series.points.length >= 2 && series.points.length <= 40
    && series.points.every(validPoint)
    && series.points.every((point, index) => index === 0 || point.x > series.points[index - 1].x);
}

export function validPublicChart(chart, sources = []) {
  if (!isPlainObject(chart) || !Object.keys(chart).every((key) => CHART_KEYS.has(key))) return false;
  if (!CHART_KINDS.has(chart.kind)) return false;
  if (!boundedString(chart.title, 160, { required: true }) || !boundedString(chart.unit, 40, { required: true })) return false;
  if (!boundedString(chart.xLabel, 40) || !boundedString(chart.caption, 200)) return false;
  if (!Array.isArray(chart.series) || chart.series.length < 1 || chart.series.length > 3 || !chart.series.every(validSeries)) return false;
  if (!Number.isInteger(chart.citation) || chart.citation <= 0) return false;
  const matches = (Array.isArray(sources) ? sources : []).filter((source) => Number(source?.citation) === chart.citation);
  return matches.length === 1;
}

export function boundedChart(chart) {
  return {
    kind: chart.kind,
    title: chart.title,
    unit: chart.unit,
    ...(chart.xLabel === undefined ? {} : { xLabel: chart.xLabel }),
    series: chart.series.map((series) => ({
      id: series.id,
      label: series.label,
      points: series.points.map((point) => (
        point.error === undefined ? { x: point.x, y: point.y } : { x: point.x, y: point.y, error: point.error }
      )),
    })),
    citation: chart.citation,
    ...(chart.caption === undefined ? {} : { caption: chart.caption }),
  };
}
```

- [ ] **Step 4: Wire it into `publicResponse` in `server/pipeline.mjs`**

Add the import near the other server imports at the top of `server/pipeline.mjs`:

```js
import { boundedChart, validPublicChart } from "./answer-chart.mjs";
```

Change line 53:

```js
export const SEARCH_RESPONSE_REVISION = "answer-v51-forest-series-chart";
```

In `publicResponse`, right after the `sources` constant is computed (after the `.map((source) => {...})` block ending with `return safeSource; });`), add:

```js
  const chart = validPublicChart(response.chart, sources) ? boundedChart(response.chart) : null;
```

Directly after `collectCitations(answer?.introCitations);` add:

```js
  if (chart) rawCitations.push(chart.citation);
```

In the failure branch that returns `clarification: "Vastuse allikaviiteid ei saanud üheselt kontrollida."`, add `chart: undefined,` immediately after `...response,`.

In the final `return { ...response, answer: ..., sources: ... }`, add after `...response,`:

```js
    chart: chart ? { ...chart, citation: citationMap.get(chart.citation) } : undefined,
```

`citationMap` is defined a few lines above that return (`const citationMap = new Map(visibleSources.map(...))`); because `chart.citation` was pushed into `rawCitations`, its source is always in `visibleSources`, so the lookup never yields `undefined`.

- [ ] **Step 5: Wire it into the cache sanitizer in `server/database.mjs`**

Add the import at the top of `server/database.mjs`:

```js
import { boundedChart, validPublicChart } from "./answer-chart.mjs";
```

In `sanitizeCachedResponse`, the `safe` literal builds `sources` inline. Change it so sources are computed first and the chart is validated against them: replace `const safe = {` with

```js
  const safeSources = (Array.isArray(response.sources) ? response.sources : []).slice(0, 10).map((source) => ({
```

…keeping the existing mapping body unchanged up to and including `})).filter((source) => source.id && source.title && source.url && source.citation > 0);` (this ends the `safeSources` statement, so change the trailing `,` of the old inline `sources:` property to `;`). Then build `safe` with:

```js
  const safe = {
    cacheSchema: SEARCH_CACHE_RESPONSE_SCHEMA,
    total: /* unchanged */,
    generatedAt: /* unchanged */,
    answer: { /* unchanged */ },
    sources: safeSources,
    related: /* unchanged */,
    clarification: /* unchanged */,
    ...(validPublicChart(response.chart, safeSources) ? { chart: boundedChart(response.chart) } : {}),
  };
```

`restoreCachedResponse` spreads `publicCached`, so the chart comes back automatically.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/answer-chart.test.mjs tests/citation-policy.test.mjs tests/search.test.mjs tests/infrastructure.test.mjs`
Expected: all pass. If a `search.test.mjs` test asserts the old revision string, update it to `answer-v51-forest-series-chart`.

- [ ] **Step 7: Commit**

```bash
git add server/answer-chart.mjs server/pipeline.mjs server/database.mjs tests/answer-chart.test.mjs tests/citation-policy.test.mjs
git commit -m "feat(answer): validate and cache the chart contract in the public response"
```

---

### Task 5: Wire the adapter into retrieval and both compose chains

**Files:**
- Modify: `server/indicators.mjs:672-681` (`requiresExtendedStructuredListingBudget`), `server/indicators.mjs:1862+` (`loadStructuredIndicatorDocuments`)
- Modify: `server/pipeline.mjs:1330-1358` and `server/pipeline.mjs:1505-1533` (compose chains)
- Test: `tests/forest-series.test.mjs`

**Interfaces:**
- Consumes: `isForestSeriesQuery`, `forestSeriesIntent`, `forestSeriesRequest`, `forestSeriesFromJson`, `composeForestSeriesResponse`, `FOREST_SERIES_KK51_API_URL`, `FOREST_SERIES_MM03_API_URL`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/forest-series.test.mjs`:

```js
import { loadStructuredIndicatorDocuments, requiresExtendedStructuredListingBudget } from "../server/indicators.mjs";
import { searchEnvironmentLive, searchTimeoutFallback } from "../server/pipeline.mjs";
import { rankPublicSearchCandidates } from "../server/retrieval.mjs";
import { assessSearchQuery } from "../server/search.mjs";

test("structured loader posts one bounded forest series request only for a series intent", async () => {
  const query = "Metsamaa pindala 2015–2025";
  let calls = 0;
  const documents = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async (url, payload) => {
      calls += 1;
      assert.equal(url, FOREST_SERIES_KK51_API_URL);
      assert.deepEqual(payload, forestSeriesRequest(forestSeriesIntent(query)));
      return { body: await fixture("pxweb-kk51-metsamaa-pindala-2015-2025.json"), fetchedAt: FETCHED_AT, stale: false };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(documents.map((document) => document.id), ["forest-series-kk51-1-2015-2025"]);
  assert.equal(requiresExtendedStructuredListingBudget(query), true);

  const single = await loadStructuredIndicatorDocuments("Metsamaa pindala 2024", {
    now: NOW,
    fetchPxwebDataset: async () => { throw new Error("must not fetch"); },
  });
  assert.equal(single.some((document) => String(document.id).startsWith("forest-series-")), false);

  const failed = await loadStructuredIndicatorDocuments(query, {
    now: NOW,
    fetchPxwebDataset: async () => { throw new Error("upstream down"); },
  });
  assert.deepEqual(failed, []);
});

test("the pipeline answers a forest series question from its visible source and abstains without it", async () => {
  const query = "Metsamaa pindala 2015–2025";
  const [document] = forestSeriesFromJson(query, await fixture("pxweb-kk51-metsamaa-pindala-2015-2025.json"), {
    now: NOW,
    fetchedAt: NOW,
  });
  const fallback = searchTimeoutFallback(query, {
    searchResults: { items: [document], total: 1 },
    filters: {},
    startedAt: NOW,
  });
  assert.equal(fallback.answer.eyebrow, "Statistikaameti tabel KK51");
  assert.equal(fallback.chart.citation, 1);
  assert.deepEqual(fallback.sources.map((source) => source.id), [document.id]);

  const filtered = searchTimeoutFallback(query, {
    searchResults: { items: [document], total: 1 },
    filters: { category: "Muu sisutüüp" },
    startedAt: NOW,
  });
  assert.equal(filtered.chart, undefined);

  const live = await searchEnvironmentLive(query, {
    startedAt: NOW,
    deadlineAt: NOW + 1_000,
    useCache: false,
    searchResults: { items: [document], total: 1 },
  });
  assert.equal(live.answer.eyebrow, "Statistikaameti tabel KK51");
  assert.equal(live.chart.series[0].points.length, 11);
  assert.equal(live.sources[0].url, FOREST_SERIES_KK51_TABLE_URL);

  const without = searchTimeoutFallback(query, { searchResults: { items: [], total: 0 }, filters: {}, startedAt: NOW });
  assert.equal(without.chart, undefined);
  assert.equal(assessSearchQuery(query).reason, "requested-time-series-required");
});

test("a forest series document survives public ranking for its own query", async () => {
  const query = "lageraie pindala 2015–2024";
  const [document] = forestSeriesFromJson(query, await fixture("pxweb-mm03-lageraie-pindala-2015-2024.json"), {
    now: NOW,
    fetchedAt: NOW,
  });
  const page = {
    id: "portal-lageraie",
    title: "Lageraie",
    url: "https://keskkonnaportaal.ee/et/lageraie",
    summary: "Lageraie on uuendusraie liik.",
    content: "Lageraie on uuendusraie liik, mille korral raiutakse puistu ühe võttega.",
    organization: "Keskkonnaportaal",
    sourceTier: "official",
    tags: ["mets", "lageraie"],
    topics: ["mets", "lageraie"],
  };
  const ranked = rankPublicSearchCandidates(query, [page, document], { now: NOW });
  assert.ok(ranked.find((candidate) => candidate.id === document.id));
  assert.equal(composeForestSeriesResponse(query, ranked, { now: NOW })?.evidence.kind, "structured-forest-series");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/forest-series.test.mjs`
Expected: the three new tests fail (`calls` is 0; no chart; ranking finds nothing).

- [ ] **Step 3: Add the loader block and budget predicate in `server/indicators.mjs`**

Add the import after the `./statistics.mjs` import block:

```js
import {
  composeForestSeriesResponse,
  FOREST_SERIES_KK51_API_URL,
  FOREST_SERIES_MM03_API_URL,
  forestSeriesFromJson,
  forestSeriesIntent,
  forestSeriesRequest,
  isForestSeriesQuery,
} from "./forest-series.mjs";
```

Re-export the composer so the pipeline can import everything from one place (add near the other exports at the bottom of the file, or immediately after the import):

```js
export { composeForestSeriesResponse };
```

In `requiresExtendedStructuredListingBudget`, add `|| isForestSeriesQuery(query)` as the last clause.

In `loadStructuredIndicatorDocuments`, insert this block immediately before `if (isStatisticsWaterAbstractionQuery(query)) {`:

```js
  if (isForestSeriesQuery(query)) {
    try {
      const fetchPxwebDataset = options.fetchPxwebDataset || fetchOfficialPxwebDataset;
      const intent = forestSeriesIntent(query);
      const result = await fetchPxwebDataset(
        intent.table === "KK51" ? FOREST_SERIES_KK51_API_URL : FOREST_SERIES_MM03_API_URL,
        forestSeriesRequest(intent),
        { timeoutMs, signal: options.signal, maximumBytes: 64_000 },
      );
      documents.push(...forestSeriesFromJson(query, result.body, {
        fetchedAt: result.fetchedAt,
        stale: result.stale,
        now: options.now,
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.name === "AbortError") throw error;
      // The reviewed SMI catalogue pages remain visible without a series.
    }
  }
```

- [ ] **Step 4: Add the composer to both chains in `server/pipeline.mjs`**

Add `composeForestSeriesResponse,` to the `./indicators.mjs` import list (alphabetically after `composeForestHarvestBalanceAnswer,`).

In the live chain (the `structuredIndicatorCandidate` expression around line 1330) and the timeout chain (`structuredCandidate` around line 1505), insert this alternative immediately before `composeStatisticsWaterAbstractionResponse(...)` in each chain:

```js
  }) || composeForestSeriesResponse(cleanQuery, searchResults?.items, {
    total: searchResults?.total,
    now: startedAt,
```

(so the chain reads `...composeEelisNaturaSiteResponse(...) || composeForestSeriesResponse(...) || composeStatisticsWaterAbstractionResponse(...)`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/forest-series.test.mjs tests/indicators.test.mjs tests/statistics.test.mjs tests/public-forestry.test.mjs`
Expected: all pass. `public-forestry` still expects `requested-time-series-required` from `assessSearchQuery` for `"Ajalooline metsasus"`; that function is untouched.

If the ranking test fails because the document is not retained, add the query's normalised tokens to the document's `topics` in `forestSeriesFromJson` (`...normalize(query).split(" ")`) and re-run.

- [ ] **Step 6: Commit**

```bash
git add server/indicators.mjs server/pipeline.mjs tests/forest-series.test.mjs
git commit -m "feat(search): fetch and answer forest year series on multi-period questions"
```

---

### Task 6: Eurostat balance chart

**Files:**
- Modify: `server/indicators.mjs:1697-1860` (`composeForestHarvestBalanceAnswer`, the `lastFiveIntent` branch)
- Modify: `server/pipeline.mjs:1163-1167`
- Test: `tests/indicators.test.mjs`

**Interfaces:**
- `composeForestHarvestBalanceAnswer` returns `{ answer, related, chart? }`; `chart` present only in the five-year branch with ≥ 2 comparable years.

- [ ] **Step 1: Write the failing test**

Append to `tests/indicators.test.mjs` (it already imports `composeForestHarvestBalanceAnswer`, `forestHarvestBalanceDocumentsFromJson` and defines `forestFixture`):

```js
test("forest balance five-year answer carries a grouped bar chart with gaps kept", () => {
  const documents = forestHarvestBalanceDocumentsFromJson("Kas raiemaht ületab juurdekasvu?", forestFixture);
  const direct = composeForestHarvestBalanceAnswer("Kas raiemaht ületab juurdekasvu?", documents);
  assert.equal(direct.chart, undefined);
  const fiveYear = composeForestHarvestBalanceAnswer(
    "Mida see viimase 5 aasta jooksul tähendab Kas raiemaht ületab juurdekasvu?",
    documents,
  );
  assert.equal(fiveYear.chart.kind, "bar");
  assert.equal(fiveYear.chart.title, "Netojuurdekasv ja puidu eemaldamine 2020–2024");
  assert.equal(fiveYear.chart.unit, "mln m³ koorega");
  assert.equal(fiveYear.chart.citation, fiveYear.answer.introCitations[0]);
  assert.deepEqual(fiveYear.chart.series.map((series) => series.label), ["Netojuurdekasv", "Puidu eemaldamine"]);
  const observations = documents[0]._forestBalance.observations;
  assert.deepEqual(
    fiveYear.chart.series[0].points,
    observations.filter((item) => item.increment !== null).map((item) => ({ x: item.year, y: item.increment })),
  );
  assert.deepEqual(
    fiveYear.chart.series[1].points,
    observations.filter((item) => item.removals !== null).map((item) => ({ x: item.year, y: item.removals })),
  );
  assert.match(fiveYear.chart.caption, /^Eurostat, metsa arvepidamine \(for_vol_efa\), Eesti\./u);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/indicators.test.mjs`
Expected: FAIL, `fiveYear.chart` is undefined.

- [ ] **Step 3: Add the chart in the five-year branch**

In `composeForestHarvestBalanceAnswer`, inside `if (lastFiveIntent) {`, after `const incompleteWindow = ...;` add:

```js
    const incrementPoints = window.filter((item) => item.increment !== null).map((item) => ({ x: item.year, y: item.increment }));
    const removalPoints = window.filter((item) => item.removals !== null).map((item) => ({ x: item.year, y: item.removals }));
    const chart = incrementPoints.length >= 2 && removalPoints.length >= 2
      ? {
        kind: "bar",
        title: `Netojuurdekasv ja puidu eemaldamine ${startYear}–${endYear}`,
        unit: "mln m³ koorega",
        xLabel: "Aasta",
        series: [
          { id: "efa-increment", label: "Netojuurdekasv", points: incrementPoints },
          { id: "efa-removals", label: "Puidu eemaldamine", points: removalPoints },
        ],
        citation: eurostatCitation,
        caption: `Eurostat, metsa arvepidamine (for_vol_efa), Eesti. Puuduvaid aastaid ei ole interpoleeritud.`,
      }
      : null;
```

and change that branch's `return {` to `return { ...(chart ? { chart } : {}),` so the object becomes `{ chart?, answer, related }`.

- [ ] **Step 4: Pass the chart through the draft in `server/pipeline.mjs`**

Change the block at lines 1163-1167 to:

```js
  if (forestBalance) {
    draft.answer = forestBalance.answer;
    draft.related = forestBalance.related;
    if (forestBalance.chart) draft.chart = forestBalance.chart;
    draft.evidence.answerable = true;
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/indicators.test.mjs tests/citation-policy.test.mjs`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add server/indicators.mjs server/pipeline.mjs tests/indicators.test.mjs
git commit -m "feat(forest-balance): attach increment vs removals bar chart to the five-year answer"
```

---

### Task 7: Client layout helpers (pure, node-tested)

**Files:**
- Create: `src/answer-chart-layout.js`
- Test: `tests/answer-chart-layout.test.mjs`

**Interfaces:**
- Produces: `niceDomain(min, max, { fromZero }) → { lo, hi, ticks }`, `splitRuns(points) → points[][]` (consecutive `x`), `xTickStep(count, width) → 1|2|3`, `formatChartValue(value) → string` (et-EE, 1 decimal under 1000, else 0), `chartDescription(chart) → string`.

- [ ] **Step 1: Write the failing tests**

Create `tests/answer-chart-layout.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { chartDescription, formatChartValue, niceDomain, splitRuns, xTickStep } from "../src/answer-chart-layout.js";

test("niceDomain pads a line domain and starts a bar domain at zero", () => {
  const line = niceDomain(2310.6, 2360.2, { fromZero: false });
  assert.ok(line.lo < 2310.6 && line.hi > 2360.2);
  assert.equal(line.ticks[0], line.lo);
  assert.equal(line.ticks.at(-1), line.hi);
  assert.ok(line.ticks.length >= 4 && line.ticks.length <= 8);
  const bar = niceDomain(9.1, 14.4, { fromZero: true });
  assert.equal(bar.lo, 0);
  assert.ok(bar.hi >= 14.4);
  const flat = niceDomain(51, 51, { fromZero: false });
  assert.ok(flat.hi > flat.lo);
});

test("splitRuns breaks a series at missing years", () => {
  const runs = splitRuns([{ x: 2020, y: 1 }, { x: 2021, y: 2 }, { x: 2023, y: 3 }, { x: 2024, y: 4 }, { x: 2026, y: 5 }]);
  assert.deepEqual(runs.map((run) => run.map((point) => point.x)), [[2020, 2021], [2023, 2024], [2026]]);
  assert.deepEqual(splitRuns([]), []);
});

test("xTickStep thins labels on narrow charts", () => {
  assert.equal(xTickStep(10, 640), 1);
  assert.equal(xTickStep(20, 640), 2);
  assert.equal(xTickStep(27, 360), 3);
  assert.equal(xTickStep(10, 320), 2);
});

test("formatChartValue uses Estonian decimal comma and thin grouping", () => {
  assert.equal(formatChartValue(31.6), "31,6");
  assert.equal(formatChartValue(2310.6), "2\u00a0311");
  assert.equal(formatChartValue(12247), "12\u00a0247");
  assert.equal(formatChartValue(52.1), "52,1");
});

test("chartDescription names series, range and endpoints", () => {
  const text = chartDescription({
    title: "Lageraie: raiepindala 2015–2024",
    unit: "tuhat ha",
    series: [{ label: "Lageraie: raiepindala", points: [{ x: 2015, y: 31.6 }, { x: 2024, y: 34 }] }],
  });
  assert.equal(text, "Joondiagramm. Lageraie: raiepindala: 2015 – 31,6 tuhat ha, 2024 – 34,0 tuhat ha.");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/answer-chart-layout.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/answer-chart-layout.js`**

```js
const GROUPING_SPACE = " ";

export function niceStep(range, targetTicks = 5) {
  const rough = range / Math.max(1, targetTicks - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const factor = residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1;
  return factor * magnitude;
}

export function niceDomain(min, max, { fromZero = false } = {}) {
  let lo = fromZero ? Math.min(0, min) : min;
  let hi = max;
  if (!fromZero) {
    const pad = (max - min || Math.abs(max) || 1) * 0.12;
    lo = min - pad;
    hi = max + pad;
  }
  if (hi <= lo) hi = lo + 1;
  const step = niceStep(hi - lo, 5);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (fromZero && lo > 0) lo = 0;
  const ticks = [];
  for (let value = lo; value <= hi + step / 2; value += step) ticks.push(Number(value.toFixed(10)));
  return { lo, hi, ticks };
}

export function splitRuns(points = []) {
  const runs = [];
  let current = [];
  for (const point of points) {
    if (current.length && point.x !== current.at(-1).x + 1) {
      runs.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) runs.push(current);
  return runs;
}

export function xTickStep(count, width) {
  const perLabel = width / Math.max(1, count);
  if (perLabel >= 40) return 1;
  if (perLabel >= 20) return 2;
  return 3;
}

export function formatChartValue(value, digits = Math.abs(value) >= 1000 ? 0 : 1) {
  if (!Number.isFinite(value)) return "–";
  const [whole, fraction] = Math.abs(value).toFixed(digits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, GROUPING_SPACE);
  return `${value < 0 ? "−" : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
}

export function chartDescription(chart) {
  const kind = chart.kind === "bar" ? "Tulpdiagramm" : "Joondiagramm";
  const parts = (chart.series || []).map((series) => {
    const first = series.points[0];
    const last = series.points.at(-1);
    return `${series.label}: ${first.x} – ${formatChartValue(first.y)} ${chart.unit}, ${last.x} – ${formatChartValue(last.y)} ${chart.unit}`;
  });
  return `${kind}. ${parts.join("; ")}.`;
}
```

`formatChartValue(2310.6)` groups thousands with a no-break space (U+00A0), so the test literals are written as `"2\u00a0311"` and `"12\u00a0247"` (JavaScript escape, not a raw space).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/answer-chart-layout.test.mjs`
Expected: all pass. The `chartDescription` expectation `34,0` comes from `formatChartValue(34)` with 1 decimal.

- [ ] **Step 5: Commit**

```bash
git add src/answer-chart-layout.js tests/answer-chart-layout.test.mjs
git commit -m "feat(ui): pure layout helpers for the answer chart"
```

---

### Task 8: `AnswerChart` component, App wiring and styles

**Files:**
- Create: `src/AnswerChart.jsx`
- Modify: `src/App.jsx:1119-1123` (root intro) and `src/App.jsx:1148` (follow-up intro)
- Modify: `src/styles.css` (after `.answer-parts p` block, around line 1718)
- Test: `tests/search-stream.test.mjs` (contract pass-through), manual browser check

**Interfaces:**
- Consumes: `src/answer-chart-layout.js` helpers; `Citation` from `App.jsx` passed as a node prop.
- Produces: `export default function AnswerChart({ chart, citation })`.

- [ ] **Step 1: Write the failing stream test**

Append to `tests/search-stream.test.mjs`:

```js
test("a chart on the final answer event passes the stream parser untouched", () => {
  const chart = { kind: "line", title: "T", unit: "%", series: [{ id: "a", label: "A", points: [{ x: 2020, y: 1 }, { x: 2021, y: 2 }] }], citation: 1 };
  const event = parseSearchStreamLine(JSON.stringify({ type: "answer", result: { answer: { title: "x" }, chart } }));
  assert.deepEqual(event.result.chart, chart);
});
```

Run: `node --test tests/search-stream.test.mjs` — this passes already (the parser does not filter fields); keep it as the contract lock.

- [ ] **Step 2: Create `src/AnswerChart.jsx`**

```jsx
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { chartDescription, formatChartValue, niceDomain, splitRuns, xTickStep } from "./answer-chart-layout.js";

const HEIGHT = 260;
const MARGIN = { top: 16, right: 20, bottom: 36, left: 56 };
const SERIES_COLORS = ["var(--brand-700)", "var(--green)", "var(--purple)"];
const TOOLTIP_WIDTH = 176;

function useContainerWidth(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect?.width || 0);
      if (next >= 240) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function valueWithError(point, unit) {
  const base = `${formatChartValue(point.y)} ${unit}`;
  return point.error === undefined ? base : `${base} (±${formatChartValue(point.error, 1)}%)`;
}

export default function AnswerChart({ chart, citation = null }) {
  const [frameRef, width] = useContainerWidth();
  const [activeYear, setActiveYear] = useState(null);
  const titleId = useId();
  const descId = useId();
  const layout = useMemo(() => {
    const series = chart.series;
    const years = [...new Set(series.flatMap((item) => item.points.map((point) => point.x)))].sort((a, b) => a - b);
    const values = series.flatMap((item) => item.points.map((point) => point.y));
    const domain = niceDomain(Math.min(...values), Math.max(...values), { fromZero: chart.kind === "bar" });
    const plotWidth = Math.max(80, width - MARGIN.left - MARGIN.right);
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const minYear = years[0];
    const maxYear = years.at(-1);
    const span = Math.max(1, maxYear - minYear);
    const band = plotWidth / years.length;
    const xFor = (year) => (chart.kind === "bar"
      ? MARGIN.left + band * (years.indexOf(year) + 0.5)
      : MARGIN.left + 12 + ((year - minYear) / span) * (plotWidth - 24));
    const yFor = (value) => MARGIN.top + plotHeight - ((value - domain.lo) / (domain.hi - domain.lo)) * plotHeight;
    const barWidth = Math.max(4, Math.min(24, (band * 0.7 - 2 * (series.length - 1)) / series.length));
    const tickStep = xTickStep(years.length, plotWidth);
    return { years, domain, plotWidth, plotHeight, xFor, yFor, band, barWidth, tickStep, baseline: yFor(domain.lo) };
  }, [chart, width]);

  const { years, domain, xFor, yFor, band, barWidth, tickStep, baseline } = layout;
  const nearestYear = (clientX, element) => {
    const rect = element.getBoundingClientRect();
    const x = (clientX - rect.left) * (width / rect.width);
    return years.reduce((best, year) => (Math.abs(xFor(year) - x) < Math.abs(xFor(best) - x) ? year : best), years[0]);
  };
  const activePoints = activeYear === null
    ? []
    : chart.series.map((series, index) => ({ series, index, point: series.points.find((point) => point.x === activeYear) }));
  const tooltipX = activeYear === null ? 0 : xFor(activeYear);
  const tooltipLeft = tooltipX + 12 + TOOLTIP_WIDTH > width ? tooltipX - 12 - TOOLTIP_WIDTH : tooltipX + 12;
  const tooltipHeight = 22 + 18 * chart.series.length;
  const endLabelYs = [];

  return (
    <figure className="answer-chart">
      <figcaption className="answer-chart__title" id={titleId}>{chart.title}</figcaption>
      {chart.series.length > 1 ? (
        <ul className="answer-chart__legend">
          {chart.series.map((series, index) => (
            <li key={series.id}>
              <span aria-hidden="true" className={`answer-chart__key${chart.kind === "bar" ? " answer-chart__key--bar" : ""}`} style={{ background: SERIES_COLORS[index] }} />
              {series.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="answer-chart__frame" ref={frameRef}>
        <svg
          aria-describedby={descId}
          aria-labelledby={titleId}
          height={HEIGHT}
          onPointerLeave={() => setActiveYear(null)}
          onPointerMove={(event) => setActiveYear(nearestYear(event.clientX, event.currentTarget))}
          role="img"
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width={width}
        >
          <desc id={descId}>{chartDescription(chart)}</desc>
          {domain.ticks.map((tick) => (
            <g key={tick}>
              <line className="answer-chart__grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={yFor(tick)} y2={yFor(tick)} />
              <text className="answer-chart__tick" textAnchor="end" x={MARGIN.left - 8} y={yFor(tick) + 4}>{formatChartValue(tick, tick % 1 === 0 ? 0 : 1)}</text>
            </g>
          ))}
          {years.map((year, index) => (index % tickStep === 0 || index === years.length - 1 ? (
            <text className="answer-chart__tick" key={year} textAnchor="middle" x={xFor(year)} y={HEIGHT - MARGIN.bottom + 18}>{year}</text>
          ) : null))}
          {activeYear !== null && chart.kind === "line" ? (
            <line className="answer-chart__crosshair" x1={tooltipX} x2={tooltipX} y1={MARGIN.top} y2={baseline} />
          ) : null}
          {chart.series.map((series, seriesIndex) => {
            const color = SERIES_COLORS[seriesIndex];
            if (chart.kind === "bar") {
              const offset = -((chart.series.length - 1) * (barWidth + 2)) / 2 + seriesIndex * (barWidth + 2);
              return series.points.map((point) => {
                const x = xFor(point.x) + offset - barWidth / 2;
                const top = yFor(point.y);
                const height = Math.max(0, baseline - top);
                const dimmed = activeYear !== null && activeYear !== point.x ? 0.55 : 1;
                return (
                  <g key={`${series.id}-${point.x}`}>
                    {barWidth >= 8 && height >= 4 ? (
                      <path
                        d={`M${x},${baseline} V${top + 4} a4,4 0 0 1 4,-4 h${barWidth - 8} a4,4 0 0 1 4,4 V${baseline} Z`}
                        fill={color}
                        opacity={dimmed}
                      />
                    ) : (
                      <rect fill={color} height={height} opacity={dimmed} width={barWidth} x={x} y={top} />
                    )}
                    <rect
                      aria-label={`${series.label}, ${point.x}: ${valueWithError(point, chart.unit)}`}
                      className="answer-chart__hit"
                      height={baseline - MARGIN.top}
                      onBlur={() => setActiveYear(null)}
                      onFocus={() => setActiveYear(point.x)}
                      tabIndex={0}
                      width={Math.max(barWidth, 24)}
                      x={x - Math.max(0, (24 - barWidth) / 2)}
                      y={MARGIN.top}
                    />
                  </g>
                );
              });
            }
            const last = series.points.at(-1);
            let labelY = yFor(last.y) + 4;
            if (endLabelYs.some((used) => Math.abs(used - labelY) < 14)) labelY = null;
            else endLabelYs.push(labelY);
            return (
              <g key={series.id}>
                {splitRuns(series.points).map((run) => (
                  <path
                    d={run.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(point.x)},${yFor(point.y)}`).join(" ")}
                    fill="none"
                    key={run[0].x}
                    stroke={color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                ))}
                {series.points.map((point) => (
                  <g key={point.x}>
                    <circle cx={xFor(point.x)} cy={yFor(point.y)} fill={color} r={activeYear === point.x ? 5 : 4} stroke="#fff" strokeWidth={2} />
                    <circle
                      aria-label={`${series.label}, ${point.x}: ${valueWithError(point, chart.unit)}`}
                      className="answer-chart__hit"
                      cx={xFor(point.x)}
                      cy={yFor(point.y)}
                      onBlur={() => setActiveYear(null)}
                      onFocus={() => setActiveYear(point.x)}
                      r={12}
                      tabIndex={0}
                    />
                  </g>
                ))}
                {labelY !== null ? (
                  <text className="answer-chart__value" x={xFor(last.x) + 9} y={labelY}>{formatChartValue(last.y)}</text>
                ) : null}
              </g>
            );
          })}
          {activeYear !== null ? (
            <g className="answer-chart__tooltip" transform={`translate(${tooltipLeft}, ${MARGIN.top})`}>
              <rect height={tooltipHeight} rx={4} width={TOOLTIP_WIDTH} />
              <text className="answer-chart__tick" x={10} y={16}>{activeYear}</text>
              {activePoints.map(({ series, index, point }, row) => (
                <g key={series.id} transform={`translate(10, ${30 + row * 18})`}>
                  <line stroke={SERIES_COLORS[index]} strokeWidth={2} x1={0} x2={12} y1={0} y2={0} />
                  <text className="answer-chart__value" x={18} y={4}>{point ? valueWithError(point, chart.unit) : "avaldamata"}</text>
                </g>
              ))}
            </g>
          ) : null}
        </svg>
      </div>
      <table className="sr-only">
        <caption>{chart.title}</caption>
        <thead>
          <tr><th scope="col">{chart.xLabel || "Aasta"}</th>{chart.series.map((series) => <th key={series.id} scope="col">{series.label} ({chart.unit})</th>)}</tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year}>
              <th scope="row">{year}</th>
              {chart.series.map((series) => {
                const point = series.points.find((item) => item.x === year);
                return <td key={series.id}>{point ? valueWithError(point, chart.unit) : "–"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="answer-chart__caption">{chart.caption ? `${chart.caption} ` : ""}{citation}</p>
    </figure>
  );
}
```

- [ ] **Step 3: Render it from `src/App.jsx`**

Add the import after `import { readSearchStream } from "./search-stream.js";`:

```jsx
import AnswerChart from "./AnswerChart.jsx";
```

In the root answer, immediately after the closing `</p>` of `<p className="answer-intro">…</p>` (line 1123), add:

```jsx
              {result.chart ? <AnswerChart chart={result.chart} citation={<Citation number={result.chart.citation} sources={result.sources} />} /> : null}
```

In the follow-up turn, immediately after the intro `<p>{turn.result.answer.intro}…</p>` (line 1148), add:

```jsx
                          {turn.result.chart ? <AnswerChart chart={turn.result.chart} citation={<Citation number={turn.result.chart.citation} sources={turn.result.sources} />} /> : null}
```

- [ ] **Step 4: Add styles to `src/styles.css`**

Insert after the `.answer-parts p { … }` block (around line 1718):

```css
.answer-chart {
  max-width: 780px;
  margin: 0 0 22px;
}

.answer-chart__title {
  margin: 0 0 6px;
  color: #294453;
  font-size: 0.94rem;
  font-weight: 600;
  line-height: 1.35;
}

.answer-chart__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0 0 6px;
  padding: 0;
  list-style: none;
  color: var(--muted);
  font-size: 0.85rem;
}

.answer-chart__legend li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.answer-chart__key {
  display: inline-block;
  width: 16px;
  height: 3px;
  border-radius: 2px;
}

.answer-chart__key--bar {
  width: 10px;
  height: 10px;
}

.answer-chart__frame {
  position: relative;
  width: 100%;
}

.answer-chart svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  font-family: inherit;
  touch-action: pan-y;
}

.answer-chart__grid,
.answer-chart__crosshair {
  stroke: var(--line);
  stroke-width: 1;
}

.answer-chart__tick {
  fill: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.answer-chart__value {
  fill: var(--ink);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.answer-chart__hit {
  fill: transparent;
  cursor: pointer;
  outline: none;
}

.answer-chart__hit:focus-visible {
  fill: rgba(0, 115, 184, 0.08);
  stroke: var(--brand-900);
  stroke-width: 2;
}

.answer-chart__tooltip rect {
  fill: #fff;
  stroke: var(--line);
  filter: drop-shadow(0 4px 12px rgba(0, 54, 98, 0.12));
}

.answer-chart__caption {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

.followup-answer .answer-chart {
  margin-top: 12px;
}
```

- [ ] **Step 5: Build and check in the browser**

Run:

```bash
npm run build
```

Expected: Vite build succeeds with no warnings about `AnswerChart.jsx`.

Start the local stack and open the preview (use the `preview_start` browser tool with a `.claude/launch.json` entry, or `PORT=4174 PROXY_MODE=direct PUBLIC_ORIGIN=http://127.0.0.1:4174 LLM_ENABLED=false SEARCH_CACHE_ENABLED=false npm start`). Search for `Lageraie pindala 2015–2024` and `Metsamaa pindala viimase kümne aasta jooksul`. Check:

- the chart appears under the intro with a single-series line, no legend, end value label, year ticks;
- hovering shows the crosshair and a tooltip with year, value and ± error (MM03);
- Tab reaches each point and shows the same tooltip; the hidden table is present in the DOM;
- the caption ends with the same numbered citation link as the intro;
- at 390 px width (`resize_window` mobile preset) the chart fits with no horizontal scroll and year labels are thinned;
- `Metsamaa pindala 2024` shows no chart;
- `Mida see viimase 5 aasta jooksul tähendab? Kas raiemaht ületab juurdekasvu?` shows grouped bars with a two-item legend;
- fresh desktop load stays at `scrollY === 0` and nothing autofocuses.

Fix any overlap or overflow before committing (adjust `MARGIN.left` if y tick labels clip on `12 247`-sized values).

- [ ] **Step 6: Run the client tests and commit**

Run: `MULTILINGUAL_SEARCH_ENABLED=true node --test tests/search-stream.test.mjs tests/answer-chart-layout.test.mjs`
Expected: pass.

```bash
git add src/AnswerChart.jsx src/App.jsx src/styles.css tests/search-stream.test.mjs
git commit -m "feat(ui): render the answer chart under the intro with tooltip, keyboard focus and table"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/ALLIKAD.md` (active sources table rows after the KK610 row at line 22; the "Ametlik statistika" row at line 67; the MM03/MM04 line at `PROJEKT.md:159` and any matching line in `docs/ALLIKAD.md` under "Teadlikult mitte automaatselt kasutatavad liidesed")
- Modify: `PROJEKT.md:62` (Statistikaamet adapter sentences), `PROJEKT.md:154`
- Modify: `AGENTS.md` (Durable product decisions)
- Modify: `README.md` (feature list)

- [ ] **Step 1: `docs/ALLIKAD.md`**

Add two rows after the KK610 row (line 22), in the same six-column format:

```markdown
| SMI metsavaru aegrida 1999–2025 | Statistikaamet | [inimloetav `KK51` tabel](https://andmed.stat.ee/et/stat/keskkond__loodusvarad-ja-nende-kasutamine__metsavaru/KK51); [seotud POST API `KK51.PX`](https://andmed.stat.ee/api/v1/et/stat/keskkond/loodusvarad-ja-nende-kasutamine/metsavaru/KK51.PX), PXWeb JSON-stat2; [CC BY-SA 4.0 levitamispõhimõtted](https://stat.ee/et/statistikaamet/meist/strateegia/riikliku-statistika-levitamise-pohimotted) | Ainult mitme aasta küsimus ühe näitaja kohta: metsamaa pindala (1), puistute pindala (2), puistute üldvaru (10), keskmine hektarivaru (18), varu juurdekasv aastas (26) või territooriumi metsasus (34). Server saadab ainult seotud näitaja koodi ja küsitud aastavahemiku (2–27 aastat, vaikimisi viimased 10) `item`-filtritena ning nõuab täpset tabeli-, dimensiooni-, koodi-, sildi-, `decimals`- ja status-lepingut, piiratud arvväärtusi ja vähemalt kaht avaldatud aastat. Vastus ja diagramm koostatakse samast valideeritud reast; puuduv aasta jääb lünkaks. Puuliigi-, maakonna-, omandi- ja prognoosiküsimused adapterisse ei lähe. API `updated` välja ei kasutata avaldamisaja ega värskuse tõendina | 12 h operatiivne cache; stale-vastus ei ole arvtõend | Intent-maatriks, täpne POST-keha, live-fixture skeem, lüngad, piirid, stale/future, võltsitud dokumendi tagasilükkamine, pipeline-filter, avaliku vastuse diagrammileping ja live smoke |
| SMI metsaraie aegrida 1999–2024 | Statistikaamet | [inimloetav `MM03` tabel](https://andmed.stat.ee/et/stat/majandus__metsamajandus/MM03); [seotud POST API `MM03.PX`](https://andmed.stat.ee/api/v1/et/stat/majandus/metsamajandus/MM03.PX), PXWeb JSON-stat2; [CC BY-SA 4.0 levitamispõhimõtted](https://stat.ee/et/statistikaamet/meist/strateegia/riikliku-statistika-levitamise-pohimotted) | Ainult mitme aasta küsimus koguraie (1), lageraie (3) või harvendusraie (5) raiepindala (1) või raiemahu (3) kohta; suhtelise vea veerg (2 või 4) küsitakse alati koos väärtusega ja kuvatakse ± kujul. Sama leping ja piirid nagu KK51. Vastus nimetab alati, et tegu on SMI valikuuringu hinnanguga, mitte raiedokumentide (MM04) statistikaga; MM04 ei kasutata | 12 h operatiivne cache; stale-vastus ei ole arvtõend | Sama nagu KK51 ning lageraie live-fixture võrdlus SMI 2025 läbivaadatud väljavõttega |
```

Update the "Ametlik statistika" row (line 67) runtime column to end with: `; KK51 metsavaru ja MM03 metsaraie aegread on aktiivsed ainult mitme aasta metsaküsimustele ning tagastavad koos vastusega diagrammi`.

In the section "Teadlikult mitte automaatselt kasutatavad liidesed", replace the MM03/MM04 line with a line that keeps only MM04: `Statistikaameti PXWeb tabel MM04 (raiedokumentide alusel maakonna ja omandi järgi); seda ei tohi segada MM03 SMI hinnanguga, mis on eraldi adapteriga aktiivne.`

- [ ] **Step 2: `PROJEKT.md`**

At line 62, after the sentence ending `KK068 ei koosta 2020. aasta liigitusmuudatuse tõttu trendi.` add:

```
Mitme aasta metsaküsimuse korral (aastavahemik, „viimase kümne aasta”, „20 aastat tagasi”, „aegrida”, „muutus”) seob eraldi adapter Statistikaameti KK51 metsavaru või MM03 metsaraie tabeli ühe näitaja ja küsitud aastad ühte `item`-filtritega JSON-stat2 päringusse; vastus ja `chart` väli koostatakse samast valideeritud reast ning avalik serialiseerija kontrollib diagrammilepingut (liik, 1–3 rida, 2–40 punkti, viide täpselt ühele allikale) enne väljastamist.
```

At line 154, replace `KK610 kogu jäätmete taaskasutamise lahtri ühel sõnaselgel aastal 2002–2024.` with `KK610 kogu jäätmete taaskasutamise lahtri ühel sõnaselgel aastal 2002–2024 ning KK51 metsavaru ja MM03 metsaraie aastaread mitme aasta metsaküsimustele.` and replace line 159 with `- Statistikaameti PXWeb tabel MM04 (raiedokumentide statistika); MM03 SMI hinnang on eraldi adapteriga aktiivne ja neid ei tohi kokku segada;`.

- [ ] **Step 3: `AGENTS.md`**

Append to "Durable product decisions":

```markdown
- A chart appears under an answer only when the question asked for more than one period and the chart is built server-side from the same validated official series the text cites (`result.chart`, validated by `server/answer-chart.mjs`); no chart is ever derived from prose or a model. Single-year questions never trigger an extra upstream request.
```

- [ ] **Step 4: `README.md`**

Add a bullet to the feature list after the filters bullet:

```markdown
- mitme aasta metsaküsimustele (metsamaa pindala, tagavara, metsasus, raiemaht, lageraie) Statistikaameti KK51/MM03 SMI aegread koos viidatud diagrammiga, mis koostatakse samast valideeritud reast kui tekst;
```

- [ ] **Step 5: Commit**

```bash
git add docs/ALLIKAD.md PROJEKT.md AGENTS.md README.md
git commit -m "docs: register KK51/MM03 forest series adapters and the answer chart contract"
```

---

### Task 10: Full verification

- [ ] **Step 1: Run the whole suite, build and Sites check**

```bash
npm test
```
Expected: all green. Then:

```bash
npm run build && npm run test:sites && docker compose config > /dev/null
```
Expected: build leaves `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json`; Sites tests pass.

- [ ] **Step 2: Local end-to-end probe against the real upstream**

Start the server (`PORT=4174 PROXY_MODE=direct PUBLIC_ORIGIN=http://127.0.0.1:4174 LLM_ENABLED=false SEARCH_CACHE_ENABLED=false npm start`) and run:

```bash
curl -sS -X POST http://127.0.0.1:4174/api/search -H "Content-Type: application/json" -d '{"q":"lageraie pindala 2015–2024"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.answer.title);console.log(JSON.stringify(r.chart).slice(0,300));})'
```
Expected: title starts with `Lageraie: raiepindala 2015–2024: 31,6 → 34,0 tuhat ha` and `chart.kind === "line"` with 10 points. Repeat with `{"q":"Metsamaa pindala 2024"}` and confirm no `chart` key.

- [ ] **Step 3: Commit anything the verification changed**

```bash
git status
git add -A && git commit -m "test: verification fixes for forest series charts"
```
(skip if the tree is clean).

---

### Task 11: Code review

- [ ] **Step 1:** Use the `superpowers:requesting-code-review` skill on the branch diff (`git diff e14f40e..HEAD`), with the spec path as context. Address findings, re-run `npm test`, commit.

---

### Task 12: Deploy and prove it in production

Per `AGENTS.md`, the work is done only when both the Coolify record and the behaviour probes pass.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Poll the deployment**

Follow the existing procedure in `AGENTS.md`/`PROJEKT.md` (Coolify API with the `COOLIFY_API_TOKEN` secret via the GitHub Actions log, or the Coolify deployments endpoint) until the deployment shows `finished` for the pushed SHA (`git rev-parse HEAD`).

- [ ] **Step 3: Behaviour probes**

```bash
for q in "lageraie pindala 2015–2024" "Metsamaa pindala viimase kümne aasta jooksul" "raiemaht 20 aastat tagasi võrreldes praegusega" "Mida see viimase 5 aasta jooksul tähendab? Kas raiemaht ületab juurdekasvu?" "Metsamaa pindala 2024" "mets"; do
  printf '%s => ' "$q"
  curl -sS -X POST https://praktika.arleserver.cfd/api/search -H "Content-Type: application/json" -d "{\"q\":\"$q\"}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(r.answer.eyebrow,"|",r.chart?`${r.chart.kind}:${r.chart.series.length}x${r.chart.series[0].points.length}`:"no-chart");})'
done
```
Expected: first three → `Statistikaameti tabel …` with `line:1x10`, `line:1x10`, `line:1x21`; the Eurostat follow-up → `bar:2x…`; `Metsamaa pindala 2024` and `mets` → `no-chart`. Run twice (cold and cached) and confirm the cached run still has the chart.

- [ ] **Step 4: Browser pass on production**

Open https://praktika.arleserver.cfd in the built-in browser, search `Lageraie pindala 2015–2024`, verify the chart, tooltip, keyboard focus and citation link on desktop and at the 390 px preset; confirm `scrollY === 0` on fresh load.

- [ ] **Step 5: Run the live evals that exist**

```bash
npm run eval:live -- --base-url=https://praktika.arleserver.cfd
npm run audit:filters -- --base-url=https://praktika.arleserver.cfd
```
Expected: no regressions versus the last recorded run in `acceptance-evidence.md`. Append the probe outputs and SHA to `acceptance-evidence.md`, commit and push, and re-verify the deploy record for that final SHA.
