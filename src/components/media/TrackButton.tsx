"use client";

import { useEffect } from "react";
import { track as trackAnalytics } from "@vercel/analytics";
import { BellIcon } from "@/components/library/icons";
import {
  refreshTrackedSnapshot,
  toggleTracked,
  useIsTracked,
} from "@/lib/library";
import { isTrackableType } from "@/lib/tracking";
import { toast } from "@/lib/toast";
import type { MediaSummary } from "@/types";

// The first-class follow control. Before this existed the only way to follow a
// series was the "Track series" row buried inside Add to list, and the empty
// state told people to tap a bell that did not exist. This is that bell.

export type TrackButtonVariant = "hero" | "dock" | "icon" | "pill";

export default function TrackButton({
  item,
  variant = "icon",
  surface,
}: {
  item: MediaSummary;
  variant?: TrackButtonVariant;
  /** Analytics dimension, e.g. "detail" / "calendar" / "card". */
  surface?: string;
}) {
  const tracked = useIsTracked(item.id);

  // A detail page carries the resolved TMDB twin for anime, while a listing
  // card may not. Refresh the followed snapshot so calendar matching starts
  // working as soon as the title page is opened.
  useEffect(() => {
    if (tracked) refreshTrackedSnapshot(item);
  }, [tracked, item.id, item.title, item.posterUrl, item.resolvedTmdbId]);

  if (!isTrackableType(item.type)) return null;

  const label = tracked
    ? `Stop following ${item.title}`
    : `Follow ${item.title} for new episodes`;

  const handle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const next = toggleTracked(item);
    toast(
      next
        ? `Following ${item.title} — new episodes will appear in your calendar.`
        : `Stopped following ${item.title}.`,
      { tone: next ? "success" : "default" }
    );
    trackAnalytics("tracking_toggle", {
      type: item.type,
      tracked: next,
      surface: surface ?? variant,
    });
  };

  const icon = (
    <BellIcon
      size={variant === "hero" ? 19 : variant === "pill" ? 15 : 14}
      fill={tracked ? "currentColor" : "none"}
    />
  );

  if (variant === "hero") {
    return (
      <button
        type="button"
        onClick={handle}
        aria-pressed={tracked}
        aria-label={label}
        title={tracked ? "Following" : "Follow"}
        className={`grid h-11 w-11 place-items-center rounded-[10px] border backdrop-blur transition sm:h-[54px] sm:w-[54px] ${
          tracked
            ? "border-accent bg-accent text-accent-ink"
            : "border-white/25 bg-white/[0.04] text-white hover:border-white/45 hover:bg-white/10"
        }`}
      >
        {icon}
      </button>
    );
  }

  if (variant === "dock") {
    return (
      <button
        type="button"
        onClick={handle}
        aria-pressed={tracked}
        aria-label={label}
        title={tracked ? "Following" : "Follow"}
        className={`inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] transition-colors hover:bg-white/[0.09] sm:h-[42px] sm:w-[42px] ${
          tracked ? "text-accent" : "text-[hsl(150_3%_62%)] hover:text-foreground"
        }`}
      >
        {icon}
      </button>
    );
  }

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={handle}
        aria-pressed={tracked}
        aria-label={label}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
          tracked
            ? "border-accent bg-accent text-accent-ink"
            : "border-white/15 bg-white/[0.04] text-text hover:border-white/30 hover:bg-white/[0.08]"
        }`}
      >
        {icon}
        {tracked ? "Following" : "Follow"}
      </button>
    );
  }

  // Poster-corner chip: same 32px footprint as the reference bookmark.
  return (
    <button
      type="button"
      onClick={handle}
      aria-pressed={tracked}
      aria-label={label}
      title={tracked ? "Following" : "Follow"}
      className={`grid h-8 w-8 place-items-center rounded-md ring-1 ring-inset backdrop-blur transition ${
        tracked
          ? "bg-accent text-accent-ink ring-accent"
          : "bg-black/50 text-white ring-white/10 hover:bg-black/70 hover:ring-white/30"
      }`}
    >
      {icon}
    </button>
  );
}
