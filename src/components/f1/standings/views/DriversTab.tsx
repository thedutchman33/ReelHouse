"use client";

import { useMemo, useState } from "react";
import {
  RacePointsChart,
  SeasonStatBars,
  SeasonStatLegend,
  StandingsLineChart,
  type LineSeries,
} from "@/components/f1/standings/charts";
import PointsMatrix, { MatrixLegend } from "@/components/f1/standings/matrix";
import Editorial from "@/components/f1/standings/views/Editorial";
import {
  EmptyState,
  Panel,
  Segmented,
  StandingsTable,
  gapFmt,
  pointsFmt,
  surname,
} from "@/components/f1/standings/parts";
import type { SeasonPayload } from "@/lib/standings";

type SessionMode = "all" | "race" | "sprint" | "quali";
type Metric = "points" | "position";

export default function DriversTab({
  payload,
  seasons,
  onSeason,
}: {
  payload: SeasonPayload;
  seasons: number[];
  onSeason: (season: number) => void;
}) {
  const [session, setSession] = useState<SessionMode>("all");
  const [metric, setMetric] = useState<Metric>("points");

  const { season, rounds } = payload;
  const scoredRounds = rounds.filter((r) => r.complete);
  const completed = scoredRounds.length;
  const roundCount = rounds.length;

  // The reference stops its progression charts at the last scored round; the
  // heatmap keeps every scheduled round so unraced columns stay visible.
  const axis = useMemo(
    () => scoredRounds.map((r) => ({ round: r.round, country: r.country, name: r.name })),
    [scoredRounds]
  );

  const series = useMemo<LineSeries[]>(
    () =>
      payload.driverStandings.map((row) => ({
        id: row.id,
        label: row.code,
        name: surname(row.name),
        colour: `#${row.colour}`,
        values: (payload.pointsByRound[row.id] ?? []).slice(0, completed),
      })),
    [completed, payload]
  );

  const rankSeries = useMemo<LineSeries[]>(
    () =>
      payload.driverStandings.map((row) => ({
        id: row.id,
        label: row.code,
        name: surname(row.name),
        colour: `#${row.colour}`,
        values: (payload.ranksByRound[row.id] ?? []).slice(0, completed),
      })),
    [completed, payload]
  );

  const statRows = useMemo(
    () =>
      payload.driverStandings.map((row) => {
        const stats = payload.driverStats[row.id];
        return {
          id: row.id,
          label: surname(row.name),
          colour: `#${row.colour}`,
          wins: stats?.wins ?? 0,
          podiums: stats?.podiums ?? 0,
          pointsFinishes: stats?.pointsFinishes ?? 0,
          poles: stats?.poles ?? 0,
          dnfs: stats?.dnfs ?? 0,
        };
      }),
    [payload]
  );

  const raceEntries = useMemo(
    () =>
      payload.driverStandings.map((row) => ({
        id: row.id,
        label: row.code,
        name: surname(row.name),
        colour: row.colour,
      })),
    [payload]
  );

  const effectiveMetric: Metric = session === "quali" ? "position" : metric;

  const matrixValues = useMemo(() => {
    return payload.driverStandings.map((row) => {
      const race = payload.raceByRound[row.id] ?? [];
      const sprint = payload.sprintByRound[row.id] ?? [];
      return Array.from({ length: roundCount }, (_, i) => {
        if (session === "quali") return null;
        if (session === "race") return race[i] == null ? null : payload.racePointsByRound[row.id]?.[i] ?? 0;
        if (session === "sprint") return sprint[i] == null ? null : payload.sprintPointsByRound[row.id]?.[i] ?? 0;
        if (race[i] == null && sprint[i] == null) return null;
        return payload.roundPoints[row.id]?.[i] ?? 0;
      });
    });
  }, [payload, roundCount, session]);

  const matrixPositions = useMemo(() => {
    return payload.driverStandings.map((row) => {
      if (session === "quali") return payload.qualiByRound[row.id] ?? [];
      if (session === "sprint") return payload.sprintByRound[row.id] ?? [];
      return payload.raceByRound[row.id] ?? [];
    });
  }, [payload, session]);

  const matrixRows = useMemo(
    () =>
      payload.driverStandings.map((row) => ({
        id: row.id,
        label: surname(row.name),
        colour: row.colour,
      })),
    [payload]
  );

  const leader = payload.driverStandings[0];
  const second = payload.driverStandings[1];
  const winsLeader = leader ? payload.driverStats[leader.id]?.wins ?? 0 : 0;
  const remaining = Math.max(0, roundCount - completed);
  const recentSeasons = seasons.filter((s) => s <= season).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel title={`${season} F1 Driver Standings`} exportName={`f1-${season}-driver-standings`}>
          {payload.driverStandings.length ? (
            <>
              <StandingsTable rows={payload.driverStandings} variant="driver" season={season} />
              <p className="mt-3 text-[10px] leading-relaxed text-white/30">
                {completed} of {roundCount} rounds scored. Evo. is the points gap to the leader.
              </p>
            </>
          ) : (
            <EmptyState>No drivers&apos; championship table is published for {season} yet.</EmptyState>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Driver Points Evolution" exportName={`f1-${season}-driver-points-evolution`}>
            <StandingsLineChart
              series={series}
              rounds={axis}
              ariaLabel={`Cumulative driver points per round, ${season}`}
              emptyLabel="No points have been scored yet this season."
            />
          </Panel>

          <Panel title="Driver Ranking Evolution" exportName={`f1-${season}-driver-ranking-evolution`}>
            <StandingsLineChart
              series={rankSeries}
              rounds={axis}
              invert
              endLabels
              ariaLabel={`Driver championship positions per round, ${season}`}
              valueFormat={(v) => `P${Math.round(v)}`}
              emptyLabel="No championship positions yet."
            />
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Driver Season Stats" exportName={`f1-${season}-driver-season-stats`}>
          <SeasonStatBars rows={statRows} ariaLabel={`Driver season statistics, ${season}`} />
          <div className="mt-1">
            <SeasonStatLegend />
          </div>
        </Panel>

        <Panel title="Driver Points by Race" exportName={`f1-${season}-driver-points-by-race`}>
          <RacePointsChart
            rounds={axis}
            entries={raceEntries}
            points={payload.roundPoints}
            ariaLabel={`Points scored by every driver in each round, ${season}`}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-white/30">
            One row per Grand Prix; each segment is a scorer&apos;s points, with the round total on the right.
          </p>
        </Panel>
      </div>

      <Panel
        title="Driver Points and Positions by Round"
        meta={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Segmented<SessionMode>
              label="Session"
              value={session}
              onChange={setSession}
              options={[
                { value: "all", label: "All" },
                { value: "race", label: "Race" },
                { value: "sprint", label: "Sprint" },
                { value: "quali", label: "Qualifying" },
              ]}
            />
            <Segmented<Metric>
              label="Metric"
              value={effectiveMetric}
              onChange={setMetric}
              options={[
                { value: "points", label: "Points" },
                { value: "position", label: "Position" },
              ]}
            />
          </div>
        }
        exportName={`f1-${season}-driver-round-matrix`}
      >
        <PointsMatrix
          rows={matrixRows}
          values={matrixValues}
          positions={matrixPositions}
          mode={effectiveMetric}
          totals={Object.fromEntries(payload.driverStandings.map((row) => [row.id, row.points]))}
          caption={`${season} driver ${effectiveMetric === "points" ? "points" : "positions"} by round, ${session}`}
        />
        {session === "quali" ? (
          <p className="mt-2 text-[10px] text-white/35">
            Qualifying awards no championship points, so grid positions are shown.
          </p>
        ) : (
          <MatrixLegend note={`Showing ${session === "all" ? "combined race and sprint" : session} points.`} />
        )}
      </Panel>

      {/* ----------------------------- editorial ----------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="How to Read Championship Standings">
          <div className="space-y-3 text-[12px] leading-relaxed text-white/55">
            <p>
              The standings are sorted by points. A tie is broken by the number of wins, then the best finish,
              then the best result countback — never by the order the drivers happen to appear in.
            </p>
            <p>
              <span className="font-bold text-white/80">Pts</span> is the official total from the championship
              classification. <span className="font-bold text-white/80">Evo.</span> is the gap to the leader. The
              charts above are built from every race and sprint result in the season, so a driver who missed a
              round keeps their real total; no points are estimated.
            </p>
            <p>
              Hover any round on the points chart for the full standings at that point, or hover a point on the
              ranking chart for that driver&apos;s championship position.
            </p>
          </div>
        </Panel>

        <Panel title="Drivers' Points System">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[300px] border-collapse text-[11px]">
              <caption className="sr-only">Points awarded in {season}</caption>
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.02em] text-white/50">
                  <th scope="col" className="py-1.5 text-left">Position</th>
                  <th scope="col" className="py-1.5 text-right">Grand Prix</th>
                  <th scope="col" className="py-1.5 text-right">Sprint</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[25, 18, 15, 12, 10, 8, 6, 4, 2, 1].map((pts, i) => (
                  <tr key={i} className="border-b border-white/[0.04] last:border-0">
                    <td className="py-1.5 text-white/55">P{i + 1}</td>
                    <td className="py-1.5 text-right font-bold text-white/85">{pts}</td>
                    <td className="py-1.5 text-right text-white/45">{i < 8 ? [8, 7, 6, 5, 4, 3, 2, 1][i] : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[10px] leading-relaxed text-white/30">
            Fastest-lap points are no longer awarded. Half points apply only when a race is stopped short;
            those totals come straight from the official classification. In the constructors&apos; championship both
            cars score for the team, so a team&apos;s total is the sum of its drivers&apos; points.
          </p>
        </Panel>

        <Panel title={`${season} World Championship`}>
          {leader ? (
            <div className="space-y-3 text-[12px] leading-relaxed text-white/55">
              <p>
                <span className="font-bold text-white">{leader.name}</span> leads the {season} drivers&apos;
                championship on <span className="font-bold tabular-nums text-white">{pointsFmt(leader.points)}</span> points
                with {winsLeader} {winsLeader === 1 ? "win" : "wins"} from {completed}{" "}
                {completed === 1 ? "round" : "rounds"}.
              </p>
              {second && (
                <p>
                  {second.name} is second, <span className="tabular-nums text-white/80">{gapFmt(second.points - leader.points)}</span>{" "}
                  behind. {remaining > 0
                    ? `${remaining} rounds remain, with 25 points still available for each Grand Prix win and a further eight for a sprint win.`
                    : "Every round has been scored, so the table is final."}
                </p>
              )}
              <p className="text-white/40">
                Sources: Jolpica F1 (Ergast successor) championship classification, race, sprint and qualifying
                results. Derived statistics are computed from those results and labelled as such.
              </p>
            </div>
          ) : (
            <EmptyState>No champion can be shown until a round has been scored.</EmptyState>
          )}
        </Panel>

        <Editorial payload={payload} />

        <Panel title="Browse Other Seasons">
          <p className="mb-3 text-[11px] text-white/40">
            The same tables and charts are available for every championship since 1950.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recentSeasons.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSeason(s)}
                aria-current={s === season ? "true" : undefined}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold tabular-nums transition-colors ${
                  s === season
                    ? "bg-gradient-to-r from-[#e10600] to-[#ff2b1f] text-white"
                    : "bg-white/[0.05] text-white/55 hover:bg-white/[0.1] hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
