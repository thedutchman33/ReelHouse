import type { Metadata } from "next";
import BrowseView from "@/components/browse/BrowseView";

// ISR: the shell (genre/year options + provider list) refreshes hourly; the
// results grid is fetched client-side from /api/browse.
export const revalidate = 3600;

export const metadata: Metadata = { title: "Browse" };

export default function BrowsePage() {
  return (
    <BrowseView
      type="all"
      title="Browse"
      subtitle="Films and series together — filter by type, genre, year and sort order."
    />
  );
}
