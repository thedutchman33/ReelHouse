"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import PosterImage from "@/components/media/PosterImage";
import { CheckIcon, ChevronDownIcon } from "@/components/player/icons";
import {
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  SearchIcon,
  XIcon,
} from "@/components/library/icons";
import { useTrackingUpcoming } from "@/components/notifications/use-tracking-upcoming";
import { monthKey, monthLabel, todayKey } from "@/lib/calendar";
import {
  logTrackingEvent,
  setTracked,
  setTrackingNotify,
  useLatestProgressFor,
  useTracked,
  type TrackedEntry,
} from "@/lib/library";
import {
  daysUntil,
  episodeCode,
  episodeCoordinate,
  episodeWhen,
  followingGroupFor,
  FOLLOWING_GROUP_ORDER,
  MAX_TRACKED_CALENDAR_IDS,
  trackedTmdbId,
  trackedTmdbIds,
  type FollowingGroupKey,
  type TrackedEpisodeInfo,
  type TrackedShowStatus,
  type TrackingNotify,
} from "@/lib/tracking";
import { toast } from "@/lib/toast";
import { rovingKeyDown, usePopover } from "@/lib/use-popover";
import CalendarHeader from "./CalendarHeader";

type SortMode = "next" | "title" | "status";

const SORT_OPTIONS: { value: SortMode; label: string; hint: string }[] = [
  { value: "next", label: "Next air date", hint: "Soonest episode first" },
  { value: "title", label: "Title", hint: "Alphabetical A–Z" },
  { value: "status", label: "Status", hint: "Returning shows first" },
];

const STATUS_SORT_RANK: Record<string, number> = {
  "Returning Series": 0,
  "In Production": 1,
  Planned: 2,
  Ended: 3,
  Canceled: 4,
};

function statusRank(show: TrackedShowStatus | undefined): number {
  if (!show) return 99;
  return STATUS_SORT_RANK[show.status] ?? 50;
}

interface RowData {
  entry: TrackedEntry;
  show?: TrackedShowStatus;
  episode: TrackedEpisodeInfo | null;
  group: FollowingGroupKey;
}

function coordinateValue(episode: {
  seasonNumber: number;
  episodeNumber: number;
}): number {
  return episode.seasonNumber * 1000 + episode.episodeNumber;
}

function dateOfTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function chooseEpisode(
  show: TrackedShowStatus | undefined,
  month: string
): TrackedEpisodeInfo | null {
  if (!show) return null;
  const today = todayKey();
  if (month === monthKey()) {
    const upcoming = show.monthEpisodes.find(
      (episode) => episode.airDate >= today
    );
    if (upcoming) return upcoming;
    return show.nextEpisode ?? show.lastEpisode ?? show.monthEpisodes[0] ?? null;
  }
  return show.monthEpisodes[0] ?? show.nextEpisode ?? show.lastEpisode ?? null;
}

function statusLabel(show: TrackedShowStatus | undefined): string {
  if (!show) return "Schedule unavailable";
  if (show.status === "Ended") return "Ended";
  if (show.status === "Canceled") return "Canceled";
  if (show.status === "In Production" || show.status === "Planned") {
    return "Upcoming";
  }
  if (!show.nextEpisode) return "On hiatus";
  return show.status;
}

function groupLabel(key: FollowingGroupKey, month: string): string {
  if (key === "month" && month !== monthKey()) {
    return `Airs in ${monthLabel(month)}`;
  }
  switch (key) {
    case "today":
      return "Airs today";
    case "tomorrow":
      return "Tomorrow";
    case "week":
      return "This week";
    case "month":
      return "Later this month";
    case "later":
      return "Later";
    default:
      return "On hiatus / Ended";
  }
}

