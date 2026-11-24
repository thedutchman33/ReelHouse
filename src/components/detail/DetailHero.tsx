"use client";

import { useEffect, useRef, useState } from "react";
import PosterImage from "@/components/media/PosterImage";
import TrackButton from "@/components/media/TrackButton";
import WatchlistButton from "@/components/media/WatchlistButton";
import PlayButton from "@/components/detail/PlayButton";
import ReleaseNotice from "@/components/detail/ReleaseNotice";
import TrailerLightbox from "@/components/playback/TrailerLightbox";
import ReviewButton from "@/components/reviews/ReviewButton";
import { StarIcon } from "@/components/player/icons";
import { moctaleContentUrl } from "@/lib/moctale";
import type { ReleaseNotice as ReleaseNoticeModel } from "@/lib/release-notice";
import { formatRating, formatRuntime, yearOf } from "@/lib/utils";
import type { Media, MediaSummary } from "@/types";

// Detail hero, set in the same language as the homepage hero: official title
// logo artwork over the backdrop (Bebas fallback), ★ · year · certification
// chip · runtime meta row, and genre pills. The poster stays left of the copy.
export default function DetailHero({
  media,
  bannerUrl,
  releaseNotice,
}: {
  media: Media;
  /** Moctale's own landscape hero banner, when the title has a Moctale page. */
  bannerUrl?: string;
  /** Upcoming theatrical/series event, or null when nothing is scheduled. */
  releaseNotice?: ReleaseNoticeModel | null;
}) {
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
    resolvedTmdbId: media.resolvedTmdbId,
  };

  // The trailer play circle sits over a real still, never an empty generated
  // placeholder. TMDB's backdrop is the dependable hero image. If it is absent
  // or fails, use the trailer's own YouTube stills, then Moctale's banner as a
  // final real-image fallback. Moctale's CDN marks its banner
  // `Cross-Origin-Resource-Policy: same-origin` and frequently rejects the
  // proxy, so it cannot be the first source anymore.
  const [trailerOpen, setTrailerOpen] = useState(false);
  const trailerTriggerRef = useRef<HTMLButtonElement>(null);

  const trailerOptions =
    media.trailerVideos && media.trailerVideos.length > 0
      ? media.trailerVideos
      : media.trailerKey
        ? [
            {
              key: media.trailerKey,
              name: media.trailerName ?? "Official Trailer",
            },
          ]
        : [];
  const trailer = trailerOptions[0];

  const heroSources = [
    media.backdropUrl,
    trailer
      ? `https://i.ytimg.com/vi/${trailer.key}/maxresdefault.jpg`
      : undefined,
    trailer ? `https://i.ytimg.com/vi/${trailer.key}/hqdefault.jpg` : undefined,
    bannerUrl
      ? `/api/moctale-image?src=${encodeURIComponent(bannerUrl)}`
      : undefined,
  ].filter((src): src is string => Boolean(src));
  const [heroSourceIndex, setHeroSourceIndex] = useState(0);
  const heroSrc = heroSources[heroSourceIndex];

  // A different title starts again from its best image.
  useEffect(() => {
    setHeroSourceIndex(0);
  }, [media.id, bannerUrl, trailer?.key]);

  const rating = formatRating(media.rating);
  const year = yearOf(media.releaseDate);
  const runtime = formatRuntime(media.runtime);
  const seasonCount = media.seasons?.length;
  // Anime is one continuous episode run — "1 Season" would read wrong, the
  // episode total is the honest meta.
  const animeEpisodes = media.seasons?.[0]?.episodeCount;
  const metaLeft = [
    runtime,
    media.type === "anime"
      ? animeEpisodes
        ? `${animeEpisodes} Episodes`
        : null
      : seasonCount
        ? `${seasonCount} Season${seasonCount > 1 ? "s" : ""}`
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // Cancels the layout's navbar offset so the backdrop runs under the floating
    // bar instead of leaving a blank band above it (same trick as the home
    // hero). The backdrop and the copy padding grow by the bar's height, so
    // nothing inside the page actually moves.
    <section className="relative -mt-[var(--rh-nav-h)]">
      <div className="absolute inset-x-0 top-0 h-[calc(68svh_+_var(--rh-nav-h))] min-h-[calc(460px_+_var(--rh-nav-h))] overflow-hidden">
        <PosterImage
          src={heroSrc}
          title={media.title}
          type={media.type}
          variant="backdrop"
          priority
          sizes="100vw"
          // Biased above centre so a wide crop keeps the subject in frame.
          className="h-full w-full object-cover object-[50%_28%]"
          onError={() => setHeroSourceIndex((index) => index + 1)}
        />
        {/* Same scrim stack as the homepage hero: vertical fade into the page
            plus a left-side wash under the copy. */}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/40 to-transparent" />
        {trailer && (
          <button
            ref={trailerTriggerRef}
            type="button"
            onClick={() => setTrailerOpen(true)}
            aria-label="Play Official Trailer"
            aria-haspopup="dialog"
            className="group absolute left-1/2 top-[48%] z-10 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/20 bg-black/40 text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-[2px] transition hover:scale-105 hover:border-white/35 hover:bg-black/60 sm:top-[59%]"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="ml-0.5 sm:h-6 sm:w-6"
            >
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
          </button>
        )}
      </div>

      {releaseNotice && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--rh-nav-h)+1rem)] z-20">
          <div className="container-rh flex justify-end">
            <ReleaseNotice notice={releaseNotice} />
          </div>
        </div>
      )}

      <div className="container-rh relative pb-8 pt-[calc(30svh_+_var(--rh-nav-h))] sm:pt-[calc(30svh_+_var(--rh-nav-h))]">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          {/* Fixed 2:3 frame: a poster whose real ratio differs is trimmed evenly
              on both edges instead of losing its top. */}
          <div className="poster-frame w-32 shrink-0 sm:w-48 lg:w-56">
            <PosterImage
              src={media.posterUrl}
              title={media.title}
              type={media.type}
              className="frame-img"
              // .poster-frame w-32 / sm:w-48 / lg:w-56 — a real poster, so it
              // gets the 500/780 rungs rather than the 148px rail default.
              sizes="(min-width: 1024px) 224px, (min-width: 640px) 192px, 128px"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="eyebrow mb-3">{media.type === "tv" ? "Series" : media.type === "anime" ? "Anime" : "Film"}</p>

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
            {/* Clamped: AniList descriptions (and some TMDB ones) run long
                enough to push the actions below the fold. */}
            <p className="mt-3 line-clamp-4 max-w-2xl text-sm leading-relaxed text-text/85 sm:text-base">
              {media.overview}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <PlayButton media={summary} />
              <TrackButton item={summary} variant="hero" surface="detail" />
              <WatchlistButton item={summary} variant="hero" />
              <ReviewButton
                href={moctaleContentUrl(media)}
                title={media.title}
              />
            </div>
          </div>
        </div>
      </div>

      {trailer && (
        <TrailerLightbox
          open={trailerOpen}
          onClose={() => setTrailerOpen(false)}
          trailerKey={trailer.key}
          trailerName={trailer.name}
          trailers={trailerOptions}
          returnFocusTo={trailerTriggerRef}
        />
      )}
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
    <div className="relative mb-2">
      <h1 className="sr-only">{title}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title}
        onError={() => setFailed(true)}
        className="block h-auto max-h-14 w-auto max-w-[220px] object-contain object-left drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] sm:max-h-16 sm:max-w-[290px] lg:max-h-[72px] lg:max-w-[360px]"
        draggable={false}
      />
    </div>
  );
}

