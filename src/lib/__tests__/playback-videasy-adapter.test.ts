import { describe, expect, it } from "vitest";
import {
  embedBridgeAdapter,
  getMessageAdapter,
  videasyAdapter,
} from "@/lib/playback/adapters";

// ---------------------------------------------------------------------------
// Videasy (vidy.st) message contract.
//
// Captured from the live player: it posts JSON TEXT (not an object) to the
// parent window. The two position spellings are both real, `progress` is a
// PERCENTAGE, and `season`/`episode` name what the provider's own player is
// actually showing — the fact that makes its Next Episode button visible to
// watch history. Recognition is by URL host, so moving the provider to another
// slot keeps working.
// ---------------------------------------------------------------------------

const message = (data: Record<string, unknown>) =>
  JSON.stringify({ type: "PLAYER_EVENT", data });

describe("videasyAdapter", () => {
  it("reads the timeupdate position and the episode actually playing", () => {
    expect(
      videasyAdapter(
        message({
          event: "timeupdate",
          currentTime: 3.650799,
          duration: 3444,
          id: "84773",
          mediaType: "tv",
          season: 3,
          episode: 4,
        })
      )
    ).toEqual({
      kind: "progress",
      seconds: 3.650799,
      duration: 3444,
      season: 3,
      episode: 4,
    });
  });

  it("accepts the timestamp/progress spelling without treating progress as seconds", () => {
    expect(
      videasyAdapter(
        message({
          event: "timeupdate",
          timestamp: 1234.5,
          duration: 3444.125,
          progress: 35.8,
          type: "tv",
          id: "84773",
          season: 3,
          episode: 4,
        })
      )
    ).toEqual({
      kind: "progress",
      seconds: 1234.5,
      duration: 3444.125,
      season: 3,
      episode: 4,
    });
  });

  it("treats play and pause as position reports", () => {
    expect(
      videasyAdapter(message({ event: "play", timestamp: 10, duration: 100 }))
    ).toEqual({ kind: "progress", seconds: 10, duration: 100 });
    expect(
      videasyAdapter(
        message({ event: "pause", timestamp: 42, duration: 100, season: 1, episode: 2 })
      )
    ).toEqual({
      kind: "progress",
      seconds: 42,
      duration: 100,
      season: 1,
      episode: 2,
    });
  });

  it("maps ended to completion", () => {
    expect(
      videasyAdapter(
        message({ event: "ended", timestamp: 3444, duration: 3444, progress: 100 })
      )
    ).toEqual({ kind: "ended" });
  });

  it("omits coordinates for a movie", () => {
    expect(
      videasyAdapter(
        message({
          event: "timeupdate",
          currentTime: 60,
          duration: 5400,
          mediaType: "movie",
          id: "550",
        })
      )
    ).toEqual({ kind: "progress", seconds: 60, duration: 5400 });
  });

  it("tolerates numeric-string coordinates", () => {
    expect(
      videasyAdapter(
        message({ event: "timeupdate", timestamp: 5, duration: 100, season: "3", episode: "4" })
      )
    ).toMatchObject({ season: 3, episode: 4 });
  });

  it("ignores everything that is not a usable PLAYER_EVENT", () => {
    expect(videasyAdapter(message({ event: "MEDIA_DATA" }))).toBeNull();
    expect(videasyAdapter(message({ event: "timeupdate", progress: 50, duration: 100 }))).toBeNull();
    expect(videasyAdapter(message({ event: "timeupdate", currentTime: 5 }))).toBeNull();
    expect(videasyAdapter(message({ event: "timeupdate", currentTime: -1, duration: 10 }))).toBeNull();
    expect(videasyAdapter(message({ event: "timeupdate", currentTime: 1, duration: 0 }))).toBeNull();
    expect(videasyAdapter(JSON.stringify({ type: "OTHER", data: {} }))).toBeNull();
    expect(videasyAdapter("{not json")).toBeNull();
    expect(videasyAdapter(42)).toBeNull();
    expect(videasyAdapter(null)).toBeNull();
  });
});

describe("getMessageAdapter → Videasy", () => {
  it("recognizes the provider by host, not by slot id", () => {
    expect(getMessageAdapter("provider-9", "https://vidy.st/tv/84773/3/4")).toBe(
      videasyAdapter
    );
    expect(
      getMessageAdapter("provider-1", "https://www.vidy.st/movie/550?progress=60")
    ).toBe(videasyAdapter);
    expect(getMessageAdapter("anything", "https://VIDY.ST/tv/1/1/1")).toBe(
      videasyAdapter
    );
  });

  it("keeps unverified hosts on the conservative bridge", () => {
    expect(getMessageAdapter("provider-2", "https://vidly.pro/tv/84773/3/4")).toBe(
      embedBridgeAdapter
    );
    expect(getMessageAdapter("provider-2")).toBe(embedBridgeAdapter);
  });
});