function FollowingSort({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (value: SortMode) => void;
}) {
  const { open, rootRef, triggerRef, toggle, close } = usePopover<HTMLDivElement>();
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const current = SORT_OPTIONS.find((option) => option.value === value) ?? SORT_OPTIONS[0]!;

  useEffect(() => {
    if (!open) return;
    const options = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!options?.length) return;
    const selected = Array.from(options).find(
      (option) => option.getAttribute("aria-selected") === "true"
    );
    (selected ?? options[0])?.focus();
  }, [open]);

  const choose = (next: SortMode) => {
    onChange(next);
    close(true);
  };

  return (
    <div ref={rootRef} className="relative w-full shrink-0 md:w-auto">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Sort followed shows: ${current.label}`}
        title="Order the shows inside each time group"
        onClick={toggle}
        onKeyDown={(event) => {
          if (open) return;
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            toggle();
          }
        }}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-left text-sm text-text outline-none transition hover:border-white/20 focus-visible:border-accent/45 focus-visible:ring-2 focus-visible:ring-accent/20 md:w-auto md:min-w-[190px]"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Sort
          </span>
          <span className="truncate font-medium">{current.label}</span>
        </span>
        <ChevronDownIcon
          size={14}
          className={`shrink-0 text-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Sort followed shows"
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              close(true);
              return;
            }
            rovingKeyDown(
              event,
              Array.from(
                listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
              )
            );
          }}
          className="panel rh-pop rh-pop-right rh-stagger absolute right-0 top-full z-30 mt-2 w-full min-w-[240px] p-1.5 md:w-[260px]"
        >
          {SORT_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => choose(option.value)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors focus:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 ${
                  selected ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                }`}
              >
                <span className="min-w-0">
                  <span
                    className={`block text-[13px] font-semibold ${
                      selected ? "text-accent" : "text-text"
                    }`}
                  >
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                    {option.hint}
                  </span>
                </span>
                {selected && <CheckIcon size={14} className="shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FollowingRow({
  entry,
  show,
  episode,
  group,
  month,
  manage,
  selected,
  onSelect,
  onUnfollow,
}: {
  entry: TrackedEntry;
  show?: TrackedShowStatus;
  episode: TrackedEpisodeInfo | null;
  group: FollowingGroupKey;
  month: string;
  manage: boolean;
  selected: boolean;
  onSelect: () => void;
  onUnfollow: () => void;
}) {
  const progress = useLatestProgressFor(entry.media.id);
  const upcoming = Boolean(episode && daysUntil(episode.airDate, todayKey()) >= 0);
  const target = upcoming ? episode : progress?.episode ?? episode;
  const targetHref = target
    ? `/watch/${entry.media.type}/${entry.media.tmdbId}?s=${target.seasonNumber}&e=${target.episodeNumber}`
    : null;
  const newSince =
    Boolean(progress?.episode && show?.lastEpisode) &&
    coordinateValue(show!.lastEpisode!) > coordinateValue(progress!.episode!) &&
    show!.lastEpisode!.airDate > dateOfTimestamp(progress!.updatedAt) &&
    show!.lastEpisode!.airDate <= todayKey();

  const detailsHref = `/${entry.media.type}/${entry.media.tmdbId}`;
  const notify = entry.notify ?? "all";
  const inactive = group === "inactive";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.09] bg-white/[0.035] p-2.5 transition hover:border-white/[0.14] hover:bg-white/[0.05]">
      {manage && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={`Select ${entry.media.title}`}
          className="h-4 w-4 shrink-0 accent-[rgb(var(--rh-accent))]"
        />
      )}

      <Link
        href={detailsHref}
        prefetch={false}
        className="relative h-[78px] w-[52px] shrink-0 overflow-hidden rounded-md bg-surface-2 ring-1 ring-white/[0.09]"
      >
        <PosterImage
          src={entry.media.posterUrl}
          title={entry.media.title}
          type={entry.media.type}
          className="h-full w-full object-cover"
          sizes="52px"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={detailsHref}
            prefetch={false}
            className="min-w-0 truncate text-sm font-semibold text-text transition hover:text-accent"
          >
            {entry.media.title}
          </Link>
          {newSince && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-accent">
              New since you watched
            </span>
          )}
        </div>

        {episode ? (
          <>
            <p className="mt-0.5 truncate text-xs text-muted">
              {inactive ? "Last aired " : ""}
              {episodeCode(episode)}
              {episode.name ? ` · ${episode.name}` : ""}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-muted/80">
              {episodeWhen(episode.airDate, todayKey())} · {episode.airDate}
              {!inactive && show?.status ? ` · ${show.status}` : ""}
            </p>
          </>
        ) : (
          <p className="mt-0.5 text-xs text-muted">
            {statusLabel(show)} · no announced episode
          </p>
        )}

        {progress && (
          <p className="mt-1 truncate text-[11px] text-muted">
            {progress.episode
              ? `You're on ${episodeCoordinate(progress.episode)}`
              : "Started this title"}
            {target && target !== progress.episode
              ? ` — ${episodeCoordinate(target)} is next`
              : ""}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {targetHref && (
          <Link
            href={targetHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[11px] font-bold text-accent-ink transition hover:bg-accent-strong"
            onClick={() =>
              logTrackingEvent({
                eventType: "notification_click",
                mediaId: entry.media.id,
                metadata: { surface: "following", month },
              })
            }
          >
            <PlayIcon size={11} />
            {progress ? "Continue" : "Play"}
          </Link>
        )}

        <label className="sr-only" htmlFor={`alerts-${entry.media.id}`}>
          Alerts for {entry.media.title}
        </label>
        <span className="relative inline-flex shrink-0">
          <select
            id={`alerts-${entry.media.id}`}
            value={notify}
            onChange={(event) =>
              setTrackingNotify(entry.media, event.target.value as TrackingNotify)
            }
            title="Episode alerts"
            className="h-8 cursor-pointer appearance-none rounded-lg border border-white/10 bg-[rgb(18_19_20)] py-0 pl-2 pr-6 text-[10.5px] font-medium text-muted outline-none transition hover:border-white/20 hover:text-text focus:border-accent/45"
          >
            <option value="all">All episodes</option>
            <option value="premieres">Premieres only</option>
            <option value="off">Alerts off</option>
          </select>
          <ChevronDownIcon
            size={12}
            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted"
          />
        </span>

        <button
          type="button"
          onClick={onUnfollow}
          aria-label={`Stop following ${entry.media.title}`}
          title="Stop following"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-white/[0.06] hover:text-danger"
        >
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
}

