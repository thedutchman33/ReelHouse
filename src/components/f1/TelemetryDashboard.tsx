"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { F1Schedule, F1Session, F1TelemetryDriver, F1TelemetryPayload } from "@/lib/f1";

// ---------------------------------------------------------------------------
// Telemetry dashboard (GP-Tempo pattern, ReelHouse design language): pick a
// session, pick up to three drivers, get real OpenF1 numbers — speed / gear /
// throttle / brake / DRS gauges fed by the car-data stream, plus a per-lap
// time chart. Live sessions poll every 5 s; finished sessions show their
// closing moments. All values are recorded data, never synthesized.
// ---------------------------------------------------------------------------

const MAX_DRIVERS = 3;
// OpenF1 allows ~30 upstream requests/min; the server-side fetch cache
// collapses this poll into shared cache entries (see f1.ts).
const POLL_MS = 15000;

const pad = (n: number) => String(n).padStart(2, "0");
const lapFmt = (s: number) =>
  `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}.${String(Math.round((s % 1) * 1000)).padStart(3, "0")}`;

/** Local-time label, rendered client-side only (fetched data never SSRs). */
function fmtLocal(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sessionLabel(s: F1Session): string {
  return `${s.session_name} · ${s.location} · ${fmtLocal(s.date_start)}`;
}

export default function TelemetryDashboard({ schedule }: { schedule: F1Schedule }) {
  // Session options: every real session, newest first.
  const sessionOptions = useMemo(() => {
    const all = schedule.rounds.flatMap((r) => r.sessions);
    return [...all].sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime());
  }, [schedule]);

  const [sessionKey, setSessionKey] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [roster, setRoster] = useState<F1TelemetryDriver["driver"][]>([]);
  const [data, setData] = useState<F1TelemetryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const selectedRef = useRef<number[]>([]);
  selectedRef.current = selected;

  // Default session: one that actually has data — the live session if any,
  // otherwise the most recent completed one. The next unstarted session has
  // no telemetry yet, so it must not be the default.
  useEffect(() => {
    if (sessionKey != null || sessionOptions.length === 0) return;
    const nowMs = Date.now();
    const live = sessionOptions.find(
      (s) =>
        nowMs >= new Date(s.date_start).getTime() &&
        nowMs <= new Date(s.date_end ?? s.date_start).getTime()
    );
    if (live) {
      setSessionKey(live.session_key);
      return;
    }
    const lastDone = sessionOptions.find((s) => nowMs > new Date(s.date_end ?? s.date_start).getTime());
    if (lastDone) setSessionKey(lastDone.session_key);
  }, [sessionOptions, sessionKey]);

  const fetchTelemetry = useCallback(async (key: number, drivers: number[]) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ session: String(key) });
      if (drivers.length) qs.set("drivers", drivers.join(","));
      const res = await fetch(`/api/f1/telemetry?${qs.toString()}`);
      if (!res.ok) throw new Error("bad status");
      const payload = (await res.json()) as F1TelemetryPayload;
      setData(payload);
      if (payload.roster?.length) setRoster(payload.roster);
      // Reflect the API's default driver set on the chips until the user picks.
      if (selectedRef.current.length === 0 && payload.drivers.length) {
        setSelected(payload.drivers.map((d) => d.driver.driver_number));
      }
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // (Re)load on session/driver change; poll while the session is live and the
  // tab is visible (hidden tabs skip polls to save the rate budget).
  useEffect(() => {
    if (sessionKey == null) return;
    let alive = true;
    let timer = 0;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void run();
    };
    const run = async () => {
      await fetchTelemetry(sessionKey, selectedRef.current);
      if (alive) timer = window.setTimeout(tick, POLL_MS);
    };
    void run();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [sessionKey, selected, fetchTelemetry]);

  const toggleDriver = (n: number) => {
    setSelected((cur) =>
      cur.includes(n)
        ? cur.filter((x) => x !== n)
        : cur.length >= MAX_DRIVERS
          ? [...cur.slice(1), n]
          : [...cur, n]
    );
  };

  const session = data?.session ?? sessionOptions.find((s) => s.session_key === sessionKey) ?? null;
  const isLive =
    session != null &&
    Date.now() >= new Date(session.date_start).getTime() &&
    (!session.date_end || Date.now() <= new Date(session.date_end).getTime());

  return (
    <section className="nm-glass rounded-2xl p-4 md:p-6" aria-label="Telemetry dashboard">
      {/* Head: eyebrow + live badge + session picker */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Telemetry
            {isLive && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e10600]/15 px-2 py-0.5 text-[9px] font-black tracking-[0.14em] text-[#ff4d43]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e10600]" />
                LIVE
              </span>
            )}
          </p>
          <h2 className="mt-1 font-display text-2xl tracking-tight text-foreground md:text-3xl">
            Driver Telemetry
          </h2>
        </div>
        <select
          value={sessionKey ?? ""}
          onChange={(e) => {
            setSessionKey(Number(e.target.value));
            setSelected([]);
            setData(null);
          }}
          aria-label="Session"
          className="field h-9 w-full cursor-pointer text-sm sm:w-80"
        >
          {sessionOptions.map((s) => (
            <option key={s.session_key} value={s.session_key}>
              {sessionLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {/* Driver picker — official headshots, team-colour rings */}
      <div className="mb-5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
          Drivers · pick up to {MAX_DRIVERS}
        </p>
        <DriverRoster roster={roster} selected={selected} onToggle={toggleDriver} />
      </div>

      {/* Gauges + lap chart */}
      {failed ? (
        <p className="rounded-xl border border-dashed border-white/15 bg-surface/40 px-6 py-10 text-center text-sm text-muted">
          Telemetry is unavailable for this session right now.
        </p>
      ) : !data ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-surface/60" />
          ))}
        </div>
      ) : data.drivers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 bg-surface/40 px-6 py-10 text-center text-sm text-muted">
          Select drivers to load their telemetry.
        </p>
      ) : (
        <>
          <div className={`grid grid-cols-1 gap-3 transition-opacity lg:grid-cols-3 ${loading ? "opacity-70" : ""}`}>
            {data.drivers.map((d) => (
              <DriverGauges key={d.driver.driver_number} data={d} />
            ))}
          </div>
          <LapChart drivers={data.drivers} />
        </>
      )}
    </section>
  );
}

