import "server-only";

import type {
  MusicArtist,
  MusicArtistDetail,
  MusicCollection,
  MusicSearchResults,
  MusicTrack,
} from "./types";
import { dedupeArtists, dedupeTracks } from "./utils";
import {
  normalizeJamendoAlbum,
  normalizeJamendoArtist,
  normalizeJamendoPlaylist,
  normalizeJamendoTrack,
  type JamendoAlbumRaw,
  type JamendoArtistRaw,
  type JamendoPlaylistRaw,
  type JamendoTrackRaw,
} from "./jamendo-normalize";

// ---------------------------------------------------------------------------
// Jamendo catalog adapter.
//
// Jamendo is the secondary provider: it broadens search and discovery with
// Creative Commons music while Audius remains primary. The client id is only
// read here, in a server-only module, and never appears in a response or log.
//
// Requests are cached by the Next data cache, retried once on 429/5xx with a
// bounded Retry-After wait, and isolated per endpoint so a failing album feed
// cannot blank the entire home page.
// ---------------------------------------------------------------------------

const JAMENDO_BASE = "https://api.jamendo.com/v3.0";
const USER_AGENT =
  process.env.REELHOUSE_MUSIC_USER_AGENT?.trim() ||
  "ReelhouseMusic/1.0 (https://reelhouse.app; music@reelhouse.app)";
const HOME_CACHE_SECONDS = 300;
const SEARCH_CACHE_SECONDS = 120;
const DETAIL_CACHE_SECONDS = 600;

type QueryValue = string | number | boolean | undefined;

interface JamendoEnvelope<T> {
  headers?: {
    code?: number;
    results_count?: number;
    error_message?: string;
  };
  results?: T[];
}

export interface JamendoHomeData {
  popular: MusicTrack[];
  latest: MusicTrack[];
  featured: MusicTrack[];
  artists: MusicArtist[];
  albums: MusicCollection[];
  playlists: MusicCollection[];
}

export function isJamendoConfigured(): boolean {
  return Boolean(process.env.JAMENDO_CLIENT_ID?.trim());
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response): number {
  const raw = response.headers.get("retry-after");
  if (!raw) return 750;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 2500);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 2500);
  return 750;
}

async function jamendo<T>(
  path: string,
  params: Record<string, QueryValue> = {},
  revalidate = HOME_CACHE_SECONDS
): Promise<T[]> {
  const clientId = process.env.JAMENDO_CLIENT_ID?.trim();
  if (!clientId) throw new Error("Jamendo is not configured");

  const url = new URL(`${JAMENDO_BASE}${path}`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      next: { revalidate },
      signal: AbortSignal.timeout(9_000),
    });
    if ((response.status === 429 || response.status >= 500) && attempt === 0) {
      await wait(retryAfterMs(response));
      continue;
    }
    break;
  }

  if (!response?.ok) {
    throw new Error(`Jamendo ${path} responded ${response?.status ?? 502}`);
  }

  const json = (await response.json()) as JamendoEnvelope<T>;
  const code = json.headers?.code;
  if (typeof code === "number" && code !== 0) {
    throw new Error(`Jamendo ${path} returned catalog error ${code}`);
  }
  return Array.isArray(json.results) ? json.results : [];
}

async function getTracks(
  path: string,
  params: Record<string, QueryValue>,
  revalidate = HOME_CACHE_SECONDS
): Promise<MusicTrack[]> {
  const rows = await jamendo<JamendoTrackRaw>(path, params, revalidate);
  return dedupeTracks(
    rows
      .map((row) => normalizeJamendoTrack(row))
      .filter((row): row is MusicTrack => Boolean(row))
  );
}

