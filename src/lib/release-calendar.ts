import "server-only";

import { cache } from "react";
import type {
  CalendarCounts,
  CalendarEpisode,
  CalendarMonthData,
  CalendarRelease,
} from "@/lib/calendar";
import {
  monthKey,
  monthLabel,
  parseMonthKey,
  sortCalendarItems,
  todayKey,
} from "@/lib/calendar";
import {
  MAX_TRACKED_CALENDAR_IDS,
  type NextUpEpisode,
  type TrackedEpisodeInfo,
  type TrackedShowStatus,
} from "@/lib/tracking";
import { MOCK_MEDIA } from "@/lib/mock";
import { mediaId } from "@/lib/utils";

// Public release schedule for /calendar, matching the reference's algorithm:
//
// - films: TMDB discover pages 1–2 for the month, theatrical/digital releases
//   only (release types 2, 3 and 4);
// - series: pages 1–2 of shows premiering this month, talk/news excluded;
// - episodes: pages 1–2 of shows with an air date this month (talk/news/
//   reality/soap excluded), then the last/next season payload for the top 24
//   shows. Every episode on the same day is one calendar entry ("S1 · E1–4").
//
// TMDB reports thousands of rows for a month (every country, every limited
// release), which is not a useful calendar. The reference keeps only titles
// with artwork and a popularity score of at least 2, and we mirror that cut.

const TMDB_KEY = process.env.TMDB_API_KEY?.trim();
const API_BASE =
  process.env.TMDB_API_BASE?.trim() || "https://api.themoviedb.org/3";
const IMG_BASE =
  process.env.TMDB_IMAGE_BASE?.trim() || "https://image.tmdb.org/t/p";

const PAGES_PER_KIND = 2;
const EPISODE_SHOWS = 24;
const MIN_CALENDAR_POPULARITY = 2;

const MOVIE_RELEASE_TYPES = "2|3|4";
const SERIES_WITHOUT_GENRES = "10767,10763";
const EPISODES_WITHOUT_GENRES = "10767,10763,10764,10766";

function image(path: string | null | undefined, size: string): string | undefined {
  return path ? `${IMG_BASE}/${size}${path}` : undefined;
}

