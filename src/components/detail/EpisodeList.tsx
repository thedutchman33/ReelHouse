"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PosterImage from "@/components/media/PosterImage";
import RailSlider from "@/components/media/RailSlider";
import { StarIcon } from "@/components/player/icons";
import { useProgressEntry } from "@/lib/library";
import type { Episode, MediaSummary, Season } from "@/types";

// Episodes section, set in the watch page's WatchEpisodes anatomy: an
// nm-glass panel with the "EPISODES" eyebrow + display "Season N" heading, a
// season chip grid (nm-raise / nm-raise-sm), and a horizontal rail of episode
// cards — 16:9 stills with an E-badge, star rating, saved-progress bar, and
// title/overview/air date. Cards deep-link into the watch page.

function EpisodeCard({
  media,
  episode,
}: {
  media: MediaSummary;
  episode: Episode;
}) {
  const entry = useProgressEntry(media.id, {
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    title: episode.title,
  });
  const pct =
    entry && entry.duration ? Math.min(100, Math.round((entry.position / entry.duration) * 100)) : 0;
  const href = `/watch/${media.type}/${media.tmdbId}?s=${episode.seasonNumber}&e=${episode.episodeNumber}`;

  return (
    <div className="relative w-[260px] shrink-0 sm:w-[300px]">
      <Link href={href} className="group block w-full">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-white/[0.08] transition-transform duration-200 group-hover:-translate-y-1">
          {episode.stillUrl || media.type !== "anime" ? (
              <PosterImage
                src={episode.stillUrl || media.backdropUrl}
                title={episode.title}
                type="tv"
                variant="backdrop"
                className="h-full w-full object-cover"
              />
            ) : (
              /* Anime stub without a streaming still: the title's own poster
                 art (cover cropped to the 16:9 frame). */
              <PosterImage
                src={media.posterUrl || media.backdropUrl}
                title={episode.title}
                type="anime"
                variant="backdrop"
                className="h-full w-full object-cover"
              />
            )}
          <span className="absolute left-2 top-2 rounded-md bg-black/65 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
            E{episode.episodeNumber}
          </span>
          {episode.rating ? (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-bold text-amber-400 backdrop-blur-sm">
              <StarIcon size={12} className="text-amber-500" /> {episode.rating.toFixed(1)}
            </span>
          ) : null}
          {pct > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <div className="mt-2 px-0.5">
          <p className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-accent">
            E{episode.episodeNumber} · {episode.title}
          </p>
          {episode.overview && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground/85">
              {episode.overview}
            </p>
          )}
          <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground/60">
            {episode.airDate &&
              new Date(episode.airDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            {entry?.completed && <span className="font-semibold uppercase tracking-wide text-accent/80">Watched</span>}
          </p>
        </div>
      </Link>
    </div>
  );
}

export default function EpisodeList({
  media,
  seasons,
}: {
  media: MediaSummary;
  seasons: Season[];
}) {
  const [selected, setSelected] = useState(seasons[0]?.seasonNumber ?? 1);
  const railRef = useRef<HTMLDivElement>(null);
  const season = seasons.find((s) => s.seasonNumber === selected) ?? seasons[0];

  // Seasons arrive as metadata; a season's episodes load on demand (cached
  // in component state; bundled-catalog seasons already inline them).
  const [episodes, setEpisodes] = useState<Episode[]>(
    () => season?.episodes ?? []
  );
  useEffect(() => {
    if (!season) return;
    if (season.episodes) {
      setEpisodes(season.episodes);
      return;
    }
    let alive = true;
    setEpisodes([]);
    (async () => {
      try {
        const res = await fetch(`/api/seasons/${media.tmdbId}/${season.seasonNumber}`);
        const data = (await res.json()) as { episodes?: Episode[] };
        if (alive) setEpisodes(data.episodes ?? []);
      } catch {
        if (alive) setEpisodes([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [season, media.tmdbId]);

  if (!season) return null;

  const nudge = (dir: number) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="container-rh py-6" aria-label="Episodes">
      <div className="nm-glass rounded-2xl p-4 md:p-6">
        {/* Header: eyebrow + display heading, episode count inset chip right. */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              Episodes
            </p>
            <h2 className="mt-1 font-display text-2xl tracking-tight text-foreground md:text-3xl">
              {season.name || "Season " + season.seasonNumber}
            </h2>
          </div>
          <div className="nm-inset flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold sm:rounded-lg sm:py-1.5">
            <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-accent/90">
              {season.episodeCount} Episodes
            </span>
          </div>
        </div>

        {/* Season selector chips */}
        {seasons.length > 1 && (
          <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9">
            {seasons.map((s) => {
              const active = s.seasonNumber === selected;
              return (
                <button
                  key={s.seasonNumber}
                  type="button"
                  onClick={() => setSelected(s.seasonNumber)}
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
            {episodes.map((ep) => (
              <EpisodeCard key={ep.id} media={media} episode={ep} />
            ))}
          </div>
          {/* Reference scrubber: range slider under the rail. */}
          <RailSlider railRef={railRef} />
        </div>
      </div>
    </section>
  );
}
