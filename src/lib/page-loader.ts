"use client";

// ---------------------------------------------------------------------------
// Page-loader trigger.
//
// The loader itself (src/components/common/PageLoader.tsx) listens for this
// event, so components that navigate programmatically (router.push/replace)
// can show the same transition a real link click does. Anchor clicks are
// handled by the loader directly and do not need this.
//
// `href` is optional: when supplied, the loader also arms the stuck-navigation
// watchdog for that destination (the recovery path for a wedged client
// router — see PageLoader).
// ---------------------------------------------------------------------------

export const PAGE_LOADER_EVENT = "reelhouse:page-loader";

export interface PageLoaderDetail {
  action: "start" | "stop";
  /** Milliseconds before the overlay appears; omitted uses the default. */
  delay?: number;
  /** Same-origin destination to recover to if the router never commits. */
  href?: string;
}

/** Ask the global loader to appear (after the no-flash delay). */
export function startPageLoader(href?: string, delay?: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PageLoaderDetail>(PAGE_LOADER_EVENT, {
      detail: { action: "start", delay, href },
    })
  );
}

/** Hide the loader immediately (still respects the minimum visible time). */
export function stopPageLoader(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PageLoaderDetail>(PAGE_LOADER_EVENT, {
      detail: { action: "stop" },
    })
  );
}
