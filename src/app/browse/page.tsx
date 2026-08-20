import type { Metadata } from "next";
import BrowseView, { type BrowseSearchParams } from "@/components/browse/BrowseView";

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