// ------------------------------ driver picker ------------------------------

function DriverRoster({
  roster,
  selected,
  onToggle,
}: {
  roster: F1TelemetryDriver["driver"][];
  selected: number[];
  onToggle: (n: number) => void;
}) {
  if (roster.length === 0) {
    return (
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 w-16 shrink-0 animate-pulse rounded-xl bg-surface/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
      {roster.map((d) => {
        const active = selected.includes(d.driver_number);
        const color = `#${d.team_colour}`;
        return (
          <button
            key={d.driver_number}
            type="button"
            onClick={() => onToggle(d.driver_number)}
            aria-pressed={active}
            className={`group w-[76px] shrink-0 rounded-xl border bg-surface/70 p-2 text-center transition hover:-translate-y-0.5 ${
              active ? "border-transparent" : "border-white/[0.07] hover:border-white/20"
            }`}
            style={active ? { boxShadow: `0 0 0 2px ${color}, 0 6px 18px ${color}44` } : undefined}
          >
            <span
              className="block h-1 w-full rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            {d.headshot_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={d.headshot_url}
                alt={d.full_name}
                className="mx-auto mt-1 h-10 w-10 rounded-full bg-surface object-cover object-top"
                loading="lazy"
                draggable={false}
              />
            ) : (
              <span className="mx-auto mt-1 grid h-10 w-10 place-items-center rounded-full bg-surface font-display text-sm">
                {d.name_acronym}
              </span>
            )}
            <span className="mt-1 block truncate text-[11px] font-bold text-foreground">
              {d.name_acronym}
            </span>
            <span className="block truncate text-[9px] text-muted-foreground/70">{d.team_name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------ gauges --------------------------------------

function DriverGauges({ data }: { data: F1TelemetryDriver }) {
  const latest = data.samples[data.samples.length - 1];
  const color = `#${data.driver.team_colour}`;
  const lastLap = data.laps[data.laps.length - 1]?.lap_time ?? null;
  const topSpeed = data.samples.reduce((max, s) => Math.max(max, s.speed), 0);
  const drsOpen = latest?.drs != null && latest.drs >= 10;

  return (
    <div
      className="rounded-xl border border-white/[0.06] bg-surface/50 p-4"
      style={{ borderTopColor: color, borderTopWidth: 2 }}
    >
      {/* Identity row */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-bold text-foreground">{data.driver.name_acronym}</span>
          <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {data.driver.team_name}
          </span>
        </div>
        {data.position != null ? (
          <span className="nm-inset rounded-md px-2 py-0.5 text-[11px] font-black tabular-nums text-foreground">
            P{data.position}
          </span>
        ) : null}
      </div>

      {/* Speed + gear: the two hero numbers */}
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="font-display text-4xl leading-none tabular-nums text-foreground sm:text-5xl">
            {latest ? latest.speed : "—"}
            <span className="ml-1 text-xs font-bold tracking-widest text-muted-foreground/60">KM/H</span>
          </div>
          {data.bestLap != null && (
            <div className="mt-1.5 text-[11px] tabular-nums text-accent">
              BEST {lapFmt(data.bestLap)}
              {lastLap != null && (
                <span className="ml-2 text-muted-foreground/60">LAST {lapFmt(lastLap)}</span>
              )}
            </div>
          )}
        </div>
        <div className="nm-inset grid h-14 w-14 shrink-0 place-items-center rounded-xl">
          <span className="font-display text-3xl leading-none tabular-nums text-accent">
            {latest?.n_gear ?? "–"}
          </span>
        </div>
      </div>

      {/* Throttle / brake bars */}
      <div className="space-y-2">
        <Bar label="Throttle" value={latest?.throttle ?? 0} color="#34d399" />
        <Bar label="Brake" value={latest?.brake ?? 0} color="#e10600" />
      </div>

      {/* Foot row: DRS + top speed */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-black tracking-[0.18em] transition ${
            drsOpen ? "bg-accent/20 text-accent" : "bg-white/5 text-muted-foreground/40"
          }`}
        >
          DRS {drsOpen ? "OPEN" : "CLOSED"}
        </span>
        {topSpeed > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            TOP {topSpeed} KM/H
          </span>
        )}
      </div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <div className="nm-inset h-2.5 flex-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}

// ------------------------------ lap chart -----------------------------------

function LapChart({ drivers }: { drivers: F1TelemetryDriver[] }) {
  const plotted = drivers.filter((d) => d.laps.length > 1);
  if (plotted.length === 0) return null;

  // Bounds over every plotted lap (ignore outliers above 2× the median best
  // so one slow lap doesn't flatten the chart).
  const times = plotted.flatMap((d) => d.laps.map((l) => l.lap_time)).filter((t): t is number => t != null);
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const cap = median * 1.35;
  const clean = times.filter((t) => t <= cap);
  const min = Math.min(...clean) - 0.5;
  const max = Math.max(...clean) + 0.5;
  const maxLap = Math.max(...plotted.map((d) => d.laps[d.laps.length - 1].lap_number));

  const W = 1000;
  const H = 220;
  const PAD_L = 46;
  const PAD_R = 12;
  const x = (lap: number) => PAD_L + (lap / Math.max(1, maxLap)) * (W - PAD_L - PAD_R);
  const y = (t: number) => 14 + (1 - (t - min) / (max - min)) * (H - 34);

  const fmtTick = (t: number) => lapFmt(t);

  return (
    <div className="mt-5">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
        Lap times · this session
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-surface/40 p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full min-w-[560px]" role="img" aria-label="Lap times chart">
          {/* horizontal gridlines + y ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const t = min + f * (max - min);
            return (
              <g key={f}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                <text x={PAD_L - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.4)" className="tabular-nums">
                  {fmtTick(t)}
                </text>
              </g>
            );
          })}
          {plotted.map((d) => {
            const color = `#${d.driver.team_colour}`;
            const pts = d.laps
              .filter((l): l is typeof l & { lap_time: number } => l.lap_time != null && l.lap_time <= cap)
              .map((l) => `${x(l.lap_number)},${y(l.lap_time)}`)
              .join(" ");
            const best = d.bestLap;
            const bestLapNumber = d.laps.find((l) => l.lap_time === best)?.lap_number;
            return (
              <g key={d.driver.driver_number}>
                <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
                {bestLapNumber != null && (
                  <circle cx={x(bestLapNumber)} cy={y(best!)} r="3.5" fill={color} stroke="#111212" strokeWidth="1.5" />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {/* legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {plotted.map((d) => (
          <span key={d.driver.driver_number} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-4 rounded-full" style={{ backgroundColor: `#${d.driver.team_colour}` }} />
            {d.driver.full_name}
          </span>
        ))}
      </div>
    </div>
  );
}
