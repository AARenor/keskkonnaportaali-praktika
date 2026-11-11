import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  MIN_MEASURED_WIDTH,
  axisDecimals,
  barShape,
  baselineNote,
  chartDescription,
  chartDomain,
  chartMargins,
  chartUnitGroups,
  formatChartValue,
  seriesPrecision,
  shareArcs,
  splitRuns,
  xTickStep,
} from "./answer-chart-layout.js";
import { sourceOrganizationLabel } from "./source-label.js";

const HEIGHT = 260;
const SERIES_COLORS = ["var(--brand-700)", "var(--green)", "var(--purple)"];
const TOOLTIP_WIDTH = 176;
export const SOURCE_MISMATCH_NOTE = "Tekst ja graafik kasutavad eri allikaid ning eri tõlgenduste tõttu võivad numbrid erineda.";

// The text answer and the chart are built from separately validated sources, so
// their numbers can legitimately disagree; say so where the reader compares them.
function SourceMismatchNote() {
  return (
    <span className="answer-chart__mismatch" role="note">
      <button aria-label={SOURCE_MISMATCH_NOTE} className="answer-chart__mismatch-icon" type="button">!</button>
      <span aria-hidden="true" className="answer-chart__mismatch-tip">{SOURCE_MISMATCH_NOTE}</span>
    </span>
  );
}

function ChartCaption({ chart, citation, sourceDiffers, notes = "" }) {
  return (
    <p className="answer-chart__caption">
      {chart.caption ? `${chart.caption} ` : ""}{citation}{notes ? ` ${notes}` : ""}
      {sourceDiffers ? <SourceMismatchNote /> : null}
    </p>
  );
}

// A phone frame measures well under the old 240 px floor, and the floor kept the
// 640 px fallback in place, so the whole SVG was scaled down to a fraction and
// every 12 px label shrank with it. Any measurable width is used as it is; the
// layout maths takes the narrower margins instead.
function useContainerWidth(fallback = 640) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect?.width || 0);
      if (next >= MIN_MEASURED_WIDTH) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function valueWithError(point, unit, digits) {
  const base = `${formatChartValue(point.y, digits)} ${unit}`;
  return point.error === undefined ? base : `${base} (±${formatChartValue(point.error, 1)}%)`;
}

// Rounded corners at the free end of a bar, whichever way it grows.
function barPath(x, width, { y, height, down }) {
  const radius = 4;
  if (width < 8 || height < 8) return null;
  const straight = width - 2 * radius;
  return down
    ? `M${x},${y} V${y + height - radius} a${radius},${radius} 0 0 0 ${radius},${radius} h${straight} a${radius},${radius} 0 0 0 ${radius},${-radius} V${y} Z`
    : `M${x},${y + height} V${y + radius} a${radius},${radius} 0 0 1 ${radius},${-radius} h${straight} a${radius},${radius} 0 0 1 ${radius},${radius} V${y + height} Z`;
}

