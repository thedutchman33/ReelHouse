import { Suspense } from "react";
import BrowseClient from "@/components/browse/BrowseClient";
import type { BrowseType } from "@/lib/browse";
import { getBrowseOptions, getWatchProviders } from "@/lib/tmdb";

// ---------------------------------------------------------------------------
// Shared browse screen — now a PRERENDERED SHELL.
//
// The page carries no user- or query-dependent server data: the genre/year
// options and provider list are static-ish (fetched once per revalidation at
// the edge), and the results grid is fetched client-side from /api/browse by
// BrowseClient. That is what makes /movies and /tv-shows CDN-fast like the
// reference: the HTML is served from the edge, filter picks are one small
// JSON fetch.
//
// /browse, /movies and /tv-shows are the same shell with a different content
// type pinned.
// ---------------------------------------------------------------------------

export type BrowseSearchParams = Record<string, string | string[] | undefined>;

export default async function BrowseView({
  type,
  title,
  subtitle,
}: {
  /** Pinned content type: "all" on /browse, "movie" on /movies, "tv" on /tv-shows. */
  type: BrowseType;
  title: string;
  subtitle: string;
}) {
  const options = getBrowseOptions(type);
  // Anime is AniList-backed — watch providers are a TMDB concept, so the
  // Source dropdown is simply not offered there.
  const providers =
    type === "anime"
      ? []
      : await getWatchProviders("US", type === "tv" ? "tv" : "movie");

  return (
    <div className="container-rh py-8">
      {/* useSearchParams inside the client component requires a Suspense
          boundary for the prerender — the shell itself renders immediately. */}
      <Suspense fallback={<div className="min-h-[60vh]" aria-hidden="true" />}>
        <BrowseClient
          type={type}
          title={title}
          subtitle={subtitle}
          genres={options.genres}
          years={options.years}
          providers={providers}
        />
      </Suspense>
    </div>
  );
}