async function safeList<T>(promise: Promise<T[]>, label: string): Promise<T[]> {
  try {
    return await promise;
  } catch (error) {
    console.warn(
      `[music:jamendo] ${label} unavailable:`,
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

interface JamendoArtistTracksRaw extends JamendoArtistRaw {
  tracks?: JamendoTrackRaw[];
}

export async function getJamendoHome(): Promise<JamendoHomeData> {
  const [popularRaw, latestRaw, featuredRaw, artistRows, albumRows, playlistRows] =
    await Promise.all([
      // Jamendo occasionally returns an empty 200 for particular limit values
      // (its catalog API is not consistent across sizes). Twenty is a stable
      // size for these feeds; the fallback below covers a transient empty one.
      safeList(
        getTracks(
          "/tracks/",
          { order: "popularity_week", limit: 20, include: "musicinfo" },
          HOME_CACHE_SECONDS
        ),
        "popular tracks"
      ),
      safeList(
        getTracks(
          "/tracks/",
          { order: "releasedate_desc", limit: 20, include: "musicinfo" },
          HOME_CACHE_SECONDS
        ),
        "latest tracks"
      ),
      safeList(
        getTracks(
          "/tracks/",
          {
            order: "popularity_week",
            limit: 20,
            offset: 20,
            include: "musicinfo",
          },
          HOME_CACHE_SECONDS
        ),
        "featured tracks"
      ),
      safeList(
        jamendo<JamendoArtistRaw>(
          "/artists/",
          { order: "popularity_total", limit: 16 },
          HOME_CACHE_SECONDS
        ),
        "artist discovery"
      ),
      safeList(
        jamendo<JamendoAlbumRaw>(
          "/albums/",
          { order: "popularity_total", limit: 12 },
          HOME_CACHE_SECONDS
        ),
        "album discovery"
      ),
      safeList(
        jamendo<JamendoPlaylistRaw>(
          "/playlists/",
          { limit: 12 },
          HOME_CACHE_SECONDS
        ),
        "playlist discovery"
      ),
    ]);

  const artists = dedupeArtists(
    artistRows
      .map((row) => normalizeJamendoArtist(row))
      .filter((row): row is MusicArtist => Boolean(row))
  );
  const albums = albumRows
    .map((row) => normalizeJamendoAlbum(row))
    .filter((row): row is MusicCollection => Boolean(row));
  const playlists = playlistRows
    .map((row) => normalizeJamendoPlaylist(row))
    .filter((row): row is MusicCollection => Boolean(row));

  // If every ordered feed came back empty, ask for the normal catalog once.
  // This keeps the home page provider-neutral even when an ordered endpoint
  // has a bad cache window, without making the extra request on every load.
  let fallbackTracks: MusicTrack[] = [];
  if (
    popularRaw.length === 0 &&
    latestRaw.length === 0 &&
    featuredRaw.length === 0
  ) {
    fallbackTracks = await safeList(
      getTracks(
        "/tracks/",
        { limit: 20, include: "musicinfo" },
        HOME_CACHE_SECONDS
      ),
      "home track fallback"
    );
  }

  const trackFallback =
    featuredRaw.length > 0
      ? featuredRaw
      : latestRaw.length > 0
        ? latestRaw
        : popularRaw.length > 0
          ? popularRaw
          : fallbackTracks;
  const popular = popularRaw.length > 0 ? popularRaw : trackFallback;
  const latest = latestRaw.length > 0 ? latestRaw : trackFallback;
  const featured = featuredRaw.length > 0 ? featuredRaw : trackFallback;

  if (
    popular.length === 0 &&
    latest.length === 0 &&
    featured.length === 0 &&
    artists.length === 0 &&
    albums.length === 0 &&
    playlists.length === 0
  ) {
    console.warn(
      "[music:jamendo] home feeds returned no catalog data;",
      isJamendoConfigured() ? "client configured" : "JAMENDO_CLIENT_ID missing"
    );
    throw new Error("Jamendo returned no catalog data");
  }

  return { popular, latest, featured, artists, albums, playlists };
}

export async function searchJamendo(
  query: string,
  limit = 10,
  offset = 0
): Promise<MusicSearchResults> {
  const clean = query.trim().slice(0, 80);
  if (!clean || !isJamendoConfigured()) {
    return { tracks: [], artists: [], albums: [], playlists: [] };
  }

  const safeLimit = Math.max(1, Math.min(30, Math.trunc(limit)));
  const safeOffset = Math.max(0, Math.min(5_000, Math.trunc(offset)));
  const params = {
    namesearch: clean,
    limit: safeLimit,
    offset: safeOffset,
    include: "musicinfo",
  };

  const [tracksResult, artistsResult, albumsResult, playlistsResult] =
    await Promise.allSettled([
      getTracks("/tracks/", params, SEARCH_CACHE_SECONDS),
      jamendo<JamendoArtistRaw>("/artists/", params, SEARCH_CACHE_SECONDS),
      jamendo<JamendoAlbumRaw>("/albums/", params, SEARCH_CACHE_SECONDS),
      jamendo<JamendoPlaylistRaw>("/playlists/", params, SEARCH_CACHE_SECONDS),
    ]);

  const tracks =
    tracksResult.status === "fulfilled" ? tracksResult.value : [];
  const artists =
    artistsResult.status === "fulfilled"
      ? dedupeArtists(
          artistsResult.value
            .map((row) => normalizeJamendoArtist(row))
            .filter((row): row is MusicArtist => Boolean(row))
        )
      : [];
  const albums =
    albumsResult.status === "fulfilled"
      ? albumsResult.value
          .map((row) => normalizeJamendoAlbum(row))
          .filter((row): row is MusicCollection => Boolean(row))
      : [];
  const playlists =
    playlistsResult.status === "fulfilled"
      ? playlistsResult.value
          .map((row) => normalizeJamendoPlaylist(row))
          .filter((row): row is MusicCollection => Boolean(row))
      : [];

  return { tracks, artists, albums, playlists };
}

export async function getJamendoArtist(
  providerId: string
): Promise<MusicArtistDetail | null> {
  if (!/^\d{1,20}$/.test(providerId)) return null;

  const [artistRows, artistTrackRows, albumsResult] = await Promise.all([
    jamendo<JamendoArtistRaw>(
      "/artists/",
      { id: providerId, limit: 1 },
      DETAIL_CACHE_SECONDS
    ),
    // Jamendo returns an artist row with a nested `tracks` array here. The
    // generic /tracks?artist_id filter is not reliable for every profile.
    safeList(
      jamendo<JamendoArtistTracksRaw>(
        "/artists/tracks/",
        { id: providerId, limit: 1 },
        HOME_CACHE_SECONDS
      ),
      "artist tracks"
    ),
    safeList(
      jamendo<JamendoAlbumRaw>(
        "/albums/",
        { artist_id: providerId, order: "releasedate_desc", limit: 12 },
        DETAIL_CACHE_SECONDS
      ),
      "artist albums"
    ),
  ]);

  const artist = normalizeJamendoArtist(artistRows[0]);
  if (!artist) return null;

  const nestedTracks = artistTrackRows[0]?.tracks ?? [];
  let tracksResult = dedupeTracks(
    nestedTracks
      .map((row) => normalizeJamendoTrack(row))
      .filter((row): row is MusicTrack => Boolean(row))
  ).slice(0, 20);

  if (tracksResult.length === 0) {
    tracksResult = await safeList(
      getTracks(
        "/tracks/",
        { artist_id: providerId, limit: 20, include: "musicinfo" },
        HOME_CACHE_SECONDS
      ),
      "artist track fallback"
    );
  }

  const albums = albumsResult
    .map((row) => normalizeJamendoAlbum(row))
    .filter((row): row is MusicCollection => Boolean(row));

  // If the albums feed is unavailable, derive the releases from the artist's
  // tracks so the profile still has real navigation instead of an empty shelf.
  if (albums.length === 0) {
    const seen = new Set<string>();
    for (const track of tracksResult) {
      if (!track.albumId || seen.has(track.albumId)) continue;
      seen.add(track.albumId);
      albums.push({
        id: track.albumId,
        provider: "jamendo",
        providerId: track.albumId.replace(/^jamendo:album:/, ""),
        kind: "album",
        title: track.albumTitle ?? "Album",
        artworkUrl: track.artworkUrl,
        ownerName: track.artistName,
        ownerId: track.artistId,
        trackCount: 0,
        tracks: [],
        createdAt: track.releaseDate,
      });
    }
  }

  return {
    artist,
    topTracks: tracksResult,
    albums: albums.slice(0, 8),
  };
}

export async function getJamendoCollectionTracks(
  providerId: string,
  kind: "album" | "playlist"
): Promise<MusicTrack[]> {
  if (!/^\d{1,20}$/.test(providerId)) return [];

  if (kind === "album") {
    return getTracks(
      "/tracks/",
      { album_id: providerId, limit: 200, include: "musicinfo" },
      HOME_CACHE_SECONDS
    );
  }

  const rows = await jamendo<JamendoPlaylistRaw>(
    "/playlists/tracks/",
    { id: providerId, limit: 1 },
    HOME_CACHE_SECONDS
  );
  const nested = rows.flatMap((row) => (Array.isArray(row.tracks) ? row.tracks : []));
  return dedupeTracks(
    nested
      .map((row) => normalizeJamendoTrack(row))
      .filter((row): row is MusicTrack => Boolean(row))
  );
}

export async function getJamendoStreamUrl(providerId: string): Promise<string | null> {
  if (!/^\d{1,20}$/.test(providerId)) return null;
  const rows = await jamendo<JamendoTrackRaw>(
    "/tracks/",
    { id: providerId, limit: 1, audioformat: "mp31" },
    60
  );
  const audio = rows[0]?.audio?.trim();
  if (!audio) return null;

  // Only redirect to a Jamendo-owned HTTPS host. The id is numeric and the URL
  // comes from Jamendo itself, but this guard keeps the route from ever acting
  // as an open redirect if the upstream response changes.
  try {
    const url = new URL(audio);
    if (url.protocol !== "https:" || !/(^|\.)jamendo\.com$/i.test(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
