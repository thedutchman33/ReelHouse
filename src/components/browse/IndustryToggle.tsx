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
        const active = industry === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`relative z-10 flex-1 cursor-pointer rounded-full py-1.5 text-center text-xs font-semibold transition-colors duration-300 ${
              active ? "text-accent-ink" : "text-muted hover:text-text"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
