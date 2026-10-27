/**
 * Championship standings data layer.
 *
 * Source: Jolpica F1 (the community Ergast successor) — `api.jolpi.ca`. It is
 * the only free, documented feed that carries complete historical seasons
 * (1950→today): final classifications, every race result, qualifying and
 * sprint grids. OpenF1 only covers 2023+ and publishes no championship table,
 * so standings cannot be derived from it for older seasons.
 *
 * Everything below turns those raw payloads into the shapes the UI needs:
 * cumulative points per round, computed championship ranks (the progression
 * charts), season statistics, head-to-head records and round winners. The
 * official classification itself is never recomputed — `position` and
 * `points` come straight from the provider's standings endpoint.
 */

const BASE = process.env.JOLPICA_BASE ?? "https://api.jolpi.ca/ergast/f1";
const PAGE = 100;
const SEASON_TTL = 10 * 60_000;
const SEASONS_TTL = 24 * 60 * 60_000;

// ------------------------------- raw shapes --------------------------------

interface RawDriver {
  driverId: string;
  permanentNumber?: string;
  code?: string;
  givenName: string;
  familyName: string;
  nationality: string;
}
interface RawConstructor {
  constructorId: string;
  name: string;
  nationality?: string;
}
interface RawStanding {
  position: string;
  positionText: string;
  points: string;
  wins: string;
  Driver?: RawDriver;
  Constructors?: RawConstructor[];
  Constructor?: RawConstructor;
}
interface RawResult {
  number: string;
  position: string;
  positionText: string;
  points: string;
  grid: string;
  laps: string;
  status: string;
  Driver: RawDriver;
  Constructor: RawConstructor;
  Time?: { millis?: string; time: string };
  FastestLap?: { rank?: string; lap?: string; Time?: { time?: string } };
}
interface RawQuali {
  position: string;
  Driver: RawDriver;
  Constructor: RawConstructor;
  Q1?: string;
  Q2?: string;
  Q3?: string;
}
interface RawSprint {
  position: string;
  points: string;
  grid: string;
  Driver: RawDriver;
  Constructor: RawConstructor;
}
interface RawRace {
  season: string;
  round: string;
  raceName: string;
  date: string;
  Circuit: { circuitId: string; circuitName: string; Location: { country: string } };
  Results?: RawResult[];
  QualifyingResults?: RawQuali[];
  SprintResults?: RawSprint[];
}

// ------------------------------ public types -------------------------------

export interface DriverRef {
  id: string;
  code: string;
  name: string;
  givenName: string;
  familyName: string;
  number: string | null;
  nationality: string;
  teamId: string;
  teamName: string;
  colour: string;
  /** F1 media portrait, resolved for every season (null when unavailable). */
  headshotUrl: string | null;
}

export interface TeamRef {
  id: string;
  name: string;
  colour: string;
  /** ReelHouse asset name for `TeamLogo` (null when we have no mark). */
  logoName: string | null;
}

export interface StandingRow {
  position: number;
  id: string;
  name: string;
  code: string;
  teamId: string;
  teamName: string;
  colour: string;
  /** F1 media portrait for the driver rows; null for constructors and untraced drivers. */
  headshotUrl: string | null;
  points: number;
  wins: number;
  /** Points behind the leader (0 for the leader). */
  gap: number;
  /** Places gained (+) or lost (−) since the previous round; null on round 1. */
  change: number | null;
}

export interface RoundInfo {
  round: number;
  name: string;
  circuitId: string;
  circuitName: string;
  country: string;
  date: string;
  sprint: boolean;
  /** True when a race result exists for this round. */
  complete: boolean;
}

export interface DriverSeasonStats {
  driverId: string;
  starts: number;
  wins: number;
  podiums: number;
  pointsFinishes: number;
  poles: number;
  q3Appearances: number;
  dnfs: number;
  sprintWins: number;
  sprintPodiums: number;
  fastestLaps: number;
  avgFinish: number | null;
  positionsGained: number;
  bestFinish: number | null;
  bestGrid: number | null;
}

export interface TeamSeasonStats {
  teamId: string;
  wins: number;
  podiums: number;
  pointsFinishes: number;
  poles: number;
  dnfs: number;
  starts: number;
}

export interface RoundSummary {
  round: number;
  name: string;
  sprint: boolean;
  sprintPole: string | null;
  sprintWinner: string | null;
  pole: string | null;
  winner: string | null;
}

export interface FastestEntry {
  round: number;
  roundName: string;
  driverId: string;
  time: number;
  session: "Q" | "R";
}

export interface SeasonCards {
  mostWins: { driverId: string; teamId: string; value: number } | null;
  mostPodiums: { driverId: string; teamId: string; value: number } | null;
  mostPoles: { driverId: string; teamId: string; value: number } | null;
  bestAverage: { driverId: string; teamId: string; value: number } | null;
  mostGained: { driverId: string; teamId: string; value: number } | null;
  comeback: { driverId: string; round: number; roundName: string; grid: number; finish: number } | null;
  largestMargin: { driverId: string; round: number; roundName: string; margin: number } | null;
  closestMargin: { driverId: string; round: number; roundName: string; margin: number } | null;
  lapsByTeam: { teamId: string; laps: number }[];
}

