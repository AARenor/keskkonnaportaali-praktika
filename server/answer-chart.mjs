const CHART_KINDS = new Set(["line", "bar", "share"]);
const CHART_KEYS = new Set(["kind", "title", "unit", "xLabel", "series", "citation", "caption"]);
const SERIES_KEYS = new Set(["id", "label", "points"]);
const POINT_KEYS = new Set(["x", "y", "error"]);
const SHARE_POINT_KEYS = new Set(["x", "y", "label", "emphasis"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, maximum, { required = false } = {}) {
  if (value === undefined) return !required;
  return typeof value === "string" && (!required || value.trim().length > 0) && value.length <= maximum;
}

function validPoint(point, kind) {
  if (kind === "share") {
    return isPlainObject(point)
      && Object.keys(point).every((key) => SHARE_POINT_KEYS.has(key))
      && Number.isInteger(point.x) && point.x >= 1 && point.x <= 8
      && typeof point.y === "number" && Number.isFinite(point.y) && point.y >= 0
      && typeof point.label === "string" && point.label.trim().length > 0 && point.label.length <= 60
      && (point.emphasis === undefined || point.emphasis === true);
  }
  return isPlainObject(point)
    && Object.keys(point).every((key) => POINT_KEYS.has(key))
    && Number.isInteger(point.x) && point.x >= 1850 && point.x <= 2100
    && typeof point.y === "number" && Number.isFinite(point.y)
    && (point.error === undefined
      || (typeof point.error === "number" && Number.isFinite(point.error) && point.error >= 0 && point.error <= 1000));
}

function validSeries(series, kind) {
  const maximumPoints = kind === "share" ? 8 : 40;
  return isPlainObject(series)
    && Object.keys(series).every((key) => SERIES_KEYS.has(key))
    && boundedString(series.id, 60, { required: true })
    && boundedString(series.label, 80, { required: true })
    && Array.isArray(series.points) && series.points.length >= 2 && series.points.length <= maximumPoints
    && series.points.every((point) => validPoint(point, kind))
    && series.points.every((point, index) => index === 0 || point.x > series.points[index - 1].x);
}

export function validPublicChart(chart, sources = []) {
  if (!isPlainObject(chart) || !Object.keys(chart).every((key) => CHART_KEYS.has(key))) return false;
  if (!CHART_KINDS.has(chart.kind)) return false;
  if (!boundedString(chart.title, 160, { required: true }) || !boundedString(chart.unit, 40, { required: true })) return false;
  if (!boundedString(chart.xLabel, 40) || !boundedString(chart.caption, 200)) return false;
  const maximumSeries = chart.kind === "share" ? 1 : 3;
  if (!Array.isArray(chart.series) || chart.series.length < 1 || chart.series.length > maximumSeries
    || !chart.series.every((series) => validSeries(series, chart.kind))) return false;
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
      points: series.points.map((point) => ({
        x: point.x,
        y: point.y,
        ...(point.error === undefined ? {} : { error: point.error }),
        ...(point.label === undefined ? {} : { label: point.label }),
        ...(point.emphasis === undefined ? {} : { emphasis: point.emphasis }),
      })),
    })),
    citation: chart.citation,
    ...(chart.caption === undefined ? {} : { caption: chart.caption }),
  };
}

// Adds a chart to an answerable draft without touching its text: the chart's
// source becomes (or already is) one of the draft's cited sources and the
// chart cites that number, so publicResponse keeps the source visible and
// renumbers both together.
export function attachChartToDraft(draft, source, chart) {
  const sources = Array.isArray(draft.sources) ? draft.sources : [];
  const existing = sources.find((candidate) => candidate?.id === source.id);
  if (existing && Number.isInteger(existing.citation) && existing.citation > 0) {
    return { ...draft, chart: { ...chart, citation: existing.citation } };
  }
  const citation = sources.reduce((max, candidate) => Math.max(max, Number(candidate?.citation) || 0), 0) + 1;
  return {
    ...draft,
    sources: [...sources, { ...source, citation, evidenceExcerpt: source.content }],
    chart: { ...chart, citation },
  };
}
