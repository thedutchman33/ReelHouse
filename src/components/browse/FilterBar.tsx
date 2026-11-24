"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon, CloseIcon, SearchIcon } from "@/components/player/icons";
import {
  AGE_RATING_OPTIONS,
  DECADE_OPTIONS,
  DEFAULT_INDUSTRY,
  DEFAULT_SORT,
  DURATION_OPTIONS,
  LANGUAGE_OPTIONS,
  SORT_OPTIONS,
  browseHref,
  countActiveFilters,
  genreColor,
  type AgeRating,
  type BrowseFilters,
  type BrowseType,
  type DurationBand,
} from "@/lib/browse";
import type { WatchProvider } from "@/lib/tmdb";

// ---------------------------------------------------------------------------
// Browse filters — Moctale-style left panel.
//
// One bordered card holding every narrowing control: sort, OTT, content type,
// genre, decade, age rating, duration, language and year. The three discovery
// pills (Reelhouse Select / Family Friendly / Award Winner) live in the results
// column above the grid.
//
// Every control writes through `onChange`, so a pick is one browse-state update
// (and one /api/browse fetch). Content type is a route, so it navigates between
// /movies, /tv-shows, /browse and /anime, carrying the rest of the filters in
// the URL.
// ---------------------------------------------------------------------------

function FilterIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 24 24" width="17">
      <path
        d="M4 7h16M7 12h10M10 17h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="13" viewBox="0 0 24 24" width="13">
      <path
        d="m5 12 4 4L19 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

/** A service icon with a branded fallback when TMDB's logo can't load. */
function OttLogo({
  name,
  src,
  color = "#24242B",
}: {
  name: string;
  src: string;
  color?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-[5px]"
      style={{ backgroundColor: color }}
    >
      {failed ? (
        <span className="text-[8px] font-bold tracking-tight text-white">
          {name.slice(0, 2).toUpperCase()}
        </span>
      ) : (
        // TMDB provider logos are square app icons; the button text names them.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
          src={src}
        />
      )}
    </span>
  );
}

