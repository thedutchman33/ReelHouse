"use client";

import { useEffect, useMemo, useState } from "react";
import type { Gender } from "@/lib/cricket/types";
import type { StatsPlayer, StatsPlayerSummary, StatsTeam } from "@/lib/cricket/stats-types";
import {
  battingRows,
  bowlingRows,
  careerSpanLabel,
  seasonBowlingStrikeRatePoints,
  seasonRunPoints,
  seasonStrikeRatePoints,
  seasonWicketPoints,
} from "@/lib/cricket/stats-rows";
import { formatSplit, summariseBatting, summariseBowling } from "@/lib/cricket/player-stats-summary";
import {
  formatDayMonth,
  formatNumber,
  iccPortraitUrl,
  teamJerseyColour,
} from "@/lib/cricket/shared";
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
  RadialGauge,
  StatBars,
} from "./stats-charts";
import { TeamFlag } from "./TeamFlag";
import { EmptyState, PlayerAvatar, Select } from "./ui";

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2.5">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</p>
      <p
        className={`mt-1 font-f1 text-[22px] font-bold leading-none tabular-nums ${
          accent ? "text-[#d9af6b]" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <p className="font-f1 text-[14px] font-bold uppercase tracking-[0.06em] text-white">
        {title}
      </p>
      {hint && <p className="text-[11px] uppercase tracking-[0.12em] text-white/30">{hint}</p>}
    </div>
  );
}

function fc(value: number | null, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function PlayerIdentity({
  player,
  team,
}: {
  player: StatsPlayer;
  team: StatsTeam | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#8fb4ec]/18 bg-[linear-gradient(112deg,rgba(29,80,158,0.24),rgba(8,17,34,0.9)_48%,rgba(217,175,107,0.08))] p-4 md:p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-[#3f78d8]/20 blur-3xl"
      />
      <div className="relative flex flex-wrap items-center gap-4">
        <PlayerAvatar
          player={{ name: player.name, imageUrl: iccPortraitUrl(player.iccId) }}
          colour={teamJerseyColour(player.team)}
          size={104}
          className="rounded-2xl ring-2 ring-[#8fb4ec]/25 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.9)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#8fb4ec]/30 bg-[#1d509e]/25 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#b9d7ff]">
              International career
            </span>
            <span className="rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#7ee2a8]">
              Active
            </span>
            {player.role === "All-rounder" && (
              <span className="rounded-full border border-[#d9af6b]/30 bg-[#d9af6b]/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#d9af6b]">
                All-rounder
              </span>
            )}
          </div>
          <h3 className="mt-2 font-f1 text-[32px] font-bold uppercase leading-[0.92] tracking-wide text-white md:text-[42px]">
            {player.name}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-white/55">
            <TeamFlag team={{ name: player.team, abbreviation: team?.code ?? "" }} size="sm" />
            <span className="font-semibold text-[#8fb4ec]">{player.role}</span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span>{careerSpanLabel(player)}</span>
            <span aria-hidden="true" className="text-white/20">·</span>
            <span>{formatNumber(player.matches)} internationals</span>
          </p>
        </div>
        <div className="flex min-w-[180px] flex-1 flex-wrap justify-end gap-1.5 text-right sm:flex-none">
          {[
            ["Debut", formatDayMonth(player.first)],
            ["Last played", formatDayMonth(player.last)],
            ["Format", player.bat.formats.filter((row) => row.innings > 0).map((row) => row.format).join(" · ") || "—"],
            ["Innings", formatNumber(Math.max(player.bat.innings, player.bowl.innings))],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-[132px] flex-1 rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-2 text-left sm:flex-none"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                {label}
              </p>
              <p className="mt-0.5 truncate text-[12.5px] text-white/70">{value || "—"}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BattingPanel({ player }: { player: StatsPlayer }) {
  const rows = useMemo(() => battingRows(player), [player]);
  const summary = useMemo(() => summariseBatting(rows), [rows]);
  const seasons = useMemo(() => seasonRunPoints(player), [player]);
  const strikeRates = useMemo(() => seasonStrikeRatePoints(player), [player]);
  const splits = useMemo(() => formatSplit(rows, "runs"), [rows]);

  if (!rows.length) return null;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3.5 md:p-4">
      <SectionTitle title="Batting" hint="International career" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label="Matches" value={formatNumber(summary.matches)} />
        <StatCard label="Runs" value={formatNumber(summary.runs)} accent />
        <StatCard label="Average" value={fc(summary.average, 2)} />
        <StatCard label="Strike rate" value={fc(summary.strikeRate, 1)} />
        <StatCard label="High score" value={summary.highScore ?? "—"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <SectionTitle title="Runs by season" hint="All international formats" />
          <LineChart
            series={[{ name: "Runs", colour: CHART_BLUE, points: seasons }]}
            ariaLabel={`Runs scored by season by ${player.name}`}
            valueLabel="Runs"
            height={238}
          />
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <SectionTitle title="Run composition" hint="Career" />
          <DonutChart
            segments={[
              { label: "Fours", value: summary.fours * 4, colour: CHART_GOLD },
              { label: "Sixes", value: summary.sixes * 6, colour: CHART_RED },
              { label: "Running", value: summary.runningRuns, colour: CHART_TEAL },
            ]}
            centerLabel="Runs"
            centerValue={formatNumber(summary.runs)}
            size={190}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <RadialGauge label="Boundary rate / 100 balls" value={summary.boundaryRate} />
            <RadialGauge label="Dot-ball share" value={summary.dotPct} colour={CHART_GOLD} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <SectionTitle title="By format" hint="Runs" />
          <StatBars rows={splits} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/35">
            <span>{summary.hundreds} hundreds</span>
            <span>{summary.fifties} fifties</span>
            <span>{summary.balls} balls faced</span>
            <span>{summary.notOuts} not out</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <SectionTitle title="Strike rate by season" hint="Runs per 100 balls" />
          {strikeRates.length ? (
            <LineChart
              series={[{ name: "Strike rate", colour: CHART_GOLD, points: strikeRates }]}
              ariaLabel={`Strike rate by season for ${player.name}`}
              valueLabel="SR"
              height={200}
            />
          ) : (
            <ChartEmpty label="Season strike rate unavailable" />
          )}
        </div>
      </div>
    </div>
  );
}

function BowlingPanel({ player }: { player: StatsPlayer }) {
  const rows = useMemo(() => bowlingRows(player), [player]);
  const summary = useMemo(() => summariseBowling(rows), [rows]);
  const seasons = useMemo(() => seasonWicketPoints(player), [player]);
  const strikeRates = useMemo(() => seasonBowlingStrikeRatePoints(player), [player]);
  const splits = useMemo(() => formatSplit(rows, "wickets"), [rows]);
  const dots = player.bowl.dots;

  if (!rows.length) return null;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3.5 md:p-4">
      <SectionTitle title="Bowling" hint="International career" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label="Matches" value={formatNumber(summary.matches)} />
        <StatCard label="Wickets" value={formatNumber(summary.wickets)} accent />
        <StatCard label="Average" value={fc(summary.average, 2)} />
        <StatCard label="Economy" value={fc(summary.economy, 2)} />
        <StatCard label="Best" value={summary.best ?? "—"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <SectionTitle title="Wickets by season" hint="All international formats" />
          <LineChart
            series={[{ name: "Wickets", colour: CHART_GOLD, points: seasons }]}
            ariaLabel={`Wickets taken by season by ${player.name}`}
            valueLabel="Wickets"
            height={238}
          />
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <SectionTitle title="Delivery profile" hint="Career" />
          {summary.balls > 0 ? (
            <DonutChart
              segments={[
                { label: "Dot balls", value: dots, colour: CHART_TEAL },
                { label: "Scoring balls", value: Math.max(0, summary.balls - dots), colour: CHART_BLUE },
              ]}
              centerLabel="Balls"
              centerValue={formatNumber(summary.balls)}
              size={190}
            />
          ) : (
            <ChartEmpty label="Delivery split unavailable" />
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <RadialGauge label="Dot-ball share" value={summary.dotPct} colour={CHART_TEAL} />
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
              <p className="font-f1 text-[28px] font-bold leading-none tabular-nums text-white">
                {player.bowl.innings > 0 ? (player.bowl.wickets / player.bowl.innings).toFixed(2) : "—"}
              </p>
              <p className="text-[11.5px] font-semibold uppercase leading-snug tracking-[0.12em] text-white/40">
                Wickets per innings
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <SectionTitle title="By format" hint="Wickets" />
          <StatBars rows={splits} colour={CHART_GOLD} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/35">
            <span>{summary.fiveWickets} five-wicket hauls</span>
            <span>{summary.balls} balls bowled</span>
            <span>{formatNumber(summary.conceded)} runs conceded</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <SectionTitle title="Strike rate by season" hint="Balls per wicket" />
          {strikeRates.length ? (
            <LineChart
              series={[{ name: "Bowling strike rate", colour: CHART_TEAL, points: strikeRates }]}
              ariaLabel={`Bowling strike rate by season for ${player.name}`}
              valueLabel="Balls/wkt"
              height={200}
            />
          ) : (
            <ChartEmpty label="Season strike rate unavailable" />
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlayerStatsSection({ gender }: { gender: Gender }) {
  const { data: roster, loading: rosterLoading, failed: rosterFailed } = useStatsRoster(gender);
  const teams = roster?.teams ?? [];
  const byIndex = useMemo(
    () => new Map((roster?.players ?? []).map((player) => [player.index, player])),
    [roster]
  );
  const [teamName, setTeamName] = useState(gender === "women" ? "India Women" : "India");
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);

  useEffect(() => {
    setTeamName(gender === "women" ? "India Women" : "India");
    setPlayerIndex(null);
  }, [gender]);

  useEffect(() => {
    if (!teams.length) return;
    const fallback = teams.find((team) => team.name === (gender === "women" ? "India Women" : "India"))?.name ?? teams[0].name;
    setTeamName((current) => (teams.some((team) => team.name === current) ? current : fallback));
  }, [teams, gender]);

  const team = teams.find((entry) => entry.name === teamName) ?? teams[0] ?? null;
  const teamPlayers = useMemo<StatsPlayerSummary[]>(
    () =>
      (team?.all ?? [])
        .map((index) => byIndex.get(index))
        .filter((player): player is StatsPlayerSummary => Boolean(player)),
    [team, byIndex]
  );

  useEffect(() => {
    if (!team) return;
    setPlayerIndex((current) =>
      current != null && team.all.includes(current)
        ? current
        : team.bat[0] ?? team.all[0] ?? null
    );
  }, [team]);

  const { data: player, loading, failed } = useStatsPlayer(playerIndex);

  if (rosterFailed) {
    return (
      <EmptyState title="Career data unavailable">
        The ball-by-ball career index could not be loaded.
      </EmptyState>
    );
  }

  if (rosterLoading && !roster) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
          <div className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />
        </div>
        <div className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />
        <div className="grid gap-2 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-[64px] animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
        <div className="h-[250px] animate-pulse rounded-xl bg-white/[0.03]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 sm:grid-cols-[minmax(160px,220px)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.18em] text-white/40">
            Team
          </p>
          <Select
            label="Team"
            compact
            value={team?.name ?? ""}
            onChange={setTeamName}
            options={teams.map((entry) => ({
              value: entry.name,
              label: entry.name,
              hint: `${entry.code} · ${entry.gender === "women" ? "Women" : "Men"}`,
              leading: <TeamFlag team={{ name: entry.name, abbreviation: entry.code }} size="xs" />,
            }))}
          />
        </div>
        <RosterPlayerPicker
          label="Player"
          value={playerIndex}
          players={teamPlayers}
          onChange={setPlayerIndex}
          placeholder={`Search ${team?.name ?? "players"}`}
        />
      </div>

      {player && <PlayerIdentity player={player} team={team} />}

      {failed && (
        <EmptyState title="Career tables unavailable">
          The selected player&apos;s career totals could not be loaded.
        </EmptyState>
      )}

      {loading && !player && (
        <div className="space-y-2" aria-busy="true">
          <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="grid gap-2 sm:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-[64px] animate-pulse rounded-xl bg-white/[0.04]" />
            ))}
          </div>
          <div className="h-[250px] animate-pulse rounded-xl bg-white/[0.03]" />
        </div>
      )}

      {player && (
        <>
          {/* A specialist bowler's own discipline leads; batters keep the
              batting card first, all-rounders keep both. */}
          {player.role === "Bowler" ? (
            <>
              {player.bowl.innings > 0 && <BowlingPanel player={player} />}
              {player.bat.innings > 0 && <BattingPanel player={player} />}
            </>
          ) : (
            <>
              {player.bat.innings > 0 && <BattingPanel player={player} />}
              {player.bowl.innings > 0 && <BowlingPanel player={player} />}
            </>
          )}
          {player.bat.innings === 0 && player.bowl.innings === 0 && (
            <EmptyState title="No senior international totals">
              This player is in the active squad list but has not batted or bowled in the
              international archive yet.
            </EmptyState>
          )}
        </>
      )}
    </div>
  );
}
