import Link from "next/link";
import FilterBar from "@/components/browse/FilterBar";
import MediaGrid from "@/components/media/MediaGrid";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/player/icons";
import { browseHref, hasActiveFilters, parseBrowseFilters, type BrowseType } from "@/lib/browse";
import { getBrowseOptions, getBrowseResults } from "@/lib/tmdb";

// ---------------------------------------------------------------------------
// Shared browse screen.
//
// /browse, /movies and /tv-shows are the same view with a different content type
// pinned, so there is one implementation of filtering, paging and empty states
// instead of three that drift apart.
// ---------------------------------------------------------------------------

export type BrowseSearchParams = Record<string, string | string[] | undefined>;

export default async function BrowseView({
  type,
  title,
  subtitle,
  searchParams,
}: {
  /** Pinned content type: "all" on /browse, "movie" on /movies, "tv" on /tv-shows. */
  type: BrowseType;
  title: string;
  subtitle: string;
  searchParams: Promise<BrowseSearchParams>;
}) {
  const filters = parseBrowseFilters(await searchParams, type);
  const options = getBrowseOptions(type);
  const { items, page, totalPages } = await getBrowseResults(filters);

  const hasPrev = page > 1;
  const hasNext = totalPages > page;

  return (
    <div className="container-rh py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </header>

      <FilterBar filters={filters} genres={options.genres} years={options.years} />

      <div className="mt-6">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
            <p className="text-lg font-semibold text-text">No titles match these filters</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Try a different genre or year — or clear the filters to see everything.
            </p>
            {hasActiveFilters(filters) && (
              <Link
                href={browseHref({
                  type: filters.type,
                  genre: null,
                  year: null,
                  sort: "popularity",
                  page: 1,
                })}
                className="btn-ghost mt-6"
              >
                Clear Filters
              </Link>
            )}
          </div>
        ) : (
          <MediaGrid items={items} />
        )}
      </div>

      {/* Paging is only offered when the source actually reports another page. */}
      {(hasPrev || hasNext) && (
        <nav
          className="mt-8 flex items-center justify-center gap-3"
          aria-label="Pagination"
        >
          {hasPrev ? (
            <Link href={browseHref(filters, { page: page - 1 })} className="btn-ghost h-9 px-4">
              <ChevronLeftIcon size={16} />
              Previous
            </Link>
          ) : (
            <span className="btn-ghost h-9 cursor-not-allowed px-4 opacity-40" aria-disabled="true">
              <ChevronLeftIcon size={16} />
              Previous
            </span>
          )}

          <span className="text-sm text-muted">
            Page {page}
            {totalPages > 0 && ` of ${totalPages}`}
          </span>

          {hasNext ? (
            <Link href={browseHref(filters, { page: page + 1 })} className="btn-ghost h-9 px-4">
              Next
              <ChevronRightIcon size={16} />
            </Link>
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
