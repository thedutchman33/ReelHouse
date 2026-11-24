import "server-only";

import type {
  MusicArtist,
  MusicArtistDetail,
  MusicCollection,
  MusicHomeData,
  MusicProvider,
  MusicSearchResults,
  MusicTrack,
} from "./types";
import { backendJson, encodePath } from "./backend";

// Catalog facade for the existing music UI. All catalog data comes from the
// independent Kotlin/InnerTubeX backend; the browser never talks to YouTube
// Music or holds service credentials.

function nextPage(offset: number, limit: number, hasMore: boolean) {
  if (!hasMore) return undefined;
  const next = offset + limit;
  return {
    offset: next,
    // Kept for saved route links and old snapshots: the YouTube Music backend
    // uses the same offset for every catalog section.
    audiusLimit: next,
    jamendoOffset: next,
  };
}

export async function getMusicHome(): Promise<MusicHomeData> {
  return backendJson<MusicHomeData>("/v1/music/home", { revalidate: 60 });
}

export async function searchMusic(
  query: string,
  options: { limit?: number; offset?: number } = {}
): Promise<MusicSearchResults> {
  const clean = query.trim().slice(0, 160);
  if (clean.length < 2) {
    return { tracks: [], artists: [], albums: [], playlists: [] };
  }
  const limit = Math.max(1, Math.min(30, Math.trunc(options.limit ?? 10)));
  const offset = Math.max(0, Math.min(200, Math.trunc(options.offset ?? 0)));
  const params = new URLSearchParams({
    q: clean,
    limit: String(limit),
    offset: String(offset),
  });
  const data = await backendJson<MusicSearchResults>(`/v1/music/search?${params.toString()}`, {
    revalidate: 60,
  });
  return {
    ...data,
    providers: (data.providers ?? []).filter(
      (provider): provider is MusicProvider =>
        provider === "youtube" || provider === "spotify"
    ),
    pagination: {
      offset,
      limit,
      hasMore: Boolean(data.pagination?.hasMore),
      next: nextPage(offset, limit, Boolean(data.pagination?.hasMore)),
    },
  };
}

export async function getMusicArtist(id: string): Promise<MusicArtistDetail | null> {
  if (!id || id.length > 200) return null;
  try {
    return await backendJson<MusicArtistDetail>(
      `/v1/music/artists/${encodePath(id)}`,
      { revalidate: 300 }
    );
  } catch {
    return null;
  }
}

export async function getMusicCollection(
  id: string,
  kind: "album" | "playlist" = "playlist"
): Promise<MusicCollection> {
  return backendJson<MusicCollection>(
    `/v1/music/collections/${encodePath(id)}?kind=${kind}`,
    { revalidate: 300 }
  );
}

export async function getMusicCollectionTracks(
  id: string,
  kind: "album" | "playlist" = "playlist"
): Promise<MusicTrack[]> {
  return (await getMusicCollection(id, kind)).tracks;
}

export function collectionFromQuery(
  params: URLSearchParams,
  tracks: MusicTrack[]
): MusicCollection | null {
  const id = params.get("id")?.trim();
  const title = params.get("title")?.trim();
  if (!id || !title) return null;
  const kind = params.get("kind") === "album" ? "album" : "playlist";
  return {
    id,
    provider: "youtube",
    providerId: id.split(":").pop(),
    kind,
    title: title.slice(0, 200),
    artworkUrl: params.get("artwork")?.trim() || undefined,
    ownerName: params.get("owner")?.trim().slice(0, 160) || "YouTube Music",
    ownerId: params.get("ownerId")?.trim() || undefined,
    trackCount: tracks.length,
    tracks,
    accent: kind === "album" ? "#1ed760" : "#7c3aed",
  };
}

/** Stream URLs are always resolved by the range proxy route. */
export function getMusicStreamUrl(): Promise<string | null> {
  return Promise.resolve(null);
}

export function artistsFromTracks(tracks: MusicTrack[]): MusicArtist[] {
  const seen = new Set<string>();
  const result: MusicArtist[] = [];
  for (const track of tracks) {
    if (!track.artistId || seen.has(track.artistId)) continue;
    seen.add(track.artistId);
    result.push({
      id: track.artistId,
      provider: track.provider,
      providerId: track.artistId.split(":").pop(),
      name: track.artistName,
      avatarUrl: track.artistAvatarUrl,
    });
  }
  return result;
}
