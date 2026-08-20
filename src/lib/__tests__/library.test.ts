import { describe, it, expect } from "vitest";
import { mergeLibrary, progressKey } from "@/lib/library";
import type { ProgressEntry } from "@/lib/library";
import type { MediaSummary } from "@/types";

// --- fixtures ---------------------------------------------------------------
// mergeLibrary only reads `.id` off watchlist items and `.key`/`.updatedAt` off
// progress entries, so the factories stay intentionally minimal (but valid).

function media(id: string): MediaSummary {
  return { id, tmdbId: 1, type: id.startsWith("tv-") ? "tv" : "movie", title: id, genres: [] };
}

function entry(key: string, updatedAt: number, position = 10): ProgressEntry {
  return { key, media: media(key), episode: null, position, duration: 100, updatedAt, completed: false };
}

function ids(items: MediaSummary[]): string[] {
  return items.map((m) => m.id);
}

describe("mergeLibrary — watchlist union by id", () => {
  it("keeps server items first, then appends local-only items", () => {
    const local = { watchlist: [media("movie-1"), media("movie-2")], progress: {} };
    const server = { watchlist: [media("movie-2"), media("movie-3")], progress: {} };

    const res = mergeLibrary(local, server, { localIsOurs: true });

    expect(ids(res.watchlist)).toEqual(["movie-2", "movie-3", "movie-1"]);
    // The push-list the caller migrates up must be exactly the local-only items.
    expect(ids(res.localOnlyWatch)).toEqual(["movie-1"]);
  });
});

describe("mergeLibrary — progress newest-updatedAt wins", () => {
  it("local newer overrides server and is queued to push; local older/equal does not", () => {
    const local = {
      watchlist: [],
      progress: {
        newer: entry("newer", 200, 222), // beats server (100)
        fresh: entry("fresh", 50), // not on server at all
        older: entry("older", 50, 222), // loses to server (100)
        tie: entry("tie", 100, 222), // equal to server → server wins (strict >)
      },
    };
    const server = {
      watchlist: [],
      progress: {
        newer: entry("newer", 100, 111),
        older: entry("older", 100, 111),
        tie: entry("tie", 100, 111),
        serveronly: entry("serveronly", 10),
      },
    };

    const res = mergeLibrary(local, server, { localIsOurs: true });

    expect(res.progress.newer.updatedAt).toBe(200);
    expect(res.progress.fresh.updatedAt).toBe(50);
    expect(res.progress.older.updatedAt).toBe(100); // server retained
    expect(res.progress.older.position).toBe(111); // server's entry, not local's
    expect(res.progress.tie.position).toBe(111); // equal updatedAt → server retained
    expect(res.progress.serveronly.updatedAt).toBe(10);

    // Only strictly-newer or brand-new local entries are pushed up (order = local key order).
    expect(res.localNewer.map((e) => e.key)).toEqual(["newer", "fresh"]);
  });
});

describe("mergeLibrary — localIsOurs=false (shared browser)", () => {
  it("ignores local data entirely and uses the server as-is", () => {
    const local = {
      watchlist: [media("movie-1")],
      progress: { x: entry("x", 999) },
    };
    const server = {
      watchlist: [media("movie-9")],
      progress: { y: entry("y", 5) },
    };

    const res = mergeLibrary(local, server, { localIsOurs: false });

    expect(ids(res.watchlist)).toEqual(["movie-9"]);
    expect(Object.keys(res.progress)).toEqual(["y"]);
    // Nothing from the previous user's local mirror may be pushed up.
    expect(res.localOnlyWatch).toEqual([]);
    expect(res.localNewer).toEqual([]);
  });
});

describe("progressKey", () => {
  it("returns the media id for a movie (no episode)", () => {
    expect(progressKey("movie-603")).toBe("movie-603");
    expect(progressKey("movie-603", null)).toBe("movie-603");
  });

  it("appends season/episode for a TV episode", () => {
    expect(progressKey("tv-1399", { seasonNumber: 2, episodeNumber: 5, title: "The Pointy End" })).toBe(
      "tv-1399:s2e5"
    );
  });
});
