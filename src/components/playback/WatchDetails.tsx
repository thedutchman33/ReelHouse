"use client";

import { useState } from "react";
import PosterImage from "@/components/media/PosterImage";
import { formatRuntime } from "@/lib/utils";
import type { Media } from "@/types";

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-amber-300">
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

// Details card (reference anatomy, REA-verified): full-width glass card whose
// top carries a blurred backdrop wash; poster (124px, hidden on mobile) beside
// the display title, italic tagline, star·runtime·year meta row, genre pill
// chips, a line-clamped overview with Show more, and the CAST circle rail.
export default function WatchDetails({ detail, seasonInfo }: { detail: Media; seasonInfo?: string }) {
  const [expanded, setExpanded] = useState(false);
  const year = detail.releaseDate?.slice(0, 4);
  const runtime = formatRuntime(detail.runtime);

  return (
    <div id="movie-details" className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-surface/80 backdrop-blur-xl">
      {/* Blurred backdrop wash across the card top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.55) 42%, rgba(0, 0, 0, 0) 100%)",
          WebkitMaskImage:
            "linear-gradient(rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.55) 42%, rgba(0, 0, 0, 0) 100%)",
        }}
      >
        <PosterImage
          src={detail.backdropUrl}
          title={detail.title}
          type={detail.type}
          variant="backdrop"
          className="h-full w-full scale-110 object-cover opacity-45 blur-[16px] !absolute !inset-0"
        />
      </div>

      {/* Poster + headline */}
      <div className="relative flex gap-4 px-4 pt-5 sm:gap-5 md:px-6">
        {detail.posterUrl && (
          <PosterImage
            src={detail.posterUrl}
            title={detail.title}
            type={detail.type}
            className="hidden w-24 shrink-0 self-start rounded-xl object-cover shadow-[0_14px_34px_rgba(0,0,0,0.62)] ring-1 ring-white/10 sm:block md:w-[124px]"
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl leading-[1.02] tracking-tight text-foreground md:text-4xl">
            {detail.title}
          </h1>
          {detail.tagline && (
            <p className="mt-2 text-sm italic text-muted-foreground/90 md:text-[15px]">
              &ldquo;{detail.tagline}&rdquo;
            </p>
          )}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted-foreground">
            {typeof detail.rating === "number" && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <StarIcon />
                <span className="tabular-nums">{detail.rating.toFixed(1)}</span>
              </span>
            )}
            {typeof detail.rating === "number" && <span className="text-foreground/25">·</span>}
            {runtime && (
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon />
                {runtime}
              </span>
            )}
            {runtime && <span className="text-foreground/25">·</span>}
            {year && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarIcon />
                {year}
              </span>
            )}
            {seasonInfo && (
              <>
                <span className="text-foreground/25">·</span>
                <span>{seasonInfo}</span>
              </>
            )}
          </div>
          {detail.genres.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {detail.genres.slice(0, 4).map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-foreground/10 px-2.5 py-1 text-[11px] font-medium text-foreground/70"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overview + cast */}
      <div className="px-4 pb-1 md:px-6">
        <p
          className={`mt-4 text-[15px] leading-[1.7] text-foreground/80 ${
            expanded ? "" : "line-clamp-3"
          }`}
        >
          {detail.overview}
        </p>
        {detail.overview.length > 180 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-sm font-semibold text-foreground/70 transition-colors hover:text-foreground"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}

        {detail.cast && detail.cast.length > 0 && (
          <div className="mt-5 pb-4">
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/60">
              Cast
            </h3>
            <div className="-mx-1 -mt-2 flex gap-4 overflow-x-auto px-1 pb-2 pt-2 no-scrollbar">
              {detail.cast.map((c) => (
                <div key={c.id} className="group w-20 shrink-0 rounded-lg text-center">
                  {c.profileUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.profileUrl}
                      alt={c.name}
                      loading="lazy"
                      className="mx-auto mb-2 h-16 w-16 rounded-full object-cover ring-1 ring-white/10 transition-shadow group-hover:ring-2 group-hover:ring-accent/70"
                      draggable={false}
                    />
                  ) : (
                    <span className="mx-auto mb-2 grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-muted ring-1 ring-white/10">
                      {c.name
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                  )}
                  <p className="truncate text-xs font-medium text-foreground">{c.name}</p>
                  {c.character && (
                    <p className="truncate text-[11px] text-muted-foreground">{c.character}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
