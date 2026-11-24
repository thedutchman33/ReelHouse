"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PosterImage from "@/components/media/PosterImage";
import WatchlistButton from "@/components/media/WatchlistButton";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  PlayIcon,
} from "@/components/player/icons";
import { useLiveWindows } from "@/components/live/use-live-windows";
import { flagCodeFor } from "@/components/cricket/TeamFlag";
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
  // Hotstar previews on hover, so the rotation has to stop while the cursor is
  // in the strip — otherwise the timer yanks the preview away mid-hover.
  const [hoveringStrip, setHoveringStrip] = useState(false);
  // The strip is a window over the slide list. It follows the active slide so
  // live slides (which can push the count past the window) never strand the
  // current pick off-screen.
  const THUMB_WINDOW = 6;
  const [stripStart, setStripStart] = useState(0);
  const hoverTimer = useRef<number | null>(null);
  const count = slides.length;
  // The list can shrink between a live poster disappearing and the reset
  // effect running; clamp instead of rendering a blank hero for a frame.
  const currentIndex = count ? Math.min(active, count - 1) : 0;
  const current = slides[currentIndex];

  // A live poster takes over the hero as it appears, and the normal rotation
  // resumes when it locks again. Keyed on which sections are live, not on the
  // rotation clock, so this never fights the auto-advance.
  useEffect(() => {
    setSlide({ active: 0, prev: null });
    setStripStart(0);
  }, [liveKey]);

  useEffect(() => {
    if (count <= 1 || hoveringStrip) return;
    const id = window.setInterval(
      () => setSlide((s) => ({ active: (s.active + 1) % count, prev: s.active })),
      7000
    );
    return () => window.clearInterval(id);
  }, [count, active, hoveringStrip]);

  // Keep the active slide inside the visible window. Hover previews only move
  // within the window, so this never slides the strip out from under the
  // cursor; it only follows auto-advance and the chevron.
  useEffect(() => {
    setStripStart((start) => {
      if (currentIndex < start) return currentIndex;
      if (currentIndex >= start + THUMB_WINDOW) {
        return Math.min(
          currentIndex - THUMB_WINDOW + 1,
          Math.max(0, count - THUMB_WINDOW)
        );
      }
      return start;
    });
  }, [currentIndex, count]);

  // The hover-intent timer must not fire after unmount.
  useEffect(
    () => () => {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    },
    []
  );

  if (!count) return null;

  // Only the outgoing, the current and the incoming slide need to exist. The
  // stack sits inside the viewport, so `loading="lazy"` defers nothing for the
  // others — they were five w1280 backdrops fetched on every home page load to
  // show one. The incoming slide is mounted a full rotation (7s) ahead of
  // becoming active, so it is decoded well before it is shown.
  const incoming = count > 1 ? (currentIndex + 1) % count : currentIndex;
  const isMounted = (i: number) =>
    allMounted || i === currentIndex || i === incoming || i === prev;

  const selectSlide = (i: number) => {
    // Jumping to a non-adjacent slide needs every slide mounted, or the new
    // slide pops in instead of crossfading. Same rule the dots used.
    setAllMounted(true);
    setSlide((s) => (s.active === i ? s : { active: i, prev: s.active }));
  };

  const cancelHover = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  // Hovering a thumbnail previews that slide, then crossfades into it — the
  // reference's cursor behaviour. A short intent delay keeps a cursor passing
  // across the strip from firing every thumb on the way.
  const previewSlide = (i: number) => {
    cancelHover();
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      selectSlide(i);
    }, 120);
  };

  const stripSlides = slides.slice(stripStart, stripStart + THUMB_WINDOW);

  return (
    <section className="relative">
      {/* min(560px, 100svh) keeps a phone in landscape from getting a hero
          taller than its whole screen (which pushed the copy out of view). */}
      <div className="relative h-[82svh] min-h-[min(560px,100svh)] max-h-[860px] w-full overflow-hidden">
        {slides.map((slide, i) =>
          isMounted(i) ? (
            <div
              key={slide.key}
              className={`absolute inset-0 transition-opacity duration-700 ${i === currentIndex ? "opacity-100" : "opacity-0"}`}
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
                  // Full-bleed: the ladder has to reach 1920, not stop at the
                  // 780 a card-sized `sizes` would imply.
                  sizes="100vw"
                  // A 16:9 backdrop in a much wider frame has to lose height
                  // somewhere; biasing above centre keeps faces and titles in shot.
                  className="h-full w-full object-cover object-[50%_32%]"
                />
              )}
            </div>
          ) : null
        )}

        {/* Legibility scrims: a top wash for the nav, a vertical fade into the
            page, and a left-side wash under the copy. Kept subtle enough to
            leave the artwork readable. */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/75 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/40 to-transparent sm:via-bg/20" />

        {/* The copy, the thumbnail strip and the dots all sit on the page's one
            content column, so the hero's left edge lines up with every section
            below it (reference: one container, one gutter). */}
        <div className="container-rh absolute inset-x-0 bottom-0 z-10">
          {/* The copy and the thumbnail strip share one baseline: the strip is
              pinned to the same 28px inset, so its bottom edge lines up with
              the CTA row (reference hero anatomy). */}
          <div
            key={current.key}
            className="max-w-[36rem] animate-fade-up pb-14 min-[1400px]:pb-7"
          >
            {current.kind === "live" ? (
              <LiveCopy live={current.live} />
            ) : (
              <MediaCopy item={current.item} />
            )}
          </div>
        </div>

        {count > 1 && (
          <>
            {/* Desktop: Hotstar's thumbnail carousel in the lower-right. Each
                thumb is a real slide picker; the arrows step the rotation. */}
            <div
              className="absolute bottom-7 right-16 z-20 hidden items-center gap-1.5 min-[1400px]:flex"
              // The rotation pauses while the cursor is in the strip — otherwise
              // the timer pulls the previewed slide away mid-hover. Leaving also
              // drops a pending preview so a quick pass across the thumbs does
              // not swap the hero on the way out.
              onPointerEnter={() => setHoveringStrip(true)}
              onPointerLeave={() => {
                setHoveringStrip(false);
                cancelHover();
              }}
            >
              <button
                type="button"
                onPointerDown={() => setAllMounted(true)}
                onFocus={() => setAllMounted(true)}
                onClick={() => selectSlide((currentIndex - 1 + count) % count)}
                aria-label="Previous featured title"
                className="grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white/85 ring-1 ring-white/20 backdrop-blur transition hover:bg-white/15 hover:text-white"
              >
                <ChevronLeftIcon size={22} />
              </button>

              <div className="flex items-center gap-2">
                {stripSlides.map((slide, offset) => {
                  const i = stripStart + offset;
                  const label =
                    slide.kind === "live" ? slide.live.title : slide.item.title;
                  return (
                    <button
                      key={slide.key}
                      type="button"
                      onPointerDown={() => setAllMounted(true)}
                      onFocus={() => setAllMounted(true)}
                      onClick={() => selectSlide(i)}
                      onPointerEnter={() => previewSlide(i)}
                      aria-label={`Show ${label}`}
                      aria-current={i === currentIndex}
                      className={`relative aspect-video w-[78px] shrink-0 overflow-hidden rounded-[4px] bg-surface-2 transition duration-200 ${
                        i === currentIndex
                          ? "opacity-100 outline outline-2 outline-offset-2 outline-white"
                          : "opacity-60 outline outline-1 outline-offset-2 outline-transparent hover:opacity-100 hover:outline-white/50"
                      }`}
                    >
                      {slide.kind === "live" ? (
                        <LiveThumb live={slide.live} />
                      ) : (
                        <PosterImage
                          src={slide.item.backdropUrl}
                          title={slide.item.title}
                          type={slide.item.type}
                          variant="backdrop"
                          sizes="78px"
                          className="h-full w-full object-cover"
                        />
                      )}
                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onPointerDown={() => setAllMounted(true)}
                onFocus={() => setAllMounted(true)}
                onClick={() => selectSlide((currentIndex + 1) % count)}
                aria-label="Next featured title"
                className="grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white/85 ring-1 ring-white/20 backdrop-blur transition hover:bg-white/15 hover:text-white"
              >
                <ChevronRightIcon size={22} />
              </button>
            </div>

            {/* Mobile/tablet: compact dots (the strip needs desktop room). */}
            <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-6 z-20 flex items-center gap-1.5 min-[1400px]:hidden md:bottom-5 md:right-16">
              {slides.map((slide, i) => (
                <button
                  key={slide.key}
                  type="button"
                  onPointerDown={() => setAllMounted(true)}
                  onFocus={() => setAllMounted(true)}
                  onClick={() => selectSlide(i)}
                  aria-label={`Show ${
                    slide.kind === "live" ? slide.live.title : slide.item.title
                  }`}
                  aria-current={i === currentIndex}
                  className="group grid h-9 place-items-center px-1.5"
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
          </>
        )}
      </div>
    </section>
  );
}

// ------------------------------- media slide --------------------------------

function MediaCopy({ item }: { item: MediaSummary }) {
  const rating = formatRating(item.rating);
  const year = yearOf(item.releaseDate);
  const meta = [
    year,
    item.certification,
    item.type === "tv" ? "Series" : "Film",
  ].filter(Boolean);
  const genres = item.genres.slice(0, 4);
  const detailHref = `/${item.type}/${item.tmdbId}`;

  return (
    <>
      {/* Hotstar hero anatomy: the title art itself links to the detail page,
          so the hero still exposes "more info" without a second CTA. The h1
          stays in the logo case (sr-only) for accessibility. */}
      <Link
        href={detailHref}
        className="inline-block max-w-full transition-opacity hover:opacity-90"
      >
        {item.logoUrl ? (
          <TitleLogo src={item.logoUrl} title={item.title} />
        ) : (
          <h1 className="text-balance font-sans text-[2.6rem] font-extrabold leading-[1.03] tracking-[-0.02em] text-white sm:text-6xl lg:text-7xl">
            {item.title}
          </h1>
        )}
      </Link>

      <div className="mt-2 space-y-1 text-sm font-semibold">
        {rating && (
          <p className="text-[#4da6ff]">IMDb {rating}</p>
        )}
        {meta.length > 0 && (
          <p className="text-white/90">{meta.join(" • ")}</p>
        )}
      </div>

      {item.overview && (
        <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/85 sm:text-[0.95rem]">
          {item.overview}
        </p>
      )}

      {genres.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-semibold text-white/90">
          {genres.map((genre, i) => (
            <span key={genre} className="flex items-center gap-2.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-white/35">
                  |
                </span>
              )}
              {genre}
            </span>
          ))}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2.5 sm:mt-6 sm:gap-3">
        {/* CTA row: solid white Watch Now, outlined More Info, square add-to-list. */}
        <Link
          href={`/watch/${item.type}/${item.tmdbId}`}
          className="inline-flex h-11 items-center justify-center gap-2.5 rounded-[10px] bg-white px-7 text-sm font-bold text-black transition hover:bg-white/90 active:scale-[0.99] sm:h-[54px] sm:px-8 sm:text-[17px]"
        >
          <PlayIcon size={20} /> Watch Now
        </Link>
        <Link
          href={detailHref}
          className="inline-flex h-11 items-center justify-center gap-2.5 rounded-[10px] border border-white/25 bg-white/[0.04] px-6 text-sm font-semibold text-white transition hover:border-white/45 hover:bg-white/10 sm:h-[54px] sm:px-7 sm:text-base"
        >
          <InfoIcon size={22} /> More Info
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
      <h1 className="text-balance font-sans text-[2.6rem] font-extrabold leading-[1.03] tracking-[-0.02em] text-white sm:text-6xl lg:text-7xl">
        {live.title}
      </h1>
      <p className="mt-4 text-sm font-medium text-white/75 sm:text-base">{live.subtitle}</p>
      {live.details.length > 0 && (
        <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/60">
          {live.details.join(" · ")}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:mt-8">
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
  const [posterFailed, setPosterFailed] = useState(false);

  // A new live event means new artwork; a failure from the previous poster
  // must not hide it.
  useEffect(() => {
    setPosterFailed(false);
  }, [live.posterUrl]);

  if (live.posterUrl && !posterFailed) {
    return (
      <div className="absolute inset-0 overflow-hidden bg-[#0b0b0d]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={live.posterUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          onError={() => setPosterFailed(true)}
          className="h-full w-full object-cover object-[50%_35%]"
        />
        {/* The copy scrims sit above this; the small wash keeps a bright race
            photo from washing out the red Watch Live button. */}
        <div className="absolute inset-0 bg-black/25" />
      </div>
    );
  }

  if (live.kind === "cricket" && live.teams?.length) {
    return <CricketPoster teams={live.teams} />;
  }

  return <BrandBackdrop kind={live.kind} />;
}

/** Branded fallback while a poster is unavailable, or while one loads. */
function BrandBackdrop({ kind }: { kind: "f1" | "cricket" }) {
  const isF1 = kind === "f1";
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

/**
 * Cricket's broadcast-poster stand-in. BCCI's public feeds carry no per-match
 * poster image (its match share-card route answers with a placeholder), so the
 * slide is composed from the two official flags — the real, match-specific art
 * available — over the section's navy broadcast gradient. It changes with every
 * fixture, unlike the old single BCCI watermark.
 */
function CricketPoster({ teams }: { teams: NonNullable<LiveWindow["teams"]> }) {
  const [home, away] = teams;
  const wash = (colour?: string) => (colour ? `${colour}55` : "transparent");
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(120%_130%_at_78%_8%,#174a96_0%,#0c2347_44%,#0b0b0d_100%)]" />
      {/* Both sides' official jersey colours, so the fixture — not just the
          section — gives the poster its tint. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40"
        style={{
          background: `linear-gradient(115deg, ${wash(home?.primary)}, transparent 45%, ${wash(away?.primary)})`,
        }}
      />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_right,#000,transparent_78%)]" />
      <div className="absolute inset-y-0 right-0 flex w-full items-center justify-end gap-[6vw] pr-[5vw] opacity-[0.28] sm:gap-[5vw] sm:pr-[7vw]">
        {teams.map((team) => {
          const code = flagCodeFor(team.name, team.abbreviation);
          return (
            <div key={team.name} className="flex flex-col items-center gap-3 sm:gap-5">
              {code ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/cricket/flags/${code}.svg`}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="h-[14vw] max-h-[190px] w-[22vw] max-w-[300px] rounded-md object-cover ring-1 ring-white/25 sm:h-[12vw] sm:w-[18vw]"
                />
              ) : (
                <span className="font-display text-[12vw] uppercase leading-none text-white sm:text-[8vw]">
                  {team.abbreviation}
                </span>
              )}
              <span className="font-display text-[4.5vw] uppercase tracking-wide text-white/80 sm:text-4xl">
                {team.abbreviation}
              </span>
            </div>
          );
        })}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/cricket/brand/bcci-logo.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute right-[3%] top-[9%] w-[16%] max-w-[210px] opacity-[0.12]"
      />
    </div>
  );
}

// Title logo artwork with a graceful fallback: if the image fails to load the
// text title takes over, so the hero never shows a broken image.
//
// The logo is the sharpest-edged thing on the page and is boxed at up to 520px,
// so it gets the 500/780 rungs: `logoUrl` is a w500 file, which is 0.96x on a
// wide 1x display. A failed 780 (some masters are smaller) drops back to that
// documented w500 src before the text title.
const TMDB_LOGO = /^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)(\/.+)$/;
const LOGO_SIZES =
  "(min-width: 1024px) 560px, (min-width: 640px) 460px, 340px";

function logoSrcSet(src: string): string | undefined {
  const path = TMDB_LOGO.exec(src)?.[1];
  if (!path) return undefined;
  return [500, 780]
    .map((w) => `https://image.tmdb.org/t/p/w${w}${path} ${w}w`)
    .join(", ");
}

function TitleLogo({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const [plain, setPlain] = useState(false);

  useEffect(() => {
    setFailed(false);
    setPlain(false);
  }, [src]);

  if (failed) {
    return (
      <h1 className="text-balance font-sans text-[2.6rem] font-extrabold leading-[1.03] tracking-[-0.02em] text-white sm:text-6xl lg:text-7xl">
        {title}
      </h1>
    );
  }

  const srcSet = plain ? undefined : logoSrcSet(src);

  return (
    // No fixed box height: the artwork keeps its own ratio and the metadata
    // follows directly beneath it. A fixed tall box left a dead gap under wide
    // wordmarks (e.g. THE HUNGER GAMES), pushing the title to the hero's top.
    <div className="relative mb-1">
      <h1 className="sr-only">{title}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={title}
        onError={() => (srcSet ? setPlain(true) : setFailed(true))}
        srcSet={srcSet}
        sizes={srcSet ? LOGO_SIZES : undefined}
        className="block max-h-[92px] w-auto max-w-[340px] object-contain object-left drop-shadow-[0_4px_28px_rgba(0,0,0,0.85)] sm:max-h-[124px] sm:max-w-[460px] lg:max-h-[150px] lg:max-w-[560px]"
        draggable={false}
      />
    </div>
  );
}

/** Tiny artwork for the hero strip. Live slides may have no poster, so the
 *  section's broadcast colour stands in. */
function LiveThumb({ live }: { live: LiveWindow }) {
  if (live.posterUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={live.posterUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`block h-full w-full ${
        live.kind === "f1"
          ? "bg-[radial-gradient(circle_at_30%_20%,#8c150c,#3a0b07_70%)]"
          : "bg-[radial-gradient(circle_at_30%_20%,#174a96,#0c2347_70%)]"
      }`}
    />
  );
}
