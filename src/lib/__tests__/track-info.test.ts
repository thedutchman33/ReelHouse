import { describe, expect, it } from "vitest";
import { parseCalendarSlugs } from "@/lib/track-info";

// The race sheet reads a round's facts from formula1.com's race page, which is
// found through the calendar's own cards. These tests pin that mapping: the
// round label and the race-page link must come from the same anchor.

function card(round: number, slug: string) {
  return (
    `<a class="group/schedule-card" href="/en/racing/2026/${slug}">` +
    `<span>ROUND ${round}</span>` +
    `</a>`
  );
}

describe("parseCalendarSlugs", () => {
  it("maps each round to its race-page slug", () => {
    const slugs = parseCalendarSlugs(
      `<nav><a href="/en/racing/2026/mexico">Mexico</a></nav>` +
        card(19, "mexico") +
        card(20, "brazil") +
        card(23, "united-arab-emirates")
    );
    expect(slugs.get(19)).toBe("mexico");
    expect(slugs.get(20)).toBe("brazil");
    expect(slugs.get(23)).toBe("united-arab-emirates");
  });

  it("ignores anchors without a round label", () => {
    const slugs = parseCalendarSlugs(
      `<a class="group/schedule-card" href="/en/racing/2026/mexico"><span>Next race</span></a>` +
        `<a class="group/schedule-card" href="/en/racing/2026/brazil"><span>Grand Prix</span></a>`
    );
    expect(slugs.size).toBe(0);
  });
});
