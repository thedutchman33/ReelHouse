"use client";

import { useEffect, useRef, useState } from "react";
import WatchlistButton from "@/components/media/WatchlistButton";
import type { MediaSummary } from "@/types";

// Control dock joined under the player stage (reference anatomy, REA-verified):
// Like (+Dislike reveal) · divider · Theater · Add · Download · More, with
// Fullscreen pushed to the far right (ml-auto). 38px buttons (42px from sm),
// rounded-[11px], muted-green icons, hover wash. Like state persists per title
// in localStorage (a real per-viewer signal, the only backend Reelhouse has).

const LIKES_KEY = "rh-title-likes";

function loadLikes(): Record<string, 1 | -1> {
  try {
    return JSON.parse(localStorage.getItem(LIKES_KEY) ?? "{}") as Record<string, 1 | -1>;
  } catch {
    return {};
  }
}

const btnBase =
  "inline-flex h-[38px] w-[38px] sm:h-[42px] sm:w-[42px] shrink-0 items-center justify-center rounded-[11px] transition-colors hover:bg-white/[0.09] text-[hsl(150_3%_62%)] hover:text-foreground";

export default function WatchDock({
  media,
  theater,
  season,
  episode,
  onToggleTheater,
  onFullscreen,
  onNotPlaying,
}: {
  media: MediaSummary;
  theater: boolean;
  /** Current TV episode coordinates (download link for series). */
  season?: number;
  episode?: number;
  onFullscreen: () => void;
  onToggleTheater: () => void;
  onNotPlaying: () => void;
}) {
  const [reaction, setReaction] = useState<1 | -1 | 0>(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  // F1 is a live channel: there is no watchlist entry or downloadable title
  // behind it, so those two controls are omitted rather than pointed at a 404.
  const isF1 = media.type === "f1";

  useEffect(() => {
    setReaction(loadLikes()[media.id] ?? 0);
  }, [media.id]);

  // Close the More menu on any outside pointer.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [moreOpen]);

  const react = (value: 1 | -1) => {
    const next = reaction === value ? 0 : value;
    setReaction(next);
    try {
      const all = loadLikes();
      if (next === 0) delete all[media.id];
      else all[media.id] = next;
      localStorage.setItem(LIKES_KEY, JSON.stringify(all));
    } catch {
      /* best-effort persistence */
    }
  };

  return (
    <div className="relative z-[2] w-full rounded-xl rounded-t-none border border-t-0 border-white/[0.09] bg-[hsl(150_3%_12%)] px-1.5 py-1.5 opacity-80 shadow-[0_22px_54px_-16px_rgba(0,0,0,0.92)] transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100 sm:px-2.5 sm:py-2">
      <div className="flex flex-wrap items-center gap-0.5 sm:flex-nowrap sm:gap-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={reaction === 1}
            aria-label="Like"
            title="Like"
            onClick={() => react(1)}
            className={btnBase}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={reaction === 1 ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="transition-transform"
            >
              <path d="M7 10v12" />
              <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
            </svg>
          </button>
          {/* Dislike reveals when the title is liked (reference pattern). */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              reaction === 1 ? "w-[38px] opacity-100 sm:w-[42px]" : "w-0 opacity-0"
            }`}
          >
            <button
              type="button"
              aria-pressed={reaction === -1}
              aria-label="Dislike"
              title="Dislike"
              tabIndex={reaction === 1 ? 0 : -1}
              onClick={() => react(-1)}
              className={btnBase}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={reaction === -1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 14V2" />
                <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
              </svg>
            </button>
          </div>
        </div>

        <span aria-hidden className="mx-1.5 hidden h-[22px] w-px bg-white/10 sm:block" />

        <button
          type="button"
          onClick={onToggleTheater}
          aria-pressed={theater}
          aria-label="Theater"
          title="Theater"
          className={`${btnBase} ${theater ? "!text-accent" : ""}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="20" height="12" x="2" y="6" rx="2" />
          </svg>
        </button>

        {!isF1 && <WatchlistButton item={media} variant="dock" />}

        {/* Download (reference behavior: opens vidvault.to for this title). */}
        {!isF1 && (
          <a
            href={
              media.type === "tv"
                ? `https://vidvault.to/tv/${media.tmdbId}/${season ?? 1}/${episode ?? 1}`
                : `https://vidvault.to/movie/${media.tmdbId}`
            }
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download"
            title="Download"
            className={btnBase}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 13v8l-4-4" />
              <path d="m12 21 4-4" />
              <path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284" />
            </svg>
          </a>
        )}

        {/* More (reference: ellipsis-vertical) — quick actions menu. */}
        <div ref={moreRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="More"
            title="More"
            onClick={() => setMoreOpen((v) => !v)}
            className={btnBase}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="text-white/80">
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="panel absolute right-0 top-full z-20 mt-1 w-52 p-1.5"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onNotPlaying();
                }}
                className="menu-item"
              >
                Switch server
              </button>
              <a
                role="menuitem"
                href={isF1 ? "/f1" : `/${media.type}/${media.tmdbId}`}
                className="menu-item"
                onClick={() => setMoreOpen(false)}
              >
                Go to details
              </a>
              <a
                role="menuitem"
                href="/faq"
                className="menu-item"
                onClick={() => setMoreOpen(false)}
              >
                Playback help
              </a>
            </div>
          )}
        </div>

        {/* Fullscreen — far right (reference: ml-auto maximize2). */}
        <button
          type="button"
          aria-label="Fullscreen"
          title="Fullscreen"
          onClick={onFullscreen}
          className={`${btnBase} ml-auto`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" x2="14" y1="3" y2="10" />
            <line x1="3" x2="10" y1="21" y2="14" />
          </svg>
        </button>
      </div>
    </div>
  );
}
