import "server-only";

import type { F1Schedule } from "@/lib/f1";
import { nextF1Session } from "@/lib/live-windows";

// ---------------------------------------------------------------------------
// Official live-event artwork for the home hero.
//
// Formula 1 publishes a race card — the one used on formula1.com's calendar
// and race page — for every round. The hero shows that artwork on the live
// slide, so the poster belongs to the Grand Prix rather than being the F1 mark
// on a gradient.
//
// The calendar is the public index that pairs a round number with its card, so
// it is read once per six hours (Next's fetch cache) and turned into a
// round → image map. Nothing is invented when a card is missing: the caller
// keeps the branded fallback.
// ---------------------------------------------------------------------------

const CALENDAR = (year: number) => `https://www.formula1.com/en/racing/${year}`;

/** One schedule-card anchor; the round, artwork and race name live inside it. */
const CARD_ANCHOR = /<a\b[^>]*href="\/en\/racing\/\d{4}\/[a-z0-9-]+"[\s\S]*?<\/a>/g;
const CARD_ROUND = /ROUND\s+(\d+)/i;
const CARD_IMAGE =
  /https:\/\/media\.formula1\.com[^"'\s]*\/races\/card\/[a-z0-9-]+\.webp/;

/** Round number → official race-card image URL. Exported for tests. */
export function parseF1RaceCards(html: string): Map<number, string> {
  const cards = new Map<number, string>();
  for (const block of html.match(CARD_ANCHOR) ?? []) {
    const round = Number(CARD_ROUND.exec(block)?.[1]);
    const image = CARD_IMAGE.exec(block)?.[0];
    if (!Number.isInteger(round) || round < 1 || !image) continue;
    // The card is a 16:9 photo; w_1296 is the hero-sized version F1 serves for
    // the next race, so request the same rung for every round.
    cards.set(round, image.replace(",w_720", ",w_1296"));
  }
  return cards;
}

/**
 * The official race artwork for the round whose Watch Live button is
 * currently unlocked. Null when the round is unknown or the calendar cannot
 * be read — the hero then keeps its branded fallback.
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
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
      },
      next: { revalidate: 60 * 60 * 6 },
      // The live feed must not wait on F1's calendar: a slow page is the same
      // as no artwork and the branded fallback shows instead.
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    return parseF1RaceCards(await response.text()).get(round) ?? null;
  } catch {
    return null;
  }
}
