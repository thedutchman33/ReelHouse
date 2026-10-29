// ---------------------------------------------------------------------------
// Browser games directory — mirrored from bitrunlog.com.
//
// The page is required to show exactly the games that site lists, no more and no
// fewer, and to follow its updates. bitrunlog renders its whole catalogue into
// the page as an embedded JSON array between the AUTO_GAMES markers, and stamps
// it with a source timestamp. That array is the authoritative list; parsing it
// (rather than re-deriving a list from the relay repos) is the only way to match
// the site exactly — its editor adds games that never appear in the decomp
// directory, and trims entries the repo still lists.
//
// Links always open the project's own site in a new tab. Reelhouse does not
// host, mirror or distribute any game.
// ---------------------------------------------------------------------------

import { unstable_cache } from "next/cache";

/** The page's catalogue array. Only the fields this page consumes. */
interface RawGame {
  id?: string | null;
  name?: string | null;
  image?: string | null;
  url?: string | null;
  platform?: string | null;
  facts?: string[] | null;
  tag?: string | null;
  sourceId?: string | null;
}

/** How a game treats the visitor's own copy of the game. */
export type GameAssets = "instant" | "byo" | "demo" | "unknown";

export interface BrowserGame {
  id: string;
  title: string;
  /** Platform family, e.g. "PC", "PS2", "Browser". */
  platform: string | null;
  /** The project's own playable page. Opens in a new tab. */
  url: string;
  /** Absolute screenshot URL, or null when the entry has no art. */
  screenshotUrl: string | null;
  assets: GameAssets;
  multiplayer: boolean;
  /** Marquee franchise — what the page's default Popular view shows. */
  popular: boolean;
}

export interface BrowserGamesFeed {
  games: BrowserGame[];
  /** The catalogue's own "generated at" timestamp. */
  updatedAt: string | null;
  /** Kept for the page's stat strip; the mirrored list has one source. */
  catalogUpdatedAt: string | null;
  /** False when the page could not be read this time. */
  ok: boolean;
}

export const BITRUNLOG_URL = "https://bitrunlog.com/";
export const BITRUNLOG_NAME = "bitrunlog.com";

/**
 * Recognisable franchises for the "Popular" view. Purely a curated label —
 * bitrunlog publishes no play counts, so a ranking would be invented. Matching
 * the household names (GTA, Call of Duty, Minecraft, FIFA …) is the honest
 * signal the catalogue supports.
 */
const POPULAR_SERIES = [
  "grand theft auto",
  "gta",
  "call of duty",
  "black ops",
  "nacht der untoten",
  "kino der toten",
  "minecraft",
  "counter-strike",
  "half-life",
  "doom",
  "quake",
  "halo",
  "zelda",
  "super mario",
  "mario kart",
  "super smash",
  "crash bash",
  "tekken",
  "fifa",
  "pro evolution soccer",
  "pes",
  "need for speed",
  "nfs",
  "gran turismo",
  "midnight club",
  "god of war",
  "resident evil",
  "silent hill",
  "spider-man",
  "street fighter",
  "mortal kombat",
  "dragon ball",
  "naruto",
  "wwe",
  "smackdown",
  "tony hawk",
  "fallout",
  "cyberpunk",
  "pokemon",
  "poké",
  "runescape",
  "the simpsons",
  "diablo",
  "command & conquer",
  "star wars",
  "kingdom hearts",
  "final fantasy",
  "monster hunter",
  "burnout",
  "def jam",
  "postal",
  "guitar hero",
];

/** True when a title belongs to one of the marquee franchises above. */
export function isPopularTitle(title: string): boolean {
  const normalized = title.toLowerCase();
  return POPULAR_SERIES.some((series) => normalized.includes(series));
}

/**
 * Relative catalogue art lives beside the decomp directory's screenshots; the
 * repo serves it with the right content type. Absolute art is used as-is.
 */
const SCREENSHOT_BASE =
  "https://raw.githubusercontent.com/SubmitGame/awesome-decomp-games/main/";

