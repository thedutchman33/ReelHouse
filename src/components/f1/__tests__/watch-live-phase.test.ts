import { describe, expect, it } from "vitest";
import {
  WATCH_LEAD_MS,
  watchLivePhase,
} from "@/components/f1/watch-live-phase";

// ---------------------------------------------------------------------------
// Watch Live window guard. The CTA must switch on 15 minutes before lights
// out and stay live through the scheduled end. These boundaries are easy to
// get off by one.
// ---------------------------------------------------------------------------

const START = Date.parse("2026-10-27T18:00:00Z");
const END = START + 2 * 60 * 60_000;
const LIVE_FROM = START - WATCH_LEAD_MS;

describe("watchLivePhase", () => {
  it("stays locked until 15 minutes before the session", () => {
    expect(watchLivePhase(LIVE_FROM - 1, LIVE_FROM, END)).toBe("locked");
    expect(watchLivePhase(LIVE_FROM, LIVE_FROM, END)).toBe("live");
  });

  it("is live through the scheduled start", () => {
    expect(watchLivePhase(START - 1, LIVE_FROM, END)).toBe("live");
    expect(watchLivePhase(START, LIVE_FROM, END)).toBe("live");
  });

  it("is live through the scheduled end", () => {
    expect(watchLivePhase(END, LIVE_FROM, END)).toBe("live");
    expect(watchLivePhase(END + 1, LIVE_FROM, END)).toBe("ended");
  });

  it("stays locked when the session time is missing", () => {
    expect(watchLivePhase(START, Number.NaN, END)).toBe("locked");
    expect(watchLivePhase(Number.NaN, LIVE_FROM, END)).toBe("locked");
  });
});
