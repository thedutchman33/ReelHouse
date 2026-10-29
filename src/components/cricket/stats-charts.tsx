"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ActiveDot } from "@/components/f1/chart-interaction";
import { ChartTooltip, useChartDismiss } from "@/components/f1/standings/charts";

export const CHART_BLUE = "#8fb4ec";
export const CHART_GOLD = "#d9af6b";
export const CHART_RED = "#f1788a";
export const CHART_TEAL = "#5fd4c4";
const AXIS = "#94a3b8";
const GRID = "#334155";

export interface ChartSeries {
  name: string;
  colour: string;
  points: { label: string; value: number }[];
}

const fmt = (value: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value);

// -------------------------------- line chart --------------------------------

export function LineChart({
  series,
  height = 250,
  ariaLabel,
  valueLabel = "Value",
  secondaryAxis = false,
}: {
  series: ChartSeries[];
  height?: number;
  ariaLabel: string;
  valueLabel?: string;
  /** Treat the second series as a separate right-hand axis. */
  secondaryAxis?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ index: number; left: number; top: number } | null>(null);
  useChartDismiss(svgRef, () => setHover(null));

  const labels = useMemo(() => {
    const all = new Set<string>();
    series.forEach((entry) => entry.points.forEach((point) => all.add(point.label)));
    return [...all].sort((a, b) => {
      const year = (value: string) => Number.parseInt(value.slice(0, 4), 10) || 0;
      return year(a) - year(b) || a.localeCompare(b);
    });
  }, [series]);

  const valueMap = useMemo(
    () =>
      series.map((entry) => {
        const map = new Map<string, number>();
        entry.points.forEach((point) => map.set(point.label, point.value));
        return map;
      }),
    [series]
  );
  const primaryMax = Math.max(1, ...series[0]?.points.map((point) => point.value) ?? [0]);
  const secondaryMax = Math.max(
    1,
    ...(secondaryAxis ? series[1]?.points.map((point) => point.value) ?? [0] : [0])
  );
  const max = primaryMax * 1.12;
  const max2 = secondaryMax * 1.12;

  const width = 660;
  const left = 38;
  const right = secondaryAxis ? 44 : 16;
  const top = 22;
  const bottom = 42;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const x = (index: number) =>
    left + (index / Math.max(1, labels.length - 1)) * plotW;
  const y = (value: number, index: number) =>
    height - bottom - (value / (secondaryAxis && index === 1 ? max2 : max)) * plotH;
  const step = Math.max(1, Math.ceil(labels.length / 9));

  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const vx = ((event.clientX - box.left) / box.width) * width;
    const index = Math.max(
      0,
      Math.min(labels.length - 1, Math.round(((vx - left) / plotW) * (labels.length - 1)))
    );
    setHover({ index, left: box.left + (x(index) / width) * box.width, top: box.top });
  };

  if (labels.length < 1 || series.every((entry) => entry.points.length === 0)) {
    return <ChartEmpty />;
  }

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
        {series.map((entry) => (
          <span key={entry.name} className="inline-flex items-center gap-1.5 text-white/60">
            <span
              aria-hidden="true"
              className="h-[2px] w-4 rounded-full"
              style={{ backgroundColor: entry.colour }}
            />
            {entry.name}
          </span>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full cursor-crosshair touch-pan-y select-none"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          setHover(null);
        }}
      >
        <defs>
          {series.map((entry, index) => (
            <linearGradient key={entry.name} id={`ck-line-${uid}-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={entry.colour} stopOpacity="0.26" />
              <stop offset="100%" stopColor={entry.colour} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = Math.round(max * fraction);
          const yy = height - bottom - fraction * plotH;
          return (
            <g key={fraction}>
              <line
                x1={left}
                x2={width - right}
                y1={yy}
                y2={yy}
                stroke={GRID}
                strokeOpacity={fraction === 0 ? 0.65 : 0.3}
                strokeDasharray={fraction === 0 ? undefined : "3 5"}
              />
              <text x={left - 7} y={yy + 3} textAnchor="end" fontSize="9" fontWeight="700" fill={AXIS}>
                {value}
              </text>
            </g>
          );
        })}

        {labels.map((label, index) => {
          if (index % step !== 0 && index !== labels.length - 1) return null;
          return (
            <g key={label}>
              <line
                x1={x(index)}
                x2={x(index)}
                y1={top}
                y2={height - bottom}
                stroke={GRID}
                strokeOpacity={0.14}
              />
              <text
                x={x(index)}
                y={height - 16}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill={AXIS}
              >
                {label}
              </text>
            </g>
          );
        })}

        {series.map((entry, index) => {
          const points = labels
            .map((label, labelIndex) => ({
              label,
              value: valueMap[index].get(label),
              x: x(labelIndex),
            }))
            .filter((point): point is { label: string; value: number; x: number } => point.value != null);
          if (!points.length) return null;
          const line = points
            .map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${point.x.toFixed(1)},${y(point.value, index).toFixed(1)}`)
            .join(" ");
          const area = `${line} L${points[points.length - 1].x.toFixed(1)},${height - bottom} L${points[0].x.toFixed(1)},${height - bottom} Z`;
          return (
            <g key={entry.name}>
              {index === 0 && <path d={area} fill={`url(#ck-line-${uid}-${index})`} />}
              <path
                d={line}
                fill="none"
                stroke={entry.colour}
                strokeWidth={index === 1 ? 1.8 : 2.3}
                strokeDasharray={index === 1 ? "4 4" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                className="f1-draw"
                style={{ animationDelay: `${index * 140}ms` }}
              />
              {points.map((point, pointIndex) => (
                <circle
                  key={point.label}
                  cx={point.x}
                  cy={y(point.value, index)}
                  r={hover?.index === labels.indexOf(point.label) ? 4.2 : 2.8}
                  fill="#0f0f15"
                  stroke={entry.colour}
                  strokeWidth="1.8"
                  className="f1-dot-in transition-[r] duration-150"
                  style={{ animationDelay: `${300 + pointIndex * 35}ms` }}
                />
              ))}
            </g>
          );
        })}

        {hover && (
          <g pointerEvents="none">
            <line
              x1={x(hover.index)}
              x2={x(hover.index)}
              y1={top}
              y2={height - bottom}
              stroke={AXIS}
              strokeOpacity={0.5}
              strokeDasharray="3 4"
            />
            {series.map((entry, index) => {
              const value = valueMap[index].get(labels[hover.index]);
              if (value == null) return null;
              return <ActiveDot key={entry.name} x={x(hover.index)} y={y(value, index)} colour={entry.colour} r={4.2} />;
            })}
          </g>
        )}

        <text x="2" y="12" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.3)" letterSpacing="1.2">
          {valueLabel.toUpperCase()}
        </text>
        {secondaryAxis && series[1] && (
          <text x={width - 4} y="12" textAnchor="end" fontSize="8" fontWeight="700" fill={series[1].colour} letterSpacing="0.8">
            {series[1].name.toUpperCase()}
          </text>
        )}
      </svg>

      {hover && (
        <ChartTooltip anchorX={hover.left} anchorY={hover.top} width={220}>
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#8fb4ec]" />
            <span className="text-[13px] font-bold text-white">{labels[hover.index]}</span>
          </div>
          <div className="space-y-1 px-3 py-2">
            {series.map((entry, index) => {
              const value = valueMap[index].get(labels[hover.index]);
              return (
                <div key={entry.name} className="flex items-center gap-2 text-[12px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.colour }} />
                  <span className="min-w-0 flex-1 truncate text-white/55">{entry.name}</span>
                  <span className="font-f1 text-[13px] font-bold tabular-nums text-white">
                    {value == null ? "—" : fmt(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

// ---------------------------------- radar -----------------------------------

export function RadarChart({
  axes,
  series,
  ariaLabel,
}: {
  axes: string[];
  series: { name: string; colour: string; values: number[]; labels: string[] }[];
  ariaLabel: string;
}) {
  const width = 560;
  const height = 370;
  const cx = 280;
  const cy = 178;
  const radius = 118;
  const maxes = axes.map((_, index) => Math.max(1, ...series.map((entry) => entry.values[index] ?? 0)) * 1.12);
  const point = (axisIndex: number, fraction: number) => {
    const angle = (Math.PI * 2 * axisIndex) / axes.length - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * radius * fraction,
      y: cy + Math.sin(angle) * radius * fraction,
    };
  };
  const polygon = (values: number[]) =>
    values
      .map((value, index) => {
        const pt = point(index, Math.min(1, Math.max(0, value / maxes[index])));
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full select-none" role="img" aria-label={ariaLabel}>
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <polygon
            key={fraction}
            points={axes.map((_, index) => {
              const pt = point(index, fraction);
              return `${pt.x},${pt.y}`;
            }).join(" ")}
            fill="none"
            stroke={GRID}
            strokeOpacity={0.38}
            strokeDasharray={fraction === 1 ? undefined : "3 5"}
          />
        ))}
        {axes.map((axis, index) => {
          const edge = point(index, 1);
          const labelPoint = point(index, 1.22);
          return (
            <g key={axis}>
              <line x1={cx} y1={cy} x2={edge.x} y2={edge.y} stroke={GRID} strokeOpacity={0.32} />
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor={labelPoint.x > cx + 8 ? "start" : labelPoint.x < cx - 8 ? "end" : "middle"}
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="700"
                fill="rgba(238,244,255,0.55)"
                letterSpacing="0.8"
              >
                {axis}
              </text>
            </g>
          );
        })}
        {series.map((entry, index) => (
          <g key={entry.name}>
            <polygon
              points={polygon(entry.values)}
              fill={entry.colour}
              fillOpacity={0.12}
              stroke={entry.colour}
              strokeWidth="2"
              className="ck-radar polygon"
              style={{ animationDelay: `${index * 160}ms` }}
            />
            {entry.values.map((value, axisIndex) => {
              const pt = point(axisIndex, Math.min(1, Math.max(0, value / maxes[axisIndex])));
              return (
                <circle
                  key={`${entry.name}-${axes[axisIndex]}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="3.6"
                  fill="#0b1730"
                  stroke={entry.colour}
                  strokeWidth="2"
                  className="f1-dot-in"
                  style={{ animationDelay: `${220 + axisIndex * 40}ms` }}
                />
              );
            })}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12.5px]">
        {series.map((entry) => (
          <span key={entry.name} className="inline-flex items-center gap-1.5 text-white/65">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.colour }} />
            {entry.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------- donut -----------------------------------

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  size = 216,
}: {
  segments: { label: string; value: number; colour: string }[];
  centerLabel: string;
  centerValue: string;
  size?: number;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const radius = 76;
  const circumference = 2 * Math.PI * radius;
  const [active, setActive] = useState<number | null>(null);
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="img" aria-label={`${centerLabel}: ${centerValue}`}>
          <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
          {segments.map((segment, index) => {
            const value = Math.max(0, segment.value);
            const length = total > 0 ? (value / total) * circumference : 0;
            const dashOffset = -offset;
            offset += length;
            return (
              <circle
                key={segment.label}
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={segment.colour}
                strokeWidth={active === index ? 24 : 18}
                strokeLinecap="butt"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
                opacity={active == null || active === index ? 1 : 0.3}
                className="ck-donut-arc cursor-pointer transition-[stroke-width,opacity] duration-200"
                style={
                  {
                    "--ck-dash": `${length}`,
                    "--ck-offset": `${dashOffset}`,
                    "--ck-circ": `${circumference}`,
                    animationDelay: `${index * 110}ms`,
                  } as CSSProperties
                }
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-f1 text-[28px] font-bold leading-none tabular-nums text-white">{centerValue}</p>
            <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/35">{centerLabel}</p>
          </div>
        </div>
      </div>
      <div className="min-w-[140px] space-y-1.5">
        {segments.map((segment, index) => (
          <div
            key={segment.label}
            className={`flex items-center gap-2 text-[12.5px] transition-opacity ${
              active != null && active !== index ? "opacity-40" : "opacity-100"
            }`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.colour }} />
            <span className="text-white/55">{segment.label}</span>
            <span className="ml-auto font-f1 text-[13px] font-bold tabular-nums text-white">
              {fmt(segment.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------- gauge -----------------------------------

export function RadialGauge({
  label,
  value,
  suffix = "%",
  colour = CHART_BLUE,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  colour?: string;
}) {
  const safe = Math.max(0, Math.min(100, value ?? 0));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const length = (safe / 100) * circumference;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
      <div className="relative h-[92px] w-[92px] shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={colour}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${length} ${circumference - length}`}
            className="ck-gauge"
            style={
              {
                "--ck-dash": `${length}`,
                "--ck-circ": `${circumference}`,
              } as CSSProperties
            }
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-f1 text-[17px] font-bold tabular-nums text-white">
          {value == null ? "—" : `${Math.round(safe)}${suffix}`}
        </span>
      </div>
      <p className="text-[11.5px] font-semibold uppercase leading-snug tracking-[0.12em] text-white/40">
        {label}
      </p>
    </div>
  );
}

export function ChartEmpty({ label = "No data for this view" }: { label?: string }) {
  return (
    <div className="grid min-h-[150px] place-items-center rounded-xl border border-dashed border-white/10 bg-black/20 px-4 text-center text-[12.5px] text-white/35">
      {label}
    </div>
  );
}

export function StatBars({
  rows,
  colour = CHART_BLUE,
  valueSuffix = "",
}: {
  rows: { label: string; value: number }[];
  colour?: string;
  valueSuffix?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="space-y-2.5">
      {rows.map((row, index) => (
        <div key={row.label} className="grid grid-cols-[minmax(0,120px)_1fr_auto] items-center gap-2.5">
          <span className="truncate text-[12.5px] text-white/55">{row.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
            <span
              className="ck-bar block h-full rounded-full transition-[filter] duration-150 hover:brightness-125"
              style={{
                width: `${Math.max(2, (row.value / max) * 100)}%`,
                background: `linear-gradient(90deg, ${colour}55, ${colour})`,
                animationDelay: `${index * 65}ms`,
              }}
            />
          </span>
          <span className="w-14 text-right font-f1 text-[13px] font-bold tabular-nums text-white">
            {fmt(row.value)}
            {valueSuffix}
          </span>
        </div>
      ))}
    </div>
  );
}
