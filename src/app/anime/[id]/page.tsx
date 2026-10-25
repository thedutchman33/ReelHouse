import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DetailContent from "@/components/detail/DetailContent";
import { getMediaDetail } from "@/lib/tmdb";

// Anime detail — AniList-backed (the id in the URL is an AniList id, not a
// TMDB one). Same DetailContent implementation as movie/tv detail pages; the
// recommendations it renders are also AniList entries, so the section
// context holds end to end.

// ISR: AniList detail (artwork, streaming-episode thumbnails, recs) refreshes
// hourly; the page serves from the CDN edge like movie/tv detail.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) return { title: "Not found" };
  const media = await getMediaDetail("anime", tmdbId);
  if (!media) return { title: "Not found" };
  return {
    title: media.title,
    description: media.overview?.slice(0, 160),
    openGraph: {
      title: media.title,
      description: media.overview?.slice(0, 200),
      images: media.backdropUrl ? [media.backdropUrl] : undefined,
    },
  };
}

export default async function AnimeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const anilistId = Number(id);
  if (!Number.isFinite(anilistId)) notFound();

  const media = await getMediaDetail("anime", anilistId);
  if (!media) notFound();

  return <DetailContent media={media} />;
}
