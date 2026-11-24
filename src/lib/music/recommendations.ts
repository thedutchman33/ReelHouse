import type {
  MusicArtist,
  MusicTrack,
  UserPlaylist,
} from "./types";

// Lightweight, explainable recommendations. The profile is derived from
// listener-owned data only and never leaves the client except as the bounded
// search terms + exclusions sent to the recommendation Route Handler.
//
// Weights are intentionally simple:
//   explicit genres 6, followed artists 5, liked tracks 3,
//   recent tracks 2 (1 after the first ten), playlist tracks 1.
// The ranking rewards genre and artist affinity, excludes songs already in the
// library, and caps a single artist so one favourite cannot fill the shelf.

export interface MusicTasteGenre {
  key: string;
  label: string;
  weight: number;
}

export interface MusicTasteArtist {
  id: string;
  name: string;
  weight: number;
}

export interface MusicTasteProfile {
  favoriteGenres: string[];
  genres: MusicTasteGenre[];
  artists: MusicTasteArtist[];
  seedIds: string[];
  hasSignals: boolean;
}

export interface MusicTasteInput {
  likedTracks: MusicTrack[];
  recentTracks: MusicTrack[];
  playlists: UserPlaylist[];
  followedArtists: MusicArtist[];
  favoriteGenres?: string[];
}

const MAX_SEED_IDS = 180;
const MAX_GENRES = 5;
const MAX_ARTISTS = 4;
const MAX_PLAYLIST_TRACKS = 80;

function genreTokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[/;,]+/)
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter((part) => part.length > 0 && part.length <= 60);
}

function genreKey(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function artistKey(artist: { id?: string; name?: string }): string {
  const id = artist.id?.trim();
  if (id) return `id:${id}`;
  return `name:${(artist.name ?? "").trim().toLocaleLowerCase("en-US")}`;
}

function addGenre(
  map: Map<string, MusicTasteGenre>,
  label: string,
  weight: number
): void {
  const key = genreKey(label);
  if (!key) return;
  const existing = map.get(key);
  if (existing) {
    existing.weight += weight;
    return;
  }
  map.set(key, { key, label, weight });
}

function addArtist(
  map: Map<string, MusicTasteArtist>,
  artist: { id?: string; name?: string },
  weight: number
): void {
  const name = artist.name?.trim();
  if (!name) return;
  const key = artistKey({ id: artist.id, name });
  const id = artist.id?.trim() || key;
  const existing = map.get(key);
  if (existing) {
    existing.weight += weight;
    return;
  }
  map.set(key, { id, name, weight });
}

function addTrackGenres(
  map: Map<string, MusicTasteGenre>,
  track: MusicTrack,
  weight: number
): void {
  for (const genre of genreTokens(track.genre)) {
    addGenre(map, genre, weight);
  }
}

function topByWeight<T extends { weight: number }>(items: T[], limit: number): T[] {
  return [...items]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

export function buildTasteProfile(input: MusicTasteInput): MusicTasteProfile {
  const genres = new Map<string, MusicTasteGenre>();
  const artists = new Map<string, MusicTasteArtist>();
  const seeds = new Set<string>();

  const favoriteGenres = Array.from(
    new Set(
      (input.favoriteGenres ?? [])
        .map((genre) => genre.trim())
        .filter((genre) => genre.length > 0 && genre.length <= 60)
    )
  ).slice(0, 8);

  for (const favorite of favoriteGenres) {
    addGenre(genres, favorite, 6);
  }

  for (const track of input.likedTracks) {
    if (track.id) seeds.add(track.id);
    addTrackGenres(genres, track, 3);
    addArtist(artists, { id: track.artistId, name: track.artistName }, 3);
  }

  input.recentTracks.slice(0, 24).forEach((track, index) => {
    if (track.id) seeds.add(track.id);
    const weight = index < 10 ? 2 : 1;
    addTrackGenres(genres, track, weight);
    addArtist(artists, { id: track.artistId, name: track.artistName }, weight);
  });

  let playlistTracks = 0;
  const seenPlaylistTracks = new Set<string>();
  for (const playlist of input.playlists) {
    for (const track of playlist.tracks) {
      if (playlistTracks >= MAX_PLAYLIST_TRACKS) break;
      if (track.id) seeds.add(track.id);
      if (seenPlaylistTracks.has(track.id)) continue;
      seenPlaylistTracks.add(track.id);
      playlistTracks += 1;
      addTrackGenres(genres, track, 1);
      addArtist(artists, { id: track.artistId, name: track.artistName }, 1);
    }
    if (playlistTracks >= MAX_PLAYLIST_TRACKS) break;
  }

  for (const artist of input.followedArtists) {
    addArtist(artists, { id: artist.id, name: artist.name }, 5);
  }

  const topGenres = topByWeight(Array.from(genres.values()), MAX_GENRES);
  const topArtists = topByWeight(Array.from(artists.values()), MAX_ARTISTS);

  return {
    favoriteGenres,
    genres: topGenres,
    artists: topArtists,
    seedIds: Array.from(seeds).slice(0, MAX_SEED_IDS),
    hasSignals:
      topGenres.length > 0 ||
      topArtists.length > 0 ||
      favoriteGenres.length > 0 ||
      seeds.size > 0,
  };
}

function recommendationScore(
  track: MusicTrack,
  genreWeights: Map<string, number>,
  artistWeights: Map<string, number>
): number {
  let score = 0;
  for (const genre of genreTokens(track.genre)) {
    score += genreWeights.get(genreKey(genre)) ?? 0;
  }

  const byId = artistWeights.get(`id:${track.artistId}`);
  const byName = artistWeights.get(
    `name:${track.artistName.trim().toLocaleLowerCase("en-US")}`
  );
  score += (byId ?? byName ?? 0) * 1.35;

  if (track.playCount && track.playCount > 0) {
    score += Math.min(2.5, Math.log10(track.playCount + 1) * 0.3);
  }
  if (track.isStreamable === false) score -= 4;
  return score;
}

export function rankRecommendations(
  candidates: MusicTrack[],
  profile: MusicTasteProfile,
  limit = 20
): MusicTrack[] {
  const safeLimit = Math.max(1, Math.min(40, Math.trunc(limit)));
  const excluded = new Set(profile.seedIds);
  const genreWeights = new Map(
    profile.genres.map((genre) => [genre.key, genre.weight])
  );
  const artistWeights = new Map(
    profile.artists.map((artist) => [
      artist.id.startsWith("name:") ? artist.id : `id:${artist.id}`,
      artist.weight,
    ])
  );

  const scored = candidates
    .filter((track) => track.id && track.title && !excluded.has(track.id))
    .map((track) => ({
      track,
      score: recommendationScore(track, genreWeights, artistWeights),
    }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.track.playCount ?? 0) - (a.track.playCount ?? 0) ||
        a.track.id.localeCompare(b.track.id)
    );

  const result: MusicTrack[] = [];
  const seen = new Set<string>();
  const perArtist = new Map<string, number>();

  // First pass keeps the shelf varied. A second pass only runs if there were
  // not enough distinct artists to fill it.
  for (const { track } of scored) {
    if (result.length >= safeLimit) break;
    if (seen.has(track.id)) continue;
    const count = perArtist.get(track.artistId) ?? 0;
    if (count >= 3) continue;
    seen.add(track.id);
    perArtist.set(track.artistId, count + 1);
    result.push(track);
  }

  if (result.length < safeLimit) {
    for (const { track } of scored) {
      if (result.length >= safeLimit) break;
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      result.push(track);
    }
  }

  return result;
}
