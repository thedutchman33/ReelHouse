"use client";

import Link from "next/link";
import PlayerControls from "./PlayerControls";
import PlayerTimeline from "./PlayerTimeline";
import { BackIcon, Forward10Icon, PauseIcon, PlayIcon, Rewind10Icon, SpinnerIcon } from "./icons";

// Cinematic chrome laid over the video: top gradient + back button, centered
// transport controls, and a bottom block with title/episode info, the timeline,
// and the control bar. Presentational only — the root is click-through so taps
// on empty space reach the stage (to toggle controls / play); interactive
// clusters opt back in with pointer-events when the chrome is visible.
export default function PlayerOverlay({
  visible,
  backHref,
  badge,
  title,
  metaLine,
  episodeTitle,
  description,
  playing,
  buffering,
  onPlayPause,
  onRewind,
  onForward,
  currentTime,
  duration,
  buffered,
  onSeek,
  onScrubStart,
  onScrubEnd,
  hasEpisodes,
  canNext,
  isFullscreen,
  subtitlesOn,
  serversActive,
  onNext,
  onEpisodes,
  onSubtitles,
  onSettings,
  onSource,
  onFullscreen,
}: {
  visible: boolean;
  backHref: string;
  badge?: string;
  title: string;
  metaLine: string;
  episodeTitle?: string;
  description?: string;
  playing: boolean;
  buffering: boolean;
  onPlayPause: () => void;
  onRewind: () => void;
  onForward: () => void;
  currentTime: number;
  duration: number;
  buffered: number;
  onSeek: (t: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  hasEpisodes: boolean;
  canNext: boolean;
  isFullscreen: boolean;
  subtitlesOn: boolean;
  serversActive: boolean;
  onNext: () => void;
  onEpisodes: () => void;
  onSubtitles: () => void;
  onSettings: () => void;
  onSource: () => void;
  onFullscreen: () => void;
}) {
  const io = visible ? "pointer-events-auto" : "pointer-events-none";
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-30 flex flex-col justify-between transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Top: gradient + back button */}
      <div className="relative bg-gradient-to-b from-black/70 via-black/10 to-transparent px-3 pb-10 pt-3 sm:px-5">
        <Link
          href={backHref}
          onClick={stop}
          aria-label="Back to details"
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60 ${io}`}
        >
          <BackIcon size={22} />
        </Link>
      </div>

      {/* Center transport */}
      <div className="pointer-events-none flex items-center justify-center gap-6 sm:gap-10">
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onRewind();
          }}
          aria-label="Rewind 10 seconds"
          className={`grid h-12 w-12 place-items-center rounded-full text-white/90 transition hover:bg-white/15 active:scale-95 ${io}`}
        >
          <Rewind10Icon size={34} />
        </button>

        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onPlayPause();
          }}
          aria-label={playing ? "Pause" : "Play"}
          className={`grid h-16 w-16 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 active:scale-95 sm:h-20 sm:w-20 ${io}`}
        >
          {buffering ? (
            <SpinnerIcon size={34} />
          ) : playing ? (
            <PauseIcon size={34} />
          ) : (
            <PlayIcon size={34} className="ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onForward();
          }}
          aria-label="Forward 10 seconds"
          className={`grid h-12 w-12 place-items-center rounded-full text-white/90 transition hover:bg-white/15 active:scale-95 ${io}`}
        >
          <Forward10Icon size={34} />
        </button>
      </div>

      {/* Bottom: info + timeline + controls.

          The overlay is a fixed-height flex column, so this band's own height has
          to fit what is left of the viewport. It does not on a phone held
          sideways: at 915x412 the top band and centre transport take 172px and
          this band asks for 328px — 88px more than there is — and because nothing
          here can shrink, `justify-between` pushes the timeline and the whole
          control row (play, seek, volume, subtitles, settings, fullscreen) off
          the bottom edge, where no finger can reach them. Landscape is also the
          worst case rather than the mildest: 915px wide activates `sm:`, which
          enlarges the title and adds the description.

          So on a short viewport the band drops its padding and the descriptive
          copy — the title and synopsis are on the detail page anyway — and keeps
          every control. Nothing changes at any other size. */}
      <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-16 [@media(max-height:520px)]:pt-4 sm:px-5 sm:pb-4">
        <div className="mx-auto w-full max-w-[1400px]">
          {/* Title / episode info */}
          <div className="mb-2 max-w-2xl [@media(max-height:520px)]:hidden">
            {badge && (
              <span className="mb-1 inline-block rounded bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
                {badge}
              </span>
            )}
            <h1 className="truncate text-xl font-bold uppercase tracking-wide text-white drop-shadow sm:text-3xl">
              {title}
            </h1>
            <p className="mt-0.5 truncate text-xs text-white/70 sm:text-sm">{metaLine}</p>
            {episodeTitle && (
              <p className="mt-1 truncate text-sm font-semibold text-white sm:text-base">
                {episodeTitle}
              </p>
            )}
            {description && (
              <p className="mt-1 hidden text-xs text-white/70 line-clamp-2 sm:block sm:text-sm">
                {description}
              </p>
            )}
          </div>

          {/* Timeline */}
          <div className={io}>
            <PlayerTimeline
              currentTime={currentTime}
              duration={duration}
              buffered={buffered}
              onSeek={onSeek}
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
            />
          </div>

          {/* Control bar */}
          <div className={`mt-1 ${io}`}>
            <PlayerControls
              hasEpisodes={hasEpisodes}
              canNext={canNext}
              isFullscreen={isFullscreen}
              subtitlesOn={subtitlesOn}
              serversActive={serversActive}
              onNext={onNext}
              onEpisodes={onEpisodes}
              onSubtitles={onSubtitles}
              onSettings={onSettings}
              onSource={onSource}
              onFullscreen={onFullscreen}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
