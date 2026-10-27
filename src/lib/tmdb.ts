import "server-only";

import { cache } from "react";
import type { BrowseFilters, BrowseSort, BrowseType } from "@/lib/browse";
import { MOCK_MEDIA } from "@/lib/mock";
import { mediaId } from "@/lib/utils";
import type { Episode, Media, MediaRow, MediaSummary, MediaType } from "@/types";
import { ANILIST_GENRES, anilistBrowse, anilistDetail, anilistSearch, anilistTrending } from "@/lib/anilist";

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
      key: "anime",
      title: "Anime",
      items: all.filter((m) => hasGenre(m, ["Animation"])).map(toSummary),
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

  return rows.map((r) => ({ ...r, items: r.items.map(compactForCard) })).filter((r) => r.items.length > 0);
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
    // Raw genre ids + original language — the search API uses these to drop
    // TMDB anime entries that duplicate an AniList result.
    genreIds: Array.isArray(raw.genre_ids) ? raw.genre_ids : undefined,
    originalLanguage: raw.original_language || undefined,
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
/**
 * "Prepare for Doomsday" (reference pattern): a curated catch-up list — the
 * exact titles, in the exact order, the operator wants viewers to watch before
 * the next Avengers. Movies and series mix, so each entry carries its type.
 * Every id below was verified to resolve to exactly the title named.
 */
const DOOMSDAY_WATCH_ORDER: { id: number; type: MediaType }[] = [
  { id: 36657, type: "movie" }, // X-Men
  { id: 36658, type: "movie" }, // X2: X-Men United
  { id: 1771, type: "movie" }, // Captain America: The First Avenger
  { id: 24428, type: "movie" }, // The Avengers
  { id: 299536, type: "movie" }, // Avengers: Infinity War
  { id: 299534, type: "movie" }, // Avengers: Endgame
  { id: 84958, type: "tv" }, // Loki
  { id: 566525, type: "movie" }, // Shang-Chi and the Legend of the Ten Rings
  { id: 634649, type: "movie" }, // Spider-Man: No Way Home
  { id: 453395, type: "movie" }, // Doctor Strange in the Multiverse of Madness
  { id: 505642, type: "movie" }, // Black Panther: Wakanda Forever
  { id: 533535, type: "movie" }, // Deadpool & Wolverine
  { id: 822119, type: "movie" }, // Captain America: Brave New World
  { id: 986056, type: "movie" }, // Thunderbolts*
  { id: 617126, type: "movie" }, // The Fantastic 4: First Steps
  { id: 969681, type: "movie" }, // Spider-Man: Brand New Day
];

/** Map a raw /movie/{id} or /tv/{id} payload to a card summary. */
function rawTitleSummary(raw: any, type: MediaType): MediaSummary | null {
  if (!raw?.id) return null;
  return {
    id: mediaId(type, raw.id),
    tmdbId: raw.id,
    type,
    title: raw.title ?? raw.name ?? "Untitled",
    posterUrl: img(raw.poster_path, "w500"),
    backdropUrl: img(raw.backdrop_path, "w1280"),
    rating: raw.vote_average || undefined,
    releaseDate: raw.release_date || raw.first_air_date || undefined,
    genres: Array.isArray(raw.genres) ? raw.genres.map((g: any) => g.name) : [],
    overview: raw.overview || undefined,
  };
}

const doomsdayWatchOrder = cache(async (): Promise<MediaSummary[]> => {
  const details = await Promise.all(
    DOOMSDAY_WATCH_ORDER.map(({ id, type }) => tmdb(`/${type}/${id}`, {}, 60 * 60 * 24))
  );
  return details
    .map((d, i) => (d ? rawTitleSummary(d, DOOMSDAY_WATCH_ORDER[i].type) : null))
    .filter((m): m is MediaSummary => m !== null);
});

/** Recency floor for genre/editorial rows — keeps sections feeling current. */
const threeYearsAgo = `${new Date().getFullYear() - 3}-01-01`;
const todayISO = new Date().toISOString().slice(0, 10);

