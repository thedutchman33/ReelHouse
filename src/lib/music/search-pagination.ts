import type { MusicSearchPagination } from "./types";

export interface SearchPageInput {
  limit: number;
  audiusLimit: number;
  jamendoOffset: number;
  audiusCount: number;
  jamendoCount: number;
}

const AUDIUS_MAX_RESULTS = 30;

// Audius' search endpoint has no offset, so its page grows by asking for a
// larger result window. Jamendo supports a real offset. One cursor carries both
// values, and each provider stops independently when it is exhausted.
export function nextSearchPagination({
  limit,
  audiusLimit,
  jamendoOffset,
  audiusCount,
  jamendoCount,
}: SearchPageInput): MusicSearchPagination {
  const safeLimit = Math.max(1, Math.min(30, Math.trunc(limit)));
  const safeAudiusLimit = Math.max(
    safeLimit,
    Math.min(AUDIUS_MAX_RESULTS, Math.trunc(audiusLimit))
  );
  const safeJamendoOffset = Math.max(0, Math.trunc(jamendoOffset));

  const audiusHasMore =
    safeAudiusLimit < AUDIUS_MAX_RESULTS && audiusCount >= safeAudiusLimit;
  const jamendoHasMore = jamendoCount >= safeLimit;
  const hasMore = audiusHasMore || jamendoHasMore;

  return {
    offset: safeJamendoOffset,
    limit: safeLimit,
    hasMore,
    next: hasMore
      ? {
          audiusLimit: Math.min(AUDIUS_MAX_RESULTS, safeAudiusLimit + safeLimit),
          jamendoOffset: safeJamendoOffset + safeLimit,
        }
      : undefined,
  };
}
