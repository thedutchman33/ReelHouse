import type { MusicArtist, MusicCollection, MusicTrack } from "./types";

export interface SpotifyConnection {
  connected: boolean;
  spotifyUserId?: string;
  displayName?: string;
  country?: string;
  product?: string;
  scopes: string[];
  connectedAt?: string;
}

export interface SpotifyPlaylistSummary {
  id: string;
  spotifyPlaylistId: string;
  name: string;
  description: string;
  artworkUrl?: string;
  ownerName?: string;
  ownerId?: string;
  trackCount: number;
  isPublic?: boolean;
  isCollaborative?: boolean;
  snapshotId?: string;
  lastSyncedAt?: string;
  libraryPlaylistId?: string;
}

export interface SpotifyCandidate {
  track: MusicTrack;
  confidence: number;
  status: string;
}

export interface SpotifyTrack {
  id: string;
  spotifyTrackId: string;
  spotifyUri?: string;
  name: string;
  artists: string[];
  artistName: string;
  albumName?: string;
  artworkUrl?: string;
  durationMs: number;
  addedAt?: string;
  position?: number;
  isLocal: boolean;
  isAvailable: boolean;
  matchStatus: "pending" | "matched" | "partial" | "unmatched" | "unavailable";
  matchConfidence?: number;
  youtubeTrack?: MusicTrack;
  candidates: SpotifyCandidate[];
}

export interface SpotifyPlaylistDetail {
  playlist: SpotifyPlaylistSummary;
  tracks: SpotifyTrack[];
  pendingMatches: number;
  matchStats: SpotifyMatchStats;
}

export interface SpotifySavedPage {
  tracks: SpotifyTrack[];
  total: number;
  offset: number;
  limit: number;
  nextOffset?: number;
  pendingMatches: number;
  matchStats: SpotifyMatchStats;
}

export interface SpotifyMatchStats {
  matched: number;
  partial: number;
  unmatched: number;
  unavailable: number;
  pending: number;
  total: number;
}

export interface SpotifyLibrary {
  playlists: SpotifyPlaylistSummary[];
  likedCount: number;
  lastSyncAt?: string;
}

export interface SpotifyImportFile {
  name: string;
  kind: string;
  parsed: boolean;
  detail?: string;
}

export interface SpotifyImportPreview {
  files: SpotifyImportFile[];
  playlists: number;
  playlistTracks: number;
  likedSongs: number;
  albums: number;
  artists: number;
  listeningEvents: number;
  historyStart?: string;
  historyEnd?: string;
  searches: number;
  parsedFiles: number;
  failedFiles: number;
  hasExtendedHistory: boolean;
  hasAccountData: boolean;
  notes: string[];
}

export interface SpotifyImportResult {
  jobId: string;
  status: string;
  files: SpotifyImportFile[];
  importedPlaylists: number;
  importedPlaylistTracks: number;
  importedLikedSongs: number;
  importedAlbums: number;
  importedArtists: number;
  importedListeningEvents: number;
  importedSearches: number;
  duplicatesSkipped: number;
  errors: string[];
}

export interface SpotifyStats {
  totalEvents: number;
  totalMsPlayed: number;
  uniqueTracks: number;
  uniqueArtists: number;
  topArtists: MusicArtist[];
  topTracks: MusicTrack[];
  topAlbums: MusicCollection[];
  topGenres: string[];
  historyStart?: string;
  historyEnd?: string;
  recentlyPlayed: MusicTrack[];
  importedSearches: string[];
  computedAt?: string;
}

export interface PersonalizedSection {
  id: string;
  title: string;
  subtitle?: string;
  tracks: MusicTrack[];
  playlists: MusicCollection[];
}

export interface PersonalizedHome {
  sections: PersonalizedSection[];
  stats: SpotifyStats;
  hasListeningData: boolean;
}

export interface ImportedSearch {
  id?: string;
  query: string;
  searched_at?: string;
  searchedAt?: string;
  platform?: string;
  result_uri?: string;
    created_at?: string;
}
