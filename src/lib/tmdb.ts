import "server-only";

import { cache } from "react";
import type { BrowseFilters, BrowseSort, BrowseType } from "@/lib/browse";
import { MOCK_MEDIA } from "@/lib/mock";
import { mediaId } from "@/lib/utils";
import type { Media, MediaRow, MediaSummary, MediaType } from "@/types";

// ---------------------------------------------------------------------------
// Metadata source.
//
// If TMDB_API_KEY (v3 key or v4 read token) is present we fetch live from
// TMDB. Otherwise we serve the built-in mock catalog so the app runs with no
// setup. Either way the UI only sees the internal Media/MediaSummary shapes.
//
// `import "server-only"` guarantees this module can never be bundled into a
// client component — the key stays server-side (PRD §10 / analysis §10).
// ---------------------------------------------------------------------------

const TMDB_KEY = process.env.TMDB_API_KEY?.trim();
const USE_LIVE = Boolean(TMDB_KEY);
const IMG_BASE = process.env.TMDB_IMAGE_BASE?.trim() || "https://image.tmdb.org/t/p";
// API host is overridable so deployments on networks that block the canonical
// api.themoviedb.org (some ISPs do) can point at TMDB's identical `api.tmdb.org`
// alias with no code change. Mirrors the TMDB_IMAGE_BASE override above.
const API_BASE = process.env.TMDB_API_BASE?.trim() || "https://api.themoviedb.org/3";

const img = (path: string | null | undefined, size: string): string | undefined =>
  path ? `${IMG_BASE}/${size}${path}` : undefined;

// ------------------------------- MOCK PATH ---------------------------------

const toSummary = (m: Media): MediaSummary => ({
  id: m.id,
  tmdbId: m.tmdbId,
  type: m.type,
  title: m.title,
  posterUrl: m.posterUrl,
  backdropUrl: m.backdropUrl,
  rating: m.rating,
  releaseDate: m.releaseDate,
  genres: m.genres,
  overview: m.overview,
});

const byRating = (a: Media, b: Media) => (b.rating ?? 0) - (a.rating ?? 0);
const byDate = (a: Media, b: Media) =>
  (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "");

const hasGenre = (m: Media, genres: string[]) =>
  m.genres.some((g) => genres.includes(g));

function mockHomeRows(): MediaRow[] {
  const all = MOCK_MEDIA;
  const summaries = all.map(toSummary);

  // A stable "trending" interleave of series and films.
  const movies = summaries.filter((m) => m.type === "movie");
  const tv = summaries.filter((m) => m.type === "tv");
  const trending: MediaSummary[] = [];
  const max = Math.max(movies.length, tv.length);
  for (let i = 0; i < max; i++) {
    if (tv[i]) trending.push(tv[i]);
    if (movies[i]) trending.push(movies[i]);
  }

  const rows: MediaRow[] = [
    { key: "trending", title: "Trending Now", items: trending.slice(0, 12) },
    {
      key: "top10",
      title: "Top 10 This Week",
      ranked: true,
      items: [...all].sort(byRating).slice(0, 10).map(toSummary),
    },
    {
      key: "new",
      title: "New & Popular",
      items: [...all].sort(byDate).slice(0, 12).map(toSummary),
    },
    {
      key: "action",
      title: "Action & Adventure",
      items: all.filter((m) => hasGenre(m, ["Action", "Adventure"])).map(toSummary),
    },
    {
      key: "scifi",
      title: "Sci-Fi & Fantasy",
      items: all.filter((m) => hasGenre(m, ["Sci-Fi", "Fantasy"])).map(toSummary),
    },
    {
      key: "acclaimed",
      title: "Critically Acclaimed",
      items: all.filter((m) => (m.rating ?? 0) >= 7.7).sort(byRating).map(toSummary),
    },
    {
      key: "thriller",
      title: "Thrillers & Mystery",
      items: all.filter((m) => hasGenre(m, ["Thriller", "Mystery", "Horror"])).map(toSummary),
    },
    {
      key: "feelgood",
      title: "Comedy & Feel-Good",
      items: all.filter((m) => hasGenre(m, ["Comedy", "Romance", "Family"])).map(toSummary),
    },
  ];

  return rows.filter((r) => r.items.length > 0);
}

