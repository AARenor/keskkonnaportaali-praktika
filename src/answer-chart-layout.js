const GROUPING_SPACE = " ";

// A published value can carry more than one decimal (SMI 6,55 m³/ha, Eurostat
// 14,37094 mln m³). Rounding those to one decimal printed a different number
// than the source, so the renderer keeps what the source says up to a readable
// limit, and keeps less of it for a four-digit quantity.
export const MAX_PRECISION = 3;
// A phone-width chart frame measures well under the old 240 px floor. Below
// this width the geometry degenerates, so the component keeps the last usable
// measurement instead of scaling a 640 px viewBox down to unreadable labels.
export const MIN_MEASURED_WIDTH = 120;

const WIDE_MARGINS = Object.freeze({ top: 16, right: 20, bottom: 36, left: 56 });
const NARROW_MARGINS = Object.freeze({ top: 14, right: 10, bottom: 32, left: 40 });

// The 56 px left gutter holds a five-digit label ("15 500"). On a narrow frame
// that gutter would eat the plot, so it shrinks with the frame instead of
// forcing the whole SVG to be scaled down.
export function chartMargins(width) {
  return Number(width) >= 360 ? WIDE_MARGINS : NARROW_MARGINS;
}

export function niceStep(range, targetTicks = 5) {
  const rough = Math.max(range, Number.EPSILON) / Math.max(1, targetTicks - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const factor = residual >= 7 ? 10 : residual >= 3 ? 5 : residual >= 1.5 ? 2 : 1;
  return factor * magnitude;
}

// How many fractional digits a tick step needs to be printed without two ticks
// collapsing onto the same label (0,5 → 1; 0,05 → 2; 500 → 0).
export function axisDecimals(step) {
  const value = Math.abs(Number(step));
  if (!Number.isFinite(value) || value === 0) return 0;
  const text = String(Number(value.toPrecision(12)));
  if (text.includes("e-")) {
    const exponent = Number(text.split("e-")[1]);
    return Number.isFinite(exponent) ? exponent : 0;
  }
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

// `fromZero` keeps its old meaning: an axis that must include zero. Everything
// else is padded around the published values so a narrow band stays readable. A
// non-negative series never pads below zero, because a negative tick on a series
// without negative values is a lie about the data.
export function niceDomain(min, max, { fromZero = false, pad = 0.08 } = {}) {
  const first = Number.isFinite(min) ? min : 0;
  const second = Number.isFinite(max) ? max : 0;
  let lower = Math.min(first, second);
  let upper = Math.max(first, second);
  if (fromZero) {
    lower = Math.min(0, lower);
    upper = Math.max(0, upper);
  } else {
    const span = upper - lower;
    const padding = span > 0 ? span * pad : Math.max(Math.abs(upper) * 0.05, 0.5);
    const nonNegative = lower >= 0;
    lower -= padding;
    upper += padding;
    if (nonNegative && lower < 0) lower = 0;
  }
  if (upper <= lower) upper = lower + 1;
  const step = niceStep(upper - lower, 5);
  let lo = Math.floor(lower / step) * step;
  let hi = Math.ceil(upper / step) * step;
  if (fromZero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  const count = Math.max(1, Math.round((hi - lo) / step));
  const ticks = Array.from({ length: count + 1 }, (_, index) => Number((lo + index * step).toFixed(10)));
  lo = Number(lo.toFixed(10));
  hi = Number(hi.toFixed(10));
  return { lo, hi, ticks, step, zeroBaseline: lo === 0 };
}

// A bar chart is read against zero and a line chart against its own published
// band. Drawing both from zero flattened every non-negative line series: KK51
// metsamaa pindala 2310,6–2360,2 tuhat ha became a straight line along the top
// edge, and a 1 500-unit change in a 14 000–15 500 series covered 9 % of the
// plot. A bar chart, in the other direction, must keep zero: its length is the
// quantity, so an axis that starts just below the shortest bar exaggerates it.
export function chartDomain(values = [], { kind = "line" } = {}) {
  const numbers = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(value));
  if (!numbers.length) return niceDomain(0, 1, { fromZero: true });
  let minimum = numbers[0];
  let maximum = numbers[0];
  for (const value of numbers) {
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }
  return niceDomain(minimum, maximum, { fromZero: kind === "bar" });
}

// Bars grow from the zero line: up for a positive value, down for a negative
// one. Measuring every bar from the axis bottom instead gave a negative value
// zero height (invisible) and a positive value the height of the whole plot.
export function barShape(value, { yFor, zeroY }) {
  const valueY = yFor(value);
  return { y: Math.min(valueY, zeroY), height: Math.abs(valueY - zeroY), down: valueY > zeroY };
}

// A truncated axis has to say so, in words, next to the chart. A zero-based
// axis needs no note, and neither does an axis whose floor is negative, because
// zero then sits inside the plot rather than above it.
export function baselineNote(domain, unit, digits = 0) {
  if (!domain || domain.zeroBaseline !== false || !(Number(domain.lo) > 0)) return "";
  // The axis floor is a tick, so it may need more decimals than the series
  // values themselves (a 1–2 series starts at 0,8, not at "1").
  const floorDigits = Math.max(Number(digits) || 0, axisDecimals(domain.step));
  const suffix = unit ? ` ${unit}` : "";
  return `Vertikaaltelg algab väärtusest ${formatChartValue(domain.lo, floorDigits)}${suffix}, mitte nullist.`;
}

// Two different units cannot share one value axis: 15 458 tuhat m³ and 14,37
// mln m³ on the same scale either hide one series or invent a factor of 1000
// between them. Grouping keeps a shared axis only where the unit really is
// shared, and the component draws one panel per group.
export function chartUnitGroups(chart) {
  const chartUnit = String(chart?.unit ?? "").trim();
  const groups = new Map();
  for (const series of chart?.series || []) {
    const unit = String(series?.unit ?? "").trim() || chartUnit;
    if (!groups.has(unit)) groups.set(unit, []);
    groups.get(unit).push(series);
  }
  return [...groups].map(([unit, series]) => ({ unit, series }));
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

export function chartDescription(chart, digits) {
  const kind = chart.kind === "bar" ? "Tulpdiagramm" : "Joondiagramm";
  const parts = (chart.series || []).map((series) => {
    const first = series.points[0];
    const last = series.points.at(-1);
    return `${series.label}: ${first.x} – ${formatChartValue(first.y, digits)} ${chart.unit}, ${last.x} – ${formatChartValue(last.y, digits)} ${chart.unit}`;
  });
  return `${kind}. ${parts.join("; ")}.`;
}

// The number of fractional digits actually present among a series' values. A
// four-digit quantity keeps at most one decimal so a 2 360,234 source value does
// not turn the axis into a wall of digits; a small one keeps everything the
// publisher printed (6,55 stays 6,55).
export function seriesPrecision(points = []) {
  let digits = 0;
  let largest = 0;
  for (const point of points) {
    const value = Number(point?.y);
    if (!Number.isFinite(value)) continue;
    const magnitude = Math.abs(value);
    if (magnitude > largest) largest = magnitude;
    const rounded = Number(value.toFixed(MAX_PRECISION));
    const text = String(rounded);
    const dot = text.indexOf(".");
    const fractionDigits = dot === -1 ? 0 : text.length - dot - 1;
    if (fractionDigits > digits) digits = fractionDigits;
  }
  return Math.min(digits, largest >= 1000 ? 1 : MAX_PRECISION);
}

export function shareArcs(points = []) {
  const total = points.reduce((sum, point) => sum + (Number.isFinite(point.y) ? point.y : 0), 0);
  let angle = 0;
  return points.map((point) => {
    const fraction = total > 0 ? point.y / total : 0;
    const start = angle;
    angle += fraction * Math.PI * 2;
    return { ...point, start, end: angle, percent: Number((fraction * 100).toFixed(1)) };
  });
}
