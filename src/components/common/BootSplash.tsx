"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// First-paint brand splash.
//
// This is the "opening the site" counterpart to PageLoader: it is part of the
// server-rendered layout and starts visible, so it covers the page while the
// document streams down and the hero artwork/fonts load. The homepage is fully
// built behind it; the splash simply fades away when there is nothing left to
// wait for.
//
// It is deliberately independent of hydration. A CSS failsafe fades it out
// after 7s even if the client bundle never executes, so a broken chunk can
// never leave the site behind a permanent black screen.
//
// PageLoader (the neon wordmark) is still the route-transition loader. This
// one only runs once, on the initial document load.
// ---------------------------------------------------------------------------

/** Keep the brand on screen long enough to read, measured from first paint. */
const MIN_VISIBLE_MS = 1100;

function whenLoaded(): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
  });
}

/**
 * Milliseconds left of the minimum display time. `performance.now()` is
 * measured from navigation start, and the first-contentful-paint entry is the
 * splash's own first paint, so a slow hydration does not add another second of
 * splash after the page has already been ready for a while.
 *
 * Falls back to the full minimum when the Paint Timing API is unavailable.
 */
function remainingMinimum(): number {
  try {
    const paint = performance
      .getEntriesByType("paint")
      .find((entry) => entry.name === "first-contentful-paint");
    if (!paint) return MIN_VISIBLE_MS;
    return Math.max(0, paint.startTime + MIN_VISIBLE_MS - performance.now());
  } catch {
    return MIN_VISIBLE_MS;
  }
}

export default function BootSplash() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const minimum = new Promise<void>((resolve) => {
      window.setTimeout(resolve, remainingMinimum());
    });
    const fonts = document.fonts?.ready ?? Promise.resolve();

    Promise.all([whenLoaded(), fonts, minimum]).then(() => {
      if (cancelled) return;
      // Two frames so the loaded page paints underneath before the fade.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setReady(true);
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="rh-boot-splash"
      data-ready={ready ? "true" : "false"}
      aria-hidden={ready}
    >
      <div className="rh-boot-stage">
        {/* Same wordmark asset as the navbar: white REEL / red HOUSE. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="rh-boot-logo"
          src="/logo.png"
          alt=""
          width={720}
          height={242}
          fetchPriority="high"
          decoding="async"
          draggable={false}
        />

        <p className="rh-boot-loading">Loading</p>
        <div className="rh-boot-track" aria-hidden="true">
          <span className="rh-boot-fill" />
        </div>
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        Loading Reelhouse
      </span>
    </div>
  );
}
