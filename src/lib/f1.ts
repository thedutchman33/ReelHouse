import "server-only";
import { getRawCircuitFrame } from "@/lib/circuit";

// ---------------------------------------------------------------------------
// Formula 1 data (OpenF1 — free, keyless, the community's live-timing API).
// All schedule/telemetry facts below are OpenF1's own records; nothing here
// is derived or guessed. The countdown/watch-live gating is computed against
// the SERVER clock and shipped to the client as UTC instants.
// ---------------------------------------------------------------------------

const OF1 = "https://api.openf1.org/v1";

/** Sessions shown on the page — test days ("Day 1/2/3") are excluded. */
const SESSION_ORDER = [
  "Practice 1",
  "Practice 2",
  "Practice 3",
  "Sprint Qualifying",
  "Qualifying",
  "Sprint",
  "Race",
];

export interface F1Meeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  location: string;
  country_code: string | null;
  country_name: string;
  country_flag: string | null;
  circuit_short_name: string | null;
  /** OpenF1's link to MultiViewer's real circuit-geometry API (track points). */
  circuit_info_url: string | null;
  circuit_image: string | null;
  gmt_offset: string | null;
  date_start: string;
  date_end: string;
  year: number;
  is_cancelled: boolean | null;
}

export interface F1Session {
  session_key: number;
  session_name: string;
  session_type: string;
  meeting_key: number;
  location: string;
  country_name: string;
  country_code: string | null;
  date_start: string;
  date_end: string | null;
  year: number;
}

export interface F1Round {
  meeting: F1Meeting;
  /** Race-weekend sessions in running order (tests filtered out). */
  sessions: F1Session[];
  /** The main Race session of the weekend. */
  race: F1Session;
}

/** A pre-season test: a meeting with timed sessions but no race. */
export interface F1TestWeekend {
  meeting: F1Meeting;
  /** Its running order (the feed calls these "Day 1", "Day 2", …). */
  sessions: F1Session[];
}

export interface F1Schedule {
  year: number;
  /** Server clock at build of this response — the client anchors on it. */
  nowUtc: string;
  /** Race weekends in calendar order (cancelled ones dropped). */
  rounds: F1Round[];
  /** Pre-season tests, in running order (the calendar's other meetings). */
  tests?: F1TestWeekend[];
  /** Index into rounds of the weekend that is next or currently running. */
  nextRoundIndex: number;
  /** Next session that has not ended yet, anywhere on the calendar. */
  nextSession: F1Session | null;
}

async function of1<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    let res = await fetch(`${OF1}${path}`, {
      next: { revalidate },
      headers: { Accept: "application/json" },
    });
    // OpenF1 rate-limits (30 req/min). One bounded retry covers cold passes
    // where several uncached fetches race each other; polling recovers the rest.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await fetch(`${OF1}${path}`, {
        next: { revalidate },
        headers: { Accept: "application/json" },
      });
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function sessionRank(name: string): number {
  const idx = SESSION_ORDER.indexOf(name);
  return idx === -1 ? 99 : idx;
}

/** Build the season model from OpenF1's meetings + sessions. */
export async function getF1Schedule(year = new Date().getUTCFullYear()): Promise<F1Schedule | null> {
  const [meetings, sessions] = await Promise.all([
    of1<F1Meeting[]>(`/meetings?year=${year}`, 60 * 5),
    of1<F1Session[]>(`/sessions?year=${year}`, 60 * 5),
  ]);
  if (!meetings?.length || !sessions?.length) return null;

  const now = Date.now();
  const rounds: F1Round[] = [];
  for (const meeting of meetings) {
    if (meeting.is_cancelled) continue;
    // Race weekends only — pre-season tests run as "Day 1/2/3" sessions.
    const weekend = sessions
      .filter((s) => s.meeting_key === meeting.meeting_key && sessionRank(s.session_name) < 99)
      .sort(
        (a, b) =>
          new Date(a.date_start).getTime() - new Date(b.date_start).getTime() ||
          sessionRank(a.session_name) - sessionRank(b.session_name)
      );
    const race = weekend.find((s) => s.session_name === "Race");
    if (!race || weekend.length === 0) continue;
    rounds.push({ meeting, sessions: weekend, race });
  }
  rounds.sort((a, b) => new Date(a.race.date_start).getTime() - new Date(b.race.date_start).getTime());

  // Testing weekends carry no Race session, so they never make `rounds` — but
  // the Grand Prix picker lists them the way the reference does.
  const tests: F1TestWeekend[] = [];
  for (const meeting of meetings) {
    if (meeting.is_cancelled) continue;
    if (rounds.some((r) => r.meeting.meeting_key === meeting.meeting_key)) continue;
    const mine = sessions
      .filter((s) => s.meeting_key === meeting.meeting_key)
      .sort(
        (a, b) =>
          new Date(a.date_start).getTime() - new Date(b.date_start).getTime() ||
          sessionRank(a.session_name) - sessionRank(b.session_name)
      );
    if (mine.length) tests.push({ meeting, sessions: mine });
  }
  tests.sort(
    (a, b) =>
      new Date(a.sessions[0].date_start).getTime() - new Date(b.sessions[0].date_start).getTime()
  );

  const nextRoundIndex = Math.max(
    0,
    rounds.findIndex((r) => new Date(r.race.date_end ?? r.race.date_start).getTime() >= now)
  );

  const upcoming = sessions
    .filter((s) => sessionRank(s.session_name) < 99 && new Date(s.date_end ?? s.date_start).getTime() >= now)
    .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());

  return {
    year,
    nowUtc: new Date(now).toISOString(),
    rounds,
    tests,
    nextRoundIndex,
    nextSession: upcoming[0] ?? null,
  };
}

// ------------------------------ TELEMETRY ----------------------------------

export interface F1Driver {
  driver_number: number;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  headshot_url: string | null;
  country_code: string | null;
}

/** One sampled telemetry instant for a driver (OpenF1 car_data stream). */
export interface F1CarSample {
  date: string;
  speed: number;
  rpm: number;
  n_gear: number;
  throttle: number; // 0-100
  brake: number; // 0-100 (OpenF1 reports 0/1 booleans as 0/100)
  drs: number | null; // >=10 = DRS open
}

export interface F1Lap {
  lap_number: number;
  /** OpenF1's lap_duration, seconds. */
  lap_time: number | null; // seconds
  is_pit_out_lap: boolean | null;
  date_start: string;
}

