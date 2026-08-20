import PosterImage from "@/components/media/PosterImage";
import WatchlistButton from "@/components/media/WatchlistButton";
import PlayButton from "@/components/detail/PlayButton";
import { formatRating, formatRuntime, yearOf } from "@/lib/utils";
import type { Media, MediaSummary } from "@/types";

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
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-bg/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/80 to-transparent" />
      </div>

      <div className="container-rh relative pb-8 pt-[26svh] sm:pt-[30svh]">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          {/* Fixed 2:3 frame: a poster whose real ratio differs is trimmed evenly
              on both edges instead of losing its top. */}
          <div className="poster-frame w-32 shrink-0 rounded-xl border border-border shadow-card sm:w-48 lg:w-56">
            <PosterImage
              src={media.posterUrl}
              title={media.title}
              type={media.type}
              className="frame-img"
            />
          </div>

          <div className="flex-1">
            <span className="chip mb-3 border-accent/40 bg-accent/10 text-accent">
              {media.type === "tv" ? "Series" : "Film"}
            </span>
            <h1 className="text-balance text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">
              {media.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {rating && <span className="font-semibold text-accent">★ {rating}</span>}
              {year && <span>{year}</span>}
              {runtime && <span>{runtime}</span>}
              {seasonCount ? <span>{seasonCount} Season{seasonCount > 1 ? "s" : ""}</span> : null}
            </div>

            {media.genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {media.genres.map((g) => (
                  <span key={g} className="chip">{g}</span>
                ))}
              </div>
            )}

            {media.tagline && (
              <p className="mt-4 font-display text-lg italic text-text/80">“{media.tagline}”</p>
            )}
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text/85 sm:text-base">
              {media.overview}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <PlayButton media={summary} />
              <WatchlistButton item={summary} variant="full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
