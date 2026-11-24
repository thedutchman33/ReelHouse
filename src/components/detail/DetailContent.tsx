import DetailHero from "@/components/detail/DetailHero";
import CastRow from "@/components/detail/CastRow";
import EpisodeList from "@/components/detail/EpisodeList";
import MediaRow from "@/components/media/MediaRow";
import MoctaleInsights from "@/components/reviews/MoctaleInsights";
import type { MoctaleSnapshot } from "@/lib/moctale";
import { buildReleaseNotice } from "@/lib/release-notice";
import { detailTrailerOptions } from "@/lib/trailers";
import type { Media, MediaSummary } from "@/types";

export default function DetailContent({
  media,
  moctale = null,
  linkRoot,
}: {
  media: Media;
  /** Real public-page snapshot, or null when the title is not on Moctale. */
  moctale?: MoctaleSnapshot | null;
  /** Section-scoped link prefix for recommendations, e.g. "/anime". */
  linkRoot?: string;
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
  };
  const recs = media.recommendations ?? [];
  const releaseNotice = buildReleaseNotice(media, moctale?.events);

  // Moctale's video_list is curated and newest-first. When it is present it
  // replaces TMDB's trailer selection for the hero player and its options.
  const trailerVideos = detailTrailerOptions(media, moctale?.videos);
  const primaryTrailer = trailerVideos[0];
  const heroMedia: Media = primaryTrailer
    ? {
        ...media,
        trailerKey: primaryTrailer.key,
        trailerName: primaryTrailer.name,
        trailerVideos,
      }
    : media;

  return (
    <article className="pb-8">
      <DetailHero
        media={heroMedia}
        bannerUrl={moctale?.bannerUrl}
        releaseNotice={releaseNotice}
      />

      {/* The trailer lives in the hero (Moctale's placement), so community data
          follows it directly. The whole block is absent when the title has no
          matching public Moctale snapshot. */}
      <MoctaleInsights snapshot={moctale} />

      {media.type !== "movie" && media.seasons && media.seasons.length > 0 && (
        <EpisodeList media={summary} seasons={media.seasons} />
      )}

      <CastRow cast={media.cast} />

      {recs.length > 0 && (
        <MediaRow
          row={{ key: "recs", title: "More Like This", items: recs }}
          eyebrow="Recommended"
          linkRoot={linkRoot}
        />
      )}
    </article>
  );
}
