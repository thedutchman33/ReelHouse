"use client";

import Link from "next/link";
import { useMemo } from "react";
import PosterImage from "@/components/media/PosterImage";
import { HistoryIcon, PlayIcon, TrashIcon, XIcon } from "@/components/library/icons";
import {
  clearHistory,
  removeTitleProgress,
  useHistory,
  type ProgressEntry,
} from "@/lib/library";
import { yearOf } from "@/lib/utils";

/** Compact relative stamp — "Just now", "3h ago", "Yesterday", "Oct 12, 2026". */
function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HistoryRow({ entry }: { entry: ProgressEntry }) {
  const { media, episode } = entry;
  const base = `/watch/${media.type}/${media.tmdbId}`;
  const href = episode
    ? `${base}?s=${episode.seasonNumber}&e=${episode.episodeNumber}`
    : base;
  // 0 duration = started, but the surface has not reported a length yet.
  const pct =
    entry.duration > 0
      ? Math.min(100, Math.round((entry.position / entry.duration) * 100))
      : 0;

  return (
    <li className="group relative flex items-center gap-3 rounded-xl p-2 pr-2 transition hover:bg-white/[0.04] sm:gap-4 sm:pr-3">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <div className="relative aspect-video w-[132px] shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-1 ring-white/[0.08] sm:w-[168px]">
          <PosterImage
            src={media.backdropUrl || media.posterUrl}
            title={media.title}
            type={media.type}
            variant="backdrop"
            className="h-full w-full object-cover"
            sizes="(min-width: 640px) 168px, 132px"
          />
          {episode && (
            <span className="absolute left-1.5 top-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
              S{episode.seasonNumber} · E{episode.episodeNumber}
            </span>
          )}
          <div className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-ink">
              <PlayIcon size={16} />
            </span>
          </div>
          {pct > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text transition group-hover:text-accent">
            {media.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {episode
              ? episode.title
              : [
                  yearOf(media.releaseDate),
                  media.type === "tv"
                    ? "Series"
                    : media.type === "anime"
                      ? "Anime"
                      : "Film",
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
          <p className="mt-1.5 text-[11px]">
            {entry.completed ? (
              <span className="font-semibold uppercase tracking-wide text-accent/90">
                Finished
              </span>
            ) : entry.duration > 0 ? (
              <span className="text-muted">{pct}% watched</span>
            ) : (
              <span className="text-muted">Started</span>
            )}
            <span className="mx-1.5 text-muted/40 sm:hidden">·</span>
            <span className="text-muted/70 sm:hidden">{timeAgo(entry.updatedAt)}</span>
          </p>
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden whitespace-nowrap text-[11px] text-muted/70 sm:block">
          {timeAgo(entry.updatedAt)}
        </span>
        <button
          type="button"
          onClick={() => removeTitleProgress(media.id)}
          aria-label={`Remove ${media.title} from history`}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-muted transition hover:border-danger/40 hover:text-danger"
        >
          <XIcon size={14} />
        </button>
      </div>
    </li>
  );
}

/**
 * Watch History — the activity log below the library. One row per title (its
 * most recent episode), matching the rule used by Continue Watching so a show
 * never floods the list. Playback progress and resume links stay per-episode.
 */
export default function WatchHistory() {
  const history = useHistory();

  const byTitle = useMemo(() => {
    const seen = new Map<string, ProgressEntry>();
    for (const entry of history) {
      const current = seen.get(entry.media.id);
      if (!current || entry.updatedAt > current.updatedAt) {
        seen.set(entry.media.id, entry);
      }
    }
    return [...seen.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [history]);

  return (
    // The footer and account menu both link to /my-list#history.
    <section id="history" aria-labelledby="history-heading" className="mt-14 scroll-mt-24">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
            History
          </p>
          <h2
            id="history-heading"
            className="mt-1 font-display text-3xl uppercase tracking-wider text-text md:text-4xl"
          >
            Watch History
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="nm-inset rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent/90">
            {byTitle.length} {byTitle.length === 1 ? "Title" : "Titles"}
          </span>
          {byTitle.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted transition hover:text-danger"
            >
              <TrashIcon size={14} />
              Clear all
            </button>
          )}
        </div>
      </div>

      {byTitle.length === 0 ? (
        <div className="nm-inset rounded-2xl px-6 py-10 text-center">
          <HistoryIcon size={30} className="mx-auto text-muted" />
          <p className="mt-3 text-sm font-semibold text-text">No watch history yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">
            Start a movie or an episode and it will show up here with its progress.
          </p>
        </div>
      ) : (
        <div className="nm-inset rounded-2xl p-2 md:p-3">
          <ul className="flex flex-col gap-1">
            {byTitle.map((entry) => (
              <HistoryRow key={entry.media.id} entry={entry} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
