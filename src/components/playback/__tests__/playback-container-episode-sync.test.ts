// @vitest-environment jsdom
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlaybackContainer from "@/components/playback/PlaybackContainer";
import { readProgress, syncOnSignOut } from "@/lib/library";
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

type ContainerProps = Parameters<typeof PlaybackContainer>[0];

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props: ContainerProps = {
    type: "tv",
    media,
    detail: null,
    overview: "",
    runtime: 45,
    seasons,
    plan,
    initialSeasonNumber: 1,
    initialEpisodeNumber: 1,
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
});
