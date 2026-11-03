import { describe, expect, it } from "vitest";
import { parseF1RaceCards } from "@/lib/live-posters";

// The hero's F1 poster is read from formula1.com's calendar markup. These tests
// pin the card contract: the round label and the race-card image must come from
// the same anchor, and the image is upgraded to the hero-size rung.

function card(round: number, slug: string, width = 720) {
  return (
    `<a class="group/schedule-card" href="/en/racing/2026/${slug}">` +
    `<img src="https://media.formula1.com/image/upload/c_lfill,w_${width}/q_auto/v1/fom-website/static-assets/2026/races/card/${slug}.webp"/>` +
    `<span>ROUND ${round}</span>` +
    `</a>`
  );
}

describe("parseF1RaceCards", () => {
  it("maps each round to its official race-card artwork", () => {
    const cards = parseF1RaceCards(
      `<nav><a href="/en/racing/2026/mexico">Mexico</a></nav>` +
        card(19, "mexico") +
        card(20, "brazil", 1296)
    );
    expect([...cards.keys()]).toEqual([19, 20]);
    expect(cards.get(19)).toContain("races/card/mexico.webp");
    expect(cards.get(19)).toContain(",w_1296");
    expect(cards.get(20)).toContain("races/card/brazil.webp");
  });

  it("ignores anchors without both a round and artwork", () => {
    const cards = parseF1RaceCards(
      `<a href="/en/racing/2026/mexico"><span>ROUND 19</span></a>` +
        `<a class="group/schedule-card" href="/en/racing/2026/brazil"><span>ROUND 20</span></a>`
    );
    expect(cards.size).toBe(0);
  });
});
