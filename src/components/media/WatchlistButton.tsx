"use client";

import { toggleWatchlist, useIsInWatchlist } from "@/lib/library";
import type { MediaSummary } from "@/types";

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export default function WatchlistButton({
  item,
  variant = "icon",
}: {
  item: MediaSummary;
  variant?: "icon" | "full";
}) {
  const inList = useIsInWatchlist(item.id);

  const handle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWatchlist(item);
  };

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={handle}
        aria-pressed={inList}
        className={`btn-ghost ${inList ? "text-accent" : ""}`}
      >
        {inList ? <CheckIcon /> : <PlusIcon />}
        {inList ? "In My List" : "My List"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      aria-pressed={inList}
      aria-label={inList ? `Remove ${item.title} from My List` : `Add ${item.title} to My List`}
      title={inList ? "Remove from My List" : "Add to My List"}
      className={`grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition ${
        inList
          ? "border-accent bg-accent text-accent-ink"
          : "border-white/30 bg-black/50 text-white hover:border-accent hover:text-accent"
      }`}
    >
      {inList ? <CheckIcon /> : <PlusIcon />}
    </button>
  );
}
