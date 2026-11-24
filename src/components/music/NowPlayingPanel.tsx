"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type {
  MusicArtist,
  MusicArtistDetail,
  MusicPanelTab,
  MusicTrack,
} from "@/lib/music/types";
import { activeLyricIndex } from "@/lib/music/lrc";
import { colorFor, formatDuration } from "@/lib/music/utils";
import { providerLabel } from "@/lib/music/providers";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { useMusicPlayer, usePlayerProgress } from "./MusicPlayerProvider";
import { useLyrics } from "./useLyrics";
import {
  CheckCircleIcon,
  FullscreenIcon,
  MicIcon,
  MoreIcon,
  MusicNoteIcon,
  NowPlayingIcon,
  PauseIcon,
  PlayIcon,
  PlusCircleIcon,
  QueueIcon,
  XIcon,
} from "./icons";
import MusicArtwork from "./MusicArtwork";

export default function NowPlayingPanel({
  open,
  tab,
  onTab,
  onClose,
  onOpenLyrics,
  onGoToArtist,
  onGoToAlbum,
}: {
  open: boolean;
  tab: MusicPanelTab;
  onTab: (tab: MusicPanelTab) => void;
  onClose: () => void;
  onOpenLyrics: () => void;
  onGoToArtist: (track: MusicTrack) => void;
  onGoToAlbum: (track: MusicTrack) => void;
}) {
  const {
    currentTrack,
    queue,
    currentIndex,
    contextLabel,
    isPlaying,
    toggle,
    playQueue,
    removeFromQueue,
  } = useMusicPlayer();
  const { currentTime } = usePlayerProgress();
  const { lyrics } = useLyrics(currentTrack);
  const {
    isTrackLiked,
    toggleLike,
    isArtistFollowed,
    toggleFollowArtist,
  } = useMusicLibrary();
  const [artistDetail, setArtistDetail] = useState<MusicArtistDetail | null>(null);

  useEffect(() => {
    if (!currentTrack?.artistId) {
      setArtistDetail(null);
      return;
    }
    const controller = new AbortController();
    setArtistDetail(null);
    fetch(`/api/music/artist?id=${encodeURIComponent(currentTrack.artistId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as MusicArtistDetail;
      })
      .then((data) => setArtistDetail(data))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setArtistDetail(null);
      });
    return () => controller.abort();
  }, [currentTrack?.artistId]);

  if (!open) return null;

  const liked = currentTrack ? isTrackLiked(currentTrack.id) : false;
  const artist: MusicArtist | null = artistDetail?.artist
    ? artistDetail.artist
    : currentTrack
      ? {
          id: currentTrack.artistId,
          name: currentTrack.artistName,
          avatarUrl: currentTrack.artistAvatarUrl,
        }
      : null;
  const followed = artist ? isArtistFollowed(artist.id) : false;
  const upcoming = queue.slice(currentIndex + 1).map((track, offset) => ({
    track,
    queueIndex: currentIndex + 1 + offset,
  }));
  const activeLine = lyrics ? activeLyricIndex(lyrics.lines, currentTime) : -1;
  const previewLines = lyrics?.lines.slice(
    Math.max(0, activeLine),
    Math.max(0, activeLine) + 3
  );
  const plainLines = lyrics?.plain?.split(/\r?\n/).filter(Boolean).slice(0, 3) ?? [];
  const accent = currentTrack ? colorFor(currentTrack.id) : "#3a1d1c";
  const lyricsStyle = {
    "--lyrics-bg": `color-mix(in srgb, ${accent} 38%, #34201f)`,
    "--rail-art": currentTrack?.artworkUrl
      ? `url("${currentTrack.artworkUrl}")`
      : "none",
  } as CSSProperties;

  return (
    <aside className="music-right-panel" aria-label="Now playing panel" data-tab={tab}>
      <div className="music-rail-head">
        <span>{tab === "queue" ? "Queue" : contextLabel || "Now playing"}</span>
        <div className="music-rail-head-actions">
          {currentTrack && (
            <button
              type="button"
              onClick={() => onTab(tab === "queue" ? "now-playing" : "queue")}
              aria-label={tab === "queue" ? "Now playing" : "Open queue"}
              title={tab === "queue" ? "Now playing" : "Queue"}
            >
              {tab === "queue" ? <NowPlayingIcon size={18} /> : <QueueIcon size={18} />}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenLyrics}
            disabled={!currentTrack}
            aria-label="Open full-screen lyrics"
            title="Lyrics"
          >
            <FullscreenIcon size={18} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close now playing panel" title="Close">
            <XIcon size={18} />
          </button>
        </div>
      </div>

      {!currentTrack ? (
        <div className="music-rail-empty">
          <MusicNoteIcon size={36} />
          <strong>Nothing playing</strong>
          <span>Choose a track to see its artwork, lyrics and queue here.</span>
        </div>
      ) : tab === "queue" ? (
        <div className="music-rail-scroll music-scroll">
          <p className="music-queue-label">Now playing</p>
          <QueueRow track={currentTrack} current playing={isPlaying} onClick={toggle} />
          <p className="music-queue-label">Next up</p>
          {upcoming.length === 0 ? (
            <p className="music-queue-empty">
              Nothing else is queued. Play an album or playlist to keep listening.
            </p>
          ) : (
            upcoming.map(({ track, queueIndex }) => (
              <QueueRow
                key={`${track.id}-${queueIndex}`}
                track={track}
                playing={false}
                onClick={() => playQueue(queue, queueIndex, contextLabel)}
                onRemove={() => removeFromQueue(queueIndex)}
              />
            ))
          )}
          <p className="music-rail-credit">Queue · Reelhouse Music</p>
        </div>
      ) : (
        <div className="music-rail-scroll music-scroll">
          <div className="music-rail-hero">
            <MusicArtwork
              src={currentTrack.artworkUrl}
              alt={currentTrack.title}
              seed={currentTrack.id}
              rounded="rounded"
              className="music-rail-art"
              iconSize={42}
              priority
              fallbackArtist={currentTrack.artistName}
              fallbackAlbum={currentTrack.albumTitle ?? currentTrack.title}
            />
            <div className="music-rail-hero-shade" />
          </div>

          <div className="music-rail-content">
            <div className="music-rail-track-meta">
              <div>
                <h2>
                  <button type="button" onClick={() => onGoToAlbum(currentTrack)}>
                    {currentTrack.title}
                  </button>
                </h2>
                <button type="button" className="music-rail-artist-link" onClick={() => onGoToArtist(currentTrack)}>
                  {currentTrack.artistName}
                </button>
              </div>
              <button
                type="button"
                className="music-rail-like"
                onClick={() => toggleLike(currentTrack)}
                data-liked={liked || undefined}
                aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
                title={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
              >
                {liked ? <CheckCircleIcon size={26} /> : <PlusCircleIcon size={26} />}
              </button>
            </div>
            <button
              type="button"
              className="music-lyrics-preview"
              onClick={onOpenLyrics}
              style={lyricsStyle}
            >
              <span className="music-lyrics-preview-head">
                <span>Lyrics preview</span>
                <MicIcon size={17} />
              </span>
              {previewLines && previewLines.length > 0
                ? previewLines.map((line, index) => (
                    <span key={`${line.time}-${index}`} className="music-lyrics-preview-line">
                      {line.text}
                    </span>
                  ))
                : plainLines.length > 0
                  ? plainLines.map((line, index) => (
                      <span key={index} className="music-lyrics-preview-line">
                        {line}
                      </span>
                    ))
                  : (
                    <span className="music-lyrics-preview-empty">
                      {lyrics?.instrumental ? "Instrumental" : "Lyrics are not available for this track yet."}
                    </span>
                  )}
            </button>

            {artist && (
              <section className="music-rail-card music-rail-artist-card">
                <div className="music-rail-artist-head">
                  <MusicArtwork
                    src={artist.avatarUrl}
                    alt={artist.name}
                    seed={artist.id}
                    rounded="rounded-full"
                    className="music-rail-artist-avatar"
                    iconSize={16}
                  />
                  <div className="min-w-0">
                    <h3>{artist.name}</h3>
                    <span>
                      {artist.followers != null
                        ? `${artist.followers.toLocaleString("en-US")} monthly listeners`
                        : "Artist"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="music-rail-follow"
                    onClick={() => toggleFollowArtist(artist)}
                    data-following={followed || undefined}
                  >
                    {followed ? "Following" : "Follow"}
                  </button>
                </div>
                {artistDetail?.artist.bio && (
                  <p className="music-rail-bio">{artistDetail.artist.bio.slice(0, 320)}</p>
                )}
              </section>
            )}

            <section className="music-rail-card music-rail-credits">
              <div className="music-rail-card-head">
                <h3>Credits</h3>
                <span>Show all</span>
              </div>
              <div className="music-credit-row">
                <div>
                  <strong>{currentTrack.artistName}</strong>
                  <span>Main Artist</span>
                </div>
                {artist && (
                  <button type="button" onClick={() => toggleFollowArtist(artist)}>
                    {followed ? "Following" : "Follow"}
                  </button>
                )}
              </div>
              <div className="music-credit-row">
                <div>
                  <strong>{currentTrack.albumTitle || "Single"}</strong>
                  <span>Album</span>
                </div>
                <button type="button" onClick={() => onGoToAlbum(currentTrack)}>
                  View
                </button>
              </div>
            </section>

            <section className="music-rail-card music-rail-next">
              <div className="music-rail-card-head">
                <h3>Next in queue</h3>
                <button type="button" onClick={() => onTab("queue")}>
                  Open queue
                </button>
              </div>
              {upcoming.length === 0 ? (
                <p className="music-rail-next-empty">Nothing else is queued.</p>
              ) : (
                upcoming.slice(0, 2).map(({ track, queueIndex }) => (
                  <button
                    type="button"
                    key={`${track.id}-${queueIndex}`}
                    className="music-rail-next-row"
                    onClick={() => playQueue(queue, queueIndex, contextLabel)}
                  >
                    <MusicArtwork
                      src={track.artworkUrl}
                      alt=""
                      seed={track.id}
                      className="music-rail-next-art"
                      iconSize={13}
                    />
                    <span className="min-w-0">
                      <strong>{track.title}</strong>
                      <span>{track.artistName}</span>
                    </span>
                    <MoreIcon size={17} />
                  </button>
                ))
              )}
            </section>

            <p className="music-rail-credit">Catalog by {providerLabel(currentTrack.provider)} · Lyrics by LRCLIB</p>
          </div>
        </div>
      )}
    </aside>
  );
}

function QueueRow({
  track,
  playing,
  current = false,
  onClick,
  onRemove,
}: {
  track: MusicTrack;
  playing: boolean;
  current?: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="music-queue-row" data-current={current || undefined}>
      <button type="button" onClick={onClick} className="music-queue-art-button">
        <MusicArtwork
          src={track.artworkUrl}
          alt=""
          seed={track.id}
          className="music-queue-art"
          iconSize={14}
        />
        <span className="music-queue-hover">
          {playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
        </span>
      </button>
      <button type="button" className="music-queue-copy" onClick={onClick}>
        <strong>{track.title}</strong>
        <span>{track.artistName}</span>
      </button>
      <span className="music-queue-time">{formatDuration(track.duration)}</span>
      {onRemove && (
        <button
          type="button"
          className="music-queue-remove"
          onClick={onRemove}
          aria-label={`Remove ${track.title} from queue`}
        >
          <XIcon size={15} />
        </button>
      )}
    </div>
  );
}

