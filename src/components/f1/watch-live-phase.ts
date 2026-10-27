// The Watch Live control's time window, kept pure so the boundary rules can be
// unit-tested without a browser clock.

/** The countdown ends this far ahead of the scheduled session start. */
export const WATCH_LEAD_MS = 15 * 60_000;

export type WatchLivePhase = "locked" | "live" | "ended";

/**
 * The button is live from `liveFromMs` (session start minus the early-access
 * lead) through the scheduled session end.
 */
export function watchLivePhase(
  now: number,
  liveFromMs: number,
  endMs: number
): WatchLivePhase {
  if (!Number.isFinite(now) || !Number.isFinite(liveFromMs)) return "locked";
  if (now < liveFromMs) return "locked";
  if (now <= endMs) return "live";
  return "ended";
}