function mockHero(): MediaSummary[] {
  const picks = ["tv-90102", "movie-90001", "movie-90004", "movie-90013", "tv-90101"];
  return picks
    .map((id) => MOCK_MEDIA.find((m) => m.id === id))
    .filter((m): m is Media => Boolean(m))
    .map(toSummary);
}

function mockRecommendations(m: Media): MediaSummary[] {
  return MOCK_MEDIA.filter((o) => o.id !== m.id && hasGenre(o, m.genres))
    .sort(byRating)
    .slice(0, 12)
    .map(toSummary);
}

function mockSearch(query: string): MediaSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return MOCK_MEDIA.filter(
    (m) =>
      m.title.toLowerCase().includes(q) ||
      m.genres.some((g) => g.toLowerCase().includes(q))
  ).map(toSummary);
}

// ------------------------------- LIVE PATH ---------------------------------

// Minimal genre id → name map (movie + tv) for mapping list endpoints.
const TMDB_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};

async function tmdb<T = any>(
  path: string,
  params: Record<string, string> = {},
  revalidate = 60 * 30
): Promise<T | null> {
  if (!TMDB_KEY) return null;
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers: Record<string, string> = { accept: "application/json" };
  // v4 read tokens are JWTs (contain dots); v3 keys go in the query string.
  if (TMDB_KEY.includes(".")) headers.authorization = `Bearer ${TMDB_KEY}`;
  else url.searchParams.set("api_key", TMDB_KEY);

  try {
    const res = await fetch(url, { headers, next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function liveSummary(raw: any, forcedType?: MediaType): MediaSummary | null {
  const type: MediaType = forcedType ?? (raw.media_type === "tv" || raw.name ? "tv" : "movie");
  const tmdbId = raw.id as number;
  if (!tmdbId) return null;
  const title = raw.title || raw.name || "Untitled";
  const genres: string[] = Array.isArray(raw.genre_ids)
    ? Array.from(new Set(raw.genre_ids.map((g: number) => TMDB_GENRES[g]).filter(Boolean)))
    : [];
  return {
    id: mediaId(type, tmdbId),
    tmdbId,
    type,
    title,
    posterUrl: img(raw.poster_path, "w500"),
    backdropUrl: img(raw.backdrop_path, "w1280"),
    rating: raw.vote_average || undefined,
    releaseDate: raw.release_date || raw.first_air_date || undefined,
    genres,
    overview: raw.overview || undefined,
  };
}

function liveList(data: any, forcedType?: MediaType): MediaSummary[] {
  const results = data?.results ?? [];
  return results
    .filter((r: any) => r.media_type !== "person")
    .map((r: any) => liveSummary(r, forcedType))
    .filter(Boolean) as MediaSummary[];
}

// Wrapped in React's per-request cache() so the home page's parallel calls for
// the hero and the rows share ONE computation (and one set of TMDB fetches)
// within a single render, instead of running the eight-request fan-out twice.
const liveHomeRows = cache(async (): Promise<MediaRow[]> => {
  const [trending, top, popMovies, popTv, topRated, scifi, action, comedy] =
    await Promise.all([
      tmdb("/trending/all/week", {}, 60 * 15),
      tmdb("/trending/all/day", {}, 60 * 15),
      tmdb("/movie/popular", {}, 60 * 30),
      tmdb("/tv/popular", {}, 60 * 30),
      tmdb("/movie/top_rated", {}, 60 * 60),
      tmdb("/discover/movie", { with_genres: "878", sort_by: "popularity.desc" }),
      tmdb("/discover/movie", { with_genres: "28", sort_by: "popularity.desc" }),
      tmdb("/discover/movie", { with_genres: "35", sort_by: "popularity.desc" }),
    ]);

  const newPopular = [...liveList(popMovies, "movie"), ...liveList(popTv, "tv")]
    .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""))
    .slice(0, 16);

  const rows: MediaRow[] = [
    { key: "trending", title: "Trending Now", items: liveList(trending).slice(0, 16) },
    { key: "top10", title: "Top 10 Today", ranked: true, items: liveList(top).slice(0, 10) },
    { key: "new", title: "New & Popular", items: newPopular },
    { key: "acclaimed", title: "Critically Acclaimed", items: liveList(topRated, "movie").slice(0, 16) },
    { key: "scifi", title: "Sci-Fi & Fantasy", items: liveList(scifi, "movie").slice(0, 16) },
    { key: "action", title: "Action & Adventure", items: liveList(action, "movie").slice(0, 16) },
    { key: "feelgood", title: "Comedy & Feel-Good", items: liveList(comedy, "movie").slice(0, 16) },
  ];
  return rows.filter((r) => r.items.length > 0);
});

// Wrapped in React's per-request cache(), keyed on (type, tmdbId), for the same
// reason as liveHomeRows above: every detail-ish route calls getMediaDetail()
// twice per request — once in generateMetadata and once in the page body
// (movie/[id], tv/[id], watch/[type]/[id]). Next's fetch memoization already
// collapsed the duplicate HTTP calls, but the JSON parse and the whole transform
// below still ran twice; for a series that means re-mapping every episode of up
// to eight seasons a second time. Per-request only — nothing is shared between
// requests or users.
const liveDetail = cache(async (type: MediaType, tmdbId: number): Promise<Media | null> => {
  const data = await tmdb(`/${type}/${tmdbId}`, {
    append_to_response: "credits,recommendations",
  });
  if (!data) return null;

  const genres: string[] = (data.genres ?? []).map((g: any) => g.name);
  const cast = (data.credits?.cast ?? []).slice(0, 12).map((c: any) => ({
    id: c.id,
    name: c.name,
    character: c.character,
    profileUrl: img(c.profile_path, "w185"),
  }));
  const recommendations = liveList(data.recommendations, type).slice(0, 12);

  let seasons;
  if (type === "tv" && Array.isArray(data.seasons)) {
    const real = data.seasons.filter((s: any) => s.season_number > 0).slice(0, 8);
    seasons = await Promise.all(
      real.map(async (s: any) => {
        const sd = await tmdb(`/tv/${tmdbId}/season/${s.season_number}`, {}, 60 * 60);
        const episodes = (sd?.episodes ?? []).map((e: any) => ({
          id: `s${e.season_number}e${e.episode_number}`,
          seasonNumber: e.season_number,
          episodeNumber: e.episode_number,
          title: e.name,
          overview: e.overview,
          runtime: e.runtime,
          stillUrl: img(e.still_path, "w300"),
          airDate: e.air_date,
        }));
        return {
          seasonNumber: s.season_number,
          name: s.name,
          episodeCount: episodes.length,
          episodes,
        };
      })
    );
  }

  return {
    id: mediaId(type, tmdbId),
    tmdbId,
    type,
    title: data.title || data.name,
    tagline: data.tagline || undefined,
    overview: data.overview || "",
    posterUrl: img(data.poster_path, "w500"),
    backdropUrl: img(data.backdrop_path, "w1280"),
    rating: data.vote_average || undefined,
    releaseDate: data.release_date || data.first_air_date || undefined,
    runtime: data.runtime || data.episode_run_time?.[0] || undefined,
    genres,
    cast,
    recommendations,
    seasons,
  };
});

async function liveSearch(query: string): Promise<MediaSummary[]> {
  const data = await tmdb("/search/multi", { query, include_adult: "false" }, 60 * 5);
  return liveList(data);
}

// ------------------------------- BROWSE ------------------------------------
//
// Discover/browse, shared by /browse, /movies and /tv-shows.
//
// Every filter here maps onto a documented TMDB discover parameter (or the
// equivalent pass over the built-in catalog). Genre names are the same ones the
// cards display, so the dropdown and the card labels can never disagree.

/**
 * Genre filter vocabulary: display name → TMDB genre id per endpoint.
 *
 * The two endpoints have different vocabularies — TV has no "Thriller" and folds
 * Action into "Action & Adventure" (10759) and Sci-Fi into "Sci-Fi & Fantasy"
 * (10765). A genre is only offered for a media type it actually exists for.
 */
const BROWSE_GENRES: { name: string; movieId?: number; tvId?: number }[] = [
  { name: "Action", movieId: 28, tvId: 10759 },
  { name: "Adventure", movieId: 12, tvId: 10759 },
  { name: "Animation", movieId: 16, tvId: 16 },
  { name: "Comedy", movieId: 35, tvId: 35 },
  { name: "Crime", movieId: 80, tvId: 80 },
  { name: "Documentary", movieId: 99, tvId: 99 },
  { name: "Drama", movieId: 18, tvId: 18 },
  { name: "Family", movieId: 10751, tvId: 10751 },
  { name: "Fantasy", movieId: 14, tvId: 10765 },
  { name: "History", movieId: 36 },
  { name: "Horror", movieId: 27 },
  { name: "Kids", tvId: 10762 },
  { name: "Mystery", movieId: 9648, tvId: 9648 },
  { name: "Reality", tvId: 10764 },
  { name: "Romance", movieId: 10749 },
  { name: "Sci-Fi", movieId: 878, tvId: 10765 },
  { name: "Thriller", movieId: 53 },
  { name: "War", movieId: 10752, tvId: 10768 },
  { name: "Western", movieId: 37, tvId: 37 },
];

const genreIdFor = (name: string | null, type: MediaType): number | undefined => {
  if (!name) return undefined;
  const entry = BROWSE_GENRES.find((g) => g.name === name);
  return type === "movie" ? entry?.movieId : entry?.tvId;
};

/** Oldest year offered in the year filter — TMDB has usable coverage from here. */
const EARLIEST_BROWSE_YEAR = 1950;

const SORT_FIELD: Record<BrowseSort, Record<MediaType, string>> = {
  popularity: { movie: "popularity.desc", tv: "popularity.desc" },
  latest: { movie: "primary_release_date.desc", tv: "first_air_date.desc" },
  oldest: { movie: "primary_release_date.asc", tv: "first_air_date.asc" },
  rating: { movie: "vote_average.desc", tv: "vote_average.desc" },
};

export interface BrowsePage {
  items: MediaSummary[];
  page: number;
  /** 0 when nothing matched. Capped at TMDB's hard 500-page ceiling. */
  totalPages: number;
}

export interface BrowseOptions {
  /** Genre names valid for the current content type. */
  genres: string[];
  years: number[];
}

function discoverParams(
  filters: BrowseFilters,
  type: MediaType,
  today: string
): Record<string, string> {
  const params: Record<string, string> = {
    include_adult: "false",
    sort_by: SORT_FIELD[filters.sort][type],
    page: String(filters.page),
  };

  const genreId = genreIdFor(filters.genre, type);
  if (genreId) params.with_genres = String(genreId);

  if (filters.year) {
    if (type === "movie") params.primary_release_year = String(filters.year);
    else params.first_air_date_year = String(filters.year);
  }

  // Sort guards. Without these, "Latest" surfaces announced-but-unreleased
  // entries and "Rating"/"Oldest" surface titles with a handful of votes.
  const dateField = type === "movie" ? "primary_release_date" : "first_air_date";
  if (filters.sort === "latest") params[`${dateField}.lte`] = today;
  if (filters.sort === "rating") params["vote_count.gte"] = "200";
  if (filters.sort === "oldest") {
    params["vote_count.gte"] = "50";
    params[`${dateField}.gte`] = `${EARLIEST_BROWSE_YEAR}-01-01`;
  }

  return params;
}

/** Interleave two lists, preserving each one's own ordering. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

async function liveBrowse(filters: BrowseFilters): Promise<BrowsePage | null> {
  const today = new Date().toISOString().slice(0, 10);
  const wanted: MediaType[] =
    filters.type === "all" ? ["movie", "tv"] : [filters.type];

  // A genre that does not exist for a type simply drops that type from the query
  // rather than returning that type unfiltered.
  const targets = wanted.filter(
    (type) => !filters.genre || genreIdFor(filters.genre, type)
  );
  if (targets.length === 0) return { items: [], page: filters.page, totalPages: 0 };

  const responses = await Promise.all(
    targets.map((type) =>
      tmdb(`/discover/${type}`, discoverParams(filters, type, today), 60 * 30)
    )
  );
  if (responses.every((r) => r === null)) return null;

  const lists = responses.map((data, i) => liveList(data, targets[i]));
  const totalPages = Math.min(
    500,
    Math.max(...responses.map((r: any) => r?.total_pages ?? 0), 0)
  );

  // "All" mixes both catalogs. For rating/date sorts the merged list can be
  // re-sorted honestly (both fields are on every summary); popularity has no
  // per-item value in our model, so the two lists interleave and each keeps
  // TMDB's own popularity ordering.
  let items = lists.length === 1 ? lists[0] : interleave(lists[0], lists[1] ?? []);
  if (lists.length > 1) items = sortByBrowse(items, filters.sort);

  return { items, page: filters.page, totalPages };
}

/** Re-sort an already-fetched list. Both fields exist on every summary. */
function sortByBrowse<T extends { rating?: number; releaseDate?: string }>(
  items: T[],
  sort: BrowseSort
): T[] {
  const list = [...items];
  if (sort === "rating") return list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  if (sort === "latest")
    return list.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
  if (sort === "oldest")
    return list.sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""));
  return list; // popularity — keep source order
}