/** The page refreshes daily; 30 minutes keeps this page current without churn. */
export const GAMES_REVALIDATE_SECONDS = 1800;

const HTTP_URL = /^https?:\/\//i;

function httpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!HTTP_URL.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function assetsOf(facts: readonly string[]): GameAssets {
  if (facts.includes("plays instantly")) return "instant";
  if (facts.includes("needs your game files")) return "byo";
  if (facts.some((fact) => fact.startsWith("free demo"))) return "demo";
  return "unknown";
}

function screenshotOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (HTTP_URL.test(raw)) return httpUrl(raw);
  const path = raw.replace(/^\/+/, "");
  if (!path || path.includes("..")) return null;
  return `${SCREENSHOT_BASE}${path}`;
}

const GAMES_BLOCK =
  /\/\*\s*AUTO_GAMES_START\s*\*\/\s*(\[[\s\S]*?\])\s*\/\*\s*AUTO_GAMES_END\s*\*\//;

const SOURCE_DATE_BLOCK =
  /AUTO_SOURCE_DATE_START\s*\*\/\s*"([^"]+)"\s*\/\*\s*AUTO_SOURCE_DATE_END/;

/**
 * Parse the embedded catalogue. Pure, so the mapping is testable offline.
 */
export function parseBitrunlogGames(html: string): BrowserGame[] {
  const match = GAMES_BLOCK.exec(html);
  if (!match) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const games: BrowserGame[] = [];
  // The source lists some games twice under different titles (mirrors, regional
  // pages). Keep every row — parity is the point — but make the React key unique.
  const usedIds = new Set<string>();

  for (const [index, entry] of (raw as RawGame[]).entries()) {
    if (!entry) continue;
    const url = httpUrl(entry.url);
    const title = (entry.name ?? "").trim();
    if (!url || !title) continue;

    const facts = Array.isArray(entry.facts)
      ? entry.facts.filter((fact): fact is string => typeof fact === "string")
      : [];

    const baseId = (entry.id ?? url).trim() || `game-${index}`;
    const id = usedIds.has(baseId) ? `${baseId}-${index}` : baseId;
    usedIds.add(id);

    games.push({
      id,
      title,
      platform: entry.platform?.trim() || null,
      url,
      screenshotUrl: screenshotOf(entry.image),
      assets: assetsOf(facts),
      multiplayer: facts.includes("multiplayer"),
      popular: isPopularTitle(title),
    });
  }

  return games;
}

/** The catalogue's generated-at stamp, so the page can show freshness. */
export function parseBitrunlogUpdatedAt(html: string): string | null {
  const match = SOURCE_DATE_BLOCK.exec(html);
  if (!match) return null;
  const date = new Date(match[1]);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function loadBrowserGames(): Promise<BrowserGamesFeed> {
  try {
    const response = await fetch(BITRUNLOG_URL, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": BROWSER_UA,
      },
      // The embedded catalogue is the source of truth; the small mapped feed is
      // what gets cached below.
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`bitrunlog: ${response.status}`);

    const html = await response.text();
    const games = parseBitrunlogGames(html);
    if (!games.length) throw new Error("bitrunlog: catalogue not found");

    return {
      games,
      updatedAt: parseBitrunlogUpdatedAt(html),
      catalogUpdatedAt: null,
      ok: true,
    };
  } catch {
    // The page keeps serving its previous ISR copy; this only affects a cold
    // render while the source is unreachable.
    return { games: [], updatedAt: null, catalogUpdatedAt: null, ok: false };
  }
}

/**
 * The page reads this cached feed. The key is versioned so a shape change does
 * not serve an old object from the data cache.
 */
export const getBrowserGames = unstable_cache(
  loadBrowserGames,
  ["browser-games-feed-bitrunlog-v3"],
  { revalidate: GAMES_REVALIDATE_SECONDS, tags: ["browser-games"] }
);

export const GAME_ASSETS_LABEL: Record<GameAssets, string> = {
  instant: "Plays instantly",
  byo: "Needs your game files",
  demo: "Free demo included",
  unknown: "May need game files",
};