/**
 * Row/grid cards render poster + title + year/rating only — overview text and
 * the backdrop never appear in card UIs, but they dominated the streamed HTML
 * payload (home page measured 537KB). Strip them at the source; the hero and
 * detail views fetch/keep full summaries.
 */
function compactForCard(item: MediaSummary): MediaSummary {
  return { ...item, overview: undefined, backdropUrl: undefined };
}

const liveHomeRows = cache(async (): Promise<MediaRow[]> => {

  const [
    trending,
    top,
    popMovies,
    popTv,
    topRated,
    scifi,
    action,
    comedy,
    india,
    bollywood,
    editors,
    animeTv,
    animeMovie,
  ] = await Promise.all([
    tmdb("/trending/movie/week", { language: "en-US", include_adult: "false" }, 60 * 15),
    tmdb("/trending/all/day", { language: "en-US", include_adult: "false" }, 60 * 15),
    tmdb("/movie/popular", { language: "en-US" }, 60 * 30),
    tmdb("/tv/popular", { language: "en-US" }, 60 * 30),
    tmdb("/movie/top_rated", { language: "en-US" }, 60 * 60),
    // Genre rows: recency-biased (last 3 years) so rows feel current.
    tmdb("/discover/movie", {
      with_genres: "878",
      sort_by: "popularity.desc",
      language: "en-US",
      "primary_release_date.gte": threeYearsAgo,
    }),
    tmdb("/discover/movie", {
      with_genres: "28",
      sort_by: "popularity.desc",
      language: "en-US",
      "primary_release_date.gte": threeYearsAgo,
    }),
    tmdb("/discover/movie", {
      with_genres: "35",
      sort_by: "popularity.desc",
      language: "en-US",
      "primary_release_date.gte": threeYearsAgo,
    }),
    // TMDB's region parameter on /movie/popular — a real India-specific ranking.
    tmdb("/movie/popular", { region: "IN", language: "en-US" }, 60 * 60),
    // Bollywood: one curated row mixing the best of Hindi cinema —
    // most anticipated (upcoming, like Ramayana), latest 7+ rated releases,
    // and box office superhits. Interleaved so the row reads fresh throughout.
    tmdb("/discover/movie", {
      with_original_language: "hi",
      sort_by: "popularity.desc",
      language: "en-US",
      include_adult: "false",
      "vote_count.gte": "1",
    }, 60 * 30),
    // Editor's choices: high-rated, but restricted to recent + enough votes.
    tmdb("/discover/movie", {
      sort_by: "vote_average.desc",
      language: "en-US",
      "vote_count.gte": "500",
      "vote_average.gte": "7",
      "primary_release_date.gte": threeYearsAgo,
    }),
    // Anime row: same cross-type definition as the /anime page — Japanese
    // originals with the Animation genre, both series and films.
    tmdb("/discover/tv", {
      with_genres: "16",
      with_original_language: "ja",
      sort_by: "popularity.desc",
      include_adult: "false",
    }, 60 * 30),
    tmdb("/discover/movie", {
      with_genres: "16",
      with_original_language: "ja",
      sort_by: "popularity.desc",
      include_adult: "false",
    }, 60 * 30),
  ]);

  // Anime row is AniList-native (trending right now) — the two TMDB discover
  // fetches remain only as the fallback when AniList is unreachable.
  const anilistRow = await anilistTrending(18);

  const newPopular = [...liveList(popMovies, "movie"), ...liveList(popTv, "tv")]
    .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""))
    .slice(0, 16);

  // The curated Doomsday watch-order is fetched separately (per-id, cached).
  const mcu = await doomsdayWatchOrder();

  // ---- Bollywood curation: one row mixing the best Hindi cinema has ----
  // Pull from the popularity-ranked Hindi pool and interleave three tiers:
  //   1. Most anticipated (upcoming, massive buzz — e.g. Ramayana)
  //   2. Latest quality releases (released in the last year, rating ≥ 7)
  //   3. Box office superhits (already popular + released — blockbusters)
  // Deduped and capped at 18 so the row is rich but scannable.
  let bollywoodRow: MediaSummary[] = [];
  {
    const all = liveList(bollywood, "movie").filter((m) => m.posterUrl);
    const upcoming = all
      .filter((m) => (m.releaseDate ?? "") > todayISO)
      .slice(0, 3);
    const qualityRecent = all
      .filter(
        (m) =>
          (m.releaseDate ?? "") <= todayISO &&
          (m.releaseDate ?? "") >= `${new Date().getFullYear() - 1}-01-01` &&
          (m.rating ?? 0) >= 7
      )
      .slice(0, 8);
    const blockbusters = all
      .filter((m) => (m.releaseDate ?? "") <= todayISO)
      .slice(0, 8);
    const seen = new Set<string>();
    for (const m of [...upcoming, ...qualityRecent, ...blockbusters]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      bollywoodRow.push(m);
      if (bollywoodRow.length >= 18) break;
    }
  }

  const rows: MediaRow[] = [
    { key: "trending", title: "Trending Now", items: liveList(trending).slice(0, 16) },
    { key: "top10", title: "Top 10 Today", ranked: true, items: liveList(top).slice(0, 10) },
    { key: "topIndia", title: "Top Movies in India", items: liveList(india, "movie").slice(0, 16) },
    { key: "bollywood", title: "Bollywood", items: bollywoodRow },
    {
      key: "doomsday",
      title: "Prepare for Doomsday",
      items: mcu,
    },
    {
      key: "anime",
      title: "Anime",
      items:
        anilistRow.length > 0
          ? anilistRow
          : interleave(liveList(animeTv, "tv"), liveList(animeMovie, "movie")).slice(0, 18),
    },
    { key: "new", title: "New & Popular", items: newPopular },
    { key: "acclaimed", title: "Critically Acclaimed", items: liveList(topRated, "movie").slice(0, 16) },
    { key: "editors", title: "Editor's Choices", items: liveList(editors, "movie").slice(0, 16) },
    { key: "scifi", title: "Sci-Fi & Fantasy", items: liveList(scifi, "movie").slice(0, 16) },
    { key: "action", title: "Action & Adventure", items: liveList(action, "movie").slice(0, 16) },
    { key: "feelgood", title: "Comedy & Feel-Good", items: liveList(comedy, "movie").slice(0, 16) },
  ];
  return rows.map((r) => ({ ...r, items: r.items.map(compactForCard) })).filter((r) => r.items.length > 0);
});