export interface SeasonPayload {
  season: number;
  rounds: RoundInfo[];
  drivers: DriverRef[];
  teams: TeamRef[];
  driverStandings: StandingRow[];
  constructorStandings: StandingRow[];
  /** Cumulative points per driver per round (index 0 = round 1). */
  pointsByRound: Record<string, number[]>;
  /** Computed championship position per driver per round (inverted charts). */
  ranksByRound: Record<string, number[]>;
  /** Points scored each round (race + sprint), for the matrix/stacked bars. */
  roundPoints: Record<string, number[]>;
  /** Grand prix points only. */
  racePointsByRound: Record<string, number[]>;
  /** Sprint points only (zero when the round has no sprint). */
  sprintPointsByRound: Record<string, number[]>;
  /** Sprint finishing position per round. */
  sprintByRound: Record<string, (number | null)[]>;
  /** Sprint qualifying (sprint grid) position per round. */
  sprintGridByRound: Record<string, (number | null)[]>;
  /** Constructor points per round / computed constructor rank per round. */
  teamPointsByRound: Record<string, number[]>;
  teamRanksByRound: Record<string, number[]>;
  /** Qualifying time gap to the team-mate in seconds (negative = quicker). */
  qualiGapByRound: Record<string, (number | null)[]>;
  /** Race time gap to the team-mate in seconds (negative = quicker). */
  raceGapByRound: Record<string, (number | null)[]>;
  driverStats: Record<string, DriverSeasonStats>;
  teamStats: Record<string, TeamSeasonStats>;
  roundSummaries: RoundSummary[];
  fastest: FastestEntry[];
  cards: SeasonCards;
  /** Grid→finish per round, used by the start/finish flow + H2H. */
  roundPositions: Record<string, { grid: number | null; finish: number | null; status: string }[]>;
  /** Qualifying position per round (null when the driver did not take part). */
  qualiByRound: Record<string, (number | null)[]>;
  /** Race position per round (null when the driver did not take part). */
  raceByRound: Record<string, (number | null)[]>;
  /** Round winner ids, handy for the stats views. */
  winnersByRound: (string | null)[];
}

// --------------------------- provider utilities ----------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(path: string): Promise<any> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`Jolpica ${res.status} for ${path}`);
        await sleep(500 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`Jolpica ${res.status} for ${path}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      await sleep(300 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Jolpica request failed: ${path}`);
}

/** The API caps every page at 100 rows, whatever `limit` asks for. */
async function pagedRaces(path: string, collection: "Results" | "QualifyingResults" | "SprintResults") {
  const byRound = new Map<number, RawRace[]>();
  let offset = 0;
  let total = Infinity;
  let safety = 0;
  while (offset < total && safety < 20) {
    safety++;
    const json = await getJson(`${path}?limit=${PAGE}&offset=${offset}`);
    const table = json?.MRData?.RaceTable;
    if (!table) break;
    total = Number(json.MRData.total ?? 0);
    const races: RawRace[] = table.Races ?? [];
    for (const race of races) {
      if (!Array.isArray(race[collection])) continue;
      const round = Number(race.round);
      const list = byRound.get(round) ?? [];
      // The same race can span two pages; keep the richer copy.
      const existing = list.find((r) => r.round === race.round);
      if (existing) {
        const merged: RawRace = {
          ...existing,
          [collection]: [...(existing[collection] ?? []), ...(race[collection] ?? [])],
        };
        list[list.indexOf(existing)] = merged;
      } else {
        list.push(race);
        byRound.set(round, list);
      }
    }
    offset += PAGE;
    if (!races.length) break;
    await sleep(40);
  }
  return byRound;
}

// ------------------------------ team metadata ------------------------------

const TEAM_META: Record<string, { name: string; colour: string; logo: string | null }> = {
  mercedes: { name: "Mercedes", colour: "27f4d2", logo: "Mercedes" },
  ferrari: { name: "Ferrari", colour: "e8002d", logo: "Ferrari" },
  red_bull: { name: "Red Bull Racing", colour: "3671c6", logo: "Red Bull Racing" },
  mclaren: { name: "McLaren", colour: "ff8000", logo: "McLaren" },
  aston_martin: { name: "Aston Martin", colour: "229971", logo: "Aston Martin" },
  alpine: { name: "Alpine", colour: "ff87bc", logo: "Alpine" },
  williams: { name: "Williams", colour: "64c4ff", logo: "Williams" },
  rb: { name: "Racing Bulls", colour: "6692ff", logo: "Racing Bulls" },
  haas: { name: "Haas F1 Team", colour: "b6babd", logo: "Haas F1 Team" },
  audi: { name: "Audi", colour: "52e252", logo: "Audi" },
  sauber: { name: "Sauber", colour: "52e252", logo: null },
  cadillac: { name: "Cadillac", colour: "c9a227", logo: "Cadillac" },
  alphatauri: { name: "AlphaTauri", colour: "6692ff", logo: null },
  toro_rosso: { name: "Toro Rosso", colour: "469bff", logo: null },
  racing_point: { name: "Racing Point", colour: "ff87bc", logo: null },
  force_india: { name: "Force India", colour: "ff87bc", logo: null },
  renault: { name: "Renault", colour: "fff500", logo: null },
  lotus: { name: "Lotus", colour: "d4a600", logo: null },
  brawn: { name: "Brawn", colour: "b7f900", logo: null },
  toyota: { name: "Toyota", colour: "cc0000", logo: null },
  bmw_sauber: { name: "BMW Sauber", colour: "3366cc", logo: null },
  honda: { name: "Honda", colour: "e8e8e8", logo: null },
  jaguar: { name: "Jaguar", colour: "0b7a3b", logo: null },
  benetton: { name: "Benetton", colour: "00a551", logo: null },
  minardi: { name: "Minardi", colour: "f2d000", logo: null },
  jordan: { name: "Jordan", colour: "f7d417", logo: null },
  arrows: { name: "Arrows", colour: "e27300", logo: null },
  prost: { name: "Prost", colour: "2554a0", logo: null },
  stewart: { name: "Stewart", colour: "ffffff", logo: null },
  bar: { name: "BAR", colour: "7ac4c4", logo: null },
};

