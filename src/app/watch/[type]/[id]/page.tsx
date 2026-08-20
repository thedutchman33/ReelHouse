import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlaybackContainer from "@/components/playback/PlaybackContainer";
import { getMediaDetail } from "@/lib/tmdb";
import { getPlaybackPlan } from "@/lib/providers";
import type { MediaSummary, MediaType } from "@/types";

type SearchParams = { [key: string]: string | string[] | undefined };

function isMediaType(t: string): t is MediaType {
  return t === "movie" || t === "tv";
}

function num(v: string | string[] | undefined): number {
  return Number(Array.isArray(v) ? v[0] : v);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}): Promise<Metadata> {
  const { type, id } = await params;
  if (!isMediaType(type)) return { title: "Watch" };
  const media = await getMediaDetail(type, Number(id));
  return { title: media ? `Watch · ${media.title}` : "Watch" };
}

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { type, id } = await params;
  const sp = await searchParams;
  if (!isMediaType(type)) notFound();
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) notFound();

  const media = await getMediaDetail(type, tmdbId);
  if (!media) notFound();

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

  const seasons = type === "tv" ? media.seasons ?? [] : [];

  // Resolve the starting season/episode from ?s/?e (TV only), falling back to
  // the first available episode. The player takes over navigation from here.
  let seasonNum: number | undefined;
  let epNum: number | undefined;
  if (type === "tv") {
    seasonNum = num(sp.s);
    epNum = num(sp.e);
    if (!Number.isFinite(seasonNum) || !Number.isFinite(epNum)) {
      const first = seasons[0];
      seasonNum = first?.seasonNumber ?? 1;
      epNum = first?.episodes[0]?.episodeNumber ?? 1;
    }
    const seasonObj = seasons.find((s) => s.seasonNumber === seasonNum);
    const ep = seasonObj?.episodes.find((x) => x.episodeNumber === epNum) ?? seasonObj?.episodes[0];
    if (ep) {
      seasonNum = ep.seasonNumber;
      epNum = ep.episodeNumber;
    }
  }

  // Every provider that could serve this title, priority-ordered. The container
  // renders whichever one is selected; with no provider configured that is
  // Reelhouse's own built-in player surface, exactly as before.
  const plan = await getPlaybackPlan(type, tmdbId, seasonNum, epNum);

  const t = num(sp.t);
  const initialSeconds = Number.isFinite(t) && t > 0 ? t : undefined;

  return (
    <PlaybackContainer
      type={type}
      media={summary}
      overview={media.overview}
      runtime={media.runtime}
      seasons={seasons}
      plan={plan}
      initialSeasonNumber={seasonNum}
      initialEpisodeNumber={epNum}
      initialSeconds={initialSeconds}
      backHref={`/${type}/${tmdbId}`}
    />
  );
}
