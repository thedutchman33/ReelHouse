import type {
  MusicArtist,
  MusicCollection,
  MusicProvider,
  MusicSearchResults,
  MusicTrack,
} from "./types";

function mergeById<T extends { id: string }>(current: T[], next: T[]): T[] {
  const seen = new Set(current.map((item) => item.id));
  const merged = [...current];
  for (const item of next) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function mergeSearchResults(
  current: MusicSearchResults | null,
  next: MusicSearchResults
): MusicSearchResults {
  if (!current) return next;

  const providers = Array.from(
    new Set<MusicProvider>([
      ...(current.providers ?? []),
      ...(next.providers ?? []),
    ])
  );

  return {
    tracks: mergeById<MusicTrack>(current.tracks, next.tracks),
    artists: mergeById<MusicArtist>(current.artists, next.artists),
    albums: mergeById<MusicCollection>(current.albums, next.albums),
    playlists: mergeById<MusicCollection>(
      current.playlists,
      next.playlists
    ),
    pagination: next.pagination ?? current.pagination,
    providers: providers.length ? providers : undefined,
  };
}
