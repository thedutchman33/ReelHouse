import { NextResponse } from "next/server";
import { FEED_POOLS, type FeedPool } from "@/lib/feed-pools";
import { fetchFeedPool } from "@/lib/tmdb";
import type { MediaSummary } from "@/types";

// "My Feed" (reference pattern): the client names up to six curated pools and
// this route samples each pool deterministically, interleaves movies and
// series, and returns one deduplicated row. `seed` makes the selection stable
// for a period (the client passes the day), so the feed doesn't reshuffle
// between renders but still rotates over time.

const POOL_IDS = new Set(FEED_POOLS.map((p) => p.id));
const MAX_POOLS = 6;
const PER_POOL = 4;
const MAX_ITEMS = 18;

function parsePools(raw: string | null): FeedPool[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => POOL_IDS.has(id))
    .slice(0, MAX_POOLS)
    .map((id) => FEED_POOLS.find((p) => p.id === id)!);
}

/** Small deterministic hash so the same seed always samples the same window. */
function hashCode(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function sample(list: MediaSummary[], seed: string): MediaSummary[] {
  if (list.length <= PER_POOL) return list;
  const start = hashCode(seed) % list.length;
  const stride = 7; // skip adjacent titles — vote-ranked lists are same-y up top
  return Array.from(
    { length: PER_POOL },
    (_, i) => list[(start + i * stride) % list.length]
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pools = parsePools(searchParams.get("pools"));
  const seed = (searchParams.get("seed") ?? "daily").slice(0, 64);

  if (pools.length === 0) {
    return NextResponse.json({ results: [] });
  }

  try {
    const perPool = await Promise.all(pools.map((p) => fetchFeedPool(p)));
    const seen = new Set<string>();
    const results: MediaSummary[] = [];
    // Round-robin across pools so kinds and pools alternate instead of
    // dumping one pool's picks in a block.
    const picked = perPool.map((list, i) => sample(list, `${seed}:${pools[i].id}`));
    for (let round = 0; round < PER_POOL; round++) {
      for (let p = 0; p < picked.length; p++) {
        const item = picked[p][round];
        if (!item) continue;
        const dedupeKey = `${item.type}:${item.tmdbId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        results.push(item);
        if (results.length >= MAX_ITEMS) {
          return NextResponse.json({ results });
        }
      }
    }
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "feed_failed", results: [] }, { status: 502 });
  }
}
