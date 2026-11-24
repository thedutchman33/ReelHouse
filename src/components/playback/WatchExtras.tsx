"use client";

import { useRef, useState } from "react";
import MediaCard from "@/components/media/MediaCard";
import TrailerLightbox from "@/components/playback/TrailerLightbox";
import type { MediaSummary } from "@/types";

// Trailer + recommendations (reference anatomy, REA-verified): an "Official
// Trailer" block — display heading, subtitle, OFFICIAL badge and a 16:9 glass
// card whose accent play circle opens the trailer lightbox — followed by
// "If you liked {title}, you might also like…" over a poster grid.

export function TrailerSection({
  trailerKey,
  trailerName,
  embedded = false,
}: {
  trailerKey: string;
  trailerName?: string;
  /** Fit the block into an existing detail-page content column. */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <section
      className={embedded ? "detail-rh py-6" : "mb-10 mt-6 px-6 md:px-16"}
      aria-label="Official trailer"
    >
      <div className={embedded ? "w-full" : undefined}>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl tracking-wider text-foreground md:text-2xl">
              Official Trailer
            </h2>
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {trailerName ?? "Trailer"}
            </p>
          </div>
          <span className="rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
            Official
          </span>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-surface/80">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Play Official Trailer"
            aria-haspopup="dialog"
            className="group absolute inset-0 flex items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${trailerKey}/hqdefault.jpg`}
              srcSet={`https://i.ytimg.com/vi/${trailerKey}/hqdefault.jpg 480w, https://i.ytimg.com/vi/${trailerKey}/maxresdefault.jpg 1280w`}
              sizes="(min-width: 768px) 80vw, 100vw"
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              draggable={false}
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent transition-opacity group-hover:opacity-90" />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent text-zinc-950 transition-transform group-hover:scale-110 md:h-20 md:w-20">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            </span>
          </button>
        </div>
      </div>

      <TrailerLightbox
        open={open}
        onClose={() => setOpen(false)}
        trailerKey={trailerKey}
        trailerName={trailerName}
        returnFocusTo={triggerRef}
      />
    </section>
  );
}

export function RecommendationsSection({
  title,
  items,
}: {
  title: string;
  items: MediaSummary[];
}) {
  if (!items.length) return null;
  return (
    <section className="mb-8 mt-10" aria-label="Recommended titles">
      <div className="mb-5 px-6 md:px-16">
        <h2 className="font-display text-2xl tracking-tight text-foreground md:text-3xl">
          If you liked <em className="italic text-accent">{title}</em>, you
          might also like…
        </h2>
      </div>
      <div className="px-6 md:px-16">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(155px,1fr))] gap-4">
          {items.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
