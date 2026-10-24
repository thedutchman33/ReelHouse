import { describe, expect, it } from "vitest";
import {
  browseHref,
  browsePathFor,
  DEFAULT_INDUSTRY,
  DEFAULT_SORT,
  hasActiveFilters,
  parseBrowseFilters,
  type BrowseFilters,
} from "@/lib/browse";

// The browse filter model is the single URL contract shared by /browse, /movies
// and /tv-shows plus the client filter bar. These tests pin that contract: what a
// URL parses to, and what a filter change links to.

const base: BrowseFilters = {
  type: "all",
  genre: null,
  provider: null,
  year: null,
  sort: DEFAULT_SORT,
  industry: DEFAULT_INDUSTRY,
  page: 1,
};

describe("parseBrowseFilters", () => {
  it("defaults everything when no params are present", () => {
    expect(parseBrowseFilters({})).toEqual(base);
  });

  it("reads type, genre, provider, year, sort and page", () => {
    expect(
      parseBrowseFilters({
        type: "tv",
        genre: "Drama",
        provider: "8",
        year: "2021",
        sort: "rating",
        page: "3",
      })
    ).toEqual({
      type: "tv",
      genre: "Drama",
      provider: 8,
      year: 2021,
      sort: "rating",
      industry: "hollywood",
      page: 3,
    });
    // Non-numeric / non-positive provider values fall back to "all".
    expect(parseBrowseFilters({ provider: "abc" }).provider).toBeNull();
    expect(parseBrowseFilters({ provider: "-4" }).provider).toBeNull();
  });

  it("pins the type on /movies and /tv-shows, ignoring a conflicting param", () => {
    expect(parseBrowseFilters({ type: "tv" }, "movie").type).toBe("movie");
    expect(parseBrowseFilters({ type: "movie" }, "tv").type).toBe("tv");
  });

  it("falls back to all for an unknown type", () => {
    expect(parseBrowseFilters({ type: "audiobook" }).type).toBe("all");
  });

  it("ignores a sort it cannot apply", () => {
    expect(parseBrowseFilters({ sort: "alphabetical" }).sort).toBe(DEFAULT_SORT);
  });

  it("rejects nonsense years and blank genres", () => {
    expect(parseBrowseFilters({ year: "banana" }).year).toBeNull();
    expect(parseBrowseFilters({ year: "1200" }).year).toBeNull();
    expect(parseBrowseFilters({ year: "2020.5" }).year).toBeNull();
    expect(parseBrowseFilters({ genre: "   " }).genre).toBeNull();
  });

  it("clamps paging to the range the sources support", () => {
    expect(parseBrowseFilters({ page: "0" }).page).toBe(1);
    expect(parseBrowseFilters({ page: "-4" }).page).toBe(1);
    expect(parseBrowseFilters({ page: "9999" }).page).toBe(500);
  });

  it("takes the first value when a param is repeated", () => {
    expect(parseBrowseFilters({ genre: ["Comedy", "Horror"] }).genre).toBe("Comedy");
  });
});

describe("hasActiveFilters", () => {
  it("is false for a pristine view", () => {
    expect(hasActiveFilters(base)).toBe(false);
    // Type alone is the route, not a filter.
    expect(hasActiveFilters({ ...base, type: "movie" })).toBe(false);
  });

  it("is true once anything narrows the results", () => {
    expect(hasActiveFilters({ ...base, genre: "Action" })).toBe(true);
    expect(hasActiveFilters({ ...base, year: 2019 })).toBe(true);
    expect(hasActiveFilters({ ...base, sort: "oldest" })).toBe(true);
    expect(hasActiveFilters({ ...base, page: 2 })).toBe(true);
  });
});

describe("browseHref", () => {
  it("keeps a pristine URL clean", () => {
    expect(browseHref(base)).toBe("/browse");
    expect(browseHref({ ...base, type: "movie" })).toBe("/movies");
    expect(browseHref({ ...base, type: "tv" })).toBe("/tv-shows");
  });

  it("routes by content type instead of passing type as a param", () => {
    expect(browseHref(base, { type: "tv" })).toBe("/tv-shows");
    expect(browseHref({ ...base, type: "movie" }, { type: "all" })).toBe("/browse");
  });

  it("emits only non-default filters", () => {
    expect(browseHref(base, { genre: "Action" })).toBe("/browse?genre=Action");
    expect(browseHref(base, { year: 2024 })).toBe("/browse?year=2024");
    expect(browseHref(base, { sort: "latest" })).toBe("/browse?sort=latest");
    expect(browseHref(base, { sort: DEFAULT_SORT })).toBe("/browse");
  });

  it("carries the surviving filters through a change", () => {
    const filters: BrowseFilters = {
      type: "movie",
      genre: "Drama",
      provider: null,
      year: 2020,
      sort: "rating",
      industry: DEFAULT_INDUSTRY,
      page: 1,
    };
    expect(browseHref(filters, { year: null })).toBe("/movies?genre=Drama&sort=rating");
  });

  it("resets paging on a filter change but preserves an explicit page", () => {
    const onPage4: BrowseFilters = { ...base, genre: "Action", page: 4 };
    expect(browseHref(onPage4, { genre: "Comedy" })).toBe("/browse?genre=Comedy");
    expect(browseHref(onPage4, { page: 5 })).toBe("/browse?genre=Action&page=5");
    expect(browseHref(onPage4, { page: 1 })).toBe("/browse?genre=Action");
  });

  it("escapes a genre that needs it", () => {
    expect(browseHref(base, { genre: "Sci-Fi & Fantasy" })).toBe(
      "/browse?genre=Sci-Fi+%26+Fantasy"
    );
  });
});

describe("labels and routes", () => {
  it("maps a type to its route", () => {
    expect(browsePathFor("all")).toBe("/browse");
    expect(browsePathFor("movie")).toBe("/movies");
    expect(browsePathFor("tv")).toBe("/tv-shows");
  });

});

describe("industry toggle", () => {
  it("defaults to Hollywood and accepts the bollywood param", () => {
    expect(parseBrowseFilters({}).industry).toBe("hollywood");
    expect(parseBrowseFilters({ industry: "bollywood" }).industry).toBe("bollywood");
    expect(parseBrowseFilters({ industry: "nonsense" }).industry).toBe("hollywood");
  });

  it("serializes only when off the default and participates in hasActiveFilters", () => {
    expect(browseHref(base)).toBe("/browse");
    expect(browseHref(base, { industry: "bollywood" })).toBe("/browse?industry=bollywood");
    expect(hasActiveFilters(base)).toBe(false);
    expect(hasActiveFilters({ ...base, industry: "bollywood" })).toBe(true);
  });
});
