import type { Metadata } from "next";
import BrowseView, { type BrowseSearchParams } from "@/components/browse/BrowseView";

export const metadata: Metadata = { title: "TV Shows" };

export default async function TvShowsPage({
  searchParams,
}: {
  searchParams: Promise<BrowseSearchParams>;
}) {
  return (
    <BrowseView
      type="tv"
      title="TV Shows"
      subtitle="Series only — filter by genre, year and sort order."
      searchParams={searchParams}
    />
  );
}
