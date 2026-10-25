"use client";

import { useEffect, useRef, useState } from "react";
import PosterImage from "@/components/media/PosterImage";
import RailSlider from "@/components/media/RailSlider";
import type { MediaSummary, Season } from "@/types";

// Episodes section (reference anatomy, REA-verified from /tv/84958/watch):
// "EPISODES" eyebrow + display "Season N" heading, a "Now playing" glass chip
// with the live episode, a season-selector chip grid, and a horizontal rail of
// episode cards (16:9 stills with E-badge, star rating, "Now Playing" overlay
// on the current episode, title/overview/air date below). Clicking a card
// plays that episode.

export default function WatchEpisodes({
  seasons,
  season,
  episode,
  onSelectEpisode,
  media,
  loadSeasonEpisodes,
}: {
  seasons: Season[];
  season: number;
  episode: number;
  onSelectEpisode: (season: number, episode: number) => void;
  media: MediaSummary;
  /** Loads (and caches in the container) one season's episodes on demand. */
  loadSeasonEpisodes: (seasonNumber: number) => Promise<
    import("@/types").Episode[]
  >;
}) {
  const [selectedSeason, setSelectedSeason] = useState(season);
  const railRef = useRef<HTMLDivElement>(null);
  const current = seasons.find((s) => s.seasonNumber === selectedSeason);
  // Seasons are metadata until their episodes load — pull the selected one.
  useEffect(() => {
    if (current && !(current.episodes ?? []).length) {
      void loadSeasonEpisodes(selectedSeason);
    }
  }, [selectedSeason, current, loadSeasonEpisodes]);
  const episodes = current?.episodes ?? [];
  const currentEp = episodes.find((e) => e.episodeNumber === episode);
  if (!current) return null;

  const nudge = (dir: number) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="mt-3 px-1" aria-label="Episodes">
      <div className="nm-glass rounded-2xl p-4 md:p-6">
        {/* Header + "Now playing" chip */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              Episodes
            </p>
            <h2 className="mt-1 font-display text-2xl tracking-tight text-foreground md:text-3xl">
              {current.name || `Season ${selectedSeason}`}
            </h2>
          </div>
          <div className="nm-inset flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold sm:rounded-lg sm:py-1.5">
            <span className="flex h-2 w-2 shrink-0 items-center justify-center">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent shadow-[0_0_6px] shadow-accent" />
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-accent/90">
              Now playing
            </span>
            <span className="text-foreground/40">·</span>
            <span className="min-w-0 truncate text-foreground/80">
              E{episode} — {currentEp?.title ?? ""}
            </span>
          </div>
        </div>

        {/* Season selector chips */}
        {seasons.length > 1 && (
          <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9">
            {seasons.map((s) => {
              const active = s.seasonNumber === selectedSeason;
              return (
                <button
                  key={s.seasonNumber}
                  type="button"
                  onClick={() => setSelectedSeason(s.seasonNumber)}
                  className={`nm-tab flex items-baseline justify-center gap-1.5 rounded-lg px-2 py-1.5 text-center transition ${
                    active
                      ? "nm-raise text-foreground ring-1 ring-accent/50"
                      : "nm-raise-sm text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">
                    Season
                  </span>
                  <span className="text-sm font-black tabular-nums">{s.seasonNumber}</span>
                  <span className="text-[9px] tabular-nums opacity-50">{s.episodeCount}ep</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Episode rail */}
        <div className="group/eprail relative">
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => nudge(-1)}
            className="nm-raise-sm absolute left-1 top-[30%] z-10 hidden h-10 w-10 items-center justify-center rounded-full text-foreground/80 shadow-lg transition-opacity hover:text-foreground lg:flex"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rotate-90">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => nudge(1)}
            className="nm-raise-sm absolute right-1 top-[30%] z-10 hidden h-10 w-10 items-center justify-center rounded-full text-foreground/80 shadow-lg transition-opacity hover:text-foreground lg:flex"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="-rotate-90">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <div ref={railRef} className="no-scrollbar -mx-1 -mt-3 flex gap-4 overflow-x-auto px-1 pb-3 pt-3">
            {episodes.length === 0 &&
              // Season episodes still loading — placeholder cards, same size.
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="w-[260px] shrink-0 sm:w-[300px]" aria-hidden="true">
                  <div className="aspect-video animate-pulse rounded-xl bg-muted/60" />
                  <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted/40" />
                  <div className="mt-1.5 h-3 w-full animate-pulse rounded bg-muted/30" />
                </div>
              ))}
            {episodes.map((ep) => {
              const isCurrent = ep.episodeNumber === episode && selectedSeason === season;
              return (
                <div key={ep.episodeNumber} className="relative w-[260px] shrink-0 sm:w-[300px]">
                  <button
                    type="button"
                    onClick={() => onSelectEpisode(selectedSeason, ep.episodeNumber)}
                    className="group w-full text-left"
                  >
                    <div
                      className={`relative aspect-video overflow-hidden rounded-xl bg-muted ring-1 transition-transform duration-200 group-hover:-translate-y-1 ${
                        isCurrent ? "ring-2 ring-accent" : "ring-white/[0.08]"
                      }`}
                    >
                      {ep.stillUrl || media.type !== "anime" ? (
                        <PosterImage
                          src={ep.stillUrl || media.backdropUrl}
                          title={ep.title}
                          type="tv"
                          variant="backdrop"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                        />
                      ) : (
                        /* Anime stub without a streaming still: the title's
                           own poster art (cover cropped to the frame). */
                        <PosterImage
                          src={media.posterUrl || media.backdropUrl}
                          title={ep.title}
                          type="anime"
                          variant="backdrop"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                        />
                      )}
                      <span className="absolute left-2 top-2 rounded-md bg-black/65 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
                        E{ep.episodeNumber}
                      </span>
                      {isCurrent && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-100 transition-opacity">
                          <span className="rounded-full bg-accent px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-accent-ink">
                            Now Playing
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="mt-2 px-0.5">
                      <p
                        className={`line-clamp-1 text-sm font-semibold group-hover:text-accent ${
                          isCurrent ? "text-accent" : "text-foreground"
                        }`}
                      >
                        E{ep.episodeNumber} · {ep.title}
                      </p>
                      {ep.overview && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground/85">
                          {ep.overview}
                        </p>
                      )}
                      {ep.airDate && (
                        <p className="mt-1 text-[11px] text-muted-foreground/60">
                          {new Date(ep.airDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
          {/* Reference scrubber: range slider under the rail (REA-verified
              wiring: 0–1000 <-> scrollLeft). */}
          <RailSlider railRef={railRef} />
        </div>
      </div>
    </section>
  );
}
