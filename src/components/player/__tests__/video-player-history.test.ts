// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VideoPlayer from "@/components/player/VideoPlayer";
import { clearHistory, readProgress } from "@/lib/library";
import type { MediaSummary, PlaybackServer, Season } from "@/types";

// ---------------------------------------------------------------------------
// Verification of the real history write path, through the actual player.
//
// The two defects pinned here were both invisible to a store-level test:
//   1. nothing was written when playback started — the first write landed at the
//      first throttled `timeupdate` save;
//   2. leaving the page mid-title saved nothing, because React detaches
//      `videoRef.current` before the effect cleanup runs, so the unmount save
//      read a null element and returned early. History kept whatever the last
//      throttled save had written, which for a short title was often ~0s.
//
// jsdom implements none of the HTMLMediaElement playback surface, so duration /
// currentTime / paused / play / pause / load are stubbed on the prototype. Every
// assertion below reads the library store, not component state.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let fakeTime = 0;
let fakeDuration = 0;
let fakePaused = true;

function installMediaStubs() {
  const proto = HTMLMediaElement.prototype;
  Object.defineProperty(proto, "duration", { configurable: true, get: () => fakeDuration });
  Object.defineProperty(proto, "paused", { configurable: true, get: () => fakePaused });
  Object.defineProperty(proto, "currentTime", {
    configurable: true,
    get: () => fakeTime,
    set: (v: number) => {
      fakeTime = v;
    },
  });
  Object.defineProperty(proto, "playbackRate", {
    configurable: true,
    get: () => 1,
    set: () => {},
  });
  Object.defineProperty(proto, "buffered", {
    configurable: true,
    get: () => ({ length: 0, start: () => 0, end: () => 0 }) as unknown as TimeRanges,
  });
  proto.load = function load() {};
  proto.play = function play(this: HTMLMediaElement) {
    fakePaused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  proto.pause = function pause(this: HTMLMediaElement) {
    fakePaused = true;
    this.dispatchEvent(new Event("pause"));
  };
}
installMediaStubs();

const server: PlaybackServer = {
  id: "sample-1",
  name: "Sample",
  audioLabel: "Original audio",
  countryCode: "US",
  qualityLabel: "1080p",
  source: {
    playbackUrl: "/media/big-buck-bunny.mp4",
    type: "mp4",
    sourceLabel: "Bundled sample clip",
    isSample: true,
  },
};

const movie: MediaSummary = {
  id: "movie-550",
  tmdbId: 550,
  type: "movie",
  title: "Ashfall",
  genres: ["Drama"],
};

const show: MediaSummary = {
  id: "tv-1399",
  tmdbId: 1399,
  type: "tv",
  title: "Northwind",
  genres: ["Drama"],
};

const seasons: Season[] = [
  {
    seasonNumber: 2,
    name: "Season 2",
    episodeCount: 2,
    episodes: [
      { id: "tv-1399-s2e5", seasonNumber: 2, episodeNumber: 5, title: "The Long Room" },
      { id: "tv-1399-s2e6", seasonNumber: 2, episodeNumber: 6, title: "Hollow Season" },
    ],
  },
];

type PlayerProps = Parameters<typeof VideoPlayer>[0];

async function mountPlayer(props: Partial<PlayerProps> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const full: PlayerProps = {
    type: "movie",
    media: movie,
    seasons: [],
    servers: [server],
    backHref: "/movie/550",
    ...props,
  } as PlayerProps;

  await act(async () => {
    root.render(createElement(VideoPlayer, full));
  });

  const video = container.querySelector("video");
  if (!video) throw new Error("player rendered no media element");

  return {
    video,
    async fire(type: string) {
      await act(async () => {
        video.dispatchEvent(new Event(type));
      });
    },
    async play() {
      await act(async () => {
        await video.play();
      });
    },
    /** What SPA navigation away from the watch page does: unmount the player. */
    async leave() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

let now: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.localStorage.clear();
  clearHistory();
  fakeTime = 0;
  fakeDuration = 0;
  fakePaused = true;
  now = vi.spyOn(Date, "now");
  now.mockReturnValue(1_000_000);
});

afterEach(() => {
  now.mockRestore();
});

describe("VideoPlayer → watch history", () => {
  it("records the title as soon as playback starts, before any progress event", async () => {
    const player = await mountPlayer();
    fakeDuration = 600;
    await player.fire("loadedmetadata");

    // Nothing has been watched yet.
    expect(readProgress("movie-550")).toBeUndefined();

    await player.play();

    const entry = readProgress("movie-550");
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({ position: 0, completed: false });

    await player.leave();
  });

  it("saves the position reached when the viewer leaves mid-title", async () => {
    const player = await mountPlayer();
    fakeDuration = 600;
    await player.fire("loadedmetadata");
    await player.play();

    // First timeupdate: the throttle is open, so this one is saved.
    fakeTime = 12;
    await player.fire("timeupdate");
    expect(readProgress("movie-550")).toMatchObject({ position: 12, duration: 600 });

    // Two more seconds of playback — inside the 5s throttle, so no save happens.
    now.mockReturnValue(1_002_000);
    fakeTime = 180;
    await player.fire("timeupdate");
    expect(readProgress("movie-550")).toMatchObject({ position: 12 });

    // Leaving must flush the position actually reached, not the last throttled one.
    await player.leave();

    expect(readProgress("movie-550")).toMatchObject({
      position: 180,
      duration: 600,
      completed: false,
    });
  });

  it("saves on pause without waiting for the throttle", async () => {
    const player = await mountPlayer();
    fakeDuration = 600;
    await player.fire("loadedmetadata");
    await player.play();

    fakeTime = 90;
    await act(async () => {
      player.video.pause();
    });

    expect(readProgress("movie-550")).toMatchObject({ position: 90, duration: 600 });
    await player.leave();
  });

  it("marks a finished title completed and keeps it that way after leaving", async () => {
    const player = await mountPlayer();
    fakeDuration = 600;
    await player.fire("loadedmetadata");
    await player.play();

    fakeTime = 598;
    await player.fire("timeupdate");
    fakeTime = 600;
    await player.fire("ended");

    expect(readProgress("movie-550")).toMatchObject({
      position: 600,
      duration: 600,
      completed: true,
    });

    await player.leave();

    // The unmount flush must not undo completion.
    expect(readProgress("movie-550")).toMatchObject({ completed: true });
  });

  it("records a TV episode with its season, episode and TMDB id", async () => {
    const player = await mountPlayer({
      type: "tv",
      media: show,
      seasons,
      initialSeasonNumber: 2,
      initialEpisodeNumber: 5,
      backHref: "/tv/1399",
    });
    fakeDuration = 2700;
    await player.fire("loadedmetadata");
    await player.play();

    const started = readProgress("tv-1399:s2e5");
    expect(started).toBeDefined();
    expect(started).toMatchObject({ position: 0, completed: false });
    expect(started?.media.tmdbId).toBe(1399);
    expect(started?.episode).toEqual({
      seasonNumber: 2,
      episodeNumber: 5,
      title: "The Long Room",
    });

    // Watch a while, then leave before the episode ends.
    fakeTime = 420;
    await player.fire("timeupdate");
    now.mockReturnValue(1_001_500);
    fakeTime = 505;
    await player.fire("timeupdate");
    await player.leave();

    const entry = readProgress("tv-1399:s2e5");
    expect(entry).toMatchObject({ position: 505, duration: 2700, completed: false });
    expect(entry?.episode?.seasonNumber).toBe(2);
    expect(entry?.episode?.episodeNumber).toBe(5);
    // Only that episode was touched.
    expect(readProgress("tv-1399:s2e6")).toBeUndefined();
    expect(readProgress("tv-1399")).toBeUndefined();
  });
});
