"use client";

import { useState } from "react";
import { placeholderArt } from "@/lib/utils";
import type { MediaType } from "@/types";

// TMDB already serves every poster at fixed widths, so the browser can pick the
// one that matches the rail card instead of downloading the w500 master for a
// ~148-230px frame. Measured on the live catalog: w500 = 142-157KB,
// w342 = 60-81KB for the same artwork — roughly half the bytes per card.
//
// Only TMDB URLs are rewritten. AniList art, YouTube stills and the generated
// placeholder data-URIs keep their single src, so this can never point at a
// size that does not exist.
const TMDB_POSTER = /^https:\/\/image\.tmdb\.org\/t\/p\/w\d+(\/.+)$/;
// Matches .rail-item / .poster-frame / grid card widths in globals.css.
const POSTER_SIZES =
  "(min-width: 1280px) 230px, (min-width: 768px) 190px, (min-width: 640px) 165px, 145px";

function posterSrcSet(src: string): string | undefined {
  const path = TMDB_POSTER.exec(src)?.[1];
  if (!path) return undefined;
  return [342, 500, 780]
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
}: {
  src?: string;
  title: string;
  type?: MediaType;
  variant?: "poster" | "backdrop";
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  // Built only when it is actually needed. Every card and hero slide used to
  // serialise + encodeURIComponent a full SVG document on every render just to
  // discard it, which on the home page alone is ~160 placeholders nobody sees.
  const finalSrc = !src || failed ? placeholderArt({ title, type, variant }) : src;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={finalSrc}
      alt={title}
      onError={() => setFailed(true)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      // Only posters get a candidate set: they are the ones fetched by the
      // hundred into 148-230px frames. Backdrops/stills keep their single src.
      srcSet={src ? posterSrcSet(src) : undefined}
      sizes={variant === "poster" ? POSTER_SIZES : undefined}
      className={className}
      draggable={false}
    />
  );
}
