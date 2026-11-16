"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import MediaCard from "@/components/media/MediaCard";
import PosterImage from "@/components/media/PosterImage";
import {
  ArrowLeftIcon,
  BellIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/library/icons";
import {
  buildCalendarDays,
  episodeBadge,
  episodeSubtitle,
  filterFromType,
  formatDayHeading,
  kindForFilter,
  monthLabel,
  resolveSelectedDate,
  sortCalendarItems,
  todayKey,
  typeParamForFilter,
  type CalendarFilter,
  type CalendarMonthData,
  type CalendarRelease,
} from "@/lib/calendar";
import { useTracked } from "@/lib/library";
import type { MediaSummary } from "@/types";

type CalendarViewMode = "calendar" | "tracking";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const BASE_FILTERS: { key: CalendarFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "movies", label: "Movies" },
  { key: "series", label: "Series" },
  { key: "episodes", label: "Episodes" },
];

function CalendarHeader({
  mode,
  monthOffset,
}: {
  mode: CalendarViewMode;
  monthOffset: number;
}) {
  const calendarHref = `/calendar${monthOffset > 0 ? `?m=${monthOffset}` : ""}`;
  const trackingHref = `/calendar?view=tracking${
    monthOffset > 0 ? `&m=${monthOffset}` : ""
  }`;

  return (
    <>
      <Link
        href="/my-list"
        className="nm-raise-sm inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-muted transition hover:text-text"
      >
        <ArrowLeftIcon size={16} />
        Back
      </Link>

      <div className="mt-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent">
          {mode === "tracking" ? "Your shows" : "Coming soon"}
        </p>
        <h1 className="mt-1 font-display text-4xl uppercase leading-none tracking-wider text-text md:text-5xl">
          {mode === "tracking" ? "Tracking" : "Release Calendar"}
        </h1>
      </div>

      <div className="nm-inset mt-5 inline-flex items-center gap-1 rounded-xl p-1">
        <Link
          href={calendarHref}
          className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
            mode === "calendar"
              ? "nm-raise-sm text-accent"
              : "text-muted hover:text-text"
          }`}
        >
          <CalendarDaysIcon size={16} />
          Calendar
        </Link>
        <Link
          href={trackingHref}
          className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
            mode === "tracking"
              ? "nm-raise-sm text-accent"
              : "text-muted hover:text-text"
          }`}
        >
          <BellIcon size={16} />
          Tracking
        </Link>
      </div>
    </>
  );
}

function toSummary(item: CalendarRelease): MediaSummary {
  return {
    id: item.id,
    tmdbId: item.tmdbId,
    type: item.type,
    title: item.title,
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl,
    rating: item.rating,
    releaseDate: item.date,
    genres: [],
  };
}

