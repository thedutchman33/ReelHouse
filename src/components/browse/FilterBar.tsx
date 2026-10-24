"use client";

import Link from "next/link";
import { CheckIcon, ChevronRightIcon, CloseIcon, SlidersIcon } from "@/components/player/icons";
import {
  SORT_OPTIONS,
  TYPE_OPTIONS,
  browseHref,
  hasActiveFilters,
  type BrowseFilters,
} from "@/lib/browse";
import { dedupeByFamily, sortProviders } from "@/lib/provider-logos";
import type { WatchProvider } from "@/lib/tmdb";
import { rovingKeyDown, usePopover } from "@/lib/use-popover";

// ---------------------------------------------------------------------------
// Browse filter bar.
//
// Client-side filtering (7reels pattern): every control updates the
// BrowseClient's filter state through `onChange` instead of navigating, so a
// filter pick is one fast /api/browse fetch — no server round-trip for the
// page itself. The URL stays in sync via history state (see BrowseClient), so
// filter views remain shareable.
//
// The type pills are the one exception: they switch between the /browse,
// /movies and /tv-shows pages, which are separate prerendered shells — plain
// links, CDN-fast.
//
// Below `md` the three dropdowns collapse into one "Filters" popover so the bar
// stays a single non-overflowing row on a phone.
// ---------------------------------------------------------------------------

interface Option {
  label: string;
  onSelect: () => void;
  active: boolean;
}

function optionsFrom(
  values: (string | number)[],
  allLabel: string,
  isActive: (value: string | number | null) => boolean,
  select: (value: string | number | null) => void
): Option[] {
  return [
    { label: allLabel, onSelect: () => select(null), active: isActive(null) },
    ...values.map((value) => ({
      label: String(value),
      onSelect: () => select(value),
      active: isActive(value),
    })),
  ];
}