// Watch-provider directory (TMDB /watch/providers), ordered by TMDB's own
// display priority. Real logos come from the provider records themselves.
export interface WatchProvider {
  id: number;
  name: string;
  logoUrl: string;
}

/**
 * Providers TMDB catalogs outside the US region that the operator pins onto
 * the (US-based) provider rail anyway. Every field is copied verbatim from
 * TMDB's own watch-provider list for the entry's region — never guessed.
 * Their catalog pages and Source-filter queries ride that region instead of
 * the US one (providerRegion), and the rail logo comes from the bundled
 * wordmark (TMDB only carries the square app icon).
 */
const PINNED_REGIONAL_PROVIDERS: (WatchProvider & { region: string })[] = [
  // JioHotstar — TMDB lists it under watch_region=IN only (id 2336, display
  // priority 3 in India; verified against /watch/providers/movie?watch_region=IN).
  {
    id: 2336,
    name: "JioHotstar",
    logoUrl: "https://image.tmdb.org/t/p/w300/ledoS6EgdjTNq8F1e6wubUQer18.png",
    region: "IN",
  },
];

/** The region a provider's TMDB catalog actually lives in (fallback = US). */
export function providerRegion(providerId: number, fallback = "US"): string {
  const hit = PINNED_REGIONAL_PROVIDERS.find((p) => p.id === providerId);
  return hit ? hit.region : fallback;
}

