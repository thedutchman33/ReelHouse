"use client";

import { logPlaybackEvent, saveProgress } from "@/lib/library";
import type { EpisodeRef, MediaSummary } from "@/lib/library";
import type { ProviderDescriptor } from "./types";

// ---------------------------------------------------------------------------
// Provider-independent playback progress.
//
// Whatever provider is on screen, progress lands in exactly ONE place: the
// existing library store (localStorage + Supabase when signed in). Providers
// never talk to Supabase, and switching providers mid-title cannot change,
// reset, or duplicate what is recorded — the record is keyed by media/episode,
// not by provider.
//
// The recorder is deliberately dependency-injected (`save`, `log`, `now`) so
// every rule below is unit-testable in Node without a browser, a provider, or a
// network (src/lib/__tests__/playback-progress.test.ts). The defaults are the
// real library functions, which are NOT modified by this milestone.
//
// Note: the built-in native/mock surface (the existing custom VideoPlayer)
// continues to persist progress itself, exactly as before — this recorder is for
// `embed` providers, whose player Reelhouse does not own.
// ---------------------------------------------------------------------------

/** Matches the existing custom player's cadence, so both surfaces feel alike. */
export const PROGRESS_SAVE_INTERVAL_MS = 5000;

export interface ProgressTarget {
  media: MediaSummary;
  episode?: EpisodeRef | null;
}

export interface ProgressReport {
  /** Position in seconds. */
  seconds: number;
  /** Total duration in seconds. */
  duration: number;
}

export interface ProgressRecorder {
  /** Throttled progress write. */
  report(report: ProgressReport): void;
  /** Unthrottled write of the last known position (pause / unmount / switch). */
  flush(): void;
  /** Final write for a finished item. */
  ended(): void;
  /** Change the target when the episode changes without a remount. */
  retarget(target: ProgressTarget): void;
  /** True when this recorder actually persists anything. */
  readonly enabled: boolean;
}

/**
 * Whether Reelhouse may record progress for a provider.
 *
 * Only when the provider documents progress events. Otherwise NOTHING is
 * written — a provider whose position cannot be observed must not produce
 * invented progress data.
 */
export function shouldRecordProgress(provider: ProviderDescriptor): boolean {
  return provider.capabilities.canReportProgress;
}

function isUsable(report: ProgressReport): boolean {
  const { seconds, duration } = report;
  return (
    Number.isFinite(seconds) &&
    Number.isFinite(duration) &&
    duration > 0 &&
    seconds >= 0
  );
}

/**
 * A throttled, provider-independent progress writer.
 *
 * `enabled: false` returns a recorder whose methods are all no-ops, which is how
 * a provider without documented progress events is handled — the container can
 * call the same API unconditionally.
 */
export function createProgressRecorder(options: {
  target: ProgressTarget;
  enabled: boolean;
  saveIntervalMs?: number;
  save?: typeof saveProgress;
  log?: typeof logPlaybackEvent;
  now?: () => number;
}): ProgressRecorder {
  const {
    enabled,
    saveIntervalMs = PROGRESS_SAVE_INTERVAL_MS,
    save = saveProgress,
    log = logPlaybackEvent,
    now = () => Date.now(),
  } = options;

  let target = options.target;
  let last: ProgressReport | null = null;
  let lastSavedAt = 0;
  let endedSent = false;

  function write(report: ProgressReport): void {
    save({
      media: target.media,
      episode: target.episode ?? null,
      position: Math.min(report.seconds, report.duration),
      duration: report.duration,
    });
    lastSavedAt = now();
  }

  return {
    enabled,

    report(report) {
      if (!enabled || !isUsable(report)) return;
      last = report;
      if (now() - lastSavedAt < saveIntervalMs) return;
      write(report);
    },

    flush() {
      if (!enabled || !last) return;
      write(last);
    },

    ended() {
      if (!enabled || endedSent) return;
      endedSent = true;
      // Record the completed position so "continue watching" clears the item.
      // `last` is advanced to completion as well, so a later flush/retarget (the
      // autoplay hand-off to the next episode does both) cannot write the
      // pre-credits position back over it and resurrect a finished item.
      if (last) {
        last = { seconds: last.duration, duration: last.duration };
        write(last);
      }
      log({
        media: target.media,
        episode: target.episode ?? null,
        eventType: "ended",
        position: last?.duration ?? 0,
      });
    },

    retarget(next) {
      // A new episode is a new record: flush the old one first, then reset the
      // per-item state so the next write cannot be attributed to the old key.
      if (enabled && last) write(last);
      target = next;
      last = null;
      lastSavedAt = 0;
      endedSent = false;
    },
  };
}
