"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon, CloseIcon } from "@/components/player/icons";
import {
  SORT_OPTIONS,
  TYPE_OPTIONS,
  browseHref,
  type BrowseFilters,
  type BrowseType,
} from "@/lib/browse";
import { dedupeByFamily, sortProviders } from "@/lib/provider-logos";
import type { WatchProvider } from "@/lib/tmdb";

// ---------------------------------------------------------------------------
// Browse filters.
//
// Three separate rows, in this order:
//   1. one toolbar row: the search field, then Genre / Source / Year
//   2. the selected filters, as removable pills with "Clear all"
//   3. the content-type tabs (underline) with the sort choices beside them
//
// The dropdowns are custom listboxes painted in a portal on <body> with fixed
// positioning, so the menu is always above the poster grid and can never be
// clipped by the toolbar. They follow the select-only combobox pattern:
// arrow keys move, Enter picks, Escape closes, and the trigger keeps focus so
// screen readers follow the active option.
//
// Filtering is client-side: each pick updates BrowseClient's filter state, so a
// change is one /api/browse fetch. The type tabs are plain links between the
// prerendered /browse, /movies, /tv-shows and /anime shells, carrying the
// current filters across in the URL.
// ---------------------------------------------------------------------------

interface SelectOption {
  value: string;
  label: string;
}

interface PanelPosition {
  top: number;
  left: number;
  width: number;
}

