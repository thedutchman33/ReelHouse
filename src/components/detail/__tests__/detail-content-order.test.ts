// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DetailContent from "@/components/detail/DetailContent";
import type { MoctaleSnapshot } from "@/lib/moctale";
import type { Media } from "@/types";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/detail/DetailHero", async () => {
  const { createElement: h } = await import("react");
  return {
    default: (props: { media: Media }) =>
      h(
        "div",
        { "data-testid": "hero" },
        props.media.trailerKey ? "hero-with-trailer" : "hero"
      ),
  };
});
vi.mock("@/components/detail/CastRow", () => ({ default: () => null }));
vi.mock("@/components/detail/EpisodeList", () => ({ default: () => null }));
vi.mock("@/components/media/MediaRow", () => ({ default: () => null }));
vi.mock("@/components/reviews/MoctaleInsights", async () => {
  const { createElement: h } = await import("react");
  return {
    default: (props: { snapshot?: unknown }) =>
      props.snapshot
        ? h("div", { "data-testid": "detail-moctale" }, "moctale")
        : null,
  };
});

const MOCTALE: MoctaleSnapshot = {
  url: "https://www.moctale.in/content/dune-part-two-2024",
  similarUrl: "https://www.moctale.in/content/dune-part-two-2024/similar-vibe",
  title: "Dune: Part Two",
  year: 2024,
  vibes: [{ label: "Action", slug: "action", percent: 100, color: "#bd0010" }],
  meter: {
    score: 60,
    top: {
      key: "go-for-it",
      label: "Go for it",
      percent: 60,
      color: "#00d391",
      votes: 6,
    },
    buckets: [],
    totalVotes: 10,
  },
  reviews: [],
  reviewsLocked: false,
};

const MEDIA: Media = {
  id: "movie-693134",
  tmdbId: 693134,
  type: "movie",
  title: "Dune: Part Two",
  overview: "Paul Atreides unites with the Fremen.",
  genres: ["Sci-Fi", "Adventure"],
  trailerKey: "Way9Dexny3w",
  trailerName: "Official Trailer",
};

describe("DetailContent order", () => {
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

  it("gives the trailer to the hero instead of a second trailer block", () => {
    act(() => {
      root.render(createElement(DetailContent, { media: MEDIA }));
    });

    const hero = container.querySelector('[data-testid="hero"]');
    expect(hero?.textContent).toBe("hero-with-trailer");
    expect(container.querySelector('[aria-label="Official trailer"]')).toBeNull();
  });

  it("renders Moctale after the hero when a snapshot exists", () => {
    act(() => {
      root.render(
        createElement(DetailContent, { media: MEDIA, moctale: MOCTALE })
      );
    });

    const hero = container.querySelector('[data-testid="hero"]');
    const moctale = container.querySelector('[data-testid="detail-moctale"]');
    expect(hero).not.toBeNull();
    expect(moctale).not.toBeNull();
    expect(
      hero!.compareDocumentPosition(moctale!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
