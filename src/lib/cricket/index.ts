import "server-only";

import type {
  CricketDashboardData,
  CricketMatch,
  Gender,
  RankingSet,
  ScorecardData,
} from "./types";
import {
  fetchBcciLive,
  fetchBcciMatches,
  fetchBcciPlayers,
  fetchBcciScorecard,
  normalizeBcciMatch,
} from "./providers/bcci";
import { fetchIccRankings } from "./providers/icc-rankings";
import { playerNameKey, sortPlayers } from "./shared";

export * from "./types";
export * from "./shared";

// ---------------------------------------------------------------------------
// Request-time composition. Every source is live: BCCI for matches/players,
// ICC for rankings. Failure leaves the affected section empty; nothing is
// replaced with sample data.
// ---------------------------------------------------------------------------

function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function dedupe(matches: CricketMatch[]): CricketMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    if (seen.has(match.gid)) return false;
    seen.add(match.gid);
    return true;
  });
}

/**
 * One dashboard read. Current and next season's fixtures are loaded because a
 * tour can cross New Year; results are the latest page of the current season.
 * A failed source only empties its own section.
 */
export async function getCricketDashboard(gender: Gender): Promise<CricketDashboardData> {
  const now = new Date();
  const season = now.getUTCFullYear();
  const [currentFixtures, nextFixtures, results, live, players] = await Promise.allSettled([
    fetchBcciMatches(gender, "fixtures", season),
    fetchBcciMatches(gender, "fixtures", season + 1),
    fetchBcciMatches(gender, "results", season),
    fetchBcciLive(),
    fetchBcciPlayers(gender),
  ]);

  const liveMatches = fulfilled(live) ?? [];
  const liveGids = new Set(liveMatches.map((match) => match.gid));

  const rawFixtures = [...(fulfilled(currentFixtures) ?? []), ...(fulfilled(nextFixtures) ?? [])];
  const fixtureMatches = dedupe(
    rawFixtures
      .map((match) => normalizeBcciMatch(match, gender, liveGids))
      .filter((match): match is CricketMatch => Boolean(match))
      .filter((match) => match.status !== "completed")
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // A live match can be older than the first fixture page; make sure it's here.
  for (const match of liveMatches) {
    if (fixtureMatches.some((entry) => entry.gid === match.gid)) continue;
    const normalized = normalizeBcciMatch(match, gender, liveGids);
    if (normalized && normalized.status === "live") fixtureMatches.push(normalized);
  }
  fixtureMatches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const resultMatches = dedupe(
    (fulfilled(results) ?? [])
      .map((match) => normalizeBcciMatch(match, gender))
      .filter((match): match is CricketMatch => Boolean(match))
      .filter((match) => match.status === "completed")
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // The list feed has no end timestamp, but the scorecard does. Enrich only the
  // latest result and only around its match window: this is what lets a fresh
  // page load keep the Watch Live button for the 30 minutes after the finish.
  const latestResult = resultMatches[0];
  const latestStart = latestResult ? new Date(latestResult.date).getTime() : Number.NaN;
  const latestEndDay = latestResult?.endDate
    ? new Date(`${latestResult.endDate}T23:59:59Z`).getTime()
    : latestStart;
  const resultIsRecent =
    Number.isFinite(latestStart) &&
    (now.getTime() - latestStart < 12 * 3600_000 || now.getTime() - latestEndDay < 12 * 3600_000);
  if (latestResult && resultIsRecent) {
    try {
      const card = await fetchBcciScorecard(latestResult.gid);
      latestResult.endedAt = card.match.endDateTimeUtc ?? null;
    } catch {
      // No scorecard means no exact end time; the client falls back to its own
      // live-to-ended transition if it observed the match.
    }
  }

  const roster = sortPlayers(fulfilled(players) ?? []);

  return {
    gender,
    generatedAt: now.toISOString(),
    season,
    fixtures: fixtureMatches,
    results: resultMatches,
    players: roster,
  };
}

/** ICC tables are a separate, slowly-changing read (six-hour cache). */
export async function getCricketRankings(gender: Gender): Promise<RankingSet[]> {
  const sets = await fetchIccRankings();
  return (sets ?? []).filter((set) => set.gender === gender);
}

/**
 * BCCI scorecards name the players but do not carry their portraits. The ICC
 * publishes official headshots for the same internationals, so match those
 * names into the scorecard before it is cached. Players outside the ranking
 * tables keep the BCCI asset URL / initials fallback in the UI.
 */
export function attachIccPlayerPhotos(
  scorecard: ScorecardData,
  photos: Map<string, string>
): ScorecardData {
  const withPhoto = <T extends { playerName: string; imageUrl?: string | null }>(row: T): T => ({
    ...row,
    imageUrl: photos.get(playerNameKey(row.playerName)) ?? row.imageUrl ?? null,
  });

  const playerOfTheMatch = scorecard.details.playerOfTheMatch;
  return {
    ...scorecard,
    details: {
      ...scorecard.details,
      playerOfTheMatch: playerOfTheMatch
        ? {
            ...playerOfTheMatch,
            imageUrl:
              photos.get(
                playerNameKey(`${playerOfTheMatch.firstName} ${playerOfTheMatch.lastName}`)
              ) ??
              playerOfTheMatch.imageUrl ??
              null,
          }
        : null,
    },
    innings: scorecard.innings.map((innings) => ({
      ...innings,
      battingRows: innings.battingRows.map(withPhoto),
      bowlingRows: innings.bowlingRows.map(withPhoto),
      didNotBat: innings.didNotBat.map(withPhoto),
    })),
  };
}
