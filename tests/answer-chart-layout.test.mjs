import assert from "node:assert/strict";
import test from "node:test";
import { chartDescription, chartDomain, formatChartValue, niceDomain, seriesPrecision, splitRuns, xTickStep } from "../src/answer-chart-layout.js";

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

test("a quantity band is drawn from its own range, a bar chart always from zero", () => {
  // A line chart of a published quantity shows the years it covers, so a real
  // change stays visible instead of collapsing into a flat line at the top.
  const raiemaht = chartDomain([10931, 13347, 10143, 12500]);
  assert.ok(raiemaht.lo < 10143 && raiemaht.hi > 13347, `the axis covers the published band: ${raiemaht.lo}–${raiemaht.hi}`);
  assert.ok(raiemaht.lo >= 9000, `the axis does not collapse onto zero: lo=${raiemaht.lo}`);
  // A bar chart always starts at zero.
  const bar = chartDomain([9.1, 14.37], { kind: "bar" });
  assert.equal(bar.lo, 0);
  assert.ok(bar.hi >= 14.37);
  // A bar series with a negative value keeps zero inside the axis, so its bars
  // grow up and down from the same line.
  const negativeBar = chartDomain([-2, 8], { kind: "bar" });
  assert.ok(negativeBar.lo <= -2);
  assert.ok(negativeBar.hi >= 8);
  assert.ok(negativeBar.ticks.includes(0));
  // A line series that really has negative values is padded, never forced to zero.
  const temperature = chartDomain([-4.2, 21.6]);
  assert.ok(temperature.lo < -4.2);
  assert.ok(temperature.hi > 21.6);
  assert.equal(chartDomain([]).lo, 0);
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
  assert.equal(formatChartValue(2310.6, 1), "2 310,6");
});

test("seriesPrecision reports the data's own fractional digits", () => {
  assert.equal(seriesPrecision([{ y: 31.6 }, { y: 34 }]), 1);
  assert.equal(seriesPrecision([{ y: 12247 }, { y: 8081 }]), 0);
  assert.equal(seriesPrecision([{ y: 2310.6 }, { y: 2360.234 }]), 1);
  assert.equal(seriesPrecision([{ y: 6.55 }, { y: 6.8 }]), 2, "a source value with two decimals keeps both");
  assert.equal(seriesPrecision([]), 0);
});

test("chartDescription names series, range and endpoints", () => {
  const text = chartDescription({
    title: "Lageraie: raiepindala 2015–2024",
    unit: "tuhat ha",
    series: [{ label: "Lageraie: raiepindala", points: [{ x: 2015, y: 31.6 }, { x: 2024, y: 34 }] }],
  });
  assert.equal(text, "Joondiagramm. Lageraie: raiepindala: 2015 – 31,6 tuhat ha, 2024 – 34,0 tuhat ha.");
});

test("shareArcs turns labelled values into angles and percentages that close the circle", async () => {
  const { shareArcs } = await import("../src/answer-chart-layout.js");
  const arcs = shareArcs([{ x: 1, y: 50, label: "A", emphasis: true }, { x: 2, y: 30, label: "B" }, { x: 3, y: 20, label: "C" }]);
  assert.equal(arcs.length, 3);
  assert.equal(arcs[0].start, 0);
  assert.ok(Math.abs(arcs[2].end - Math.PI * 2) < 1e-9);
  assert.deepEqual(arcs.map((arc) => arc.percent), [50, 30, 20]);
  assert.equal(arcs[0].emphasis, true);
  assert.equal(arcs[1].start, arcs[0].end);
});
