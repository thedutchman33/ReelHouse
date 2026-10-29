"use client";

import { useEffect, useState } from "react";
import { countdownTo } from "@/lib/cricket/shared";

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function CountdownCells({ target, now }: { target: string | null; now: number }) {
  const cd = countdownTo(target, now);
  const cells: [string, string][] = [
    [pad(cd.days), "Days"],
    [pad(cd.hours), "Hours"],
    [pad(cd.mins), "Mins"],
    [pad(cd.secs), "Secs"],
  ];
  const spoken = cd.past
    ? "Scheduled start time has passed"
    : `Starts in ${cd.days} ${cd.days === 1 ? "day" : "days"}, ${cd.hours} hours and ${cd.mins} minutes`;

  return (
    <div role="timer" aria-live="off" aria-label={spoken} className="grid grid-cols-4 gap-2 sm:gap-3">
      {cells.map(([value, label], index) => (
        <div key={label} className="nm-inset rounded-xl bg-black/30 px-2 py-3 text-center sm:py-4">
          <div
            className={`font-f1 text-3xl font-bold leading-none tabular-nums sm:text-[44px] ${
              index === 3 ? "text-[#8fb4ec]" : "text-white"
            }`}
          >
            {value}
          </div>
          <div className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{label}</div>
        </div>
      ))}
    </div>
  );
}

export function MiniCountdown({ target, now }: { target: string; now: number }) {
  const cd = countdownTo(target, now);
  if (cd.past) return <span className="text-white/35">—</span>;
  const parts =
    cd.days > 0
      ? [`${cd.days}d`, `${pad(cd.hours)}h`, `${pad(cd.mins)}m`]
      : [`${pad(cd.hours)}h`, `${pad(cd.mins)}m`];
  // Seconds only fit the calendar card once the match is under a day away.
  const seconds = cd.days === 0 ? `:${pad(cd.secs)}s` : "";
  return (
    <span role="timer" aria-live="off" className="whitespace-nowrap tabular-nums text-white/55">
      {parts.join(":")}
      {seconds}
    </span>
  );
}
