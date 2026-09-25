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

export function chartDescription(chart, digits) {
  const kind = chart.kind === "bar" ? "Tulpdiagramm" : "Joondiagramm";
  const parts = (chart.series || []).map((series) => {
    const first = series.points[0];
    const last = series.points.at(-1);
    return `${series.label}: ${first.x} – ${formatChartValue(first.y, digits)} ${chart.unit}, ${last.x} – ${formatChartValue(last.y, digits)} ${chart.unit}`;
  });
  return `${kind}. ${parts.join("; ")}.`;
}

// The maximum number of fractional digits actually present among a series'
// values, capped at 1 so a chart never shows more precision than the source
// (avoids drift between rounded-to-integer axis ticks and a more precise
// end-label/tooltip/table rendering of the same underlying value).
export function seriesPrecision(points = []) {
  let digits = 0;
  for (const point of points) {
    const rounded = Number(Number(point.y).toFixed(3));
    const text = String(rounded);
    const dot = text.indexOf(".");
    const fractionDigits = dot === -1 ? 0 : text.length - dot - 1;
    if (fractionDigits > digits) digits = fractionDigits;
  }
  return Math.min(digits, 1);
}
