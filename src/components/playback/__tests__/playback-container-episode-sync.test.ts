// @vitest-environment jsdom
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import PlaybackContainer from "@/components/playback/PlaybackContainer";
import { readProgress, saveProgress, syncOnSignOut } from "@/lib/library";
import type { PlaybackPlan } from "@/lib/playback/types";
import type { MediaSummary, Season } from "@/types";

// ---------------------------------------------------------------------------
// Watch-page episode sync.
//
// Picking an episode (the rail below the player) must move everything together:
// the URL, the highlighted episode, the embed frame's src and watch history.
// A provider that reports its own episode change through the bridge must move
// the first three *except* the frame — reloading the frame would restart the
// episode the provider is already playing.
//
// The heavy children are stubbed so this pins the container's own wiring rather
// than their markup; the real EmbedSurface/VidPlayer behaviour is covered by
// their own tests.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/player/VideoPlayer", () => ({ default: () => null }));
vi.mock("@/components/media/PosterImage", () => ({ default: () => null }));
vi.mock("@/components/playback/WatchDock", () => ({ default: () => null }));
vi.mock("@/components/playback/ServerPanel", () => ({ default: () => null }));
vi.mock("@/components/playback/WatchDetails", () => ({ default: () => null }));
vi.mock("@/components/playback/ProviderSelector", () => ({ default: () => null }));
vi.mock("@/components/playback/WatchExtras", () => ({
  RecommendationsSection: () => null,
  TrailerSection: () => null,
}));

vi.mock("@/components/playback/WatchEpisodes", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: {
      season: number;
      episode: number;
      seasons: Season[];
      onSelectEpisode: (season: number, episode: number) => void;
    }) =>
      createElement(
        "div",
        null,
        createElement(
          "span",
          { "data-testid": "rail" },
          `S${props.season}E${props.episode}`
        ),
        ...((props.seasons[0]?.episodes ?? []).map((ep) =>
          createElement(
            "button",
            {
              key: ep.episodeNumber,
              "data-testid": `pick-${ep.episodeNumber}`,
              onClick: () => props.onSelectEpisode(1, ep.episodeNumber),
            },
            ep.title
          )
        ) as ReturnType<typeof createElement>[])
      ),
  };
});

vi.mock("@/components/playback/EmbedSurface", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: {
      src: string;
      onEpisode?: (season: number, episode: number) => void;
      onProgress?: (seconds: number, duration: number) => void;
      onEnded?: () => void;
    }) =>
      createElement(
        "div",
        null,
        createElement("span", { "data-testid": "embed-src" }, props.src),
        createElement(
          "button",
          {
            "data-testid": "provider-episode",
            // What a hosted player's own Next button reports via the bridge.
            onClick: () => props.onEpisode?.(3, 4),
          },
          "provider next"
        ),
        createElement(
          "button",
          {
            "data-testid": "provider-tick",
            // Videasy reports the episode WITH each timeupdate, so the adapter
            // hands EmbedSurface both; it must retarget before reporting.
            onClick: () => {
              props.onEpisode?.(3, 4);
              props.onProgress?.(120, 600);
            },
          },
          "provider tick"
        ),
        createElement(
          "button",
          {
            "data-testid": "provider-same",
            // A report for the episode already playing: enough to prove the
            // provider tracks episodes, no navigation.
            onClick: () => {
              props.onEpisode?.(1, 1);
              props.onProgress?.(4_000, 4_264);
            },
          },
          "provider same"
        ),
        createElement(
          "button",
          {
            "data-testid": "provider-stale-tick",
            // The replaced frame's last report, arriving after the switch.
            onClick: () => {
              props.onEpisode?.(1, 1);
              props.onProgress?.(16, 4_264);
            },
          },
          "stale tick"
        ),
        createElement(
          "button",
          {
            "data-testid": "provider-advance",
            onClick: () => props.onEpisode?.(1, 2),
          },
          "provider advance"
        ),
        createElement(
          "button",
          {
            "data-testid": "provider-ended",
            onClick: () => props.onEnded?.(),
          },
          "provider ended"
        )
      ),
  };
});

const media: MediaSummary = {
  id: "tv-1399",
  tmdbId: 1399,
  type: "tv",
  title: "Northwind",
  genres: ["Drama"],
};

const seasons: Season[] = [
  {
    seasonNumber: 1,
    name: "Season 1",
    episodeCount: 3,
    episodes: [
      { id: "tv-1399-s1e1", seasonNumber: 1, episodeNumber: 1, title: "Pilot" },
      { id: "tv-1399-s1e2", seasonNumber: 1, episodeNumber: 2, title: "Second" },
      { id: "tv-1399-s1e3", seasonNumber: 1, episodeNumber: 3, title: "The Third" },
    ],
  },
];

