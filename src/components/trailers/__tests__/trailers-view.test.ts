// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import TrailersView from "@/components/trailers/TrailersView";
import type { TrailerFeed, TrailerFeedItem } from "@/types";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ITEM: TrailerFeedItem = {
  id: "movie-693134",
  tmdbId: 693134,
  type: "movie",
  title: "Dune: Part Two",
  year: "2024",
  genres: ["Sci-Fi", "Adventure"],
  youtubeKey: "Way9Dexny3w",
  trailerName: "Official Trailer",
  official: true,
  publishedAt: "2024-02-01T00:00:00.000Z",
};

const FEED: TrailerFeed = {
  items: [ITEM],
  page: 1,
  totalPages: 1,
  kind: "all",
};

describe("TrailersView inline player", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("plays inside the card instead of opening a player modal", () => {
    act(() => {
      root.render(createElement(TrailersView, { feed: FEED, kind: "all" }));
    });

    expect(container.querySelector("iframe")).toBeNull();

    const play = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Play Official Trailer for Dune: Part Two"]'
    );
    expect(play).not.toBeNull();

    act(() => play?.click());

    const frame = container.querySelector<HTMLIFrameElement>("iframe");
    expect(frame).not.toBeNull();
    expect(frame?.src).toContain("youtube-nocookie.com/embed/Way9Dexny3w");
    expect(frame?.src).toContain("autoplay=1");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).not.toContain("Topics");

    const stop = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent?.includes("Stop"));
    expect(stop).toBeTruthy();

    act(() => stop?.click());
    expect(container.querySelector("iframe")).toBeNull();
  });

});
