import { describe, expect, it } from "vitest";
import { parseF1RaceCards, parseF1RacePoster } from "@/lib/live-posters";

// The hero's F1 poster is read from formula1.com: the calendar pairs a round
// with its race page, and that page's share image is the official 16:9 key
// visual. These tests pin both contracts — the round label and the artwork must
// come from the same calendar anchor, and only F1's own media host may be used.

function card(round: number, slug: string, width = 720) {
  return (
    `<a class="group/schedule-card" href="/en/racing/2026/${slug}">` +
    `<img src="https://media.formula1.com/image/upload/c_lfill,w_${width}/q_auto/v1/fom-website/static-assets/2026/races/card/${slug}.webp"/>` +
    `<span>ROUND ${round}</span>` +
    `</a>`
  );
}

function meta(
  property: string,
  url: string,
  order: "property-first" | "content-first"
) {
  return order === "property-first"
    ? `<meta property="${property}" content="${url}"/>`
    : `<meta content="${url}" property="${property}"/>`;
}

describe("parseF1RaceCards", () => {
  it("maps each round to its race page and official race-card artwork", () => {
    const cards = parseF1RaceCards(
      `<nav><a href="/en/racing/2026/mexico">Mexico</a></nav>` +
        card(19, "mexico") +
        card(20, "brazil", 1296)
    );
    expect([...cards.keys()]).toEqual([19, 20]);
    expect(cards.get(19)?.slug).toBe("mexico");
    expect(cards.get(19)?.cardUrl).toContain("races/card/mexico.webp");
    expect(cards.get(19)?.cardUrl).toContain(",w_1296");
    expect(cards.get(20)?.slug).toBe("brazil");
    expect(cards.get(20)?.cardUrl).toContain("races/card/brazil.webp");
  });

  it("ignores anchors without a round, a page and artwork", () => {
    const cards = parseF1RaceCards(
      `<a href="/en/racing/2026/mexico"><span>ROUND 19</span></a>` +
        `<a class="group/schedule-card" href="/en/racing/2026/brazil"><span>ROUND 20</span></a>`
    );
    expect(cards.size).toBe(0);
  });
});

describe("parseF1RacePoster", () => {
  const hero =
    "https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1/content/dam/fom-website/racehub/Las%20Vegas.webp";

  it("reads the race page's og:image in either attribute order", () => {
    expect(parseF1RacePoster(meta("og:image", hero, "property-first"))).toBe(hero);
    expect(parseF1RacePoster(meta("og:image", hero, "content-first"))).toBe(hero);
  });

  it("falls back to twitter:image and decodes HTML entities", () => {
    expect(
      parseF1RacePoster(meta("twitter:image", `${hero}?a=1&amp;b=2`, "property-first"))
    ).toBe(`${hero}?a=1&b=2`);
  });

  it("ignores images outside F1's own media host", () => {
    expect(
      parseF1RacePoster(
        `<meta property="og:image" content="https://evil.example/poster.webp"/>` +
          `<meta property="og:image" content="//cdn.example.com/poster.webp"/>`
      )
    ).toBeNull();
  });
});
