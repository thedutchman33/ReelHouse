"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/player/icons";
import ProviderLogo from "@/components/providers/ProviderLogo";
import { dedupeByFamily, sortProviders, wordmarkFor } from "@/lib/provider-logos";
import type { WatchProvider } from "@/lib/tmdb";

// Provider logo carousel (reference pattern): PROVIDERS display heading + an
// accent "View All" action + circular scroll arrows, over dark rounded logo
// cards. Every card links to a real provider-filtered catalog page. Like the
// reference, one card per brand family (Netflix Kids collapses into Netflix,
// Apple TV Store into Apple TV…), ordered most-popular first, wordmark-backed
// families only — square-app-icon-only providers read as blank white squares
// once inverted, so they stay out of the rail.
export default function ProvidersRow({ providers: all }: { providers: WatchProvider[] }) {
  const providers = sortProviders(
    dedupeByFamily(all.filter((p) => wordmarkFor(p.name)))
  );
  const scroller = useRef<HTMLDivElement>(null);
  if (!providers.length) return null;

  const nudge = (dir: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section aria-label="Watch providers" className="mb-10">
      <div className="container-rh flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <h2 className="font-display text-xl uppercase tracking-[0.06em] text-text md:text-2xl">
            Providers
          </h2>
          <Link
            href="/providers"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-accent/90 transition hover:text-accent"
          >
            View All
          </Link>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Scroll providers left"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-surface/70 text-muted transition hover:text-text"
          >
            <ChevronLeftIcon size={18} />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Scroll providers right"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-surface/70 text-muted transition hover:text-text"
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </div>

      <div className="container-rh">
        <div
          ref={scroller}
          className="no-scrollbar -mx-1 mt-4 flex gap-3 overflow-x-auto px-1 py-1"
        >
          {providers.map((p) => (
            <Link
              key={p.id}
              href={`/providers/${p.id}`}
              aria-label={`Browse titles on ${p.name}`}
              className="group flex h-[80px] w-[164px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/[0.06] bg-surface transition-transform duration-200 hover:-translate-y-0.5"
            >
              {/* Reference anatomy (REA-verified): the logo fills the tile and
                  carries its own padding, so wordmarks span the full card. */}
              <ProviderLogo
                name={p.name}
                fallbackSrc={p.logoUrl}
                className="h-full w-full px-4 py-3 sm:px-5 sm:py-4"
              />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