function teamMeta(id: string, fallbackName?: string) {
  return (
    TEAM_META[id] ?? {
      name: fallbackName ?? id,
      colour: "8a8a93",
      logo: null,
    }
  );
}

/** Lighten a hex colour towards white; the second car in a team uses this so
 *  team-mates never share a line colour in the charts. */
function lighten(hex: string, amount: number): string {
  const raw = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(raw)) return hex;
  const value = parseInt(raw, 16);
  const mix = (channel: number) =>
    Math.round(channel + (255 - channel) * amount)
      .toString(16)
      .padStart(2, "0");
  return `${mix((value >> 16) & 255)}${mix((value >> 8) & 255)}${mix(value & 255)}`;
}

// ------------------------------- parsing -----------------------------------

function seconds(value?: string | null): number | null {
  if (!value) return null;
  const parts = value.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(value);
}

const isClassified = (status: string) => /^Finished$/.test(status) || /^\+\d+ Laps?$/.test(status);
const isDnf = (status: string) => !isClassified(status);

function bestQuali(q: RawQuali): number | null {
  const times = [q.Q3, q.Q2, q.Q1].map(seconds).filter((v): v is number => v != null && v > 0);
  return times.length ? Math.min(...times) : null;
}

// --------------------------- season assembly -------------------------------

interface SeasonRaw {
  races: RawRace[];
  results: Map<number, RawResult[]>;
  qualifying: Map<number, RawQuali[]>;
  sprint: Map<number, RawSprint[]>;
  driverStandings: RawStanding[];
  constructorStandings: RawStanding[];
  round: number;
}

async function loadRaw(season: number): Promise<SeasonRaw> {
  const racesJson = await getJson(`/${season}/races.json?limit=${PAGE}`);
  const races: RawRace[] = racesJson?.MRData?.RaceTable?.Races ?? [];

  const [resultsPages, qualiPages, sprintPages, ds, cs] = await Promise.all([
    pagedRaces(`/${season}/results.json`, "Results"),
    pagedRaces(`/${season}/qualifying.json`, "QualifyingResults"),
    pagedRaces(`/${season}/sprint.json`, "SprintResults"),
    getJson(`/${season}/driverstandings.json?limit=${PAGE}`),
    getJson(`/${season}/constructorstandings.json?limit=${PAGE}`),
  ]);

  const flatten = <T,>(pages: Map<number, RawRace[]>, key: "Results" | "QualifyingResults" | "SprintResults") => {
    const out = new Map<number, T[]>();
    for (const [round, list] of pages) {
      const rows: T[] = [];
      for (const race of list) rows.push(...((race[key] ?? []) as T[]));
      out.set(round, rows);
    }
    return out;
  };

  const driverStandings: RawStanding[] =
    ds?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
  const constructorStandings: RawStanding[] =
    cs?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [];
  const round = Number(
    ds?.MRData?.StandingsTable?.StandingsLists?.[0]?.round ??
      cs?.MRData?.StandingsTable?.StandingsLists?.[0]?.round ??
      0
  );

  return {
    races,
    results: flatten<RawResult>(resultsPages, "Results"),
    qualifying: flatten<RawQuali>(qualiPages, "QualifyingResults"),
    sprint: flatten<RawSprint>(sprintPages, "SprintResults"),
    driverStandings,
    constructorStandings,
    round,
  };
}

