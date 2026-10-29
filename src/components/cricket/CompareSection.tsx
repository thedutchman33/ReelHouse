"use client";

import { useEffect, useMemo, useState } from "react";
import type { Gender } from "@/lib/cricket/types";
import type { StatsPlayer, StatsPlayerSummary, StatsTeam } from "@/lib/cricket/stats-types";
import {
  battingAverage,
  battingBoundaryPct,
  battingDotPct,
  battingFiftyRate,
  battingRunsPerInnings,
  battingSixRate,
  battingStrikeRate,
  bowlingAverage,
  bowlingDotPct,
  bowlingEconomy,
  bowlingStrikeRate,
  bowlingWicketsPerInnings,
  careerSpanLabel,
  seasonRunPoints,
  seasonWicketPoints,
} from "@/lib/cricket/stats-rows";
import { formatNumber, iccPortraitUrl, teamJerseyColour } from "@/lib/cricket/shared";
import RosterPlayerPicker from "./RosterPlayerPicker";
import { useStatsPlayer, useStatsRoster } from "./use-stats";
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
import { TeamFlag } from "./TeamFlag";
import { EmptyState, PlayerAvatar, Select } from "./ui";

const PREFERRED_MEN = ["Australia", "England", "South Africa", "New Zealand", "Pakistan"];
const PREFERRED_WOMEN = [
  "Australia Women",
  "England Women",
  "South Africa Women",
  "New Zealand Women",
];

type Discipline = "batting" | "bowling";

function fc(value: number | null, digits = 2): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function num(value: number | null | undefined): number {
  return value == null || !Number.isFinite(value) ? 0 : value;
}

function hs(player: StatsPlayer): string {
  if (player.bat.innings === 0) return "—";
  return `${player.bat.highScore}${player.bat.highScoreNotOut ? "*" : ""}`;
}

function best(player: StatsPlayer): string {
  if (player.bowl.innings === 0) return "—";
  return `${player.bowl.bestWickets}/${player.bowl.bestRuns}`;
}

function better(a: number | null, b: number | null, lower = false): "a" | "b" | null {
  if (a == null || b == null || a === b) return null;
  return lower ? (a < b ? "a" : "b") : a > b ? "a" : "b";
}

function CompareRow({
  label,
  a,
  b,
  winner,
}: {
  label: string;
  a: string;
  b: string;
  winner: "a" | "b" | null;
}) {
  return (
    <tr className="cst-row border-t border-white/[0.06] text-[13px]">
      <td className="py-2 pr-3 text-white/40">{label}</td>
      <td
        className={`py-2 text-right font-f1 text-[15px] font-bold tabular-nums ${
          winner === "a" ? "text-[#b9d7ff]" : "text-white/75"
        }`}
      >
        {winner === "a" && <span className="mr-1 text-[9px] text-[#8fb4ec]">▲</span>}
        {a}
      </td>
      <td
        className={`py-2 pl-3 text-right font-f1 text-[15px] font-bold tabular-nums ${
          winner === "b" ? "text-[#f0d3a0]" : "text-white/75"
        }`}
      >
        {winner === "b" && <span className="mr-1 text-[9px] text-[#d9af6b]">▲</span>}
        {b}
      </td>
    </tr>
  );
}

function IdentityCard({
  player,
  team,
  colour,
}: {
  player: StatsPlayer | null;
  team: StatsTeam | null;
  colour: string;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-3 rounded-xl border bg-black/20 px-3 py-3"
      style={{ borderColor: `${colour}33` }}
    >
      <PlayerAvatar
        player={{ name: player?.name ?? "?", imageUrl: iccPortraitUrl(player?.iccId) }}
        colour={teamJerseyColour(player?.team)}
        size={58}
        className="rounded-xl ring-2"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-f1 text-[23px] font-bold uppercase leading-none tracking-wide text-white">
          {player?.name ?? "Select a player"}
        </p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-[11.5px] text-white/40">
          <TeamFlag team={{ name: player?.team ?? team?.name ?? "", abbreviation: team?.code ?? "" }} size="xs" />
          <span className="truncate">
            {player?.role ?? "—"}
            {player ? ` · ${careerSpanLabel(player)}` : ""}
          </span>
        </p>
      </div>
    </div>
  );
}

