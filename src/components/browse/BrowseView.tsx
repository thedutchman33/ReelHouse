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
    <div className="relative isolate min-h-screen overflow-hidden">
      {/* The section's own mark sits behind the grid, the way the F1 and cricket
          pages carry theirs. /browse (type "all") is the generic catalog and
          stays plain. */}
      {type !== "all" && <CinemaBackdrop />}

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
    </div>
  );
}

/** Ambient cinema mark — a clapperboard, masked to a whisper. */
function CinemaBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(1200px_700px_at_72%_-8%,rgba(217,175,107,0.07),transparent_65%)]" />
      <div className="absolute -right-[6%] top-[3%] w-[min(800px,86vw)] max-w-none select-none text-[#d9af6b] opacity-[0.07] [mask-image:radial-gradient(62%_62%_at_50%_45%,#000_30%,transparent_100%)]">
        <svg
          viewBox="0 0 240 210"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-auto w-full"
        >
          <defs>
            <clipPath id="rh-cinema-clap-top">
              <path d="M40 74 192 46 198 68 46 96Z" />
            </clipPath>
            <clipPath id="rh-cinema-clap-lip">
              <path d="M46 96 198 68 202 86 50 114Z" />
            </clipPath>
          </defs>

          {/* Front slate board with its ruled panel. */}
          <rect x="46" y="102" width="148" height="100" rx="3" />
          <path
            d="M64 126h112M64 146h58M64 166h112M64 184h74M130 146v20M150 166v18"
            strokeWidth="4"
            opacity="0.9"
          />

          {/* Striped clapper stick and the slate's top lip. */}
          <path d="M40 74 192 46 198 68 46 96Z" />
          <g clipPath="url(#rh-cinema-clap-top)">
            <path
              d="M52 64l20 38M84 58l20 38M116 52l20 38M148 46l20 38M180 40l12 24"
              strokeWidth="12"
            />
          </g>
          <path d="M46 96 198 68 202 86 50 114Z" />
          <g clipPath="url(#rh-cinema-clap-lip)">
            <path
              d="M64 92l16 34M96 86l16 34M128 80l16 34M160 74l16 34"
              strokeWidth="10"
            />
          </g>

          {/* Hinge on the left of the clapper stick. */}
          <circle cx="56" cy="100" r="6" strokeWidth="4" />
        </svg>
      </div>
    </div>
  );
}
