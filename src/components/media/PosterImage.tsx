"use client";

import { useState } from "react";
import { placeholderArt } from "@/lib/utils";
import type { MediaType } from "@/types";

// TMDB serves every piece of artwork at fixed widths, so the browser can pick
// one that matches the box instead of downloading a master it has to shrink.
// The two crops need different ladders:
//
//   poster   148-230px rail/grid cards, so 342 is already ~1.7x on a 1x screen;
//            the detail hero poster (224px) and the hero title logo sit above
//            that and pass their own `sizes`.
//   backdrop full-bleed heroes are viewport-wide (1920 on a laptop), which is
//            why a poster-sized ladder is wrong for them: it capped the hero at
//            w780 and upscaled it 2.4x — soft on exactly the image the page is
//            built around.
//
// w1920 is not in TMDB's documented backdrop list (w300/w780/w1280/original)
// but the CDN answers it with a real 1920x1080 file at a fraction of `original`
// — measured on the current home hero: original 165/951/790KB vs w1920
// 165/258/111KB. Because that is an undocumented bet, a failing candidate falls
// back to the plain documented `src` before the placeholder (see below), so a
// missing size can never leave a hole where the artwork should be.
const TMDB = /^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)(\/.+)$/;

const POSTER_WIDTHS = [342, 500, 780];
const BACKDROP_WIDTHS = [300, 780, 1280, 1920];

// Matches .rail-item (148-196px) and the browse/my-list grids (up to ~230px).
const CARD_SIZES =
  "(min-width: 1280px) 230px, (min-width: 768px) 190px, (min-width: 640px) 165px, 145px";

function srcSetFor(src: string, widths: number[]): string | undefined {
  const path = TMDB.exec(src)?.[1];
  if (!path) return undefined;
  return widths
    .map((w) => `https://image.tmdb.org/t/p/w${w}${path} ${w}w`)
    .join(", ");
}

/**
 * Poster/backdrop <img> with a graceful fallback to branded placeholder art
 * (PRD edge case: "Missing poster/backdrop → use generated placeholder").
 * Plain <img> keeps V1 fully offline-capable; swap for next/image in Phase 2.
 */
export default function PosterImage({
  src,
  title,
  type,
  variant = "poster",
  className = "",
  priority = false,
  sizes,
}: {
  src?: string;
  title: string;
  type?: MediaType;
  variant?: "poster" | "backdrop";
  className?: string;
  priority?: boolean;
  /**
   * Rendered width of the box. Defaults to the rail-card ladder, which is
   * right for every poster in a row or grid; pass a real value anywhere the
   * artwork is bigger (hero art) or smaller (thumbnails).
   */
  sizes?: string;
}) {
  // Two failure steps, not one: a candidate from the responsive set can be
  // absent from TMDB, in which case dropping back to the plain `src` (always a
  // documented size) still renders the same artwork. Only if that fails too
  // does the placeholder take over. Keyed by src so a recycled component —
  // the hero carousel, a new search result — starts clean.
  const [plainSrc, setPlainSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const canResize = Boolean(src && TMDB.test(src));
  const showPlaceholder = !src || failedSrc === src;
  const responsive = canResize && !showPlaceholder && plainSrc !== src;

  const finalSrc = showPlaceholder
    ? placeholderArt({ title, type, variant })
    : src!;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={finalSrc}
      alt={title}
      onError={() => {
        if (!src) return;
        if (canResize && plainSrc !== src) setPlainSrc(src);
        else setFailedSrc(src);
      }}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      srcSet={
        responsive
          ? srcSetFor(
              src!,
              variant === "poster" ? POSTER_WIDTHS : BACKDROP_WIDTHS
            )
          : undefined
      }
      sizes={
        responsive
          ? sizes ?? (variant === "poster" ? CARD_SIZES : "100vw")
          : undefined
      }
      className={className}
      draggable={false}
    />
  );
}
