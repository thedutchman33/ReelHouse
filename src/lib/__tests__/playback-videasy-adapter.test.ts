import { describe, expect, it } from "vitest";
import {
  embedBridgeAdapter,
  episodeMessageAdapter,
  getMessageAdapter,
  mediaDataAdapter,
  playerContractAdapter,
  playerEventAdapter,
  vidriftAdapter,
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

describe("playerEventAdapter", () => {
  it("reads the timeupdate position and the episode actually playing", () => {
    expect(
      playerEventAdapter(
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
      playerEventAdapter(
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
      playerEventAdapter(message({ event: "play", timestamp: 10, duration: 100 }))
    ).toEqual({ kind: "progress", seconds: 10, duration: 100 });
    expect(
      playerEventAdapter(
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
      playerEventAdapter(
        message({ event: "ended", timestamp: 3444, duration: 3444, progress: 100 })
      )
    ).toEqual({ kind: "ended" });
  });

  it("omits coordinates for a movie", () => {
    expect(
      playerEventAdapter(
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
      playerEventAdapter(
        message({ event: "timeupdate", timestamp: 5, duration: 100, season: "3", episode: "4" })
      )
    ).toMatchObject({ season: 3, episode: 4 });
  });

  it("ignores everything that is not a usable PLAYER_EVENT", () => {
    expect(playerEventAdapter(message({ event: "MEDIA_DATA" }))).toBeNull();
    expect(playerEventAdapter(message({ event: "timeupdate", progress: 50, duration: 100 }))).toBeNull();
    expect(playerEventAdapter(message({ event: "timeupdate", currentTime: 5 }))).toBeNull();
    expect(playerEventAdapter(message({ event: "timeupdate", currentTime: -1, duration: 10 }))).toBeNull();
    expect(playerEventAdapter(message({ event: "timeupdate", currentTime: 1, duration: 0 }))).toBeNull();
    expect(playerEventAdapter(JSON.stringify({ type: "OTHER", data: {} }))).toBeNull();
    expect(playerEventAdapter("{not json")).toBeNull();
    expect(playerEventAdapter(42)).toBeNull();
    expect(playerEventAdapter(null)).toBeNull();
  });
});

describe("mediaDataAdapter", () => {
  const mediaData = (at: number, season = 1, episode = 2) => ({
    type: "MEDIA_DATA",
    data: JSON.stringify({
      "tv-84773": {
        last_season_watched: season,
        last_episode_watched: episode,
        last_updated: at,
        show_progress: {
          [`s${season}e${episode}`]: {
            season,
            episode,
            progress: { watched: 120, duration: 600 },
            last_updated: at,
          },
        },
      },
    }),
  });
  const context = { mediaIds: [84773], mediaType: "tv" as const };

  it("reads the episode and position from a fresh record", () => {
    expect(mediaDataAdapter(mediaData(Date.now()), context)).toEqual({
      kind: "progress",
      seconds: 120,
      duration: 600,
      season: 1,
      episode: 2,
    });
  });

  it("ignores a record that predates the frame that reported it", () => {
    // Recent enough by the wall clock, but it describes what was watched
    // before this frame mounted — history, not current playback.
    const mountedAt = Date.now();
    expect(
      mediaDataAdapter(mediaData(mountedAt - 60_000), { ...context, mountedAt })
    ).toBeNull();
  });

  it("ignores a record that is no longer recent", () => {
    expect(mediaDataAdapter(mediaData(Date.now() - 10 * 60_000), context)).toBeNull();
  });

});

describe("episodeMessageAdapter", () => {
  it("reads a bare positive season/episode pair, directly or under data", () => {
    expect(episodeMessageAdapter({ season: 2, episode: 3 })).toEqual({
      kind: "episode",
      season: 2,
      episode: 3,
    });
    expect(
      episodeMessageAdapter({ data: { season: "2", episode: "3" } })
    ).toEqual({ kind: "episode", season: 2, episode: 3 });
  });

  it("leaves the stricter contracts to their own adapters", () => {
    expect(episodeMessageAdapter({ type: "PLAYER_EVENT", season: 1, episode: 2 })).toBeNull();
    expect(episodeMessageAdapter({ type: "MEDIA_DATA", season: 1, episode: 2 })).toBeNull();
    expect(episodeMessageAdapter({ season: 0, episode: 2 })).toBeNull();
    expect(episodeMessageAdapter({ season: 1 })).toBeNull();
  });
});

describe("getMessageAdapter → documented player contracts", () => {
  it("recognizes the provider by host, not by slot id", () => {
    // The same PLAYER_EVENT contract is published by VidLink and VidNest, and
    // the host may also produce MEDIA_DATA or a bare episode report, so those
    // hosts share the composed contract adapter.
    for (const host of ["vidy.st", "www.vidy.st", "vidlink.pro", "vidnest.fun"]) {
      expect(
        getMessageAdapter("provider-2", `https://${host}/tv/84773/3/4`)
      ).toBe(playerContractAdapter);
    }
    expect(
      getMessageAdapter("provider-1", "https://www.vidy.st/movie/550?progress=60")
    ).toBe(playerContractAdapter);
    expect(getMessageAdapter("anything", "https://VIDY.ST/tv/1/1/1")).toBe(
      playerContractAdapter
    );
  });

  it("reads the player_info/player_progress spelling of the same contract", () => {
    expect(
      playerEventAdapter({
        type: "PLAYER_EVENT",
        data: {
          player_info: { imdb: null, tmdb: "1100", mediaType: "tv", season: 1, episode: 5 },
          player_status: "playing",
          player_progress: 125.4,
          player_duration: 1330,
        },
      })
    ).toEqual({
      kind: "progress",
      seconds: 125.4,
      duration: 1330,
      season: 1,
      episode: 5,
    });

    expect(
      playerEventAdapter({
        type: "PLAYER_EVENT",
        data: { player_status: "completed", player_info: { season: 1, episode: 5 } },
      })
    ).toEqual({ kind: "ended" });
  });

  it("reads VidLink/VidNest coordinates sent as an object", () => {
    expect(
      playerEventAdapter({
        type: "PLAYER_EVENT",
        data: {
          event: "timeupdate",
          currentTime: 120,
          duration: 3600,
          mediaType: "tv",
          season: 1,
          episode: 2,
        },
      })
    ).toEqual({ kind: "progress", seconds: 120, duration: 3600, season: 1, episode: 2 });
  });

  it("reads only documented shapes from a host with no verified adapter", () => {
    const adapter = getMessageAdapter("provider-2", "https://vidly.pro/tv/84773/3/4");
    if (!adapter) throw new Error("no adapter");

    // The bridge still works exactly as before.
    expect(
      adapter({
        source: "reelhouse-embed",
        type: "progress",
        currentTime: 30,
        duration: 100,
      })
    ).toMatchObject({ kind: "progress", seconds: 30 });

    // ...and so does the documented PLAYER_EVENT contract (VidBolt's own docs
    // list ready/play/pause/timeupdate/ended), which is what makes an opaque
    // slot's own Next Episode reach history.
    expect(
      adapter({
        type: "PLAYER_EVENT",
        data: {
          event: "timeupdate",
          currentTime: 5,
          duration: 100,
          season: 1,
          episode: 2,
        },
      })
    ).toMatchObject({ kind: "progress", seconds: 5, season: 1, episode: 2 });

    // Anything else is still ignored, never guessed at.
    expect(adapter({ type: "vidbolt:something", foo: 1 })).toBeNull();
    expect(adapter("plain text")).toBeNull();
  });
});

describe("vidriftAdapter", () => {
  it("follows the episode the player's own list picked", () => {
    expect(
      vidriftAdapter({
        type: "vidrift:episode",
        tmdbId: "1399",
        mediaType: "tv",
        season: 1,
        episode: 2,
      })
    ).toEqual({ kind: "episode", season: 1, episode: 2 });
  });

  it("reads progress with the episode it belongs to", () => {
    expect(
      vidriftAdapter({
        type: "vidrift:progress",
        tmdbId: "1399",
        mediaType: "tv",
        season: 1,
        episode: 2,
        currentTime: 300,
        duration: 2700,
      })
    ).toEqual({
      kind: "progress",
      seconds: 300,
      duration: 2700,
      season: 1,
      episode: 2,
    });
  });

  it("maps ended and ignores the player's UI chatter", () => {
    expect(vidriftAdapter({ type: "vidrift:ended", season: 1, episode: 2 })).toEqual({
      kind: "ended",
    });
    expect(vidriftAdapter({ type: "vidrift:ui-hidden" })).toBeNull();
    expect(vidriftAdapter({ type: "vidrift:providers", providers: [] })).toBeNull();
    expect(vidriftAdapter({ type: "vidrift:episode", season: 0, episode: 2 })).toBeNull();
    expect(vidriftAdapter("{not json")).toBeNull();
  });

  it("is selected from the framed URL, not a slot", () => {
    expect(
      getMessageAdapter("provider-7", "https://embed.vidrift.net/embed/tv/1399/1/1")
    ).toBe(vidriftAdapter);
    expect(
      getMessageAdapter("provider-7", "https://embed.vidrift.in/embed/tv/1399/1/1")
    ).toBe(vidriftAdapter);
  });
});
