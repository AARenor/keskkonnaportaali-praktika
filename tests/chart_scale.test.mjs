import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createServer } from "vite";
import { chartDomain, formatChartValue, seriesPrecision } from "../src/answer-chart-layout.js";

// The user reported that the chart scales are wrong. Each case below reproduces
// one of the four real failures from the rendered chart: a non-negative line
// flattened onto a zero axis, bars that do not grow from zero (a negative value
// gets no height at all), published decimals rounded away, and two series in
// different units forced onto one misleading axis.

async function render(chart) {
  const vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "silent",
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
  });
  try {
    const { default: AnswerChart } = await vite.ssrLoadModule("/src/AnswerChart.jsx");
    return load(renderToStaticMarkup(createElement(AnswerChart, { chart })));
  } finally {
    await vite.close();
  }
}

// Absolute vertical positions from a path that only uses M/L/V plus relative
// arcs and horizontal runs: "M467,182.4 V220 a4,4 0 0 0 4,4 h16 V182.4 Z"
// yields [182.4, 220, 182.4]. A comma-pair regex would miss every V coordinate
// and make a bar that clearly grows downwards look flat.
const pathYs = (d) => [...String(d).matchAll(/([MLV])\s*(-?[\d.]+)(?:,(-?[\d.]+))?/gu)]
  .map(([, command, first, second]) => Number(command === "V" ? first : second));
const gridSpan = ($) => {
  const ys = $(".answer-chart__grid").toArray().map((node) => Number($(node).attr("y1")));
  return Math.max(...ys) - Math.min(...ys);
};

test("a narrow 14 000–15 500 line series uses the axis instead of flattening onto zero", async () => {
  const domain = chartDomain([14000, 15500], { kind: "line" });
  assert.ok(domain.lo >= 13000 && domain.lo <= 14000, `the axis starts at the data, not at zero: lo=${domain.lo}`);
  assert.ok(domain.hi >= 15500 && domain.hi <= 16500, `the axis ends near the data: hi=${domain.hi}`);
  assert.equal(domain.ticks[0], domain.lo);
  assert.equal(domain.ticks.at(-1), domain.hi);
  assert.ok(domain.ticks.length >= 4 && domain.ticks.length <= 8, `ticks: ${domain.ticks.length}`);

  const $ = await render({
    kind: "line",
    title: "Metsamaa tagavara 2015–2016",
    unit: "tuhat m³",
    series: [{ id: "stock", label: "Metsamaa tagavara", points: [{ x: 2015, y: 14000 }, { x: 2016, y: 15500 }] }],
  });
  const [first, second] = pathYs($("svg path").first().attr("d"));
  const used = Math.abs(second - first) / gridSpan($);
  assert.ok(used >= 0.5, `a 1 500 unit change must fill at least half the plot, it used ${(used * 100).toFixed(0)} %`);
});

test("bars grow from a zero baseline and negative values get a visible bar", async () => {
  assert.equal(chartDomain([9.1, 14.37], { kind: "bar" }).lo, 0);
  const mixed = chartDomain([-2, 8], { kind: "bar" });
  assert.ok(mixed.lo <= -2, `negative bars need room below zero: lo=${mixed.lo}`);
  assert.ok(mixed.hi >= 8);
  assert.ok(mixed.ticks.includes(0), `zero must be a tick: ${mixed.ticks.join(", ")}`);
  const allNegative = chartDomain([-5, -1], { kind: "bar" });
  assert.ok(allNegative.hi >= 0, `an all-negative bar axis still contains zero: hi=${allNegative.hi}`);

  const $ = await render({
    kind: "bar",
    title: "Netojuurdekasv 2020–2021",
    unit: "mln m³",
    series: [{ id: "increment", label: "Netojuurdekasv", points: [{ x: 2020, y: 8 }, { x: 2021, y: -2 }] }],
  });
  const zeroTick = $("svg .answer-chart__tick").filter((_, node) => $(node).text().trim() === "0").first();
  assert.equal(zeroTick.length, 1, "the bar axis carries a labelled zero tick");
  const zeroY = Number(zeroTick.attr("y")) - 4;
  assert.ok(!$(".answer-chart__caption").text().includes("mitte nullist"), "a zero-based axis needs no baseline note");
  // A bar is the only filled shape in the plot; the line series is stroke-only.
  const bars = $("svg path").toArray().filter((node) => $(node).attr("fill") !== "none");
  assert.equal(bars.length, 2, "both published values are drawn as bars");
  for (const bar of bars) {
    const start = pathYs($(bar).attr("d"))[0];
    assert.ok(Math.abs(start - zeroY) < 0.5, `a bar starts on the zero line, got ${start} instead of ${zeroY}`);
  }
  const positive = pathYs($(bars[0]).attr("d"));
  assert.ok(Math.min(...positive) < zeroY - 1, "the positive value extends above the zero line");
  const negative = pathYs($(bars[1]).attr("d"));
  assert.ok(Math.max(...negative) > zeroY + 1, `the negative value extends below the zero line: ${negative.join(", ")} vs ${zeroY}`);
});