function assemble(season: number, raw: SeasonRaw): SeasonPayload {
  const rounds: RoundInfo[] = raw.races.map((r) => ({
    round: Number(r.round),
    name: r.raceName,
    circuitId: r.Circuit.circuitId,
    circuitName: r.Circuit.circuitName,
    country: r.Circuit.Location.country,
    date: r.date,
    sprint: (raw.sprint.get(Number(r.round))?.length ?? 0) > 0,
    complete: (raw.results.get(Number(r.round))?.length ?? 0) > 0,
  }));
  const roundCount = rounds.length;

  // Driver + team directories from the standings (identity) and the results
  // feed (three-letter codes, which the standings omit).
  const codeById = new Map<string, string>();
  const teamByDriver = new Map<string, string>();
  for (const list of raw.results.values()) {
    for (const row of list) {
      if (row.Driver.code) codeById.set(row.Driver.driverId, row.Driver.code);
      teamByDriver.set(row.Driver.driverId, row.Constructor.constructorId);
    }
  }
  for (const list of raw.qualifying.values()) {
    for (const row of list) {
      if (!teamByDriver.has(row.Driver.driverId)) {
        teamByDriver.set(row.Driver.driverId, row.Constructor.constructorId);
      }
    }
  }

  const drivers: DriverRef[] = raw.driverStandings.map((s) => {
    const d = s.Driver!;
    const teamId = s.Constructors?.[0]?.constructorId ?? teamByDriver.get(d.driverId) ?? "";
    const meta = teamMeta(teamId, s.Constructors?.[0]?.name);
    return {
      id: d.driverId,
      code: codeById.get(d.driverId) ?? d.familyName.slice(0, 3).toUpperCase(),
      name: `${d.givenName} ${d.familyName}`,
      givenName: d.givenName,
      familyName: d.familyName,
      number: d.permanentNumber ?? null,
      nationality: d.nationality,
      teamId,
      teamName: meta.name,
      colour: meta.colour,
      headshotUrl: null,
    };
  });
  // Team-mates share a constructor colour in the provider data. Give the
  // second car a lighter tint (the reference does the same) so their traces
  // stay distinguishable across every chart.
  const teamDrivers = new Map<string, DriverRef[]>();
  for (const d of drivers) {
    const list = teamDrivers.get(d.teamId) ?? [];
    list.push(d);
    teamDrivers.set(d.teamId, list);
  }
  for (const list of teamDrivers.values()) {
    list.forEach((d, i) => {
      if (i > 0) d.colour = lighten(d.colour, 0.35);
    });
  }
  const driverById = new Map(drivers.map((d) => [d.id, d]));

  const teams: TeamRef[] = raw.constructorStandings.map((s) => {
    const c = s.Constructor!;
    const meta = teamMeta(c.constructorId, c.name);
    return { id: c.constructorId, name: meta.name, colour: meta.colour, logoName: meta.logo };
  });
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // ------------------------------ per round --------------------------------
  const roundPoints: Record<string, number[]> = {};
  const racePointsByRound: Record<string, number[]> = {};
  const sprintPointsByRound: Record<string, number[]> = {};
  const sprintByRound: Record<string, (number | null)[]> = {};
  const sprintGridByRound: Record<string, (number | null)[]> = {};
  const qualiGapByRound: Record<string, (number | null)[]> = {};
  const raceGapByRound: Record<string, (number | null)[]> = {};
  const pointsByRound: Record<string, number[]> = {};
  const ranksByRound: Record<string, number[]> = {};
  const roundPositions: Record<string, { grid: number | null; finish: number | null; status: string }[]> = {};
  const qualiByRound: Record<string, (number | null)[]> = {};
  const raceByRound: Record<string, (number | null)[]> = {};
  const winnersByRound: (string | null)[] = [];
  const fastestByRound = new Map<number, { driverId: string; time: number; session: "Q" | "R" }>();

  for (const d of drivers) {
    roundPoints[d.id] = Array.from({ length: roundCount }, () => 0);
    racePointsByRound[d.id] = Array.from({ length: roundCount }, () => 0);
    sprintPointsByRound[d.id] = Array.from({ length: roundCount }, () => 0);
    sprintByRound[d.id] = Array.from({ length: roundCount }, () => null);
    sprintGridByRound[d.id] = Array.from({ length: roundCount }, () => null);
    qualiGapByRound[d.id] = Array.from({ length: roundCount }, () => null);
    raceGapByRound[d.id] = Array.from({ length: roundCount }, () => null);
    roundPositions[d.id] = Array.from({ length: roundCount }, () => ({
      grid: null,
      finish: null,
      status: "",
    }));
    qualiByRound[d.id] = Array.from({ length: roundCount }, () => null);
    raceByRound[d.id] = Array.from({ length: roundCount }, () => null);
  }

  const roundSummaries: RoundSummary[] = [];
  for (const roundInfo of rounds) {
    const { round } = roundInfo;
    const idx = round - 1;
    const results = raw.results.get(round) ?? [];
    const quali = raw.qualifying.get(round) ?? [];
    const sprint = raw.sprint.get(round) ?? [];

    for (const row of results) {
      const id = row.Driver.driverId;
      if (!roundPoints[id]) continue; // drivers who never scored a standing row
      roundPoints[id][idx] += Number(row.points) || 0;
      racePointsByRound[id][idx] += Number(row.points) || 0;
    }
    for (const row of sprint) {
      const id = row.Driver.driverId;
      if (!roundPoints[id]) continue;
      roundPoints[id][idx] += Number(row.points) || 0;
      sprintPointsByRound[id][idx] += Number(row.points) || 0;
      sprintByRound[id][idx] = Number(row.position) || null;
      sprintGridByRound[id][idx] = Number(row.grid) || null;
    }

    // Team-mate deltas: the qualifying and race gaps the H2H view dots up.
    const qualiTimes = new Map<string, number>();
    for (const q of quali) {
      const t = bestQuali(q);
      if (t != null) qualiTimes.set(q.Driver.driverId, t);
    }
    // Only same-lap, full-distance finishes can be compared: a lapped or
    // retired car's elapsed time says nothing about its pace.
    const raceTimes = new Map<string, { seconds: number; laps: number }>();
    for (const row of results) {
      if (row.status !== "Finished") continue;
      const ms = Number(row.Time?.millis);
      const laps = Number(row.laps);
      if (Number.isFinite(ms) && ms > 0 && Number.isFinite(laps)) {
        raceTimes.set(row.Driver.driverId, { seconds: ms / 1000, laps });
      }
    }
    const byTeam = new Map<string, string[]>();
    for (const row of results) {
      const teamId = row.Constructor.constructorId;
      const list = byTeam.get(teamId) ?? [];
      if (!list.includes(row.Driver.driverId)) list.push(row.Driver.driverId);
      byTeam.set(teamId, list);
    }
    for (const members of byTeam.values()) {
      if (members.length !== 2) continue;
      const [a, b] = members;
      const qa = qualiTimes.get(a);
      const qb = qualiTimes.get(b);
      if (qa != null && qb != null) {
        const diff = qa - qb;
        if (qualiGapByRound[a]) qualiGapByRound[a][idx] = Math.round(diff * 1000) / 1000;
        if (qualiGapByRound[b]) qualiGapByRound[b][idx] = -Math.round(diff * 1000) / 1000;
      }
      const ra = raceTimes.get(a);
      const rb = raceTimes.get(b);
      if (ra != null && rb != null && ra.laps === rb.laps) {
        const diff = ra.seconds - rb.seconds;
        if (raceGapByRound[a]) raceGapByRound[a][idx] = Math.round(diff * 1000) / 1000;
        if (raceGapByRound[b]) raceGapByRound[b][idx] = -Math.round(diff * 1000) / 1000;
      }
    }

    const winner = results.find((r) => r.position === "1");
    winnersByRound[idx] = winner?.Driver.driverId ?? null;
    const pole = quali.find((q) => q.position === "1");
    const sprintWinner = sprint.find((s) => s.position === "1");
    const sprintPole =
      sprint.length > 0
        ? [...sprint].sort((a, b) => Number(a.grid) - Number(b.grid))[0]?.Driver.driverId ?? null
        : null;
    roundSummaries.push({
      round,
      name: roundInfo.name,
      sprint: roundInfo.sprint,
      sprintPole,
      sprintWinner: sprintWinner?.Driver.driverId ?? null,
      pole: pole?.Driver.driverId ?? null,
      winner: winner?.Driver.driverId ?? null,
    });

    for (const row of results) {
      const id = row.Driver.driverId;
      if (!roundPositions[id]) continue;
      roundPositions[id][idx] = {
        grid: Number(row.grid) > 0 ? Number(row.grid) : null,
        finish: Number(row.position) || null,
        status: row.status,
      };
      raceByRound[id][idx] = Number(row.position) || null;
      const fl = row.FastestLap?.Time?.time;
      const t = seconds(fl);
      if (t != null) {
        const cur = fastestByRound.get(round);
        if (!cur || t < cur.time || (t === cur.time && cur.session === "Q")) {
          fastestByRound.set(round, { driverId: id, time: t, session: "R" });
        }
      }
    }
    for (const q of quali) {
      const id = q.Driver.driverId;
      if (!qualiByRound[id]) continue;
      qualiByRound[id][idx] = Number(q.position) || null;
      const t = bestQuali(q);
      if (t != null) {
        const cur = fastestByRound.get(round);
        if (!cur || t < cur.time) fastestByRound.set(round, { driverId: id, time: t, session: "Q" });
      }
    }
  }

  // Cumulative points and computed ranks after each round. The tie-break is
  // wins, then best finish, then the provider order — the same countback the
  // championship uses in practice.
  const winsSoFar: Record<string, number> = {};
  const bestFinishSoFar: Record<string, number> = {};
  for (const d of drivers) {
    winsSoFar[d.id] = 0;
    bestFinishSoFar[d.id] = 99;
    pointsByRound[d.id] = [];
    ranksByRound[d.id] = [];
  }
  for (let i = 0; i < roundCount; i++) {
    const round = i + 1;
    const results = raw.results.get(round) ?? [];
    for (const row of results) {
      const id = row.Driver.driverId;
      if (winsSoFar[id] == null) continue;
      if (row.position === "1") winsSoFar[id] += 1;
      const pos = Number(row.position);
      if (pos > 0) bestFinishSoFar[id] = Math.min(bestFinishSoFar[id], pos);
    }
    const cumulative = drivers.map((d) => ({
      id: d.id,
      pts: (roundPoints[d.id] ?? []).slice(0, i + 1).reduce((a, b) => a + b, 0),
      wins: winsSoFar[d.id] ?? 0,
      best: bestFinishSoFar[d.id] ?? 99,
    }));
    cumulative.sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.best - b.best || a.id.localeCompare(b.id));
    cumulative.forEach((row, rank) => {
      pointsByRound[row.id][i] = row.pts;
      ranksByRound[row.id][i] = rank + 1;
    });
  }

  // ----------------------------- standings ---------------------------------
  const leaderPoints = Number(raw.driverStandings[0]?.points ?? 0);
  const prevRank = (id: string) => {
    const ranks = ranksByRound[id] ?? [];
    const last = raw.round - 1;
    for (let i = Math.min(last, ranks.length - 1) - 1; i >= 0; i--) {
      if (ranks[i] != null) return ranks[i];
    }
    return null;
  };
  const driverStandings: StandingRow[] = raw.driverStandings.map((s) => {
    const d = driverById.get(s.Driver!.driverId);
    const position = Number(s.position) || 0;
    const previous = prevRank(s.Driver!.driverId);
    return {
      position,
      id: s.Driver!.driverId,
      name: d?.name ?? `${s.Driver!.givenName} ${s.Driver!.familyName}`,
      code: d?.code ?? s.Driver!.familyName.slice(0, 3).toUpperCase(),
      teamId: d?.teamId ?? "",
      teamName: d?.teamName ?? "",
      colour: d?.colour ?? "8a8a93",
      headshotUrl: d?.headshotUrl ?? null,
      points: Number(s.points) || 0,
      wins: Number(s.wins) || 0,
      gap: (Number(s.points) || 0) - leaderPoints,
      change: previous == null ? null : previous - position,
    };
  });

  const cLeader = Number(raw.constructorStandings[0]?.points ?? 0);
  const constructorStandings: StandingRow[] = raw.constructorStandings.map((s) => {
    const id = s.Constructor!.constructorId;
    const t = teamById.get(id);
    return {
      position: Number(s.position) || 0,
      id,
      name: t?.name ?? s.Constructor!.name,
      code: (t?.name ?? s.Constructor!.name).slice(0, 3).toUpperCase(),
      teamId: id,
      teamName: t?.name ?? s.Constructor!.name,
      colour: t?.colour ?? "8a8a93",
      headshotUrl: null,
      points: Number(s.points) || 0,
      wins: Number(s.wins) || 0,
      gap: (Number(s.points) || 0) - cLeader,
      change: null,
    };
  });

  // Constructor position changes from the same cumulative data.
  const teamPointsByRound: Record<string, number[]> = {};
  for (const t of teams) teamPointsByRound[t.id] = Array.from({ length: roundCount }, () => 0);
  for (const d of drivers) {
    for (let i = 0; i < roundCount; i++) {
      const teamId = d.teamId;
      if (teamPointsByRound[teamId]) teamPointsByRound[teamId][i] += roundPoints[d.id][i] ?? 0;
    }
  }
  const teamRanksByRound: Record<string, number[]> = {};
  for (const t of teams) teamRanksByRound[t.id] = [];
  for (let i = 0; i < roundCount; i++) {
    const rows = teams.map((t) => ({
      id: t.id,
      pts: teamPointsByRound[t.id].slice(0, i + 1).reduce((a, b) => a + b, 0),
    }));
    rows.sort((a, b) => b.pts - a.pts || a.id.localeCompare(b.id));
    rows.forEach((row, rank) => {
      teamRanksByRound[row.id][i] = rank + 1;
    });
  }
  for (const row of constructorStandings) {
    const ranks = teamRanksByRound[row.teamId] ?? [];
    const last = Math.min(raw.round - 1, ranks.length - 1);
    for (let i = last - 1; i >= 0; i--) {
      if (ranks[i] != null) {
        row.change = ranks[i] - row.position;
        break;
      }
    }
  }

  // ----------------------------- season stats ------------------------------
  const driverStats: Record<string, DriverSeasonStats> = {};
  for (const d of drivers) {
    const stats: DriverSeasonStats = {
      driverId: d.id,
      starts: 0,
      wins: 0,
      podiums: 0,
      pointsFinishes: 0,
      poles: 0,
      q3Appearances: 0,
      dnfs: 0,
      sprintWins: 0,
      sprintPodiums: 0,
      fastestLaps: 0,
      avgFinish: null,
      positionsGained: 0,
      bestFinish: null,
      bestGrid: null,
    };
    for (const roundInfo of rounds) {
      const idx = roundInfo.round - 1;
      const race = (raw.results.get(roundInfo.round) ?? []).find((r) => r.Driver.driverId === d.id);
      const quali = (raw.qualifying.get(roundInfo.round) ?? []).find((q) => q.Driver.driverId === d.id);
      const sprint = (raw.sprint.get(roundInfo.round) ?? []).find((s) => s.Driver.driverId === d.id);
      if (race) {
        stats.starts++;
        const pos = Number(race.position);
        if (pos === 1) stats.wins++;
        if (pos >= 1 && pos <= 3) stats.podiums++;
        if (Number(race.points) > 0) stats.pointsFinishes++;
        if (isDnf(race.status)) stats.dnfs++;
        if (race.FastestLap?.rank === "1") stats.fastestLaps++;
        if (pos > 0) stats.bestFinish = stats.bestFinish == null ? pos : Math.min(stats.bestFinish, pos);
        const grid = Number(race.grid);
        if (grid > 0 && pos > 0 && isClassified(race.status)) {
          stats.positionsGained += grid - pos;
          stats.bestGrid = stats.bestGrid == null ? grid : Math.min(stats.bestGrid, grid);
        }
      }
      if (quali) {
        const qp = Number(quali.position);
        if (qp === 1) stats.poles++;
        if (quali.Q3) stats.q3Appearances++;
        if (qp > 0) stats.bestGrid = stats.bestGrid == null ? qp : Math.min(stats.bestGrid, qp);
      }
      if (sprint) {
        const sp = Number(sprint.position);
        if (sp === 1) stats.sprintWins++;
        if (sp >= 1 && sp <= 3) stats.sprintPodiums++;
      }
      void idx;
    }
    const finished = rounds
      .map((r) => (raw.results.get(r.round) ?? []).find((x) => x.Driver.driverId === d.id))
      .filter((r): r is RawResult => !!r && !isDnf(r.status))
      .map((r) => Number(r.position))
      .filter((n) => n > 0);
    stats.avgFinish = finished.length ? finished.reduce((a, b) => a + b, 0) / finished.length : null;
    driverStats[d.id] = stats;
  }

  const teamStats: Record<string, TeamSeasonStats> = {};
  for (const t of teams) {
    teamStats[t.id] = { teamId: t.id, wins: 0, podiums: 0, pointsFinishes: 0, poles: 0, dnfs: 0, starts: 0 };
  }
  for (const d of drivers) {
    const s = driverStats[d.id];
    const t = teamStats[d.teamId];
    if (!t || !s) continue;
    t.wins += s.wins;
    t.podiums += s.podiums;
    t.pointsFinishes += s.pointsFinishes;
    t.poles += s.poles;
    t.dnfs += s.dnfs;
    t.starts += s.starts;
  }

  // ---------------------------- season cards -------------------------------
  const bestBy = <T,>(items: T[], pick: (t: T) => { value: number; ok: boolean }) => {
    let best: T | null = null;
    let value = 0;
    for (const item of items) {
      const r = pick(item);
      if (!r.ok) continue;
      if (best == null || r.value > value) {
        best = item;
        value = r.value;
      }
    }
    return best == null ? null : { item: best, value };
  };

  const mostWins = bestBy(drivers, (d) => ({ value: driverStats[d.id].wins, ok: driverStats[d.id].wins > 0 }));
  const mostPodiums = bestBy(drivers, (d) => ({ value: driverStats[d.id].podiums, ok: driverStats[d.id].podiums > 0 }));
  const mostPoles = bestBy(drivers, (d) => ({ value: driverStats[d.id].poles, ok: driverStats[d.id].poles > 0 }));
  const bestAverage = bestBy(drivers, (d) => ({
    value: -(driverStats[d.id].avgFinish ?? 99),
    ok: driverStats[d.id].avgFinish != null,
  }));
  const mostGained = bestBy(drivers, (d) => ({
    value: driverStats[d.id].positionsGained,
    ok: driverStats[d.id].positionsGained > 0,
  }));

  let comeback: SeasonCards["comeback"] = null;
  let largestMargin: SeasonCards["largestMargin"] = null;
  let closestMargin: SeasonCards["closestMargin"] = null;
  const lapsByTeam = new Map<string, number>();

  for (const roundInfo of rounds) {
    const results = (raw.results.get(roundInfo.round) ?? []).slice();
    const winner = results.find((r) => r.position === "1");
    if (winner) {
      const second = results.find((r) => r.position === "2");
      const margin = winner.Time?.millis && second?.Time?.millis
        ? (Number(second.Time.millis) - Number(winner.Time.millis)) / 1000
        : second?.Time?.time?.startsWith("+")
          ? Number(second.Time.time.slice(1))
          : null;
      if (margin != null && Number.isFinite(margin)) {
        if (largestMargin == null || margin > largestMargin.margin) {
          largestMargin = { driverId: winner.Driver.driverId, round: roundInfo.round, roundName: roundInfo.name, margin };
        }
        if (closestMargin == null || margin < closestMargin.margin) {
          closestMargin = { driverId: winner.Driver.driverId, round: roundInfo.round, roundName: roundInfo.name, margin };
        }
      }
    }
    for (const row of results) {
      const grid = Number(row.grid);
      const finish = Number(row.position);
      if (grid > 0 && finish > 0 && grid - finish > 0) {
        if (comeback == null || grid - finish > comeback.grid - comeback.finish) {
          comeback = {
            driverId: row.Driver.driverId,
            round: roundInfo.round,
            roundName: roundInfo.name,
            grid,
            finish,
          };
        }
      }
      const laps = Number(row.laps);
      if (laps > 0) {
        lapsByTeam.set(row.Constructor.constructorId, (lapsByTeam.get(row.Constructor.constructorId) ?? 0) + laps);
      }
    }
  }

  const cards: SeasonCards = {
    mostWins: mostWins
      ? { driverId: mostWins.item.id, teamId: mostWins.item.teamId, value: mostWins.value }
      : null,
    mostPodiums: mostPodiums
      ? { driverId: mostPodiums.item.id, teamId: mostPodiums.item.teamId, value: mostPodiums.value }
      : null,
    mostPoles: mostPoles
      ? { driverId: mostPoles.item.id, teamId: mostPoles.item.teamId, value: mostPoles.value }
      : null,
    bestAverage: bestAverage
      ? { driverId: bestAverage.item.id, teamId: bestAverage.item.teamId, value: -(bestAverage.value) }
      : null,
    mostGained: mostGained
      ? { driverId: mostGained.item.id, teamId: mostGained.item.teamId, value: mostGained.value }
      : null,
    comeback,
    largestMargin,
    closestMargin,
    lapsByTeam: [...lapsByTeam.entries()]
      .map(([teamId, laps]) => ({ teamId, laps }))
      .sort((a, b) => b.laps - a.laps)
      .slice(0, 3),
  };

  const fastest: FastestEntry[] = [...fastestByRound.entries()]
    .map(([round, v]) => ({
      round,
      roundName: rounds.find((r) => r.round === round)?.name ?? `Round ${round}`,
      driverId: v.driverId,
      time: v.time,
      session: v.session,
    }))
    .sort((a, b) => a.round - b.round);

  return {
    season,
    rounds,
    drivers,
    teams,
    driverStandings,
    constructorStandings,
    pointsByRound,
    ranksByRound,
    roundPoints,
    racePointsByRound,
    sprintPointsByRound,
    sprintByRound,
    sprintGridByRound,
    teamPointsByRound,
    teamRanksByRound,
    qualiGapByRound,
    raceGapByRound,
    driverStats,
    teamStats,
    roundSummaries,
    fastest,
    cards,
    roundPositions,
    qualiByRound,
    raceByRound,
    winnersByRound,
  };
}

