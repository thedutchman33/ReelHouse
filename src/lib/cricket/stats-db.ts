import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Gender, MatchFormat } from "./types";
import type {
  CricketRole,
  StatsH2HResponse,
  StatsLastEncounter,
  StatsMatch,
  StatsPair,
  StatsPlayer,
  StatsPlayerSummary,
  StatsRoster,
  StatsSeason,
  StatsTeam,
  StatsTeamH2HResponse,
  StatsTeamRecord,
} from "./stats-types";

// ---------------------------------------------------------------------------
// Generated ball-by-ball index.
//
// `scripts/build-cricket-stats.py` aggregates Cricsheet's international
// archive into one compact file: career and season totals for every active
// player, every batter/bowler pair, and every team pair's match record. The
// file is read once per server process. Nothing here calls a network feed and
// nothing is estimated: a missing pair means the two players have not faced
// each other in the archive, not that a number is unavailable.
// ---------------------------------------------------------------------------

const FORMATS: MatchFormat[] = ["Test", "ODI", "T20I"];

interface RawPlayer {
  id: string;
  name: string;
  gender: Gender;
  team: string;
  role: CricketRole;
  last: string;
  first: string;
  matches: number;
  bat: {
    inns: number;
    runs: number;
    balls: number;
    no: number;
    hs: number;
    hsNo: boolean;
    fours: number;
    sixes: number;
    outs: number;
    hundreds: number;
    fifties: number;
    ducks: number;
    catches: number;
    dots: number;
    formats: {
      m: number;
      inns: number;
      runs: number;
      balls: number;
      no: number;
      hs: number;
      hsNo: boolean;
      fours: number;
      sixes: number;
      outs: number;
      hundreds: number;
      fifties: number;
      ducks: number;
      dots: number;
    }[];
  };
  bowl: {
    inns: number;
    balls: number;
    runs: number;
    wkts: number;
    bestW: number;
    bestR: number;
    five: number;
    dots: number;
    formats: {
      m: number;
      inns: number;
      balls: number;
      runs: number;
      wkts: number;
      bestW: number;
      bestR: number;
      five: number;
      dots: number;
    }[];
  };
  seasons: number[][];
}

interface RawTeam {
  name: string;
  code: string;
  gender: Gender;
  last: string;
  bat: number[];
  bowl: number[];
  all: number[];
}

interface RawMatch {
  d: string;
  v: string;
  c: string;
  a: string;
  b: string;
  w: string;
  r: string;
  f: number;
  g: Gender;
}

interface RawIndex {
  generatedAt: string;
  maxDate: string;
  cutoff: string;
  players: RawPlayer[];
  teams: Record<string, RawTeam>;
  pairs: Record<string, number[]>;
  records: Record<string, number[]>;
  matches: RawMatch[];
}

interface PreferredPlayer {
  name: string;
  iccId?: string;
}

let cached: RawIndex | null = null;
let preferredPlayers: Record<string, PreferredPlayer> | null = null;

function db(): RawIndex {
  if (cached) return cached;
  const file = path.join(process.cwd(), "src", "lib", "cricket", "generated", "cricket-stats.json");
  cached = JSON.parse(readFileSync(file, "utf8")) as RawIndex;
  return cached;
}

// Cricsheet's scorecards carry initials ("RG Sharma"); fans search for the
// everyday name ("Rohit Sharma"). `scripts/build-cricket-names.mjs` expands
// the ids it can match unambiguously against the ICC player directory and
// keeps the ICC id so the pickers can show the same portrait.
function preferredPlayer(id: string): PreferredPlayer | null {
  if (!preferredPlayers) {
    const file = path.join(process.cwd(), "src", "lib", "cricket", "generated", "player-names.json");
    try {
      preferredPlayers = JSON.parse(readFileSync(file, "utf8")) as Record<string, PreferredPlayer>;
    } catch {
      preferredPlayers = {};
    }
  }
  return preferredPlayers[id] ?? null;
}