/** One dropdown: styled 46px trigger + a themed option panel in a portal. */
function FilterSelect({
  label,
  display,
  value,
  options,
  onChange,
}: {
  label: string;
  /** Value shown on the face (the "all" wording when nothing is picked). */
  display: string;
  /** Raw option value; "" means "all". */
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [panel, setPanel] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const narrowed = value !== "";
  const selectedIndex = options.findIndex((option) => option.value === value);

  // Fixed coordinates measured from the trigger: 6px below it, flipping above
  // when the viewport runs out of room, clamped to stay on screen sideways.
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, 216);
    const height = Math.min(options.length * 38 + 14, 300);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const openUp = spaceBelow < height && rect.top - 12 > spaceBelow;
    const left = Math.min(
      Math.max(rect.left, 12),
      Math.max(12, window.innerWidth - width - 12)
    );
    setPanel({
      top: openUp ? Math.max(12, rect.top - height - 6) : rect.bottom + 6,
      left,
      width,
    });
  }, [options.length]);

  const openMenu = () => {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    place();
    setOpen(true);
  };

  const pick = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Dismissal: click/tap outside, Escape, or any page scroll away from the
  // panel (the panel's own option scrolling must not close it).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      place();
    };
    const onResize = () => setOpen(false);

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, place]);

  // Keep the keyboard cursor visible in a scrolling list.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`${listId}-option-${active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (options[active]) pick(options[active]);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-option-${active}` : undefined}
        aria-label={`${label}: ${display}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={`relative flex h-[46px] min-w-[172px] flex-1 items-center justify-between gap-3 rounded-xl border px-4 text-left transition-colors sm:flex-none ${
          narrowed
            ? "border-accent/70 bg-accent/[0.07]"
            : "border-white/10 bg-surface hover:border-white/20"
        } ${open ? "border-white/30" : ""}`}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={`shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] ${
              narrowed ? "text-accent" : "text-muted"
            }`}
          >
            {label}
          </span>
          <span className="truncate text-sm font-semibold text-text">{display}</span>
        </span>
        <ChevronDownIcon
          size={16}
          className={`shrink-0 transition-transform duration-200 ${
            narrowed ? "text-accent" : "text-muted"
          } ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        panel &&
        createPortal(
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            aria-label={label}
            style={{ top: panel.top, left: panel.left, width: panel.width }}
            className="menu-scroll fixed z-[120] max-h-[300px] overflow-y-auto rounded-xl border border-white/12 bg-surface-2 p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === active;
              return (
                <div
                  key={option.value || "all"}
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(option)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive ? "bg-white/[0.07]" : ""
                  } ${isSelected ? "font-semibold text-accent" : "font-medium text-text"}`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <CheckIcon size={14} className="shrink-0 text-accent" />}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

export default function FilterBar({
  filters,
  onChange,
  genres,
  years,
  providers = [],
  searchSlot,
  dimmed = false,
}: {
  filters: BrowseFilters;
  /** Merge a patch into the browse filter state (resets paging itself). */
  onChange: (patch: Partial<Omit<BrowseFilters, "type">>) => void;
  genres: string[];
  years: number[];
  providers?: WatchProvider[];
  /** The catalog search field, sharing the toolbar row with the dropdowns. */
  searchSlot?: React.ReactNode;
  /** Search mode: filters don't apply to search results, so they de-emphasize
      instead of offering controls that would do nothing. */
  dimmed?: boolean;
}) {
  const router = useRouter();
  const inert = dimmed ? "pointer-events-none select-none opacity-40 transition-opacity" : "";

  // Source options mirror the homepage provider rail exactly: one entry per
  // brand family (Netflix, not Netflix Kids + Netflix; HBO Max, not the
  // Amazon Channel reseller), in the family priority order.
  const familyProviders: WatchProvider[] = sortProviders(dedupeByFamily(providers));
  const activeProvider = familyProviders.find((p) => p.id === filters.provider);

  const genreOptions: SelectOption[] = [
    { value: "", label: "All genres" },
    ...genres.map((genre) => ({ value: genre, label: genre })),
  ];
  const providerOptions: SelectOption[] = [
    { value: "", label: "All providers" },
    ...familyProviders.map((p) => ({ value: String(p.id), label: p.name })),
  ];
  const yearOptions: SelectOption[] = [
    { value: "", label: "All years" },
    ...years.map((year) => ({ value: String(year), label: String(year) })),
  ];

  const goToType = (type: BrowseType, base: BrowseFilters = filters) =>
    router.push(browseHref(base, { type, page: 1 }));

  // What the viewer has narrowed by, in the order it appears on the page.
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.type !== "all") {
    chips.push({
      key: "type",
      label: TYPE_OPTIONS.find((option) => option.value === filters.type)?.label ?? "All",
      // The type is the route, so dropping it means going back to /browse with
      // everything else kept.
      remove: () => goToType("all"),
    });
  }
  if (filters.genre) {
    chips.push({
      key: "genre",
      label: filters.genre,
      remove: () => onChange({ genre: null, page: 1 }),
    });
  }
  if (activeProvider) {
    chips.push({
      key: "source",
      label: activeProvider.name,
      remove: () => onChange({ provider: null, page: 1 }),
    });
  }
  if (filters.year) {
    chips.push({
      key: "year",
      label: String(filters.year),
      remove: () => onChange({ year: null, page: 1 }),
    });
  }

  // "Clear all" resets type, genre, source and year — the ordering stays.
  const clearAll = () => {
    onChange({ genre: null, provider: null, year: null, page: 1 });
    if (filters.type !== "all") {
      goToType("all", { ...filters, genre: null, provider: null, year: null, page: 1 });
    }
  };

  return (
    <div className="space-y-5">
      {/* 1 — one toolbar row: the search leads, the three dropdowns trail.
          Separate controls (never boxed together), all 46px tall; on a phone
          the search takes the row and the filters wrap beneath it. */}
      <div className={`flex flex-wrap items-center gap-3 ${inert}`}>
        {searchSlot && <div className="min-w-0 flex-[1_1_300px]">{searchSlot}</div>}
        <FilterSelect
          label="Genre"
          display={filters.genre ?? "All genres"}
          value={filters.genre ?? ""}
          options={genreOptions}
          onChange={(value) => onChange({ genre: value || null, page: 1 })}
        />
        {providerOptions.length > 1 && (
          <FilterSelect
            label="Source"
            display={activeProvider?.name ?? "All providers"}
            value={filters.provider ? String(filters.provider) : ""}
            options={providerOptions}
            onChange={(value) => onChange({ provider: value ? Number(value) : null, page: 1 })}
          />
        )}
        <FilterSelect
          label="Year"
          display={filters.year ? String(filters.year) : "All years"}
          value={filters.year ? String(filters.year) : ""}
          options={yearOptions}
          onChange={(value) => onChange({ year: value ? Number(value) : null, page: 1 })}
        />
      </div>

      {/* 2 — what is currently applied, each removable on its own. */}
      <div
        aria-live="polite"
        className={`flex min-h-[34px] flex-wrap items-center gap-2 ${inert}`}
      >
        {chips.length === 0 ? (
          <span className="text-[13px] text-muted">No filters selected</span>
        ) : (
          <>
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/[0.08] py-1 pl-3 pr-1 text-[13px] font-medium text-accent"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.remove}
                  aria-label={`Remove ${chip.label} filter`}
                  className="grid h-5 w-5 cursor-pointer place-items-center rounded-full bg-accent text-accent-ink transition hover:brightness-110"
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={clearAll}
              className="ml-1 cursor-pointer text-[13px] font-medium text-muted underline-offset-4 transition hover:text-text hover:underline"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {/* 3 — content type as underline tabs, ordering as bordered choices. */}
      <div
        className={`flex flex-col gap-3 border-b border-white/10 sm:flex-row sm:items-end sm:justify-between sm:gap-6 ${inert}`}
      >
        <nav
          aria-label="Content type"
          className="no-scrollbar -mx-1 flex items-center gap-6 overflow-x-auto px-1"
        >
          {TYPE_OPTIONS.map((option) => {
            const current = option.value === filters.type;
            return (
              <Link
                key={option.value}
                href={
                  current
                    ? browseHref(filters)
                    : browseHref(filters, { type: option.value, page: 1 })
                }
                aria-current={current ? "true" : undefined}
                className={`relative shrink-0 whitespace-nowrap pb-3 pt-1 text-sm font-medium transition-colors ${
                  current ? "text-text" : "text-muted hover:text-text"
                }`}
              >
                {option.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-colors ${
                    current ? "bg-accent" : "bg-transparent"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-2 sm:pb-1">
          <span className="mr-1.5 hidden shrink-0 text-sm font-semibold text-text sm:inline">
            Sort by
          </span>
          {SORT_OPTIONS.map((option) => {
            const current = filters.sort === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange({ sort: option.value, page: 1 })}
                aria-current={current ? "true" : undefined}
                className={`shrink-0 cursor-pointer whitespace-nowrap rounded-[10px] border px-4 py-[9px] text-sm transition-colors ${
                  current
                    ? "border-accent bg-accent font-semibold text-white"
                    : "border-white/10 bg-surface font-medium text-text hover:border-white/25"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
