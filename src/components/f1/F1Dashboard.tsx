"use client";

import { useCallback, useEffect, useState } from "react";
import { CountdownCells, MiniCountdown, useNow } from "@/components/f1/Countdown";
import WatchLiveButton from "@/components/f1/WatchLiveButton";
import TelemetryDashboard from "@/components/f1/TelemetryDashboard";
import type { F1Round, F1Schedule, F1Session } from "@/lib/f1";

// ---------------------------------------------------------------------------
// Formula 1 dashboard (the /f1 page). Static shell above; this client component
// fetches the season model from /api/f1/schedule (edge-cached 60 s) and renders:
//
//   1. Next-up race card with the "Lights Out In" countdown to the next
//      session (FP1 → Qualifying → Sprint → Race) and the red Watch Live
//      gate (unlocks 30 min before session start).
//   2. The race weekend's session rows with per-session mini countdowns.
//   3. The next three races strip.
//   4. The full season calendar.
//   5. The GP-Tempo-style telemetry dashboard.
//
// All schedule facts are OpenF1's; countdowns tick against the user's clock
// anchored on the server-provided UTC instants.
// ---------------------------------------------------------------------------

function fmtLocal(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDayRange(startIso: string, endIso: string): string {
  const a = new Date(startIso);
  const b = new Date(endIso);
  const sameMonth = a.getMonth() === b.getMonth();
  const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric" });
  const fmtFull = (d: Date) =>
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return sameMonth ? `${fmtDay(a)}–${fmtDay(b)} ${a.toLocaleDateString(undefined, { month: "short" })}` : `${fmtFull(a)} – ${fmtFull(b)}`;
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
  const now = useNow(1000);
  const [schedule, setSchedule] = useState<F1Schedule | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/f1/schedule");
      if (!res.ok) throw new Error("bad status");
      setSchedule((await res.json()) as F1Schedule);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (failed) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
        <p className="text-lg font-semibold text-text">The pit wall is offline</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Live F1 data is unavailable right now — check back in a moment.
        </p>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="space-y-4" aria-hidden="true">
        <div className="h-64 animate-pulse rounded-2xl bg-surface/60" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface/40" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface/40" />
      </div>
    );
  }

  const next = schedule.nextSession;
  const round = schedule.rounds[schedule.nextRoundIndex] ?? null;

  return (
    <div className="space-y-8">
      {round && next && (
        <NextRaceCard round={round} next={next} schedule={schedule} now={now} />
      )}
      {round && next && <WeekendSessions round={round} next={next} now={now} />}
      <NextRacesStrip schedule={schedule} now={now} />
      <SeasonCalendar schedule={schedule} now={now} />
      <TelemetryDashboard schedule={schedule} />
      <p className="text-center text-[11px] leading-relaxed text-muted/70">
        Unofficial product of ReelHouse. Not associated with Formula 1, FIA or any team —
        schedule and telemetry data from OpenF1.
      </p>
    </div>
  );
}

// ------------------------------ next race card ------------------------------

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
  return (
    <section className="nm-glass relative overflow-hidden rounded-2xl p-5 md:p-8">
      {/* Track-outline watermark (official F1 circuit art) */}
      {m.circuit_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.circuit_image}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 top-1/2 hidden w-64 -translate-y-1/2 opacity-[0.07] md:block lg:w-80"
          draggable={false}
        />
      )}

      <div className="relative">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-accent/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-accent">
            ◆ Round {schedule.nextRoundIndex + 1} of {schedule.rounds.length}
          </span>
          {m.country_flag && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.country_flag} alt={m.country_name} className="h-4 w-7 rounded-sm object-cover" draggable={false} />
          )}
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {m.country_name}
          </span>
        </div>

        <h2 className="mt-3 font-display text-4xl uppercase leading-[0.95] tracking-wide text-foreground sm:text-6xl">
          {m.meeting_name.replace(/ Grand Prix$/i, "")}{" "}
          <span className="text-accent">Grand Prix</span>
        </h2>
        <p className="mt-2 text-sm text-muted">
          {m.circuit_short_name ?? m.location} · {m.location} · {fmtDayRange(m.date_start, m.date_end ?? m.date_start)}
        </p>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full max-w-md">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              {next.session_name} in
            </p>
            <CountdownCells target={next.date_start} now={now} />
          </div>
          <div className="shrink-0">
            <WatchLiveButton sessionStart={next.date_start} sessionEnd={next.date_end} now={now} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------ weekend sessions ----------------------------

const STATUS_STYLES: Record<SessionStatus, string> = {
  completed: "bg-white/5 text-muted-foreground/50",
  live: "bg-[#e10600] text-white",
  next: "bg-accent/15 text-accent",
  scheduled: "bg-white/5 text-muted-foreground",
};

