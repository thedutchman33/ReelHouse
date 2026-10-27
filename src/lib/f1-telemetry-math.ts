/**
 * GP-Tempo's telemetry chart math, ported verbatim from their store
 * (`HA`, `QV`, `$r`, `YV`, `JV`, `Dr`, `ZV` + the playback interpolation
 * helpers `bd`/`xd`) and typed. Nothing here is reinvented — every function
 * mirrors the original's behaviour, quirks included (rounding defaults, the
 * boundary-stitch domination stitch, sector-anchored delta reparametrization).
 *
 * Row shape used throughout: `{ x: distance, [lapKey]: value }` — one row per
 * sample on a lap, the lap's series keyed by its own key, merged across laps
 * with `mergeLapRows` into a shared row list.
 */

export interface WarpRow {
  x: number;
  [key: string]: number | undefined;
}

/** HA: split a lap's rows into S1/S2/S3 buckets by the lap's own sector
 *  time thresholds (rows with value <= s1 → S1, <= s1+s2 → S2, rest → S3). */
export function bucketBySector(
  lapKey: string,
  rows: WarpRow[],
  sector1: number,
  sector2: number
): [WarpRow[], WarpRow[], WarpRow[]] {
  const s1: WarpRow[] = [];
  const s2: WarpRow[] = [];
  const s3: WarpRow[] = [];
  let cur = s1;
  for (const row of rows) {
    const v = row[lapKey] ?? 0;
    if (v > sector1 + sector2) cur = s3;
    else if (v > sector1) cur = s2;
    else cur = s1;
    cur.push(row);
  }
  return [s1, s2, s3];
}

/** QV: binary-search the rows bracketing `x` and lerp the keyed value
 *  (rounds to an integer when `round`, which is the default — as in theirs). */
export function sampleAt(
  x: number,
  rows: WarpRow[],
  key: string,
  round = true
): WarpRow {
  if (rows.length === 0) return { x };
  if (rows.length === 1) return { x, [key]: rows[0][key] ?? 0 };
  let lo = 0;
  let hi = rows.length - 2;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (rows[mid].x >= x) hi = mid - 1;
    else lo = mid + 1;
  }
  const i = Math.max(Math.min(hi, rows.length - 2), 0);
  const j = i + 1;
  const x0 = rows[i].x;
  const x1 = rows[j].x;
  const v0 = rows[i][key] ?? 0;
  const v1 = rows[j][key] ?? 0;
  let v = v0;
  if (x1 !== x0) v = v0 + ((v1 - v0) / (x1 - x0)) * (x - x0);
  return { x, [key]: round ? Math.round(v) : v };
}

/**
 * $r: warp each lap's rows onto the baseline lap's x-grid — stretch the
 * lap's own x-range onto the baseline's first..last x, sample at every
 * baseline grid point, then (when start/end anchors are given — the sector-
 * warped delta path) remap values linearly between those anchors. Rounding
 * is on unless explicitly disabled, like theirs.
 */
export function warpToBaseline(
  lapsRows: (WarpRow[] | undefined)[],
  lapKeys: string[],
  baselineIdx: number,
  round = true,
  startAnchor?: (number | undefined)[],
  endAnchor?: (number | undefined)[]
): WarpRow[][] {
  const laps = lapsRows.filter(Boolean) as WarpRow[][];
  const base = laps[baselineIdx];
  const grid = base.map((r) => r.x);
  const x0 = grid[0];
  const xN = grid[base.length - 1];
  const out: WarpRow[][] = [];
  if (xN === x0) {
    // Degenerate baseline (single x) — return the laps as-is.
    laps.forEach((r) => out.push([...r]));
    return out;
  }
  laps.forEach((lapRows, h) => {
    if (lapRows.length === 0) {
      out.push([]);
      return;
    }
    if (h === baselineIdx) {
      out.push([...lapRows]);
      return;
    }
    const lapKey = lapKeys[h];
    const firstX = lapRows[0].x;
    const lastX = lapRows[lapRows.length - 1].x;
    const stretch = (xN - x0) / (lastX - firstX);
    const stretched = lapRows.map((row) => ({ ...row, x: (row.x - firstX) * stretch + x0 }));
    const sampled = grid.map((gx) => sampleAt(gx, stretched, lapKey, round));
    const firstV = sampled[0][lapKey] ?? 0;
    const lastV = sampled[sampled.length - 1][lapKey] ?? 0;
    const start = startAnchor?.[h] ?? firstV;
    const end = endAnchor?.[h] ?? lastV;
    let factor = (end - start) / (lastV - firstV);
    if (Number.isNaN(factor)) factor = 1;
    sampled.forEach((row) => {
      row[lapKey] = ((row[lapKey] ?? 0) - firstV) * factor + start;
    });
    out.push(sampled);
  });
  return out;
}

