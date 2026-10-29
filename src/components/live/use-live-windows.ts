"use client";

import { useEffect, useState } from "react";
import type { LiveFeed } from "@/lib/live-windows";

// ---------------------------------------------------------------------------
// One shared live feed for every consumer in the tab (the navbar is on every
// page; the home hero adds two posters to it). A module-level store means the
// navbar and the hero share a single request and a single 60s poll, instead of
// each asking the server for the same schedule.
//
// `now` starts at 0 so server-rendered HTML never claims an event is live
// against a clock the client disagrees with; the first effect tick fills it in.
// ---------------------------------------------------------------------------

const EMPTY: LiveFeed = { f1: null, cricket: null };

let snapshot: LiveFeed = EMPTY;
let loaded = false;
let inFlight: Promise<void> | null = null;
let poller: ReturnType<typeof setInterval> | null = null;
let visibilityBound = false;
const listeners = new Set<(feed: LiveFeed) => void>();

async function read(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch("/api/live", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as Partial<LiveFeed>;
      snapshot = { f1: payload.f1 ?? null, cricket: payload.cricket ?? null };
      loaded = true;
      for (const listener of listeners) listener(snapshot);
    } catch {
      // Keep the last good reading; the next poll retries.
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function refreshWhenVisible(): void {
  if (typeof document === "undefined" || document.visibilityState === "visible") void read();
}

function bindVisibility(): void {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", refreshWhenVisible);
}

function unbindVisibility(): void {
  if (!visibilityBound || listeners.size > 0 || typeof document === "undefined") return;
  visibilityBound = false;
  document.removeEventListener("visibilitychange", refreshWhenVisible);
}

export function useLiveWindows(): { feed: LiveFeed; now: number } {
  const [feed, setFeed] = useState<LiveFeed>(loaded ? snapshot : EMPTY);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const listener = (next: LiveFeed) => setFeed(next);
    listeners.add(listener);
    if (loaded) setFeed(snapshot);
    else void read();

    if (poller == null) {
      poller = setInterval(() => {
        if (document.visibilityState === "visible") void read();
      }, 60_000);
    }
    bindVisibility();

    // Five seconds is enough to flip the badge/poster at the unlock boundary
    // without re-rendering the hero every second.
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 5000);

    return () => {
      listeners.delete(listener);
      clearInterval(tick);
      if (listeners.size === 0) {
        if (poller != null) clearInterval(poller);
        poller = null;
        unbindVisibility();
      }
    };
  }, []);

  return { feed, now };
}