// --------------------------------- cache -----------------------------------

const seasonCache = new Map<number, { at: number; data: SeasonPayload }>();
const inFlight = new Map<number, Promise<SeasonPayload>>();
let seasonsCache: { at: number; data: number[] } | null = null;

// Jolpica publishes no portraits. OpenF1's roster supplies the current grid's
// cutouts; every other driver is looked up in F1's own media library, where a
// portrait sits at a path derived from the driver's name. The CDN answers 200
// with a ~1 KB placeholder when it has no cutout, so each candidate is confirmed
// with a HEAD request before it is used. Results are kept for the life of the
// process — a portrait does not change between requests.
let headshotCache: { at: number; byName: Map<string, string> } | null = null;
/** Positive lookups are permanent; a miss is retried after half an hour so a
 *  transient CDN failure cannot hide a portrait for the process lifetime. */
const portraitCache = new Map<string, { url: string | null; at: number }>();

/** Strip accents and punctuation so "Pérez" becomes the CDN's "Perez". */
function stripName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "");
}

function portraitUrl(givenName: string, familyName: string): string | null {
  const given = stripName(givenName);
  const family = stripName(familyName);
  if (given.length < 3 || family.length < 3) return null;
  const code = `${given.slice(0, 3)}${family.slice(0, 3)}`.toUpperCase();
  const file = `${code}01_${given}_${family}`;
  return (
    "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/" +
    `${given[0].toUpperCase()}/${file}/${code.toLowerCase()}01.png.transform/2col/image.png`
  );
}

