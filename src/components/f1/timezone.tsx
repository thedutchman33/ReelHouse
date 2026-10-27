"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Session-time zone. Every session timestamp on the /f1 page renders through
// this context: "local" is the viewer's own clock (the default), "utc" pins
// the whole calendar to UTC — the zone F1 publishes its sessions in. The
// choice persists in localStorage like the Session|Telemetry view mode, and
// the toggle sits in the dashboard's status row.
// ---------------------------------------------------------------------------

export type SessionZone = "local" | "utc";

const ZONE_KEY = "reelhouse-f1-timezone";

function withZone(
  zone: SessionZone,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormatOptions {
  return zone === "utc" ? { ...options, timeZone: "UTC" } : options;
}

/** Full session stamp: "Sat 24 Oct, 14:00". */
export function formatSessionDateTime(iso: string, zone: SessionZone): string {
  return new Date(iso).toLocaleString(
    undefined,
    withZone(zone, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}

/** Clock only (chart axes + tooltips): "14:00". */
export function formatSessionClock(epochMs: number, zone: SessionZone): string {
  return new Date(epochMs)
    .toLocaleTimeString(undefined, withZone(zone, { hour: "numeric", minute: "2-digit" }))
    .toUpperCase();
}

/** Calendar-card stamp: "OCT 24". */
export function formatSessionDayMonth(iso: string, zone: SessionZone): string {
  return new Date(iso)
    .toLocaleDateString(undefined, withZone(zone, { month: "short", day: "numeric" }))
    .toUpperCase();
}

/** Meeting range: "24–26 Oct" in one month, else "24 Oct – 2 Nov". */
export function formatSessionDayRange(
  startIso: string,
  endIso: string,
  zone: SessionZone
): string {
  const a = new Date(startIso);
  const b = new Date(endIso);
  const monthOf = (d: Date) =>
    d.toLocaleDateString(undefined, withZone(zone, { month: "short" }));
  const dayOf = (d: Date) =>
    d.toLocaleDateString(undefined, withZone(zone, { day: "numeric" }));
  const full = (d: Date) =>
    d.toLocaleDateString(undefined, withZone(zone, { day: "numeric", month: "short" }));
  return monthOf(a) === monthOf(b)
    ? `${dayOf(a)}–${dayOf(b)} ${monthOf(a)}`
    : `${full(a)} – ${full(b)}`;
}

export interface SessionTimeApi {
  zone: SessionZone;
  setZone: (zone: SessionZone) => void;
  /** Full stamp: "Sat 24 Oct, 14:00". */
  dateTime: (iso: string) => string;
  /** Clock only from an epoch (chart axes, tooltips): "14:00". */
  clock: (epochMs: number) => string;
  /** Calendar-card stamp: "OCT 24". */
  dayMonth: (iso: string) => string;
  /** Meeting range: "24–26 Oct" / "24 Oct – 2 Nov". */
  dayRange: (startIso: string, endIso: string) => string;
}

/** Outside the provider every view still renders, just in the local zone. */
const LOCAL_FALLBACK: SessionTimeApi = {
  zone: "local",
  setZone: () => {},
  dateTime: (iso) => formatSessionDateTime(iso, "local"),
  clock: (epochMs) => formatSessionClock(epochMs, "local"),
  dayMonth: (iso) => formatSessionDayMonth(iso, "local"),
  dayRange: (a, b) => formatSessionDayRange(a, b, "local"),
};

const SessionTimeContext = createContext<SessionTimeApi | null>(null);

export function useSessionTime(): SessionTimeApi {
  return useContext(SessionTimeContext) ?? LOCAL_FALLBACK;
}

export function SessionTimeProvider({ children }: { children: ReactNode }) {
  // Start local (matches the server render), then adopt the stored choice.
  const [zone, setZoneState] = useState<SessionZone>("local");

  useEffect(() => {
    try {
      if (window.localStorage.getItem(ZONE_KEY) === "utc") setZoneState("utc");
    } catch {
      /* storage disabled — stay on local time */
    }
  }, []);

  const setZone = useCallback((next: SessionZone) => {
    setZoneState(next);
    try {
      window.localStorage.setItem(ZONE_KEY, next);
    } catch {
      /* storage disabled — the choice just won't persist */
    }
  }, []);

  const value = useMemo<SessionTimeApi>(
    () => ({
      zone,
      setZone,
      dateTime: (iso) => formatSessionDateTime(iso, zone),
      clock: (epochMs) => formatSessionClock(epochMs, zone),
      dayMonth: (iso) => formatSessionDayMonth(iso, zone),
      dayRange: (a, b) => formatSessionDayRange(a, b, zone),
    }),
    [zone, setZone]
  );

  return <SessionTimeContext.Provider value={value}>{children}</SessionTimeContext.Provider>;
}

const ZONES: { key: SessionZone; label: string; hint: string }[] = [
  { key: "local", label: "Your time", hint: "Session times in your device's timezone" },
  { key: "utc", label: "UTC", hint: "Session times in UTC" },
];

/** The local/UTC switch shown in the dashboard status row. */
export function TimeZoneToggle({ className = "" }: { className?: string }) {
  const { zone, setZone } = useSessionTime();
  return (
    <div
      role="group"
      aria-label="Timezone for session times"
      className={`inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/25 p-0.5 ${className}`}
    >
      <span className="px-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">
        Times
      </span>
      {ZONES.map((z) => (
        <button
          key={z.key}
          type="button"
          onClick={() => setZone(z.key)}
          aria-pressed={zone === z.key}
          title={z.hint}
          className={`rounded-[6px] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
            zone === z.key
              ? "bg-[#e10600] text-white shadow-[0_0_10px_rgb(225_6_0/0.35)]"
              : "text-white/45 hover:bg-white/[0.07] hover:text-white/80"
          }`}
        >
          {z.label}
        </button>
      ))}
    </div>
  );
}
