import { describe, expect, it } from "vitest";
import {
  browseHref,
  browsePathFor,
  countActiveFilters,
  DEFAULT_INDUSTRY,
  DEFAULT_SORT,
  hasActiveFilters,
  parseBrowseFilters,
  searchParamsToRecord,
  type BrowseFilters,
} from "@/lib/browse";

// The browse filter model is the single URL contract shared by /browse, /movies
// and /tv-shows plus the client filter bar. These tests pin that contract: what a
// URL parses to, and what a filter change links to.

const base: BrowseFilters = {
  type: "all",
  genres: [],
  provider: null,
  year: null,
  sort: DEFAULT_SORT,
  industry: DEFAULT_INDUSTRY,
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

function recordFromHref(href: string) {
  return searchParamsToRecord(new URL(href, "http://x").searchParams);
}

describe("parseBrowseFilters", () => {
  it("defaults everything when no params are present", () => {
    expect(parseBrowseFilters({})).toEqual(base);
  });

  it("reads type, genres, provider, year, sort and page", () => {
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
      genres: ["Drama"],
      provider: 8,
      year: 2021,
      sort: "rating",
      industry: "hollywood",
      decade: null,
      ageRating: null,
      duration: null,
      language: null,
      hideAnime: false,
      select: false,
      family: false,
      award: false,
      page: 3,
    });
    // Non-numeric / non-positive provider values fall back to "all".
    expect(parseBrowseFilters({ provider: "abc" }).provider).toBeNull();
    expect(parseBrowseFilters({ provider: "-4" }).provider).toBeNull();
  });

  it("collects repeated and comma-separated genre picks", () => {
    expect(parseBrowseFilters({ genre: ["Comedy", "Horror"] }).genres).toEqual([
      "Comedy",
      "Horror",
    ]);
    expect(parseBrowseFilters({ genre: "Action, Drama" }).genres).toEqual([
      "Action",
      "Drama",
    ]);
    expect(parseBrowseFilters({ genre: ["Action,Drama", "Action"] }).genres).toEqual([
      "Action",
      "Drama",
    ]);
  });

  it("keeps repeated query keys when building the filter record", () => {
    const params = new URLSearchParams(
      "genre=Action&genre=Comedy&year=2024&provider=8"
    );
    expect(searchParamsToRecord(params)).toEqual({
      genre: ["Action", "Comedy"],
      year: "2024",
      provider: "8",
    });
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

  it("normalizes the legacy latest sort to recent releases", () => {
    expect(parseBrowseFilters({ sort: "latest" }).sort).toBe("recent");
  });

  it("rejects nonsense years and blank genres", () => {
    expect(parseBrowseFilters({ year: "banana" }).year).toBeNull();
    expect(parseBrowseFilters({ year: "1200" }).year).toBeNull();
    expect(parseBrowseFilters({ year: "2020.5" }).year).toBeNull();
    expect(parseBrowseFilters({ genre: "   " }).genres).toEqual([]);
  });

  it("clamps paging to the range the sources support", () => {
    expect(parseBrowseFilters({ page: "0" }).page).toBe(1);
    expect(parseBrowseFilters({ page: "-4" }).page).toBe(1);
    expect(parseBrowseFilters({ page: "9999" }).page).toBe(500);
  });
});

describe("hasActiveFilters", () => {
  it("is false for a pristine view", () => {
    expect(hasActiveFilters(base)).toBe(false);
    // Type alone is the route, not a filter.
    expect(hasActiveFilters({ ...base, type: "movie" })).toBe(false);
  });

  it("is true once anything narrows the results", () => {
    expect(hasActiveFilters({ ...base, genres: ["Action"] })).toBe(true);
    expect(hasActiveFilters({ ...base, year: 2019 })).toBe(true);
    expect(hasActiveFilters({ ...base, sort: "oldest" })).toBe(true);
    expect(hasActiveFilters({ ...base, page: 2 })).toBe(true);
  });

  it("counts every narrowing control for the panel badge", () => {
    expect(countActiveFilters(base)).toBe(0);
    expect(
      countActiveFilters({
        ...base,
        genres: ["Drama", "Comedy"],
        provider: 8,
        decade: 2010,
        ageRating: "teen",
        duration: "standard",
        language: "en",
        hideAnime: true,
        select: true,
        family: true,
        award: true,
      })
    ).toBe(11);
    // Paging alone is not a filter control.
    expect(countActiveFilters({ ...base, page: 4 })).toBe(0);
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
    expect(browseHref(base, { genres: ["Action"] })).toBe("/browse?genre=Action");
    expect(browseHref(base, { genres: ["Action", "Comedy"] })).toBe(
      "/browse?genre=Action&genre=Comedy"
    );
    expect(browseHref(base, { year: 2024 })).toBe("/browse?year=2024");
    expect(browseHref(base, { sort: "popularity" })).toBe("/browse?sort=popularity");
    expect(browseHref(base, { sort: DEFAULT_SORT })).toBe("/browse");
  });

  it("carries the surviving filters through a change", () => {
    const filters: BrowseFilters = {
      ...base,
      type: "movie",
      genres: ["Drama"],
      year: 2020,
      sort: "rating",
    };
    expect(browseHref(filters, { year: null })).toBe("/movies?genre=Drama&sort=rating");
  });

  it("resets paging on a filter change but preserves an explicit page", () => {
    const onPage4: BrowseFilters = { ...base, genres: ["Action"], page: 4 };
    expect(browseHref(onPage4, { genres: ["Comedy"] })).toBe("/browse?genre=Comedy");
    expect(browseHref(onPage4, { page: 5 })).toBe("/browse?genre=Action&page=5");
    expect(browseHref(onPage4, { page: 1 })).toBe("/browse?genre=Action");
  });

  it("escapes a genre that needs it", () => {
    expect(browseHref(base, { genres: ["Sci-Fi & Fantasy"] })).toBe(
      "/browse?genre=Sci-Fi+%26+Fantasy"
    );
  });
});

describe("browse panel filters", () => {
  it("parses decade, age, duration and language", () => {
    expect(
      parseBrowseFilters({
        decade: "2010",
        age: "kids",
        duration: "standard",
        language: "hi",
        hide_anime: "1",
        select: "1",
        family: "1",
        award: "1",
      })
    ).toEqual({
      ...base,
      decade: 2010,
      ageRating: "kids",
      duration: "standard",
      language: "hi",
      hideAnime: true,
      select: true,
      family: true,
      award: true,
    });
  });

  it("ignores values the panel never offers", () => {
    expect(parseBrowseFilters({ decade: "2005" }).decade).toBeNull();
    expect(parseBrowseFilters({ age: "unrated" }).ageRating).toBeNull();
    expect(parseBrowseFilters({ duration: "forever" }).duration).toBeNull();
    expect(parseBrowseFilters({ language: "klingon" }).language).toBeNull();
  });

  it("lets an exact year win over the decade band", () => {
    const parsed = parseBrowseFilters({ year: "2014", decade: "2010" });
    expect(parsed.year).toBe(2014);
    expect(parsed.decade).toBeNull();
  });

  it("serializes the filters and round-trips them", () => {
    const filters: BrowseFilters = {
      ...base,
      genres: ["Action", "Comedy"],
      decade: 1990,
      ageRating: "mature",
      duration: "epic",
      language: "ta",
      hideAnime: true,
      select: true,
      family: true,
      award: true,
    };
    const href = browseHref(base, filters);
    expect(href).toBe(
      "/browse?genre=Action&genre=Comedy&decade=1990&age=mature&duration=epic&language=ta&hide_anime=1&select=1&family=1&award=1"
    );
    expect(parseBrowseFilters(recordFromHref(href))).toEqual(filters);
  });

  it("drops the decade from the URL when an exact year is set", () => {
    expect(browseHref(base, { year: 1999, decade: 1990 })).toBe("/browse?year=1999");
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
