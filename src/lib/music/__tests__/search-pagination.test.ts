import { describe, expect, it } from "vitest";
import { nextSearchPagination } from "../search-pagination";
import { mergeSearchResults } from "../search-merge";
import type { MusicSearchResults, MusicTrack } from "../types";

function track(id: string): MusicTrack {
  return {
    id,
    title: id,
    artistId: "artist",
    artistName: "Artist",
    duration: 120,
  };
}

describe("provider-aware search pagination", () => {
  it("advances both provider cursors together on the first page", () => {
    const page = nextSearchPagination({
      limit: 10,
      audiusLimit: 10,
      jamendoOffset: 0,
      audiusCount: 10,
      jamendoCount: 10,
    });
    expect(page.hasMore).toBe(true);
    expect(page.next).toEqual({ audiusLimit: 20, jamendoOffset: 10 });
    expect(page.offset).toBe(0);
  });

  it("stops Audius at its 30-result ceiling but can keep paging Jamendo", () => {
    const page = nextSearchPagination({
      limit: 10,
      audiusLimit: 30,
      jamendoOffset: 20,
      audiusCount: 30,
      jamendoCount: 10,
    });
    expect(page.next).toEqual({ audiusLimit: 30, jamendoOffset: 30 });
  });

  it("ends pagination when both providers are exhausted", () => {
    const page = nextSearchPagination({
      limit: 10,
      audiusLimit: 30,
      jamendoOffset: 40,
      audiusCount: 8,
      jamendoCount: 0,
    });
    expect(page.hasMore).toBe(false);
    expect(page.next).toBeUndefined();
  });
});

describe("search page merging", () => {
  it("appends new records without repeating any category", () => {
    const first: MusicSearchResults = {
      tracks: [track("a"), track("b")],
      artists: [],
      albums: [],
      playlists: [],
      providers: ["audius"],
      pagination: {
        offset: 0,
        limit: 10,
        hasMore: true,
        next: { audiusLimit: 20, jamendoOffset: 10 },
      },
    };
    const second: MusicSearchResults = {
      tracks: [track("b"), track("c")],
      artists: [],
      albums: [],
      playlists: [],
      providers: ["audius", "jamendo"],
      pagination: {
        offset: 10,
        limit: 10,
        hasMore: false,
      },
    };
    const merged = mergeSearchResults(first, second);
    expect(merged.tracks.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(merged.providers).toEqual(["audius", "jamendo"]);
    expect(merged.pagination?.hasMore).toBe(false);
  });
});
