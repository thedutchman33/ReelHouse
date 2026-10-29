"use client";

import { useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  ScorecardBattingRow,
  ScorecardInnings,
  ScorecardTeam,
} from "@/lib/cricket/types";
import { bcciPlayerImageUrl } from "@/lib/cricket/shared";
import { ActiveDot } from "@/components/f1/chart-interaction";
import { ChartTooltip, useChartDismiss } from "@/components/f1/standings/charts";
import { EmptyState, PlayerAvatar } from "./ui";

const AXIS = "#94a3b8";
const GRID = "#334155";
const BLUE = "#8fb4ec";
const GOLD = "#d9af6b";

function oversToBalls(overs: string): number {
  const [whole, part] = overs.split(".");
  const completed = Number(whole) || 0;
  const balls = Number(part) || 0;
  return completed * 6 + Math.min(5, balls);
}

function formatOver(value: number): string {
  const whole = Math.floor(value);
  const balls = Math.round((value - whole) * 6);
  if (balls === 6) return `${whole + 1}.0`;
  return `${whole}.${balls}`;
}

function scoreRuns(score: string | undefined): number {
  const parsed = Number(score?.split("/")[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ---------------------------------- runs ------------------------------------

export function RunsChart({
  rows,
  colour = null,
}: {
  rows: ScorecardBattingRow[];
  colour?: string | null;
}) {
  const top = [...rows]
    .filter((row) => row.balls > 0 || row.runs > 0)
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 9);
  const max = Math.max(1, ...top.map((row) => row.runs));
  const [tip, setTip] = useState<{
    row: ScorecardBattingRow;
    left: number;
    top: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useChartDismiss(svgRef, () => setTip(null));

  if (!top.length) return <EmptyState title="No batting data" />;

  return (
    <div className="relative">
      <div className="space-y-2">
        {top.map((row, index) => (
          <div
            key={row.playerName}
            tabIndex={0}
            className="group grid grid-cols-[minmax(0,150px)_1fr_auto] items-center gap-3 rounded-md outline-none transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04]"
            onPointerEnter={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              setTip({ row, left: box.left + 24, top: box.top });
            }}
            onPointerDown={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              setTip({ row, left: box.left + 24, top: box.top });
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "touch") return;
              setTip(null);
            }}
            onFocus={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              setTip({ row, left: box.left + 24, top: box.top });
            }}
            onBlur={() => setTip(null)}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <PlayerAvatar
                player={{
                  name: row.playerName,
                  imageUrl: row.imageUrl ?? bcciPlayerImageUrl(row.playerId),
                }}
                colour={colour}
                size={24}
              />
              <span className="truncate text-[14px] font-normal text-white/80">
                {row.playerName}
              </span>
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
              <span
                className="ck-bar block h-full rounded-full bg-[linear-gradient(90deg,#1d509e,#8fb4ec)] transition-[filter] duration-150 group-hover:brightness-125"
                style={{
                  width: `${Math.max(2, (row.runs / max) * 100)}%`,
                  animationDelay: `${index * 45}ms`,
                }}
              />
            </span>
            <span className="w-12 text-right font-f1 text-[14px] font-bold tabular-nums text-white">
              {row.runs}
              {row.dismissalString === "not out" ? "*" : ""}
            </span>
          </div>
        ))}
      </div>

      {tip && (
        <ChartTooltip anchorX={tip.left} anchorY={tip.top} width={208}>
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#8fb4ec]" />
            <span className="truncate text-[13px] font-bold text-white">{tip.row.playerName}</span>
            <span className="ml-auto shrink-0 font-f1 text-[13px] font-bold tabular-nums text-white">
              {tip.row.runs} ({tip.row.balls})
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-[12px]">
            <span className="text-white/45">Dismissal</span>
            <span className="truncate text-right text-white/75">{tip.row.dismissalString}</span>
            <span className="text-white/45">Strike rate</span>
            <span className="text-right tabular-nums text-white/75">{tip.row.strikeRate}</span>
            <span className="text-white/45">Boundaries</span>
            <span className="text-right tabular-nums text-white/75">
              {tip.row.fours} × 4 · {tip.row.sixes} × 6
            </span>
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

// ------------------------------- partnerships --------------------------------

interface PartnershipPoint {
  wicket: number;
  runs: number;
  batters: string;
  partnershipRuns: number;
  partnershipBalls: number;
}

export function PartnershipChart({ innings }: { innings: ScorecardInnings }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rows = innings.fallOfWickets;
  const [hover, setHover] = useState<{
    index: number;
    left: number;
    top: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useChartDismiss(svgRef, () => setHover(null));

  const cumulative = useMemo<PartnershipPoint[]>(() => {
    if (rows.length === 0) return [];
    const points: PartnershipPoint[] = [
      {
        wicket: 0,
        runs: 0,
        batters: "Innings start",
        partnershipRuns: 0,
        partnershipBalls: 0,
      },
    ];
    let total = 0;
    rows.forEach((row, index) => {
      const partnershipRuns = row.partnership?.runs ?? 0;
      total += partnershipRuns;
      points.push({
        wicket: index + 1,
        runs: total,
        batters: row.partnership
          ? `${row.partnership.batter1.playerName} / ${row.partnership.batter2.playerName}`
          : row.playerName,
        partnershipRuns,
        partnershipBalls: row.partnership?.balls ?? 0,
      });
    });
    return points;
  }, [rows]);

  if (cumulative.length === 0) return <EmptyState title="No partnership data" />;

  const max = Math.max(1, cumulative[cumulative.length - 1].runs);
  const width = 600;
  const height = 214;
  const left = 34;
  const bottom = 30;
  const top = 18;
  const usableW = width - left - 16;
  const usableH = height - bottom - top;
  const points = cumulative.map((point, index) => ({
    x: left + (index / Math.max(1, cumulative.length - 1)) * usableW,
    y: height - bottom - (point.runs / max) * usableH,
    ...point,
  }));
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${points[points.length - 1].x},${height - bottom} L${points[0].x},${height - bottom} Z`;
  const hovered = hover ? points[hover.index] : null;

  const showAt = (index: number, clientX: number, clientY: number) => {
    setHover({ index, left: clientX, top: clientY });
  };

  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const vx = ((event.clientX - box.left) / box.width) * width;
    let nearest = 0;
    let best = Infinity;
    points.forEach((point, index) => {
      const distance = Math.abs(point.x - vx);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    showAt(nearest, box.left + (points[nearest].x / width) * box.width, box.top);
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full cursor-crosshair touch-pan-y select-none"
        role="img"
        aria-label="Cumulative partnership runs, with a pointer tooltip for every wicket"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          setHover(null);
        }}
      >
        <defs>
          <linearGradient id={`ck-partnership-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3f78d8" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#3f78d8" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((fraction) => {
          const value = Math.round(max * fraction);
          const y = top + usableH * fraction;
          return (
            <g key={fraction}>
              <line
                x1={left}
                x2={width - 12}
                y1={y}
                y2={y}
                stroke={GRID}
                strokeOpacity={fraction === 0 ? 0.65 : 0.4}
                strokeDasharray={fraction === 0 ? undefined : "3 5"}
              />
              <text x={left - 7} y={y + 3} textAnchor="end" fontSize="9" fontWeight="700" fill={AXIS}>
                {value}
              </text>
            </g>
          );
        })}

        <path d={area} fill={`url(#ck-partnership-${uid})`} />
        <path
          d={line}
          fill="none"
          stroke={BLUE}
          strokeWidth="2"
          strokeLinejoin="round"
          pathLength={1}
          className="f1-draw"
        />

        {hovered && (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={top}
            y2={height - bottom}
            stroke={AXIS}
            strokeOpacity={0.5}
            pointerEvents="none"
          />
        )}

        {points.map((point, index) => {
          const active = hover?.index === index;
          return (
            <g
              key={`${point.wicket}-${index}`}
              tabIndex={0}
              role="img"
              aria-label={`${point.wicket === 0 ? "Innings start" : `${point.wicket} wicket`}: ${point.runs} runs`}
              className="outline-none"
              onFocus={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                showAt(index, box.left + box.width / 2, box.top);
              }}
              onBlur={() => setHover(null)}
            >
              {active ? (
                <ActiveDot x={point.x} y={point.y} colour={BLUE} r={4} />
              ) : (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill="#0f0f15"
                  stroke={GOLD}
                  strokeWidth="2"
                  className="f1-dot-in"
                  style={{ animationDelay: `${Math.min(600, index * 60)}ms` }}
                />
              )}
              <circle cx={point.x} cy={point.y} r="11" fill="transparent" className="cursor-pointer" />
              <text
                x={point.x}
                y={height - 10}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill={active ? "#e2e8f0" : "rgba(255,255,255,0.38)"}
              >
                {point.wicket === 0 ? "0" : `${point.wicket}W`}
              </text>
            </g>
          );
        })}

        <text x="2" y="12" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.3)" letterSpacing="1.2">
          RUNS
        </text>
        <text
          x={width - 12}
          y={height - 10}
          textAnchor="end"
          fontSize="8"
          fontWeight="700"
          fill="rgba(255,255,255,0.25)"
          letterSpacing="1.2"
        >
          WICKETS
        </text>
      </svg>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-white/40">
        <span>{Math.max(0, cumulative.length - 1)} partnerships</span>
        <span className="text-white/15">·</span>
        <span>{max} runs</span>
        <span className="text-white/15">·</span>
        <span className="text-[#8fb4ec]">Hover or tap a wicket for the partnership</span>
      </div>

      {hovered && (
        <ChartTooltip anchorX={hover!.left} anchorY={hover!.top} width={244}>
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#d9af6b]" />
            <span className="text-[13px] font-bold text-white">
              {hovered.wicket === 0 ? "Innings start" : `${hovered.wicket} wicket`}
            </span>
            <span className="ml-auto shrink-0 font-f1 text-[13px] font-bold tabular-nums text-[#d9af6b]">
              {hovered.runs} runs
            </span>
          </div>
          <div className="space-y-1 px-3 py-2 text-[12px]">
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-white/40">Batters</span>
              <span className="ml-auto max-w-[168px] truncate text-right text-white/80">
                {hovered.batters}
              </span>
            </div>
            {hovered.wicket > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-white/40">Partnership</span>
                  <span className="ml-auto tabular-nums text-white/80">
                    {hovered.partnershipRuns} runs
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white/40">Balls</span>
                  <span className="ml-auto tabular-nums text-white/80">
                    {hovered.partnershipBalls}
                  </span>
                </div>
              </>
            )}
            <div className="flex items-center gap-2 border-t border-white/[0.08] pt-1.5">
              <span className="text-white/40">Score at fall</span>
              <span className="ml-auto font-f1 text-[13px] font-bold tabular-nums text-white">
                {hovered.runs}/{hovered.wicket}
              </span>
            </div>
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

// ----------------------------- match progress -------------------------------

interface ProgressPoint {
  over: number;
  runs: number;
  wickets: number;
}

interface ProgressSeries {
  team: ScorecardTeam | null;
  name: string;
  inningsLabel: string;
  totalRuns: number;
  endOver: number;
  totalWickets: number;
  colour: string;
  points: ProgressPoint[];
  line: ProgressPoint[];
}

/** Cumulative runs at an exact over, interpolated between known score points. */
function runsAt(points: ProgressPoint[], over: number): number {
  if (!points.length) return 0;
  if (over <= points[0].over) return points[0].runs;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (over <= next.over + 0.001) {
      const span = next.over - previous.over;
      if (span <= 0) return next.runs;
      const position = Math.min(1, Math.max(0, (over - previous.over) / span));
      return previous.runs + (next.runs - previous.runs) * position;
    }
  }
  return points[points.length - 1].runs;
}

function wicketsAt(points: ProgressPoint[], over: number): number {
  let wickets = 0;
  for (const point of points) {
    if (point.over > over + 0.001) break;
    wickets = Math.max(wickets, point.wickets);
  }
  return wickets;
}

function progressSeries(innings: ScorecardInnings[], teams: ScorecardTeam[]): ProgressSeries[] {
  return innings.slice(0, 2).map((entry, index) => {
    const team = teams.find((candidate) => candidate.id === entry.teamId) ?? null;
    const endOver = Math.max(0, oversToBalls(entry.overs) / 6);
    const totalRuns = scoreRuns(entry.score);
    const points: ProgressPoint[] = [{ over: 0, runs: 0, wickets: 0 }];
    let cumulativeBalls = 0;
    let cumulativeRuns = 0;
    entry.fallOfWickets.forEach((row, wicketIndex) => {
      cumulativeBalls += row.partnership?.balls ?? 0;
      cumulativeRuns += row.partnership?.runs ?? 0;
      const over = Math.min(endOver, cumulativeBalls / 6);
      const last = points[points.length - 1];
      if (over < last.over - 0.001) return;
      if (Math.abs(over - last.over) < 0.001) {
        last.runs = Math.max(last.runs, cumulativeRuns);
        last.wickets = wicketIndex + 1;
        return;
      }
      points.push({ over, runs: cumulativeRuns, wickets: wicketIndex + 1 });
    });
    const last = points[points.length - 1];
    if (endOver > last.over + 0.001) {
      points.push({ over: endOver, runs: totalRuns, wickets: entry.fallOfWickets.length });
    } else {
      last.runs = Math.max(last.runs, totalRuns);
      last.wickets = Math.max(last.wickets, entry.fallOfWickets.length);
    }

    // One sample per over (plus the partial last over) gives the line its
    // continuous shape while keeping every hover value anchored to a real over.
    const sampleOvers: number[] = [];
    for (let over = 0; over <= Math.floor(endOver); over += 1) sampleOvers.push(over);
    if (endOver > Math.floor(endOver) + 0.001) sampleOvers.push(endOver);
    const line = sampleOvers.map((over) => ({
      over,
      runs: runsAt(points, over),
      wickets: wicketsAt(points, over),
    }));

    return {
      team,
      name: team?.shortName || team?.name || entry.label,
      inningsLabel: entry.label,
      totalRuns,
      endOver,
      totalWickets: entry.fallOfWickets.length,
      colour: index === 0 ? BLUE : GOLD,
      points,
      line,
    };
  });
}

export function MatchProgressChart({
  innings,
  teams,
}: {
  innings: ScorecardInnings[];
  teams: ScorecardTeam[];
}) {
  const series = useMemo(() => progressSeries(innings, teams), [innings, teams]);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [hover, setHover] = useState<{
    over: number;
    left: number;
    top: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useChartDismiss(svgRef, () => setHover(null));

  if (!series.length) return <EmptyState title="No innings to compare" />;

  const maxOver = Math.max(1, ...series.map((entry) => entry.endOver));
  // T20 charts read best at every second over, matching the reference chart;
  // longer formats widen the interval only enough to keep labels legible.
  const step = maxOver <= 24 ? 2 : maxOver <= 60 ? 5 : 10;
  const topOver = Math.max(step, Math.ceil(maxOver / step) * step);
  const ticks = Array.from({ length: Math.floor(topOver / step) + 1 }, (_, index) => index * step);
  const maxScore = Math.max(1, ...series.map((entry) => entry.totalRuns));
  const topRuns = Math.ceil((maxScore * 1.1) / 25) * 25;

  const width = 640;
  const height = 310;
  const left = 40;
  const right = 14;
  const top = 18;
  const bottom = 46;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const x = (over: number) => left + (over / topOver) * plotW;
  const y = (runs: number) => height - bottom - (runs / topRuns) * plotH;

  const scoreAt = (entry: ProgressSeries, over: number) => {
    const capped = Math.min(entry.endOver, Math.max(0, over));
    const ended = over > entry.endOver + 0.001;
    return {
      runs: ended ? entry.totalRuns : runsAt(entry.points, capped),
      wickets: ended ? entry.totalWickets : wicketsAt(entry.points, capped),
      ended,
      over: capped,
    };
  };

  const showAt = (over: number, clientX: number, clientY: number) => {
    setHover({ over, left: clientX, top: clientY });
  };

  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const vx = ((event.clientX - box.left) / box.width) * width;
    const over = Math.min(topOver, Math.max(0, ((vx - left) / plotW) * topOver));
    showAt(Math.round(over), event.clientX, box.top);
  };

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        {series.map((entry) => (
          <span key={entry.inningsLabel} className="inline-flex items-center gap-1.5 text-white/65">
            <span
              aria-hidden="true"
              className="h-[2px] w-4 rounded-full"
              style={{ backgroundColor: entry.colour }}
            />
            {entry.name}
            <span className="tabular-nums text-white/35">
              {entry.totalRuns}/{entry.totalWickets} · {formatOver(entry.endOver)} ov
            </span>
          </span>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full cursor-crosshair touch-pan-y select-none"
        role="img"
        aria-label="Cumulative runs by over for both teams, with wickets marked where they fell"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          setHover(null);
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = Math.round(topRuns * fraction);
          return (
            <g key={fraction}>
              <line
                x1={left}
                x2={width - right}
                y1={y(value)}
                y2={y(value)}
                stroke={GRID}
                strokeOpacity={fraction === 0 ? 0.7 : 0.36}
                strokeDasharray={fraction === 0 ? undefined : "3 5"}
              />
              <text x={left - 7} y={y(value) + 3} textAnchor="end" fontSize="9" fontWeight="700" fill={AXIS}>
                {value}
              </text>
            </g>
          );
        })}

        {ticks.map((tick, index) => {
          if (index === 0) return null;
          return (
            <g key={`grid-${tick}`}>
              <line
                x1={x(tick)}
                x2={x(tick)}
                y1={top}
                y2={height - bottom}
                stroke={GRID}
                strokeOpacity={0.16}
              />
              <text
                x={x(tick)}
                y={height - 13}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill={AXIS}
              >
                {tick}
              </text>
            </g>
          );
        })}
        <text x={left} y={height - 13} textAnchor="middle" fontSize="9" fontWeight="700" fill={AXIS}>
          0
        </text>

        <defs>
          {series.map((entry, index) => (
            <linearGradient
              key={entry.inningsLabel}
              id={`ck-progress-${uid}-${index}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={entry.colour} stopOpacity="0.24" />
              <stop offset="100%" stopColor={entry.colour} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {series.map((entry, index) => {
          if (entry.line.length < 2) return null;
          const line = entry.line
            .map(
              (point, pointIndex) =>
                `${pointIndex === 0 ? "M" : "L"}${x(point.over).toFixed(1)},${y(point.runs).toFixed(1)}`
            )
            .join(" ");
          const start = entry.line[0];
          const end = entry.line[entry.line.length - 1];
          const area = `${line} L${x(end.over).toFixed(1)},${height - bottom} L${x(start.over).toFixed(1)},${height - bottom} Z`;
          return (
            <g key={`line-${entry.inningsLabel}`}>
              <path d={area} fill={`url(#ck-progress-${uid}-${index})`} pointerEvents="none" />
              <path
                d={line}
                fill="none"
                stroke={entry.colour}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                className="f1-draw"
                style={{ animationDelay: `${index * 140}ms` }}
                pointerEvents="none"
              />
              <circle
                cx={x(end.over)}
                cy={y(end.runs)}
                r={3.4}
                fill={entry.colour}
                className="f1-dot-in"
                style={{ animationDelay: "900ms" }}
                pointerEvents="none"
              />
            </g>
          );
        })}

        {series.map((entry) => (
          <g key={`week-${entry.inningsLabel}`} pointerEvents="none">
            {entry.points
              .filter((point) => point.wickets > 0 && point.over > 0)
              .map((point) => (
                <g
                  key={`${entry.inningsLabel}-${point.wickets}`}
                  className="f1-dot-in"
                  style={{ animationDelay: `${Math.min(700, point.wickets * 80)}ms` }}
                >
                  <circle
                    cx={x(Math.min(point.over, topOver))}
                    cy={Math.min(y(point.runs), height - bottom - 3)}
                    r={5.2}
                    fill="#0f0f15"
                    stroke={entry.colour}
                    strokeWidth={1.4}
                  />
                  <text
                    x={x(Math.min(point.over, topOver))}
                    y={Math.min(y(point.runs), height - bottom - 3) + 2.8}
                    textAnchor="middle"
                    fontSize="5.6"
                    fontWeight="800"
                    fill="#ffffff"
                  >
                    W
                  </text>
                </g>
              ))}
          </g>
        ))}

        {hover && (
          <g pointerEvents="none">
            <line
              x1={x(hover.over)}
              x2={x(hover.over)}
              y1={top}
              y2={height - bottom}
              stroke={AXIS}
              strokeOpacity={0.55}
              strokeDasharray="3 4"
            />
            {series.map((entry) => {
              const point = scoreAt(entry, hover.over);
              const dotOver = Math.min(hover.over, entry.endOver);
              return (
                <ActiveDot
                  key={`active-${entry.inningsLabel}`}
                  x={x(dotOver)}
                  y={y(point.runs)}
                  colour={entry.colour}
                  r={4}
                />
              );
            })}
          </g>
        )}

        <text x="2" y="12" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.3)" letterSpacing="1.2">
          RUNS
        </text>
        <text
          x={width - right}
          y={height - 30}
          textAnchor="end"
          fontSize="8"
          fontWeight="700"
          fill="rgba(255,255,255,0.3)"
          letterSpacing="1.2"
        >
          OVERS
        </text>
      </svg>

      <p className="mt-1 text-[12px] leading-relaxed text-white/35">
        Two cumulative-score lines, both starting at 0. Hover or tap for any over; W marks where
        a wicket fell.
      </p>

      {hover && (
        <ChartTooltip anchorX={hover.left} anchorY={hover.top} width={244}>
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#8fb4ec]" />
            <span className="text-[13px] font-bold text-white">
              {hover.over === 0 ? "Start" : `Over ${hover.over}`}
            </span>
            <span className="ml-auto shrink-0 text-[11px] uppercase tracking-[0.12em] text-white/35">
              Match progress
            </span>
          </div>
          <div className="space-y-2 px-3 py-2">
            {series.map((entry) => {
              const point = scoreAt(entry, hover.over);
              return (
                <div key={entry.inningsLabel} className="flex items-center gap-2 text-[12px]">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.colour }}
                  />
                  <span className="min-w-0 flex-1 truncate text-white/70">{entry.name}</span>
                  {point.ended && (
                    <span className="shrink-0 text-[9.5px] uppercase tracking-[0.1em] text-white/25">
                      final
                    </span>
                  )}
                  <span className="shrink-0 font-f1 text-[13px] font-bold tabular-nums text-white">
                    {Math.round(point.runs)}/{point.wickets}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="border-t border-white/10 px-3 py-1.5 text-[11px] text-white/35">
            Both lines start at 0 runs. W = wicket.
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}
