// Client-side player constants + view types. No provider logic lives here —
// these are generic UI options for the player chrome. (Server-resolved data
// like the list of PlaybackServers arrives as props from the VideoProvider.)

export type SettingsTab = "quality" | "subtitles" | "servers" | "speed";

export interface QualityOption {
  id: string;
  label: string;
  /** Vertical resolution; null = adaptive/auto. */
  height: number | null;
}

// Mock quality ladder. A single bundled MP4 has no real variants, so selecting
// one only updates UI state (a real provider would expose true renditions).
export const QUALITY_OPTIONS: QualityOption[] = [
  { id: "auto", label: "Auto", height: null },
  { id: "1080", label: "1080p", height: 1080 },
  { id: "720", label: "720p", height: 720 },
  { id: "480", label: "480p", height: 480 },
];

// Playback speed is real — it maps straight to HTMLMediaElement.playbackRate.
export const SPEED_OPTIONS: number[] = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export interface SubtitleColorSwatch {
  id: string;
  label: string;
  value: string;
}

// Subtitle text colors. Uses the Reelhouse accent as the first "brand" option
// rather than copying any other product's palette.
export const SUBTITLE_COLORS: SubtitleColorSwatch[] = [
  { id: "white", label: "White", value: "#ffffff" },
  { id: "accent", label: "Amber", value: "#e8a33d" },
  { id: "cream", label: "Cream", value: "#f5e9d0" },
  { id: "sky", label: "Sky", value: "#7fd0ff" },
  { id: "mint", label: "Mint", value: "#8fe3c0" },
  { id: "lime", label: "Lime", value: "#c8f08a" },
  { id: "rose", label: "Rose", value: "#ff9fb2" },
  { id: "violet", label: "Violet", value: "#c3a6ff" },
  { id: "coral", label: "Coral", value: "#ff9d7a" },
  { id: "sun", label: "Sun", value: "#ffd166" },
  { id: "slate", label: "Slate", value: "#b9c2cf" },
  { id: "black", label: "Black", value: "#0d0d0d" },
];

export interface SubtitleAppearance {
  /** Caption font size in px. */
  fontSize: number;
  /** Backdrop blur behind captions, 0–100 (%). */
  blur: number;
  /** Caption text color (hex). */
  color: string;
  /** Timing offset in seconds applied to cue times (−/+). */
  latency: number;
}

export const DEFAULT_APPEARANCE: SubtitleAppearance = {
  fontSize: 22,
  blur: 0,
  color: "#ffffff",
  latency: 0,
};

export const FONT_SIZE_MIN = 14;
export const FONT_SIZE_MAX = 40;
export const LATENCY_MIN = -5;
export const LATENCY_MAX = 5;

// localStorage keys — appearance + favorite servers persist locally because
// authentication is not implemented yet ("Save to account" is a local mirror).
export const APPEARANCE_KEY = "reelhouse:subtitle-appearance";
export const FAVORITE_SERVERS_KEY = "reelhouse:favorite-servers";
