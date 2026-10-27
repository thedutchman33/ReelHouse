"use client";

import { useMemo, useState } from "react";
import {
  GapBars,
  StandingsLineChart,
  type LineSeries,
} from "@/components/f1/standings/charts";
import {
  EmptyState,
  Panel,
  Segmented,
  Selector,
  TeamMark,
  pointsFmt,
  surname,
} from "@/components/f1/standings/parts";
import { DriverAvatar } from "@/components/f1/TeamLogo";
import type { DriverRef, SeasonPayload } from "@/lib/standings";

type Pair = {
  teamId: string;
  teamName: string;
  colour: string;
  a: DriverRef;
  b: DriverRef;
  quali: { a: number; b: number };
  qualiGP: { a: number; b: number };
  qualiSprint: { a: number; b: number };
  race: { a: number; b: number };
  raceGP: { a: number; b: number };
  raceSprint: { a: number; b: number };
};

type QualiMode = "all" | "quali" | "sprint";
type RaceMode = "all" | "race" | "sprint";

function countHeadToHead(
  payload: SeasonPayload,
  a: string,
  b: string,
  ...sources: Record<string, (number | null)[]>[]
) {
  let aw = 0;
  let bw = 0;
  for (const source of sources) {
    for (let i = 0; i < payload.rounds.length; i++) {
      const pa = source[a]?.[i];
      const pb = source[b]?.[i];
      if (pa == null || pb == null) continue;
      if (pa < pb) aw++;
      else if (pb < pa) bw++;
    }
  }
  return { a: aw, b: bw };
}

function SplitBar({
  aPct,
  aColour,
  bColour,
}: {
  aPct: number;
  aColour: string;
  bColour: string;
}) {
  const pct = Math.max(0, Math.min(100, aPct));
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <span style={{ width: `${pct}%`, backgroundColor: aColour }} />
      <span style={{ width: `${100 - pct}%`, backgroundColor: bColour, opacity: 0.75 }} />
    </div>
  );
}

function TeamBattle({
  pair,
  metric,
  selected,
  onSelect,
}: {
  pair: Pair;
  metric: { a: number; b: number };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition ${
        selected ? "bg-white/[0.055]" : "hover:bg-white/[0.03]"
      }`}
    >
      <span className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
        <DriverAvatar name={pair.a.name} colour={`#${pair.colour}`} headshotUrl={pair.a.headshotUrl} size={20} />
        <span className="hidden text-[10px] font-bold tabular-nums text-white/55 sm:inline">{pair.a.code}</span>
        <span className="min-w-0 truncate text-[10px] text-white/70 sm:text-[11px]">{surname(pair.a.name)}</span>
        <span className="w-5 shrink-0 text-right font-f1 text-[12px] font-bold tabular-nums text-white sm:w-7">
          {metric.a}
        </span>
      </span>
      <span className="flex w-[92px] shrink-0 items-center justify-center gap-1 sm:w-[130px]">
        <TeamMark team={pair.teamName} size={12} tone="mono" />
        <span className="truncate text-[8px] uppercase tracking-[0.1em] text-white/30">
          {pair.teamName}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <span className="w-5 shrink-0 text-left font-f1 text-[12px] font-bold tabular-nums text-white sm:w-7">
          {metric.b}
        </span>
        <span className="min-w-0 truncate text-[10px] text-white/70 sm:text-[11px]">{surname(pair.b.name)}</span>
        <span className="hidden text-[10px] font-bold tabular-nums text-white/55 sm:inline">{pair.b.code}</span>
        <DriverAvatar name={pair.b.name} colour={`#${pair.colour}`} headshotUrl={pair.b.headshotUrl} size={20} />
      </span>
    </button>
  );
}

