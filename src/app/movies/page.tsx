import type { Metadata } from "next";
import BrowseView, { type BrowseSearchParams } from "@/components/browse/BrowseView";

// ISR: TMDB data moves on TMDB's clock — revalidate in the background,
// serve the cached page from the CDN edge (the reference's 25ms TTFB).
export const revalidate = 300;

export const metadata: Metadata = { title: "Movies" };

export default async function MoviesPage({
  searchParams,
}: {
  searchParams: Promise<BrowseSearchParams>;
}) {
  return (
    <BrowseView
      type="movie"
      title="Movies"
      subtitle="Films only — filter by genre, year and sort order."
      searchParams={searchParams}
    />
  );
}
