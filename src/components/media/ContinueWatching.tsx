"use client";

import Link from "next/link";
import PosterImage from "@/components/media/PosterImage";
import { CloseIcon, PlayIcon } from "@/components/player/icons";
import { removeProgress, useContinueWatching } from "@/lib/library";

export default function ContinueWatching() {
  const entries = useContinueWatching();
  if (!entries.length) return null;

  return (
    // The footer links here (/#continue), so the anchor has to be real.
    <section id="continue" className="scroll-mt-24 py-4">
      <div className="container-rh mb-3">
        <h2 className="text-lg font-semibold sm:text-xl">Continue Watching</h2>
      </div>
      <div className="container-rh">
        <div className="row-scroll no-scrollbar">
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
              <div key={entry.key} className="group relative w-[240px] shrink-0 sm:w-[280px]">
                <Link
                  href={href}
                  className="block overflow-hidden rounded-xl border border-border bg-surface shadow-card transition group-hover:border-accent/50"
                >
                  <div className="still-frame">
                    <PosterImage
                      src={media.backdropUrl || media.posterUrl}
                      title={media.title}
                      type={media.type}
                      variant="backdrop"
                      className="frame-img transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
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
                  <div className="h-1 w-full bg-surface-2">
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
                  className="hover-reveal absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur hover:text-danger"
                >
                  <CloseIcon size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
