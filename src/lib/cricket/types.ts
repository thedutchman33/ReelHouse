// Cricket domain model. Every field here is rendered from a live public feed:
// BCCI's match centre for fixtures, results, scorecards and players, and the
// ICC's rankings for tables. There is no sample-data shape to fall back to.

export type Gender = "men" | "women";
export type MatchFormat = "Test" | "ODI" | "T20I";
export type MatchStatus = "upcoming" | "live" | "completed";

export const FORMATS: MatchFormat[] = ["Test", "ODI", "T20I"];

export const FORMAT_LABELS: Record<MatchFormat, string> = {
  Test: "Test",
  ODI: "ODI",
  T20I: "T20I",
};

export interface CricketTeam {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  primary: string;
  secondary: string;
  /** Score as the feed prints it, e.g. "199/4" or "184 & 208". */
  score: string | null;
  scores: {
    inningsNumber: number;
    score: string;
    overs: string;
    isBatting: boolean;
  }[];
}

export interface CricketMatch {
  id: string;
  gid: string;
  /** BCCI's numeric ground id, used for venue-specific data. */
  groundId?: string | null;
  gender: Gender;
  format: MatchFormat;
  formatLabel: string;
  /** Scheduled start, ISO 8601 UTC. */
  date: string;
  /** Last scheduled day for multi-day matches. */
  endDate: string | null;
  /** Actual end timestamp from BCCI's scorecard, when published. */
  endedAt?: string | null;
  series: string;
  title: string;
  matchNumber: string;
  venue: string;
  city: string | null;
  status: MatchStatus;
  statusLabel: string;
  result: string | null;
  teams: CricketTeam[];
  /** True when the BCCI feed is showing an active live score. */
  live: boolean;
}

export interface CricketPlayer {
  id: string;
  /** BCCI's numeric player id, used by the stats feed. */
  playerId?: number | null;
  name: string;
  slug: string;
  gender: Gender;
  role: string;
  grade: string | null;
  style: string | null;
  imageUrl: string | null;
  /** Jersey colour used behind the portrait, when the source knows the team. */
  accent?: string | null;
  active: boolean;
}

export interface PlayerFacts {
  born: string | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
  debut: string | null;
}

export interface PlayerCareerCard {
  label: string;
  value: string;
}

export interface PlayerProfileResponse {
  player: CricketPlayer;
  facts: PlayerFacts | null;
  career: PlayerCareerCard[] | null;
  stats?: PlayerStatsData | null;
}

// ------------------------------ player stats --------------------------------

/** One BCCI career/season/competition batting line. */
export interface PlayerBattingStat {
  label: string;
  format: MatchFormat | null;
  season?: string;
  competition?: string;
  matches: number;
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  average: number | null;
  strikeRate: number | null;
  highScore: string | null;
  hundreds: number;
  fifties: number;
  ducks: number;
  fours: number;
  sixes: number;
  boundaryPct: number | null;
  dotPct: number | null;
  span: string | null;
}

/** One BCCI career/season/competition bowling line. */
export interface PlayerBowlingStat {
  label: string;
  format: MatchFormat | null;
  season?: string;
  competition?: string;
  matches: number;
  innings: number;
  balls: number;
  runsConceded: number;
  wickets: number;
  economy: number | null;
  average: number | null;
  strikeRate: number | null;
  best: string | null;
  fiveWickets: number;
  dotPct: number | null;
  boundaryPct: number | null;
  span: string | null;
}

export interface MatchSquadPlayer {
  playerId: string | null;
  name: string;
  /** Portrait resolved from the board directory or ICC's player feed. */
  imageUrl?: string | null;
  /** ICC headshot to try when the primary portrait 404s. */
  fallbackImageUrl?: string | null;
  role: string;
  captain: boolean;
  viceCaptain: boolean;
  wicketkeeper: boolean;
}

export interface MatchSquad {
  teamId: string;
  teamName: string;
  teamCode: string;
  players: MatchSquadPlayer[];
  /**
   * "xi" once BCCI publishes the playing eleven, "squad" for an announced tour
   * squad, "national" for the board's standing national list.
   */
  source: "xi" | "squad" | "national";
}

export interface MatchSquadsData {
  gid: string;
  squads: MatchSquad[];
  /** True when the match is still waiting for the toss. */
  awaitingToss: boolean;
}

