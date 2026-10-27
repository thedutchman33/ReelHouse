"use client";

import { useMemo, useState } from "react";
import { ChartKit } from "@/components/f1/charts";
import { ChartTip, DriverDisc, svgPoint, useChartTip } from "@/components/f1/chart-interaction";
import { TyreBadge } from "@/components/f1/tyre";
import { TeamMark } from "@/components/f1/TeamLogo";
import { axisSecF, lapFmtF } from "@/components/f1/format";
import { orderByClassification } from "@/lib/f1-classification";
import type { F1LapRow, F1ResultRow2, F1ResultsPayload, F1WeatherSample } from "@/lib/f1";

// ---------------------------------------------------------------------------
// The Analytics deck: every analysis the timing screens offer for one
// session, drawn from the same OpenF1 payload (laps, sectors, stints, speed
// traps, weather). Chips pick the view; the shell owns the selection.
// ---------------------------------------------------------------------------

export type ViewId =
  | "classification"
  | "potential-drivers"
  | "potential-teams"
  | "fastest-laps"
  | "best-sectors"
  | "lap-time-evolution"
  | "pace-drivers"
  | "pace-teams"
  | "tyre-degradation"
  | "top-speed"
  | "speed-vs-lap-time"
  | "driver-times"
  | "lap-time-matrix"
  | "weather-trend";

export const VIEWS: { id: ViewId; label: string; title: string }[] = [
  { id: "classification", label: "Classification", title: "Classification" },
  { id: "potential-drivers", label: "Potential: Drivers", title: "Potential — Drivers" },
  { id: "potential-teams", label: "Potential: Teams", title: "Potential — Teams" },
  { id: "fastest-laps", label: "Fastest Laps", title: "Top 20 Fastest Laps" },
  { id: "best-sectors", label: "Best Sectors", title: "Best Sectors" },
  { id: "lap-time-evolution", label: "Lap Time Evolution", title: "Lap Time Evolution" },
  { id: "pace-drivers", label: "Pace: Drivers", title: "Pace — Drivers" },
  { id: "pace-teams", label: "Pace: Teams", title: "Pace — Teams" },
  { id: "tyre-degradation", label: "Tyre Degradation", title: "Tyre Degradation" },
  { id: "top-speed", label: "Top Speed", title: "Top Speed" },
  { id: "speed-vs-lap-time", label: "Speed vs Lap Time", title: "Speed vs Lap Time" },
  { id: "driver-times", label: "Driver Times", title: "Driver Times" },
  { id: "lap-time-matrix", label: "Lap Time Matrix", title: "Lap Time Matrix" },
  { id: "weather-trend", label: "Weather Trend", title: "Weather Trend" },
];

/**
 * The chip row in the timing site's order. Every entry is servable — the deck
 * has no locked/premium views.
 */
export const CHIPS: { id: ViewId | null; label: string }[] = [
  { id: "classification", label: "Classification" },
  { id: "potential-drivers", label: "Potential: Drivers" },
  { id: "potential-teams", label: "Potential: Teams" },
  { id: "fastest-laps", label: "Fastest Laps" },
  { id: "best-sectors", label: "Best Sectors" },
  { id: "lap-time-evolution", label: "Lap Time Evolution" },
  { id: "pace-drivers", label: "Pace: Drivers" },
  { id: "pace-teams", label: "Pace: Teams" },
  { id: "tyre-degradation", label: "Tyre Degradation" },
  { id: "top-speed", label: "Top Speed" },
  { id: "speed-vs-lap-time", label: "Speed vs Lap Time" },
  { id: "driver-times", label: "Driver Times" },
  { id: "lap-time-matrix", label: "Lap Time Matrix" },
  { id: "weather-trend", label: "Weather Trend" },
];

// --------------------------------- helpers ---------------------------------

export type TimedLap = F1LapRow & { time: number };

export const teamHex = (row: F1ResultRow2) => `#${row.teamColour || "ffffff"}`;

/** Every timed lap that wasn't deleted (the raw feed, pit laps included). */
function timedLaps(row: F1ResultRow2): TimedLap[] {
  return row.laps.filter((l): l is TimedLap => l.time != null && !l.deleted);
}

/** Racing laps: no pit-out/in and inside 107% of the driver's own best —
 *  the same filter the timing screens apply to pace averages. */