const plan: PlaybackPlan = {
  providers: [],
  candidates: [
    {
      provider: {
        id: "provider-1",
        displayName: "Test Player",
        priority: 10,
        surface: "embed",
        available: true,
        isBuiltIn: false,
        capabilities: {
          // No provider-specific progress documentation: the bridge is what
          // makes this surface observable.
          canReportProgress: false,
          canReportFailure: false,
          supportedMediaTypes: ["tv"],
        },
      },
      surface: {
        kind: "embed",
        urlTemplate: "https://player.test/watch/{id}/{season}/{episode}",
      },
    },
  ],
};

const videasyPlan: PlaybackPlan = {
  providers: [],
  candidates: [
    {
      ...plan.candidates[0],
      provider: { ...plan.candidates[0].provider, displayName: "Videasy" },
      surface: {
        kind: "embed",
        urlTemplate: "https://vidy.st/tv/{id}/{season}/{episode}",
      },
    },
  ],
};

type ContainerProps = Parameters<typeof PlaybackContainer>[0];

async function mount(
  options: {
    plan?: PlaybackPlan;
    initialEpisodeNumber?: number;
    seasons?: Season[];
  } = {}
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props: ContainerProps = {
    type: "tv",
    media,
    detail: null,
    overview: "",
    runtime: 45,
    seasons: options.seasons ?? seasons,
    plan: options.plan ?? plan,
    initialSeasonNumber: 1,
    initialEpisodeNumber: options.initialEpisodeNumber ?? 1,
    backHref: "/tv/1399",
  };
  await act(async () => {
    root.render(createElement(PlaybackContainer, props));
  });
  return { root, container };
}

