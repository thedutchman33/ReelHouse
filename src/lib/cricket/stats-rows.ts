import type { PlayerBattingStat, PlayerBowlingStat } from "./types";
import type { StatsPlayer } from "./stats-types";

export function careerSpanLabel(player: StatsPlayer): string {
  const first = player.first?.slice(0, 4);
  const last = player.last?.slice(0, 4);
  if (!first && !last) return "Career";
  if (first === last) return first;
  return `${first}–${last}`;
}

export function battingRows(player: StatsPlayer): PlayerBattingStat[] {
  return player.bat.formats
    .filter((row) => row.innings > 0 || row.matches > 0)
    .map((row) => ({
      label: row.format,
      format: row.format,
      matches: row.matches,
      innings: row.innings,
      notOuts: row.notOuts,
      runs: row.runs,
      balls: row.balls,
      average: row.outs > 0 ? row.runs / row.outs : null,
      strikeRate: row.balls > 0 ? (row.runs / row.balls) * 100 : null,
      highScore: row.innings > 0 ? `${row.highScore}${row.highScoreNotOut ? "*" : ""}` : null,
      hundreds: row.hundreds,
      fifties: row.fifties,
      ducks: row.ducks,
      fours: row.fours,
      sixes: row.sixes,
      boundaryPct: row.balls > 0 ? ((row.fours + row.sixes) / row.balls) * 100 : null,
      dotPct: row.balls > 0 ? (row.dots / row.balls) * 100 : null,
      span: careerSpanLabel(player),
    }));
}

export function bowlingRows(player: StatsPlayer): PlayerBowlingStat[] {
  return player.bowl.formats
    .filter((row) => row.innings > 0 || row.balls > 0)
    .map((row) => ({
      label: row.format,
      format: row.format,
      matches: row.matches,
      innings: row.innings,
      balls: row.balls,
      runsConceded: row.runs,
      wickets: row.wickets,
      economy: row.balls > 0 ? row.runs / (row.balls / 6) : null,
      average: row.wickets > 0 ? row.runs / row.wickets : null,
      strikeRate: row.wickets > 0 ? row.balls / row.wickets : null,
      best: row.innings > 0 ? `${row.bestWickets}/${row.bestRuns}` : null,
      fiveWickets: row.fiveWickets,
      dotPct: row.balls > 0 ? (row.dots / row.balls) * 100 : null,
      boundaryPct: null,
      span: careerSpanLabel(player),
    }));
}

export function seasonRunPoints(player: StatsPlayer): { label: string; value: number }[] {
  return player.seasons
    .filter((season) => season.matches > 0)
    .map((season) => ({ label: String(season.year), value: season.runs }));
}

export function seasonWicketPoints(player: StatsPlayer): { label: string; value: number }[] {
  return player.seasons
    .filter((season) => season.matches > 0)
    .map((season) => ({ label: String(season.year), value: season.wickets }));
}

export function seasonStrikeRatePoints(player: StatsPlayer): { label: string; value: number }[] {
  return player.seasons
    .filter((season) => season.balls > 0)
    .map((season) => ({
      label: String(season.year),
      value: Number(((season.runs / season.balls) * 100).toFixed(1)),
    }));
}

export function seasonBowlingStrikeRatePoints(player: StatsPlayer): { label: string; value: number }[] {
  return player.seasons
    .filter((season) => season.wickets > 0)
    .map((season) => ({
      label: String(season.year),
      value: Number((season.bowlBalls / season.wickets).toFixed(1)),
    }));
}

export function battingAverage(player: StatsPlayer): number | null {
  return player.bat.outs > 0 ? player.bat.runs / player.bat.outs : null;
}

export function battingStrikeRate(player: StatsPlayer): number | null {
  return player.bat.balls > 0 ? (player.bat.runs / player.bat.balls) * 100 : null;
}

export function battingBoundaryPct(player: StatsPlayer): number | null {
  return player.bat.balls > 0 ? ((player.bat.fours + player.bat.sixes) / player.bat.balls) * 100 : null;
}

export function battingDotPct(player: StatsPlayer): number | null {
  return player.bat.balls > 0 ? (player.bat.dots / player.bat.balls) * 100 : null;
}

export function battingRunsPerInnings(player: StatsPlayer): number | null {
  return player.bat.innings > 0 ? player.bat.runs / player.bat.innings : null;
}

export function battingFiftyRate(player: StatsPlayer): number | null {
  if (player.bat.innings <= 0) return null;
  return ((player.bat.hundreds + player.bat.fifties) / player.bat.innings) * 100;
}

export function battingSixRate(player: StatsPlayer): number | null {
  return player.bat.balls > 0 ? (player.bat.sixes / player.bat.balls) * 100 : null;
}

export function bowlingEconomy(player: StatsPlayer): number | null {
  return player.bowl.balls > 0 ? player.bowl.runs / (player.bowl.balls / 6) : null;
}

export function bowlingAverage(player: StatsPlayer): number | null {
  return player.bowl.wickets > 0 ? player.bowl.runs / player.bowl.wickets : null;
}

export function bowlingStrikeRate(player: StatsPlayer): number | null {
  return player.bowl.wickets > 0 ? player.bowl.balls / player.bowl.wickets : null;
}

export function bowlingDotPct(player: StatsPlayer): number | null {
  return player.bowl.balls > 0 ? (player.bowl.dots / player.bowl.balls) * 100 : null;
}

export function bowlingWicketsPerInnings(player: StatsPlayer): number | null {
  return player.bowl.innings > 0 ? player.bowl.wickets / player.bowl.innings : null;
}
