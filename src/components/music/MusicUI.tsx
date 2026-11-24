"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import type {
  MusicArtist,
  MusicBrowseCategory,
  MusicCollection,
  MusicTrack,
} from "@/lib/music/types";
import { colorFor, formatTrackCount } from "@/lib/music/utils";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HeartIcon,
  PauseIcon,
  PlayIcon,
} from "./icons";
import MusicArtwork from "./MusicArtwork";

export function IconButton({
  label,
  onClick,
  children,
  active = false,
  className = "",
  size = 40,
  disabled = false,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
  className?: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{ width: size, height: size }}
      className={`grid shrink-0 place-items-center rounded-full transition hover:bg-white/10 active:scale-95 disabled:opacity-40 ${
        active ? "text-[#1ed760]" : "text-white/65 hover:text-white"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function PlayCircle({
  playing = false,
  loading = false,
  onClick,
  size = 48,
  label,
}: {
  playing?: boolean;
  loading?: boolean;
  onClick: () => void;
  size?: number;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-[#1ed760] text-black shadow-[0_8px_16px_rgba(0,0,0,0.35)] transition duration-150 hover:scale-105 hover:bg-[#3be477] active:scale-95"
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="music-spin block rounded-full border-2 border-black/30 border-t-black"
          style={{ width: size * 0.34, height: size * 0.34 }}
        />
      ) : playing ? (
        <PauseIcon size={size * 0.42} />
      ) : (
        <PlayIcon size={size * 0.42} />
      )}
    </button>
  );
}

export function Shelf({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(320, rail.clientWidth * 0.8), behavior: "smooth" });
  };
  return (
    <section className={`music-shelf mb-7 ${className}`}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-[22px] font-bold tracking-[-0.02em] text-white">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 truncate text-[13px] text-white/55">{subtitle}</p>
          )}
        </div>
        {action ?? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={`Scroll ${title} left`}
              onClick={() => scroll(-1)}
              className="music-shelf-arrow left-0 -translate-x-1/2"
            >
              <ChevronLeftIcon size={18} />
            </button>
            <button
              type="button"
              aria-label={`Scroll ${title} right`}
              onClick={() => scroll(1)}
              className="music-shelf-arrow right-0 translate-x-1/2"
            >
              <ChevronRightIcon size={18} />
            </button>
          </div>
        )}
      </div>
      <div ref={railRef} className="music-shelf-rail">
        {children}
      </div>
    </section>
  );
}

export function ShelfCard({
  title,
  subtitle,
  artworkUrl,
  seed,
  round = false,
  onOpen,
  onPlay,
  playing = false,
  playLabel,
  badge,
  fallbackArtist,
  fallbackAlbum,
}: {
  title: string;
  subtitle: string;
  artworkUrl?: string;
  seed?: string;
  round?: boolean;
  onOpen: () => void;
  onPlay?: () => void;
  playing?: boolean;
  playLabel?: string;
  badge?: ReactNode;
  fallbackArtist?: string;
  fallbackAlbum?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="music-card group cursor-pointer outline-none"
    >
      <div className="relative mb-3 aspect-square w-full">
        <MusicArtwork
          src={artworkUrl}
          alt={title}
          seed={seed || title}
          rounded={round ? "rounded-full" : "rounded-md"}
          className="h-full w-full shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          priority={false}
          fallbackArtist={fallbackArtist}
          fallbackAlbum={fallbackAlbum}
        />
        {badge}
        {onPlay && (
          <button
            type="button"
            aria-label={playLabel || `Play ${title}`}
            onClick={(event) => {
              event.stopPropagation();
              onPlay();
            }}
            className="music-card-play"
          >
            {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </button>
        )}
      </div>
      <p className="line-clamp-1 text-[15px] font-semibold leading-snug text-white">
        {title}
      </p>
      <p className="mt-1 line-clamp-2 min-h-[2.4em] text-[13px] leading-snug text-white/55">
        {subtitle}
      </p>
    </div>
  );
}

export function TrackShelfCard({
  track,
  onOpen,
  onPlay,
  playing,
}: {
  track: MusicTrack;
  onOpen: () => void;
  onPlay: () => void;
  playing: boolean;
}) {
  return (
    <ShelfCard
      title={track.title}
      subtitle={track.artistName}
      artworkUrl={track.artworkUrl}
      seed={track.id}
      onOpen={onOpen}
      onPlay={onPlay}
      playing={playing}
      playLabel={`Play ${track.title} by ${track.artistName}`}
      fallbackArtist={track.artistName}
      fallbackAlbum={track.albumTitle ?? track.title}
    />
  );
}

export function CollectionShelfCard({
  collection,
  onOpen,
  onPlay,
  playing,
}: {
  collection: MusicCollection;
  onOpen: () => void;
  onPlay: () => void;
  playing: boolean;
}) {
  return (
    <ShelfCard
      title={collection.title}
      subtitle={
        collection.description ||
        `${collection.ownerName} · ${formatTrackCount(collection.trackCount)}`
      }
      artworkUrl={collection.artworkUrl}
      seed={collection.id}
      onOpen={onOpen}
      onPlay={onPlay}
      playing={playing}
      playLabel={`Play ${collection.title}`}
      fallbackArtist={
        collection.kind === "album" ? collection.ownerName : undefined
      }
      fallbackAlbum={collection.kind === "album" ? collection.title : undefined}
    />
  );
}

export function ArtistShelfCard({
  artist,
  onOpen,
  onPlay,
}: {
  artist: MusicArtist;
  onOpen: () => void;
  onPlay?: () => void;
}) {
  return (
    <ShelfCard
      title={artist.name}
      subtitle="Artist"
      artworkUrl={artist.avatarUrl}
      seed={artist.id}
      round
      onOpen={onOpen}
      onPlay={onPlay}
      playLabel={`Play ${artist.name}`}
    />
  );
}

export function RecentTile({
  title,
  subtitle,
  artworkUrl,
  seed,
  onOpen,
  onPlay,
  playing,
}: {
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  seed?: string;
  onOpen: () => void;
  onPlay: () => void;
  playing: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="music-recent-tile group relative w-full min-w-0 cursor-pointer outline-none"
    >
      <MusicArtwork
        src={artworkUrl}
        alt={title}
        seed={seed || title}
        rounded="rounded-none"
        className="h-20 w-20 shrink-0"
        iconSize={22}
      />
      <div className="min-w-0 flex-1 px-4">
        <p className="truncate text-[14px] font-semibold text-white">{title}</p>
        {subtitle && <p className="mt-1 truncate text-[12px] text-white/50">{subtitle}</p>}
      </div>
      <button
        type="button"
        aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
        className="mr-4 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1ed760] text-black opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100 hover:scale-105"
      >
        {playing ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
      </button>
    </div>
  );
}

export function CategoryCard({
  category,
  onClick,
}: {
  category: MusicBrowseCategory;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="music-category-card text-left"
      style={{ background: category.color }}
    >
      <span className="relative z-[1] block max-w-[74%] text-[20px] font-bold leading-tight tracking-[-0.02em] text-white">
        {category.title}
      </span>
      {category.coverUrl ? (
        <span className="music-category-art">
          <MusicArtwork
            src={category.coverUrl}
            alt=""
            seed={category.id}
            rounded="rounded-sm"
            className="h-full w-full"
            iconSize={20}
          />
        </span>
      ) : (
        <span
          className="absolute -bottom-3 -right-2 h-24 w-24 rotate-[25deg] rounded"
          style={{ background: colorFor(category.id) }}
        />
      )}
    </button>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="truncate text-2xl font-bold tracking-[-0.025em] text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] text-white/55">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  copy,
  action,
}: {
  icon?: ReactNode;
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center">
      {icon && <div className="mb-4 text-white/40">{icon}</div>}
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">{copy}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ShelfSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="music-shelf music-shelf-skeleton">
      <div className="music-skeleton h-7 w-44 rounded" />
      <div className="music-skeleton-rail">
        {Array.from({ length: cards }).map((_, index) => (
          <div key={index}>
            <div className="music-skeleton aspect-square rounded-md" />
            <div className="music-skeleton mt-3 h-4 w-3/4 rounded" />
            <div className="music-skeleton mt-2 h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuickPickTile({
  title,
  artworkUrl,
  seed,
  round = false,
  liked = false,
  onOpen,
  onPlay,
  playing = false,
}: {
  title: string;
  artworkUrl?: string;
  seed: string;
  round?: boolean;
  liked?: boolean;
  onOpen: () => void;
  onPlay?: () => void;
  playing?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="music-quick-tile"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      {liked ? (
        <span className="music-quick-art music-quick-liked" aria-hidden="true">
          <HeartIcon size={23} filled />
        </span>
      ) : (
        <MusicArtwork
          src={artworkUrl}
          alt=""
          seed={seed}
          rounded={round ? "rounded-full" : "rounded"}
          className="music-quick-art"
          iconSize={18}
        />
      )}
      <span className="music-quick-title">{title}</span>
      {onPlay && (
        <button
          type="button"
          className="music-quick-play"
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          onClick={(event) => {
            event.stopPropagation();
            onPlay();
          }}
        >
          {playing ? <PauseIcon size={19} /> : <PlayIcon size={19} />}
        </button>
      )}
    </div>
  );
}

export function FeaturedCollectionCard({
  title,
  description,
  artworkUrl,
  seed,
  eyebrow = "Playlist",
  onOpen,
  onPlay,
  playing = false,
}: {
  title: string;
  description?: string;
  artworkUrl?: string;
  seed: string;
  eyebrow?: string;
  onOpen: () => void;
  onPlay: () => void;
  playing?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="music-featured-card"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <MusicArtwork
        src={artworkUrl}
        alt={title}
        seed={seed}
        className="music-featured-art"
        iconSize={34}
      />
      <div className="music-featured-copy">
        <span className="music-featured-eyebrow">{eyebrow}</span>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
        <button
          type="button"
          className="music-featured-play"
          onClick={(event) => {
            event.stopPropagation();
            onPlay();
          }}
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        >
          {playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
        </button>
      </div>
    </div>
  );
}

export function RecentArtworkCard({
  title,
  artworkUrl,
  seed,
  onOpen,
  onPlay,
  playing = false,
}: {
  title: string;
  artworkUrl?: string;
  seed: string;
  onOpen: () => void;
  onPlay: () => void;
  playing?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="music-recent-art-card"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <MusicArtwork
        src={artworkUrl}
        alt={title}
        seed={seed}
        rounded="rounded"
        className="music-recent-art"
        iconSize={24}
      />
      <div className="music-recent-art-shade" />
      <span className="music-recent-art-title">{title}</span>
      <button
        type="button"
        aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
        className="music-recent-art-play"
      >
        {playing ? <PauseIcon size={19} /> : <PlayIcon size={19} />}
      </button>
    </div>
  );
}
