"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { MusicTrack } from "@/lib/music/types";
import { activeLyricIndex } from "@/lib/music/lrc";
import { colorFor } from "@/lib/music/utils";
import { toast } from "@/lib/toast";
import { useMusicLibrary } from "./MusicLibraryProvider";
import { useMusicPlayer, usePlayerProgress } from "./MusicPlayerProvider";
import { useLyrics } from "./useLyrics";
import {
  CheckCircleIcon,
  MicIcon,
  MinimizeIcon,
  MusicNoteIcon,
  PlusCircleIcon,
  ShareIcon,
} from "./icons";

export default function LyricsView({
  track,
  contextLabel,
  onClose,
}: {
  track: MusicTrack;
  contextLabel: string;
  onClose: () => void;
}) {
  const { currentTime } = usePlayerProgress();
  const { seek } = useMusicPlayer();
  const { isTrackLiked, toggleLike } = useMusicLibrary();
  const { lyrics, loading, error } = useLyrics(track);
  const activeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIndex = lyrics ? activeLyricIndex(lyrics.lines, currentTime) : -1;
  const liked = isTrackLiked(track.id);
  const lyricsStyle = {
    "--lyrics-bg": `color-mix(in srgb, ${colorFor(track.id)} 44%, #2b1818)`,
    "--music-lyrics-art": track.artworkUrl ? `url("${track.artworkUrl}")` : "none",
  } as CSSProperties;

  useEffect(() => {
    if (!activeRef.current) return;
    const scroll = scrollRef.current;
    if (!scroll) return;
    const line = activeRef.current;
    const target = line.offsetTop - scroll.clientHeight / 2 + line.clientHeight / 2;
    scroll.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section className="music-lyrics-screen" aria-label="Lyrics" style={lyricsStyle}>
      <header className="music-lyrics-screen-head">
        <div className="music-lyrics-screen-context">
          <MicIcon size={15} />
          <span>{contextLabel || track.albumTitle || "Lyrics"}</span>
        </div>
        <div className="music-lyrics-screen-actions">
          <button
            type="button"
            onClick={() => toggleLike(track)}
            data-liked={liked || undefined}
            aria-label={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
            title={liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
          >
            {liked ? <CheckCircleIcon size={20} /> : <PlusCircleIcon size={20} />}
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href).then(
                () => toast("Link copied to clipboard", { tone: "success" }),
                () => undefined
              );
            }}
            aria-label="Copy link"
            title="Copy link"
          >
            <ShareIcon size={19} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close lyrics" title="Close lyrics">
            <MinimizeIcon size={19} />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="music-lyrics-screen-scroll music-scroll">
        <div className="music-lyrics-screen-lines">
          {loading ? (
            <div className="music-lyrics-loading">
              {[78, 54, 88, 63, 72, 46].map((width, index) => (
                <div
                  key={index}
                  className="music-skeleton"
                  style={{ width: `${width}%`, height: 38 }}
                />
              ))}
            </div>
          ) : error ? (
            <div className="music-lyrics-message">
              <MicIcon size={31} />
              <strong>Lyrics are unavailable</strong>
              <span>The lyrics service could not be reached. Try again shortly.</span>
            </div>
          ) : lyrics?.instrumental ? (
            <div className="music-lyrics-message">
              <MusicNoteIcon size={31} />
              <strong>Instrumental</strong>
              <span>This track has no lyrics.</span>
            </div>
          ) : lyrics && lyrics.lines.length > 0 ? (
            lyrics.lines.map((line, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={`${line.time}-${index}`}
                  ref={active ? activeRef : undefined}
                  type="button"
                  onClick={() => seek(line.time)}
                  className="music-lyric-line"
                  data-active={active || undefined}
                  data-past={index < activeIndex || undefined}
                >
                  {line.text}
                </button>
              );
            })
          ) : lyrics?.plain ? (
            lyrics.plain
              .split(/\r?\n/)
              .filter(Boolean)
              .map((line, index) => (
                <p key={index} className="music-lyric-line">
                  {line}
                </p>
              ))
          ) : (
            <div className="music-lyrics-message">
              <MicIcon size={31} />
              <strong>Lyrics not available</strong>
              <span>This track isn’t in the lyrics catalog yet.</span>
            </div>
          )}
        </div>
        <p className="music-lyrics-credit">Lyrics provided by LRCLIB</p>
      </div>
    </section>
  );
}
