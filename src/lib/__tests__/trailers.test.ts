import { describe, expect, it } from "vitest";
import {
  ALL_TRAILER_TOPICS,
  TRAILERS_PER_PAGE,
  fallbackTrailerFeed,
  filterTrailerItems,
  detailTrailerOptions,
  isFullTrailerVideo,
  parseTrailerKind,
  parseTrailerPage,
  pickDetailTrailerOptions,
  pickFullTrailerVideo,
  sortTrailersNewest,
  trailerHref,
} from "@/lib/trailers";

describe("trailer feed helpers", () => {
  it("parses the feed kind from matching aliases", () => {
    expect(parseTrailerKind(undefined)).toBe("all");
    expect(parseTrailerKind("movie")).toBe("movie");
    expect(parseTrailerKind(["movies"])).toBe("movie");
    expect(parseTrailerKind("series")).toBe("tv");
    expect(parseTrailerKind("SHOW")).toBe("tv");
    expect(parseTrailerKind("anime")).toBe("all");
  });

  it("keeps page numbers positive and bounded", () => {
    expect(parseTrailerPage(undefined)).toBe(1);
    expect(parseTrailerPage("0")).toBe(1);
    expect(parseTrailerPage("-4")).toBe(1);
    expect(parseTrailerPage("3.5")).toBe(1);
    expect(parseTrailerPage("3")).toBe(3);
    expect(parseTrailerPage("9999", 40)).toBe(40);
  });

  it("omits default values from feed URLs", () => {
    expect(trailerHref("all")).toBe("/trailers");
    expect(trailerHref("movie")).toBe("/trailers?type=movie");
    expect(trailerHref("all", 2)).toBe("/trailers?page=2");
    expect(trailerHref("tv", 4)).toBe("/trailers?type=tv&page=4");
  });

  it("returns a mixed fallback feed with real playable entries", () => {
    const feed = fallbackTrailerFeed("all");
    expect(feed.items).toHaveLength(TRAILERS_PER_PAGE);
    expect(feed.items.some((item) => item.type === "movie")).toBe(true);
    expect(feed.items.some((item) => item.type === "tv")).toBe(true);
    expect(feed.items.every((item) => item.youtubeKey.length === 11)).toBe(true);
    expect(feed.items.every((item) => item.detailHref === undefined)).toBe(true);
  });

  it("filters the fallback feed by media type", () => {
    const movies = fallbackTrailerFeed("movie");
    const series = fallbackTrailerFeed("tv");
    expect(movies.items.length).toBeGreaterThan(0);
    expect(series.items.length).toBeGreaterThan(0);
    expect(movies.items.every((item) => item.type === "movie")).toBe(true);
    expect(series.items.every((item) => item.type === "tv")).toBe(true);
  });

  it("filters trailers by OR topics and an inline search query", () => {
    const items = fallbackTrailerFeed("all").items;

    expect(filterTrailerItems(items, ALL_TRAILER_TOPICS)).toHaveLength(
      items.length
    );
    expect(
      filterTrailerItems(items, ["movie"]).every(
        (item) => item.type === "movie"
      )
    ).toBe(true);
    expect(
      filterTrailerItems(items, ["tv"]).every((item) => item.type === "tv")
    ).toBe(true);
    const anime = filterTrailerItems(items, ["anime"]);
    expect(anime.length).toBeGreaterThan(0);
    expect(
      anime.every((item) => item.genres.includes("Animation"))
    ).toBe(true);
    expect(
      filterTrailerItems(items, ["official"]).every((item) => item.official)
    ).toBe(true);
    expect(
      items.every((item) => /trailer/i.test(item.trailerName))
    ).toBe(true);

    const searched = filterTrailerItems(items, ALL_TRAILER_TOPICS, "dune");
    expect(searched).toHaveLength(1);
    expect(searched[0].title).toBe("Dune: Part Two");
    expect(filterTrailerItems(items, ALL_TRAILER_TOPICS, "no such reel")).toEqual(
      []
    );
    expect(filterTrailerItems(items, [])).toEqual([]);
  });

  it("pages the fallback feed without repeating entries", () => {
    const first = fallbackTrailerFeed("all", 1);
    const second = fallbackTrailerFeed("all", 2);
    expect(first.totalPages).toBe(2);
    expect(second.items.length).toBeGreaterThan(0);
    expect(first.items.some((item) => second.items.some((next) => next.id === item.id))).toBe(false);
    expect(first.page).toBe(1);
    expect(second.page).toBe(2);
  });

  it("accepts only studio-official full trailers", () => {
    const trailer = {
      key: "Wb8Tq_HD4E8",
      site: "YouTube",
      type: "Trailer",
      name: "Final Trailer",
      official: true,
    };
    expect(isFullTrailerVideo(trailer)).toBe(true);
    // A quote-captioned promo is a Short, not a trailer.
    expect(
      isFullTrailerVideo({
        ...trailer,
        name: "To me, my X-Men.",
      })
    ).toBe(false);
    expect(isFullTrailerVideo({ ...trailer, type: "Teaser" })).toBe(false);
    expect(isFullTrailerVideo({ ...trailer, official: false })).toBe(false);
    expect(
      isFullTrailerVideo({ ...trailer, name: "Official Teaser Trailer" })
    ).toBe(false);
    expect(
      isFullTrailerVideo({ ...trailer, name: "Official Featurette" })
    ).toBe(false);
    expect(isFullTrailerVideo({ ...trailer, site: "Vimeo" })).toBe(false);
    expect(isFullTrailerVideo({ ...trailer, key: "short" })).toBe(false);
  });

  it("picks the flagship full trailer and skips promo-only titles", () => {
    const pick = pickFullTrailerVideo([
      {
        key: "irVNGjRFZGk",
        site: "YouTube",
        type: "Teaser",
        name: "Official Teaser",
        official: true,
        published_at: "2026-11-20T12:00:00.000Z",
      },
      {
        key: "Wb8Tq_HD4E8",
        site: "YouTube",
        type: "Trailer",
        name: "Final Trailer",
        official: true,
        published_at: "2026-11-10T12:00:00.000Z",
      },
      {
        key: "vyISuWUWcFs",
        site: "YouTube",
        type: "Trailer",
        name: "Trailer",
        official: true,
        published_at: "2026-11-22T12:00:00.000Z",
      },
    ]);
    expect(pick?.key).toBe("Wb8Tq_HD4E8");

    expect(
      pickFullTrailerVideo([
        {
          key: "Di310WS8zLk",
          site: "YouTube",
          type: "Teaser",
          name: "Official Teaser",
          official: true,
        },
      ])
    ).toBeUndefined();
  });

  it("builds detail options from official trailers and teasers, newest first", () => {
    const options = pickDetailTrailerOptions([
      {
        key: "X1aFkAkFASk",
        site: "YouTube",
        type: "Teaser",
        name: "Teaser 1",
        official: true,
        published_at: "2026-07-01T12:00:00.000Z",
      },
      {
        key: "Wb8Tq_HD4E8",
        site: "YouTube",
        type: "Trailer",
        name: "Final Trailer",
        official: true,
        published_at: "2026-11-23T19:30:00.000Z",
      },
      {
        key: "irVNGjRFZGk",
        site: "YouTube",
        type: "Clip",
        name: "Clip",
        official: true,
        published_at: "2026-11-24T12:00:00.000Z",
      },
    ]);

    expect(options).toEqual([
      { key: "Wb8Tq_HD4E8", name: "Final Trailer" },
      { key: "X1aFkAkFASk", name: "Teaser 1" },
    ]);
  });

  it("prefers Moctale's curated trailer list over TMDB", () => {
    const media = {
      trailerKey: "pWdt8WMCqnc",
      trailerName: "Official Trailer",
    };

    expect(
      detailTrailerOptions(media, [
        { key: "T6fXf4PmVVc", caption: "Date Announcement" },
        { key: "pWdt8WMCqnc", caption: "Trailer" },
      ])
    ).toEqual([
      { key: "pWdt8WMCqnc", name: "Trailer" },
      { key: "T6fXf4PmVVc", name: "Date Announcement" },
    ]);

    expect(detailTrailerOptions(media, [{ key: "broken", caption: "Nope" }]))
      .toEqual([{ key: "pWdt8WMCqnc", name: "Official Trailer" }]);
    expect(detailTrailerOptions({}, [])).toEqual([]);
  });

  it("sorts the feed by the trailer's published timestamp, newest first", () => {
    const [first, second, third] = fallbackTrailerFeed("all").items;
    const sorted = sortTrailersNewest([
      { ...first, publishedAt: "2026-08-01T12:00:00.000Z" },
      { ...second, publishedAt: "2026-11-23T18:00:00.000Z" },
      { ...third, publishedAt: "2026-10-10T08:30:00.000Z" },
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      second.id,
      third.id,
      first.id,
    ]);
  });
});
