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
import {
  EmptyState,
  Panel,
  Segmented,
  StandingsTable,
  teamCode,
} from "@/components/f1/standings/parts";
import type { SeasonPayload } from "@/lib/standings";

type SessionMode = "all" | "race" | "sprint" | "quali";
type Metric = "points" | "position";

const min = (values: (number | null)[]): (number | null)[] => values;

export default function ConstructorsTab({ payload }: { payload: SeasonPayload }) {
  const [session, setSession] = useState<SessionMode>("all");
  const [metric, setMetric] = useState<Metric>("points");

  const { season, rounds } = payload;
  const roundCount = rounds.length;
  const scoredRounds = rounds.filter((r) => r.complete);
  const completed = scoredRounds.length;

  const axis = useMemo(
    () => scoredRounds.map((r) => ({ round: r.round, country: r.country, name: r.name })),
    [scoredRounds]
  );

  /** Per-team aggregates: points splits and best positions per round. */
  const teamRounds = useMemo(() => {
    const driversByTeam = new Map<string, string[]>();
    for (const d of payload.drivers) {
      const list = driversByTeam.get(d.teamId) ?? [];
      list.push(d.id);
      driversByTeam.set(d.teamId, list);
    }
    const best = (ids: string[], source: Record<string, (number | null)[]>, i: number) => {
      let out: number | null = null;
      for (const id of ids) {
        const v = source[id]?.[i];
        if (v != null && (out == null || v < out)) out = v;
      }
      return out;
    };
    const sum = (ids: string[], source: Record<string, number[]>, i: number) =>
      ids.reduce((acc, id) => acc + (source[id]?.[i] ?? 0), 0);

    return new Map(
      payload.constructorStandings.map((row) => {
        const ids = driversByTeam.get(row.teamId) ?? [];
        const points = payload.teamPointsByRound[row.teamId] ?? [];
        return [
          row.teamId,
          {
            points,
            race: Array.from({ length: roundCount }, (_, i) => sum(ids, payload.racePointsByRound, i)),
            sprint: Array.from({ length: roundCount }, (_, i) => sum(ids, payload.sprintPointsByRound, i)),
            racePos: Array.from({ length: roundCount }, (_, i) => best(ids, payload.raceByRound, i)),
            sprintPos: Array.from({ length: roundCount }, (_, i) => best(ids, payload.sprintByRound, i)),
            qualiPos: Array.from({ length: roundCount }, (_, i) => best(ids, payload.qualiByRound, i)),
          },
        ] as const;
      })
    );
  }, [payload, roundCount]);

  const pointsSeries = useMemo<LineSeries[]>(() => {
    const cumulative = (values: number[]) => {
      let total = 0;
      return values.map((v) => (total += v));
    };
    return payload.constructorStandings.map((row) => ({
      id: row.id,
      label: teamCode(row.name),
      name: row.name,
      colour: `#${row.colour}`,
      values: cumulative(payload.teamPointsByRound[row.teamId] ?? []).slice(0, completed),
    }));
  }, [completed, payload]);

  const rankSeries = useMemo<LineSeries[]>(
    () =>
      payload.constructorStandings.map((row) => ({
        id: row.id,
        label: teamCode(row.name),
        name: row.name,
        colour: `#${row.colour}`,
        values: (payload.teamRanksByRound[row.teamId] ?? []).slice(0, completed),
      })),
    [completed, payload]
  );

  const statRows = useMemo(
    () =>
      payload.constructorStandings.map((row) => {
        const stats = payload.teamStats[row.teamId];
        return {
          id: row.id,
          label: teamCode(row.name),
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
      payload.constructorStandings.map((row) => ({
        id: row.teamId,
        label: teamCode(row.name),
        name: row.name,
        colour: row.colour,
      })),
    [payload]
  );

  const effectiveMetric: Metric = session === "quali" ? "position" : metric;

  const matrixRows = useMemo(
    () => payload.constructorStandings.map((row) => ({ id: row.id, label: row.name, colour: row.colour })),
    [payload]
  );

  const matrixValues = useMemo(
    () =>
      payload.constructorStandings.map((row) => {
        const agg = teamRounds.get(row.teamId);
        if (!agg) return [];
        if (session === "quali") return Array.from({ length: roundCount }, () => null);
        if (session === "race") return agg.race.map((v, i) => (agg.racePos[i] == null ? null : v));
        if (session === "sprint") return agg.sprint.map((v, i) => (agg.sprintPos[i] == null ? null : v));
        return agg.points.map((v, i) => (agg.racePos[i] == null && agg.sprintPos[i] == null ? null : v));
      }),
    [payload, roundCount, session, teamRounds]
  );

  const matrixPositions = useMemo(
    () =>
      payload.constructorStandings.map((row) => {
        const agg = teamRounds.get(row.teamId);
        if (!agg) return [];
        if (session === "quali") return min(agg.qualiPos);
        if (session === "sprint") return min(agg.sprintPos);
        return min(agg.racePos);
      }),
    [payload, session, teamRounds]
  );

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel title={`${season} F1 Constructor Standings`} exportName={`f1-${season}-constructor-standings`}>
          {payload.constructorStandings.length ? (
            <>
              <StandingsTable rows={payload.constructorStandings} variant="constructor" season={season} />
              <p className="mt-3 text-[10px] leading-relaxed text-white/30">
                Both cars score for the team. {completed} of {roundCount} rounds scored. Evo. is the points gap to
                the leader.
              </p>
            </>
          ) : (
            <EmptyState>No constructors&apos; championship table is published for {season} yet.</EmptyState>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Constructor Points Evolution" exportName={`f1-${season}-constructor-points-evolution`}>
            <StandingsLineChart
              series={pointsSeries}
              rounds={axis}
              ariaLabel={`Cumulative constructor points per round, ${season}`}
              emptyLabel="No constructor points have been scored yet."
            />
          </Panel>

          <Panel title="Constructor Ranking Evolution" exportName={`f1-${season}-constructor-ranking-evolution`}>
            <StandingsLineChart
              series={rankSeries}
              rounds={axis}
              invert
              endLabels
              endLabelFormat={(s) => s.name ?? s.label}
              ariaLabel={`Constructor championship positions per round, ${season}`}
              valueFormat={(v) => `P${Math.round(v)}`}
              emptyLabel="No constructor positions yet."
            />
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Constructor Season Stats" exportName={`f1-${season}-constructor-season-stats`}>
          <SeasonStatBars rows={statRows} ariaLabel={`Constructor season statistics, ${season}`} />
          <div className="mt-1">
            <SeasonStatLegend />
          </div>
        </Panel>

        <Panel title="Constructor Points by Race" exportName={`f1-${season}-constructor-points-by-race`}>
          <RacePointsChart
            rounds={axis}
            entries={raceEntries}
            points={payload.teamPointsByRound}
            ariaLabel={`Constructor points scored in each round, ${season}`}
          />
          <p className="mt-2 text-[10px] leading-relaxed text-white/30">
            Both cars&apos; points are combined in each row; the round total sits on the right.
          </p>
        </Panel>
      </div>

      <Panel
        title="Team Points and Positions by Round"
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
        exportName={`f1-${season}-constructor-round-matrix`}
      >
        <PointsMatrix
          rows={matrixRows}
          values={matrixValues}
          positions={matrixPositions}
          mode={effectiveMetric}
          totals={Object.fromEntries(payload.constructorStandings.map((row) => [row.teamId, row.points]))}
          rowLabel="Team"
          caption={`${season} constructor ${effectiveMetric === "points" ? "points" : "positions"} by round, ${session}`}
        />
        {session === "quali" ? (
          <p className="mt-2 text-[10px] text-white/35">
            Qualifying awards no championship points, so the best grid position is shown.
          </p>
        ) : (
          <MatrixLegend note={`Showing ${session === "all" ? "combined race and sprint" : session} points.`} />
        )}
      </Panel>
    </div>
  );
}
