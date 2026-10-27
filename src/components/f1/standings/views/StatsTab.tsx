"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  FinishDistribution,
  StartFinishFlow,
  StandingsLineChart,
  type LineSeries,
} from "@/components/f1/standings/charts";
import {
  EmptyState,
  MiniStat,
  Panel,
  Selector,
  avgFmt,
  pctFmt,
  pointsFmt,
  surname,
} from "@/components/f1/standings/parts";
import { DriverAvatar, TeamMark } from "@/components/f1/TeamLogo";
import LapsLedPanel from "@/components/f1/standings/LapsLedPanel";
import type { SeasonPayload } from "@/lib/standings";

const prevCache = new Map<number, SeasonPayload | null>();

function Ring({
  label,
  value,
  total,
  colour,
}: {
  label: string;
  value: number;
  total: number;
  colour: string;
}) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] px-3 py-2.5 transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.035]">
      <svg
        viewBox="0 0 56 56"
        className="h-[52px] w-[52px] shrink-0 overflow-visible"
        role="img"
        aria-label={`${label}: ${value} of ${total}`}
      >
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 28 28)"
          className="f1-ring transition-[stroke] duration-150 group-hover:brightness-110"
          style={{ "--ring-len": c } as CSSProperties}
        />
        <text x="28" y="32" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" className="tabular-nums">
          {value}
        </text>
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-white/45">{label}</p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="font-f1 text-[15px] font-bold leading-none tabular-nums" style={{ color: colour }}>
            {total > 0 ? pctFmt(pct * 100) : "—"}
          </span>
          <span className="text-[9px] text-white/30">of {total}</span>
        </p>
      </div>
    </div>
  );
}

/** Race-form chip: one classified Grand Prix, coloured by where it finished. */
function formColour(pos: number) {
  if (pos === 1) return "#f2c94c";
  if (pos <= 3) return "#cbd5e1";
  if (pos <= 10) return "#38bdf8";
  return "#64748b";
}