/** F1's CDN serves a ~1 KB placeholder for drivers it has no cutout for. */
async function hasPortrait(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return false;
    return Number(res.headers.get("content-length") ?? 0) > 2048;
  } catch {
    return false;
  }
}

async function resolvePortrait(name: string, givenName: string, familyName: string) {
  const key = name.toLowerCase();
  const cached = portraitCache.get(key);
  if (cached && (cached.url || Date.now() - cached.at < 30 * 60_000)) return cached.url;
  const url = portraitUrl(givenName, familyName);
  const value = url && (await hasPortrait(url)) ? url : null;
  portraitCache.set(key, { url: value, at: Date.now() });
  return value;
}

async function getHeadshots(): Promise<Map<string, string>> {
  if (headshotCache && Date.now() - headshotCache.at < 30 * 60_000) return headshotCache.byName;
  const byName = new Map<string, string>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch("https://api.openf1.org/v1/drivers?session_key=latest", {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (res.ok) {
      const list = (await res.json()) as {
        full_name?: string;
        name_acronym?: string;
        headshot_url?: string | null;
      }[];
      for (const d of Array.isArray(list) ? list : []) {
        const url = d.headshot_url;
        if (!url || !url.startsWith("http")) continue;
        // The feed's default crop is 93px, which looks soft in a 28–40px avatar
        // on a 2x screen; the 2col crop is 206px for a couple of extra KB.
        const sharp = url.replace("/1col/", "/2col/");
        if (d.full_name) byName.set(d.full_name.toLowerCase(), sharp);
        if (d.name_acronym) byName.set(`code:${d.name_acronym.toUpperCase()}`, sharp);
      }
    }
  } catch {
    // Offline or rate-limited: the initials avatar still renders.
  } finally {
    clearTimeout(timer);
  }
  headshotCache = { at: Date.now(), byName };
  return byName;
}

/** Give a season's drivers — and its standings rows — their portraits. */
async function attachHeadshots(data: SeasonPayload): Promise<void> {
  const roster = await getHeadshots();
  const lookup = (driver: { name: string; code: string }) =>
    roster.get(driver.name.toLowerCase()) ?? roster.get(`code:${driver.code.toUpperCase()}`) ?? null;

  const missing = data.drivers.filter((d) => !lookup(d));
  const found = new Map<string, string>();
  // Bounded fan-out: six HEAD requests at a time rather than the whole grid.
  for (let i = 0; i < missing.length; i += 6) {
    await Promise.all(
      missing.slice(i, i + 6).map(async (d) => {
        const url = await resolvePortrait(d.name, d.givenName, d.familyName);
        if (url) found.set(d.id, url);
      })
    );
  }

  for (const d of data.drivers) d.headshotUrl = lookup(d) ?? found.get(d.id) ?? null;
  const byDriver = new Map(data.drivers.map((d) => [d.id, d.headshotUrl]));
  for (const row of data.driverStandings) row.headshotUrl = byDriver.get(row.id) ?? null;
}

export async function getSeasonPayload(season: number): Promise<SeasonPayload> {
  const hit = seasonCache.get(season);
  if (hit && Date.now() - hit.at < SEASON_TTL) return hit.data;

  // Strict Mode (and a user double-clicking the selector) can fire two
  // requests for the same season before the first finishes. Jolpica caps the
  // request rate, so both builds must share one upstream load.
  const pending = inFlight.get(season);
  if (pending) return pending;

  const load = (async () => {
    const raw = await loadRaw(season);
    const data = assemble(season, raw);
    // Every season gets portraits — the current grid straight from OpenF1, the
    // historic grids from F1's media library.
    await attachHeadshots(data);
    seasonCache.set(season, { at: Date.now(), data });
    return data;
  })().finally(() => inFlight.delete(season));
  inFlight.set(season, load);
  return load;
}

export async function getSeasons(): Promise<number[]> {
  if (seasonsCache && Date.now() - seasonsCache.at < SEASONS_TTL) return seasonsCache.data;
  const json = await getJson(`/seasons.json?limit=${PAGE}`);
  const list: { season: string }[] = json?.MRData?.SeasonTable?.Seasons ?? [];
  const data = list.map((s) => Number(s.season)).filter((n) => Number.isFinite(n)).sort((a, b) => b - a);
  seasonsCache = { at: Date.now(), data };
  return data;
}
