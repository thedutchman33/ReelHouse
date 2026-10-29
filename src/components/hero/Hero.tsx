"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PosterImage from "@/components/media/PosterImage";
import WatchlistButton from "@/components/media/WatchlistButton";
import { PlayIcon, StarIcon } from "@/components/player/icons";
import { useLiveWindows } from "@/components/live/use-live-windows";
import { windowIsLive, type LiveWindow } from "@/lib/live-windows";
import { formatRating, yearOf } from "@/lib/utils";
import type { MediaSummary } from "@/types";
// Featured hero (reference pattern). Rotates through the trending titles with a
// crossfade; copy sits in the lower-left over a legibility scrim, the title is
// set in the condensed display face, the primary CTA is a white "Watch Now"
// button, and slide indicators are dots in the lower-right with the active dot
// drawn as an elongated pill.
//
// Two extra slides are prepended while a section is live: the F1 session and the
// cricket match whose Watch Live buttons are unlocked. They use the same
// crossfade and dots, but carry their own broadcast artwork, title, details and
// a red Watch Live CTA. They disappear the moment those buttons lock again.
//
// Sizing uses `svh` so mobile browser chrome cannot make the hero overflow the
// first screen, and it is capped so the backdrop is not stretched on very tall
// desktop windows.
type Slide =
  | { key: string; kind: "media"; item: MediaSummary }
  | { key: string; kind: "live"; live: LiveWindow };

