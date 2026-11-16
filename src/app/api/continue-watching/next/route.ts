import { NextResponse } from "next/server";
import { getAnimeSeasons, getSeasonEpisodes, getSeriesSeasons } from "@/lib/tmdb";
import { nextAiredEpisode, type NextEpisodeInfo } from "@/lib/next-episode";
import type { Season } from "@/types";

// One title's "Up next" episode for Continue Watching. The client only asks
// for this when the episode it holds is finished, so the answer is always the
// episode AFTER the one the card is showing — never the current one.

const today = () => new Date().toISOString().slice(0, 10);

async function nextForTv(
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<NextEpisodeInfo | null> {
  const episodes = await getSeasonEpisodes(tmdbId, seasonNumber);
  const index = episodes.findIndex((e) => e.episodeNumber === episodeNumber);
  if (index < 0) return null;

  const current: Season = {
    seasonNumber,
    name: `Season ${seasonNumber}`,
    episodeCount: episodes.length,
    episodes,
  };

  // A next episode in the same season is the answer; when it has not aired yet
  // the card stays on the finished episode instead of skipping a season.
  if (episodes[index + 1]) {
    return nextAiredEpisode([current], seasonNumber, episodeNumber, { today: today() });
  }

  // Finale: roll into the next season's first episode, like the reference.
  const seasons = await getSeriesSeasons(tmdbId);
  const seasonIndex = seasons.findIndex((s) => s.seasonNumber === seasonNumber);
  const after = seasonIndex >= 0 ? seasons[seasonIndex + 1] : undefined;
  if (!after) return null;

  return nextAiredEpisode(
    [
      current,
      { ...after, episodes: await getSeasonEpisodes(tmdbId, after.seasonNumber) },
    ],
    seasonNumber,
    episodeNumber,
    { today: today() }
  );
}

async function nextForAnime(
  anilistId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<NextEpisodeInfo | null> {
  const seasons = await getAnimeSeasons(anilistId);
  // AniList episodes carry no air dates; an undated episode is available.
  return nextAiredEpisode(seasons, seasonNumber, episodeNumber, {
    today: today(),
    allowUndated: true,
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const id = Number(params.get("id"));
  const season = Number(params.get("season"));
  const episode = Number(params.get("episode"));

  if (
    (type !== "tv" && type !== "anime") ||
    !Number.isInteger(id) ||
    id <= 0 ||
    !Number.isInteger(season) ||
    season < 1 ||
    !Number.isInteger(episode) ||
    episode < 1
  ) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const next =
      type === "tv"
        ? await nextForTv(id, season, episode)
        : await nextForAnime(id, season, episode);

    return NextResponse.json(
      { next },
      {
        headers: {
          // Episode metadata is effectively immutable once aired; an hour is
          // short enough that a newly aired episode appears promptly.
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=604800",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "next_episode_failed" }, { status: 502 });
  }
}
