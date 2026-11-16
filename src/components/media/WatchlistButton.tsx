"use client";

import { useState } from "react";
import AddToListDialog from "@/components/library/AddToListDialog";
import { useIsInWatchlist } from "@/lib/library";
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
  variant?: "icon" | "hero" | "dock";
}) {
  const inList = useIsInWatchlist(item.id);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = inList
    ? `Manage lists for ${item.title}`
    : `Add ${item.title} to a list`;

  const handle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setAnchor(e.currentTarget);
    setOpen(true);
  };

  const dialog = open ? (
    <AddToListDialog
      item={item}
      anchor={anchor}
      onClose={() => setOpen(false)}
    />
  ) : null;

  // Watch-page control dock: a 38/42px square like its neighbours.
  if (variant === "dock") {
    return (
      <>
        <button
          type="button"
          onClick={handle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label}
          title="Add to List"
          className={`inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] transition-colors hover:bg-white/[0.09] sm:h-[42px] sm:w-[42px] ${
            inList ? "text-accent hover:text-accent" : "text-[hsl(150_3%_62%)] hover:text-foreground"
          }`}
        >
          {inList ? <CheckIcon /> : <PlusIcon />}
        </button>
        {dialog}
      </>
    );
  }

  if (variant === "hero") {
    // Hero row: 48px dark circle matching the Watch Now / More Info height.
    return (
      <>
        <button
          type="button"
          onClick={handle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label}
          title="Add to List"
          className={`grid h-11 w-11 place-items-center rounded-lg border backdrop-blur transition sm:h-12 sm:w-12 ${
            inList
              ? "border-accent bg-accent text-accent-ink"
              : "border-white/15 bg-black/25 text-white hover:border-white/40"
          }`}
        >
          {inList ? <CheckIcon /> : <PlusIcon />}
        </button>
        {dialog}
      </>
    );
  }

  // Poster-corner chip (reference card bookmark): 32px translucent square.
  return (
    <>
      <button
        type="button"
        onClick={handle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title="Add to List"
        className={`grid h-8 w-8 place-items-center rounded-md ring-1 ring-inset backdrop-blur transition ${
          inList
            ? "bg-accent text-accent-ink ring-accent"
            : "bg-black/50 text-white ring-white/10 hover:bg-black/70 hover:ring-white/30"
        }`}
      >
        {inList ? <CheckIcon /> : <PlusIcon />}
      </button>
      {dialog}
    </>
  );
}
