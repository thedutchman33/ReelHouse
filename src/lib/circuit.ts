// Server-side circuit geometry: MultiViewer's circuit API (the same source
// F1 timing apps use) carries the real track center-line as x/y point arrays
// plus corner positions. OpenF1's meeting record conveniently links to it
// (`circuit_info_url` = api.multiviewer.app/api/v1/circuits/{key}/{year}).
import "server-only";

export interface CircuitGeometry {
  /** Normalized track points [x, y] in a 0–100 viewBox space (start → finish). */
  points: [number, number][];
  /** Corner numbers with their normalized positions. */
  corners: { number: number; x: number; y: number }[];
  circuitName: string;
  location: string;
  countryName: string;
  /** Total turns, for the stat readout. */
  cornerCount: number;
  /**
   * Point indices where the second and third sectors begin. F1 does not publish
   * its timing-loop positions, so the lap is banded by distance (thirds) — the
   * same way the map reads on the official race page.
   */
  sectorSplits: [number, number];
  /** Speed-trap marker at the end of the longest straight, with its heading. */
  speedTrap: { x: number; y: number; angle: number } | null;
}

interface MvCircuit {
  x?: number[];
  y?: number[];
  rotation?: number;
  corners?: { number: number; trackPosition?: { x?: number; y?: number } }[];
  circuitName?: string;
  location?: string;
  countryName?: string;
}

export interface RawCircuitFrame {
  /** MultiViewer's stored rotation (degrees) that orients the circuit north-up. */
  rotation: number;
  /** Corner positions already rotated into the north-up frame (raw units). */
  corners: { number: number; x: number; y: number }[];
}


/**
 * Sector bands and the speed trap from the normalized center-line: sectors are
 * lap-distance thirds, the trap sits at the end of the longest corner-to-corner
 * straight (where F1 puts it).
 */
function lapMarkers(
  points: [number, number][],
  corners: { number: number; x: number; y: number }[]
): Pick<CircuitGeometry, "sectorSplits" | "speedTrap"> {
  const n = points.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const total = cum[n] || 1;
  const indexAt = (fraction: number): number => {
    const target = fraction * total;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(n - 1, lo);
  };

  const sectorSplits: [number, number] = [indexAt(1 / 3), indexAt(2 / 3)];

  const cornerIndexes = corners
    .map((corner) => {
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < n; i++) {
        const d = (points[i][0] - corner.x) ** 2 + (points[i][1] - corner.y) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
      return best;
    })
    .sort((a, b) => a - b);

  let speedTrap: CircuitGeometry["speedTrap"] = null;
  if (cornerIndexes.length > 1) {
    let longest = 0;
    let from = 0;
    for (let k = 0; k < cornerIndexes.length; k++) {
      const start = cornerIndexes[k];
      const end = cornerIndexes[(k + 1) % cornerIndexes.length];
      const gap = end > start ? cum[end] - cum[start] : total - cum[start] + cum[end];
      if (gap > longest) {
        longest = gap;
        from = cum[start];
      }
    }
    if (longest > 0) {
      const at = ((from + longest * 0.88) % total) / total;
      const i = indexAt(at);
      const prev = points[(i - 1 + n) % n];
      const next = points[(i + 1) % n];
      speedTrap = {
        x: points[i][0],
        y: points[i][1],
        angle: (Math.atan2(next[1] - prev[1], next[0] - prev[0]) * 180) / Math.PI,
      };
    }
  }

  return { sectorSplits, speedTrap };
}

/** Cache across requests — geometry is immutable per circuit+year. */
const cache = new Map<string, { at: number; data: CircuitGeometry | null }>();
const TTL = 24 * 60 * 60 * 1000;

/** rotation-frame cache for the telemetry track-map (raw corners, north-up). */
const frameCache = new Map<string, { at: number; data: RawCircuitFrame | null }>();

/**
 * The rotated corner positions in the circuit's RAW units — the same frame
 * OpenF1's /location x/y live in (verified: identical value ranges). The
 * telemetry route rotates + normalizes lap paths with the same transform, so
 * corner numerals land exactly on the real car positions.
 */
export async function getRawCircuitFrame(
  circuitInfoUrl: string | null | undefined,
  cacheKey: string
): Promise<RawCircuitFrame | null> {
  if (!circuitInfoUrl) return null;
  const hit = frameCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  let data: RawCircuitFrame | null = null;
  try {
    const res = await fetch(circuitInfoUrl, {
      next: { revalidate: 60 * 60 * 24 },
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const mv = (await res.json()) as MvCircuit;
      const rad = ((mv.rotation ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const corners = (mv.corners ?? [])
        .filter((c) => c.trackPosition?.x != null && c.trackPosition?.y != null)
        .map((c) => ({
          number: c.number,
          x: c.trackPosition!.x! * cos - c.trackPosition!.y! * sin,
          y: c.trackPosition!.x! * sin + c.trackPosition!.y! * cos,
        }));
      if (corners.length > 0) data = { rotation: mv.rotation ?? 0, corners };
    }
  } catch {
    data = null;
  }
  frameCache.set(cacheKey, { at: Date.now(), data });
  return data;
}


/**
 * Real track geometry for one circuit, normalized to a 0–100 box with aspect
 * preserved. Null when the circuit is unknown or the API is unreachable —
 * callers fall back to the official 2D outline image.
 */
export async function getCircuitGeometry(
  circuitInfoUrl: string | null | undefined,
  cacheKey: string
): Promise<CircuitGeometry | null> {
  if (!circuitInfoUrl) return null;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  let data: CircuitGeometry | null = null;
  try {
    const res = await fetch(circuitInfoUrl, {
      next: { revalidate: 60 * 60 * 24 },
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const mv = (await res.json()) as MvCircuit;
      const xs = mv.x ?? [];
      const ys = mv.y ?? [];
      if (xs.length > 20 && ys.length === xs.length) {
        // Rotate by MultiViewer's stored rotation so north points up, then
        // normalize into a 0–100 box (aspect preserved) with margins.
        const rad = ((mv.rotation ?? 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rx = xs.map((x, i) => x * cos - ys[i] * sin);
        const ry = xs.map((x, i) => x * sin + ys[i] * cos);
        const minX = Math.min(...rx);
        const maxX = Math.max(...rx);
        const minY = Math.min(...ry);
        const maxY = Math.max(...ry);
        const spanX = Math.max(1, maxX - minX);
        const spanY = Math.max(1, maxY - minY);
        const M = 8; // margin inside the 0–100 box
        const sx = (100 - 2 * M) / Math.max(spanX, spanY);
        const sy = (100 - 2 * M) / Math.max(spanX, spanY);
        const nx = (v: number) => M + (v - minX) * sx;
        const ny = (v: number) => M + (v - minY) * sy;
        const points: [number, number][] = rx.map((v, i) => [nx(v), ny(ry[i])]);
        const corners = (mv.corners ?? [])
          .filter((c) => c.trackPosition?.x != null && c.trackPosition?.y != null)
          .map((c) => {
            const cx = c.trackPosition!.x!;
            const cy = c.trackPosition!.y!;
            return {
              number: c.number,
              x: nx(cx * cos - cy * sin),
              y: ny(cx * sin + cy * cos),
            };
          });
        data = {
          points,
          corners,
          circuitName: mv.circuitName ?? "",
          location: mv.location ?? "",
          countryName: mv.countryName ?? "",
          cornerCount: mv.corners?.length ?? corners.length,
          ...lapMarkers(points, corners),
        };
      }
    }
  } catch {
    data = null;
  }
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}
