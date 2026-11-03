import "server-only";

import championSeasons from "./f1-champions.json";

// ---------------------------------------------------------------------------
// A driver's career, for the profile sheet in the driver directory.
//
// The championship feed caps every response at 100 rows, so career records are
// read as counts: `limit=1` on a filtered results list returns the same `total`
// as the full list, which keeps every lookup to a handful of tiny requests.
// Championship seasons come from the static champions table (one row per
// season since 1950) rather than re-deriving them per driver.
// ---------------------------------------------------------------------------

const BASE = process.env.JOLPICA_BASE ?? "https://api.jolpi.ca/ergast/f1";
const TITLE_YEARS = championSeasons as Record<string, number[]>;
const TTL = 60 * 60_000;

export interface DriverCareer {
  driverId: string;
  /** Seasons the driver won the world championship. */
  championships: number[];
  starts: number;
  wins: number;
  podiums: number;
  poles: number;
  /** Seasons the driver took part in, oldest first. */
  seasons: number[];
  teams: { id: string; name: string }[];
  firstSeason: number | null;
  lastSeason: number | null;
}

const cache = new Map<string, { at: number; data: DriverCareer | null }>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(path: string): Promise<any> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
        next: { revalidate: 60 * 60 },
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`Jolpica ${res.status}`);
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`Jolpica ${res.status} for ${path}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Jolpica request failed: ${path}`);
}

/** Rows a filtered list holds, without downloading the list. */
async function total(path: string): Promise<number> {
  const json = await getJson(`${path}?limit=1`);
  const value = Number(json?.MRData?.total);
  if (!Number.isFinite(value)) throw new Error(`Jolpica returned no total for ${path}`);
  return value;
}

export async function getDriverCareer(driverId: string): Promise<DriverCareer | null> {
  if (!/^[a-z0-9_]+$/i.test(driverId)) return null;
  const hit = cache.get(driverId);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const [starts, wins, seconds, thirds, poles, seasonsJson, teamsJson] = await Promise.all([
      total(`/drivers/${driverId}/results.json`),
      total(`/drivers/${driverId}/results/1.json`),
      total(`/drivers/${driverId}/results/2.json`),
      total(`/drivers/${driverId}/results/3.json`),
      total(`/drivers/${driverId}/qualifying/1.json`),
      getJson(`/drivers/${driverId}/seasons.json?limit=100`),
      getJson(`/drivers/${driverId}/constructors.json?limit=100`),
    ]);

    const seasons: number[] = (seasonsJson?.MRData?.SeasonTable?.Seasons ?? [])
      .map((row: { season?: string }) => Number(row.season))
      .filter((season: number) => Number.isFinite(season))
      .sort((a: number, b: number) => a - b);

    const teams: DriverCareer["teams"] = (teamsJson?.MRData?.ConstructorTable?.Constructors ?? []).map(
      (row: { constructorId: string; name: string }) => ({ id: row.constructorId, name: row.name })
    );

    const data: DriverCareer = {
      driverId,
      championships: TITLE_YEARS[driverId] ?? [],
      starts,
      wins,
      podiums: wins + seconds + thirds,
      poles,
      seasons,
      teams,
      firstSeason: seasons[0] ?? null,
      lastSeason: seasons[seasons.length - 1] ?? null,
    };
    cache.set(driverId, { at: Date.now(), data });
    return data;
  } catch {
    cache.set(driverId, { at: Date.now(), data: null });
    return null;
  }
}
