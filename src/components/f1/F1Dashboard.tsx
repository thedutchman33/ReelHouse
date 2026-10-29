"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { CountdownCells, MiniCountdown, useNow } from "@/components/f1/Countdown";
import WatchLiveButton from "@/components/f1/WatchLiveButton";
import ResultsCentre from "@/components/f1/ResultsCentre";
import TelemetryCentre from "@/components/f1/TelemetryCentre";
import SessionTabs from "@/components/f1/SessionTabs";
import SessionRecords from "@/components/f1/SessionRecords";
import StandingsCentre from "@/components/f1/StandingsCentre";
import CircuitMap3D from "@/components/f1/CircuitMap3D";
import {
  SessionTimeProvider,
  TimeZoneToggle,
  useSessionTime,
} from "@/components/f1/timezone";
import type { F1LapPick, F1Round, F1Schedule, F1Session } from "@/lib/f1";

// ---------------------------------------------------------------------------
// Formula 1 dashboard (the /f1 page). Palette: red / white / black / grey /
// blue. Structure: countdown hero with the circuit map → next-up + season
// calendar card (scrollable) → session centre (results & lap times) → lap
// telemetry. All schedule/telemetry facts are OpenF1's; countdowns tick
// against the user's clock anchored on server-provided UTC instants.
// ---------------------------------------------------------------------------

/** Lap picks survive reloads and back/forward navigation (same idea as the
 *  Session|Telemetry view-mode key). */
const PICKS_KEY = "reelhouse-f1-picks";

function readStoredPicks(): F1LapPick[] {
  if (typeof window === "undefined") return [];
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(PICKS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (p): p is F1LapPick =>
          !!p &&
          typeof (p as F1LapPick).driverNumber === "number" &&
          typeof (p as F1LapPick).lap === "number"
      )
      .slice(-4)
      .map((p) => ({
        driverNumber: p.driverNumber,
        lap: p.lap,
        colour: typeof p.colour === "string" ? p.colour : undefined,
        sessionKey: typeof p.sessionKey === "number" ? p.sessionKey : undefined,
      }));
  } catch {
    return [];
  }
}

function writeStoredPicks(picks: F1LapPick[]): void {
  try {
    window.localStorage.setItem(PICKS_KEY, JSON.stringify(picks));
  } catch {
    /* storage disabled — picks just won't persist */
  }
}

/** "just now" / "42s ago" / "3m ago" for the last successful schedule fetch. */
function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

type SessionStatus = "completed" | "live" | "next" | "scheduled";

function sessionStatus(s: F1Session, next: F1Session | null, now: number): SessionStatus {
  const start = new Date(s.date_start).getTime();
  const end = s.date_end ? new Date(s.date_end).getTime() : start + 2 * 3600_000;
  if (now > end) return "completed";
  if (now >= start && now <= end) return "live";
  if (next && s.session_key === next.session_key) return "next";
  return "scheduled";
}

export default function F1Dashboard() {
  return (
    <SessionTimeProvider>
      <DashboardBody />
    </SessionTimeProvider>
  );
}

