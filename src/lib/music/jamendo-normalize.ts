import type {
  MusicArtist,
  MusicCollection,
  MusicTrack,
} from "./types";

// Pure Jamendo row normalization. Keeping this separate from the network
// adapter makes the mapping unit-testable without a client id or fetch mock.

export interface JamendoMusicInfo {
  tags?: {
    genres?: unknown;
    vartags?: unknown;
  };
}

export interface JamendoTrackRaw {
  id?: string | number;
  name?: string;
  duration?: string | number;
  artist_id?: string | number;
  artist_name?: string;
  album_id?: string | number;
  album_name?: string;
  image?: string;
  album_image?: string;
  audio?: string;
  releasedate?: string;
  shareurl?: string;
  license_ccurl?: string;
  musicinfo?: JamendoMusicInfo;
  stats?: {
    playcount_total?: string | number;
  };
}

export interface JamendoArtistRaw {
  id?: string | number;
  name?: string;
  image?: string;
  website?: string;
}

export interface JamendoAlbumRaw {
  id?: string | number;
  name?: string;
  artist_id?: string | number;
  artist_name?: string;
  image?: string;
  releasedate?: string;
  shareurl?: string;
}

export interface JamendoPlaylistRaw {
  id?: string | number;
  name?: string;
  description?: string;
  image?: string;
  user_id?: string | number;
  user_name?: string;
  track_count?: string | number;
  creationdate?: string;
  shareurl?: string;
  tracks?: JamendoTrackRaw[];
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function imageUrl(value: string | undefined): string | undefined {
  if (!value || !/^https?:\/\//i.test(value)) return undefined;
  try {
    const url = new URL(value);
    url.protocol = "https:";
    if (url.searchParams.has("width")) url.searchParams.set("width", "600");
    return url.toString();
  } catch {
    return value;
  }
}

function trackGenre(raw: JamendoTrackRaw | null | undefined): string | undefined {
  const genres = stringList(raw?.musicinfo?.tags?.genres);
  const clean = Array.from(new Set(genres.map((genre) => genre.trim()).filter(Boolean)));
  return clean.length ? clean.slice(0, 3).join("/") : undefined;
}

function trackMood(raw: JamendoTrackRaw | null | undefined): string | undefined {
  const tags = stringList(raw?.musicinfo?.tags?.vartags);
  if (!tags.length) return undefined;
  return Array.from(new Set(tags)).slice(0, 3).join(", ");
}

export function normalizeJamendoTrack(
  raw: JamendoTrackRaw | null | undefined
): MusicTrack | null {
  const providerId = asString(raw?.id);
  const title = asString(raw?.name);
  if (!providerId || !title) return null;

  const artistProviderId = asString(raw?.artist_id) ?? "unknown";
  const albumProviderId = asString(raw?.album_id);
  const audio = asString(raw?.audio);
  const artwork = imageUrl(asString(raw?.image) ?? asString(raw?.album_image));

  return {
    id: `jamendo:${providerId}`,
    provider: "jamendo",
    providerId,
    title,
    artistId: `jamendo:artist:${artistProviderId}`,
    artistName: asString(raw?.artist_name) ?? "Unknown artist",
    albumId: albumProviderId ? `jamendo:album:${albumProviderId}` : undefined,
    albumTitle: asString(raw?.album_name),
    artworkUrl: artwork,
    duration: asNumber(raw?.duration) ?? 0,
    genre: trackGenre(raw),
    mood: trackMood(raw),
    playCount: asNumber(raw?.stats?.playcount_total),
    releaseDate: asString(raw?.releasedate),
    permalink: asString(raw?.shareurl),
    streamUrl: audio && /^https:\/\//i.test(audio) ? audio : undefined,
    isStreamable: Boolean(audio && /^https:\/\//i.test(audio)),
    licenseUrl: asString(raw?.license_ccurl),
  };
}

export function normalizeJamendoArtist(
  raw: JamendoArtistRaw | null | undefined
): MusicArtist | null {
  const providerId = asString(raw?.id);
  const name = asString(raw?.name);
  if (!providerId || !name) return null;
  return {
    id: `jamendo:artist:${providerId}`,
    provider: "jamendo",
    providerId,
    name,
    avatarUrl: imageUrl(asString(raw?.image)),
  };
}

export function normalizeJamendoAlbum(
  raw: JamendoAlbumRaw | null | undefined
): MusicCollection | null {
  const providerId = asString(raw?.id);
  const title = asString(raw?.name);
  if (!providerId || !title) return null;
  const artistProviderId = asString(raw?.artist_id);
  return {
    id: `jamendo:album:${providerId}`,
    provider: "jamendo",
    providerId,
    kind: "album",
    title,
    artworkUrl: imageUrl(asString(raw?.image)),
    ownerName: asString(raw?.artist_name) ?? "Jamendo artist",
    ownerId: artistProviderId ? `jamendo:artist:${artistProviderId}` : undefined,
    trackCount: 0,
    tracks: [],
    createdAt: asString(raw?.releasedate),
  };
}

export function normalizeJamendoPlaylist(
  raw: JamendoPlaylistRaw | null | undefined
): MusicCollection | null {
  const providerId = asString(raw?.id);
  const title = asString(raw?.name);
  if (!providerId || !title) return null;
  const nestedTracks = Array.isArray(raw?.tracks) ? raw.tracks : [];
  const artwork =
    imageUrl(asString(raw?.image)) ??
    imageUrl(asString(nestedTracks.find((track) => track.image)?.image));
  return {
    id: `jamendo:playlist:${providerId}`,
    provider: "jamendo",
    providerId,
    kind: "playlist",
    title,
    description: asString(raw?.description),
    artworkUrl: artwork,
    ownerName: asString(raw?.user_name) ?? "Jamendo curator",
    ownerId: asString(raw?.user_id)
      ? `jamendo:user:${asString(raw?.user_id)}`
      : undefined,
    trackCount: asNumber(raw?.track_count) ?? nestedTracks.length,
    tracks: [],
    createdAt: asString(raw?.creationdate),
  };
}
