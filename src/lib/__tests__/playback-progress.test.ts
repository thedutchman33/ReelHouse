import { describe, expect, it, vi } from "vitest";
import {
  createProgressRecorder,
  PROGRESS_SAVE_INTERVAL_MS,
  shouldRecordProgress,
} from "@/lib/playback/progress";
import type { ProviderCapabilities, ProviderDescriptor } from "@/lib/playback/types";
import type { MediaSummary } from "@/types";

// ---------------------------------------------------------------------------
// Provider-independent progress.
//
// The recorder takes its sinks and clock by injection, so these tests prove the
// rules — capability gating, throttling, clamping, one-shot completion, and
// re-targeting on an episode change — without a browser, a provider, or Supabase.
// The real sinks are the existing library functions, which this milestone does
// not modify: progress is keyed by media/episode, never by provider, which is
// what makes it survive a provider switch.
// ---------------------------------------------------------------------------

const MEDIA: MediaSummary = {
  id: "tv-1399",
  tmdbId: 1399,
  type: "tv",
  title: "Example Series",
  genres: ["Drama"],
};

const EPISODE = { seasonNumber: 2, episodeNumber: 5, title: "Fifth" };

function setup({
  enabled = true,
  episode = EPISODE as typeof EPISODE | null,
} = {}) {
  const save = vi.fn();
  const log = vi.fn();
  let clock = 100_000;
  const recorder = createProgressRecorder({
    target: { media: MEDIA, episode },
    enabled,
    save,
    log,
    now: () => clock,
  });
  return {
    recorder,
    save,
    log,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("shouldRecordProgress", () => {
  const provider = (caps: Partial<ProviderCapabilities>): ProviderDescriptor => ({
    id: "p",
    displayName: "P",
    priority: 1,
    surface: "embed",
    capabilities: {
      canReportProgress: false,
      canReportFailure: false,
      supportedMediaTypes: ["movie"],
      ...caps,
    },
    available: true,
    isBuiltIn: false,
  });

  it("records only for a provider that documents progress events", () => {
    expect(shouldRecordProgress(provider({ canReportProgress: true }))).toBe(true);
    expect(shouldRecordProgress(provider({}))).toBe(false);
  });
});

describe("createProgressRecorder", () => {
  it("writes nothing at all when disabled", () => {
    const { recorder, save, log, advance } = setup({ enabled: false });
    recorder.report({ seconds: 30, duration: 100 });
    advance(60_000);
    recorder.report({ seconds: 90, duration: 100 });
    recorder.flush();
    recorder.ended();
    expect(recorder.enabled).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("saves the first report immediately, keyed by media and episode", () => {
    const { recorder, save } = setup();
    recorder.report({ seconds: 30, duration: 100 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      media: MEDIA,
      episode: EPISODE,
      position: 30,
      duration: 100,
    });
  });

  it("throttles to the player's save interval", () => {
    const { recorder, save, advance } = setup();
    recorder.report({ seconds: 10, duration: 100 });
    advance(PROGRESS_SAVE_INTERVAL_MS - 1);
    recorder.report({ seconds: 11, duration: 100 });
    expect(save).toHaveBeenCalledTimes(1);
    advance(1);
    recorder.report({ seconds: 12, duration: 100 });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 12 })
    );
  });

  it("flushes the last known position regardless of the throttle", () => {
    const { recorder, save, advance } = setup();
    recorder.report({ seconds: 10, duration: 100 });
    advance(200);
    recorder.report({ seconds: 12, duration: 100 }); // throttled
    recorder.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 12 })
    );
  });

  it("has nothing to flush before the first usable report", () => {
    const { recorder, save } = setup();
    recorder.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("ignores unusable reports instead of inventing progress", () => {
    const { recorder, save } = setup();
    recorder.report({ seconds: 5, duration: 0 });
    recorder.report({ seconds: 5, duration: Number.NaN });
    recorder.report({ seconds: Number.POSITIVE_INFINITY, duration: 100 });
    recorder.report({ seconds: -1, duration: 100 });
    recorder.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("clamps a position that overshoots the duration", () => {
    const { recorder, save } = setup();
    recorder.report({ seconds: 140, duration: 100 });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ position: 100, duration: 100 })
    );
  });

  it("records completion once and logs a single ended event", () => {
    const { recorder, save, log } = setup();
    recorder.report({ seconds: 90, duration: 100 });
    recorder.ended();
    recorder.ended();
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 100, duration: 100 })
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({
      media: MEDIA,
      episode: EPISODE,
      eventType: "ended",
      position: 100,
    });
  });

  it("does not let a later flush regress a completed position", () => {
    const { recorder, save } = setup();
    recorder.report({ seconds: 99, duration: 100 });
    recorder.ended();
    recorder.flush();
    // Every write after completion stays at the completed position, so autoplay's
    // flush-then-advance cannot resurrect a finished episode.
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 100 })
    );
  });

  it("flushes the old episode and starts a clean record on retarget", () => {
    const { recorder, save, advance } = setup();
    recorder.report({ seconds: 10, duration: 100 });
    advance(500);
    recorder.report({ seconds: 20, duration: 100 }); // throttled

    const next = { seasonNumber: 2, episodeNumber: 6, title: "Sixth" };
    recorder.retarget({ media: MEDIA, episode: next });

    // The old episode's last position was written before the switch...
    expect(save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ episode: EPISODE, position: 20 })
    );
    // ...and the next write lands on the new episode, un-throttled.
    recorder.report({ seconds: 3, duration: 100 });
    expect(save).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ episode: next, position: 3 })
    );
  });

  it("does not carry a completed episode's ended state to the next one", () => {
    const { recorder, log } = setup();
    recorder.report({ seconds: 99, duration: 100 });
    recorder.ended();
    recorder.retarget({
      media: MEDIA,
      episode: { seasonNumber: 2, episodeNumber: 6, title: "Sixth" },
    });
    recorder.report({ seconds: 99, duration: 100 });
    recorder.ended();
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("supports a movie target with no episode", () => {
    const { recorder, save } = setup({ episode: null });
    recorder.report({ seconds: 42, duration: 100 });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ episode: null, position: 42 })
    );
  });
});