/** OpenF1's raw lap record (lap_duration is the timed lap length). */
interface RawLap {
  lap_number: number;
  lap_duration: number | null;
  is_pit_out_lap: boolean | null;
  date_start: string;
}

export interface F1ResultRow {
  driver_number: number | null;
  position: number | null;
  points: number | null;
}

export interface F1TelemetryDriver {
  driver: F1Driver;
  position: number | null;
  /** Latest telemetry samples (≤ ~30 s window), oldest → newest. */
  samples: F1CarSample[];
  /** Every timed lap of the session for this driver. */
  laps: F1Lap[];
  bestLap: number | null;
}

export interface F1TelemetryPayload {
  nowUtc: string;
  session: F1Session;
  isLive: boolean;
  /** Full session roster (for the driver picker). */
  roster: F1Driver[];
  /** Drivers carrying telemetry (requested subset or the top 3). */
  drivers: F1TelemetryDriver[];
}

/**
 * Telemetry for one session + up to 4 drivers. Live sessions return the last
 * ~25 s of car_data (the dashboard polls); finished sessions return their
 * closing moments so the dashboard still shows real numbers.
 */
export async function getF1Telemetry(
  sessionKey: number,
  driverNumbers: number[]
): Promise<F1TelemetryPayload | null> {
  const sessions = await of1<F1Session[]>(`/sessions?session_key=${sessionKey}`, 60);
  const session = sessions?.[0];
  if (!session) return null;

  const startMs = new Date(session.date_start).getTime();
  const endMs = session.date_end ? new Date(session.date_end).getTime() : startMs + 2 * 3600_000;
  const now = Date.now();
  const isLive = now >= startMs && now <= endMs;

  const [allDrivers, results] = await Promise.all([
    of1<F1Driver[]>(`/drivers?session_key=${sessionKey}`, 60 * 10),
    of1<F1ResultRow[]>(`/session_result?session_key=${sessionKey}`, isLive ? 30 : 60 * 10),
  ]);
  if (!allDrivers?.length) return null;

  const positions = new Map<number, number>();
  for (const row of results ?? []) {
    if (row.driver_number != null && row.position != null) {
      positions.set(row.driver_number, row.position);
    }
  }

  // Requested drivers, or the current (provisional) top 3.
  let picked = allDrivers.filter((d) => driverNumbers.includes(d.driver_number));
  if (picked.length === 0) {
    picked = [...allDrivers]
      .sort((a, b) => (positions.get(a.driver_number) ?? 99) - (positions.get(b.driver_number) ?? 99))
      .slice(0, 3);
  }
  picked = picked.slice(0, 4);

  // The telemetry window: live → trailing 30 s; finished → the session's
  // closing 30 s. Both are real recorded points, never synthesized. The
  // fetches are cached server-side (not per-request) — OpenF1 rate-limits at
  // 30 req/min, so the dashboard's polling must collapse into shared cache
  // entries, not upstream calls.
  const anchorMs = isLive ? now : Math.min(endMs, now);
  const windowStart = (ms: number) =>
    new Date(anchorMs - ms).toISOString();

  // One bounded car-data pull [lower, upper]. Finished-session windows are
  // capped on BOTH ends — the stream has no upper cutoff by itself, so an
  // uncapped query floods the window with the car parking/engine-off zeros.
  const fetchWindow = async (
    num: number,
    lowerMs: number,
    upperMs: number
  ): Promise<F1CarSample[] | null> => {
    const qs = `session_key=${sessionKey}&driver_number=${num}` +
      `&date>=${encodeURIComponent(new Date(lowerMs).toISOString())}` +
      `&date<=${encodeURIComponent(new Date(upperMs).toISOString())}`;
    const hit = await of1<F1CarSample[]>(`/car_data?${qs}`, isLive ? 15 : 60 * 10);
    if (hit?.length || isLive) return hit ?? null;
    return null;
  };

  const perDriver = await Promise.all(
    picked.map(async (driver) => {
      const num = driver.driver_number;
      const lapList = await of1<RawLap[]>(
        `/laps?session_key=${sessionKey}&driver_number=${num}`,
        isLive ? 60 : 60 * 10
      );
      // OpenF1's lap records use `lap_duration`; normalize to lap_time.
      const cleanLaps = (lapList ?? [])
        .filter((l) => l.lap_duration != null && !l.is_pit_out_lap)
        .map((l) => ({
          lap_number: l.lap_number,
          lap_time: l.lap_duration,
          is_pit_out_lap: l.is_pit_out_lap,
          date_start: l.date_start,
        }))
        .sort((a, b) => a.lap_number - b.lap_number);
      const bestLap = cleanLaps.reduce<number | null>(
        (best, l) => (l.lap_time != null && (best == null || l.lap_time < best) ? l.lap_time : best),
        null
      );

      // Live: a trailing window of real-time points. Finished: anchor the
      // window on the driver's BEST lap — their final minutes are parc-ferré
      // zeros, while the best lap is their real on-track action.
      let carData: F1CarSample[] | null = null;
      if (isLive) {
        carData = await fetchWindow(num, now - 30_000, now + 5_000);
      } else {
        const best = cleanLaps.find((l) => l.lap_time === bestLap);
        if (best?.lap_time && best.date_start) {
          const lapStart = new Date(best.date_start).getTime();
          carData = await fetchWindow(
            num,
            lapStart - 15_000,
            lapStart + best.lap_time * 1000 + 2_000
          );
        }
        if (!carData?.length) {
          const lastLapAt = cleanLaps[cleanLaps.length - 1];
          if (lastLapAt?.date_start) {
            const lapStart = new Date(lastLapAt.date_start).getTime();
            carData = await fetchWindow(num, lapStart - 15_000, lapStart + 120_000);
          }
        }
      }

      const samples = (carData ?? [])
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-450)
        // The stream nominally tops out at 100 — occasional 104s exist in the
        // raw feed; clamp for the gauge readouts.
        .map((s) => ({
          ...s,
          throttle: Math.max(0, Math.min(100, s.throttle)),
          brake: Math.max(0, Math.min(100, s.brake)),
        }));

      return {
        driver,
        position: positions.get(num) ?? null,
        samples,
        laps: cleanLaps,
        bestLap,
      };
    })
  );

  return {
    nowUtc: new Date(now).toISOString(),
    session,
    isLive,
    roster: allDrivers,
    drivers: perDriver,
  };
}

