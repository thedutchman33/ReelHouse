import type { Metadata } from "next";
import TrailersView from "@/components/trailers/TrailersView";
import { getMoctaleTrailerFeed } from "@/lib/moctale-trailers-server";
import { getTrailerFeed } from "@/lib/tmdb";
import { parseTrailerKind, parseTrailerPage } from "@/lib/trailers";

// Trailer metadata changes on the catalogue's clock, not the visitor's.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Trailers",
  description:
    "Official movie and series trailers — playable inside the Reelhouse feed.",
};

export default async function TrailersPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string | string[];
    page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const kind = parseTrailerKind(params.type);
  const page = parseTrailerPage(params.page);
  // Moctale's Spaces feed is ordered by community post time. Prefer it so
  // Reelhouse follows the same running order; TMDB remains the fallback when
  // the Moctale session is unavailable.
  const feed =
    (await getMoctaleTrailerFeed(kind, page)) ??
    (await getTrailerFeed(kind, page));

  return (
    <div className="red-accent relative isolate min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_75%_-14%,rgba(225,29,42,0.1),transparent_68%)]" />
      </div>

      <div className="container-rh pb-16 pt-[calc(var(--rh-nav-h)+1.5rem)]">
        <header className="mx-auto w-full max-w-[610px]">
          <h1 className="font-display text-4xl font-black uppercase leading-none tracking-wide text-white sm:text-5xl">
            Trailers
          </h1>
        </header>

        <div className="mt-6">
          <TrailersView feed={feed} kind={kind} />
        </div>
      </div>
    </div>
  );
}
