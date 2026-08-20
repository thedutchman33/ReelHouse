"use client";

import Link from "next/link";
import { CheckIcon, ChevronRightIcon, CloseIcon, SlidersIcon } from "@/components/player/icons";
import {
  SORT_OPTIONS,
  TYPE_OPTIONS,
  browseHref,
  hasActiveFilters,
  sortLabel,
  type BrowseFilters,
} from "@/lib/browse";
import { rovingKeyDown, usePopover } from "@/lib/use-popover";

// ---------------------------------------------------------------------------
// Browse filter bar.
//
// Every control is a plain link built from the current filters, so filtering
// works as ordinary navigation: shareable URLs, working back button, and no
// client-side state to fall out of sync with what the server rendered.
//
// The option lists come from the page (which asks the metadata source what it can
// actually satisfy) — this component never invents a genre or a year.
//
// Below `md` the three dropdowns collapse into one "Filters" popover so the bar
// stays a single non-overflowing row on a phone.
// ---------------------------------------------------------------------------

interface Option {
  label: string;
  href: string;
  active: boolean;
}

function optionsFrom(
  values: (string | number)[],
  allLabel: string,
  isActive: (value: string | number | null) => boolean,
  hrefFor: (value: string | number | null) => string
): Option[] {
  return [
    { label: allLabel, href: hrefFor(null), active: isActive(null) },
    ...values.map((value) => ({
      label: String(value),
      href: hrefFor(value),
      active: isActive(value),
    })),
  ];
}

/** One dropdown: a labelled trigger over a list of navigation options. */
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
        className={`pill h-9 ${narrowed || open ? "pill-active" : ""}`}
      >
        <span className="text-muted/80">{label}</span>
        <span className={narrowed ? "font-semibold" : "text-text"}>{value}</span>
        <ChevronRightIcon
          size={13}
          className={`shrink-0 transition ${open ? "-rotate-90" : "rotate-90"}`}
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
              <Link
                key={option.href}
                href={option.href}
                role="menuitem"
                scroll={false}
                onClick={() => close()}
                className={`menu-item justify-between ${
                  option.active ? "bg-accent/15 text-accent hover:bg-accent/15" : ""
                }`}
              >
                <span className="truncate">{option.label}</span>
                {option.active && <CheckIcon size={15} className="shrink-0" />}
              </Link>
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
  onNavigate,
}: {
  label: string;
  options: Option[];
  onNavigate: () => void;
}) {
  return (
    <section>
      <p className="panel-label px-0">{label}</p>
      <div className="no-scrollbar max-h-40 space-y-0.5 overflow-y-auto">
        {options.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            scroll={false}
            onClick={onNavigate}
            className={`menu-item justify-between ${
              option.active ? "bg-accent/15 text-accent hover:bg-accent/15" : ""
            }`}
          >
            <span className="truncate">{option.label}</span>
            {option.active && <CheckIcon size={15} className="shrink-0" />}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function FilterBar({
  filters,
  genres,
  years,
}: {
  filters: BrowseFilters;
  genres: string[];
  years: number[];
}) {
  const sheet = usePopover();

  const genreOptions = optionsFrom(
    genres,
    "All Genres",
    (value) => filters.genre === value,
    (value) => browseHref(filters, { genre: value === null ? null : String(value), page: 1 })
  );

  const yearOptions = optionsFrom(
    years,
    "All Years",
    (value) => filters.year === value,
    (value) => browseHref(filters, { year: value === null ? null : Number(value), page: 1 })
  );

  const sortOptions: Option[] = SORT_OPTIONS.map((option) => ({
    label: option.label,
    href: browseHref(filters, { sort: option.value, page: 1 }),
    active: filters.sort === option.value,
  }));

  const active = hasActiveFilters(filters);
  const clearHref = browseHref({
    type: filters.type,
    genre: null,
    year: null,
    sort: "popularity",
    page: 1,
  });

  const dropdowns = (
    <>
      <FilterMenu label="Genre" value={filters.genre ?? "All Genres"} options={genreOptions} />
      <FilterMenu
        label="Year"
        value={filters.year ? String(filters.year) : "All Years"}
        options={yearOptions}
      />
      <FilterMenu
        label="Sort by"
        value={sortLabel(filters.sort)}
        options={sortOptions}
        align="right"
      />
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {/* Content type doubles as navigation between the three browse routes. */}
        <div className="no-scrollbar -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-0.5">
          {TYPE_OPTIONS.map((option) => (
            <Link
              key={option.value}
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
            <Link href={clearHref} className="pill h-9 gap-1.5">
              <CloseIcon size={13} />
              Clear Filters
            </Link>
          )}
        </div>

        {/* Phone: one trigger for all three dropdowns. */}
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
                  onNavigate={() => sheet.close()}
                />
                <FilterGroup
                  label="Year"
                  options={yearOptions}
                  onNavigate={() => sheet.close()}
                />
                <FilterGroup
                  label="Sort by"
                  options={sortOptions}
                  onNavigate={() => sheet.close()}
                />
              </div>
              {active && (
                <Link
                  href={clearHref}
                  onClick={() => sheet.close()}
                  className="btn-ghost mt-3 h-9 w-full py-0 text-sm"
                >
                  Clear Filters
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
