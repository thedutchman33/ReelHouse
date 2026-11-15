import { describe, expect, it } from "vitest";
import {
  resumeQueryParam,
  withResumePosition,
} from "@/lib/playback/resume";

// ---------------------------------------------------------------------------
// Resume-by-URL.
//
// The provider's player owns the picture, so the only way to start it at the
// saved position is to tell it in the URL it is loaded with. Only documented
// parameters are used, and only for documented hosts.
// ---------------------------------------------------------------------------

describe("resumeQueryParam", () => {
  it("knows Videasy's documented parameter, including the www redirect", () => {
    expect(resumeQueryParam("https://vidy.st/tv/84773/3/4")).toBe("progress");
    expect(resumeQueryParam("https://www.vidy.st/movie/550")).toBe("progress");
  });

  it("returns null for everything else", () => {
    expect(resumeQueryParam("https://vidly.pro/tv/84773/3/4")).toBeNull();
    expect(resumeQueryParam("/media/mock-embed/player.html")).toBeNull();
    expect(resumeQueryParam(undefined)).toBeNull();
    expect(resumeQueryParam("not a url")).toBeNull();
  });
});

describe("withResumePosition", () => {
  it("appends the position in seconds", () => {
    expect(withResumePosition("https://vidy.st/tv/84773/3/4", 1320)).toBe(
      "https://vidy.st/tv/84773/3/4?progress=1320"
    );
    expect(withResumePosition("https://www.vidy.st/movie/550", 90.9)).toBe(
      "https://www.vidy.st/movie/550?progress=90"
    );
  });

  it("preserves query parameters the template already had", () => {
    expect(
      withResumePosition("https://vidy.st/tv/84773/3/4?autoplay=1", 60)
    ).toBe("https://vidy.st/tv/84773/3/4?autoplay=1&progress=60");
  });

  it("leaves the URL untouched when resuming makes no sense", () => {
    const url = "https://vidy.st/tv/84773/3/4";
    expect(withResumePosition(url, null)).toBe(url);
    expect(withResumePosition(url, 0)).toBe(url);
    expect(withResumePosition(url, -5)).toBe(url);
    expect(withResumePosition(url, Number.NaN)).toBe(url);
  });

  it("never adds a parameter to an undocumented host", () => {
    const url = "https://vidly.pro/tv/84773/3/4";
    expect(withResumePosition(url, 600)).toBe(url);
  });
});
