"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PosterImage from "@/components/media/PosterImage";
import WatchlistButton from "@/components/media/WatchlistButton";
import { PlayIcon } from "@/components/player/icons";
import { formatRating, yearOf } from "@/lib/utils";
import type { MediaSummary } from "@/types";

// Featured hero. Rotates through the trending titles; every title keeps its
// backdrop, rating, year, genres, synopsis and the Play / More Info / My List
// actions.
//
// Sizing uses `svh` so mobile browser chrome cannot make the hero overflow the
// first screen, and it is capped so the backdrop is not stretched on very tall
// desktop windows.
export default function Hero({ items }: { items: MediaSummary[] }) {
  // `prev` is the slide that is currently fading OUT. It has to stay mounted for
  // the duration of the crossfade, so it is tracked alongside `active` in one
  // state object — both always change together, and the updaters stay pure.
  const [{ active, prev }, setSlide] = useState<{ active: number; prev: number | null }>({
    active: 0,
    prev: null,
  });
  // Set once the viewer uses the dots. Jumping to a non-adjacent slide would
  // otherwise mount it at full opacity (a freshly mounted node has no previous
  // opacity to transition from, so it would pop in instead of fading), so from
  // the first manual interaction every slide is mounted exactly as before.
  const [allMounted, setAllMounted] = useState(false);
  const count = items.length;

  useEffect(() => {
    if (count <= 1) return;
    const id = window.setInterval(
      () => setSlide((s) => ({ active: (s.active + 1) % count, prev: s.active })),
      7000
    );
    return () => window.clearInterval(id);
  }, [count]);

  if (!count) return null;
  const current = items[active];
  const rating = formatRating(current.rating);
  const year = yearOf(current.releaseDate);

  // Only the outgoing, the current and the incoming slide need to exist. The
  // stack sits inside the viewport, so `loading="lazy"` defers nothing for the
  // others — they were five w1280 backdrops fetched on every home page load to
  // show one. The incoming slide is mounted a full rotation (7s) ahead of
  // becoming active, so it is decoded well before it is shown.
  const incoming = count > 1 ? (active + 1) % count : active;
  const isMounted = (i: number) =>
    allMounted || i === active || i === incoming || i === prev;

  return (
    <section className="relative">
      <div className="relative h-[68svh] min-h-[460px] w-full overflow-hidden sm:h-[64svh] sm:max-h-[780px]">
        {items.map((item, i) =>
          isMounted(i) ? (
            <div
              key={item.id}
              className={`absolute inset-0 transition-opacity duration-1000 ${i === active ? "opacity-100" : "opacity-0"}`}
              aria-hidden={i !== active}
            >
              <PosterImage
                src={item.backdropUrl}
                title={item.title}
                type={item.type}
                variant="backdrop"
                priority={i === 0}
                // A 16:9 backdrop in a much wider frame has to lose height
                // somewhere; biasing above centre keeps faces and titles in shot.
                className="h-full w-full object-cover object-[50%_32%]"
              />
            </div>
          ) : null
        )}

        {/* Legibility scrims: vertical fade into the page, plus a left-side wash
            under the copy. Kept subtle enough to leave the artwork readable. */}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/55 to-transparent sm:via-bg/30" />

        <div className="container-rh absolute inset-x-0 bottom-0">
          <div key={current.id} className="max-w-2xl animate-fade-up pb-12 sm:pb-16">
            <span className="chip mb-4 border-accent/40 bg-accent/10 text-accent">
              {current.type === "tv" ? "Featured Series" : "Featured Film"}
            </span>
            <h1 className="text-balance text-[2.1rem] font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              {current.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
              {rating && (
                <span className="font-semibold text-accent">★ {rating}</span>
              )}
              {year && <span className="text-text/70">{year}</span>}
              {current.genres.slice(0, 3).map((g) => (
                <span
                  key={g}
                  className="text-muted before:mr-2.5 before:text-border before:content-['•'] first:before:hidden"
                >
                  {g}
                </span>
              ))}
            </div>
            {current.overview && (
              <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-relaxed text-text/75 sm:text-[0.95rem]">
                {current.overview}
              </p>
            )}
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Link href={`/watch/${current.type}/${current.tmdbId}`} className="btn-primary">
                <PlayIcon size={18} /> Play
              </Link>
              <Link href={`/${current.type}/${current.tmdbId}`} className="btn-ghost">
                More Info
              </Link>
              <WatchlistButton item={current} variant="full" />
            </div>
          </div>
        </div>
      </div>

      {count > 1 && (
        // `relative z-20` is load-bearing, not decoration. The home page pulls
        // its whole content stack up over the hero's bottom edge with
        // `-mt-4 relative z-10` (app/page.tsx), which lays a full-width 16px
        // strip across exactly the band these dots occupy. Equal z-index is
        // broken by DOM order, so at z-10 the later wrapper won and swallowed
        // every tap — measured with elementFromPoint, the hit returned the row
        // section below. z-20 is the next step above that one sibling, not a
        // blanket escalation; nothing else in the hero changes layer, so the
        // rows still paint over the hero's bottom fade as designed.
        //
        // Each button is a 24px-tall touch target (WCAG 2.2 Target Size) with
        // the 6px bar centred inside it, so the bar looks exactly as before; the
        // margin is widened by the same 18px so nothing moves on the page.
        <div className="container-rh relative z-20 -mt-9 flex justify-center gap-2 sm:justify-end">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              // Pointer-down and focus both land before activation, so every
              // slide is mounted (and fading normally) by the time the jump
              // itself happens.
              onPointerDown={() => setAllMounted(true)}
              onFocus={() => setAllMounted(true)}
              onClick={() =>
                setSlide((s) => (s.active === i ? s : { active: i, prev: s.active }))
              }
              aria-label={`Show ${item.title}`}
              aria-current={i === active}
              className="group grid h-6 place-items-center px-1"
            >
              <span
                className={`h-1.5 rounded-full transition-all ${
                  i === active ? "w-7 bg-accent" : "w-3 bg-border group-hover:bg-muted"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
