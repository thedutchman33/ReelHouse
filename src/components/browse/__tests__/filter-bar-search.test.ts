// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FilterBar from "@/components/browse/FilterBar";
import type { BrowseFilters } from "@/lib/browse";
import type { WatchProvider } from "@/lib/tmdb";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const PROVIDERS: WatchProvider[] = [
  {
    id: 8,
    name: "Netflix",
    logoUrl: "https://image.tmdb.org/t/p/w300/netflix.png",
  },
  {
    id: 9,
    name: "Prime Video",
    logoUrl: "https://image.tmdb.org/t/p/w300/prime.png",
  },
];

const FILTERS: BrowseFilters = {
  type: "movie",
  genres: [],
  provider: null,
  year: null,
  sort: "recent",
  industry: "hollywood",
  decade: null,
  ageRating: null,
  duration: null,
  language: null,
  hideAnime: false,
  select: false,
  family: false,
  award: false,
  page: 1,
};

function setSearchValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("FilterBar searchable selects", () => {
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

  function render(onChange = vi.fn()) {
    act(() => {
      root.render(
        createElement(FilterBar, {
          filters: FILTERS,
          genres: ["Action", "Drama"],
          years: [2026, 2025, 2024],
          providers: PROVIDERS,
          onChange,
        })
      );
    });
    return onChange;
  }

  function optionLabels() {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="option"]')
    ).map((option) => option.textContent);
  }

  it("filters languages and applies the chosen result", () => {
    const onChange = render();
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Language: All languages"]'
    );
    expect(trigger).not.toBeNull();

    act(() => {
      trigger?.click();
    });

    const search = container.querySelector<HTMLInputElement>(
      'input[type="search"]'
    );
    expect(search).not.toBeNull();
    setSearchValue(search!, "kor");
    expect(optionLabels()).toEqual(["Korean"]);

    setSearchValue(search!, "zzz");
    expect(optionLabels()).toEqual([]);
    expect(container.textContent).toContain("No matches");

    setSearchValue(search!, "kor");
    const korean = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="option"]')
    ).find((option) => option.textContent === "Korean");
    act(() => {
      korean?.click();
    });

    expect(onChange).toHaveBeenCalledWith({ language: "ko", page: 1 });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("filters years and applies the chosen result", () => {
    const onChange = render();
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Year: All years"]'
    );
    act(() => {
      trigger?.click();
    });

    const search = container.querySelector<HTMLInputElement>(
      'input[type="search"]'
    );
    expect(search).not.toBeNull();
    setSearchValue(search!, "2025");
    expect(optionLabels()).toEqual(["2025"]);

    const year = container.querySelector<HTMLButtonElement>('[role="option"]');
    act(() => {
      year?.click();
    });

    expect(onChange).toHaveBeenCalledWith({ year: 2025, page: 1 });
  });
});
