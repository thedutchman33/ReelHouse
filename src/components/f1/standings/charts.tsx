"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

// ---------------------------------------------------------------------------
// Championship chart primitives, rebuilt against the reference's geometry.
//
// The reference draws plain SVG in a 640x340 (or 640x433) viewBox: 1.8px
// series lines, 1.8px dots, #334155 gridlines at 50%, 9px/700 #94a3b8 ticks,
// a 16x11 round marker under every point, a #94a3b8/50% crosshair on hover and
// a fixed 232px tooltip listing every driver at the hovered round. All of that
// is reproduced here so the standings charts keep the same reading rhythm,
// while the colours and type come from ReelHouse's F1 identity.
// ---------------------------------------------------------------------------

export interface LineSeries {
  id: string;
  label: string;
  /** Full driver/team name for tooltips; falls back to the label. */
  name?: string;
  colour: string;
  values: (number | null)[];
}

export interface RoundAxisEntry {
  round: number;
  country: string;
  name: string;
}

const AXIS = "#94a3b8";
const GRID = "#334155";

/** Touch pointers cease to exist on lift, which fires pointerleave. That must
 *  not clear a tooltip the reader just tapped open, so dismissing is pinned to
 *  a pointerdown outside the chart (or Escape) — same rule as the line charts. */
export function useChartDismiss(ref: RefObject<SVGSVGElement | null>, clear: () => void) {
  const clearRef = useRef(clear);
  clearRef.current = clear;
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) clearRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearRef.current();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref]);
}

// Country names arrive from Jolpica; the axis uses the same three-letter chips
// as the rest of the dashboard instead of the reference's flag images.
const COUNTRY_CODES: Record<string, string> = {
  australia: "AUS",
  china: "CHN",
  japan: "JPN",
  "united states": "USA",
  usa: "USA",
  canada: "CAN",
  monaco: "MON",
  spain: "ESP",
  austria: "AUT",
  "united kingdom": "GBR",
  uk: "GBR",
  belgium: "BEL",
  hungary: "HUN",
  netherlands: "NED",
  italy: "ITA",
  azerbaijan: "AZE",
  bahrain: "BHR",
  singapore: "SGP",
  mexico: "MEX",
  brazil: "BRA",
  qatar: "QAT",
  "united arab emirates": "UAE",
  "saudi arabia": "SAU",
  france: "FRA",
  germany: "GER",
  portugal: "POR",
  turkey: "TUR",
  russia: "RUS",
  malaysia: "MAS",
  "south korea": "KOR",
  india: "IND",
  "south africa": "RSA",
  argentina: "ARG",
  "san marino": "SMR",
  luxembourg: "LUX",
  sweden: "SWE",
  switzerland: "SUI",
  finland: "FIN",
  denmark: "DEN",
  morocco: "MAR",
  vietnam: "VIE",
  netherlands2: "",
};

