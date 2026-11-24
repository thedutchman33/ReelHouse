// Shared, client-safe shapes for Reelhouse Music.
// Catalog data is normalized from the free Audius and Jamendo APIs; listener-
// owned data is stored in Supabase (or the local device fallback) using these
// snapshots. Provider IDs are always preserved, even when display fields are
// normalized into one common shape.

export type MusicProvider = "youtube" | "spotify" | "audius" | "jamendo";

export interface MusicProviderRef {
  provider?: MusicProvider;
  providerId?: string;
}

export interface MusicArtist extends MusicProviderRef {
  id: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
  headerUrl?: string;
  bio?: string;
  verified?: boolean;
  followers?: number;
  trackCount?: number;
}

export interface MusicTrack extends MusicProviderRef {
  id: string;
  videoId?: string;
  title: string;
  artistId: string;
  artistName: string;
  artistHandle?: string;
  artistAvatarUrl?: string;
  albumId?: string;
  albumTitle?: string;
  artworkUrl?: string;
  duration: number;
  genre?: string;
  mood?: string;
  playCount?: number;
  releaseDate?: string;
  permalink?: string;
  streamUrl?: string;
  isStreamable?: boolean;
  licenseUrl?: string;
  /** Provenance for imported Spotify items and resolved matches. */
  source?: string | null;
  matchStatus?: "pending" | "matched" | "partial" | "unmatched" | "unavailable" | null;
  matchConfidence?: number | null;
  musicBrainzId?: string | null;
}

export type MusicCollectionKind = "album" | "playlist" | "mix";

export interface MusicCollection extends MusicProviderRef {
  id: string;
  kind: MusicCollectionKind;
  title: string;
  description?: string;
  artworkUrl?: string;
  ownerName: string;
  ownerId?: string;
  trackCount: number;
  tracks: MusicTrack[];
  accent?: string;
  createdAt?: string;
  isEditorial?: boolean;
}

export interface UserPlaylist {
  id: string;
  title: string;
  description: string;
  tracks: MusicTrack[];
  createdAt: string;
  updatedAt: string;
  accent: string;
}

export interface MusicBrowseCategory {
  id: string;
  title: string;
  color: string;
  coverUrl?: string;
}

export interface MusicHomeData {
  trending: MusicTrack[];
  recommended: MusicTrack[];
  underground: MusicTrack[];
  latest: MusicTrack[];
  artists: MusicArtist[];
  categories: MusicBrowseCategory[];
  mixes: MusicCollection[];
}

export interface MusicSearchCursor {
  /** Canonical offset used by the YouTube Music backend. */
  offset?: number;
  /** Legacy cursor fields kept so old saved links still type-check. */
  audiusLimit: number;
  jamendoOffset: number;
}

export interface MusicSearchPagination {
  offset: number;
  limit: number;
  hasMore: boolean;
  next?: MusicSearchCursor;
}

export interface MusicSearchResults {
  tracks: MusicTrack[];
  artists: MusicArtist[];
  albums: MusicCollection[];
  playlists: MusicCollection[];
  pagination?: MusicSearchPagination;
  providers?: MusicProvider[];
}

export interface MusicArtistDetail {
  artist: MusicArtist;
  topTracks: MusicTrack[];
  albums: MusicCollection[];
}

export type MusicRoute =
  | { kind: "home" }
  | { kind: "spotify" }
  | { kind: "search"; query: string }
  | { kind: "library" }
  | { kind: "liked" }
  | { kind: "playlist"; id: string }
  | { kind: "collection"; collection: MusicCollection }
  | { kind: "artist"; artist: MusicArtist; tracks?: MusicTrack[] }
  | { kind: "category"; category: MusicBrowseCategory };

export interface MusicLibrarySnapshot {
  playlists: UserPlaylist[];
  likedTracks: MusicTrack[];
  savedAlbums: MusicCollection[];
  followedArtists: MusicArtist[];
  recentTracks: MusicTrack[];
  savedCollections: MusicCollection[];
  /** Explicit genres used by the recommendation profile. */
  favoriteGenres: string[];
}

export type LibrarySyncMode = "cloud" | "device" | "checking";

export type MusicPanelTab = "now-playing" | "queue" | "lyrics";