const MOCK_PAGE_SIZE = 20;

const mockYear = (m: Media): number | null => {
  const year = Number(m.releaseDate?.slice(0, 4));
  return Number.isInteger(year) ? year : null;
};

function mockBrowse(filters: BrowseFilters): BrowsePage {
  const matched = MOCK_MEDIA.filter((m) => {
    if (filters.type !== "all" && m.type !== filters.type) return false;
    if (filters.genre && !m.genres.includes(filters.genre)) return false;
    if (filters.year && mockYear(m) !== filters.year) return false;
    return true;
  });

  // The catalog carries no popularity score, so "Popularity" keeps its curated
  // order rather than inventing a ranking.
  const sorted = sortByBrowse(matched, filters.sort);

  const totalPages = Math.ceil(sorted.length / MOCK_PAGE_SIZE);
  const start = (filters.page - 1) * MOCK_PAGE_SIZE;
  return {
    items: sorted.slice(start, start + MOCK_PAGE_SIZE).map(toSummary),
    page: filters.page,
    totalPages,
  };
}

// ------------------------------- PUBLIC API --------------------------------

export function isLiveMetadata(): boolean {
  return USE_LIVE;
}

export async function getHomeRows(): Promise<MediaRow[]> {
  if (USE_LIVE) {
    const rows = await liveHomeRows();
    if (rows.length) return rows;
  }
  return mockHomeRows();
}