export function countryCode(country: string): string {
  return COUNTRY_CODES[country.trim().toLowerCase()] ?? country.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

export function ordinal(value: number): string {
  const n = Math.round(value);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function niceScale(max: number, count = 5): { top: number; ticks: number[] } {
  const safe = Number.isFinite(max) && max > 0 ? max : 1;
  const step = niceStep(safe / count);
  const top = Math.ceil(safe / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { top, ticks };
}

/** Floating tooltip anchored to the hovered round, portalled to <body> so a
 *  backdrop-filter ancestor can never trap its fixed position. */
export function ChartTooltip({
  anchorX,
  anchorY,
  width,
  children,
}: {
  anchorX: number;
  anchorY: number;
  width: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    setHeight(ref.current?.offsetHeight ?? 0);
  }, [children]);
  if (typeof document === "undefined") return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchorX + 20;
  if (left + width + 8 > vw) left = anchorX - width - 20;
  left = Math.max(8, Math.min(left, vw - width - 8));
  const top = Math.max(8, Math.min(anchorY, vh - (height || 260) - 8));
  return createPortal(
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed z-[100] rounded-lg border border-white/10 bg-[#0f1117]/95 text-xs shadow-[0_20px_40px_rgb(0_0_0/0.55)] backdrop-blur-sm"
      style={{ width, left, top }}
    >
      {children}
    </div>,
    document.body
  );
}

export function TooltipHeader({
  country,
  round,
  fallback,
}: {
  country?: string;
  round?: number;
  fallback?: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
      {country ? (
        <span
          aria-hidden="true"
          className="grid h-3.5 w-5 shrink-0 place-items-center rounded-[2px] bg-white/[0.09] text-[6.5px] font-bold tracking-[0.02em] text-white/65"
        >
          {countryCode(country)}
        </span>
      ) : (
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e10600]" />
      )}
      <span className="truncate text-[13px] font-bold leading-none text-white">{country ?? fallback ?? "Championship"}</span>
      {round != null && (
        <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-white/40">R{round}</span>
      )}
    </div>
  );
}

/** The 16x11 round marker the reference draws with country flags. */
function RoundAxis({
  rounds,
  x,
  y,
}: {
  rounds: RoundAxisEntry[];
  x: (i: number) => number;
  y: number;
}) {
  return (
    <g aria-hidden="true">
      {rounds.map((r, i) => (
        <g key={`${r.round}-${i}`}>
          <rect x={x(i) - 8} y={y} width={16} height={11} rx={2} fill="#1e2532" stroke="#334155" strokeWidth={0.5} />
          <text
            x={x(i)}
            y={y + 8}
            textAnchor="middle"
            fontSize={6.2}
            fontWeight={700}
            fill="#94a3b8"
            letterSpacing="0.02em"
          >
            {countryCode(r.country)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Multi-series evolution chart. Points mode = cumulative points with a
 *  round-wide tooltip; rank mode = smoothed championship positions with one
 *  point tooltip, right-hand labels and 7px invisible hit targets. */
export function StandingsLineChart({
  series,
  height: _height,
  invert = false,
  endLabels = false,
  endLabelFormat,
  ariaLabel,
  valueFormat = (v: number) => String(v),
  emptyLabel = "No championship data yet.",
  rounds = [],
  tooltipTitle,
}: {
  series: LineSeries[];
  /** Legacy prop kept for call sites; the viewBox drives the rendered size. */
  height?: number;
  /** True for championship positions: 1 sits at the top. */
  invert?: boolean;
  /** Pin the acronym at the end of each line (ranking chart). */
  endLabels?: boolean;
  /** Override pinned label text, e.g. full constructor names. */
  endLabelFormat?: (series: LineSeries) => string;
  ariaLabel: string;
  valueFormat?: (v: number) => string;
  emptyLabel?: string;
  /** Round metadata for the axis chips and tooltip headers. */
  rounds?: RoundAxisEntry[];
  tooltipTitle?: string;
}) {
  const [hover, setHover] = useState<{ index: number; left: number; top: number } | null>(null);
  /** Ranking mode: the line under the pointer, highlighted against the field. */
  const [focus, setFocus] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // A tap anywhere else (or Escape) dismisses a pinned touch tooltip, so the
  // charts stay usable without a hover-capable pointer.
  useEffect(() => {
    const dismiss = (e: PointerEvent) => {
      if (svgRef.current && e.target instanceof Node && !svgRef.current.contains(e.target)) {
        setHover(null);
        setFocus(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHover(null);
        setFocus(null);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const n = Math.max(0, ...series.map((s) => s.values.length));
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null && Number.isFinite(v));

  const endLabel = (s: LineSeries) => (endLabelFormat ? endLabelFormat(s) : s.label.slice(0, 4).toUpperCase());
  // Room for the pinned labels: full constructor names are much wider than the
  // three-letter driver codes, so the plot's right margin grows to fit them.
  const labelPad = endLabels
    ? Math.min(128, Math.max(36, Math.max(0, ...series.map((s) => endLabel(s).length)) * 4.5 + 12))
    : 36;

  const geom = useMemo(() => {
    const W = 640;
    if (!n || !all.length) return null;
    if (invert) {
      const maxRank = Math.max(1, Math.round(Math.max(...all)));
      const padT = 20.5;
      const rowH = 17;
      const plotBottom = padT + (maxRank - 1) * rowH;
      const H = plotBottom + 36.5;
      const padL = 26;
      const padR = labelPad;
      const x = (i: number) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
      const y = (v: number) => padT + (Math.max(1, Math.round(v)) - 1) * rowH;
      return { W, H, padL, padR, padT, padB: H - plotBottom, x, y, maxRank, rowH, max: maxRank };
    }
    const H = 340;
    const padL = 40;
    const padR = 12;
    const padT = 12;
    const padB = 30;
    const { top, ticks } = niceScale(Math.max(...all));
    const x = (i: number) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
    const y = (v: number) => H - padB - (Math.max(0, v) / top) * (H - padT - padB);
    return { W, H, padL, padR, padT, padB, x, y, ticks, max: top };
  }, [all, invert, labelPad, n]);

  if (!geom) {
    return <p className="py-12 text-center text-[12px] text-white/45">{emptyLabel}</p>;
  }

  const { W, H, padL, padR, padT, padB, x, y } = geom;
  const plotW = W - padL - padR;
  const roundsForN = rounds.length === n ? rounds : [];
  const xStep = n > 1 ? plotW / (n - 1) : 0;

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    if (vx < padL - 10 || vx > W - padR + 10) {
      setHover(null);
      setFocus(null);
      return;
    }
    const raw = (vx - padL) / Math.max(1, xStep);
    const index = Math.max(0, Math.min(n - 1, Math.round(raw)));
    if (invert) {
      // The reference's ranking chart has no crosshair: the line under the
      // pointer lifts out of the field and everything else fades back.
      const vy = ((e.clientY - box.top) / box.height) * H;
      let best: { id: string; dist: number } | null = null;
      for (const s of series) {
        const v = s.values[index];
        if (v == null || !Number.isFinite(v)) continue;
        const dist = Math.abs(y(v) - vy);
        if (dist > 30) continue;
        if (!best || dist < best.dist) best = { id: s.id, dist };
      }
      setFocus(best?.id ?? null);
      setHover({ index, left: e.clientX, top: e.clientY });
      return;
    }
    setHover({ index, left: box.left + x(index) * (box.width / W), top: box.top });
  };

  const focusSeries = focus ? series.find((s) => s.id === focus) ?? null : null;

  const hoveredValues = hover && !invert
    ? series
        .map((s) => ({ s, value: s.values[hover.index] }))
        .filter((row): row is { s: LineSeries; value: number } => row.value != null)
        .sort((a, b) => b.value - a.value)
    : [];

  const hoveredRound = hover ? roundsForN[hover.index] : undefined;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full touch-pan-y select-none cursor-crosshair"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={(e) => {
          // A touch pointer leaves when the finger lifts; keep its tooltip up
          // until the reader taps elsewhere.
          if (e.pointerType === "touch") return;
          setHover(null);
          setFocus(null);
        }}
      >
        {!invert &&
          (geom.ticks ?? []).map((t) => (
            <g key={`t${t}`}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeOpacity={0.5} />
              <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fontWeight={700} fill={AXIS}>
                {Math.round(t)}
              </text>
            </g>
          ))}

        {invert &&
          Array.from({ length: geom.maxRank ?? 0 }, (_, i) => i + 1).map((rank) => (
            <text key={rank} x={14} y={y(rank) + 3} textAnchor="end" fontSize={9} fontWeight={700} fill={AXIS}>
              {rank}
            </text>
          ))}

        {roundsForN.length > 0 && (
          <RoundAxis rounds={roundsForN} x={x} y={H - 20} />
        )}

        {hover && !invert && (
          // The crosshair is a translated group, so CSS eases the move and the
          // cursor sweeps between rounds instead of jumping a whole round.
          <g
            pointerEvents="none"
            style={{ transform: `translateX(${x(hover.index)}px)`, transition: "transform 90ms linear" }}
          >
            <line x1={0} x2={0} y1={padT} y2={H - padB} stroke={AXIS} strokeOpacity={0.5} />
          </g>
        )}

        {series.map((s, seriesIndex) => {
          const pts = s.values.map((v, i) => (v == null || !Number.isFinite(v) ? null : { i, v }));
          const valid = pts.filter((p): p is { i: number; v: number } => p != null);
          if (!valid.length) return null;

          if (invert) {
            const d = valid
              .map((p, idx) => {
                if (idx === 0) return `M ${x(p.i)} ${y(p.v)}`;
                const px = x(valid[idx - 1].i);
                const py = y(valid[idx - 1].v);
                const cx = (px + x(p.i)) / 2;
                return `C ${cx} ${py}, ${cx} ${y(p.v)}, ${x(p.i)} ${y(p.v)}`;
              })
              .join(" ");
            const last = valid[valid.length - 1];
            const isFocus = focus === s.id;
            const dimmed = focus != null && !isFocus;
            return (
              <g key={s.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={s.colour}
                  strokeWidth={isFocus ? 2.6 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  opacity={dimmed ? 0.18 : 1}
                  className="f1-draw transition-[opacity] duration-150"
                  style={{ animationDelay: `${Math.min(700, seriesIndex * 90)}ms` }}
                  pointerEvents="none"
                />
                {valid.map((p, idx) => (
                  <circle
                    key={`dot-${idx}`}
                    cx={x(p.i)}
                    cy={y(p.v)}
                    r={isFocus && hover?.index === p.i ? 4 : hover?.index === p.i ? 3.2 : 1.8}
                    fill={s.colour}
                    opacity={dimmed ? 0.18 : 1}
                    pointerEvents="none"
                  />
                ))}
                {endLabels && (
                  <text
                    x={W - padR + 5}
                    y={y(last.v) + 3}
                    fontSize={7.6}
                    fontWeight={700}
                    fill={s.colour}
                    opacity={dimmed ? 0.3 : 1}
                  >
                    {endLabel(s)}
                  </text>
                )}
              </g>
            );
          }

          const d = valid
            .map((p, idx) => `${idx === 0 ? "M" : "L"} ${x(p.i)} ${y(p.v)}`)
            .join(" ");
          return (
            <g key={s.id}>
              <path
                d={d}
                fill="none"
                stroke={s.colour}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={1}
                className="f1-draw"
                style={{ animationDelay: `${Math.min(700, seriesIndex * 90)}ms` }}
              />
              {valid.map((p) => (
                <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={hover?.index === p.i ? 3.6 : 1.8} fill={s.colour} />
              ))}
            </g>
          );
        })}
      </svg>

      {!invert && hover && hoveredValues.length > 0 && (
        <ChartTooltip anchorX={hover.left} anchorY={hover.top} width={232}>
          <TooltipHeader
            country={hoveredRound?.country}
            round={hoveredRound?.round ?? hover.index + 1}
            fallback={tooltipTitle}
          />
          <ul className="flex max-h-[calc(100vh-9rem)] flex-col gap-1 overflow-hidden px-3 py-2">
            {hoveredValues.map((row, i) => (
              <li key={row.s.id} className="flex items-center gap-2 leading-4">
                <span className="w-4 shrink-0 text-right text-[11px] tabular-nums" style={{ color: row.s.colour }}>
                  {i + 1}
                </span>
                <span className="truncate text-[12px] font-bold" style={{ color: row.s.colour }}>
                  {row.s.name ?? row.s.label}
                </span>
                <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums" style={{ color: row.s.colour }}>
                  {valueFormat(row.value)}
                </span>
              </li>
            ))}
          </ul>
        </ChartTooltip>
      )}

      {invert && hover && focusSeries && (
        <ChartTooltip anchorX={hover.left} anchorY={hover.top} width={196}>
          <TooltipHeader
            country={hoveredRound?.country}
            round={hoveredRound?.round ?? hover.index + 1}
            fallback={tooltipTitle}
          />
          <div className="flex items-center gap-2 px-3 py-2">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: focusSeries.colour }}
            />
            <span className="truncate text-[12px] font-semibold text-white">
              {focusSeries.name ?? focusSeries.label}
            </span>
            <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums text-white">
              {ordinal(focusSeries.values[hover.index] ?? 0)} pos.
            </span>
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

// ---------------------------- season stat bars -----------------------------

export interface StatRow {
  id: string;
  label: string;
  colour: string;
  wins: number;
  podiums: number;
  pointsFinishes: number;
  poles: number;
  dnfs: number;
}

const STAT_SERIES = [
  { key: "wins", label: "Wins", colour: "#facc15" },
  { key: "podiums", label: "Podiums", colour: "#3b82f6" },
  { key: "pointsFinishes", label: "Finishes in points", colour: "#d1d5db" },
  { key: "poles", label: "Pole positions", colour: "#c026d3" },
  { key: "dnfs", label: "DNF/DNS/DSQ", colour: "#ef4444" },
] as const;

export function SeasonStatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-white/45">
      {STAT_SERIES.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1">
          <i className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: s.colour }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Grouped season-stat columns: four counts above zero and DNFs below it,
 *  matching the reference's diverging strip. */
export function SeasonStatBars({ rows, ariaLabel }: { rows: StatRow[]; ariaLabel: string }) {
  const [tip, setTip] = useState<{ row: StatRow; left: number; top: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const shown = rows;
  const W = 640;
  const H = 340;
  const padL = 34;
  const padR = 12;
  const padT = 18;
  const padB = 30;
  const upMax = Math.max(4, Math.ceil(Math.max(1, ...shown.map((r) => Math.max(r.wins, r.podiums, r.pointsFinishes, r.poles))) / 4) * 4);
  const downMax = Math.max(4, Math.ceil(Math.max(1, ...shown.map((r) => r.dnfs)) / 4) * 4);
  const zero = padT + (upMax / (upMax + downMax)) * (H - padT - padB);
  const upH = zero - padT;
  const downH = H - padB - zero;
  const slot = shown.length ? (W - padL - padR) / shown.length : 26;
  const bar = Math.min(6, Math.max(3, slot / 5));
  const yUp = (v: number) => zero - (v / upMax) * upH;
  const yDown = (v: number) => zero + (v / downMax) * downH;
  const ticks: number[] = [];
  for (let v = -downMax; v <= upMax + 1e-9; v += 4) ticks.push(v);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full touch-pan-y select-none"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={W - padR}
              y1={v >= 0 ? yUp(v) : yDown(-v)}
              y2={v >= 0 ? yUp(v) : yDown(-v)}
              stroke={GRID}
              strokeOpacity={v === 0 ? 0.9 : 0.4}
            />
            <text x={padL - 6} y={(v >= 0 ? yUp(v) : yDown(-v)) + 3} textAnchor="end" fontSize={9} fontWeight={700} fill={AXIS}>
              {v}
            </text>
          </g>
        ))}

        {shown.map((r, i) => {
          const cx = padL + slot * i + slot / 2;
          const start = cx - (4 * (bar + 1.2)) / 2;
          return (
            <g
              key={r.id}
              onPointerEnter={(e) => {
                const box = svgRef.current?.getBoundingClientRect();
                const cell = e.currentTarget.getBoundingClientRect();
                if (box) setTip({ row: r, left: cell.left + cell.width / 2, top: box.top });
              }}
              onPointerDown={(e) => {
                const box = svgRef.current?.getBoundingClientRect();
                const cell = e.currentTarget.getBoundingClientRect();
                if (box) setTip({ row: r, left: cell.left + cell.width / 2, top: box.top });
              }}
              onPointerLeave={() => setTip(null)}
            >
              {STAT_SERIES.slice(0, 4).map((s, si) => {
                const v = r[s.key as "wins" | "podiums" | "pointsFinishes" | "poles"];
                if (!v) return null;
                return (
                  <rect
                    key={s.key}
                    x={start + si * (bar + 1.2)}
                    y={yUp(v)}
                    width={bar}
                    height={Math.max(1, zero - yUp(v))}
                    fill={s.colour}
                  />
                );
              })}
              {r.dnfs > 0 && (
                <rect x={start} y={zero} width={bar} height={Math.max(1, yDown(r.dnfs) - zero)} fill="#ef4444" />
              )}
              <rect x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              <text x={cx} y={H - 13} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={AXIS}>
                {r.label.slice(0, 3).toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      {tip && (
        <ChartTooltip anchorX={tip.left} anchorY={tip.top} width={184}>
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: tip.row.colour }} />
            <span className="truncate text-[12px] font-bold text-white">{tip.row.label}</span>
          </div>
          <ul className="flex flex-col gap-1 px-3 py-2">
            {STAT_SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-2 leading-4">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: s.colour }} />
                <span className="text-[11px] text-white/55">{s.label}</span>
                <span className="ml-auto text-[11px] font-bold tabular-nums text-white">
                  {tip.row[s.key as keyof StatRow] as number}
                </span>
              </li>
            ))}
          </ul>
        </ChartTooltip>
      )}
    </div>
  );
}

// ----------------------------- points by race -------------------------------

/** Points scored by every entrant in each round: one row per Grand Prix, one
 *  segment per scorer, ordered by points, with the round total on the right. */
export function RacePointsChart({
  rounds,
  entries,
  points,
  ariaLabel,
}: {
  rounds: RoundAxisEntry[];
  entries: { id: string; label: string; name?: string; colour: string }[];
  /** points[driverId][roundIndex] */
  points: Record<string, number[]>;
  ariaLabel: string;
}) {
  const rows = rounds.map((r, ri) => {
    const scored = entries
      .map((e) => ({ e, pts: points[e.id]?.[ri] ?? 0 }))
      .filter((x) => x.pts > 0)
      .sort((a, b) => b.pts - a.pts);
    return { round: r, scored, total: scored.reduce((a, b) => a + b.pts, 0) };
  });
  const rowsWithPoints = rows.filter((r) => r.total > 0);
  const [tip, setTip] = useState<{
    round: RoundAxisEntry;
    entry: { id: string; label: string; name?: string; colour: string };
    pts: number;
    left: number;
    top: number;
  } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useChartDismiss(svgRef, () => {
    setTip(null);
    setActive(null);
  });
  if (!rowsWithPoints.length) {
    return <p className="py-12 text-center text-[12px] text-white/45">No points have been scored yet.</p>;
  }

  const W = 640;
  const rowH = 22;
  const barH = 18;
  const padL = 34;
  const padR = 36;
  const top = 8;
  const axisH = 26;
  const H = top + rowsWithPoints.length * rowH + axisH;
  const maxTotal = Math.max(20, ...rowsWithPoints.map((r) => r.total));
  const step = maxTotal > 120 ? 20 : maxTotal > 60 ? 20 : 10;
  const topScale = Math.ceil(maxTotal / step) * step;
  const plotW = W - padL - padR;
  const x = (v: number) => padL + (v / topScale) * plotW;
  const ticks: number[] = [];
  for (let v = 0; v <= topScale + 1e-9; v += step) ticks.push(v);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full select-none"
        onPointerLeave={(e) => {
          if (e.pointerType === "touch") return;
          setTip(null);
          setActive(null);
        }}
      >
        <g aria-hidden="true">
          {rowsWithPoints.map((r, i) => {
            const y = top + i * rowH;
            return (
              <g key={`label-${r.round.round}`}>
                <rect x={2} y={y + 3} width={16} height={11} rx={2} fill="#1e2532" stroke="#334155" strokeWidth={0.5} />
                <text x={10} y={y + 11} textAnchor="middle" fontSize={6.2} fontWeight={700} fill="#94a3b8">
                  {countryCode(r.round.country)}
                </text>
                <text x={W - 4} y={y + 14} textAnchor="end" fontSize={9.5} fontWeight={800} fill="#e2e8f0">
                  {r.total}
                </text>
              </g>
            );
          })}
        </g>

        {rowsWithPoints.map((r, i) => {
          const y = top + i * rowH;
          let cursor = padL;
          const rowActive = active?.startsWith(`${r.round.round}:`) ?? false;
          return (
            <g key={`bar-${r.round.round}`}>
              <rect
                x={padL - 3}
                y={y - 2}
                width={W - padL - padR + 6}
                height={rowH - 2}
                fill="#ffffff"
                opacity={rowActive ? 0.05 : 0}
                className="transition-opacity duration-150"
                pointerEvents="none"
              />
              {r.scored.map(({ e, pts }, si) => {
                const w = (pts / topScale) * plotW;
                const key = `${r.round.round}:${e.id}`;
                const isActive = active === key;
                const rect = (
                  <rect
                    key={e.id}
                    x={cursor}
                    y={y}
                    width={Math.max(0.5, w)}
                    height={barH}
                    fill={`#${e.colour}`}
                    stroke={isActive ? "#ffffff" : "#0f172a"}
                    strokeOpacity={isActive ? 0.85 : 1}
                    strokeWidth={isActive ? 1.2 : 0.6}
                    opacity={active && !isActive ? 0.55 : 1}
                    className="f1-grow cursor-pointer transition-opacity duration-150"
                    style={{ animationDelay: `${Math.min(520, i * 20 + si * 6)}ms` }}
                    onPointerEnter={(ev) => {
                      const box = ev.currentTarget.getBoundingClientRect();
                      setActive(key);
                      setTip({ round: r.round, entry: e, pts, left: box.right, top: box.top });
                    }}
                    onPointerDown={(ev) => {
                      const box = ev.currentTarget.getBoundingClientRect();
                      setActive(key);
                      setTip({ round: r.round, entry: e, pts, left: box.right, top: box.top });
                    }}
                  >
                    <title>{`${r.round.name} · ${e.name ?? e.label}: ${pts} pts`}</title>
                  </rect>
                );
                cursor += w;
                return rect;
              })}
            </g>
          );
        })}

        {ticks.map((t) => (
          <g key={`x${t}`}>
            <line x1={x(t)} x2={x(t)} y1={top} y2={top + rowsWithPoints.length * rowH} stroke={GRID} strokeOpacity={0.18} />
            <text x={x(t)} y={H - 10} textAnchor="middle" fontSize={9} fontWeight={700} fill={AXIS}>
              {t}
            </text>
          </g>
        ))}
      </svg>

      {tip && (
        <ChartTooltip anchorX={tip.left} anchorY={tip.top} width={208}>
          <TooltipHeader country={tip.round.country} round={tip.round.round} fallback={tip.round.name} />
          <div className="flex items-center gap-2 px-3 py-2">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: `#${tip.entry.colour}` }}
            />
            <span className="truncate text-[12px] font-semibold text-white">
              {tip.entry.name ?? tip.entry.label}
            </span>
            <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums text-white">{tip.pts} pts</span>
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

// ------------------------ finish distribution / flow -----------------------

export function FinishDistribution({ counts, colour }: { counts: number[]; colour: string }) {
  const max = Math.max(1, ...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const H = 150;
  const W = 420;
  const [tip, setTip] = useState<{ pos: number; count: number; left: number; top: number } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useChartDismiss(svgRef, () => {
    setTip(null);
    setActive(null);
  });
  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Race finishes by position"
        className="h-auto w-full select-none"
        onPointerLeave={(e) => {
          if (e.pointerType === "touch") return;
          setTip(null);
          setActive(null);
        }}
      >
        <line x1={8} x2={W - 8} y1={H - 22} y2={H - 22} stroke={AXIS} strokeOpacity={0.4} />
        {counts.map((c, i) => {
          const h = (c / max) * (H - 44);
          const isActive = active === i;
          return (
            <g key={i}>
              <rect
                x={8 + i * 18}
                y={H - 22 - h}
                width={12}
                height={Math.max(c ? 1 : 0, h)}
                rx={1}
                fill={colour}
                opacity={c ? (active && !isActive ? 0.45 : 0.95) : 0.15}
                stroke={isActive ? "#ffffff" : "none"}
                strokeWidth={0.8}
                strokeOpacity={0.7}
                className={c ? "f1-grow transition-opacity duration-150" : undefined}
                style={c ? { animationDelay: `${Math.min(500, i * 22)}ms` } : undefined}
              />
              {c > 0 && (
                <text x={14 + i * 18} y={H - 26 - h} textAnchor="middle" fontSize={7} fill="#fff" opacity={0.8}>
                  {c}
                </text>
              )}
              <text x={14 + i * 18} y={H - 9} textAnchor="middle" fontSize={7} fill={isActive ? "#e2e8f0" : AXIS}>
                {i + 1}
              </text>
              {/* Full-slot hit area: the bars are only 12px wide, so a two-pixel
                  bar would be impossible to hover on a phone. */}
              <rect
                x={8 + i * 18 - 3}
                y={12}
                width={18}
                height={H - 26}
                fill="transparent"
                className="cursor-pointer"
                onPointerEnter={(ev) => {
                  const box = ev.currentTarget.getBoundingClientRect();
                  setActive(i);
                  setTip({ pos: i + 1, count: c, left: box.left + box.width / 2, top: box.top });
                }}
                onPointerDown={(ev) => {
                  const box = ev.currentTarget.getBoundingClientRect();
                  setActive(i);
                  setTip({ pos: i + 1, count: c, left: box.left + box.width / 2, top: box.top });
                }}
              />
            </g>
          );
        })}
        <text x={8} y={10} fontSize={8} fill={AXIS}>P1</text>
        <text x={W - 8} y={10} fontSize={8} fill={AXIS} textAnchor="end">P{counts.length || 20}</text>
      </svg>

      {tip && (
        <ChartTooltip anchorX={tip.left} anchorY={tip.top} width={188}>
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e10600]" />
            <span className="text-[13px] font-bold leading-none text-white">Finish P{tip.pos}</span>
            <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-white/40">
              {total ? `${Math.round((tip.count / total) * 100)}%` : "0%"}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: colour }} />
            <span className="text-[12px] text-white/65">
              {tip.count} {tip.count === 1 ? "finish" : "finishes"}
            </span>
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

/** Grid → finish Sankey: a node per position on each side and one ribbon per
 *  grid→finish pairing, thickness = races run. Hovering a ribbon lifts it out
 *  of the field and names the move, the reference's reading of this chart. */
function flowLayout(entries: { pos: number; count: number }[], avail: number, gap: number) {
  const merged = new Map<number, number>();
  for (const e of entries) merged.set(e.pos, (merged.get(e.pos) ?? 0) + e.count);
  const list = [...merged.entries()]
    .map(([pos, count]) => ({ pos, count }))
    .sort((a, b) => a.pos - b.pos);
  const total = list.reduce((a, b) => a + b.count, 0) || 1;
  const scale = (avail - gap * Math.max(0, list.length - 1)) / total;
  let y = 0;
  const nodes = list.map((n) => {
    const h = Math.max(3, n.count * scale);
    const node = { ...n, y, h };
    y += h + gap;
    return node;
  });
  return { nodes, scale };
}

/** Grid bands: pole gold, front row silver, podium orange, points blue, the
 *  rest cyan/grey — the bands the reference paints its ribbons with. */
function gridBandColour(pos: number) {
  if (pos === 1) return "#f2c94c";
  if (pos === 2) return "#cbd5e1";
  if (pos === 3) return "#f97316";
  if (pos <= 6) return "#3b82f6";
  if (pos <= 10) return "#22d3ee";
  return "#8a93a6";
}

export function StartFinishFlow({
  rows,
  ariaLabel,
  name,
  rounds = [],
}: {
  rows: { round: number; grid: number; finish: number }[];
  ariaLabel: string;
  /** Shown as the hover card's title, like the reference's driver heading. */
  name?: string;
  /** Round metadata so each ribbon can name the Grand Prix. */
  rounds?: RoundAxisEntry[];
}) {
  const [tip, setTip] = useState<{
    grid: number;
    finish: number;
    count: number;
    label: string;
    left: number;
    top: number;
  } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useChartDismiss(svgRef, () => {
    setTip(null);
    setActive(null);
  });

  const W = 640;
  const H = 340;
  const padT = 18;
  const padB = 22;
  const nodeW = 11;
  const leftX = 72;
  const rightX = W - 72 - nodeW;
  const gap = 8;

  const flows = useMemo(() => {
    const map = new Map<string, { grid: number; finish: number; count: number; rounds: number[] }>();
    for (const r of rows) {
      const key = `${r.grid}-${r.finish}`;
      const hit = map.get(key);
      if (hit) {
        hit.count += 1;
        hit.rounds.push(r.round);
      } else {
        map.set(key, { grid: r.grid, finish: r.finish, count: 1, rounds: [r.round] });
      }
    }
    return [...map.values()].sort((a, b) => a.grid - b.grid || a.finish - b.finish);
  }, [rows]);

  const left = flowLayout(
    flows.map((f) => ({ pos: f.grid, count: f.count })),
    H - padT - padB,
    gap
  );
  const right = flowLayout(
    flows.map((f) => ({ pos: f.finish, count: f.count })),
    H - padT - padB,
    gap
  );

  const cursorL = new Map<number, number>();
  const cursorR = new Map<number, number>();
  const ribbons = flows.map((f) => {
    const ln = left.nodes.find((n) => n.pos === f.grid);
    const rn = right.nodes.find((n) => n.pos === f.finish);
    const lh = f.count * left.scale;
    const rh = f.count * right.scale;
    const ly = padT + (ln?.y ?? 0) + (cursorL.get(f.grid) ?? 0);
    const ry = padT + (rn?.y ?? 0) + (cursorR.get(f.finish) ?? 0);
    cursorL.set(f.grid, (cursorL.get(f.grid) ?? 0) + lh);
    cursorR.set(f.finish, (cursorR.get(f.finish) ?? 0) + rh);
    const x0 = leftX + nodeW;
    const x1 = rightX;
    const cx = (x0 + x1) / 2;
    return {
      ...f,
      key: `${f.grid}-${f.finish}`,
      d: `M ${x0} ${ly} C ${cx} ${ly}, ${cx} ${ry}, ${x1} ${ry} L ${x1} ${ry + rh} C ${cx} ${ry + rh}, ${cx} ${ly + lh}, ${x0} ${ly + lh} Z`,
      colour: gridBandColour(f.grid),
    };
  });

  const roundLabel = (roundNumbers: number[]) => {
    const first = rounds.find((r) => r.round === roundNumbers[0]);
    return first ? `${countryCode(first.country)} R${first.round}` : `R${roundNumbers[0]}`;
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full select-none"
        onPointerLeave={(e) => {
          if (e.pointerType === "touch") return;
          setTip(null);
          setActive(null);
        }}
      >
        {ribbons.map((r, i) => {
          const isActive = active === r.key;
          const dim = active != null && !isActive;
          return (
            <path
              key={r.key}
              d={r.d}
              fill={r.colour}
              fillOpacity={isActive ? 1 : dim ? 0.1 : 0.55}
              stroke={isActive ? "#ffffff" : "none"}
              strokeOpacity={0.35}
              strokeWidth={0.8}
              className="f1-flow cursor-pointer transition-[fill-opacity] duration-150"
              style={{ animationDelay: `${Math.min(600, i * 40)}ms` }}
              onPointerEnter={(ev) => {
                const box = ev.currentTarget.getBoundingClientRect();
                setActive(r.key);
                setTip({
                  grid: r.grid,
                  finish: r.finish,
                  count: r.count,
                  label: roundLabel(r.rounds),
                  left: box.right - 40,
                  top: box.top + box.height / 2,
                });
              }}
              onPointerDown={(ev) => {
                const box = ev.currentTarget.getBoundingClientRect();
                setActive(r.key);
                setTip({
                  grid: r.grid,
                  finish: r.finish,
                  count: r.count,
                  label: roundLabel(r.rounds),
                  left: box.right - 40,
                  top: box.top + box.height / 2,
                });
              }}
            />
          );
        })}

        {left.nodes.map((n) => (
          <g key={`l-${n.pos}`} pointerEvents="none">
            <rect x={leftX} y={padT + n.y} width={nodeW} height={Math.max(4, n.h)} rx={2} fill={gridBandColour(n.pos)} />
            <text
              x={leftX - 8}
              y={padT + n.y + n.h / 2 + 3.2}
              textAnchor="end"
              fontSize={9}
              fontWeight={700}
              fill={gridBandColour(n.pos)}
            >
              P{n.pos}
            </text>
          </g>
        ))}
        {right.nodes.map((n) => (
          <g key={`r-${n.pos}`} pointerEvents="none">
            <rect
              x={rightX}
              y={padT + n.y}
              width={nodeW}
              height={Math.max(4, n.h)}
              rx={2}
              fill={gridBandColour(n.pos)}
            />
            <text
              x={rightX + nodeW + 8}
              y={padT + n.y + n.h / 2 + 3.2}
              fontSize={9}
              fontWeight={700}
              fill={gridBandColour(n.pos)}
            >
              P{n.pos}
            </text>
          </g>
        ))}

        <text x={leftX + nodeW / 2} y={10} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={AXIS}>
          GRID
        </text>
        <text x={rightX + nodeW / 2} y={10} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={AXIS}>
          FINISH
        </text>
      </svg>

      {tip && (
        <ChartTooltip anchorX={tip.left} anchorY={tip.top} width={212}>
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: gridBandColour(tip.grid) }} />
            <span className="truncate text-[13px] font-bold leading-none text-white">{name ?? "Start to finish"}</span>
            <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-white/40">{tip.label}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="text-[12px] font-bold" style={{ color: gridBandColour(tip.grid) }}>
              P{tip.grid}
            </span>
            <span className="text-[11px] text-white/35">to</span>
            <span className="text-[12px] font-bold" style={{ color: gridBandColour(tip.finish) }}>
              P{tip.finish}
            </span>
            <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums text-white">
              {tip.count} {tip.count === 1 ? "race" : "races"}
            </span>
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

/** Signed per-round bar (head-to-head points gap). */
export function GapBars({
  values,
  colour,
  rounds = [],
  aCode,
  bCode,
}: {
  values: number[];
  colour: string;
  /** Round metadata so each bar can name its Grand Prix on hover. */
  rounds?: RoundAxisEntry[];
  aCode?: string;
  bCode?: string;
}) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const H = 120;
  const W = 420;
  const zero = H / 2;
  const slot = (W - 24) / Math.max(1, values.length);
  const [tip, setTip] = useState<{ index: number; value: number; left: number; top: number } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useChartDismiss(svgRef, () => {
    setTip(null);
    setActive(null);
  });
  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Points gap per round"
        className="h-auto w-full select-none"
        onPointerLeave={(e) => {
          if (e.pointerType === "touch") return;
          setTip(null);
          setActive(null);
        }}
      >
        <line x1={10} x2={W - 10} y1={zero} y2={zero} stroke={AXIS} strokeOpacity={0.35} />
        {values.map((v, i) => {
          const h = (Math.abs(v) / max) * (H / 2 - 12);
          const isActive = active === i;
          return (
            <g key={i}>
              <rect
                x={12 + i * slot}
                y={v >= 0 ? zero - h : zero}
                width={Math.max(3, slot - 2)}
                height={Math.max(1, h)}
                rx={1}
                fill={v >= 0 ? colour : "#f87171"}
                opacity={active != null && !isActive ? 0.4 : 0.9}
                stroke={isActive ? "#ffffff" : "none"}
                strokeWidth={0.8}
                strokeOpacity={0.7}
                className="f1-grow transition-opacity duration-150"
                style={{ animationDelay: `${Math.min(520, i * 22)}ms` }}
              />
              {/* Slot-sized hit area so tiny bars still answer the pointer. */}
              <rect
                x={12 + i * slot}
                y={4}
                width={Math.max(6, slot - 2)}
                height={H - 8}
                fill="transparent"
                className="cursor-pointer"
                onPointerEnter={(ev) => {
                  const box = ev.currentTarget.getBoundingClientRect();
                  setActive(i);
                  setTip({ index: i, value: v, left: box.left + box.width / 2, top: box.top });
                }}
                onPointerDown={(ev) => {
                  const box = ev.currentTarget.getBoundingClientRect();
                  setActive(i);
                  setTip({ index: i, value: v, left: box.left + box.width / 2, top: box.top });
                }}
              />
            </g>
          );
        })}
      </svg>

      {tip && (
        <ChartTooltip anchorX={tip.left} anchorY={tip.top} width={200}>
          <TooltipHeader
            country={rounds[tip.index]?.country}
            round={rounds[tip.index]?.round ?? tip.index + 1}
            fallback="Points gap"
          />
          <div className="flex items-center gap-2 px-3 py-2">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tip.value >= 0 ? colour : "#f87171" }} />
            <span className="truncate text-[12px] text-white/65">
              {tip.value === 0
                ? "Level on points"
                : tip.value > 0
                  ? `${aCode ?? "Driver 1"} ahead`
                  : `${bCode ?? "Driver 2"} ahead`}
            </span>
            <span className="ml-auto shrink-0 text-[12px] font-bold tabular-nums text-white">
              {Math.abs(tip.value)} pts
            </span>
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}
