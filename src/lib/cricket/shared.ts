import type {
  CricketMatch,
  CricketPlayer,
  CricketTeam,
  Gender,
  MatchFormat,
  RankingSet,
} from "./types";

// Client-safe selectors and formatters. Nothing here touches a provider, so
// dashboard components can import this file without pulling server-only code
// into the browser bundle.

export const IST = "Asia/Kolkata";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const shortDateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  day: "2-digit",
  month: "short",
});

const dayMonthFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Date TBC";
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? dateFmt.format(date) : "Date TBC";
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "TBC";
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? shortDateFmt.format(date) : "TBC";
}

export function formatDayMonth(iso: string | null | undefined): string {
  if (!iso) return "TBC";
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? dayMonthFmt.format(date) : "TBC";
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "Time TBC";
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? `${timeFmt.format(date)} IST` : "Time TBC";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Date TBC";
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? `${dateTimeFmt.format(date)} IST` : "Date TBC";
}

export function formatDateRange(startISO: string, endISO: string | null): string {
  if (!endISO) return formatDate(startISO);
  const start = formatDate(startISO);
  const end = formatDate(endISO);
  return start === end ? start : `${start} – ${end}`;
}

// Primary jersey colour per national side. Used behind portraits in the
// pickers and profile cards; matches are coloured from BCCI's own team data.
const JERSEY_COLOURS: Record<string, string> = {
  india: "#1d509e",
  australia: "#0b6e4f",
  england: "#203864",
  "new zealand": "#1a1a1a",
  pakistan: "#0a5c36",
  "south africa": "#007a4d",
  "west indies": "#7b1e3a",
  "sri lanka": "#0b3b8f",
  bangladesh: "#006a4e",
  afghanistan: "#1b4f9c",
  zimbabwe: "#b3202c",
  ireland: "#169b62",
  scotland: "#4b2c6f",
  netherlands: "#e37200",
  nepal: "#b3202c",
  "united arab emirates": "#8a6d1f",
  oman: "#a31621",
  "united states of america": "#1f3a63",
  namibia: "#1b4f9c",
  "papua new guinea": "#b3202c",
  "hong kong": "#b3202c",
};

export function teamJerseyColour(team: string | null | undefined): string | null {
  if (!team) return null;
  const key = team.replace(/\s+Women$/i, "").trim().toLowerCase();
  return JERSEY_COLOURS[key] ?? null;
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return [hue * 60, saturation, lightness];
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export interface JerseyBar {
  background: string;
  glow: string;
}

/**
 * A rating bar painted in the side's jersey colour. Black and white kits carry
 * no hue of their own, so they fall back to a silver slate; dark and pale kits
 * are lifted into a band that stays readable against the table.
 */
export function teamJerseyBar(team: string | null | undefined): JerseyBar | null {
  const colour = teamJerseyColour(team);
  if (!colour) return null;
  const hex = colour.replace("#", "");
  const [rawHue, rawSaturation, lightness] = rgbToHsl(
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  );
  const neutral = rawSaturation < 0.1;
  const hue = neutral ? 214 : rawHue;
  const saturation = neutral ? 0.16 : Math.min(0.92, Math.max(0.5, rawSaturation));
  const base = Math.min(0.46, Math.max(0.34, lightness));
  const tip = Math.min(0.68, base + 0.2);
  return {
    background: `linear-gradient(90deg, ${hslToHex(hue, saturation, base)}, ${hslToHex(
      hue,
      saturation,
      tip
    )})`,
    glow: `hsl(${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(
      (base + 0.08) * 100
    )}% / 0.35)`,
  };
}

/** ICC's face transform, keyed by the numeric ICC player id. */
export function iccPortraitUrl(iccId: string | null | undefined): string | null {
  const id = String(iccId ?? "").trim();
  if (!/^\d+$/.test(id)) return null;
  return `https://images.icc-cricket.com/image/upload/t_player-face/prd/assets/players/generic/colored/${id}.png`;
}

/** BCCI keeps portraits at this endpoint, keyed by the numeric squad id. */
export function bcciPlayerImageUrl(
  playerId: string | null | undefined,
  width = 128
): string | null {
  if (!playerId || !/^\d+$/.test(playerId)) return null;
  const inner = `/api/team-assets?pathname=${encodeURIComponent(`squad/${playerId}.png`)}&brand=bcci`;
  return `https://www.bcci.tv/_next/image?url=${encodeURIComponent(inner)}&w=${width}&q=75`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatDecimal(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export interface CountdownParts {
  days: number;
  hours: number;
  mins: number;
  secs: number;
  past: boolean;
}

export function countdownTo(targetISO: string | null, now: number): CountdownParts {
  if (!targetISO) return { days: 0, hours: 0, mins: 0, secs: 0, past: true };
  const diff = new Date(targetISO).getTime() - now;
  if (!Number.isFinite(diff) || diff <= 0) {
    return { days: 0, hours: 0, mins: 0, secs: 0, past: true };
  }
  const total = Math.floor(diff / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    mins: Math.floor((total % 3600) / 60),
    secs: total % 60,
    past: false,
  };
}

export function indiaTeam(match: CricketMatch): CricketTeam {
  return (
    match.teams.find((team) =>
      match.gender === "women" ? /^india women$/i.test(team.name) : /^india$/i.test(team.name)
    ) ?? match.teams[0]
  );
}

export function opponentTeam(match: CricketMatch): CricketTeam {
  const india = indiaTeam(match);
  return match.teams.find((team) => team.id !== india.id) ?? match.teams[1] ?? match.teams[0];
}

export function matchTitle(match: CricketMatch): string {
  return `${indiaTeam(match).name} vs ${opponentTeam(match).name}`;
}

export function isLive(match: CricketMatch): boolean {
  return match.status === "live";
}

/** Live first, then the next scheduled match, then the latest result. */
export function featuredMatch(
  fixtures: CricketMatch[],
  results: CricketMatch[],
  now: number
): CricketMatch | null {
  const live = fixtures
    .filter(isLive)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  if (live) return live;

  const next = fixtures
    .filter((match) => match.status === "upcoming" && new Date(match.date).getTime() >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  if (next) return next;

  return results
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null;
}

/** Matches in the same competition, in date order. */
export function seriesMatches(fixtures: CricketMatch[], featured: CricketMatch | null): CricketMatch[] {
  if (!featured) return [];
  return fixtures
    .filter((match) => match.series === featured.series)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function rankingFor(
  rankings: RankingSet[],
  gender: Gender,
  format: MatchFormat
): RankingSet | null {
  return rankings.find((set) => set.gender === gender && set.format === format) ?? null;
}

export function playerNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(mohd|mohammad|mohammed|md)\.?/g, "mohammed")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sortPlayers(players: CricketPlayer[]): CricketPlayer[] {
  return [...players].sort((a, b) => a.name.localeCompare(b.name));
}