/** One dropdown: a labelled trigger over a list of filter options. */
function FilterMenu({
  label,
  value,
  options,
  align = "left",
}: {
  label: string;
  value: string;
  options: Option[];
  align?: "left" | "right";
}) {
  const { open, rootRef, triggerRef, toggle, close, setOpen } = usePopover();
  const narrowed = options.some((o) => o.active && o !== options[0]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
          narrowed || open
            ? "border-accent/50 bg-surface text-text"
            : "border-white/10 bg-surface/60 text-text/90 hover:border-white/25"
        }`}
      >
        <span className="text-muted/80">{label}</span>
        <span>{value}</span>
        <ChevronRightIcon
          size={13}
          className={`shrink-0 text-muted transition ${open ? "-rotate-90" : "rotate-90"}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={(e) =>
            rovingKeyDown(
              e,
              Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
            )
          }
          className={`panel absolute top-full z-40 mt-2 w-48 max-w-[calc(100vw-2rem)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <p className="panel-label border-b border-border/70">{label}</p>
          <div className="no-scrollbar max-h-72 overflow-y-auto p-1.5">
            {options.map((option) => (
              <button
                key={option.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  option.onSelect();
                  close();
                }}
                className={`menu-item w-full justify-between ${
                  option.active ? "bg-accent/15 text-accent hover:bg-accent/15" : ""
                }`}
              >
                <span className="truncate">{option.label}</span>
                {option.active && <CheckIcon size={15} className="shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Flat option list — used inside the phone sheet, where nesting a popover
    inside a popover would be clipped by the panel's own overflow. */
function FilterGroup({
  label,
  options,
  onSelect,
}: {
  label: string;
  options: Option[];
  onSelect: () => void;
}) {
  return (
    <section>
      <p className="panel-label px-0">{label}</p>
      <div className="no-scrollbar max-h-40 space-y-0.5 overflow-y-auto">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => {
              option.onSelect();
              onSelect();
            }}
            className={`menu-item w-full justify-between ${
              option.active ? "bg-accent/15 text-accent hover:bg-accent/15" : ""
            }`}
          >
            <span className="truncate">{option.label}</span>
            {option.active && <CheckIcon size={15} className="shrink-0" />}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function FilterBar({
  filters,
  onChange,
  genres,
  years,
  providers = [],
}: {
  filters: BrowseFilters;
  /** Merge a patch into the browse filter state (resets paging itself). */
  onChange: (patch: Partial<Omit<BrowseFilters, "type">>) => void;
  genres: string[];
  years: number[];
  providers?: WatchProvider[];
}) {
  const sheet = usePopover();

  const genreOptions = optionsFrom(
    genres,
    "All Genres",
    (value) => filters.genre === value,
    (value) => onChange({ genre: value === null ? null : String(value), page: 1 })
  );

  const yearOptions = optionsFrom(
    years,
    "All Years",
    (value) => filters.year === value,
    (value) => onChange({ year: value === null ? null : Number(value), page: 1 })
  );

  // Source options mirror the homepage provider rail exactly: one entry per
  // brand family (Netflix, not Netflix Kids + Netflix; HBO Max, not the
  // Amazon Channel reseller), in the family priority order. The option filters
  // by the family flagship's TMDB id — the same id the homepage cards link.
  const familyProviders: WatchProvider[] = sortProviders(dedupeByFamily(providers));
  const providerOptions: Option[] = [
    {
      label: "All providers",
      onSelect: () => onChange({ provider: null, page: 1 }),
      active: filters.provider === null,
    },
    ...familyProviders.map((p) => ({
      label: p.name,
      onSelect: () => onChange({ provider: p.id, page: 1 }),
      active: filters.provider === p.id,
    })),
  ];
  const activeProvider = familyProviders.find((p) => p.id === filters.provider);

  const sortOptions: Option[] = SORT_OPTIONS.map((option) => ({
    label: option.label,
    onSelect: () => onChange({ sort: option.value, page: 1 }),
    active: filters.sort === option.value,
  }));

  const active = hasActiveFilters(filters);
  // The industry toggle is not reset here — it's a header switch, not a
  // dropdown filter; the page's own empty-state Clear Filters resets it.
  const clear = () =>
    onChange({ genre: null, provider: null, year: null, sort: "popularity", page: 1 });

  // Sort is an inline pill toggle row (reference pattern); Genre, Source and
  // Year stay dropdowns. The phone sheet keeps them all as groups.
  const dropdowns = (
    <>
      <FilterMenu label="Genre" value={filters.genre ?? "All Genres"} options={genreOptions} />
      {providerOptions.length > 1 && (
        <FilterMenu
          label="Source"
          value={activeProvider?.name ?? "All providers"}
          options={providerOptions}
        />
      )}
      <FilterMenu
        label="Year"
        value={filters.year ? String(filters.year) : "All Years"}
        options={yearOptions}
      />
    </>
  );

  return (
    <div className="space-y-3">
      {/* Sort pills — the reference's Popular/Recent/Top IMDb toggle row. */}
      <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 py-0.5">
        {sortOptions.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={option.onSelect}
            aria-current={option.active ? "true" : undefined}
            className={`pill cursor-pointer ${option.active ? "pill-active" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {/* Content type doubles as navigation between the three browse pages
            (each a prerendered shell — these stay links on purpose). */}
        <div className="no-scrollbar -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-0.5">
          {TYPE_OPTIONS.map((option) => (
            <Link
              key={option.value}
              // browseHref carries the current filters across the switch.
              href={
                option.value === filters.type
                  ? browseHref(filters)
                  : browseHref(filters, { type: option.value, page: 1 })
              }
              aria-current={option.value === filters.type ? "true" : undefined}
              className={`pill h-9 ${option.value === filters.type ? "pill-active" : ""}`}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
          {dropdowns}
          {active && (
            <button type="button" onClick={clear} className="pill h-9 cursor-pointer gap-1.5">
              <CloseIcon size={13} />
              Reset
            </button>
          )}
        </div>

        {/* Phone: one trigger for all four dropdowns. */}
        <div ref={sheet.rootRef} className="relative ml-auto shrink-0 md:hidden">
          <button
            ref={sheet.triggerRef}
            type="button"
            onClick={sheet.toggle}
            aria-expanded={sheet.open}
            className={`pill h-9 ${active || sheet.open ? "pill-active" : ""}`}
          >
            <SlidersIcon size={15} />
            Filters
          </button>

          {sheet.open && (
            <div className="panel absolute right-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] p-3">
              <div className="max-h-[70vh] space-y-2 overflow-y-auto">
                <FilterGroup
                  label="Genre"
                  options={genreOptions}
                  onSelect={() => sheet.close()}
                />
                {providerOptions.length > 1 && (
                  <FilterGroup
                    label="Source"
                    options={providerOptions}
                    onSelect={() => sheet.close()}
                  />
                )}
                <FilterGroup
                  label="Year"
                  options={yearOptions}
                  onSelect={() => sheet.close()}
                />
                <FilterGroup
                  label="Sort by"
                  options={sortOptions}
                  onSelect={() => sheet.close()}
                />
              </div>
              {active && (
                <button
                  type="button"
                  onClick={() => {
                    clear();
                    sheet.close();
                  }}
                  className="btn-ghost mt-3 h-9 w-full cursor-pointer py-0 text-sm"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
