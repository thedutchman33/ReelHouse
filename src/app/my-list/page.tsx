"use client";

import Link from "next/link";
import MediaGrid from "@/components/media/MediaGrid";
import PosterImage from "@/components/media/PosterImage";
import { clearHistory, removeProgress, useHistory, useWatchlist } from "@/lib/library";

function HistoryList() {
  const history = useHistory();
  if (!history.length) return null;

  return (
    // The footer and the account menu both link to /my-list#history.
    <section id="history" className="mt-12 scroll-mt-24">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Watch History</h2>
        <button type="button" onClick={clearHistory} className="text-sm text-muted hover:text-danger">
          Clear all
        </button>
      </div>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
        {history.map((entry) => {
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
            <li key={entry.key} className="flex items-center gap-4 bg-surface/40 p-3">
              <Link href={href} className="flex min-w-0 flex-1 items-center gap-4">
                <div className="still-frame w-28 shrink-0 rounded-lg border border-border">
                  <PosterImage
                    src={media.backdropUrl || media.posterUrl}
                    title={media.title}
                    type={media.type}
                    variant="backdrop"
                    className="frame-img"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{media.title}</p>
                  {episode && (
                    <p className="truncate text-xs text-muted">
                      S{episode.seasonNumber} · E{episode.episodeNumber} — {episode.title}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted">
                    {entry.completed
                      ? "Finished"
                      : entry.duration > 0
                        ? `${pct}% watched`
                        : "Started"}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => removeProgress(entry.key)}
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:text-danger"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function MyListPage() {
  const watchlist = useWatchlist();

  return (
    <div className="container-rh py-8">
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">My List</h1>

      {watchlist.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
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
        <MediaGrid items={watchlist} />
      )}

      <HistoryList />
    </div>
  );
}
