import type {
  MusicArtist,
  MusicCollection,
  MusicProvider,
  MusicTrack,
} from "./types";

// Provider-neutral helpers shared by the server catalog and client UI. The
// active catalog is YouTube Music. Spotify appears only for imported library
// items; legacy provider values remain readable for old saved snapshots but are
// never called by the active music API.

export function providerLabel(provider?: MusicProvider): string {
  if (provider === "spotify") return "Spotify";
  if (provider === "youtube") return "YouTube Music";
  if (provider === "jamendo") return "Jamendo";
  if (provider === "audius") return "Audius";
  return "YouTube Music";
}

export function providerFromId(id: string | undefined): MusicProvider | undefined {
  if (id?.startsWith("youtube:")) return "youtube";
  if (id?.startsWith("spotify:")) return "spotify";
  if (id?.startsWith("jamendo:")) return "jamendo";
  return undefined;
}

export function providerIdFromId(id: string): string | undefined {
  const match = /^(?:youtube|spotify|jamendo):(?:artist:|album:|playlist:|track:)?([^:]+)$/.exec(id);
  return match?.[1];
}

export function providersInTracks(tracks: MusicTrack[]): MusicProvider[] {
  const providers = new Set<MusicProvider>();
  for (const track of tracks) {
    if (track.provider) providers.add(track.provider);
    else if (track.id) providers.add(providerFromId(track.id) ?? "youtube");
  }
  return Array.from(providers);
}

export function catalogLabelForTracks(tracks: MusicTrack[]): string {
  const providers = providersInTracks(tracks);
  if (providers.length === 0) return "YouTube Music";
  return providers.map(providerLabel).join(" + ");
}

export function catalogLabelForCollection(collection: MusicCollection): string {
  if (collection.isEditorial || collection.ownerName === "Reelhouse Music") {
    return "Reelhouse Music";
  }
  if (collection.provider) return providerLabel(collection.provider);
  return catalogLabelForTracks(collection.tracks);
}

export function catalogLabelForArtist(artist: MusicArtist): string {
  return providerLabel(artist.provider);
}

export function mergeUnique<T extends { id: string }>(...groups: T[][]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (!item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export function interleaveUnique<T extends { id: string }>(
  groups: T[][],
  limit = Number.POSITIVE_INFINITY
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  let added = true;
  let index = 0;

  while (added && merged.length < limit) {
    added = false;
    for (const group of groups) {
      const item = group[index];
      if (!item || !item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
      added = true;
      if (merged.length >= limit) break;
    }
    index += 1;
  }

  return merged;
}
