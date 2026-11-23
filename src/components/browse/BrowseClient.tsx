"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import FilterBar from "@/components/browse/FilterBar";
import IndustryToggle from "@/components/browse/IndustryToggle";
import MediaGrid from "@/components/media/MediaGrid";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, SearchIcon } from "@/components/player/icons";
import {
  BROWSE_PAGES_PER_VIEW,
  browseHref,
  parseBrowseFilters,
  type BrowseFilters,
  type BrowseType,
} from "@/lib/browse";
import type { WatchProvider } from "@/lib/tmdb";
import type { MediaSummary } from "@/types";

// ---------------------------------------------------------------------------
// Browse results, client-side (7reels pattern).
//
// The page shell is prerendered — this component owns filter state, fetches
// the grid from /api/browse (edge-cached), and syncs the URL via
// history.replaceState so filter views stay shareable without a server
// round-trip. A filter pick is one small JSON fetch; the previous grid stays
// on screen (dimmed) until the new one lands, which reads as instant.
//
// Page-level search: a debounced field scoped to THIS page's catalog. While a
// query is active the grid comes from /api/search?type=… instead (anime pages
// search AniList), the filter bar steps aside, and clearing it returns to the
// filtered browse grid.
// ---------------------------------------------------------------------------

type Paged = { items: MediaSummary[]; page: number; totalPages: number };

// Browse geometry: 2 poster columns on phones, up to 8 on a wide display.
const CARD_GRID_CLASS =
  "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8";

const EMPTY_PAGE: Paged = { items: [], page: 1, totalPages: 0 };

