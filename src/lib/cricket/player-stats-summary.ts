import type {
  MatchFormat,
  PlayerBattingStat,
  PlayerBowlingStat,
  PlayerStatsData,
} from "./types";

export interface BattingSummary {
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
  boundaryRuns: number;
  runningRuns: number;
  boundaryShare: number | null;
  boundaryRate: number | null;
  dotPct: number | null;
}

export interface BowlingSummary {
  matches: number;
  innings: number;
  balls: number;
  conceded: number;
  wickets: number;
  economy: number | null;
  average: number | null;
  strikeRate: number | null;
  best: string | null;
  fiveWickets: number;
  dotPct: number | null;
  boundaryPct: number | null;
}

export interface SeasonPoint {
  label: string;
  value: number;
}

export const INTERNATIONAL_FORMATS: MatchFormat[] = ["Test", "ODI", "T20I"];

export function internationalBatting(rows: PlayerBattingStat[]): PlayerBattingStat[] {
  return rows.filter((row) => row.format != null);
}

export function internationalBowling(rows: PlayerBowlingStat[]): PlayerBowlingStat[] {
  return rows.filter((row) => row.format != null);
}

function weighted(values: { value: number | null; weight: number }[]): number | null {
  const usable = values.filter((row) => row.value != null && row.weight > 0);
  const total = usable.reduce((sum, row) => sum + row.weight, 0);
  if (!usable.length || total === 0) return null;
  return usable.reduce((sum, row) => sum + (row.value ?? 0) * row.weight, 0) / total;
}

function highScoreOf(values: (string | null)[]): string | null {
  let best: string | null = null;
  let bestValue = -1;
  for (const value of values) {
    if (!value) continue;
    const parsed = Number(value.replace(/[^0-9]/g, ""));
    if (Number.isFinite(parsed) && parsed > bestValue) {
      best = value;
      bestValue = parsed;
    }
  }
  return best;
}

export function summariseBatting(rows: PlayerBattingStat[]): BattingSummary {
  const matches = rows.reduce((sum, row) => sum + row.matches, 0);
  const innings = rows.reduce((sum, row) => sum + row.innings, 0);
  const notOuts = rows.reduce((sum, row) => sum + row.notOuts, 0);
  const runs = rows.reduce((sum, row) => sum + row.runs, 0);
  const balls = rows.reduce((sum, row) => sum + row.balls, 0);
  const fours = rows.reduce((sum, row) => sum + row.fours, 0);
  const sixes = rows.reduce((sum, row) => sum + row.sixes, 0);
  const boundaryRuns = fours * 4 + sixes * 6;
  const outs = Math.max(0, innings - notOuts);
  return {
    matches,
    innings,
    notOuts,
    runs,
    balls,
    average: outs > 0 ? runs / outs : null,
    strikeRate: balls > 0 ? (runs / balls) * 100 : null,
    highScore: highScoreOf(rows.map((row) => row.highScore)),
    hundreds: rows.reduce((sum, row) => sum + row.hundreds, 0),
    fifties: rows.reduce((sum, row) => sum + row.fifties, 0),
    ducks: rows.reduce((sum, row) => sum + row.ducks, 0),
    fours,
    sixes,
    boundaryRuns,
    runningRuns: Math.max(0, runs - boundaryRuns),
    boundaryShare: runs > 0 ? (boundaryRuns / runs) * 100 : null,
    boundaryRate: balls > 0 ? ((fours + sixes) / balls) * 100 : null,
    dotPct: weighted(rows.map((row) => ({ value: row.dotPct, weight: row.balls }))),
  };
}

function bestBowlingOf(rows: PlayerBowlingStat[]): string | null {
  let best: { wickets: number; conceded: number; label: string } | null = null;
  for (const row of rows) {
    if (!row.best) continue;
    const match = /^(\d+)\s*[/-]\s*(\d+)/.exec(row.best);
    if (!match) continue;
    const wickets = Number(match[1]);
    const conceded = Number(match[2]);
    if (
      !best ||
      wickets > best.wickets ||
      (wickets === best.wickets && conceded < best.conceded)
    ) {
      best = { wickets, conceded, label: row.best };
    }
  }
  return best?.label ?? null;
}

