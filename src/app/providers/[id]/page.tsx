import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import MediaGrid from "@/components/media/MediaGrid";
import ProviderCatalogSearch from "@/components/browse/ProviderCatalogSearch";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/player/icons";
import { dedupeByFamily, familyFor, sortProviders } from "@/lib/provider-logos";
import { getProviderName, getProviderTitles, getWatchProviders, providerRegion } from "@/lib/tmdb";

// ISR: TMDB data moves on TMDB's clock — revalidate in the background,
// serve the cached page from the CDN edge (the reference's 25ms TTFB).
export const revalidate = 3600;

type SearchParams = { [key: string]: string | string[] | undefined };

function num(v: string | string[] | undefined): number {
  return Number(Array.isArray(v) ? v[0] : v);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const provider = await getProviderName(Number(id));
  return { title: provider ? `${provider.name} Providers` : "Providers" };
}

// Provider-filtered catalog: real TMDB discover results restricted to one
// watch provider (US region). This is TMDB's own availability data — ReelHouse
// does not claim a title streams anywhere TMDB doesn't list it.
export default async function ProviderCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const providerId = Number(id);
  const page = Math.max(1, Number.isFinite(num(sp.page)) ? num(sp.page) : 1);
  // Page-level search within this provider's catalog (?q= commits via the
  // search field below; a query resets to page 1).
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  // Name lookup, catalog fetch and the provider list (used for the variant
  // redirect below) are independent TMDB chains — run them concurrently so a
  // cold ISR render doesn't serialize three round-trips. The provider list
  // dedupes with the one inside getProviderName via the per-request fetch cache.
  const [provider, items, allProviders] = await Promise.all([
    Number.isFinite(providerId) ? getProviderName(providerId) : null,
    Number.isFinite(providerId)
      ? getProviderTitles(providerId, page, "US", q || undefined)
      : Promise.resolve([]),
    getWatchProviders("US"),
  ]);
  if (!provider) notFound();

  // Variant deep links (old /providers/1825 "HBO Max Amazon Channel") resolve
  // to their brand's flagship page, so a reseller catalog is never presented
  // as the brand itself.
  const family = familyFor(provider.name);
  if (family) {
    const familyMembers = allProviders.filter((p) => familyFor(p.name) === family);
    const flagship = sortProviders(dedupeByFamily(familyMembers))[0];
    if (flagship && flagship.id !== providerId) redirect(`/providers/${flagship.id}`);
  }

  const hasNext = items.length >= 20;
  const pageHref = (p: number) =>
    q ? `/providers/${providerId}?page=${p}&q=${encodeURIComponent(q)}` : `/providers/${providerId}?page=${p}`;

  return (
    <div className="container-rh py-8">
      {provider ? (
        <>
          <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted">
            <Link href="/providers" className="transition hover:text-text">
              Providers
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-text/80">{provider.name}</span>
          </nav>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-surface p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={provider.logoUrl}
                alt={provider.name}
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
            </div>
            <div>
              <p className="eyebrow">Where to watch · {providerRegion(providerId)}</p>
              <h1 className="mt-1 font-display text-3xl uppercase tracking-wide sm:text-4xl">
                {provider.name}
              </h1>
            </div>
          </div>

          <ProviderCatalogSearch providerId={providerId} initialQuery={q} />

          <div className="mt-6">
            {q && items.length > 0 && (
              <p className="mb-4 text-sm text-muted">
                {items.length} result{items.length === 1 ? "" : "s"} matching “{q}” in {provider.name}
              </p>
            )}
            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/15 bg-surface/40 px-6 py-14 text-center text-sm text-muted">
                {q
                  ? `Nothing in ${provider.name}'s catalog matches “${q}”.`
                  : "No titles returned for this provider right now."}
              </p>
            ) : (
              <MediaGrid items={items} />
            )}
          </div>

          {(page > 1 || hasNext) && (
            <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="btn-ghost h-9 px-4">
                  <ChevronLeftIcon size={16} />
                  Previous
                </Link>
              ) : (
                <span className="btn-ghost h-9 cursor-not-allowed px-4 opacity-40" aria-disabled="true">
                  <ChevronLeftIcon size={16} />
                  Previous
                </span>
              )}
              <span className="text-sm text-muted">{page}</span>
              {hasNext ? (
                <Link href={pageHref(page + 1)} className="btn-ghost h-9 px-4">
                  Next
                  <ChevronRightIcon size={16} />
                </Link>
              ) : (
                <span className="btn-ghost h-9 cursor-not-allowed px-4 opacity-40" aria-disabled="true">
                  Next
                  <ChevronRightIcon size={16} />
                </span>
              )}
            </nav>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-white/15 bg-surface/40 px-6 py-16 text-center">
          <p className="text-lg font-semibold text-text">Provider not found</p>
          <Link href="/providers" className="btn-ghost mt-6">
            All providers
          </Link>
        </div>
      )}
    </div>
  );
}