function el(testId: string): HTMLElement {
  const node = document.querySelector(`[data-testid="${testId}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`missing ${testId}`);
  return node;
}

async function click(testId: string) {
  await act(async () => {
    el(testId).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  // Public API only, so `serverEnabled` and the in-memory mirror reset too.
  syncOnSignOut();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PlaybackContainer episode sync", () => {
  it("moves the URL, the rail, the frame and history when an episode is picked", async () => {
    const { root } = await mount();

    expect(el("embed-src").textContent).toBe(
      "https://player.test/watch/1399/1/1"
    );
    expect(el("rail").textContent).toBe("S1E1");

    await click("pick-3");

    // The URL is the shared source of truth across surfaces and reloads.
    expect(window.location.search).toBe("?s=1&e=3");
    // The rail follows the container.
    expect(el("rail").textContent).toBe("S1E3");
    // An explicit pick reloads the provider's frame at the chosen episode.
    expect(el("embed-src").textContent).toBe(
      "https://player.test/watch/1399/1/3"
    );
    // Watch history records the episode, not just the title.
    const entry = readProgress("tv-1399:s1e3");
    expect(entry).toMatchObject({ position: 0, completed: false });
    expect(entry?.episode).toMatchObject({ seasonNumber: 1, episodeNumber: 3 });

    await act(async () => root.unmount());
  });

  it("follows a provider-reported episode without reloading its frame", async () => {
    const { root } = await mount();
    const frame = el("embed-src").textContent;

    // The provider's own Next button: it is already playing S3E4.
    await click("provider-episode");

    expect(window.location.search).toBe("?s=3&e=4");
    expect(el("rail").textContent).toBe("S3E4");
    // Reloading here would restart the episode the provider is playing.
    expect(el("embed-src").textContent).toBe(frame);
    // ...but history must learn about it.
    expect(readProgress("tv-1399:s3e4")).toBeDefined();

    await act(async () => root.unmount());
  });

  it("writes provider progress onto the episode it names", async () => {
    const { root } = await mount();

    // One Videasy timeupdate: episode coordinates plus a position.
    await click("provider-tick");

    expect(readProgress("tv-1399:s3e4")).toMatchObject({
      position: 120,
      duration: 600,
      completed: false,
    });
    // The first episode was not credited with the other episode's position.
    expect(readProgress("tv-1399:s1e1")?.position).toBe(0);

    await act(async () => root.unmount());
  });

  it("loads the embed at the saved position for the episode", async () => {
    saveProgress({
      media,
      episode: { seasonNumber: 1, episodeNumber: 2, title: "Second" },
      position: 600.9,
      duration: 2700,
    });

    const { root } = await mount({
      plan: videasyPlan,
      initialEpisodeNumber: 2,
    });

    expect(el("embed-src").textContent).toBe(
      "https://vidy.st/tv/1399/1/2?progress=600"
    );

    await act(async () => root.unmount());
  });

  it("does not send a resume parameter for a finished or barely-started record", async () => {
    saveProgress({
      media,
      episode: { seasonNumber: 1, episodeNumber: 2, title: "Second" },
      position: 2700,
      duration: 2700,
    });

    const { root } = await mount({
      plan: videasyPlan,
      initialEpisodeNumber: 2,
    });

    expect(el("embed-src").textContent).toBe("https://vidy.st/tv/1399/1/2");

    await act(async () => root.unmount());
  });

  it("advances autoplay immediately when the provider never names episodes", async () => {
    const { root } = await mount();

    await click("provider-ended");

    expect(window.location.search).toBe("?s=1&e=2");
    expect(el("rail").textContent).toBe("S1E2");
    expect(el("embed-src").textContent).toBe(
      "https://player.test/watch/1399/1/2"
    );

    await act(async () => root.unmount());
  });

  it("gives a provider that names episodes the first chance to advance", async () => {
    vi.useFakeTimers();
    const { root } = await mount();
    const frame = el("embed-src").textContent;

    // A report for the episode already playing must not reload the frame.
    await click("provider-same");
    expect(el("embed-src").textContent).toBe(frame);

    // The finished episode ends, then the provider starts the next one itself.
    await click("provider-ended");
    await click("provider-advance");

    // Its own advance must not be undone by a reload at the next episode.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(window.location.search).toBe("?s=1&e=2");
    expect(el("embed-src").textContent).toBe(frame);

    await act(async () => root.unmount());
  });

  it("still advances after the grace period when the provider stops at the end", async () => {
    vi.useFakeTimers();
    const { root } = await mount();

    // The provider names the episode, then ends — but never starts the next one
    // (Videasy's auto-next is a viewer setting and is off by default).
    await click("provider-same");
    await click("provider-ended");

    // Still on the finished episode until the grace period elapses.
    expect(window.location.search).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(window.location.search).toBe("?s=1&e=2");
    expect(el("rail").textContent).toBe("S1E2");
    expect(el("embed-src").textContent).toBe(
      "https://player.test/watch/1399/1/2"
    );

    await act(async () => root.unmount());
  });

  it("advances from season metadata while the episode list is still loading", async () => {
    // The live watch page ships season metadata only: episodes come from
    // /api/seasons after mount, and that request can still be in flight — or
    // have failed — when an episode ends. The episode count is metadata, so the
    // page must still step to the next episode.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({}) }))
    );
    const { root } = await mount({
      seasons: [{ seasonNumber: 1, name: "Season 1", episodeCount: 3 }],
    });

    await click("provider-ended");

    expect(window.location.search).toBe("?s=1&e=2");
    expect(readProgress("tv-1399:s1e2")?.episode).toMatchObject({
      seasonNumber: 1,
      episodeNumber: 2,
    });

    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("does not step past the last episode of a season", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({}) }))
    );
    const { root } = await mount({
      seasons: [{ seasonNumber: 1, name: "Season 1", episodeCount: 3 }],
      initialEpisodeNumber: 3,
    });

    await click("provider-ended");

    expect(window.location.search).toBe("");

    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("saves the position a provider actually reports", async () => {
    // The provider's own capability flag is off in this plan; a position it
    // posted is still a real observation, so history keeps it.
    const { root } = await mount();

    await click("provider-same");

    expect(readProgress("tv-1399:s1e1")).toMatchObject({
      position: 4_000,
      duration: 4_264,
    });

    await act(async () => root.unmount());
  });

  it("ignores a late report from the frame an episode switch replaced", async () => {
    vi.useFakeTimers();
    const { root } = await mount();

    // Watch S1E1 to the end; the provider reports 4000s of a 4264s episode.
    await click("provider-same");
    await click("provider-ended");
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(window.location.search).toBe("?s=1&e=2");
    expect(readProgress("tv-1399:s1e1")).toMatchObject({
      position: 4_264,
      completed: true,
    });
    expect(readProgress("tv-1399:s1e2")).toMatchObject({ position: 0 });

    // The replaced frame's last timeupdate arrives after the switch. Treating
    // it as a provider-driven change dragged history back to S1E1 (and its 16s
    // opening position over the completed record).
    await click("provider-stale-tick");

    expect(readProgress("tv-1399:s1e1")).toMatchObject({
      position: 4_264,
      completed: true,
    });
    expect(readProgress("tv-1399:s1e2")).toMatchObject({ position: 0 });

    await act(async () => root.unmount());
  });
});
