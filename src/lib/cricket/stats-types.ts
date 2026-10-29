import type { Gender, MatchFormat } from "./types";

export type CricketRole = "Batter" | "Bowler" | "All-rounder";

export interface StatsBattingFormat {
  format: MatchFormat;
  matches: number;
  innings: number;
  runs: number;
  balls: number;
  notOuts: number;
  highScore: number;
  highScoreNotOut: boolean;
  fours: number;
  sixes: number;
  outs: number;
  hundreds: number;
  fifties: number;
  ducks: number;
  dots: number;
}

export interface StatsBowlingFormat {
  format: MatchFormat;
  matches: number;
  innings: number;
  balls: number;
  runs: number;
  wickets: number;
  bestWickets: number;
  bestRuns: number;
  fiveWickets: number;
  dots: number;
}

export interface StatsSeason {
  year: number;
  matches: number;
  runs: number;
  balls: number;
  wickets: number;
  bowlBalls: number;
}

export interface StatsPlayerSummary {
  index: number;
  id: string;
  name: string;
  /** ICC player id, when the generated name index could match one. */
  iccId: string | null;
  gender: Gender;
  team: string;
  role: CricketRole;
  first: string;
  last: string;
  matches: number;
}

export interface StatsPlayer extends StatsPlayerSummary {
  bat: {
    innings: number;
    runs: number;
    balls: number;
    notOuts: number;
    highScore: number;
    highScoreNotOut: boolean;
    fours: number;
    sixes: number;
    outs: number;
    hundreds: number;
    fifties: number;
    ducks: number;
    catches: number;
    dots: number;
    formats: StatsBattingFormat[];
  };
  bowl: {
    innings: number;
    balls: number;
    runs: number;
    wickets: number;
    bestWickets: number;
    bestRuns: number;
    fiveWickets: number;
    dots: number;
    formats: StatsBowlingFormat[];
  };
  seasons: StatsSeason[];
}

export interface StatsTeam {
  name: string;
  code: string;
  gender: Gender;
  last: string;
  /** Player indices, biggest batting contribution first. */
  bat: number[];
  /** Player indices, biggest wicket haul first. */
  bowl: number[];
  all: number[];
}

export interface StatsRoster {
  generatedAt: string;
  maxDate: string;
  cutoff: string;
  players: StatsPlayerSummary[];
  teams: StatsTeam[];
}

export interface StatsMatch {
  date: string;
  venue: string;
  city: string;
  teamA: string;
  teamB: string;
  winner: string;
  result: string;
  format: MatchFormat;
  gender: Gender;
}

export interface StatsLastEncounter {
  match: StatsMatch;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
}

export interface StatsPair {
  balls: number;
  runs: number;
  fours: number;
  sixes: number;
  dismissals: number;
  dots: number;
  matches: number;
  strikeRate: number | null;
  dotPct: number | null;
  boundaryPct: number | null;
  average: number | null;
  /** Balls in which the batter scored 1, 2 or 3. */
  runningBalls: number;
  byFormat: {
    format: MatchFormat;
    matches: number;
    balls: number;
    runs: number;
    dismissals: number;
    strikeRate: number | null;
  }[];
  dismissalsByType: { label: string; value: number }[];
}

export interface StatsH2HResponse {
  batter: StatsPlayer;
  bowler: StatsPlayer;
  pair: StatsPair | null;
  last: StatsLastEncounter | null;
}

export interface StatsTeamRecord {
  teamA: string;
  teamB: string;
  matches: number;
  winsA: number;
  winsB: number;
  draws: number;
  ties: number;
  noResults: number;
  byFormat: {
    format: MatchFormat;
    matches: number;
    winsA: number;
    winsB: number;
  }[];
  last: StatsMatch | null;
}

export interface StatsTeamH2HResponse {
  teams: StatsTeam[];
  record: StatsTeamRecord | null;
}

export interface StatsCareerResponse {
  player: StatsPlayer;
  /** Same-role peers, used for percentile ranks in the compare radar. */
  peers: number;
}
