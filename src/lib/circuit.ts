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
        };
      }
    }
  } catch {
    data = null;
  }
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}
