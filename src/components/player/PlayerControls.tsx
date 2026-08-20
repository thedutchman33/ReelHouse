"use client";

import type { ReactNode } from "react";
import {
  EpisodesIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  GearIcon,
  NextEpisodeIcon,
  SourceIcon,
  SubtitlesIcon,
} from "./icons";

function Btn({
  onClick,
  label,
  showLabel = false,
  active = false,
  disabled = false,
  children,
}: {
  onClick: () => void;
  label: string;
  showLabel?: boolean;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={[
        "inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
        "hover:bg-white/15 active:scale-95 disabled:pointer-events-none disabled:opacity-40",
        active ? "text-accent" : "text-white/90",
      ].join(" ")}
    >
      {children}
      {showLabel && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

// Bottom control bar: next episode · Episodes · subtitles · settings ·
// additional source · fullscreen. Episode-only actions hide for movies.
export default function PlayerControls({
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
  return (
    <div className="flex items-center justify-between gap-1 sm:justify-center sm:gap-2">
      {hasEpisodes && (
        <Btn onClick={onNext} label="Next episode" disabled={!canNext}>
          <NextEpisodeIcon size={22} />
        </Btn>
      )}
      {hasEpisodes && (
        <Btn onClick={onEpisodes} label="Episodes" showLabel>
          <EpisodesIcon size={22} />
        </Btn>
      )}
      <Btn onClick={onSubtitles} label="Subtitles & audio" active={subtitlesOn}>
        <SubtitlesIcon size={22} />
      </Btn>
      <Btn onClick={onSettings} label="Player settings">
        <GearIcon size={22} />
      </Btn>
      <Btn onClick={onSource} label="Additional source" active={serversActive}>
        <SourceIcon size={22} />
      </Btn>
      <Btn onClick={onFullscreen} label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
        {isFullscreen ? <FullscreenExitIcon size={22} /> : <FullscreenIcon size={22} />}
      </Btn>
    </div>
  );
}
