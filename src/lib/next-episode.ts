import type { Season } from "@/types";

// ---------------------------------------------------------------------------
// "Up next" resolution for Continue Watching.
//
// Mirrors the reference's card behaviour: when the episode a viewer last
// watched is finished, the card advances to the next episode — but only once
// that episode has aired. A next episode in the same season always wins over
// the following season, and an unaired next episode does not skip ahead to the
// next season (the reference does the same).
//
// Kept pure and separate from the route so both providers and edge cases can
// be unit-tested without a network.
// ---------------------------------------------------------------------------

export interface NextEpisodeInfo {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  stillUrl?: string;
  airDate?: string;
}

/**
 * The next episode after `(seasonNumber, episodeNumber)`, provided it is
 * already available.
 *
 * `allowUndated` is for AniList: anime episodes carry no air dates, so an
 * undated episode counts as available. TV needs a real date on or before
 * `today`, matching the reference's `air_date <= today` check.
 */
export function nextAiredEpisode(
  seasons: Season[],
  seasonNumber: number,
  episodeNumber: number,
  { today, allowUndated = false }: { today: string; allowUndated?: boolean }
): NextEpisodeInfo | null {
  const seasonIndex = seasons.findIndex((s) => s.seasonNumber === seasonNumber);
  if (seasonIndex < 0) return null;

  const episodes = seasons[seasonIndex].episodes ?? [];
  const episodeIndex = episodes.findIndex((e) => e.episodeNumber === episodeNumber);
  if (episodeIndex < 0) return null;

  const candidate =
    episodes[episodeIndex + 1] ?? seasons[seasonIndex + 1]?.episodes?.[0];
  if (!candidate) return null;
  if (candidate.airDate ? candidate.airDate > today : !allowUndated) return null;

  return {
    seasonNumber: candidate.seasonNumber,
    episodeNumber: candidate.episodeNumber,
    title: candidate.title,
    ...(candidate.stillUrl ? { stillUrl: candidate.stillUrl } : {}),
    ...(candidate.airDate ? { airDate: candidate.airDate } : {}),
  };
}
