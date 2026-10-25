import type { Metadata } from "next";
import BrowseView from "@/components/browse/BrowseView";

// ISR: the shell (genre/year options + provider list) refreshes hourly; the
// results grid is fetched client-side from /api/browse.
export const revalidate = 3600;

export const metadata: Metadata = { title: "Anime" };

export default function AnimePage() {
  return (
    <BrowseView
      type="anime"
      title="Anime"
      subtitle="Japanese animation — films and series together, filter by genre, year and sort order."
    />
  );
}
