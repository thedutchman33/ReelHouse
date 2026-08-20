import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DetailContent from "@/components/detail/DetailContent";
import { getMediaDetail } from "@/lib/tmdb";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const media = await getMediaDetail("movie", Number(id));
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

export default async function MoviePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isFinite(tmdbId)) notFound();

  const media = await getMediaDetail("movie", tmdbId);
  if (!media) notFound();

  return <DetailContent media={media} />;
}
