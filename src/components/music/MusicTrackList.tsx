"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MusicTrack } from "@/lib/music/types";
import { formatDuration } from "@/lib/music/utils";
import { toast } from "@/lib/toast";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { useMusicPlayer } from "./MusicPlayerProvider";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  HeartIcon,
  MoreIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  PlusCircleIcon,
  QueueIcon,
  ShareIcon,
  UserIcon,
  XIcon,
} from "./icons";
import MusicArtwork from "./MusicArtwork";

interface TrackListProps {
  tracks: MusicTrack[];
  onPlay: (track: MusicTrack, index: number) => void;
  onOpenCollection?: () => void;
  showAlbum?: boolean;
  showArtwork?: boolean;
  showDateAdded?: boolean;
  addedLabel?: string;
  playlistId?: string;
  onAddToPlaylist?: (track: MusicTrack) => void;
  onGoToArtist?: (track: MusicTrack) => void;
  onGoToAlbum?: (track: MusicTrack) => void;
  onRemoveFromPlaylist?: (track: MusicTrack) => void;
  /** Move a track within a user playlist; index-based. */
  onMoveTrack?: (from: number, to: number) => void;
  compact?: boolean;
  contextLabel?: string;
}

export default function MusicTrackList({
  tracks,
  onPlay,
  showAlbum = true,
  showArtwork = true,
  showDateAdded = false,
  addedLabel = "Recently",
  playlistId,
  onAddToPlaylist,
  onGoToArtist,
  onGoToAlbum,
  onRemoveFromPlaylist,
  onMoveTrack,
  compact = false,
}: TrackListProps) {
  const { currentTrack, isPlaying, toggle } = useMusicPlayer();
  if (tracks.length === 0) return null;

  return (
    <div
      className="music-track-list"
      data-compact={compact || undefined}
      data-album={(!compact && showAlbum) || undefined}
      data-no-art={!showArtwork || undefined}
      data-date={(!compact && showDateAdded) || undefined}
    >
      <div className="music-track-head" aria-hidden="true">
        <span className="music-track-col-index">#</span>
        <span>Title</span>
        {!compact && showAlbum && <span className="music-track-col-album">Album</span>}
        {!compact && showDateAdded && <span className="music-track-col-date">Date added</span>}
        <span className="music-track-col-time">
          <ClockIcon size={15} />
        </span>
        <span className="music-track-col-actions" />
      </div>
      <div role="list">
        {tracks.map((track, index) => {
          const current = currentTrack?.id === track.id;
          const playable =
            track.isStreamable !== false && track.provider !== "spotify";
          return (
            <TrackRow
              key={`${track.id}-${index}`}
              track={track}
              index={index}
              current={current}
              playing={current && isPlaying}
              playable={playable}
              onPlay={() => {
                if (!playable) {
                  toast(
                    "No playable YouTube Music match yet. Re-import the playlist to try matching again."
                  );
                  return;
                }
                if (current) toggle();
                else onPlay(track, index);
              }}
              showAlbum={showAlbum}
              showArtwork={showArtwork}
              showDateAdded={showDateAdded}
              compact={compact}
              addedLabel={addedLabel}
              playlistId={playlistId}
              onAddToPlaylist={onAddToPlaylist}
              onGoToArtist={onGoToArtist}
              onGoToAlbum={onGoToAlbum}
              onRemoveFromPlaylist={onRemoveFromPlaylist}
              onMoveUp={
                onMoveTrack && index > 0
                  ? () => onMoveTrack(index, index - 1)
                  : undefined
              }
              onMoveDown={
                onMoveTrack && index < tracks.length - 1
                  ? () => onMoveTrack(index, index + 1)
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function TrackRow({
  track,
  index,
  current,
  playing,
  playable = true,
  onPlay,
  showAlbum,
  showArtwork,
  showDateAdded,
  compact,
  addedLabel,
  playlistId,
  onAddToPlaylist,
  onGoToArtist,
  onGoToAlbum,
  onRemoveFromPlaylist,
  onMoveUp,
  onMoveDown,
}: {
  track: MusicTrack;
  index: number;
  current: boolean;
  playing: boolean;
  playable?: boolean;
  onPlay: () => void;
  showAlbum: boolean;
  showArtwork: boolean;
  showDateAdded: boolean;
  compact: boolean;
  addedLabel: string;
  playlistId?: string;
  onAddToPlaylist?: (track: MusicTrack) => void;
  onGoToArtist?: (track: MusicTrack) => void;
  onGoToAlbum?: (track: MusicTrack) => void;
  onRemoveFromPlaylist?: (track: MusicTrack) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { isTrackLiked, toggleLike } = useMusicLibrary();
  const { addToQueue } = useMusicPlayer();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const liked = isTrackLiked(track.id);

  function openMenu() {
    const rect = moreRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 300;
    const height = 400;
    setMenu({
      x: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8)),
    });
  }

  return (
    <div
      role="listitem"
      data-current={current || undefined}
      data-unavailable={!playable || undefined}
      className="music-track-row"
      onDoubleClick={onPlay}
    >
      <button
        type="button"
        aria-label={
          playable
            ? playing
              ? `Pause ${track.title}`
              : `Play ${track.title}`
            : `${track.title} is unavailable: no YouTube Music match`
        }
        title={playable ? undefined : "Unavailable: no YouTube Music match yet"}
        onClick={onPlay}
        className="music-track-index"
      >
        {current ? (
          <span className="music-equalizer" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span className="music-row-index">{index + 1}</span>
        )}
        <span className="music-row-play" aria-hidden="true">
          {playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
        </span>
      </button>

      <div className="music-track-title-cell">
        {showArtwork && (
          <MusicArtwork
            src={track.artworkUrl}
            alt=""
            seed={track.id}
            rounded="rounded"
            className="music-track-art"
            iconSize={15}
          />
        )}
        <div className="music-track-title-copy">
          <p className="music-track-title" title={track.title}>
            {track.title}
            {!playable && (
              <span className="music-track-unavailable">Unavailable</span>
            )}
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onGoToArtist?.(track);
            }}
            className="music-track-artist"
            tabIndex={onGoToArtist ? 0 : -1}
          >
            {track.artistName}
          </button>
        </div>
      </div>

      {!compact && showAlbum && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onGoToAlbum?.(track);
          }}
          className="music-track-album"
          title={track.albumTitle || track.title}
        >
          {track.albumTitle || track.title}
        </button>
      )}

      {!compact && showDateAdded && (
        <span className="music-track-date">{addedLabel}</span>
      )}

      <span className="music-track-time">{formatDuration(track.duration)}</span>

      <div className="music-track-actions">
        <button
          type="button"
          aria-label={liked ? `Remove ${track.title} from Liked Songs` : `Save ${track.title} to Liked Songs`}
          title={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
          onClick={(event) => {
            event.stopPropagation();
            toggleLike(track);
          }}
          data-liked={liked || undefined}
          className="music-row-like"
        >
          {liked ? <CheckCircleIcon size={18} /> : <PlusCircleIcon size={18} />}
        </button>
        <button
          ref={moreRef}
          type="button"
          aria-label={`More options for ${track.title}`}
          title="More options"
          onClick={(event) => {
            event.stopPropagation();
            openMenu();
          }}
          className="music-row-more"
        >
          <MoreIcon size={18} />
        </button>
      </div>

      {menu && (
        <TrackMenu
          track={track}
          anchor={menu}
          liked={liked}
          onClose={() => setMenu(null)}
          onPlay={() => {
            setMenu(null);
            onPlay();
          }}
          onLike={() => {
            toggleLike(track);
            setMenu(null);
          }}
          onQueue={(next) => {
            addToQueue(track, next);
            setMenu(null);
          }}
          onAddToPlaylist={
            onAddToPlaylist
              ? () => {
                  setMenu(null);
                  onAddToPlaylist(track);
                }
              : undefined
          }
          onGoToArtist={
            onGoToArtist
              ? () => {
                  setMenu(null);
                  onGoToArtist(track);
                }
              : undefined
          }
          onGoToAlbum={
            onGoToAlbum
              ? () => {
                  setMenu(null);
                  onGoToAlbum(track);
                }
              : undefined
          }
          onRemove={
            onRemoveFromPlaylist
              ? () => {
                  setMenu(null);
                  onRemoveFromPlaylist(track);
                }
              : undefined
          }
          onMoveUp={
            onMoveUp
              ? () => {
                  setMenu(null);
                  onMoveUp();
                }
              : undefined
          }
          onMoveDown={
            onMoveDown
              ? () => {
                  setMenu(null);
                  onMoveDown();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function TrackMenu({
  track,
  anchor,
  liked,
  onClose,
  onPlay,
  onLike,
  onQueue,
  onAddToPlaylist,
  onGoToArtist,
  onGoToAlbum,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  track: MusicTrack;
  anchor: { x: number; y: number };
  liked: boolean;
  onClose: () => void;
  onPlay: () => void;
  onLike: () => void;
  onQueue: (next: boolean) => void;
  onAddToPlaylist?: () => void;
  onGoToArtist?: () => void;
  onGoToAlbum?: () => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${track.title} options`}
      className="music-menu"
      style={{ left: anchor.x, top: anchor.y }}
    >
      <button type="button" role="menuitem" className="music-menu-item" onClick={onPlay}>
        <PlayIcon size={16} /> Play
      </button>
      {onMoveUp && (
        <button type="button" role="menuitem" className="music-menu-item" onClick={onMoveUp}>
          <ArrowRightIcon size={16} style={{ transform: "rotate(-90deg)" }} /> Move up
        </button>
      )}
      {onMoveDown && (
        <button type="button" role="menuitem" className="music-menu-item" onClick={onMoveDown}>
          <ArrowRightIcon size={16} style={{ transform: "rotate(90deg)" }} /> Move down
        </button>
      )}
      <button type="button" role="menuitem" className="music-menu-item" onClick={() => onQueue(true)}>
        <QueueIcon size={16} /> Play next
      </button>
      <button type="button" role="menuitem" className="music-menu-item" onClick={() => onQueue(false)}>
        <MusicNoteIcon size={16} /> Add to queue
      </button>
      <div className="music-menu-separator" />
      <button type="button" role="menuitem" className="music-menu-item" onClick={onLike}>
        <HeartIcon size={16} filled={liked} /> {liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
      </button>
      {onAddToPlaylist && (
        <button type="button" role="menuitem" className="music-menu-item" onClick={onAddToPlaylist}>
          <PlusCircleIcon size={16} />
          Add to playlist
        </button>
      )}
      <div className="music-menu-separator" />
      {onGoToArtist && (
        <button type="button" role="menuitem" className="music-menu-item" onClick={onGoToArtist}>
          <UserIcon size={16} /> Go to artist
        </button>
      )}
      {onGoToAlbum && (
        <button type="button" role="menuitem" className="music-menu-item" onClick={onGoToAlbum}>
          <MusicNoteIcon size={16} /> Go to album
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className="music-menu-item"
        onClick={() => {
          const url = track.permalink
            ? `https://audius.co${track.permalink}`
            : window.location.href;
          void navigator.clipboard?.writeText(url).then(
            () => toast("Link copied to clipboard", { tone: "success" }),
            () => undefined
          );
          onClose();
        }}
      >
        <ShareIcon size={16} /> Copy link
      </button>
      {onRemove && (
        <>
          <div className="music-menu-separator" />
          <button type="button" role="menuitem" className="music-menu-item music-menu-danger" onClick={onRemove}>
            <XIcon size={16} /> Remove from this playlist
          </button>
        </>
      )}
    </div>,
    document.body
  );
}

export function LikedMark() {
  return (
    <span className="music-liked-mark" aria-hidden="true">
      <CheckCircleIcon size={15} />
    </span>
  );
}