export async function getWatchProviders(
  region = "US",
  kind: "movie" | "tv" = "movie"
): Promise<WatchProvider[]> {
  if (!USE_LIVE) return [];
  const data = await tmdb<{ results?: any[] }>(
    `/watch/providers/${kind}`,
    { watch_region: region },
    60 * 60 * 24
  );
  if (!data?.results?.length) return [];
  // Full list, priority-ordered — NEVER slice here. Consumers dedupe by brand
  // family afterwards, and the flagship variant ("HBO Max", not "HBO Max
  // Amazon Channel") can sit past position 100 in TMDB's ordering; a truncated
  // list loses it and the reseller wins the tiebreak instead.
  const list = data.results
    .slice()
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map((p) => ({
      id: p.provider_id as number,
      name: (p.provider_name as string) ?? "Provider",
      logoUrl: p.logo_path ? img(p.logo_path, "w300") ?? "" : "",
    }))
    .filter((p) => p.logoUrl !== "");
  // Pin the regional entries into the US display list — TMDB's US catalog
  // never includes them, and the rail, directory and Source dropdown all read
  // this list. Region-aware consumers resolve their catalog via providerRegion.
  if (region === "US") {
    for (const pinned of PINNED_REGIONAL_PROVIDERS) {
      if (pinned.logoUrl && !list.some((p) => p.id === pinned.id)) {
        list.push({ id: pinned.id, name: pinned.name, logoUrl: pinned.logoUrl });
      }
    }
  }
  return list;
}

/** One page of titles for a watch provider (real provider-filtered catalog). */
export async function getProviderTitles(
  providerId: number,
  page: number,
  region = "US",
  query?: string
): Promise<MediaSummary[]> {
  if (!USE_LIVE) return [];
  const params: Record<string, string> = {
    with_watch_providers: String(providerId),
    // Pinned regional providers catalog in their own region (JioHotstar = IN).
    watch_region: providerRegion(providerId, region),
    sort_by: "popularity.desc",
    page: String(Math.max(1, page)),
  };
  const q = query?.trim();
  if (!q) {
    const data = await tmdb("/discover/movie", params);
    return liveList(data, "movie");
  }
  // A search spans both catalogs — queries like "Wednesday" or "Foundation"
  // are series, and a movie-only search would report misses for titles the
  // provider actually carries. Results interleave and cap at one page.
  const [movies, tv] = await Promise.all([
    tmdb("/discover/movie", { ...params, with_text_query: q }),
    tmdb("/discover/tv", { ...params, with_text_query: q }),
  ]);
  return interleave(liveList(movies, "movie"), liveList(tv, "tv")).slice(0, 20);
}

export async function getProviderName(
  providerId: number,
  region = "US"
): Promise<WatchProvider | null> {
  const all = await getWatchProviders(region, "movie");
  return all.find((p) => p.id === providerId) ?? null;
}

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
    append_to_response: "credits,recommendations,videos",
  });
  if (!data) return null;

  const genres: string[] = (data.genres ?? []).map((g: any) => g.name);
  const cast = (data.credits?.cast ?? []).slice(0, 12).map((c: any) => ({
    id: c.id,
    name: c.name,
    character: c.character,
    profileUrl: img(c.profile_path, "w185"),
  }));
  const recommendations = liveList(data.recommendations, type)
    .slice(0, 12)
    .map(compactForCard);

  // Official trailer: TMDB's videos list — official YouTube trailers first,
  // most recent first. Real data only; no trailer means the section hides.
  const videos: any[] = data.videos?.results ?? [];
  const trailer =
    videos
      .filter((v) => v.site === "YouTube" && /trailer/i.test(v.type || ""))
      .sort((a, b) => (b.official === true ? 1 : 0) - (a.official === true ? 1 : 0))
      .find(Boolean) ?? videos.find((v) => v.site === "YouTube");

  // Seasons ship as METADATA only (number, name, count) with no cap —
  // long-running anime (Naruto: Shippuden's 22, One Piece's 20+) used to be
  // truncated at 8 because every season's episodes were fetched and embedded
  // here. Episodes load per season on demand (getSeasonEpisodes + /api/seasons).
  let seasons;
  if (type === "tv" && Array.isArray(data.seasons)) {
    seasons = data.seasons
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({
        seasonNumber: s.season_number as number,
        name: (s.name as string) ?? `Season ${s.season_number}`,
        episodeCount: (s.episode_count as number) ?? 0,
      }));
  }

  // Detail-hero extras, same treatment the homepage hero gets: official title
  // logo artwork + the US certification. Both helpers carry their own long
  // TMDB caches, so this adds no meaningful cost to the dynamic detail route.
  const [certification, logoUrl] = await Promise.all([
    getCertification(type, tmdbId),
    getTitleLogo(type, tmdbId),
  ]);

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
    trailerKey: trailer?.key,
    trailerName: trailer?.name,
    certification,
    logoUrl,
  };
});