/** Dr: merge per-lap row arrays (same length, same grid) into one shared
 *  row list — the first array becomes the base rows, later laps fill their
 *  own keys into each index (skipping `x`). */
export function mergeLapRows(arrays: WarpRow[][]): WarpRow[] {
  return arrays.reduce<WarpRow[]>((acc, rows, idx) => {
    if (idx === 0) return rows.map((r) => ({ ...r }));
    rows.forEach((row, i) => {
      const dest = acc[i];
      if (!dest) return;
      for (const [k, v] of Object.entries(row)) {
        if (k !== "x") dest[k] = v;
      }
    });
    return acc;
  }, []);
}

export interface DeltaLap {
  /** The series key this lap plots under. */
  lapKey: string;
  /** Raw time rows `{x: distance, [lapKey]: seconds-since-lap-start}`. */
  timeRows: WarpRow[];
  sector1: number;
  sector2: number;
  lapTime: number;
}

/**
 * YV: sector-warped delta rows. Each lap's time rows are bucketed by its own
 * sector boundaries (HA), stretched onto the baseline's sector grid ($r), and
 * re-anchored so each sector starts where the baseline's sector starts plus
 * the lap's cumulative sector-time deficit — the delta at every grid point is
 * then simply `lap value − baseline value`.
 */
export function buildDeltaRows(laps: DeltaLap[], baselineIdx: number): WarpRow[] {
  if (laps.length === 0) return [];
  const buckets = laps.map((l) => bucketBySector(l.lapKey, l.timeRows, l.sector1, l.sector2));
  const perSector: WarpRow[][][] = [];
  [0, 1, 2].forEach((s) => {
    const baseBuckets = buckets[baselineIdx][s];
    if (!baseBuckets || baseBuckets.length === 0) {
      perSector.push([]); // baseline has no rows in this sector — skip it
      return;
    }
    const sectorBuckets = buckets.map((b) => b[s]);
    const base = laps[baselineIdx];
    const f = base.sector1;
    const d = base.sector2;
    const last = baseBuckets[baseBuckets.length - 1][base.lapKey] ?? 0;
    const first = baseBuckets[0][base.lapKey] ?? 0;
    const starts: (number | undefined)[] = [];
    const ends: (number | undefined)[] = [];
    laps.forEach((l) => {
      if (s === 0) {
        starts.push(0);
        ends.push(l.sector1 - f + last);
      } else if (s === 1) {
        starts.push(l.sector1 - f + first);
        ends.push(l.sector1 + l.sector2 - f - d + last);
      } else {
        starts.push(l.sector1 + l.sector2 - f - d + first);
        ends.push(l.lapTime);
      }
    });
    perSector.push(warpToBaseline(sectorBuckets, laps.map((l) => l.lapKey), baselineIdx, false, starts, ends));
  });
  const stacked: WarpRow[][] = [];
  perSector.forEach((lapsRows) => {
    lapsRows.forEach((rows, lap) => {
      stacked[lap] ||= [];
      stacked[lap] = stacked[lap].concat(rows);
    });
  });
  const baseKey = laps[baselineIdx].lapKey;
  const out: WarpRow[][] = [];
  for (let i = 0; i < (stacked[0]?.length ?? 0); i++) {
    const baseVal = stacked[baselineIdx][i]?.[baseKey] ?? 0;
    stacks: for (const [lap, rows] of stacked.entries()) {
      const lapKey = laps[lap].lapKey;
      const row = rows[i];
      if (!row) continue;
      const v = { x: row.x, [lapKey]: (row[lapKey] ?? 0) - baseVal };
      out[lap] ||= [];
      out[lap].push(v);
    }
  }
  return mergeLapRows(out);
}

