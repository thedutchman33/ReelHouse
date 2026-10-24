import type { Metadata } from "next";
import BrowseView from "@/components/browse/BrowseView";

// ISR: TMDB data moves on TMDB's clock — revalidate in the background,
// serve the cached page from the CDN edge (the reference's 25ms TTFB).
export const revalidate = 3600;

export const metadata: Metadata = { title: "Movies" };

export default function MoviesPage() {
  return <BrowseView type="movie" title="Movies" subtitle="Films only — filter by genre, year and sort order." />;
}