function Picker({
  label,
  teams,
  teamName,
  onTeam,
  players,
  playerIndex,
  onPlayer,
  accent,
  placeholder,
}: {
  label: string;
  teams: StatsTeam[];
  teamName: string;
  onTeam: (name: string) => void;
  players: StatsPlayerSummary[];
  playerIndex: number | null;
  onPlayer: (index: number) => void;
  accent: string;
  placeholder: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</p>
        <span className="h-1.5 w-6 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(108px,0.7fr)_minmax(0,1.3fr)]">
        <Select
          label="Team"
          compact
          value={teamName}
          onChange={onTeam}
          options={teams.map((team) => ({
            value: team.name,
            label: team.name,
            hint: team.code,
            leading: <TeamFlag team={{ name: team.name, abbreviation: team.code }} size="xs" />,
          }))}
        />
        <RosterPlayerPicker
          label="Player"
          value={playerIndex}
          players={players}
          onChange={onPlayer}
          placeholder={placeholder}
          accent={accent}
          hideLabel
        />
      </div>
    </div>
  );
}

export default function CompareSection({ gender }: { gender: Gender }) {
  const { data: roster, loading: rosterLoading, failed: rosterFailed } = useStatsRoster(gender);
  const teams = roster?.teams ?? [];
  const byIndex = useMemo(
    () => new Map((roster?.players ?? []).map((player) => [player.index, player])),
    [roster]
  );
  const preferred = gender === "women" ? PREFERRED_WOMEN : PREFERRED_MEN;
  const homeTeam = useMemo(
    () => teams.find((team) => team.name === (gender === "women" ? "India Women" : "India"))?.name ?? teams[0]?.name ?? "",
    [teams, gender]
  );
  const awayTeam = useMemo(
    () =>
      preferred
        .map((name) => teams.find((team) => team.name === name))
        .find((team) => team && team.name !== homeTeam)?.name ??
      teams.find((team) => team.name !== homeTeam)?.name ??
      teams[1]?.name ??
      teams[0]?.name ??
      "",
    [teams, homeTeam, preferred]
  );

  const [teamA, setTeamA] = useState(homeTeam);
  const [teamB, setTeamB] = useState(awayTeam);
  const [indexA, setIndexA] = useState<number | null>(null);
  const [indexB, setIndexB] = useState<number | null>(null);
  const [discipline, setDiscipline] = useState<Discipline>("batting");

  useEffect(() => {
    setTeamA(homeTeam);
    setTeamB(awayTeam);
  }, [homeTeam, awayTeam]);

  const teamRowA = teams.find((team) => team.name === teamA) ?? teams[0] ?? null;
  const teamRowB = teams.find((team) => team.name === teamB) ?? teams[1] ?? teams[0] ?? null;

  const playersFor = (team: StatsTeam | null) =>
    (team?.all ?? [])
      .map((index) => byIndex.get(index))
      .filter((player): player is StatsPlayerSummary => Boolean(player));

  const playersA = useMemo(() => playersFor(teamRowA), [teamRowA, byIndex]);
  const playersB = useMemo(() => playersFor(teamRowB), [teamRowB, byIndex]);

  useEffect(() => {
    if (!teamRowA) return;
    setIndexA((current) =>
      current != null && teamRowA.all.includes(current)
        ? current
        : teamRowA.bat[0] ?? teamRowA.all[0] ?? null
    );
  }, [teamRowA]);

  useEffect(() => {
    if (!teamRowB) return;
    setIndexB((current) =>
      current != null && current !== indexA && teamRowB.all.includes(current)
        ? current
        : teamRowB.bat.find((index) => index !== indexA) ??
          teamRowB.all.find((index) => index !== indexA) ??
          null
    );
  }, [teamRowB, indexA]);

  const chooseA = (name: string) => {
    setTeamA(name);
    if (name === teamB) {
      const other =
        teams.find((team) => team.name !== name && preferred.includes(team.name))?.name ??
        teams.find((team) => team.name !== name)?.name;
      if (other) setTeamB(other);
    }
  };
  const chooseB = (name: string) => {
    setTeamB(name);
    if (name === teamA) {
      const other =
        teams.find((team) => team.name !== name && preferred.includes(team.name))?.name ??
        teams.find((team) => team.name !== name)?.name;
      if (other) setTeamA(other);
    }
  };

  const { data: playerA, loading: loadingA } = useStatsPlayer(indexA);
  const { data: playerB, loading: loadingB } = useStatsPlayer(indexB);

  const both = playerA && playerB;
  const canBat = Boolean(both && (playerA.bat.innings > 0 || playerB.bat.innings > 0));
  const canBowl = Boolean(both && (playerA.bowl.innings > 0 || playerB.bowl.innings > 0));

  useEffect(() => {
    if (!both) return;
    if (discipline === "batting" && !canBat && canBowl) setDiscipline("bowling");
    if (discipline === "bowling" && !canBowl && canBat) setDiscipline("batting");
  }, [both, canBat, canBowl, discipline]);

  if (rosterFailed) {
    return <EmptyState title="Compare data unavailable">The career index could not be loaded.</EmptyState>;
  }

  if (rosterLoading && !roster) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />
        <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
        <div className="h-[320px] animate-pulse rounded-2xl bg-white/[0.03]" />
      </div>
    );
  }

  const radar =
    both && discipline === "batting"
      ? {
          axes: ["Runs", "Average", "Strike rate", "Runs / inns", "Boundary %", "Six rate", "50+ rate", "Catches"],
          a: [
            playerA.bat.runs,
            num(battingAverage(playerA)),
            num(battingStrikeRate(playerA)),
            num(battingRunsPerInnings(playerA)),
            num(battingBoundaryPct(playerA)),
            num(battingSixRate(playerA)),
            num(battingFiftyRate(playerA)),
            playerA.bat.catches,
          ],
          b: [
            playerB.bat.runs,
            num(battingAverage(playerB)),
            num(battingStrikeRate(playerB)),
            num(battingRunsPerInnings(playerB)),
            num(battingBoundaryPct(playerB)),
            num(battingSixRate(playerB)),
            num(battingFiftyRate(playerB)),
            playerB.bat.catches,
          ],
          labelsA: [
            formatNumber(playerA.bat.runs),
            fc(battingAverage(playerA), 2),
            fc(battingStrikeRate(playerA), 1),
            fc(battingRunsPerInnings(playerA), 1),
            fc(battingBoundaryPct(playerA), 1),
            fc(battingSixRate(playerA), 1),
            fc(battingFiftyRate(playerA), 1),
            formatNumber(playerA.bat.catches),
          ],
          labelsB: [
            formatNumber(playerB.bat.runs),
            fc(battingAverage(playerB), 2),
            fc(battingStrikeRate(playerB), 1),
            fc(battingRunsPerInnings(playerB), 1),
            fc(battingBoundaryPct(playerB), 1),
            fc(battingSixRate(playerB), 1),
            fc(battingFiftyRate(playerB), 1),
            formatNumber(playerB.bat.catches),
          ],
        }
      : both
        ? {
            axes: ["Wickets", "Wickets / inns", "Dot %", "5W hauls", "Balls", "Innings", "Matches", "Best"],
            a: [
              playerA.bowl.wickets,
              num(bowlingWicketsPerInnings(playerA)),
              num(bowlingDotPct(playerA)),
              playerA.bowl.fiveWickets,
              playerA.bowl.balls,
              playerA.bowl.innings,
              playerA.matches,
              playerA.bowl.bestWickets,
            ],
            b: [
              playerB.bowl.wickets,
              num(bowlingWicketsPerInnings(playerB)),
              num(bowlingDotPct(playerB)),
              playerB.bowl.fiveWickets,
              playerB.bowl.balls,
              playerB.bowl.innings,
              playerB.matches,
              playerB.bowl.bestWickets,
            ],
            labelsA: [
              formatNumber(playerA.bowl.wickets),
              fc(bowlingWicketsPerInnings(playerA), 2),
              fc(bowlingDotPct(playerA), 1),
              formatNumber(playerA.bowl.fiveWickets),
              formatNumber(playerA.bowl.balls),
              formatNumber(playerA.bowl.innings),
              formatNumber(playerA.matches),
              String(playerA.bowl.bestWickets),
            ],
            labelsB: [
              formatNumber(playerB.bowl.wickets),
              fc(bowlingWicketsPerInnings(playerB), 2),
              fc(bowlingDotPct(playerB), 1),
              formatNumber(playerB.bowl.fiveWickets),
              formatNumber(playerB.bowl.balls),
              formatNumber(playerB.bowl.innings),
              formatNumber(playerB.matches),
              String(playerB.bowl.bestWickets),
            ],
          }
        : null;

  const battingRows = both
    ? [
        { label: "Matches", a: formatNumber(playerA.matches), b: formatNumber(playerB.matches), winner: better(playerA.matches, playerB.matches) },
        { label: "Innings", a: formatNumber(playerA.bat.innings), b: formatNumber(playerB.bat.innings), winner: better(playerA.bat.innings, playerB.bat.innings) },
        { label: "Runs", a: formatNumber(playerA.bat.runs), b: formatNumber(playerB.bat.runs), winner: better(playerA.bat.runs, playerB.bat.runs) },
        { label: "Average", a: fc(battingAverage(playerA)), b: fc(battingAverage(playerB)), winner: better(battingAverage(playerA), battingAverage(playerB)) },
        { label: "Strike rate", a: fc(battingStrikeRate(playerA), 1), b: fc(battingStrikeRate(playerB), 1), winner: better(battingStrikeRate(playerA), battingStrikeRate(playerB)) },
        { label: "Highest", a: hs(playerA), b: hs(playerB), winner: better(playerA.bat.highScore, playerB.bat.highScore) },
        { label: "100s", a: formatNumber(playerA.bat.hundreds), b: formatNumber(playerB.bat.hundreds), winner: better(playerA.bat.hundreds, playerB.bat.hundreds) },
        { label: "50s", a: formatNumber(playerA.bat.fifties), b: formatNumber(playerB.bat.fifties), winner: better(playerA.bat.fifties, playerB.bat.fifties) },
        { label: "4s", a: formatNumber(playerA.bat.fours), b: formatNumber(playerB.bat.fours), winner: better(playerA.bat.fours, playerB.bat.fours) },
        { label: "6s", a: formatNumber(playerA.bat.sixes), b: formatNumber(playerB.bat.sixes), winner: better(playerA.bat.sixes, playerB.bat.sixes) },
        { label: "Catches", a: formatNumber(playerA.bat.catches), b: formatNumber(playerB.bat.catches), winner: better(playerA.bat.catches, playerB.bat.catches) },
      ]
    : [];

  const bowlingRows = both
    ? [
        { label: "Matches", a: formatNumber(playerA.matches), b: formatNumber(playerB.matches), winner: better(playerA.matches, playerB.matches) },
        { label: "Innings", a: formatNumber(playerA.bowl.innings), b: formatNumber(playerB.bowl.innings), winner: better(playerA.bowl.innings, playerB.bowl.innings) },
        { label: "Balls", a: formatNumber(playerA.bowl.balls), b: formatNumber(playerB.bowl.balls), winner: better(playerA.bowl.balls, playerB.bowl.balls) },
        { label: "Runs conceded", a: formatNumber(playerA.bowl.runs), b: formatNumber(playerB.bowl.runs), winner: better(playerA.bowl.runs, playerB.bowl.runs, true) },
        { label: "Wickets", a: formatNumber(playerA.bowl.wickets), b: formatNumber(playerB.bowl.wickets), winner: better(playerA.bowl.wickets, playerB.bowl.wickets) },
        { label: "Average", a: fc(bowlingAverage(playerA)), b: fc(bowlingAverage(playerB)), winner: better(bowlingAverage(playerA), bowlingAverage(playerB), true) },
        { label: "Economy", a: fc(bowlingEconomy(playerA)), b: fc(bowlingEconomy(playerB)), winner: better(bowlingEconomy(playerA), bowlingEconomy(playerB), true) },
        { label: "Strike rate", a: fc(bowlingStrikeRate(playerA), 1), b: fc(bowlingStrikeRate(playerB), 1), winner: better(bowlingStrikeRate(playerA), bowlingStrikeRate(playerB), true) },
        { label: "Best", a: best(playerA), b: best(playerB), winner: better(playerA.bowl.bestWickets, playerB.bowl.bestWickets) },
        { label: "5W hauls", a: formatNumber(playerA.bowl.fiveWickets), b: formatNumber(playerB.bowl.fiveWickets), winner: better(playerA.bowl.fiveWickets, playerB.bowl.fiveWickets) },
      ]
    : [];

  const seasonsA = both
    ? discipline === "batting"
      ? seasonRunPoints(playerA)
      : seasonWicketPoints(playerA)
    : [];
  const seasonsB = both
    ? discipline === "batting"
      ? seasonRunPoints(playerB)
      : seasonWicketPoints(playerB)
    : [];

  const formatA = both
    ? discipline === "batting"
      ? playerA.bat.formats.filter((row) => row.innings > 0).map((row) => ({ label: row.format, value: row.runs }))
      : playerA.bowl.formats.filter((row) => row.innings > 0).map((row) => ({ label: row.format, value: row.wickets }))
    : [];
  const formatB = both
    ? discipline === "batting"
      ? playerB.bat.formats.filter((row) => row.innings > 0).map((row) => ({ label: row.format, value: row.runs }))
      : playerB.bowl.formats.filter((row) => row.innings > 0).map((row) => ({ label: row.format, value: row.wickets }))
    : [];

  return (
    <div className="space-y-4">
      <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Picker
          label="Player 1"
          teams={teams}
          teamName={teamA}
          onTeam={chooseA}
          players={playersA}
          playerIndex={indexA}
          onPlayer={setIndexA}
          accent={CHART_BLUE}
          placeholder="Search player 1"
        />
        <span className="mx-auto rounded-lg bg-gradient-to-br from-[#d9af6b] to-[#b98d46] px-2.5 py-1.5 font-f1 text-[13px] font-bold leading-none text-[#171108] shadow-[0_6px_18px_-6px_rgb(217_175_107/0.8)] md:mb-3">
          VS
        </span>
        <Picker
          label="Player 2"
          teams={teams}
          teamName={teamB}
          onTeam={chooseB}
          players={playersB}
          playerIndex={indexB}
          onPlayer={setIndexB}
          accent={CHART_GOLD}
          placeholder="Search player 2"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <IdentityCard player={playerA} team={teamRowA} colour={CHART_BLUE} />
        <div className="hidden place-items-center sm:grid">
          <span className="font-f1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/25">
            versus
          </span>
        </div>
        <IdentityCard player={playerB} team={teamRowB} colour={CHART_GOLD} />
      </div>

      {(loadingA || loadingB) && !both && (
        <div className="h-[320px] animate-pulse rounded-2xl bg-white/[0.03]" aria-busy="true" />
      )}

      {both && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
            <div className="flex items-center gap-1 rounded-md bg-black/30 p-0.5">
              {(["batting", "bowling"] as const).map((option) => {
                const disabled = option === "batting" ? !canBat : !canBowl;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={discipline === option}
                    disabled={disabled}
                    onClick={() => setDiscipline(option)}
                    className={`rounded px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.1em] transition disabled:cursor-not-allowed disabled:opacity-30 ${
                      discipline === option ? "bg-[#1d509e] text-white" : "text-white/40 hover:text-white/75"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/30">
              Career totals · internationals
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
                  Profile shape
                </p>
                <span className="text-[10.5px] uppercase tracking-[0.12em] text-white/30">
                  Axis peak = stronger career
                </span>
              </div>
              {radar ? (
                <>
                  <RadarChart
                    axes={radar.axes}
                    series={[
                      { name: playerA.name, colour: CHART_BLUE, values: radar.a, labels: radar.labelsA },
                      { name: playerB.name, colour: CHART_GOLD, values: radar.b, labels: radar.labelsB },
                    ]}
                    ariaLabel={`Career ${discipline} comparison between ${playerA.name} and ${playerB.name}`}
                  />
                  <div className="mt-1 overflow-x-auto">
                    <table className="w-full min-w-[360px] border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/30">
                          <th className="py-1 pr-2 font-semibold">Metric</th>
                          <th className="py-1 text-right font-semibold">{playerA.name}</th>
                          <th className="py-1 pl-2 text-right font-semibold">{playerB.name}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {radar.axes.map((axis, index) => (
                          <tr key={axis} className="border-t border-white/[0.05]">
                            <td className="py-1 pr-2 text-white/40">{axis}</td>
                            <td className="py-1 text-right font-f1 font-bold tabular-nums text-[#b9d7ff]">
                              {radar.labelsA[index]}
                            </td>
                            <td className="py-1 pl-2 text-right font-f1 font-bold tabular-nums text-[#f0d3a0]">
                              {radar.labelsB[index]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <ChartEmpty label="No comparable career rows" />
              )}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
                  Head to head <span className="text-white/35">· {discipline}</span>
                </p>
                <div className="flex items-center gap-3 text-[10.5px] text-white/35">
                  <span className="inline-flex items-center gap-1">
                    <i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CHART_BLUE }} />
                    {playerA.name}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CHART_GOLD }} />
                    {playerB.name}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] border-collapse text-left">
                  <thead>
                    <tr className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/30">
                      <th className="pb-1 pr-2 font-semibold">Stat</th>
                      <th className="pb-1 text-right font-semibold">{playerA.name}</th>
                      <th className="pb-1 pl-3 text-right font-semibold">{playerB.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(discipline === "batting" ? battingRows : bowlingRows).map((row) => (
                      <CompareRow
                        key={row.label}
                        label={row.label}
                        a={row.a}
                        b={row.b}
                        winner={row.winner}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
                {discipline === "batting" ? "Runs by season" : "Wickets by season"}
              </p>
              <span className="text-[10.5px] uppercase tracking-[0.12em] text-white/30">
                Solid {playerA.name} · dashed {playerB.name}
              </span>
            </div>
            <LineChart
              series={[
                {
                  name: playerA.name,
                  colour: CHART_BLUE,
                  points: seasonsA,
                },
                {
                  name: playerB.name,
                  colour: CHART_GOLD,
                  points: seasonsB,
                },
              ]}
              ariaLabel={`Season comparison between ${playerA.name} and ${playerB.name}`}
              valueLabel={discipline === "batting" ? "Runs" : "Wickets"}
              height={260}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <p className="mb-3 font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
                {playerA.name} <span className="text-white/35">· by format</span>
              </p>
              {formatA.length ? (
                <StatBars rows={formatA} colour={CHART_BLUE} />
              ) : (
                <ChartEmpty label="No format rows" />
              )}
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <p className="mb-3 font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
                {playerB.name} <span className="text-white/35">· by format</span>
              </p>
              {formatB.length ? (
                <StatBars rows={formatB} colour={CHART_GOLD} />
              ) : (
                <ChartEmpty label="No format rows" />
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {[playerA, playerB].map((player, index) => (
              <div key={player.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                <p className="mb-2 font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
                  {player.name} <span className="text-white/35">· {discipline} mix</span>
                </p>
                {discipline === "batting" ? (
                  <DonutChart
                    segments={[
                      { label: "Fours", value: player.bat.fours * 4, colour: CHART_GOLD },
                      { label: "Sixes", value: player.bat.sixes * 6, colour: CHART_RED },
                      {
                        label: "Running",
                        value: Math.max(0, player.bat.runs - player.bat.fours * 4 - player.bat.sixes * 6),
                        colour: index === 0 ? CHART_BLUE : CHART_TEAL,
                      },
                    ]}
                    centerLabel="Runs"
                    centerValue={formatNumber(player.bat.runs)}
                    size={168}
                  />
                ) : (
                  <DonutChart
                    segments={[
                      { label: "Dot balls", value: player.bowl.dots, colour: CHART_TEAL },
                      {
                        label: "Scoring balls",
                        value: Math.max(0, player.bowl.balls - player.bowl.dots),
                        colour: index === 0 ? CHART_BLUE : CHART_GOLD,
                      },
                    ]}
                    centerLabel="Balls"
                    centerValue={formatNumber(player.bowl.balls)}
                    size={168}
                  />
                )}
              </div>
            ))}
          </div>

          <p className="text-[11px] leading-relaxed text-white/30">
            Career totals are aggregated from Cricsheet&apos;s ball-by-ball international archive.
            The index covers matches through {roster?.maxDate ?? "the latest update"} and includes
            every player active in the last two years.
          </p>
        </>
      )}
    </div>
  );
}
