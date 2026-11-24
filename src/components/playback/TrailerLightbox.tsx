"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TrailerVideo } from "@/types";

function OptionPlayIcon() {
  return (
    <svg
      aria-hidden="true"
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

// Full-screen trailer player. Portaled so it escapes the detail column / watch
// page stacking context and covers the nav. It mounts only once opened, so the
// server render never touches `document`.
export default function TrailerLightbox({
  open,
  onClose,
  trailerKey,
  trailerName,
  trailers,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  trailerKey: string;
  trailerName?: string;
  /**
   * All playable videos, newest first. Moctale's `video_list` order is kept
   * when supplied; omit it for a single-trailer player.
   */
  trailers?: readonly TrailerVideo[];
  /** The play control that opened it — focus returns here on close. */
  returnFocusTo?: { current: HTMLElement | null };
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Keep the latest close callback without re-running the effect (and
  // re-focusing the close button) every time the parent re-renders.
  const closeCb = useRef(onClose);
  closeCb.current = onClose;
  const [activeKey, setActiveKey] = useState(trailerKey);

  // Open on the current primary trailer every time; choosing an older teaser
  // should not stick after the player is closed.
  useEffect(() => {
    setActiveKey(trailerKey);
  }, [trailerKey, open]);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCb.current();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      body.style.overflow = previous;
      returnFocusTo?.current?.focus();
    };
  }, [open, returnFocusTo]);

  if (!open) return null;

  const options =
    trailers && trailers.length > 0
      ? trailers
      : [{ key: trailerKey, name: trailerName ?? "Official Trailer" }];
  const active =
    options.find((option) => option.key === activeKey) ?? options[0]!;
  const hasOptions = options.length > 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${hasOptions ? "Trailer player" : "Official trailer player"}: ${active.name}`}
        className="max-h-[calc(100svh-2rem)] w-full max-w-5xl overflow-y-auto"
      >
        <div className="mb-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-accent">
              {hasOptions ? "Trailers & Teasers" : "Official Trailer"}
            </p>
            <p className="mt-1 truncate text-sm text-white/75">{active.name}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close trailer player"
            className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:border-white/35 hover:bg-white/10 hover:text-white"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
          <iframe
            key={active.key}
            src={`https://www.youtube-nocookie.com/embed/${active.key}?autoplay=1&rel=0&playsinline=1`}
            title={active.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full border-0"
          />
        </div>

        {hasOptions && (
          <div
            role="group"
            aria-label="More trailers and teasers"
            className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1"
          >
            {options.map((option) => {
              const selected = option.key === active.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setActiveKey(option.key)}
                  aria-pressed={selected}
                  className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                    selected
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-white/15 bg-white/[0.06] text-white/65 hover:border-white/30 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <OptionPlayIcon />
                  {option.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