function WeekendSessions({ round, next, now }: { round: F1Round; next: F1Session; now: number }) {
  return (
    <section aria-label="This race weekend">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          On track this weekend
        </p>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
          Your local time
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {round.sessions.map((s) => {
          const status = sessionStatus(s, next, now);
          return (
            <div
              key={s.session_key}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${
                status === "next"
                  ? "border-accent/40 bg-accent/[0.06]"
                  : status === "live"
                    ? "border-[#e10600]/40 bg-[#e10600]/[0.06]"
                    : "border-white/[0.06] bg-surface/40"
              } ${status === "completed" ? "opacity-60" : ""}`}
            >
              <div className="min-w-0">
                <p className="truncate font-display text-lg uppercase tracking-wide text-foreground">
                  {s.session_name}
                </p>
                <p className="text-xs tabular-nums text-muted">{fmtLocal(s.date_start)}</p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${STATUS_STYLES[status]}`}
                >
                  {status === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
                  {status === "completed" ? "Done" : status === "live" ? "Live" : status === "next" ? "Up next" : "Scheduled"}
                </span>
                {status === "scheduled" && (
                  <div className="mt-1 text-[11px]">
                    <MiniCountdown target={s.date_start} now={now} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------ next races strip ----------------------------

function NextRacesStrip({ schedule, now }: { schedule: F1Schedule; now: number }) {
  const upcoming = schedule.rounds
    .filter((r) => new Date(r.race.date_end ?? r.race.date_start).getTime() >= now)
    .slice(0, 3);
  if (upcoming.length === 0) return null;

  return (
    <section aria-label="Next races">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        Next races
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {upcoming.map((r, i) => (
          <div
            key={r.meeting.meeting_key}
            className={`rounded-xl border p-4 transition hover:-translate-y-0.5 ${
              i === 0 ? "border-accent/30 bg-accent/[0.05]" : "border-white/[0.06] bg-surface/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">
                R{schedule.rounds.indexOf(r) + 1}
              </span>
              {r.meeting.country_flag && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.meeting.country_flag} alt="" className="h-3.5 w-6 rounded-sm object-cover" draggable={false} />
              )}
            </div>
            <p className="mt-1.5 truncate font-display text-xl uppercase tracking-wide text-foreground">
              {r.meeting.meeting_name.replace(/ Grand Prix$/i, "")}
            </p>
            <p className="truncate text-xs text-muted">
              {r.meeting.circuit_short_name ?? r.meeting.location} · {fmtDayRange(r.meeting.date_start, r.meeting.date_end ?? r.meeting.date_start)}
            </p>
            <div className="mt-2 border-t border-white/[0.06] pt-2 text-[11px]">
              <span className="text-muted-foreground/70">Race in </span>
              <MiniCountdown target={r.race.date_start} now={now} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ------------------------------ season calendar -----------------------------

function SeasonCalendar({ schedule, now }: { schedule: F1Schedule; now: number }) {
  return (
    <section aria-label={`${schedule.year} season calendar`}>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        {schedule.year} Season · {schedule.rounds.length} rounds
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {schedule.rounds.map((r, i) => {
          const raceEnd = new Date(r.race.date_end ?? r.race.date_start).getTime();
          const done = raceEnd < now;
          const isNext = i === schedule.nextRoundIndex;
          return (
            <div
              key={r.meeting.meeting_key}
              className={`relative overflow-hidden rounded-xl border p-3.5 transition ${
                isNext
                  ? "border-accent/50 bg-accent/[0.06]"
                  : done
                    ? "border-white/[0.04] bg-surface/30 opacity-55"
                    : "border-white/[0.06] bg-surface/40 hover:border-white/15"
              }`}
            >
              {isNext && (
                <span className="absolute right-2.5 top-2.5 rounded-full bg-accent px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-accent-ink">
                  Next
                </span>
              )}
              {done && (
                <span className="absolute right-2.5 top-2.5 text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground/50">
                  ✓
                </span>
              )}
              <span className="font-display text-3xl leading-none text-foreground/15">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="mt-2 flex items-center gap-2">
                {r.meeting.country_flag && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.meeting.country_flag} alt="" className="h-3 w-5 rounded-sm object-cover" draggable={false} />
                )}
                <p className="truncate text-[13px] font-bold text-foreground">
                  {r.meeting.meeting_name.replace(/ Grand Prix$/i, "")} GP
                </p>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {r.meeting.circuit_short_name ?? r.meeting.location}
              </p>
              <p className="mt-1 text-[10px] tabular-nums text-muted-foreground/70">
                {fmtDayRange(r.meeting.date_start, r.meeting.date_end ?? r.meeting.date_start)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
