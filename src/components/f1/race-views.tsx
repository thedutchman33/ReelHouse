"use client";

import { useMemo, useState } from "react";
import { TyreBadge } from "@/components/f1/tyre";
import { lapFmtF } from "@/components/f1/format";
import { ActiveDot, ChartTip, DriverDisc, svgPoint, useChartTip } from "@/components/f1/chart-interaction";
import { DriverAvatar, SvgTeamLogo } from "@/components/f1/TeamLogo";
import { teamLogoWidth } from "@/lib/f1-teams";
import type { F1ResultRow2, F1ResultsPayload } from "@/lib/f1";

// ---------------------------------------------------------------------------
// Race analytics: the views that only exist for a race (or sprint) — track
// position history, tyre strategies, pit stops, the gap chart, average
// positions, traffic vs clean air, and the top-20 individual laps.
// All series come from OpenF1's position / intervals / pit / stints records.
// ---------------------------------------------------------------------------

export type RaceViewId =
  | "race-positions"
  | "tyre-strategies"
  | "pit-stop-times"
  | "gap-race"
  | "average-positions"
  | "traffic-clean-air";

export const RACE_VIEWS: { id: RaceViewId; label: string; title: string }[] = [
  { id: "race-positions", label: "Race Positions", title: "Race Positions" },
  { id: "tyre-strategies", label: "Tyre Strategies", title: "Tyre Strategies" },
  { id: "pit-stop-times", label: "Pit Stop Times", title: "Pit Stop Times" },
  { id: "gap-race", label: "Gap Race", title: "Gap Race" },
  { id: "average-positions", label: "Average Positions", title: "Average Positions" },
  { id: "traffic-clean-air", label: "Traffic & Clean Air", title: "Traffic & Clean Air" },
];

// --------------------------------- helpers ---------------------------------

const teamHex = (row: F1ResultRow2) => `#${row.teamColour || "ffffff"}`;

/** Tyre compound → the reference's bar colours (soft red, medium yellow, hard white). */
const COMPOUND_FILL: Record<string, string> = {
  SOFT: "#e11d48",
  MEDIUM: "#f2c94c",
  HARD: "#f2f2f5",
  INTERMEDIATE: "#10b981",
  WET: "#3b82f6",
};
const fillOf = (compound: string | null) =>
  COMPOUND_FILL[(compound ?? "").toUpperCase()] ?? "#7a7a85";

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-white/55">{children}</p>;
}

function DriverTag({ row }: { row: F1ResultRow2 }) {
  const colour = teamHex(row);
  return (
    <span className="flex items-center gap-2">
      <span
        className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full ring-2 ring-black/50"
        style={{ backgroundColor: colour }}
      >
        {row.headshotUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.headshotUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        )}
      </span>
      <span className="font-semibold" style={{ color: colour }}>
        {row.acronym}
      </span>
    </span>
  );
}

// ------------------------------ race positions -----------------------------