async function liveSearch(query: string): Promise<MediaSummary[]> {
  const data = await tmdb("/search/multi", { query, include_adult: "false" }, 60 * 5);
  return liveList(data);
}

/** Type-scoped search (page-level search bars): only films, or only series. */
async function liveSearchScoped(
  query: string,
  type: "movie" | "tv"
): Promise<MediaSummary[]> {
  const data = await tmdb(`/search/${type}`, { query, include_adult: "false" }, 60 * 5);
  return liveList(data, type);
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

// Anime never reaches TMDB discover (its browse goes to AniList), but the
// record is total over MediaType so the anime entry is a documented stub.
// "f1" is live-only and likewise never reaches discover.
const SORT_FIELD: Record<BrowseSort, Record<MediaType, string>> = {
  popularity: {
    movie: "popularity.desc",
    tv: "popularity.desc",
    anime: "",
    f1: "",
  },
  latest: {
    movie: "primary_release_date.desc",
    tv: "first_air_date.desc",
    anime: "",
    f1: "",
  },
  oldest: {
    movie: "primary_release_date.asc",
    tv: "first_air_date.asc",
    anime: "",
    f1: "",
  },
  rating: {
    movie: "vote_average.desc",
    tv: "vote_average.desc",
    anime: "",
    f1: "",
  },
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

  // Anime is Japanese animation across BOTH media types: Animation (16)
  // AND-combined with any picked genre, original language Japanese. The
  // industry toggle does not apply here — the page is already language-scoped.
  const anime = filters.type === "anime";
  const genreId = genreIdFor(filters.genre, type);
  if (anime) {
    params.with_genres = ["16", genreId].filter(Boolean).join(",");
    params.with_original_language = "ja";
  } else {
    if (genreId) params.with_genres = String(genreId);
    // Industry toggle (header slide control): Bollywood = Indian cinema across
    // its major languages (pipe = OR in TMDB's discover), Hollywood = English
    // originals. The industry owns all language narrowing — there is no
    // Bollywood genre option in the dropdown.
    if (filters.industry === "bollywood") {
      params.with_original_language = "hi|ta|te|kn|ml|mr|bn|pa|gu";
    } else if (filters.industry === "hollywood") {
      params.with_original_language = "en";
    }
  }
  // "Source" filter: TMDB watch-provider availability (US region).
  if (filters.provider) {
    params.with_watch_providers = String(filters.provider);
    // Pinned regional providers catalog in their own region (JioHotstar = IN).
    params.watch_region = providerRegion(filters.provider);
  }

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
    filters.type === "all" || filters.type === "anime" ? ["movie", "tv"] : [filters.type];

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

  return { items: items.map(compactForCard), page: filters.page, totalPages };
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
    if (filters.type === "anime" && !m.genres.includes("Animation")) return false;
    else if (filters.type !== "all" && filters.type !== "anime" && m.type !== filters.type)
      return false;
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

/** Idle-state seed for the search overlay: today's trending titles. */
export async function getTrendingSeed(): Promise<MediaSummary[]> {
  if (USE_LIVE) {
    const data = await tmdb("/trending/all/day", {}, 60 * 30);
    const list = liveList(data).slice(0, 8);
    if (list.length) return list;
  }
  const mock = mockHomeRows().find((r) => r.key === "trending");
  return (mock?.items ?? []).slice(0, 8);
}

// ------------------------- curated "My Feed" pools --------------------------
// Pool definitions live in feed-pools.ts (pure data, shared with the client
// row); this side only knows how to fetch one pool.
import type { FeedPool } from "@/lib/feed-pools";
export type { FeedPool } from "@/lib/feed-pools";
export { FEED_POOLS } from "@/lib/feed-pools";

/**
 * One curated all-time pool. Vote floors keep `vote_average.desc` from
 * surfacing unrated titles; TV floors sit lower because reality/documentary
 * series legitimately carry fewer votes than movies.
 */
export async function fetchFeedPool(pool: FeedPool): Promise<MediaSummary[]> {
  if (!USE_LIVE) return [];
  const path = pool.kind === "movie" ? "/discover/movie" : "/discover/tv";
  const params: Record<string, string> = {
    sort_by: "vote_average.desc",
    include_adult: "false",
    "vote_count.gte": pool.kind === "movie" ? "1500" : "300",
  };
  if (pool.genreId && pool.id !== "korean-tv") {
    params.with_genres = String(pool.genreId);
  }
  if (pool.id === "korean-tv") {
    params.with_original_language = "ko";
  }
  const data = await tmdb(path, params, 60 * 60 * 12);
  return liveList(data, pool.kind).slice(0, 24).map(compactForCard);
}

export async function getHomeRows(): Promise<MediaRow[]> {
  if (USE_LIVE) {
    const rows = await liveHomeRows();
    if (rows.length) return rows;
  }
  return mockHomeRows();
}

/**
 * Official title-logo artwork (the movie/series' own logotype, like the
 * reference hero). Prefers wide English logos, then language-free ones, then
 * anything TMDB ranks highly — text fallback covers the rest.
 */
async function getTitleLogo(
  type: MediaType,
  tmdbId: number
): Promise<string | undefined> {
  const path = type === "movie" ? `/movie/${tmdbId}/images` : `/tv/${tmdbId}/images`;
  const data = await tmdb<{ logos?: any[] }>(
    path,
    { include_image_language: "en,null" },
    60 * 60 * 24 * 7
  );
  const logos = (data?.logos ?? []).filter((l) => l.file_path);
  if (!logos.length) return undefined;
  const rank = (l: any) =>
    (l.iso_639_1 === "en" ? 4 : l.iso_639_1 ? 1 : 2) +
    ((l.width ?? 0) > (l.height ?? 1) ? 2 : 0) +
    Math.min((l.vote_average ?? 0) / 10, 0.9);
  logos.sort((a, b) => rank(b) - rank(a));
  return img(logos[0].file_path, "w500") ?? undefined;
}

/** US content rating for one title (hero meta chip; reference pattern). */
async function getCertification(
  type: MediaType,
  tmdbId: number
): Promise<string | undefined> {
  if (type === "movie") {
    const data = await tmdb<{ results?: any[] }>(
      `/movie/${tmdbId}/release_dates`,
      {},
      60 * 60 * 24
    );
    const us = data?.results?.find((r: any) => r.iso_3166_1 === "US");
    const cert = us?.release_dates?.find((r: any) => r.certification)?.certification;
    return cert || undefined;
  }
  const data = await tmdb<{ results?: any[] }>(
    `/tv/${tmdbId}/content_ratings`,
    {},
    60 * 60 * 24
  );
  const us = data?.results?.find((r) => r.iso_3166_1 === "US");
  return us?.rating || undefined;
}

/** The single Indian hero slot: pinned to Ramayana: Rise of a Legend
    (TMDB 656908, India's most anticipated film). Falls back to the most
    popular upcoming Hindi title if the lookup ever fails. */
async function getIndianHero(): Promise<MediaSummary | null> {
  // Pinned: Ramayana: Rise of a Legend (2026).
  const ramayana = await tmdb("/movie/656908", { language: "en-US" }, 60 * 60);
  const pinned = ramayana ? rawTitleSummary(ramayana, "movie") : null;
  if (pinned?.posterUrl && pinned?.backdropUrl) return pinned;

  // Fallback: most popular upcoming Hindi title with full artwork.
  const data = await tmdb("/discover/movie", {
    with_original_language: "hi",
    sort_by: "popularity.desc",
    language: "en-US",
    include_adult: "false",
    "vote_count.gte": "1",
  }, 60 * 30);
  const today = todayISO;
  const list = liveList(data, "movie").filter(
    (m) => m.posterUrl && m.backdropUrl
  );
  const upcoming = list.find((m) => (m.releaseDate ?? "") > today);
  return upcoming ?? list[0] ?? null;
}

export async function getHeroItems(): Promise<MediaSummary[]> {
  if (USE_LIVE) {
    const today = todayISO;
    const [trending, indian] = await Promise.all([
      tmdb("/trending/movie/week", {
        language: "en-US",
        include_adult: "false",
      }, 60 * 15),
      getIndianHero(),
    ]);

    // Hollywood slots: trending this week, released, full artwork.
    const released = liveList(trending, "movie").filter(
      (m) =>
        m.posterUrl &&
        m.backdropUrl &&
        m.releaseDate &&
        m.releaseDate <= today
    );
    // 1 Indian + 4 Hollywood, Indian first.
    const picks: MediaSummary[] = [];
    if (indian) picks.push(indian);
    for (const m of released) {
      if (picks.length >= 5) break;
      if (indian && m.tmdbId === indian.tmdbId) continue;
      picks.push(m);
    }
    if (picks.length >= 3) {
      return Promise.all(
        picks.map(async (item) => ({
          ...item,
          certification: await getCertification(item.type, item.tmdbId),
          logoUrl: await getTitleLogo(item.type, item.tmdbId),
        }))
      );
    }
  }
  return mockHero();
}

/**
 * Official title-logo artwork for an AniList anime (AniList carries no
 * logos): search TMDB by title — year-scoped first, then loose — and take
 * the best hit's logo. Best-effort by design; wrong or absent matches fall
 * back to the styled text title in the hero.
 */
/** Title search core shared by the root match and per-season chain matches. */
async function matchTmdbTitle(
  title: string,
  year: number | undefined,
  kind: "tv" | "movie",
  withLogo: boolean
): Promise<{ tmdbId?: number; logoUrl?: string } | null> {
  const yearKey = kind === "tv" ? "first_air_date_year" : "primary_release_year";
  const attempts: Record<string, string>[] = [];
  if (year) attempts.push({ query: title, [yearKey]: String(year), include_adult: "false" });
  attempts.push({ query: title, include_adult: "false" });
  for (const params of attempts) {
    const data = await tmdb<{ results?: any[] }>(`/search/${kind}`, params, 60 * 60);
    const hit = data?.results?.[0];
    if (!hit) continue;
    if (!withLogo) return { tmdbId: hit.id as number };
    const logoUrl = await getTitleLogo(kind, hit.id);
    return { tmdbId: hit.id as number, ...(logoUrl ? { logoUrl } : {}) };
  }
  return null;
}

async function anilistTmdbMatch(
  media: Media
): Promise<{ tmdbId?: number; logoUrl?: string } | null> {
  // Series anime matches TMDB's tv side; MOVIE-format anime the movie side —
  // mirroring how TMDB catalogs each. Year-scoped search first, then loose.
  const kind: "tv" | "movie" =
    media.seasons && media.seasons.length > 0 ? "tv" : "movie";
  const year = media.releaseDate ? Number(media.releaseDate.slice(0, 4)) : undefined;
  return matchTmdbTitle(media.title, year, kind, true);
}

export async function getMediaDetail(
  type: MediaType,
  tmdbId: number
): Promise<Media | null> {
  // Anime is AniList-backed: the id IS an AniList id and the payload (single
  // "Episodes" season of numbered stubs, AniList recommendations) comes from
  // the GraphQL API. No TMDB fallback exists for anime ids. The one TMDB
  // enrichment is the official title-logo artwork (AniList has none): a
  // best-effort title+year match — a miss simply keeps the text title.
  if (type === "anime") {
    const anime = await anilistDetail(tmdbId);
    if (!anime) return null;
    const match = await anilistTmdbMatch(anime);
    // Franchise chain seasons carry their own AniList ids; resolve each
    // entry's TMDB twin so per-season playback can address {tmdbId} anime
    // providers with the right show (logo art is a root-only concern).
    const seasons = (anime.seasons ?? []).map((s) => ({ ...s }));
    for (const s of seasons) {
      if (s.anilistId == null) continue;
      if (s.anilistId === tmdbId) {
        if (match?.tmdbId) s.resolvedTmdbId = match.tmdbId;
        continue;
      }
      const sMatch = await matchTmdbTitle(s.name, undefined, "tv", false);
      if (sMatch?.tmdbId) s.resolvedTmdbId = sMatch.tmdbId;
    }
    return {
      ...anime,
      ...(seasons.length ? { seasons } : {}),
      ...(match?.logoUrl ? { logoUrl: match.logoUrl } : {}),
      ...(match?.tmdbId ? { resolvedTmdbId: match.tmdbId } : {}),
    };
  }
  if (USE_LIVE) {
    const detail = await liveDetail(type, tmdbId);
    if (detail) return detail;
  }
  const local = MOCK_MEDIA.find((m) => m.type === type && m.tmdbId === tmdbId);
  if (!local) return null;
  return { ...local, recommendations: mockRecommendations(local) };
}

/** Episodes of ONE season — the lazy half of the season model above. */
export async function getSeasonEpisodes(
  tmdbId: number,
  seasonNumber: number
): Promise<Episode[]> {
  if (USE_LIVE) {
    const sd = await tmdb(`/tv/${tmdbId}/season/${seasonNumber}`, {}, 60 * 60 * 24);
    if (sd?.episodes) {
      return (sd.episodes as any[]).map(mapEpisode);
    }
  }
  // Bundled-catalog fallback (offline mode inlines episodes per season).
  const local = MOCK_MEDIA.find(
    (m) => m.type === "tv" && m.tmdbId === tmdbId
  );
  return local?.seasons?.find((s) => s.seasonNumber === seasonNumber)?.episodes ?? [];
}

function mapEpisode(e: any): Episode {
  return {
    id: `s${e.season_number}e${e.episode_number}`,
    seasonNumber: e.season_number,
    episodeNumber: e.episode_number,
    title: e.name,
    overview: e.overview,
    runtime: e.runtime,
    stillUrl: img(e.still_path, "w300"),
    rating: e.vote_average || undefined,
    airDate: e.air_date,
  };
}

export async function searchMedia(
  query: string,
  opts?: { type?: MediaType; anilistTmdbId?: number | null }
): Promise<MediaSummary[]> {
  if (!query.trim()) return [];
  // Anime-section search: AniList titles (the anime catalog), AniList only —
  // a failed AniList call must not leak TMDB movie/series results onto the
  // anime page. When the title has a resolved TMDB match, its TMDB entry is
  // dropped so the section's own detail page isn't offered as a duplicate.
  if (opts?.type === "anime") {
    const anime = await anilistSearch(query, 20);
    const filtered = opts.anilistTmdbId
      ? anime.filter((a) => a.tmdbId !== opts.anilistTmdbId)
      : anime;
    return filtered.length ? filtered : anime;
  }
  if (USE_LIVE) {
    if (opts?.type === "movie" || opts?.type === "tv") {
      return liveSearchScoped(query, opts.type);
    }
    return liveSearch(query);
  }
  return mockSearch(query).filter((r) => !opts?.type || r.type === opts.type);
}

/** One page of browse results for the given filters. */
export async function getBrowseResults(filters: BrowseFilters): Promise<BrowsePage> {
  // Anime browse is AniList-native (ids are AniList ids). The TMDB discover
  // path below stays as a fallback if AniList is unreachable, then the
  // bundled catalog as the last resort.
  if (filters.type === "anime") {
    const anime = await anilistBrowse(filters);
    if (anime) return anime;
  }
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
    const genres =
      type === "anime"
        ? // AniList-backed page — AniList's own genre vocabulary.
          [...ANILIST_GENRES]
        : BROWSE_GENRES.filter(
            (g) =>
              type === "all"
                ? g.movieId || g.tvId
                : type === "movie"
                  ? g.movieId
                  : g.tvId
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
