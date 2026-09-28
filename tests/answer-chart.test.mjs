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

test("validPublicChart accepts a share chart with labelled points and rejects malformed ones", () => {
  const share = {
    kind: "share",
    title: "Eesti maismaa jagunemine maakasutuse järgi 2024",
    unit: "tuhat ha",
    series: [{ id: "kk07-2024", label: "Maakasutus 2024", points: [{ x: 1, y: 2459.7, label: "Metsamaa", emphasis: true }, { x: 2, y: 989.9, label: "Põllumaa" }] }],
    citation: 1,
  };
  assert.equal(validPublicChart(share, sources), true);
  assert.deepEqual(boundedChart(share).series[0].points[0], { x: 1, y: 2459.7, label: "Metsamaa", emphasis: true });
  assert.deepEqual(boundedChart(share).series[0].points[1], { x: 2, y: 989.9, label: "Põllumaa" });
  const bad = [
    ["no label", { ...share, series: [{ ...share.series[0], points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] }],
    ["two series", { ...share, series: [share.series[0], share.series[0]] }],
    ["nine points", { ...share, series: [{ ...share.series[0], points: Array.from({ length: 9 }, (_, i) => ({ x: i + 1, y: 1, label: `L${i}` })) }] }],
    ["negative", { ...share, series: [{ ...share.series[0], points: [{ x: 1, y: -1, label: "A" }, { x: 2, y: 2, label: "B" }] }] }],
    ["label on a line chart", { ...chart(), series: [{ id: "a", label: "A", points: [{ x: 2015, y: 1, label: "x" }, { x: 2016, y: 2 }] }] }],
    ["label too long", { ...share, series: [{ ...share.series[0], points: [{ x: 1, y: 1, label: "x".repeat(61) }, { x: 2, y: 2, label: "B" }] }] }],
  ];
  for (const [reason, candidate] of bad) assert.equal(validPublicChart(candidate, sources), false, reason);
});
