"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";

/**
 * The GP-Tempo chart kit, rebuilt as custom SVG (recharts is not available in
 * ReelHouse — no new dependencies). Rendering semantics mirror the reference:
 * linear x domain with clipping overflow, exact dataMin/dataMax y domains,
 * monotone/step/linear line types, reference lines (crosshair, playback
 * cursors, sector + corner marks), reference-area drag-zoom with a shared
 * zoom state, and the shadcn-style rounded tooltip with per-series rows.
 */

export interface ZoomApi {
  zoomed: boolean;
  zoomDisabled: boolean;
  refArea: { left: number | ""; right: number | "" };
  setRefArea: (a: { left: number | ""; right: number | "" }) => void;
  xAxisRange: { left: number | "dataMin"; right: number | "dataMax" };
  zoom: () => void;
  zoomOut: () => void;
  setZoomDisabled: (v: boolean) => void;
}

/** Their `PA` — one zoom instance; zoom-disabled follows the mobile gate. */
export function useZoomState(): ZoomApi {
  const [zoomed, setZoomed] = useState(false);
  const mobile = useIsMobile();
  const [zoomDisabled, setZoomDisabled] = useState(false);
  useEffect(() => setZoomDisabled(mobile), [mobile]);
  const [xAxisRange, setXAxisRange] = useState<{
    left: number | "dataMin";
    right: number | "dataMax";
  }>({ left: "dataMin", right: "dataMax" });
  const [refArea, setRefArea] = useState<{ left: number | ""; right: number | "" }>({
    left: "",
    right: "",
  });

  const zoom = useCallback(() => {
    if (
      zoomDisabled ||
      refArea.left === "" ||
      refArea.right === "" ||
      refArea.left === refArea.right
    ) {
      setRefArea({ left: "", right: "" });
      return;
    }
    let l = refArea.left;
    let r = refArea.right;
    if (l > r) {
      const t = l;
      l = r;
      r = t;
    }
    setXAxisRange({ left: l, right: r });
    setZoomed(true);
    setRefArea({ left: "", right: "" });
  }, [zoomDisabled, refArea]);

  const zoomOut = useCallback(() => {
    setZoomed(false);
    setRefArea({ left: "", right: "" });
    setXAxisRange({ left: "dataMin", right: "dataMax" });
  }, []);

  return {
    zoomed,
    zoomDisabled,
    refArea,
    setRefArea,
    xAxisRange,
    zoom,
    zoomOut,
    setZoomDisabled,
  };
}

const ZoomCtx = createContext<ZoomApi | null>(null);

/** Their `kH` — one shared zoom state provider (the telemetry charts). */
export function ZoomProvider({ children }: { children: ReactNode }) {
  const api = useZoomState();
  return <ZoomCtx.Provider value={api}>{children}</ZoomCtx.Provider>;
}

export function useZoom(): ZoomApi {
  const v = useContext(ZoomCtx);
  if (!v) throw new Error("useZoom must be used within ZoomProvider");
  return v;
}

// ---------------------------------------------------------------------------
// Row + series types
// ---------------------------------------------------------------------------

export type ChartRow = { x?: number } & Record<string, number | string | undefined>;

export interface ChartSeries {
  /** The row key this line plots. */
  key: string;
  colour: string;
  label?: string;
  /** Dashed stroke — the lap-time evolution's trend line. */
  dashed?: boolean;
  /** Geometry-only series (trend lines) that shouldn't appear in tooltips. */
  omitFromTooltip?: boolean;
}

export interface PlaybackCursor {
  lapKey: string;
  distance: number;
  colour: string;
}