export function RacePositionsView({
  rows,
  race,
  maxLap,
}: {
  rows: F1ResultRow2[];
  race: NonNullable<F1ResultsPayload["race"]>;
  maxLap: number;
}) {
  const tip = useChartTip();
  const [hoverLap, setHoverLap] = useState<number | null>(null);

  const model = useMemo(() => {
    const drivers = rows
      .map((row) => ({ row, points: race.positions[row.driverNumber] ?? [] }))
      .filter((d) => d.points.length > 0);
    const maxPos = drivers.reduce(
      (m, d) => d.points.reduce((n, p) => Math.max(n, p.position), m),
      0
    );
    // Standings per lap, and each driver's previous known position — the
    // reference's tooltip ranks every car on the hovered lap and flags movers.
    const standings = new Map<number, { row: F1ResultRow2; position: number }[]>();
    for (const { row, points } of drivers) {
      for (const p of points) {
        const list = standings.get(p.lap) ?? [];
        list.push({ row, position: p.position });
        standings.set(p.lap, list);
      }
    }
    for (const list of standings.values()) list.sort((a, b) => a.position - b.position);
    return { drivers, standings, maxPos: Math.max(1, Math.min(maxPos, drivers.length || 22)) };
  }, [rows, race]);

  if (!model.drivers.length)
    return <Empty>No position data was published for this race.</Empty>;

  const W = 1100;
  const H = 580;
  const padL = 34;
  const padR = 74;
  const padT = 14;
  const padB = 30;
  const maxPos = model.maxPos;
  const px = (lap: number) => padL + ((lap - 1) / Math.max(1, maxLap - 1)) * (W - padL - padR);
  const py = (pos: number) =>
    padT + ((pos - 1) / Math.max(1, maxPos - 1)) * (H - padT - padB);
  const lapTicks = Array.from({ length: maxLap }, (_, i) => i + 1).filter(
    (l) => l === 1 || l % 5 === 0
  );

  const movesAt = (lap: number) => {
    const list = model.standings.get(lap) ?? [];
    return list
      .map((s) => {
        const points = race.positions[s.row.driverNumber] ?? [];
        let before: number | null = null;
        for (const p of points) {
          if (p.lap < lap) before = p.position;
          else break;
        }
        return { ...s, delta: before == null ? 0 : before - s.position };
      })
      .filter((s) => s.delta !== 0);
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
    if (p.x < padL || p.x > W - padR) {
      setHoverLap(null);
      tip.hide();
      return;
    }
    const lap = Math.max(
      1,
      Math.min(maxLap, Math.round(1 + ((p.x - padL) / (W - padL - padR)) * (maxLap - 1)))
    );
    const list = model.standings.get(lap);
    if (!list || !list.length) return;
    setHoverLap(lap);
    const moves = movesAt(lap);
    tip.show(e.clientX, e.clientY, {
      title: `Lap ${lap}`,
      note: `${list.length} cars`,
      rows: list.map((s, i) => ({
        label: `${i + 1} · ${s.row.acronym}`,
        value: `P${s.position}`,
        colour: teamHex(s.row),
      })),
      footer: moves.slice(0, 4).map((m) => ({
        text: `${m.delta > 0 ? "▲" : "▼"} ${m.row.acronym} ${m.delta > 0 ? "+" : "−"}${Math.abs(m.delta)}`,
        colour: m.delta > 0 ? "#34d399" : "#f87171",
      })),
    });
  };

  const hovered = hoverLap != null ? movesAt(hoverLap) : [];

  return (
    <div ref={tip.wrapRef} className="relative">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Driver positions by lap"
          className="h-auto w-full min-w-[720px] touch-pan-y"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => {
            setHoverLap(null);
            tip.hide();
          }}
        >
          {Array.from({ length: maxPos }, (_, i) => i + 1).map((pos) => (
            <g key={pos}>
              <line
                x1={padL}
                x2={W - padR}
                y1={py(pos)}
                y2={py(pos)}
                stroke="#26262f"
                strokeWidth="1"
              />
              <text x={padL - 10} y={py(pos) + 3.5} textAnchor="end" fontSize="10" fill="#8a8a93">
                P{pos}
              </text>
            </g>
          ))}
          {lapTicks.map((lap) => (
            <g key={lap}>
              <line x1={px(lap)} x2={px(lap)} y1={padT} y2={H - padB} stroke="#26262f" strokeWidth="1" />
              <text x={px(lap)} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="#8a8a93">
                {lap}
              </text>
            </g>
          ))}

          {hoverLap != null && (
            <line
              x1={px(hoverLap)}
              x2={px(hoverLap)}
              y1={padT}
              y2={H - padB}
              stroke="rgba(255,255,255,0.34)"
              strokeWidth={1.2}
              pointerEvents="none"
            />
          )}

          {model.drivers.map(({ row, points }) => {
            const colour = teamHex(row);
            const path = smoothPath(points.map((p) => [px(p.lap), py(p.position)] as [number, number]));
            const last = points[points.length - 1];
            return (
              <g key={row.driverNumber}>
                <path
                  d={path}
                  pathLength={1}
                  className="f1-draw"
                  fill="none"
                  stroke={colour}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {points.map((p) => (
                  <circle key={p.lap} cx={px(p.lap)} cy={py(p.position)} r="2.2" fill={colour} />
                ))}
                <DriverDisc
                  x={W - padR + 15}
                  y={py(last.position)}
                  r={11}
                  colour={colour}
                  href={row.headshotUrl}
                  label={row.acronym}
                />
                <text
                  x={W - padR + 15}
                  y={py(last.position) + 21}
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight="700"
                  fill={colour}
                >
                  {row.acronym.slice(0, 3)}
                </text>
              </g>
            );
          })}

          {hovered.map((m) => (
            <ActiveDot
              key={`hv-${m.row.driverNumber}`}
              x={px(hoverLap as number)}
              y={py(m.position)}
              colour={teamHex(m.row)}
            />
          ))}
        </svg>
      </div>
      <ChartTip tip={tip.tip} />
      <p className="mt-2 text-[11px] text-white/40">
        Every driver&apos;s position at the end of each lap. Hover a lap for the running order and
        the places gained or lost; the disc on the right is where they finished.
      </p>
    </div>
  );
}