function matchAt(index: number): StatsMatch | null {
  const row = db().matches[index];
  if (!row) return null;
  return {
    date: row.d,
    venue: row.v,
    city: row.c,
    teamA: row.a,
    teamB: row.b,
    winner: row.w,
    result: row.r,
    format: FORMATS[row.f] ?? "ODI",
    gender: row.g,
  };
}

function summary(player: RawPlayer, index: number): StatsPlayerSummary {
  const preferred = preferredPlayer(player.id);
  return {
    index,
    id: player.id,
    name: preferred?.name ?? player.name,
    iccId: preferred?.iccId ?? null,
    gender: player.gender,
    team: player.team,
    role: player.role,
    first: player.first,
    last: player.last,
    matches: player.matches,
  };
}

function playerAt(index: number): StatsPlayer {
  const player = db().players[index];
  if (!player) throw new Error("unknown_player");
  const seasons: StatsSeason[] = player.seasons.map((row) => ({
    year: row[0],
    matches: row[1],
    runs: row[2],
    balls: row[3],
    wickets: row[4],
    bowlBalls: row[5],
  }));
  return {
    ...summary(player, index),
    bat: {
      innings: player.bat.inns,
      runs: player.bat.runs,
      balls: player.bat.balls,
      notOuts: player.bat.no,
      highScore: player.bat.hs,
      highScoreNotOut: player.bat.hsNo,
      fours: player.bat.fours,
      sixes: player.bat.sixes,
      outs: player.bat.outs,
      hundreds: player.bat.hundreds,
      fifties: player.bat.fifties,
      ducks: player.bat.ducks,
      catches: player.bat.catches,
      dots: player.bat.dots,
      formats: player.bat.formats.map((row, formatIndex) => ({
        format: FORMATS[formatIndex] ?? "ODI",
        matches: row.m,
        innings: row.inns,
        runs: row.runs,
        balls: row.balls,
        notOuts: row.no,
        highScore: row.hs,
        highScoreNotOut: row.hsNo,
        fours: row.fours,
        sixes: row.sixes,
        outs: row.outs,
        hundreds: row.hundreds,
        fifties: row.fifties,
        ducks: row.ducks,
        dots: row.dots,
      })),
    },
    bowl: {
      innings: player.bowl.inns,
      balls: player.bowl.balls,
      runs: player.bowl.runs,
      wickets: player.bowl.wkts,
      bestWickets: player.bowl.bestW,
      bestRuns: player.bowl.bestR,
      fiveWickets: player.bowl.five,
      dots: player.bowl.dots,
      formats: player.bowl.formats.map((row, formatIndex) => ({
        format: FORMATS[formatIndex] ?? "ODI",
        matches: row.m,
        innings: row.inns,
        balls: row.balls,
        runs: row.runs,
        wickets: row.wkts,
        bestWickets: row.bestW,
        bestRuns: row.bestR,
        fiveWickets: row.five,
        dots: row.dots,
      })),
    },
    seasons,
  };
}

