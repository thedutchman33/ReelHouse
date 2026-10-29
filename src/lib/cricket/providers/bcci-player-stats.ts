import "server-only";

import type {
  MatchFormat,
  PlayerBattingStat,
  PlayerBowlingStat,
  PlayerStatsData,
} from "../types";

// BCCI's stats service (CricViz) publishes the career, season and competition
// tables behind the player profile. It is a separate host from the public CMS,
// needs no key, and returns the full career in one request. We normalise only
// the columns the page renders; every number is taken from the feed.

const STATS = "https://stats.bcci.tv";

interface RawBatting {
  class?: string;
  season?: string;
  comp?: string;
  span?: string;
  matches?: string;
  innings?: string;
  notouts?: string;
  runs?: string;
  high_score?: string;
  batting_average?: string | null;
  balls_faced?: string;
  batting_run_rate?: string | null;
  hundreds?: string;
  fifties?: string;
  ducks?: string;
  fours?: string;
  sixes?: string;
  batting_boundary_percent?: string | null;
  batting_dot_percent?: string | null;
}

interface RawBowling {
  class?: string;
  season?: string;
  comp?: string;
  span?: string;
  matches?: string;
  innings_bowled?: string;
  balls?: string;
  conceded?: string;
  wickets?: string;
  bbi?: string | null;
  economy_rate?: string | null;
  bowling_average?: string | null;
  bowling_strike_rate?: string | null;
  five_wickets?: string;
  bowling_dot_percent?: string | null;
  bowling_boundary_percent?: string | null;
}

interface RawTable<T> {
  result?: T[];
}

interface RawPlayerStats {
  name?: string;
  career?: { batting?: RawTable<RawBatting>; bowling?: RawTable<RawBowling> };
  season?: { batting?: RawTable<RawBatting>; bowling?: RawTable<RawBowling> };
  competitions?: { batting?: RawTable<RawBatting>; bowling?: RawTable<RawBowling> };
}

const FORMAT_BY_CLASS: Record<string, MatchFormat> = {
  Test: "Test",
  "One-day international": "ODI",
  "Twenty20 international": "T20I",
};

function formatOf(value: string | undefined): MatchFormat | null {
  return value ? FORMAT_BY_CLASS[value.trim()] ?? null : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return value == null ? null : String(value);
  const trimmed = value.trim();
  return trimmed && trimmed !== "-" ? trimmed : null;
}

function num(value: unknown): number {
  const raw = text(value);
  if (!raw) return 0;
  const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNum(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function battingRow(row: RawBatting): PlayerBattingStat {
  const label = row.class?.trim() || row.season?.trim() || row.comp?.trim() || "Career";
  const runs = num(row.runs);
  const balls = num(row.balls_faced);
  return {
    label,
    format: formatOf(row.class),
    season: text(row.season) ?? undefined,
    competition: text(row.comp) ?? undefined,
    matches: num(row.matches),
    innings: num(row.innings),
    notOuts: num(row.notouts),
    runs,
    balls,
    average: optionalNum(row.batting_average),
    // The feed's batting_run_rate is runs per over, not the batting strike
    // rate. Derive runs per 100 balls from the counts instead.
    strikeRate: balls > 0 ? (runs / balls) * 100 : null,
    highScore: text(row.high_score),
    hundreds: num(row.hundreds),
    fifties: num(row.fifties),
    ducks: num(row.ducks),
    fours: num(row.fours),
    sixes: num(row.sixes),
    boundaryPct: optionalNum(row.batting_boundary_percent),
    dotPct: optionalNum(row.batting_dot_percent),
    span: text(row.span),
  };
}

function bowlingRow(row: RawBowling): PlayerBowlingStat {
  const label = row.class?.trim() || row.season?.trim() || row.comp?.trim() || "Career";
  const balls = num(row.balls);
  const wickets = num(row.wickets);
  const conceded = num(row.conceded);
  return {
    label,
    format: formatOf(row.class),
    season: text(row.season) ?? undefined,
    competition: text(row.comp) ?? undefined,
    matches: num(row.matches),
    innings: num(row.innings_bowled),
    balls,
    runsConceded: conceded,
    wickets,
    economy: optionalNum(row.economy_rate),
    average: optionalNum(row.bowling_average) ?? (wickets > 0 ? conceded / wickets : null),
    strikeRate: optionalNum(row.bowling_strike_rate) ?? (wickets > 0 ? balls / wickets : null),
    best: text(row.bbi),
    fiveWickets: num(row.five_wickets),
    dotPct: optionalNum(row.bowling_dot_percent),
    boundaryPct: optionalNum(row.bowling_boundary_percent),
    span: text(row.span),
  };
}

function normalise(raw: RawPlayerStats, playerId: number): PlayerStatsData {
  return {
    playerId,
    name: raw.name?.trim() || "",
    career: {
      batting: (raw.career?.batting?.result ?? []).map(battingRow),
      bowling: (raw.career?.bowling?.result ?? []).map(bowlingRow),
    },
    seasons: {
      batting: (raw.season?.batting?.result ?? []).map(battingRow),
      bowling: (raw.season?.bowling?.result ?? []).map(bowlingRow),
    },
    competitions: {
      batting: (raw.competitions?.batting?.result ?? []).map(battingRow),
      bowling: (raw.competitions?.bowling?.result ?? []).map(bowlingRow),
    },
  };
}

export function isBcciPlayerId(value: string): boolean {
  return /^\d{1,8}$/.test(value);
}

/** Full career tables for one BCCI player. Cached by the fetch layer for 6h. */
export async function fetchBcciPlayerStats(playerId: number): Promise<PlayerStatsData | null> {
  if (!Number.isInteger(playerId) || playerId <= 0) return null;
  try {
    const response = await fetch(`${STATS}/player/${playerId}/stats`, {
      cache: "force-cache",
      next: { revalidate: 6 * 60 * 60 },
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-US",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const raw = (await response.json()) as RawPlayerStats;
    const stats = normalise(raw, playerId);
    return stats.career.batting.length || stats.career.bowling.length ? stats : null;
  } catch {
    return null;
  }
}
