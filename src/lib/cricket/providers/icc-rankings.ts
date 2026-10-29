import "server-only";

import { iccPortraitUrl, playerNameKey } from "../shared";
import type {
  Gender,
  MatchFormat,
  PlayerRankingRow,
  RankingSet,
  TeamRankingRow,
} from "../types";

// ---------------------------------------------------------------------------
// Official ICC rankings — free, keyless, and deliberately separated from every
// provider or calculated table on the page.
//
// icc-cricket.com server-renders its ranking payload into the RSC stream; there
// is no published public JSON API. This module reads that public HTML, extracts
// the embedded JSON, and normalises it into the same RankingSet shape the page
// already renders. If the markup changes the parser returns null and the page
// shows an unavailable state rather than inventing a table.
//
// Cached for six hours: the ICC updates its tables weekly, and re-reading a
// ~1.3 MB page per visitor would be wasteful.
// ---------------------------------------------------------------------------

export const ICC_RANKINGS_URL = "https://www.icc-cricket.com/rankings";
const REVALIDATE_SECONDS = 6 * 60 * 60;

type JsonObject = Record<string, unknown>;

interface RankRow extends JsonObject {
  no?: string;
  change?: string;
  rankdate?: string;
  Player_id?: string | number;
  Points?: string | number;
  Rating?: string | number;
  Matches?: string | number;
}

interface IccTable {
  "rank-type"?: string;
  rank_date?: string;
  rank?: RankRow[];
}

interface IccWidgetItem {
  compType?: string;
  data?: Record<string, IccTable | undefined>;
}

const GENDER_FORMAT: Record<string, { gender: Gender; format: MatchFormat }> = {
  test: { gender: "men", format: "Test" },
  odi: { gender: "men", format: "ODI" },
  t20: { gender: "men", format: "T20I" },
  testw: { gender: "women", format: "Test" },
  odiw: { gender: "women", format: "ODI" },
  t20w: { gender: "women", format: "T20I" },
};