// One plot for one unit. Series published in different units cannot share a
// value axis without hiding one of them or inventing a factor between them, so
// each unit gets its own panel and its own labelled axis.
function SeriesPanel({ chart, series, unit, colorOf, width, shared, activeYear, onActiveYear, multiUnit }) {
  const descId = useId();
  const { margins, years, xFor, visibleTickIndexes } = shared;
  const digits = useMemo(
    () => series.reduce((maximum, item) => Math.max(maximum, seriesPrecision(item.points)), 0),
    [series],
  );
  const geometry = useMemo(() => {
    const values = series.flatMap((item) => item.points.map((point) => point.y));
    const domain = chartDomain(values, { kind: chart.kind });
    const plotHeight = HEIGHT - margins.top - margins.bottom;
    const yFor = (value) => margins.top + plotHeight - ((value - domain.lo) / (domain.hi - domain.lo)) * plotHeight;
    const zeroY = yFor(Math.min(Math.max(0, domain.lo), domain.hi));
    const plotWidth = Math.max(60, width - margins.left - margins.right);
    const band = plotWidth / years.length;
    const barWidth = Math.max(4, Math.min(24, (band * 0.7 - 2 * (series.length - 1)) / series.length));
    return { domain, yFor, zeroY, plotHeight, barWidth };
  }, [chart.kind, series, width, margins, years.length]);

  const note = baselineNote(geometry.domain, unit, digits);
  const description = `${chartDescription({ ...chart, unit, series }, digits)}${note ? ` ${note}` : ""}`;
  const tickDigits = axisDecimals(geometry.domain.step);
  const activePoints = activeYear === null
    ? []
    : series.map((item) => ({ item, point: item.points.find((point) => point.x === activeYear) }));
  const tooltipX = activeYear === null ? 0 : xFor(activeYear);
  const tooltipLeftRaw = tooltipX + 12 + TOOLTIP_WIDTH > width ? tooltipX - 12 - TOOLTIP_WIDTH : tooltipX + 12;
  const tooltipLeft = Math.max(0, Math.min(width - TOOLTIP_WIDTH, tooltipLeftRaw));
  const tooltipHeight = 22 + 18 * series.length;
  const endLabelYs = [];

  return (
    <svg
      aria-describedby={descId}
      aria-label={multiUnit ? `${chart.title}, ühik ${unit}` : chart.title}
      height={HEIGHT}
      onPointerLeave={() => onActiveYear(null)}
      onPointerMove={(event) => onActiveYear(shared.nearestYear(event.clientX, event.currentTarget))}
      role="group"
      viewBox={`0 0 ${width} ${HEIGHT}`}
      width={width}
    >
      <desc id={descId}>{description}</desc>
      {unit ? (
        <text className="answer-chart__tick" fontWeight="600" x={margins.left} y={Math.max(11, margins.top - 5)}>Ühik: {unit}</text>
      ) : null}
      {geometry.domain.ticks.map((tick) => (
        <g key={tick}>
          <line className="answer-chart__grid" x1={margins.left} x2={width - margins.right} y1={geometry.yFor(tick)} y2={geometry.yFor(tick)} />
          <text className="answer-chart__tick" textAnchor="end" x={margins.left - 8} y={geometry.yFor(tick) + 4}>{formatChartValue(tick, tickDigits)}</text>
        </g>
      ))}
      {years.map((year, index) => (visibleTickIndexes.has(index) ? (
        <text className="answer-chart__tick" key={year} textAnchor="middle" x={xFor(year)} y={HEIGHT - margins.bottom + 18}>{year}</text>
      ) : null))}
      {activeYear !== null && chart.kind === "line" ? (
        <line className="answer-chart__crosshair" x1={tooltipX} x2={tooltipX} y1={margins.top} y2={margins.top + geometry.plotHeight} />
      ) : null}
      {chart.kind === "bar" ? series.map((item, seriesIndex) => {
        const offset = -((series.length - 1) * (geometry.barWidth + 2)) / 2 + seriesIndex * (geometry.barWidth + 2);
        return item.points.map((point) => {
          const x = xFor(point.x) + offset - geometry.barWidth / 2;
          const shape = barShape(point.y, { yFor: geometry.yFor, zeroY: geometry.zeroY });
          const rounded = barPath(x, geometry.barWidth, shape);
          const dimmed = activeYear !== null && activeYear !== point.x ? 0.55 : 1;
          const hitWidth = series.length > 1 ? geometry.barWidth + 2 : Math.max(geometry.barWidth, 24);
          return (
            <g key={`${item.id}-${point.x}`}>
              {rounded ? (
                <path d={rounded} fill={colorOf(item)} opacity={dimmed} />
              ) : (
                <rect fill={colorOf(item)} height={shape.height} opacity={dimmed} width={geometry.barWidth} x={x} y={shape.y} />
              )}
              <rect
                aria-label={`${item.label}, ${point.x}: ${valueWithError(point, unit, digits)}`}
                className="answer-chart__hit"
                height={geometry.plotHeight}
                onBlur={() => onActiveYear(null)}
                onFocus={() => onActiveYear(point.x)}
                tabIndex={0}
                width={hitWidth}
                x={series.length > 1 ? x - 1 : x - Math.max(0, (24 - geometry.barWidth) / 2)}
                y={margins.top}
              />
            </g>
          );
        });
      }) : series.map((item) => {
        const last = item.points.at(-1);
        let labelY = Math.max(margins.top, geometry.yFor(last.y) - 10);
        if (endLabelYs.some((used) => Math.abs(used - labelY) < 14)) labelY = null;
        else endLabelYs.push(labelY);
        return (
          <g key={item.id}>
            {splitRuns(item.points).map((run) => (
              <path
                d={run.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(point.x)},${geometry.yFor(point.y)}`).join(" ")}
                fill="none"
                key={run[0].x}
                stroke={colorOf(item)}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            ))}
            {item.points.map((point) => (
              <g key={point.x}>
                <circle cx={xFor(point.x)} cy={geometry.yFor(point.y)} fill={colorOf(item)} r={activeYear === point.x ? 5 : 4} stroke="#fff" strokeWidth={2} />
                <circle
                  aria-label={`${item.label}, ${point.x}: ${valueWithError(point, unit, digits)}`}
                  className="answer-chart__hit"
                  cx={xFor(point.x)}
                  cy={geometry.yFor(point.y)}
                  onBlur={() => onActiveYear(null)}
                  onFocus={() => onActiveYear(point.x)}
                  r={12}
                  tabIndex={0}
                />
              </g>
            ))}
            {labelY !== null ? (
              <text className="answer-chart__value" textAnchor="end" x={xFor(last.x) - 9} y={labelY}>{formatChartValue(last.y, digits)}</text>
            ) : null}
          </g>
        );
      })}
      {activeYear !== null ? (
        <g className="answer-chart__tooltip" transform={`translate(${tooltipLeft}, ${margins.top})`}>
          <rect height={tooltipHeight} rx={4} width={TOOLTIP_WIDTH} />
          <text className="answer-chart__tick" x={10} y={16}>{activeYear}</text>
          {activePoints.map(({ item, point }, row) => (
            <g key={item.id} transform={`translate(10, ${30 + row * 18})`}>
              <line stroke={colorOf(item)} strokeWidth={2} x1={0} x2={12} y1={0} y2={0} />
              <text className="answer-chart__value" x={18} y={4}>{point ? valueWithError(point, unit, digits) : "avaldamata"}</text>
            </g>
          ))}
        </g>
      ) : null}
    </svg>
  );
}

function SeriesChart({ chart, citation = null, sourceDiffers = false }) {
  const [frameRef, width] = useContainerWidth();
  const [activeYear, setActiveYear] = useState(null);
  const groups = useMemo(() => chartUnitGroups(chart), [chart]);
  const colorOf = useMemo(() => {
    const colors = new Map();
    chart.series.forEach((item, index) => colors.set(item, SERIES_COLORS[index % SERIES_COLORS.length]));
    return (item) => colors.get(item) || SERIES_COLORS[0];
  }, [chart]);
  const shared = useMemo(() => {
    const years = [...new Set(chart.series.flatMap((item) => item.points.map((point) => point.x)))].sort((a, b) => a - b);
    const margins = chartMargins(width);
    const plotWidth = Math.max(60, width - margins.left - margins.right);
    const minYear = years[0];
    const span = Math.max(1, years.at(-1) - minYear);
    const band = plotWidth / years.length;
    const inset = Math.min(12, plotWidth * 0.1);
    const xFor = (year) => (chart.kind === "bar"
      ? margins.left + band * (years.indexOf(year) + 0.5)
      : margins.left + inset + ((year - minYear) / span) * (plotWidth - 2 * inset));
    const tickStep = xTickStep(years.length, plotWidth);
    const shown = [];
    for (let index = 0; index < years.length; index += 1) {
      if (index % tickStep === 0) shown.push(index);
    }
    const lastIndex = years.length - 1;
    if (shown.at(-1) !== lastIndex) {
      if (lastIndex - shown.at(-1) < tickStep) shown.pop();
      shown.push(lastIndex);
    }
    const nearestYear = (clientX, element) => {
      const rect = element.getBoundingClientRect();
      const x = (clientX - rect.left) * (width / rect.width);
      return years.reduce((best, year) => (Math.abs(xFor(year) - x) < Math.abs(xFor(best) - x) ? year : best), years[0]);
    };
    return { years, margins, plotWidth, band, xFor, tickStep, visibleTickIndexes: new Set(shown), nearestYear };
  }, [chart, width]);
  // Every truncated axis says so in the caption, next to the plot it belongs to.
  const notes = useMemo(() => groups.map(({ unit, series }) => {
    const digits = series.reduce((maximum, item) => Math.max(maximum, seriesPrecision(item.points)), 0);
    const values = series.flatMap((item) => item.points.map((point) => point.y));
    return baselineNote(chartDomain(values, { kind: chart.kind }), unit, digits);
  }).filter(Boolean).join(" "), [groups, chart.kind]);
  const tableDigits = useMemo(
    () => new Map(chart.series.map((item) => [item, seriesPrecision(item.points)])),
    [chart],
  );

  return (
    <figure className="answer-chart">
      <figcaption className="answer-chart__title">{chart.title}</figcaption>
      {chart.series.length > 1 ? (
        <ul className="answer-chart__legend">
          {chart.series.map((item) => (
            <li key={item.id}>
              <span aria-hidden="true" className={`answer-chart__key${chart.kind === "bar" ? " answer-chart__key--bar" : ""}`} style={{ background: colorOf(item) }} />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="answer-chart__frame" ref={frameRef}>
        {groups.map((group) => (
          <SeriesPanel
            activeYear={activeYear}
            chart={chart}
            colorOf={colorOf}
            key={group.unit}
            multiUnit={groups.length > 1}
            onActiveYear={setActiveYear}
            series={group.series}
            shared={shared}
            unit={group.unit}
            width={width}
          />
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>{chart.title}</caption>
          <thead>
            <tr><th scope="col">{chart.xLabel || "Aasta"}</th>{chart.series.map((item) => <th key={item.id} scope="col">{item.label} ({item.unit || chart.unit})</th>)}</tr>
          </thead>
          <tbody>
            {shared.years.map((year) => (
              <tr key={year}>
                <th scope="row">{year}</th>
                {chart.series.map((item) => {
                  const point = item.points.find((candidate) => candidate.x === year);
                  return <td key={item.id}>{point ? valueWithError(point, item.unit || chart.unit, tableDigits.get(item)) : "–"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ChartCaption chart={chart} citation={citation} notes={notes} sourceDiffers={sourceDiffers} />
    </figure>
  );
}

const SHARE_SIZE = 220;
const SHARE_OUTER = 96;
const SHARE_INNER = 60;
// One accent for the emphasised class, a quiet single-hue ramp for the rest:
// the story is one share, the other slices are context.
const SHARE_NEUTRALS = ["#5f7f96", "#7d97a8", "#98adbb", "#b3c3cd", "#c9d5dc", "#dbe3e8", "#e6ecf0"];

function arcPath(start, end, outer, inner) {
  const cx = SHARE_SIZE / 2;
  const cy = SHARE_SIZE / 2;
  const sweep = end - start;
  const large = sweep > Math.PI ? 1 : 0;
  const point = (radius, angle) => [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
  const [x1, y1] = point(outer, start);
  const [x2, y2] = point(outer, end);
  const [x3, y3] = point(inner, end);
  const [x4, y4] = point(inner, start);
  return `M${x1},${y1} A${outer},${outer} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 ${large} 0 ${x4},${y4} Z`;
}

// The donut hole is 120 px wide: a long class name ("Asustusala, teed ja
// trassid") is wrapped onto two short lines instead of spilling over the ring.
const SHARE_LABEL_LINE = 16;

function shareLabelLines(label) {
  const text = String(label || "");
  if (text.length <= SHARE_LABEL_LINE) return [text];
  const words = text.split(/\s+/u);
  let first = "";
  while (words.length && `${first} ${words[0]}`.trim().length <= SHARE_LABEL_LINE) first = `${first} ${words.shift()}`.trim();
  if (!first) first = words.shift();
  let second = words.join(" ");
  if (second.length > SHARE_LABEL_LINE) second = `${second.slice(0, SHARE_LABEL_LINE - 1).trimEnd()}…`;
  return second ? [first, second] : [first];
}

function ShareChart({ chart, citation = null, sourceDiffers = false }) {
  const descId = useId();
  const points = chart.series[0].points;
  const arcs = useMemo(() => shareArcs(points), [points]);
  const emphasised = arcs.findIndex((arc) => arc.emphasis) >= 0 ? arcs.findIndex((arc) => arc.emphasis) : 0;
  const [active, setActive] = useState(null);
  const shown = arcs[active ?? emphasised];
  const labelLines = shareLabelLines(shown.label);
  let neutral = 0;
  const colours = arcs.map((arc) => (arc.emphasis ? "var(--brand-700)" : SHARE_NEUTRALS[Math.min(neutral++, SHARE_NEUTRALS.length - 1)]));
  const description = `Sektordiagramm. ${arcs.map((arc) => `${arc.label} ${formatChartValue(arc.percent, 1)} %`).join("; ")}.`;
  return (
    <figure className="answer-chart answer-chart--share">
      <figcaption className="answer-chart__title">{chart.title}</figcaption>
      <div className="answer-chart__share">
        <div className="answer-chart__donut">
          <svg
            aria-describedby={descId}
            aria-label={chart.title}
            height={SHARE_SIZE}
            onPointerLeave={() => setActive(null)}
            role="group"
            viewBox={`0 0 ${SHARE_SIZE} ${SHARE_SIZE}`}
            width={SHARE_SIZE}
          >
            <desc id={descId}>{description}</desc>
            {arcs.map((arc, index) => (
              <path
                aria-label={`${arc.label}: ${formatChartValue(arc.y, 1)} ${chart.unit} (${formatChartValue(arc.percent, 1)} %)`}
                className="answer-chart__slice"
                d={arcPath(arc.start, arc.end, active === index ? SHARE_OUTER + 4 : SHARE_OUTER, SHARE_INNER)}
                fill={colours[index]}
                key={arc.x}
                onBlur={() => setActive(null)}
                onFocus={() => setActive(index)}
                onPointerEnter={() => setActive(index)}
                stroke="#fff"
                strokeWidth={2}
                tabIndex={0}
              />
            ))}
            <text className="answer-chart__share-percent" textAnchor="middle" x={SHARE_SIZE / 2} y={SHARE_SIZE / 2 + (labelLines.length > 1 ? -4 : 2)}>
              {formatChartValue(shown.percent, 1)} %
            </text>
            <text
              className={`answer-chart__share-label${labelLines.length > 1 ? " answer-chart__share-label--wrapped" : ""}`}
              textAnchor="middle"
              x={SHARE_SIZE / 2}
              y={SHARE_SIZE / 2 + (labelLines.length > 1 ? 14 : 22)}
            >
              {labelLines.map((line, index) => (
                <tspan dy={index === 0 ? 0 : 14} key={line} x={SHARE_SIZE / 2}>{line}</tspan>
              ))}
            </text>
          </svg>
        </div>
        <ul className="answer-chart__share-legend">
          {arcs.map((arc, index) => (
            <li className={active === index ? "is-active" : undefined} key={arc.x} onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
              <span aria-hidden="true" className="answer-chart__key answer-chart__key--bar" style={{ background: colours[index] }} />
              <span className="answer-chart__share-name">{arc.label}</span>
              <span className="answer-chart__share-share">{formatChartValue(arc.percent, 1)} %</span>
              <span className="answer-chart__share-value">{formatChartValue(arc.y, 1)} {chart.unit}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="sr-only">
        <table>
          <caption>{chart.title}</caption>
          <thead>
            <tr><th scope="col">Maakasutus</th><th scope="col">{chart.unit}</th><th scope="col">Osakaal</th></tr>
          </thead>
          <tbody>
            {arcs.map((arc) => (
              <tr key={arc.x}>
                <th scope="row">{arc.label}</th>
                <td>{formatChartValue(arc.y, 1)}</td>
                <td>{formatChartValue(arc.percent, 1)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ChartCaption chart={chart} citation={citation} sourceDiffers={sourceDiffers} />
    </figure>
  );
}

// A page that was loaded before a deploy may receive a chart kind it does not
// know; showing nothing is better than drawing it with the wrong geometry.
const KNOWN_CHART_KINDS = new Set(["line", "bar", "share"]);

// True when the chart's publisher is not among the text answer's publishers.
// Two tables from the same agency are one source to a reader; only a different
// publisher (or, for an unlabelled source, a different page) warns. An answer
// without any citations gives nothing to compare against, so it never warns.
export function chartSourceDiffers(answer, chart, sources = []) {
  if (!chart?.citation || !answer) return false;
  const textCitations = new Set([
    ...(answer.introCitations || []),
    ...(answer.parts || []).flatMap((part) => part.citations || []),
  ]);
  if (!textCitations.size || textCitations.has(chart.citation)) return false;
  const sourceOf = (number) => sources.find((source) => Number(source.citation) === Number(number));
  const identity = (source) => sourceOrganizationLabel(source) || source?.url || "";
  const chartIdentity = identity(sourceOf(chart.citation));
  return !chartIdentity || ![...textCitations].some((number) => identity(sourceOf(number)) === chartIdentity);
}

export default function AnswerChart({ chart, citation = null, sourceDiffers = false }) {
  if (!chart || !KNOWN_CHART_KINDS.has(chart.kind)) return null;
  if (chart.kind === "share") return <ShareChart chart={chart} citation={citation} sourceDiffers={sourceDiffers} />;
  return <SeriesChart chart={chart} citation={citation} sourceDiffers={sourceDiffers} />;
}