function Section({
  title,
  children,
  hint,
}: {
  title: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="border-t border-white/[0.07] px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A8A93]">
          {title}
        </p>
        {hint && <span className="text-[10px] text-white/30">{hint}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * Styled listbox for the two remaining dropdowns. Unlike a native select it
 * keeps the dark panel treatment on every OS, scrolls long year lists inside a
 * capped menu, and supports arrow keys, Home/End and Escape.
 */
function PanelSelect<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = useId();

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => String(option.value) === String(value))
  );
  const selectedLabel =
    options.find((option) => String(option.value) === String(value))?.label ?? "";
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        option.label.toLowerCase().includes(normalizedQuery)
      )
    : options;

  const openMenu = () => {
    setQuery("");
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  const choose = (next: T) => {
    if (String(next) !== String(value)) onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const focusOption = (index: number) => {
    if (filteredOptions.length === 0) return;
    const next =
      (index + filteredOptions.length) % filteredOptions.length;
    setActiveIndex(next);
    optionRefs.current[next]?.focus();
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        if (!open) return;
        const inSearch = event.target === searchRef.current;
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          focusOption(inSearch ? 0 : activeIndex + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          focusOption(
            inSearch ? filteredOptions.length - 1 : activeIndex - 1
          );
        } else if (!inSearch && event.key === "Home") {
          event.preventDefault();
          focusOption(0);
        } else if (!inSearch && event.key === "End") {
          event.preventDefault();
          focusOption(filteredOptions.length - 1);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${selectedLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          openMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          }
        }}
        className={`h-10 w-full cursor-pointer rounded-lg border px-3 pr-9 text-left text-sm font-medium outline-none transition ${
          open
            ? "border-accent/60 bg-[#1A1A21] text-white"
            : "border-white/10 bg-[#17171C] text-[#E2E2E2] hover:border-white/25"
        }`}
      >
        <span className="block truncate">{selectedLabel}</span>
        <ChevronDownIcon
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-transform duration-200 ${
            open ? "rotate-180 text-white/70" : ""
          }`}
          size={14}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-white/15 bg-[#18181E] shadow-[0_18px_48px_rgba(0,0,0,0.7)]">
          <div className="border-b border-white/[0.08] p-2">
            <label className="sr-only" htmlFor={`${listboxId}-search`}>
              Search {label.toLowerCase()}
            </label>
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/35"
                size={14}
              />
              <input
                ref={searchRef}
                id={`${listboxId}-search`}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const option =
                      filteredOptions[activeIndex] ?? filteredOptions[0];
                    if (option) choose(option.value);
                  }
                }}
                placeholder={`Search ${label.toLowerCase()}s...`}
                autoComplete="off"
                spellCheck={false}
                className="h-9 w-full rounded-lg border border-white/10 bg-[#111116] pl-8 pr-2.5 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-accent/50"
              />
            </div>
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label={label}
            className="max-h-56 overflow-y-auto overscroll-contain p-1.5"
          >
            {filteredOptions.length === 0 ? (
              <p
                role="status"
                className="px-3 py-4 text-center text-[12px] text-white/40"
              >
                No matches
              </p>
            ) : (
              filteredOptions.map((option, index) => {
                const selected = String(option.value) === String(value);
                return (
                  <button
                    key={String(option.value)}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    onClick={() => choose(option.value)}
                    onFocus={() => setActiveIndex(index)}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] outline-none transition-colors ${
                      selected
                        ? "bg-accent/[0.14] font-semibold text-white"
                        : "text-[#CFCFD4] hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06] focus:text-white"
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {selected && <CheckIcon />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  disabled = false,
  onClick,
  children,
  dot,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dot?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors ${
        active
          ? "border-accent/70 bg-accent/[0.12] text-white"
          : "border-white/10 bg-[#141419] text-[#C6C6C6] hover:border-white/25 hover:text-white"
      } disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
      )}
      {children}
    </button>
  );
}

export default function FilterBar({
  filters,
  onChange,
  genres,
  years,
  providers,
}: {
  filters: BrowseFilters;
  /** Merge a patch into the browse filter state (resets paging itself). */
  onChange: (patch: Partial<Omit<BrowseFilters, "type">>) => void;
  genres: string[];
  years: number[];
  /** Same curated, priority-ordered set as the homepage OTT rail. */
  providers: WatchProvider[];
}) {
  const router = useRouter();

  const activeCount = countActiveFilters(filters);
  const durationLocked = filters.type === "tv";

  const goToType = (type: BrowseType) =>
    router.push(browseHref(filters, { type, page: 1 }));

  const clearAll = () => {
    onChange({
      genres: [],
      provider: null,
      year: null,
      decade: null,
      ageRating: null,
      duration: null,
      language: null,
      hideAnime: false,
      select: false,
      family: false,
      award: false,
      sort: DEFAULT_SORT,
      industry: DEFAULT_INDUSTRY,
      page: 1,
    });
  };

  return (
    <aside
      aria-label="Filters"
      className="rounded-2xl border border-white/10 bg-[#0C0C10]"
    >
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <div className="flex items-center gap-2.5 text-[#E2E2E2]">
          <FilterIcon />
          <span className="text-[15px] font-semibold">Filters</span>
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/10 px-1.5 text-[11px] font-semibold text-white">
            {activeCount}
          </span>
        </div>
        <button
          type="button"
          onClick={clearAll}
          disabled={activeCount === 0}
          className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-white/45 transition hover:text-white disabled:cursor-default disabled:opacity-35"
        >
          <CloseIcon size={11} />
          Clear
        </button>
      </div>

      <Section title="Sort by">
        <div role="group" aria-label="Sort by" className="grid grid-cols-2 gap-2">
          {SORT_OPTIONS.map((option) => {
            const active = filters.sort === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ sort: option.value, page: 1 })}
                className={`h-9 w-full cursor-pointer rounded-lg border px-2 text-[12px] font-medium transition-colors ${
                  active
                    ? "border-accent/70 bg-accent/[0.12] text-white"
                    : "border-white/10 bg-[#141419] text-[#C6C6C6] hover:border-white/25 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </Section>

      {filters.type !== "anime" && providers.length > 0 && (
        <Section title="OTT">
          <div
            role="group"
            aria-label="OTT"
            className="grid max-h-[252px] grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]"
          >
            {providers.map((provider) => {
              const active = filters.provider === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  title={provider.name}
                  aria-pressed={active}
                  onClick={() =>
                    onChange({
                      provider: active ? null : provider.id,
                      page: 1,
                    })
                  }
                  className={`flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-left transition-colors ${
                    active
                      ? "border-accent/70 bg-accent/[0.12] text-white"
                      : "border-white/10 bg-[#141419] text-[#D4D4D8] hover:border-white/25 hover:text-white"
                  }`}
                >
                  <OttLogo name={provider.name} src={provider.logoUrl} />
                  <span className="min-w-0 truncate text-[11px] font-semibold">
                    {provider.name}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Content type">
        <div className="flex flex-wrap gap-2">
          <Chip active={filters.type === "all"} onClick={() => goToType("all")}>
            All
          </Chip>
          <Chip active={filters.type === "movie"} onClick={() => goToType("movie")}>
            Movies
          </Chip>
          <Chip active={filters.type === "tv"} onClick={() => goToType("tv")}>
            Shows
          </Chip>
          <Chip active={filters.type === "anime"} onClick={() => goToType("anime")}>
            Anime
          </Chip>
        </div>
      </Section>

      <Section
        title="Genre"
        hint={filters.genres.length > 1 ? `${filters.genres.length} selected` : undefined}
      >
        <div className="flex flex-wrap gap-2">
          {genres.map((genre) => {
            const active = filters.genres.includes(genre);
            return (
              <Chip
                key={genre}
                active={active}
                dot={genreColor(genre)}
                onClick={() =>
                  onChange({
                    genres: active
                      ? filters.genres.filter((item) => item !== genre)
                      : [...filters.genres, genre],
                    page: 1,
                  })
                }
              >
                {genre}
              </Chip>
            );
          })}
        </div>
      </Section>

      <Section title="Decade">
        <div className="flex flex-wrap gap-2">
          {DECADE_OPTIONS.map((decade) => (
            <Chip
              key={decade}
              active={filters.decade === decade}
              disabled={Boolean(filters.year)}
              onClick={() =>
                onChange({
                  decade: filters.decade === decade ? null : decade,
                  page: 1,
                })
              }
            >
              {decade}s
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Age rating">
        <div className="flex flex-wrap gap-2">
          {AGE_RATING_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={filters.ageRating === option.value}
              onClick={() =>
                onChange({
                  ageRating:
                    filters.ageRating === option.value
                      ? null
                      : (option.value as AgeRating),
                  page: 1,
                })
              }
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Duration" hint={durationLocked ? "Movies only" : undefined}>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={filters.duration === option.value}
              disabled={durationLocked}
              onClick={() =>
                onChange({
                  duration:
                    filters.duration === option.value
                      ? null
                      : (option.value as DurationBand),
                  page: 1,
                })
              }
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Language">
        <PanelSelect
          label="Language"
          onChange={(language) => onChange({ language, page: 1 })}
          options={[
            { value: "", label: "All languages" },
            ...LANGUAGE_OPTIONS,
          ]}
          value={filters.language ?? ""}
        />
      </Section>

      <Section title="Year">
        <PanelSelect
          label="Year"
          onChange={(value) =>
            onChange({ year: value ? Number(value) : null, page: 1 })
          }
          options={[
            { value: "", label: "All years" },
            ...years.map((year) => ({ value: String(year), label: String(year) })),
          ]}
          value={filters.year ? String(filters.year) : ""}
        />
      </Section>
    </aside>
  );
}

/**
 * The three discovery pills above the grid. Each one is a hard filter on the
 * catalogue: Reelhouse Select (curated acclaim), Family Friendly (kid-safe
 * certifications) and Award Winner (award-calibre acclaim).
 */
export function DiscoveryToggles({
  filters,
  onChange,
}: {
  filters: BrowseFilters;
  onChange: (patch: Partial<Omit<BrowseFilters, "type">>) => void;
}) {
  const pills = [
    {
      key: "select" as const,
      label: "Reelhouse Select",
      on: filters.select,
      accent: "#FFC400",
      text: "bg-gradient-to-r from-[#FFC400] via-[#FF8A00] to-[#FF5DA2] bg-clip-text text-transparent",
      border: "border-[#6E5900]",
      bg: "bg-[#171204]",
      activeBorder: "border-[#FFC400]",
      activeBg: "bg-[#211900]",
    },
    {
      key: "family" as const,
      label: "Family Friendly",
      on: filters.family,
      accent: "#5FD36C",
      text: "text-[#5FD36C]",
      border: "border-[#2B5D37]",
      bg: "bg-[#0A140C]",
      activeBorder: "border-[#5FD36C]",
      activeBg: "bg-[#0D1F12]",
    },
    {
      key: "award" as const,
      label: "Award Winner",
      on: filters.award,
      accent: "#38BDF8",
      text: "text-[#38BDF8]",
      border: "border-[#1D4E66]",
      bg: "bg-[#08131A]",
      activeBorder: "border-[#38BDF8]",
      activeBg: "bg-[#0A1C27]",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {pills.map((pill) => (
        <button
          key={pill.key}
          type="button"
          aria-pressed={pill.on}
          onClick={() => onChange({ [pill.key]: !pill.on, page: 1 })}
          className={`inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition hover:brightness-110 ${
            pill.on
              ? `${pill.activeBorder} ${pill.activeBg}`
              : `${pill.border} ${pill.bg}`
          }`}
        >
          <span
            aria-hidden="true"
            className={`grid h-4 w-4 place-items-center rounded-[5px] border ${
              pill.on ? "border-transparent" : "bg-transparent"
            }`}
            style={{
              borderColor: pill.on ? "transparent" : pill.accent,
              backgroundColor: pill.on ? pill.accent : undefined,
            }}
          >
            {pill.on && (
              <svg fill="none" height="10" viewBox="0 0 12 12" width="10">
                <path
                  d="M2.5 6.2 4.8 8.5 9.5 3.5"
                  stroke="#0B0B0E"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            )}
          </span>
          <span className={pill.text}>{pill.label}</span>
        </button>
      ))}
    </div>
  );
}
