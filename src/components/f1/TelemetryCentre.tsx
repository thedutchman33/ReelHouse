"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { DriverAvatar, TeamMark } from "@/components/f1/TeamLogo";
import {
  buildDeltaRows,
  buildDomination,
  distAtTime,
  mergeLapRows,
  posAtDistance,
  sectorEndDistances,
  warpToBaseline,
  type DeltaLap,
  type PlayEntry,
  type TrackPoint,
  type WarpRow,
} from "@/lib/f1-telemetry-math";
import type { F1LapPick, F1LapTelemetry, F1LapTelemetryPayload } from "@/lib/f1";
import {
  ChartKit,
  ZoomProvider,
  useZoom,
  useElementSize,
  type ChartSeries,
  type PlaybackCursor,
} from "@/components/f1/charts";
import { useF1Tabs } from "@/components/f1/SessionTabs";
import { FALLBACK_LAP_COLORS, TyreBadge } from "@/components/f1/tyre";
import { deltaFmt, lapFmtF, playClockF } from "@/components/f1/format";
import { useIsMobile } from "@/hooks/use-is-mobile";

/**
 * The telemetry centre — GP-Tempo's `f9`/`d9.c`, rebuilt on real OpenF1 data
 * with a custom SVG chart engine. Everything mirrors the reference view:
 * per-lap cards with palette pickers, the animated domination track map, the
 * shared "click and drag to zoom", the playback bar that races the picked
 * laps together, and the seven stacked channel charts (Speed / Delta /
 * Throttle / Brake / RPM / DRS / Gear) with sector + corner marks.
 */

const DRS_YEAR_CUTOFF = 2026; // their rule: hide the DRS chart for 2026 sessions

// ---------------------------------------------------------------------------
// Data plumbing (their per-pick queries → one grouped call)
// ---------------------------------------------------------------------------

function lapKeyOf(p: { driverNumber: number; lap: number; sessionKey?: number }): string {
  return `${p.sessionKey ?? 0}_${p.driverNumber}_${p.lap}`;
}

function useTelemetryPayload(
  picks: F1LapPick[]
): { payload: F1LapTelemetryPayload | null; loading: boolean } {
  const key = useMemo(
    () =>
      picks
        .map((p) => `${p.driverNumber}:${p.lap}${p.sessionKey ? `:${p.sessionKey}` : ""}`)
        .join(","),
    [picks],
  );
  const [payload, setPayload] = useState<F1LapTelemetryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedKey = useRef("");

  useEffect(() => {
    if (!key) {
      loadedKey.current = "";
      setPayload(null);
      setLoading(false);
      return;
    }
    if (loadedKey.current === key) return; // already fetched this exact set
    const ctl = new AbortController();
    setLoading(true);
    const session = picks[0]?.sessionKey ?? 0;
    fetch(`/api/f1/telemetry?session=${session}&picks=${encodeURIComponent(key)}`, {
      signal: ctl.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("bad status");
        return res.json() as Promise<F1LapTelemetryPayload>;
      })
      .then((data) => {
        loadedKey.current = key;
        setPayload(data);
        setLoading(false);
      })
      .catch(() => {
        if (ctl.signal.aborted) return;
        setPayload(null);
        setLoading(false);
      });
    return () => ctl.abort();
  }, [key, picks]);

  return { payload, loading };
}

// ---------------------------------------------------------------------------
// Their `Fa` — the store: warped channel rows, sector-anchored deltas,
// domination rows, playback tracks. Port of their computation flow.
// ---------------------------------------------------------------------------

interface Track {
  lapKey: string;
  colour: string;
  entries: PlayEntry[];
  duration: number;
}

interface TelemetryStore {
  laps: { lapKey: string; colour: string; label: string; pick: F1LapTelemetry }[];
  series: ChartSeries[];
  speedRows: WarpRow[];
  throttleRows: WarpRow[];
  brakeRows: WarpRow[];
  rpmRows: WarpRow[];
  gearRows: WarpRow[];
  drsRows: WarpRow[];
  deltaRows: WarpRow[];
  deltaSeries: ChartSeries[];
  sectorDistances: number[];
  /** Map rows: base `{x,y,distance}` rows + per-owner `{x,y,[lapKey]}` rows. */
  dominationRows: WarpRow[];
  tracks: Track[];
  corners: { x: number; y: number; dist: number; number: number }[];
}

