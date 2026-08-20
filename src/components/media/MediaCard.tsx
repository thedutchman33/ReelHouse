"use client";

import Link from "next/link";
import PosterImage from "./PosterImage";
import WatchlistButton from "./WatchlistButton";
import { formatRating, yearOf } from "@/lib/utils";
import type { MediaSummary } from "@/types";

// Poster card used by every row and grid.
//
// The artwork sits in a fixed 2:3 frame (.poster-frame) with the image absolutely
// positioned and centered (.frame-img), so a source image whose ratio is slightly
// off is trimmed evenly on both edges instead of losing its top — and every card
// in a row or grid is exactly the same shape regardless of what came back.
//
// Title and year live BELOW the poster, always visible: a hover-only caption is
// invisible on touch devices.
export default function MediaCard({ item }: { item: MediaSummary }) {
  const href = `/${item.type}/${item.tmdbId}`;
  const rating = formatRating(item.rating);
  const year = yearOf(item.releaseDate);

  return (
    <div className="group relative w-full">
      <Link href={href} className="block transition duration-300 group-hover:-translate-y-1">
        <div className="poster-frame rounded-xl border border-border shadow-card transition duration-300 group-hover:border-accent/50 group-hover:shadow-glow">
          <PosterImage
            src={item.posterUrl}
            title={item.title}
            type={item.type}
            className="frame-img transition duration-500 group-hover:scale-[1.04]"
          />

          <span className="absolute left-2 top-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 backdrop-blur">
            {item.type === "tv" ? "Series" : "Film"}
          </span>
          {rating && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-bold text-accent backdrop-blur transition group-hover:opacity-0">
              ★ {rating}
            </span>
          )}
        </div>

        <div className="mt-2 px-0.5">
          <h3 className="truncate font-sans text-[13px] font-semibold leading-snug tracking-normal text-text transition group-hover:text-accent">
            {item.title}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {[year, item.genres[0]].filter(Boolean).join(" · ")}
          </p>
        </div>
      </Link>

      {/* Quick add — occupies the top-right corner on hover (rating fades out).
          Inert while hidden, so on touch it cannot intercept taps meant for the
          title; the title page's own Add to My List covers that case. */}
      <div className="hover-reveal absolute right-2 top-2 z-10">
        <WatchlistButton item={item} variant="icon" />
      </div>
    </div>
  );
}