function number(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function position(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** "(+4)" → 4, "(-2)" → -2, "( - )" → null. */
function movement(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/([+-])\s*(\d+)/);
  if (!match) return null;
  const amount = Number(match[2]);
  return match[1] === "-" ? -amount : amount;
}

/**
 * ICC serves every ranked player's official portrait from the same Cloudinary
 * transform, keyed by Player_id. The transform crops it to the face, which is
 * exactly the round avatar treatment the ranking table uses.
 */
export function iccPlayerImage(playerId: unknown): string | null {
  return iccPortraitUrl(String(playerId ?? ""));
}

const imageChecks = new Map<string, { at: number; exists: boolean }>();
const IMAGE_CHECK_TTL_MS = REVALIDATE_SECONDS * 1000;

/**
 * The face transform answers with an identical grey silhouette for players
 * who have no portrait, so its presence proves nothing. The untransformed
 * asset is the reliable check: it 404s when the player has no photo.
 */
export async function iccPlayerImageExists(imageUrl: string | null): Promise<boolean> {
  if (!imageUrl) return false;
  const marker = "/image/upload/t_player-face/";
  if (!imageUrl.includes(marker)) return false;
  const now = Date.now();
  const cached = imageChecks.get(imageUrl);
  if (cached && now - cached.at < IMAGE_CHECK_TTL_MS) return cached.exists;
  try {
    const response = await fetch(imageUrl.replace(marker, "/image/upload/"), {
      method: "HEAD",
      cache: "force-cache",
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(10_000),
    });
    imageChecks.set(imageUrl, { at: now, exists: response.ok });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Pulls the RSC flight chunks out of a Next-rendered page and joins them.
 * On an older plain-HTML page it simply returns the original markup.
 */
export function decodeIccFlight(html: string): string {
  const chunks: string[] = [];
  const pattern = /self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g;
  for (const match of html.matchAll(pattern)) {
    try {
      const payload = JSON.parse(match[1]) as unknown[];
      if (typeof payload[1] === "string") chunks.push(payload[1]);
    } catch {
      // One malformed chunk must not discard the rest of the payload.
    }
  }
  return chunks.length > 0 ? chunks.join("") : html;
}

/** Finds the balanced JSON array beginning at `start`. */
function arrayAt(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Pure parser, exported so the official-data contract can be tested without
 * network access. Returns [] when the payload is absent or unrecognised.
 */
export function parseIccRankings(html: string): RankingSet[] {
  if (!html) return [];
  const flight = decodeIccFlight(html);
  const tables = new Map<
    string,
    { gender: Gender; format: MatchFormat; kind: string; table: IccTable }
  >();

  for (const match of flight.matchAll(/"items":\s*\[/g)) {
    const start = match.index! + match[0].length - 1;
    const raw = arrayAt(flight, start);
    if (!raw) continue;

    let items: IccWidgetItem[];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;
      items = parsed.filter(
        (item): item is IccWidgetItem =>
          !!item && typeof item === "object" && "compType" in item
      );
    } catch {
      continue;
    }

    for (const item of items) {
      const comp = item.compType;
      const mapping = comp ? GENDER_FORMAT[comp] : undefined;
      if (!mapping || !item.data) continue;

      for (const table of Object.values(item.data)) {
        if (!table || !Array.isArray(table.rank) || table.rank.length === 0) continue;
        const kind = String(table["rank-type"] ?? "");
        if (!kind) continue;
        // Each widget carries several categories; the compact card and the
        // expanded section can repeat a table, so keep the first copy per kind.
        const key = `${mapping.gender}:${mapping.format}:${kind}`;
        if (!tables.has(key)) tables.set(key, { ...mapping, kind, table });
      }
    }
  }

  const setsByKey = new Map<string, RankingSet>();
  for (const { gender, format, kind, table } of tables.values()) {
    const rows = table.rank ?? [];
    const asOf = String(table.rank_date ?? rows[0]?.rankdate ?? "");
    const setKey = `${gender}:${format}`;
    const set: RankingSet =
      setsByKey.get(setKey) ?? {
        gender,
        format,
        asOf,
        team: [],
        batting: [],
        bowling: [],
        allRounder: [],
      };
    if (!setsByKey.has(setKey)) setsByKey.set(setKey, set);

    rows.forEach((row, index) => {
      const pos = position(row.no, index + 1);
      const change = movement(row.change);

      if (kind.endsWith("-team")) {
        const rawName = String(row.team_name ?? row.Country ?? "Team");
        const name =
          gender === "women" && !/women/i.test(rawName) ? `${rawName} Women` : rawName;
        const teamRow: TeamRankingRow = {
          position: pos,
          name,
          code: String(row.shortname ?? row.Country ?? "—"),
          rating: number(row.Rating),
          points: number(row.Points),
          change,
        };
        set.team.push(teamRow);
        return;
      }

      const rawTeam = String(row.team_name ?? row.Country_name ?? "");
      const team =
        gender === "women" && rawTeam && !/women/i.test(rawTeam)
          ? `${rawTeam} Women`
          : rawTeam;
      const player: PlayerRankingRow = {
        position: pos,
        name: String(row["Player-name"] ?? "Player"),
        team,
        teamCode: String(row.Country ?? "—"),
        rating: number(row.Points) ?? 0,
        change,
        imageUrl: iccPlayerImage(row.Player_id),
      };

      if (kind.endsWith("-batting")) set.batting.push(player);
      else if (kind.endsWith("-bowling")) set.bowling.push(player);
      else if (kind.endsWith("-allrounder")) set.allRounder.push(player);
    });
  }

  return [...setsByKey.values()];
}

let cached: { at: number; sets: RankingSet[] } | null = null;
let failedAt: number | null = null;
const CACHE_TTL_MS = REVALIDATE_SECONDS * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;

/** Name → ICC headshot. Used to enrich BCCI scorecards, whose rows carry no
 *  portrait but almost every international appears in a ranking table. Pass a
 *  team code to keep only that side's players. */
export async function fetchIccPlayerPhotos(teamCode?: string): Promise<Map<string, string>> {
  const sets = await fetchIccRankings();
  const photos = new Map<string, string>();
  for (const set of sets ?? []) {
    for (const row of [...set.batting, ...set.bowling, ...set.allRounder]) {
      if (!row.imageUrl) continue;
      if (teamCode && row.teamCode !== teamCode) continue;
      photos.set(playerNameKey(row.name), row.imageUrl);
    }
  }
  return photos;
}

/**
 * Fetches the official page and returns only tables the parser understood.
 * `null` means the fetch failed; `[]` means it succeeded but no table was found.
 * The parsed list is held in-process because the raw HTML is over 1 MB.
 */
export async function fetchIccRankings(): Promise<RankingSet[] | null> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.sets;
  if (failedAt && now - failedAt < FAILURE_TTL_MS) return cached?.sets ?? null;

  try {
    const response = await fetch(ICC_RANKINGS_URL, {
      cache: "force-cache",
      next: { revalidate: REVALIDATE_SECONDS },
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      failedAt = now;
      return cached?.sets ?? null;
    }
    const sets = parseIccRankings(await response.text());
    if (sets.length === 0) {
      failedAt = now;
      return cached?.sets ?? null;
    }
    cached = { at: now, sets };
    failedAt = null;
    return sets;
  } catch {
    failedAt = now;
    return cached?.sets ?? null;
  }
}