/** Monotone cubic through (x, y): smooth position changes that never
 *  overshoot the real integer positions between laps (Fritsch–Carlson). */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (!n) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1][0] - pts[i][0];
    dx.push(h);
    slope.push(h === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / h);
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  m.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    d += ` C${(pts[i][0] + h / 3).toFixed(1)},${(pts[i][1] + (m[i] * h) / 3).toFixed(1)} ${(
      pts[i + 1][0] - h / 3
    ).toFixed(1)},${(pts[i + 1][1] - (m[i + 1] * h) / 3).toFixed(1)} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

// ------------------------------ tyre strategies ----------------------------

export function TyreStrategiesView({
  rows,
  maxLap,
}: {
  rows: F1ResultRow2[];
  maxLap: number;
}) {
  const rowH = 30;
  // Wider label gutter: headshot + acronym + team logo.
  const labelW = 128;
  const W = 1100;
  const padR = 12;
  const padT = 26;
  const H = padT + rows.length * rowH + 26;
  const px = (lap: number) =>
    labelW + ((lap - 1) / Math.max(1, maxLap - 1)) * (W - labelW - padR);
  const ticks = Array.from({ length: maxLap }, (_, i) => i + 1).filter((l) => l === 1 || l % 5 === 0);

  const compounds = ["SOFT", "MEDIUM", "HARD"];
  const tip = useChartTip();
  const [hoverStint, setHoverStint] = useState<{ driver: number; index: number } | null>(null);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
    const i = Math.floor((p.y - padT) / rowH);
    const row = rows[i];
    if (!row || p.x < labelW || p.x > W - padR) {
      setHoverStint(null);
      tip.hide();
      return;
    }
    const lap = 1 + ((p.x - labelW) / (W - labelW - padR)) * (maxLap - 1);
    const index = row.stints.findIndex((s) => {
      const end = Math.min(s.lapEnd ?? maxLap, maxLap);
      return lap >= s.lapStart - 0.5 && lap <= end + 0.5;
    });
    const stint = row.stints[index];
    if (!stint) {
      setHoverStint(null);
      tip.hide();
      return;
    }
    const end = Math.min(stint.lapEnd ?? maxLap, maxLap);
    setHoverStint({ driver: row.driverNumber, index });
    tip.show(e.clientX, e.clientY, {
      title: `${row.acronym} · Stint ${index + 1}`,
      note: stint.compound ? stint.compound[0] + stint.compound.slice(1).toLowerCase() : "Unknown",
      rows: [
        { label: "Tyre", value: stint.compound ?? "—", colour: fillOf(stint.compound) },
        { label: "Laps", value: `${stint.lapStart} – ${end}` },
        { label: "Stint length", value: `${end - stint.lapStart + 1}` },
      ],
    });
  };

  return (
    <div ref={tip.wrapRef} className="relative">
      <div className="mb-2 flex items-center justify-end gap-3 text-[11px] font-medium text-white/70">
        {compounds.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <TyreBadge compound={c} size={16} />
            {c[0] + c.slice(1).toLowerCase()}
          </span>
        ))}
      </div>
      <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Tyre strategy by driver and lap"
        className="h-auto w-full min-w-[720px] touch-pan-y"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => {
          setHoverStint(null);
          tip.hide();
        }}
      >
        {ticks.map((lap) => (
          <g key={lap}>
            <line x1={px(lap)} x2={px(lap)} y1={padT - 6} y2={H - 22} stroke="#26262f" strokeWidth="1" />
            <text x={px(lap)} y={H - 8} textAnchor="middle" fontSize="9" fill="#8a8a93">
              {lap}
            </text>
          </g>
        ))}
        {rows.map((row, i) => {
          const y = padT + i * rowH;
          return (
            <g key={row.driverNumber}>
              <DriverDisc
                x={12}
                y={y + rowH / 2 - 3}
                r={9}
                colour={teamHex(row)}
                href={row.headshotUrl}
                label={row.acronym}
              />
              <text x={26} y={y + rowH / 2 + 1} fontSize="10" fontWeight="600" fill="#f2f2f5">
                {row.acronym}
              </text>
              <SvgTeamLogo
                team={row.teamName}
                x={62}
                y={y + rowH / 2 - 9}
                width={teamLogoWidth(row.teamName, 18, 38)}
                height={18}
              />
              {row.stints.map((stint, k) => {
                const startLap = stint.lapStart;
                const endLap = Math.min(stint.lapEnd ?? maxLap, maxLap);
                if (endLap < startLap) return null;
                const x = px(startLap);
                const w = Math.max(2, px(endLap + 1) - x - 1);
                return (
                  <g key={k}>
                    <rect
                      x={x}
                      y={y + 3}
                      width={w}
                      height={rowH - 9}
                      rx="2"
                      fill={fillOf(stint.compound)}
                      fillOpacity="0.92"
                      className="f1-grow transition-[stroke,fill-opacity]"
                      stroke={
                        hoverStint?.driver === row.driverNumber && hoverStint.index === k
                          ? "#ffffff"
                          : "transparent"
                      }
                      strokeWidth={1.6}
                    >
                      <title>{`${row.acronym} · ${stint.compound ?? "unknown"} · laps ${startLap}–${endLap}`}</title>
                    </rect>
                    <text
                      x={x + w / 2}
                      y={y + 3 + (rowH - 9) / 2 + 3.2}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="700"
                      fill="#101017"
                    >
                      {endLap - startLap + 1}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      </div>
      <ChartTip tip={tip.tip} />
      <p className="mt-2 text-[11px] text-white/40">
        One bar per stint, coloured by compound; the number is the stint length in laps. Hover a
        bar for its tyre, lap range and length.
      </p>
    </div>
  );
}

// ------------------------------ pit stop times -----------------------------

export function PitStopTimesView({
  rows,
  race,
}: {
  rows: F1ResultRow2[];
  race: NonNullable<F1ResultsPayload["race"]>;
}) {
  const list = useMemo(() => {
    const byDriver = new Map<number, number[]>();
    for (const p of race.pits) {
      if (p.duration == null) continue;
      const list = byDriver.get(p.driverNumber) ?? [];
      list.push(p.duration);
      byDriver.set(p.driverNumber, list);
    }
    const out = rows
      .map((row) => {
        // The reference lists stops in the order they happened, not by duration.
        const stops = byDriver.get(row.driverNumber) ?? [];
        const fastest = stops.length ? Math.min(...stops) : null;
        const average = stops.length ? stops.reduce((s, v) => s + v, 0) / stops.length : null;
        const total = stops.length ? stops.reduce((s, v) => s + v, 0) : null;
        return { row, stops, fastest, average, total };
      })
      .filter((e) => e.stops.length > 0);
    out.sort((a, b) => (a.fastest ?? 99) - (b.fastest ?? 99));
    return out;
  }, [rows, race]);

  if (!list.length) return <Empty>No pit stops were recorded for this race.</Empty>;
  const maxStops = list.reduce((m, e) => Math.max(m, e.stops.length), 0);
  const best = list[0].fastest;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-[10px] font-bold tracking-[0.08em] text-white/40 uppercase [&>tr>th:not(:last-child)]:pr-3">
          <tr>
            <th className="w-14 py-2 pl-2 font-semibold">Pos.</th>
            <th className="py-2 font-semibold">Driver</th>
            <th className="hidden py-2 font-semibold md:table-cell">Team</th>
            {Array.from({ length: maxStops }, (_, i) => (
              <th key={i} className="w-20 py-2 text-right font-semibold">
                Stop {i + 1}
              </th>
            ))}
            <th className="w-20 py-2 text-right font-semibold">Fastest</th>
            <th className="w-20 py-2 text-right font-semibold">Average</th>
            <th className="w-20 py-2 pr-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {list.map((e, i) => (
            <tr key={e.row.driverNumber} className="border-t border-white/[0.06] transition-colors hover:bg-white/[0.04]">
              <td className="py-1.5 pl-2 font-semibold tabular-nums">{i + 1}</td>
              <td className="py-1.5">
                <DriverTag row={e.row} />
              </td>
              <td className="hidden py-1.5 text-white/70 md:table-cell">{e.row.teamName}</td>
              {Array.from({ length: maxStops }, (_, k) => {
                const v = e.stops[k];
                const own = v != null && v === e.fastest;
                return (
                  <td
                    key={k}
                    className={`py-1.5 text-right tabular-nums ${
                      own
                        ? v === best
                          ? "font-bold text-fuchsia-400"
                          : "font-bold text-emerald-400"
                        : "text-white/70"
                    }`}
                  >
                    {v != null ? v.toFixed(3) : <span className="text-white/30">–</span>}
                  </td>
                );
              })}
              <td
                className={`py-1.5 text-right font-bold tabular-nums ${
                  e.fastest === best ? "text-fuchsia-400" : "text-emerald-400"
                }`}
              >
                {e.fastest != null ? e.fastest.toFixed(3) : "–"}
              </td>
              <td className="py-1.5 text-right tabular-nums text-white/70">
                {e.average != null ? e.average.toFixed(3) : "–"}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-white/70">
                {e.total != null ? e.total.toFixed(3) : "–"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-white/40">
        Time spent in the pit lane (s). Purple: fastest stop of the race; green: a driver&apos;s own
        fastest stop. Rows are ordered by fastest stop.
      </p>
    </div>
  );
}

// ---------------------------------- gap race --------------------------------

export function GapRaceView({
  rows,
  race,
  maxLap,
}: {
  rows: F1ResultRow2[];
  race: NonNullable<F1ResultsPayload["race"]>;
  maxLap: number;
}) {
  const withGaps = rows.filter((r) => (race.gaps[r.driverNumber] ?? []).length > 0);
  const [refDriver, setRefDriver] = useState<number | null>(
    withGaps[0]?.driverNumber ?? null
  );
  /** Drivers drawn on the chart; the reference + podium start visible. */
  const [visible, setVisible] = useState<Set<number> | null>(null);
  const shown = visible ?? new Set(withGaps.slice(0, 3).map((r) => r.driverNumber));
  const toggle = (driver: number) => {
    const next = new Set(shown);
    if (next.has(driver)) next.delete(driver);
    else next.add(driver);
    setVisible(next);
  };

  const model = useMemo(() => {
    if (refDriver == null) return null;
    const refSeries = new Map((race.gaps[refDriver] ?? []).map((p) => [p.lap, p.gap]));
    const plotted = withGaps.filter(
      (r) => r.driverNumber === refDriver || shown.has(r.driverNumber)
    );
    const lines = plotted
      .map((row) => {
        const points: { lap: number; value: number }[] = [];
        for (const p of race.gaps[row.driverNumber] ?? []) {
          const refGap = refSeries.get(p.lap);
          if (p.gap == null || refGap == null) continue;
          points.push({ lap: p.lap, value: p.gap - refGap });
        }
        return { row, points };
      })
      .filter((l) => l.points.length > 1);
    const values = lines.flatMap((l) => l.points.map((p) => p.value)).sort((a, b) => a - b);
    // A retirement or a lap-down car can put a +2 minute spike on the chart;
    // the 98th percentile keeps the scale readable.
    const hi = values.length ? values[Math.min(values.length - 1, Math.floor(values.length * 0.98))] : 30;
    const lo = values.length ? values[0] : -5;
    const max = Math.max(10, Math.ceil(hi / 5) * 5);
    const min = Math.min(-5, Math.floor(lo / 5) * 5);
    return { lines, max, min };
  }, [race, withGaps, refDriver, shown]);

  if (!model) return <Empty>No interval data was published for this race.</Empty>;

  const W = 1000;
  const H = 380;
  const padL = 44;
  const padR = 16;
  const padT = 12;
  const padB = 30;
  const px = (lap: number) => padL + ((lap - 1) / Math.max(1, maxLap - 1)) * (W - padL - padR);
  const py = (v: number) =>
    padT + ((model.max - v) / (model.max - model.min)) * (H - padT - padB);
  const ticks = [model.min, 0, model.max / 2, model.max].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );
  const refRow = rows.find((r) => r.driverNumber === refDriver);
  const refPits = race.pits.filter((p) => p.driverNumber === refDriver);

  const tip = useChartTip();
  const [hoverLap, setHoverLap] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
    if (p.x < padL || p.x > W - padR) {
      setHoverLap(null);
      tip.hide();
      return;
    }
    const lap = Math.max(
      1,
      Math.min(maxLap, Math.round(1 + ((p.x - padL) / (W - padL - padR)) * (maxLap - 1)))
    );
    const rows_ = model.lines
      .map(({ row, points }) => {
        const hit = points.find((pt) => pt.lap === lap);
        return hit ? { row, value: hit.value } : null;
      })
      .filter((e): e is { row: F1ResultRow2; value: number } => e != null)
      .sort((a, b) => a.value - b.value);
    if (!rows_.length) return;
    setHoverLap(lap);
    tip.show(e.clientX, e.clientY, {
      title: `Lap ${lap}`,
      note: refRow ? `vs ${refRow.acronym}` : undefined,
      rows: rows_.map((e) => ({
        label: e.row.acronym,
        value: `${e.value >= 0 ? "+" : "−"}${Math.abs(e.value).toFixed(2)} s`,
        colour: teamHex(e.row),
        tone: e.value < 0 ? "up" : "muted",
      })),
    });
  };

  return (
    <div ref={tip.wrapRef} className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="mr-2 text-[11px] text-white/55">
          Gaps are measured from{" "}
          <span className="font-semibold text-white/90">{refRow?.acronym ?? "—"}</span>.
        </p>
        <button
          type="button"
          onClick={() => setVisible(new Set(withGaps.map((r) => r.driverNumber)))}
          className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/70 hover:border-white/25 hover:text-white"
        >
          All
        </button>
        <span aria-hidden="true" className="text-white/30">
          ·
        </span>
        <button
          type="button"
          onClick={() => setVisible(new Set())}
          className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/70 hover:border-white/25 hover:text-white"
        >
          None
        </button>
        <div className="flex flex-wrap gap-1">
          {withGaps.map((row) => {
            const isRef = row.driverNumber === refDriver;
            const isShown = isRef || shown.has(row.driverNumber);
            return (
              <span
                key={row.driverNumber}
                className={`flex items-center gap-1 rounded-md border py-0.5 pr-1 pl-0.5 text-[11px] font-semibold transition-colors ${
                  isShown
                    ? "border-white/15 bg-[#1a1a23] text-white"
                    : "border-white/[0.06] text-white/40"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={isShown}
                  onClick={() => toggle(row.driverNumber)}
                  aria-label={`${isShown ? "Hide" : "Show"} ${row.acronym}`}
                  className="flex items-center gap-1 px-1"
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: teamHex(row) }}
                  />
                  {row.acronym}
                </button>
                <button
                  type="button"
                  onClick={() => setRefDriver(row.driverNumber)}
                  aria-pressed={isRef}
                  aria-label={`Measure gaps from ${row.acronym}`}
                  title={`Measure gaps from ${row.acronym}`}
                  className={`grid h-4 w-4 place-items-center rounded-sm border text-[8px] leading-none ${
                    isRef
                      ? "border-[#e10600] bg-[#e10600] text-white"
                      : "border-white/15 text-white/55 hover:border-white/30 hover:text-white"
                  }`}
                >
                  ◎
                </button>
              </span>
            );
          })}
        </div>
      </div>

      {race.safetyCars.length > 0 && (
        <div className="mb-1 flex items-center gap-2 text-[10px] text-white/55">
          <span className="inline-block h-3 w-3 rounded-sm bg-white/20" />
          Virtual Safety Car
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Gap to the reference driver by lap"
          className="h-auto w-full min-w-[680px] touch-pan-y"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => {
            setHoverLap(null);
            tip.hide();
          }}
        >
          {race.safetyCars.map((sc, i) => (
            <rect
              key={i}
              x={px(sc.startLap)}
              y={padT}
              width={Math.max(3, px(sc.endLap) - px(sc.startLap))}
              height={H - padT - padB}
              fill="#8a8a93"
              fillOpacity="0.16"
            />
          ))}
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={padL}
                x2={W - padR}
                y1={py(v)}
                y2={py(v)}
                stroke={v === 0 ? "#7a7a85" : "#26262f"}
                strokeWidth="1"
              />
              <text x={padL - 8} y={py(v) + 3.5} textAnchor="end" fontSize="10" fill="#8a8a93">
                {v > 0 ? `+${v.toFixed(0)}s` : `${v.toFixed(0)}s`}
              </text>
            </g>
          ))}
          {refPits.map((p, i) => (
            <line
              key={i}
              x1={px(p.lap)}
              x2={px(p.lap)}
              y1={padT}
              y2={H - padB}
              stroke="#f2f2f5"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ))}
          {hoverLap != null && (
            <line
              x1={px(hoverLap)}
              x2={px(hoverLap)}
              y1={padT}
              y2={H - padB}
              stroke="rgba(255,255,255,0.34)"
              strokeWidth={1.2}
              pointerEvents="none"
            />
          )}
          {model.lines.map(({ row, points }) => (
            <path
              key={row.driverNumber}
              d={points
                .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.lap).toFixed(1)},${py(p.value).toFixed(1)}`)
                .join(" ")}
              pathLength={1}
              className="f1-draw"
              fill="none"
              stroke={teamHex(row)}
              strokeWidth="1.7"
              strokeOpacity="0.9"
              strokeLinejoin="round"
            />
          ))}
          {Array.from({ length: maxLap }, (_, i) => i + 1)
            .filter((l) => l === 1 || l % 5 === 0)
            .map((lap) => (
              <text
                key={lap}
                x={px(lap)}
                y={H - padB + 15}
                textAnchor="middle"
                fontSize="9"
                fill="#8a8a93"
              >
                {lap}
              </text>
            ))}
        </svg>
      </div>
      <ChartTip tip={tip.tip} />
      <p className="mt-2 text-[11px] text-white/40">
        Each line is a driver&apos;s gap to the reference car, lap by lap. The circled button
        measures gaps from that driver; the shaded bands are Virtual Safety Car periods and the
        dashed lines mark the reference driver&apos;s pit stops.
      </p>
    </div>
  );
}

// ----------------------------- average positions ---------------------------

export function AveragePositionsView({
  rows,
  race,
  maxLap,
}: {
  rows: F1ResultRow2[];
  race: NonNullable<F1ResultsPayload["race"]>;
  maxLap: number;
}) {
  const list = useMemo(() => {
    const out = rows
      .map((row) => {
        const points = race.positions[row.driverNumber] ?? [];
        if (!points.length) return null;
        const avg = points.reduce((s, p) => s + p.position, 0) / points.length;
        return {
          row,
          avg,
          finish: row.position ?? points[points.length - 1].position,
          start: points[0].position,
          best: points.reduce((m, p) => Math.min(m, p.position), 99),
          laps: points.length,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e != null);
    out.sort((a, b) => a.avg - b.avg);
    return out;
  }, [rows, race]);

  if (!list.length) return <Empty>No position data was published for this race.</Empty>;

  // The reference's average-positions card is a horizontal bar per driver, the
  // bar running from pole to that driver's mean position, with a pill carrying
  // the average and the finishing slot. Bars are ordered fastest-average first.
  const W = 1000;
  const rowH = 29;
  const plotL = 112;
  const padR = 12;
  const axisH = 22;
  const H = 14 + list.length * rowH + axisH;
  const trackW = W - plotL - padR;
  const posCount = Math.max(
    rows.length,
    ...list.map((e) => Math.ceil(Math.max(e.avg, e.finish, e.start)))
  );
  const px = (pos: number) => plotL + ((pos - 1) / Math.max(1, posCount - 1)) * trackW;
  const laps = maxLap > 0 ? maxLap : Math.max(...list.map((e) => e.laps));

  const tip = useChartTip();
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
    const i = Math.floor((p.y - 14) / rowH);
    const entry = list[i];
    if (!entry || p.x < 4 || p.x > W - 4) {
      setHoverRow(null);
      tip.hide();
      return;
    }
    setHoverRow(i);
    tip.show(e.clientX, e.clientY, {
      title: entry.row.acronym,
      note: entry.row.teamName,
      rows: [
        { label: "Average", value: `P${entry.avg.toFixed(2)}`, colour: teamHex(entry.row) },
        { label: "Grid", value: `P${entry.start}` },
        { label: "Finished", value: `P${entry.finish}` },
        { label: "Best", value: `P${entry.best}` },
        { label: "Laps", value: String(entry.laps) },
      ],
    });
  };

  return (
    <div ref={tip.wrapRef} className="relative">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Average race position per driver, with finishing position"
          className="h-auto w-full min-w-[680px] touch-pan-y"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => {
            setHoverRow(null);
            tip.hide();
          }}
        >
          {Array.from({ length: posCount }, (_, k) => k + 1).map((p) => (
            <g key={p}>
              <line
                x1={px(p)}
                x2={px(p)}
                y1={6}
                y2={H - axisH}
                stroke="#26262f"
                strokeWidth="1"
              />
              <text
                x={px(p)}
                y={H - 7}
                textAnchor="middle"
                fontSize="9"
                fill="#8a8a93"
              >
                P{p}
              </text>
            </g>
          ))}
          {list.map((e, i) => {
            const cy = 14 + i * rowH + rowH / 2;
            const colour = teamHex(e.row);
            const barEnd = px(Math.max(1.04, e.avg));
            const pillW = 52;
            const pillH = 18;
            const pillX = Math.min(barEnd + 6, W - padR - pillW);
            return (
              <g key={e.row.driverNumber}>
                {hoverRow === i && (
                  <rect
                    x={4}
                    y={cy - rowH / 2 + 2}
                    width={W - 8}
                    height={rowH - 4}
                    rx={4}
                    fill="rgba(255,255,255,0.05)"
                  />
                )}
                <DriverDisc
                  x={15}
                  y={cy}
                  r={10}
                  colour={colour}
                  href={e.row.headshotUrl}
                  label={e.row.acronym}
                />
                <text x={31} y={cy + 3.5} fontSize="10" fontWeight="700" fill="#f2f2f5">
                  {e.row.acronym}
                </text>
                <SvgTeamLogo
                  team={e.row.teamName}
                  x={70}
                  y={cy - 7}
                  width={teamLogoWidth(e.row.teamName, 14, 30)}
                  height={14}
                />
                <rect
                  x={px(1)}
                  y={cy - 7}
                  width={Math.max(3, barEnd - px(1))}
                  height={14}
                  rx={3}
                  fill={colour}
                >
                  <title>{`${e.row.acronym} · average P${e.avg.toFixed(2)} · finished P${e.finish}`}</title>
                </rect>
                <rect
                  x={pillX}
                  y={cy - pillH / 2}
                  width={pillW}
                  height={pillH}
                  rx={4}
                  fill="#101017"
                  stroke="#33333f"
                  strokeWidth="1"
                />
                <text
                  x={pillX + 7}
                  y={cy + 3.5}
                  fontSize="10"
                  fontWeight="700"
                  fill="#f2f2f5"
                >
                  {e.avg.toFixed(1)}
                </text>
                <text x={pillX + 32} y={cy + 3.5} fontSize="9" fill="#8a8a93">
                  P{e.finish}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ChartTip tip={tip.tip} />
      <p className="mt-2 text-[11px] text-white/40">
        Each bar runs from pole to that driver&apos;s average position across {laps} laps; the pill
        repeats the average and the position they finished in. Hover a bar for the grid slot and
        their best position of the race.
      </p>
    </div>
  );
}

// ---------------------------- traffic & clean air --------------------------

export function TrafficCleanAirView({
  rows,
  race,
}: {
  rows: F1ResultRow2[];
  race: NonNullable<F1ResultsPayload["race"]>;
}) {
  const [threshold, setThreshold] = useState(1.5);

  const model = useMemo(() => {
    const cleanSets: { row: F1ResultRow2; clean: number; total: number; pct: number }[] = [];
    let cleanTotal = 0;
    let allTotal = 0;

    const points: {
      row: F1ResultRow2;
      lap: number;
      minute: number;
      time: number;
      clean: boolean;
      interval: number | null;
      gap: number | null;
    }[] = [];
    for (const row of rows) {
      const byLap = new Map((race.gaps[row.driverNumber] ?? []).map((p) => [p.lap, p]));
      let clean = 0;
      let total = 0;
      // In/out laps and crawl laps would wreck the time axis.
      const timed = row.laps.filter((l) => l.time != null && !l.deleted && !l.pitOut);
      const best = timed.reduce((m, l) => Math.min(m, l.time as number), Infinity);
      for (const lap of timed) {
        if (Number.isFinite(best) && (lap.time as number) > best * 1.1) continue;
        const gap = byLap.get(lap.lap);
        // Leading the race counts as clean air.
        const isClean = gap?.interval == null || gap.interval >= threshold;
        if (gap?.interval == null && gap?.gap == null) continue;
        total += 1;
        if (isClean) clean += 1;
        const minute = new Date(lap.dateStart).getTime();
        points.push({
          row,
          lap: lap.lap,
          minute,
          time: lap.time as number,
          clean: isClean,
          interval: gap?.interval ?? null,
          gap: gap?.gap ?? null,
        });
      }
      if (total > 0) {
        cleanSets.push({ row, clean, total, pct: (clean / total) * 100 });
        cleanTotal += clean;
        allTotal += total;
      }
    }
    cleanSets.sort((a, b) => b.pct - a.pct);
    const startMs = points.length ? Math.min(...points.map((p) => p.minute)) : 0;
    return {
      points: points.map((p) => ({ ...p, minute: (p.minute - startMs) / 60000 })),
      ranking: cleanSets,
      pct: allTotal ? Math.round((cleanTotal / allTotal) * 100) : 0,
    };
  }, [rows, race, threshold]);

  if (!model.points.length)
    return <Empty>No interval data was published for this race.</Empty>;

  const W = 820;
  const H = 480;
  const padL = 46;
  const padR = 12;
  const padT = 12;
  const padB = 30;
  // A handful of crawl laps would stretch the time axis; frame the plot on the
  // 2nd–98th percentile and drop anything outside it.
  const sortedTimes = [...model.points.map((p) => p.time)].sort((a, b) => a - b);
  const at = (q: number) => sortedTimes[Math.min(sortedTimes.length - 1, Math.max(0, Math.floor(sortedTimes.length * q)))];
  const minT = at(0.02) - 0.5;
  const maxT = at(0.98) + 0.5;
  const minutes = model.points.map((p) => p.minute);
  const maxM = Math.max(...minutes);
  const shown = model.points.filter((p) => p.time >= minT && p.time <= maxT);
  const px = (m: number) => padL + (m / Math.max(1, maxM)) * (W - padL - padR);
  const py = (t: number) => padT + ((t - minT) / Math.max(1, maxT - minT)) * (H - padT - padB);

  const tip = useChartTip();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hovered = hoverIdx != null ? shown[hoverIdx] : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
    let best = -1;
    let bestD = 16 * 16;
    shown.forEach((pt, i) => {
      const dx = px(pt.minute) - p.x;
      const dy = py(pt.time) - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best === -1) {
      setHoverIdx(null);
      tip.hide();
      return;
    }
    const pt = shown[best];
    setHoverIdx(best);
    tip.show(e.clientX, e.clientY, {
      title: `${pt.row.acronym}`,
      note: `Lap ${pt.lap}`,
      rows: [
        { label: "Lap time", value: lapFmtF(pt.time) },
        {
          label: "Gap to car ahead",
          value: pt.interval != null ? `${pt.interval.toFixed(2)} s` : "—",
        },
        {
          label: "Air",
          value: pt.clean ? "Clean" : "Traffic",
          colour: pt.clean ? "#34d399" : "#f87171",
        },
      ],
    });
  };

  return (
    <div ref={tip.wrapRef} className="relative grid gap-4 lg:grid-cols-[1fr_220px]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-4 text-[11px] text-white/70">
          <label className="flex items-center gap-2">
            Clean air gap
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="h-1 w-28 cursor-pointer accent-red-500"
              aria-label="Clean air gap in seconds"
            />
            <span className="w-9 tabular-nums">{threshold.toFixed(1)}s</span>
          </label>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-white/30" /> clean air
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/80" /> traffic
          </span>
          <span className="text-white/55">{model.pct}% of laps in clean air</span>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Lap time by session minute, split by clean air and traffic"
            className="h-auto w-full min-w-[560px] touch-pan-y"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => {
              setHoverIdx(null);
              tip.hide();
            }}
          >
            {Array.from({ length: 5 }, (_, i) => minT + ((maxT - minT) * i) / 4).map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={py(t)} y2={py(t)} stroke="#26262f" />
                <text x={padL - 8} y={py(t) + 3.5} textAnchor="end" fontSize="9" fill="#8a8a93">
                  {lapFmtF(t).slice(0, -2)}
                </text>
              </g>
            ))}
            {Array.from({ length: 5 }, (_, i) => (maxM * i) / 4).map((m) => (
              <text key={m} x={px(m)} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="#8a8a93">
                {Math.round(m)}&apos;
              </text>
            ))}
            {shown.map((p, i) => (
              <circle
                key={i}
                className="f1-dot-in"
                cx={px(p.minute)}
                cy={py(p.time)}
                r={hoverIdx === i ? 4 : 2.6}
                fill={p.clean ? "none" : teamHex(p.row)}
                fillOpacity={p.clean ? 0 : 0.85}
                stroke={teamHex(p.row)}
                strokeWidth="1.1"
                strokeOpacity="0.9"
              >
                <title>{`${p.row.acronym} · lap ${p.lap} · ${lapFmtF(p.time)} · ${
                  p.clean ? "clean air" : "traffic"
                }`}</title>
              </circle>
            ))}
            {hovered && (
              <ActiveDot
                x={px(hovered.minute)}
                y={py(hovered.time)}
                colour={teamHex(hovered.row)}
                r={4.2}
              />
            )}
          </svg>
        </div>
        <ChartTip tip={tip.tip} />
      </div>

      <div className="max-h-[420px] overflow-y-auto pr-1">
        <p className="mb-1 text-[11px] font-semibold tracking-wide text-white/55 uppercase">
          Clean air %
        </p>
        {model.ranking.map((e) => (
          <div key={e.row.driverNumber} className="flex items-center gap-2 py-[3px]">
            <DriverAvatar
              name={e.row.fullName}
              colour={teamHex(e.row)}
              headshotUrl={e.row.headshotUrl}
              size={20}
            />
            <span className="w-10 shrink-0 text-[11px] font-semibold" style={{ color: teamHex(e.row) }}>
              {e.row.acronym}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full"
                style={{ width: `${e.pct}%`, backgroundColor: teamHex(e.row) }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-white/70">
              {Math.round(e.pct)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------ top fastest laps ---------------------------

export function TopLapsView({ rows }: { rows: F1ResultRow2[] }) {
  const list = useMemo(() => {
    const laps = rows.flatMap((row) =>
      row.laps
        .filter((l) => l.time != null && !l.deleted)
        .map((l) => ({ row, lap: l.lap, time: l.time as number, compound: l.compound }))
    );
    laps.sort((a, b) => a.time - b.time);
    return laps.slice(0, 20);
  }, [rows]);

  if (!list.length) return <Empty>No timed laps in this race yet.</Empty>;
  const best = list[0].time;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="text-[10px] font-bold tracking-[0.08em] text-white/40 uppercase [&>tr>th:not(:last-child)]:pr-3">
          <tr>
            <th className="w-14 py-2 pl-2 font-semibold">Pos.</th>
            <th className="py-2 font-semibold">Driver</th>
            <th className="hidden py-2 font-semibold md:table-cell">Team</th>
            <th className="w-16 py-2 text-right font-semibold">Lap</th>
            <th className="w-28 py-2 text-right font-semibold">Time</th>
            <th className="w-24 py-2 pr-2 text-right font-semibold">Gap</th>
          </tr>
        </thead>
        <tbody>
          {list.map((e, i) => (
            <tr
              key={`${e.row.driverNumber}-${e.lap}`}
              style={i === 0 ? { backgroundColor: "#a21caf" } : undefined}
              className={i === 0 ? "text-white" : "border-t border-white/[0.08] hover:bg-white/[0.06]"}
            >
              <td className="py-1.5 pl-2 font-semibold tabular-nums">{i + 1}</td>
              <td className="py-1.5">
                <DriverTag row={e.row} />
              </td>
              <td className={`hidden py-1.5 md:table-cell ${i === 0 ? "text-white/90" : "text-white/70"}`}>
                {e.row.teamName}
              </td>
              <td className={`py-1.5 text-right tabular-nums ${i === 0 ? "text-white" : "text-white/70"}`}>
                {e.lap}
              </td>
              <td className="py-1.5 text-right font-bold tabular-nums">{lapFmtF(e.time)}</td>
              <td
                className={`py-1.5 pr-2 text-right text-xs tabular-nums ${
                  i === 0 ? "text-white/80" : "text-white/55"
                }`}
              >
                {i === 0 ? "" : `+${(e.time - best).toFixed(3)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
