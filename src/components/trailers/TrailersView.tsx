"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClapperboardIcon,
  PlayIcon,
  SearchIcon,
  XIcon,
} from "@/components/library/icons";
import { moctaleContentUrl } from "@/lib/moctale";
import {
  ALL_TRAILER_TOPICS,
  filterTrailerItems,
  trailerHref,
} from "@/lib/trailers";
import type { TrailerFeed, TrailerFeedItem, TrailerKind } from "@/types";

const THUMBNAIL_BASE = "https://i.ytimg.com/vi";

function thumbnailUrl(key: string, highQuality: boolean): string {
  return `${THUMBNAIL_BASE}/${key}/${
    highQuality ? "maxresdefault" : "hqdefault"
  }.jpg`;
}

function publishedLabel(item: TrailerFeedItem): string | null {
  const date = item.publishedAt?.slice(0, 10);
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function BubbleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.1 9.1 0 0 1-3.8-.8L3 21l1.9-5a8.1 8.1 0 0 1-.9-3.7 8.4 8.4 0 0 1 8.5-8.3 8.4 8.4 0 0 1 8.5 8.3Z" />
    </svg>
  );
}

function ExternalIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4h6v6M20 4 11 13" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

function CopyIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

function TrailerThumbnail({
  item,
  eager = false,
}: {
  item: TrailerFeedItem;
  eager?: boolean;
}) {
  const [highQualityFailed, setHighQualityFailed] = useState(false);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbnailUrl(item.youtubeKey, !highQualityFailed)}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setHighQualityFailed(true)}
      className="absolute inset-0 h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.015]"
      draggable={false}
    />
  );
}

function PlayBadge() {
  return (
    <span className="pointer-events-none grid h-12 w-12 place-items-center rounded-full border border-white/25 bg-black/55 text-white shadow-[0_8px_28px_rgba(0,0,0,0.5)] backdrop-blur-md transition duration-200 group-hover:scale-105 group-hover:border-white/40 group-hover:bg-accent group-hover:text-accent-ink sm:h-14 sm:w-14">
      <PlayIcon size={21} />
    </span>
  );
}

function TrailerMenu({ item }: { item: TrailerFeedItem }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const youtubeUrl = `https://www.youtube.com/watch?v=${item.youtubeKey}`;
  const moctaleUrl = moctaleContentUrl({
    title: item.title,
    releaseDate: item.year ? `${item.year}-01-01` : undefined,
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(youtubeUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const actionClass =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Trailer options for ${item.title}`}
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.09] bg-white/[0.035] text-white/55 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
      >
        <BubbleIcon />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`Trailer options for ${item.title}`}
          className="absolute right-0 top-12 z-40 w-[260px] rounded-xl border border-white/10 bg-[#171819] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.65)]"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
            Trailer options
          </p>

          {item.detailHref && (
            <Link
              href={item.detailHref}
              onClick={() => setOpen(false)}
              className={actionClass}
            >
              View title
            </Link>
          )}

          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={actionClass}
          >
            Watch on YouTube
            <ExternalIcon />
          </a>

          <a
            href={moctaleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className={actionClass}
          >
            Community on Moctale
            <ExternalIcon />
          </a>

          <button type="button" onClick={copyLink} className={actionClass}>
            <CopyIcon />
            {copied ? "Copied" : "Copy trailer link"}
          </button>
        </div>
      )}
    </div>
  );
}

function TrailerCard({
  item,
  active,
  eager,
  onPlay,
  onStop,
}: {
  item: TrailerFeedItem;
  active: boolean;
  eager: boolean;
  onPlay: (id: string) => void;
  onStop: () => void;
}) {
  const published = publishedLabel(item);

  return (
    <article className="border-b border-white/[0.08] pb-7 last:border-0 last:pb-0">
      <div className="relative aspect-video overflow-hidden rounded-lg border border-white/[0.07] bg-black">
        {active ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${item.youtubeKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={`${item.title} — ${item.trailerName}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => onPlay(item.id)}
            aria-label={`Play ${item.trailerName} for ${item.title}`}
            className="group absolute inset-0 block h-full w-full text-left"
          >
            <TrailerThumbnail item={item} eager={eager} />
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <span className="absolute inset-0 grid place-items-center">
              <PlayBadge />
            </span>
          </button>
        )}
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-snug text-white">
            {item.detailHref ? (
              <Link
                href={item.detailHref}
                className="transition hover:text-accent"
              >
                {item.title}
              </Link>
            ) : (
              item.title
            )}
            <span className="font-normal text-white/40">
              {" "}
              | {item.trailerName}
            </span>
          </h2>
          <p className="mt-1 text-xs text-white/40">
            {[item.official ? "Official trailer" : "Trailer", published]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {active && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.035] px-3 text-[11px] font-semibold text-white/55 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
            >
              <XIcon size={13} />
              Stop
            </button>
          )}
          <TrailerMenu item={item} />
        </div>
      </div>
    </article>
  );
}