export default function Hero({ items }: { items: MediaSummary[] }) {
  const { feed, now } = useLiveWindows();

  // `now` stays 0 until the first client tick, so the server HTML never claims
  // something is live against a clock the browser disagrees with.
  const liveSlides = useMemo(() => {
    if (!now) return [];
    return [feed.f1, feed.cricket].filter(
      (entry): entry is LiveWindow => Boolean(entry) && windowIsLive(entry as LiveWindow, now)
    );
  }, [feed, now]);

  const slides: Slide[] = [
    ...liveSlides.map((live) => ({ key: `live-${live.kind}`, kind: "live" as const, live })),
    ...items.map((item) => ({ key: `media-${item.id}`, kind: "media" as const, item })),
  ];
  const liveKey = liveSlides.map((live) => live.kind).join("|");

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
  const count = slides.length;

  // A live poster takes over the hero as it appears, and the normal rotation
  // resumes when it locks again. Keyed on which sections are live, not on the
  // five-second clock, so this never fights the auto-advance.
  useEffect(() => {
    setSlide({ active: 0, prev: null });
  }, [liveKey]);

  useEffect(() => {
    if (count <= 1) return;
    const id = window.setInterval(
      () => setSlide((s) => ({ active: (s.active + 1) % count, prev: s.active })),
      7000
    );
    return () => window.clearInterval(id);
  }, [count]);

  if (!count) return null;
  // The list can shrink between a live poster disappearing and the reset effect
  // running; clamp instead of rendering a blank hero for a frame.
  const currentIndex = Math.min(active, count - 1);
  const current = slides[currentIndex];

  // Only the outgoing, the current and the incoming slide need to exist. The
  // stack sits inside the viewport, so `loading="lazy"` defers nothing for the
  // others — they were five w1280 backdrops fetched on every home page load to
  // show one. The incoming slide is mounted a full rotation (7s) ahead of
  // becoming active, so it is decoded well before it is shown.
  const incoming = count > 1 ? (currentIndex + 1) % count : currentIndex;
  const isMounted = (i: number) =>
    allMounted || i === currentIndex || i === incoming || i === prev;

  return (
    <section className="relative">
      <div className="relative h-[80svh] min-h-[600px] max-h-[880px] w-full overflow-hidden">
        {slides.map((slide, i) =>
          isMounted(i) ? (
            <div
              key={slide.key}
              className={`absolute inset-0 transition-opacity duration-1000 ${i === currentIndex ? "opacity-100" : "opacity-0"}`}
              aria-hidden={i !== currentIndex}
            >
              {slide.kind === "live" ? (
                <LiveBackdrop live={slide.live} />
              ) : (
                <PosterImage
                  src={slide.item.backdropUrl}
                  title={slide.item.title}
                  type={slide.item.type}
                  variant="backdrop"
                  priority={i === 0}
                  // A 16:9 backdrop in a much wider frame has to lose height
                  // somewhere; biasing above centre keeps faces and titles in shot.
                  className="h-full w-full object-cover object-[50%_32%]"
                />
              )}
            </div>
          ) : null
        )}

        {/* Legibility scrims: vertical fade into the page, plus a left-side wash
            under the copy. Kept subtle enough to leave the artwork readable. */}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/40 to-transparent sm:via-bg/20" />

        <div className="container-rh absolute inset-x-0 bottom-0">
          <div key={current.key} className="max-w-[42rem] animate-fade-up pb-12 sm:pb-14">
            {current.kind === "live" ? (
              <LiveCopy live={current.live} />
            ) : (
              <MediaCopy item={current.item} />
            )}
          </div>
        </div>

        {count > 1 && (
          // Slide indicators: small dots, active drawn as an elongated pill.
          // Each button keeps a 24px-tall touch target (WCAG 2.2 Target Size)
          // with the dot centred inside it.
          <div className="absolute bottom-6 right-6 z-20 flex items-center gap-2 md:bottom-8 md:right-16">
            {slides.map((slide, i) => (
              <button
                key={slide.key}
                type="button"
                // Pointer-down and focus both land before activation, so every
                // slide is mounted (and fading normally) by the time the jump
                // itself happens.
                onPointerDown={() => setAllMounted(true)}
                onFocus={() => setAllMounted(true)}
                onClick={() =>
                  setSlide((s) => (s.active === i ? s : { active: i, prev: s.active }))
                }
                aria-label={`Show ${
                  slide.kind === "live" ? slide.live.title : slide.item.title
                }`}
                aria-current={i === currentIndex}
                className="group grid h-6 place-items-center px-1"
              >
                <span
                  className={`rounded-full transition-all ${
                    i === currentIndex
                      ? "h-2 w-6 bg-white"
                      : "h-2 w-2 bg-white/40 group-hover:bg-white/70"
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------- media slide --------------------------------

function MediaCopy({ item }: { item: MediaSummary }) {
  const rating = formatRating(item.rating);
  const year = yearOf(item.releaseDate);
  const genres = item.genres.slice(0, 3).join(" · ");

  return (
    <>
      {/* Reference pattern: show the title's official logo artwork when
          TMDB has one; fall back to the text title otherwise. The h1
          stays (sr-only behind the img) for accessibility. */}
      {item.logoUrl ? (
        <TitleLogo src={item.logoUrl} title={item.title} />
      ) : (
        // Display size is capped so two-line titles never push the copy
        // block past the hero's top edge (overflow-hidden would clip it).
        <h1 className="text-balance font-display text-[2.6rem] uppercase leading-[0.95] tracking-wide text-white sm:text-6xl lg:text-7xl">
          {item.title}
        </h1>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        {rating && (
          <span className="flex items-center gap-1.5 font-semibold text-amber-400">
            <StarIcon /> {rating}
          </span>
        )}
        {year && <span className="text-white/70">{year}</span>}
        {item.certification && (
          <span className="rounded-md border border-white/25 bg-black/30 px-2 py-0.5 text-xs font-semibold text-white/90">
            {item.certification}
          </span>
        )}
        {genres && <span className="text-muted">{genres}</span>}
      </div>
      {item.overview && (
        <p className="mt-4 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/75 sm:text-[0.95rem]">
          {item.overview}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:mt-7">
        <Link
          href={`/watch/${item.type}/${item.tmdbId}`}
          className="btn-primary h-11 px-6 text-sm sm:h-12 sm:px-8 sm:text-base"
        >
          <PlayIcon size={20} /> Watch Now
        </Link>
        <Link
          href={`/${item.type}/${item.tmdbId}`}
          className="btn-ghost h-11 gap-2.5 px-5 text-sm sm:h-12 sm:px-6 sm:text-base"
        >
          <InfoMark /> More Info
        </Link>
        <WatchlistButton item={item} variant="hero" />
      </div>
    </>
  );
}

// -------------------------------- live slide --------------------------------

function LiveCopy({ live }: { live: LiveWindow }) {
  return (
    <>
      <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ff6a5f]">
        <span
          aria-hidden="true"
          className="live-blink h-2 w-2 rounded-full bg-[#ff3b30] shadow-[0_0_8px_rgb(255_59_48/0.9)]"
        />
        Live · {live.kind === "f1" ? "Formula 1" : "Cricket"}
      </p>
      <h1 className="text-balance font-display text-[2.6rem] uppercase leading-[0.95] tracking-wide text-white sm:text-6xl lg:text-7xl">
        {live.title}
      </h1>
      <p className="mt-4 text-sm font-medium text-white/75 sm:text-base">{live.subtitle}</p>
      {live.details.length > 0 && (
        <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/60">
          {live.details.join(" · ")}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:mt-7">
        <Link
          href={live.href}
          className="inline-flex h-11 items-center gap-2 rounded-md bg-[#e10600] px-6 text-sm font-bold uppercase tracking-wide text-white shadow-[0_10px_30px_-10px_rgba(225,6,0,0.85)] transition hover:bg-[#ff2421] active:scale-[0.99] sm:h-12 sm:px-8 sm:text-base"
        >
          <PlayIcon size={20} /> Watch Live
        </Link>
      </div>
    </>
  );
}

function LiveBackdrop({ live }: { live: LiveWindow }) {
  const isF1 = live.kind === "f1";
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className={
          isF1
            ? "absolute inset-0 bg-[radial-gradient(120%_130%_at_78%_8%,#8c150c_0%,#3a0b07_42%,#0b0b0d_100%)]"
            : "absolute inset-0 bg-[radial-gradient(120%_130%_at_78%_8%,#174a96_0%,#0c2347_44%,#0b0b0d_100%)]"
        }
      />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_right,#000,transparent_78%)]" />
      {live.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={live.imageUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute right-[-2%] top-1/2 w-[52%] max-w-[760px] -translate-y-1/2 opacity-20 brightness-0 invert"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={isF1 ? "/f1/brand/f1-logo.svg" : "/cricket/brand/bcci-logo.svg"}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={`absolute right-[3%] top-[9%] opacity-[0.16] ${
          isF1 ? "w-[38%] max-w-[520px]" : "w-[30%] max-w-[400px]"
        }`}
      />
    </div>
  );
}

// Title logo artwork with a graceful fallback: if the image fails to load the
// text title takes over, so the hero never shows a broken image.
function TitleLogo({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <h1 className="text-balance font-display text-[2.6rem] uppercase leading-[0.95] tracking-wide text-white sm:text-6xl lg:text-7xl">
        {title}
      </h1>
    );
  }

  return (
    <div className="relative mb-2 h-20 sm:h-24 lg:h-32">
      <h1 className="sr-only">{title}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title}
        onError={() => setFailed(true)}
        className="max-h-full w-auto max-w-[300px] object-contain object-left drop-shadow-[0_4px_28px_rgba(0,0,0,0.85)] sm:max-w-[420px] lg:max-w-[520px]"
        draggable={false}
      />
    </div>
  );
}

function InfoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" strokeLinecap="round" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
