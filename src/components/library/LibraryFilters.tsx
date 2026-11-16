"use client";

import { useState } from "react";
import { SlidersIcon, XIcon } from "@/components/library/icons";
import type {
  LibraryFilterState,
  LibrarySort,
  LibraryTypeFilter,
} from "@/components/library/types";

const TYPE_OPTIONS: { value: LibraryTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "Series" },
  { value: "anime", label: "Anime" },
];

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: "added", label: "Recently added" },
  { value: "title", label: "A–Z" },
  { value: "rating", label: "Top rated" },
  { value: "year", label: "Newest" },
];

function FilterPill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
        active
          ? "nm-raise-sm text-text"
          : "text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

// Reference Filters disclosure: one uppercase neumorphic trigger that opens a
// flat panel. Type, genre and sort stay inside the panel so the grid never
// jumps between two toolbars.
export default function LibraryFilters({
  filters,
  genres,
  onChange,
  resultCount,
  totalCount,
}: {
  filters: LibraryFilterState;
  genres: string[];
  onChange: (patch: Partial<LibraryFilterState>) => void;
  resultCount: number;
  totalCount: number;
}) {
  const [open, setOpen] = useState(false);
  const activeCount =
    (filters.type !== "all" ? 1 : 0) +
    (filters.genre ? 1 : 0) +
    (filters.sort !== "added" ? 1 : 0);

  return (
    <div className="mb-6">
      <div className="flex justify-start">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="library-filters"
          onClick={() => setOpen((value) => !value)}
          className="nm-raise-sm inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-muted transition hover:text-text"
        >
          <SlidersIcon size={16} />
          Filters
          {activeCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold tracking-normal text-accent-ink">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div
          id="library-filters"
          className="nm-inset mt-3 animate-fade-in space-y-4 rounded-2xl p-4 md:p-5"
        >
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">
              Type
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map((option) => (
                <FilterPill
                  key={option.value}
                  active={filters.type === option.value}
                  onClick={() => onChange({ type: option.value })}
                >
                  {option.label}
                </FilterPill>
              ))}
            </div>
          </div>

          {genres.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">
                Genre
              </p>
              <div className="flex flex-wrap gap-1.5">
                <FilterPill
                  active={filters.genre === null}
                  onClick={() => onChange({ genre: null })}
                >
                  All Genres
                </FilterPill>
                {genres.map((genre) => (
                  <FilterPill
                    key={genre}
                    active={filters.genre === genre}
                    onClick={() => onChange({ genre })}
                  >
                    {genre}
                  </FilterPill>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">
              Sort by
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SORT_OPTIONS.map((option) => (
                <FilterPill
                  key={option.value}
                  active={filters.sort === option.value}
                  onClick={() => onChange({ sort: option.value })}
                >
                  {option.label}
                </FilterPill>
              ))}
            </div>
          </div>

          {(activeCount > 0 || resultCount !== totalCount) && (
            <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-3">
              <p className="text-xs text-muted">
                Showing {resultCount} of {totalCount}
              </p>
              <button
                type="button"
                onClick={() => onChange({ type: "all", genre: null, sort: "added" })}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted transition hover:text-text"
              >
                <XIcon size={13} />
                Reset filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
