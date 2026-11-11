"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  PAGE_LOADER_EVENT,
  type PageLoaderDetail,
} from "@/lib/page-loader";

// ---------------------------------------------------------------------------
// Global page-transition loader.
//
// OnlyFlix pattern: a full-screen blurred plate with a neon stroke wordmark
// drawn letter by letter, plus an indeterminate gradient bar across the top.
// Reelhouse keeps the technique but draws its own REELHOUSE letterforms in the
// logo's two-tone palette: white REEL, red HOUSE.
//
// It is deliberately NOT a persistent splash:
//   • it appears only after SHOW_DELAY_MS has passed since a navigation was
//     actually initiated, so instant client-side routes never flash it;
//   • it hides as soon as the URL commits (pathname, query or hash);
//   • it has a hard MAX_VISIBLE_MS stop so it can never strand the page.
//
// This file also carries the recovery path for the "clicks stop responding
// until I refresh" failure mode:
//   • a script/chunk load failure triggers one guarded hard reload;
//   • a navigation that never commits triggers one full-document navigation
//     to the clicked destination (bypassing a wedged client router).
// ---------------------------------------------------------------------------

const SHOW_DELAY_MS = 200;
const MIN_VISIBLE_MS = 300;
const MAX_VISIBLE_MS = 5000;
const URL_POLL_MS = 200;
const NAV_WATCHDOG_MS =
  process.env.NODE_ENV === "development" ? 12_000 : 8_000;
const CHUNK_RELOAD_KEY = "reelhouse:chunk-reload-at";
const CHUNK_RELOAD_WINDOW_MS = 20_000;

interface Letter {
  id: string;
  d: string;
  gradient: "A" | "B" | "C";
  spin?: boolean;
}

// 64×64 frames, pathLength 360, 8px round strokes — the same geometry rules
// OnlyFlix uses (one continuous path per letter, so the dash animation reads
// as a pen tracing the glyph). The palette is the actual logo split: REEL
// white, HOUSE red (the mark's red samples at #FB0101).
const LETTERS: Letter[] = [
  {
    id: "r",
    gradient: "A",
    d: "M 14 58 V 8 H 38 C 52 8 52 34 38 34 H 14 M 37 34 L 54 58",
  },
  { id: "e1", gradient: "A", d: "M 52 8 H 14 V 58 H 52 M 14 33 H 44" },
  { id: "e2", gradient: "A", d: "M 52 8 H 14 V 58 H 52 M 14 33 H 44" },
  { id: "l", gradient: "A", d: "M 14 8 V 58 H 54" },
  {
    id: "h",
    gradient: "C",
    d: "M 12 8 V 58 M 52 8 V 58 M 12 33 H 52",
  },
  {
    id: "o",
    gradient: "C",
    spin: true,
    d: "M 32 32 m 0 -26 a 26 26 0 1 1 0 52 a 26 26 0 1 1 0 -52",
  },
  { id: "u", gradient: "C", d: "M 12 8 V 38 C 12 60 52 60 52 38 V 8" },
  {
    id: "s",
    gradient: "C",
    d: "M 52 12 C 42 0 14 4 14 18 C 14 34 52 30 52 46 C 52 62 20 62 10 48",
  },
  { id: "e3", gradient: "C", d: "M 52 8 H 14 V 58 H 52 M 14 33 H 44" },
];

/** A link click that should become a Reelhouse page transition. */
function shouldFollowAnchor(
  anchor: HTMLAnchorElement,
  event: MouseEvent
): boolean {
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.closest("[data-no-page-loader]")) return false;

  const raw = anchor.getAttribute("href");
  if (!raw || raw.startsWith("#")) return false;

  let url: URL;
  try {
    url = new URL(raw, window.location.href);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.origin !== window.location.origin) return false;
  if (url.href === window.location.href) return false;
  // A hash on the current document is a scroll, not a page load.
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    url.hash
  ) {
    return false;
  }
  return true;
}

function isChunkLoadFailure(value: unknown): boolean {
  const message =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? `${value.name}: ${value.message}`
        : "";
  return /(?:ChunkLoadError|Loading chunk [\w./-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS)/i.test(
    message
  );
}

/**
 * Hard-reload once after a chunk failure. Deployments replace hashed chunks;
 * a tab left open across a deploy can end up with a page whose next chunk
 * request 404s — JS then never hydrates and every onClick is dead. A single
 * guarded reload fetches the current build and restores interactivity.
 */
function reloadOnceForChunkFailure(): void {
  try {
    const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < CHUNK_RELOAD_WINDOW_MS) {
      return;
    }
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // No storage means no loop guard; do not risk an endless reload cycle.
    return;
  }
  console.warn("[reelhouse] client chunk failed to load; reloading once");
  window.location.reload();
}