export default function StatsTab({ payload }: { payload: SeasonPayload }) {
  const { season, driverStandings, drivers } = payload;
  const [picked, setPicked] = useState(driverStandings[0]?.id ?? "");
  const [showPrev, setShowPrev] = useState(true);
  const [prev, setPrev] = useState<SeasonPayload | null>(null);
  const [prevLoading, setPrevLoading] = useState(false);

  const activeId = drivers.some((d) => d.id === picked) ? picked : driverStandings[0]?.id ?? "";
  const driver = drivers.find((d) => d.id === activeId) ?? null;
  const standing = driverStandings.find((r) => r.id === activeId) ?? null;
  const stats = activeId ? payload.driverStats[activeId] : null;

  useEffect(() => {
    if (!showPrev || season <= 1950) {
      setPrev(null);
      setPrevLoading(false);
      return;
    }
    const target = season - 1;
    const cached = prevCache.get(target);
    if (cached !== undefined) {
      setPrev(cached);
      setPrevLoading(false);
      return;
    }
    const controller = new AbortController();
    setPrevLoading(true);
    fetch(`/api/f1/standings?season=${target}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: { payload?: SeasonPayload }) => {
        const data = json.payload ?? null;
        prevCache.set(target, data);
        setPrev(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          prevCache.set(target, null);
          setPrev(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPrevLoading(false);
      });
    return () => controller.abort();
  }, [season, showPrev]);

  const prevDriverId = useMemo(() => {
    if (!prev || !driver) return null;
    const exact = prev.drivers.find((d) => d.id === driver.id);
    if (exact) return exact.id;
    const byName = prev.drivers.find((d) => d.familyName === driver.familyName);
    return byName?.id ?? null;
  }, [driver, prev]);

  const evolution = useMemo<LineSeries[]>(() => {
    if (!driver) return [];
    const currentCompleted = payload.rounds.filter((r) => r.complete).length;
    const out: LineSeries[] = [
      {
        id: driver.id,
        label: driver.code,
        name: surname(driver.name),
        colour: `#${driver.colour}`,
        values: (payload.pointsByRound[driver.id] ?? []).slice(0, currentCompleted),
      },
    ];
    if (prev && prevDriverId) {
      const prevCompleted = prev.rounds.filter((r) => r.complete).length;
      out.push({
        id: `${prevDriverId}-prev`,
        label: String(prev.season),
        name: `${surname(driver.name)} · ${prev.season}`,
        colour: "#8a8a93",
        values: (prev.pointsByRound[prevDriverId] ?? []).slice(0, prevCompleted),
      });
    }
    return out;
  }, [driver, payload, prev, prevDriverId]);

  if (!driver || !stats || !standing) {
    return <EmptyState>No driver statistics are available for {season}.</EmptyState>;
  }

  const starts = stats.starts || payload.rounds.filter((r) => r.complete).length || 1;
  const pointsRate = Math.round((stats.pointsFinishes / starts) * 100);

  const flowRows = payload.rounds
    .map((r) => {
      const pos = payload.roundPositions[driver.id]?.[r.round - 1];
      if (!pos || pos.grid == null || pos.finish == null) return null;
      if (/^(Retired|Accident|Collision|Engine|Gearbox|Hydraulics|Brakes|Suspension|Overheating|Electrical|Power|Exhaust|Oil|Water|Fuel|Wheel|Spun|Undertray|Seat|Steering|Technical|Mechanical|Puncture|Disqualified)/i.test(pos.status)) {
        return null;
      }
      return { round: r.round, grid: pos.grid, finish: pos.finish };
    })
    .filter((v): v is { round: number; grid: number; finish: number } => v != null);

  const allPositions = payload.raceByRound[driver.id] ?? [];
  const finishCounts = Array.from({ length: 20 }, (_, i) =>
    allPositions.filter((p) => p === i + 1).length
  );

  const gains = flowRows.reduce((acc, r) => acc + (r.grid - r.finish), 0);
  type FlowRow = { round: number; grid: number; finish: number };
  const biggestGain = flowRows.reduce<FlowRow | null>((best, r) => {
    if (!best) return r;
    return r.grid - r.finish > best.grid - best.finish ? r : best;
  }, null);
  const biggestLoss = flowRows.reduce<FlowRow | null>((worst, r) => {
    if (!worst) return r;
    return r.grid - r.finish < worst.grid - worst.finish ? r : worst;
  }, null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <DriverAvatar
            name={driver.name}
            colour={`#${driver.colour}`}
            headshotUrl={driver.headshotUrl}
            size={40}
          />
          <div className="min-w-0">
            <p className="truncate font-f1 text-[15px] font-bold leading-tight text-white">
              {driver.name}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">
              <TeamMark team={driver.teamName} size={11} tone="mono" />
              <span className="truncate">
                {standing ? `P${standing.position} · ` : ""}
                {driver.teamName}
              </span>
            </p>
          </div>
        </div>
        <Selector label="Driver" value={activeId} onChange={setPicked}>
          {driverStandings.map((row) => (
            <option key={row.id} value={row.id}>
              {row.position}. {surname(row.name)} — {row.points} pts
            </option>
          ))}
        </Selector>
        <span className="text-[10px] text-white/30">Season {season}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <MiniStat
          label="Grand Prix wins"
          value={stats.wins + stats.sprintWins}
          hint={`${stats.wins} GP · ${stats.sprintWins} sprint`}
        />
        <MiniStat
          label="Grand Prix podiums"
          value={stats.podiums + stats.sprintPodiums}
          hint={`${stats.podiums} GP · ${stats.sprintPodiums} sprint`}
        />
        <MiniStat
          label="Season points"
          value={pointsFmt(standing.points)}
          hint={`Avg. ${avgFmt(stats.starts ? standing.points / stats.starts : null)} per GP`}
        />
        <MiniStat label="Pole positions" value={stats.poles} hint={`${stats.bestGrid ? `Best grid P${stats.bestGrid}` : "No grid data"}`} />
        <MiniStat label="DNF / DSQ" value={stats.dnfs} hint={`${starts} starts`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Season Performance"
          subtitle={`${surname(driver.name)} · ${season}`}
          exportName={`f1-${season}-${driver.familyName}-season-performance`}
        >
          <div className="grid grid-cols-2 gap-2">
            <Ring label="Wins" value={stats.wins} total={starts} colour="#e8c34a" />
            <Ring label="Podiums" value={stats.podiums} total={starts} colour="#5b9df9" />
            <Ring label="Points finishes" value={stats.pointsFinishes} total={starts} colour={`#${driver.colour}`} />
            <Ring label="DNF / DSQ" value={stats.dnfs} total={starts} colour="#e10600" />
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">Race form</p>
              <p className="text-[9px] text-white/30">
                {flowRows.length} classified · grid → finish
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {flowRows.map((r, i) => {
                const colour = formColour(r.finish);
                const gained = r.grid - r.finish;
                return (
                  <span
                    key={r.round}
                    title={`Round ${r.round} · P${r.grid} → P${r.finish}${
                      gained ? ` (${gained > 0 ? "+" : ""}${gained})` : ""
                    }`}
                    className="f1-in grid h-6 min-w-[26px] place-items-center rounded-[4px] border px-1 font-f1 text-[9px] font-bold tabular-nums transition duration-150 hover:-translate-y-0.5 hover:brightness-125"
                    style={{
                      borderColor: `${colour}55`,
                      backgroundColor: `${colour}14`,
                      color: colour,
                      animationDelay: `${Math.min(500, i * 18)}ms`,
                    }}
                  >
                    P{r.finish}
                  </span>
                );
              })}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-white/30">
              <span className="inline-flex items-center gap-1">
                <i className="h-1.5 w-1.5 rounded-[2px] bg-[#f2c94c]" /> Win
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="h-1.5 w-1.5 rounded-[2px] bg-[#cbd5e1]" /> Podium
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="h-1.5 w-1.5 rounded-[2px] bg-[#38bdf8]" /> Points
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="h-1.5 w-1.5 rounded-[2px] bg-[#64748b]" /> Outside the points
              </span>
            </p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <MiniStat label="Best finish" value={stats.bestFinish ? `P${stats.bestFinish}` : "—"} />
            <MiniStat
              label="Average finish"
              value={stats.avgFinish == null ? "—" : `P${avgFmt(stats.avgFinish)}`}
            />
            <MiniStat
              label="Places gained"
              value={`${stats.positionsGained > 0 ? "+" : ""}${stats.positionsGained}`}
            />
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-white/30">
            {stats.pointsFinishes} of {starts} races finished in the points ({pctFmt(pointsRate)}).
          </p>
        </Panel>

        <Panel
          title="Points Evolution"
          subtitle={prev ? `Compared with ${season - 1}` : "Cumulative points this season"}
          meta={
            season > 1950 ? (
              <button
                type="button"
                onClick={() => setShowPrev((v) => !v)}
                aria-pressed={showPrev}
                className={`rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] transition ${
                  showPrev
                    ? "border-[#e10600]/60 bg-[#e10600]/10 text-white"
                    : "border-white/10 text-white/40 hover:text-white/70"
                }`}
              >
                {prevLoading ? "Loading…" : `vs ${season - 1}`}
              </button>
            ) : undefined
          }
          exportName={`f1-${season}-${driver.familyName}-points-evolution`}
        >
          <StandingsLineChart
            series={evolution}
            rounds={payload.rounds
              .filter((r) => r.complete)
              .map((r) => ({ round: r.round, country: r.country, name: r.name }))}
            ariaLabel={`${driver.name} cumulative points per round`}
            emptyLabel="No points scored yet."
          />
          <div className="mt-1 flex flex-wrap gap-3 text-[9px] text-white/40">
            <span className="inline-flex items-center gap-1">
              <i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `#${driver.colour}` }} />
              {season}
            </span>
            {prev && prevDriverId && (
              <span className="inline-flex items-center gap-1">
                <i className="h-1.5 w-1.5 rounded-full bg-[#8a8a93]" />
                {season - 1}
              </span>
            )}
            {showPrev && !prevLoading && !prevDriverId && (
              <span className="text-white/30">No {season - 1} entry for this driver.</span>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Start to Finish Position Flow"
          subtitle="Ribbon width is the number of races: grid on the left, finish on the right"
          exportName={`f1-${season}-${driver.familyName}-start-finish`}
        >
          {flowRows.length ? (
            <>
              <StartFinishFlow
                rows={flowRows}
                name={surname(driver.name)}
                rounds={payload.rounds.map((r) => ({ round: r.round, country: r.country, name: r.name }))}
                ariaLabel={`${driver.name} grid to finish positions`}
              />
              <div className="mt-1 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div>
                  <p className="text-white/30">Net places</p>
                  <p className={`font-bold tabular-nums ${gains >= 0 ? "text-[#34d399]" : "text-[#f87171]"}`}>
                    {gains > 0 ? "+" : ""}{gains}
                  </p>
                </div>
                <div>
                  <p className="text-white/30">Biggest gain</p>
                  <p className="font-bold tabular-nums text-white/80">
                    {biggestGain ? `R${biggestGain.round} +${biggestGain.grid - biggestGain.finish}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-white/30">Biggest loss</p>
                  <p className="font-bold tabular-nums text-white/80">
                    {biggestLoss && biggestLoss.grid - biggestLoss.finish < 0
                      ? `R${biggestLoss.round} ${biggestLoss.grid - biggestLoss.finish}`
                      : "—"}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <EmptyState>No classified grid-to-finish runs yet.</EmptyState>
          )}
        </Panel>

        <Panel
          title="Finish Positions Distribution"
          subtitle="How often each finishing position was reached"
          exportName={`f1-${season}-${driver.familyName}-finish-distribution`}
        >
          <FinishDistribution counts={finishCounts} colour={`#${driver.colour}`} />
          <p className="mt-1 text-[10px] text-white/30">
            Retirements, disqualifications and classified-but-lapped finishes are counted by their final position;
            races with no classification are not shown.
          </p>
        </Panel>
      </div>

      <LapsLedPanel
        season={season}
        driverId={driver.id}
        driverName={driver.name}
        familyName={driver.familyName}
        rounds={payload.rounds
          .filter((r) => r.complete)
          .map((r) => ({
            round: r.round,
            country: r.country,
            name: r.name,
            finish: payload.roundPositions[driver.id]?.[r.round - 1]?.finish ?? null,
          }))}
      />
    </div>
  );
}
