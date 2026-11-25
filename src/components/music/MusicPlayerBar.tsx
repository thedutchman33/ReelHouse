"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { MusicPanelTab, MusicTrack } from "@/lib/music/types";
import { formatDuration } from "@/lib/music/utils";
import { toast } from "@/lib/toast";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { useMusicPlayer, usePlayerProgress } from "./MusicPlayerProvider";
import {
  CheckCircleIcon,
  MicIcon,
  NextIcon,
  NowPlayingIcon,
  PauseIcon,
  PlayIcon,
  PlusCircleIcon,
  PreviousIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
  VolumeIcon,
} from "./icons";
import MusicArtwork from "./MusicArtwork";

function rangeStyle(percent: number): CSSProperties {
  return { "--value": `${Math.max(0, Math.min(100, percent))}%` } as CSSProperties;
}

export default function MusicPlayerBar({
  panelOpen,
  panelTab,
  lyricsOpen,
  onOpenPanel,
  onAddToPlaylist,
  onGoToArtist,
}: {
  panelOpen: boolean;
  panelTab: MusicPanelTab;
  lyricsOpen: boolean;
  onOpenPanel: (tab: MusicPanelTab) => void;
  onAddToPlaylist?: (track: MusicTrack) => void;
  onGoToArtist?: () => void;
}) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    playError,
    volume,
    muted,
    shuffle,
    repeat,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
  } = useMusicPlayer();
  const { currentTime, duration } = usePlayerProgress();
  const { isTrackLiked, toggleLike } = useMusicLibrary();
  const errorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!playError) {
      errorRef.current = null;
      return;
    }
    const key = `${currentTrack?.id}:${playError}`;
    if (errorRef.current === key) return;
    errorRef.current = key;
    toast(playError);
  }, [playError, currentTrack?.id]);

  const liked = currentTrack ? isTrackLiked(currentTrack.id) : false;
  const total = duration || currentTrack?.duration || 0;
  const progressPercent = total > 0 ? (currentTime / total) * 100 : 0;
  const volumePercent = muted ? 0 : volume * 100;
  const repeatOn = repeat !== "off";

  return (
    <footer className="music-player" aria-label="Music player">
      <div className="music-player-track">
        {currentTrack ? (
          <>
            <button
              type="button"
              onClick={() => onOpenPanel("now-playing")}
              className="music-player-art-button"
              aria-label="Open now playing view"
            >
              <MusicArtwork
                src={currentTrack.artworkUrl}
                alt={currentTrack.title}
                seed={currentTrack.id}
                className="music-player-art"
                iconSize={20}
              />
            </button>
            <div className="music-player-track-copy">
              <div className="music-player-title-row">
                <button type="button" onClick={() => onOpenPanel("now-playing")} title={currentTrack.title}>
                  {currentTrack.title}
                </button>
                <button
                  type="button"
                  className="music-player-like"
                  onClick={() => toggleLike(currentTrack)}
                  aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
                  title={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
                  data-liked={liked || undefined}
                >
                  {liked ? <CheckCircleIcon size={17} /> : <PlusCircleIcon size={17} />}
                </button>
              </div>
              <button
                type="button"
                onClick={onGoToArtist}
                disabled={!onGoToArtist}
                className="music-player-artist"
              >
                {currentTrack.artistName}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="music-player-art-empty">
              <NowPlayingIcon size={23} />
            </span>
            <div className="music-player-track-copy">
              <p className="music-player-nothing">Nothing playing</p>
              <p className="music-player-choose">Choose something to play</p>
            </div>
          </>
        )}
      </div>

      <div className="music-player-center">
        <div className="music-player-controls">
          <button
            type="button"
            aria-label="Toggle shuffle"
            title={shuffle ? "Disable shuffle" : "Enable shuffle"}
            aria-pressed={shuffle}
            data-active={shuffle || undefined}
            onClick={toggleShuffle}
            className="music-player-small"
          >
            <ShuffleIcon size={16} />
          </button>
          <button
            type="button"
            aria-label="Previous track"
            title="Previous"
            onClick={previous}
            disabled={!currentTrack}
            className="music-player-small"
          >
            <PreviousIcon size={18} />
          </button>
          <button
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause" : "Play"}
            onClick={toggle}
            disabled={!currentTrack}
            className="music-player-circle"
          >
            {isLoading ? (
              <span className="music-spin music-player-spinner" />
            ) : isPlaying ? (
              <PauseIcon size={15} />
            ) : (
              <PlayIcon size={15} />
            )}
          </button>
          <button
            type="button"
            aria-label="Next track"
            title="Next"
            onClick={next}
            disabled={!currentTrack}
            className="music-player-small"
          >
            <NextIcon size={18} />
          </button>
          <button
            type="button"
            aria-label="Change repeat mode"
            title={repeat === "one" ? "Repeat one" : repeat === "all" ? "Repeat all" : "Enable repeat"}
            aria-pressed={repeatOn}
            data-active={repeatOn || undefined}
            onClick={cycleRepeat}
            className="music-player-small"
          >
            <RepeatIcon size={16} one={repeat === "one"} />
          </button>
        </div>
        <div className="music-player-progress">
          <span className="music-player-time">{formatDuration(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(total, 1)}
            step={0.1}
            value={Math.min(currentTime, Math.max(total, 1))}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Playback position"
            className="music-range"
            style={rangeStyle(progressPercent)}
            disabled={!currentTrack}
          />
          <span className="music-player-time">{currentTrack ? formatDuration(total) : "0:00"}</span>
        </div>
      </div>

      <div className="music-player-side">
        <button
          type="button"
          aria-label="Lyrics"
          title="Lyrics"
          onClick={() => onOpenPanel("lyrics")}
          data-active={lyricsOpen || undefined}
          className="music-player-small"
        >
          <MicIcon size={17} />
        </button>
        <button
          type="button"
          aria-label="Queue"
          title="Queue"
          onClick={() => onOpenPanel("queue")}
          data-active={(panelOpen && panelTab === "queue") || undefined}
          className="music-player-small"
        >
          <QueueIcon size={17} />
        </button>
        <button
          type="button"
          aria-label="Add to playlist"
          title="Add to playlist"
          onClick={() => currentTrack && onAddToPlaylist?.(currentTrack)}
          disabled={!currentTrack || !onAddToPlaylist}
          className="music-player-small"
        >
          <PlusCircleIcon size={17} />
        </button>
        <div className="music-player-volume">
          <button
            type="button"
            aria-label={muted ? "Unmute" : "Mute"}
            title={muted ? "Unmute" : "Mute"}
            onClick={toggleMute}
            className="music-player-small"
          >
            <VolumeIcon size={18} muted={muted || volume === 0} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Volume"
            className="music-range music-volume"
            style={rangeStyle(volumePercent)}
          />
        </div>
        <button
          type="button"
          aria-label="Open the expanded now playing view"
          title="Now playing view"
          onClick={() => onOpenPanel("now-playing")}
          data-active={(panelOpen && panelTab === "now-playing") || undefined}
          className="music-player-small music-player-fullscreen"
        >
          <NowPlayingIcon size={17} />
        </button>
      </div>

      <div className="music-player-mobile">
        <button
          type="button"
          aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
          onClick={() => currentTrack && toggleLike(currentTrack)}
          data-liked={liked || undefined}
          className="music-player-mobile-like"
          disabled={!currentTrack}
        >
          {liked ? <CheckCircleIcon size={19} /> : <PlusCircleIcon size={19} />}
        </button>
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={toggle}
          disabled={!currentTrack}
          className="music-player-mobile-play"
        >
          {isLoading ? (
            <span className="music-spin music-player-spinner music-player-spinner-light" />
          ) : isPlaying ? (
            <PauseIcon size={19} />
          ) : (
            <PlayIcon size={19} />
          )}
        </button>
        <button
          type="button"
          aria-label="Next track"
          onClick={next}
          disabled={!currentTrack}
          className="music-player-mobile-next"
        >
          <NextIcon size={19} />
        </button>
      </div>
    </footer>
  );
}
