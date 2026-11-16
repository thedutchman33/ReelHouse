"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PosterImage from "@/components/media/PosterImage";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlayIcon } from "@/components/player/icons";
import {
  clearHistory,
  removeTitleProgress,
  useContinueWatching,
  type ProgressEntry,
} from "@/lib/library";
import type { NextEpisodeInfo } from "@/lib/next-episode";

// One next-episode request per completed episode. A rail can show up to 20
// finished titles, and a re-render must not re-ask for the same answer.
const nextEpisodeCache = new Map<string, Promise<NextEpisodeInfo | null>>();

function loadNextEpisode(entry: ProgressEntry): Promise<NextEpisodeInfo | null> {
  const { media, episode, completed } = entry;
  if (!completed || !episode) return Promise.resolve(null);
  if (media.type !== "tv" && media.type !== "anime") return Promise.resolve(null);

  const key = `${media.type}:${media.tmdbId}:${episode.seasonNumber}:${episode.episodeNumber}`;
  const cached = nextEpisodeCache.get(key);
  if (cached) return cached;

  const request = fetch(
    `/api/continue-watching/next?type=${media.type}&id=${media.tmdbId}` +
      `&season=${episode.seasonNumber}&episode=${episode.episodeNumber}`
  )
    .then(async (res) => {
      if (!res.ok) throw new Error(`next episode: ${res.status}`);
      const data = (await res.json()) as { next?: NextEpisodeInfo | null };
      return data.next ?? null;
    })
    .catch(() => {
      // A network/upstream failure is not an answer — let a later render retry.
      nextEpisodeCache.delete(key);
      return null;
    });

  nextEpisodeCache.set(key, request);
  return request;
}

/**
 * Fetches the "Up next" episode for every finished card. Keyed by title
 * because Continue Watching shows one card per title; the effect's `live` flag
 * drops answers from a rail that has since changed.
 */
function useNextEpisodes(
  entries: ProgressEntry[]
): Record<string, NextEpisodeInfo | null> {
  const [nextByMedia, setNextByMedia] = useState<
    Record<string, NextEpisodeInfo | null>
  >({});

  useEffect(() => {
    let live = true;
    for (const entry of entries) {
      if (!entry.completed || !entry.episode) continue;
      if (entry.media.type !== "tv" && entry.media.type !== "anime") continue;
      void loadNextEpisode(entry).then((next) => {
        if (!live) return;
        setNextByMedia((prev) =>
          prev[entry.media.id] === next ? prev : { ...prev, [entry.media.id]: next }
        );
      });
    }
    return () => {
      live = false;
    };
  }, [entries]);

  return nextByMedia;
}

