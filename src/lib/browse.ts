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

export type BrowseType = "all" | Exclude<MediaType, "f1" | "cricket">;
// "anime" is a cross-type curation (Animation + Japanese originals across
// movies AND series), not a TMDB media type — the discover layer expands it.
// "f1" and "cricket" are live-only, so the catalog never offers them as browse
// filters.

export type BrowseSort = "popularity" | "recent" | "rating" | "oldest";

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

/** Broad certification bands — mapped per media type when querying. */
export type AgeRating = "kids" | "teen" | "mature";

/** Runtime bands (movies only — TMDB's TV discover has no runtime filter). */
export type DurationBand = "short" | "standard" | "long" | "epic";

export interface BrowseFilters {
  type: BrowseType;
  /** Selected genre display names (matches the names shown on cards). Empty = all. */
  genres: string[];
  /** OTT/watch-provider id (TMDB), or null for all. */
  provider: number | null;
  /** Release/first-air year, or null for all. */
  year: number | null;
  sort: BrowseSort;
  /** Industry toggle — omitted from URLs when at the default (Hollywood). */
  industry: BrowseIndustry;
  /** Decade start year (e.g. 2010 for the 2010s), or null for all decades. */
  decade: number | null;
  /** Certification band, or null for every rating. */
  ageRating: AgeRating | null;
  /** Runtime band, or null for any length. */
  duration: DurationBand | null;
  /** ISO 639-1 original-language code, or null for every language. */
  language: string | null;
  /** Hide animated titles from the results. */
  hideAnime: boolean;
  /** Reelhouse Select — the curated high-rated, well-voted shelf. */
  select: boolean;
  /** Family Friendly — kid-safe certifications. */
  family: boolean;
  /** Award Winner — award-calibre acclaim (see discoverParams). */
  award: boolean;
  page: number;
}

export const AGE_RATING_OPTIONS: { value: AgeRating; label: string }[] = [
  { value: "kids", label: "All ages" },
  { value: "teen", label: "Teen" },
  { value: "mature", label: "Mature" },
];

export const DURATION_OPTIONS: {
  value: DurationBand;
  label: string;
  gte?: number;
  lte?: number;
}[] = [
  { value: "short", label: "Under 90m", lte: 89 },
  { value: "standard", label: "90 – 120m", gte: 90, lte: 120 },
  { value: "long", label: "120 – 150m", gte: 121, lte: 150 },
  { value: "epic", label: "150m +", gte: 151 },
];

export const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "ko", label: "Korean" },
  { value: "ja", label: "Japanese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
];

/** Decade starts offered by the filter (newest first, like the reference). */
export const DECADE_OPTIONS = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950];

/** Dot colours for the genre chips, matching Moctale's genre palette. */
const GENRE_COLORS: Record<string, string> = {
  Action: "#bd0010",
  Adventure: "#d97706",
  Animation: "#00CE7A",
  Comedy: "#fcb700",
  Crime: "#8B5CF6",
  Documentary: "#38BDF8",
  Drama: "#7a503e",
  Family: "#34D399",
  Fantasy: "#B048FF",
  History: "#A16207",
  Horror: "#3f3f46",
  Kids: "#22D3EE",
  Music: "#F472B6",
  Mystery: "#5017ab",
  Reality: "#2DD4BF",
  Romance: "#fe486a",
  "Sci-Fi": "#00b1b8",
  Thriller: "#0041a8",
  "War & Politics": "#64748B",
  War: "#64748B",
  Western: "#D97706",
};

export function genreColor(name: string): string {
  return GENRE_COLORS[name] ?? "#8A8A93";
}

export const TYPE_OPTIONS: { value: BrowseType; label: string; href: string }[] = [
  { value: "all", label: "All", href: "/browse" },
  { value: "movie", label: "Movies", href: "/movies" },
  { value: "tv", label: "TV Shows", href: "/tv-shows" },
  { value: "anime", label: "Anime", href: "/anime" },
];

export const SORT_OPTIONS: { value: BrowseSort; label: string }[] = [
  { value: "popularity", label: "Popularity" },
  { value: "recent", label: "Recent Releases" },
  { value: "rating", label: "Rating" },
  { value: "oldest", label: "Oldest" },
];

export const DEFAULT_SORT: BrowseSort = "recent";

/**
 * 7reels-style browse paging: one view loads eight TMDB pages (160 cards),
 * so Next advances the page param from 1 to 9 rather than 1 to 2.
 */
export const BROWSE_PAGES_PER_VIEW = 8;

