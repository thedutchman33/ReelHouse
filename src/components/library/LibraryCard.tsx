"use client";

import Link from "next/link";
import PosterImage from "@/components/media/PosterImage";
import {
  BookmarkIcon,
  CheckIcon,
  StarIcon,
  XIcon,
} from "@/components/library/icons";
import { formatRating, yearOf } from "@/lib/utils";
import type { MediaSummary } from "@/types";

/**
 * Reference My List poster card.
 *
 * Unlike the shared catalog card, My List cards are poster-only on desktop:
 * the top-left corner carries two persistent actions — Watchlist bookmark and
 * Watched check — and the top-right carries the title's rating. There is no
 * three-dot menu. The title grid's Edit control reveals a remove action; every
 * other mutation lives on the title page.
 */
export default function LibraryCard({
  item,
  watched,
  inWatchlist,
  editing = false,
  onAddToList,
  onToggleWatched,
  onRemove,
}: {
  item: MediaSummary;
  watched: boolean;
  inWatchlist: boolean;
  editing?: boolean;
  onAddToList: (anchor: HTMLElement) => void;
  onToggleWatched: () => void;
  onRemove?: () => void;
}) {
  const href = `/${item.type}/${item.tmdbId}`;
  const rating = formatRating(item.rating);
  const year = yearOf(item.releaseDate);
  const kind =
    item.type === "movie"
      ? "Film"
      : item.type === "tv"
        ? "Series"
        : item.type === "anime"
          ? "Anime"
          : "";

  return (
    <div className="group relative w-full">
      <div className="poster-frame">
        <Link
          href={href}
          prefetch={false}
          aria-label={item.title}
          className="absolute inset-0 z-0 block focus-visible:outline-none"
        >
          <PosterImage
            src={item.posterUrl}
            title={item.title}
            type={item.type}
            className="poster-img"
          />
        </Link>

        <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(event) => onAddToList(event.currentTarget)}
            aria-haspopup="dialog"
            aria-label={`Add ${item.title} to a list`}
            title="Add to List"
            className={`grid h-8 w-8 place-items-center rounded-md border shadow-lg backdrop-blur transition ${
              inWatchlist
                ? "border-accent bg-accent text-white hover:bg-accent-strong"
                : "border-white/15 bg-black/60 text-white/85 hover:border-white/35 hover:bg-black/80"
            }`}
          >
            <BookmarkIcon
              size={15}
              fill={inWatchlist ? "currentColor" : "none"}
            />
          </button>

          <button
            type="button"
            onClick={onToggleWatched}
            aria-label={watched ? `Mark ${item.title} as not watched` : `Mark ${item.title} as watched`}
            aria-pressed={watched}
            title={watched ? "Watched" : "Mark as watched"}
            className={`grid h-8 w-8 place-items-center rounded-full border shadow-lg backdrop-blur transition ${
              watched
                ? "border-accent bg-accent text-white hover:bg-accent-strong"
                : "border-white/10 bg-black/45 text-white/90 hover:border-white/30 hover:bg-black/70"
            }`}
          >
            <CheckIcon size={16} />
          </button>
        </div>

        {rating && (
          <span className="pointer-events-none absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[12px] font-bold text-white ring-1 ring-inset ring-white/10 backdrop-blur-sm">
            <StarIcon size={13} className="text-amber-400" />
            {rating}
          </span>
        )}

        {editing && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="absolute inset-x-2 bottom-2 z-20 inline-flex items-center justify-center gap-1.5 rounded-md bg-danger px-2 py-1.5 text-xs font-semibold text-white shadow-lg transition hover:bg-danger/85"
          >
            <XIcon size={13} />
            Remove
          </button>
        )}
      </div>

      <div className="mt-2 hidden px-0.5 [@media(hover:none),(pointer:coarse)]:block">
        <h3 className="truncate font-sans text-[13px] font-semibold leading-snug text-text">
          {item.title}
        </h3>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {[year, kind, item.genres[0]].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );
}