export default function ContinueWatching() {
  const entries = useContinueWatching();
  const nextByMedia = useNextEpisodes(entries);
  const scroller = useRef<HTMLDivElement>(null);

  const nudge = (dir: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  if (!entries.length) return null;

  return (
    // The footer links here (/#continue), so the anchor has to be real.
    <section id="continue" className="group/row relative mb-8 scroll-mt-24">
      {/* Same editorial header as every other home row: uppercase eyebrow
          over the display-face heading; Clear all aligns to the heading. */}
      <div className="mx-auto mb-3 flex w-full max-w-[1480px] items-end justify-between gap-4 px-5 sm:px-6 md:px-16">
        <div>
          <p className="eyebrow mb-1">Pick up where you left off</p>
          <h2 className="font-display text-3xl uppercase tracking-wide text-text sm:text-4xl">
            Continue Watching
          </h2>
        </div>
        <button
          type="button"
          onClick={clearHistory}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted transition hover:text-danger"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Clear all
        </button>
      </div>
      <div ref={scroller} className="row-scroll px-5 sm:px-6 md:px-16">
        {entries.map((entry) => {
          const { media, episode } = entry;
          const base = `/watch/${media.type}/${media.tmdbId}`;
          // Finished episode + an aired next one = the card moves on to it.
          // If nothing has aired yet, the card stays on the finished episode.
          const upNext = entry.completed ? nextByMedia[media.id] ?? null : null;
          const target = upNext
            ? { seasonNumber: upNext.seasonNumber, episodeNumber: upNext.episodeNumber }
            : episode;
          const href = target
            ? `${base}?s=${target.seasonNumber}&e=${target.episodeNumber}`
            : base;
          // 0 duration = started, but the surface has not reported a length yet.
          // Finished entries carry no progress bar — there is no position worth
          // showing, and the reference hides it as soon as an episode is done.
          const pct = entry.completed
            ? null
            : entry.duration > 0
              ? Math.min(100, Math.round((entry.position / entry.duration) * 100))
              : 0;
          const episodeName = upNext?.title ?? episode?.title;

          return (
            <div
              key={media.id}
              className="group relative w-[264px] shrink-0 md:w-[300px]"
            >
              <Link href={href} prefetch={false} className="block overflow-hidden rounded-lg">
                <div className="still-frame !shadow-none !ring-0">
                  <PosterImage
                    src={upNext?.stillUrl || media.backdropUrl || media.posterUrl}
                    title={media.title}
                    type={media.type}
                    variant="backdrop"
                    className="poster-img"
                    sizes="(min-width: 768px) 300px, 264px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  {/* Episode badge (reference pattern): "S1 · E3" top-left,
                      accented and prefixed with "Up next" once the card has
                      advanced past the finished episode. */}
                  {target && (
                    <span
                      className={`absolute left-2.5 top-2.5 rounded-md px-2 py-1 text-[11px] font-bold ring-1 ring-inset backdrop-blur ${
                        upNext
                          ? "bg-accent text-accent-ink ring-transparent"
                          : "bg-black/60 text-white ring-white/10"
                      }`}
                    >
                      {upNext && "Up next · "}S{target.seasonNumber} · E{target.episodeNumber}
                    </span>
                  )}
                  <div className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-ink">
                      <PlayIcon size={22} />
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="line-clamp-1 text-sm font-semibold text-white">{media.title}</p>
                    {target && (
                      <p className="line-clamp-1 text-xs text-white/70">
                        S{target.seasonNumber} · E{target.episodeNumber} — {episodeName}
                      </p>
                    )}
                  </div>
                </div>
                {pct !== null && (
                  <div className="h-1 w-full bg-black/60">
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </Link>
              <button
                type="button"
                // History/Continue Watching show one row per title, so removing
                // the card must clear every episode of that title — removing
                // only the displayed key would resurface an older episode.
                onClick={() => removeTitleProgress(media.id)}
                aria-label={`Remove ${media.title} from Continue Watching`}
                // Inert while hidden: on touch this corner used to fire the
                // remove button instead of resuming the episode. My List
                // carries an always-visible Remove for every entry.
                className="hover-reveal absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md bg-black/50 text-white ring-1 ring-inset ring-white/10 backdrop-blur hover:text-danger"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Edge arrows — same rail pattern as MediaRow, revealed on hover. */}
      <button
        type="button"
        onClick={() => nudge(-1)}
        aria-label="Scroll Continue Watching left"
        className="hover-reveal absolute bottom-[32%] left-0 top-[32%] z-10 hidden w-9 place-items-center rounded-r-md border border-white/10 bg-bg/80 text-text backdrop-blur-sm transition hover:bg-bg sm:grid"
      >
        <ChevronLeftIcon size={20} />
      </button>
      <button
        type="button"
        onClick={() => nudge(1)}
        aria-label="Scroll Continue Watching right"
        className="hover-reveal absolute bottom-[32%] right-0 top-[32%] z-10 hidden w-9 place-items-center rounded-l-md border border-white/10 bg-bg/80 text-text backdrop-blur-sm transition hover:bg-bg sm:grid"
      >
        <ChevronRightIcon size={20} />
      </button>
    </section>
  );
}
