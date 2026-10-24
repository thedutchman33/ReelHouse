"use client";

import Link from "next/link";
import MediaGrid from "@/components/media/MediaGrid";
import PosterImage from "@/components/media/PosterImage";
import { CloseIcon, PlayIcon } from "@/components/player/icons";
import { clearHistory, removeTitleProgress, useHistory, useWatchlist } from "@/lib/library";
import { yearOf } from "@/lib/utils";
import type { ProgressEntry } from "@/lib/library";

/** Compact relative stamp — "Just now", "3h ago", "Yesterday", "Oct 12, 2026". */
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
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
    <li className="group relative flex items-center gap-3 rounded-xl p-2 pr-3 transition hover:bg-white/[0.04] sm:gap-4">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <div className="relative aspect-video w-[132px] shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-white/[0.08] sm:w-[168px]">
          <PosterImage
            src={media.backdropUrl || media.posterUrl}
            title={media.title}
            type={media.type}
            variant="backdrop"
            className="h-full w-full object-cover"
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
              : [yearOf(media.releaseDate), media.type === "tv" ? "Series" : "Film"]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
          <p className="mt-1.5 text-[11px]">
            {entry.completed ? (
              <span className="font-semibold uppercase tracking-wide text-accent/90">Finished</span>
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
          <CloseIcon size={14} />
        </button>
      </div>
    </li>
  );
}

function HistoryList() {
  const history = useHistory();
  // One row per TITLE — the most recent activity represents the show (same
  // rule as Continue Watching). Progress itself stays per-episode in storage,
  // so resuming an older episode keeps its saved position.
  const byTitle: ProgressEntry[] = [];
  const seen = new Map<string, ProgressEntry>();
  for (const entry of history) {
    const prev = seen.get(entry.media.id);
    if (!prev) {
      seen.set(entry.media.id, entry);
      byTitle.push(entry);
    } else if (entry.updatedAt > prev.updatedAt) {
      byTitle[byTitle.indexOf(prev)] = entry;
    }
  }
  if (!byTitle.length) return null;

  return (
    // The footer and the account menu both link to /my-list#history.
    <section id="history" className="mt-12 scroll-mt-24">
      <div className="nm-glass rounded-2xl p-4 md:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              History
            </p>
            <h2 className="mt-1 font-display text-2xl tracking-tight text-foreground md:text-3xl">
              Watch History
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="nm-inset rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent/90">
              {byTitle.length} {byTitle.length === 1 ? "Title" : "Titles"}
            </span>
            <button
              type="button"
              onClick={clearHistory}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted transition hover:text-danger"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Clear all
            </button>
          </div>
        </div>
        <ul className="flex flex-col gap-1">
          {byTitle.map((entry) => (
            <HistoryRow key={entry.key} entry={entry} />
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function MyListPage() {
  const watchlist = useWatchlist();

  return (
    <div className="container-rh py-8">
      <p className="eyebrow">Your Library</p>
      <h1 className="mt-1 font-display text-4xl uppercase leading-none tracking-wide sm:text-5xl">
        My List
      </h1>

      {watchlist.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-surface/40 px-6 py-16 text-center">
          <p className="text-lg font-semibold text-text">Your list is empty</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Tap the <span className="text-accent">＋</span> on any title to save it here and pick up
            where you left off across sessions.
          </p>
          <Link href="/" className="btn-primary mt-6">
            Browse titles
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <MediaGrid items={watchlist} />
        </div>
      )}

      <HistoryList />
    </div>
  );
}