function buildStore(payload: F1LapTelemetryPayload, picks: F1LapPick[]): TelemetryStore | null {
  const all = payload.picks;
  const colourMap = new Map(picks.map((p) => [lapKeyOf(p), p.colour]));
  // Laps without usable samples drop out (their loaded-queries filter).
  const laps = all.filter((p) => p.samples.some((s) => s.dist != null));
  if (laps.length === 0 || !payload.path) return null;

  const keys = laps.map(lapKeyOf);
  const colourOf = (i: number) => colourMap.get(keys[i]) ?? `#${laps[i].teamColour}`;
  const labelOf = (i: number) => `${laps[i].acronym} - Lap ${laps[i].lap}`;

  // Baseline = the fastest timed lap (their argmin lapTime).
  const timedAll = laps
    .map((p, idx) => ({ lapTime: p.lapTime, idx }))
    .filter((o): o is { lapTime: number; idx: number } => o.lapTime != null);
  const baselineIdx = timedAll.length
    ? timedAll.reduce((a, b) => (b.lapTime < a.lapTime ? b : a)).idx
    : 0;

  // ---- channels: raw per-lap rows → baseline grid warp → merged rows ------
  const channelRaw = (
    get: (s: F1LapTelemetry["samples"][number]) => number
  ): WarpRow[][] =>
    laps.map((p, i) =>
      p.samples
        .filter((s) => s.dist != null)
        .map((s) => ({ x: s.dist as number, [keys[i]]: get(s) })),
    );

  const speedWarped = warpToBaseline(
    channelRaw((s) => s.speed),
    keys,
    baselineIdx
  );
  const speedRows = mergeLapRows(speedWarped);
  const throttleRows = mergeLapRows(warpToBaseline(channelRaw((s) => s.throttle), keys, baselineIdx));
  const brakeRows = mergeLapRows(warpToBaseline(channelRaw((s) => s.brake), keys, baselineIdx));
  const rpmRows = mergeLapRows(warpToBaseline(channelRaw((s) => s.rpm), keys, baselineIdx));
  const gearRows = mergeLapRows(warpToBaseline(channelRaw((s) => s.gear), keys, baselineIdx));
  const drsRows = mergeLapRows(
    warpToBaseline(channelRaw((s) => s.drs ?? 0), keys, baselineIdx)
  );

  // ---- deltas (sector-anchored, their YV) ----------------------------------
  const deltaLaps: DeltaLap[] = [];
  for (let i = 0; i < laps.length; i++) {
    const p = laps[i];
    const timeRows: WarpRow[] = p.samples
      .filter((s) => s.dist != null)
      .map((s) => ({ x: s.dist as number, [keys[i]]: s.t }));
    if (p.lapTime == null || p.sector1 == null || p.sector2 == null) continue;
    deltaLaps.push({
      lapKey: keys[i],
      timeRows,
      sector1: p.sector1,
      sector2: p.sector2,
      lapTime: p.lapTime,
    });
  }
  const deltaBaseIdx = deltaLaps.findIndex((l) => l.lapKey === keys[baselineIdx]);
  const deltaBase = deltaBaseIdx !== -1 ? deltaBaseIdx : 0;
  const deltaRows = deltaLaps.length ? buildDeltaRows(deltaLaps, deltaBase) : [];
  const deltaSeries: ChartSeries[] = deltaLaps.map((l, i) => ({
    key: l.lapKey,
    colour: colourMap.get(l.lapKey) ?? `#${laps[i].teamColour}`,
    label: `${laps[i].acronym} - Lap ${laps[i].lap}`,
  }));

  // Sector lines: the delta-baseline's own sector-end distances (their ZV).
  const baseDev = deltaLaps[deltaBase];
  const sectorDistances = baseDev
    ? sectorEndDistances(baseDev.lapKey, baseDev.timeRows, baseDev.sector1, baseDev.sector2)
    : [];

  // ---- domination rows (their JV) on real track positions ------------------
  const timedIdx = laps
    .map((_, i) => i)
    .filter((i) => laps[i].lapTime != null && laps[i].samples.some((s) => s.dist != null));
  const pathCols: TrackPoint[] = payload.path.dist.map((d, i) => ({
    x: payload.path!.x[i],
    y: payload.path!.y[i],
    distance: d,
  }));
  // Their data pairs speed-row index with map-row index (both raw, identical
  // rows); ours pairs by distance onto the shared real path — same intent,
  // corrected for the per-lap calibration.
  // Warp puts every lap on the baseline lap's own x-grid, so the domination
  // grid IS the baseline grid.
  const gridXs = speedWarped[baselineIdx]?.map((r) => r.x) ?? [];
  const trackRows: TrackPoint[] = gridXs.map((x) => {
    const p = posAtDistance(pathCols, x);
    return { x: p.x, y: p.y, distance: x };
  });
  const dominationRows =
    timedIdx.length > 0 && trackRows.length > 0
      ? buildDomination(
          timedIdx.map((j) => speedWarped[j]),
          timedIdx.map((j) => keys[j]),
          trackRows
        )
      : [];

  // ---- playback tracks (their o9 entries: raw time → distance pairs) -------
  const tracks: Track[] = laps
    .map((p, i) => {
      const rows = p.samples.filter((s) => s.dist != null);
      if (rows.length === 0) return null;
      const first = rows[0].t;
      const entries: PlayEntry[] = rows.map((s) => ({ time: s.t - first, distance: s.dist as number }));
      return {
        lapKey: keys[i],
        colour: colourOf(i),
        entries,
        duration: entries[entries.length - 1].time,
      };
    })
    .filter((t): t is Track => t != null);

  return {
    laps: laps.map((p, i) => ({
      lapKey: keys[i],
      colour: colourOf(i),
      label: labelOf(i),
      pick: p,
    })),
    series: laps.map((_, i) => ({
      key: keys[i],
      colour: colourOf(i),
      label: labelOf(i),
    })),
    speedRows,
    throttleRows,
    brakeRows,
    rpmRows,
    gearRows,
    drsRows,
    deltaRows,
    deltaSeries,
    sectorDistances,
    dominationRows,
    tracks,
    corners: payload.path.corners,
  };
}

