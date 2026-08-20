// Internal domain model for Reelhouse.
// These types are provider-agnostic: TMDB (or any future source) is mapped
// into these shapes in lib/tmdb, and the UI only ever depends on these.

export type MediaType = "movie" | "tv";

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
}

export interface Season {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  episodes: Episode[];
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
