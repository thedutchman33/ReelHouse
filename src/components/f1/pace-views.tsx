"use client";

import { useMemo, useState } from "react";
import { ChartKit } from "@/components/f1/charts";
import { ChartTip, DriverDisc, svgPoint, useChartTip } from "@/components/f1/chart-interaction";
import { SvgTeamLogo } from "@/components/f1/TeamLogo";
import { teamLogoWidth } from "@/lib/f1-teams";
import { TyreBadge } from "@/components/f1/tyre";
import { axisSecF, lapFmtF } from "@/components/f1/format";
import { paceLaps, teamHex, type TimedLap } from "@/components/f1/analytics";
import type { F1ResultRow2 } from "@/lib/f1";

// ---------------------------------------------------------------------------
// Pace, degradation, sector and driver-comparison views. The reference draws
// these as box plots, wear curves and a two-driver overlay, so this module
// carries its own chart primitives rather than tables.
// ---------------------------------------------------------------------------

/** Compound colours used by the reference's boxes and bars. */
const COMPOUND_FILL: Record<string, string> = {
  SOFT: "#e11d48",
  MEDIUM: "#f2c94c",
  HARD: "#f2f2f5",
  INTERMEDIATE: "#10b981",
  WET: "#3b82f6",
};
const fillOf = (compound?: string | null) =>
  COMPOUND_FILL[(compound ?? "").toUpperCase()] ?? "#8a8a93";
const COMPOUND_ORDER = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];

interface Box {
  key: string;
  colour: string;
  lo: number;
  q1: number;
  med: number;
  q3: number;
  hi: number;
  n: number;
  title: string;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[Math.min(sorted.length - 1, base + 1)];
  return sorted[base] + rest * (next - sorted[base]);
}

function boxOf(key: string, colour: string, times: number[], title: string): Box | null {
  if (times.length < 2) return null;
  const s = [...times].sort((a, b) => a - b);
  return {
    key,
    colour,
    lo: s[0],
    q1: quantile(s, 0.25),
    med: quantile(s, 0.5),
    q3: quantile(s, 0.75),
    hi: s[s.length - 1],
    n: s.length,
    title,
  };
}

// ------------------------------- lap filters -------------------------------

