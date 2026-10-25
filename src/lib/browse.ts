import type { MediaType } from "@/types";

// ---------------------------------------------------------------------------
// Browse filter model.
//
// Pure and dependency-free (no TMDB, no Supabase, no React) so the client filter
// bar and the server pages agree on exactly one URL contract:
//
//   /browse      ?type=&genre=&year=&sort=&page=
//   /movies      ?genre=&year=&sort=&page=      (type fixed to movie)
//   /tv-shows    ?genre=&year=&sort=&page=      (type fixed to tv)
//
// Everything here maps onto something the metadata source can genuinely do —
// TMDB's discover endpoints, or an equivalent pass over the built-in catalog.
// Nothing is offered that cannot actually be applied.
// ---------------------------------------------------------------------------

export type BrowseType = "all" | MediaType | "anime";
// "anime" is a cross-type curation (Animation + Japanese originals across
// movies AND series), not a TMDB media type — the discover layer expands it.

export type BrowseSort = "popularity" | "latest" | "rating" | "oldest";

/**
 * Industry toggle (Movies / TV Shows header): which cinema the grid narrows to.
 * Hollywood = English-language originals; Bollywood = Indian cinema across its
 * major languages (the toggle's own contract, defined in discoverParams).
 */
export type BrowseIndustry = "hollywood" | "bollywood";

export const INDUSTRY_OPTIONS: { value: BrowseIndustry; label: string }[] = [
  { value: "hollywood", label: "Hollywood" },
  { value: "bollywood", label: "Bollywood" },
];

export const DEFAULT_INDUSTRY: BrowseIndustry = "hollywood";

export interface BrowseFilters {
  type: BrowseType;
  /** Genre display name (matches the names shown on cards), or null for all. */
  genre: string | null;
  /** Watch-provider id (TMDB), or null for all — the "Source" filter. */
  provider: number | null;
  /** Release/first-air year, or null for all. */
  year: number | null;
  sort: BrowseSort;
  /** Industry toggle — omitted from URLs when at the default (Hollywood). */
  industry: BrowseIndustry;
  page: number;
}

export const TYPE_OPTIONS: { value: BrowseType; label: string; href: string }[] = [
  { value: "all", label: "All", href: "/browse" },
  { value: "movie", label: "Movies", href: "/movies" },
  { value: "tv", label: "TV Shows", href: "/tv-shows" },
  { value: "anime", label: "Anime", href: "/anime" },
];

export const SORT_OPTIONS: { value: BrowseSort; label: string }[] = [
  { value: "popularity", label: "Popularity" },
  { value: "latest", label: "Latest" },
  { value: "rating", label: "Rating" },
  { value: "oldest", label: "Oldest" },
];

export const DEFAULT_SORT: BrowseSort = "popularity";

/** Route that owns a given content type — the type pills navigate between these. */
export function browsePathFor(type: BrowseType): string {
  return TYPE_OPTIONS.find((t) => t.value === type)?.href ?? "/browse";
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isSort(value: string | undefined): value is BrowseSort {
  return SORT_OPTIONS.some((s) => s.value === value);
}

/**
 * Read filters out of a route's searchParams.
 *
 * `forcedType` is how /movies and /tv-shows pin their content type: the param is
 * ignored there, so the URL can never disagree with the page the viewer is on.
 */
export function parseBrowseFilters(
  searchParams: Record<string, string | string[] | undefined>,
  forcedType?: BrowseType
): BrowseFilters {
  const rawType = firstValue(searchParams.type);
  const type: BrowseType =
    forcedType ??
    (rawType === "movie" || rawType === "tv" || rawType === "all" || rawType === "anime" ? rawType : "all");

  const genreRaw = firstValue(searchParams.genre)?.trim();
  const providerRaw = Number(firstValue(searchParams.provider));
  const yearRaw = Number(firstValue(searchParams.year));
  const pageRaw = Number(firstValue(searchParams.page));
  const sortRaw = firstValue(searchParams.sort);
  const industryRaw = firstValue(searchParams.industry);

  return {
    type,
    genre: genreRaw ? genreRaw : null,
    provider: Number.isInteger(providerRaw) && providerRaw > 0 ? providerRaw : null,
    year: Number.isInteger(yearRaw) && yearRaw > 1800 ? yearRaw : null,
    sort: isSort(sortRaw) ? sortRaw : DEFAULT_SORT,
    industry: industryRaw === "bollywood" ? "bollywood" : DEFAULT_INDUSTRY,
    page: Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 500) : 1,
  };
}

/** True when anything is narrowing the results (drives "Clear filters"). */
export function hasActiveFilters(filters: BrowseFilters): boolean {
  return (
    filters.genre !== null ||
    filters.provider !== null ||
    filters.year !== null ||
    filters.sort !== DEFAULT_SORT ||
    filters.industry !== DEFAULT_INDUSTRY ||
    filters.page > 1
  );
}

/**
 * Build the href for a filter change.
 *
 * Defaults are omitted so a pristine view has a clean URL, and any change resets
 * paging — page 4 of "Action" is meaningless once the genre changes.
 */
export function browseHref(
  filters: BrowseFilters,
  patch: Partial<BrowseFilters> = {}
): string {
  const next: BrowseFilters = { ...filters, ...patch };
  const path = browsePathFor(next.type);
  const params = new URLSearchParams();

  if (next.genre) params.set("genre", next.genre);
  if (next.provider) params.set("provider", String(next.provider));
  if (next.year) params.set("year", String(next.year));
  if (next.sort !== DEFAULT_SORT) params.set("sort", next.sort);
  if (next.industry !== DEFAULT_INDUSTRY) params.set("industry", next.industry);
  // Paging is only preserved when paging is what changed.
  if (patch.page && patch.page > 1) params.set("page", String(patch.page));

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