export interface ChartKitProps {
  rows: ChartRow[];
  series: ChartSeries[];
  /** The row field that positions points on the x axis (e.g. "x"). */
  xKey: string;
  /** Rank the tooltip rows fastest-first, like the lap-time chart. */
  ranked?: boolean;
  yLabel: string;
  /** Extra classes on the chart box (border/rounded/etc.). */
  className?: string;
  lineType?: "monotone" | "linear" | "step";
  /** F1TV-style translucent fill under the line (colour → transparent). */
  area?: boolean;
  /** Binary scale: values ≥ threshold display as 1, ticks ON/OFF. */
  binary?: number | null;
  /** Dashed grid (the session chart adds one). */
  grid?: boolean;
  /** Legend chips across the top (the session chart). */
  legend?: boolean;
  /** Extra bottom inset for x tick labels (the session chart: 72). */
  bottomInset?: number;
  tickFmtX?: (v: number) => string;
  tickFmtY?: (v: number) => string;
  xTicks?: number[];
  yAxisWidthDesktop?: number;
  /** Shared crosshair x (their markerDistance). */
  markerX?: number | null;
  /** Marker setter — theirs is set on every move and never cleared by charts. */
  onMarker?: (x: number | null) => void;
  cursors?: PlaybackCursor[];
  /** Sector-line x positions (labelled S2 / S3). */
  sectors?: number[];
  /** Corner marks (labelled 1..N below the axis line). */
  corners?: { x: number; label: number }[];
  zoom?: ZoomApi | null;
  tooltipTitle?: (row: ChartRow) => ReactNode | null;
  related?: (row: ChartRow) => ChartRow[];
  /** Tooltip value formatter (default: the raw value). */
  valueFmt?: (v: number, key: string) => string;
  /** Active-dot pick (the session chart adds/removes laps). */
  onDotPick?: (seriesKey: string, row: ChartRow) => void;
  /** Idle dots at every point; fill per row (the session chart's compounds). */
  idleDots?: boolean;
  dotFill?: (row: ChartRow) => string;
  /** Enlarged personal-best dots (Lap Time Evolution's "Personal bests"). */
  pbMarkers?: { x: number; y: number; colour: string; key: string }[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Shared element-size hook (the chart boxes measure their wrapper). */
export function useElementSize(): [RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 760, h: 220 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (!(span > 0) || !Number.isFinite(span)) return [min];
  const raw = span / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.ceil(min / step - 0.001) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    out.push(Number(v.toPrecision(12)));
  }
  return out;
}

/**
 * recharts-style monotone-x cubic (Fritsch–Carlson, one-pass with the
 * scipy PCHIP limiter). Tangents are weighted by the surrounding spans and
 * clamped ≥3× into the local secants, which keeps every cubic INSIDE the
 * data range — the averaged-tangent version flew whole control points above
 * the data whenever lap gaps were uneven (red-flag laps), and the clip then
 * sliced the spikes: the "graph cuts off at the top with outliers on" bug.
 */
function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [];
  const sec: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    // Duplicate x gets a 1e-6 span so the curve never divides by zero.
    const nearZero = Math.abs(pts[i + 1][0] - pts[i][0]) < 1e-6;
    dx.push(nearZero ? 1e-6 : pts[i + 1][0] - pts[i][0]);
    sec.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t: number[] = new Array(n);
  // interior tangents: weighted average, then signed Fritsch–Carlson clamp
  for (let i = 1; i < n - 1; i++) {
    if (sec[i - 1] * sec[i] <= 0) {
      t[i] = 0;
    } else {
      const weighted = (sec[i - 1] * dx[i] + sec[i] * dx[i - 1]) / (dx[i - 1] + dx[i]);
      const sgn = Math.sign(weighted);
      t[i] = sgn * Math.min(Math.abs(weighted), 3 * Math.abs(sec[i - 1]), 3 * Math.abs(sec[i]));
    }
  }
  // one-sided endpoint tangents, limited three-point (scipy `_edge_case`):
  t[0] = edgeTangent(pts, 0);
  t[n - 1] = edgeTangent(pts, n - 2);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const w = dx[i] / 3;
    d += ` C${pts[i][0] + w},${pts[i][1] + t[i] * w} ${pts[i + 1][0] - w},${pts[i + 1][1] - t[i + 1] * w} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/** One-sided endpoint tangent that never steers outside the first/last secant. */
function edgeTangent(pts: [number, number][], i: number): number {
  const s = (pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1e-6);
  // scipy limits the end tangent to 3× the sole secant; going beyond makes the
  // curve first-overshoot the crest — exactly the flat-line slice look.
  const g = i === 0 ? nextSlope(pts, 1) : prevSlope(pts, i);
  if (s * g <= 0) return 0;
  const avg = (s + g) / 2;
  return Math.sign(avg) * Math.min(Math.abs(avg), 3 * Math.abs(s), 3 * Math.abs(g));
}

function nextSlope(pts: [number, number][], i: number): number {
  const j = Math.min(i + 1, pts.length - 2);
  return (pts[j + 1][1] - pts[j][1]) / (pts[j + 1][0] - pts[j][0] || 1e-6);
}

function prevSlope(pts: [number, number][], i: number): number {
  const j = Math.max(i - 1, 0);
  return (pts[j + 1][1] - pts[j][1]) / (pts[j + 1][0] - pts[j][0] || 1e-6);
}

/** recharts "step" — horizontal to the midpoint, vertical, then horizontal. */
function stepPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < n; i++) {
    const midX = (pts[i - 1][0] + pts[i][0]) / 2;
    d += ` L${midX},${pts[i - 1][1]} L${midX},${pts[i][1]} L${pts[i][0]},${pts[i][1]}`;
  }
  return d;
}

function linearPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += ` L${pts[i][0]},${pts[i][1]}`;
  return d;
}

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

export function ChartKit({
  rows,
  series,
  xKey,
  yLabel,
  className = "",
  lineType = "linear",
  area = false,
  binary = null,
  grid = false,
  legend = false,
  bottomInset = 15,
  tickFmtX,
  tickFmtY,
  xTicks,
  yAxisWidthDesktop = 50,
  markerX = null,
  onMarker,
  cursors,
  sectors,
  corners,
  zoom = null,
  tooltipTitle,
  related,
  valueFmt,
  onDotPick,
  idleDots = false,
  dotFill,
  pbMarkers = [],
  ranked = false,
}: ChartKitProps) {
  const [boxRef, size] = useElementSize();
  const clipId = useId();
  const [hover, setHover] = useState<{ idx: number; mx: number; my: number } | null>(null);
  const mobile = useIsMobile();

  const W = size.w;
  const H = size.h;
  const legendH = legend ? 22 : 0;
  const yW = mobile ? 20 : yAxisWidthDesktop;
  const mLeft = 10;
  const mRight = grid ? 30 : 10; // the session chart's margin {right:30}
  const plotL = mLeft + yW;
  const plotR = W - mRight;
  const plotT = 5 + legendH;
  const plotB = H - bottomInset;

  // ---- x domain ----------------------------------------------------------
  const xa = zoom?.xAxisRange ?? { left: "dataMin" as const, right: "dataMax" as const };
  const domain = useMemo(() => {
    const xs = rows
      .map((r) => Number(r[xKey]))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    const dataMin = xs[0] ?? 0;
    const dataMax = xs[xs.length - 1] ?? 1;
    const left = typeof xa.left === "number" ? xa.left : dataMin;
    const right = typeof xa.right === "number" ? xa.right : dataMax;
    // Single-point guard so the scale never divides by zero.
    return right - left > 0 ? [left, right] : [left - 1, left + 1];
  }, [rows, xKey, xa.left, xa.right]);
  const px = useCallback(
    (v: number) => plotL + ((v - domain[0]) / (domain[1] - domain[0])) * (plotR - plotL),
    [plotL, plotR, domain]
  );

  // ---- y domain ----------------------------------------------------------
  const yDomain = useMemo(() => {
    if (binary != null) return [-0.05, 1.05];
    const vals: number[] = [];
    for (const row of rows) {
      for (const s of series) {
        const v = Number(row[s.key]);
        if (Number.isFinite(v)) vals.push(v);
      }
    }
    let min = vals.length ? Math.min(...vals) : 0;
    let max = vals.length ? Math.max(...vals) : 1;
    // recharts' exact "dataMin/dataMax" pushed the line into the stroke-clip:
    // spikes (outliers) sat flush with the top edge and got sliced. Pad
    // RELATIVE to the span so the padding scales — 0.5s meant nothing across
    // a 20-minute outlier scale and 0.5s over-padding crushed tight zooms.
    const span = max - min;
    if (span > 0) {
      min -= span * 0.02;
      max += span * 0.09;
    }
    if (max === min) {
      min -= 1;
      max += 1;
    }
    return [min, max];
  }, [rows, series, binary]);
  const yVal = useCallback(
    (v: number) => {
      const shown = binary != null ? (v >= binary ? 1 : 0) : v;
      return plotB - ((shown - yDomain[0]) / (yDomain[1] - yDomain[0])) * (plotB - plotT);
    },
    [binary, yDomain, plotB, plotT]
  );

  // ---- ticks -------------------------------------------------------------
  const yTickList = useMemo(() => {
    if (binary != null) return [0, 1];
    return niceTicks(yDomain[0], yDomain[1], 5);
  }, [binary, yDomain]);
  const xTickList = useMemo(() => {
    if (xTicks) return xTicks;
    return [];
  }, [xTicks]);

  // ---- hover / drag ------------------------------------------------------
  const rowAt = useCallback(
    (mouseX: number): number | null => {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < rows.length; i++) {
        const xv = Number(rows[i][xKey]);
        if (!Number.isFinite(xv)) continue;
        const d = Math.abs(px(xv) - mouseX);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best === -1 ? null : best;
    },
    [rows, xKey, px]
  );

  const mousePos = (e: ReactMouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDown = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!zoom || zoom.zoomDisabled) return;
    const { x } = mousePos(e);
    const idx = rowAt(x);
    if (idx == null) return;
    zoom.setRefArea({ left: Number(rows[idx][xKey]), right: zoom.refArea.right });
  };

  // Mousemove is batched to one React update per animation frame and
  // deduplicated when the hover cell didn't move — the raw version re-rendered
  // this SVG (and every sibling chart through the shared marker) on every
  // pixel, which is what made the cursor feel stuttery.
  const moveFrame = useRef<{ x: number; y: number } | null>(null);
  const hoverRaf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(hoverRaf.current), []);
  const handleMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    const { x, y } = mousePos(e);
    moveFrame.current = { x, y };
    if (hoverRaf.current) return;
    hoverRaf.current = requestAnimationFrame(() => {
      hoverRaf.current = 0;
      const pos = moveFrame.current;
      if (!pos) return;
      const idx = rowAt(pos.x);
      setHover((prev) =>
        prev && prev.idx === idx && Math.abs(prev.mx - pos.x) < 1.5 && Math.abs(prev.my - pos.y) < 1.5
          ? prev
          : idx == null
            ? null
            : { idx, mx: pos.x, my: pos.y }
      );
      if (idx == null) return;
      const val = Number(rows[idx][xKey]);
      if (onMarker) onMarker(val);
      if (zoom && !zoom.zoomDisabled && zoom.refArea.left !== "") {
        zoom.setRefArea({ left: zoom.refArea.left, right: val });
      }
    });
  };
  const handleUp = () => {
    if (zoom) zoom.zoom();
  };
  const handleLeave = () => {
    cancelAnimationFrame(hoverRaf.current);
    hoverRaf.current = 0;
    moveFrame.current = null;
    setHover(null);
  };

  // ---- tooltip -----------------------------------------------------------
  const tooltip = useMemo(() => {
    if (!hover) return null;
    const row = rows[hover.idx];
    if (!row) return null;
    const hovered = series.find((s) => s.key === row.dataKey);
    type Entry = { series: ChartSeries | null; row: ChartRow; value: number | undefined };
    let entries: Entry[];
    if (related) {
      entries = related(row).map((r) => ({
        row: r,
        series: series.find((s) => s.key === (r.dataKey as string)) ?? null,
        value: r[r.dataKey as string] as number | undefined,
      }));
    } else {
      entries = series
        .filter((s) => !s.omitFromTooltip)
        .map((s) => ({ series: s, row, value: Number(row[s.key]) }))
        .filter((e) => Number.isFinite(e.value));
    }
    // Colour match: their getRelatedPayloads rebuilds entries with the
    // driver's session-chart colour.
    if (ranked) entries = [...entries].sort((a, b) => Number(a.value) - Number(b.value));
    // Keep the card beside the cursor and only flip when it would cross the
    // right edge of the plot (the reference does the same at the edge).
    const flip = hover.mx + 300 > plotR;
    return {
      row,
      entries,
      left: flip ? undefined : Math.min(plotR - 130, hover.mx + 14),
      right: flip ? Math.max(10, W - hover.mx + 14) : undefined,
      top: Math.max(6, Math.min(plotB - 30, hover.my - 14)),
      hoveredSeries: hovered ?? null,
    };
  }, [hover, rows, series, related, plotL, plotR, plotB, mRight, W]);

  const xTickVals = useMemo(
    () => (yTickList.length && grid && !xTicks ? niceTicks(domain[0], domain[1], 5) : xTicks ?? []),
    [grid, domain, xTicks, yTickList.length]
  );

  // Line geometry is memoized on data/geometry only: hover and the shared
  // crosshair re-render this component every mousemove, and recomputing the
  // monotone cubics for every series on each frame was the jank source.
  const linePaths = useMemo(() => {
    const map = new Map<string, { line: string; area: string | null }>();
    for (const s of series) {
      const pts: [number, number][] = [];
      for (const row of rows) {
        const v = Number(row[s.key]);
        if (!Number.isFinite(v)) continue;
        pts.push([px(Number(row[xKey])), yVal(v)]);
      }
      const line =
        lineType === "monotone"
          ? monotonePath(pts)
          : lineType === "step"
            ? stepPath(pts)
            : linearPath(pts);
      let areaPath: string | null = null;
      if (area && pts.length > 1 && lineType !== "step") {
        areaPath = `${line} L${pts[pts.length - 1][0]},${plotB - 0.5} L${pts[0][0]},${plotB - 0.5} Z`;
      }
      map.set(s.key, { line, area: areaPath });
    }
    return map;
  }, [rows, series, lineType, area, px, yVal, plotB]);

  // Area gradient ids per series (only needed when `area` is on).
  const gradientIds = useMemo(
    () => (area ? series.map((s) => `${clipId}-${s.key.replace(/[^a-zA-Z0-9_-]/g, "")}`) : []),
    [area, series, clipId]
  );

  return (
    <div ref={boxRef} className={`relative w-full ${className}`}>
      <svg
        width={W}
        height={H}
        className={`block select-none ${zoom && !zoom.zoomDisabled ? "cursor-crosshair" : ""}`}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleLeave}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={plotL} y={plotT} width={Math.max(0, plotR - plotL)} height={Math.max(0, plotB - plotT)} />
          </clipPath>
          {area &&
            series.map((s, i) => (
              <linearGradient
                key={`ag-${s.key}`}
                id={gradientIds[i]}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
                gradientUnits="objectBoundingBox"
              >
                <stop offset="0%" stopColor={s.colour} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.colour} stopOpacity={0} />
              </linearGradient>
            ))}
        </defs>

        {/* hairline grid (session chart keeps its dotted rhythm, telemetry
            panels switch to F1TV's thin solid lines) */}
        {grid &&
          yTickList.map((v) => (
            <line
              key={`gy${v}`}
              x1={plotL}
              x2={plotR}
              y1={yVal(v)}
              y2={yVal(v)}
              stroke="rgba(255,255,255,0.09)"
              strokeDasharray={lineType === "step" ? "2 4" : "3 6"}
            />
          ))}
        {grid &&
          xTickVals.map((v) => (
            <line
              key={`gx${v}`}
              x1={px(v)}
              x2={px(v)}
              y1={plotT}
              y2={plotB}
              stroke="rgba(255,255,255,0.09)"
              strokeDasharray={lineType === "step" ? "2 4" : "3 6"}
            />
          ))}

        {/* hover crosshair: snaps to the nearest x column and glides between
            frames. Runs even when no external marker is wired in. */}
        {hover && rows[hover.idx] && !Number.isFinite(Number(markerX)) && (
          <g
            pointerEvents="none"
            style={{
              transform: `translateX(${px(Number(rows[hover.idx][xKey]))}px)`,
              transition: "transform 70ms linear",
              willChange: "transform",
            }}
          >
            <line
              x1={0}
              x2={0}
              y1={plotT}
              y2={plotB}
              stroke="rgba(255,255,255,0.34)"
              strokeWidth={1.2}
            />
          </g>
        )}

        {/* shared crosshair — a thin gliding group; CSS transform transitions
            it between mousemove frames instead of teleporting (F1TV cursor) */}
        {markerX != null && Number.isFinite(markerX) && (
          <g
            style={{
              transform: `translateX(${px(markerX)}px)`,
              transition: "transform 90ms linear",
              willChange: "transform",
            }}
          >
            <line
              x1={0}
              x2={0}
              y1={plotT}
              y2={plotB}
              stroke="rgba(255,255,255,0.38)"
              strokeWidth={1.25}
            />
            <circle r={2.5} cy={plotT} fill="#ffffff" opacity={0.85} />
          </g>
        )}

        {/* playback cursors per lap */}
        {cursors?.map((c) => (
          <line
            key={`cur-${c.lapKey}`}
            x1={px(c.distance)}
            x2={px(c.distance)}
            y1={plotT}
            y2={plotB}
            stroke={c.colour}
            strokeWidth={1.75}
          />
        ))}

        {/* sector lines S2 / S3 (labelled top, offset -10) */}
        {sectors?.map((x, i) =>
          Number.isFinite(x) && x > 0 ? (
            <g key={`sec${i}`}>
              <line x1={px(x)} x2={px(x)} y1={plotT} y2={plotB} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
              <text x={px(x)} y={plotT + 12} textAnchor="middle" fontSize="9" fontWeight={700} letterSpacing="1" fill="rgba(255,255,255,0.45)">
                {`S${i + 2}`}
              </text>
            </g>
          ) : null
        )}

        {/* corner marks (dashed 3 3, numbered bottom, offset -10) */}
        {corners?.map((c) =>
          Number.isFinite(c.x) ? (
            <g key={`cor${c.label}`}>
              <line
                x1={px(c.x)}
                x2={px(c.x)}
                y1={plotT}
                y2={plotB}
                stroke="rgba(255,255,255,0.13)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text x={px(c.x)} y={plotB - 6} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.32)">
                {c.label}
              </text>
            </g>
          ) : null
        )}

        {/* drag-zoom reference area (strokeOpacity .3) */}
        {zoom && zoom.refArea.left !== "" && zoom.refArea.right !== "" && (
          <rect
            x={Math.min(px(Number(zoom.refArea.left)), px(Number(zoom.refArea.right)))}
            y={plotT}
            width={Math.abs(px(Number(zoom.refArea.right)) - px(Number(zoom.refArea.left)))}
            height={plotB - plotT}
            fill="rgba(255,255,255,0.12)"
            stroke="rgba(255,255,255,0.3)"
          />
        )}

        {/* lines (drawn over all reference marks, like theirs) — paths come
            from the memoized geometry map; area fills go beneath */}
        <g clipPath={`url(#${clipId})`}>
          {series.map((s, i) => {
            const paths = linePaths.get(s.key);
            if (!paths) return null;
            return (
              <g key={`ln-${s.key}`}>
                {paths.area && (
                  <path d={paths.area} fill={`url(#${gradientIds[i]})`} stroke="none" />
                )}
                <path
                  d={paths.line}
                  pathLength={s.dashed ? undefined : 1}
                  className={s.dashed ? undefined : "f1-draw"}
                  fill="none"
                  stroke={s.colour}
                  strokeWidth={s.dashed ? 1.6 : 2}
                  strokeDasharray={s.dashed ? "5 4" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
        </g>

        {/* personal-best dots — the reference enlarges each driver's best lap */}
        {pbMarkers.length > 0 && (
          <g clipPath={`url(#${clipId})`} pointerEvents="none">
            {pbMarkers.map((m) => (
              <g key={`pb-${m.key}`}>
                <circle cx={px(m.x)} cy={yVal(m.y)} r={7.5} fill={m.colour} opacity={0.25} />
                <circle
                  cx={px(m.x)}
                  cy={yVal(m.y)}
                  r={5}
                  fill={m.colour}
                  stroke="#101017"
                  strokeWidth={1.5}
                />
              </g>
            ))}
          </g>
        )}

        {/* idle dots (the session chart's compound-coloured r=3 dots) */}
        {idleDots && (
          <g clipPath={`url(#${clipId})`}>
            {series.map((s) =>
              rows.map((row, i) => {
                const v = Number(row[s.key]);
                if (!Number.isFinite(v)) return null;
                if (hover && related) {
                  // recharts swaps the hovered row's idle dot for the active dot.
                  return null;
                }
                return (
                  <circle
                    key={`d-${s.key}-${i}`}
                    cx={px(Number(row[xKey]))}
                    cy={yVal(v)}
                    r={3}
                    fill={dotFill ? dotFill(row) : s.colour}
                    stroke={s.colour}
                    strokeWidth={1}
                  />
                );
              })
            )}
          </g>
        )}

        {/* active dot — F1TV cursor: white core, colour ring, soft halo */}
        {hover && tooltip && (tooltip.entries.length > 0 || tooltip.hoveredSeries) && (
          <g>
            {(related
              ? [tooltip.hoveredSeries]
              : series.filter((s) => !s.omitFromTooltip)
            )
              .filter((s): s is ChartSeries => !!s)
              .map((s) => {
                const row = related ? (tooltip.hoveredSeries?.key === s.key ? rows[hover.idx] : null) : rows[hover.idx];
                if (!row) return null;
                const v = Number(row[s.key] ?? (related ? row[row.dataKey as string] : NaN));
                if (!Number.isFinite(v)) return null;
                return (
                  <g
                    key={`ad-${s.key}`}
                    className={onDotPick ? "cursor-pointer pointer-events-auto" : "pointer-events-none"}
                    onMouseDown={(e) => {
                      if (!onDotPick) return;
                      e.stopPropagation();
                      onDotPick(s.key, related ? rows[hover.idx] : rows[hover.idx]);
                    }}
                  >
                    <circle cx={px(Number(row[xKey]))} cy={yVal(v)} r={11} fill={s.colour} opacity={0.16} />
                    <circle
                      cx={px(Number(row[xKey]))}
                      cy={yVal(v)}
                      r={5.5}
                      fill="#ffffff"
                      stroke={s.colour}
                      strokeWidth={2.5}
                    />
                  </g>
                );
              })}
          </g>
        )}

        {/* axes */}
        <line x1={plotL} x2={plotR} y1={plotB} y2={plotB} stroke="rgba(255,255,255,0.3)" />
        <line x1={plotL} x2={plotL} y1={plotT} y2={plotB} stroke="rgba(255,255,255,0.3)" />
        {/* y ticks (hidden on mobile like theirs) */}
        {!mobile &&
          yTickList.map((v) => (
            <text
              key={`yt${v}`}
              x={plotL - 6}
              y={yVal(v) + 3}
              textAnchor="end"
              fontSize="9.5"
              fill="rgba(255,255,255,0.55)"
              className="tabular-nums select-none"
            >
              {tickFmtY
                ? tickFmtY(v)
                : binary != null
                  ? v >= 1
                    ? "ON"
                    : "OFF"
                  : String(Number(v.toPrecision(6)))}
            </text>
          ))}
        {/* x ticks (the session chart only) */}
        {xTickList.map((v) => (
          <text
            key={`xt${v}`}
            x={px(v)}
            y={plotB + 18}
            textAnchor="middle"
            fontSize="9.5"
            fill="rgba(255,255,255,0.55)"
            className="tabular-nums select-none"
          >
            {tickFmtX ? tickFmtX(v) : String(v)}
          </text>
        ))}
        {/* F1TV channel label — small caps, top-left of the plot */}
        <text
          x={plotL + 8}
          y={plotT + 13}
          fontSize="9"
          fontWeight={700}
          letterSpacing="1.6"
          fill="rgba(255,255,255,0.42)"
          className="select-none"
        >
          {yLabel.toUpperCase()}
        </text>
      </svg>

      {/* top legend chips — F1TV: small round swatches, tight labels */}
      {legend && (
        <div className="pointer-events-none absolute inset-x-2 top-1.5 z-10 flex justify-center gap-3.5">
          {series.map((s) => (
            <span key={`lg-${s.key}`} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/70">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.colour }} aria-hidden="true" />
              {s.label ?? s.key}
            </span>
          ))}
        </div>
      )}

      {/* shadcn-style tooltip — modern card, gliding between anchor frames */}
      {tooltip && (tooltipTitle || tooltip.entries.length > 0) && (
        <div
          className="pointer-events-none absolute z-20 max-w-[17rem] min-w-[9.5rem] rounded-lg border border-white/10 bg-[#15151e]/95 px-3 py-2 text-[11px] shadow-[0_10px_28px_rgba(0,0,0,0.65)] backdrop-blur-sm transition-[left,top] duration-100 ease-out"
          style={{
            left: tooltip.left,
            right: tooltip.right,
            top: tooltip.top,
          }}
        >
          {tooltipTitle && (
            <div key="t" className="font-medium text-white/90">{tooltipTitle(tooltip.row)}</div>
          )}
          <div className="mt-1.5 flex flex-col gap-1.5">
            {tooltip.entries.map((e, i) => (
              <div key={`e${i}`} className="flex items-center gap-2 leading-none">
                {ranked && (
                  <span className="w-3 shrink-0 text-right font-f1 tabular-nums text-[10px] text-white/45">
                    {i + 1}
                  </span>
                )}
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: e.series?.colour ?? "#ffffff" }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-white/70">
                  {e.series?.label ??
                    e.series?.key ??
                    (typeof e.row.dataKey === "string" ? e.row.dataKey : "")}
                </span>
                <span className="ml-auto font-f1 tabular-nums font-medium tabular-nums text-white">
                  {Number.isFinite(e.value as number)
                    ? valueFmt
                      ? valueFmt(e.value as number, e.series?.key ?? "")
                      : String(e.value)
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
