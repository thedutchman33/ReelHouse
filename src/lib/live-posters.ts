import "server-only";

import type { F1Schedule } from "@/lib/f1";
import { nextF1Session } from "@/lib/live-windows";

// ---------------------------------------------------------------------------
// Official live-event artwork for the home hero.
//
// Formula 1 gives every round a race page whose share image (`og:image`) is the
// circuit's official 16:9 key visual — the same artwork formula1.com puts
// behind the race's title. That is the image the hero shows on the live slide:
// it belongs to the Grand Prix, it is F1-hosted, and at 3392px wide it stays
// sharp full-bleed (the calendar card it replaces is only 1296px and is a
// motion-blurred photo by design).
//
// The calendar is the public index that pairs a round number with its race
// page, so it is read once per six hours (Next's fetch cache) and turned into a
// round → page map. The page's own card image is the fallback when its share
// artwork is missing. Nothing is invented when both are unavailable: the caller
// keeps the branded fallback.
// ---------------------------------------------------------------------------

const CALENDAR = (year: number) => `https://www.formula1.com/en/racing/${year}`;
const RACE_PAGE = (year: number, slug: string) =>
  `https://www.formula1.com/en/racing/${year}/${slug}`;

const HEADERS = {
  Accept: "text/html",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
};

/** One schedule-card anchor; the round, page slug and artwork live inside it. */
const CARD_ANCHOR = /<a\b[^>]*href="\/en\/racing\/\d{4}\/[a-z0-9-]+"[\s\S]*?<\/a>/g;
const CARD_ROUND = /ROUND\s+(\d+)/i;
const CARD_SLUG = /href="\/en\/racing\/\d{4}\/([a-z0-9-]+)"/;
const CARD_IMAGE =
  /https:\/\/media\.formula1\.com[^"'\s]*\/races\/card\/[a-z0-9-]+\.webp/;

/** A round's race page slug and its calendar-card artwork (the fallback). */
export interface F1RoundArtwork {
  slug: string;
  cardUrl: string;
}

/** Round number → race-page slug and calendar card. Exported for tests. */
export function parseF1RaceCards(html: string): Map<number, F1RoundArtwork> {
  const cards = new Map<number, F1RoundArtwork>();
  for (const block of html.match(CARD_ANCHOR) ?? []) {
    const round = Number(CARD_ROUND.exec(block)?.[1]);
    const slug = CARD_SLUG.exec(block)?.[1];
    const image = CARD_IMAGE.exec(block)?.[0];
    if (!Number.isInteger(round) || round < 1 || !slug || !image) continue;
    // The card is a 16:9 photo; w_1296 is the hero-sized version F1 serves for
    // the next race, so request the same rung for every round.
    cards.set(round, {
      slug,
      cardUrl: image.replace(",w_720", ",w_1296"),
    });
  }
  return cards;
}

/**
 * The official key visual from a race page's `<meta>` tags. Only F1's own media
 * host is accepted, so markup on the page can never point the hero at an
 * arbitrary origin. Exported for tests.
 */
export function parseF1RacePoster(html: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/(?:property|name)\s*=\s*"(?:og:image|twitter:image)"/i.test(tag)) {
      continue;
    }
    const content = /content\s*=\s*"([^"]+)"/i.exec(tag)?.[1];
    if (!content) continue;
    const url = content.replace(/&amp;/g, "&");
    if (url.startsWith("https://media.formula1.com/")) return url;
  }
  return null;
}

/**
 * The official race artwork for the round whose Watch Live button is
 * currently unlocked. Null when the round is unknown or F1 cannot be read —
 * the hero then keeps its branded fallback.
 */
export async function f1RacePoster(
  schedule: F1Schedule,
  now = Date.now()
): Promise<string | null> {
  const picked = nextF1Session(schedule, now);
  if (!picked) return null;

  const round =
    schedule.rounds.findIndex(
      (entry) => entry.meeting.meeting_key === picked.round.meeting.meeting_key
    ) + 1;
  if (round < 1) return null;

  try {
    const response = await fetch(CALENDAR(schedule.year), {
      headers: HEADERS,
      next: { revalidate: 60 * 60 * 6 },
      // The live feed must not wait on F1's site: a slow page is the same as
      // no artwork and the branded fallback shows instead.
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const artwork = parseF1RaceCards(await response.text()).get(round);
    if (!artwork) return null;

    try {
      const page = await fetch(RACE_PAGE(schedule.year, artwork.slug), {
        headers: HEADERS,
        next: { revalidate: 60 * 60 * 6 },
        signal: AbortSignal.timeout(6000),
      });
      if (page.ok) {
        const poster = parseF1RacePoster(await page.text());
        if (poster) return poster;
      }
    } catch {
      // Fall through to the calendar card below.
    }

    return artwork.cardUrl;
  } catch {
    return null;
  }
}
