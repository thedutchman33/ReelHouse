import type {
  MusicArtist,
  MusicBrowseCategory,
  MusicCollection,
  MusicTrack,
  UserPlaylist,
} from "./types";

export const MUSIC_ACCENT = "#1ed760";
export const MUSIC_ACCENT_STRONG = "#3be477";

export const TRACK_COLORS = [
  "#7c3aed",
  "#0b6e4f",
  "#b45309",
  "#1d4ed8",
  "#be123c",
  "#0f766e",
  "#a21caf",
  "#4338ca",
  "#15803d",
  "#c2410c",
] as const;

export const BROWSE_CATEGORIES: MusicBrowseCategory[] = [
  { id: "pop", title: "Pop", color: "#dc148c" },
  { id: "hip-hop-rap", title: "Hip-Hop", color: "#ba5d07" },
  { id: "electronic", title: "Electronic", color: "#8400e7" },
  { id: "rnb", title: "R&B", color: "#8c1932" },
  { id: "rock", title: "Rock", color: "#e8115b" },
  { id: "indie", title: "Indie", color: "#608108" },
  { id: "dance", title: "Dance", color: "#148a08" },
  { id: "chill", title: "Chill", color: "#477d95" },
  { id: "jazz", title: "Jazz", color: "#777777" },
  { id: "classical", title: "Classical", color: "#7d4b32" },
  { id: "latin", title: "Latin", color: "#e1118c" },
  { id: "metal", title: "Metal", color: "#a0a0a0" },
  { id: "acoustic", title: "Acoustic", color: "#8d6c42" },
  { id: "ambient", title: "Ambient", color: "#2f5d62" },
  { id: "funk", title: "Funk", color: "#9b5de5" },
  { id: "soundtrack", title: "Soundtrack", color: "#176b87" },
];

export function formatDuration(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds) || !seconds || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatPlayCount(count: number | null | undefined): string {
  if (!count || count < 1) return "0 plays";
  if (count >= 1_000_000_000) return `${trimZero(count / 1_000_000_000)}B plays`;
  if (count >= 1_000_000) return `${trimZero(count / 1_000_000)}M plays`;
  if (count >= 1_000) return `${trimZero(count / 1_000)}K plays`;
  return `${count.toLocaleString("en-US")} ${count === 1 ? "play" : "plays"}`;
}

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

export function formatTotalDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} hr ${minutes} min`;
  return `${minutes} min`;
}

export function formatTrackCount(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "song" : "songs"}`;
}

export function greetingForHour(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function relativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return "";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

export function artistFromTrack(track: MusicTrack): MusicArtist {
  return {
    id: track.artistId,
    name: track.artistName,
    handle: track.artistHandle,
    avatarUrl: track.artistAvatarUrl,
  };
}

export function dedupeTracks(tracks: MusicTrack[]): MusicTrack[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (!track.id || seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

export function dedupeArtists(artists: MusicArtist[]): MusicArtist[] {
  const seen = new Set<string>();
  return artists.filter((artist) => {
    if (!artist.id || seen.has(artist.id)) return false;
    seen.add(artist.id);
    return true;
  });
}

export function collectionDuration(tracks: MusicTrack[]): number {
  return tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
}

export function colorFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return TRACK_COLORS[hash % TRACK_COLORS.length];
}

export function matchesText(track: MusicTrack, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    track.title,
    track.artistName,
    track.albumTitle,
    track.genre,
    track.mood,
  ].some((value) => value?.toLowerCase().includes(needle));
}

export function tracksForCategory(
  tracks: MusicTrack[],
  category: MusicBrowseCategory
): MusicTrack[] {
  const title = category.title.toLowerCase();
  const id = category.id.toLowerCase();
  const aliases: Record<string, string[]> = {
    "hip-hop-rap": ["hip-hop", "hip hop", "rap"],
    "rnb": ["r&b", "rnb", "soul"],
    electronic: ["electronic", "edm", "techno", "house"],
    dance: ["dance", "electronic/dance"],
    chill: ["chill", "lofi", "lo-fi", "ambient"],
    "hip-hop": ["hip-hop", "rap"],
    soundtrack: ["soundtrack", "cinematic", "score"],
  };
  const needles = [title, id, ...(aliases[id] ?? [])];
  return tracks.filter((track) => {
    const haystack = `${track.genre ?? ""} ${track.mood ?? ""}`.toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  });
}

export function buildMixes(tracks: MusicTrack[]): MusicCollection[] {
  const buckets = new Map<string, MusicTrack[]>();
  for (const track of tracks) {
    const genre = (track.genre || "Eclectic").split("/")[0].trim() || "Eclectic";
    const bucket = buckets.get(genre) ?? [];
    if (bucket.length < 24 && !bucket.some((item) => item.id === track.id)) {
      bucket.push(track);
    }
    buckets.set(genre, bucket);
  }
  return Array.from(buckets.entries())
    .filter(([, items]) => items.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([genre, items], index) => ({
      id: `mix-${genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      kind: "mix" as const,
      title: `${genre} Mix`,
      description: `A rotating blend of ${genre.toLowerCase()} tracks picked for you.`,
      artworkUrl: items[0]?.artworkUrl,
      ownerName: "Reelhouse Music",
      trackCount: items.length,
      tracks: items,
      accent: TRACK_COLORS[index % TRACK_COLORS.length],
      isEditorial: true,
    }));
}

export function makeMix(
  id: string,
  title: string,
  description: string,
  tracks: MusicTrack[],
  accent = MUSIC_ACCENT
): MusicCollection {
  return {
    id,
    kind: "mix",
    title,
    description,
    artworkUrl: tracks[0]?.artworkUrl,
    ownerName: "Reelhouse Music",
    trackCount: tracks.length,
    tracks,
    accent,
    isEditorial: true,
  };
}

export function playlistToCollection(playlist: UserPlaylist, ownerName: string): MusicCollection {
  return {
    id: `user:${playlist.id}`,
    kind: "playlist",
    title: playlist.title,
    description: playlist.description,
    artworkUrl: playlist.tracks[0]?.artworkUrl,
    ownerName,
    trackCount: playlist.tracks.length,
    tracks: playlist.tracks,
    accent: playlist.accent,
    createdAt: playlist.createdAt,
  };
}

export const SEARCH_DEBOUNCE_MS = 280;
