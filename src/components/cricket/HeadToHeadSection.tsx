"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Gender } from "@/lib/cricket/types";
import type {
  StatsLastEncounter,
  StatsPair,
  StatsPlayerSummary,
  StatsTeam,
  StatsTeamRecord,
} from "@/lib/cricket/stats-types";
import { formatDayMonth, formatNumber } from "@/lib/cricket/shared";
import RosterPlayerPicker from "./RosterPlayerPicker";
import { usePlayerH2H, useStatsRoster, useTeamH2H } from "./use-stats";
import {
  CHART_BLUE,
  CHART_GOLD,
  CHART_RED,
  CHART_TEAL,
  ChartEmpty,
  DonutChart,
  RadialGauge,
  StatBars,
} from "./stats-charts";
import { TeamFlag } from "./TeamFlag";
import { EmptyState, Select } from "./ui";

const PREFERRED_MEN = ["Australia", "England", "South Africa", "New Zealand", "Pakistan"];
const PREFERRED_WOMEN = [
  "Australia Women",
  "England Women",
  "South Africa Women",
  "New Zealand Women",
];

function fc(value: number | null, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function pct(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "team" | "player";
  onChange: (mode: "team" | "player") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.06] bg-black/20 p-1">
      {(
        [
          { key: "team", label: "Team head to head", sub: "All-time record" },
          { key: "player", label: "Player head to head", sub: "Batter vs bowler" },
        ] as const
      ).map((entry) => {
        const active = mode === entry.key;
        return (
          <button
            key={entry.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(entry.key)}
            className={`flex flex-1 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-md px-3 py-2 text-[12.5px] font-semibold transition ${
              active
                ? "bg-[#1d509e] text-white shadow-[0_2px_12px_rgb(29_80_158/0.4)]"
                : "text-white/40 hover:bg-white/[0.04] hover:text-white/75"
            }`}
          >
            {entry.label}
            <span
              className={`text-[10px] font-normal uppercase tracking-[0.12em] ${
                active ? "text-white/60" : "text-white/25"
              }`}
            >
              {entry.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SegmentedBar({ pair }: { pair: StatsPair }) {
  const total = Math.max(1, pair.balls);
  const segments = [
    { label: "Dots", value: pair.dots, colour: "#334155" },
    { label: "1s / 2s / 3s", value: pair.runningBalls, colour: CHART_BLUE },
    { label: "Fours", value: pair.fours, colour: CHART_TEAL },
    { label: "Sixes", value: pair.sixes, colour: CHART_RED },
  ];
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
        {segments.map((segment) => (
          <span
            key={segment.label}
            className="ck-bar h-full"
            style={{
              width: `${Math.max(0, (segment.value / total) * 100)}%`,
              backgroundColor: segment.colour,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-white/45">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: segment.colour }}
            />
            <span className="font-f1 font-bold tabular-nums text-white/75">
              {formatNumber(segment.value)}
            </span>
            {segment.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 text-center">
      <p
        className={`font-f1 text-[22px] font-bold leading-none tabular-nums ${
          accent ? "text-[#d9af6b]" : "text-white"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
        {label}
      </p>
    </div>
  );
}

function TeamPicker({
  label,
  teams,
  value,
  onChange,
  icon,
}: {
  label: string;
  teams: StatsTeam[];
  value: string;
  onChange: (name: string) => void;
  icon: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#1d509e]/20 text-[#b9d7ff]">
        {icon}
      </span>
      <Select
        label={label}
        compact
        value={value}
        onChange={onChange}
        options={teams.map((team) => ({
          value: team.name,
          label: team.name,
          hint: team.code,
          leading: <TeamFlag team={{ name: team.name, abbreviation: team.code }} size="xs" />,
        }))}
      />
    </div>
  );
}

function LastEncounter({
  batterName,
  last,
}: {
  batterName: string;
  last: StatsLastEncounter | null;
}) {
  if (!last) return null;
  return (
    <div className="rounded-xl border border-white/[0.06] border-l-2 border-l-[#8fb4ec] bg-black/20 px-4 py-3">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/35">
        Last encounter
      </p>
      <p className="mt-1 font-f1 text-[17px] font-bold uppercase tracking-wide text-white">
        {last.match.venue || "Venue not recorded"}
      </p>
      <p className="mt-0.5 text-[12px] text-white/45">
        {formatDayMonth(last.match.date)} · {last.match.teamA} vs {last.match.teamB} ·{" "}
        {last.match.format}
      </p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-white/70">
        {batterName} scored {last.runs} off {last.balls} ball{last.balls === 1 ? "" : "s"}
        {last.fours > 0 || last.sixes > 0
          ? ` (${[last.fours > 0 ? `${last.fours}×4` : null, last.sixes > 0 ? `${last.sixes}×6` : null]
              .filter(Boolean)
              .join(", ")})`
          : ""}{" "}
        and {last.out ? "fell to this bowler" : "survived this bowler"}.
      </p>
      {last.match.result && (
        <p className="mt-1.5 text-[12.5px] font-semibold text-[#8fb4ec]">{last.match.result}</p>
      )}
    </div>
  );
}

function PlayerHeadToHead({
  teams,
  players,
  gender,
}: {
  teams: StatsTeam[];
  players: StatsPlayerSummary[];
  gender: Gender;
}) {
  const byIndex = useMemo(
    () => new Map(players.map((player) => [player.index, player])),
    [players]
  );
  const preferred = gender === "women" ? PREFERRED_WOMEN : PREFERRED_MEN;
  const defaultBatTeam = useMemo(
    () => teams.find((team) => team.name === (gender === "women" ? "India Women" : "India"))?.name ?? teams[0]?.name ?? "",
    [teams, gender]
  );
  const defaultBowlTeam = useMemo(
    () =>
      preferred
        .map((name) => teams.find((team) => team.name === name))
        .find((team) => team && team.name !== defaultBatTeam)?.name ??
      teams.find((team) => team.name !== defaultBatTeam)?.name ??
      teams[1]?.name ??
      teams[0]?.name ??
      "",
    [teams, defaultBatTeam, preferred]
  );

  const [batTeamName, setBatTeamName] = useState(defaultBatTeam);
  const [bowlTeamName, setBowlTeamName] = useState(defaultBowlTeam);
  const [batIndex, setBatIndex] = useState<number | null>(null);
  const [bowlIndex, setBowlIndex] = useState<number | null>(null);

  useEffect(() => {
    setBatTeamName(defaultBatTeam);
    setBowlTeamName(defaultBowlTeam);
  }, [defaultBatTeam, defaultBowlTeam]);

  const batTeam = teams.find((team) => team.name === batTeamName) ?? teams[0] ?? null;
  const bowlTeam = teams.find((team) => team.name === bowlTeamName) ?? teams[1] ?? teams[0] ?? null;

  const batPlayers = useMemo(
    () =>
      (batTeam?.all ?? [])
        .map((index) => byIndex.get(index))
        .filter((player): player is StatsPlayerSummary => Boolean(player)),
    [batTeam, byIndex]
  );
  const bowlPlayers = useMemo(
    () =>
      (bowlTeam?.all ?? [])
        .map((index) => byIndex.get(index))
        .filter((player): player is StatsPlayerSummary => Boolean(player)),
    [bowlTeam, byIndex]
  );

  useEffect(() => {
    if (!batTeam) return;
    setBatIndex((current) =>
      current != null && batTeam.all.includes(current)
        ? current
        : batTeam.bat[0] ?? batTeam.all[0] ?? null
    );
  }, [batTeam]);

  useEffect(() => {
    if (!bowlTeam) return;
    setBowlIndex((current) =>
      current != null && current !== batIndex && bowlTeam.all.includes(current)
        ? current
        : bowlTeam.bowl.find((index) => index !== batIndex) ??
          bowlTeam.all.find((index) => index !== batIndex) ??
          null
    );
  }, [bowlTeam, batIndex]);

  const chooseBatTeam = (name: string) => {
    setBatTeamName(name);
    if (name === bowlTeamName) {
      const other =
        teams.find((team) => team.name !== name && preferred.includes(team.name))?.name ??
        teams.find((team) => team.name !== name)?.name;
      if (other) setBowlTeamName(other);
    }
  };
  const chooseBowlTeam = (name: string) => {
    setBowlTeamName(name);
    if (name === batTeamName) {
      const other =
        teams.find((team) => team.name !== name && preferred.includes(team.name))?.name ??
        teams.find((team) => team.name !== name)?.name;
      if (other) setBatTeamName(other);
    }
  };

  const { data, loading, failed } = usePlayerH2H(batIndex, bowlIndex);
  const pair = data?.pair ?? null;

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-white/40">
        Pick a batsman, then a bowler from the other side to see every ball they have
        faced across international cricket.
      </p>

      <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3.5 md:p-4">
        <div className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/40">
              Batsman
            </p>
            <div className="grid gap-2 sm:grid-cols-[minmax(110px,0.75fr)_minmax(0,1.25fr)]">
              <TeamPicker
                label="Batter team"
                teams={teams}
                value={batTeam?.name ?? ""}
                onChange={chooseBatTeam}
                icon={<span className="font-f1 text-[13px] font-bold">B</span>}
              />
              <RosterPlayerPicker
                label="Batsman"
                value={batIndex}
                players={batPlayers}
                onChange={setBatIndex}
                placeholder="Search batsman"
                accent={CHART_BLUE}
                hideLabel
              />
            </div>
          </div>

          <span className="mx-auto rounded-lg bg-gradient-to-br from-[#d9af6b] to-[#b98d46] px-2.5 py-1.5 font-f1 text-[13px] font-bold leading-none text-[#171108] shadow-[0_6px_18px_-6px_rgb(217_175_107/0.8)] md:mb-2">
            VS
          </span>

          <div className="min-w-0">
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/40">
              Bowler
            </p>
            <div className="grid gap-2 sm:grid-cols-[minmax(110px,0.75fr)_minmax(0,1.25fr)]">
              <TeamPicker
                label="Bowler team"
                teams={teams}
                value={bowlTeam?.name ?? ""}
                onChange={chooseBowlTeam}
                icon={<span className="font-f1 text-[13px] font-bold">P</span>}
              />
              <RosterPlayerPicker
                label="Bowler"
                value={bowlIndex}
                players={bowlPlayers.filter((player) => player.index !== batIndex)}
                onChange={setBowlIndex}
                placeholder="Search bowler"
                accent={CHART_GOLD}
                hideLabel
              />
            </div>
          </div>
        </div>

      </div>

      {failed && (
        <EmptyState title="Head-to-head unavailable">
          The ball-by-ball record for this pair could not be loaded.
        </EmptyState>
      )}

      {loading && !data && (
        <div className="grid gap-2 sm:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      )}

      {!loading && !failed && !pair && (
        <EmptyState title="No recorded meeting">
          These two have not faced each other in the international archive. They may play
          for the same side, or the bowler may not have bowled to this batsman yet.
        </EmptyState>
      )}

      {pair && data && (
        <>
          <div className="ck-in rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(29,80,158,0.12),rgba(0,0,0,0.12))] p-4 md:p-6">
            <p className="text-center text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/35">
              {formatNumber(pair.matches)} matches faced
            </p>
            <p className="mt-1 text-center font-f1 text-[56px] font-bold leading-none tabular-nums text-white md:text-[76px]">
              {formatNumber(pair.runs)}
            </p>
            <p className="mt-1 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
              Runs scored
            </p>
            <p className="mt-1 text-center text-[12.5px] text-white/40">
              off {formatNumber(pair.balls)} balls across {formatNumber(pair.matches)} match
              {pair.matches === 1 ? "" : "es"}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-4 sm:grid-cols-3">
              <MiniStat label="Strike rate" value={fc(pair.strikeRate, 1)} accent />
              <MiniStat label="Fours" value={formatNumber(pair.fours)} />
              <MiniStat label="Sixes" value={formatNumber(pair.sixes)} />
              <MiniStat label="Dismissals" value={formatNumber(pair.dismissals)} accent />
              <MiniStat label="Dot ball %" value={pct(pair.dotPct)} />
              <MiniStat label="Boundary %" value={pct(pair.boundaryPct)} />
            </div>

            <div className="mt-5 border-t border-white/[0.07] pt-4">
              <SegmentedBar pair={pair} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <p className="mb-3 font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
                Dismissal types
              </p>
              {pair.dismissals > 0 ? (
                <DonutChart
                  segments={pair.dismissalsByType
                    .filter((entry) => entry.value > 0)
                    .map((entry, index) => ({
                      label: entry.label,
                      value: entry.value,
                      colour: [CHART_BLUE, CHART_GOLD, CHART_RED, CHART_TEAL, "#64748b"][index % 5],
                    }))}
                  centerLabel="Dismissals"
                  centerValue={formatNumber(pair.dismissals)}
                  size={186}
                />
              ) : (
                <ChartEmpty label={`${data.batter.name} has never been dismissed by ${data.bowler.name}`} />
              )}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <p className="mb-3 font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
                By format
              </p>
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/30">
                Runs by format
              </p>
              <StatBars
                rows={pair.byFormat.map((entry) => ({
                  label: `${entry.format} · ${formatNumber(entry.balls)} balls`,
                  value: entry.runs,
                }))}
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <RadialGauge label="Dot-ball share" value={pair.dotPct} colour={CHART_TEAL} />
                <RadialGauge label="Boundary %" value={pair.boundaryPct} colour={CHART_GOLD} />
              </div>
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <p className="mb-3 font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
                Run composition
              </p>
              <DonutChart
                segments={[
                  {
                    label: "Running",
                    value: Math.max(0, pair.runs - pair.fours * 4 - pair.sixes * 6),
                    colour: CHART_TEAL,
                  },
                  { label: "Fours", value: pair.fours * 4, colour: CHART_GOLD },
                  { label: "Sixes", value: pair.sixes * 6, colour: CHART_RED },
                ]}
                centerLabel="Runs"
                centerValue={formatNumber(pair.runs)}
                size={186}
              />
            </div>
            <LastEncounter batterName={data.batter.name} last={data.last} />
          </div>
        </>
      )}
    </div>
  );
}

function DualBar({
  a,
  b,
  aLabel,
  bLabel,
}: {
  a: number;
  b: number;
  aLabel: string;
  bLabel: string;
}) {
  const total = Math.max(1, a + b);
  const aPct = (a / total) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="font-f1 font-bold tabular-nums text-[#b9d7ff]">
          {aLabel} wins <span className="ml-1 text-[13px] text-white/80">{a}</span>
        </span>
        <span className="font-f1 font-bold tabular-nums text-[#f0d3a0]">
          <span className="mr-1 text-[13px] text-white/80">{b}</span> wins {bLabel}
        </span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
        <span
          className="ck-bar h-full bg-[linear-gradient(90deg,#1d509e,#8fb4ec)]"
          style={{ width: `${Math.max(0, aPct)}%` }}
        />
        <span
          className="ck-bar ml-auto h-full bg-[linear-gradient(90deg,#d9af6b,#8a5e20)]"
          style={{ width: `${Math.max(0, 100 - aPct)}%`, transformOrigin: "right center" }}
        />
      </div>
    </div>
  );
}

function TeamHeadToHead({
  teams,
  gender,
}: {
  teams: StatsTeam[];
  gender: Gender;
}) {
  const preferred = gender === "women" ? PREFERRED_WOMEN : PREFERRED_MEN;
  const defaultA = useMemo(
    () => teams.find((team) => team.name === (gender === "women" ? "India Women" : "India"))?.name ?? teams[0]?.name ?? "",
    [teams, gender]
  );
  const defaultB = useMemo(
    () =>
      preferred
        .map((name) => teams.find((team) => team.name === name))
        .find((team) => team && team.name !== defaultA)?.name ??
      teams.find((team) => team.name !== defaultA)?.name ??
      teams[1]?.name ??
      teams[0]?.name ??
      "",
    [teams, defaultA, preferred]
  );
  const [teamA, setTeamA] = useState(defaultA);
  const [teamB, setTeamB] = useState(defaultB);

  useEffect(() => {
    setTeamA(defaultA);
    setTeamB(defaultB);
  }, [defaultA, defaultB]);

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

  const { data, loading, failed } = useTeamH2H(teamA, teamB);
  const record: StatsTeamRecord | null = data?.record ?? null;
  const a = teams.find((team) => team.name === teamA) ?? teams[0] ?? null;
  const b = teams.find((team) => team.name === teamB) ?? teams[1] ?? teams[0] ?? null;

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-white/40">
        Every completed international between two sides, broken down by format. Pick either
        team to swap the fixture.
      </p>

      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
        <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center gap-2.5">
            <TeamFlag team={{ name: a?.name ?? "", abbreviation: a?.code ?? "" }} size="md" />
            <div className="min-w-0">
              <p className="truncate font-f1 text-[16px] font-bold uppercase tracking-wide text-white">
                {a?.name ?? "Team 1"}
              </p>
              <p className="text-[11.5px] uppercase tracking-[0.12em] text-white/35">
                {a?.code ?? ""} · {a?.last ? `last played ${formatDayMonth(a.last)}` : "international"}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Select
              label="Team 1"
              compact
              value={teamA}
              onChange={chooseA}
              options={teams.map((team) => ({
                value: team.name,
                label: team.name,
                hint: team.code,
                leading: <TeamFlag team={{ name: team.name, abbreviation: team.code }} size="xs" />,
              }))}
            />
            <span className="rounded bg-[#d9af6b] px-1.5 py-0.5 font-f1 text-[9px] font-bold text-[#171108]">
              VS
            </span>
            <Select
              label="Team 2"
              compact
              value={teamB}
              onChange={chooseB}
              align="right"
              options={teams.map((team) => ({
                value: team.name,
                label: team.name,
                hint: team.code,
                leading: <TeamFlag team={{ name: team.name, abbreviation: team.code }} size="xs" />,
              }))}
            />
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2.5 text-right">
            <div className="min-w-0">
              <p className="truncate font-f1 text-[16px] font-bold uppercase tracking-wide text-white">
                {b?.name ?? "Team 2"}
              </p>
              <p className="text-[11.5px] uppercase tracking-[0.12em] text-white/35">
                {b?.code ?? ""} · {b?.last ? `last played ${formatDayMonth(b.last)}` : "international"}
              </p>
            </div>
            <TeamFlag team={{ name: b?.name ?? "", abbreviation: b?.code ?? "" }} size="md" />
          </div>
        </div>
      </div>

      {failed && (
        <EmptyState title="Team record unavailable">
          The all-time record between these sides could not be loaded.
        </EmptyState>
      )}

      {loading && !data && (
        <div className="grid gap-2 sm:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      )}

      {!loading && !failed && !record && (
        <EmptyState title="No completed meeting">
          These teams have no completed international in the archive yet.
        </EmptyState>
      )}

      {record && (
        <>
          <div className="ck-in grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-4 text-center">
              <p className="font-f1 text-[38px] font-bold leading-none tabular-nums text-white">
                {formatNumber(record.matches)}
              </p>
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                Matches
              </p>
            </div>
            <div className="rounded-xl border border-[#8fb4ec]/25 bg-[#1d509e]/12 px-4 py-4 text-center">
              <p className="font-f1 text-[38px] font-bold leading-none tabular-nums text-[#b9d7ff]">
                {formatNumber(record.winsA)}
              </p>
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                {a?.code ?? a?.name} wins
              </p>
            </div>
            <div className="rounded-xl border border-[#d9af6b]/25 bg-[#d9af6b]/10 px-4 py-4 text-center">
              <p className="font-f1 text-[38px] font-bold leading-none tabular-nums text-[#f0d3a0]">
                {formatNumber(record.winsB)}
              </p>
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                {b?.code ?? b?.name} wins
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
              <p className="mb-3 font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
                Result split
              </p>
              <DonutChart
                segments={[
                  { label: `${a?.code ?? "Team 1"} wins`, value: record.winsA, colour: CHART_BLUE },
                  { label: `${b?.code ?? "Team 2"} wins`, value: record.winsB, colour: CHART_GOLD },
                  { label: "Draws", value: record.draws, colour: CHART_TEAL },
                  { label: "Ties", value: record.ties, colour: CHART_RED },
                  { label: "No result", value: record.noResults, colour: "#64748b" },
                ]}
                centerLabel="Matches"
                centerValue={formatNumber(record.matches)}
                size={196}
              />
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
              <p className="mb-3 font-f1 text-[14px] font-bold uppercase tracking-[0.055em] text-white">
                By format
              </p>
              <div className="space-y-4">
                {record.byFormat.map((entry) => (
                  <div key={entry.format}>
                    <p className="mb-1.5 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">
                      <span>{entry.format}</span>
                      <span className="tabular-nums text-white/25">{entry.matches} matches</span>
                    </p>
                    <DualBar
                      a={entry.winsA}
                      b={entry.winsB}
                      aLabel={a?.code ?? "A"}
                      bLabel={b?.code ?? "B"}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {record.last && (
            <div className="rounded-xl border border-white/[0.06] border-l-2 border-l-[#d9af6b] bg-black/20 px-4 py-3">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/35">
                Last meeting
              </p>
              <p className="mt-1 font-f1 text-[17px] font-bold uppercase tracking-wide text-white">
                {record.last.venue || "Venue not recorded"}
              </p>
              <p className="mt-0.5 text-[12px] text-white/45">
                {formatDayMonth(record.last.date)} · {record.last.teamA} vs {record.last.teamB} ·{" "}
                {record.last.format}
              </p>
              {record.last.result && (
                <p className="mt-1.5 text-[12.5px] font-semibold text-[#8fb4ec]">
                  {record.last.result}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function HeadToHeadSection({ gender }: { gender: Gender }) {
  const { data: roster, loading, failed } = useStatsRoster(gender);
  const [mode, setMode] = useState<"team" | "player">("player");
  const teams = roster?.teams ?? [];
  const players = roster?.players ?? [];

  return (
    <div className="space-y-3">
      <ModeToggle mode={mode} onChange={setMode} />

      {failed && (
        <EmptyState title="Head-to-head data unavailable">
          The ball-by-ball index could not be loaded.
        </EmptyState>
      )}

      {loading && !roster && (
        <div className="space-y-3" aria-busy="true">
          <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        </div>
      )}

      {roster && mode === "player" && (
        <PlayerHeadToHead teams={teams} players={players} gender={gender} />
      )}
      {roster && mode === "team" && <TeamHeadToHead teams={teams} gender={gender} />}

      {roster && (
        <p className="text-[11px] leading-relaxed text-white/30">
          Ball-by-ball international archive via Cricsheet · through {roster.maxDate}. Active
          players are those who appeared in an international in the last two years.
        </p>
      )}
    </div>
  );
}
