import type { Metadata } from "next";
import Link from "next/link";
import MediaGrid from "@/components/media/MediaGrid";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/player/icons";
import { getProviderName, getProviderTitles } from "@/lib/tmdb";

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

  const provider = Number.isFinite(providerId)
    ? await getProviderName(providerId)
    : null;
  const items = provider ? await getProviderTitles(providerId, page) : [];
  const hasNext = items.length >= 20;

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
              <p className="eyebrow">Where to watch · US</p>
              <h1 className="mt-1 font-display text-3xl uppercase tracking-wide sm:text-4xl">
                {provider.name}
              </h1>
            </div>
          </div>

          <div className="mt-8">
            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/15 bg-surface/40 px-6 py-14 text-center text-sm text-muted">
                No titles returned for this provider right now.
              </p>
            ) : (
              <MediaGrid items={items} />
            )}
          </div>

          {(page > 1 || hasNext) && (
            <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
              {page > 1 ? (
                <Link href={`/providers/${providerId}?page=${page - 1}`} className="btn-ghost h-9 px-4">
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
                <Link href={`/providers/${providerId}?page=${page + 1}`} className="btn-ghost h-9 px-4">
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