async function tmdb<T = any>(
  path: string,
  params: Record<string, string> = {},
  revalidate = 60 * 30
): Promise<T | null> {
  if (!TMDB_KEY) return null;
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const headers: Record<string, string> = { accept: "application/json" };
  if (TMDB_KEY.includes(".")) headers.authorization = `Bearer ${TMDB_KEY}`;
  else url.searchParams.set("api_key", TMDB_KEY);

  try {
    const response = await fetch(url, { headers, next: { revalidate } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function monthBounds(key: string): { start: string; end: string } {
  const { year, month } = parseMonthKey(key);
  const last = new Date(year, month, 0).getDate();
  return {
    start: `${key}-01`,
    end: `${key}-${String(last).padStart(2, "0")}`,
  };
}

function movieRelease(raw: any): CalendarRelease | null {
  if (!raw?.id || !raw.release_date || !raw.poster_path) return null;
  return {
    id: mediaId("movie", raw.id),
    tmdbId: raw.id,
    type: "movie",
    kind: "movie",
    title: raw.title || "Untitled",
    posterUrl: image(raw.poster_path, "w500"),
    backdropUrl: image(raw.backdrop_path, "w780"),
    rating: raw.vote_average || undefined,
    popularity: raw.popularity || undefined,
    date: raw.release_date,
  };
}

function seriesRelease(raw: any): CalendarRelease | null {
  if (!raw?.id || !raw.first_air_date || !raw.poster_path) return null;
  return {
    id: mediaId("tv", raw.id),
    tmdbId: raw.id,
    type: "tv",
    kind: "series",
    title: raw.name || "Untitled",
    posterUrl: image(raw.poster_path, "w500"),
    backdropUrl: image(raw.backdrop_path, "w780"),
    rating: raw.vote_average || undefined,
    popularity: raw.popularity || undefined,
    date: raw.first_air_date,
  };
}

/** Build one entry for a show's same-day episode batch. */
function episodeEntry(
  show: any,
  episodes: any[],
  month: string
): CalendarRelease | null {
  const sorted = episodes
    .filter(
      (episode) =>
        episode?.air_date?.startsWith(month) &&
        Number(episode.season_number) > 0 &&
        Number(episode.episode_number) > 0
    )
    .sort((a, b) => a.episode_number - b.episode_number);
  const first = sorted[0];
  if (!show?.id || !first) return null;

  const last = sorted[sorted.length - 1];
  const count = sorted.length;
  const stillUrl =
    image(first.still_path, "w780") || image(show.backdrop_path, "w780");
  const coordinates: CalendarEpisode = {
    seasonNumber: first.season_number,
    episodeNumber: first.episode_number,
    lastEpisodeNumber: last.episode_number,
    count,
    title: count > 1 ? `${count} episodes` : first.name || `Episode ${first.episode_number}`,
  };

  return {
    id: `${mediaId("tv", show.id)}-${first.air_date}-s${
      coordinates.seasonNumber
    }e${coordinates.episodeNumber}`,
    tmdbId: show.id,
    type: "tv",
    kind: "episode",
    title: show.name || "Untitled",
    posterUrl: image(show.poster_path, "w500"),
    backdropUrl: image(show.backdrop_path, "w780"),
    stillUrl,
    rating: first.vote_average || show.vote_average || undefined,
    popularity: show.popularity || undefined,
    date: first.air_date,
    episode: coordinates,
  };
}

/** Same show, same day → a single S/E range entry. */
function episodeEntriesForSeason(
  show: any,
  season: any,
  month: string
): CalendarRelease[] {
  const byDate = new Map<string, any[]>();
  for (const episode of season?.episodes ?? []) {
    if (!episode?.air_date?.startsWith(month)) continue;
    const list = byDate.get(episode.air_date);
    if (list) list.push(episode);
    else byDate.set(episode.air_date, [episode]);
  }
  return [...byDate.values()]
    .map((episodes) => episodeEntry(show, episodes, month))
    .filter((item): item is CalendarRelease => Boolean(item));
}

/** Run at most `limit` workers at once, preserving input order in the result. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await run(items[index]);
      }
    })
  );
  return results;
}

/**
 * A show's episodes in one month, grouped by air date. Season 0 (specials) and
 * episodes without a positive season/episode number are ignored.
 */
async function episodesForShow(
  showId: number,
  month: string,
  tracked = false
): Promise<CalendarRelease[]> {
  const detail = await tmdb(`/tv/${showId}`, { language: "en-US" });
  if (!detail?.id) return [];

  const seasonNumbers = new Set<number>();
  for (const episode of [
    detail.last_episode_to_air,
    detail.next_episode_to_air,
  ]) {
    if (Number(episode?.season_number) > 0) {
      seasonNumbers.add(episode.season_number);
    }
  }
  if (seasonNumbers.size === 0) return [];

  const seasons = await Promise.all(
    [...seasonNumbers].map((seasonNumber) =>
      tmdb(`/tv/${detail.id}/season/${seasonNumber}`, {
        language: "en-US",
      })
    )
  );

  return seasons
    .flatMap((season) => episodeEntriesForSeason(detail, season, month))
    .map((item) => (tracked ? { ...item, tracked: true } : item));
}

function dedupe(items: CalendarRelease[]): CalendarRelease[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function countByKind(items: CalendarRelease[]): CalendarCounts {
  return {
    all: items.length,
    movies: items.filter((item) => item.kind === "movie").length,
    series: items.filter((item) => item.kind === "series").length,
    episodes: items.filter((item) => item.kind === "episode").length,
  };
}

function mockMonth(month: string): CalendarMonthData {
  const items = MOCK_MEDIA.filter((media) =>
    media.releaseDate?.startsWith(month)
  ).map(
    (media): CalendarRelease => ({
      id: media.id,
      tmdbId: media.tmdbId,
      type: media.type === "tv" ? "tv" : "movie",
      kind: media.type === "tv" ? "series" : "movie",
      title: media.title,
      posterUrl: media.posterUrl,
      backdropUrl: media.backdropUrl,
      rating: media.rating,
      date: media.releaseDate!,
    })
  );
  const sorted = sortCalendarItems(items);
  return { month, items: sorted, counts: countByKind(sorted) };
}

async function liveMonth(month: string): Promise<CalendarMonthData> {
  const { start, end } = monthBounds(month);
  const pages = Array.from(
    { length: PAGES_PER_KIND },
    (_, index) => index + 1
  );

  const [moviePages, seriesPages, airingPages] = await Promise.all([
    Promise.all(
      pages.map((page) =>
        tmdb("/discover/movie", {
          "primary_release_date.gte": start,
          "primary_release_date.lte": end,
          "with_release_type": MOVIE_RELEASE_TYPES,
          sort_by: "popularity.desc",
          include_adult: "false",
          language: "en-US",
          page: String(page),
        })
      )
    ),
    Promise.all(
      pages.map((page) =>
        tmdb("/discover/tv", {
          "first_air_date.gte": start,
          "first_air_date.lte": end,
          "without_genres": SERIES_WITHOUT_GENRES,
          sort_by: "popularity.desc",
          include_adult: "false",
          language: "en-US",
          page: String(page),
        })
      )
    ),
    Promise.all(
      pages.map((page) =>
        tmdb("/discover/tv", {
          "air_date.gte": start,
          "air_date.lte": end,
          "without_genres": EPISODES_WITHOUT_GENRES,
          sort_by: "popularity.desc",
          include_adult: "false",
          language: "en-US",
          page: String(page),
        })
      )
    ),
  ]);

  const movies = dedupe(
    moviePages
      .flatMap((data) => (data?.results ?? []) as any[])
      .map(movieRelease)
      .filter(
        (item): item is CalendarRelease =>
          item !== null &&
          item.date.startsWith(month) &&
          (item.popularity ?? 0) >= MIN_CALENDAR_POPULARITY
      )
  );
  const series = dedupe(
    seriesPages
      .flatMap((data) => (data?.results ?? []) as any[])
      .map(seriesRelease)
      .filter(
        (item): item is CalendarRelease =>
          item !== null &&
          item.date.startsWith(month) &&
          (item.popularity ?? 0) >= MIN_CALENDAR_POPULARITY
      )
  );

  // Discover's air_date query returns shows. For the top 24, load the seasons
  // holding their latest and next episodes and group every episode by air date.
  // The seasons are loaded even when the adjacent episode falls in another
  // month: their runs can still contain episodes in the month being viewed.
  const seenShows = new Set<number>();
  const airing = airingPages
    .flatMap((data) => (data?.results ?? []) as any[])
    .filter((raw) => {
      if (!raw?.id || seenShows.has(raw.id)) return false;
      seenShows.add(raw.id);
      return true;
    })
    .slice(0, EPISODE_SHOWS);

  const episodeItems = (
    await mapWithConcurrency(airing, 6, (raw) =>
      episodesForShow(raw.id, month)
    )
  ).flat();

  const items = sortCalendarItems(
    dedupe([...movies, ...series, ...episodeItems])
  );
  return { month, items, counts: countByKind(items) };
}

/**
 * Episodes in one month for the viewer's tracked series. The public calendar
 * only budget-loads its top airing shows, so a followed show outside that list
 * would otherwise have no dates in the calendar (the reference fetches every
 * tracked series separately for this reason).
 */
export async function getTrackedCalendarEpisodes(
  month: string,
  ids: number[]
): Promise<CalendarRelease[]> {
  if (!TMDB_KEY) return [];
  const trackedIds = [...new Set(ids)]
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_TRACKED_CALENDAR_IDS);
  if (trackedIds.length === 0) return [];

  const groups = await mapWithConcurrency(trackedIds, 6, (id) =>
    episodesForShow(id, month, true)
  );
  return sortCalendarItems(dedupe(groups.flat()));
}

function trackedEpisodeInfo(raw: any): TrackedEpisodeInfo | null {
  const airDate = typeof raw?.air_date === "string" ? raw.air_date : "";
  const seasonNumber = Number(raw?.season_number);
  const episodeNumber = Number(raw?.episode_number);
  if (
    !airDate ||
    !Number.isInteger(seasonNumber) ||
    seasonNumber <= 0 ||
    !Number.isInteger(episodeNumber) ||
    episodeNumber <= 0
  ) {
    return null;
  }
  return {
    seasonNumber,
    episodeNumber,
    name: raw.name || `Episode ${episodeNumber}`,
    airDate,
    stillUrl: image(raw.still_path, "w300"),
  };
}

function nextUpFor(shows: TrackedShowStatus[]): NextUpEpisode | null {
  const today = todayKey();
  const candidates = shows.flatMap((show) => {
    const episode = show.nextEpisode;
    if (!episode || episode.airDate < today) return [];
    return [
      {
        tmdbId: show.tmdbId,
        title: show.name,
        airDate: episode.airDate,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        name: episode.name,
      },
    ];
  });
  candidates.sort(
    (a, b) =>
      a.airDate.localeCompare(b.airDate) ||
      a.title.localeCompare(b.title)
  );
  return candidates[0] ?? null;
}

export interface TrackedShowStatusResult {
  shows: TrackedShowStatus[];
  items: CalendarRelease[];
  nextUp: NextUpEpisode | null;
  truncated: boolean;
}

/**
 * One request for everything the Following timeline needs: each show's status,
 * its next and last episode, and the episodes that air in the selected month.
 * A show's detail is fetched once and its adjacent seasons are reused for both
 * the calendar entries and the status metadata.
 */
export async function getTrackedShowStatus(
  month: string,
  ids: number[]
): Promise<TrackedShowStatusResult> {
  const unique = [...new Set(ids)].filter(
    (id) => Number.isInteger(id) && id > 0
  );
  const trackedIds = unique.slice(0, MAX_TRACKED_CALENDAR_IDS);
  const truncated = unique.length > MAX_TRACKED_CALENDAR_IDS;

  if (!TMDB_KEY) {
    return {
      shows: trackedIds.map((tmdbId) => ({
        tmdbId,
        name: `Show ${tmdbId}`,
        status: "Unknown",
        nextEpisode: null,
        lastEpisode: null,
        monthEpisodes: [],
      })),
      items: [],
      nextUp: null,
      truncated,
    };
  }

  const groups = await mapWithConcurrency(trackedIds, 6, async (id) => {
    const detail = await tmdb(`/tv/${id}`, { language: "en-US" });
    if (!detail?.id) {
      return {
        show: {
          tmdbId: id,
          name: `Show ${id}`,
          status: "Unknown",
          nextEpisode: null,
          lastEpisode: null,
          monthEpisodes: [],
        } satisfies TrackedShowStatus,
        items: [] as CalendarRelease[],
      };
    }

    const seasonNumbers = new Set<number>();
    for (const episode of [
      detail.last_episode_to_air,
      detail.next_episode_to_air,
    ]) {
      if (Number(episode?.season_number) > 0) {
        seasonNumbers.add(episode.season_number);
      }
    }

    const seasons = await Promise.all(
      [...seasonNumbers].map((seasonNumber) =>
        tmdb(`/tv/${detail.id}/season/${seasonNumber}`, {
          language: "en-US",
        })
      )
    );

    const monthEpisodes = seasons
      .flatMap((season) =>
        ((season?.episodes ?? []) as any[])
          .filter((episode) => episode?.air_date?.startsWith(month))
          .map(trackedEpisodeInfo)
          .filter((episode): episode is TrackedEpisodeInfo => Boolean(episode))
      )
      .sort(
        (a, b) =>
          a.airDate.localeCompare(b.airDate) ||
          a.episodeNumber - b.episodeNumber
      );

    const items = seasons
      .flatMap((season) => episodeEntriesForSeason(detail, season, month))
      .map((item) => ({ ...item, tracked: true }));

    return {
      show: {
        tmdbId: detail.id,
        name: detail.name || `Show ${id}`,
        status: detail.status || "Unknown",
        nextEpisode: trackedEpisodeInfo(detail.next_episode_to_air),
        lastEpisode: trackedEpisodeInfo(detail.last_episode_to_air),
        monthEpisodes,
      } satisfies TrackedShowStatus,
      items,
    };
  });

  const shows = groups.map((group) => group.show);
  return {
    shows,
    items: sortCalendarItems(dedupe(groups.flatMap((group) => group.items))),
    nextUp: nextUpFor(shows),
    truncated,
  };
}

/** One month of releases + grouped episodes for /calendar. */
export const getReleaseCalendarMonth = cache(
  async (key: string): Promise<CalendarMonthData> => {
    if (!TMDB_KEY) return mockMonth(key);
    const live = await liveMonth(key);
    // If every request failed, prefer the local catalog over a blank page. A
    // genuinely quiet month is still returned as-is.
    if (live.items.length === 0) {
      const mock = mockMonth(key);
      if (mock.items.length > 0) return mock;
    }
    return live;
  }
);

/**
 * Count of film/series premieres in the next seven days. 7reels computes the
 * same stat from its two-page monthly movie/show calendars, filtered to titles
 * with artwork and popularity >= 2, from today through today + 6. Matching that
 * scope keeps this card at the reference's small weekly number instead of
 * counting every obscure catalog release in a Monday–Sunday window.
 */
export const getReleaseWeekCount = cache(async (): Promise<number> => {
  const now = new Date();
  const endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 6
  );
  const fmt = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;
  const start = fmt(now);
  const end = fmt(endDate);

  if (!TMDB_KEY) {
    return MOCK_MEDIA.filter((media) => {
      const date = media.releaseDate;
      return Boolean(date && date >= start && date <= end);
    }).length;
  }

  const monthKeys = [...new Set([start.slice(0, 7), end.slice(0, 7)])];
  const pages = Array.from({ length: PAGES_PER_KIND }, (_, index) => index + 1);

  const items = (
    await Promise.all(
      monthKeys.map(async (key) => {
        const bounds = monthBounds(key);
        const [moviePages, seriesPages] = await Promise.all([
          Promise.all(
            pages.map((page) =>
              tmdb("/discover/movie", {
                "primary_release_date.gte": bounds.start,
                "primary_release_date.lte": bounds.end,
                "with_release_type": MOVIE_RELEASE_TYPES,
                sort_by: "popularity.desc",
                include_adult: "false",
                language: "en-US",
                page: String(page),
              })
            )
          ),
          Promise.all(
            pages.map((page) =>
              tmdb("/discover/tv", {
                "first_air_date.gte": bounds.start,
                "first_air_date.lte": bounds.end,
                "without_genres": SERIES_WITHOUT_GENRES,
                sort_by: "popularity.desc",
                include_adult: "false",
                language: "en-US",
                page: String(page),
              })
            )
          ),
        ]);

        const movies = moviePages
          .flatMap((data) => (data?.results ?? []) as any[])
          .filter(
            (raw) =>
              raw?.poster_path &&
              !raw.adult &&
              (raw.popularity ?? 0) >= MIN_CALENDAR_POPULARITY
          )
          .map(movieRelease)
          .filter((item): item is CalendarRelease =>
            Boolean(
              item &&
                item.date >= bounds.start &&
                item.date <= bounds.end
            )
          );
        const series = seriesPages
          .flatMap((data) => (data?.results ?? []) as any[])
          .filter(
            (raw) =>
              raw?.poster_path &&
              !raw.adult &&
              (raw.popularity ?? 0) >= MIN_CALENDAR_POPULARITY
          )
          .map(seriesRelease)
          .filter((item): item is CalendarRelease =>
            Boolean(
              item &&
                item.date >= bounds.start &&
                item.date <= bounds.end
            )
          );

        return dedupe([...movies, ...series]);
      })
    )
  ).flat();

  return dedupe(items).filter(
    (item) => item.date >= start && item.date <= end
  ).length;
});

export { monthKey, monthLabel };