/** Route that owns a given content type — the type pills navigate between these. */
export function browsePathFor(type: BrowseType): string {
  return TYPE_OPTIONS.find((t) => t.value === type)?.href ?? "/browse";
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Keep repeated query keys instead of letting the last one win. Browse's genre
 * filter appends one `genre` per selection (`?genre=Action&genre=Comedy`).
 */
export function searchParamsToRecord(searchParams: {
  forEach(callback: (value: string, key: string) => void): void;
}): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};
  searchParams.forEach((value, key) => {
    const existing = record[key];
    record[key] =
      existing === undefined
        ? value
        : Array.isArray(existing)
          ? [...existing, value]
          : [existing, value];
  });
  return record;
}

/** Read repeated and comma-separated genre values into one de-duplicated list. */
function readGenres(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(
    new Set(
      values
        .flatMap((item) => item.split(","))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
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

  const genres = readGenres(searchParams.genre);
  const providerRaw = Number(firstValue(searchParams.provider));
  const yearRaw = Number(firstValue(searchParams.year));
  const pageRaw = Number(firstValue(searchParams.page));
  const sortRaw = firstValue(searchParams.sort);
  // "latest" was the old name for the same date-descending order; keep
  // existing links working while the UI and new URLs say recent.
  const normalizedSort = sortRaw === "latest" ? "recent" : sortRaw;
  const industryRaw = firstValue(searchParams.industry);

  const decadeRaw = Number(firstValue(searchParams.decade));
  const yearFloor = Number.isInteger(yearRaw) && yearRaw > 1800 ? yearRaw : null;
  const decade =
    Number.isInteger(decadeRaw) && DECADE_OPTIONS.includes(decadeRaw)
      ? decadeRaw
      : null;

  const ageRaw = firstValue(searchParams.age);
  const ageRating: AgeRating | null =
    ageRaw === "kids" || ageRaw === "teen" || ageRaw === "mature"
      ? ageRaw
      : null;

  const durationRaw = firstValue(searchParams.duration);
  const duration: DurationBand | null =
    durationRaw === "short" ||
    durationRaw === "standard" ||
    durationRaw === "long" ||
    durationRaw === "epic"
      ? durationRaw
      : null;

  const languageRaw = firstValue(searchParams.language)?.trim().toLowerCase();
  const language = LANGUAGE_OPTIONS.some((option) => option.value === languageRaw)
    ? (languageRaw as string)
    : null;

  return {
    type,
    genres,
    provider: Number.isInteger(providerRaw) && providerRaw > 0 ? providerRaw : null,
    year: yearFloor,
    sort: isSort(normalizedSort) ? normalizedSort : DEFAULT_SORT,
    industry: industryRaw === "bollywood" ? "bollywood" : DEFAULT_INDUSTRY,
    decade: yearFloor ? null : decade,
    ageRating,
    duration,
    language,
    hideAnime: firstValue(searchParams.hide_anime) === "1",
    select: firstValue(searchParams.select) === "1",
    family: firstValue(searchParams.family) === "1",
    award: firstValue(searchParams.award) === "1",
    page: Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 500) : 1,
  };
}

/** True when anything is narrowing the results (drives "Clear filters"). */
export function hasActiveFilters(filters: BrowseFilters): boolean {
  return countActiveFilters(filters) > 0 || filters.page > 1;
}

/** How many filter controls are narrowing the grid (the panel's badge). */
export function countActiveFilters(filters: BrowseFilters): number {
  let count = 0;
  count += filters.genres.length;
  if (filters.provider) count += 1;
  if (filters.year) count += 1;
  if (filters.sort !== DEFAULT_SORT) count += 1;
  if (filters.industry !== DEFAULT_INDUSTRY) count += 1;
  if (filters.decade) count += 1;
  if (filters.ageRating) count += 1;
  if (filters.duration) count += 1;
  if (filters.language) count += 1;
  if (filters.hideAnime) count += 1;
  if (filters.select) count += 1;
  if (filters.family) count += 1;
  if (filters.award) count += 1;
  return count;
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

  for (const genre of next.genres) params.append("genre", genre);
  if (next.provider) params.set("provider", String(next.provider));
  if (next.year) params.set("year", String(next.year));
  if (!next.year && next.decade) params.set("decade", String(next.decade));
  if (next.ageRating) params.set("age", next.ageRating);
  if (next.duration) params.set("duration", next.duration);
  if (next.language) params.set("language", next.language);
  if (next.hideAnime) params.set("hide_anime", "1");
  if (next.select) params.set("select", "1");
  if (next.family) params.set("family", "1");
  if (next.award) params.set("award", "1");
  if (next.sort !== DEFAULT_SORT) params.set("sort", next.sort);
  if (next.industry !== DEFAULT_INDUSTRY) params.set("industry", next.industry);
  // Paging is only preserved when paging is what changed.
  if (patch.page && patch.page > 1) params.set("page", String(patch.page));

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