export function summariseBowling(rows: PlayerBowlingStat[]): BowlingSummary {
  const matches = rows.reduce((sum, row) => sum + row.matches, 0);
  const innings = rows.reduce((sum, row) => sum + row.innings, 0);
  const balls = rows.reduce((sum, row) => sum + row.balls, 0);
  const conceded = rows.reduce((sum, row) => sum + row.runsConceded, 0);
  const wickets = rows.reduce((sum, row) => sum + row.wickets, 0);
  return {
    matches,
    innings,
    balls,
    conceded,
    wickets,
    economy: balls > 0 ? conceded / (balls / 6) : null,
    average: wickets > 0 ? conceded / wickets : null,
    strikeRate: wickets > 0 ? balls / wickets : null,
    best: bestBowlingOf(rows),
    fiveWickets: rows.reduce((sum, row) => sum + row.fiveWickets, 0),
    dotPct: weighted(rows.map((row) => ({ value: row.dotPct, weight: row.balls }))),
    boundaryPct: weighted(rows.map((row) => ({ value: row.boundaryPct, weight: row.balls }))),
  };
}

function metricValue(
  row: PlayerBattingStat | PlayerBowlingStat,
  metric: "runs" | "wickets" | "matches"
): number {
  if (metric === "matches") return row.matches;
  if (metric === "runs") return "runs" in row ? row.runs : 0;
  return "wickets" in row ? row.wickets : 0;
}

export function seasonSeries(
  rows: PlayerBattingStat[] | PlayerBowlingStat[],
  metric: "runs" | "wickets" | "matches"
): SeasonPoint[] {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    if (!row.season || row.format == null) continue;
    grouped.set(row.season, (grouped.get(row.season) ?? 0) + metricValue(row, metric));
  }
  return [...grouped.entries()]
    .sort((a, b) => {
      const year = (label: string) => Number.parseInt(label.slice(0, 4), 10) || 0;
      return year(a[0]) - year(b[0]) || a[0].localeCompare(b[0]);
    })
    .slice(-9)
    .map(([label, value]) => ({ label, value }));
}

export function competitionSeries(
  rows: PlayerBattingStat[] | PlayerBowlingStat[],
  metric: "runs" | "wickets",
  limit = 6
): { label: string; value: number }[] {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    if (!row.competition) continue;
    grouped.set(row.competition, (grouped.get(row.competition) ?? 0) + metricValue(row, metric));
  }
  return [...grouped.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

export function formatSplit(
  rows: PlayerBattingStat[] | PlayerBowlingStat[],
  metric: "runs" | "wickets"
): { label: MatchFormat; value: number }[] {
  return INTERNATIONAL_FORMATS.map((format) => ({
    label: format,
    value: rows
      .filter((row) => row.format === format)
      .reduce((sum, row) => sum + metricValue(row, metric), 0),
  })).filter((entry) => entry.value > 0);
}

export function careerSpan(stats: PlayerStatsData): string | null {
  const rows = [...stats.career.batting, ...stats.career.bowling].filter(
    (row) => row.format != null && row.span
  );
  if (!rows.length) return null;
  const spans = rows.map((row) => row.span as string).sort();
  const first = spans[0]?.split("-")[0];
  const last = spans
    .map((span) => span.split("-").at(-1) ?? span)
    .sort()
    .at(-1);
  return first && last ? `${first}–${last}` : null;
}

export function hasBatting(stats: PlayerStatsData | null): boolean {
  return Boolean(stats && internationalBatting(stats.career.batting).some((row) => row.innings > 0));
}

export function hasBowling(stats: PlayerStatsData | null): boolean {
  return Boolean(
    stats &&
      internationalBowling(stats.career.bowling).some(
        (row) => row.innings > 0 || row.balls > 0
      )
  );
}

export function isBatterRole(role: string): boolean {
  return /bat|wicket|all/i.test(role);
}

export function isBowlerRole(role: string): boolean {
  return /bowl|all/i.test(role);
}
