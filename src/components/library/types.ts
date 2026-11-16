// My List view state — the virtual collections the reference exposes as stat
// cards, plus one key per user catalog.

export type VirtualCollection = "watchlist" | "watched" | "liked" | "disliked" | "new";

export type CollectionKey = VirtualCollection | `catalog:${string}`;

export type LibraryTypeFilter = "all" | "movie" | "tv" | "anime";

export type LibrarySort = "added" | "title" | "rating" | "year";

export interface LibraryFilterState {
  type: LibraryTypeFilter;
  genre: string | null;
  sort: LibrarySort;
}

export const DEFAULT_LIBRARY_FILTERS: LibraryFilterState = {
  type: "all",
  genre: null,
  sort: "added",
};

export function catalogKey(id: string): `catalog:${string}` {
  return `catalog:${id}`;
}

export function isCatalogKey(key: CollectionKey): key is `catalog:${string}` {
  return key.startsWith("catalog:");
}

export function catalogIdFromKey(key: `catalog:${string}`): string {
  return key.slice("catalog:".length);
}
