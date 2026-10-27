"use client";

import { EmptyState, Panel, gapFmt, pointsFmt } from "@/components/f1/standings/parts";
import type { SeasonPayload } from "@/lib/standings";

/** The two data-led editorial cards at the foot of the Drivers tab. */
export default function Editorial({ payload }: { payload: SeasonPayload }) {
  const { season, driverStandings, constructorStandings, cards, drivers, rounds } = payload;
  const leader = driverStandings[0];
  const second = driverStandings[1];
  const name = (id: string) => drivers.find((d) => d.id === id)?.name ?? id;

  const adjacent = driverStandings.slice(1).map((row, i) => ({
    ahead: driverStandings[i],
    behind: row,
    gap: driverStandings[i].points - row.points,
  }));
  const tightest = adjacent.reduce<(typeof adjacent)[number] | null>(
    (best, cur) => (!best || cur.gap < best.gap ? cur : best),
    null
  );

  const teamAdjacent = constructorStandings.slice(1).map((row, i) => ({
    ahead: constructorStandings[i],
    behind: row,
    gap: constructorStandings[i].points - row.points,
  }));
  const tightestTeam = teamAdjacent.reduce<(typeof teamAdjacent)[number] | null>(
    (best, cur) => (!best || cur.gap < best.gap ? cur : best),
    null
  );

  const records: { label: string; value: string; detail?: string }[] = [];
  if (cards.comeback) {
    records.push({
      label: "Biggest comeback",
      value: `${name(cards.comeback.driverId)} · P${cards.comeback.grid} → P${cards.comeback.finish}`,
      detail: cards.comeback.roundName,
    });
  }
  if (cards.largestMargin) {
    records.push({
      label: "Largest win",
      value: `${name(cards.largestMargin.driverId)} +${cards.largestMargin.margin.toFixed(1)}s`,
      detail: cards.largestMargin.roundName,
    });
  }
  if (cards.closestMargin) {
    records.push({
      label: "Closest win",
      value: `${name(cards.closestMargin.driverId)} +${cards.closestMargin.margin.toFixed(3)}s`,
      detail: cards.closestMargin.roundName,
    });
  }
  if (cards.mostWins) {
    records.push({
      label: "Most wins",
      value: `${name(cards.mostWins.driverId)} · ${cards.mostWins.value}`,
    });
  }
  if (cards.mostPoles) {
    records.push({
      label: "Most poles",
      value: `${name(cards.mostPoles.driverId)} · ${cards.mostPoles.value}`,
    });
  }
  const laps = cards.lapsByTeam[0];
  if (laps) {
    records.push({
      label: "Most laps completed",
      value: `${constructorStandings.find((t) => t.teamId === laps.teamId)?.name ?? laps.teamId} · ${laps.laps}`,
    });
  }

  return (
    <>
      <Panel title="Championship Battles" subtitle="The closest fights in the current classification">
        {leader && second ? (
          <ul className="space-y-3 text-[12px] leading-relaxed text-white/55">
            <li className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-2.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">Drivers&apos; title</p>
              <p className="mt-1">
                <span className="font-bold text-white">{leader.name}</span> leads{" "}
                <span className="font-bold text-white">{second.name}</span> by{" "}
                <span className="font-bold tabular-nums text-white">{gapFmt(second.points - leader.points)}</span> points
                after {rounds.filter((r) => r.complete).length} scored rounds.
              </p>
            </li>
            {tightest && (
              <li className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">Tightest pair on the table</p>
                <p className="mt-1">
                  {tightest.gap === 0 ? (
                    <>
                      {tightest.ahead.name} and {tightest.behind.name} are level on{" "}
                      <span className="font-bold tabular-nums text-white">{pointsFmt(tightest.ahead.points)} points</span>.
                    </>
                  ) : (
                    <>
                      {tightest.behind.name} trails {tightest.ahead.name} by just{" "}
                      <span className="font-bold tabular-nums text-white">{pointsFmt(tightest.gap)} points</span>{" "}
                      on {pointsFmt(tightest.behind.points)}.
                    </>
                  )}
                </p>
              </li>
            )}
            {tightestTeam && (
              <li className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">Constructors&apos; fight</p>
                <p className="mt-1">
                  {tightestTeam.gap === 0 ? (
                    <>
                      {tightestTeam.ahead.name} and {tightestTeam.behind.name} are level on{" "}
                      <span className="font-bold tabular-nums text-white">{pointsFmt(tightestTeam.ahead.points)} points</span>.
                    </>
                  ) : (
                    <>
                      {tightestTeam.ahead.name} leads {tightestTeam.behind.name} by{" "}
                      <span className="font-bold tabular-nums text-white">{gapFmt(tightestTeam.behind.points - tightestTeam.ahead.points)}</span>{" "}
                      points in the closest team battle.
                    </>
                  )}
                </p>
              </li>
            )}
          </ul>
        ) : (
          <EmptyState>No championship fight to show until a round has been scored.</EmptyState>
        )}
      </Panel>

      <Panel title={`${season} Season Records`} subtitle="Best single-race performances from this season">
        {records.length ? (
          <>
            <dl className="divide-y divide-white/[0.06]">
              {records.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-white/35">{r.label}</dt>
                  <dd className="min-w-0 text-right">
                    <span className="block truncate text-[11.5px] text-white/80">{r.value}</span>
                    {r.detail && <span className="block text-[9px] text-white/30">{r.detail}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[9px] leading-relaxed text-white/25">
              Computed from this season&apos;s classified results. Laps-led totals are not published by the feed and
              are not estimated.
            </p>
          </>
        ) : (
          <EmptyState>No records yet — this season has not been scored.</EmptyState>
        )}
      </Panel>
    </>
  );
}