function LapFilters({
  cutoff,
  onCutoff,
  minLaps,
  onMinLaps,
  mode,
  onMode,
  modes,
}: {
  cutoff: number;
  onCutoff: (v: number) => void;
  minLaps: number;
  onMinLaps: (v: number) => void;
  mode: string;
  onMode: (v: string) => void;
  modes: { id: string; label: string }[];
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-[11px] text-white/60">
      <span className="text-[10px] font-bold tracking-[0.14em] text-white/45 uppercase">
        Lap filters
      </span>
      <label className="flex items-center gap-2">
        Outlier cutoff
        <input
          type="range"
          min={101}
          max={115}
          step={1}
          value={cutoff}
          onChange={(e) => onCutoff(Number(e.target.value))}
          className="h-1 w-28 cursor-pointer accent-red-500"
          aria-label="Outlier cutoff percentage"
        />
        <span className="w-10 tabular-nums">{cutoff}%</span>
      </label>
      <label className="flex items-center gap-2">
        Min stint laps
        <input
          type="number"
          min={1}
          max={20}
          value={minLaps}
          onChange={(e) => onMinLaps(Math.max(1, Number(e.target.value) || 1))}
          className="h-6 w-14 rounded border border-white/15 bg-[#0f0f15] px-1.5 text-[11px] tabular-nums text-white outline-none focus:border-[#e10600]"
          aria-label="Minimum laps in a stint"
        />
      </label>
      <div className="flex items-center gap-1">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            onClick={() => onMode(m.id)}
            className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
              mode === m.id
                ? "bg-[#e10600] font-semibold text-white"
                : "border border-white/12 text-white/60 hover:border-white/30 hover:text-white"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------------------------- box plot ---------------------------------

function BoxPlot({
  groups,
  height = 560,
}: {
  groups: {
    key: string;
    label: string;
    colour: string;
    boxes: Box[];
    /** Driver headshot for pace-by-driver groups. */
    headshotUrl?: string | null;
    /** Team name when the group is a team (draws its logo). */
    teamName?: string;
    /** The driver's team, drawn as a small mark beside their headshot. */
    driverTeamName?: string;
  }[];
  height?: number;
}) {
  const W = 1100;
  const padL = 54;
  const padR = 14;
  const padT = 14;
  const padB = 86;
  const all = groups.flatMap((g) => g.boxes);
  const lo = Math.min(...all.map((b) => b.lo));
  const hi = Math.max(...all.map((b) => b.hi));
  const span = hi - lo || 1;
  const y = (v: number) => padT + ((hi - v) / span) * (height - padT - padB);
  const colW = (W - padL - padR) / Math.max(1, groups.length);
  const px = (i: number) => padL + colW * (i + 0.5);

  // Reference grid: whole-second lines on a practice/running pace spread.
  const tickStep = span > 30 ? 5 : span > 12 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / tickStep) * tickStep; t <= hi + 1e-9; t += tickStep) {
    ticks.push(Number(t.toFixed(3)));
  }

  const tip = useChartTip();
  const [hover, setHover] = useState<{ gi: number; bi: number } | null>(null);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
    if (p.x < padL || p.x > W - padR || p.y < padT || p.y > height - padB) {
      setHover(null);
      tip.hide();
      return;
    }
    const gi = Math.max(0, Math.min(groups.length - 1, Math.floor((p.x - padL) / colW)));
    const g = groups[gi];
    if (!g || !g.boxes.length) return;
    // Nearest box in the column (by median position on the y axis).
    let bi = 0;
    let best = Infinity;
    g.boxes.forEach((b, i) => {
      const d = Math.abs(y(b.med) - p.y);
      if (d < best) {
        best = d;
        bi = i;
      }
    });
    const b = g.boxes[bi];
    setHover({ gi, bi });
    const [code, rest] = b.title.split(": ");
    tip.show(e.clientX, e.clientY, {
      title: code ?? g.label,
      // "MEDIUM (20 laps)" → "Medium · 20 laps", matching the reference header.
      note: rest
        ? rest
            .replace(/^([A-Z]+) \((\d+) laps\)$/, (_m, c: string, n: string) =>
              `${c[0]}${c.slice(1).toLowerCase()} \u00b7 ${n} laps`
            )
            .replace(/\s*\((\d+) laps\)$/, " \u00b7 $1 laps")
        : undefined,
      // The reference's box tooltip: five-number summary, median highlighted,
      // compound and lap count in the header note.
      rows: [
        { label: "Fastest", value: lapFmtF(b.lo) },
        { label: "Q1", value: lapFmtF(b.q1) },
        { label: "Median", value: lapFmtF(b.med), colour: b.colour },
        { label: "Q3", value: lapFmtF(b.q3) },
        { label: "Slowest", value: lapFmtF(b.hi), tone: "muted" },
      ],
    });
  };

  return (
    <div ref={tip.wrapRef} className="relative">
      <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label="Lap-time distribution per driver, as box plots"
        className="h-auto w-full min-w-[720px] touch-pan-y"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => {
          setHover(null);
          tip.hide();
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#26262f" />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize="9" fill="#8a8a93">
              {`${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`}
            </text>
          </g>
        ))}

        {groups.map((g, gi) => {
          const n = g.boxes.length;
          const bw = Math.min(colW * 0.62 / Math.max(1, n), 22);
          return (
            <g key={g.key}>
              {g.boxes.map((b, bi) => {
                const cx = px(gi) + (bi - (n - 1) / 2) * (bw + 1.5);
                return (
                  <g key={b.key}>
                    <title>{b.title}</title>
                    <line x1={cx} x2={cx} y1={y(b.hi)} y2={y(b.lo)} stroke={b.colour} strokeWidth="1" />
                    <line x1={cx - bw / 3} x2={cx + bw / 3} y1={y(b.hi)} y2={y(b.hi)} stroke={b.colour} strokeWidth="1" />
                    <line x1={cx - bw / 3} x2={cx + bw / 3} y1={y(b.lo)} y2={y(b.lo)} stroke={b.colour} strokeWidth="1" />
                    <rect
                      x={cx - bw / 2}
                      y={y(b.q3)}
                      width={bw}
                      height={Math.max(1, y(b.q1) - y(b.q3))}
                      fill={b.colour}
                      fillOpacity={hover && !(hover.gi === gi && hover.bi === bi) ? 0.4 : 0.85}
                      rx="1.5"
                      className="f1-grow"
                      stroke={
                        hover && hover.gi === gi && hover.bi === bi ? "#ffffff" : "transparent"
                      }
                      strokeWidth={1.4}
                    />
                    <line
                      x1={cx - bw / 2}
                      x2={cx + bw / 2}
                      y1={y(b.med)}
                      y2={y(b.med)}
                      stroke="#101017"
                      strokeWidth="1.2"
                    />
                  </g>
                );
              })}
              {g.teamName ? (
                <SvgTeamLogo
                  team={g.teamName}
                  x={px(gi) - teamLogoWidth(g.teamName, 20, 44) / 2}
                  y={height - padB + 8}
                  height={20}
                />
              ) : (
                <>
                  <DriverDisc
                    x={px(gi)}
                    y={height - padB + 19}
                    r={10}
                    colour={g.colour}
                    href={g.headshotUrl ?? null}
                    label={g.label}
                  />
                  {g.driverTeamName && (
                    <SvgTeamLogo
                      team={g.driverTeamName}
                      x={px(gi) - teamLogoWidth(g.driverTeamName, 14, 32) / 2}
                      y={height - padB + 48}
                      height={14}
                      width={teamLogoWidth(g.driverTeamName, 14, 32)}
                    />
                  )}
                </>
              )}
              <text
                x={px(gi)}
                y={height - padB + 42}
                textAnchor="middle"
                fontSize="9"
                fontWeight="600"
                fill={g.colour}
              >
                {g.label}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      <ChartTip tip={tip.tip} />
    </div>
  );
}

/** Clean laps for one driver, filtered by the toolbar's cutoff. */
function filteredLaps(row: F1ResultRow2, cutoff: number): TimedLap[] {
  const timed = row.laps.filter(
    (l): l is TimedLap => l.time != null && !l.deleted && !l.pitOut
  );
  if (!timed.length) return [];
  const best = Math.min(...timed.map((l) => l.time));
  return timed.filter((l) => l.time <= best * (cutoff / 100));
}

const PACE_MODES = [
  { id: "compound", label: "By compound" },
  { id: "stint", label: "By stint" },
  { id: "all", label: "All tyres" },
];

export function PaceDriversView({ rows }: { rows: F1ResultRow2[] }) {
  const [cutoff, setCutoff] = useState(107);
  const [minLaps, setMinLaps] = useState(4);
  const [mode, setMode] = useState("compound");

  const { groups, skipped } = useMemo(() => {
    const built = rows.map((row) => {
      const laps = filteredLaps(row, cutoff);
      const boxes: Box[] = [];

      if (mode === "all") {
        const b = boxOf("all", teamHex(row), laps.map((l) => l.time), `${row.acronym}: all laps`);
        if (b) boxes.push(b);
      } else if (mode === "compound") {
        for (const compound of COMPOUND_ORDER) {
          const times = laps.filter((l) => l.compound === compound).map((l) => l.time);
          if (times.length < Math.max(2, minLaps)) continue;
          const b = boxOf(compound, fillOf(compound), times, `${row.acronym}: ${compound} (${times.length} laps)`);
          if (b) boxes.push(b);
        }
      } else {
        for (const stint of row.stints) {
          const end = stint.lapEnd ?? Number.MAX_SAFE_INTEGER;
          const times = laps
            .filter((l) => l.lap >= stint.lapStart && l.lap <= end)
            .map((l) => l.time);
          if (times.length < Math.max(2, minLaps)) continue;
          const b = boxOf(
            `s${stint.lapStart}`,
            fillOf(stint.compound),
            times,
            `${row.acronym}: stint from lap ${stint.lapStart} (${times.length} laps)`
          );
          if (b) boxes.push(b);
        }
      }
      return { row, boxes };
    });

    const withBoxes = built.filter((g) => g.boxes.length > 0);
    withBoxes.sort((a, b) => {
      const ma = Math.min(...a.boxes.map((x) => x.med));
      const mb = Math.min(...b.boxes.map((x) => x.med));
      return ma - mb;
    });
    return {
      groups: withBoxes.map((g) => ({
        key: String(g.row.driverNumber),
        label: g.row.acronym,
        colour: teamHex(g.row),
        boxes: g.boxes,
        headshotUrl: g.row.headshotUrl,
        driverTeamName: g.row.teamName,
      })),
      skipped: rows.length - withBoxes.length,
    };
  }, [rows, cutoff, minLaps, mode]);

  if (!groups.length)
    return <p className="py-10 text-center text-sm text-white/55">No laps pass the current filters.</p>;

  return (
    <div>
      <LapFilters
        cutoff={cutoff}
        onCutoff={setCutoff}
        minLaps={minLaps}
        onMinLaps={setMinLaps}
        mode={mode}
        onMode={setMode}
        modes={PACE_MODES}
      />
      <BoxPlot groups={groups} />
      <p className="mt-2 text-[11px] text-white/40">
        Box = interquartile range, line = median, whiskers = fastest and slowest lap in the sample.
        Laps slower than {cutoff}% of each driver&apos;s best are dropped
        {mode !== "all" ? `, and groups under ${minLaps} laps are hidden` : ""}.
        {skipped > 0 ? ` ${skipped} drivers have no laps in this selection.` : ""}
      </p>
    </div>
  );
}

export function PaceTeamsView({ rows }: { rows: F1ResultRow2[] }) {
  const [cutoff, setCutoff] = useState(107);
  const [mode, setMode] = useState("compound");
  const [minLaps, setMinLaps] = useState(4);

  const groups = useMemo(() => {
    const teams = new Map<string, { name: string; colour: string; laps: TimedLap[] }>();
    for (const row of rows) {
      const entry =
        teams.get(row.teamName) ?? { name: row.teamName, colour: teamHex(row), laps: [] };
      entry.laps.push(...filteredLaps(row, cutoff));
      teams.set(row.teamName, entry);
    }
    const out = [...teams.values()].map((t) => {
      const boxes: Box[] = [];
      if (mode === "all") {
        if (t.laps.length >= minLaps) {
          const b = boxOf("all", t.colour, t.laps.map((l) => l.time), `${t.name}: all laps (${t.laps.length} laps)`);
          if (b) boxes.push(b);
        }
      } else {
        for (const compound of COMPOUND_ORDER) {
          const times = t.laps.filter((l) => l.compound === compound).map((l) => l.time);
          if (times.length < Math.max(2, minLaps)) continue;
          const b = boxOf(compound, fillOf(compound), times, `${t.name}: ${compound} (${times.length} laps)`);
          if (b) boxes.push(b);
        }
      }
      return { key: t.name, label: t.name, colour: t.colour, boxes, teamName: t.name };
    });
    const withBoxes = out.filter((g) => g.boxes.length > 0);
    withBoxes.sort(
      (a, b) =>
        Math.min(...a.boxes.map((x) => x.med)) - Math.min(...b.boxes.map((x) => x.med))
    );
    return withBoxes;
  }, [rows, cutoff, mode, minLaps]);

  if (!groups.length)
    return <p className="py-10 text-center text-sm text-white/55">No laps pass the current filters.</p>;

  return (
    <div>
      <LapFilters
        cutoff={cutoff}
        onCutoff={setCutoff}
        minLaps={minLaps}
        onMinLaps={setMinLaps}
        mode={mode}
        onMode={setMode}
        modes={PACE_MODES.filter((m) => m.id !== "stint")}
      />
      <BoxPlot groups={groups} />
      <p className="mt-2 text-[11px] text-white/40">
        Both cars of each team pooled, box per compound. Laps slower than {cutoff}% of a driver&apos;s
        best are dropped.
      </p>
    </div>
  );
}

// ----------------------------- tyre degradation ----------------------------

interface StintRow {
  row: F1ResultRow2;
  compound: string | null;
  laps: number;
  avg: number | null;
  deg: number | null;
}

function fitLinear(points: { x: number; y: number }[]): { a: number; b: number } | null {
  if (points.length < 3) return null;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const b = num / den;
  return { a: my - b * mx, b };
}

/** y = a·(e^{b·x} − 1) fitted on ln(1 + y) — the reference's exponential curve. */
function fitExponential(points: { x: number; y: number }[]): { a: number; b: number } | null {
  const usable = points.filter((p) => p.y > -0.95);
  if (usable.length < 4) return null;
  const shifted = usable.map((p) => ({ x: p.x, y: Math.log(1 + p.y) }));
  const lin = fitLinear(shifted);
  if (!lin) return null;
  return { a: Math.exp(lin.a), b: lin.b };
}

export function TyreDegradationView({ rows }: { rows: F1ResultRow2[] }) {
  // The reference defaults to 8-lap runs here (the pace views use 4).
  const [minLaps, setMinLaps] = useState(8);

  const { stints, curves } = useMemo(() => {
    const list: StintRow[] = [];
    const points: { compound: string; x: number; y: number }[] = [];

    for (const row of rows) {
      const clean = paceLaps(row);
      for (const stint of row.stints) {
        const end = stint.lapEnd ?? Number.MAX_SAFE_INTEGER;
        const inStint = clean.filter((l) => l.lap >= stint.lapStart && l.lap <= end);
        if (!inStint.length) continue;
        const avg = inStint.reduce((s, l) => s + l.time, 0) / inStint.length;
        let deg: number | null = null;
        if (inStint.length >= 3) {
          const n = inStint.length;
          const mx = inStint.reduce((s, l) => s + l.lap, 0) / n;
          let num = 0;
          let den = 0;
          for (const l of inStint) {
            num += (l.lap - mx) * (l.time - avg);
            den += (l.lap - mx) ** 2;
          }
          deg = den > 0 ? num / den : null;
        }
        list.push({ row, compound: stint.compound, laps: inStint.length, avg, deg });

        // Wear curve: time lost against tyre age, relative to the stint's first lap.
        const first = inStint[0].time;
        for (const l of inStint) {
          points.push({
            compound: (stint.compound ?? "UNKNOWN").toUpperCase(),
            x: l.lap - stint.lapStart + 1,
            y: l.time - first,
          });
        }
      }
    }
    list.sort((a, b) => {
      const pa = a.row.position ?? 99;
      const pb = b.row.position ?? 99;
      return pa - pb || (a.deg ?? 99) - (b.deg ?? 99);
    });

    const byCompound = new Map<string, { x: number; y: number }[]>();
    for (const p of points) {
      const arr = byCompound.get(p.compound) ?? [];
      arr.push({ x: p.x, y: p.y });
      byCompound.set(p.compound, arr);
    }
    const maxX = points.reduce((m, p) => Math.max(m, p.x), 0);
    const fitted = COMPOUND_ORDER.filter((c) => byCompound.has(c)).map((c) => {
      const series = byCompound.get(c)!;
      return {
        compound: c,
        colour: fillOf(c),
        points: series,
        linear: fitLinear(series),
        expo: fitExponential(series),
      };
    });
    return { stints: list.filter((s) => s.laps >= minLaps), curves: { fitted, maxX } };
  }, [rows, minLaps]);

  const chart = useMemo(() => {
    const { fitted, maxX } = curves;
    if (!fitted.length) return null;
    const yVals = fitted.flatMap((f) => f.points.map((p) => p.y)).sort((a, b) => a - b);
    // A handful of traffic-hit laps must not stretch the axis until the fits
    // are a flat line, so the domain comes from the bulk of the laps.
    const pick = (q: number) =>
      yVals.length ? yVals[Math.min(yVals.length - 1, Math.floor(yVals.length * q))] : 0;
    const lo = Math.min(-1, Math.floor(pick(0.02) - 0.4));
    const hi = Math.max(1, Math.ceil(pick(0.98) + 0.4));
    const W = 1000;
    const H = 300;
    const padL = 48;
    const padR = 16;
    const padT = 14;
    const padB = 26;
    const px = (x: number) => padL + (x / Math.max(1, maxX)) * (W - padL - padR);
    const py = (v: number) =>
      padT + ((hi - Math.min(hi, Math.max(lo, v))) / (hi - lo)) * (H - padT - padB);
    const line = (f: (x: number) => number) =>
      Array.from({ length: maxX }, (_, i) => i + 1)
        .map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(1)},${py(f(x)).toFixed(1)}`)
        .join(" ");
    return { fitted, maxX, W, H, padL, padR, padT, padB, px, py, lo, hi, line };
  }, [curves]);

  const barTip = useChartTip();
  const [hoverBar, setHoverBar] = useState<number | null>(null);
  const dotTip = useChartTip();
  const [hoverDot, setHoverDot] = useState<{ compound: string; age: number; lost: number } | null>(null);

  if (!stints.length)
    return <p className="py-10 text-center text-sm text-white/55">No stint data with timed laps for this session yet.</p>;

  const onBarMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
    const i = Math.round((p.x - 28) / 34);
    const s = stints[i];
    if (!s || Math.abs(p.x - (18 + i * 34 + 10)) > 12) {
      setHoverBar(null);
      barTip.hide();
      return;
    }
    setHoverBar(i);
    barTip.show(e.clientX, e.clientY, {
      title: s.row.acronym,
      note: s.compound ? s.compound[0] + s.compound.slice(1).toLowerCase() : "Unknown",
      rows: [
        { label: "Tyre", value: s.compound ?? "—", colour: fillOf(s.compound) },
        { label: "Laps", value: String(s.laps) },
        {
          label: "Degradation",
          value: s.deg != null ? `${s.deg >= 0 ? "+" : "−"}${Math.abs(s.deg).toFixed(3)} s/lap` : "—",
          tone: s.deg == null ? "muted" : s.deg >= 0 ? "down" : "up",
        },
        { label: "Average lap", value: s.avg != null ? lapFmtF(s.avg) : "—" },
      ],
    });
  };

  const onDotMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!chart) return;
    const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
    let best: { compound: string; age: number; lost: number; x: number; y: number } | null = null;
    let bestD = 10 * 10;
    for (const f of chart.fitted) {
      for (const pt of f.points) {
        const dx = chart.px(pt.x) - p.x;
        const dy = chart.py(pt.y) - p.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { compound: f.compound, age: pt.x, lost: pt.y, x: chart.px(pt.x), y: chart.py(pt.y) };
        }
      }
    }
    if (!best) {
      setHoverDot(null);
      dotTip.hide();
      return;
    }
    setHoverDot(best);
    dotTip.show(e.clientX, e.clientY, {
      title: best.compound[0] + best.compound.slice(1).toLowerCase(),
      note: `Tyre age ${best.age}`,
      rows: [
        { label: "Time lost", value: `${best.lost >= 0 ? "+" : "−"}${Math.abs(best.lost).toFixed(2)} s`, colour: fillOf(best.compound) },
      ],
    });
  };

  return (
    <div className="space-y-5">
      <div ref={barTip.wrapRef} className="relative">
        <div className="mb-2 flex flex-wrap items-center justify-end gap-3">
          <label className="flex items-center gap-2 text-[11px] text-white/70">
            Min stint laps
            <input
              type="number"
              min={1}
              max={20}
              value={minLaps}
              onChange={(e) => setMinLaps(Math.max(1, Number(e.target.value) || 1))}
              className="h-6 w-14 rounded border border-white/15 bg-[#0f0f15] px-1.5 text-[11px] tabular-nums text-white outline-none focus:border-[#e10600]"
              aria-label="Minimum laps in a stint"
            />
          </label>
          {["SOFT", "MEDIUM", "HARD"].map((c) => (
            <span key={c} className="flex items-center gap-1.5 text-[11px] text-white/70">
              <TyreBadge compound={c} size={14} />
              {c[0] + c.slice(1).toLowerCase()}
            </span>
          ))}
        </div>

        {stints.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm font-semibold text-white/90">Not enough long runs</p>
            <p className="mt-1 text-[12px] text-white/55">
              Degradation needs a stint of at least {minLaps} clean laps on the same tyres.
            </p>
          </div>
        ) : (
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${Math.max(700, stints.length * 34)} 420`}
            role="img"
            aria-label="Degradation per lap by driver and compound"
            className="h-auto w-full min-w-[680px] touch-pan-y"
            onPointerMove={onBarMove}
            onPointerDown={onBarMove}
            onPointerLeave={() => {
              setHoverBar(null);
              barTip.hide();
            }}
          >
            {(() => {
              const W = Math.max(700, stints.length * 34);
              const H = 420;
              const padB = 54;
              const padT = 18;
              const plot = H - padT - padB;
              // Scale to the 95th percentile: a single outlier stint (a long
              // run on a dying tyre) must not flatten every other bar.
              const mags = stints
                .map((s) => s.deg)
                .filter((v): v is number => v != null)
                .map(Math.abs)
                .sort((a, b) => a - b);
              const p95 = mags.length
                ? mags[Math.min(mags.length - 1, Math.floor(mags.length * 0.95))]
                : 0.05;
              const span = Math.max(0.05, Math.ceil(p95 / 0.02) * 0.02);
              const mid = padT + plot / 2;
              const half = plot / 2;
              const y = (v: number) => mid - Math.max(-half, Math.min(half, (v / span) * half));
              return (
                <g>
                  {[-span, 0, span].map((v) => (
                    <g key={v}>
                      <line
                        x1={10}
                        x2={W - 10}
                        y1={y(v)}
                        y2={y(v)}
                        stroke={v === 0 ? "#475569" : "#26262f"}
                      />
                      <text x={6} y={y(v) + 3} fontSize="8" fill="#8a8a93">
                        {v === 0 ? "0.0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`}
                      </text>
                    </g>
                  ))}
                  {stints.map((s, i) => {
                    const x = 18 + i * 34;
                    const v = s.deg ?? 0;
                    const top = y(v);
                    const h = Math.abs(top - mid);
                    return (
                      <g key={`${s.row.driverNumber}-${i}`}>
                        <rect
                          x={x}
                          y={Math.min(top, mid)}
                          width="20"
                          height={Math.max(1, h)}
                          fill={fillOf(s.compound)}
                          fillOpacity={hoverBar != null && hoverBar !== i ? 0.45 : 1}
                          stroke={hoverBar === i ? "#ffffff" : "transparent"}
                          strokeWidth={1.3}
                          rx="1"
                          className="f1-grow"
                        >
                          <title>{`${s.row.acronym} · ${s.compound ?? "unknown"} · ${s.laps} laps · ${
                            s.deg != null ? `${s.deg >= 0 ? "+" : "−"}${Math.abs(s.deg).toFixed(3)} s/lap` : "no fit"
                          }`}</title>
                        </rect>
                        {s.deg != null && (
                          <text
                            x={x + 10}
                            y={v >= 0 ? Math.min(top, mid) - 3 : Math.max(top, mid) + 9}
                            textAnchor="middle"
                            fontSize="7.5"
                            fill={s.deg >= 0 ? "#fca5a5" : "#86efac"}
                          >
                            {Math.abs(s.deg).toFixed(2)}
                          </text>
                        )}
                        <circle cx={x + 10} cy={H - padB + 16} r="7" fill={teamHex(s.row)} />
                        <text
                          x={x + 10}
                          y={H - padB + 18.5}
                          textAnchor="middle"
                          fontSize="6.5"
                          fontWeight="700"
                          fill="#101017"
                        >
                          {s.row.acronym.slice(0, 3)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })()}
          </svg>
        </div>
        )}
        <ChartTip tip={barTip.tip} />
        <p className="mt-1 text-[11px] text-white/40">
          Degradation per lap for each stint (least-squares slope over its clean laps), coloured by
          compound. Stints under {minLaps} laps are hidden.
        </p>
      </div>

      {chart && (
        <div ref={dotTip.wrapRef} className="relative rounded-xl border border-white/10 bg-[#101017]/60 p-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">Wear curve per compound</p>
            <div className="flex items-center gap-3 text-[10px] text-white/55">
              <span className="flex items-center gap-1">
                <svg width="18" height="6" aria-hidden="true">
                  <line x1="0" x2="18" y1="3" y2="3" stroke="#8a8a93" strokeWidth="1.5" strokeDasharray="4 3" />
                </svg>
                linear
              </span>
              <span className="flex items-center gap-1">
                <svg width="18" height="6" aria-hidden="true">
                  <line x1="0" x2="18" y1="3" y2="3" stroke="#f2f2f5" strokeWidth="1.5" />
                </svg>
                exponential
              </span>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chart.W} ${chart.H}`}
              role="img"
              aria-label="Time lost against tyre age, with linear and exponential fits per compound"
              className="h-auto w-full min-w-[620px] touch-pan-y"
              onPointerMove={onDotMove}
              onPointerDown={onDotMove}
              onPointerLeave={() => {
                setHoverDot(null);
                dotTip.hide();
              }}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                const v = chart.lo + (chart.hi - chart.lo) * f;
                return (
                  <g key={f}>
                    <line x1={chart.padL} x2={chart.W - chart.padR} y1={chart.py(v)} y2={chart.py(v)} stroke="#26262f" />
                    <text x={chart.padL - 8} y={chart.py(v) + 3} textAnchor="end" fontSize="9" fill="#8a8a93">
                      {v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)}
                    </text>
                  </g>
                );
              })}
              {[1, Math.round(chart.maxX / 2), chart.maxX].map((x) => (
                <text key={x} x={chart.px(x)} y={chart.H - 8} textAnchor="middle" fontSize="9" fill="#8a8a93">
                  {x}
                </text>
              ))}
              {chart.fitted.map((f) => (
                <g key={f.compound}>
                  {f.points.map((p, i) => (
                    <circle
                      key={i}
                      className="f1-dot-in"
                      cx={chart.px(p.x)}
                      cy={chart.py(p.y)}
                      r={hoverDot && hoverDot.compound === f.compound && hoverDot.age === p.x ? 3.6 : 2}
                      fill={f.colour}
                      fillOpacity={hoverDot && hoverDot.compound === f.compound && hoverDot.age === p.x ? 1 : 0.55}
                      stroke={hoverDot && hoverDot.compound === f.compound && hoverDot.age === p.x ? "#ffffff" : "none"}
                      strokeWidth="1"
                    />
                  ))}
                  {f.linear && (
                    <path
                      d={chart.line((x) => f.linear!.a + f.linear!.b * x)}
                      fill="none"
                      stroke={f.colour}
                      strokeWidth="1.6"
                      strokeDasharray="5 4"
                    />
                  )}
                  {f.expo && (
                    <path
                      d={chart.line((x) => f.expo!.a * (Math.exp(f.expo!.b * x) - 1))}
                      fill="none"
                      stroke={f.colour}
                      strokeWidth="2"
                    />
                  )}
                </g>
              ))}
            </svg>
          </div>
          {hoverDot && (
            <ChartTip tip={dotTip.tip} />
          )}
          <p className="mt-1 text-[11px] text-white/40">
            Each dot is a lap: x = tyre age in laps, y = time lost against that stint&apos;s first lap.
            Dashed = linear fit, solid = exponential fit — both fitted to this session&apos;s laps.
          </p>
        </div>
      )}
    </div>
  );
}

// -------------------------------- best sectors -----------------------------

/**
 * The reference stacks one bar panel per sector. Every row is a driver, sorted
 * by that sector, and the bar length is the sector time on a shared scale — no
 * time axis: the time pill at the end of each bar carries the value.
 */
export function BestSectorsView({ rows }: { rows: F1ResultRow2[] }) {
  const model = useMemo(() => {
    const list = rows.map((r) => {
      const bests = { s1: Infinity, s2: Infinity, s3: Infinity };
      for (const l of r.laps) {
        if (l.time == null || l.deleted) continue;
        if (l.s1 != null) bests.s1 = Math.min(bests.s1, l.s1);
        if (l.s2 != null) bests.s2 = Math.min(bests.s2, l.s2);
        if (l.s3 != null) bests.s3 = Math.min(bests.s3, l.s3);
      }
      const pick = (v: number) => (Number.isFinite(v) ? v : null);
      return { row: r, s1: pick(bests.s1), s2: pick(bests.s2), s3: pick(bests.s3) };
    });
    const sessionBest = {
      s1: list.reduce<number | null>((m, v) => (v.s1 != null && (m == null || v.s1 < m) ? v.s1 : m), null),
      s2: list.reduce<number | null>((m, v) => (v.s2 != null && (m == null || v.s2 < m) ? v.s2 : m), null),
      s3: list.reduce<number | null>((m, v) => (v.s3 != null && (m == null || v.s3 < m) ? v.s3 : m), null),
    };
    return { list, sessionBest };
  }, [rows]);

  const tip = useChartTip();
  const [hover, setHover] = useState<string | null>(null);

  const sectors = [
    { n: 1 as const, key: "s1" as const },
    { n: 2 as const, key: "s2" as const },
    { n: 3 as const, key: "s3" as const },
  ];
  const panels = sectors.map(({ n, key }) => {
    const entries = model.list
      .map((e) => ({ row: e.row, value: e[key] }))
      .filter((e): e is { row: F1ResultRow2; value: number } => e.value != null)
      .sort((a, b) => a.value - b.value);
    return { n, key, entries, best: entries[0]?.value ?? null };
  });
  if (!panels.some((p) => p.entries.length))
    return (
      <p className="py-10 text-center text-sm text-white/55">
        No sector times published for this session yet.
      </p>
    );

  const W = 1120;
  const rowH = 28;
  const barX = 132;
  const barEnd = 1010;
  const pillW = 58;

  return (
    <div ref={tip.wrapRef} className="relative space-y-5">
      {panels.map((panel) => {
        if (!panel.entries.length) {
          return (
            <div key={panel.n}>
              <h3 className="mb-1 text-[12px] font-bold text-white">Sector {panel.n}</h3>
              <p className="py-6 text-center text-[12px] text-white/55">
                No sector {panel.n} times published yet.
              </p>
            </div>
          );
        }
        const H = 10 + panel.entries.length * rowH + 6;
        const lo = panel.entries[0].value;
        const hi = panel.entries[panel.entries.length - 1].value;
        // Every bar starts at the same left edge; the fastest still keeps a
        // visible length, matching the reference's short best bar.
        const floor = lo - Math.max(0.02, (hi - lo) * 0.16);
        const span = Math.max(0.02, hi - floor);
        const bx = (v: number) => barX + ((v - floor) / span) * (barEnd - barX);
        return (
          <div key={panel.n}>
            <h3 className="mb-1 text-[12px] font-bold text-white">Sector {panel.n}</h3>
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label={`Best sector ${panel.n} per driver, fastest first`}
                className="h-auto w-full min-w-[720px] touch-pan-y"
                onPointerMove={(e) => {
                  const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
                  const i = Math.floor((p.y - 10) / rowH);
                  const entry = panel.entries[i];
                  if (!entry) {
                    setHover(null);
                    tip.hide();
                    return;
                  }
                  setHover(`${panel.n}-${entry.row.driverNumber}`);
                  const gap = entry.value - (panel.best ?? entry.value);
                  tip.show(e.clientX, e.clientY, {
                    title: entry.row.acronym,
                    note: entry.row.teamName,
                    rows: [
                      {
                        label: `Sector ${panel.n}`,
                        value: entry.value.toFixed(3),
                        colour: teamHex(entry.row),
                      },
                      {
                        label: "Gap to best",
                        value: gap <= 0 ? "fastest" : `+${gap.toFixed(3)}`,
                        tone: gap <= 0 ? "up" : "muted",
                      },
                      { label: "Rank", value: `${i + 1} of ${panel.entries.length}` },
                    ],
                  });
                }}
                onPointerDown={(e) => e.currentTarget.dispatchEvent(new Event("pointermove"))}
                onPointerLeave={() => {
                  setHover(null);
                  tip.hide();
                }}
              >
                {/* Faint column guides behind the bars — the reference keeps a
                    vertical rhythm even without a labelled time axis. */}
                {[0, 1, 2, 3, 4].map((g) => {
                  const gx = barX + ((barEnd - barX) * g) / 4;
                  return (
                    <line
                      key={`guide-${g}`}
                      x1={gx}
                      x2={gx}
                      y1={6}
                      y2={H - 6}
                      stroke="#24242e"
                      strokeWidth={1}
                    />
                  );
                })}
                {panel.entries.map((entry, i) => {
                  const y = 10 + i * rowH;
                  const isBest = i === 0;
                  const active = hover === `${panel.n}-${entry.row.driverNumber}`;
                  const end = bx(entry.value);
                  const gap = entry.value - (panel.best ?? entry.value);
                  const pillX = Math.min(end + 6, barEnd + 4);
                  // The best pill also carries the "BEST" tag, so it needs the
                  // extra room the F1 face's wide numerals take up.
                  const pillWidth = isBest ? 94 : pillW;
                  return (
                    <g key={entry.row.driverNumber}>
                      {active && (
                        <rect
                          x={0}
                          y={y - 2}
                          width={W}
                          height={rowH - 2}
                          rx={3}
                          fill="rgba(255,255,255,0.05)"
                        />
                      )}
                      <DriverDisc
                        x={16}
                        y={y + rowH / 2 - 2}
                        r={9}
                        colour={teamHex(entry.row)}
                        href={entry.row.headshotUrl}
                        label={entry.row.acronym}
                      />
                      <text
                        x={32}
                        y={y + rowH / 2 + 1.5}
                        fontSize="10"
                        fontWeight="700"
                        fill={teamHex(entry.row)}
                      >
                        {entry.row.acronym}
                      </text>
                      <rect
                        x={barX}
                        y={y + 5}
                        width={Math.max(3, end - barX)}
                        height={13}
                        rx={1.5}
                        fill={isBest ? "#a21caf" : teamHex(entry.row)}
                        opacity={active ? 1 : 0.92}
                      />
                      <rect
                        x={pillX}
                        y={y + 4}
                        width={pillWidth}
                        height={15}
                        rx={3}
                        fill={isBest ? "#a21caf" : "rgba(13,17,26,0.94)"}
                        stroke={isBest ? "#d8b4fe" : "#33333f"}
                        strokeWidth={1}
                      />
                      <text
                        x={pillX + 5}
                        y={y + 15}
                        fontSize="9.5"
                        fontWeight="700"
                        fill="#ffffff"
                      >
                        {entry.value.toFixed(3)}
                        {isBest && (
                          <tspan fontSize="7.5" fill="#f5d0fe">
                            {"  BEST"}
                          </tspan>
                        )}
                      </text>
                      {!isBest && (
                        <text x={pillX + pillWidth + 6} y={y + 15} fontSize="9.5" fill="#8a8a93">
                          +{gap.toFixed(3)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })}
      <ChartTip tip={tip.tip} />
      <p className="mt-2 text-[11px] text-white/40">
        Each driver&apos;s best sector, fastest first. Purple marks the session&apos;s best sector; the
        grey figure is the gap to it. Hover a row for the team and the exact gap.
      </p>
    </div>
  );
}

// ------------------------------ driver times -------------------------------

/**
 * The reference's Driver Times is a two-driver comparison sheet, not a lap-time
 * chart: pick two drivers (and an outlier cutoff), then read BEST LAP, AVERAGE,
 * the three best sectors and TOP SPEED side by side, with the quicker driver's
 * margin drawn on a track between the two values.
 */
export function DriverTimesView({ rows }: { rows: F1ResultRow2[] }) {
  const options = rows.filter((r) => r.lapCount > 0);
  const [a, setA] = useState<number | null>(options[0]?.driverNumber ?? null);
  const [b, setB] = useState<number | null>(options[1]?.driverNumber ?? null);
  const [cutoff, setCutoff] = useState(107);

  const rowA = options.find((r) => r.driverNumber === a) ?? null;
  const rowB = options.find((r) => r.driverNumber === b) ?? null;

  const statsOf = useMemo(
    () => (row: F1ResultRow2 | null) => {
      if (!row) return null;
      const timed = row.laps.filter((l) => l.time != null && !l.deleted) as TimedLap[];
      if (!timed.length) return null;
      const best = Math.min(...timed.map((l) => l.time));
      const clean = timed.filter((l) => l.time <= best * (cutoff / 100));
      const mean = clean.reduce((s, l) => s + l.time, 0) / clean.length;
      const sector = (key: "s1" | "s2" | "s3") => {
        let v = Infinity;
        for (const l of timed) {
          const s = l[key];
          if (s != null && s > 0) v = Math.min(v, s);
        }
        return Number.isFinite(v) ? v : null;
      };
      let speed = 0;
      for (const l of row.laps) if (l.speed != null && l.speed > speed) speed = l.speed;
      return {
        best,
        avg: mean,
        clean: clean.length,
        s1: sector("s1"),
        s2: sector("s2"),
        s3: sector("s3"),
        speed: speed || null,
      };
    },
    [cutoff]
  );

  const sa = statsOf(rowA);
  const sb = statsOf(rowB);

  // The lap-by-lap chart under the comparison card: both drivers' clean laps
  // on one x axis, so a stint of traffic or a slow out-lap shows up where the
  // averages can't.
  const lapChart = useMemo(() => {
    const series = [
      { key: "a", label: rowA?.acronym ?? "Driver 1", colour: rowA ? teamHex(rowA) : "#ef4444" },
      { key: "b", label: rowB?.acronym ?? "Driver 2", colour: rowB ? teamHex(rowB) : "#38bdf8" },
    ];
    const points = (row: F1ResultRow2 | null) => {
      if (!row) return new Map<number, number>();
      const timed = row.laps.filter((l) => l.time != null && !l.deleted) as TimedLap[];
      if (!timed.length) return new Map<number, number>();
      const best = Math.min(...timed.map((l) => l.time));
      const out = new Map<number, number>();
      for (const l of timed) if (l.time <= best * (cutoff / 100)) out.set(l.lap, l.time);
      return out;
    };
    const a = points(rowA);
    const b = points(rowB);
    const laps = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);
    const rows = laps.map((lap) => {
      const row: { x: number; a?: number; b?: number } = { x: lap };
      const av = a.get(lap);
      const bv = b.get(lap);
      if (av != null) row.a = av;
      if (bv != null) row.b = bv;
      return row;
    });
    return { rows, series };
  }, [rowA, rowB, cutoff]);

  if (!options.length)
    return <p className="py-10 text-center text-sm text-white/55">No timed laps in this session yet.</p>;

  type Metric = {
    label: string;
    a: number | null;
    b: number | null;
    fmt: (v: number) => string;
    lower: boolean;
    /** Scale used to turn a margin into a bar length. */
    span: number;
  };
  const metrics: Metric[] = sa && sb
    ? [
        { label: "Best lap", a: sa.best, b: sb.best, fmt: lapFmtF, lower: true, span: 0.6 },
        { label: `Average (within ${cutoff}%)`, a: sa.avg, b: sb.avg, fmt: lapFmtF, lower: true, span: 0.9 },
        { label: "Best sector 1", a: sa.s1, b: sb.s1, fmt: (v) => v.toFixed(3), lower: true, span: 0.5 },
        { label: "Best sector 2", a: sa.s2, b: sb.s2, fmt: (v) => v.toFixed(3), lower: true, span: 0.5 },
        { label: "Best sector 3", a: sa.s3, b: sb.s3, fmt: (v) => v.toFixed(3), lower: true, span: 0.5 },
        { label: "Top speed", a: sa.speed, b: sb.speed, fmt: (v) => `${v} km/h`, lower: false, span: 15 },
      ]
    : [];

  const selectClass =
    "h-9 cursor-pointer appearance-none rounded-lg border border-white/15 bg-[#1a1a23] py-0 pl-8 pr-8 text-[12px] font-semibold text-white shadow-sm outline-none transition-colors hover:border-white/25 focus:border-[#e10600]/70 focus:ring-2 focus:ring-[#e10600]/30 [&>option]:bg-[#1a1a23] [&>option]:text-white";

  const pill = (row: F1ResultRow2, value: number | null, onPick: (n: number) => void, label: string) => (
    <label className="relative flex items-center">
      <span
        className="pointer-events-none absolute left-1 z-10 h-7 w-7 overflow-hidden rounded-full ring-1 ring-white/20"
        style={{ backgroundColor: `${teamHex(row)}44` }}
      >
        {row.headshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.headshotUrl} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <span className="grid h-full w-full place-items-center text-[8px] font-bold text-white">
            {row.acronym}
          </span>
        )}
      </span>
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onPick(Number(e.target.value))}
        className={selectClass}
      >
        {options.map((r) => (
          <option key={r.driverNumber} value={r.driverNumber}>
            {r.acronym}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        className="pointer-events-none absolute right-2 h-4 w-4 text-white/55"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </label>
  );

  const driverHead = (row: F1ResultRow2, side: "left" | "right") => {
    const colour = teamHex(row);
    const name = (
      <span className={`flex flex-col ${side === "right" ? "items-end" : "items-start"}`}>
        <span className="text-[17px] leading-none font-bold" style={{ color: colour }}>
          {row.acronym}
        </span>
        <span className="mt-0.5 text-[11px] text-white/55">{row.teamName}</span>
      </span>
    );
    const face = (
      <span
        className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-black/40"
        style={{ backgroundColor: `${colour}55` }}
      >
        {row.headshotUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.headshotUrl} alt={row.fullName} className="h-full w-full object-cover object-top" />
        )}
      </span>
    );
    return (
      <div className={`flex items-center gap-3 ${side === "right" ? "justify-end" : ""}`}>
        {side === "right" ? (
          <>
            {face}
            {name}
          </>
        ) : (
          <>
            {name}
            {face}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/70">
        <label className="flex items-center gap-2">
          <span className="font-semibold text-white/55">Driver 1</span>
          {rowA && pill(rowA, a, setA, "Driver 1")}
        </label>
        <label className="flex items-center gap-2">
          <span className="font-semibold text-white/55">Driver 2</span>
          {rowB && pill(rowB, b, setB, "Driver 2")}
        </label>
        <label className="flex items-center gap-2">
          <span className="font-semibold text-white/55">Outlier cutoff</span>
          <input
            type="range"
            min={100}
            max={115}
            step={1}
            value={cutoff}
            onChange={(e) => setCutoff(Number(e.target.value))}
            aria-label="Outlier cutoff"
            className="h-1.5 w-28 cursor-pointer accent-red-500"
          />
          <span className="w-9 font-semibold text-white tabular-nums">{cutoff}%</span>
        </label>
        <p className="text-white/40">
          Laps above {cutoff}% of a driver&apos;s best are left off the chart and the average.
        </p>
      </div>

      {rowA && rowB && sa && sb ? (
        <div className="rounded-xl border border-white/10 bg-[#101017]/60 px-4 py-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-white/[0.08] pb-3">
            {driverHead(rowA, "left")}
            <span className="text-[11px] font-semibold tracking-wider text-white/40 uppercase">vs</span>
            {driverHead(rowB, "right")}
          </div>

          <div className="pt-1">
            {metrics.map((m) => {
              if (m.a == null || m.b == null) return null;
              const aWins = m.lower ? m.a < m.b : m.a > m.b;
              const delta = Math.abs(m.a - m.b);
              if (delta === 0) {
                return (
                  <div key={m.label} className="grid grid-cols-[1fr_300px_1fr] items-center gap-4 py-4">
                    <span className="text-right font-f1 tabular-nums text-[15px] text-white/90">{m.fmt(m.a)}</span>
                    <div className="text-center">
                      <p className="text-[10px] font-semibold tracking-wide text-white/55 uppercase">
                        {m.label}
                      </p>
                      <div className="mt-2 h-1.5 rounded-full bg-white/10" />
                      <p className="mt-1 text-[10px] text-white/40">Dead heat</p>
                    </div>
                    <span className="font-f1 tabular-nums text-[15px] text-white/90">{m.fmt(m.b)}</span>
                  </div>
                );
              }
              const winner = aWins ? rowA : rowB;
              const colour = teamHex(winner);
              const ratio = Math.min(1, delta / m.span);
              const width = 34 + ratio * 110;
              const deltaText = m.lower
                ? `${winner.acronym} ${delta.toFixed(3)} s quicker`
                : `${winner.acronym} +${Math.round(delta)} km/h`;
              return (
                <div
                  key={m.label}
                  className="grid grid-cols-[1fr_300px_1fr] items-center gap-4 py-4"
                >
                  <span
                    className={`text-right font-f1 tabular-nums text-[15px] ${
                      aWins ? "font-bold text-white" : "text-white/70"
                    }`}
                  >
                    {m.fmt(m.a)}
                  </span>
                  <div>
                    <p className="text-center text-[10px] font-semibold tracking-wide text-white/55 uppercase">
                      {m.label}
                    </p>
                    <div className="relative mt-2 h-2 rounded-full bg-white/10">
                      <span
                        className="absolute top-0 h-2 rounded-full"
                        style={{
                          width,
                          backgroundColor: colour,
                          // The reference grows every margin out of the middle of
                          // the track, toward the driver who set it.
                          left: aWins ? "50%" : undefined,
                          right: aWins ? undefined : "50%",
                        }}
                      />
                    </div>
                    <p className="mt-1 text-center text-[10px] font-medium" style={{ color: colour }}>
                      {deltaText}
                    </p>
                  </div>
                  <span
                    className={`font-f1 tabular-nums text-[15px] ${
                      aWins ? "text-white/70" : "font-bold text-white"
                    }`}
                  >
                    {m.fmt(m.b)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-white/55">
          Both drivers need timed laps to compare.
        </p>
      )}

      {rowA && rowB && lapChart.rows.length > 1 && (
        <div className="rounded-xl border border-white/10 bg-[#101017]/60 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
            <span className="text-[10px] font-semibold tracking-wide text-white/55 uppercase">
              Lap time by lap
            </span>
            <span className="flex items-center gap-4">
              {lapChart.series.map((s) => (
                <span
                  key={s.key}
                  className="flex items-center gap-1.5 text-[11px] font-semibold"
                  style={{ color: s.colour }}
                >
                  <span
                    className="h-1.5 w-4 rounded-full"
                    style={{ backgroundColor: s.colour }}
                  />
                  {s.label}
                </span>
              ))}
            </span>
          </div>
          <div className="h-[230px]">
            <ChartKit
              rows={lapChart.rows}
              series={lapChart.series}
              xKey="x"
              yLabel="Lap time"
              grid
              idleDots
              tickFmtY={(v) => lapFmtF(v)}
              tickFmtX={(v) => `L${v}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