export function getStatsRoster(gender: Gender): StatsRoster {
  const index = db();
  const players: StatsPlayerSummary[] = [];
  index.players.forEach((player, playerIndex) => {
    if (player.gender !== gender) return;
    players.push(summary(player, playerIndex));
  });
  const teams: StatsTeam[] = Object.values(index.teams)
    .filter((team) => team.gender === gender)
    .map((team) => ({
      name: team.name,
      code: team.code,
      gender: team.gender,
      last: team.last,
      bat: team.bat,
      bowl: team.bowl,
      all: team.all,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    generatedAt: index.generatedAt,
    maxDate: index.maxDate,
    cutoff: index.cutoff,
    players,
    teams,
  };
}

export function getStatsPlayer(index: number): StatsPlayer | null {
  if (!Number.isInteger(index) || index < 0 || index >= db().players.length) return null;
  try {
    return playerAt(index);
  } catch {
    return null;
  }
}

function pairFor(batter: number, bowler: number): StatsPair | null {
  const row = db().pairs[`${batter}|${bowler}`];
  if (!row) return null;
  const balls = row[0];
  const runs = row[1];
  const fours = row[2];
  const sixes = row[3];
  const dismissals = row[4];
  const dots = row[5];
  const byFormat = FORMATS.map((format, index) => {
    const base = 7 + index * 4;
    return {
      format,
      matches: row[base],
      balls: row[base + 1],
      runs: row[base + 2],
      dismissals: row[base + 3],
      strikeRate: row[base + 1] > 0 ? (row[base + 2] / row[base + 1]) * 100 : null,
    };
  }).filter((entry) => entry.matches > 0);
  return {
    balls,
    runs,
    fours,
    sixes,
    dismissals,
    dots,
    matches: row[6],
    strikeRate: balls > 0 ? (runs / balls) * 100 : null,
    dotPct: balls > 0 ? (dots / balls) * 100 : null,
    boundaryPct: balls > 0 ? ((fours + sixes) / balls) * 100 : null,
    average: dismissals > 0 ? runs / dismissals : null,
    runningBalls: Math.max(0, balls - dots - fours - sixes),
    byFormat,
    dismissalsByType: [
      { label: "Bowled", value: row[19] },
      { label: "Caught", value: row[20] },
      { label: "LBW", value: row[21] },
      { label: "Stumped", value: row[22] },
      { label: "Other", value: row[23] },
    ],
  };
}

export function getPlayerH2H(batter: number, bowler: number): StatsH2HResponse | null {
  const batterPlayer = getStatsPlayer(batter);
  const bowlerPlayer = getStatsPlayer(bowler);
  if (!batterPlayer || !bowlerPlayer) return null;
  const pair = pairFor(batter, bowler);
  const row = db().pairs[`${batter}|${bowler}`];
  let last: StatsLastEncounter | null = null;
  if (row && row[24] >= 0) {
    const match = matchAt(row[24]);
    if (match) {
      last = {
        match,
        runs: row[25],
        balls: row[26],
        fours: row[27],
        sixes: row[28],
        out: row[29] === 1,
      };
    }
  }
  return { batter: batterPlayer, bowler: bowlerPlayer, pair, last };
}

export function getTeamH2H(teamA: string, teamB: string): StatsTeamH2HResponse {
  const roster = getStatsRoster(teamA.endsWith(" Women") ? "women" : "men");
  const teams = roster.teams.filter((team) => team.name === teamA || team.name === teamB);
  const [first, second] = [teamA, teamB].sort();
  const row = db().records[`${first}|${second}`];
  if (!row) return { teams, record: null };
  const aFirst = teamA === first;
  const byFormat = FORMATS.map((format, index) => ({
    format,
    matches: row[1 + index],
    winsA: row[(aFirst ? 4 : 7) + index],
    winsB: row[(aFirst ? 7 : 4) + index],
  })).filter((entry) => entry.matches > 0);
  const last = matchAt(row[13]);
  const record: StatsTeamRecord = {
    teamA,
    teamB,
    matches: row[0],
    winsA: (aFirst ? row[4] : row[7]) + (aFirst ? row[5] : row[8]) + (aFirst ? row[6] : row[9]),
    winsB: (aFirst ? row[7] : row[4]) + (aFirst ? row[8] : row[5]) + (aFirst ? row[9] : row[6]),
    draws: row[10],
    ties: row[11],
    noResults: row[12],
    byFormat,
    last,
  };
  return { teams, record };
}

export function getActiveTeamNames(gender: Gender): string[] {
  return Object.values(db().teams)
    .filter((team) => team.gender === gender)
    .map((team) => team.name)
    .sort((a, b) => a.localeCompare(b));
}
