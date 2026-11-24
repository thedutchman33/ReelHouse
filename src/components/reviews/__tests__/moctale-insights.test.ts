// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MoctaleInsights from "@/components/reviews/MoctaleInsights";
import type { MoctaleSnapshot } from "@/lib/moctale";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SNAPSHOT: MoctaleSnapshot = {
  url: "https://www.moctale.in/content/spider-man-brand-new-day-2026",
  similarUrl:
    "https://www.moctale.in/content/spider-man-brand-new-day-2026/similar-vibe",
  title: "Spider-Man: Brand New Day",
  year: 2026,
  vibes: [
    { label: "Action", slug: "action", percent: 35, color: "#bd0010" },
    { label: "Drama", slug: "drama", percent: 20, color: "#7a503e" },
    { label: "Sci-Fi", slug: "sci-fi", percent: 10, color: "#00b1b8" },
  ],
  meter: {
    score: 60,
    top: {
      key: "go-for-it",
      label: "Go for it",
      percent: 59.8,
      color: "#00d391",
      votes: 19423,
    },
    buckets: [
      {
        key: "skip",
        label: "Skip",
        percent: 0.22,
        color: "#fe647e",
        votes: 71,
      },
      {
        key: "timepass",
        label: "Timepass",
        percent: 2.04,
        color: "#fcb700",
        votes: 664,
      },
      {
        key: "go-for-it",
        label: "Go for it",
        percent: 59.8,
        color: "#00d391",
        votes: 19423,
      },
      {
        key: "perfection",
        label: "Perfection",
        percent: 37.94,
        color: "#B048FF",
        votes: 12321,
      },
    ],
    totalVotes: 32479,
  },
  reviewsLocked: false,
  reviews: [
    {
      id: "aarav-1",
      name: "Aarav Sharma",
      username: "aarav_cinema",
      age: "2 days ago",
      verdict: "Perfection",
      verdictColor: "#B048FF",
      text: "A web-swinging crowd pleaser.",
      likes: 42,
      comments: 8,
    },
    {
      id: "priya-2",
      name: "Priya Patel",
      username: "priya_reviews",
      age: "5 days ago",
      verdict: "Go For It",
      verdictColor: "#00d391",
      text: "The chemistry is the whole movie.",
      likes: 29,
      comments: 3,
    },
    {
      id: "rohan-3",
      name: "Rohan Mehta",
      username: "rohan_m",
      age: "1 week ago",
      verdict: "Timepass",
      verdictColor: "#fcb700",
      text: "Fun while it lasts.",
      likes: 14,
      comments: 1,
    },
  ],
};

