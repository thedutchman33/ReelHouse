"use client";

import type { MediaType, PlaybackServer, SubtitleTrack } from "@/types";
import type { SettingsTab, SubtitleAppearance as Appearance } from "./constants";
import { CloseIcon, SlidersIcon } from "./icons";
import QualityPanel from "./QualityPanel";
import ServerPanel from "./ServerPanel";
import SpeedPanel from "./SpeedPanel";
import SubtitlePanel from "./SubtitlePanel";
import SubtitleSearch from "./SubtitleSearch";
import SubtitleAppearanceView from "./SubtitleAppearance";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "quality", label: "Quality" },
  { id: "subtitles", label: "Subtitles" },
  { id: "servers", label: "Servers" },
  { id: "speed", label: "Speed" },
];

// Right-side settings panel: header + tabs, routing to Quality / Subtitles
// (list or appearance) / Servers / Speed. Positioned absolutely inside the
// player container so it also works in fullscreen.
export default function PlayerSettings(props: {
  open: boolean;
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;

  quality: string;
  onQuality: (id: string) => void;

  speed: number;
  onSpeed: (r: number) => void;

  servers: PlaybackServer[];
  selectedServerId: string;
  favoriteIds: string[];
  onSelectServer: (id: string) => void;
  onToggleFavorite: (id: string) => void;

  subtitleTracks: SubtitleTrack[];
  selectedSubtitle: string | null;
  onSelectSubtitle: (url: string | null) => void;
  onUploadSubtitle: (file: File) => void;
  subtitleView: "list" | "appearance" | "search";
  onSubtitleView: (v: "list" | "appearance" | "search") => void;

  // Context for searching OpenSubtitles for the current title/episode.
  subtitleSearch: {
    type: MediaType;
    tmdbId: number;
    title: string;
    season?: number;
    episode?: number;
  };
  onLoadFoundSubtitle: (track: SubtitleTrack) => void;

  appearance: Appearance;
  onAppearanceChange: (patch: Partial<Appearance>) => void;
  onAppearanceReset: () => void;
  onAppearanceSave: () => void;
  appearanceSaved: boolean;
}) {
  const { open, tab } = props;

  return (
    <div
      className={`absolute inset-0 z-40 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Backdrop dims the player */}
      <div
        onClick={props.onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-label="Player settings"
        className={`absolute right-0 top-0 flex h-full w-full max-w-[24rem] flex-col border-l border-border bg-surface/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out sm:rounded-l-2xl ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
            <SlidersIcon size={18} />
          </span>
          <h2 className="flex-1 text-base font-semibold text-text">Player Settings</h2>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close settings"
            className="grid h-9 w-9 place-items-center rounded-full bg-surface-2/70 text-muted transition hover:bg-surface-2 hover:text-text"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-2">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => props.onTab(t.id)}
                className={`relative flex-1 px-2 py-3 text-sm font-medium transition ${
                  active ? "text-text" : "text-muted hover:text-text"
                }`}
              >
                {t.label}
                <span
                  className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full transition ${
                    active ? "bg-accent" : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4">
          {tab === "quality" && <QualityPanel selected={props.quality} onSelect={props.onQuality} />}

          {tab === "servers" && (
            <ServerPanel
              servers={props.servers}
              selectedId={props.selectedServerId}
              favoriteIds={props.favoriteIds}
              onSelect={props.onSelectServer}
              onToggleFavorite={props.onToggleFavorite}
            />
          )}

          {tab === "speed" && <SpeedPanel selected={props.speed} onSelect={props.onSpeed} />}

          {tab === "subtitles" &&
            (props.subtitleView === "appearance" ? (
              <SubtitleAppearanceView
                appearance={props.appearance}
                hasCaption={props.selectedSubtitle !== null}
                onChange={props.onAppearanceChange}
                onReset={props.onAppearanceReset}
                onSave={props.onAppearanceSave}
                saved={props.appearanceSaved}
                onBack={() => props.onSubtitleView("list")}
              />
            ) : props.subtitleView === "search" ? (
              <SubtitleSearch
                type={props.subtitleSearch.type}
                tmdbId={props.subtitleSearch.tmdbId}
                title={props.subtitleSearch.title}
                season={props.subtitleSearch.season}
                episode={props.subtitleSearch.episode}
                activeUrl={props.selectedSubtitle}
                onBack={() => props.onSubtitleView("list")}
                onLoaded={props.onLoadFoundSubtitle}
              />
            ) : (
              <SubtitlePanel
                tracks={props.subtitleTracks}
                selected={props.selectedSubtitle}
                onSelect={props.onSelectSubtitle}
                onUpload={props.onUploadSubtitle}
                onSearch={() => props.onSubtitleView("search")}
                onCustomize={() => props.onSubtitleView("appearance")}
              />
            ))}
        </div>
      </aside>
    </div>
  );
}
