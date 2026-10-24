/**
 * Official brand wordmark assets (bundled in /public/provider-logos) mapped to
 * the provider names TMDB reports. Shared by the provider rail, the directory
 * page and the logo component so filtering and rendering agree.
 *
 * ORDER MATTERS: the rail renders in this sequence — biggest services first
 * (Netflix → Prime Video → Disney+ → Apple TV+ → Apple TV → Hulu → Max →
 * Paramount+), then the mid-tier and free ad-supported ones, mirroring the
 * reference ordering.
 */
export const WORDMARKS: [RegExp, string][] = [
  [/netflix/i, "/provider-logos/netflix.svg"],
  [/prime\s?video/i, "/provider-logos/prime-video.svg"],
  [/disney/i, "/provider-logos/disney-plus.svg"],
  [/apple\s?tv\s?\+|apple\s?tv\s?plus/i, "/provider-logos/apple-tv-plus.svg"],
  [/apple\s?tv/i, "/provider-logos/apple-tv.svg"],
  [/hulu/i, "/provider-logos/hulu.svg"],
  [/\bmax\b|hbo/i, "/provider-logos/hbo-max.svg"],
  [/paramount/i, "/provider-logos/paramount-plus.svg"],
  [/peacock/i, "/provider-logos/peacock.svg"],
  [/crunchyroll/i, "/provider-logos/crunchyroll.svg"],
  [/starz/i, "/provider-logos/starz.svg"],
  [/amc/i, "/provider-logos/amc-plus.png"],
  [/youtube\s?premium/i, "/provider-logos/youtube-premium.svg"],
  [/youtube/i, "/provider-logos/youtube.svg"],
  [/tubi/i, "/provider-logos/tubi.svg"],
  [/pluto/i, "/provider-logos/pluto-tv.svg"],
  [/fubo/i, "/provider-logos/fubotv.svg"],
  [/plex/i, "/provider-logos/plex.svg"],
  [/roku/i, "/provider-logos/roku-channel.svg"],
  [/freevee/i, "/provider-logos/freevee.svg"],
  [/britbox/i, "/provider-logos/britbox.svg"],
  [/acorn/i, "/provider-logos/acorn-tv.svg"],
  [/shudder/i, "/provider-logos/shudder.png"],
  [/kanopy/i, "/provider-logos/kanopy.png"],
  [/hoopla/i, "/provider-logos/hoopla.svg"],
];

/**
 * Brand families, in the operator's display order. A family is ONE card on the
 * rail: "Netflix Kids" collapses into Netflix, "Apple TV Store"/"Apple TV+"
 * into Apple TV, "HBO Max"/"Max" into Max, etc. — first key that appears in
 * the provider's name wins.
 */
export const FAMILY_KEYS: string[] = [
  "netflix",
  "max",
  "apple tv",
  "prime video",
  "disney",
  "crunchyroll",
  "hulu",
  "paramount",
  "peacock",
  "starz",
  "amc",
  "youtube",
  "tubi",
  "pluto",
  "fubo",
  "plex",
  "roku",
  "freevee",
  "britbox",
  "acorn",
  "shudder",
  "kanopy",
  "hoopla",
];

export function wordmarkFor(name: string): string | null {
  const hit = WORDMARKS.find(([re]) => re.test(name));
  return hit ? hit[1] : null;
}

/** The brand family a provider belongs to ("Netflix Kids" → "netflix"). */
export function familyFor(name: string): string | null {
  const lower = name.toLowerCase();
  return FAMILY_KEYS.find((key) => lower.includes(key)) ?? null;
}

/**
 * Collapse provider variants into one entry per brand family. The survivor is
 * the FLAGSHIP, not just the first occurrence: an exact name match to the
 * family key wins ("Max" over "HBO Max Amazon Channel"), otherwise the
 * shortest name ("Netflix" over "Netflix Kids"). Without this the rail could
 * link the Amazon Channel variant of a service instead of the service itself.
 */
export function dedupeByFamily<T extends { name: string }>(providers: T[]): T[] {
  const groups = new Map<string, { family: string; items: T[] }>();
  for (const p of providers) {
    const family = familyFor(p.name);
    if (!family) continue;
    const group = groups.get(family) ?? { family, items: [] };
    group.items.push(p);
    groups.set(family, group);
  }

  const out: T[] = [];
  for (const { family, items } of groups.values()) {
    const flagship =
      items.find((p) => p.name.toLowerCase() === family) ??
      items.reduce((best, p) => (p.name.length < best.name.length ? p : best), items[0]);
    out.push(flagship);
  }
  return out;
}

/** Sort providers into the operator's family order (Netflix first, etc.). */
export function sortProviders<T extends { name: string }>(providers: T[]): T[] {
  const rank = (name: string): number => {
    const family = familyFor(name);
    const idx = family ? FAMILY_KEYS.indexOf(family) : FAMILY_KEYS.length;
    return idx === -1 ? FAMILY_KEYS.length : idx;
  };
  return [...providers].sort((a, b) => rank(a.name) - rank(b.name));
}
