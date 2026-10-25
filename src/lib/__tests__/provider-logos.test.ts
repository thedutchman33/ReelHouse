import { describe, it, expect } from "vitest";
import { dedupeByFamily, familyFor, sortProviders, wordmarkFor } from "@/lib/provider-logos";

// The provider family system: one card per brand, flagship resolution, and
// the operator's priority order. These rules guard the homepage rail, the
// providers directory and the Source dropdown — all three collapsed into the
// wrong provider twice before these tests existed.

describe("familyFor", () => {
  it("maps variants onto their brand family", () => {
    expect(familyFor("Netflix Kids")).toBe("netflix");
    // the family key is "max" — "HBO Max" and its reseller both land there
    expect(familyFor("HBO Max Amazon Channel")).toBe("max");
    expect(familyFor("HBO Max")).toBe("max");
    expect(familyFor("Amazon Prime Video")).toBe("prime video");
    expect(familyFor("DisneyNOW")).toBe("disney");
    // the family key is "hotstar" — the current and legacy names both land
    // there instead of collapsing into the Disney family
    expect(familyFor("JioHotstar")).toBe("hotstar");
    expect(familyFor("Disney+ Hotstar")).toBe("hotstar");
  });
});

describe("wordmarkFor", () => {
  it("covers the Disney+ brand but not sibling services", () => {
    expect(wordmarkFor("Disney Plus")).toBeTruthy();
    expect(wordmarkFor("Disney+")).toBeTruthy();
    expect(wordmarkFor("DisneyNOW")).toBeNull();
  });

  it("matches Hotstar ahead of the Disney pattern", () => {
    // "Disney+ Hotstar" contains "disney+" — the Hotstar entry must win.
    expect(wordmarkFor("Disney+ Hotstar")).toBe("/provider-logos/jio-hotstar.png");
    expect(wordmarkFor("JioHotstar")).toBe("/provider-logos/jio-hotstar.png");
  });
});

describe("dedupeByFamily", () => {
  it("collapses variants to one entry per family", () => {
    const out = dedupeByFamily([
      { name: "Netflix" },
      { name: "Netflix Kids" },
      { name: "HBO Max" },
      { name: "HBO Max Amazon Channel" },
    ]);
    expect(out.map((p) => p.name)).toEqual(["Netflix", "HBO Max"]);
  });

  it("prefers the wordmark-backed brand name over a shorter variant", () => {
    // Regression: "DisneyNOW" is shorter than "Disney Plus" and used to win
    // the shortest-name tiebreak, replacing the real brand in the dropdown.
    const out = dedupeByFamily([{ name: "Disney Plus" }, { name: "DisneyNOW" }]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Disney Plus");
  });

  it("prefers the flagship even when it sorts later in the source list", () => {
    // TMDB ordering is not stable — the flagship can arrive after a reseller.
    const out = dedupeByFamily([
      { name: "HBO Max Amazon Channel" },
      { name: "HBO Max" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("HBO Max");
  });

  it("drops providers outside every family (dedupe is family-scoped)", () => {
    // Non-family entries are excluded by design — the callers' wordmark filter
    // and the family rails decide what else appears.
    const out = dedupeByFamily([
      { name: "Some Long Service Name Channel" },
      { name: "Some Service" },
    ]);
    expect(out).toEqual([]);
  });
});

describe("sortProviders", () => {
  it("orders by the operator's family priority", () => {
    const out = sortProviders([
      { name: "HBO Max" },
      { name: "Netflix" },
      { name: "Hulu" },
    ]);
    expect(out.map((p) => p.name)).toEqual(["Netflix", "HBO Max", "Hulu"]);
  });

  it("pins JioHotstar between Prime Video and Disney Plus", () => {
    // Operator-requested rail position (pass: "add jio hotstar between prime
    // video and disney plus").
    const out = sortProviders([
      { name: "Disney Plus" },
      { name: "Netflix" },
      { name: "JioHotstar" },
      { name: "Amazon Prime Video" },
    ]);
    expect(out.map((p) => p.name)).toEqual([
      "Netflix",
      "Amazon Prime Video",
      "JioHotstar",
      "Disney Plus",
    ]);
  });
});
