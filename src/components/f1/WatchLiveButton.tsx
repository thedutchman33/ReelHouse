"use client";

import { countdownTo } from "@/components/f1/Countdown";

// The Watch Live gate: F1 sessions unlock 30 minutes before lights out and
// stay live until the session's official end. Everything before that is a
// disabled button counting down to the unlock; during the session it reads
// LIVE NOW. Links out to F1 TV (the official stream) — ReelHouse does not
// carry F1 video itself.
const F1TV_URL = "https://f1tv.formula1.com/";
const UNLOCK_WINDOW_MS = 30 * 60 * 1000;

export default function WatchLiveButton({
  sessionStart,
  sessionEnd,
  now,
}: {
  sessionStart: string;
  sessionEnd: string | null;
  now: number;
}) {
  const startMs = new Date(sessionStart).getTime();
  const endMs = sessionEnd ? new Date(sessionEnd).getTime() : startMs + 2 * 3600_000;
  const unlockAt = startMs - UNLOCK_WINDOW_MS;
  const active = now >= unlockAt && now <= endMs;
  const live = now >= startMs && now <= endMs;

  if (active) {
    return (
      <a
        href={F1TV_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex h-12 items-center gap-2.5 rounded-xl bg-[#e10600] px-7 text-sm font-black uppercase tracking-[0.14em] text-white shadow-[0_8px_30px_rgba(225,6,0,0.35)] transition hover:bg-[#ff1a13] hover:shadow-[0_8px_40px_rgba(225,6,0,0.55)]"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
        {live ? "Watch Live" : "Live Soon — Join Coverage"}
      </a>
    );
  }

  // Locked: count down to the unlock when it's within a day, otherwise show
  // the static reminder. After the session ended, the gate is simply closed.
  const cd = countdownTo(new Date(unlockAt).toISOString(), now);
  const unlockIn =
    now < unlockAt && now > startMs - 24 * 3600_000 && !cd.past
      ? `Unlocks in ${String(cd.hours + cd.days * 24).padStart(2, "0")}:${String(cd.mins).padStart(2, "0")}:${String(cd.secs).padStart(2, "0")}`
      : "Unlocks 30 min before lights out";

  const ended = now > endMs;
  return (
    <span
      aria-disabled="true"
      title="Live coverage opens 30 minutes before the session starts"
      className="inline-flex h-12 cursor-not-allowed items-center gap-2.5 rounded-xl border border-[#e10600]/40 px-7 text-sm font-bold uppercase tracking-[0.14em] text-[#e10600]/70"
    >
      {ended ? "Session Ended" : unlockIn}
    </span>
  );
}
