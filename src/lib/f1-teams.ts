/**
 * Team name (as OpenF1 publishes it) → logo asset.
 *
 * The PNGs in `public/f1/teams/` are the team marks as published on Wikipedia,
 * downloaded once so the dashboard never depends on a third-party at runtime.
 * `public/f1/teams/ATTRIBUTION.txt` records the source of each file.
 *
 * The marks have very different shapes (a wide wordmark next to Mercedes' tall
 * star), so the width/height ratio is stored too: a fixed-width tile shrinks a
 * square mark to a sliver.
 */
type TeamMark = { src: string; aspect: number };

const TEAM_LOGOS: Record<string, TeamMark> = {
  McLaren: { src: "/f1/teams/mclaren.png", aspect: 1 },
  Ferrari: { src: "/f1/teams/ferrari.png", aspect: 2.48 },
  "Red Bull Racing": { src: "/f1/teams/redbull.png", aspect: 2.13 },
  Mercedes: { src: "/f1/teams/mercedes.png", aspect: 0.9 },
  "Aston Martin": { src: "/f1/teams/astonmartin.png", aspect: 3.24 },
  Alpine: { src: "/f1/teams/alpine.png", aspect: 1.94 },
  Williams: { src: "/f1/teams/williams.png", aspect: 1.94 },
  "Racing Bulls": { src: "/f1/teams/racingbulls.png", aspect: 2.96 },
  "Haas F1 Team": { src: "/f1/teams/haas.png", aspect: 1.09 },
  Audi: { src: "/f1/teams/audi.png", aspect: 1.08 },
  Cadillac: { src: "/f1/teams/cadillac.png", aspect: 1.94 },
};

export function teamLogo(teamName: string): string | null {
  return TEAM_LOGOS[teamName]?.src ?? null;
}

/**
 * Monochrome white SVG marks for the standings tables, matching the logo
 * column on formula-timing.com (its table loads `/teams/<slug>.svg` at 30x20).
 * Local copies live in `public/f1/teams/mono/`; the white fills are part of
 * the artwork, so no CSS filter is needed against the dark cards.
 */
const MONO_LOGOS: Record<string, string> = {
  McLaren: "/f1/teams/mono/mclaren.svg",
  Ferrari: "/f1/teams/mono/ferrari.svg",
  "Red Bull Racing": "/f1/teams/mono/redbull.svg",
  Mercedes: "/f1/teams/mono/mercedes.svg",
  "Aston Martin": "/f1/teams/mono/astonmartin.svg",
  Alpine: "/f1/teams/mono/alpine.svg",
  Williams: "/f1/teams/mono/williams.svg",
  "Racing Bulls": "/f1/teams/mono/racingbulls.svg",
  "Haas F1 Team": "/f1/teams/mono/haas.svg",
  Audi: "/f1/teams/mono/audi.svg",
  Cadillac: "/f1/teams/mono/cadillac.svg",
};

export function teamMonoLogo(teamName: string): string | null {
  return MONO_LOGOS[teamName] ?? null;
}

/** Width for a mark drawn `height` tall, clamped so wide marks stay in place. */
export function teamLogoWidth(teamName: string, height: number, maxWidth?: number): number {
  const aspect = TEAM_LOGOS[teamName]?.aspect ?? 1.6;
  const width = height * aspect;
  return Math.min(maxWidth ?? width, Math.max(height, width));
}