function DashboardBody() {
  const now = useNow(1000);
  const [schedule, setSchedule] = useState<F1Schedule | null>(null);
  /** No schedule at all — the page-level outage state. */
  const [failed, setFailed] = useState(false);
  /** A refresh failed but the last good schedule is still on screen. */
  const [stale, setStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [picks, setPicks] = useState<F1LapPick[]>(readStoredPicks);
  /** Session-records hand-off: the centre loads this session when it lands. */
  const [preset, setPreset] = useState<{ key: number; nonce: number } | null>(null);
  const nonceRef = useRef(0);
  /** Whether a good schedule has ever landed (a failed poll isn't an outage). */
  const hasDataRef = useRef(false);

  const openSession = useCallback((key: number) => {
    nonceRef.current += 1;
    setPreset({ key, nonce: nonceRef.current });
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/f1/schedule");
      if (!res.ok) throw new Error("bad status");
      setSchedule((await res.json()) as F1Schedule);
      hasDataRef.current = true;
      setFailed(false);
      setStale(false);
      setLastUpdated(Date.now());
    } catch {
      // One failed poll is not an outage: keep the last good schedule on
      // screen and flag it stale rather than blanking the dashboard.
      if (hasDataRef.current) setStale(true);
      else setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  // The telemetry deck outlives the tab, the reload and the back button.
  useEffect(() => {
    writeStoredPicks(picks);
  }, [picks]);

  if (failed) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-surface/40 px-6 py-16 text-center">
        <p className="text-lg font-semibold text-text">The pit wall is offline</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Live F1 data is unavailable right now — check back in a moment.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="mt-5 inline-flex h-9 items-center rounded-lg bg-[#e10600] px-4 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#ff2421] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
        >
          {refreshing ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  if (!schedule) {
    return <DashboardSkeleton />;
  }

  // The event the hero tracks: the first session that hasn't finished, so the
  // Watch Live control rolls onto the next countdown at the scheduled end.
  const next =
    schedule.rounds
      .flatMap((r) => r.sessions)
      .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime())
      .find((s) => new Date(s.date_end ?? s.date_start).getTime() >= now) ??
    schedule.nextSession;
  const round =
    (next &&
      schedule.rounds.find((r) => r.sessions.some((s) => s.session_key === next.session_key))) ||
    schedule.rounds[schedule.nextRoundIndex] ||
    null;
  const agoLabel = lastUpdated == null ? "not yet updated" : fmtAgo(now - lastUpdated);

  return (
    <div className="space-y-8">
      {/* status row: data freshness + refresh, and the timezone switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              stale
                ? "bg-[#f0b429]"
                : "bg-[#22c55e] shadow-[0_0_6px_rgb(34_197_94/0.8)]"
            }`}
          />
          <span>{stale ? "Showing last known data" : "Live schedule"}</span>
          <span aria-hidden="true" className="text-white/20">
            ·
          </span>
          <span className="tabular-nums">Updated {agoLabel}</span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            aria-label="Refresh schedule data"
            title="Refresh schedule data"
            className="ml-0.5 grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-black/30 text-white/55 transition hover:border-[#e10600] hover:text-white disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <TimeZoneToggle />
      </div>

      {stale && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f0b429]/40 bg-[#f0b429]/10 px-4 py-3 text-xs text-[#ffd27a]"
        >
          <p>Live data is stale — the last refresh failed. Showing the most recent schedule.</p>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="rounded-md border border-[#f0b429]/50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] transition hover:bg-[#f0b429]/20 disabled:opacity-60"
          >
            Retry now
          </button>
        </div>
      )}

      {round && next && <NextRaceCard round={round} next={next} schedule={schedule} now={now} />}
      {round && next && (
        <NextUpCalendarCard schedule={schedule} round={round} next={next} now={now} />
      )}
      {round && (
        <SessionRecords
          schedule={schedule}
          round={round}
          now={now}
          onOpenSession={openSession}
        />
      )}
      <SessionTabs
        sessionContent={
          <ResultsCentre
            schedule={schedule}
            picks={picks}
            onPicksChange={setPicks}
            presetSession={preset}
          />
        }
        telemetryContent={
          <TelemetryCentre picks={picks} onPicksChange={setPicks} />
        }
        lapCount={picks.length}
      />
      <StandingsCentre />
    </div>
  );
}

// ------------------------------ hero + circuit map --------------------------

function NextRaceCard({
  round,
  next,
  schedule,
  now,
}: {
  round: F1Round;
  next: F1Session;
  schedule: F1Schedule;
  now: number;
}) {
  const m = round.meeting;
  const { dayRange } = useSessionTime();
  return (
    <section className="f1-card relative overflow-hidden rounded-2xl p-5 md:p-8">
      <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-full bg-[#e10600]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#ff5347]">
              <span aria-hidden="true">◆ </span>Round {schedule.nextRoundIndex + 1} of{" "}
              {schedule.rounds.length}
            </span>
            {m.country_flag && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.country_flag} alt={m.country_name} className="h-4 w-7 rounded-sm object-cover" draggable={false} />
            )}
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
              {m.country_name}
            </span>
          </div>

          {/* "Mexico City" on the first line, "Grand Prix" red beneath it —
              the F1 Bold two-line lockup. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <h2 className="font-f1 text-4xl font-bold uppercase leading-[0.95] tracking-wide text-white sm:text-6xl">
              {m.meeting_name.replace(/ Grand Prix$/i, "")}
              <span className="block text-[#e10600]">{" "}Grand Prix</span>
            </h2>
            <div className="ml-auto w-full shrink-0 sm:w-auto">
              <WatchLiveButton
                now={now}
                targetISO={next.date_start}
                endISO={next.date_end}
                sessionName={next.session_name}
              />
            </div>
          </div>
          <p className="mt-2 text-sm text-white/50">
            {m.circuit_short_name ?? m.location} · {m.location} ·{" "}
            <time dateTime={m.date_start}>{dayRange(m.date_start, m.date_end ?? m.date_start)}</time>
          </p>

          <div className="mt-6 w-full max-w-md">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/50">
              {next.session_name} in
            </p>
            <CountdownCells target={next.date_start} now={now} />
          </div>
        </div>

        {/* Circuit map — REAL track geometry, extruded into a 3D plate */}
        <div className="flex w-[230px] shrink-0 flex-col items-center sm:w-[280px] lg:w-[330px] xl:w-[380px]">
          <CircuitMap3D
            circuitInfoUrl={m.circuit_info_url}
            circuitImage={m.circuit_image}
            name={m.circuit_short_name ?? m.location}
          />
          <p className="mt-1 text-center">
            <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              Circuit
            </span>
            <span className="mt-0.5 block font-display text-lg uppercase tracking-wide text-white">
              {m.circuit_short_name ?? m.location}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

// ------------------------------ next up + calendar --------------------------

const STATUS_STYLES: Record<SessionStatus, string> = {
  completed: "bg-white/5 text-white/40",
  live: "bg-[#e10600] text-white",
  next: "bg-[#e10600]/15 text-[#ff5347]",
  scheduled: "bg-white/5 text-white/50",
};

function NextUpCalendarCard({
  schedule,
  round,
  next,
  now,
}: {
  schedule: F1Schedule;
  /** The weekend the hero is pointing at (drives the session strip). */
  round: F1Round;
  next: F1Session;
  now: number;
}) {
  const { dateTime, dayMonth } = useSessionTime();
  // The whole weekend — FP1 → Race (or the sprint layout) — not just the next
  // three sessions anywhere on the calendar.
  const weekend = round.sessions.map((session) => ({ session, meeting: round.meeting }));

  // Calendar strip: arrow paging + edge detection for the scroll buttons.
  const stripRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: true, r: false });
  const measureEdge = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setEdge({
      l: el.scrollLeft <= 1,
      r: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    // Open centered on the next round instead of Round 1, matching the
    // reference strip; instant scroll (no motion) then measure the arrows.
    const card = el.querySelector<HTMLElement>("[data-next]");
    if (card) {
      el.scrollLeft = Math.max(0, card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2);
    }
    measureEdge();
    el.addEventListener("scroll", measureEdge, { passive: true });
    window.addEventListener("resize", measureEdge);
    return () => {
      el.removeEventListener("scroll", measureEdge);
      window.removeEventListener("resize", measureEdge);
    };
  }, [measureEdge, schedule.rounds.length]);

  const doneCount = schedule.rounds.filter(
    (r) => new Date(r.race.date_end ?? r.race.date_start).getTime() < now
  ).length;
  const progressPct = Math.min(100, Math.round((doneCount / schedule.rounds.length) * 100));
  const scrollStrip = (dir: -1 | 1) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 280), behavior: "smooth" });
  };

  // The strip is a focusable region, so keyboard users page it with the
  // arrows (and jump to either end with Home/End) instead of needing a mouse.
  const onStripKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const el = stripRef.current;
    if (!el) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollStrip(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollStrip(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      el.scrollTo({ left: 0, behavior: "smooth" });
    } else if (e.key === "End") {
      e.preventDefault();
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    }
  };

  return (
    <section
      aria-label="This weekend and season calendar"
      className="rounded-2xl border border-white/[0.06] bg-surface/40 p-4 md:p-6"
    >
      {/* The weekend's full session slate */}
      <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/50">
        <span aria-hidden="true" className="text-[#e10600]">
          ◆
        </span>
        This weekend
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {weekend.map(({ session, meeting }) => {
          const status = sessionStatus(session, next, now);
          const live = status === "live";
          const done = status === "completed";
          const isNext = status === "next";
          // Running / imminent sessions burn red, finished ones recede, the
          // rest glow blue — colour-coded urgency in the F1 red/black/white base.
          const soon = !done && new Date(session.date_start).getTime() - now < 86_400_000;
          return (
            <div
              key={session.session_key}
              aria-current={isNext ? "true" : undefined}
              className={`rounded-xl border px-4 py-3 ${
                live
                  ? "border-[#e10600] bg-gradient-to-b from-[#e10600]/[0.2] to-black/30 shadow-[0_0_20px_rgb(225_6_0/0.22)]"
                  : done
                    ? "border-white/[0.06] bg-black/20"
                    : soon
                      ? "border-[#e10600]/45 bg-gradient-to-b from-[#e10600]/[0.13] to-black/25 shadow-[0_0_16px_rgb(225_6_0/0.14)]"
                      : "border-[#4f83f7]/20 bg-black/20"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`truncate font-display text-lg uppercase tracking-wide ${
                    done ? "text-white/40" : "text-white"
                  }`}
                >
                  {session.session_name}
                </p>
                {meeting.country_flag && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={meeting.country_flag}
                    alt=""
                    className={`h-3.5 w-6 shrink-0 rounded-sm object-cover ${done ? "opacity-40" : ""}`}
                    draggable={false}
                  />
                )}
              </div>
              {/* Wrap instead of truncating: the city + date + time (with its
                  AM/PM) must stay readable in the narrow five-up cards. */}
              <p className={`text-xs leading-snug ${done ? "text-white/30" : "text-white/50"}`}>
                {meeting.meeting_name.replace(/ Grand Prix$/i, "")} ·{" "}
                <time dateTime={session.date_start} className="whitespace-nowrap">
                  {dateTime(session.date_start)}
                </time>
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5 text-[11px]">
                {live ? (
                  <>
                    <span className="font-bold text-[#ff5347]">Live now</span>
                    <span className="flex items-center gap-1.5 font-bold text-[#ff5347]">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e10600]"
                      />
                      ON TRACK
                    </span>
                  </>
                ) : done ? (
                  <>
                    <span className="text-white/30">
                      {session.session_name === "Race" ? "Chequered flag" : "Session"}
                    </span>
                    <span className="flex items-center gap-1.5 text-white/40">
                      <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden="true">
                        <circle cx="6" cy="6" r="5.6" fill="#e10600" opacity="0.55" />
                        <path
                          d="M3.5 6.2 5.1 7.9 8.5 4.2"
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="1.35"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Done
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-white/40">
                      {session.session_name === "Race" ? "Lights out in" : "Starts in"}
                    </span>
                    <span
                      className={`tabular-nums ${soon ? "font-bold text-[#ff5347]" : "text-[#4f83f7]"}`}
                    >
                      <MiniCountdown target={session.date_start} now={now} />
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Season calendar — the Grid-style horizontal strip */}
      <div className="mt-7">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-2xl font-black uppercase leading-none tracking-wide text-white sm:text-[27px]">
            Season <span className="italic text-[#e10600]">calendar</span>
          </p>
          <div className="flex items-center gap-2">
            <p className="mr-1 hidden text-right text-[10px] font-bold uppercase leading-tight tracking-[0.18em] text-white/35 sm:block">
              {schedule.rounds.length} rounds · {schedule.year} ·{" "}
              <span className="tabular-nums text-[#e10600]">{doneCount} done</span>
            </p>
            <button
              type="button"
              aria-label="Earlier rounds"
              disabled={edge.l}
              onClick={() => scrollStrip(-1)}
              className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-black/30 text-white/60 transition hover:border-[#e10600] hover:bg-[#e10600] hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              <svg viewBox="0 0 8 12" className="h-3 w-2" aria-hidden="true">
                <path
                  d="M6.5 1 2 6l4.5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Later rounds"
              disabled={edge.r}
              onClick={() => scrollStrip(1)}
              className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-black/30 text-white/60 transition hover:border-[#e10600] hover:bg-[#e10600] hover:text-white disabled:pointer-events-none disabled:opacity-30"
            >
              <svg viewBox="0 0 8 12" className="h-3 w-2" aria-hidden="true">
                <path
                  d="M1.5 1 6 6l-4.5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Season progress: one red line across the whole year */}
        <div className="relative mt-3.5 mb-4 h-[3px] rounded-full bg-white/10">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[#e10600]"
            style={{ width: `${progressPct}%` }}
          />
          <div
            aria-hidden="true"
            className="absolute top-1/2 h-[9px] w-[9px] -translate-y-1/2 rounded-full bg-[#e10600] shadow-[0_0_9px_rgb(225_6_0/0.8)]"
            style={{ left: `calc(${progressPct}% - 4.5px)` }}
          />
        </div>

        <div
          ref={stripRef}
          tabIndex={0}
          role="region"
          aria-label="Season calendar — press the arrow keys to scroll through rounds"
          onKeyDown={onStripKeyDown}
          className="f1-scroll flex snap-x snap-mandatory gap-2.5 overflow-x-auto rounded-lg pb-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e10600]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f15]"
        >
          {schedule.rounds.map((r, i) => {
            const raceEnd = new Date(r.race.date_end ?? r.race.date_start).getTime();
            const done = raceEnd < now;
            const isNext = i === schedule.nextRoundIndex;
            return (
              <article
                key={r.meeting.meeting_key}
                data-next={isNext ? "" : undefined}
                aria-current={isNext ? "true" : undefined}
                className={`relative w-[118px] shrink-0 snap-start rounded-xl border p-3 transition ${
                  isNext
                    ? "border-[#e10600]/70 bg-gradient-to-b from-[#e10600]/[0.16] to-black/55 shadow-[0_0_26px_rgb(225_6_0/0.32)]"
                    : done
                      ? "border-white/[0.07] bg-black/50 hover:border-[#e10600]/30"
                      : "border-white/[0.1] bg-black/30 hover:border-[#4f83f7]/50"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  {done ? (
                    // Completed rounds keep the F1 red in play: solid red check.
                    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                      <circle cx="6" cy="6" r="5.6" fill="#e10600" />
                      <path d="M3.5 6.2 5.1 7.9 8.5 4.2" fill="none" stroke="#ffffff" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        isNext
                          ? "bg-[#e10600] shadow-[0_0_7px_rgb(225_6_0/0.9)]"
                          : "bg-[#4f83f7] shadow-[0_0_6px_rgb(79_131_247/0.8)]"
                      }`}
                    />
                  )}
                  {isNext ? (
                    <span className="rounded-sm bg-[#e10600] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.13em] text-white">
                      R{String(i + 1).padStart(2, "0")} · Next
                    </span>
                  ) : done ? (
                    <span className="rounded-sm border border-[#e10600]/35 bg-[#e10600]/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.13em] text-[#ff5347]">
                      Done
                    </span>
                  ) : (
                    <span className="text-[9px] font-black tabular-nums tracking-wider text-white/45">
                      R{String(i + 1).padStart(2, "0")}
                    </span>
                  )}
                </div>

                <p
                  className={`mt-2.5 truncate font-f1 text-[28px] font-black uppercase leading-[0.9] tracking-[0.01em] ${
                    isNext ? "text-white" : done ? "text-white/35" : "text-white"
                  }`}
                >
                  {r.meeting.country_code}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {r.meeting.country_flag && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.meeting.country_flag}
                      alt=""
                      className={`h-3.5 w-5 shrink-0 rounded-[3px] object-cover ${done ? "opacity-50" : ""}`}
                      draggable={false}
                    />
                  )}
                  <span className={`truncate text-[11px] font-bold ${done ? "text-white/55" : "text-white/90"}`}>
                    {r.meeting.country_name}
                  </span>
                </div>
                <p
                  className={`truncate text-[10px] ${
                    isNext ? "text-white/60" : done ? "text-white/35" : "text-[#4f83f7]"
                  }`}
                >
                  {r.meeting.circuit_short_name ?? r.meeting.location}
                </p>

                <div className="mt-2 border-t border-white/[0.07] pt-1.5">
                  <time
                    dateTime={r.meeting.date_start}
                    className={`text-[9.5px] font-black uppercase tracking-[0.12em] ${
                      isNext ? "text-[#ff5347]" : done ? "text-white/35" : "text-white/65"
                    }`}
                  >
                    {dayMonth(r.meeting.date_start)}
                  </time>
                </div>
              </article>
            );
          })}
          <div aria-hidden="true" className="w-px shrink-0" />
        </div>
      </div>
    </section>
  );
}

// ------------------------------ loading skeleton ---------------------------

/** Layout-matched placeholder: same rhythm as the real dashboard, so nothing
 *  jumps when the first schedule lands. */
function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <p className="sr-only" role="status">
        Loading this season&apos;s race weekends…
      </p>

      {/* status row */}
      <div className="flex items-center justify-between gap-3" aria-hidden="true">
        <div className="h-3 w-44 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="h-6 w-40 animate-pulse rounded-lg bg-white/[0.05]" />
      </div>

      {/* hero: title + countdown cells beside the circuit plate */}
      <div className="f1-card rounded-2xl p-5 md:p-8" aria-hidden="true">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="h-5 w-44 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="mt-3 h-9 w-72 max-w-full animate-pulse rounded-lg bg-white/[0.07] sm:h-12" />
            <div className="mt-3 h-3 w-56 animate-pulse rounded-full bg-white/[0.05]" />
            <div className="mt-6 grid max-w-md grid-cols-4 gap-2 sm:gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="nm-inset rounded-xl px-2 py-3 text-center sm:py-4">
                  <div className="mx-auto h-7 w-10 animate-pulse rounded bg-white/[0.07] sm:h-10 sm:w-14" />
                  <div className="mx-auto mt-2 h-2 w-8 animate-pulse rounded-full bg-white/[0.05]" />
                </div>
              ))}
            </div>
          </div>
          <div className="mx-auto h-[230px] w-[230px] animate-pulse rounded-[45%] bg-white/[0.04] sm:h-[280px] sm:w-[280px] lg:h-[330px] lg:w-[330px]" />
        </div>
      </div>

      {/* next up + calendar strip */}
      <div
        className="rounded-2xl border border-white/[0.06] bg-surface/40 p-4 md:p-6"
        aria-hidden="true"
      >
        <div className="h-3 w-24 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[86px] animate-pulse rounded-xl border border-white/[0.06] bg-black/20"
            />
          ))}
        </div>
        <div className="mt-8 h-3 w-40 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="mt-5 mb-4 h-[3px] animate-pulse rounded-full bg-white/[0.06]" />
        <div className="flex gap-2.5 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-[132px] w-[118px] shrink-0 animate-pulse rounded-xl border border-white/[0.06] bg-black/30"
            />
          ))}
        </div>
      </div>

      {/* session records sheet */}
      <div className="f1-card rounded-2xl p-4 md:p-6" aria-hidden="true">
        <div className="h-5 w-48 animate-pulse rounded bg-white/[0.06]" />
        <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.06]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[52px] animate-pulse border-b border-white/[0.04] bg-black/20 last:border-0"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
