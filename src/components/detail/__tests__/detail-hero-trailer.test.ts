// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DetailHero from "@/components/detail/DetailHero";
import type { Media } from "@/types";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/media/PosterImage", async () => {
  const { createElement: h } = await import("react");
  return {
    default: (props: {
      variant?: string;
      title: string;
      src?: string;
      onError?: () => void;
    }) =>
      h("img", {
        "data-testid":
          props.variant === "backdrop" ? "hero-backdrop" : "hero-poster",
        alt: props.title,
        src: props.src ?? "",
        onError: props.onError,
      }),
  };
});
vi.mock("@/components/media/TrackButton", () => ({ default: () => null }));
vi.mock("@/components/media/WatchlistButton", () => ({ default: () => null }));
vi.mock("@/components/detail/PlayButton", () => ({ default: () => null }));
vi.mock("@/components/reviews/ReviewButton", () => ({ default: () => null }));

const MEDIA: Media = {
  id: "movie-1595124",
  tmdbId: 1595124,
  type: "movie",
  title: "The Hunger Games: Sunrise on the Reaping",
  overview: "Return to the world of Panem.",
  genres: ["Adventure", "Sci-Fi"],
  backdropUrl: "https://image.tmdb.org/t/p/original/backdrop.jpg",
  posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
  trailerKey: "Way9Dexny3w",
  trailerName: "Official Trailer",
};

describe("DetailHero trailer", () => {
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
    document.body.style.overflow = "";
  });

  it("opens the official trailer in a player from the hero play button", () => {
    act(() => {
      root.render(createElement(DetailHero, { media: MEDIA }));
    });

    const play = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Play Official Trailer"]'
    );
    expect(play).not.toBeNull();
    expect(play?.getAttribute("aria-haspopup")).toBe("dialog");

    act(() => {
      play!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const iframe = dialog!.querySelector("iframe");
    expect(iframe?.src).toContain("/embed/Way9Dexny3w");
    expect(iframe?.src).toContain("autoplay=1");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes the player on Escape and frees the page", () => {
    act(() => {
      root.render(createElement(DetailHero, { media: MEDIA }));
    });
    const play = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Play Official Trailer"]'
    )!;
    act(() => {
      play.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(play);
  });

  it("prefers the TMDB backdrop over a Moctale banner", () => {
    act(() => {
      root.render(
        createElement(DetailHero, {
          media: MEDIA,
          bannerUrl: "https://media.moctale.in/images/hero.jpg",
        })
      );
    });

    expect(
      container
        .querySelector('[data-testid="hero-backdrop"]')
        ?.getAttribute("src")
    ).toBe(MEDIA.backdropUrl);
  });

  it("uses the trailer's YouTube still when there is no TMDB backdrop", () => {
    act(() => {
      root.render(
        createElement(DetailHero, {
          media: { ...MEDIA, backdropUrl: undefined },
          bannerUrl: "https://media.moctale.in/images/hero.jpg",
        })
      );
    });

    expect(
      container
        .querySelector('[data-testid="hero-backdrop"]')
        ?.getAttribute("src")
    ).toBe("https://i.ytimg.com/vi/Way9Dexny3w/maxresdefault.jpg");
  });

  it("advances to the YouTube still if the TMDB backdrop fails", () => {
    act(() => {
      root.render(
        createElement(DetailHero, {
          media: MEDIA,
          bannerUrl: "https://media.moctale.in/images/hero.jpg",
        })
      );
    });

    const backdrop = container.querySelector(
      '[data-testid="hero-backdrop"]'
    )!;
    act(() => {
      backdrop.dispatchEvent(new Event("error", { bubbles: true }));
    });

    expect(
      container
        .querySelector('[data-testid="hero-backdrop"]')
        ?.getAttribute("src")
    ).toBe("https://i.ytimg.com/vi/Way9Dexny3w/maxresdefault.jpg");
  });

  it("has no play control when the title has no trailer", () => {
    act(() => {
      root.render(
        createElement(DetailHero, {
          media: { ...MEDIA, trailerKey: undefined },
        })
      );
    });

    expect(
      container.querySelector('button[aria-label="Play Official Trailer"]')
    ).toBeNull();
  });

  it("shows the theatrical release date and interest count without a share action", () => {
    act(() => {
      root.render(
        createElement(DetailHero, {
          media: MEDIA,
          releaseNotice: {
            kind: "theaters",
            label: "Coming to Theaters",
            date: "2026-12-17",
            interested: 63103,
          },
        })
      );
    });

    expect(container.textContent).toContain("Coming to Theaters");
    expect(container.textContent).toContain("December 17, 2026");
    expect(container.textContent).toContain("63.1k interested");
    expect(container.textContent).not.toContain("Share");
  });

  it("opens the first trailer and lets the viewer switch to another trailer or teaser", () => {
    const trailerVideos = [
      { key: "Wb8Tq_HD4E8", name: "Final Trailer" },
      { key: "X1aFkAkFASk", name: "Special Look" },
      { key: "irVNGjRFZGk", name: "Trailer" },
    ];

    act(() => {
      root.render(
        createElement(DetailHero, {
          media: {
            ...MEDIA,
            trailerKey: trailerVideos[0].key,
            trailerName: trailerVideos[0].name,
            trailerVideos,
          },
        })
      );
    });

    const play = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Play Official Trailer"]'
    );
    act(() => {
      play?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const dialog = document.querySelector('[role="dialog"]');
    const iframe = dialog?.querySelector("iframe");
    expect(iframe?.src).toContain("/embed/Wb8Tq_HD4E8");
    expect(dialog?.textContent).toContain("Trailers & Teasers");

    const options = Array.from(
      dialog?.querySelectorAll<HTMLButtonElement>('[role="group"] button') ?? []
    );
    expect(options.map((button) => button.textContent)).toEqual([
      "Final Trailer",
      "Special Look",
      "Trailer",
    ]);
    expect(options[0]?.getAttribute("aria-pressed")).toBe("true");

    act(() => {
      options[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const switched = document.querySelector<HTMLIFrameElement>(
      '[role="dialog"] iframe'
    );
    expect(switched?.src).toContain("/embed/X1aFkAkFASk");
    expect(
      document
        .querySelector('[role="group"] button[aria-pressed="true"]')
        ?.textContent
    ).toBe("Special Look");
  });

  it("shows the next episode's season, number, title and overview", () => {
    act(() => {
      root.render(
        createElement(DetailHero, {
          media: { ...MEDIA, type: "tv" },
          releaseNotice: {
            kind: "episode",
            label: "Next Episode",
            date: "2026-11-26",
            seasonNumber: 1,
            episode: {
              seasonNumber: 1,
              episodeNumber: 4,
              title: "That's How You Make a Boy Baby",
              overview:
                "Jack and Paul zero in on the same informant. Paul has a tense run-in.",
            },
          },
        })
      );
    });

    expect(container.textContent).toContain("Next Episode");
    expect(container.textContent).toContain("November 26, 2026");
    expect(container.textContent).toContain("S1 E4");
    expect(container.textContent).toContain("That's How You Make a Boy Baby");
    expect(container.textContent).toContain("Paul has a tense run-in.");
    expect(container.textContent).not.toContain("Share");
  });
});
