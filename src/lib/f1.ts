import "server-only";

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

export interface F1Schedule {
  year: number;
  /** Server clock at build of this response — the client anchors on it. */
  nowUtc: string;
  /** Race weekends in calendar order (cancelled ones dropped). */
  rounds: F1Round[];
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