// --------------------------- SESSION RESULTS -------------------------------
//
// The session centre: every driver's every lap of a session (OpenF1 /laps
// covers all drivers in one call), plus the classification. Row shape feeds
// the lap-matrix table and the fastest-laps chart; telemetry picks ride on
// the same lap records.

export interface F1LapRow {
  lap: number;
  /** lap_duration in seconds (null when the lap wasn't timed). */
  time: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  /** Lap-start timestamp — the telemetry window anchor. */
  dateStart: string;
  /** OpenF1 flags deleted laps (crossed out in the lap table, like GP-Tempo). */
  deleted: boolean;
  /** Tyre compound covering this lap (OpenF1's stint records). */
  compound: string | null;
  /** Speed-trap reading at the finish line (km/h) — OpenF1's st_speed. */
  speed: number | null;
  /** In/out lap (excluded from pace averages, like the timing screens). */
  pitOut: boolean;
}

/** One stint: a compound run over a contiguous lap range (OpenF1 /stints). */
export interface F1Stint {
  compound: string | null;
  lapStart: number;
  lapEnd: number | null;
  laps: number;
}

/** One weather sample from OpenF1's session weather feed. */
export interface F1WeatherSample {
  date: string;
  airTemperature: number | null;
  trackTemperature: number | null;
  humidity: number | null;
  rainfall: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  /** Sea-level pressure in hPa (OpenF1's pressure field). */
  pressure: number | null;
}

export interface F1ResultRow2 {
  driverNumber: number;
  fullName: string;
  acronym: string;
  teamName: string;
  teamColour: string;
  headshotUrl: string | null;
  position: number | null;
  dnf: boolean;
  dns: boolean;
  /** The official classification gap (practice/qualifying); null when the
   *  provider publishes none. Race gaps live on the payload's `finalGap`. */
  officialGap?: number | null;
  laps: F1LapRow[];
  /** The driver's stints in lap order, with their real compounds. */
  stints: F1Stint[];
  best: number | null;
  lapCount: number;
}

/** One driver's race track-position at the end of a lap. */
export interface F1PositionPoint {
  lap: number;
  position: number;
}

/** One driver's gap picture on a lap (seconds behind the leader / car ahead). */
export interface F1GapPoint {
  lap: number;
  /** Gap to the leader (0 for the leader). */
  gap: number | null;
  /** Interval to the car directly ahead. */
  interval: number | null;
}

export interface F1PitStop {
  driverNumber: number;
  lap: number;
  /** Pit-lane time in seconds (OpenF1's pit_duration / lane_duration). */
  duration: number | null;
  /** Stationary service time, when the provider records it separately. */
  stopDuration: number | null;
}

/** A safety-car / VSC window, in laps. */
export interface F1SafetyCarPeriod {
  startLap: number;
  endLap: number;
  /** VSC rather than a full safety car. */
  virtual: boolean;
}

/** Race-only timing: position history, gaps, pit stops, neutralisations. */
export interface F1RaceExtras {
  positions: Record<number, F1PositionPoint[]>;
  gaps: Record<number, F1GapPoint[]>;
  pits: F1PitStop[];
  safetyCars: F1SafetyCarPeriod[];
  /** Starting grid, where the provider publishes one. */
  grid: Record<number, number>;
}

export interface F1ResultsPayload {
  nowUtc: string;
  session: F1Session;
  isLive: boolean;
  /** Whole-session best lap among the returned drivers. */
  sessionBest: number | null;
  /** Highest lap number seen in the session (lap-matrix width). */
  maxLap: number;
  /** Session weather feed, oldest first (the weather-trend chart). */
  weather: F1WeatherSample[];
  /** Final classification gaps (seconds to the winner), by driver number. */
  finalGap: Record<number, number>;
  /** Race-only extras; absent for practice/qualifying sessions. */
  race?: F1RaceExtras;
  results: F1ResultRow2[];
}

