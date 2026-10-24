"use client";

import { useEffect, useState } from "react";
import PosterImage from "@/components/media/PosterImage";
import WatchlistButton from "@/components/media/WatchlistButton";
import PlayButton from "@/components/detail/PlayButton";
import { StarIcon } from "@/components/player/icons";
import { formatRating, formatRuntime, yearOf } from "@/lib/utils";
import type { Media, MediaSummary } from "@/types";

// Detail hero, set in the same language as the homepage hero: official title
// logo artwork over the backdrop (Bebas fallback), ★ · year · certification
// chip · runtime meta row, and genre pills. The poster stays left of the copy.
export default function DetailHero({ media }: { media: Media }) {
  const summary: MediaSummary = {
    id: media.id,
    tmdbId: media.tmdbId,
    type: media.type,
    title: media.title,
    posterUrl: media.posterUrl,
    backdropUrl: media.backdropUrl,
    rating: media.rating,
    releaseDate: media.releaseDate,
    genres: media.genres,
    overview: media.overview,
  };

  const rating = formatRating(media.rating);
  const year = yearOf(media.releaseDate);
  const runtime = formatRuntime(media.runtime);
  const seasonCount = media.seasons?.length;
  const metaLeft = [runtime, seasonCount ? `${seasonCount} Season${seasonCount > 1 ? "s" : ""}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="relative">
      <div className="absolute inset-x-0 top-0 h-[58svh] min-h-[380px] overflow-hidden">
        <PosterImage
          src={media.backdropUrl}
          title={media.title}
          type={media.type}
          variant="backdrop"
          priority
          // Biased above centre so a wide crop keeps the subject in frame.
          className="h-full w-full object-cover object-[50%_28%]"
        />
        {/* Same scrim stack as the homepage hero: vertical fade into the page
            plus a left-side wash under the copy. */}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/40 to-transparent" />
      </div>

      <div className="container-rh relative pb-8 pt-[26svh] sm:pt-[30svh]">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          {/* Fixed 2:3 frame: a poster whose real ratio differs is trimmed evenly
              on both edges instead of losing its top. */}
          <div className="poster-frame w-32 shrink-0 sm:w-48 lg:w-56">
            <PosterImage
              src={media.posterUrl}
              title={media.title}
              type={media.type}
              className="frame-img"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="eyebrow mb-3">{media.type === "tv" ? "Series" : "Film"}</p>

            {media.logoUrl ? (
              <TitleLogo src={media.logoUrl} title={media.title} />
            ) : (
              <h1 className="text-balance font-display text-5xl uppercase leading-[0.95] tracking-wide text-white sm:text-6xl lg:text-7xl">
                {media.title}
              </h1>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              {rating && (
                <span className="flex items-center gap-1.5 font-semibold text-amber-400">
                  <StarIcon /> {rating}
                </span>
              )}
              {year && <span className="text-white/70">{year}</span>}
              {media.certification && (
                <span className="rounded-md border border-white/25 bg-black/30 px-2 py-0.5 text-xs font-semibold text-white/90">
                  {media.certification}
                </span>
              )}
              {metaLeft && <span className="text-text/70">{metaLeft}</span>}
            </div>

            {media.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {media.genres.slice(0, 4).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-text/85"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {media.tagline && (
              <p className="mt-4 text-base italic text-text/70">“{media.tagline}”</p>
            )}
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text/85 sm:text-base">
              {media.overview}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <PlayButton media={summary} />
              <WatchlistButton item={summary} variant="hero" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Same artwork treatment as the homepage hero, scaled down for the detail
// column; text fallback keeps the hero from ever showing a broken image.
function TitleLogo({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <h1 className="text-balance font-display text-5xl uppercase leading-[0.95] tracking-wide text-white sm:text-6xl lg:text-7xl">
        {title}
      </h1>
    );
  }

  return (
    <div className="relative mb-2 h-16 sm:h-20 lg:h-24">
      <h1 className="sr-only">{title}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title}
        onError={() => setFailed(true)}
        className="max-h-full w-auto max-w-[260px] object-contain object-left drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] sm:max-w-[340px] lg:max-w-[420px]"
        draggable={false}
      />
    </div>
  );
}