export function paceLaps(row: F1ResultRow2): TimedLap[] {
  const timed = timedLaps(row).filter((l) => !l.pitOut);
  if (!timed.length) return [];
  const best = Math.min(...timed.map((l) => l.time));
  return timed.filter((l) => l.time <= best * 1.07);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function sectorBests(row: F1ResultRow2) {
  let s1 = Infinity;
  let s2 = Infinity;
  let s3 = Infinity;
  for (const l of timedLaps(row)) {
    if (l.s1 != null) s1 = Math.min(s1, l.s1);
    if (l.s2 != null) s2 = Math.min(s2, l.s2);
    if (l.s3 != null) s3 = Math.min(s3, l.s3);
  }
  const pick = (v: number) => (Number.isFinite(v) ? v : null);
  return { s1: pick(s1), s2: pick(s2), s3: pick(s3) };
}

const idealOf = (b: { s1: number | null; s2: number | null; s3: number | null }) =>
  b.s1 != null && b.s2 != null && b.s3 != null ? b.s1 + b.s2 + b.s3 : null;

/** Signed gap, three decimals — `+0.084`. */
function gapFmt(v: number): string {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`;
}

const MISSING = <span className="text-white/30">—</span>;

// ------------------------------- primitives --------------------------------

function DriverCell({ row, showName = false }: { row: F1ResultRow2; showName?: boolean }) {
  const colour = teamHex(row);
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded-sm" style={{ background: colour }} />
      <span
        className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full ring-2 ring-black/50"
        style={{ backgroundColor: colour }}
      >
        {row.headshotUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.headshotUrl}
            alt={row.fullName}
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        )}
      </span>
      <span className="font-semibold" style={{ color: colour }}>
        {row.acronym}
      </span>
      {showName && <span className="hidden truncate text-xs text-white/55 sm:inline">{row.fullName}</span>}
    </span>
  );
}

function TableShell({ minWidth = 720, children }: { minWidth?: number; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <thead className="text-[10px] font-bold tracking-[0.08em] text-white/40 uppercase [&>tr>th:not(:last-child)]:pr-3">
      <tr>{children}</tr>
    </thead>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-t border-white/[0.06] transition-colors hover:bg-white/[0.04]">
      {children}
    </tr>
  );
}

/** Position cell — DNF / DNS keep the reference's compact red label. */
function PosCell({ row, n }: { row?: F1ResultRow2; n: number | string }) {
  if (row?.dnf) return <span className="text-[10px] font-semibold text-[#ff5a4f]">DNF</span>;
  if (row?.dns) return <span className="text-[10px] font-semibold text-white/40">DNS</span>;
  return <>{n}</>;
}

function EmptyView({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-white/55">{children}</p>;
}

// ----------------------------- classification ------------------------------

export function ClassificationView({
  rows,
  sessionBest,
  race,
  finalGap,
}: {
  rows: F1ResultRow2[];
  sessionBest: number | null;
  /** Race sessions add grid, stops, race gaps and position deltas. */
  race?: F1ResultsPayload["race"];
  finalGap?: Record<number, number>;
}) {
  const raceMode = Boolean(race);
  const stopsByDriver = useMemo(() => {
    const out = new Map<number, number>();
    for (const p of race?.pits ?? []) {
      out.set(p.driverNumber, (out.get(p.driverNumber) ?? 0) + 1);
    }
    return out;
  }, [race]);
  const topSpeed = useMemo(() => {
    const out = new Map<number, number>();
    for (const r of rows) {
      let best = 0;
      for (const l of r.laps) if (l.speed != null && l.speed > best) best = l.speed;
      if (best > 0) out.set(r.driverNumber, best);
    }
    return out;
  }, [rows]);

  // The provider's official classification, not a re-sort of its lap feed:
  // official timing deletes laps the feed still carries, so a lap-time sort
  // promotes laps that didn't count.
  const ordered = useMemo(() => orderByClassification(rows), [rows]);

  // Lapped cars get "+1 lap" rather than a blank gap: their last lap is short
  // of the winner's. DNFs are excluded — they stop early for other reasons.
  const lastLapOf = (r: F1ResultRow2) => (r.laps.length ? r.laps[r.laps.length - 1].lap : 0);
  const leaderLaps = ordered.reduce(
    (m, r) => (r.dnf ? m : Math.max(m, lastLapOf(r))),
    0
  );

  return (
    <TableShell minWidth={raceMode ? 900 : 720}>
      <Head>
        <th className="w-14 py-2 pl-2 font-semibold">Pos.</th>
        {raceMode &&        <th className="w-12 py-2 text-center font-semibold">Grid</th>}
        <th className="py-2 font-semibold">Driver</th>
        <th className="hidden py-2 font-semibold md:table-cell">Team</th>
        <th className={`${raceMode ? "w-24 pr-4" : "order-last"} py-2 pr-3 text-right font-semibold`}>Gap</th>
        <th className="py-2 pl-3 font-semibold">Tyres</th>
        {raceMode && <th className="w-16 py-2 text-right font-semibold">Stops</th>}
        <th className="w-28 py-2 text-right font-semibold">Best lap</th>
        <th className="hidden w-24 py-2 text-right font-semibold md:table-cell">Top speed</th>
        {raceMode && <th className="w-16 py-2 pr-2 text-right font-semibold">+/−</th>}
      </Head>
      <Body>
        {ordered.map((r, i) => {
          const isBest = r.best != null && sessionBest != null && r.best === sessionBest;
          const bestGap =
            r.best != null && sessionBest != null && r.best > sessionBest ? r.best - sessionBest : null;
          const raceGap = finalGap?.[r.driverNumber];
          const speed = topSpeed.get(r.driverNumber);
          const grid = race?.grid?.[r.driverNumber] ?? null;
          const delta = grid != null && r.position != null ? grid - r.position : null;
          return (
            <Row key={r.driverNumber}>
              <td className="py-1.5 pl-2 font-semibold tabular-nums">
                {raceMode ? (r.position ?? i + 1) : <PosCell row={r} n={i + 1} />}
              </td>
              {raceMode && (
                <td className="py-1.5 text-center tabular-nums text-white/70">
                  {grid ?? MISSING}
                </td>
              )}
              <td className="py-1.5">
                <DriverCell row={r} />
              </td>
              <td className="hidden py-1.5 text-white/70 md:table-cell">
                <span className="flex items-center gap-1.5">
                  <TeamMark team={r.teamName} size={13} tone="mono" />
                  {r.teamName}
                </span>
              </td>
              <td className="py-1.5 pr-3 text-right text-sm tabular-nums text-white/90">
                {raceMode ? (
                  r.dnf ? (
                    "DNF"
                  ) : r.position === 1 ? (
                    "Leader"
                  ) : leaderLaps - lastLapOf(r) >= 1 ? (
                    `+${leaderLaps - lastLapOf(r)} lap${leaderLaps - lastLapOf(r) > 1 ? "s" : ""}`
                  ) : raceGap != null && raceGap > 0 ? (
                    gapFmt(raceGap)
                  ) : (
                    "–"
                  )
                ) : r.officialGap != null ? (
                  // The reference leaves the practice/qualifying leader blank.
                  r.officialGap > 0 ? gapFmt(r.officialGap) : ""
                ) : bestGap != null ? (
                  gapFmt(bestGap)
                ) : (
                  ""
                )}
              </td>
              <td className="py-1.5">
                <span className="flex flex-wrap items-center gap-1">
                  {r.stints.length === 0 && MISSING}
                  {r.stints.map((s, k) => (
                    <span
                      key={`${s.compound ?? "unknown"}-${s.lapStart}-${k}`}
                      title={`${s.compound ?? "Unknown tyre"}, ${s.laps} laps`}
                      className="flex items-center gap-1 rounded-full border border-white/15 bg-[#101017]/80 py-0.5 pr-2 pl-1 text-[11px] font-semibold tabular-nums"
                    >
                      <TyreBadge compound={s.compound} size={16} />
                      {s.laps}
                    </span>
                  ))}
                </span>
              </td>
              {raceMode && (
                <td className="py-1.5 text-right tabular-nums text-white/70">
                  {stopsByDriver.get(r.driverNumber) ?? 0}
                </td>
              )}
              <td
                className={`py-1.5 text-right font-bold tabular-nums ${
                  isBest ? "text-fuchsia-400" : ""
                }`}
              >
                {r.best != null ? lapFmtF(r.best) : MISSING}
              </td>
              <td className="hidden py-1.5 text-right tabular-nums text-white/70 md:table-cell">
                {speed ? `${speed} km/h` : MISSING}
              </td>
              {raceMode && (
                <td className="py-1.5 pr-2 text-right text-xs font-semibold tabular-nums">
                  {delta == null || delta === 0 ? (
                    <span className="text-white/40">–</span>
                  ) : delta > 0 ? (
                    <span className="text-emerald-400">▲ {delta}</span>
                  ) : (
                    <span className="text-[#ff5a4f]">▼ {Math.abs(delta)}</span>
                  )}
                </td>
              )}
            </Row>
          );
        })}
      </Body>
    </TableShell>
  );
}

// -------------------------------- potential --------------------------------

export function PotentialDriversView({ rows }: { rows: F1ResultRow2[] }) {
  const model = useMemo(() => {
    const list = rows.map((r) => {
      const bests = sectorBests(r);
      return { row: r, ...bests, ideal: idealOf(bests) };
    });
    const sessionIdeal = list.reduce<number | null>(
      (m, v) => (v.ideal != null && (m == null || v.ideal < m) ? v.ideal : m),
      null
    );
    list.sort((a, b) => {
      if (a.ideal != null && b.ideal != null) return a.ideal - b.ideal;
      if (a.ideal != null) return -1;
      if (b.ideal != null) return 1;
      return a.row.acronym.localeCompare(b.row.acronym);
    });
    return { list, sessionIdeal };
  }, [rows]);

  return (
    <TableShell>
      <Head>
        <th className="w-14 py-2 pl-2 font-semibold">Pos.</th>
        <th className="py-2 font-semibold">Driver</th>
        <th className="hidden py-2 font-semibold md:table-cell">Team</th>
        <th className="w-24 py-2 text-right font-semibold">Sector 1</th>
        <th className="w-24 py-2 text-right font-semibold">Sector 2</th>
        <th className="w-24 py-2 text-right font-semibold">Sector 3</th>
        <th className="w-28 py-2 text-right font-semibold">Ideal lap</th>
        <th className="w-24 py-2 text-right font-semibold">Gap</th>
      </Head>
      <Body>
        {model.list.map(({ row, s1, s2, s3, ideal }, i) => (
          <Row key={row.driverNumber}>
            <td className="py-1.5 pl-2 font-semibold tabular-nums">{i + 1}</td>
            <td className="py-1.5">
              <DriverCell row={row} />
            </td>
            <td className="hidden py-1.5 text-white/70 md:table-cell">
              <span className="flex items-center gap-1.5">
                <TeamMark team={row.teamName} size={13} tone="mono" />
                {row.teamName}
              </span>
            </td>
            {[s1, s2, s3].map((v, k) => (
              <td key={k} className="py-1.5 text-right text-xs text-white/70 tabular-nums">
                {v != null ? v.toFixed(3) : MISSING}
              </td>
            ))}
            <td
              className={`py-1.5 text-right font-bold tabular-nums ${
                ideal != null && ideal === model.sessionIdeal ? "text-fuchsia-400" : ""
              }`}
            >
              {ideal != null ? lapFmtF(ideal) : MISSING}
            </td>
            <td className="py-1.5 text-right text-xs text-white/55 tabular-nums">
              {ideal != null && model.sessionIdeal != null && ideal > model.sessionIdeal
                ? gapFmt(ideal - model.sessionIdeal)
                : ""}
            </td>
          </Row>
        ))}
      </Body>
    </TableShell>
  );
}

export function PotentialTeamsView({ rows }: { rows: F1ResultRow2[] }) {
  const model = useMemo(() => {
    const teams = new Map<
      string,
      { name: string; colour: string; drivers: F1ResultRow2[]; s1: number | null; s2: number | null; s3: number | null }
    >();
    for (const r of rows) {
      const key = r.teamName;
      const entry =
        teams.get(key) ??
        { name: key, colour: teamHex(r), drivers: [] as F1ResultRow2[], s1: null, s2: null, s3: null };
      entry.drivers.push(r);
      const b = sectorBests(r);
      entry.s1 = b.s1 != null && (entry.s1 == null || b.s1 < entry.s1) ? b.s1 : entry.s1;
      entry.s2 = b.s2 != null && (entry.s2 == null || b.s2 < entry.s2) ? b.s2 : entry.s2;
      entry.s3 = b.s3 != null && (entry.s3 == null || b.s3 < entry.s3) ? b.s3 : entry.s3;
      teams.set(key, entry);
    }
    const list = [...teams.values()].map((t) => ({ ...t, ideal: idealOf(t) }));
    list.sort((a, b) => {
      if (a.ideal != null && b.ideal != null) return a.ideal - b.ideal;
      if (a.ideal != null) return -1;
      if (b.ideal != null) return 1;
      return a.name.localeCompare(b.name);
    });
    return { list, best: list.find((t) => t.ideal != null)?.ideal ?? null };
  }, [rows]);

  return (
    <TableShell>
      <Head>
        <th className="w-14 py-2 pl-2 font-semibold">Pos.</th>
        <th className="py-2 font-semibold">Team</th>
        <th className="hidden py-2 font-semibold sm:table-cell">Drivers</th>
        <th className="w-24 py-2 text-right font-semibold">Sector 1</th>
        <th className="w-24 py-2 text-right font-semibold">Sector 2</th>
        <th className="w-24 py-2 text-right font-semibold">Sector 3</th>
        <th className="w-28 py-2 text-right font-semibold">Ideal lap</th>
        <th className="w-24 py-2 text-right font-semibold">Gap</th>
      </Head>
      <Body>
        {model.list.map((t, i) => (
          <Row key={t.name}>
            <td className="py-1.5 pl-2 font-semibold tabular-nums">{i + 1}</td>
            <td className="py-1.5">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-4 w-1 shrink-0 rounded-sm"
                  style={{ background: t.colour }}
                />
                <span className="font-semibold" style={{ color: t.colour }}>
                  {t.name}
                </span>
              </span>
            </td>
            <td className="hidden py-1.5 text-xs text-white/55 sm:table-cell">
              {t.drivers.map((d) => d.acronym).join(" · ")}
            </td>
            {[t.s1, t.s2, t.s3].map((v, k) => (
              <td key={k} className="py-1.5 text-right text-xs text-white/70 tabular-nums">
                {v != null ? v.toFixed(3) : MISSING}
              </td>
            ))}
            <td
              className={`py-1.5 text-right font-bold tabular-nums ${
                t.ideal != null && t.ideal === model.best ? "text-fuchsia-400" : ""
              }`}
            >
              {t.ideal != null ? lapFmtF(t.ideal) : MISSING}
            </td>
            <td className="py-1.5 text-right text-xs text-white/55 tabular-nums">
              {t.ideal != null && model.best != null && t.ideal > model.best ? gapFmt(t.ideal - model.best) : ""}
            </td>
          </Row>
        ))}
      </Body>
    </TableShell>
  );
}

// ------------------------------ fastest laps -------------------------------

export function FastestLapsView({
  rows,
  sessionBest,
}: {
  rows: F1ResultRow2[];
  sessionBest: number | null;
}) {
  const list = useMemo(() => {
    const laps = rows.flatMap((row) =>
      timedLaps(row).map((lap) => ({ row, lap }))
    );
    laps.sort((a, b) => a.lap.time - b.lap.time);
    return laps.slice(0, 20);
  }, [rows]);

  if (!list.length) return <EmptyView>No timed laps in this session yet.</EmptyView>;
  const best = list[0].lap.time;

  return (
    <TableShell>
      <Head>
        <th className="w-14 py-2 pl-2 font-semibold">Pos.</th>
        <th className="py-2 font-semibold">Driver</th>
        <th className="hidden py-2 font-semibold md:table-cell">Team</th>
        <th className="w-20 py-2 text-right font-semibold">Lap</th>
        <th className="w-28 py-2 text-right font-semibold">Time</th>
        <th className="w-24 py-2 text-right font-semibold">Gap</th>
      </Head>
      <Body>
        {list.map(({ row, lap }, i) => {
          const head = i === 0;
          return (
            <tr
              key={`${row.driverNumber}-${lap.lap}-${i}`}
              style={head ? { backgroundColor: "#a21caf" } : undefined}
              className={
                head ? "text-white" : "border-t border-white/[0.08] hover:bg-white/[0.06]"
              }
            >
              <td className={`py-1.5 pl-2 font-semibold tabular-nums ${head ? "text-white" : ""}`}>
                {i + 1}
              </td>
              <td className="py-1.5">
                <DriverCell row={row} />
              </td>
              <td className={`hidden py-1.5 md:table-cell ${head ? "text-white/90" : "text-white/70"}`}>
                <span className="flex items-center gap-1.5">
                  <TeamMark team={row.teamName} size={13} tone="mono" />
                  {row.teamName}
                </span>
              </td>
              <td className={`py-1.5 text-right tabular-nums ${head ? "text-white" : "text-white/70"}`}>
                {lap.lap}
              </td>
              <td className="py-1.5 text-right font-bold tabular-nums">{lapFmtF(lap.time)}</td>
              <td
                className={`py-1.5 text-right text-xs tabular-nums ${
                  head ? "text-white/80" : "text-white/55"
                }`}
              >
                {head ? "" : sessionBest != null ? gapFmt(lap.time - best) : ""}
              </td>
            </tr>
          );
        })}
      </Body>
    </TableShell>
  );
}

// --------------------------- lap time evolution ----------------------------

/** Team colour, nudged per teammate so the two cars never share a line colour. */
function driverColours(rows: F1ResultRow2[]): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Map<string, number>();
  const FALLBACK = ["#f0ad4e", "#74edac", "#c174ed", "#ef24ee", "#ed7488", "#9e69ff", "#e2e2e2"];
  let fb = 0;
  for (const r of rows) {
    const base = teamHex(r);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    out.set(r.driverNumber, n === 0 ? base : FALLBACK[fb++ % FALLBACK.length]);
  }
  return out;
}

const SESSION_TREND_KEY = "Session trend";

export function LapTimeEvolutionView({ rows }: { rows: F1ResultRow2[] }) {
  // The reference's lap filters: clean laps only, an outlier cutoff, and a
  // dashed trend line across whatever is visible.
  const [clean, setClean] = useState(true);
  const [cutoff, setCutoff] = useState(107);
  // The reference marks each driver's personal best with an enlarged dot.
  const [personalBests, setPersonalBests] = useState(false);
  // Trend line: off, one line per driver, or one line across the session.
  const [trend, setTrend] = useState<"off" | "driver" | "session">("off");
  // Held with the rows it belongs to, so switching sessions can't leave
  // another session's drivers hidden.
  const [hidden, setHidden] = useState<{ rows: F1ResultRow2[]; set: Set<number> } | null>(null);

  const model = useMemo(() => {
    const colours = driverColours(rows);
    const perDriver = new Map<number, Map<number, number>>();
    const lapNumbers = new Set<number>();
    const order: F1ResultRow2[] = [];
    for (const row of rows) {
      const timed = row.laps.filter((l): l is TimedLap => l.time != null && !l.deleted);
      if (!timed.length) continue;
      const best = Math.min(...timed.map((l) => l.time));
      const laps = new Map<number, number>();
      for (const l of timed) {
        if (clean && (l.pitOut || l.time > best * (cutoff / 100))) continue;
        laps.set(l.lap, l.time);
        lapNumbers.add(l.lap);
      }
      if (!laps.size) continue;
      perDriver.set(row.driverNumber, laps);
      order.push(row);
    }
    // Fastest first — the rail's first three are the reference's free tier.
    order.sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
    return { colours, perDriver, order, laps: [...lapNumbers].sort((a, b) => a - b) };
  }, [rows, clean, cutoff]);

  // Every driver is selectable — no premium gate. The chart still opens on the
  // top ten for legibility; All reveals the rest.
  const defaultHidden = useMemo(
    () => new Set(model.order.slice(10).map((d) => d.driverNumber)),
    [model.order]
  );
  const hiddenSet = hidden && hidden.rows === rows ? hidden.set : defaultHidden;
  const shown = model.order.filter((d) => !hiddenSet.has(d.driverNumber));

  const { chartRows, series, xTicks, maxLap } = useMemo(() => {
    const chartRows = model.laps.map((lap) => {
      const row: Record<string, number | string | undefined> = { x: lap };
      for (const d of shown) {
        const t = model.perDriver.get(d.driverNumber)?.get(lap);
        if (t != null) row[d.acronym] = t;
      }
      return row;
    });
    const lines: {
      key: string;
      colour: string;
      dashed?: boolean;
      omitFromTooltip?: boolean;
    }[] = shown.map((d) => ({
      key: d.acronym,
      colour: model.colours.get(d.driverNumber) ?? "#ffffff",
    }));

    /** Least-squares fit through lap number → lap time. */
    const fit = (pts: { x: number; y: number }[]) => {
      if (pts.length < 3) return null;
      const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      let num = 0;
      let den = 0;
      for (const p of pts) {
        num += (p.x - mx) * (p.y - my);
        den += (p.x - mx) ** 2;
      }
      if (!(den > 0)) return null;
      const b = num / den;
      return { a: my - b * mx, b };
    };

    if (trend === "driver") {
      for (const d of shown) {
        const laps = model.perDriver.get(d.driverNumber);
        if (!laps?.size) continue;
        const line = fit([...laps].map(([lap, t]) => ({ x: lap, y: t })));
        if (!line) continue;
        const key = `${d.acronym} trend`;
        for (const row of chartRows) row[key] = line.a + line.b * Number(row.x);
        lines.push({
          key,
          colour: model.colours.get(d.driverNumber) ?? "#ffffff",
          dashed: true,
          omitFromTooltip: true,
        });
      }
    } else if (trend === "session") {
      const pts: { x: number; y: number }[] = [];
      for (const d of shown) {
        for (const [lap, t] of model.perDriver.get(d.driverNumber) ?? new Map<number, number>()) {
          pts.push({ x: lap, y: t });
        }
      }
      const line = fit(pts);
      if (line) {
        for (const row of chartRows) row[SESSION_TREND_KEY] = line.a + line.b * Number(row.x);
        lines.push({
          key: SESSION_TREND_KEY,
          colour: "#d8d8de",
          dashed: true,
          omitFromTooltip: true,
        });
      }
    }

    const step = Math.max(1, Math.ceil(model.laps.length / 10));
    return {
      chartRows,
      series: lines,
      xTicks: model.laps.filter((_, i) => i % step === 0),
      maxLap: model.laps.length ? model.laps[model.laps.length - 1] : 0,
    };
  }, [model, shown, trend]);

  const pbMarkers = useMemo(() => {
    if (!personalBests) return [];
    return shown.flatMap((d) => {
      const laps = model.perDriver.get(d.driverNumber);
      if (!laps?.size) return [];
      let bestLap = 0;
      let bestTime = Infinity;
      for (const [lap, t] of laps) {
        if (t < bestTime) {
          bestTime = t;
          bestLap = lap;
        }
      }
      return [
        {
          x: bestLap,
          y: bestTime,
          colour: model.colours.get(d.driverNumber) ?? "#ffffff",
          key: d.acronym,
        },
      ];
    });
  }, [personalBests, shown, model]);

  if (!model.order.length)
    return <EmptyView>No timed laps to plot for this session yet.</EmptyView>;

  const toggle = (driverNumber: number) => {
    const next = new Set(hiddenSet);
    if (next.has(driverNumber)) next.delete(driverNumber);
    else next.add(driverNumber);
    setHidden({ rows, set: next });
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-white/[0.08] bg-black/25 px-2.5 py-2">
        <span className="text-[10px] font-bold tracking-[0.14em] text-white/45 uppercase">
          Lap filters
        </span>
        <button
          type="button"
          aria-pressed={clean}
          onClick={() => setClean((v) => !v)}
          className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            clean
              ? "bg-[#e10600] font-semibold text-white"
              : "border border-white/12 text-white/60 hover:border-white/30 hover:text-white"
          }`}
        >
          Clean laps
        </button>
        <label className={`flex items-center gap-2 text-[11px] text-white/70 ${clean ? "" : "opacity-40"}`}>
          Outlier cutoff
          <input
            type="range"
            min={100}
            max={115}
            step={1}
            value={cutoff}
            disabled={!clean}
            onChange={(e) => setCutoff(Number(e.target.value))}
            aria-label="Outlier cutoff"
            className="h-1 w-24 cursor-pointer accent-red-500 disabled:cursor-not-allowed"
          />
          <span className="w-9 font-semibold tabular-nums text-white">{cutoff}%</span>
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={personalBests}
          onClick={() => setPersonalBests((v) => !v)}
          className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            personalBests
              ? "bg-[#e10600] font-semibold text-white"
              : "border border-white/12 text-white/60 hover:border-white/30 hover:text-white"
          }`}
        >
          Personal bests
        </button>
        <div className="flex items-center gap-1 text-[11px] text-white/70">
          <span className="mr-1 text-white/55">Trend line</span>
          {(
            [
              { id: "off", label: "Off" },
              { id: "driver", label: "Driver" },
              { id: "session", label: "Session" },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              aria-pressed={trend === mode.id}
              onClick={() => setTrend(mode.id)}
              className={`cursor-pointer rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                trend === mode.id
                  ? "bg-[#e10600] font-semibold text-white"
                  : "border border-white/12 text-white/60 hover:border-white/30 hover:text-white"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 w-full">
          <ChartKit
            className="h-[560px]"
            rows={chartRows}
            series={series}
            xKey="x"
            yLabel="Lap time"
            ranked
            grid
            lineType="linear"
            bottomInset={22}
            xTicks={xTicks}
            tickFmtX={(v) => String(v)}
            tickFmtY={axisSecF}
            valueFmt={(v) => lapFmtF(v)}
            tooltipTitle={(row) => `Lap ${row.x}`}
            pbMarkers={pbMarkers}
          />
        </div>

        {/* The reference's right-hand drivers rail: All/None plus a two-column
            headshot list; toggling a row adds or removes that series at once. */}
        <aside
          aria-label="Drivers"
          className="min-w-0 rounded-lg border border-white/[0.08] bg-black/25 p-2"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-white/[0.07] pb-1.5">
            <p className="text-[10px] font-bold tracking-[0.14em] text-white/45 uppercase">
              Drivers
            </p>
            <div className="flex items-center gap-2 text-[10px] font-semibold">
              <button
                type="button"
                onClick={() => setHidden({ rows, set: new Set() })}
                className="cursor-pointer text-white/70 transition-colors hover:text-white"
              >
                All
              </button>
              <span aria-hidden="true" className="text-white/30">
                ·
              </span>
              <button
                type="button"
                onClick={() =>
                  setHidden({ rows, set: new Set(model.order.map((d) => d.driverNumber)) })
                }
                className="cursor-pointer text-white/70 transition-colors hover:text-white"
              >
                None
              </button>
            </div>
          </div>

          <div className="grid max-h-[520px] grid-cols-2 gap-1 overflow-y-auto pr-1 lg:max-h-[512px]">
            {model.order.map((d) => {
              const off = hiddenSet.has(d.driverNumber);
              const colour = model.colours.get(d.driverNumber) ?? "#ffffff";
              return (
                <button
                  key={d.driverNumber}
                  type="button"
                  aria-pressed={!off}
                  onClick={() => toggle(d.driverNumber)}
                  title={`${off ? "Show" : "Hide"} ${d.fullName}`}
                  className={`flex min-w-0 cursor-pointer items-center gap-1.5 rounded border px-1.5 py-1 text-left transition-colors focus-visible:ring-2 focus-visible:ring-[#e10600] focus-visible:outline-none ${
                    off
                      ? "border-transparent text-white/40 hover:border-white/10"
                      : "border-white/[0.08] bg-white/[0.06] text-white"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full"
                    style={{ backgroundColor: colour, opacity: off ? 0.45 : 1 }}
                  >
                    {d.headshotUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.headshotUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover object-top"
                      />
                    )}
                  </span>
                  <span className="truncate text-[10px] font-semibold">{d.acronym}</span>
                </button>
              );
            })}
          </div>

        </aside>
      </div>

      <p className="mt-2 text-[11px] text-white/40">
        {clean
          ? `Racing laps only (pit laps and laps outside ${cutoff}% of the driver's best are dropped)`
          : "Every timed lap, pit laps included"}{" "}
        — {shown.length} of {model.order.length} drivers shown over {maxLap} laps.
      </p>
    </div>
  );
}

// -------------------------------- top speed --------------------------------

export function TopSpeedView({ rows }: { rows: F1ResultRow2[] }) {
  const list = useMemo(() => {
    return rows
      .map((row) => {
        let best: F1LapRow | null = null;
        for (const l of row.laps) {
          if (l.speed == null) continue;
          if (best == null || l.speed > (best.speed ?? 0)) best = l;
        }
        return { row, lap: best };
      })
      .filter((e) => e.lap != null)
      .sort((a, b) => (b.lap!.speed ?? 0) - (a.lap!.speed ?? 0));
  }, [rows]);

  const tip = useChartTip();
  const [hover, setHover] = useState<number | null>(null);

  if (!list.length) return <EmptyView>No speed-trap readings for this session yet.</EmptyView>;

  const speeds = list.map((e) => e.lap!.speed as number);
  const top = speeds[0];
  const W = 1120;
  const H = 400;
  const padL = 74;
  const padR = 18;
  const padT = 22;
  const padB = 64;
  const lo = Math.floor((Math.min(...speeds) - 4) / 5) * 5;
  const hi = Math.ceil((top + 3) / 5) * 5;
  const colW = (W - padL - padR) / Math.max(1, list.length);
  const cx = (i: number) => padL + colW * (i + 0.5);
  const py = (v: number) => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / 5) * 5; v <= hi; v += 5) ticks.push(v);
  if (ticks[ticks.length - 1] !== hi) ticks.push(hi);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
    const i = Math.floor((p.x - padL) / colW);
    const entry = list[i];
    if (!entry || p.x < padL || p.x > W - padR) {
      setHover(null);
      tip.hide();
      return;
    }
    setHover(i);
    const speed = entry.lap!.speed as number;
    tip.show(e.clientX, e.clientY, {
      title: entry.row.acronym,
      note: entry.row.teamName,
      rows: [
        { label: "Top speed", value: `${speed} km/h`, colour: teamHex(entry.row) },
        { label: "Lap", value: String(entry.lap!.lap) },
        {
          label: "Gap to fastest",
          value: i === 0 ? "fastest" : `−${top - speed} km/h`,
          tone: i === 0 ? "up" : "muted",
        },
      ],
    });
  };

  return (
    <div ref={tip.wrapRef} className="relative">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Top speed per driver, highest first"
          className="h-auto w-full min-w-[720px] touch-pan-y"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => {
            setHover(null);
            tip.hide();
          }}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={py(v)} y2={py(v)} stroke="#24242e" strokeWidth={1} />
              <text x={padL - 12} y={py(v) + 3.5} textAnchor="end" fontSize="10" fill="#8a8a93">
                {v} km/h
              </text>
            </g>
          ))}

          {hover != null && (
            <rect
              x={cx(hover) - colW / 2}
              y={padT}
              width={colW}
              height={H - padT - padB}
              fill="rgba(255,255,255,0.045)"
              pointerEvents="none"
            />
          )}

          {list.map(({ row, lap }, i) => {
            const speed = lap!.speed as number;
            const colour = teamHex(row);
            const y = py(speed);
            const isTop = i === 0;
            const active = hover === i;
            const label = String(speed);
            const bw = label.length * 7 + 14;
            return (
              <g key={row.driverNumber}>
                {/* The reference draws solid columns from the axis floor, not
                    stems with dots: the bar top IS the reading. */}
                <rect
                  x={cx(i) - Math.min(14, colW * 0.31)}
                  y={y}
                  width={Math.min(28, colW * 0.62)}
                  height={Math.max(1, H - padB - y)}
                  rx={2}
                  fill={isTop ? "#a21caf" : colour}
                  opacity={active ? 1 : 0.95}
                />
                <rect
                  x={cx(i) - bw / 2}
                  y={y - 28}
                  width={bw}
                  height={18}
                  rx={4}
                  fill={isTop ? "#a21caf" : "rgba(13,17,26,0.72)"}
                  stroke={isTop ? "#d8b4fe" : "#33333f"}
                  strokeWidth={1}
                />
                <text
                  x={cx(i)}
                  y={y - 15.5}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill={isTop ? "#ffffff" : "#f2f2f5"}
                >
                  {label}
                </text>
                <DriverDisc
                  x={cx(i)}
                  y={H - padB + 22}
                  r={11}
                  colour={colour}
                  href={row.headshotUrl}
                  label={row.acronym}
                />
                <text
                  x={cx(i)}
                  y={H - padB + 44}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill={colour}
                >
                  {row.acronym}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ChartTip tip={tip.tip} />
      <p className="mt-2 text-[11px] text-white/40">
        Each driver&apos;s fastest speed-trap reading, highest first. The purple label is the fastest
        trap speed of the session; the headshot row reads left to right in the same order.
      </p>
    </div>
  );
}

// ---------------------------- speed vs lap time ----------------------------

/**
 * The reference plots one headshot per driver — best lap time against that
 * driver's speed-trap reading — with the fastest lap on the right, and labels
 * each marker with the team name.
 */
export function SpeedVsLapTimeView({ rows }: { rows: F1ResultRow2[] }) {
  const points = useMemo(() => {
    const out: {
      row: F1ResultRow2;
      lap: number;
      time: number;
      speed: number;
      colour: string;
    }[] = [];
    for (const row of rows) {
      let best: TimedLap | null = null;
      for (const l of timedLaps(row)) if (best == null || l.time < best.time) best = l;
      if (!best) continue;
      // The reference pairs each driver's best lap with that driver's top
      // speed-trap reading (not necessarily from the same lap).
      let speed = 0;
      for (const l of row.laps) if (l.speed != null && l.speed > speed) speed = l.speed;
      if (!speed) continue;
      out.push({ row, lap: best.lap, time: best.time, speed, colour: teamHex(row) });
    }
    return out;
  }, [rows]);

  const tip = useChartTip();
  const [hover, setHover] = useState<number | null>(null);

  if (!points.length) return <EmptyView>No laps with speed-trap data for this session yet.</EmptyView>;

  const W = 1120;
  const H = 520;
  const padL = 82;
  const padR = 34;
  const padT = 34;
  const padB = 52;

  const times = points.map((p) => p.time);
  const speeds = points.map((p) => p.speed);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const minS = Math.min(...speeds);
  const maxS = Math.max(...speeds);
  const spanT = maxT - minT || 1;
  const spanS = maxS - minS || 1;
  // Fastest lap on the right, like the reference.
  const px = (t: number) => W - padR - ((t - minT) / spanT) * (W - padL - padR);
  const py = (v: number) => H - padB - ((v - minS) / spanS) * (H - padT - padB);

  // Whole/half-second ticks, as the reference uses, instead of an even split
  // of the data range (which lands on 1:39.979-style values).
  const xStep = spanT > 6 ? 2 : spanT > 2 ? 1 : 0.5;
  const xTicks: number[] = [];
  for (let t = Math.ceil(minT / xStep) * xStep; t <= maxT + 1e-9; t += xStep) {
    xTicks.push(Number(t.toFixed(3)));
  }
  const yTicks = Array.from({ length: 5 }, (_, i) => minS + (spanS * i) / 4);
  // Milliseconds on the axis: whole-second ticks collapse into duplicates on a
  // 3-second practice spread.
  const tickFmt = (t: number) =>
    `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, "0")}`;

  return (
    <div ref={tip.wrapRef} className="relative">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Best lap time against speed-trap speed for every driver"
          className="h-auto w-full min-w-[720px] touch-pan-y"
          onPointerLeave={() => {
            setHover(null);
            tip.hide();
          }}
        >
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line
                x1={padL}
                x2={W - padR}
                y1={py(t)}
                y2={py(t)}
                stroke="#24242e"
                strokeWidth={1}
              />
              <text x={padL - 10} y={py(t) + 3.5} textAnchor="end" fontSize="10" fill="#8a8a93">
                {Math.round(t)} km/h
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x${t}`}>
              <line x1={px(t)} x2={px(t)} y1={padT} y2={H - padB} stroke="#26262f" strokeWidth={1} />
              <text
                x={px(t)}
                y={H - padB + 18}
                textAnchor="middle"
                fontSize="10"
                fill="#8a8a93"
              >
                {tickFmt(t)}
              </text>
            </g>
          ))}
          <text
            x={14}
            y={padT + (H - padT - padB) / 2}
            transform={`rotate(-90 14 ${padT + (H - padT - padB) / 2})`}
            textAnchor="middle"
            fontSize="10"
            fill="#8a8a93"
          >
            Speed trap (faster at the top)
          </text>

          {points.map((p, i) => {
            const x = px(p.time);
            const y = py(p.speed);
            const active = hover === i;
            const label = p.row.teamName;
            const bw = Math.min(150, label.length * 5.6 + 12);
            return (
              <g
                key={p.row.driverNumber}
                onPointerEnter={() => {
                  setHover(i);
                  tip.show(0, 0, {
                    title: p.row.acronym,
                    note: p.row.teamName,
                    rows: [
                      { label: "Best lap", value: lapFmtF(p.time), colour: p.colour },
                      { label: "Lap", value: String(p.lap) },
                      { label: "Speed trap", value: `${p.speed} km/h` },
                    ],
                  });
                }}
                onPointerMove={(e) => {
                  setHover(i);
                  tip.show(e.clientX, e.clientY, {
                    title: p.row.acronym,
                    note: p.row.teamName,
                    rows: [
                      { label: "Best lap", value: lapFmtF(p.time), colour: p.colour },
                      { label: "Lap", value: String(p.lap) },
                      { label: "Speed trap", value: `${p.speed} km/h` },
                    ],
                  });
                }}
                className="cursor-pointer"
              >
                {active && (
                  <circle cx={x} cy={y} r={20} fill={p.colour} fillOpacity={0.16} stroke={p.colour} strokeOpacity={0.5} />
                )}
                <DriverDisc
                  x={x}
                  y={y}
                  r={13}
                  colour={p.colour}
                  href={p.row.headshotUrl}
                  label={p.row.acronym}
                />
                <rect
                  x={x - bw / 2}
                  y={y + 17}
                  width={bw}
                  height={15}
                  rx={3}
                  fill={p.colour}
                  fillOpacity={active ? 1 : 0.9}
                />
                <text
                  x={x}
                  y={y + 27.5}
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="700"
                  fill="#101017"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ChartTip tip={tip.tip} />
      <p className="mt-2 text-[11px] text-white/40">
        One headshot per driver — best lap time on the x axis (fastest on the right), speed-trap
        reading on the y axis. Hover a marker for the driver, lap and reading.
      </p>
    </div>
  );
}

// ------------------------------ lap time matrix ----------------------------

export function LapTimeMatrixView({
  rows,
  maxLap,
  sessionBest,
}: {
  rows: F1ResultRow2[];
  maxLap: number;
  sessionBest: number | null;
}) {
  const laps = useMemo(() => Array.from({ length: maxLap }, (_, i) => i + 1), [maxLap]);

  /** Fastest time per lap column — tinted fuchsia, like the classification. */
  const columnBests = useMemo(() => {
    const out = new Map<number, number>();
    for (const r of rows) {
      for (const l of timedLaps(r)) {
        const cur = out.get(l.lap);
        if (cur == null || l.time < cur) out.set(l.lap, l.time);
      }
    }
    return out;
  }, [rows]);

  if (!rows.length) return <EmptyView>No laps in this session yet.</EmptyView>;

  return (
    <div className="max-h-[560px] overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-[11px]">
        <thead>
          <tr className="text-[10px] font-bold text-white/40 uppercase">
            <th className="sticky left-0 z-20 border-b border-white/[0.08] bg-[#15151d] px-2 py-1.5 text-left font-bold tracking-[0.12em]">
              Driver
            </th>
            {laps.map((n) => (
              <th key={n} className="min-w-[64px] border-b border-white/[0.08] bg-[#15151d] px-1 py-1.5 text-center font-bold tabular-nums">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const byLap = new Map(timedLaps(r).map((l) => [l.lap, l]));
            const own = r.best;
            return (
              <tr key={r.driverNumber} className="hover:bg-white/[0.04]">
                <td className="sticky left-0 z-10 border-b border-white/[0.05] bg-[#15151d] px-2 py-1">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-3.5 w-1 rounded-sm" style={{ background: teamHex(r) }} />
                    <span className="font-semibold" style={{ color: teamHex(r) }}>
                      {r.acronym}
                    </span>
                  </span>
                </td>
                {laps.map((n) => {
                  const l = byLap.get(n);
                  if (!l) {
                    return (
                      <td key={n} className="border-b border-white/[0.07] px-1 py-1 text-center text-white/15">
                        ·
                      </td>
                    );
                  }
                  const isColumn = columnBests.get(n) === l.time;
                  const isOwn = own != null && l.time === own;
                  return (
                    <td
                      key={n}
                      title={`${r.acronym} · lap ${n} · ${lapFmtF(l.time)}${
                        l.compound ? ` · ${l.compound}` : ""
                      }`}
                      className={`border-b border-white/[0.07] px-1 py-1 text-center whitespace-nowrap tabular-nums ${
                        isColumn ? "font-bold text-fuchsia-400" : isOwn ? "font-semibold text-emerald-300" : "text-white/70"
                      }`}
                      style={
                        l.compound
                          ? {
                              backgroundColor:
                                l.compound.toUpperCase() === "SOFT"
                                  ? "rgba(239,68,68,0.10)"
                                  : l.compound.toUpperCase() === "MEDIUM"
                                    ? "rgba(247,195,52,0.10)"
                                    : l.compound.toUpperCase() === "HARD"
                                      ? "rgba(229,231,235,0.08)"
                                      : "rgba(16,185,129,0.10)",
                            }
                          : undefined
                      }
                    >
                      {l.time.toFixed(3)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-white/40">
        Fuchsia = fastest lap of that column, green = the driver&apos;s own best
        {sessionBest != null ? ` (session best ${lapFmtF(sessionBest)})` : ""}. Cell tint marks the
        tyre compound.
      </p>
    </div>
  );
}

// ------------------------------- weather trend -----------------------------

// ------------------------------- weather trend -----------------------------

type WeatherRow = {
  x: number;
  air?: number;
  track?: number;
  humidity?: number;
  wind?: number;
  rain?: number;
  dir?: number;
  pressure?: number;
};

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];
const compass = (deg: number) => COMPASS[Math.round((deg % 360) / 22.5) % 16];

/** Round-number axis ticks (1 / 2 / 2.5 / 5 × 10^n), like the reference axes. */
function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 1e-6; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

function xLabel(min: number) {
  if (min < 60) return `${Math.max(0, Math.round(min))} min`;
  return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`;
}

/** One small multiple. Each panel owns its scale, cursor and tooltip. */
function WeatherPanel({
  title,
  unit,
  rows,
  series,
  area = false,
  rain = false,
  ticks,
  tickFmt,
  valueFmt,
}: {
  title: string;
  unit: string;
  rows: WeatherRow[];
  series: { key: keyof WeatherRow; colour: string; label: string }[];
  area?: boolean;
  rain?: boolean;
  ticks?: number[];
  tickFmt?: (v: number) => string;
  valueFmt: (v: number) => string;
}) {
  const tip = useChartTip();
  const [hover, setHover] = useState<number | null>(null);

  const W = 600;
  const H = 250;
  const padL = 64; // room for wide 5–6 character ticks in the F1 face
  const padR = 16;
  const padT = 44;
  const padB = 30;
  const x0 = rows.length ? rows[0].x : 0;
  const x1 = rows.length ? rows[rows.length - 1].x : 1;
  const px = (x: number) => padL + ((x - x0) / Math.max(1, x1 - x0)) * (W - padL - padR);

  const values = series.flatMap((s) =>
    rows.map((r) => r[s.key] as number | undefined).filter((v): v is number => v != null)
  );
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 1;
  if (rain) {
    lo = 0;
    hi = 1;
  } else if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  } else {
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
  }
  const yTicks = ticks ?? niceTicks(lo, hi, 4);
  const py = (v: number) => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);
  const xTicks = Array.from({ length: 6 }, (_, i) => x0 + ((x1 - x0) * i) / 5);

  const latest = (key: keyof WeatherRow): number | null => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const v = rows[i][key] as number | undefined;
      if (v != null) return v;
    }
    return null;
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e.clientX, e.clientY);
    if (p.x < padL || p.x > W - padR) {
      setHover(null);
      tip.hide();
      return;
    }
    let best = -1;
    let bestD = Infinity;
    rows.forEach((r, i) => {
      const d = Math.abs(px(r.x) - p.x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const row = rows[best];
    if (!row) return;
    setHover(best);
    tip.show(e.clientX, e.clientY, {
      title,
      note: xLabel(row.x),
      rows: series
        .map((s) => {
          const v = row[s.key] as number | undefined;
          return v == null
            ? null
            : { label: s.label, value: valueFmt(v), colour: s.colour };
        })
        .filter((v): v is { label: string; value: string; colour: string } => v != null),
    });
  };

  const line = (key: keyof WeatherRow) => {
    const pts = rows
      .map((r, i) => ({ i, v: r[key] as number | undefined }))
      .filter((p): p is { i: number; v: number } => p.v != null);
    if (!pts.length) return "";
    return (
      pts
        .map((p, k) => `${k === 0 ? "M" : "L"}${px(rows[p.i].x).toFixed(1)},${py(p.v).toFixed(1)}`)
        .join(" ") + (rain ? "" : "")
    );
  };
  const areaPath = (key: keyof WeatherRow) => {
    const pts = rows
      .map((r, i) => ({ i, v: r[key] as number | undefined }))
      .filter((p): p is { i: number; v: number } => p.v != null);
    if (pts.length < 2) return null;
    const top = pts.map((p, k) => `${k === 0 ? "M" : "L"}${px(rows[p.i].x).toFixed(1)},${py(p.v).toFixed(1)}`).join(" ");
    return `${top} L${px(rows[pts[pts.length - 1].i].x).toFixed(1)},${(H - padB).toFixed(1)} L${px(rows[pts[0].i].x).toFixed(1)},${(H - padB).toFixed(1)} Z`;
  };

  return (
    <div ref={tip.wrapRef} className="relative rounded-xl border border-white/[0.08] bg-black/25 p-3">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-white">{title}</p>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-white/70">
          {series.map((s) => {
            const v = latest(s.key);
            return (
              <span key={String(s.key)} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-0.5 w-4" style={{ backgroundColor: s.colour }} />
                <span className="text-white/55">{s.label}</span>
                <span className="font-semibold text-white">
                  {v != null ? valueFmt(v) : "—"}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title} across the session`}
          className="h-auto w-full touch-pan-y"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => {
            setHover(null);
            tip.hide();
          }}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={py(v)} y2={py(v)} stroke="#24242e" strokeWidth={1} />
              <text x={padL - 8} y={py(v) + 3.5} textAnchor="end" fontSize="9.5" fill="#8a8a93">
                {tickFmt ? tickFmt(v) : v.toFixed(1)}
              </text>
            </g>
          ))}
          <text
            x={14}
            y={padT + (H - padT - padB) / 2}
            textAnchor="middle"
            fontSize="9"
            fill="#8a8a93"
            transform={`rotate(-90 14 ${padT + (H - padT - padB) / 2})`}
          >
            {unit}
          </text>
          {xTicks.map((x) => (
            <text key={x} x={px(x)} y={H - 10} textAnchor="middle" fontSize="9" fill="#8a8a93">
              {xLabel(x)}
            </text>
          ))}

          {series.map((s) =>
            area && !rain ? (
              <path key={`a-${String(s.key)}`} d={areaPath(s.key) ?? ""} fill={s.colour} fillOpacity={0.16} stroke="none" />
            ) : null
          )}
          {series.map((s) => (
            <path
              key={`l-${String(s.key)}`}
              d={line(s.key)}
              pathLength={1}
              className="f1-draw"
              fill="none"
              stroke={s.colour}
              strokeWidth={1.7}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {hover != null && rows[hover] && (
            <g pointerEvents="none">
              <line
                x1={px(rows[hover].x)}
                x2={px(rows[hover].x)}
                y1={padT}
                y2={H - padB}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1}
              />
              {series.map((s) => {
                const v = rows[hover][s.key] as number | undefined;
                if (v == null) return null;
                return (
                  <circle
                    key={`h-${String(s.key)}`}
                    cx={px(rows[hover].x)}
                    cy={py(v)}
                    r={3.6}
                    fill="#101017"
                    stroke={s.colour}
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          )}
        </svg>
      </div>
      <ChartTip tip={tip.tip} />
    </div>
  );
}

export function WeatherTrendView({ weather }: { weather: F1WeatherSample[] }) {
  const model = useMemo(() => {
    if (!weather.length) return null;
    const startMs = new Date(weather[0].date).getTime();
    // OpenF1 occasionally reports a 0 °C reading mid-session; a single zero
    // would flatten the whole temperature scale, so drop it.
    const temp = (v: number | null) => (v != null && v > 0 ? v : undefined);
    const rows: WeatherRow[] = weather.map((w) => ({
      x: Math.round((new Date(w.date).getTime() - startMs) / 60000),
      air: temp(w.airTemperature),
      track: temp(w.trackTemperature),
      humidity: w.humidity ?? undefined,
      wind: w.windSpeed ?? undefined,
      rain: (w.rainfall ?? 0) > 0 ? 1 : 0,
      dir: w.windDirection ?? undefined,
      pressure: w.pressure ?? undefined,
    }));

    const range = (pick: (r: WeatherRow) => number | undefined) => {
      const vals = rows.map(pick).filter((v): v is number => v != null);
      return vals.length ? ([Math.min(...vals), Math.max(...vals)] as [number, number]) : null;
    };
    const rainSamples = rows.filter((r) => r.rain).length;
    return {
      rows,
      air: range((r) => r.air),
      track: range((r) => r.track),
      humidity: range((r) => r.humidity),
      wind: range((r) => r.wind),
      pressure: range((r) => r.pressure),
      rainSamples,
    };
  }, [weather]);

  if (!model) return <EmptyView>No weather samples for this session yet.</EmptyView>;

  const span = (r: [number, number] | null, digits: number, unit: string) =>
    r ? `${r[0].toFixed(digits)}–${r[1].toFixed(digits)} ${unit}` : "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-white/10 bg-[#101017]/70 px-3 py-2 text-[10px] text-white/70">
        {[
          ["Air", span(model.air, 1, "°C")],
          ["Track", span(model.track, 1, "°C")],
          ["Humidity", span(model.humidity, 0, "%")],
          ["Wind", span(model.wind, 1, "m/s")],
          ["Pressure", span(model.pressure, 0, "hPa")],
        ].map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="text-white/55">{k}</span>
            <span className="font-semibold text-white">{v}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="text-white/55">Rain</span>
          <span className="font-semibold text-white">
            {model.rainSamples > 0 ? `Wet in ${model.rainSamples} samples` : "Dry session"}
          </span>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeatherPanel
          title="Air & track temperature"
          unit="°C"
          rows={model.rows}
          series={[
            { key: "track", colour: "#f97316", label: "Track" },
            { key: "air", colour: "#38bdf8", label: "Air" },
          ]}
          tickFmt={(v) => v.toFixed(1)}
          valueFmt={(v) => `${v.toFixed(1)} °C`}
        />
        <WeatherPanel
          title="Humidity"
          unit="%"
          rows={model.rows}
          series={[{ key: "humidity", colour: "#c084fc", label: "Humidity" }]}
          area
          tickFmt={(v) => v.toFixed(0)}
          valueFmt={(v) => `${v.toFixed(0)} %`}
        />
        <WeatherPanel
          title="Rain"
          unit="Rain"
          rows={model.rows}
          series={[{ key: "rain", colour: "#38bdf8", label: "Rainfall" }]}
          rain
          ticks={[0, 1]}
          tickFmt={(v) => (v >= 0.5 ? "Rain" : "Dry")}
          valueFmt={(v) => (v >= 0.5 ? "Rain" : "Dry")}
        />
        <WeatherPanel
          title="Wind speed"
          unit="m/s"
          rows={model.rows}
          series={[{ key: "wind", colour: "#34d399", label: "Wind" }]}
          area
          tickFmt={(v) => v.toFixed(1)}
          valueFmt={(v) => `${v.toFixed(1)} m/s`}
        />
        <WeatherPanel
          title="Wind direction"
          unit="°"
          rows={model.rows}
          series={[{ key: "dir", colour: "#2dd4bf", label: "Direction" }]}
          area
          ticks={[0, 90, 180, 270]}
          tickFmt={(v) => `${compass(v)} ${v}`}
          valueFmt={(v) => `${Math.round(v)}° ${compass(v)}`}
        />
        <WeatherPanel
          title="Pressure"
          unit="hPa"
          rows={model.rows}
          series={[{ key: "pressure", colour: "#fbbf24", label: "Pressure" }]}
          area
          tickFmt={(v) => (Math.abs(v - Math.round(v)) < 0.05 ? v.toFixed(0) : v.toFixed(1))}
          valueFmt={(v) => `${v.toFixed(0)} hPa`}
        />
      </div>

      <p className="text-[11px] text-white/40">
        Six panels over the session clock, one scale each. Hover any panel for the minute and its
        readings; values come from OpenF1&apos;s weather feed unchanged, and an unavailable reading
        is shown as —.
      </p>
    </div>
  );
}
