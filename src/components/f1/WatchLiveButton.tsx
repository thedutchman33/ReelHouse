"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  WATCH_LEAD_MS,
  watchLivePhase,
  type WatchLivePhase as Phase,
} from "@/components/f1/watch-live-phase";

// The hero's broadcast control. Both faces sit in the same grid cell, so the
// switch from the countdown to the live CTA never shifts the hero card.
//
//   locked → padlock, D/H/M/S chips counting down to 15 minutes before the start
//   live   → red plate, LIVE NOW · <session>, WATCH LIVE, opens `watchHref`
//   ended  → muted "session ended" plate (only when nothing else is scheduled)
//
// The countdown ends 15 minutes before the scheduled session so the watch page
// opens early; the button is live from then through the session's end.
//
// Playback stays on ReelHouse: the watch page lists that channel's configured
// servers in the same layout used for movies and TV. F1 is the default href;
// cricket passes /watch/cricket.

/** A burst only plays for a transition we watched, never on first paint. */
const BURST_GRACE_MS = 2000;

const pad = (value: number) => String(value).padStart(2, "0");

interface Parts {
  days: number;
  hours: number;
  mins: number;
  secs: number;
}

function split(ms: number): Parts {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    mins: Math.floor((total % 3600) / 60),
    secs: total % 60,
  };
}

/** Coarse, stable label for screen readers — never the per-second digits. */
function coarse({ days, hours, mins }: Parts): string {
  if (!days && !hours && !mins) return "less than a minute";
  const bits: string[] = [];
  if (days) bits.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) bits.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (mins) bits.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  return bits.join(", ");
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[26px] w-[26px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.4" />
      <path d="M8.2 10.5V7.6a3.8 3.8 0 0 1 7.6 0v2.9" />
      <circle cx="12" cy="15.2" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[26px] w-[26px] translate-x-[1px]" aria-hidden="true">
      <path d="M8 5.2v13.6a.9.9 0 0 0 1.37.76l10.2-6.8a.9.9 0 0 0 0-1.52L9.37 4.44A.9.9 0 0 0 8 5.2Z" fill="currentColor" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" />
    </svg>
  );
}

function Chip({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="flex items-baseline gap-1 rounded-lg bg-white/[0.05] px-1 py-[6px] ring-1 ring-inset ring-white/[0.06] max-[440px]:px-1.5">
      <span className="font-f1 text-[22px] font-bold leading-none tabular-nums text-white max-[440px]:text-[18px]">
        {pad(value)}
      </span>
      <span className="text-[12px] font-semibold leading-none text-[#ff5a50]">{unit}</span>
    </span>
  );
}

