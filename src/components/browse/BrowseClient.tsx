"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import FilterBar from "@/components/browse/FilterBar";
import IndustryToggle from "@/components/browse/IndustryToggle";
import MediaGrid from "@/components/media/MediaGrid";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/player/icons";
import {
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
// ---------------------------------------------------------------------------

type Paged = { items: MediaSummary[]; page: number; totalPages: number };

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

  const [page, setPage] = useState<Paged>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  const change = useCallback((patch: Partial<BrowseFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
  }, []);

  // Fetch whenever the filter state changes.
  useEffect(() => {
    const id = ++reqId.current;
    const controller = new AbortController();
    setLoading(true);

    const qs = new URLSearchParams({ type: filters.type });
    if (filters.genre) qs.set("genre", filters.genre);
    if (filters.provider) qs.set("provider", String(filters.provider));
    if (filters.year) qs.set("year", String(filters.year));
    if (filters.sort !== "popularity") qs.set("sort", filters.sort);
    if (filters.industry !== "hollywood") qs.set("industry", filters.industry);
    if (filters.page > 1) qs.set("page", String(filters.page));

    fetch(`/api/browse?${qs.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: Paged) => {
        if (id !== reqId.current) return; // a newer filter change superseded us
        setPage({
          items: data.items ?? [],
          page: data.page ?? filters.page,
          totalPages: data.totalPages ?? 0,
        });
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        if (id !== reqId.current) return;
        setPage(EMPTY_PAGE);
        setLoading(false);
      });

    return () => controller.abort();
  }, [filters]);

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

  const hasPrev = page.page > 1;
  const hasNext = page.totalPages > page.page;

  return (
    <div className="container-rh py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Browse</p>
          <h1 className="mt-1 font-display text-4xl uppercase leading-none tracking-wide text-text sm:text-5xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
        </div>
        <IndustryToggle
          industry={filters.industry}
          onChange={(industry) => change({ industry, page: 1 })}
        />
      </header>

      <FilterBar
        filters={filters}
        onChange={change}
        genres={genres}
        years={years}
        providers={providers}
      />

      <div className="mt-6">
        {loading && page.items.length === 0 ? (
          // First paint of this filter combination — placeholder cards.
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            aria-hidden="true"
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-surface/60" />
            ))}
          </div>
        ) : page.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
            <p className="text-lg font-semibold text-text">No titles match these filters</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Try a different genre or year — or clear the filters to see everything.
            </p>
            <button
              type="button"
              onClick={() =>
                change({ genre: null, provider: null, year: null, sort: "popularity", industry: "hollywood", page: 1 })
              }
              className="btn-ghost mt-6 cursor-pointer"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          // Refetch in flight: keep the previous grid on screen, dimmed, so
          // switching filters never blanks the page.
          <div
            className={`transition-opacity ${loading ? "pointer-events-none opacity-40" : ""}`}
          >
            <MediaGrid items={page.items} />
          </div>
        )}
      </div>

      {(hasPrev || hasNext) && (
        <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
          {hasPrev ? (
            <button
              type="button"
              onClick={() => change({ page: page.page - 1 })}
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
            {page.totalPages > 0 ? `${page.page}–${page.totalPages}` : `Page ${page.page}`}
          </span>

          {hasNext ? (
            <button
              type="button"
              onClick={() => change({ page: page.page + 1 })}
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
