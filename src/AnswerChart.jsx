import { useEffect, useId, useMemo, useRef, useState } from "react";
import { chartDescription, formatChartValue, niceDomain, seriesPrecision, shareArcs, splitRuns, xTickStep } from "./answer-chart-layout.js";

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

function valueWithError(point, unit, digits) {
  const base = `${formatChartValue(point.y, digits)} ${unit}`;
  return point.error === undefined ? base : `${base} (±${formatChartValue(point.error, 1)}%)`;
}

function SeriesChart({ chart, citation = null }) {
  const [frameRef, width] = useContainerWidth();
  const [activeYear, setActiveYear] = useState(null);
  const titleId = useId();
  const descId = useId();
  const digits = useMemo(
    () => Math.max(...chart.series.map((series) => seriesPrecision(series.points))),
    [chart],
  );
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
  const tooltipLeftRaw = tooltipX + 12 + TOOLTIP_WIDTH > width ? tooltipX - 12 - TOOLTIP_WIDTH : tooltipX + 12;
  const tooltipLeft = Math.max(0, Math.min(width - TOOLTIP_WIDTH, tooltipLeftRaw));
  const tooltipHeight = 22 + 18 * chart.series.length;
  const endLabelYs = [];
  const visibleTickIndexes = useMemo(() => {
    const shown = [];
    for (let index = 0; index < years.length; index += 1) {
      if (index % tickStep === 0) shown.push(index);
    }
    const lastIndex = years.length - 1;
    if (shown.at(-1) !== lastIndex) {
      if (lastIndex - shown.at(-1) < tickStep) shown.pop();
      shown.push(lastIndex);
    }
    return new Set(shown);
  }, [years, tickStep]);

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
          aria-label={chart.title}
          height={HEIGHT}
          onPointerLeave={() => setActiveYear(null)}
          onPointerMove={(event) => setActiveYear(nearestYear(event.clientX, event.currentTarget))}
          role="group"
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width={width}
        >
          <desc id={descId}>{chartDescription(chart, digits)}</desc>
          {domain.ticks.map((tick) => (
            <g key={tick}>
              <line className="answer-chart__grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={yFor(tick)} y2={yFor(tick)} />
              <text className="answer-chart__tick" textAnchor="end" x={MARGIN.left - 8} y={yFor(tick) + 4}>{formatChartValue(tick, tick % 1 === 0 ? 0 : 1)}</text>
            </g>
          ))}
          {years.map((year, index) => (visibleTickIndexes.has(index) ? (
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
                      aria-label={`${series.label}, ${point.x}: ${valueWithError(point, chart.unit, digits)}`}
                      className="answer-chart__hit"
                      height={baseline - MARGIN.top}
                      onBlur={() => setActiveYear(null)}
                      onFocus={() => setActiveYear(point.x)}
                      tabIndex={0}
                      width={chart.series.length > 1 ? barWidth + 2 : Math.max(barWidth, 24)}
                      x={chart.series.length > 1 ? x - 1 : x - Math.max(0, (24 - barWidth) / 2)}
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
                      aria-label={`${series.label}, ${point.x}: ${valueWithError(point, chart.unit, digits)}`}
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
                  <text className="answer-chart__value" x={xFor(last.x) + 9} y={labelY}>{formatChartValue(last.y, digits)}</text>
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
                  <text className="answer-chart__value" x={18} y={4}>{point ? valueWithError(point, chart.unit, digits) : "avaldamata"}</text>
                </g>
              ))}
            </g>
          ) : null}
        </svg>
      </div>
      <div className="sr-only">
        <table>
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
                  return <td key={series.id}>{point ? valueWithError(point, chart.unit, digits) : "–"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="answer-chart__caption">{chart.caption ? `${chart.caption} ` : ""}{citation}</p>
    </figure>
  );
}

const SHARE_SIZE = 220;
const SHARE_OUTER = 96;
const SHARE_INNER = 60;
// One accent for the emphasised class, a quiet single-hue ramp for the rest:
// the story is one share, the other slices are context.
const SHARE_NEUTRALS = ["#6f8ea3", "#8fa8b8", "#aebfcb", "#c6d3db", "#d9e2e8", "#e8eef2", "#f2f5f7"];

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

function ShareChart({ chart, citation = null }) {
  const titleId = useId();
  const descId = useId();
  const points = chart.series[0].points;
  const arcs = useMemo(() => shareArcs(points), [points]);
  const emphasised = arcs.findIndex((arc) => arc.emphasis) >= 0 ? arcs.findIndex((arc) => arc.emphasis) : 0;
  const [active, setActive] = useState(null);
  const shown = arcs[active ?? emphasised];
  let neutral = 0;
  const colours = arcs.map((arc) => (arc.emphasis ? "var(--brand-700)" : SHARE_NEUTRALS[Math.min(neutral++, SHARE_NEUTRALS.length - 1)]));
  const description = `Sektordiagramm. ${arcs.map((arc) => `${arc.label} ${formatChartValue(arc.percent, 1)} %`).join("; ")}.`;
  return (
    <figure className="answer-chart answer-chart--share">
      <figcaption className="answer-chart__title" id={titleId}>{chart.title}</figcaption>
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
            <text className="answer-chart__share-percent" textAnchor="middle" x={SHARE_SIZE / 2} y={SHARE_SIZE / 2 + 2}>
              {formatChartValue(shown.percent, 1)} %
            </text>
            <text className="answer-chart__share-label" textAnchor="middle" x={SHARE_SIZE / 2} y={SHARE_SIZE / 2 + 22}>
              {shown.label}
            </text>
          </svg>
        </div>
        <ul className="answer-chart__share-legend">
          {arcs.map((arc, index) => (
            <li className={active === index ? "is-active" : undefined} key={arc.x} onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)}>
              <span aria-hidden="true" className="answer-chart__key answer-chart__key--bar" style={{ background: colours[index] }} />
              <span className="answer-chart__share-name">{arc.label}</span>
              <span className="answer-chart__share-value">{formatChartValue(arc.y, 1)} {chart.unit}</span>
              <span className="answer-chart__share-share">{formatChartValue(arc.percent, 1)} %</span>
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
      <p className="answer-chart__caption">{chart.caption ? `${chart.caption} ` : ""}{citation}</p>
    </figure>
  );
}

export default function AnswerChart({ chart, citation = null }) {
  if (chart.kind === "share") return <ShareChart chart={chart} citation={citation} />;
  return <SeriesChart chart={chart} citation={citation} />;
}
