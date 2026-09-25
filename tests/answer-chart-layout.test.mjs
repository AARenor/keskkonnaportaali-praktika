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
  assert.equal(formatChartValue(2310.6), "2 311");
  assert.equal(formatChartValue(12247), "12 247");
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