/**
 * JV: domination rows — at every grid point the owner is the fastest lap
 * (argmax speed); per-owner rows carry the track position only where that
 * lap leads, with the boundary point stitched twice (once under the old
 * owner's key, once under the new) so owner lines meet without gaps.
 * `trackRows` must already be aligned to the speed grid by distance.
 */
export function buildDomination(
  speedRowsPerLap: WarpRow[][],
  lapKeys: string[],
  trackPoints: TrackPoint[]
): WarpRow[] {
  const owners: WarpRow[] = [];
  let streak = 0;
  let drawKey: string | undefined;
  let prevOwner: string | undefined;
  const n = Math.min(speedRowsPerLap[0]?.length ?? 0, trackPoints.length);
  for (let i = 0; i < n; i++) {
    let owner: string | undefined;
    let best = 0;
    for (let d = 0; d < speedRowsPerLap.length; d++) {
      const v = speedRowsPerLap[d][i]?.[lapKeys[d]] ?? 0;
      if (!owner || v > best) {
        owner = lapKeys[d];
        best = v;
      }
    }
    if (!owner) continue;
    if (!drawKey) drawKey = owner;
    if (owner === prevOwner && owner !== drawKey) streak++;
    else streak = 0;
    prevOwner = owner;
    if (streak > 0) {
      drawKey = owner;
      streak = 0;
      // The boundary stitch: the incoming owner's line starts one grid point
      // early. Exactly like theirs, the appended rows carry NO `y` field (so
      // the white underlay's own `y` line is never influenced by them) and the
      // track y rides on the lap key itself.
      owners.push({ x: trackPoints[i - 1].x, [drawKey]: trackPoints[i - 1].y });
    }
    owners.push({ x: trackPoints[i].x, [drawKey]: trackPoints[i].y });
  }
  // Their base rows are the raw track rows ({x, y, distance}) appended with
  // the per-owner rows after them.
  return [
    ...trackPoints.map((p) => ({ x: p.x, y: p.y, distance: p.distance })),
    ...owners,
  ];
}

/** ZV: data-derived sector distances — last S1-bucket x, last S2-bucket x. */
export function sectorEndDistances(
  lapKey: string,
  timeRows: WarpRow[],
  sector1: number,
  sector2: number
): [number, number] {
  const b = bucketBySector(lapKey, timeRows, sector1, sector2);
  return [b[0][b[0].length - 1]?.x ?? 0, b[1][b[1].length - 1]?.x ?? 0];
}

// ---------------------------------------------------------------------------
// Playback interpolation (their `bd` / `xd`, verbatim).
// ---------------------------------------------------------------------------

export interface PlayEntry {
  /** Seconds since the lap's own start. */
  time: number;
  /** Distance (metres) along the lap at that moment. */
  distance: number;
}

/** bd: distance at lap-relative time `t` (lerp between entries, clamped). */
export function distAtTime(entries: PlayEntry[], t: number): number | null {
  if (entries.length === 0) return null;
  if (t <= entries[0].time) return entries[0].distance;
  if (t >= entries[entries.length - 1].time) return entries[entries.length - 1].distance;
  let lo = 0;
  let hi = entries.length - 1;
  for (; lo < hi - 1; ) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].time <= t) lo = mid;
    else hi = mid;
  }
  const t0 = entries[lo].time;
  const t1 = entries[hi].time;
  const d0 = entries[lo].distance;
  const d1 = entries[hi].distance;
  const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  return d0 + f * (d1 - d0);
}

export interface TrackPoint {
  x: number;
  y: number;
  distance: number;
}

/** xd: track-plane position at distance `d` (lerp between rows, clamped). */
export function posAtDistance(track: TrackPoint[], d: number): { x: number; y: number } {
  if (track.length === 0) return { x: 0, y: 0 };
  if (d <= track[0].distance) return { x: track[0].x, y: track[0].y };
  if (d >= track[track.length - 1].distance) {
    const last = track[track.length - 1];
    return { x: last.x, y: last.y };
  }
  let lo = 0;
  let hi = track.length - 1;
  for (; lo < hi - 1; ) {
    const mid = (lo + hi) >> 1;
    if (track[mid].distance <= d) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const f = b.distance === a.distance ? 0 : (d - a.distance) / (b.distance - a.distance);
  return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
}