// ---------------------------------------------------------------------------
// The playback store (their `o9`, verbatim)
// ---------------------------------------------------------------------------

interface PlaybackApi {
  isPlaying: boolean;
  elapsedTime: number;
  maxDuration: number;
  playbackSpeed: number;
  play: () => void;
  pause: () => void;
  restart: () => void;
  seekTo: (t: number) => void;
  setSpeed: (v: number) => void;
  hasPlaybackData: boolean;
  cursors: PlaybackCursor[];
}

function usePlayback(tracks: Track[]): PlaybackApi {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [cursors, setCursors] = useState<PlaybackCursor[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const clockRef = useRef(0);
  const elapsedRef = useRef(0);
  const rafRef = useRef(0);

  const maxDuration = useMemo(() => Math.max(...tracks.map((t) => t.duration), 0), [tracks]);

  const tick = useCallback(
    (now: number) => {
      if (clockRef.current === 0) clockRef.current = now;
      const dt = ((now - clockRef.current) / 1000) * speed;
      clockRef.current = now;
      elapsedRef.current += dt;
      const p = elapsedRef.current;
      if (p >= maxDuration) {
        elapsedRef.current = maxDuration;
        setElapsed(maxDuration);
        setIsPlaying(false);
        const next: PlaybackCursor[] = [];
        for (const t of tracks) {
          if (p <= t.duration) {
            const dist = distAtTime(t.entries, p);
            if (dist != null) next.push({ lapKey: t.lapKey, distance: dist, colour: t.colour });
          }
        }
        setCursors(next);
        return;
      }
      const next: PlaybackCursor[] = [];
      for (const t of tracks) {
        if (p > t.duration) continue;
        const dist = distAtTime(t.entries, p);
        if (dist != null) next.push({ lapKey: t.lapKey, distance: dist, colour: t.colour });
      }
      setCursors(next);
      setElapsed(p);
      rafRef.current = requestAnimationFrame(tick);
    },
    [speed, maxDuration, tracks],
  );

  const cursorsAt = useCallback(
    (x: number): PlaybackCursor[] => {
      const next: PlaybackCursor[] = [];
      for (const t of tracks) {
        if (x > t.duration) continue;
        const dist = distAtTime(t.entries, x);
        if (dist != null) next.push({ lapKey: t.lapKey, distance: dist, colour: t.colour });
      }
      return next;
    },
    [tracks],
  );

  const play = useCallback(() => {
    if (tracks.length === 0) return;
    if (elapsedRef.current >= maxDuration) {
      elapsedRef.current = 0;
      setElapsed(0);
    }
    clockRef.current = 0;
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick, maxDuration, tracks.length]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const restart = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    elapsedRef.current = 0;
    clockRef.current = 0;
    setElapsed(0);
    setCursors([]);
    setIsPlaying(false);
  }, []);

  const seekTo = useCallback(
    (x: number) => {
      const v = Math.max(0, Math.min(x, maxDuration));
      cancelAnimationFrame(rafRef.current);
      elapsedRef.current = v;
      clockRef.current = 0;
      setElapsed(v);
      setCursors(cursorsAt(v));
      if (isPlaying) rafRef.current = requestAnimationFrame(tick);
    },
    [maxDuration, cursorsAt, isPlaying, tick],
  );

  const setSpeed = useCallback(
    (v: number) => {
      setSpeedState(v);
      if (isPlaying) {
        cancelAnimationFrame(rafRef.current);
        clockRef.current = 0;
      }
    },
    [isPlaying],
  );

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  // Their speed effect: on [speed, isPlaying] while playing restart the loop.
  useEffect(() => {
    if (isPlaying) {
      cancelAnimationFrame(rafRef.current);
      clockRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [speed, isPlaying, tick]);
  // Their full reset when the lap set changes.
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    elapsedRef.current = 0;
    clockRef.current = 0;
    setElapsed(0);
    setCursors([]);
  }, [tracks.length]);

  return {
    isPlaying,
    elapsedTime: elapsed,
    maxDuration,
    playbackSpeed: speed,
    play,
    pause,
    restart,
    seekTo,
    setSpeed,
    hasPlaybackData: tracks.length > 0,
    cursors,
  };
}

