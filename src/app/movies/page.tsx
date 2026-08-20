import type { Metadata } from "next";
import BrowseView, { type BrowseSearchParams } from "@/components/browse/BrowseView";

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
