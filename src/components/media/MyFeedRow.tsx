"use client";

import { useEffect, useMemo, useState } from "react";
import MediaRow from "@/components/media/MediaRow";
import { FEED_POOLS, type FeedPool } from "@/lib/feed-pools";
import { useWatchlist, useHistory } from "@/lib/library";
import type { MediaSummary, MediaType } from "@/types";

// "My Feed" (reference pattern): a mix of curated all-time pools — movies AND
// series — with the viewer's own watch signals steering which pools lead.
// Without any history the row still renders (the reference does exactly this),
// it just falls back to the rotating default mix.
const FEED_SIZE = 5; // pools sampled (3 movie + 2 tv, alternating by day)

/** Day-stable rotation offset, so the feed varies daily but not per render. */
function dayNumber(): number {
  return Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
}

function rotate<T>(list: T[], by: number): T[] {
  if (list.length === 0) return list;
  const k = ((by % list.length) + list.length) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

function pickPools(affinity: Set<string>): FeedPool[] {
  const day = dayNumber();
  const matched = FEED_POOLS.filter((p) => p.genre && affinity.has(p.genre));
  const unmatched = FEED_POOLS.filter((p) => !p.genre || !affinity.has(p.genre));
  // Personal pools lead within their kind; the unmatched pools fill the rest.
  const movies = [
    ...rotate(matched.filter((p) => p.kind === "movie"), day),
    ...rotate(unmatched.filter((p) => p.kind === "movie"), day >> 3),
  ];
  const series = [
    ...rotate(matched.filter((p) => p.kind === "tv"), day >> 1),
    ...rotate(unmatched.filter((p) => p.kind === "tv"), day >> 5),
  ];
  const movieCount = day % 2 === 0 ? 3 : 2;
  const seriesCount = FEED_SIZE - movieCount;
  const chosen: FeedPool[] = [];
  for (let i = 0; i < Math.max(movieCount, seriesCount); i++) {
    if (i < movieCount) chosen.push(movies[i]);
    if (i < seriesCount) chosen.push(series[i]);
  }
  return chosen;
}

export default function MyFeedRow() {
  const watchlist = useWatchlist();
  const history = useHistory();

  // Genre names across the viewer's watchlist + history = the affinity signal.
  const affinity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of [...watchlist, ...history]) {
      for (const g of (item as { genres?: string[] }).genres ?? []) {
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
    return new Set(counts.keys());
  }, [watchlist, history]);

  const pools = useMemo(() => pickPools(affinity), [affinity]);

  const [items, setItems] = useState<MediaSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const seed = new Date().toISOString().slice(0, 10);
        const res = await fetch(`/api/feed?pools=${pools.map((p) => p.id).join(",")}&seed=${seed}`);
        const data = (await res.json()) as { results?: MediaSummary[] };
        if (alive) setItems(data.results ?? []);
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pools]);

  if (!items || items.length === 0) return null;

  return (
    <MediaRow
      row={{ key: "feed", title: "My Feed", items }}
      eyebrow="For You"
    />
  );
}
