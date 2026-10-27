/**
 * Laps-led data layer.
 *
 * Source: Jolpica F1's lap-by-lap timing — `/f1/{season}/{round}/drivers/{id}/laps`.
 * Every lap record carries the driver's timing position, so "laps led" is just
 * the number of laps where that position is 1. Nothing is estimated: a lap the
 * provider never timed is reported as unavailable, never as zero.
 *
 * The driver filter keeps a whole race on one page (a Grand Prix is never more
 * than 100 laps for one driver), so one round costs one request. Jolpica's
 * unauthenticated burst limit is 4 requests/second and it throttles with 429s,
 * so requests are paced through a shared token bucket and a second pass picks
 * up anything the first one lost. A completed driver-season is then cached for
 * hours — laps led only change when a race is classified.
 */

const BASE = process.env.JOLPICA_BASE ?? "https://api.jolpi.ca/ergast/f1";
/** The feed asks for an identifying user agent; generic ones get throttled. */
const UA = "ReelHouseF1/1.0 (+https://reelhouse.co)";
const PAGE = 100;
/** Laps led only move after a race, so a complete answer is cached for hours. */
const TTL = 6 * 60 * 60_000;
/** A partial answer is retried much sooner. */
const PARTIAL_TTL = 2 * 60_000;
/** The first season with lap-by-lap timing in the feed. */
export const FIRST_LAPS_SEASON = 1996;
/** Jolpica's unauthenticated burst limit is four requests per second; keep
 *  a little headroom under it so a retry never has to fight the limiter. */
const MIN_GAP_MS = 300;

export interface LapsLedRound {
  round: number;
  /** Laps completed while running P1 (0 when the driver never led). */
  lapsLed: number;
  /** False when the provider's timing for this round could not be read. */
  known: boolean;
}

export interface LapsLedPayload {
  season: number;
  driverId: string;
  rounds: LapsLedRound[];
  /** False when the provider has no lap timing at all for this season/driver. */
  covered: boolean;
  /** True when at least one round is missing (its count is not in the totals). */
  partial: boolean;
  totalLapsLed: number;
  /** Rounds where the driver led at least one lap. */
  racesLed: number;
  /** Rounds whose timing was actually read. */
  knownRounds: number;
  /** Longest single-race stint in front, with its round. */
  best: { round: number; lapsLed: number } | null;
}

const cache = new Map<string, { at: number; ttl: number; value: LapsLedPayload }>();
const inflight = new Map<string, Promise<LapsLedPayload>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Shared pacer: every upstream lap request waits its turn in this queue. */
let nextSlot = 0;
async function pace() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_GAP_MS;
  const wait = slot - now;
  if (wait > 0) await sleep(wait);
}

interface RoundLaps {
  led: number;
  known: boolean;
}

const UNKNOWN: RoundLaps = { led: 0, known: false };

/** One page of a driver's lap timing, with the provider's own backoff hint. */
async function fetchPage(path: string): Promise<{ ok: boolean; json: any }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await pace();
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      await sleep(400 * (attempt + 1));
      continue;
    }
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json) return { ok: true, json };
    }
    // Throttled: the API hints how long to wait; otherwise back off gently.
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 700 * (attempt + 1);
    await sleep(Math.min(waitMs, 5000));
  }
  return { ok: false, json: null };
}

/** Laps led in one Grand Prix, or `known: false` when nothing could be read. */
async function countRound(season: number, round: number, driverId: string): Promise<RoundLaps> {
  let offset = 0;
  let total = Infinity;
  let led = 0;
  let known = false;
  let safety = 0;
  while (offset < total && safety < 4) {
    safety++;
    const { ok, json } = await fetchPage(
      `/${season}/${round}/drivers/${encodeURIComponent(driverId)}/laps.json?limit=${PAGE}&offset=${offset}`
    );
    if (!ok) return known ? { led, known } : UNKNOWN;
    const laps = json?.MRData?.RaceTable?.Races?.[0]?.Laps ?? [];
    total = Number(json?.MRData?.total ?? 0);
    for (const lap of laps) {
      const timings = lap?.Timings;
      if (!Array.isArray(timings) || !timings.length) continue;
      known = true;
      if (timings.some((t: { position?: string }) => String(t.position) === "1")) led++;
    }
    offset += PAGE;
    if (!laps.length) break;
  }
  return { led, known };
}

/** Bounded fan-out; the pacer keeps the actual request rate inside the limit. */
async function pool<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

export async function getLapsLed(
  season: number,
  driverId: string,
  rounds: number[]
): Promise<LapsLedPayload> {
  const key = `${season}:${driverId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;

  const running = inflight.get(key);
  if (running) return running;

  const task = (async (): Promise<LapsLedPayload> => {
    const empty: LapsLedPayload = {
      season,
      driverId,
      rounds: rounds.map((round) => ({ round, lapsLed: 0, known: false })),
      covered: false,
      partial: rounds.length > 0,
      totalLapsLed: 0,
      racesLed: 0,
      knownRounds: 0,
      best: null,
    };
    if (season < FIRST_LAPS_SEASON || !rounds.length) return { ...empty, partial: false };

    const counted = await pool(rounds, 4, async (round) => {
      const result = await countRound(season, round, driverId).catch(() => UNKNOWN);
      return { round, ...result };
    });

    // Second pass, one at a time, for whatever the first pass lost to
    // throttling. Cheap when everything succeeded (nothing to retry).
    for (let pass = 0; pass < 2; pass++) {
      const missing = counted.filter((c) => !c.known);
      if (!missing.length) break;
      // Give the limiter's window time to move on before trying again.
      await sleep(2000 + pass * 2000);
      for (const row of missing) {
        const retry = await countRound(season, row.round, driverId).catch(() => UNKNOWN);
        if (retry.known) {
          row.led = retry.led;
          row.known = true;
        }
      }
    }

    const value: LapsLedPayload = {
      ...empty,
      rounds: counted.map((c) => ({ round: c.round, lapsLed: c.led, known: c.known })),
      covered: counted.some((c) => c.known),
      partial: counted.some((c) => !c.known),
      knownRounds: counted.filter((c) => c.known).length,
    };
    value.totalLapsLed = counted.reduce((sum, c) => sum + c.led, 0);
    value.racesLed = counted.filter((c) => c.known && c.led > 0).length;
    value.best = counted.reduce<{ round: number; lapsLed: number } | null>(
      (best, c) => (c.led > (best?.lapsLed ?? 0) ? { round: c.round, lapsLed: c.led } : best),
      null
    );
    return value;
  })();

  inflight.set(key, task);
  try {
    const value = await task;
    cache.set(key, { at: Date.now(), ttl: value.partial ? PARTIAL_TTL : TTL, value });
    return value;
  } finally {
    inflight.delete(key);
  }
}
