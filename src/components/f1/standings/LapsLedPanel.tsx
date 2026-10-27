"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartTooltip, countryCode } from "@/components/f1/standings/charts";
import { EmptyState, Panel, surname } from "@/components/f1/standings/parts";
import type { LapsLedPayload } from "@/lib/laps-led";

/** One classified Grand Prix for the selected driver. */
export interface LapsLedRoundMeta {
  round: number;
  country: string;
  name: string;
  /** Finishing position (1 marks a win, drawn with the trophy). */
  finish: number | null;
}

const MINT = "#2ee6a8";
const MINT_DEEP = "#12c98c";

/** Per-driver season responses, so switching back and forth costs no requests. */
const cache = new Map<string, LapsLedPayload>();

/** The panel needs the season's classified rounds, so they travel with the URL. */
function requestUrl(season: number, driverId: string, rounds: LapsLedRoundMeta[]) {
  const list = rounds.map((r) => r.round).join(",");
  return `/api/f1/laps-led?season=${season}&driver=${encodeURIComponent(driverId)}&rounds=${list}`;
}

function Trophy({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0V4Z" fill="currentColor" fillOpacity={0.22} />
      <path d="M7.5 5.2H5.6a2.4 2.4 0 0 0 2.4 4.4M16.5 5.2h1.9a2.4 2.4 0 0 1-2.4 4.4" />
      <path d="M12 13.8V17" />
      <path d="M9 20.2h6l-.5-2.1a1.1 1.1 0 0 0-1.1-.9h-2.8a1.1 1.1 0 0 0-1.1.9L9 20.2Z" fill="currentColor" fillOpacity={0.22} />
    </svg>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-md border border-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white/60 transition-colors hover:border-white/30 hover:text-white"
    >
      Retry
    </button>
  );
}

function RoundChip({ country }: { country: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-4 w-[26px] shrink-0 place-items-center rounded-[2px] bg-white/[0.09] text-[7px] font-bold tracking-[0.02em] text-white/65"
    >
      {countryCode(country)}
    </span>
  );
}

/** Rows shown while the (one request per round) fetch is in flight. */
function Skeleton({ note }: { note: string }) {
  return (
    <div>
      <div className="flex flex-col gap-1.5" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-4 w-[26px] shrink-0 animate-pulse rounded-[2px] bg-white/[0.06]" />
            <span
              className="h-[22px] animate-pulse rounded-[3px] bg-white/[0.05]"
              style={{ width: `${58 - i * 3}%` }}
            />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-white/30" role="status">
        {note}
      </p>
    </div>
  );
}

/**
 * Laps led per Grand Prix — mint bars scaled to the driver's best race, the lap
 * count inside the bar and a trophy wherever the race was won. Values come from
 * Jolpica's lap-by-lap timing, fetched lazily so the rest of the tab stays fast.
 */
