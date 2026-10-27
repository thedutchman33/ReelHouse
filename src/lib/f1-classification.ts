/**
 * A session's classification is the provider's official result, not a re-sort
 * of its lap feed.
 *
 * OpenF1's `/laps` keeps laps that official timing deletes (track limits and
 * post-flag laps are still in the feed with `is_deleted: false`), so ordering
 * practice or qualifying by the minimum lap promotes drivers whose lap did not
 * count. US GP 2026 FP1 is the canonical case: the lap feed gives VER a
 * 1:35.860 that the official classification discards, which would put him P1
 * ahead of LEC's 1:36.052.
 *
 * Rows carrying an official position keep that order; anything else (a session
 * without a published result, or a partial live feed) falls back to best lap.
 */
export function orderByClassification<
  T extends { best: number | null; position?: number | null },
>(rows: T[]): T[] {
  if (rows.every((r) => r.position == null)) {
    return [...rows].sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
  }
  return [...rows].sort((a, b) => {
    const pa = a.position ?? Number.POSITIVE_INFINITY;
    const pb = b.position ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return (a.best ?? Infinity) - (b.best ?? Infinity);
  });
}
