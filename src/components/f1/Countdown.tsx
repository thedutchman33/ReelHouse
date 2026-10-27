"use client";

import { useEffect, useState } from "react";

// Ticking clock shared by every countdown on the page — one interval, passed
// down as a prop, so nothing drifts against anything else.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export interface CountdownParts {
  days: number;
  hours: number;
  mins: number;
  secs: number;
  past: boolean;
}

export function countdownTo(targetUtc: string | null, now: number): CountdownParts {
  if (!targetUtc) return { days: 0, hours: 0, mins: 0, secs: 0, past: true };
  const diff = new Date(targetUtc).getTime() - now;
  if (diff <= 0) return { days: 0, hours: 0, mins: 0, secs: 0, past: true };
  const total = Math.floor(diff / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    mins: Math.floor((total % 3600) / 60),
    secs: total % 60,
    past: false,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The Grid's "Lights Out In" cells, rebuilt in ReelHouse's neumorphic style. */
export function CountdownCells({ target, now }: { target: string | null; now: number }) {
  const cd = countdownTo(target, now);
  const cells: [string, string][] = [
    [pad(cd.days), "Days"],
    [pad(cd.hours), "Hours"],
    [pad(cd.mins), "Mins"],
    [pad(cd.secs), "Secs"],
  ];
  // A timer that re-announces every second is hostile to screen readers: the
  // digits stay silent (aria-live off) and the container carries a coarse,
  // readable label instead.
  const spoken = cd.past
    ? "Session started"
    : `Starts in ${cd.days} ${cd.days === 1 ? "day" : "days"}, ${cd.hours} hours and ${cd.mins} minutes`;
  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={spoken}
      className="grid grid-cols-4 gap-2 sm:gap-3"
    >
      {cells.map(([value, label], i) => (
        <div key={label} className="nm-inset rounded-xl px-2 py-3 text-center sm:py-4">
          {/* Seconds cell ticks in F1 red — the one living digit on the card. */}
          <div
            className={`font-f1 font-bold text-3xl leading-none tabular-nums sm:text-[44px] ${
              i === 3 ? "text-[#e10600]" : "text-white"
            }`}
          >
            {value}
          </div>
          <div className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact Dd:HHh:MMm:SSs line for per-session rows — live to the second. */
export function MiniCountdown({ target, now }: { target: string; now: number }) {
  const cd = countdownTo(target, now);
  if (cd.past) return <span className="text-muted-foreground/60">—</span>;
  const parts =
    cd.days > 0
      ? [`${cd.days}d`, `${pad(cd.hours)}h`, `${pad(cd.mins)}m`]
      : [`${pad(cd.hours)}h`, `${pad(cd.mins)}m`];
  return (
    <span
      role="timer"
      aria-live="off"
      className="whitespace-nowrap tabular-nums text-muted-foreground"
    >
      {parts.join(":")}:{pad(cd.secs)}s
    </span>
  );
}
