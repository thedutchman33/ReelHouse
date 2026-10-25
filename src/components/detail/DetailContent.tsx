import DetailHero from "@/components/detail/DetailHero";
import CastRow from "@/components/detail/CastRow";
import EpisodeList from "@/components/detail/EpisodeList";
import MediaRow from "@/components/media/MediaRow";
import type { Media, MediaSummary } from "@/types";

export default function DetailContent({
  media,
  linkRoot,
}: {
  media: Media;
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

  return (
    <article className="pb-8">
      <DetailHero media={media} />

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