export default function HeadToHeadTab({ payload }: { payload: SeasonPayload }) {
  const { season, driverStandings, rounds } = payload;

  const pairs = useMemo<Pair[]>(() => {
    const out: Pair[] = [];
    for (const team of payload.constructorStandings) {
      const drivers = payload.drivers
        .filter((d) => d.teamId === team.teamId)
        .sort((a, b) => {
          const pa = driverStandings.find((r) => r.id === a.id)?.position ?? 99;
          const pb = driverStandings.find((r) => r.id === b.id)?.position ?? 99;
          return pa - pb;
        });
      if (drivers.length < 2) continue;
      const [a, b] = drivers;
      out.push({
        teamId: team.teamId,
        teamName: team.name,
        colour: team.colour,
        a,
        b,
        // "All" includes the sprint sessions, like the reference: a sprint
        // grid counts as a qualifying head-to-head, a sprint result as a race.
        quali: countHeadToHead(payload, a.id, b.id, payload.qualiByRound, payload.sprintGridByRound),
        qualiGP: countHeadToHead(payload, a.id, b.id, payload.qualiByRound),
        qualiSprint: countHeadToHead(payload, a.id, b.id, payload.sprintGridByRound),
        race: countHeadToHead(payload, a.id, b.id, payload.raceByRound, payload.sprintByRound),
        raceGP: countHeadToHead(payload, a.id, b.id, payload.raceByRound),
        raceSprint: countHeadToHead(payload, a.id, b.id, payload.sprintByRound),
      });
    }
    return out;
  }, [driverStandings, payload]);

  const [driverA, setDriverA] = useState(
    pairs[0]?.a.id ?? driverStandings[0]?.id ?? payload.drivers[0]?.id ?? ""
  );
  const [driverB, setDriverB] = useState(
    pairs[0]?.b.id ?? driverStandings[1]?.id ?? payload.drivers[1]?.id ?? ""
  );
  const [qualiMode, setQualiMode] = useState<QualiMode>("all");
  const [raceMode, setRaceMode] = useState<RaceMode>("all");

  const a = payload.drivers.find((d) => d.id === driverA) ?? pairs[0]?.a ?? null;
  const b = payload.drivers.find((d) => d.id === driverB) ?? pairs[0]?.b ?? null;
  const rowA = driverStandings.find((r) => r.id === a?.id);
  const rowB = driverStandings.find((r) => r.id === b?.id);
  const statsA = a ? payload.driverStats[a.id] : null;
  const statsB = b ? payload.driverStats[b.id] : null;

  const selectedPair = pairs.find(
    (p) => (p.a.id === a?.id && p.b.id === b?.id) || (p.a.id === b?.id && p.b.id === a?.id)
  );

  const bestQuali = (id: string) => {
    const values = (payload.qualiByRound[id] ?? []).filter((v): v is number => v != null);
    return values.length ? Math.min(...values) : null;
  };

  const scoredRounds = useMemo(() => rounds.filter((r) => r.complete), [rounds]);
  const axis = useMemo(
    () => scoredRounds.map((r) => ({ round: r.round, country: r.country, name: r.name })),
    [scoredRounds]
  );

  const pointsSeries = useMemo<LineSeries[]>(() => {
    if (!a || !b) return [];
    return [
      {
        id: a.id,
        label: a.code,
        name: surname(a.name),
        colour: `#${a.colour}`,
        values: (payload.pointsByRound[a.id] ?? []).slice(0, scoredRounds.length),
      },
      {
        id: b.id,
        label: b.code,
        name: surname(b.name),
        colour: `#${b.colour}`,
        values: (payload.pointsByRound[b.id] ?? []).slice(0, scoredRounds.length),
      },
    ];
  }, [a, b, payload, scoredRounds.length]);

  const gapPerRound = useMemo(() => {
    if (!a || !b) return [];
    const pa = payload.roundPoints[a.id] ?? [];
    const pb = payload.roundPoints[b.id] ?? [];
    return scoredRounds.map((_, i) => (pa[i] ?? 0) - (pb[i] ?? 0));
  }, [a, b, payload, scoredRounds]);

  if (!a || !b || !rowA || !rowB || !statsA || !statsB) {
    return <EmptyState>Two drivers are needed for a head-to-head comparison.</EmptyState>;
  }

  const metrics = [
    { label: "Championship points", a: rowA.points, b: rowB.points, kind: "count" as const },
    { label: "Wins", a: statsA.wins, b: statsB.wins, kind: "count" as const },
    { label: "Podiums", a: statsA.podiums, b: statsB.podiums, kind: "count" as const },
    { label: "Points finishes", a: statsA.pointsFinishes, b: statsB.pointsFinishes, kind: "count" as const },
    { label: "Poles", a: statsA.poles, b: statsB.poles, kind: "count" as const },
    { label: "Q3 appearances", a: statsA.q3Appearances, b: statsB.q3Appearances, kind: "count" as const },
    { label: "Sprint wins", a: statsA.sprintWins, b: statsB.sprintWins, kind: "count" as const },
    { label: "Sprint podiums", a: statsA.sprintPodiums, b: statsB.sprintPodiums, kind: "count" as const },
    { label: "DNF / DSQ", a: statsA.dnfs, b: statsB.dnfs, kind: "count" as const },
    { label: "Best race finish", a: statsA.bestFinish, b: statsB.bestFinish, kind: "low" as const },
    { label: "Best qualifying", a: bestQuali(a.id), b: bestQuali(b.id), kind: "low" as const },
    { label: "Average finish", a: statsA.avgFinish, b: statsB.avgFinish, kind: "low" as const },
  ];

  const qualiPairs = pairs.slice(0, 11);
  const racePairs = pairs.slice(0, 11);
  const qualiMetric = (pair: Pair) =>
    qualiMode === "all" ? pair.quali : qualiMode === "quali" ? pair.qualiGP : pair.qualiSprint;
  const raceMetric = (pair: Pair) =>
    raceMode === "all" ? pair.race : raceMode === "race" ? pair.raceGP : pair.raceSprint;

  return (
    <div className="space-y-4">
      <div className="f1-card rounded-2xl p-4 md:p-5">
        <div className="grid grid-cols-2 items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="order-1 flex min-w-0 items-center gap-2.5 sm:gap-3">
            <DriverAvatar name={a.name} colour={`#${a.colour}`} headshotUrl={a.headshotUrl} size={40} />
            <span className="hidden sm:block">
              <TeamMark team={a.teamName} size={24} tone="mono" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-f1 text-sm font-bold text-white">
                <span className="hidden sm:inline">{a.name}</span>
                <span className="sm:hidden">{surname(a.name)}</span>
              </p>
              <p className="truncate text-[10px] uppercase tracking-[0.12em] text-white/35">
                P{rowA.position} · <span className="hidden sm:inline">{a.teamName} · </span>
                {pointsFmt(rowA.points)} pts
              </p>
            </div>
          </div>
          <div className="order-3 col-span-2 flex items-center justify-center gap-2 md:order-2 md:col-span-1">
            <Selector
              label="Driver 1"
              compact
              value={a.id}
              onChange={(v) => {
                setDriverA(v);
                if (v === b.id) {
                  const other = driverStandings.find((r) => r.id !== v);
                  if (other) setDriverB(other.id);
                }
              }}
            >
              {driverStandings.map((row) => (
                <option key={row.id} value={row.id}>
                  {surname(row.name)}
                </option>
              ))}
            </Selector>
            <span className="rounded bg-[#e10600] px-1.5 py-0.5 font-f1 text-[9px] font-bold text-white">VS</span>
            <Selector
              label="Driver 2"
              compact
              value={b.id}
              onChange={(v) => {
                setDriverB(v);
                if (v === a.id) {
                  const other = driverStandings.find((r) => r.id !== v);
                  if (other) setDriverA(other.id);
                }
              }}
            >
              {driverStandings.map((row) => (
                <option key={row.id} value={row.id}>
                  {surname(row.name)}
                </option>
              ))}
            </Selector>
          </div>
          <div className="order-2 flex min-w-0 items-center justify-end gap-2.5 text-right sm:gap-3 md:order-3">
            <div className="min-w-0">
              <p className="truncate font-f1 text-sm font-bold text-white">
                <span className="hidden sm:inline">{b.name}</span>
                <span className="sm:hidden">{surname(b.name)}</span>
              </p>
              <p className="truncate text-[10px] uppercase tracking-[0.12em] text-white/35">
                P{rowB.position} · <span className="hidden sm:inline">{b.teamName} · </span>
                {pointsFmt(rowB.points)} pts
              </p>
            </div>
            <span className="hidden sm:block">
              <TeamMark team={b.teamName} size={24} tone="mono" />
            </span>
            <DriverAvatar name={b.name} colour={`#${b.colour}`} headshotUrl={b.headshotUrl} size={40} />
          </div>
        </div>
      </div>

      {/* One pairing row needs ~520px before its names start truncating, so the
          two tables only sit side by side on wide screens. */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title={`${season} Qualifying H2H`}
          subtitle="Every team-mate pairing, including sprint qualifying sessions"
          meta={
            <Segmented<QualiMode>
              label="Qualifying sessions"
              value={qualiMode}
              onChange={setQualiMode}
              options={[
                { value: "all", label: "All" },
                { value: "quali", label: "Quali" },
                { value: "sprint", label: "Sprint quali" },
              ]}
            />
          }
          className="h-full"
          exportName={`f1-${season}-qualifying-h2h`}
        >
          <div className="mx-auto w-full max-w-2xl space-y-0.5">
            {qualiPairs.map((pair) => (
              <TeamBattle
                key={pair.teamId}
                pair={pair}
                metric={qualiMetric(pair)}
                selected={selectedPair?.teamId === pair.teamId}
                onSelect={() => {
                  setDriverA(pair.a.id);
                  setDriverB(pair.b.id);
                }}
              />
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-white/25">
            Both drivers must have set a qualifying time for the session to count. Ties are not awarded to either driver.
          </p>
        </Panel>

        <Panel
          title={`${season} Race H2H`}
          subtitle="Team-mates compared across Grands Prix and sprints"
          meta={
            <Segmented<RaceMode>
              label="Race sessions"
              value={raceMode}
              onChange={setRaceMode}
              options={[
                { value: "all", label: "All" },
                { value: "race", label: "Race" },
                { value: "sprint", label: "Sprint" },
              ]}
            />
          }
          className="h-full"
          exportName={`f1-${season}-race-h2h`}
        >
          <div className="mx-auto w-full max-w-2xl space-y-0.5">
            {racePairs.map((pair) => (
              <TeamBattle
                key={pair.teamId}
                pair={pair}
                metric={raceMetric(pair)}
                selected={selectedPair?.teamId === pair.teamId}
                onSelect={() => {
                  setDriverA(pair.a.id);
                  setDriverB(pair.b.id);
                }}
              />
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-white/25">
            Both cars must be classified for the session to count. A sprint result counts as a race, and a sprint
            grid position as a qualifying result.
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel
          title={`${surname(a.name)} vs ${surname(b.name)}`}
          subtitle="Season head-to-head scorecard"
          className="flex h-full flex-col"
        >
          <div className="flex flex-1 flex-col justify-between gap-2">
            {metrics.map((m) => {
              const av = m.a;
              const bv = m.b;
              const total = (av ?? 0) + (bv ?? 0);
              const pct = total > 0 ? ((av ?? 0) / total) * 100 : 50;
              const fmt = (v: number | null) =>
                v == null ? "—" : m.kind === "low" ? `P${v.toFixed(m.label === "Average finish" ? 1 : 0)}` : pointsFmt(v);
              return (
                <div key={m.label}>
                  <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
                    <span className="text-left font-f1 text-[11px] font-bold tabular-nums text-white/85">{fmt(av)}</span>
                    <span className="truncate text-center text-[9px] font-bold uppercase tracking-[0.1em] text-white/35">
                      {m.label}
                    </span>
                    <span className="text-right font-f1 text-[11px] font-bold tabular-nums text-white/85">{fmt(bv)}</span>
                  </div>
                  {m.kind === "count" && (
                    <div className="mt-0.5">
                      <SplitBar aPct={pct} aColour={`#${a.colour}`} bColour={`#${b.colour}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[9px] leading-relaxed text-white/25">
            Percentages share the combined total between the two drivers. Lower is better for finishes.
          </p>
        </Panel>

        <Panel
          title={`${surname(a.name)} vs ${surname(b.name)} points gap`}
          subtitle="Cumulative points, and the points swing round by round"
          className="h-full"
          exportName={`f1-${season}-${a.familyName}-${b.familyName}-points-gap`}
        >
          <StandingsLineChart
            series={pointsSeries}
            rounds={axis}
            ariaLabel={`${a.name} and ${b.name} cumulative points`}
            emptyLabel="No points to compare yet."
          />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[9px] text-white/40">
            <span className="inline-flex items-center gap-1">
              <i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `#${a.colour}` }} />
              {a.code}
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `#${b.colour}` }} />
              {b.code}
            </span>
          </div>
          <p className="mt-3 mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">
            Points gap per round
          </p>
          <GapBars
            values={gapPerRound}
            colour={`#${a.colour}`}
            rounds={axis}
            aCode={a.code}
            bCode={b.code}
          />
          <p className="mt-1 text-[9px] text-white/25">
            Positive bars: {a.code} scored more that round. Negative bars: {b.code} scored more.
          </p>
        </Panel>
      </div>
    </div>
  );
}
