import "server-only";

import type {
  MusicArtist,
  MusicArtistDetail,
  MusicBrowseCategory,
  MusicCollection,
  MusicHomeData,
  MusicSearchResults,
  MusicTrack,
} from "./types";
import {
  BROWSE_CATEGORIES,
  buildMixes,
  dedupeArtists,
  dedupeTracks,
  tracksForCategory,
} from "./utils";
import { audiusStreamUrl } from "./stream";

// ---------------------------------------------------------------------------
// Audius catalog adapter.
//
// Audius is the primary source because it is free, needs no API key for reads,
// returns full-length streamable tracks, artwork at multiple sizes, artist
// profiles and discovery data. The app talks to it only from Route Handlers so
// the public client never has to deal with API CORS and every response can be
// cached by the Next data cache.
//
// Free tier: 10 requests/second / 500,000 requests/month. The home payload
// makes four parallel upstream calls once per cache window; search is debounced.
// ---------------------------------------------------------------------------

const AUDIUS_BASE = "https://api.audius.co/v1";
const APP_NAME = process.env.AUDIUS_APP_NAME?.trim() || "ReelhouseMusic";
const USER_AGENT =
  process.env.REELHOUSE_MUSIC_USER_AGENT?.trim() ||
  "ReelhouseMusic/1.0 (https://reelhouse.app; music@reelhouse.app)";

type JsonObject = Record<string, unknown>;

interface RawImages {
  [key: string]: unknown;
}

interface RawUser {
  id?: string;
  name?: string;
  handle?: string;
  bio?: string;
  is_verified?: boolean;
  verified?: boolean;
  follower_count?: number;
  track_count?: number;
  profile_picture?: RawImages | null;
  cover_photo?: RawImages | null;
}

interface RawAlbumBacklink {
  playlist_id?: number | string;
  playlist_name?: string;
  permalink?: string;
}

interface RawTrack {
  id?: string;
  title?: string;
  duration?: number;
  genre?: string;
  mood?: string | null;
  artwork?: RawImages | null;
  user?: RawUser | null;
  user_id?: string;
  album_backlink?: RawAlbumBacklink | null;
  play_count?: number;
  release_date?: string;
  permalink?: string;
}

interface RawPlaylist {
  id?: string;
  playlist_id?: number;
  playlist_name?: string;
  description?: string | null;
  artwork?: RawImages | null;
  user?: RawUser | null;
  playlist_owner_id?: number;
  track_count?: number;
  is_album?: boolean;
  release_date?: string;
}

