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
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3" aria-label="Countdown">
      {cells.map(([value, label], i) => (
        <div key={label} className="nm-inset rounded-xl px-2 py-3 text-center sm:py-4">
          {/* Seconds cell ticks in emerald — the one living digit on the card. */}
          <div
            className={`font-display text-3xl leading-none tabular-nums sm:text-5xl ${
              i === 3 ? "text-accent" : "text-foreground"
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

/** Compact HH:MM:SS line for per-session rows. */
export function MiniCountdown({ target, now }: { target: string; now: number }) {
  const cd = countdownTo(target, now);
  if (cd.past) return <span className="text-muted-foreground/60">—</span>;
  const parts = cd.days > 0 ? [`${cd.days}d`, `${pad(cd.hours)}h`] : [pad(cd.hours), pad(cd.mins)];
  return (
    <span className="tabular-nums text-muted-foreground">
      {parts.join(":")}
      {cd.days === 0 ? `:${pad(cd.secs)}` : ""}
    </span>
  );
}