export default function PageLoader() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const maxTimer = useRef<number | null>(null);
  const urlTimer = useRef<number | null>(null);
  const watchdogTimer = useRef<number | null>(null);
  const watchdogStart = useRef("");
  const shownAt = useRef(0);
  const visibleRef = useRef(false);
  const previousPath = useRef(pathname);

  const clearWatchdog = useCallback(() => {
    if (watchdogTimer.current !== null) {
      window.clearTimeout(watchdogTimer.current);
      watchdogTimer.current = null;
    }
    watchdogStart.current = "";
  }, []);

  /** Stop every loader timer except the stuck-navigation watchdog. */
  const clearLoaderTimers = useCallback(() => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (maxTimer.current !== null) {
      window.clearTimeout(maxTimer.current);
      maxTimer.current = null;
    }
    if (urlTimer.current !== null) {
      window.clearInterval(urlTimer.current);
      urlTimer.current = null;
    }
  }, []);

  /**
   * Hide after the minimum visible time. Does not clear the watchdog: if the
   * overlay hit its 5s cap while the router is still wedged, recovery must
   * still fire.
   */
  const hide = useCallback(() => {
    clearLoaderTimers();
    if (!visibleRef.current) return;

    const remaining = Math.max(
      0,
      MIN_VISIBLE_MS - (performance.now() - shownAt.current)
    );
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      visibleRef.current = false;
      setVisible(false);
    }, remaining);
  }, [clearLoaderTimers]);

  /**
   * If the client router never commits the destination, fall back to a real
   * document navigation. That is the recovery for a dead React router: the
   * URL and page then change even though the in-page handlers were stuck.
   */
  const armWatchdog = useCallback(
    (href: string) => {
      const start = window.location.href;
      let target: string;
      try {
        target = new URL(href, start).href;
      } catch {
        return;
      }
      if (target === start) return;
      if (new URL(target).origin !== window.location.origin) return;
      // Do not postpone an already-armed watchdog by re-clicking the same page.
      if (watchdogTimer.current !== null && watchdogStart.current === start) {
        return;
      }
      clearWatchdog();
      watchdogStart.current = start;
      watchdogTimer.current = window.setTimeout(() => {
        watchdogTimer.current = null;
        if (window.location.href === start) {
          console.warn(
            "[reelhouse] navigation did not commit; falling back to a full load"
          );
          window.location.assign(target);
        }
      }, NAV_WATCHDOG_MS);
    },
    [clearWatchdog]
  );

  /**
   * Watch the address bar while the overlay is up. A query-only navigation
   * (search filters, pagination) does not change usePathname, so the URL is
   * the only reliable "the route committed" signal here.
   */
  const watchUrl = useCallback(
    (startHref: string) => {
      if (urlTimer.current !== null) window.clearInterval(urlTimer.current);
      urlTimer.current = window.setInterval(() => {
        if (window.location.href !== startHref) {
          clearWatchdog();
          hide();
        }
      }, URL_POLL_MS);
    },
    [clearWatchdog, hide]
  );

  const armMax = useCallback(() => {
    if (maxTimer.current !== null) window.clearTimeout(maxTimer.current);
    maxTimer.current = window.setTimeout(() => {
      maxTimer.current = null;
      visibleRef.current = false;
      setVisible(false);
      if (urlTimer.current !== null) {
        window.clearInterval(urlTimer.current);
        urlTimer.current = null;
      }
    }, MAX_VISIBLE_MS);
  }, []);

  const show = useCallback(
    (delay = SHOW_DELAY_MS) => {
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (visibleRef.current) {
        // A second navigation started while the overlay was up: keep it up,
        // but re-arm the cap and the URL watch from the current address.
        watchUrl(window.location.href);
        armMax();
        return;
      }
      if (showTimer.current !== null) return;

      const startHref = window.location.href;
      showTimer.current = window.setTimeout(() => {
        showTimer.current = null;
        // The route may have committed during the no-flash delay.
        if (window.location.href !== startHref) return;
        visibleRef.current = true;
        shownAt.current = performance.now();
        setVisible(true);
        watchUrl(startHref);
        armMax();
      }, Math.max(0, delay));
    },
    [armMax, watchUrl]
  );

  // Route committed: hide the overlay and cancel any recovery watchdog.
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    clearWatchdog();
    hide();
  }, [pathname, clearWatchdog, hide]);

  // Programmatic navigations (SearchOverlay, login, live-watch buttons).
  useEffect(() => {
    const onLoaderEvent = (event: Event) => {
      const detail = (event as CustomEvent<PageLoaderDetail>).detail;
      if (!detail) return;
      if (detail.action === "start") {
        show(detail.delay);
        if (detail.href) armWatchdog(detail.href);
      } else {
        clearWatchdog();
        hide();
      }
    };
    window.addEventListener(PAGE_LOADER_EVENT, onLoaderEvent);
    return () => window.removeEventListener(PAGE_LOADER_EVENT, onLoaderEvent);
  }, [armWatchdog, clearWatchdog, hide, show]);

  // Internal link clicks. Capture phase so a handler that stops propagation
  // cannot swallow the transition trigger.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // A control nested inside a card/link is an action, not a navigation.
      if (target.closest("button, input, select, textarea, [role='button']")) {
        return;
      }
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!shouldFollowAnchor(anchor, event)) return;

      show();
      armWatchdog(anchor.href);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [armWatchdog, show]);

  // Chunk-load recovery. Script error events do not bubble, hence capture.
  useEffect(() => {
    const onError = (event: Event) => {
      if (event.target instanceof HTMLScriptElement) {
        if (event.target.src.includes("/_next/")) reloadOnceForChunkFailure();
        return;
      }
      if (
        event instanceof ErrorEvent &&
        isChunkLoadFailure(event.error ?? event.message)
      ) {
        reloadOnceForChunkFailure();
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) reloadOnceForChunkFailure();
    };
    const onPageShow = () => {
      // Back/forward cache restore: nothing is loading any more.
      clearWatchdog();
      hide();
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [clearWatchdog, hide]);

  // Never leave a timer behind (StrictMode mounts effects twice in dev).
  useEffect(
    () => () => {
      clearLoaderTimers();
      clearWatchdog();
    },
    [clearLoaderTimers, clearWatchdog]
  );

  return (
    <div
      className="rh-page-transition"
      data-visible={visible ? "true" : "false"}
      aria-hidden={!visible}
    >
      <div className="rh-page-loadbar" aria-hidden="true">
        <span />
      </div>

      <div className="rh-page-loader" role="status" aria-live="polite">
        <span className="sr-only">Loading Reelhouse</span>

        <svg
          className="rh-loader-defs"
          width="0"
          height="0"
          viewBox="0 0 64 64"
          focusable="false"
          aria-hidden="true"
        >
          <defs>
            {/* REEL — the logo's white. Slightly silver at the bottom so the
                stroke has dimension against the dark plate. */}
            <linearGradient
              id="rhLoaderGradA"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="62"
              x2="0"
              y2="2"
            >
              <stop stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#D6D8D7" />
            </linearGradient>

            {/* HOUSE — sampled from the logo's red (#FB0101), lifted at the top
                so the neon edge reads bright rather than maroon. */}
            <linearGradient
              id="rhLoaderGradC"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="62"
              x2="0"
              y2="2"
            >
              <stop stopColor="#FF3B3B" />
              <stop offset=".55" stopColor="#FB0101" />
              <stop offset="1" stopColor="#C40000" />
            </linearGradient>
          </defs>
        </svg>

        <div className="rh-loader-word" aria-hidden="true">
          {LETTERS.map((letter, index) => (
            <svg
              key={letter.id}
              className={`rh-loader-letter${
                letter.spin ? " rh-loader-letter--spin" : ""
              }${letter.id === "h" ? " rh-loader-letter--house" : ""}`}
              viewBox="0 0 64 64"
              fill="none"
              focusable="false"
              aria-hidden="true"
            >
              {/* Dim silhouette: the full wordmark is readable from the first
                  frame, even while the bright stroke is still being drawn. */}
              <path
                className="rh-loader-base"
                d={letter.d}
                pathLength={360}
                stroke={`url(#rhLoaderGrad${letter.gradient})`}
              />
              {/* Bright trace, redrawn from zero each time the overlay shows. */}
              <path
                d={letter.d}
                pathLength={360}
                stroke={`url(#rhLoaderGrad${letter.gradient})`}
                className={
                  letter.spin
                    ? "rh-loader-trace rh-loader-spin"
                    : "rh-loader-trace"
                }
                style={
                  letter.spin ? undefined : { animationDelay: `${index * 55}ms` }
                }
              />
            </svg>
          ))}
        </div>
      </div>
    </div>
  );
}
