"use client";

import { INDUSTRY_OPTIONS, type BrowseIndustry } from "@/lib/browse";

// Industry slide toggle (Movies / TV Shows header): a two-segment pill with a
// sliding emerald thumb. Now a client control — it flips the BrowseClient's
// filter state (no page navigation), so switching industries feels instant
// and every other filter is preserved.

export default function IndustryToggle({
  industry,
  onChange,
}: {
  industry: BrowseIndustry;
  onChange: (industry: BrowseIndustry) => void;
}) {
  const bollywood = industry === "bollywood";

  return (
    <div
      role="group"
      aria-label="Industry"
      className="relative flex h-10 w-full shrink-0 items-center rounded-xl border border-white/10 bg-white/[0.04] p-1 sm:w-[212px]"
    >
      {/* Sliding thumb — exactly one segment wide, glides to the active side. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out ${
          bollywood ? "translate-x-full" : "translate-x-0"
        }`}
      />
      {INDUSTRY_OPTIONS.map((opt) => {
        const active = industry === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`relative z-10 flex-1 cursor-pointer rounded-lg py-1.5 text-center text-[13px] font-semibold transition-colors duration-300 ${
              active ? "text-black" : "text-muted hover:text-text"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