export default function FollowingView({
  monthOffset,
  month,
}: {
  monthOffset: number;
  month: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tracked = useTracked();
  const ids = useMemo(() => trackedTmdbIds(tracked), [tracked]);
  const { shows, loading, error, reload, truncated } = useTrackingUpcoming(
    ids,
    month
  );

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("next");
  const [manage, setManage] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = useMemo<RowData[]>(() => {
    const byTmdb = new Map(shows.map((show) => [show.tmdbId, show]));
    const today = todayKey();
    return tracked.map((entry) => {
      const tmdbId = trackedTmdbId(entry.media);
      const show = tmdbId ? byTmdb.get(tmdbId) : undefined;
      const episode = chooseEpisode(show, month);
      let group = followingGroupFor({
        date: episode?.airDate ?? null,
        month,
        today,
      });
      // Relative labels (Today / Tomorrow / This week) only make sense for the
      // current month. When browsing ahead, every episode in that month shares
      // the single "Airs in <month>" group.
      if (month !== monthKey() && episode?.airDate.startsWith(month)) {
        group = "month";
      }
      if (
        show &&
        (show.status === "Ended" || show.status === "Canceled") &&
        !show.nextEpisode
      ) {
        group = "inactive";
      }
      return { entry, show, episode, group };
    });
  }, [tracked, shows, month]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? rows.filter(
          (row) =>
            row.entry.media.title.toLowerCase().includes(needle) ||
            (row.show?.name.toLowerCase().includes(needle) ?? false)
        )
      : rows;

    return [...filtered].sort((a, b) => {
      if (sort === "title") {
        return a.entry.media.title.localeCompare(b.entry.media.title);
      }
      if (sort === "status") {
        return (
          statusRank(a.show) - statusRank(b.show) ||
          a.entry.media.title.localeCompare(b.entry.media.title)
        );
      }
      return (
        (a.episode?.airDate ?? "9999-12-31").localeCompare(
          b.episode?.airDate ?? "9999-12-31"
        ) || a.entry.media.title.localeCompare(b.entry.media.title)
      );
    });
  }, [rows, query, sort]);

  const grouped = useMemo(() => {
    const map = new Map<FollowingGroupKey, RowData[]>();
    for (const row of visibleRows) {
      const list = map.get(row.group);
      if (list) list.push(row);
      else map.set(row.group, [row]);
    }
    return map;
  }, [visibleRows]);

  const nextUpRow = useMemo(
    () =>
      [...rows]
        .filter(
          (row) => row.episode && daysUntil(row.episode.airDate, todayKey()) >= 0
        )
        .sort((a, b) =>
          (a.episode?.airDate ?? "9999-12-31").localeCompare(
            b.episode?.airDate ?? "9999-12-31"
          )
        )[0],
    [rows]
  );
  const airsThisMonth = rows.some((row) =>
    row.episode?.airDate.startsWith(month)
  );

  const toggleSelected = (mediaId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  };

  const unfollow = (entry: TrackedEntry) => {
    setTracked(entry.media, false);
    setSelected((current) => {
      if (!current.has(entry.media.id)) return current;
      const next = new Set(current);
      next.delete(entry.media.id);
      return next;
    });
    toast(`Stopped following ${entry.media.title}.`);
  };

  const unfollowSelected = () => {
    const targets = tracked.filter((entry) => selected.has(entry.media.id));
    targets.forEach((entry) => setTracked(entry.media, false));
    setSelected(new Set());
    setManage(false);
    toast(
      `Stopped following ${targets.length} ${
        targets.length === 1 ? "show" : "shows"
      }.`
    );
  };

  const goMonth = (delta: number) => {
    const next = Math.max(0, monthOffset + delta);
    if (next === monthOffset) return;
    startTransition(() => {
      router.push(
        `/calendar?view=tracking${next > 0 ? `&m=${next}` : ""}`
      );
    });
  };

  const monthName = monthLabel(month);

  return (
    <div className="red-accent w-full px-6 pb-12 pt-24 md:px-16">
      <CalendarHeader mode="tracking" monthOffset={monthOffset} />

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => goMonth(-1)}
              disabled={pending || monthOffset === 0}
              className="nm-raise-sm grid h-8 w-8 place-items-center rounded-lg text-text transition disabled:opacity-30"
            >
              <ChevronLeftIcon size={17} />
            </button>
            <h2 className="min-w-[9rem] text-center text-lg font-bold capitalize text-text">
              {monthName}
            </h2>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => goMonth(1)}
              disabled={pending}
              className="nm-raise-sm grid h-8 w-8 place-items-center rounded-lg text-text transition disabled:opacity-30"
            >
              <ChevronRightIcon size={17} />
            </button>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Every series you follow, grouped by when its next episode airs. Use
            the bell on any series page or card to add more.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tracked.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setManage((value) => !value);
                setSelected(new Set());
              }}
              aria-pressed={manage}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                manage
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-white/12 bg-white/[0.04] text-muted hover:text-text"
              }`}
            >
              {manage ? "Done" : "Manage"}
            </button>
          )}
        </div>
      </div>

      {tracked.length === 0 ? (
        <div className="nm-inset mt-6 rounded-2xl px-6 py-14 text-center md:py-16">
          <div className="mx-auto flex max-w-md flex-col items-center">
            <BellIcon size={30} className="text-accent" />
            <h2 className="mt-3 text-sm font-semibold text-text">
              You&apos;re not following any shows yet
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Tap the bell on any series or anime page — or use Track series in
              Add to list — and its new episodes appear here and in your
              calendar.
            </p>
            <Link href="/tv-shows" className="btn-accent mt-5 h-10 px-5 py-0 text-sm">
              Browse series
            </Link>
          </div>
        </div>
      ) : (
        <>
          {(truncated || tracked.length > MAX_TRACKED_CALENDAR_IDS) && (
            <p className="mt-4 text-xs text-muted">
              You follow more than {MAX_TRACKED_CALENDAR_IDS} shows — this
              timeline covers your {MAX_TRACKED_CALENDAR_IDS} most recent
              follows.
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <SearchIcon
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a show you follow"
                aria-label="Find a followed show"
                className="h-10 w-full rounded-lg border border-white/[0.1] bg-white/[0.04] pl-9 pr-3 text-sm text-text outline-none placeholder:text-muted/60 focus:border-accent/45"
              />
            </div>
            <FollowingSort value={sort} onChange={setSort} />
          </div>

          {manage && selected.size > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={unfollowSelected}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger px-3 text-xs font-bold text-white transition hover:bg-danger/85"
              >
                <XIcon size={13} />
                Stop following selected ({selected.size})
              </button>
            </div>
          )}

          {error ? (
            <div className="nm-inset mt-6 rounded-2xl px-6 py-12 text-center">
              <p className="text-sm font-semibold text-text">
                Couldn&apos;t load your shows&apos; schedule
              </p>
              <p className="mt-1 text-sm text-muted">
                Your follows are saved. This is only the episode request.
              </p>
              <button
                type="button"
                onClick={reload}
                className="btn-ghost mt-4 h-9 px-4 py-0 text-sm"
              >
                Try again
              </button>
            </div>
          ) : loading && shows.length === 0 ? (
            <p className="mt-6 text-sm text-muted">Loading your shows…</p>
          ) : visibleRows.length === 0 ? (
            <div className="nm-inset mt-6 rounded-2xl px-6 py-12 text-center">
              <SearchIcon size={26} className="mx-auto text-muted" />
              <p className="mt-3 text-sm font-semibold text-text">
                No shows match “{query}”
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="btn-ghost mt-4 h-9 px-4 py-0 text-sm"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className={`mt-6 space-y-7 transition-opacity ${pending ? "opacity-55" : ""}`}>
              {!airsThisMonth && !loading && (
                <div className="nm-inset rounded-xl px-4 py-3 text-sm text-muted">
                  None of your shows air in {monthName}.{" "}
                  {nextUpRow?.episode
                    ? `Next up: ${nextUpRow.entry.media.title} — ${episodeWhen(
                        nextUpRow.episode.airDate
                      )}.`
                    : "No upcoming episodes are announced yet."}
                </div>
              )}

              {FOLLOWING_GROUP_ORDER.map((key) => {
                const items = grouped.get(key) ?? [];
                if (items.length === 0) return null;
                return (
                  <section key={key} aria-labelledby={`following-${key}`}>
                    <div className="mb-3 flex items-center gap-2">
                      <h2
                        id={`following-${key}`}
                        className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted"
                      >
                        {groupLabel(key, month)}
                      </h2>
                      <span className="text-[11px] text-muted/60">
                        {items.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
                      {items.map((row) => (
                        <FollowingRow
                          key={row.entry.media.id}
                          entry={row.entry}
                          show={row.show}
                          episode={row.episode}
                          group={row.group}
                          month={month}
                          manage={manage}
                          selected={selected.has(row.entry.media.id)}
                          onSelect={() => toggleSelected(row.entry.media.id)}
                          onUnfollow={() => unfollow(row.entry)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}

            </div>
          )}
        </>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <Link href="/notifications" className="btn-ghost h-9 gap-2 px-3 py-0 text-xs">
          <BellIcon size={14} />
          Notifications
        </Link>
        <Link href="/my-list" className="btn-ghost h-9 gap-2 px-3 py-0 text-xs">
          <ChevronRightIcon size={14} />
          My List
        </Link>
      </div>
    </div>
  );
}
