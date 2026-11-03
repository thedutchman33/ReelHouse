import "server-only";

// ---------------------------------------------------------------------------
// Circuit facts for the season-calendar race sheet: track length, race
// distance, lap count, the outright lap record and the defending winner.
//
// Formula 1 publishes these on the official race page (the same numbers shown
// on formula1.com's circuit panel), so the page's embedded data is read and
// mapped by round. The defending winner is the previous season's winner at the
// same circuit, taken from the championship feed. Nothing is invented: a
// missing field stays null and the sheet simply omits that row.
// ---------------------------------------------------------------------------

const F1_WEB = "https://www.formula1.com";
const JOLPICA_BASE = process.env.JOLPICA_BASE ?? "https://api.jolpi.ca/ergast/f1";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36";

export interface TrackInfo {
  round: number;
  slug: string | null;
  officialName: string | null;
  location: string | null;
  country: string | null;
  circuitType: string | null;
  circuitLengthKm: string | null;
  raceDistanceKm: string | null;
  laps: number | null;
  lapRecord: { time: string; driver: string; season: string } | null;
  defendingWinner: { name: string; team: string; season: number } | null;
}

/** One calendar card anchor carries its round number and race-page link. */
const CALENDAR_ANCHOR = /<a\b[^>]*href="\/en\/racing\/\d{4}\/([a-z0-9-]+)"[\s\S]*?<\/a>/g;
const ANCHOR_ROUND = /ROUND\s+(\d+)/i;

/** Round number → formula1.com race-page slug. Exported for tests. */
export function parseCalendarSlugs(html: string): Map<number, string> {
  const slugs = new Map<number, string>();
  for (const block of html.match(CALENDAR_ANCHOR) ?? []) {
    const round = Number(ANCHOR_ROUND.exec(block)?.[1]);
    const slug = /href="\/en\/racing\/\d{4}\/([a-z0-9-]+)"/.exec(block)?.[1];
    if (!Number.isInteger(round) || round < 1 || !slug) continue;
    slugs.set(round, slug);
  }
  return slugs;
}

/** Accent- and punctuation-insensitive comparison key. */
function key(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** The race page embeds its record as escaped JSON inside an RSC payload. */
function readField(payload: string, name: string): string | null {
  const match = new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`).exec(payload);
  return match ? match[1] : null;
}

async function fetchText(url: string, revalidate: number): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/json", "Accept-Language": "en-US", "User-Agent": UA },
      next: { revalidate },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

interface WinnerRow {
  season: string;
  circuitName: string;
  country: string;
  locality: string;
  driver: string;
  team: string;
}

/** Every round winner of one season, from the championship feed. */
async function seasonWinners(season: number): Promise<WinnerRow[]> {
  try {
    const response = await fetch(`${JOLPICA_BASE}/${season}/results/1.json?limit=100`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 * 12 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const json = (await response.json()) as {
      MRData?: {
        RaceTable?: {
          Races?: {
            season: string;
            Circuit?: { circuitName?: string; Location?: { country?: string; locality?: string } };
            Results?: { Driver?: { givenName?: string; familyName?: string }; Constructor?: { name?: string } }[];
          }[];
        };
      };
    };
    const races = json?.MRData?.RaceTable?.Races ?? [];
    return races.flatMap((race) => {
      const winner = race.Results?.[0];
      if (!winner?.Driver) return [];
      return [
        {
          season: race.season,
          circuitName: race.Circuit?.circuitName ?? "",
          country: race.Circuit?.Location?.country ?? "",
          locality: race.Circuit?.Location?.locality ?? "",
          driver: `${winner.Driver.givenName ?? ""} ${winner.Driver.familyName ?? ""}`.trim(),
          team: winner.Constructor?.name ?? "",
        },
      ];
    });
  } catch {
    return [];
  }
}

/** The most recent previous-season winner at this circuit. */
function defendingWinner(
  winners: WinnerRow[],
  officialName: string | null,
  location: string | null,
  country: string | null,
  season: number
): TrackInfo["defendingWinner"] {
  const candidates = winners.filter((row) => Number(row.season) < season);
  if (!candidates.length) return null;
  // Circuit names are spelled differently by each feed ("Las Vegas Strip
  // Street Circuit" vs "Las Vegas Strip Circuit", "USA" vs "United States"),
  // so fall back through city and country once the exact name misses.
  const named = candidates.find((row) => key(row.circuitName) === key(officialName));
  const placed = candidates.find(
    (row) => key(row.locality) === key(location) && key(row.country) === key(country)
  );
  const byCity = candidates.find((row) => key(row.locality) === key(location));
  const byCountry = candidates.find((row) => key(row.country) === key(country));
  const row = named ?? placed ?? byCity ?? byCountry ?? null;
  return row ? { name: row.driver, team: row.team, season: Number(row.season) } : null;
}

/**
 * Circuit facts for one round of a season. `meetingName` is the schedule's own
 * meeting name: when formula1.com's page for that round names a different
 * Grand Prix, the lookup is refused rather than showing another circuit's
 * numbers.
 */
export async function getTrackInfo(
  year: number,
  round: number,
  meetingName: string | null
): Promise<TrackInfo | null> {
  if (!Number.isInteger(year) || !Number.isInteger(round) || round < 1) return null;

  const calendar = await fetchText(`${F1_WEB}/en/racing/${year}`, 60 * 60 * 6);
  const slug = calendar ? parseCalendarSlugs(calendar).get(round) ?? null : null;
  if (!slug) return null;

  const html = await fetchText(`${F1_WEB}/en/racing/${year}/${slug}`, 60 * 60 * 6);
  if (!html) return null;
  const payload = html.replace(/\\"/g, '"');

  const pageMeeting = readField(payload, "meetingName");
  if (meetingName && pageMeeting && !key(pageMeeting).startsWith(key(meetingName).slice(0, 12))) {
    return null;
  }

  const officialName = readField(payload, "circuitOfficialName");
  const location = readField(payload, "circuitLocation");
  const country = readField(payload, "circuitCountry");
  const lapsRaw = Number(readField(payload, "scheduledLapCount"));
  const fastestLapTime = readField(payload, "fastestLapTime");
  const fastestLapDriver = readField(payload, "fastestLapDriver");
  const fastestLapSeason = readField(payload, "fastestLapSeason");

  let defender: TrackInfo["defendingWinner"] = null;
  try {
    const winners = await seasonWinners(year - 1);
    defender = defendingWinner(winners, officialName, location, country, year);
  } catch {
    defender = null;
  }

  return {
    round,
    slug,
    officialName,
    location,
    country,
    circuitType: readField(payload, "circuitType"),
    circuitLengthKm: readField(payload, "trackLength"),
    raceDistanceKm: readField(payload, "scheduledDistance"),
    laps: Number.isFinite(lapsRaw) && lapsRaw > 0 ? lapsRaw : null,
    lapRecord:
      fastestLapTime && fastestLapDriver
        ? { time: fastestLapTime, driver: fastestLapDriver, season: fastestLapSeason ?? "" }
        : null,
    defendingWinner: defender,
  };
}
