import { describe, it, expect } from "vitest";
import {
  mediaId,
  parseMediaId,
  yearOf,
  formatRating,
  formatRuntime,
  clamp,
  placeholderArt,
} from "@/lib/utils";
import type { MediaType } from "@/types";

describe("mediaId / parseMediaId", () => {
  it("builds the internal id from type + tmdb id", () => {
    expect(mediaId("movie", 603)).toBe("movie-603");
    expect(mediaId("tv", 1399)).toBe("tv-1399");
  });

  it("round-trips id → parse → id for both media types", () => {
    const cases: Array<[MediaType, number]> = [
      ["movie", 603],
      ["tv", 1399],
      ["movie", 0],
    ];
    for (const [type, tmdbId] of cases) {
      expect(parseMediaId(mediaId(type, tmdbId))).toEqual({ type, tmdbId });
    }
  });

  it("parses leading-zero ids numerically", () => {
    expect(parseMediaId("movie-007")).toEqual({ type: "movie", tmdbId: 7 });
  });

  it("returns null for malformed ids", () => {
    for (const bad of ["", "movie-", "show-1", "movie-abc", "movie-1.5", "603", "tv_1399"]) {
      expect(parseMediaId(bad)).toBeNull();
    }
  });
});

describe("yearOf", () => {
  it("extracts a 4-digit year", () => {
    expect(yearOf("2010-07-16")).toBe("2010");
    expect(yearOf("1999")).toBe("1999");
  });

  it("returns empty string for missing or non-4-digit input", () => {
    expect(yearOf(undefined)).toBe("");
    expect(yearOf("")).toBe("");
    expect(yearOf("20")).toBe("");
    expect(yearOf("abcd-01-01")).toBe("");
  });
});

describe("formatRating", () => {
  it("formats a positive rating to one decimal", () => {
    expect(formatRating(7)).toBe("7.0");
    expect(formatRating(7.6)).toBe("7.6");
    expect(formatRating(8.267)).toBe("8.3");
  });

  it("returns null for null/undefined/NaN/non-positive", () => {
    expect(formatRating(undefined)).toBeNull();
    expect(formatRating(Number.NaN)).toBeNull();
    expect(formatRating(0)).toBeNull();
    expect(formatRating(-1)).toBeNull();
  });
});

describe("formatRuntime", () => {
  it("formats minutes into h/m at the boundaries", () => {
    expect(formatRuntime(45)).toBe("45m");
    expect(formatRuntime(59)).toBe("59m");
    expect(formatRuntime(60)).toBe("1h");
    expect(formatRuntime(90)).toBe("1h 30m");
    expect(formatRuntime(125)).toBe("2h 5m");
  });

  it("returns null for falsy/non-positive", () => {
    expect(formatRuntime(undefined)).toBeNull();
    expect(formatRuntime(0)).toBeNull();
    expect(formatRuntime(-5)).toBeNull();
  });
});

describe("clamp", () => {
  it("clamps to the inclusive range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(0, 0, 0)).toBe(0);
  });
});

describe("placeholderArt", () => {
  it("is a deterministic svg data URI", () => {
    const a = placeholderArt({ title: "Blade Runner" });
    const b = placeholderArt({ title: "Blade Runner" });
    expect(a).toBe(b);
    expect(a.startsWith("data:image/svg+xml;utf8,")).toBe(true);
  });

  it("differs by title and by variant", () => {
    expect(placeholderArt({ title: "A" })).not.toBe(placeholderArt({ title: "B" }));
    expect(placeholderArt({ title: "A", variant: "poster" })).not.toBe(
      placeholderArt({ title: "A", variant: "backdrop" })
    );
  });
});
