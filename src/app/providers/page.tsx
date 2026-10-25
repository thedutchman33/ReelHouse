import type { Metadata } from "next";
import Link from "next/link";
import ProviderLogo from "@/components/providers/ProviderLogo";
import { dedupeByFamily, sortProviders, wordmarkFor } from "@/lib/provider-logos";
import { getWatchProviders } from "@/lib/tmdb";

// ISR: TMDB data moves on TMDB's clock — revalidate in the background,
// serve the cached page from the CDN edge (the reference's 25ms TTFB).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Providers",
  description: "Browse Reelhouse's catalog by watch provider.",
};

// Provider directory (the "View All" destination): the wordmark-backed set, as
// real logo cards linking to provider-filtered catalogs. Providers whose only
// artwork is a square app icon are left out — inverted they read as blank
// white squares, which looks broken.
export default async function ProvidersPage() {
  const all = await getWatchProviders("US");
  const providers = sortProviders(dedupeByFamily(all.filter((p) => wordmarkFor(p.name))));

  return (
    <div className="container-rh py-8">
      <p className="eyebrow">Browse by service</p>
      <h1 className="mt-1 font-display text-4xl uppercase leading-none tracking-wide sm:text-5xl">
        Providers
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted">
        Availability reflects TMDB watch-provider data for the US region. Cards
        open the titles that TMDB lists for each service.
      </p>

      {providers.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-white/15 bg-surface/40 px-6 py-16 text-center">
          <p className="text-lg font-semibold text-text">Provider data unavailable</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            The metadata source did not return watch-provider data for this
            region. Add a TMDB API key to enable it.
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-wrap gap-3">
          {providers.map((p) => (
            <Link
              key={p.id}
              href={`/providers/${p.id}`}
              aria-label={`Browse titles on ${p.name}`}
              className="group flex h-[80px] w-[164px] items-center justify-center overflow-hidden rounded-[14px] border border-white/[0.06] bg-surface transition-transform duration-200 hover:-translate-y-0.5"
            >
              <ProviderLogo
                name={p.name}
                fallbackSrc={p.logoUrl}
                className="h-full w-full px-4 py-3 sm:px-5 sm:py-4"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
