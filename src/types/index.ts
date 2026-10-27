// Internal domain model for Reelhouse.
// These types are provider-agnostic: TMDB (or any future source) is mapped
// into these shapes in lib/tmdb, and the UI only ever depends on these.

/**
 * "anime" is AniList-backed end to end: ids are ANILIST ids and the detail /
 * watch routes live under /anime. Movies and series remain TMDB-backed.
 *
 * "f1" is the live channel surface (/watch/f1). It has no TMDB catalog entry,
 * no episodes and no watch history; catalog/search code must keep excluding it.
 */
export type MediaType = "movie" | "tv" | "anime" | "f1";

export interface CastMember {
  id: number;
  name: string;
  character?: string;
  profileUrl?: string;
}

export interface Episode {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview?: string;
  runtime?: number;
  stillUrl?: string;
  airDate?: string;
  /** Episode rating (watch-page episode card). */
  rating?: number;
  /**
   * Anime: the AniList entry this episode belongs to. Franchise chains
   * aggregate each season's entry, and every provider template addressing
   * anime ({anilistId}) must use the episode's own entry id.
   */
  anilistId?: number;
}

export interface Season {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  /**
   * Anime chains: the AniList entry this season aggregates (and its resolved
   * TMDB twin, when one exists) so playback addresses the right entry.
   */
  anilistId?: number;
  resolvedTmdbId?: number;
  /**
   * Loaded lazily per season (via /api/seasons) on the detail and watch
   * pages — long-running shows carry dozens of seasons and eagerly shipping
   * every episode made detail pages huge and capped seasons at 8. Bundled
   * mock data still inlines them.
   */
  episodes?: Episode[];
}

export interface Media {
  /** Internal stable id, e.g. "movie-603" */
  id: string;
  tmdbId: number;
  type: MediaType;
  title: string;
  overview: string;
  posterUrl?: string;
  backdropUrl?: string;
  /** 0–10 */
  rating?: number;
  releaseDate?: string;
  genres: string[];
  runtime?: number;
  tagline?: string;
  cast?: CastMember[];
  recommendations?: MediaSummary[];
  seasons?: Season[];
  /** Official YouTube trailer key (watch-page trailer section). */
  trailerKey?: string;
  /** Official trailer title from TMDB (e.g. "Final Trailer"). */
  trailerName?: string;
  /** US content rating, e.g. "PG-13" / "TV-MA" (detail hero meta). */
  certification?: string;

  /**
   * ANIME ONLY: the TMDB entry (tv for series, movie for films) matched by
   * title+year — providers whose anime embeds are TMDB-id based (Cineverse,
   * GD Mirror, VidOut) expand {tmdbId} from this. Undefined when no match.
   */
  resolvedTmdbId?: number;
  /** Official title-logo artwork (TMDB images), used by the detail hero. */
  logoUrl?: string;
}

/** Lightweight shape used for cards and rows. */
export interface MediaSummary {
  id: string;
  tmdbId: number;
  type: MediaType;
  title: string;
  posterUrl?: string;
  backdropUrl?: string;
  rating?: number;
  releaseDate?: string;
  genres: string[];
  overview?: string;
  /** Raw TMDB genre ids (search results only — search dedup uses these). */
  genreIds?: number[];
  /** TMDB original language (search results only). */
  originalLanguage?: string;
  /** Content rating for the US region, e.g. "PG-13" / "TV-MA" (hero meta). */
  certification?: string;
  /** Official title-logo artwork (TMDB images), used by the hero when present. */
  logoUrl?: string;
}

export interface MediaRow {
  key: string;
  title: string;
  items: MediaSummary[];
  /** Render with 1..N rank badges (used by the "Top 10" row). */
  ranked?: boolean;
}

/** Normalized playback source returned by any VideoProvider. */
export interface SubtitleTrack {
  label: string;
  srcLang: string;
  url: string;
}

export interface VideoSource {
  playbackUrl: string;
  type: "hls" | "dash" | "mp4" | "youtube";
  subtitles?: SubtitleTrack[];
  poster?: string;
  /** Human-readable note about where this stream comes from. */
  sourceLabel: string;
  /** True when this is a bundled freely-licensed sample clip, not licensed content. */
  isSample: boolean;
  expiresAt?: string;
}

/**
 * A user-selectable playback server, normalized by the VideoProvider layer.
 *
 * With nothing connected these all resolve to the bundled freely-licensed sample
 * clips — they exist to exercise the player's server-picker UI. A real provider
 * returns the same shape from its own catalogue, so no player component needs to
 * change. The UI treats this as opaque data: it never knows or cares which
 * concrete provider produced it.
 */
export interface PlaybackServer {
  /** Stable id used for selection/favorite state. */
  id: string;
  /** Display name of the source (original, not a real third-party brand). */
  name: string;
  /** Audio-track description, e.g. "Original audio", "Hindi audio". */
  audioLabel: string;
  /** ISO 3166-1 alpha-2 region code shown as a small badge, e.g. "US". */
  countryCode: string;
  /** Short quality hint, e.g. "Up to 4K", "1080p". */
  qualityLabel: string;
  /** The normalized source this server resolves to. */
  source: VideoSource;
}