// ---------------------------------------------------------------------------
// The track map (their `l9`, rebuilt as px-space SVG)
// ---------------------------------------------------------------------------

const SPEEDS = [0.5, 1, 2, 4];

function TrackMapCard({
  rows,
  corners,
  picks,
  distance,
  setDistance,
  cursors,
  loading,
}: {
  rows: WarpRow[];
  corners: { x: number; y: number; dist: number; number: number }[];
  picks: { lapKey: string; colour: string; label: string }[];
  distance: number | null;
  setDistance: (d: number | null) => void;
  cursors: PlaybackCursor[];
  loading: boolean;
}) {
  const [boxRef, size] = useElementSize();

  // Their rows layout: base rows ({x, y, distance}) first, appended owner
  // rows ({x, [lapKey]: y}) without `y` after them.
  const baseRows: { x: number; y: number; distance: number }[] = [];
  for (const row of rows) {
    if (!("y" in row) || !("distance" in row)) continue;
    const x = Number(row.x);
    const y = Number(row.y);
    const d = Number(row.distance);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(d)) {
      baseRows.push({ x, y, distance: d });
    }
  }

  // CONTAIN-FIT into the box with their fixed 25px margins. Theirs projects
  // each axis independently into their aspect box (whose ratio they even
  // compute from polluted "distance" keys); ours keeps the true shape and
  // centers it.
  const W = size.w;
  const H = size.h;
  const xs = baseRows.map((r) => r.x);
  const ys = baseRows.map((r) => r.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 1;
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const fit = Math.min(Math.max(0, W - 50) / spanX, Math.max(0, H - 50) / spanY);
  const ox = (W - spanX * fit) / 2;
  const oy = (H - spanY * fit) / 2;
  const px = (v: number) => ox + (v - minX) * fit;
  const py = (v: number) => H - oy - (v - minY) * fit;
  // Their speed-calibration factor (`f = max(5, hypot(...)/2500/... )*1.5`) is
  // expressed in SVG user units; ours is pixel-native already, so the same
  // expression with the fitted scale gives their visual thickness.
  const f = Math.max(5, Math.hypot(spanX * fit, spanY * fit) / 125) * 1.5;

  // Crosshair row: the base row nearest the shared chart distance.
  const crosshair = (() => {
    if (distance == null) return null;
    let best: (typeof baseRows)[number] | null = null;
    let bestD = Infinity;
    for (const row of baseRows) {
      const d = Math.abs(row.distance - distance);
      if (d < bestD) {
        bestD = d;
        best = row;
      }
    }
    return best;
  })();

  const onMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best: (typeof baseRows)[number] | null = null;
    let bestD = Infinity;
    for (const row of baseRows) {
      const d = Math.hypot(px(row.x) - mx, py(row.y) - my);
      if (d < bestD) {
        bestD = d;
        best = row;
      }
    }
    setDistance(best ? best.distance : null);
  };

  // White underlay from the base rows...
  const underlayPts: string[] = [];
  for (const row of baseRows) {
    underlayPts.push(`${px(row.x)},${py(row.y)}`);
  }
  // ...and per-owner domination lines: owner rows only, split at index gaps
  // so a coloured line never chords across the stretch where another lap led
  // (their recharts lines break on nulls — connectNulls is off there).
  const ownerSegs: { colour: string; lapKey: string; parts: string[][] }[] = picks.map((pick) => {
    const parts: string[][] = [];
    let cur: string[] | null = null;
    let prevIdx = -1;
    rows.forEach((row, idx) => {
      const v = row[pick.lapKey];
      if (v === undefined) return;
      const pt = `${px(Number(row.x))},${py(Number(v))}`;
      if (cur && idx === prevIdx + 1) cur.push(pt);
      else {
        cur = [pt];
        parts.push(cur);
      }
      prevIdx = idx;
    });
    return { colour: pick.colour, lapKey: pick.lapKey, parts };
  });

  if (loading) {
    return (
      <div className="flex w-full justify-center">
        <div className="h-[300px] w-[300px] animate-pulse rounded-xl bg-white/5" />
      </div>
    );
  }
  if (baseRows.length === 0) {
    return (
      <div className="flex h-[200px] w-full items-center justify-center rounded-xl border border-white/[0.07] bg-black/20 text-center text-sm text-white/50 md:h-[280px]">
        Track map unavailable for this session
      </div>
    );
  }

  return (
    <div className="flex w-full justify-center">
      <div ref={boxRef} className="watermarkTM relative h-[230px] w-full max-w-full md:h-[340px]">
        <svg
          width={W}
          height={H}
          className="block"
          onMouseMove={onMove}
          onMouseLeave={() => setDistance(null)}
        >
          {/* underlay (their white f*2 line) with a soft glow lift */}
          <polyline
            points={underlayPts.join(" ")}
            fill="none"
            stroke="#ffffff"
            strokeWidth={f * 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 7px rgba(255,255,255,0.22))" }}
          />
          {/* domination lines per picked lap (their f*1.4 coloured lines, drawn
              in after 1.5s — one path per owned stretch, broken at gaps) */}
          {ownerSegs.map((o) =>
            o.parts.map((part, pi) => (
              <polyline
                key={`dom-${o.lapKey}-${pi}`}
                points={part.join(" ")}
                fill="none"
                stroke={o.colour}
                strokeWidth={f * 1.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: "f1-trace 1.4s ease-out 1.5s forwards" }}
              />
            ))
          )}
          {/* corner numerals (their ReferenceDot labels: number, halo) */}
          {corners.map((c) => (
            <text
              key={`cor-${c.number}`}
              x={px(c.x)}
              y={py(c.y)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="9.5"
              fontWeight="bold"
              fill="rgba(255,255,255,0.92)"
              stroke="#000000"
              strokeWidth={3}
              paintOrder="stroke"
              className="select-none"
              opacity={0.85}
            >
              {c.number}
            </text>
          ))}
          {/* crosshair dot (their default ReferenceDot, F1TV cursor form;
              cx/cy transition for a gliding chase instead of teleporting) */}
          {crosshair && (
            <g pointerEvents="none">
              <circle
                r={12}
                cx={px(crosshair.x)}
                cy={py(crosshair.y)}
                fill="#ffffff"
                opacity={0.1}
                style={{ transition: "cx 60ms linear, cy 60ms linear" }}
              />
              <circle
                r={6}
                cx={px(crosshair.x)}
                cy={py(crosshair.y)}
                fill="#ffffff"
                style={{ transition: "cx 40ms linear, cy 40ms linear" }}
              />
            </g>
          )}
          {/* playback dots (their r=f*1.5, white ring) — the cursor distance
              resolves to a track position the same way theirs does */}
          {cursors.map((c) => {
            const pos = posAtDistance(baseRows, c.distance);
            return (
              <g key={`pb-${c.lapKey}`} pointerEvents="none">
                <circle r={f * 2.6} cx={px(pos.x)} cy={py(pos.y)} fill={c.colour} opacity={0.28} />
                <circle
                  r={f * 1.5}
                  cx={px(pos.x)}
                  cy={py(pos.y)}
                  fill={c.colour}
                  stroke="#ffffff"
                  strokeWidth={1.25}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The player bar (their `c9`)
// ---------------------------------------------------------------------------

const IconPlay = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="m9 5 10 7-10 7V5z" fill="currentColor" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);
const IconPause = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M8 5v14M16 5v14" strokeLinecap="round" />
  </svg>
);
const IconRestart = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function PlayerBar({ playback }: { playback: PlaybackApi }) {
  const {
    isPlaying,
    elapsedTime,
    maxDuration,
    playbackSpeed,
    play,
    pause,
    restart,
    seekTo,
    setSpeed,
    hasPlaybackData,
  } = playback;
  const mobile = useIsMobile();

  const seek = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      if (!box || maxDuration <= 0) return;
      const fraction = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
      seekTo(fraction * maxDuration);
    },
    [seekTo, maxDuration],
  );

  if (!hasPlaybackData) return null;
  const pct = maxDuration > 0 ? (elapsedTime / maxDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#121218]/90 px-2 py-2">
      <button
        type="button"
        onClick={isPlaying ? pause : play}
        title={isPlaying ? "Pause" : "Play"}
        aria-label={isPlaying ? "Pause playback" : "Play playback"}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e10600] text-white shadow-[0_2px_10px_rgb(225_6_0/0.35)] transition hover:bg-[#ff2421] active:scale-95"
      >
        {isPlaying ? <IconPause /> : <IconPlay />}
      </button>
      <button
        type="button"
        onClick={restart}
        title="Restart"
        aria-label="Restart playback"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white active:scale-95"
      >
        <IconRestart className="h-4 w-4" />
      </button>
      {/* F1TV scrubber: slim rail, red fill, glowing thumb on hover */}
      <div className="mx-1 group/bar min-w-0 flex-1 cursor-pointer py-1.5" onClick={seek}>
        <div className="relative h-1.5 w-full rounded-full bg-white/10">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[#e10600] shadow-[0_0_8px_rgb(225_6_0/0.55)] transition-none"
            style={{ width: `${pct}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white opacity-0 shadow-[0_0_8px_rgb(225_6_0/0.8)] ring-2 ring-[#e10600]/70 transition-opacity duration-150 group-hover/bar:opacity-100"
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>
      <span className="shrink-0 text-right text-[11px] font-medium tabular-nums text-white/55">
        <span className="text-white/90">{playClockF(elapsedTime)}</span>
        {!mobile && ` / ${playClockF(maxDuration)}`}
      </span>
      {mobile ? (
        <select
          value={String(playbackSpeed)}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="h-7 shrink-0 rounded-md border border-white/15 bg-[#191a20] px-1 text-xs text-white/80 [&>option]:bg-[#191a20]"
          aria-label="Playback speed"
        >
          {SPEEDS.map((v) => (
            <option key={v} value={String(v)}>
              {v}x
            </option>
          ))}
        </select>
      ) : (
        <div className="ml-1 flex shrink-0 items-center gap-0.5 rounded-lg border border-white/[0.08] bg-black/30 p-0.5">
          {SPEEDS.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={playbackSpeed === v}
              onClick={() => setSpeed(v)}
              className={`h-6 rounded-md px-2 text-[11px] font-semibold tabular-nums transition duration-150 ${
                playbackSpeed === v
                  ? "bg-[#e10600] text-white"
                  : "text-white/50 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              {v}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The lap+palette cards (their `a9`/`i9`/`n9`)
// ---------------------------------------------------------------------------

function PalettePicker({
  pick,
  onPick,
  colours,
}: {
  pick: { colour: string | null };
  onPick: (c: string) => void;
  colours: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Pick a colour"
        className="flex h-5 w-5 items-center justify-center rounded p-0.5 ring-1 ring-white/20 transition hover:ring-white/50"
      >
        <span className="block h-3 w-3 rounded" style={{ background: pick.colour ?? "#ffffff" }} aria-hidden="true" />
      </button>
      {open && (
        <div className="f1-in absolute bottom-full left-0 z-30 mt-1 mb-1 w-64 rounded-lg border border-white/15 bg-[#101113]/95 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.65)]">
          <div className="flex flex-wrap gap-1">
            {colours.map((c, i) => (
              <button
                key={`${c}-${i}`}
                type="button"
                aria-label={`Use colour ${c}`}
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                className="h-6 w-6 cursor-pointer rounded-md ring-1 ring-white/15 transition active:scale-105"
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PickCard({
  entry,
  onRemove,
  onColour,
}: {
  entry: {
    pick: F1LapTelemetry;
    colour: string;
    delta: number | undefined;
    tyreColours: string[];
  };
  onRemove: () => void;
  onColour: (c: string) => void;
}) {
  const { pick, colour, delta, tyreColours } = entry;

  return (
    <div className="group relative min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#121218]/90 p-3.5 pl-4 transition duration-200 hover:border-white/[0.16] hover:bg-[#15151e]/90">
      {/* team-colour spine (F1TV driver identity bar) */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3.5px] rounded-r-full opacity-90"
        style={{ background: colour }}
      />
      <div className="flex min-w-0 flex-row items-center justify-between gap-2">
        <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/40">
          {pick.sessionLabel}
        </span>
        <button
          type="button"
          onClick={onRemove}
          title="Remove lap"
          className="shrink-0 rounded-md p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white active:scale-90"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="mt-1 flex min-w-0 flex-row items-center gap-2">
        <DriverAvatar
          name={pick.fullName}
          colour={pick.teamColour ? `#${pick.teamColour}` : "#ffffff"}
          size={20}
        />
        <TyreBadge compound={pick.compound} size={18} />
        <span className="truncate font-f1 text-[15px] font-bold uppercase tracking-wide text-white">
          {pick.acronym}
        </span>
        <span className="text-[12px] font-medium text-white/50">Lap {pick.lap}</span>
        <PalettePicker
          pick={{ colour }}
          onPick={onColour}
          colours={[(pick.teamColour ? `#${pick.teamColour}` : "#ffffff"), ...tyreColours]}
        />
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/35">
        <TeamMark team={pick.teamName} size={12} tone="mono" />
        <span className="truncate">{pick.teamName}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2.5">
        <span className="text-[22px] font-bold leading-none tracking-tight text-white tabular-nums">
          {pick.lapTime != null ? lapFmtF(pick.lapTime) : "—"}
        </span>
        {delta != null && delta > 0 && (
          <span className="rounded-md bg-[#e10600]/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#ff8578]">
            +{delta.toFixed(3)}s
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The centre
// ---------------------------------------------------------------------------

export default function TelemetryCentre({
  picks,
  onPicksChange,
}: {
  picks: F1LapPick[];
  onPicksChange: (picks: F1LapPick[]) => void;
}) {
  // Their shell: kH (one shared zoom state) wraps the telemetry pane f9.
  return (
    <ZoomProvider>
      <TelemetryInner picks={picks} onPicksChange={onPicksChange} />
    </ZoomProvider>
  );
}

function TelemetryInner({
  picks,
  onPicksChange,
}: {
  picks: F1LapPick[];
  onPicksChange: (picks: F1LapPick[]) => void;
}) {
  const { payload, loading } = useTelemetryPayload(picks);
  const mobile = useIsMobile();
  const { viewMode } = useF1Tabs();
  // Their shared markerDistance state (chart crosshair ↔ map dot).
  const [distance, setDistance] = useState<number | null>(null);
  const zoom = useZoom();

  const store = useMemo(
    () => (payload && picks.length ? buildStore(payload, picks) : null),
    [payload, picks]
  );

  const playback = usePlayback(store?.tracks ?? []);

  useEffect(() => {
    setDistance(null);
  }, [picks]);

  const setPickColour = useCallback(
    (lapKey: string, colour: string) => {
      onPicksChange(
        picks.map((p) => (lapKeyOf(p) === lapKey ? { ...p, colour } : p))
      );
    },
    [onPicksChange, picks],
  );

  const removePick = useCallback(
    (lapKey: string) => {
      onPicksChange(picks.filter((p) => lapKeyOf(p) !== lapKey));
    },
    [onPicksChange, picks],
  );

  if (picks.length === 0) {
    return (
      <div className="flex h-[360px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.07] bg-black/25 p-10 text-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-white/20" aria-hidden="true">
          <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-sm text-white/50">
          {viewMode === "combined"
            ? "Select laps from the table above to view telemetry data"
            : "Data will be shown here when you have selected laps from the session tab"}
        </p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/25">
          {viewMode === "combined" ? "Tap a lap-time cell above to load it" : "Session view → click a lap"}
        </p>
      </div>
    );
  }

  const showDrs = (payload?.picks ?? []).some((p) => p.year && p.year < DRS_YEAR_CUTOFF);
  const cornersForCharts = (store?.corners ?? []).map((c, i) => ({ x: c.dist, label: i + 1 }));

  const chartCommon = {
    series: store?.series ?? [],
    xKey: "x",
    markerX: distance,
    onMarker: setDistance,
    cursors: playback.cursors,
    sectors: store?.sectorDistances ?? [],
    corners: cornersForCharts,
    zoom,
  };

  return (
    <>
      {/* the glass panel needs a fragment wrapper: the mobile floating pills
          below must escape this container (its backdrop-filter would become
          the containing block for any fixed-position child). */}
      <div className="f1-card rounded-2xl">
        <div className="flex flex-1 flex-col gap-4 p-3 md:p-5">
          {/* panel header: live-telemetry summary strip */}
          <div className="-mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#e10600] shadow-[0_0_6px_rgb(225_6_0/0.8)]" />
              Telemetry · Live traces
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/30 tabular-nums">
              {picks.length} / 4 laps loaded
            </p>
          </div>
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="md:w-2/5">
            <div className="flex w-full items-center justify-center">
              <dl className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2">
                {loading || !store
                  ? picks.slice(0, 4).map((p, i) => (
                      <div
                        key={`${p.driverNumber}-${p.lap}-${p.sessionKey ?? i}`}
                        className="relative min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#121218]/90 p-3.5 pl-4"
                      >
                        <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
                        <div className="mt-2.5 h-4 w-1/3 animate-pulse rounded bg-white/10" />
                        <div className="mt-2.5 h-6 w-2/3 animate-pulse rounded bg-white/10" />
                      </div>
                    ))
                  : picks.slice(0, 4).map((p) => {
                      const entry = store.laps.find((l) => l.lapKey === lapKeyOf(p));
                      if (!entry) return null;
                      const fastest = store.laps.reduce<number>((m, l) => {
                        const t = l.pick.lapTime;
                        return t != null && t < m ? t : m;
                      }, Infinity);
                      const delta =
                        entry.pick.lapTime != null && Number.isFinite(fastest)
                          ? entry.pick.lapTime - fastest
                          : undefined;
                      return (
                        <PickCard
                          key={entry.lapKey}
                          entry={{
                            pick: entry.pick,
                            colour: entry.colour,
                            delta,
                            tyreColours: FALLBACK_LAP_COLORS,
                          }}
                          onRemove={() => removePick(entry.lapKey)}
                          onColour={(c) => setPickColour(entry.lapKey, c)}
                        />
                      );
                    })}
              </dl>
            </div>
          </div>
          <div className="md:w-3/5">
            <TrackMapCard
              rows={store?.dominationRows ?? []}
              corners={store?.corners ?? []}
              picks={store?.laps ?? []}
              distance={distance}
              setDistance={setDistance}
              cursors={playback.cursors}
              loading={loading || !store}
            />
          </div>
        </div>

        <PlayerBar playback={playback} />

        {/* the seven stacked channel charts (their f9) — F1TV panel rows */}
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0d11] shadow-[0_2px_18px_rgba(0,0,0,0.35)]">
          {!mobile && (
            <div className="flex h-9 items-center justify-end border-b border-white/[0.05] px-3">
              {zoom.zoomed ? (
                <button
                  type="button"
                  onClick={zoom.zoomOut}
                  className="flex h-6 items-center gap-1.5 rounded-md border border-[#e10600]/40 bg-[#e10600]/10 px-2.5 text-[11px] font-semibold text-[#ff8578] transition hover:bg-[#e10600]/20 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden="true">
                    <path d="M3 3v5h5M3 3l7 7m11 11v-5h-5m5 5-7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Reset zoom
                </button>
              ) : (
                <span className="flex select-none items-center gap-1.5 text-[11px] text-white/35">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4-4M11 8v6M8 11h6" strokeLinecap="round" />
                  </svg>
                  Click and drag to zoom
                </span>
              )}
            </div>
          )}
          <ChartKit
            {...chartCommon}
            rows={store?.speedRows ?? []}
            yLabel="Speed (km/h)"
            area
            className="h-[200px] w-full md:h-[300px] watermark"
          />
          <div aria-hidden="true" className="h-px bg-white/[0.05]" />
          <ChartKit
            {...chartCommon}
            rows={store?.deltaRows ?? []}
            series={store?.deltaSeries ?? []}
            yLabel="Delta (s)"
            className="h-[110px] w-full watermark"
            valueFmt={deltaFmt}
          />
          <div aria-hidden="true" className="h-px bg-white/[0.05]" />
          <ChartKit
            {...chartCommon}
            rows={store?.throttleRows ?? []}
            yLabel="Throttle (%)"
            className="h-[120px] w-full md:h-[200px] watermark"
          />
          <div aria-hidden="true" className="h-px bg-white/[0.05]" />
          <ChartKit
            {...chartCommon}
            rows={store?.brakeRows ?? []}
            yLabel="Brake"
            className="h-[100px] w-full watermark"
            lineType="step"
            binary={50}
          />
          <div aria-hidden="true" className="h-px bg-white/[0.05]" />
          <ChartKit
            {...chartCommon}
            rows={store?.rpmRows ?? []}
            yLabel="RPM (%)"
            className="h-[120px] w-full md:h-[200px] watermark"
          />
          {showDrs && (
            <>
              <div aria-hidden="true" className="h-px bg-white/[0.05]" />
              <ChartKit
                {...chartCommon}
                rows={store?.drsRows ?? []}
                yLabel="DRS"
                className="h-[100px] w-full watermark"
                lineType="step"
                binary={10}
              />
            </>
          )}
          <div aria-hidden="true" className="h-px bg-white/[0.05]" />
          <ChartKit
            {...chartCommon}
            rows={store?.gearRows ?? []}
            yLabel="Gear"
            className="h-[120px] w-full md:h-[200px] watermark"
            lineType="step"
          />
        </div>
      </div>
      </div>

    {/* their mobile floating zoom controls — a sibling of the glass panel
        (backdrop-filter would otherwise become the fixed-position containing
        block and chase the pills off-screen) */}
    {mobile && (
      <div className="f1-in fixed bottom-4 right-4 z-50 flex gap-2">
        {zoom.zoomed && (
          <button
            type="button"
            onClick={zoom.zoomOut}
            className="rounded-lg border border-[#e10600]/40 bg-[#e10600]/15 px-3 py-2 text-sm font-semibold text-[#ff8578] shadow-lg backdrop-blur-sm"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => zoom.setZoomDisabled(!zoom.zoomDisabled)}
          title={zoom.zoomDisabled ? "Enable zoom" : "Disable zoom"}
          className={`f1-in rounded-lg border px-3 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition ${
            zoom.zoomDisabled ? "border-[#e10600]/40 bg-[#b02f30]" : "border-white/15 bg-[#15151e]"
          }`}
        >
          {zoom.zoomDisabled ? "Zoom Disabled" : "Zoom Enabled"}
        </button>
      </div>
    )}
    </>
  );
}