export async function getHeroItems(): Promise<MediaSummary[]> {
  if (USE_LIVE) {
    const rows = await liveHomeRows();
    const trending = rows.find((r) => r.key === "trending")?.items ?? [];
    if (trending.length) return trending.slice(0, 5);
  }
  return mockHero();
}

export async function getMediaDetail(
  type: MediaType,
  tmdbId: number
): Promise<Media | null> {
  if (USE_LIVE) {
    const detail = await liveDetail(type, tmdbId);
    if (detail) return detail;
  }
  const local = MOCK_MEDIA.find((m) => m.type === type && m.tmdbId === tmdbId);
  if (!local) return null;
  return { ...local, recommendations: mockRecommendations(local) };
}

export async function searchMedia(query: string): Promise<MediaSummary[]> {
  if (!query.trim()) return [];
  if (USE_LIVE) return liveSearch(query);
  return mockSearch(query);
}

/** One page of browse results for the given filters. */
export async function getBrowseResults(filters: BrowseFilters): Promise<BrowsePage> {
  if (USE_LIVE) {
    const page = await liveBrowse(filters);
    // null means every TMDB request failed — fall back to the local catalog
    // rather than showing an empty grid.
    if (page) return page;
  }
  return mockBrowse(filters);
}

/**
 * Filter options that the current metadata source can actually satisfy.
 *
 * Live: the TMDB genres that exist for this content type, and every year TMDB has
 * usable coverage for. Local catalog: only the genres and years present in it —
 * so the dropdowns never offer a combination that must come back empty.
 */
export function getBrowseOptions(type: BrowseType): BrowseOptions {
  if (USE_LIVE) {
    const genres = BROWSE_GENRES.filter((g) =>
      type === "all" ? g.movieId || g.tvId : type === "movie" ? g.movieId : g.tvId
    ).map((g) => g.name);
    const latest = new Date().getFullYear();
    const years: number[] = [];
    for (let y = latest; y >= EARLIEST_BROWSE_YEAR; y--) years.push(y);
    return { genres, years };
  }

  const pool = MOCK_MEDIA.filter((m) => type === "all" || m.type === type);
  const genres = Array.from(new Set(pool.flatMap((m) => m.genres))).sort();
  const years = Array.from(
    new Set(pool.map(mockYear).filter((y): y is number => y !== null))
  ).sort((a, b) => b - a);
  return { genres, years };
}