/** OpenF1 intervals arrive as numbers, nulls or "+1 LAP"-style strings. */
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/[+\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Race extras are immutable once a session ends — cache them per session so
 *  a page load doesn't re-hit OpenF1's rate limit for the same race. */
const raceExtrasCache = new Map<number, { at: number; data: F1RaceExtras }>();
const RACE_EXTRAS_TTL = 5 * 60 * 1000;

/**
 * Race timing extras: each driver's position and gap sampled at every lap
 * start, the pit-stop list, safety-car windows and the starting grid. Returns
 * undefined for practice/qualifying sessions (nothing to sample there).
 */
/** OpenF1 sends a session's classified time and gap as a plain number, or as
 *  one value per qualifying segment (Q1, Q2, Q3). The classified value is the
 *  last segment the driver took part in — a Q2 time doesn't outrank Q3. */
function lastNumeric(v: number | number[] | null | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (Array.isArray(v)) {
    for (let i = v.length - 1; i >= 0; i--) {
      const n = v[i];
      if (typeof n === "number" && Number.isFinite(n)) return n;
    }
  }
  return null;
}

async function buildRaceExtras(
  session: F1Session,
  lapsByDriver: Map<number, F1LapRow[]>,
  isLive: boolean
): Promise<F1RaceExtras | undefined> {
  if (session.session_type !== "Race") return undefined;
  const cached = raceExtrasCache.get(session.session_key);
  if (cached && Date.now() - cached.at < RACE_EXTRAS_TTL && !isLive) return cached.data;

  const [posRows, gapRows, pitRows, rcRows, gridRows] = await Promise.all([
    of1<{ date: string; position: number | null; driver_number: number | null }[]>(
      `/position?session_key=${session.session_key}`,
      isLive ? 30 : 600
    ),
    of1<
      { date: string; gap_to_leader: number | string | null; interval: number | string | null; driver_number: number | null }[]
    >(`/intervals?session_key=${session.session_key}`, isLive ? 30 : 600),
    of1<
      {
        driver_number: number | null;
        lap_number: number | null;
        pit_duration: number | null;
        lane_duration: number | null;
        stop_duration: number | null;
      }[]
    >(`/pit?session_key=${session.session_key}`, isLive ? 30 : 600),
    of1<{ date: string; lap_number: number | null; category: string | null; message: string | null }[]>(
      `/race_control?session_key=${session.session_key}`,
      isLive ? 30 : 600
    ),
    of1<{ driver_number: number | null; position: number | null }[]>(
      `/starting_grid?session_key=${session.session_key}`,
      600
    ),
  ]);

  const timed = <T extends { date: string }>(rows: T[] | null) =>
    (rows ?? [])
      .filter((r) => r.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const posByDriver = new Map<number, { t: number; position: number }[]>();
  for (const r of timed(posRows)) {
    if (r.driver_number == null || r.position == null) continue;
    const t = new Date(r.date).getTime();
    const list = posByDriver.get(r.driver_number);
    const row = { t, position: r.position };
    if (list) list.push(row);
    else posByDriver.set(r.driver_number, [row]);
  }

  const gapByDriver = new Map<number, { t: number; gap: number | null; interval: number | null }[]>();
  for (const r of timed(gapRows)) {
    if (r.driver_number == null) continue;
    const t = new Date(r.date).getTime();
    const list = gapByDriver.get(r.driver_number);
    const row = { t, gap: num(r.gap_to_leader), interval: num(r.interval) };
    if (list) list.push(row);
    else gapByDriver.set(r.driver_number, [row]);
  }

  const positions: Record<number, F1PositionPoint[]> = {};
  const gaps: Record<number, F1GapPoint[]> = {};
  for (const [driver, allLaps] of lapsByDriver) {
    const ordered = [...allLaps].sort((a, b) => a.lap - b.lap);

    const posSeries = posByDriver.get(driver) ?? [];
    let pi = 0;
    let lastPos: number | null = null;
    const posOut: F1PositionPoint[] = [];
    for (const lap of ordered) {
      const t = new Date(lap.dateStart).getTime();
      while (pi < posSeries.length && posSeries[pi].t <= t) lastPos = posSeries[pi++].position;
      if (lastPos != null) posOut.push({ lap: lap.lap, position: lastPos });
    }
    if (posOut.length) positions[driver] = posOut;

    const gapSeries = gapByDriver.get(driver) ?? [];
    let gi = 0;
    let lastGap: { gap: number | null; interval: number | null } | null = null;
    const gapOut: F1GapPoint[] = [];
    for (const lap of ordered) {
      const t = new Date(lap.dateStart).getTime();
      while (gi < gapSeries.length && gapSeries[gi].t <= t) {
        lastGap = { gap: gapSeries[gi].gap, interval: gapSeries[gi].interval };
        gi++;
      }
      if (lastGap) gapOut.push({ lap: lap.lap, gap: lastGap.gap, interval: lastGap.interval });
    }
    if (gapOut.length) gaps[driver] = gapOut;
  }

  const pits: F1PitStop[] = (pitRows ?? [])
    .filter((p) => p.driver_number != null && p.lap_number != null)
    .map((p) => ({
      driverNumber: p.driver_number as number,
      lap: p.lap_number as number,
      duration: p.pit_duration ?? p.lane_duration ?? null,
      stopDuration: p.stop_duration ?? null,
    }))
    .sort((a, b) => a.lap - b.lap || a.driverNumber - b.driverNumber);

  // VSC / safety-car windows from the race-control messages.
  const safetyCars: F1SafetyCarPeriod[] = [];
  let open: { lap: number; virtual: boolean } | null = null;
  const maxLapSeen = [...lapsByDriver.values()].reduce<number>(
    (m, list) => list.reduce((n, l) => Math.max(n, l.lap), m),
    0
  );
  for (const rc of timed(rcRows)) {
    if ((rc.category ?? "").toLowerCase() !== "safetycar") continue;
    const msg = (rc.message ?? "").toUpperCase();
    const lap: number = rc.lap_number ?? open?.lap ?? 0;
    if (msg.includes("DEPLOYED")) {
      open = { lap, virtual: msg.includes("VSC") };
    } else if (open && (msg.includes("ENDING") || msg.includes("CLEAR") || msg.includes("IN THIS LAP"))) {
      safetyCars.push({ startLap: open.lap, endLap: Math.max(lap, open.lap + 1), virtual: open.virtual });
      open = null;
    }
  }
  if (open) safetyCars.push({ startLap: open.lap, endLap: maxLapSeen, virtual: open.virtual });

  const grid: Record<number, number> = {};
  for (const g of gridRows ?? []) {
    if (g.driver_number != null && g.position != null) grid[g.driver_number] = g.position;
  }
  // OpenF1 doesn't publish /starting_grid for every race (the current season
  // often has none at all). A driver's first position sample is their slot on
  // the opening lap, which is the grid — better than leaving Grid and +/-
  // blank. Penalties served after the first snapshot can differ by a place.
  if (Object.keys(grid).length === 0) {
    for (const [driver, series] of posByDriver) {
      if (series.length) grid[driver] = series[0].position;
    }
  }

  // If the position feed was rate-limited, rank each lap's gaps instead — the
  // order of running cars is the same information.
  if (Object.keys(positions).length === 0 && Object.keys(gaps).length > 0) {
    const byLap = new Map<number, { driver: number; gap: number }[]>();
    for (const [driver, points] of Object.entries(gaps)) {
      for (const p of points) {
        if (p.gap == null) continue;
        const list = byLap.get(p.lap) ?? [];
        list.push({ driver: Number(driver), gap: p.gap });
        byLap.set(p.lap, list);
      }
    }
    for (const [lap, list] of byLap) {
      list.sort((a, b) => a.gap - b.gap);
      list.forEach((entry, i) => {
        (positions[entry.driver] ??= []).push({ lap, position: i + 1 });
      });
    }
    for (const driver of Object.keys(positions)) {
      positions[Number(driver)].sort((a, b) => a.lap - b.lap);
    }
  }

  const data: F1RaceExtras = { positions, gaps, pits, safetyCars, grid };
  raceExtrasCache.set(session.session_key, { at: Date.now(), data });
  return data;
}

export async function getF1Results(sessionKey: number): Promise<F1ResultsPayload | null> {
  const sessions = await of1<F1Session[]>(`/sessions?session_key=${sessionKey}`, 60);
  const session = sessions?.[0];
  if (!session) return null;

  const startMs = new Date(session.date_start).getTime();
  const endMs = session.date_end ? new Date(session.date_end).getTime() : startMs + 2 * 3600_000;
  const now = Date.now();
  const isLive = now >= startMs && now <= endMs;

  const [laps, roster, results, stints, weather] = await Promise.all([
    of1<Record<string, unknown>[]>(`/laps?session_key=${sessionKey}`, isLive ? 30 : 600),
    of1<F1Driver[]>(`/drivers?session_key=${sessionKey}`, 600),
    of1<
      {
        position: number | null;
        driver_number: number | null;
        dnf: boolean | null;
        dns: boolean | null;
        /** A practice/qualifying best lap (or a per-segment array); a race's
         *  total time, which is not a lap. */
        duration: number | number[] | null;
        gap_to_leader: number | number[] | null;
      }[]
    >(`/session_result?session_key=${sessionKey}`, isLive ? 30 : 600),
    // One call returns every driver's stints of the session — lap ranges
    // → tyre compound (what the lap-table chips and chart dots colour by).
    of1<
      {
        driver_number: number;
        lap_start: number;
        lap_end: number | null;
        compound: string | null;
      }[]
    >(`/stints?session_key=${sessionKey}`, isLive ? 30 : 600),
    // Session weather (one sample a minute) — the weather-trend chart.
    of1<
      {
        date: string;
        air_temperature: number | null;
        track_temperature: number | null;
        humidity: number | null;
        rainfall: number | null;
        wind_speed: number | null;
        wind_direction: number | null;
        pressure: number | null;
      }[]
    >(`/weather?session_key=${sessionKey}`, isLive ? 30 : 600),
  ]);
  if (!roster?.length) return null;



  // lap → compound per driver (OpenF1's stint lap_start covers that lap).
  const compoundOf = new Map<string, string>();
  for (const st of stints ?? []) {
    if (!st.compound) continue;
    const end = st.lap_end ?? 400;
    for (let l = st.lap_start; l <= end; l++) {
      compoundOf.set(`${st.driver_number}:${l}`, st.compound);
    }
  }

  // The visible stint per driver: compound, lap range and its real length
  // (null lap_end on a live session = "still running", capped at the last lap).
  const maxLap = (laps ?? []).reduce<number>(
    (m, l) => Math.max(m, (l.lap_number as number) ?? 0),
    0
  );
  const stintsByDriver = new Map<number, F1Stint[]>();
  for (const st of stints ?? []) {
    if (st.driver_number == null || st.lap_start == null) continue;
    const end = st.lap_end ?? maxLap;
    if (end < st.lap_start) continue;
    const list = stintsByDriver.get(st.driver_number);
    const row: F1Stint = {
      compound: st.compound,
      lapStart: st.lap_start,
      lapEnd: st.lap_end,
      laps: end - st.lap_start + 1,
    };
    if (list) list.push(row);
    else stintsByDriver.set(st.driver_number, [row]);
  }

  // The provider's official classification. Its `duration` is the classified
  // lap for practice/qualifying (the lap feed itself keeps laps official timing
  // deleted, so it must not drive the classification), and a race's total time.
  const isRaceSession = session.session_type === "Race";
  const positions = new Map<
    number,
    {
      position: number | null;
      dnf: boolean;
      dns: boolean;
      officialBest: number | null;
      officialGap: number | null;
    }
  >();
  const finalGap: Record<number, number> = {};
  for (const r of results ?? []) {
    if (r.driver_number != null) {
      positions.set(r.driver_number, {
        position: r.position ?? null,
        dnf: Boolean(r.dnf),
        dns: Boolean(r.dns),
        officialBest: isRaceSession ? null : lastNumeric(r.duration),
        officialGap: lastNumeric(r.gap_to_leader),
      });
      if (typeof r.gap_to_leader === "number" && Number.isFinite(r.gap_to_leader)) {
        finalGap[r.driver_number] = r.gap_to_leader;
      }
    }
  }

  const byDriver = new Map<number, F1LapRow[]>();
  for (const l of laps ?? []) {
    const num = l.driver_number as number;
    const time = l.lap_duration as number | null;
    const row: F1LapRow = {
      lap: l.lap_number as number,
      time: time ?? null,
      s1: (l.duration_sector_1 as number | null) ?? null,
      s2: (l.duration_sector_2 as number | null) ?? null,
      s3: (l.duration_sector_3 as number | null) ?? null,
      dateStart: l.date_start as string,
      deleted: Boolean(l.is_deleted),
      compound: compoundOf.get(`${num}:${l.lap_number}`) ?? null,
      speed: (l.st_speed as number | null) ?? null,
      pitOut: Boolean(l.is_pit_out_lap),
    };
    const list = byDriver.get(num);
    if (list) list.push(row);
    else byDriver.set(num, [row]);
  }

  // ---- race-only timing ---------------------------------------------------
  // Track position, per-lap gaps, pit stops and neutralisations only exist for
  // races/sprints; practice and qualifying never make these calls.
  const race = await buildRaceExtras(session, byDriver, isLive);

  const rows: F1ResultRow2[] = roster.map((d) => {
    const laps = (byDriver.get(d.driver_number) ?? [])
      .filter((l) => !l.time || l.time > 0)
      .sort((a, b) => a.lap - b.lap);
    const lapBest = laps.reduce<number | null>(
      (best, l) => (l.time != null && (best == null || l.time < best) ? l.time : best),
      null
    );
    const pos = positions.get(d.driver_number);
    return {
      driverNumber: d.driver_number,
      fullName: d.full_name,
      acronym: d.name_acronym,
      teamName: d.team_name,
      teamColour: d.team_colour,
      headshotUrl: d.headshot_url,
      position: pos?.position ?? null,
      dnf: pos?.dnf ?? false,
      dns: pos?.dns ?? false,
      officialGap: pos?.officialGap ?? null,
      laps,
      stints: (stintsByDriver.get(d.driver_number) ?? []).sort((a, b) => a.lapStart - b.lapStart),
      // The official classified lap wins over the lap feed's minimum.
      best: pos?.officialBest ?? lapBest,
      lapCount: laps.length,
    };
  });
  rows.sort((a, b) => {
    if (a.position != null && b.position != null) return a.position - b.position;
    if (a.position != null) return -1;
    if (b.position != null) return 1;
    return a.acronym.localeCompare(b.acronym);
  });

  const sessionBest = rows.reduce<number | null>(
    (best, r) => (r.best != null && (best == null || r.best < best) ? r.best : best),
    null
  );

  return {
    nowUtc: new Date(now).toISOString(),
    session,
    isLive,
    sessionBest,
    maxLap,
    finalGap,
    race,
    weather: (weather ?? []).map((w) => ({
      date: w.date,
      airTemperature: w.air_temperature,
      trackTemperature: w.track_temperature,
      humidity: w.humidity,
      rainfall: w.rainfall,
      windSpeed: w.wind_speed,
      windDirection: w.wind_direction,
      pressure: w.pressure,
    })),
    results: rows,
  };
}

// --------------------------- WEEKEND RECORDS -------------------------------
//
// "Session records" strip (the F1TV weekend sheet): for one race weekend
// every session row carries its real fastest lap (driver + colour), the
// classification winner for Race/Sprint and the total timed-lap count.
// Everything comes from OpenF1's own endpoints; nothing is synthesized.

export interface F1WeekendRecordRow {
  sessionKey: number;
  sessionName: string;
  sessionType: string;
  dateStart: string;
  dateEnd: string | null;
  /** Server-evaluated liveness at cache time (the client re-checks vs now). */
  isLive: boolean;
  isFinished: boolean;
  /** Fastest non-deleted lap of the session: time in seconds + its driver. */
  fastest: { time: number; acronym: string; teamColour: string; driverNumber: number; lap: number } | null;
  /** P1 in the classification (Race / Sprint strategy display). */
  winner: { acronym: string; teamColour: string } | null;
  /** Highest timed lap number seen in the session. */
  lapCount: number | null;
}

export interface F1WeekendPayload {
  nowUtc: string;
  meetingKey: number;
  isLive: boolean;
  sessions: F1WeekendRecordRow[];
}

export async function getF1WeekendRecords(meetingKey: number): Promise<F1WeekendPayload | null> {
  // The per-meeting sessions endpoint is the first thing OpenF1's live-session
  // gate 401s; the yearly list (same one getF1Schedule uses) is the resilient
  // path — filter the meeting out locally instead.
  const sessions = await of1<F1Session[]>(
    `/sessions?year=${new Date().getUTCFullYear()}`,
    60 * 5
  );
  const mine = sessions?.filter((s) => s.meeting_key === meetingKey);
  if (!mine?.length) return null;

  const nowMs = Date.now();
  const rows = await Promise.all(
    mine.map(async (session) => {
      const startMs = new Date(session.date_start).getTime();
      const endMs = session.date_end ? new Date(session.date_end).getTime() : startMs + 3 * 3600_000;
      const liveNow = nowMs >= startMs && nowMs <= endMs;
      const doneNow = nowMs > endMs;
      const rev = liveNow ? 30 : 600;

      const [laps, roster, results] = await Promise.all([
        of1<
          {
            driver_number: number;
            lap_number: number;
            lap_duration: number | null;
            is_deleted: boolean | null;
          }[]
        >(`/laps?session_key=${session.session_key}`, rev),
        of1<F1Driver[]>(`/drivers?session_key=${session.session_key}`, 600),
        of1<{ driver_number: number | null; position: number | null }[]>(
          `/session_result?session_key=${session.session_key}`,
          rev
        ),
      ]);

      const drivers = new Map((roster ?? []).map((d) => [d.driver_number, d]));
      let fastest: F1WeekendRecordRow["fastest"] = null;
      let lapCount: number | null = null;
      for (const l of laps ?? []) {
        if (l.is_deleted) continue;
        lapCount = Math.max(lapCount ?? 0, l.lap_number as number);
        const t = (l.lap_duration as number | null) ?? null;
        if (t == null || t <= 0) continue;
        if (fastest == null || t < fastest.time) {
          const d = drivers.get(l.driver_number as number);
          fastest = {
            time: t,
            acronym: d?.name_acronym ?? "—",
            teamColour: d?.team_colour ?? "",
            driverNumber: l.driver_number as number,
            lap: l.lap_number as number,
          };
        }
      }

      let winner: F1WeekendRecordRow["winner"] = null;
      const p1 = (results ?? []).find((r) => r.position === 1 && r.driver_number != null);
      if (p1) {
        const d = drivers.get(p1.driver_number as number);
        if (d) winner = { acronym: d.name_acronym, teamColour: d.team_colour };
      }

      return {
        sessionKey: session.session_key,
        sessionName: session.session_name,
        sessionType: session.session_type,
        dateStart: session.date_start,
        dateEnd: session.date_end,
        isLive: liveNow,
        isFinished: doneNow,
        fastest,
        winner,
        lapCount: lapCount,
      } satisfies F1WeekendRecordRow;
    })
  );

  rows.sort(
    (a, b) =>
      new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime()
  );

  return {
    nowUtc: new Date(nowMs).toISOString(),
    meetingKey,
    isLive: rows.some((r) => r.isLive && !r.isFinished),
    sessions: rows,
  };
}

/** One telemetry pick: a driver's specific lap of a session. */
export interface F1LapPick {
  driverNumber: number;
  lap: number;
  /** GP-Tempo-style paint choice for the lap (palette picker in the lap
   *  card). Rendered colour = this, else the pick-order palette, while the
   *  driver's TEAM colour is always offered first in the picker. */
  colour?: string;
  /** The session this lap belongs to — picks survive changing the session
   *  selector (GP-Tempo keeps picked laps across sessions too). */
  sessionKey?: number;
}

/** Car-data sample for ONE lap, aligned to that lap's real start. */
export interface F1LapSample {
  /** Seconds since the lap's own start (real car-data timestamps). */
  t: number;
  /** Cumulative metres travelled along the lap (integrated location x/y). */
  dist: number | null;
  speed: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  drs: number | null;
}

/** A telemetry pick with everything the GP-Tempo-style UI needs per lap. */
export interface F1LapTelemetry {
  driverNumber: number;
  acronym: string;
  fullName: string;
  teamName: string;
  /** OpenF1 team colour (no #). */
  teamColour: string;
  lap: number;
  /** The session this lap belongs to (multi-session pick support). */
  sessionKey: number;
  /** The pick's session year (the telemetry DRS chart hides for 2026+). */
  year: number;
  lapTime: number | null;
  sector1: number | null;
  sector2: number | null;
  sector3: number | null;
  compound: string | null;
  /** Distances (metres) where sector 1 / sector 2 end on THIS lap. */
  sectorDistances: [number | null, number | null];
  /** Lap-start timestamp (raw, for the session-time chart axis). */
  dateStart: string;
  /** Human session label, e.g. "2025 Spain Qualifying" (lap cards). */
  sessionLabel: string;
  samples: F1LapSample[];
}

/** Shared, normalized track path drawn from a real lap's location stream. */
export interface F1TrackPath {
  /** Normalized 0–100 coordinates, one point per path sample. */
  x: number[];
  y: number[];
  /** Cumulative metres at each path point (the real values, not scaled). */
  dist: number[];
  /** Corner numerals positioned in the same normalized frame, with the real
   *  distance along the path where each corner sits (metres). */
  corners: { number: number; x: number; y: number; dist: number }[];
}

export interface F1LapTelemetryPayload {
  nowUtc: string;
  session: F1Session;
  /** The meeting's own record (country/name + the MultiViewer circuit link). */
  meeting: F1Meeting | null;
  picks: F1LapTelemetry[];
  path: F1TrackPath | null;
}

/**
 * Car data + location for SELECTED laps (GP-Tempo's flow: laps are picked
 * from the session view and the telemetry view plots them). Each pick's
 * window is the real lap record [date_start, date_start + lap_duration];
 * the distance axis integrates the lap's own location x/y stream, so track
 * map, sector lines, domination and playback cursors are all built from real
 * recorded positions — never synthesized distances.
 *
 * The meeting record is fetched here (OpenF1 links it on the session), which
 * resolves the MultiViewer circuit geometry (corner numerals in the same
 * rotated 0–100 frame as the path — OpenF1's location frame and MultiViewer's
 * raw frame are identical, verified against FastF1's corner distances).
 */
export async function getF1LapTelemetry(
  sessionKey: number,
  picks: F1LapPick[]
): Promise<F1LapTelemetryPayload | null> {
  const sessions = await of1<F1Session[]>(`/sessions?session_key=${sessionKey}`, 60);
  const session = sessions?.[0];
  if (!session) return null;

  const [roster, laps] = await Promise.all([
    of1<F1Driver[]>(`/drivers?session_key=${sessionKey}`, 600),
    of1<Record<string, unknown>[]>(`/laps?session_key=${sessionKey}`, 600),
  ]);
  if (!roster?.length) return null;

  const drivers = new Map(roster.map((d) => [d.driver_number, d]));
  const lapIndex = new Map<string, Record<string, unknown>>();
  for (const l of laps ?? []) {
    lapIndex.set(`${l.driver_number}:${l.lap_number}`, l);
  }

  // Stints (one call, all drivers) → the lap's real tyre compound.
  const stints = await of1<
    {
      driver_number: number;
      lap_start: number;
      lap_end: number | null;
      compound: string | null;
    }[]
  >(`/stints?session_key=${sessionKey}`, 600);
  const compoundOf = new Map<string, string>();
  for (const st of stints ?? []) {
    if (!st.compound) continue;
    const end = st.lap_end ?? 400;
    for (let l = st.lap_start; l <= end; l++) {
      compoundOf.set(`${st.driver_number}:${l}`, st.compound);
    }
  }

  // The meeting record carries the failing circuit geometry link (cached).
  const meetings = await of1<F1Meeting[]>(`/meetings?meeting_key=${session.meeting_key}`, 600);
  const meeting = meetings?.[0] ?? null;
  const frame = meeting?.circuit_info_url
    ? await getRawCircuitFrame(meeting.circuit_info_url, `${session.meeting_key}:${session.year}`)
    : null;
  const rad = ((frame?.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sessionLabel =
    `${session.year} ${meeting?.country_name ?? session.country_name ?? ""} ${session.session_name}`.trim();

  interface LocRow {
    t: number;
    x: number;
    y: number;
    dist: number;
    /** Rotated-frame coordinates (the normalized track path is built from these). */
    rx: number;
    ry: number;
  }

  const limited = picks.slice(0, 4);
  const out: F1LapTelemetry[] = [];
  /** Per-pick location stream (t rel. lap start, cumulative dist). */
  const locStreams: (LocRow[] | null)[] = [];
  /** Raw x/y of the biggest location stream — becomes the shared track path. */
  let bestPathRows: (LocRow & { rx: number; ry: number })[] = [];

  for (const pick of limited) {
    const driver = drivers.get(pick.driverNumber);
    const lap = lapIndex.get(`${pick.driverNumber}:${pick.lap}`);
    if (!driver || !lap) {
      locStreams.push(null);
      continue;
    }
    const lapTime = lap.lap_duration as number | null;
    const startMs = new Date(lap.date_start as string).getTime();
    const span = lapTime && lapTime > 0 ? lapTime * 1000 : 120_000;
    const lower = encodeURIComponent(new Date(startMs - 2_000).toISOString());
    const upper = encodeURIComponent(new Date(startMs + span + 2_000).toISOString());

    const [samplesRaw, locRaw] = await Promise.all([
      of1<F1CarSample[]>(
        `/car_data?session_key=${sessionKey}&driver_number=${pick.driverNumber}&date>=${lower}&date<=${upper}`,
        600
      ),
      of1<
        { date: string; x: number; y: number; z: number }[]
      >(
        `/location?session_key=${sessionKey}&driver_number=${pick.driverNumber}&date>=${lower}&date<=${upper}`,
        600
      ),
    ]);

    // ---- Distance axis from the lap's own location points ------------------
    let stream: LocRow[] | null = null;
    const movingLoc = (locRaw ?? [])
      .filter((r) => r.x !== 0 && r.y !== 0) // in-garage rows report 0,0
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (movingLoc.length > 20) {
      const rows: LocRow[] = [];
      let acc = 0;
      const t0 = startMs;
      let px = movingLoc[0].x;
      let py = movingLoc[0].y;
      const rot = (x: number, y: number) => ({ rx: x * cos - y * sin, ry: x * sin + y * cos });
      for (const r of movingLoc) {
        const dt = (new Date(r.date).getTime() - t0) / 1000;
        const step = Math.sqrt((r.x - px) ** 2 + (r.y - py) ** 2);
        // The stream is ~4 Hz; pathological unit-jumps (feed glitches) are
        // clamped so the cumulative path stays metrically sane. True units
        // come from the speed calibration below.
        acc += Math.min(step, 600);
        px = r.x;
        py = r.y;
        const { rx, ry } = rot(r.x, r.y);
        rows.push({ t: dt, x: r.x, y: r.y, rx, ry, dist: acc });
      }
      stream = rows;
    }
    // NOTE: bestPathRows is captured AFTER calibration (below) so the shared
    // path carries real metres.

    // Calibrate the distance axis against reality: integrate the car-data
    // speed over time (∫v·dt in metres — exactly what a wheel encoder torques
    // out to) and rescale the path units to match. This is the same trick
    // FastF1 uses to convert FIA XML units to metres — real data end to end.
    let scaleK: number | null = null;
    const sortedCar = (samplesRaw ?? []).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    if (stream && sortedCar.length > 5) {
      const metres = sortedCar.reduce((total, s, i) => {
        if (i === 0) return total;
        const dt =
          (new Date(s.date).getTime() - new Date(sortedCar[i - 1].date).getTime()) / 1000;
        if (dt <= 0 || dt > 2) return total; // skip feed gaps
        const vMid =
          ((sortedCar[i - 1].speed + s.speed) / 2) * (1000 / 3600); // m/s
        return total + vMid * Math.min(dt, 2);
      }, 0);
      const rawTotal = stream[stream.length - 1].dist;
      if (metres > 300 && rawTotal > 0) scaleK = metres / rawTotal;
    }
    // Rebase: the lap's official start (t = 0) is the distance origin.
    if (stream && scaleK != null) {
      const streamRef = stream;
      const dist0 = (() => {
        if (streamRef[0].t >= 0 || streamRef.length < 2) return 0;
        let lo = 0;
        let hi = streamRef.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (streamRef[mid].t < 0) lo = mid + 1;
          else hi = mid;
        }
        const a = streamRef[lo - 1] ?? streamRef[lo];
        const b = streamRef[lo];
        const f = b.t === a.t ? 0 : (0 - a.t) / (b.t - a.t);
        return (a.dist + f * (b.dist - a.dist)) * scaleK!;
      })();
      for (const r of streamRef) r.dist = r.dist * scaleK! - dist0;
      if (streamRef.length > bestPathRows.length) bestPathRows = streamRef.slice();
    }
    locStreams.push(stream);

    const distAt = (t: number): number | null => {
      if (!stream || stream.length === 0) return null;
      if (t <= stream[0].t) return stream[0].dist;
      if (t >= stream[stream.length - 1].t) return stream[stream.length - 1].dist;
      let lo = 0;
      let hi = stream.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (stream[mid].t < t) lo = mid + 1;
        else hi = mid;
      }
      const a = stream[lo - 1] ?? stream[lo];
      const b = stream[lo];
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return a.dist + f * (b.dist - a.dist);
    };

    const s1 = (lap.duration_sector_1 as number | null) ?? null;
    const s2 = (lap.duration_sector_2 as number | null) ?? null;
    const samples: F1LapSample[] = (samplesRaw ?? [])
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((s) => {
        const t = (new Date(s.date).getTime() - startMs) / 1000;
        return {
          t,
          dist: distAt(t),
          speed: s.speed,
          rpm: s.rpm,
          gear: s.n_gear,
          throttle: Math.max(0, Math.min(100, s.throttle)),
          brake: Math.max(0, Math.min(100, s.brake)),
          drs: s.drs,
        };
      });

    const compound = compoundOf.get(`${pick.driverNumber}:${pick.lap}`) ?? null;
    out.push({
      driverNumber: pick.driverNumber,
      acronym: driver.name_acronym,
      fullName: driver.full_name,
      teamName: driver.team_name,
      teamColour: driver.team_colour,
      lap: pick.lap,
      sessionKey,
      year: session.year,
      lapTime: lapTime ?? null,
      sector1: s1,
      sector2: s2,
      sector3: (lap.duration_sector_3 as number | null) ?? null,
      compound,
      sectorDistances: [
        s1 != null && s1 > 0 ? distAt(s1) : null,
        s1 != null && s1 > 0 && s2 != null && s2 > 0 ? distAt(s1 + s2) : null,
      ],
      dateStart: lap.date_start as string,
      sessionLabel,
      samples,
    });
  }

  // ---- Shared normalized track path (the largest real lap location trace) --
  let path: F1TrackPath | null = null;
  const SAFETY = 4; // margin around the 0–100 box
  if (bestPathRows.length > 40) {
    const xs = bestPathRows.map((r) => r.rx);
    const ys = bestPathRows.map((r) => r.ry);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = (100 - 2 * SAFETY) / Math.max(spanX, spanY);
    const nx = (v: number) => SAFETY + (v - minX) * scale;
    const ny = (v: number) => SAFETY + (v - minY) * scale;

    // Downsample to ≤ 700 points, evenly spaced along cumulative distance,
    // keeping first/last.
    const total = bestPathRows[bestPathRows.length - 1].dist;
    const N = Math.min(700, bestPathRows.length);
    const pxs: number[] = [];
    const pys: number[] = [];
    const pds: number[] = [];
    let cursor = 0;
    for (let i = 0; i < N; i++) {
      const target = (i / (N - 1)) * total;
      while (
        cursor < bestPathRows.length - 2 &&
        bestPathRows[cursor + 1].dist < target
      ) {
        cursor++;
      }
      const a = bestPathRows[cursor];
      const b = bestPathRows[Math.min(cursor + 1, bestPathRows.length - 1)];
      const f = b.dist === a.dist ? 0 : (target - a.dist) / (b.dist - a.dist);
      pxs.push(nx(a.rx + f * (b.rx - a.rx)));
      pys.push(ny(a.ry + f * (b.ry - a.ry)));
      pds.push(target);
    }

    const corners = (frame?.corners ?? [])
      .filter((c) => c.x >= minX - 500 && c.x <= maxX + 500 && c.y >= minY - 500 && c.y <= maxY + 500)
      .map((c) => {
        // Nearest path point in RAW rotated units → that point's real
        // distance: where this corner sits along the telemetry axis.
        let bestI = 0;
        let bestD = Infinity;
        for (let i = 0; i < bestPathRows.length; i += 2) {
          const d =
            (bestPathRows[i].rx - c.x) ** 2 + (bestPathRows[i].ry - c.y) ** 2;
          if (d < bestD) {
            bestD = d;
            bestI = i;
          }
        }
        return {
          number: c.number,
          x: nx(c.x),
          y: ny(c.y),
          dist: bestPathRows[bestI].dist,
        };
      })
      .sort((a, b) => a.dist - b.dist);

    path = { x: pxs, y: pys, dist: pds, corners };
  }

  return {
    nowUtc: new Date(Date.now()).toISOString(),
    session,
    meeting,
    picks: out,
    path,
  };
}