export default function LapsLedPanel({
  season,
  driverId,
  driverName,
  familyName,
  rounds,
}: {
  season: number;
  driverId: string;
  driverName: string;
  familyName: string;
  rounds: LapsLedRoundMeta[];
}) {
  const key = `${season}:${driverId}`;
  const roundKey = rounds.map((r) => r.round).join(",");
  const [data, setData] = useState<LapsLedPayload | null>(() => cache.get(key) ?? null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [attempt, setAttempt] = useState(0);
  const [tip, setTip] = useState<{ round: number; left: number; top: number } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    if (!rounds.length) return;
    const cached = cache.get(key);
    if (cached) {
      setData(cached);
      setStatus("idle");
      return;
    }
    setData(null);
    setStatus("loading");
    const controller = new AbortController();
    fetch(requestUrl(season, driverId, rounds), { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: LapsLedPayload) => {
        if (controller.signal.aborted) return;
        // A partial answer is not worth keeping: the next visit retries it.
        if (!json.partial) cache.set(key, json);
        setData(json);
        setStatus("idle");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
    // `rounds` is rebuilt by the parent on every render; the round numbers are
    // what identify the request, so the joined list is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, driverId, key, season, roundKey]);

  // Touch pointers keep their tooltip after lifting; a tap elsewhere (or
  // Escape) dismisses it, the same rule the SVG charts follow.
  useEffect(() => {
    if (!tip) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-laps-panel]")) return;
      setTip(null);
      setHovered(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTip(null);
        setHovered(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [tip]);

  const byRound = useMemo(() => {
    const map = new Map<number, { lapsLed: number; known: boolean }>();
    for (const r of data?.rounds ?? []) map.set(r.round, { lapsLed: r.lapsLed, known: r.known });
    return map;
  }, [data]);

  const rows = useMemo(
    () =>
      rounds.map((r) => {
        const hit = byRound.get(r.round);
        return { ...r, lapsLed: hit?.lapsLed ?? 0, known: hit?.known ?? false };
      }),
    [byRound, rounds]
  );

  const max = Math.max(1, ...rows.map((r) => r.lapsLed));
  const total = data?.totalLapsLed ?? 0;
  const racesLed = data?.racesLed ?? 0;
  const knownRounds = data?.knownRounds ?? rows.length;
  const best = data?.best ?? null;
  const bestMeta = best ? rounds.find((r) => r.round === best.round) : undefined;
  const tipRow = tip ? rows.find((r) => r.round === tip.round) : undefined;

  return (
    <Panel
      title="Laps Led per Race"
      subtitle={`${surname(driverName)} · ${season} · lap-by-lap timing`}
      exportName={`f1-${season}-${familyName}-laps-led`}
      meta={
        data && data.covered ? (
          <span className="rounded-[4px] border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/45 tabular-nums">
            {total} laps led
          </span>
        ) : undefined
      }
    >
      {status === "loading" && (
        <Skeleton note={`Counting ${rounds.length} races of Jolpica lap-by-lap timing…`} />
      )}

      {status === "error" && (
        <EmptyState>
          <div className="flex flex-col items-center gap-3">
            <span>Laps-led timing could not be loaded right now. The rest of the driver&apos;s season is unaffected.</span>
            <RetryButton onClick={() => setAttempt((n) => n + 1)} />
          </div>
        </EmptyState>
      )}

      {!rounds.length && (
        <EmptyState>No races have been classified yet, so there are no laps to count for {season}.</EmptyState>
      )}

      {status === "idle" && data && !data.covered && (
        <EmptyState>
          {season < 1996
            ? `Lap-by-lap timing starts in 1996, so laps led cannot be counted for ${season}.`
            : `The results feed publishes no lap-by-lap timing for ${surname(driverName)} in ${season}.`}
        </EmptyState>
      )}

      {status === "idle" && data && data.covered && (
      <div className="relative" data-laps-panel="">
        <div role="list" className="flex flex-col gap-1.5 pr-5">
            {rows.map((row, i) => {
              // Bars stop just short of the track's right edge so the trophy
              // markers always have room inside the card.
              const pct = (row.lapsLed / max) * 0.96;
              const won = row.known && row.finish === 1;
              const inside = pct >= 0.055;
              const isHover = hovered === row.round;
              return (
                <div
                key={row.round}
                role="listitem"
                aria-label={
                  row.known
                    ? `${row.name}: ${row.lapsLed} ${row.lapsLed === 1 ? "lap" : "laps"} led${
                        won ? ", won the race" : row.finish ? `, finished P${row.finish}` : ""
                      }`
                    : `${row.name}: lap timing unavailable`
                }
                className="flex items-center gap-2"
                  onPointerEnter={(e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    setHovered(row.round);
                    setTip({ round: row.round, left: box.left + box.width * 0.62, top: box.top });
                  }}
                  onPointerDown={(e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    setHovered(row.round);
                    setTip({ round: row.round, left: box.left + box.width * 0.62, top: box.top });
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType === "touch") return;
                    setHovered(null);
                    setTip(null);
                  }}
                >
                  <RoundChip country={row.country} />
                <div className="relative h-[22px] flex-1" aria-hidden="true">
                    <span
                      aria-hidden="true"
                      className={`absolute inset-0 rounded-[3px] transition-colors duration-150 ${
                        isHover ? "bg-white/[0.09]" : row.known ? "bg-white/[0.035]" : "bg-white/[0.02]"
                      }`}
                    />
                    {!row.known && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-full rounded-[3px] border border-dashed border-white/[0.06]"
                      />
                    )}
                    {row.lapsLed > 0 && (
                      <span
                        aria-hidden="true"
                        className="f1-grow-x absolute inset-y-0 left-0 rounded-[3px]"
                        style={{
                          width: `${Math.max(pct * 100, 1.5)}%`,
                          background: `linear-gradient(90deg, ${MINT_DEEP}, ${MINT})`,
                          boxShadow: "0 0 14px rgba(46,230,168,0.18)",
                          animationDelay: `${Math.min(520, i * 26)}ms`,
                        }}
                      />
                    )}
                    {row.lapsLed > 0 && (
                      <span
                        aria-hidden="true"
                        className={`absolute top-1/2 -translate-y-1/2 font-f1 text-[10px] font-bold tabular-nums ${
                          inside ? "" : "pl-[3px]"
                        }`}
                        style={
                          inside
                            ? { left: 7, color: "#07130f" }
                            : { left: `calc(${pct * 100}% + 3px)`, color: MINT }
                        }
                      >
                        {row.lapsLed}
                      </span>
                    )}
                    {won && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1/2 -translate-y-1/2"
                        style={{ left: `calc(${Math.max(pct * 100, 1.5)}% + 4px)` }}
                      >
                        <Trophy className="h-[15px] w-[15px] text-[#f2c94c]" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-white/[0.07] pt-2.5 text-[10px] text-white/35">
            <span className="inline-flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-[#f2c94c]" />
              Won the race
            </span>
            <span className="tabular-nums">
              {racesLed} of {knownRounds} {knownRounds === 1 ? "race" : "races"} in front
              {best && bestMeta
                ? ` · best ${best.lapsLed} laps at ${bestMeta.country}`
                : ""}
            </span>
          </div>
          {data.partial && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[10px] leading-relaxed text-white/30">
              <span>
                {rows.length - knownRounds} {rows.length - knownRounds === 1 ? "round is" : "rounds are"} missing
                from the timing feed and are left out of these totals.
              </span>
              <RetryButton onClick={() => setAttempt((n) => n + 1)} />
            </div>
          )}
        </div>
      )}

      {tip && tipRow && (
        <ChartTooltip anchorX={tip.left} anchorY={tip.top} width={216}>
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <RoundChip country={tipRow.country} />
            <span className="truncate text-[13px] font-bold leading-none text-white">
              {tipRow.country}
            </span>
            <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-white/40">
              R{tipRow.round}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-[11px] text-white/55">Laps Led</span>
            {tipRow.known ? (
              <span className="ml-auto shrink-0 font-f1 text-[12px] font-bold tabular-nums text-white">
                {tipRow.lapsLed} {tipRow.lapsLed === 1 ? "lap" : "laps"}
              </span>
            ) : (
              <span className="ml-auto shrink-0 text-[11px] font-semibold text-white/40">
                Not published
              </span>
            )}
          </div>
          {tipRow.finish != null && (
            <div className="flex items-center gap-2 border-t border-white/10 px-3 py-1.5">
              <span className="text-[11px] text-white/45">Finished</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-white/80">
                P{tipRow.finish}
                {tipRow.finish === 1 && <Trophy className="h-3 w-3 text-[#f2c94c]" />}
              </span>
            </div>
          )}
        </ChartTooltip>
      )}
    </Panel>
  );
}
