import type { CricketMatch } from "./types";

/**
 * The live stream stays available for this long after the match actually
 * finishes, so the post-match presentation is not cut off the instant the
 * final ball is bowled.
 */
export const MATCH_WATCH_GRACE_MS = 30 * 60_000;

const STORAGE_KEY = "reelhouse.cricket.ended-at.v1";
const STORAGE_MAX_AGE_MS = 24 * 60 * 60_000;

export type EndedAtMap = Record<string, number>;

export function pruneEndedAt(endedAt: EndedAtMap, now: number): EndedAtMap {
  const kept = Object.entries(endedAt)
    .filter(([, at]) => Number.isFinite(at) && at <= now + 60_000 && now - at < STORAGE_MAX_AGE_MS)
    .sort((a, b) => a[1] - b[1])
    .slice(-20);
  return Object.fromEntries(kept);
}

export function readEndedAt(
  storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage
): EndedAtMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const result: EndedAtMap = {};
    for (const [gid, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) result[gid] = value;
    }
    return pruneEndedAt(result, Date.now());
  } catch {
    return {};
  }
}

export function persistEndedAt(
  endedAt: EndedAtMap,
  storage: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : window.localStorage
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(pruneEndedAt(endedAt, Date.now())));
  } catch {
    // A full or disabled storage must never break the live button.
  }
}

export function markEnded(endedAt: EndedAtMap, gid: string, at = Date.now()): EndedAtMap {
  if (!gid || endedAt[gid] === at) return endedAt;
  return { ...endedAt, [gid]: at };
}

/** The latest completed match still inside its post-match watch window. */
export function recentEndedMatch(
  matches: CricketMatch[],
  endedAt: EndedAtMap,
  now: number
): CricketMatch | null {
  const recent = matches
    .filter((match) => {
      const at = endedAt[match.gid];
      return (
        match.status === "completed" &&
        Number.isFinite(at) &&
        now >= at &&
        now - at < MATCH_WATCH_GRACE_MS
      );
    })
    .sort((a, b) => (endedAt[b.gid] ?? 0) - (endedAt[a.gid] ?? 0));
  return recent[0] ?? null;
}

/**
 * Hero precedence: a live match, then a match inside its 30-minute post-match
 * window, then the next fixture, then the latest result. The ended match keeps
 * the hero and Watch Live control for its grace period instead of swapping to
 * the next fixture the moment the final ball lands.
 */
export function pickFeaturedMatch(
  matches: CricketMatch[],
  endedAt: EndedAtMap,
  now: number
): CricketMatch | null {
  const live = matches
    .filter((match) => match.status === "live")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  if (live) return live;

  const recent = recentEndedMatch(matches, endedAt, now);
  if (recent) return recent;

  const next = matches
    .filter((match) => match.status === "upcoming" && new Date(match.date).getTime() >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  if (next) return next;

  return (
    matches
      .filter((match) => match.status === "completed")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null
  );
}