export default function BrowseClient({
  type: pinnedType,
  title,
  subtitle,
  genres,
  years,
  providers,
}: {
  /** Fixed on /movies and /tv-shows; "all" on /browse (switchable via pills). */
  type: BrowseType;
  title: string;
  subtitle: string;
  genres: string[];
  years: number[];
  providers: MediaSummary["posterUrl"] extends never ? never : import("@/lib/tmdb").WatchProvider[];
}) {
  const params = useSearchParams();
  const [filters, setFilters] = useState<BrowseFilters>(() => {
    const fromUrl: Record<string, string> = {};
    params.forEach((value, key) => {
      fromUrl[key] = value;
    });
    return parseBrowseFilters(fromUrl, pinnedType === "all" ? undefined : pinnedType);
  });

  // Page-level search state. The debounced copy drives the fetch; the raw
  // value drives the input so typing never feels gated.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState<Paged>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to the catalog search, unless the viewer is already typing
  // somewhere (the page-level input, a filter, another field).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const change = useCallback((patch: Partial<BrowseFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const query = debouncedSearch.trim();
  const searching = query.length > 0;

  // Fetch whenever the filter state or the search query changes.
  useEffect(() => {
    const id = ++reqId.current;
    const controller = new AbortController();
    setLoading(true);

    const settle = (data: Paged) => {
      if (id !== reqId.current) return; // a newer change superseded us
      setPage(data);
      setLoading(false);
    };
    const fail = (err: unknown) => {
      if ((err as Error)?.name === "AbortError") return;
      if (id !== reqId.current) return;
      setPage(EMPTY_PAGE);
      setLoading(false);
    };

    if (searching) {
      const sqs = new URLSearchParams({ q: query });
      if (filters.type !== "all") sqs.set("type", filters.type);
      fetch(`/api/search?${sqs.toString()}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: { results?: MediaSummary[] }) =>
          settle({ items: data.results ?? [], page: 1, totalPages: 0 })
        )
        .catch(fail);
    } else {
      const qs = new URLSearchParams({ type: filters.type });
      if (filters.genre) qs.set("genre", filters.genre);
      if (filters.provider) qs.set("provider", String(filters.provider));
      if (filters.year) qs.set("year", String(filters.year));
      if (filters.sort !== "popularity") qs.set("sort", filters.sort);
      if (filters.industry !== "hollywood") qs.set("industry", filters.industry);
      if (filters.page > 1) qs.set("page", String(filters.page));

      fetch(`/api/browse?${qs.toString()}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: Paged) =>
          settle({
            items: data.items ?? [],
            page: data.page ?? filters.page,
            totalPages: data.totalPages ?? 0,
          })
        )
        .catch(fail);
    }

    return () => controller.abort();
  }, [filters, searching, query]);

  // Keep the URL shareable without triggering a navigation.
  useEffect(() => {
    window.history.replaceState(null, "", browseHref(filters, { page: filters.page }));
  }, [filters]);

  // A page change jumps back to the top of the results.
  const prevPage = useRef(filters.page);
  useEffect(() => {
    if (filters.page !== prevPage.current) {
      prevPage.current = filters.page;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [filters.page]);

  const changeType = useCallback(
    (type: BrowseType) => change({ type, sort: "popularity", page: 1 }),
    [change]
  );

  // 7reels loads eight TMDB pages per view, so Next moves the page param by 8
  // (1 -> 9 -> 17). Anime's AniList source stays one page at a time.
  const pagesPerView = filters.type === "anime" ? 1 : BROWSE_PAGES_PER_VIEW;
  const pageEnd = Math.min(page.page + pagesPerView - 1, page.totalPages);
  const hasPrev = !searching && page.page > 1;
  const hasNext = !searching && page.totalPages > page.page + pagesPerView - 1;

  return (
    <div className="browse-accent w-full px-6 py-8 md:px-16">
      <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {/* Catalog chrome: one display-face title with the accent full stop —
              no eyebrow repeating the same word above it. */}
          <h1 className="font-display text-[clamp(56px,9vw,92px)] uppercase leading-[0.9] text-text">
            {title}
            <span className="text-accent">.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{subtitle}</p>
        </div>
        {/* The industry slide is a Movies/Series control; the anime page is
            already language-scoped (Japanese) by its query. */}
        {!searching && filters.type !== "anime" && (
          <IndustryToggle
            industry={filters.industry}
            onChange={(industry) => change({ industry, page: 1 })}
          />
        )}
      </header>

      {/* One toolbar row: search on the left, the three dropdowns on the right,
          all 46px tall and visually separate. "/" focuses the search. */}
      <div className="mt-6">
        <FilterBar
          filters={filters}
          onChange={change}
          genres={genres}
          years={years}
          providers={providers}
          searchSlot={
            <div className="relative">
              <SearchIcon
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearch("");
                }}
                placeholder="Search movies and series"
                aria-label="Search this catalog"
                className="h-[46px] w-full rounded-[14px] border border-white/10 bg-surface pl-12 pr-12 text-sm text-text outline-none transition placeholder:text-muted/70 focus:border-accent/70 focus:ring-4 focus:ring-accent/15"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted transition hover:bg-white/10 hover:text-text"
                >
                  <CloseIcon size={15} />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                  /
                </kbd>
              )}
            </div>
          }
          dimmed={searching}
        />
      </div>

      <p className="mt-6 text-[13px] text-muted" aria-live="polite">
        {searching
          ? loading && page.items.length === 0
            ? "Searching…"
            : `${page.items.length} result${page.items.length === 1 ? "" : "s"} for “${query}”`
          : `${page.items.length} title${page.items.length === 1 ? "" : "s"}`}
      </p>

      <div className="mt-4">
        {loading && page.items.length === 0 ? (
          // First paint of this filter combination — placeholder cards.
          <div className={CARD_GRID_CLASS} aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-surface/60" />
            ))}
          </div>
        ) : page.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
            <p className="text-lg font-semibold text-text">
              {searching ? "No matches" : "No titles match these filters"}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              {searching
                ? `No ${filters.type === "all" ? "titles" : filters.type === "movie" ? "movies" : filters.type === "tv" ? "series" : "anime"} match “${query}” — try a different spelling.`
                : "Try a different genre or year — or clear the filters to see everything."}
            </p>
            {searching ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="btn-ghost mt-6 cursor-pointer"
              >
                Clear Search
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  change({ genre: null, provider: null, year: null, sort: "popularity", industry: "hollywood", page: 1 })
                }
                className="btn-ghost mt-6 cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          // Refetch in flight: keep the previous grid on screen, dimmed, so
          // switching filters never blanks the page.
          <div
            className={`transition-opacity ${loading ? "pointer-events-none opacity-40" : ""}`}
          >
            <MediaGrid items={page.items} className={CARD_GRID_CLASS} />
          </div>
        )}
      </div>

      {(hasPrev || hasNext) && (
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
          {hasPrev ? (
            <button
              type="button"
              onClick={() => change({ page: Math.max(1, page.page - pagesPerView) })}
              className="btn-ghost h-9 cursor-pointer"
            >
              <ChevronLeftIcon size={16} />
              Previous
            </button>
          ) : (
            <span className="btn-ghost h-9 cursor-not-allowed px-4 opacity-40" aria-disabled="true">
              <ChevronLeftIcon size={16} />
              Previous
            </span>
          )}

          <span className="text-sm text-muted">
            {page.totalPages > 0
              ? pagesPerView > 1
                ? `${page.page}–${pageEnd} / ${page.totalPages}`
                : `${page.page} / ${page.totalPages}`
              : `Page ${page.page}`}
          </span>

          {hasNext ? (
            <button
              type="button"
              onClick={() => change({ page: page.page + pagesPerView })}
              className="btn-ghost h-9 cursor-pointer"
            >
              Next
              <ChevronRightIcon size={16} />
            </button>
          ) : (
            <span className="btn-ghost h-9 cursor-not-allowed px-4 opacity-40" aria-disabled="true">
              Next
              <ChevronRightIcon size={16} />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
