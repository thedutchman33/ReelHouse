import type { Metadata } from "next";
import BrowseView from "@/components/browse/BrowseView";

// ISR: TMDB data moves on TMDB's clock — revalidate in the background,
// serve the cached page from the CDN edge (the reference's 25ms TTFB).
export const revalidate = 3600;

export const metadata: Metadata = { title: "TV Shows" };

export default function TvShowsPage() {
  return <BrowseView type="tv" title="TV Shows" subtitle="Series only — filter by genre, year and sort order." />;
}