function pickImage(images: RawImages | null | undefined): string | undefined {
  if (!images) return undefined;
  for (const key of [
    "1000x1000",
    "480x480",
    "640x",
    "2000x",
    "150x150",
    "150x",
  ]) {
    const value = images[key];
    if (typeof value !== "string" || !/^https?:\/\//.test(value)) continue;
    try {
      const url = new URL(value);
      // The gateway hostname is advertised in metadata but does not proxy
      // content itself. Point the same content hash at a real creator node.
      if (url.hostname === "audius-nodes.com") {
        url.hostname = "audius-creator-7.theblueprint.xyz";
      }
      return url.toString();
    } catch {
      return value;
    }
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeAudiusArtist(raw: RawUser | null | undefined): MusicArtist | null {
  const id = asString(raw?.id);
  if (!id) return null;
  return {
    id,
    provider: "audius",
    providerId: id,
    name: asString(raw?.name) || asString(raw?.handle) || "Unknown artist",
    handle: asString(raw?.handle),
    avatarUrl: pickImage(raw?.profile_picture),
    headerUrl: pickImage(raw?.cover_photo),
    bio: asString(raw?.bio),
    verified: Boolean(raw?.is_verified ?? raw?.verified),
    followers: asNumber(raw?.follower_count),
    trackCount: asNumber(raw?.track_count),
  };
}

export function normalizeAudiusTrack(raw: RawTrack | null | undefined): MusicTrack | null {
  const id = asString(raw?.id);
  const title = asString(raw?.title);
  if (!id || !title) return null;
  const artist = normalizeAudiusArtist(raw?.user) ?? {
    id: asString(raw?.user_id) ?? "unknown",
    name: "Unknown artist",
  };
  const albumId = raw?.album_backlink?.playlist_id;
  return {
    id,
    provider: "audius",
    providerId: id,
    title,
    artistId: artist.id,
    artistName: artist.name,
    artistHandle: artist.handle,
    artistAvatarUrl: artist.avatarUrl,
    albumId: albumId != null ? String(albumId) : undefined,
    albumTitle: asString(raw?.album_backlink?.playlist_name),
    artworkUrl: pickImage(raw?.artwork),
    duration: asNumber(raw?.duration) ?? 0,
    genre: asString(raw?.genre),
    mood: asString(raw?.mood ?? undefined),
    playCount: asNumber(raw?.play_count),
    releaseDate: asString(raw?.release_date),
    permalink: asString(raw?.permalink),
    streamUrl: audiusStreamUrl(id, APP_NAME),
    isStreamable: true,
  };
}

function normalizeAudiusCollection(
  raw: RawPlaylist | null | undefined,
  kind: "album" | "playlist"
): MusicCollection | null {
  const id = asString(raw?.id);
  const title = asString(raw?.playlist_name);
  if (!id || !title) return null;
  return {
    id,
    provider: "audius",
    providerId: id,
    kind,
    title,
    description: asString(raw?.description ?? undefined),
    artworkUrl: pickImage(raw?.artwork),
    ownerName: asString(raw?.user?.name) || asString(raw?.user?.handle) || "Audius artist",
    ownerId: asString(raw?.user?.id),
    trackCount: asNumber(raw?.track_count) ?? 0,
    tracks: [],
    createdAt: asString(raw?.release_date),
  };
}

type AudiusEnvelope<T> = { data?: T };

async function audius<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  revalidate = 300
): Promise<T> {
  const url = new URL(`${AUDIUS_BASE}${path}`);
  url.searchParams.set("app_name", APP_NAME);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    next: { revalidate },
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) {
    throw new Error(`Audius ${path} responded ${response.status}`);
  }
  const json = (await response.json()) as AudiusEnvelope<T>;
  return (json.data ?? ({} as T)) as T;
}

async function fetchTracks(
  path: string,
  params: Record<string, string | number | undefined>,
  revalidate = 300
): Promise<MusicTrack[]> {
  const rows = await audius<RawTrack[]>(path, params, revalidate);
  if (!Array.isArray(rows)) return [];
  return dedupeTracks(
    rows
      .map((row) => normalizeAudiusTrack(row))
      .filter((row): row is MusicTrack => Boolean(row))
  );
}

/** Home discovery: four cached Audius feeds combined into one payload. */
export async function getMusicHome(): Promise<MusicHomeData> {
  const settled = await Promise.allSettled([
    fetchTracks("/tracks/trending", { time: "week", limit: 30 }),
    fetchTracks("/tracks/recommended", { limit: 30 }),
    fetchTracks("/tracks/trending/underground", { limit: 30 }),
    fetchTracks("/tracks/latest", { limit: 30 }),
  ]);

  const [trending, recommended, underground, latest] = settled.map((result) =>
    result.status === "fulfilled" ? result.value : []
  );
  const everything = dedupeTracks([
    ...trending,
    ...recommended,
    ...underground,
    ...latest,
  ]);

  if (everything.length === 0) {
    const firstError = settled.find((result) => result.status === "rejected");
    throw firstError && firstError.status === "rejected"
      ? firstError.reason
      : new Error("Audius returned no tracks");
  }

  const artistMap = new Map<string, MusicArtist>();
  for (const track of everything) {
    if (artistMap.has(track.artistId)) continue;
    artistMap.set(track.artistId, {
      id: track.artistId,
      name: track.artistName,
      handle: track.artistHandle,
      avatarUrl: track.artistAvatarUrl,
    });
  }

  const categories: MusicBrowseCategory[] = BROWSE_CATEGORIES.map((category) => {
    const matches = tracksForCategory(everything, category);
    return {
      ...category,
      coverUrl: matches[0]?.artworkUrl ?? everything[0]?.artworkUrl,
    };
  });

  const mixes = buildMixes(everything);
  const artists = dedupeArtists(Array.from(artistMap.values()));

  return {
    trending: trending.length ? trending : everything.slice(0, 20),
    recommended: recommended.length ? recommended : everything.slice(0, 20),
    underground: underground.length ? underground : everything.slice(0, 20),
    latest: latest.length ? latest : everything.slice(0, 20),
    artists: artists.slice(0, 12),
    categories,
    mixes,
  };
}

export async function searchMusic(
  query: string,
  options: { limit?: number } = {}
): Promise<MusicSearchResults> {
  const clean = query.trim().slice(0, 80);
  if (!clean) return { tracks: [], artists: [], albums: [], playlists: [] };
  const limit = Math.max(1, Math.min(30, Math.trunc(options.limit ?? 10)));

  const data = await audius<{
    tracks?: RawTrack[];
    users?: RawUser[];
    albums?: RawPlaylist[];
    playlists?: RawPlaylist[];
  }>("/search/full", { query: clean, limit }, 120);

  const tracks = dedupeTracks(
    (data.tracks ?? [])
      .map((row) => normalizeAudiusTrack(row))
      .filter((row): row is MusicTrack => Boolean(row))
  );
  const artists = dedupeArtists(
    (data.users ?? [])
      .map((row) => normalizeAudiusArtist(row))
      .filter((row): row is MusicArtist => Boolean(row))
  );
  const albums = (data.albums ?? [])
    .map((row) => normalizeAudiusCollection(row, "album"))
    .filter((row): row is MusicCollection => Boolean(row));
  const playlists = (data.playlists ?? [])
    .map((row) => normalizeAudiusCollection(row, "playlist"))
    .filter((row): row is MusicCollection => Boolean(row));

  return { tracks, artists, albums, playlists };
}

export async function getMusicArtist(id: string): Promise<MusicArtistDetail | null> {
  const [rawUser, tracks] = await Promise.all([
    audius<RawUser>(`/users/${encodeURIComponent(id)}`, {}, 600),
    fetchTracks(`/users/${encodeURIComponent(id)}/tracks`, { limit: 20 }, 300),
  ]);
  const artist = normalizeAudiusArtist(rawUser);
  if (!artist) return null;

  const albums = new Map<string, MusicCollection>();
  for (const track of tracks) {
    if (!track.albumTitle) continue;
    const albumKey = track.albumTitle.trim().toLowerCase();
    if (albums.has(albumKey)) continue;
    const hasAlbumCollection = Boolean(track.albumId);
    albums.set(albumKey, {
      id: track.albumId ?? track.id,
      provider: "audius",
      providerId: track.albumId ?? track.id,
      kind: "album",
      title: track.albumTitle,
      artworkUrl: track.artworkUrl,
      ownerName: track.artistName,
      ownerId: track.artistId,
      trackCount: hasAlbumCollection ? 0 : 1,
      tracks: hasAlbumCollection ? [] : [track],
      accent: "#1ed760",
    });
  }

  return {
    artist,
    topTracks: tracks,
    albums: Array.from(albums.values()).slice(0, 8),
  };
}

export async function getMusicCollectionTracks(id: string): Promise<MusicTrack[]> {
  const rows = await audius<RawTrack[]>(
    `/playlists/${encodeURIComponent(id)}/tracks`,
    { limit: 100 },
    300
  );
  if (!Array.isArray(rows)) return [];
  return dedupeTracks(
    rows
      .map((row) => normalizeAudiusTrack(row))
      .filter((row): row is MusicTrack => Boolean(row))
  );
}

export function getAudiusAttribution(): { source: "Audius"; url: string } {
  return { source: "Audius", url: "https://audius.co" };
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}
