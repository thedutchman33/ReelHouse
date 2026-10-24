import Link from "next/link";
import { browseHref, INDUSTRY_OPTIONS, type BrowseFilters } from "@/lib/browse";

// Industry slide toggle (Movies / TV Shows header, viewer-marked top-right):
// a two-segment pill with a sliding emerald thumb. Both segments are plain
// links through the existing browse URL contract, so it needs no client JS —
// the thumb animates between segments with a plain CSS transform, and every
// other filter (genre/source/year/sort) is preserved because browseHref
// serializes the whole filter state.

export default function IndustryToggle({ filters }: { filters: BrowseFilters }) {
  const bollywood = filters.industry === "bollywood";

  return (
    <div
      role="group"
      aria-label="Industry"
      className="relative flex w-[220px] shrink-0 rounded-full border border-white/10 bg-surface/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      {/* Sliding thumb — exactly one segment wide, glides to the active side. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-accent transition-transform duration-300 ease-out ${
          bollywood ? "translate-x-full" : "translate-x-0"
        }`}
      />
      {INDUSTRY_OPTIONS.map((opt) => {
        const active = filters.industry === opt.value;
        return (
          <Link
            key={opt.value}
            href={browseHref(filters, { industry: opt.value, page: 1 })}
            aria-pressed={active}
            className={`relative z-10 flex-1 rounded-full py-1.5 text-center text-xs font-semibold transition-colors duration-300 ${
              active ? "text-accent-ink" : "text-muted hover:text-text"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
