"use client";

import { useEffect, useMemo, useState } from "react";
import type { CricketPlayer, Gender, PlayerStatsData } from "@/lib/cricket/types";
import {
  careerSpan,
  hasBatting,
  hasBowling,
  internationalBatting,
  internationalBowling,
  isBatterRole,
  isBowlerRole,
  seasonSeries,
  summariseBatting,
  summariseBowling,
} from "@/lib/cricket/player-stats-summary";
import { formatNumber } from "@/lib/cricket/shared";
import PlayerPicker from "./PlayerPicker";
import {
  CHART_BLUE,
  CHART_GOLD,
  CHART_RED,
  CHART_TEAL,
  ChartEmpty,
  DonutChart,
  LineChart,
  RadarChart,
  StatBars,
} from "./stats-charts";
import { BoardLogo } from "./BoardLogo";
import { EmptyState, PlayerAvatar } from "./ui";
import { usePlayerProfile } from "./use-player-profile";

function fc(value: number | null, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function DuelHeader({
  a,
  b,
  statsA,
  statsB,
  labelA,
  labelB,
}: {
  a: CricketPlayer | null;
  b: CricketPlayer | null;
  statsA: PlayerStatsData | null;
  statsB: PlayerStatsData | null;
  labelA: string;
  labelB: string;
}) {
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      {[
        { player: a, stats: statsA, label: labelA, align: "left" as const, colour: CHART_BLUE },
        { player: b, stats: statsB, label: labelB, align: "right" as const, colour: CHART_GOLD },
      ].map((slot, index) => (
        <div
          key={slot.label}
          className={`flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-3 ${
            slot.align === "right" ? "flex-row-reverse text-right" : ""
          } ${index === 1 ? "sm:order-3" : ""}`}
        >
          {slot.player ? (
            <PlayerAvatar player={slot.player} size={58} className="rounded-xl ring-2" />
          ) : (
            <span className="h-[58px] w-[58px] shrink-0 rounded-xl bg-white/[0.05]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
              {slot.label}
            </p>
            <p className="mt-0.5 truncate font-f1 text-[23px] font-bold uppercase leading-none tracking-wide text-white">
              {slot.player?.name ?? "Select a player"}
            </p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-[11.5px] text-white/40" style={{ justifyContent: slot.align === "right" ? "flex-end" : "flex-start" }}>
              <BoardLogo team={{ name: "India", abbreviation: "IND" }} size="sm" />
              <span className="truncate">
                {slot.player?.role ?? "—"}
                {slot.stats ? ` · ${careerSpan(slot.stats) ?? "Career"}` : ""}
              </span>
            </p>
          </div>
        </div>
      ))}
      <div className="order-2 grid place-items-center sm:order-2">
        <span className="rounded-lg bg-gradient-to-br from-[#d9af6b] to-[#b98d46] px-2.5 py-1.5 font-f1 text-[13px] font-bold leading-none text-[#171108] shadow-[0_6px_18px_-6px_rgb(217_175_107/0.8)]">
          VS
        </span>
      </div>
    </div>
  );
}

function StatLine({
  label,
  a,
  b,
  better,
}: {
  label: string;
  a: string;
  b: string;
  better?: "a" | "b" | null;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_92px_minmax(0,1fr)] items-center gap-2 border-t border-white/[0.06] py-2 text-[13px]">
      <span className={`text-right font-f1 text-[15px] font-bold tabular-nums ${better === "a" ? "text-[#b9d7ff]" : "text-white/80"}`}>
        {a}
        {better === "a" && <span className="ml-1 text-[10px] text-[#8fb4ec]">▲</span>}
      </span>
      <span className="text-center text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">
        {label}
      </span>
      <span className={`font-f1 text-[15px] font-bold tabular-nums ${better === "b" ? "text-[#f0d3a0]" : "text-white/80"}`}>
        {b}
        {better === "b" && <span className="ml-1 text-[10px] text-[#d9af6b]">▲</span>}
      </span>
    </div>
  );
}

function FormatDuel({
  statsA,
  statsB,
  mode,
}: {
  statsA: PlayerStatsData;
  statsB: PlayerStatsData;
  mode: "h2h" | "compare";
}) {
  const aBat = summariseBatting(internationalBatting(statsA.career.batting));
  const bBat = summariseBatting(internationalBatting(statsB.career.batting));
  const bBowl = summariseBowling(internationalBowling(statsB.career.bowling));
  const formats = ["Test", "ODI", "T20I"] as const;

  if (mode === "h2h") {
    const maxRuns = Math.max(1, ...formats.map((format) => internationalBatting(statsA.career.batting).find((row) => row.format === format)?.runs ?? 0));
    const maxWickets = Math.max(1, ...formats.map((format) => internationalBowling(statsB.career.bowling).find((row) => row.format === format)?.wickets ?? 0));
    return (
      <div className="space-y-2.5">
        {formats.map((format, index) => {
          const bat = internationalBatting(statsA.career.batting).find((row) => row.format === format);
          const bowl = internationalBowling(statsB.career.bowling).find((row) => row.format === format);
          return (
            <div key={format} className="rounded-lg border border-white/[0.05] bg-black/15 px-2.5 py-2">
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#8fb4ec]">
                {format}
              </p>
              <div className="grid grid-cols-[48px_1fr_52px] items-center gap-2">
                <span className="text-left font-f1 text-[12.5px] font-bold tabular-nums text-[#b9d7ff]">
                  {bat?.runs ?? 0} <span className="text-[9px] font-normal text-white/30">runs</span>
                </span>
                <span className="flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
                  <span
                    className="ck-bar h-full rounded-l-full bg-[linear-gradient(90deg,#1d509e,#8fb4ec)]"
                    style={{
                      width: `${Math.max(2, ((bat?.runs ?? 0) / maxRuns) * 50)}%`,
                      animationDelay: `${index * 70}ms`,
                    }}
                  />
                  <span
                    className="ck-bar ml-auto h-full rounded-r-full bg-[linear-gradient(90deg,#d9af6b,#8a5e20)]"
                    style={{
                      width: `${Math.max(2, ((bowl?.wickets ?? 0) / maxWickets) * 50)}%`,
                      animationDelay: `${index * 70 + 70}ms`,
                      transformOrigin: "right center",
                    }}
                  />
                </span>
                <span className="text-right font-f1 text-[12.5px] font-bold tabular-nums text-[#f0d3a0]">
                  {bowl?.wickets ?? 0} <span className="text-[9px] font-normal text-white/30">wkts</span>
                </span>
              </div>
            </div>
          );
        })}
        <p className="text-[10.5px] text-white/30">
          Runs from {statsA.name || "the batter"} vs wickets by {statsB.name || "the bowler"}.
        </p>
      </div>
    );
  }

  const max = Math.max(1, ...formats.flatMap((format) => [
    internationalBatting(statsA.career.batting).find((row) => row.format === format)?.runs ?? 0,
    internationalBatting(statsB.career.batting).find((row) => row.format === format)?.runs ?? 0,
  ]));
  return (
    <div className="space-y-2.5">
      {formats.map((format, index) => {
        const aRow = internationalBatting(statsA.career.batting).find((row) => row.format === format);
        const bRow = internationalBatting(statsB.career.batting).find((row) => row.format === format);
        return (
          <div key={format}>
            <p className="mb-1 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">
              <span>{format}</span>
              <span className="tabular-nums text-white/25">
                {aRow?.runs ?? 0} · {bRow?.runs ?? 0}
              </span>
            </p>
            <div className="space-y-1">
              <span className="block h-2 overflow-hidden rounded-full bg-white/[0.05]">
                <span
                  className="ck-bar block h-full rounded-full bg-[linear-gradient(90deg,#1d509e,#8fb4ec)]"
                  style={{ width: `${Math.max(2, ((aRow?.runs ?? 0) / max) * 100)}%`, animationDelay: `${index * 55}ms` }}
                />
              </span>
              <span className="block h-2 overflow-hidden rounded-full bg-white/[0.05]">
                <span
                  className="ck-bar block h-full rounded-full bg-[linear-gradient(90deg,#d9af6b,#8a5e20)]"
                  style={{ width: `${Math.max(2, ((bRow?.runs ?? 0) / max) * 100)}%`, animationDelay: `${index * 55 + 55}ms` }}
                />
              </span>
            </div>
          </div>
        );
      })}
      <p className="text-[10.5px] text-white/30">
        Career runs by format. Blue {statsA.name}; gold {statsB.name}.
      </p>
    </div>
  );
}

function BattingTable({ stats, label }: { stats: PlayerStatsData; label: string }) {
  const rows = internationalBatting(stats.career.batting);
  if (!rows.length) return <ChartEmpty label="No batting table" />;
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.06]">
      <table className="ck-table">
        <thead>
          <tr>
            <th>{label}</th>
            <th className="ck-num">Runs</th>
            <th className="ck-num">Ave</th>
            <th className="ck-num">SR</th>
            <th className="ck-num">100s</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="text-white/65">{row.format}</td>
              <td className="ck-num font-bold text-white">{formatNumber(row.runs)}</td>
              <td className="ck-num">{row.average?.toFixed(2) ?? "—"}</td>
              <td className="ck-num">{row.strikeRate?.toFixed(1) ?? "—"}</td>
              <td className="ck-num">{row.hundreds}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BowlingTable({ stats, label }: { stats: PlayerStatsData; label: string }) {
  const rows = internationalBowling(stats.career.bowling);
  if (!rows.length) return <ChartEmpty label="No bowling table" />;
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.06]">
      <table className="ck-table">
        <thead>
          <tr>
            <th>{label}</th>
            <th className="ck-num">Wkts</th>
            <th className="ck-num">Ave</th>
            <th className="ck-num">Econ</th>
            <th className="ck-num">Best</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="text-white/65">{row.format}</td>
              <td className="ck-num font-bold text-white">{row.wickets}</td>
              <td className="ck-num">{row.average?.toFixed(2) ?? "—"}</td>
              <td className="ck-num">{row.economy?.toFixed(2) ?? "—"}</td>
              <td className="ck-num">{row.best ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PlayerCompare({
  players,
  gender,
  mode,
}: {
  players: CricketPlayer[];
  gender: Gender;
  mode: "h2h" | "compare";
}) {
  const eligible = useMemo(
    () => [...players].filter((player) => player.playerId).sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  );
  const poolA = mode === "h2h" ? eligible.filter((player) => isBatterRole(player.role)) : eligible;
  const poolB = mode === "h2h" ? eligible.filter((player) => isBowlerRole(player.role)) : eligible;
  const [aGid, setAGid] = useState("");
  const [bGid, setBGid] = useState("");

  useEffect(() => {
    const nextA =
      poolA.find((player) => player.id === aGid)?.id ??
      poolA.find((player) => player.grade === "A" && isBatterRole(player.role))?.id ??
      poolA.find((player) => player.grade === "A")?.id ??
      poolA[0]?.id ??
      eligible[0]?.id ??
      "";
    const nextB =
      poolB.find((player) => player.id === bGid && player.id !== nextA)?.id ??
      (mode === "compare"
        ? eligible.find((player) => player.id !== nextA && player.grade === "A" && isBatterRole(player.role))?.id
        : undefined) ??
      poolB.find((player) => player.grade === "A" && player.id !== nextA)?.id ??
      poolB.find((player) => player.id !== nextA)?.id ??
      eligible.find((player) => player.id !== nextA)?.id ??
      "";
    setAGid(nextA);
    setBGid(nextB);
    // The pools are derived from the squad; reset only when the squad changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, mode, eligible.length]);

  const a = eligible.find((player) => player.id === aGid) ?? null;
  const b = eligible.find((player) => player.id === bGid) ?? null;
  const { data: profileA, loading: loadingA } = usePlayerProfile(a);
  const { data: profileB, loading: loadingB } = usePlayerProfile(b);
  const statsA = profileA?.stats ?? null;
  const statsB = profileB?.stats ?? null;

  if (!eligible.length) {
    return <EmptyState title="Player comparison unavailable">BCCI has not published player ids for this squad.</EmptyState>;
  }

  if (!a || !b) {
    return <EmptyState title="Pick two players">Choose a player in each selector to build the comparison.</EmptyState>;
  }

  const battingA = statsA ? summariseBatting(internationalBatting(statsA.career.batting)) : null;
  const battingB = statsB ? summariseBatting(internationalBatting(statsB.career.batting)) : null;
  const bowlingA = statsA ? summariseBowling(internationalBowling(statsA.career.bowling)) : null;
  const bowlingB = statsB ? summariseBowling(internationalBowling(statsB.career.bowling)) : null;
  const loading = loadingA || loadingB;
  const hasBothBatting = hasBatting(statsA) && hasBatting(statsB);
  const hasBothBowling = hasBowling(statsA) && hasBowling(statsB);
  const hasAnyStats = hasBatting(statsA) || hasBowling(statsA) || hasBatting(statsB) || hasBowling(statsB);
  const radarMode = hasBothBatting ? "batting" : hasBothBowling ? "bowling" : null;
  const seasonA = statsA
    ? mode === "h2h"
      ? seasonSeries(statsA.seasons.batting, "runs")
      : hasBothBatting
        ? seasonSeries(statsA.seasons.batting, "runs")
        : seasonSeries(statsA.seasons.bowling, "wickets")
    : [];
  const seasonB = statsB
    ? mode === "h2h"
      ? seasonSeries(statsB.seasons.bowling, "wickets")
      : hasBothBatting
        ? seasonSeries(statsB.seasons.batting, "runs")
        : seasonSeries(statsB.seasons.bowling, "wickets")
    : [];
  const donutA = battingA
    ? [
        { label: "Fours", value: battingA.fours * 4, colour: CHART_GOLD },
        { label: "Sixes", value: battingA.sixes * 6, colour: CHART_RED },
        { label: "Running", value: battingA.runningRuns, colour: CHART_TEAL },
      ]
    : [];
  const donutB = bowlingB && bowlingB.dotPct != null
    ? [
        { label: "Dot balls", value: (bowlingB.dotPct / 100) * bowlingB.balls, colour: CHART_TEAL },
        { label: "Scoring balls", value: Math.max(0, bowlingB.balls - (bowlingB.dotPct / 100) * bowlingB.balls), colour: CHART_BLUE },
      ]
    : [];

  const radarAxes = radarMode === "batting"
    ? ["Matches", "Runs", "Average", "Strike rate", "Hundreds", "Fifties"]
    : ["Matches", "Wickets", "Average", "Economy", "Five-wicket", "Dot %"];
  const radarA = radarMode === "batting" && battingA
    ? [battingA.matches, battingA.runs, battingA.average ?? 0, battingA.strikeRate ?? 0, battingA.hundreds, battingA.fifties]
    : radarMode === "bowling" && bowlingA
      ? [bowlingA.matches, bowlingA.wickets, bowlingA.average ?? 0, bowlingA.economy ?? 0, bowlingA.fiveWickets, bowlingA.dotPct ?? 0]
      : [];
  const radarB = radarMode === "batting" && battingB
    ? [battingB.matches, battingB.runs, battingB.average ?? 0, battingB.strikeRate ?? 0, battingB.hundreds, battingB.fifties]
    : radarMode === "bowling" && bowlingB
      ? [bowlingB.matches, bowlingB.wickets, bowlingB.average ?? 0, bowlingB.economy ?? 0, bowlingB.fiveWickets, bowlingB.dotPct ?? 0]
      : [];

  const comparisonRows = [
    ["Matches", battingA?.matches, battingB?.matches],
    ["Runs", battingA?.runs, battingB?.runs],
    ["Average", battingA?.average, battingB?.average],
    ["Strike rate", battingA?.strikeRate, battingB?.strikeRate],
    ["Hundreds", battingA?.hundreds, battingB?.hundreds],
    ["Fifties", battingA?.fifties, battingB?.fifties],
    ["Wickets", bowlingA?.wickets, bowlingB?.wickets],
    ["Bowling average", bowlingA?.average, bowlingB?.average],
    ["Economy", bowlingA?.economy, bowlingB?.economy],
    ["Best bowling", null, null],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PlayerPicker
          label={mode === "h2h" ? "Batter" : "Player 1"}
          value={aGid}
          players={poolA.length ? poolA : eligible}
          onChange={setAGid}
          excludeId={bGid}
          placeholder="Search batter"
          accent={CHART_BLUE}
        />
        <PlayerPicker
          label={mode === "h2h" ? "Bowler" : "Player 2"}
          value={bGid}
          players={poolB.length ? poolB : eligible}
          onChange={setBGid}
          excludeId={aGid}
          placeholder="Search bowler"
          accent={CHART_GOLD}
        />
      </div>

      <DuelHeader
        a={a}
        b={b}
        statsA={statsA}
        statsB={statsB}
        labelA={mode === "h2h" ? "Batter" : "Player 1"}
        labelB={mode === "h2h" ? "Bowler" : "Player 2"}
      />

      {loading && !statsA && !statsB && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="h-48 animate-pulse rounded-xl bg-white/[0.04]" />
          <div className="h-48 animate-pulse rounded-xl bg-white/[0.04]" />
        </div>
      )}

      {!loading && (!statsA || !statsB) && (
        <EmptyState title="Career tables unavailable">
          One of these players has no BCCI career table yet.
        </EmptyState>
      )}

      {!loading && statsA && statsB && !hasAnyStats && (
        <EmptyState title="No international career rows">
          BCCI does not have senior international totals for one of these players yet.
        </EmptyState>
      )}

      {statsA && statsB && hasAnyStats && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                  {mode === "h2h" ? "Career duel" : "Career comparison"} <span className="text-white/35">· by numbers</span>
                </p>
                <span className="text-[11px] uppercase tracking-[0.12em] text-white/30">
                  BCCI career tables
                </span>
              </div>
              {mode === "h2h" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-[#8fb4ec]/20 bg-[#1d509e]/10 p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#8fb4ec]">
                      {a.name} · batting
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[
                        ["Matches", formatNumber(battingA?.matches ?? 0)],
                        ["Runs", formatNumber(battingA?.runs ?? 0)],
                        ["Average", fc(battingA?.average ?? null, 2)],
                        ["Strike rate", fc(battingA?.strikeRate ?? null, 1)],
                        ["Hundreds", String(battingA?.hundreds ?? 0)],
                        ["High score", battingA?.highScore ?? "—"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-md bg-black/20 px-2 py-1.5">
                          <p className="text-[9.5px] uppercase tracking-[0.1em] text-white/30">{label}</p>
                          <p className="mt-0.5 font-f1 text-[17px] font-bold tabular-nums text-white">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#d9af6b]/20 bg-[#d9af6b]/10 p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#d9af6b]">
                      {b.name} · bowling
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[
                        ["Matches", formatNumber(bowlingB?.matches ?? 0)],
                        ["Wickets", formatNumber(bowlingB?.wickets ?? 0)],
                        ["Average", fc(bowlingB?.average ?? null, 2)],
                        ["Economy", fc(bowlingB?.economy ?? null, 2)],
                        ["Five-wicket", String(bowlingB?.fiveWickets ?? 0)],
                        ["Best", bowlingB?.best ?? "—"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-md bg-black/20 px-2 py-1.5">
                          <p className="text-[9.5px] uppercase tracking-[0.1em] text-white/30">{label}</p>
                          <p className="mt-0.5 font-f1 text-[17px] font-bold tabular-nums text-white">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  {comparisonRows.map(([label, av, bv]) => {
                    const aNum = typeof av === "number" ? av : null;
                    const bNum = typeof bv === "number" ? bv : null;
                    const lowerWins = label === "Bowling average" || label === "Economy";
                    const better =
                      aNum == null || bNum == null || aNum === bNum
                        ? null
                        : lowerWins
                          ? aNum < bNum
                            ? "a"
                            : "b"
                          : aNum > bNum
                            ? "a"
                            : "b";
                    const display = (value: number | null) => {
                      if (value == null) return "—";
                      if (label === "Average" || label === "Bowling average" || label === "Economy") {
                        return value.toFixed(2);
                      }
                      return formatNumber(value);
                    };
                    return (
                      <StatLine
                        key={label}
                        label={label}
                        a={display(aNum)}
                        b={display(bNum)}
                        better={better}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
              <p className="mb-1 font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                {mode === "h2h" ? "Format output" : "Runs by format"} <span className="text-white/35">· season splits</span>
              </p>
              <p className="mb-3 text-[12px] text-white/35">
                {mode === "h2h"
                  ? "The batter's runs against the bowler's wickets, format by format."
                  : "Career runs in each international format, drawn to the same scale."}
              </p>
              <FormatDuel statsA={statsA} statsB={statsB} mode={mode} />
            </div>
          </div>

          {radarMode && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                  {radarMode === "batting" ? "Batting shape" : "Bowling shape"} <span className="text-white/35">· head to head</span>
                </p>
                <p className="mb-1 mt-1 text-[12px] text-white/35">
                  Each spoke is scaled to the stronger of the two players, so the shape shows the gap.
                </p>
                <RadarChart
                  axes={radarAxes}
                  ariaLabel={`${a.name} and ${b.name} ${radarMode} comparison`}
                  series={[
                    { name: a.name, colour: CHART_BLUE, values: radarA, labels: [] },
                    { name: b.name, colour: CHART_GOLD, values: radarB, labels: [] },
                  ]}
                />
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                  Output by season <span className="text-white/35">· trajectory</span>
                </p>
                <p className="mb-2 mt-1 text-[12px] text-white/35">
                  {mode === "h2h"
                    ? `${a.name}'s runs and ${b.name}'s wickets over the same seasons.`
                    : "Runs by season for both players."}
                </p>
                <LineChart
                  series={[
                    {
                      name: mode === "h2h" ? `${a.name} runs` : a.name,
                      colour: CHART_BLUE,
                      points: seasonA,
                    },
                    {
                      name: mode === "h2h" ? `${b.name} wickets` : b.name,
                      colour: CHART_GOLD,
                      points: seasonB,
                    },
                  ]}
                  ariaLabel="Season output comparison"
                  valueLabel={mode === "h2h" ? "Runs" : "Runs"}
                  secondaryAxis={mode === "h2h"}
                  height={260}
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
              <p className="mb-2 font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                {a.name} <span className="text-white/35">· scoring</span>
              </p>
              {donutA.length ? (
                <DonutChart
                  segments={donutA}
                  centerLabel="Career runs"
                  centerValue={formatNumber(battingA?.runs ?? 0)}
                  size={190}
                />
              ) : (
                <ChartEmpty label="No batting composition" />
              )}
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
              <p className="mb-2 font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                {b.name} <span className="text-white/35">· deliveries</span>
              </p>
              {donutB.length ? (
                <DonutChart
                  segments={donutB}
                  centerLabel="Career balls"
                  centerValue={formatNumber(bowlingB?.balls ?? 0)}
                  size={190}
                />
              ) : (
                <ChartEmpty label="No delivery split" />
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
              <p className="mb-2 font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                {a.name} <span className="text-white/35">· batting by format</span>
              </p>
              {statsA ? <BattingTable stats={statsA} label="Format" /> : <ChartEmpty />}
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
              <p className="mb-2 font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                {b.name} <span className="text-white/35">· bowling by format</span>
              </p>
              {statsB ? <BowlingTable stats={statsB} label="Format" /> : <ChartEmpty />}
            </div>
          </div>

          {mode === "compare" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                <p className="mb-2 font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                  {a.name} <span className="text-white/35">· career split</span>
                </p>
                {battingA && <StatBars rows={formatSplitStats(statsA, "runs")} />}
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                <p className="mb-2 font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
                  {b.name} <span className="text-white/35">· career split</span>
                </p>
                {battingB && <StatBars rows={formatSplitStats(statsB, "runs")} colour={CHART_GOLD} />}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatSplitStats(stats: PlayerStatsData, _metric: "runs" | "wickets") {
  return ["Test", "ODI", "T20I"].map((format) => ({
    label: format,
    value: internationalBatting(stats.career.batting)
      .filter((row) => row.format === format)
      .reduce((sum, row) => sum + row.runs, 0),
  }));
}
