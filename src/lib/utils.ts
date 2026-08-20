import type { MediaType } from "@/types";

/** Build the internal stable id from a type + tmdb id. */
export function mediaId(type: MediaType, tmdbId: number): string {
  return `${type}-${tmdbId}`;
}

/** Parse an internal id like "movie-603" back into its parts. */
export function parseMediaId(id: string): { type: MediaType; tmdbId: number } | null {
  const m = /^(movie|tv)-(\d+)$/.exec(id);
  if (!m) return null;
  return { type: m[1] as MediaType, tmdbId: Number(m[2]) };
}

export function yearOf(releaseDate?: string): string {
  if (!releaseDate) return "";
  const y = releaseDate.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : "";
}

export function formatRating(rating?: number): string | null {
  if (rating == null || Number.isNaN(rating) || rating <= 0) return null;
  return rating.toFixed(1);
}

export function formatRuntime(minutes?: number): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Small stable hash → non-negative int. */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Deterministic, on-brand placeholder artwork as an inline SVG data URI.
 * Used when a title has no poster/backdrop (mock catalog, or missing TMDB art).
 * Hue is derived from the title so the same title always gets the same look.
 */
export function placeholderArt(opts: {
  title: string;
  type?: MediaType;
  variant?: "poster" | "backdrop";
}): string {
  const { title, type, variant = "poster" } = opts;
  const w = variant === "poster" ? 400 : 1280;
  const h = variant === "poster" ? 600 : 720;
  const hue = hashString(title) % 360;
  const hue2 = (hue + 38) % 360;
  const id = `g${hashString(title + variant)}`;

  const label = escapeXml(title);
  const kind = type ? escapeXml(type === "tv" ? "SERIES" : "FILM") : "";
  const fontSize = variant === "poster" ? 30 : 56;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 55% 22%)"/>
      <stop offset="1" stop-color="hsl(${hue2} 60% 11%)"/>
    </linearGradient>
    <radialGradient id="${id}v" cx="0.3" cy="0.2" r="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 45%)" stop-opacity="0.45"/>
      <stop offset="0.6" stop-color="hsl(${hue} 70% 45%)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#${id})"/>
  <rect width="${w}" height="${h}" fill="url(#${id}v)"/>
  <g fill="none" stroke="hsl(${hue} 40% 80% / 0.16)" stroke-width="2">
    <circle cx="${w * 0.5}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.16}"/>
    <circle cx="${w * 0.5}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.06}"/>
  </g>
  <path d="M ${w * 0.5 - 10} ${h * 0.42 - 16} L ${w * 0.5 - 10} ${h * 0.42 + 16} L ${w * 0.5 + 18} ${h * 0.42} Z" fill="hsl(${hue} 45% 88% / 0.5)"/>
  ${kind ? `<text x="50%" y="${h - fontSize * 2.4}" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${fontSize * 0.5}" letter-spacing="4" fill="hsl(${hue} 30% 88% / 0.7)">${kind}</text>` : ""}
  <text x="50%" y="${h - fontSize * 1.1}" text-anchor="middle" font-family="ui-serif, Georgia, serif" font-weight="700" font-size="${fontSize}" fill="hsl(${hue} 25% 96%)">${truncateForArt(label, variant === "poster" ? 22 : 42)}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function truncateForArt(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