describe("MoctaleInsights", () => {
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

  it("renders the real three-card layout and the top-liked reviews", () => {
    act(() => {
      root.render(createElement(MoctaleInsights, { snapshot: SNAPSHOT }));
    });

    expect(container.textContent).toContain("Vibe Chart");
    expect(container.textContent).toContain("Moctale Meter");
    expect(container.textContent).toContain("Top Reviews");
    expect(container.textContent).toContain("Aarav Sharma");
    expect(container.textContent).toContain("Priya Patel");
    expect(container.textContent).toContain("Rohan Mehta");
    expect(container.textContent).toContain("19423/32479 Votes");
    expect(container.textContent).not.toContain("Find Similar Vibes");
    expect(container.textContent).not.toContain("Read reviews on Moctale");
  });

  it("shows the hovered vibe in the donut centre, then the hovered meter vote", async () => {
    act(() => {
      root.render(createElement(MoctaleInsights, { snapshot: SNAPSHOT }));
    });

    // Top genre wins by default, exactly like Moctale's sorted slices.
    expect(container.textContent).toContain("Action35%");
    expect(container.textContent).toContain("19423/32479 Votes");

    const drama = container.querySelector<HTMLAnchorElement>(
      'a[aria-label="Drama genre: 20%"]'
    );
    expect(drama).not.toBeNull();

    act(() => {
      drama?.dispatchEvent(new Event("pointerover", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
    expect(container.textContent).toContain("Drama20%");

    const perfection = Array.from(
      container.querySelectorAll<HTMLElement>("[aria-label]")
    ).find((el) => el.getAttribute("aria-label")?.startsWith("Perfection:"));
    expect(perfection).toBeTruthy();

    act(() => {
      perfection?.dispatchEvent(new Event("pointerover", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
    expect(container.textContent).toContain("38%");
    expect(container.textContent).toContain("12321/32479 Votes");
  });

  it("keeps the centre value visible when a legend hover is interrupted", async () => {
    act(() => {
      root.render(createElement(MoctaleInsights, { snapshot: SNAPSHOT }));
    });

    const drama = container.querySelector<HTMLAnchorElement>(
      'a[aria-label="Drama genre: 20%"]'
    );
    expect(drama).not.toBeNull();

    act(() => {
      drama?.dispatchEvent(new Event("pointerover", { bubbles: true }));
    });

    // Leave before the 150 ms crossfade completes, which used to cancel the
    // swap but leave the centre's fade flag stuck at opacity-0.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    act(() => {
      drama?.dispatchEvent(new Event("pointerout", { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });

    const centre = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("a")
    ).find((element) => element.textContent === "Action35%");
    expect(centre).toBeTruthy();
    expect(centre?.className).not.toContain("opacity-0");
  });

  it("expands a review that the four-line clamp cuts off", () => {
    const originalResizeObserver = globalThis.ResizeObserver;

    class FakeResizeObserver {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(element: Element) {
        // jsdom has no layout; give the review body a clamped height so the
        // component's overflow measurement can be exercised here.
        Object.defineProperty(element, "scrollHeight", {
          configurable: true,
          value: 160,
        });
        Object.defineProperty(element, "clientHeight", {
          configurable: true,
          value: 76,
        });
        this.callback([], this as unknown as ResizeObserver);
      }

      disconnect() {}
    }

    globalThis.ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;

    try {
      const longReview = {
        ...SNAPSHOT.reviews[0]!,
        text: "A long review that is cut off by the clamp. ".repeat(12),
      };

      act(() => {
        root.render(
          createElement(MoctaleInsights, {
            snapshot: { ...SNAPSHOT, reviews: [longReview] },
          })
        );
      });

      const viewMore = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button")
      ).find((button) => button.textContent === "View more");
      expect(viewMore).toBeTruthy();
      expect(viewMore?.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector("p.line-clamp-4")?.textContent).toContain(
        longReview.text
      );

      act(() => {
        viewMore?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      const showLess = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button")
      ).find((button) => button.textContent === "Show less");
      expect(showLess).toBeTruthy();
      expect(showLess?.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector("p.line-clamp-4")).toBeNull();
    } finally {
      if (originalResizeObserver) {
        globalThis.ResizeObserver = originalResizeObserver;
      } else {
        delete (globalThis as { ResizeObserver?: typeof ResizeObserver })
          .ResizeObserver;
      }
    }
  });

  it("renders the meter and reviews without a vibe chart when genres are absent", () => {
    act(() => {
      root.render(
        createElement(MoctaleInsights, {
          snapshot: { ...SNAPSHOT, vibes: [] },
        })
      );
    });

    expect(container.textContent).toContain("Moctale Meter");
    expect(container.textContent).toContain("Top Reviews");
    expect(container.textContent).not.toContain("Vibe Chart");
    expect(container.textContent).toContain("Aarav Sharma");
    expect(container.textContent).toContain("19423/32479 Votes");
  });

  it("never shows Moctale's demo list or a members-only redirect", () => {
    act(() => {
      root.render(
        createElement(MoctaleInsights, {
          snapshot: { ...SNAPSHOT, reviews: [], reviewsLocked: true },
        })
      );
    });

    expect(container.textContent).toContain("Top Reviews");
    expect(container.textContent).toContain("No community reviews yet");
    expect(container.textContent).not.toContain("Read reviews on Moctale");
    expect(container.textContent).not.toContain("Aarav Sharma");
    expect(container.querySelector("li")).toBeNull();
  });

  it("renders nothing when Moctale has no matching page", () => {
    act(() => {
      root.render(createElement(MoctaleInsights, { snapshot: null }));
    });

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for a release-only snapshot with no community votes", () => {
    act(() => {
      root.render(
        createElement(MoctaleInsights, {
          snapshot: {
            ...SNAPSHOT,
            meter: { ...SNAPSHOT.meter, totalVotes: 0 },
            reviews: [],
          },
        })
      );
    });

    expect(container.innerHTML).toBe("");
  });
});
