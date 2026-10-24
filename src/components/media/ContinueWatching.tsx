"use client";

import { useRef } from "react";
import Link from "next/link";
import PosterImage from "@/components/media/PosterImage";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlayIcon } from "@/components/player/icons";
import { clearHistory, removeProgress, useContinueWatching } from "@/lib/library";

export default function ContinueWatching() {
  const entries = useContinueWatching();
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
      <div className="mx-auto mb-3 flex w-full max-w-[1480px] items-center justify-between gap-4 px-5 sm:px-6 md:px-16">
        <h2 className="font-sans text-lg font-bold text-text sm:text-xl">Continue Watching</h2>
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
          const href = episode
            ? `${base}?s=${episode.seasonNumber}&e=${episode.episodeNumber}`
            : base;
          // 0 duration = started, but the surface has not reported a length yet.
          const pct =
            entry.duration > 0
              ? Math.min(100, Math.round((entry.position / entry.duration) * 100))
              : 0;

          return (
            <div
              key={entry.key}
              className="group relative w-[264px] shrink-0 md:w-[300px]"
            >
              <Link href={href} className="block overflow-hidden rounded-lg">
                <div className="still-frame !shadow-none !ring-0">
                  <PosterImage
                    src={media.backdropUrl || media.posterUrl}
                    title={media.title}
                    type={media.type}
                    variant="backdrop"
                    className="poster-img"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  {/* Episode badge (reference pattern): "S1 · E3" top-left. */}
                  {episode && (
                    <span className="absolute left-2.5 top-2.5 rounded-md bg-black/60 px-2 py-1 text-[11px] font-bold text-white ring-1 ring-inset ring-white/10 backdrop-blur">
                      S{episode.seasonNumber} · E{episode.episodeNumber}
                    </span>
                  )}
                  <div className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-ink">
                      <PlayIcon size={22} />
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="line-clamp-1 text-sm font-semibold text-white">{media.title}</p>
                    {episode && (
                      <p className="text-xs text-white/70">
                        S{episode.seasonNumber} · E{episode.episodeNumber} — {episode.title}
                      </p>
                    )}
                  </div>
                </div>
                <div className="h-1 w-full bg-black/60">
                  <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </Link>
              <button
                type="button"
                onClick={() => removeProgress(entry.key)}
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