export default function CalendarView({
  initial,
  initialView,
  monthOffset,
  initialSelectedDate,
  initialFilter,
}: {
  initial: CalendarMonthData;
  initialView: CalendarViewMode;
  monthOffset: number;
  initialSelectedDate: string;
  initialFilter: CalendarFilter;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<CalendarFilter>(initialFilter);
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const tracked = useTracked();
  const month = initial.month;

  const trackedIds = useMemo(
    () => new Set(tracked.map((entry) => entry.media.tmdbId)),
    [tracked]
  );
  const trackedKey = useMemo(
    () => [...trackedIds].sort((a, b) => a - b).join(","),
    [trackedIds]
  );
  const [trackedEpisodes, setTrackedEpisodes] = useState<CalendarRelease[]>([]);
  const [trackedLoading, setTrackedLoading] = useState(false);
  const effectiveFilter: CalendarFilter =
    filter === "tracking" && trackedIds.size === 0 ? "all" : filter;

  useEffect(() => {
    if (filter === "tracking" && tracked.length === 0) setFilter("all");
  }, [filter, tracked.length]);

  // The public month payload only loads its top airing shows. Followed series
  // get their own episode fetch here, so a tracked title is never missing just
  // because it sits outside that popularity cut.
  useEffect(() => {
    if (!trackedKey) {
      setTrackedEpisodes([]);
      setTrackedLoading(false);
      return;
    }

    const controller = new AbortController();
    setTrackedLoading(true);
    const query = new URLSearchParams({ month, ids: trackedKey });
    fetch(`/api/calendar/tracked?${query.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return { items: [] };
        return (await response.json()) as { items?: CalendarRelease[] };
      })
      .then((data) => {
        if (!controller.signal.aborted) setTrackedEpisodes(data.items ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setTrackedEpisodes([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setTrackedLoading(false);
      });

    return () => controller.abort();
  }, [month, trackedKey]);

  const allItems = useMemo(() => {
    const byId = new Map<string, CalendarRelease>();
    const add = (item: CalendarRelease) => {
      const isTrackedEpisode =
        item.kind === "episode" && trackedIds.has(item.tmdbId);
      byId.set(
        item.id,
        isTrackedEpisode ? { ...item, tracked: true } : item
      );
    };
    for (const item of initial.items) add(item);
    for (const item of trackedEpisodes) add(item);
    return sortCalendarItems([...byId.values()]);
  }, [initial.items, trackedEpisodes, trackedIds]);

  const filteredItems = useMemo(
    () => allItems.filter((item) => kindForFilter(effectiveFilter, item)),
    [allItems, effectiveFilter]
  );

  const counts = useMemo(() => {
    const episodes = allItems.filter((item) => item.kind === "episode");
    return {
      all: allItems.length,
      movies: allItems.filter((item) => item.kind === "movie").length,
      series: allItems.filter((item) => item.kind === "series").length,
      episodes: episodes.length,
      tracking: episodes.filter((item) => item.tracked).length,
    };
  }, [allItems]);

  const days = useMemo(
    () => buildCalendarDays(month, filteredItems),
    [month, filteredItems]
  );
  const selectedItems = useMemo(
    () => filteredItems.filter((item) => item.date === selectedDate),
    [filteredItems, selectedDate]
  );
  const cards = selectedItems.filter((item) => item.kind !== "episode");
  const episodeItems = selectedItems.filter((item) => item.kind === "episode");

  const today = todayKey();

  const filterOptions = useMemo(
    () => [
      ...BASE_FILTERS,
      ...(tracked.length > 0
        ? [{ key: "tracking" as CalendarFilter, label: "Tracking" }]
        : []),
    ],
    [tracked.length]
  );

  const filterBarRef = useRef<HTMLDivElement>(null);
  const filterButtons = useRef<
    Partial<Record<CalendarFilter, HTMLButtonElement | null>>
  >({});
  const [pill, setPill] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const measure = () => {
      const button = filterButtons.current[effectiveFilter];
      if (!button) return;
      setPill({
        left: button.offsetLeft,
        top: button.offsetTop,
        width: button.offsetWidth,
        height: button.offsetHeight,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [effectiveFilter, tracked.length]);

  // Day/filter changes are URL state only: the month payload is already here,
  // so the reference does not round-trip to the server for either.
  const replaceUrl = (nextDate: string, nextFilter: CalendarFilter) => {
    const params = new URLSearchParams();
    if (monthOffset > 0) params.set("m", String(monthOffset));
    params.set("d", nextDate);
    const type = typeParamForFilter(nextFilter);
    if (type) params.set("type", type);
    window.history.replaceState(
      null,
      "",
      `/calendar?${params.toString()}`
    );
  };

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setFilter(filterFromType(params.get("type")));
      setSelectedDate(resolveSelectedDate(month, params.get("d")));
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [month]);

  if (initialView === "tracking") {
    return <TrackingView monthOffset={monthOffset} />;
  }

  const goMonth = (delta: number) => {
    const next = Math.max(0, monthOffset + delta);
    if (next === monthOffset) return;
    startTransition(() => {
      const params = new URLSearchParams();
      if (next > 0) params.set("m", String(next));
      const type = typeParamForFilter(effectiveFilter);
      if (type) params.set("type", type);
      router.push(
        `/calendar${params.toString() ? `?${params.toString()}` : ""}`
      );
    });
  };

  const countFor = (key: CalendarFilter): number => {
    if (key === "tracking") return counts.tracking;
    if (key === "movies") return counts.movies;
    if (key === "series") return counts.series;
    if (key === "episodes") return counts.episodes;
    return counts.all;
  };

  const chooseFilter = (key: CalendarFilter) => {
    setFilter(key);
    replaceUrl(selectedDate, key);
  };

  const selectDay = (date: string) => {
    setSelectedDate(date);
    replaceUrl(date, effectiveFilter);
  };

  return (
    <div className="mx-auto w-full max-w-[1880px] px-5 pb-8 pt-24 sm:px-6 md:px-16">
      <CalendarHeader mode="calendar" monthOffset={monthOffset} />

      <div className="mb-4 mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between gap-2 md:justify-start">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => goMonth(-1)}
            disabled={pending || monthOffset === 0}
            className="nm-raise-sm grid h-9 w-9 place-items-center rounded-lg text-text transition disabled:opacity-30"
          >
            <ChevronLeftIcon size={20} />
          </button>
          <h2 className="min-w-0 flex-1 text-center text-lg font-bold capitalize text-text md:min-w-[10rem] md:flex-none md:text-xl">
            {monthLabel(month)}
          </h2>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => goMonth(1)}
            disabled={pending}
            className="nm-raise-sm grid h-9 w-9 place-items-center rounded-lg text-text transition disabled:opacity-30"
          >
            <ChevronRightIcon size={20} />
          </button>
        </div>

        <div className="-mx-5 overflow-x-auto px-5 no-scrollbar sm:-mx-6 sm:px-6 md:mx-0 md:overflow-visible md:px-0">
          <div
            ref={filterBarRef}
            className="nm-inset relative inline-flex items-stretch rounded-xl p-1"
          >
            {pill && (
              <span
                aria-hidden="true"
                className="nm-raise pointer-events-none absolute rounded-lg transition-[left,width,top,height] duration-300"
                style={{
                  left: pill.left,
                  top: pill.top,
                  width: pill.width,
                  height: pill.height,
                  transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
            )}
            {filterOptions.map((option) => {
              const active = effectiveFilter === option.key;
              return (
                <button
                  key={option.key}
                  ref={(node) => {
                    filterButtons.current[option.key] = node;
                  }}
                  type="button"
                  data-pill={option.key}
                  aria-pressed={active}
                  onClick={() => chooseFilter(option.key)}
                  className={`relative z-10 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200 sm:px-4 ${
                    active ? "text-primary" : "text-muted hover:text-text"
                  }`}
                >
                  {option.label}
                  <span className="ml-1.5 text-[11px] opacity-60">
                    {countFor(option.key)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {trackedLoading && effectiveFilter === "tracking" && (
        <p className="mb-4 text-sm text-muted">Loading your tracked episodes…</p>
      )}

      <div className={`transition-opacity ${pending ? "opacity-55" : ""}`}>
        <div className="nm-raise-sm overflow-hidden rounded-[16px] p-2 sm:p-3">
          <div className="mb-1 grid grid-cols-7 gap-1 sm:gap-2">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {days.map((day) => {
              if (!day.inMonth) {
                return (
                  <div
                    key={day.date}
                    aria-hidden="true"
                    className="min-h-[64px] rounded-lg sm:min-h-[118px]"
                  />
                );
              }

              const isToday = day.date === today;
              const isPast = day.date < today;
              const selected = day.date === selectedDate;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => selectDay(day.date)}
                  aria-label={`${formatDayHeading(day.date)} — ${day.items.length}`}
                  aria-pressed={selected}
                  aria-current={isToday ? "date" : undefined}
                  className={`relative flex min-h-[64px] flex-col rounded-lg p-1 text-left transition-colors focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:min-h-[118px] sm:p-2 ${
                    selected
                      ? "bg-accent/[0.14] ring-1 ring-accent/55"
                      : day.items.length > 0
                        ? "bg-white/[0.04] hover:bg-white/[0.08]"
                        : "bg-white/[0.015] hover:bg-white/[0.04]"
                  } ${isPast ? "opacity-55" : ""}`}
                >
                  <span
                    className={`text-xs font-semibold sm:text-sm ${
                      isToday
                        ? "grid h-5 w-5 place-items-center rounded-full bg-accent text-white sm:h-6 sm:w-6"
                        : "text-white/80"
                    }`}
                  >
                    {day.day}
                  </span>

                  {day.items.length > 0 && (
                    <div className="mt-auto flex items-end pt-1">
                      {day.items.slice(0, 3).map((item, index) => (
                        <span
                          key={item.id}
                          title={item.title}
                          style={{ zIndex: 3 - index }}
                          className={`relative block aspect-[2/3] w-[28px] shrink-0 overflow-hidden rounded-[4px] bg-surface-2 ring-1 ring-black/40 sm:w-[38px] ${
                            index > 0 ? "hidden sm:block sm:-ml-3" : ""
                          }`}
                        >
                          <PosterImage
                            src={item.posterUrl}
                            title={item.title}
                            type={item.type}
                            className="h-full w-full object-cover"
                            sizes="38px"
                          />
                        </span>
                      ))}
                      {day.items.length > 3 && (
                        <span className="ml-1 hidden rounded bg-black/55 px-1 text-[11px] font-bold text-white sm:inline">
                          +{day.items.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {day.items.length > 1 && (
                    <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] font-bold leading-4 text-white sm:hidden">
                      +{day.items.length - 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-bold text-text md:text-xl">
          {formatDayHeading(selectedDate)}
          <span className="ml-2 text-sm font-medium text-muted">
            · {selectedItems.length}
          </span>
        </h2>

        {selectedItems.length === 0 ? (
          <p className="text-muted">Nothing scheduled that day — pick another day.</p>
        ) : (
          <>
            {cards.length > 0 && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {cards.map((item) => (
                  <MediaCard key={item.id} item={toSummary(item)} />
                ))}
              </div>
            )}

            {episodeItems.length > 0 && (
              <div className={cards.length > 0 ? "mt-8" : ""}>
                <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
                  New episodes
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {episodeItems.map((item) => {
                    const episode = item.episode;
                    if (!episode) return null;
                    return (
                      <Link
                        key={item.id}
                        href={`/watch/tv/${item.tmdbId}?s=${episode.seasonNumber}&e=${episode.episodeNumber}`}
                        className="group overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.07]"
                      >
                        <div className="relative aspect-video overflow-hidden bg-surface-2">
                          <PosterImage
                            src={
                              item.stillUrl ||
                              item.backdropUrl ||
                              item.posterUrl
                            }
                            title={item.title}
                            type="tv"
                            variant="backdrop"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            sizes="(min-width: 1024px) 560px, (min-width: 640px) 45vw, 92vw"
                          />
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">
                            {item.tracked && <BellIcon size={11} />}
                            {episodeBadge(episode)}
                          </span>
                        </div>
                        <div className="p-3">
                          <p className="truncate font-semibold text-text">
                            {item.title}
                          </p>
                          <p className="truncate text-sm text-muted">
                            {episodeSubtitle(episode)}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function TrackingView({ monthOffset }: { monthOffset: number }) {
  const tracked = useTracked();

  return (
    <div className="mx-auto w-full max-w-[1880px] px-5 pb-8 pt-24 sm:px-6 md:px-16">
      <CalendarHeader mode="tracking" monthOffset={monthOffset} />

      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
        Tap the bell on any series (or Track series in Add to list) to follow it.
        Its new episodes are marked in the calendar.
      </p>

      {tracked.length === 0 ? (
        <div className="nm-inset mt-4 rounded-2xl px-6 py-14 text-center md:py-16">
          <div className="mx-auto flex max-w-md flex-col items-center">
            <BellIcon size={30} className="text-accent" />
            <h2 className="mt-3 text-sm font-semibold text-text">
              You&apos;re not tracking any series yet
            </h2>
            <p className="mt-1 text-sm text-muted">
              Open a series and tap the bell next to Add to List.
            </p>
            <Link href="/tv-shows" className="btn-accent mt-5 h-10 px-5 py-0 text-sm">
              Browse series
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {tracked.map(({ media }) => (
            <Link
              key={media.id}
              href={`/${media.type}/${media.tmdbId}`}
              prefetch={false}
              className="group block"
            >
              <div className="poster-frame">
                <PosterImage
                  src={media.posterUrl}
                  title={media.title}
                  type={media.type}
                  className="poster-img"
                />
              </div>
              <h3 className="mt-2 truncate text-[13px] font-semibold text-text">
                {media.title}
              </h3>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
