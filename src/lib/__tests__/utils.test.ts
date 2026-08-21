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

  // The `type` branch adds a second <text> element and was previously never
  // exercised — every existing case omitted `type`, so a malformed tag or a
  // broken hsl() in that branch would have shipped invisibly (the whole data
  // URI silently fails to render when the SVG does not parse).
  it("emits well-formed markup with a kind label for both types", () => {
    for (const [type, label] of [["movie", "FILM"], ["tv", "SERIES"]] as const) {
      const uri = placeholderArt({ title: "Blade Runner", type });
      expect(uri.startsWith("data:image/svg+xml;utf8,")).toBe(true);

      const svg = decodeSvg(uri);
      expect(svg).toContain(`>${label}</text>`);
      // Two <text> elements, each properly opened and closed.
      expect(svg.match(/<text\b/g)).toHaveLength(2);
      expect(svg.match(/<\/text>/g)).toHaveLength(2);
      expectWellFormed(svg);
      // Every hsl() that carries an alpha must separate it with `/`; the class
      // excludes `/` so a correct `hsl(h s% l% / .7)` cannot match and only a
      // missing separator does.
      expect(svg).not.toMatch(/hsl\([^)/]*\s\d?\.\d+\)/);
    }
  });

  it("omits the kind label when no type is given", () => {
    const svg = decodeSvg(placeholderArt({ title: "Blade Runner" }));
    expect(svg.match(/<text\b/g)).toHaveLength(1);
    expect(svg).not.toContain("FILM");
    expect(svg).not.toContain("SERIES");
    expectWellFormed(svg);
  });

  it("escapes XML-significant characters in the title", () => {
    const svg = decodeSvg(placeholderArt({ title: `Tom & "Jerry" <b>`, type: "movie" }));
    expect(svg).toContain("&amp;");
    expect(svg).not.toMatch(/<b>/);
    expectWellFormed(svg);
  });
});

const SVG_PREFIX = "data:image/svg+xml;utf8,";

function decodeSvg(uri: string): string {
  return decodeURIComponent(uri.slice(SVG_PREFIX.length));
}

/**
 * Structural well-formedness checks that do not need a DOM (this suite runs in
 * the `node` environment). These target the ways a template-literal-built SVG
 * actually breaks: a stray escape sequence swallowing a `/`, an unbalanced tag,
 * or a raw `<` that is not the start of a tag — any of which makes the browser
 * discard the whole data URI and render nothing.
 */
function expectWellFormed(svg: string): void {
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  // No backslash escapes leaking into the markup.
  expect(svg).not.toContain("\\");
  // No literal tab/newline immediately after a `<` — the signature of a `<\t…>`
  // style typo where an intended `</tag>` lost its slash to an escape sequence.
  expect(svg).not.toMatch(/<[\s]/);
  // Opening tags (excluding self-closing and the closing ones) must balance the
  // closing tags.
  const opens = svg.match(/<[a-zA-Z][^>]*>/g) ?? [];
  const selfClosing = opens.filter((t) => t.endsWith("/>")).length;
  const closes = svg.match(/<\/[a-zA-Z][^>]*>/g) ?? [];
  expect(opens.length - selfClosing).toBe(closes.length);
}
