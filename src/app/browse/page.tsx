import type { Metadata } from "next";
import BrowseView, { type BrowseSearchParams } from "@/components/browse/BrowseView";

// ISR: TMDB data moves on TMDB's clock — revalidate in the background,
// serve the cached page from the CDN edge (the reference's 25ms TTFB).
export const revalidate = 300;

export const metadata: Metadata = { title: "Browse" };

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<BrowseSearchParams>;
}) {
  return (
    <BrowseView
      type="all"
      title="Browse"
      subtitle="Films and series together — filter by genre, year and sort order."
      searchParams={searchParams}
    />
  );
}
