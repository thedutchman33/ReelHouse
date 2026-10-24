"use client";

import Link from "next/link";
import PosterImage from "./PosterImage";
import WatchlistButton from "./WatchlistButton";
import { PlayIcon } from "@/components/player/icons";
import { formatRating, yearOf } from "@/lib/utils";
import type { MediaSummary } from "@/types";

// Poster card used by every row and grid — reference anatomy.
//
// The artwork sits in a fixed 2:3 frame (.poster-frame, rounded, ringed,
// shadowed) with the image absolutely positioned and centered, so a source
// image whose ratio is slightly off is trimmed evenly on both edges — and
// every card in a row or grid is exactly the same shape regardless of what
// came back.
//
// On hover (pointer devices): the artwork zooms, a circular play button
// appears centered, and the title fades in over a bottom gradient. On touch
// devices the hover chrome is hidden and a small caption below the poster
// keeps every card identifiable.
export default function MediaCard({ item }: { item: MediaSummary }) {
  const href = `/${item.type}/${item.tmdbId}`;
  const rating = formatRating(item.rating);
  const year = yearOf(item.releaseDate);

  return (
    <div className="group relative w-full">
      <Link href={href} className="block focus-visible:outline-none">
        <div className="poster-frame">
          <PosterImage
            src={item.posterUrl}
            title={item.title}
            type={item.type}
            className="poster-img"
          />

          {/* Bottom gradient + centered title (hover-capable devices only —
              .poster-hover-title is forced visible on touch). */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-0 transition-opacity duration-300 [@media(hover:hover)]:group-hover:opacity-100">
            <div className="absolute inset-x-0 bottom-0 px-2 pb-3">
              <p className="poster-hover-title line-clamp-2 text-center text-sm font-semibold leading-snug text-white">
                {item.title}
              </p>
            </div>
          </div>

          {/* Centered play affordance, same media gate as the reference. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 scale-75 place-items-center rounded-full bg-accent text-accent-ink opacity-0 transition duration-300 [@media(hover:hover)]:group-hover:scale-100 [@media(hover:hover)]:group-hover:opacity-100"
          >
            <PlayIcon size={22} />
          </span>

          {rating && (
            <span className="badge-accent absolute right-2 top-2">
              ★ {rating}
            </span>
          )}
        </div>
      </Link>

      {/* Quick add — occupies the top-left corner (reference bookmark chip).
          Inert while hidden, so on touch it cannot intercept taps meant for the
          title; the title page's own Add to My List covers that case. */}
      <div className="hover-reveal absolute left-2 top-2 z-10">
        <WatchlistButton item={item} variant="icon" />
      </div>

      {/* Touch caption: on (hover: none) devices the hover title never shows,
          so identify the card here instead. Hidden entirely on hover-capable
          devices to match the reference's image-only cards. */}
      <div className="mt-2 px-0.5 hidden [@media(hover:none),(pointer:coarse)]:block">
        <h3 className="truncate font-sans text-[13px] font-semibold leading-snug text-text">
          {item.title}
        </h3>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {[year, item.genres[0]].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );
}
