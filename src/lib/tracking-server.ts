import "server-only";

import { getSessionContext } from "@/lib/supabase/server";
import type { MediaSummary } from "@/types";
import { MAX_TRACKED_CALENDAR_IDS, trackedTmdbId } from "@/lib/tracking";

export interface ResolvedTrackedIds {
  ids: number[];
  /** More than the per-request budget were supplied (or stored). */
  truncated: boolean;
}

function parseIds(raw: string | null): number[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((value) => Number(value))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
}

/**
 * The tracking endpoints accept explicit TMDB ids (anonymous/local mode) and
 * otherwise fall back to the signed-in user's followed shows. Keeping both
 * paths means calendar matching works before the first client hydrate, and the
 * notification surfaces still work for a browser that has never synced.
 */
export async function resolveTrackedIds(
  idsParam: string | null
): Promise<ResolvedTrackedIds> {
  const parsed = parseIds(idsParam);
  if (parsed.length > 0) {
    return {
      ids: parsed.slice(0, MAX_TRACKED_CALENDAR_IDS),
      truncated: parsed.length > MAX_TRACKED_CALENDAR_IDS,
    };
  }

  const ctx = await getSessionContext();
  if (!ctx) return { ids: [], truncated: false };

  const { data, error } = await ctx.supabase
    .from("tracked")
    .select("media_snapshot")
    .order("tracked_at", { ascending: false });

  if (error || !data) return { ids: [], truncated: false };

  const all: number[] = [];
  const seen = new Set<number>();
  for (const row of data) {
    const media = row.media_snapshot as MediaSummary;
    const id = media ? trackedTmdbId(media) : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    all.push(id);
  }

  return {
    ids: all.slice(0, MAX_TRACKED_CALENDAR_IDS),
    truncated: all.length > MAX_TRACKED_CALENDAR_IDS,
  };
}