test("a bar chart names its unit in readable chart text, not only on hover or in the hidden table", async () => {
  const $ = await render({
    kind: "bar",
    title: "Netojuurdekasv ja raiemaht 2020–2021",
    unit: "mln m³",
    caption: "Eurostat, metsa arvepidamine (for_vol_efa), Eesti.",
    series: [
      { id: "increment", label: "Netojuurdekasv", points: [{ x: 2020, y: 9.1 }, { x: 2021, y: 12.2 }] },
      { id: "removals", label: "Raiemaht", points: [{ x: 2020, y: 14.37 }, { x: 2021, y: 11.56 }] },
    ],
  });
  // Readable text only: <desc> and <title> are announced, never shown, and the
  // tooltip exists only while a point is hovered or focused. A numeric axis
  // without a printed unit cannot be read at all.
  const labels = $("svg text")
    .toArray()
    .filter((node) => $(node).closest("[aria-hidden='true']").length === 0)
    .map((node) => $(node).text())
    .filter((text) => text.includes("mln m³"));
  assert.ok(labels.length >= 1, "the chart itself must print the unit it is drawn in");
  assert.ok(labels.some((text) => text.trim().length <= 40), `the printed unit stays a short label: ${labels.join(" | ")}`);
  assert.equal($(".sr-only table thead").text().includes("mln m³"), true, "the data table keeps its unit column as before");
});

test("published decimals survive: 6,55 stays 6,55", async () => {
  assert.equal(seriesPrecision([{ y: 6.55 }, { y: 6.8 }]), 2);
  assert.equal(seriesPrecision([{ y: 6.5487 }]), 3, "source precision is kept, capped at three decimals");
  assert.equal(seriesPrecision([{ y: 2360.234 }, { y: 2310.6 }]), 1, "a large quantity keeps at most one decimal");
  assert.equal(formatChartValue(6.55, 2), "6,55");

  const $ = await render({
    kind: "line",
    title: "Keskmine hektarivaru",
    unit: "m³/ha",
    series: [{ id: "stock", label: "Keskmine hektarivaru", points: [{ x: 2024, y: 6.55 }, { x: 2025, y: 6.8 }] }],
  });
  assert.equal($(".sr-only table td").first().text().startsWith("6,55"), true, "a two-decimal source value is not rounded to one");
  assert.equal($(".sr-only table td").last().text().startsWith("6,80"), true);
  assert.equal($("svg .answer-chart__value").last().text(), "6,80", "the endpoint label keeps the same precision as the table");
});

test("a line that crosses zero is padded around the data instead of forced to zero", async () => {
  const temperature = chartDomain([-4.2, 21.6], { kind: "line" });
  assert.ok(temperature.lo < -4.2);
  assert.ok(temperature.hi > 21.6);
  assert.ok(temperature.ticks.includes(0));
  const small = chartDomain([6.55, 6.8], { kind: "line" });
  assert.ok(small.lo > 0, `a small positive series must not fall back to zero: lo=${small.lo}`);

  const $ = await render({
    kind: "line",
    title: "Õhutemperatuur",
    unit: "°C",
    series: [{ id: "temp", label: "Õhutemperatuur", points: [{ x: 2020, y: -4.2 }, { x: 2021, y: 21.6 }] }],
  });
  assert.ok(!$(".answer-chart__caption").text().includes("mitte nullist"), "an axis that contains zero is not truncated");
});

test("a flat published series is opened around its value, not stretched from zero", async () => {
  const flat = chartDomain([2360.2, 2360.2], { kind: "line" });
  assert.ok(flat.hi > flat.lo);
  assert.ok(flat.lo < 2360.2 && flat.hi > 2360.2);
  assert.ok(flat.lo > 2000, `a flat 2 360 series must not sit on a zero floor: lo=${flat.lo}`);
  assert.ok(flat.hi - flat.lo <= 2360.2 * 0.2, `a flat series must not open a huge axis: ${flat.lo}–${flat.hi}`);
});

test("a non-zero baseline is stated in the caption and in the accessible description", async () => {
  const $ = await render({
    kind: "line",
    title: "Metsamaa pindala 2015–2024",
    unit: "tuhat ha",
    series: [{ id: "area", label: "Metsamaa pindala", points: [{ x: 2015, y: 14000 }, { x: 2024, y: 15500 }] }],
  });
  const note = `Vertikaaltelg algab väärtusest ${formatChartValue(13500, 0)} tuhat ha, mitte nullist.`;
  assert.ok($(".answer-chart__caption").text().includes(note), "the reader must be told the axis does not start at zero");
  assert.ok($("svg desc").first().text().includes(note), "the screen-reader description repeats the baseline");
});

test("series in different units get their own panel and their own axis", async () => {
  const $ = await render({
    kind: "line",
    title: "Juurdekasv ja raiemaht 2020–2021",
    unit: "tuhat m³",
    series: [
      { id: "increment", unit: "tuhat m³", label: "Juurdekasv", points: [{ x: 2020, y: 15458 }, { x: 2021, y: 15000 }] },
      { id: "removals", unit: "mln m³", label: "Raiemaht", points: [{ x: 2020, y: 14.37 }, { x: 2021, y: 12.18 }] },
    ],
  });
  const panels = $(".answer-chart__frame svg");
  assert.equal(panels.length, 2, "each unit gets its own plot");
  assert.ok(panels.eq(0).find("desc").text().includes("tuhat m³"));
  assert.ok(panels.eq(1).find("desc").text().includes("mln m³"));
  const axisText = (panel) => panel.find(".answer-chart__tick").toArray().map((node) => $(node).text().replace(/\s/gu, ""));
  assert.ok(axisText(panels.eq(0)).some((text) => text === "15000"), "the thousand-unit axis shows thousands");
  assert.ok(axisText(panels.eq(1)).some((text) => text.startsWith("14")), "the million-unit axis shows its own small range");
  assert.equal(panels.eq(0).attr("aria-label").includes("tuhat m³"), true, "each axis names its unit for assistive technology");
});