function Pagination({
  feed,
  kind,
}: {
  feed: TrailerFeed;
  kind: TrailerKind;
}) {
  if (feed.totalPages <= 1) return null;

  const previous = feed.page > 1 ? trailerHref(kind, feed.page - 1) : null;
  const next =
    feed.page < feed.totalPages ? trailerHref(kind, feed.page + 1) : null;
  const buttonClass =
    "inline-flex h-10 items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.025] px-4 text-sm font-semibold text-white/65 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white";
  const disabledClass =
    "inline-flex h-10 items-center gap-2 rounded-lg border border-white/[0.045] px-4 text-sm font-semibold text-white/25";

  return (
    <nav
      aria-label="Trailer pages"
      className="mt-8 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-6"
    >
      {previous ? (
        <Link href={previous} className={buttonClass}>
          <ChevronLeftIcon size={15} />
          Previous
        </Link>
      ) : (
        <span className={disabledClass}>
          <ChevronLeftIcon size={15} />
          Previous
        </span>
      )}

      {next ? (
        <Link href={next} className={buttonClass}>
          Next
          <ChevronRightIcon size={15} />
        </Link>
      ) : (
        <span className={disabledClass}>
          Next
          <ChevronRightIcon size={15} />
        </span>
      )}
    </nav>
  );
}

export default function TrailersView({
  feed,
  kind,
}: {
  feed: TrailerFeed;
  kind: TrailerKind;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(
    () => filterTrailerItems(feed.items, ALL_TRAILER_TOPICS, query),
    [feed.items, query]
  );

  const filtered = query.trim().length > 0;

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (activeId && !visible.some((item) => item.id === activeId)) {
      setActiveId(null);
    }
  }, [activeId, visible]);

  return (
    <section aria-label="Trailer feed" className="mx-auto w-full max-w-[610px]">
      <div className="flex min-h-11 items-center gap-2">
        {searchOpen ? (
          <form
            role="search"
            onSubmit={(event) => event.preventDefault()}
            className="flex w-full items-center gap-2"
          >
            <div className="relative flex h-11 flex-1 items-center rounded-full border border-white/[0.1] bg-[#111213] pl-4 pr-10 transition focus-within:border-white/25">
              <SearchIcon size={17} className="shrink-0 text-white/40" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") closeSearch();
                }}
                placeholder="Search trailers..."
                aria-label="Search trailers"
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-white placeholder:text-white/35 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear trailer search"
                  className="absolute right-3 grid h-6 w-6 place-items-center rounded-full text-white/35 transition hover:bg-white/[0.07] hover:text-white"
                >
                  <XIcon size={13} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close trailer search"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/[0.1] bg-[#111213] text-white/55 transition hover:border-white/25 hover:text-white"
            >
              <XIcon size={17} />
            </button>
          </form>
        ) : (
            <div className="ml-auto flex items-center gap-2">
              {filtered && (
                <span
                  aria-live="polite"
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35"
                >
                  {visible.length} {visible.length === 1 ? "result" : "results"}
                </span>
              )}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search trailers"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.1] bg-[#111213] text-white/55 transition hover:border-white/25 hover:text-white"
              >
                <SearchIcon size={17} />
              </button>
            </div>
        )}
      </div>

      {visible.length > 0 ? (
        <div className="mt-6 space-y-7">
          {visible.map((item, index) => (
            <TrailerCard
              key={item.id}
              item={item}
              active={activeId === item.id}
              eager={index < 2}
              onPlay={setActiveId}
              onStop={() => setActiveId(null)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#101112]/80 px-6 py-14 text-center">
          <ClapperboardIcon size={30} className="mx-auto text-accent" />
          <h2 className="mt-3 text-sm font-semibold text-white">
            {feed.items.length === 0
              ? "No trailers on this reel"
              : "Nothing matches this cut"}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-white/40">
            {feed.items.length === 0
              ? "This page came back empty. Try the full feed, or check back after the next trailer drop."
              : "Try a different topic or clear the search to see the rest of the feed."}
          </p>
          {feed.items.length === 0 ? (
            <Link
              href={trailerHref("all")}
              className="btn-accent mt-5 h-10 px-5 py-0 text-sm"
            >
              Browse all trailers
            </Link>
          ) : (
            <button
              type="button"
              onClick={closeSearch}
              className="mt-5 inline-flex h-10 items-center rounded-lg border border-white/[0.1] bg-white/[0.035] px-4 text-sm font-semibold text-white/75 transition hover:border-white/25 hover:text-white"
            >
              Clear search
            </button>
          )}
        </div>
      )}

      <Pagination feed={feed} kind={kind} />

    </section>
  );
}
