import { describe, expect, it } from "vitest";
import type { MusicTrack } from "../types";
import {
  buildMixes,
  colorFor,
  dedupeTracks,
  formatDuration,
  formatPlayCount,
  formatTotalDuration,
  matchesText,
  tracksForCategory,
} from "../utils";
import { activeLyricIndex, parseLrc } from "../lrc";

function track(id: string, title: string, genre = "Electronic"): MusicTrack {
  return {
    id,
    title,
    artistId: "artist",
    artistName: "Artist",
    albumTitle: "Album",
    duration: 180,
    genre,
  };
}

describe("music formatting", () => {
  it("formats seconds, long tracks and totals", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5.9)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(null)).toBe("0:00");
    expect(formatTotalDuration(65)).toBe("1 min");
    expect(formatTotalDuration(3725)).toBe("1 hr 2 min");
  });

  it("abbreviates play counts without rounding whole values oddly", () => {
    expect(formatPlayCount(0)).toBe("0 plays");
    expect(formatPlayCount(1)).toBe("1 play");
    expect(formatPlayCount(1234)).toBe("1.2K plays");
    expect(formatPlayCount(1_000_000)).toBe("1M plays");
    expect(formatPlayCount(2_250_000_000)).toBe("2.3B plays");
  });
});

describe("music discovery helpers", () => {
  it("deduplicates by track id and keeps stable colours", () => {
    expect(dedupeTracks([track("a", "One"), track("a", "One again")])).toHaveLength(1);
    expect(colorFor("mix-electronic")).toBe(colorFor("mix-electronic"));
    expect(colorFor("one")).not.toBe(colorFor("two"));
  });

  it("matches a category nickname and builds genre mixes", () => {
    const hipHop = { id: "hip-hop-rap", title: "Hip-Hop", color: "#000" };
    const tracks = [
      track("a", "Rap one", "Hip-Hop/Rap"),
      track("b", "House one", "House"),
      track("c", "Rap two", "Rap"),
      track("d", "Rap three", "Hip-Hop/Rap"),
    ];
    expect(tracksForCategory(tracks, hipHop).map((item) => item.id)).toEqual(["a", "c", "d"]);
    const mixes = buildMixes([...tracks, track("e", "Rap four", "Rap"), track("f", "Rap five", "Rap")]);
    // Genres split on "/", so Hip-Hop/Rap lands in the Hip-Hop bucket while
    // plain Rap forms its own three-track mix.
    expect(mixes[0]?.title).toBe("Rap Mix");
    expect(mixes[0]?.tracks.length).toBe(3);
  });

  it("searches title, artist, album, genre and mood", () => {
    expect(matchesText(track("a", "Midnight Drive"), "midnight")).toBe(true);
    expect(matchesText(track("a", "Midnight Drive"), "artist")).toBe(true);
    expect(matchesText(track("a", "Midnight Drive"), "album")).toBe(true);
    expect(matchesText(track("a", "Midnight Drive"), "electronic")).toBe(true);
    expect(matchesText(track("a", "Midnight Drive"), "jazz")).toBe(false);
  });
});

describe("synced lyrics", () => {
  it("parses multiple and fractional LRC timestamps in order", () => {
    const lines = parseLrc(
      "[00:05.00][00:10.250]Chorus\nplain line\n[00:01.50]Opening"
    );
    expect(lines).toEqual([
      { time: 1.5, text: "Opening" },
      { time: 5, text: "Chorus" },
      { time: 10.25, text: "Chorus" },
    ]);
  });

  it("finds the current line without scanning the whole song", () => {
    const lines = parseLrc("[00:01.00]One\n[00:02.00]Two\n[00:05.00]Three");
    expect(activeLyricIndex(lines, 0.5)).toBe(-1);
    expect(activeLyricIndex(lines, 2)).toBe(1);
    expect(activeLyricIndex(lines, 99)).toBe(2);
    expect(activeLyricIndex([], 2)).toBe(-1);
  });

  it("ignores malformed documents", () => {
    expect(parseLrc(null)).toEqual([]);
    expect(parseLrc("no timestamps here")).toEqual([]);
  });
});