export interface PlayerStatsData {
  playerId: number;
  name: string;
  career: { batting: PlayerBattingStat[]; bowling: PlayerBowlingStat[] };
  seasons: { batting: PlayerBattingStat[]; bowling: PlayerBowlingStat[] };
  competitions: { batting: PlayerBattingStat[]; bowling: PlayerBowlingStat[] };
}

export interface TeamRankingRow {
  position: number;
  name: string;
  code: string;
  rating: number | null;
  points: number | null;
  change: number | null;
}

export interface PlayerRankingRow {
  /** Numeric BCCI id when the rankings row can be joined to the squad feed. */
  playerId?: number | null;
  position: number;
  name: string;
  team: string;
  teamCode: string;
  rating: number;
  change: number | null;
  /** Official ICC headshot, used when the BCCI squad has no portrait. */
  imageUrl: string | null;
}

export interface RankingSet {
  gender: Gender;
  format: MatchFormat;
  /** ISO date of the ranking update, as published by the ICC. */
  asOf: string;
  team: TeamRankingRow[];
  batting: PlayerRankingRow[];
  bowling: PlayerRankingRow[];
  allRounder: PlayerRankingRow[];
}

export interface CricketDashboardData {
  gender: Gender;
  generatedAt: string;
  /** Schedule year used for the calendar heading. */
  season: number;
  fixtures: CricketMatch[];
  results: CricketMatch[];
  players: CricketPlayer[];
}

export interface ScorecardHeader {
  teamNames: string[];
  competitionName: string;
  matchNumberLabel: string;
  venueName: string;
  startDateTimeUtc: string;
  venueTimeZone: string;
  status: string;
  statusLabel: string;
  resultString: string;
}

export interface ScorecardBattingRow {
  playerId: string;
  playerName: string;
  /** ICC headshot when the player appears in an official ranking table. */
  imageUrl?: string | null;
  isWicketKeeper?: boolean;
  battingStyle?: string;
  dismissalString: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: string;
}

export interface ScorecardBowlingRow {
  playerId: string;
  playerName: string;
  imageUrl?: string | null;
  overs: string;
  maidens: number;
  runsConceded: number;
  wickets: number;
  noBalls: number;
  wides: number;
}

export interface ScorecardPartnership {
  runs: number;
  balls: number;
  batter1: { playerId: string; playerName: string };
  batter2: { playerId: string; playerName: string };
}

export interface ScorecardFallOfWicket {
  wicketNumber: number;
  playerId: string;
  playerName: string;
  partnership?: ScorecardPartnership;
}

export interface ScorecardInnings {
  label: string;
  teamId: string;
  inningsNumber: number;
  isSuperOver: boolean;
  isDeclared: boolean;
  isFollowOn: boolean;
  score: string;
  overs: string;
  battingRows: ScorecardBattingRow[];
  didNotBat: { playerId: string; playerName: string; imageUrl?: string | null }[];
  bowlingRows: ScorecardBowlingRow[];
  extras: {
    byes: number;
    legByes: number;
    wides: number;
    noBalls: number;
    penalties: number;
    total: number;
  };
  fallOfWickets: ScorecardFallOfWicket[];
  target: string | null;
}

export interface ScorecardTeam {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  primaryColor?: string;
  secondaryColor?: string;
  score?: string | null;
  scores?: CricketTeam["scores"];
}

export interface ScorecardMatch {
  id: string;
  gid: string;
  status: string;
  statusLabel: string;
  liveStatusName: string;
  resultString: string;
  startDateTimeUtc: string;
  endDateTimeUtc: string | null;
  dateString: string;
  venueLabel: string;
  formatLabel: string;
  competitionLabel: string;
  matchNumberLabel: string;
  teams: ScorecardTeam[];
}

export interface ScorecardData {
  generatedAt: string;
  matchHeader: ScorecardHeader;
  details: {
    competitionLabel: string;
    competitionSeason: string;
    dateString: string;
    startDateTimeUtc: string;
    venueLabel: string;
    venueTimeZone: string;
    tossLabel: string;
    officials: { label: string; names: string[] }[];
    playerOfTheMatch: {
      playerId?: string;
      imageUrl?: string | null;
      firstName: string;
      lastName: string;
      runs?: { score: string; balls: string; isOut: boolean };
      wickets?: { wicketsDown: string; runsConceded: string };
    } | null;
  };
  match: ScorecardMatch;
  innings: ScorecardInnings[];
}
