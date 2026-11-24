"use client";

import type { TrackedUpcomingResponse } from "@/lib/tracking";

// One schedule request per followed-set + month, shared by the navbar badge,
// the notification page, the home rail and the Following timeline. Without this
// cache those four surfaces would each fetch the same TMDB-backed payload.

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  at: number;
  promise: Promise<TrackedUpcomingResponse>;
}

const cache = new Map<string, CacheEntry>();

function emptyResponse(month: string): TrackedUpcomingResponse {
  return {
    month,
    shows: [],
    items: [],
    nextUp: null,
    truncated: false,
  };
}

function keyFor(ids: number[], month: string): string {
  return `${month}:${ids.join(",")}`;
}

export async function fetchTrackingUpcoming(
  ids: number[],
  month: string,
  force = false
): Promise<TrackedUpcomingResponse> {
  if (ids.length === 0) return emptyResponse(month);

  const key = keyFor(ids, month);
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return cached.promise;
  }

  const query = new URLSearchParams({
    month,
    ids: ids.join(","),
  });
  const promise = fetch(`/api/tracking/upcoming?${query.toString()}`, {
    headers: { Accept: "application/json" },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`tracking_upcoming_${response.status}`);
    return (await response.json()) as TrackedUpcomingResponse;
  });

  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}
