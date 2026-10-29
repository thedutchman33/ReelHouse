import { afterEach, describe, expect, it, vi } from "vitest";
import type { CricketMatch } from "../types";
import {
  MATCH_WATCH_GRACE_MS,
  markEnded,
  persistEndedAt,
  pickFeaturedMatch,
  readEndedAt,
  recentEndedMatch,
} from "../watch-window";

const NOW = Date.parse("2026-10-28T12:00:00Z");

function match(overrides: Partial<CricketMatch> & Pick<CricketMatch, "gid">): CricketMatch {
  const base: CricketMatch = {
    id: overrides.gid,
    gid: overrides.gid,
    gender: "women",
    format: "ODI",
    formatLabel: "Women's ODI",
    date: "2026-10-28T08:30:00Z",
    endDate: "2026-10-28",
    series: "Test series",
    title: "3rd ODI",
    matchNumber: "3rd ODI",
    venue: "Test ground",
    city: "Test city",
    status: "upcoming",
    statusLabel: "Fixture",
    result: null,
    teams: [],
    live: false,
  };
  return { ...base, ...overrides };
}

describe("cricket watch window", () => {
  const live = match({ gid: "live", status: "live", live: true, date: "2026-10-28T08:30:00Z" });
  const ended = match({
    gid: "ended",
    status: "completed",
    statusLabel: "Result",
    result: "India Women win by 12 runs",
    date: "2026-10-27T08:30:00Z",
  });
  const next = match({ gid: "next", status: "upcoming", date: "2026-10-31T08:30:00Z" });

  it("keeps a genuinely live match first regardless of schedule", () => {
    expect(pickFeaturedMatch([next, ended, live], { ended: NOW - 60_000 }, NOW)?.gid).toBe("live");
  });

  it("keeps a just-ended match for 30 minutes before switching to the next fixture", () => {
    expect(recentEndedMatch([next, ended], { ended: NOW - 60_000 }, NOW)?.gid).toBe("ended");
    expect(pickFeaturedMatch([next, ended], { ended: NOW - 60_000 }, NOW)?.gid).toBe("ended");
  });

  it("switches to the next fixture at the end of the grace period", () => {
    expect(
      pickFeaturedMatch([next, ended], { ended: NOW - MATCH_WATCH_GRACE_MS }, NOW)?.gid
    ).toBe("next");
  });

  it("does not hold a completed match that was never seen live", () => {
    expect(pickFeaturedMatch([next, ended], {}, NOW)?.gid).toBe("next");
  });

  it("falls back to the latest result when no future fixture exists", () => {
    expect(pickFeaturedMatch([ended], {}, NOW)?.gid).toBe("ended");
  });

  it("records an end time without mutating the previous map", () => {
    const before = { other: 1 };
    const after = markEnded(before, "ended", NOW);
    expect(before).toEqual({ other: 1 });
    expect(after).toEqual({ other: 1, ended: NOW });
  });

  it("persists and reloads only recent end times", () => {
    // Storage pruning runs against the wall clock, so pin it to NOW; otherwise
    // this fixture ages out of the 24-hour window and the test rots.
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    persistEndedAt({ ended: NOW - 1_000, stale: NOW - 2 * 24 * 60 * 60_000 }, storage);
    expect(readEndedAt(storage)).toEqual({ ended: NOW - 1_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