export default function WatchLiveButton({
  now,
  targetISO,
  endISO = null,
  sessionName = null,
  demoSeconds,
  isLive = false,
  watchHref = "/watch/f1",
}: {
  /** Shared page clock, so every countdown ticks on the same instant. */
  now: number;
  /** Session start, ISO/UTC. */
  targetISO: string | null;
  /** Session end; when absent the live window assumes three hours. */
  endISO?: string | null;
  sessionName?: string | null;
  /** A genuinely live source overrides the scheduled three-hour window. */
  isLive?: boolean;
  /** Debug helper: pretend the session starts this many seconds out. The live
      state still begins 15 minutes before that, so values under 900 start live. */
  demoSeconds?: number;
  /** Watch page opened by the live face. Defaults to the F1 channel page. */
  watchHref?: string;
}) {
  const router = useRouter();
  const [burst, setBurst] = useState(false);
  /** Fixed once, not recomputed each tick — a demo target must actually count down. */
  const demoTarget = useRef<number | null>(null);
  /** False for the first frame, so hydrating straight into a live session
      swaps faces instantly instead of animating the placeholder away. */
  const [ready, setReady] = useState(false);
  const mountedAt = useRef(0);

  // The page's shared clock drives this countdown too, so it can never tick a
  // second ahead of the Practice 1 countdown beside it. This effect only handles
  // the first-paint transition and the optional demo target.
  useEffect(() => {
    mountedAt.current = Date.now();
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (demoSeconds != null) demoTarget.current = Date.now() + demoSeconds * 1000;
  }, [demoSeconds]);

  const startMs = targetISO ? Date.parse(targetISO) : NaN;
  const target = demoSeconds != null ? (demoTarget.current ?? NaN) : startMs;
  const endRaw = endISO ? Date.parse(endISO) : target + 3 * 3600_000;
  const endMs =
    demoSeconds != null
      ? Number.POSITIVE_INFINITY
      : Number.isFinite(endRaw)
        ? endRaw
        : target + 3 * 3600_000;

  const known = Number.isFinite(target);
  // The whole control runs 15 minutes ahead of the scheduled start: the
  // countdown ends there and the live CTA takes over.
  const liveFrom = target - WATCH_LEAD_MS;
  const phase: Phase = isLive ? "live" : known ? watchLivePhase(now, liveFrom, endMs) : "locked";
  const live = isLive || phase === "live";
  const ended = !isLive && phase === "ended";

  // Warm the channel's watch page while the button is live, so the click is a
  // client navigation rather than a cold server round trip.
  useEffect(() => {
    if (live) router.prefetch(watchHref);
  }, [live, router, watchHref]);

  // Burst only when this component saw the countdown hit zero — a page opened
  // after the unlock renders the live face straight away.
  const previous = useRef<Phase | null>(null);
  useEffect(() => {
    const was = previous.current;
    previous.current = phase;
    if (was !== "locked" || phase !== "live") return;
    if (Date.now() - mountedAt.current < BURST_GRACE_MS) return;
    setBurst(true);
    const id = window.setTimeout(() => setBurst(false), 700);
    return () => window.clearTimeout(id);
  }, [phase]);

  const parts = split(known && !live ? liveFrom - now : 0);
  const chips = [
    { key: "d", value: parts.days, unit: "D" },
    { key: "h", value: parts.hours, unit: "H" },
    { key: "m", value: parts.mins, unit: "M" },
    { key: "s", value: parts.secs, unit: "S" },
  ].filter((chip) => chip.key !== "d" || chip.value > 0);

  const what = sessionName ? `${sessionName}: ` : "";
  const label = isLive
    ? `${what}Watch live now — opens the ReelHouse watch page`
    : !known
      ? `${what}Watch live`
      : live
        ? `${what}Watch live now — opens the ReelHouse watch page`
        : ended
          ? `${what}Session ended`
          : `${what}Watch live in ${coarse(parts)}`;

  const open = () => {
    if (!live) return;
    router.push(watchHref);
  };

  const faceBase = `[grid-area:1/1] flex items-center gap-3 sm:gap-4 ${
    ready ? "transition-[opacity,transform] duration-[450ms] ease-out" : "transition-none"
  }`;

  return (
    <button
      type="button"
      aria-live="polite"
      aria-disabled={!live}
      aria-label={label}
      title={live ? "Live now — watch on ReelHouse" : ended ? "This session has finished" : "Unlocks 15 minutes before the session starts"}
      onClick={open}
      className={`f1-watch group relative grid min-h-[116px] w-full max-w-[360px] grid-cols-1 items-center overflow-hidden rounded-[20px] py-[14px] pl-4 pr-5 text-left transition-[transform,box-shadow,background] duration-[450ms] ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white sm:w-[360px] ${
        live
          ? "f1-watch-live cursor-pointer border border-white/[0.28] bg-[linear-gradient(120deg,#ff3a2d,#e10600_55%,#9c0000)] shadow-[0_12px_44px_-10px_rgba(225,6,0,0.75)] hover:-translate-y-0.5 active:scale-[0.985]"
          : "cursor-not-allowed border border-white/10 bg-[linear-gradient(180deg,#1b1b23,#121217)] shadow-[0_8px_30px_-14px_rgba(225,6,0,0.45)]"
      } ${burst ? "f1-watch-burst" : ""}`}
    >
      {!live && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[16%] top-0 h-[2px] bg-[linear-gradient(90deg,transparent,#e10600,transparent)] opacity-80"
        />
      )}

      {live && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <span className="f1-watch-sheen absolute -left-1/3 inset-y-0 w-1/3 bg-white/[0.28] skew-x-[-18deg]" />
        </span>
      )}

      {/* Locked face — padlock, LIVE IN, and one chip per unit. Below 440px
          the chips drop to their own full-width row: four segments plus the
          padlock don't fit across a phone, and clipping the seconds is worse
          than a slightly taller card. */}
      <span
        aria-hidden={live}
        className={`[grid-area:1/1] grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-3 gap-y-[7px] sm:gap-x-4 ${
          ready ? "transition-[opacity,transform] duration-[450ms] ease-out" : "transition-none"
        } ${live ? "pointer-events-none -translate-y-[10px] opacity-0" : "translate-y-0 opacity-100"}`}
      >
        <span className="col-start-1 row-span-2 row-start-1 grid h-14 w-14 place-items-center rounded-[16px] bg-[#e10600]/[0.12] text-[#ff5a50] ring-1 ring-inset ring-[#e10600]/35 max-[440px]:row-span-1">
          <LockIcon />
        </span>
        <span className="col-start-2 row-start-1 text-[12px] font-semibold uppercase leading-none tracking-[0.2em] text-[#8d8d9b]">
          {ended ? "Session ended" : "Live in"}
        </span>
        {ended ? (
          <span className="col-start-2 row-start-2 font-f1 text-[15px] font-bold uppercase leading-none tracking-[0.06em] text-white/60">
            Nothing scheduled
          </span>
        ) : (
          <span aria-hidden="true" className="col-start-2 row-start-2 flex gap-[5px] max-[440px]:col-span-2 max-[440px]:col-start-1 max-[440px]:gap-1">
            {now == null || !Number.isFinite(target) ? (
              <Chip value={0} unit="H" />
            ) : (
              chips.map((chip) => <Chip key={chip.key} value={chip.value} unit={chip.unit} />)
            )}
          </span>
        )}
      </span>

      {/* Live face — white play tile, blinking LIVE NOW, red plate. */}
      <span
        aria-hidden={!live}
        className={`${faceBase} relative pr-12 ${live ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[10px] opacity-0"}`}
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[16px] bg-white text-[#e10600]">
          <PlayIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase leading-none tracking-[0.14em] text-white/90 max-[440px]:text-[10px] max-[440px]:tracking-[0.08em]">
            <span aria-hidden="true" className="f1-watch-dot h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
            <span className="truncate">
              Live now
              {sessionName ? <span className="max-[420px]:hidden">{` · ${sessionName}`}</span> : null}
            </span>
          </span>
          <span className="mt-1 block whitespace-nowrap font-f1 text-[26px] font-bold italic uppercase leading-none tracking-[0.04em] text-white max-[440px]:text-[20px] max-[390px]:text-[18px]">
            Watch Live
          </span>
        </span>
        <span
          aria-hidden="true"
          className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white transition-transform duration-200 group-hover:translate-x-1"
        >
          <ArrowIcon />
        </span>
      </span>
    </button>
  );
}
